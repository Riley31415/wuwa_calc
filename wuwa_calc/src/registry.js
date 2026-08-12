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
 * concerto, offtune, forte) and the names of the buffs it brings with it for that action only.
 * It has no hook of its own beyond that.
 */

/**
 * Four stages, the same shape the spreadsheet's column order encoded. A buff that only *adds*
 * a stat can stay at DEFAULT — sums do not care about order. A buff that *reads* a stat has to
 * run after everything that feeds it, and that is what the later stages are for.
 *
 *   DEFAULT  flat and percent stats, states, gauges. Nearly everything.
 *
 *   LATE     conversions that read a summed total which DEFAULT buffs built:
 *              Jingran   total HP -> flat ATK, and -> fusion damage
 *              Brant, Sigrika  their equivalents
 *              Shorekeeper  total ER -> the team's crit rate and crit damage
 *
 *   LATER    conversions that read what a LATE conversion produced. A second HP -> ATK
 *            passive reading the ATK a LATE one just added belongs here.
 *
 *   LATEST   the last word: aggregations over everything above.
 *              Tune Break  total break boost -> special amplification
 */
export const PRIORITY = {
  DEFAULT: 0,
  LATE: 1,
  LATER: 2,
  LATEST: 3,
};

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
 * A buff: named stats, applied wherever it is added. `apply(stacks)` receives however many
 * stacks the resonator currently holds of it — most buffs ignore the argument, since most
 * buffs are never added more than once (see `Slot.addBuff` in state.js for what actually
 * makes a buff stack).
 */
export function defineBuff(name, def) {
  if (buffs.has(name)) throw new Error(`buff "${name}" is already defined`);
  if (typeof def?.apply !== "function") {
    throw new Error(`buff "${name}" needs an apply() function`);
  }
  buffs.set(name, {
    name,
    priority: def.priority ?? PRIORITY.DEFAULT,
    apply: def.apply,
  });
  return name;
}

/**
 * Gear: registers a buff of the same name (so `defineGear("Weapon", { apply() {...} })` reads
 * exactly like `defineBuff`), plus an optional `onFightStart()` — the one hook only gear gets,
 * run once when `State.startFight()` equips it.
 */
export function defineGear(name, def) {
  defineBuff(name, { priority: def.priority, apply: def.apply });
  gearOnFightStart.set(name, def.onFightStart ?? null);
  return name;
}

export const isGear = (name) => gearOnFightStart.has(name);
export const getGearOnFightStart = (name) => gearOnFightStart.get(name) ?? null;

function normaliseBuffs(value) {
  if (!value) return [];
  const names = Array.isArray(value) ? value : [value];
  for (const n of names) getBuff(n);        // fail fast on a typo or a definition order slip
  return names;
}

export function defineAction(id, def) {
  if (actions.has(id)) throw new Error(`action "${id}" is already defined`);
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
    // A generic per-cast count: dot applications for one kit, shield grants for another,
    // tune-shift charges for a third. The engine just tracks the running total; what it
    // means is up to whatever buff reads it for a given action.
    applications: def.applications ?? 0,
    // buffs this action brings with it, for this action only
    buffs: normaliseBuffs(def.buffs ?? def.buff),
    // a buff name to publish to the outro queue on cast — the declarative alternative to a
    // buff whose only job is calling outro(). Only meaningful on an outro action.
    outro: def.outro ?? null,
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
