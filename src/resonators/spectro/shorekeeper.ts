/**
 * Shorekeeper, ported to the new engine. Her damage barely matters; the Stellarealm is what she's
 * for, giving the team crit rate then crit damage scaled off her own energy regen.
 *
 * The realm's life: End Loop *generates* the Outer Stellarealm — a new one replaces whatever is
 * standing rather than evolving it — every Intro anyone casts inside it steps it a stage (modelled
 * on the outro that hands the field over), and Discernment, her replacement Intro at Supernal,
 * ends it — or, with S1, leaves it standing for her own next End Loop to replace.
 *
 * Numbers from nanoka.cc (character 1505); Base DEF (1100) confirmed there directly, since the
 * migrated sheet this was ported from didn't carry it. Her resonance chain is below the buffs.
 */
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyTeam,
  applyCurrent,
  addBuff,
  revokeBuff,
  stacksOfTeam,
  currentAction,
  currentTeam,
  casting,
  isHeld,
  revokeTeam,
  addStat,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, START_1, START_2, START_3, SWAP, NOINTRO, INTRO, ECHO_CANCEL, OUTRO, DODGE, JUMP, ECHO_SWAP } from "../../engine/rotation.js";
import { HEALS } from "../../shared/status.js";
import { SK_SIG } from "../../weapons/rectifier.js";
import { VARIATION } from "../../weapons/standard.js";
import { REJUV_5PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { mainstats, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { SPACETREK_EXPLORER, STARRY_RADIANCE_5PC } from "../../echoes/lahairoi.js";

/* ----------------------------------------------------------------------------------- actions */

function skAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// Empirical Data (forte1): 1 a stage, capped at 5 — the engine floors at 0 but imposes no
// ceiling itself, so BA3's +2/MA's +1 landing on 5 relies on this loop never running a fourth
// basic before Forte: Illation spends the whole gauge below.
const BA1 = skAction("Basic - Origin Calculus 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 31.78, energy: 0.5, concerto: 1.6, offtune: 2664, forte1: 1 });
const BA2 = skAction("Basic - Origin Calculus 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 47.72, energy: 0.76, concerto: 2.4, offtune: 4000, forte1: 1 });
const BA3 = skAction("Basic - Origin Calculus 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 69.96, energy: 1.11, concerto: 3.54, offtune: 5865, forte1: 2 });

const MA = skAction("Mid-air - Origin Calculus", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 73.96, energy: 1.55, concerto: 5, offtune: 4960, forte1: 1 });

const Skill = skAction("Skill - Chaos Theory", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 156.55, energy: 10, concerto: 30, offtune: 5250 });

const FHA = skAction("Forte Heavy - Illation", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 281.3, energy: 4.95, concerto: 11, offtune: 6360, forte1: -5 });

const Liberation = skAction("Liberation - End Loop", {
  node: Node.Liberation, cast: Cast.Liberation, concerto: 20, resetEnergy: true,
  // "Generate the Outer Stellarealm": a cast puts up a *new* realm rather than stepping the one
  // already standing, so whatever stage is up is replaced by Outer — which is what puts the realm
  // S1 carried through Discernment back at the bottom.
  updateBuffs: () => {
    revokeTeam(SK_REALM);
    applyTeam(SK_REALM, 1);
  },
});

const Intro = skAction("Intro - Enlightenment", { node: Node.Intro, cast: Cast.Intro, type: Type1.Skill, mv: 226.5, energy: 10, concerto: 20, offtune: 11395 });
// replaces plain Intro when SK_REALM is Supernal (see SHOREKEEPER_RESONATOR's own intro() below); scales
// off HP, counts as liberation damage, always crits, and ends the realm on resolving
const EIntro = skAction("Intro - Discernment", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Liberation, scaling: Scaling.Hp, mv: 58.92,
  energy: 10.02, concerto: 20, offtune: 73242,
  applyStats: () => { addStat(Stat.CritRate, 100); },
  updateBuffs: () => {
    // One Discernment per Supernal realm generated (its own text), with nothing here to enforce
    // it: her End Loop stands between any two of her Intros and puts a fresh Outer realm up, so
    // the stage alone can never still read Supernal by the time she arrives again.
    // S1: "Casting Intro Skill Discernment no longer ends the existing Stellarealm" — so the realm
    // stands as it is (Supernal, until her next End Loop replaces it) and Rover keeps the Self
    // Gravitation that only ever falls off with it
    if (isHeld(SK_S1)) return;
    revokeTeam(SK_REALM);
    // doesn't fall off Rover on its own just because the realm ends
    const rover = currentTeam().slots.find((s) => s.resonator?.name.includes("Rover"))?.resonator;
    if (rover) revokeBuff(rover, SK_ROVER_GRAVITATION);
  },
});

/** Puts Binary Butterfly on the team, so amplification starts with whoever she hands the field to. */
const Outro = skAction("Outro - Binary Butterfly", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => applyTeam(SK_OUTRO, 1),
});

/* ------------------------------------------------------------------------------------ buffs */

/** The realm, as one team-wide buff whose stack count *is* the stage: 1 Outer (heals only, no
 *  stat), 2 Inner (+12.5% Crit Rate), 3 Supernal (also +25% Crit Dmg). Evolves on any outro; ends
 *  only when Discernment plays (see SHOREKEEPER_RESONATOR's own updateBuffs() below). */
const REALM_STAGE = ["Outer", "Inner", "Supernal"];

const SK_REALM = new Buff({
  name: "Shorekeeper: Stellarealm", maxStacks: 3,
  display: (): string => `Shorekeeper: ${REALM_STAGE[stacksOfTeam(SK_REALM) - 1]} Stellarealm`,
  updateBuffs: () => { if (casting(Cast.Outro)) applyTeam(SK_REALM, 1); },
  applyStats: () => {
    const stage = stacksOfTeam(SK_REALM);
    if (stage < 2) return; // Outer pays no stat
    addStat(Stat.CritRate, 12.5);
    if (stage >= 3) addStat(Stat.CritDmg, 25);
  },
});

/** Team-wide amplification her outro puts up — permanent uptime once granted, not a handoff. */
const SK_OUTRO = new Buff({
  name: "Shorekeeper: Outro",
  applyStats: () => addStat(Stat.Amp, 15),
});

/** Self Gravitation's own extension onto Rover — lives on Rover's own local stack (granted via
 *  addBuff(), see SK_INHERENT_2 below) so the ER still traces to Shorekeeper on Rover's own row. */
const SK_ROVER_GRAVITATION = new Buff({
  name: "Inherent: Self Gravitation",
  applyStats: () => { if (stacksOfTeam(SK_REALM)) addStat(Stat.Er, 10); },
});

/** Self Gravitation (Inherent Skill): +10% ER while inside a Stellarealm — assumed always true
 *  once one is up. Also extends to any teammate whose name contains "Rover", via updateGlobal()
 *  so it reaches their turn from turn one regardless of team order. */
const SK_INHERENT_2 = new Inherent({
  name: "Inherent: Self Gravitation",
  applyStats: () => {
    if (stacksOfTeam(SK_REALM)) addStat(Stat.Er, 10);
  },
  updateGlobal: () => {
    // gated on the realm being up, not unconditional — otherwise this would re-grant Rover's
    // copy right back after SHOREKEEPER_RESONATOR's own updateBuffs() revokes it on EIntro
    if (!stacksOfTeam(SK_REALM)) return;
    const rover = currentTeam().slots.find((s) => s.resonator?.name.includes("Rover"))?.resonator;
    if (rover) addBuff(rover, SK_ROVER_GRAVITATION);
  },
});

const SK_INHERENT_1 = new Inherent({ name: "Inherent: Life Entwined" }); // revive

/* --------------------------------------------------------------------------- resonance chain */

/** S1: the range and the +10s reach nothing this calculator computes. What does is its third
 *  clause — Discernment no longer ends the Stellarealm, read by EIntro above. */
const SK_S1 = new Sequence({ name: "Shorekeeper S1: Unspoken Conjecture" });

/** S2: on the *Outer* realm, and every stage above it "has all the effects of the Outer" — so it
 *  pays whenever any realm stands. Team-wide, so it cannot live on the node itself (a Sequence is
 *  gear on her own slot and its stats reach only her turns): the node mirrors the realm onto a
 *  buff of the team's, put up and taken down with it from updateGlobal, which runs whoever acts. */
const SK_S2_TEAM = new Buff({
  name: "Shorekeeper S2: Night's Gift and Refusal",
  applyStats: () => addStat(Stat.BonusAtk, 40),
});

const SK_S2 = new Sequence({
  name: "Shorekeeper S2: Night's Gift and Refusal",
  updateGlobal: () => {
    if (stacksOfTeam(SK_REALM)) applyTeam(SK_S2_TEAM, 1);
    else revokeTeam(SK_S2_TEAM);
  },
});

const SK_S3 = new Sequence({
  name: "Shorekeeper S3: Infinity Awaits Me",
  applyStats: () => {
    if (currentAction() === Liberation) addStat(Stat.AddConcerto, 20);
  },
});

/** S4: Healing Bonus is out of this calculator's formula, so this is tracked for completeness the
 *  way her talents' own 12% is. Named Overflowing Quietude, which is a chain node and not the
 *  Inherent Skill an older comment on Chaos Theory called it. */
const SK_S4 = new Sequence({
  name: "Shorekeeper S4: Overflowing Quietude",
  applyStats: () => { if (currentAction() === Skill) addStat(Stat.HealingBonus, 70); },
});

/** S5: two pull ranges. Nothing here has a range, so this is held for its name alone. */
const SK_S5 = new Sequence({ name: "Shorekeeper S5: Echoes in Silence" });

const SK_S6 = new Sequence({
  name: "Shorekeeper S6: To the New World",
  applyStats: () => { if (currentAction() === EIntro) { addStat(Stat.MulMv, 42); addStat(Stat.CritDmg, 500); } },
});

const SHOREKEEPER_RESONATOR = new Resonator({
  name: "Shorekeeper",
  element: Attribute.Spectro,
  weapon: WeaponType.Rectifier,
  color: "#728cf3",
  maxEnergy: 175,
  // reads SK_REALM's own live stack count, already stepped by the preceding outro
  intro: () => (stacksOfTeam(SK_REALM) >= 3 ? EIntro : Intro),
  outro: () => Outro,

  updateDebuffs: () => {
    const a = currentAction();
    // her own healing marker, read by every healing sonata and weapon (statuses.ts) —
    // applied to the healer alone, never the team
    if (a === Skill || a === Liberation || a === Intro || a === EIntro) applyCurrent(HEALS, 1);
  },

  constantStats: () => {
    addStat(Stat.BaseHp, 16712.5); addStat(Stat.BaseAtk, 287.5); addStat(Stat.BaseDef, 1100);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const SHOREKEEPER_TALENTS = new Talent({
  name: "Shorekeeper: Talents",
  constantStats: () => {
    addStat(Stat.BonusHp, 12);
    addStat(Stat.HealingBonus, 12); // stat-tree Healing Bonus+ nodes — unused by the formula
  },
});

// INTRO resolves to plain Intro or Discernment on its own — same marker for opener and loop.
// The loop is shorter than the opener; it generates just over the 100 concerto the outro spends.
// NOINTRO ROTATIONS DO NOT HAVE AN INTRO

const BA123 = new ActionGroup("Basic - Origin Calculus 123", [BA1, BA2, BA3]);

const SK_LOOP = new Rotation([
  START_3, Skill, Liberation, ECHO_SWAP, SWAP,

  NOINTRO, 
  BA123, JUMP, MA, FHA,
  Skill, BA2, BA3, DODGE,
  BA1, BA2, FHA, 
  Liberation, ECHO_SWAP, OUTRO,

  INTRO, BA123, JUMP, MA, FHA,
  START_2, Skill, SWAP,
  Liberation, ECHO_SWAP, OUTRO,
]);

const SK_LOOP_S3 = new Rotation([
  START_3, Skill, Liberation, ECHO_SWAP, SWAP,

  NOINTRO, 
  BA123, JUMP, MA, FHA,
  Skill,
  Liberation, ECHO_SWAP, OUTRO,

  INTRO, BA1,
  START_2, Skill, SWAP,
  Liberation, ECHO_SWAP, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const SHOREKEEPER = new Loadout({
  resonator: SHOREKEEPER_RESONATOR,
  talent: SHOREKEEPER_TALENTS,
  inherent1: SK_INHERENT_1,
  inherent2: SK_INHERENT_2,
  weapons: [SK_SIG, VARIATION],
  echoLoadouts: [new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(SPACETREK_EXPLORER, STARRY_RADIANCE_5PC),],
  sequences: [SK_S1, SK_S2, SK_S3, SK_S4, SK_S5, SK_S6],
  mainstats: [mainstats(Mainstat.HP4, Mainstat.ER3, Mainstat.ER3, Mainstat.HP1, Mainstat.HP1)],
  substat: chem("hp", "liberation"),
    rotation: [SK_LOOP, SK_LOOP, SK_LOOP, SK_LOOP_S3],
});
