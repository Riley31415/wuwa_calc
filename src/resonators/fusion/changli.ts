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
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, Stat, Attribute, WeaponType, Type1, Cast, Node,
  Scaling, applyCurrent, revokeCurrent, casting, currentAction, addStat, forte1, queueOutro, lostOnSwap,
} from "../../engine/kit.js";
import { matrix } from "../../shared/matrix.js";
import { Rotation, START_COMBAT, INTRO, OUTRO_NEXT } from "../../engine/rotation.js";
import { BLAZING_BRILLIANCE } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { NM_INFERNO_RIDER, MOLTEN_RIFT_5PC, MOLTEN_RIFT_2PC } from "../../echoes/jinzhou.js";
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
const DC = changliAction("Basic - Blazing Enlightenment 3 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 247.92, offtune: 9978, energy: 3.12, concerto: 16.24 });
const HA = changliAction("Heavy - Blazing Enlightenment", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 124.24, offtune: 5880, energy: 1.85, concerto: 3.69 });

// --- mid-air basics, mid-air heavy — the same combo, airborne. Stage 4 also opens True Sight.
const MA1 = changliAction("Basic - Blazing Enlightenment 1 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 61.35, offtune: 2904, energy: 0.91, concerto: 1.82 });
const MA2 = changliAction("Basic - Blazing Enlightenment 2 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 101.74, offtune: 4816, energy: 1.52, concerto: 3.02 });
const MA3 = changliAction("Basic - Blazing Enlightenment 3 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 132.00, offtune: 6249, energy: 1.98, concerto: 3.93 });
const MA4 = changliAction("Basic - Blazing Enlightenment 4 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 126.75, offtune: 6000, energy: 1.89, concerto: 3.77 });
const MHA = changliAction("Heavy - Blazing Enlightenment (Mid-Air)", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 123.27, offtune: 4960, energy: 1.55, concerto: 1.00 });

// --- True Sight's own finishers: Conquest (ground Basic), Charge (jump/mid-air Basic) — both
//     Resonance Skill DMG, both bank a stack of Enflamement and end True Sight
const SBA = changliAction("True Sight - Conquest", { node: Node.Skill, cast: Cast.Basic, type: Type1.Skill, mv: 294.73, offtune: 8985, energy: 4.04, concerto: 7.00, forte1: 1 });
const SMA = changliAction("True Sight - Charge", { node: Node.Skill, cast: Cast.Basic, type: Type1.Skill, mv: 181.70, offtune: 4353, energy: 2.57, concerto: 6.00, forte1: 1 });

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
  name: "Changli: Secret Strategist",
  applyStats: () => {
    const a = currentAction();
    if (a === SBA || a === SMA) addStat(Stat.DmgBonus, 5 * forte1(), Attribute.Fusion);
  },
});

/** Sweeping Force (Inherent Skill): +20% Fusion DMG Bonus/15% DEF ignore, intrinsic to Flaming
 *  Sacrifice and Liberation themselves. */
const CH_INHERENT_2 = new Inherent({
  name: "Changli: Sweeping Force",
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
  INTRO, SMA,
  Skill, SBA,
  Skill,
  HA, SMA, // hold plunge + dash
  MA4, SMA, MHA,
  FlamingSacrifice, START_COMBAT, Liberation, FlamingSacrifice, START_COMBAT, OUTRO_NEXT,
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
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(NM_INFERNO_RIDER, MOLTEN_RIFT_5PC, MOLTEN_RIFT_2PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
    rotation: CH_ROTATION,
});
