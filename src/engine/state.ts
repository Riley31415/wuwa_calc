/**
 * The fight's own state: a `Pool` of held gear, the per-member `TeamMember` that owns three of
 * them, and the `State` that owns the team. Everything here is data plus the stack arithmetic
 * over it — no phase running, no ambient pointers of its own.
 */
import { Stat, EnemyStat, Attribute, WeaponType, Tier, Type1, Type2, Cast, Node, Scaling, scopedStat, tagBand, STAT_COUNT, TYPE2_BITS } from "./stats.js";
import type { Tag, StatKey } from "./stats.js";
import type { Rotation, Action, ActionGroup, ActionDef, ActionField } from "./rotation.js";
import { ctx, dryLog, undoDry, noteMutation, recordApplied, recordConsumed } from "./runtime.js";
import { Gear, Buff, Debuff, Resonator, Loadout, Matrix, Mainslot, Weapon, PHASE_COUNT } from "./gear.js";

/** One stat contribution, tagged with what granted it and who was acting — `addStat()` fills
 *  `source`/`owner` in automatically from the "current" pointers, so no call site anywhere has
 *  to pass them. Feeds the report's own hover-trace panels (display.ts's `ctx.tracing()`/`explain()`). */
export interface StatEntry { stat: StatKey; value: number; source: string; owner: string | null; }

/** One buff held on a member, as the report's own resonator popover shows it: its name (with a
 *  stack count where it stacks) and whose kit put it there (see `State.sourceOf`). */
export interface HeldBuff { name: string; source: string; }

/** Shared stand-ins for the report-only fields of an untraced snapshot (see `ctx.tracing`) — one
 *  shared value each rather than a fresh allocation per action. Nothing on the untraced path reads
 *  either: the held-buff rosters and the forte gauges are both detail-page-only (display.ts). */
export const EMPTY_HELD: HeldBuff[] = [];
export const EMPTY_FORTE: [number, number, number, number, number] = [0, 0, 0, 0, 0];
export const EMPTY_FIELDS: ActionField[] = [];

/** A member's own RealEnergy ceiling — clamped to their resonator's own maxEnergy, floored at 0. */
export const capEnergy = (member: TeamMember, value: number): number =>
  Math.min(member.resonator?.maxEnergy ?? 0, Math.max(0, value));

/**
 * `effective` is indexed by the stat itself: `Stat` and `EnemyStat` are numeric and share one index
 * space (stats.ts), so a contribution is one add in place with no lookup at all. `pushStat()`
 * writes the bare stat there and puts the *scoped* key in `totals` instead, so this array is
 * closed and tiny (`STAT_COUNT`, plus the two extra slots below) rather than open-ended.
 */

/** One slot past the real stats, holding the part of `Stat.Amp` that came in scoped to a `Type2`.
 *  Dot damage is amplified by that part alone — a buff scoped to Aero Erosion pays into an Aero
 *  Erosion tick, plain or element-scoped amplification does not (see damage.ts's own `ampFactor`)
 *  — and by the time the formula reads `Stat.Amp` every matching scope has already been summed
 *  into it, so the split has to happen here, where the tag is still in hand. Not a `Stat` of its
 *  own: nothing grants it, `pushStat()` derives it from the ordinary `addStat(Stat.Amp, n, tag)`
 *  a kit already writes. */
export const TYPE2_AMP_INDEX = STAT_COUNT;
/** The slot after that: the part of `Stat.DmgBonus` that came in scoped to `Type1.Basic` — what
 *  a kit means by "Basic Attack DMG Bonus from every source" (Rebecca's S6 converts 40% of it).
 *  Kept the same way as the amp split above: derived by `pushStat()` off the ordinary tagged
 *  `addStat`, only on an action the scope actually matched, and never granted directly. */
export const BASIC_DMG_BONUS_INDEX = STAT_COUNT + 1;

/** What every action's own `effective` starts as — cloned per action with `.slice()`, which is one
 *  memcpy of ~36 doubles. A plain array rather than a `Float64Array`: a typed array is a separate
 *  buffer object with its own header, and allocating one per action was the single most expensive
 *  line in `evaluate()`. The one fractional write below (and its undo) is deliberate — V8 fixes an
 *  array's element kind once it widens, and a clone inherits it, so every copy is a double array
 *  from the start rather than transitioning from integers on its first real contribution. */
export const ZERO_STATS: number[] = new Array<number>(STAT_COUNT + 2).fill(0);
ZERO_STATS[0] = 0.5; ZERO_STATS[0] = 0;

/**
 * One pool of held Gear — a member's own, the team-wide pool, or the enemy's — with the stack
 * count of each, as copy-on-write arrays.
 *
 * `list`, `counts` and the per-phase `hooks` lists are never written in place: a grant or spend
 * replaces the ones it touches with fresh copies (~20 entries). That is what lets `evaluate()`
 * "freeze" a phase's roster for free — `capture()` just keeps the references it read, and a gear
 * that revokes itself (or grants another) mid-phase swaps new arrays in under the pool without
 * moving the ground under whatever the phase still has to visit. The alternative — rebuilding one
 * merged roster out of three Maps every time any of them changed, which a buff granted-and-dropped
 * on its own action makes about once per action — was the single most expensive thing left in
 * the engine.
 */
/** Bumped whenever a Gear with `constantStats` enters or leaves any pool — which is team setup,
 *  and then essentially never — so every slot's `constBase` cache can tell it is stale. */

export interface PoolSnapshot { list: Gear[]; counts: number[]; hooks: number[][]; globalHooks: Gear[]; at: Map<Gear, number>; dead: number }
export interface MemberSnapshot { pool: PoolSnapshot; globalHooks: Set<Gear>; forte: number[]; concerto: number }

class Pool {
  /** Every Gear granted here, in the order it was first granted — a Map's own order, so hooks run
   *  in the same sequence they always did. A dropped Gear *stays in place*: the phase lists stop
   *  naming its position and `at` forgets it, so nothing reaches it, and its slot is reclaimed by
   *  `compact()` once the dead outnumber the live. Positions therefore never shift on a drop,
   *  which is what keeps a drop down to filtering the one or two phase lists the Gear was in. A
   *  Gear dropped and re-granted goes to the end, as it would in a Map. */
  list: Gear[] = [];
  /** The stack count of `list[i]`. */
  counts: number[] = [];
  /** For each phase (`PHASE_*`, in bit order), the positions in `list` of the live Gear that has
   *  that hook — so a phase visits the two or three it will actually call rather than probing all
   *  ~20 for a hook they mostly haven't got. */
  hooks: number[][] = Array.from({ length: PHASE_COUNT }, () => []);
  /** The live Gear here with an `updateGlobalFn`, in order — what `evaluate()`'s updateGlobal
   *  phase walks for the team-wide and enemy pools. */
  globalHooks: Gear[] = [];
  /** Where each live Gear sits in `list`. Written in place — nothing iterates it — except while a
   *  `snapshot()` is live (`ctx.guarded`), where the first write swaps in a copy (`write()`) so
   *  `restore()` can put the original back untouched. */
  private at = new Map<Gear, number>();
  private atCloned = false;
  /** How many entries of `list` are dropped Gear. */
  private dead = 0;

  has(gear: Gear): boolean { return this.at.has(gear); }
  /** Everything a dry run can move, by reference — the arrays are never written in place, and
   *  `at` is cloned before a ctx.guarded write ever touches it — for `restore()` to hand back. */
  snapshotInto(s: PoolSnapshot): void {
    s.list = this.list; s.counts = this.counts; s.hooks = this.hooks; s.globalHooks = this.globalHooks; s.at = this.at; s.dead = this.dead;
  }
  restore(s: PoolSnapshot): void {
    this.list = s.list; this.counts = s.counts; this.hooks = s.hooks; this.globalHooks = s.globalHooks; this.at = s.at; this.dead = s.dead;
    this.atCloned = false;
  }
  /** Ahead of a write to `at`. Under a dry run the write is journaled for `undoDry()` to reverse;
   *  otherwise, while a snapshot is live, the first write swaps in a copy so the snapshot's own
   *  map stays as it was. */
  private write(gear: Gear): void {
    if (ctx.dryRun) dryLog.push(this.at, gear, this.at.get(gear));
    else if (ctx.guarded && !this.atCloned) { this.at = new Map(this.at); this.atCloned = true; }
  }
  get(gear: Gear): number | undefined {
    const i = this.at.get(gear);
    return i === undefined ? undefined : this.counts[i];
  }
  /** Every live Gear, in order — for the report's popover; the phases read `hooks` instead. */
  gears(): Gear[] { return this.list.filter((g, i) => this.at.get(g) === i); }

  set(gear: Gear, n: number): void {
    const i = this.at.get(gear);
    if (i !== undefined) {
      const counts = this.counts.slice();
      counts[i] = n;
      this.counts = counts;
      return;
    }
    const k = this.list.length;
    this.write(gear);
    this.at.set(gear, k);
    const list = this.list.slice(), counts = this.counts.slice();
    list.push(gear); counts.push(n);
    this.list = list; this.counts = counts;
    if (gear.hookMask) {
      const hooks = this.hooks.slice();
      for (let mask = gear.hookMask, p = 0; mask; mask >>= 1, p++) {
        if (!(mask & 1)) continue;
        const phase = hooks[p]!.slice();
        phase.push(k);
        hooks[p] = phase;
      }
      this.hooks = hooks;
    }
    if (gear.updateGlobalFn) this.globalHooks = [...this.globalHooks, gear];
    if (gear.constantStatsFn) ctx.constVersion++;
  }
  delete(gear: Gear): void {
    const i = this.at.get(gear);
    if (i === undefined) return;
    this.write(gear);
    this.at.delete(gear);
    if (gear.constantStatsFn) ctx.constVersion++;
    if (gear.hookMask) {
      const hooks = this.hooks.slice();
      for (let mask = gear.hookMask, p = 0; mask; mask >>= 1, p++) if (mask & 1) hooks[p] = hooks[p]!.filter((k) => k !== i);
      this.hooks = hooks;
    }
    if (gear.updateGlobalFn) this.globalHooks = this.globalHooks.filter((g) => g !== gear);
    // rarely: the dead cost nothing but their slot, so this only bounds how far `list` outgrows
    // the ~20 live entries it describes
    if (++this.dead > 32) this.compact();
  }
  /** Squeeze the dropped entries out of `list`/`counts` and renumber everything after them. */
  private compact(): void {
    const list: Gear[] = [], counts: number[] = [];
    const hooks: number[][] = Array.from({ length: PHASE_COUNT }, () => []);
    for (let i = 0; i < this.list.length; i++) {
      const gear = this.list[i]!;
      if (this.at.get(gear) !== i) continue;
      const k = list.length;
      this.write(gear);
      this.at.set(gear, k);
      list.push(gear); counts.push(this.counts[i]!);
      for (let mask = gear.hookMask, p = 0; mask; mask >>= 1, p++) if (mask & 1) hooks[p]!.push(k);
    }
    this.list = list; this.counts = counts; this.hooks = hooks; this.dead = 0;
  }
}

/** Where every Gear's mutable facts actually live — never on the Gear itself. */
export class TeamMember {
  name: string;
  /** Whichever Resonator is actually equipped here — set once, by Resonator's own combatStart,
   *  the moment it's equip()-ped. Attribute/energy/name all live on it, not duplicated here; null
   *  only in the brief window between constructing a State (from bare names) and equip()ping
   *  each member's own Resonator. */
  resonator: Resonator | null = null;
  /** Whichever Mainslot echo is equipped here — cached by `equip()` rather than re-found by
   *  scanning this member's whole held set every time an ECHO_* marker comes up (see
   *  `run()`). Set once at team setup, like `resonator` above. */
  mainslot: Mainslot | null = null;
  /** Generic forte gauges — a resonator assigns its own meaning onto whichever fits its kit
   *  (Jingran's Qi is forte 1, his Mingfire is forte 2). Real numeric bars, not stacking Buffs:
   *  nothing here caps at a Buff's own maxStacks, and there's no revoke-at-0 — a kit clamps its
   *  own ceiling itself (see `setForte()`/`addForte()`). Five slots, matching stats.ts's own
   *  Resource.Forte1-5. */
  forte: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  /** Running totals, banked automatically by evaluate() itself off however much AddEnergy/
   *  AddConcerto this action's own held Gear contributed (see `AddEnergy`/`AddConcerto` above) —
   *  no kit ever adds to these directly, the same way none adds to `forte` by calling addStat(). */
  energy = 0;
  concerto = 0;
  /** A second, parallel energy counter for the ER-requirement estimate (the detail page's own
   *  Energy Requirements table) — unlike `energy` above, it starts a fight already filled (set to
   *  `maxEnergy` by Resonator's own combatStart) and only resets on a `resetEnergy`-marked
   *  Liberation cast, not on every outro. Same gain (and the same maxEnergy ceiling) as `energy`,
   *  plus half of every *other* member's own gain (see `evaluate()`). */
  realEnergy = 0;
  stacks = new Pool();
  /** Exactly the gear in `stacks` that declares an `updateGlobalFn`, kept in lockstep by the four
   *  mutators below. `evaluate()` walks every slot's own global hooks on *every* action, and only
   *  about one gear in twenty-five has one — scanning `stacks` for them meant ~33 iterator steps
   *  per slot per action to reach one or two. Insertion order matches `stacks`' own (both are
   *  written in the same call, and neither a re-`set` nor a re-`add` moves an existing entry), so
   *  the hooks still run in the order they always did. */
  globalHooks = new Set<Gear>();
  /** Whatever was `equip()`-ped onto this member at team setup — their resonator and its talents,
   *  weapon, mainslot echo, sonata pieces, mainstat/substat rolls. Held in `stacks` like anything
   *  else (that's how their applyStats() runs), but it's gear, not a buff their kit put up, so the
   *  report's own "what's on this resonator" panel leaves it out (see `heldLocal` in evaluate()).
   *  `equip()` is the only thing that writes here, and it's the only way gear is ever granted. */
  equipped = new Set<Gear>();
  entries: StatEntry[] = [];
  /** Running sum per *scoped* stat key ("Dmg Bonus:Fusion" kept apart from "Dmg Bonus"), kept in
   *  lockstep with `entries` (same push site in `addStat()`, same reset in `evaluate()`). Only the
   *  report's own trace panels read this, so it's filled on the traced path only — `get()` and the
   *  damage formula both read `effective` below instead. */
  totals = new Map<StatKey, number>();
  /** Running sum per stat with every scope *that matches the action being evaluated* already
   *  folded in — so `get(Stat.DmgBonus)` on a Fusion Basic Attack is one read, not a re-sum of
   *  "Dmg Bonus" + "Dmg Bonus:Fusion" + "Dmg Bonus:Basic" behind three freshly-built key strings.
   *  Written by `pushStat()`, which knows the tag before it's been concatenated into a key and can
   *  test it against the action's own tags directly. Indexed by `STAT_INDEX`, not keyed by the
   *  stat string. Replaced (not cleared) each action, so a snapshot can keep the one it was built
   *  with at zero copying cost. */
  effective: number[] = ZERO_STATS.slice();
  /** What every held Gear's `constantStats` adds up to for this slot, per action tag word (the
   *  scopes that match), in `effective`'s own shape — built the first time each tag word is seen
   *  and added into `effective` in one pass every action after (see `evaluate()`). Cleared when
   *  `ctx.constVersion` moves on. */
  constBase = new Map<number, number[]>();
  constBaseVersion = -1;
  /** Main-stat variants to score alongside this member's own build (solver.ts's own
   *  `scoreMainstats()`): the held main-stat Buff each stands in for, the alternatives, and per
   *  alternative the same per-tag-word constant base `constBase` keeps for the real one. Every
   *  action this member takes is then re-scored once per variant (see `evaluate()`) — nothing else
   *  in the fight changes, since a main stat only ever feeds its wearer. */
  variantOf: Gear | null = null;
  variants: Gear[] = [];
  variantBase: Map<number, number[]>[] = [];
  /** Set per variant when its dry re-run would have changed the fight — a mutation the real build
   *  didn't make, or a resource stat that banks differently — so its scores can't be trusted and
   *  the solver runs it for real instead. */
  variantUnsafe: boolean[] = [];

  constructor(name: string) { this.name = name; }

  stacksOf(gear: Gear): number { return this.stacks.get(gear) ?? 0; }
  isHeld(gear: Gear): boolean { return this.stacks.has(gear); }

  /* The four mutators below write the pool only when it actually ends up different — a Pool
   * write is a copy (see `Pool`), and a kit that re-grants a buff it already holds at full stacks
   * (`applySelf(BUFF, 1)` every action, the commonest shape there is) would otherwise copy the
   * counts for nothing on most actions. */
  addStack(gear: Gear, n = 1): number {
    noteMutation(gear.id, n);
    if (!ctx.dryRun) recordApplied(gear, n);
    const next = Math.min(gear.maxStacks, this.stacksOf(gear) + n);
    // held-at-`next` already, so the pool is what it would be written to
    if (this.stacks.get(gear) === next) return next;
    this.stacks.set(gear, next);
    if (gear.updateGlobalFn) { this.writeHooks(gear); this.globalHooks.add(gear); }
    return next;
  }
  removeStack(gear: Gear, n = 1): number {
    noteMutation(gear.id, -n);
    const next = Math.max(0, this.stacksOf(gear) - n);
    if (next === 0) {
      if (!this.stacks.has(gear)) return 0;
      this.stacks.delete(gear);
      this.writeHooks(gear); this.globalHooks.delete(gear);
      return 0;
    }
    if (this.stacks.get(gear) === next) return next;
    this.stacks.set(gear, next);
    return next;
  }
  setStacks(gear: Gear, n: number): number {
    noteMutation(gear.id, 1e6 + n);
    if (!ctx.dryRun) recordApplied(gear, n - this.stacksOf(gear));
    const next = Math.max(0, Math.min(gear.maxStacks, n));
    if (next === 0) {
      if (!this.stacks.has(gear)) return 0;
      this.stacks.delete(gear);
      this.writeHooks(gear); this.globalHooks.delete(gear);
      return 0;
    }
    if (this.stacks.get(gear) === next) return next;
    this.stacks.set(gear, next);
    if (gear.updateGlobalFn) { this.writeHooks(gear); this.globalHooks.add(gear); }
    return next;
  }
  revoke(gear: Gear): void {
    noteMutation(gear.id, -1e6);
    if (!this.stacks.has(gear)) return;
    this.stacks.delete(gear);
    this.writeHooks(gear); this.globalHooks.delete(gear);
  }

  /** `globalHooks` is written in place — except while a snapshot is live (`ctx.guarded`), where the
   *  first write swaps in a copy so `restore()` can hand the original back (see `Pool.write()`). */
  private hooksCloned = false;
  private writeHooks(gear: Gear): void {
    if (ctx.dryRun) dryLog.push(this.globalHooks, gear, this.globalHooks.has(gear));
    else if (ctx.guarded && !this.hooksCloned) { this.globalHooks = new Set(this.globalHooks); this.hooksCloned = true; }
  }
  /** Everything of this member's a dry run can move (see `evaluate()`'s variants). */
  snapshotInto(s: MemberSnapshot): void {
    this.stacks.snapshotInto(s.pool);
    s.globalHooks = this.globalHooks;
    for (let i = 0; i < 5; i++) s.forte[i] = this.forte[i]!;
    s.concerto = this.concerto;
  }
  restore(s: MemberSnapshot): void {
    this.stacks.restore(s.pool);
    this.globalHooks = s.globalHooks; this.hooksCloned = false;
    for (let i = 0; i < 5; i++) this.forte[i] = s.forte[i]!;
    this.concerto = s.concerto;
  }

  total(stat: StatKey): number {
    return this.totals.get(stat) ?? 0;
  }
}

/** A team: several Slots, one active at a time, plus team-wide (global) Gear held once rather
 *  than per-slot — the "ticks for whoever's acting" mechanism the old engine's GlobalBuff was. */
export class State {
  slots: TeamMember[];
  active = 0;
  /** Which way the next Outro hands the field over: +1 for the ordinary handoff to the next
   *  resonator in team order, -1 for the outro closing a DOUBLE_INTRO section (rotation.ts). The scheduler
   *  sets it right before the outro is evaluated and puts it back to +1 straight after, so a
   *  kit-queued outro — or any other path into `evaluate()` — always advances forward. */
  outroDir: 1 | -1 = 1;
  globalStacks = new Pool(); // use Buff here? how are maxstacks even handled?
  /** Debuffs placed on the enemy rather than held by any resonator — mechanically identical to
   *  `globalStacks` (ticks on every slot's own turn regardless of who's acting), kept as its own
   *  map purely so the resonator popover can bucket it into its own "Enemy debuffs" section
   *  instead of mixing it into "Global buffs" — a real distinction to the report, not just
   *  formatting (see `buffsPopover` in index.ts). */
  /** The enemy itself, as a member of nobody's team: the dummy Tune Break resonator, its Base
   *  Resistance and the break's own machinery are `equipEnemy()`-ped onto it at setup, the way a
   *  real member's kit and gear are `equip()`-ped. Its pool *is* `enemyStacks` below, so what is
   *  equipped here runs in the enemy phase beside every debuff a kit inflicts. */
  enemy = new TeamMember(""); // named by the enemy Resonator as it is equipped
  enemyStacks = this.enemy.stacks; // TODO change Gear to Debuff
  /** Raised caps for enemy debuffs, kept beside the stack counts: the effective max of any enemy
   *  debuff is its own declared maxStacks plus this entry. Independent of `enemyStacks`, so a cap
   *  can be raised before the debuff is ever applied (kits do it at combatStart). */
  enemyMaxIncrease = new Map<Gear, number>(); // TODO change Gear to Debuff
  /** Which Gear has already paid an increase into `enemyMaxIncrease`, by name and per debuff.
   *  Every kit that raises a cap says the effect isn't stackable, but the trigger is usually
   *  "on hit" rather than once — so a source that has already raised this debuff's cap is
   *  ignored the second time, while a second kit raising the same cap still counts. */
  enemyMaxSources = new Map<Gear, Set<string>>(); // TODO change Gear to Debuff
  outroQueue: Buff[] = [];
  /** Casts waiting for the next Intro — queued behind it, on the slot that queued them, the
   *  moment an Intro-cast action is evaluated (see `queueOnIntro()`). */
  introQueue: { action: Action; slot: number; by: HeldBuff | null; event: boolean }[] = [];
  /** Off-tune buildup — the enemy's own bar, not any one member's, banked automatically by
   *  evaluate() off whichever held Gear contributed AddOfftune this action, same as
   *  TeamMember's own energy/concerto. */
  offtune = 0;
  /** Whose kit each piece of Gear ultimately came from, by member name.
   *
   *  Gear equipped at setup is sourced to whoever equipped it. Everything else inherits: a buff
   *  granted while another Gear's own updateBuffs() is running is that Gear's doing, so it carries
   *  that Gear's source rather than the name of whichever member happened to be on field when it
   *  landed. Shorekeeper's echo granting "Fallacy of No Return" onto Iuno stays sourced to
   *  Shorekeeper; Iuno's domain stacking Blessing onto Jingran stays sourced to Iuno.
   *
   *  Lives on the State, not the Gear: a Gear is a module-level singleton shared by every team,
   *  so writing to it would leak one team's attribution into another's. */
  sourceOf = new Map<Gear, string>();

  /** The three fight snapshots `evaluate()` takes around a varied action — before the stat phases,
   *  after them, and after banking — made once, the first time this team needs them. */
  snapshots: [FightSnapshot, FightSnapshot, FightSnapshot] | null = null;

  constructor(names: string[]) { this.slots = names.map((n) => new TeamMember(n)); }
  get slot(): TeamMember { return this.slots[this.active]!; }
  slotByName(name: string): TeamMember | undefined { return this.slots.find((s) => s.name === name); }
  /** Whichever TeamMember currently holds this Resonator — what addBuff()/removeBuff() resolve
   *  a resonator reference against. Throws rather than returning undefined: a kit reaching for
   *  another resonator by reference is asserting they're on this team, and a silent no-op on a
   *  typo'd or absent one would be a much worse bug to chase than a thrown error. */
  memberOf(resonator: Resonator): TeamMember {
    const member = this.slots.find((s) => s.resonator === resonator);
    if (!member) throw new Error(`${resonator.name} is not on this team`);
    return member;
  }

  stacksOfGlobal(gear: Gear): number { return this.globalStacks.get(gear) ?? 0; }
  addStackGlobal(gear: Gear, n = 1): number {
    noteMutation(gear.id, n);
    const next = Math.min(gear.maxStacks, this.stacksOfGlobal(gear) + n);
    if (!ctx.dryRun) recordApplied(gear, n);
    if (this.globalStacks.get(gear) === next) return next;
    this.globalStacks.set(gear, next);
    return next;
  }
  removeStackGlobal(gear: Gear, n = 1): number {
    noteMutation(gear.id, -n);
    const next = Math.max(0, this.stacksOfGlobal(gear) - n);
    if (next === 0) {
      if (!this.globalStacks.has(gear)) return 0;
      this.globalStacks.delete(gear);
      return 0;
    }
    if (this.globalStacks.get(gear) === next) return next;
    this.globalStacks.set(gear, next);
    return next;
  }
  setStacksGlobal(gear: Gear, n: number): number {
    noteMutation(gear.id, 1e6 + n);
    const next = Math.max(0, Math.min(gear.maxStacks, n));
    if (!ctx.dryRun) recordApplied(gear, n - this.stacksOfGlobal(gear));
    if (next === 0) {
      if (!this.globalStacks.has(gear)) return 0;
      this.globalStacks.delete(gear);
      return 0;
    }
    if (this.globalStacks.get(gear) === next) return next;
    this.globalStacks.set(gear, next);
    return next;
  }
  revokeGlobal(gear: Gear): void {
    noteMutation(gear.id, -1e6);
    if (!this.globalStacks.has(gear)) return;
    this.globalStacks.delete(gear);
  }

  stacksOfEnemy(gear: Gear): number { return this.enemyStacks.get(gear) ?? 0; }
  enemyMax(gear: Gear): number { return gear.maxStacks + (this.enemyMaxIncrease.get(gear) ?? 0); }
  increaseMaxEnemy(gear: Gear, n: number, source: string): void {
    noteMutation(gear.id, 2e6 + n);
    if (ctx.dryRun) return;
    let sources = this.enemyMaxSources.get(gear);
    if (!sources) this.enemyMaxSources.set(gear, (sources = new Set()));
    if (sources.has(source)) return;
    sources.add(source);
    this.enemyMaxIncrease.set(gear, (this.enemyMaxIncrease.get(gear) ?? 0) + n);
  }
  addStackEnemy(gear: Gear, n = 1): number {
    noteMutation(gear.id, n);
    const next = Math.min(this.enemyMax(gear), this.stacksOfEnemy(gear) + n);
    if (!ctx.dryRun) recordApplied(gear, n);
    if (this.enemyStacks.get(gear) === next) return next;
    this.enemyStacks.set(gear, next);
    return next;
  }
  removeStackEnemy(gear: Gear, n = 1): number {
    noteMutation(gear.id, -n);
    const next = Math.max(0, this.stacksOfEnemy(gear) - n);
    if (next === 0) {
      if (!this.enemyStacks.has(gear)) return 0;
      this.enemyStacks.delete(gear);
      return 0;
    }
    if (this.enemyStacks.get(gear) === next) return next;
    this.enemyStacks.set(gear, next);
    return next;
  }
  setStacksEnemy(gear: Gear, n: number): number {
    noteMutation(gear.id, 1e6 + n);
    const next = Math.max(0, Math.min(this.enemyMax(gear), n));
    if (!ctx.dryRun) recordApplied(gear, n - this.stacksOfEnemy(gear));
    if (next === 0) {
      if (!this.enemyStacks.has(gear)) return 0;
      this.enemyStacks.delete(gear);
      return 0;
    }
    if (this.enemyStacks.get(gear) === next) return next;
    this.enemyStacks.set(gear, next);
    return next;
  }
  revokeEnemy(gear: Gear): void {
    noteMutation(gear.id, -1e6);
    if (!this.enemyStacks.has(gear)) return;
    this.enemyStacks.delete(gear);
  }
}

// level-100 enemy. Its flat 20% resistance to every attribute is not a constant here any more —
// it is the Tune Break enemy's own Base Resistance gear (tunebreak.ts), seven scoped -20% RES
// Reduce entries, so the res column's own trace foots to the number the formula uses.
const ENEMY_RES = 0, ENEMY_DEF_LEVEL = 100;
export const enemyDef = () => 792 + 8 * ENEMY_DEF_LEVEL;
export const enemyRes = () => ENEMY_RES;

/** The whole fight as `evaluate()` can put it back — allocated once per State (`State.snapshots`)
 *  and refilled in place, since one is taken on every varied action and an object per member per
 *  take was most of what a variant cost. */
export class FightSnapshot {
  members: MemberSnapshot[];
  global: PoolSnapshot;
  enemy: PoolSnapshot;
  offtune = 0;
  constructor(state: State) {
    const pool = (): PoolSnapshot => ({ list: [], counts: [], hooks: [], globalHooks: [], at: new Map(), dead: 0 });
    const member = (): MemberSnapshot => ({ pool: pool(), globalHooks: new Set(), forte: [0, 0, 0, 0, 0], concerto: 0 });
    this.members = state.slots.map(member);
    this.global = pool(); this.enemy = pool();
  }
  take(state: State): void {
    state.slots.forEach((m, i) => m.snapshotInto(this.members[i]!));
    state.globalStacks.snapshotInto(this.global); state.enemyStacks.snapshotInto(this.enemy);
    this.offtune = state.offtune;
  }
  restore(state: State): void {
    undoDry();
    state.slots.forEach((m, i) => m.restore(this.members[i]!));
    state.globalStacks.restore(this.global); state.enemyStacks.restore(this.enemy);
    state.offtune = this.offtune;
  }
}