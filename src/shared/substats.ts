/** An echo build's substats: five echoes, five rolls each, twenty-five total. Every roll is
 *  valued at the mid-tier number below; the whole spread is one constant piece of gear. */
import { Buff } from "../engine/gear.js";
import type { StatLine } from "../engine/gear.js";
import { addStat } from "../engine/context.js";
import { Stat, Type1, scopedStat, statLabel } from "../engine/stats.js";
import type { Tag } from "../engine/stats.js";

/** The spread's twenty-five rolls as twenty-five buffs, one per roll: each named for the spread and
 *  the stat it rolls as that stat is named everywhere else ("ChemX32 - Crit Rate", "ChemX32 - Flat
 *  ATK" — `ROLL`'s own short label calls both ATK% and Flat ATK "ATK"), and carrying a single roll's
 *  value. Never equipped and never evaluated — the piece's own `constantStats` is what the fight
 *  reads; these exist so the loadout hover can list a spread roll by roll, the five Crit Rate ones
 *  folding into a line of their own. Most rolls first, `Substat` order within a count. */
const ROLL_BUFFS = new WeakMap<Buff, Buff[]>();
export const substatRollBuffs = (piece: Buff): Buff[] => ROLL_BUFFS.get(piece) ?? [];
const rollBuffsOf = (prefix: string, counts: Map<Substat, number>, value: (s: Substat) => number): Buff[] =>
  [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .flatMap(([s, n]) => {
      const { stat, tag } = ROLL[s];
      const line: StatLine = tag === undefined ? [stat, value(s)] : [stat, value(s), tag];
      const name = `${prefix} - ${statLabel(tag === undefined ? stat : scopedStat(tag, stat))}`;
      return Array.from({ length: n }, () => new Buff({ name, stats: [line] }));
    });

/** The thirteen stats a substat can roll. */
export enum Substat { CritRate, CritDmg, Er, AtkPct, FlatAtk, HpPct, FlatHp, DefPct, FlatDef, Basic, Heavy, Skill, Liberation }

/** What each one adds per roll, and how its line reads. */
const ROLL: Record<Substat, { stat: Stat; tag?: Tag; value: number; label: string }> = {
  [Substat.CritRate]: { stat: Stat.CritRate, value: 7.5, label: "Crit Rate" },
  [Substat.CritDmg]: { stat: Stat.CritDmg, value: 15, label: "Crit Dmg" },
  [Substat.Er]: { stat: Stat.Er, value: 8.4, label: "ER" },
  [Substat.AtkPct]: { stat: Stat.BonusAtk, value: 7.9, label: "ATK" },
  [Substat.FlatAtk]: { stat: Stat.FlatAtk, value: 40, label: "ATK" },
  [Substat.HpPct]: { stat: Stat.BonusHp, value: 7.9, label: "HP" },
  [Substat.FlatHp]: { stat: Stat.FlatHp, value: 430, label: "HP" },
  [Substat.DefPct]: { stat: Stat.BonusDef, value: 10, label: "DEF" },
  [Substat.FlatDef]: { stat: Stat.FlatDef, value: 50, label: "DEF" },
  [Substat.Basic]: { stat: Stat.DmgBonus, tag: Type1.Basic, value: 7.9, label: "Basic" },
  [Substat.Heavy]: { stat: Stat.DmgBonus, tag: Type1.Heavy, value: 7.9, label: "Heavy" },
  [Substat.Skill]: { stat: Stat.DmgBonus, tag: Type1.Skill, value: 7.9, label: "Skill" },
  [Substat.Liberation]: { stat: Stat.DmgBonus, tag: Type1.Liberation, value: 7.9, label: "Liberation" },
};

/** The same rolls one tier up — a "high investment" build (fandom's Echo/Stats: the fifth of
 *  eight rolls, the third of four for the flat stats; HP%, DEF%, Flat HP and Flat DEF read off
 *  the same tier). */
const HIGH: Record<Substat, number> = {
  [Substat.CritRate]: 8.7, [Substat.CritDmg]: 17.4, [Substat.Er]: 10,
  [Substat.AtkPct]: 9.4, [Substat.FlatAtk]: 50, [Substat.HpPct]: 9.4, [Substat.FlatHp]: 470,
  [Substat.DefPct]: 11.8, [Substat.FlatDef]: 60,
  [Substat.Basic]: 9.4, [Substat.Heavy]: 9.4, [Substat.Skill]: 9.4, [Substat.Liberation]: 9.4,
};

/** A build's twenty-five rolls: five each into Crit Rate and Crit Dmg and three into ER, two
 *  into each of the three stats the kit leans on, and one into six of the seven left over — the
 *  one dropped is Flat DEF, or Flat HP when Flat DEF was actually asked for. An ER build gives up
 *  three Crit Rate rolls: two go to ER, and the last to the stat that would have been dropped. One `Buff`, named after the three (a scaler's percent and
 *  flat rolls read as the one stat), plus ER on an ER build. */
export function substats(sub1: Substat, sub2: Substat, sub3: Substat, er = false): Buff {
  const leaned = [sub1, sub2, sub3];
  if (new Set(leaned).size !== 3 || leaned.some((s) => s <= Substat.Er)) {
    throw new Error(`substats(${leaned.join(", ")}): three distinct stats, none of crit/ER`);
  }
  const dropped = leaned.includes(Substat.FlatDef) ? Substat.FlatHp : Substat.FlatDef;
  const counts = new Map<Substat, number>([
    [Substat.CritRate, er ? 2 : 5], [Substat.CritDmg, 5], [Substat.Er, er ? 5 : 3],
  ]);
  for (const s of leaned) counts.set(s, 2);
  for (let s = Substat.AtkPct; s <= Substat.Liberation; s++) if (!counts.has(s) && (er || s !== dropped)) counts.set(s, 1);
  const named = [...new Set(leaned.map((s) => ROLL[s].label)), ...(er ? ["ER"] : [])];
  const piece = new Buff({
    name: `ChemX32 - ${named.join(" ")}`,
    constantStats: () => { for (const [s, n] of counts) addStat(ROLL[s].stat, ROLL[s].value * n, ROLL[s].tag); },
  });
  ROLL_BUFFS.set(piece, rollBuffsOf("ChemX32", counts, (s) => ROLL[s].value));
  return piece;
}

/** The high-investment spread (the "High Invest Substats" boxes, shown as "CN Subs" against the
 *  default "ChemX32" — see index.ts's own substat column): five rolls each into Crit Rate, Crit
 *  Dmg and `sub1`, three into `sub2` and `sub3`, two into `sub4`, and the last two into a stat the
 *  kit has no use for: Flat DEF, or Flat HP on a DEF scaler (a spread naming DEF anywhere), every
 *  one at the `HIGH` tier. A stat is named once, except that `sub4` may repeat `sub2` — the 3+2
 *  of a kit with nothing better to roll into (Phrolova's second Skill, Brant's second Basic). `sub3` and `sub4` may repeat (Brant's five Basic rolls), never past five rolls. Named after
 *  them, ER included only when it is one of the five-roll pair (see the note in the body). */
export function highSubs(sub1: Substat, sub2: Substat, sub3: Substat, sub4: Substat): Buff {
  const counts = new Map<Substat, number>([[Substat.CritRate, 5], [Substat.CritDmg, 5]]);
  const leaned = [sub1, sub2, sub3, sub4];
  if (new Set(leaned).size < (sub2 === sub4 ? 3 : 4)) throw new Error(`highSubs(): a stat repeats only as sub2 and sub4`);
  const filler = leaned.some((s) => s === Substat.DefPct || s === Substat.FlatDef) ? Substat.FlatHp : Substat.FlatDef;
  for (const [s, n] of [[sub1, 5], [sub2, 3], [sub3, 3], [sub4, 2], [filler, 2]] as [Substat, number][]) {
    if (s <= Substat.CritDmg) throw new Error(`highSubs(): crit is already five rolls each`);
    counts.set(s, (counts.get(s) ?? 0) + n);
  }
  // five echoes, so a stat rolls at most five times: the three-and-two slots may share a stat, `sub1` never
  for (const [s, n] of counts) if (n > 5) throw new Error(`highSubs(): ${ROLL[s].label} rolls ${n} times, a build has five echoes`);
  // five of a damage type only ever comes after two or three rolls into the scaler — its percent
  // where the spread hasn't spent on that yet (Brant), else its flat roll
  const scaler = Math.max(...[Substat.AtkPct, Substat.FlatAtk, Substat.HpPct, Substat.FlatHp, Substat.DefPct, Substat.FlatDef].map((s) => counts.get(s) ?? 0));
  for (const s of [Substat.Basic, Substat.Heavy, Substat.Skill, Substat.Liberation]) {
    if ((counts.get(s) ?? 0) >= 5 && scaler < 2) throw new Error(`highSubs(): five ${ROLL[s].label} rolls need the scaler rolled first`);
  }
  // ER is named only past the default three rolls — as `sub1`, that is
  const named = [...new Set(leaned.filter((s) => s !== Substat.Er || counts.get(s)! > 3).map((s) => ROLL[s].label))];
  const piece = new Buff({
    name: `High Invest - ${named.join(" ")}`,
    constantStats: () => { for (const [s, n] of counts) addStat(ROLL[s].stat, HIGH[s] * n, ROLL[s].tag); },
  });
  ROLL_BUFFS.set(piece, rollBuffsOf("High Invest", counts, (s) => HIGH[s]));
  return piece;
}
