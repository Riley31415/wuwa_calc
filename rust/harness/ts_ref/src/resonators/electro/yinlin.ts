/**
 * Yinlin, ported to the new engine — Sequences 1-6 in their own block below, a limited 5-star
 * (`Tier.Limited`). An electro rectifier off-field Coordinated Attack sub-DPS, built around
 * her marks, all modelled as real enemy debuffs:
 *  - Sinner's Mark: applied on hit by her Basic Attacks (dodge counter included), Liberation and
 *    Intro; removed when she switches out (any inactive action of hers).
 *  - Execution Mode: opened by Magnetic Roar, 4 charges — each Basic/Dodge Counter cast against
 *    a Sinner-marked target consumes one and fires an Electromagnetic Blast on her own slot.
 *  - Punishment Mark: Chameleon Cipher hitting a Sinner-marked target upgrades the mark — 18
 *    stacks that are its 18s at the 1/s ceiling (`coordinatedBuff`): every active, non-triggered
 *    action at the marked target calls down one real Judgment Strike (Coordinated, Resonance
 *    Skill DMG) on her own slot and spends a stack.
 * Deadly Focus's Lightning Execution bonus is likewise gated on the target actually holding
 * Sinner's Mark rather than assumed.
 *
 * MV/energy/concerto/offtune resolved off nanoka.cc's own level-10 damage table (character
 * 1302); concerto and energy per action come from the user's sheet data. Judgement Points run on
 * the kit's own 0-100 scale, so Chameleon Cipher spends the whole 100 — the sheet's own figures
 * are that scale's two-fifths, and are carried here at their full size.
 *
 * Her two Inherent Skills, off the page's own "INHERENT SKILLS" section:
 *  - Pain Immersion: +15% Crit Rate for 5s after Magnetic Roar.
 *  - Deadly Focus: Lightning Execution +10% DMG against Sinner's Mark, and +10% ATK for 4s when
 *    triggered.
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence, coordinatedBuff, matrix } from "../../engine/gear.js";
import {
  applyCurrent,
  setStacksSelf,
  removeStack,
  applyEnemy,
  revokeEnemy,
  stacksOfEnemy,
  isHeld,
  currentAction,
  onAction,
  runningAction,
  casting,
  addStat,
  queue,
  queueOutro,
  applyTeam,
  frozenStacks,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ActionField, ECHO, INTRO } from "../../engine/rotation.js";
import { LETHEAN_ELEGY, STRINGMASTER } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { EMPYREAN_ANTHEM_5PC } from "../../echoes/rinascita.js";
import { NM_TEMPEST_MEPHIS, HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function yinlinAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter, heavy (Zapstring's Dance)
const BA1 = yinlinAction("Basic - Zapstring's Dance 1", { animFrames: 16, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 28.81, energy: 0.60, concerto: 2.00, offtune: 3144, forte1: 2.5 });
// PLACEHOLDER FRAMES
const BA2 = yinlinAction("Basic - Zapstring's Dance 2", { animFrames: 45, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 45, mv: 33.82, energy: 0.75, concerto: 2.5, offtune: 3076 },
    { hitFrame: 45, mv: 33.82, energy: 0.75, concerto: 2.5, offtune: 3076, forte1: 2.5 },
  ]});
// PLACEHOLDER FRAMES
const BA3 = yinlinAction("Basic - Zapstring's Dance 3", { animFrames: 63, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 63, mv: 13.99, energy: 0.35, concerto: 1, offtune: 1021 },
    { hitFrame: 63, mv: 13.99, energy: 0.35, concerto: 1, offtune: 1021 },
    { hitFrame: 63, mv: 13.99, energy: 0.35, concerto: 1, offtune: 1021 },
    { hitFrame: 63, mv: 13.99, energy: 0.35, concerto: 1, offtune: 1021 },
    { hitFrame: 63, mv: 13.99, energy: 0.35, concerto: 1, offtune: 1021 },
    { hitFrame: 63, mv: 13.99, energy: 0.35, concerto: 1, offtune: 1021 },
    { hitFrame: 63, mv: 13.99, energy: 0.35, concerto: 1, offtune: 1021, forte1: 7.5 },
  ]});
const BA4 = yinlinAction("Basic - Zapstring's Dance 4", { animFrames: 58, bullets: [{ hitFrame: 24, mv: 75.16, energy: 1.50, concerto: 6.00, offtune: 4976, forte1: 10 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});

// PLACEHOLDER FRAMES
const HA = yinlinAction("Heavy - Zapstring's Dance", { animFrames: 64, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 40, mv: 29.83, energy: 0.9, concerto: 2.25, offtune: 4696 },
    { hitFrame: 40, mv: 29.83, energy: 0.9, concerto: 2.25, offtune: 4696, forte1: 20 },
  ]});
const MA = yinlinAction("Mid-air - Zapstring's Dance Plunge", { animFrames: 30, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 123.27, energy: 0.51, concerto: 5.00, offtune: 4960, forte1: 5 });
// PLACEHOLDER FRAMES
const DC = yinlinAction("Dodge Counter - Zapstring's Dance", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 24.22, energy: 0.57, concerto: 1, offtune: 1678 },
    { hitFrame: 0, mv: 24.22, energy: 0.57, concerto: 1, offtune: 1678 },
    { hitFrame: 0, mv: 24.22, energy: 0.57, concerto: 1, offtune: 1678 },
    { hitFrame: 0, mv: 24.22, energy: 0.57, concerto: 1, offtune: 1678 },
    { hitFrame: 0, mv: 24.22, energy: 0.57, concerto: 1, offtune: 1678 },
    { hitFrame: 0, mv: 24.22, energy: 0.57, concerto: 1, offtune: 1678 },
    { hitFrame: 0, mv: 24.22, energy: 0.57, concerto: 1, offtune: 1678 },
  ], castConcerto: 10});

// Magnetic Roar opens Execution Mode; Lightning Execution is the follow-up Skill press
// PLACEHOLDER FRAMES
const Skill1 = yinlinAction("Skill - Magnetic Roar", {
  animFrames: 29, cooldown: 60 * 12,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 29, mv: 59.65, energy: 5, offtune: 2222 },
    { hitFrame: 29, mv: 59.65, energy: 5, offtune: 2222 },
    { hitFrame: 29, mv: 59.65, energy: 5, offtune: 2222, forte1: 30 },
  ], castConcerto: 10,
  updateBuffs: () => setStacksSelf(EXECUTION_MODE, 4),
});
// PLACEHOLDER FRAMES
const Skill2 = yinlinAction("Skill - Lightning Execution", { animFrames: 77, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 38, mv: 89.47, energy: 3.75, concerto: 3.75, offtune: 1332 },
    { hitFrame: 38, mv: 89.47, energy: 3.75, concerto: 3.75, offtune: 1332 },
    { hitFrame: 38, mv: 89.47, energy: 3.75, concerto: 3.75, offtune: 1332 },
    { hitFrame: 38, mv: 89.47, energy: 3.75, concerto: 3.75, offtune: 1332, forte1: 10 },
  ]});
/** One Electromagnetic Blast — queued onto her own slot by EXECUTION_MODE below, once per charge
 *  her Basic/Dodge Counter casts against a Sinner-marked target consume. */
const ACTION_BLAST = yinlinAction("Skill - Electromagnetic Blast", { node: Node.Skill, type: Type.Skill, mv: 19.89, concerto: 5.00, forte1: 5 });

// PLACEHOLDER FRAMES
const Liberation = yinlinAction("Liberation - Thundering Wrath", { animFrames: 191, timestop: 191, motionStop: 191, prioFrames: 191, cooldown: 60 * 16, node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    { hitFrame: 191, mv: 116.56, offtune: 5143 },
    { hitFrame: 191, mv: 116.56, offtune: 5143 },
    { hitFrame: 191, mv: 116.56, offtune: 5143 },
    { hitFrame: 191, mv: 116.56, offtune: 5143 },
    { hitFrame: 191, mv: 116.56, offtune: 5143 },
    { hitFrame: 191, mv: 116.56, offtune: 5143 },
    { hitFrame: 191, mv: 116.56, offtune: 5143 },
  ], castConcerto: 20, resetEnergy: true });

/** Chameleon Cipher: spends every Judgement Point, upgrades Sinner's Mark to Punishment Mark. */
// PLACEHOLDER FRAMES
const FHA = yinlinAction("Forte Heavy - Chameleon Cipher", {
  animFrames: 103,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 45, mv: 178.93, energy: 5, concerto: 10, offtune: 26000,
      // the upgrade is its hit on a Sinner-marked target
      updateDebuffs: () => {
        if (stacksOfEnemy(SINNERS_MARK)) {
          revokeEnemy(SINNERS_MARK);
          applyEnemy(PUNISHMENT_MARK, 18);
        }
      } },
    { hitFrame: 45, mv: 178.93, energy: 5, concerto: 10, offtune: 26000 },
  ], castForte1: -100,
});
/** One Judgment Strike — Resonance Skill DMG, drawn per qualifying action by PUNISHMENT_MARK. */
const PUNISHMENT_FIELD = new ActionField("Yinlin: Punishment Mark");
const ACTION_JUDGMENT_STRIKE = yinlinAction("Forte - Judgment Strike", { node: Node.Forte, type: Type.Skill, subtype: Subtype.Coordinated, mv: 78.64, field: PUNISHMENT_FIELD });

/** S6's Furious Thunder: 419.59% of her ATK as Resonance Skill DMG off a Basic Attack that lands
 *  inside the window her Liberation opens. Not a row on the kit page, so no energy, concerto or
 *  off-tune of its own. */
const FuriousThunder = yinlinAction("Skill - Furious Thunder (S6)", { node: Node.Skill, type: Type.Skill, mv: 419.59 });

// PLACEHOLDER FRAMES
const Intro = yinlinAction("Intro - Raging Storm", { animFrames: 82, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 76, mv: 14.32, energy: 0.2, offtune: 952 },
    { hitFrame: 76, mv: 14.32, energy: 0.2, offtune: 952 },
    { hitFrame: 76, mv: 14.32, energy: 0.2, offtune: 952 },
    { hitFrame: 76, mv: 14.32, energy: 0.2, offtune: 952 },
    { hitFrame: 76, mv: 14.32, energy: 0.2, offtune: 952 },
    { hitFrame: 76, mv: 14.32, energy: 0.2, offtune: 952 },
    { hitFrame: 76, mv: 14.32, energy: 0.2, offtune: 952 },
    { hitFrame: 76, mv: 14.32, energy: 0.2, offtune: 952 },
    { hitFrame: 76, mv: 14.32, energy: 0.2, offtune: 952 },
    { hitFrame: 76, mv: 14.32, energy: 0.2, offtune: 952, forte1: 30 },
  ], castEnergy: 8, castConcerto: 10});
const Outro = yinlinAction("Outro - Strategist", {
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => queueOutro(YINLIN_OUTRO),
});

/* ------------------------------------------------------------------------------------ marks */

/** Sinner's Mark: applied by her Basic Attacks/Liberation/Intro on hit — no stat, it gates the
 *  Blasts, Deadly Focus and the Cipher upgrade. "Removed when Yinlin is switched out" = removed
 *  on any inactive action of hers (her own lostOnSwap can't carry the check — the mark has to
 *  survive other members' inactive actions, so it tests whose slot is acting itself). */
const SINNERS_MARK: Debuff = new Debuff({
  name: "Yinlin: Sinner's Mark",
  updateBuffs: () => { if (currentAction().swapOut && isHeld(YINLIN_RESONATOR)) revokeEnemy(SINNERS_MARK); },
});

/** Punishment Mark: what Chameleon Cipher turns a Sinner's Mark into — "when a target marked
 *  with Punishment Mark takes damage, Judgement Strike will fall". */
const PUNISHMENT_MARK = coordinatedBuff("Yinlin: Punishment Mark", 18, () => YINLIN_RESONATOR, ACTION_JUDGMENT_STRIKE);

/** Execution Mode: 4 Blast charges off Magnetic Roar — each Basic/Dodge Counter cast against a
 *  Sinner-marked target spends one for an Electromagnetic Blast. Whatever's left is lost when
 *  she leaves the field. */
const EXECUTION_MODE: Buff = new Buff({
  name: "Yinlin: Execution Mode", maxStacks: 4, duration: 60 * 10,
  updateBuffs: () => {
    if ((casting(Cast.Basic) || casting(Cast.DodgeCounter)) && stacksOfEnemy(SINNERS_MARK)) {
      queue(ACTION_BLAST);
      removeStack(EXECUTION_MODE, 1);
    }
  },
});

/* ------------------------------------------------------------------------------------ buffs */

/** Pain Immersion (Inherent Skill): +15% Crit Rate for 5s after Magnetic Roar. */
const PAIN_IMMERSION = new Buff({
  name: "Inherent: Pain Immersion",
  duration: 60 * 5,
  stats: [[Stat.CritRate, 15]],
});
const YL_INHERENT_1 = new Inherent({
  name: "Inherent: Pain Immersion",
  grants: [{ on: onAction(Skill1), buff: PAIN_IMMERSION }],
});

/** Deadly Focus (Inherent Skill): the +10% ATK half — the +10% on Lightning Execution itself
 *  lives on YL_INHERENT_2's own apply below. Both halves need the target Sinner-marked. */
const DEADLY_FOCUS = new Buff({
  name: "Inherent: Deadly Focus",
  duration: 60 * 4,
  stats: [[Stat.BonusAtk, 10]],
});
const YL_INHERENT_2 = new Inherent({
  name: "Inherent: Deadly Focus",
  applyStats: () => { if (runningAction(Skill2) && stacksOfEnemy(SINNERS_MARK)) addStat(Stat.DmgBonus, 10); },
  afterAction: () => { if (runningAction(Skill2) && stacksOfEnemy(SINNERS_MARK)) applyCurrent(DEADLY_FOCUS, 1); },
});

/** Strategist — the outro handoff: "for 14s or until they are switched out". */
const YINLIN_OUTRO = new Buff({
  name: "Yinlin: Outro",
  duration: 60 * 14,
  stats: [[Stat.Amp, 20, Attribute.Electro], [Stat.Amp, 25, Type.Liberation]],
  lostOnSwap: true,
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const YINLIN_TALENTS = new Talent({
  name: "Yinlin: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const YINLIN_MATRIX = matrix("Yinlin", 20, {
  updateBuffs: () => { if (casting(Cast.Liberation)) applyTeam(YINLIN_MATRIX_TEAM); },
});

const YINLIN_RESONATOR = new Resonator({
  name: "Yinlin",
  stats: [[Stat.BaseHp, 11000], [Stat.BaseAtk, 400], [Stat.BaseDef, 1283.331]],
  matrix: YINLIN_MATRIX,
  talent: YINLIN_TALENTS,
  inherent1: YL_INHERENT_1,
  inherent2: YL_INHERENT_2,
  element: Attribute.Electro,
  weapon: WeaponType.Rectifier,
  color: "#a45ee8",
  intro: Intro,
  maxEnergy: 125,
  maxForte1: 100,

  // the mark goes on with the hit, so a Basic's Blast is gated by the mark it found at its cast
  updateDebuffs: () => {
    if (casting(Cast.Basic) || casting(Cast.DodgeCounter) || casting(Cast.Intro) || runningAction(Liberation)) {
      applyEnemy(SINNERS_MARK, 1);
    }
  },

});

/* --------------------------------------------------------------------------------- sequences */

/** S1: Magnetic Roar and Lightning Execution deal 70% more — a damage bonus, not a multiplier,
 *  which is both how the sentence reads and why nanoka's second Lightning Execution row is the
 *  same 89.47% as the first. */
const YL_S1 = new Sequence({
  name: "Yinlin S1: Morality's Crossroads",
  applyStats: () => {
    if (runningAction(Skill1) || runningAction(Skill2)) addStat(Stat.DmgBonus, 70);
  },
});

/** S2: every Electromagnetic Blast hands back 5 Resonance Energy and 5 Judgement Points. */
const YL_S2 = new Sequence({
  name: "Yinlin S2: Ensnarled by Rapport",
  applyStats: () => {
    if (!runningAction(ACTION_BLAST)) return;
    addStat(Stat.AddEnergy, 5);
    addStat(Stat.AddForte1, 5);
  },
});

/** S3: Judgment Strike at x1.55 — multiplicative, nanoka's own second row (121.89% against
 *  78.64%). */
const YL_S3 = new Sequence({
  name: "Yinlin S3: Unyielding Verdict",
  applyStats: () => { if (runningAction(ACTION_JUDGMENT_STRIKE)) addStat(Stat.MulMv, 55); },
});

/** S4: +20% ATK to the team for 12s off every Judgment Strike that lands — one falls on virtually
 *  every action while Punishment Mark stands, and the Cipher renews the mark each loop, so it
 *  never lapses. */
const STEADFAST_CONVICTION = new Buff({ name: "Yinlin S4: Steadfast Conviction", duration: 60 * 12, stats: [[Stat.BonusAtk, 20]] });
const YL_S4 = new Sequence({
  name: "Yinlin S4: Steadfast Conviction",
  grants: [{ on: onAction(ACTION_JUDGMENT_STRIKE), buff: STEADFAST_CONVICTION, to: BuffTarget.Team, onHit: true }],
});

/** S5: Thundering Wrath deals 100% extra to a marked target — her Liberation lays Sinner's Mark
 *  itself, ahead of this (the resonator's own updateDebuffs), so it always reads one. */
const YL_S5 = new Sequence({
  name: "Yinlin S5: Resounding Will",
  applyStats: () => {
    if (!runningAction(Liberation)) return;
    if (stacksOfEnemy(SINNERS_MARK) || stacksOfEnemy(PUNISHMENT_MARK)) addStat(Stat.DmgBonus, 100);
  },
});

/** Pursuit of Justice (S6): four charges off Thundering Wrath, one spent by each Basic Attack that
 *  lands, for a Furious Thunder apiece. The window is 30s, so it stands past her outro and the
 *  Basics of her next visit spend what the last one left. */
const PURSUIT_OF_JUSTICE = new Buff({
  name: "Yinlin S6: Pursuit of Justice", maxStacks: 4, duration: 60 * 30,
  // spent by each Basic hit that lands
  updateDebuffs: () => {
    if (!casting(Cast.Basic) || frozenStacks() <= 0) return;
    removeStack(PURSUIT_OF_JUSTICE, 1);
    queue(FuriousThunder);
  },
});
const YL_S6 = new Sequence({
  name: "Yinlin S6: Pursuit of Justice",
  grants: [{ on: onAction(Liberation), buff: PURSUIT_OF_JUSTICE, stacks: 4 }],
});

const YL_SEQUENCES = [YL_S1, YL_S2, YL_S3, YL_S4, YL_S5, YL_S6];

// the kit-valid line: Magnetic Roar opens Execution Mode, the full combo (marked by its own first
// hits) fires all 4 Blasts, the Heavy tops the gauge to the 45 that covers Chameleon Cipher's 40,
// which upgrades the mark for Judgment Strikes off Outro. She's never the team's own lead, so
// this covers both opener and loop.

const BA1234 = new ActionGroup("Basic - Zapstring's Dance 1234", [BA1, BA2, BA3, BA4]);

const YL_ROTATION = new Rotation([
  INTRO, Skill1, Liberation, BA1234, Skill2, FHA, ECHO.instaSwap(),
  Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, and two real
// echo choices — Empyrean Anthem behind her Coordinated Judgment Strikes, or Moonlit Clouds
/** Matrix: her Liberation grants the team +30% Resonance Liberation DMG Bonus for 30s — permanent. */
const YINLIN_MATRIX_TEAM = new Buff({
  name: "Yinlin: Matrix Buff", duration: 60 * 30,
  stats: [[Stat.DmgBonus, 30, Type.Liberation]],
});

export const YINLIN = new Loadout({
  resonator: YINLIN_RESONATOR,
  weapons: [STRINGMASTER, COSMIC_RIPPLES, LETHEAN_ELEGY, NEW_STD_RECTIFIER],
  echoLoadouts: [
    new EchoLoadout(NM_TEMPEST_MEPHIS, EMPYREAN_ANTHEM_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  rotation: YL_ROTATION,
  sequences: YL_SEQUENCES,
});
