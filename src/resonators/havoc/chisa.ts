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
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Debuff, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  isType,
  addStat,
  appliedByMe,
  applyCurrent,
  applyTeam,
  addBuff,
  currentAction,
  runningAction,
  revokeCurrent,
  frozenStacks,
  applyEnemy,
  isHeld,
  queue,
  stacksOfEnemy,
  stacksOfTeam,
  maxStackIncrease,
  forte1,
  runningAnyOf,
  currentTeam,
  currentFrame,
} from "../../engine/context.js";
import { Action, ActionGroup, Rotation, NOINTRO, ECHO, START_2, START_3, ActionTag, INTRO, INTRO_2 } from "../../engine/rotation.js";
import {
  HEALS, SHIELD, HAVOC_BANE, GLACIO_CHAFE, ELECTRO_FLARE, FUSION_BURST, AERO_EROSION, SPECTRO_FRAZZLE, ELECTRO_RAGE,
  inflictedNegativeStatusBy, gainShield } from "../../shared/status.js";
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

const Intro = chisaAction("Intro - Reverberance - Return", {
  animFrames: 55, commitFrames: 55, motionStop: 32,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [{ at: 39, mv: 95.43, energy: 10, offtune: 6400 }], castConcerto: 10, castForte1: 20,
});
const Outro = chisaAction("Outro - Unraveling - Law Zero", {
  animFrames: 0, commitFrames: 0,
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => applyTeam(RESONANT_THREAD_OF_CLOSURE, 1)
});

/** A Sawring Blitz stage. Every point of Ring of Chainsaw it spends also banks onto RING_CONSUMED
 *  (display-only forte2 is the gauge itself; this is the separate counter Eradication actually
 *  reads — see the file header). */
const blitz = () => ({
  updateBuffs: () => applyCurrent(RING_CONSUMED, -currentAction().forte2),
});
/** Every hit of Skill and Serrated Loop marks Unseen Snare; Retraction and lock-on have no wuwalab
 *  entry (see file header) and aren't modelled. */
const MARK_SNARE = { updateDebuffs: () => applyEnemy(UNSEEN_SNARE, 1) };
/** Death Snip's second hit ("the scissors snip") heals the team. */
const SNIP_HEAL = { updateDebuffs: () => applyCurrent(HEALS, 1) };

// --- Reign of Silence: the ground basic chain. Stage 1 -> Stage 2 -> Rending Lunge -> Death Snip
//     -> Thread Withdrawn is the full string; Hanging Finality and the mid-air/Heavy pieces below
//     are reached from other points in it (Heavy Attack, mid-air) rather than this ground line.
const BA1 = chisaAction("Basic - Reign of Silence 1", { animFrames: 23, commitFrames: 17, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 8, mv: 16.71, energy: 0.35, concerto: 0.7, offtune: 1120, forte1: 2 },
    { at: 17, mv: 16.71, energy: 0.35, concerto: 0.7, offtune: 1120, forte1: 2 },
  ]});
const BA2 = chisaAction("Basic - Reign of Silence 2", { animFrames: 55, commitFrames: 38, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 11, mv: 9.55, energy: 0.2, concerto: 0.4, offtune: 640, forte1: 2 },
    { at: 21, mv: 19.09, energy: 0.4, concerto: 0.8, offtune: 1280, forte1: 3 },
    { at: 38, mv: 66.81, energy: 1.4, concerto: 2.8, offtune: 4480, forte1: 9 },
  ]});
/** Dodge Counter's own Reign of Silence 2 — a bigger single burst than the plain combo stage,
 *  triggered off a successful Dodge rather than chained from Stage 1. Not in the rotation (nothing
 *  here models incoming attacks to dodge), defined for completeness. */
const DodgeCounterBA2 = chisaAction("Dodge Counter - Reign of Silence 2", { animFrames: 57, commitFrames: 40, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 11, mv: 23.86, energy: 0.5, concerto: 1, offtune: 1120, forte1: 3 },
    { at: 22, mv: 47.72, energy: 1, concerto: 2, offtune: 2240, forte1: 5 },
    { at: 40, mv: 167.01, energy: 3.5, concerto: 7, offtune: 7840, forte1: 15 },
  ]});
const RendingLunge = chisaAction("Basic - Rending Lunge", { animFrames: 80, commitFrames: 58, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 18, mv: 15.11, energy: 0.32, concerto: 0.64, offtune: 1014, forte1: 2 },
    { at: 24, mv: 15.11, energy: 0.32, concerto: 0.64, offtune: 1014, forte1: 2 },
    { at: 27, mv: 15.11, energy: 0.32, concerto: 0.64, offtune: 1014, forte1: 2 },
    { at: 32, mv: 15.11, energy: 0.32, concerto: 0.64, offtune: 1014, forte1: 2 },
    { at: 58, mv: 90.66, energy: 1.91, concerto: 3.81, offtune: 6081, forte1: 12 },
  ]});
/** "The skill DMG is considered Resonance Liberation DMG" per the kit page — matches wuwalab's own
 *  damage_type for both hits. */
const DeathSnip = chisaAction("Basic - Death Snip", { animFrames: 73, commitFrames: 67, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, hits: [
    { at: 14, mv: 29.81, energy: 0.42, concerto: 0.84, offtune: 1333, forte1: 4 },
    { at: 54, mv: 14.91, energy: 0.21, concerto: 0.42, offtune: 667, forte1: 2, ...SNIP_HEAL },
    { at: 65, mv: 104.34, energy: 1.46, concerto: 2.92, offtune: 4665, forte1: 12 },
  ]});
/** The "insert an extra hit mid-snip" variant — same Resonance Liberation typing and heal. */
const DeathSnipSpread = chisaAction("Basic - Death Snip + Spread", { animFrames: 76, commitFrames: 65, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, hits: [
    { at: 15, mv: 29.81, energy: 0.42, concerto: 0.84, offtune: 1333, forte1: 4 },
    { at: 32, mv: 47.78, energy: 0.67, concerto: 1.34, offtune: 2136, forte1: 9 },
    { at: 55, mv: 14.91, energy: 0.21, concerto: 0.42, offtune: 667, forte1: 2, ...SNIP_HEAL },
    { at: 65, mv: 104.34, energy: 1.46, concerto: 2.92, offtune: 4665, forte1: 12 },
  ]});
const ThreadWithdrawn = chisaAction("Basic - Thread Withdrawn", { animFrames: 56, commitFrames: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 6, mv: 10.15, energy: 0.22, concerto: 0.43, offtune: 681, forte1: 3 },
    { at: 15, mv: 10.15, energy: 0.22, concerto: 0.43, offtune: 681, forte1: 3 },
    { at: 48, mv: 47.35, energy: 1, concerto: 1.99, offtune: 3176, forte1: 10 },
  ]});
/** The airborne normal attack — not part of the ground string, chains into Reign of Silence 2 in
 *  mid-air instead. Not in the rotation (nothing here models being airborne), defined for completeness. */
const ReignOfSilenceMidAir = chisaAction("Mid-air - Reign of Silence Plunge", { animFrames: 47, commitFrames: 33, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 33, mv: 73.96, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 9 }]});

const HA = chisaAction("Heavy - Reign of Silence", { animFrames: 44, commitFrames: 31, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 12, mv: 35.79, energy: 0.75, concerto: 1.5, offtune: 2400, forte1: 5 },
    { at: 31, mv: 35.79, energy: 0.75, concerto: 1.5, offtune: 2400, forte1: 5 },
  ]});
/** Heavy Attack's own mid-air follow-up, chaining into Hanging Finality. Not in the rotation. */
const SeveredFacet = chisaAction("Heavy - Severed Facet (Mid-Air)", { animFrames: 53, commitFrames: 36, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 29, mv: 44.74, energy: 0.94, concerto: 1.88, offtune: 3000, forte1: 6 },
    { at: 36, mv: 44.74, energy: 0.94, concerto: 1.88, offtune: 3000, forte1: 6 },
  ]});
/** Reached off Heavy Attack, Severed Facet, or Rending Lunge in mid-air; can chain into Death Snip.
 *  Not in the rotation (the ground string reaches Death Snip via Rending Lunge instead). */
const HangingFinality = chisaAction("Basic - Hanging Finality", { animFrames: 77, commitFrames: 70, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 6, mv: 11.93, energy: 0.25, concerto: 0.5, offtune: 800, forte1: 2 },
    { at: 21, mv: 23.86, energy: 0.5, concerto: 1, offtune: 1600, forte1: 3 },
    { at: 64, mv: 23.86, energy: 0.5, concerto: 1, offtune: 1600, forte1: 3 },
    { at: 70, mv: 59.65, energy: 1.25, concerto: 2.5, offtune: 4000, forte1: 8 },
  ]});

// --- Resolution: Eye of Unraveling is her baseline Skill; Serrated Loop replaces it once the Ring
//     of Chainsaw is full and is what sends her into Chainsaw Mode. All three mark Unseen Snare.
const Skill = chisaAction("Skill - Eye of Unraveling", { animFrames: 20, commitFrames: 8, cooldown: 60 * 12, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [{ at: 8, mv: 35.79, energy: 0.75, concerto: 1.5, offtune: 2400, forte1: 5 }], ...MARK_SNARE });
/** The plain tap — released immediately. Not in the rotation; the Hold below reaches Chainsaw Mode
 *  with more hits at no extra cost this engine models, so it's the strictly better pick here. */

const SerratedLoop = chisaAction("Forte Skill - Serrated Loop", { animFrames: 83, commitFrames: 78, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 27, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 32, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 39, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 41, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 46, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 53, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 63, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 78, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170, forte2: 100 },
  ], castForte1: -100,...MARK_SNARE });
const SerratedLoopHalfHold = chisaAction("Forte Skill - Serrated Loop (Half Hold)", { animFrames: 137, commitFrames: 137, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 27, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 32, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 39, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 41, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 46, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 53, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 63, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 78, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 92, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 98, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 104, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 110, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 116, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 122, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 132, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 137, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501, forte2: 100 },
  ], castForte1: -100,...MARK_SNARE });
const SerratedLoopHold = chisaAction("Forte Skill - Serrated Loop (Hold)", { animFrames: 174, commitFrames: 174, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 27, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 32, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 39, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 41, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 46, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 53, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 63, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 78, mv: 17.45, energy: 0.37, concerto: 0.74, offtune: 1170 },
    { at: 92, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 98, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 104, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 110, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 116, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 122, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 128, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 132, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 134, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 137, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 145, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 149, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 157, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 162, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 169, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501 },
    { at: 174, mv: 7.46, energy: 0.16, concerto: 0.32, offtune: 501, forte2: 100 },
  ], castForte1: -100,...MARK_SNARE });

/** Moment of Nihility: 954.29% Havoc, heals the team, banks 40 Ring of Chainsaw and hands herself
 *  Woven Myriad - Convergence (+120% MV to Blitz/Eradication until Eradication resolves it). */
const Liberation = chisaAction("Liberation - Moment of Nihility", {
  animFrames: 220, commitFrames: 220, timestop: 220, motionStop: 170, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, resetEnergy: true,
  hits: [{ at: 160, mv: 954.29, offtune: 96000 }], castConcerto: 20, castForte1: 40,
  updateDebuffs: () => applyCurrent(HEALS, 1),
  updateBuffs: () => applyCurrent(WOVEN_MYRIAD_CONVERGENCE, 1),
});

// --- Chainsaw Mode's own Sawring Blitz chain, all typed Resonance Liberation DMG per the kit page.
//     Each stage both spends the Ring of Chainsaw gauge (forte1, display only) and banks the same
//     amount onto RING_CONSUMED (spendRing above), which only Eradication ever reads.
const Blitz1 = chisaAction("Forte Basic - Sawring Blitz 1", { animFrames: 31, commitFrames: 24, node: Node.Forte, type: Type.Liberation, hits: [
    { at: 10, mv: 11.49, energy: 0.17, concerto: 0.33, offtune: 514 },
    { at: 13, mv: 11.49, energy: 0.17, concerto: 0.33, offtune: 514 },
    { at: 19, mv: 11.49, energy: 0.17, concerto: 0.33, offtune: 514 },
    { at: 21, mv: 11.49, energy: 0.17, concerto: 0.33, offtune: 514 },
    { at: 24, mv: 11.49, energy: 0.17, concerto: 0.33, offtune: 514 },
    { at: 26, mv: 11.49, energy: 0.17, concerto: 0.33, offtune: 514 },
  ], castForte2: -18, ...blitz() });

/** Stage 2, as the four inputs that reach it. The Dodge Counter and the After Plunge are the same
 *  stage entered off a dodge or out of a plunge — wuwalab gives all three the same MV, energy,
 *  concerto, off-tune and Ring cost hit for hit, and nanoka lists the Dodge Counter's own row
 *  ("Chainsaw Mode - Dodge Counter DMG", 10.64%*8) at exactly the tap's numbers. They are separate
 *  presses all the same, so each gets its own row rather than being folded into the tap.
 *  Every one of them is a *release*, so any of them can follow up with Discordance. */
const Blitz2 = chisaAction("Forte Basic - Sawring Blitz 2", { animFrames: 52, commitFrames: 39, node: Node.Forte, type: Type.Liberation, hits: [
    { at: 19, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 21, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 23, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 25, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 33, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 38, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 39, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 43, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
  ], castForte2: -22, ...blitz() });
const Blitz2DodgeCounter = chisaAction("Forte Dodge Counter - Sawring Blitz 2", { animFrames: 52, commitFrames: 39, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Liberation, hits: [
    { at: 19, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 21, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 23, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 25, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 33, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 38, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 39, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 43, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
  ], castForte2: -22, ...blitz() });
const Blitz2AfterPlunge = chisaAction("Forte Basic - Sawring Blitz 2 (After Plunge)", { animFrames: 43, commitFrames: 29, node: Node.Forte, type: Type.Liberation, hits: [
    { at: 11, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 14, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 14, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 18, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 25, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 29, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 32, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 35, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
  ], castForte2: -22, ...blitz() });
/** What a released Stage 2 can throw out on the way — only where the rotation writes it (`Blitz2D`). */
const Blitz2Discordance = chisaAction("Forte Basic - Sawring Blitz 2: Discordance", { tag: ActionTag.Field, animFrames: 160, commitFrames: 17, node: Node.Forte, type: Type.Liberation, hits: [
    { at: 4, mv: 3.58, energy: 0.05, concerto: 0.1, offtune: 160 },
    { at: 8, mv: 3.58, energy: 0.05, concerto: 0.1, offtune: 160 },
    { at: 17, mv: 3.58, energy: 0.05, concerto: 0.1, offtune: 160 },
  ], castForte2: -3, ...blitz() });

/** Stage 2 held, its own three inputs: 18 hits rather than 8 for the same press, and it chains
 *  into Stage 3 instead of releasing, so none of them throws a Discordance. */
const Blitz2Hold = chisaAction("Forte Basic - Sawring Blitz 2 (Hold)", { animFrames: 84, commitFrames: 73, node: Node.Forte, type: Type.Liberation, hits: [
    { at: 19, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 21, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 23, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 25, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 33, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 38, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 39, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 43, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 45, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 51, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 52, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 57, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 60, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 65, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 66, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 71, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 73, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 78, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
  ], castForte2: -52, ...blitz() });
const Blitz2HoldDodgeCounter = chisaAction("Forte Dodge Counter - Sawring Blitz 2 (Hold)", { animFrames: 84, commitFrames: 73, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Liberation, hits: [
    { at: 19, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 21, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 23, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 25, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 33, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 38, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 39, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 43, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 45, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 51, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 52, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 57, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 60, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 65, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 66, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 71, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 73, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 78, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
  ], castForte2: -52, ...blitz() });
const Blitz2HoldAfterPlunge = chisaAction("Forte Basic - Sawring Blitz 2 (Hold After Plunge)", { animFrames: 65, commitFrames: 53, node: Node.Forte, type: Type.Liberation, hits: [
    { at: 11, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 14, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 14, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 18, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 25, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 29, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 32, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 35, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 37, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 42, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 42, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 47, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 48, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 53, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 53, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 57, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 57, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
    { at: 62, mv: 10.64, energy: 0.15, concerto: 0.3, offtune: 476 },
  ], castForte2: -52, ...blitz() });

const Blitz3 = chisaAction("Forte Basic - Sawring Blitz 3", { animFrames: 67, commitFrames: 56, node: Node.Forte, type: Type.Liberation, hits: [
    { at: 32, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 38, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 41, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 47, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 50, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 56, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 62, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 66, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
  ], castForte2: -26, ...blitz() });
/** What a released Stage 3 can throw out, the same shape as Discordance above (`Blitz3F`). */
const Blitz3Falltone = chisaAction("Forte Basic - Sawring Blitz 3: Falltone", { tag: ActionTag.Field, animFrames: 45, commitFrames: 9, node: Node.Forte, type: Type.Liberation, hits: [
    { at: 2, mv: 3.58, energy: 0.05, concerto: 0.1, offtune: 160 },
    { at: 6, mv: 3.58, energy: 0.05, concerto: 0.1, offtune: 160 },
    { at: 9, mv: 3.58, energy: 0.05, concerto: 0.1, offtune: 160 },
  ], castForte2: -3, ...blitz() });
/** Held Stage 3 chains into Eradication, so it throws no Falltone. */
const Blitz3Hold = chisaAction("Forte Basic - Sawring Blitz 3 (Hold)", { animFrames: 99, commitFrames: 96, node: Node.Forte, type: Type.Liberation, hits: [
    { at: 32, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 38, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 41, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 47, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 50, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 56, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 62, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 66, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 73, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 77, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 84, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 88, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 96, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
    { at: 99, mv: 15.98, energy: 0.23, concerto: 0.45, offtune: 715 },
  ], castForte2: -50, ...blitz() });

/** A released stage and the burst it throws: Stage 2 into Discordance, Stage 3 into Falltone. */
const Blitz2D = new ActionGroup("Forte Basic - Sawring Blitz 2 (Discordance)", [Blitz2, Blitz2Discordance]);
const Blitz3F = new ActionGroup("Forte Basic - Sawring Blitz 3 (Falltone)", [Blitz3, Blitz3Falltone]);
/** Consumes whatever Ring of Chainsaw remains and ends Chainsaw Mode; shields the team. */
const Eradication = chisaAction("Forte Basic - Sawring Eradication", {
  animFrames: 156, commitFrames: 65,
  node: Node.Forte, type: Type.Liberation, hits: [
    { at: 53, mv: 51.54, energy: 4.48, concerto: 0.96, offtune: 1536,
      updateDebuffs: () => gainShield() },
    { at: 68, mv: 206.13, energy: 17.92, concerto: 3.84, offtune: 6144 },
  ], castConcerto: 45, 
  resetForte2: true,
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
  convertStats: () => { if (runningAction(Eradication)) revokeCurrent(WOVEN_MYRIAD_CONVERGENCE); },
});

/** Every point of Ring of Chainsaw Blitz spends banks here (cap 100), and only Eradication ever
 *  reads it — +2.59% MV a point at max rank — before it resets for the next Chainsaw Mode entry. */
const RING_CONSUMED = new Buff({
  name: "Chisa: Ring of Chainsaw Consumed", maxStacks: 100,
  applyStats: () => { if (runningAction(Eradication)) addStat(Stat.AddMv, 2.59 * frozenStacks()); },
  convertStats: () => { if (runningAction(Eradication)) revokeCurrent(RING_CONSUMED); },
});

/** All Ends Here (Inherent 2's own stat half): casting Intro or Liberation grants +20% Havoc DMG
 *  Bonus and +20% Healing Bonus for 12s. */
const ALL_ENDS_HERE = new Buff({
  name: "Inherent: All Ends Here",
  duration: 60 * 12,
  stats: [[Stat.DmgBonus, 20, Attribute.Havoc], [Stat.HealingBonus, 20]],
});

/** The frame Unseen Snare can next inflict Havoc Bane, held as the target's own (hidden) stack
 *  count so a variant replay restores it, and S4's marker halving that cooldown. */
const SNARE_READY = new Debuff({ name: "Unseen Snare Cooldown", maxStacks: 1e9, hidden: true });
const SNARE_HASTE = new Debuff({ name: "Unseen Snare Cooldown (S4)", hidden: true });

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
    if (isType(Type.Status)) return;
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
    if (currentAction().hits.length > 0) for (const d of NEGATIVE_STATUS_CAPS) maxStackIncrease(d, 3);
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
const SnareStrike = chisaAction("Basic - Unseen Snare (S1)", { type: Type.Basic, scaling: Scaling.Fixed, mv: 61803 });
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
  maxEnergy: 125,
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
  NOINTRO, BA1, BA2.cancel(), Skill, RendingLunge, DeathSnipSpread, ThreadWithdrawn, ECHO.instaDodge(), Liberation,
  SerratedLoop, Blitz2Hold, Blitz3Hold, Eradication.instaSwap(),
  Outro,

  INTRO, Skill, RendingLunge, DeathSnipSpread, ECHO.instaDodge(), Liberation,
  SerratedLoop, Blitz2, Blitz3, Eradication.instaSwap(),
  Outro,
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
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Basic),
  rotation: CS_ROTATION,
  sequences: CS_SEQUENCES,
});