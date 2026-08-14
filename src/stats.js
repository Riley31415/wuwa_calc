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

/*
 * Motion value, in three parts:
 *
 *     (base mv + ADD_MV) x (1 + MUL_MV) x (1 + SPECIAL_MV)
 *
 * ADD_MV is in the same units as the action's own `mv` — percent — and lands inside the
 * parentheses, so a kit that says "adds 21.10% motion value per 1000 Max HP" says exactly that
 * instead of dividing through by the action's own value to fake it as a multiplier.
 *
 * MUL_MV and SPECIAL_MV are independent multipliers, so two sources never compound into each
 * other the way a single stacked one would.
 */
export const ADD_MV     = "addMv";
export const MUL_MV     = "mulMv";
export const SPECIAL_MV = "specialMv";

/*
 * Shields are not a stat. An action says how many it grants with its own `shields` field, and
 * a buff that cares reads it straight off the action (`action().shields`). Everything that
 * scales on shielding is a stacking buff instead, which is what the game actually describes
 * ("upon gaining a Shield, gain 1 stack, up to N").
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
 * resolves the ones matching its own **element** and **damage type**; `cast` and `scaling` do
 * not participate, so Jingran's liberation (cast liberation, type heavy) pays heavy bonuses
 * only.
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
 * `cast` — which button an action is, as opposed to `type` (what damage it deals) or `element`.
 *
 * This is the axis a "when you cast X" passive keys off: casting a heavy attack is a heavy
 * attack whatever damage it happens to deal, which is how the game words all of them — a kit
 * that cares just checks `action().cast`. Deliberately not matched by a conditional (see
 * TAGS_MATCHED above): Jingran's liberation is `cast: LIB` but `type: HEAVY`, so resolving cast
 * too would start paying liberation damage bonuses on it.
 *
 * The two axes genuinely disagree all over the place, which is the whole reason both exist:
 *   Jingran  basic stage 3   cast BASIC, type HEAVY   (a basic press that deals heavy damage)
 *   Jingran  forte heavy     cast HEAVY, type HEAVY
 *   Iuno     Moonbow basic   cast BASIC, type LIB     (a basic press, liberation damage)
 *   SK       intro           cast INTRO, type SKILL
 *
 * Reuses the damage-type spellings, since the game does too. There is no `normal` or `forte`
 * cast: "forte" is where a cast comes from, not which button it is — every forte cast is
 * really a basic, heavy, skill or liberation press.
 */
export const CASTS = [BASIC, HEAVY, SKILL, LIB, INTRO, OUTRO, ECHO];

/**
 * `node` — which part of the kit a cast comes out of, as opposed to `cast` (which button) or
 * `type` (what damage it deals). This is the axis damage is worth *attributing* along: how much
 * of a rotation came out of the forte circuit versus the liberation versus ordinary attacks.
 *
 * Five, and only five. `outro` and `echo` used to be listed here too, which was a fiction — an
 * outro is not a branch of the kit the way the forte circuit is, and an echo is not part of the
 * resonator's kit at all. Both are casts, and `cast` is where they live now; an action from
 * neither branch simply has no node.
 *
 * Orthogonal to `cast` on purpose, and they disagree constantly: Jingran's forte heavy is
 * `node: FORTE` but `cast: HEAVY`, his liberation is `node: LIB` but `cast: LIB` and
 * `type: HEAVY`, and Iuno's Moonbow basics are `node: FORTE`, `cast: BASIC`, `type: LIB`.
 */
export const NORMAL = "normal";
export const FORTE  = "forte";
// SKILL, LIB and INTRO already declared above — a node and a type sharing a spelling
export const NODES = [NORMAL, SKILL, FORTE, LIB, INTRO];

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
  BONUS_ATK, BONUS_HP, BONUS_DEF, CRIT_RATE, CRIT_DMG, ER, TBB,
  ADD_MV, MUL_MV, SPECIAL_MV,
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
  [ADD_MV]: "additional MV",
  [MUL_MV]: "MV multiplier", [SPECIAL_MV]: "Special MV multiplier",
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
 * Each one is a real, hardcoded field on `Slot` (energy, concerto, forte1-4) or `State`
 * (off-tune, the one team-wide bar) — not a map a kit could add a new entry to by typo. The
 * string constants below are what `counter()`/`setCounter()` accept; anything else throws.
 * Static team composition (how many resonators are a given element, say) is not a counter at
 * all: it is read straight off each slot's own resonator Gear via `teamElements()` in
 * state.js, so nothing has to remember to keep a count in sync as the team changes.
 */

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
