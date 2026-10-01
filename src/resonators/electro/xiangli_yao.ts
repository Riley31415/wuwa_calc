/**
 * Xiangli Yao, ported to the new engine — Sequences 1-6 in their own block below, a limited 5-star
 * (`Tier.Limited`). An electro gauntlets main DPS built around his Liberation: Cogitation
 * Model deals a huge hit and opens Intuition (24s, 3 Hypercubes), swapping his kit for Pivot -
 * Impale basics, Divergence, and Unfathomed — Law of Reigns (5 Performance Capacity, one
 * Hypercube each) and Revamp are the mode's forte payoffs, all considered Resonance Liberation
 * DMG. Out of the mode, Capacity (forte1, 100) charges Decipher, also Liberation DMG. Intuition
 * itself isn't tracked live — the rotation hand-orders a kit-valid line, same as Zhezhi's
 * Imprints.
 *
 * Numbers from nanoka.cc (character 1305) — MV/energy/concerto/offtune all resolved off the
 * site's own level-10 damage table; no migrated-sheet rows exist for him. Capacity gains are the
 * real per-hit data (summed per action, e.g. Probe 1's 4x2 = 8, Deduction 40 — the full combo
 * plus one Deduction banks 115 for Decipher's -100); Performance Capacity gains are the kit
 * text's own numbers (forte2: +1/+2/+3 as each move declares, -5 a Law of Reigns).
 *
 * His two Inherent Skills, off the page's own "INHERENT SKILLS" section:
 *  - Knowing: +5% Electro DMG Bonus a stack after casting Resonance Skill, up to 4, 8s.
 *  - Focus: interruption resistance during Intuition — no combat-formula effect, a do-nothing
 *    marker.
 * Chain Rule (Outro): the incoming resonator holds "Xiangli Yao: Outro" x3, and each of their
 * Basic casts consumes a charge to fire one 237.63% laser on Xiangli Yao's own slot — same shape
 * as Jiyan's Discipline; the 2s trigger ICD isn't modelled.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence, matrix } from "../../engine/gear.js";
import {
  applyCurrent,
  currentAction,
  onAction,
  runningAction,
  casting,
  addStat,
  removeStack,
  queueOn,
  queueOutro,
  queue,
  onCast,
  runningAnyOf,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, ActionField, INTRO } from "../../engine/rotation.js";
import { IUNO_SIG, VERITYS_HANDLE } from "../../weapons/gauntlet.js";
import { ABYSS_SURGES, NEW_STD_GAUNTLET } from "../../weapons/standard.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { NM_MEPHIS, VOID_THUNDER_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function xlyAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- basics, heavy, mid-air, dodge counter (Probe) — every hit feeds Capacity
// PLACEHOLDER FRAMES
const BA1 = xlyAction("Basic - Probe 1", { animFrames: 20, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 20, mv: 33.11, energy: 0.42, concerto: 0.84, offtune: 1332 },
    { hitFrame: 20, mv: 33.11, energy: 0.42, concerto: 0.84, offtune: 1332, forte1: 8 },
  ]});
const BA2 = xlyAction("Basic - Probe 2", { animFrames: 20, bullets: [{ hitFrame: 15, mv: 99.61, energy: 1.26, concerto: 2.51, offtune: 4008, forte1: 14 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
// PLACEHOLDER FRAMES
const BA3 = xlyAction("Basic - Probe 3", { animFrames: 48, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 40, mv: 39.76, energy: 0.5, concerto: 1, offtune: 1600 },
    { hitFrame: 40, mv: 39.76, energy: 0.5, concerto: 1, offtune: 1600 },
    { hitFrame: 40, mv: 39.76, energy: 0.5, concerto: 1, offtune: 1600, forte1: 15 },
  ]});
// PLACEHOLDER FRAMES
const BA4 = xlyAction("Basic - Probe 4", { animFrames: 48, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 32, mv: 53.05, energy: 0.672, concerto: 1.3399, offtune: 2135.1195 },
    { hitFrame: 32, mv: 53.05, energy: 0.672, concerto: 1.3399, offtune: 2135.1195 },
    { hitFrame: 32, mv: 26.53, energy: 0.336, concerto: 0.6702, offtune: 1067.761, forte1: 18 },
  ]});
const BA5 = xlyAction("Basic - Probe 5", { animFrames: 64, bullets: [{ hitFrame: 33, mv: 198.81, energy: 2.50, concerto: 5.00, offtune: 8000, forte1: 20 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});

// PLACEHOLDER FRAMES
const HA = xlyAction("Heavy - Probe", { animFrames: 58, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 58, mv: 82.81, energy: 1.05, concerto: 2.09, offtune: 3332 },
    { hitFrame: 58, mv: 82.81, energy: 1.05, concerto: 2.09, offtune: 3332, forte1: 18 },
  ]});
const MA = xlyAction("Mid-air - Probe Plunge", { animFrames: 60, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 123.27, energy: 0.52, concerto: 1.00, offtune: 4960, forte1: 13 });
const DC = xlyAction("Dodge Counter - Probe", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, mv: 238.58, energy: 2.75, concerto: 2.5, castConcerto: 10, offtune: 4000, forte1: 26 });

// PLACEHOLDER FRAMES
const Skill = xlyAction("Skill - Deduction", { animFrames: 41, cooldown: 60 * 5, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 15, mv: 99.41, energy: 3.125, concerto: 3.5, offtune: 2000 },
    { hitFrame: 15, mv: 99.4, energy: 3.125, concerto: 3.5, offtune: 2000, forte1: 40 },
  ]});
/** Decipher: spends the full 100 Capacity, considered Resonance Liberation DMG. */
const FSkill = xlyAction("Forte Skill - Decipher", { animFrames: 45, node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, mv: 397.82, energy: 1.67, castConcerto: 7, offtune: 5336, castForte1: -100});

const Liberation = xlyAction("Liberation - Cogitation Model", { animFrames: 191, timestop: 270, motionStop: 191, prioFrames: 191, cooldown: 60 * 25, node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, mv: 1466.06, castConcerto: 20, offtune: 67200, resetEnergy: true });

// Intuition's own moveset — Pivot - Impale basics, Divergence, Unfathomed; Performance Capacity
// (forte2) deltas are the kit text's own numbers
const UBA1 = xlyAction("Basic - Pivot: Impale 1", { animFrames: 60, node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, mv: 119.67, energy: 1.31, concerto: 2.62, offtune: 4192, forte2: 1 });
// PLACEHOLDER FRAMES
const UBA2 = xlyAction("Basic - Pivot: Impale 2", { animFrames: 60, node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 60, mv: 60.92, energy: 0.67, concerto: 1.34, offtune: 2134 },
    { hitFrame: 60, mv: 60.92, energy: 0.67, concerto: 1.34, offtune: 2134 },
    { hitFrame: 60, mv: 60.92, energy: 0.67, concerto: 1.34, offtune: 2134 },
    { hitFrame: 60, mv: 60.92, energy: 0.67, concerto: 1.34, offtune: 2134, forte2: 2 },
  ]});
// PLACEHOLDER FRAMES
const UBA3 = xlyAction("Basic - Pivot: Impale 3", { animFrames: 60, node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 60, mv: 133.25, energy: 1.46, concerto: 2.92, offtune: 4668 },
    { hitFrame: 60, mv: 133.25, energy: 1.46, concerto: 2.92, offtune: 4668, forte2: 2 },
  ]});
// PLACEHOLDER FRAMES
const USkill = xlyAction("Skill - Divergence", { animFrames: 85, cooldown: 60 * 7, node: Node.Liberation, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 85, mv: 49.59, energy: 0.9941, concerto: 0.5, offtune: 931.6564 },
    { hitFrame: 85, mv: 49.59, energy: 0.9941, concerto: 0.5, offtune: 931.6564 },
    { hitFrame: 85, mv: 49.59, energy: 0.9941, concerto: 0.5, offtune: 931.6564 },
    { hitFrame: 85, mv: 173.55, energy: 3.4789, concerto: 1.75, offtune: 3260.5155 },
    { hitFrame: 85, mv: 173.55, energy: 3.4788, concerto: 1.75, offtune: 3260.5153, forte2: 2 },
  ], castConcerto: 10});
// PLACEHOLDER FRAMES
const UDC = xlyAction("Dodge Counter - Unfathomed", { node: Node.Liberation, cast: Cast.DodgeCounter, type: Type.Liberation, bullets: [
    { hitFrame: 0, mv: 38.83, energy: 0.4001, concerto: 0.5001, offtune: 800.1236 },
    { hitFrame: 0, mv: 38.83, energy: 0.4001, concerto: 0.5001, offtune: 800.1236 },
    { hitFrame: 0, mv: 310.58, energy: 3.1998, concerto: 3.9998, offtune: 6399.7528, forte2: 2 },
  ], castConcerto: 10});

/** Law of Reigns: 5 Performance Capacity and a Hypercube a cast, considered Liberation DMG. */
// PLACEHOLDER FRAMES
const UForte = xlyAction("Forte Skill - Law of Reigns", { animFrames: 93, node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, bullets: [
    { hitFrame: 85, mv: 95.73, energy: 0.717, offtune: 6840 },
    { hitFrame: 85, mv: 95.73, energy: 0.717, offtune: 6840 },
    { hitFrame: 85, mv: 95.73, energy: 0.717, offtune: 6840 },
    { hitFrame: 85, mv: 95.73, energy: 0.717, offtune: 6840 },
    { hitFrame: 85, mv: 255.28, energy: 1.912, offtune: 18240 },
  ], castConcerto: 10, castForte2: -5});
/** Revamp, the mid-air follow-up to Decipher/Divergence — considered Liberation DMG. */
// PLACEHOLDER FRAMES
const FBA = xlyAction("Mid-air - Revamp", { animFrames: 95, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 67, mv: 21.87, energy: 0.278, offtune: 880 },
    { hitFrame: 67, mv: 21.87, energy: 0.278, offtune: 880 },
    { hitFrame: 67, mv: 21.87, energy: 0.278, offtune: 880 },
    { hitFrame: 67, mv: 21.87, energy: 0.278, offtune: 880 },
    { hitFrame: 67, mv: 65.61, energy: 0.834, offtune: 2640 },
    { hitFrame: 67, mv: 65.61, energy: 0.834, offtune: 2640, forte2: 3 },
  ], castConcerto: 5});

/** S1's Convolution Matrices: six more instances off every Law of Reigns, each worth 8% of that
 *  skill's own multiplier — 51.06% apiece, and 89.86% once S6 raises the skill (nanoka's own rows,
 *  which carry no energy, concerto or off-tune of their own). */
const ConvolutionMatrices = xlyAction("Forte Skill - Convolution Matrices (S1)", { node: Node.Forte, type: Type.Liberation, mv: 51.06 * 6 });

// PLACEHOLDER FRAMES
const Intro = xlyAction("Intro - Principle", { animFrames: 84, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 60, mv: 99.41, energy: 5, concerto: 5, offtune: 5600 },
    { hitFrame: 60, mv: 99.41, energy: 5, concerto: 5, offtune: 5600 },
  ]});
/** Chain Rule: no damage of its own, just the handoff — its lasers are ACTION_OUTRO_COORD. */
const Outro = xlyAction("Outro - Chain Rule", {
  cast: Cast.Outro, castConcerto: -100,
  // queued three times so the adopter picks the buff up at all three charges
  updateBuffs: () => { queueOutro(XLY_OUTRO); queueOutro(XLY_OUTRO); queueOutro(XLY_OUTRO); },
});
/** One laser beam — queued onto his own slot by XLY_OUTRO below, once per stack the incoming
 *  resonator's Basic casts consume. */
const CHAIN_RULE_FIELD = new ActionField("Xiangli Yao: Chain Rule");
const ACTION_OUTRO_COORD = xlyAction("Outro - Chain Rule (Laser)", { type: Type.Outro, mv: 237.63, field: CHAIN_RULE_FIELD });

/* ------------------------------------------------------------------------------------ buffs */

/** Knowing (Inherent Skill): +5% Electro DMG Bonus a stack on casting Resonance Skill, up to 4,
 *  8s — held for his whole field window. */
const KNOWING = new Buff({
  name: "Inherent: Knowing", maxStacks: 4, duration: 60 * 8,
  stats: [[Stat.DmgBonus, 5, Attribute.Electro]], perStack: true,
});
const XLY_INHERENT_1 = new Inherent({
  name: "Inherent: Knowing",
  grants: [{ on: onCast(Cast.Skill), buff: KNOWING }],
});

/** Focus (Inherent Skill): interruption resistance during Intuition — see file header. */
const XLY_INHERENT_2 = new Inherent({ name: "Inherent: Focus" });

/** Chain Rule — the outro handoff: 3 charges on the incoming resonator, each Basic cast of theirs
 *  consuming one to fire a laser on Xiangli Yao's own slot. Whatever's left is lost when they
 *  leave the field. */
const XLY_OUTRO: Buff = new Buff({
  field: CHAIN_RULE_FIELD,
  name: "Xiangli Yao: Outro", maxStacks: 3, duration: 60 * 8,
  updateBuffs: () => {
    if (casting(Cast.Basic)) { queueOn(XIANGLI_YAO_RESONATOR, ACTION_OUTRO_COORD); removeStack(XLY_OUTRO, 1); }
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
const XLY_TALENTS = new Talent({
  name: "Xiangli Yao: Talents",
  stats: [[Stat.CritDmg, 16], [Stat.BonusAtk, 12]],
});

const XIANGLI_YAO_RESONATOR = new Resonator({
  name: "Xiangli Yao",
  matrix: matrix("Xiangli Yao", 25),
  talent: XLY_TALENTS,
  inherent1: XLY_INHERENT_1,
  inherent2: XLY_INHERENT_2,
  element: Attribute.Electro,
  weapon: WeaponType.Gauntlets,
  color: "#6b74e8",
  intro: Intro,
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 5,

  stats: [[Stat.BaseHp, 10625], [Stat.BaseAtk, 425], [Stat.BaseDef, 1222.22]],
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: six Convolution Matrices off every Law of Reigns. */
const XLY_S1 = new Sequence({
  name: "Xiangli Yao S1: Prodigy of Protégés",
  updateBuffs: () => { if (runningAction(UForte)) queue(ConvolutionMatrices); },
});

/** S2: +30% Crit. DMG for 8s off any Resonance Skill and off Cogitation Model — every visit opens
 *  on one, so it stands for his whole window and goes with his outro. */
const TRACES_OF_PREDECESSORS = new Buff({
  name: "Xiangli Yao S2: Traces of Predecessors",
  duration: 60 * 8,
  stats: [[Stat.CritDmg, 30]],
});
const XLY_S2 = new Sequence({
  name: "Xiangli Yao S2: Traces of Predecessors",
  updateBuffs: () => { if (casting(Cast.Skill) || runningAction(Liberation)) applyCurrent(TRACES_OF_PREDECESSORS, 1); },
});

/** Ruins of Ancient (S3): Cogitation Model leaves five charges, and Decipher, Deduction, Divergence
 *  and Law of Reigns each spend one for 63% more damage — "increases the DMG", not the multiplier,
 *  so a damage bonus. The Intuition window spends all five exactly (two Divergences, three Laws). */
const RUINS_OF_ANCIENT = new Buff({
  name: "Xiangli Yao S3: Ruins of Ancient", maxStacks: 5, duration: 60 * 24,
  applyStats: () => { if (runningAnyOf(RUINS_PAYS)) addStat(Stat.DmgBonus, 63); },
  afterAction: () => { if (runningAnyOf(RUINS_PAYS)) removeStack(RUINS_OF_ANCIENT, 1); },
});
const RUINS_PAYS = new Set<Action>([FSkill, Skill, USkill, UForte]);
const XLY_S3 = new Sequence({
  name: "Xiangli Yao S3: Ruins of Ancient",
  grants: [{ on: onAction(Liberation), buff: RUINS_OF_ANCIENT, stacks: 5 }],
});

/** S4: Cogitation Model hands the whole team +25% Resonance Liberation DMG Bonus for 30s. */
const VESSEL_OF_REBIRTH = new Buff({
  name: "Xiangli Yao S4: Vessel of Rebirth",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 25, Type.Liberation]],
});
const XLY_S4 = new Sequence({
  name: "Xiangli Yao S4: Vessel of Rebirth",
  grants: [{ on: onAction(Liberation), buff: VESSEL_OF_REBIRTH, to: BuffTarget.Team }],
});

/** S5: Chain Rule's lasers at x3.22 and Cogitation Model at x2 — multiplicative, nanoka's own row
 *  for the Liberation (2932.11% against 1466.06%). The Outro carries no second row to read, so it
 *  is taken the same way its own sentence is written. */
const XLY_S5 = new Sequence({
  name: "Xiangli Yao S5: End of Stars",
  applyStats: () => {
    if (runningAction(ACTION_OUTRO_COORD)) addStat(Stat.MulMv, 222);
    if (runningAction(Liberation)) addStat(Stat.MulMv, 100);
  },
});

/** S6: Law of Reigns at x1.76 — multiplicative (168.48%/449.28% against 95.73%/255.28%) — and the
 *  Matrices with it, being a share of that same multiplier (89.86% against 51.06%). */
const XLY_S6 = new Sequence({
  name: "Xiangli Yao S6: Solace of the Ordinary",
  applyStats: () => {
    if (runningAction(UForte) || runningAction(ConvolutionMatrices)) addStat(Stat.MulMv, 76);
  },
});

const XLY_SEQUENCES = [XLY_S1, XLY_S2, XLY_S3, XLY_S4, XLY_S5, XLY_S6];

// Deduction plus the full Probe combo lands exactly on 100 Capacity for Decipher; Cogitation
// Model opens Intuition, whose three Law of Reigns each spend the 5 Performance Capacity the
// moves before them bank (pivot combo 1+2+2, then Divergence 2 + Revamp 3, then a second pivot
// combo). He's never the team's own lead, so this covers both opener and loop.

const UBA123 = new ActionGroup("Basic - Pivot: Impale 123", [UBA1, UBA2, UBA3]);

const XLY_ROTATION = new Rotation([
  INTRO,
  Liberation,
  USkill, FBA, UForte,
  UBA123, UForte,
  USkill, FBA, UForte,
  ECHO.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const XIANGLI_YAO = new Loadout({
  resonator: XIANGLI_YAO_RESONATOR,
  weapons: [IUNO_SIG, NEW_STD_GAUNTLET, VERITYS_HANDLE, ABYSS_SURGES],
  echoLoadouts: [new EchoLoadout(NM_MEPHIS, VOID_THUNDER_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill),
  rotation: XLY_ROTATION,
  sequences: XLY_SEQUENCES,
});
