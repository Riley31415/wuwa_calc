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
  CRIT_RATE, CRIT_DMG, MV, MV_BASE, SPECIAL_AMP, DMG_DEALT,
  RES_IGNORE, RES_SHRED, DEF_IGNORE, DEF_SHRED, DEF_REDUCE,
} from "./stats.js";

/** The action's motion value after its multipliers, in percent. */
export const mvPercent = (snapshot) =>
  snapshot.action.mv * (1 + snapshot.stat(MV) / 100) * (1 + snapshot.stat(MV_BASE) / 100);

/** Base stat a dot or tune hit scales off, for the resonator's level. */
export function constantStat(scaling, config, levels) {
  const lv = levels.find((x) => x.level === config.level);
  if (scaling === "tune") return Math.floor(lv.tuneRate * config.maxOfftune * 10000);
  if (scaling === "dot") return Math.floor(lv.dot);
  return 0;
}

/**
 * @param snapshot  from State.resolve()
 * @param config    { level, enemyLevel, res, maxOfftune }
 * @param levels    data/levels.json — required
 * @returns {{ noCrit: number, crit: number, avg: number }}
 */
export function damage(snapshot, config, levels) {
  const { action } = snapshot;
  const s = (k) => snapshot.stat(k) / 100;          // ratio stats
  const scaling = action.scaling ?? "atk";

  const notDot = scaling !== "dot" ? 1 : 0;
  const notTune = scaling !== "tune" ? 1 : 0;

  const finalStat = Math.floor(
    scaling === "atk" ? snapshot.atk
    : scaling === "hp" ? snapshot.hp
    : scaling === "def" ? snapshot.def
    : constantStat(scaling, config, levels),
  );

  const finalRes = config.res / 100 - s(RES_IGNORE) * notDot - s(RES_SHRED);
  const resFactor =
    finalRes < 0 ? 1 - finalRes / 2
    : finalRes < 0.8 ? 1 - finalRes
    : 1 / (1 + 5 * finalRes);

  const enemyDef = 792 + config.enemyLevel * 8;
  const finalDef = (1 - notDot * s(DEF_IGNORE))
    * Math.floor(enemyDef * (1 - s(DEF_REDUCE) - notDot * s(DEF_SHRED)));
  const ownDef = 800 + config.level * 8;
  const defFactor = ownDef / (ownDef + finalDef);

  // motion values are authored in percent, so 307.34 is a 3.0734x multiplier
  const finalMv = (action.mv * (1 + s(MV)) * (1 + s(MV_BASE))) / 100;

  const noCrit = finalMv * finalStat
    * (1 + (snapshot.amp / 100) * notDot * notTune + s(SPECIAL_AMP))
    * (1 + (snapshot.dmgBonus / 100) * notDot * notTune)
    * resFactor * defFactor * (1 + s(DMG_DEALT));

  const crit = noCrit * (notDot * notTune ? s(CRIT_DMG) : 1);
  const cr = s(CRIT_RATE);
  const avg = cr >= 1 ? crit : noCrit * (1 - cr) + crit * cr;

  return { noCrit, crit, avg };
}
