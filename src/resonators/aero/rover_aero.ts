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
  forte1,
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

/* ----------------------------------------------------------------------------------- actions */

function roverAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- basics, heavies, mid-air, dodge counter. Basic 3/4 and Dodge Counter are the small
//     Windstring (forte1) sources; the mid-air rows are the plain plunge, not Cloudburst Dance.
const BA1 = roverAction("Basic - Wind Cutter 1", { animFrames: 21, commitFrames: 15, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 35.31, energy: 0.76, concerto: 2.41, offtune: 2408 });
// PLACEHOLDER FRAMES
const BA2 = roverAction("Basic - Wind Cutter 2", { animFrames: 44, commitFrames: 28, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 28, mv: 43.05, energy: 0.92, concerto: 2.94, offtune: 2936 },
    { at: 28, mv: 43.05, energy: 0.92, concerto: 2.94, offtune: 2936 },
  ]});
// PLACEHOLDER FRAMES
const BA3 = roverAction("Basic - Wind Cutter 3", { animFrames: 58, commitFrames: 37, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 37, mv: 55.05, energy: 1.1766, concerto: 3.7558, offtune: 3752.645 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0425, concerto: 0.1358, offtune: 135.6542 },
    { at: 37, mv: 1.99, energy: 0.0434, concerto: 0.135, offtune: 135.6542, forte1: 10 },
  ]});
const BA4 = roverAction("Basic - Wind Cutter 4", { animFrames: 46, commitFrames: 27, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 76.72, energy: 1.64, concerto: 5.24, offtune: 5232, forte1: 10 });
// PLACEHOLDER FRAMES
const HA = roverAction("Heavy - Wind Cutter", { animFrames: 28, commitFrames: 15, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 15, mv: 17.91, energy: 0.39, concerto: 1.23, offtune: 1222 },
    { at: 15, mv: 17.91, energy: 0.39, concerto: 1.23, offtune: 1222 },
    { at: 15, mv: 17.91, energy: 0.39, concerto: 1.23, offtune: 1222 },
  ]});
// PLACEHOLDER FRAMES
const RazorWind = roverAction("Heavy - Razor Wind", { animFrames: 40, commitFrames: 27, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 27, mv: 36.37, energy: 0.7784, concerto: 2.4883, offtune: 2480.6113 },
    { at: 27, mv: 44.46, energy: 0.9516, concerto: 3.0417, offtune: 3032.3887 },
  ]});
const MA = roverAction("Mid-air - Wind Cutter Plunge", { animFrames: 62, commitFrames: 35, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 140.76, energy: 0.52, concerto: 9.6, offtune: 9600 });
// PLACEHOLDER FRAMES
const DC = roverAction("Dodge Counter - Wind Cutter", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 0, mv: 125.43, energy: 2.6779, concerto: 15.7163, offtune: 8551.9804 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0425, concerto: 0.2493, offtune: 135.6808 },
    { at: 0, mv: 1.99, energy: 0.0421, concerto: 0.2505, offtune: 135.6804, forte1: 10 },
  ]});

// --- resonance skill: Awakening Gale on the ground, Skyfall Severance from mid-air, which trades
//     every other element's own Negative Status on the target for a stack of Aero Erosion each
//     (the swap itself lives in the Resonator's updateDebuffs() below)
// PLACEHOLDER FRAMES
const Skill = roverAction("Skill - Awakening Gale", { animFrames: 63, commitFrames: 37, cooldown: 60 * 3, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [{ at: 37, mv: 66.44, energy: 2, offtune: 3021.2 }, { at: 37, mv: 99.66, energy: 3, offtune: 4531.8 }], castConcerto: 10});
/** Strips every other element's Negative Status off the target and pays back a stack of Aero
 *  Erosion per stack removed — capped, as always, by the buff system, so Aeolian Realm's own +3 to
 *  that cap is what decides how much of a big strip actually lands. */
// PLACEHOLDER FRAMES
const SkyfallSeverance = roverAction("Skill - Skyfall Severance", {
  animFrames: 56, commitFrames: 43, cooldown: 60 * 12,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 43, mv: 23.37, energy: 0.336, concerto: 0.6667, offtune: 1066.8913,
      updateDebuffs: () => {
        let removed = 0;
        for (const status of [SPECTRO_FRAZZLE, HAVOC_BANE, FUSION_BURST, GLACIO_CHAFE, ELECTRO_FLARE]) {
          removed += stacksOfEnemy(status);
          revokeEnemy(status);
        }
        if (removed > 0) applyEnemy(AERO_EROSION, removed);
      } },
    { at: 43, mv: 23.37, energy: 0.336, concerto: 0.6667, offtune: 1066.8913 },
    { at: 43, mv: 23.37, energy: 0.336, concerto: 0.6667, offtune: 1066.8913 },
    { at: 43, mv: 105.15, energy: 1.512, concerto: 2.9999, offtune: 4800.3261 },
  ],
});

// --- forte circuit: Cloudburst Dance (a Mid-air Attack considered Resonance Skill DMG, and the
//     main Windstring source), then Unbound Flow, which replaces Awakening Gale at max gauge and
//     spends 60 Windstrings a stage.
const Cloudburst1 = roverAction("Mid-air - Cloudburst Dance 1", { animFrames: 30, commitFrames: 11, node: Node.Forte, cast: Cast.Basic, type: Type.Skill, mv: 128.80, energy: 0.92, concerto: 2.93, offtune: 2928, forte1: 25 });
const Cloudburst2 = roverAction("Mid-air - Cloudburst Dance 2", { animFrames: 28, commitFrames: 10, node: Node.Forte, cast: Cast.Basic, type: Type.Skill, mv: 141.47, energy: 1.01, concerto: 3.22, offtune: 3216, forte1: 25 });
// PLACEHOLDER FRAMES
const UnboundFlow1 = roverAction("Forte Skill - Unbound Flow 1", { animFrames: 113, commitFrames: 53, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 53, mv: 34.3, energy: 2, offtune: 5970, updateDebuffs: () => applyCurrent(HEALS, 1) },
    { at: 53, mv: 34.3, energy: 2, offtune: 5970 },
    { at: 53, mv: 34.3, energy: 2, offtune: 5970 },
    { at: 53, mv: 34.3, energy: 2, offtune: 5970 },
    { at: 53, mv: 34.3, energy: 2, offtune: 5970 },
  ], castConcerto: 20, castForte1: -60});
const UnboundFlow2 = roverAction("Forte Skill - Unbound Flow 2", { animFrames: 37, commitFrames: 15, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, mv: 723.03, energy: 20, castConcerto: 20, offtune: 28288, castForte1: -60});

// --- liberation / intro / outro. Storm's Echo hands the whole team Aeolian Realm (see below).
const Liberation = roverAction("Liberation - Omega Storm", { animFrames: 211, timestop: 211, cooldown: 60 * 24, node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, mv: 536.79, castConcerto: 20, offtune: 48000, resetEnergy: true });
// PLACEHOLDER FRAMES
const Intro = roverAction("Intro - Relentless Squall", { animFrames: 85, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 85, mv: 79.53, energy: 4.0001, offtune: 4586.1153 },
    { at: 85, mv: 119.29, energy: 5.9999, offtune: 6878.8847, forte1: 20 },
  ], castConcerto: 10});
const Outro = roverAction("Outro - Storm's Echo", {
  cast: Cast.Outro, castConcerto: -100,
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
  updateDebuffs: () => { if (currentAction().hits.length > 0) maxStackIncrease(AERO_EROSION, 3); },
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
  color: "#6fd6b0",
  intro: Intro,
  maxEnergy: 150,
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
