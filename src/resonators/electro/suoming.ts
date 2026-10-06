/**
 * Suoming — an Electro Sword main DPS whose damage is nearly all Basic Attack DMG: every Intro,
 * both Forte skills and Engraved Heart are "considered Basic Attack DMG" by her own text, so only
 * Rift Cleaver, Crimson Gleam and the Liberation are anything else.
 *
 * Three states, named rather than tracked as live combo state (the Jinhsi/Camellya shape), with
 * **Delusion** (forte 1, 800 cap) as the one gauge:
 *
 * - **Awakened Mind** (AWAKENED_MIND, from combat start): Furled Canopy basics build Delusion.
 *   Intro Flash Rift, or Sealed Delusion at a full bar, sends her into Deep Mind, clearing it.
 * - **Deep Mind**: Unfurled Canopy basics and Whirling Thunder build Delusion; the Liberation is
 *   only available here (+200 Delusion), and Intro Thunder Rending grants +200 too. At a full bar
 *   the Resonance Skill is Unforsaken Mind, after which the Basic Attack is Engraved Heart —
 *   **Calamity Mind** for its duration, cleared Delusion, and Awakened Mind the moment it ends
 *   (Calamity itself is never read, so it is just neither marker).
 * - The Rift Cleaver is the plain Resonance Skill in either state.
 *
 * **Unison** (shared/unison.ts): the Liberation grants it, 5s, once every 25s — one Liberation a
 * loop, so always. Two ways to spend it, and a loadout takes one:
 *
 * - Rift Cleaver with Unison (Sunken Seal, Forged Lock) removes it and the Unison Boon stack she
 *   granted, spends 20 Concerto, clears Delusion and grants **Seal Master**: +100% DMG Multiplier on Unfurled Canopy and Whirling
 *   Thunder, +5 Concerto a stage on hit, +100% Crit. DMG, 12s or until switched out — the main-DPS
 *   way to play her, and the whole of SM_ROTATION_MDPS below.
 * - Swapping out with it (a Unison outro, the bar handed back) grants **Aligned Seals**, 30s, and
 *   with it her Outro hands the incoming resonator +30% Electro DMG Bonus, +20% a Unison Boon
 *   stack they hold up to +40%, 8s or until switched out; and Blight Rain, Miasmic Thunder summons
 *   a Thunder Crest coordinated attack a second off the active resonator's damage, six in all.
 *   Seal Master cannot be gained while Aligned Seals stands, and each ends the other. This is
 *   the one rotation written: a short sub-DPS visit that always leaves on the Unison outro.
 *
 * **Unison Response**: a teammate's Unison outro (Jinhsi's) makes her Intro its Unison form,
 * which hands the whole team Unison Boon — one stack from her this way, 30s refreshed, so
 * permanent — and a Unison Intro also pays +10 Concerto (Rain-Soaked Covenant, once every 25s).
 * Each stack is +3% DMG dealt to the team's responders, which is her alone. Sequences 1-6 are
 * modelled from the same file — see their own block below.
 *
 * MVs from nanoka (character 1312, read through encore.moe); frames, per-hit gains and Delusion
 * from wuwalab. The flat "Concerto Regen" rows (each Intro's 10, Engraved Heart's 40) are on cast,
 * and the dodge counters carry the hidden +10. The larger twin rows on the Intros (x1.6) and Engraved
 * Heart (x1.5) are S1 and S6 re-shown; Seal Master's twins (x2 MV, ~1.4x off-tune) are paid by
 * SEAL_MASTER itself. Engraved
 * Heart is its tap row plus its "(Hold)" row: the rotation holds it, and holding adds the 19.40%x10
 * and 24.24%x8 ticks on top. Blight Rain's Thunder Crest window is the kit's own six crests over
 * eight presses as a coordinated window (gear.ts's `coordinatedBuff`, see BLIGHT_RAIN below).
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, coordinatedBuff } from "../../engine/gear.js";
import {
  addStat,
  applyCurrent,
  applyTeam,
  casting,
  runningAction,
  isHeld,
  queueQTE,
  resetCooldown,
  revokeCurrent,
  setForte1,
  stacksOf,
  onCast,
  runningAnyOf,
  addGain,
} from "../../engine/context.js";
import { Action, ActionField, ActionGroup, Rotation, ECHO, NOINTRO, ActionTag, INTRO, OUTRO, DOUBLE_INTRO } from "../../engine/rotation.js";
import { tuneBreak, SWORD_BREAK } from "../../shared/tunebreak.js";
import { NINE_SHADOWS, UNISON, UNISON_BOON, BOON_REACTOR, grantBoon, takeBoon, respondToUnison, unisonIntro, unisonOutro, unisonResponse } from "../../shared/unison.js";
import { RED_SPRING, UNSPOKEN_RUE } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { STAY_TUNED, STAY_TUNED_3C, SWORN_VIGIL_5PC } from "../../echoes/mengzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- states */

/** The Deep Mind marker, no stat of its own. */
const DEEP_MIND = new Buff({ name: "Suoming: Deep Mind" });
/** Awakened Mind: held from combat start, left for Deep Mind, back once Engraved Heart ends
 *  (Calamity Mind, between them, is neither). */
const AWAKENED_MIND = new Buff({ name: "Suoming: Awakened Mind" });
/** Unforsaken Mind's window: Basic Attack and Resonance Skill are Engraved Heart until it is cast. */
const ENGRAVED_HEART_READY = new Buff({ name: "Suoming: Engraved Heart Ready" });

/* ----------------------------------------------------------------------------------- actions */

function suomingAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- Furled Canopy, the Awakened Mind chain
const BA1 = suomingAction("Basic - Furled Canopy 1", { requireBuff: AWAKENED_MIND, animFrames: 24, castPriority: 2, bullets: [{ hitFrame: 10, mv: 3155, energy: 191, concerto: 159, offtune: 3174, forte1: 120 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
const BA2 = suomingAction("Basic - Furled Canopy 2", { requireBuff: AWAKENED_MIND, animFrames: 47, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 1573, energy: 95, concerto: 80, offtune: 1583, forte1: 40 },
    { hitFrame: 19, commitFrame: 14, mv: 1573, energy: 95, concerto: 80, offtune: 1583, forte1: 40 },
    { hitFrame: 31, mv: 3146, energy: 190, concerto: 159, offtune: 3165, forte1: 80 },
  ]});
const BA3 = suomingAction("Basic - Furled Canopy 3", { requireBuff: AWAKENED_MIND, animFrames: 82, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 2201, energy: 133, concerto: 111, offtune: 2214, forte1: 36 },
    { hitFrame: 21, commitFrame: 16, mv: 2201, energy: 133, concerto: 111, offtune: 2214, forte1: 36 },
    { hitFrame: 27, commitFrame: 16, mv: 2201, energy: 133, concerto: 111, offtune: 2214, forte1: 36 },
    { hitFrame: 63, mv: 4402, energy: 266, concerto: 222, offtune: 4428, forte1: 72 },
  ]});
const MA = suomingAction("Mid-air - Furled Canopy Plunge", { animFrames: 41, animPriority: { 40: 2 }, castPriority: 4, bullets: [{ hitFrame: 29, mv: 8420, energy: 509, concerto: 424, offtune: 8470 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
const DC = suomingAction("Dodge Counter - Furled Canopy", { requireBuff: AWAKENED_MIND, animFrames: 47, animPriority: { 0: 2 }, castPriority: 7, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 2766, energy: 167, concerto: 140, offtune: 2783, forte1: 40 },
    { hitFrame: 19, commitFrame: 14, mv: 2766, energy: 167, concerto: 140, offtune: 2783, forte1: 40 },
    { hitFrame: 31, mv: 5532, energy: 334, concerto: 279, offtune: 5565, forte1: 80 },
  ], castConcerto: 1000});

// --- Unfurled Canopy, the Deep Mind chain, and Whirling Thunder held out of its stage 2
const UBA1 = suomingAction("Basic - Unfurled Canopy 1", { requireBuff: DEEP_MIND, animFrames: 39, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 23, mv: 6542, energy: 158, concerto: 132, offtune: 3949, forte1: 60 },
    { hitFrame: 31, mv: 3271, energy: 79, concerto: 66, offtune: 1975, forte1: 30 },
    { hitFrame: 35, commitFrame: 31, mv: 3271, energy: 79, concerto: 66, offtune: 1975, forte1: 30 },
  ]});
const UBA2 = suomingAction("Basic - Unfurled Canopy 2", { requireBuff: DEEP_MIND, animFrames: 68, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 11440, energy: 277, concerto: 231, offtune: 6905, forte1: 80 },
    { hitFrame: 37, mv: 3814, energy: 93, concerto: 77, offtune: 2302, forte1: 27 },
    { hitFrame: 43, commitFrame: 37, mv: 3814, energy: 93, concerto: 77, offtune: 2302, forte1: 27 },
    { hitFrame: 49, commitFrame: 37, mv: 3814, energy: 93, concerto: 77, offtune: 2302, forte1: 27 },
  ]});
const UBA3 = suomingAction("Basic - Unfurled Canopy 3", { requireBuff: DEEP_MIND, animFrames: 70, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 30, mv: 5864, energy: 142, concerto: 118, offtune: 3540, forte1: 45 },
    { hitFrame: 35, commitFrame: 30, mv: 5864, energy: 142, concerto: 118, offtune: 3540, forte1: 45 },
    { hitFrame: 50, mv: 5864, energy: 142, concerto: 118, offtune: 3540, forte1: 45 },
    { hitFrame: 60, commitFrame: 50, mv: 5864, energy: 142, concerto: 118, offtune: 3540, forte1: 45 },
  ]});
const UBA4 = suomingAction("Basic - Unfurled Canopy 4", { requireBuff: DEEP_MIND, animFrames: 115, animPriority: { 0: 4, 103: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 15, mv: 10725, energy: 259, concerto: 216, offtune: 6474, forte1: 54 },
    { hitFrame: 53, mv: 10725, energy: 259, concerto: 216, offtune: 6474, forte1: 54 },
    { hitFrame: 95, mv: 4767, energy: 116, concerto: 96, offtune: 2878, forte1: 24 },
    { hitFrame: 102, mv: 4767, energy: 116, concerto: 96, offtune: 2878, forte1: 24 },
    { hitFrame: 109, mv: 4767, energy: 116, concerto: 96, offtune: 2878, forte1: 24 },
  ]});
const UHA1 = suomingAction("Heavy - Unfurled Canopy: Whirling Thunder 1", { requireBuff: DEEP_MIND, animFrames: 88, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 7332, energy: 177, concerto: 148, offtune: 4425, forte1: 45 },
    { hitFrame: 27, mv: 3666, energy: 89, concerto: 74, offtune: 2213, forte1: 23 },
    { hitFrame: 30, commitFrame: 27, mv: 3666, energy: 89, concerto: 74, offtune: 2213, forte1: 23 },
    { hitFrame: 38, mv: 7332, energy: 177, concerto: 148, offtune: 4425, forte1: 45 },
    { hitFrame: 63, mv: 7332, energy: 177, concerto: 148, offtune: 4425, forte1: 45 },
  ]});
const UHA2 = suomingAction("Heavy - Unfurled Canopy: Whirling Thunder 2", { requireBuff: DEEP_MIND, animFrames: 85, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 33, mv: 5669, energy: 137, concerto: 115, offtune: 3422, forte1: 36 },
    { hitFrame: 38, commitFrame: 33, mv: 5669, energy: 137, concerto: 115, offtune: 3422, forte1: 36 },
    { hitFrame: 43, commitFrame: 33, mv: 5669, energy: 137, concerto: 115, offtune: 3422, forte1: 36 },
    { hitFrame: 48, commitFrame: 33, mv: 5669, energy: 137, concerto: 115, offtune: 3422, forte1: 36 },
    { hitFrame: 52, commitFrame: 33, mv: 5669, energy: 137, concerto: 115, offtune: 3422, forte1: 36 },
  ]});
const UDC = suomingAction("Dodge Counter - Unfurled Canopy", { requireBuff: DEEP_MIND, animFrames: 68, animPriority: { 0: 2 }, castPriority: 7, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 17404, energy: 421, concerto: 351, offtune: 7004, forte1: 80 },
    { hitFrame: 37, mv: 5802, energy: 141, concerto: 117, offtune: 2335, forte1: 27 },
    { hitFrame: 43, commitFrame: 37, mv: 5802, energy: 141, concerto: 117, offtune: 2335, forte1: 27 },
    { hitFrame: 49, commitFrame: 37, mv: 5802, energy: 141, concerto: 117, offtune: 2335, forte1: 27 },
  ], castConcerto: 1000});

// --- Rift Cleaver, the plain Resonance Skill in either state. Holding Unison additionally spends
//     it, her Unison Boon stack, 20 Concerto, and every point of Delusion, for Seal Master (see SUNKEN_SEAL below).
//     Crimson Gleam is the follow-up a counter-cast Rift Cleaver triggers, which needs the target
//     to attack into it — left for a rotation to name.
const RiftCleaver = suomingAction("Skill - Furled Canopy: Rift Cleaver", { maxForte1: 799, animFrames: 42, animPriority: { 40: 2 }, castPriority: 4, bullets: [{ hitFrame: 21, commitFrame: 0, mv: 10661, energy: 368, concerto: 307, offtune: 6128 }], cooldown: 60 * 8,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill,
  updateBuffs: () => {
    if (!isHeld(UNISON)) return;
    addGain({ concerto: -2000 });
    setForte1(0);
    revokeCurrent(UNISON);
    // 3.7.4: the one Boon stack she granted goes too, so her next Unison Response grants afresh
    if (isHeld(BOON_RESPONSE)) takeBoon();
    revokeCurrent(BOON_RESPONSE);
    if (!isHeld(ALIGNED_SEALS)) applyCurrent(SEAL_MASTER, 1);
  },
});
const CrimsonGleamParry = suomingAction("Skill - Unfurled Canopy: Crimson Gleam", { animFrames: 67, animPriority: { 67: 0 }, castPriority: 5, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 2, mv: 4725, energy: 163, concerto: 136, offtune: 2717, forte1: 48 },
    { hitFrame: 10, mv: 2363, energy: 82, concerto: 68, offtune: 1359, forte1: 24 },
    { hitFrame: 19, commitFrame: 10, mv: 2363, energy: 82, concerto: 68, offtune: 1359, forte1: 24 },
    { hitFrame: 31, mv: 6300, energy: 218, concerto: 182, offtune: 3622, forte1: 64 },
  ]});

// --- Umbral Canopy: Miasma Lock, Deep Mind only; grants Unison and 200 Delusion
const Liberation = suomingAction("Liberation - Umbral Canopy: Miasma Lock", { requireBuff: DEEP_MIND,
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
  ], castConcerto: 2000, castForte1: 200, resetEnergy: true,
  updateBuffs: () => { applyCurrent(UNISON, 1); },
});
/** Blight Rain, Miasmic Thunder: the Thunder Crest, one a second off the active resonator's own
 *  damage during the Unison outro's window, on her own slot. */
const BLIGHT_RAIN_FIELD = new ActionField("Suoming: Blight Rain, Miasmic Thunder");
const ThunderCrest = suomingAction("Liberation - Blight Rain, Miasmic Thunder", {
  tag: ActionTag.Field, type: Type.Liberation, subtype: Subtype.Coordinated, bullets: [{ hitFrame: 3, mv: 5965 }], field: BLIGHT_RAIN_FIELD,
});

// --- the four Intros, all Basic Attack DMG: Furled forms from Awakened Mind (into Deep Mind,
//     Delusion cleared), Unfurled forms from Deep Mind (+200 Delusion); the (Unison) pair answer a
//     Unison outro and are what triggers Unison Response
const INTRO_FURLED = {
  requireBuff: AWAKENED_MIND, node: Node.Intro, cast: Cast.Intro, resetForte1: true, type: Type.Basic,
  bullets: [
    { hitFrame: 61, mv: 11089, energy: 300, offtune: 5578 },
    { hitFrame: 67, commitFrame: 61, mv: 11089, energy: 300, offtune: 5578 },
    { hitFrame: 85, mv: 3697, energy: 100, offtune: 1860 },
    { hitFrame: 91, commitFrame: 85, mv: 3697, energy: 100, offtune: 1860 },
    { hitFrame: 97, commitFrame: 85, mv: 3697, energy: 100, offtune: 1860 },
    { hitFrame: 103, commitFrame: 85, mv: 3697, energy: 100, offtune: 1860 },
  ], castConcerto: 1000,
};
const IntroFlashRift = suomingAction("Intro - Furled Canopy: Flash Rift", {
  animFrames: 103, noSwapFrames: 90, motionStop: [0, 90], animPriority: { 88: 2 }, castPriority: 11,
  ...INTRO_FURLED,
  // entering Deep Mind resets Rift Cleaver's cooldown
  updateBuffs: () => {
    applyCurrent(DEEP_MIND, 1);
    revokeCurrent(AWAKENED_MIND);
    resetCooldown(RiftCleaver);
  },
});
const IntroSealedDelusion = suomingAction("Intro - Furled Canopy: Sealed Delusion (Unison)", {
  animFrames: 103, noSwapFrames: 90, motionStop: [0, 90], animPriority: { 88: 2 }, castPriority: 11,
  ...INTRO_FURLED,
  // entering Deep Mind resets Rift Cleaver's cooldown
  updateBuffs: () => {
    respondToUnison();
    applyCurrent(DEEP_MIND, 1);
    revokeCurrent(AWAKENED_MIND);
    resetCooldown(RiftCleaver);
  },
});

const INTRO_UNFURLED = {
  requireBuff: DEEP_MIND, animFrames: 83, motionStop: [0, 68], animPriority: { 66: 2 }, castPriority: 11, noSwapFrames: 68, node: Node.Intro, cast: Cast.Intro, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 13143, energy: 250, offtune: 4407 },
    { hitFrame: 26, mv: 6572, energy: 125, offtune: 2204 },
    { hitFrame: 29, commitFrame: 26, mv: 6572, energy: 125, offtune: 2204 },
    { hitFrame: 36, mv: 13143, energy: 250, offtune: 4407 },
    { hitFrame: 59, mv: 13143, energy: 250, offtune: 4407 },
  ], castConcerto: 1000, castForte1: 200,
};
const IntroThunderRending = suomingAction("Intro - Unfurled Canopy: Thunder Rending", INTRO_UNFURLED);
const IntroWhirlingThunder = suomingAction("Intro - Unfurled Canopy: Whirling Thunder (Unison)", { ...INTRO_UNFURLED, updateBuffs: respondToUnison });


const INTROS = new Set<Action>([IntroFlashRift, IntroThunderRending, IntroSealedDelusion, IntroWhirlingThunder]);

// --- Forte Circuit: the two full-bar skills and Engraved Heart behind them, all Basic Attack DMG
const SealedDelusion = suomingAction("Forte Skill - Furled Canopy: Sealed Delusion", { minForte1: 800, requireBuff: AWAKENED_MIND,
  animFrames: 107, animPriority: { 104: 2 }, castPriority: 5,
  node: Node.Forte, cast: Cast.Skill, type: Type.Basic, bullets: [
    { hitFrame: 61, mv: 6278, energy: 217, concerto: 181, offtune: 3609 },
    { hitFrame: 67, mv: 6278, energy: 217, concerto: 181, offtune: 3609 },
    { hitFrame: 89, mv: 3139, energy: 109, concerto: 91, offtune: 1805 },
    { hitFrame: 95, mv: 3139, energy: 109, concerto: 91, offtune: 1805 },
    { hitFrame: 101, mv: 3139, energy: 109, concerto: 91, offtune: 1805 },
    { hitFrame: 107, mv: 3139, energy: 109, concerto: 91, offtune: 1805 },
  ],
  // only fires at a full 800 Delusion — maxForte1 (800) clamps an overrun back to the cap before
  // this lands exactly on 0
  castForte1: -800,
  // entering Deep Mind resets Rift Cleaver's cooldown
  updateBuffs: () => {
    applyCurrent(DEEP_MIND, 1);
    revokeCurrent(AWAKENED_MIND);
    resetCooldown(RiftCleaver);
  },
});
const UnforsakenMind = suomingAction("Skill - Unfurled Canopy: Unforsaken Mind", { minForte1: 800, requireBuff: DEEP_MIND, animFrames: 68, castPriority: 5, bullets: [{ hitFrame: 59, mv: 15267, offtune: 8776 }], node: Node.Forte, cast: Cast.Skill, type: Type.Basic,
  updateBuffs: () => applyCurrent(ENGRAVED_HEART_READY, 1),
});
/** Calamity Mind for its own duration, Awakened Mind once it ends: Deep Mind is simply over. */
const EngravedHeart = suomingAction("Forte Basic - Umbral Canopy: Engraved Heart", { requireBuff: ENGRAVED_HEART_READY,
  // 263 frames the prio drops to 2; the last hit is in at 250
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
    { hitFrame: 250, mv: 62055, energy: 818, offtune: 10405 },
  ], castConcerto: 4000, resetForte1: true,
  updateBuffs: () => {
    revokeCurrent(DEEP_MIND);
    revokeCurrent(ENGRAVED_HEART_READY);
  },
  afterAction: () => applyCurrent(AWAKENED_MIND, 1),
});

/** Canopy Rumble. With Unison still held this is the Unison outro: Aligned Seals, the Crest
 *  window, and the Aligned handoff on top of the ordinary one. Unison itself is spent by its own
 *  updateBuffs, after these hooks. */
const Outro = suomingAction("Outro - Canopy Rumble", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => {
    queueQTE(CANOPY_RUMBLE);
    queueQTE(CANOPY_RUMBLE_SKILL);
    if (isHeld(UNISON)) {
      applyCurrent(ALIGNED_SEALS, 1); revokeCurrent(SEAL_MASTER);
      applyTeam(BLIGHT_RAIN, BLIGHT_RAIN.maxStacks);
    }
    if (isHeld(ALIGNED_SEALS)) queueQTE(ALIGNED_SEALS_HANDOFF);
  },
});
const OutroUnison = unisonOutro(Outro);

/* ------------------------------------------------------------------------------------- buffs */

/** Rain-Soaked Covenant (Inherent Skill): any Intro is +50% Electro DMG Bonus for 15s, ended
 *  early by switching out; a Unison Intro also pays +10 Concerto, once every 25s — once a loop. */
const RAIN_SOAKED_COVENANT = new Buff({
  name: "Suoming: Rain-Soaked Covenant",
  duration: 60 * 15,
  lostOnSwap: true,
  stats: [[Stat.DmgBonus, 50, Attribute.Electro]],
});
const RAIN_SOAKED_INHERENT = new Inherent({
  name: "Inherent: Rain-Soaked Covenant",
  grants: [{ on: () => runningAnyOf(INTROS), buff: RAIN_SOAKED_COVENANT }],
  // a gain the press makes once, so on its cast: the Intro now lands as its separate hits
  updateBuffs: () => { if (runningAction(IntroSealedDelusion) || runningAction(IntroWhirlingThunder)) addGain({ concerto: 1000 }); },
});

/** The stages Seal Master pays: the whole Unfurled Canopy chain and both Whirling Thunder stages. */
const SEAL_MASTER_STAGES = new Set<Action>([UBA1, UBA2, UBA3, UBA4, UHA1, UHA2]);
/** Seal Master: +100% DMG Multiplier on the Unfurled Canopy chain and Whirling Thunder, +5 Concerto
 *  a stage on hit, +100% Crit. DMG, 12s or until switched out. Gaining Unison ends it — the next
 *  Liberation — as does Aligned Seals (the Outro cast above). The Concerto is the kit text's, not a
 *  row of the damage table, so it goes through the buff (CLAUDE.md) and a re-sync cannot lose it. */
const SEAL_MASTER = new Buff({
  name: "Suoming: Seal Master",
  duration: 60 * 12,
  updateBuffs: () => {
    if (isHeld(UNISON) && casting(Cast.Liberation)) revokeCurrent(SEAL_MASTER);
    else if (runningAnyOf(SEAL_MASTER_STAGES)) addGain({ concerto: 500 });
  },
  applyStats: () => {
    addStat(Stat.CritDmg, 100);
    if (!runningAnyOf(SEAL_MASTER_STAGES)) return;
    addStat(Stat.MulMv, 100);
    // those stages' own rows (encore's Seal Master twins, wuwalab alike) build 1.4x the off-tune
    addStat(Stat.OfftuneMult, 40);
  },
  lostOnSwap: true,
});

/** Aligned Seals: 30s, so permanent once she has left on a Unison outro. No stat of its own — it
 *  is what upgrades her Outro (ALIGNED_SEALS_HANDOFF) and what bars Seal Master. */
const ALIGNED_SEALS = new Buff({ name: "Suoming: Aligned Seals", duration: 60 * 30 });
const SUNKEN_SEAL = new Inherent({ name: "Inherent: Sunken Seal, Forged Lock" });

/** Canopy Rumble's handoff: +20% Electro DMG Amplification, and +25% Resonance Skill DMG
 *  Amplification while the holder has Unison Boon — 8s or until switched out. */
const CANOPY_RUMBLE = new Buff({
  name: "Suoming: Outro",
  duration: 60 * 8,
  lostOnSwap: true,
  stats: [[Stat.Amp, 20, Attribute.Electro]],
});
const CANOPY_RUMBLE_SKILL = new Buff({
  name: "Suoming: Outro (skill)", lostOnSwap: true, duration: 60 * 8,
  stats: [[Stat.Amp, 25, Type.Skill]], when: () => stacksOf(UNISON_BOON) > 0,
});

/** The Aligned Seals half of her Outro: +30% Electro DMG Bonus, +20% a Unison Boon stack the
 *  holder has, up to +40% — 8s or until switched out. The kit only hands it over when the Outro
 *  lands within 8s of her Liberation or Engraved Heart; both rotations leave straight off one of
 *  those, so the window is always open and nothing here has to time it. */
const ALIGNED_SEALS_HANDOFF = new Buff({
  name: "Suoming: Outro (aligned)",
  duration: 60 * 8,
  lostOnSwap: true,
  applyStats: () => addStat(Stat.DmgBonus, 30 + Math.min(40, 20 * stacksOf(UNISON_BOON)), Attribute.Electro),
});

/** Blight Rain, Miasmic Thunder's window: six Thunder Crests off the active resonator's own
 *  presses, on her slot however far the field has moved on. The six come over eight presses at
 *  a 4/3s cadence, the first and fifth skipped (x 1 1 1 x 1 1 1), which is where the crests fall
 *  against Jinhsi's chain — five before her Stella Glamor, the sixth on the Intro after it. */
const BLIGHT_RAIN = coordinatedBuff("Suoming: Blight Rain, Miasmic Thunder", 8, () => SUOMING_RESONATOR, ThunderCrest, { every: 4 / 3 });

/** Unison Response: her Unison Intro hands the team one stack of Unison Boon — one from her this
 *  way, refreshed after that. The marker is what remembers she already has — no `name`, so it
 *  stays out of the held-buffs list: the Unison Boon stack it handed over is the row that says so. */
const BOON_RESPONSE = new Buff({});

/* --------------------------------------------------------------------------------- sequences */

/** S1: +60% DMG Multiplier on all four Intros. Unforsaken Mind's interruption immunity is nothing
 *  the formula reads. */
const SM_S1 = new Sequence({
  name: "Suoming S1: Into the Blight Rain",
  applyStats: () => { if (runningAnyOf(INTROS)) addStat(Stat.MulMv, 60); },
});

/** S2's handoff: the incoming resonator's Crit. DMG +10%, +6% a Unison Boon stack they hold up to
 *  +24% — 30s or until switched out, so lost on swap. */
const BREAKING_THUNDER_HANDOFF = new Buff({
  name: "Suoming S2: Outro",
  duration: 60 * 30,
  lostOnSwap: true,
  applyStats: () => addStat(Stat.CritDmg, 10 + Math.min(24, 6 * stacksOf(UNISON_BOON))),
});
/** S2: +40% Crit. DMG, and her Outro carries the handoff above on top of Canopy Rumble. */
const SM_S2 = new Sequence({
  name: "Suoming S2: Breaking Thunder, Slaying Evil",
  stats: [[Stat.CritDmg, 40]],
  grants: [{ on: onCast(Cast.Outro), buff: BREAKING_THUNDER_HANDOFF, to: BuffTarget.Next }],
});

/** S3's own: +30% Basic Attack DMG Amplification off a Liberation, 25s — permanent. */
const LONE_CANOPY = new Buff({
  name: "Suoming S3: Lone Canopy, Solitary Road",
  duration: 60 * 25,
  stats: [[Stat.Amp, 30, Type.Basic]],
});
/** S3: Flash Rift and Thunder Rending — the Intros that are no response — grant the team's Unison
 *  Boon too, once every 25s. The kit's own clause makes it the one grant she has: a stack she has
 *  already put up is only refreshed, so it shares the response's marker rather than adding a
 *  second. And every Liberation opens the amplification above. */
const SM_S3 = new Sequence({
  name: "Suoming S3: Lone Canopy, Solitary Road",
  updateBuffs: () => {
    if (runningAction(IntroFlashRift) || runningAction(IntroThunderRending)) grantBoon(BOON_RESPONSE);
    if (casting(Cast.Liberation)) applyCurrent(LONE_CANOPY, 1);
  },
});

const SM_S4 = new Sequence({
  name: "Suoming S4: Covenant Borne Upon the Heart",
  stats: [[Stat.BonusAtk, 20]],
});

const SM_S5 = new Sequence({
  name: "Suoming S5: Seal Deep, Never Forgotten",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 40); },
});

/** S6: every Unison Boon stack pays the whole team's responders half again (unison.ts's own
 *  NINE_SHADOWS, up from the moment the fight starts), Engraved Heart's multiplier +50%, and Seal
 *  Master's Crit. DMG another +200%. */
const SM_S6 = new Sequence({
  name: "Suoming S6: Nine Shadows at Her Side",
  combatStart: () => applyTeam(NINE_SHADOWS, 1),
  applyStats: () => {
    if (runningAction(EngravedHeart)) addStat(Stat.MulMv, 50);
    if (isHeld(SEAL_MASTER)) addStat(Stat.CritDmg, 200);
  },
});

const SM_SEQUENCES = [SM_S1, SM_S2, SM_S3, SM_S4, SM_S5, SM_S6];

/* --------------------------------------------------------------------------- kit and loadout */

const SUOMING_TALENTS = new Talent({
  name: "Suoming: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

export const SUOMING_RESONATOR = new Resonator({
  name: "Suoming",
  stats: [[Stat.BaseHp, 10300], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1112.2202]],
  talent: SUOMING_TALENTS,
  inherent1: RAIN_SOAKED_INHERENT,
  inherent2: SUNKEN_SEAL,
  element: Attribute.Electro,
  weapon: WeaponType.Sword,
  // which state she is in, and whether the outro she answers was a Unison one — read off the
  // queue, since the handoff is adopted only once the Intro row itself is evaluated
  color: "#ea5d64",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  outro: () => (isHeld(UNISON) ? OutroUnison : Outro),
  intro: () => (isHeld(DEEP_MIND)
      ? (unisonIntro() ? IntroWhirlingThunder : IntroThunderRending)
      : (unisonIntro() ? IntroSealedDelusion : IntroFlashRift)),
  // 91 frames of time stop on a 90-frame break: the one over banks into the next press
  tuneBreak: tuneBreak(90, [0, 91], [0, 70], SWORD_BREAK),
  maxEnergy: 12500,
  maxForte1: 800,
  // Unison Response: the team's Unison Boon, one stack from her, refreshed after the first
  updateBuffs: () => {
    if (unisonResponse()) grantBoon(BOON_RESPONSE);
  },
  // she can trigger Unison Response, so she is a Unison Boon reactor (shared/unison.ts)
  combatStart: () => {
    applyCurrent(BOON_REACTOR, 1);
    applyCurrent(AWAKENED_MIND, 1);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

/** The double-Intro sub-DPS loop. The pre-visit is the short one — in, the Liberation for its
 *  Unison, and straight out on the Unison outro, the bar handed back so she never pays a real
 *  one — leaving whoever plays next under six Thunder Crests and the Aligned handoff. Their outro
 *  brings her round again for the real visit: her Intro (its Unison form when the outro she
 *  answers carried one) banks 200 Delusion in Deep Mind, the Unfurled chain carries it past 800
 *  for Unforsaken Mind, and Engraved Heart spends the lot. */
const BA123 = new ActionGroup("Basic - Furled Canopy 123", [BA1, BA2, BA3]);

const UBA12UHA12 = new ActionGroup("Basic - Unfurled 12 + Whirling Thunder 12", [UBA1, UBA2, UHA1, UHA2]);
const UBA234 = new ActionGroup("Basic - Unfurled Canopy 234", [UBA2, UBA3, UBA4]);
const UBA34 = new ActionGroup("Basic - Unfurled Canopy 34", [UBA3, UBA4]);
const UBA12 = new ActionGroup("Basic - Unfurled Canopy 12", [UBA1, UBA2]);
const UBA1234 = new ActionGroup("Basic - Unfurled Canopy 1234", [UBA1, UBA2, UBA3, UBA4]);
const UBA123 = new ActionGroup("Basic - Unfurled Canopy 123", [UBA1, UBA2, UBA3]);

/** Which Outro this resonator casts, resolved when its row is reached — whichever the
 *  kit's state calls for there. */

const SM_ROTATION = new Rotation([
  NOINTRO, BA123, BA123.cancel(), SealedDelusion,
  DOUBLE_INTRO, Liberation, OUTRO,

  INTRO, UHA2.dodgeCancel(), UBA12.cancel(),
  UnforsakenMind.noTb(), EngravedHeart.mashCancel(), ECHO.instaSwap(), OUTRO,
]);

/** The Seal Master main-DPS loop, the kit's other way to spend a Unison. Her Intro drops her into
 *  Deep Mind on an empty bar, the Liberation is the Unison she is here for, and the Rift Cleaver
 *  behind it spends it — 20 Concerto and every point of Delusion the Liberation just paid — for
 *  the 12s Seal Master window. The whole Unfurled chain runs inside that window, its own
 *  multipliers +40% and hers +80% Crit. DMG, rebuilding the 800 Delusion for Unforsaken Mind;
 *  Engraved Heart spends the bar and leaves her in Awakened Mind, which is the state the next
 *  loop's Flash Rift is written for. */
const SM_ROTATION_MDPS = new Rotation([

  INTRO.mashCancel(), 
  Liberation, 
  RiftCleaver.instaDodge(),
  UBA12UHA12.dodgeCancel(),
  UBA12UHA12.cancel(),
  UnforsakenMind.noTb(), EngravedHeart.mashCancel(), ECHO.instaSwap(),
  OUTRO,
]);
const SM_ROTATION_MDPS_SIMPLE = new Rotation([

  INTRO.mashCancel(), 
  Liberation, 
  RiftCleaver, UBA3, UBA4, UBA2, UBA3, UBA4,
  UnforsakenMind.noTb(), EngravedHeart.mashCancel(), ECHO.instaSwap(),
  OUTRO,
]);
const SM_ROTATION_MDPS_DOUBLE = new Rotation([
  DOUBLE_INTRO, UBA1.instaSwap(),

  INTRO, UHA2.cancel(),
  Liberation,
  RiftCleaver.instaDodge(),
  UBA12UHA12.dodgeCancel(),
  UBA12UHA12.cancel(),
  UnforsakenMind.noTb(), EngravedHeart.mashCancel(), ECHO.instaSwap(),
  OUTRO,
]);

const SM_ECHOES = [
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC),
  new EchoLoadout(STAY_TUNED_3C, SWORN_VIGIL_5PC),
];

export const SUOMING = new Loadout({
  resonator: SUOMING_RESONATOR,
  weapons: [UNSPOKEN_RUE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: SM_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation, Substat.Skill),
  sequences: SM_SEQUENCES,
  rotation: SM_ROTATION,
});

export const SUOMING_MDPS = new Loadout({
  resonator: SUOMING_RESONATOR,
  weapons: [UNSPOKEN_RUE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation, Substat.Skill),
  sequences: SM_SEQUENCES,
  rotation: SM_ROTATION_MDPS,
});
export const SUOMING_MDPS_SIMPLE = new Loadout({
  resonator: SUOMING_RESONATOR,
  weapons: [UNSPOKEN_RUE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation, Substat.Skill),
  sequences: SM_SEQUENCES,
  rotation: SM_ROTATION_MDPS_SIMPLE,
});
export const SUOMING_MDPS_DOUBLE = new Loadout({
  resonator: SUOMING_RESONATOR,
  weapons: [UNSPOKEN_RUE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation, Substat.Skill),
  sequences: SM_SEQUENCES,
  rotation: SM_ROTATION_MDPS_DOUBLE,
});