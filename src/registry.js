/**
 * Registries for gear, buffs and actions.
 *
 * A **buff** is anything with a name that can apply stats: a passive, a conversion, a state,
 * an outro effect, an action-local effect. It has no life of its own — something has to add
 * it to a resonator.
 *
 * **Gear** is what actually does that adding. A gear entry — a resonator's own kit, a weapon,
 * a mainslot, a sonata, a 2pc — registers a buff of the *same name* automatically, and
 * `State.startFight()` puts that buff on the resonator the moment the gear is equipped.
 * Gear is the only thing with an `onFightStart()` hook, since it is the only thing whose
 * presence at the start of the fight is meaningful — a buff with no gear behind it has to be
 * granted by something during play, at which point `apply()` already runs every action.
 *
 * An **action** is a step in a rotation. It carries the static numbers (motion value, energy,
 * concerto, offtune, forte, shields) and, optionally, an `apply()` of its own — whatever that
 * cast does beyond its numbers, run in the middle of the buff pass rather than registered as a
 * buff somewhere else and referenced by name.
 */

/**
 * Five stages, named for what actually goes in each. There is **no default**: every buff and
 * every action body states its own, so a definition always says when it runs.
 *
 * The pass walks these in order and re-reads the resonator's buff list at each stage, so a buff
 * added by an earlier stage still runs in its own — a weapon can stack a buff into existence at
 * GEAR_STATS and that buff still pays out at BUFF_STATS on the same cast, with nothing needing
 * to be pre-seeded. Only the reverse fails: a buff added at a stage already gone by waits for
 * the next action.
 */
export const PRIORITY = {
  /**
   * What the cast changes, before anything reads a number: open or spend a state, grant or
   * revoke a buff, stack or consume another. Anything with a side effect beyond `add()`.
   *
   * It has to land before anything that reacts to the cast *connecting* — a shield is gained on
   * hit, so Jingran's intro spends his Ghost Shroud here, before his own hit adds to the pile.
   *
   * Nothing here may rely on `hp()` / `atk()`: gear has not contributed yet.
   */
  UPDATE_BUFFS: 0,

  /**
   * Every gear entry, always — `defineGear` assigns this and accepts no priority of its own.
   * Gear supplies the base stat line, so it settles before anything reads a total: the stats
   * at this layer are the "unbuffed" ones.
   */
  GEAR_STATS: 1,

  /**
   * A buff whose `apply()` is nothing but `add()` calls: a stacking buff's payout, a team aura,
   * the stat an outro hands over. Runs after gear, so the two never race.
   */
  BUFF_STATS: 2,

  /**
   * Conversions that read a summed total the stages above built:
   *   Jingran      total HP -> flat ATK, and -> fusion damage
   *   Shorekeeper  total ER -> the team's crit rate and crit damage
   */
  EARLY_CONVERSION: 3,

  /**
   * The last word: conversions reading what an EARLY_CONVERSION produced, and aggregations over
   * everything above.
   *   Tune Break   the team's total break boost -> special amplification
   */
  LATE_CONVERSION: 4,
};

/** The stages in the order the pass walks them. */
export const PRIORITY_BANDS = [...new Set(Object.values(PRIORITY))].sort((a, b) => a - b);

const PRIORITY_NAMES = new Set(Object.values(PRIORITY));

const buffs = new Map();
const gearOnFightStart = new Map();   // name -> hook, only for names registered via defineGear
const actions = new Map();
const chains = new Map();

/**
 * A chain is one thing you type in a rotation that stands for several actions — `BA1234`
 * for the whole basic string. Each member is still evaluated on its own, snapshotting its
 * own buffs; the chain only affects how the result is displayed.
 *
 * Members may be of different types (BA1/BA2 are basic, BA3/BA4 are heavy). That is allowed:
 * the collapsed row shows the total motion value of the whole chain, and the stats of
 * whichever part hit hardest.
 */
export function defineChain(id, members) {
  if (chains.has(id)) throw new Error(`chain "${id}" is already defined`);
  if (!Array.isArray(members) || !members.length) {
    throw new Error(`chain "${id}" needs a non-empty member list`);
  }
  for (const m of members) getAction(m);          // fail fast on a typo
  chains.set(id, { id, members: [...members] });
  return id;
}

export function getChain(id) {
  const c = chains.get(id);
  if (!c) throw new Error(`unknown chain "${id}"`);
  return c;
}
export const hasChain = (id) => chains.has(id);
export const allChains = () => [...chains.values()];

/**
 * A buff: named stats, applied wherever it is added. `apply()` takes no arguments — a buff that
 * stacks reads its own count with `stacksOf(itsName)`, which is live, so it sees stacks granted
 * earlier in the same action. Most buffs never stack at all and never ask (see `Slot.addBuff`
 * in state.js for what actually makes a buff stack).
 */
export function defineBuff(name, def) {
  if (buffs.has(name)) throw new Error(`buff "${name}" is already defined`);
  if (typeof def?.apply !== "function") {
    throw new Error(`buff "${name}" needs an apply() function`);
  }
  if (!PRIORITY_NAMES.has(def.priority)) {
    throw new Error(`buff "${name}" needs an explicit PRIORITY — there is no default`);
  }
  buffs.set(name, { name, priority: def.priority, apply: def.apply });
  return name;
}

/**
 * Gear: registers a buff of the same name (so `defineGear("Weapon", { apply() {...} })` reads
 * exactly like `defineBuff`), plus an optional `onFightStart()` — the one hook only gear gets,
 * run once when `State.startFight()` equips it.
 *
 * Gear is always `GEAR_STATS` and cannot say otherwise: it is what supplies the unbuffed stat
 * line, and everything downstream is ordered around that being settled. Gear that also has to
 * *change* something puts that in its `onFightStart()`, or the effect lives in a buff of its own.
 */
export function defineGear(name, def) {
  if (def?.priority !== undefined) {
    throw new Error(`gear "${name}" cannot set a priority — gear is always GEAR_STATS`);
  }
  defineBuff(name, { priority: PRIORITY.GEAR_STATS, apply: def.apply });
  gearOnFightStart.set(name, def.onFightStart ?? null);
  return name;
}

export const isGear = (name) => gearOnFightStart.has(name);
export const getGearOnFightStart = (name) => gearOnFightStart.get(name) ?? null;

export function defineAction(id, def) {
  if (actions.has(id)) throw new Error(`action "${id}" is already defined`);
  // Only a body needs a stage; an action that is nothing but numbers never runs in the pass.
  if (def.apply && !PRIORITY_NAMES.has(def.priority)) {
    throw new Error(`action "${id}" has an apply() and so needs an explicit PRIORITY`);
  }
  actions.set(id, {
    id,
    source: def.source ?? id.split(":")[0].trim(),
    // tags: what the action *is*. An action resolves the scoped damage bonuses that match
    // these itself, which is why buffs no longer carry a tag filter.
    element: def.element ?? null,
    type: def.type ?? null,
    node: def.node ?? null,
    scaling: def.scaling ?? null,
    mv: def.mv ?? 0,
    // resource deltas, negative to spend
    energy: def.energy ?? 0,
    concerto: def.concerto ?? 0,
    offtune: def.offtune ?? 0,
    forte1: def.forte1 ?? 0,
    forte2: def.forte2 ?? 0,
    forte3: def.forte3 ?? 0,
    forte4: def.forte4 ?? 0,
    // How many shields this action grants. Everything shield-driven in the game is phrased as
    // an event — "upon gaining a Shield, gain 1 stack" — so this is that event, and the buffs
    // that care read it off the action and turn it into stacks of their own.
    shields: def.shields ?? 0,
    // What the action itself does — spend a gauge, open a state, queue a follow-up, add its own
    // stats. Written straight here rather than as a buff the action carries: it only ever runs
    // for this action, so naming and registering it bought nothing but a layer to look through.
    //
    // It runs in `priority`'s stage, after the resonator's own buffs in that stage. An action
    // with a body must state one — a body that reads hp()/atk() cannot sit at UPDATE_BUFFS,
    // since gear has not contributed yet.
    apply: def.apply ?? null,
    priority: def.priority ?? null,
  });
  return id;
}

export function getBuff(name) {
  const b = buffs.get(name);
  if (!b) throw new Error(`unknown buff "${name}"`);
  return b;
}

export function getAction(id) {
  const a = actions.get(id);
  if (!a) throw new Error(`unknown action "${id}"`);
  return a;
}

export const hasBuff = (name) => buffs.has(name);
export const hasAction = (id) => actions.has(id);
export const allBuffs = () => [...buffs.values()];
export const allActions = () => [...actions.values()];

/** Test seam only — the registries are module-level singletons. */
export function _reset() { buffs.clear(); gearOnFightStart.clear(); actions.clear(); chains.clear(); }
