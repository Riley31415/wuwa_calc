/**
 * Stat vocabulary. Ratio stats are percent units (36 means 36%), flat stats are flat.
 * An action resolves the bonuses that match its own element and type, so "12% fusion damage"
 * is its own stat rather than "12% damage, conditional on fusion".
 *
 * Each group below is a string enum — the value *is* the wire format (what `add()`/`scopedStat`
 * key stats by, what a snapshot serializes) — and every consumer imports the enum itself
 * (`Stat.CritRate`, `Element.Fusion`, ...) rather than a flat per-member alias.
 */

/* ------------------------------------------------------------------ flat stats */

/** Every stat name — flat bases, derived totals, ratios, motion-value modifiers, damage/amp,
 *  resistance/defence shred. One enum: they all share the same key space (`add(value, stat)`,
 *  `scopedStat(tag, stat)`) and nothing distinguishes flat from ratio except membership in
 *  `PERCENT_STATS` below.
 *
 *  Each value is also how the stat reads for a person, not just the engine's own wire format —
 *  `statLabel()` only has a scoping tag left to spell out, not the stat's own name. */
export enum Stat {
  BaseAtk = "Base ATK",
  BaseHp = "Base HP",
  BaseDef = "Base DEF",

  /** Additive flat amounts, applied on top of base × (1 + bonus). */
  FlatAtk = "Flat ATK",
  FlatHp = "Flat HP",
  FlatDef = "Flat DEF",

  // TODO delete
  BonusAtk = "ATK%",
  BonusHp = "HP%",
  BonusDef = "DEF%",

  CritRate = "Crit Rate",
  CritDmg = "Crit Dmg",
  Er = "Energy Regen",
  Tbb = "Tune Break Boost",
  OfftuneBuildup = "Off-Tune Buildup Rate",

  /**
   * Motion value: `(base mv + AddMv) x (1 + MulMv) x (1 + SpecialMv)`.
   * AddMv lands inside the parentheses, in the action's own units — no re-expressing a flat
   * motion-value add as a multiplier. MulMv and SpecialMv are independent multipliers.
   */
  AddMv = "additional MV",
  MulMv = "MV multiplier",
  SpecialMv = "special MV", // TODO remove

  /*
   * Shields are not a stat. An action says how many it grants (`shields` field); a buff that
   * cares reads it back off the action. Electro Flare (`flare`) is the same shape.
   */

  DmgBonus = "Dmg Bonus",
  Amp = "Amplification",
  SpecialAmp = "Special Amp", // amp that works on tune and dot
  // TODO just make it so only type2 amps work on dot, and none on tune
  DmgDealt = "Dmg Dealt",

  ResIgnore = "Res Ignore", // doesnt work on dot
  ResShred = "Res Shred", // TODO move to enemy stat
  DefIgnore = "Def Ignore", // doesnt work on dot
  DefShred = "Def Shred",   // doesnt work on dot
  DefReduce = "Def Reduce", // TODO move to on enemy stat

  /** Healing itself is out of scope for this calculator (see the standing rule) — these two
   *  are tracked purely for kit completeness. Nothing reads either; they never reach a column
   *  or a panel. */
  HealingBonus = "Healing Bonus",
  HealingTaken = "Healing Taken",
}

/* ------------------------------------------------------------ scoped stats */
/**
 * Any stat can be scoped to what the action is: `Dmg Bonus:fusion`, `Amplification:heavy`, etc.
 * — one mechanism (`add(value, tag, stat)`) rather than a constant per combination. Resolves
 * against **element** and **damage type** only; `cast` and `scaling` don't participate.
 */
export const scopedStat = (tag: string, stat: string): string => `${stat}:${tag}`;

/* --- the tag vocabulary: what a conditional, an element field or a type field may say ------ */

export enum Element {
  Aero = "aero",
  Electro = "electro",
  Fusion = "fusion",
  Glacio = "glacio",
  Spectro = "spectro",
  Havoc = "havoc",
  Physical = "physical",
}

// todo rename ELEMENTS to attributes across the project
export const ELEMENTS: Element[] = [
  Element.Aero, Element.Electro, Element.Fusion, Element.Glacio,
  Element.Spectro, Element.Havoc, Element.Physical,
];

/**
 * `type`/`cast` share one vocabulary — a damage type and a button press draw from the same set
 * of "kinds of thing", just onto two independent fields (see `TYPES`/`CASTS` below, which each
 * only use the subset that's actually legal there). Not matched by a conditional: Jingran's
 * liberation is `cast: Liberation` but `type: Heavy`. The two axes genuinely disagree — Jingran's
 * basic stage 3 is `cast: Basic, type: Heavy`; Iuno's Moonbow basics are `cast: Basic, type:
 * Liberation`.
 */
export enum DamageType {
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
  Hack = "Tune Hack",
}

/** Cast identities that are never a damage type of their own — a Dodge Counter always deals
 *  whatever damage type its own hit lists under `type`; `cast` is the only field this ever
 *  appears on. Kept out of `DamageType` so it can't be reached for `type`/`type2` by mistake. */
export enum Cast {
  DodgeCounter = "dodgeCounter",
  Basic = "Basic",
  Heavy = "Heavy",
  Skill = "Skill",
  Liberation = "liberation",
  Intro = "Intro",
  Outro = "Outro",
  Echo = "Echo",
  TuneBreak = "Tune Break",
  Coordinated = "Coordinated"
}

export const TYPES: DamageType[] = [
  DamageType.Basic, DamageType.Heavy, DamageType.Skill, DamageType.Liberation,
  DamageType.Intro, DamageType.Outro, DamageType.Echo, 
  DamageType.Status, 
  DamageType.Break, DamageType.Rupture, DamageType.Hack,
];
export const CASTS: Array<DamageType | Cast> = [
  Cast.Basic, Cast.Heavy, Cast.Skill, Cast.Liberation,
  Cast.Intro, Cast.Outro, Cast.Echo, 
  Cast.TuneBreak,
  Cast.DodgeCounter, 
  Cast.Coordinated
];

/** `type2` — a second, independent damage-type tag some hits carry alongside `type` (e.g. a
 *  hit that's both Heavy Attack DMG and Coordinated Attack DMG). Scoped the same way `type` is. */
// TODO rename to SpecialDamageType
export enum Type2 {
  Coordinated = "Coordinated",
  Frazzle = "Spectro Frazzle",
  Erosion = "Aero Erosion",
  Burst = "Fusion Burst",
  Chafe = "Glacio Chafe",
  Flare = "Electro Flare",
}
export const TYPE2S: Type2[] = [
  Type2.Coordinated,
  Type2.Frazzle, Type2.Flare, Type2.Erosion, Type2.Burst, Type2.Chafe, 
];

/**
 * `node` — which branch of the kit a cast comes from, vs `cast` (button) or `type` (damage).
 * For attributing damage (forte circuit vs liberation vs ordinary attacks). Only five —
 * `outro`/`echo` aren't kit branches, so those casts simply have no node. Its own enum: Skill/
 * Liberation/Intro share a string value with the matching `DamageType` member, but `node` is a
 * genuinely independent axis (see the file's own note above), not the same vocabulary reused.
 */
export enum Node {
  Normal = "Normal",
  Skill = "Skill",
  Forte = "Forte",
  Liberation = "Liberation",
  Intro = "Intro",
}
export const NODES: Node[] = [Node.Normal, Node.Skill, Node.Forte, Node.Liberation, Node.Intro];

/** `scaling` — which stat a hit reads its final number from. */
export enum Scaling {
  Atk = "ATK",
  Hp = "HP",
  Def = "DEF",
  Dot = "DOT",
  Tune = "TUNE",
}
export const SCALINGS: Scaling[] = [
  Scaling.Atk, Scaling.Hp, Scaling.Def, Scaling.Dot, Scaling.Tune,
];

/** Split a scoped key back into its parts. `Dmg Bonus:fusion` -> `["Dmg Bonus", "fusion"]`. */
export function splitStat(stat: string): [string, string | null] {
  const i = stat.indexOf(":");
  return i === -1 ? [stat, null] : [stat.slice(0, i), stat.slice(i + 1)];
}

/** What a conditional may name: the action's element or either of its damage types. */
export const TAGS_MATCHED: string[] = ["element", "type", "type2"];

/* ------------------------------------------------------------------- metadata */

/** Ratio stats, held in percent units. Everything else is a flat amount or a count. */
export const PERCENT_STATS: Set<string> = new Set([
  Stat.BonusAtk, Stat.BonusHp, Stat.BonusDef, Stat.CritRate, Stat.CritDmg, Stat.Er, Stat.Tbb,
  Stat.AddMv, Stat.MulMv, Stat.SpecialMv,
  Stat.DmgBonus, Stat.Amp, Stat.SpecialAmp, Stat.DmgDealt,
  Stat.ResIgnore, Stat.ResShred, Stat.DefIgnore, Stat.DefShred, Stat.DefReduce,
  Stat.HealingBonus, Stat.HealingTaken,
]);

/** A scoped stat is a ratio exactly when the stat it scopes is. */
export const isPercent = (stat: string): boolean => PERCENT_STATS.has(splitStat(stat)[0]);

/* ------------------------------------------------------------------- naming */

/** `aero` -> `Aero`, so a scoped stat can be spelled out from its tag alone. */
// TODO remove this just make the string capitalized by default
const titled = (tag: string): string => tag.charAt(0).toUpperCase() + tag.slice(1);

/** `Dmg Bonus:fusion` reads "Fusion Dmg Bonus" — the tag qualifies the stat's own name, which
 *  is already how a person would say it (see `Stat` above), so there's no separate name table
 *  to look it up in. */
export function statLabel(stat: string): string {
  const [base, tag] = splitStat(stat);
  return tag ? `${titled(tag)} ${base}` : base;
}

/* ---------------------------------------------------------------------- counters */
/**
 * Counters persist across actions rather than being rebuilt each time. Each is a real,
 * hardcoded field on `Slot` (energy, concerto) or `State` (off-tune), or on `Resonator`
 * (forte1-5) — not a map a kit could add an entry to by typo. `counter()`/`setCounter()`
 * reject anything else.
 */
export enum Resource {
  /** Off-tune is a property of the fight, not of a resonator: the whole team fills one bar. */
  // TODO move to enemy
  Offtune = "offtune", // team-wide running total

  Energy = "energy",   // per resonator, running total; ceiling declared on Resonator (unenforced)
  Concerto = "concerto",

  /** Generic forte gauges — a resonator assigns its own meaning onto whichever fits its kit.
   *  Held on `Resonator`, not `Slot` — a fresh instance per fight, so nothing leaks between
   *  runs. */
  Forte1 = "forte1",
  Forte2 = "forte2",
  Forte3 = "forte3",
  Forte4 = "forte4",
  Forte5 = "forte5",
}

export const SLOT_RESOURCES: Resource[] = [
  Resource.Energy, Resource.Concerto,
  Resource.Forte1, Resource.Forte2, Resource.Forte3, Resource.Forte4, Resource.Forte5,
];
export const TEAM_RESOURCES: Resource[] = [Resource.Offtune];
export const ACTION_RESOURCES: Resource[] = [...SLOT_RESOURCES, ...TEAM_RESOURCES];
