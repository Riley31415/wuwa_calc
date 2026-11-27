/**
 * Baizhi, a free 4-star Glacio Rectifier healer (`Rarity.FreeS6`: a 4-star, so every node is held). She
 * fights through You'tan, who shares her stats.
 *
 * Concentration (forte1, max 4): one per Basic Attack press that lands. Heavy Attack spends all of it
 * on cast for +4 Concerto and +2.5 Energy a point; Emergency Plan spends all of it on its hit for +8
 * Concerto a point (S1: +2.5 Energy a point too). Each point spent is one team heal, one every 2s.
 *
 * Momentary Union heals and leaves 4 Remnant Entities (6 at S4): Coordinated Attacks at 4.07% of her
 * Max HP, the first as the Liberation heals and the rest 2.5s apart, each a team heal.
 *
 * Harmonic Range: Emergency Plan leaves a 15s field of Euphonia, and whoever Intros inside it picks it
 * up for +15% ATK for 20s; at S6 each pickup also gives the team +12% Glacio DMG Bonus for 20s.
 *
 * Rejuvenating Flow (Outro): a team-wide 30s that heals whoever is on field every 3s, each heal
 * amplifying their DMG 15% for 6s — the first lands 3s in (wuwalab's heals, 180-1620f), so a
 * resonator swapped in later gets it from the next heal on.
 *
 * MVs, gauges and frames off wuwalab (`/api/app/characters/baizhi`), checked against encore.moe
 * (character 1103); the regen rows and per-point Concentration gains are encore's rows as wuwalab
 * reads them.
 */
import { Rarity, Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling, Position, Input } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, coordinatedBuff } from "../../engine/gear.js";
import { applyCurrent, applyTeam, isHeld, casting, runningAction, addStat, addGain, forte1, queue, stacksOfTeam, currentTeam, addBuff, revokeTeam, notAfter, after, midair, concerto, grounded } from "../../engine/context.js";
import { Action, ActionField, ActionGroup, Rotation, SWAPIN, SUCCESSFUL_DODGE } from "../../engine/rotation.js";
import type { BulletDef } from "../../engine/rotation.js";
import { HEALS, heal } from "../status.js";
import { VARIATION } from "../../weapons/standard.js";
import { REJUV_5PC, FALLACY_MAINSLOT } from "../../echoes/jinzhou.js";
import { mainstats, Mainstat } from "../../echoes/mainstats.js";
import { Echoes } from "../../echoes/echoes.js";
import { substats, highSubs, Substat } from "../../echoes/substats.js";
import { SPACETREK_EXPLORER_MAINSLOT, STARRY_RADIANCE_5PC } from "../../echoes/lahairoi.js";
import { FORMRENDER_MAINSLOT, TINGED_YEARNING_5PC } from "../../echoes/mengzhou.js";
import { JINGRAN_RESONATOR } from "../fusion/jingran.js";
import { JINHSI_RESONATOR } from "../spectro/jinhsi.js";
import { SUOMING_RESONATOR } from "../electro/suoming.js";
import { HSIN_RESONATOR } from "../electro/hsin.js";
import { STELLAR_SYMPHONY } from "../../weapons/rectifier.js";

/* ----------------------------------------------------------------------------------- actions */

function baizhiAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}
/** A heal at `frame` (wuwalab's `heals[*]`): a bullet dealing nothing, carrying her healing marker. */
const healAt = (frame: number, also?: () => void): BulletDef =>
  ({ hitFrame: frame, element: null, type: null, subtype: null, updateDebuffs: () => { applyCurrent(HEALS, 1); also?.(); } });

// --- Normal Attack: 4 stages, a Concentration off each press's last hit (wuwalab's forte_1)
const BA1 = baizhiAction("Basic - Destined Promise 1", { input: Input.Basic, position: Position.Grounded, animFrames: 30, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 6548, energy: 102, concerto: 385, offtune: 10200, forte1: 1 },
  ]});
const BA2 = baizhiAction("Basic - Destined Promise 2", { input: Input.Basic, inputPriority: 1, after: [BA1], animFrames: 43, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 7857, energy: 123, concerto: 463, offtune: 12400, forte1: 1 },
  ]});
const BA3 = baizhiAction("Basic - Destined Promise 3", { input: Input.Basic, inputPriority: 1, after: [BA2], animFrames: 42, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 4, mv: 1310, energy: 20, concerto: 77, offtune: 2058 },
    { hitFrame: 6, mv: 1310, energy: 20, concerto: 77, offtune: 2058 },
    { hitFrame: 9, mv: 1310, energy: 20, concerto: 77, offtune: 2058 },
    { hitFrame: 12, mv: 1310, energy: 20, concerto: 77, offtune: 2058 },
    { hitFrame: 14, mv: 1310, energy: 20, concerto: 77, offtune: 2058 },
    { hitFrame: 17, mv: 1310, energy: 20, concerto: 77, offtune: 2058 },
    { hitFrame: 18, mv: 1310, energy: 20, concerto: 77, offtune: 2058, forte1: 1 },
  ]});
const BA4 = baizhiAction("Basic - Destined Promise 4", { input: Input.Basic, inputPriority: 1, after: [BA3], animFrames: 45, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 7857, energy: 123, concerto: 463, offtune: 12400, forte1: 1 },
  ]});
// wuwalab's swap-in Basic Attack (110.32%, encore's own row); never valid, no rotation opens on it
// const SwapInBasic = baizhiAction("Basic - Destined Promise (Swap-In)", { input: Input.Basic, valid: () => false, animFrames: 70, animPriority: { 0: 6, 48: 4 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
//     { hitFrame: 10, mv: 11032, energy: 173, concerto: 650, offtune: 17400 },
//   ]});
// a Plunging Attack: You'tan comes down, and so does she
const MA = baizhiAction("Mid-air - Destined Promise", { input: Input.Basic, position: Position.Midair, endPosition: Position.Grounded, animFrames: 60, animPriority: { 0: 4 }, castPriority: 4, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 13, mv: 7889, energy: 41, concerto: 100, offtune: 12400 },
  ]});
// the hidden +10 Concerto every dodge counter carries
const DC = baizhiAction("Dodge Counter - Destined Promise", { input: Input.Basic, after: [SUCCESSFUL_DODGE], animFrames: 55, animPriority: { 0: 8, 46: 4 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 17865, energy: 280, concerto: 603, offtune: 16080 },
  ], castConcerto: 1000});

/** Concentration's heals: one a point spent, every 2s, each her healing marker. */
const CONCENTRATION_HEALS = coordinatedBuff("Baizhi: Concentration (heals)", 8, () => BAIZHI_RESONATOR, heal, { every: 2 });

// --- Heavy Attack: the press, then a hit every 18f while held, then its 50f wind-down. Stimulus
//     Feedback heals off each hit; the press spends all the Concentration on cast (its own hook)
const stimulus = (): void => {
  applyCurrent(HEALS, 1);
};
const HA = baizhiAction("Heavy - Destined Promise", { input: Input.BasicHold, animFrames: 66, animPriority: { 0: 3 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 66, mv: 4886, energy: 60, concerto: 240, offtune: 5808, updateDebuffs: stimulus },
  ],
  updateBuffs: () => {
    // spent from the cap: a fifth banked past it buys nothing
    const n = Math.min(forte1(), 4);
    if (n <= 0) return;
    addGain({ forte1: -n, concerto: 400 * n, energy: 250 * n });
    applyTeam(CONCENTRATION_HEALS, n);
  },
});
// the hold's Loop and End are its length, not a state: disabled
// const HALoop = baizhiAction("Heavy - Destined Promise (Loop)", { input: Input.BasicHold, valid: () => false, animFrames: 18, animPriority: { 0: 3 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
//     { hitFrame: 18, mv: 4886, energy: 60, concerto: 249, offtune: 5808, updateDebuffs: stimulus },
//   ]});
// const HAEnd = baizhiAction("Heavy - Destined Promise (End)", { input: Input.BasicHold, valid: () => false, animFrames: 50, animPriority: { 0: 3 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy });

// --- Resonance Skill: heals at 18f, hits at 26f off her Max HP; the hit spends all the
//     Concentration for 8 Concerto a point (S1: 2.5 Energy a point too)
const Skill = baizhiAction("Skill - Emergency Plan", { input: Input.Skill, animFrames: 57, animPriority: { 0: 4, 49: 1 }, castPriority: 4, cooldown: 60 * 16, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, scaling: Scaling.Hp, bullets: [
    healAt(18),
    { hitFrame: 26, mv: 1594, energy: 700, offtune: 18000,
      updateDebuffs: () => {
        const n = Math.min(forte1(), 4);
        if (n <= 0) return;
        addGain({ forte1: -n, concerto: 800 * n, energy: isHeld(BZ_S1) ? 250 * n : 0 });
        applyTeam(CONCENTRATION_HEALS, n);
      } },
  ], castConcerto: 1000,
  updateBuffs: () => {
    // the field's second stack is S6, which every pickup reads (a teammate's turn can't ask her nodes)
    //applyTeam(EUPHONIA_FIELD, isHeld(BZ_S6) ? 2 : 1); // in practice, its difficult to pick up the field buffs
    // S2 reads the Concentration the cast finds, before its hit spends it
    if (isHeld(BZ_S2) && forte1() >= 4) applyCurrent(S2_TUNDRA, 1);
  },
});

// --- Resonance Liberation: a heal at 101f and the Remnant Entities, the first attacking with it
const REMNANT_FIELD = new ActionField("Baizhi: Remnant Entities");
/** One Remnant Entities attack: Coordinated Glacio DMG at 4.07% of her Max HP (S4 adds 1.20%), and a
 *  team heal on its hit. */
const Remnant = baizhiAction("Liberation - Remnant Entities", {
  node: Node.Liberation, type: Type.Liberation, subtype: Subtype.Coordinated, scaling: Scaling.Hp, field: REMNANT_FIELD,
  bullets: [{ hitFrame: 0, mv: 407, updateDebuffs: () => applyCurrent(HEALS, 1) }],
});
/** The Remnant Entities still to attack, 2.5s apart: 3 behind the first, 5 at S4. */
const REMNANTS = coordinatedBuff("Baizhi: Remnant Entities", 12.5, () => BAIZHI_RESONATOR, Remnant, { every: 2.5 });
const Liberation = baizhiAction("Liberation - Momentary Union", {
  input: Input.Liberation, animFrames: 132, animPriority: { 0: 10, 133: 0 }, castPriority: 10, timestop: [0, 132], motionStop: [0, 133], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    healAt(101, () => {
      queue(Remnant);
      applyTeam(REMNANTS, isHeld(BZ_S4) ? 5 : 3);
    }),
  ], castConcerto: 2000, castEnergy: -17500,
});

// --- Intro: heals on cast, You'tan's plunge at 52f; S3's Max HP rides it
const Intro = baizhiAction("Intro - Overflowing Frost", { input: Input.Intro, endPosition: Position.Grounded, qteFrames: 46, animFrames: 98, noSwapFrames: 99, animPriority: { 0: 11, 107: 1 }, castPriority: 11, motionStop: [4, 45], node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 52, mv: 7953, energy: 800, offtune: 32600 },
  ], castConcerto: 1000,
  updateBuffs: () => {
    applyCurrent(HEALS, 1);
    if (isHeld(BZ_S3)) applyCurrent(S3_VERITAS, 1);
  },
});

/** Rejuvenating Flow: no damage, just the team's heals and amplification for 30s. */
const Outro = baizhiAction("Outro - Rejuvenating Flow", {
  animFrames: 0, cast: Cast.Outro, input: Input.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => {
    // a fresh Outro starts its own 3s cadence: the last one's window comes off first
    revokeTeam(REJUV_HEALS);
    revokeTeam(REJUV_FLOW);
    applyTeam(REJUV_HEALS, REJUV_HEALS.maxStacks);
    applyTeam(REJUV_FLOW, 1);
  },
});

/* ------------------------------------------------------------------------------------ buffs */

/** Rejuvenating Flow's heals: every 3s for 30s, the first 3s in — nine, her healing marker each. */
const REJUV_HEALS = coordinatedBuff("Baizhi: Rejuvenating Flow (heals)", 27, () => BAIZHI_RESONATOR, heal, { every: 3 });
/** "The healed Resonator has their DMG Amplified by 15% for 6s", on each of those heals. */
const REJUV_AMP = new Buff({ name: "Baizhi: Rejuvenating Flow", duration: 60 * 6, stats: [[Stat.Amp, 15]] });
/** Held by the team: each of the nine heals amplifies whoever is on field at that moment. Nameless:
 *  the amplification is the row a popover shows. */
const REJUV_FLOW = new Buff({
  duration: 60 * 30,
  tick: {
    every: 180,
    fire: (n) => {
      const team = currentTeam(), active = team.slots[team.onField]!.resonator;
      if (n <= 9 && active) addBuff(active, REJUV_AMP, 1);
    },
  },
});

/** Harmonic Range (Inherent): Euphonia's +15% ATK for 20s, on whoever picks it up. */
const HARMONIC_RANGE = new Buff({ name: "Inherent: Harmonic Range", duration: 60 * 20, stats: [[Stat.BonusAtk, 15]] });
/** Emergency Plan's 15s Euphonia field: every Intro cast inside it picks the Euphonia up (and, its
 *  second stack being S6, gives the team Seeker's Devotion). */
const EUPHONIA_FIELD = new Buff({
  name: "Baizhi: Euphonia", maxStacks: 2, duration: 60 * 15,
  updateBuffs: () => {
    if (!casting(Cast.Intro)) return;
    applyCurrent(HARMONIC_RANGE, 1);
    if (stacksOfTeam(EUPHONIA_FIELD) === 2) applyTeam(S6_DEVOTION, 1);
  },
});
const BZ_INHERENT_1 = new Inherent({ name: "Inherent: Harmonic Range" });
/** Stimulus Feedback (Inherent): the Heavy Attack's heals, on its hits. */
const BZ_INHERENT_2 = new Inherent({ name: "Inherent: Stimulus Feedback" });

/** S1 Complex Simplicity: Emergency Plan's +2.5 Energy a Concentration spent (on its hit). */
const BZ_S1 = new Sequence({ name: "Baizhi S1: Complex Simplicity" });
/** S2 Silent Tundra: Emergency Plan cast on 4 Concentration — +15% Glacio DMG Bonus (and Healing) for 12s. */
const BZ_S2 = new Sequence({ name: "Baizhi S2: Silent Tundra" });
const S2_TUNDRA = new Buff({
  name: "Baizhi S2: Silent Tundra", duration: 60 * 12,
  stats: [[Stat.DmgBonus, 15, Attribute.Glacio], [Stat.HealingBonus, 15]],
});
/** S3 Veritas Lux Mea: Overflowing Frost — +12% Max HP for 10s. */
const BZ_S3 = new Sequence({ name: "Baizhi S3: Veritas Lux Mea" });
const S3_VERITAS = new Buff({ name: "Baizhi S3: Veritas Lux Mea", duration: 60 * 10, stats: [[Stat.BonusHp, 12]] });
/** S4 Eternal Verity: two more Remnant Entities (`REMNANTS`), and each deals 1.20% of her Max HP more. */
const BZ_S4 = new Sequence({
  name: "Baizhi S4: Eternal Verity",
  applyStats: () => { if (runningAction(Remnant)) addStat(Stat.AddMv, 120); },
});
/** S5 A Wish Answered: a revive — nothing to model. */
const BZ_S5 = new Sequence({ name: "Baizhi S5: A Wish Answered" });
/** S6 Seeker's Devotion: each Euphonia picked up — +12% Glacio DMG Bonus to the team for 20s (`EUPHONIA_FIELD`). */
const BZ_S6 = new Sequence({ name: "Baizhi S6: Seeker's Devotion" });
const S6_DEVOTION = new Buff({ name: "Baizhi S6: Seeker's Devotion", duration: 60 * 20, stats: [[Stat.DmgBonus, 12, Attribute.Glacio]] });

const BAIZHI_TALENTS = new Talent({
  name: "Baizhi: Talents",
  stats: [[Stat.BonusHp, 12], [Stat.HealingBonus, 12]],
});

export const BAIZHI_RESONATOR = new Resonator({
  id: 1103,
  name: "Baizhi",
  stats: [[Stat.BaseHp, 12812.5], [Stat.BaseAtk, 212.5], [Stat.BaseDef, 1002.2204]],
  talent: BAIZHI_TALENTS,
  inherent1: BZ_INHERENT_1,
  inherent2: BZ_INHERENT_2,
  element: Attribute.Glacio,
  weapon: WeaponType.Rectifier,
  color: "#9fdcd2",
  actions: [BA1, BA1.swapIn(), BA2, BA3, BA4, MA, MA.swapIn(), DC, HA, Skill, Liberation, Intro, Outro],
  maxEnergy: 17500,
  maxForte1: 4,
  tier: Rarity.FreeS6,
});

/* ---------------------------------------------------------------------------------- rotation */

const BA123 = new ActionGroup("Basic - Destined Promise 123", [BA1, BA2, BA3]);
const BA12 = new ActionGroup("Basic - Destined Promise 12", [BA1, BA2]);

const BZ_ROTATION = new Rotation([
  // opener: Ultimate, Skill and a Heavy off Basic 2s, swapping out as the Heavy's Concerto lands
  SWAPIN, BA12, Liberation,
  BA12, Skill,
  BA12, HA.instant(), Outro,

  // loop
  Intro, BA12, Liberation,
  BA123, Skill, Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// Verina's echo picks; her support spread
export const BAIZHI = new Loadout({
  id: 11031,
  resonator: BAIZHI_RESONATOR,
  weapons: [VARIATION, STELLAR_SYMPHONY],
  echoes: new Echoes({
    sets: [
      new EchoLoadout(FALLACY_MAINSLOT, REJUV_5PC),
      new EchoLoadout(SPACETREK_EXPLORER_MAINSLOT, STARRY_RADIANCE_5PC).requires(JINGRAN_RESONATOR),
      new EchoLoadout(FORMRENDER_MAINSLOT, TINGED_YEARNING_5PC).requires(JINHSI_RESONATOR, SUOMING_RESONATOR, HSIN_RESONATOR),
    ],
    mainstats: [mainstats(Mainstat.ATK4, Mainstat.ER3, Mainstat.ER3, Mainstat.ATK1, Mainstat.ATK1)],
    substats: substats(Substat.Er, Substat.CritRate, Substat.CritDmg, Substat.Liberation, Substat.AtkPct, Substat.Basic),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.Liberation, Substat.AtkPct, Substat.Basic, Substat.Heavy),
  }),
  rotation: BZ_ROTATION,
  sequences: [BZ_S1, BZ_S2, BZ_S3, BZ_S4, BZ_S5, BZ_S6],
});

// kept for a rotation that reaches them: the swap-in Basic, Basic 4, the Heavy's hold and wind-down,
// the dodge counter
void [BA4, DC];
