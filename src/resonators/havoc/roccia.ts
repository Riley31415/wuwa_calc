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
 * Numbers from nanoka.cc (character 1606) for MV. Energy/concerto/offtune/Imagination deltas
 * aren't exposed on nanoka's own page, so those come off the migrated (old-engine) sheet. Dodge
 * Counter has no sheet row at all, so it's still bare (nanoka's own MV only).
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
  queueOutro,
  queueOn,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, NOINTRO, ECHO, START_3, INTRO } from "../../engine/rotation.js";
import { TRAGICOMEDY } from "../../weapons/gauntlet.js";
import { NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import { NM_HERON, MIDNIGHT_VEIL_5PC } from "../../echoes/rinascita.js";
import { MOONLIT_CLOUDS_5PC, HERON, BELL_BORNE_GEOCHELONE, HAVOC_ECLIPSE_5PC, NM_CROWNLESS } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function rocciaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter (Pero, Easy)
const BA1 = rocciaAction("Basic - Pero, Easy 1", { animFrames: 29, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 73.18, energy: 1.09, concerto: 3.47, offtune: 3464, forte1: 19 });
// PLACEHOLDER FRAMES
const BA2 = rocciaAction("Basic - Pero, Easy 2", { animFrames: 60, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 15, mv: 38.14, energy: 0.57, concerto: 1.81, offtune: 1806 },
    { hitFrame: 15, mv: 38.14, energy: 0.57, concerto: 1.81, offtune: 1806 },
    { hitFrame: 15, mv: 38.14, energy: 0.57, concerto: 1.81, offtune: 1806, forte1: 33 },
  ]});
// PLACEHOLDER FRAMES
const BA3 = rocciaAction("Basic - Pero, Easy 3", { animFrames: 60, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 60, mv: 33.8, energy: 0.5, concerto: 1.6, offtune: 1600 },
    { hitFrame: 60, mv: 33.8, energy: 0.5, concerto: 1.6, offtune: 1600 },
    { hitFrame: 60, mv: 101.4, energy: 1.5, concerto: 4.8, offtune: 4800, forte1: 49 },
  ]});
// PLACEHOLDER FRAMES
const BA4 = rocciaAction("Basic - Pero, Easy 4", { animFrames: 76, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 39, mv: 104.19, energy: 1.55, concerto: 4.94, offtune: 4932 },
    { hitFrame: 39, mv: 104.19, energy: 1.55, concerto: 4.94, offtune: 4932, forte1: 100 },
  ]});
const MA = rocciaAction("Mid-air - Pero, Easy Plunge", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 104.78, energy: 1.55, concerto: 4.96, offtune: 4960, forte1: 38 });
// PLACEHOLDER FRAMES
const DC = rocciaAction("Dodge Counter - Pero, Easy", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 68.9, energy: 0.52, concerto: 1.67, offtune: 1662 },
    { hitFrame: 0, mv: 68.9, energy: 0.52, concerto: 1.67, offtune: 1662 },
    { hitFrame: 0, mv: 68.9, energy: 0.52, concerto: 1.67, offtune: 1662 },
  ], castConcerto: 10});

// hitting with 100+ Imagination also launches Beyond Imagination — a second way in besides Skill
const HA = rocciaAction("Heavy - Pero, Easy", { animFrames: 152, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, mv: 168.99, energy: 2.50, concerto: 8, offtune: 8000, forte1: 100 });

// pulls in targets and always launches Beyond Imagination
// PLACEHOLDER FRAMES
const Skill = rocciaAction("Skill - Acrobatic Trick", { animFrames: 90, cooldown: 60 * 10, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 66, mv: 61.47, energy: 1.75, offtune: 1374 },
    { hitFrame: 66, mv: 61.47, energy: 1.75, offtune: 1374 },
    { hitFrame: 66, mv: 61.47, energy: 1.75, offtune: 1374 },
    { hitFrame: 66, mv: 61.47, energy: 1.75, offtune: 1374 },
    { hitFrame: 66, mv: 61.47, energy: 1.75, offtune: 1374 },
    { hitFrame: 66, mv: 61.47, energy: 1.75, offtune: 1374 },
    { hitFrame: 66, mv: 61.47, energy: 1.75, offtune: 1374 },
    { hitFrame: 66, mv: 61.47, energy: 1.75, offtune: 1374, forte1: 100 },
  ], castConcerto: 20});

// Real Fantasy: 100 Imagination is spent once, on the first hit, not a per-stage cost
const FBA1 = rocciaAction("Forte Basic - Real Fantasy 1", { animFrames: 51, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, mv: 322.08, energy: 8, castConcerto: 10, offtune: 7200, castForte1: -100});
const FBA2 = rocciaAction("Forte Basic - Real Fantasy 2", { animFrames: 62, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, mv: 339.97, energy: 8, castConcerto: 16, offtune: 7600, castForte1: -100});
const FBA3 = rocciaAction("Forte Basic - Real Fantasy 3", { animFrames: 42, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, mv: 357.86, energy: 8, concerto: 25, offtune: 8000, castForte1: -100});

/** S6: the Basic in Beyond Imagination after Stage 3 lands within 12s of the Liberation — 100% of
 *  Stage 3's DMG, Heavy DMG, its own nanoka row (357.86%, energy 1.2, off-tune 8000; no Concerto
 *  Regen row, so none), no Imagination spent — she relaunches off every landing. */
const RealityRecreation = rocciaAction("Basic - Reality Recreation (S6)", { animFrames: 42, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, mv: 357.86, energy: 1.2, offtune: 8000 });

// Resonance Cost 125 (maxEnergy below) is nanoka's own declared cost, not the migrated sheet's 0
// PLACEHOLDER FRAMES
const Liberation = rocciaAction("Liberation - Commedia Improvviso!", {
  animFrames: 60, timestop: 60, motionStop: 60, prioFrames: 60,
  cooldown: 60 * 20,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Heavy, bullets: [
    { hitFrame: 60, mv: 278.34, offtune: 32000 },
    { hitFrame: 60, mv: 278.34, offtune: 32000 },
    { hitFrame: 60, mv: 278.34, offtune: 32000 },
  ], castConcerto: 20, resetEnergy: true,
  updateBuffs: () => applyTeam(COMMEDIA_TEAM_ATK),
});

const Intro = rocciaAction("Intro - Pero, Help", { animFrames: 56, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, mv: 168.99, energy: 10, concerto: 10, offtune: 10824, forte1: 100 });
const Outro = rocciaAction("Outro - Applause, Please!", {
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => queueOutro(APPLAUSE_HANDOFF),
});

/** 100 flat Havoc DMG, Utility damage type, DMG-bonus-immune (Scaling.Fixed reads no stat/buff).
 *  Queued once by ROCCIA_RESONATOR's own kit on the recipient's own next Intro — see updateGlobal() below. */
const MAGIC_BOX = rocciaAction("Utility - Super Attractive Magic Box", {
  cast: Cast.Echo, type: Type.Utility, scaling: Scaling.Fixed, mv: 100,
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
    if (casting(Cast.Intro) && acting.isHeld(APPLAUSE_HANDOFF)) queueOn(acting.resonator!, MAGIC_BOX);
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
  maxEnergy: 125,
  maxForte1: 300,

  stats: [[Stat.BaseHp, 12250], [Stat.BaseAtk, 375], [Stat.BaseDef, 1197.7756]],
});

/* --------------------------------------------------------------------------------- sequences */

function realFantasy(): boolean { return runningAction(FBA1) || runningAction(FBA2) || runningAction(FBA3); }

/** S1: Acrobatic Trick banks 100 more Imagination and 10 Concerto. The Imagination is capped away
 *  in this line (Intro + Stage 4 + Skill already fill the 300); the Concerto counts. */
const RC_S1 = new Sequence({
  name: "Roccia S1: When Shadows Engulf the Hull",
  applyStats: () => { if (runningAction(Skill)) { addStat(Stat.AddForte1, 100); addStat(Stat.AddConcerto, 10); } },
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
  applyStats: () => { if (realFantasy() || runningAction(RealityRecreation)) addStat(Stat.MulMv, 60); },
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
    if (runningAction(HA)) addStat(Stat.MulMv, 80);
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

const RC_ROTATION = new Rotation([
  NOINTRO,
  BA1234.cancel(), 
  Liberation, 
  Skill.dodgeCancel(), FBA123,
  ECHO.instaSwap(), 
  Outro,

  INTRO, BA4.cancel(), 
  Liberation, 
  Skill.dodgeCancel(), FBA123,
  ECHO.instaSwap(), 
  Outro,
]);

const RC_ROTATION_S1 = new Rotation([
  NOINTRO,
  BA123,
  Skill.dodgeCancel(), FBA123,
  Liberation, ECHO.instaSwap(), 
  Outro,

  INTRO,
  Skill.dodgeCancel(), FBA123,
  Liberation, ECHO.instaSwap(), 
  Outro,
]);

// S6: three Reality Recreations in what the Liberation's 12s leaves after the Skill and the chain
const RC_ROTATION_S6_MDPS = new Rotation([
  INTRO, BA4.cancel(), Liberation,
  Skill.dodgeCancel(), FBA123,
  RealityRecreation, RealityRecreation, RealityRecreation,
  RealityRecreation, RealityRecreation, RealityRecreation,
  RealityRecreation, RealityRecreation, RealityRecreation,
  Outro,
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
  resonator: ROCCIA_RESONATOR,
  weapons: [TRAGICOMEDY, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [
    new EchoLoadout(NM_HERON, MIDNIGHT_VEIL_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
  rotation: { 0: RC_ROTATION, 1: RC_ROTATION_S1 },
  sequences: RC_SEQUENCES,
});

export const ROCCIA_MDPS = new Loadout({
  resonator: ROCCIA_RESONATOR,
  weapons: [TRAGICOMEDY, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [
    new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
  rotation: { 6: RC_ROTATION_S6_MDPS },
  sequences: RC_SEQUENCES,
});

