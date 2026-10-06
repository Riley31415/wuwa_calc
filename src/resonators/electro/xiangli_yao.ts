/**
 * Xiangli Yao, ported to the new engine — Sequences 1-6 in their own block below, a limited 5-star
 * (`Tier.Limited`). An electro gauntlets main DPS built around his Liberation: Cogitation
 * Model deals a huge hit and opens Intuition (24s, 3 Hypercubes), swapping his kit for Pivot -
 * Impale basics, Divergence, and Unfathomed — Law of Reigns (5 Performance Capacity, one
 * Hypercube each) and Revamp are the mode's forte payoffs, all considered Resonance Liberation
 * DMG. Out of the mode, Capacity (forte1, 100) charges Decipher, also Liberation DMG. Intuition
 * is a Buff whose stacks are its Hypercubes: each Law of Reigns spends one, and the last ends it.
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
  onAction,
  runningAction,
  casting,
  addStat,
  removeStack,
  queueOn,
  queueQTE,
  queue,
  setStacksSelf,
  onCast,
  runningAnyOf,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, ActionField, INTRO, OUTRO } from "../../engine/rotation.js";
import { IUNO_SIG, VERITYS_HANDLE } from "../../weapons/gauntlet.js";
import { ABYSS_SURGES, NEW_STD_GAUNTLET } from "../../weapons/standard.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { NM_MEPHIS, VOID_THUNDER_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- states */

/** Intuition: Cogitation Model's 24s mode, one stack a Hypercube — each Law of Reigns consumes
 *  one, and Intuition ends once all three are gone. */
const INTUITION = new Buff({ name: "Xiangli Yao: Intuition", maxStacks: 3, duration: 60 * 24 });

/* ----------------------------------------------------------------------------------- actions */

function xlyAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- basics, heavy, mid-air, dodge counter (Probe) — every hit feeds Capacity
// PLACEHOLDER FRAMES
const BA1 = xlyAction("Basic - Probe 1", { animFrames: 20, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 20, mv: 3311, energy: 42, concerto: 84, offtune: 1332 },
    { hitFrame: 20, mv: 3311, energy: 42, concerto: 84, offtune: 1332, forte1: 8 },
  ]});
const BA2 = xlyAction("Basic - Probe 2", { animFrames: 20, castPriority: 2, bullets: [{ hitFrame: 15, mv: 9961, energy: 126, concerto: 251, offtune: 4008, forte1: 14 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
// PLACEHOLDER FRAMES
const BA3 = xlyAction("Basic - Probe 3", { animFrames: 48, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 40, mv: 3976, energy: 50, concerto: 100, offtune: 1600 },
    { hitFrame: 40, mv: 3976, energy: 50, concerto: 100, offtune: 1600 },
    { hitFrame: 40, mv: 3976, energy: 50, concerto: 100, offtune: 1600, forte1: 15 },
  ]});
// PLACEHOLDER FRAMES
const BA4 = xlyAction("Basic - Probe 4", { animFrames: 48, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 32, mv: 5305, energy: 67, concerto: 134, offtune: 2135 },
    { hitFrame: 32, mv: 5305, energy: 67, concerto: 134, offtune: 2135 },
    { hitFrame: 32, mv: 2653, energy: 34, concerto: 67, offtune: 1068, forte1: 18 },
  ]});
const BA5 = xlyAction("Basic - Probe 5", { animFrames: 64, castPriority: 2, bullets: [{ hitFrame: 33, mv: 19881, energy: 250, concerto: 500, offtune: 8000, forte1: 20 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});

// PLACEHOLDER FRAMES
const HA = xlyAction("Heavy - Probe", { animFrames: 58, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 58, mv: 8281, energy: 105, concerto: 209, offtune: 3332 },
    { hitFrame: 58, mv: 8281, energy: 105, concerto: 209, offtune: 3332, forte1: 18 },
  ]});
const MA = xlyAction("Mid-air - Probe Plunge", { animFrames: 60, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 60, mv: 12327, energy: 52, concerto: 100, offtune: 4960, forte1: 13 }] });
const DC = xlyAction("Dodge Counter - Probe", { castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 23858, energy: 275, concerto: 250, offtune: 4000, forte1: 26 }], castConcerto: 1000 });

// PLACEHOLDER FRAMES
const Skill = xlyAction("Skill - Deduction", { animFrames: 41, castPriority: 4, cooldown: 60 * 5, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 15, mv: 9941, energy: 313, offtune: 2000 },
    { hitFrame: 15, mv: 9940, energy: 312, offtune: 2000, forte1: 40 },
  ], castConcerto: 700});
/** Decipher: spends the full 100 Capacity, considered Resonance Liberation DMG. */
const FSkill = xlyAction("Forte Skill - Decipher", { minForte1: 100, animFrames: 45, castPriority: 4, node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, bullets: [{ hitFrame: 45, mv: 39782, energy: 167, offtune: 5336 }], castConcerto: 700, castForte1: -100});

const Liberation = xlyAction("Liberation - Cogitation Model", { animFrames: 191, timestop: [0, 270], motionStop: [0, 191], castPriority: 10, cooldown: 60 * 25, node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 191, mv: 146606, offtune: 67200 }], castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => setStacksSelf(INTUITION, 3),
});

// Intuition's own moveset — Pivot - Impale basics, Divergence, Unfathomed; Performance Capacity
// (forte2) deltas are the kit text's own numbers
const UBA1 = xlyAction("Basic - Pivot: Impale 1", { requireBuff: INTUITION, animFrames: 60, castPriority: 2, node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 60, mv: 11967, energy: 131, concerto: 262, offtune: 4192, forte2: 1 }] });
// PLACEHOLDER FRAMES
const UBA2 = xlyAction("Basic - Pivot: Impale 2", { requireBuff: INTUITION, animFrames: 60, castPriority: 2, node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 60, mv: 6092, energy: 67, concerto: 134, offtune: 2134 },
    { hitFrame: 60, mv: 6092, energy: 67, concerto: 134, offtune: 2134 },
    { hitFrame: 60, mv: 6092, energy: 67, concerto: 134, offtune: 2134 },
    { hitFrame: 60, mv: 6092, energy: 67, concerto: 134, offtune: 2134, forte2: 2 },
  ]});
// PLACEHOLDER FRAMES
const UBA3 = xlyAction("Basic - Pivot: Impale 3", { requireBuff: INTUITION, animFrames: 60, castPriority: 2, node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 60, mv: 13325, energy: 146, concerto: 292, offtune: 4668 },
    { hitFrame: 60, mv: 13325, energy: 146, concerto: 292, offtune: 4668, forte2: 2 },
  ]});
// PLACEHOLDER FRAMES
const USkill = xlyAction("Skill - Divergence", { requireBuff: INTUITION, animFrames: 85, castPriority: 4, cooldown: 60 * 7, node: Node.Liberation, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 85, mv: 4959, energy: 100, concerto: 50, offtune: 932 },
    { hitFrame: 85, mv: 4959, energy: 100, concerto: 50, offtune: 932 },
    { hitFrame: 85, mv: 4959, energy: 100, concerto: 50, offtune: 932 },
    { hitFrame: 85, mv: 17355, energy: 347, concerto: 175, offtune: 3260 },
    { hitFrame: 85, mv: 17355, energy: 347, concerto: 175, offtune: 3260, forte2: 2 },
  ], castConcerto: 1000});
// PLACEHOLDER FRAMES
const UDC = xlyAction("Dodge Counter - Unfathomed", { castPriority: 8, requireBuff: INTUITION, node: Node.Liberation, cast: Cast.DodgeCounter, type: Type.Liberation, bullets: [
    { hitFrame: 0, mv: 3883, energy: 40, concerto: 50, offtune: 800 },
    { hitFrame: 0, mv: 3883, energy: 40, concerto: 50, offtune: 800 },
    { hitFrame: 0, mv: 31058, energy: 320, concerto: 400, offtune: 6400, forte2: 2 },
  ], castConcerto: 1000});

/** Law of Reigns: 5 Performance Capacity and a Hypercube a cast, considered Liberation DMG. */
// PLACEHOLDER FRAMES
const UForte = xlyAction("Forte Skill - Law of Reigns", { minForte2: 5, requireBuff: INTUITION, animFrames: 93, castPriority: 4, node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, bullets: [
    { hitFrame: 85, mv: 9573, energy: 72, offtune: 6840 },
    { hitFrame: 85, mv: 9573, energy: 72, offtune: 6840 },
    { hitFrame: 85, mv: 9573, energy: 72, offtune: 6840 },
    { hitFrame: 85, mv: 9573, energy: 72, offtune: 6840 },
    { hitFrame: 85, mv: 25528, energy: 190, offtune: 18240 },
  ], castConcerto: 1000, castForte2: -5,
  updateBuffs: () => removeStack(INTUITION, 1),
});
/** Revamp, the mid-air follow-up to Decipher/Divergence — considered Liberation DMG. */
// PLACEHOLDER FRAMES
const FBA = xlyAction("Mid-air - Revamp", { animFrames: 95, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 67, mv: 2187, energy: 28, offtune: 880 },
    { hitFrame: 67, mv: 2187, energy: 28, offtune: 880 },
    { hitFrame: 67, mv: 2187, energy: 28, offtune: 880 },
    { hitFrame: 67, mv: 2187, energy: 28, offtune: 880 },
    { hitFrame: 67, mv: 6561, energy: 83, offtune: 2640 },
    { hitFrame: 67, mv: 6561, energy: 83, offtune: 2640, forte2: 3 },
  ], castConcerto: 500});

/** S1's Convolution Matrices: six more instances off every Law of Reigns, each worth 8% of that
 *  skill's own multiplier — 51.06% apiece, and 89.86% once S6 raises the skill (nanoka's own rows,
 *  which carry no energy, concerto or off-tune of their own). */
const ConvolutionMatrices = xlyAction("Forte Skill - Convolution Matrices (S1)", { node: Node.Forte, type: Type.Liberation, bullets: [{ hitFrame: 0, mv: 5106 * 6 }] });

// PLACEHOLDER FRAMES
const Intro = xlyAction("Intro - Principle", { animFrames: 84, castPriority: 11, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 60, mv: 9941, energy: 500, offtune: 5600 },
    { hitFrame: 60, mv: 9941, energy: 500, offtune: 5600 },
  ], castConcerto: 1000});
/** Chain Rule: no damage of its own, just the handoff — its lasers are ACTION_OUTRO_COORD. */
const Outro = xlyAction("Outro - Chain Rule", {
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  // queued three times so the adopter picks the buff up at all three charges
  updateBuffs: () => { queueQTE(XLY_OUTRO); queueQTE(XLY_OUTRO); queueQTE(XLY_OUTRO); },
});
/** One laser beam — queued onto his own slot by XLY_OUTRO below, once per stack the incoming
 *  resonator's Basic casts consume. */
const CHAIN_RULE_FIELD = new ActionField("Xiangli Yao: Chain Rule");
const ACTION_OUTRO_COORD = xlyAction("Outro - Chain Rule (Laser)", { type: Type.Outro, bullets: [{ hitFrame: 0, mv: 23763 }], field: CHAIN_RULE_FIELD });

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
  outro: Outro,
  maxEnergy: 12500,
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
  ECHO.instaSwap(), OUTRO,
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
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill, Substat.Basic),
  rotation: XLY_ROTATION,
  sequences: XLY_SEQUENCES,
});
