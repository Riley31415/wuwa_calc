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
  currentHit, addGain,
  onAction,
  runningAction,
  isHeld,
  queueQTE,
  revokeCurrent,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, ECHO, INTRO, OUTRO } from "../../engine/rotation.js";
import { HEALS, gainShield } from "../../shared/status.js";
import { MARCATO } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function jianxinAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

/** Zhoutian Progress, from the Spiral's hold until a release (Pushing Punch, Yielding Pull) or
 *  the last Chi (Major Outer's Shock) ends it; the two stage markers say how far it has reached. */
const ZHOUTIAN_PROGRESS = new Buff({ name: "Jianxin: Zhoutian Progress" });
// the stage markers only stand inside Zhoutian Progress, and end with it
const MINOR_ZHOUTIAN = new Buff({ name: "Jianxin: Minor Zhoutian", lostWith: ZHOUTIAN_PROGRESS });
const MAJOR_INNER_ZHOUTIAN = new Buff({ name: "Jianxin: Major Zhoutian (Inner)", lostWith: ZHOUTIAN_PROGRESS });
/** S6: "if Jianxin performs Pushing Punch, Special Chi Counter can be used 1 time(s) in 5s". */
const SPECIAL_CHI_COUNTER_READY = new Buff({ name: "Jianxin S6: Special Chi Counter Ready", duration: 60 * 5 });

// --- Fengyiquan. forte1 is the Chi each cast's hits bank. The dodge counter carries the hidden
//     +10 Concerto every dodge counter gets (CLAUDE.md).
const BA1 = jianxinAction("Basic - Fengyiquan 1", { animFrames: 26, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 26, mv: 6946, energy: 102, concerto: 328, offtune: 3280, forte1: 6 }] });
// PLACEHOLDER FRAMES
const BA2 = jianxinAction("Basic - Fengyiquan 2", { animFrames: 60, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 32, mv: 2664, energy: 40, concerto: 126, offtune: 1264 },
    { hitFrame: 32, mv: 2664, energy: 40, concerto: 126, offtune: 1264 },
    { hitFrame: 32, mv: 7990, energy: 117, concerto: 378, offtune: 3792, forte1: 10 },
  ]});
// PLACEHOLDER FRAMES
const BA3 = jianxinAction("Basic - Fengyiquan 3", { animFrames: 60, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 60, mv: 4175, energy: 62, concerto: 198, offtune: 1980 },
    { hitFrame: 60, mv: 4175, energy: 62, concerto: 198, offtune: 1980 },
    { hitFrame: 60, mv: 4175, energy: 62, concerto: 198, offtune: 1980 },
    { hitFrame: 60, mv: 4175, energy: 62, concerto: 198, offtune: 1980, forte1: 12 },
  ]});
const BA4 = jianxinAction("Basic - Fengyiquan 4", { animFrames: 60, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 60, mv: 11340, energy: 168, concerto: 537, offtune: 5360, forte1: 12 }] });
const HA = jianxinAction("Heavy - Fengyiquan", { castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 12607, energy: 187, concerto: 596, offtune: 6000, forte1: 9 }] });
const MA = jianxinAction("Mid-air - Fengyiquan Plunge", { castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 12327, energy: 52, concerto: 100, offtune: 4960, forte1: 6 }] });
// PLACEHOLDER FRAMES
const DC = jianxinAction("Dodge Counter - Fengyiquan", { castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 4083, energy: 52, concerto: 162, offtune: 3286 },
    { hitFrame: 0, mv: 4083, energy: 52, concerto: 162, offtune: 3286 },
    { hitFrame: 0, mv: 16328, energy: 206, concerto: 344, offtune: 6571, forte1: 17 },
  ], castConcerto: 1000});
const BA1234 = new ActionGroup("Basic - Fengyiquan 1234", [BA1, BA2, BA3, BA4]);
const BA12 = new ActionGroup("Basic - Fengyiquan 12", [BA1, BA2]);
// --- Calming Air: the Parry Stance (8 Concerto on the cast) ends either as Chi Parry (released)
//     or Chi Counter (attacked — S3 makes it available after 2.5s regardless); each cast is one
//     press of the skill, so each carries the stance's own 8 plus its own 14.
// both endings are one press of Calming Air: one 12s cooldown, a second charge at S2
const CALMING_AIR_CD = new Cooldown({ frames: 60 * 12, charges: () => (isHeld(S2) ? 2 : 1) });
const ChiParry = jianxinAction("Skill - Calming Air: Chi Parry", { animFrames: 70, castPriority: 4, cooldown: CALMING_AIR_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 70, mv: 25873, energy: 400, offtune: 12240, forte1: 15+25 }], castConcerto: 2200 }); // assume 25 on cast?
const ChiCounter = jianxinAction("Skill - Calming Air: Chi Counter", { castPriority: 4, cooldown: CALMING_AIR_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 0, mv: 33460, energy: 400, offtune: 5200, forte1: 15+25 }], castConcerto: 2200 }); // assume 25 on cast?

// --- Purification Force Field: the 3.12s field's 29.83% ticks (15 — see the file header) and the
//     636.20% explosion as it collapses, as one cast. Spends the Energy bar (150).
const Liberation = jianxinAction("Liberation - Purification Force Field", {
  animFrames: 185, timestop: [0, 157], motionStop: [0, 185], castPriority: 10,
  cooldown: 60 * 20,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 185, mv: 63620 + 2983 * 15, concerto: 2000, offtune: 48000 + 3200 * 15 }], 
  resetEnergy: true,
});

// --- Primordial Chi Spiral: the hold at 120 Chi that starts Zhoutian Progress, spending every
//     point (the cap as its delta, clamped to it first so it lands on 0) — no hit of its own. The
//     progress is its own casts: Chi Strikes (two ahead of each Shock — see the file header) and
//     the Minor, Major Inner and Major Outer Shocks; the last leaves the Zhoutian 3 shield, the
//     marker every shield-reading gear watches, and its 6s heal the healing one.
const FHA = jianxinAction("Forte Heavy - Primordial Chi Spiral", { minForte1: 120,
  animFrames: 60, castPriority: 6,
  node: Node.Forte, cast: Cast.Heavy, castForte1: -120,
  updateBuffs: () => {
    // a fresh Progress: the old one's stage markers go with it
    revokeCurrent(ZHOUTIAN_PROGRESS);
    applyCurrent(ZHOUTIAN_PROGRESS, 1);
  },
});
const ChiStrike = jianxinAction("Forte Heavy - Zhoutian: Chi Strike", { castPriority: 6, requireBuff: ZHOUTIAN_PROGRESS,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, 
  bullets: [{ hitFrame: 0, mv: 2486, energy: 30, offtune: 2000 }] });
const MinorShock = jianxinAction("Forte Heavy - Minor Zhoutian: Shock", { castPriority: 6, requireBuff: ZHOUTIAN_PROGRESS,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, 
  bullets: [{ hitFrame: 0, mv: 13917, energy: 200, offtune: 3920 }], castConcerto: 500,
  updateBuffs: () => applyCurrent(MINOR_ZHOUTIAN, 1),
});
const InnerShock = jianxinAction("Forte Heavy - Major Zhoutian (Inner): Shock", {
  animFrames: 132, castPriority: 6, requireBuff: MINOR_ZHOUTIAN,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy,
   bullets: [{ hitFrame: 132, mv: 37774, energy: 800, offtune: 5120 }], castConcerto: 1800,
  updateBuffs: () => applyCurrent(MAJOR_INNER_ZHOUTIAN, 1),
  });
const OuterShock = jianxinAction("Forte Heavy - Major Zhoutian (Outer): Shock", { castPriority: 6,
  requireBuff: MAJOR_INNER_ZHOUTIAN, updateBuffs: () => revokeCurrent(ZHOUTIAN_PROGRESS),
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 51691, energy: 1561, offtune: 7360 }], castConcerto: 2300, 
  updateDebuffs: () => {
    gainShield();
    applyCurrent(HEALS, 1);
  },
});

/** Releasing early: Pushing Punch before Minor Zhoutian, Yielding Pull after it — the Chi is
 *  already spent by the hold, so each is just its hit, and it leaves the shield of the stage
 *  reached (the same marker, and the same 6s heal). */
const PushingPunch = jianxinAction("Forte Heavy - Pushing Punch", {
  animFrames: 60, castPriority: 6, requireBuff: ZHOUTIAN_PROGRESS,
  updateBuffs: () => {
    revokeCurrent(ZHOUTIAN_PROGRESS);
    if (isHeld(S6)) applyCurrent(SPECIAL_CHI_COUNTER_READY, 1);
  },
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 60, mv: 24852, energy: 800, offtune: 5280 }], castConcerto: 1000, 
  updateDebuffs: () => {
    gainShield();
    applyCurrent(HEALS, 1);
  },
});
const YieldingPull = jianxinAction("Forte Heavy - Yielding Pull", { castPriority: 6,
  requireBuff: MINOR_ZHOUTIAN, updateBuffs: () => revokeCurrent(ZHOUTIAN_PROGRESS),
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 21870, energy: 300, offtune: 7200 }], castConcerto: 700, 
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
  FHA, MinorShock, ChiStrike, YieldingPull // missing chi strikes
]);
const ZHOUTIAN_3 = new ActionGroup("Forte Heavy - Primordial Chi Spiral (Zhoutian 3)", [
  FHA, MinorShock, ChiStrike, InnerShock, ChiStrike, YieldingPull, // missing chi strikes
]);
const ZHOUTIAN_4 = new ActionGroup("Forte Heavy - Primordial Chi Spiral (Zhoutian 4)", [
  FHA, MinorShock, ChiStrike, InnerShock, ChiStrike, OuterShock, // missing chi strikes
]);

// PLACEHOLDER FRAMES
const Intro = jianxinAction("Intro - Essence of Tao", { animFrames: 60, castPriority: 11, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 60, mv: 3380, energy: 200, offtune: 2667 },
    { hitFrame: 60, mv: 3380, energy: 200, offtune: 2667 },
    { hitFrame: 60, mv: 3380, energy: 200, offtune: 2667 },
    { hitFrame: 60, mv: 6760, energy: 400, offtune: 1600, forte1: 40 },
  ], castConcerto: 1000});
const Outro = jianxinAction("Outro - Transcendence", {
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => queueQTE(TRANSCENDENCE),
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
  updateDebuffs: () => { if (casting(Cast.Basic)) addGain({ forte1: currentHit().forte1 }); },
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
const SpecialChiCounter = jianxinAction("Skill - Special Chi Counter", { castPriority: 4,
  requireBuff: SPECIAL_CHI_COUNTER_READY, updateBuffs: () => revokeCurrent(SPECIAL_CHI_COUNTER_READY),
  node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 55667, energy: 400, concerto: 1400, offtune: 5200 }], 
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
  outro: Outro,
  maxEnergy: 15000,
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
  INTRO, ChiParry, ChiParry, Liberation, ZHOUTIAN_4, ECHO.instaSwap(), OUTRO,
]);

export const JIANXIN = new Loadout({
  resonator: JIANXIN_RESONATOR,
  weapons: [MARCATO[4]!],
  echoLoadouts: [new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.Aero3, Mainstat.ATK3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill, Substat.Heavy),
  rotation: { 2: JX_ROTATION_S2 

},
  sequences: [S1, S2, S3, S4, S5, S6],
});
