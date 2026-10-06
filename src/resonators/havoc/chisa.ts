/**
 * Chisa, ported to the new engine — a Havoc Broadblade hybrid: healer/shielder on her basics and
 * Liberation, Resonance-Liberation-tagged burst on her forte circuit's Sawring Blitz/Eradication
 * chain.
 *
 * Every distinct combo piece wuwalab lists gets its own Action below, even the ones this file's own
 * rotation never plays — Mornye's file already does this (MA/DC defined, unused) and CLAUDE.md wants
 * the kit modelled in full regardless of which single path a rotation walks. Left out entirely, each
 * for its own reason:
 * - the mid-air Rending Lunge, and the "auto" Death Snip With Spread — wuwalab gives them the exact
 *   same MV/energy/concerto/forte numbers as their ground/manual twins, so they're the same Action
 *   under a different input, not a separate move
 * - Sequences 1-6 are modelled from nanoka's released 3.7.0 data — see their own block below
 * - a generic "Tune Break Skill" entry every wuwalab character export carries — her weakness_mastery
 *   is 0 (confirmed against nanoka), so unlike the tune-break-era cast (Mornye, Lucy, ...) this isn't
 *   really *her* kit, the same call rover_havoc.ts already makes
 * - Dodge Counter - Eye of Unraveling: Retraction (one of the four ways to apply Unseen Snare) and
 *   simply locking onto a target (a second) — neither has a wuwalab entry to read numbers off, and
 *   nothing here fabricates a forte/MV value
 *
 * Her forte gauge is a single "Ring of Chainsaw": basics/Heavy/Skill hits, her Intro and her
 * Liberation all fill it (capped 100 in-game, no cap enforced here per CLAUDE.md); once full, her
 * Skill is replaced by Serrated Loop, which sends her into Chainsaw Mode and unlocks Sawring
 * Blitz 1/2/3 and Sawring Eradication — Blitz spends the same Ring back down, and every point it
 * spends also banks onto a second counter (modelled as RING_CONSUMED below, since — unlike the
 * gauge itself — Eradication actually *reads* this one to scale its own hit, capped 100) that
 * Eradication converts into its own MV bonus (+2.59% a point at max rank) before consuming both.
 * Stage 2 is reachable four ways (tap, Dodge Counter, After Plunge, and each of those held) and
 * Stage 3 two; every input wuwalab lists has its own Action below, even where the numbers are the
 * tap's exactly. A *released* stage can follow up with a trailing burst — Discordance off Stage 2,
 * Falltone off Stage 3 — written in the rotation as its own chain (`Blitz2D`, `Blitz3F`). A Hold
 * chains into the next stage instead and throws none.
 *
 * Every hit of her Skill (Eye of Unraveling) and Serrated Loop marks the target with Unseen Snare;
 * while marked, any Resonator's direct hit — hers or a teammate's — inflicts a stack of her Havoc
 * Bane (statuses.ts), off the enemy marker's own updateDebuffs so a teammate's hit counts too. Her
 * Outro (Unraveling - Law Zero) hands the *team* Resonant Thread of Closure for 20s. While it's up,
 * any hit landing (anyone's) raises every
 * Negative Status/Electro Rage debuff's cap +3 — this engine's maxStackIncrease() only ever raises a
 * cap for the rest of the fight, so the in-game "for 15s, unstackable" window collapses to "raised
 * once conditions first arise and never lowered again," the closest this engine can get rather than
 * a made-up temporary cap; and each holder who inflicts a Negative Status or deals its DMG gains
 * Thread of Bane (+18% DEF Ignore vs a Snared target, 15s) — Chisa included, off-field, when her
 * Snare's Bane lands on an ally's hit.
 *
 * Two mechanics carry no stat and are left out entirely: Inescapable Fate (Inherent 1, a Skill-
 * cooldown reset off an ally's kill) and the second half of All Ends Here (Inherent 2's own on-kill
 * "Sight of Unraveling" chain) — both keyed off a "target defeated" event this engine has no hook
 * for, same as Lucy's Function Cracking. Lifethread - Jetstream/Glide and Chainsaw Fever are pure
 * positioning/uptime-gating tools with no stat of their own, so they are not modelled either.
 *
 * MVs and energy/concerto/forte off wuwalab.com's per-hit data (this project's usual fallback for
 * forte gauges nanoka doesn't expose), cross-checked hit-for-hit against nanoka.cc (character 1508)
 * at level 10 — both agree everywhere they overlap. weakness_mastery is 0: unlike the tune-break
 * era's resonators, she carries no flat Tbb of her own.
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling, Position } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Debuff, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  isType,
  addStat,
  appliedByMe,
  applyCurrent,
  applyTeam,
  addBuff,
  currentCast,
  currentHit,
  runningAction,
  revokeCurrent,
  frozenStacks,
  applyEnemy,
  isHeld,
  queue,
  stacksOfEnemy,
  stacksOfTeam,
  maxStackIncrease,
  runningAnyOf,
  currentTeam,
  currentFrame,
  runningBullet,
} from "../../engine/context.js";
import { Action, ActionGroup, Rotation, NOINTRO, ECHO, ActionTag, INTRO, OUTRO, DODGE } from "../../engine/rotation.js";
import {
  HEALS, HAVOC_BANE, GLACIO_CHAFE, ELECTRO_FLARE, FUSION_BURST, AERO_EROSION, SPECTRO_FRAZZLE, ELECTRO_RAGE,
  inflictedNegativeStatusBy, gainShield,
} from "../../shared/status.js";
import { KUMOKIRI, WILDFIRE_MARK } from "../../weapons/broadblade.js";
import { DISCORD, LUSTROUS_RAZOR, NEW_STD_BRAUDBLADE } from "../../weapons/standard.js";
import { THRENODIAN_LEVIATHAN, THREAD_OF_SEVERED_FATE_3PC } from "../../echoes/septimont.js";
import { BELL_BORNE_GEOCHELONE, FALLACY, HAVOC_ECLIPSE_2PC, HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC, REJUV_2PC, REJUV_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function chisaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

/** Chainsaw Mode: entered by Serrated Loop, ended by Sawring - Eradication — the stance every
 *  Sawring press is cast from. */
const CHAINSAW_MODE = new Buff({ name: "Chisa: Chainsaw Mode" });
/** What lets Normal Attack cast Rending Lunge: left by Basic Attack Stage 2, the Dodge Counter and
 *  (outside Chainsaw Mode) Eye of Unraveling; spent by Rending Lunge, removed on entering Chainsaw Mode. */
const RENDING_LUNGE_READY = new Buff({ name: "Chisa: Rending Lunge Ready" });
const READY_LUNGE = { updateBuffs: () => applyCurrent(RENDING_LUNGE_READY, 1) };

const Intro = chisaAction("Intro - Reverberance - Return", {
  endPosition: Position.Grounded, qteFrames: 34, animFrames: 55, noSwapFrames: 54, animPriority: { 55: 2 }, castPriority: 11, motionStop: [5, 36],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 39, mv: 9543, energy: 1000, offtune: 6400 }], castConcerto: 1000, castForte1: 20,
});
const Outro = chisaAction("Outro - Unraveling - Law Zero", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => applyTeam(RESONANT_THREAD_OF_CLOSURE, 1)
});

/** A Sawring Blitz stage. Every point of Ring of Chainsaw it spends also banks onto RING_CONSUMED
 *  (display-only forte2 is the gauge itself; this is the separate counter Eradication actually
 *  reads — see the file header). */
const blitz = () => ({
  requireBuff: CHAINSAW_MODE,
  // the press's whole spend, counted as it is cast: its hits pay it
  updateBuffs: () => applyCurrent(RING_CONSUMED, -currentCast().bullets.reduce((n, b) => n + b.forte2, 0)),
});
/** Every hit of Skill and Serrated Loop marks Unseen Snare; Retraction and lock-on have no wuwalab
 *  entry (see file header) and aren't modelled. */
const MARK_SNARE = { updateDebuffs: () => applyEnemy(UNSEEN_SNARE, 1) };
/** Death Snip's team heal: wuwalab's own 67f, past its last hit (65f, that hit's, with Spread). */
const SNIP_HEAL = { updateDebuffs: () => applyCurrent(HEALS, 1) };

// --- Reign of Silence: the ground basic chain. Stage 1 -> Stage 2 -> Rending Lunge -> Death Snip
//     -> Thread Withdrawn is the full string; Hanging Finality and the mid-air/Heavy pieces below
//     are reached from other points in it (Heavy Attack, mid-air) rather than this ground line.
const BA1 = chisaAction("Basic - Reign of Silence 1", { animFrames: 23, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 1671, energy: 35, concerto: 70, offtune: 1120, forte1: 2 },
    { hitFrame: 17, mv: 1671, energy: 35, concerto: 70, offtune: 1120, forte1: 2 },
  ]});
// Normal Attack shortly after the Plunging Attack, the Liberation or the Intro also casts Stage 2
const BA2 = chisaAction("Basic - Reign of Silence 2", { chains: () => [BA1, ReignOfSilenceMidAir, Liberation, Intro], animFrames: 55, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 955, energy: 20, concerto: 40, offtune: 640, forte1: 2 },
    { hitFrame: 21, mv: 1909, energy: 40, concerto: 80, offtune: 1280, forte1: 3 },
    { hitFrame: 38, mv: 6681, energy: 140, concerto: 280, offtune: 4480, forte1: 9 },
  ], ...READY_LUNGE });
/** Dodge Counter's own Reign of Silence 2 — a bigger single burst than the plain combo stage,
 *  triggered off a successful Dodge rather than chained from Stage 1. Not in the rotation (nothing
 *  here models incoming attacks to dodge), defined for completeness. */
const DodgeCounterBA2 = chisaAction("Dodge Counter - Reign of Silence 2", { chains: [DODGE], animFrames: 57, animPriority: { 0: 2 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 2386, energy: 50, concerto: 100, offtune: 1120, forte1: 3 },
    { hitFrame: 22, mv: 4772, energy: 100, concerto: 200, offtune: 2240, forte1: 5 },
    { hitFrame: 40, mv: 16701, energy: 350, concerto: 700, offtune: 7840, forte1: 15 },
  ], castConcerto: 1000, ...READY_LUNGE });
const RendingLunge = chisaAction("Basic - Rending Lunge", { chains: () => [BA2, DodgeCounterBA2, Skill], requireBuff: RENDING_LUNGE_READY, animFrames: 80, animPriority: { 0: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, mv: 1511, energy: 32, concerto: 64, offtune: 1014, forte1: 2 },
    { hitFrame: 24, mv: 1511, energy: 32, concerto: 64, offtune: 1014, forte1: 2 },
    { hitFrame: 27, mv: 1511, energy: 32, concerto: 64, offtune: 1014, forte1: 2 },
    { hitFrame: 32, mv: 1511, energy: 32, concerto: 64, offtune: 1014, forte1: 2 },
    { hitFrame: 58, mv: 9066, energy: 191, concerto: 381, offtune: 6081, forte1: 12 },
  ],
  updateBuffs: () => revokeCurrent(RENDING_LUNGE_READY),
});
/** "The skill DMG is considered Resonance Liberation DMG" per the kit page — matches wuwalab's own
 *  damage_type for both hits. */
// "Press Normal Attack shortly after casting this skill on the ground to cast Death Snip" (Lunge, Hanging Finality)
const DeathSnip = chisaAction("Basic - Death Snip", { chains: () => [RendingLunge, HangingFinality], castPosition: Position.Grounded, animFrames: 73, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 14, mv: 2981, energy: 42, concerto: 84, offtune: 1333, forte1: 4 },
    { hitFrame: 54, mv: 1491, energy: 21, concerto: 42, offtune: 667, forte1: 2 },
    { hitFrame: 65, mv: 10434, energy: 146, concerto: 292, offtune: 4665, forte1: 12 },
    { hitFrame: 67, element: null, type: null, subtype: null, ...SNIP_HEAL },
  ]});
/** The "insert an extra hit mid-snip" variant — same Resonance Liberation typing and heal. */
const DeathSnipSpread = chisaAction("Basic - Death Snip + Spread", { chains: () => [RendingLunge, HangingFinality], castPosition: Position.Grounded, animFrames: 76, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 15, mv: 2981, energy: 42, concerto: 84, offtune: 1333, forte1: 4 },
    { hitFrame: 32, mv: 4778, energy: 67, concerto: 134, offtune: 2136, forte1: 9 },
    { hitFrame: 55, mv: 1491, energy: 21, concerto: 42, offtune: 667, forte1: 2 },
    { hitFrame: 65, mv: 10434, energy: 146, concerto: 292, offtune: 4665, forte1: 12, ...SNIP_HEAL },
  ]});
const ThreadWithdrawn = chisaAction("Basic - Thread Withdrawn", { chains: [DeathSnip, DeathSnipSpread], animFrames: 56, animPriority: { 0: 4, 34: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 6, mv: 1015, energy: 22, concerto: 43, offtune: 681, forte1: 3 },
    { hitFrame: 15, commitFrame: 6, mv: 1015, energy: 22, concerto: 43, offtune: 681, forte1: 3 },
    { hitFrame: 48, commitFrame: 6, mv: 4735, energy: 100, concerto: 199, offtune: 3176, forte1: 10 },
  ]});
/** The airborne normal attack — not part of the ground string, chains into Reign of Silence 2 in
 *  mid-air instead. Not in the rotation (nothing here models being airborne), defined for completeness. */
const ReignOfSilenceMidAir = chisaAction("Mid-air - Reign of Silence Plunge", { castPosition: Position.Midair, endPosition: Position.Grounded, animFrames: 47, animPriority: { 0: 5, 31: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 33, mv: 7396, energy: 155, concerto: 310, offtune: 4960, forte1: 9 }]});

// "Leap into the air and consume STA to attack the target"
const HA = chisaAction("Heavy - Reign of Silence", { endPosition: Position.Midair, animFrames: 44, animPriority: { 44: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 12, mv: 3579, energy: 75, concerto: 150, offtune: 2400, forte1: 5 },
    { hitFrame: 31, mv: 3579, energy: 75, concerto: 150, offtune: 2400, forte1: 5 },
  ]});
/** Heavy Attack's own mid-air follow-up, chaining into Hanging Finality. Not in the rotation. */
// "Hold Normal Attack before landing after casting Heavy Attack"
const SeveredFacet = chisaAction("Heavy - Severed Facet (Mid-Air)", { chains: [HA], castPosition: Position.Midair, animFrames: 53, animPriority: { 53: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 29, mv: 4474, energy: 94, concerto: 188, offtune: 3000, forte1: 6 },
    { hitFrame: 36, mv: 4474, energy: 94, concerto: 188, offtune: 3000, forte1: 6 },
  ]});
/** Reached off Heavy Attack, Severed Facet, or Rending Lunge in mid-air; can chain into Death Snip.
 *  Not in the rotation (the ground string reaches Death Snip via Rending Lunge instead). */
// a Plunging Attack, off Normal Attack after the Heavy, Severed Facet or a mid-air Rending Lunge
const HangingFinality = chisaAction("Basic - Hanging Finality", { chains: [HA, SeveredFacet, RendingLunge], castPosition: Position.Midair, endPosition: Position.Grounded, animFrames: 77, animPriority: { 63: 3, 77: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 6, mv: 1193, energy: 25, concerto: 50, offtune: 800, forte1: 2 },
    { hitFrame: 21, mv: 2386, energy: 50, concerto: 100, offtune: 1600, forte1: 3 },
    { hitFrame: 64, mv: 2386, energy: 50, concerto: 100, offtune: 1600, forte1: 3 },
    { hitFrame: 70, mv: 5965, energy: 125, concerto: 250, offtune: 4000, forte1: 8 },
  ]});

// --- Resolution: Eye of Unraveling is her baseline Skill; Serrated Loop replaces it once the Ring
//     of Chainsaw is full and is what sends her into Chainsaw Mode. All three mark Unseen Snare.
const Skill = chisaAction("Skill - Eye of Unraveling", { animFrames: 20, animPriority: { 21: 3 }, castPriority: 4, cooldown: 60 * 12, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 8, mv: 3579, energy: 75, concerto: 150, offtune: 2400, forte1: 5 }], ...MARK_SNARE,
  updateBuffs: () => { if (!isHeld(CHAINSAW_MODE)) applyCurrent(RENDING_LUNGE_READY, 1); },
});
/** The plain tap — released immediately. Not in the rotation; the Hold below reaches Chainsaw Mode
 *  with more hits at no extra cost this engine models, so it's the strictly better pick here. */

/** Casting Serrated Loop sends her into Chainsaw Mode, which also removes the Rending Lunge follow-up. */
const ENTER_CHAINSAW = {
  updateBuffs: () => {
    revokeCurrent(RENDING_LUNGE_READY);
    applyCurrent(CHAINSAW_MODE, 1);
  },
};
// "While on the ground and Ring of Chainsaw is full, Resonance Skill is replaced with Serrated Loop"
const SerratedLoop = chisaAction("Forte Skill - Serrated Loop", { castPosition: Position.Grounded, minForte1: 100, animFrames: 83, animPriority: { 0: 4, 78: 2 }, castPriority: 4, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 27, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 32, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 39, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 41, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 46, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 53, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 63, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 78, mv: 1745, energy: 37, concerto: 74, offtune: 1170, forte2: 100 },
  ], castForte1: -100, ...MARK_SNARE, ...ENTER_CHAINSAW });
const SerratedLoopHalfHold = chisaAction("Forte Skill - Serrated Loop (Half Hold)", { castPosition: Position.Grounded, minForte1: 100, animFrames: 137, animPriority: { 0: 4, 78: 2 }, castPriority: 4, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 27, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 32, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 39, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 41, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 46, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 53, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 63, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 78, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 92, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 98, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 104, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 110, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 116, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 122, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 132, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 137, mv: 746, energy: 16, concerto: 32, offtune: 501, forte2: 100 },
  ], castForte1: -100, ...MARK_SNARE, ...ENTER_CHAINSAW });
const SerratedLoopHold = chisaAction("Forte Skill - Serrated Loop (Hold)", { castPosition: Position.Grounded, minForte1: 100, animFrames: 174, animPriority: { 0: 4, 78: 2 }, castPriority: 4, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 27, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 32, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 39, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 41, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 46, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 53, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 63, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 78, mv: 1745, energy: 37, concerto: 74, offtune: 1170 },
    { hitFrame: 92, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 98, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 104, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 110, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 116, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 122, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 128, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 132, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 134, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 137, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 145, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 149, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 157, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 162, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 169, mv: 746, energy: 16, concerto: 32, offtune: 501 },
    { hitFrame: 174, mv: 746, energy: 16, concerto: 32, offtune: 501, forte2: 100 },
  ], castForte1: -100, ...MARK_SNARE, ...ENTER_CHAINSAW });

/** Moment of Nihility: 954.29% Havoc, heals the team, banks 40 Ring of Chainsaw and hands herself
 *  Woven Myriad - Convergence (+120% MV to Blitz/Eradication until Eradication resolves it). */
const Liberation = chisaAction("Liberation - Moment of Nihility", {
  animFrames: 220, animPriority: { 220: 1 }, castPriority: 10, timestop: [0, 220], motionStop: [0, 170], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, resetEnergy: true,
  // the team heal lands at 170f, 10f behind the hit (wuwalab)
  bullets: [
    { hitFrame: 160, mv: 95429, offtune: 96000 },
    { hitFrame: 170, element: null, type: null, subtype: null, updateDebuffs: () => applyCurrent(HEALS, 1) },
  ], castConcerto: 2000, castForte1: 40,
  updateBuffs: () => applyCurrent(WOVEN_MYRIAD_CONVERGENCE, 1),
});

// --- Chainsaw Mode's own Sawring Blitz chain, all typed Resonance Liberation DMG per the kit page.
//     Each stage both spends the Ring of Chainsaw gauge (forte1, display only) and banks the same
//     amount onto RING_CONSUMED (spendRing above), which only Eradication ever reads.
const Blitz1 = chisaAction("Forte Basic - Sawring Blitz 1", { animFrames: 31, animPriority: { 36: 2 }, castPriority: 3, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 10, mv: 1149, energy: 17, concerto: 33, offtune: 514, forte2: -3 },
    { hitFrame: 13, mv: 1149, energy: 17, concerto: 33, offtune: 514, forte2: -3 },
    { hitFrame: 19, mv: 1149, energy: 17, concerto: 33, offtune: 514, forte2: -3 },
    { hitFrame: 21, commitFrame: 24, mv: 1149, energy: 17, concerto: 33, offtune: 514, forte2: -3 },
    { hitFrame: 24, commitFrame: 13, mv: 1149, energy: 17, concerto: 33, offtune: 514, forte2: -3 },
    { hitFrame: 26, commitFrame: 19, mv: 1149, energy: 17, concerto: 33, offtune: 514, forte2: -3 },
  ], ...blitz() });

/** Stage 2, as the four inputs that reach it. The Dodge Counter and the After Plunge are the same
 *  stage entered off a dodge or out of a plunge — wuwalab gives all three the same MV, energy,
 *  concerto, off-tune and Ring cost hit for hit, and nanoka lists the Dodge Counter's own row
 *  ("Chainsaw Mode - Dodge Counter DMG", 10.64%*8) at exactly the tap's numbers. They are separate
 *  presses all the same, so each gets its own row rather than being folded into the tap.
 *  Every one of them is a *release*, so any of them can follow up with Discordance. */
const Blitz2 = chisaAction("Forte Basic - Sawring Blitz 2", { animFrames: 52, animPriority: { 48: 2 }, castPriority: 3, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 19, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -2 },
    { hitFrame: 21, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 23, commitFrame: 21, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -2 },
    { hitFrame: 25, commitFrame: 21, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 33, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 38, commitFrame: 33, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 39, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 43, commitFrame: 39, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
  ], ...blitz() });
const Blitz2DodgeCounter = chisaAction("Forte Dodge Counter - Sawring Blitz 2", { chains: [DODGE], animFrames: 52, animPriority: { 48: 2 }, castPriority: 3, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Liberation, bullets: [
    { hitFrame: 19, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -2 },
    { hitFrame: 21, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 23, commitFrame: 21, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -2 },
    { hitFrame: 25, commitFrame: 21, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 33, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 38, commitFrame: 33, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 39, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 43, commitFrame: 39, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
  ], ...blitz(), castConcerto: 1000 });
const Blitz2AfterPlunge = chisaAction("Forte Basic - Sawring Blitz 2 (After Plunge)", { animFrames: 43, animPriority: { 38: 2 }, castPriority: 3, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 11, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -2 },
    { hitFrame: 14, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 14, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -2 },
    { hitFrame: 18, commitFrame: 14, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 25, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 29, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 32, commitFrame: 25, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 35, commitFrame: 29, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
  ], ...blitz() });
/** What a released Stage 2 can throw out on the way — only where the rotation writes it (`Blitz2D`). */
const Blitz2Discordance = chisaAction("Forte Basic - Sawring Blitz 2: Discordance", { tag: ActionTag.OffField, animFrames: 160, animPriority: { 0: 0 }, castPriority: 3, node: Node.Forte, type: Type.Liberation, bullets: [
    { hitFrame: 4, mv: 358, energy: 5, concerto: 10, offtune: 160, forte2: -1 },
    { hitFrame: 8, mv: 358, energy: 5, concerto: 10, offtune: 160, forte2: -1 },
    { hitFrame: 17, mv: 358, energy: 5, concerto: 10, offtune: 160, forte2: -1 },
  ], ...blitz() });

/** Stage 2 held, its own three inputs: 18 hits rather than 8 for the same press, and it chains
 *  into Stage 3 instead of releasing, so none of them throws a Discordance. */
const Blitz2Hold = chisaAction("Forte Basic - Sawring Blitz 2 (Hold)", { animFrames: 84, animPriority: { 49: 2 }, castPriority: 3, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 19, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -2 },
    { hitFrame: 21, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 23, commitFrame: 21, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -2 },
    { hitFrame: 25, commitFrame: 21, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 33, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 38, commitFrame: 33, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 39, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 43, commitFrame: 39, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 45, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 51, commitFrame: 45, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 52, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 57, commitFrame: 52, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 60, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 65, commitFrame: 60, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 66, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 71, commitFrame: 66, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 73, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 78, commitFrame: 73, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
  ], ...blitz() });
const Blitz2HoldDodgeCounter = chisaAction("Forte Dodge Counter - Sawring Blitz 2 (Hold)", { chains: [DODGE], animFrames: 84, animPriority: { 49: 2 }, castPriority: 3, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Liberation, bullets: [
    { hitFrame: 19, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -2 },
    { hitFrame: 21, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 23, commitFrame: 21, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -2 },
    { hitFrame: 25, commitFrame: 21, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 33, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 38, commitFrame: 33, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 39, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 43, commitFrame: 39, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 45, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 51, commitFrame: 45, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 52, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 57, commitFrame: 52, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 60, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 65, commitFrame: 60, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 66, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 71, commitFrame: 66, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 73, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 78, commitFrame: 73, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
  ], ...blitz(), castConcerto: 1000 });
const Blitz2HoldAfterPlunge = chisaAction("Forte Basic - Sawring Blitz 2 (Hold After Plunge)", { animFrames: 65, animPriority: { 40: 2 }, castPriority: 3, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 11, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -2 },
    { hitFrame: 14, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 14, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -2 },
    { hitFrame: 18, commitFrame: 14, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 25, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 29, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 32, commitFrame: 25, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 35, commitFrame: 29, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 37, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 42, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 42, commitFrame: 37, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 47, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 48, commitFrame: 42, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 53, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 53, commitFrame: 47, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 57, commitFrame: 50, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 57, commitFrame: 53, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
    { hitFrame: 62, commitFrame: 50, mv: 1064, energy: 15, concerto: 30, offtune: 476, forte2: -3 },
  ], ...blitz() });

// any Stage 2 (Discordance, off field, between) or the Chainsaw Mode Dodge Counter; holding Normal
// Attack starts the combo at Stage 2, so Stage 2 itself follows anything
const Blitz3 = chisaAction("Forte Basic - Sawring Blitz 3", { chains: [Blitz2, Blitz2Hold, Blitz2AfterPlunge, Blitz2HoldAfterPlunge, Blitz2DodgeCounter, Blitz2HoldDodgeCounter], animFrames: 67, castPriority: 3, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 32, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -3 },
    { hitFrame: 38, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -3 },
    { hitFrame: 41, commitFrame: 32, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -3 },
    { hitFrame: 47, commitFrame: 38, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -3 },
    { hitFrame: 50, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -3 },
    { hitFrame: 56, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -3 },
    { hitFrame: 62, commitFrame: 50, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -4 },
    { hitFrame: 66, commitFrame: 56, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -4 },
  ], ...blitz() });
/** What a released Stage 3 can throw out, the same shape as Discordance above (`Blitz3F`). */
const Blitz3Falltone = chisaAction("Forte Basic - Sawring Blitz 3: Falltone", { tag: ActionTag.OffField, animFrames: 45, animPriority: { 0: 5, 29: 3 }, castPriority: 3, node: Node.Forte, type: Type.Liberation, bullets: [
    { hitFrame: 2, mv: 358, energy: 5, concerto: 10, offtune: 160, forte2: -1 },
    { hitFrame: 6, mv: 358, energy: 5, concerto: 10, offtune: 160, forte2: -1 },
    { hitFrame: 9, mv: 358, energy: 5, concerto: 10, offtune: 160, forte2: -1 },
  ], ...blitz() });
/** Held Stage 3 chains into Eradication, so it throws no Falltone. */
const Blitz3Hold = chisaAction("Forte Basic - Sawring Blitz 3 (Hold)", { chains: [Blitz2, Blitz2Hold, Blitz2AfterPlunge, Blitz2HoldAfterPlunge, Blitz2DodgeCounter, Blitz2HoldDodgeCounter], animFrames: 99, castPriority: 3, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 32, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -3 },
    { hitFrame: 38, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -3 },
    { hitFrame: 41, commitFrame: 32, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -3 },
    { hitFrame: 47, commitFrame: 38, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -3 },
    { hitFrame: 50, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -3 },
    { hitFrame: 56, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -3 },
    { hitFrame: 62, commitFrame: 50, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -4 },
    { hitFrame: 66, commitFrame: 56, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -4 },
    { hitFrame: 73, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -4 },
    { hitFrame: 77, commitFrame: 73, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -4 },
    { hitFrame: 84, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -4 },
    { hitFrame: 88, commitFrame: 84, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -4 },
    { hitFrame: 96, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -4 },
    { hitFrame: 99, commitFrame: 96, mv: 1598, energy: 23, concerto: 45, offtune: 715, forte2: -4 },
  ], ...blitz() });

/** A released stage and the burst it throws: Stage 2 into Discordance, Stage 3 into Falltone. */
const Blitz2D = new ActionGroup("Forte Basic - Sawring Blitz 2 (Discordance)", [Blitz2, Blitz2Discordance]);
const Blitz3F = new ActionGroup("Forte Basic - Sawring Blitz 3 (Falltone)", [Blitz3, Blitz3Falltone]);
/** Consumes whatever Ring of Chainsaw remains and ends Chainsaw Mode; shields the team. Follows Stage
 *  3 (its Falltone), or any Blitz or its Dodge Counter that has emptied the Ring of Chainsaw. */
const Eradication = chisaAction("Forte Basic - Sawring Eradication", {
  chains: [Blitz3, Blitz3Hold, Blitz1, Blitz2, Blitz2Hold, Blitz2AfterPlunge, Blitz2HoldAfterPlunge, Blitz2DodgeCounter, Blitz2HoldDodgeCounter], requireBuff: CHAINSAW_MODE, animFrames: 156, animPriority: { 156: 1 }, castPriority: 5,
  node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 53, mv: 5154, energy: 448, concerto: 96, offtune: 1536,
      updateDebuffs: () => gainShield() },
    { hitFrame: 68, commitFrame: 65, mv: 20613, energy: 1792, concerto: 384, offtune: 6144 },
  ], castConcerto: 4500, 
  resetForte2: true,
  // casting it ends Chainsaw Mode
  updateBuffs: () => revokeCurrent(CHAINSAW_MODE),
});

/** The whole Chainsaw Mode chain — every Blitz stage, both release bursts and Eradication. The
 *  two pieces that scale it (Woven Myriad - Convergence and S3) both pay on all of it. */
const BLITZ_CHAIN = new Set<Action>([
  Blitz1,
  Blitz2, Blitz2DodgeCounter, Blitz2AfterPlunge, Blitz2Discordance,
  Blitz2Hold, Blitz2HoldDodgeCounter, Blitz2HoldAfterPlunge,
  Blitz3, Blitz3Falltone, Blitz3Hold,
  Eradication,
]);

/* ------------------------------------------------------------------------------------- buffs */

/** Woven Myriad - Convergence: +120% MV to Blitz/Eradication, ended the moment Eradication itself
 *  resolves rather than its own 15s (a loop always reaches Eradication well inside that). */
const WOVEN_MYRIAD_CONVERGENCE = new Buff({
  name: "Chisa: Woven Myriad - Convergence",
  duration: 60 * 15,
  applyStats: () => { if (runningAnyOf(BLITZ_CHAIN)) addStat(Stat.MulMv, 120); },
  afterAction: () => { if (runningAction(Eradication)) revokeCurrent(WOVEN_MYRIAD_CONVERGENCE); },
});

/** Every point of Ring of Chainsaw Blitz spends banks here (cap 100), and only Eradication ever
 *  reads it — +2.59% MV a point at max rank — before it resets for the next Chainsaw Mode entry. */
const RING_CONSUMED = new Buff({
  name: "Chisa: Ring of Chainsaw Consumed", maxStacks: 100,
  applyStats: () => {
    if (runningBullet(Eradication, -1)) addStat(Stat.AddMv, 259 * frozenStacks());
  },
  afterAction: () => { if (runningAction(Eradication)) revokeCurrent(RING_CONSUMED); },
});

/** All Ends Here (Inherent 2's own stat half): casting Intro or Liberation grants +20% Havoc DMG
 *  Bonus and +20% Healing Bonus for 12s. */
const ALL_ENDS_HERE = new Buff({
  name: "Inherent: All Ends Here",
  duration: 60 * 12,
  stats: [[Stat.DmgBonus, 20, Attribute.Havoc], [Stat.HealingBonus, 20]],
});

/** The frame Unseen Snare can next inflict Havoc Bane, held as the target's own (nameless) stack
 *  count so a variant replay restores it, and S4's marker halving that cooldown. */
const SNARE_READY = new Debuff({ maxStacks: 1e9 });
const SNARE_HASTE = new Debuff({});

/** Unseen Snare: an enemy marker, 30s. While up, any Resonator's direct damage (not Negative
 *  Status DMG) inflicts a stack of her Havoc Bane, once every 2s (1s at S4) — checked hit by hit. */
const UNSEEN_SNARE = new Debuff({
  name: "Chisa: Unseen Snare",
  duration: 60 * 30,
  display: () => `Chisa: Unseen Snare${stacksOfEnemy(SNARE_FINALITY) ? " - Finality" : ""}`,
  // The Bane is hers, not the swinging teammate's: applyEnemy() here inherits this marker's own
  // source (context.ts's `attribute()`), so an "on inflicting a Negative Status" passive worn by that
  // teammate — Kumokiri, Thread of Severed Fate — reads 0 for it and doesn't pay out. See
  // `appliedByMe()`, which is what every such passive checks.
  //
  // updateDebuffs, not hitGlobal: an enemy-pool Debuff's runs on every member's hit, ahead of every
  // hitGlobal, so each cross-slot watcher — her own sonata too (THREAD_OF_SEVERED_FATE_3PC) — sees it.
  updateDebuffs: () => {
    // a bullet dealing nothing (an event's marker) is no damage
    if (isType(Type.Status) || !currentHit().mv) return;
    const now = currentFrame(), was = stacksOfEnemy(SNARE_READY);
    if (now < was) return;
    applyEnemy(HAVOC_BANE, 1);
    applyEnemy(SNARE_READY, now + (stacksOfEnemy(SNARE_HASTE) ? 60 : 120) - was);
  },
});

/** Every Negative Status (statuses.ts) plus Electro Rage — what Resonant Thread of Closure's own
 *  cap raise below applies to, matching the kit page's generic "Negative Status and Electro Rage". */
const NEGATIVE_STATUS_CAPS = [HAVOC_BANE, GLACIO_CHAFE, ELECTRO_FLARE, FUSION_BURST, AERO_EROSION, SPECTRO_FRAZZLE, ELECTRO_RAGE];

/** Resonant Thread of Closure (Outro): a 20s team marker. While held: any hit landing raises every Negative
 *  Status/Electro Rage cap +3 — this engine's maxStackIncrease() only ever raises a cap for the rest
 *  of the fight (no way to lower it again once the real 15s lapses), so this is the closest a "for
 *  15s, unstackable" raise gets here rather than invented decay. Each holder who inflicts a Negative
 *  Status gains Thread of Bane — Chisa too, off-field, when Snare's Bane lands on an ally's hit — as
 *  does whoever deals Negative Status DMG. */
const RESONANT_THREAD_OF_CLOSURE = new Buff({
  name: "Chisa: Outro",
  duration: 60 * 20,
  hitGlobal: () => {
    for (const d of NEGATIVE_STATUS_CAPS) maxStackIncrease(d, 3);
    for (const m of currentTeam().slots) if (m.resonator && inflictedNegativeStatusBy(m)) addBuff(m.resonator, THREAD_OF_BANE, 1);
    if (isType(Type.Status)) applyCurrent(THREAD_OF_BANE, 1);
  },
});

/** Thread of Bane: +18% DEF Ignore against a Snared target, 15s, on each holder who earned it. */
const THREAD_OF_BANE = new Buff({
  name: "Chisa: Thread of Bane",
  duration: 60 * 15,
  applyStats: () => {
    if (stacksOfEnemy(UNSEEN_SNARE) > 0) addStat(Stat.DefIgnoreNew, 18);
    // S2: every holder of the Thread is +50% DMG Bonus while she has it
    if (stacksOfTeam(WEB_OF_BONDS)) addStat(Stat.DmgBonus, 50);
  },
});

/* --------------------------------------------------------------------------------- sequences */

/** S1's own ATK: +30% for 15s off every Unseen Snare she lays. */
const DESOLATE_CORRIDORS = new Buff({
  name: "Chisa S1: Wandering Through the Desolate Corridors",
  duration: 60 * 15,
  stats: [[Stat.BonusAtk, 30]],
});
/** S1's one-off: 61,803 fixed Havoc DMG, Basic Attack DMG that reads no bonus at all, on the first
 *  Snare a target ever takes. The 61.8% floor on the target's HP never binds against a boss. */
const SnareStrike = chisaAction("Basic - Unseen Snare (S1)", { type: Type.Basic, scaling: Scaling.Fixed, bullets: [{ hitFrame: 0, mv: 6180300 }] });
/** Whether that hit has already landed — once per target, which is once a fight here, so a marker
 *  on her own slot rather than the target's. No `name`, so it never enters the held-buffs list. */
const SNARE_STRUCK = new Buff({});
const CS_S1 = new Sequence({
  name: "Chisa S1: Wandering Through the Desolate Corridors",
  // on the hit, behind the Snare its own updateDebuffs lays
  updateDebuffs: () => {
    if (!appliedByMe(UNSEEN_SNARE)) return;
    applyCurrent(DESOLATE_CORRIDORS, 1);
    if (!isHeld(SNARE_STRUCK)) {
      applyCurrent(SNARE_STRUCK, 1);
      queue(SnareStrike);
    }
  },
});

/** S2 on the team: what Thread of Bane reads for its +50% DMG Bonus (above). Her own half is 10%
 *  Havoc RES ignored on everything she deals. */
const WEB_OF_BONDS = new Buff({ name: "Chisa S2: Into the Web of Endless Bonds" });
const CS_S2 = new Sequence({
  name: "Chisa S2: Into the Web of Endless Bonds",
  combatStart: () => applyTeam(WEB_OF_BONDS, 1),
  stats: [[Stat.ResIgnore, 10, Attribute.Havoc]],
});

/** S3: +120% DMG Multiplier on the Blitz chain and Eradication, and another +120% on Eradication
 *  for the Ring it spends — read as the same flat add the first half is, on top of the per-point
 *  bonus RING_CONSUMED already pays, since the text gives it as one figure rather than a rate.
 *  Both stack with Woven Myriad - Convergence, which is simply a third add of its own. The
 *  Vibration Strength half reaches no formula. */
const CS_S3 = new Sequence({
  name: "Chisa S3: Across the Confusion of the Long Night",
  applyStats: () => { if (runningAnyOf(BLITZ_CHAIN)) addStat(Stat.MulMv, 120); },
});

/** S4 halves Unseen Snare's Bane cooldown, 2s to 1s (read off the target's own marker, above). */
const CS_S4 = new Sequence({
  name: "Chisa S4: Severing the Endless Cycle of Tragic Fate",
  combatStart: () => applyEnemy(SNARE_HASTE, 1),
});

/** S5: +100% DMG Bonus on Moment of Nihility. Glide's cheaper Jetstream reaches no formula. */
const CS_S5 = new Sequence({
  name: "Chisa S5: Thousands of Lights to Guide the Way Home",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.DmgBonus, 100); },
});

/** S6's Unseen Snare - Finality, on the target beside the Snare itself: every Negative Status's
 *  damage is amplified 30% — scoped to each status's own tag, the only amplification a dot row
 *  reads — and the target takes 40% more from Chisa. An enemy debuff's applyStats runs on whoever
 *  is acting, so that half pays only when the acting slot is hers. The last-stand half reaches no
 *  formula. */
const SNARE_FINALITY = new Debuff({
  name: "Chisa S6: Unseen Snare - Finality",
  duration: 60 * 30,
  applyStats: () => {
    for (const tag of [Subtype.SpectroFrazzle, Subtype.FusionBurst, Subtype.GlacioChafe, Subtype.AeroErosion, Subtype.ElectroFlare]) addStat(Stat.Amp, 30, tag);
    if (isHeld(CHISA_RESONATOR)) addStat(Stat.DamageTaken, 40);
  },
});
const CS_S6 = new Sequence({
  name: "Chisa S6: Thus, Hope is Rekindled with the Rising Dawn",
  updateDebuffs: () => { if (stacksOfEnemy(UNSEEN_SNARE) && !stacksOfEnemy(SNARE_FINALITY)) applyEnemy(SNARE_FINALITY, 1); },
});

const CS_SEQUENCES = [CS_S1, CS_S2, CS_S3, CS_S4, CS_S5, CS_S6];

/* --------------------------------------------------------------------------- kit and loadout */

/** Inescapable Fate (Inherent 1): resets her Skill's cooldown off an ally's kill on a Snare-marked
 *  target — no engine hook for a "defeat," so this contributes nothing, like Mornye's Boundedness. */
const CS_INHERENT_1 = new Inherent({ name: "Inherent: Inescapable Fate" });

/** All Ends Here (Inherent 2): grants ALL_ENDS_HERE above off her own Intro/Liberation. Its second
 *  half — Sight of Unraveling, another on-kill chain — is left out for the same reason as Inherent 1. */
const CS_INHERENT_2 = new Inherent({
  name: "Inherent: All Ends Here",
  updateBuffs: () => { if (runningAction(Intro) || runningAction(Liberation)) applyCurrent(ALL_ENDS_HERE, 1); },
});

const CHISA_TALENTS = new Talent({
  name: "Chisa: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

const CHISA_RESONATOR = new Resonator({
  name: "Chisa",
  talent: CHISA_TALENTS,
  inherent1: CS_INHERENT_1,
  inherent2: CS_INHERENT_2,
  element: Attribute.Havoc,
  weapon: WeaponType.Broadblade,
  color: "#8a3b47",
  intro: Intro,
  outro: Outro,
  swapIn: () => (isHeld(CHAINSAW_MODE) ? Blitz1 : BA1),
  swapInAir: ReignOfSilenceMidAir,
  maxEnergy: 12500,
  maxForte1: 100,
  maxForte2: 100,

  stats: [[Stat.BaseHp, 10775], [Stat.BaseAtk, 437.5], [Stat.BaseDef, 1136.6646]],
});

/* ---------------------------------------------------------------------------------- rotation */

/** Skill spent once in the opening scramble (its ~12s cooldown is well clear by the time the loop
 *  reaches it again), then Intro into Liberation, the full ground string (Reign of Silence 1/2 ->
 *  Rending Lunge -> Death Snip -> Thread Withdrawn) to bank the rest of the Ring of Chainsaw,
 *  Serrated Loop once it's full, then Stage 2 and Stage 3 released — each throwing its own burst
 *  (Discordance, Falltone) on the way — into Eradication, which spends what is left and trades the
 *  Convergence buff away. Released rather than held: the Holds are the bigger presses, but nothing
 *  here models the timing that earns them, so the chain reads as the plain taps it is. */

const CS_ROTATION = new Rotation([
  NOINTRO, BA1, BA2.cancel(), Skill, RendingLunge, DeathSnipSpread, ThreadWithdrawn.instaCancel(), ECHO.instaDodge(), Liberation,
  SerratedLoop, Blitz2Hold, Blitz3Hold, Eradication.instaSwap(),
  OUTRO,

  INTRO, Skill, RendingLunge, DeathSnipSpread, ECHO.instaDodge(), Liberation,
  SerratedLoop, Blitz2Hold, Blitz3Hold, Eradication.instaSwap(),
  OUTRO,
]);

const CS_ECHOES = [
  new EchoLoadout(THRENODIAN_LEVIATHAN, THREAD_OF_SEVERED_FATE_3PC, HAVOC_ECLIPSE_2PC),
  new EchoLoadout(FALLACY, THREAD_OF_SEVERED_FATE_3PC, REJUV_2PC),
  new EchoLoadout(HERON, THREAD_OF_SEVERED_FATE_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(BELL_BORNE_GEOCHELONE, THREAD_OF_SEVERED_FATE_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(BELL_BORNE_GEOCHELONE, REJUV_5PC),
  new EchoLoadout(FALLACY, REJUV_5PC),
];

export const CHISA = new Loadout({
  resonator: CHISA_RESONATOR,
  weapons: [KUMOKIRI, LUSTROUS_RAZOR, NEW_STD_BRAUDBLADE, DISCORD, WILDFIRE_MARK],
  echoLoadouts: CS_ECHOES,
  mainstats: mainstatOptions(Mainstat.CD4, Mainstat.CR4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill, Substat.Basic),
  rotation: CS_ROTATION,
  sequences: CS_SEQUENCES,
});