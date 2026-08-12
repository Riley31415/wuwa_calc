/**
 * Actions and gear that are not tied to one resonator. Anything only a single resonator can
 * use belongs in that resonator's file instead.
 */
import { defineAction, defineBuff, defineGear, PRIORITY } from "./registry.js";
import { add, get } from "./state.js";
import {
  SPECIAL_AMP, TBB, CRIT_RATE, CRIT_DMG, ER, dmgBonusFor,
  BONUS_ATK, BONUS_HP, BONUS_DEF, FLAT_ATK, FLAT_HP, FLAT_DEF,
  BASIC_DMG, HEAVY_DMG, SKILL_DMG, LIB_DMG,
} from "./stats.js";

/**
 * Tune break boost converts one for one into special amplification.
 *
 * LATEST, because it has to read the whole team's break boost after every other buff has
 * contributed — including any conversion that grants break boost itself. Special amp is also
 * the only multiplier tune damage still receives, since the ordinary damage bonus and
 * amplification are both gated off for tune, so this conversion is the entire point of TBB.
 */
export const TUNE_BREAK_AMP = defineBuff("Tune Break: TBB amp", {
  priority: PRIORITY.LATEST,
  apply() { add(get(TBB), SPECIAL_AMP); },
});

/** Off-tune break. Scales off the tune constant rather than a stat, and bypasses crit. */
export const TUNE_BREAK = defineAction("Tune Break", {
  source: "Tune Break",
  element: "physical",
  scaling: "tune",
  type: "break",
  mv: 1600,
  buffs: [TUNE_BREAK_AMP],
});

/* ========================================================== echo main stats */
/**
 * An echo build's main stats.
 *
 * Five echoes. Each carries one main stat picked from what its cost allows, plus a fixed
 * secondary that the cost alone decides — so a build is fully described by which costs it runs
 * and what each of them rolled. Values are the 5-star level-25 numbers from the wiki's
 * Echo/Stats table.
 *
 * A 3-cost's elemental damage is held per element, scoped the way any other elemental bonus is
 * — `dmgBonus:fusion` rather than a generic `dmgBonus`. The old sheet kept it generic on the
 * assumption you only ever slot the element you are already playing, which is true of a build
 * you would actually run but makes a mismatched one silently pay full price.
 *
 * Healing bonus is the one legal 4-cost main stat left out — this calculator ignores healing.
 */
const ELEMENTS = ["glacio", "fusion", "electro", "aero", "spectro", "havoc"];

const MAIN = {
  4: { CR: [CRIT_RATE, 22], CD: [CRIT_DMG, 44],
       ATK: [BONUS_ATK, 33], HP: [BONUS_HP, 33], DEF: [BONUS_DEF, 41.8] },
  3: { ER: [ER, 32], ATK: [BONUS_ATK, 30], HP: [BONUS_HP, 30], DEF: [BONUS_DEF, 38],
       ...Object.fromEntries(ELEMENTS.map((e) => [e, [dmgBonusFor(e), 30]])) },
  1: { atk: [BONUS_ATK, 18], hp: [BONUS_HP, 22.8], def: [BONUS_DEF, 18] },
};

/** What a cost gives on top of its main stat, whatever that main stat turned out to be. */
const SECONDARY = { 4: [FLAT_ATK, 150], 3: [FLAT_ATK, 100], 1: [FLAT_HP, 2280] };

/** Five echoes to a build, and the game caps their total cost at twelve. */
const SLOTS = 5, COST_CAP = 12;

/**
 * Define one main-stat build, written as its 4-cost, 3-cost and 1-cost slots — each a
 * space-separated list in the shorthand `MAIN` above uses. `mainstats("CR CD", "", "atk atk
 * atk")` is the 44111 double-crit build.
 *
 * The name it gets — and returns, so a loadout can name it — leads with the cost layout, as
 * the sheet's own `44111 hp` did. That is not decoration: ATK, HP and DEF are legal main stats
 * at both cost 4 and cost 3, so "ATK ATK atk atk atk" alone could be either a 43111 or a 44111
 * and the two are different builds.
 */
export function mainstats(c4 = "", c3 = "", c1 = "") {
  const slots = [[4, c4], [3, c3], [1, c1]].flatMap(([cost, spec]) =>
    spec.split(" ").filter(Boolean).map((key) => [cost, key]));

  if (slots.length !== SLOTS) {
    throw new Error(`mainstats(${c4}|${c3}|${c1}): ${slots.length} echoes, expected ${SLOTS}`);
  }
  const cost = slots.reduce((n, [c]) => n + c, 0);
  if (cost > COST_CAP) {
    throw new Error(`mainstats(${c4}|${c3}|${c1}): costs ${cost}, over the ${COST_CAP} cap`);
  }

  // sum the contributions now, so apply() is a flat loop and one stat traces to one row
  const totals = new Map();
  const bump = ([stat, value]) => totals.set(stat, (totals.get(stat) ?? 0) + value);
  for (const [c, key] of slots) {
    const main = MAIN[c][key];
    if (!main) throw new Error(`no cost-${c} main stat called "${key}"`);
    bump(main);
    bump(SECONDARY[c]);
  }

  const entries = [...totals];
  const layout = slots.map(([c]) => c).join("");
  const name = `${layout} ${slots.map(([, key]) => key).join(" ")}`;
  return defineGear(name, {
    apply() { for (const [stat, value] of entries) add(value, stat); },
  });
}

/* --- the builds worth comparing, generated rather than typed out one at a time ------------ */

/**
 * Every way n 1-cost slots can be split between attack and HP, fewest HP first. Splitting them
 * is the point: a resonator that converts one stat into the other — Jingran turning HP into
 * attack — wants some of each, which a run of five identical slots cannot say.
 */
const ones = (n) => Array.from({ length: n + 1 }, (_, hp) =>
  [...Array(n - hp).fill("atk"), ...Array(hp).fill("hp")].join(" "));

/** Percent stats a 3-cost or 4-cost can roll, and every unordered pair of them. */
const C3_KEYS = ["ele", "ER", "ATK", "HP"];
const C4_KEYS = ["CR", "CD", "ATK", "HP"];
const pairsOf = (keys) => keys.flatMap((a, i) => keys.slice(i).map((b) => `${a} ${b}`));

/**
 * `ele` above stands for "an elemental damage 3-cost"; expand it into one build per element.
 * Both 3-cost slots take the same element, because the second one only pays out on damage the
 * first is already scoped to — two different elements would leave half the build dead.
 */
const elements = (spec) =>
  spec.includes("ele") ? ELEMENTS.map((e) => spec.replaceAll("ele", e)) : [spec];

/** 43311 and 43111 — the layouts that spend the full cost budget. */
for (const c4 of C4_KEYS) {
  for (const pair of pairsOf(C3_KEYS)) {
    for (const c3 of elements(pair)) for (const c1 of ones(2)) mainstats(c4, c3, c1);
  }
  for (const key of C3_KEYS) {
    for (const c3 of elements(key)) for (const c1 of ones(3)) mainstats(c4, c3, c1);
  }
}

/** 44111 — two 4-costs and three 1-costs, eleven of the twelve cost. */
for (const c4 of pairsOf(C4_KEYS)) for (const c1 of ones(3)) mainstats(c4, "", c1);

/** 41111 and 11111 — the cheap end, where a stat stick 4-cost earns its slot. */
for (const c4 of C4_KEYS) for (const c1 of ones(4)) mainstats(c4, "", c1);
for (const c1 of ones(SLOTS)) mainstats("", "", c1);

/** DEF scaling, which nobody on the current team uses — kept short until somebody does. */
for (const c4 of ["CR", "CD", "DEF"]) mainstats(c4, "ER ER", "def def");

/* =========================================================== echo substats */
/**
 * An echo build's substats: five echoes with five rolls each, twenty-five in all.
 *
 * A roll's size is random in game, so a build is described by how many rolls went into each
 * stat rather than by a total — and every roll is valued at the mid-tier number below, which
 * is the assumption the old sheet made and the reason its substat rows were whole multiples
 * of one figure.
 */
const ROLL = {
  [CRIT_RATE]: 7.5, [CRIT_DMG]: 15, [ER]: 8.4,
  [BONUS_ATK]: 7.9, [FLAT_ATK]: 40,
  [BONUS_HP]: 7.9, [FLAT_HP]: 430,
  [BONUS_DEF]: 10, [FLAT_DEF]: 50,
  [BASIC_DMG]: 7.9, [HEAVY_DMG]: 7.9, [SKILL_DMG]: 7.9, [LIB_DMG]: 7.9,
};

const ROLLS_PER_BUILD = 25;
const TYPE_DMG = { basic: BASIC_DMG, heavy: HEAVY_DMG, skill: SKILL_DMG, liberation: LIB_DMG };
const SCALER_STATS = { atk: [BONUS_ATK, FLAT_ATK], hp: [BONUS_HP, FLAT_HP] };

/**
 * Define one substat spread from a count of rolls per stat, and check it really is a build:
 * twenty-five rolls, no more and no less. Exported so a one-off spread can be written directly.
 */
export function substats(name, counts) {
  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  if (total !== ROLLS_PER_BUILD) {
    throw new Error(`substats("${name}"): ${total} rolls, a build has ${ROLLS_PER_BUILD}`);
  }
  const entries = Object.entries(counts).map(([stat, n]) => {
    if (!(stat in ROLL)) throw new Error(`substats("${name}"): nothing rolls "${stat}"`);
    return [stat, ROLL[stat] * n];
  });
  return defineGear(name, {
    apply() { for (const [stat, value] of entries) add(value, stat); },
  });
}

/**
 * The "chem" spread: crit first, then two rolls into whichever stat the resonator scales off
 * and into the damage type its rotation leans on, and one roll into everything else.
 *
 * The ER variant trades three crit rate rolls for energy regen, for a rotation that cannot
 * otherwise afford its liberation. Both come to the same twenty-five rolls.
 */
export function chem(scaler, type, { er = false } = {}) {
  const [ownPct, ownFlat] = SCALER_STATS[scaler];
  const [offPct, offFlat] = SCALER_STATS[scaler === "atk" ? "hp" : "atk"];

  const counts = {
    [CRIT_RATE]: er ? 2 : 5,
    [CRIT_DMG]: 5,
    [ER]: er ? 5 : 2,
    [ownPct]: 2, [ownFlat]: 2,
    [offPct]: 1, [offFlat]: 1,
    [BONUS_DEF]: 1, [FLAT_DEF]: 1,
  };
  for (const [t, stat] of Object.entries(TYPE_DMG)) counts[stat] = t === type ? 2 : 1;

  return substats(`chem${er ? " ER" : ""} ${scaler} ${type}`, counts);
}

for (const scaler of ["atk", "hp"]) {
  for (const type of Object.keys(TYPE_DMG)) {
    chem(scaler, type);
    chem(scaler, type, { er: true });
  }
}
