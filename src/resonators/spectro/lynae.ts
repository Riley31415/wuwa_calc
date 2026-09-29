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
  applyTeam,
  onAction,
  runningAction,
  maxStackIncrease,
  queueOutro,
  revokeCurrent,
  asSource,
  currentTeam,
  frozenStacks,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, ECHO, INTRO } from "../../engine/rotation.js";
import { applyRupture, applyStrain, TUNE_STRAIN_INTERFERED, strainPayout, tuneRuptureResponse } from "../../shared/tunebreak.js";
import { SPECTRUM_BLASTER } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { HYVATIA, NEONLIGHT_LEAP_5PC, REEL_5PC, VOIDWING_MOTH } from "../../echoes/lahairoi.js";
import { HERON, STONEWALL_BRACER, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function lynaeAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Chroma Drift, the out-of-Parade chain. Spark Collision Lv.3 is what sends her into
//     Kaleidoscopic Parade, so it opens the rotation and the rest of this chain never gets played.
const BA1 = lynaeAction("Basic - Chroma Drift 1", { animFrames: 31, commitFrames: 16, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 16, mv: 86.19, energy: 1.28, concerto: 4.59, offtune: 4080, forte1: 12 }]});
const BA2 = lynaeAction("Basic - Chroma Drift 2", { animFrames: 66, commitFrames: 39, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 15, mv: 52.39, energy: 0.78, concerto: 2.79, offtune: 2480 },
    { at: 29, mv: 52.39, energy: 0.78, concerto: 2.79, offtune: 2480 },
    { at: 39, mv: 52.39, energy: 0.78, concerto: 2.79, offtune: 2480, forte1: 21 },
  ]});
const BA3 = lynaeAction("Basic - Chroma Drift 3", { animFrames: 44, commitFrames: 28, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 28, mv: 123.37, energy: 1.83, concerto: 6.57, offtune: 5840, forte1: 17 }]});
const DC = lynaeAction("Dodge Counter - Chroma Drift", { animFrames: 49, commitFrames: 31, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [{ at: 31, mv: 239.97, energy: 2.05, concerto: 17.38, offtune: 6560, forte1: 19 }]});
const MA = lynaeAction("Mid-air - Chroma Drift Plunge", { animFrames: 54, commitFrames: 41, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 26, mv: 14.37, energy: 0.22, concerto: 0.77, offtune: 680 },
    { at: 41, mv: 129.28, energy: 1.92, concerto: 6.89, offtune: 6120, forte1: 20 },
  ]});
const SparkCollision = lynaeAction("Basic - Spark Collision Lv. 3", { animFrames: 157, commitFrames: 111, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 100, mv: 277.78, energy: 4.11, concerto: 14.8, offtune: 13150 },
    { at: 111, mv: 277.78, energy: 4.11, concerto: 14.8, offtune: 13150, forte2: 120 },
  ], castForte1: -120});

// --- Kaleidoscopic Parade, the combo she actually plays
const KBA1 = lynaeAction("Basic - Kaleidoscopic Parade 1", { animFrames: 35, commitFrames: 13, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 13, mv: 82.81, energy: 1.23, concerto: 4.41, offtune: 3920 }]});
const KBA2 = lynaeAction("Basic - Kaleidoscopic Parade 2", { animFrames: 28, commitFrames: 21, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 10, mv: 38.87, energy: 0.58, concerto: 2.07, offtune: 1840 },
    { at: 21, mv: 38.87, energy: 0.58, concerto: 2.07, offtune: 1840 },
  ]});
const KBA3 = lynaeAction("Basic - Kaleidoscopic Parade 3", { animFrames: 40, commitFrames: 24, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 12, mv: 37.75, energy: 0.56, concerto: 2.01, offtune: 1787 },
    { at: 16, mv: 37.75, energy: 0.56, concerto: 2.01, offtune: 1787 },
    { at: 24, mv: 37.75, energy: 0.56, concerto: 2.01, offtune: 1787 },
  ]});
const KBA4 = lynaeAction("Basic - Kaleidoscopic Parade 4", { animFrames: 70, commitFrames: 50, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 14, mv: 29.75, energy: 0.44, concerto: 1.59, offtune: 1408 },
    { at: 25, mv: 29.75, energy: 0.44, concerto: 1.59, offtune: 1408 },
    { at: 38, mv: 44.62, energy: 0.66, concerto: 2.38, offtune: 2112 },
    { at: 50, mv: 44.62, energy: 0.66, concerto: 2.38, offtune: 2112 },
  ]});
const KBA5 = lynaeAction("Basic - Kaleidoscopic Parade 5", { animFrames: 99, commitFrames: 29, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 8, mv: 75.54, energy: 1.12, concerto: 4.03, offtune: 3576 },
    { at: 29, mv: 15.11, energy: 0.23, concerto: 0.81, offtune: 716 },
    { at: 35, mv: 15.11, energy: 0.23, concerto: 0.81, offtune: 716 },
    { at: 41, mv: 15.11, energy: 0.23, concerto: 0.81, offtune: 716 },
    { at: 47, mv: 15.11, energy: 0.23, concerto: 0.81, offtune: 716 },
    { at: 53, mv: 15.11, energy: 0.23, concerto: 0.81, offtune: 716 },
    { at: 59, mv: 100.72, energy: 1.49, concerto: 5.37, offtune: 4768 },
  ]});
const KHeavy = lynaeAction("Heavy - Kaleidoscopic Parade (Ground)", { animFrames: 82, commitFrames: 56, node: Node.Normal, cast: Cast.Heavy, type: Type.Basic, hits: [
    { at: 10, mv: 17.63, energy: 0.42, concerto: 0.94, offtune: 835 },
    { at: 14, mv: 17.63, energy: 0.42, concerto: 0.94, offtune: 835 },
    { at: 18, mv: 17.63, energy: 0.42, concerto: 0.94, offtune: 835 },
    { at: 22, mv: 17.63, energy: 0.42, concerto: 0.94, offtune: 835 },
    { at: 26, mv: 17.63, energy: 0.42, concerto: 0.94, offtune: 835 },
    { at: 30, mv: 17.63, energy: 0.42, concerto: 0.94, offtune: 835 },
    { at: 34, mv: 17.63, energy: 0.42, concerto: 0.94, offtune: 835 },
  ]});
const GraffitiBlast = lynaeAction("Heavy - Kaleidoscopic Parade: Graffiti Blast", { animFrames: 70, commitFrames: 70, node: Node.Normal, cast: Cast.Heavy, type: Type.Basic, mv: 104.78, energy: 1.55, concerto: 5.58, offtune: 4960 });

// --- Forte Circuit. These carry Photochromic Flux, which is what shifts the target (see the two
//     Resonance Modes below). Visual Impact is the big one, on a 25s cooldown.
const PolychromeLeap1 = lynaeAction("Forte Basic - Polychrome Leap 1", { animFrames: 46, commitFrames: 25, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 12, mv: 33.8, energy: 0.75, concerto: 1.8, offtune: 1600 },
    { at: 21, mv: 33.8, energy: 0.75, concerto: 1.8, offtune: 1600 },
    { at: 25, mv: 33.8, energy: 0.75, concerto: 1.8, offtune: 1600 },
  ], castForte2: -40,  });
const PolychromeLeap2 = lynaeAction("Forte Basic - Polychrome Leap 2", { animFrames: 42, commitFrames: 42, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 12, mv: 16.9, energy: 0.38, concerto: 0.9, offtune: 800 },
    { at: 18, mv: 16.9, energy: 0.38, concerto: 0.9, offtune: 800 },
    { at: 24, mv: 16.9, energy: 0.38, concerto: 0.9, offtune: 800 },
    { at: 30, mv: 16.9, energy: 0.38, concerto: 0.9, offtune: 800 },
    { at: 36, mv: 16.9, energy: 0.38, concerto: 0.9, offtune: 800 },
    { at: 42, mv: 16.9, energy: 0.38, concerto: 0.9, offtune: 800 },
  ], castForte2: -40,  });
const PolychromeLeap3 = lynaeAction("Forte Basic - Polychrome Leap 3", { animFrames: 37, commitFrames: 14, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 14, mv: 13.1, energy: 0.3, concerto: 0.7, offtune: 620 },
    { at: 17, mv: 13.1, energy: 0.3, concerto: 0.7, offtune: 620 },
    { at: 20, mv: 13.1, energy: 0.3, concerto: 0.7, offtune: 620 },
    { at: 23, mv: 13.1, energy: 0.3, concerto: 0.7, offtune: 620 },
    { at: 50, mv: 13.1, energy: 0.3, concerto: 0.7, offtune: 620 },
    { at: 53, mv: 13.1, energy: 0.3, concerto: 0.7, offtune: 620 },
    { at: 56, mv: 13.1, energy: 0.3, concerto: 0.7, offtune: 620 },
    { at: 59, mv: 13.1, energy: 0.3, concerto: 0.7, offtune: 620 },
  ], castForte2: -40,  });
const IridescentSplash = lynaeAction("Forte Basic - Iridescent Splash", { animFrames: 64, commitFrames: 38, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 38, mv: 304.18, energy: 8.13, concerto: 7.65, offtune: 6800 }],  });
const VisualImpact = lynaeAction("Forte Basic - Visual Impact", {
  animFrames: 105, commitFrames: 42, cooldown: 60 * 25,
  node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 42, mv: 1216.72, energy: 14.05, concerto: 14.58, offtune: 60960 }],
  updateBuffs: () => applyTeam(SPECTRAL_ANALYSIS_TBB, 1),
});

// Lynae-Style Palettes and Additive Color share one 6s cooldown
const SKILL_CD = new Cooldown({ frames: 60 * 6 });
const Skill = lynaeAction("Skill - Lynae-Style Palettes", { animFrames: 76, commitFrames: 30, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 30, mv: 139.31, energy: 4.37, concerto: 4.91, offtune: 4360 },
    { at: 51, mv: 46.44, energy: 1.46, concerto: 1.64, offtune: 1454 },
    { at: 58, mv: 46.44, energy: 1.46, concerto: 1.64, offtune: 1454 },
    { at: 62, mv: 46.44, energy: 1.46, concerto: 1.64, offtune: 1454, forte1: 25 },
  ]});
const AdditiveColor = lynaeAction("Skill - Additive Color", { animFrames: 75, commitFrames: 30, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 16, mv: 116.31, energy: 3.46, concerto: 4.1, offtune: 3640 },
    { at: 30, mv: 116.31, energy: 3.46, concerto: 4.1, offtune: 3640 },
  ]});

const Liberation = lynaeAction("Liberation - Prismatic Overblast", {
  animFrames: 240, commitFrames: 240, timestop: 240, motionStop: 223, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, hits: [
    { at: 189, mv: 87.48, offtune: 4800 },
    { at: 195, mv: 87.48, offtune: 4800 },
    { at: 201, mv: 87.48, offtune: 4800 },
    { at: 207, mv: 87.48, offtune: 4800 },
    { at: 213, mv: 87.48, offtune: 4800 },
    { at: 219, mv: 87.48, offtune: 4800 },
    { at: 225, mv: 87.48, offtune: 4800 },
    { at: 231, mv: 87.48, offtune: 4800 },
    { at: 237, mv: 87.48, offtune: 4800 },
    { at: 243, mv: 87.48, offtune: 4800 },
  ],
  castConcerto: 20, resetEnergy: true,
  updateBuffs: () => applyTeam(PRISMATIC_OVERBLAST, 1),
});
const VividTomorrow = lynaeAction("Basic - To a Vivid Tomorrow!", { animFrames: 159, commitFrames: 118, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 52, mv: 8.38, energy: 0.23, concerto: 0.81, offtune: 714 },
    { at: 56, mv: 8.38, energy: 0.23, concerto: 0.81, offtune: 714 },
    { at: 60, mv: 8.38, energy: 0.23, concerto: 0.81, offtune: 714 },
    { at: 65, mv: 8.38, energy: 0.23, concerto: 0.81, offtune: 714 },
    { at: 69, mv: 8.38, energy: 0.23, concerto: 0.81, offtune: 714 },
    { at: 73, mv: 8.38, energy: 0.23, concerto: 0.81, offtune: 714 },
    { at: 77, mv: 8.38, energy: 0.23, concerto: 0.81, offtune: 714 },
    { at: 81, mv: 8.38, energy: 0.23, concerto: 0.81, offtune: 714 },
    { at: 86, mv: 8.38, energy: 0.23, concerto: 0.81, offtune: 714 },
    { at: 90, mv: 8.38, energy: 0.23, concerto: 0.81, offtune: 714 },
    { at: 94, mv: 8.38, energy: 0.23, concerto: 0.81, offtune: 714 },
    { at: 98, mv: 8.38, energy: 0.23, concerto: 0.81, offtune: 714 },
    { at: 118, mv: 10.05, energy: 0.27, concerto: 0.97, offtune: 856 },
    { at: 124, mv: 10.05, energy: 0.27, concerto: 0.97, offtune: 856 },
    { at: 130, mv: 10.05, energy: 0.27, concerto: 0.97, offtune: 856 },
    { at: 136, mv: 10.05, energy: 0.27, concerto: 0.97, offtune: 856 },
    { at: 142, mv: 10.05, energy: 0.27, concerto: 0.97, offtune: 856 },
    { at: 148, mv: 10.05, energy: 0.27, concerto: 0.97, offtune: 856 },
    { at: 154, mv: 10.05, energy: 0.27, concerto: 0.97, offtune: 856 },
    { at: 160, mv: 10.05, energy: 0.27, concerto: 0.97, offtune: 856 },
    { at: 166, mv: 10.05, energy: 0.27, concerto: 0.97, offtune: 856 },
    { at: 172, mv: 10.05, energy: 0.27, concerto: 0.97, offtune: 856 },
  ]});

const Intro = lynaeAction("Intro - Time to Show Some Colors!", { animFrames: 76, commitFrames: 44, motionStop: 63, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 44, mv: 22.48, energy: 1.34, concerto: 1.2, offtune: 1064 },
    { at: 50, mv: 22.48, energy: 1.34, concerto: 1.2, offtune: 1064 },
    { at: 56, mv: 22.48, energy: 1.34, concerto: 1.2, offtune: 1064 },
    { at: 62, mv: 22.48, energy: 1.34, concerto: 1.2, offtune: 1064 },
    { at: 68, mv: 22.48, energy: 1.34, concerto: 1.2, offtune: 1064 },
    { at: 74, mv: 22.48, energy: 1.34, concerto: 1.2, offtune: 1064 },
    { at: 80, mv: 22.48, energy: 1.34, concerto: 1.2, offtune: 1064 },
    { at: 86, mv: 22.48, energy: 1.34, concerto: 1.2, offtune: 1064 },
    { at: 92, mv: 22.48, energy: 1.34, concerto: 1.2, offtune: 1064 },
    { at: 98, mv: 22.48, energy: 1.34, concerto: 1.2, offtune: 1064, forte1: 100 },
  ], castConcerto: 10});
const Outro = lynaeAction("Outro - Let's Hit the Road!", {
  animFrames: 159, commitFrames: 118,
  cast: Cast.Outro, type: Type.Outro, hits: [
    { at: 52, mv: 4.55 },
    { at: 58, mv: 4.55 },
    { at: 64, mv: 4.55 },
    { at: 70, mv: 4.55 },
    { at: 76, mv: 4.55 },
    { at: 82, mv: 4.55 },
    { at: 88, mv: 4.55 },
    { at: 94, mv: 4.55 },
    { at: 100, mv: 4.55 },
    { at: 106, mv: 4.55 },
    { at: 110, mv: 4.55 },
    { at: 112, mv: 4.55 },
    { at: 116, mv: 4.55 },
    { at: 118, mv: 4.55 },
    { at: 122, mv: 4.55 },
    { at: 128, mv: 4.55 },
    { at: 134, mv: 4.55 },
    { at: 140, mv: 4.55 },
    { at: 146, mv: 4.55 },
    { at: 152, mv: 4.55 },
    { at: 158, mv: 4.55 },
    { at: 164, mv: 4.45 },
  ], castConcerto: -100,
  updateBuffs: () => queueOutro(LYNAE_OUTRO),
});

const SpectralAnalysis = lynaeAction("Tune Rupture Response - Spectral Analysis", {
  animFrames: 0,
  node: Node.Forte, type: Type.Rupture, hits: [{ at: 0, mv: 1880.75 }], scaling: Scaling.Tune
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
  updateDebuffs: () => { if (inflictsFlux()) applyRupture(); },
  hitGlobal: () => tuneRuptureResponse(SpectralAnalysis),
});
/** This kit's own carrier for the Tune Strain payout (tunebreak.ts's `strainPayout`). */
const LY_STRAIN_PAYOUT = strainPayout();
const MODE_STRAIN = new ResonanceMode({
  name: "Resonance Mode - Tune Strain",
  // her kit raises the target's Tune Strain - Interfered limit by 1 on top of the base 1
  updateDebuffs: () => { if (inflictsFlux()) applyStrain(); },
  combatStart: () => { maxStackIncrease(TUNE_STRAIN_INTERFERED, 1); applyCurrent(LY_STRAIN_PAYOUT, 1); },
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
  stats: [[Stat.Tbb, 40]],
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
  maxEnergy: 125,
  maxForte1: 120,
  maxForte2: 120,

  stats: [
    [Stat.BaseHp, 12237.5], [Stat.BaseAtk, 375], [Stat.BaseDef, 1197.7756],
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    [Stat.Tbb, 10],
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

/** Color of Soul (S6): a stack off every Graffiti Blast or Parade Heavy, three at most, each worth
 *  30% more damage taken from Iridescent Splash and Visual Impact; both spend the lot. */
const COLOR_OF_SOUL = new Buff({
  name: "Lynae S6: Color of Soul", maxStacks: 3,
  applyStats: () => {
    if (runningAction(IridescentSplash) || runningAction(VisualImpact)) addStat(Stat.DamageTaken, 30 * frozenStacks());
  },
  convertStats: () => {
    if (runningAction(IridescentSplash) || runningAction(VisualImpact)) revokeCurrent(COLOR_OF_SOUL);
  },
});
/** S6: Color of Soul above. Its other lines are shape rather than damage — the mid-air Heavy's
 *  charges, her damage reduction, staying in the Parade through her outro, and a Lumiflow ceiling
 *  nothing in this line spends. */
const LY_S6 = new Sequence({
  name: "Lynae S6: Painted in My True Color",
  updateBuffs: () => { if (runningAction(GraffitiBlast) || runningAction(KHeavy)) applyCurrent(COLOR_OF_SOUL, 1); },
});

const LY_SEQUENCES = [LY_S1, LY_S2, LY_S3, LY_S4, LY_S5, LY_S6];

/* ---------------------------------------------------------------------------------- rotation */

/** Intro, Spark Collision to open the Parade, her Forte line (which is what lays the Shifting
 *  down), then the liberation and the Parade combo out. Visual Impact's own 25s cooldown means it
 *  lands once. */

const PolychromeLeap123 = new ActionGroup("Forte - Polychrome Leap 123", [PolychromeLeap1, PolychromeLeap2, PolychromeLeap3]);

const LY_ROTATION = new Rotation([
  INTRO.easyCancel(), Skill.cancel(), ECHO.instaDodge(), Liberation, SparkCollision.cancel(),
  PolychromeLeap123,
  VisualImpact.swapCancel(), Outro,
]);


const LY_ECHOES = [
    new EchoLoadout(VOIDWING_MOTH, REEL_5PC),
    new EchoLoadout(HYVATIA, NEONLIGHT_LEAP_5PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(STONEWALL_BRACER, MOONLIT_CLOUDS_5PC),
];

/** One loadout per Resonance Mode, the same way Lucilla ships an Echo and a Chafe build — the mode
 *  is the only thing that differs, and it decides which Tune Break variant the team gets. */
const build = (mode: ResonanceMode): Loadout => new Loadout({
  resonator: LYNAE_RESONATOR,
  weapons: [SPECTRUM_BLASTER, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: LY_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  rotation: { 0: LY_ROTATION },
  sequences: LY_SEQUENCES,
  mode,
});

export const LYNAE_RUPTURE = build(MODE_RUPTURE);
export const LYNAE_STRAIN = build(MODE_STRAIN);
