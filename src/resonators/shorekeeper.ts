/**
 * Shorekeeper, ported to the new engine — sequence-0 core loop only. Her damage barely matters;
 * the Stellarealm is what she's for, giving the team crit rate then crit damage scaled off her
 * own energy regen.
 *
 * Numbers from nanoka.cc (character 1505, https://ww.nanoka.cc/character/1505); Base DEF (1100)
 * confirmed there directly, since the migrated sheet this was ported from didn't carry it.
 */
import {
  Buff, Resonator, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Cast, Node, Scaling,
  applyTeam, applySelf, stacksOfTeam, currentAction, currentTeam, casting, revokeTeam, addStat,
} from "../kit.js";
import { SK_SIG } from "../weapons/rectifier.js";
import { FALLACY, REJUV_5PC, REJUV_2PC } from "../echoes/jinzhou.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------------------------------------ buffs */

/**
 * The realm, as one team-wide buff whose stack count *is* the stage:
 *
 *   1  Outer      heals only, pays no stat — nothing to model, healing is out of scope
 *   2  Inner      +12.5% Crit Rate
 *   3  Supernal   also +25% Crit Dmg
 *
 * Evolves on any outro (an outro is always followed by an intro, so it steps *before* whoever's
 * being handed the field pays out) — except when that outro hands the field to Shorekeeper
 * herself while already Supernal: the realm ends right there instead of stepping again, and
 * SK_DISCERNMENT_PENDING is what tells her own `intro()` selector to play Discernment, since by
 * the time her Intro actually resolves SK_REALM itself is already gone.
 */
const REALM_STAGE = ["Outer", "Inner", "Supernal"];

export const SK_REALM = new Buff({
  name: "Shorekeeper: Stellarealm", maxStacks: 3,
  // names its own stage rather than a stack count — "Supernal Stellarealm" is what the kit calls
  // it and what the stage actually means, where "Stellarealm x3" makes the reader do the lookup
  display: (): string => `Shorekeeper: ${REALM_STAGE[stacksOfTeam(SK_REALM) - 1]} Stellarealm`,
  update: () => {
    if (!casting(Cast.Outro)) return;
    const team = currentTeam();
    const next = team.slots[(team.active + 1) % team.slots.length]!;
    if (stacksOfTeam(SK_REALM) >= 3 && next.resonator === SHOREKEEPER) {
      revokeTeam(SK_REALM);
      applyTeam(SK_DISCERNMENT_PENDING, 1);
    } else {
      applyTeam(SK_REALM, 1);
    }
  },
  apply: () => {
    const stage = stacksOfTeam(SK_REALM);
    if (stage < 2) return; // Outer pays no stat
    addStat(Stat.CritRate, 12.5);
    if (stage >= 3) addStat(Stat.CritDmg, 25);
  },
});

/** Set the moment the realm ends (see SK_REALM's own update() above), so her own `intro()`
 *  selector below can still pick Discernment even though SK_REALM itself is already revoked by
 *  the time her Intro resolves. Consumed the instant EIntro plays (see SHOREKEEPER's own
 *  update() below). */
export const SK_DISCERNMENT_PENDING = new Buff({ name: "Shorekeeper: Discernment Pending", maxStacks: 1 });

/** Binary Butterfly: team-wide amplification her outro puts up — permanent uptime once granted,
 *  not a handoff window to whoever intros next. */
export const SK_OUTRO = new Buff({
  name: "Shorekeeper: Outro",
  apply: () => addStat(Stat.Amp, 15),
});

/** Discernment always crits. Its own Buff purely so that +100% Crit Rate traces back to a
 *  distinct "Shorekeeper: Discernment" source in the report instead of blending into her own
 *  base stat line — self-granted at combat start (see her own `combatStart` below), permanent
 *  uptime after, same as everything else of hers that reacts to a specific cast rather than
 *  holding a real window. A genuine Buff, not equipped gear: granting it via `applySelf()` in
 *  `combatStart` (not adding it to `SK_LOADOUT`) is what keeps it showing up in the resonator
 *  popover's own buffs list — equipped gear is deliberately excluded from that list (kit.ts's own
 *  `TeamMember.equipped`), so putting it in the loadout instead would have hidden it there. */
export const SK_DISCERNMENT = new Buff({
  name: "Shorekeeper: Discernment",
  apply: () => { if (currentAction() === EIntro) addStat(Stat.CritRate, 100); },
});

/* ----------------------------------------------------------------------------------- actions */

function skAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Spectro, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune are her own kit's real generation per cast — Liberation/Outro's own
// old declared "spend the bar" costs aren't repeated here (TODO_ENGINE.md: that's what
// Resonator.maxEnergy and the engine's own outro handling are for, see her own combatStart above).
// Empirical Data (forte1): 1 a stage, capped at 5 (5 stages) — the engine floors at 0 but
// imposes no ceiling itself, so BA3's own +2/MA's own +1 landing exactly on 5 here relies on
// this loop never running a fourth basic before Forte: Illation spends the whole gauge below.
export const BA1 = skAction("Basic - Origin Calculus 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 31.78, energy: 0.5, concerto: 1.6, offtune: 2664, forte1: 1 });
export const BA2 = skAction("Basic - Origin Calculus 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 47.72, energy: 0.76, concerto: 2.4, offtune: 4000, forte1: 1 });
export const BA3 = skAction("Basic - Origin Calculus 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 69.96, energy: 1.12, concerto: 3.56, offtune: 5990, forte1: 2 });

export const MA = skAction("Basic - Origin Calculus (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.96, energy: 1.55, concerto: 5, offtune: 4960, forte1: 1 });

// Overflowing Quietude (Inherent Skill): +70% Healing Bonus on casting her Resonance Skill — no
// duration given on the page, so applied same-cast rather than assuming an uptime window.
// Healing Bonus is unused by the formula (healing is out of scope), tracked for completeness.
export const Skill = skAction("Skill - Chaos Theory", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 156.55, heals: true, energy: 10, concerto: 30, offtune: 5250 });

export const FHA = skAction("Forte - Illation", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 281.3, energy: 4.95, concerto: 11, offtune: 6360, forte1: -5 });

export const Liberation = skAction("Liberation - End Loop", {
  node: Node.Liberation, cast: Cast.Liberation, mv: 0, heals: true, concerto: 20,
});

// Intro - Discernment — replaces plain Intro when SK_DISCERNMENT_PENDING is set; scales off HP,
// counts as liberation damage, always crits. The realm itself already ended by the time this
// resolves — it ended on the outro that handed her the field (see SK_REALM's own update()).
export const Intro = skAction("Intro - Enlightenment", { node: Node.Intro, cast: Cast.Intro, type: Type1.Skill, mv: 226.5, heals: true, energy: 10, concerto: 20, offtune: 11395 });
export const EIntro = skAction("Intro - Discernment", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Liberation, scaling: Scaling.Hp, mv: 58.92, heals: true,
  energy: 10.02, concerto: 20, offtune: 73242,
});

/** Puts Binary Butterfly on the team, so amplification starts with whoever she hands the field
 *  to. Deals no damage of its own. */
export const Outro = skAction("Outro - Binary Butterfly", { cast: Cast.Outro, active: false, mv: 0 });

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. The stat-tree talent bonus lives in its own `SHOREKEEPER_TALENTS` buff
 *  below — just another piece of her loadout, not special-cased on the Resonator itself. */
export const SHOREKEEPER = new Resonator({
  name: "Shorekeeper",
  element: Element.Spectro,
  weapon: WeaponType.Rectifier,
  color: "#8fb3d9",
  maxEnergy: 17500,
  // set the moment the preceding outro ended a Supernal realm into her hands (see SK_REALM's
  // own update()) — not a live read of SK_REALM itself, which is already gone by now
  intro: () => (stacksOfTeam(SK_DISCERNMENT_PENDING) > 0 ? EIntro : Intro),

  combatStart: () => applySelf(SK_DISCERNMENT, 1),

  update: () => {
    const a = currentAction();
    if (a === Liberation) applyTeam(SK_REALM, 1);
    if (a === EIntro) revokeTeam(SK_DISCERNMENT_PENDING);
    if (a === Outro) applyTeam(SK_OUTRO, 1);
  },

  apply: () => {
    addStat(Stat.BaseHp, 16712.5); addStat(Stat.BaseAtk, 287.5); addStat(Stat.BaseDef, 1100);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
    // Self Gravitation (Inherent Skill): +10% ER while the field is inside a Stellarealm —
    // assumed always true once the realm is up (no build ever runs without one going)
    if (stacksOfTeam(SK_REALM)) addStat(Stat.Er, 10);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const SHOREKEEPER_TALENTS = new Buff({
  name: "Shorekeeper: Talents",
  apply: () => {
    addStat(Stat.BonusHp, 12);
    addStat(Stat.HealingBonus, 12); // stat-tree Healing Bonus+ nodes — unused by the formula
  },
});

// INTRO resolves to plain Intro or Discernment on its own (see her own intro() above) — same
// marker works for both the opener and every loop after. The loop is shorter than the opener
// (one basic string, one forte heavy) — it generates just over the 100 concerto the outro
// spends, so she leaves the field where she found the bar.
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

// her real 43311 build: resonator + talents, weapon, mainslot echo, sonata pieces, mainstat/substat
export const SK_LOADOUT = [
  SHOREKEEPER, SHOREKEEPER_TALENTS,
  SK_SIG,
  FALLACY, REJUV_5PC, REJUV_2PC,
  mainstats("HP", "ER ER", "hp hp"), chem("hp", "liberation"),
];
