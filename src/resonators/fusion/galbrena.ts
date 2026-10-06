/**
 * Galbrena, ported to the new engine — sequence-0 core loop, a limited 5-star
 * (`Tier.Limited`). A fusion pistols main DPS. Threshold State (default) banks Sinflame
 * (forte1) off her own hits, out of 270; full, Resonance Skill - Encroach is replaced by Ascent of Malice,
 * which drops her into Demon Hypostasis — Basic/Heavy/Skill are all replaced by their own
 * "enhanced" forms (Seraphic Execution, Flamewing Verdict, Ravage), scaled up by Afterflame.
 *
 * Hellstride is her dodge out of any of her own casts: a fixed 666-point hit "not affected by any
 * DMG Bonus effects" (`Scaling.Fixed`), and one of the casts that banks Burning Drive.
 *
 * Purging Flame (forte2) is a real gauge: Ascent of Malice converts 100 Sinflame into it, and each
 * enhanced-mode action's own declared forte2 cost spends it down. forte1 (Sinflame)/forte2
 * (Purging Flame) read 0-270 and 0-100; Purging Flame is held in hundredths (`forteScale`).
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
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, Position } from "../../engine/stats.js";
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
  forte2,
  currentHit,
  previousPress,
  saveChain,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, INTRO, OUTRO, ECHO, DODGE } from "../../engine/rotation.js";
import { LUX_UMBRA } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { CLAWPRINT_2PC, CORROSAURUS, FLAMEWING_SHADOW_3PC } from "../../echoes/septimont.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function galbrenaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

/** Demon Hypostasis, the stance every enhanced form is cast in: opened by Ascent of Malice, 50s
 *  at most, and ended on the hit that runs Purging Flame out, taking Afterflame down with it. */
const DEMON_HYPOSTASIS: Buff = new Buff({
  name: "Galbrena: Demon Hypostasis",
  duration: 60 * 50,
  // only a hit spending Purging Flame runs it out — Ascent of Malice's reset ahead of its refill is none
  afterHit: () => {
    if (forte2() > 0 || !(currentHit().forte2 < 0 || runningAction(Ravage))) return;
    revokeTeam(AFTERFLAME);
    revokeCurrent(DEMON_HYPOSTASIS);
  },
});

// energy/concerto/offtune/Sinflame all come off the migrated (old-engine) sheet — nanoka's own
// page never gave them. forte2 (Purging Flame) deltas on the enhanced-mode actions are the
// sheet's own per-hit costs — they sum to ~97.56 of the 100 Ascent of Malice converts in,
// confirming they're the real spend. Ravage has no forte2 row at all, so it's left bare (0 cost).
// --- Threshold State basics: Slayer's Trigger. Stages 1-3 Heavy Attack DMG, Stage 4 Echo Skill.
const BA1 = galbrenaAction("Basic - Slayer's Trigger 1", { animFrames: 20, castPriority: 2, bullets: [{ hitFrame: 12, mv: 5918, energy: 83, concerto: 116, offtune: 2646, forte1: 20 }], node: Node.Normal, cast: Cast.Basic, type: Type.Heavy});
// "Press Normal Attack right after" Stage 4, Volley of Death Stage 1, the Liberation or the Intro "to perform Basic Attack Stage 2"
// PLACEHOLDER FRAMES
const BA2 = galbrenaAction("Basic - Slayer's Trigger 2", { chains: () => [BA1, BA4, HA1, Liberation, Intro], animFrames: 41, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 32, mv: 2631, energy: 37, concerto: 52, offtune: 1176 },
    { hitFrame: 32, mv: 2631, energy: 37, concerto: 52, offtune: 1176 },
    { hitFrame: 32, mv: 7891, energy: 111, concerto: 155, offtune: 3528, forte1: 50 },
  ]});
// Volley of Death Stage 2 or 3 and the Plunging Attack lead into Stage 3 too
// PLACEHOLDER FRAMES
const BA3 = galbrenaAction("Basic - Slayer's Trigger 3", { chains: () => [BA2, HA2, HA3, MA], animFrames: 47, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 41, mv: 2860, energy: 40, concerto: 56, offtune: 1279 },
    { hitFrame: 41, mv: 2860, energy: 40, concerto: 56, offtune: 1279 },
    { hitFrame: 41, mv: 4289, energy: 60, concerto: 84, offtune: 1918 },
    { hitFrame: 41, mv: 4289, energy: 60, concerto: 84, offtune: 1918, forte1: 50 },
  ]});
// and Blood for Blood into Stage 4
const BA4 = galbrenaAction("Basic - Slayer's Trigger 4", { chains: () => [BA3, DC], animFrames: 62, castPriority: 2, bullets: 
  [{ hitFrame: 36, mv: 17786, energy: 249, concerto: 348, offtune: 7952, forte1: 40 }],
   node: Node.Normal, cast: Cast.Basic, type: Type.Echo});

// PLACEHOLDER FRAMES
const DC = galbrenaAction("Dodge Counter - Blood for Blood", { chains: [DODGE], animFrames: 47, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Heavy, bullets: [
    { hitFrame: 41, mv: 4105, energy: 40, concerto: 56, offtune: 1279 },
    { hitFrame: 41, mv: 4105, energy: 40, concerto: 56, offtune: 1279 },
    { hitFrame: 41, mv: 6157, energy: 60, concerto: 84, offtune: 1918 },
    { hitFrame: 41, mv: 6157, energy: 60, concerto: 84, offtune: 1918 },
  ], castConcerto: 1000});
const MA = galbrenaAction("Mid-air - Ashfall Barrage (Plunge)", { castPosition: Position.Midair, endPosition: Position.Grounded,
  castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets:
   [{ hitFrame: 0, mv: 14315, energy: 200, concerto: 280, offtune: 6400, forte1: 27 }] });
const MASustained = galbrenaAction("Mid-air - Ashfall Barrage (Sustained Fire)", { castPosition: Position.Midair, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 2684, energy: 38, concerto: 53, offtune: 1200 }] });

// Threshold State heavy: Volley of Death, 3 held stages
// PLACEHOLDER FRAMES
const HA1 = galbrenaAction("Heavy - Volley of Death 1", { animFrames: 36, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 27, mv: 5330, energy: 75, concerto: 105, offtune: 2383 },
    { hitFrame: 27, mv: 5330, energy: 75, concerto: 105, offtune: 2383, forte1: 20 },
  ]});
// the Intro's "Hold Normal Attack after casting this skill to cast Heavy Attack - Volley of Death Stage 2"
// PLACEHOLDER FRAMES
const HA2 = galbrenaAction("Heavy - Volley of Death 2", { chains: () => [HA1, Intro], animFrames: 26, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 22, mv: 3459, energy: 49, concerto: 68, offtune: 1547 },
    { hitFrame: 22, mv: 3459, energy: 49, concerto: 68, offtune: 1547, forte1: 70 },
  ]});
// PLACEHOLDER FRAMES
const HA3 = galbrenaAction("Heavy - Volley of Death 3", { chains: [HA2], animFrames: 73, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Echo, bullets: [
    { hitFrame: 34, mv: 1677, energy: 24, concerto: 33, offtune: 750 },
    { hitFrame: 34, mv: 1677, energy: 24, concerto: 33, offtune: 750 },
    { hitFrame: 34, mv: 1677, energy: 24, concerto: 33, offtune: 750 },
    { hitFrame: 34, mv: 11739, energy: 165, concerto: 230, offtune: 5249, forte1: 50 },
  ]});

// Threshold State resonance skill: Encroach (base), Ascent of Malice (270 Sinflame, opens Demon
// Hypostasis)
// the five casts that bank a Burning Drive stack
const DRIVE = { updateBuffs: () => applyCurrent(BURNING_DRIVE, 1) };
/** Encroach and Ravage draw on one 5s cooldown. */
const ENCROACH_CD = new Cooldown({ frames: 60 * 5 });
// "Dash forward and leap into the air. Flip backward upon hitting the target": she ends airborne
// PLACEHOLDER FRAMES
const Encroach = galbrenaAction("Skill - Encroach", { endPosition: Position.Midair, maxForte1: 269, animFrames: 39, castPriority: 4, cooldown: ENCROACH_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, bullets: [
    { hitFrame: 39, mv: 1074, energy: 198, concerto: 67, offtune: 1512 },
    { hitFrame: 39, mv: 2504, energy: 461, concerto: 155, offtune: 3527, forte1: 50 },
  ], ...DRIVE });
/** Converts Sinflame into Purging Flame — declared as real deltas (forte1: -270, forte2:
 *  +100) so they show in the hover trace, but GALBRENA_RESONATOR's own updateBuffs() below first normalizes
 *  each gauge to what these deltas expect to land on 0/100 from (forte gauges have no floor or
 *  ceiling, so a bare relative delta could land short). */
// PLACEHOLDER FRAMES
const AscentOfMalice = galbrenaAction("Skill - Ascent of Malice", { minForte1: 270,
  animFrames: 42, castPriority: 4, cooldown: 60 * 13,
  node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, bullets: [
    { hitFrame: 30, mv: 5157, energy: 738, offtune: 2794 },
    { hitFrame: 30, mv: 5157, energy: 738, offtune: 2794, forte2: 10000 },
  ], castConcerto: 1000, castForte1: -270,
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
const SeraphicExecution1 = galbrenaAction("Forte Basic - Seraphic Execution 1", { requireBuff: DEMON_HYPOSTASIS, animFrames: 24, castPriority: 2, bullets: [{ hitFrame: 20, mv: 5899, energy: 100, concerto: 554, offtune: 2374, forte2: -488 }], node: Node.Forte, cast: Cast.Basic, type: Type.Heavy});
// PLACEHOLDER FRAMES
// Ascent of Malice "Can be followed by Basic Attack - Seraphic Execution Stage 2"; Flamewing Verdict
// Stage 1, the Liberation and the Intro lead into it in Demon Hypostasis too
const SeraphicExecution2 = galbrenaAction("Forte Basic - Seraphic Execution 2", { chains: () => [SeraphicExecution1, AscentOfMalice, FlamewingVerdict1, Liberation, Intro], requireBuff: DEMON_HYPOSTASIS, animFrames: 47, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 37, mv: 2784, energy: 40, concerto: 139, offtune: 1120 },
    { hitFrame: 37, mv: 2784, energy: 40, concerto: 139, offtune: 1120 },
    { hitFrame: 37, mv: 8351, energy: 120, concerto: 417, offtune: 3360, forte2: -976 },
  ]});
// "after casting Basic Attack - Seraphic Execution Stage 5" and Flamewing Verdict Stage 2 & 3 too
// PLACEHOLDER FRAMES
const SeraphicExecution3 = galbrenaAction("Forte Basic - Seraphic Execution 3", { chains: () => [SeraphicExecution2, SeraphicExecution5, FlamewingVerdict2, FlamewingVerdict3], requireBuff: DEMON_HYPOSTASIS, animFrames: 69, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 40, mv: 2432, energy: 34, concerto: 88, offtune: 979 },
    { hitFrame: 40, mv: 2432, energy: 34, concerto: 88, offtune: 979 },
    { hitFrame: 40, mv: 2432, energy: 34, concerto: 88, offtune: 979 },
    { hitFrame: 40, mv: 17021, energy: 232, concerto: 615, offtune: 6849, forte2: -1829 },
  ]});
// PLACEHOLDER FRAMES
const SeraphicExecution4 = galbrenaAction("Forte Basic - Seraphic Execution 4", { chains: [SeraphicExecution3], requireBuff: DEMON_HYPOSTASIS, animFrames: 56, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Echo, bullets: [
    { hitFrame: 42, mv: 1815, energy: 26, concerto: 77, offtune: 731 },
    { hitFrame: 42, mv: 1815, energy: 26, concerto: 77, offtune: 731 },
    { hitFrame: 42, mv: 1815, energy: 26, concerto: 77, offtune: 731 },
    { hitFrame: 42, mv: 12702, energy: 178, concerto: 539, offtune: 5112, forte2: -1341 },
  ], ...DRIVE });
// PLACEHOLDER FRAMES
const SeraphicExecution5 = galbrenaAction("Forte Basic - Seraphic Execution 5", { chains: [SeraphicExecution4], requireBuff: DEMON_HYPOSTASIS, animFrames: 85, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Echo, bullets: [
    { hitFrame: 42, commitFrame: 42, mv: 6728, energy: 93, concerto: 254, offtune: 2708 },
    { hitFrame: 78, commitFrame: 42, mv: 15699, energy: 215, concerto: 592, offtune: 6317, forte2: -1951 },
  ]});

// PLACEHOLDER FRAMES
const FlamewingVerdict1 = galbrenaAction("Forte Heavy - Flamewing Verdict 1", { requireBuff: DEMON_HYPOSTASIS, animFrames: 36, castPriority: 6, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 27, mv: 5922, energy: 87, concerto: 330, offtune: 2383 },
    { hitFrame: 27, mv: 5922, energy: 87, concerto: 330, offtune: 2383, forte2: -976 },
  ]});
// held after the Intro in Demon Hypostasis too
// PLACEHOLDER FRAMES
const FlamewingVerdict2 = galbrenaAction("Forte Heavy - Flamewing Verdict 2", { chains: () => [FlamewingVerdict1, Intro], requireBuff: DEMON_HYPOSTASIS, animFrames: 26, castPriority: 6, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 22, mv: 3835, energy: 61, concerto: 293, offtune: 1543 },
    { hitFrame: 22, mv: 3835, energy: 61, concerto: 293, offtune: 1543, forte2: -732 },
  ]});
// PLACEHOLDER FRAMES
const FlamewingVerdict3 = galbrenaAction("Forte Heavy - Flamewing Verdict 3", { chains: [FlamewingVerdict2], requireBuff: DEMON_HYPOSTASIS, animFrames: 73, castPriority: 6, node: Node.Forte, cast: Cast.Heavy, type: Type.Echo, bullets: [
    { hitFrame: 34, mv: 1769, energy: 25, concerto: 77, offtune: 712 },
    { hitFrame: 34, mv: 1769, energy: 25, concerto: 77, offtune: 712 },
    { hitFrame: 34, mv: 1769, energy: 25, concerto: 77, offtune: 712 },
    { hitFrame: 34, mv: 12377, energy: 174, concerto: 533, offtune: 4981, forte2: -1463 },
  ]});

// leaps into the air like Encroach
// PLACEHOLDER FRAMES
const Ravage = galbrenaAction("Forte Skill - Ravage", { endPosition: Position.Midair, castPriority: 4,
  cooldown: ENCROACH_CD, requireBuff: DEMON_HYPOSTASIS,
  node: Node.Forte, cast: Cast.Skill, type: Type.Heavy, bullets: [
    { hitFrame: 0, mv: 1074, energy: 198, concerto: 67, offtune: 1512 },
    { hitFrame: 0, mv: 2504, energy: 461, concerto: 155, offtune: 3527 },
  ],
  resetForte2: true,
  updateBuffs: () => applyCurrent(BURNING_DRIVE, 1),
});

// PLACEHOLDER FRAMES
const Liberation = galbrenaAction("Liberation - Hellfire Absolution", { castPriority: 10,
  cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Echo, bullets: [
    { hitFrame: 0, mv: 11090, offtune: 8400 },
    { hitFrame: 0, mv: 9074, offtune: 6873 },
    { hitFrame: 0, mv: 9074, offtune: 6873 },
    { hitFrame: 0, mv: 9074, offtune: 6873 },
    { hitFrame: 0, mv: 9074, offtune: 6873 },
    { hitFrame: 0, mv: 9074, offtune: 6873 },
    { hitFrame: 0, mv: 9074, offtune: 6873 },
    { hitFrame: 0, mv: 9074, offtune: 6873 },
    { hitFrame: 0, mv: 9074, offtune: 6873 },
    { hitFrame: 0, mv: 9074, offtune: 6873 },
    { hitFrame: 0, mv: 9074, offtune: 6873 },
    { hitFrame: 0, mv: 9074, offtune: 6873 },
  ], castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => applyCurrent(HELLFIRE_WINDOW, 1),
});

const Intro = galbrenaAction("Intro - Hellflare Overload", { endPosition: Position.Grounded, animFrames: 57, castPriority: 11, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 57, mv: 9412, energy: 1000, offtune: 4208, forte1: 30 }], castConcerto: 1000, ...DRIVE });
/** Unlike most outros, this one deals real damage (795% MV) on top of the handoff concerto
 *  reset; its OFF-FIELD tag still marks it as her leaving the field for lostOnSwap purposes. */
// PLACEHOLDER FRAMES
const Outro = galbrenaAction("Outro - Ashen Pursuit", { cast: Cast.Outro, type: Type.Outro, bullets: [
    { hitFrame: 0, mv: 7950 },
    { hitFrame: 0, mv: 7950 },
    { hitFrame: 0, mv: 7950 },
    { hitFrame: 0, mv: 55650 },
  ], minConcerto: 10000, castConcerto: -10000});

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
const Hellstride = galbrenaAction("Dodge - Hellstride", { castPosition: Position.Grounded, cast: Cast.Dodge, animFrames: 22, castPriority: 6, type: Type.Basic, scaling: Scaling.Fixed, bullets: [{ hitFrame: 5, mv: 66600 }], ...DRIVE });

const GALBRENA_RESONATOR = new Resonator({
  name: "Galbrena",
  stats: [[Stat.BaseHp, 10300], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1112.2202]],
  talent: GALBRENA_TALENTS,
  inherent1: GB_INHERENT_1,
  inherent2: GB_INHERENT_2,
  element: Attribute.Fusion,
  weapon: WeaponType.Pistols,
  dodge: Hellstride,
  color: "#3454ac",
  intro: Intro,
  outro: Outro,
  // Demon Hypostasis replaces Basic Attack with Seraphic Execution; she has no mid-air chain, only the plunge
  swapIn: () => (isHeld(DEMON_HYPOSTASIS) ? SeraphicExecution1 : BA1),
  swapInAir: MA,
  maxEnergy: 12500,
  forteScale: [1, 0.01, 1, 1, 1],
  maxForte1: 270,
  maxForte2: 10000,

  // reacts to *any* team member's own Echo cast, not just her own — see AFTERFLAME's own comment
  updateGlobal: () => {
    if (casting(Cast.Echo) && !isHeld(DEMON_HYPOSTASIS)) applyTeam(AFTERFLAME, 8);
  },

  // Hellstride "does not reset the attack cycles": the press it cut is still the one the next follows
  updateBuffs: () => {
    if (casting(Cast.Dodge)) saveChain(previousPress());
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
  INTRO, HA23, Encroach, MA, BA34,
  AscentOfMalice, Liberation, ECHO,
  SeraphicExecution2345.dodgeCancel(),
  SeraphicExecution345.dodgeCancel(), 
  SeraphicExecution3.instaSwap(),
  OUTRO,
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
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill, Substat.Basic),
  rotation: { 0: GB_ROTATION },
  sequences: GB_SEQUENCES,
});
