/**
 * Calculation state, and the ambient namespace buff/action functions author against.
 *
 * A buff reaches a resonator three ways:
 *   1. own gear        seeded at fight start, plus states its own actions open
 *   2. the outro queue published by a buff/action; adopted on the next intro — the buff itself
 *      is responsible for revoking on its own holder's outro, same as any other buff
 *   3. a direct grant  to a specific slot, or to everyone else's
 *
 * A local buff (any of the three above) only ever ticks on its own holder's turn. Something
 * that needs to act on the whole team — a flat stat everyone should carry, or a watcher that
 * reacts to anyone's cast — is a `GlobalBuff` instead (`grantGlobal`, see below): one shared
 * instance held on `State` itself, ticking on every action no matter who's acting. A `Debuff`
 * is the same idea again, one further step removed — held on `Enemy`, ticking on every action
 * including one not owned by any team member (a future DOT tick, say).
 *
 * Authoring style: functions read/mutate through an explicit `ctx: Ctx` (`ctx.add(36, CRIT_RATE)`),
 * handed in as the first argument to every `apply()`/`onFightStart()`/`onIntro()` — built fresh
 * per call, nothing ambient, so a `State` never depends on anything outside itself and two of
 * them can evaluate side by side.
 */
import {
  Stat, Element, Resource, DamageType, Cast,
  isPercent, SLOT_RESOURCES, TEAM_RESOURCES, scopedStat, TAGS_MATCHED,
} from "./stats.js";
import {
  Buff, Debuff, GlobalBuff, Gear, Mode, Mainslot, Chain, Action, ECHO_CAST,
  asBuff, asDebuff, asGlobalBuff, asAction,
  labelOf, nameOf, setLabel, PRIORITY, PRIORITY_BANDS,
} from "./kit.js";
import type { Priority, OnIntro } from "./kit.js";
import type { Snapshot, DamageConfig } from "./damage.js";

/** What an action is, for matching scoped stats: its element and its damage type. */
const tagsOf = (action: Action | null): string[] =>
  TAGS_MATCHED.map((k) => (action as unknown as Record<string, unknown>)?.[k])
    .filter((v): v is string => Boolean(v));

/** Which button an action is, not what damage it deals — both keyed off `cast`, checking
 *  `cast2` too for an action that counts as more than one (see `Action.cast2`). */
export const castedAs = (action: Action, cast: string): boolean =>
  action.cast === cast || action.cast2 === cast;
export const isIntro = (action: Action): boolean => castedAs(action, DamageType.Intro);
export const isOutro = (action: Action): boolean => castedAs(action, DamageType.Outro);
export const isEcho = (action: Action): boolean => castedAs(action, DamageType.Echo);
export const isLiberation = (action: Action): boolean => castedAs(action, DamageType.Liberation);
export const isSkill = (action: Action): boolean => castedAs(action, DamageType.Skill);
export const isTuneBreak = (action: Action): boolean => castedAs(action, Cast.TuneBreak);

/* ------------------------------------------------------------------- one slot */

/** One contribution to a stat, tracked for the hover trace. */
export interface StatEntry {
  stat: string;
  value: number;
  src: unknown;
  forcedName?: string;
  source?: string;
  /** Which team member's own gear/kit produced this contribution — the hover panel's colour
   *  bar. See `Buff.owner`. */
  owner?: string | null;
}

/** Who moved a resource counter, for the resource panels' hover trace. */
export interface CounterLogEntry {
  counter: string;
  delta: number;
  src: unknown;
  source?: string;
}

/** A per-resonator held buff instance, as `Slot.list`'s values — `Buff.instance()`'s shape. */
export type HeldBuff = Buff;

/** A buff waiting in the outro queue, its owner captured at publish time — the resonator who
 *  eventually adopts it on their own intro is not who granted it. */
export interface QueuedOutro { buff: Buff; owner: string | null; }

/** A resonator's held gear: weapon, mainslot echo, the sonata's two pieces, mainstats and
 *  substats — every field required, since a build always equips all six. Resonance Mode and any
 *  extra sequence gear aren't part of this (not every build has either), so they stay their own
 *  fields on `Resonator` instead. */
export class Loadout {
  weapon: Gear;
  mainslot: Mainslot;
  sonata: Gear;
  pc2: Gear;
  mainstat: Gear;
  substat: Gear;

  constructor(weapon: Gear, mainslot: Mainslot, sonata: Gear, pc2: Gear, mainstat: Gear, substat: Gear) {
    this.weapon = weapon;
    this.mainslot = mainslot;
    this.sonata = sonata;
    this.pc2 = pc2;
    this.mainstat = mainstat;
    this.substat = substat;
  }
}

/**
 * One playable character's own held state and gear for a single fight — the "team member" that
 * replaces a resonator's own Gear const from before. Every piece of gear (weapon, mainslot echo,
 * sonata, mainstats, substats — bundled in `loadout`) is a shared singleton, reused across every
 * fight, since none of them hold mutable per-fight state of their own. A Resonator does — the
 * forte gauges — so each resonator file exports a factory (`LOADOUT`, a `ResonatorFactory`)
 * rather than a ready-made const, and `startFight()` calls it fresh every time, so nothing leaks
 * between fights sharing the same process (the web UI re-running a different team, say).
 *
 * Does not extend `Gear`/`Buff` — it isn't itself a stat contribution, it *holds* the two that
 * are (`base`, `talents`), plus its own `loadout`/`mode`/`sequences`, in named fields instead of
 * a loose array, so equipping two weapons (or two mainslots, or two modes) is a type error, not
 * a runtime check.
 */
export class Resonator {
  name: string;
  element: Element;
  onIntro: OnIntro;
  loadout: Loadout;
  /** A build commits to at most one stance for the whole fight (see `Mode` in kit.js) — most
   *  characters have none. */
  mode: Mode | null;
  /** Extra Gear a loadout equips beyond the standard six (a character's own sequence pieces,
   *  say) — not every build has any. */
  sequences: Gear[];
  onFightStart: ((ctx: Ctx) => void) | null;
  maxEnergy: number;
  maxConcerto: number;
  /** Forte gauges: generic, a kit assigns its own meaning to whichever it uses — mutated
   *  directly by a kit's own code, or through the Resource system (`ctx.gain(Resource.Forte1,
   *  ...)`) same as Energy/Concerto. A fresh Resonator zeroes all five every fight. */
  forte1 = 0;
  forte2 = 0;
  forte3 = 0;
  forte4 = 0;
  forte5 = 0;
  /** This character's own base stat line (HP/ATK/DEF, etc) — reported under their own name,
   *  added to the slot exactly like any other Gear. */
  readonly base: Buff;
  /** The stat-tree talent bonus, split into its own buff so a trace can tell it apart from
   *  `base`: the universal 100% ER / 5% Crit Rate / 150% Crit DMG baseline every resonator
   *  carries, plus whatever `talents` adds. */
  readonly talents: Buff;

  constructor(
    name: string,
    element: Element,
    onIntro: OnIntro,
    loadout: Loadout,
    /** This character's own kit-specific base stats (HP/ATK/DEF, etc) — not the universal
     *  CR/CD/ER baseline or the stat-tree talent bonus, both handled by `talents` below instead. */
    stats: ((ctx: Ctx, stacks: number) => void) | null = null,
    /** The stat-tree talent bonus alone — usually 12% ATK plus either 8% Crit Rate or 16% Crit
     *  DMG, per character. Reported under its own "$Name: Talents" buff (`this.talents`), split
     *  from `stats` so a trace can tell a character's own numbers from their stat tree's. */
    talents: ((ctx: Ctx, stacks: number) => void) | null = null,
    onFightStart: ((ctx: Ctx) => void) | null = null,
    mode: Mode | null = null,
    sequences: Gear[] = [],
    /** Declared ceilings, not yet enforced anywhere — Energy/Concerto still accumulate uncapped
     *  in `evaluate()`, so far. */
    maxEnergy = 10000,
    maxConcerto = 10000,
  ) {
    this.name = name;
    this.element = element;
    this.onIntro = onIntro;
    this.loadout = loadout;
    this.mode = mode;
    this.sequences = sequences;
    this.onFightStart = onFightStart;
    this.maxEnergy = maxEnergy;
    this.maxConcerto = maxConcerto;

    this.base = new Buff(PRIORITY.GEAR_STATS, (ctx, stacks) => { stats?.(ctx, stacks); return name; });
    this.talents = new Buff(PRIORITY.GEAR_STATS, (ctx, stacks) => {
      ctx.add(100, Stat.Er);
      ctx.add(5, Stat.CritRate);
      ctx.add(150, Stat.CritDmg);   // a total multiplier, not a bonus: a crit deals 150%
      talents?.(ctx, stacks);
      return `${name}: Talents`;
    });
  }

  toString(): string { return this.name; }
}

/** A resonator file's own `LOADOUT` export — called fresh by `startFight()` every time, so a
 *  Resonator's mutable fields (the forte gauges) never carry over from a previous fight. */
export type ResonatorFactory = () => Resonator;

export class Slot {
  name: string;
  index: number;
  state: State | null;
  list: Map<Buff, HeldBuff>;
  energy: number;
  concerto: number;
  /** How many shields this cast grants — reset to the action's own declared count at the start
   *  of every `evaluate()`, same as `entries`; a buff adds to it the same way it adds to
   *  Concerto/Energy (`Ctx.gainShields`), not through the Stat/`add()` system (shields are not
   *  a stat, see stats.ts). */
  shields: number;
  entries: StatEntry[];
  counterLog: CounterLogEntry[];
  resonator: Resonator | null;
  data: Record<string, unknown>;

  constructor(name: string, index: number, state: State | null = null) {
    this.name = name;
    this.index = index;
    /** The fight this slot belongs to, so buff events can reach its log. */
    this.state = state;
    /** Every buff on this resonator. Buff -> instance (carries its own `via`). */
    this.list = new Map();
    /** Energy/Concerto: real fields, not a map — `counter()`/`setCounter()` reject any other
     *  name. Forte gauges live on `resonator` instead (see Resource.ForteN's own comment). */
    this.energy = 0;
    this.concerto = 0;
    this.shields = 0;
    /** Stat entries rebuilt for every action. */
    this.entries = [];
    /** Who moved which counter this action — the resource panels' hover trace. */
    this.counterLog = [];
    /** The resonator's own Gear — first entry in the loadout, by convention. Its `.element`
     *  is what team-composition logic reads. */
    this.resonator = null;
    /** Free-form per-kit storage for state a counter or a stack count can't hold — an ordered
     *  queue, for instance. Empty object, own kit reads/writes whatever keys it needs. */
    this.data = {};
  }

  /**
   * Record a buff event, prefixed with the action in progress. `make` is a function, not a
   * string, because a buff is granted before it has ever named itself — wording is deferred to
   * read time so the line says what the buff turned out to be called.
   */
  note(buff: Buff | null, make: () => string): void {
    if (!this.state) return;
    const tag = this.state.tag();
    this.state.events.push({ buff, render: () => `${tag}${this.name} ${make()}` });
  }

  /** Put a buff on this resonator's list — idempotent. Only decides whether `apply()` runs
   *  here; `addStack` is what moves the stack count.
   *
   *  `owner` names who's responsible for it, for display only. An explicit `owner` (the outro
   *  queue passes the publisher's own, captured at publish time; `addStack` passes its own
   *  caller's) wins; gear is always owned by whoever it's equipped on; omitted otherwise. */
  addBuff(buff: Buff, { via = "gear", owner }: { via?: string; owner?: string | null } = {}): this {
    asBuff(buff);
    if (this.list.has(buff)) return this;
    this.note(buff, () => `gained ${nameOf(this.list.get(buff) ?? buff)} (${via})`);
    const entry = buff.instance();
    entry.via = via;
    entry.owner = owner !== undefined ? owner : (via === "gear" ? this.name : null);
    this.list.set(buff, entry);
    return this;
  }

  /** Hold the buff if not already held, and stack this resonator's own instance of it. `owner`
   *  passes straight through to `addBuff` for a fresh grant — whoever's `Ctx.grantSelf`/
   *  `grantOthers` called this hands in their own `owner`. */
  addStack(buff: Buff, n = 1, owner?: string | null): number {
    // a grant already carries the first stack
    const fresh = !this.list.has(buff);
    this.addBuff(buff, { via: "state", owner });
    const held = this.list.get(buff)!;
    const before = held.stacks;
    const after = held.addStacks(fresh ? Math.max(0, n - 1) : n);
    if (after !== before) {
      const capped = after === held.max_stacks && before + n > held.max_stacks ? " (capped)" : "";
      this.note(buff, () => `${nameOf(held)} ${before} -> ${after}${capped}`);
    }
    return after;
  }

  /** Spend stacks; the buff drops off this list once it is empty. */
  removeStack(buff: Buff, n = 1): boolean {
    const held = this.list.get(buff);
    if (!held) return false;
    const before = held.stacks;
    const after = held.removeStacks(n);
    if (after !== before) {
      this.note(buff, () => `${nameOf(held)} ${before} -> ${after} (spent ${before - after})`);
    }
    if (after <= 0) { this.list.delete(buff); this.note(buff, () => `lost ${nameOf(held)} (empty)`); }
    return true;
  }

  /** Clear the buff entirely; a buff taken away and re-granted starts from nothing. */
  removeBuff(buff: Buff): boolean {
    const held = this.list.get(buff);
    if (!held) return false;
    this.list.delete(buff);
    const at = held.max_stacks > 1 ? ` (at ${held.stacks})` : "";
    this.note(buff, () => `lost ${nameOf(held)}${at}`);
    return true;
  }
  hasBuff(buff: Buff): boolean { return this.list.has(buff); }
  /** This resonator's stack count for a buff. 0 if it does not hold it. */
  stacksOf(buff: Buff): number { return this.list.get(buff)?.stacks ?? 0; }

  /** One of the named resources — Energy/Concerto live here, the forte gauges on `resonator`
   *  (a fresh instance per fight; see `Resonator`'s own header). Throws on anything else. */
  counter(name: Resource): number {
    switch (name) {
      case Resource.Energy: return this.energy;
      case Resource.Concerto: return this.concerto;
      case Resource.Forte1: return this.resonator!.forte1;
      case Resource.Forte2: return this.resonator!.forte2;
      case Resource.Forte3: return this.resonator!.forte3;
      case Resource.Forte4: return this.resonator!.forte4;
      case Resource.Forte5: return this.resonator!.forte5;
      default: throw new Error(`Slot: no such counter "${name}"`);
    }
  }
  setCounter(name: Resource, v: number, source?: unknown): number {
    const before = this.counter(name);
    switch (name) {
      case Resource.Energy: this.energy = v; break;
      case Resource.Concerto: this.concerto = v; break;
      case Resource.Forte1: this.resonator!.forte1 = v; break;
      case Resource.Forte2: this.resonator!.forte2 = v; break;
      case Resource.Forte3: this.resonator!.forte3 = v; break;
      case Resource.Forte4: this.resonator!.forte4 = v; break;
      case Resource.Forte5: this.resonator!.forte5 = v; break;
    }
    // the object that moved it, not its name — resolved once the buff has named itself
    if (v !== before) this.counterLog.push({ counter: name, delta: v - before, src: source });
    return v;
  }

  /** Sum of every contribution to `stat` for the action being evaluated. */
  total(stat: string): number {
    let n = 0;
    for (const e of this.entries) if (e.stat === stat) n += e.value;
    return n;
  }

  /** Flat totals fold base × (1 + bonus%) + flat, computed on demand. */
  derived(kind: string): number {
    const [base, bonus, flat] =
      kind === Stat.Atk ? [Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk]
      : kind === Stat.Hp ? [Stat.BaseHp, Stat.BonusHp, Stat.FlatHp]
      : [Stat.BaseDef, Stat.BonusDef, Stat.FlatDef];
    return Math.floor(this.total(base) * (1 + this.total(bonus) / 100) + this.total(flat));
  }
}

/* ------------------------------------------------------------------- the enemy */

/** A per-fight held debuff instance, as `Enemy.list`'s values — `Debuff.instance()`'s shape. */
export type HeldDebuff = Debuff;

export interface EnemyOptions {
  level?: number;
  /** Base resistance to each element, in percent — sparse; an element left out reads as 0. */
  baseRes?: Partial<Record<string, number>>;
  maxOfftune?: number;
}

/**
 * The enemy: one shared instance for the whole fight, not one per resonator — the mirror image
 * of a Slot, but for the thing every resonator is attacking rather than one of them. Holds its
 * own defence, its resistance to each element, and off-tune, plus whatever debuffs are ticking
 * on it. `defense()`/`res()` fold the constant (level-derived base / `baseRes`) together with
 * whatever this pass's debuffs contributed, the same base+bonus+flat shape `Slot.derived` folds.
 */
export class Enemy {
  level: number;
  baseRes: Partial<Record<string, number>>;
  maxOfftune: number;

  state: State | null;
  list: Map<Debuff, HeldDebuff>;
  entries: StatEntry[];
  offtune: number;
  counterLog: CounterLogEntry[];

  constructor({ level = 100, baseRes = {}, maxOfftune = 0 }: EnemyOptions = {}, state: State | null = null) {
    this.level = level;
    this.baseRes = { ...baseRes };
    this.maxOfftune = maxOfftune;

    this.state = state;
    /** Every debuff on the enemy. Debuff -> instance (carries its own `via`). */
    this.list = new Map();
    /** Stat entries rebuilt for every action. */
    this.entries = [];
    this.offtune = 0;
    /** Who moved off-tune this action — the resource panel's hover trace. */
    this.counterLog = [];
  }

  /** Record a debuff event, prefixed with the action in progress — same shape as `Slot.note`. */
  note(debuff: Debuff | null, make: () => string): void {
    if (!this.state) return;
    const tag = this.state.tag();
    this.state.events.push({ buff: debuff, render: () => `${tag}enemy ${make()}` });
  }

  /** Put a debuff on the enemy — idempotent. Only decides whether `apply()` runs here;
   *  `addStack` is what moves the stack count. A debuff is never gear, so `owner` is always
   *  whatever its caller hands in (`Ctx.grantEnemy`'s own owner, ultimately). */
  addDebuff(debuff: Debuff, { via = "grant", owner = null }: { via?: string; owner?: string | null } = {}): this {
    asDebuff(debuff);
    if (this.list.has(debuff)) return this;
    this.note(debuff, () => `gained ${nameOf(this.list.get(debuff) ?? debuff)} (${via})`);
    const entry = debuff.instance();
    entry.via = via;
    entry.owner = owner;
    this.list.set(debuff, entry);
    return this;
  }

  /** Hold the debuff if not already held, and stack it. `owner` passes straight through to
   *  `addDebuff` for a fresh grant. */
  addStack(debuff: Debuff, n = 1, owner?: string | null): number {
    // a grant already carries the first stack
    const fresh = !this.list.has(debuff);
    this.addDebuff(debuff, { via: "state", owner });
    const held = this.list.get(debuff)!;
    const before = held.stacks;
    const after = held.addStacks(fresh ? Math.max(0, n - 1) : n);
    if (after !== before) {
      const capped = after === held.max_stacks && before + n > held.max_stacks ? " (capped)" : "";
      this.note(debuff, () => `${nameOf(held)} ${before} -> ${after}${capped}`);
    }
    return after;
  }

  /** Spend stacks; the debuff drops off once it is empty. */
  removeStack(debuff: Debuff, n = 1): boolean {
    const held = this.list.get(debuff);
    if (!held) return false;
    const before = held.stacks;
    const after = held.removeStacks(n);
    if (after !== before) {
      this.note(debuff, () => `${nameOf(held)} ${before} -> ${after} (spent ${before - after})`);
    }
    if (after <= 0) { this.list.delete(debuff); this.note(debuff, () => `lost ${nameOf(held)} (empty)`); }
    return true;
  }

  /** Clear the debuff entirely; a debuff taken away and re-granted starts from nothing. */
  removeDebuff(debuff: Debuff): boolean {
    const held = this.list.get(debuff);
    if (!held) return false;
    this.list.delete(debuff);
    const at = held.max_stacks > 1 ? ` (at ${held.stacks})` : "";
    this.note(debuff, () => `lost ${nameOf(held)}${at}`);
    return true;
  }
  hasDebuff(debuff: Debuff): boolean { return this.list.has(debuff); }
  /** The enemy's current stack count for a debuff. 0 if it does not hold it. */
  stacksOf(debuff: Debuff): number { return this.list.get(debuff)?.stacks ?? 0; }

  /** Sum of every contribution to `stat` for the action being evaluated. */
  total(stat: string): number {
    let n = 0;
    for (const e of this.entries) if (e.stat === stat) n += e.value;
    return n;
  }

  /** Current resistance to one element: its base plus whatever debuffs contributed this pass. */
  res(element: string): number {
    return (this.baseRes[element] ?? 0);
  }

  /** Current defence: the level-derived base, plus whatever debuffs contributed this pass. */
  defense(): number {
    return 792 + this.level * 8;
  }

  /** Off-tune is the only enemy counter — throws on anything else, same as `Slot.counter`. */
  counter(name: string): number {
    if (name !== Resource.Offtune) throw new Error(`Enemy: no such counter "${name}"`);
    return this.offtune;
  }
  setCounter(name: string, v: number, source?: unknown): number {
    const before = this.counter(name);
    this.offtune = v;
    if (v !== before) this.counterLog.push({ counter: name, delta: v - before, src: source });
    return v;
  }
}

/* ---------------------------------------------------------------- whole state */

export interface StateOptions {
  team?: string[];
  level?: number;
  enemy?: Enemy;
  buffs?: Buff[];
}

/** A pending/queued evaluation step: a plain rotation entry, a chain member, or a follow-up
 *  `queue()`d mid-evaluation. */
export interface Step {
  action: Action;
  slot?: number;
  chain?: string | null;
  chainOf?: string | null;
}

/** A resolved snapshot — everything `damage()` reads, plus the extra bookkeeping the table and
 *  hover panels want. */
export interface ResolvedSnapshot extends Snapshot {
  slot: string;
  /** Who actually acted — unlike `slot`, never relabeled (see `attributeMisc`'s "Misc" bucket
   *  for tune breaks). Display-only: which resonator's own turn this event happened on. */
  member: string;
  triggered: boolean;
  active: boolean;
  entries: StatEntry[];
  totals: Map<string, number>;
  counters: Record<string, number>;
  teamCounters: Record<string, number>;
  counterLog: CounterLogEntry[];
  teamCounterLog: CounterLogEntry[];
  buffs: (string | null)[];
  stacks: Record<string, number>;
}

/** One rotation entry, or a `Chain` — what `run()`/`expand()` accept. */
export type RotationEntry = Action | Chain;

export class State {
  events: Array<string | { buff: Buff | null; render: () => string }>;
  currentAction: Action | null;
  slots: Slot[];
  active: number;
  config: DamageConfig;
  enemy: Enemy;
  globalBuffs: Map<GlobalBuff, GlobalBuff>;
  outroQueue: QueuedOutro[];
  pending: Step[];
  chainSeq: number;

  /** `buffs` seeds every slot before anything is equipped — the engine's own standing rules.
   *  `enemy` defaults to a bare `Enemy` (level 100, 0 resistance everywhere, no off-tune cap) if
   *  the caller doesn't build its own. */
  constructor({ team = ["slot1"], level = 90, enemy = new Enemy(), buffs = [] }: StateOptions = {}) {
    /** Log lines, as thunks — frozen at the end of the action that produced them. */
    this.events = [];
    this.currentAction = null;
    this.slots = team.map((n, i) => new Slot(n, i, this));
    this.active = 0;
    this.config = { level };
    this.enemy = enemy;
    this.enemy.state = this;
    for (const slot of this.slots) for (const b of buffs) slot.addBuff(b, { via: "engine" });

    /** Buff names published, waiting for the next intro to pick them up. */
    this.outroQueue = [];
    /** Global buffs: GlobalBuff -> instance, one shared copy for the whole fight — no per-slot
     *  bookkeeping, unlike `Slot.list`. */
    this.globalBuffs = new Map();
    /** Follow-up actions queued by an action, spliced in after the current one. */
    this.pending = [];
    this.chainSeq = 0;
  }

  get slot(): Slot { return this.slots[this.active]!; }
  slotOf(name: string): Slot | undefined { return this.slots.find((s) => s.name === name); }

  /** Record a global-buff event, prefixed with the action in progress — same shape as
   *  `Slot.note`, just not attributed to any one resonator's name. */
  noteGlobal(buff: GlobalBuff | null, make: () => string): void {
    const tag = this.tag();
    this.events.push({ buff, render: () => `${tag}${make()}` });
  }

  /** Put a global buff on the fight — idempotent. Only decides whether `apply()` runs here;
   *  `addGlobalStack` is what moves the stack count. A global buff is never gear, so `owner`
   *  is always whatever its caller hands in (`Ctx.grantGlobal`'s own owner, ultimately). */
  addGlobalBuff(buff: GlobalBuff, { via = "grant", owner = null }: { via?: string; owner?: string | null } = {}): this {
    asGlobalBuff(buff);
    if (this.globalBuffs.has(buff)) return this;
    this.noteGlobal(buff, () => `gained ${nameOf(this.globalBuffs.get(buff) ?? buff)} (${via})`);
    const entry = buff.instance();
    entry.via = via;
    entry.owner = owner;
    this.globalBuffs.set(buff, entry);
    return this;
  }

  /** Hold the global buff if not already held, and stack it. `owner` passes straight through to
   *  `addGlobalBuff` for a fresh grant. */
  addGlobalStack(buff: GlobalBuff, n = 1, owner?: string | null): number {
    // a grant already carries the first stack
    const fresh = !this.globalBuffs.has(buff);
    this.addGlobalBuff(buff, { via: "state", owner });
    const held = this.globalBuffs.get(buff)!;
    const before = held.stacks;
    const after = held.addStacks(fresh ? Math.max(0, n - 1) : n);
    if (after !== before) {
      const capped = after === held.max_stacks && before + n > held.max_stacks ? " (capped)" : "";
      this.noteGlobal(buff, () => `${nameOf(held)} ${before} -> ${after}${capped}`);
    }
    return after;
  }

  /** Spend stacks; the global buff drops off once it is empty. */
  removeGlobalStack(buff: GlobalBuff, n = 1): boolean {
    const held = this.globalBuffs.get(buff);
    if (!held) return false;
    const before = held.stacks;
    const after = held.removeStacks(n);
    if (after !== before) {
      this.noteGlobal(buff, () => `${nameOf(held)} ${before} -> ${after} (spent ${before - after})`);
    }
    if (after <= 0) { this.globalBuffs.delete(buff); this.noteGlobal(buff, () => `lost ${nameOf(held)} (empty)`); }
    return true;
  }

  /** Clear the global buff entirely; a global buff taken away and re-granted starts from
   *  nothing. */
  removeGlobalBuff(buff: GlobalBuff): boolean {
    const held = this.globalBuffs.get(buff);
    if (!held) return false;
    this.globalBuffs.delete(buff);
    const at = held.max_stacks > 1 ? ` (at ${held.stacks})` : "";
    this.noteGlobal(buff, () => `lost ${nameOf(held)}${at}`);
    return true;
  }
  hasGlobalBuff(buff: GlobalBuff): boolean { return this.globalBuffs.has(buff); }
  /** The fight's current stack count for a global buff. 0 if it is not held. */
  stacksOfGlobal(buff: GlobalBuff): number { return this.globalBuffs.get(buff)?.stacks ?? 0; }

  /** Set a global buff to exactly `n` stacks — up or down, whether this is its first grant or
   *  it's already held. For a buff whose cast genuinely *replaces* whatever it last reached
   *  (a fresh Array overwriting Thunder Spell's progress) rather than accumulating — most
   *  global buffs only ever need the plain relative `addGlobalStack`. */
  setGlobalStacks(buff: GlobalBuff, n: number, owner?: string | null): number {
    const clamped = Math.min(buff.max_stacks, Math.max(0, n));
    const before = this.stacksOfGlobal(buff);
    if (before < clamped) this.addGlobalStack(buff, clamped - before, owner);
    else if (before > clamped) this.removeGlobalStack(buff, before - clamped);
    return clamped;
  }

  /** Freeze every log line into its final wording, once every buff has named itself. */
  settleLog(): void {
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i]!;
      if (typeof e === "string") continue;
      // a buff nobody has run yet can't be worded — Iuno's gear names itself once she acts
      if (e.buff && labelOf(e.buff) == null) continue;
      this.events[i] = e.render();
    }
  }

  /** The event log. Anything not yet frozen is worded on the way out. */
  get log(): string[] {
    return this.events.map((line) => (typeof line === "string" ? line : line.render()));
  }

  /** Prefix for a log line: the full action name, when one is in progress. */
  tag(): string { return this.currentAction ? `${this.currentAction}: ` : ""; }

  /** Mechanism 1 — build each resonator fresh from their own factory, equip their held gear,
   *  then run onFightStart: the resonator's own, then whichever of their weapon/mainslot/mode
   *  also declares one (a Resonator is the only thing the *engine* calls onFightStart on
   *  directly — everything else's own hook, if any, only ever runs through this delegation). */
  startFight(loadouts: Record<string, ResonatorFactory>): this {
    for (const [slotName, factory] of Object.entries(loadouts)) {
      const slot = this.slotOf(slotName);
      if (!slot) throw new Error(`no slot named "${slotName}"`);
      const resonator = factory();
      slot.resonator = resonator;
      const { loadout } = resonator;

      const pieces: Gear[] = [
        loadout.weapon, loadout.mainslot, loadout.sonata, loadout.pc2,
        ...(resonator.mode ? [resonator.mode] : []),
        ...resonator.sequences,
        loadout.mainstat, loadout.substat,
      ];
      const seen = new Set<Gear>();
      for (const gear of pieces) {
        // by identity — equipping the same object twice doubles a stat line
        if (seen.has(gear)) throw new Error(`${slotName} equips the same gear twice`);
        seen.add(gear);
        slot.addBuff(gear, { via: "gear" });
      }
      // the resonator's own two stat buffs join the same list, same as any other gear
      slot.addBuff(resonator.base, { via: "gear" });
      slot.addBuff(resonator.talents, { via: "gear" });
    }
    for (const slotName of Object.keys(loadouts)) {
      const slot = this.slotOf(slotName)!;
      const resonator = slot.resonator!;
      const ctxFor = (source: unknown): Ctx =>
        new Ctx({ state: this, slot, action: null, source, owner: slot.name });
      resonator.onFightStart?.(ctxFor(resonator));
      for (const gear of [resonator.loadout.weapon, resonator.loadout.mainslot, resonator.mode]) {
        gear?.onFightStart?.(ctxFor(gear));
      }
    }
    return this;
  }

  /** Mechanism 2 — publish a buff for whoever intros next. `owner` is the publisher's own,
   *  captured now — by the time it's adopted the acting slot has moved on to someone else. */
  publishOutro(buff: Buff, owner: string | null = null): void {
    asBuff(buff);
    this.outroQueue.push({ buff, owner });
    const tag = this.tag();
    this.events.push({ buff, render: () => `${tag}published ${nameOf(buff)} to the outro queue` });
  }

  /** Mechanism 2 — the acting resonator intros and adopts whatever is queued. Each adopted buff
   *  is responsible for revoking itself on this resonator's own outro — no engine-level
   *  special case for it. */
  adoptOutroBuffs(): Buff[] {
    if (!this.outroQueue.length) return [];
    const taken = this.outroQueue.splice(0);
    for (const { buff, owner } of taken) this.slot.addBuff(buff, { via: "outro", owner });
    return taken.map((t) => t.buff);
  }

  /** Mechanism 3 — a grant to specific slots. Idempotent: no duplicate, no stack. */
  grant(buff: Buff, slots: Slot[]): number {
    asBuff(buff);
    const fresh = slots.filter((s) => !s.hasBuff(buff));
    for (const s of fresh) s.addBuff(buff, { via: "grant" });
    return fresh.length;
  }

  /* ------------------------------------------------------------ evaluation */

  /** Evaluate one action: rebuild stats from the buff list, let the action contribute, and
   *  return the resolved snapshot. */
  evaluate(action: Action, meta: Partial<Step> = {}): ResolvedSnapshot {
    asAction(action);
    // a queued step belongs to whoever queued it
    if (meta.slot != null) this.active = meta.slot;
    const slot = this.slot;
    this.currentAction = action;

    // an intro adopts whatever was queued for it on the way in
    if (isIntro(action)) this.adoptOutroBuffs();

    // an outro decides — and, if it picks the enhanced form, clears — whichever domain the
    // incoming resonator's own onIntro doesn't want, before *anything* in this same outro's own
    // evaluation (including its own stat pass) can still read it. Queued for real after this
    // action resolves; decided now so the read is the true pre-clear state.
    let queuedIntro: Step | null = null;
    if (isOutro(action)) {
      const incoming = this.slots[(this.active + 1) % this.slots.length]!;
      const introAction = incoming.resonator!.onIntro(
        new Ctx({ state: this, slot: incoming, action: null, source: incoming.resonator, owner: incoming.name }),
      );
      queuedIntro = { action: asAction(introAction), slot: incoming.index };
    }

    // resources first, so buffs scaling on a counter see this action's own change. A
    // liberation consumes whatever is banked rather than moving the running total — the
    // declared cost (-125) is kept for display only. An outro actually zeroes both bars: it's
    // the resonator leaving the field with nothing carried over.
    slot.counterLog = [];
    this.enemy.counterLog = [];
    // starts at the action's own declared count; a buff adds to it the same way it adds to
    // Concerto/Energy (Ctx.gainShields), so it needs the same early reset those get below
    slot.shields = action.shields;
    // shared fields every Ctx built below starts from — only `source` (and, for a buff, `owner`)
    // ever varies per call
    const base = { state: this, slot, action, owner: slot.name };

    for (const r of SLOT_RESOURCES) {
      const delta = (action as unknown as Record<string, number>)[r] ?? 0;
      const spendsEverything = delta < 0 && (r === Resource.Energy || r === Resource.Concerto);
      slot.setCounter(r, slot.counter(r) + (spendsEverything ? 0 : delta), action);
    }
    for (const r of TEAM_RESOURCES) {
      const delta = (action as unknown as Record<string, number>)[r] ?? 0;
      this.enemy.setCounter(r, this.enemy.counter(r) + delta, action);
    }
    if (isOutro(action)) {
      slot.setCounter(Resource.Energy, 0, action);
      slot.setCounter(Resource.Concerto, 0, action);
    }

    slot.entries = [];
    this.enemy.entries = [];

    // every buff (local, global, and every debuff ticking on the enemy) applies, stage by
    // stage. A stage **drains**: it runs whatever is waiting, then looks again, until nothing
    // new turns up — so a buff granting another of the same priority still applies this action
    // instead of waiting for the next one. `ran` keeps one apply() per buff/debuff per action
    // and is what makes draining terminate. Global buffs and the enemy's debuffs are each a
    // single shared instance, not per-resonator, so both run on every action regardless of
    // who's acting — a local buff (`slot.list`) only runs on its own holder's turn.
    const ran = new Set<Buff>();

    /** Run one buff or debuff, and keep the name it reports. Its own current stack count is
     *  handed in; the action being evaluated reaches it through `ctx.action` instead. */
    const runBuff = (buff: Buff): void => {
      // the held instance's own stamped owner, not whoever's turn it happens to be — a global
      // buff ticking on someone else's action still grants under its original owner's name
      const ctx = new Ctx({ ...base, source: buff, owner: buff.owner ?? null });
      const said = buff.apply(ctx, buff.stacks);
      if (typeof said === "string" && said) setLabel(buff, said);
    };

    /** Run everything at this band that hasn't run yet, until nothing new appears. */
    const drain = (band: Priority): void => {
      for (let sweep = 0; ; sweep++) {
        const running = [...slot.list.values(), ...this.globalBuffs.values(), ...this.enemy.list.values()]
          .filter((buff) => !ran.has(buff.definition ?? buff) && buff.priority === band);
        if (!running.length) return;
        if (sweep > 1000) {
          throw new Error(`priority band ${band} did not settle — a buff granting new buffs forever?`);
        }
        for (const buff of running) ran.add(buff.definition ?? buff);
        for (const buff of running) runBuff(buff);
      }
    };

    for (const band of PRIORITY_BANDS) {
      drain(band);

      // the action's own body joins its own stage, last. Like a buff, it may return a name —
      // "Fire of Life" rather than the action's own id — which every stat it just added
      // through here (not what buffs it triggered add) then traces back to instead.
      if (action.apply && action.priority === band) {
        const before = slot.entries.length;
        const said = action.apply!(new Ctx({ ...base, source: action }));
        if (typeof said === "string" && said) {
          for (let i = before; i < slot.entries.length; i++) slot.entries[i]!.forcedName = said;
        }
        drain(band);   // and whatever the body just granted at this band runs too
      }
    }

    // every buff/debuff has now named itself, so the traces can be worded
    for (const e of slot.entries) e.source = e.forcedName ?? nameOf(e.src);
    for (const e of this.enemy.entries) e.source = e.forcedName ?? nameOf(e.src);
    for (const e of slot.counterLog) e.source = nameOf(e.src);
    for (const e of this.enemy.counterLog) e.source = nameOf(e.src);
    this.settleLog();

    const snapshot = this.resolve(action, meta);

    if (isOutro(action)) {
      this.active = (this.active + 1) % this.slots.length;
      this.pending.push(queuedIntro!);
    }
    return snapshot;
  }

  /**
   * Collapse the entries into the numbers the damage formula wants. Captured eagerly —
   * `slot.entries` is rebuilt for the next action.
   */
  resolve(action: Action, meta: Partial<Step> = {}): ResolvedSnapshot {
    const slot = this.slot;
    // generic total plus whatever was scoped to this action's element/type; cast and scaling
    // don't participate (see TAGS_MATCHED in stats.js)
    const totals = new Map<string, number>();
    for (const e of slot.entries) totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.value);

    const stat = (s: string): number => tagsOf(action).reduce(
      (n, tag) => n + (totals.get(scopedStat(tag, s)) ?? 0), totals.get(s) ?? 0);

    return {
      action,
      slot: slot.name,
      member: slot.name,
      // a queued follow-up always names the slot it runs on; a plain rotation entry never does
      triggered: meta.slot != null,
      chain: meta.chain ?? null,
      chainOf: meta.chainOf ?? null,
      active: action.active,
      atk: slot.derived(Stat.Atk),
      hp: slot.derived(Stat.Hp),
      def: slot.derived(Stat.Def),
      dmgBonus: stat(Stat.DmgBonus),
      amp: stat(Stat.Amp),
      // read straight off the enemy — its own level/baseRes plus whatever debuffs on it
      // contributed this pass, scoped to this action's own element same as any other stat
      enemyRes: this.enemy.res(action.element ?? ""),
      enemyDef: this.enemy.defense(),
      entries: slot.entries,
      totals,
      stat,
      counters: Object.fromEntries(SLOT_RESOURCES.map((r) => [r, slot.counter(r)])),
      teamCounters: { [Resource.Offtune]: this.enemy.offtune },
      // copied rather than referenced: the automatic tune break resets the off-tune bar after
      // this snapshot, and a live reference would short the panel's arithmetic
      counterLog: [...slot.counterLog],
      teamCounterLog: [...this.enemy.counterLog],
      buffs: [...slot.list.values()].map(nameOf),
      stacks: Object.fromEntries([...slot.list.values()].map((h) => [nameOf(h) ?? "", h.stacks])),
    };
  }

  /** Run a rotation. Follow-ups are spliced in directly after the action that queued them. */
  run(rotation: RotationEntry[]): ResolvedSnapshot[] {
    const out: ResolvedSnapshot[] = [];
    const queue = rotation.flatMap((entry) => this.expand(entry));
    let guard = 0;
    while (queue.length) {
      if (++guard > 10000) throw new Error("action queue did not drain — cyclic queue()?");
      const step = queue.shift()!;
      // the marker only says "cast the echo here" — which echo is whatever this resonator wears
      if (step.action === ECHO_CAST) {
        const acting = this.slots[step.slot ?? this.active]!;
        if (!acting.resonator) throw new Error(`${acting.name} casts ECHO_CAST but has no resonator equipped`);
        step.action = acting.resonator.loadout.mainslot.action;
      }
      this.pending = [];
      // switching to a queued step's slot is temporary, unless the step is an outro
      const before = this.active;
      out.push(this.evaluate(step.action, step));
      if (step.slot != null && this.active === step.slot) this.active = before;
      if (this.pending.length) queue.splice(0, 0, ...this.pending);
    }
    return out;
  }

  /** One rotation entry becomes one or more steps; a chain expands into its members. */
  expand(entry: RotationEntry): Step[] {
    if (!(entry instanceof Chain)) return [{ action: asAction(entry) }];
    const instance = `${entry.id}#${++this.chainSeq}`;
    return entry.members.map((m) => ({ action: m, chain: instance, chainOf: entry.id }));
  }
}

/* ------------------------------------------------------------------------- Ctx */

/**
 * Everything a buff/action/gear callback can read or do, built fresh for one `apply()`/
 * `onFightStart()`/`onIntro()` call and handed in as its first argument. Nothing here is
 * ambient or shared across calls — a `Ctx` is a plain value pointing at the live `State`, so
 * two `State`s (or, down the line, two worker threads) can evaluate at once without a shared
 * mutable global to race on.
 */
export class Ctx {
  readonly state: State;
  readonly slot: Slot;
  readonly action: Action | null;
  /** The buff/action/gear this Ctx was built for — what a stat contribution attributes to. */
  readonly source: unknown;
  /** Which team member's own gear/kit is running right now — what a newly granted buff's own
   *  `owner` inherits. `null` for an engine-wide standing rule with no member behind it. */
  readonly owner: string | null;

  constructor(fields: { state: State; slot: Slot; action: Action | null; source: unknown; owner: string | null }) {
    this.state = fields.state;
    this.slot = fields.slot;
    this.action = fields.action;
    this.source = fields.source;
    this.owner = fields.owner;
  }

  /** How many shields this cast grants so far — the action's own declared count plus whatever
   *  any buff has added via `gainShields`. Same read/mutate shape as Energy/Concerto: a
   *  running value for the current cast, not a settled-in-advance total, so a buff adding to
   *  it needs to run before whoever reads it (same as Jingran's own Ghost Feed already does,
   *  at `UPDATE_BUFFS`). */
  get shields(): number { return this.slot.shields; }

  /** Add shields to the action currently being evaluated — same shape as `gain()` for
   *  Energy/Concerto, just not a fight-long resource (see `Slot.shields`). */
  gainShields(n: number): number { return (this.slot.shields += n); }

  /** The fight's one enemy — its own level, resistances, defence and off-tune. Read-only by
   *  convention; a debuff changes it through `addEnemyRes`/`addEnemyDef`/`grantEnemy`, not by
   *  poking its fields directly. */
  get enemy(): Enemy { return this.state.enemy; }

  /**
   * Contribute to a stat. Ratio stats are percent units: `ctx.add(36, Stat.CritRate)` is +36%.
   * A third form scopes it: `ctx.add(12, "fusion", Stat.DmgBonus)` is 12% fusion damage.
   */
  add(value: number, tagOrStat: string, maybeStat?: string): number {
    const scoped = maybeStat !== undefined;
    const stat = scoped ? scopedStat(tagOrStat, maybeStat) : tagOrStat;
    if (!Number.isFinite(value)) throw new Error(`add(): ${stat} got ${value}`);
    // the object that contributed, not its name — worded once the pass is over
    this.slot.entries.push({ stat, value, src: this.source, owner: this.owner });
    return value;
  }

  /** Running total of a stat, including everything scoped to the action being evaluated. */
  get(stat: string): number {
    return tagsOf(this.action).reduce(
      (n, tag) => n + this.slot.total(scopedStat(tag, stat)), this.slot.total(stat));
  }
  pct(stat: string): number { return isPercent(stat) ? this.get(stat) / 100 : this.get(stat); }

  /** Summed totals. Safe to read from the action's apply() and from LATE conversions. */
  atk(): number { return this.slot.derived(Stat.Atk); }
  hp(): number { return this.slot.derived(Stat.Hp); }
  def(): number { return this.slot.derived(Stat.Def); }

  /* counters — per resonator */
  counter(name: Resource): number { return this.slot.counter(name); }
  setCounter(name: Resource, v: number): number { return this.slot.setCounter(name, v, this.source); }
  gain(name: Resource, n = 1): number {
    return this.slot.setCounter(name, this.slot.counter(name) + n, this.source);
  }
  spend(name: Resource, n: number): boolean {
    const have = this.slot.counter(name);
    if (have < n) return false;
    this.slot.setCounter(name, have - n, this.source);
    return true;
  }

  /* counters — team wide: off-tune, the enemy's own bar */
  teamCounter(name: string): number { return this.state.enemy.counter(name); }
  setTeamCounter(name: string, v: number): number { return this.state.enemy.setCounter(name, v, this.source); }
  gainTeam(name: string, n = 1): number {
    return this.state.enemy.setCounter(name, this.state.enemy.counter(name) + n, this.source);
  }
  spendTeam(name: string, n: number): boolean {
    const have = this.state.enemy.counter(name);
    if (have < n) return false;
    this.state.enemy.setCounter(name, have - n, this.source);
    return true;
  }

  /** The fight's settings: just the resonator's own level now — enemy level/resistance/off-tune
   *  cap all live on `enemy`. Read-only by convention. */
  config(): DamageConfig { return this.state.config; }

  /** Does the acting resonator hold this local buff, or is this global buff currently up —
   *  routed by the buff's own class, so the same call works for either. */
  equipped(buff: Buff): boolean {
    return buff instanceof GlobalBuff ? this.state.hasGlobalBuff(buff) : this.slot.hasBuff(buff);
  }

  /** Contribute to the enemy's resistance to one element, in percent — same shape as `add()` but
   *  scoped to the enemy rather than the acting resonator. Only ever call this from inside a
   *  Debuff's own `apply()`. */
  addEnemyRes(value: number, element: string): number {
    if (!Number.isFinite(value)) throw new Error(`addEnemyRes(): ${element} got ${value}`);
    this.state.enemy.entries.push({ stat: `res:${element}`, value, src: this.source, owner: this.owner });
    return value;
  }

  /** Contribute to the enemy's own defence — same shape as `addEnemyRes`, unscoped since defence
   *  doesn't vary by element. */
  addEnemyDef(value: number): number {
    if (!Number.isFinite(value)) throw new Error(`addEnemyDef(): got ${value}`);
    this.state.enemy.entries.push({ stat: "def", value, src: this.source, owner: this.owner });
    return value;
  }

  /** Put a debuff on the enemy, adding `n` stacks (a fresh grant already carries the first) —
   *  the enemy-side equivalent of `grantSelf`. */
  grantEnemy(debuff: Debuff, n = 1): number { return this.state.enemy.addStack(debuff, n, this.owner); }

  /** The enemy's live stack count for a debuff. 0 if not held. */
  stacksOfEnemy(debuff: Debuff): number { return this.state.enemy.stacksOf(debuff); }

  /** Spend stacks; the debuff drops off the enemy once it is empty. */
  removeStackEnemy(debuff: Debuff, n = 1): boolean { return this.state.enemy.removeStack(debuff, n); }

  /** Take the debuff off the enemy entirely. */
  revokeEnemy(debuff: Debuff): boolean { return this.state.enemy.removeDebuff(debuff); }

  /** The slot an outro is about to hand the field to — who's coming in next in the cycle. */
  nextSlot(): Slot { return this.state.slots[(this.state.active + 1) % this.state.slots.length]!; }

  /** Put a buff on the acting resonator's own list, adding `n` stacks (a fresh grant already
   *  carries the first) — how an action opens a state, or stacks one it already holds. Local
   *  buffs only; a `GlobalBuff` goes through `grantGlobal` instead. */
  grantSelf(buff: Buff, n = 1): number { return this.slot.addStack(buff, n, this.owner); }

  /** Put a global buff on the fight, adding `n` stacks (a fresh grant already carries the first)
   *  — the team-wide equivalent of `grantSelf`. One shared instance, so this doesn't touch any
   *  one resonator's own list. */
  grantGlobal(buff: GlobalBuff, n = 1): number { return this.state.addGlobalStack(buff, n, this.owner); }

  /** Set a global buff to exactly `n` stacks, whether or not it's already held — for a cast that
   *  replaces the buff's own progress rather than adding to it (see `State.setGlobalStacks`). */
  setStacksGlobal(buff: GlobalBuff, n: number): number { return this.state.setGlobalStacks(buff, n, this.owner); }

  /** This resonator's live stack count for a local buff, or the fight's stack count for a global
   *  one — routed by the buff's own class. 0 if not held. */
  stacksOf(buff: Buff): number {
    return buff instanceof GlobalBuff ? this.state.stacksOfGlobal(buff) : this.slot.stacksOf(buff);
  }

  /** Spend stacks; the buff drops off once it is empty — the acting resonator's own copy for a
   *  local buff, the fight's shared copy for a global one. */
  removeStack(buff: Buff, n = 1): boolean {
    return buff instanceof GlobalBuff ? this.state.removeGlobalStack(buff, n) : this.slot.removeStack(buff, n);
  }

  /** Record something notable, prefixed with the action in progress. */
  note(msg: string): void {
    const tag = this.state.tag();
    this.state.events.push({ buff: null, render: () => `${tag}${msg}` });
  }

  /** Queue a follow-up action, evaluated straight after the current one, on the same resonator. */
  queue(action: Action): void {
    asAction(action);
    this.state.pending.push({ action, slot: this.state.active });
  }

  /** Queue a follow-up on a specific resonator rather than whoever is acting — a teammate's own
   *  assist attack, dealing their own damage on their own buffs. */
  queueOn(slot: Slot, action: Action): void {
    asAction(action);
    this.state.pending.push({ action, slot: slot.index });
  }

  /* the buff delivery mechanisms, from inside a buff or action */
  outro(buff: Buff): void { this.state.publishOutro(buff, this.owner); }

  /** Grant a *local* buff to every slot but the acting one's own — the one remaining case a
   *  single shared `GlobalBuff` can't express (it always ticks for whoever's acting, grantor
   *  included). Everything else "the entire team" used to mean now goes through `grantGlobal`.
   *  `n` stacks each, same relative-add shape as `grantSelf`/`grantGlobal`. */
  grantOthers(buff: Buff, n = 1): void {
    for (const s of this.state.slots) if (s !== this.slot) s.addStack(buff, n, this.owner);
  }

  /** Take the buff away entirely — the acting resonator's own copy for a local buff, the fight's
   *  one shared copy for a global one. */
  revoke(buff: Buff): boolean {
    return buff instanceof GlobalBuff ? this.state.removeGlobalBuff(buff) : this.slot.removeBuff(buff);
  }

  /** Every slot currently holding `buff` — or, given a resonator's own name instead, every slot
   *  whose own character that is (a Resonator is no longer a Buff, so finding "Augusta's own
   *  slot" needs a name match rather than an identity check against a shared gear const). */
  slotsWith(target: Buff | string): Slot[] {
    return typeof target === "string"
      ? this.state.slots.filter((s) => s.resonator?.name === target)
      : this.state.slots.filter((s) => s.hasBuff(target));
  }

  /** Every resonator currently on the team, by element — one entry per slot, in team order. */
  teamElements(): (string | null)[] { return this.state.slots.map((s) => s.resonator?.element ?? null); }
}
