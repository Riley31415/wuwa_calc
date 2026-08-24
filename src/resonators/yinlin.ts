/**
 * Yinlin, ported to the new engine — sequence-0 core loop, a limited 5-star (not
 * `standardCharacter`). An electro rectifier off-field Coordinated Attack sub-DPS. Magnetic Roar
 * opens Execution Mode, where her Basic hits each fire an Electromagnetic Blast (up to 4, lumped
 * into one action placed after the combo); a second Skill press casts Lightning Execution.
 * Chameleon Cipher (full Judgment Points, 100) upgrades Sinner's Mark to Punishment Mark, whose
 * Judgment Strikes are the payoff: Coordinated Attacks counting as Resonance Skill DMG, up to 1/s
 * for the mark's 18s — one lumped 18-hit action queued off her Outro, same shape as Zhezhi's
 * Inklit Spirit. Sinner's/Punishment Mark themselves carry no stat — pure gating, not modelled,
 * same treatment as Zhezhi's Painter's Delight.
 *
 * Numbers from nanoka.cc (character 1302) — MV/energy/concerto/offtune all resolved off the
 * site's own level-10 damage table; no migrated-sheet rows exist for her. Judgment Points
 * (forte1, cap 100) gain amounts per hit are published nowhere, so they're hand-derived
 * plausible values — the rotation banks 105 before Chameleon Cipher's -100, so the gate clears.
 *
 * Her two Inherent Skills, off the page's own "INHERENT SKILLS" section:
 *  - Pain Immersion: +15% Crit Rate for 5s after Magnetic Roar.
 *  - Deadly Focus: Lightning Execution +10% DMG against Sinner's Mark (assumed marked — her own
 *    basics/Liberation/Intro all apply it), and +10% ATK for 4s when triggered.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling,
  applySelf, currentAction, casting, revoke, addStat, queue, queueOutro, lostOnSwap,
} from "../kit.js";
import { STRINGMASTER } from "../weapons/rectifier.js";
import { VARIATION, NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../weapons/standard.js";
import { HECATE, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC } from "../echoes/rinascita.js";
import { HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../echoes/jinzhou.js";
import { mainstatOptions } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function yinlinAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter, heavy (Zapstring's Dance)
export const BA1 = yinlinAction("Basic - Zapstring's Dance 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 28.81, energy: 0.60, concerto: 2.00, offtune: 3144, forte1: 10 });
export const BA2 = yinlinAction("Basic - Zapstring's Dance 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 33.82 * 2, energy: 1.50, concerto: 5.00, offtune: 6152, forte1: 10 });
export const BA3 = yinlinAction("Basic - Zapstring's Dance 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 13.99 * 7, energy: 2.45, concerto: 7.00, offtune: 7147, forte1: 10 });
export const BA4 = yinlinAction("Basic - Zapstring's Dance 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 75.16, energy: 1.50, concerto: 6.00, offtune: 4976, forte1: 15 });

export const HA = yinlinAction("Heavy - Zapstring's Dance", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 29.83 * 2, energy: 1.80, concerto: 4.50, offtune: 9392 });
export const MA = yinlinAction("Basic - Zapstring's Dance (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 123.27, energy: 0.51, concerto: 5.00, offtune: 4960 });
export const DC = yinlinAction("Basic - Zapstring's Dance (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 24.22 * 7, energy: 3.99, concerto: 17.00, offtune: 11746 });

// Magnetic Roar opens Execution Mode; Lightning Execution is the follow-up Skill press
export const Skill1 = yinlinAction("Skill - Magnetic Roar", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 59.65 * 3, energy: 15.00, concerto: 10, offtune: 6666, forte1: 15 });
export const Skill2 = yinlinAction("Skill - Lightning Execution", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 89.47 * 4, energy: 15.00, concerto: 15, offtune: 5328, forte1: 20 });
/** Execution Mode's 4 Electromagnetic Blasts, one per Basic stage on hit, lumped — placed right
 *  after the combo that triggers them rather than queued. */
export const Blasts = yinlinAction("Skill - Electromagnetic Blast x4", { node: Node.Skill, type: Type1.Skill, mv: 19.89 * 4, concerto: 20.00, forte1: 20 });

export const Liberation = yinlinAction("Liberation - Thundering Wrath", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 116.56 * 7, concerto: 20, offtune: 36001, resetEnergy: true });

/** Chameleon Cipher: spends every Judgment Point, upgrades Sinner's Mark to Punishment Mark. */
export const FHA = yinlinAction("Forte Heavy - Chameleon Cipher", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 178.93 * 2, energy: 10.00, concerto: 20.00, offtune: 52000, forte1: -100 });
/** Punishment Mark's whole 18s window at its 1/s ceiling, lumped — Resonance Skill DMG, queued
 *  off her own Outro. */
export const ACTION_JUDGMENT_STRIKES = yinlinAction("Forte - Judgment Strike x18", { node: Node.Forte, type: Type1.Skill, type2: Type2.Coordinated, mv: 78.64 * 18, active: false });

export const Intro = yinlinAction("Intro - Raging Storm", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 14.32 * 10, energy: 2.00, concerto: 10, offtune: 9520, forte1: 25 });
export const Outro = yinlinAction("Outro - Strategist", { cast: Cast.Outro, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** Pain Immersion (Inherent Skill): +15% Crit Rate for 5s after Magnetic Roar. */
export const PAIN_IMMERSION = new Buff({
  name: "Yinlin: Pain Immersion",
  apply: () => addStat(Stat.CritRate, 15),
  convert: () => { if (casting(Cast.Outro)) revoke(PAIN_IMMERSION); },
});
export const YL_INHERENT_1 = new Inherent({
  name: "Yinlin: Pain Immersion",
  update: () => { if (currentAction() === Skill1) applySelf(PAIN_IMMERSION, 1); },
});

/** Deadly Focus (Inherent Skill): the +10% ATK half — the +10% on Lightning Execution itself
 *  lives on YL_INHERENT_2's own apply below. */
export const DEADLY_FOCUS = new Buff({
  name: "Yinlin: Deadly Focus",
  apply: () => addStat(Stat.BonusAtk, 10),
  convert: () => { if (casting(Cast.Outro)) revoke(DEADLY_FOCUS); },
});
export const YL_INHERENT_2 = new Inherent({
  name: "Yinlin: Deadly Focus",
  update: () => { if (currentAction() === Skill2) applySelf(DEADLY_FOCUS, 1); },
  apply: () => { if (currentAction() === Skill2) addStat(Stat.DmgBonus, 10); },
});

/** Strategist — the outro handoff: "for 14s or until they are switched out". */
export const YINLIN_OUTRO = new Buff({
  name: "Yinlin: Outro",
  apply: () => { addStat(Stat.Amp, 20, Attribute.Electro); addStat(Stat.Amp, 25, Type1.Liberation); },
  update: () => { lostOnSwap(); },
});

export const YINLIN = new Resonator({
  name: "Yinlin",
  abbreviation: "Yinlin",
  element: Attribute.Electro,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  color: "#a45ee8",
  maxEnergy: 125,

  update: () => {
    if (currentAction() === Outro) { queue(ACTION_JUDGMENT_STRIKES); queueOutro(YINLIN_OUTRO); }
  },

  apply: () => {
    addStat(Stat.BaseHp, 11000); addStat(Stat.BaseAtk, 400); addStat(Stat.BaseDef, 1283.33);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const YINLIN_TALENTS = new Talent({
  name: "Yinlin: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// the kit-valid line: Magnetic Roar opens Execution Mode, the full combo fires all 4 Blasts,
// Lightning Execution follows, Chameleon Cipher spends the 105 Judgment Points banked by then and
// arms Punishment Mark (its Judgment Strikes queued off Outro). She's never the team's own lead,
// so this covers both opener and loop.
export const YL_ROTATION = [
  INTRO, Skill1, BA1, BA2, BA3, BA4, Blasts, Skill2, FHA,
  ECHO_CAST, Liberation,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, and two real
// echo choices — Empyrean Anthem behind her Coordinated Judgment Strikes, or Moonlit Clouds
export const YINLIN_LOADOUT = new Loadout(
  YINLIN, false, YINLIN_TALENTS, YL_INHERENT_1, YL_INHERENT_2,
  [STRINGMASTER, VARIATION, NEW_STD_RECTIFIER, COSMIC_RIPPLES],
  [
    new EchoLoadout(HECATE, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
  ],
  mainstatOptions(["CR", "CD"], ["atk", "electro"], ["atk"]), chem("atk", "skill"),
  YL_ROTATION, YL_ROTATION,
);
