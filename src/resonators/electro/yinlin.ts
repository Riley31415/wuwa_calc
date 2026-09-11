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
import { Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling, LifeTime, BuffTarget } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
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
import { coordinatedBuff, matrix } from "../../shared/helpers.js";
import { ActionGroup, Action, Rotation, INTRO, OUTRO, ActionField, ECHO_SWAP } from "../../engine/rotation.js";
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
const BA1 = yinlinAction("Basic - Zapstring's Dance 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 28.81, energy: 0.60, concerto: 2.00, offtune: 3144, forte1: 2.5 });
const BA2 = yinlinAction("Basic - Zapstring's Dance 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 33.82 * 2, energy: 1.50, concerto: 5.00, offtune: 6152, forte1: 2.5 });
const BA3 = yinlinAction("Basic - Zapstring's Dance 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 13.99 * 7, energy: 2.45, concerto: 7.00, offtune: 7147, forte1: 7.5 });
const BA4 = yinlinAction("Basic - Zapstring's Dance 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 75.16, energy: 1.50, concerto: 6.00, offtune: 4976, forte1: 10 });

const HA = yinlinAction("Heavy - Zapstring's Dance", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 29.83 * 2, energy: 1.80, concerto: 4.50, offtune: 9392, forte1: 20 });
const MA = yinlinAction("Mid-air - Zapstring's Dance", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 123.27, energy: 0.51, concerto: 5.00, offtune: 4960, forte1: 5 });
const DC = yinlinAction("Dodge Counter - Zapstring's Dance", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 24.22 * 7, energy: 3.99, concerto: 17.00, offtune: 11746 });

// Magnetic Roar opens Execution Mode; Lightning Execution is the follow-up Skill press
const Skill1 = yinlinAction("Skill - Magnetic Roar", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 59.65 * 3, energy: 15.00, concerto: 10, offtune: 6666, forte1: 30,
  updateBuffs: () => setStacksSelf(EXECUTION_MODE, 4),
});
const Skill2 = yinlinAction("Skill - Lightning Execution", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 89.47 * 4, energy: 15.00, concerto: 15, offtune: 5328, forte1: 10 });
/** One Electromagnetic Blast — queued onto her own slot by EXECUTION_MODE below, once per charge
 *  her Basic/Dodge Counter casts against a Sinner-marked target consume. */
const ACTION_BLAST = yinlinAction("Skill - Electromagnetic Blast", { node: Node.Skill, type: Type1.Skill, mv: 19.89, concerto: 5.00, forte1: 5 });

const Liberation = yinlinAction("Liberation - Thundering Wrath", { node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Liberation, mv: 116.56 * 7, concerto: 20, offtune: 36001, resetEnergy: true });

/** Chameleon Cipher: spends every Judgement Point, upgrades Sinner's Mark to Punishment Mark. */
const FHA = yinlinAction("Forte Heavy - Chameleon Cipher", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 178.93 * 2, energy: 10.00, concerto: 20.00, offtune: 52000, forte1: -100,
  updateBuffs: () => {
    if (stacksOfEnemy(SINNERS_MARK)) { revokeEnemy(SINNERS_MARK); applyEnemy(PUNISHMENT_MARK, 18); }
  },
});
/** One Judgment Strike — Resonance Skill DMG, drawn per qualifying action by PUNISHMENT_MARK. */
const PUNISHMENT_FIELD = new ActionField("Yinlin: Punishment Mark");
const ACTION_JUDGMENT_STRIKE = yinlinAction("Forte - Judgment Strike", { node: Node.Forte, type: Type1.Skill, type2: Type2.Coordinated, mv: 78.64, field: PUNISHMENT_FIELD });

/** S6's Furious Thunder: 419.59% of her ATK as Resonance Skill DMG off a Basic Attack that lands
 *  inside the window her Liberation opens. Not a row on the kit page, so no energy, concerto or
 *  off-tune of its own. */
const FuriousThunder = yinlinAction("Skill - Furious Thunder (S6)", { node: Node.Skill, type: Type1.Skill, mv: 419.59 });

const Intro = yinlinAction("Intro - Raging Storm", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 14.32 * 10, energy: 10.00, concerto: 10, offtune: 9520, forte1: 30 });
const Outro = yinlinAction("Outro - Strategist", {
  cast: Cast.Outro, concerto: -100, swapOut: true,
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
const PUNISHMENT_MARK = coordinatedBuff("Yinlin: Punishment Mark", 18, () => YINLIN_RESONATOR, ACTION_JUDGMENT_STRIKE, { enemy: true });

/** Execution Mode: 4 Blast charges off Magnetic Roar — each Basic/Dodge Counter cast against a
 *  Sinner-marked target spends one for an Electromagnetic Blast. Whatever's left is lost when
 *  she leaves the field. */
const EXECUTION_MODE: Buff = new Buff({
  name: "Yinlin: Execution Mode", maxStacks: 4,
  updateBuffs: () => {
    if ((casting(Cast.Basic) || casting(Cast.DodgeCounter)) && stacksOfEnemy(SINNERS_MARK)) {
      queue(ACTION_BLAST);
      removeStack(EXECUTION_MODE, 1);
    }
  },
  until: LifeTime.Outro,
});

/* ------------------------------------------------------------------------------------ buffs */

/** Pain Immersion (Inherent Skill): +15% Crit Rate for 5s after Magnetic Roar. */
const PAIN_IMMERSION = new Buff({
  name: "Inherent: Pain Immersion",
  stats: [[Stat.CritRate, 15]],
  until: LifeTime.Outro,
});
const YL_INHERENT_1 = new Inherent({
  name: "Inherent: Pain Immersion",
  grants: [{ on: onAction(Skill1), buff: PAIN_IMMERSION }],
});

/** Deadly Focus (Inherent Skill): the +10% ATK half — the +10% on Lightning Execution itself
 *  lives on YL_INHERENT_2's own apply below. Both halves need the target Sinner-marked. */
const DEADLY_FOCUS = new Buff({
  name: "Inherent: Deadly Focus",
  stats: [[Stat.BonusAtk, 10]],
  until: LifeTime.Outro,
});
const YL_INHERENT_2 = new Inherent({
  name: "Inherent: Deadly Focus",
  updateBuffs: () => { if (runningAction(Skill2) && stacksOfEnemy(SINNERS_MARK)) applyCurrent(DEADLY_FOCUS, 1); },
  applyStats: () => { if (runningAction(Skill2) && stacksOfEnemy(SINNERS_MARK)) addStat(Stat.DmgBonus, 10); },
});

/** Strategist — the outro handoff: "for 14s or until they are switched out". */
const YINLIN_OUTRO = new Buff({
  name: "Yinlin: Outro",
  stats: [[Stat.Amp, 20, Attribute.Electro], [Stat.Amp, 25, Type1.Liberation]],
  until: LifeTime.Swap,
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
  stats: [[Stat.BaseHp, 11000], [Stat.BaseAtk, 400], [Stat.BaseDef, 1283.33]],
  matrix: YINLIN_MATRIX,
  talent: YINLIN_TALENTS,
  inherent1: YL_INHERENT_1,
  inherent2: YL_INHERENT_2,
  element: Attribute.Electro,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  outro: () => Outro,
  color: "#a45ee8",
  maxEnergy: 125,
  maxForte1: 100,

  updateBuffs: () => {
    // this runs ahead of EXECUTION_MODE's own update (equipped gear first), so a Basic's own
    // fresh mark already gates that same cast's Blast
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
const STEADFAST_CONVICTION = new Buff({ name: "Yinlin S4: Steadfast Conviction", stats: [[Stat.BonusAtk, 20]] });
const YL_S4 = new Sequence({
  name: "Yinlin S4: Steadfast Conviction",
  grants: [{ on: onAction(ACTION_JUDGMENT_STRIKE), buff: STEADFAST_CONVICTION, to: BuffTarget.Team }],
});

/** S5: Thundering Wrath deals 100% extra to a marked target — her Liberation lays Sinner's Mark
 *  itself, ahead of this (the resonator's own updateBuffs), so it always reads one. */
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
  name: "Yinlin S6: Pursuit of Justice", maxStacks: 4,
  updateBuffs: () => {
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
  INTRO, Skill1, Liberation, BA1234, Skill2, FHA, ECHO_SWAP,
  OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, and two real
// echo choices — Empyrean Anthem behind her Coordinated Judgment Strikes, or Moonlit Clouds
/** Matrix: her Liberation grants the team +30% Resonance Liberation DMG Bonus for 30s — permanent. */
const YINLIN_MATRIX_TEAM = new Buff({
  name: "Yinlin: Matrix Buff",
  stats: [[Stat.DmgBonus, 30, Type1.Liberation]],
});

export const YINLIN = new Loadout({
  resonator: YINLIN_RESONATOR,
  weapons: [STRINGMASTER, COSMIC_RIPPLES, LETHEAN_ELEGY, NEW_STD_RECTIFIER],
  echoLoadouts: [
    new EchoLoadout(NM_TEMPEST_MEPHIS, EMPYREAN_ANTHEM_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Skill, Substat.Er, Substat.FlatAtk),
  rotation: YL_ROTATION,
  sequences: YL_SEQUENCES,
});
