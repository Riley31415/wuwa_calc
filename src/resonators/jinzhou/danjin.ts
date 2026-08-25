/**
 * Danjin, ported to the new engine — a havoc sword 4-star sub-DPS, standard/permanent-banner
 * character (`standardCharacter: true`), so her full S1-S6 resonance chain is folded into her
 * loadout unconditionally, each its own always-equipped gear piece (`DJ_S1`-`DJ_S6`).
 *
 * Ruby Blossom (forte1, 0-120): banked by Resonance Skill casts. At 60+, a held Basic Attack
 * becomes Heavy Attack: Chaoscleave (spends 60, or a stronger "Full Energy" version at 120
 * spending that instead), which chains into Scatterbloom. Resonance Skill itself has three forms
 * depending on the preceding action: Carmine Gleam (plain press), Crimson Erosion (after Basic
 * Attack 2, Dodge Counter, or Intro — applies Incinerating Will on its second hit), and Sanguine
 * Pulse (after Basic Attack 3) — all placed directly below, same "fixed valid line, no live
 * queue" treatment as Sigrika's Runes/Buling's Trigram.
 *
 * Crimson Light (Inherent Skill): granted fresh on Dodge Counter: Ruby Shades, survives into the
 * very next action only if that's Crimson Erosion 1 — +20% (unscoped) DMG Bonus there, and
 * doubles that same action's own Ruby Blossom gain. Overflow (+30% Heavy Attack DMG Bonus, 5s):
 * permanent-uptime-once-granted per the standing short-window rule, lost after her own outro
 * action gains stats, not a one-shot next-hit consumption. Crimson Fragment's own HP cost and
 * Chaoscleave's own healing have no stat/damage impact — not modelled.
 *
 * Numbers from nanoka.cc (character 1602) — MV/duration/sequence text confirmed there directly
 * (no wuwalab.com entry, no migrated-sheet row). Energy/Concerto/Offtune come off nanoka's own
 * "Damage Data" table — see the comment above the action definitions for the column mapping.
 * Resonance Cost (`maxEnergy` below) is her own real 100%, not the generic 125% default.
 */
import {
  Buff, Debuff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, applyEnemy, revoke, revokeTeam, revokeEnemy, isHeld, stacksOfEnemy, casting,
  currentAction, addStat, frozenStacks, queueOutro, lostOnSwap, forte1,
} from "../../kit.js";
import { EMERALD_OF_GENESIS, OVERTURE } from "../../weapons/standard.js";
import { BLAZING_BRILLIANCE, EMERALD_SENTENCE } from "../../weapons/sword.js";
import { NM_HERON, MIDNIGHT_VEIL_5PC, MIDNIGHT_VEIL_2PC } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../mainstats.js";
import { chem } from "../../substats.js";
import { CROWNLESS, HAVOC_ECLIPSE_2PC, HAVOC_ECLIPSE_5PC, HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC, REJUV_2PC, REJUV_5PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function danjinAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune all come off nanoka's own "Damage Data" table — Energy column ->
// energy, Elemental DMG column -> concerto, Weakness Break DMG column x10000 -> offtune, same
// convention Rover Havoc's own file established. A flat listed "Concerto Regen" adds on top of
// whatever the table's own Elemental DMG column already gives.
// --- basics, mid-air, dodge counter (Execution)
const BA1 = danjinAction("Basic - Execution 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 57.26, energy: 0.9, concerto: 1.08, offtune: 1680 });
const BA2 = danjinAction("Basic - Execution 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 58.85, energy: 0.92, concerto: 1.11, offtune: 2960 });
const BA3 = danjinAction("Basic - Execution 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.53, energy: 1.25, concerto: 1.5, offtune: 3120 });

const MA = danjinAction("Mid-air - Execution", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 98.61, energy: 0.51, concerto: 1, offtune: 9600 });
const HA = danjinAction("Heavy - Execution", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 111.36, energy: 1.74, concerto: 2.1, offtune: 5358 }); // 37.12% x3
/** A successful Dodge Counter opens the Skill's own Crimson Erosion form, and grants Crimson Light. */
const DC = danjinAction("Dodge Counter - Ruby Shades", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 190.86, energy: 3, concerto: 11.8, offtune: 4800 }); // 63.62% x3

// three forms depending on the preceding action (see file header)
const CarmineGleam = danjinAction("Skill - Carmine Gleam", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 76.36, forte1: 10.5, energy: 1.2, offtune: 2960, concerto: 8 }); // 38.18% x2
const CrimsonErosion1 = danjinAction("Skill - Crimson Erosion 1", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 128.84, forte1: 10.5, energy: 2.5, offtune: 4240, concerto: 8 }); // 64.42% x2
const CrimsonErosion2 = danjinAction("Skill - Crimson Erosion 2", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 119.30, forte1: 10.5, energy: 2.5, offtune: 4000, concerto: 8 }); // 59.65% x2

// NOTE 40.5 forte for sanguine pulse 123, not sure on individual
const SanguinePulse1 = danjinAction("Skill - Sanguine Pulse 1", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 112.14, forte1: 13.5, energy: 3, offtune: 3760, concerto: 8 }); // 56.07% x2
const SanguinePulse2 = danjinAction("Skill - Sanguine Pulse 2", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 128.85, forte1: 13.5, energy: 3, offtune: 4230, concerto: 8 }); // 42.95% x3
const SanguinePulse3 = danjinAction("Skill - Sanguine Pulse 3", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 193.26, forte1: 13.5, energy: 3.75, offtune: 6360, concerto: 8 }); // 64.42% x3

// Chaoscleave (Heavy Attack DMG, at 60+ Ruby Blossom) into Scatterbloom
const Chaoscleave = danjinAction("Heavy - Chaoscleave", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 417.55, forte1: -60, energy: 14, concerto: 50, offtune: 11578, heals: true }); // 59.65% x7
const Scatterbloom = danjinAction("Heavy - Scatterbloom", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 178.93, energy: 6, offtune: 5360 });
/** Full Energy variants, at 120 Ruby Blossom — spends 120 instead of 60. No separate Concerto
 *  Regen is given, so it carries Chaoscleave's own. */
const FullChaoscleave = danjinAction("Heavy - Chaoscleave (Full Energy)", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 1002.05, forte1: -120, energy: 14, concerto: 50, offtune: 11578, heals: true }); // 143.15% x7
const FullScatterbloom = danjinAction("Heavy - Scatterbloom (Full Energy)", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 429.43, energy: 6, offtune: 5360 });

// consecutive attacks plus one Scarlet Burst, lumped into one hit
const Liberation = danjinAction("Liberation - Crimson Bloom", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 785.37, concerto: 20, offtune: 61440, resetEnergy: true }); // 49.09%x8+392.65%

const Intro = danjinAction("Intro - Vindication", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.84, energy: 10, concerto: 10, offtune: 12240 }); // 49.71% x4
const Outro = danjinAction("Outro - Duality", { cast: Cast.Outro, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** A genuine debuff on the enemy — applied by Crimson Erosion's own second hit, +20% (unscoped)
 *  DMG Bonus to whoever's actually landing the hit. 12s, lost after her own outro action gains stats. */
const INCINERATING_WILL = new Debuff({
  name: "Danjin: Incinerating Will",
  applyStats: () => { if (isHeld(DANJIN)) addStat(Stat.DmgBonus, 20); },
  convertStats: () => { if (casting(Cast.Outro) && isHeld(DANJIN)) revokeEnemy(INCINERATING_WILL); },
});

/** Overflow (Inherent Skill): +30% Heavy Attack DMG Bonus, 5s, once granted after Sanguine Pulse —
 *  a real time window, lost after the outro action gains stats, not consumed by the next hit alone. */
const OVERFLOW = new Buff({
  name: "Danjin: Overflow",
  applyStats: () => addStat(Stat.DmgBonus, 30, Type1.Heavy),
  convertStats: () => { if (casting(Cast.Outro)) revoke(OVERFLOW); },
});
const DJ_INHERENT_OVERFLOW = new Inherent({
  name: "Danjin: Overflow",
  updateBuffs: () => { if (currentAction() === SanguinePulse3) applySelf(OVERFLOW, 1); },
});

/** Crimson Light (Inherent Skill): granted the instant Dodge Counter lands. Survives into
 *  whatever comes right after: if that's Crimson Erosion 1, it pays out (+20% unscoped DMG
 *  Bonus, doubles that action's own Ruby Blossom gain via AddForte1); on anything else it
 *  revokes itself in updateBuffs() before applyStats() runs that action. */
const CRIMSON_LIGHT = new Buff({
  name: "Danjin: Crimson Light",
  applyStats: () => {
    if (currentAction() === CrimsonErosion1) { addStat(Stat.DmgBonus, 20); addStat(Stat.AddForte1, CrimsonErosion1.forte1); }
  },
  updateBuffs: () => { if (currentAction() !== CrimsonErosion1) revoke(CRIMSON_LIGHT); },
});
const DJ_INHERENT_CRIMSON_LIGHT = new Inherent({
  name: "Danjin: Crimson Light",
  updateBuffs: () => { if (currentAction() === DC) applySelf(CRIMSON_LIGHT, 1); },
});

/** The window her outro hands the incoming resonator — "or until they are switched out" is
 *  lost-on-swap wording, checked via lostOnSwap() rather than the usual convertStats(). */
const DANJIN_OUTRO = new Buff({
  name: "Danjin: Outro",
  applyStats: () => addStat(Stat.Amp, 23, Attribute.Havoc),
  updateBuffs: () => { lostOnSwap(); },
});

const DANJIN = new Resonator({
  name: "Danjin",
  abbreviation: "Danjin",
  element: Attribute.Havoc,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  color: "#a83250",
  maxEnergy: 100,
  standardCharacter: true,

  updateBuffs: () => {
    const a = currentAction();
    if (a === CrimsonErosion2) applyEnemy(INCINERATING_WILL, 1);
    if (a === Outro) queueOutro(DANJIN_OUTRO);
  },

  applyStats: () => {
    addStat(Stat.BaseHp, 9438); addStat(Stat.BaseAtk, 263); addStat(Stat.BaseDef, 1149);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const DANJIN_TALENTS = new Talent({
  name: "Danjin: Talents",
  applyStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Attribute.Havoc); },
});

/* -------------------------------------------------------------------------------- sequences */
// all six live here as their own always-equipped gear pieces (standardCharacter — see file
// header); every trigger a sequence needs lives in its own piece, not the central updateBuffs() above

/** +5% ATK a stack, up to 6, 6s, on any hit landed while Incinerating Will is up. "Loses 1 stack
 *  each time she takes damage" isn't modelled — no damage-taken tracking here. */
const DJ_S1_STACKS = new Buff({
  name: "Danjin S1: Crimson Heart of Justice", maxStacks: 6,
  applyStats: () => addStat(Stat.BonusAtk, 5 * frozenStacks()),
  convertStats: () => { if (casting(Cast.Outro)) revoke(DJ_S1_STACKS); },
});
const DJ_S1 = new Sequence({
  name: "Danjin S1: Crimson Heart of Justice",
  updateBuffs: () => { if (stacksOfEnemy(INCINERATING_WILL)) applySelf(DJ_S1_STACKS, 1); },
});

/** S2: +20% (unscoped) DMG Bonus on any hit landed while Incinerating Will is up. */
const DJ_S2 = new Sequence({
  name: "Danjin S2: Dusted Mirror",
  applyStats: () => { if (stacksOfEnemy(INCINERATING_WILL)) addStat(Stat.DmgBonus, 20); },
});

/** S3: flat +30% Resonance Liberation DMG Bonus. */
const DJ_S3 = new Sequence({
  name: "Danjin S3: Fleeting Blossom",
  applyStats: () => addStat(Stat.DmgBonus, 30, Type1.Liberation),
});

/** S4: +15% Crit Rate above 60 Ruby Blossom, stated to persist through Chaoscleave/Scatterbloom
 *  even as Chaoscleave itself spends the gauge below 60 — granted whenever forte1 > 60, only
 *  revoked once it's below 60 AND the current action isn't Chaoscleave/Scatterbloom (either form). */
const DJ_S4_ACTIVE = new Buff({
  name: "Danjin S4: Solitary Carnation",
  applyStats: () => addStat(Stat.CritRate, 15),
});
const DJ_S4 = new Sequence({
  name: "Danjin S4: Solitary Carnation",
  updateBuffs: () => {
    const a = currentAction();
    if (forte1() > 60) applySelf(DJ_S4_ACTIVE, 1);
    else if (a !== Chaoscleave && a !== FullChaoscleave && a !== Scatterbloom && a !== FullScatterbloom) revoke(DJ_S4_ACTIVE);
  },
});

/** S5: +15% Havoc DMG Bonus flat, +15% more below 60% HP — no HP tracking, so the low-HP half is
 *  assumed always true. */
const DJ_S5 = new Sequence({
  name: "Danjin S5: Reigning Blade",
  applyStats: () => addStat(Stat.DmgBonus, 30, Attribute.Havoc),
});

/** S6: Chaoscleave grants the whole team +20% ATK, 20s — lost on her own next Intro. */
const DJ_S6_TEAM = new Buff({
  name: "Danjin S6: Bloodied Jade (team)",
  applyStats: () => addStat(Stat.BonusAtk, 20),
  convertStats: () => { if (casting(Cast.Intro) && isHeld(DANJIN)) revokeTeam(DJ_S6_TEAM); },
});
const DJ_S6 = new Sequence({
  name: "Danjin S6: Bloodied Jade",
  updateBuffs: () => { if (currentAction() === Chaoscleave || currentAction() === FullChaoscleave) applyTeam(DJ_S6_TEAM, 1); },
});

// a kit-valid line: Intro is a listed Crimson Erosion trigger, so the Skill press right after
// opens Incinerating Will; Liberation early banks Fleeting Blossom's own scoped bonus; Carmine
// Gleam into Execution 2/3 into Sanguine Pulse is the other listed Skill form; plain
// Chaoscleave/Scatterbloom close the forte circuit. Plain Chaoscleave (60), not Full Energy
// (120), on purpose: this line only banks 72 Ruby Blossom a pass, so Full Energy was never
// really reachable — forcing it would've compounded a shortfall loop over loop, permanently
// killing S4's threshold after the first pass. She's never the team's own lead, so this covers
// both opener and loop.
const DJ_ROTATION = [
  INTRO,
  CrimsonErosion1, CrimsonErosion2,
  Liberation,
  CarmineGleam, BA2, BA3,
  SanguinePulse1, SanguinePulse2, SanguinePulse3,
  Chaoscleave, Scatterbloom,
  ECHO_CAST, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real build: resonator + talents + both Inherent Skills + every sequence node
// (standardCharacter — see file header), weapon, mainslot echo, sonata pieces, mainstat/substat
export const DANJIN_LOADOUT = new Loadout({
  resonator: DANJIN,
  talent: DANJIN_TALENTS,
  inherent1: DJ_INHERENT_OVERFLOW,
  inherent2: DJ_INHERENT_CRIMSON_LIGHT,
  weapons: [EMERALD_OF_GENESIS, BLAZING_BRILLIANCE, EMERALD_SENTENCE],
  echoLoadouts: [new EchoLoadout(NM_HERON, MIDNIGHT_VEIL_5PC, MIDNIGHT_VEIL_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(FALLACY, REJUV_5PC, REJUV_2PC),
    new EchoLoadout(CROWNLESS, HAVOC_ECLIPSE_5PC, HAVOC_ECLIPSE_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: chem("atk", "heavy"),
  opener: DJ_ROTATION,
  loop: DJ_ROTATION,
  sequences: [DJ_S1, DJ_S2, DJ_S3, DJ_S4, DJ_S5, DJ_S6],
});
