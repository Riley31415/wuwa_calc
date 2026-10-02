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
import { HERON, MOONLIT_CLOUDS_5PC, NM_INFERNO_RIDER, MOLTEN_RIFT_5PC } from "../../echoes/jinzhou.js";

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
    { hitFrame: 106, mv: 20279, offtune: 9600, updateDebuffs: () => applyCurrent(HEALS, 1) },
    { hitFrame: 106, mv: 5070, offtune: 2400, forte1: 2500 },
  ], castConcerto: 1000,
});
const Outro = brantAction("Outro - The Course is Set!", { cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000, updateBuffs: () => queueOutro(BRANT_OUTRO) });

// --- resonance skill: Anchors Aweigh!, and liberation: To the Horizon (opens Aflame)
// PLACEHOLDER FRAMES
const Skill = brantAction("Skill - Anchors Aweigh!", { animFrames: 46, cooldown: 60 * 4, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 21, mv: 20035, energy: 431, offtune: 6096 },
    { hitFrame: 21, mv: 13357, energy: 287, offtune: 4064, forte1: 788 },
  ], castConcerto: 1000});
// PLACEHOLDER FRAMES
const Liberation = brantAction("Liberation - To the Horizon", {
  animFrames: 247, timestop: 247, motionStop: 247, prioFrames: 247,
  cooldown: 60 * 24,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    { hitFrame: 247, mv: 8506, offtune: 6000 },
    { hitFrame: 247, mv: 8506, offtune: 6000 },
    { hitFrame: 247, mv: 8506, offtune: 6000 },
    { hitFrame: 247, mv: 8506, offtune: 6000 },
    { hitFrame: 247, mv: 34021, offtune: 24000 },
  ], castConcerto: 2000, resetEnergy: true,
  // Aflame swaps his conversion up to its "My" Moment rate for as long as it lasts
  updateBuffs: () => { applyCurrent(AFLAME, 1); revokeCurrent(THEATRICAL_MOMENT); applyCurrent(MY_MOMENT, 1); },
});

/** At 100 Bravo — considered Basic Attack DMG, spends the whole gauge, and ends Aflame (if up)
 *  once it resolves — see AFLAME's own afterAction() below. Shields on cast, and pre-clamps an
 *  overshot Bravo back to exactly 100 so its own declared `forte1: -100` lands exactly on 0;
 *  under 100, left alone (matches Galbrena's own Purging Flame). */
// PLACEHOLDER FRAMES
const FSkill = brantAction("Forte Skill - Returned from Ashes", { minForte1: 10000,
  animFrames: 139,
  node: Node.Forte, cast: Cast.Skill, type: Type.Basic, bullets: [
    {
      hitFrame: 109, mv: 4722, energy: 75, concerto: 75, offtune: 1580,
      updateDebuffs: () => {
        gainShield();
        if (isHeld(BR_S4)) applyCurrent(HEALS, 1);
        if (isHeld(BR_S6)) queue(AshesBlast);
      },
    },
    { hitFrame: 109, mv: 4722, energy: 75, concerto: 75, offtune: 1580 },
    { hitFrame: 109, mv: 9444, energy: 150, concerto: 150, offtune: 3160 },
    { hitFrame: 109, mv: 18887, energy: 300, concerto: 300, offtune: 6320 },
    { hitFrame: 109, mv: 18887, energy: 300, concerto: 300, offtune: 6320 },
    { hitFrame: 109, mv: 132209, energy: 2100, concerto: 2100, offtune: 44240 },
  ], castConcerto: 2000, castForte1: -10000,
});


// TODO get exact brant forte values
// --- ground Captain's Rhapsody: the 4-stage Basic chain, both Heavy Attacks (the table's only
//     type=1 rows), Dodge Counter (hidden +10 concerto, per the standing rule) and the Plunging
//     Attack the Skill tree carries as a type=0 (Basic) row. None sit in a rotation.
const BA1 = brantAction("Basic - Captain's Rhapsody 1", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 5053, energy: 75, concerto: 150, offtune: 2392, forte1: 130 }] });
// PLACEHOLDER FRAMES
const BA2 = brantAction("Basic - Captain's Rhapsody 2", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 5070, energy: 75, concerto: 150, offtune: 2400 },
    { hitFrame: 0, mv: 5070, energy: 75, concerto: 150, offtune: 2400, forte1: 262 },
  ]}); // 50.70%x2
// PLACEHOLDER FRAMES
const BA3 = brantAction("Basic - Captain's Rhapsody 3", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 2206, energy: 33, concerto: 66, offtune: 1044 },
    { hitFrame: 0, mv: 2206, energy: 33, concerto: 66, offtune: 1044 },
    { hitFrame: 0, mv: 2206, energy: 33, concerto: 66, offtune: 1044 },
    { hitFrame: 0, mv: 3308, energy: 49, concerto: 98, offtune: 1566 },
    { hitFrame: 0, mv: 3308, energy: 49, concerto: 98, offtune: 1566, forte1: 341 },
  ]}); // 22.06%x3+33.08%x2
// PLACEHOLDER FRAMES
const BA4 = brantAction("Basic - Captain's Rhapsody 4", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 2802, energy: 42, concerto: 83, offtune: 1326 },
    { hitFrame: 0, mv: 2242, energy: 34, concerto: 67, offtune: 1061 },
    { hitFrame: 0, mv: 2242, energy: 34, concerto: 67, offtune: 1061 },
    { hitFrame: 0, mv: 2242, energy: 34, concerto: 67, offtune: 1061 },
    { hitFrame: 0, mv: 2242, energy: 34, concerto: 67, offtune: 1061 },
    { hitFrame: 0, mv: 2242, energy: 34, concerto: 67, offtune: 1061, forte1: 362 },
  ]}); // 28.02%+22.42%x5
const HA = brantAction("Heavy - Captain's Rhapsody", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 19755, energy: 293, concerto: 585, offtune: 9352, forte1: 725 }] });
const HARiff = brantAction("Heavy - Rhapsodic Riff", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 16899, energy: 250, concerto: 500, offtune: 8000, forte1: 620 }] });
// PLACEHOLDER FRAMES
const DC = brantAction("Dodge Counter - Captain's Rhapsody", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 3803, energy: 57, concerto: 113, offtune: 1800 },
    { hitFrame: 0, mv: 3803, energy: 57, concerto: 113, offtune: 1800 },
    { hitFrame: 0, mv: 3803, energy: 57, concerto: 113, offtune: 1800 },
    { hitFrame: 0, mv: 5704, energy: 85, concerto: 169, offtune: 2700 },
    { hitFrame: 0, mv: 5704, energy: 85, concerto: 169, offtune: 2700 },
  ], castConcerto: 1000}); // 38.03%x3+57.04%x2
const Plunge = brantAction("Mid-air - Plunging Attack", { animFrames: 55, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 55, mv: 10478, energy: 155, concerto: 310, offtune: 4960, forte1: 383 }] });

// --- mid-air Captain's Rhapsody, one action per hit family off the table: each stage's own hit,
//     its Charged Attack insert, the automatic backward Flip (identical rows on stages 1-3) and
//     the stage-1 Slash (the missed-Grapple branch — present for completeness, never triggered).
//     The Flip is a queued follow-up off whichever hit finishes the press: the release form of
//     stages 1-2 (the MA1/MA2 variants below), the hold finishers, and stage 3's automatic one —
//     stage 4 has none. forte1 is the base (un-doubled) Bravo gain, AFLAME doubles it live. The
//     Slash has no recorded Bravo value, so it declares none.
const MA1 = brantAction("Mid-air - Captain's Rhapsody 1", { animFrames: 48, bullets: [{ hitFrame: 34, mv: 12286, energy: 182, concerto: 364, offtune: 5816, forte1: 451 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
// PLACEHOLDER FRAMES
const MA1C = brantAction("Mid-air - Captain's Rhapsody 1 (Charged)", { animFrames: 181-48, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 133, mv: 3325, energy: 50, concerto: 99, offtune: 1574 },
    { hitFrame: 133, mv: 4987, energy: 74, concerto: 148, offtune: 2360 },
    { hitFrame: 133, mv: 4156, energy: 62, concerto: 123, offtune: 1967 },
    { hitFrame: 133, mv: 4156, energy: 62, concerto: 123, offtune: 1967 },
    { hitFrame: 133, mv: 4156, energy: 62, concerto: 123, offtune: 1967 },
    { hitFrame: 133, mv: 4156, energy: 62, concerto: 123, offtune: 1967 },
    { hitFrame: 133, mv: 4156, energy: 62, concerto: 123, offtune: 1967 },
    { hitFrame: 133, mv: 4156, energy: 62, concerto: 123, offtune: 1967, forte1: 1223 },
  ]}); // 33.25%+49.87%+41.56%x6
// PLACEHOLDER FRAMES
const MA2 = brantAction("Mid-air - Captain's Rhapsody 2", { animFrames: 88, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 74, mv: 8492, energy: 126, concerto: 252, offtune: 4020 },
    { hitFrame: 74, mv: 8492, energy: 126, concerto: 252, offtune: 4020, forte1: 624 },
  ]}); // 84.92%x2
// PLACEHOLDER FRAMES
const MA2C = brantAction("Mid-air - Captain's Rhapsody 2 (Charged)", { animFrames: 154-88, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 66, mv: 3287, energy: 49, concerto: 98, offtune: 1556 },
    { hitFrame: 66, mv: 3287, energy: 49, concerto: 98, offtune: 1556 },
    { hitFrame: 66, mv: 3287, energy: 49, concerto: 98, offtune: 1556 },
    { hitFrame: 66, mv: 3287, energy: 49, concerto: 98, offtune: 1556 },
    { hitFrame: 66, mv: 3287, energy: 49, concerto: 98, offtune: 1556 },
    { hitFrame: 66, mv: 3287, energy: 49, concerto: 98, offtune: 1556, forte1: 1266 },
  ]}); // 32.87%x6
// PLACEHOLDER FRAMES
const MA3 = brantAction("Mid-air - Captain's Rhapsody 3", { animFrames: 95, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 56, mv: 2817, energy: 42, concerto: 84, offtune: 1333 },
    { hitFrame: 56, mv: 2817, energy: 42, concerto: 84, offtune: 1333 },
    { hitFrame: 56, mv: 2817, energy: 42, concerto: 84, offtune: 1333 },
    { hitFrame: 56, mv: 2817, energy: 42, concerto: 84, offtune: 1333 },
    { hitFrame: 56, mv: 2817, energy: 42, concerto: 84, offtune: 1333 },
    { hitFrame: 56, mv: 2817, energy: 42, concerto: 84, offtune: 1333, forte1: 930 },
  ]}); // 28.17%x6
// PLACEHOLDER FRAMES
const MAFlip = brantAction("Mid-air - Captain's Rhapsody Flip", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 3380, energy: 50, concerto: 100, offtune: 1600 },
    { hitFrame: 0, mv: 5915, energy: 88, concerto: 175, offtune: 2800, forte1: 512 },
  ]}); // 33.80%+59.15%
// PLACEHOLDER FRAMES
const MASlash = brantAction("Mid-air - Captain's Rhapsody 1 Slash", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 2817, energy: 42, concerto: 84, offtune: 1333 },
    { hitFrame: 0, mv: 2817, energy: 42, concerto: 84, offtune: 1333 },
    { hitFrame: 0, mv: 2817, energy: 42, concerto: 84, offtune: 1333 },
  ]}); // 28.17%x3
// PLACEHOLDER FRAMES
const MA4 = brantAction("Mid-air - Captain's Rhapsody 4", { animFrames: 73, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 44, mv: 10153, energy: 151, concerto: 301, offtune: 4806 },
    { hitFrame: 44, mv: 2539, energy: 38, concerto: 76, offtune: 1202 },
    { hitFrame: 44, mv: 2539, energy: 38, concerto: 76, offtune: 1202 },
    { hitFrame: 44, mv: 2539, energy: 38, concerto: 76, offtune: 1202 },
    { hitFrame: 44, mv: 7615, energy: 113, concerto: 226, offtune: 3605, forte1: 935 },
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
    const a = currentAction();
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
const CourseBlast = brantAction("Outro - The Course is Set! (S2 Blast)", { node: Node.Normal, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 44000 }] });
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
  maxEnergy: 17500,
  forteScale: [0.01, 1, 1, 1, 1],
  maxForte1: 10000,

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
    new EchoLoadout(NM_INFERNO_RIDER, MOLTEN_RIFT_5PC),
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
    new EchoLoadout(NM_INFERNO_RIDER, MOLTEN_RIFT_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Er, Substat.Basic, Substat.AtkPct, Substat.FlatAtk),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.Basic, Substat.AtkPct, Substat.FlatAtk),
    rotation: BR_ROTATION_MDPS,
});