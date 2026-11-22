/**
 * Substat Value: what one roll of each substat is worth to the team, per member. Each is the team
 * total with that one roll taken off the member at their spread's own tier, against the build as
 * it stands; nothing else is re-solved, so the build is the same but for that one stat line. ER
 * counts only through the stats it moves: the requirement and its tier stay the build's own.
 */
import { runFixed } from "../solve/teamrun.js";
import type { TeamRun } from "../solve/teamrun.js";
import { Gear } from "../engine/gear.js";
import { addStat } from "../engine/context.js";
import { Stat } from "../engine/stats.js";
import { Substat, rollLine, tierRoll } from "../echoes/substats.js";

/** Each substat's own name on the chart, % and flat told apart. */
export const SUBSTAT_LABEL: Record<Substat, string> = {
  [Substat.CritRate]: "Crit Rate", [Substat.CritDmg]: "Crit DMG", [Substat.Er]: "Energy Regen",
  [Substat.AtkPct]: "ATK%", [Substat.FlatAtk]: "Flat ATK", [Substat.HpPct]: "HP%", [Substat.FlatHp]: "Flat HP",
  [Substat.DefPct]: "DEF%", [Substat.FlatDef]: "Flat DEF", [Substat.Basic]: "Basic", [Substat.Heavy]: "Heavy",
  [Substat.Skill]: "Skill", [Substat.Liberation]: "Liberation",
};

/** One roll's worth: the share of the team total it adds (%), and in damage. */
export interface SubstatGain { sub: Substat; value: number; pct: number; dmg: number }

const GAINS = new WeakMap<TeamRun, SubstatGain[][]>();
export const cachedGains = (run: TeamRun): SubstatGain[][] | undefined => GAINS.get(run);

/** Every member's thirteen, a member at a time with a pause between so the page keeps drawing.
 *  `stale` stops a pass the page has moved on from. */
export async function substatGains(run: TeamRun, stale: () => boolean): Promise<SubstatGain[][] | null> {
  const seen = GAINS.get(run);
  if (seen) return seen;
  const { teamKey, members, combo } = run;
  const base = runFixed(teamKey, members, combo).fightTotal;
  const out: SubstatGain[][] = [];
  for (let i = 0; i < members.length; i++) {
    await new Promise((r) => setTimeout(r));
    if (stale()) return null;
    const own: SubstatGain[] = [];
    for (let s = Substat.CritRate; s <= Substat.Liberation; s++) {
      const value = tierRoll(s, combo[i]!.highSubs);
      const [stat, v, tag] = rollLine(s, value);
      const less = new Gear({ name: "Substat Value", constantStats: () => addStat(stat as Stat, -v, tag) });
      // the member wears one piece more for this run alone: the roll taken back off
      const total = runFixed(teamKey, members, combo, members.map((_, j) => (j === i ? [less] : []))).fightTotal;
      own.push({ sub: s, value, dmg: base - total, pct: ((base - total) / base) * 100 });
    }
    out.push(own);
  }
  GAINS.set(run, out);
  return out;
}
