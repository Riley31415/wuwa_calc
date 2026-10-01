/**
 * Jianxin — standard 5* Aero Gauntlets support (`Tier.Standard`), so costed at S2 like
 * every standard character here, always on Marcato R5 with Impermanence Heron + Moonlit Clouds.
 *
 * Her kit is a shield and a handoff: Chi (forte1, cap 120) builds off her basics, Calming Air and
 * the Intro, and Primordial Chi Spiral spends it whole on Zhoutian Progress — Chi Strikes, then the
 * three Shocks — for a shield and Reflection. Her Outro amplifies the incoming resonator's
 * Liberation DMG 38%, and S4 buys her own Liberation +80% off every Spiral.
 *
 * Numbers: MVs, energy, concerto and off-tune off nanoka.cc (character 1405, the 3.6+365 static
 * JSON the page fetches) at skill level 10; per-hit Chi off the old sheet's own SpecialEnergy1
 * column (wuwalab has her unregistered), hits summed per cast. Two guesses, both the user's call:
 * the Liberation's 29.83% field is 15 ticks; a full Zhoutian lands two 24.86% Chi Strikes ahead of
 * each Shock (six in all) — nothing published counts them.
 *
 * Sequences, all six always equipped:
 *  S1 +100% Chi from Basic Attacks for 10s after the Intro.
 *  S2 Calming Air holds a second charge — the rotation simply presses it twice.
 *  S3 Chi Counter is up after 2.5s in the Parry Stance — timing only, nothing to model.
 *  S4 +80% Purification Force Field DMG for 14s after Primordial Chi Spiral.
 *  S5 +33% Liberation range — nothing to model.
 *  S6 a Pushing Punch (interrupting Zhoutian early) opens Special Chi Counter, 556.67% Heavy DMG,
 *     once in 5s. Kept as its own cast; a rotation that interrupts can name it.
 */
import { Tier, Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addStat,
  applyCurrent,
  casting,
  currentAction, pressed,
  onAction,
  runningAction,
  forte1,
  isHeld,
  queueOutro,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, ECHO, INTRO } from "../../engine/rotation.js";
import { HEALS, SHIELD, gainShield } from "../../shared/status.js";
import { MARCATO } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function jianxinAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- Fengyiquan. forte1 is the Chi each cast's hits bank. The dodge counter carries the hidden
//     +10 Concerto every dodge counter gets (CLAUDE.md).
const BA1 = jianxinAction("Basic - Fengyiquan 1", { animFrames: 26, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 69.46, energy: 1.02, concerto: 3.28, offtune: 3280, forte1: 6 });
// PLACEHOLDER FRAMES
const BA2 = jianxinAction("Basic - Fengyiquan 2", { animFrames: 60, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 32, mv: 26.64, energy: 0.3941, concerto: 1.2602, offtune: 1264.1898 },
    { hitFrame: 32, mv: 26.64, energy: 0.3941, concerto: 1.2602, offtune: 1264.1898 },
    { hitFrame: 32, mv: 79.9, energy: 1.1818, concerto: 3.7796, offtune: 3791.6204, forte1: 10 },
  ]});
// PLACEHOLDER FRAMES
const BA3 = jianxinAction("Basic - Fengyiquan 3", { animFrames: 60, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 60, mv: 41.75, energy: 0.62, concerto: 1.98, offtune: 1980 },
    { hitFrame: 60, mv: 41.75, energy: 0.62, concerto: 1.98, offtune: 1980 },
    { hitFrame: 60, mv: 41.75, energy: 0.62, concerto: 1.98, offtune: 1980 },
    { hitFrame: 60, mv: 41.75, energy: 0.62, concerto: 1.98, offtune: 1980, forte1: 12 },
  ]});
const BA4 = jianxinAction("Basic - Fengyiquan 4", { animFrames: 60, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 113.4, energy: 1.68, concerto: 5.37, offtune: 5360, forte1: 12 });
const HA = jianxinAction("Heavy - Fengyiquan", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, mv: 126.07, energy: 1.87, concerto: 5.96, offtune: 6000, forte1: 9 });
const MA = jianxinAction("Mid-air - Fengyiquan Plunge", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 123.27, energy: 0.52, concerto: 1, offtune: 4960, forte1: 6 });
// PLACEHOLDER FRAMES
const DC = jianxinAction("Dodge Counter - Fengyiquan", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 40.83, energy: 0.5167, concerto: 2.7803, offtune: 2190.7683 },
    { hitFrame: 0, mv: 40.83, energy: 0.5167, concerto: 2.7803, offtune: 2190.7683 },
    { hitFrame: 0, mv: 163.28, energy: 2.0666, concerto: 11.1194, offtune: 8761.4634, forte1: 17 },
  ]});
const BA1234 = new ActionGroup("Basic - Fengyiquan 1234", [BA1, BA2, BA3, BA4]);
const BA12 = new ActionGroup("Basic - Fengyiquan 12", [BA1, BA2]);
// --- Calming Air: the Parry Stance (8 Concerto on the cast) ends either as Chi Parry (released)
//     or Chi Counter (attacked — S3 makes it available after 2.5s regardless); each cast is one
//     press of the skill, so each carries the stance's own 8 plus its own 14.
// both endings are one press of Calming Air: one 12s cooldown, a second charge at S2
const CALMING_AIR_CD = new Cooldown({ frames: 60 * 12, charges: () => (isHeld(S2) ? 2 : 1) });
const ChiParry = jianxinAction("Skill - Calming Air: Chi Parry", { animFrames: 70, cooldown: CALMING_AIR_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, mv: 258.73, energy: 4, castConcerto: 22, offtune: 12240, forte1: 15+25 }); // assume 25 on cast?
const ChiCounter = jianxinAction("Skill - Calming Air: Chi Counter", { cooldown: CALMING_AIR_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, mv: 334.6, energy: 4, castConcerto: 22, offtune: 5200, forte1: 15+25 }); // assume 25 on cast?

// --- Purification Force Field: the 3.12s field's 29.83% ticks (15 — see the file header) and the
//     636.20% explosion as it collapses, as one cast. Spends the Energy bar (150).
const Liberation = jianxinAction("Liberation - Purification Force Field", {
  animFrames: 185, timestop: 157, motionStop: 185, prioFrames: 185,
  cooldown: 60 * 20,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, mv: 636.2 + 29.83 * 15, concerto: 20,
  offtune: 48000 + 3200 * 15, resetEnergy: true,
});

// --- Primordial Chi Spiral: the hold at 120 Chi that starts Zhoutian Progress, spending every
//     point (the cap as its delta, clamped to it first so it lands on 0) — no hit of its own. The
//     progress is its own casts: Chi Strikes (two ahead of each Shock — see the file header) and
//     the Minor, Major Inner and Major Outer Shocks; the last leaves the Zhoutian 3 shield, the
//     marker every shield-reading gear watches, and its 6s heal the healing one.
const FHA = jianxinAction("Forte Heavy - Primordial Chi Spiral", {
  animFrames: 60,
  node: Node.Forte, cast: Cast.Heavy, castForte1: -120,
});
const ChiStrike = jianxinAction("Forte Heavy - Zhoutian: Chi Strike", { 
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, 
  mv: 24.86, energy: 0.3, offtune: 2000 
});
const MinorShock = jianxinAction("Forte Heavy - Minor Zhoutian: Shock", { 
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, 
  mv: 139.17, energy: 2, castConcerto: 5, offtune: 3920 
});
const InnerShock = jianxinAction("Forte Heavy - Major Zhoutian (Inner): Shock", {
  animFrames: 132,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy,
   mv: 377.74, energy: 8, castConcerto: 18, offtune: 5120
  });
const OuterShock = jianxinAction("Forte Heavy - Major Zhoutian (Outer): Shock", {
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, mv: 516.91, energy: 15.61, castConcerto: 23, offtune: 7360,
  updateDebuffs: () => {
    gainShield();
    applyCurrent(HEALS, 1);
  },
});

/** Releasing early: Pushing Punch before Minor Zhoutian, Yielding Pull after it — the Chi is
 *  already spent by the hold, so each is just its hit, and it leaves the shield of the stage
 *  reached (the same marker, and the same 6s heal). */
const PushingPunch = jianxinAction("Forte Heavy - Pushing Punch", {
  animFrames: 60,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, mv: 248.52, energy: 8, castConcerto: 10, offtune: 5280,
  updateDebuffs: () => {
    gainShield();
    applyCurrent(HEALS, 1);
  },
});
const YieldingPull = jianxinAction("Forte Heavy - Yielding Pull", {
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, mv: 218.7, energy: 3, castConcerto: 7, offtune: 7200,
  updateDebuffs: () => {
    gainShield();
    applyCurrent(HEALS, 1);
  },
});

/** The four ways a Spiral can end, one press each, by the shield level it leaves: released before
 *  Minor Zhoutian (Pushing Punch, level 1), right after Minor (Yielding Pull, 2), right after
 *  Major Inner (Yielding Pull, 3), or run through to Major Outer (4). Two Chi Strikes ahead of
 *  each Shock throughout (see the file header). */
const ZHOUTIAN_1 = new ActionGroup("Forte Heavy - Primordial Chi Spiral (Zhoutian 1)", [
  FHA, PushingPunch
]);
const ZHOUTIAN_2 = new ActionGroup("Forte Heavy - Primordial Chi Spiral (Zhoutian 2)", [
  FHA, MinorShock, YieldingPull // missing chi strikes
]);
const ZHOUTIAN_3 = new ActionGroup("Forte Heavy - Primordial Chi Spiral (Zhoutian 3)", [
  FHA, MinorShock, InnerShock, YieldingPull, // missing chi strikes
]);
const ZHOUTIAN_4 = new ActionGroup("Forte Heavy - Primordial Chi Spiral (Zhoutian 4)", [
  FHA, MinorShock, InnerShock, OuterShock, // missing chi strikes
]);

// PLACEHOLDER FRAMES
const Intro = jianxinAction("Intro - Essence of Tao", { animFrames: 60, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 60, mv: 33.8, energy: 2, offtune: 1920.2 },
    { hitFrame: 60, mv: 33.8, energy: 2, offtune: 1920.2 },
    { hitFrame: 60, mv: 33.8, energy: 2, offtune: 1920.2 },
    { hitFrame: 60, mv: 67.6, energy: 4, offtune: 3840.4, forte1: 40 },
  ], castConcerto: 10});
const Outro = jianxinAction("Outro - Transcendence", {
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => queueOutro(TRANSCENDENCE),
});

/* ------------------------------------------------------------------------------------- buffs */

/** Transcendence (Outro): the incoming resonator's Resonance Liberation DMG is amplified 38% for
 *  14s or until they switch out. */
const TRANSCENDENCE = new Buff({
  name: "Jianxin: Outro",
  duration: 60 * 14,
  lostOnSwap: true,
  stats: [[Stat.Amp, 38, Type.Liberation]],
});

/* ------------------------------------------------------------------------------- sequences */

/** S1 Verdant Branchlet: +100% Chi from Basic Attacks for 10s after the Intro — a second copy of
 *  whatever Chi the basic itself banks. */
const S1_BRANCHLET = new Buff({
  name: "Jianxin S1: Verdant Branchlet",
  duration: 60 * 10,
  applyStats: () => { if (casting(Cast.Basic)) addStat(Stat.AddForte1, pressed().forte1 - pressed().castForte[0]!); },
});
const S1 = new Sequence({
  name: "Jianxin S1: Verdant Branchlet",
  grants: [{ on: onAction(Intro), buff: S1_BRANCHLET }],
});
const S2 = new Sequence({ name: "Jianxin S2: Tao Seeker's Journey" }); // allow 2 skills
const S3 = new Sequence({ name: "Jianxin S3: Principles of Wuwei" });

/** S4 Multitide Reflection: +80% Purification Force Field DMG for 14s after Primordial Chi Spiral. */
const S4_REFLECTION = new Buff({
  name: "Jianxin S4: Multitide Reflection",
  duration: 60 * 14,
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.DmgBonus, 80); },
});
const S4 = new Sequence({
  name: "Jianxin S4",
  grants: [{ on: onAction(FHA), buff: S4_REFLECTION }],
});
const S5 = new Sequence({ name: "Jianxin S5" });

/** S6 Truth from Within: Special Chi Counter, 556.67% Heavy Attack DMG, once within 5s of a
 *  Pushing Punch, with a Zhoutian Progress 4 shield. Energy, Concerto and off-tune are Chi
 *  Counter's own — the page lists none for it. */
const SpecialChiCounter = jianxinAction("Skill - Special Chi Counter", {
  node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, mv: 556.67, energy: 4, concerto: 14, offtune: 5200,
  updateDebuffs: () => gainShield(),
});
const S6 = new Sequence({ name: "Jianxin S6" });

/* --------------------------------------------------------------------------- kit and loadout */

/** Formless Release: Purification Force Field DMG +20%. */
const JX_INHERENT_1 = new Inherent({
  name: "Inherent: Formless Release",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.DmgBonus, 20); },
});

/** Reflection: the Spiral's shield is 20% larger — no damage of its own. */
const JX_INHERENT_2 = new Inherent({ name: "Inherent: Reflection" });

const JIANXIN_TALENTS = new Talent({
  name: "Jianxin: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

const JIANXIN_RESONATOR = new Resonator({
  name: "Jianxin",
  talent: JIANXIN_TALENTS,
  inherent1: JX_INHERENT_1,
  inherent2: JX_INHERENT_2,
  tier: Tier.FreeS2,
  element: Attribute.Aero,
  weapon: WeaponType.Gauntlets,
  color: "#9fe0c8",
  intro: Intro,
  maxEnergy: 150,
  maxForte1: 120,

  stats: [
    [Stat.BaseHp, 14112.5], [Stat.BaseAtk, 337.5], [Stat.BaseDef, 1124.4424],
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
  ],
});

/* ---------------------------------------------------------------------------------- rotation */

/** Intro (40 Chi, S1 up), Chi Parry, the basic chain at double Chi, the second Chi Parry (S2), the
 *  Spiral on a full gauge, the Liberation under S4, the echo and out. Never the team's lead.
 *
 *  The extra BA12 behind the Intro is what pays for the Outro: the rest of the visit banks 92.9
 *  Concerto and the swap costs 100, and two more presses are 9.58 — BA1234 again would be 22.9,
 *  far more than the bar needs. */
const JX_ROTATION_S2 = new Rotation([
  INTRO, ChiParry, ChiParry, Liberation, ZHOUTIAN_1, ECHO.instaSwap(), Outro,
]);

export const JIANXIN = new Loadout({
  resonator: JIANXIN_RESONATOR,
  weapons: [MARCATO], 
  echoLoadouts: [new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.Aero3, Mainstat.ATK3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill),
  rotation: { 2: JX_ROTATION_S2 

},
  sequences: [S1, S2, S3, S4, S5, S6],
});
