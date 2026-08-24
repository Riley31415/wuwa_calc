/**
 * Galbrena, ported to the new engine — sequence-0 core loop, a limited 5-star (not
 * `standardCharacter`). A fusion pistols main DPS. Threshold State (default) banks Sinflame
 * (forte1) off her own hits; at 100, Resonance Skill - Encroach is replaced by Ascent of Malice,
 * which drops her into Demon Hypostasis — Basic/Heavy/Skill are all replaced by their own
 * "enhanced" forms (Seraphic Execution, Flamewing Verdict, Ravage), scaled up by Afterflame.
 *
 * One gap, carried over from this file's own old-engine reference: Hellstride (a Dodge-triggered
 * fixed 666-point hit, "not affected by any DMG Bonus effects") is a flat non-scaling number
 * outside this engine's ATK/HP/DEF-scaling formula entirely, so it isn't modelled — matching the
 * precedent of skipping every other DMG-bonus-immune fixed hit elsewhere (Carlotta's Shadow Step).
 *
 * Purging Flame (forte2) is a real gauge: Ascent of Malice converts 100 Sinflame into it, and each
 * enhanced-mode action's own declared forte2 cost spends it down. forte1 (Sinflame)/forte2
 * (Purging Flame) are both carried ×100 internally (matching the migrated sheet's own scale, e.g.
 * Augusta's Prowess/Ascendancy). Afterflame (0-40, +1.5%/point Demon Hypostasis DMG scaling, own
 * ceiling 60%) is a genuine live-tracked gauge on top of that, same "self-held Resonator reacting
 * to any teammate's own Echo cast" shape Sigrika's own Soliskin Vitality uses — GALBRENA's own
 * updateGlobal() below grants it, not a forte gauge. "Echoes with the same name can only trigger
 * this effect once" isn't tracked — same simplification tier Soliskin Vitality's own unlimited
 * re-trigger already carries.
 *
 * Oathbound Hunt (Inherent Skill): landing an attack grants 1 stack (up to 4) of a DMG Dealt
 * bonus, 5.5s — the "once every 5s per skill type" ICD isn't modelled.
 *
 * Numbers from nanoka.cc (character 1208) for every named hit's MV; energy/concerto/offtune/
 * Sinflame come off the migrated (old-engine) sheet. Mid-air Sustained Fire and the Dodge
 * Counter have no sheet row at all, so they're still bare (nanoka's own MV only).
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, casting, currentAction, addStat, stacks, revoke, isHeld, forte1, forte2, setForte1, setForte2,
} from "../kit.js";
import { LUX_UMBRA } from "../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../weapons/standard.js";
import { CLAWPRINT_2PC, CORROSAURUS, FLAMEWING_SHADOW_3PC } from "../echoes/septimont.js";
import { mainstatOptions } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function galbrenaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune/Sinflame all come off the migrated (old-engine) sheet — nanoka's own
// page never gave them. forte2 (Purging Flame) deltas on the enhanced-mode actions are the
// sheet's own per-hit costs — they sum to ~9756 of the 10000 Ascent of Malice converts in,
// confirming they're the real spend. Ravage has no forte2 row at all, so it's left bare (0 cost).
// --- Threshold State basics: Slayer's Trigger. Stages 1-3 Heavy Attack DMG, Stage 4 Echo Skill.
export const BA1 = galbrenaAction("Basic - Slayer's Trigger 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 59.18, energy: 0.83, concerto: 1.16, offtune: 2646, forte1: 741 });
export const BA2 = galbrenaAction("Basic - Slayer's Trigger 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 131.53, energy: 1.85, concerto: 2.59, offtune: 5880, forte1: 1852 });
export const BA3 = galbrenaAction("Basic - Slayer's Trigger 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 142.98, energy: 2.00, concerto: 2.80, offtune: 6394, forte1: 1852 });
export const BA4 = galbrenaAction("Basic - Slayer's Trigger 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Echo, mv: 177.86, energy: 2.49, concerto: 3.48, offtune: 7952, forte1: 1481 });

export const DC = galbrenaAction("Basic - Blood for Blood (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Heavy, mv: 205.24, offtune: 6394, concerto: 12.8, energy: 2 });
export const MA = galbrenaAction("Basic - Ashfall Barrage (Plunge)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 143.15, energy: 2.00, concerto: 2.80, offtune: 6400 });
export const MASustained = galbrenaAction("Basic - Ashfall Barrage (Sustained Fire)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 26.84, energy: 0.38, concerto: 0.53, offtune: 1200 });

// Threshold State heavy: Volley of Death, 3 held stages
export const HA1 = galbrenaAction("Heavy - Volley of Death 1", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 106.60, energy: 1.50, concerto: 2.10, offtune: 4766, forte1: 741 });
export const HA2 = galbrenaAction("Heavy - Volley of Death 2", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 69.18, energy: 0.98, concerto: 1.36, offtune: 3094, forte1: 2593 });
export const HA3 = galbrenaAction("Heavy - Volley of Death 3", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Echo, mv: 167.70, energy: 2.37, concerto: 3.29, offtune: 7499, forte1: 1852 });

// Threshold State resonance skill: Encroach (base), Ascent of Malice (100 Sinflame, opens Demon
// Hypostasis)
export const Encroach = galbrenaAction("Skill - Encroach", { node: Node.Skill, cast: Cast.Skill, type: Type1.Heavy, mv: 35.78, concerto: 2.22, energy: 6.59, offtune: 5039, forte1: 1852 });
/** Converts Sinflame into Purging Flame — declared as real deltas (forte1: -10000, forte2:
 *  +10000) so they show in the hover trace, but GALBRENA's own update() below first normalizes
 *  each gauge to what these deltas expect to land on 0/10000 from (forte gauges have no floor or
 *  ceiling, so a bare relative delta could land short). */
export const AscentOfMalice = galbrenaAction("Skill - Ascent of Malice", { node: Node.Skill, cast: Cast.Skill, type: Type1.Heavy, mv: 103.14, energy: 14.76, concerto: 10, offtune: 5588, forte1: -10000, forte2: 10000 });

// Demon Hypostasis: Seraphic Execution (Basic), Flamewing Verdict (Heavy), Ravage (Skill) —
// Mid-air/Dodge Counter enhanced forms aren't placed in the rotation below, kept for
// completeness. Burning Drive is Seraphic Execution's own Stage 4 specifically, not Threshold
// State's Slayer's Trigger Stage 4.
export const SeraphicExecution1 = galbrenaAction("Forte Basic - Seraphic Execution 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 58.99, energy: 1.00, concerto: 5.54, offtune: 2374, forte2: -488 });
export const SeraphicExecution2 = galbrenaAction("Forte Basic - Seraphic Execution 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 139.19, energy: 2.00, concerto: 6.95, offtune: 5600, forte2: -976 });
export const SeraphicExecution3 = galbrenaAction("Forte Basic - Seraphic Execution 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Heavy, mv: 243.17, energy: 3.34, concerto: 8.79, offtune: 9786, forte2: -1829 });
export const SeraphicExecution4 = galbrenaAction("Forte Basic - Seraphic Execution 4", { node: Node.Forte, cast: Cast.Basic, type: Type1.Echo, mv: 181.47, energy: 2.56, concerto: 7.70, offtune: 7305, forte2: -1341 });
export const SeraphicExecution5 = galbrenaAction("Forte Basic - Seraphic Execution 5", { node: Node.Forte, cast: Cast.Basic, type: Type1.Echo, mv: 224.27, energy: 3.08, concerto: 8.46, offtune: 9025, forte2: -1951 });

export const FlamewingVerdict1 = galbrenaAction("Forte Heavy - Flamewing Verdict 1", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 118.44, energy: 1.74, concerto: 6.60, offtune: 4766, forte2: -976 });
export const FlamewingVerdict2 = galbrenaAction("Forte Heavy - Flamewing Verdict 2", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 76.70, energy: 1.22, concerto: 5.86, offtune: 3086, forte2: -732 });
export const FlamewingVerdict3 = galbrenaAction("Forte Heavy - Flamewing Verdict 3", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Echo, mv: 176.84, energy: 2.49, concerto: 7.64, offtune: 7117, forte2: -1463 });

export const Ravage = galbrenaAction("Forte Skill - Ravage", { node: Node.Forte, cast: Cast.Skill, type: Type1.Heavy, mv: 35.78, energy: 6.59, concerto: 2.22, offtune: 5039 });

export const Liberation = galbrenaAction("Liberation - Hellfire Absolution", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Echo, mv: 1109.04, concerto: 20, offtune: 84003, resetEnergy: true });

export const Intro = galbrenaAction("Intro - Hellflare Overload", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 94.12, energy: 10, concerto: 10, offtune: 4208, forte1: 1111 });
/** Unlike most outros, this one deals real damage (795% MV) on top of the handoff concerto
 *  reset; `active: false` still marks it "not really her own attack" for lostOnSwap purposes. */
export const Outro = galbrenaAction("Outro - Ashen Pursuit", { cast: Cast.Outro, type: Type1.Outro, mv: 795, offtune: 30326, concerto: 22.32, energy: 10.03, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** +20% ATK, 4s — granted on Intro, Encroach, Ascent of Malice, Seraphic Execution Stage 4, and
 *  Ravage (Hellstride isn't implemented, see file header, so it's dropped from this list too). */
export const BURNING_DRIVE = new Buff({
  name: "Galbrena: Burning Drive",
  apply: () => addStat(Stat.BonusAtk, 20),
  convert: () => { if (casting(Cast.Outro)) revoke(BURNING_DRIVE); },
});

/** +5% DMG Dealt a stack, up to 4, 5.5s — granted on any of her own landed attacks. */
export const OATHBOUND_HUNT = new Buff({
  name: "Galbrena: Fated End", maxStacks: 4,
  apply: () => addStat(Stat.Amp, 5 * stacks()),
  convert: () => { if (casting(Cast.Outro)) revoke(OATHBOUND_HUNT); },
});
export const GB_INHERENT_1 = new Inherent({
  name: "Galbrena: Oathbound Hunt",
  update: () => { if (!casting(Cast.Echo)) applySelf(OATHBOUND_HUNT, 1); },
});
/** No combat-formula effect this engine models, same "still equipped, no stat" treatment
 *  Augusta's own Ruler's Realm shield gets. */
export const GB_INHERENT_2 = new Inherent({ name: "Galbrena: Sin Feaster" });

/** A marker for "has she opened it yet" — set by Ascent of Malice. Ends itself once Purging
 *  Flame runs out, taking Afterflame down with it. */
export const DEMON_HYPOSTASIS = new Buff({
  name: "Galbrena: Demon Hypostasis",
  update: () => { if (forte2() <= 0) { revoke(AFTERFLAME); revoke(DEMON_HYPOSTASIS); } },
});

/** 0-40, +8 on any team member's own Echo Skill cast while she's still in Threshold State (not
 *  yet holding DEMON_HYPOSTASIS this turn). Scales the nine enhanced-mode actions at +1.5%/point,
 *  capped at 60%, gated per-action inside apply() itself. */
export const AFTERFLAME = new Buff({
  name: "Galbrena: Afterflame", maxStacks: 40,
  apply: () => {
    const a = currentAction();
    if (a === SeraphicExecution1 || a === SeraphicExecution2 || a === SeraphicExecution3
      || a === SeraphicExecution4 || a === SeraphicExecution5
      || a === FlamewingVerdict1 || a === FlamewingVerdict2 || a === FlamewingVerdict3
      || a === Ravage) addStat(Stat.TotalDmg, Math.min(60, 1.5 * stacks()));
  },
});

/** +85% DMG Multiplier on eight of those same nine actions (Ravage excepted — scoped to
 *  Basic/Heavy Attack DMG, not Resonance Skill), 14s. */
export const HELLFIRE_WINDOW = new Buff({
  name: "Galbrena: Hellfire Absolution",
  apply: () => {
    const a = currentAction();
    if (a === SeraphicExecution1 || a === SeraphicExecution2 || a === SeraphicExecution3
      || a === SeraphicExecution4 || a === SeraphicExecution5
      || a === FlamewingVerdict1 || a === FlamewingVerdict2 || a === FlamewingVerdict3) addStat(Stat.MulMv, 85);
  },
  convert: () => { if (casting(Cast.Outro)) revoke(HELLFIRE_WINDOW); },
});

export const GALBRENA = new Resonator({
  name: "Galbrena",
  abbreviation: "Glob",
  element: Attribute.Fusion,
  weapon: WeaponType.Pistols,
  intro: () => Intro,
  color: "#1e3a8a",
  maxEnergy: 125,

  // reacts to *any* team member's own Echo cast, not just her own — see AFTERFLAME's own comment
  updateGlobal: () => {
    if (casting(Cast.Echo) && !isHeld(DEMON_HYPOSTASIS)) applySelf(AFTERFLAME, 8);
  },
  update: () => {
    const a = currentAction();
    if (a === Intro || a === Encroach || a === AscentOfMalice || a === SeraphicExecution4 || a === Ravage) applySelf(BURNING_DRIVE, 1);
    if (a === Liberation) applySelf(HELLFIRE_WINDOW, 1);
    if (a === AscentOfMalice) {
      applySelf(DEMON_HYPOSTASIS, 1);
      // pre-clamp an overshoot back to exactly 10000 so the declared forte1: -10000 field below
      // lands exactly on 0; under 10000, leave it alone so it drives negative naturally instead
      if (forte1() >= 10000) setForte1(10000);
      setForte2(0);
    }
    if (a === Ravage) setForte2(0);
  },

  apply: () => {
    addStat(Stat.BaseHp, 10300); addStat(Stat.BaseAtk, 463); addStat(Stat.BaseDef, 1112);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const GALBRENA_TALENTS = new Talent({
  name: "Galbrena: Talents",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritDmg, 16); },
});

// a kit-valid line: Intro, Encroach opens Burning Drive and banks Sinflame, Ascent of Malice
// spends it all and opens Demon Hypostasis, Seraphic Execution and Flamewing Verdict follow
// while it's up, Liberation opens its own +85% window over the tail of it, Outro closes the loop
// out (and still hits). She's never the team's own lead, so this covers both opener and loop.
export const GB_ROTATION = [
  INTRO, ECHO_CAST, HA2, HA3, BA3, BA4, Encroach,
  AscentOfMalice, Liberation,
  SeraphicExecution2, SeraphicExecution3, SeraphicExecution4, SeraphicExecution5,
  SeraphicExecution3, SeraphicExecution4, SeraphicExecution5,
  Outro
];

// same shape as GB_ROTATION, echo-focused variant (comment markers are dodge-cancel timing notes
// from the original build, not placed actions)
export const GB_ROTATION_ECHO_FOCUS = [
  INTRO, ECHO_CAST, BA2, BA3, BA4, BA2, BA3,
  AscentOfMalice, Liberation,
  // dodge cancel 2  (half)
  // dodge cancel 3
  SeraphicExecution3,
  SeraphicExecution4, SeraphicExecution5,
  // dodge cancel 3
  SeraphicExecution4, SeraphicExecution5,
  // dodge cancel 3 (half)
  SeraphicExecution4, SeraphicExecution5,
  Outro
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, mainslot echo,
// sonata pieces, mainstat/substat
const GB_WEAPONS = [LUX_UMBRA, NEW_STD_PISTOL, STATIC_MIST];
const GB_ECHOES = [new EchoLoadout(CORROSAURUS, FLAMEWING_SHADOW_3PC, CLAWPRINT_2PC)];
export const GLOB_LOADOUT = new Loadout(
  GALBRENA,
  true,
  GALBRENA_TALENTS,
  GB_INHERENT_1,
  GB_INHERENT_2,
  GB_WEAPONS,
  GB_ECHOES,
  mainstatOptions(["CR", "CD"], ["atk", "fusion"], ["atk"]),
  chem("atk", "heavy"),
  GB_ROTATION, GB_ROTATION,
);

// same gear, the echo-focused rotation variant — genuinely different actions cast (the one that
// actually triggers a teammate's own Echo Skill DMG buffs), not a weapon/echo-gear choice, so it
// stays its own Loadout rather than folding into GLOB_LOADOUT's own opener/loop
export const GLOB_LOADOUT_ECHO_FOCUS = new Loadout(
  GALBRENA,
  true,
  GALBRENA_TALENTS,
  GB_INHERENT_1,
  GB_INHERENT_2,
  GB_WEAPONS,
  GB_ECHOES,
  mainstatOptions(["CR", "CD"], ["atk", "fusion"], ["atk"]),
  chem("atk", "heavy"),
  GB_ROTATION_ECHO_FOCUS, GB_ROTATION_ECHO_FOCUS,
);
