/** An echo build's substats: five echoes, five rolls each, twenty-five total. Every roll is
 *  valued at the mid-tier number below. */
import { Gear } from "../kit.js";
import { Stat, DamageType, scopedStat, splitStat } from "../stats.js";

const ROLL: Record<string, number> = {
  [Stat.CritRate]: 7.5, [Stat.CritDmg]: 15, [Stat.Er]: 8.4,
  [Stat.BonusAtk]: 7.9, [Stat.FlatAtk]: 40,
  [Stat.BonusHp]: 7.9, [Stat.FlatHp]: 430,
  [Stat.BonusDef]: 10, [Stat.FlatDef]: 50,
  [Stat.DmgBonus]: 7.9,
};

const ROLLS_PER_BUILD = 25;
/** The four damage types a substat can roll into, and the tag each scopes to. */
const TYPE_KEYS: Record<string, string> = {
  basic: DamageType.Basic, heavy: DamageType.Heavy, skill: DamageType.Skill, liberation: DamageType.Liberation,
};
const TYPES = Object.keys(TYPE_KEYS);
const SCALER_STATS: Record<string, readonly [string, string]> =
  { atk: [Stat.BonusAtk, Stat.FlatAtk], hp: [Stat.BonusHp, Stat.FlatHp] };

/** Define one substat spread from a count of rolls per stat; must total 25. */
export function substats(name: string, counts: Record<string, number>): Gear {
  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  if (total !== ROLLS_PER_BUILD) {
    throw new Error(`substats("${name}"): ${total} rolls, a build has ${ROLLS_PER_BUILD}`);
  }
  const entries = Object.entries(counts).map(([key, n]) => {
    const [stat, tag] = splitStat(key);
    if (!(stat in ROLL)) throw new Error(`substats("${name}"): nothing rolls "${key}"`);
    return { stat, tag, value: ROLL[stat]! * n };
  });
  return new Gear((ctx) => {
    for (const { stat, tag, value } of entries) {
      if (tag) ctx.add(value, tag, stat); else ctx.add(value, stat);
    }
    return name;
  });
}

/** The "chem" spread: crit first, two rolls into the scaler stat and the leaned-on damage
 *  type, one roll into everything else. ER variant trades crit rate rolls for energy regen. */
export function chem(scaler: string, type: string, { er = false }: { er?: boolean } = {}): Gear {
  const [ownPct, ownFlat] = SCALER_STATS[scaler]!;
  const [offPct, offFlat] = SCALER_STATS[scaler === "atk" ? "hp" : "atk"]!;

  const counts: Record<string, number> = {
    [Stat.CritRate]: er ? 2 : 5,
    [Stat.CritDmg]: 5,
    [Stat.Er]: er ? 5 : 2,
    [ownPct]: 2, [ownFlat]: 2,
    [offPct]: 1, [offFlat]: 1,
    [Stat.BonusDef]: 1, [Stat.FlatDef]: 1,
  };
  for (const [key, tag] of Object.entries(TYPE_KEYS)) {
    counts[scopedStat(tag, Stat.DmgBonus)] = key === type ? 2 : 1;
  }

  return substats(`Chem Substats:${er ? " ER" : ""} ${scaler} ${type}`, counts);
}

/** The same catalogue for substats — see ALL_MAINSTATS in mainstats.js. */
export const ALL_SUBSTATS: Gear[] = [];
for (const scaler of ["atk", "hp"]) {
  for (const type of TYPES) {
    ALL_SUBSTATS.push(chem(scaler, type));
    ALL_SUBSTATS.push(chem(scaler, type, { er: true }));
  }
}
