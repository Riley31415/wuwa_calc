/**
 * Xiangli Yao, ported to the new engine — sequence-0 core loop, a limited 5-star (not
 * `standardCharacter`). An electro gauntlets main DPS built around his Liberation: Cogitation
 * Model deals a huge hit and opens Intuition (24s, 3 Hypercubes), swapping his kit for Pivot -
 * Impale basics, Divergence, and Unfathomed — Law of Reigns (5 Performance Capacity, one
 * Hypercube each) and Revamp are the mode's forte payoffs, all considered Resonance Liberation
 * DMG. Out of the mode, Capacity (forte1, 100) charges Decipher, also Liberation DMG. Intuition
 * itself isn't tracked live — the rotation hand-orders a kit-valid line, same as Zhezhi's
 * Imprints.
 *
 * Numbers from nanoka.cc (character 1305) — MV/energy/concerto/offtune all resolved off the
 * site's own level-10 damage table; no migrated-sheet rows exist for him. Capacity gain amounts
 * per hit are published nowhere, so they're hand-derived plausible values (the full Probe combo
 * plus one Deduction lands exactly on 100); Performance Capacity gains are real kit-text numbers
 * (forte2: +1/+2/+3 as each move declares, -5 a Law of Reigns).
 *
 * His two Inherent Skills, off the page's own "INHERENT SKILLS" section:
 *  - Knowing: +5% Electro DMG Bonus a stack after casting Resonance Skill, up to 4, 8s.
 *  - Focus: interruption resistance during Intuition — no combat-formula effect, a do-nothing
 *    marker.
 * Chain Rule (Outro): up to 3 laser beams at 237.63% each off the incoming resonator's Basic
 * Attacks — one lumped action queued off his own Outro, same shape as Zhezhi's Inklit Spirit.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, currentAction, casting, revoke, addStat, stacks, queue,
} from "../kit.js";
import { VERITYS_HANDLE } from "../weapons/gauntlet.js";
import { ABYSS_SURGES, NEW_STD_GAUNTLET } from "../weapons/standard.js";
import { NM_MEPHIS, VOID_THUNDER_5PC, VOID_THUNDER_2PC } from "../echoes/jinzhou.js";
import { mainstatOptions } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function xlyAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- basics, heavy, mid-air, dodge counter (Probe) — every hit feeds Capacity
export const BA1 = xlyAction("Basic - Probe 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 33.11 * 2, energy: 0.84, concerto: 1.68, offtune: 2664, forte1: 10 });
export const BA2 = xlyAction("Basic - Probe 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 99.61, energy: 1.26, concerto: 2.51, offtune: 4008, forte1: 10 });
export const BA3 = xlyAction("Basic - Probe 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 39.76 * 3, energy: 1.50, concerto: 3.00, offtune: 4800, forte1: 15 });
export const BA4 = xlyAction("Basic - Probe 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 53.05 * 2 + 26.53, energy: 1.68, concerto: 3.35, offtune: 5338, forte1: 15 });
export const BA5 = xlyAction("Basic - Probe 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 198.81, energy: 2.50, concerto: 5.00, offtune: 8000, forte1: 20 });

export const HA = xlyAction("Heavy - Probe", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 82.81 * 2, energy: 2.10, concerto: 4.18, offtune: 6664, forte1: 10 });
export const MA = xlyAction("Basic - Probe (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 123.27, energy: 0.52, concerto: 1.00, offtune: 4960, forte1: 5 });
export const DC = xlyAction("Basic - Probe (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 238.58, energy: 2.75, concerto: 12.50, offtune: 4000, forte1: 10 });

export const Skill = xlyAction("Skill - Deduction", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 198.81, energy: 6.25, concerto: 7, offtune: 4000, forte1: 30 });
/** Decipher: spends the full 100 Capacity, considered Resonance Liberation DMG. */
export const FSkill = xlyAction("Forte Skill - Decipher", { node: Node.Forte, cast: Cast.Skill, type: Type1.Liberation, mv: 397.82, energy: 1.67, concerto: 7, offtune: 5336, forte1: -100 });

export const Liberation = xlyAction("Liberation - Cogitation Model", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1466.06, concerto: 20, offtune: 67200, resetEnergy: true });

// Intuition's own moveset — Pivot - Impale basics, Divergence, Unfathomed; Performance Capacity
// (forte2) deltas are the kit text's own numbers
export const UBA1 = xlyAction("Basic - Pivot: Impale 1", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 119.67, energy: 1.31, concerto: 2.62, offtune: 4192, forte2: 1 });
export const UBA2 = xlyAction("Basic - Pivot: Impale 2", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 60.92 * 4, energy: 2.68, concerto: 5.36, offtune: 8536, forte2: 2 });
export const UBA3 = xlyAction("Basic - Pivot: Impale 3", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 133.25 * 2, energy: 2.92, concerto: 5.84, offtune: 9336, forte2: 2 });
export const USkill = xlyAction("Skill - Divergence", { node: Node.Liberation, cast: Cast.Skill, type: Type1.Skill, mv: 49.59 * 3 + 173.55 * 2, energy: 9.94, concerto: 15.00, offtune: 9316, forte2: 2 });
export const UDC = xlyAction("Basic - Unfathomed (Dodge Counter)", { node: Node.Liberation, cast: Cast.DodgeCounter, type: Type1.Liberation, mv: 38.83 * 2 + 310.58, energy: 4.00, concerto: 15.00, offtune: 8000, forte2: 2 });

/** Law of Reigns: 5 Performance Capacity and a Hypercube a cast, considered Liberation DMG. */
export const FSkill2 = xlyAction("Forte Skill - Law of Reigns", { node: Node.Forte, cast: Cast.Skill, type: Type1.Liberation, mv: 95.73 * 4 + 255.28, energy: 4.78, concerto: 10, offtune: 45600, forte2: -5 });
/** Revamp, the mid-air follow-up to Decipher/Divergence — considered Liberation DMG. */
export const MA2 = xlyAction("Basic - Revamp (Mid-Air)", { node: Node.Forte, cast: Cast.Basic, type: Type1.Liberation, mv: 21.87 * 4 + 65.61 * 2, energy: 2.78, concerto: 5, offtune: 8800, forte2: 3 });

export const Intro = xlyAction("Intro - Principle", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 99.41 * 2, energy: 10.00, concerto: 10, offtune: 11200 });
/** Chain Rule: no damage of its own, just the handoff — its lasers are ACTION_OUTRO_COORDS. */
export const Outro = xlyAction("Outro - Chain Rule", { cast: Cast.Outro, active: false });
/** Up to 3 laser beams off the incoming resonator's Basic Attacks, lumped. */
export const ACTION_OUTRO_COORDS = xlyAction("Outro - Chain Rule x3", { type: Type1.Outro, mv: 237.63 * 3, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** Knowing (Inherent Skill): +5% Electro DMG Bonus a stack on casting Resonance Skill, up to 4,
 *  8s — held for his whole field window, lost after his outro. */
export const KNOWING = new Buff({
  name: "Xiangli Yao: Knowing", maxStacks: 4,
  apply: () => addStat(Stat.DmgBonus, 5 * stacks(), Attribute.Electro),
  convert: () => { if (casting(Cast.Outro)) revoke(KNOWING); },
});
export const XLY_INHERENT_1 = new Inherent({
  name: "Xiangli Yao: Knowing",
  update: () => { if (casting(Cast.Skill)) applySelf(KNOWING, 1); },
});

/** Focus (Inherent Skill): interruption resistance during Intuition — see file header. */
export const XLY_INHERENT_2 = new Inherent({ name: "Xiangli Yao: Focus" });

export const XIANGLI_YAO = new Resonator({
  name: "Xiangli Yao",
  abbreviation: "XLY",
  element: Attribute.Electro,
  weapon: WeaponType.Gauntlets,
  intro: () => Intro,
  color: "#6b74e8",
  maxEnergy: 125,

  update: () => {
    if (currentAction() === Outro) queue(ACTION_OUTRO_COORDS);
  },

  apply: () => {
    addStat(Stat.BaseHp, 10625); addStat(Stat.BaseAtk, 425); addStat(Stat.BaseDef, 1222.22);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
export const XLY_TALENTS = new Talent({
  name: "Xiangli Yao: Talents",
  apply: () => { addStat(Stat.CritDmg, 16); addStat(Stat.BonusAtk, 12); },
});

// Deduction plus the full Probe combo lands exactly on 100 Capacity for Decipher; Cogitation
// Model opens Intuition, whose three Law of Reigns each spend the 5 Performance Capacity the
// moves before them bank (pivot combo 1+2+2, then Divergence 2 + Revamp 3, then a second pivot
// combo). He's never the team's own lead, so this covers both opener and loop.
export const XLY_ROTATION = [
  INTRO, Skill, BA1, BA2, BA3, BA4, BA5, FSkill,
  ECHO_CAST, Liberation,
  UBA1, UBA2, UBA3, FSkill2,
  USkill, MA2, FSkill2,
  UBA1, UBA2, UBA3, FSkill2,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const XLY_LOADOUT = new Loadout(
  XIANGLI_YAO, true, XLY_TALENTS, XLY_INHERENT_1, XLY_INHERENT_2,
  [VERITYS_HANDLE, ABYSS_SURGES, NEW_STD_GAUNTLET],
  [new EchoLoadout(NM_MEPHIS, VOID_THUNDER_5PC, VOID_THUNDER_2PC)],
  mainstatOptions(["CR", "CD"], ["atk", "electro"], ["atk"]), chem("atk", "liberation"),
  XLY_ROTATION, XLY_ROTATION,
);
