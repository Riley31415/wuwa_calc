/**
 * Lynae, ported to the new engine — a Spectro Pistols main DPS built around the Tune Break
 * variants, and the first kit to use them (see tunebreak.ts).
 *
 * She is a two-mode resonator, the same shape as Lucilla: `MODE_RUPTURE` and `MODE_STRAIN` are
 * `ResonanceMode` gear, one per loadout, and which one she holds changes nothing about her own
 * damage — only which Shifting her Photochromic Flux leaves on the target, and so which variant
 * the team's next Tune Break resolves as. Her two halves pay out off that:
 *
 * - **Rupture**: a break under Rupture-Shifting leaves Tune Rupture - Interfered, and she answers
 *   it with Spectral Analysis (1880.75%), queued by the engine's own break.
 * - **Strain**: each stack of Tune Strain - Interfered on the target turns every point of her own
 *   Tune Break Boost into +0.12% of her total damage.
 *
 * Tune Break Boost is a real stat for this generation: her resonator carries the flat 10 every
 * tune-break-era character has (nanoka's own `stats_weakness.weakness_mastery`, non-zero on
 * exactly those eight), and her kit adds 40 on top.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1509,
 * https://ww.nanoka.cc/character/1509), read the way CLAUDE.md describes. Overflow/Lumiflow/True
 * Color decide which basic chain is live rather than scaling anything, so the rotation below just
 * runs the Kaleidoscopic Parade line she actually plays instead of modelling three gauges.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, ResonanceMode, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  addStat,
  applyCurrent,
  applyEnemy,
  applyTeam,
  onAction,
  runningAction,
  maxStackIncrease,
  queueQTE,
  revokeCurrent,
  asSource,
  currentTeam,
  frozenStacks,
  isHeld,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, ECHO, INTRO, OUTRO } from "../../engine/rotation.js";
import { applyRupture, applyStrain, TUNE_STRAIN_INTERFERED, TUNE_SHIFTABLE, strainPayout, tuneRuptureResponse } from "../../shared/tunebreak.js";
import { SPECTRUM_BLASTER } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { HYVATIA, NEONLIGHT_LEAP_5PC, REEL_5PC, VOIDWING_MOTH } from "../../echoes/lahairoi.js";
import { AEMEATH_RESONATOR } from "../fusion/aemeath.js";
import { LUUK_RESONATOR } from "./luuk.js";
import { QINGXIAO_RESONATOR } from "../aero/qingxiao.js";
import { HERON, STONEWALL_BRACER, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { JINGRAN_RESONATOR } from "../fusion/jingran.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

/** Kaleidoscopic Parade: entered by Spark Collision, left on her Outro (kept through it at S6). Every
 *  Parade press and the Forte Circuit's Basics need it. */
const KALEIDOSCOPIC_PARADE = new Buff({ name: "Lynae: Kaleidoscopic Parade" });
/** "Press Normal Attack within a certain time after casting Prismatic Overblast to cast To a Vivid
 *  Tomorrow!": armed by the Liberation, spent by that press. */
const VIVID_TOMORROW_READY = new Buff({ name: "Lynae: To a Vivid Tomorrow! Ready" });

function lynaeAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Chroma Drift, the out-of-Parade chain. Spark Collision Lv.3 is what sends her into
//     Kaleidoscopic Parade, so it opens the rotation and the rest of this chain never gets played.
const BA1 = lynaeAction("Basic - Chroma Drift 1", { animFrames: 31, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 8619, energy: 128, concerto: 459, offtune: 4080 },
    { hitFrame: 19, element: null, type: null, subtype: null, forte1: 12 },
  ]});
const BA2 = lynaeAction("Basic - Chroma Drift 2", { animFrames: 66, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 15, mv: 5239, energy: 78, concerto: 279, offtune: 2480, forte1: 21 },
    { hitFrame: 29, mv: 5239, energy: 78, concerto: 279, offtune: 2480 },
    { hitFrame: 39, mv: 5239, energy: 78, concerto: 279, offtune: 2480 },
  ]});
const BA3 = lynaeAction("Basic - Chroma Drift 3", { animFrames: 44, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 28, mv: 12337, energy: 183, concerto: 657, offtune: 5840 },
    { hitFrame: 33, element: null, type: null, subtype: null, forte1: 17 },
  ]});
const DC = lynaeAction("Dodge Counter - Chroma Drift", { animFrames: 49, animPriority: { 0: 2 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 30, element: null, type: null, subtype: null, forte1: 19 },
    { hitFrame: 31, mv: 23997, energy: 205, concerto: 738, offtune: 6560 },
  ], castConcerto: 1000});
const MA = lynaeAction("Mid-air - Chroma Drift Plunge", { animFrames: 54, animPriority: { 48: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 26, mv: 1437, energy: 22, concerto: 77, offtune: 680 },
    { hitFrame: 41, mv: 12928, energy: 192, concerto: 689, offtune: 6120 },
    { hitFrame: 45, element: null, type: null, subtype: null, forte1: 20 },
  ]});
const SparkCollision = lynaeAction("Basic - Spark Collision Lv. 3", { minForte1: 120, animFrames: 157, animPriority: { 154: 1 }, castPriority: 4, noSwapFrames: 84, node: Node.Normal, cast: Cast.Heavy, type: Type.Basic, bullets: [
    { hitFrame: 100, mv: 27778, energy: 411, concerto: 1480, offtune: 13150 },
    { hitFrame: 111, mv: 27778, energy: 411, concerto: 1480, offtune: 13150 },
  ], castForte1: -120, castForte2: 12000,
  updateBuffs: () => applyCurrent(KALEIDOSCOPIC_PARADE, 1),
});

// --- Kaleidoscopic Parade, the combo she actually plays
const KBA1 = lynaeAction("Basic - Kaleidoscopic Parade 1", { requireBuff: KALEIDOSCOPIC_PARADE, animFrames: 35, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 13, mv: 8281, energy: 123, concerto: 441, offtune: 3920 }]});
const KBA2 = lynaeAction("Basic - Kaleidoscopic Parade 2", { requireBuff: KALEIDOSCOPIC_PARADE, animFrames: 28, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 3887, energy: 58, concerto: 207, offtune: 1840 },
    { hitFrame: 21, mv: 3887, energy: 58, concerto: 207, offtune: 1840 },
  ]});
const KBA3 = lynaeAction("Basic - Kaleidoscopic Parade 3", { requireBuff: KALEIDOSCOPIC_PARADE, animFrames: 40, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 3775, energy: 56, concerto: 201, offtune: 1787 },
    { hitFrame: 16, mv: 3775, energy: 56, concerto: 201, offtune: 1787 },
    { hitFrame: 24, mv: 3775, energy: 56, concerto: 201, offtune: 1787 },
  ]});
const KBA4 = lynaeAction("Basic - Kaleidoscopic Parade 4", { requireBuff: KALEIDOSCOPIC_PARADE, animFrames: 70, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 2975, energy: 44, concerto: 159, offtune: 1408 },
    { hitFrame: 25, mv: 2975, energy: 44, concerto: 159, offtune: 1408 },
    { hitFrame: 38, mv: 4462, energy: 66, concerto: 238, offtune: 2112 },
    { hitFrame: 50, mv: 4462, energy: 66, concerto: 238, offtune: 2112 },
  ]});
const KBA5 = lynaeAction("Basic - Kaleidoscopic Parade 5", { requireBuff: KALEIDOSCOPIC_PARADE, animFrames: 99, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 7554, energy: 112, concerto: 403, offtune: 3576 },
    { hitFrame: 29, mv: 1511, energy: 23, concerto: 81, offtune: 716 },
    { hitFrame: 35, commitFrame: 29, mv: 1511, energy: 23, concerto: 81, offtune: 716 },
    { hitFrame: 41, commitFrame: 29, mv: 1511, energy: 23, concerto: 81, offtune: 716 },
    { hitFrame: 47, commitFrame: 29, mv: 1511, energy: 23, concerto: 81, offtune: 716 },
    { hitFrame: 53, commitFrame: 29, mv: 1511, energy: 23, concerto: 81, offtune: 716 },
    { hitFrame: 59, commitFrame: 29, mv: 10072, energy: 149, concerto: 537, offtune: 4768 },
  ]});
const KHeavy = lynaeAction("Heavy - Kaleidoscopic Parade (Ground)", { requireBuff: KALEIDOSCOPIC_PARADE, animFrames: 82, animPriority: { 42: 2, 50: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 1763, energy: 42, concerto: 94, offtune: 835 },
    { hitFrame: 14, mv: 1763, energy: 42, concerto: 94, offtune: 835 },
    { hitFrame: 18, mv: 1763, energy: 42, concerto: 94, offtune: 835 },
    { hitFrame: 22, mv: 1763, energy: 42, concerto: 94, offtune: 835 },
    { hitFrame: 26, mv: 1763, energy: 42, concerto: 94, offtune: 835 },
    { hitFrame: 30, mv: 1763, energy: 42, concerto: 94, offtune: 835 },
    { hitFrame: 34, mv: 1763, energy: 42, concerto: 94, offtune: 835 },
    // released: Graffiti Blast
    { hitFrame: 56, mv: 10478, energy: 155, concerto: 558, offtune: 4960 },
  ]});

// --- Forte Circuit. These carry Photochromic Flux, which is what shifts the target (see the two
//     Resonance Modes below). Visual Impact is the big one, on a 25s cooldown.
const PolychromeLeap1 = lynaeAction("Forte Basic - Polychrome Leap 1", { requireBuff: KALEIDOSCOPIC_PARADE, minForte2: 4000, animFrames: 46, animPriority: { 45: 2 }, castPriority: 6, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 3380, energy: 75, concerto: 180, offtune: 1600 },
    { hitFrame: 21, mv: 3380, energy: 75, concerto: 180, offtune: 1600 },
    { hitFrame: 25, mv: 3380, energy: 75, concerto: 180, offtune: 1600 },
  ], castForte2: -4000,  });
const PolychromeLeap2 = lynaeAction("Forte Basic - Polychrome Leap 2", { requireBuff: KALEIDOSCOPIC_PARADE, minForte2: 4000, animFrames: 42, animPriority: { 35: 2 }, castPriority: 6, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 1690, energy: 38, concerto: 90, offtune: 800 },
    { hitFrame: 18, mv: 1690, energy: 38, concerto: 90, offtune: 800 },
    { hitFrame: 24, mv: 1690, energy: 38, concerto: 90, offtune: 800 },
    { hitFrame: 30, mv: 1690, energy: 38, concerto: 90, offtune: 800 },
    { hitFrame: 36, mv: 1690, energy: 38, concerto: 90, offtune: 800 },
    { hitFrame: 42, mv: 1690, energy: 38, concerto: 90, offtune: 800 },
  ], castForte2: -4000,  });
const PolychromeLeap3 = lynaeAction("Forte Basic - Polychrome Leap 3", { requireBuff: KALEIDOSCOPIC_PARADE, minForte2: 4000, animFrames: 37, animPriority: { 36: 2 }, castPriority: 6, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 1310, energy: 30, concerto: 70, offtune: 620 },
    { hitFrame: 17, commitFrame: 14, mv: 1310, energy: 30, concerto: 70, offtune: 620 },
    { hitFrame: 20, commitFrame: 14, mv: 1310, energy: 30, concerto: 70, offtune: 620 },
    { hitFrame: 23, commitFrame: 14, mv: 1310, energy: 30, concerto: 70, offtune: 620 },
    { hitFrame: 50, commitFrame: 14, mv: 1310, energy: 30, concerto: 70, offtune: 620 },
    { hitFrame: 53, commitFrame: 14, mv: 1310, energy: 30, concerto: 70, offtune: 620 },
    { hitFrame: 56, commitFrame: 14, mv: 1310, energy: 30, concerto: 70, offtune: 620 },
    { hitFrame: 59, commitFrame: 14, mv: 1310, energy: 30, concerto: 70, offtune: 620 },
  ], castForte2: -4000,  });
const IridescentSplash = lynaeAction("Forte Basic - Iridescent Splash", { requireBuff: KALEIDOSCOPIC_PARADE, animFrames: 64, animPriority: { 55: 2 }, castPriority: 6, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 38, mv: 30418, energy: 813, concerto: 765, offtune: 6800 }],  });
const VisualImpact = lynaeAction("Forte Basic - Visual Impact", {
  requireBuff: KALEIDOSCOPIC_PARADE,
  animFrames: 105, animPriority: { 75: 2 }, castPriority: 6, cooldown: 60 * 25,
  node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 42, mv: 121672, energy: 1405, concerto: 1458, offtune: 60960 }],
  updateBuffs: () => applyTeam(SPECTRAL_ANALYSIS_TBB, 1),
});

// Lynae-Style Palettes and Additive Color share one 6s cooldown
const SKILL_CD = new Cooldown({ frames: 60 * 6 });
const Skill = lynaeAction("Skill - Lynae-Style Palettes", { animFrames: 76, animPriority: { 65: 2 }, castPriority: 4, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 30, mv: 13931, energy: 437, concerto: 491, offtune: 4360 },
    { hitFrame: 44, element: null, type: null, subtype: null, forte1: 25 },
    { hitFrame: 51, commitFrame: 30, mv: 4644, energy: 146, concerto: 164, offtune: 1454 },
    { hitFrame: 58, commitFrame: 30, mv: 4644, energy: 146, concerto: 164, offtune: 1454 },
    { hitFrame: 62, commitFrame: 30, mv: 4644, energy: 146, concerto: 164, offtune: 1454 },
  ]});
const AdditiveColor = lynaeAction("Skill - Additive Color", { requireBuff: KALEIDOSCOPIC_PARADE, animFrames: 75, animPriority: { 72: 2 }, castPriority: 4, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 16, mv: 11631, energy: 346, concerto: 410, offtune: 3640 },
    { hitFrame: 30, mv: 11631, energy: 346, concerto: 410, offtune: 3640 },
  ]});

const Liberation = lynaeAction("Liberation - Prismatic Overblast", {
  animFrames: 240, animPriority: { 238: 2 }, castPriority: 10, timestop: [0, 240], motionStop: [0, 223], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    { hitFrame: 189, mv: 8748, offtune: 4800 },
    { hitFrame: 195, commitFrame: 189, mv: 8748, offtune: 4800 },
    { hitFrame: 201, commitFrame: 189, mv: 8748, offtune: 4800 },
    { hitFrame: 207, commitFrame: 189, mv: 8748, offtune: 4800 },
    { hitFrame: 213, commitFrame: 189, mv: 8748, offtune: 4800 },
    { hitFrame: 219, commitFrame: 189, mv: 8748, offtune: 4800 },
    { hitFrame: 225, commitFrame: 189, mv: 8748, offtune: 4800 },
    { hitFrame: 231, commitFrame: 189, mv: 8748, offtune: 4800 },
    { hitFrame: 237, commitFrame: 189, mv: 8748, offtune: 4800 },
    { hitFrame: 243, commitFrame: 189, mv: 8748, offtune: 4800 },
  ],
  castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => {
    applyTeam(PRISMATIC_OVERBLAST, 1);
    applyCurrent(VIVID_TOMORROW_READY, 1);
  },
});
const VividTomorrow = lynaeAction("Basic - To a Vivid Tomorrow!", { requireBuff: VIVID_TOMORROW_READY, updateBuffs: () => revokeCurrent(VIVID_TOMORROW_READY), animFrames: 159, animPriority: { 157: 2 }, castPriority: 9, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 52, mv: 838, energy: 23, concerto: 81, offtune: 714 },
    { hitFrame: 56, mv: 838, energy: 23, concerto: 81, offtune: 714 },
    { hitFrame: 60, mv: 838, energy: 23, concerto: 81, offtune: 714 },
    { hitFrame: 65, mv: 838, energy: 23, concerto: 81, offtune: 714 },
    { hitFrame: 69, mv: 838, energy: 23, concerto: 81, offtune: 714 },
    { hitFrame: 73, mv: 838, energy: 23, concerto: 81, offtune: 714 },
    { hitFrame: 77, mv: 838, energy: 23, concerto: 81, offtune: 714 },
    { hitFrame: 81, mv: 838, energy: 23, concerto: 81, offtune: 714 },
    { hitFrame: 86, mv: 838, energy: 23, concerto: 81, offtune: 714 },
    { hitFrame: 90, mv: 838, energy: 23, concerto: 81, offtune: 714 },
    { hitFrame: 94, mv: 838, energy: 23, concerto: 81, offtune: 714 },
    { hitFrame: 98, mv: 838, energy: 23, concerto: 81, offtune: 714 },
    { hitFrame: 118, mv: 1005, energy: 27, concerto: 97, offtune: 856 },
    { hitFrame: 124, commitFrame: 118, mv: 1005, energy: 27, concerto: 97, offtune: 856 },
    { hitFrame: 130, commitFrame: 118, mv: 1005, energy: 27, concerto: 97, offtune: 856 },
    { hitFrame: 136, commitFrame: 118, mv: 1005, energy: 27, concerto: 97, offtune: 856 },
    { hitFrame: 142, commitFrame: 118, mv: 1005, energy: 27, concerto: 97, offtune: 856 },
    { hitFrame: 148, commitFrame: 118, mv: 1005, energy: 27, concerto: 97, offtune: 856 },
    { hitFrame: 154, commitFrame: 118, mv: 1005, energy: 27, concerto: 97, offtune: 856 },
    { hitFrame: 160, commitFrame: 118, mv: 1005, energy: 27, concerto: 97, offtune: 856 },
    { hitFrame: 166, commitFrame: 118, mv: 1005, energy: 27, concerto: 97, offtune: 856 },
    { hitFrame: 172, commitFrame: 118, mv: 1005, energy: 27, concerto: 97, offtune: 856 },
  ]});

const Intro = lynaeAction("Intro - Time to Show Some Colors!", { animFrames: 76, noSwapFrames: 62, animPriority: { 44: 3 }, castPriority: 11, motionStop: [4, 66], node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 44, mv: 2248, energy: 134, concerto: 120, offtune: 1064 },
    { hitFrame: 50, commitFrame: 44, mv: 2248, energy: 134, concerto: 120, offtune: 1064 },
    { hitFrame: 56, commitFrame: 44, mv: 2248, energy: 134, concerto: 120, offtune: 1064 },
    { hitFrame: 62, commitFrame: 44, mv: 2248, energy: 134, concerto: 120, offtune: 1064 },
    { hitFrame: 68, commitFrame: 44, mv: 2248, energy: 134, concerto: 120, offtune: 1064 },
    { hitFrame: 74, commitFrame: 44, mv: 2248, energy: 134, concerto: 120, offtune: 1064 },
    { hitFrame: 80, commitFrame: 44, mv: 2248, energy: 134, concerto: 120, offtune: 1064 },
    { hitFrame: 86, commitFrame: 44, mv: 2248, energy: 134, concerto: 120, offtune: 1064 },
    { hitFrame: 92, commitFrame: 44, mv: 2248, energy: 134, concerto: 120, offtune: 1064 },
    { hitFrame: 98, commitFrame: 44, mv: 2248, energy: 134, concerto: 120, offtune: 1064 },
  ], castConcerto: 1000, castForte1: 100});
const Outro = lynaeAction("Outro - Let's Hit the Road!", {
  animFrames: 159, animPriority: { 0: 9, 157: 2 }, castPriority: 9,
  cast: Cast.Outro, type: Type.Outro, bullets: [
    { hitFrame: 52, mv: 455 },
    { hitFrame: 58, mv: 455 },
    { hitFrame: 64, mv: 455 },
    { hitFrame: 70, mv: 455 },
    { hitFrame: 76, mv: 455 },
    { hitFrame: 82, mv: 455 },
    { hitFrame: 88, mv: 455 },
    { hitFrame: 94, mv: 455 },
    { hitFrame: 100, mv: 455 },
    { hitFrame: 106, mv: 455 },
    { hitFrame: 110, mv: 455 },
    { hitFrame: 112, mv: 455 },
    { hitFrame: 116, commitFrame: 110, mv: 455 },
    { hitFrame: 118, mv: 455 },
    { hitFrame: 122, commitFrame: 110, mv: 455 },
    { hitFrame: 128, commitFrame: 110, mv: 455 },
    { hitFrame: 134, commitFrame: 110, mv: 455 },
    { hitFrame: 140, commitFrame: 110, mv: 455 },
    { hitFrame: 146, commitFrame: 110, mv: 455 },
    { hitFrame: 152, commitFrame: 110, mv: 455 },
    { hitFrame: 158, commitFrame: 110, mv: 455 },
    { hitFrame: 164, commitFrame: 110, mv: 445 },
  ], minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => {
    queueQTE(LYNAE_OUTRO);
    if (!isHeld(LY_S6)) revokeCurrent(KALEIDOSCOPIC_PARADE);
  },
});

const SpectralAnalysis = lynaeAction("Tune Rupture Response - Spectral Analysis", {
  animFrames: 0,
  node: Node.Forte, cast: Cast.TuneBreak, type: Type.Rupture, bullets: [{ hitFrame: 0, mv: 188075 }], scaling: Scaling.Tune
});

/* ------------------------------------------------------------------------------------- modes */

/** Photochromic Flux rides Polychrome Leap, Iridescent Splash, Visual Impact and her Intro
 *  (Chromaticity Modeling's own list), so those are the casts that shift the target. */
const inflictsFlux = (): boolean =>
  runningAction(PolychromeLeap1) || runningAction(PolychromeLeap2) || runningAction(PolychromeLeap3)
  || runningAction(IridescentSplash) || runningAction(VisualImpact) || runningAction(Intro);

/** The Shifting lasts 25s either way — longer than a loop, so it simply stays put once applied,
 *  and the engine's own exclusivity rule (one Shifting at a time) does the rest. Each mode also
 *  carries its half of Spectral Analysis: Rupture answers any teammate's Rupture break with the
 *  skill (its once-per-8s-per-target limit never binds, a rotation lands about one break a loop),
 *  Strain pays her Tune Break Boost off the Interfered stacks the breaks leave behind. */
const MODE_RUPTURE = new ResonanceMode({
  name: "Resonance Mode - Tune Rupture",
  combatStart: () => applyEnemy(TUNE_SHIFTABLE, 1),
  updateDebuffs: () => { if (inflictsFlux()) applyRupture(); },
  hitGlobal: () => tuneRuptureResponse(SpectralAnalysis),
});
/** This kit's own carrier for the Tune Strain payout (tunebreak.ts's `strainPayout`). */
const LY_STRAIN_PAYOUT = strainPayout();
const MODE_STRAIN = new ResonanceMode({
  name: "Resonance Mode - Tune Strain",
  // her kit raises the target's Tune Strain - Interfered limit by 1 on top of the base 1
  updateDebuffs: () => { if (inflictsFlux()) applyStrain(); },
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1);
    applyCurrent(LY_STRAIN_PAYOUT, 1);
    applyEnemy(TUNE_SHIFTABLE, 1);
  },
});

/* ------------------------------------------------------------------------------------- buffs */

/** Prismatic Overblast: +24% DMG to every nearby team member for 30s — past 21s, so permanent
 *  uptime, and on the active resonator only ("all nearby Resonators", see CLAUDE.md). */
const PRISMATIC_OVERBLAST = new Buff({
  name: "Lynae: Prismatic Overblast",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 24]],
});

/** Adaptive Optics (Inherent Skill): her Intro gives her +25% Spectro DMG Bonus for 9s — short and
 *  her own, so it comes off on her outro. */
const ADAPTIVE_OPTICS = new Buff({
  name: "Inherent: Adaptive Optics",
  duration: 60 * 9,
  stats: [[Stat.DmgBonus, 25, Attribute.Spectro]],
});

/** Her outro hands the incoming resonator +15% All DMG Amplification and +25% Resonance Liberation
 *  DMG Amplification for 14s. */
const LYNAE_OUTRO = new Buff({
  name: "Lynae: Let's Hit the Road!",
  duration: 60 * 14,
  stats: [[Stat.Amp, 15], [Stat.Amp, 25, Type.Liberation]],
  // S2 hands the same resonator 25% more, read off her own slot: this buff is the recipient's
  applyStats: () => {
    if (currentTeam().slots.find((m) => m.resonator === LYNAE_RESONATOR)?.isHeld(LY_S2)) {
      asSource(LY_S2, () => addStat(Stat.Amp, 25));
    }
  },
  lostOnSwap: true,
});

/** The kit's own +40 Tune Break Boost, contributed as the real stat so gear and the damage
 *  formula's own `tbbFactor` (damage.ts) both see it. */
const SPECTRAL_ANALYSIS_TBB = new Buff({
  name: "Lynae: Visual Impact",
  duration: 60 * 30,
  stats: [[Stat.TBB, 40]],
});

/* --------------------------------------------------------------------------- kit and loadout */

const LY_INHERENT_1 = new Inherent({ name: "Inherent: Colors Never Fade!" });
const LY_INHERENT_2 = new Inherent({
  name: "Inherent: \"Adaptive Optics: Everyday Applications\"",
  grants: [{ on: onAction(Intro), buff: ADAPTIVE_OPTICS }],
});

const LYNAE_TALENTS = new Talent({
  name: "Lynae: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

const LYNAE_RESONATOR = new Resonator({
  name: "Lynae",
  talent: LYNAE_TALENTS,
  inherent1: LY_INHERENT_1,
  inherent2: LY_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Pistols,
  color: "#eae477",
  intro: Intro,
  outro: Outro,
  maxEnergy: 12500,
  forteScale: [1, 0.01, 1, 1, 1],
  maxForte1: 120,
  maxForte2: 12000,

  stats: [
    [Stat.BaseHp, 12237.5], [Stat.BaseAtk, 375], [Stat.BaseDef, 1197.7756],
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    [Stat.TBB, 10],
  ],
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: all three Polychrome Leaps at x2.2 — multiplicative, nanoka's own second rows (74.36%
 *  against 33.80%, and the same 2.2 on the other two). Spray Paint's longer window and the
 *  interrupt immunity are no stat, and the out-of-combat Overflow restore reaches nothing here. */
const LY_S1 = new Sequence({
  name: "Lynae S1: Days to be Painted Like a Canvas",
  applyStats: () => {
    if (runningAction(PolychromeLeap1) || runningAction(PolychromeLeap2) || runningAction(PolychromeLeap3)) addStat(Stat.MulMv, 120);
  },
});

/** S2: +25% All DMG Amplification of her own, and the same again on her outro handoff (paid inside
 *  it, since the buff sits on whoever she hands to). */
const LY_S2 = new Sequence({
  name: "Lynae S2: Into Lights' Vanishing Point",
  stats: [[Stat.Amp, 25]],
});

/** S3: Visual Impact and Iridescent Splash at x1.9 — multiplicative, their own second rows
 *  (2311.77% against 1216.72%, 577.95% against 304.18%). Premixed Hue pays only Additive Color's
 *  own Spectro DMG Bonus, and this line never casts it, so that half reaches nothing. */
const LY_S3 = new Sequence({
  name: "Lynae S3: For One Brilliant Moment",
  applyStats: () => {
    if (runningAction(VisualImpact) || runningAction(IridescentSplash)) addStat(Stat.MulMv, 90);
  },
});

/** S4: +20% ATK. */
const LY_S4 = new Sequence({ name: "Lynae S4: Shadows of a Wind Racer", stats: [[Stat.BonusAtk, 20]] });

/** S5: Prismatic Overblast at x1.7 — multiplicative, its own second row (148.71% against 87.48%). */
const LY_S5 = new Sequence({
  name: "Lynae S5: Visions of a Future Unbound",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 70); },
});

/** Color of Soul (S6): a stack off every Graffiti Blast or Mid-air Heavy, three at most, each worth
 *  30% more damage taken from Iridescent Splash and Visual Impact; both spend the lot. */
const COLOR_OF_SOUL = new Buff({
  name: "Lynae S6: Color of Soul", maxStacks: 3,
  applyStats: () => {
    if (runningAction(IridescentSplash) || runningAction(VisualImpact)) addStat(Stat.DamageTaken, 30 * frozenStacks());
  },
  afterAction: () => {
    if (runningAction(IridescentSplash) || runningAction(VisualImpact)) revokeCurrent(COLOR_OF_SOUL);
  },
});
/** S6: Color of Soul above. Its other lines are shape rather than damage — the mid-air Heavy's
 *  charges, her damage reduction, staying in the Parade through her outro, and a Lumiflow ceiling
 *  nothing in this line spends. */
const LY_S6 = new Sequence({
  name: "Lynae S6: Painted in My True Color",
  updateBuffs: () => { if (runningAction(KHeavy)) applyCurrent(COLOR_OF_SOUL, 1); },
});

const LY_SEQUENCES = [LY_S1, LY_S2, LY_S3, LY_S4, LY_S5, LY_S6];

/* ---------------------------------------------------------------------------------- rotation */

/** Intro, Spark Collision to open the Parade, her Forte line (which is what lays the Shifting
 *  down), then the liberation and the Parade combo out. Visual Impact's own 25s cooldown means it
 *  lands once. */

const PolychromeLeap123 = new ActionGroup("Forte - Polychrome Leap 123", [PolychromeLeap1, PolychromeLeap2, PolychromeLeap3]);

const LY_ROTATION = new Rotation([
  INTRO.mashCancel(), Skill.cancel(), ECHO.instaDodge(), Liberation, SparkCollision.cancel(),
  PolychromeLeap123,
  VisualImpact.cancel(), OUTRO,
]);


const LY_ECHOES = [
    // Reel's team Tune Break Boost only pays a Tune DMG dealer
    new EchoLoadout(VOIDWING_MOTH, REEL_5PC).requires(AEMEATH_RESONATOR, LUUK_RESONATOR, QINGXIAO_RESONATOR),
    new EchoLoadout(HYVATIA, NEONLIGHT_LEAP_5PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  // worn for the shield, which Jingran's Trace the Vestige feeds on
  new EchoLoadout(STONEWALL_BRACER, MOONLIT_CLOUDS_5PC).requires(JINGRAN_RESONATOR),
];

/** One loadout per Resonance Mode, the same way Lucilla ships an Echo and a Chafe build — the mode
 *  is the only thing that differs, and it decides which Tune Break variant the team gets. */
const build = (mode: ResonanceMode): Loadout => new Loadout({
  resonator: LYNAE_RESONATOR,
  weapons: [SPECTRUM_BLASTER, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: LY_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation, Substat.Skill),
  rotation: { 0: LY_ROTATION },
  sequences: LY_SEQUENCES,
  mode,
});

export const LYNAE_RUPTURE = build(MODE_RUPTURE);
export const LYNAE_STRAIN = build(MODE_STRAIN);
