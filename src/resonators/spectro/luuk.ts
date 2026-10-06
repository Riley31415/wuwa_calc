/**
 * Luuk Herssen — a Spectro Gauntlets main DPS whose whole kit is Basic Attack DMG, and the third
 * kit on the Tune Break variants (see tunebreak.ts). He both inflicts Tune Strain - Shifting (his
 * Intro, Golden Reflux, every form of Aureole of Execution, and the Scythe: Resection mid-air line)
 * and answers Tune Strain - Interfered the way Lynae and Mornye do: 0.12% total DMG per point of
 * his Tune Break Boost per stack on the target, whose stack cap he raises by 1.
 *
 * Ichor Flow (forte1, 0-300) is the gauge everything turns on. Full Flow enters Aureate Judge,
 * where every Aureole form hits for +110% MV and spends 100 Flow, Flow stops restoring, and the
 * state ends when the gauge empties; an Aureate Glare also marks the next Gavel of Earthshaker and
 * its Ichor Deposit for +110%. All of that is stat contributions from the one AUREATE_JUDGE buff onto
 * the one set of base actions — nanoka's Aureate rows carry identical energy/concerto and a flat
 * +25 200 off-tune per cast on top of the base, so that is what the buff adds. Golden Rule hands
 * him 200 Flow and 12 Concerto whenever a teammate's Outro brings him in, which with the Intro's
 * own 100 is exactly what fills the gauge — so his loop runs entirely in Aureate Judge.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1510), per-hit × hit count as CLAUDE.md
 * describes, with the flat Concerto Regen rows folded in (Liberation 20, Intro 10, Gavel 10) and the
 * hidden +10 on both Dodge Counters. Ichor Flow: the Intro's 100, Golden Rule's 200 and the Aureate
 * spend of 100 are kit text; every per-hit restore is wuwalab's frame data (api.wuwalab.com
 * /api/app/characters/luukherssen, `forte_1` per hit in the same x100 units as energy — a hit's
 * Flow is its energy x10), summed per action the same way the MVs are.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, Position } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  addStat,
  applyCurrent,
  casting,
  currentCast, currentHit,
  runningAction,
  forte1,
  getStat,
  maxStackIncrease,
  queue,
  revokeCurrent,
  frozenStacks,
  stacksOfEnemy,
  applyEnemy,
  applyTeam,
  isHeld,
  stacksOf,
  lostOnSwap,
  addGain,
  currentMember,
  previousPress,
  runningAnyOf,
  saveChain,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, START_LAST, INTRO, OUTRO, DODGE } from "../../engine/rotation.js";
import { applied } from "../../engine/context.js";
import { TUNE_STRAIN_SHIFTING, tuneBreak, midairBreak } from "../../shared/tunebreak.js";
import { applyStrain, TUNE_BREAK, TUNE_STRAIN_INTERFERED, TUNE_SHIFTABLE, strainPayout } from "../../shared/tunebreak.js";
import { DAYBREAKERS_SPINE } from "../../weapons/gauntlet.js";
import { NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import {
  NEBULOUS_CANNON,
  GILDED_REVELATION_5PC,
} from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

/** The form cycle Ring -> Breach -> Glare; "switching to another Resonator resets the cycle". */
const BREACH_NEXT = new Buff({ name: "Luuk: Aureole Breach Next", lostOnSwap: true });
const GLARE_NEXT = new Buff({ name: "Luuk: Aureole Glare Next", lostOnSwap: true });
/** "Casting Basic Attack Stage 4 or Mid-air Attack Stage 3 replaces Resonance Skill with Aureole of
 *  Execution": armed by those casts as the form the cycle is on, spent by it, gone on swap-out. */
const RING_READY = new Buff({ name: "Luuk: Aureole Ring Ready", lostOnSwap: true });
const BREACH_READY = new Buff({ name: "Luuk: Aureole Breach Ready", lostOnSwap: true });
const GLARE_READY = new Buff({ name: "Luuk: Aureole Glare Ready", lostOnSwap: true });
const ARM_AUREOLE = {
  updateBuffs: () => {
    if (isHeld(GLARE_NEXT)) applyCurrent(GLARE_READY, 1);
    else applyCurrent(isHeld(BREACH_NEXT) ? BREACH_READY : RING_READY, 1);
  },
};
/** Ring/Breach: "The next Normal Attack triggers Basic Attack - Golden Impale", lost to a mid-air
 *  Dodge Counter or a swap-out. */
const IMPALE_READY = new Buff({ name: "Luuk: Golden Impale Ready", lostOnSwap: true });
/** Glare's Solid-State Ichor "hurled out" opens Gavel of Earthshaker, lost to his Liberation or a
 *  swap-out. */
const GAVEL_READY = new Buff({ name: "Luuk: Gavel of Earthshaker Ready", lostOnSwap: true });

function luukAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Such is Light, the ground chain. Stage 3 hurls a whirling blade (5.02% x30, taken at the
//     table's own full count); Stage 4 is what replaces Resonance Skill with Aureole of Execution.
const BA1 = luukAction("Basic - Such is Light 1", { animFrames: 31, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 4056, energy: 60, concerto: 120, offtune: 1920, forte1: 600 },
    { hitFrame: 21, mv: 4056, energy: 60, concerto: 120, offtune: 1920, forte1: 600 },
  ]});
const BA2 = luukAction("Basic - Such is Light 2", { chains: [BA1], animFrames: 56, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 6016, energy: 89, concerto: 178, offtune: 2848, forte1: 890 },
    { hitFrame: 51, mv: 9024, energy: 134, concerto: 267, offtune: 4272, forte1: 1335 },
  ]});
// the ground Dodge Counter: "Press Normal Attack right after casting this skill to cast Basic Attack Stage 3"
const BA3 = luukAction("Basic - Such is Light 3", { chains: () => [BA2, DC], animFrames: 56, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 33, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 35, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 40, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 46, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 52, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 59, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 64, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 70, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 76, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 82, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 89, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 94, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 100, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 106, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 112, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 119, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 124, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 130, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 136, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 142, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 149, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 154, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 160, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 166, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 172, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 179, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 184, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 190, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 196, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
    { hitFrame: 202, commitFrame: 21, mv: 502, energy: 8, concerto: 15, offtune: 237, forte1: 75 },
  ]});
const BA4 = luukAction("Basic - Such is Light 4", { chains: [BA3], ...ARM_AUREOLE, animFrames: 39, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 21, mv: 9633, energy: 143, concerto: 285, offtune: 4560, forte1: 1425 }]});
// "Hold [LeftMouseButton] on the ground and consume STA to jump to the air"
const HA = luukAction("Heavy - Such is Light", { castPosition: Position.Grounded, endPosition: Position.Midair, animFrames: 60, animPriority: { 34: 0 }, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 24, mv: 9126, energy: 135, concerto: 270, offtune: 4320, forte1: 1350 }]});
const DC = luukAction("Dodge Counter - Such is Light", { chains: [DODGE], castPosition: Position.Grounded, animFrames: 56, animPriority: { 0: 5 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 50, mv: 25180, energy: 224, concerto: 1746, offtune: 7120, forte1: 1113 }]});

// --- the mid-air chain. Stage 2 and 3 come in two forms by input: Scythe: Dissection (Normal
//     Attack) or Scythe: Resection (Jump), the latter inflicting Tune Strain - Shifting. Stage 3
//     of either is what replaces Resonance Skill with Aureole of Execution.
const MA1 = luukAction("Mid-air - Such is Light 1", { castPosition: Position.Midair, animFrames: 37, animPriority: { 25: 0 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 10, mv: 5746, energy: 85, concerto: 170, offtune: 2720, forte1: 850 }]});
// either input picks each of Stage 2 and 3, and the Intro opens the chain at Stage 2
const MA2 = luukAction("Mid-air - Scythe: Dissection 2", { chains: () => [MA1, Intro], castPosition: Position.Midair, animFrames: 27, animPriority: { 32: 0 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 2823, energy: 42, concerto: 75, offtune: 1200, forte1: 375 },
    { hitFrame: 17, mv: 2823, energy: 42, concerto: 75, offtune: 1200, forte1: 375 },
    { hitFrame: 27, mv: 3763, energy: 56, concerto: 100, offtune: 1600, forte1: 500 },
  ]});
const MA3 = luukAction("Mid-air - Scythe: Dissection 3", { chains: () => [MA2, MA2R], castPosition: Position.Midair, animFrames: 72, animPriority: { 0: 5, 52: 0 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 4293, energy: 82, concerto: 119, offtune: 1896, forte1: 593 },
    { hitFrame: 18, mv: 4293, energy: 82, concerto: 119, offtune: 1896, forte1: 593 },
    { hitFrame: 64, mv: 5724, energy: 109, concerto: 158, offtune: 2528, forte1: 790 },
  ], ...ARM_AUREOLE });
// Resection 2/3, Golden Reflux, every Aureole of Execution and his Intro lay Tune Strain - Shifting
const STRAIN = { updateDebuffs: () => applyStrain() };
/** What every Aureole of Execution form carries: the kit's own Tune Strain, the replaced Skill it
 *  needs, and the Endnote the cast banks (see ENDNOTES). `next` is the form the cycle moves to. */
const aureole = (next: Buff | null, impale: boolean) => ({
  ...STRAIN,
  updateBuffs: () => {
    applyCurrent(ENDNOTES, 1);
    revokeCurrent(RING_READY);
    revokeCurrent(BREACH_READY);
    revokeCurrent(GLARE_READY);
    revokeCurrent(BREACH_NEXT);
    revokeCurrent(GLARE_NEXT);
    if (next) applyCurrent(next, 1);
    if (impale) applyCurrent(IMPALE_READY, 1);
  },
});
const MA2R = luukAction("Mid-air - Scythe: Resection 2", { chains: () => [MA1, Intro], castPosition: Position.Midair, animFrames: 30, animPriority: { 34: 0 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 13, mv: 5042, energy: 75, concerto: 135, offtune: 2160, forte1: 675 },
    { hitFrame: 30, mv: 5042, energy: 75, concerto: 135, offtune: 2160, forte1: 675 },
  ], ...STRAIN });
const MA3R = luukAction("Mid-air - Scythe: Resection 3", { chains: [MA2, MA2R], castPosition: Position.Midair, animFrames: 66, animPriority: { 0: 5, 55: 2, 66: 0 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 7492, energy: 141, concerto: 208, offtune: 3320, forte1: 1038 },
    { hitFrame: 47, mv: 7492, energy: 141, concerto: 208, offtune: 3320, forte1: 1038 },
  ], ...STRAIN, ...ARM_AUREOLE });
// "Stage 4 is a Plunging Attack", also held in mid-air at any point, so it follows anything
const MA4 = luukAction("Mid-air - Such is Light 4 Plunge", { castPosition: Position.Midair, endPosition: Position.Grounded, animFrames: 60, animPriority: { 2: 3, 38: 3 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 40, mv: 10478, energy: 155, concerto: 100, offtune: 4960, forte1: 1550 }]});
const MDC = luukAction("Dodge Counter - Such is Light (Mid-Air)", { chains: [DODGE], castPosition: Position.Midair, animPriority: { 0: 5 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 25687, energy: 230, concerto: 760, offtune: 7360, forte1: 2300 }], castConcerto: 1000,
  updateBuffs: () => revokeCurrent(IMPALE_READY),
});

// --- Reunion of All the Fallen. Golden Reflux is the plain Resonance Skill (2 charges); after
//     Basic Stage 4 / Mid-air Stage 3 it becomes Aureole of Execution, cycling Ring -> Breach ->
//     Glare, every form Basic Attack DMG, each inflicting Tune Strain - Shifting and banking an
//     Endnote. Ring and Breach reset the mid-air chain and make the next Normal Attack a Golden
//     Impale; Breach also hurls an Ichor Blade; Glare lays the Ichor Deposit that Gavel of
//     Earthshaker detonates.
// Golden Reflux: 2 charges on an 8s recharge; S5 takes 2s off and adds a third
const SKILL_CD = new Cooldown({ frames: () => (isHeld(LK_S5) ? 60 * 6 : 60 * 8), charges: () => (isHeld(LK_S5) ? 3 : 2) });
// "press [E] to jump to the air and flash toward the target"
const Skill = luukAction("Skill - Golden Reflux", { endPosition: Position.Midair, animFrames: 68, animPriority: { 68: 0 }, castPriority: 5, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 46, mv: 20120, energy: 230, concerto: 460, offtune: 7360, forte1: 2300 }], ...STRAIN });
const Ring = luukAction("Skill - Aureole of Execution: Ring", { animFrames: 81, castPriority: 5, node: Node.Skill, cast: Cast.Skill, type: Type.Basic, bullets: [
    { hitFrame: 15, mv: 2656, energy: 96, concerto: 120, offtune: 1248, forte1: 390 },
    { hitFrame: 21, mv: 2656, energy: 96, concerto: 120, offtune: 1248, forte1: 390 },
    { hitFrame: 27, mv: 2656, energy: 96, concerto: 120, offtune: 1248, forte1: 390 },
    { hitFrame: 33, mv: 2656, energy: 96, concerto: 120, offtune: 1248, forte1: 390 },
    { hitFrame: 39, mv: 2656, energy: 96, concerto: 120, offtune: 1248, forte1: 390 },
    { hitFrame: 46, mv: 8853, energy: 320, concerto: 400, offtune: 4160, forte1: 1300 },
  ], requireBuff: RING_READY, ...aureole(BREACH_NEXT, true) });
const Breach = luukAction("Skill - Aureole of Execution: Breach", { animFrames: 81, castPriority: 5, node: Node.Skill, cast: Cast.Skill, type: Type.Basic, bullets: [
    { hitFrame: 33, mv: 9591, energy: 267, concerto: 334, offtune: 3440, forte1: 1075 },
    { hitFrame: 39, mv: 9591, energy: 267, concerto: 334, offtune: 3440, forte1: 1075 },
    { hitFrame: 45, mv: 9591, energy: 267, concerto: 334, offtune: 3440, forte1: 1075 },
  ], requireBuff: BREACH_READY, ...aureole(GLARE_NEXT, true) });
const Glare = luukAction("Skill - Aureole of Execution: Glare", { animFrames: 106, animPriority: { 49: 0 }, castPriority: 5, node: Node.Skill, cast: Cast.Skill, type: Type.Basic, bullets: [
    { hitFrame: 50, mv: 35411, energy: 600, concerto: 1000, offtune: 7840, forte1: 2450, updateDebuffs: () => applyCurrent(GAVEL_READY, 1) },
  ], requireBuff: GLARE_READY, ...aureole(null, false) });
const GoldenImpale = luukAction("Basic - Golden Impale", { requireBuff: IMPALE_READY, updateBuffs: () => revokeCurrent(IMPALE_READY), animFrames: 68, animPriority: { 68: 0 }, castPriority: 5, node: Node.Skill, cast: Cast.Skill, type: Type.Basic, bullets: [{ hitFrame: 46, mv: 15547, energy: 230, concerto: 460, offtune: 7360, forte1: 2300 }]});
/** Detonates 5s after Glare lays it, or the moment a Gavel of Earthshaker lands on it — queued
 *  off the Gavel here, since the rotation always follows a Glare with one. */
const IchorDeposit = luukAction("Skill - Ichor Deposit", { animFrames: 0, node: Node.Skill, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 15345 }]});

// --- Spark from the Frost. Gavel of Earthshaker is the mid-air slam a Glare opens up; it
//     detonates the Deposit, and its Concerto is all the flat regen row (the hit itself carries 0).
// "press Normal Attack in mid-air" ... "Slam down from the air"
const Gavel = luukAction("Mid-air - Gavel of Earthshaker", {
  castPosition: Position.Midair, endPosition: Position.Grounded, animFrames: 41, animPriority: { 18: 6, 28: 3 }, castPriority: 2,
  node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 26, mv: 30690, energy: 600, offtune: 8080, forte1: 2525 }], castConcerto: 1000,
  requireBuff: GAVEL_READY,
  updateBuffs: () => revokeCurrent(GAVEL_READY),
  updateDebuffs: () => queue(IchorDeposit),
});

/** Ichor Blade: 10 flat Spectro DMG every 0.15s for 5s, counted as Basic Attack DMG but immune to
 *  every bonus — Scaling.Fixed, in the same x100 units Roccia's own fixed hit uses. Taken at the
 *  table's full 5s (33 ticks); in play it vanishes on his next damaging cast, so this is its
 *  ceiling — at 330 damage a summon, nothing turns on it. Hurled by the Intro and by Breach. */
const IchorBlade = luukAction("Forte - Ichor Blade", { animFrames: 357, node: Node.Forte, type: Type.Basic, scaling: Scaling.Fixed, bullets: [
    { hitFrame: 60, mv: 971 },
    { hitFrame: 69, mv: 971 },
    { hitFrame: 78, mv: 971 },
    { hitFrame: 87, mv: 971 },
    { hitFrame: 96, mv: 971 },
    { hitFrame: 105, mv: 971 },
    { hitFrame: 114, mv: 971 },
    { hitFrame: 123, mv: 971 },
    { hitFrame: 132, mv: 971 },
    { hitFrame: 141, mv: 971 },
    { hitFrame: 150, mv: 971 },
    { hitFrame: 159, mv: 971 },
    { hitFrame: 168, mv: 971 },
    { hitFrame: 177, mv: 971 },
    { hitFrame: 186, mv: 971 },
    { hitFrame: 195, mv: 971 },
    { hitFrame: 204, mv: 971 },
    { hitFrame: 213, mv: 971 },
    { hitFrame: 222, mv: 971 },
    { hitFrame: 231, mv: 971 },
    { hitFrame: 240, mv: 970 },
    { hitFrame: 249, mv: 970 },
    { hitFrame: 258, mv: 970 },
    { hitFrame: 267, mv: 970 },
    { hitFrame: 276, mv: 970 },
    { hitFrame: 285, mv: 970 },
    { hitFrame: 294, mv: 970 },
    { hitFrame: 303, mv: 970 },
    { hitFrame: 312, mv: 970 },
    { hitFrame: 321, mv: 970 },
    { hitFrame: 330, mv: 970 },
    { hitFrame: 339, mv: 970 },
    { hitFrame: 348, mv: 970 },
    { hitFrame: 357, mv: 970 },
  ]});

const Liberation = luukAction("Liberation - Rewritten in Winter's Margins", {
  endPosition: Position.Midair, animFrames: 247, animPriority: { 250: 0 }, castPriority: 10, timestop: [0, 247], motionStop: [0, 247], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Basic, bullets: [
    { hitFrame: 230, mv: 74554, offtune: 50400 },
    { hitFrame: 232, mv: 4971, offtune: 3360 },
    { hitFrame: 234, commitFrame: 232, mv: 4971, offtune: 3360 },
    { hitFrame: 237, commitFrame: 232, mv: 4971, offtune: 3360 },
    { hitFrame: 239, commitFrame: 232, mv: 4971, offtune: 3360 },
    { hitFrame: 242, commitFrame: 232, mv: 4971, offtune: 3360 },
  ], castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => revokeCurrent(GAVEL_READY),
});

// "Press Normal Attack after this skill to cast Mid-air Attack Stage 2": it leaves him in the air
const Intro = luukAction("Intro - Before Injection of Dawn", {
  endPosition: Position.Midair, qteFrames: 23, animFrames: 75, noSwapFrames: 57, animPriority: { 73: 0 }, castPriority: 11, motionStop: [5, 25],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 27, mv: 7267, energy: 334, offtune: 3440 },
    { hitFrame: 33, mv: 7267, energy: 334, offtune: 3440 },
    { hitFrame: 39, mv: 7267, energy: 334, offtune: 3440, forte1: 10000 },
  ], castConcerto: 1000, ...STRAIN,
  // updateBuffs: () => applyCurrent(DAWNLIT_KEEP, 1),  // DAWNLIT_KEEP grants no stat and nothing reads it
});
const Outro = luukAction("Outro - Bow to the Last Light", {
  animFrames: 0,
  cast: Cast.Outro, type: Type.Outro, bullets: [{ hitFrame: 0, mv: 50000 }], minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => applyCurrent(GOLDEN_RULE),
});

/** The mid-air chain's stages ahead of its plunge, the cycle a press between them keeps. */
const MIDAIR_CYCLE = new Set<Action>([MA1, MA2, MA3, MA2R, MA3R]);

/** Every form of Aureole of Execution — what banks an Endnote. */
const isAureole = (): boolean => runningAction(Ring) || runningAction(Breach) || runningAction(Glare);

/* ------------------------------------------------------------------------------------- buffs */

/** Aureate Judge: entered at full Ichor Flow (300). While it's up, every Aureole form hits for
 *  +110% MV, banks the flat +25 200 off-tune nanoka's Aureate rows add over the base, and spends
 *  100 Flow; Flow doesn't restore — every positive Flow delta an action declares is cancelled back
 *  out here. It ends once the gauge empties, except that the Gavel of Earthshaker and Ichor Deposit
 *  an Aureate Glare marks (+110% MV, the Gavel's own +25 200 too) are still paid as part of the
 *  state — one beat longer rather than a separate mark buff. */
const AUREATE_JUDGE = new Buff({
  name: "Luuk: Aureate Judge",
  updateBuffs: () => {
    // a Tune Break landing between the Glare and its Gavel/Deposit isn't his cast, so it can't close it
    if (forte1() <= 0 && !runningAction(Gavel) && !runningAction(IchorDeposit) && !runningAction(TUNE_BREAK)) {
      revokeCurrent(AUREATE_JUDGE);
      return;
    }
    if (isAureole()) addGain({ forte1: -10000 });
  },
  updateDebuffs: () => {
    const hit = currentHit();
    if (hit.forte1 > 0) addGain({ forte1: -hit.forte1 });
    // a flat 25,200 a press, on its first hit
    if ((isAureole() || runningAction(Gavel)) && hit.index === 0) addGain({ offtune: 25200 });
  },
  applyStats: () => {
    if (isAureole() || runningAction(Gavel)) addStat(Stat.MulMv, 110);
    if (runningAction(IchorDeposit)) addStat(Stat.MulMv, 110);
  },
});

/** Endnotes on the Endgame: every Aureole cast banks a stack, 3 max, each +25% to the Liberation's
 *  own DMG Multiplier; the Liberation spends them all, and switching out drops them. */
const ENDNOTES = new Buff({
  name: "Luuk: Endnotes on the Endgame", maxStacks: 3,
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 25 * frozenStacks()); },
  updateBuffs: () => lostOnSwap(),
  afterAction: () => { if (runningAction(Liberation)) revokeCurrent(ENDNOTES); },
});

/** Golden Rule: a teammate's Outro that brings Luuk in hands him 200 Ichor Flow and 12 Concerto —
 *  once per 24s, which at the length these loops run is every loop. He is always brought in that
 *  way, so it's simply armed on his own Outro (and at combat start, for his first entry) and paid
 *  on the Intro that follows. */
const GOLDEN_RULE = new Buff({
  name: "Luuk: Golden Rule",
  updateBuffs: () => {
    if (!casting(Cast.Intro)) return;
    addGain({ forte1: 20000, concerto: 1200 });
    revokeCurrent(GOLDEN_RULE);
  },
});

/** Uncaused Diagnosis, the ATK half: any nearby teammate (himself included) inflicting Tune Strain
 *  - Shifting or dealing Tune Break DMG gives him +25% ATK for 20s — a short self buff, lost after
 *  his outro. "Nearby", so it lands whether or not he's on field. */
const UNCAUSED_DIAGNOSIS_ATK = new Buff({
  name: "Inherent: Uncaused Diagnosis",
  duration: 60 * 20,
  stats: [[Stat.BonusAtk, 25]],
});

/** Dawnlit Keep: one stack, granted by his Intro (or 4s out of combat), spent on taking a hit for
 *  -60% DMG taken and interruption immunity — purely defensive, so it holds no stat here. */
const DAWNLIT_KEEP = new Buff({ name: "Luuk: Dawnlit Keep", maxStacks: 1 });

/* --------------------------------------------------------------------------- kit and loadout */

/** Pulses Under the Snow (Inherent Skill): Perpetuating Daytime is banked off the team *defeating*
 *  targets under Tune Strain - Interfered and spent re-applying those stacks on the next Tune
 *  Break. A single-target rotation never defeats anything, so nothing here can ever fire — the
 *  piece is present for the kit's shape and contributes nothing. */
const LK_INHERENT_1 = new Inherent({ name: "Inherent: Pulses Under the Snow" });

/** Uncaused Diagnosis (Inherent Skill): against a target under Tune Strain - Interfered, every 10
 *  points of his Tune Break Boost amplifies his own hits by 5%, up to 30% — read live in convertStats()
 *  so every Tbb contribution has landed (the era's flat 10, Reel's +20, ...). The ATK half watches
 *  the whole team's hits from hitGlobal(), see UNCAUSED_DIAGNOSIS_ATK. */
const LK_INHERENT_2 = new Inherent({
  name: "Inherent: Uncaused Diagnosis",
  hitGlobal: () => {
    if (applied(TUNE_STRAIN_SHIFTING) || runningAction(TUNE_BREAK)) applyCurrent(UNCAUSED_DIAGNOSIS_ATK, 1);
  },
  // late, like every Tune Break Boost read — a team's own Tbb can arrive from another gear's
  // convertStats (Denia's Etched Colors), which an ordinary convertStats here would race
  lateConvertStats: () => {
    if (stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0) addStat(Stat.Amp, Math.min(30, 5 * Math.floor(getStat(Stat.TBB) / 10)));
  },
});

const LUUK_TALENTS = new Talent({
  name: "Luuk: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

/** This kit's own carrier for the Tune Strain payout (tunebreak.ts's `strainPayout`). */
const LK_STRAIN_PAYOUT = strainPayout();

export const LUUK_RESONATOR = new Resonator({
  name: "Luuk Herssen",
  talent: LUUK_TALENTS,
  inherent1: LK_INHERENT_1,
  inherent2: LK_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Gauntlets,
  color: "#ddb246",
  intro: Intro,
  outro: Outro,
  swapIn: BA1,
  swapInAir: MA1,
  // his break leaves him in mid-air
  tuneBreak: midairBreak(tuneBreak(94, [0, 94], [0, 70], [[72, 160000]], { 0: 11, 90: 0 })),
  maxEnergy: 12500,
  forteScale: [0.01, 1, 1, 1, 1],
  maxForte1: 30000,

  // his kit raises the target's Tune Strain - Interfered limit by 1 on top of the base 1; Golden
  // Rule is armed from the start so his first Intro is brought in the same way every later one is
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1);
    applyCurrent(GOLDEN_RULE, 1);
    applyCurrent(LK_STRAIN_PAYOUT, 1);
    applyEnemy(TUNE_SHIFTABLE, 1);
  },

  updateBuffs: () => {
    if (forte1() >= 30000) applyCurrent(AUREATE_JUDGE, 1);
    // "while in mid-air, this skill's cycle will not be reset": a press between mid-air stages keeps
    // the stage before it, except Ring and Breach, which reset the cycle to Stage 1
    if (currentMember().position !== Position.Midair || runningAnyOf(MIDAIR_CYCLE) || runningAction(Ring) || runningAction(Breach)) return;
    for (let p = previousPress(); p; p = p.cancelOf ?? p.formOf) {
      if (MIDAIR_CYCLE.has(p)) saveChain(p);
    }
  },

  stats: [
    [Stat.BaseHp, 10300], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1112.2202],
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    [Stat.TBB, 10],
  ],
});

/* --------------------------------------------------------------------------------- sequences */

/** Every cast the kit calls a Mid-air Attack — the chain, both Scythe forms, and the Gavel, which
 *  its own page names one even though this file files it under the Forte node. */
const midAir = (): boolean => runningAction(MA1) || runningAction(MA2) || runningAction(MA3)
  || runningAction(MA2R) || runningAction(MA3R) || runningAction(MA4) || runningAction(Gavel);

/** S1: +150% Mid-air Attack DMG Bonus. The Dawnlit Keep half is a shield charge — no stat here,
 *  and nothing reads the buff. */
const LK_S1 = new Sequence({
  name: "Luuk S1: Gold Kindled in Ash",
  applyStats: () => { if (midAir()) addStat(Stat.DmgBonus, 150); },
});

/** S2: the Liberation +60% multiplier — additive with Endnotes' own, which the node says outright
 *  and nanoka's rows confirm (1839.00% at one Endnote against 994.09% base, so 1 + 0.6 + 0.25) —
 *  and Uncaused Diagnosis doubled: 10% a 10 points of Tune Break Boost to a 60% cap, which is the
 *  base reading again on top of itself. */
const LK_S2 = new Sequence({
  name: "Luuk S2: Avalanche Roaring in Eyes",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 60); },
  lateConvertStats: () => {
    if (stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0) addStat(Stat.Amp, Math.min(30, 5 * Math.floor(getStat(Stat.TBB) / 10)));
  },
});

/** S3: +136% multiplier on every Aureole form in Aureate Judge, and on the Gavel and Ichor Deposit
 *  a Glare marks — additive with the state's own +110%, which nanoka's third row for each hit gives
 *  exactly (Ring 766.90% against 221.33%, so x3.46). Perpetuating Daytime never fires here. */
const LK_S3 = new Sequence({
  name: "Luuk S3: Spine Tempered by Golden Rain",
  applyStats: () => {
    if (!isHeld(AUREATE_JUDGE)) return;
    if (isAureole() || runningAction(Gavel) || runningAction(IchorDeposit)) addStat(Stat.MulMv, 136);
  },
});

/** S4: +20% DMG to the whole team for 20s off any member's Tune Break — one lands every loop, so
 *  it never lapses. */
const PULSE_UNDER_RIME = new Buff({ name: "Luuk S4: Pulse Thrumming Under Rime", duration: 60 * 20, stats: [[Stat.DmgBonus, 20]] });
const LK_S4 = new Sequence({
  name: "Luuk S4: Pulse Thrumming Under Rime",
  hitGlobal: () => { if (runningAction(TUNE_BREAK)) applyTeam(PULSE_UNDER_RIME, 1); },
});

/** S5: +80% DMG Bonus on his Intro and Outro, and Golden Reflux at x1.5 — multiplicative, its own
 *  second row (301.80% against 201.20%), and nothing else multiplies it. The extra charge and the
 *  shorter cooldown are on SKILL_CD. */
const LK_S5 = new Sequence({
  name: "Luuk S5: Through the Stillness of Snowstorm",
  applyStats: () => {
    if (runningAction(Intro) || runningAction(Outro)) addStat(Stat.DmgBonus, 80);
    if (runningAction(Skill)) addStat(Stat.MulMv, 50);
  },
});

/** What a team Tune Break leaves for S6: 25s in which the target takes 30% more from every Aureole
 *  form, the Ichor Deposit and the Gavel. One break a loop, so it stands. */
const DAWN_UNFURLING = new Buff({
  name: "Luuk S6: Dawn Unfurling over Frostlands",
  duration: 60 * 25,
  applyStats: () => {
    if (isAureole() || runningAction(IchorDeposit) || runningAction(Gavel)) addStat(Stat.DamageTaken, 30); // unknown if it stacks with strain?
  },
});
/** S6: that window, +40% Liberation DMG Bonus an Endnote to a 120% cap, and two more Tune Strain -
 *  Interfered on the target off every hit of his that lands on one. "Ignores the max stack limit"
 *  has no engine form — the cap is raised by the two it adds instead, which holds the target at
 *  four rather than letting every cast pile on without end. */
const LK_S6 = new Sequence({
  name: "Luuk S6: Dawn Unfurling over Frostlands",
  combatStart: () => maxStackIncrease(TUNE_STRAIN_INTERFERED, 2),
  hitGlobal: () => { if (runningAction(TUNE_BREAK)) applyCurrent(DAWN_UNFURLING, 1); },
  afterAction: () => {
    if (currentCast().bullets.length > 0 && stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0) applyEnemy(TUNE_STRAIN_INTERFERED, 2);
  },
  applyStats: () => {
    if (runningAction(Liberation)) addStat(Stat.DmgBonus, Math.min(120, 40 * stacksOf(ENDNOTES)));
  },
});

const LK_SEQUENCES = [LK_S1, LK_S2, LK_S3, LK_S4, LK_S5, LK_S6];

/* ---------------------------------------------------------------------------------- rotation */

/** The migrated sheet's own line: the Intro (100 Flow) plus Golden Rule (200) fill the gauge, so
 *  the whole loop runs in Aureate Judge — Intro into mid-air Stage 2/3 (Stage 3 opens Aureole),
 *  Ring, the mid-air chain, Breach, chain again, Glare, the marked Gavel (which detonates the
 *  marked Deposit), Liberation at three Endnotes, echo, out. He's always the team's main DPS, so
 *  this covers opener and loop. */

const MA123 = new ActionGroup("Mid-air - Scythe: Dissection 123", [MA1, MA2, MA3]);
const Jump123 = new ActionGroup("Mid-air - Scythe: Resection 123", [MA1, MA2R, MA3R]);

const MA23 = new ActionGroup("Mid-air - Scythe: Dissection 23", [MA2, MA3]);
const Jump23 = new ActionGroup("Mid-air - Scythe: Resection 23", [MA2R, MA3R]);

const LK_ROTATION = new Rotation([
  START_LAST, BA1.instaCancel(), Skill.cancel(), Liberation, MA4.swapCancel(),

  INTRO, Jump23.cancel(), Ring, GoldenImpale,
  Jump123.cancel(), Breach, GoldenImpale,
  Jump123.cancel(), Glare.mashCancel(), Gavel.cancel(),
  Liberation, Skill.instaSwap(), OUTRO,
]);

const LK_ROTATION_16s = new Rotation([
  START_LAST, BA1.instaCancel(), Liberation, MA4.swapCancel(),
  
  INTRO, Jump23.cancel(), Ring, GoldenImpale,
  Jump123.cancel(), Breach, GoldenImpale,
  Jump123.cancel(), Glare.mashCancel(), Gavel.cancel(),
  Liberation, Jump123.cancel(), Ring.instaSwap(), OUTRO,
]);

export const LUUK = new Loadout({
  resonator: LUUK_RESONATOR,
  weapons: [DAYBREAKERS_SPINE, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [
  new EchoLoadout(NEBULOUS_CANNON, GILDED_REVELATION_5PC),
],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Skill, Substat.Heavy),
  rotation: LK_ROTATION,
  sequences: LK_SEQUENCES,
});
export const LUUK_16s = new Loadout({
  resonator: LUUK_RESONATOR,
  weapons: [DAYBREAKERS_SPINE, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [
  new EchoLoadout(NEBULOUS_CANNON, GILDED_REVELATION_5PC),
],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Skill, Substat.Heavy),
  rotation: LK_ROTATION_16s,
  sequences: LK_SEQUENCES,
});
