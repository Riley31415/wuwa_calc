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
  return new Buff({
    name,
    apply: () => { for (const { stat, tag, value } of entries) addStat(stat, value, tag ?? undefined); },
  });
}

/* --- the builds worth comparing, generated rather than typed out one at a time ------------ */

/** Every way n 1-cost slots split between attack and HP, fewest HP first. */
const ones = (n: number): string[] => Array.from({ length: n + 1 }, (_, hp) =>
  [...Array(n - hp).fill("atk"), ...Array(hp).fill("hp")].join(" "));

/** Percent stats a 3-cost or 4-cost can roll, and every unordered pair. */
const C3_KEYS = ["ele", "ER", "atk"];
const C4_KEYS = ["CR", "CD", "ATK", "HP"];
const pairsOf = (keys: string[]): string[] =>
  keys.flatMap((a, i) => keys.slice(i).map((b) => `${a} ${b}`));

/** `ele` stands for "an elemental damage 3-cost" — expand into one build per element. Both
 *  3-cost slots take the same element, or half the build would be dead weight. */
const elements = (spec: string): string[] =>
  spec.includes("ele") ? ELEMENTS.map((e) => spec.replaceAll("ele", e.toLowerCase())) : [spec];

/** Every build worth comparing. A loadout doesn't read this; it's swept over to rank builds. */
export const ALL_MAINSTATS: Buff[] = [];
const build = (...args: [string?, string?, string?]): void => { ALL_MAINSTATS.push(mainstats(...args)); };

/** 43311 and 43111 — the layouts that spend the full cost budget. */
for (const c4 of C4_KEYS) {
  for (const pair of pairsOf(C3_KEYS)) {
    for (const c3 of elements(pair)) for (const c1 of ones(2)) build(c4, c3, c1);
  }
  for (const key of C3_KEYS) {
    for (const c3 of elements(key)) for (const c1 of ones(3)) build(c4, c3, c1);
  }
}

/** 44111 — two 4-costs and three 1-costs. */
for (const c4 of pairsOf(C4_KEYS)) for (const c1 of ones(3)) build(c4, "", c1);

/** 41111 and 11111 — the cheap end. */
for (const c4 of C4_KEYS) for (const c1 of ones(4)) build(c4, "", c1);
for (const c1 of ones(SLOTS)) build("", "", c1);

/** DEF scaling, kept short until somebody on the team uses it. */
for (const c4 of ["CR", "CD", "DEF"]) build(c4, "ER ER", "def def");
