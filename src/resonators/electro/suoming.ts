/**
 * Suoming — an Electro Sword main DPS whose damage is nearly all Basic Attack DMG: every Intro,
 * both Forte skills and Engraved Heart are "considered Basic Attack DMG" by her own text, so only
 * Rift Cleaver, Crimson Gleam and the Liberation are anything else.
 *
 * Three states, named rather than tracked as live combo state (the Jinhsi/Camellya shape), with
 * **Delusion** (forte 1, 800 cap) as the one gauge:
 *
 * - **Awakened Mind** (the default, DEEP_MIND not held): Furled Canopy basics build Delusion.
 *   Intro Flash Rift, or Sealed Delusion at a full bar, sends her into Deep Mind, clearing it.
 * - **Deep Mind**: Unfurled Canopy basics and Whirling Thunder build Delusion; the Liberation is
 *   only available here (+200 Delusion), and Intro Thunder Rending grants +200 too. At a full bar
 *   the Resonance Skill is Unforsaken Mind, after which the Basic Attack is Engraved Heart —
 *   **Calamity Mind** for its duration, cleared Delusion, and Awakened Mind the moment it ends
 *   (never a state anything reads, so not a marker here).
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
 * Numbers from nanoka's 3.7.4 data (character 1312 — older version directories on that CDN are
 * *stale* betas, not earlier patches): per-hit MV/energy/concerto/off-tune/Delusion summed per action the way
 * CLAUDE.md describes, each Intro's "Concerto Regen 10" added on top of its hits, and the dodge
 * counters' hidden +10. Every Intro hit's element_power is 0 here, so those Regen rows are the whole
 * of an Intro's Concerto; Engraved Heart is the same, with "Concerto Regen 40" for all of its. The
 * duplicated larger rows on the intros (x1.6), Engraved Heart (x1.5) and the Unfurled basics (x1.4)
 * are S1, S6 and Seal Master re-shown — only Seal Master's contributes its multiplier here. Engraved
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
  currentAction,
  runningAction,
  forte1,
  isHeld,
  queueOutro,
  removeStackTeam,
  resetCooldown,
  revokeCurrent,
  setForte1,
  stacksOfTeam,
  onCast,
  runningAnyOf,
} from "../../engine/context.js";
import { Action, ActionField, ActionGroup, Rotation, ECHO, NOINTRO, ActionTag, INTRO, DOUBLE_INTRO } from "../../engine/rotation.js";
import { tuneBreak, SWORD_BREAK } from "../../shared/tunebreak.js";
import { NINE_SHADOWS, UNISON, UNISON_BOON, grantBoon, respondToUnison, boonPayout, unisonIntro, unisonOutro, unisonResponse } from "../../shared/unison.js";
import { RED_SPRING, UNSPOKEN_RUE } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { STAY_TUNED, STAY_TUNED_3C, SWORN_VIGIL_5PC } from "../../echoes/mengzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function suomingAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- Furled Canopy, the Awakened Mind chain
const BA1 = suomingAction("Basic - Furled Canopy 1", { animFrames: 24, commitFrames: 10, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 31.55, energy: 1.91, concerto: 1.59, offtune: 3174, forte1: 120 });
// PLACEHOLDER FRAMES
const BA2 = suomingAction("Basic - Furled Canopy 2", { animFrames: 47, commitFrames: 31, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 31, mv: 15.73, energy: 0.95, concerto: 0.7975, offtune: 1582.75 },
    { at: 31, mv: 15.73, energy: 0.95, concerto: 0.7975, offtune: 1582.75 },
    { at: 31, mv: 31.46, energy: 1.9, concerto: 1.595, offtune: 3165.5, forte1: 160 },
  ]});
// PLACEHOLDER FRAMES
const BA3 = suomingAction("Basic - Furled Canopy 3", { animFrames: 82, commitFrames: 63, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 63, mv: 22.01, energy: 1.33, concerto: 1.11, offtune: 2214 },
    { at: 63, mv: 22.01, energy: 1.33, concerto: 1.11, offtune: 2214 },
    { at: 63, mv: 22.01, energy: 1.33, concerto: 1.11, offtune: 2214 },
    { at: 63, mv: 44.02, energy: 2.66, concerto: 2.22, offtune: 4428, forte1: 180 },
  ]});
const MA = suomingAction("Mid-air - Furled Canopy Plunge", { animFrames: 41, commitFrames: 29, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 84.2, energy: 5.09, concerto: 4.24, offtune: 8470 });
// PLACEHOLDER FRAMES
const DC = suomingAction("Dodge Counter - Furled Canopy", { animFrames: 47, commitFrames: 31, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 31, mv: 27.66, energy: 1.67, concerto: 1.3975, offtune: 2782.75 },
    { at: 31, mv: 27.66, energy: 1.67, concerto: 1.3975, offtune: 2782.75 },
    { at: 31, mv: 55.32, energy: 3.34, concerto: 2.795, offtune: 5565.5, forte1: 160 },
  ], castConcerto: 10});

// --- Unfurled Canopy, the Deep Mind chain, and Whirling Thunder held out of its stage 2
// PLACEHOLDER FRAMES
const UBA1 = suomingAction("Basic - Unfurled Canopy 1", { animFrames: 39, commitFrames: 31, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 31, mv: 65.42, energy: 1.58, concerto: 1.32, offtune: 3949.5 },
    { at: 31, mv: 32.71, energy: 0.79, concerto: 0.66, offtune: 1974.75 },
    { at: 31, mv: 32.71, energy: 0.79, concerto: 0.66, offtune: 1974.75, forte1: 120 },
  ]});
// PLACEHOLDER FRAMES
const UBA2 = suomingAction("Basic - Unfurled Canopy 2", { animFrames: 68, commitFrames: 37, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 37, mv: 114.4, energy: 2.7798, concerto: 2.3098, offtune: 6904.8964 },
    { at: 37, mv: 38.14, energy: 0.9267, concerto: 0.7701, offtune: 2302.0345 },
    { at: 37, mv: 38.14, energy: 0.9267, concerto: 0.7701, offtune: 2302.0345 },
    { at: 37, mv: 38.14, energy: 0.9268, concerto: 0.77, offtune: 2302.0346, forte1: 161 },
  ]});
// PLACEHOLDER FRAMES
const UBA3 = suomingAction("Basic - Unfurled Canopy 3", { animFrames: 70, commitFrames: 50, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 50, mv: 58.64, energy: 1.42, concerto: 1.18, offtune: 3540 },
    { at: 50, mv: 58.64, energy: 1.42, concerto: 1.18, offtune: 3540 },
    { at: 50, mv: 58.64, energy: 1.42, concerto: 1.18, offtune: 3540 },
    { at: 50, mv: 58.64, energy: 1.42, concerto: 1.18, offtune: 3540, forte1: 180 },
  ]});
// PLACEHOLDER FRAMES
const UBA4 = suomingAction("Basic - Unfurled Canopy 4", { animFrames: 115, commitFrames: 109, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 109, mv: 107.25, energy: 2.5979, concerto: 2.1599, offtune: 6474.4189 },
    { at: 109, mv: 107.25, energy: 2.5979, concerto: 2.1599, offtune: 6474.4189 },
    { at: 109, mv: 47.67, energy: 1.1547, concerto: 0.96, offtune: 2877.7207 },
    { at: 109, mv: 47.67, energy: 1.1547, concerto: 0.96, offtune: 2877.7207 },
    { at: 109, mv: 47.67, energy: 1.1548, concerto: 0.9602, offtune: 2877.7208, forte1: 180 },
  ]});
// PLACEHOLDER FRAMES
const UHA1 = suomingAction("Heavy - Unfurled Canopy: Whirling Thunder 1", { animFrames: 88, commitFrames: 63, node: Node.Normal, cast: Cast.Heavy, type: Type.Basic, hits: [
    { at: 63, mv: 73.32, energy: 1.7725, concerto: 1.48, offtune: 4425.25 },
    { at: 63, mv: 36.66, energy: 0.8863, concerto: 0.74, offtune: 2212.625 },
    { at: 63, mv: 36.66, energy: 0.8863, concerto: 0.74, offtune: 2212.625 },
    { at: 63, mv: 73.32, energy: 1.7725, concerto: 1.48, offtune: 4425.25 },
    { at: 63, mv: 73.32, energy: 1.7724, concerto: 1.48, offtune: 4425.25, forte1: 181 },
  ]});
// PLACEHOLDER FRAMES
const UHA2 = suomingAction("Heavy - Unfurled Canopy: Whirling Thunder 2", { animFrames: 85, commitFrames: 33, node: Node.Normal, cast: Cast.Heavy, type: Type.Basic, hits: [
    { at: 33, mv: 56.69, energy: 1.37, concerto: 1.15, offtune: 3422 },
    { at: 33, mv: 56.69, energy: 1.37, concerto: 1.15, offtune: 3422 },
    { at: 33, mv: 56.69, energy: 1.37, concerto: 1.15, offtune: 3422 },
    { at: 33, mv: 56.69, energy: 1.37, concerto: 1.15, offtune: 3422 },
    { at: 33, mv: 56.69, energy: 1.37, concerto: 1.15, offtune: 3422, forte1: 180 },
  ]});
// PLACEHOLDER FRAMES
const UDC = suomingAction("Dodge Counter - Unfurled Canopy", { animFrames: 68, commitFrames: 37, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 37, mv: 174.04, energy: 4.2198, concerto: 3.5098, offtune: 7004.0976 },
    { at: 37, mv: 58.02, energy: 1.4067, concerto: 1.1701, offtune: 2334.9675 },
    { at: 37, mv: 58.02, energy: 1.4067, concerto: 1.1701, offtune: 2334.9675 },
    { at: 37, mv: 58.02, energy: 1.4068, concerto: 1.17, offtune: 2334.9674, forte1: 161 },
  ], castConcerto: 10});

// --- Rift Cleaver, the plain Resonance Skill in either state. Holding Unison additionally spends
//     it, her Unison Boon stack, 20 Concerto, and every point of Delusion, for Seal Master (see SUNKEN_SEAL below).
//     Crimson Gleam is the follow-up a counter-cast Rift Cleaver triggers, which needs the target
//     to attack into it — left for a rotation to name.
const RiftCleaver = suomingAction("Skill - Furled Canopy: Rift Cleaver", { animFrames: 42, commitFrames: 0, cooldown: 60 * 8,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, mv: 106.61, energy: 3.68, concerto: 3.07, offtune: 6128,
  updateBuffs: () => {
    if (!isHeld(UNISON)) return;
    addStat(Stat.AddCastConcerto, -20);
    setForte1(0);
    revokeCurrent(UNISON);
    // 3.7.4: the one Boon stack she granted goes too, so her next Unison Response grants afresh
    if (isHeld(BOON_RESPONSE)) removeStackTeam(UNISON_BOON, 1);
    revokeCurrent(BOON_RESPONSE);
    if (!isHeld(ALIGNED_SEALS)) applyCurrent(SEAL_MASTER, 1);
  },
});
// PLACEHOLDER FRAMES
const CrimsonGleamParry = suomingAction("Skill - Unfurled Canopy: Crimson Gleam", { animFrames: 67, commitFrames: 31, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 31, mv: 47.25, energy: 1.6349, concerto: 1.3619, offtune: 2716.9275 },
    { at: 31, mv: 23.63, energy: 0.8176, concerto: 0.6811, offtune: 1358.7513 },
    { at: 31, mv: 23.63, energy: 0.8176, concerto: 0.6811, offtune: 1358.7513 },
    { at: 31, mv: 63, energy: 2.1799, concerto: 1.8159, offtune: 3622.5699 },
  ]});

// --- Umbral Canopy: Miasma Lock, Deep Mind only; grants Unison and 200 Delusion
// PLACEHOLDER FRAMES
const Liberation = suomingAction("Liberation - Umbral Canopy: Miasma Lock", {
  animFrames: 335, commitFrames: 254, timestop: 332, motionStop: 332,
  cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, hits: [
    { at: 254, mv: 60.89, offtune: 7350.0604 },
    { at: 254, mv: 60.89, offtune: 7350.0604 },
    { at: 254, mv: 60.89, offtune: 7350.0604 },
    { at: 254, mv: 60.89, offtune: 7350.0604 },
    { at: 254, mv: 60.89, offtune: 7350.0604 },
    { at: 254, mv: 60.89, offtune: 7350.0604 },
    { at: 254, mv: 60.89, offtune: 7350.0604 },
    { at: 254, mv: 60.89, offtune: 7350.0604 },
    { at: 254, mv: 208.76, offtune: 25199.5168, forte1: 200 },
  ], castConcerto: 20, resetEnergy: true,
  updateBuffs: () => { applyCurrent(UNISON, 1); },
});
/** Blight Rain, Miasmic Thunder: the Thunder Crest, one a second off the active resonator's own
 *  damage during the Unison outro's window, on her own slot. */
const BLIGHT_RAIN_FIELD = new ActionField("Suoming: Blight Rain, Miasmic Thunder");
const ThunderCrest = suomingAction("Liberation - Blight Rain, Miasmic Thunder", {
  tag: ActionTag.Field, type: Type.Liberation, subtype: Subtype.Coordinated, mv: 59.65, field: BLIGHT_RAIN_FIELD,
});

// --- the four Intros, all Basic Attack DMG: Furled forms from Awakened Mind (into Deep Mind,
//     Delusion cleared), Unfurled forms from Deep Mind (+200 Delusion); the (Unison) pair answer a
//     Unison outro and are what triggers Unison Response
const INTRO_FURLED = { node: Node.Intro, cast: Cast.Intro, resetForte1: true, type: Type.Basic, mv: 110.89 * 2 + 36.97 * 4, energy: 3 * 2 + 1 * 4, concerto: 10, offtune: 5578 * 2 + 1860 * 4 };
const IntroFlashRift = suomingAction("Intro - Furled Canopy: Flash Rift", {
  animFrames: 103, commitFrames: 88, motionStop: 90,
  ...INTRO_FURLED,
  // entering Deep Mind resets Rift Cleaver's cooldown
  updateBuffs: () => {
    applyCurrent(DEEP_MIND, 1);
    resetCooldown(RiftCleaver);
  },
});
const IntroSealedDelusion = suomingAction("Intro - Furled Canopy: Sealed Delusion (Unison)", {
  animFrames: 103, commitFrames: 88, motionStop: 90,
  ...INTRO_FURLED,
  // entering Deep Mind resets Rift Cleaver's cooldown
  updateBuffs: () => {
    respondToUnison();
    applyCurrent(DEEP_MIND, 1);
    resetCooldown(RiftCleaver);
  },
});

const INTRO_UNFURLED = { animFrames: 83, commitFrames: 66, motionStop: 68, node: Node.Intro, cast: Cast.Intro, type: Type.Basic, mv: 131.43 * 3 + 65.72 * 2, energy: 2.5 * 3 + 1.25 * 2, concerto: 10, offtune: 4407 * 3 + 2204 * 2, forte1: 200 };
const IntroThunderRending = suomingAction("Intro - Unfurled Canopy: Thunder Rending", INTRO_UNFURLED);
const IntroWhirlingThunder = suomingAction("Intro - Unfurled Canopy: Whirling Thunder (Unison)", { ...INTRO_UNFURLED, updateBuffs: respondToUnison });


const INTROS = new Set<Action>([IntroFlashRift, IntroThunderRending, IntroSealedDelusion, IntroWhirlingThunder]);

// --- Forte Circuit: the two full-bar skills and Engraved Heart behind them, all Basic Attack DMG
// PLACEHOLDER FRAMES
const SealedDelusion = suomingAction("Forte Skill - Furled Canopy: Sealed Delusion", {
  animFrames: 107, commitFrames: 107,
  node: Node.Forte, cast: Cast.Skill, type: Type.Basic, hits: [
    { at: 107, mv: 62.78, energy: 2.175, concerto: 1.815, offtune: 3609.5 },
    { at: 107, mv: 62.78, energy: 2.175, concerto: 1.815, offtune: 3609.5 },
    { at: 107, mv: 31.39, energy: 1.0875, concerto: 0.9075, offtune: 1804.75 },
    { at: 107, mv: 31.39, energy: 1.0875, concerto: 0.9075, offtune: 1804.75 },
    { at: 107, mv: 31.39, energy: 1.0875, concerto: 0.9075, offtune: 1804.75 },
    { at: 107, mv: 31.39, energy: 1.0875, concerto: 0.9075, offtune: 1804.75 },
  ],
  // only fires at a full 800 Delusion — maxForte1 (800) clamps an overrun back to the cap before
  // this lands exactly on 0, same as Engraved Heart's own -800
  castForte1: -800,
  // entering Deep Mind resets Rift Cleaver's cooldown
  updateBuffs: () => {
    applyCurrent(DEEP_MIND, 1);
    resetCooldown(RiftCleaver);
  },
});
const UnforsakenMind = suomingAction("Skill - Unfurled Canopy: Unforsaken Mind", { animFrames: 68, commitFrames: 59, node: Node.Forte, cast: Cast.Skill, type: Type.Basic, mv: 152.67, offtune: 8776, castForte1: -800,
});
/** Calamity Mind for its own duration, Awakened Mind once it ends: Deep Mind is simply over. */
// PLACEHOLDER FRAMES
const EngravedHeart = suomingAction("Forte Basic - Umbral Canopy: Engraved Heart", {
  // 263 frames the prio drops to 2; the last hit is in at 250
  animFrames: 308, commitFrames: 263, timestop: 134, motionStop: 134,
  node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 250, mv: 155.14, energy: 1.6423, concerto: 3.1999, offtune: 2081.4341 },
    { at: 250, mv: 77.57, energy: 0.8212, concerto: 1.5999, offtune: 1040.7171 },
    { at: 250, mv: 77.57, energy: 0.8212, concerto: 1.5999, offtune: 1040.7171 },
    { at: 250, mv: 155.14, energy: 1.6423, concerto: 3.1999, offtune: 2081.4341 },
    { at: 250, mv: 155.14, energy: 1.6423, concerto: 3.1999, offtune: 2081.4341 },
    { at: 250, mv: 77.57, energy: 0.8212, concerto: 1.5999, offtune: 1040.7171 },
    { at: 250, mv: 77.57, energy: 0.8212, concerto: 1.5999, offtune: 1040.7171 },
    { at: 250, mv: 38.79, energy: 0.4106, concerto: 0.8001, offtune: 520.4256 },
    { at: 250, mv: 38.79, energy: 0.4106, concerto: 0.8001, offtune: 520.4256 },
    { at: 250, mv: 38.79, energy: 0.4106, concerto: 0.8001, offtune: 520.4256 },
    { at: 250, mv: 38.79, energy: 0.4106, concerto: 0.8001, offtune: 520.4256 },
    { at: 250, mv: 620.55, energy: 6.5692, concerto: 12.7993, offtune: 8325.6024 },
    { at: 250, mv: 19.4, energy: 0.2054, concerto: 0.4001, offtune: 260.2799 },
    { at: 250, mv: 19.4, energy: 0.2054, concerto: 0.4001, offtune: 260.2799 },
    { at: 250, mv: 19.4, energy: 0.2054, concerto: 0.4001, offtune: 260.2799 },
    { at: 250, mv: 19.4, energy: 0.2054, concerto: 0.4001, offtune: 260.2799 },
    { at: 250, mv: 19.4, energy: 0.2054, concerto: 0.4001, offtune: 260.2799 },
    { at: 250, mv: 19.4, energy: 0.2054, concerto: 0.4001, offtune: 260.2799 },
    { at: 250, mv: 19.4, energy: 0.2054, concerto: 0.4001, offtune: 260.2799 },
    { at: 250, mv: 19.4, energy: 0.2054, concerto: 0.4001, offtune: 260.2799 },
    { at: 250, mv: 19.4, energy: 0.2054, concerto: 0.4001, offtune: 260.2799 },
    { at: 250, mv: 19.4, energy: 0.2054, concerto: 0.4001, offtune: 260.2799 },
    { at: 250, mv: 24.24, energy: 0.2566, concerto: 0.5, offtune: 325.2157 },
    { at: 250, mv: 24.24, energy: 0.2566, concerto: 0.5, offtune: 325.2157 },
    { at: 250, mv: 24.24, energy: 0.2566, concerto: 0.5, offtune: 325.2157 },
    { at: 250, mv: 24.24, energy: 0.2566, concerto: 0.5, offtune: 325.2157 },
    { at: 250, mv: 24.24, energy: 0.2566, concerto: 0.5, offtune: 325.2157 },
    { at: 250, mv: 24.24, energy: 0.2566, concerto: 0.5, offtune: 325.2157 },
    { at: 250, mv: 24.24, energy: 0.2566, concerto: 0.5, offtune: 325.2157 },
    { at: 250, mv: 24.24, energy: 0.2565, concerto: 0.5, offtune: 325.2156 },
  ],
  updateBuffs: () => revokeCurrent(DEEP_MIND),
});

/** Canopy Rumble. With Unison still held this is the Unison outro: Aligned Seals, the Crest
 *  window, and the Aligned handoff on top of the ordinary one. Unison itself is spent by its own
 *  updateBuffs, after these hooks. */
const Outro = suomingAction("Outro - Canopy Rumble", {
  animFrames: 0, commitFrames: 0,
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => {
    queueOutro(CANOPY_RUMBLE);
    queueOutro(CANOPY_RUMBLE_SKILL);
    if (isHeld(UNISON)) {
      applyCurrent(ALIGNED_SEALS, 1); revokeCurrent(SEAL_MASTER);
      applyTeam(BLIGHT_RAIN, BLIGHT_RAIN.maxStacks);
    }
    if (isHeld(ALIGNED_SEALS)) queueOutro(ALIGNED_SEALS_HANDOFF);
  },
});
const OutroUnison = unisonOutro(Outro);

/* ------------------------------------------------------------------------------------- buffs */

/** The Deep Mind marker, no stat of its own — Awakened Mind is its absence. */
const DEEP_MIND = new Buff({ name: "Suoming: Deep Mind" });

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
  applyStats: () => { if (runningAction(IntroSealedDelusion) || runningAction(IntroWhirlingThunder)) addStat(Stat.AddConcerto, 10); },
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
  updateBuffs: () => { if (isHeld(UNISON) && casting(Cast.Liberation)) revokeCurrent(SEAL_MASTER); },
  applyStats: () => {
    addStat(Stat.CritDmg, 100);
    if (!runningAnyOf(SEAL_MASTER_STAGES)) return;
    addStat(Stat.MulMv, 100);
    addStat(Stat.AddConcerto, 5);
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
  stats: [[Stat.Amp, 25, Type.Skill]], when: () => stacksOfTeam(UNISON_BOON) > 0,
});

/** The Aligned Seals half of her Outro: +30% Electro DMG Bonus, +20% a Unison Boon stack the
 *  holder has, up to +40% — 8s or until switched out. The kit only hands it over when the Outro
 *  lands within 8s of her Liberation or Engraved Heart; both rotations leave straight off one of
 *  those, so the window is always open and nothing here has to time it. */
const ALIGNED_SEALS_HANDOFF = new Buff({
  name: "Suoming: Outro (aligned)",
  duration: 60 * 8,
  lostOnSwap: true,
  applyStats: () => addStat(Stat.DmgBonus, 30 + Math.min(40, 20 * stacksOfTeam(UNISON_BOON)), Attribute.Electro),
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
  applyStats: () => addStat(Stat.CritDmg, 10 + Math.min(24, 6 * stacksOfTeam(UNISON_BOON))),
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

/** This kit's own carrier for the Unison Boon payout (shared/unison.ts's `boonPayout`). */
const SM_BOON_PAYOUT = boonPayout();

const SUOMING_RESONATOR = new Resonator({
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
  intro: new Action("Intro Resolver", { cast: Cast.Intro, resolve: () => (isHeld(DEEP_MIND)
      ? (unisonIntro() ? IntroWhirlingThunder : IntroThunderRending)
      : (unisonIntro() ? IntroSealedDelusion : IntroFlashRift)) }),
  // 91 frames of time stop on a 90-frame break: the one over banks into the next press
  tuneBreak: tuneBreak(90, 91, 70, SWORD_BREAK),
  maxEnergy: 125,
  maxForte1: 800,
  // Unison Response: the team's Unison Boon, one stack from her, refreshed after the first
  updateBuffs: () => {
    if (unisonResponse()) grantBoon(BOON_RESPONSE);
  },
  // she can trigger Unison Response, so Unison Boon pays her (shared/unison.ts) — the carrier her
  // kit grants reads the count and takes the payout, the way Hsin's Unison mode does
  combatStart: () => { applyCurrent(SM_BOON_PAYOUT, 1); },
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
const OutroResolver = new Action("Outro Resolver", { cast: Cast.Outro, resolve: () => (isHeld(UNISON) ? OutroUnison : Outro) });

const SM_ROTATION = new Rotation([
  NOINTRO, BA123, BA123, SealedDelusion,
  DOUBLE_INTRO, Liberation, OutroResolver,

  INTRO, UHA2.dodgeCancel(), UBA12.cancel(),
  UnforsakenMind, EngravedHeart.easyCancel(), ECHO.instaSwap(), OutroResolver,
]);

/** The Seal Master main-DPS loop, the kit's other way to spend a Unison. Her Intro drops her into
 *  Deep Mind on an empty bar, the Liberation is the Unison she is here for, and the Rift Cleaver
 *  behind it spends it — 20 Concerto and every point of Delusion the Liberation just paid — for
 *  the 12s Seal Master window. The whole Unfurled chain runs inside that window, its own
 *  multipliers +40% and hers +80% Crit. DMG, rebuilding the 800 Delusion for Unforsaken Mind;
 *  Engraved Heart spends the bar and leaves her in Awakened Mind, which is the state the next
 *  loop's Flash Rift is written for. */
const SM_ROTATION_MDPS = new Rotation([

  INTRO.cancel(), Liberation, ECHO,
  RiftCleaver.instaDodge(),
  UBA12UHA12.dodgeCancel(),
  UBA12UHA12.easyCancel(),
  UnforsakenMind, EngravedHeart.swapCancel(),
  OutroResolver,
]);
const SM_ROTATION_MDPS_DOUBLE = new Rotation([
  DOUBLE_INTRO, UBA1.instaSwap(),

  INTRO, UHA2.cancel(),
  Liberation, ECHO,
  RiftCleaver.instaDodge(),
  UBA12UHA12.dodgeCancel(),
  UBA12UHA12.easyCancel(),
  UnforsakenMind, EngravedHeart.swapCancel(),
  OutroResolver,
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
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  sequences: SM_SEQUENCES,
  rotation: SM_ROTATION,
});

export const SUOMING_MDPS = new Loadout({
  resonator: SUOMING_RESONATOR,
  weapons: [UNSPOKEN_RUE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  sequences: SM_SEQUENCES,
  rotation: SM_ROTATION_MDPS,
});

export const SUOMING_MDPS_DOUBLE = new Loadout({
  resonator: SUOMING_RESONATOR,
  weapons: [UNSPOKEN_RUE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  sequences: SM_SEQUENCES,
  rotation: SM_ROTATION_MDPS_DOUBLE,
});