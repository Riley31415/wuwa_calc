/**
 * Brant, ported to the new engine — all six sequence nodes declared, a limited 5-star
 * (`Tier.Limited`). A fusion sword support/sub-DPS. Bravo (forte1, max 100) builds off Basic
 * Attack/Resonance Skill/Intro hits; at 100, Resonance Skill is replaced by Returned from Ashes
 * (spends it all). Liberation opens Aflame (12s): doubles Bravo gain on mid-air combo hits and
 * Resonance Skill specifically (not Intro), and swaps his ATK-from-Energy-Regen conversion
 * (Theatrical Moment -> "My" Moment, a bigger per-point rate).
 *
 * Numbers from nanoka.cc (character 1206) for MV; energy/concerto come off the old-engine
 * reference file's own numbers (÷100 relative to this file's own scale). No offtune in either
 * source, left off entirely rather than guessed at.
 *
 * Interlude Applause (Intro makes the next Mid-air Attack start at stage 2) isn't modelled — the
 * rotation below goes straight from Intro into Liberation. Healing is out of scope, per the
 * standing rule; Returned from Ashes' own shield isn't modelled for HP value, only as the marker.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, matrix } from "../../engine/gear.js";
import {
  applyCurrent, isHeld,
  revokeCurrent,
  casting,
  currentAction, pressed,
  runningAction,
  addStat,
  getStat,
  queue,
  queueOutro,
  forte1,
  removeStack,
  queueOn,
  onType,
  elapsed,
} from "../../engine/context.js";
import { Action, Rotation, ECHO, ActionGroup, INTRO, DOUBLE_INTRO } from "../../engine/rotation.js";
import { SHIELD, HEALS, gainShield } from "../../shared/status.js";
import { UNFLICKERING_VALOR } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS, NEW_STD_SWORD, BLOODPACTS_PLEDGE } from "../../weapons/standard.js";
import { DRAGON_OF_DIRGE, TIDEBREAKING_5PC } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function brantAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// Every action below is one hit-row family off nanoka's own damage table (character 1206),
// separated by the table's per-hit `type`: 0 = Basic, 1 = Heavy, 2 = Liberation, 3 = Intro,
// 4 = Resonance Skill. MV/energy/concerto/offtune are the summed per-hit columns. Bravo (forte1)
// comes from neither source — nanoka's damage rows carry no forte column and wuwalab has no
// per-hit data for him at all, so these came over from the migrated sheet and were halved by hand
// afterwards to match how the gauge actually fills in play. Dodge Counter has no recorded value.
// --- intro / outro
// updateDebuffs is his own healing marker, read by every healing sonata and weapon (statuses.ts)
// — applied to the healer alone, never the team
// PLACEHOLDER FRAMES
const Intro = brantAction("Intro - Applaud for Me!", {
  animFrames: 106,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 106, mv: 202.79, offtune: 9599.9053, updateDebuffs: () => applyCurrent(HEALS, 1) },
    { hitFrame: 106, mv: 50.7, offtune: 2400.0947, forte1: 25 },
  ], castConcerto: 10,
});
const Outro = brantAction("Outro - The Course is Set!", { cast: Cast.Outro, castConcerto: -100, updateBuffs: () => queueOutro(BRANT_OUTRO) });

// --- resonance skill: Anchors Aweigh!, and liberation: To the Horizon (opens Aflame)
// PLACEHOLDER FRAMES
const Skill = brantAction("Skill - Anchors Aweigh!", { animFrames: 46, cooldown: 60 * 4, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 21, mv: 200.35, energy: 4.308, offtune: 6095.9391 },
    { hitFrame: 21, mv: 133.57, energy: 2.872, offtune: 4064.0609, forte1: 7.88 },
  ], castConcerto: 10});
// PLACEHOLDER FRAMES
const Liberation = brantAction("Liberation - To the Horizon", {
  animFrames: 247, timestop: 247, motionStop: 247, prioFrames: 247,
  cooldown: 60 * 24,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    { hitFrame: 247, mv: 85.06, offtune: 6000.2645 },
    { hitFrame: 247, mv: 85.06, offtune: 6000.2645 },
    { hitFrame: 247, mv: 85.06, offtune: 6000.2645 },
    { hitFrame: 247, mv: 85.06, offtune: 6000.2645 },
    { hitFrame: 247, mv: 340.21, offtune: 23998.942 },
  ], castConcerto: 20, resetEnergy: true,
  // Aflame swaps his conversion up to its "My" Moment rate for as long as it lasts
  updateBuffs: () => { applyCurrent(AFLAME, 1); revokeCurrent(THEATRICAL_MOMENT); applyCurrent(MY_MOMENT, 1); },
});

/** At 100 Bravo — considered Basic Attack DMG, spends the whole gauge, and ends Aflame (if up)
 *  once it resolves — see AFLAME's own afterAction() below. Shields on cast, and pre-clamps an
 *  overshot Bravo back to exactly 100 so its own declared `forte1: -100` lands exactly on 0;
 *  under 100, left alone (matches Galbrena's own Purging Flame). */
// PLACEHOLDER FRAMES
const FSkill = brantAction("Forte Skill - Returned from Ashes", {
  animFrames: 139,
  node: Node.Forte, cast: Cast.Skill, type: Type.Basic, bullets: [
    {
      hitFrame: 109, mv: 47.22, energy: 0.75, concerto: 0.75, offtune: 1580.0753,
      updateDebuffs: () => {
        gainShield();
        if (isHeld(BR_S4)) applyCurrent(HEALS, 1);
        if (isHeld(BR_S6)) queue(AshesBlast);
      },
    },
    { hitFrame: 109, mv: 47.22, energy: 0.75, concerto: 0.75, offtune: 1580.0753 },
    { hitFrame: 109, mv: 94.44, energy: 1.5001, concerto: 1.5001, offtune: 3160.1506 },
    { hitFrame: 109, mv: 188.87, energy: 3, concerto: 3, offtune: 6319.9665 },
    { hitFrame: 109, mv: 188.87, energy: 3, concerto: 3, offtune: 6319.9665 },
    { hitFrame: 109, mv: 1322.09, energy: 20.9999, concerto: 20.9999, offtune: 44239.7658 },
  ], castConcerto: 20, castForte1: -100,
});


// TODO get exact brant forte values
// --- ground Captain's Rhapsody: the 4-stage Basic chain, both Heavy Attacks (the table's only
//     type=1 rows), Dodge Counter (hidden +10 concerto, per the standing rule) and the Plunging
//     Attack the Skill tree carries as a type=0 (Basic) row. None sit in a rotation.
const BA1 = brantAction("Basic - Captain's Rhapsody 1", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 50.53, energy: 0.75, concerto: 1.5, offtune: 2392, forte1: 1.3 });
// PLACEHOLDER FRAMES
const BA2 = brantAction("Basic - Captain's Rhapsody 2", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 50.7, energy: 0.75, concerto: 1.5, offtune: 2400 },
    { hitFrame: 0, mv: 50.7, energy: 0.75, concerto: 1.5, offtune: 2400, forte1: 2.62 },
  ]}); // 50.70%x2
// PLACEHOLDER FRAMES
const BA3 = brantAction("Basic - Captain's Rhapsody 3", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 22.06, energy: 0.3284, concerto: 0.6568, offtune: 1044.1578 },
    { hitFrame: 0, mv: 22.06, energy: 0.3284, concerto: 0.6568, offtune: 1044.1578 },
    { hitFrame: 0, mv: 22.06, energy: 0.3284, concerto: 0.6568, offtune: 1044.1578 },
    { hitFrame: 0, mv: 33.08, energy: 0.4924, concerto: 0.9849, offtune: 1565.7633 },
    { hitFrame: 0, mv: 33.08, energy: 0.4924, concerto: 0.9847, offtune: 1565.7633, forte1: 3.41 },
  ]}); // 22.06%x3+33.08%x2
// PLACEHOLDER FRAMES
const BA4 = brantAction("Basic - Captain's Rhapsody 4", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 28.02, energy: 0.4239, concerto: 0.8359, offtune: 1326.0107 },
    { hitFrame: 0, mv: 22.42, energy: 0.3392, concerto: 0.6688, offtune: 1060.9979 },
    { hitFrame: 0, mv: 22.42, energy: 0.3392, concerto: 0.6688, offtune: 1060.9979 },
    { hitFrame: 0, mv: 22.42, energy: 0.3392, concerto: 0.6688, offtune: 1060.9979 },
    { hitFrame: 0, mv: 22.42, energy: 0.3392, concerto: 0.6688, offtune: 1060.9979 },
    { hitFrame: 0, mv: 22.42, energy: 0.3393, concerto: 0.6689, offtune: 1060.9977, forte1: 3.62 },
  ]}); // 28.02%+22.42%x5
const HA = brantAction("Heavy - Captain's Rhapsody", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, mv: 197.55, energy: 2.93, concerto: 5.85, offtune: 9352, forte1: 7.25 });
const HARiff = brantAction("Heavy - Rhapsodic Riff", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, mv: 168.99, energy: 2.5, concerto: 5, offtune: 8000, forte1: 6.2 });
// PLACEHOLDER FRAMES
const DC = brantAction("Dodge Counter - Captain's Rhapsody", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 38.03, energy: 0.5684, concerto: 1.1284, offtune: 1800.0789 },
    { hitFrame: 0, mv: 38.03, energy: 0.5684, concerto: 1.1284, offtune: 1800.0789 },
    { hitFrame: 0, mv: 38.03, energy: 0.5684, concerto: 1.1284, offtune: 1800.0789 },
    { hitFrame: 0, mv: 57.04, energy: 0.8525, concerto: 1.6924, offtune: 2699.8817 },
    { hitFrame: 0, mv: 57.04, energy: 0.8523, concerto: 1.6924, offtune: 2699.8816 },
  ], castConcerto: 10}); // 38.03%x3+57.04%x2
const Plunge = brantAction("Mid-air - Plunging Attack", { animFrames: 55, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 104.78, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 3.83 });

// --- mid-air Captain's Rhapsody, one action per hit family off the table: each stage's own hit,
//     its Charged Attack insert, the automatic backward Flip (identical rows on stages 1-3) and
//     the stage-1 Slash (the missed-Grapple branch — present for completeness, never triggered).
//     The Flip is a queued follow-up off whichever hit finishes the press: the release form of
//     stages 1-2 (the MA1/MA2 variants below), the hold finishers, and stage 3's automatic one —
//     stage 4 has none. forte1 is the base (un-doubled) Bravo gain, AFLAME doubles it live. The
//     Slash has no recorded Bravo value, so it declares none.
const MA1 = brantAction("Mid-air - Captain's Rhapsody 1", { animFrames: 48, bullets: [{ hitFrame: 34, mv: 122.86, energy: 1.82, concerto: 3.64, offtune: 5816, forte1: 4.51 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
// PLACEHOLDER FRAMES
const MA1C = brantAction("Mid-air - Captain's Rhapsody 1 (Charged)", { animFrames: 181-48, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 133, mv: 33.25, energy: 0.496, concerto: 0.9851, offtune: 1573.6947 },
    { hitFrame: 133, mv: 49.87, energy: 0.744, concerto: 1.4774, offtune: 2360.3053 },
    { hitFrame: 133, mv: 41.56, energy: 0.62, concerto: 1.2312, offtune: 1967 },
    { hitFrame: 133, mv: 41.56, energy: 0.62, concerto: 1.2312, offtune: 1967 },
    { hitFrame: 133, mv: 41.56, energy: 0.62, concerto: 1.2312, offtune: 1967 },
    { hitFrame: 133, mv: 41.56, energy: 0.62, concerto: 1.2312, offtune: 1967 },
    { hitFrame: 133, mv: 41.56, energy: 0.62, concerto: 1.2312, offtune: 1967 },
    { hitFrame: 133, mv: 41.56, energy: 0.62, concerto: 1.2315, offtune: 1967, forte1: 12.23 },
  ]}); // 33.25%+49.87%+41.56%x6
// PLACEHOLDER FRAMES
const MA2 = brantAction("Mid-air - Captain's Rhapsody 2", { animFrames: 88, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 74, mv: 84.92, energy: 1.26, concerto: 2.52, offtune: 4020 },
    { hitFrame: 74, mv: 84.92, energy: 1.26, concerto: 2.52, offtune: 4020, forte1: 6.24 },
  ]}); // 84.92%x2
// PLACEHOLDER FRAMES
const MA2C = brantAction("Mid-air - Captain's Rhapsody 2 (Charged)", { animFrames: 154-88, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 66, mv: 32.87, energy: 0.49, concerto: 0.98, offtune: 1556 },
    { hitFrame: 66, mv: 32.87, energy: 0.49, concerto: 0.98, offtune: 1556 },
    { hitFrame: 66, mv: 32.87, energy: 0.49, concerto: 0.98, offtune: 1556 },
    { hitFrame: 66, mv: 32.87, energy: 0.49, concerto: 0.98, offtune: 1556 },
    { hitFrame: 66, mv: 32.87, energy: 0.49, concerto: 0.98, offtune: 1556 },
    { hitFrame: 66, mv: 32.87, energy: 0.49, concerto: 0.98, offtune: 1556, forte1: 12.66 },
  ]}); // 32.87%x6
// PLACEHOLDER FRAMES
const MA3 = brantAction("Mid-air - Captain's Rhapsody 3", { animFrames: 95, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 56, mv: 28.17, energy: 0.42, concerto: 0.84, offtune: 1333 },
    { hitFrame: 56, mv: 28.17, energy: 0.42, concerto: 0.84, offtune: 1333 },
    { hitFrame: 56, mv: 28.17, energy: 0.42, concerto: 0.84, offtune: 1333 },
    { hitFrame: 56, mv: 28.17, energy: 0.42, concerto: 0.84, offtune: 1333 },
    { hitFrame: 56, mv: 28.17, energy: 0.42, concerto: 0.84, offtune: 1333 },
    { hitFrame: 56, mv: 28.17, energy: 0.42, concerto: 0.84, offtune: 1333, forte1: 9.3 },
  ]}); // 28.17%x6
// PLACEHOLDER FRAMES
const MAFlip = brantAction("Mid-air - Captain's Rhapsody Flip", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 33.8, energy: 0.5018, concerto: 1, offtune: 1600 },
    { hitFrame: 0, mv: 59.15, energy: 0.8782, concerto: 1.75, offtune: 2800, forte1: 5.12 },
  ]}); // 33.80%+59.15%
// PLACEHOLDER FRAMES
const MASlash = brantAction("Mid-air - Captain's Rhapsody 1 Slash", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 28.17, energy: 0.42, concerto: 0.84, offtune: 1333 },
    { hitFrame: 0, mv: 28.17, energy: 0.42, concerto: 0.84, offtune: 1333 },
    { hitFrame: 0, mv: 28.17, energy: 0.42, concerto: 0.84, offtune: 1333 },
  ]}); // 28.17%x3
// PLACEHOLDER FRAMES
const MA4 = brantAction("Mid-air - Captain's Rhapsody 4", { animFrames: 73, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 44, mv: 101.53, energy: 1.5119, concerto: 3.0197, offtune: 4806.3266 },
    { hitFrame: 44, mv: 25.39, energy: 0.3781, concerto: 0.7551, offtune: 1201.9367 },
    { hitFrame: 44, mv: 25.39, energy: 0.3781, concerto: 0.7551, offtune: 1201.9367 },
    { hitFrame: 44, mv: 25.39, energy: 0.3781, concerto: 0.7551, offtune: 1201.9367 },
    { hitFrame: 44, mv: 76.15, energy: 1.1338, concerto: 2.265, offtune: 3604.8633, forte1: 9.35 },
  ]}); // 101.53%+25.39%x3+76.15%

/** Every press the kit calls a Mid-air Attack: the eight of them, plus the flip-queuing variants
 *  above — a `variant()` is its own Action, so it has to be named here alongside the press it
 *  copies — and the Plunging Attack, which is a Mid-air Attack too. What S2 and S6 both pay on. */
const midAir = (): boolean => runningAction(MA1) || runningAction(MA1C) || runningAction(MA2)
  || runningAction(MA2C) || runningAction(MA3) || runningAction(MAFlip) || runningAction(MASlash)
  || runningAction(MA4) || runningAction(Plunge)

/* ------------------------------------------------------------------------------------ buffs */

/** 12s, opened by Liberation, lost once a Returned from Ashes cast while it's up runs out. Doubles
 *  Bravo gain on mid-air combo/Resonance Skill hits (not Intro) by re-adding the same forte1. */
const AFLAME = new Buff({
  name: "Brant: Aflame", duration: 60 * 12,
  applyStats: () => {
    const a = pressed();
    if (a.node === Node.Normal || a.node === Node.Skill) addStat(Stat.AddForte1, a.forte1 - a.castForte[0]!);
  },
  // ...and hands the conversion back down once that press runs out, so every hit of it still
  // gets the Aflame rate.
  afterAction: () => {
    if (!runningAction(FSkill)) return;
    revokeCurrent(AFLAME);
    revokeCurrent(MY_MOMENT); applyCurrent(THEATRICAL_MOMENT, 1);
  },
});

/** +12 ATK per 1% Energy Regen over 150%, capped at +1560 (280% ER). Read in convertStats() so
 *  every ER source has landed. One of this and "My" Moment below is always held — Aflame swaps
 *  them as it comes and goes — so neither has to look at Aflame itself mid-phase. */
const THEATRICAL_MOMENT = new Buff({
  name: "Brant: Theatrical Moment",
  convertStats: () => addStat(Stat.FlatAtk, Math.min(1560, 12 * Math.max(0, getStat(Stat.Er) - 150))),
});
/** The Aflame rate: +20 a point, capped at +2600. */
const MY_MOMENT = new Buff({
  name: "Brant: \"My\" Moment",
  convertStats: () => addStat(Stat.FlatAtk, Math.min(2600, 20 * Math.max(0, getStat(Stat.Er) - 150))),
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

/** S1's stacks: +20% DMG dealt apiece, up to 3, off the Intro and every mid-air Flip — the 5s
 *  re-ups on each Flip through the chain, so it stands until the outro. */
const BY_CURRENTS = new Buff({
  name: "Brant S1: By Currents and Winds", maxStacks: 3, duration: 60 * 5,
  stats: [[Stat.DmgBonus, 20]], perStack: true,
});
const BR_S1 = new Sequence({
  name: "Brant S1: By Currents and Winds",
  updateBuffs: () => { if (runningAction(Intro) || runningAction(MAFlip)) applyCurrent(BY_CURRENTS, 1); },
});

/** S2's outro enhancement: for 20s after The Course is Set!, the incoming resonator's Resonance
 *  Skill hits blast the target for 440% of Brant's ATK (Basic Attack DMG), once a second, twice at
 *  most. Handed to the incoming resonator like the outro itself — queued twice, one stack a blast
 *  — and fired onto Brant's own slot off their active Skill casts. */
const CourseBlast = brantAction("Outro - The Course is Set! (S2 Blast)", { node: Node.Normal, type: Type.Basic, mv: 440 });
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
const AshesBlast = brantAction("Forte - Returned from Ashes (S6 Blast)", { node: Node.Forte, type: Type.Basic, mv: 1888.71 * 0.3 });
const BR_S6 = new Sequence({
  name: "Brant S6: All the World's a Captain's Carnevale",
  applyStats: () => { if (midAir()) addStat(Stat.MulMv, 30); },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
const BRANT_TALENTS = new Talent({
  name: "Brant: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const BRANT_RESONATOR = new Resonator({
  name: "Brant",
  matrix: matrix("Brant", 25),
  talent: BRANT_TALENTS,
  inherent1: BR_TRIAL_INHERENT,
  inherent2: BR_VOYAGE_INHERENT,
  element: Attribute.Fusion,
  weapon: WeaponType.Sword,
  color: "#d1257f",
  intro: Intro,
  maxEnergy: 175,
  maxForte1: 100,

  combatStart: () => applyCurrent(THEATRICAL_MOMENT, 1),

  stats: [[Stat.BaseHp, 11675], [Stat.BaseAtk, 375], [Stat.BaseDef, 1307.7754]],
});

// he's never the team's own lead, so this same rotation covers both opener and loop

const MA1H = new ActionGroup("Mid-air - Captain's Rhapsody 1 (Hold)", [MA1, MA1C, MAFlip]);
const MA2H = new ActionGroup("Mid-air - Captain's Rhapsody 2 (Hold)", [MA2, MA2C, MAFlip]);

const BR_ROTATION = new Rotation([
  INTRO, Liberation, MA2H, MA3.cancel(), ECHO.instaDodge(), MA3.cancel(), FSkill.swapCancel(), Outro,
]);

const BR_ROTATION_MDPS = new Rotation([
  DOUBLE_INTRO, MA2H, MA3.cancel(), ECHO.instaDodge(), MA3, MAFlip, MA4.instaSwap(),
  INTRO, FSkill.cancel(), Liberation, MA1H, MA2H, MA3.cancel(), FSkill.swapCancel(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const BRANT = new Loadout({
  resonator: BRANT_RESONATOR,
  sequences: [BR_S1, BR_S2, BR_S3, BR_S4, BR_S5, BR_S6],
  weapons: [UNFLICKERING_VALOR, EMERALD_OF_GENESIS, NEW_STD_SWORD, BLOODPACTS_PLEDGE[4]!], // the craftable at its real R5
  echoLoadouts: [
    new EchoLoadout(DRAGON_OF_DIRGE, TIDEBREAKING_5PC),
    //new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC), cant heron midair
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Er, Substat.Basic, Substat.AtkPct, Substat.FlatAtk),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.Basic, Substat.AtkPct, Substat.FlatAtk),
    rotation: BR_ROTATION,
});


/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const BRANT_MDPS = new Loadout({
  resonator: BRANT_RESONATOR,
  sequences: [BR_S1, BR_S2, BR_S3, BR_S4, BR_S5, BR_S6],
  weapons: [UNFLICKERING_VALOR, EMERALD_OF_GENESIS, NEW_STD_SWORD, BLOODPACTS_PLEDGE[4]!], // the craftable at its real R5
  echoLoadouts: [
    new EchoLoadout(DRAGON_OF_DIRGE, TIDEBREAKING_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Er, Substat.Basic, Substat.AtkPct, Substat.FlatAtk),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.Basic, Substat.AtkPct, Substat.FlatAtk),
    rotation: BR_ROTATION_MDPS,
});