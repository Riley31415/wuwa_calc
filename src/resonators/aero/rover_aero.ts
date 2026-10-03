/**
 * Rover: Aero, ported to the new engine — a standard/permanent-banner 5-star
 * (`Tier.Free`), all six sequence nodes folded into the loadout unconditionally,
 * each owning its own trigger. Windstrings (forte1, 0-120) are spent 60 at a time by Unbound Flow,
 * the enhanced Resonance Skill that replaces Awakening Gale at max gauge.
 *
 * MVs off nanoka.cc (character 1406, https://ww.nanoka.cc/character/1406), summed from each
 * skill's own Skill Attributes row; energy/concerto/offtune off the migrated sheet's own ARover
 * rows (offtune x10000 into this engine's units). Rotation is the sheet's own "arover 123".
 * Healing is out of scope for this calculator throughout, so the healer half of the kit — the
 * Cloudburst Dance/Omega Storm heals, Boundless Winds, S2 — only ever shows up as the HEALS
 * marker those casts put up (statuses.ts).
 */
import { Tier, Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  applyEnemy,
  revokeEnemy,
  stacksOfEnemy,
  maxStackIncrease,
  isHeld,
  currentAction,
  onAction,
  runningAction,
  addStat,
  asSource,
} from "../../engine/context.js";
import { Action, Rotation, NOINTRO, ECHO, INTRO } from "../../engine/rotation.js";
import { AERO_EROSION, SPECTRO_FRAZZLE, HAVOC_BANE, FUSION_BURST, GLACIO_CHAFE, ELECTRO_FLARE, HEALS } from "../../shared/status.js";
import { BLOODPACTS_PLEDGE, BLOODPACT_AERO_AMP } from "../../weapons/standard.js";
import { REJUV_5PC, HERON, MOONLIT_CLOUDS_5PC, BELL_BORNE_GEOCHELONE } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { FLEURDELYS, WINDWARD_5PC } from "../../echoes/rinascita.js";
import { tuneBreak, SWORD_BREAK } from "../../shared/tunebreak.js";

/* ----------------------------------------------------------------------------------- actions */

function roverAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- basics, heavies, mid-air, dodge counter. Basic 3/4 and Dodge Counter are the small
//     Windstring (forte1) sources; the mid-air rows are the plain plunge, not Cloudburst Dance.
const BA1 = roverAction("Basic - Wind Cutter 1", { animFrames: 19, bullets: [{ hitFrame: 7, mv: 3531, energy: 76, concerto: 241, offtune: 2408 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
const BA2 = roverAction("Basic - Wind Cutter 2", { animFrames: 44, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 15, mv: 4305, energy: 92, concerto: 294, offtune: 2936 },
    { hitFrame: 31, mv: 4305, energy: 92, concerto: 294, offtune: 2936 },
  ]});
const BA3 = roverAction("Basic - Wind Cutter 3", { animFrames: 56, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 5505, energy: 224, concerto: 715, offtune: 7144, forte1: 10 },
    { hitFrame: 36, mv: 199 },
    { hitFrame: 40, mv: 199 },
    { hitFrame: 44, mv: 199 },
    { hitFrame: 48, mv: 199 },
    { hitFrame: 52, mv: 199 },
    { hitFrame: 56, mv: 199 },
    { hitFrame: 60, mv: 199 },
    { hitFrame: 64, mv: 199 },
    { hitFrame: 68, mv: 199 },
    { hitFrame: 72, mv: 199 },
    { hitFrame: 76, mv: 199 },
    { hitFrame: 80, mv: 199 },
    { hitFrame: 84, mv: 199 },
    { hitFrame: 88, mv: 199 },
    { hitFrame: 92, mv: 199 },
    { hitFrame: 96, mv: 199 },
    { hitFrame: 100, mv: 199 },
    { hitFrame: 104, mv: 199 },
    { hitFrame: 108, mv: 199 },
    { hitFrame: 112, mv: 199 },
    { hitFrame: 116, mv: 199 },
    { hitFrame: 120, mv: 199 },
    { hitFrame: 124, mv: 199 },
    { hitFrame: 128, mv: 199 },
    { hitFrame: 132, mv: 199 },
  ]});
const BA4 = roverAction("Basic - Wind Cutter 4", { animFrames: 44, bullets: [{ hitFrame: 23, mv: 7672, energy: 164, concerto: 524, offtune: 5232, forte1: 10 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
const HA = roverAction("Heavy - Wind Cutter", { animFrames: 31, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 2, mv: 1791, energy: 39, concerto: 123, offtune: 1222 },
    { hitFrame: 11, commitFrame: 2, mv: 1791, energy: 39, concerto: 123, offtune: 1222 },
    { hitFrame: 21, commitFrame: 2, mv: 1791, energy: 39, concerto: 123, offtune: 1222 },
  ]});
const RazorWind = roverAction("Heavy - Razor Wind", { animFrames: 38, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 8, mv: 3637, energy: 78, concerto: 249, offtune: 2481 },
    { hitFrame: 20, mv: 4446, energy: 95, concerto: 304, offtune: 3032 },
  ]});
const MA = roverAction("Mid-air - Wind Cutter Plunge", { animFrames: 50, bullets: [{ hitFrame: 38, mv: 14076, energy: 52, concerto: 960, offtune: 9600 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
// PLACEHOLDER FRAMES
const DC = roverAction("Dodge Counter - Wind Cutter", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 12543, energy: 374, concerto: 1195, offtune: 11944 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199 },
    { hitFrame: 0, mv: 199, forte1: 10 },
  ], castConcerto: 1000});

// --- resonance skill: Awakening Gale on the ground, Skyfall Severance from mid-air, which trades
//     every other element's own Negative Status on the target for a stack of Aero Erosion each
//     (the swap itself is on its bullets, CONVERT_TO_EROSION below)
const Skill = roverAction("Skill - Awakening Gale", { animFrames: 64, cooldown: 60 * 3, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 20, mv: 6644, energy: 200, offtune: 3021 }, { hitFrame: 41, mv: 9966, energy: 300, offtune: 4532 }], castConcerto: 1000});
/** Strips every other element's Negative Status off the target and pays back a stack of Aero
 *  Erosion per stack removed — capped, as always, by the buff system, so Aeolian Realm's own +3 to
 *  that cap is what decides how much of a big strip actually lands. Every hit converts (wuwalab);
 *  past the first there is only what landed in between. */
const CONVERT_TO_EROSION = {
  updateDebuffs: () => {
    let removed = 0;
    for (const status of [SPECTRO_FRAZZLE, HAVOC_BANE, FUSION_BURST, GLACIO_CHAFE, ELECTRO_FLARE]) {
      removed += stacksOfEnemy(status);
      revokeEnemy(status);
    }
    if (removed > 0) applyEnemy(AERO_EROSION, removed);
  },
};
const SkyfallSeverance = roverAction("Skill - Skyfall Severance", {
  animFrames: 56, cooldown: 60 * 12,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 9, mv: 2337, energy: 34, offtune: 1067, ...CONVERT_TO_EROSION },
    { hitFrame: 19, commitFrame: 9, mv: 2337, energy: 34, offtune: 1067, ...CONVERT_TO_EROSION },
    { hitFrame: 28, commitFrame: 9, mv: 2337, energy: 34, offtune: 1067, ...CONVERT_TO_EROSION },
    { hitFrame: 45, mv: 10515, energy: 150, offtune: 4800, ...CONVERT_TO_EROSION },
  ], castConcerto: 500,
});

// --- forte circuit: Cloudburst Dance (a Mid-air Attack considered Resonance Skill DMG, and the
//     main Windstring source), then Unbound Flow, which replaces Awakening Gale at max gauge and
//     spends 60 Windstrings a stage.
const Cloudburst1 = roverAction("Mid-air - Cloudburst Dance 1", { animFrames: 25, bullets: [{ hitFrame: 11, mv: 12880, energy: 92, concerto: 293, offtune: 2928, forte1: 25 }], node: Node.Forte, cast: Cast.Basic, type: Type.Skill});
const Cloudburst2 = roverAction("Mid-air - Cloudburst Dance 2", { animFrames: 27, bullets: [{ hitFrame: 16, mv: 14147, energy: 101, concerto: 322, offtune: 3216, forte1: 25 }], node: Node.Forte, cast: Cast.Basic, type: Type.Skill});
const UnboundFlow1 = roverAction("Forte Skill - Unbound Flow 1", { animFrames: 63, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 6, mv: 3430, energy: 200, offtune: 5970, updateDebuffs: () => applyCurrent(HEALS, 1) },
    { hitFrame: 11, commitFrame: 6, mv: 3430, energy: 200, offtune: 5970 },
    { hitFrame: 17, commitFrame: 6, mv: 3430, energy: 200, offtune: 5970 },
    { hitFrame: 22, commitFrame: 6, mv: 3430, energy: 200, offtune: 5970 },
    { hitFrame: 27, commitFrame: 6, mv: 3430, energy: 200, offtune: 5970 },
  ], castConcerto: 2000, castForte1: -60});
const UnboundFlow2 = roverAction("Forte Skill - Unbound Flow 2", { animFrames: 36, bullets: [{ hitFrame: 12, mv: 72303, energy: 2000, offtune: 28288 }], node: Node.Forte, cast: Cast.Skill, type: Type.Skill, castConcerto: 2000, castForte1: -60});

// --- liberation / intro / outro. Storm's Echo hands the whole team Aeolian Realm (see below).
const Liberation = roverAction("Liberation - Omega Storm", { animFrames: 211, prioFrames: 211, timestop: [0, 211], motionStop: [0, 211], cooldown: 60 * 24, node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 147, mv: 53679, offtune: 48000 }], castConcerto: 2000, resetEnergy: true });
const Intro = roverAction("Intro - Relentless Squall", { prioFrames: 85, motionStop: [0, 30], animFrames: 85, noSwapFrames: 67, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 37, mv: 7953, energy: 400, offtune: 4586 },
    { hitFrame: 56, mv: 11929, energy: 600, offtune: 6879 },
  ], castConcerto: 1000, castForte1: 20});
const Outro = roverAction("Outro - Storm's Echo", {
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => applyTeam(AEOLIAN_REALM, 1),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Sand in the Storm (Inherent Skill): +20% ATK for 10s off the Intro. */
const SAND_IN_THE_STORM = new Buff({
  name: "Inherent: Sand in the Storm",
  duration: 60 * 10,
  stats: [[Stat.BonusAtk, 20]],
});
const AR_INHERENT_1 = new Inherent({
  name: "Inherent: Sand in the Storm",
  grants: [{ on: onAction(Intro), buff: SAND_IN_THE_STORM }],
});
/** Boundless Winds (Inherent Skill): +20% healing off Omega Storm — healing is out of scope, so
 *  this piece is held for the name. */
const AR_INHERENT_2 = new Inherent({ 
  name: "Inherent: Boundless Winds" // 20% healing mv
});

/** Aeolian Realm (Outro): the whole team holds it, 30s, so permanent uptime. Whoever holds it
 *  raises the target's Aero Erosion cap by 3 on their next hit — a 10s window every subsequent
 *  hit refreshes, and explicitly not stackable, so calling it on every hit is right: the engine
 *  only lets one gear raise a given cap once (see `State.enemyMaxSources`). */
const AEOLIAN_REALM = new Buff({
  name: "Aero Rover: Aeolian Realm",
  duration: 60 * 30,
  updateDebuffs: () => { if (currentAction().bullets.length > 0) maxStackIncrease(AERO_EROSION, 3); },
});

/** S4 Boundaries Shatter in an Instant: +15% Resonance Skill DMG Bonus for 5s off Cloudburst
 *  Dance. Trigger lives in AR_S4. */
const S4_SKILL_BONUS = new Buff({
  name: "Aero Rover S4: Boundaries Shatter in an Instant",
  duration: 60 * 5,
  stats: [[Stat.DmgBonus, 15, Type.Skill]],
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as their own always-equipped gear pieces (Tier.Free), each owning its
// own trigger rather than the central Resonator updateBuffs() below.

// S1 Storm Subsides in the Void: interruption resistance only — a genuine no-op, held for the name
const AR_S1 = new Sequence({ name: "Aero Rover S1: Storm Subsides in the Void" });

// S2 Glimmers Fade into the Dark: a heal over time — out of scope, a no-op held for the name
const AR_S2 = new Sequence({ name: "Aero Rover S2: Glimmers Fade into the Dark" });

const AR_S3 = new Sequence({
  name: "Aero Rover S3: Illusions Collapse in a Grip",
  stats: [[Stat.DmgBonus, 15, Attribute.Aero]],
});

const AR_S4 = new Sequence({
  name: "Aero Rover S4: Boundaries Shatter in an Instant",
  updateBuffs: () => {
    if (runningAction(Cloudburst1) || runningAction(Cloudburst2)) applyCurrent(S4_SKILL_BONUS, 1);
  },
});

const AR_S5 = new Sequence({
  name: "Aero Rover S5: Life and Death Intertwine",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 20); },
});

const AR_S6 = new Sequence({
  name: "Aero Rover S6: All Crumble in the Wind",
  applyStats: () => {
    if (runningAction(UnboundFlow1) || runningAction(UnboundFlow2)) addStat(Stat.MulMv, 30);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
const ROVER_AERO_TALENTS = new Talent({
  name: "Aero Rover: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.HealingBonus, 12]],
});

/** Him, as a Resonator: name/element/weapon, every grant/spend/queue rule his kit needs, and his
 *  own base stat line. `Tier.Free` — see the file header. */
export const ROVER_AERO_RESONATOR = new Resonator({
  name: "Aero Rover",
  stats: [[Stat.BaseHp, 10775], [Stat.BaseAtk, 437.5], [Stat.BaseDef, 1136.6646]],
  talent: ROVER_AERO_TALENTS,
  inherent1: AR_INHERENT_1,
  inherent2: AR_INHERENT_2,
  element: Attribute.Aero,
  weapon: WeaponType.Sword,
  tuneBreak: tuneBreak(90, [0, 91], [0, 70], SWORD_BREAK),
  color: "#6fd6b0",
  intro: Intro,
  maxEnergy: 15000,
  maxForte1: 120,
  tier: Tier.Free,

  updateDebuffs: () => {
    // her own healing marker, read by every healing sonata and weapon (statuses.ts) — applied to the
    // healer alone; Unbound Flow 1's is its first hit's
    if (runningAction(Cloudburst1) || runningAction(Cloudburst2) || runningAction(UnboundFlow2) || runningAction(Liberation)) applyCurrent(HEALS, 1);
  },

  // Bloodpact's Pledge names Unbound Flow outright, so that clause's team Aero Amplification is
  // triggered from here rather than from the weapon — see the weapon's own comment for why
  updateBuffs: () => {
    // the held rank's own amp — the five refinements and their amp buffs line up by index
    const rank = BLOODPACTS_PLEDGE.findIndex((w) => isHeld(w));
    if (!(runningAction(UnboundFlow1) || runningAction(UnboundFlow2)) || rank < 0) return;
    // the clause is the weapon's, only its trigger lives here, so the amp files under the weapon
    // rather than under this kit — otherwise the sword's own hover never shows what it pays
    asSource(BLOODPACTS_PLEDGE[rank]!, () => applyTeam(BLOODPACT_AERO_AMP[rank]!, 1));
  },

});

// the migrated sheet's own "arover 123": two Awakening Gale into Cloudburst Dance cycles bank the
// 120 Windstrings both Unbound Flow stages spend, with Liberation and the echo in between. He's
// never the team's own lead, so this covers opener and loop both.

const AR_ROTATION = new Rotation([
  NOINTRO, Skill,
  INTRO, SkyfallSeverance, Cloudburst1, Cloudburst2, MA, BA4,
  ECHO.instaDodge(),
  Liberation,
  Skill, Cloudburst1, Cloudburst2, MA, BA4,
  UnboundFlow1, UnboundFlow2.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// his real build: resonator + talents + both Inherent Skills + every sequence node
// (Tier.Free — see file header), weapon, mainslot echo, sonata pieces, mainstat/substat.
// Bloodpact's Pledge is the only weapon listed: its own Unbound Flow clause is written for him.
export const ROVER_AERO = new Loadout({
  resonator: ROVER_AERO_RESONATOR,
  weapons: [BLOODPACTS_PLEDGE[4]!], // the craftable at its real R5, the one rank they are ever run at
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, REJUV_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(FLEURDELYS, WINDWARD_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.Skill, Substat.AtkPct, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Skill, Substat.AtkPct, Substat.FlatAtk, Substat.Liberation),
    rotation: AR_ROTATION,
  sequences: [AR_S1, AR_S2, AR_S3, AR_S4, AR_S5, AR_S6],
});
