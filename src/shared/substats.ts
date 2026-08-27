/** An echo build's substats: five echoes, five rolls each, twenty-five total. Every roll is
 *  valued at the mid-tier number below. */
import { Buff, addStat } from "../engine/kit.js";
import { Stat, Type1, scopedStat, splitStat } from "../engine/stats.js";
import type { StatKey, Tag } from "../engine/stats.js";

const ROLL: Partial<Record<Stat, number>> = {
  [Stat.CritRate]: 7.5, [Stat.CritDmg]: 15, [Stat.Er]: 8.4,
  [Stat.BonusAtk]: 7.9, [Stat.FlatAtk]: 40,
  [Stat.BonusHp]: 7.9, [Stat.FlatHp]: 430,
  [Stat.BonusDef]: 10, [Stat.FlatDef]: 50,
  [Stat.DmgBonus]: 7.9,
};

const ROLLS_PER_BUILD = 25;
/** The four damage types a substat can roll into, and the tag each scopes to. */
const TYPE_KEYS: Record<string, Tag> = {
  basic: Type1.Basic, heavy: Type1.Heavy, skill: Type1.Skill, liberation: Type1.Liberation,
};
const TYPES = Object.keys(TYPE_KEYS);
/** The three stats a kit can scale off, each as its percent and flat roll. */
const SCALER_STATS: Record<string, readonly [Stat, Stat]> =
  { atk: [Stat.BonusAtk, Stat.FlatAtk], hp: [Stat.BonusHp, Stat.FlatHp], def: [Stat.BonusDef, Stat.FlatDef] };
const SCALERS = Object.keys(SCALER_STATS);

/** Define one substat spread from a count of rolls per stat; must total 25. */
export function substats(name: string, counts: Record<StatKey, number>): Buff {
  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  if (total !== ROLLS_PER_BUILD) {
    throw new Error(`substats("${name}"): ${total} rolls, a build has ${ROLLS_PER_BUILD}`);
  }
  const entries = Object.entries(counts).map(([key, n]) => {
    const [stat, tag] = splitStat(Number(key));
    const roll = ROLL[stat as Stat];
    if (roll === undefined) throw new Error(`substats("${name}"): nothing rolls "${key}"`);
    return { stat: stat as Stat, tag, value: roll * n };
  });
  return new Buff({
    name,
    constantStats: () => { for (const { stat, tag, value } of entries) addStat(stat, value, tag ?? undefined); },
  });
}

/** The "chem" spread: crit first, two rolls into the scaler stat (ATK, HP or DEF, percent and
 *  flat) and the leaned-on damage type, one roll into everything else. ER variant trades crit
 *  rate rolls for energy regen. */
export function chem(scaler: string, type: string, { er = false }: { er?: boolean } = {}): Buff {
  if (!(scaler in SCALER_STATS)) throw new Error(`chem(): nothing scales off "${scaler}"`);
  const counts: Record<StatKey, number> = {
    [Stat.CritRate]: er ? 2 : 5,
    [Stat.CritDmg]: 5,
    [Stat.Er]: er ? 5 : 2,
  };
  for (const [key, [pct, flat]] of Object.entries(SCALER_STATS)) {
    counts[pct] = counts[flat] = key === scaler ? 2 : 1;
  }
  for (const [key, tag] of Object.entries(TYPE_KEYS)) {
    counts[scopedStat(tag, Stat.DmgBonus)] = key === type ? 2 : 1;
  }

  return substats(`Chem Subs:${er ? " ER" : ""} ${scaler} ${type}`, counts);
}

/** The same catalogue for substats — see ALL_MAINSTATS in mainstats.js. */
export const ALL_SUBSTATS: Buff[] = [];
for (const scaler of SCALERS) {
  for (const type of TYPES) {
    ALL_SUBSTATS.push(chem(scaler, type));
    ALL_SUBSTATS.push(chem(scaler, type, { er: true }));
  }
}
