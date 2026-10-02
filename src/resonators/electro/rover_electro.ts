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
import { Tier, Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  revokeTeam,
  isHeld,
  revokeCurrent,
  casting,
  currentAction,
  onAction,
  runningAction,
  addStat,
  queue,
  queueOutro,
  forte1,
  forte2,
  runningAnyOf,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, ECHO, INTRO, JUMP } from "../../engine/rotation.js";
import { tuneBreak, SWORD_BREAK } from "../../shared/tunebreak.js";
import { inflictElectroFlare, inflictedNegativeStatus, HEALS } from "../../shared/status.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { STAY_TUNED_3C, SWORN_VIGIL_5PC, ELECTRIC_REFLECTION_5PC, STAY_TUNED } from "../../echoes/mengzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { BLAZING_BRILLIANCE, RED_SPRING, UNSPOKEN_RUE } from "../../weapons/sword.js";

/* ----------------------------------------------------------------------------------- actions */

function roverAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- basics (Deterrence) and Resonance Skill, all Electric Surge (forte1) generators
const BA1 = roverAction("Basic - Deterrence 1", { animFrames: 22, bullets: [{ hitFrame: 14, mv: 5108, energy: 92, concerto: 331, offtune: 2936, forte1: 612 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
// PLACEHOLDER FRAMES
const BA2 = roverAction("Basic - Deterrence 2", { animFrames: 29, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 24, mv: 2600, energy: 47, concerto: 169, offtune: 1495 },
    { hitFrame: 24, mv: 3900, energy: 71, concerto: 253, offtune: 2242, forte1: 780 },
  ]});
// PLACEHOLDER FRAMES
const BA3 = roverAction("Basic - Deterrence 3", { animFrames: 48, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 30, mv: 1327, energy: 24, concerto: 86, offtune: 763 },
    { hitFrame: 30, mv: 1327, energy: 24, concerto: 86, offtune: 763 },
    { hitFrame: 30, mv: 1327, energy: 24, concerto: 86, offtune: 763 },
    { hitFrame: 30, mv: 1327, energy: 24, concerto: 86, offtune: 763 },
    { hitFrame: 30, mv: 1327, energy: 24, concerto: 86, offtune: 763 },
    { hitFrame: 30, mv: 1327, energy: 24, concerto: 86, offtune: 763 },
    { hitFrame: 30, mv: 1327, energy: 24, concerto: 86, offtune: 763, forte1: 1116 },
  ]});
// PLACEHOLDER FRAMES
const BA4 = roverAction("Basic - Deterrence 4", { animFrames: 78, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 67, mv: 7282, energy: 131, concerto: 471, offtune: 4186 },
    { hitFrame: 67, mv: 10922, energy: 197, concerto: 707, offtune: 6279, forte1: 2182 },
  ]});

// PLACEHOLDER FRAMES
const Skill = roverAction("Skill - Thunderclap", { animFrames: 30, cooldown: 60 * 10, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 30, mv: 10020, energy: 567, concerto: 490, offtune: 2134 },
    { hitFrame: 30, mv: 10020, energy: 567, concerto: 490, offtune: 2134, forte1: 890 },
  ]});
/** The Normal Attack follow-up off Thunderclap — considered Basic Attack DMG, and a Surge source
 *  in its own right. */
// PLACEHOLDER FRAMES
const Repel = roverAction("Basic - Repel", { animFrames: 64, node: Node.Skill, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 49, mv: 5612, energy: 101, concerto: 363, offtune: 3226 },
    { hitFrame: 49, mv: 8417, energy: 152, concerto: 545, offtune: 4839, forte1: 1680 },
  ]});
// the plunge: nanoka's Mid-air Attack row; frames and gauges off the game's own frame table
const MA = roverAction("Mid-air - Deterrence Plunge", { animFrames: 45, bullets: [{ hitFrame: 38, mv: 10494, energy: 189, concerto: 679, offtune: 6032, forte1: 1257 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});

// --- forte circuit: Overshock, at full Electric Surge. Press and hold are the same damage and the
//     same Surge spend, and differ only in what they open — the team ATK buff or Apex Resonance
//     (which the hold pays 60 Concerto for).
// Both Overshocks inflict Decipher's 10 Electro Flare and clear the whole Surge gauge — pre-clamp
// an overshoot back to exactly 120 so the declared forte1: -120 lands on 0, same pattern as
// Encore's own Cloudy Frenzy.
const OVERSHOCK = {
  cooldown: new Cooldown({ frames: 60 * 25 }), // press and hold are one button, one cooldown
  node: Node.Forte, cast: Cast.Skill, type: Type.Skill, minForte1: 12000, castForte1: -12000,
  updateDebuffs: () => inflictElectroFlare(10),
};
const Overshock = roverAction("Forte Skill - Overshock",{
  animFrames: 122, motionStop: 122, prioFrames: 122,
  ...OVERSHOCK, bullets: [{ hitFrame: 122, mv: 141258, energy: 1515, concerto: 1833, offtune: 54645 }],
  updateBuffs: () => applyTeam(OVERSHOCK_ATK, 1), 
});
// The hold pays 60 Concerto on top of the hit's own gain, and entering Apex restores Thunder Rage
// to its 100 — a reset ahead of the declared +100, so it lands exactly full however much a
// previous Apex left (the Outro clears it, so ordinarily none).
const OvershockHold = roverAction("Forte Skill - Overshock (Hold)", { minConcerto: 6000,
  animFrames: 122, motionStop: 121, prioFrames: 121,
  ...OVERSHOCK, bullets: [{ hitFrame: 122, mv: 141258, energy: 1515, concerto: 1833, offtune: 54645, forte2: 10000 }], castConcerto: -6000, resetForte2: true,
  updateBuffs: () => applyCurrent(APEX_RESONANCE, 1),
});

// --- Apex Resonance: Thrum of All Sounds, ground chain then the mid-air chain, each stage its own
//     element and each restoring Thunder Rage (forte2). Nothing in the sub rotation casts these —
//     they're here because S5/S6 pay out on them.
const ThrumSpectro1 = roverAction("Skill - Thrum: Spectro 1", { animFrames: 21, bullets: [{ hitFrame: 14, mv: 9912, energy: 90, concerto: 323, offtune: 7160, forte2: 394 }], node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Spectro, hitGlobal: () => queue(ThunderBane) });
// PLACEHOLDER FRAMES
const ThrumSpectro2 = roverAction("Skill - Thrum: Spectro 2", { animFrames: 50, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Spectro, bullets: [
    { hitFrame: 35, mv: 4906, energy: 55, concerto: 197, offtune: 4374, hitGlobal: () => queue(ThunderBane) },
    { hitFrame: 35, mv: 4906, energy: 55, concerto: 197, offtune: 4374 },
    { hitFrame: 35, mv: 6541, energy: 73, concerto: 263, offtune: 5832, forte2: 803 },
  ]});
// PLACEHOLDER FRAMES
const ThrumSpectro3 = roverAction("Skill - Thrum: Spectro 3", { animFrames: 42, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Spectro, bullets: [
    { hitFrame: 35, mv: 10206, energy: 87, concerto: 311, offtune: 6902, hitGlobal: () => queue(ThunderBane) },
    { hitFrame: 35, mv: 15308, energy: 130, concerto: 466, offtune: 10352, forte2: 950 },
  ]});
// PLACEHOLDER FRAMES
const ThrumHavoc1 = roverAction("Skill - Thrum: Havoc 1", { animFrames: 47, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Havoc, bullets: [
    { hitFrame: 40, mv: 1498, energy: 20, concerto: 72, offtune: 1592, hitGlobal: () => queue(ThunderBane) },
    { hitFrame: 40, mv: 1498, energy: 20, concerto: 72, offtune: 1592 },
    { hitFrame: 40, mv: 1498, energy: 20, concerto: 72, offtune: 1592 },
    { hitFrame: 40, mv: 10482, energy: 140, concerto: 502, offtune: 11144, forte2: 878 },
  ]});
// PLACEHOLDER FRAMES
const ThrumHavoc2 = roverAction("Skill - Thrum: Havoc 2", { animFrames: 49, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Havoc, bullets: [
    { hitFrame: 21, mv: 1383, energy: 22, concerto: 79, offtune: 1738, hitGlobal: () => queue(ThunderBane) },
    { hitFrame: 21, mv: 1383, energy: 22, concerto: 79, offtune: 1738 },
    { hitFrame: 21, mv: 1383, energy: 22, concerto: 79, offtune: 1738 },
    { hitFrame: 21, mv: 1383, energy: 22, concerto: 79, offtune: 1738 },
    { hitFrame: 21, mv: 8298, energy: 131, concerto: 470, offtune: 10428, forte2: 958 },
  ]});
// PLACEHOLDER FRAMES
const ThrumHavoc3 = roverAction("Skill - Thrum: Havoc 3", { animFrames: 68, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Havoc, bullets: [
    { hitFrame: 49, mv: 6251, energy: 87, concerto: 312, offtune: 6913, hitGlobal: () => queue(ThunderBane) },
    { hitFrame: 49, mv: 6251, energy: 87, concerto: 312, offtune: 6913 },
    { hitFrame: 49, mv: 2084, energy: 29, concerto: 104, offtune: 2305 },
    { hitFrame: 49, mv: 2084, energy: 29, concerto: 104, offtune: 2305 },
    { hitFrame: 49, mv: 2084, energy: 29, concerto: 104, offtune: 2305 },
    { hitFrame: 49, mv: 2084, energy: 29, concerto: 104, offtune: 2305, forte2: 1270 },
  ]});
// PLACEHOLDER FRAMES
const SilencingBlade = roverAction("Skill - Thrum: Silencing Blade", { animFrames: 102, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Aero, bullets: [
    { hitFrame: 77, mv: 4707, energy: 46, concerto: 165, offtune: 3657, hitGlobal: () => queue(ThunderBane) },
    { hitFrame: 77, mv: 4707, energy: 46, concerto: 165, offtune: 3657 },
    { hitFrame: 77, mv: 4707, energy: 46, concerto: 165, offtune: 3657 },
    { hitFrame: 77, mv: 4707, energy: 46, concerto: 165, offtune: 3657 },
    { hitFrame: 77, mv: 4707, energy: 46, concerto: 165, offtune: 3657 },
    { hitFrame: 77, mv: 23533, energy: 229, concerto: 823, offtune: 18283, forte2: 2016 },
  ]});
const ThrumAero = roverAction("Skill - Thrum: Aero", { animFrames: 28, bullets: [{ hitFrame: 20, mv: 15809, energy: 128, concerto: 459, offtune: 10200, forte2: 561 }], node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Aero, hitGlobal: () => queue(ThunderBane) });

const ThrumMaHavoc1 = roverAction("Skill - Thrum: Havoc Mid-air 1", { animFrames: 14, bullets: [{ hitFrame: 12, mv: 5063, energy: 59, concerto: 210, offtune: 4660, forte2: 256 }], node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Havoc, hitGlobal: () => queue(ThunderBane) });
const ThrumMaHavoc2 = roverAction("Skill - Thrum: Havoc Mid-air 2", { animFrames: 17, bullets: [{ hitFrame: 12, mv: 6382, energy: 67, concerto: 241, offtune: 5340, forte2: 294 }], node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Havoc, hitGlobal: () => queue(ThunderBane) });
// PLACEHOLDER FRAMES
const ThrumMaHavoc3 = roverAction("Skill - Thrum: Havoc Mid-air 3", { animFrames: 48, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Havoc, bullets: [
    { hitFrame: 34, mv: 9151, energy: 68, concerto: 243, offtune: 5395, hitGlobal: () => queue(ThunderBane) },
    { hitFrame: 34, mv: 9151, energy: 68, concerto: 243, offtune: 5395 },
    { hitFrame: 34, mv: 9428, energy: 70, concerto: 251, offtune: 5558, forte2: 900 },
  ]});
const ThrumMaAero1 = roverAction("Skill - Thrum: Aero Mid-air 1", { animFrames: 19, bullets: [{ hitFrame: 11, mv: 8461, energy: 81, concerto: 289, offtune: 6412, forte2: 353 }], node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Aero, hitGlobal: () => queue(ThunderBane) });
const ThrumMaAero2 = roverAction("Skill - Thrum: Aero Mid-air 2", { animFrames: 21, bullets: [{ hitFrame: 16, mv: 9741, energy: 89, concerto: 319, offtune: 7072, forte2: 389 }], node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Aero, hitGlobal: () => queue(ThunderBane) });
const ThrumMaAeroPlunge = roverAction("Skill - Thrum: Aero Plunge", { animFrames: 50, bullets: [{ hitFrame: 38, mv: 28248, energy: 208, concerto: 748, offtune: 16613, forte2: 914 }], node: Node.Forte, cast: Cast.Skill, type: Type.Skill, element: Attribute.Aero, hitGlobal: () => queue(ThunderBane) });

/** Thunder Bane: one per Thrum hit, considered Resonance Skill DMG. Queued by the Thrum actions
 *  themselves (see the Resonator's own updateDebuffs() below), never cast directly. */
const ThunderBane = roverAction("Forte Skill - Thunder Bane", { node: Node.Forte, type: Type.Skill, bullets: [{ hitFrame: 0, mv: 3977 }] });

const THRUMS = new Set<Action>([
  ThrumSpectro1, ThrumSpectro2, ThrumSpectro3,
  ThrumHavoc1, ThrumHavoc2, ThrumHavoc3,
  SilencingBlade, ThrumAero,
  ThrumMaHavoc1, ThrumMaHavoc2, ThrumMaHavoc3,
  ThrumMaAero1, ThrumMaAero2, ThrumMaAeroPlunge,
]);

// --- liberation / intro / outro
const Liberation = roverAction("Liberation - Ultimate Tactics", { animFrames: 224, bullets: [{ hitFrame: 190, mv: 119286, offtune: 57600 }], timestop: 224, motionStop: 224, prioFrames: 224, cooldown: 60 * 25, node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, castConcerto: 2000, resetEnergy: true });
// PLACEHOLDER FRAMES
const Intro = roverAction("Intro - Thunderous Fury", { animFrames: 72, motionStop: 33, prioFrames: 33,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 72, mv: 3341, energy: 60, concerto: 216, offtune: 1920 },
    { hitFrame: 72, mv: 3341, energy: 60, concerto: 216, offtune: 1920 },
    { hitFrame: 72, mv: 10021, energy: 180, concerto: 648, offtune: 5760, forte1: 5300 },
  ], castConcerto: 1000});
// ...and clears all Thunder Rage, from wherever the Thrum hits left it (they gain past 100 here)
const Outro = roverAction("Outro - Rumbling Thunders", { animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000, resetForte2: true,
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
  duration: 60 * 20,
  stats: [[Stat.BonusAtk, 10]],
  convertStats: () => { if (casting(Cast.Intro) && isHeld(ROVER_ELECTRO_RESONATOR)) revokeTeam(OVERSHOCK_ATK); },
});

/** Decipher (Inherent Skill): Overshock's own 10 stacks of Electro Flare, declared on both
 *  Overshock actions above — held here for the name. */
const ER_INHERENT_1 = new Inherent({ name: "Inherent: Decipher" });

/** Regression (Inherent Skill): +20% Resonance Skill DMG Bonus for 20s off a held Overshock,
 *  ended by switching out. */
const REGRESSION = new Buff({
  name: "Inherent: Regression",
  duration: 60 * 20,
  stats: [[Stat.DmgBonus, 20, Type.Skill]],
  lostOnSwap: true,
});
const ER_INHERENT_2 = new Inherent({
  name: "Inherent: Regression",
  grants: [{ on: onAction(OvershockHold), buff: REGRESSION }],
});

/** Electro Core: what the Outro actually hands the incoming resonator — no stat of its own, just
 *  the arming. Inflicting any Negative Status spends it for the real payout below; until then it
 *  simply sits there, and it's lost on swap like every other outro buff. */
const ELECTRO_CORE = new Buff({
  name: "Electro Rover: Electro Core",
  duration: 60 * 20,
  updateDebuffs: () => {
    if (inflictedNegativeStatus()) {
      applyCurrent(ER_OUTRO, 1);
      revokeCurrent(ELECTRO_CORE);
    }
  },
  lostOnSwap: true,
});
/** The Outro proper: 25% All DMG Amplification, paid out only once Electro Core has been spent —
 *  so it starts on the action after the one that inflicted the Negative Status. */
const ER_OUTRO = new Buff({
  name: "Electro Rover: Outro",
  duration: 60 * 14,
  stats: [[Stat.Amp, 25]],
  lostOnSwap: true,
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as their own always-equipped gear pieces (Tier.Free), each owning its
// own trigger rather than the central Resonator updateBuffs() below.

// S1 Celestial Ingenuity: interruption resistance only — a genuine no-op, held for the name
const ER_S1 = new Sequence({ name: "Electro Rover S1: Celestial Ingenuity" });

// S2 Thousandfold Artifice: 5 more Electro Flare on whatever Ultimate Tactics hits
const ER_S2 = new Sequence({
  name: "Electro Rover S2: Thousandfold Artifice",
  updateDebuffs: () => {
    if (runningAction(Liberation)) inflictElectroFlare(5);
  },
});

const ER_S3 = new Sequence({
  name: "Electro Rover S3: Alchemy of Wonders",
  applyStats: () => {
    if (runningAction(Overshock) || runningAction(OvershockHold)) addStat(Stat.MulMv, 20);
  },
});

const ER_S4 = new Sequence({
  name: "Electro Rover S4: Earthquaking Rumble",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 20); },
});

const ER_S5 = new Sequence({
  name: "Electro Rover S5: Principle of Change",
  applyStats: () => { if (isHeld(APEX_RESONANCE)) addStat(Stat.CritDmg, 20); },
});

const ER_S6 = new Sequence({
  name: "Electro Rover S6: Mind's Depths in a Casket",
  applyStats: () => { if (runningAction(ThunderBane) || runningAnyOf(THRUMS)) addStat(Stat.MulMv, 20); },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from their kit
const ROVER_ELECTRO_TALENTS = new Talent({
  name: "Electro Rover: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

/** Them, as a Resonator: name/element/weapon, every grant/spend/queue rule their kit needs, and
 *  their own base stat line. `Tier.Free` — see the file header. */
const ROVER_ELECTRO_RESONATOR = new Resonator({
  name: "Electro Rover",
  stats: [[Stat.BaseHp, 10775], [Stat.BaseAtk, 437.5], [Stat.BaseDef, 1136.6646]],
  talent: ROVER_ELECTRO_TALENTS,
  inherent1: ER_INHERENT_1,
  inherent2: ER_INHERENT_2,
  element: Attribute.Electro,
  weapon: WeaponType.Sword,
  color: "#b98ce8",
  intro: Intro,
  // 91 frames of time stop on a 90-frame break: the one over banks into the next press
  tuneBreak: tuneBreak(90, 90, 70, SWORD_BREAK), // 91 timestop???
  maxEnergy: 12500,
  forteScale: [0.01, 0.01, 1, 1, 1],
  maxForte1: 12000,
  maxForte2: 10000,
  tier: Tier.Free,

  updateDebuffs: () => {
    // her own healing marker, read by every healing sonata and weapon (statuses.ts) — applied to
    // the healer alone; a Thrum's Thunder Bane is its first hit's
    if (runningAction(ThrumMaAero1) || runningAction(ThrumMaAero2)) applyCurrent(HEALS, 1);
  },

});

// the migrated sheet's own "erover sub" line: four basics plus Thunderclap into Repel fill Electric
// Surge, Overshock is pressed (the team ATK buff, not the Apex hold), then Liberation and the echo
// before handing the Outro off. They're never the team's own lead, so this covers opener and loop both.

const BA1234 = new ActionGroup("Basic - Deterrence 1234", [BA1, BA2, BA3, BA4]);

const ER_ROTATION = new Rotation([
  INTRO, BA1234, Skill, Repel.cancel(), Liberation, Overshock, ECHO.instaSwap(), Outro,
]);

// The main-DPS loop: the same fill, the Liberation while the Surge is being built, then Overshock
// held for Apex and one pass of Thrum of All Sounds as the kit lays it out — seven ground stages,
// the held Aero leap into the six mid-air stages, and the Silencing Blade a press on landing
// chains into. Every Thrum hit queues its Thunder Bane (the Resonator's own updateDebuffs). Never
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
  ECHO.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// their real build: resonator + talents + both Inherent Skills + every sequence node
// (Tier.Free — see file header), weapon, mainslot echo, sonata pieces, mainstat/substat
export const ROVER_ELECTRO = new Loadout({
  resonator: ROVER_ELECTRO_RESONATOR,
  weapons: [EMERALD_OF_GENESIS, BLAZING_BRILLIANCE, RED_SPRING, UNSPOKEN_RUE],
  echoLoadouts: [
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    //new EchoLoadout(STAY_TUNED, ELECTRIC_REFLECTION_5PC),
    new EchoLoadout(STAY_TUNED_3C, ELECTRIC_REFLECTION_5PC),
    new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC),
    //new EchoLoadout(SOUL_OF_DESPAIR, SWORN_VIGIL_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Skill, Substat.AtkPct, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
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
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.ER3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.Skill, Substat.AtkPct, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  rotation: ER_ROTATION_MDPS,
  sequences: [ER_S1, ER_S2, ER_S3, ER_S4, ER_S5, ER_S6],
});
