/**
 * Stat vocabulary.
 *
 * Units follow the authoring convention from TODO.md (`add(36, CRIT_RATE)`): ratio stats
 * are written in **percent units** (36 means 36%), flat stats are written flat (500 atk).
 * The engine divides by 100 only at the point of use, so authored numbers always read the
 * way the game presents them.
 *
 * There is no tag-filter on a buff any more. An action resolves the bonuses that apply to
 * it from its own element and type, so "12% fusion damage" is a distinct stat rather than
 * "12% damage, conditional on fusion".
 */

/* ------------------------------------------------------------------ flat stats */

export const BASE_ATK = "baseAtk";
export const BASE_HP  = "baseHP";
export const BASE_DEF = "baseDef";

/** Additive flat amounts, applied on top of base × (1 + bonus). */
export const FLAT_ATK = "flatAtk";
export const FLAT_HP  = "flatHP";
export const FLAT_DEF = "flatDef";

/** Derived totals, folded on demand from base/bonus/flat. Read these in conversion passives. */
export const ATK = "finalAtk";
export const HP  = "finalHp";
export const DEF = "finalDef";

/* --------------------------------------------------------------- ratio stats */

export const BONUS_ATK = "bonusAtk";
export const BONUS_HP  = "bonusHP";
export const BONUS_DEF = "bonusDef";

export const CRIT_RATE = "critRate";
export const CRIT_DMG  = "critDmg";
export const ER        = "er";    // energy regen
export const TBB       = "tbb";   // tune break boost

export const MV      = "mv";        // multiplier on the action's motion value
export const MV_BASE = "mvBase";    // second, independent motion-value multiplier

/**
 * Shields the action being evaluated grants. A stat rather than a counter, because it is a
 * property of one action rather than a running total: the action seeds it from its own
 * `applications`, any buff may add to it, and anything watching shields reads the sum. The
 * engine banks that sum into `SHIELDS_HELD` once every buff has had its say.
 */
export const SHIELDS = "shields";
export const SHIELDS_HELD = "shieldsHeld";   // per-resonator running total

export const DMG_BONUS  = "dmgBonus";
export const AMP        = "amplification";
export const SPECIAL_AMP = "specialAmp"; // amp that works on tune and dot
export const DMG_DEALT  = "dmgDealt";

export const RES_IGNORE = "resIgnore"; // doesnt work on dot
export const RES_SHRED  = "resShred";
export const DEF_IGNORE = "defIgnore"; // doesnt work on dot
export const DEF_SHRED  = "defShred";  // doesnt work on dot
export const DEF_REDUCE = "defReduce";

/* ------------------------------------------------------- scoped damage bonuses */

/** Amplification scoped the same way — Iuno's outro amplifies heavy attacks only. */
export const ampFor = (tag) => `${AMP}:${tag}`;
export const HEAVY_AMP = ampFor("heavy");
export const BASIC_AMP = ampFor("basic");
export const LIB_AMP   = ampFor("liberation");

/** Damage bonus that only applies to actions carrying `tag` (an element or a type). */
export const dmgBonusFor = (tag) => `${DMG_BONUS}:${tag}`;

// elements
export const FUSION_DMG   = dmgBonusFor("fusion");
export const GLACIO_DMG   = dmgBonusFor("glacio");
export const AERO_DMG     = dmgBonusFor("aero");
export const ELECTRO_DMG  = dmgBonusFor("electro");
export const SPECTRO_DMG  = dmgBonusFor("spectro");
export const HAVOC_DMG    = dmgBonusFor("havoc");
export const PHYSICAL_DMG = dmgBonusFor("physical");

// types
export const BASIC_DMG  = dmgBonusFor("basic");
export const HEAVY_DMG  = dmgBonusFor("heavy");
export const SKILL_DMG  = dmgBonusFor("skill");
export const LIB_DMG    = dmgBonusFor("liberation");
export const INTRO_DMG  = dmgBonusFor("intro");
export const OUTRO_DMG  = dmgBonusFor("outro");
export const ECHO_DMG   = dmgBonusFor("echo");
export const BREAK_DMG  = dmgBonusFor("break");

/* ------------------------------------------------------------------- metadata */

/** Ratio stats, held in percent units. Everything else is a flat amount or a count. */
export const PERCENT_STATS = new Set([
  BONUS_ATK, BONUS_HP, BONUS_DEF, CRIT_RATE, CRIT_DMG, ER, TBB, MV, MV_BASE,
  DMG_BONUS, AMP, SPECIAL_AMP, DMG_DEALT,
  RES_IGNORE, RES_SHRED, DEF_IGNORE, DEF_SHRED, DEF_REDUCE,
]);

export const isPercent = (stat) =>
  PERCENT_STATS.has(stat)
  || stat.startsWith(`${DMG_BONUS}:`)
  || stat.startsWith(`${AMP}:`);

/* ------------------------------------------------------------------- naming */

/**
 * How a stat is written for a reader rather than for the engine: `dmgBonus:aero` is "Aero Dmg".
 *
 * Scoped stats are built from their tag, so a new element or damage type reads correctly
 * without being listed here — only the irregular names need spelling out.
 */
const STAT_NAMES = {
  [BASE_ATK]: "Base ATK", [BASE_HP]: "Base HP", [BASE_DEF]: "Base DEF",
  [FLAT_ATK]: "Flat ATK", [FLAT_HP]: "Flat HP", [FLAT_DEF]: "Flat DEF",
  [ATK]: "ATK", [HP]: "HP", [DEF]: "DEF",
  [BONUS_ATK]: "ATK%", [BONUS_HP]: "HP%", [BONUS_DEF]: "DEF%",
  [CRIT_RATE]: "Crit Rate", [CRIT_DMG]: "Crit Dmg",
  [ER]: "Energy Regen", [TBB]: "Tune Break Boost",
  [MV]: "Motion Value Bonus", [MV_BASE]: "Motion Value Bonus 2",
  [DMG_BONUS]: "Dmg Bonus", [AMP]: "Amplification",
  [SPECIAL_AMP]: "Special Amp", [DMG_DEALT]: "Dmg Dealt",
  [RES_IGNORE]: "Res Ignore", [RES_SHRED]: "Res Shred",
  [DEF_IGNORE]: "Def Ignore", [DEF_SHRED]: "Def Shred", [DEF_REDUCE]: "Def Reduce",
  [SHIELDS]: "Shields", [SHIELDS_HELD]: "Shields Held",
};

/** `aero` -> `Aero`, so a scoped stat can be spelled out from its tag alone. */
const titled = (tag) => tag.charAt(0).toUpperCase() + tag.slice(1);

export function statLabel(stat) {
  if (STAT_NAMES[stat]) return STAT_NAMES[stat];
  if (stat.startsWith(`${DMG_BONUS}:`)) return `${titled(stat.slice(DMG_BONUS.length + 1))} Dmg`;
  if (stat.startsWith(`${AMP}:`)) return `${titled(stat.slice(AMP.length + 1))} Amp`;
  return stat;
}

/* ---------------------------------------------------------------------- counters */
/**
 * Counters persist across actions rather than being rebuilt from the buff list each time,
 * which is what separates them from the stats above.
 *
 * Team-wide ones live on `State.counters` and are read with `teamCounter()`. Some are static
 * team properties contributed once in `onFightStart()` (fusion count); others are live
 * resources any action can move (shield count, break bar).
 *
 * Per-resonator resources live on `Slot.counters` and are read with `counter()`.
 */
export const COUNT_FUSION = "countFusion";   // team-wide, set at fight start

/** Off-tune is a property of the fight, not of a resonator: the whole team fills one bar. */
export const OFFTUNE  = "offtune";           // team-wide running total

export const ENERGY   = "energy";            // per resonator, running total
export const CONCERTO = "concerto";

/**
 * Generic forte gauges. A resonator uses these in order for whatever gauges its kit has,
 * and only invents a name of its own once all four are taken.
 */
export const FORTE1 = "forte1";
export const FORTE2 = "forte2";
export const FORTE3 = "forte3";
export const FORTE4 = "forte4";

/**
 * Resource counters an action's declarative fields feed. All are running totals across the
 * whole rotation; the only question is who owns the total.
 */
export const SLOT_RESOURCES = [ENERGY, CONCERTO, FORTE1, FORTE2, FORTE3, FORTE4];
export const TEAM_RESOURCES = [OFFTUNE];
export const ACTION_RESOURCES = [...SLOT_RESOURCES, ...TEAM_RESOURCES];
