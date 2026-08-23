/**
 * Cantarella, ported to the new engine. Sequence-0 core loop. Healing is out of scope, same as
 * the old engine — "Cure" and Trance-consuming heals are left out entirely.
 *
 * Trance (forte1) and Shiver (forte2) are genuine forte gauges — every action that moves either
 * declares its own delta directly. Perception Drain (FSkill) requires a full 3 Shiver, so
 * CANTARELLA's own update() hard-resets forte2 to exactly 3 first, landing its declared -3 on 0.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling,
  applySelf, currentAction, casting, queue, queueOutro,
  removeStackTeam, revoke, addStat, stacks,
  applyTeam, forte1, setForte2,
  lostOnSwap,
} from "../kit.js";
import { WHISPERS_OF_SIRENS } from "../weapons/rectifier.js";
import { HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../echoes/jinzhou.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function cantaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

export const BA1 = cantaAction("Basic - Illusion Collapse 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.53 });
export const BA2 = cantaAction("Basic - Illusion Collapse 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 145.76 });
export const BA3 = cantaAction("Basic - Illusion Collapse 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 145.14, forte1: 1 });

export const EHA = cantaAction("Heavy - Delusive Dive", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 106.1 });

export const FBA1 = cantaAction("Forte - Phantom Sting 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 105.99, forte1: -1, forte2: 1, heals: true });
export const FBA2 = cantaAction("Forte - Phantom Sting 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 125.86, forte1: -1, forte2: 1, heals: true });
export const FBA3 = cantaAction("Forte - Phantom Sting 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, type2: Type2.Coordinated, mv: 258.48, forte1: -1, forte2: 1, heals: true });

export const Skill = cantaAction("Skill - Graceful Step", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 147.2, forte1: 1 });
export const ESkill = cantaAction("Skill - Flickering Reverie", { node: Node.Skill, cast: Cast.Skill, cast2: Cast.Echo, type: Type1.Skill, mv: 196.23 });
/** At 3 Shiver — CANTARELLA's own update() resets forte2 to 3 first, so -3 lands on 0 exactly. */
export const FSkill = cantaAction("Forte - Perception Drain", { node: Node.Forte, cast: Cast.Skill, cast2: Cast.Echo, type: Type1.Basic, mv: 1335.98, forte2: -3, heals: true });

export const Liberation = cantaAction("Liberation - Beneath the Sea", { node: Node.Liberation, cast: Cast.Liberation, cast2: Cast.Echo, type: Type1.Basic, mv: 376, forte1: 3 });
export const ACTION_DIFFUSION = cantaAction("Liberation - Diffusion x21", { node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 305.34, active: false });

export const Intro = cantaAction("Intro - Ripple", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 169, forte1: 1 });
export const Outro = cantaAction("Outro - Gentle Tentacles", { cast: Cast.Outro, mv: 0, active: false });

export const ESKILL_JOLT = new Action("Jolt", { node: Node.Skill, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Basic, mv: 198.81 });

/* ------------------------------------------------------------------------------------ buffs */

export const POISON = new Buff({
  name: "Cantarella: Poison", maxStacks: 2,
  apply: () => addStat(Stat.DmgBonus, 6 * stacks(), Attribute.Havoc),
  convert: () => { if (casting(Cast.Outro)) revoke(POISON); },
});

// team-wide: any Echo Skill cast (anyone's) restores her own Concerto — deferred (no damage
// impact); the 6-charge stack-decay itself is still modeled faithfully
export const ABYSSAL_REBIRTH = new Buff({
  name: "Cantarella: Abyssal Rebirth", maxStacks: 6,
  update: () => { if (casting(Cast.Echo)) removeStackTeam(ABYSSAL_REBIRTH, 1); },
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

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const CA_LOADOUT = new Loadout(
  CANTARELLA,
  CANTARELLA_TALENTS,
  CA_INHERENT_1,
  CA_INHERENT_2,
  WHISPERS_OF_SIRENS,
  HERON,
  MOONLIT_CLOUDS_5PC,
  MOONLIT_CLOUDS_2PC,
  mainstats("CR", "havoc havoc", "atk atk"),
  chem("atk", "basic"),
);
