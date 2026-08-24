/**
 * Rover: Electro, ported to the new engine — a standard/permanent-banner 5-star
 * (`standardCharacter: true`), all six sequence nodes folded into the loadout unconditionally,
 * each owning its own trigger. Electric Surge (forte1, 0-100%) opens Overshock, which either
 * presses for the team ATK buff or holds into Apex Resonance; Thunder Rage (forte2) is what Apex
 * itself burns while Thrum of All Sounds is unlocked.
 *
 * MVs off nanoka.cc (character 1310, https://ww.nanoka.cc/character/1310), summed from each
 * skill's own Skill Attributes row; energy/concerto/offtune/forte off the migrated sheet's own
 * ERover rows (offtune x10000 into this engine's units), except Intro/Liberation Concerto, which
 * nanoka states outright. Electric Surge is the sheet's own 0-10000 gauge read back as a percent.
 * The build and the rotation are the sheet's own "erover sub" — they're the swap support here, not
 * the damage dealer, so nothing below enters Apex.
 */
import {
  Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, revokeTeam, isHeld, revoke, casting, currentAction, addStat, queue, queueOutro,
  inflictedNegativeStatus,
  forte1, setForte1,
  lostOnSwap,
} from "../../kit.js";
import { EMERALD_OF_GENESIS, OVERTURE } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../../echoes/jinzhou.js";
import { mainstatOptions } from "../../mainstats.js";
import { chem } from "../../substats.js";

/* ----------------------------------------------------------------------------------- actions */

function roverAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- basics (Deterrence) and Resonance Skill, all Electric Surge (forte1) generators
export const BA1 = roverAction("Basic - Deterrence 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 51.08, energy: 0.92, concerto: 3.31, offtune: 2936, forte1: 6.12 });
export const BA2 = roverAction("Basic - Deterrence 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 65.00, energy: 1.18, concerto: 4.22, offtune: 3737, forte1: 7.8 });
export const BA3 = roverAction("Basic - Deterrence 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 92.89, energy: 1.68, concerto: 6.02, offtune: 5341, forte1: 11.16 });
export const BA4 = roverAction("Basic - Deterrence 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 182.04, energy: 3.28, concerto: 11.78, offtune: 10465, forte1: 21.82 });

export const Skill = roverAction("Skill - Thunderclap", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 200.40, energy: 11.34, concerto: 9.8, offtune: 4268, forte1: 8.9 });
/** The Normal Attack follow-up off Thunderclap — considered Basic Attack DMG, and a Surge source
 *  in its own right. */
export const Repel = roverAction("Skill - Basic Attack: Repel", { node: Node.Skill, cast: Cast.Basic, type: Type1.Basic, mv: 140.29, energy: 2.53, concerto: 9.08, offtune: 8065, forte1: 16.8 });

// --- forte circuit: Overshock, at full Electric Surge. Press and hold are the same damage and the
//     same Surge spend, and differ only in what they open — the team ATK buff or Apex Resonance
//     (which the hold pays 60 Concerto for). `flare` is Decipher's own 10 stacks of Electro Flare.
export const Overshock = roverAction("Forte Skill - Overshock", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 1412.58, energy: 15.15, concerto: 18.33, offtune: 54645, forte1: -100, flare: 10 });
export const OvershockHold = roverAction("Forte Skill - Overshock (Hold)", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 1412.58, energy: 15.15, concerto: 18.33, offtune: 54645, forte1: -100, flare: 10 });

// --- Apex Resonance: Thrum of All Sounds, ground chain then the mid-air chain, each stage its own
//     element and each restoring Thunder Rage (forte2). Nothing in the sub rotation casts these —
//     they're here because S5/S6 pay out on them.
export const ThrumSpectro1 = roverAction("Forte Skill - Thrum: Spectro 1", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Spectro, mv: 99.12, energy: 0.9, concerto: 3.23, offtune: 7160, forte2: 3.94 });
export const ThrumSpectro2 = roverAction("Forte Skill - Thrum: Spectro 2", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Spectro, mv: 163.53, energy: 1.83, concerto: 6.57, offtune: 14580, forte2: 8.03 });
export const ThrumSpectro3 = roverAction("Forte Skill - Thrum: Spectro 3", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Spectro, mv: 255.14, energy: 2.17, concerto: 7.77, offtune: 17254, forte2: 9.5 });
export const ThrumHavoc1 = roverAction("Forte Skill - Thrum: Havoc 1", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Havoc, mv: 149.76, energy: 2, concerto: 7.18, offtune: 15920, forte2: 8.78 });
export const ThrumHavoc2 = roverAction("Forte Skill - Thrum: Havoc 2", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Havoc, mv: 138.30, energy: 2.19, concerto: 7.86, offtune: 17380, forte2: 9.58 });
export const ThrumHavoc3 = roverAction("Forte Skill - Thrum: Havoc 3", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Havoc, mv: 208.38, energy: 2.9, concerto: 10.4, offtune: 23046, forte2: 12.7 });
export const SilencingBlade = roverAction("Forte Skill - Thrum: Silencing Blade", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Aero, mv: 470.68, energy: 4.59, concerto: 16.48, offtune: 36568, forte2: 20.16 });
export const ThrumAero = roverAction("Forte Skill - Thrum: Aero", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Aero, mv: 158.09, energy: 1.28, concerto: 4.59, offtune: 10200, forte2: 5.61 });

export const ThrumMaHavoc1 = roverAction("Forte Skill - Thrum: Havoc Mid-air 1", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Havoc, mv: 50.63, energy: 0.59, concerto: 2.1, offtune: 4660, forte2: 2.56 });
export const ThrumMaHavoc2 = roverAction("Forte Skill - Thrum: Havoc Mid-air 2", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Havoc, mv: 63.82, energy: 0.67, concerto: 2.41, offtune: 5340, forte2: 2.94 });
export const ThrumMaHavoc3 = roverAction("Forte Skill - Thrum: Havoc Mid-air 3", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Havoc, mv: 277.30, energy: 2.06, concerto: 7.37, offtune: 16348, forte2: 9 });
export const ThrumMaAero1 = roverAction("Forte Skill - Thrum: Aero Mid-air 1", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Aero, mv: 84.61, energy: 0.81, concerto: 2.89, offtune: 6412, forte2: 3.53, heals: true });
export const ThrumMaAero2 = roverAction("Forte Skill - Thrum: Aero Mid-air 2", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Aero, mv: 97.41, energy: 0.89, concerto: 3.19, offtune: 7072, forte2: 3.89, heals: true });
export const ThrumMaAeroPlunge = roverAction("Forte Skill - Thrum: Aero Plunge", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Aero, mv: 282.48, energy: 2.08, concerto: 7.48, offtune: 16613, forte2: 9.14 });

/** Thunder Bane: one per Thrum hit, considered Resonance Skill DMG. Queued by the Thrum actions
 *  themselves (see the Resonator's own update() below), never cast directly. */
export const ThunderBane = roverAction("Forte Skill - Thunder Bane", { node: Node.Forte, type: Type1.Skill, mv: 39.77 });

const THRUMS: Action[] = [
  ThrumSpectro1, ThrumSpectro2, ThrumSpectro3,
  ThrumHavoc1, ThrumHavoc2, ThrumHavoc3,
  SilencingBlade, ThrumAero,
  ThrumMaHavoc1, ThrumMaHavoc2, ThrumMaHavoc3,
  ThrumMaAero1, ThrumMaAero2, ThrumMaAeroPlunge,
];

// --- liberation / intro / outro
export const Liberation = roverAction("Liberation - Ultimate Tactics", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1192.86, concerto: 20, offtune: 57600, resetEnergy: true });
export const Intro = roverAction("Intro - Thunderous Fury", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 167.03, energy: 3, concerto: 20.8, offtune: 9600, forte1: 53 });
export const Outro = roverAction("Outro - Rumbling Thunders", { cast: Cast.Outro, type: Type1.Outro, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** Apex Resonance: unlocks Thrum of All Sounds, entered by holding Overshock and ended by the
 *  Outro (which also clears Thunder Rage). No stat of its own — S5 is what pays on it. */
export const APEX_RESONANCE = new Buff({
  name: "Electro Rover: Apex Resonance",
  update: () => { if (casting(Cast.Outro)) revoke(APEX_RESONANCE); },
});

/** Overshock, pressed: +10% ATK to the whole team for 20s — lost on his own next Intro. */
export const OVERSHOCK_ATK = new Buff({
  name: "Electro Rover: Overshock ATK",
  apply: () => addStat(Stat.BonusAtk, 10),
  convert: () => { if (casting(Cast.Intro) && isHeld(ROVER_ELECTRO)) revokeTeam(OVERSHOCK_ATK); },
});

/** Decipher (Inherent Skill): Overshock's own 10 stacks of Electro Flare, declared on both
 *  Overshock actions above. Nothing reads Electro Flare yet, so this piece is held for the name. */
export const ER_INHERENT_1 = new Inherent({ name: "Electro Rover: Decipher" });

/** Regression (Inherent Skill): +20% Resonance Skill DMG Bonus for 20s off a held Overshock,
 *  ended by switching out. */
export const REGRESSION = new Buff({
  name: "Electro Rover: Regression",
  apply: () => addStat(Stat.DmgBonus, 20, Type1.Skill),
  update: () => { lostOnSwap(); },
});
export const ER_INHERENT_2 = new Inherent({
  name: "Electro Rover: Regression",
  update: () => { if (currentAction() === OvershockHold) applySelf(REGRESSION, 1); },
});

/** Electro Core: what the Outro actually hands the incoming resonator — no stat of its own, just
 *  the arming. Inflicting any Negative Status spends it for the real payout below; until then it
 *  simply sits there, and it's lost on swap like every other outro buff. */
export const ELECTRO_CORE = new Buff({
  name: "Electro Rover: Electro Core",
  update: () => {
    lostOnSwap();
    if (inflictedNegativeStatus()) { applySelf(ER_OUTRO, 1); revoke(ELECTRO_CORE); }
  },
});
/** The Outro proper: 25% All DMG Amplification, paid out only once Electro Core has been spent —
 *  so it starts on the action after the one that inflicted the Negative Status. */
export const ER_OUTRO = new Buff({
  name: "Electro Rover: Outro",
  apply: () => addStat(Stat.Amp, 25),
  update: () => { lostOnSwap(); },
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as their own always-equipped gear pieces (standardCharacter), each owning its
// own trigger rather than the central Resonator update() below.

// S1 Celestial Ingenuity: interruption resistance only — a genuine no-op, held for the name
export const ER_S1 = new Sequence({ name: "Electro Rover S1: Celestial Ingenuity" });

// S2 Thousandfold Artifice: 5 more Electro Flare off Liberation — nothing reads Electro Flare
// yet, so this is a no-op too (same as Buling's own S5)
export const ER_S2 = new Sequence({ name: "Electro Rover S2: Thousandfold Artifice" });

export const ER_S3 = new Sequence({
  name: "Electro Rover S3: Alchemy of Wonders",
  apply: () => {
    const a = currentAction();
    if (a === Overshock || a === OvershockHold) addStat(Stat.MulMv, 20);
  },
});

export const ER_S4 = new Sequence({
  name: "Electro Rover S4: Earthquaking Rumble",
  apply: () => { if (currentAction() === Liberation) addStat(Stat.MulMv, 20); },
});

export const ER_S5 = new Sequence({
  name: "Electro Rover S5: Principle of Change",
  apply: () => { if (isHeld(APEX_RESONANCE)) addStat(Stat.CritDmg, 20); },
});

export const ER_S6 = new Sequence({
  name: "Electro Rover S6: Mind's Depths in a Casket",
  apply: () => {
    const a = currentAction();
    if (a === ThunderBane || THRUMS.includes(a)) addStat(Stat.MulMv, 20);
  },
});

/** Them, as a Resonator: name/element/weapon, every grant/spend/queue rule their kit needs, and
 *  their own base stat line. `standardCharacter: true` — see the file header. */
export const ROVER_ELECTRO = new Resonator({
  name: "Electro Rover",
  abbreviation: "ERover",
  element: Attribute.Electro,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  color: "#b98ce8",
  maxEnergy: 125,
  standardCharacter: true,

  // Overshock clears the whole Surge gauge — pre-clamp an overshoot back to exactly 100 so the
  // declared forte1: -100 lands on 0, same pattern as Encore's own Cloudy Frenzy
  update: () => {
    const a = currentAction();
    if ((a === Overshock || a === OvershockHold) && forte1() >= 100) setForte1(100);
    if (a === Outro) queueOutro(ELECTRO_CORE);
    if (a === Overshock) applyTeam(OVERSHOCK_ATK, 1);
    if (a === OvershockHold) applySelf(APEX_RESONANCE, 1);
    if (THRUMS.includes(a)) queue(ThunderBane);
  },

  apply: () => {
    addStat(Stat.BaseHp, 10775); addStat(Stat.BaseAtk, 438); addStat(Stat.BaseDef, 1137);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from their kit
export const ROVER_ELECTRO_TALENTS = new Talent({
  name: "Electro Rover: Talents",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8); },
});

// the migrated sheet's own "erover sub" line: four basics plus Thunderclap into Repel fill Electric
// Surge, Overshock is pressed (the team ATK buff, not the Apex hold), then Liberation and the echo
// before handing the Outro off. They're never the team's own lead, so this covers opener and loop both.
export const ER_ROTATION = [
  INTRO, BA1, BA2, BA3, BA4, Skill, Repel, Overshock, Liberation, ECHO_CAST, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// their real build: resonator + talents + both Inherent Skills + every sequence node
// (standardCharacter — see file header), weapon, mainslot echo, sonata pieces, mainstat/substat
export const EROVER_LOADOUT = new Loadout(
  ROVER_ELECTRO,
  false,
  ROVER_ELECTRO_TALENTS,
  ER_INHERENT_1,
  ER_INHERENT_2,
  [EMERALD_OF_GENESIS],
  [new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC)],
  mainstatOptions(["CR", "CD"], ["atk", "electro"], ["atk"]),
  chem("atk", "skill"),
  ER_ROTATION, ER_ROTATION,
  ER_S1,
  ER_S2,
  ER_S3,
  ER_S4,
  ER_S5,
  ER_S6,
);
