/**
 * Buffs, gear, actions and chains. Each is a class, held by reference — no registry, no name
 * lookup. A rotation is an array of `Action`s, a loadout an array of `Gear`.
 *
 * A **buff** applies stats; something has to add it to a resonator. **Gear** is what does that
 * — it's a buff, equipped by `State.startFight()`, with an optional `onFightStart()`. An
 * **action** is a rotation step: static numbers plus an optional `apply()`.
 *
 * kit.js imports nothing from state.js or stats.js *at runtime*, keeping the dependency graph
 * acyclic — `element`/`type`/`type2`/`cast`/`cast2`/`node`/`scaling` are still typed against
 * stats.ts's own enums (rather than plain `string`), but only via `import type`, which erases
 * entirely at compile time and so never becomes a real runtime edge.
 */
import { mvPercent } from "./damage.js";
import type { Snapshot } from "./damage.js";
import type { Element, DamageType, Cast, Type2, Node, Scaling } from "./stats.js";
// type-only — erased at compile time, so this doesn't become a real runtime edge back to
// state.js (which already imports plenty of runtime values from here, see the header above)
import type { Ctx } from "./state.js";

/**
 * Priority stages, walked in order. Numeric (an ordinal sequence something sorts and compares
 * against), so a real TS enum rather than a string one despite the "prefer string enums"
 * convention elsewhere — the value itself is the sort key, not just an opaque wire label.
 */
export enum Priority {
  /** Side effects before anything reads a number: open/spend a state, grant/revoke a buff. */
  UpdateBuffs = 0,

  /** Gear's own stat line — settles before anything downstream reads a total. */
  GearStats = 1,

  /** Plain `add()` payouts: stacking buffs, team auras, outro stats. */
  BuffStats = 2,

  /** Conversions reading a total built above (e.g. HP -> flat ATK). */
  EarlyConversion = 3,

  /** Conversions reading what EARLY_CONVERSION produced. */
  LateConversion = 4,

  /** After every stat is settled — for a buff that decides to summon another cast. */
  AutoAction = 5,
}

/** Old-style access (`PRIORITY.UPDATE_BUFFS`) kept as an alias object during the conversion —
 *  every resonator file still imports this shape. */
export const PRIORITY = {
  UPDATE_BUFFS: Priority.UpdateBuffs,
  GEAR_STATS: Priority.GearStats,
  BUFF_STATS: Priority.BuffStats,
  EARLY_CONVERSION: Priority.EarlyConversion,
  LATE_CONVERSION: Priority.LateConversion,
  AUTO_ACTION: Priority.AutoAction,
} as const;

/** The stages in the order the pass walks them. */
export const PRIORITY_BANDS: Priority[] =
  [...new Set(Object.values(Priority).filter((v): v is Priority => typeof v === "number"))]
    .sort((a, b) => a - b);

const PRIORITY_NAMES = new Set(PRIORITY_BANDS);

/** What a Buff's `apply()` is handed and may return — `ctx` is the only way in to the acting
 *  slot, the action, or any of the grant/read helpers; nothing is ambient any more. */
export type BuffApply = (ctx: Ctx, stacks: number) => string | void | undefined;

/** What an Action's own `apply()` is handed and may return. */
export type ActionApply = (ctx: Ctx) => string | void | undefined;

/**
 * A buff: applied wherever it is added. `apply(ctx, stacks)` is handed the running calculation
 * and its own current stack count — a buff that doesn't need either just ignores the argument.
 */
export class Buff {
  priority: Priority;
  apply: BuffApply;
  /** The last name `apply()` reported. */
  label: string | null;
  labelAt: number;
  /** How many stacks are live; the ceiling is enforced here. */
  max_stacks: number;
  stacks: number;
  /** Set only on a per-resonator copy made by `instance()` — the shared definition never has
   *  one, which is what `labelOf`/etc. use to tell the two apart. */
  definition?: Buff;
  /** Bookkeeping `Slot.addBuff`/`State.addGlobalBuff`/`Enemy.addDebuff` stamp on an instance —
   *  not read by kit.js itself. */
  via?: string;
  /** Which team member's own gear/kit is responsible for this instance — for display only (the
   *  hover panels' colour bar), never read by the engine itself. Stamped once at grant time:
   *  gear is owned by whoever equipped it; anything a buff or gear grants while its own apply()
   *  is running inherits that same owner, all the way down the chain. `null` on the shared
   *  definition and on anything granted with no live owner to inherit (an engine-wide standing
   *  rule, say). */
  owner?: string | null;

  /**
   * No name is passed in. `apply()` **returns** what this buff is called, every time it runs —
   * a stacking buff writes its own count into that string (`` `Ghost Shroud x${held}` ``).
   */
  constructor(priority: Priority, apply: BuffApply, max_stacks = 1) {
    if (typeof apply !== "function") throw new Error("a buff needs an apply() function");
    if (!PRIORITY_NAMES.has(priority)) {
      throw new Error("a buff needs an explicit PRIORITY — there is no default");
    }
    if (!(max_stacks >= 1)) throw new Error("a buff's max_stacks must be at least 1");
    this.priority = priority;
    this.apply = apply;
    this.label = null;
    this.labelAt = 0;
    this.max_stacks = max_stacks;
    this.stacks = 0;
  }

  /**
   * A copy for one resonator to hold. The exported `const` is the **definition**; a slot holds
   * one of these instead, which is what keeps stacks per-resonator.
   */
  instance(): this {
    const copy = Object.create(Object.getPrototypeOf(this));
    Object.assign(copy, this);
    // holding a buff *is* one stack — there's no such thing as a buff at zero
    copy.stacks = 1;
    copy.definition = this;
    return copy;
  }

  /** Grant stacks, discarding whatever goes past the ceiling. Returns the new count. */
  addStacks(n = 1): number {
    this.stacks = Math.min(this.max_stacks, this.stacks + n);
    return this.stacks;
  }

  /** Spend stacks; never goes below empty. Returns the new count. */
  removeStacks(n = 1): number {
    this.stacks = Math.max(0, this.stacks - n);
    return this.stacks;
  }
}

/**
 * A debuff: the enemy's own equivalent of a Buff — same tick/stack/priority mechanics, held on
 * `Enemy.list` instead of a `Slot.list`. Its `apply()` may only touch enemy stats (`addEnemyRes`/
 * `addEnemyDef`, see state.js) — never a resonator's `add()`. That split is convention, not
 * something the type system enforces; kept a distinct class (rather than just using `Buff`) so
 * `Enemy.list` can't accidentally hold a resonator buff, or a Slot a debuff.
 */
export class Debuff extends Buff {}

/**
 * A global buff: held once on `State` itself rather than per-resonator, and ticks on **every**
 * action regardless of who's acting — the real mechanism behind "the whole team" (a watcher for
 * anyone's Intro/Echo/Liberation cast, or a flat stat everyone should carry). Everything a local
 * `Buff` can do inside `apply()` still applies (`add()` always lands on whoever is currently
 * acting, same as a local buff), so a flat team-wide stat behaves identically either way — the
 * real difference is buffs that *watch* for something regardless of whose turn it is, which
 * used to need a same-buff copy synced onto every slot by hand. Kept a distinct class (rather
 * than just using `Buff`) so `State.globalBuffs` can't accidentally hold a resonator's own local
 * buff, or a Slot a global one.
 */
export class GlobalBuff extends Buff {}

/** Bumped every time a buff reports a name, so the freshest of two labels can be told apart. */
let labelClock = 0;

/** Record what a buff just called itself, on this instance and on the shared definition. */
export function setLabel(buff: Buff, name: string): void {
  const at = ++labelClock;
  buff.label = name;
  buff.labelAt = at;
  if (buff.definition) {
    buff.definition.label = name;
    buff.definition.labelAt = at;
  }
}

/**
 * What something is called, for a log line or a stat trace. A buff only knows its name once it
 * has run — reads whichever of this instance and the shared definition spoke most recently.
 */
export function labelOf(x: unknown): string | null {
  if (x instanceof Action) return x.id;
  if (!(x instanceof Buff)) return x == null ? null : String(x);
  const def = x.definition;
  if (x.label == null) return def?.label ?? null;
  if (def?.label == null) return x.label;
  return (def.labelAt ?? 0) > (x.labelAt ?? 0) ? def.label : x.label;
}

/** For somewhere a string is required whether or not the buff has ever run. */
export const nameOf = (x: unknown): string => labelOf(x) ?? "(unnamed buff)";

/** What an incoming resonator's own Gear decides to trigger next, off their own live state. */
export type OnIntro = (ctx: Ctx) => Action;

/** Gear: a buff that's equipped, plus an optional `onFightStart()` run once at `startFight()`. */
export class Gear extends Buff {
  /** What this piece is called. Unlike a plain Buff — whose name is whatever its `apply()`
   *  returns, so a stacking one can write its own count into it — gear's name is fixed, so it's
   *  declared once here and the constructor wraps `apply()` to report it automatically. */
  name: string;
  onFightStart: ((ctx: Ctx) => void) | null;
  element: Element | null;

  /**
   * `apply()` returns nothing — the wrapper below reports `name` for it. A piece with no stat
   * line at all (a sequence node read directly by another buff, say) can omit it entirely.
   *
   * `element` is a resonator's own elemental identity, declared on their own Gear. Weapons and
   * echoes leave it null, same as `onIntro` — both are `startFight()`-enforced on a resonator's
   * own Gear specifically (the loadout's first entry), not on every Gear that exists.
   *
   * `onIntro()` returns the Action an outro should trigger for this resonator next — plain
   * Intro or an enhanced form, decided from their own live state (Maestro up, Realm stage,
   * whatever the kit gates it on).
   *
   * `priority` defaults to GEAR_STATS, but a piece whose own bonus needs to read a stat other
   * gear still owes contributions to (e.g. a stack's own total Energy Regen) can override it —
   * a conversion band instead of a second buff just to get the later read.
   */
  constructor(
    name: string,
    apply: ((ctx: Ctx, stacks: number) => void) | null = null,
    onFightStart: ((ctx: Ctx) => void) | null = null,
    element: Element | null = null,
    priority: Priority = Priority.GearStats,
  ) {
    if (!name) throw new Error("gear needs a name");
    super(priority, (ctx, stacks) => { apply?.(ctx, stacks); return name; });
    this.name = name;
    this.onFightStart = onFightStart;
    this.element = element;
  }
}

/**
 * A mainslot echo: gear that also carries its own cast. Every build equips exactly one, so a
 * rotation doesn't name the echo — it holds the `ECHO_CAST` marker below, and `State.run()`
 * swaps in whichever mainslot the acting resonator is actually wearing.
 */
export class Mainslot extends Gear {
  /** The cast this echo performs, pulled out by the `ECHO_CAST` marker. */
  action: Action;

  constructor(
    name: string,
    action: Action,
    apply: ((ctx: Ctx, stacks: number) => void) | null = null,
    priority: Priority = Priority.GearStats,
  ) {
    super(name, apply, null, null, null, priority);
    this.action = asAction(action, `mainslot "${name}" needs an Action`);
  }
}

/**
 * A resonance mode: one of several mutually-exclusive stances a resonator can equip for the
 * whole fight, changing which of their own buffs and actions are live — e.g. Lucilla's Glacio
 * Chafe vs Echo mode. Equipped in the loadout exactly like any other Gear (a build commits to a
 * mode, it isn't toggled mid-rotation); a kit's other pieces read which one is present the same
 * way they'd check a sequence Gear (`stacksOf(MODE_ECHO)`). Kept a distinct class purely so a
 * loadout reads intent at a glance, matching `Debuff`/`GlobalBuff`'s own reasoning.
 */
export class Mode extends Gear {}

/** The options bag `new Action(id, def)` takes — everything optional, matching the `??`
 *  defaults in the constructor below. */
export interface ActionDef {
  element?: Element | null;
  type?: DamageType | null;
  type2?: Type2 | null;
  cast?: Cast | null;
  cast2?: Cast | null;
  shields?: number;
  flare?: number;
  chafe?: number;
  heal?: number;
  active?: boolean;
  node?: Node | null;
  scaling?: Scaling | null;
  mv?: number;
  energy?: number;
  concerto?: number;
  offtune?: number;
  forte1?: number;
  forte2?: number;
  forte3?: number;
  forte4?: number;
  forte5?: number;
  apply?: ActionApply | null;
  priority?: Priority | null;
}

/** One step in a rotation. Everything it declares is static; only `apply()` runs. */
export class Action {
  id: string;
  element: Element | null;
  type: DamageType | null;
  /** A second, independent damage-type tag (see TYPE2S in stats.js) — a hit can be both
   *  Heavy Attack DMG and Coordinated Attack DMG at once, which `type` alone can't hold. */
  type2: Type2 | null;
  /**
   * Which button this is (see CASTS in stats.js). Fires this cast's trigger. `null` means
   * this wasn't a player press — a summoned follow-up or the automatic tune break.
   */
  cast: Cast | null;
  /** A second cast identity this action *also* counts as — e.g. a cast: HEAVY action that's
   *  also "considered as performing Echo Skill". An action is at most 1 or 2 casts, never
   *  more, so this is a single value rather than a list, same shape as `type`/`type2`. */
  cast2: Cast | null;
  /** How many shields this cast grants — read back off the action (`action().shields`). */
  shields: number;
  /** How many Electro Flare stacks this cast inflicts — same shape as `shields`, a plain
   *  count for whoever's own kit reacts to it. Nothing reacts to it yet. */
  flare: number;
  /** How many Glacio Chafe stacks this cast inflicts — same shape as `flare`. Chafe itself
   *  deals no damage of its own here (out of scope, same as Electro Flare); Lucilla's signature
   *  weapon is the one thing that reacts to it so far. */
  chafe: number;
  /** How many heal events this cast performs — same shape as `shields`/`flare`, a marker for
   *  whoever's own kit reacts to an ally being healed. Not an amount: healing itself is out
   *  of scope for this calculator (see the standing rule), so this only ever counts events. */
  heal: number;
  /** Is the resonator on field for this cast — a follow-up or an outro is not. */
  active: boolean;
  /**
   * Which branch of the kit this comes out of (see NODES in stats.js). Pure attribution data
   * — nothing in the engine branches on it. An echo or outro has none.
   */
  node: Node | null;
  scaling: Scaling | null;
  mv: number;
  // resource deltas, negative to spend
  energy: number;
  concerto: number;
  offtune: number;
  forte1: number;
  forte2: number;
  forte3: number;
  forte4: number;
  forte5: number;
  // what the action itself does, beyond its declared numbers
  apply: ActionApply | null;
  priority: Priority | null;

  constructor(id: string, def: ActionDef = {}) {
    this.id = id;
    this.element = def.element ?? null;
    this.type = def.type ?? null;
    this.type2 = def.type2 ?? null;
    this.cast = def.cast ?? null;
    this.cast2 = def.cast2 ?? null;
    this.shields = def.shields ?? 0;
    this.flare = def.flare ?? 0;
    this.chafe = def.chafe ?? 0;
    this.heal = def.heal ?? 0;
    this.active = def.active ?? true;
    this.node = def.node ?? null;
    this.scaling = def.scaling ?? null;
    this.mv = def.mv ?? 0;
    this.energy = def.energy ?? 0;
    this.concerto = def.concerto ?? 0;
    this.offtune = def.offtune ?? 0;
    this.forte1 = def.forte1 ?? 0;
    this.forte2 = def.forte2 ?? 0;
    this.forte3 = def.forte3 ?? 0;
    this.forte4 = def.forte4 ?? 0;
    this.forte5 = def.forte5 ?? 0;
    this.apply = def.apply ?? null;
    this.priority = def.priority ?? null;
    if (this.apply && !PRIORITY_NAMES.has(this.priority as Priority)) {
      throw new Error(`action "${id}" has an apply() and so needs an explicit PRIORITY`);
    }
  }

  /** Does this action carry any of these tags — element, type, type2, cast, cast2, or node? */
  is(...tags: string[]): boolean {
    return tags.some((t) => t === this.element || t === this.type || t === this.type2
      || t === this.cast || t === this.cast2 || t === this.node);
  }

  toString(): string { return this.id; }
}

/** Rotation marker: "cast the equipped mainslot echo here". Never evaluated itself — `run()`
 *  replaces it with the acting resonator's own `Mainslot.action` before it reaches `evaluate`. */
export const ECHO_CAST = new Action("Echo Cast");

/**
 * A chain stands for several actions in a rotation (`BA1234`). Each member is evaluated on its
 * own; the chain only affects how the result is displayed. Members may differ in type — the
 * collapsed row shows total motion value and the hardest-hitting part's stats.
 */
export class Chain {
  id: string;
  members: Action[];

  constructor(id: string, members: Action[]) {
    if (!Array.isArray(members) || !members.length) {
      throw new Error(`chain "${id}" needs a non-empty member list`);
    }
    for (const m of members) {
      if (!(m instanceof Action)) {
        throw new Error(`chain "${id}" has a member that is not an Action: ${m}`);
      }
    }
    this.id = id;
    this.members = [...members];
  }
  toString(): string { return this.id; }
}

/** One evaluated rotation step, as `State.run()` returns them alongside a computed `dmg`. */
export interface ChainRow {
  snap: Snapshot;
  dmg: { noCrit: number; crit: number; avg: number };
}

export interface ChainGroup {
  id: string;
  isChain: boolean;
  parts: ChainRow[];
  snap: Snapshot;
  mv: number;
  noCrit: number;
  crit: number;
  avg: number;
}

/**
 * Collapse chain results for display: total motion value, summed damage, and the stats of
 * whichever part hit hardest. Only groups results — no calculation changes here.
 *
 * @param rows  [{ snap, dmg }] in evaluation order, as returned alongside State.run()
 * @returns     [{ id, parts, snap, mv, noCrit, crit, avg, isChain }]
 */
export function collapseChains(rows: ChainRow[]): ChainGroup[] {
  const groups: Array<{ id: string; parts: ChainRow[]; isChain: boolean }> = [];
  const byInstance = new Map<string, { id: string; parts: ChainRow[]; isChain: boolean }>();

  for (const row of rows) {
    const instance = row.snap.chain;
    if (!instance) {
      groups.push({ id: row.snap.action.id, parts: [row], isChain: false });
      continue;
    }
    const existing = byInstance.get(instance);
    if (existing) {
      existing.parts.push(row);
    } else {
      const group = { id: row.snap.chainOf ?? row.snap.action.id, parts: [row], isChain: true };
      byInstance.set(instance, group);
      groups.push(group);
    }
  }

  return groups.map((g) => {
    const best = g.parts.reduce((a, b) => (b.dmg.avg > a.dmg.avg ? b : a));
    const sum = (pick: (p: ChainRow) => number) => g.parts.reduce((n, p) => n + pick(p), 0);
    return {
      id: g.id,
      isChain: g.isChain,
      parts: g.parts,
      snap: best.snap,
      mv: sum((p) => mvPercent(p.snap)),
      noCrit: sum((p) => p.dmg.noCrit),
      crit: sum((p) => p.dmg.crit),
      avg: sum((p) => p.dmg.avg),
    };
  });
}

/* --------------------------------------------------------------------- guards */

/** A *local* buff specifically — rejects a Debuff or a GlobalBuff even though both are
 *  technically `instanceof Buff`, so a Slot can't end up holding either by mistake. */
export function asBuff(b: unknown, what = "a buff"): Buff {
  if (!(b instanceof Buff) || b instanceof Debuff || b instanceof GlobalBuff) {
    throw new TypeError(`expected ${what}, got ${b}`);
  }
  return b;
}

export function asDebuff(d: unknown, what = "a debuff"): Debuff {
  if (!(d instanceof Debuff)) throw new TypeError(`expected ${what}, got ${d}`);
  return d;
}

export function asGlobalBuff(g: unknown, what = "a global buff"): GlobalBuff {
  if (!(g instanceof GlobalBuff)) throw new TypeError(`expected ${what}, got ${g}`);
  return g;
}

export function asAction(a: unknown, what = "an action"): Action {
  if (!(a instanceof Action)) throw new TypeError(`expected ${what}, got ${a}`);
  return a;
}
