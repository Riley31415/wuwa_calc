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

/*
 * Shields are not a stat. An action says how many it grants with its own `shields` field, and
 * a buff that cares reads it straight off the action (`action().shields`). Everything that
 * used to scale on a running shield total is a stacking buff instead, which is what the game
 * actually describes ("upon gaining a Shield, gain 1 stack, up to N").
 */

export const DMG_BONUS  = "dmgBonus";
export const AMP        = "amplification";
export const SPECIAL_AMP = "specialAmp"; // amp that works on tune and dot
export const DMG_DEALT  = "dmgDealt";

export const RES_IGNORE = "resIgnore"; // doesnt work on dot
export const RES_SHRED  = "resShred";
export const DEF_IGNORE = "defIgnore"; // doesnt work on dot
export const DEF_SHRED  = "defShred";  // doesnt work on dot
export const DEF_REDUCE = "defReduce";

/* ------------------------------------------------------------ scoped stats */
/**
 * **Any** stat can be scoped to what the action is. "12% fusion damage" is `dmgBonus` scoped to
 * `fusion`; "50% heavy attack amplification" is `amplification` scoped to `heavy`; "12% crit
 * rate on heavy attacks" is `critRate` scoped to `heavy`. They are all one mechanism — a stat
 * key with a tag glued on — rather than a separate named constant per combination.
 *
 * Authors never build these by hand: `add(value, tag, stat)` does it (see state.js). An action
 * resolves the ones matching its own **element** and **damage type**; `node` and `scaling` do
 * not participate, so Jingran's Lib1 (node liberation, type heavy) pays heavy bonuses only.
 */
export const scopedStat = (tag, stat) => `${stat}:${tag}`;

/* --- the tag vocabulary: what a conditional, an element field or a type field may say ------ */

export const AERO     = "aero";
export const ELECTRO  = "electro";
export const FUSION   = "fusion";
export const GLACIO   = "glacio";
export const SPECTRO  = "spectro";
export const HAVOC    = "havoc";
export const PHYSICAL = "physical";

export const ELEMENTS = [AERO, ELECTRO, FUSION, GLACIO, SPECTRO, HAVOC, PHYSICAL];

export const BASIC   = "basic";
export const HEAVY   = "heavy";
export const SKILL   = "skill";
export const LIB     = "liberation";
export const INTRO   = "intro";
export const OUTRO   = "outro";
export const ECHO    = "echo";
export const BREAK   = "break";
export const STATUS  = "status";
export const RUPTURE = "rupture";
export const HACK    = "hack";

export const TYPES = [BASIC, HEAVY, SKILL, LIB, INTRO, OUTRO, ECHO, BREAK, STATUS, RUPTURE, HACK];

/**
 * `node` — which button a cast is, as opposed to `type` (what damage it deals) or `element`.
 * Deliberately not matched by a conditional (see TAGS_MATCHED above): Jingran's Lib1 has node
 * `liberation` but type `heavy`, so resolving node too would start paying liberation bonuses
 * on it. Reuses the same words as a handful of damage types (`SKILL`, `LIB`, `INTRO`, `OUTRO`,
 * `ECHO`) since the game does too — Shorekeeper's intro deals skill damage and both are
 * legitimately "skill" in their own vocabulary.
 */
export const NORMAL = "normal";
export const FORTE  = "forte";
// SKILL, LIB, INTRO, OUTRO, ECHO already declared above — a node and a type sharing a spelling
export const NODES = [NORMAL, SKILL, FORTE, LIB, INTRO, OUTRO, ECHO];

/** `scaling` — which stat a hit reads its final number from. */
export const SCALE_ATK = "atk";
export const SCALE_HP  = "hp";
export const SCALE_DEF = "def";
export const SCALE_DOT = "dot";
export const SCALE_TUNE = "tune";
export const SCALINGS = [SCALE_ATK, SCALE_HP, SCALE_DEF, SCALE_DOT, SCALE_TUNE];

/** Split a scoped key back into its parts. `dmgBonus:fusion` -> `["dmgBonus", "fusion"]`. */
export function splitStat(stat) {
  const i = stat.indexOf(":");
  return i === -1 ? [stat, null] : [stat.slice(0, i), stat.slice(i + 1)];
}

/** What a conditional may name: the action's element or its damage type. */
export const TAGS_MATCHED = ["element", "type"];

/* ------------------------------------------------------------------- metadata */

/** Ratio stats, held in percent units. Everything else is a flat amount or a count. */
export const PERCENT_STATS = new Set([
  BONUS_ATK, BONUS_HP, BONUS_DEF, CRIT_RATE, CRIT_DMG, ER, TBB, MV, MV_BASE,
  DMG_BONUS, AMP, SPECIAL_AMP, DMG_DEALT,
  RES_IGNORE, RES_SHRED, DEF_IGNORE, DEF_SHRED, DEF_REDUCE,
]);

/** A scoped stat is a ratio exactly when the stat it scopes is. */
export const isPercent = (stat) => PERCENT_STATS.has(splitStat(stat)[0]);

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
};

/** `aero` -> `Aero`, so a scoped stat can be spelled out from its tag alone. */
const titled = (tag) => tag.charAt(0).toUpperCase() + tag.slice(1);

/**
 * `dmgBonus:fusion` reads "Fusion Dmg Bonus", `amplification:heavy` reads "Heavy Amplification",
 * `critRate:heavy` reads "Heavy Crit Rate" — the tag simply qualifies the stat's own name, so a
 * new element or damage type spells itself out without being listed anywhere.
 */
export function statLabel(stat) {
  const [base, tag] = splitStat(stat);
  const name = STAT_NAMES[base] ?? base;
  return tag ? `${titled(tag)} ${name}` : name;
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
