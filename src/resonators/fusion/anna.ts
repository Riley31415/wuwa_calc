/**
 * Anna — a Fusion copy of Suoming's main-DPS kit (src/resonators/electro/suoming.ts): the same
 * presses, frames, gauges and Delusion (forte 1, 800 cap), every Electro buff made Fusion. Where
 * Suoming's Liberation grants Unison, Anna's first Liberation hit applies Tune Rupture - Shifting �
 * as do both Intros' first hits, Unforsaken Mind and Engraved Heart's last hit, so a Shifting is
 * back up after every break;
 * the Liberation still opens a Seal window that Rift Cleaver spends for Seal Master, as Suoming's
 * Unison does. Everything that only exists for Unison is gone: the Unison Intro forms, the Unison
 * outro with Aligned Seals and Blight Rain, and every Unison Boon grant or Boon-scaled bonus.
 *
 * - **Awakened Mind** (from combat start): Furled Canopy basics build Delusion; Intro Flash Rift
 *   sends her into Deep Mind, clearing it.
 * - **Deep Mind**: Unfurled Canopy basics and Whirling Thunder build Delusion; the Liberation is
 *   only available here (+200 Delusion), Intro Thunder Rending grants +200 too. At a full bar the
 *   Resonance Skill is Unforsaken Mind, after which the Basic Attack is Engraved Heart, which
 *   clears the bar and leaves her in Awakened Mind.
 * - **Seal Master**: Rift Cleaver inside the Liberation's Seal window spends it, 20 Concerto and
 *   every point of Delusion for +100% DMG Multiplier on the Unfurled chain and Whirling Thunder,
 *   +5 Concerto a stage on hit, +100% Crit. DMG, 12s or until switched out.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget, Position } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addStat,
  applyCurrent,
  casting,
  runningAction,
  isHeld,
  queueQTE,
  resetCooldown,
  revokeCurrent,
  setForte1,
  onCast,
  runningAnyOf,
  addGain,
  saveChain,
} from "../../engine/context.js";
import { Action, ActionGroup, Rotation, START, SUCCESSFUL_DODGE } from "../../engine/rotation.js";
import { applyRupture } from "../tunebreak.js";
import { ANNA_SIG, LETHEAN_ELEGY, STRINGMASTER, WHISPERS_OF_SIRENS } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { AUGMENT, RADIANT_DAWN } from "../../weapons/battlepass.js";
import { COLLAPSAR_BLADE_MAINSLOT, TRAILBLAZING_STAR_5PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../echoes/mainstats.js";
import { Echoes } from "../../echoes/echoes.js";
import { substats, highSubs, Substat } from "../../echoes/substats.js";

/* ----------------------------------------------------------------------------------- states */

/** The Deep Mind marker, no stat of its own. */
const DEEP_MIND = new Buff({ name: "Anna: Deep Mind" });
/** Awakened Mind: held from combat start, left for Deep Mind, back once Engraved Heart ends. */
const AWAKENED_MIND = new Buff({ name: "Anna: Awakened Mind" });
/** Unforsaken Mind's window: Basic Attack and Resonance Skill are Engraved Heart until it is cast. */
const ENGRAVED_HEART_READY = new Buff({ name: "Anna: Engraved Heart Ready" });
/** The Liberation's Seal window, standing in for Suoming's Unison: held until Rift Cleaver spends
 *  it or her Outro is cast. */
const SEAL_WINDOW: Buff = new Buff({
  name: "Anna: Seal Window",
  updateBuffs: () => { if (casting(Cast.Outro)) revokeCurrent(SEAL_WINDOW); },
});

/* ----------------------------------------------------------------------------------- actions */

// every hit of hers applies Tune Rupture - Shifting
function annaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, updateDebuffs: applyRupture, ...def });
}

// --- Furled Canopy, the Awakened Mind chain
const BA1 = annaAction("Basic - Furled Canopy 1", { notAfter: () => [BA1, BA2, RiftCleaver, DC, CrimsonGleamParry], requireBuff: AWAKENED_MIND, animFrames: 24, castPriority: 2, bullets: [{ hitFrame: 10, mv: 3155, energy: 191, concerto: 159, offtune: 3174, forte1: 120 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
const BA2 = annaAction("Basic - Furled Canopy 2", { after: () => [BA1, RiftCleaver], requireBuff: AWAKENED_MIND, animFrames: 47, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 1573, energy: 95, concerto: 80, offtune: 1583, forte1: 40 },
    { hitFrame: 19, commitFrame: 14, mv: 1573, energy: 95, concerto: 80, offtune: 1583, forte1: 40 },
    { hitFrame: 31, mv: 3146, energy: 190, concerto: 159, offtune: 3165, forte1: 80 },
  ]});
const BA3 = annaAction("Basic - Furled Canopy 3", { after: () => [BA2, DC, CrimsonGleamParry], requireBuff: AWAKENED_MIND, animFrames: 82, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 2201, energy: 133, concerto: 111, offtune: 2214, forte1: 36 },
    { hitFrame: 21, commitFrame: 16, mv: 2201, energy: 133, concerto: 111, offtune: 2214, forte1: 36 },
    { hitFrame: 27, commitFrame: 16, mv: 2201, energy: 133, concerto: 111, offtune: 2214, forte1: 36 },
    { hitFrame: 63, mv: 4402, energy: 266, concerto: 222, offtune: 4428, forte1: 72 },
  ]});
const MA = annaAction("Mid-air - Furled Canopy Plunge", { castPosition: Position.Midair, endPosition: Position.Grounded, animFrames: 41, animPriority: { 40: 2 }, castPriority: 4, bullets: [{ hitFrame: 29, mv: 8420, energy: 509, concerto: 424, offtune: 8470 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
const DC = annaAction("Dodge Counter - Furled Canopy", { after: [SUCCESSFUL_DODGE], requireBuff: AWAKENED_MIND, animFrames: 47, animPriority: { 0: 2 }, castPriority: 7, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 2766, energy: 167, concerto: 140, offtune: 2783, forte1: 40 },
    { hitFrame: 19, commitFrame: 14, mv: 2766, energy: 167, concerto: 140, offtune: 2783, forte1: 40 },
    { hitFrame: 31, mv: 5532, energy: 334, concerto: 279, offtune: 5565, forte1: 80 },
  ], castConcerto: 1000});

// --- Unfurled Canopy, the Deep Mind chain, and Whirling Thunder held out of its stage 2
const UBA1 = annaAction("Basic - Unfurled Canopy 1", { forbidBuff: ENGRAVED_HEART_READY, notAfter: () => [UBA1, UBA2, UBA3, RiftCleaver, UDC, CrimsonGleamParry, UHA1, IntroThunderRending], requireBuff: DEEP_MIND, animFrames: 39, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 23, mv: 6542, energy: 158, concerto: 132, offtune: 3949, forte1: 60 },
    { hitFrame: 31, mv: 3271, energy: 79, concerto: 66, offtune: 1975, forte1: 30 },
    { hitFrame: 35, commitFrame: 31, mv: 3271, energy: 79, concerto: 66, offtune: 1975, forte1: 30 },
  ]});
const UBA2 = annaAction("Basic - Unfurled Canopy 2", { forbidBuff: ENGRAVED_HEART_READY, after: [UBA1], requireBuff: DEEP_MIND, animFrames: 68, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 11440, energy: 277, concerto: 231, offtune: 6905, forte1: 80 },
    { hitFrame: 37, mv: 3814, energy: 93, concerto: 77, offtune: 2302, forte1: 27 },
    { hitFrame: 43, commitFrame: 37, mv: 3814, energy: 93, concerto: 77, offtune: 2302, forte1: 27 },
    { hitFrame: 49, commitFrame: 37, mv: 3814, energy: 93, concerto: 77, offtune: 2302, forte1: 27 },
  ]});
const UBA3 = annaAction("Basic - Unfurled Canopy 3", { forbidBuff: ENGRAVED_HEART_READY, after: () => [UBA2, RiftCleaver, UDC], requireBuff: DEEP_MIND, animFrames: 70, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 30, mv: 5864, energy: 142, concerto: 118, offtune: 3540, forte1: 45 },
    { hitFrame: 35, commitFrame: 30, mv: 5864, energy: 142, concerto: 118, offtune: 3540, forte1: 45 },
    { hitFrame: 50, mv: 5864, energy: 142, concerto: 118, offtune: 3540, forte1: 45 },
    { hitFrame: 60, commitFrame: 50, mv: 5864, energy: 142, concerto: 118, offtune: 3540, forte1: 45 },
  ]});
const UBA4 = annaAction("Basic - Unfurled Canopy 4", { forbidBuff: ENGRAVED_HEART_READY, after: () => [UBA3, CrimsonGleamParry], requireBuff: DEEP_MIND, animFrames: 115, animPriority: { 0: 4, 103: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 15, mv: 10725, energy: 259, concerto: 216, offtune: 6474, forte1: 54 },
    { hitFrame: 53, mv: 10725, energy: 259, concerto: 216, offtune: 6474, forte1: 54 },
    { hitFrame: 95, mv: 4767, energy: 116, concerto: 96, offtune: 2878, forte1: 24 },
    { hitFrame: 102, mv: 4767, energy: 116, concerto: 96, offtune: 2878, forte1: 24 },
    { hitFrame: 109, mv: 4767, energy: 116, concerto: 96, offtune: 2878, forte1: 24 },
  ]});
const UHA1 = annaAction("Heavy - Unfurled Canopy: Whirling Thunder 1", { forbidBuff: ENGRAVED_HEART_READY, after: () => [UBA2, UDC], requireBuff: DEEP_MIND, animFrames: 88, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 7332, energy: 177, concerto: 148, offtune: 4425, forte1: 45 },
    { hitFrame: 27, mv: 3666, energy: 89, concerto: 74, offtune: 2213, forte1: 23 },
    { hitFrame: 30, commitFrame: 27, mv: 3666, energy: 89, concerto: 74, offtune: 2213, forte1: 23 },
    { hitFrame: 38, mv: 7332, energy: 177, concerto: 148, offtune: 4425, forte1: 45 },
    { hitFrame: 63, mv: 7332, energy: 177, concerto: 148, offtune: 4425, forte1: 45 },
  ]});
const UHA2 = annaAction("Heavy - Unfurled Canopy: Whirling Thunder 2", { forbidBuff: ENGRAVED_HEART_READY, after: () => [UHA1, IntroThunderRending], requireBuff: DEEP_MIND, animFrames: 85, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 33, mv: 5669, energy: 137, concerto: 115, offtune: 3422, forte1: 36 },
    { hitFrame: 38, commitFrame: 33, mv: 5669, energy: 137, concerto: 115, offtune: 3422, forte1: 36 },
    { hitFrame: 43, commitFrame: 33, mv: 5669, energy: 137, concerto: 115, offtune: 3422, forte1: 36 },
    { hitFrame: 48, commitFrame: 33, mv: 5669, energy: 137, concerto: 115, offtune: 3422, forte1: 36 },
    { hitFrame: 52, commitFrame: 33, mv: 5669, energy: 137, concerto: 115, offtune: 3422, forte1: 36 },
  ]});
const UDC = annaAction("Dodge Counter - Unfurled Canopy", { after: [SUCCESSFUL_DODGE], requireBuff: DEEP_MIND, animFrames: 68, animPriority: { 0: 2 }, castPriority: 7, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 17404, energy: 421, concerto: 351, offtune: 7004, forte1: 80 },
    { hitFrame: 37, mv: 5802, energy: 141, concerto: 117, offtune: 2335, forte1: 27 },
    { hitFrame: 43, commitFrame: 37, mv: 5802, energy: 141, concerto: 117, offtune: 2335, forte1: 27 },
    { hitFrame: 49, commitFrame: 37, mv: 5802, energy: 141, concerto: 117, offtune: 2335, forte1: 27 },
  ], castConcerto: 1000});

// --- Rift Cleaver, the plain Resonance Skill in either state; inside the Seal window it spends
//     it, 20 Concerto and every point of Delusion for Seal Master
const RiftCleaver = annaAction("Skill - Furled Canopy: Rift Cleaver", { forbidBuff: ENGRAVED_HEART_READY, maxForte1: 799, animFrames: 42, animPriority: { 40: 2 }, castPriority: 4, bullets: [{ hitFrame: 21, commitFrame: 0, mv: 10661, energy: 368, concerto: 307, offtune: 6128 }], cooldown: 60 * 8,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill,
  updateBuffs: () => {
    if (!isHeld(SEAL_WINDOW)) return;
    addGain({ concerto: -2000 });
    setForte1(0);
    revokeCurrent(SEAL_WINDOW);
    applyCurrent(SEAL_MASTER, 1);
  },
});
const CrimsonGleamParry = annaAction("Skill - Unfurled Canopy: Crimson Gleam", { after: [RiftCleaver], animFrames: 67, animPriority: { 67: 0 }, castPriority: 5, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 2, mv: 4725, energy: 163, concerto: 136, offtune: 2717, forte1: 48 },
    { hitFrame: 10, mv: 2363, energy: 82, concerto: 68, offtune: 1359, forte1: 24 },
    { hitFrame: 19, commitFrame: 10, mv: 2363, energy: 82, concerto: 68, offtune: 1359, forte1: 24 },
    { hitFrame: 31, mv: 6300, energy: 218, concerto: 182, offtune: 3622, forte1: 64 },
  ]});

// --- Umbral Canopy: Miasma Lock, Deep Mind only: its first hit applies Tune Rupture - Shifting
//     (Suoming's Unison grant), and the cast opens the Seal window and 200 Delusion
const Liberation = annaAction("Liberation - Umbral Canopy: Miasma Lock", { requireBuff: DEEP_MIND,
  animFrames: 335, noSwapFrames: 332, animPriority: { 332: 0 }, castPriority: 10, timestop: [0, 332], motionStop: [0, 332],
  cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    { hitFrame: 193, mv: 6089, offtune: 7350 },
    { hitFrame: 199, commitFrame: 193, mv: 6089, offtune: 7350 },
    { hitFrame: 205, commitFrame: 193, mv: 6089, offtune: 7350 },
    { hitFrame: 211, commitFrame: 193, mv: 6089, offtune: 7350 },
    { hitFrame: 217, commitFrame: 193, mv: 6089, offtune: 7350 },
    { hitFrame: 223, commitFrame: 193, mv: 6089, offtune: 7350 },
    { hitFrame: 229, commitFrame: 193, mv: 6089, offtune: 7350 },
    { hitFrame: 235, commitFrame: 193, mv: 6089, offtune: 7350 },
    { hitFrame: 254, mv: 20876, offtune: 25200 },
  ], castConcerto: 2000, castForte1: 200, castEnergy: -12500,
  updateBuffs: () => { applyCurrent(SEAL_WINDOW, 1); },
});

// --- the two Intros, both Basic Attack DMG: Flash Rift from Awakened Mind (into Deep Mind,
//     Delusion cleared), Thunder Rending from Deep Mind (+200 Delusion)
const IntroFlashRift = annaAction("Intro - Furled Canopy: Flash Rift", {
  endPosition: Position.Grounded, animFrames: 103, noSwapFrames: 90, motionStop: [0, 90], animPriority: { 88: 2 }, castPriority: 11,
  requireBuff: AWAKENED_MIND, node: Node.Intro, cast: Cast.Intro, resetForte1: true, type: Type.Basic,
  bullets: [
    { hitFrame: 61, mv: 11089, energy: 300, offtune: 5578 },
    { hitFrame: 67, commitFrame: 61, mv: 11089, energy: 300, offtune: 5578 },
    { hitFrame: 85, mv: 3697, energy: 100, offtune: 1860 },
    { hitFrame: 91, commitFrame: 85, mv: 3697, energy: 100, offtune: 1860 },
    { hitFrame: 97, commitFrame: 85, mv: 3697, energy: 100, offtune: 1860 },
    { hitFrame: 103, commitFrame: 85, mv: 3697, energy: 100, offtune: 1860 },
  ], castConcerto: 1000,
  // entering Deep Mind resets Rift Cleaver's cooldown
  updateBuffs: () => {
    applyCurrent(DEEP_MIND, 1);
    revokeCurrent(AWAKENED_MIND);
    resetCooldown(RiftCleaver);
  },
});
const IntroThunderRending = annaAction("Intro - Unfurled Canopy: Thunder Rending", {
  endPosition: Position.Grounded, requireBuff: DEEP_MIND, animFrames: 83, motionStop: [0, 68], animPriority: { 66: 2 }, castPriority: 11, noSwapFrames: 68, node: Node.Intro, cast: Cast.Intro, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 13143, energy: 250, offtune: 4407 },
    { hitFrame: 26, mv: 6572, energy: 125, offtune: 2204 },
    { hitFrame: 29, commitFrame: 26, mv: 6572, energy: 125, offtune: 2204 },
    { hitFrame: 36, mv: 13143, energy: 250, offtune: 4407 },
    { hitFrame: 59, mv: 13143, energy: 250, offtune: 4407 },
  ], castConcerto: 1000, castForte1: 200,
});

const INTROS = new Set<Action>([IntroFlashRift, IntroThunderRending]);

// --- Forte Circuit: the two full-bar skills and Engraved Heart behind them, all Basic Attack DMG
const SealedDelusion = annaAction("Forte Skill - Furled Canopy: Sealed Delusion", { minForte1: 800, requireBuff: AWAKENED_MIND,
  animFrames: 107, animPriority: { 104: 2 }, castPriority: 5,
  node: Node.Forte, cast: Cast.Skill, type: Type.Basic, bullets: [
    { hitFrame: 61, mv: 6278, energy: 217, concerto: 181, offtune: 3609 },
    { hitFrame: 67, mv: 6278, energy: 217, concerto: 181, offtune: 3609 },
    { hitFrame: 89, mv: 3139, energy: 109, concerto: 91, offtune: 1805 },
    { hitFrame: 95, mv: 3139, energy: 109, concerto: 91, offtune: 1805 },
    { hitFrame: 101, mv: 3139, energy: 109, concerto: 91, offtune: 1805 },
    { hitFrame: 107, mv: 3139, energy: 109, concerto: 91, offtune: 1805 },
  ],
  castForte1: -800,
  // entering Deep Mind resets Rift Cleaver's cooldown
  updateBuffs: () => {
    applyCurrent(DEEP_MIND, 1);
    revokeCurrent(AWAKENED_MIND);
    resetCooldown(RiftCleaver);
  },
});
const UnforsakenMind = annaAction("Skill - Unfurled Canopy: Unforsaken Mind", { forbidBuff: ENGRAVED_HEART_READY, minForte1: 800, requireBuff: DEEP_MIND, animFrames: 68, castPriority: 5, bullets: [{ hitFrame: 59, mv: 15267, offtune: 8776 }], node: Node.Forte, cast: Cast.Skill, type: Type.Basic,
  updateBuffs: () => {
    applyCurrent(ENGRAVED_HEART_READY, 1);
    // Engraved Heart is "within a certain period after", not only next
    saveChain(UnforsakenMind);
  },
});
/** Calamity Mind for its own duration, Awakened Mind once it ends: Deep Mind is simply over. */
const EngravedHeart = annaAction("Forte Basic - Umbral Canopy: Engraved Heart", { after: [UnforsakenMind], requireBuff: ENGRAVED_HEART_READY,
  animFrames: 308, noSwapFrames: 256, timestop: [107, 240], motionStop: [107, 240], animPriority: { 108: 12, 263: 2 }, castPriority: 12,
  node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 15514, energy: 205, offtune: 2602 },
    { hitFrame: 19, mv: 7757, energy: 103, offtune: 1301 },
    { hitFrame: 25, commitFrame: 19, mv: 7757, energy: 103, offtune: 1301 },
    { hitFrame: 29, mv: 15514, energy: 205, offtune: 2602 },
    { hitFrame: 90, mv: 15514, energy: 205, offtune: 2602 },
    { hitFrame: 98, mv: 7757, energy: 103, offtune: 1301 },
    { hitFrame: 104, commitFrame: 98, mv: 7757, energy: 103, offtune: 1301 },
    { hitFrame: 108, mv: 3879, energy: 52, offtune: 651 },
    { hitFrame: 116, commitFrame: 108, mv: 3879, energy: 52, offtune: 651 },
    { hitFrame: 124, commitFrame: 108, mv: 3879, energy: 52, offtune: 651 },
    { hitFrame: 131, commitFrame: 108, mv: 3879, energy: 52, offtune: 651 },
    { hitFrame: 140, mv: 1940 },
    { hitFrame: 146, commitFrame: 140, mv: 1940 },
    { hitFrame: 152, commitFrame: 140, mv: 1940 },
    { hitFrame: 158, commitFrame: 140, mv: 1940 },
    { hitFrame: 164, commitFrame: 140, mv: 1940 },
    { hitFrame: 172, mv: 1940 },
    { hitFrame: 178, commitFrame: 172, mv: 1940 },
    { hitFrame: 184, commitFrame: 172, mv: 1940 },
    { hitFrame: 190, commitFrame: 172, mv: 1940 },
    { hitFrame: 196, commitFrame: 172, mv: 1940 },
    { hitFrame: 204, mv: 2424 },
    { hitFrame: 209, commitFrame: 204, mv: 2424 },
    { hitFrame: 214, mv: 2424 },
    { hitFrame: 219, commitFrame: 214, mv: 2424 },
    { hitFrame: 224, mv: 2424 },
    { hitFrame: 229, commitFrame: 224, mv: 2424 },
    { hitFrame: 234, mv: 2424 },
    { hitFrame: 239, commitFrame: 234, mv: 2424 },
    { hitFrame: 250, mv: 62055, energy: 818, concerto: 4000, offtune: 10405 },
  ], resetForte1: true,
  updateBuffs: () => {
    revokeCurrent(DEEP_MIND);
    revokeCurrent(ENGRAVED_HEART_READY);
  },
  afterAction: () => applyCurrent(AWAKENED_MIND, 1),
});

/** Canopy Rumble: the incoming resonator's Fusion DMG Amplification handoff. */
const Outro = annaAction("Outro - Canopy Rumble", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => queueQTE(CANOPY_RUMBLE),
});

/* ------------------------------------------------------------------------------------- buffs */

/** Rain-Soaked Covenant (Inherent Skill): any Intro is +50% Fusion DMG Bonus for 15s, ended early
 *  by switching out. */
const RAIN_SOAKED_COVENANT = new Buff({
  name: "Anna: Rain-Soaked Covenant",
  duration: 60 * 15,
  lostOnSwap: true,
  stats: [[Stat.DmgBonus, 50, Attribute.Fusion]],
});
const RAIN_SOAKED_INHERENT = new Inherent({
  name: "Inherent: Rain-Soaked Covenant",
  grants: [{ on: () => runningAnyOf(INTROS), buff: RAIN_SOAKED_COVENANT }],
});

/** The stages Seal Master pays: the whole Unfurled Canopy chain and both Whirling Thunder stages. */
const SEAL_MASTER_STAGES = new Set<Action>([UBA1, UBA2, UBA3, UBA4, UHA1, UHA2]);
/** Seal Master: +100% DMG Multiplier on the Unfurled Canopy chain and Whirling Thunder, +5 Concerto
 *  a stage on hit, +100% Crit. DMG, 12s or until switched out; the next Liberation ends it. */
const SEAL_MASTER: Buff = new Buff({
  name: "Anna: Seal Master",
  duration: 60 * 12,
  updateBuffs: () => {
    if (casting(Cast.Liberation)) revokeCurrent(SEAL_MASTER);
    else if (runningAnyOf(SEAL_MASTER_STAGES)) addGain({ concerto: 500 });
    // "shortly after casting Basic Attack - Unfurled Canopy Stage 4 ... chain into ... Stage 2"
    if (runningAction(UBA4)) saveChain(UBA1);
  },
  applyStats: () => {
    addStat(Stat.CritDmg, 100);
    if (!runningAnyOf(SEAL_MASTER_STAGES)) return;
    addStat(Stat.MulMv, 100);
    addStat(Stat.OfftuneMult, 40);
  },
  lostOnSwap: true,
});
const SUNKEN_SEAL = new Inherent({ name: "Inherent: Sunken Seal, Forged Lock" });

/** Canopy Rumble's handoff: +20% Fusion DMG Amplification, 8s or until switched out. */
const CANOPY_RUMBLE = new Buff({
  name: "Anna: Outro",
  duration: 60 * 14,
  lostOnSwap: true,
  stats: [[Stat.Amp, 15], [Stat.Amp, 25, Type.Basic]],
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: +60% DMG Multiplier on both Intros. */
const AN_S1 = new Sequence({
  name: "Anna S1: Into the Blight Rain",
  applyStats: () => { if (runningAnyOf(INTROS)) addStat(Stat.MulMv, 60); },
});

/** S2's handoff: the incoming resonator's Crit. DMG +10%, 30s or until switched out. */
const BREAKING_THUNDER_HANDOFF = new Buff({
  name: "Anna S2: Outro",
  duration: 60 * 30,
  lostOnSwap: true,
  stats: [[Stat.CritDmg, 10]],
});
/** S2: +40% Crit. DMG, and her Outro carries the handoff above on top of Canopy Rumble. */
const AN_S2 = new Sequence({
  name: "Anna S2: Breaking Thunder, Slaying Evil",
  stats: [[Stat.CritDmg, 40]],
  grants: [{ on: onCast(Cast.Outro), buff: BREAKING_THUNDER_HANDOFF, to: BuffTarget.Next }],
});

/** S3: +30% Basic Attack DMG Amplification off a Liberation, 25s — permanent. */
const LONE_CANOPY = new Buff({
  name: "Anna S3: Lone Canopy, Solitary Road",
  duration: 60 * 25,
  stats: [[Stat.Amp, 30, Type.Basic]],
});
const AN_S3 = new Sequence({
  name: "Anna S3: Lone Canopy, Solitary Road",
  grants: [{ on: onCast(Cast.Liberation), buff: LONE_CANOPY }],
});

const AN_S4 = new Sequence({
  name: "Anna S4: Covenant Borne Upon the Heart",
  stats: [[Stat.BonusAtk, 20]],
});

const AN_S5 = new Sequence({
  name: "Anna S5: Seal Deep, Never Forgotten",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 40); },
});

/** S6: Engraved Heart's multiplier +50%, and Seal Master's Crit. DMG another +200%. */
const AN_S6 = new Sequence({
  name: "Anna S6: Nine Shadows at Her Side",
  applyStats: () => {
    if (runningAction(EngravedHeart)) addStat(Stat.MulMv, 50);
    if (isHeld(SEAL_MASTER)) addStat(Stat.CritDmg, 200);
  },
});

const AN_SEQUENCES = [AN_S1, AN_S2, AN_S3, AN_S4, AN_S5, AN_S6];

/* --------------------------------------------------------------------------- kit and loadout */

const ANNA_TALENTS = new Talent({
  name: "Anna: Talents",
  stats: [[Stat.BonusAtk, 11.9999997], [Stat.CritRate, 8]],
});

export const ANNA_RESONATOR = new Resonator({
  id: 1213,
  name: "Anna",
  stats: [[Stat.BaseHp, 10300], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1112.2202]],
  talent: ANNA_TALENTS,
  inherent1: RAIN_SOAKED_INHERENT,
  inherent2: SUNKEN_SEAL,
  element: Attribute.Fusion,
  weapon: WeaponType.Rectifier,
  color: "#ff3d77",
  intro: () => (isHeld(DEEP_MIND) ? IntroThunderRending : IntroFlashRift),
  swapIn: () => (isHeld(DEEP_MIND) ? UBA1 : BA1),
  swapInAir: MA,
  maxEnergy: 12500,
  maxForte1: 800,
  combatStart: () => applyCurrent(AWAKENED_MIND, 1),
});

/* ---------------------------------------------------------------------------------- rotation */

const UBA12UHA12 = new ActionGroup("Basic - Unfurled 12 + Whirling Thunder 12", [UBA1, UBA2, UHA1, UHA2]);

/** Suoming's Seal Master main-DPS loop: the Intro drops her into Deep Mind, the Liberation lays
 *  Tune Rupture and opens the Seal window, Rift Cleaver spends it for Seal Master, the Unfurled
 *  chain rebuilds the 800 Delusion for Unforsaken Mind, and Engraved Heart spends the bar. */
const AN_ROTATION = new Rotation([
  START, BA1.instaSwap(),
  IntroFlashRift.mashCancel(), IntroThunderRending.mashCancel(),
  Liberation,
  RiftCleaver.instaDodge(),
  UBA12UHA12.dodgeCancel(),
  UBA12UHA12.cancel(),
  UnforsakenMind, EngravedHeart,
  Outro,
]);

export const ANNA = new Loadout({
  id: 12131,
  resonator: ANNA_RESONATOR,
  weapons: [ANNA_SIG, COSMIC_RIPPLES, NEW_STD_RECTIFIER, LETHEAN_ELEGY, WHISPERS_OF_SIRENS, STRINGMASTER, AUGMENT, RADIANT_DAWN],
  echoes: new Echoes({
    sets: [new EchoLoadout(COLLAPSAR_BLADE_MAINSLOT, TRAILBLAZING_STAR_5PC)],
    mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
    substats: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation, Substat.Skill),
  }),
  sequences: AN_SEQUENCES,
  rotation: AN_ROTATION,
});
