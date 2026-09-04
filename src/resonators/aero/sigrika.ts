/**
 * Sigrika, ported to the new engine — an aero gauntlets DPS built around Echo Skill DMG: most of
 * her real kit tags `type: Echo` even though most casts (Elucidated, BIG BOOMY BOOM!, etc.) aren't
 * literal Echo casts.
 * No live 4-slot Rune queue is tracked (same "fixed valid line" treatment as Zhezhi's Imprints) —
 * instead of one Schemata action reading bank state, three separate Runic follow-up variants exist
 * below; only Runic Outburst is placed in the rotation, the others kept for completeness.
 * Full Stop (forte1) and Soliskin Vitality (a real 0-60 gauge fed by any team member's Echo cast)
 * are both real gauges with a damage payout.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Stat, Attribute, WeaponType, Type1, Cast, Node,
  Scaling, applyCurrent, applyTeam, isHeld, stacksOfTeam, removeStack, revokeCurrent, casting, currentAction, addStat,
  frozenStacks, getStat, queue, } from "../../engine/kit.js";
import { lostOnSwap } from "../../shared/helpers.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_CANCEL, OUTRO, START_3, SWAP, ECHO_ONFIELD, ECHO_SWAP } from "../../engine/rotation.js";
import { SOLSWORN_CIPHERS } from "../../weapons/gauntlet.js";
import { NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import { NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function sigrikaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter (One, Two, Three) — Stage 4 opens Decipher
const BA1 = sigrikaAction("Basic - One, Two, Three 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 52.97, energy: 0.84, concerto: 1.67, offtune: 2664 });
const BA2 = sigrikaAction("Basic - One, Two, Three 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 100.68, energy: 1.6, concerto: 3.18, offtune: 5064 });
const BA3 = sigrikaAction("Basic - One, Two, Three 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 111.36, energy: 1.76, concerto: 3.5, offtune: 5600 });
const BA4 = sigrikaAction("Basic - One, Two, Three 4", {
  node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 206.79, energy: 3.27, concerto: 6.51, offtune: 10400,
  updateBuffs: () => applyCurrent(DECIPHER, 1),
});
const MA = sigrikaAction("Basic - One, Two, Three (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78, energy: 1.55, concerto: 3.1, offtune: 4960 });
const MDC = sigrikaAction("Basic - One, Two, Three (Mid-Air Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 206.17, energy: 3.05, concerto: 16.1, offtune: 9920 });
const DC = sigrikaAction("Basic - One, Two, Three (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 219.70, energy: 3.26, concerto: 16.5, offtune: 10026 });
const HA = sigrikaAction("Heavy - One, Two, Three", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 116.28, offtune: 5848, concerto: 3.66, energy: 1.84 });

// --- Decipher-gated finishers: both grant a Rune: Trust and exit Decipher, both Echo Skill DMG
//     (the migrated sheet only carries one row for the pair — same numbers used for both here)
const EBA = sigrikaAction("Basic - Elucidated", { node: Node.Normal, cast: Cast.Basic, type: Type1.Echo, mv: 307.79, offtune: 8259, energy: 2.6, concerto: 5.19, forte1: 1 });
const EDC = sigrikaAction("Basic - Decipher (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Echo, mv: 307.79, offtune: 8259, energy: 2.6, concerto: 15.19, forte1: 1 });

// --- resonance skill: BOOMY BOOM! (base), or — while in Decipher — BIG BOOMY BOOM! (grants
//     Rune: Answer) / Soliskin to the Aid (also spends 50+ Full Stop, likewise grants Rune: Answer)
const Skill = sigrikaAction("Skill - BOOMY BOOM!", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 143.15, offtune: 7200, energy: 2.25, concerto: 4.5 });
const ESkill = sigrikaAction("Skill - BIG BOOMY BOOM!", { node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 288.09, offtune: 7729, energy: 2.45, concerto: 4.86, forte1: 1 });
const ESkill50 = sigrikaAction("Skill - Soliskin to the Aid", { node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 278.26, offtune: 7466, energy: 2.36, concerto: 4.68, forte1: 1 });

// --- forte circuit: Schemata of Runes always lands its own base hit (+50 Full Stop), then queues
//     one of three Runic follow-ups depending on which pair of Runes it spends (see file header)
const RunicOutburst = sigrikaAction("Forte - Runic Outburst", { node: Node.Forte, type: Type1.Echo, mv: 117.67+205.92+264.75, energy: 10, concerto: 7, offtune: 24800, forte2: 50 });
const RunicChainWhip = sigrikaAction("Forte - Runic Chain Whip", { node: Node.Forte, type: Type1.Echo, mv: 397.58, energy: 10.01, concerto: 7.03, offtune: 24802, forte2: 50 });
const RunicSoliskin = sigrikaAction("Forte - Runic Soliskin", { node: Node.Forte, type: Type1.Echo, mv: 397.54, energy: 10, concerto: 7, offtune: 24800, forte2: 50 });

// each Heavy Attack form queues its own Runic follow-up
const SCHEMATA = { node: Node.Forte, cast: Cast.Heavy, type: Type1.Echo, mv: 132.51, energy: 3.34, concerto: 0.5, offtune: 2664, forte1: -2 };
const FHAoutburst = sigrikaAction("Forte Heavy - Schemata of Runes", { ...SCHEMATA, updateBuffs: () => queue(RunicOutburst) });
const FHAchainwhip = sigrikaAction("Forte Heavy - Schemata of Runes", { ...SCHEMATA, updateBuffs: () => queue(RunicChainWhip) });
const FHAsoliskin = sigrikaAction("Forte Heavy - Schemata of Runes", { ...SCHEMATA, updateBuffs: () => queue(RunicSoliskin) });

/** Learn My True Name: at 100 Full Stop, spends it all. */
const FSkill = sigrikaAction("Forte Skill - Learn My True Name", { node: Node.Forte, cast: Cast.Skill, type: Type1.Echo, mv: 1211.48, energy: 5.43, concerto: 30, offtune: 101336, forte2: -100 });

const Liberation = sigrikaAction("Liberation - Where Trust Leads Me!", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Echo, mv: 861.43, concerto: 20, offtune: 50400, resetEnergy: true,
  updateBuffs: () => applyCurrent(DIVERGENT),
});

const Intro = sigrikaAction("Intro - Solsworn Etymology", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 163.42, energy: 10, concerto: 10, offtune: 7736 });
/** In This Very Moment carries no team buff on her own page (unlike most other kits' outros). */
const Outro = sigrikaAction("Outro - In This Very Moment", { cast: Cast.Outro, type: Type1.Outro, mv: 795, concerto: -100, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** True Names Aligned (Inherent Skill): a teammate's Echo Skill cast grants the whole team a stack
 *  of Blessing of Runes (up to 6) — +3% Aero/Echo Skill DMG a stack to whoever's active, +30%/+30%
 *  flat more at the full 6 for Sigrika specifically. Granted via `SIGRIKA_RESONATOR`'s own `updateGlobal()`
 *  (not this buff's own updateBuffs()) since a global buff's updateBuffs() can't fire before it's held once. */
const BLESSING_OF_RUNES = new Buff({
  name: "Sigrika: Blessing of Runes", maxStacks: 6,
  applyStats: () => {
    const held = stacksOfTeam(BLESSING_OF_RUNES);
    if (held >= 6 && isHeld(SIGRIKA_RESONATOR)) { addStat(Stat.DmgBonus, 30, Attribute.Aero); addStat(Stat.DmgBonus, 30, Type1.Echo); }

    if (currentAction().active) {
        addStat(Stat.DmgBonus, 3 * held, Attribute.Aero);
        addStat(Stat.DmgBonus, 3 * held, Type1.Echo);
    }
  },
});

/** True Names Aligned, in full: the ER-to-Echo-DMG conversion above, plus (via updateGlobal(), so
 *  it reacts to any team member's Echo cast) the Blessing of Runes grant that mechanic feeds. */
const SR_INHERENT_2 = new Inherent({
  name: "Inherent: True Names Aligned",
  updateGlobal: () => { if (casting(Cast.Echo)) applyTeam(BLESSING_OF_RUNES, 1); },
  convertStats: () => addStat(Stat.DmgBonus, Math.min(50, 2 * Math.max(0, Math.floor(getStat(Stat.Er)) - 125)), Type1.Echo),
});
/** True Names Invoked (Inherent Skill): casting Intro grants Convergent — the only source of it. */
const SR_INHERENT_1 = new Inherent({
  name: "Inherent: True Names Invoked",
  updateBuffs: () => { if (currentAction() === Intro) applyCurrent(CONVERGENT, 1); },
});

/** Whether the current action grants Sigrika a Rune — Elucidated/Decipher's own Dodge Counter
 *  variant (Trust), or BIG BOOMY BOOM!/Soliskin to the Aid (Answer). */
function gainsRune(): boolean {
  const a = currentAction();
  return a === EBA || a === EDC || a === ESkill || a === ESkill50;
}

/** Decipher: opened by Basic Attack Stage 4, closed by whichever finisher next grants a Rune.
 *  While up, Basic Attack becomes Elucidated and Dodge Counter its own Decipher variant. */
const DECIPHER = new Buff({
  name: "Sigrika: Decipher",
  updateBuffs: () =>  {
    lostOnSwap();
  },
  convertStats: () => { if (gainsRune()) revokeCurrent(DECIPHER); },
});

/** Convergent/Divergent double or flip-type the next Rune gained; neither doubled rune has a stat
 *  of its own to double, but taking effect is still worth +25 Full Stop. Convergent is granted only
 *  by Inherent Skill 1 on Intro; Divergent has no trigger in this kit yet, kept for completeness.
 *  If both are held, Convergent takes priority and Divergent stays held for its own next gain. */
const CONVERGENT = new Buff({
  name: "Sigrika: Convergent",
  convertStats: () => {
    if (gainsRune()) { addStat(Stat.AddForte1, 1); revokeCurrent(CONVERGENT); }
  },
});
const DIVERGENT = new Buff({
  name: "Sigrika: Divergent",
  convertStats: () => {
    if (gainsRune() && !isHeld(CONVERGENT)) { addStat(Stat.AddForte1, 1); revokeCurrent(DIVERGENT); }
  },
});

/** Innate Gift?: up to 2 frozenStacks, each +30% Echo Skill DMG Amplification — granted when a Runic
 *  follow-up spends a full 30 Soliskin Vitality. Ends after Learn My True Name, or on swap-off. */
const INNATE_GIFT = new Buff({
  name: "Sigrika: Innate Gift?", maxStacks: 2,
  applyStats: () => {
    const a = currentAction();
    if (a === RunicChainWhip || a === RunicOutburst || a === RunicSoliskin || a === FSkill) {
        addStat(Stat.Amp, 30 * frozenStacks(), Type1.Echo);
        if (a === FSkill) revokeCurrent(INNATE_GIFT);
    }
  },
  updateBuffs: () => lostOnSwap(),
});

/** Soliskin Vitality: a genuine 0-60 gauge, +10 whenever any team member casts an Echo Skill
 *  (granted via `SIGRIKA_RESONATOR`'s own updateGlobal(), same reasoning as Blessing of Runes above). Spent
 *  by whichever Runic follow-up fires: 30+ points spends exactly 30 for +50% DMG Multiplier and a
 *  stack of Innate Gift?; under 30 spends everything held for +15% DMG Amplification per 10 points. */
const SOLISKIN_VITALITY = new Buff({
  name: "Sigrika: Soliskin Vitality", maxStacks: 60,
  updateBuffs: () => {
    const a = currentAction();
    if (a !== RunicOutburst && a !== RunicChainWhip && a !== RunicSoliskin) return;
    const held = frozenStacks();
    if (held >= 30) { applyCurrent(INNATE_GIFT, 1); }
  },
  applyStats: () => {
    const a = currentAction();
    if (a !== RunicOutburst && a !== RunicChainWhip && a !== RunicSoliskin) return;
    const held = frozenStacks();
    if (held >= 30) { addStat(Stat.MulMv, 50); }
    else if (held > 0) addStat(Stat.Amp, 15 * Math.floor(held / 10));
  },
  convertStats: () => {
    const a = currentAction();
    if (a === RunicOutburst || a === RunicChainWhip || a === RunicSoliskin) {
      removeStack(SOLISKIN_VITALITY, Math.min(frozenStacks(), 30));
    }
  },
});

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. */
const SIGRIKA_RESONATOR = new Resonator({
  name: "Sigrika",
  element: Attribute.Aero,
  weapon: WeaponType.Gauntlets,
  intro: () => Intro,
  outro: () => Outro,
  color: "#7ee0c9",
  maxEnergy: 125,

  // Soliskin Vitality's own gain — any team member's Echo cast
  updateGlobal: () => { if (casting(Cast.Echo)) applyCurrent(SOLISKIN_VITALITY, 10); },

  constantStats: () => {
    addStat(Stat.BaseHp, 10775); addStat(Stat.BaseAtk, 437.5); addStat(Stat.BaseDef, 1137);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const SIGRIKA_TALENTS = new Talent({
  name: "Sigrika: Talents",
  constantStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

/** The kit-valid line: Intro opens Decipher-free, basics open Decipher on Stage 4, Elucidated
 *  spends it for a Rune: Trust, BOOMY BOOM! into BIG BOOMY BOOM! banks a Rune: Answer, Schemata of
 *  Runes spends the pair for Runic Outburst, Learn My True Name closes the circuit, Liberation
 *  closes the loop. She's never the team's own lead, so this same rotation covers both. */

const BA234 = new ActionGroup("Basic - One, Two, Three 234", [BA2, BA3, BA4]);

const SR_ROTATION = new Rotation([
  INTRO, ECHO_ONFIELD, 
  BA234, EBA, FHAchainwhip, Liberation,
  BA234, EBA, FHAoutburst, FSkill, 
  Skill, BA3, BA4, EBA,
  OUTRO,
]);

const SR_ROTATION_FAST = new Rotation([
  INTRO, ECHO_ONFIELD, 
  BA234, EBA, FHAchainwhip, Liberation,
  BA234, EBA, FHAoutburst, FSkill, 
  OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit, weapon,
// mainslot echo, sonata pieces, mainstat/substat
export const SIGRIKA = new Loadout({
  resonator: SIGRIKA_RESONATOR,
  talent: SIGRIKA_TALENTS,
  inherent1: SR_INHERENT_1,
  inherent2: SR_INHERENT_2,
  weapons: [SOLSWORN_CIPHERS, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [new EchoLoadout(NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ER3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
    rotation: SR_ROTATION,
});

// her real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit, weapon,
// mainslot echo, sonata pieces, mainstat/substat
export const SIGRIKA_FAST = new Loadout({
  resonator: SIGRIKA_RESONATOR,
  talent: SIGRIKA_TALENTS,
  inherent1: SR_INHERENT_1,
  inherent2: SR_INHERENT_2,
  weapons: [SOLSWORN_CIPHERS, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [new EchoLoadout(NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ER3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
    rotation: SR_ROTATION_FAST,
});
