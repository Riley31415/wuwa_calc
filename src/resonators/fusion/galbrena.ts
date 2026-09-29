/**
 * Galbrena, ported to the new engine — sequence-0 core loop, a limited 5-star
 * (`Tier.Limited`). A fusion pistols main DPS. Threshold State (default) banks Sinflame
 * (forte1) off her own hits, out of 27; full, Resonance Skill - Encroach is replaced by Ascent of Malice,
 * which drops her into Demon Hypostasis — Basic/Heavy/Skill are all replaced by their own
 * "enhanced" forms (Seraphic Execution, Flamewing Verdict, Ravage), scaled up by Afterflame.
 *
 * Hellstride is her dodge out of any of her own casts: a fixed 666-point hit "not affected by any
 * DMG Bonus effects" (`Scaling.Fixed`), and one of the casts that banks Burning Drive.
 *
 * Purging Flame (forte2) is a real gauge: Ascent of Malice converts 100 Sinflame into it, and each
 * enhanced-mode action's own declared forte2 cost spends it down. forte1 (Sinflame)/forte2
 * (Purging Flame) are both on the real 0-100 scale (the migrated sheet's own ×100 numbers ÷100).
 * Afterflame (0-40, +1.5%/point Demon Hypostasis DMG scaling, own
 * ceiling 60%) is a genuine live-tracked gauge on top of that, same "self-held Resonator reacting
 * to any teammate's own Echo cast" shape Sigrika's own Soliskin Vitality uses — GALBRENA_RESONATOR's own
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
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  applyCurrent,
  applyTeam,
  revokeTeam,
  casting,
  runningAction,
  addStat,
  frozenStacks,
  revokeCurrent,
  isHeld,
  forte1,
  forte2,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, ECHO, INTRO } from "../../engine/rotation.js";
import { LUX_UMBRA } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { CLAWPRINT_2PC, CORROSAURUS, FLAMEWING_SHADOW_3PC } from "../../echoes/septimont.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function galbrenaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune/Sinflame all come off the migrated (old-engine) sheet — nanoka's own
// page never gave them. forte2 (Purging Flame) deltas on the enhanced-mode actions are the
// sheet's own per-hit costs — they sum to ~97.56 of the 100 Ascent of Malice converts in,
// confirming they're the real spend. Ravage has no forte2 row at all, so it's left bare (0 cost).
// --- Threshold State basics: Slayer's Trigger. Stages 1-3 Heavy Attack DMG, Stage 4 Echo Skill.
const BA1 = galbrenaAction("Basic - Slayer's Trigger 1", { animFrames: 20, commitFrames: 12, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, mv: 59.18, energy: 0.83, concerto: 1.16, offtune: 2646, forte1: 2 });
// PLACEHOLDER FRAMES
const BA2 = galbrenaAction("Basic - Slayer's Trigger 2", { animFrames: 41, commitFrames: 32, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, hits: [
    { at: 32, mv: 26.31, energy: 0.3701, concerto: 0.5181, offtune: 1176.1788 },
    { at: 32, mv: 26.31, energy: 0.3701, concerto: 0.5181, offtune: 1176.1788 },
    { at: 32, mv: 78.91, energy: 1.1098, concerto: 1.5538, offtune: 3527.6424, forte1: 5 },
  ]});
// PLACEHOLDER FRAMES
const BA3 = galbrenaAction("Basic - Slayer's Trigger 3", { animFrames: 47, commitFrames: 41, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, hits: [
    { at: 41, mv: 28.6, energy: 0.4001, concerto: 0.5601, offtune: 1278.9789 },
    { at: 41, mv: 28.6, energy: 0.4001, concerto: 0.5601, offtune: 1278.9789 },
    { at: 41, mv: 42.89, energy: 0.5999, concerto: 0.8399, offtune: 1918.0211 },
    { at: 41, mv: 42.89, energy: 0.5999, concerto: 0.8399, offtune: 1918.0211, forte1: 5 },
  ]});
const BA4 = galbrenaAction("Basic - Slayer's Trigger 4", { animFrames: 62, commitFrames: 36, node: Node.Normal, cast: Cast.Basic, type: Type.Echo, mv: 177.86, energy: 2.49, concerto: 3.48, offtune: 7952, forte1: 4 });

// PLACEHOLDER FRAMES
const DC = galbrenaAction("Dodge Counter - Blood for Blood", { animFrames: 47, commitFrames: 41, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Heavy, hits: [
    { at: 41, mv: 41.05, energy: 0.4, concerto: 0.56, offtune: 1278.8623 },
    { at: 41, mv: 41.05, energy: 0.4, concerto: 0.56, offtune: 1278.8623 },
    { at: 41, mv: 61.57, energy: 0.6, concerto: 0.84, offtune: 1918.1377 },
    { at: 41, mv: 61.57, energy: 0.6, concerto: 0.84, offtune: 1918.1377 },
  ], castConcerto: 10});
const MA = galbrenaAction("Mid-air - Ashfall Barrage (Plunge)", { node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, mv: 143.15, energy: 2.00, concerto: 2.80, offtune: 6400 });
const MASustained = galbrenaAction("Mid-air - Ashfall Barrage (Sustained Fire)", { node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, mv: 26.84, energy: 0.38, concerto: 0.53, offtune: 1200 });

// Threshold State heavy: Volley of Death, 3 held stages
// PLACEHOLDER FRAMES
const HA1 = galbrenaAction("Heavy - Volley of Death 1", { animFrames: 36, commitFrames: 27, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 27, mv: 53.3, energy: 0.75, concerto: 1.05, offtune: 2383 },
    { at: 27, mv: 53.3, energy: 0.75, concerto: 1.05, offtune: 2383, forte1: 2 },
  ]});
// PLACEHOLDER FRAMES
const HA2 = galbrenaAction("Heavy - Volley of Death 2", { animFrames: 26, commitFrames: 22, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 22, mv: 34.59, energy: 0.49, concerto: 0.68, offtune: 1547 },
    { at: 22, mv: 34.59, energy: 0.49, concerto: 0.68, offtune: 1547, forte1: 7 },
  ]});
// PLACEHOLDER FRAMES
const HA3 = galbrenaAction("Heavy - Volley of Death 3", { animFrames: 73, commitFrames: 34, node: Node.Normal, cast: Cast.Heavy, type: Type.Echo, hits: [
    { at: 34, mv: 16.77, energy: 0.237, concerto: 0.329, offtune: 749.9 },
    { at: 34, mv: 16.77, energy: 0.237, concerto: 0.329, offtune: 749.9 },
    { at: 34, mv: 16.77, energy: 0.237, concerto: 0.329, offtune: 749.9 },
    { at: 34, mv: 117.39, energy: 1.659, concerto: 2.303, offtune: 5249.3, forte1: 5 },
  ]});

// Threshold State resonance skill: Encroach (base), Ascent of Malice (27 Sinflame, opens Demon
// Hypostasis)
// the five casts that bank a Burning Drive stack
const DRIVE = { updateBuffs: () => applyCurrent(BURNING_DRIVE, 1) };
/** Encroach and Ravage draw on one 5s cooldown. */
const ENCROACH_CD = new Cooldown({ frames: 60 * 5 });
// PLACEHOLDER FRAMES
const Encroach = galbrenaAction("Skill - Encroach", { animFrames: 39, commitFrames: 39, cooldown: ENCROACH_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, hits: [
    { at: 39, mv: 10.74, energy: 1.9781, concerto: 0.6664, offtune: 1512.545 },
    { at: 39, mv: 25.04, energy: 4.6119, concerto: 1.5536, offtune: 3526.455, forte1: 5 },
  ], ...DRIVE });
/** Converts Sinflame into Purging Flame — declared as real deltas (forte1: -27, forte2:
 *  +100) so they show in the hover trace, but GALBRENA_RESONATOR's own updateBuffs() below first normalizes
 *  each gauge to what these deltas expect to land on 0/100 from (forte gauges have no floor or
 *  ceiling, so a bare relative delta could land short). */
// PLACEHOLDER FRAMES
const AscentOfMalice = galbrenaAction("Skill - Ascent of Malice", {
  animFrames: 42, commitFrames: 30, cooldown: 60 * 13,
  node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, hits: [
    { at: 30, mv: 51.57, energy: 7.38, concerto: 5, offtune: 2794 },
    { at: 30, mv: 51.57, energy: 7.38, concerto: 5, offtune: 2794, forte2: 100 },
  ], castForte1: -27,
  // the conversion is a top-off, not a top-up: Purging Flame is emptied ahead of the +100 above,
  // so it lands on exactly 100 from wherever the enhanced chain left it
  resetForte2: true,
  updateBuffs: () => {
    applyCurrent(BURNING_DRIVE, 1);
    applyCurrent(DEMON_HYPOSTASIS, 1);
  },
});

// Demon Hypostasis: Seraphic Execution (Basic), Flamewing Verdict (Heavy), Ravage (Skill) —
// Mid-air/Dodge Counter enhanced forms aren't placed in the rotation below, kept for
// completeness. Burning Drive is Seraphic Execution's own Stage 4 specifically, not Threshold
// State's Slayer's Trigger Stage 4.
const SeraphicExecution1 = galbrenaAction("Forte Basic - Seraphic Execution 1", { animFrames: 24, commitFrames: 20, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, mv: 58.99, energy: 1.00, concerto: 5.54, offtune: 2374, castForte2: -4.88});
// PLACEHOLDER FRAMES
const SeraphicExecution2 = galbrenaAction("Forte Basic - Seraphic Execution 2", { animFrames: 47, commitFrames: 37, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, hits: [
    { at: 37, mv: 27.84, energy: 0.4, concerto: 1.3901, offtune: 1120.0805 },
    { at: 37, mv: 27.84, energy: 0.4, concerto: 1.3901, offtune: 1120.0805 },
    { at: 37, mv: 83.51, energy: 1.2, concerto: 4.1698, offtune: 3359.839 },
  ], castForte2: -9.76});
// PLACEHOLDER FRAMES
const SeraphicExecution3 = galbrenaAction("Forte Basic - Seraphic Execution 3", { animFrames: 69, commitFrames: 40, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, hits: [
    { at: 40, mv: 24.32, energy: 0.334, concerto: 0.8791, offtune: 978.7207 },
    { at: 40, mv: 24.32, energy: 0.334, concerto: 0.8791, offtune: 978.7207 },
    { at: 40, mv: 24.32, energy: 0.334, concerto: 0.8791, offtune: 978.7207 },
    { at: 40, mv: 170.21, energy: 2.338, concerto: 6.1527, offtune: 6849.8379 },
  ], castForte2: -18.29});
// PLACEHOLDER FRAMES
const SeraphicExecution4 = galbrenaAction("Forte Basic - Seraphic Execution 4", { animFrames: 56, commitFrames: 42, node: Node.Forte, cast: Cast.Basic, type: Type.Echo, hits: [
    { at: 42, mv: 18.15, energy: 0.256, concerto: 0.7701, offtune: 730.6208 },
    { at: 42, mv: 18.15, energy: 0.256, concerto: 0.7701, offtune: 730.6208 },
    { at: 42, mv: 18.15, energy: 0.256, concerto: 0.7701, offtune: 730.6208 },
    { at: 42, mv: 127.02, energy: 1.792, concerto: 5.3897, offtune: 5113.1376 },
  ], castForte2: -13.41, ...DRIVE });
// PLACEHOLDER FRAMES
const SeraphicExecution5 = galbrenaAction("Forte Basic - Seraphic Execution 5", { animFrames: 85, commitFrames: 67, node: Node.Forte, cast: Cast.Basic, type: Type.Echo, hits: [
    { at: 67, mv: 67.28, energy: 0.924, concerto: 2.538, offtune: 2707.4598 },
    { at: 67, mv: 156.99, energy: 2.156, concerto: 5.922, offtune: 6317.5402 },
  ], castForte2: -19.51});

// PLACEHOLDER FRAMES
const FlamewingVerdict1 = galbrenaAction("Forte Heavy - Flamewing Verdict 1", { animFrames: 36, commitFrames: 27, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 27, mv: 59.22, energy: 0.87, concerto: 3.3, offtune: 2383 },
    { at: 27, mv: 59.22, energy: 0.87, concerto: 3.3, offtune: 2383 },
  ], castForte2: -9.76});
// PLACEHOLDER FRAMES
const FlamewingVerdict2 = galbrenaAction("Forte Heavy - Flamewing Verdict 2", { animFrames: 26, commitFrames: 22, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 22, mv: 38.35, energy: 0.61, concerto: 2.93, offtune: 1543 },
    { at: 22, mv: 38.35, energy: 0.61, concerto: 2.93, offtune: 1543 },
  ], castForte2: -7.32});
// PLACEHOLDER FRAMES
const FlamewingVerdict3 = galbrenaAction("Forte Heavy - Flamewing Verdict 3", { animFrames: 73, commitFrames: 34, node: Node.Forte, cast: Cast.Heavy, type: Type.Echo, hits: [
    { at: 34, mv: 17.69, energy: 0.2491, concerto: 0.7643, offtune: 711.9415 },
    { at: 34, mv: 17.69, energy: 0.2491, concerto: 0.7643, offtune: 711.9415 },
    { at: 34, mv: 17.69, energy: 0.2491, concerto: 0.7643, offtune: 711.9415 },
    { at: 34, mv: 123.77, energy: 1.7427, concerto: 5.3471, offtune: 4981.1755 },
  ], castForte2: -14.63});

// PLACEHOLDER FRAMES
const Ravage = galbrenaAction("Forte Skill - Ravage", {
  cooldown: ENCROACH_CD,
  node: Node.Forte, cast: Cast.Skill, type: Type.Heavy, hits: [
    { at: 0, mv: 10.74, energy: 1.9781, concerto: 0.6664, offtune: 1512.545 },
    { at: 0, mv: 25.04, energy: 4.6119, concerto: 1.5536, offtune: 3526.455 },
  ],
  resetForte2: true,
  updateBuffs: () => applyCurrent(BURNING_DRIVE, 1),
});

// PLACEHOLDER FRAMES
const Liberation = galbrenaAction("Liberation - Hellfire Absolution", {
  cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Echo, hits: [
    { at: 0, mv: 110.9, concerto: 1.9999, offtune: 8399.997 },
    { at: 0, mv: 90.74, concerto: 1.6364, offtune: 6873.0003 },
    { at: 0, mv: 90.74, concerto: 1.6364, offtune: 6873.0003 },
    { at: 0, mv: 90.74, concerto: 1.6364, offtune: 6873.0003 },
    { at: 0, mv: 90.74, concerto: 1.6364, offtune: 6873.0003 },
    { at: 0, mv: 90.74, concerto: 1.6364, offtune: 6873.0003 },
    { at: 0, mv: 90.74, concerto: 1.6364, offtune: 6873.0003 },
    { at: 0, mv: 90.74, concerto: 1.6364, offtune: 6873.0003 },
    { at: 0, mv: 90.74, concerto: 1.6364, offtune: 6873.0003 },
    { at: 0, mv: 90.74, concerto: 1.6364, offtune: 6873.0003 },
    { at: 0, mv: 90.74, concerto: 1.6364, offtune: 6873.0003 },
    { at: 0, mv: 90.74, concerto: 1.6361, offtune: 6873 },
  ], resetEnergy: true,
  updateBuffs: () => applyCurrent(HELLFIRE_WINDOW, 1),
});

const Intro = galbrenaAction("Intro - Hellflare Overload", { animFrames: 57, commitFrames: 57, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, mv: 94.12, energy: 10, castConcerto: 10, offtune: 4208, forte1: 3, ...DRIVE });
/** Unlike most outros, this one deals real damage (795% MV) on top of the handoff concerto
 *  reset; its OFF-FIELD tag still marks it as her leaving the field for lostOnSwap purposes. */
// PLACEHOLDER FRAMES
const Outro = galbrenaAction("Outro - Ashen Pursuit", { cast: Cast.Outro, type: Type.Outro, hits: [
    { at: 0, mv: 79.5, energy: 1.003, offtune: 3032.6 },
    { at: 0, mv: 79.5, energy: 1.003, offtune: 3032.6 },
    { at: 0, mv: 79.5, energy: 1.003, offtune: 3032.6 },
    { at: 0, mv: 556.5, energy: 7.021, offtune: 21228.2 },
  ], castConcerto: -100});

/* ------------------------------------------------------------------------------------ buffs */

/** +20% ATK, 4s — granted on Intro, Hellstride, Encroach, Ascent of Malice, Seraphic Execution
 *  Stage 4, and Ravage. */
const BURNING_DRIVE = new Buff({
  name: "Galbrena: Burning Drive",
  duration: 60 * 4,
  stats: [[Stat.BonusAtk, 20]],
  // S2: 350% more of the bonus, so 20% becomes 90%
  applyStats: () => {
    // S2 takes it to 90% of ATK — the 70 over the base is the node's own
    if (isHeld(GB_S2)) asSource(GB_S2, () => addStat(Stat.BonusAtk, 70));
  },
});

/** +5% DMG Dealt a stack, up to 4, 5.5s — granted on any of her own landed attacks. */
const OATHBOUND_HUNT = new Buff({
  name: "Galbrena: Fated End", maxStacks: 4, duration: 60 * 5.5,
  stats: [[Stat.Amp, 5]], perStack: true,
});
const GB_INHERENT_1 = new Inherent({
  name: "Inherent: Oathbound Hunt",
  grants: [{ on: () => !casting(Cast.Echo), buff: OATHBOUND_HUNT, onHit: true }],
});
/** No combat-formula effect this engine models, same "still equipped, no stat" treatment
 *  Augusta's own Ruler's Realm shield gets. */
const GB_INHERENT_2 = new Inherent({ name: "Inherent: Sin Feaster" });

/** A marker for "has she opened it yet" — set by Ascent of Malice. Ends itself once Purging
 *  Flame runs out, taking Afterflame down with it. */
const DEMON_HYPOSTASIS = new Buff({
  name: "Galbrena: Demon Hypostasis",
  duration: 60 * 50,
  updateBuffs: () => { if (forte2() <= 0) { revokeTeam(AFTERFLAME); revokeCurrent(DEMON_HYPOSTASIS); } },
});

/** 0-40, +8 on any team member's own Echo Skill cast while she's still in Threshold State (not
 *  yet holding DEMON_HYPOSTASIS this turn). Scales the nine enhanced-mode actions at +1.5%/point,
 *  capped at 60%, gated per-action inside applyStats() itself. Held team-wide so the count reads
 *  on every row of the log, the way Jinhsi's Incandescence is; the nine-action gate below is what
 *  keeps the payout hers. */
const AFTERFLAME = new Buff({
  name: "Galbrena: Afterflame", maxStacks: 40,
  applyStats: () => {
    if (runningAction(SeraphicExecution1) || runningAction(SeraphicExecution2) || runningAction(SeraphicExecution3)
      || runningAction(SeraphicExecution4) || runningAction(SeraphicExecution5)
      || runningAction(FlamewingVerdict1) || runningAction(FlamewingVerdict2) || runningAction(FlamewingVerdict3)
      || runningAction(Ravage)) {
      addStat(Stat.TotalDmg, Math.min(60, 1.5 * frozenStacks()));
      // S1 reads the same count as Crit. DMG, S6 as Fusion amplification — both snapshot at Ascent
      // of Malice, which is the same number: Afterflame only ever builds outside Demon Hypostasis
      // the count is read out here: inside `asSource` the "current" gear is the node, whose own
      // stacks are not what these scale on
      const flame = frozenStacks();
      if (isHeld(GB_S1)) asSource(GB_S1, () => addStat(Stat.CritDmg, Math.min(80, 2 * flame)));
      if (isHeld(GB_S6)) asSource(GB_S6, () => addStat(Stat.Amp, Math.min(35, 0.875 * flame), Attribute.Fusion));
    }
  },
});

/** +85% DMG Multiplier on eight of those same nine actions (Ravage excepted — scoped to
 *  Basic/Heavy Attack DMG, not Resonance Skill), 14s. */
const HELLFIRE_WINDOW = new Buff({
  name: "Galbrena: Hellfire Absolution",
  duration: 60 * 14,
  applyStats: () => {
    if (runningAction(SeraphicExecution1) || runningAction(SeraphicExecution2) || runningAction(SeraphicExecution3)
      || runningAction(SeraphicExecution4) || runningAction(SeraphicExecution5)
      || runningAction(FlamewingVerdict1) || runningAction(FlamewingVerdict2) || runningAction(FlamewingVerdict3)) addStat(Stat.MulMv, 85);
  },
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: 2% Crit. DMG a point of Afterflame to the enhanced casts, 80% at its own 40-point cap —
 *  paid by Afterflame itself, which is what holds the count. The interrupt immunity is no stat. */
const GB_S1 = new Sequence({ name: "Galbrena S1: Heart of Defiance Ever Ablaze" });

/** S2: Burning Drive's +20% ATK becomes +90% — paid by Burning Drive itself. */
const GB_S2 = new Sequence({ name: "Galbrena S2: Hellbound Dive of Fire and Abyss" });

/** S3: the Liberation at x2.3 — nanoka's second rows (255.07% and 208.69% against 110.90% and
 *  90.74%), and nothing else multiplies it, so a plain multiplier reaches exactly that. */
const GB_S3 = new Sequence({
  name: "Galbrena S3: Hunter's Blood Oath Rekindled",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 130); },
});

/** S4: +20% All-Attribute DMG Bonus to the team off any member's Echo Skill, 20s — re-granted by
 *  every echo the team casts, so it stands for the fight. */
const CARRY_FORTH = new Buff({
  name: "Galbrena S4: Carry Forth This Fading Spark",
  duration: 60 * 20,
  stats: [[Stat.DmgBonus, 20]],
});
const GB_S4 = new Sequence({
  name: "Galbrena S4: Carry Forth This Fading Spark",
  updateGlobal: () => { if (casting(Cast.Echo)) applyTeam(CARRY_FORTH, 1); },
});

/** S5: Encroach, Ascent of Malice and Ravage at x2.5 — nanoka's second rows (26.83%+62.60% and
 *  128.93%), and none of the three carries another multiplier, so this lands on exactly that. */
const GB_S5 = new Sequence({
  name: "Galbrena S5: Though Light Fades, Torment Consumes",
  applyStats: () => {
    if (runningAction(Encroach) || runningAction(AscentOfMalice) || runningAction(Ravage)) addStat(Stat.MulMv, 150);
  },
});

/** S6: Eternal Hypostasis keeps everything Demon Hypostasis had and puts every Seraphic Execution
 *  and Flamewing Verdict at x1.6 — over the Hellfire window rather than beside it, which nanoka's
 *  rows settle: 174.61% is 58.99% x 1.85 x 1.6. Multipliers sum in one bracket here, so the share
 *  this contributes is 60% of whatever already stands. Its Afterflame amplification is paid by
 *  Afterflame above. */
const GB_S6 = new Sequence({
  name: "Galbrena S6: I Remain Who I am, Eternal My Flame",
  applyStats: () => {
    if (runningAction(SeraphicExecution1) || runningAction(SeraphicExecution2) || runningAction(SeraphicExecution3)
      || runningAction(SeraphicExecution4) || runningAction(SeraphicExecution5)
      || runningAction(FlamewingVerdict1) || runningAction(FlamewingVerdict2) || runningAction(FlamewingVerdict3)) {
      addStat(Stat.MulMv, isHeld(HELLFIRE_WINDOW) ? 60 * 1.85 : 60);
    }
  },
});

const GB_SEQUENCES = [GB_S1, GB_S2, GB_S3, GB_S4, GB_S5, GB_S6];

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const GALBRENA_TALENTS = new Talent({
  name: "Galbrena: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritDmg, 16]],
});

/** Hellstride: a dodge on the ground during any of her own casts — a fixed 666 Fusion, Basic
 *  Attack DMG no DMG buff touches. */
const Hellstride = galbrenaAction("Dodge - Hellstride", { animFrames: 22, commitFrames: 22, type: Type.Basic, scaling: Scaling.Fixed, mv: 666, ...DRIVE });

const GALBRENA_RESONATOR = new Resonator({
  name: "Galbrena",
  stats: [[Stat.BaseHp, 10300], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1112.2202]],
  talent: GALBRENA_TALENTS,
  inherent1: GB_INHERENT_1,
  inherent2: GB_INHERENT_2,
  element: Attribute.Fusion,
  weapon: WeaponType.Pistols,
  // her own casts only: an echo (or a marker standing for one) is the plain dodge
  dodge: (after) => (after.cast === Cast.Echo || after.resolveFn ? null : Hellstride),
  color: "#3454ac",
  intro: Intro,
  maxEnergy: 125,
  maxForte1: 27,
  maxForte2: 100,

  // reacts to *any* team member's own Echo cast, not just her own — see AFTERFLAME's own comment
  updateGlobal: () => {
    if (casting(Cast.Echo) && !isHeld(DEMON_HYPOSTASIS)) applyTeam(AFTERFLAME, 8);
  },
});

// a kit-valid line: Intro, Encroach opens Burning Drive and banks Sinflame, Ascent of Malice
// spends it all and opens Demon Hypostasis, Seraphic Execution and Flamewing Verdict follow
// while it's up, Liberation opens its own +85% window over the tail of it, Outro closes the loop
// out (and still hits). She's never the team's own lead, so this covers both opener and loop.

const SeraphicExecution2345 = new ActionGroup("Forte Basic - Seraphic Execution 2345", [SeraphicExecution2, SeraphicExecution3, SeraphicExecution4, SeraphicExecution5]);
const SeraphicExecution345 = new ActionGroup("Forte Basic - Seraphic Execution 345", [SeraphicExecution3, SeraphicExecution4, SeraphicExecution5]);

const HA23 = new ActionGroup("Heavy - Volley of Death 23", [HA2, HA3]);
const HA123 = new ActionGroup("Heavy - Volley of Death 123", [HA1, HA2, HA3]);
const BA234 = new ActionGroup("Basic - Slayer's Trigger 234", [BA2, BA3, BA4]);
const BA12 = new ActionGroup("Basic - Slayer's Trigger 12", [BA1, BA2]);
const BA34 = new ActionGroup("Basic - Slayer's Trigger 34", [BA3, BA4]);
const BA23 = new ActionGroup("Basic - Slayer's Trigger 23", [BA2, BA3]);

const GB_ROTATION = new Rotation([
  INTRO, BA23, HA123.cancel(),
  AscentOfMalice, Liberation,
  SeraphicExecution2345.dodgeCancel(),
  SeraphicExecution345.dodgeCancel(), 
  SeraphicExecution3.instaSwap(),
  Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, mainslot echo,
// sonata pieces, mainstat/substat
const GB_WEAPONS = [LUX_UMBRA, NEW_STD_PISTOL, STATIC_MIST];
const GB_ECHOES = [new EchoLoadout(CORROSAURUS, FLAMEWING_SHADOW_3PC, CLAWPRINT_2PC)];
export const GALBRENA = new Loadout({
  resonator: GALBRENA_RESONATOR,
  weapons: GB_WEAPONS,
  echoLoadouts: GB_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
  rotation: { 0: GB_ROTATION },
  sequences: GB_SEQUENCES,
});
