/**
 * An echo build's main stats: five echoes, each one main stat plus a fixed secondary the cost
 * alone decides. Values are the 5-star level-25 numbers. A 3-cost's elemental damage is scoped
 * per element rather than generic, so a mismatched slot doesn't silently pay full price.
 */
import { Buff } from "../engine/gear.js";
import { addStat } from "../engine/context.js";
import { Stat, Attribute, scopedStat, STAT_NAME, TAG_NAME } from "../engine/stats.js";
import type { StatKey, Tag } from "../engine/stats.js";

/** Every main stat an echo can roll, one entry per stat *and* cost — ATK/HP/DEF exist at every
 *  cost, crit only at 4, ER and an element only at 3, and no physical 3-cost exists in-game. */
export const enum Mainstat {
  CR4, CD4, ATK4, HP4, DEF4,
  ER3, ATK3, HP3, DEF3,
  Glacio3, Fusion3, Electro3, Aero3, Spectro3, Havoc3,
  ATK1, HP1, DEF1,
}

const ELEMENTS: Mainstat[] = [
  Mainstat.Glacio3, Mainstat.Fusion3, Mainstat.Electro3, Mainstat.Aero3, Mainstat.Spectro3, Mainstat.Havoc3,
];

/** `[stat, value]`, or `[stat, value, tag]` when the roll only pays on one element or type. */
type MainEntry = readonly [Stat, number] | readonly [Stat, number, Tag];

const MAIN: Record<Mainstat, MainEntry> = {
  [Mainstat.CR4]: [Stat.CritRate, 22], [Mainstat.CD4]: [Stat.CritDmg, 44],
  [Mainstat.ATK4]: [Stat.BonusAtk, 33], [Mainstat.HP4]: [Stat.BonusHp, 33], [Mainstat.DEF4]: [Stat.BonusDef, 41.8],
  [Mainstat.ER3]: [Stat.Er, 32], [Mainstat.ATK3]: [Stat.BonusAtk, 30],
  [Mainstat.HP3]: [Stat.BonusHp, 30], [Mainstat.DEF3]: [Stat.BonusDef, 38],
  [Mainstat.Glacio3]:  [Stat.DmgBonus, 30, Attribute.Glacio],
  [Mainstat.Fusion3]:  [Stat.DmgBonus, 30, Attribute.Fusion],
  [Mainstat.Electro3]: [Stat.DmgBonus, 30, Attribute.Electro],
  [Mainstat.Aero3]:    [Stat.DmgBonus, 30, Attribute.Aero],
  [Mainstat.Spectro3]: [Stat.DmgBonus, 30, Attribute.Spectro],
  [Mainstat.Havoc3]:   [Stat.DmgBonus, 30, Attribute.Havoc],
  [Mainstat.ATK1]: [Stat.BonusAtk, 18], [Mainstat.HP1]: [Stat.BonusHp, 22.8], [Mainstat.DEF1]: [Stat.BonusDef, 18],
};

/** What a cost gives on top of its main stat. */
const SECONDARY: Record<number, readonly [Stat, number]> =
  { 4: [Stat.FlatAtk, 150], 3: [Stat.FlatAtk, 100], 1: [Stat.FlatHp, 2280] };

/** The enum runs cost-major, so where a key sits in it is what it costs. */
const costOf = (key: Mainstat): number => (key <= Mainstat.DEF4 ? 4 : key <= Mainstat.Havoc3 ? 3 : 1);

/** How one echo reads in a build's name: the stat as it's named everywhere else, or just the
 *  element for a 3-cost that rolls one. The percent sign goes — every main stat here is one — and
 *  a stat whose name is more than one word reads as its initials, the way players write them
 *  (Crit Rate -> CR, Energy Regen -> ER). A 1-cost goes lowercase, since ATK/HP/DEF are legal at
 *  every cost and the case is what tells the cheap slot from the real one. */
const label = (key: Mainstat): string => {
  const [stat, , tag] = MAIN[key];
  const text = tag ? TAG_NAME[tag] : STAT_NAME[stat].replace("%", "");
  const word = text.includes(" ") ? text.split(" ").map((part) => part[0]).join("") : text;
  return costOf(key) === 1 ? word.toLowerCase() : word;
};

/** Five echoes to a build, cost capped at twelve. */
const SLOTS = 5, COST_CAP = 12;

/**
 * Define one main-stat build from its five echoes in any order, e.g. `mainstats(CR4, CD4, ATK1,
 * ATK1, ATK1)` for 44111 double-crit. Returns the `Buff`. The name leads with the cost layout and
 * then names each stat highest cost first, since ATK/HP/DEF are legal at every cost.
 */
export function mainstats(...slots: Mainstat[]): Buff {
  slots = [...slots].sort((a, b) => costOf(b) - costOf(a));
  const spec = slots.map((key) => `${label(key)}${costOf(key)}`).join(" ");
  if (slots.length !== SLOTS) throw new Error(`mainstats(${spec}): ${slots.length} echoes, expected ${SLOTS}`);
  const cost = slots.reduce((n, key) => n + costOf(key), 0);
  if (cost > COST_CAP) throw new Error(`mainstats(${spec}): costs ${cost}, over the ${COST_CAP} cap`);

  const totals = new Map<StatKey, { stat: Stat; tag: Tag | null; value: number }>();
  const bump = (entry: MainEntry): void => {
    const [stat, value, tag] = entry;
    const key = tag ? scopedStat(tag, stat) : stat;
    const seen = totals.get(key);
    if (seen) seen.value += value;
    else totals.set(key, { stat, tag: tag ?? null, value });
  };
  for (const key of slots) {
    bump(MAIN[key]);
    bump(SECONDARY[costOf(key)]!);
  }

  const entries = [...totals.values()];
  const layout = slots.map(costOf).join("");
  return new Buff({
    name: `${layout} ${slots.map(label).join(" ")}`,
    constantStats: () => { for (const { stat, tag, value } of entries) addStat(stat, value, tag ?? undefined); },
  });
}

/** Every unordered n-slot pick from `keys` — slots of one cost are interchangeable, so CR CD and
 *  CD CR are the same build and only the first is emitted. */
const multisets = <T>(keys: T[], n: number): T[][] =>
  (n === 0 ? [[]] : keys.flatMap((key, i) => multisets(keys.slice(i), n - 1).map((rest) => [key, ...rest])));

/**
 * Every main-stat build one loadout is willing to run, from one list of the stats it would wear
 * at each cost — the 43311 layout (one 4-cost, two 3-costs, two 1-costs), the 44111 layout (two
 * 4-costs, three 1-costs) unless the 3-cost list has ER in it, and, for a list that offers HP
 * 1-costs, 41111 as well; each slot drawn
 * from the options of its own cost. A loadout names this rather than a single `mainstats()`
 * build; the comparison table runs every one of them (see index.ts's own combos).
 */
export function mainstatOptions(...options: Mainstat[]): Buff[] {
  const c4 = options.filter((key) => costOf(key) === 4);
  const c3 = options.filter((key) => costOf(key) === 3);
  const c1 = options.filter((key) => costOf(key) === 1);
  const builds: Buff[] = [];
  for (const four of c4) for (const three of multisets(c3, 2)) for (const one of multisets(c1, 2)) {
    builds.push(mainstats(four, ...three, ...one));
  }
  // 44111 gives up both 3-cost slots — a build that offers ER there is one that needs the regen,
  // so it never runs a layout that can't wear it
  if (!c3.includes(Mainstat.ER3)) {
    for (const four of multisets(c4, 2)) for (const one of multisets(c1, 3)) builds.push(mainstats(...four, ...one));
  }
  // 41111, only for a build that would actually wear HP 1-costs: a 1-cost's 22.8% HP beats what a
  // 3-cost slot is worth to an HP scaler, so four of them can be the real build rather than the
  // cheap end of the list. Nothing else has a 1-cost worth four of, so nothing else generates it.
  if (c1.includes(Mainstat.HP1)) {
    for (const four of c4) for (const one of multisets(c1, 4)) builds.push(mainstats(four, ...one));
  }
  return builds;
}

/* --- the builds worth comparing, generated rather than typed out one at a time ------------ */

/** Every way n 1-cost slots split between attack and HP, fewest HP first. */
const ones = (n: number): Mainstat[][] => multisets([Mainstat.ATK1, Mainstat.HP1], n);

/** Percent stats a 3-cost or 4-cost can roll. `null` in the 3-cost list stands for "an elemental
 *  damage 3-cost", expanded by `elements()` into one build per element. */
const C3_KEYS: Array<Mainstat | null> = [null, Mainstat.ER3, Mainstat.ATK3];
const C4_KEYS = [Mainstat.CR4, Mainstat.CD4, Mainstat.ATK4, Mainstat.HP4];

/** Both 3-cost slots take the same element, or half the build would be dead weight. */
const elements = (spec: Array<Mainstat | null>): Mainstat[][] =>
  spec.includes(null) ? ELEMENTS.map((e) => spec.map((key) => key ?? e)) : [spec as Mainstat[]];

/** Every build worth comparing. A loadout doesn't read this; it's swept over to rank builds. */
export const ALL_MAINSTATS: Buff[] = [];
const build = (...slots: Mainstat[]): void => { ALL_MAINSTATS.push(mainstats(...slots)); };

/** 43311 and 43111 — the layouts that spend the full cost budget. */
for (const c4 of C4_KEYS) {
  for (const pair of multisets(C3_KEYS, 2)) {
    for (const c3 of elements(pair)) for (const c1 of ones(2)) build(c4, ...c3, ...c1);
  }
  for (const key of C3_KEYS) {
    for (const c3 of elements([key])) for (const c1 of ones(3)) build(c4, ...c3, ...c1);
  }
}

/** 44111 — two 4-costs and three 1-costs. */
for (const c4 of multisets(C4_KEYS, 2)) for (const c1 of ones(3)) build(...c4, ...c1);

/** 41111 and 11111 — the cheap end. */
for (const c4 of C4_KEYS) for (const c1 of ones(4)) build(c4, ...c1);
for (const c1 of ones(SLOTS)) build(...c1);

/** DEF scaling, kept short until somebody on the team uses it. */
for (const c4 of [Mainstat.CR4, Mainstat.CD4, Mainstat.DEF4]) build(c4, Mainstat.ER3, Mainstat.ER3, Mainstat.DEF1, Mainstat.DEF1);
