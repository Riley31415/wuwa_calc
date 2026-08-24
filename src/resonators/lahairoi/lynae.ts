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
import {
  Buff, Talent, Inherent, ResonanceMode, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO,
  Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  addStat, applySelf, applyTeam, casting, currentAction, maxStackIncrease, queueOutro, revoke,
  lostOnSwap,
} from "../../kit.js";
import { applyRupture, applyStrain, TUNE_STRAIN_INTERFERED, tuneRuptureResponse, tuneStrainBonus } from "../../tunebreak.js";
import { SPECTRUM_BLASTER } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { HYVATIA, NEONLIGHT_LEAP_5PC, NEONLIGHT_LEAP_2PC } from "../../echoes/lahairoi.js";
import { HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions } from "../../mainstats.js";
import { chem } from "../../substats.js";

/* ----------------------------------------------------------------------------------- actions */

function lynaeAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Chroma Drift, the out-of-Parade chain. Spark Collision Lv.3 is what sends her into
//     Kaleidoscopic Parade, so it opens the rotation and the rest of this chain never gets played.
export const BA1 = lynaeAction("Basic - Chroma Drift 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.19, energy: 1.28, concerto: 4.59, offtune: 4080 });
export const BA2 = lynaeAction("Basic - Chroma Drift 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 157.17, energy: 2.34, concerto: 8.37, offtune: 7440 });
export const BA3 = lynaeAction("Basic - Chroma Drift 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 123.37, energy: 1.83, concerto: 6.57, offtune: 5840 });
export const DC = lynaeAction("Basic - Chroma Drift (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 239.97, energy: 2.05, concerto: 17.38, offtune: 6560 });
export const MA = lynaeAction("Basic - Chroma Drift (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 143.65, energy: 2.14, concerto: 7.66, offtune: 6800 });
export const SparkCollision = lynaeAction("Basic - Spark Collision Lv. 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 555.56, energy: 8.22, concerto: 29.6, offtune: 26300 });

// --- Kaleidoscopic Parade, the combo she actually plays
export const KBA1 = lynaeAction("Basic - Kaleidoscopic Parade 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 82.81, energy: 1.23, concerto: 4.41, offtune: 3920 });
export const KBA2 = lynaeAction("Basic - Kaleidoscopic Parade 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 77.74, energy: 1.16, concerto: 4.14, offtune: 3680 });
export const KBA3 = lynaeAction("Basic - Kaleidoscopic Parade 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 113.25, energy: 1.68, concerto: 6.03, offtune: 5361 });
export const KBA4 = lynaeAction("Basic - Kaleidoscopic Parade 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 148.74, energy: 2.2, concerto: 7.94, offtune: 7040 });
export const KBA5 = lynaeAction("Basic - Kaleidoscopic Parade 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 251.81, energy: 3.76, concerto: 13.45, offtune: 11924 });
export const KHeavy = lynaeAction("Heavy - Kaleidoscopic Parade (Ground)", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Basic, mv: 123.41, energy: 2.94, concerto: 6.58, offtune: 5845 });
export const GraffitiBlast = lynaeAction("Heavy - Kaleidoscopic Parade: Graffiti Blast", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Basic, mv: 104.78, energy: 1.55, concerto: 5.58, offtune: 4960 });

// --- Forte Circuit. These carry Photochromic Flux, which is what shifts the target (see the two
//     Resonance Modes below). Visual Impact is the big one, on a 25s cooldown.
export const PolychromeLeap1 = lynaeAction("Forte - Polychrome Leap 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 101.4, energy: 2.25, concerto: 5.4, offtune: 4800 });
export const PolychromeLeap2 = lynaeAction("Forte - Polychrome Leap 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 101.4, energy: 2.28, concerto: 5.4, offtune: 4800 });
export const PolychromeLeap3 = lynaeAction("Forte - Polychrome Leap 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 104.8, energy: 2.4, concerto: 5.6, offtune: 4960 });
export const IridescentSplash = lynaeAction("Forte - Iridescent Splash", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 304.18, energy: 8.13, concerto: 7.65, offtune: 6800 });
export const VisualImpact = lynaeAction("Forte - Visual Impact", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 1216.72, energy: 14.05, concerto: 14.58, offtune: 60960 });

export const Skill = lynaeAction("Skill - Lynae-Style Palettes", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 278.63, energy: 8.75, concerto: 9.83, offtune: 8722 });
export const AdditiveColor = lynaeAction("Skill - Additive Color", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 232.62, energy: 6.92, concerto: 8.2, offtune: 7280 });

export const Liberation = lynaeAction("Liberation - Prismatic Overblast", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 874.8,
  concerto: 20, offtune: 48000, resetEnergy: true,
});
export const VividTomorrow = lynaeAction("Basic - To a Vivid Tomorrow!", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 201.06, energy: 5.46, concerto: 19.42, offtune: 17128 });

export const Intro = lynaeAction("Intro - Time to Show Some Colors!", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 224.8, energy: 13.4, concerto: 22, offtune: 10640 });
export const Outro = lynaeAction("Outro - Let's Hit the Road!", { cast: Cast.Outro, type: Type1.Outro, mv: 100, active: false });

export const SpectralAnalysis = lynaeAction("Tune Rupture Response - Spectral Analysis", {
  node: Node.Forte, type: Type1.Rupture, mv: 1880.75,
});

/* ------------------------------------------------------------------------------------- modes */

/** Photochromic Flux rides Polychrome Leap, Iridescent Splash, Visual Impact and her Intro
 *  (Chromaticity Modeling's own list), so those are the casts that shift the target. */
const inflictsFlux = (a: Action): boolean =>
  a === PolychromeLeap1 || a === PolychromeLeap2 || a === PolychromeLeap3
  || a === IridescentSplash || a === VisualImpact || a === Intro;

/** The Shifting lasts 25s either way — longer than a loop, so it simply stays put once applied,
 *  and the engine's own exclusivity rule (one Shifting at a time) does the rest. Each mode also
 *  carries its half of Spectral Analysis: Rupture answers any teammate's Rupture break with the
 *  skill (its once-per-8s-per-target limit never binds, a rotation lands about one break a loop),
 *  Strain pays her Tune Break Boost off the Interfered stacks the breaks leave behind. */
export const MODE_RUPTURE = new ResonanceMode({
  name: "Lynae: Resonance Mode - Tune Rupture",
  update: () => { if (inflictsFlux(currentAction())) applyRupture(); },
});
export const MODE_STRAIN = new ResonanceMode({
  name: "Lynae: Resonance Mode - Tune Strain",
  // her kit raises the target's Tune Strain - Interfered limit by 1 on top of the base 1
  update: () => { if (inflictsFlux(currentAction())) applyStrain(); },
});

/* ------------------------------------------------------------------------------------- buffs */

/** Prismatic Overblast: +24% DMG to every nearby team member for 30s — past 21s, so permanent
 *  uptime, and on the active resonator only ("all nearby Resonators", see CLAUDE.md). */
export const PRISMATIC_OVERBLAST = new Buff({
  name: "Lynae: Prismatic Overblast",
  apply: () => { addStat(Stat.DmgBonus, 24); },
});

/** Adaptive Optics (Inherent Skill): her Intro gives her +25% Spectro DMG Bonus for 9s — short and
 *  her own, so it comes off on her outro. */
export const ADAPTIVE_OPTICS = new Buff({
  name: "Lynae: Adaptive Optics",
  apply: () => addStat(Stat.DmgBonus, 25, Attribute.Spectro),
  convert: () => { if (casting(Cast.Outro)) revoke(ADAPTIVE_OPTICS); },
});

/** Her outro hands the incoming resonator +15% All DMG Amplification and +25% Resonance Liberation
 *  DMG Amplification for 14s. */
export const LYNAE_OUTRO = new Buff({
  name: "Lynae: Let's Hit the Road!",
  apply: () => { addStat(Stat.Amp, 15); addStat(Stat.Amp, 25, Type1.Liberation); },
  convert: () => { lostOnSwap(); },
});

/** The kit's own +40 Tune Break Boost, contributed as the real stat so gear and the damage
 *  formula's own `tbbFactor` (damage.ts) both see it. */
export const SPECTRAL_ANALYSIS_TBB = new Buff({
  name: "Lynae: Visual Impact",
  apply: () => addStat(Stat.Tbb, 40),
});


/* --------------------------------------------------------------------------- kit and loadout */

export const LY_INHERENT_1 = new Inherent({ name: "Lynae: Colors Never Fade!" });
export const LY_INHERENT_2 = new Inherent({
  name: "Lynae: Adaptive Optics: Everyday Applications",
  update: () => { if (currentAction() === Intro) applySelf(ADAPTIVE_OPTICS, 1); },
});

export const LYNAE_TALENTS = new Talent({
  name: "Lynae: Talents",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8); },
});

export const LYNAE = new Resonator({
  name: "Lynae",
  abbreviation: "Lynae",
  element: Attribute.Spectro,
  weapon: WeaponType.Pistols,
  intro: () => Intro,
  color: "#e8a0d8",
  maxEnergy: 125,
  updateGlobal: () => tuneRuptureResponse(SpectralAnalysis),
  combatStart: () => maxStackIncrease(TUNE_STRAIN_INTERFERED, 1),
  convert: () => tuneStrainBonus(),

  update: () => {
    const a = currentAction();
    if (a === Liberation) applyTeam(PRISMATIC_OVERBLAST, 1);
    if (a === Outro) queueOutro(LYNAE_OUTRO);
    if (a === VisualImpact) applyTeam(SPECTRAL_ANALYSIS_TBB, 1);
  },

  apply: () => {
    addStat(Stat.BaseHp, 12237.5); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1197.8);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    addStat(Stat.Tbb, 10);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

/** Intro, Spark Collision to open the Parade, her Forte line (which is what lays the Shifting
 *  down), then the liberation and the Parade combo out. Visual Impact's own 25s cooldown means it
 *  lands once. */
export const LY_ROTATION = [
  INTRO, Liberation, Skill, SparkCollision,
  PolychromeLeap1, PolychromeLeap2, PolychromeLeap3,
  VisualImpact, ECHO_CAST, 
  Outro,
];

const LY_ECHOES = [
  new EchoLoadout(HYVATIA, NEONLIGHT_LEAP_5PC, NEONLIGHT_LEAP_2PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
];

/** One loadout per Resonance Mode, the same way Lucilla ships an Echo and a Chafe build — the mode
 *  is the only thing that differs, and it decides which Tune Break variant the team gets. */
const build = (mode: ResonanceMode): Loadout => new Loadout(
  LYNAE, true, LYNAE_TALENTS, LY_INHERENT_1, LY_INHERENT_2,
  [SPECTRUM_BLASTER, NEW_STD_PISTOL, STATIC_MIST],
  LY_ECHOES,
  mainstatOptions(["CR", "CD"], ["atk", "spectro"], ["atk"]), chem("atk", "basic"),
  LY_ROTATION, LY_ROTATION,
  undefined, undefined, undefined, undefined, undefined, undefined,
  mode,
);

export const LYNAE_LOADOUT = build(MODE_RUPTURE);
export const LYNAE_LOADOUT_STRAIN = build(MODE_STRAIN);
