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
 * Authoring style: functions use the ambient namespace (`add(36, CRIT_RATE)`) rather than
 * threading `state` through every call. `withContext` binds it.
 */
import {
  Stat, Resource, DamageType, Cast,
  isPercent, SLOT_RESOURCES, TEAM_RESOURCES, scopedStat, TAGS_MATCHED,
} from "./stats.js";
import {
  Buff, Debuff, GlobalBuff, Gear, Mode, Chain, Action, asBuff, asDebuff, asGlobalBuff, asAction,
  labelOf, nameOf, setLabel, PRIORITY, PRIORITY_BANDS,
} from "./kit.js";
import type { Priority } from "./kit.js";
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

/** A single loadout: the resonator's own Gear first, then weapon/echo/sonata/mainstats/etc. */
export type Loadout = Gear[];

export class Slot {
  name: string;
  index: number;
  state: State | null;
  list: Map<Buff, HeldBuff>;
  energy: number;
  concerto: number;
  forte1: number;
  forte2: number;
  forte3: number;
  forte4: number;
  entries: StatEntry[];
  counterLog: CounterLogEntry[];
  resonator: Gear | null;
  data: Record<string, unknown>;

  constructor(name: string, index: number, state: State | null = null) {
    this.name = name;
    this.index = index;
    /** The fight this slot belongs to, so buff events can reach its log. */
    this.state = state;
    /** Every buff on this resonator. Buff -> instance (carries its own `via`). */
    this.list = new Map();
    /** Resources and gauges: six real fields, not a map — `counter()`/`setCounter()` reject
     *  any other name. Forte gauges stay generic; a kit assigns its own meaning to one. */
    this.energy = 0;
    this.concerto = 0;
    this.forte1 = 0;
    this.forte2 = 0;
    this.forte3 = 0;
    this.forte4 = 0;
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
   *  here; `addStack` is what moves the stack count. */
  addBuff(buff: Buff, { via = "gear" }: { via?: string } = {}): this {
    asBuff(buff);
    if (this.list.has(buff)) return this;
    this.note(buff, () => `gained ${nameOf(this.list.get(buff) ?? buff)} (${via})`);
    const entry = buff.instance();
    entry.via = via;
    this.list.set(buff, entry);
    return this;
  }

  /** Hold the buff if not already held, and stack this resonator's own instance of it. */
  addStack(buff: Buff, n = 1): number {
    // a grant already carries the first stack
    const fresh = !this.list.has(buff);
    this.addBuff(buff, { via: "state" });
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

  /** One of the six named resources — throws on anything else. */
  counter(name: Resource): number {
    switch (name) {
      case Resource.Energy: return this.energy;
      case Resource.Concerto: return this.concerto;
      case Resource.Forte1: return this.forte1;
      case Resource.Forte2: return this.forte2;
      case Resource.Forte3: return this.forte3;
      case Resource.Forte4: return this.forte4;
      default: throw new Error(`Slot: no such counter "${name}"`);
    }
  }
  setCounter(name: Resource, v: number): number {
    const before = this.counter(name);
    switch (name) {
      case Resource.Energy: this.energy = v; break;
      case Resource.Concerto: this.concerto = v; break;
      case Resource.Forte1: this.forte1 = v; break;
      case Resource.Forte2: this.forte2 = v; break;
      case Resource.Forte3: this.forte3 = v; break;
      case Resource.Forte4: this.forte4 = v; break;
    }
    // the object that moved it, not its name — resolved once the buff has named itself
    if (v !== before) this.counterLog.push({ counter: name, delta: v - before, src: CTX?.source });
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
   *  `addStack` is what moves the stack count. */
  addDebuff(debuff: Debuff, { via = "grant" }: { via?: string } = {}): this {
    asDebuff(debuff);
    if (this.list.has(debuff)) return this;
    this.note(debuff, () => `gained ${nameOf(this.list.get(debuff) ?? debuff)} (${via})`);
    const entry = debuff.instance();
    entry.via = via;
    this.list.set(debuff, entry);
    return this;
  }

  /** Hold the debuff if not already held, and stack it. */
  addStack(debuff: Debuff, n = 1): number {
    // a grant already carries the first stack
    const fresh = !this.list.has(debuff);
    this.addDebuff(debuff, { via: "state" });
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
    return (this.baseRes[element] ?? 0) + this.total(`res:${element}`);
  }

  /** Current defence: the level-derived base, plus whatever debuffs contributed this pass. */
  defense(): number {
    return 792 + this.level * 8 + this.total("def");
  }

  /** Off-tune is the only enemy counter — throws on anything else, same as `Slot.counter`. */
  counter(name: string): number {
    if (name !== Resource.Offtune) throw new Error(`Enemy: no such counter "${name}"`);
    return this.offtune;
  }
  setCounter(name: string, v: number): number {
    const before = this.counter(name);
    this.offtune = v;
    if (v !== before) this.counterLog.push({ counter: name, delta: v - before, src: CTX?.source });
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
  outroQueue: Buff[];
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
   *  `addGlobalStack` is what moves the stack count. */
  addGlobalBuff(buff: GlobalBuff, { via = "grant" }: { via?: string } = {}): this {
    asGlobalBuff(buff);
    if (this.globalBuffs.has(buff)) return this;
    this.noteGlobal(buff, () => `gained ${nameOf(this.globalBuffs.get(buff) ?? buff)} (${via})`);
    const entry = buff.instance();
    entry.via = via;
    this.globalBuffs.set(buff, entry);
    return this;
  }

  /** Hold the global buff if not already held, and stack it. */
  addGlobalStack(buff: GlobalBuff, n = 1): number {
    // a grant already carries the first stack
    const fresh = !this.globalBuffs.has(buff);
    this.addGlobalBuff(buff, { via: "state" });
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
  setGlobalStacks(buff: GlobalBuff, n: number): number {
    const clamped = Math.min(buff.max_stacks, Math.max(0, n));
    const before = this.stacksOfGlobal(buff);
    if (before < clamped) this.addGlobalStack(buff, clamped - before);
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

  /** Mechanism 1 — equip each resonator's gear, then run every equipped gear's onFightStart(). */
  startFight(loadouts: Record<string, Loadout>): this {
    for (const [slotName, gearList] of Object.entries(loadouts)) {
      const slot = this.slotOf(slotName);
      if (!slot) throw new Error(`no slot named "${slotName}"`);
      const seen = new Set<Gear>();
      for (const gear of gearList) {
        if (!(gear instanceof Gear)) {
          throw new Error(`${slotName}: startFight() only equips Gear, got ${gear}`);
        }
        // by identity — equipping the same object twice doubles a stat line
        if (seen.has(gear)) throw new Error(`${slotName} equips the same gear twice`);
        seen.add(gear);
        slot.addBuff(gear, { via: "gear" });
      }
      // a build commits to one stance, same as it can only equip one weapon
      const modes = gearList.filter((g) => g instanceof Mode);
      if (modes.length > 1) {
        throw new Error(`${slotName} equips ${modes.length} Resonance Mode pieces, at most one`);
      }
      // the first entry is the resonator themself, by loadout convention
      slot.resonator = gearList[0] ?? null;
      if (typeof slot.resonator?.onIntro !== "function") {
        throw new Error(`${slotName}: resonator gear needs an onIntro()`);
      }
    }
    for (const [slotName, gearList] of Object.entries(loadouts)) {
      const slot = this.slotOf(slotName)!;
      for (const gear of gearList) {
        if (!gear.onFightStart) continue;
        withContext({ state: this, slot, action: null, source: gear }, gear.onFightStart);
      }
    }
    return this;
  }

  /** Mechanism 2 — publish a buff for whoever intros next. */
  publishOutro(buff: Buff): void {
    asBuff(buff);
    this.outroQueue.push(buff);
    const tag = this.tag();
    this.events.push({ buff, render: () => `${tag}published ${nameOf(buff)} to the outro queue` });
  }

  /** Mechanism 2 — the acting resonator intros and adopts whatever is queued. Each adopted buff
   *  is responsible for revoking itself on this resonator's own outro — no engine-level
   *  special case for it. */
  adoptOutroBuffs(): Buff[] {
    if (!this.outroQueue.length) return [];
    const taken = this.outroQueue.splice(0);
    for (const buff of taken) this.slot.addBuff(buff, { via: "outro" });
    return taken;
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
      const introAction = withContext(
        { state: this, slot: incoming, action: null, source: incoming.resonator },
        () => incoming.resonator!.onIntro!(),
      );
      queuedIntro = { action: asAction(introAction), slot: incoming.index };
    }

    // resources first, so buffs scaling on a counter see this action's own change. A
    // liberation consumes whatever is banked rather than moving the running total — the
    // declared cost (-125) is kept for display only. An outro actually zeroes both bars: it's
    // the resonator leaving the field with nothing carried over.
    slot.counterLog = [];
    this.enemy.counterLog = [];
    const ctx: Context = { state: this, slot, action, source: null };

    withContext({ ...ctx, source: action }, () => {
      for (const r of SLOT_RESOURCES) {
        const delta = (action as unknown as Record<string, number>)[r] ?? 0;
        const spendsEverything = delta < 0 && (r === Resource.Energy || r === Resource.Concerto);
        slot.setCounter(r, slot.counter(r) + (spendsEverything ? 0 : delta));
      }
      for (const r of TEAM_RESOURCES) {
        const delta = (action as unknown as Record<string, number>)[r] ?? 0;
        this.enemy.setCounter(r, this.enemy.counter(r) + delta);
      }
      if (isOutro(action)) {
        slot.setCounter(Resource.Energy, 0);
        slot.setCounter(Resource.Concerto, 0);
      }
    });

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

    /** Run one buff or debuff, and keep the name it reports. Its own current stack count and
     *  the action being evaluated are handed in — most bodies would otherwise open with
     *  `stacksOf(SELF)` and/or `action()`. */
    const runBuff = (buff: Buff): void => {
      const said = withContext({ ...ctx, source: buff }, () => buff.apply(buff.stacks, action));
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
        const said = withContext({ ...ctx, source: action }, () => action.apply!());
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
      counters: {
        [Resource.Energy]: slot.energy, [Resource.Concerto]: slot.concerto,
        [Resource.Forte1]: slot.forte1, [Resource.Forte2]: slot.forte2,
        [Resource.Forte3]: slot.forte3, [Resource.Forte4]: slot.forte4,
      },
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

/* ------------------------------------------------- the ambient state namespace */

/** What every ambient function reads via `cur()` — bound for the duration of one `withContext`
 *  call (one buff's `apply()`, one action's `apply()`, one `onFightStart()`/`onIntro()`). */
export interface Context {
  state: State;
  slot: Slot;
  action: Action | null;
  source: unknown;
}

let CTX: Context | null = null;

export function withContext<T>(ctx: Context, fn: () => T): T {
  const prev = CTX;
  CTX = ctx;
  try { return fn(); } finally { CTX = prev; }
}

function cur(): Context {
  if (!CTX) throw new Error("no active calculation — call inside State.evaluate()");
  return CTX;
}

/**
 * Contribute to a stat. Ratio stats are percent units: `add(36, Stat.CritRate)` is +36%.
 * A third form scopes it: `add(12, "fusion", Stat.DmgBonus)` is 12% fusion damage.
 */
export function add(value: number, tagOrStat: string, maybeStat?: string): number {
  const scoped = maybeStat !== undefined;
  const stat = scoped ? scopedStat(tagOrStat, maybeStat) : tagOrStat;
  if (!Number.isFinite(value)) throw new Error(`add(): ${stat} got ${value}`);
  const c = cur();
  // the object that contributed, not its name — worded once the pass is over
  c.slot.entries.push({ stat, value, src: c.source });
  return value;
}

/** Running total of a stat, including everything scoped to the action being evaluated. */
export function get(stat: string): number {
  const c = cur();
  return tagsOf(c.action).reduce(
    (n, tag) => n + c.slot.total(scopedStat(tag, stat)), c.slot.total(stat));
}
export const pct = (stat: string): number => (isPercent(stat) ? get(stat) / 100 : get(stat));

/** Summed totals. Safe to read from the action's apply() and from LATE conversions. */
export const atk = (): number => cur().slot.derived(Stat.Atk);
export const hp = (): number => cur().slot.derived(Stat.Hp);
export const def = (): number => cur().slot.derived(Stat.Def);

/* counters — per resonator */
export const counter = (name: Resource): number => cur().slot.counter(name);
export const setCounter = (name: Resource, v: number): number => cur().slot.setCounter(name, v);
export const gain = (name: Resource, n = 1): number =>
  cur().slot.setCounter(name, cur().slot.counter(name) + n);
export function spend(name: Resource, n: number): boolean {
  const have = cur().slot.counter(name);
  if (have < n) return false;
  cur().slot.setCounter(name, have - n);
  return true;
}

/* counters — team wide: off-tune, the enemy's own bar */
export const teamCounter = (name: string): number => cur().state.enemy.counter(name);
export const setTeamCounter = (name: string, v: number): number => cur().state.enemy.setCounter(name, v);
export const gainTeam = (name: string, n = 1): number =>
  cur().state.enemy.setCounter(name, cur().state.enemy.counter(name) + n);
export function spendTeam(name: string, n: number): boolean {
  const have = cur().state.enemy.counter(name);
  if (have < n) return false;
  cur().state.enemy.setCounter(name, have - n);
  return true;
}
/** The action being evaluated — the `Action` itself, whose `is()` tests element / type / cast. */
export const action = (): Action | null => cur().action;

/** The fight's settings: just the resonator's own level now — enemy level/resistance/off-tune
 *  cap all live on `enemy()`. Read-only by convention. */
export const config = (): DamageConfig => cur().state.config;

/** Does the acting resonator hold this local buff, or is this global buff currently up —
 *  routed by the buff's own class, so the same call works for either. */
export const equipped = (buff: Buff): boolean =>
  buff instanceof GlobalBuff ? cur().state.hasGlobalBuff(buff) : cur().slot.hasBuff(buff);
export const self = (): Slot => cur().slot;

/** The fight's one enemy — its own level, resistances, defence and off-tune. Read-only by
 *  convention; a debuff changes it through `addEnemyRes`/`addEnemyDef`/`grantEnemy`, not by
 *  poking its fields directly. */
export const enemy = (): Enemy => cur().state.enemy;

/** Contribute to the enemy's resistance to one element, in percent — same shape as `add()` but
 *  scoped to the enemy rather than the acting resonator. Only ever call this from inside a
 *  Debuff's own `apply()`. */
export function addEnemyRes(value: number, element: string): number {
  if (!Number.isFinite(value)) throw new Error(`addEnemyRes(): ${element} got ${value}`);
  cur().state.enemy.entries.push({ stat: `res:${element}`, value, src: cur().source });
  return value;
}

/** Contribute to the enemy's own defence — same shape as `addEnemyRes`, unscoped since defence
 *  doesn't vary by element. */
export function addEnemyDef(value: number): number {
  if (!Number.isFinite(value)) throw new Error(`addEnemyDef(): got ${value}`);
  cur().state.enemy.entries.push({ stat: "def", value, src: cur().source });
  return value;
}

/** Put a debuff on the enemy, adding `n` stacks (a fresh grant already carries the first) —
 *  the enemy-side equivalent of `grantSelf`. */
export const grantEnemy = (debuff: Debuff, n = 1): number => cur().state.enemy.addStack(debuff, n);

/** The enemy's live stack count for a debuff. 0 if not held. */
export const stacksOfEnemy = (debuff: Debuff): number => cur().state.enemy.stacksOf(debuff);

/** Spend stacks; the debuff drops off the enemy once it is empty. */
export const removeStackEnemy = (debuff: Debuff, n = 1): boolean => cur().state.enemy.removeStack(debuff, n);

/** Take the debuff off the enemy entirely. */
export const revokeEnemy = (debuff: Debuff): boolean => cur().state.enemy.removeDebuff(debuff);

/** The slot an outro is about to hand the field to — who's coming in next in the cycle. */
export const nextSlot = (): Slot => {
  const c = cur();
  return c.state.slots[(c.state.active + 1) % c.state.slots.length]!;
};
/** Put a buff on the acting resonator's own list, adding `n` stacks (a fresh grant already
 *  carries the first) — how an action opens a state, or stacks one it already holds. Local
 *  buffs only; a `GlobalBuff` goes through `grantGlobal` instead. */
export const grantSelf = (buff: Buff, n = 1): number => cur().slot.addStack(buff, n);

/** Put a global buff on the fight, adding `n` stacks (a fresh grant already carries the first)
 *  — the team-wide equivalent of `grantSelf`. One shared instance, so this doesn't touch any
 *  one resonator's own list. */
export const grantGlobal = (buff: GlobalBuff, n = 1): number => cur().state.addGlobalStack(buff, n);

/** Set a global buff to exactly `n` stacks, whether or not it's already held — for a cast that
 *  replaces the buff's own progress rather than adding to it (see `State.setGlobalStacks`). */
export const setStacksGlobal = (buff: GlobalBuff, n: number): number => cur().state.setGlobalStacks(buff, n);

/** This resonator's live stack count for a local buff, or the fight's stack count for a global
 *  one — routed by the buff's own class. 0 if not held. */
export const stacksOf = (buff: Buff): number =>
  buff instanceof GlobalBuff ? cur().state.stacksOfGlobal(buff) : cur().slot.stacksOf(buff);

/** Spend stacks; the buff drops off once it is empty — the acting resonator's own copy for a
 *  local buff, the fight's shared copy for a global one. */
export const removeStack = (buff: Buff, n = 1): boolean =>
  buff instanceof GlobalBuff ? cur().state.removeGlobalStack(buff, n) : cur().slot.removeStack(buff, n);

/** Record something notable, prefixed with the action in progress. */
export function note(msg: string): void {
  const tag = cur().state.tag();
  cur().state.events.push({ buff: null, render: () => `${tag}${msg}` });
}

/** Queue a follow-up action, evaluated straight after the current one, on the same resonator. */
export function queue(action: Action): void {
  asAction(action);
  cur().state.pending.push({ action, slot: cur().state.active });
}

/** Queue a follow-up on a specific resonator rather than whoever is acting — a teammate's own
 *  assist attack, dealing their own damage on their own buffs. */
export function queueOn(slot: Slot, action: Action): void {
  asAction(action);
  cur().state.pending.push({ action, slot: slot.index });
}

/* the buff delivery mechanisms, from inside a buff or action */
export const outro = (buff: Buff): void => cur().state.publishOutro(buff);

/** Grant a *local* buff to every slot but the acting one's own — the one remaining case a
 *  single shared `GlobalBuff` can't express (it always ticks for whoever's acting, grantor
 *  included). Everything else "the entire team" used to mean now goes through `grantGlobal`.
 *  `n` stacks each, same relative-add shape as `grantSelf`/`grantGlobal`. */
export function grantOthers(buff: Buff, n = 1): void {
  const c = cur();
  for (const s of c.state.slots) if (s !== c.slot) s.addStack(buff, n);
}

/** Take the buff away entirely — the acting resonator's own copy for a local buff, the fight's
 *  one shared copy for a global one. */
export const revoke = (buff: Buff): boolean =>
  buff instanceof GlobalBuff ? cur().state.removeGlobalBuff(buff) : cur().slot.removeBuff(buff);

/** Every slot currently holding `buff`. */
export const slotsWith = (buff: Buff): Slot[] => cur().state.slots.filter((s) => s.hasBuff(buff));

/** Every resonator currently on the team, by element — one entry per slot, in team order. */
export const teamElements = (): (string | null)[] =>
  cur().state.slots.map((s) => s.resonator?.element ?? null);
