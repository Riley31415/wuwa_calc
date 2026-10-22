/**
 * Galbrena, ported to the new engine — sequence-0 core loop, a limited 5-star
 * (`Tier.Limited`). A fusion pistols main DPS. Threshold State (default) banks Sinflame
 * (forte1) off her own hits, out of 100; full, Resonance Skill - Encroach is replaced by Ascent of Malice,
 * which drops her into Demon Hypostasis — Basic/Heavy/Skill are all replaced by their own
 * "enhanced" forms (Seraphic Execution, Flamewing Verdict, Ravage), scaled up by Afterflame.
 *
 * Hellstride is her dodge out of any of her own casts: a fixed 666-point hit "not affected by any
 * DMG Bonus effects" (`Scaling.Fixed`), and one of the casts that banks Burning Drive.
 *
 * Purging Flame (forte2) is a real gauge: Ascent of Malice converts 100 Sinflame into it, and each
 * enhanced-mode action's own declared forte2 cost spends it down. Both read 0-100.
 * Afterflame (0-40, +1.5%/point Demon Hypostasis DMG scaling, own
 * ceiling 60%) is a genuine live-tracked gauge on top of that, same "self-held Resonator reacting
 * to any teammate's own Echo cast" shape Sigrika's own Soliskin Vitality uses — GALBRENA_RESONATOR's own
 * updateGlobal() below grants it, not a forte gauge. "Echoes with the same name can only trigger
 * this effect once" isn't tracked — same simplification tier Soliskin Vitality's own unlimited
 * re-trigger already carries.
 *
 * Oathbound Hunt (Inherent Skill): landing an attack grants 1 stack (up to 4) of a DMG Dealt
 * bonus, 5.5s — the "once every 5s per skill type" ICD isn't modelled.
 *
 * Numbers from nanoka.cc (character 1208) for every named hit's MV; frames and gauges off wuwalab.
 * Mid-air Sustained Fire has no wuwalab row, so it is still bare (nanoka's own MV only).
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, Position } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  revokeTeam,
  casting,
  runningAction,
  addStat,
  frozenStacks,
  revokeCurrent,
  isHeld,
  forte2,
  currentHit,
  previousPress,
  saveChain,
  addStatAs,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, DODGE } from "../../engine/rotation.js";
import { LUX_UMBRA } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { THUNDERBOLT, SOLAR_FLAME } from "../../weapons/battlepass.js";
import { CLAWPRINT_2PC, CORROSAURUS, FLAMEWING_SHADOW_3PC, ACTION_CORROSAURUS } from "../../echoes/septimont.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { Echoes } from "../../shared/echoes.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function galbrenaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

/** Demon Hypostasis, the stance every enhanced form is cast in: opened by Ascent of Malice, 50s
 *  at most, and ended on the hit that runs Purging Flame out, taking Afterflame down with it. */
const DEMON_HYPOSTASIS: Buff = new Buff({
  name: "Galbrena: Demon Hypostasis",
  duration: 60 * 50,
  // only a hit spending Purging Flame runs it out — Ascent of Malice's reset ahead of its refill is none
  afterHit: () => {
    if (forte2() > 0 || !(currentHit().forte2 < 0 || runningAction(Ravage))) return;
    revokeTeam(AFTERFLAME);
    revokeCurrent(DEMON_HYPOSTASIS);
  },
});

// frames, priorities and per-hit Sinflame/Purging Flame off wuwalab (Oct 19 2026), whose MV/
// energy/concerto/off-tune agree with the kit's. Its Encroach and Ravage rows are one row twice
// (each banks Sinflame and spends Purging Flame): Encroach keeps the gain, Ravage the spend.
// --- Threshold State basics: Slayer's Trigger. Stages 1-3 Heavy Attack DMG, Stage 4 Echo Skill.
const BA1 = galbrenaAction("Basic - Slayer's Trigger 1", { animFrames: 18, castPriority: 2, bullets: [{ hitFrame: 12, mv: 5918, energy: 83, concerto: 116, offtune: 2646, forte1: 5 }], node: Node.Normal, cast: Cast.Basic, type: Type.Heavy});
// "Press Normal Attack right after" Stage 4, Volley of Death Stage 1, the Liberation or the Intro "to perform Basic Attack Stage 2"
const BA2 = galbrenaAction("Basic - Slayer's Trigger 2", { chains: () => [BA1, BA4, HA1, Liberation, Intro], animFrames: 42, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 10, mv: 2631, energy: 37, concerto: 52, offtune: 1176, forte1: 5 },
    { hitFrame: 16, mv: 2631, energy: 37, concerto: 52, offtune: 1176, forte1: 5 },
    { hitFrame: 32, mv: 7891, energy: 111, concerto: 155, offtune: 3528, forte1: 9 },
  ]});
// Volley of Death Stage 2 or 3 and the Plunging Attack lead into Stage 3 too
const BA3 = galbrenaAction("Basic - Slayer's Trigger 3", { chains: () => [BA2, HA2, HA3, MA], animFrames: 48, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 16, mv: 2860, energy: 40, concerto: 56, offtune: 1279, forte1: 5 },
    { hitFrame: 22, mv: 4289, energy: 60, concerto: 84, offtune: 1918, forte1: 5 },
    { hitFrame: 28, mv: 2860, energy: 40, concerto: 56, offtune: 1279, forte1: 5 },
    { hitFrame: 37, mv: 4289, energy: 60, concerto: 84, offtune: 1918, forte1: 5 },
  ]});
// and Blood for Blood into Stage 4
const BA4 = galbrenaAction("Basic - Slayer's Trigger 4", { chains: () => [BA3, DC], animFrames: 59, castPriority: 2, bullets:
  [{ hitFrame: 30, mv: 17786, energy: 249, concerto: 348, offtune: 7952, forte1: 15 }],
   node: Node.Normal, cast: Cast.Basic, type: Type.Echo});

const DC = galbrenaAction("Dodge Counter - Blood for Blood", { chains: [DODGE], animFrames: 48, animPriority: { 39: 2 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Heavy, bullets: [
    { hitFrame: 16, mv: 4105, energy: 40, concerto: 56, offtune: 1279, forte1: 3 },
    { hitFrame: 22, mv: 6157, energy: 60, concerto: 84, offtune: 1918, forte1: 5 },
    { hitFrame: 28, mv: 4105, energy: 40, concerto: 56, offtune: 1279, forte1: 2 },
    { hitFrame: 37, mv: 6157, energy: 60, concerto: 84, offtune: 1918, forte1: 3 },
  ], castConcerto: 1000});
const MA = galbrenaAction("Mid-air - Ashfall Barrage (Plunge)", { castPosition: Position.Midair, endPosition: Position.Grounded,
  animFrames: 52, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets:
   [{ hitFrame: 46, mv: 14315, energy: 200, concerto: 280, offtune: 6400, forte1: 10 }] });
const MASustained = galbrenaAction("Mid-air - Ashfall Barrage (Sustained Fire)", { castPosition: Position.Midair, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 2684, energy: 38, concerto: 53, offtune: 1200 }] });

// Threshold State heavy: Volley of Death, 3 held stages. Holding on after Stage 1, Stage 2 or the
// Intro comes out as the next stage, so Stage 1 follows anything else
const HA1 = galbrenaAction("Heavy - Volley of Death 1", { chains: () => [
    BA1, BA2, BA3, BA4, DC, MA, MASustained, HA3, Encroach, AscentOfMalice, Liberation, Ravage, PurgatoryScourge, HellsentBarrage,
    SeraphicExecution1, SeraphicExecution2, SeraphicExecution3, SeraphicExecution4, SeraphicExecution5,
    FlamewingVerdict1, FlamewingVerdict2, FlamewingVerdict3, DemonIntro,
  ], animFrames: 35, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 10, mv: 5330, energy: 75, concerto: 105, offtune: 2383 },
    { hitFrame: 16, mv: 5330, energy: 75, concerto: 105, offtune: 2383, forte1: 10 },
  ]});
// the Intro's "Hold Normal Attack after casting this skill to cast Heavy Attack - Volley of Death Stage 2"
const HA2 = galbrenaAction("Heavy - Volley of Death 2", { chains: () => [HA1, Intro], animFrames: 22, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 2, mv: 3459, energy: 49, concerto: 68, offtune: 1547, forte1: 7 },
    { hitFrame: 13, mv: 3459, energy: 49, concerto: 68, offtune: 1547, forte1: 7 },
  ]});
const HA3 = galbrenaAction("Heavy - Volley of Death 3", { chains: [HA2], animFrames: 70, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Echo, bullets: [
    { hitFrame: 30, mv: 1677, energy: 24, concerto: 33, offtune: 750, forte1: 5 },
    { hitFrame: 39, commitFrame: 30, mv: 1677, energy: 24, concerto: 33, offtune: 750, forte1: 5 },
    { hitFrame: 48, commitFrame: 30, mv: 1677, energy: 24, concerto: 33, offtune: 750, forte1: 5 },
    { hitFrame: 57, commitFrame: 30, mv: 11739, energy: 165, concerto: 230, offtune: 5249, forte1: 4 },
  ]});

// Threshold State resonance skill: Encroach (base), Ascent of Malice (100 Sinflame, opens Demon
// Hypostasis)
// the five casts that bank a Burning Drive stack
const DRIVE = { updateBuffs: () => applyCurrent(BURNING_DRIVE, 1) };
/** Encroach and Ravage draw on one 5s cooldown. */
const ENCROACH_CD = new Cooldown({ frames: 60 * 5 });
// "Dash forward and leap into the air. Flip backward upon hitting the target": she ends airborne
const Encroach = galbrenaAction("Skill - Encroach", { endPosition: Position.Midair, maxForte1: 99, animFrames: 60, animPriority: { 32: 2 }, castPriority: 4, cooldown: ENCROACH_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, bullets: [
    { hitFrame: 12, mv: 1074, energy: 198, concerto: 67, offtune: 1512, forte1: 5 },
    { hitFrame: 32, commitFrame: 17, mv: 2504, energy: 461, concerto: 155, offtune: 3527, forte1: 5 },
  ], ...DRIVE });
/** Converts Sinflame into Purging Flame: the whole bar out (spent from its cap of 100) and a full
 *  100 in, on cast — its second hit lands after the Seraphic Execution behind it starts spending. */
const AscentOfMalice = galbrenaAction("Skill - Ascent of Malice", { minForte1: 100,
  animFrames: 39, castPriority: 5, cooldown: 60 * 13,
  node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, bullets: [
    { hitFrame: 22, mv: 5157, energy: 738, offtune: 2794 },
    { hitFrame: 70, commitFrame: 22, mv: 5157, energy: 738, offtune: 2794 },
  ], castConcerto: 1000, castForte1: -100, castForte2: 100,
  // the conversion is a top-off, not a top-up: Purging Flame is emptied ahead of the +100 above,
  // so it lands on exactly 100 from wherever the enhanced chain left it
  resetForte2: true,
  updateBuffs: () => {
    applyCurrent(BURNING_DRIVE, 1);
    applyCurrent(DEMON_HYPOSTASIS, 1);
  },
});

// Demon Hypostasis: Seraphic Execution (Basic), Flamewing Verdict (Heavy), Ravage (Skill) —
// Mid-air/Dodge Counter enhanced forms aren't placed in the rotation below, kept for
// completeness. Burning Drive is Seraphic Execution's own Stage 4 specifically, not Threshold
// State's Slayer's Trigger Stage 4.
const SeraphicExecution1 = galbrenaAction("Forte Basic - Seraphic Execution 1", { requireBuff: DEMON_HYPOSTASIS, animFrames: 18, castPriority: 2, bullets: [{ hitFrame: 14, mv: 5899, energy: 100, concerto: 554, offtune: 2374, forte2: -5 }], node: Node.Forte, cast: Cast.Basic, type: Type.Heavy});
// Ascent of Malice "Can be followed by Basic Attack - Seraphic Execution Stage 2"; Flamewing Verdict
// Stage 1, the Liberation and the Intro lead into it in Demon Hypostasis too
const SeraphicExecution2 = galbrenaAction("Forte Basic - Seraphic Execution 2", { chains: () => [SeraphicExecution1, AscentOfMalice, FlamewingVerdict1, Liberation, DemonIntro], requireBuff: DEMON_HYPOSTASIS, animFrames: 42, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 19, mv: 2784, energy: 40, concerto: 139, offtune: 1120, forte2: -3 },
    { hitFrame: 28, mv: 2784, energy: 40, concerto: 139, offtune: 1120, forte2: -3 },
    { hitFrame: 38, mv: 8351, energy: 120, concerto: 417, offtune: 3360, forte2: -3 },
  ]});
// "after casting Basic Attack - Seraphic Execution Stage 5", Flamewing Verdict Stage 2 & 3 and the Plunging Attack too
const SeraphicExecution3 = galbrenaAction("Forte Basic - Seraphic Execution 3", { chains: () => [SeraphicExecution2, SeraphicExecution5, FlamewingVerdict2, FlamewingVerdict3, HellsentBarrage], requireBuff: DEMON_HYPOSTASIS, animFrames: 72, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 18, mv: 2432, energy: 34, concerto: 88, offtune: 979, forte2: -2 },
    { hitFrame: 24, commitFrame: 18, mv: 2432, energy: 34, concerto: 88, offtune: 979, forte2: -2 },
    { hitFrame: 30, commitFrame: 18, mv: 2432, energy: 34, concerto: 88, offtune: 979, forte2: -2 },
    { hitFrame: 53, mv: 17021, energy: 232, concerto: 615, offtune: 6849, forte2: -12 },
  ]});
const SeraphicExecution4 = galbrenaAction("Forte Basic - Seraphic Execution 4", { chains: () => [SeraphicExecution3, PurgatoryScourge], requireBuff: DEMON_HYPOSTASIS, animFrames: 57, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Echo, bullets: [
    { hitFrame: 10, mv: 1815, energy: 26, concerto: 77, offtune: 731, forte2: -2 },
    { hitFrame: 17, commitFrame: 10, mv: 1815, energy: 26, concerto: 77, offtune: 731, forte2: -2 },
    { hitFrame: 24, commitFrame: 10, mv: 1815, energy: 26, concerto: 77, offtune: 731, forte2: -2 },
    { hitFrame: 49, mv: 12702, energy: 178, concerto: 539, offtune: 5112, forte2: -7 },
  ], ...DRIVE });
const SeraphicExecution5 = galbrenaAction("Forte Basic - Seraphic Execution 5", { chains: [SeraphicExecution4], requireBuff: DEMON_HYPOSTASIS, animFrames: 83, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Echo, bullets: [
    { hitFrame: 36, mv: 6728, energy: 93, concerto: 254, offtune: 2708, forte2: -7 },
    { hitFrame: 66, commitFrame: 36, mv: 15699, energy: 215, concerto: 592, offtune: 6317, forte2: -13 },
  ]});

const FlamewingVerdict1 = galbrenaAction("Forte Heavy - Flamewing Verdict 1", { requireBuff: DEMON_HYPOSTASIS, animFrames: 35, castPriority: 3, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 10, mv: 5922, energy: 87, concerto: 330, offtune: 2383, forte2: -5 },
    { hitFrame: 16, mv: 5922, energy: 87, concerto: 330, offtune: 2383, forte2: -5 },
  ]});
// held after the Intro in Demon Hypostasis too
const FlamewingVerdict2 = galbrenaAction("Forte Heavy - Flamewing Verdict 2", { chains: () => [FlamewingVerdict1, DemonIntro], requireBuff: DEMON_HYPOSTASIS, animFrames: 22, castPriority: 3, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 2, mv: 3835, energy: 61, concerto: 293, offtune: 1543, forte2: -4 },
    { hitFrame: 13, mv: 3835, energy: 61, concerto: 293, offtune: 1543, forte2: -4 },
  ]});
const FlamewingVerdict3 = galbrenaAction("Forte Heavy - Flamewing Verdict 3", { chains: [FlamewingVerdict2], requireBuff: DEMON_HYPOSTASIS, animFrames: 72, castPriority: 3, node: Node.Forte, cast: Cast.Heavy, type: Type.Echo, bullets: [
    { hitFrame: 30, mv: 1769, energy: 25, concerto: 77, offtune: 712, forte2: -3 },
    { hitFrame: 39, commitFrame: 30, mv: 1769, energy: 25, concerto: 77, offtune: 712, forte2: -3 },
    { hitFrame: 48, commitFrame: 30, mv: 1769, energy: 25, concerto: 77, offtune: 712, forte2: -3 },
    { hitFrame: 63, commitFrame: 30, mv: 12377, energy: 174, concerto: 533, offtune: 4981, forte2: -4 },
  ]});

// leaps into the air like Encroach
const Ravage = galbrenaAction("Forte Skill - Ravage", { endPosition: Position.Midair, animFrames: 60, animPriority: { 0: 6, 32: 2 }, castPriority: 4,
  cooldown: ENCROACH_CD, requireBuff: DEMON_HYPOSTASIS,
  node: Node.Forte, cast: Cast.Skill, type: Type.Heavy, bullets: [
    { hitFrame: 12, mv: 1074, energy: 198, concerto: 67, offtune: 1512, forte2: -5 },
    { hitFrame: 32, commitFrame: 17, mv: 2504, energy: 461, concerto: 155, offtune: 3527, forte2: -5 },
  ],
  updateBuffs: () => applyCurrent(BURNING_DRIVE, 1),
});

// "Press Normal Attack right after casting this skill to cast Basic Attack - Seraphic Execution Stage 4"
const PurgatoryScourge = galbrenaAction("Forte Dodge Counter - Purgatory Scourge", { chains: [DODGE], requireBuff: DEMON_HYPOSTASIS, animFrames: 74, animPriority: { 51: 2 }, castPriority: 8, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Heavy, bullets: [
    { hitFrame: 18, mv: 3210, energy: 35, concerto: 90, offtune: 1014, forte2: -2 },
    { hitFrame: 24, commitFrame: 18, mv: 3210, energy: 35, concerto: 90, offtune: 1014, forte2: -2 },
    { hitFrame: 30, commitFrame: 18, mv: 3210, energy: 35, concerto: 90, offtune: 1014, forte2: -2 },
    { hitFrame: 53, mv: 22470, energy: 240, concerto: 626, offtune: 7093, forte2: -12 },
  ], castConcerto: 1000}); // 32.10%*3+224.70%
// "Press Normal Attack after the Plunging Attack to cast Basic Attack - Seraphic Execution Stage 3"
const HellsentBarrage = galbrenaAction("Forte Mid-air - Hellsent Barrage (Plunge)", { castPosition: Position.Midair, endPosition: Position.Grounded, requireBuff: DEMON_HYPOSTASIS,
  animFrames: 52, castPriority: 6, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets:
   [{ hitFrame: 46, mv: 15905, energy: 200, concerto: 280, offtune: 6400, forte2: -12 }] });

/** The enhanced presses Hellfire Absolution and S6 scale: Ravage aside, every form Demon
 *  Hypostasis replaces. */
const demonForm = (): boolean => runningAction(SeraphicExecution1) || runningAction(SeraphicExecution2)
  || runningAction(SeraphicExecution3) || runningAction(SeraphicExecution4) || runningAction(SeraphicExecution5)
  || runningAction(FlamewingVerdict1) || runningAction(FlamewingVerdict2) || runningAction(FlamewingVerdict3)
  || runningAction(HellsentBarrage) || runningAction(PurgatoryScourge);

const Liberation = galbrenaAction("Liberation - Hellfire Absolution", { animFrames: 195, timestop: [0, 210], motionStop: [0, 210], castPriority: 10,
  cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Echo, bullets: [
    { hitFrame: 156, mv: 11090, offtune: 8400 },
    { hitFrame: 174, commitFrame: 156, mv: 9074, offtune: 6873 },
    { hitFrame: 182, commitFrame: 156, mv: 9074, offtune: 6873 },
    { hitFrame: 191, commitFrame: 156, mv: 9074, offtune: 6873 },
    { hitFrame: 199, commitFrame: 156, mv: 9074, offtune: 6873 },
    { hitFrame: 208, commitFrame: 156, mv: 9074, offtune: 6873 },
    { hitFrame: 216, commitFrame: 156, mv: 9074, offtune: 6873 },
    { hitFrame: 224, commitFrame: 156, mv: 9074, offtune: 6873 },
    { hitFrame: 233, commitFrame: 156, mv: 9074, offtune: 6873 },
    { hitFrame: 241, commitFrame: 156, mv: 9074, offtune: 6873 },
    { hitFrame: 250, commitFrame: 156, mv: 9074, offtune: 6873 },
    { hitFrame: 258, commitFrame: 156, mv: 9074, offtune: 6873 },
  ], castConcerto: 2000, castEnergy: -12500,
  updateBuffs: () => applyCurrent(HELLFIRE_WINDOW, 1),
});

const Intro = galbrenaAction("Intro - Hellflare Overload", { endPosition: Position.Grounded, qteFrames: 38, animFrames: 66, noSwapFrames: 47, animPriority: { 41: 2 }, castPriority: 11, motionStop: [0, 29], node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 33, mv: 9412, energy: 1000, offtune: 4208, forte1: 10 }], castConcerto: 1000, ...DRIVE });
// Sinflame builds "While in Threshold State" only, so the Intro in Demon Hypostasis banks none
const DemonIntro = Intro.variant("Intro - Hellflare Overload (Demon Hypostasis)", { bullets: [{ hitFrame: 33, mv: 9412, energy: 1000, offtune: 4208 }] });
/** Unlike most outros, this one deals real damage (795% MV) on top of the handoff concerto
 *  reset; its OFF-FIELD tag still marks it as her leaving the field for lostOnSwap purposes. */
const Outro = galbrenaAction("Outro - Ashen Pursuit", { cast: Cast.Outro, type: Type.Outro, bullets: [
    { hitFrame: 0, mv: 7950 },
    { hitFrame: 9, commitFrame: 0, mv: 7950 },
    { hitFrame: 19, commitFrame: 0, mv: 7950 },
    { hitFrame: 34, commitFrame: 0, mv: 55650 },
  ], minConcerto: 10000, castConcerto: -10000});

/* ------------------------------------------------------------------------------------ buffs */

/** +20% ATK, 4s — granted on Intro, Hellstride, Encroach, Ascent of Malice, Seraphic Execution
 *  Stage 4, and Ravage. */
const BURNING_DRIVE = new Buff({
  name: "Galbrena: Burning Drive",
  duration: 60 * 4,
  stats: [[Stat.BonusAtk, 20]],
  // S2: 350% more of the bonus, so 20% becomes 90%
  applyStats: () => {
    // S2 takes it to 90% of ATK — the 70 over the base is the node's own
    if (isHeld(GB_S2)) addStatAs(GB_S2, Stat.BonusAtk, 70);
  },
});

/** +5% DMG Dealt a stack, up to 4, 5.5s — granted on any of her own landed attacks. */
const OATHBOUND_HUNT = new Buff({
  name: "Galbrena: Fated End", maxStacks: 4, duration: 60 * 5.5,
  stats: [[Stat.Amp, 5]], perStack: true,
});
const GB_INHERENT_1 = new Inherent({
  name: "Inherent: Oathbound Hunt",
  grants: [{ on: () => !casting(Cast.Echo), buff: OATHBOUND_HUNT, onHit: true }],
});
/** No combat-formula effect this engine models, same "still equipped, no stat" treatment
 *  Augusta's own Ruler's Realm shield gets. */
const GB_INHERENT_2 = new Inherent({ name: "Inherent: Sin Feaster" });

/** 0-40, +8 on any team member's own Echo Skill cast while she's still in Threshold State (not
 *  yet holding DEMON_HYPOSTASIS this turn). Scales the enhanced-mode actions and Ravage at
 *  +1.5%/point, capped at 60%, gated per-action inside applyStats() itself. Held team-wide so the
 *  count reads on every row of the log, the way Jinhsi's Incandescence is; the gate below is what
 *  keeps the payout hers. */
const AFTERFLAME = new Buff({
  name: "Galbrena: Afterflame", maxStacks: 40,
  applyStats: () => {
    if (demonForm() || runningAction(Ravage)) {
      addStat(Stat.TotalDmg, Math.min(60, 1.5 * frozenStacks()));
      // S1 reads the same count as Crit. DMG, S6 as Fusion amplification — both snapshot at Ascent
      // of Malice, which is the same number: Afterflame only ever builds outside Demon Hypostasis
      // the count is read out here: inside `addStatAs` the "current" gear is the node, whose own
      // stacks are not what these scale on
      const flame = frozenStacks();
      if (isHeld(GB_S1)) addStatAs(GB_S1, Stat.CritDmg, Math.min(80, 2 * flame));
      if (isHeld(GB_S6)) addStatAs(GB_S6, Stat.Amp, Math.min(35, 0.875 * flame), Attribute.Fusion);
    }
  },
});

/** +85% DMG Multiplier on the enhanced forms (Ravage excepted), 14s "while in Demon Hypostasis":
 *  it ends with it. wuwalab's rows inside it also build x2.452 off-tune. */
const HELLFIRE_WINDOW = new Buff({
  name: "Galbrena: Hellfire Absolution",
  duration: 60 * 14, lostWith: DEMON_HYPOSTASIS,
  applyStats: () => {
    if (!demonForm()) return;
    addStat(Stat.MulMv, 85);
    addStat(Stat.OfftuneMult, 145.2);
  },
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: 2% Crit. DMG a point of Afterflame to the enhanced casts, 80% at its own 40-point cap —
 *  paid by Afterflame itself, which is what holds the count. The interrupt immunity is no stat. */
const GB_S1 = new Sequence({ name: "Galbrena S1: Heart of Defiance Ever Ablaze" });

/** S2: Burning Drive's +20% ATK becomes +90% — paid by Burning Drive itself. */
const GB_S2 = new Sequence({ name: "Galbrena S2: Hellbound Dive of Fire and Abyss" });

/** S3: the Liberation at x2.3 — nanoka's second rows (255.07% and 208.69% against 110.90% and
 *  90.74%), and nothing else multiplies it, so a plain multiplier reaches exactly that. */
const GB_S3 = new Sequence({
  name: "Galbrena S3: Hunter's Blood Oath Rekindled",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 130); },
});

/** S4: +20% All-Attribute DMG Bonus to the team off any member's Echo Skill, 20s — re-granted by
 *  every echo the team casts, so it stands for the fight. */
const CARRY_FORTH = new Buff({
  name: "Galbrena S4: Carry Forth This Fading Spark",
  duration: 60 * 20,
  stats: [[Stat.DmgBonus, 20]],
});
const GB_S4 = new Sequence({
  name: "Galbrena S4: Carry Forth This Fading Spark",
  updateGlobal: () => { if (casting(Cast.Echo)) applyTeam(CARRY_FORTH, 1); },
});

/** S5: Encroach, Ascent of Malice and Ravage at x2.5 — nanoka's second rows (26.83%+62.60% and
 *  128.93%), and none of the three carries another multiplier, so this lands on exactly that. */
const GB_S5 = new Sequence({
  name: "Galbrena S5: Though Light Fades, Torment Consumes",
  applyStats: () => {
    if (runningAction(Encroach) || runningAction(AscentOfMalice) || runningAction(Ravage)) addStat(Stat.MulMv, 150);
  },
});

/** S6: Eternal Hypostasis keeps everything Demon Hypostasis had and puts every enhanced form
 *  (Ravage aside) at x1.6 — over the Hellfire window rather than beside it, which nanoka's
 *  rows settle: 174.61% is 58.99% x 1.85 x 1.6. Multipliers sum in one bracket here, so the share
 *  this contributes is 60% of whatever already stands. Its Afterflame amplification is paid by
 *  Afterflame above. */
const GB_S6 = new Sequence({
  name: "Galbrena S6: I Remain Who I am, Eternal My Flame",
  applyStats: () => {
    if (demonForm()) addStat(Stat.MulMv, isHeld(HELLFIRE_WINDOW) ? 60 * 1.85 : 60);
  },
});

const GB_SEQUENCES = [GB_S1, GB_S2, GB_S3, GB_S4, GB_S5, GB_S6];

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const GALBRENA_TALENTS = new Talent({
  name: "Galbrena: Talents",
  stats: [[Stat.BonusAtk, 11.9999997], [Stat.CritDmg, 16]],
});

/** Hellstride: a dodge on the ground during any of her own casts — a fixed 666 Fusion, Basic
 *  Attack DMG no DMG buff touches. */
const Hellstride = galbrenaAction("Dodge - Hellstride", { castPosition: Position.Grounded, cast: Cast.Dodge, animFrames: 24, animPriority: { 19: 2 }, castPriority: 7, type: Type.Basic, scaling: Scaling.Fixed, bullets: [{ hitFrame: 4, mv: 66600 }], ...DRIVE });

const GALBRENA_RESONATOR = new Resonator({
  id: 1208,
  name: "Galbrena",
  stats: [[Stat.BaseHp, 10300], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1112.2202]],
  talent: GALBRENA_TALENTS,
  inherent1: GB_INHERENT_1,
  inherent2: GB_INHERENT_2,
  element: Attribute.Fusion,
  weapon: WeaponType.Pistols,
  dodge: Hellstride,
  color: "#3454ac",
  intro: () => (isHeld(DEMON_HYPOSTASIS) ? DemonIntro : Intro),
  // Demon Hypostasis replaces Basic Attack with Seraphic Execution; she has no mid-air chain, only the plunge
  swapIn: () => (isHeld(DEMON_HYPOSTASIS) ? SeraphicExecution1 : BA1),
  swapInAir: () => (isHeld(DEMON_HYPOSTASIS) ? HellsentBarrage : MA),
  maxEnergy: 12500,
  maxForte1: 100,
  maxForte2: 100,

  // reacts to *any* team member's own Echo cast, not just her own — see AFTERFLAME's own comment
  updateGlobal: () => {
    if (casting(Cast.Echo) && !isHeld(DEMON_HYPOSTASIS)) applyTeam(AFTERFLAME, 8);
  },

  // Hellstride "does not reset the attack cycles": the press it cut is still the one the next follows
  updateBuffs: () => {
    if (casting(Cast.Dodge)) saveChain(previousPress());
  },
});

// a kit-valid line: Intro, Encroach opens Burning Drive and banks Sinflame, Ascent of Malice
// spends it all and opens Demon Hypostasis, Seraphic Execution and Flamewing Verdict follow
// while it's up, Liberation opens its own +85% window over the tail of it, Outro closes the loop
// out (and still hits). She's never the team's own lead, so this covers both opener and loop.

const SeraphicExecution2345 = new ActionGroup("Forte Basic - Seraphic Execution 2345", [SeraphicExecution2, SeraphicExecution3, SeraphicExecution4, SeraphicExecution5]);
const SeraphicExecution345 = new ActionGroup("Forte Basic - Seraphic Execution 345", [SeraphicExecution3, SeraphicExecution4, SeraphicExecution5]);
const SeraphicExecution45 = new ActionGroup("Forte Basic - Seraphic Execution 45", [SeraphicExecution4, SeraphicExecution5]);

const HA23 = new ActionGroup("Heavy - Volley of Death 23", [HA2, HA3]);
const HA123 = new ActionGroup("Heavy - Volley of Death 123", [HA1, HA2, HA3]);
const BA234 = new ActionGroup("Basic - Slayer's Trigger 234", [BA2, BA3, BA4]);
const BA12 = new ActionGroup("Basic - Slayer's Trigger 12", [BA1, BA2]);
const BA34 = new ActionGroup("Basic - Slayer's Trigger 34", [BA3, BA4]);
const BA23 = new ActionGroup("Basic - Slayer's Trigger 23", [BA2, BA3]);

const GB_ROTATION = new Rotation([
  Intro.holdCancel(), HA23, BA3, Encroach.cancel(), MA, BA3.mashCancel(),
  AscentOfMalice.cancel(), Liberation, ACTION_CORROSAURUS,
  SeraphicExecution2345.dodgeCancel(),
  SeraphicExecution345, 
  Outro,
]);

const GB_ROTATION_ECHO = new Rotation([
  Intro.holdCancel(), HA23, BA3, Encroach.cancel(), MA, BA3.mashCancel(),
  AscentOfMalice.cancel(), Liberation, ACTION_CORROSAURUS,
  SeraphicExecution2.hitDodge(),SeraphicExecution3.instaDodge(),
  SeraphicExecution45.dodgeCancel(), 
  SeraphicExecution3.hitDodge(),
  SeraphicExecution45.dodgeCancel(), 
  SeraphicExecution3.instaDodge(),
  SeraphicExecution45,
  Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, mainslot echo,
// sonata pieces, mainstat/substat
const GB_WEAPONS = [LUX_UMBRA, NEW_STD_PISTOL, STATIC_MIST, THUNDERBOLT, SOLAR_FLAME];
const GB_ECHOES = [new EchoLoadout(CORROSAURUS, FLAMEWING_SHADOW_3PC, CLAWPRINT_2PC)];
export const GALBRENA = new Loadout({
  id: 12081,
  resonator: GALBRENA_RESONATOR,
  weapons: GB_WEAPONS,
  echoes: new Echoes({
    sets: GB_ECHOES,
    mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
    substats: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill, Substat.Basic),
  }),
  rotation: { 0: GB_ROTATION },
  sequences: GB_SEQUENCES,
});
export const GALBRENA_ECHO = new Loadout({
  id: 12082,
  resonator: GALBRENA_RESONATOR,
  weapons: GB_WEAPONS,
  echoes: new Echoes({
    sets: GB_ECHOES,
    mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
    substats: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill, Substat.Basic),
  }),
  rotation: { 0: GB_ROTATION_ECHO },
  sequences: GB_SEQUENCES,
});
