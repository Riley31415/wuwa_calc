/**
 * Cantarella, ported to the new engine. Sequence-0 core loop. Healing is out of scope, same as
 * the old engine — "Cure" and Trance-consuming heals are left out entirely.
 *
 * Trance (forte1) and Shiver (forte2) are genuine forte gauges — every action that moves either
 * declares its own delta directly. Perception Drain (FSkill) requires a full 3 Shiver, so
 * CANTARELLA_RESONATOR's own updateBuffs() hard-resets forte2 to exactly 3 first, landing its declared -3 on 0.
 */
import {
  isType, Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Stat, Attribute, WeaponType, Type1,
  Type2, Cast, Node, Scaling, applyCurrent, currentAction, casting, queue, queueOnIntro, queueOutro, removeStack, revokeCurrent,
  addStat, frozenStacks, forte1, setForte2, currentTeam, currentMember, concerto, setConcerto,
  } from "../../engine/kit.js";
import { lostOnSwap, matrix } from "../../shared/helpers.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_CANCEL, OUTRO } from "../../engine/rotation.js";
import { HEALS } from "../../shared/status.js";
import { LETHEAN_ELEGY, RIME_DRAPED_SPROUTS, STRINGMASTER, WHISPERS_OF_SIRENS } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC, REJUV_5PC, REJUV_2PC, NM_CROWNLESS, HAVOC_ECLIPSE_5PC, HAVOC_ECLIPSE_2PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { MIDNIGHT_VEIL_5PC, MIDNIGHT_VEIL_2PC, NM_HECATE, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC, NM_HERON, HECATE } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function cantaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

const BA1 = cantaAction("Basic - Illusion Collapse 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.53, energy: 1, concerto: 2, offtune: 3200 });
const BA2 = cantaAction("Basic - Illusion Collapse 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 145.76, energy: 1.84, concerto: 3.68, offtune: 5864 }); // 36.44%x4
const BA3 = cantaAction("Basic - Illusion Collapse 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 145.14, energy: 1.84, concerto: 3.66, offtune: 5840, forte1: 1 }); // 72.57%x2

const EHA = cantaAction("Heavy - Delusive Dive", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 106.1, energy: 1.68, concerto: 3.34, offtune: 5336, // 53.05%x2
  updateBuffs: () => applyCurrent(MIRAGE, 1),
});

const FBA1 = cantaAction("Forte - Phantom Sting 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 105.99, energy: 1.35, concerto: 2.67, offtune: 4266, forte1: -1, forte2: 1 }); // 35.33%x3
const FBA2 = cantaAction("Forte - Phantom Sting 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 125.86, energy: 1.6, concerto: 3.18, offtune: 5064, forte1: -1, forte2: 1 }); // 62.93%x2
const FBA3 = cantaAction("Forte - Phantom Sting 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, type2: Type2.Coordinated, mv: 258.48, energy: 3.28, concerto: 6.52, offtune: 10400, forte1: -1, forte2: 1 }); // 64.62%x4

const Skill = cantaAction("Skill - Graceful Step", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 147.2, energy: 1.56, concerto: 10, offtune: 4936, forte1: 1 }); // 73.60%x2
const ESkill = cantaAction("Skill - Flickering Reverie", {
  node: Node.Skill, cast: Cast.Skill, cast2: Cast.Echo, type: Type1.Skill, mv: 196.23, energy: 1.65, concerto: 10, offtune: 5264,
  updateBuffs: () => applyCurrent(HAZY_DREAM, 1),
});
/** At 3 Shiver — CANTARELLA_RESONATOR's own updateBuffs() resets forte2 to 3 first, so -3 lands on 0 exactly. */
const FSkill = cantaAction("Forte - Perception Drain", {
  node: Node.Forte, cast: Cast.Skill, cast2: Cast.Echo, type: Type1.Basic, mv: 1335.98, energy: 21.1, concerto: 12, offtune: 57864, forte2: -3, // 667.99%x2
  updateBuffs: () => setForte2(3),
});

const Liberation = cantaAction("Liberation - Beneath the Sea", { node: Node.Liberation, cast: Cast.Liberation, cast2: Cast.Echo, type: Type1.Basic, mv: 376, concerto: 20, offtune: 48000, forte1: 3, resetEnergy: true });
const ACTION_DIFFUSION = cantaAction("Liberation - Diffusion x21", { node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 305.34, active: false }); // 14.54%x21, no energy/concerto/off-tune of its own

const Intro = cantaAction("Intro - Ripple", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 169, energy: 3.16, concerto: 10, offtune: 10120, forte1: 1, // 42.25%x4
  updateBuffs: () => applyCurrent(ABYSSAL_REBIRTH, 6),
});
// Diffusion's whole window as one lump, deferred behind the next Intro: it ticks on past the swap
const Outro = cantaAction("Outro - Gentle Tentacles", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => { queueOnIntro(ACTION_DIFFUSION); queueOutro(CANTARELLA_OUTRO); }
});

const ESKILL_JOLT = new Action("Jolt", { node: Node.Skill, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Basic, mv: 198.81 });

/* ------------------------------------------------------------------------------------ buffs */

const POISON = new Buff({
  name: "Cantarella: Poison", maxStacks: 2,
  applyStats: () => addStat(Stat.DmgBonus, 6 * frozenStacks(), Attribute.Havoc),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(POISON); },
});

/** Abyssal Rebirth: her Intro opens a window in which *any* team member's own Echo Skill cast
 *  hands **her** 6 Concerto Energy, six times over. Self-held but watched from updateGlobal(),
 *  which sees everyone's turn with `currentMember()` pinned to her: on her own cast the 6 goes
 *  through `Stat.AddConcerto` so the action's row credits it, off-field it's written to her bar
 *  directly. The six charges are the stack count, spent as they fire. 25s window on a 25s
 *  cooldown, so it never lapses mid-rotation. */
const ABYSSAL_REBIRTH = new Buff({
  name: "Cantarella: Abyssal Rebirth", maxStacks: 6,
  updateGlobal: () => {
    if (!casting(Cast.Echo) || frozenStacks() <= 0) return;
    removeStack(ABYSSAL_REBIRTH, 1);
    if (currentTeam().slot === currentMember()) addStat(Stat.AddConcerto, 6);
    else setConcerto(concerto() + 6);
  },
});

// opened by Delusive Dive; auto-closes once Trance depletes or on her own outro
const MIRAGE = new Buff({
  name: "Cantarella: Mirage",
  updateBuffs: () => { if (forte1() <= 0 || casting(Cast.Outro)) revokeCurrent(MIRAGE); },
});

// whichever of her own hits lands next (not a Coordinated Attack) triggers Jolt and clears itself
const HAZY_DREAM = new Buff({
  name: "Cantarella: Hazy Dream",
  updateBuffs: () => {
    const a = currentAction();
    if (a === ESkill || isType(Type2.Coordinated)) return;
    revokeCurrent(HAZY_DREAM);
    queue(ESKILL_JOLT);
  },
});

const CANTARELLA_OUTRO = new Buff({
  name: "Cantarella: Outro",
  applyStats: () => { addStat(Stat.Amp, 20, Attribute.Havoc); addStat(Stat.Amp, 25, Type1.Skill); },
  updateBuffs: () => { lostOnSwap(); },
});

// her kit page doesn't name either passive — Poison's own proc (any Echo Skill) and Mirage's own
// (Delusive Dive) are her two Inherent Skills, each its own trigger piece
const CA_INHERENT_1 = new Inherent({
  name: "Cantarella: \"Cure\"",
  constantStats: () => { addStat(Stat.HealingBonus, 20) }
});
const CA_INHERENT_2 = new Inherent({
  name: "Cantarella: \"Poison\"",
  updateBuffs: () => { if (casting(Cast.Echo)) applyCurrent(POISON, 1); },
});

const CANTARELLA_RESONATOR = new Resonator({
  name: "Cantarella",
  element: Attribute.Havoc,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  outro: () => Outro,
  color: "#7c6fd6",
  maxEnergy: 125,

  updateDebuffs: () => {
    const a = currentAction();
    // her own healing marker, read by every healing sonata and weapon (statuses.ts) —
    // applied to the healer alone, never the team
    if (a === FBA1 || a === FBA2 || a === FBA3 || a === FSkill) applyCurrent(HEALS, 1);
  },

  constantStats: () => {
    addStat(Stat.BaseHp, 11600); addStat(Stat.BaseAtk, 400); addStat(Stat.BaseDef, 1100);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CANTARELLA_TALENTS = new Talent({
  name: "Cantarella: Talents",
  constantStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

const FBA123 = new ActionGroup("Forte Basic - Phantom Sting 123", [FBA1, FBA2, FBA3]);

const CA_ROTATION = new Rotation([
  INTRO, BA3, Skill, ECHO_CANCEL,
  Liberation, EHA, ESkill, FBA123, FSkill, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, and three real
// echo choices sharing Impermanence Heron as mainslot — Midnight Veil, Rejuvenating Glow, Moonlit
// Clouds — all automatically iterated (see kit.ts's own EchoLoadout)
export const CANTARELLA = new Loadout({
  resonator: CANTARELLA_RESONATOR,
  matrix: matrix("Cantarella", 25),
  talent: CANTARELLA_TALENTS,
  inherent1: CA_INHERENT_1,
  inherent2: CA_INHERENT_2,
  weapons: [WHISPERS_OF_SIRENS, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER, LETHEAN_ELEGY, RIME_DRAPED_SPROUTS],
  echoLoadouts: [
    new EchoLoadout(NM_HERON, MIDNIGHT_VEIL_5PC, MIDNIGHT_VEIL_2PC),
    new EchoLoadout(FALLACY, REJUV_5PC, REJUV_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(HECATE, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC),
        new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC, HAVOC_ECLIPSE_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
    rotation: CA_ROTATION,
});
