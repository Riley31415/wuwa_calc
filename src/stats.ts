/** Stat vocabulary. Ratio stats are percent units (36 means 36%), flat stats are flat. Each group
 *  is a string enum — the value is both the wire format and how it reads for a person. */

/* ------------------------------------------------------------------ flat stats */

/** Every stat name, one shared key space (`add(value, stat)`/`scopedStat(tag, stat)`) — flat vs
 *  ratio is decided only by membership in `PERCENT_STATS` below. */
export enum Stat {
  BaseAtk = "Base ATK",
  BaseHp = "Base HP",
  BaseDef = "Base DEF",

  FlatAtk = "Flat ATK",
  FlatHp = "Flat HP",
  FlatDef = "Flat DEF",

  BonusAtk = "ATK%",
  BonusHp = "HP%",
  BonusDef = "DEF%",

  CritRate = "Crit Rate",
  CritDmg = "Crit Dmg",
  Er = "Energy Regen",
  Tbb = "Tune Break Boost",
  OfftuneBuildup = "Off-Tune Buildup Rate",

  /** Motion value: `(base mv + AddMv) x (1 + MulMv)` — AddMv is inside the parens, MulMv independent. */
  AddMv = "MV increase",
  MulMv = "MV multiplier",

  /*
   * Shields are not a stat. A kit puts up the shield marker (statuses.ts's SHIELD) from its own
   * updateDebuffs(); a buff that cares reads `applied(SHIELD)` the same action. The elemental
   * Negative Statuses (Electro Flare, ...) are the same shape, as do-nothing enemy debuffs.
   */
  DmgBonus = "Dmg Bonus",
  Amp = "Amplification",

  TotalDmg = "Total Damage",

  ResIgnore = "Res Ignore", // doesnt work on dot
  DefIgnoreNew = "Def Ignore (new)", // use only on the newest resonators
  DefIgnoreOld = "Def Ignore (old)", // use on resonators phrolova and older

  /** Healing itself is out of scope for this calculator (see the standing rule) — these two
   *  are tracked purely for kit completeness. Nothing reads either; they never reach a column
   *  or a panel. */
  HealingBonus = "Healing Bonus",
  HealingTaken = "Healing Recieved",

  /** Resource deltas a buff contributes on top of an action's own declared energy/concerto/
   *  offtune/forte — banked into the running counters by evaluate(), not read back by a formula. */
  AddEnergy = "AddEnergy",
  AddConcerto = "AddConcerto",
  AddOfftune = "AddOfftune",
  /** Off-tune a kit puts straight onto the bar rather than building (Denia's half-bar surge) —
   *  unlike AddOfftune, Off-Tune Buildup Rate doesn't scale it. */
  FillOfftune = "FillOfftune",
  AddForte1 = "AddForte1",
  AddForte2 = "AddForte2",
  AddForte3 = "AddForte3",
  AddForte4 = "AddForte4",
  AddForte5 = "AddForte5",
}

/** Stats that describe the *enemy* itself — a real debuff on the target that every attacker reads
 *  identically, not a personal modifier for whoever's dealing the hit. `Stat.ResIgnore`/
 *  `DefIgnoreNew`/`DefIgnoreOld` stay in `Stat`: those are the attacker's own penetration, not a
 *  change to the enemy's own stat line. Granted/read through `addEnemyStat()`, never `addStat()`,
 *  so a kit can't reach for the wrong pool by mistake. */
export enum EnemyStat {
  ResShred = "Res Reduce",
  DefReduce = "Def Reduce",
}

/* ------------------------------------------------------------ scoped stats */
/** Any stat can be scoped to what the action is (`Dmg Bonus:fusion`) — resolves against element
 *  and damage type only, never `cast`/`scaling`.
 *
 *  Memoized through a nested Map rather than rebuilt per call: the tag and stat vocabularies are
 *  both small fixed enums, so the whole product is a few hundred strings that get built once and
 *  then handed back by reference. A flat `Map` keyed on `tag + "|" + stat` would defeat the point
 *  — building that key is the same string concatenation this is avoiding — hence two levels. */
const SCOPED_CACHE = new Map<string, Map<string, string>>();
export const scopedStat = (tag: string, stat: string): string => {
  let byStat = SCOPED_CACHE.get(tag);
  if (byStat === undefined) { byStat = new Map(); SCOPED_CACHE.set(tag, byStat); }
  let key = byStat.get(stat);
  if (key === undefined) { key = `${stat}:${tag}`; byStat.set(stat, key); }
  return key;
};

/* --- the tag vocabulary: what a conditional, an element field or a type field may say ------ */

export enum Attribute {
  Aero = "Aero",
  Electro = "Electro",
  Fusion = "Fusion",
  Glacio = "Glacio",
  Spectro = "Spectro",
  Havoc = "Havoc",
  Physical = "Physical",
}

export const ATTRIBUTES: Attribute[] = [
  Attribute.Aero, Attribute.Electro, Attribute.Fusion, Attribute.Glacio,
  Attribute.Spectro, Attribute.Havoc, Attribute.Physical,
];

/** Which of the five weapon categories a resonator wields — decides which weapon files
 *  (src/weapons/) their loadout can actually equip. */
export enum WeaponType {
  Sword = "Sword",
  Broadblade = "Broadblade",
  Pistols = "Pistols",
  Gauntlets = "Gauntlets",
  Rectifier = "Rectifier",
}

/** `type`/`cast` share one vocabulary onto two independent fields — they can genuinely disagree
 *  (Jingran's basic stage 3 is `cast: Basic, type: Heavy`). */
export enum Type1 {
  Basic = "Basic",
  Heavy = "Heavy",
  Skill = "Skill",
  Liberation = "Liberation",
  Intro = "Intro",
  Outro = "Outro",
  Echo = "Echo",
  Status = "Negative Status",
  Break = "Tune Break",
  Rupture = "Tune Rupture",
  Strain = "Tune Strain",
  Hack = "Tune Hack",
  Utility = "Utility",
}

export const TYPE1S: Type1[] = [
  Type1.Basic, Type1.Heavy, Type1.Skill, Type1.Liberation,
  Type1.Intro, Type1.Outro, Type1.Echo,
  Type1.Status,
  Type1.Break, Type1.Rupture, Type1.Strain, Type1.Hack, Type1.Utility,
];

/** A second, independent damage-type tag some hits carry alongside `type`, scoped the same way. */
export enum Type2 {
  Coordinated = "Coordinated",
  SpectroFrazzle = "Spectro Frazzle",
  AeroErosion = "Aero Erosion",
  FusionBurst = "Fusion Burst",
  GlacioChafe = "Glacio Chafe",
  ElectroFlare = "Electro Flare",
}
export const TYPE2S: Type2[] = [
  Type2.Coordinated,
  Type2.SpectroFrazzle, Type2.ElectroFlare, Type2.AeroErosion, Type2.FusionBurst, Type2.GlacioChafe, 
];

/** Cast identities with no damage type of their own (a Dodge Counter deals whatever `type` says);
 *  kept out of `Type1` so they can't be reached for `type`/`type2` by mistake. */
export enum Cast {
  DodgeCounter = "Dodge Counter",
  Basic = "Basic",
  Heavy = "Heavy",
  Skill = "Skill",
  Liberation = "Liberation",
  Intro = "Intro",
  Outro = "Outro",
  Echo = "Echo",
  TuneBreak = "Tune Break"
}

export const CASTS: Array<Type1 | Cast> = [
  Cast.Basic, Cast.Heavy, Cast.Skill, Cast.Liberation,
  Cast.Intro, Cast.Outro, Cast.Echo, 
  Cast.TuneBreak,
  Cast.DodgeCounter
];

/** Which branch of the kit a cast comes from (forte circuit vs liberation vs ordinary attacks),
 *  independent of `cast`/`type` — `outro`/`echo` aren't kit branches, so they have no node. */
export enum Node {
  Normal = "Normal",
  Skill = "Skill",
  Forte = "Forte",
  Liberation = "Liberation",
  Intro = "Intro",
}

/** Which stat a hit reads its final number from. Fixed bypasses all of them — its own mv is the
 *  damage, unconditionally (see damage.ts's own damageFactors()). */
export enum Scaling {
  Atk = "ATK",
  Hp = "HP",
  Def = "DEF",
  Dot = "DOT",
  Tune = "TUNE",
  Fixed = "FIXED",
}

/** Split a scoped key back into its parts. `Dmg Bonus:fusion` -> `["Dmg Bonus", "fusion"]`. */
export function splitStat(stat: string): [string, string | null] {
  const i = stat.indexOf(":");
  return i === -1 ? [stat, null] : [stat.slice(0, i), stat.slice(i + 1)];
}

/** What a conditional may name: the action's element or either of its damage types. */
export const TAGS_MATCHED: string[] = ["element", "type", "type2"];

/* ------------------------------------------------------------------- metadata */

/** Ratio stats, held in percent units. Everything else is a flat amount or a count. Covers both
 *  `Stat` and `EnemyStat` values — a scoped key's own string is all `isPercent()` ever looks at,
 *  so one shared set works for either enum. */
export const PERCENT_STATS: Set<string> = new Set([
  Stat.BonusAtk, Stat.BonusHp, Stat.BonusDef, Stat.CritRate, Stat.CritDmg, Stat.Er, Stat.Tbb,
  Stat.AddMv, Stat.MulMv,
  Stat.DmgBonus, Stat.Amp, Stat.TotalDmg,
  Stat.ResIgnore, Stat.DefIgnoreNew, Stat.DefIgnoreOld,
  Stat.HealingBonus, Stat.HealingTaken,
  EnemyStat.ResShred, EnemyStat.DefReduce,
]);

/** A scoped stat is a ratio exactly when the stat it scopes is. */
export const isPercent = (stat: string): boolean => PERCENT_STATS.has(splitStat(stat)[0]);

/* ------------------------------------------------------------------- naming */

/** `Dmg Bonus:Fusion` reads "Fusion Dmg Bonus" — the tag qualifies the stat's own name, which is
 *  already how a person would say it (see `Stat` above), so there's no separate name table to
 *  look it up in. Every tag reaching here is already an `Attribute`/`Type1`/`Type2` enum value
 *  (already Title Case), so no re-capitalizing step is needed. */
export function statLabel(stat: string): string {
  const [base, tag] = splitStat(stat);
  return tag ? `${tag} ${base}` : base;
}

/* ---------------------------------------------------------------------- counters */
/** Counters persist across actions — each is a real hardcoded field on `Slot`/`State`/`Resonator`,
 *  not a map a kit could add an entry to by typo. */
export enum Resource {
  // TODO move to enemy
  Offtune = "offtune", // team-wide running total

  Energy = "energy",   // per resonator, running total; ceiling declared on Resonator (unenforced)
  Concerto = "concerto",

  // generic forte gauges — a resonator assigns its own meaning onto whichever fits its kit
  Forte1 = "forte1",
  Forte2 = "forte2",
  Forte3 = "forte3",
  Forte4 = "forte4",
  Forte5 = "forte5",
}
