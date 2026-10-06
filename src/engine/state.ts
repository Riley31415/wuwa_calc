/**
 * The fight's own state: a `Pool` of held gear, the per-member `TeamMember` that owns three of
 * them, and the `State` that owns the team. Everything here is data plus the stack arithmetic
 * over it — no phase running, no ambient pointers of its own.
 */
import { STAT_COUNT } from "./stats.js";
import type { StatKey } from "./stats.js";
import type { Action, ActionField, Cooldown } from "./rotation.js";
import type { Result, HoldWatch } from "./evaluate.js";
import { ctx, dryLog, undoDry, noteMutation, recordApplied, MEMBERS } from "./runtime.js";
import { Gear, Buff, Resonator, Mainslot, PHASE_COUNT } from "./gear.js";
import type { GlobalHook } from "./gear.js";

/** One stat contribution, tagged with what granted it and who was acting — `addStat()` fills
 *  `source`/`owner` in automatically from the "current" pointers, so no call site anywhere has
 *  to pass them. Feeds the report's own hover-trace panels (display.ts's `ctx.tracing()`/`explain()`). */
/** `gear` is what contributed the value — the same Gear `source` names, kept as the object so the
 *  report can ask what granted *it* (`State.grantedBy`). Trace-only, like the entry itself. */
export interface StatEntry { stat: StatKey; value: number; source: string; owner: string | null; gear: Gear | null; }

/** One buff held on a member, as the report's own resonator popover shows it: its name (with a
 *  stack count where it stacks) and whose kit put it there (see `State.sourceOf`). */
export interface HeldBuff {
  name: string;
  source: string;
  /** Frames this buff has left as the action resolved — 0 where it has no duration. The popover
   *  prints it as a dimmed "(Xs)" after the name. */
  left: number;
}

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

/** One slot past the real stats, holding the part of `Stat.Amp` that came in scoped to a `Subtype`.
 *  Dot damage is amplified by that part alone — a buff scoped to Aero Erosion pays into an Aero
 *  Erosion tick, plain or element-scoped amplification does not (see damage.ts's own `ampFactor`)
 *  — and by the time the formula reads `Stat.Amp` every matching scope has already been summed
 *  into it, so the split has to happen here, where the tag is still in hand. Not a `Stat` of its
 *  own: nothing grants it, `pushStat()` derives it from the ordinary `addStat(Stat.Amp, n, tag)`
 *  a kit already writes. */
export const SUBTYPE_AMP_INDEX = STAT_COUNT;
/** The slot after that: the part of `Stat.DmgBonus` that came in scoped to `Type.Basic` — what
 *  a kit means by "Basic Attack DMG Bonus from every source" (Rebecca's S6 converts 40% of it).
 *  Kept the same way as the amp split above: derived by `pushStat()` off the ordinary tagged
 *  `addStat`, only on an action the scope actually matched, and never granted directly. */
export const BASIC_DMG_BONUS_INDEX = STAT_COUNT + 1;
/** Two more after that: the parts of `Stat.CritRate` and `Stat.CritDmg` that came in scoped to a
 *  `Subtype` — the only crit a dot or tune hit reads (Hsin's S6 makes Electro Flare crit at a fixed
 *  80%/230%; everything else on the resonator's own line leaves those rows uncritting). Derived
 *  by `pushStat()` the same way as the amp split above. */
export const SUBTYPE_CRIT_RATE_INDEX = STAT_COUNT + 2;
export const SUBTYPE_CRIT_DMG_INDEX = STAT_COUNT + 3;
/** And two more: the parts of `Stat.TotalDmg` and `Stat.DamageTaken` scoped to a `Subtype` — the
 *  only "deals N% more" / "takes N% more" a dot row reads, split off exactly as the amp above. */
export const SUBTYPE_TOTAL_DMG_INDEX = STAT_COUNT + 4;
export const SUBTYPE_DAMAGE_TAKEN_INDEX = STAT_COUNT + 5;

/** One stat row: every stat plus the split slots above, indexed by the stat itself. */
export type StatRow = Float64Array;
export const STAT_ROW_LENGTH = STAT_COUNT + 6;
/** A fresh all-zero row. Untraced runs reuse each slot's rows, so only a traced run allocates per action. */
export const statRow = (): StatRow => new Float64Array(STAT_ROW_LENGTH);
/** What every action's own `effective` starts as; read-only. */
export const ZERO_STATS: StatRow = statRow();

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

export interface PoolSnapshot { list: Gear[]; counts: number[]; hooks: number[][]; phases: number; fns: (() => void)[][]; globalHooks: GlobalHook[]; at: Int32Array; dead: number; expires: number[]; nextExpiry: number; progress: number[]; ticks: number[]; ticking: number }
/** A slot's main-stat variants' constant bases for one action tag word, and per variant the
 *  indices where that base differs from the real build's — the only stats a variant's row can
 *  differ in (see `evaluate()`). */
/** A piece a variant wears (`to`) in place of one the build wears (`from`). */
export type PieceSwap = readonly [from: Gear, to: Gear];
export interface VariantBases {
  bases: StatRow[]; diffs: number[][];
  /** Every index any variant's diff holds, and per variant whether its diff moves `Stat.AddMv`. */
  union: number[]; addMv: boolean[];
}
export interface VariantAt extends VariantBases {
  /** What the last part scored under this tag word read, and each variant's damage factors there —
   *  and the one before it, for parts that take turns. */
  memo: VariantMemo | null;
  memo2: VariantMemo | null;
}
/** Each variant's damage factors (the real build's last) and whether it deals otherwise, with every
 *  input they were read off; `out` is their scores at motion value `mv`, the last one scored. */
export interface VariantMemo {
  scaling: number | null; eff: StatRow; pre: StatRow; index: number[]; value: number[]; length: number; factors: Float64Array; dealt: boolean[];
  mv: number; out: number[] | null;
  /** The constant base the finished row was built on, and whether nothing was written ahead of it. */
  base: StatRow | null; zeroPre: boolean;
}
/** A cooldown-gated press of a visit, and how many frames after the handoff it comes up. */
export interface VisitGate { cd: Cooldown; offset: number; press: string; use?: number }

export interface MemberSnapshot { pool: PoolSnapshot; castHooks: Set<GlobalHook>; hitHooks: Set<GlobalHook>; forte: number[]; concerto: number }

/** The next free `Gear.poolIdx`. */
let nextPoolIdx = 0;

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
  /** The phases whose `hooks` list is not empty, a bit each in the same order. */
  phases = 0;
  /** Beside each phase's positions, the hook each Gear there runs for it (`Gear.hookFns`, fixed once
   *  built) — so a phase calls them without reading every kind of Gear for its own. */
  fns: (() => void)[][] = Array.from({ length: PHASE_COUNT }, () => []);
  /** The live Gear here with an `updateGlobalFn`, in order — what `evaluate()`'s updateGlobal
   *  phase walks for the team-wide and enemy pools. */
  globalHooks: GlobalHook[] = [];
  /** Where each live Gear sits in `list`, plus one, by its `poolIdx` (0: not held here). Written in
   *  place — nothing iterates it — except while a `snapshot()` is live (`ctx.guarded`), where the
   *  first write swaps in a copy (`write()`) so `restore()` can put the original back untouched. */
  private at = new Int32Array(Math.max(256, nextPoolIdx * 2));
  private atCloned = false;
  /** `gear`'s position in `list`, -1 where it is not held here. */
  private pos(gear: Gear): number {
    const k = gear.poolIdx;
    return k >= 0 && k < this.at.length ? this.at[k]! - 1 : -1;
  }
  /** Room in `at` for `gear`'s index, handing it one first if it has none — a grown array is a new
   *  one, which a dry run journals so `undoDry()` puts the old one back. */
  private reach(gear: Gear): number {
    const k = gear.poolIdx >= 0 ? gear.poolIdx : (gear.poolIdx = nextPoolIdx++);
    if (k >= this.at.length) {
      const grown = new Int32Array(Math.max(k + 1, this.at.length * 2));
      grown.set(this.at);
      if (ctx.dryRun) dryLog.push(this, 0 as unknown as Gear, this.at as unknown as number);
      this.at = grown;
      // under a live snapshot the new array is already this pool's own
      if (ctx.guarded) this.atCloned = true;
    }
    return k;
  }
  undoGrow(prev: Int32Array): void { this.at = prev; }
  /** How many entries of `list` are dropped Gear. */
  private dead = 0;
  /** The fight frame `list[i]` runs out at (`State.frame` at its last grant plus its `duration`),
   *  0 for a Gear with no duration. Written in place like `at` — journaled under a dry run,
   *  cloned once while a snapshot is live (`writeExpiry()`). */
  private expires: number[] = [];
  private expiresCloned = false;
  /** The earliest of `expires` that may still be live, so the per-action expiry pass can skip a
   *  pool with nothing due. Only ever lowered eagerly; a scan recomputes it. */
  nextExpiry = Infinity;
  /** For a Gear with a `tick` (gear.ts): the frames `list[i]` has accrued toward its next tick,
   *  and how many it has fired since it was first granted. Both start at 0 on a fresh grant and
   *  ride through a refresh untouched — a re-grant extends the stand, it does not restart the
   *  cadence. Written like `expires` (`writeTick()`). */
  private progress: number[] = [];
  private ticks: number[] = [];
  private ticksCloned = false;

  has(gear: Gear): boolean { return this.pos(gear) >= 0; }

  /** Everything a dry run can move, by reference — the arrays are never written in place, and
   *  `at`/`expires` are cloned before a ctx.guarded write ever touches them — for `restore()`. */
  snapshotInto(s: PoolSnapshot): void {
    s.list = this.list; s.counts = this.counts; s.hooks = this.hooks; s.phases = this.phases; s.fns = this.fns; s.globalHooks = this.globalHooks; s.at = this.at; s.dead = this.dead;
    s.expires = this.expires; s.nextExpiry = this.nextExpiry;
    s.progress = this.progress; s.ticks = this.ticks; s.ticking = this.ticking;
  }
  restore(s: PoolSnapshot): void {
    this.list = s.list; this.counts = s.counts; this.hooks = s.hooks; this.phases = s.phases; this.fns = s.fns; this.globalHooks = s.globalHooks; this.at = s.at; this.dead = s.dead;
    ctx.poolVersion++;
    this.expires = s.expires; this.nextExpiry = s.nextExpiry;
    this.progress = s.progress; this.ticks = s.ticks; this.ticking = s.ticking;
    this.atCloned = false; this.expiresCloned = false; this.ticksCloned = false;
  }
  /** Ahead of a write to `at` — returns the index to write, and runs before `this.at` is read for
   *  it, since it may swap the array. Under a dry run the write is journaled for `undoDry()` to reverse;
   *  otherwise, while a snapshot is live, the first write swaps in a copy so the snapshot's own
   *  map stays as it was. */
  private write(gear: Gear): number {
    const k = this.reach(gear);
    if (ctx.dryRun) dryLog.push(this.at, k as unknown as Gear, this.at[k]);
    else if (ctx.guarded && !this.atCloned) { this.at = this.at.slice(); this.atCloned = true; }
    return k;
  }
  /** The same ahead of a write to `expires[i]`. */
  private writeExpiry(i: number): void {
    if (ctx.dryRun) dryLog.push(this.expires, i as unknown as Gear, this.expires[i]);
    else if (ctx.guarded && !this.expiresCloned) { this.expires = this.expires.slice(); this.expiresCloned = true; }
  }
  /** The same ahead of a write to `progress[i]`/`ticks[i]`. */
  private writeTick(i: number): void {
    if (ctx.dryRun) {
      dryLog.push(this.progress, i as unknown as Gear, this.progress[i]);
      dryLog.push(this.ticks, i as unknown as Gear, this.ticks[i]);
    } else if (ctx.guarded && !this.ticksCloned) {
      this.progress = this.progress.slice(); this.ticks = this.ticks.slice(); this.ticksCloned = true;
    }
  }
  /** Stamp `list[i]`'s expiry off the fight clock — every grant of a timed Gear refreshes it. */
  private stamp(i: number, gear: Gear): void {
    const duration = gear.durationFn ? gear.durationFn(this.counts[i]!) : gear.duration;
    if (!duration) return;
    const at = ctx.state!.frame + duration;
    this.writeExpiry(i);
    this.expires[i] = at;
    if (at < this.nextExpiry) this.nextExpiry = at;
    if (at < ctx.state!.nextExpiry) ctx.state!.nextExpiry = at;
  }
  /** Refresh a held timed Gear's expiry without changing its count — a re-grant at full stacks. */
  touch(gear: Gear): void {
    const i = this.pos(gear);
    if (i >= 0) this.stamp(i, gear);
  }
  /** Push a held timed Gear's expiry `frames` later, its count untouched — "extends its duration". */
  extend(gear: Gear, frames: number): void {
    const i = this.pos(gear);
    if (i < 0 || !this.expires[i]) return;
    this.writeExpiry(i);
    this.expires[i] += frames;
  }
  /** Frames `gear` has left, or 0 where it is untimed or not held. */
  left(gear: Gear): number {
    const i = this.pos(gear);
    if (i < 0) return 0;
    const at = this.expires[i]!;
    return at === 0 ? 0 : at - ctx.state!.frame;
  }
  /** Every live Gear whose duration has run out by frame `now`, in order — null when none has.
   *  Recomputes `nextExpiry` over what stays, so the next pass is a number compare again. */
  expired(now: number): Gear[] | null {
    if (this.nextExpiry > now) return null;
    let out: Gear[] | null = null, next = Infinity;
    for (let i = 0; i < this.list.length; i++) {
      const at = this.expires[i]!;
      if (at === 0 || this.pos(this.list[i]!) !== i) continue;
      if (at <= now) (out ??= []).push(this.list[i]!);
      else if (at < next) next = at;
    }
    this.nextExpiry = next;
    return out;
  }
  /** How many ticks `gear` has fired since it was granted, 0 where it is not held. */
  ticksOf(gear: Gear): number {
    const i = this.pos(gear);
    return i < 0 ? 0 : this.ticks[i]!;
  }
  /** Frames until `gear`'s next tick, 0 where it has no tick or is not held. */
  tickIn(gear: Gear): number {
    const i = this.pos(gear);
    if (i < 0 || !gear.tickFn) return 0;
    return gear.tickEvery!() - this.progress[i]!;
  }
  /** Run the fight clock from frame `a` to `b` over every live Gear with a tick: each accrues the
   *  span, cut short at its own expiry so the tick that falls on its last frame still fires, and
   *  fires once per `every` it crosses — a press longer than the cadence fires more than once.
   *  An `every` of 0 is the clock standing still for this span. The fires are only collected
   *  (`due`, with each tick's ordinal and the frame it falls on), for the caller to run once the
   *  pass is over: one may grant into or revoke out of this very pool. */
  /** The indices in `list` holding a Gear with a clock, rebuilt whenever `list` is replaced. */
  private tickFor: Gear[] | null = null;
  private tickIdx: number[] = [];
  /** How many live Gear here carry a clock. */
  private ticking = 0;
  /** Does a live Gear here carry a clock — `advance()` has nothing to do without. */
  hasTicks(): boolean {
    if (!this.ticking) return false;
    if (this.tickFor !== this.list) {
      this.tickFor = this.list;
      this.tickIdx = [];
      for (let i = 0; i < this.list.length; i++) if (this.list[i]!.tickFn) this.tickIdx.push(i);
    }
    return this.tickIdx.length !== 0;
  }
  advance(a: number, b: number, due: { gear: Gear; n: number; at: number }[], motionStop: number, state: State, holder: TeamMember | null, presser: TeamMember | undefined): void {
    if (!this.hasTicks()) return;
    const idx = this.tickIdx;
    for (let t = 0; t < idx.length; t++) {
      const i = idx[t]!;
      const gear = this.list[i]!;
      if (this.pos(gear) !== i) continue;
      const at = this.expires[i]!;
      // an off-field clock loses the press's motion-stopped frames
      const skip = motionStop && offFieldClock(gear, state, holder, presser) ? motionStop : 0;
      const span = (at === 0 || at >= b ? b : at) - a - skip;
      if (span <= 0) continue;
      ctx.buff = gear;
      let every = gear.tickEvery!();
      if (every <= 0) continue;
      this.writeTick(i);
      // the last tick fell `progress` frames before `a` (later by any motion stop the clock skips)
      let tick = a - this.progress[i]! + skip;
      let progress = this.progress[i]! + span;
      while (progress >= every) {
        progress -= every;
        tick += every;
        // one that falls inside time stop lands where the clock stands still
        due.push({ gear, n: ++this.ticks[i]!, at: Math.max(a, Math.round(tick)) });
        every = gear.tickEvery!();
        if (every <= 0) break;
      }
      this.progress[i] = progress;
    }
  }
  get(gear: Gear): number | undefined {
    const i = this.pos(gear);
    return i < 0 ? undefined : this.counts[i];
  }
  /** Every live Gear, in order — for the report's popover; the phases read `hooks` instead. */
  gears(): Gear[] { return this.list.filter((g, i) => this.pos(g) === i); }

  /** `refresh` is whether this write restarts a timed Gear's clock: a grant does, a spend does not
   *  — a buff that pays a stack off (Brant's S2 blasts) keeps the window it was granted with. */
  set(gear: Gear, n: number, refresh = true): void {
    const i = this.pos(gear);
    if (i >= 0) {
      const counts = this.counts.slice();
      counts[i] = n;
      this.counts = counts;
      ctx.poolVersion++;
      if (refresh) this.stamp(i, gear);
      return;
    }
    const k = this.list.length;
    const w = this.write(gear);
    this.at[w] = k + 1;
    const list = this.list.slice(), counts = this.counts.slice();
    list.push(gear); counts.push(n);
    this.list = list; this.counts = counts;
    ctx.poolVersion++;
    this.writeExpiry(k);
    this.expires[k] = 0;
    this.writeTick(k);
    this.progress[k] = 0; this.ticks[k] = 0;
    this.stamp(k, gear);
    if (gear.hookMask) {
      const hooks = this.hooks.slice(), fns = this.fns.slice();
      for (let mask = gear.hookMask, p = 0; mask; mask >>= 1, p++) {
        if (!(mask & 1)) continue;
        const phase = hooks[p]!.slice(), fn = fns[p]!.slice();
        phase.push(k);
        fn.push(gear.hookFns[p]!);
        hooks[p] = phase;
        fns[p] = fn;
      }
      this.hooks = hooks;
      this.fns = fns;
      this.phases |= gear.hookMask;
    }
    if (gear.globalEntry) this.globalHooks = [...this.globalHooks, gear.globalEntry];
    if (gear.constantStatsFn) ctx.constVersion++;
    if (gear.tickFn) this.ticking++;
  }
  delete(gear: Gear): void {
    const i = this.pos(gear);
    if (i < 0) return;
    const w = this.write(gear);
    this.at[w] = 0;
    if (gear.constantStatsFn) ctx.constVersion++;
    if (gear.tickFn) this.ticking--;
    if (gear.hookMask) {
      const hooks = this.hooks.slice(), fns = this.fns.slice();
      for (let mask = gear.hookMask, p = 0; mask; mask >>= 1, p++) {
        if (!(mask & 1)) continue;
        const at = hooks[p]!.indexOf(i);
        hooks[p] = hooks[p]!.filter((_, n) => n !== at);
        fns[p] = fns[p]!.filter((_, n) => n !== at);
        if (!hooks[p]!.length) this.phases &= ~(1 << p);
      }
      this.hooks = hooks;
      this.fns = fns;
      ctx.poolVersion++;
    }
    if (gear.globalEntry) this.globalHooks = this.globalHooks.filter((g) => g !== gear.globalEntry);
    // rarely: the dead cost nothing but their slot, so this only bounds how far `list` outgrows
    // the ~20 live entries it describes
    if (++this.dead > 32) this.compact();
  }
  /** Squeeze the dropped entries out of `list`/`counts` and renumber everything after them. */
  private compact(): void {
    const list: Gear[] = [], counts: number[] = [], expires: number[] = [], progress: number[] = [], ticks: number[] = [];
    const hooks: number[][] = Array.from({ length: PHASE_COUNT }, () => []);
    const fns: (() => void)[][] = Array.from({ length: PHASE_COUNT }, () => []);
    let phases = 0;
    for (let i = 0; i < this.list.length; i++) {
      const gear = this.list[i]!;
      if (this.pos(gear) !== i) continue;
      const k = list.length;
      const w = this.write(gear);
      this.at[w] = k + 1;
      list.push(gear); counts.push(this.counts[i]!); expires.push(this.expires[i]!);
      progress.push(this.progress[i]!); ticks.push(this.ticks[i]!);
      for (let mask = gear.hookMask, p = 0; mask; mask >>= 1, p++) {
        if (!(mask & 1)) continue;
        hooks[p]!.push(k);
        fns[p]!.push(gear.hookFns[p]!);
      }
      phases |= gear.hookMask;
    }
    // a fresh array, never the snapshot's: under a guard the old one is what `restore()` hands back
    this.list = list; this.counts = counts; this.hooks = hooks; this.phases = phases; this.fns = fns; this.dead = 0;
    ctx.poolVersion++;
    this.expires = expires; this.expiresCloned = true;
    this.progress = progress; this.ticks = ticks; this.ticksCloned = true;
  }
}

/** Where every Gear's mutable facts actually live — never on the Gear itself. */
export class TeamMember {
  name: string;
  /** Position on the team — the enemy is last (`MEMBERS - 1`). What the grant records credit by. */
  index = 0;
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
  /** Running totals, banked automatically by evaluate() itself off each press and whatever its
   *  hooks added (`addGain()`) — no kit ever writes to these directly, the same way none writes `forte`. */
  energy = 0;
  concerto = 0;
  /** Per cooldown this member has drawn on: the charges standing, and the frame the next one comes
   *  back (Infinity while full). Written only between actions and by kit hooks outside dry runs,
   *  so no fight snapshot carries it. */
  cooldowns = new Map<Cooldown, { charges: number; next: number }>();
  /** The rotation chain this member is playing now (rotation.ts's `runChain`), null outside one. */
  visitChain: object | null = null;
  /** The frame the field was last handed to this member, and the visit that handed it — a repeating
   *  schedule always follows one visit with the same next one, so that visit names this one. */
  handoffAt = -1;
  private handoffKey: object | null = null;
  /** Per handing visit, how long after the handoff each cooldown-gated press of this member's
   *  visit came up — first reached, before any wait — read at the next handoff from that visit to
   *  hold it until the press would land ready (`handoffShortfall`). */
  private gates = new Map<object, VisitGate[]>();
  private gateSeen = new Set<object>();
  /** How many times this visit has reached each gated press so far. */
  private gateUses = new Map<string, number>();
  private gatePrev: VisitGate[] = [];
  /** A second, parallel energy counter for the ER-requirement estimate (the detail page's own
   *  Energy Requirements table) — unlike `energy` above, it starts a fight already filled (set to
   *  `maxEnergy` by Resonator's own combatStart) and only resets on a `resetEnergy`-marked
   *  Liberation cast, not on every outro. Same gain (and the same maxEnergy ceiling) as `energy`,
   *  plus half of every *other* member's own gain (see `evaluate()`). */
  realEnergy = 0;
  /** The running window feeding the ER requirement (teamrun.ts's `erRollsFor`): what this member
   *  has banked since their last Liberation at the flat 100% the engine banks at, and the same
   *  gains weighted by the ER they were actually taken at. ER never multiplies `energyGain`, so
   *  the requirement is solved for afterwards rather than measured — which is also why it does not
   *  move when the spread's own ER rolls do. */
  erGain = 0;
  erGainEr = 0;
  /** ...and the flat gains in it (`addGain()`), which ER never scales. */
  erFlat = 0;
  /** The last closed window: the bar coming into that Liberation, and the two sums above as it
   *  stood. The last one, not any one — the fight is opener plus three loops off one continuous
   *  bar, so only the final loop is steady state. */
  erBefore = 0;
  erA = 0;
  erG = 0;
  /** How many `resetEnergy` Liberations this member has cast: the opening one is handed a full bar
   *  by combatStart, so it sets no requirement and opens the first real window instead. */
  libCasts = 0;
  /** The constant ER this build actually wears, stamped after equipping. A Liberation that needs
   *  more than this is one the bar never filled, and `runTeam` re-equips rather than finish a run
   *  on a build that cannot cast what its rotation lists. */
  constEr = 0;
  /** The largest requirement any of this member's Liberations has asked for so far — the opener's
   *  included, since a cast the build cannot pay for is wrong wherever in the fight it falls. */
  erWorst = 0;
  /** Every requirement this member's Liberations asked for, in order (`erWorst` is their largest):
   *  what `deriveRun` checks another constant ER against, which a constant shift leaves unmoved. */
  erWants: number[] = [];
  /** Whether a Liberation short of its bar should abandon the run for this member — set only while
   *  they have a higher ER tier left to wear. At the top there is nothing to re-equip, so the run
   *  finishes and `shortOf` (teamrun.ts) reports the shortfall instead. */
  erGuard = false;

  /** How many `everyOther()` presses (rotation.ts) this member has reached — the count that decides
   *  whether the next one plays or is skipped. One running count, not one per row, and the State
   *  is new each run, so a fight always starts on a play. */
  everyOther = 0;
  stacks = new Pool();
  /** Exactly the gear in `stacks` that declares an `updateGlobal` (`castHooks`) or a `hitGlobal`
   *  (`hitHooks`), kept in lockstep by the four mutators below. `evaluate()` walks every slot's own
   *  global hooks on *every* cast and hit, and only about one gear in twenty-five has one. Insertion
   *  order matches `stacks`' own (all are written in the same call, and neither a re-`set` nor a
   *  re-`add` moves an existing entry), so the hooks still run in the order they always did. */
  castHooks = new Set<GlobalHook>();
  hitHooks = new Set<GlobalHook>();
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
  effective: StatRow = statRow();
  /** What every held Gear's `constantStats` adds up to for this slot, per action tag word (the
   *  scopes that match), in `effective`'s own shape — built the first time each tag word is seen
   *  and added into `effective` in one pass every action after (see `evaluate()`). Cleared when
   *  `ctx.constVersion` moves on. */
  constBase = new Map<number, StatRow>();
  constBaseVersion = -1;
  /** Builds re-scored on every action alongside this member's own (`evaluate()`), each as the
   *  constant-stat pieces it wears in place of the build's: a main stat, a set's 2pc, the substat tier
   *  its ER puts it on. Nothing else in the fight changes, such a piece only ever feeding its wearer. */
  variants: PieceSwap[][] = [];
  /** Per variant, the ER rolls its tier was chosen for — checked after the run against what the
   *  requirement the run measured asks of it (teamrun.ts's `runTeam`). */
  variantRolls: number[] = [];
  variantAt = new Map<number, VariantAt>();
  /** The pieces the variants swap, by id (`variantBasesOf()`); null until read. */
  variantKey: string | null = null;
  /** Set per variant when its dry re-run would have changed the fight — a mutation the real build
   *  didn't make, or a resource stat that banks differently — so its scores can't be trusted and
   *  the solver runs it for real instead. */
  variantUnsafe: boolean[] = [];
  /** Scratch for a varied action, reused rather than allocated per action: the stats as the phases
   *  before the constant base left them, and each variant's own working copy. */
  pre: StatRow = statRow();
  post2: StatRow = statRow();
  post4: StatRow = statRow();
  variantEff: StatRow[] = [];
  /** Per variant, whether the action being evaluated re-ran its conversions dry (see `evaluate()`). */
  variantDry: boolean[] = [];

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
    // held-at-`next` already, so the pool is what it would be written to — the grant still
    // refreshes a timed buff's clock
    if (this.stacks.get(gear) === next) { this.stacks.touch(gear); return next; }
    this.stacks.set(gear, next);
    if (gear.globalEntry) this.addHook(gear.globalEntry);
    return next;
  }
  removeStack(gear: Gear, n = 1): number {
    noteMutation(gear.id, -n);
    const next = Math.max(0, this.stacksOf(gear) - n);
    if (next === 0) {
      if (!this.stacks.has(gear)) return 0;
      this.stacks.delete(gear);
      for (const d of gear.lostWithThis) this.revoke(d);
      this.dropHook(gear);
      return 0;
    }
    if (this.stacks.get(gear) === next) return next;
    this.stacks.set(gear, next, false);
    return next;
  }
  setStacks(gear: Gear, n: number): number {
    noteMutation(gear.id, 1e6 + n);
    if (!ctx.dryRun) recordApplied(gear, n - this.stacksOf(gear));
    const next = Math.max(0, Math.min(gear.maxStacks, n));
    if (next === 0) {
      if (!this.stacks.has(gear)) return 0;
      this.stacks.delete(gear);
      for (const d of gear.lostWithThis) this.revoke(d);
      this.dropHook(gear);
      return 0;
    }
    if (this.stacks.get(gear) === next) { this.stacks.touch(gear); return next; }
    this.stacks.set(gear, next);
    if (gear.globalEntry) this.addHook(gear.globalEntry);
    return next;
  }
  revoke(gear: Gear): void {
    noteMutation(gear.id, -1e6);
    if (!this.stacks.has(gear)) return;
    this.stacks.delete(gear);
    for (const d of gear.lostWithThis) this.revoke(d);
    this.dropHook(gear);
  }
  /** `entry` into each hook set it has a side for. */
  private addHook(entry: GlobalHook): void {
    this.writeHooks(entry);
    if (entry.cast) this.castHooks.add(entry);
    if (entry.hit) this.hitHooks.add(entry);
  }
  /** `gear`'s watchers out of the hook sets, where it had any. */
  private dropHook(gear: Gear): void {
    const entry = gear.globalEntry;
    if (!entry) return;
    this.writeHooks(entry);
    this.castHooks.delete(entry);
    this.hitHooks.delete(entry);
  }

  /** The hook sets are written in place — except while a snapshot is live (`ctx.guarded`), where the
   *  first write swaps in copies so `restore()` can hand the originals back (see `Pool.write()`). */
  private hooksCloned = false;
  private writeHooks(entry: GlobalHook): void {
    if (ctx.dryRun) {
      const was = entry as unknown as Gear;
      dryLog.push(this.castHooks as unknown as Set<Gear>, was, this.castHooks.has(entry));
      dryLog.push(this.hitHooks as unknown as Set<Gear>, was, this.hitHooks.has(entry));
    } else if (ctx.guarded && !this.hooksCloned) {
      this.castHooks = new Set(this.castHooks);
      this.hitHooks = new Set(this.hitHooks);
      this.hooksCloned = true;
    }
  }
  /** Everything of this member's a dry run can move (see `evaluate()`'s variants). */
  /** `cd` as it stands at frame `now`, every recharge that has run out by then banked. Reads the
   *  cooldown's own frames/charges, so the "current" pointers must be on this member. */
  cooldownAt(cd: Cooldown, now: number): { charges: number; next: number } {
    const max = cd.charges();
    let s = this.cooldowns.get(cd);
    if (!s) {
      s = { charges: max, next: Infinity };
      this.cooldowns.set(cd, s);
    }
    // a maximum raised since (a sequence) starts recharging the charge it added
    if (s.charges < max && s.next === Infinity) s.next = now + cd.frames();
    while (s.charges < max && s.next <= now) {
      s.charges++;
      s.next = s.charges < max ? s.next + cd.frames() : Infinity;
    }
    if (s.charges > max) s.charges = max;
    return s;
  }
  /** Spend one charge of `cd` at frame `now`, starting its recharge if the count was full — for
   *  `frames` where the cast sets its own length on a shared cooldown. */
  /** The field is handed to this member at `now` by the visit `from` (null: none to learn from). */
  arrive(from: object | null, now: number): void {
    this.handoffAt = now;
    this.handoffKey = from;
    this.gateSeen.clear();
    this.gateUses.clear();
  }
  /** A rotation press gated by `cd` reached at `now` in this visit: its offset from the handoff.
   *  Every gated press of the visit is kept, once each — `step` is the press as the rotation wrote
   *  it, so one reached again after its own wait isn't counted twice. */
  noteGate(cd: Cooldown, now: number, press: string, step: object): void {
    if (this.handoffAt < 0 || !this.handoffKey || this.gateSeen.has(step)) return;
    // each visit's own presses replace the last one's from this handoff (a visit may cast another
    // form than the last), each at the earliest either reached it where the two only drift a few
    // frames apart — which must not leave the next one short — and at its own where they differ
    // outright (an opening visit Hsin's S2 Heart makes shorter), kept per use of the press
    if (!this.gateSeen.size) {
      this.gatePrev = this.gates.get(this.handoffKey) ?? [];
      this.gates.set(this.handoffKey, []);
    }
    this.gateSeen.add(step);
    const use = (this.gateUses.get(press) ?? 0) + 1;
    this.gateUses.set(press, use);
    const offset = now - this.handoffAt;
    const before = this.gatePrev.find((g) => g.press === press && g.use === use);
    const drift = !!before && Math.abs(offset - before.offset) <= 10;
    this.gates.get(this.handoffKey)!.push({ cd, offset: drift ? Math.min(offset, before!.offset) : offset, press, use });
  }
  /** How long a handoff from the visit `from` at `now` has to hold so every cooldown-gated press of
   *  this member's coming visit lands with a charge ready, going by the last visit that one handed
   *  into — every press, each spending its charge for the ones after it on the same cooldown. The
   *  hold, with the press that needed the most of it, or null where none falls short. */
  handoffShortfall(from: object | null, now: number, planned: VisitGate[] | null = null, bank = 0): { cd: Cooldown; frames: number; press: string } | null {
    // time stop still standing into the visit (`bank` real frames) stands the game timer still
    // through its first presses, bringing every planned press that much sooner (a learned one
    // already played through its own)
    if (planned && bank) planned = planned.map((g) => ({ ...g, offset: g.offset - Math.min(bank, g.offset) }));
    // a visit not seen from this handoff yet goes by its own presses' frames (`chainGates`), and
    // a cooldown the last one never used goes by them too
    const learned = from ? this.gates.get(from) : undefined;
    const gates = !learned ? planned : !planned ? learned
      : [...learned, ...planned.filter((g) => !learned.some((l) => l.cd === g.cd))];
    if (!gates?.length) return null;
    const uses = new Map<Cooldown, VisitGate[]>();
    for (const g of gates) {
      const list = uses.get(g.cd);
      if (list) list.push(g);
      else uses.set(g.cd, [g]);
    }
    // read as this member, whose sequences a cooldown's charges and length can depend on
    const was = ctx.slot;
    ctx.slot = this;
    try {
      return this.holdFor(uses, now);
    } finally {
      ctx.slot = was;
    }
  }
  /** The hold `handoffShortfall` asks for: until no press is left short — a longer hold moves every
   *  press, so they are all played again. None where no hold can satisfy them all. */
  private holdFor(uses: Map<Cooldown, VisitGate[]>, now: number): { cd: Cooldown; frames: number; press: string } | null {
    let hold = 0, worst: VisitGate | null = null;
    for (let round = 0; round < 8; round++) {
      let short = 0, by: VisitGate | null = null;
      for (const [cd, list] of uses) {
        const max = cd.charges(), held = this.cooldowns.get(cd);
        let charges = held ? held.charges : max, next = held ? held.next : Infinity;
        for (const g of list) {
          const at = now + hold + g.offset;
          while (charges < max && next <= at) {
            charges++;
            next = charges < max ? next + cd.frames() : Infinity;
          }
          if (charges <= 0) {
            // no schedule waits past a whole recharge: a use that would is one this visit never
            // makes, and holding for it would hold forever
            if (next - at <= cd.frames() && next - at > short) { short = next - at; by = g; }
            break;
          }
          if (next === Infinity) next = at + cd.frames();
          charges--;
        }
      }
      if (!short) return hold > 0 && worst ? { cd: worst.cd, frames: hold, press: worst.press } : null;
      hold += short;
      worst = by;
    }
    return null;
  }
  spendCooldown(cd: Cooldown, now: number, frames = cd.frames()): void {
    const s = this.cooldownAt(cd, now);
    if (s.next === Infinity) s.next = now + frames;
    if (s.charges > 0) s.charges--;
  }

  snapshotInto(s: MemberSnapshot): void {
    this.stacks.snapshotInto(s.pool);
    s.castHooks = this.castHooks;
    s.hitHooks = this.hitHooks;
    for (let i = 0; i < 5; i++) s.forte[i] = this.forte[i]!;
    s.concerto = this.concerto;
  }
  restore(s: MemberSnapshot): void {
    this.stacks.restore(s.pool);
    this.castHooks = s.castHooks;
    this.hitHooks = s.hitHooks;
    this.hooksCloned = false;
    for (let i = 0; i < 5; i++) this.forte[i] = s.forte[i]!;
    this.concerto = s.concerto;
  }

  total(stat: StatKey): number {
    return this.totals.get(stat) ?? 0;
  }
}

/** A team: several Slots, one active at a time, plus team-wide (global) Gear held once rather
 *  than per-slot — the "ticks for whoever's acting" mechanism the old engine's GlobalBuff was. */
/** One entry on the fight's clock (`State.timed`): a queued hit, a press's end, or a function. */
/** One evaluation's damage, where it landed: `slot` is the report bucket (a Tune Break's is the
 *  enemy's), `variantAvg` the acting member's main-stat variants' (see `Result`). */
export interface HitRecord { at: number; slot: string; member: string; avg: number; variantAvg: number[] | null }

/** `cut`: on a press's end, the tag it was cut short by (`ActionTag`, "" for none) — what `pressWasCut()` reads there. */
export interface Timed { due: number; action: Action | null; slot: number; into: Result | null; by: HeldBuff | null; away?: boolean; apply?: () => void; frames?: number; closes?: boolean; triggered?: boolean; cut?: string; check?: () => void; behind?: boolean; at?: number }

/** A clock entry with every field set, in one order — the queue's readers then see one shape. */
export function timedEntry(
  due: number, action: Action | null, slot: number, by: HeldBuff | null, away: boolean | undefined, apply: (() => void) | undefined,
  frames: number | undefined, closes: boolean | undefined, triggered: boolean | undefined,
): Timed {
  return { due, action, slot, into: null, by, away, apply, frames, closes, triggered, cut: undefined, check: undefined, behind: undefined, at: undefined };
}

/** `list` sorted by `due`, ties kept in order — the order a stable `sort()` leaves, without its call. */
export function sortByDue<T extends { due: number }>(list: T[]): void {
  for (let i = 1; i < list.length; i++) {
    const x = list[i]!;
    let k = i;
    while (k > 0 && list[k - 1]!.due > x.due) {
      list[k] = list[k - 1]!;
      k--;
    }
    list[k] = x;
  }
}
/** `item` into `list` (sorted by `due`) behind every entry due no later — a push and a stable sort. */
export function insertByDue<T extends { due: number }>(list: T[], item: T): void {
  let k = list.length;
  list.push(item);
  while (k > 0 && list[k - 1]!.due > item.due) {
    list[k] = list[k - 1]!;
    k--;
  }
  list[k] = item;
}

export class State {
  slots: TeamMember[];
  active = 0;
  /** The one resonator on field — the engine's, not any action's: whoever makes a press off the
   *  rotation list takes it, and an Outro hands it on as it is cast; SWAP leaves it to nobody until
   *  the next press. What `isActive()` reads, whoever is acting. */
  onField = 0;
  /** Who made the last press off the rotation list — the next resonator's first press pays the swap
   *  where nothing before it has (`run()`). */
  presser = -1;
  /** The last press the on-field member made of their own — what an Outro's swap delay is charged
   *  to, the Outro itself never carrying it — and whether that delay is already on the clock (a
   *  swap form's own, or the one charged ahead of the Outro). */
  lastOwn: Result | null = null;
  swapPaid = false;
  /** The cut `lastOwn` was pressed with — what tells a swap form's swap still to come. */
  lastOwnCut = "";
  /** The visit a handoff into slot `to` opens, timed off its presses (rotation.ts's `chainGates`),
   *  for a handoff with no visit learned yet — set by `runRotations()`, null outside one. */
  plannedGates: ((to: number, visit: object | null) => VisitGate[] | null) | null = null;
  /** Whether a handoff holds for the incoming visit's cooldowns: on inside `runRotations()`. */
  handoffWaits = false;
  /** With a double Intro in the team, the visit each visit's handoff really opens — its slot and
   *  its chain, learned as the scheduler plays it, since the next slot along is often not it, nor
   *  its usual chain; null where the next slot's is. */
  successor: Map<object, { slot: number; visit: object }> | null = null;
  /** A handoff found no successor learned yet — the run made it blind, and is played again. */
  successorMissed = false;
  /** The visit `visit`'s handoff opens, null where none is learned yet (noted as a miss). */
  successorOf(visit: object): { slot: number; visit: object } | null {
    const next = this.successor?.get(visit);
    if (next) return next;
    this.successorMissed = true;
    return null;
  }
  /** The last handoff an Outro made — the visit it left and its frame — for the visit it opens. */
  lastHandoff: { from: object | null; at: number } | null = null;
  /** Where the last press (or the handoff's swap frames) ends, on the real timer: `run()` walks
   *  there, landing every queued hit due on the way. */
  playsTo = 0;
  /** A hold or mash cancel waiting on its next press's `requireBuff` (`run()`'s `settleHold()`). */
  holdWatch: HoldWatch | null = null;
  /** Which way the next Outro hands the field over: +1 for the ordinary handoff to the next
   *  resonator in team order, -1 for the outro closing a DOUBLE_INTRO section (rotation.ts). The scheduler
   *  sets it right before the outro is evaluated and puts it back to +1 straight after, so a
   *  kit-queued outro — or any other path into `evaluate()` — always advances forward. */
  outroDir: 1 | -1 = 1;
  /** The real timer, in frames at 60 a second: animations and bullets run on it, time stop or
   *  not. Advanced by `run()` past each press's own `animFrames` (or its cut); every queued hit
   *  (`timed`) is due on it. Moved only through `setReal()`, which keeps `frame` beside it. */
  real = 0;
  /** The game timer: the real timer less every frame a time stop froze — what the output table
   *  shows, every buff duration is stamped against (`Pool.expires`), cooldowns recharge on and
   *  every tick clock runs on. */
  frame = 0;
  /** Every time stop on the real timer, as [start, end) pairs in order and merged, each one cutting
   *  off whatever of the earlier ones was still to run (`freeze()`); `frozen` their total length. A
   *  stop starting mid-press can lie ahead of the timer. */
  private freezes: number[] = [];
  private frozen = 0;
  /** Where off-field time stops being held by motion stop, on the real timer, and where that hold began. */
  motionUntil = 0;
  motionFrom = 0;
  /** Hold off-field time from real frame `from` for a press's motion stop, the way `freeze()` stops
   *  the game timer: it cuts off whatever of the hold standing was still to run. The real frames it
   *  moves the hold's end by — less than 0 where it cut more off than it adds — which every
   *  inactive queued hit moves by. */
  holdOffField(from: number, own: number, banked: number): number {
    if (this.motionUntil < from) this.motionFrom = from;
    const was = Math.max(this.motionUntil, from), end = from + own + banked;
    this.motionUntil = end;
    return end - was;
  }
  /** The game frame a wait on the game timer playing now runs to (`ActionDef.gameWait`); 0 for none. */
  waitUntil = 0;
  /** Move the real timer to `real`, the game timer with it. */
  setReal(real: number): void {
    this.real = real;
    this.frame = this.gameOf(real);
  }
  /** The game timer at real frame `real`, past or ahead (as far as the time stops so far reach). */
  gameOf(real: number): number {
    let frozen = this.frozen;
    for (let i = this.freezes.length - 2; i >= 0; i -= 2) {
      const start = this.freezes[i]!, end = this.freezes[i + 1]!;
      if (end <= real) break;
      frozen -= end - Math.max(start, real);
    }
    return real - frozen;
  }
  /** The real frame the game timer reaches `game` on, from now on: past the time stop standing. */
  realOf(game: number): number {
    if (game <= this.frame) return this.real;
    let real = this.real, at = this.frame;
    const list = this.freezes;
    for (let i = 0; i < list.length; i += 2) {
      const start = list[i]!, end = list[i + 1]!;
      if (end <= real) continue;
      const run = Math.max(start, real) - real;
      if (at + run >= game) break;
      at += run;
      real = end;
    }
    return real + game - at;
  }
  /** Real frames of time stop from real frame `from` on, a stop still to start included. */
  frozenAhead(from = this.real): number {
    return this.frozenWithin(from, Infinity);
  }
  /** Real frames of time stop inside real frames `[from, to)`. */
  frozenWithin(from: number, to: number): number {
    let n = 0;
    const list = this.freezes;
    for (let i = list.length - 2; i >= 0; i -= 2) {
      const start = list[i]!, end = list[i + 1]!;
      if (end <= from) break;
      n += Math.max(0, Math.min(end, to) - Math.max(start, from));
    }
    return n;
  }
  /** The time stop standing at real frame `from`, as the frames until it thaws (0 where none is). */
  frozenFrom(from: number): number {
    const list = this.freezes;
    for (let i = list.length - 2; i >= 0; i -= 2) {
      if (list[i + 1]! <= from) break;
      if (list[i]! <= from) return list[i + 1]! - from;
    }
    return 0;
  }
  /** The first real frame past `from` a time stop starts on, or Infinity. */
  nextFreezeAfter(from: number): number {
    let next = Infinity;
    const list = this.freezes;
    for (let i = list.length - 2; i >= 0; i -= 2) {
      if (list[i + 1]! <= from) break;
      if (list[i]! > from) next = list[i]!;
    }
    return next;
  }
  /** Stop the game timer from real frame `from` for a press's time stop: `own` frames over its own
   *  animation and `banked` more that outlast it. It cuts off whatever of the earlier stops was
   *  still to run from `from`, and runs its whole length from there. */
  freeze(from: number, own: number, banked: number): void {
    const list = this.freezes, end = from + own + banked;
    if (end <= from) return;
    // what stood past `from` goes: a window still running is cut there, one still to come dropped
    this.frozen -= this.frozenWithin(from, Infinity);
    while (list.length && list[list.length - 2]! >= from) list.length -= 2;
    if (list.length && list[list.length - 1]! > from) list[list.length - 1] = from;
    if (list.length && list[list.length - 1] === from) list[list.length - 1] = end;
    else list.push(from, end);
    this.frozen += end - from;
    this.frame = this.gameOf(this.real);
    // a wait on the game timer runs on through it
    if (this.waitUntil > this.frame && this.real < this.playsTo) this.playsTo = Math.max(this.playsTo, this.realOf(this.waitUntil));
  }
  globalStacks = new Pool(); // use Buff here? how are maxstacks even handled?
  /** The earliest frame any pool here may have a Gear run out (each pool's own `nextExpiry`, and no
   *  later) — `expireBuffs()` has nothing to do before it. */
  nextExpiry = Infinity;
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
  /** An Outro's own buffs for whoever intros next, landing on that Intro's QTE frame (`queueQTE`). */
  qteQueue: Buff[] = [];
  /** Hits waiting on the clock, each landing on its owner at `due` — earliest first; `run()` plays
   *  them before any cast the clock has passed them for. A press's own queued hit fills in `into`,
   *  the cast's row; one a
   *  tick queued (`ctx.tickAt`) is a row of its own, credited to `by`; one with `apply` and no
   *  action is run there instead (`applyOn()`, a heal tick's), no row at all. */
  timed: Timed[] = [];
  /** Every hit's damage at the frame it landed (`run()`) — what each rotation sums, over the frames
   *  between its swaps, whichever row the hit is shown in. */
  hits: HitRecord[] = [];
  /** Casts waiting for the next Intro — queued behind it, on the slot that queued them, the
   *  moment an Intro-cast action is evaluated (see `queueOnIntro()`). */
  introQueue: { action: Action; slot: number; by: HeldBuff | null; event: boolean }[] = [];
  /** Casts waiting behind the next rotation press anyone makes (`queueOnBehindNext()`): on the
   *  real frame they were queued at, `stamp` the evaluation that queued them. */
  behindNext: { action: Action; slot: number; by: HeldBuff | null; at: number; stamp: number }[] = [];
  /** Where the fight's closing drain ended up stopping, on the real timer: its `until`, pushed back
   *  by a cast nobody can swap out of that it played (the auto Tune Break). */
  drainUntil = Infinity;
  /** Off-tune buildup — the enemy's own bar, not any one member's, banked automatically by
   *  evaluate() off each hit and whatever a hook added to it (`addGain()`), same as
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

  /** Which *equipped piece* each granted buff traces back to — the weapon, echo or sonata whose own
   *  hook put it up, inherited down a chain of grants the way `sourceOf` inherits its member name.
   *  A piece equipped at setup has no entry: nothing granted it. Only the loadout hovers read this
   *  (page/panels.ts), to show what a piece is worth once its buffs are standing.
   *
   *  On the State rather than the Gear, for `sourceOf`'s own reason: a Gear is a module-level
   *  singleton shared by every team. */
  grantedBy = new Map<Gear, Gear>();

  /** ...and whose turn it was when it landed. A piece is a module-level singleton, so two members
   *  wearing the same sonata share one `grantedBy` entry for it — but the buffs it puts up are
   *  each their own Gear, and a set with a branch per wearer (Song of Feathered Trace: Xuanling's
   *  Feather off Havoc Bane, Chongming's off Glacio Chafe) grants each branch on exactly one
   *  member's turn. This is what tells those apart. Trace-only, like `grantedBy` above. */
  grantedOn = new Map<Gear, string>();

  /** The two fight snapshots `evaluate()` takes around a varied whole press's afterAction — after
   *  banking, and after the real build's own — made once, the first time this team needs them. */
  snapshots: [FightSnapshot, FightSnapshot] | null = null;

  constructor(names: string[]) {
    this.slots = names.map((n, i) => { const m = new TeamMember(n); m.index = i; return m; });
    this.enemy.index = names.length;
    if (names.length >= MEMBERS) throw new Error("state.ts: more members than the grant records index");
  }
  /** Whose kit `gear` came from, as a member index (`TeamMember.index`) — -1 when unattributed. */
  sourceIndexOf(gear: Gear): number {
    const name = this.sourceOf.get(gear);
    if (name === undefined) return -1;
    if (name === this.enemy.name) return this.enemy.index;
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i]!.name === name) return i;
    return -1;
  }
  get slot(): TeamMember { return this.slots[this.active]!; }
  /** Whichever TeamMember currently holds this Resonator — what addBuff()/removeBuff() resolve
   *  a resonator reference against. Throws rather than returning undefined: a kit reaching for
   *  another resonator by reference is asserting they're on this team, and a silent no-op on a
   *  typo'd or absent one would be a much worse bug to chase than a thrown error. */
  memberOf(resonator: Resonator): TeamMember {
    for (const member of this.slots) if (member.resonator === resonator) return member;
    throw new Error(`${resonator.name} is not on this team`);
  }

  stacksOfGlobal(gear: Gear): number { return this.globalStacks.get(gear) ?? 0; }
  addStackGlobal(gear: Gear, n = 1): number {
    noteMutation(gear.id, n);
    const next = Math.min(gear.maxStacks, this.stacksOfGlobal(gear) + n);
    if (!ctx.dryRun) recordApplied(gear, n);
    if (this.globalStacks.get(gear) === next) { this.globalStacks.touch(gear); return next; }
    this.globalStacks.set(gear, next);
    return next;
  }
  removeStackGlobal(gear: Gear, n = 1): number {
    noteMutation(gear.id, -n);
    const next = Math.max(0, this.stacksOfGlobal(gear) - n);
    if (next === 0) {
      if (!this.globalStacks.has(gear)) return 0;
      this.globalStacks.delete(gear);
      for (const d of gear.lostWithThis) this.revokeGlobal(d);
      return 0;
    }
    if (this.globalStacks.get(gear) === next) return next;
    this.globalStacks.set(gear, next, false);
    return next;
  }
  revokeGlobal(gear: Gear): void {
    noteMutation(gear.id, -1e6);
    if (!this.globalStacks.has(gear)) return;
    this.globalStacks.delete(gear);
    for (const d of gear.lostWithThis) this.revokeGlobal(d);
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
    if (this.enemyStacks.get(gear) === next) { this.enemyStacks.touch(gear); return next; }
    this.enemyStacks.set(gear, next);
    return next;
  }
  removeStackEnemy(gear: Gear, n = 1): number {
    noteMutation(gear.id, -n);
    const next = Math.max(0, this.stacksOfEnemy(gear) - n);
    if (next === 0) {
      if (!this.enemyStacks.has(gear)) return 0;
      this.enemyStacks.delete(gear);
      for (const d of gear.lostWithThis) this.revokeEnemy(d);
      return 0;
    }
    if (this.enemyStacks.get(gear) === next) return next;
    this.enemyStacks.set(gear, next, false);
    return next;
  }
  revokeEnemy(gear: Gear): void {
    noteMutation(gear.id, -1e6);
    if (!this.enemyStacks.has(gear)) return;
    this.enemyStacks.delete(gear);
    for (const d of gear.lostWithThis) this.revokeEnemy(d);
  }

  /** Drop every buff whose duration has run out by the clock — every member's own, the team's and
   *  the enemy's — through the same revoke paths a kit uses, so hook rosters follow. Run by
   *  `evaluate()` ahead of every action, so nothing expired is ever visited by a phase. */
  expireBuffs(): void {
    const now = this.frame;
    if (this.nextExpiry > now) return;
    for (const s of this.slots) {
      const gone = s.stacks.expired(now);
      if (gone) for (const g of gone) s.revoke(g);
    }
    let gone = this.globalStacks.expired(now);
    if (gone) for (const g of gone) this.revokeGlobal(g);
    gone = this.enemyStacks.expired(now);
    if (gone) for (const g of gone) this.revokeEnemy(g);
    this.nextExpiry = this.earliestExpiry();
  }
  /** The earliest any pool's held Gear may run out — what `nextExpiry` is kept at. */
  earliestExpiry(): number {
    let next = Math.min(this.globalStacks.nextExpiry, this.enemyStacks.nextExpiry);
    for (const s of this.slots) next = Math.min(next, s.stacks.nextExpiry);
    return next;
  }

  /** Run every held tick from game frame `a` to `b` (see `Pool.advance()`) — each member's own gear
   *  with the "current" pointers on its holder, the team's and the enemy's on whoever is acting,
   *  the same convention updateGlobal() keeps. Run by `evaluate()` as the timers advance, ahead
   *  of the expiry pass, so a window's last tick lands before the window goes. A tick's own work
   *  is queued on the real timer: game frame `a` stands at real frame `realA`, and the clock runs
   *  unfrozen from there. */
  runTicks(a: number, b: number, motionStop: number, realA: number): void {
    const acting = this.slot;
    // an off-field resonator's clocks take the press's off-field shift (see `offFieldShift()`)
    const presser = this.slots[this.presser];
    for (const s of this.slots) this.collectTicks(s.stacks, s, s, a, b, motionStop, presser, TICKS_DUE);
    this.collectTicks(this.globalStacks, acting, null, a, b, motionStop, presser, TICKS_DUE);
    this.collectTicks(this.enemyStacks, acting, null, a, b, motionStop, presser, TICKS_DUE);
    if (TICKS_DUE.length) {
      for (const { gear, n, at, slot } of TICKS_DUE.splice(0)) {
        ctx.slot = slot;
        ctx.buff = gear;
        ctx.stacks = -1;
        ctx.tickAt = realA + at - a;
        gear.tickFn!(n);
      }
    }
    ctx.tickAt = null;
    ctx.slot = acting;
    ctx.buff = null;
  }
  /** One pool's share of `runTicks()`: its fires collected into `due`, run as `slot`. */
  private collectTicks(pool: Pool, slot: TeamMember, holder: TeamMember | null, a: number, b: number, motionStop: number, presser: TeamMember | undefined, due: { gear: Gear; n: number; at: number; slot: TeamMember }[]): void {
    if (!pool.hasTicks()) return;
    const from = due.length;
    ctx.slot = slot;
    pool.advance(a, b, due, motionStop, this, holder, presser);
    for (let i = from; i < due.length; i++) due[i]!.slot = slot;
  }
}

/** The ticks one `State.runTicks()` pass collected, run once the pass is over. */
const TICKS_DUE: { gear: Gear; n: number; at: number; slot: TeamMember }[] = [];

/** Whether `gear`'s clock runs off field this press — its owner (`holder`, or the window's own owner)
 *  not the one pressing — and so loses the press's motion stop. */
function offFieldClock(gear: Gear, state: State, holder: TeamMember | null, presser: TeamMember | undefined): boolean {
  if (gear.tickSkipsMotionStop) return true;
  const owner = gear.tickOwner ? state.memberOf(gear.tickOwner()) : holder;
  return !!owner && !!presser && owner !== presser;
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
    const pool = (): PoolSnapshot => ({ list: [], counts: [], hooks: [], phases: 0, fns: [], globalHooks: [], at: new Int32Array(0), dead: 0, expires: [], nextExpiry: Infinity, progress: [], ticks: [], ticking: 0 });
    const member = (): MemberSnapshot => ({ pool: pool(), castHooks: new Set(), hitHooks: new Set(), forte: [0, 0, 0, 0, 0], concerto: 0 });
    this.members = state.slots.map(member);
    this.global = pool(); this.enemy = pool();
  }
  take(state: State): void {
    const slots = state.slots;
    for (let i = 0; i < slots.length; i++) slots[i]!.snapshotInto(this.members[i]!);
    state.globalStacks.snapshotInto(this.global); state.enemyStacks.snapshotInto(this.enemy);
    this.offtune = state.offtune;
  }
  restore(state: State): void {
    undoDry();
    const slots = state.slots;
    for (let i = 0; i < slots.length; i++) slots[i]!.restore(this.members[i]!);
    state.globalStacks.restore(this.global); state.enemyStacks.restore(this.enemy);
    state.nextExpiry = state.earliestExpiry();
    state.offtune = this.offtune;
  }
}