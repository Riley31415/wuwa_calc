/**
 * Changli, ported to the new engine — sequence-0 core loop, a limited 5-star
 * (`Tier.Limited`). A fusion sword main DPS. True Sight (12s, opened by Basic Attack Stage 4/
 * Mid-air Attack Stage 4/Resonance Skill/Intro) lets her next Basic Attack — ground or mid-air —
 * become True Sight: Conquest/Charge instead, both Resonance Skill DMG and both banking a stack
 * of Enflamement (max 4, also granted outright x4 by Liberation). Heavy Attack at 4 Enflamement
 * becomes Flaming Sacrifice, spending them all.
 *
 * Numbers from nanoka.cc (character 1205) and wuwalab.com for MV; energy/concerto come off the
 * old-engine reference file's own numbers (÷100 relative to this file's own scale). No offtune
 * anywhere in either source, so it's left off entirely rather than guessed at.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, matrix } from "../../engine/gear.js";
import {
  applyCurrent,
  revokeCurrent,
  onAction,
  runningAction,
  addStat,
  forte1,
  
  queueOutro,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, START_LAST, ECHO, INTRO } from "../../engine/rotation.js";
import { BLAZING_BRILLIANCE } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { NM_INFERNO_RIDER, MOLTEN_RIFT_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function changliAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// --- basics, dodge counter, heavy (Blazing Enlightenment). Stage 4 opens True Sight.
const BA1 = changliAction("Basic - Blazing Enlightenment 1", { animFrames: 27, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 2949, energy: 44, concerto: 88, offtune: 1396 },
    { hitFrame: 21, mv: 2949, energy: 44, concerto: 88, offtune: 1396 },
  ]});
const BA2 = changliAction("Basic - Blazing Enlightenment 2", { animFrames: 32, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 3549, energy: 53, concerto: 105, offtune: 1680 },
    { hitFrame: 21, mv: 3549, energy: 53, concerto: 105, offtune: 1680 },
  ]});
const BA3 = changliAction("Basic - Blazing Enlightenment 3", { animFrames: 39, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 3645, energy: 54, concerto: 108, offtune: 1726 },
    { hitFrame: 21, mv: 3645, energy: 54, concerto: 108, offtune: 1726 },
    { hitFrame: 29, mv: 3645, energy: 54, concerto: 108, offtune: 1726 },
  ]});
const BA4 = changliAction("Basic - Blazing Enlightenment 4", { animFrames: 68, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 5070, energy: 75, concerto: 150, offtune: 2400 },
    { hitFrame: 32, commitFrame: 14, mv: 2958, energy: 44, concerto: 88, offtune: 1400 },
    { hitFrame: 36, commitFrame: 14, mv: 2958, energy: 44, concerto: 88, offtune: 1400 },
    { hitFrame: 40, commitFrame: 14, mv: 2958, energy: 44, concerto: 88, offtune: 1400 },
    { hitFrame: 44, commitFrame: 14, mv: 2958, energy: 44, concerto: 88, offtune: 1400 },
  ]});
const DC = changliAction("Dodge Counter - Blazing Enlightenment 3", { animFrames: 39, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 8264, energy: 104, concerto: 208, offtune: 3326 },
    { hitFrame: 21, mv: 8264, energy: 104, concerto: 208, offtune: 3326 },
    { hitFrame: 29, mv: 8264, energy: 104, concerto: 208, offtune: 3326 },
  ], castConcerto: 1000});
const HA = changliAction("Heavy - Blazing Enlightenment", { animFrames: 47, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 14, mv: 2899, energy: 43, concerto: 86, offtune: 1372 },
    { hitFrame: 20, mv: 2899, energy: 43, concerto: 86, offtune: 1372 },
    { hitFrame: 26, mv: 2899, energy: 43, concerto: 86, offtune: 1372 },
    { hitFrame: 35, mv: 3727, energy: 56, concerto: 111, offtune: 1764 },
  ]});

// --- mid-air basics, mid-air heavy — the same combo, airborne. Stage 4 also opens True Sight.
const MA1 = changliAction("Mid-air - Blazing Enlightenment 1", { animFrames: 24, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 13, mv: 6135, energy: 91, concerto: 182, offtune: 2904 }]});
const MA2 = changliAction("Mid-air - Blazing Enlightenment 2", { animFrames: 39, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 17, mv: 5087, energy: 76, concerto: 151, offtune: 2408 },
    { hitFrame: 27, mv: 5087, energy: 76, concerto: 151, offtune: 2408 },
  ]});
const MA3 = changliAction("Mid-air - Blazing Enlightenment 3", { animFrames: 47, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 4400, energy: 66, concerto: 131, offtune: 2083 },
    { hitFrame: 25, mv: 4400, energy: 66, concerto: 131, offtune: 2083 },
    { hitFrame: 35, mv: 4400, energy: 66, concerto: 131, offtune: 2083 },
  ]});
const MA4 = changliAction("Mid-air - Blazing Enlightenment 4", { animFrames: 53, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 6, mv: 3803, energy: 57, concerto: 113, offtune: 1800 },
    { hitFrame: 18, commitFrame: 6, mv: 2218, energy: 33, concerto: 66, offtune: 1050 },
    { hitFrame: 24, commitFrame: 6, mv: 2218, energy: 33, concerto: 66, offtune: 1050 },
    { hitFrame: 29, commitFrame: 6, mv: 2218, energy: 33, concerto: 66, offtune: 1050 },
    { hitFrame: 35, commitFrame: 6, mv: 2218, energy: 33, concerto: 66, offtune: 1050 },
  ]});
const MHA = changliAction("Heavy - Blazing Enlightenment (Mid-Air)", { animFrames: 54, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 42, mv: 12327, energy: 155, concerto: 100, offtune: 4960 }]});

// --- True Sight's own finishers: Conquest (ground Basic), Charge (jump/mid-air Basic) — both
//     Resonance Skill DMG, both bank a stack of Enflamement and end True Sight
const SBA = changliAction("Basic - True Sight: Conquest", { animFrames: 73, node: Node.Skill, cast: Cast.Basic, type: Type.Skill, bullets: [
    { hitFrame: 26, mv: 5895, energy: 81, offtune: 1797, forte1: 1 },
    { hitFrame: 51, mv: 5895, energy: 81, offtune: 1797 },
    { hitFrame: 60, mv: 8252, energy: 113, offtune: 2516 },
    { hitFrame: 68, mv: 9431, energy: 129, offtune: 2875 },
  ], castConcerto: 700});
const SMA = changliAction("Basic - True Sight: Charge", { animFrames: 40, node: Node.Skill, cast: Cast.Basic, type: Type.Skill, bullets: [
    { hitFrame: 13, mv: 7268, energy: 103, offtune: 1741, forte1: 1 },
    { hitFrame: 26, mv: 10902, energy: 154, offtune: 2612 },
  ], castConcerto: 600});

// --- resonance skill: Tripartite Flames — also opens True Sight: Capture (bundled into this
//     one hit's own total per wuwalab, not a separate press)
// True Sight: Capture holds 2 charges, one back every 12s
const Skill = changliAction("Skill - Tripartite Flames", { animFrames: 89, cooldown: new Cooldown({ frames: 60 * 12, charges: 2 }), node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 10, mv: 8188, energy: 160, offtune: 2496 },
    { hitFrame: 18, mv: 8188, energy: 160, offtune: 2496 },
    { hitFrame: 27, mv: 8188, energy: 160, offtune: 2496 },
    { hitFrame: 74, mv: 16376, energy: 320, offtune: 4992 },
  ], castConcerto: 1400});

/** At 4 Enflamement — Sweeping Force's own +20% Fusion DMG Bonus/15% DEF ignore pays on this
 *  same hit (intrinsic to the cast, no separate lingering buff). */
const FlamingSacrifice = changliAction("Forte Heavy - Flaming Sacrifice", { minForte1: 4, animFrames: 76, node: Node.Forte, cast: Cast.Heavy, type: Type.Skill, bullets: [
    { hitFrame: 9, mv: 3925, energy: 40, offtune: 1869 },
    { hitFrame: 15, mv: 3925, energy: 40, offtune: 1869 },
    { hitFrame: 21, mv: 3925, energy: 40, offtune: 1869 },
    { hitFrame: 27, mv: 3925, energy: 40, offtune: 1869 },
    { hitFrame: 33, mv: 3925, energy: 40, offtune: 1869 },
    { hitFrame: 52, mv: 45785, energy: 461, offtune: 21796 },
  ], castConcerto: 1000, castForte1: -4});

// --- liberation: Radiance of Fealty — grants 4 Enflamement outright and opens Fiery Feather
const Liberation = changliAction("Liberation - Radiance of Fealty", {
  animFrames: 191, timestop: 189, motionStop: 158, cooldown: 60 * 20,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 163, mv: 121275, offtune: 100800 }], castConcerto: 2000, castForte1: 4, resetEnergy: true,
  updateBuffs: () => applyCurrent(FIERY_FEATHER, 1),
});

// --- intro / outro. Intro also opens True Sight.
const Intro = changliAction("Intro - Obedience of Rules", { animFrames: 45, prioFrames: 45, motionStop: 40, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 6, mv: 4450, energy: 300, offtune: 1791 },
    { hitFrame: 18, mv: 2596, energy: 175, offtune: 1045 },
    { hitFrame: 24, mv: 2596, energy: 175, offtune: 1045 },
    { hitFrame: 29, mv: 2596, energy: 175, offtune: 1045 },
    { hitFrame: 35, mv: 2596, energy: 175, offtune: 1045 },
  ], castConcerto: 1000});
const Outro = changliAction("Outro - Strategy of Duality", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => queueOutro(CHANGLI_OUTRO),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Opened by BA4/MA4/Skill/Intro — 12s, permanent uptime once granted, but still explicitly
 *  ended by whichever of Conquest/Charge actually spends it. */
const TRUE_SIGHT = new Buff({
  name: "Changli: True Sight",
  duration: 60 * 12,
});

/** Secret Strategist (Inherent Skill): each Enflamement stack held grants +5% Fusion DMG Bonus
 *  on Conquest/Charge specifically — genuinely unconditional. */
const CH_INHERENT_1 = new Inherent({
  name: "Inherent: Secret Strategist",
  applyStats: () => {
    if (runningAction(SBA) || runningAction(SMA)) addStat(Stat.DmgBonus, 5 * forte1(), Attribute.Fusion);
  },
});

/** Sweeping Force (Inherent Skill): +20% Fusion DMG Bonus/15% DEF ignore, intrinsic to Flaming
 *  Sacrifice and Liberation themselves. */
const CH_INHERENT_2 = new Inherent({
  name: "Inherent: Sweeping Force",
  applyStats: () => {
    if (runningAction(FlamingSacrifice) || runningAction(Liberation)) { addStat(Stat.DmgBonus, 20, Attribute.Fusion); addStat(Stat.DefIgnoreOld, 15); }
  },
});

/** Radiance of Fealty grants a 10s window where the next Flaming Sacrifice gets +25% ATK —
 *  one-shot, consumed once that press runs out. */
const FIERY_FEATHER = new Buff({
  name: "Changli: Fiery Feather",
  duration: 60 * 10,
  applyStats: () => { if (runningAction(FlamingSacrifice)) addStat(Stat.BonusAtk, 25); },
  afterAction: () => { if (runningAction(FlamingSacrifice)) revokeCurrent(FIERY_FEATHER); },
});

/** Strategy of Duality: the outro handoff — 10s, or the receiver switching out, whichever comes
 *  first. The stacks are the seconds it has run for, one added per engine second (Red Spring's own
 *  shape in sword.ts, counting up rather than down: an outro handoff is adopted one stack at a
 *  time, so there is no full bar to spend). They are not a payout — the stats below stand whole
 *  while any stack remains — so what the count is shown as is the time it has left. */
const CHANGLI_OUTRO: Buff = new Buff({
  name: "Changli: Outro",
  duration: 60 * 10,
  stats: [[Stat.Amp, 20, Attribute.Fusion], [Stat.Amp, 25, Type.Liberation]],
  lostOnSwap: true,
});

/* --------------------------------------------------------------------------- resonance chain */

// "Resonance Skill Tripartite Flames" is the whole skill entry on nanoka — Conquest and Charge are
// listed under it as Resonance Skill DMG — so S1 and S6 read it as all three presses
const tripartite = (): boolean => runningAction(Skill) || runningAction(SBA) || runningAction(SMA);

/** S1: Tripartite Flames and Flaming Sacrifice deal +10% DMG. */
const CH_S1 = new Sequence({
  name: "Changli S1: Hidden Thoughts",
  applyStats: () => { if (tripartite() || runningAction(FlamingSacrifice)) addStat(Stat.DmgBonus, 10); },
});

/** S2: +25% Crit Rate for 8s on gaining Enflamement. Conquest/Charge/Liberation each bank a stack
 *  and land within 8s of each other all visit, so it stands until the outro. */
const PURSUIT_OF_DESIRES = new Buff({
  name: "Changli S2: Pursuit of Desires",
  duration: 60 * 8,
  stats: [[Stat.CritRate, 25]],
});
const CH_S2 = new Sequence({
  name: "Changli S2: Pursuit of Desires",
  updateBuffs: () => { if (runningAction(SBA) || runningAction(SMA) || runningAction(Liberation)) applyCurrent(PURSUIT_OF_DESIRES, 1); },
});

/** S3: Radiance of Fealty's DMG +80% — read as DMG dealt, same as S1/S5. */
const CH_S3 = new Sequence({
  name: "Changli S3: Learned Secrets",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.DmgBonus, 80); },
});

/** S4: +20% ATK for the whole team for 30s off her Intro — long enough to be permanent. */
const POLISHED_WORDS = new Buff({
  name: "Changli S4: Polished Words",
  duration: 60 * 30,
  stats: [[Stat.BonusAtk, 20]],
});
const CH_S4 = new Sequence({
  name: "Changli S4: Polished Words",
  grants: [{ on: onAction(Intro), buff: POLISHED_WORDS, to: BuffTarget.Team }],
});

/** S5: Flaming Sacrifice's multiplier +50% and its DMG dealt +50%. */
const CH_S5 = new Sequence({
  name: "Changli S5: Sacrificed Gains",
  applyStats: () => { if (runningAction(FlamingSacrifice)) { addStat(Stat.MulMv, 50); addStat(Stat.DmgBonus, 50); } },
});

/** S6: Tripartite Flames, Flaming Sacrifice and Radiance of Fealty ignore a further 40% DEF. */
const CH_S6 = new Sequence({
  name: "Changli S6: Realized Plans",
  applyStats: () => {
    if (tripartite() || runningAction(FlamingSacrifice) || runningAction(Liberation)) addStat(Stat.DefIgnoreOld, 40);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CHANGLI_TALENTS = new Talent({
  name: "Changli: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const CHANGLI_RESONATOR = new Resonator({
  name: "Changli",
  stats: [[Stat.BaseHp, 10387.5], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1099.998]],
  matrix: matrix("Changli", 25),
  talent: CHANGLI_TALENTS,
  inherent1: CH_INHERENT_1,
  inherent2: CH_INHERENT_2,
  element: Attribute.Fusion,
  weapon: WeaponType.Sword,
  color: "#f38b68",
  intro: Intro,
  maxEnergy: 12500,
  maxForte1: 4,

  // her combo finishers/Skill/Intro arm True Sight; the two Sword-of-Fealty casts spend it
  updateBuffs: () => {
    if (runningAction(BA4) || runningAction(MA4) || runningAction(Skill) || runningAction(Intro)) applyCurrent(TRUE_SIGHT, 1);
    if (runningAction(SBA) || runningAction(SMA)) revokeCurrent(TRUE_SIGHT);
  },

});

const BA1234 = new ActionGroup("Basic - Blazing Enlightenment 1234", [BA1, BA2, BA3, BA4]);
const BA34 = new ActionGroup("Basic - Blazing Enlightenment 34", [BA3, BA4]);

const CH_ROTATION = new Rotation([
  START_LAST, Skill, Liberation, FlamingSacrifice.instaSwap(),

  INTRO, SMA.cancel(),
  Skill, SMA.cancel(),
  Skill, SMA, 
  MHA, BA34.dodgeCancel(), SBA,
  FlamingSacrifice.cancel(),
  Liberation, FlamingSacrifice.swapCancel(),
  Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const CHANGLI = new Loadout({
  resonator: CHANGLI_RESONATOR,
  sequences: [CH_S1, CH_S2, CH_S3, CH_S4, CH_S5, CH_S6],
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(NM_INFERNO_RIDER, MOLTEN_RIFT_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
    rotation: CH_ROTATION,
});
