/**
 * Cantarella, ported to the new engine. Sequence-0 core loop. Healing is out of scope, same as
 * the old engine — "Cure" and Trance-consuming heals are left out entirely.
 *
 * Trance (forte1) and Shiver (forte2) are genuine forte gauges — every action that moves either
 * declares its own delta directly. Perception Drain (FSkill) requires a full 3 Shiver, so
 * CANTARELLA's own update() hard-resets forte2 to exactly 3 first, landing its declared -3 on 0.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling,
  applySelf, currentAction, casting, queue, queueOutro,
  removeStackTeam, revoke, addStat, stacks,
  applyTeam, forte1, setForte2,
  lostOnSwap, currentTeam
} from "../../kit.js";
import { WHISPERS_OF_SIRENS } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC, REJUV_5PC, REJUV_2PC, NM_CROWNLESS, HAVOC_ECLIPSE_5PC, HAVOC_ECLIPSE_2PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { MIDNIGHT_VEIL_5PC, MIDNIGHT_VEIL_2PC, NM_HECATE, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC, NM_HERON, HECATE } from "../../echoes/rinascita.js";
import { mainstatOptions } from "../../mainstats.js";
import { chem } from "../../substats.js";

/* ----------------------------------------------------------------------------------- actions */

function cantaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

export const BA1 = cantaAction("Basic - Illusion Collapse 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.53, energy: 1, concerto: 2, offtune: 3200 });
export const BA2 = cantaAction("Basic - Illusion Collapse 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 145.76, energy: 1.84, concerto: 3.68, offtune: 5864 }); // 36.44%x4
export const BA3 = cantaAction("Basic - Illusion Collapse 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 145.14, energy: 1.84, concerto: 3.66, offtune: 5840, forte1: 1 }); // 72.57%x2

export const EHA = cantaAction("Heavy - Delusive Dive", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 106.1, energy: 1.68, concerto: 3.34, offtune: 5336 }); // 53.05%x2

export const FBA1 = cantaAction("Forte - Phantom Sting 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 105.99, energy: 1.35, concerto: 2.67, offtune: 4266, forte1: -1, forte2: 1, heals: true }); // 35.33%x3
export const FBA2 = cantaAction("Forte - Phantom Sting 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 125.86, energy: 1.6, concerto: 3.18, offtune: 5064, forte1: -1, forte2: 1, heals: true }); // 62.93%x2
export const FBA3 = cantaAction("Forte - Phantom Sting 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, type2: Type2.Coordinated, mv: 258.48, energy: 3.28, concerto: 6.52, offtune: 10400, forte1: -1, forte2: 1, heals: true }); // 64.62%x4

export const Skill = cantaAction("Skill - Graceful Step", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 147.2, energy: 1.56, concerto: 10, offtune: 4936, forte1: 1 }); // 73.60%x2
export const ESkill = cantaAction("Skill - Flickering Reverie", { node: Node.Skill, cast: Cast.Skill, cast2: Cast.Echo, type: Type1.Skill, mv: 196.23, energy: 1.65, concerto: 10, offtune: 5264 });
/** At 3 Shiver — CANTARELLA's own update() resets forte2 to 3 first, so -3 lands on 0 exactly. */
export const FSkill = cantaAction("Forte - Perception Drain", { node: Node.Forte, cast: Cast.Skill, cast2: Cast.Echo, type: Type1.Basic, mv: 1335.98, energy: 21.1, concerto: 12, offtune: 57864, forte2: -3, heals: true }); // 667.99%x2

export const Liberation = cantaAction("Liberation - Beneath the Sea", { node: Node.Liberation, cast: Cast.Liberation, cast2: Cast.Echo, type: Type1.Basic, mv: 376, concerto: 20, offtune: 48000, forte1: 3, resetEnergy: true });
export const ACTION_DIFFUSION = cantaAction("Liberation - Diffusion x21", { node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 305.34, active: false }); // 14.54%x21, no energy/concerto/off-tune of its own

export const Intro = cantaAction("Intro - Ripple", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 169, energy: 3.16, concerto: 10, offtune: 10120, forte1: 1 }); // 42.25%x4
export const Outro = cantaAction("Outro - Gentle Tentacles", { cast: Cast.Outro, mv: 0, active: false });

export const ESKILL_JOLT = new Action("Jolt", { node: Node.Skill, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Basic, mv: 198.81 });

/* ------------------------------------------------------------------------------------ buffs */

export const POISON = new Buff({
  name: "Cantarella: Poison", maxStacks: 2,
  apply: () => addStat(Stat.DmgBonus, 6 * stacks(), Attribute.Havoc),
  convert: () => { if (casting(Cast.Outro)) revoke(POISON); },
});

/** Abyssal Rebirth: her Intro opens a window in which *any* team member's own Echo Skill cast
 *  hands **her** 6 Concerto Energy, six times over. Team-wide so it sees everyone's turn, but the
 *  concerto has to land on her rather than on whoever is acting — `Stat.AddConcerto` would credit
 *  the actor, so this writes her own bar directly through `memberOf()`. The six charges are the
 *  stack count, spent as they fire. 25s window on a 25s cooldown, so it never lapses mid-rotation. */
export const ABYSSAL_REBIRTH = new Buff({
  name: "Cantarella: Abyssal Rebirth", maxStacks: 6,
  update: () => {
    if (!casting(Cast.Echo) || stacks() <= 0) return;
    removeStackTeam(ABYSSAL_REBIRTH, 1);
    currentTeam().memberOf(CANTARELLA).concerto += 6;
  },
});

// opened by Delusive Dive; auto-closes once Trance depletes or on her own outro
export const MIRAGE = new Buff({
  name: "Cantarella: Mirage",
  update: () => { if (forte1() <= 0 || casting(Cast.Outro)) revoke(MIRAGE); },
});

// whichever of her own hits lands next (not a Coordinated Attack) triggers Jolt and clears itself
export const HAZY_DREAM = new Buff({
  name: "Cantarella: Hazy Dream",
  update: () => {
    const a = currentAction();
    if (a === ESkill || a.type2 === Type2.Coordinated) return;
    revoke(HAZY_DREAM);
    queue(ESKILL_JOLT);
  },
});

export const CANTARELLA_OUTRO = new Buff({
  name: "Cantarella: Outro",
  apply: () => { addStat(Stat.Amp, 20, Attribute.Havoc); addStat(Stat.Amp, 25, Type1.Skill); },
  update: () => { lostOnSwap(); },
});

// her kit page doesn't name either passive — Poison's own proc (any Echo Skill) and Mirage's own
// (Delusive Dive) are her two Inherent Skills, each its own trigger piece
export const CA_INHERENT_1 = new Inherent({
  name: "Cantarella: \"Cure\"",
  apply: () => { addStat(Stat.HealingBonus, 20) }
});
export const CA_INHERENT_2 = new Inherent({
  name: "Cantarella: \"Poison\"",
  update: () => { if (casting(Cast.Echo)) applySelf(POISON, 1); },
});

export const CANTARELLA = new Resonator({
  name: "Cantarella",
  abbreviation: "Canta",
  element: Attribute.Havoc,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  color: "#7c6fd6",
  maxEnergy: 125,

  update: () => {
    const a = currentAction();
    if (currentAction() === EHA) applySelf(MIRAGE, 1);
    if (a === ESkill) applySelf(HAZY_DREAM, 1);
    if (a === Intro) applyTeam(ABYSSAL_REBIRTH, 6);
    if (a === Outro) { queue(ACTION_DIFFUSION); queueOutro(CANTARELLA_OUTRO); }
    if (a === FSkill) setForte2(3);
  },

  apply: () => {
    addStat(Stat.BaseHp, 11600); addStat(Stat.BaseAtk, 400); addStat(Stat.BaseDef, 1100);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const CANTARELLA_TALENTS = new Talent({
  name: "Cantarella: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

export const CA_ROTATION = [
  INTRO, Skill, ECHO_CAST,
  Liberation, EHA, FBA1, ESkill, FBA2, FBA3, FSkill, Outro
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, and three real
// echo choices sharing Impermanence Heron as mainslot — Midnight Veil, Rejuvenating Glow, Moonlit
// Clouds — all automatically iterated (see kit.ts's own EchoLoadout)
export const CANTA_LOADOUT = new Loadout(
  CANTARELLA,
  false,
  CANTARELLA_TALENTS,
  CA_INHERENT_1,
  CA_INHERENT_2,
  [WHISPERS_OF_SIRENS, NEW_STD_RECTIFIER, COSMIC_RIPPLES],
  [
    new EchoLoadout(NM_HERON, MIDNIGHT_VEIL_5PC, MIDNIGHT_VEIL_2PC),
    new EchoLoadout(FALLACY, REJUV_5PC, REJUV_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(HECATE, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC),
        new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC, HAVOC_ECLIPSE_2PC),
  ],
  mainstatOptions(["CR", "CD"], ["atk", "havoc"], ["atk"]),
  chem("atk", "basic"),
  CA_ROTATION, CA_ROTATION,
);
