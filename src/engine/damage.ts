/**
 * The damage formula, transcribed from Calculator!BY:CI (see FINDINGS.md §3 step 5).
 *
 * Inputs arrive in the authoring units — ratio stats in percent, motion values in percent —
 * so everything is scaled here. The floors are load-bearing: the TUNETEST sheet's observed
 * in-game numbers only line up with the rounding in place.
 *
 * dot and tune scalings deliberately bypass damage bonus, res/def ignore and crit. Dot also
 * bypasses total damage, and every amplification but the kind scoped to the Negative Status it is
 * — that one scope is the whole of what a status's own damage scales with.
 */
import type { Action } from "./rotation.js";
import { Stat, EnemyStat, Scaling } from "./stats.js";

/** A resolved action snapshot, from `State.resolve()` — everything the formula reads off it. */
export interface Snapshot {
  action: Action;
  stat(key: Stat | EnemyStat): number;
  /** `stat()`'s own backing array, indexed by the stat itself — what the formula below reads. */
  stats: number[];
  atk: number;
  hp: number;
  def: number;
  amp: number;
  /** The part of `amp` that came in scoped to a `Type2` — all a dot hit reads (see `ampFactor`). */
  type2Amp: number;
  /** The parts of Crit Rate/Crit DMG scoped to a `Type2` — the only crit a dot or tune hit has. */
  type2CritRate: number;
  type2CritDmg: number;
  dmgBonus: number;
  /** The enemy's own current resistance to this action's element, and current defence — both
   *  read off `Enemy` at resolve time (base plus whatever debuffs contributed this pass). */
  enemyRes: number;
  enemyDef: number;
  chain?: string | null;
  chainOf?: string | null;
}

/** Every fight in this calculator runs at level 90 — the resonator's own level, plus the only
 *  two figures a dot/tune hit needs that don't come off the resonator's own stats, taken
 *  straight from `data/levels.json`'s own level-90 row rather than looked up out of the whole
 *  table at runtime. */
export const RESONATOR_LEVEL = 90;
const LEVEL_90_DOT = 3674;
const LEVEL_90_TUNE = 10027;

/**
 * The action's motion value after everything that changes it, in percent:
 *
 *     (base + added) x (1 + bonus) x (1 + special bonus)
 *
 * The addition happens first and in the action's own units, so a kit that adds motion value
 * outright does not have to be re-expressed as a multiplier of whatever the action started at.
 */
export const mvPercent = (snapshot: Snapshot): number =>
  (snapshot.action.mv + snapshot.stats[Stat.AddMv]!)
  * (1 + snapshot.stats[Stat.MulMv]! / 100);

/** Dot damage bypasses ignore and shred; both helpers below need to know. */
const notDotFor = (snapshot: Snapshot): number =>
  (snapshot.action.scaling !== Scaling.Dot ? 1 : 0);

/** The scalar forms of the enemy-side terms, off the figures alone: `damageAvgOf()` (the search's
 *  per-variant path, which has no Snapshot object) and the Snapshot forms below share them, so the
 *  two can't drift. */
const shredOf = (stats: number[], notDot: number, base: number): number =>
  1 - ((1 - notDot * stats[Stat.DefIgnoreNew]! / 100)
    * Math.floor(base * (1 - stats[EnemyStat.DefReduce]! / 100 - notDot * stats[Stat.DefIgnoreOld]! / 100))) / base;
const resOf = (stats: number[], notDot: number, enemyRes: number): number =>
  (enemyRes / 100 - stats[Stat.ResIgnore]! / 100 * notDot - stats[EnemyStat.ResReduce]! / 100) * 100;
const resFactorFrom = (finalRes: number): number =>
  (finalRes < 0 ? 1 - finalRes / 2
    : finalRes < 0.8 ? 1 - finalRes
    : 1 / (1 + 5 * finalRes));
const OWN_DEF = 800 + RESONATOR_LEVEL * 8;
const defFactorFrom = (finalDef: number): number => OWN_DEF / (OWN_DEF + finalDef);

/**
 * How much of the enemy's defence ignore, reduce and shred strip away, **as a fraction of its
 * base** — 0 means untouched, 0.3 means it is defending with 30% less than it started the fight
 * with. The base itself (`snapshot.enemyDef`) already carries the enemy's own level and any
 * debuffs on it.
 */
export function effectiveShred(snapshot: Snapshot): number {
  return shredOf(snapshot.stats, notDotFor(snapshot), snapshot.enemyDef);
}

/** The enemy's resistance after ignore and shred, in percent units. May go negative. */
export function effectiveRes(snapshot: Snapshot): number {
  return resOf(snapshot.stats, notDotFor(snapshot), snapshot.enemyRes);
}

/** The enemy's resistance turned into the multiplier the formula uses. */
export function resFactorOf(snapshot: Snapshot): number {
  return resFactorFrom(effectiveRes(snapshot) / 100);
}

/** The enemy's defence turned into the multiplier the formula uses. */
export function defFactorOf(snapshot: Snapshot): number {
  // the ratio the table shows, back out to the absolute defence the formula divides by
  return defFactorFrom((1 - effectiveShred(snapshot)) * snapshot.enemyDef);
}

export interface DamageFactors {
  scaling: Scaling | null;
  finalMv: number;
  finalStat: number;
  ampFactor: number;
  bonusFactor: number;
  tbbFactor: number;
  resFactor: number;
  defFactor: number;
  dealtFactor: number;
  critFactor: number;
  critMult: number;
  noCrit: number;
  crit: number;
  avg: number;
}

/**
 * Every term of the damage formula, kept apart so the table can show the whole product rather
 * than only its result. `damage()` is just the product of these.
 *
 * @returns each multiplier, plus the `avg` they come to
 */
export function damageFactors(snapshot: Snapshot): DamageFactors {
  const { action } = snapshot;
  const s = (k: Stat) => snapshot.stats[k]! / 100;   // ratio stats
  const { scaling } = action;

  // A rotation marker rather than a cast (rotation.ts's own SWAP and friends): no scaling, and
  // the Action constructor forbids that on anything carrying a motion value, so there is nothing
  // to multiply and every term is reported as the neutral value it would have been.
  if (scaling === null) {
    return {
      scaling: null, finalMv: 0, finalStat: 0,
      ampFactor: 1, bonusFactor: 1, tbbFactor: 1, resFactor: 1, defFactor: 1, dealtFactor: 1,
      critFactor: 1, critMult: 1,
      noCrit: 0, crit: 0, avg: 0,
    };
  }

  // Fixed reads no stat and takes no buff — its own mv is the damage, full stop. Every other
  // factor is reported as a neutral 1 so the table still has something to show per term.
  if (scaling === Scaling.Fixed) {
    return {
      scaling, finalMv: action.mv, finalStat: 100,
      ampFactor: 1, bonusFactor: 1, tbbFactor: 1, resFactor: 1, defFactor: 1, dealtFactor: 1,
      critFactor: 1, critMult: 1,
      noCrit: action.mv, crit: action.mv, avg: action.mv,
    };
  }

  const notDot = scaling !== Scaling.Dot ? 1 : 0;
  const notTune = scaling !== Scaling.Tune ? 1 : 0;

  const finalStat = Math.floor(
    scaling === Scaling.Atk ? snapshot.atk
    : scaling === Scaling.Hp ? snapshot.hp
    : scaling === Scaling.Def ? snapshot.def
    : scaling === Scaling.Dot ? LEVEL_90_DOT
    : scaling === Scaling.Tune ? LEVEL_90_TUNE
    : NaN
  );

  // motion values are authored in percent, so 307.34 is a 3.0734x multiplier
  const finalMv = mvPercent(snapshot) / 100;

  // Amplification is the one thing a dot hit does read (the migrated sheet's own `specialAmp`
  // column) — but only the part scoped to the Negative Status it is, never plain or element-scoped
  // amplification. That split can't be made from `amp` here, since every matching scope is already
  // summed into it, so evaluate.ts keeps the scoped part alongside (see `type2Amp` there).
  const ampFactor = 1 + ((notDot ? snapshot.amp : snapshot.type2Amp) / 100) * notTune;
  const bonusFactor = 1 + (snapshot.dmgBonus / 100) * notDot * notTune;
  // Tune break boost multiplies tune damage and nothing else. It is part of the formula rather
  // than something the tune break converts into amplification on itself: the ordinary damage
  // bonus and amplification are both gated off for tune, so this is the multiplier tune has.
  // ...and it divides its own points down rather than going through `s()`: Tune Break Boost is
  // not a ratio stat (see stats.ts's own PERCENT_STATS), it is a count that happens to buy 1% each.
  const tbbFactor = 1 + (snapshot.stats[Stat.Tbb]! / 100) * (1 - notTune);
  const resFactor = resFactorOf(snapshot);
  const defFactor = defFactorOf(snapshot);
  // Total Damage joins damage bonus and amplification in what a dot doesn't read — a status's own
  // damage is the target's, and nothing the attacker stacks onto their own hits carries into it.
  const dealtFactor = 1 + s(Stat.TotalDmg) * notDot;

  // dot and tune crit only off the Negative-Status-scoped crit (Hsin's S6) — with none, a flat 1
  const special = !(notDot * notTune);
  const critMult = special ? (snapshot.type2CritDmg ? snapshot.type2CritDmg / 100 : 1) : s(Stat.CritDmg);
  const cr = special ? snapshot.type2CritRate / 100 : s(Stat.CritRate);
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

/** `damageFactors().avg` alone, off the figures rather than a Snapshot — the same expressions in
 *  the same order, with nothing allocated. The search calls this once per variant per action. */
export function damageAvgOf(
  action: Action, stats: number[], atk: number, hp: number, def: number,
  amp: number, type2Amp: number, dmgBonus: number, type2CritRate: number, type2CritDmg: number,
  enemyRes: number, enemyDef: number,
): number {
  const { scaling } = action;
  if (scaling === null) return 0;
  if (scaling === Scaling.Fixed) return action.mv;
  const notDot = scaling !== Scaling.Dot ? 1 : 0;
  const notTune = scaling !== Scaling.Tune ? 1 : 0;
  const finalStat = Math.floor(
    scaling === Scaling.Atk ? atk
    : scaling === Scaling.Hp ? hp
    : scaling === Scaling.Def ? def
    : scaling === Scaling.Dot ? LEVEL_90_DOT
    : scaling === Scaling.Tune ? LEVEL_90_TUNE
    : NaN
  );
  const finalMv = (action.mv + stats[Stat.AddMv]!) * (1 + stats[Stat.MulMv]! / 100) / 100;
  const ampFactor = 1 + ((notDot ? amp : type2Amp) / 100) * notTune;
  const bonusFactor = 1 + (dmgBonus / 100) * notDot * notTune;
  const tbbFactor = 1 + (stats[Stat.Tbb]! / 100) * (1 - notTune);
  const resFactor = resFactorFrom(resOf(stats, notDot, enemyRes) / 100);
  const defFactor = defFactorFrom((1 - shredOf(stats, notDot, enemyDef)) * enemyDef);
  const dealtFactor = 1 + stats[Stat.TotalDmg]! / 100 * notDot;
  const special = !(notDot * notTune);
  const critMult = special ? (type2CritDmg ? type2CritDmg / 100 : 1) : stats[Stat.CritDmg]! / 100;
  const cr = special ? type2CritRate / 100 : stats[Stat.CritRate]! / 100;
  const critFactor = cr >= 1 ? critMult : (1 - cr) + critMult * cr;
  const noCrit = finalMv * finalStat * ampFactor * bonusFactor * tbbFactor
    * resFactor * defFactor * dealtFactor;
  return noCrit * critFactor;
}

export const damageAvg = (s: Snapshot): number => damageAvgOf(
  s.action, s.stats, s.atk, s.hp, s.def, s.amp, s.type2Amp, s.dmgBonus, s.type2CritRate, s.type2CritDmg, s.enemyRes, s.enemyDef,
);

export interface Damage {
  noCrit: number;
  crit: number;
  avg: number;
}

/** @param snapshot  from State.resolve() */
export function damage(snapshot: Snapshot): Damage {
  const { noCrit, crit, avg } = damageFactors(snapshot);
  return { noCrit, crit, avg };
}
