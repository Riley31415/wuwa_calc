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
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  revokeCurrent,
  casting,
  currentAction,
  addStat,
  forte1,
  queueOutro,
} from "../../engine/context.js";
import { lostOnSwap, matrix } from "../../shared/helpers.js";
import { Action, Rotation, START_2, START_3, SWAP, INTRO, OUTRO, DODGE } from "../../engine/rotation.js";
import { BLAZING_BRILLIANCE } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { NM_INFERNO_RIDER, MOLTEN_RIFT_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function changliAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// --- basics, dodge counter, heavy (Blazing Enlightenment). Stage 4 opens True Sight.
const BA1 = changliAction("Basic - Blazing Enlightenment 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 58.98, offtune: 2792, energy: 0.88, concerto: 1.76 });
const BA2 = changliAction("Basic - Blazing Enlightenment 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 70.98, offtune: 3360, energy: 1.06, concerto: 2.10 });
const BA3 = changliAction("Basic - Blazing Enlightenment 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 109.35, offtune: 5178, energy: 1.62, concerto: 3.24 });
const BA4 = changliAction("Basic - Blazing Enlightenment 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 169.02, offtune: 8000, energy: 2.51, concerto: 5.02 });
const DC = changliAction("Dodge Counter - Blazing Enlightenment 3", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 247.92, offtune: 9978, energy: 3.12, concerto: 16.24 });
const HA = changliAction("Heavy - Blazing Enlightenment", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 124.24, offtune: 5880, energy: 1.85, concerto: 3.69 });

// --- mid-air basics, mid-air heavy — the same combo, airborne. Stage 4 also opens True Sight.
const MA1 = changliAction("Mid-air - Blazing Enlightenment 1", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 61.35, offtune: 2904, energy: 0.91, concerto: 1.82 });
const MA2 = changliAction("Mid-air - Blazing Enlightenment 2", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 101.74, offtune: 4816, energy: 1.52, concerto: 3.02 });
const MA3 = changliAction("Mid-air - Blazing Enlightenment 3", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 132.00, offtune: 6249, energy: 1.98, concerto: 3.93 });
const MA4 = changliAction("Mid-air - Blazing Enlightenment 4", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 126.75, offtune: 6000, energy: 1.89, concerto: 3.77 });
const MHA = changliAction("Heavy - Blazing Enlightenment (Mid-Air)", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 123.27, offtune: 4960, energy: 1.55, concerto: 1.00 });

// --- True Sight's own finishers: Conquest (ground Basic), Charge (jump/mid-air Basic) — both
//     Resonance Skill DMG, both bank a stack of Enflamement and end True Sight
const SBA = changliAction("Basic - True Sight: Conquest", { node: Node.Skill, cast: Cast.Basic, type: Type1.Skill, mv: 294.73, offtune: 8985, energy: 4.04, concerto: 7.00, forte1: 1 });
const SMA = changliAction("Basic - True Sight: Charge", { node: Node.Skill, cast: Cast.Basic, type: Type1.Skill, mv: 181.70, offtune: 4353, energy: 2.57, concerto: 6.00, forte1: 1 });

// --- resonance skill: Tripartite Flames — also opens True Sight: Capture (bundled into this
//     one hit's own total per wuwalab, not a separate press)
const Skill = changliAction("Skill - Tripartite Flames", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 409.40, offtune: 12480, energy: 8.00, concerto: 14.00 });

/** At 4 Enflamement — Sweeping Force's own +20% Fusion DMG Bonus/15% DEF ignore pays on this
 *  same hit (intrinsic to the cast, no separate lingering buff). */
const FlamingSacrifice = changliAction("Forte Heavy - Flaming Sacrifice", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Skill, mv: 654.10, offtune: 31141, energy: 6.61, concerto: 10.00, forte1: -4 });

// --- liberation: Radiance of Fealty — grants 4 Enflamement outright and opens Fiery Feather
const Liberation = changliAction("Liberation - Radiance of Fealty", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1212.75, offtune: 100800, concerto: 20, forte1: 4, resetEnergy: true,
  updateBuffs: () => applyCurrent(FIERY_FEATHER, 1),
});

// --- intro / outro. Intro also opens True Sight.
const Intro = changliAction("Intro - Obedience of Rules", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 148.34, offtune: 5971, energy: 10, concerto: 10 });
const Outro = changliAction("Outro - Strategy of Duality", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => queueOutro(CHANGLI_OUTRO),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Opened by BA4/MA4/Skill/Intro — 12s, permanent uptime once granted, but still explicitly
 *  ended by whichever of Conquest/Charge actually spends it. */
const TRUE_SIGHT = new Buff({
  name: "Changli: True Sight",
});

/** Secret Strategist (Inherent Skill): each Enflamement stack held grants +5% Fusion DMG Bonus
 *  on Conquest/Charge specifically — genuinely unconditional. */
const CH_INHERENT_1 = new Inherent({
  name: "Inherent: Secret Strategist",
  applyStats: () => {
    const a = currentAction();
    if (a === SBA || a === SMA) addStat(Stat.DmgBonus, 5 * forte1(), Attribute.Fusion);
  },
});

/** Sweeping Force (Inherent Skill): +20% Fusion DMG Bonus/15% DEF ignore, intrinsic to Flaming
 *  Sacrifice and Liberation themselves. */
const CH_INHERENT_2 = new Inherent({
  name: "Inherent: Sweeping Force",
  applyStats: () => {
    const a = currentAction();
    if (a === FlamingSacrifice || a === Liberation) { addStat(Stat.DmgBonus, 20, Attribute.Fusion); addStat(Stat.DefIgnoreOld, 15); }
  },
});

/** Radiance of Fealty grants a 10s window where the next Flaming Sacrifice gets +25% ATK —
 *  one-shot, consumed the instant it lands. */
const FIERY_FEATHER = new Buff({
  name: "Changli: Fiery Feather",
  applyStats: () => { if (currentAction() === FlamingSacrifice) addStat(Stat.BonusAtk, 25); },
  convertStats: () => { if (currentAction() === FlamingSacrifice) revokeCurrent(FIERY_FEATHER); },
});

/** Strategy of Duality: the outro handoff. */
const CHANGLI_OUTRO = new Buff({
  name: "Changli: Outro",
  applyStats: () => { addStat(Stat.Amp, 20, Attribute.Fusion); addStat(Stat.Amp, 25, Type1.Liberation); },
  updateBuffs: () => { lostOnSwap(); },
});

/* --------------------------------------------------------------------------- resonance chain */

// "Resonance Skill Tripartite Flames" is the whole skill entry on nanoka — Conquest and Charge are
// listed under it as Resonance Skill DMG — so S1 and S6 read it as all three presses
const tripartite = (a: Action): boolean => a === Skill || a === SBA || a === SMA;

/** S1: Tripartite Flames and Flaming Sacrifice deal +10% DMG. */
const CH_S1 = new Sequence({
  name: "Changli S1: Hidden Thoughts",
  applyStats: () => { const a = currentAction(); if (tripartite(a) || a === FlamingSacrifice) addStat(Stat.DmgBonus, 10); },
});

/** S2: +25% Crit Rate for 8s on gaining Enflamement. Conquest/Charge/Liberation each bank a stack
 *  and land within 8s of each other all visit, so it stands until the outro. */
const PURSUIT_OF_DESIRES = new Buff({
  name: "Changli S2: Pursuit of Desires",
  applyStats: () => addStat(Stat.CritRate, 25),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(PURSUIT_OF_DESIRES); },
});
const CH_S2 = new Sequence({
  name: "Changli S2: Pursuit of Desires",
  updateBuffs: () => { const a = currentAction(); if (a === SBA || a === SMA || a === Liberation) applyCurrent(PURSUIT_OF_DESIRES, 1); },
});

/** S3: Radiance of Fealty's DMG +80% — read as DMG dealt, same as S1/S5. */
const CH_S3 = new Sequence({
  name: "Changli S3: Learned Secrets",
  applyStats: () => { if (currentAction() === Liberation) addStat(Stat.DmgBonus, 80); },
});

/** S4: +20% ATK for the whole team for 30s off her Intro — long enough to be permanent. */
const POLISHED_WORDS = new Buff({
  name: "Changli S4: Polished Words (team)",
  applyStats: () => addStat(Stat.BonusAtk, 20),
});
const CH_S4 = new Sequence({
  name: "Changli S4: Polished Words",
  updateBuffs: () => { if (currentAction() === Intro) applyTeam(POLISHED_WORDS, 1); },
});

/** S5: Flaming Sacrifice's multiplier +50% and its DMG dealt +50%. */
const CH_S5 = new Sequence({
  name: "Changli S5: Sacrificed Gains",
  applyStats: () => { if (currentAction() === FlamingSacrifice) { addStat(Stat.MulMv, 50); addStat(Stat.DmgBonus, 50); } },
});

/** S6: Tripartite Flames, Flaming Sacrifice and Radiance of Fealty ignore a further 40% DEF. */
const CH_S6 = new Sequence({
  name: "Changli S6: Realized Plans",
  applyStats: () => {
    const a = currentAction();
    if (tripartite(a) || a === FlamingSacrifice || a === Liberation) addStat(Stat.DefIgnoreOld, 40);
  },
});

const CHANGLI_RESONATOR = new Resonator({
  name: "Changli",
  element: Attribute.Fusion,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  outro: () => Outro,
  color: "#f38b68",
  maxEnergy: 125,

  // her combo finishers/Skill/Intro arm True Sight; the two Sword-of-Fealty casts spend it
  updateBuffs: () => {
    const a = currentAction();
    if (a === BA4 || a === MA4 || a === Skill || a === Intro) applyCurrent(TRUE_SIGHT, 1);
    if (a === SBA || a === SMA) revokeCurrent(TRUE_SIGHT);
  },

  constantStats: () => {
    addStat(Stat.BaseHp, 12762); addStat(Stat.BaseAtk, 410); addStat(Stat.BaseDef, 1181);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CHANGLI_TALENTS = new Talent({
  name: "Changli: Talents",
  constantStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

const CH_ROTATION = new Rotation([
  START_3, Liberation, FlamingSacrifice.swap(), SWAP,
  // TODO get cancels
  INTRO, SMA,
  Skill, SBA,
  Skill, SBA,
  BA1, BA2, BA3, BA4, DODGE, SBA,
  FlamingSacrifice,
  Liberation, FlamingSacrifice,
  OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const CHANGLI = new Loadout({
  resonator: CHANGLI_RESONATOR,
  matrix: matrix("Changli", 25),
  talent: CHANGLI_TALENTS,
  inherent1: CH_INHERENT_1,
  inherent2: CH_INHERENT_2,
  sequences: [CH_S1, CH_S2, CH_S3, CH_S4, CH_S5, CH_S6],
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(NM_INFERNO_RIDER, MOLTEN_RIFT_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
    rotation: CH_ROTATION,
});
