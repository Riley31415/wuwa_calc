/**
 * Roccia, ported to the new engine — sequence-0 core loop, a limited 5-star
 * (`Tier.Limited`). A havoc gauntlets support/sub-DPS. Imagination (forte1, max 300) builds
 * off normal attack hits; at 100+ a held Heavy Attack — or Resonance Skill: Acrobatic Trick,
 * unconditionally — launches her into Beyond Imagination, unlocking Basic Attack: Real Fantasy
 * (a 3-stage Heavy Attack DMG combo, spending the 100 Imagination on its own first hit).
 * Liberation: Commedia Improvviso! scales the whole team's ATK off her own Crit Rate past 50%.
 *
 * Super Attractive Magic Box (Inherent Skill): her Outro swaps the incoming resonator's own Echo
 * Skill for a flat, DMG-bonus-immune "Magic Box" hit for 14s. Full move-replacement needs
 * per-resonator state this engine doesn't have, so it's simplified to one queued cast on the
 * recipient's own next Intro instead, through ROCCIA_RESONATOR's own updateGlobal() below.
 *
 * MVs from nanoka.cc (character 1606); frames, energy/concerto/off-tune and Imagination from
 * wuwalab, cross-checked against encore.moe's per-hit rows.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence, matrix } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  casting,
  onAction,
  runningAction,
  currentTeam,
  addStat,
  frozenStacks,
  queueQTE,
  queueOn,
  addGain,
  forte1,
  isHeld,
  revokeCurrent,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, NOINTRO, ECHO, INTRO, OUTRO } from "../../engine/rotation.js";
import { TRAGICOMEDY } from "../../weapons/gauntlet.js";
import { NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import { NM_HERON, MIDNIGHT_VEIL_5PC } from "../../echoes/rinascita.js";
import { MOONLIT_CLOUDS_5PC, HERON, BELL_BORNE_GEOCHELONE, HAVOC_ECLIPSE_5PC, NM_CROWNLESS } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { tuneBreak } from "../../shared/tunebreak.js";

/* ----------------------------------------------------------------------------------- actions */

function rocciaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

/** Beyond Imagination: airborne, launched by Acrobatic Trick, a Heavy hit at 100+ Imagination or a
 *  relaunch; every Real Fantasy hit spends 100 and lands her, relaunching only on 100+ left. */
const BEYOND_IMAGINATION = new Buff({ name: "Roccia: Beyond Imagination", lostOnSwap: true });

// --- basics, mid-air, dodge counter (Pero, Easy)
const BA1 = rocciaAction("Basic - Pero, Easy 1", { animFrames: 27, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 10, mv: 7318, energy: 109, concerto: 347, offtune: 3464, forte1: 19 }] });
const BA2 = rocciaAction("Basic - Pero, Easy 2", { animFrames: 45, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 3814, energy: 57, concerto: 181, offtune: 1806, forte1: 11 },
    { hitFrame: 14, mv: 3814, energy: 57, concerto: 181, offtune: 1806, forte1: 11 },
    { hitFrame: 18, mv: 3814, energy: 57, concerto: 181, offtune: 1806, forte1: 11 },
  ]});
const BA3 = rocciaAction("Basic - Pero, Easy 3", { animFrames: 64, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 9, mv: 3380, energy: 50, concerto: 160, offtune: 1600, forte1: 10 },
    { hitFrame: 22, mv: 3380, energy: 50, concerto: 160, offtune: 1600, forte1: 10 },
    { hitFrame: 43, mv: 10140, energy: 150, concerto: 480, offtune: 4800, forte1: 29 },
  ]});
const BA4 = rocciaAction("Basic - Pero, Easy 4", { animFrames: 87, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 24, mv: 10419, energy: 155, concerto: 494, offtune: 4932, forte1: 50 },
    { hitFrame: 34, mv: 10419, energy: 155, concerto: 494, offtune: 4932, forte1: 50 },
  ]});
const MA = rocciaAction("Mid-air - Pero, Easy Plunge", { animFrames: 66, animPriority: { 66: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 36, mv: 10478, energy: 155, concerto: 496, offtune: 4960, forte1: 38 }] });
const DC = rocciaAction("Dodge Counter - Pero, Easy", { animFrames: 45, castPriority: 2, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 6890, energy: 52, concerto: 167, offtune: 1662, forte1: 13 },
    { hitFrame: 14, mv: 6890, energy: 52, concerto: 167, offtune: 1662, forte1: 13 },
    { hitFrame: 18, mv: 6890, energy: 52, concerto: 167, offtune: 1662, forte1: 13 },
  ], castConcerto: 1000});

// the held Heavy as wuwalab plays it: the press, a 12f loop per beat held (+19 Imagination each),
// and the release — which, at 100+ Imagination, launches Beyond Imagination at 30f (End Success)
const HA = rocciaAction("Heavy - Pero, Easy", { animFrames: 16, castPriority: 2, node: Node.Normal, cast: Cast.Heavy });
const HALoop = rocciaAction("Heavy - Pero, Easy (Loop)", { animFrames: 12, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, bullets: [{ hitFrame: 1, element: null, type: null, subtype: null, forte1: 19 }] });
const HAEnd = rocciaAction("Heavy - Pero, Easy (End)", { animFrames: 46, animPriority: { 14: 6 }, castPriority: 4, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 18, mv: 16899, energy: 250, concerto: 800, offtune: 8000, forte1: 100 },
    // the release's own +100 is banked by now, so 100+ at release reads 200+ here
    { hitFrame: 30, element: null, type: null, subtype: null, updateDebuffs: () => {
      if (forte1() >= 200) applyCurrent(BEYOND_IMAGINATION, 1);
    } },
  ] });

// pulls in targets and always launches Beyond Imagination
const Skill = rocciaAction("Skill - Acrobatic Trick", { animFrames: 95, animPriority: { 26: 6, 100: 4 }, castPriority: 4, cooldown: 60 * 10, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 23, mv: 6147, energy: 175, offtune: 1374 },
    { hitFrame: 31, mv: 6147, energy: 175, offtune: 1374 },
    { hitFrame: 38, mv: 6147, energy: 175, offtune: 1374 },
    { hitFrame: 46, mv: 6147, energy: 175, offtune: 1374 },
    { hitFrame: 54, mv: 6147, energy: 175, offtune: 1374 },
    { hitFrame: 62, mv: 6147, energy: 175, offtune: 1374 },
    { hitFrame: 70, mv: 6147, energy: 175, offtune: 1374 },
    { hitFrame: 77, mv: 6147, energy: 175, offtune: 1374 },
  ], castConcerto: 2000, castForte1: 100,
  updateBuffs: () => applyCurrent(BEYOND_IMAGINATION, 1),
});

// Real Fantasy: each stage is cast in Beyond Imagination on 100+ Imagination and its hit spends 100
// of it and ends the state; Stages 1-2 relaunch after with 100+ left, Stage 3 only in S6's window
const landed = (): void => revokeCurrent(BEYOND_IMAGINATION);
const relaunchOnImagination = (): void => {
  if (forte1() >= 100) applyCurrent(BEYOND_IMAGINATION, 1);
};
const relaunchInGoldenWings = (): void => {
  if (isHeld(GOLDEN_WINGS)) applyCurrent(BEYOND_IMAGINATION, 1);
};
const FBA1 = rocciaAction("Forte Basic - Real Fantasy 1", { animFrames: 63, animPriority: { 69: 5 }, castPriority: 6, requireBuff: BEYOND_IMAGINATION, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 35, mv: 32208, energy: 800, offtune: 7200, forte1: -100, updateDebuffs: landed },
    { hitFrame: 54, element: null, type: null, subtype: null, updateDebuffs: relaunchOnImagination },
  ], castConcerto: 1000, minForte1: 100 });
const FBA2 = rocciaAction("Forte Basic - Real Fantasy 2", { animFrames: 63, animPriority: { 69: 5 }, castPriority: 6, requireBuff: BEYOND_IMAGINATION, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 34, mv: 33997, energy: 800, offtune: 7600, forte1: -100, updateDebuffs: landed },
    { hitFrame: 52, element: null, type: null, subtype: null, updateDebuffs: relaunchOnImagination },
  ], castConcerto: 1600, minForte1: 100 });
const FBA3 = rocciaAction("Forte Basic - Real Fantasy 3", { animFrames: 86, animPriority: { 43: 2 }, castPriority: 6, requireBuff: BEYOND_IMAGINATION, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [{ hitFrame: 34, mv: 35786, energy: 800, offtune: 8000, forte1: -100, updateDebuffs: landed }], castConcerto: 2500, minForte1: 100 });
/** S6: the Stage 3 that relaunches her into Beyond Imagination for Reality Recreation (wuwalab's Success row). */
const FBA3Success = FBA3.variant("Forte Basic - Real Fantasy 3 (Success)", { animFrames: 66, animPriority: { 72: 5 }, castPriority: 6, bullets: [
    ...FBA3.def.bullets!,
    { hitFrame: 56, element: null, type: null, subtype: null, updateDebuffs: relaunchInGoldenWings },
  ] });
/** Stages 1-2 landing under 100 Imagination: no relaunch, the chain ends on the ground (wuwalab's Fail rows). */
const FBA1Fail = FBA1.variant("Forte Basic - Real Fantasy 1 (Fail)", { animFrames: 83, animPriority: { 39: 2 }, castPriority: 6, bullets: FBA1.def.bullets!.slice(0, 1) });
const FBA2Fail = FBA2.variant("Forte Basic - Real Fantasy 2 (Fail)", { animFrames: 83, animPriority: { 39: 2 }, castPriority: 6, bullets: FBA2.def.bullets!.slice(0, 1) });

/** S6: the Basic in Beyond Imagination after Stage 3 lands within 12s of the Liberation — 100% of
 *  Stage 3's DMG, Heavy DMG, its own nanoka row (357.86%, energy 1.2, off-tune 8000; no Concerto
 *  Regen row, so none), no Imagination spent — she relaunches off every landing. */
const RealityRecreation = rocciaAction("Basic - Reality Recreation (S6)", { animFrames: 68, animPriority: { 72: 5 }, castPriority: 6, requireBuff: BEYOND_IMAGINATION, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 34, mv: 35786, energy: 120, offtune: 8000, updateDebuffs: landed },
    { hitFrame: 55, element: null, type: null, subtype: null, updateDebuffs: relaunchInGoldenWings },
  ] });
/** The last one: cast inside the S6 window but landing after it, so no relaunch (wuwalab's Fail row). */
const RealityRecreationFail = RealityRecreation.variant("Basic - Reality Recreation (S6 Fail)", { animFrames: 86, animPriority: { 43: 2 }, castPriority: 6, bullets: RealityRecreation.def.bullets!.slice(0, 1) });

// Resonance Cost 125 (maxEnergy below) is nanoka's own declared cost, not the migrated sheet's 0
const Liberation = rocciaAction("Liberation - Commedia Improvviso!", {
  animFrames: 200, castPriority: 10, timestop: [0, 200], motionStop: [0, 112],
  cooldown: 60 * 20,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Heavy, bullets: [
    { hitFrame: 116, mv: 27834, offtune: 32000 },
    { hitFrame: 125, commitFrame: 116, mv: 27834, offtune: 32000 },
    { hitFrame: 134, commitFrame: 116, mv: 27834, offtune: 32000 },
  ], castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => applyTeam(COMMEDIA_TEAM_ATK),
});

const Intro = rocciaAction("Intro - Pero, Help", { qteFrames: 48, animFrames: 68, noSwapFrames: 84, animPriority: { 68: 2 }, castPriority: 11, motionStop: [6, 32], node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 52, mv: 16899, energy: 1000, offtune: 10824 }], castConcerto: 1000, castForte1: 100 });
const Outro = rocciaAction("Outro - Applause, Please!", {
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => queueQTE(APPLAUSE_HANDOFF),
});

/** 100 flat Havoc DMG, Utility damage type, DMG-bonus-immune (Scaling.Fixed reads no stat/buff).
 *  Queued once by ROCCIA_RESONATOR's own kit on the recipient's own next Intro — see updateGlobal() below. */
const MAGIC_BOX = rocciaAction("Utility - Super Attractive Magic Box", { castPriority: 6,
  cast: Cast.Echo, type: Type.Utility, scaling: Scaling.Fixed, bullets: [{ hitFrame: 0, mv: 10000 }],
});

/* ------------------------------------------------------------------------------------ buffs */

/** Immersive Performance (Inherent Skill): +20% ATK for 12s on Resonance Skill or the base Heavy
 *  Attack specifically — not Real Fantasy, a Basic Attack-button press despite Heavy Attack DMG. */
const IMMERSIVE_PERFORMANCE = new Buff({
  name: "Inherent: Immersive Performance",
  duration: 60 * 12,
  stats: [[Stat.BonusAtk, 20]],
});
const RC_INHERENT_1 = new Inherent({
  name: "Inherent: Immersive Performance",
  updateBuffs: () => { if (casting(Cast.Skill) || casting(Cast.Heavy)) applyCurrent(IMMERSIVE_PERFORMANCE, 1); },
});

/** 1 flat ATK per 0.1% Crit Rate held over 50%, capped at 200 — read live at the Liberation cast,
 *  replacing rather than stacking. 30s, so permanent uptime once granted. */
const COMMEDIA_TEAM_ATK = new Buff({
  name: "Roccia: Commedia Improvviso!",
  duration: 60 * 30,
  stats: [[Stat.FlatAtk, 200]],
});

/** The window her outro hands the incoming resonator — just the stat grant, the Magic Box
 *  follow-up is queued separately (see RC_INHERENT_2 below). */
const APPLAUSE_HANDOFF = new Buff({
  name: "Roccia: Outro",
  duration: 60 * 14,
  stats: [[Stat.Amp, 20, Attribute.Havoc], [Stat.Amp, 25, Type.Basic]],
  lostOnSwap: true,
});

/** Runs through updateGlobal() so it fires on the recipient's own turn, not Roccia's — `currentSlot`
 *  is forced to her own holder, so the real actor comes off currentTeam().slot, and queueOn() (not
 *  queue()) lands the follow-up on them. */
const RC_INHERENT_2 = new Inherent({
  name: "Inherent: Super Attractive Magic Box",
  updateGlobal: () => {
    const acting = currentTeam().slot;
    // the handoff itself lands on the Intro's QTE frame, after this cast: still on its way here
    const handed = acting.isHeld(APPLAUSE_HANDOFF) || currentTeam().qteQueue.includes(APPLAUSE_HANDOFF);
    if (casting(Cast.Intro) && handed) queueOn(acting.resonator!, MAGIC_BOX);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const ROCCIA_TALENTS = new Talent({
  name: "Roccia: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritDmg, 16]],
});

const ROCCIA_MATRIX = matrix("Roccia", 20, {
  updateBuffs: () => { if (casting(Cast.Liberation)) applyTeam(ROCCIA_MATRIX_TEAM); },
});

const ROCCIA_RESONATOR = new Resonator({
  name: "Roccia",
  matrix: ROCCIA_MATRIX,
  talent: ROCCIA_TALENTS,
  inherent1: RC_INHERENT_1,
  inherent2: RC_INHERENT_2,
  element: Attribute.Havoc,
  weapon: WeaponType.Gauntlets,
  color: "#9634b2",
  intro: Intro,
  outro: Outro,
  maxEnergy: 12500,
  maxForte1: 300,
  // her Tune Break Skill runs 2 frames past the gauntlet default
  tuneBreak: tuneBreak(94, [0, 94], [0, 70], [[72, 160000]]),

  stats: [[Stat.BaseHp, 12250], [Stat.BaseAtk, 375], [Stat.BaseDef, 1197.7756]],
});

/* --------------------------------------------------------------------------------- sequences */

function realFantasy(): boolean {
  return runningAction(FBA1) || runningAction(FBA2) || runningAction(FBA3) || runningAction(FBA3Success) || runningAction(FBA1Fail) || runningAction(FBA2Fail);
}

/** S1: Acrobatic Trick banks 100 more Imagination and 10 Concerto. The Imagination is capped away
 *  in this line (Intro + Stage 4 + Skill already fill the 300); the Concerto counts. */
const RC_S1 = new Sequence({
  name: "Roccia S1: When Shadows Engulf the Hull",
  updateBuffs: () => {
    if (runningAction(Skill)) addGain({ forte1: 100, concerto: 1000 });
  },
});

/** S2: +10% Havoc DMG Bonus to the team a Real Fantasy cast, three stacks, and 10% more at the
 *  cap — 30s, so permanent. */
const LUCEANITE_GLEAMS = new Buff({
  name: "Roccia S2: When the Luceanite Gleams", maxStacks: 3, duration: 60 * 30,
  applyStats: () => { const n = frozenStacks(); addStat(Stat.DmgBonus, 10 * n + (n >= 3 ? 10 : 0), Attribute.Havoc); },
});
const RC_S2 = new Sequence({
  name: "Roccia S2: When the Luceanite Gleams",
  grants: [{ on: () => realFantasy(), buff: LUCEANITE_GLEAMS, to: BuffTarget.Team }],
});

/** S3: +10% Crit. Rate and +30% Crit. DMG for 15s off Pero, Help — until her Outro. */
const HEART_SEES = new Buff({
  name: "Roccia S3: When the Heart Sees and Hands Feel",
  duration: 60 * 15,
  stats: [[Stat.CritRate, 10], [Stat.CritDmg, 30]],
});
const RC_S3 = new Sequence({
  name: "Roccia S3: When the Heart Sees and Hands Feel",
  grants: [{ on: onAction(Intro), buff: HEART_SEES }],
});

/** S4: Real Fantasy at x1.6 for 12s off Acrobatic Trick — nanoka's second rows (515.32/543.95/
 *  572.58%), multiplicative, and Reality Recreation has the same x1.6 twin row — until her Outro. */
const WONDERS_GATHER = new Buff({
  name: "Roccia S4: When Wonders Gather in the Box",
  duration: 60 * 12,
  applyStats: () => { if (realFantasy() || runningAction(RealityRecreation) || runningAction(RealityRecreationFail)) addStat(Stat.MulMv, 60); },
});
const RC_S4 = new Sequence({
  name: "Roccia S4: When Wonders Gather in the Box",
  grants: [{ on: onAction(Skill), buff: WONDERS_GATHER }],
});

/** S5: the Liberation at x1.2 (row 334.01%) and Heavy Attack Pero, Easy at x1.8 (row 304.18%) —
 *  both multiplicative. Real Fantasy deals Heavy DMG but is a Basic Attack, and has no such row. */
const RC_S5 = new Sequence({
  name: "Roccia S5: When Dreams Are Reborn on Stage",
  applyStats: () => {
    if (runningAction(Liberation)) addStat(Stat.MulMv, 20);
    if (runningAction(HAEnd)) addStat(Stat.MulMv, 80);
  },
});

/** S6: for 12s off the Liberation — until her Outro — Real Fantasy ignores 60% DEF (a 2.0 kit,
 *  the old ignore; the text names Real Fantasy alone, so Reality Recreation gets none) and Stage 3
 *  opens the Reality Recreation loop the S6 rotation presses. */
const GOLDEN_WINGS = new Buff({
  name: "Roccia S6: When the Golden Wings Fly",
  duration: 60 * 12,
  applyStats: () => { if (realFantasy()) addStat(Stat.DefIgnoreOld, 60); },
});
const RC_S6 = new Sequence({
  name: "Roccia S6: When the Golden Wings Fly",
  grants: [{ on: onAction(Liberation), buff: GOLDEN_WINGS }],
});

const RC_SEQUENCES = [RC_S1, RC_S2, RC_S3, RC_S4, RC_S5, RC_S6];

/* ---------------------------------------------------------------------------------- rotation */

const BA123 = new ActionGroup("Basic - Pero, Easy 123", [BA1, BA2, BA3]);
const BA1234 = new ActionGroup("Basic - Pero, Easy 1234", [BA1, BA2, BA3, BA4]);
const FBA123 = new ActionGroup("Forte Basic - Real Fantasy 123", [FBA1, FBA2, FBA3]);
const FBA123Success = new ActionGroup("Forte Basic - Real Fantasy 123 (Success)", [FBA1, FBA2, FBA3Success]);

const RC_ROTATION = new Rotation([
  NOINTRO,
  BA1234.cancel(), 
  Liberation, 
  Skill.instaDodge(), FBA123,
  ECHO.instaSwap(), 
  OUTRO,

  INTRO, BA4.cancel(), 
  Liberation, 
  Skill.instaDodge(), FBA123,
  ECHO.instaSwap(), 
  OUTRO,
]);

const RC_ROTATION_S1 = new Rotation([
  NOINTRO,
  BA123,
  Skill.instaDodge(), FBA123,
  Liberation, ECHO.instaSwap(), 
  OUTRO,

  INTRO,
  Skill.instaDodge(), FBA123,
  Liberation, ECHO.instaSwap(), 
  OUTRO,
]);

// S6: six Reality Recreations land inside the Liberation's 12s after the Skill and the chain; the
// seventh is cast in it but lands after, so it relaunches nothing and ends the loop
const RC_ROTATION_S6_MDPS = new Rotation([
  INTRO, BA4.cancel(), Liberation,
  Skill.instaDodge(), FBA123Success,
  RealityRecreation, RealityRecreation, RealityRecreation,
  RealityRecreation, RealityRecreation, RealityRecreation,
  RealityRecreationFail,
  OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, and two real
// echo choices — Midnight Veil or Moonlit Clouds (same mainslot either way) — both automatically
// iterated (see gear.ts's own EchoLoadout)
/** Matrix: her Liberation grants the team +20% Havoc DMG Bonus for 30s — permanent. */
const ROCCIA_MATRIX_TEAM = new Buff({
  name: "Roccia: Matrix Buff", duration: 60 * 30,
  stats: [[Stat.DmgBonus, 20, Attribute.Havoc]],
});

export const ROCCIA = new Loadout({
  minCritRate: 70,
  resonator: ROCCIA_RESONATOR,
  weapons: [TRAGICOMEDY, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [
    new EchoLoadout(NM_HERON, MIDNIGHT_VEIL_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill, Substat.Basic),
  rotation: { 0: RC_ROTATION, 1: RC_ROTATION_S1 },
  sequences: RC_SEQUENCES,
});

export const ROCCIA_MDPS = new Loadout({
  minCritRate: 70,
  resonator: ROCCIA_RESONATOR,
  weapons: [TRAGICOMEDY, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [
    new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill, Substat.Basic),
  rotation: { 6: RC_ROTATION_S6_MDPS },
  sequences: RC_SEQUENCES,
});

