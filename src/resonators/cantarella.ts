/**
 * Cantarella, ported to the new engine. Sequence-0 core loop. Healing is out of scope, same as
 * the old engine — "Cure" and Trance-consuming heals are left out entirely.
 *
 * Trance (forte1) and Shiver (forte2) are plain buff-stacks, not Resonator fields or Action
 * resource deltas — every action that moves either is a lookup in TRANCE_DELTA/SHIVER_DELTA,
 * applied from CANTARELLA_KIT's own update().
 */
import {
  Buff, Resonator, Gear, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Type2, Cast, Node, Scaling,
  applySelf, removeStack, stacksOf, currentAction, casting, queue, queueOutro,
  removeStackTeam, setStacksTeam, revoke, addStat, stacks,
} from "../kit.js";
import { WHISPERS_OF_SIRENS } from "../weapons/rectifier.js";
import { HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../echoes/jinzhou.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------------------------------------ buffs */

export const CANTARELLA_TRANCE = new Buff({ name: "Cantarella: Trance", maxStacks: 20 });
export const CANTARELLA_SHIVER = new Buff({ name: "Cantarella: Shiver", maxStacks: 20 });

export const POISON = new Buff({
  name: "Cantarella: Poison", maxStacks: 2,
  apply: () => addStat(Stat.DmgBonus, 6 * stacks(), Element.Havoc),
  // 10s window, so it still counts on her own outro (see jinzhou.ts's HERON_HANDOFF)
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
  update: () => { if (!stacksOf(CANTARELLA_TRANCE) || casting(Cast.Outro)) revoke(MIRAGE); },
});

export const ESKILL_JOLT = new Action("Jolt", { node: Node.Skill, element: Element.Havoc, scaling: Scaling.Atk, type: Type1.Basic, mv: 198.81 });

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
  apply: () => { addStat(Stat.Amp, 20, Element.Havoc); addStat(Stat.Amp, 25, Type1.Skill); },
  // a plain window, not "lost on swap" wording — still counts on the recipient's own outro (see
  // jinzhou.ts's HERON_HANDOFF for the same shape)
  convert: () => { if (casting(Cast.Outro)) revoke(CANTARELLA_OUTRO); },
});

/* ----------------------------------------------------------------------------------- actions */

function cantaAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Havoc, scaling: Scaling.Atk, ...def });
}

export const BA1 = cantaAction("Basic - Illusion Collapse 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.53 });
export const BA2 = cantaAction("Basic - Illusion Collapse 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 145.76 });
export const BA3 = cantaAction("Basic - Illusion Collapse 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 145.14 });

export const EHA = cantaAction("Heavy - Delusive Dive", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 106.1 });

export const FBA1 = cantaAction("Forte - Phantom Sting 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 105.99 });
export const FBA2 = cantaAction("Forte - Phantom Sting 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 125.86 });
export const FBA3 = cantaAction("Forte - Phantom Sting 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, type2: Type2.Coordinated, mv: 258.48 });

export const Skill = cantaAction("Skill - Graceful Step", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 147.2 });
export const ESkill = cantaAction("Skill - Flickering Reverie", { node: Node.Skill, cast: Cast.Skill, cast2: Cast.Echo, type: Type1.Skill, mv: 196.23 });
export const FSkill = cantaAction("Forte - Perception Drain", { node: Node.Forte, cast: Cast.Skill, cast2: Cast.Echo, type: Type1.Basic, mv: 1335.98 });

export const Liberation = cantaAction("Liberation - Beneath the Sea", { node: Node.Liberation, cast: Cast.Liberation, cast2: Cast.Echo, type: Type1.Basic, mv: 376 });
export const ACTION_DIFFUSION = cantaAction("Liberation - Diffusion x21", { node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 305.34, active: false });

export const Intro = cantaAction("Intro - Ripple", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 169 });
export const Outro = cantaAction("Outro - Gentle Tentacles", { cast: Cast.Outro, mv: 0, active: false });

const TRANCE_DELTA = new Map<Action, number>([
  [Intro, 1], [BA3, 1], [Skill, 1], [Liberation, 3],
  [FBA1, -1], [FBA2, -1], [FBA3, -1],
]);
const SHIVER_DELTA = new Map<Action, number>([
  [FBA1, 1], [FBA2, 1], [FBA3, 1], [FSkill, -3],
]);

export const CANTARELLA = new Resonator({
  name: "Cantarella",
  element: Element.Havoc,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  color: "#7c6fd6",
  maxEnergy: 12500,

  update: () => {
    const a = currentAction();
    const trance = TRANCE_DELTA.get(a);
    if (trance) { if (trance > 0) applySelf(CANTARELLA_TRANCE, trance); else removeStack(CANTARELLA_TRANCE, -trance); }
    const shiver = SHIVER_DELTA.get(a);
    if (shiver) { if (shiver > 0) applySelf(CANTARELLA_SHIVER, shiver); else removeStack(CANTARELLA_SHIVER, -shiver); }

    if (casting(Cast.Echo)) applySelf(POISON, 1);
    if (a === EHA) applySelf(MIRAGE, 1);
    if (a === ESkill) applySelf(HAZY_DREAM, 1);
    if (a === Intro) setStacksTeam(ABYSSAL_REBIRTH, 6);
    if (a === Outro) { queue(ACTION_DIFFUSION); queueOutro(CANTARELLA_OUTRO); }
  },

  apply: () => {
    addStat(Stat.BaseHp, 11600); addStat(Stat.BaseAtk, 400); addStat(Stat.BaseDef, 1100);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const CANTARELLA_TALENTS = new Buff({
  name: "Cantarella: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

export const CA_ROTATION = [INTRO, Skill, EHA, ECHO_CAST, Liberation, ESkill, FBA1, FBA2, FBA3, FSkill, Outro];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents, weapon, mainslot echo, sonata pieces, mainstat/substat
export const CA_LOADOUT: Gear[] = [
  CANTARELLA, CANTARELLA_TALENTS,
  WHISPERS_OF_SIRENS,
  HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC,
  mainstats("CR", "havoc havoc", "atk atk"), chem("atk", "basic"),
];
