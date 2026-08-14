/**
 * The damage formula, transcribed from Calculator!BY:CI (see FINDINGS.md §3 step 5).
 *
 * Inputs arrive in the authoring units — ratio stats in percent, motion values in percent —
 * so everything is scaled here. The floors are load-bearing: the TUNETEST sheet's observed
 * in-game numbers only line up with the rounding in place.
 *
 * dot and tune scalings deliberately bypass amplification, damage bonus and crit.
 */
import {
  CRIT_RATE, CRIT_DMG, ADD_MV, MUL_MV, SPECIAL_MV, SPECIAL_AMP, DMG_DEALT, TBB,
  RES_IGNORE, RES_SHRED, DEF_IGNORE, DEF_SHRED, DEF_REDUCE,
  SCALE_ATK, SCALE_HP, SCALE_DEF, SCALE_DOT, SCALE_TUNE,
} from "./stats.js";

/**
 * The action's motion value after everything that changes it, in percent:
 *
 *     (base + added) x (1 + bonus) x (1 + special bonus)
 *
 * The addition happens first and in the action's own units, so a kit that adds motion value
 * outright does not have to be re-expressed as a multiplier of whatever the action started at.
 */
export const mvPercent = (snapshot) =>
  (snapshot.action.mv + snapshot.stat(ADD_MV))
  * (1 + snapshot.stat(MUL_MV) / 100)
  * (1 + snapshot.stat(SPECIAL_MV) / 100);

/** What the enemy defends with before the attacker touches it. */
export const enemyBaseDef = (config) => 792 + config.enemyLevel * 8;

/** Dot damage bypasses ignore and shred; both helpers below need to know. */
const notDotFor = (snapshot) => ((snapshot.action.scaling ?? SCALE_ATK) !== SCALE_DOT ? 1 : 0);

/**
 * The enemy's defence after ignore, reduce and shred, **as a fraction of its base** — 1 means
 * untouched, 0.7 means it is defending with 70% of what it started the fight with.
 */
export function effectiveDef(snapshot, config) {
  const s = (k) => snapshot.stat(k) / 100;
  const notDot = notDotFor(snapshot);
  const base = enemyBaseDef(config);
  return ((1 - notDot * s(DEF_IGNORE))
    * Math.floor(base * (1 - s(DEF_REDUCE) - notDot * s(DEF_SHRED)))) / base;
}

/** The enemy's resistance after ignore and shred, in percent units. May go negative. */
export function effectiveRes(snapshot, config) {
  const s = (k) => snapshot.stat(k) / 100;
  return (config.res / 100 - s(RES_IGNORE) * notDotFor(snapshot) - s(RES_SHRED)) * 100;
}

/** Base stat a dot or tune hit scales off, for the resonator's level. */
export function constantStat(scaling, config, levels) {
  const lv = levels.find((x) => x.level === config.level);
  if (scaling === SCALE_TUNE) return Math.floor(lv.tuneRate * config.maxOfftune * 10000);
  if (scaling === SCALE_DOT) return Math.floor(lv.dot);
  return 0;
}

/** The enemy's resistance turned into the multiplier the formula uses. */
export function resFactorOf(snapshot, config) {
  const finalRes = effectiveRes(snapshot, config) / 100;
  return finalRes < 0 ? 1 - finalRes / 2
    : finalRes < 0.8 ? 1 - finalRes
    : 1 / (1 + 5 * finalRes);
}

/** The enemy's defence turned into the multiplier the formula uses. */
export function defFactorOf(snapshot, config) {
  // the ratio the table shows, back out to the absolute defence the formula divides by
  const finalDef = effectiveDef(snapshot, config) * enemyBaseDef(config);
  const ownDef = 800 + config.level * 8;
  return ownDef / (ownDef + finalDef);
}

/**
 * Every term of the damage formula, kept apart so the table can show the whole product rather
 * than only its result. `damage()` is just the product of these.
 *
 * @returns each multiplier, plus the `avg` they come to
 */
export function damageFactors(snapshot, config, levels) {
  const { action } = snapshot;
  const s = (k) => snapshot.stat(k) / 100;          // ratio stats
  const scaling = action.scaling ?? SCALE_ATK;

  const notDot = scaling !== SCALE_DOT ? 1 : 0;
  const notTune = scaling !== SCALE_TUNE ? 1 : 0;

  const finalStat = Math.floor(
    scaling === SCALE_ATK ? snapshot.atk
    : scaling === SCALE_HP ? snapshot.hp
    : scaling === SCALE_DEF ? snapshot.def
    : constantStat(scaling, config, levels),
  );

  // motion values are authored in percent, so 307.34 is a 3.0734x multiplier
  const finalMv = mvPercent(snapshot) / 100;

  const ampFactor = 1 + (snapshot.amp / 100) * notDot * notTune + s(SPECIAL_AMP);
  const bonusFactor = 1 + (snapshot.dmgBonus / 100) * notDot * notTune;
  // Tune break boost multiplies tune damage and nothing else. It is part of the formula rather
  // than something the tune break converts into amplification on itself: the ordinary damage
  // bonus and amplification are both gated off for tune, so this is the multiplier tune has.
  const tbbFactor = 1 + s(TBB) * (1 - notTune);
  const resFactor = resFactorOf(snapshot, config);
  const defFactor = defFactorOf(snapshot, config);
  const dealtFactor = 1 + s(DMG_DEALT);

  // dot and tune never crit, so their crit multiplier is a flat 1
  const critMult = notDot * notTune ? s(CRIT_DMG) : 1;
  const cr = s(CRIT_RATE);
  // what an average hit is worth: every hit crits above 100% rate, otherwise the blend
  const critFactor = cr >= 1 ? critMult : (1 - cr) + critMult * cr;

  const noCrit = finalMv * finalStat * ampFactor * bonusFactor * tbbFactor
    * resFactor * defFactor * dealtFactor;

  return {
    scaling, finalMv, finalStat,
    ampFactor, bonusFactor, tbbFactor, resFactor, defFactor, dealtFactor, critFactor, critMult,
    noCrit,
    crit: noCrit * critMult,
    avg: noCrit * critFactor,
  };
}

/**
 * @param snapshot  from State.resolve()
 * @param config    { level, enemyLevel, res, maxOfftune }
 * @param levels    data/levels.json — required
 * @returns {{ noCrit: number, crit: number, avg: number }}
 */
export function damage(snapshot, config, levels) {
  const { noCrit, crit, avg } = damageFactors(snapshot, config, levels);
  return { noCrit, crit, avg };
}
