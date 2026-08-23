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
  Buff, Talent, Inherent, Resonator, Loadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, isHeld, stacksOfTeam, removeStack, revoke, casting, currentAction, addStat, stacks, get,
  queue, lostOnSwap,
} from "../kit.js";
import { SOLSWORN_CIPHERS } from "../weapons/gauntlet.js";
import { NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC, SOUND_OF_TRUE_NAME_2PC } from "../echoes/lahairoi.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function sigrikaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter (One, Two, Three) — Stage 4 opens Decipher
export const BA1 = sigrikaAction("Basic - One, Two, Three 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 52.97, energy: 0.84, concerto: 1.67, offtune: 2700 });
export const BA2 = sigrikaAction("Basic - One, Two, Three 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 100.68, energy: 1.6, concerto: 3.18, offtune: 5100 });
export const BA3 = sigrikaAction("Basic - One, Two, Three 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 111.36, energy: 1.76, concerto: 3.5, offtune: 5600 });
export const BA4 = sigrikaAction("Basic - One, Two, Three 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 206.79, energy: 3.27, concerto: 6.51, offtune: 10400 });
export const MA = sigrikaAction("Basic - One, Two, Three (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78 });
export const MDC = sigrikaAction("Basic - One, Two, Three (Mid-Air Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 206.17 });
export const DC = sigrikaAction("Basic - One, Two, Three (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 219.70 });
export const HA = sigrikaAction("Heavy - One, Two, Three", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 116.28 });

// --- Decipher-gated finishers: both grant a Rune: Trust and exit Decipher, both Echo Skill DMG
//     (the migrated sheet only carries one row for the pair — same numbers used for both here)
export const EBA = sigrikaAction("Basic - Elucidated", { node: Node.Normal, cast: Cast.Basic, type: Type1.Echo, mv: 307.79, energy: 2.6, concerto: 5.2, forte1: 1 });
export const EDC = sigrikaAction("Basic - Decipher (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Echo, mv: 307.79, energy: 2.6, concerto: 5.2, forte1: 1 });

// --- resonance skill: BOOMY BOOM! (base), or — while in Decipher — BIG BOOMY BOOM! (grants
//     Rune: Answer) / Soliskin to the Aid (also spends 50+ Full Stop, likewise grants Rune: Answer)
export const Skill = sigrikaAction("Skill - BOOMY BOOM!", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 143.15, energy: 2.25, concerto: 4.5 });
export const ESkill = sigrikaAction("Skill - BIG BOOMY BOOM!", { node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 288.09, energy: 2.45, concerto: 4.9, forte1: 1 });
export const ESkill50 = sigrikaAction("Skill - Soliskin to the Aid", { node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 278.26, energy: 2.36, concerto: 4.72, forte1: 1 });

// --- forte circuit: Schemata of Runes always lands its own base hit (+50 Full Stop), then queues
//     one of three Runic follow-ups depending on which pair of Runes it spends (see file header)
export const RunicOutburst = sigrikaAction("Forte - Runic Outburst", { node: Node.Forte, type: Type1.Echo, mv: 117.67+205.92+264.75, energy: 10, concerto: 7, offtune: 24800, forte2: 50 });
export const RunicChainWhip = sigrikaAction("Forte - Runic Chain Whip", { node: Node.Forte, type: Type1.Echo, mv: 397.58, energy: 10, concerto: 7.03, offtune: 24802, forte2: 50 });
export const RunicSoliskin = sigrikaAction("Forte - Runic Soliskin", { node: Node.Forte, type: Type1.Echo, mv: 397.54, energy: 10, concerto: 7.03, offtune: 24802, forte2: 50 });

export const FHAoutburst = sigrikaAction("Forte Heavy - Schemata of Runes", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Echo, mv: 132.51, energy: 3.34, concerto: 7.5, offtune: 27500, forte1: -2 });
export const FHAchainwhip = sigrikaAction("Forte Heavy - Schemata of Runes", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Echo, mv: 132.51, energy: 3.34, concerto: 7.5, offtune: 27500, forte1: -2 });
export const FHAsoliskin = sigrikaAction("Forte Heavy - Schemata of Runes", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Echo, mv: 132.51, energy: 3.34, concerto: 7.5, offtune: 27500, forte1: -2 });

/** Learn My True Name: at 100 Full Stop, spends it all. */
export const FSkill = sigrikaAction("Forte Skill - Learn My True Name", { node: Node.Forte, cast: Cast.Skill, type: Type1.Echo, mv: 1211.48, energy: 5.43, concerto: 30, offtune: 101300, forte2: -100 });

export const Liberation = sigrikaAction("Liberation - Where Trust Leads Me!", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Echo, mv: 861.43, concerto: 20, offtune: 50400 });

export const Intro = sigrikaAction("Intro - Solsworn Etymology", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 163.42, energy: 10, concerto: 10, offtune: 7700 });
/** In This Very Moment carries no team buff on her own page (unlike most other kits' outros). */
export const Outro = sigrikaAction("Outro - In This Very Moment", { cast: Cast.Outro, type: Type1.Outro, mv: 795, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** True Names Aligned (Inherent Skill): a teammate's Echo Skill cast grants the whole team a stack
 *  of Blessing of Runes (up to 6) — +3% Aero/Echo Skill DMG a stack to whoever's active, +30%/+30%
 *  flat more at the full 6 for Sigrika specifically. Granted via `SIGRIKA`'s own `updateGlobal()`
 *  (not this buff's own update()) since a global buff's update() can't fire before it's held once. */
export const BLESSING_OF_RUNES = new Buff({
  name: "Sigrika: Blessing of Runes", maxStacks: 6,
  apply: () => {
    const held = stacksOfTeam(BLESSING_OF_RUNES);
    if (held >= 6 && isHeld(SIGRIKA)) { addStat(Stat.DmgBonus, 30, Attribute.Aero); addStat(Stat.DmgBonus, 30, Type1.Echo); }

    if (currentAction().active) {
        addStat(Stat.DmgBonus, 3 * held, Attribute.Aero);
        addStat(Stat.DmgBonus, 3 * held, Type1.Echo);
    }
  },
});

/** Whole percent points of ER — the shared floor both the ER-conversion payout and its display
 *  read off, since it only pays out in discrete 1% ER = 2% Echo Skill DMG steps. */
function erSteps(): number { return Math.floor(get(Stat.Er)); }

/** True Names Aligned, in full: the ER-to-Echo-DMG conversion above, plus (via updateGlobal(), so
 *  it reacts to any team member's Echo cast) the Blessing of Runes grant that mechanic feeds. */
export const SR_INHERENT_2 = new Inherent({
  name: "Sigrika: True Names Aligned",
  display: () => `Sigrika: True Names Aligned @${erSteps()}% ER`,
  updateGlobal: () => { if (casting(Cast.Echo)) applyTeam(BLESSING_OF_RUNES, 1); },
  convert: () => addStat(Stat.DmgBonus, Math.min(50, 2 * Math.max(0, erSteps() - 125)), Type1.Echo),
});
/** True Names Invoked (Inherent Skill): casting Intro grants Convergent — the only source of it. */
export const SR_INHERENT_1 = new Inherent({
  name: "Sigrika: True Names Invoked",
  update: () => { if (currentAction() === Intro) applySelf(CONVERGENT, 1); },
});

/** Whether the current action grants Sigrika a Rune — Elucidated/Decipher's own Dodge Counter
 *  variant (Trust), or BIG BOOMY BOOM!/Soliskin to the Aid (Answer). */
function gainsRune(): boolean {
  const a = currentAction();
  return a === EBA || a === EDC || a === ESkill || a === ESkill50;
}

/** Decipher: opened by Basic Attack Stage 4, closed by whichever finisher next grants a Rune.
 *  While up, Basic Attack becomes Elucidated and Dodge Counter its own Decipher variant. */
export const DECIPHER = new Buff({
  name: "Sigrika: Decipher",
  update: () =>  {
    lostOnSwap();
  },
  convert: () => { if (gainsRune()) revoke(DECIPHER); },
});

/** Convergent/Divergent double or flip-type the next Rune gained; neither doubled rune has a stat
 *  of its own to double, but taking effect is still worth +25 Full Stop. Convergent is granted only
 *  by Inherent Skill 1 on Intro; Divergent has no trigger in this kit yet, kept for completeness.
 *  If both are held, Convergent takes priority and Divergent stays held for its own next gain. */
export const CONVERGENT = new Buff({
  name: "Sigrika: Convergent",
  convert: () => {
    if (gainsRune()) { addStat(Stat.AddForte1, 1); revoke(CONVERGENT); }
  },
});
export const DIVERGENT = new Buff({
  name: "Sigrika: Divergent",
  convert: () => {
    if (gainsRune() && !isHeld(CONVERGENT)) { addStat(Stat.AddForte1, 1); revoke(DIVERGENT); }
  },
});

/** Innate Gift?: up to 2 stacks, each +30% Echo Skill DMG Amplification — granted when a Runic
 *  follow-up spends a full 30 Soliskin Vitality. Ends after Learn My True Name, or on swap-off. */
export const INNATE_GIFT = new Buff({
  name: "Sigrika: Innate Gift?", maxStacks: 2,
  apply: () => {
    const a = currentAction();
    if (a === RunicChainWhip || a === RunicOutburst || a === RunicSoliskin || a === FSkill) {
        addStat(Stat.Amp, 30 * stacks(), Type1.Echo);
        if (a === FSkill) revoke(INNATE_GIFT);
    }
  },
  update: () => lostOnSwap(),
});

/** Soliskin Vitality: a genuine 0-60 gauge, +10 whenever any team member casts an Echo Skill
 *  (granted via `SIGRIKA`'s own updateGlobal(), same reasoning as Blessing of Runes above). Spent
 *  by whichever Runic follow-up fires: 30+ points spends exactly 30 for +50% DMG Multiplier and a
 *  stack of Innate Gift?; under 30 spends everything held for +15% DMG Amplification per 10 points. */
export const SOLISKIN_VITALITY = new Buff({
  name: "Sigrika: Soliskin Vitality", maxStacks: 60,
  update: () => {
    const a = currentAction();
    if (a !== RunicOutburst && a !== RunicChainWhip && a !== RunicSoliskin) return;
    const held = stacks();
    if (held >= 30) { applySelf(INNATE_GIFT, 1); }
  },
  apply: () => {
    const a = currentAction();
    if (a !== RunicOutburst && a !== RunicChainWhip && a !== RunicSoliskin) return;
    const held = stacks();
    if (held >= 30) { addStat(Stat.MulMv, 50); }
    else if (held > 0) addStat(Stat.Amp, 15 * Math.floor(held / 10));
  },
  convert: () => {
    const a = currentAction();
    if (a === RunicOutburst || a === RunicChainWhip || a === RunicSoliskin) {
      removeStack(SOLISKIN_VITALITY, Math.min(stacks(), 30));
    }
  },
});

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. */
export const SIGRIKA = new Resonator({
  name: "Sigrika",
  element: Attribute.Aero,
  weapon: WeaponType.Gauntlets,
  intro: () => Intro,
  color: "#7ee0c9",
  maxEnergy: 125,

  // Soliskin Vitality's own gain (any team member's Echo cast) plus queueing whichever Runic
  // follow-up the Heavy Attack form actually cast
  updateGlobal: () => { if (casting(Cast.Echo)) applySelf(SOLISKIN_VITALITY, 10); },
  update: () => {
    const a = currentAction();
    if (a === BA4) applySelf(DECIPHER, 1);
    if (a === FHAoutburst) queue(RunicOutburst);
    if (a === FHAchainwhip) queue(RunicChainWhip);
    if (a === FHAsoliskin) queue(RunicSoliskin);
  },

  apply: () => {
    addStat(Stat.BaseHp, 10775); addStat(Stat.BaseAtk, 437.5); addStat(Stat.BaseDef, 1137);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const SIGRIKA_TALENTS = new Talent({
  name: "Sigrika: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

/** The kit-valid line: Intro opens Decipher-free, basics open Decipher on Stage 4, Elucidated
 *  spends it for a Rune: Trust, BOOMY BOOM! into BIG BOOMY BOOM! banks a Rune: Answer, Schemata of
 *  Runes spends the pair for Runic Outburst, Learn My True Name closes the circuit, Liberation
 *  closes the loop. She's never the team's own lead, so this same rotation covers both. */
export const SR_ROTATION = [
  INTRO, ECHO_CAST, BA2, BA3, BA4, EBA, FHAchainwhip, Liberation,
  BA2, BA3, BA4, EBA, FHAoutburst, FSkill,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit, weapon,
// mainslot echo, sonata pieces, mainstat/substat
export const SR_LOADOUT = new Loadout(
  SIGRIKA,
  SIGRIKA_TALENTS,
  SR_INHERENT_1,
  SR_INHERENT_2,
  SOLSWORN_CIPHERS,
  NAMELESS_EXPLORER,
  SOUND_OF_TRUE_NAME_5PC,
  SOUND_OF_TRUE_NAME_2PC,
  mainstats("CR", "ER atk", "atk atk"),
  chem("atk", "basic"),
);
