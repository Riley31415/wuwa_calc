/**
 * Shorekeeper, ported to the new engine — sequence-0 core loop only. Her damage barely matters;
 * the Stellarealm is what she's for, giving the team crit rate then crit damage scaled off her
 * own energy regen.
 *
 * Numbers from nanoka.cc (character 1505); Base DEF (1100) confirmed there directly, since the
 * migrated sheet this was ported from didn't carry it.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applyTeam, applySelf, addBuff, revokeBuff, stacksOfTeam, currentAction, currentTeam, casting, revokeTeam, addStat,
} from "../../kit.js";
import { SK_SIG } from "../../weapons/rectifier.js";
import { VARIATION } from "../../weapons/standard.js";
import { REJUV_5PC, REJUV_2PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { mainstats } from "../../mainstats.js";
import { chem } from "../../substats.js";

/* ----------------------------------------------------------------------------------- actions */

function skAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// Empirical Data (forte1): 1 a stage, capped at 5 — the engine floors at 0 but imposes no
// ceiling itself, so BA3's +2/MA's +1 landing on 5 relies on this loop never running a fourth
// basic before Forte: Illation spends the whole gauge below.
export const BA1 = skAction("Basic - Origin Calculus 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 31.78, energy: 0.5, concerto: 1.6, offtune: 2664, forte1: 1 });
export const BA2 = skAction("Basic - Origin Calculus 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 47.72, energy: 0.76, concerto: 2.4, offtune: 4000, forte1: 1 });
export const BA3 = skAction("Basic - Origin Calculus 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 69.96, energy: 1.11, concerto: 3.54, offtune: 5865, forte1: 2 });

export const MA = skAction("Basic - Origin Calculus (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.96, energy: 1.55, concerto: 5, offtune: 4960, forte1: 1 });

// Overflowing Quietude (Inherent Skill): +70% Healing Bonus on cast — no duration given, applied
// same-cast. Healing Bonus is unused by the formula, tracked for completeness.
export const Skill = skAction("Skill - Chaos Theory", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 156.55, heals: true, energy: 10, concerto: 30, offtune: 5250 });

export const FHA = skAction("Forte - Illation", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 281.3, energy: 4.95, concerto: 11, offtune: 6360, forte1: -5 });

export const Liberation = skAction("Liberation - End Loop", {
  node: Node.Liberation, cast: Cast.Liberation, mv: 0, heals: true, concerto: 20, resetEnergy: true,
});

export const Intro = skAction("Intro - Enlightenment", { node: Node.Intro, cast: Cast.Intro, type: Type1.Skill, mv: 226.5, heals: true, energy: 10, concerto: 20, offtune: 11395 });
// replaces plain Intro when SK_REALM is Supernal (see SHOREKEEPER's own intro() below); scales
// off HP, counts as liberation damage, always crits, and ends the realm on resolving
export const EIntro = skAction("Intro - Discernment", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Liberation, scaling: Scaling.Hp, mv: 58.92, heals: true,
  energy: 10.02, concerto: 20, offtune: 73242,
});

/** Puts Binary Butterfly on the team, so amplification starts with whoever she hands the field to. */
export const Outro = skAction("Outro - Binary Butterfly", { cast: Cast.Outro, active: false, mv: 0 });

/* ------------------------------------------------------------------------------------ buffs */

/** The realm, as one team-wide buff whose stack count *is* the stage: 1 Outer (heals only, no
 *  stat), 2 Inner (+12.5% Crit Rate), 3 Supernal (also +25% Crit Dmg). Evolves on any outro; ends
 *  only when Discernment plays (see SHOREKEEPER's own update() below). */
const REALM_STAGE = ["Outer", "Inner", "Supernal"];

export const SK_REALM = new Buff({
  name: "Shorekeeper: Stellarealm", maxStacks: 3,
  display: (): string => `Shorekeeper: ${REALM_STAGE[stacksOfTeam(SK_REALM) - 1]} Stellarealm`,
  update: () => { if (casting(Cast.Outro)) applyTeam(SK_REALM, 1); },
  apply: () => {
    const stage = stacksOfTeam(SK_REALM);
    if (stage < 2) return; // Outer pays no stat
    addStat(Stat.CritRate, 12.5);
    if (stage >= 3) addStat(Stat.CritDmg, 25);
  },
});

/** Team-wide amplification her outro puts up — permanent uptime once granted, not a handoff. */
export const SK_OUTRO = new Buff({
  name: "Shorekeeper: Outro",
  apply: () => addStat(Stat.Amp, 15),
});

/** Discernment always crits — its own Buff so it traces to a distinct source in the report,
 *  self-granted at combat start rather than added to the loadout (so it still shows in the
 *  popover's own buffs list, which excludes equipped gear). */
export const SK_DISCERNMENT = new Buff({
  name: "Shorekeeper: Discernment",
  apply: () => { if (currentAction() === EIntro) addStat(Stat.CritRate, 100); },
});

/** Self Gravitation's own extension onto Rover — lives on Rover's own local stack (granted via
 *  addBuff(), see SK_INHERENT_2 below) so the ER still traces to Shorekeeper on Rover's own row. */
export const SK_ROVER_GRAVITATION = new Buff({
  name: "Shorekeeper: Self Gravitation",
  apply: () => { if (stacksOfTeam(SK_REALM)) addStat(Stat.Er, 10); },
});

/** Self Gravitation (Inherent Skill): +10% ER while inside a Stellarealm — assumed always true
 *  once one is up. Also extends to any teammate whose name contains "Rover", via updateGlobal()
 *  so it reaches their turn from turn one regardless of team order. */
export const SK_INHERENT_2 = new Inherent({
  name: "Shorekeeper: Self Gravitation",
  apply: () => {
    if (stacksOfTeam(SK_REALM)) addStat(Stat.Er, 10);
  },
  updateGlobal: () => {
    // gated on the realm being up, not unconditional — otherwise this would re-grant Rover's
    // copy right back after SHOREKEEPER's own update() revokes it on EIntro
    if (!stacksOfTeam(SK_REALM)) return;
    const rover = currentTeam().slots.find((s) => s.resonator?.name.includes("Rover"))?.resonator;
    if (rover) addBuff(rover, SK_ROVER_GRAVITATION);
  },
});

export const SK_INHERENT_1 = new Inherent({ name: "Shorekeeper: Life Entwined" }); // revive

export const SHOREKEEPER = new Resonator({
  name: "Shorekeeper",
  abbreviation: "SK",
  element: Attribute.Spectro,
  weapon: WeaponType.Rectifier,
  color: "#f2e08a",
  maxEnergy: 175,
  // reads SK_REALM's own live stack count, already stepped by the preceding outro
  intro: () => (stacksOfTeam(SK_REALM) >= 3 ? EIntro : Intro),

  combatStart: () => applySelf(SK_DISCERNMENT, 1),

  update: () => {
    const a = currentAction();
    if (a === Liberation) applyTeam(SK_REALM, 1);
    if (a === EIntro) {
      revokeTeam(SK_REALM);
      // doesn't fall off Rover on its own just because the realm ends
      const rover = currentTeam().slots.find((s) => s.resonator?.name.includes("Rover"))?.resonator;
      if (rover) revokeBuff(rover, SK_ROVER_GRAVITATION);
    }
    if (a === Outro) applyTeam(SK_OUTRO, 1);
  },

  apply: () => {
    addStat(Stat.BaseHp, 16712.5); addStat(Stat.BaseAtk, 287.5); addStat(Stat.BaseDef, 1100);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const SHOREKEEPER_TALENTS = new Talent({
  name: "Shorekeeper: Talents",
  apply: () => {
    addStat(Stat.BonusHp, 12);
    addStat(Stat.HealingBonus, 12); // stat-tree Healing Bonus+ nodes — unused by the formula
  },
});

// INTRO resolves to plain Intro or Discernment on its own — same marker for opener and loop.
// The loop is shorter than the opener; it generates just over the 100 concerto the outro spends.
// OPENER ROTATIONS DO NOT HAVE AN INTRO
export const SK_OPENER = [
  BA1, BA2, BA3, MA, FHA,
  Skill, BA2, BA3, BA1, BA2, FHA,
  ECHO_CAST, Liberation, Outro,
];
export const SK_LOOP = [
  INTRO, BA1, BA2, BA3, MA, FHA, Skill,
  ECHO_CAST, Liberation, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const SK_LOADOUT = new Loadout(
  SHOREKEEPER,
  false,
  SHOREKEEPER_TALENTS,
  SK_INHERENT_1,
  SK_INHERENT_2,
  [SK_SIG, VARIATION],
  [new EchoLoadout(FALLACY, REJUV_5PC, REJUV_2PC)],
  [mainstats("HP", "ER ER", "hp hp")],
  chem("hp", "liberation"),
  SK_OPENER, SK_LOOP,
);
