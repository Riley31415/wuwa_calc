/**
 * Mainslot echoes and sonatas from Jinzhou (versions 1.0-1.4). Grouped by region rather than
 * version — generic/reused sets are filed here by their own earliest real release. A mainslot echo
 * is two things: an Action (`cast: Cast.Echo`) plus a piece held by whoever equips it — whatever
 * the cast itself does lives on that Action, while a flat equip passive is the Mainslot's `stats`.
 */
import { Stat, Attribute, Type, Cast, Scaling, BuffTarget, Position } from "../engine/stats.js";
import { Buff, Sonata, Sonata2pc, Mainslot, handoff } from "../engine/gear.js";
import {
  cancelHits,
  addStat, addGain, frozenStacks, casting, applyCurrent, applyTeam, stacksOfTeam, revokeTeam, queueOutro, queue,
   isActive, isHeld, currentMember, both, onCast, onType, onApplied,
  lostOnSwap, lastHit,
} from "../engine/context.js";
import { Action, Cooldown } from "../engine/rotation.js";
import { HEALS, gainShield } from "../shared/status.js";
import { PseudoTransformEcho, SummonEcho, TransformEcho } from "./echo.js";

/* -------------------------------------------------------------------------- generic, unowned */

/** Bell-Borne Geochelone, a 5-cost mainslot echo. No equip passive — its own cast puts the team's
 *  Bell-Borne Shield up for 15s (only the +10% DMG Bonus half is modelled; the 50% DMG Reduction
 *  pays nothing here). Its other end — "disappears after the current character is hit 3 times" —
 *  is nothing this engine can see, so the 15s is the whole of what bounds it. */
export const BELL_BORNE_GEOCHELONE = new Mainslot({
  id: 390080005,
  name: "Bell-Borne Geochelone",
  cost: 4,
});
export const ACTION_BELL_BORNE = new PseudoTransformEcho("Echo - Bell-Borne Geochelone", {
  mainslot: BELL_BORNE_GEOCHELONE, castPosition: Position.Grounded, endPosition: Position.Grounded, cooldown: 60 * 20, animFrames: 32,
  element: Attribute.Glacio, scaling: Scaling.Def, type: Type.Echo, bullets: [{ hitFrame: 21, commitFrame: 0, mv: 14592, energy: 455 }],
  updateBuffs: () => applyTeam(BELL_BORNE_SHIELD),
});

export const BELL_BORNE_SHIELD = new Buff({
  name: "Bell-Borne Geochelone: Bell-Borne Shield", duration: 60 * 15,
  stats: [[Stat.DmgBonus, 10]],
});

/** Impermanence Heron, a generic mainslot echo. No equip passive — its own cast primes an Outro
 *  handoff: the incoming resonator gets +12% (unscoped) DMG Bonus for 15s — long enough to outlast
 *  their own visit, so it runs to the end of the next handoff (gear.ts's `handoff`). */
export const HERON = new Mainslot({
  id: 6000052,
  name: "Impermanence Heron",
  cost: 4,
});
export const ACTION_HERON = new TransformEcho("Echo - Impermanence Heron", {
  mainslot: HERON, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 120,
  // 4.85 off the hit itself, plus the flat 10 its own skill text hands back ("the current
  // character regains 10 Resonance Energy" once the smack-down lands)
  bullets: [{ hitFrame: 76, mv: 31056, energy: 485, updateDebuffs: () => addGain({ energy: 1000 }) }],
  cooldown: 60 * 20,
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo,
  updateBuffs: () => queueOutro(HERON_HANDOFF),
});

export const HERON_HANDOFF = handoff("Impermanence Heron: Outro", () => addStat(Stat.DmgBonus, 12));

/** Stonewall Bracer, a generic Elite Class mainslot echo (Huanglong). No equip passive — its own
 *  cast is a transformation: a 112.64% Physical charge into a 168.96% Physical smash, taken as the
 *  one cast the rotation presses, and a shield worth 10% of the wearer's own Max HP for 7s. Both
 *  hits bank Energy and neither banks Concerto or Off-Tune — nanoka's own rows (echo 390077021),
 *  which is what a Physical echo looks like: no element to resonate with.
 *
 *  The shield is why it is worth wearing over Impermanence Heron on a Moonlit Clouds support: it is
 *  the SHIELD marker every "on gaining a shield" passive in the roster reads (statuses.ts), so a
 *  teammate's kit pays out for it. The shield's own damage absorption is not modelled — nothing in
 *  this calculator takes damage. */
export const STONEWALL_BRACER = new Mainslot({
  id: 390077021,
  name: "Stonewall Bracer",
  cost: 3,
});
export const ACTION_STONEWALL_BRACER_1 = new TransformEcho("Echo - Stonewall Bracer 1", {
  mainslot: STONEWALL_BRACER, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 54,
  // the smash
  cooldown: 60 * 15,
  bullets: [{ hitFrame: 32, mv: 16896, energy: 264 }],
  element: Attribute.Physical, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_STONEWALL_BRACER_2 = new TransformEcho("Echo - Stonewall Bracer 2", {
  mainslot: STONEWALL_BRACER, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 0, chains: [ACTION_STONEWALL_BRACER_1.press],
  // the charge and the shield: wuwalab gives it no frames of its own
  bullets: [{ hitFrame: 0, mv: 11264, energy: 176, updateDebuffs: () => gainShield() }],
  element: Attribute.Physical, scaling: Scaling.Atk, type: Type.Echo,
});

/** Moonlit Clouds, a generic sonata. 2pc: +10% ER flat. 5pc: on Outro, the incoming resonator
 *  gets +22.5% ATK for 15s — same handoff shape as Heron, but unconditional. */
export const MOONLIT_CLOUDS_2PC = new Sonata2pc({ id: 8, name: "Moonlit Clouds 2pc", echoes: [HERON, BELL_BORNE_GEOCHELONE, STONEWALL_BRACER], stats: [[Stat.ER, 10]] });

export const MOONLIT_CLOUDS_5PC = new Sonata({
  id: 8,
  name: "Moonlit Clouds 5pc",
  sonata2pc: MOONLIT_CLOUDS_2PC,
  grants: [{ on: onCast(Cast.Outro), buff: () => MOONLIT_CLOUDS_HANDOFF, to: BuffTarget.Next }],
});

export const MOONLIT_CLOUDS_HANDOFF = handoff("Moonlit Clouds 5pc (outro)", () => addStat(Stat.BonusAtk, 22.5));

export const REJUV_2PC = new Sonata2pc({ id: 7, name: "Rejuvenating Glow 2pc", echoes: () => [FALLACY, BELL_BORNE_GEOCHELONE, STONEWALL_BRACER], stats: [[Stat.HealingBonus, 10]] });
/** Rejuvenating Glow, a generic sonata. 5pc: on healing an ally, +15% ATK flat, team-wide,
 *  permanent uptime once triggered. 2pc: +10% Healing Bonus flat, tracked for completeness only. */
export const REJUV_5PC = new Sonata({
  id: 7,
  name: "Rejuvenating Glow 5pc",
  sonata2pc: REJUV_2PC,
  grants: [{ on: onApplied(HEALS), buff: () => REJUV_TEAM, to: BuffTarget.Team }],
});
export const REJUV_TEAM = new Buff({ name: "Rejuvenating Glow 5pc", duration: 60 * 30, stats: [[Stat.BonusAtk, 15]] });

/* ------------------------------------------------------------------------------- Changli, 1.1 */

/** Molten Rift, Changli's own sonata — also reused by Encore's Inferno Rider mainslot below.
 *  2pc: +10% Fusion DMG Bonus flat. 5pc: +30% Fusion DMG Bonus for 15s after Resonance Skill. */
export const MOLTEN_RIFT_2PC = new Sonata2pc({ id: 2, name: "Molten Rift 2pc", echoes: () => [NM_INFERNO_RIDER, INFERNO_RIDER], stats: [[Stat.DmgBonus, 10, Attribute.Fusion]] });
export const MOLTEN_RIFT_5PC = new Sonata({
  id: 2,
  name: "Molten Rift 5pc",
  sonata2pc: MOLTEN_RIFT_2PC,
  grants: [{ on: onCast(Cast.Skill), buff: () => MOLTEN_RIFT_BUFF }],
});
export const MOLTEN_RIFT_BUFF = new Buff({
  name: "Molten Rift 5pc",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 30, Attribute.Fusion]],
});

/** Nightmare: Inferno Rider, Changli's own mainslot echo — her Skill DMG is Fusion. Flat
 *  Fusion/Skill DMG Bonus for whoever wears it, no trigger. */
export const NM_INFERNO_RIDER = new Mainslot({
  id: 6000091,
  name: "Nightmare: Inferno Rider",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Fusion], [Stat.DmgBonus, 12, Type.Skill]],
});
export const ACTION_NM_INFERNO_RIDER = new TransformEcho("Echo - Nightmare: Inferno Rider", {
  mainslot: NM_INFERNO_RIDER, endPosition: Position.Grounded, animFrames: 119,
  bullets: [{ hitFrame: 64, mv: 40500, energy: 562 }],
  cooldown: 60 * 25,
  element: Attribute.Fusion, scaling: Scaling.Atk, type: Type.Echo,
});

/* -------------------------------------------------------------------------------- Encore, 1.0 */

/** Inferno Rider (plain, not "Nightmare:") — Encore's own mainslot echo. No permanent passive:
 *  casting it grants a temporary +12%/+12% Fusion/Basic Attack DMG Bonus window. */
export const INFERNO_RIDER = new Mainslot({
  id: 390080007,
  name: "Inferno Rider",
  cost: 4,
});
export const ACTION_INFERNO_RIDER_1 = new TransformEcho("Echo - Inferno Rider 1", {
  mainslot: INFERNO_RIDER, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 20,
  cooldown: 60 * 20,
  bullets: [{ hitFrame: 15, mv: 24240, energy: 378 }],
  element: Attribute.Fusion, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_INFERNO_RIDER_2 = new TransformEcho("Echo - Inferno Rider 2", {
  mainslot: INFERNO_RIDER, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 39, chains: [ACTION_INFERNO_RIDER_1.press],
  bullets: [{ hitFrame: 24, mv: 28280, energy: 441 }],
  element: Attribute.Fusion, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_INFERNO_RIDER_3 = new TransformEcho("Echo - Inferno Rider 3", {
  mainslot: INFERNO_RIDER, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 116, chains: [ACTION_INFERNO_RIDER_2.press],
  bullets: [{ hitFrame: 59, mv: 28280, energy: 441 }],
  element: Attribute.Fusion, scaling: Scaling.Atk, type: Type.Echo,
  afterAction: () => applyCurrent(INFERNO_RIDER_WINDOW, 1),
});
export const INFERNO_RIDER_WINDOW = new Buff({
  name: "Inferno Rider",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 12, Attribute.Fusion], [Stat.DmgBonus, 12, Type.Basic]],
});

/* ------------------------------------------------------------------ Camellya 1.4 / Rover 1.0 */

/** Dreamless — Havoc Rover's own Calamity: six strikes, whose DMG "is increased by 50%" (Total DMG,
 *  the attacker's side) during the first 5s after Rover: Havoc casts Deadening Abyss. */
export const DREAMLESS_ABYSS = new Buff({ name: "Dreamless (Deadening Abyss)", duration: 60 * 5 });
export const DREAMLESS = new Mainslot({
  id: 6000053,
  name: "Dreamless",
  cost: 4,
  grants: [{ on: both(onCast(Cast.Liberation), () => currentMember().resonator?.name === "Havoc Rover"), buff: DREAMLESS_ABYSS }],
});
export const ACTION_DREAMLESS = new TransformEcho("Echo - Dreamless", {
  mainslot: DREAMLESS, endPosition: Position.Grounded, cooldown: 60 * 20, animFrames: 143,
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo, // 54.08%*5+270.40%
  bullets: [...[31, 39, 48, 54, 62].map((f) => ({ hitFrame: f, mv: 5408, energy: 84 })), { hitFrame: 129, mv: 27040, energy: 422 }],
  applyStats: () => { if (isHeld(DREAMLESS_ABYSS)) addStat(Stat.TotalDmg, 50); },
});

/** Nightmare: Crownless, the shared Havoc mainslot echo for Camellya and Havoc Rover. Flat
 *  Havoc/Basic Attack DMG Bonus, no trigger. */
// TODO 20% dmg bonus to echo on consecutive hits
export const NM_CROWNLESS = new Mainslot({
  id: 6000090,
  name: "Nightmare: Crownless",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Havoc], [Stat.DmgBonus, 12, Type.Basic]],
});
export const ACTION_NM_CROWNLESS = new TransformEcho("Echo - Nightmare: Crownless", {
  mainslot: NM_CROWNLESS, endPosition: Position.Grounded, animFrames: 41,
  // wuwalab's commit is 0 already, so the transform's - 14 leaves it there
  bullets: [{ hitFrame: 11, commitFrame: 0, mv: 26460, energy: 367 }],
  cooldown: new Cooldown({ frames: 60 * 12, charges: 3 }),
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo,
});

/** Crownless (plain, not "Nightmare:") — no equip passive, the transform itself granting the
 *  +12%/+12% Havoc/Resonance Skill window. Its chain runs to four attacks, but only the first is
 *  pressed: the transform is left the moment the window is banked. */
export const CROWNLESS = new Mainslot({
  id: 6000042,
  name: "Crownless",
  cost: 4,
});
export const ACTION_CROWNLESS_1 = new TransformEcho("Echo - Crownless 1", {
  mainslot: CROWNLESS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 35,
  cooldown: 60 * 20,
  bullets: [{ hitFrame: 10, mv: 13408, energy: 209 }],
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo,
  updateBuffs: () => applyCurrent(CROWNLESS_WINDOW, 1),
});
export const ACTION_CROWNLESS_2 = new TransformEcho("Echo - Crownless 2", {
  mainslot: CROWNLESS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 37, chains: [ACTION_CROWNLESS_1.press],
  bullets: [{ hitFrame: 21, mv: 13408, energy: 209 }],
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_CROWNLESS_3 = new TransformEcho("Echo - Crownless 3", {
  mainslot: CROWNLESS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 30, chains: [ACTION_CROWNLESS_2.press],
  bullets: [{ hitFrame: 8, mv: 10056, energy: 157 }, { hitFrame: 20, mv: 10056, energy: 157 }],
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_CROWNLESS_4 = new TransformEcho("Echo - Crownless 4", {
  mainslot: CROWNLESS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 112, chains: [ACTION_CROWNLESS_3.press],
  bullets: [42, 49, 73].map((f) => ({ hitFrame: f, mv: 6704, energy: 104 })),
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type.Echo,
});
export const CROWNLESS_WINDOW = new Buff({
  name: "Crownless",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 12, Attribute.Havoc], [Stat.DmgBonus, 12, Type.Skill]],
});

/** Havoc Eclipse, the matching sonata. 2pc: +10% Havoc DMG Bonus flat. 5pc: +7.5% Havoc DMG
 *  Bonus after Basic/Heavy Attack, up to 4 stacks, 15s each. */
export const HAVOC_ECLIPSE_2PC = new Sonata2pc({ id: 6, name: "Havoc Eclipse 2pc", echoes: [CROWNLESS, DREAMLESS, NM_CROWNLESS], stats: [[Stat.DmgBonus, 10, Attribute.Havoc]] });
export const HAVOC_ECLIPSE_5PC = new Sonata({
  id: 6,
  name: "Havoc Eclipse 5pc",
  sonata2pc: HAVOC_ECLIPSE_2PC,
  grants: [{ on: onType(Type.Basic, Type.Heavy), buff: () => HAVOC_ECLIPSE_STACKS, onHit: true }],
});
export const HAVOC_ECLIPSE_STACKS = new Buff({
  name: "Havoc Eclipse 5pc", maxStacks: 4, duration: 60 * 15,
  stats: [[Stat.DmgBonus, 7.5, Attribute.Havoc]], perStack: true,
});

/* --------------------------------------------------------- old Jinzhou sonatas, none in a build */

/** Lampylumen Myriad (plain, not "Nightmare:") — an old Jinzhou-era mainslot echo. No equip
 *  passive — its cast's 3 hits grant a stacking +4% Glacio / +4% Resonance Skill DMG Bonus for
 *  15s, up to 3 stacks. Not owned by any resonator implemented yet — exported standalone. */
export const LAMPYLUMEN_MYRIAD = new Mainslot({
  id: 6000044,
  name: "Lampylumen Myriad",
  cost: 4,
});
export const ACTION_LAMPYLUMEN_MYRIAD_1 = new TransformEcho("Echo - Lampylumen Myriad 1", {
  mainslot: LAMPYLUMEN_MYRIAD, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 40,
  cooldown: 60 * 20,
  bullets: [{ hitFrame: 32, mv: 20016, energy: 312 }],
  element: Attribute.Glacio, scaling: Scaling.Atk, type: Type.Echo,
  // a stack a shock
  updateDebuffs: () => applyCurrent(LAMPYLUMEN_MYRIAD_STACKS, 1),
});
export const ACTION_LAMPYLUMEN_MYRIAD_2 = new TransformEcho("Echo - Lampylumen Myriad 2", {
  mainslot: LAMPYLUMEN_MYRIAD, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 54, chains: [ACTION_LAMPYLUMEN_MYRIAD_1.press],
  bullets: [{ hitFrame: 46, mv: 20016, energy: 312 }],
  element: Attribute.Glacio, scaling: Scaling.Atk, type: Type.Echo,
  // a stack a shock
  updateDebuffs: () => applyCurrent(LAMPYLUMEN_MYRIAD_STACKS, 1),
});
export const ACTION_LAMPYLUMEN_MYRIAD_3 = new TransformEcho("Echo - Lampylumen Myriad 3", {
  mainslot: LAMPYLUMEN_MYRIAD, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 92, chains: [ACTION_LAMPYLUMEN_MYRIAD_2.press],
  bullets: [{ hitFrame: 48, mv: 26688, energy: 417 }],
  element: Attribute.Glacio, scaling: Scaling.Atk, type: Type.Echo,
  // a stack a shock
  updateDebuffs: () => applyCurrent(LAMPYLUMEN_MYRIAD_STACKS, 1),
});
export const LAMPYLUMEN_MYRIAD_STACKS = new Buff({
  name: "Lampylumen Myriad", maxStacks: 3, duration: 60 * 15,
  stats: [[Stat.DmgBonus, 4, Attribute.Glacio], [Stat.DmgBonus, 4, Type.Skill]], perStack: true,
});

/** Freezing Frost, Lampylumen Myriad's own matching sonata. 2pc: +10% Glacio DMG Bonus flat.
 *  5pc: +10% Glacio DMG Bonus after Basic/Heavy Attack, up to 3 stacks, 15s each. */
export const FREEZING_FROST_2PC = new Sonata2pc({ id: 1, name: "Freezing Frost 2pc", echoes: [LAMPYLUMEN_MYRIAD], stats: [[Stat.DmgBonus, 10, Attribute.Glacio]] });
export const FREEZING_FROST_5PC = new Sonata({
  id: 1,
  name: "Freezing Frost 5pc",
  sonata2pc: FREEZING_FROST_2PC,
  grants: [{ on: onType(Type.Basic, Type.Heavy), buff: () => FREEZING_FROST_STACKS, onHit: true }],
});
export const FREEZING_FROST_STACKS = new Buff({
  name: "Freezing Frost 5pc", maxStacks: 3, duration: 60 * 15,
  stats: [[Stat.DmgBonus, 10, Attribute.Glacio]], perStack: true,
});

/** Nightmare: Feilian Beringal — Sierra Gale's own real matching mainslot echo (Iuno just
 *  happens to reuse it). Flat Aero/Heavy Attack DMG Bonus, no trigger. */
export const NM_FEILIAN_BERINGAL = new Mainslot({
  id: 6000086,
  name: "Nightmare: Feilian Beringal",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Aero], [Stat.DmgBonus, 12, Type.Heavy]],
});
export const ACTION_NM_FEILIAN_BERINGAL = new SummonEcho("Echo - Nightmare: Feilian Beringal", {
  mainslot: NM_FEILIAN_BERINGAL, cooldown: 60 * 20,
  element: Attribute.Aero, scaling: Scaling.Atk, type: Type.Echo, // 164.16%+21.88%x5
  bullets: [{ hitFrame: 75, commitFrame: 0, mv: 16416, energy: 228 }, ...[96, 126, 156, 186, 216].map((f) => ({ hitFrame: f, commitFrame: 0, mv: 2188, energy: 30 }))],
});

/** Feilian Beringal (plain) — a kick and its follow-up, then +12% Aero / +12% Heavy Attack DMG Bonus
 *  for 15s after the follow-up hits. */
export const FEILIAN_BERINGAL = new Mainslot({
  id: 6000043,
  name: "Feilian Beringal",
  cost: 4,
});
export const ACTION_FEILIAN_BERINGAL_1 = new TransformEcho("Echo - Feilian Beringal 1", {
  mainslot: FEILIAN_BERINGAL, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 24,
  cooldown: 60 * 20,
  bullets: [{ hitFrame: 24, mv: 23184, energy: 362 }],
  element: Attribute.Aero, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_FEILIAN_BERINGAL_2 = new TransformEcho("Echo - Feilian Beringal 2", {
  mainslot: FEILIAN_BERINGAL, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 144, chains: [ACTION_FEILIAN_BERINGAL_1.press],
  bullets: [{ hitFrame: 84, mv: 28336, energy: 442 }],
  element: Attribute.Aero, scaling: Scaling.Atk, type: Type.Echo,
  afterHit: () => applyCurrent(FEILIAN_BERINGAL_WINDOW, 1),
});
export const FEILIAN_BERINGAL_WINDOW = new Buff({
  name: "Feilian Beringal", duration: 60 * 15,
  stats: [[Stat.DmgBonus, 12, Attribute.Aero], [Stat.DmgBonus, 12, Type.Heavy]],
});

/** Sierra Gale, the matching sonata. 2pc: +10% Aero DMG Bonus flat. 5pc: +30% Aero DMG Bonus
 *  for 15s after Intro Skill. Iuno's own pick (only the 2pc). */
export const SIERRA_GALE_2PC = new Sonata2pc({ id: 4, name: "Sierra Gale 2pc", echoes: [FEILIAN_BERINGAL, NM_FEILIAN_BERINGAL], stats: [[Stat.DmgBonus, 10, Attribute.Aero]] });
export const SIERRA_GALE_5PC = new Sonata({
  id: 4,
  name: "Sierra Gale 5pc",
  sonata2pc: SIERRA_GALE_2PC,
  grants: [{ on: onCast(Cast.Intro), buff: () => SIERRA_GALE_INTRO }],
});
export const SIERRA_GALE_INTRO = new Buff({
  name: "Sierra Gale 5pc",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 30, Attribute.Aero]],
});

/** Jué — a Calamity Class Spectro mainslot echo. Its cast grants the wearer Blessing of Time for
 *  15s: +16% Resonance Skill DMG Bonus, and a 16% tick once a second on the wearer's own slot,
 *  considered their Resonance Skill DMG — one action, its fifteen ticks its own bullets. The
 *  echo's own 20s cooldown means a rotation re-banks it about once a loop. */
export const JUE = new Mainslot({
  id: 6000059,
  name: "Jué",
  cost: 4,
});
export const ACTION_JUE = new SummonEcho("Echo - Jué", {
  mainslot: JUE, cooldown: 60 * 20,
  // the soar, five thunderbolts, then the two hits of the spiral down: three 48.64% hits, not two
  element: Attribute.Spectro, scaling: Scaling.Atk, type: Type.Echo,
  bullets: [
    { hitFrame: 19, commitFrame: 0, mv: 4864, energy: 76 },
    ...[71, 82, 92, 104, 115].map((f) => ({ hitFrame: f, commitFrame: 0, mv: 1946, energy: 30 })),
    { hitFrame: 157, commitFrame: 0, mv: 4864, energy: 76 }, { hitFrame: 183, commitFrame: 0, mv: 4864, energy: 76 },
  ],
  updateBuffs: () => {
    applyCurrent(JUE_BLESSING, 1);
    // one Jué at a time: a fresh summon cuts off whatever ticks the last had left
    cancelHits(JUE_TICKS);
    queue(ACTION_JUE_TICK);
  },
});
// no energy: the ticks have a damage row of their own and pay nothing
export const ACTION_JUE_TICK = new Action("Echo - Jué: Blessing of Time", {
  element: Attribute.Spectro, scaling: Scaling.Atk, type: Type.Skill,
  bullets: Array.from({ length: 15 }, (_, k) => ({ hitFrame: 60 * (k + 1), mv: 1600 })),
});
const JUE_TICKS = new Set<Action>([ACTION_JUE_TICK]);
export const JUE_BLESSING = new Buff({
  name: "Jué: Blessing of Time", duration: 60 * 15,
  stats: [[Stat.DmgBonus, 16, Type.Skill]],
});

/** Mourning Aix — two claws, and +12% Spectro / +12% Resonance Liberation DMG Bonus for 15s once
 *  transformed. */
export const MOURNING_AIX = new Mainslot({
  id: 6000045,
  name: "Mourning Aix",
  cost: 4,
});
export const ACTION_MOURNING_AIX = new TransformEcho("Echo - Mourning Aix", {
  mainslot: MOURNING_AIX, castPosition: Position.Grounded, endPosition: Position.Grounded, cooldown: 60 * 20, animFrames: 102,
  element: Attribute.Spectro, scaling: Scaling.Atk, type: Type.Echo, // 157.44%+236.16%
  bullets: [{ hitFrame: 23, mv: 15744, energy: 246 }, { hitFrame: 68, mv: 23616, energy: 369 }],
  updateBuffs: () => applyCurrent(MOURNING_AIX_WINDOW, 1),
});
export const MOURNING_AIX_WINDOW = new Buff({
  name: "Mourning Aix", duration: 60 * 15,
  stats: [[Stat.DmgBonus, 12, Attribute.Spectro], [Stat.DmgBonus, 12, Type.Liberation]],
});

/** Celestial Light, Jué's own matching sonata. 2pc: +10% Spectro DMG Bonus flat. 5pc: +30%
 *  Spectro DMG Bonus after Intro Skill, lost after the outro pays out — a double-Intro rotation
 *  (Jinhsi's) re-arms it on each of its two Intros, so both visits run covered. */
export const CELESTIAL_LIGHT_2PC = new Sonata2pc({ id: 5, name: "Celestial Light 2pc", echoes: [MOURNING_AIX, JUE], stats: [[Stat.DmgBonus, 10, Attribute.Spectro]] });
export const CELESTIAL_LIGHT_5PC = new Sonata({
  id: 5,
  name: "Celestial Light 5pc",
  sonata2pc: CELESTIAL_LIGHT_2PC,
  grants: [{ on: onCast(Cast.Intro), buff: () => CELESTIAL_LIGHT_INTRO }],
});
export const CELESTIAL_LIGHT_INTRO = new Buff({
  name: "Celestial Light 5pc",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 30, Attribute.Spectro]],
});

/** Mech Abomination — an Electro mainslot echo. Its strike also grants +12% ATK for 15s and
 *  summons Mech Waste to attack (a hit + explosion, one follow-up queued off the initial
 *  strike). Mech Waste's damage "equals the Resonator's Outro Skill DMG" — just a
 *  stat scope (`Type.Outro`), not a live lookup. */
export const MECH_ABOMINATION = new Mainslot({
  id: 6000048,
  name: "Mech Abomination",
  cost: 4,
});
export const ACTION_MECH_ABOMINATION = new PseudoTransformEcho("Echo - Mech Abomination", {
  mainslot: MECH_ABOMINATION, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 32, bullets: [{ hitFrame: 0, mv: 4864, energy: 76 }],
  cooldown: 60 * 20,
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
  // the strike's: on the hit, so Mech Waste lands after it
  updateDebuffs: () => {
    applyCurrent(MECH_ABOMINATION_ATK, 1);
    queue(ACTION_MECH_WASTE);
  },
});
export const ACTION_MECH_WASTE = new Action("Echo - Mech Abomination: Mech Waste", {
  cast: Cast.Echo, element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Outro,
  bullets: [{ hitFrame: 53, mv: 32000, energy: 152 }, { hitFrame: 121, mv: 16000 }],
});
export const MECH_ABOMINATION_ATK = new Buff({
  name: "Mech Abomination",
  duration: 60 * 15,
  stats: [[Stat.BonusAtk, 12]],
});

/** Lingering Tunes, Mech Abomination's own matching sonata. 2pc: +10% ATK flat. 5pc: +60% Outro
 *  Skill DMG Bonus flat, and +5% ATK every 1.5s on field, up to 4 stacks. Modelled as 8 real
 *  stacks (matching the ~1.5s cadence) so the ATK bonus lands every *2* stacks, discrete;
 *  Lost on swap — tied to being on field. */
export const LINGERING_TUNES_2PC = new Sonata2pc({ id: 9, name: "Lingering Tunes 2pc", echoes: [MECH_ABOMINATION], stats: [[Stat.BonusAtk, 10]] });
export const LINGERING_TUNES_5PC = new Sonata({
  id: 9,
  name: "Lingering Tunes 5pc",
  sonata2pc: LINGERING_TUNES_2PC,
  stats: [[Stat.DmgBonus, 60, Type.Outro]],
  // the clock runs on a buff of the wearer's, put up on their first on-field press and gone with
  // them, so it only ever counts their own time on field
  grants: [{ on: isActive, buff: () => LINGERING_TUNES_CLOCK }],
});
const LINGERING_TUNES_CLOCK: Buff = new Buff({
  tick: { every: 90, fire: () => applyCurrent(LINGERING_TUNES_STACKS, 1) },
  updateBuffs: () => lostOnSwap(),
});
export const LINGERING_TUNES_STACKS = new Buff({
  name: "Lingering Tunes 5pc", maxStacks: 4,
  stats: [[Stat.BonusAtk, 5]], perStack: true,
  updateBuffs: () => lostOnSwap(),
  display: () => `Lingering Tunes x${frozenStacks()}`,
});

/** Thundering Mephis (plain) — six strikes and the thunder off the last, then +12% Electro / +12%
 *  Resonance Liberation DMG Bonus for 15s after the final hit. */
export const THUNDERING_MEPHIS = new Mainslot({
  id: 390080003,
  name: "Thundering Mephis",
  cost: 4,
});
export const ACTION_THUNDERING_MEPHIS_1 = new TransformEcho("Echo - Thundering Mephis 1", {
  mainslot: THUNDERING_MEPHIS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 29,
  cooldown: 60 * 20,
  bullets: [{ hitFrame: 6, mv: 13261, energy: 207 }],
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_THUNDERING_MEPHIS_2 = new TransformEcho("Echo - Thundering Mephis 2", {
  mainslot: THUNDERING_MEPHIS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 29, chains: [ACTION_THUNDERING_MEPHIS_1.press],
  bullets: [{ hitFrame: 11, mv: 13261, energy: 207 }],
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_THUNDERING_MEPHIS_3 = new TransformEcho("Echo - Thundering Mephis 3", {
  mainslot: THUNDERING_MEPHIS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 29, chains: [ACTION_THUNDERING_MEPHIS_2.press],
  bullets: [{ hitFrame: 8, mv: 13261, energy: 207 }],
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_THUNDERING_MEPHIS_4 = new TransformEcho("Echo - Thundering Mephis 4", {
  mainslot: THUNDERING_MEPHIS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 38, chains: [ACTION_THUNDERING_MEPHIS_3.press],
  bullets: [{ hitFrame: 16, mv: 13261, energy: 207 }],
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_THUNDERING_MEPHIS_5 = new TransformEcho("Echo - Thundering Mephis 5", {
  mainslot: THUNDERING_MEPHIS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 29, chains: [ACTION_THUNDERING_MEPHIS_4.press],
  bullets: [{ hitFrame: 11, mv: 13261, energy: 207 }],
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_THUNDERING_MEPHIS_6 = new TransformEcho("Echo - Thundering Mephis 6", {
  mainslot: THUNDERING_MEPHIS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 114, chains: [ACTION_THUNDERING_MEPHIS_5.press],
  // the final strike, then wuwalab's three thunders
  bullets: [{ hitFrame: 42, mv: 18944, energy: 296 }, ...[55, 59, 65].map((f) => ({ hitFrame: f, mv: 3156, energy: 49 }))],
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
  afterHit: () => { if (lastHit()) applyCurrent(THUNDERING_MEPHIS_WINDOW, 1); },
});
export const THUNDERING_MEPHIS_WINDOW = new Buff({
  name: "Thundering Mephis", duration: 60 * 15,
  stats: [[Stat.DmgBonus, 12, Attribute.Electro], [Stat.DmgBonus, 12, Type.Liberation]],
});

/** Tempest Mephis (plain) — the tail swing's lightning, then a claw, then +12% Electro / +12% Heavy
 *  Attack DMG Bonus for 15s after the claw hits. The text gives no strike count for the lightning
 *  ("each time"): wuwalab's four. */
export const TEMPEST_MEPHIS = new Mainslot({
  id: 6000039,
  name: "Tempest Mephis",
  cost: 4,
});
export const ACTION_TEMPEST_MEPHIS_1 = new TransformEcho("Echo - Tempest Mephis 1", {
  mainslot: TEMPEST_MEPHIS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 63,
  cooldown: 60 * 20,
  bullets: [44, 64, 83, 102].map((f) => ({ hitFrame: f, mv: 10248, energy: 160 })),
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
});
export const ACTION_TEMPEST_MEPHIS_2 = new TransformEcho("Echo - Tempest Mephis 2", {
  mainslot: TEMPEST_MEPHIS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 72, chains: [ACTION_TEMPEST_MEPHIS_1.press],
  bullets: [{ hitFrame: 28, mv: 17568, energy: 274 }],
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
  afterHit: () => applyCurrent(TEMPEST_MEPHIS_WINDOW, 1),
});
export const TEMPEST_MEPHIS_WINDOW = new Buff({
  name: "Tempest Mephis", duration: 60 * 15,
  stats: [[Stat.DmgBonus, 12, Attribute.Electro], [Stat.DmgBonus, 12, Type.Heavy]],
});

/** Nightmare: Thundering Mephis — Void Thunder's own Overlord-class mainslot echo (Xiangli Yao's
 *  pick). Flat Electro/Liberation DMG Bonus, no trigger. */
export const NM_MEPHIS = new Mainslot({
  id: 6000088,
  name: "Nightmare: Thundering Mephis",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Electro], [Stat.DmgBonus, 12, Type.Liberation]],
});
export const ACTION_NM_MEPHIS = new TransformEcho("Echo - Nightmare: Thundering Mephis", {
  mainslot: NM_MEPHIS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 92,
  bullets: [{ hitFrame: 59, mv: 40500, energy: 562 }],
  cooldown: 60 * 25,
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
});

/** Nightmare: Tempest Mephis — the other Overlord-class Mephis (Yinlin's pick, carries Empyrean
 *  Anthem too). Flat Electro/Resonance Skill DMG Bonus, no trigger. */
export const NM_TEMPEST_MEPHIS = new Mainslot({
  id: 6000089,
  name: "Nightmare: Tempest Mephis",
  cost: 4,
  stats: [[Stat.DmgBonus, 12, Attribute.Electro], [Stat.DmgBonus, 12, Type.Skill]],
});
export const ACTION_NM_TEMPEST_MEPHIS = new TransformEcho("Echo - Nightmare: Tempest Mephis", {
  mainslot: NM_TEMPEST_MEPHIS, castPosition: Position.Grounded, endPosition: Position.Grounded, animFrames: 219,
  bullets: [{ hitFrame: 138, mv: 40500, energy: 562 }],
  cooldown: 60 * 25,
  element: Attribute.Electro, scaling: Scaling.Atk, type: Type.Echo,
});

/** Void Thunder, a generic electro sonata. 2pc: +10% Electro DMG Bonus flat. 5pc: +15% Electro
 *  DMG Bonus per stack on releasing Heavy Attack or Resonance Skill, up to 2 stacks, 15s a stack
 *  — lost after its own outro rather than modelled with literal per-stack decay. The stacks live
 *  on their own Buff, not the Sonata: revoking the gear itself would unequip the set for good. */
export const VOID_THUNDER_2PC = new Sonata2pc({ id: 3, name: "Void Thunder 2pc", echoes: [TEMPEST_MEPHIS, NM_MEPHIS, NM_TEMPEST_MEPHIS, THUNDERING_MEPHIS], stats: [[Stat.DmgBonus, 10, Attribute.Electro]] });
export const VOID_THUNDER_STACKS = new Buff({
  name: "Void Thunder 5pc: Electro", maxStacks: 2, duration: 60 * 15,
  stats: [[Stat.DmgBonus, 15, Attribute.Electro]], perStack: true,
});
export const VOID_THUNDER_5PC = new Sonata({
  id: 3,
  name: "Void Thunder 5pc",
  sonata2pc: VOID_THUNDER_2PC,
  grants: [{ on: onCast(Cast.Heavy, Cast.Skill), buff: VOID_THUNDER_STACKS }],
});

/** Fallacy, a generic HP-scaling spectro mainslot echo. Its cast puts up a team-wide +10% ATK,
 *  gone the moment its own wearer casts an Intro. The wearer's own +10% ER reads that same
 *  buff's own uptime rather than firing only on the cast. The revoke lives on `FALLACY` (local,
 *  so it only ever sees its own wearer's turn), not on the global `FALLACY_TEAM` itself. */
export const FALLACY = new Mainslot({
  id: 6000060,
  name: "Fallacy of No Return",
  cost: 4,
  updateBuffs: () => { if (casting(Cast.Intro)) revokeTeam(FALLACY_TEAM); },
  applyStats: () => { if (stacksOfTeam(FALLACY_TEAM)) addStat(Stat.ER, 10); },
});
export const ACTION_FALLACY = new SummonEcho("Echo - Fallacy of No Return", {
  mainslot: FALLACY, cooldown: 60 * 20,
  element: Attribute.Spectro, scaling: Scaling.Hp, type: Type.Echo, bullets: [{ hitFrame: 42, commitFrame: 0, mv: 1585, energy: 304 }],
  updateBuffs: () => applyTeam(FALLACY_TEAM, 1),
});

export const FALLACY_TEAM = new Buff({ name: "Fallacy of No Return", duration: 60 * 20, stats: [[Stat.BonusAtk, 10]] });

