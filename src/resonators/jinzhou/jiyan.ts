/**
 * Jiyan, ported to the new engine — sequence-0 core loop, a limited 5-star (not
 * `standardCharacter`). An aero broadblade main DPS. His Liberation (Emerald Storm - Prelude)
 * deals no damage itself but opens Qingloong Mode (10s), replacing his kit with the three-stage
 * Heavy Attack Lance of Qingloong; cast with 30+ Resolve it queues Emerald Storm - Finale itself
 * (considered Heavy Attack DMG), spending the 30 — never placed in a rotation by hand. Windqueller inside the mode gets +20% DMG for
 * free; outside it consumes 30 Resolve for the same +20% — modelled as two actions (Skill/USkill),
 * both carrying the bonus, the rotation only placing the consuming form when the gauge covers it.
 *
 * Numbers from nanoka.cc (character 1404) — MV/energy/concerto/offtune all resolved off the
 * site's own level-10 damage table; no migrated-sheet rows exist for him. Resolve (forte1, cap
 * 60) gain amounts per hit are published nowhere, so they're hand-derived plausible values
 * (Intro 15, ordinary Lone Lance hits 5-10); only the "30 banked before Prelude" gate matters to
 * the rotation, and it clears exactly. Its 15s-idle decay isn't tracked.
 *
 * His two Inherent Skills, off the page's own "INHERENT SKILLS" section:
 *  - Heavenly Balance: +10% ATK for 15s after his Intro.
 *  - Tempest Taming: +12% Crit DMG for 8s whenever his attacks hit — held for his whole field
 *    window, lost after his outro.
 * Discipline (Outro): the incoming resonator holds "Jiyan: Outro" x2, and each of their Heavy
 * casts consumes a charge to fire one 313.40% coordinated lance on Jiyan's own slot — same
 * "queued and owned by the kit that earned it" shape as Lupa's Set the Arena Ablaze; the 1s
 * trigger ICD isn't modelled.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling,
  applySelf, currentAction, casting, revoke, addStat, removeStack, forte1, queue, queueOn, queueOutro,
} from "../../kit.js";
import { VERDANT_SUMMIT } from "../../weapons/broadblade.js";
import { NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { NM_FEILIAN_BERINGAL, SIERRA_GALE_5PC, SIERRA_GALE_2PC } from "../../echoes/jinzhou.js";
import { mainstatOptions } from "../../mainstats.js";
import { chem } from "../../substats.js";

/* ----------------------------------------------------------------------------------- actions */

function jiyanAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- basics, heavies, mid-air, dodge counter (Lone Lance) — every hit feeds Resolve TODO get actual forte values
export const BA1 = jiyanAction("Basic - Lone Lance 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.16, energy: 0.92, concerto: 1.84, offtune: 2944 });
export const BA2 = jiyanAction("Basic - Lone Lance 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 43.73, energy: 0.55, concerto: 1.10, offtune: 1760 });
export const BA3 = jiyanAction("Basic - Lone Lance 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 36.38 * 5, energy: 2.25, concerto: 4.55, offtune: 7320 });
export const BA4 = jiyanAction("Basic - Lone Lance 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 66.20 * 2, energy: 1.66, concerto: 3.32, offtune: 5328 });
export const BA5 = jiyanAction("Basic - Lone Lance 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 23.60 * 7 + 153.45 * 2, energy: 5.87, concerto: 11.83, offtune: 19000 });

export const HA = jiyanAction("Heavy - Lone Lance", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 22.20 * 6, energy: 1.62, concerto: 3.30, offtune: 5364 });
/** Windborne Strike, holding Basic during the Heavy Attack. */
export const HA2 = jiyanAction("Heavy - Windborne Strike", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 105.96, energy: 1.33, concerto: 2.66, offtune: 4264 });
/** Abyssal Slash, releasing Basic during the Heavy Attack. */
export const HA3 = jiyanAction("Heavy - Abyssal Slash", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 81.71, energy: 1.02, concerto: 2.05, offtune: 3288 });

export const MA = jiyanAction("Basic - Lone Lance (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 123.26, energy: 0.51, concerto: 1.00, offtune: 4960 });
export const MA2 = jiyanAction("Basic - Lone Lance (Mid-Air Follow-Up)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 155.66, energy: 1.95, concerto: 3.91, offtune: 6264 });
/** Banner of Triumph, the mid-air attack after Windborne Strike or a mid-air Windqueller. */
export const MA3 = jiyanAction("Basic - Banner of Triumph", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.52, energy: 1.00, concerto: 2.00, offtune: 3200 });
export const DC = jiyanAction("Basic - Lone Lance (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 125.84 * 2, energy: 3.16, concerto: 13.32, offtune: 5328 });

// Windqueller's three forms — at 30+ Resolve out of Qingloong Mode it consumes 30 for +20% DMG,
// below 30 it's the plain cast with neither, inside the mode the +20% is free (the bonus lives on
// JIYAN's own apply below, on the two boosted forms only)
export const Skill = jiyanAction("Skill - Windqueller", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 106.36 * 4, energy: 9.00, concerto: 16, offtune: 6480, forte1: -30 });
export const Skill2 = jiyanAction("Skill - Windqueller (Low Resolve)", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 106.36 * 4, energy: 9.00, concerto: 16, offtune: 6480 });
export const USkill = jiyanAction("Skill - Windqueller (Qingloong)", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 106.36 * 4, energy: 9.00, concerto: 16, offtune: 6480 });

/** Emerald Storm - Prelude: no damage of its own, just opens Qingloong Mode. */
export const Liberation = jiyanAction("Liberation - Emerald Storm: Prelude", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, concerto: 20, resetEnergy: true });
/** Emerald Storm - Finale, released by Prelude at 30+ Resolve — considered Heavy Attack DMG. */
export const Finale = jiyanAction("Liberation - Emerald Storm: Finale", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 142.91 * 2 + 428.73, offtune: 107520, forte1: -30 });

// Lance of Qingloong, the mode's own three-stage Heavy Attack — 8 hits a stage
export const Lance1 = jiyanAction("Heavy - Lance of Qingloong 1", { node: Node.Liberation, cast: Cast.Heavy, type: Type1.Heavy, mv: 65.52 * 8, energy: 3.76, concerto: 7.60, offtune: 12272 });
export const Lance2 = jiyanAction("Heavy - Lance of Qingloong 2", { node: Node.Liberation, cast: Cast.Heavy, type: Type1.Heavy, mv: 61.55 * 8, energy: 3.60, concerto: 7.20, offtune: 11528 });
export const Lance3 = jiyanAction("Heavy - Lance of Qingloong 3", { node: Node.Liberation, cast: Cast.Heavy, type: Type1.Heavy, mv: 66.76 * 8, energy: 3.84, concerto: 7.76, offtune: 12504 });

export const Intro = jiyanAction("Intro - Tactical Strike", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.81, energy: 10.00, concerto: 10, offtune: 7416, forte1: 30 });
/** Discipline: no damage of its own, just the handoff — its lances are ACTION_OUTRO_COORD. */
export const Outro = jiyanAction("Outro - Discipline", { cast: Cast.Outro, active: false });
/** One coordinated lance strike — queued onto his own slot by JIYAN_OUTRO below, once per stack
 *  the incoming resonator's Heavy casts consume. */
export const ACTION_OUTRO_COORD = jiyanAction("Outro - Discipline (Coordinated Lance)", { type: Type1.Outro, type2: Type2.Coordinated, mv: 313.40, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** Heavenly Balance (Inherent Skill): +10% ATK for 15s after his Intro. */
export const HEAVENLY_BALANCE = new Buff({
  name: "Jiyan: Heavenly Balance",
  apply: () => addStat(Stat.BonusAtk, 10),
  convert: () => { if (casting(Cast.Outro)) revoke(HEAVENLY_BALANCE); },
});
export const JY_INHERENT_1 = new Inherent({
  name: "Jiyan: Heavenly Balance",
  update: () => { if (casting(Cast.Intro)) applySelf(HEAVENLY_BALANCE, 1); },
});

/** Tempest Taming (Inherent Skill): +12% Crit DMG for 8s on hit — held for his whole field
 *  window, lost after his outro. */
export const TEMPEST_TAMING = new Buff({
  name: "Jiyan: Tempest Taming",
  apply: () => addStat(Stat.CritDmg, 12),
  convert: () => { if (casting(Cast.Outro)) revoke(TEMPEST_TAMING); },
});
export const JY_INHERENT_2 = new Inherent({
  name: "Jiyan: Tempest Taming",
  update: () => { if (currentAction().active) applySelf(TEMPEST_TAMING, 1); },
});

/** Discipline — the outro handoff: 2 charges on the incoming resonator, each Heavy cast of theirs
 *  consuming one to fire a coordinated lance on Jiyan's own slot. Whatever's left is lost when
 *  they leave the field. */
export const JIYAN_OUTRO: Buff = new Buff({
  name: "Jiyan: Outro", maxStacks: 2,
  update: () => {
    if (casting(Cast.Heavy)) { queueOn(JIYAN, ACTION_OUTRO_COORD); removeStack(JIYAN_OUTRO, 1); }
  },
  convert: () => { if (casting(Cast.Outro)) revoke(JIYAN_OUTRO); },
});

export const JIYAN = new Resonator({
  name: "Jiyan",
  abbreviation: "Jiyan",
  element: Attribute.Aero,
  weapon: WeaponType.Broadblade,
  intro: () => Intro,
  color: "#4fc98f",
  maxEnergy: 125,

  // Prelude releases Finale itself whenever the 30 Resolve it spends is banked; the outro handoff
  // is queued twice so the adopter picks the buff up at both charges
  update: () => {
    const a = currentAction();
    if (a === Liberation && forte1() >= 30) queue(Finale);
    if (a === Outro) { queueOutro(JIYAN_OUTRO); queueOutro(JIYAN_OUTRO); }
  },

  apply: () => {
    addStat(Stat.BaseHp, 10487.5); addStat(Stat.BaseAtk, 437.5); addStat(Stat.BaseDef, 1185.55);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
    // Qingloong at War (Forte Circuit): Windqueller +20% DMG — free in-mode, or off the 30
    // Resolve the out-of-mode action's own forte1 already spends
    const a = currentAction();
    if (a === Skill || a === USkill) addStat(Stat.DmgBonus, 20);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
export const JIYAN_TALENTS = new Talent({
  name: "Jiyan: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// Intro banks the 30 Resolve Prelude's auto-queued Finale spends; the lances ride the mode with
// the free in-mode Windqueller, and the closing Windqueller is the low-Resolve form — the gauge
// is empty by then, so it neither spends nor boosts. He's never the team's own lead, so this
// covers both opener and loop.
export const JY_ROTATION = [
  INTRO, ECHO_CAST,
  Liberation,
  Lance1, USkill, Lance1, Lance1, Lance1, // dodge cancels
  Lance1, Lance1, Lance1, Lance1,
  Skill2,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const JIYAN_LOADOUT = new Loadout(
  JIYAN, true, JIYAN_TALENTS, JY_INHERENT_1, JY_INHERENT_2,
  [VERDANT_SUMMIT, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  [new EchoLoadout(NM_FEILIAN_BERINGAL, SIERRA_GALE_5PC, SIERRA_GALE_2PC)],
  mainstatOptions(["CR", "CD"], ["atk", "aero"], ["atk"]), chem("atk", "heavy"),
  JY_ROTATION, JY_ROTATION,
);
