/** Stat vocabulary. Ratio stats are percent units (36 means 36%), flat stats are flat.
 *
 *  Every enum here is a numeric `const enum`: each member compiles to its bare number wherever it
 *  is used, there is no enum object at runtime, and how a value reads for a person lives in a
 *  separate `*_NAME` table beside it. `Stat` and `EnemyStat` share one index space, so the engine's
 *  per-action totals are a plain array indexed by the stat itself (state.ts's own `effective`); the
 *  three tag enums share another, so a scoped stat packs into one integer (see `scopedStat`). */

/* ------------------------------------------------------------------ flat stats */

/** Every stat, one shared key space (`addStat(stat, value)`/`scopedStat(tag, stat)`) — flat vs
 *  ratio is decided only by membership in `PERCENT_STATS` below. */
export const enum Stat {
  BaseAtk,
  BaseHp,
  BaseDef,

  FlatAtk,
  FlatHp,
  FlatDef,

  BonusAtk,
  BonusHp,
  BonusDef,

  CritRate,
  CritDmg,
  Er,
  Tbb,
  OfftuneBuildup,
  /** Scales what an action regens: `(base energy + AddEnergy) x (1 + this/100)` — Camellya's
   *  Vegetative Universe, Yangyang. Percent; 0 means the ordinary x1. */
  EnergyRegenMult,

  /** Motion value: `(base mv + AddMv) x (1 + MulMv)` — AddMv is inside the parens, MulMv independent. */
  AddMv,
  MulMv,

  /*
   * Shields are not a stat. A kit puts up the shield marker (statuses.ts's SHIELD) from its own
   * updateDebuffs(); a buff that cares reads `applied(SHIELD)` the same action. The elemental
   * Negative Statuses (Electro Flare, ...) are the same shape, as do-nothing enemy debuffs.
   */
  DmgBonus,
  Amp,

  TotalDmg,

  ResIgnore, // doesnt work on dot
  DefIgnoreNew, // use only on the newest resonators
  DefIgnoreOld, // use on resonators phrolova and older

  /** Healing itself is out of scope for this calculator (see the standing rule) — these two
   *  are tracked purely for kit completeness. Nothing reads either; they never reach a column
   *  or a panel. */
  HealingBonus,
  HealingTaken,

  /** Resource deltas a buff contributes on top of an action's own declared energy/concerto/
   *  offtune/forte — banked into the running counters by evaluate(), not read back by a formula. */
  AddEnergy,
  AddConcerto,
  AddOfftune,
  /** Off-tune that lands on the bar directly rather than being built up — Denia's half-bar
   *  surge, and the drain a Tune Break takes back off. Unlike AddOfftune, Off-Tune Buildup Rate
   *  doesn't scale it: it is already the amount the bar moves. */
  DirectOfftune,
  AddForte1,
  AddForte2,
  AddForte3,
  AddForte4,
  AddForte5,
}

/** Stats that describe the *enemy* itself — a real debuff on the target that every attacker reads
 *  identically, not a personal modifier for whoever's dealing the hit. `Stat.ResIgnore`/
 *  `DefIgnoreNew`/`DefIgnoreOld` stay in `Stat`: those are the attacker's own penetration, not a
 *  change to the enemy's own stat line. Granted/read through `addEnemyStat()`, never `addStat()`,
 *  so a kit can't reach for the wrong pool by mistake. Numbered on from `Stat`'s last member so
 *  the two share one index space (see the header). */
export const enum EnemyStat {
  ResReduce = Stat.AddForte5 + 1,
  DefReduce,
}

/** How many slots `Stat` and `EnemyStat` take between them — the size of a per-action total array. */
export const STAT_COUNT = EnemyStat.DefReduce + 1;

/** How each stat reads for a person — the report's column sources, the hover panels. */
export const STAT_NAME: Record<Stat | EnemyStat, string> = {
  [Stat.BaseAtk]: "Base ATK", [Stat.BaseHp]: "Base HP", [Stat.BaseDef]: "Base DEF",
  [Stat.FlatAtk]: "Flat ATK", [Stat.FlatHp]: "Flat HP", [Stat.FlatDef]: "Flat DEF",
  [Stat.BonusAtk]: "ATK%", [Stat.BonusHp]: "HP%", [Stat.BonusDef]: "DEF%",
  [Stat.CritRate]: "Crit Rate", [Stat.CritDmg]: "Crit Dmg", [Stat.Er]: "Energy Regen",
  [Stat.Tbb]: "Tune Break Boost", [Stat.OfftuneBuildup]: "Buildup",
  [Stat.EnergyRegenMult]: "Energy Regen Multiplier",
  [Stat.AddMv]: "MV increase", [Stat.MulMv]: "MV multiplier",
  [Stat.DmgBonus]: "Dmg Bonus", [Stat.Amp]: "Amplification", [Stat.TotalDmg]: "Total Damage",
  [Stat.ResIgnore]: "Res Ignore", [Stat.DefIgnoreNew]: "Def Ignore (new)", [Stat.DefIgnoreOld]: "Def Ignore (old)",
  [Stat.HealingBonus]: "Healing Bonus", [Stat.HealingTaken]: "Healing Recieved",
  [Stat.AddEnergy]: "Energy", [Stat.AddConcerto]: "Concerto", [Stat.AddOfftune]: "Offtune",
  [Stat.DirectOfftune]: "DirectOfftune",
  [Stat.AddForte1]: "Forte1", [Stat.AddForte2]: "Forte2", [Stat.AddForte3]: "Forte3",
  [Stat.AddForte4]: "Forte4", [Stat.AddForte5]: "Forte5",
  [EnemyStat.ResReduce]: "Res Reduce", [EnemyStat.DefReduce]: "Def Reduce",
};

/* --- the tag vocabulary: what a conditional, an element field or a type field may say ------ */
/* One 32-bit word holds a stat and all three tags, six bits each: the stat in bits 0-5, the
 * attribute in 6-11, Type1 in 12-17, Type2 in 18-23. The tag enums are numbered *in place* — an
 * Attribute is already `n << 6`, a Type1 `n << 12` — so a scoped stat is just `stat | tag`
 * (`scopedStat()`), an action's own element/type/type2 OR together into one word with no shifting
 * (runtime.ts's own `tagWordOf()`), and "does this scope match the action" is that word masked to the
 * tag's own band and compared. 0 in a band means none: unscoped, or an action with no such tag. */

const STAT_BITS = 0x3f;
const ATTRIBUTE_BITS = 0x3f << 6;
const TYPE1_BITS = 0x3f << 12;
export const TYPE2_BITS = 0x3f << 18;
const TAG_BITS = ATTRIBUTE_BITS | TYPE1_BITS | TYPE2_BITS;
if (STAT_COUNT > STAT_BITS + 1) throw new Error("stats.ts: more stats than fit in the six-bit stat field");

export const enum Attribute {
  Aero = 1 << 6,
  Electro = 2 << 6,
  Fusion = 3 << 6,
  Glacio = 4 << 6,
  Spectro = 5 << 6,
  Havoc = 6 << 6,
  Physical = 7 << 6,
}

/** `type`/`cast` share one vocabulary onto two independent fields — they can genuinely disagree
 *  (Jingran's basic stage 3 is `cast: Basic, type: Heavy`). */
export const enum Type1 {
  Basic = 1 << 12,
  Heavy = 2 << 12,
  Skill = 3 << 12,
  Liberation = 4 << 12,
  Intro = 5 << 12,
  Outro = 6 << 12,
  Echo = 7 << 12,
  Status = 8 << 12,
  Break = 9 << 12,
  Rupture = 10 << 12,
  Hack = 12 << 12,
  Utility = 13 << 12,
}

/** A second, independent damage-type tag some hits carry alongside `type`, scoped the same way. */
export const enum Type2 {
  Coordinated = 1 << 18,
  SpectroFrazzle = 2 << 18,
  AeroErosion = 3 << 18,
  FusionBurst = 4 << 18,
  GlacioChafe = 5 << 18,
  ElectroFlare = 6 << 18,
}
/** Any of the three — what a scoped stat, a conditional or an action's own element/type fields hold. */
export type Tag = Attribute | Type1 | Type2;

/** The band a tag sits in — the six bits of a word to compare it against. */
export const tagBand = (tag: Tag): number =>
  (tag & TYPE2_BITS ? TYPE2_BITS : tag & TYPE1_BITS ? TYPE1_BITS : ATTRIBUTE_BITS);

/** Which band a tag falls in: 1 attribute, 2 Type1, 3 Type2 — the order a hover panel lists
 *  scopes in, broadest first (see display.ts's own tagRank). */
export const tagKind = (tag: Tag): 1 | 2 | 3 =>
  (tag & TYPE2_BITS ? 3 : tag & TYPE1_BITS ? 2 : 1);

export const TAG_NAME: Record<Tag, string> = {
  [Attribute.Aero]: "Aero", [Attribute.Electro]: "Electro", [Attribute.Fusion]: "Fusion",
  [Attribute.Glacio]: "Glacio", [Attribute.Spectro]: "Spectro", [Attribute.Havoc]: "Havoc",
  [Attribute.Physical]: "Physical",
  [Type1.Basic]: "Basic", [Type1.Heavy]: "Heavy", [Type1.Skill]: "Skill", [Type1.Liberation]: "Liberation",
  [Type1.Intro]: "Intro", [Type1.Outro]: "Outro", [Type1.Echo]: "Echo", [Type1.Status]: "Status",
  [Type1.Break]: "Tune Break", [Type1.Rupture]: "Tune Rupture",
  [Type1.Hack]: "Tune Hack", [Type1.Utility]: "Utility",
  [Type2.Coordinated]: "Coordinated", [Type2.SpectroFrazzle]: "Spectro Frazzle",
  [Type2.AeroErosion]: "Aero Erosion", [Type2.FusionBurst]: "Fusion Burst",
  [Type2.GlacioChafe]: "Glacio Chafe", [Type2.ElectroFlare]: "Electro Flare",
};

/* ------------------------------------------------------------ scoped stats */
/** Any stat can be scoped to what the action is (Dmg Bonus on Fusion) — resolves against element
 *  and damage type only, never `cast`/`scaling`.
 *
 *  A key is one integer, the stat and the tag in their own bit fields (see the tag vocabulary
 *  above) — so a bare stat *is* its own key, and either half comes back with a mask
 *  (`splitStat`). Nothing to cache, nothing to concatenate. */
export type StatKey = number;
export const scopedStat = (tag: Tag, stat: Stat | EnemyStat): StatKey => stat | tag;

/** A key back into its parts: `scopedStat(Attribute.Fusion, Stat.DmgBonus)` ->
 *  `[Stat.DmgBonus, Attribute.Fusion]`, a bare `Stat.DmgBonus` -> `[Stat.DmgBonus, null]`. */
export const splitStat = (key: StatKey): [Stat | EnemyStat, Tag | null] =>
  [(key & STAT_BITS) as Stat, ((key & TAG_BITS) as Tag) || null];

/** Which of the five weapon categories a resonator wields — decides which weapon files
 *  (src/weapons/) their loadout can actually equip. */
export const enum WeaponType {
  Sword,
  Broadblade,
  Pistols,
  Gauntlets,
  Rectifier,
}

/** How hard a resonator is to own, which is the only thing deciding how much of their resonance
 *  chain a build is assumed to hold (gear.ts's own `baseSequence()`):
 *
 *  - `Limited` — a limited 5-star, banner-only: S0, one copy is the whole build.
 *  - `Standard` — a standard 5-star, permanently available and pulled into over time (Encore,
 *    Jianxin, Verina): S0, same as a limited one — the chain is still a build choice, not owned.
 *  - `Free` — a 4-star or a Rover, handed out freely: S6, the full chain.
 *
 *  For the first two that level is a *baseline*, not a ceiling — with that role's own Sequences box
 *  open, every level from it up to S6 gets a row of its own (`sequenceLevels()`). A `Free`
 *  resonator's chain comes with the character, so theirs is fixed at S6 either way. */
export const enum Tier {
  Limited,
  Standard,
  Free,
}

/** Cast identities with no damage type of their own (a Dodge Counter deals whatever `type` says);
 *  kept out of `Type1` so they can't be reached for `type`/`type2` by mistake. */
export const enum Cast {
  DodgeCounter,
  Basic,
  MidAir,
  Heavy,
  Skill,
  Liberation,
  Intro,
  Outro,
  Echo,
  TuneBreak,
}

export const CAST_NAME: Record<Cast, string> = {
  [Cast.DodgeCounter]: "Dodge Counter", [Cast.Basic]: "Basic", [Cast.MidAir]: "Mid-air", [Cast.Heavy]: "Heavy", [Cast.Skill]: "Skill",
  [Cast.Liberation]: "Liberation", [Cast.Intro]: "Intro", [Cast.Outro]: "Outro", [Cast.Echo]: "Echo",
  [Cast.TuneBreak]: "Tune Break",
};

/** Which branch of the kit a cast comes from (forte circuit vs liberation vs ordinary attacks),
 *  independent of `cast`/`type` — `outro`/`echo` aren't kit branches, so they have no node. */
export const enum Node {
  Normal,
  Skill,
  Forte,
  Liberation,
  Intro,
}

export const NODE_NAME: Record<Node, string> = {
  [Node.Normal]: "Normal", [Node.Skill]: "Skill", [Node.Forte]: "Forte", [Node.Liberation]: "Liberation",
  [Node.Intro]: "Intro",
};

/** Which stat a hit reads its final number from. Fixed bypasses all of them — its own mv is the
 *  damage, unconditionally (see damage.ts's own damageFactors()). */
export const enum Scaling {
  Atk,
  Hp,
  Def,
  Dot,
  Tune,
  Fixed,
}

export const SCALING_NAME: Record<Scaling, string> = {
  [Scaling.Atk]: "ATK", [Scaling.Hp]: "HP", [Scaling.Def]: "DEF", [Scaling.Dot]: "DOT", [Scaling.Tune]: "TUNE",
  [Scaling.Fixed]: "FIXED",
};

/* ------------------------------------------------------------------- metadata */

/** Ratio stats, held in percent units. Everything else is a flat amount or a count. Covers both
 *  `Stat` and `EnemyStat` values — they share one index space, so one set works for either enum.
 *  Tune Break Boost is deliberately absent: it is a count of points, each worth +0.12% total
 *  damage per Interfered stack (tunebreak.ts's own `tuneStrainBonus`), so it reads as a bare
 *  number everywhere. What divides it into a multiplier does so itself (damage.ts's `tbbFactor`). */
export const PERCENT_STATS: Set<Stat | EnemyStat> = new Set<Stat | EnemyStat>([
  Stat.BonusAtk, Stat.BonusHp, Stat.BonusDef, Stat.CritRate, Stat.CritDmg, Stat.Er,
  Stat.OfftuneBuildup, Stat.EnergyRegenMult,
  Stat.AddMv, Stat.MulMv,
  Stat.DmgBonus, Stat.Amp, Stat.TotalDmg,
  Stat.ResIgnore, Stat.DefIgnoreNew, Stat.DefIgnoreOld,
  Stat.HealingBonus, Stat.HealingTaken,
  EnemyStat.ResReduce, EnemyStat.DefReduce,
]);

/** A scoped stat is a ratio exactly when the stat it scopes is. */
export const isPercent = (key: StatKey): boolean => PERCENT_STATS.has(splitStat(key)[0]);

/* ------------------------------------------------------------------- naming */

/** Dmg Bonus scoped to Fusion reads "Fusion Dmg Bonus" — the tag qualifies the stat's own name,
 *  which is already how a person would say it. */
export function statLabel(key: StatKey): string {
  const [stat, tag] = splitStat(key);
  return tag === null ? STAT_NAME[stat] : `${TAG_NAME[tag]} ${STAT_NAME[stat]}`;
}

/* ---------------------------------------------------------------------- counters */
/** Counters persist across actions — each is a real hardcoded field on `Slot`/`State`/`Resonator`,
 *  not a map a kit could add an entry to by typo. */
export const enum Resource {
  // TODO move to enemy
  Offtune, // team-wide running total

  Energy,   // per resonator, running total; ceiling declared on Resonator (unenforced)
  Concerto,

  // generic forte gauges — a resonator assigns its own meaning onto whichever fits its kit
  Forte1,
  Forte2,
  Forte3,
  Forte4,
  Forte5,
}

export const RESOURCE_NAME: Record<Resource, string> = {
  [Resource.Offtune]: "offtune", [Resource.Energy]: "energy", [Resource.Concerto]: "concerto",
  [Resource.Forte1]: "forte1", [Resource.Forte2]: "forte2", [Resource.Forte3]: "forte3",
  [Resource.Forte4]: "forte4", [Resource.Forte5]: "forte5",
};
