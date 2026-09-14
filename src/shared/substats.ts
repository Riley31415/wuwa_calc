/** An echo build's substats: five echoes, five rolls each, twenty-five total. Every roll is
 *  valued at a percentile of the value spread Kuro discloses for it; the whole spread is one
 *  constant piece of gear. */
import { Buff } from "../engine/gear.js";
import type { StatLine } from "../engine/gear.js";
import { addStat } from "../engine/context.js";
import { Stat, Type1, scopedStat, statLabel } from "../engine/stats.js";
import type { StatKey, Tag } from "../engine/stats.js";

/** The spread's rolls as one buff apiece: each named for the spread and the stat it rolls as that
 *  stat is named everywhere else ("ChemX32 - Crit Rate", "ChemX32 - Flat
 *  ATK" — `ROLL`'s own short label calls both ATK% and Flat ATK "ATK"), and carrying a single roll's
 *  value. Never equipped and never evaluated — the piece's own `constantStats` is what the fight
 *  reads; these exist so the loadout hover can list a spread roll by roll, the five Crit Rate ones
 *  folding into a line of their own. Most rolls first, `Substat` order within a count. */
const ROLL_BUFFS = new WeakMap<Buff, Buff[]>();
export const substatRollBuffs = (piece: Buff): Buff[] => ROLL_BUFFS.get(piece) ?? [];
const rollBuffsOf = (prefix: string, counts: Map<Substat, number>, p: number): Buff[] =>
  [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .flatMap(([s, n]) => {
      const { stat, tag } = ROLL[s];
      const value = rollAt(s, p);
      const line: StatLine = tag === undefined ? [stat, value] : [stat, value, tag];
      const name = `${prefix} - ${statLabel(tag === undefined ? stat : scopedStat(tag, stat))}`;
      return Array.from({ length: n }, () => new Buff({ name, stats: [line] }));
    });

/** The thirteen stats a substat can roll. */
export enum Substat { CritRate, CritDmg, Er, AtkPct, FlatAtk, HpPct, FlatHp, DefPct, FlatDef, Basic, Heavy, Skill, Liberation }

/** The value spread ATK%, HP% and the four dmg bonuses share, and the two weightings behind every
 *  spread: eight values out of 103, or crit's own eight out of 300 (Kuro's KR product info). */
const PCT = [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6];
const WEIGHTS = [7, 8, 21, 25, 18, 15, 6, 3];
const CRIT_WEIGHTS = [70, 70, 70, 24, 24, 24, 9, 9];

/** Every value each one can roll, low to high, against how often it rolls there, and how its
 *  line reads. */
const ROLL: Record<Substat, { stat: Stat; tag?: Tag; values: number[]; weights: number[]; label: string }> = {
  [Substat.CritRate]: { stat: Stat.CritRate, values: [6.3, 6.9, 7.5, 8.1, 8.7, 9.3, 9.9, 10.5], weights: CRIT_WEIGHTS, label: "Crit Rate" },
  [Substat.CritDmg]: { stat: Stat.CritDmg, values: [12.6, 13.8, 15, 16.2, 17.4, 18.6, 19.8, 21], weights: CRIT_WEIGHTS, label: "Crit Dmg" },
  [Substat.Er]: { stat: Stat.Er, values: [6.8, 7.6, 8.4, 9.2, 10, 10.8, 11.6, 12.4], weights: WEIGHTS, label: "ER" },
  [Substat.AtkPct]: { stat: Stat.BonusAtk, values: PCT, weights: WEIGHTS, label: "ATK" },
  [Substat.FlatAtk]: { stat: Stat.FlatAtk, values: [30, 40, 50, 60], weights: [7, 54, 39, 3], label: "ATK" },
  [Substat.HpPct]: { stat: Stat.BonusHp, values: PCT, weights: WEIGHTS, label: "HP" },
  [Substat.FlatHp]: { stat: Stat.FlatHp, values: [320, 360, 390, 430, 470, 510, 540, 580], weights: WEIGHTS, label: "HP" },
  [Substat.DefPct]: { stat: Stat.BonusDef, values: [8.1, 9, 10, 10.9, 11.8, 12.8, 13.8, 14.7], weights: WEIGHTS, label: "DEF" },
  [Substat.FlatDef]: { stat: Stat.FlatDef, values: [40, 50, 60, 70], weights: [15, 46, 33, 9], label: "DEF" },
  [Substat.Basic]: { stat: Stat.DmgBonus, tag: Type1.Basic, values: PCT, weights: WEIGHTS, label: "Basic" },
  [Substat.Heavy]: { stat: Stat.DmgBonus, tag: Type1.Heavy, values: PCT, weights: WEIGHTS, label: "Heavy" },
  [Substat.Skill]: { stat: Stat.DmgBonus, tag: Type1.Skill, values: PCT, weights: WEIGHTS, label: "Skill" },
  [Substat.Liberation]: { stat: Stat.DmgBonus, tag: Type1.Liberation, values: PCT, weights: WEIGHTS, label: "Liberation" },
};

/** What a roll of `s` is worth at percentile `p` of its own spread: the lowest value its weights
 *  carry `p` up to, so 0.5 is the median roll and 0.8 the one four rolls in five come under. */
const rollAt = (s: Substat, p: number): number => {
  const { values, weights } = ROLL[s];
  const target = p * weights.reduce((a, b) => a + b, 0);
  let seen = 0;
  for (const [i, value] of values.entries()) {
    seen += weights[i]!;
    if (seen >= target) return value;
  }
  return values[values.length - 1]!;
};

/** How many rolls each named stat takes, in priority order: two five-roll slots, and nothing
 *  above two underneath them, so no stat outside the top pair is big enough to carry a build. The
 *  eight stats a spread does not name take a single roll each, which leaves one of the twenty-five
 *  unspent — the roll the old 5/5/3/2/2 third slot held. */
const SHAPE = [5, 5, 2, 2, 2];

/** Where ER slots in when a member needs more of it than the spread as written gives: the roll
 *  count it is promoted to, the priority place it takes to get there, and the shape the spread
 *  wears once it is there. ER lands third either way: two rolls are what `SHAPE` already writes
 *  into that slot, and a third is bought off the second-best stat, which drops to four (5/4/3/2/2)
 *  rather than the build growing a roll it did not have. Promoting pushes every stat below it one
 *  place down, and the last one off into the single-roll eight.
 *
 *  It stops at three. A five-roll slot is the build's own scaling, and spending it on Energy is a
 *  different build rather than the same one under strain — a bar that wants more than three rolls
 *  is asking for an ER 3-cost main stat instead. Only a kit that names ER first or second gets
 *  five, because there the five rolls are what the kit asked for. */
const PROMOTIONS: [number, number, number[]][] = [[2, 2, SHAPE], [3, 2, [5, 4, 3, 2, 2]]];

/** One ChemX32 spread at every ER tier a run might need: the five stats as the kit named them,
 *  and the same five with ER promoted above whatever it already holds. The solve picks a tier off
 *  the member's own ER requirement, so a kit names what it wants and the run pays for the Energy
 *  it actually has to. */
export class ErSpread {
  /** Fewest ER rolls first — `[1, 2, 3]` where the kit named no ER at all, and a lone `[5]` where
   *  it named ER first. */
  readonly tiers: { rolls: number; piece: Buff }[];
  /** The five stats the kit named, most important first — what every tier is built from. */
  readonly named: Substat[];
  /** The high-investment spread with no ER line at all, worn by a kit whose Liberation costs
   *  nothing (`maxEnergy: 0`) — there the roll would be paying down a bar that never fills, and the
   *  slot goes to the sixth stat instead. Null on ChemX32, which carries its ER roll either way. */
  readonly noEr: Buff | null;

  constructor(named: Substat[], tiers: { rolls: number; piece: Buff }[], noEr: Buff | null = null) {
    this.named = named;
    this.tiers = tiers;
    this.noEr = noEr;
  }

  /** The cheapest tier carrying at least `rolls` ER rolls, or the top one where nothing does — a
   *  combo wanting more than the spread can pay has to find it on an ER 3-cost main stat, and the
   *  solver is what reaches for one (see `rankedMainstats`). */
  at(rolls: number): Buff {
    return (this.tiers.find((t) => t.rolls >= rolls) ?? this.tiers[this.tiers.length - 1]!).piece;
  }
}

/** The spread `named` describes as one piece: `shape` rolls apiece in priority order, one roll of
 *  each of the eight left over. Named after the stats that tell two spreads apart — every one of
 *  them rolls crit, so crit is left out of the name. `ownEr` is whether the ER in `named` is the
 *  kit's own rather than a promotion's. */
function spreadPiece(named: Substat[], shape: number[] = SHAPE, ownEr = false): Buff {
  const counts = new Map<Substat, number>();
  // only the first five take a share of the shape; a sixth is named for the hover's sake and takes
  // the single roll it would have had among the eight either way
  named.slice(0, shape.length).forEach((s, i) => counts.set(s, shape[i]!));
  for (let s = Substat.CritRate; s <= Substat.Liberation; s++) if (!counts.has(s)) counts.set(s, 1);
  // the name is what the spread is spent on, so it reads the five that take `SHAPE` and not the
  // sixth, which is one roll named only so the hover leaves it lit. ER only reads as part of it
  // where the kit named it, however few rolls that is — promoted in to fill a bar the rotation
  // could not, it is an Energy tax the spread pays rather than what the spread is
  const labels = [...new Set(named.slice(0, shape.length)
    .filter((s) => s > Substat.CritDmg && (s !== Substat.Er || ownEr))
    .map((s) => ROLL[s].label))];
  const lines = [...counts].map(([s, n]) => [ROLL[s].stat, rollAt(s, 0.5) * n, ROLL[s].tag] as const);
  const piece = new Buff({
    name: `ChemX32 - ${labels.join(" ")}`,
    constantStats: () => { for (const [stat, value, tag] of lines) addStat(stat, value, tag); },
  });
  ROLL_BUFFS.set(piece, rollBuffsOf("ChemX32", counts, 0.5));
  return piece;
}

/** The stats a spread's hover leaves lit where they rolled only once: the ER line of a build that
 *  has a Liberation to pay for, which is the whole reason the tier reads as it does. Everything
 *  else at a single roll is the spread's small change and dims, the named sixth included. */
export const litStats = (maxEnergy: number): StatKey[] => (maxEnergy ? [Stat.Er] : []);

/** ER points a build is allowed to come up short by with nothing backing them. A bar that misses
 *  by a hair misses on the worst single window of the run, and buying a whole roll — 9.2 points, a
 *  crit roll's worth of damage off the spread — to cover two of them is a trade nobody would make.
 *  Both halves of it have to move together: `evaluate.ts`'s requirement guard forgives this much,
 *  and `teamrun.ts`'s `erRollsWanted` discounts the same much off what it asks for. Forgive without
 *  discounting and the count still buys the roll; discount without forgiving and the run keeps
 *  failing on a bar the count has already declared paid for, which never converges.
 *
 *  Never a `Stat.Er`: the kits that read Energy Regen back as damage (Sigrika, Brant, Mornye) would
 *  be paid for slack the build does not actually carry. */
export const ER_TOLERANCE = 3;

/** What one ER roll is worth on a ChemX32 spread — what the ER requirement is paid down in. */
export const erRollValue = (): number => rollAt(Substat.Er, 0.5);

/** A build's rolls: the five stats named here, most important first, take 5/5/2/2/2 of the
 *  twenty-five and each of the other eight takes one. ER is one of those eight unless a kit
 *  names it, so every spread carries a roll of it either way — name it where the kit wants it (first
 *  for a support living on its Liberation, third for an ER scaler) and the solve promotes it
 *  further only if the rotation cannot fill the bar without. */
export function substats(sub1: Substat, sub2: Substat, sub3: Substat, sub4: Substat, sub5: Substat, sub6: Substat): ErSpread {
  const named = [sub1, sub2, sub3, sub4, sub5, sub6];
  if (new Set(named).size !== 6) throw new Error(`substats(${named.join(", ")}): six distinct stats`);
  const own = named.indexOf(Substat.Er);
  const held = own < 0 ? 1 : SHAPE[own]!;
  const rest = named.filter((s) => s !== Substat.Er);
  const tiers = [{ rolls: held, piece: spreadPiece(named, SHAPE, own >= 0) }];
  for (const [rolls, place, shape] of PROMOTIONS) {
    if (rolls > held) tiers.push({ rolls, piece: spreadPiece([...rest.slice(0, place), Substat.Er, ...rest.slice(place)].slice(0, 5), shape, own >= 0) });
  }
  return new ErSpread(named, tiers);
}

/** The high-investment spread's own shape: six named stats in priority order, and a single roll
 *  for anything an ER promotion pushes past the end. 21 of the 25 rolls, or 22 once the bar's own
 *  ER line lands — the rest are left empty rather than spent on stats the kit has no use for. */
const HIGH_SHAPE = [5, 5, 5, 3, 2, 1];

/** Where ER slots in when the bar wants more than its one line, against `HIGH_SHAPE`'s own places
 *  — the same rule ChemX32 follows, and it stops at three for the same reason. */
const HIGH_PROMOTIONS: [number, number][] = [[2, 4], [3, 3]];

/** One high-investment piece from the stats it names, in priority order. `last` is the sixth stat
 *  the kit asked for — a single roll wherever the tier puts it, and left out of the name; `ownEr`
 *  is whether the ER in `named` is the kit's own rather than a promotion's. */
function highPiece(named: Substat[], last: Substat, ownEr = false): Buff {
  const counts = new Map<Substat, number>();
  named.forEach((s, i) => counts.set(s, HIGH_SHAPE[i] ?? 1));
  for (const [s, n] of counts) if (n > 5) throw new Error(`highSubs(): ${ROLL[s].label} rolls ${n} times, a build has five echoes`);
  // ER reads as part of the build's name only where the kit named it, however few rolls that is;
  // promoted in for the bar it is the Energy tax the spread pays, not what the spread is
  const labels = [...new Set(named.filter((s) => s > Substat.CritDmg && s !== last && (s !== Substat.Er || ownEr))
    .map((s) => ROLL[s].label))];
  const lines = [...counts].map(([s, n]) => [ROLL[s].stat, rollAt(s, 0.8) * n, ROLL[s].tag] as const);
  const piece = new Buff({
    name: `High Invest - ${labels.join(" ")}`,
    constantStats: () => { for (const [stat, value, tag] of lines) addStat(stat, value, tag); },
  });
  ROLL_BUFFS.set(piece, rollBuffsOf("High Invest", counts, 0.8));
  return piece;
}

/**
 * The high-investment spread (the "High Invest Substats" boxes, shown as "CN Subs" against the
 * default "ChemX32"): six distinct stats, most important first, taking 5/5/5/3/2/1 of the
 * twenty-five rolls at the 80th percentile rather than ChemX32's median. Crit is named here rather
 * than assumed — every one of these builds wants it, but not always at the top.
 *
 * ER works exactly as it does on ChemX32: a kit that names it holds whatever slot it named, and a
 * kit that does not gets one line for the bar (none at all where the Liberation costs nothing) and
 * is promoted to two or three only where the rotation cannot fill without. A promotion inserts ER
 * at that place and shifts the rest right, the last of them down to a single roll.
 */
export function highSubs(sub1: Substat, sub2: Substat, sub3: Substat, sub4: Substat, sub5: Substat, sub6: Substat): ErSpread {
  const named = [sub1, sub2, sub3, sub4, sub5, sub6];
  if (new Set(named).size !== 6) throw new Error(`highSubs(${named.join(", ")}): six distinct stats`);
  const own = named.indexOf(Substat.Er);
  // a kit that named ER wears all six as written: there ER is the build, not the bar's own tax
  if (own >= 0) return new ErSpread(named, [{ rolls: HIGH_SHAPE[own]!, piece: highPiece(named, sub6, true) }]);
  // everyone else pays for their bar out of the sixth slot rather than on top of it, so the ER line
  // takes `sub6`'s place and every tier stays six stats long. Only a kit with no Liberation to pay
  // for (`maxEnergy: 0`, the `noEr` piece) actually gets the sixth stat it asked for.
  const five = named.slice(0, 5);
  return new ErSpread(named, [
    { rolls: 1, piece: highPiece([...five, Substat.Er], sub6) },
    ...HIGH_PROMOTIONS.map(([rolls, place]) => (
      { rolls: rolls!, piece: highPiece([...five.slice(0, place), Substat.Er, ...five.slice(place)], sub6) })),
  ], highPiece(named, sub6));
}
