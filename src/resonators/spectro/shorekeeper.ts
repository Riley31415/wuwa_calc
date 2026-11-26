/**
 * Shorekeeper, ported to the new engine. Her damage barely matters; the Stellarealm is what she's
 * for, giving the team crit rate then crit damage scaled off her own energy regen.
 *
 * The realm's life: End Loop *generates* the Outer Stellarealm — a new one replaces whatever is
 * standing rather than evolving it — every Intro anyone casts inside it steps it a stage (modelled
 * on the outro that hands the field over), and Discernment, her replacement Intro at Supernal,
 * ends it — or, with S1, leaves it standing for her own next End Loop to replace.
 *
 * Numbers from nanoka.cc (character 1505); Base DEF (1100) confirmed there directly, since the
 * migrated sheet this was ported from didn't carry it. Her resonance chain is below the buffs.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, Position, Input } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyTeam,
  applyCurrent,
  addBuff,
  revokeBuff,
  stacksOfTeam,
  runningAction,
  currentTeam,
  isHeld,
  revokeTeam,
  addStat, addGain as addResource,
  casting,
  queue,
  revokeCurrent,
  handoffPending,
  applyOn,
  notAfter,
  after,
  midair,
  forte1,
  holds,
  concerto,
  grounded,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, START_LAST, SWAPIN, SUCCESSFUL_DODGE } from "../../engine/rotation.js";
import { HEALS, heal } from "../status.js";
import { STELLAR_SYMPHONY } from "../../weapons/rectifier.js";
import { VARIATION } from "../../weapons/standard.js";
import { REJUV_5PC, FALLACY } from "../../echoes/jinzhou.js";
import { FALLACY_MAINSLOT } from "../../echoes/jinzhou.js";
import { mainstats, Mainstat } from "../../echoes/mainstats.js";
import { Echoes } from "../../echoes/echoes.js";
import { substats, highSubs, Substat } from "../../echoes/substats.js";
import { SPACETREK_EXPLORER_MAINSLOT, STARRY_RADIANCE_5PC, SPACETREK_EXPLORER } from "../../echoes/lahairoi.js";
import { FORMRENDER_MAINSLOT, TINGED_YEARNING_5PC, FORMRENDER } from "../../echoes/mengzhou.js";
import { JINGRAN_RESONATOR } from "../fusion/jingran.js";
import { JINHSI_RESONATOR } from "./jinhsi.js";
import { SUOMING_RESONATOR } from "../electro/suoming.js";
import { HSIN_RESONATOR } from "../electro/hsin.js";

/* ----------------------------------------------------------------------------------- actions */

function skAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

/** The realm, a team-wide buff a stage: Outer (heals only, no stat), Inner (+12.5% Crit Rate),
 *  Supernal (also +25% Crit Dmg). Evolves on any outro — each stage hands over to the next, and
 *  Supernal is refreshed — and ends only when Discernment plays (see SHOREKEEPER_RESONATOR's own
 *  updateBuffs() below). `realmStage()` is which one stands, 1-3, or 0 for none. */
function stellarealm(stage: string, next: (() => Buff) | null, stats: [Stat, number][]): Buff {
  const self: Buff = new Buff({
    name: `Shorekeeper: ${stage} Stellarealm`, duration: 60 * 30, stats,
    updateBuffs: () => {
      if (!casting(Cast.Outro)) return;
      if (next) {
        revokeTeam(self);
        applyTeam(next(), 1);
      } else applyTeam(self, 1);
    },
  });
  return self;
}
const SUPERNAL_REALM = stellarealm("Supernal", null, [[Stat.CritRate, 12.5], [Stat.CritDmg, 25]]);
const INNER_REALM = stellarealm("Inner", () => SUPERNAL_REALM, [[Stat.CritRate, 12.5]]);
const OUTER_REALM = stellarealm("Outer", () => INNER_REALM, []);
const REALMS = [OUTER_REALM, INNER_REALM, SUPERNAL_REALM];
const realmStage = (): number => REALMS.findIndex((realm) => stacksOfTeam(realm) > 0) + 1;

/** The realm's heal, "once every 3s" while any stage stands (wuwalab's on-field Stellarealm heal):
 *  the first on End Loop's cast, then this clock, which stops itself the first tick it finds none. */
const REALM_HEALS: Buff = new Buff({
  name: "Shorekeeper: Stellarealm (heals)",
  tickOwner: () => SHOREKEEPER_RESONATOR,
  tick: {
    every: 60 * 3,
    fire: () => {
      if (!realmStage()) {
        revokeTeam(REALM_HEALS);
        return;
      }
      applyOn(SHOREKEEPER_RESONATOR, heal);
    },
  },
});

/** A Collapsed Core run out (6s on) or one past five: a butterfly firing on its own behind the fight. */
const Butterfly = skAction("Forte - Flare Star Butterfly", { node: Node.Forte, type: Type.Basic, bullets: [
    { hitFrame: 36, commitFrame: 0, mv: 3729, energy: 59, concerto: 100 },
  ]});

/** Collapsed Cores: five slots, each its own 6s clock, so every core keeps the time it was made. */
const CORES: Buff[] = [1, 2, 3, 4, 5].map((n) => {
  const core: Buff = new Buff({
    name: `Collapsed Core ${n}`,
    duration: 60 * 6,
    // its butterfly, on the frame the duration runs out
    tick: { every: 60 * 6, fire: () => queue(Butterfly) },
  });
  return core;
});

// Illation/Transmutation turn every core at once, the k-th riding wuwalab's k-th butterfly frame
const CONSUMED_STARS = [42, 45, 48, 53, 56].map((hitFrame, k) => skAction(`Forte - Flare Star Butterfly ${k + 1}`, { node: Node.Forte, type: Type.Basic, bullets: [
    { hitFrame, commitFrame: 0, mv: 3729, energy: 59, concerto: 100 },
  ]}));

// queued from the forte press's cast, so each is cast on its frame 0, one per core held
const turnCores = (): void => {
  const held = CORES.filter((core) => isHeld(core));
  held.forEach((core, k) => {
    queue(CONSUMED_STARS[k]!);
    revokeCurrent(core);
  });
};

// a core at each of wuwalab's generate_collapsed_core events; with five already held, a butterfly instead
const collapseCore = (): void => {
  const free = CORES.find((core) => !isHeld(core));
  if (free) applyCurrent(free, 1);
  else queue(Butterfly);
};

// Empirical Data (forte1): 1 a stage (2 on Stage 3), capped at 5; Illation/Transmutation spend it whole.
const BA1 = skAction("Basic - Origin Calculus 1", { input: Input.Basic, position: Position.Grounded, animFrames: 23, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, element: null, type: null, subtype: null, updateDebuffs: collapseCore }, // its core, on the cast
    { hitFrame: 15, mv: 3178, energy: 50, concerto: 160, offtune: 2664, forte1: 1 },
  ]});

const DC = skAction("Dodge Counter - Origin Calculus", { input: Input.Basic, after: [SUCCESSFUL_DODGE], animFrames: 33, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 8748, energy: 138, concerto: 440, offtune: 4400, forte1: 1, updateDebuffs: collapseCore },
    { hitFrame: 20, mv: 8748, energy: 138, concerto: 440, offtune: 4400, updateDebuffs: collapseCore },
  ], castConcerto: 1000});

// at 5 Empirical Data the Mid-air Attack comes out as Transmutation instead
const MA = skAction("Mid-air - Origin Calculus Plunge", { input: Input.Basic, position: Position.Midair, maxForte1: 4, endPosition: Position.Grounded, animFrames: 50, animPriority: { 0: 6, 50: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 46, mv: 7396, energy: 155, concerto: 500, offtune: 4960, forte1: 1, updateDebuffs: collapseCore },
  ]});

const Skill = skAction("Skill - Chaos Theory", { input: Input.Skill, animFrames: 39, animPriority: { 0: 4, 39: 2 }, castPriority: 5, cooldown: 60 * 16, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 16, element: null, type: null, subtype: null, updateDebuffs: () => applyCurrent(HEALS, 1) }, // its heal, ahead of the hits
    { hitFrame: 55, commitFrame: 17, mv: 3131, energy: 200, concerto: 200, offtune: 1050 },
    { hitFrame: 57, commitFrame: 17, mv: 3131, energy: 200, concerto: 200, offtune: 1050 },
    { hitFrame: 60, commitFrame: 17, mv: 3131, energy: 200, concerto: 200, offtune: 1050 },
    { hitFrame: 62, commitFrame: 17, mv: 3131, energy: 200, concerto: 200, offtune: 1050 },
    { hitFrame: 65, commitFrame: 17, mv: 3131, energy: 200, concerto: 200, offtune: 1050 },
  ], castConcerto: 2000});

// both spend all 5 Empirical Data and turn every core into a butterfly (CONSUMED_STARS)
const Illation = skAction("Forte Heavy - Illation", { input: Input.BasicHold, minForte1: 5, animFrames: 48, animPriority: { 0: 4 }, castPriority: 4, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 22, commitFrame: 5, mv: 1897, energy: 40, offtune: 1272 },
    { hitFrame: 34, commitFrame: 5, mv: 1897, energy: 40, offtune: 1272 },
    { hitFrame: 46, commitFrame: 5, mv: 1897, energy: 40, offtune: 1272 },
    { hitFrame: 58, commitFrame: 5, mv: 1897, energy: 40, offtune: 1272 },
    { hitFrame: 64, commitFrame: 5, mv: 1897, energy: 40, offtune: 1272 },
  ], castConcerto: 600, castForte1: -5, updateBuffs: turnCores});

const Transmutation = skAction("Forte Mid-air - Transmutation", { input: Input.Basic, position: Position.Midair, minForte1: 5, endPosition: Position.Grounded, animFrames: 50, animPriority: { 0: 6, 50: 2 }, castPriority: 6, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 46, mv: 7396, energy: 155, concerto: 500, offtune: 4960 },
  ], castConcerto: 600, castForte1: -5, updateBuffs: turnCores});
// after the Plunging Attack, Transmutation or Chaos Theory, Basic Attack starts at Stage 2
const BA2 = skAction("Basic - Origin Calculus 2", { input: Input.Basic, inputPriority: 1, after: [BA1, MA, Transmutation, Skill], position: Position.Grounded, animFrames: 33, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 2386, energy: 38, concerto: 120, offtune: 2000, forte1: 1, updateDebuffs: collapseCore },
    { hitFrame: 20, mv: 2386, energy: 38, concerto: 120, offtune: 2000, updateDebuffs: collapseCore },
  ]});
const BA3 = skAction("Basic - Origin Calculus 3", { input: Input.Basic, inputPriority: 1, after: [BA2], animFrames: 47, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 20, mv: 2332, energy: 37, concerto: 118, offtune: 1955, updateDebuffs: collapseCore },
    { hitFrame: 29, commitFrame: 20, mv: 2332, energy: 37, concerto: 118, offtune: 1955, forte1: 1 },
    { hitFrame: 38, commitFrame: 20, mv: 2332, energy: 37, concerto: 118, offtune: 1955, forte1: 1 },
  ]});
const BA4 = skAction("Basic - Origin Calculus 4", { input: Input.Basic, inputPriority: 1, after: [BA3], animFrames: 51, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 25, mv: 7272, energy: 115, concerto: 366, offtune: 6096, forte1: 1, updateDebuffs: collapseCore },
  ]});

// one-press groups: the report folds the butterflies each queues into its row, a plain row with none
const FHA = new ActionGroup("Forte Heavy - Illation", [Illation]);
const FMA = new ActionGroup("Forte Mid-air - Transmutation", [Transmutation]);

const Liberation = skAction("Liberation - End Loop", {
  input: Input.Liberation, animFrames: 207, castPriority: 10, timestop: [0, 207], motionStop: [0, 207], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, castConcerto: 2000, castEnergy: -17500,
  // "Generate the Outer Stellarealm": a cast puts up a *new* realm rather than stepping the one
  // already standing, so whatever stage is up is replaced by Outer — which is what puts the realm
  // S1 carried through Discernment back at the bottom.
  updateBuffs: () => {
    for (const realm of REALMS) revokeTeam(realm);
    applyTeam(OUTER_REALM, 1);
    // a new realm restarts the heal clock
    revokeTeam(REALM_HEALS);
    applyTeam(REALM_HEALS, 1);
  },
});

const Intro = skAction("Intro - Enlightenment", { input: Input.Intro, endPosition: Position.Grounded, qteFrames: 40, animFrames: 85, noSwapFrames: 65, animPriority: { 85: 2 }, castPriority: 10, motionStop: [6, 34], node: Node.Intro, cast: Cast.Intro, type: Type.Skill, bullets: [
    { hitFrame: 38, element: null, type: null, subtype: null, updateDebuffs: () => applyCurrent(HEALS, 1) }, // its heal, ahead of the hits
    { hitFrame: 83, commitFrame: 44, mv: 4530, energy: 200, concerto: 200, offtune: 2279 },
    { hitFrame: 85, commitFrame: 44, mv: 4530, energy: 200, concerto: 200, offtune: 2279 },
    { hitFrame: 87, commitFrame: 44, mv: 4530, energy: 200, concerto: 200, offtune: 2279 },
    { hitFrame: 90, commitFrame: 44, mv: 4530, energy: 200, concerto: 200, offtune: 2279 },
    { hitFrame: 92, commitFrame: 44, mv: 4530, energy: 200, concerto: 200, offtune: 2279 },
  ], castConcerto: 1000});
// replaces plain Intro under a Supernal Stellarealm (see SHOREKEEPER_RESONATOR's own intro() below); scales
// off HP, counts as liberation damage, always crits, and ends the realm on resolving
// Her Intro is Discernment once the Stellarealm stands at its third stage. No rotation plans it a stage early
// (Inner standing, its Outro still to lift it): every run reads Supernal already held there.
const EIntro = skAction("Intro - Discernment", { endPosition: Position.Grounded, qteFrames: 142,
  // "When a Supernal Stellarealm is generated, Shorekeeper's first Intro Skill ... is replaced"
  input: Input.Intro, inputPriority: 1, holds: SUPERNAL_REALM, animFrames: 215, castPriority: 10, timestop: [6, 140], motionStop: [6, 140],
  node: Node.Intro, cast: Cast.Intro, type: Type.Liberation, scaling: Scaling.Hp, bullets: [
    { hitFrame: 143, mv: 1964, energy: 334, offtune: 24414 },
    { hitFrame: 144, element: null, type: null, subtype: null, updateDebuffs: () => applyCurrent(HEALS, 1) }, // its heal, a frame behind
    { hitFrame: 155, commitFrame: 143, mv: 1964, energy: 334, offtune: 24414 },
    { hitFrame: 167, commitFrame: 143, mv: 1964, energy: 334, offtune: 24414 },
  ], castConcerto: 2000,
  applyStats: () => { addStat(Stat.CritRate, 100); },
  updateBuffs: () => {
    // One Discernment per Supernal realm generated (its own text), with nothing here to enforce
    // it: her End Loop stands between any two of her Intros and puts a fresh Outer realm up, so
    // the stage alone can never still read Supernal by the time she arrives again.
    // S1: "Casting Intro Skill Discernment no longer ends the existing Stellarealm" — so the realm
    // stands as it is (Supernal, until her next End Loop replaces it) and Rover keeps the Self
    // Gravitation that only ever falls off with it
    if (isHeld(SK_S1)) return;
    for (const realm of REALMS) revokeTeam(realm);
    // doesn't fall off Rover on its own just because the realm ends
    const rover = currentTeam().slots.find((s) => s.resonator?.name.includes("Rover"))?.resonator;
    if (rover) revokeBuff(rover, SK_ROVER_GRAVITATION);
  },
});

/** Puts Binary Butterfly on the team, so amplification starts with whoever she hands the field to. */
const Outro = skAction("Outro - Binary Butterfly", {
  animFrames: 0,
  cast: Cast.Outro, input: Input.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => applyTeam(SK_OUTRO, 1),
});

/* ------------------------------------------------------------------------------------ buffs */


/** Team-wide amplification her outro puts up — permanent uptime once granted, not a handoff. */
const SK_OUTRO = new Buff({
  name: "Shorekeeper: Outro",
  duration: 60 * 30,
  stats: [[Stat.Amp, 15]],
});

/** Self Gravitation's own extension onto Rover — lives on Rover's own local stack (granted via
 *  addBuff(), see SK_INHERENT_2 below) so the ER still traces to Shorekeeper on Rover's own row. */
const SK_ROVER_GRAVITATION = new Buff({
  name: "Inherent: Self Gravitation",
  applyStats: () => { if (realmStage()) addStat(Stat.ER, 10); },
});

/** Self Gravitation (Inherent Skill): +10% ER while inside a Stellarealm — assumed always true
 *  once one is up. Also extends to any teammate whose name contains "Rover", via updateGlobal()
 *  so it reaches their turn from turn one regardless of team order. */
const SK_INHERENT_2 = new Inherent({
  name: "Inherent: Self Gravitation",
  applyStats: () => {
    if (realmStage()) addStat(Stat.ER, 10);
  },
  updateGlobal: () => {
    // gated on the realm being up, not unconditional — otherwise this would re-grant Rover's
    // copy right back after SHOREKEEPER_RESONATOR's own updateBuffs() revokes it on EIntro
    if (!realmStage()) return;
    const rover = currentTeam().slots.find((s) => s.resonator?.name.includes("Rover"))?.resonator;
    if (rover) addBuff(rover, SK_ROVER_GRAVITATION);
  },
});

const SK_INHERENT_1 = new Inherent({ name: "Inherent: Life Entwined" });
 // revive

/* --------------------------------------------------------------------------- resonance chain */

/** S1: the range and the +10s reach nothing this calculator computes. What does is its third
 *  clause — Discernment no longer ends the Stellarealm, read by EIntro above. */
const SK_S1 = new Sequence({ name: "Shorekeeper S1: Unspoken Conjecture" });

/** S2: on the *Outer* realm, and every stage above it "has all the effects of the Outer" — so it
 *  pays whenever any realm stands. Team-wide, so it cannot live on the node itself (a Sequence is
 *  gear on her own slot and its stats reach only her turns): the node mirrors the realm onto a
 *  buff of the team's, put up and taken down with it from updateGlobal, which runs whoever acts. */
const SK_S2_TEAM = new Buff({
  name: "Shorekeeper S2: Night's Gift and Refusal",
  stats: [[Stat.BonusAtk, 40]],
});

const SK_S2 = new Sequence({
  name: "Shorekeeper S2: Night's Gift and Refusal",
  updateGlobal: () => {
    if (realmStage()) applyTeam(SK_S2_TEAM, 1);
    else revokeTeam(SK_S2_TEAM);
  },
});

const SK_S3 = new Sequence({
  name: "Shorekeeper S3: Infinity Awaits Me",
  updateBuffs: () => { if (runningAction(Liberation)) addResource({ concerto: 2000 }); },
});

/** S4: Healing Bonus is out of this calculator's formula, so this is tracked for completeness the
 *  way her talents' own 12% is. Named Overflowing Quietude, which is a chain node and not the
 *  Inherent Skill an older comment on Chaos Theory called it. */
const SK_S4 = new Sequence({
  name: "Shorekeeper S4: Overflowing Quietude",
  applyStats: () => { if (runningAction(Skill)) addStat(Stat.HealingBonus, 70); },
});

/** S5: two pull ranges. Nothing here has a range, so this is held for its name alone. */
const SK_S5 = new Sequence({ name: "Shorekeeper S5: Echoes in Silence" });

const SK_S6 = new Sequence({
  name: "Shorekeeper S6: To the New World",
  applyStats: () => { if (runningAction(EIntro)) { addStat(Stat.MulMv, 42); addStat(Stat.CritDmg, 500); } },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const SHOREKEEPER_TALENTS = new Talent({
  name: "Shorekeeper: Talents",
  stats: [
    [Stat.BonusHp, 11.9999997],
    [Stat.HealingBonus, 12], // stat-tree Healing Bonus+ nodes — unused by the formula
  ],
});

const SHOREKEEPER_RESONATOR = new Resonator({
  id: 1505,
  name: "Shorekeeper",
  stats: [[Stat.BaseHp, 16712.5], [Stat.BaseAtk, 287.5], [Stat.BaseDef, 1099.998]],
  talent: SHOREKEEPER_TALENTS,
  inherent1: SK_INHERENT_1,
  inherent2: SK_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Rectifier,
  color: "#728cf3",
  actions: [BA1, BA1.swapIn(), BA2, BA3, BA4, DC, MA, MA.swapIn(), Skill, Illation, Transmutation, Liberation, Intro, EIntro, Outro],
  maxEnergy: 17500,
  maxForte1: 5,
  // reads the realm as it stands, already stepped by the preceding outro

  updateBuffs: () => {
    // her healing marker, on the healer alone: the realm's first heal on End Loop's cast (it lands no
    // hit; REALM_HEALS ticks the rest); Chaos Theory's and both Intros' are 0-MV bullets
    if (runningAction(Liberation)) applyCurrent(HEALS, 1);
  },

});

// INTRO resolves to plain Intro or Discernment on its own — same marker for opener and loop.
// The loop is shorter than the opener; it generates just over the 100 concerto the outro spends.
// SWAPIN ROTATIONS DO NOT HAVE AN INTRO

const BA1234 = new ActionGroup("Basic - Origin Calculus 1234", [BA1, BA2, BA3, BA4]);
const BA123 = new ActionGroup("Basic - Origin Calculus 123", [BA1, BA2, BA3]);
const BA23 = new ActionGroup("Basic - Origin Calculus 23", [BA2, BA3]);
const BA12 = new ActionGroup("Basic - Origin Calculus 12", [BA1, BA2]);

/* How both rotations are optimized (src/explorer/sksearch.ts, `npx tsc && node dist/src/explorer/sksearch.js`):
 * - every string is played through the engine at the default delays in a duo, Lily standing in for the team
 * - an opener starts on Basic 1, a loop on her Intro; the Liberation goes in once, the echoes right before it
 *   or as the swap, and the string runs to an Outro, which needs her 100 Concerto
 * - cuts (no mash cancels): into Illation a hold, or a cancel or insta cut no earlier than the hold would let go; into the
 *   Skill or the Liberation a cancel; Illation's own an insta cut (an insta jump into a plunge); a jump into
 *   a plunge or Transmutation; Basic 1 played out or dodged into; the Liberation played out
 * - a string is dropped where a press is cast outside its condition (forte read off her bar, not counted)
 * - of two strings ending on the same press, one is dropped only where the other is no later and no worse on
 *   Concerto landed, in hand as the last press is cast, and still to land past it (carried over a swap)
 * - a loop must leave the forte it arrived with, and is played twice so it also stands behind itself */

/** The fastest loop:
 *  1. of the 200 fastest openers leaving exactly 1 forte, take the one carrying the most Concerto into the
 *     next Intro (its last Illation's butterflies landing after the swap; the faster one on a tie)
 *  2. search the fastest steady loop behind it
 *  3. try that loop behind each of those openers: the fastest it plays behind as fast is the opener here */
const SK_LOOP = new Rotation([
  SWAPIN,
  BA12.cancel(), FALLACY.instaCancel(), SPACETREK_EXPLORER.instaCancel(), FORMRENDER.instaCancel(), Liberation,
  BA123.jumpCancel(), FMA, BA23.cancel(), Skill, BA2.holdCancel(), FHA.instaJump(), MA.instaSwap(), Outro,

  Intro, EIntro,
  BA12.cancel(), Skill.cancel(), FALLACY.instaCancel(), SPACETREK_EXPLORER.instaCancel(), FORMRENDER.instaCancel(), Liberation,
  // Illation's butterflies land after the swap, into the next Intro's Concerto
  BA12.holdCancel(), FHA.instaJump(), MA.instaSwap(), Outro,

  // a first arrival with no opener before it carries no forte in: Basic 3 makes up the 1
  Intro.firstIntro(),
  BA123.cancel(), Skill.cancel(), FALLACY.instaCancel(), SPACETREK_EXPLORER.instaCancel(), FORMRENDER.instaCancel(), Liberation,
  BA12.holdCancel(), FHA.instaJump(), MA.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const SHOREKEEPER = new Loadout({
  id: 15051,
  // her kit scales off Energy Regen: 240% on the character screen at least
  minEr: 240,
  resonator: SHOREKEEPER_RESONATOR,
  weapons: [STELLAR_SYMPHONY, VARIATION],
  echoes: new Echoes({
    sets: [
    new EchoLoadout(FALLACY_MAINSLOT, REJUV_5PC),
    // worn for Spacetrek's shield, which Jingran's Trace the Vestige feeds on; Tinged Yearning for a Unison
    new EchoLoadout(SPACETREK_EXPLORER_MAINSLOT, STARRY_RADIANCE_5PC).requires(JINGRAN_RESONATOR),
    new EchoLoadout(FORMRENDER_MAINSLOT, TINGED_YEARNING_5PC).requires(JINHSI_RESONATOR, SUOMING_RESONATOR, HSIN_RESONATOR),
    //new EchoLoadout(BELL_BORNE_GEOCHELONE_MAINSLOT, MOONLIT_CLOUDS_5PC),
    //new EchoLoadout(HERON_MAINSLOT, MOONLIT_CLOUDS_5PC),
  ],
    mainstats: [mainstats(Mainstat.HP4, Mainstat.ER3, Mainstat.ER3, Mainstat.HP1, Mainstat.HP1)],
    substats: substats(Substat.Er, Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.HpPct, Substat.Heavy),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.Liberation, Substat.HpPct, Substat.Heavy, Substat.Basic),
  }),
  sequences: [SK_S1, SK_S2, SK_S3, SK_S4, SK_S5, SK_S6],
    // S3 loop disabled for now: it drops a whole Basic line and cuts her Intro chain to one press,
    // which costs her ~7.2 Energy a window and half of that to whoever she is standing in front of
    // — enough to put twelve teams' Liberations out of reach. Re-point this at SK_LOOP_S3 once that
    // rotation is settled.
    // TEMPORARY: the 1f rotations on view (SK_OPENER_PERFECT the other); back to SK_LOOP after
    rotation: SK_LOOP,
});

/** Her presses, for the rotation explorer (src/explorer/), which writes rotations out of them. */
export const SHOREKEEPER_PRESSES = { BA1, BA2, BA3, BA4, MA, Skill, FHA, FMA, Liberation, Outro, Intro, EIntro, BA123, BA23, BA12 };
