/**
 * Aemeath — a Fusion Sword main DPS whose damage is nearly all Resonance Liberation DMG, built on
 * the Tune Break variants (see tunebreak.ts) and, in her other mode, Fusion Burst.
 *
 * Two forms, walked by the rotation: Aemeath and her Mech share every gauge and stat, each with its
 * own basic chain, heavies and dodge counter. The Sync Strikes, the Seraphic Duets and both
 * liberations flip form as they land. Both heavies are Resonance Liberation DMG.
 *
 * Her loop is the two gauges. **Synchronization Rate** (forte1, 0-200) builds off basics, dodge
 * counters and Sync Strikes, +40 on an Intro and +30 on Overdrive; Stage 4 of either chain opens
 * Seraphic Duo, where a Duet spends 100 of it. **Resonance Rate** (forte2, 0-4) gains 1 per Duet
 * and 1 per Overdrive (2 with Starlume Acceleration, off the Intro). Overdrive opens Heavenfall
 * Edict: Unbound; at 4 Resonance Rate under Unbound she enters Instant Response, where a Charged
 * II heavy is amplified 200% and refills the Synchronization Rate, and then Finale (1789%) spends
 * both gauges whole.
 *
 * The *modes* are `ResonanceMode` gear, one loadout each, the Denia/Lynae shape:
 * - **Tune Rupture**: her listed casts lay Tune Rupture - Shifting; she answers a Rupture break with
 *   Starburst; every Rupture response on the team banks 10 Rupturous Trail on the target, which a
 *   Seraphic Duet spends into its own volley of Tune Rupture DMG. Between the Stars, Silent
 *   Protection, Stardust and the Trail each carry their own effect.
 * - **Fusion Burst**: the same casts lay a Fusion Burst stack; Fusion Trail mirrors every stack the
 *   team lands; the status calculates past 5 stacks at the cap's rung and an empty target gets one
 *   back; a Seraphic Duet calculates it again at the cap's rung without spending the stacks, +10%
 *   multiplier a Trail stack. Between the Stars is 30% x2, the Outro upgrades on Fusion Burst.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1210, the 3.6+365 static JSON the page
 * fetches) at skill level 10. Per-hit Synchronization Rate off wuwalab (forte_2 x100), which nanoka
 * doesn't list; wuwalab omits Mid-air Attack - Mech entirely, so that cast is left out rather than
 * given an invented gauge value. Form Switch (no damage, auto-casts the new form's Stage 1) isn't an
 * action: a rotation flips form through a Sync Strike, a Duet or a liberation.
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling, Position } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, ResonanceMode, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  addStat,
  addBuff,
  revokeBuff,
  applyCurrent,
  applyEnemy,
  applied,
  appliedByMember,
  casting,
  isType,
  runningAction,
  currentMember,
  currentTeam,
  isHeld,
  frozenStacks,
  applyTeam,
  asActor,
  maxStackIncrease,
  queue,
  queueOn,
  removeStack,
  revokeCurrent,
  revokeEnemy,
  consume,
  stacksOf,
  stacksOfEnemy,
  forte2,
  inflicting,
  addGain,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, INTRO, OUTRO, START, DODGE } from "../../engine/rotation.js";
import { TUNE_RUPTURE_SHIFTING, TUNE_SHIFTABLE, TUNE_BREAK, applyRupture, tuneRuptureResponse, tuneBreak, SWORD_BREAK } from "../../shared/tunebreak.js";
import { FUSION_BURST, FUSION_BURST_ACTIONS, queueOnApplier } from "../../shared/status.js";
import { EVERBRIGHT_POLESTAR } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { SIGILLUM, TRAILBLAZING_STAR_5PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* =================================================================================== shared */

/* ----------------------------------------------------------------------------------- actions */

function aemeathAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

/** Which form she is in: exactly one of the two stands, Aemeath's from the fight's start. Each
 *  form's presses require their own; every cast that switches her swaps them. */
const AEMEATH_FORM = new Buff({ name: "Aemeath: Aemeath Form" });
const MECH_FORM = new Buff({ name: "Aemeath: Mech Form" });

/** Seraphic Duo: 5s off either Stage 4; a Duet needs it and exits it, as Finale ends it. */
const SERAPHIC_DUO = new Buff({
  name: "Aemeath: Seraphic Duo",
  duration: 60 * 5,
});

/** Heavenfall Edict: Unbound — 60s off Overdrive, until Finale, which needs it. The first action
 *  that leaves the Resonance Rate at its cap of 4 while this is held enters Instant Response. */
const UNBOUND = new Buff({
  name: "Aemeath: Heavenfall Edict - Unbound",
  duration: 60 * 60,
  // ends Instant Response here too, so re-entering it off the same press can't race that end
  afterAction: () => {
    if (runningAction(AHA2) || runningAction(MHA2) || runningAction(Lib2)) revokeCurrent(INSTANT_RESPONSE);
    if (runningAction(Lib2)) revokeCurrent(UNBOUND);
    else if (forte2() >= 4) applyCurrent(INSTANT_RESPONSE, 1);
  },
});

function toMech(): void {
  revokeCurrent(AEMEATH_FORM);
  applyCurrent(MECH_FORM, 1);
}
function toAemeath(): void {
  revokeCurrent(MECH_FORM);
  applyCurrent(AEMEATH_FORM, 1);
}
const TO_MECH = { updateBuffs: toMech };
const TO_AEMEATH = { updateBuffs: toAemeath };
const DUO = { updateBuffs: () => applyCurrent(SERAPHIC_DUO, 1) };
const AE = { requireBuff: AEMEATH_FORM };
const MECH = { requireBuff: MECH_FORM };

// --- Aemeath form. forte1 is the Synchronization Rate each hit recovers; heavies recover none.
//     The dodge counter carries the hidden +10 Concerto every dodge counter gets (CLAUDE.md).
const ABA1 = aemeathAction("Basic - Aemeath 1", { ...AE, animFrames: 23, animPriority: { 25: 1 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 16, mv: 4635, energy: 84, concerto: 167, offtune: 2664, forte1: 329 }]});
// Stage 2 also comes "shortly after" Charged I, her plunge, Call of Dawn and Seraphic Duet: Encore
const ABA2 = aemeathAction("Basic - Aemeath 2", { chains: () => [ABA1, AHA1, AMA, CallOfDawn, MechFSkill], ...AE, animFrames: 43, animPriority: { 45: 1 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 6, mv: 1389, energy: 25, concerto: 50, offtune: 799, forte1: 129 },
    { hitFrame: 11, mv: 2084, energy: 38, concerto: 75, offtune: 1198, forte1: 193 },
    { hitFrame: 23, mv: 3473, energy: 63, concerto: 125, offtune: 1996, forte1: 322 },
  ]});
/** "Inflict Tune Rupture - Shifting/Fusion Burst when the following skills deal damage. The same
 *  skill can only trigger this effect on the same target once every 3s": each listed skill lays
 *  on any of its hits through its own 3s window. */
function laysEvery3s(skill: string): { updateDebuffs: () => void } {
  const icd = new Buff({ name: `Aemeath: ${skill} (lay cooldown)`, duration: 60 * 3 });
  return {
    updateDebuffs: () => {
      if (isHeld(icd)) return;
      applyCurrent(icd, 1);
      aemeathLays();
    },
  };
}
// ...Stage 3 after Charged II and Songs Across the Universe, Stage 4 after her Dodge Counter
// "Press Normal Attack shortly after casting Tune Break to cast Basic Attack Stage 3"
const ABA3 = aemeathAction("Basic - Aemeath 3", { chains: () => [ABA2, AHA2, Intro, TUNE_BREAK], ...AE, ...laysEvery3s("Aemeath 3"), animFrames: 46, animPriority: { 48: 1 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 4, mv: 932, energy: 17, concerto: 34, offtune: 536, forte1: 167 },
    { hitFrame: 12, mv: 932, energy: 17, concerto: 34, offtune: 536, forte1: 167 },
    { hitFrame: 18, mv: 932, energy: 17, concerto: 34, offtune: 536, forte1: 167 },
    { hitFrame: 25, mv: 1863, energy: 34, concerto: 67, offtune: 1071, forte1: 333 },
    { hitFrame: 27, mv: 4656, energy: 84, concerto: 168, offtune: 2676, forte1: 832 },
  ]});
const ABA4 = aemeathAction("Basic - Aemeath 4", { chains: () => [ABA3, ADC], ...AE, ...laysEvery3s("Aemeath 4"), animFrames: 60, animPriority: { 62: 1 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 673, energy: 13, concerto: 25, offtune: 387, forte1: 117 },
    { hitFrame: 2, mv: 673, energy: 13, concerto: 25, offtune: 387, forte1: 117 },
    { hitFrame: 11, mv: 673, energy: 13, concerto: 25, offtune: 387, forte1: 117 },
    { hitFrame: 20, mv: 673, energy: 13, concerto: 25, offtune: 387, forte1: 117 },
    { hitFrame: 29, mv: 673, energy: 13, concerto: 25, offtune: 387, forte1: 117 },
    { hitFrame: 46, mv: 10094, energy: 182, concerto: 363, offtune: 5802, forte1: 1746 },
  ], ...DUO });
const AHA1 = aemeathAction("Heavy - Aemeath: Charged I", { castPriority: 2, ...AE, node: Node.Normal, cast: Cast.Heavy, type: Type.Liberation, bullets: [{ hitFrame: 0, mv: 9283, energy: 168, concerto: 334, offtune: 5337 }], updateDebuffs: () => { if (isHeld(AE_S3) && isHeld(INSTANT_RESPONSE)) aemeathLays(); } });
const AHA2 = aemeathAction("Heavy - Aemeath: Charged II", { ...AE, animFrames: 95, animPriority: { 96: 1 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Liberation, bullets: [
    { hitFrame: 44, mv: 1160, energy: 21, concerto: 42, offtune: 667, updateDebuffs: () => { if (isHeld(AE_S3) && isHeld(INSTANT_RESPONSE)) aemeathLays(); } },
    { hitFrame: 49, commitFrame: 44, mv: 1160, energy: 21, concerto: 42, offtune: 667 },
    { hitFrame: 60, mv: 1160, energy: 21, concerto: 42, offtune: 667 },
    { hitFrame: 66, commitFrame: 60, mv: 1160, energy: 21, concerto: 42, offtune: 667 },
    { hitFrame: 81, mv: 18560, energy: 334, concerto: 667, offtune: 10669 },
  ]});
const AMA = aemeathAction("Mid-air - Aemeath Plunge", { castPosition: Position.Midair, endPosition: Position.Grounded, ...AE, animFrames: 53, animPriority: { 49: 2, 53: 1 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 42, mv: 8629, energy: 155, concerto: 310, offtune: 4960, forte1: 1171 }]});
const ADC = aemeathAction("Dodge Counter - Aemeath", { chains: [DODGE], ...AE, animFrames: 54, animPriority: { 0: 2, 54: 1 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 4, mv: 2602, energy: 32, concerto: 64, offtune: 1016, forte1: 290 },
    { hitFrame: 12, mv: 2602, energy: 32, concerto: 64, offtune: 1016, forte1: 290 },
    { hitFrame: 18, mv: 2602, energy: 32, concerto: 64, offtune: 1016, forte1: 290 },
    { hitFrame: 25, mv: 5203, energy: 64, concerto: 127, offtune: 2031, forte1: 580 },
    { hitFrame: 27, mv: 13006, energy: 159, concerto: 318, offtune: 5076, forte1: 1449 },
  ], castConcerto: 1000});

// --- Mech form
const MBA1 = aemeathAction("Basic - Mech 1", { ...MECH, animFrames: 33, animPriority: { 35: 1 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 2320, energy: 42, concerto: 84, offtune: 1334, forte1: 215 },
    { hitFrame: 20, commitFrame: 12, mv: 2320, energy: 42, concerto: 84, offtune: 1334, forte1: 215 },
    { hitFrame: 28, commitFrame: 12, mv: 2320, energy: 42, concerto: 84, offtune: 1334, forte1: 215 },
  ]});
// Mech Stage 2 also comes after Charged I, Armament Merge, Overdrive and Seraphic Duet: Overture
const MBA2 = aemeathAction("Basic - Mech 2", { chains: () => [MBA1, MHA1, ArmamentMerge, Lib1, AmyFSkill], ...MECH, animFrames: 47, animPriority: { 49: 1 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 1857, energy: 34, concerto: 67, offtune: 1068, forte1: 192 },
    { hitFrame: 31, mv: 7426, energy: 134, concerto: 267, offtune: 4269, forte1: 768 },
  ]});
// ...Stage 3 after Charged II and Debut of Meteoric Radiance, Stage 4 after the Mech Dodge Counter
const MBA3 = aemeathAction("Basic - Mech 3", { chains: () => [MBA2, MHA2, EIntro, TUNE_BREAK], ...MECH, ...laysEvery3s("Mech 3"), animFrames: 64, animPriority: { 66: 1 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 1165, energy: 21, concerto: 42, offtune: 670, forte1: 199 },
    { hitFrame: 10, mv: 389, energy: 7, concerto: 14, offtune: 224, forte1: 67 },
    { hitFrame: 14, commitFrame: 10, mv: 389, energy: 7, concerto: 14, offtune: 224, forte1: 67 },
    { hitFrame: 19, commitFrame: 10, mv: 389, energy: 7, concerto: 14, offtune: 224, forte1: 67 },
    { hitFrame: 23, commitFrame: 10, mv: 389, energy: 7, concerto: 14, offtune: 224, forte1: 67 },
    { hitFrame: 28, commitFrame: 10, mv: 389, energy: 7, concerto: 14, offtune: 224, forte1: 67 },
    { hitFrame: 32, commitFrame: 10, mv: 389, energy: 7, concerto: 14, offtune: 224, forte1: 67 },
    { hitFrame: 51, mv: 8154, energy: 147, concerto: 293, offtune: 4688, forte1: 1387 },
  ]});
const MBA4 = aemeathAction("Basic - Mech 4", { chains: () => [MBA3, MDC], ...MECH, ...laysEvery3s("Mech 4"), animFrames: 62, animPriority: { 64: 1 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 38, mv: 4038, energy: 73, concerto: 146, offtune: 2321, forte1: 699 },
    { hitFrame: 71, commitFrame: 38, mv: 9421, energy: 170, concerto: 339, offtune: 5416, forte1: 1629 },
  ], ...DUO });
const MHA1 = aemeathAction("Heavy - Mech: Charged I", { castPriority: 2, ...MECH, node: Node.Normal, cast: Cast.Heavy, type: Type.Liberation, bullets: [{ hitFrame: 0, mv: 9283, energy: 167, concerto: 334, offtune: 5336 }], updateDebuffs: () => { if (isHeld(AE_S3) && isHeld(INSTANT_RESPONSE)) aemeathLays(); } });
const MHA2 = aemeathAction("Heavy - Mech: Charged II", { ...MECH, animFrames: 56, animPriority: { 58: 1 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Liberation, bullets: [{ hitFrame: 40, mv: 23200, energy: 417, concerto: 834, offtune: 13336, updateDebuffs: () => { if (isHeld(AE_S3) && isHeld(INSTANT_RESPONSE)) aemeathLays(); } }]});
const MDC = aemeathAction("Dodge Counter - Mech", { chains: [DODGE], ...MECH, animFrames: 66, animPriority: { 0: 2, 66: 1 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 2835, energy: 36, concerto: 72, offtune: 1150, forte1: 322 },
    { hitFrame: 10, mv: 945, energy: 12, concerto: 24, offtune: 384, forte1: 108 },
    { hitFrame: 14, commitFrame: 10, mv: 945, energy: 12, concerto: 24, offtune: 384, forte1: 108 },
    { hitFrame: 19, commitFrame: 10, mv: 945, energy: 12, concerto: 24, offtune: 384, forte1: 108 },
    { hitFrame: 23, commitFrame: 10, mv: 945, energy: 12, concerto: 24, offtune: 384, forte1: 108 },
    { hitFrame: 28, commitFrame: 10, mv: 945, energy: 12, concerto: 24, offtune: 384, forte1: 108 },
    { hitFrame: 32, commitFrame: 10, mv: 945, energy: 12, concerto: 24, offtune: 384, forte1: 108 },
    { hitFrame: 51, mv: 19844, energy: 252, concerto: 503, offtune: 8048, forte1: 2250 },
  ], castConcerto: 1000});

// --- Resonance Skill: the Sync Strikes, combo follow-ups off Stage 2-4, a heavy or a dodge counter
// "Press Resonance Skill shortly after casting Basic Attack ... Stage 2, 3 & 4, Heavy Attack ..., or Dodge Counter"
const ArmamentMerge = aemeathAction("Skill - Sync Strike: Armament Merge", { chains: [ABA2, ABA3, ABA4, AHA1, AHA2, ADC], ...AE, ...laysEvery3s("Sync Strike: Armament Merge"), animFrames: 79, animPriority: { 81: 2 }, castPriority: 4, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 6, mv: 6729, energy: 121, concerto: 242, offtune: 3868, forte1: 914 },
    { hitFrame: 44, mv: 2692, energy: 49, concerto: 97, offtune: 1548, forte1: 366 },
    { hitFrame: 65, mv: 4038, energy: 73, concerto: 146, offtune: 2321, forte1: 549 },
  ], ...TO_MECH });
const CallOfDawn = aemeathAction("Skill - Sync Strike: Call of Dawn", { chains: [MBA2, MBA3, MBA4, MHA1, MHA2, MDC], ...MECH, ...laysEvery3s("Sync Strike: Call of Dawn"), animFrames: 72, animPriority: { 74: 2 }, castPriority: 4, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 10, mv: 1633, energy: 30, concerto: 59, offtune: 939, forte1: 222 },
    { hitFrame: 52, mv: 1633, energy: 30, concerto: 59, offtune: 939, forte1: 222 },
    { hitFrame: 56, mv: 1633, energy: 30, concerto: 59, offtune: 939, forte1: 222 },
    { hitFrame: 59, mv: 11428, energy: 206, concerto: 411, offtune: 6569, forte1: 1552 },
  ], ...TO_AEMEATH });

// --- Forte Circuit: the Seraphic Duets, Resonance Liberation DMG off Seraphic Duo, 100
//     Synchronization Rate apiece and +1 Resonance Rate. Overture is Aemeath's, Encore the Mech's.
// "in Seraphic Duo and the Synchronization Rate is no less than 100": both a condition and a spend
const DUET = { node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, minForte1: 10000, castForte1: -10000 };
const AmyFSkill = aemeathAction("Forte - Seraphic Duet: Overture", { requireBuff: SERAPHIC_DUO, animFrames: 180, noSwapFrames: 180, animPriority: { 183: 2 }, castPriority: 10, timestop: [0, 99], motionStop: [0, 99], ...DUET, bullets: [
    { hitFrame: 0, mv: 1790, energy: 25, concerto: 50, offtune: 800, updateDebuffs: () => duetLands() },
    { hitFrame: 40, mv: 1492, energy: 21, concerto: 42, offtune: 667 },
    { hitFrame: 44, commitFrame: 40, mv: 1492, energy: 21, concerto: 42, offtune: 667 },
    { hitFrame: 48, commitFrame: 40, mv: 1492, energy: 21, concerto: 42, offtune: 667 },
    { hitFrame: 52, commitFrame: 40, mv: 1492, energy: 21, concerto: 42, offtune: 667 },
    { hitFrame: 56, commitFrame: 40, mv: 1492, energy: 21, concerto: 42, offtune: 667 },
    { hitFrame: 60, commitFrame: 40, mv: 1492, energy: 21, concerto: 42, offtune: 667 },
    { hitFrame: 120, mv: 2386, energy: 34, concerto: 67, offtune: 1067 },
    { hitFrame: 124, commitFrame: 120, mv: 2386, energy: 34, concerto: 67, offtune: 1067 },
    { hitFrame: 128, commitFrame: 120, mv: 2386, energy: 34, concerto: 67, offtune: 1067 },
    { hitFrame: 153, commitFrame: 120, mv: 5965, energy: 84, concerto: 167, offtune: 2667, updateDebuffs: () => duetDetonates() },
    { hitFrame: 159, commitFrame: 120, mv: 5965, energy: 84, concerto: 167, offtune: 2667 },
    { hitFrame: 165, commitFrame: 120, mv: 5965, energy: 84, concerto: 167, offtune: 2667, forte2: 1 },
  ], updateBuffs: () => {
    toMech();
    revokeCurrent(SERAPHIC_DUO);
  } });
const MechFSkill = aemeathAction("Forte - Seraphic Duet: Encore", { requireBuff: SERAPHIC_DUO, animFrames: 145, noSwapFrames: 145, animPriority: { 146: 2 }, castPriority: 10, timestop: [0, 60], motionStop: [0, 60], ...DUET, bullets: [
    { hitFrame: 0, mv: 1790, energy: 25, concerto: 50, offtune: 800, updateDebuffs: () => duetLands() },
    { hitFrame: 6, commitFrame: 0, mv: 1790, energy: 25, concerto: 50, offtune: 800 },
    { hitFrame: 68, mv: 3579, energy: 50, concerto: 100, offtune: 1600 },
    { hitFrame: 80, commitFrame: 68, mv: 3579, energy: 50, concerto: 100, offtune: 1600 },
    { hitFrame: 89, mv: 1790, energy: 25, concerto: 50, offtune: 800 },
    { hitFrame: 101, commitFrame: 89, mv: 1790, energy: 25, concerto: 50, offtune: 800 },
    { hitFrame: 120, mv: 17893, energy: 250, concerto: 500, offtune: 8000, updateDebuffs: () => duetDetonates() },
    { hitFrame: 124, mv: 3579, energy: 50, concerto: 100, offtune: 1600, forte2: 1 },
  ], updateBuffs: () => {
    toAemeath();
    revokeCurrent(SERAPHIC_DUO);
  } });
const isDuet = (): boolean => runningAction(AmyFSkill) || runningAction(MechFSkill);
/** The Duet a rotation writes: Seraphic Duo is either form's, and the Skill press comes out as hers. */
const Duet = new Action("Seraphic Duet Resolver", { cast: Cast.Skill, resolve: () => (isHeld(MECH_FORM) ? MechFSkill : AmyFSkill) });

// --- Resonance Liberation. Overdrive spends the Energy bar (125), banks 30 Synchronization Rate
//     and a Resonance Rate, and opens Unbound and Stardust Resonance. Finale
//     spends both gauges whole — the caps as its deltas, clamped to them first so it lands on 0;
//     what it closes, each buff closes itself. Both carry their flat 20 Concerto Regen.
const Lib1 = aemeathAction("Liberation - Heavenfall Edict: Overdrive", {
  animFrames: 262, animPriority: { 264: 0 }, castPriority: 10, timestop: [0, 262], motionStop: [0, 262], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    { hitFrame: 214, mv: 20080, offtune: 16800 },
    { hitFrame: 238, mv: 26774, offtune: 22400 },
    { hitFrame: 245, commitFrame: 238, mv: 26774, offtune: 22400 },
    { hitFrame: 252, commitFrame: 238, mv: 26774, offtune: 22400 },
  ], castConcerto: 2000,
  resetEnergy: true, castForte1: 3000, castForte2: 1,
  updateBuffs: () => {
    toMech();
    applyCurrent(UNBOUND, 1);
    applyCurrent(STARDUST, 2);
  },
});
const Lib2 = aemeathAction("Liberation - Heavenfall Edict: Finale", { requireBuff: UNBOUND, minForte1: 20000, minForte2: 4,
  animFrames: 340, animPriority: { 342: 0 }, castPriority: 10, timestop: [0, 340], motionStop: [0, 340], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 260, mv: 178929, energy: 2000, offtune: 84000 }], castConcerto: 2000, castForte1: -20000, castForte2: -4,
  updateBuffs: () => {
    toAemeath();
    revokeCurrent(SERAPHIC_DUO);
  },
});

// --- Intros, one per form: 40 Synchronization Rate and Starlume Acceleration
const INTRO_DEF = { node: Node.Intro, cast: Cast.Intro, type: Type.Intro, updateBuffs: () => applyCurrent(STARLUME, 1) };
const Intro = aemeathAction("Intro - Songs Across the Universe", { endPosition: Position.Grounded, qteFrames: 48, ...AE, ...laysEvery3s("Songs Across the Universe"), animFrames: 72, noSwapFrames: 60, animPriority: { 74: 2 }, castPriority: 11, motionStop: [5, 49], ...INTRO_DEF, bullets: [
    { hitFrame: 52, mv: 1346, energy: 100, offtune: 774 },
    { hitFrame: 56, mv: 1346, energy: 100, offtune: 774 },
    { hitFrame: 59, mv: 10766, energy: 800, offtune: 6189 },
  ], castConcerto: 1000, castForte1: 4000});
const EIntro = aemeathAction("Intro - Debut of Meteoric Radiance", { endPosition: Position.Grounded, qteFrames: 40, ...MECH, ...laysEvery3s("Debut of Meteoric Radiance"), animFrames: 74, noSwapFrames: 72, animPriority: { 76: 2 }, castPriority: 11, motionStop: [5, 44], ...INTRO_DEF, bullets: [
    { hitFrame: 42, mv: 6530, energy: 400, offtune: 3754 },
    { hitFrame: 60, mv: 9795, energy: 600, offtune: 5631 },
  ], castConcerto: 1000, castForte1: 4000});

/** Silent Protection: everyone but her, and "casting this skill resets the effects above" — so a
 *  member's old one comes off before the fresh grant rather than stacking. */
const Outro = aemeathAction("Outro - Silent Protection", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => {
    const buff = isHeld(MODE_BURST) ? SILENT_PROTECTION_BURST : SILENT_PROTECTION_RUPTURE;
    for (const m of currentTeam().slots) {
      if (!m.resonator || m.resonator === AEMEATH_RESONATOR) continue;
      revokeBuff(m.resonator, buff);
      addBuff(m.resonator, buff, 1);
    }
  },
});

/* ------------------------------------------------------------------------------------- buffs */

/** Starlume Acceleration: 15s off the Intro; Overdrive restores one more Resonance Rate and ends
 *  it. */
const STARLUME = new Buff({
  name: "Aemeath: Starlume Acceleration",
  duration: 60 * 15,
  updateBuffs: () => {
    if (runningAction(Lib1)) addGain({ forte2: 1 });
  },
  afterAction: () => { if (runningAction(Lib1)) revokeCurrent(STARLUME); },
});

/** Stardust Resonance: 30s off Overdrive, enhancing the next two Seraphic Duets — held as two
 *  charges. In Tune Rupture the Duet's volley is 10 instances rather than 5 (the second five as
 *  AddMv, so the Trail's multiplier covers them); in Fusion Burst the Duet's own Fusion Burst is
 *  +200% multiplier, on top of the Trail's. "The next Seraphic Duet cast within 30s after
 *  Overdrive doesn't consume Rupturous Trail / Fusion Trail" is the Duet at both charges, so the
 *  charge is spent after the action, once the Trail has read it. */
const STARDUST = new Buff({
  name: "Aemeath: Stardust Resonance", maxStacks: 2, duration: 60 * 30,
  applyStats: () => {
    if (runningAction(Volley)) addStat(Stat.AddMv, 10935 * 5);
    if (!runningAction(DuetBurst)) return;
    addStat(Stat.MulMv, 200);
    // S2 raises the Stardust Duet's own Fusion Burst multiplier to 400% — the 200 over it is its own
    if (isHeld(AE_S2)) asSource(AE_S2, () => addStat(Stat.MulMv, 200));
  },
  afterAction: () => { if (runningAction(Volley) || runningAction(DuetBurst)) removeStack(STARDUST, 1); },
});

/** Instant Response: under Unbound a Charged II restores the whole Synchronization Rate (200 — the
 *  cap, clamped by AEMEATH_RESONATOR's own afterAction). Either Charged II or Finale ends it. */
const INSTANT_RESPONSE = new Buff({
  name: "Aemeath: Instant Response",
  updateBuffs: () => {
    if ((runningAction(AHA2) || runningAction(MHA2)) && isHeld(UNBOUND)) addGain({ forte1: 20000 });
  },
  // Unbound's own afterAction ends it while that stands
  afterAction: () => {
    if (isHeld(UNBOUND) || !isHeld(INSTANT_RESPONSE)) return;
    if (runningAction(AHA2) || runningAction(MHA2) || runningAction(Lib2)) revokeCurrent(INSTANT_RESPONSE);
  },
});

/* ---------------------------------------------------------------------------- kit and talents */

/** Before All Sounds: in Instant Response, both forms' heavies are amplified 200%. */
const AE_INHERENT_1 = new Inherent({
  name: "Inherent: Before All Sounds",
  // Brilliance (S1) inherits every Instant Response effect, this one included
  applyStats: () => { if ((isHeld(INSTANT_RESPONSE) || isHeld(BRILLIANCE)) && casting(Cast.Heavy)) addStat(Stat.Amp, 200); },
});

const AEMEATH_TALENTS = new Talent({
  name: "Aemeath: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

/** Between the Stars' own grant, from `hitGlobal` so a teammate's own hit is seen — which runs
 *  with the "current" slot pointed at her, so the actor is read off the team (a queued response
 *  lands on the slot that queued it, so Mornye's Particle Jet counts Mornye). Both modes' payout
 *  buffs are declared further down; only this hook's own body reads them, so it never runs before
 *  they exist. */
const AE_INHERENT_2 = new Inherent({
  name: "Inherent: Between the Stars",
  hitGlobal: () => {
    const actor = currentTeam().slot;
    const slot = 1 << currentTeam().active;
    if (isHeld(MODE_BURST)) {
      if (!appliedByMember(FUSION_BURST, actor) || (stacksOf(BETWEEN_THE_STARS_BURST) & slot) !== 0) return;
      applyCurrent(BETWEEN_THE_STARS_BURST, slot);
      return;
    }
    if (!appliedByMember(TUNE_RUPTURE_SHIFTING, actor) && !isType(Type.Rupture)) return;
    if ((stacksOf(BETWEEN_THE_STARS_RUPTURE) & slot) !== 0) return;
    applyCurrent(BETWEEN_THE_STARS_RUPTURE, slot);
  },
});

const TB_BASE = tuneBreak(90, [0, 89], [0, 68], SWORD_BREAK);
const TB_FORM = tuneBreak(94, [0, 94], [0, 64], [[4, 17334], [48, 22666], [74, 120000]]);

export const AEMEATH_RESONATOR = new Resonator({
  name: "Aemeath",
  talent: AEMEATH_TALENTS,
  inherent1: AE_INHERENT_1,
  inherent2: AE_INHERENT_2,
  element: Attribute.Fusion,
  weapon: WeaponType.Sword,
  color: "#ff4680",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  intro: () => (stacksOf(MECH_FORM) ? EIntro : Intro),
  outro: Outro,
  swapIn: () => (stacksOf(MECH_FORM) ? MBA1 : ABA1),
  // Mid-air Attack - Mech (a plunge) isn't modelled; Basic Attack - Mech "can be cast in mid-air close to the ground"
  swapInAir: () => (stacksOf(MECH_FORM) ? MBA1 : AMA),
  // a Tune Break per form: the Mech form's is the broadblade's
  tuneBreak: new Action("Tune Break Resolver", { resolve: () => (stacksOf(MECH_FORM) ? TB_FORM : TB_BASE) }),
  maxEnergy: 12500,
  forteScale: [0.01, 1, 1, 1, 1],
  maxForte1: 20000,
  maxForte2: 4,
  combatStart: () => applyCurrent(AEMEATH_FORM, 1),

  stats: [
    [Stat.BaseHp, 11025], [Stat.BaseAtk, 425], [Stat.BaseDef, 1148.8868],
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    [Stat.TBB, 10],
  ],
});

/* --------------------------------------------------------------------------------- sequences */

/** Instant Response - Brilliance (S1): held from the start of the fight — she is out of combat and
 *  casting nothing for the 4s it asks for — and it inherits Instant Response outright, so the
 *  amplification above and S1's own Crit. DMG both read it. Outside Unbound a Charged II takes the
 *  100 Synchronization Rate and ends it, the same way Instant Response is spent by one. */
const BRILLIANCE = new Buff({
  name: "Aemeath S1: Instant Response - Brilliance",
  updateBuffs: () => {
    if ((runningAction(AHA2) || runningAction(MHA2)) && !isHeld(UNBOUND)) addGain({ forte1: 10000 });
  },
  afterAction: () => { if (runningAction(AHA2) || runningAction(MHA2) || runningAction(Lib2)) revokeCurrent(BRILLIANCE); },
});
/** S1: +300% Crit. DMG on either form's heavy in Instant Response, Brilliance included, and the
 *  Brilliance window above. Sealed Trail is a kill effect, and this calculator fights one boss. */
const AE_S1 = new Sequence({
  name: "Aemeath S1: Gilded Glimmer of the First Dawn",
  combatStart: () => applyCurrent(BRILLIANCE, 1),
  applyStats: () => {
    if ((isHeld(INSTANT_RESPONSE) || isHeld(BRILLIANCE)) && casting(Cast.Heavy)) addStat(Stat.CritDmg, 300);
  },
});

/** S2: both Duets at x2 of their multiplier — no sequence row on nanoka, so multiplicative. In
 *  Tune Rupture the volley ramps 20% an instance to a cap of 5, which over its own 5 instances
 *  averages 40% and over Stardust's 10 averages 70%; the mode's other two lines are paid by
 *  Stardust and Fusion Trail themselves. The kill trigger is out of scope. */
const AE_S2 = new Sequence({
  name: "Aemeath S2: Downy Notes of Snowfluff",
  applyStats: () => {
    if (isDuet()) addStat(Stat.MulMv, 100);
    if (runningAction(Volley)) addStat(Stat.MulMv, isHeld(STARDUST) ? 70 : 40);
  },
});

/** S3: Finale at x2 and Overdrive at x1.4 — again no sequence rows, so multiplicative. The Instant
 *  Response heavies' own inflict and the rewritten Between the Stars are paid where each already
 *  lives (`inflicts()` and the two payout buffs). */
const AE_S3 = new Sequence({
  name: "Aemeath S3: Fervor Sightly Burns Bright as New",
  applyStats: () => {
    if (runningAction(Lib2)) addStat(Stat.MulMv, 100);
    if (runningAction(Lib1)) addStat(Stat.MulMv, 40);
  },
});

/** S4: +20% All-Attribute DMG Bonus to the team off either Intro, either Sync Strike or either
 *  Duet — 30s, so permanent. */
const ETHEREAL_WALTZ = new Buff({
  name: "Aemeath S4: Ethereal Waltz on Binary Tides",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 20]],
});
const AE_S4 = new Sequence({
  name: "Aemeath S4: Ethereal Waltz on Binary Tides",
  updateBuffs: () => {
    if (runningAction(Intro) || runningAction(EIntro) || runningAction(ArmamentMerge) || runningAction(CallOfDawn) || isDuet()) applyTeam(ETHEREAL_WALTZ, 1);
  },
});

/** S5: a kill-reset on Starflux and a once-per-fight cheat death. No formula effect. */
const AE_S5 = new Sequence({ name: "Aemeath S5: Voyage to the Astral Shore" });

/** S6: the target takes 40% more Resonance Liberation DMG from her — which is what her heavies and
 *  Duets deal too; both Trails cap at 60 and double what the Forte Circuit lays (in the modes
 *  themselves); and each mode's status damage crits at a fixed 80%/275%. Tune Rupture DMG carries
 *  no Subtype tag to scope that crit to (damage.ts), so hers is the factor it averages out to
 *  instead: 0.2 + 0.8 x 2.75 = 2.4, written as Total Damage — the one term a tune row multiplies
 *  by that a kit can reach, where a motion-value bonus would only sum with the Trail's own. */
const AE_S6 = new Sequence({
  name: "Aemeath S6: A Zephyr-Kissed Journey to You",
  // her Resonance Mode isn't equipped yet at combatStart, so the Trail's cap is raised from
  // updateGlobal instead — the first cast of the fight, whoever casts it, ahead of any hit laying it
  updateGlobal: () => {
    if (!isHeld(MODE_BURST)) { maxStackIncrease(RUPTUROUS_TRAIL, 30); return; }
    maxStackIncrease(FUSION_TRAIL, 30);
  },
  hitGlobal: () => {
    if (!isHeld(MODE_BURST)) return;
    // the fixed crit itself, written straight out rather than through a buff of its own: onto the
    // cast being evaluated (`asActor`, since this hook runs as her whoever is up), so a burst that
    // calculates on a teammate's turn crits the same way hers does. Scoped to Fusion Burst, which
    // is the only crit a dot row reads at all (damage.ts), so every other action reads past it.
    asActor(() => {
      addStat(Stat.CritRate, 80, Subtype.FusionBurst);
      addStat(Stat.CritDmg, 275, Subtype.FusionBurst);
    });
  },
  applyStats: () => {
    addStat(Stat.DamageTaken, 40, Type.Liberation);
    if (runningAction(Volley) || runningAction(Starburst)) addStat(Stat.TotalDmg, 140);
  },
});

const AE_SEQUENCES = [AE_S1, AE_S2, AE_S3, AE_S4, AE_S5, AE_S6];

/* ======================================================================= Tune Rupture mode */

/** Her answer to a Rupture break, queued by the engine's own break (MODE_RUPTURE) rather than
 *  played — active, like every Tune Break response (see Mornye's Particle Jet). The 8s per-target
 *  cooldown is the Interfered window itself: no second break lands inside it. */
const Starburst = aemeathAction("Tune Rupture Response - Starburst", { animFrames: 0, node: Node.Forte, cast: Cast.TuneBreak, type: Type.Rupture, bullets: [{ hitFrame: 0, mv: 59643 }], scaling: Scaling.Tune });

/** The Duet's own Tune Rupture DMG: 5 instances of 109.35%, queued off the Duet. Stardust makes it
 *  10 and the Rupturous Trail multiplies it — each from its own buff. */
const Volley = aemeathAction("Forte - Seraphic Duet: Tune Rupture", { node: Node.Forte, type: Type.Rupture, bullets: [{ hitFrame: 0, mv: 10935 * 5 }], scaling: Scaling.Tune });

/** Rupturous Trail: 10 stacks on the target every time a resonator on the team responds to Tune
 *  Rupture - Interfered, cap 30, 30s (standing). The Duet's volley is +4% multiplier a stack and
 *  spends them all — unless it is the first Stardust Duet (both charges up), which pays and
 *  leaves them. */
const RUPTUROUS_TRAIL = new Debuff({
  name: "Aemeath: Rupturous Trail", maxStacks: 30, duration: 60 * 30,
  applyStats: () => { if (runningAction(Volley)) addStat(Stat.MulMv, 4 * frozenStacks()); },
  // a single hit, so spent once it is in — ahead of Stardust giving up its charge at the press's end
  afterHit: () => { if (runningAction(Volley) && stacksOf(STARDUST) !== 2) revokeEnemy(RUPTUROUS_TRAIL); },
});

/** How many distinct team slots Between the Stars has counted — one bit per slot, the way
 *  Hiyuki's Snow Rust holds it, so the tier is how many of the three bits are up. */
const betweenTheStars = (): number => {
  const slots = frozenStacks();
  return (slots & 1) + ((slots >> 1) & 1) + ((slots >> 2) & 1);
};

/** Between the Stars, Tune Rupture: +20% Crit. DMG the first time each resonator on the team lays
 *  a Tune Rupture - Shifting or deals Tune Rupture DMG, cap 3; at 3, Finale is amplified 25%.
 *  "Each Resonator can only trigger this effect once" is carried by the stacks themselves: slot 1
 *  banks 1, slot 2 banks 2, slot 3 banks 4, so what is held is the set of who has already paid. */
const BETWEEN_THE_STARS_RUPTURE = new Buff({
  name: "Inherent: Between the Stars (rupture)", maxStacks: 1 + 2 + 4,
  display: () => `Inherent: Between the Stars (rupture) x${betweenTheStars()}`,
  // S3 replaces the tiering outright: a flat 60% off the first inflict, and Finale amplified with it
  applyStats: () => {
    const tiers = betweenTheStars();
    if (isHeld(AE_S3)) asSource(AE_S3, () => addStat(Stat.CritDmg, 60));
    else addStat(Stat.CritDmg, 20 * tiers);
    if (!runningAction(Lib2)) return;
    if (tiers >= 3) addStat(Stat.Amp, 25);
    else if (isHeld(AE_S3)) asSource(AE_S3, () => addStat(Stat.Amp, 25));
  },
});

/** Silent Protection (Outro), Tune Rupture: everyone but her gets +10% All DMG Amplification for
 *  20s, 20% once they lay a Tune Rupture - Shifting of their own — stack 2 is that upgraded state.
 *  A 20s team buff, so lost on her next Intro. */
const SILENT_PROTECTION_RUPTURE = new Buff({
  name: "Aemeath: Outro (rupture)", maxStacks: 2, duration: 60 * 20,
  grants: [{ on: inflicting(() => appliedByMember(TUNE_RUPTURE_SHIFTING, currentMember()) > 0) }],
  applyStats: () => addStat(Stat.Amp, frozenStacks() === 2 ? 20 : 10),
});

/** The mode's Shifting, or in the other mode a Fusion Burst stack: the first hit of Stage 3-4 of
 *  either form, both Sync Strikes and both Intros — and S3's heavies in Instant Response. */
function aemeathLays(): void {
  if (isHeld(MODE_BURST)) applyEnemy(FUSION_BURST, 1);
  else if (isHeld(MODE_RUPTURE)) applyRupture();
}
/** A Duet's first hit: S6's own 10 stacks (from here rather than the Trail, which an empty target
 *  doesn't hold). */
function duetLands(): void {
  if (isHeld(AE_S6)) applyEnemy(isHeld(MODE_BURST) ? FUSION_TRAIL : RUPTUROUS_TRAIL, 10);
}
/** The Duet's hit that detonates the Trail (wuwalab's detonate_trails): the mode's follow-up. */
function duetDetonates(): void {
  if (isHeld(MODE_BURST)) queue(DuetBurst);
  else if (isHeld(MODE_RUPTURE)) queue(Volley);
}

/** Held on her slot, so its hitGlobal runs as her whoever is acting: the Starburst response and
 *  the Trail are hers. A response is any Rupture-typed hit that isn't her own Duet volley. The
 *  volley follows the Duet's hit, after S6 has laid its stacks. */
const MODE_RUPTURE = new ResonanceMode({
  name: "Resonance Mode - Tune Rupture",
  combatStart: () => applyEnemy(TUNE_SHIFTABLE, 1),
  hitGlobal: () => {
    tuneRuptureResponse(Starburst);
    if (isType(Type.Rupture) && !runningAction(Volley)) applyEnemy(RUPTUROUS_TRAIL, isHeld(AE_S6) ? 20 : 10);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

const ABA234 = new ActionGroup("Basic - Aemeath 234", [ABA2, ABA3, ABA4]);
const MBA234 = new ActionGroup("Basic - Mech 234", [MBA2, MBA3, MBA4]);

/** Intro (+40 Rate, Starlume) into Stage 3-4, Overdrive (Rate 2 with Starlume — Unbound, Stardust),
 *  the Mech chain into the free Encore, the Aemeath chain into Overture (Rate 4, Instant Response),
 *  the Charged II to refill the gauge, the echo, Finale and out. Never the team's lead. */
const ABA34 = new ActionGroup("Basic - Aemeath 34", [ABA3, ABA4]);

const AE_ROTATION = new Rotation([
  INTRO, ABA34.cancel(), Lib1,
  MBA234.cancel(), Duet,
  ABA234.cancel(), Duet,
  MHA2.cancel(), Lib2, ECHO.instaSwap(),
  OUTRO,
]);

// S1: Brilliance stands at the opening, so the Charged II ahead of Overdrive is amplified and
// hands back the whole 100 Synchronization Rate it would otherwise take a chain to rebuild
const AE_ROTATION_S1 = new Rotation([
  START, ABA1.instaCancel(), AHA2.instaSwap(),

  INTRO, ABA34.cancel(), Lib1,
  MBA234.cancel(), Duet,
  ABA234.cancel(), Duet,
  MHA2.cancel(), Lib2, ECHO.instaSwap(),
  OUTRO,
]);

export const AEMEATH_RUPTURE = new Loadout({
  resonator: AEMEATH_RESONATOR,
  weapons: [EVERBRIGHT_POLESTAR, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(SIGILLUM, TRAILBLAZING_STAR_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Basic, Substat.Skill),
  rotation: { 0: AE_ROTATION, 1: AE_ROTATION_S1 },
  sequences: AE_SEQUENCES,
  mode: MODE_RUPTURE,
});

/* ======================================================================= Fusion Burst mode */

/** The Duet's own Fusion Burst: the status calculated at the target's max-stack rung without
 *  spending the stacks — a dot hit like the ladder's own, carrying no motion value of its own; the
 *  rung is added by the status itself (status.ts's own FUSION_BURST, so the value is sourced to
 *  it and reads the fight's cap), the way Hsin's Heart of Thunder reads Electro Flare. The Trail
 *  and Stardust multiply it from their own buffs. */
const DuetBurst = new Action("Forte - Seraphic Duet: Fusion Burst", {
  element: Attribute.Fusion, type: Type.Status, subtype: Subtype.FusionBurst, scaling: Scaling.Dot, bullets: [{ hitFrame: 0 }],
});

/** Fusion Trail: a stack for every Fusion Burst stack anyone on the team lands, cap 30, 30s
 *  (standing). The Duet's Fusion Burst is +10% multiplier a stack and spends them all — unless it
 *  is the first Stardust Duet (both charges up), which pays and leaves them. */
const FUSION_TRAIL = new Debuff({
  name: "Aemeath: Fusion Trail", maxStacks: 30, duration: 60 * 30,
  applyStats: () => {
    if (!runningAction(DuetBurst)) return;
    // the count is read out here: inside `asSource` the "current" gear is the node, not this trail
    const trail = frozenStacks();
    addStat(Stat.MulMv, 10 * trail);
    // S2 pays 15% a stack rather than 10% — the 5 more a stack is the node's own
    if (isHeld(AE_S2)) asSource(AE_S2, () => addStat(Stat.MulMv, 5 * trail));
  },
  // a single hit, so spent once it is in — ahead of Stardust giving up its charge at the press's end
  afterHit: () => { if (runningAction(DuetBurst) && stacksOf(STARDUST) !== 2) revokeEnemy(FUSION_TRAIL); },
});

/** Between the Stars, Fusion Burst: +30% Crit. DMG the first time each resonator on the team lays
 *  Fusion Burst, cap 2; at 2, Finale is amplified 25%. The same per-slot bits as the Rupture one. */
const BETWEEN_THE_STARS_BURST = new Buff({
  name: "Inherent: Between the Stars (burst)", maxStacks: 1 + 2 + 4,
  display: () => `Inherent: Between the Stars (burst) x${Math.min(2, betweenTheStars())}`,
  applyStats: () => {
    const n = Math.min(2, betweenTheStars());
    if (isHeld(AE_S3)) asSource(AE_S3, () => addStat(Stat.CritDmg, 60));
    else addStat(Stat.CritDmg, 30 * n);
    if (!runningAction(Lib2)) return;
    if (n >= 2) addStat(Stat.Amp, 25);
    else if (isHeld(AE_S3)) asSource(AE_S3, () => addStat(Stat.Amp, 25));
  },
});

/** Silent Protection (Outro), Fusion Burst: everyone but her gets +10% All DMG Amplification for
 *  20s, 20% once they lay Fusion Burst of their own — stack 2 is that upgraded state. */
const SILENT_PROTECTION_BURST = new Buff({
  name: "Aemeath: Outro (burst)", maxStacks: 2, duration: 60 * 20,
  grants: [{ on: inflicting(() => appliedByMember(FUSION_BURST, currentMember()) > 0) }],
  applyStats: () => addStat(Stat.Amp, frozenStacks() === 2 ? 20 : 10),
});

/** Held on her slot, so its hitGlobal runs as her whoever is acting. Her listed casts lay a
 *  stack; every stack the team lands mirrors into Fusion Trail; and the mode's own upkeep — past 5
 *  stacks the status calculates at the cap's rung on whoever laid the last stack (the ladder's own
 *  rule, status.ts) and clears, and a target left on 0 gets a stack back, hers. The fight opens on that
 *  stack too. A Duet's hit queues its own calculation. */
const MODE_BURST = new ResonanceMode({
  name: "Resonance Mode - Fusion Burst",
  hitGlobal: () => {
    const team = currentTeam();
    if (stacksOfEnemy(FUSION_BURST) > 5) {
      queueOnApplier(FUSION_BURST, FUSION_BURST_ACTIONS[team.enemyMax(FUSION_BURST)]!);
      // "remove all of their stacks": a consume, which Suisui's Undulating Mist reads
      consume(FUSION_BURST, stacksOfEnemy(FUSION_BURST));
    }
    if (stacksOfEnemy(FUSION_BURST) === 0) {
      applyEnemy(FUSION_BURST, 1);
    }
    const landed = applied(FUSION_BURST);
    if (landed > 0) applyEnemy(FUSION_TRAIL, isHeld(AE_S6) ? landed * 2 : landed);
  },
});

export const AEMEATH_BURST = new Loadout({
  resonator: AEMEATH_RESONATOR,
  weapons: [EVERBRIGHT_POLESTAR, EMERALD_OF_GENESIS],
  echoLoadouts: [
    new EchoLoadout(SIGILLUM, TRAILBLAZING_STAR_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Basic, Substat.Skill),
  rotation: { 0: AE_ROTATION, 1: AE_ROTATION_S1 },
  sequences: AE_SEQUENCES,
  mode: MODE_BURST,
});
