/**
 * Brant, ported to the new engine — all six sequence nodes declared, a limited 5-star
 * (`Tier.Limited`). A fusion sword support/sub-DPS. Bravo (forte1, max 100) builds off Basic
 * Attack/Resonance Skill/Intro hits; at 100, Resonance Skill is replaced by Returned from Ashes
 * (spends it all). Liberation opens Aflame (12s): doubles Bravo gain on mid-air combo hits and
 * Resonance Skill specifically (not Intro), and swaps his ATK-from-Energy-Regen conversion
 * (Theatrical Moment -> "My" Moment, a bigger per-point rate).
 *
 * Numbers from nanoka.cc (character 1206) for MV; frames, priorities and per-hit Bravo off wuwalab
 * (Oct 19 2026), whose MV/energy/concerto/off-tune agree with the kit hit for hit.
 *
 * Interlude Applause (Intro makes the next Mid-air Attack start at stage 2) is the Intro's saved
 * chain: Mid-air Stage 2 may follow it whatever comes between. Healing is out of scope, per the
 * standing rule; Returned from Ashes' own shield isn't modelled for HP value, only as the marker.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, Position } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, matrix } from "../../engine/gear.js";
import {
  applyCurrent, isHeld,
  revokeCurrent,
  casting,
  currentCast, currentHit, addGain,
  runningAction,
  addStat,
  getStat,
  queue,
  queueOutro, queueQTE,
  removeStack,
  queueOn,
  onType,
  elapsed,
  saveChain,
  pressCut,
} from "../../engine/context.js";
import { Action, Rotation, DODGE, SWAP } from "../../engine/rotation.js";
import { tuneBreak, midairBreak, SWORD_BREAK } from "../../shared/tunebreak.js";
import { HEALS, gainShield } from "../../shared/status.js";
import { UNFLICKERING_VALOR } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS, NEW_STD_SWORD, BLOODPACTS_PLEDGE } from "../../weapons/standard.js";
import { LUMINGLOSS, FEATHER_EDGE } from "../../weapons/battlepass.js";
import { DRAGON_OF_DIRGE, TIDEBREAKING_5PC, ACTION_DRAGON_OF_DIRGE } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { Echoes } from "../../shared/echoes.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { NM_INFERNO_RIDER, MOLTEN_RIFT_5PC, ACTION_NM_INFERNO_RIDER } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function brantAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// Every action below is one hit-row family off nanoka's own damage table (character 1206),
// separated by the table's per-hit `type`: 0 = Basic, 1 = Heavy, 2 = Liberation, 3 = Intro,
// 4 = Resonance Skill. MV/energy/concerto/offtune are the summed per-hit columns. Bravo (forte1)
// is wuwalab's per-hit gain. Dodge Counter has no wuwalab row, so no recorded value.
// --- intro / outro
// updateDebuffs is his own healing marker, read by every healing sonata and weapon (statuses.ts)
// — applied to the healer alone, never the team
// Interlude Applause: "The next Mid-air Attack begins at Stage 2", ended "when Brant lands early",
// so the Intro leaves him airborne
const Intro = brantAction("Intro - Applaud for Me!", {
  endPosition: Position.Midair, updateBuffs: () => saveChain(MA1),
  qteFrames: 40, animFrames: 108, noSwapFrames: 107, castPriority: 11, motionStop: [0, 71],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 77, mv: 20279, offtune: 9600, forte1: 2000, updateDebuffs: () => applyCurrent(HEALS, 1) },
    { hitFrame: 89, mv: 5070, offtune: 2400, forte1: 500 },
  ], castConcerto: 1000,
});
const Outro = brantAction("Outro - The Course is Set!", { cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000, updateBuffs: () => queueQTE(BRANT_OUTRO) });

// --- resonance skill: Anchors Aweigh!, and liberation: To the Horizon (opens Aflame)
// "launches himself into the air"; in mid-air the button is Plunging Attack (or Returned from Ashes at full Bravo)
const Skill = brantAction("Skill - Anchors Aweigh!", { castPosition: Position.Grounded, endPosition: Position.Midair, animFrames: 40, castPriority: 4, cooldown: 60 * 4, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 9, mv: 20035, energy: 431, offtune: 6096, forte1: 473 },
    { hitFrame: 23, mv: 13357, energy: 287, offtune: 4064, forte1: 315 },
  ], castConcerto: 1000});
const Liberation = brantAction("Liberation - To the Horizon", {
  animFrames: 236, timestop: [0, 236], motionStop: [0, 144], castPriority: 10,
  cooldown: 60 * 24, endPosition: Position.Midair,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    { hitFrame: 120, commitFrame: 0, mv: 8506, offtune: 6000 },
    { hitFrame: 125, commitFrame: 0, mv: 8506, offtune: 6000 },
    { hitFrame: 130, commitFrame: 0, mv: 8506, offtune: 6000 },
    { hitFrame: 135, commitFrame: 0, mv: 8506, offtune: 6000 },
    { hitFrame: 146, commitFrame: 0, mv: 34021, offtune: 24000 },
  ], castConcerto: 2000, castEnergy: -17500,
  // Aflame opens as the Liberation ends, swapping his conversion up to its "My" Moment rate
  afterAction: () => {
    applyCurrent(AFLAME, 1);
    revokeCurrent(THEATRICAL_MOMENT);
    applyCurrent(MY_MOMENT, 1);
  },
});

/** At 100 Bravo — considered Basic Attack DMG, spends the whole gauge, and ends Aflame (if up)
 *  once it resolves — its own afterAction() below. Shields on cast, and pre-clamps an
 *  overshot Bravo back to exactly 100 so its own declared `forte1: -100` lands exactly on 0;
 *  under 100, left alone (matches Galbrena's own Purging Flame). */
const FSkill = brantAction("Forte Skill - Returned from Ashes", { minForte1: 10000,
  animFrames: 138, animPriority: { 141: 2 }, castPriority: 6, endPosition: Position.Grounded,
  node: Node.Forte, cast: Cast.Skill, type: Type.Basic, bullets: [
    {
      hitFrame: 15, mv: 4722, energy: 75, concerto: 75, offtune: 1580,
      updateDebuffs: () => {
        gainShield();
        if (isHeld(BR_S4)) applyCurrent(HEALS, 1);
      },
    },
    { hitFrame: 29, mv: 4722, energy: 75, concerto: 75, offtune: 1580 },
    { hitFrame: 49, mv: 9444, energy: 150, concerto: 150, offtune: 3160 },
    { hitFrame: 107, mv: 18887, energy: 300, concerto: 300, offtune: 6320 },
    { hitFrame: 110, commitFrame: 107, mv: 18887, energy: 300, concerto: 300, offtune: 6320 },
    { hitFrame: 115, mv: 132209, energy: 2100, concerto: 2100, offtune: 44240 },
  ], castConcerto: 2000, castForte1: -10000,
  // S6's secondary blast, 158f from the cast and committed there
  updateBuffs: () => { if (isHeld(BR_S6)) queue(AshesBlast, 158); },
  // its own end, not Aflame's: behind a swap it can run out after Aflame's 12s already has
  afterAction: () => {
    revokeCurrent(AFLAME);
    revokeCurrent(MY_MOMENT);
    applyCurrent(THEATRICAL_MOMENT, 1);
  },
});


// --- ground Captain's Rhapsody: the 4-stage Basic chain, both Heavy Attacks (the table's only
//     type=1 rows), Dodge Counter (hidden +10 concerto, per the standing rule) and the Plunging
//     Attack the Skill tree carries as a type=0 (Basic) row. None sit in a rotation.
const BA1 = brantAction("Basic - Captain's Rhapsody 1", { animFrames: 19, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 12, mv: 5053, energy: 75, concerto: 150, offtune: 2392, forte1: 130 }] });
const BA2 = brantAction("Basic - Captain's Rhapsody 2", { chains: [BA1], animFrames: 37, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 9, mv: 5070, energy: 75, concerto: 150, offtune: 2400, forte1: 131 },
    { hitFrame: 24, mv: 5070, energy: 75, concerto: 150, offtune: 2400, forte1: 131 },
  ]}); // 50.70%x2
const BA3 = brantAction("Basic - Captain's Rhapsody 3", { chains: [BA2], animFrames: 55, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 13, mv: 2206, energy: 33, concerto: 66, offtune: 1044, forte1: 57 },
    { hitFrame: 19, commitFrame: 13, mv: 2206, energy: 33, concerto: 66, offtune: 1044, forte1: 57 },
    { hitFrame: 25, commitFrame: 13, mv: 2206, energy: 33, concerto: 66, offtune: 1044, forte1: 57 },
    { hitFrame: 38, mv: 3308, energy: 49, concerto: 98, offtune: 1566, forte1: 85 },
    { hitFrame: 46, mv: 3308, energy: 49, concerto: 98, offtune: 1566, forte1: 85 },
  ]}); // 22.06%x3+33.08%x2
const BA4 = brantAction("Basic - Captain's Rhapsody 4", { chains: [BA3], animFrames: 70, animPriority: { 92: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 34, mv: 2802, energy: 42, concerto: 83, offtune: 1326, forte1: 72 },
    { hitFrame: 52, mv: 2242, energy: 34, concerto: 67, offtune: 1061, forte1: 58 },
    { hitFrame: 55, commitFrame: 52, mv: 2242, energy: 34, concerto: 67, offtune: 1061, forte1: 58 },
    { hitFrame: 59, commitFrame: 52, mv: 2242, energy: 34, concerto: 67, offtune: 1061, forte1: 58 },
    { hitFrame: 62, commitFrame: 52, mv: 2242, energy: 34, concerto: 67, offtune: 1061, forte1: 58 },
    { hitFrame: 65, commitFrame: 52, mv: 2242, energy: 34, concerto: 67, offtune: 1061, forte1: 58 },
  ]}); // 28.02%+22.42%x5
const HA = brantAction("Heavy - Captain's Rhapsody", { animFrames: 47, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 14, mv: 19755, energy: 293, concerto: 585, offtune: 9352, forte1: 725 }] });
// "After performing Basic Attack Stage 2 or Stage 4 ... After performing Mid-air Attack Stage 4"
const HARiff = brantAction("Heavy - Rhapsodic Riff", { chains: () => [BA2, BA4, MA4], animFrames: 66, animPriority: { 60: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 53, mv: 16899, energy: 250, concerto: 500, offtune: 8000, forte1: 620 }] });
// PLACEHOLDER FRAMES
const DC = brantAction("Dodge Counter - Captain's Rhapsody", { chains: [DODGE], castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 3803, energy: 57, concerto: 113, offtune: 1800 },
    { hitFrame: 0, mv: 3803, energy: 57, concerto: 113, offtune: 1800 },
    { hitFrame: 0, mv: 3803, energy: 57, concerto: 113, offtune: 1800 },
    { hitFrame: 0, mv: 5704, energy: 85, concerto: 169, offtune: 2700 },
    { hitFrame: 0, mv: 5704, energy: 85, concerto: 169, offtune: 2700 },
  ], castConcerto: 1000}); // 38.03%x3+57.04%x2
// "While in mid-air, if Bravo is not full, Resonance Skill Anchors Aweigh! is replaced with Plunging Attack"
const Plunge = brantAction("Skill - Plunging Attack", { castPosition: Position.Midair, endPosition: Position.Grounded, maxForte1: 9999, animFrames: 45, castPriority: 4, node: Node.Skill, cast: Cast.Skill, type: Type.Basic, bullets: [{ hitFrame: 32, mv: 10478, energy: 155, concerto: 310, offtune: 4960, forte1: 383 }] });

// --- mid-air Captain's Rhapsody, one action per wuwalab row: each stage, the held (Charged) form
//     of stages 1-2 in its place, the backward Flip after stages 1-3 and the stage-1 Slash (the
//     missed-Grapple branch — present for completeness, never triggered). A stage played out to its
//     end queues its own Flip there; cut, it has none. forte1 is the base (un-doubled) Bravo gain,
//     AFLAME doubles it live. The Slash has no recorded Bravo value.
const MA1 = brantAction("Mid-air - Captain's Rhapsody 1", { castPosition: Position.Midair, afterAction: () => { if (!pressCut()) queue(MAFlip1); }, animFrames: 16, castPriority: 3, bullets: [{ hitFrame: 13, mv: 12286, energy: 182, concerto: 364, offtune: 5816, forte1: 451 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
// Stage 1 held: its own hit, then the continuous attacks
const MA1C = brantAction("Mid-air - Captain's Rhapsody 1 (Charged)", { castPosition: Position.Midair, afterAction: () => { if (!pressCut()) queue(MAFlip1); }, animFrames: 155, animPriority: { 16: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 13, mv: 12286, energy: 182, concerto: 364, offtune: 5816, forte1: 451 },
    { hitFrame: 51, mv: 3325, energy: 50, concerto: 99, offtune: 1574, forte1: 122 },
    { hitFrame: 66, mv: 4987, energy: 74, concerto: 148, offtune: 2360, forte1: 183 },
    { hitFrame: 86, mv: 4156, energy: 62, concerto: 123, offtune: 1967, forte1: 153 },
    { hitFrame: 96, mv: 4156, energy: 62, concerto: 123, offtune: 1967, forte1: 153 },
    { hitFrame: 109, mv: 4156, energy: 62, concerto: 123, offtune: 1967, forte1: 153 },
    { hitFrame: 121, mv: 4156, energy: 62, concerto: 123, offtune: 1967, forte1: 153 },
    { hitFrame: 133, mv: 4156, energy: 62, concerto: 123, offtune: 1967, forte1: 153 },
    { hitFrame: 146, mv: 4156, energy: 62, concerto: 123, offtune: 1967, forte1: 153 },
  ]}); // 122.86%+33.25%+49.87%+41.56%x6
const MAFlip1 = brantAction("Mid-air - Captain's Rhapsody 1 (Flip)", { chains: [MA1, MA1C], castPosition: Position.Midair, animFrames: 31, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 3380, energy: 50, concerto: 100, offtune: 1600, forte1: 186 },
    { hitFrame: 20, mv: 5915, energy: 88, concerto: 175, offtune: 2800, forte1: 326 },
  ]}); // 33.80%+59.15%
// "Press Normal Attack after each flip to perform the next stage of Mid-air Attack."
const MA2 = brantAction("Mid-air - Captain's Rhapsody 2", { chains: [MA1, MA1C, MAFlip1], castPosition: Position.Midair, afterAction: () => { if (!pressCut()) queue(MAFlip2); }, animFrames: 54, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 27, mv: 8492, energy: 126, concerto: 252, offtune: 4020, forte1: 312 },
    { hitFrame: 46, mv: 8492, energy: 126, concerto: 252, offtune: 4020, forte1: 312 },
  ]}); // 84.92%x2
// Stage 2 held: its two hits, then the continuous attacks
const MA2C = brantAction("Mid-air - Captain's Rhapsody 2 (Charged)", { chains: [MA1, MA1C, MAFlip1], castPosition: Position.Midair, afterAction: () => { if (!pressCut()) queue(MAFlip2); }, animFrames: 114, animPriority: { 54: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 27, mv: 8492, energy: 126, concerto: 252, offtune: 4020, forte1: 312 },
    { hitFrame: 46, mv: 8492, energy: 126, concerto: 252, offtune: 4020, forte1: 312 },
    { hitFrame: 56, mv: 3287, energy: 49, concerto: 98, offtune: 1556, forte1: 211 },
    { hitFrame: 65, mv: 3287, energy: 49, concerto: 98, offtune: 1556, forte1: 211 },
    { hitFrame: 75, mv: 3287, energy: 49, concerto: 98, offtune: 1556, forte1: 211 },
    { hitFrame: 86, mv: 3287, energy: 49, concerto: 98, offtune: 1556, forte1: 211 },
    { hitFrame: 96, mv: 3287, energy: 49, concerto: 98, offtune: 1556, forte1: 211 },
    { hitFrame: 106, mv: 3287, energy: 49, concerto: 98, offtune: 1556, forte1: 211 },
  ]}); // 84.92%x2+32.87%x6
const MAFlip2 = brantAction("Mid-air - Captain's Rhapsody 2 (Flip)", { chains: [MA2, MA2C], castPosition: Position.Midair, animFrames: 29, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 3380, energy: 50, concerto: 100, offtune: 1600, forte1: 186 },
    { hitFrame: 20, mv: 5915, energy: 88, concerto: 175, offtune: 2800, forte1: 326 },
  ]}); // 33.80%+59.15%
const MA3 = brantAction("Mid-air - Captain's Rhapsody 3", { chains: [MA2, MA2C, MAFlip2, DODGE], castPosition: Position.Midair, afterAction: () => { if (!pressCut()) queue(MAFlip3); }, animFrames: 55, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 2817, energy: 42, concerto: 84, offtune: 1333, forte1: 155 },
    { hitFrame: 20, mv: 2817, energy: 42, concerto: 84, offtune: 1333, forte1: 155 },
    { hitFrame: 26, mv: 2817, energy: 42, concerto: 84, offtune: 1333, forte1: 155 },
    { hitFrame: 32, mv: 2817, energy: 42, concerto: 84, offtune: 1333, forte1: 155 },
    { hitFrame: 38, mv: 2817, energy: 42, concerto: 84, offtune: 1333, forte1: 155 },
    { hitFrame: 44, mv: 2817, energy: 42, concerto: 84, offtune: 1333, forte1: 155 },
  ]}); // 28.17%x6
// "Brant flips backward automatically after Mid-air Attack Stage 3"
const MAFlip3 = brantAction("Mid-air - Captain's Rhapsody 3 (Flip)", { chains: [MA3], castPosition: Position.Midair, animFrames: 29, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 3380, energy: 50, concerto: 100, offtune: 1600, forte1: 186 },
    { hitFrame: 20, mv: 5915, energy: 88, concerto: 175, offtune: 2800, forte1: 326 },
  ]}); // 33.80%+59.15%
// PLACEHOLDER FRAMES
const MASlash = brantAction("Mid-air - Captain's Rhapsody 1 Slash", { castPosition: Position.Midair, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 2817, energy: 42, concerto: 84, offtune: 1333 },
    { hitFrame: 0, mv: 2817, energy: 42, concerto: 84, offtune: 1333 },
    { hitFrame: 0, mv: 2817, energy: 42, concerto: 84, offtune: 1333 },
  ]}); // 28.17%x3
// lands: Rhapsodic Riff is pressed "while landed following Mid-air Attack Stage 4"
const MA4 = brantAction("Mid-air - Captain's Rhapsody 4", { chains: [MA3, MAFlip3], castPosition: Position.Midair, endPosition: Position.Grounded, animFrames: 73, animPriority: { 73: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 42, mv: 10153, energy: 151, concerto: 301, offtune: 4806, forte1: 373 },
    { hitFrame: 66, commitFrame: 42, mv: 2539, energy: 38, concerto: 76, offtune: 1202, forte1: 94 },
    { hitFrame: 71, commitFrame: 42, mv: 2539, energy: 38, concerto: 76, offtune: 1202, forte1: 94 },
    { hitFrame: 76, commitFrame: 42, mv: 2539, energy: 38, concerto: 76, offtune: 1202, forte1: 94 },
    { hitFrame: 91, commitFrame: 42, mv: 7615, energy: 113, concerto: 226, offtune: 3605, forte1: 280 },
  ]}); // 101.53%+25.39%x3+76.15%

const flip = (): boolean => runningAction(MAFlip1) || runningAction(MAFlip2) || runningAction(MAFlip3);
/** Every press the kit calls a Mid-air Attack — the chain, its flips and the Plunging Attack. What
 *  S2 and S6 both pay on. */
const midAir = (): boolean => runningAction(MA1) || runningAction(MA1C) || runningAction(MA2)
  || runningAction(MA2C) || runningAction(MA3) || flip() || runningAction(MASlash)
  || runningAction(MA4) || runningAction(Plunge)

/* ------------------------------------------------------------------------------------ buffs */

/** 12s, opened by Liberation, lost once a Returned from Ashes cast while it's up runs out. Doubles
 *  Bravo gain on mid-air combo/Resonance Skill hits (not Intro) by re-adding the same forte1. */
const AFLAME = new Buff({
  name: "Brant: Aflame", duration: 60 * 12,
  updateDebuffs: () => {
    const node = currentCast().node;
    if (node === Node.Normal || node === Node.Skill) addGain({ forte1: currentHit().forte1 });
  },
  // ...and Returned from Ashes hands the conversion back down once it runs out (its own
  // afterAction), so every hit of it still gets the Aflame rate.
});

/** +12 ATK per 1% Energy Regen over 150%, capped at +1560 (280% ER). Read in convertStats() so
 *  every ER source has landed. One of this and "My" Moment below is always held — Aflame swaps
 *  them as it comes and goes — so neither has to look at Aflame itself mid-phase. */
const THEATRICAL_MOMENT = new Buff({
  name: "Brant: Theatrical Moment",
  convertStats: () => addStat(Stat.FlatAtk, Math.min(1560, 12 * Math.max(0, getStat(Stat.ER) - 150))),
});
/** The Aflame rate: +20 a point, capped at +2600. */
const MY_MOMENT = new Buff({
  name: "Brant: \"My\" Moment",
  convertStats: () => addStat(Stat.FlatAtk, Math.min(2600, 20 * Math.max(0, getStat(Stat.ER) - 150))),
});

/** The outro handoff. */
const BRANT_OUTRO = new Buff({
  name: "Brant: Outro",
  duration: 60 * 14,
  stats: [[Stat.Amp, 20, Attribute.Fusion], [Stat.Amp, 25, Type.Skill]],
    lostOnSwap: true,
});

/** Trial by Fire and Tide (Inherent Skill) — genuinely unconditional, always equipped. */
const BR_TRIAL_INHERENT = new Inherent({
  name: "Inherent: Trial by Fire and Tide",
  stats: [[Stat.DmgBonus, 15, Attribute.Fusion]],
});

/** Voyager's Blaze (Inherent Skill) — genuinely unconditional, always equipped. */
const BR_VOYAGE_INHERENT = new Inherent({
  name: "Inherent: Voyager's Blaze",
  stats: [[Stat.HealingBonus, 20]],
});

/* --------------------------------------------------------------------------- resonance chain */

/** S1's stacks: +20% DMG dealt apiece, up to 3, as the Intro ends and on every mid-air Flip — the
 *  5s re-ups on each Flip through the chain, so it stands until the outro. */
const BY_CURRENTS = new Buff({
  name: "Brant S1: By Currents and Winds", maxStacks: 3, duration: 60 * 5,
  stats: [[Stat.DmgBonus, 20]], perStack: true,
});
const BR_S1 = new Sequence({
  name: "Brant S1: By Currents and Winds",
  updateBuffs: () => { if (flip()) applyCurrent(BY_CURRENTS, 1); },
  afterAction: () => { if (runningAction(Intro)) applyCurrent(BY_CURRENTS, 1); },
});

/** S2's outro enhancement: for 20s after The Course is Set!, the incoming resonator's Resonance
 *  Skill hits blast the target for 440% of Brant's ATK (Basic Attack DMG), once a second, twice at
 *  most. Handed to the incoming resonator like the outro itself — queued twice, one stack a blast
 *  — and fired onto Brant's own slot off their active Skill casts. */
const CourseBlast = brantAction("Outro - The Course is Set! (S2 Blast)", { node: Node.Normal, type: Type.Basic, bullets: [{ hitFrame: 3, commitFrame: 0, mv: 44000 }] });
const COURSE_BLAST = new Buff({
  name: "Brant S2: The Course is Set!", maxStacks: 2, duration: 60 * 20,
  updateBuffs: () => {
    // a Skill press of their own, not a follow-up: no two Skill presses fit inside one second
    if (!elapsed() || !casting(Cast.Skill)) return;
    queueOn(BRANT_RESONATOR, CourseBlast);
    removeStack(COURSE_BLAST, 1);
  },
});
const BR_S2 = new Sequence({
  name: "Brant S2: For Smiles and Cheers",
  // +30% Crit Rate on the mid-air presses and Returned from Ashes itself; the blast rides the outro
  applyStats: () => { if (midAir() || runningAction(FSkill)) addStat(Stat.CritRate, 30); },
  updateBuffs: () => { if (runningAction(Outro)) { queueOutro(COURSE_BLAST); queueOutro(COURSE_BLAST); } },
});

/** S3: Returned from Ashes' multiplier +42% — S6's secondary blast is 30% of that hit, so it takes
 *  the same lift. */
const BR_S3 = new Sequence({
  name: "Brant S3: Through Storms I Sail",
  applyStats: () => { if (runningAction(FSkill) || runningAction(AshesBlast)) addStat(Stat.MulMv, 42); },
});

/** S4: Returned from Ashes also heals the whole team (its +20% shield isn't modelled) — the
 *  healing marker every healing sonata/weapon reads, on Brant alone as always. */
const BR_S4 = new Sequence({ name: "Brant S4: To Freedom I Sing" });

/** S5: +15% Basic Attack DMG Bonus for 10s off any Basic Attack DMG — refreshed all visit, so it
 *  stands until the outro. */
const ACTORS_STAGE = new Buff({
  name: "Brant S5: All the World's an Actor's Stage",
  duration: 60 * 10,
  stats: [[Stat.DmgBonus, 15, Type.Basic]],
});
const BR_S5 = new Sequence({
  name: "Brant S5: All the World's an Actor's Stage",
  grants: [{ on: onType(Type.Basic), buff: ACTORS_STAGE, onHit: true }],
});

/** S6: mid-air attacks' multiplier +30%, and Returned from Ashes fires a secondary blast worth 30%
 *  of its own hit — a second Basic Attack DMG hit at 30% of its MV queued behind it, lifted by S3
 *  the same way. No gauge/energy/concerto of its own. */
const AshesBlast = brantAction("Forte - Returned from Ashes (S6 Blast)", { node: Node.Forte, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 56661 }] });
const BR_S6 = new Sequence({
  name: "Brant S6: All the World's a Captain's Carnevale",
  applyStats: () => { if (midAir()) addStat(Stat.MulMv, 30); },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
const BRANT_TALENTS = new Talent({
  name: "Brant: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 11.9999997]],
});

const BRANT_RESONATOR = new Resonator({
  id: 1206,
  name: "Brant",
  matrix: matrix("Brant", 25),
  talent: BRANT_TALENTS,
  inherent1: BR_TRIAL_INHERENT,
  inherent2: BR_VOYAGE_INHERENT,
  element: Attribute.Fusion,
  weapon: WeaponType.Sword,
  // the sword's break, but it leaves him in mid-air
  tuneBreak: midairBreak(tuneBreak(90, [0, 90], [0, 70], SWORD_BREAK)),
  color: "#d1257f",
  intro: Intro,
  swapIn: BA1,
  swapInAir: MA1,
  maxEnergy: 17500,
  forteScale: [0.01, 1, 1, 1, 1],
  maxForte1: 10000,

  combatStart: () => applyCurrent(THEATRICAL_MOMENT, 1),

  stats: [[Stat.BaseHp, 11675], [Stat.BaseAtk, 375], [Stat.BaseDef, 1307.7754]],
});

// he's never the team's own lead, so this same rotation covers both opener and loop

const BR_ROTATION = new Rotation([
  Intro, Liberation, MA2C, MA3, FSkill.swapCancel(), Outro,
]);

const BR_ROTATION_MDPS = new Rotation([
  Intro.doubleIntro(), MA2C, MA3.hitCancel(), ACTION_DRAGON_OF_DIRGE.instaDodge(), ACTION_NM_INFERNO_RIDER.instaDodge(), MA3, MA4, SWAP,
  Intro, MA2.instaCancel(), FSkill.cancel(), Liberation, 
  MA1, MA2C, MA3, MA4.hitCancel(), 
  FSkill.swapCancel(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const BRANT = new Loadout({
  id: 12061,
  resonator: BRANT_RESONATOR,
  sequences: [BR_S1, BR_S2, BR_S3, BR_S4, BR_S5, BR_S6],
  weapons: [UNFLICKERING_VALOR, EMERALD_OF_GENESIS, NEW_STD_SWORD, BLOODPACTS_PLEDGE[4]!, LUMINGLOSS, FEATHER_EDGE], // the craftable at its real R5
  echoes: new Echoes({
    sets: [
    new EchoLoadout(DRAGON_OF_DIRGE, TIDEBREAKING_5PC),
    new EchoLoadout(NM_INFERNO_RIDER, MOLTEN_RIFT_5PC),
  ],
    mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.Fusion3, Mainstat.ATK1),
    substats: substats(Substat.CritDmg, Substat.CritRate, Substat.Er, Substat.Basic, Substat.AtkPct, Substat.FlatAtk),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Liberation),
  }),
    rotation: BR_ROTATION,
});


/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const BRANT_MDPS = new Loadout({
  id: 12062,
  resonator: BRANT_RESONATOR,
  sequences: [BR_S1, BR_S2, BR_S3, BR_S4, BR_S5, BR_S6],
  weapons: [UNFLICKERING_VALOR, EMERALD_OF_GENESIS, NEW_STD_SWORD, BLOODPACTS_PLEDGE[4]!, LUMINGLOSS, FEATHER_EDGE], // the craftable at its real R5
  echoes: new Echoes({
    sets: [
    new EchoLoadout(DRAGON_OF_DIRGE, TIDEBREAKING_5PC),
    new EchoLoadout(NM_INFERNO_RIDER, MOLTEN_RIFT_5PC),
  ],
    mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.Fusion3, Mainstat.ATK1),
    substats: substats(Substat.CritDmg, Substat.CritRate, Substat.Er, Substat.Basic, Substat.AtkPct, Substat.FlatAtk),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Liberation),
  }),
    rotation: BR_ROTATION_MDPS,
});