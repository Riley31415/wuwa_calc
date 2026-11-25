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

  /** Every ATK%/HP%/DEF%, constant or combat, summed and floored once off Base. */
  BonusAtk,
  BonusHp,
  BonusDef,

  CritRate,
  CritDmg,
  ER,
  TBB,
  OfftuneBuildup,
  /** Scales what an action regens: `base energy x (1 + this/100)`, a hook's flat `addGain()` aside — Camellya's
   *  Vegetative Universe, Yangyang. Percent; 0 means the ordinary x1. */
  HitEnergyMult,
  /** The same for what an action builds of off-tune: `(base off-tune + added) x (1 + this/100)`,
   *  ahead of the Buildup Rate — Suoming's Seal Master stages. Percent; 0 means the ordinary x1. */
  OfftuneMult,

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
  /** The target's own vulnerability — "targets take N% more DMG from X", against TotalDmg's
   *  attacker-side "deals N% more DMG". The two multiply: `(1 + taken) x (1 + total)`. */
  DamageTaken,

  ResIgnore, // doesnt work on dot
  DefIgnoreNew, // use only on the newest resonators
  DefIgnoreOld, // use on resonators phrolova and older

  /** Healing itself is out of scope for this calculator (see the standing rule) — these two
   *  are tracked purely for kit completeness. Nothing reads either; they never reach a column
   *  or a panel. */
  HealingBonus,
  HealingReceived,
}

/** Stats that describe the *enemy* itself — a real debuff on the target that every attacker reads
 *  identically, not a personal modifier for whoever's dealing the hit. `Stat.ResIgnore`/
 *  `DefIgnoreNew`/`DefIgnoreOld` stay in `Stat`: those are the attacker's own penetration, not a
 *  change to the enemy's own stat line. Granted/read through `addEnemyStat()`, never `addStat()`,
 *  so a kit can't reach for the wrong pool by mistake. Numbered on from `Stat`'s last member so
 *  the two share one index space (see the header). */
export const enum EnemyStat {
  ResReduce = Stat.HealingReceived + 1,
  DefReduce,
}

/** How many slots `Stat` and `EnemyStat` take between them — the size of a per-action total array. */
export const STAT_COUNT = EnemyStat.DefReduce + 1;

/** How each stat reads for a person — the report's column sources, the hover panels. */
export const STAT_NAME: Record<Stat | EnemyStat, string> = {
  [Stat.BaseAtk]: "Base ATK", [Stat.BaseHp]: "Base HP", [Stat.BaseDef]: "Base DEF",
  [Stat.FlatAtk]: "Flat ATK", [Stat.FlatHp]: "Flat HP", [Stat.FlatDef]: "Flat DEF",
  [Stat.BonusAtk]: "ATK%", [Stat.BonusHp]: "HP%", [Stat.BonusDef]: "DEF%",
  [Stat.CritRate]: "Crit Rate", [Stat.CritDmg]: "Crit Dmg", [Stat.ER]: "Energy Regen",
  [Stat.TBB]: "Tune Break Boost", [Stat.OfftuneBuildup]: "Offtune Buildup",
  [Stat.HitEnergyMult]: "Hit Energy Multiplier", [Stat.OfftuneMult]: "Offtune Multiplier",
  [Stat.AddMv]: "MV increase", [Stat.MulMv]: "MV multiplier",
  [Stat.DmgBonus]: "Dmg Bonus", [Stat.Amp]: "Amplification", [Stat.TotalDmg]: "Total Damage",
  [Stat.DamageTaken]: "Damage Taken",
  [Stat.ResIgnore]: "Res Ignore", [Stat.DefIgnoreNew]: "Def Ignore (new)", [Stat.DefIgnoreOld]: "Def Ignore (old)",
  [Stat.HealingBonus]: "Healing Bonus", [Stat.HealingReceived]: "Healing Received",
  [EnemyStat.ResReduce]: "Res Reduce", [EnemyStat.DefReduce]: "Def Reduce",
};

/* --- the tag vocabulary: what a conditional, an element field or a type field may say ------ */
/* One 32-bit word holds a stat and all three tags, six bits each: the stat in bits 0-5, the
 * attribute in 6-11, Type in 12-17, Subtype in 18-23. The tag enums are numbered *in place* — an
 * Attribute is already `n << 6`, a Type `n << 12` — so a scoped stat is just `stat | tag`
 * (`scopedStat()`), an action's own element/type/subtype OR together into one word with no shifting
 * (runtime.ts's own `tagWordOf()`), and "does this scope match the action" is that word masked to the
 * tag's own band and compared. 0 in a band means none: unscoped, or an action with no such tag. */

const STAT_BITS = 0x3f;
const ATTRIBUTE_BITS = 0x3f << 6;
const TYPE_BITS = 0x3f << 12;
export const SUBTYPE_BITS = 0x3f << 18;
const TAG_BITS = ATTRIBUTE_BITS | TYPE_BITS | SUBTYPE_BITS;
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
export const enum Type {
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
export const enum Subtype {
  Coordinated = 1 << 18,
  SpectroFrazzle = 2 << 18,
  AeroErosion = 3 << 18,
  FusionBurst = 4 << 18,
  GlacioChafe = 5 << 18,
  ElectroFlare = 6 << 18,
}
/** Any of the three — what a scoped stat, a conditional or an action's own element/type fields hold. */
export type Tag = Attribute | Type | Subtype;

/** The band a tag sits in — the six bits of a word to compare it against. */
export const tagBand = (tag: Tag): number =>
  (tag & SUBTYPE_BITS ? SUBTYPE_BITS : tag & TYPE_BITS ? TYPE_BITS : ATTRIBUTE_BITS);

/** Which band a tag falls in: 1 attribute, 2 Type, 3 Subtype — the order a hover panel lists
 *  scopes in, broadest first (see display.ts's own tagRank). */
export const tagKind = (tag: Tag): 1 | 2 | 3 =>
  (tag & SUBTYPE_BITS ? 3 : tag & TYPE_BITS ? 2 : 1);

export const TAG_NAME: Record<Tag, string> = {
  [Attribute.Aero]: "Aero", [Attribute.Electro]: "Electro", [Attribute.Fusion]: "Fusion",
  [Attribute.Glacio]: "Glacio", [Attribute.Spectro]: "Spectro", [Attribute.Havoc]: "Havoc",
  [Attribute.Physical]: "Physical",
  [Type.Basic]: "Basic", [Type.Heavy]: "Heavy", [Type.Skill]: "Skill", [Type.Liberation]: "Liberation",
  [Type.Intro]: "Intro", [Type.Outro]: "Outro", [Type.Echo]: "Echo", [Type.Status]: "Status",
  [Type.Break]: "Tune Break", [Type.Rupture]: "Tune Rupture",
  [Type.Hack]: "Tune Hack", [Type.Utility]: "Utility",
  [Subtype.Coordinated]: "Coordinated", [Subtype.SpectroFrazzle]: "Spectro Frazzle",
  [Subtype.AeroErosion]: "Aero Erosion", [Subtype.FusionBurst]: "Fusion Burst",
  [Subtype.GlacioChafe]: "Glacio Chafe", [Subtype.ElectroFlare]: "Electro Flare",
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

// rarity of resonators and weapons
export const enum Rarity {
  // limited characters requires pulls, starts at s0
  Limited,
  // free four star and rover who are easy to get s6
  FreeS6,
  // free standard 5* that requires s2+ for normal use: jianxin
  FreeS2,
  /** A free standard 5-star (Encore, Lingyang): an account starts with them, costed from S0. */
  FreeS0,
}

/** Who a `Grant` puts its buff on: the wielder (the default), the whole team, the target, or
 *  whoever intros next (an outro handoff, `queueOutro`). */
export const enum BuffTarget { Self, Team, Enemy, Next }

/** Input timings, in frames. A cut press runs on past its cut: a plain (dodge, jump, on-hit) cancel for
 *  `cancel`, an insta cut or insta swap for `insta`, a swap cancel for `swap` — and a plain SWAP written after a
 *  press played out hands over `swap` later too. A hold cancel lets go the moment the next press can come out,
 *  never inside its `hold` minimum; a mash cancel's input lands `mash` after that moment, and a mash swap swaps
 *  out `mash` after its no-swap frames end. */
export interface Delays { cancel: number; insta: number; hold: number; mash: number }
let BASE_DELAYS: Delays = { cancel: 10, insta: 6, mash: 6, hold: 0 };
/** The set in effect — the defaults, or a rotation's own while its member presses (`useDelays()`) — one
 *  object per set, so a cache made under one can tell it no longer stands; and each of it by name. */
export let DELAYS: Delays = BASE_DELAYS;
export let CANCEL_DELAY = BASE_DELAYS.cancel, INSTA_DELAY = BASE_DELAYS.insta;
export let HOLD_MINIMUM = BASE_DELAYS.hold, MASH_DELAY = BASE_DELAYS.mash;
/** How long ahead a held input may be pressed and still come out: unused for now. */
export const HOLD_BUFFER = 17;

/** The defaults with `d` laid over them, a key left undefined keeping its default: a rotation's own set
 *  (`Rotation.withDelays()`). */
export const delaysWith = (d: Partial<Delays>): Delays =>
  ({ ...BASE_DELAYS, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) });
/** A member's delays: their rotation's own, else the defaults. */
export const delaysOf = (d: Delays | null): Delays => d ?? BASE_DELAYS;
/** Replace the defaults for a test run (`setDelays({ cancel: 1, insta: 1 })`). Call it before the kits load:
 *  an insta or on-hit cut keeps the bullets committed by its delay when its rotation is built. */
export function setDelays(d: Partial<Delays>): void {
  BASE_DELAYS = delaysWith(d);
  useDelays(null);
}
/** Put `d` in effect, or the defaults for null: the engine does as each member presses, by their rotation's. */
export function useDelays(d: Delays | null): void {
  const at = delaysOf(d);
  if (at === DELAYS) return;
  DELAYS = at;
  ({ cancel: CANCEL_DELAY, insta: INSTA_DELAY, hold: HOLD_MINIMUM, mash: MASH_DELAY } = at);
}
/** `f` with `d` in effect, the set before it put back after: what reads a press's cut after its run (the
 *  page's frames) or ahead of it (a visit planned at a handoff). */
export function atDelays<T>(d: Delays | null, f: () => T): T {
  const was = DELAYS;
  useDelays(d);
  try {
    return f();
  } finally {
    useDelays(was);
  }
}

/** Frames a resonator stays in the world past the end of their last press (OFF_FIELD ones aside)
 *  with nothing pressed since: then they despawn, their position gone. */
export const DESPAWN_TIME = 18;

/** Where a resonator stands: what an action's `valid` may ask of its caster (`grounded()`/`midair()`)
 *  and its `endPosition` leaves them in. A despawned resonator has none (null). */
export const enum Position { Grounded, Midair }
export const POSITION_NAME: Record<Position, string> = { [Position.Grounded]: "GROUNDED", [Position.Midair]: "MIDAIR" };

/** The units every number of these is held in, whole: energy and concerto in hundredths of a point,
 *  a motion value in hundredths of a percent (10000 a 1x multiplier), off-tune in ten-thousandths.
 *  A forte gauge's is its Resonator's own `forteScale`. */
export const ENERGY_UNIT = 100, CONCERTO_UNIT = 100, MV_UNIT = 100;
/** A full Concerto bar. */
export const FULL_CONCERTO = 100 * CONCERTO_UNIT;
/** What a stat's value is divided by to read in points (or percent): AddMv, held in MV's own units.
 *  1 for every other. */
export const statDisplayScale = (stat: Stat | EnemyStat): number => (stat === Stat.AddMv ? MV_UNIT : 1);

/** An action's one tag — the one its row carries, and what `cancelCost()` charges. Whether its
 *  owner is on field is the engine's (`State.onField`), not the tag's: `OffField` is a press beside
 *  the fight (a summon, a coordinated hit), which no chain or position check reads. */
export enum ActionTag {
  Default = "",
  OffField = "off field",

  MashCancel = "mash cancel", // the next press, not a held one, mashed in: out the moment it can be cast
  MashSwap = "mash swap", // swapped out of MASH_DELAY after its no-swap frames end

  HoldCancel = "hold cancel", // the next press, a held one, held through it: out the moment it can be cast

  Cancel = "cancel",
  DodgeCancel = "dodge cancel",
  JumpCancel = "jump cancel",
  SwapCancel = "swap cancel", // swapped out of at its last commit, never inside its no-swap frames

  InstaCancel = "instant cancel",
  InstaDodge = "instant dodge",
  InstaJump = "instant jump",
  InstaSwap = "instant swap",

  HitCancel = "cancel on hit",
  DodgeOnHit = "dodge on hit",
  JumpOnHit = "jump on hit",

  TimedCancel = "timed cancel", // the next press input at a written frame, no delay after it
}

/** Cast identities with no damage type of their own (a Dodge Counter deals whatever `type` says);
 *  kept out of `Type` so they can't be reached for `type`/`subtype` by mistake. */
export const enum Cast {
  DodgeCounter,
  Basic,
  Heavy,
  Skill,
  Liberation,
  Intro,
  Outro,
  Echo,
  TuneBreak,
  Dodge,
  Jump,
  None, // a field's hit, a queued follow-up, a tick — nobody's cast
}

/** What leads to a press (`ActionDef.input`): a tap or a hold of Basic, Skill or Liberation, one of the rest,
 *  `SwapIn` — arriving with no Intro — or `None`, nobody's press (a field's hit, a queued follow-up, a tick).
 *  A hold is a held input (`Action.heldInput`). */
export const enum Input {
  Basic,
  BasicHold,
  Skill,
  SkillHold,
  Liberation,
  LiberationHold,
  Echo,
  Dodge,
  TuneBreak,
  Jump,
  Intro,
  Outro,
  SwapIn,
  None,
}
export const INPUT_NAME: Record<Input, string> = {
  [Input.Basic]: "Basic", [Input.BasicHold]: "Basic (Hold)", [Input.Skill]: "Skill", [Input.SkillHold]: "Skill (Hold)",
  [Input.Liberation]: "Liberation", [Input.LiberationHold]: "Liberation (Hold)", [Input.Echo]: "Echo", [Input.Dodge]: "Dodge",
  [Input.TuneBreak]: "Tune Break", [Input.Jump]: "Jump", [Input.Intro]: "Intro", [Input.Outro]: "Outro", [Input.SwapIn]: "Swap In",
  [Input.None]: "None",
};
/** Every input a press can be made on, in enum order (`None` aside). */
export const INPUTS: readonly Input[] = [Input.Basic, Input.BasicHold, Input.Skill, Input.SkillHold, Input.Liberation, Input.LiberationHold,
  Input.Echo, Input.Dodge, Input.TuneBreak, Input.Jump, Input.Intro, Input.Outro, Input.SwapIn];
/** The held inputs: what a hold cancel holds into and a mash cancel may never go into. */
export const isHeldInput = (input: Input): boolean =>
  input === Input.BasicHold || input === Input.SkillHold || input === Input.LiberationHold;

export const CAST_NAME: Record<Cast, string> = {
  [Cast.DodgeCounter]: "Dodge Counter", [Cast.Basic]: "Basic", [Cast.Heavy]: "Heavy", [Cast.Skill]: "Skill",
  [Cast.Liberation]: "Liberation", [Cast.Intro]: "Intro", [Cast.Outro]: "Outro", [Cast.Echo]: "Echo",
  [Cast.TuneBreak]: "Tune Break", [Cast.Dodge]: "Dodge", [Cast.Jump]: "Jump",
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
 *  damage per Interfered stack (tunebreak.ts's own Tune Strain - Interfered payout), so it reads as a bare
 *  number everywhere. What divides it into a multiplier does so itself (damage.ts's `tbbFactor`). */
export const PERCENT_STATS: Set<Stat | EnemyStat> = new Set<Stat | EnemyStat>([
  Stat.BonusAtk, Stat.BonusHp, Stat.BonusDef, Stat.CritRate, Stat.CritDmg, Stat.ER,
  Stat.OfftuneBuildup, Stat.HitEnergyMult, Stat.OfftuneMult,
  Stat.AddMv, Stat.MulMv,
  Stat.DmgBonus, Stat.Amp, Stat.TotalDmg, Stat.DamageTaken,
  Stat.ResIgnore, Stat.DefIgnoreNew, Stat.DefIgnoreOld,
  Stat.HealingBonus, Stat.HealingReceived,
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

/** Of a stop running `len` frames from animation frame `from`, the frames inside the press's own
 *  `frames` and those it banks past them — none of either where the press is let go (`played`
 *  frames in all, its cut's delay included) before the stop begins. */
export function splitStop(from: number, len: number, frames: number, played: number): { own: number; banked: number } {
  if (!len || (from > 0 && from >= played)) return { own: 0, banked: 0 };
  const own = Math.max(0, Math.min(from + len, frames) - from);
  return { own, banked: len - own };
}
