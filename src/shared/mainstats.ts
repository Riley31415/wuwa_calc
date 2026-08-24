/**
 * An echo build's main stats: five echoes, each one main stat plus a fixed secondary the cost
 * alone decides. Values are the 5-star level-25 numbers. A 3-cost's elemental damage is scoped
 * per element rather than generic, so a mismatched slot doesn't silently pay full price.
 */
import { Buff, addStat } from "../kit.js";
import { Stat, Attribute, scopedStat } from "../stats.js";

/** No physical entry: a 3-cost elemental damage main stat doesn't exist for physical in-game. */
const ELEMENTS: Attribute[] = [
  Attribute.Glacio, Attribute.Fusion, Attribute.Electro, Attribute.Aero, Attribute.Spectro, Attribute.Havoc,
];

/** The MAIN keys below that name an element rather than a plain stat. */
const ELEMENT_KEYS = new Set(ELEMENTS.map((e) => e.toLowerCase()));

/** `[stat, value]`, or `[stat, value, tag]` when the roll only pays on one element or type. */
type MainEntry = readonly [Stat, number] | readonly [Stat, number, string];

const MAIN: Record<number, Record<string, MainEntry>> = {
  4: { CR: [Stat.CritRate, 22], CD: [Stat.CritDmg, 44],
       ATK: [Stat.BonusAtk, 33], HP: [Stat.BonusHp, 33], DEF: [Stat.BonusDef, 41.8] },
  3: { ER: [Stat.Er, 32], atk: [Stat.BonusAtk, 30], HP: [Stat.BonusHp, 30], DEF: [Stat.BonusDef, 38],
       glacio:  [Stat.DmgBonus, 30, Attribute.Glacio],
       fusion:  [Stat.DmgBonus, 30, Attribute.Fusion],
       electro: [Stat.DmgBonus, 30, Attribute.Electro],
       aero:    [Stat.DmgBonus, 30, Attribute.Aero],
       spectro: [Stat.DmgBonus, 30, Attribute.Spectro],
       havoc:   [Stat.DmgBonus, 30, Attribute.Havoc] },
  1: { atk: [Stat.BonusAtk, 18], hp: [Stat.BonusHp, 22.8], def: [Stat.BonusDef, 18] },
};

/** What a cost gives on top of its main stat. */
const SECONDARY: Record<number, readonly [Stat, number]> =
  { 4: [Stat.FlatAtk, 150], 3: [Stat.FlatAtk, 100], 1: [Stat.FlatHp, 2280] };

/** Five echoes to a build, cost capped at twelve. */
const SLOTS = 5, COST_CAP = 12;

/**
 * Define one main-stat build from its 4/3/1-cost slots, e.g. `mainstats("CR CD", "", "atk atk
 * atk")` for 44111 double-crit. Returns the `Buff`. The name leads with the cost layout, since
 * ATK/HP/DEF are legal at both cost 4 and cost 3 and would otherwise be ambiguous.
 */
export function mainstats(c4 = "", c3 = "", c1 = ""): Buff {
  const slots: Array<[number, string]> = ([[4, c4], [3, c3], [1, c1]] as const).flatMap(([cost, spec]) =>
    spec.split(" ").filter(Boolean).map((key): [number, string] => [cost, key]));

  if (slots.length !== SLOTS) {
    throw new Error(`mainstats(${c4}|${c3}|${c1}): ${slots.length} echoes, expected ${SLOTS}`);
  }
  const cost = slots.reduce((n, [c]) => n + c, 0);
  if (cost > COST_CAP) {
    throw new Error(`mainstats(${c4}|${c3}|${c1}): costs ${cost}, over the ${COST_CAP} cap`);
  }

  const totals = new Map<string, { stat: Stat; tag: string | null; value: number }>();
  const bump = (entry: MainEntry): void => {
    const [stat, value, tag] = entry;
    const key = tag ? scopedStat(tag, stat) : stat;
    const seen = totals.get(key);
    if (seen) seen.value += value;
    else totals.set(key, { stat, tag: tag ?? null, value });
  };
  for (const [c, key] of slots) {
    const main = MAIN[c]?.[key];
    if (!main) throw new Error(`no cost-${c} main stat called "${key}"`);
    bump(main);
    bump(SECONDARY[c]!);
  }

  const entries = [...totals.values()];
  const layout = slots.map(([c]) => c).join("");
  const name = `${layout} ${slots.map(([, key]) => key).join(" ")}`;
  // the comparison table names a row by what varies on it, and which element a 3-cost rolls never
  // does — it's always this resonator's own — so every element reads as a plain "ele" there
  const short = slots.map(([, key]) => (ELEMENT_KEYS.has(key) ? "ele" : key)).join(" ");
  return new Buff({
    name,
    abbreviation: `${layout} ${short}`,
    apply: () => { for (const { stat, tag, value } of entries) addStat(stat, value, tag ?? undefined); },
  });
}

/** Every unordered n-slot pick from `keys` — slots of one cost are interchangeable, so "CR CD"
 *  and "CD CR" are the same build and only the first is emitted. */
const multisets = (keys: string[], n: number): string[] =>
  (n === 0 ? [""] : keys.flatMap((key, i) =>
    multisets(keys.slice(i), n - 1).map((rest) => (rest ? `${key} ${rest}` : key))));

/**
 * Every main-stat build one loadout is willing to run, from its own per-cost option lists — the
 * 43311 layout (one 4-cost, two 3-costs, two 1-costs), the 44111 layout (two 4-costs, three
 * 1-costs), and, for a list that offers HP 1-costs, 41111 as well; each slot drawn from that
 * cost's own list. A loadout names this rather than a single
 * `mainstats()` build; the comparison table runs every one of them (see index.ts's own combos).
 */
export function mainstatOptions(c4: string[], c3: string[], c1: string[]): Buff[] {
  const builds: Buff[] = [];
  for (const four of c4) for (const three of multisets(c3, 2)) for (const one of multisets(c1, 2)) {
    builds.push(mainstats(four, three, one));
  }
  for (const four of multisets(c4, 2)) for (const one of multisets(c1, 3)) builds.push(mainstats(four, "", one));
  // 41111, only for a build that would actually wear HP 1-costs: a 1-cost's 22.8% HP beats what a
  // 3-cost slot is worth to an HP scaler, so four of them can be the real build rather than the
  // cheap end of the list. Nothing else has a 1-cost worth four of, so nothing else generates it.
  if (c1.includes("hp")) {
    for (const four of c4) for (const one of multisets(c1, 4)) builds.push(mainstats(four, "", one));
  }
  return builds;
}

/* --- the builds worth comparing, generated rather than typed out one at a time ------------ */

/** Every way n 1-cost slots split between attack and HP, fewest HP first. */
const ones = (n: number): string[] => multisets(["atk", "hp"], n);

/** Percent stats a 3-cost or 4-cost can roll. */
const C3_KEYS = ["ele", "ER", "atk"];
const C4_KEYS = ["CR", "CD", "ATK", "HP"];

/** `ele` stands for "an elemental damage 3-cost" — expand into one build per element. Both
 *  3-cost slots take the same element, or half the build would be dead weight. */
const elements = (spec: string): string[] =>
  spec.includes("ele") ? ELEMENTS.map((e) => spec.replaceAll("ele", e.toLowerCase())) : [spec];

/** Every build worth comparing. A loadout doesn't read this; it's swept over to rank builds. */
export const ALL_MAINSTATS: Buff[] = [];
const build = (...args: [string?, string?, string?]): void => { ALL_MAINSTATS.push(mainstats(...args)); };

/** 43311 and 43111 — the layouts that spend the full cost budget. */
for (const c4 of C4_KEYS) {
  for (const pair of multisets(C3_KEYS, 2)) {
    for (const c3 of elements(pair)) for (const c1 of ones(2)) build(c4, c3, c1);
  }
  for (const key of C3_KEYS) {
    for (const c3 of elements(key)) for (const c1 of ones(3)) build(c4, c3, c1);
  }
}

/** 44111 — two 4-costs and three 1-costs. */
for (const c4 of multisets(C4_KEYS, 2)) for (const c1 of ones(3)) build(c4, "", c1);

/** 41111 and 11111 — the cheap end. */
for (const c4 of C4_KEYS) for (const c1 of ones(4)) build(c4, "", c1);
for (const c1 of ones(SLOTS)) build("", "", c1);

/** DEF scaling, kept short until somebody on the team uses it. */
for (const c4 of ["CR", "CD", "DEF"]) build(c4, "ER ER", "def def");
