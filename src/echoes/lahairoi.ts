/** Mainslot echoes and sonatas from Lahairoi (versions 2.8-3.4), plus the 3.5-3.6 pieces that
 *  have no region file of their own yet (Hyvatia, Reactor Husk, Spacetrek Explorer, Hiyuki's own
 *  Voidborne Construct/Glommoth/Wishes of Quiet Snowfall, the sonatas in the middle, and the
 *  Cyberpunk collab echo at the bottom) — split them out when that region gets a name. Buling and
 *  Lucilla, also Lahairoi-era, own no mainslot echo/sonata of their own — Lucilla reuses
 *  Bell-Borne Geochelone/Moonlit Clouds from jinzhou.ts and Dream of the Lost from septimont.ts. */
import { Stat, Attribute, Type, Cast, Scaling, BuffTarget, Position } from "../engine/stats.js";
import { Buff, Sonata, Sonata2pc, Sonata1pc, Mainslot, handoff } from "../engine/gear.js";
import {
  isType, addStat, applyCurrent, casting, getStat, queueOutro, revokeCurrent, frozenStacks, isHeld, currentMember, wears,
  extendCurrent, stacksOf,
  onType, onCast, onApplied, onInflict, both,
} from "../engine/context.js";
import { Action, Cooldown } from "../engine/rotation.js";
import { FUSION_BURST, HEALS, GLACIO_CHAFE, gainShield } from "../shared/status.js";
import { TUNE_HACK_SHIFTING, TUNE_RUPTURE_SHIFTING, TUNE_STRAIN_SHIFTING } from "../shared/tunebreak.js";
import { SummonEcho, TransformEcho } from "./echo.js";

/* ------------------------------------------------------------------------------ Sigrika, 3.2 */

/** Nameless Explorer, Sigrika's own mainslot echo — flat Aero/Echo Skill DMG Bonus for whoever
 *  wears it, no trigger. */
export const NAMELESS_EXPLORER = new Mainslot({
  id: 6000192,
  name: "Nameless Explorer",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Aero], [Stat.DmgBonus, 20, Type.Echo]],
});
export const ACTION_NAMELESS_EXPLORER = new SummonEcho("Echo - Nameless Explorer", {
  mainslot: NAMELESS_EXPLORER, cooldown: 60 * 20,
  element: Attribute.Aero, scaling: Scaling.Atk, type: Type.Echo, bullets: [{ hitFrame: 26, commitFrame: 0, mv: 27360, energy: 380 }],
});

/** Sound of True Name, Sigrika's own sonata (paired directly with Nameless Explorer above).
 *  2pc: +10% Aero DMG Bonus flat. 5pc: dealing Echo Skill DMG grants +20% Echo Skill Crit Rate
 *  and +15% Aero DMG Bonus for 5s. */
export const SOUND_OF_TRUE_NAME_2PC = new Sonata2pc({ id: 29, name: "Sound of True Name 2pc", echoes: () => [NAMELESS_EXPLORER, SPACETREK_EXPLORER], stats: [[Stat.DmgBonus, 10, Attribute.Aero]] });
export const SOUND_OF_TRUE_NAME_BUFF = new Buff({
  name: "Sound of True Name 5pc",
  duration: 60 * 5,
  stats: [[Stat.CritRate, 20, Type.Echo], [Stat.DmgBonus, 15, Attribute.Aero]],
});
export const SOUND_OF_TRUE_NAME_5PC = new Sonata({
  id: 29,
  name: "Sound of True Name 5pc",
  sonata2pc: SOUND_OF_TRUE_NAME_2PC,
  grants: [{ on: onType(Type.Echo), buff: SOUND_OF_TRUE_NAME_BUFF, onHit: true }],
});

/* -------------------------------------------------------------------------------- Lynae, 3.6 */

/** Hyvatia: ten lasers at 27.36% apiece, and 0.03 energy each — a tenth of what a hit that size
 *  usually pays, which is what its own damage row gives. */
export const HYVATIA = new Mainslot({
  id: 6000189,
  name: "Hyvatia",
  cost: 4,
});
export const ACTION_HYVATIA = new SummonEcho("Echo - Hyvatia", {
  mainslot: HYVATIA, cooldown: 60 * 20,
  element: Attribute.Spectro, scaling: Scaling.Atk, type: Type.Echo,
  bullets: [185, 192, 198, 205, 211, 216, 223, 238, 244, 250].map((f) => ({ hitFrame: f, commitFrame: 0, mv: 2736, energy: 3 })),
  updateBuffs: () => queueOutro(HYVATIA_HANDOFF),
});

/** Its own handoff: an Outro within 15s of the summon hands the next resonator's Intro +10%
 *  All-Attribute DMG Bonus for 15s — the summon window is one a rotation never misses, and the
 *  15s it grants runs to the end of the next handoff (gear.ts's `handoff`). */
export const HYVATIA_HANDOFF = handoff("Hyvatia: Outro", () => addStat(Stat.DmgBonus, 10));

/* ------------------------------------------------------------------------------- Mornye, 3.6 */

/** Reactor Husk: one heavy slash at 351%, and a flat +10% Energy Regen for whoever wears it —
 *  which is the reason Mornye wants it, her Liberation turning every point of ER past 100% into
 *  crit. */
export const REACTOR_HUSK = new Mainslot({
  id: 6000190,
  name: "Reactor Husk",
  cost: 4,
  stats: [[Stat.ER, 10]],
});
export const ACTION_REACTOR_HUSK = new TransformEcho("Echo - Reactor Husk", {
  mainslot: REACTOR_HUSK, endPosition: Position.Grounded, animFrames: 75,
  bullets: [{ hitFrame: 49, mv: 35100, energy: 487 }],
  cooldown: 60 * 20,
  element: Attribute.Fusion, scaling: Scaling.Atk, type: Type.Echo,
});

/** Spacetrek Explorer: a 10%-of-Max-HP team shield and nothing else — no damage of its own, so
 *  only the cast exists here. Kept because it is a real mainslot option for a sustain build. */
export const SPACETREK_EXPLORER = new Mainslot({
  id: 6000184,
  name: "Spacetrek Explorer",
  cost: 3,
});
export const ACTION_SPACETREK = new SummonEcho("Echo - Spacetrek Explorer", {
  mainslot: SPACETREK_EXPLORER, cooldown: 60 * 20,
  // the shield lands on a bullet that deals nothing, at wuwalab's echo_shield_all
  bullets: [{ hitFrame: 135, commitFrame: 0, element: null, type: null, subtype: null, updateDebuffs: () => gainShield() }],
});

/* ------------------------------------------------------------------------------- Hiyuki, 3.6 */

/** Reminiscence: Threnodian - Voidborne Construct, Hiyuki's own mainslot echo: Aleph-1's Creation
 *  lands five 21.88% Glacio hits and one 164.16%. The main-slot wearer also gets a flat +12%
 *  Glacio DMG Bonus and +12% Resonance Liberation DMG Bonus. */
export const VOIDBORNE_CONSTRUCT = new Mainslot({
  id: 6000199,
  name: "Reminiscence: Threnodian - Voidborne",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Glacio], [Stat.DmgBonus, 12, Type.Liberation]],
});
export const ACTION_VOIDBORNE_CONSTRUCT = new SummonEcho("Echo - Reminiscence: Voidborne Construct", {
  mainslot: VOIDBORNE_CONSTRUCT, cooldown: 60 * 20,
  element: Attribute.Glacio, scaling: Scaling.Atk, type: Type.Echo,
  bullets: [...[33, 42, 51, 60, 69].map((f) => ({ hitFrame: f, commitFrame: 0, mv: 2188, energy: 12 })), { hitFrame: 91, commitFrame: 0, mv: 16416, energy: 136 }],
});

/** Glommoth: one 273.6% Glacio stomp, and an Outro within 15s of the summon hands the incoming
 *  resonator +12% Glacio DMG Bonus for 15s — the same shape as Hyvatia's own handoff above. */
export const GLOMMOTH = new Mainslot({
  id: 6000195,
  name: "Glommoth",
  cost: 3,
});
export const ACTION_GLOMMOTH = new SummonEcho("Echo - Glommoth", {
  mainslot: GLOMMOTH, castPosition: Position.Grounded, endPosition: Position.Grounded, cooldown: 60 * 20,
  element: Attribute.Glacio, scaling: Scaling.Atk, type: Type.Echo, bullets: [{ hitFrame: 54, commitFrame: 0, mv: 27360, energy: 380 }],
  updateBuffs: () => queueOutro(GLOMMOTH_HANDOFF),
});
export const GLOMMOTH_HANDOFF = handoff("Glommoth: Outro", () => addStat(Stat.DmgBonus, 12, Attribute.Glacio));

/** Wishes of Quiet Snowfall, the Glacio Chafe sonata. 2pc: +10% Glacio DMG Bonus. 5pc: inflicting
 *  Glacio Chafe grants +10% Glacio DMG for 15s and, once every 25s, Snowfall (15s), spent one way
 *  only: Resonance Liberation DMG for +25% Crit. Rate, or an Outro for +25% Glacio DMG to the
 *  incoming resonator. `onInflict`: the stacks Lucilla's Film Roll adds are hers, not the wearer's. */
export const QUIET_SNOWFALL_2PC = new Sonata2pc({ id: 30, name: "Wishes of Quiet Snowfall 2pc", echoes: [VOIDBORNE_CONSTRUCT, GLOMMOTH], stats: [[Stat.DmgBonus, 10, Attribute.Glacio]] });
export const QUIET_SNOWFALL_5PC = new Sonata({
  id: 30,
  name: "Wishes of Quiet Snowfall 5pc",
  sonata2pc: QUIET_SNOWFALL_2PC,
  grants: [
    { on: onInflict(GLACIO_CHAFE), buff: () => QUIET_SNOWFALL_GLACIO },
    // Snowfall once every 25s: the cooldown marker goes up with it
    { on: both(onInflict(GLACIO_CHAFE), () => !isHeld(SNOWFALL_COOLDOWN)), buff: () => SNOWFALL },
    { on: both(onInflict(GLACIO_CHAFE), () => !isHeld(SNOWFALL_COOLDOWN)), buff: () => SNOWFALL_COOLDOWN },
  ],
});

const SNOWFALL_COOLDOWN = new Buff({ duration: 60 * 25 });

export const QUIET_SNOWFALL_GLACIO = new Buff({
  name: "Wishes of Quiet Snowfall 5pc (chafe)",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 10, Attribute.Glacio]],
});

/** The marker itself — carries no stat, it is only ever the thing one of the two branches spends. */
export const SNOWFALL = new Buff({
  name: "Wishes of Quiet Snowfall 5pc: Snowfall",
  duration: 60 * 15,
  updateBuffs: () => {
    if (casting(Cast.Outro)) {
      revokeCurrent(SNOWFALL);
      queueOutro(SNOWFALL_OUTRO);
    }
  },
  afterHit: () => {
    if (isType(Type.Liberation)) {
      revokeCurrent(SNOWFALL);
      revokeCurrent(SNOWFALL_EXTENDS);
      applyCurrent(SNOWFALL_CRIT, 1);
    }
  },
});

/** 6s of Crit Rate; Resonance Liberation DMG while it is up adds 4s, once every 0.5s, 6 times. */
export const SNOWFALL_CRIT = new Buff({
  name: "Wishes of Quiet Snowfall 5pc (liberation)",
  duration: 60 * 6,
  stats: [[Stat.CritRate, 25]],
  afterHit: () => {
    if (!isType(Type.Liberation)) return;
    if (isHeld(SNOWFALL_EXTEND_GAP) || stacksOf(SNOWFALL_EXTENDS) >= 6) return;
    extendCurrent(SNOWFALL_CRIT, 60 * 4);
    applyCurrent(SNOWFALL_EXTENDS, 1);
    applyCurrent(SNOWFALL_EXTEND_GAP, 1);
  },
});
const SNOWFALL_EXTENDS = new Buff({ maxStacks: 6 });
const SNOWFALL_EXTEND_GAP = new Buff({ duration: 30 });

export const SNOWFALL_OUTRO = handoff("Wishes of Quiet Snowfall 5pc (outro)", () => addStat(Stat.DmgBonus, 25, Attribute.Glacio));

/* --------------------------------------------------------------------------- 3.5-3.6 sonatas */

/** Pact of Neonlight Leap. 2pc: +10% Spectro DMG Bonus flat. 5pc: the classic Outro→Intro
 *  handoff — the incoming resonator gets +15% ATK, plus 0.3% more per point of their own Tune
 *  Break Boost, capped at another +15% (50 points), for 15s or until switched out — the
 *  receiver's own outro is both, so it's the Moonlit Clouds shape. */
export const NEONLIGHT_LEAP_2PC = new Sonata2pc({ id: 24, name: "Pact of Neonlight Leap 2pc", echoes: [HYVATIA], stats: [[Stat.DmgBonus, 10, Attribute.Spectro]] });
export const NEONLIGHT_LEAP_5PC = new Sonata({
  id: 24,
  name: "Pact of Neonlight Leap 5pc",
  sonata2pc: NEONLIGHT_LEAP_2PC,
  grants: [{ on: onCast(Cast.Outro), buff: () => NEONLIGHT_LEAP_HANDOFF, to: BuffTarget.Next }],
});
export const NEONLIGHT_LEAP_HANDOFF = new Buff({
  name: "Pact of Neonlight Leap 5pc (outro)", lostOnSwap: true,
  duration: 60 * 15,
  stats: [[Stat.BonusAtk, 15]],
  // the TBB half is read late so every contribution has landed this action — the era's flat 10,
  // Reel of Spliced Memories' +20, and Denia's Etched Colors, which grants from its own
  // convertStats() and an ordinary convertStats() here would race
  lateConvertStats: () => {
    addStat(Stat.BonusAtk, Math.min(15, 0.3 * getStat(Stat.TBB)));
  },
});

/** Halo of Starry Radiance, Mornye's own sonata. 2pc: +10% Healing Bonus flat. 5pc: healing a
 *  teammate grants the whole team ATK, 0.2% per 1% of the healer's own Off-Tune Buildup Rate —
 *  taken at the 25% cap per CLAUDE.md's own-stats rule (125% needed; base 100% plus Mornye's
 *  field's +50 clears it). 4s team window, so lost on the wearer's next intro. */
export const STARRY_RADIANCE_2PC = new Sonata2pc({ id: 25, name: "Halo of Starry Radiance 2pc", echoes: [REACTOR_HUSK, SPACETREK_EXPLORER], stats: [[Stat.HealingBonus, 10]] });
export const STARRY_RADIANCE_5PC = new Sonata({
  id: 25,
  name: "Halo of Starry Radiance 5pc",
  sonata2pc: STARRY_RADIANCE_2PC,
  grants: [{ on: onApplied(HEALS), buff: () => STARRY_RADIANCE_TEAM, to: BuffTarget.Team }],
});
export const STARRY_RADIANCE_TEAM = new Buff({
  name: "Halo of Starry Radiance 5pc",
  duration: 60 * 4,
  convertStats: () => {
    addStat(Stat.BonusAtk, Math.min(25, 0.2 * getStat(Stat.OfftuneBuildup)));
  }
});

/** Chromatic Foam. 2pc: +10% Fusion DMG Bonus flat. 5pc: inflicting Fusion Burst grants +10%
 *  Fusion DMG Bonus for 15s; while that window is up, the wearer's Outro hands the incoming
 *  resonator +25% Fusion DMG Bonus for 15s. */
export const CHROMATIC_FOAM_2PC = new Sonata2pc({ id: 28, name: "Chromatic Foam 2pc", echoes: () => [REACTOR_HUSK, TRICKSTER, NEBULOUS_CANNON, SPACETREK_EXPLORER], stats: [[Stat.DmgBonus, 10, Attribute.Fusion]] });
export const CHROMATIC_FOAM_5PC = new Sonata({
  id: 28,
  name: "Chromatic Foam 5pc",
  sonata2pc: CHROMATIC_FOAM_2PC,
  grants: [{ on: onInflict(FUSION_BURST), buff: () => CHROMATIC_FOAM_BUFF }],
});
/** Permanent uptime once triggered — the wearer's off-field inflictions keep it live anyway, so
 *  no end condition beyond its 15s. */
export const CHROMATIC_FOAM_BUFF = new Buff({
  name: "Chromatic Foam 5pc",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 10, Attribute.Fusion]],
  grants: [{ on: onCast(Cast.Outro), buff: () => CHROMATIC_FOAM_HANDOFF, to: BuffTarget.Next }],
});
/** The receiver's half: the text's plain 15s, with no end on switching out. */
export const CHROMATIC_FOAM_HANDOFF = new Buff({
  name: "Chromatic Foam 5pc (outro)",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 25, Attribute.Fusion]],
});

/** Trailblazing Star, the other Fusion sonata of the era. 2pc: +10% Fusion DMG Bonus flat. 5pc:
 *  inflicting either Fusion Burst or Tune Rupture - Shifting grants +20% Crit. Rate and +20%
 *  Fusion DMG Bonus for 8s. */
export const TRAILBLAZING_STAR_2PC = new Sonata2pc({ id: 27, name: "Trailblazing Star 2pc", echoes: () => [SIGILLUM, GLOMMOTH], stats: [[Stat.DmgBonus, 10, Attribute.Fusion]] });
export const TRAILBLAZING_STAR_5PC = new Sonata({
  id: 27,
  name: "Trailblazing Star 5pc",
  sonata2pc: TRAILBLAZING_STAR_2PC,
  grants: [{ on: onInflict(FUSION_BURST, TUNE_RUPTURE_SHIFTING), buff: () => TRAILBLAZING_STAR_BUFF }],
});
export const TRAILBLAZING_STAR_BUFF = new Buff({
  name: "Trailblazing Star 5pc",
  duration: 60 * 8,
  stats: [[Stat.CritRate, 20], [Stat.DmgBonus, 20, Attribute.Fusion]],
});

/** Rite of Gilded Revelation, Luuk's own sonata. 2pc: +10% Spectro DMG Bonus flat. 5pc: dealing
 *  Basic Attack DMG grants +10% Spectro DMG Bonus a stack, up to 3, 5s each — short windows, lost
 *  after the outro. At 3 stacks, casting Resonance Liberation grants +40% Basic Attack DMG Bonus;
 *  the page states no duration for it, so it's a short self buff like the stacks, lost after the
 *  outro, and pays into the Liberation itself when that deals Basic Attack DMG. */
export const GILDED_REVELATION_2PC = new Sonata2pc({ id: 26, name: "Rite of Gilded Revelation 2pc", echoes: () => [HYVATIA, NEBULOUS_CANNON], stats: [[Stat.DmgBonus, 10, Attribute.Spectro]] });
export const GILDED_REVELATION_5PC = new Sonata({
  id: 26,
  name: "Rite of Gilded Revelation 5pc",
  sonata2pc: GILDED_REVELATION_2PC,
  grants: [{ on: onType(Type.Basic), buff: () => GILDED_REVELATION_STACKS, onHit: true }],
});
export const GILDED_REVELATION_STACKS = new Buff({
  name: "Rite of Gilded Revelation 5pc", maxStacks: 3, duration: 60 * 5,
  stats: [[Stat.DmgBonus, 10, Attribute.Spectro]], perStack: true,
  applyStats: () => { if (frozenStacks() >= 3 && casting(Cast.Liberation)) addStat(Stat.DmgBonus, 40, Type.Basic); },
});

/* --------------------------------------------------------------------------------- Luuk, 3.6 */

/** Twin Nova: Nebulous Cannon, Luuk's own mainslot echo: two 80.51% Spectro slashes, and a flat
 *  +12% Spectro DMG Bonus and +12% Basic Attack DMG Bonus for whoever wears it. Its pairing with
 *  Twin Nova: Collapsar Blade (alternating casts, Dyad Origins off Basic/Skill casts) needs the
 *  Blade in a second 4-cost slot and the Blade's own hit count, which the page doesn't give — not
 *  modelled; this is the Cannon on its own. */
export const NEBULOUS_CANNON = new Mainslot({
  id: 6000179,
  name: "Twin Nova: Nebulous Cannon",
  cost: 3,
  stats: [[Stat.DmgBonus, 12, Attribute.Spectro], [Stat.DmgBonus, 12, Type.Basic]],
});
export const ACTION_NEBULOUS_CANNON = new TransformEcho("Echo - Twin Nova: Nebulous Cannon", {
  mainslot: NEBULOUS_CANNON, endPosition: Position.Grounded, animFrames: 38,
  bullets: [{ hitFrame: 11, mv: 8051, energy: 55 }, { hitFrame: 32, mv: 8051, energy: 55 }],
  cooldown: new Cooldown({ frames: 60 * 8, charges: 2 }),
  element: Attribute.Spectro, scaling: Scaling.Atk, type: Type.Echo,
});

/* -------------------------------------------------------------------------------- Denia, 3.6 */

/** Reminiscence: Denia — "Trickster", her own mainslot echo: one 273.6% Fusion hit, and an Outro
 *  within 15s of the summon hands the incoming resonator +12% Fusion DMG Bonus for 15s. Pairs
 *  with Chromatic Foam above. */
export const TRICKSTER = new Mainslot({
  id: 6000200,
  name: "Reminiscence: Denia",
  cost: 4,
});
export const ACTION_TRICKSTER = new SummonEcho("Echo - Trickster", {
  mainslot: TRICKSTER, cooldown: 60 * 20,
  element: Attribute.Fusion, scaling: Scaling.Atk, type: Type.Echo, bullets: [{ hitFrame: 35, commitFrame: 0, mv: 27360, energy: 380 }],
  updateBuffs: () => queueOutro(TRICKSTER_HANDOFF),
});
/** Not the `handoff()` window: the text's plain 15s, with no end on switching out — the same
 *  as Chromatic Foam's above. */
export const TRICKSTER_HANDOFF = new Buff({
  name: "Trickster: Outro",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 12, Attribute.Fusion]],
});

/** Voidwing Moth: a 405% Spectro tap, or held on for twelve more 49.33% hits. The tap is what a
 *  rotation places (the hold is a long channel), the hold kept as its own cast. Either way an
 *  Outro within 15s hands the incoming resonator +12% ATK for 15s. */
export const VOIDWING_MOTH = new Mainslot({
  id: 6000198,
  name: "Voidwing Moth",
  cost: 3,
});
export const ACTION_VOIDWING_MOTH = new TransformEcho("Echo - Voidwing Moth", {
  mainslot: VOIDWING_MOTH, endPosition: Position.Grounded, animFrames: 85,
  bullets: [{ hitFrame: 39, mv: 40500, energy: 562 }],
  cooldown: 60 * 25,
  element: Attribute.Spectro, scaling: Scaling.Atk, type: Type.Echo,
  updateBuffs: () => queueOutro(VOIDWING_HANDOFF),
});
export const VOIDWING_HANDOFF = handoff("Voidwing Moth: Outro", () => addStat(Stat.BonusAtk, 12));

/** Reel of Spliced Memories, Voidwing Moth's own sonata. 2pc: +10% ATK flat. 5pc: the wearer
 *  inflicting Tune Rupture/Strain - Shifting grants the whole team +20 Tune Break Boost for 30s —
 *  permanent uptime, same name doesn't stack. The real stat, so the Strain payout and the damage
 *  formula's own tbbFactor both see it. */
export const REEL_2PC = new Sonata2pc({ id: 31, name: "Reel of Spliced Memories 2pc", echoes: [NAMELESS_EXPLORER, VOIDWING_MOTH], stats: [[Stat.BonusAtk, 10]] });
export const REEL_5PC = new Sonata({
  id: 31,
  name: "Reel of Spliced Memories 5pc",
  sonata2pc: REEL_2PC,
  grants: [{ on: onInflict(TUNE_RUPTURE_SHIFTING, TUNE_STRAIN_SHIFTING), buff: () => REEL_TEAM, to: BuffTarget.Team }],
});
export const REEL_TEAM = new Buff({ name: "Reel of Spliced Memories 5pc", duration: 60 * 30, stats: [[Stat.TBB, 20]] });

/* ---------------------------------------------------------------- Rebecca and Lucy, the collab */

/** "Reminiscence - Nightmare: Adam Smasher" is one echo with three casts — a generic 16-hit
 *  Physical one for anybody else, and a special one each for the two resonators who unlock it
 *  (Lucy's single 273.6% Spectro slam, Rebecca's 16 x 17.10% Electro missile volley), who also get
 *  +15% Crit. Rate.
 *
 *  Its sonata, Shadow of Shattered Dreams, has a *one*-piece bonus and nothing else, so it is a
 *  `Sonata1pc` worn beside two ordinary 2-piece sets — see each resonator's own `echoLoadouts`.
 *  Inflicting Hack - Shifting grants +35% Basic Attack DMG Bonus and +35% Heavy Attack DMG Bonus
 *  for 15s. */
export const SHATTERED_DREAMS = new Buff({
  name: "Shadow of Shattered Dreams",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 35, Type.Basic], [Stat.DmgBonus, 35, Type.Heavy]],
});
export const SHATTERED_DREAMS_1PC = new Sonata1pc({
  id: 32,
  name: "Shadow of Shattered Dreams 1pc",
  echoes: () => [ADAM_SMASHER], grants: [{ on: onInflict(TUNE_HACK_SHIFTING), buff: SHATTERED_DREAMS }],
});

export const ADAM_SMASHER = new Mainslot({
  id: 6000201,
  name: "Nightmare: Adam Smasher",
  cost: 4,
  constantStats: () => { if (wears("Lucy") || wears("Rebecca")) addStat(Stat.CritRate, 15); },
});
export const ACTION_ADAM_SMASHER_LUCY = new SummonEcho("Echo - Adam Smasher", {
  mainslot: ADAM_SMASHER, cooldown: 60 * 20,
  element: Attribute.Spectro, scaling: Scaling.Atk, type: Type.Echo, bullets: [{ hitFrame: 0, mv: 27360, energy: 380 }],
});

export const ACTION_ADAM_SMASHER_REBECCA = new SummonEcho("Echo - Adam Smasher", {
  mainslot: ADAM_SMASHER, cooldown: 60 * 20,
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
  bullets: [32, 42, 48, 53, 56, 64, 70, 81, 84, 87, 95, 102, 106, 118, 123, 130].map((f) => ({ hitFrame: f, commitFrame: 0, mv: 1710, energy: 23 })),
});
export const ACTION_ADAM_SMASHER = new SummonEcho("Echo - Adam Smasher", {
  mainslot: ADAM_SMASHER, cooldown: 60 * 20,
  element: Attribute.Physical, scaling: Scaling.Atk, type: Type.Echo,
  bullets: [85, 92, 97, 104, 110, 116, 122, 128].flatMap((f) => [0, 1].map(() => ({ hitFrame: f, commitFrame: 0, mv: 1026, energy: 14 }))),
});

/* ------------------------------------------------------------------------------ Aemeath, 3.6 */

/** Sigillum, Aemeath's own mainslot echo: two Fusion hits, 68.4% and 205.2%. The +25% Resonance
 *  Liberation DMG Bonus is "when equipped in the main slot by Aemeath" — only her loadouts list
 *  it, so it is granted flat here. Pairs with Trailblazing Star above. */
export const SIGILLUM = new Mainslot({
  id: 6000191,
  name: "Sigillum",
  cost: 4,
  constantStats: () => { if (currentMember().resonator?.name === "Aemeath") addStat(Stat.DmgBonus, 25, Type.Liberation); },
});
export const ACTION_SIGILLUM = new SummonEcho("Echo - Sigillum", {
  mainslot: SIGILLUM, cooldown: 60 * 20,
  element: Attribute.Fusion, scaling: Scaling.Atk, type: Type.Echo,
  bullets: [{ hitFrame: 25, commitFrame: 0, mv: 6840, energy: 23 }, { hitFrame: 55, commitFrame: 0, mv: 20520, energy: 213 }],
});
