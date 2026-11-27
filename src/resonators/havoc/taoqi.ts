/**
 * Taoqi, a free 4-star Havoc Broadblade support (`Rarity.FreeS6`: a 4-star, so every node is held).
 *
 * Rocksteady Shield (a 3-stack buff, `ROCKSTEADY`): Fortified Defense grants 3 for 12s (30s at S3).
 * Basic Attack 4 consumes all of them on its hit for that many Resolving Caliber; whatever remains
 * when they run out converts the same way. Steadfast Protection's +15% DEF stands while they do, and
 * so does S6's +40% Basic/Heavy DMG. Being attacked is never modelled, so no shield is spent on a hit.
 *
 * Resolving Caliber (forte1, max 3): the Intro banks 3 (wuwalab's on-cast forte), and Basic Attack
 * after the Intro or a Strategic Parry casts Timed Counters, up to 3 hits, each spending 1 on its hit
 * for a shield.
 *
 * Iron Will (Outro): the incoming Resonator's Resonance Skill DMG Amplified by 38% for 14s, lost on
 * swapping out.
 *
 * MVs, gauges, frames and priorities off wuwalab (`/api/app/characters/taoqi`), checked against
 * encore.moe (character 1601)'s level-10 rows and text. Only the Liberation scales off DEF.
 */
import { Rarity, Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, Position, Input } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import { applyCurrent, isHeld, stacksOf, revokeCurrent, addGain, addStat, runningAction, runningAnyOf, queueQTE, notAfter, after, midair, forte1, concerto, grounded } from "../../engine/context.js";
import { Action, ActionGroup, Rotation, SWAPIN, SUCCESSFUL_DODGE } from "../../engine/rotation.js";
import { HEALS, gainShield } from "../status.js";
import { DISCORD, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { HERON_MAINSLOT, MOONLIT_CLOUDS_5PC, HERON } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../echoes/mainstats.js";
import { Echoes } from "../../echoes/echoes.js";
import { substats, highSubs, Substat } from "../../echoes/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function taoqiAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// --- Normal Attack: 4 stages; Basic 4's hit turns every Rocksteady Shield into Resolving Caliber
const BA1 = taoqiAction("Basic - Concealed Edge 1", { input: Input.Basic, position: Position.Grounded, animFrames: 29, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 9013, energy: 116, concerto: 350, offtune: 4534 },
  ]});
const BA2 = taoqiAction("Basic - Concealed Edge 2", { input: Input.Basic, inputPriority: 1, after: [BA1], animFrames: 35, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, mv: 8484, energy: 108, concerto: 390, offtune: 4267 },
  ]});
const BA3 = taoqiAction("Basic - Concealed Edge 3", { input: Input.Basic, inputPriority: 1, after: [BA2], animFrames: 74, animPriority: { 0: 2, 1: 3, 11: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 36, mv: 5567, energy: 280, concerto: 650, offtune: 2800 },
    { hitFrame: 62, mv: 5567, energy: 280, concerto: 650, offtune: 2800 },
  ]});
const BA4 = taoqiAction("Basic - Concealed Edge 4", { input: Input.Basic, inputPriority: 1, after: [BA3], animFrames: 72, animPriority: { 0: 2, 21: 4, 39: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 36, mv: 27039, energy: 296, concerto: 810, offtune: 13600, updateDebuffs: () => convertShields() },
  ]});
// a Plunging Attack
const MA = taoqiAction("Mid-air - Concealed Edge", { input: Input.Basic, position: Position.Midair, endPosition: Position.Grounded, animFrames: 72, animPriority: { 0: 6, 63: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 42, mv: 12327, energy: 51, concerto: 100, offtune: 4960 },
  ]});
// the hidden +10 Concerto every dodge counter carries
const DC = taoqiAction("Dodge Counter - Concealed Edge", { input: Input.Basic, after: [SUCCESSFUL_DODGE], animFrames: 48, animPriority: { 0: 5, 40: 2 }, castPriority: 5, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 24852, energy: 497, concerto: 693, offtune: 6934 },
  ], castConcerto: 1000});

// --- Heavy Attack, and Strategic Parry: cast when struck in Rocksteady Defense (held Basic Attack), or
//     by itself once that has stood 3s. No enemy attacks here, so no rotation casts it
const HA = taoqiAction("Heavy - Concealed Edge", { input: Input.BasicHold, animFrames: 77, animPriority: { 0: 3, 18: 3, 77: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 30, mv: 22035, energy: 466, concerto: 346, offtune: 9334 },
  ]});
// never valid: it answers an enemy attack, and none is modelled
// const Parry = taoqiAction("Heavy - Strategic Parry", { input: Input.BasicHold, valid: () => false, animFrames: 61, animPriority: { 0: 5, 30: 2 }, castPriority: 5, node: Node.Normal, cast: Cast.Heavy, type: Type.Basic, bullets: [
//     { hitFrame: 4, mv: 7870, energy: 346, concerto: 500, updateDebuffs: () => heavylifting() },
//   ]});

// --- Forte Circuit: Timed Counters, after the Intro or a Strategic Parry while carrying Resolving
//     Caliber; each hit spends one for a shield (S5: +20 Energy a hit)
const counterHit = (): void => {
  gainShield();
  if (isHeld(TQ_S5)) addGain({ energy: 2000 });
};

// --- Resonance Skill: heals her and grants 3 Rocksteady Shield
const Skill = taoqiAction("Skill - Fortified Defense", { input: Input.Skill, animFrames: 55, animPriority: { 0: 4 }, castPriority: 4, cooldown: 60 * 15, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 32, mv: 13492, energy: 1000, offtune: 6400, updateDebuffs: () => applyCurrent(HEALS, 1) },
  ], castConcerto: 1500,
  updateBuffs: () => { applyCurrent(ROCKSTEADY, 3); },
});

// --- Resonance Liberation: off her DEF
const Liberation = taoqiAction("Liberation - Unmovable", {
  input: Input.Liberation, animFrames: 145, animPriority: { 0: 10, 124: 2 }, castPriority: 10, timestop: [0, 145], motionStop: [0, 103], cooldown: 60 * 16,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, scaling: Scaling.Def, bullets: [
    { hitFrame: 100, mv: 44971, offtune: 61440 },
  ], castConcerto: 2000, castEnergy: -12500,
});

// --- Intro: banks 3 Resolving Caliber on cast (wuwalab's on-cast forte), so Timed Counters follow it
const Intro = taoqiAction("Intro - Defense Formation", { input: Input.Intro, endPosition: Position.Grounded, qteFrames: 58, animFrames: 104, noSwapFrames: 90, animPriority: { 0: 11, 104: 1 }, castPriority: 11, motionStop: [4, 61], node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 64, mv: 20876, energy: 1000, offtune: 6667 },
  ], castConcerto: 1000, castForte1: 3,
});

/** Iron Will: no damage, the incoming Resonator's Skill amplification. */
const Outro = taoqiAction("Outro - Iron Will", {
  animFrames: 0, cast: Cast.Outro, input: Input.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => queueQTE(IRON_WILL),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Rocksteady Shield: 3 stacks, 12s (30s at S3); what is left as they run out turns to Resolving Caliber. */
const shieldLife = (): number => (isHeld(TQ_S3) ? 60 * 30 : 60 * 12);
const ROCKSTEADY = new Buff({
  name: "Taoqi: Rocksteady Shield", maxStacks: 3, duration: () => shieldLife(),
  // the frame before they run out: every shield left becomes a Resolving Caliber
  tick: { every: () => shieldLife() - 1, fire: (n) => { if (n === 1) convertShields(); } },
});
/** Every Rocksteady Shield held, spent for as many Resolving Caliber. */
function convertShields(): void {
  const n = stacksOf(ROCKSTEADY);
  if (!n) return;
  addGain({ forte1: n });
  revokeCurrent(ROCKSTEADY);
}

/** Iron Will (Outro): the incoming Resonator's Resonance Skill DMG Amplified by 38% for 14s. */
const IRON_WILL = new Buff({
  name: "Taoqi: Outro",
  duration: 60 * 14,
  stats: [[Stat.Amp, 38, Type.Skill]],
  lostOnSwap: true,
});

/** Steadfast Protection (Inherent): +15% DEF while Rocksteady Shield lasts. */
const TQ_INHERENT_1 = new Inherent({
  name: "Inherent: Steadfast Protection",
  applyStats: () => { if (isHeld(ROCKSTEADY)) addStat(Stat.BonusDef, 15); },
});
/** Unyielding (Inherent): Stamina back off Strategic Parry — nothing this calculator reads. */
const TQ_INHERENT_2 = new Inherent({ name: "Inherent: Unyielding" });

/** S1 Essense of Tranquility: Power Shift's shields +40% — no damage. */
const TQ_S1 = new Sequence({ name: "Taoqi S1: Essense of Tranquility" });
/** S2 Silent Strength: Unmovable's Crit Rate and Crit DMG +20%. */
const TQ_S2 = new Sequence({
  name: "Taoqi S2: Silent Strength",
  applyStats: () => {
    if (!runningAction(Liberation)) return;
    addStat(Stat.CritRate, 20);
    addStat(Stat.CritDmg, 20);
  },
});
/** S3 Keen-eyed Observer: Rocksteady Shield lasts 30s (`shieldLife`). */
const TQ_S3 = new Sequence({ name: "Taoqi S3: Keen-eyed Observer" });
/** S4 Heavylifting Duty: Strategic Parry — +50% DEF for 5s, once every 15s (`heavylifting`). */
const TQ_S4 = new Sequence({ name: "Taoqi S4: Heavylifting Duty" });
const HEAVYLIFTING = new Buff({ name: "Taoqi S4: Heavylifting Duty", duration: 60 * 5, stats: [[Stat.BonusDef, 50]] });
const HEAVYLIFTING_CD = new Buff({ duration: 60 * 15 });
function heavylifting(): void {
  if (!isHeld(TQ_S4) || isHeld(HEAVYLIFTING_CD)) return;
  applyCurrent(HEAVYLIFTING, 1);
  applyCurrent(HEAVYLIFTING_CD, 1);
}
/** S5 Benevolent Guardian: Power Shift's DMG +50%, and +20 Energy a hit (`counterHit`). */
const TQ_S5 = new Sequence({
  name: "Taoqi S5: Benevolent Guardian",
  applyStats: () => { if (runningAnyOf(COUNTERS)) addStat(Stat.DmgBonus, 50); },
});
const TC1 = taoqiAction("Forte Basic - Timed Counters 1", { input: Input.Basic, inputPriority: 1, after: [Intro], minForte1: 1, animFrames: 27, animPriority: { 0: 5 }, castPriority: 5, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 8620, energy: 346, concerto: 500, offtune: 3440, forte1: -1, updateDebuffs: counterHit },
  ]});
const TC2 = taoqiAction("Forte Basic - Timed Counters 2", { input: Input.Basic, inputPriority: 1, after: [TC1], minForte1: 1, animFrames: 33, animPriority: { 0: 5 }, castPriority: 5, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 22, mv: 11093, energy: 346, concerto: 500, offtune: 4240, forte1: -1, updateDebuffs: counterHit },
  ]});
const TC3 = taoqiAction("Forte Basic - Timed Counters 3", { input: Input.Basic, inputPriority: 1, after: [TC2], minForte1: 1, animFrames: 79, animPriority: { 0: 5 }, castPriority: 5, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 56, mv: 14541, energy: 346, concerto: 500, offtune: 9360, forte1: -1, updateDebuffs: counterHit },
  ]});
const COUNTERS = new Set<Action>([TC1, TC2, TC3]);
/** S6 Defender of Peace: Basic and Heavy Attack DMG +40% while Rocksteady Shield holds. */
const TQ_S6 = new Sequence({
  name: "Taoqi S6: Defender of Peace",
  applyStats: () => {
    if (!isHeld(ROCKSTEADY)) return;
    addStat(Stat.DmgBonus, 40, Type.Basic);
    addStat(Stat.DmgBonus, 40, Type.Heavy);
  },
});

const TAOQI_TALENTS = new Talent({
  name: "Taoqi: Talents",
  stats: [[Stat.DmgBonus, 12, Attribute.Havoc], [Stat.BonusDef, 15.2]],
});

export const TAOQI_RESONATOR = new Resonator({
  id: 1601,
  name: "Taoqi",
  stats: [[Stat.BaseHp, 8950], [Stat.BaseAtk, 225], [Stat.BaseDef, 1564.4416]],
  talent: TAOQI_TALENTS,
  inherent1: TQ_INHERENT_1,
  inherent2: TQ_INHERENT_2,
  element: Attribute.Havoc,
  weapon: WeaponType.Broadblade,
  color: "#c97d90",
  actions: [BA1, BA1.swapIn(), BA2, BA3, BA4, MA, MA.swapIn(), DC, HA, TC1, TC2, TC3, Skill, Liberation, Intro, Outro],
  maxEnergy: 12500,
  maxForte1: 3,
  tier: Rarity.FreeS6,
});

/* ---------------------------------------------------------------------------------- rotation */

const BA1234 = new ActionGroup("Basic - Concealed Edge 1234", [BA1, BA2, BA3, BA4]);
const TC123 = new ActionGroup("Forte Basic - Timed Counters 123", [TC1, TC2, TC3]);

const BA123 = new ActionGroup("Basic - Concealed Edge 123", [BA1, BA2, BA3]);

// Timed Counters 3 holds priority 5 to its end, so they play out; Basic 1-3 after Basic 4 fill the
// Concerto Iron Will needs on any weapon (Discord's +8 aside)
const TQ_ROTATION = new Rotation([
  // opener: the shields, Basic 4 turning them into Caliber, then the Liberation
  SWAPIN, Skill, BA1234, BA123, Liberation, BA1234, HERON.instant(), Outro,

  // loop: Timed Counters off the Intro's Caliber, the shields, Basic 4 to bank them for the next Intro
  Intro, TC123, Skill, BA1234, Liberation, BA1, HERON.instant(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

export const TAOQI = new Loadout({
  id: 16011,
  resonator: TAOQI_RESONATOR,
  weapons: [DISCORD, LUSTROUS_RAZOR],
  echoes: new Echoes({
    sets: [new EchoLoadout(HERON_MAINSLOT, MOONLIT_CLOUDS_5PC)],
    mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ER3, Mainstat.ATK1),
    substats: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Liberation, Substat.Basic, Substat.FlatAtk),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.Basic, Substat.FlatAtk, Substat.Skill),
  }),
  rotation: TQ_ROTATION,
  sequences: [TQ_S1, TQ_S2, TQ_S3, TQ_S4, TQ_S5, TQ_S6],
});

// kept for a rotation that reaches them: the Heavy, Strategic Parry, the dodge counter
void [HA, DC];
