/**
 * Rover: Electro, ported to the new engine — a standard/permanent-banner 5-star
 * (`Tier.Free`), all six sequence nodes folded into the loadout unconditionally,
 * each owning its own trigger. Electric Surge (forte1, 0-120%) opens Overshock, which either
 * presses for the team ATK buff or holds into Apex Resonance; Thunder Rage (forte2) is what Apex
 * itself burns while Thrum of All Sounds is unlocked.
 *
 * MVs off nanoka.cc (character 1310, https://ww.nanoka.cc/character/1310), summed from each
 * skill's own Skill Attributes row; energy/concerto/offtune/forte off the migrated sheet's own
 * ERover rows (offtune x10000 into this engine's units), except Intro/Liberation Concerto, which
 * nanoka states outright. Electric Surge is the sheet's own 0-10000 gauge read back as a percent.
 * Two loadouts. ROVER_ELECTRO is the sheet's own "erover sub" — the swap support, pressing
 * Overshock for the team ATK and never entering Apex. ROVER_ELECTRO_MDPS holds Overshock instead
 * (60 Concerto, Thunder Rage filled, Apex Resonance) and plays Thrum of All Sounds through once as
 * the kit lays it out: the seven ground stages, the held Aero leap, the six mid-air stages and the
 * Silencing Blade a press on landing chains into — a Thunder Bane behind every one — before the
 * Outro ends Apex and clears the Rage. Thunder Rage's 10%/s drain is time, which this engine has
 * none of, so the bar only fills, gains and clears here.
 */
import { Tier, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  revokeTeam,
  isHeld,
  revokeCurrent,
  casting,
  currentAction,
  addStat,
  queue,
  queueOutro,
  forte1,
  forte2,
  setForte1,
  setForte2,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_SWAP, OUTRO } from "../../engine/rotation.js";
import { lostOnSwap } from "../../shared/helpers.js";
import { inflictElectroFlare, inflictedNegativeStatus, HEALS } from "../../shared/status.js";
import { EMERALD_OF_GENESIS, OVERTURE } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { SOUL_OF_DESPAIR, SWORN_VIGIL_5PC, ELECTRIC_REFLECTION_5PC, STAY_TUNED } from "../../echoes/mengzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { BLAZING_BRILLIANCE, RED_SPRING, UNSPOKEN_RUE } from "../../weapons/sword.js";

/* ----------------------------------------------------------------------------------- actions */

function roverAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- basics (Deterrence) and Resonance Skill, all Electric Surge (forte1) generators
const BA1 = roverAction("Basic - Deterrence 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 51.08, energy: 0.92, concerto: 3.31, offtune: 2936, forte1: 6.12 });
const BA2 = roverAction("Basic - Deterrence 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 65.00, energy: 1.18, concerto: 4.22, offtune: 3737, forte1: 7.8 });
const BA3 = roverAction("Basic - Deterrence 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 92.89, energy: 1.68, concerto: 6.02, offtune: 5341, forte1: 11.16 });
const BA4 = roverAction("Basic - Deterrence 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 182.04, energy: 3.28, concerto: 11.78, offtune: 10465, forte1: 21.82 });

const Skill = roverAction("Skill - Thunderclap", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 200.40, energy: 11.34, concerto: 9.8, offtune: 4268, forte1: 8.9 });
/** The Normal Attack follow-up off Thunderclap — considered Basic Attack DMG, and a Surge source
 *  in its own right. */
const Repel = roverAction("Basic - Repel", { node: Node.Skill, cast: Cast.Basic, type: Type1.Basic, mv: 140.29, energy: 2.53, concerto: 9.08, offtune: 8065, forte1: 16.8 });

// --- forte circuit: Overshock, at full Electric Surge. Press and hold are the same damage and the
//     same Surge spend, and differ only in what they open — the team ATK buff or Apex Resonance
//     (which the hold pays 60 Concerto for).
// Both Overshocks inflict Decipher's 10 Electro Flare and clear the whole Surge gauge — pre-clamp
// an overshoot back to exactly 120 so the declared forte1: -120 lands on 0, same pattern as
// Encore's own Cloudy Frenzy.
const OVERSHOCK = {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 1412.58, energy: 15.15, concerto: 18.33, offtune: 54645, forte1: -120,
  updateDebuffs: () => inflictElectroFlare(10),
};
const Overshock = roverAction("Forte Skill - Overshock", {
  ...OVERSHOCK,
  updateBuffs: () => applyTeam(OVERSHOCK_ATK, 1),
});
// The hold pays 60 Concerto on top of the hit's own gain, and entering Apex restores Thunder Rage
// to its 100 — a reset ahead of the declared +100, so it lands exactly full however much a
// previous Apex left (the Outro clears it, so ordinarily none).
const OvershockHold = roverAction("Forte Skill - Overshock (Hold)", {
  ...OVERSHOCK, concerto: 18.33 - 60, forte2: 100, resetForte2: true,
  updateBuffs: () => applyCurrent(APEX_RESONANCE, 1),
});

// --- Apex Resonance: Thrum of All Sounds, ground chain then the mid-air chain, each stage its own
//     element and each restoring Thunder Rage (forte2). Nothing in the sub rotation casts these —
//     they're here because S5/S6 pay out on them.
const ThrumSpectro1 = roverAction("Skill - Thrum: Spectro 1", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Spectro, mv: 99.12, energy: 0.9, concerto: 3.23, offtune: 7160, forte2: 3.94 });
const ThrumSpectro2 = roverAction("Skill - Thrum: Spectro 2", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Spectro, mv: 163.53, energy: 1.83, concerto: 6.57, offtune: 14580, forte2: 8.03 });
const ThrumSpectro3 = roverAction("Skill - Thrum: Spectro 3", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Spectro, mv: 255.14, energy: 2.17, concerto: 7.77, offtune: 17254, forte2: 9.5 });
const ThrumHavoc1 = roverAction("Skill - Thrum: Havoc 1", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Havoc, mv: 149.76, energy: 2, concerto: 7.18, offtune: 15920, forte2: 8.78 });
const ThrumHavoc2 = roverAction("Skill - Thrum: Havoc 2", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Havoc, mv: 138.30, energy: 2.19, concerto: 7.86, offtune: 17380, forte2: 9.58 });
const ThrumHavoc3 = roverAction("Skill - Thrum: Havoc 3", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Havoc, mv: 208.38, energy: 2.9, concerto: 10.4, offtune: 23046, forte2: 12.7 });
const SilencingBlade = roverAction("Skill - Thrum: Silencing Blade", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Aero, mv: 470.68, energy: 4.59, concerto: 16.48, offtune: 36568, forte2: 20.16 });
const ThrumAero = roverAction("Skill - Thrum: Aero", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Aero, mv: 158.09, energy: 1.28, concerto: 4.59, offtune: 10200, forte2: 5.61 });

const ThrumMaHavoc1 = roverAction("Skill - Thrum: Havoc Mid-air 1", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Havoc, mv: 50.63, energy: 0.59, concerto: 2.1, offtune: 4660, forte2: 2.56 });
const ThrumMaHavoc2 = roverAction("Skill - Thrum: Havoc Mid-air 2", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Havoc, mv: 63.82, energy: 0.67, concerto: 2.41, offtune: 5340, forte2: 2.94 });
const ThrumMaHavoc3 = roverAction("Skill - Thrum: Havoc Mid-air 3", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Havoc, mv: 277.30, energy: 2.06, concerto: 7.37, offtune: 16348, forte2: 9 });
const ThrumMaAero1 = roverAction("Skill - Thrum: Aero Mid-air 1", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Aero, mv: 84.61, energy: 0.81, concerto: 2.89, offtune: 6412, forte2: 3.53 });
const ThrumMaAero2 = roverAction("Skill - Thrum: Aero Mid-air 2", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Aero, mv: 97.41, energy: 0.89, concerto: 3.19, offtune: 7072, forte2: 3.89 });
const ThrumMaAeroPlunge = roverAction("Skill - Thrum: Aero Plunge", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, element: Attribute.Aero, mv: 282.48, energy: 2.08, concerto: 7.48, offtune: 16613, forte2: 9.14 });

/** Thunder Bane: one per Thrum hit, considered Resonance Skill DMG. Queued by the Thrum actions
 *  themselves (see the Resonator's own updateBuffs() below), never cast directly. */
const ThunderBane = roverAction("Forte Skill - Thunder Bane", { node: Node.Forte, type: Type1.Skill, mv: 39.77 });

const THRUMS: Action[] = [
  ThrumSpectro1, ThrumSpectro2, ThrumSpectro3,
  ThrumHavoc1, ThrumHavoc2, ThrumHavoc3,
  SilencingBlade, ThrumAero,
  ThrumMaHavoc1, ThrumMaHavoc2, ThrumMaHavoc3,
  ThrumMaAero1, ThrumMaAero2, ThrumMaAeroPlunge,
];

// --- liberation / intro / outro
const Liberation = roverAction("Liberation - Ultimate Tactics", { node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Liberation, mv: 1192.86, concerto: 20, offtune: 57600, resetEnergy: true });
const Intro = roverAction("Intro - Thunderous Fury", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 167.03, energy: 3, concerto: 20.8, offtune: 9600, forte1: 53 });
// ...and clears all Thunder Rage, from wherever the Thrum hits left it (they gain past 100 here)
const Outro = roverAction("Outro - Rumbling Thunders", {
  cast: Cast.Outro, concerto: -100, swapOut: true, resetForte2: true,
  updateBuffs: () => queueOutro(ELECTRO_CORE),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Apex Resonance: unlocks Thrum of All Sounds, entered by holding Overshock and ended by the
 *  Outro (which also clears Thunder Rage). No stat of its own — S5 is what pays on it. */
const APEX_RESONANCE = new Buff({
  name: "Electro Rover: Apex Resonance",
  updateBuffs: () => { if (casting(Cast.Outro)) revokeCurrent(APEX_RESONANCE); },
});

/** Overshock, pressed: +10% ATK to the whole team for 20s — lost on his own next Intro. */
const OVERSHOCK_ATK = new Buff({
  name: "Electro Rover: Overshock ATK",
  applyStats: () => addStat(Stat.BonusAtk, 10),
  convertStats: () => { if (casting(Cast.Intro) && isHeld(ROVER_ELECTRO_RESONATOR)) revokeTeam(OVERSHOCK_ATK); },
});

/** Decipher (Inherent Skill): Overshock's own 10 stacks of Electro Flare, declared on both
 *  Overshock actions above — held here for the name. */
const ER_INHERENT_1 = new Inherent({ name: "Inherent: Decipher" });

/** Regression (Inherent Skill): +20% Resonance Skill DMG Bonus for 20s off a held Overshock,
 *  ended by switching out. */
const REGRESSION = new Buff({
  name: "Inherent: Regression",
  applyStats: () => addStat(Stat.DmgBonus, 20, Type1.Skill),
  updateBuffs: () => { lostOnSwap(); },
});
const ER_INHERENT_2 = new Inherent({
  name: "Inherent: Regression",
  updateBuffs: () => { if (currentAction() === OvershockHold) applyCurrent(REGRESSION, 1); },
});

/** Electro Core: what the Outro actually hands the incoming resonator — no stat of its own, just
 *  the arming. Inflicting any Negative Status spends it for the real payout below; until then it
 *  simply sits there, and it's lost on swap like every other outro buff. */
const ELECTRO_CORE = new Buff({
  name: "Electro Rover: Electro Core",
  updateBuffs: () => {
    lostOnSwap();
    if (inflictedNegativeStatus()) { applyCurrent(ER_OUTRO, 1); revokeCurrent(ELECTRO_CORE); }
  },
});
/** The Outro proper: 25% All DMG Amplification, paid out only once Electro Core has been spent —
 *  so it starts on the action after the one that inflicted the Negative Status. */
const ER_OUTRO = new Buff({
  name: "Electro Rover: Outro",
  applyStats: () => addStat(Stat.Amp, 25),
  updateBuffs: () => { lostOnSwap(); },
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as their own always-equipped gear pieces (Tier.Free), each owning its
// own trigger rather than the central Resonator updateBuffs() below.

// S1 Celestial Ingenuity: interruption resistance only — a genuine no-op, held for the name
const ER_S1 = new Sequence({ name: "Electro Rover S1: Celestial Ingenuity" });

// S2 Thousandfold Artifice: 5 more Electro Flare on whatever Ultimate Tactics hits
const ER_S2 = new Sequence({
  name: "Electro Rover S2: Thousandfold Artifice",
  updateDebuffs: () => { if (currentAction() === Liberation) inflictElectroFlare(5); },
});

const ER_S3 = new Sequence({
  name: "Electro Rover S3: Alchemy of Wonders",
  applyStats: () => {
    const a = currentAction();
    if (a === Overshock || a === OvershockHold) addStat(Stat.MulMv, 20);
  },
});

const ER_S4 = new Sequence({
  name: "Electro Rover S4: Earthquaking Rumble",
  applyStats: () => { if (currentAction() === Liberation) addStat(Stat.MulMv, 20); },
});

const ER_S5 = new Sequence({
  name: "Electro Rover S5: Principle of Change",
  applyStats: () => { if (isHeld(APEX_RESONANCE)) addStat(Stat.CritDmg, 20); },
});

const ER_S6 = new Sequence({
  name: "Electro Rover S6: Mind's Depths in a Casket",
  applyStats: () => {
    const a = currentAction();
    if (a === ThunderBane || THRUMS.includes(a)) addStat(Stat.MulMv, 20);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from their kit
const ROVER_ELECTRO_TALENTS = new Talent({
  name: "Talents: Electro Rover",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8); },
});

/** Them, as a Resonator: name/element/weapon, every grant/spend/queue rule their kit needs, and
 *  their own base stat line. `Tier.Free` — see the file header. */
const ROVER_ELECTRO_RESONATOR = new Resonator({
  name: "Electro Rover",
  talent: ROVER_ELECTRO_TALENTS,
  inherent1: ER_INHERENT_1,
  inherent2: ER_INHERENT_2,
  element: Attribute.Electro,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  outro: () => Outro,
  color: "#b98ce8",
  maxEnergy: 125,
  maxForte1: 120,
  maxForte2: 100,
  tier: Tier.Free,

  updateDebuffs: () => {
    const a = currentAction();
    // her own healing marker, read by every healing sonata and weapon (statuses.ts) —
    // applied to the healer alone, never the team
    if (a === ThrumMaAero1 || a === ThrumMaAero2) applyCurrent(HEALS, 1);
  },

  updateBuffs: () => { if (THRUMS.includes(currentAction())) queue(ThunderBane); },

  constantStats: () => {
    addStat(Stat.BaseHp, 10775); addStat(Stat.BaseAtk, 438); addStat(Stat.BaseDef, 1137);
  },
});

// the migrated sheet's own "erover sub" line: four basics plus Thunderclap into Repel fill Electric
// Surge, Overshock is pressed (the team ATK buff, not the Apex hold), then Liberation and the echo
// before handing the Outro off. They're never the team's own lead, so this covers opener and loop both.

const BA1234 = new ActionGroup("Basic - Deterrence 1234", [BA1, BA2, BA3, BA4]);

const ER_ROTATION = new Rotation([
  INTRO, BA1234, Skill, Repel, Overshock, Liberation, ECHO_SWAP, OUTRO,
]);

// The main-DPS loop: the same fill, the Liberation while the Surge is being built, then Overshock
// held for Apex and one pass of Thrum of All Sounds as the kit lays it out — seven ground stages,
// the held Aero leap into the six mid-air stages, and the Silencing Blade a press on landing
// chains into. Every Thrum hit queues its Thunder Bane (the Resonator's own updateBuffs). Never
// the team's lead, so this is opener and loop both.
const THRUM_SPECTRO = new ActionGroup("Skill - Thrum: Spectro 123", [
  ThrumSpectro1, ThrumSpectro2, ThrumSpectro3, 
]);
const THRUM_HAVOC = new ActionGroup("Skill - Thrum: Havoc 123", [
  ThrumHavoc1, ThrumHavoc2, ThrumHavoc3, 
]);

const ER_ROTATION_MDPS = new Rotation([
  INTRO, BA1234, Skill, Repel, OvershockHold, Liberation,
  THRUM_SPECTRO, THRUM_HAVOC, SilencingBlade,
  THRUM_SPECTRO, THRUM_HAVOC, SilencingBlade,
  ECHO_SWAP, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// their real build: resonator + talents + both Inherent Skills + every sequence node
// (Tier.Free — see file header), weapon, mainslot echo, sonata pieces, mainstat/substat
export const ROVER_ELECTRO = new Loadout({
  resonator: ROVER_ELECTRO_RESONATOR,
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS, RED_SPRING, UNSPOKEN_RUE],
  echoLoadouts: [
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(STAY_TUNED, ELECTRIC_REFLECTION_5PC),
    new EchoLoadout(SOUL_OF_DESPAIR, ELECTRIC_REFLECTION_5PC),
    new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC),
    new EchoLoadout(SOUL_OF_DESPAIR, SWORN_VIGIL_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
    rotation: ER_ROTATION,
  sequences: [
    ER_S1, ER_S2,
    ER_S3, ER_S4, ER_S5, ER_S6
  ],
});

// the same kit as the team's damage dealer (see the file header): Apex and the Thrum chains, the
// Electro sets only — Moonlit Clouds is a support's set
export const ROVER_ELECTRO_MDPS = new Loadout({
  resonator: ROVER_ELECTRO_RESONATOR,
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS, RED_SPRING, UNSPOKEN_RUE],
  echoLoadouts: [
    new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
  rotation: ER_ROTATION_MDPS,
  sequences: [ER_S1, ER_S2, ER_S3, ER_S4, ER_S5, ER_S6],
});
