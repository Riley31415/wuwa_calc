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
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  addStat,
  applyCurrent,
  casting,
  currentAction,
  pressed,
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
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, START_3, ECHO, INTRO } from "../../engine/rotation.js";
import { applied } from "../../engine/context.js";
import { TUNE_STRAIN_SHIFTING, tuneBreak } from "../../shared/tunebreak.js";
import { applyStrain, TUNE_BREAK, TUNE_STRAIN_INTERFERED, strainPayout } from "../../shared/tunebreak.js";
import { DAYBREAKERS_SPINE } from "../../weapons/gauntlet.js";
import { NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import {
  NEBULOUS_CANNON,
  GILDED_REVELATION_5PC,
} from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function luukAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Such is Light, the ground chain. Stage 3 hurls a whirling blade (5.02% x30, taken at the
//     table's own full count); Stage 4 is what replaces Resonance Skill with Aureole of Execution.
const BA1 = luukAction("Basic - Such is Light 1", { animFrames: 31, commitFrames: 21, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 10, mv: 40.56, energy: 0.6, concerto: 1.2, offtune: 1920, forte1: 6 },
    { at: 21, mv: 40.56, energy: 0.6, concerto: 1.2, offtune: 1920, forte1: 6 },
  ]});
const BA2 = luukAction("Basic - Such is Light 2", { animFrames: 56, commitFrames: 51, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 8, mv: 60.16, energy: 0.89, concerto: 1.78, offtune: 2848, forte1: 8.9 },
    { at: 51, mv: 90.24, energy: 1.34, concerto: 2.67, offtune: 4272, forte1: 13.35 },
  ]});
const BA3 = luukAction("Basic - Such is Light 3", { animFrames: 56, commitFrames: 21, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 33, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 35, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 40, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 46, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 52, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 59, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 64, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 70, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 76, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 82, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 89, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 94, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 100, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 106, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 112, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 119, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 124, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 130, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 136, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 142, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 149, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 154, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 160, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 166, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 172, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 179, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 184, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 190, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 196, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
    { at: 202, mv: 5.02, energy: 0.08, concerto: 0.15, offtune: 237, forte1: 0.75 },
  ]});
const BA4 = luukAction("Basic - Such is Light 4", { animFrames: 39, commitFrames: 21, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 21, mv: 96.33, energy: 1.43, concerto: 2.85, offtune: 4560, forte1: 14.25 }]});
const HA = luukAction("Heavy - Such is Light", { animFrames: 60, commitFrames: 24, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [{ at: 24, mv: 91.26, energy: 1.35, concerto: 2.7, offtune: 4320, forte1: 13.5 }]});
const DC = luukAction("Dodge Counter - Such is Light", { animFrames: 56, commitFrames: 50, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [{ at: 50, mv: 251.8, energy: 2.24, concerto: 17.46, offtune: 7120, forte1: 11.13 }]});

// --- the mid-air chain. Stage 2 and 3 come in two forms by input: Scythe: Dissection (Normal
//     Attack) or Scythe: Resection (Jump), the latter inflicting Tune Strain - Shifting. Stage 3
//     of either is what replaces Resonance Skill with Aureole of Execution.
const MA1 = luukAction("Mid-air - Such is Light 1", { animFrames: 37, commitFrames: 10, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 10, mv: 57.46, energy: 0.85, concerto: 1.7, offtune: 2720, forte1: 8.5 }]});
const MA2 = luukAction("Mid-air - Scythe: Dissection 2", { animFrames: 27, commitFrames: 27, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 11, mv: 28.23, energy: 0.42, concerto: 0.75, offtune: 1200, forte1: 3.75 },
    { at: 17, mv: 28.23, energy: 0.42, concerto: 0.75, offtune: 1200, forte1: 3.75 },
    { at: 27, mv: 37.63, energy: 0.56, concerto: 1, offtune: 1600, forte1: 5 },
  ]});
const MA3 = luukAction("Mid-air - Scythe: Dissection 3", { animFrames: 72, commitFrames: 64, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 8, mv: 42.93, energy: 0.82, concerto: 1.19, offtune: 1896, forte1: 5.93 },
    { at: 18, mv: 42.93, energy: 0.82, concerto: 1.19, offtune: 1896, forte1: 5.93 },
    { at: 64, mv: 57.24, energy: 1.09, concerto: 1.58, offtune: 2528, forte1: 7.9 },
  ]});
// Resection 2/3, Golden Reflux, every Aureole of Execution and his Intro lay Tune Strain - Shifting
const STRAIN = { updateDebuffs: () => applyStrain() };
/** What every Aureole of Execution form carries: the kit's own Tune Strain, and the Endnote the
 *  cast banks (see ENDNOTES). */
const AUREOLE = { ...STRAIN, updateBuffs: () => applyCurrent(ENDNOTES, 1) };
const MA2R = luukAction("Mid-air - Scythe: Resection 2", { animFrames: 30, commitFrames: 30, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 13, mv: 50.42, energy: 0.75, concerto: 1.35, offtune: 2160, forte1: 6.75 },
    { at: 30, mv: 50.42, energy: 0.75, concerto: 1.35, offtune: 2160, forte1: 6.75 },
  ], ...STRAIN });
const MA3R = luukAction("Mid-air - Scythe: Resection 3", { animFrames: 66, commitFrames: 47, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 14, mv: 74.92, energy: 1.41, concerto: 2.08, offtune: 3320, forte1: 10.38 },
    { at: 47, mv: 74.92, energy: 1.41, concerto: 2.08, offtune: 3320, forte1: 10.38 },
  ], ...STRAIN });
const MA4 = luukAction("Mid-air - Such is Light 4", { animFrames: 60, commitFrames: 40, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 40, mv: 104.78, energy: 1.55, concerto: 1, offtune: 4960, forte1: 15.5 }]});
const MDC = luukAction("Dodge Counter - Such is Light (Mid-Air)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, mv: 256.87, energy: 2.3, concerto: 17.6, offtune: 7360, forte1: 23 });

// --- Reunion of All the Fallen. Golden Reflux is the plain Resonance Skill (2 charges); after
//     Basic Stage 4 / Mid-air Stage 3 it becomes Aureole of Execution, cycling Ring -> Breach ->
//     Glare, every form Basic Attack DMG, each inflicting Tune Strain - Shifting and banking an
//     Endnote. Ring and Breach reset the mid-air chain and make the next Normal Attack a Golden
//     Impale; Breach also hurls an Ichor Blade; Glare lays the Ichor Deposit that Gavel of
//     Earthshaker detonates.
// Golden Reflux: 2 charges on an 8s recharge; S5 takes 2s off and adds a third
const SKILL_CD = new Cooldown({ frames: () => (isHeld(LK_S5) ? 60 * 6 : 60 * 8), charges: () => (isHeld(LK_S5) ? 3 : 2) });
const Skill = luukAction("Skill - Golden Reflux", { animFrames: 68, commitFrames: 46, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [{ at: 46, mv: 201.2, energy: 2.3, concerto: 4.6, offtune: 7360, forte1: 23 }], ...STRAIN });
const Ring = luukAction("Skill - Aureole of Execution: Ring", { animFrames: 81, commitFrames: 46, node: Node.Skill, cast: Cast.Skill, type: Type.Basic, hits: [
    { at: 15, mv: 26.56, energy: 0.96, concerto: 1.2, offtune: 1248, forte1: 3.9 },
    { at: 21, mv: 26.56, energy: 0.96, concerto: 1.2, offtune: 1248, forte1: 3.9 },
    { at: 27, mv: 26.56, energy: 0.96, concerto: 1.2, offtune: 1248, forte1: 3.9 },
    { at: 33, mv: 26.56, energy: 0.96, concerto: 1.2, offtune: 1248, forte1: 3.9 },
    { at: 39, mv: 26.56, energy: 0.96, concerto: 1.2, offtune: 1248, forte1: 3.9 },
    { at: 46, mv: 88.53, energy: 3.2, concerto: 4, offtune: 4160, forte1: 13 },
  ], ...AUREOLE });
const Breach = luukAction("Skill - Aureole of Execution: Breach", { animFrames: 81, commitFrames: 45, node: Node.Skill, cast: Cast.Skill, type: Type.Basic, hits: [
    { at: 33, mv: 95.91, energy: 2.67, concerto: 3.34, offtune: 3440, forte1: 10.75 },
    { at: 39, mv: 95.91, energy: 2.67, concerto: 3.34, offtune: 3440, forte1: 10.75 },
    { at: 45, mv: 95.91, energy: 2.67, concerto: 3.34, offtune: 3440, forte1: 10.75 },
  ], ...AUREOLE });
const Glare = luukAction("Skill - Aureole of Execution: Glare", { animFrames: 106, commitFrames: 50, node: Node.Skill, cast: Cast.Skill, type: Type.Basic, hits: [{ at: 50, mv: 354.11, energy: 6, concerto: 10, offtune: 7840, forte1: 24.5 }], ...AUREOLE });
const GoldenImpale = luukAction("Basic - Golden Impale", { animFrames: 68, commitFrames: 46, node: Node.Skill, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 46, mv: 155.47, energy: 2.3, concerto: 4.6, offtune: 7360, forte1: 23 }]});
/** Detonates 5s after Glare lays it, or the moment a Gavel of Earthshaker lands on it — queued
 *  off the Gavel here, since the rotation always follows a Glare with one. */
const IchorDeposit = luukAction("Skill - Ichor Deposit", { animFrames: 0, node: Node.Skill, type: Type.Basic, hits: [{ at: 0, mv: 153.45 }]});

// --- Spark from the Frost. Gavel of Earthshaker is the mid-air slam a Glare opens up; it
//     detonates the Deposit, and its Concerto is all the flat regen row (the hit itself carries 0).
const Gavel = luukAction("Mid-air - Gavel of Earthshaker", {
  animFrames: 41, commitFrames: 26,
  node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 26, mv: 306.9, energy: 6, concerto: 10, offtune: 8080, forte1: 25.25 }],
  updateDebuffs: () => queue(IchorDeposit),
});

/** Ichor Blade: 10 flat Spectro DMG every 0.15s for 5s, counted as Basic Attack DMG but immune to
 *  every bonus — Scaling.Fixed, in the same x100 units Roccia's own fixed hit uses. Taken at the
 *  table's full 5s (33 ticks); in play it vanishes on his next damaging cast, so this is its
 *  ceiling — at 330 damage a summon, nothing turns on it. Hurled by the Intro and by Breach. */
const IchorBlade = luukAction("Forte - Ichor Blade", { animFrames: 357, commitFrames: 357, node: Node.Forte, type: Type.Basic, scaling: Scaling.Fixed, hits: [
    { at: 60, mv: 9.7059 },
    { at: 69, mv: 9.7059 },
    { at: 78, mv: 9.7059 },
    { at: 87, mv: 9.7059 },
    { at: 96, mv: 9.7059 },
    { at: 105, mv: 9.7059 },
    { at: 114, mv: 9.7059 },
    { at: 123, mv: 9.7059 },
    { at: 132, mv: 9.7059 },
    { at: 141, mv: 9.7059 },
    { at: 150, mv: 9.7059 },
    { at: 159, mv: 9.7059 },
    { at: 168, mv: 9.7059 },
    { at: 177, mv: 9.7059 },
    { at: 186, mv: 9.7059 },
    { at: 195, mv: 9.7059 },
    { at: 204, mv: 9.7059 },
    { at: 213, mv: 9.7059 },
    { at: 222, mv: 9.7059 },
    { at: 231, mv: 9.7059 },
    { at: 240, mv: 9.7059 },
    { at: 249, mv: 9.7059 },
    { at: 258, mv: 9.7059 },
    { at: 267, mv: 9.7059 },
    { at: 276, mv: 9.7059 },
    { at: 285, mv: 9.7059 },
    { at: 294, mv: 9.7059 },
    { at: 303, mv: 9.7059 },
    { at: 312, mv: 9.7059 },
    { at: 321, mv: 9.7059 },
    { at: 330, mv: 9.7059 },
    { at: 339, mv: 9.7059 },
    { at: 348, mv: 9.7059 },
    { at: 357, mv: 9.7053 },
  ]});

const Liberation = luukAction("Liberation - Rewritten in Winter's Margins", {
  animFrames: 247, commitFrames: 247, timestop: 247, motionStop: 247, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Basic, hits: [
    { at: 230, mv: 745.54, offtune: 50400 },
    { at: 232, mv: 49.71, offtune: 3360 },
    { at: 234, mv: 49.71, offtune: 3360 },
    { at: 237, mv: 49.71, offtune: 3360 },
    { at: 239, mv: 49.71, offtune: 3360 },
    { at: 242, mv: 49.71, offtune: 3360 },
  ], castConcerto: 20, resetEnergy: true,
});

const Intro = luukAction("Intro - Before Injection of Dawn", {
  animFrames: 75, commitFrames: 73, motionStop: 21,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 27, mv: 72.67, energy: 3.34, offtune: 3440 },
    { at: 33, mv: 72.67, energy: 3.34, offtune: 3440 },
    { at: 39, mv: 72.67, energy: 3.34, offtune: 3440, forte1: 100 },
  ], castConcerto: 10, ...STRAIN,
  // updateBuffs: () => applyCurrent(DAWNLIT_KEEP, 1),  // DAWNLIT_KEEP grants no stat and nothing reads it
});
const Outro = luukAction("Outro - Bow to the Last Light", {
  animFrames: 0, commitFrames: 0,
  cast: Cast.Outro, type: Type.Outro, hits: [{ at: 0, mv: 500 }], castConcerto: -100,
  updateBuffs: () => applyCurrent(GOLDEN_RULE),
});

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
    const a = currentAction();
    // a Tune Break landing between the Glare and its Gavel/Deposit isn't his cast, so it can't close it
    if (forte1() <= 0 && !runningAction(Gavel) && !runningAction(IchorDeposit) && !runningAction(TUNE_BREAK)) revokeCurrent(AUREATE_JUDGE);
  },
  applyStats: () => {
    const a = pressed();
    if (a.forte1 > a.castForte[0]!) addStat(Stat.AddCastForte1, -(a.forte1 - a.castForte[0]!));
    if (isAureole() || runningAction(Gavel)) { addStat(Stat.MulMv, 110); addStat(Stat.AddOfftune, 25200); }
    if (isAureole()) {
      addStat(Stat.AddCastForte1, -100);
    }
    if (runningAction(IchorDeposit)) addStat(Stat.MulMv, 110);
  },
});

/** Endnotes on the Endgame: every Aureole cast banks a stack, 3 max, each +25% to the Liberation's
 *  own DMG Multiplier; the Liberation spends them all, and switching out drops them. */
const ENDNOTES = new Buff({
  name: "Luuk: Endnotes on the Endgame", maxStacks: 3,
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 25 * frozenStacks()); },
  convertStats: () => { lostOnSwap(); if (runningAction(Liberation)) revokeCurrent(ENDNOTES); },
});

/** Golden Rule: a teammate's Outro that brings Luuk in hands him 200 Ichor Flow and 12 Concerto —
 *  once per 24s, which at the length these loops run is every loop. He is always brought in that
 *  way, so it's simply armed on his own Outro (and at combat start, for his first entry) and paid
 *  on the Intro that follows. */
const GOLDEN_RULE = new Buff({
  name: "Luuk: Golden Rule",
  applyStats: () => { if (casting(Cast.Intro)) { addStat(Stat.AddCastForte1, 200); addStat(Stat.AddCastConcerto, 12); } },
  convertStats: () => { if (casting(Cast.Intro)) revokeCurrent(GOLDEN_RULE); },
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
    if (stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0) addStat(Stat.Amp, Math.min(30, 5 * Math.floor(getStat(Stat.Tbb) / 10)));
  },
});

const LUUK_TALENTS = new Talent({
  name: "Luuk: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

/** This kit's own carrier for the Tune Strain payout (tunebreak.ts's `strainPayout`). */
const LK_STRAIN_PAYOUT = strainPayout();

const LUUK_RESONATOR = new Resonator({
  name: "Luuk Herssen",
  talent: LUUK_TALENTS,
  inherent1: LK_INHERENT_1,
  inherent2: LK_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Gauntlets,
  color: "#ddb246",
  intro: Intro,
  tuneBreak: tuneBreak(94, 94, 70, [[72, 1600]]),
  maxEnergy: 125,
  maxForte1: 300,

  // his kit raises the target's Tune Strain - Interfered limit by 1 on top of the base 1; Golden
  // Rule is armed from the start so his first Intro is brought in the same way every later one is
  combatStart: () => { maxStackIncrease(TUNE_STRAIN_INTERFERED, 1); applyCurrent(GOLDEN_RULE, 1); applyCurrent(LK_STRAIN_PAYOUT, 1); },

  updateBuffs: () => {
    if (forte1() >= 300) applyCurrent(AUREATE_JUDGE, 1);
  },

  stats: [
    [Stat.BaseHp, 10300], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1112.2202],
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    [Stat.Tbb, 10],
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
    if (stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0) addStat(Stat.Amp, Math.min(30, 5 * Math.floor(getStat(Stat.Tbb) / 10)));
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
    if (pressed().hits.length > 0 && stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0) applyEnemy(TUNE_STRAIN_INTERFERED, 2);
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
  START_3, Skill.cancel(), Liberation, Skill.instaSwap(),

  INTRO, Jump23.cancel(), Ring, GoldenImpale,
  Jump123.cancel(), Breach, GoldenImpale,
  Jump123.cancel(), Glare.easyCancel(), Gavel.cancel(),
  Liberation, Skill.instaSwap(), Outro,
]);

const LK_ROTATION_16s = new Rotation([
  START_3, Liberation, Skill, Skill.instaSwap(),
  
  INTRO, Jump23.cancel(), Ring, GoldenImpale,
  Jump123.cancel(), Breach, GoldenImpale,
  Jump123.cancel(), Glare.easyCancel(), Gavel.cancel(),
  Liberation, Jump123.cancel(), Ring.instaSwap(), Outro,
]);

export const LUUK = new Loadout({
  resonator: LUUK_RESONATOR,
  weapons: [DAYBREAKERS_SPINE, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [
  new EchoLoadout(NEBULOUS_CANNON, GILDED_REVELATION_5PC),
],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
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
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  rotation: LK_ROTATION_16s,
  sequences: LK_SEQUENCES,
});
