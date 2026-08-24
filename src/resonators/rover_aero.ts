/**
 * Rover: Aero, ported to the new engine — a standard/permanent-banner 5-star
 * (`standardCharacter: true`), all six sequence nodes folded into the loadout unconditionally,
 * each owning its own trigger. Windstrings (forte1, 0-120) are spent 60 at a time by Unbound Flow,
 * the enhanced Resonance Skill that replaces Awakening Gale at max gauge.
 *
 * MVs off nanoka.cc (character 1406, https://ww.nanoka.cc/character/1406), summed from each
 * skill's own Skill Attributes row; energy/concerto/offtune off the migrated sheet's own ARover
 * rows (offtune x10000 into this engine's units). Rotation is the sheet's own "arover 123".
 * Healing is out of scope for this calculator throughout, so the healer half of the kit — the
 * Cloudburst Dance/Omega Storm heals, Boundless Winds, S2 — only ever shows up as `heals: true`.
 */
import {
  Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, isHeld, revoke, casting, currentAction, addStat,
} from "../kit.js";
import { BLOODPACTS_PLEDGE, BLOODPACT_AERO_AMP } from "../weapons/standard.js";
import { FALLACY, REJUV_5PC, REJUV_2PC, HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC, BELL_BORNE_SHIELD, BELL_BORNE_GEOCHELONE } from "../echoes/jinzhou.js";
import { mainstatOptions } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function roverAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- basics, heavies, mid-air, dodge counter. Basic 3/4 and Dodge Counter are the small
//     Windstring (forte1) sources; the mid-air rows are the plain plunge, not Cloudburst Dance.
export const BA1 = roverAction("Basic - Wind Cutter 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 35.31, energy: 0.76, concerto: 2.41, offtune: 2408 });
export const BA2 = roverAction("Basic - Wind Cutter 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.10, energy: 1.84, concerto: 5.88, offtune: 5872 });
export const BA3 = roverAction("Basic - Wind Cutter 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.80, energy: 2.24, concerto: 7.15, offtune: 7144, forte1: 10 });
export const BA4 = roverAction("Basic - Wind Cutter 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 76.72, energy: 1.64, concerto: 5.24, offtune: 5232, forte1: 10 });
export const HA = roverAction("Heavy - Wind Cutter", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 53.73, energy: 1.17, concerto: 3.69, offtune: 3666 });
export const RazorWind = roverAction("Heavy - Razor Wind", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 80.83, energy: 1.73, concerto: 5.53, offtune: 5513 });
export const MA = roverAction("Basic - Mid-air Attack", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 140.76, energy: 0.52, concerto: 9.6, offtune: 9600 });
export const DC = roverAction("Basic - Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 175.18, energy: 3.74, concerto: 21.95, offtune: 11944, forte1: 10 });

// --- resonance skill: Awakening Gale on the ground, Skyfall Severance from mid-air (which trades
//     every other element's own Negative Status on the target for a stack of Aero Erosion each —
//     no target-side status tracking here, so that trade is a comment rather than a number).
export const Skill = roverAction("Skill - Awakening Gale", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 166.10, energy: 5, concerto: 10, offtune: 7553 });
export const SkyfallSeverance = roverAction("Skill - Skyfall Severance", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 175.26, energy: 2.52, concerto: 5, offtune: 8001 });

// --- forte circuit: Cloudburst Dance (a Mid-air Attack considered Resonance Skill DMG, and the
//     main Windstring source), then Unbound Flow, which replaces Awakening Gale at max gauge and
//     spends 60 Windstrings a stage.
export const Cloudburst1 = roverAction("Forte - Cloudburst Dance 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 128.80, energy: 0.92, concerto: 2.93, offtune: 2928, forte1: 25, heals: true });
export const Cloudburst2 = roverAction("Forte - Cloudburst Dance 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 141.47, energy: 1.01, concerto: 3.22, offtune: 3216, forte1: 25, heals: true });
export const UnboundFlow1 = roverAction("Forte Skill - Unbound Flow 1", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 171.50, energy: 10, concerto: 20, offtune: 29850, forte1: -60, heals: true });
export const UnboundFlow2 = roverAction("Forte Skill - Unbound Flow 2", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 723.03, energy: 20, concerto: 20, offtune: 28288, forte1: -60, heals: true });

// --- liberation / intro / outro. Storm's Echo hands the whole team Aeolian Realm (see below).
export const Liberation = roverAction("Liberation - Omega Storm", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 536.79, concerto: 20, offtune: 48000, resetEnergy: true, heals: true });
export const Intro = roverAction("Intro - Relentless Squall", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.82, energy: 10, concerto: 10, offtune: 11465, forte1: 20 });
export const Outro = roverAction("Outro - Storm's Echo", { cast: Cast.Outro, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** Sand in the Storm (Inherent Skill): +20% ATK for 10s off the Intro. */
export const SAND_IN_THE_STORM = new Buff({
  name: "Aero Rover: Sand in the Storm",
  apply: () => addStat(Stat.BonusAtk, 20),
  convert: () => { if (casting(Cast.Outro)) revoke(SAND_IN_THE_STORM); },
});
export const AR_INHERENT_1 = new Inherent({
  name: "Aero Rover: Sand in the Storm",
  update: () => { if (currentAction() === Intro) applySelf(SAND_IN_THE_STORM, 1); },
});
/** Boundless Winds (Inherent Skill): +20% healing off Omega Storm — healing is out of scope, so
 *  this piece is held for the name. */
export const AR_INHERENT_2 = new Inherent({ 
  name: "Aero Rover: Boundless Winds" // 20% healing mv
});

/** Aeolian Realm (Outro): the whole team holds it, 30s, so permanent uptime. All it does is raise
 *  how many Aero Erosion stacks a target hit can hold — no target-side status caps here, so it
 *  carries no stat of its own for now and is held as the marker it is. */
export const AEOLIAN_REALM = new Buff({ name: "Aero Rover: Aeolian Realm" });

/** S4 Boundaries Shatter in an Instant: +15% Resonance Skill DMG Bonus for 5s off Cloudburst
 *  Dance. Trigger lives in AR_S4. */
export const S4_SKILL_BONUS = new Buff({
  name: "Aero Rover S4: Boundaries Shatter in an Instant",
  apply: () => addStat(Stat.DmgBonus, 15, Type1.Skill),
  convert: () => { if (casting(Cast.Outro)) revoke(S4_SKILL_BONUS); },
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as their own always-equipped gear pieces (standardCharacter), each owning its
// own trigger rather than the central Resonator update() below.

// S1 Storm Subsides in the Void: interruption resistance only — a genuine no-op, held for the name
export const AR_S1 = new Sequence({ name: "Aero Rover S1: Storm Subsides in the Void" });

// S2 Glimmers Fade into the Dark: a heal over time — out of scope, a no-op held for the name
export const AR_S2 = new Sequence({ name: "Aero Rover S2: Glimmers Fade into the Dark" });

export const AR_S3 = new Sequence({
  name: "Aero Rover S3: Illusions Collapse in a Grip",
  apply: () => addStat(Stat.DmgBonus, 15, Attribute.Aero),
});

export const AR_S4 = new Sequence({
  name: "Aero Rover S4: Boundaries Shatter in an Instant",
  update: () => {
    const a = currentAction();
    if (a === Cloudburst1 || a === Cloudburst2) applySelf(S4_SKILL_BONUS, 1);
  },
});

export const AR_S5 = new Sequence({
  name: "Aero Rover S5: Life and Death Intertwine",
  apply: () => { if (currentAction() === Liberation) addStat(Stat.MulMv, 20); },
});

export const AR_S6 = new Sequence({
  name: "Aero Rover S6: All Crumble in the Wind",
  apply: () => {
    const a = currentAction();
    if (a === UnboundFlow1 || a === UnboundFlow2) addStat(Stat.MulMv, 30);
  },
});

/** Him, as a Resonator: name/element/weapon, every grant/spend/queue rule his kit needs, and his
 *  own base stat line. `standardCharacter: true` — see the file header. */
export const ROVER_AERO = new Resonator({
  name: "Aero Rover",
  abbreviation: "ARover",
  element: Attribute.Aero,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  color: "#6fd6b0",
  maxEnergy: 150,
  standardCharacter: true,

  // Bloodpact's Pledge names Unbound Flow outright, so that clause's team Aero Amplification is
  // triggered from here rather than from the weapon — see the weapon's own comment for why
  update: () => {
    const a = currentAction();
    if (a === Outro) applyTeam(AEOLIAN_REALM, 1);
    if ((a === UnboundFlow1 || a === UnboundFlow2) && isHeld(BLOODPACTS_PLEDGE)) applyTeam(BLOODPACT_AERO_AMP, 1);
  },

  apply: () => {
    addStat(Stat.BaseHp, 10775); addStat(Stat.BaseAtk, 438); addStat(Stat.BaseDef, 1137);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
export const ROVER_AERO_TALENTS = new Talent({
  name: "Aero Rover: Talents",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.HealingBonus, 12); },
});

// the migrated sheet's own "arover 123": two Awakening Gale into Cloudburst Dance cycles bank the
// 120 Windstrings both Unbound Flow stages spend, with Liberation and the echo in between. He's
// never the team's own lead, so this covers opener and loop both.
export const AR_ROTATION = [ // TODO needs an opener
  INTRO,
  Skill, Cloudburst1, Cloudburst2,
  Liberation,
  Skill, Cloudburst1, Cloudburst2,
  ECHO_CAST,
  UnboundFlow1, UnboundFlow2,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// his real build: resonator + talents + both Inherent Skills + every sequence node
// (standardCharacter — see file header), weapon, mainslot echo, sonata pieces, mainstat/substat.
// Bloodpact's Pledge is the only weapon listed: its own Unbound Flow clause is written for him.
export const AROVER_LOADOUT = new Loadout(
  ROVER_AERO,
  false,
  ROVER_AERO_TALENTS,
  AR_INHERENT_1,
  AR_INHERENT_2,
  [BLOODPACTS_PLEDGE],
  [
    new EchoLoadout(FALLACY, REJUV_5PC, REJUV_2PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, REJUV_5PC, REJUV_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
  ],
  mainstatOptions(["CR", "CD"], ["atk", "aero"], ["atk"]),
  chem("atk", "skill"),
  AR_ROTATION, AR_ROTATION,
  AR_S1,
  AR_S2,
  AR_S3,
  AR_S4,
  AR_S5,
  AR_S6,
);
