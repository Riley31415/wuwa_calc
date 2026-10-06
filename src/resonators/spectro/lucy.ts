/**
 * Lucy — a Spectro Pistols main DPS, and the other half of the Cyberpunk collab pair (filed under
 * Lahairoi with Rebecca and their shared echo). Everything
 * that matters in her kit is Heavy Attack DMG, including the Basic Attack chain she gets in her
 * enhanced state and the Resonance Skill and Liberation that bracket it.
 *
 * She is the second Hack kit (see tunebreak.ts and Rebecca's own file): Payload, Deadlock and
 * Multi-threading all lay Hack - Shifting, and she answers Hack - Interfered with Data Crash, a
 * 1367.75% tune-scaled hit.
 *
 * Her loop is one state machine with two gauges:
 * - **TCP** (forte1, 0-100), banked by the ordinary Locked Thread attacks and by Payload/Pulse
 *   Interference. At 100 both Resonance Skills are replaced by **Deadlock**, which spends the whole
 *   bar and drops her into **Algorithm Compaction** (+65% Spectro DMG Bonus, 8s) with one **SQL**.
 * - **Root Access** (forte2, 0-100), banked only inside Compaction, by Thread Shredding and Single
 *   Threading. At 100 Single Threading becomes **Dual Threading**, which spends it and opens
 *   **Multi-threading** — the SQL hit, x3.7 its own multiplier, and what upgrades the Liberation to
 *   Old Net Deep Dive. The Liberation then ends Compaction and clears TCP.
 *
 * Digital Handshake, the buff Pulse Interference grants, ticks TCP on its own clock while she is on
 * field and out of Compaction; her opening chain reaches 100 TCP off the Skill chain's own 24, the
 * 20 the Intro arms onto the Pulse Interference that follows it, and 56 off Basics 2-4, the ticks
 * on top.
 *
 * The Liberation's Protocol Interface spends 24 RAM across up to seven Spoofing Programs; the
 * damage-optimal set against a single boss is Ping (2) + Cyberware Malfunction (4) + Breach
 * Protocol (4) + Synapse Burnout (5) + Cripple Movement (6) = 21, and that is what fires here.
 * Weapon Glitch is defensive and Cyberpsychosis only works on Common Class enemies, so neither is
 * worth the rest. Cripple Movement's own -5% enemy ATK has nothing to reduce in this calculator.
 *
 * Function Cracking's Network Backdoor is banked off *defeating* a marked Overlord/Calamity target,
 * which a single-target rotation never does — the piece is present for the kit's shape and pays
 * nothing (same standing as Luuk's Pulses Under the Snow).
 *
 * MVs off nanoka.cc (character 1511), per-hit x hit count as CLAUDE.md describes, with the flat
 * Concerto Regen rows folded in (Liberation 20, Intro 10, Pulse Interference / Deadlock / Dual
 * Threading / Multi-threading 8 apiece) and the hidden +10 on both dodge counters.
 * Energy/off-tune and the per-action TCP/Root Access are wuwalab's frame data
 * (api.wuwalab.com/api/app/characters/lucy) summed the same way, cross-checked against the
 * migrated sheet.
 */
import { Stat, EnemyStat, Attribute, WeaponType, Type, Cast, Node, Scaling, Position } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, matrix } from "../../engine/gear.js";
import {
  addStat,
  addEnemyStat,
  applyEnemy,
  applyCurrent,
  applyTeam,
  onAction,
  runningAction,
  isHeld,
  queue,
  queueQTE,
  resetCooldown,
  revokeCurrent as revokeCurrent,
  revokeTeam,
  frozenStacks,
  stacksOfEnemy,
  addGain,
  addForte1,
  forte1,
  casting,
  isActive,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, START_LAST, ECHO, INTRO, OUTRO, INTRO_LAST, DODGE } from "../../engine/rotation.js";
import { applied } from "../../engine/context.js";
import { applyHack, tuneHackResponse, TUNE_HACK_SHIFTING, TUNE_HACK_INTERFERED, TUNE_SHIFTABLE } from "../../shared/tunebreak.js";
import { SPECTRAL_TRIGGER } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { CELESTIAL_LIGHT_2PC, LINGERING_TUNES_2PC, MOONLIT_CLOUDS_2PC } from "../../echoes/jinzhou.js";
import { ADAM_SMASHER_LUCY, SHATTERED_DREAMS_1PC, NEONLIGHT_LEAP_2PC, REEL_2PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

/** Algorithm Compaction: entered by Deadlock, +65% Spectro DMG Bonus for 8s; either Liberation
 *  ends it once its hits are in — the last of them Cripple Movement, the program it fires last. */
const ALGORITHM_COMPACTION = new Buff({
  name: "Lucy: Algorithm Compaction",
  duration: 60 * 8,
  stats: [[Stat.DmgBonus, 65, Attribute.Spectro]],
  afterAction: () => {
    if (runningAction(CrippleMovement)) revokeCurrent(ALGORITHM_COMPACTION);
  },
});

/** Payload's follow-up "activating Resonance Skill - Pulse Interference": the Skill button's next
 *  press is Pulse Interference, which consumes it. */
const PULSE_READY = new Buff({ name: "Lucy: Pulse Interference Ready" });

/** "Press or hold Normal Attack shortly after casting Heavy Attack - Dual Threading to cast Heavy
 *  Attack - Multi-threading": armed by Dual Threading, consumed by Multi-threading. */
const MULTI_THREADING_READY = new Buff({ name: "Lucy: Multi-threading Ready" });

/** "When in Algorithm Compaction, after Heavy Attack - Multi-threading is cast, Netrunner is replaced
 *  with Old Net Deep Dive": armed by Multi-threading, spent by either Liberation. */
const OLD_NET_READY = new Buff({ name: "Lucy: Old Net Deep Dive Ready", lostWith: ALGORITHM_COMPACTION });

function lucyAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Locked Thread, the ordinary chain. Everything here banks TCP.
const BA1 = lucyAction("Basic - Locked Thread 1", { animFrames: 31, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 2430, energy: 38, concerto: 124, offtune: 1504, forte1: 320 },
    { hitFrame: 19, mv: 9719, energy: 152, concerto: 493, offtune: 6016, forte1: 1280 },
  ]});
// Stage 2 also follows the plunge, Payload's follow-up, Pulse Interference and the Intro, each "press Normal Attack shortly after"
const BA2 = lucyAction("Basic - Locked Thread 2", { chains: () => [BA1, MA, Skill1, Skill3, Intro], animFrames: 37, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 2066, energy: 32, concerto: 105, offtune: 1279, forte1: 408 },
    { hitFrame: 23, mv: 2005, energy: 32, concerto: 101, offtune: 1241, forte1: 396 },
    { hitFrame: 26, mv: 2005, energy: 32, concerto: 101, offtune: 1241, forte1: 396 },
  ]});
const BA3 = lucyAction("Basic - Locked Thread 3", { chains: () => [BA2, HA1], animFrames: 69, animPriority: { 0: 4, 47: 3, 69: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 3606, energy: 56, concerto: 182, offtune: 2232, forte1: 540 },
    { hitFrame: 31, mv: 3606, energy: 56, concerto: 182, offtune: 2232, forte1: 540 },
    { hitFrame: 53, mv: 4808, energy: 75, concerto: 242, offtune: 2976, forte1: 720 },
  ]});
const BA4 = lucyAction("Basic - Locked Thread 4", { chains: () => [BA3, DC], animFrames: 75, animPriority: { 0: 4, 63: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 3102, energy: 48, concerto: 156, offtune: 1920, forte1: 520 },
    { hitFrame: 12, mv: 1551, energy: 24, concerto: 78, offtune: 960, forte1: 260 },
    { hitFrame: 18, mv: 1551, energy: 24, concerto: 78, offtune: 960, forte1: 260 },
    { hitFrame: 24, mv: 1551, energy: 24, concerto: 78, offtune: 960, forte1: 260 },
    { hitFrame: 40, mv: 3877, energy: 60, concerto: 195, offtune: 2400, forte1: 650 },
    { hitFrame: 63, mv: 3877, energy: 60, concerto: 195, offtune: 2400, forte1: 650 },
  ]});
const MA = lucyAction("Mid-air - Locked Thread Plunge", { castPosition: Position.Midair, endPosition: Position.Grounded, animFrames: 97, animPriority: { 85: 2 }, castPriority: 5, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 74, mv: 5816, energy: 113, concerto: 293, offtune: 3600, forte1: 400 },
    { hitFrame: 79, mv: 5816, energy: 113, concerto: 293, offtune: 3600, forte1: 400 },
  ]});
const DC = lucyAction("Dodge Counter - Locked Thread", { chains: [DODGE], animFrames: 70, animPriority: { 0: 4, 48: 3, 70: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 5932, energy: 115, concerto: 299, offtune: 3672, forte1: 360 },
    { hitFrame: 31, mv: 7909, energy: 153, concerto: 398, offtune: 4896, forte1: 480 },
    { hitFrame: 54, mv: 5932, energy: 115, concerto: 299, offtune: 3672, forte1: 360 },
  ], castConcerto: 1000});
const HA1 = lucyAction("Heavy - Locked Thread 1", { animFrames: 48, animPriority: { 0: 3, 48: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 16, mv: 2210, energy: 43, concerto: 112, offtune: 1368, forte1: 300 },
    { hitFrame: 30, mv: 2210, energy: 43, concerto: 112, offtune: 1368, forte1: 300 },
    { hitFrame: 43, mv: 2947, energy: 57, concerto: 149, offtune: 1824, forte1: 400 },
  ]});
// "Hold Normal Attack" after Heavy Stage 1, Basic Stage 3, the Dodge Counter or Payload's follow-up
const HA2 = lucyAction("Heavy - Locked Thread 2", { chains: () => [HA1, BA3, DC, Skill1], animFrames: 109, animPriority: { 0: 4, 43: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 8, mv: 5686, energy: 110, concerto: 286, offtune: 3520, forte1: 400 },
    { hitFrame: 17, mv: 5686, energy: 110, concerto: 286, offtune: 3520, forte1: 400 },
    { hitFrame: 25, mv: 1896, energy: 37, concerto: 96, offtune: 1174, forte1: 134 },
    { hitFrame: 31, mv: 1896, energy: 37, concerto: 96, offtune: 1174, forte1: 134 },
    { hitFrame: 37, mv: 1896, energy: 37, concerto: 96, offtune: 1174, forte1: 134 },
    { hitFrame: 56, mv: 5686, energy: 110, concerto: 286, offtune: 3520, forte1: 400 },
    { hitFrame: 73, mv: 5686, energy: 110, concerto: 286, offtune: 3520, forte1: 400 },
  ]});

// --- Algorithm Compaction replaces the whole chain. Thread Shredding is Basic-cast but Heavy
//     Attack DMG; the mid-air and dodge counter forms stay Basic. All of it banks Root Access.
const EBA1 = lucyAction("Basic - Thread Shredding 1", { requireBuff: ALGORITHM_COMPACTION, animFrames: 34, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 14, mv: 1949, energy: 28, concerto: 112, offtune: 1120, forte2: 405 },
    { hitFrame: 19, mv: 1949, energy: 28, concerto: 112, offtune: 1120, forte2: 405 },
    { hitFrame: 21, mv: 1949, energy: 28, concerto: 112, offtune: 1120, forte2: 405 },
    { hitFrame: 23, mv: 1949, energy: 28, concerto: 112, offtune: 1120, forte2: 405 },
  ]});
// Stage 2 also follows each press that names it as its "press Normal Attack shortly after"
const EBA2 = lucyAction("Basic - Thread Shredding 2", { chains: () => [EBA1, EHA, DualThreading, MultiThreading, MultiThreadingSQL, MultiThreadingSQLS2, Deadlock, EMA, Intro], requireBuff: ALGORITHM_COMPACTION, animFrames: 55, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 24, mv: 2227, energy: 32, concerto: 128, offtune: 1280, forte2: 591 },
    { hitFrame: 28, mv: 2227, energy: 32, concerto: 128, offtune: 1280, forte2: 591 },
    { hitFrame: 32, mv: 2227, energy: 32, concerto: 128, offtune: 1280, forte2: 591 },
    { hitFrame: 37, mv: 2227, energy: 32, concerto: 128, offtune: 1280, forte2: 591 },
    { hitFrame: 41, mv: 2227, energy: 32, concerto: 128, offtune: 1280, forte2: 591 },
  ]});
const EBA3 = lucyAction("Basic - Thread Shredding 3", { chains: () => [EBA2, EDC], requireBuff: ALGORITHM_COMPACTION, animFrames: 67, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 4, mv: 2812, energy: 41, concerto: 162, offtune: 1616, forte2: 746 },
    { hitFrame: 6, mv: 2812, energy: 41, concerto: 162, offtune: 1616, forte2: 746 },
    { hitFrame: 33, mv: 2812, energy: 41, concerto: 162, offtune: 1616, forte2: 746 },
    { hitFrame: 45, mv: 2812, energy: 41, concerto: 162, offtune: 1616, forte2: 746 },
    { hitFrame: 49, mv: 2812, energy: 41, concerto: 162, offtune: 1616, forte2: 746 },
  ]});
const EBA4 = lucyAction("Basic - Thread Shredding 4", { chains: [EBA3], requireBuff: ALGORITHM_COMPACTION, animFrames: 57, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 3, mv: 2506, energy: 36, concerto: 144, offtune: 1440, forte2: 665 },
    { hitFrame: 6, mv: 2506, energy: 36, concerto: 144, offtune: 1440, forte2: 665 },
    { hitFrame: 9, mv: 2506, energy: 36, concerto: 144, offtune: 1440, forte2: 665 },
    { hitFrame: 13, mv: 2506, energy: 36, concerto: 144, offtune: 1440, forte2: 665 },
    { hitFrame: 26, mv: 2506, energy: 36, concerto: 144, offtune: 1440, forte2: 665 },
  ]});
const EMA = lucyAction("Mid-air - Algorithm Compaction Plunge", { castPosition: Position.Midair, endPosition: Position.Grounded, requireBuff: ALGORITHM_COMPACTION, animFrames: 67, animPriority: { 0: 5, 30: 3 }, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 34, mv: 6263, energy: 113, concerto: 293, offtune: 3600, forte1: 1661 },
    { hitFrame: 43, mv: 6263, energy: 113, concerto: 293, offtune: 3600, forte2: 3322, forte1: 1661 },
  ]});
const EDC = lucyAction("Dodge Counter - Algorithm Compaction", { chains: [DODGE], castPriority: 8, requireBuff: ALGORITHM_COMPACTION, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 19485, energy: 350, concerto: 2120, offtune: 11200, forte2: 2955 }] });
const EHA = lucyAction("Heavy - Single Threading", { requireBuff: ALGORITHM_COMPACTION, animFrames: 67, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 8, mv: 2339, energy: 34, concerto: 135, offtune: 1344, forte2: 620 },
    { hitFrame: 13, mv: 2339, energy: 34, concerto: 135, offtune: 1344, forte2: 620 },
    { hitFrame: 19, mv: 2339, energy: 34, concerto: 135, offtune: 1344, forte2: 620 },
    { hitFrame: 24, mv: 2339, energy: 34, concerto: 135, offtune: 1344, forte2: 620 },
    { hitFrame: 38, mv: 2339, energy: 34, concerto: 135, offtune: 1344, forte2: 620 },
  ]});
// every hit of Deadlock and Multi-threading, and both of Payload's charge, lands a Tune Hack (wuwalab's inflict_hack_shifting)
const HACKS = { updateDebuffs: () => applyHack() };
// each gauge's own ceiling is applied on the one cast that spends it rather than on every action
// — so that cast's own -100 lands exactly on empty, and everything before it still reports what
// the gauge really banked
const DualThreading = lucyAction("Heavy - Dual Threading", { minForte2: 10000, requireBuff: ALGORITHM_COMPACTION,
  animFrames: 67, castPriority: 3,
  node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 10, mv: 3341, energy: 60, offtune: 1344 },
    { hitFrame: 15, mv: 3341, energy: 60, offtune: 1344 },
    { hitFrame: 21, mv: 3341, energy: 60, offtune: 1344 },
    { hitFrame: 26, mv: 3341, energy: 60, offtune: 1344 },
    { hitFrame: 48, mv: 3341, energy: 60, offtune: 1344 },
  ], castConcerto: 800, castForte2: -10000,
  updateBuffs: () => applyCurrent(MULTI_THREADING_READY, 1),
});
/** Multi-threading without SQL: the bare cast (its 20% HP cost is no stat). */
const MultiThreading = lucyAction("Heavy - Multi-threading", { chains: [DualThreading], animFrames: 61, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 38, mv: 5965, energy: 75, offtune: 2520, ...HACKS },
    { hitFrame: 43, mv: 5965, energy: 75, offtune: 2520, ...HACKS },
    { hitFrame: 49, mv: 5965, energy: 75, offtune: 2520, ...HACKS },
    { hitFrame: 55, mv: 5965, energy: 75, offtune: 2520, ...HACKS },
  ], castConcerto: 800,
  requireBuff: MULTI_THREADING_READY,
  updateBuffs: () => {
    revokeCurrent(MULTI_THREADING_READY);
    if (isHeld(ALGORITHM_COMPACTION)) applyCurrent(OLD_NET_READY, 1);
  },
});
/** Multi-threading spending SQL: nanoka's own rows, 220.68% per hit (x3.7), energy 2.5, off-tune 16920. */
const MultiThreadingSQL = MultiThreading.variant("Heavy - Multi-threading (SQL)", { bullets: [
    { hitFrame: 38, mv: 22068, energy: 250, offtune: 16920, ...HACKS },
    { hitFrame: 43, mv: 22068, energy: 250, offtune: 16920, ...HACKS },
    { hitFrame: 49, mv: 22068, energy: 250, offtune: 16920, ...HACKS },
    { hitFrame: 55, mv: 22068, energy: 250, offtune: 16920, ...HACKS },
  ]});
/** The same under S2's +560%: nanoka's 393.65% per hit (x6.6), the SQL row's energy and off-tune. */
const MultiThreadingSQLS2 = MultiThreading.variant("Heavy - Multi-threading (SQL S2)", { bullets: [
    { hitFrame: 38, mv: 39365, energy: 250, offtune: 16920, ...HACKS },
    { hitFrame: 43, mv: 39365, energy: 250, offtune: 16920, ...HACKS },
    { hitFrame: 49, mv: 39365, energy: 250, offtune: 16920, ...HACKS },
    { hitFrame: 55, mv: 39365, energy: 250, offtune: 16920, ...HACKS },
  ]});
/** The Multi-threading a rotation writes: the SQL form while she holds SQL, S2's once S2 is held. */
const MultiThreadingResolver = new Action("Multi-threading Resolver", {
  resolve: () => (!isHeld(SQL) ? MultiThreading : isHeld(LC_S2) ? MultiThreadingSQLS2 : MultiThreadingSQL),
});

// --- Protocol Breach. Payload is the charge (20.05%+10.03%, each laying Hack - Shifting) and the
//     follow-up it triggers on hit (40.09%+10.03%+20.05%), one press as wuwalab plays it. Deadlock
//     replaces both Payload and Pulse Interference at 100 TCP and is Heavy Attack DMG.
const Skill1 = lucyAction("Skill - Payload", {
  animFrames: 55, animPriority: { 26: 6, 34: 2, 53: 2 }, castPriority: 4, cooldown: 60 * 15, maxForte1: 9999,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 16, mv: 2005, energy: 100, concerto: 160, offtune: 1008, forte1: 240, ...HACKS },
    { hitFrame: 20, mv: 1003, energy: 50, concerto: 80, offtune: 504, forte1: 120, ...HACKS },
    // the follow-up's own unlock_pulse_interference, ahead of its hit
    { hitFrame: 26, element: null, type: null, subtype: null, updateDebuffs: () => applyCurrent(PULSE_READY, 1) },
    { hitFrame: 30, mv: 4009, energy: 200, concerto: 320, offtune: 2016, forte1: 480 },
    { hitFrame: 42, mv: 1003, energy: 50, concerto: 80, offtune: 504, forte1: 120 },
    { hitFrame: 46, mv: 2005, energy: 100, concerto: 160, offtune: 1008, forte1: 240 },
  ],
});
const Skill3 = lucyAction("Skill - Pulse Interference", {
  animFrames: 156, animPriority: { 0: 5, 156: 2 }, castPriority: 6,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 2, mv: 3086, energy: 50, offtune: 1552, forte1: 120 },
    { hitFrame: 12, mv: 3086, energy: 50, offtune: 1552, forte1: 120 },
    { hitFrame: 114, mv: 6172, energy: 100, offtune: 3104, forte1: 240 },
    { hitFrame: 121, commitFrame: 114, mv: 6172, energy: 100, offtune: 3104, forte1: 240 },
    { hitFrame: 128, commitFrame: 114, mv: 6172, energy: 100, offtune: 3104, forte1: 240 },
    { hitFrame: 128, mv: 6172, energy: 100, offtune: 3104, forte1: 240 },
  ], castConcerto: 800, maxForte1: 9999,
  requireBuff: PULSE_READY,
  updateBuffs: () => {
    revokeCurrent(PULSE_READY);
    applyCurrent(DIGITAL_HANDSHAKE, 1);
  },
});
const Deadlock = lucyAction("Skill - Deadlock", { minForte1: 10000,
  animFrames: 72, animPriority: { 0: 10, 72: 4 }, castPriority: 5, timestop: [0, 60], motionStop: [0, 36], cooldown: 60 * 14,
  node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, bullets: [{ hitFrame: 35, mv: 5170, energy: 200, ...HACKS }, { hitFrame: 64, mv: 20677, energy: 800, ...HACKS }], castConcerto: 800, castForte1: -10000,
  updateBuffs: () => {
    // enters Algorithm Compaction with one SQL; casting it again inside the state grants neither
    if (!isHeld(ALGORITHM_COMPACTION)) { applyCurrent(ALGORITHM_COMPACTION, 1); applyCurrent(SQL, 1); }
  },
});

// --- Netrunner. Override is the Protocol Interface closing; Old Net Deep Dive is the same cast at
//     double the multiplier once Multi-threading has upgraded it.
// either Liberation clears TCP and fires the three damaging Spoofing Programs; ending Algorithm
// Compaction is the buff's own job, one phase later, so the Override still pays under it; either
// also resets Deadlock's cooldown, and the two are one button on one shared cooldown
const LIB_CD = new Cooldown({ frames: 60 * 25 });
const OVERRIDE = {
  resetForte1: true,
  cooldown: LIB_CD,
  updateBuffs: () => {
    resetCooldown(Deadlock);
    revokeCurrent(OLD_NET_READY);
  },
  // the Spoofing debuffs and programs come off the Liberation's hit, ahead of its own stats
  updateDebuffs: () => {
    applyEnemy(CYBERWARE_MALFUNCTION, 1);
    applyEnemy(BREACH_PROTOCOL, 1);
    queue(Ping);
    queue(SynapseBurnout);
    queue(CrippleMovement);
  },
};
const Lib = lucyAction("Liberation - Netrunner: Override", {
  animFrames: 262, animPriority: { 246: 2 }, castPriority: 10, timestop: [0, 202], motionStop: [0, 202],
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Heavy, bullets: [{ hitFrame: 251, commitFrame: 239, mv: 89465, offtune: 43200 }], castConcerto: 2000, resetEnergy: true, ...OVERRIDE, resetForte1: true
});
const ELib = lucyAction("Liberation - Old Net Deep Dive: Override", {
  requireBuff: OLD_NET_READY,
  animFrames: 262, animPriority: { 246: 2 }, castPriority: 10, timestop: [0, 262], motionStop: [0, 262],
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Heavy, bullets: [{ hitFrame: 251, commitFrame: 239, mv: 178929, offtune: 86400 }], castConcerto: 2000, resetEnergy: true, ...OVERRIDE, resetForte1: true
});
// queued off the Liberation rather than played, but active casts all the same — she fires them from
// inside her own Protocol Interface, on field, and marking them inactive would have her drop every
// "lost on switching out" buff she is holding partway through her own Liberation
const Ping = lucyAction("Liberation - Spoofing Program: Ping", { animFrames: 0, node: Node.Liberation, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 7953 }]});
const SynapseBurnout = lucyAction("Liberation - Spoofing Program: Synapse Burnout", { animFrames: 0, node: Node.Liberation, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 7953 }]});
const CrippleMovement = lucyAction("Liberation - Spoofing Program: Cripple Movement", {
  node: Node.Liberation, type: Type.Hack, scaling: Scaling.Tune, bullets: [{ hitFrame: 0, mv: 91183 }],
});

const Intro = lucyAction("Intro - Outdated Hallucination", {
  endPosition: Position.Grounded, animFrames: 57, noSwapFrames: 54, animPriority: { 45: 2 }, castPriority: 11, motionStop: [5, 32],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 34, mv: 6914, energy: 500, offtune: 4280 }, { hitFrame: 39, mv: 6914, energy: 500, offtune: 4280 }], castConcerto: 1000,
  updateBuffs: () => applyCurrent(OUTDATED_HALLUCINATION, 1),
});
const Outro = lucyAction("Outro - Countermeasure Program", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => { queueQTE(COUNTERMEASURE_HANDOFF); applyTeam(COUNTERMEASURE_MARKER, 1); }
});

/** Her answer to a Hack break — tune-scaled, so it reads Tune Break Boost and nothing else.
 *  Queued by the break rather than played, and capped in-game at one per target every 8s, which
 *  this engine has no clock to enforce. An ordinary active cast, like every Tune Break response:
 *  it is her own hit, and marking it inactive would have every "lost on switching out" buff she
 *  holds revoke itself the moment a break went off. */
const DataCrash = lucyAction("Tune Hack Response - Data Crash", {
  animFrames: 0,
  node: Node.Forte, cast: Cast.TuneBreak, type: Type.Hack, scaling: Scaling.Tune, bullets: [
    { hitFrame: 0, mv: 109419 },
    { hitFrame: 0, mv: 6839 },
    { hitFrame: 0, mv: 6839 },
    { hitFrame: 0, mv: 6839 },
    { hitFrame: 0, mv: 6839 },
  ],
});

/* ------------------------------------------------------------------------------------- buffs */

/** SQL: one stack, banked on entering Algorithm Compaction and spent by the next Multi-threading,
 *  which it turns into the SQL form (+270%, S2's +560%) through MultiThreadingResolver. */
const SQL = new Buff({
  name: "Lucy: SQL",
  afterAction: () => {
    if (runningAction(MultiThreadingSQL) || runningAction(MultiThreadingSQLS2)) revokeCurrent(SQL);
  },
});

/** Outdated Hallucination arms it: after her Intro, the *next* Pulse Interference grants 20 TCP on
 *  top of the 12.6 the cast banks itself. Spent as it pays, so a second Pulse Interference before the
 *  next Intro gets nothing. */
const OUTDATED_HALLUCINATION = new Buff({
  name: "Lucy: Outdated Hallucination",
  updateBuffs: () => {
    if (!runningAction(Skill3)) return;
    addGain({ forte1: 2000 });
    revokeCurrent(OUTDATED_HALLUCINATION);
  },
});

/** Digital Handshake: granted by Pulse Interference, "when Lucy is not in Algorithm Compaction and
 *  is the active Resonator, she gains TCP every second" — wuwalab's 0.6 TCP resource gain, 60f in,
 *  every 60f, its clock standing still while she is off field or in Compaction. Removed when TCP
 *  reaches 100 or either Liberation is cast. */
const DIGITAL_HANDSHAKE: Buff = new Buff({
  name: "Lucy: Digital Handshake",
  tick: {
    every: () => (isActive() && !isHeld(ALGORITHM_COMPACTION) ? 60 : 0),
    fire: () => {
      if (addForte1(60) >= 10000) revokeCurrent(DIGITAL_HANDSHAKE);
    },
  },
  updateBuffs: () => { if (casting(Cast.Liberation)) revokeCurrent(DIGITAL_HANDSHAKE); },
  afterHit: () => { if (forte1() >= 10000) revokeCurrent(DIGITAL_HANDSHAKE); },
});

/** Spoofing Program: Cyberware Malfunction — marked targets take 5% more DMG for 30s, so permanent
 *  uptime. Damage Taken rather than Total Damage, being the target's own vulnerability: enemy-pool
 *  gear runs through whoever is acting, so every attacker reads the identical 5%. */
const CYBERWARE_MALFUNCTION = new Debuff({
  name: "Spoofing Program: Cyberware Malfunction",
  duration: 60 * 30,
  stats: [[Stat.DamageTaken, 5]],
});

/** Spoofing Program: Breach Protocol — marked targets' DEF reduced 5% for 30s, permanent uptime. */
const BREACH_PROTOCOL = new Debuff({
  name: "Spoofing Program: Breach Protocol",
  duration: 60 * 30,
  applyStats: () => addEnemyStat(EnemyStat.DefReduce, 5),
});

/** Countermeasure Program (Outro), the handoff half: the incoming resonator gets +25% Basic Attack
 *  DMG Amplification for 14s or until they switch out. */
const COUNTERMEASURE_HANDOFF = new Buff({
  name: "Lucy: Outro",
  duration: 60 * 14,
  lostOnSwap: true,
  stats: [[Stat.Amp, 25, Type.Basic]],
});

/** The team half: a 25s marker on everyone, during which an active resonator *other than Lucy*
 *  inflicting Hack - Shifting gains +20% All DMG Amplification until they switch out. Team-wide so
 *  that it ticks on every member's own turn and can pay out onto whoever is actually acting; the
 *  DMG-reduction and Stagnate halves are defensive and carry no stat. */
const COUNTERMEASURE_MARKER = new Buff({
  name: "Lucy: Countermeasure Program (team)",
  duration: 60 * 25,
  updateDebuffs: () => {
    if (applied(TUNE_HACK_SHIFTING) && !isHeld(LUCY_RESONATOR)) {
      applyCurrent(COUNTERMEASURE_AMP, 1); 
      // revokeTeam, not revoke: the marker was handed out with applyTeam, so it lives in the
      // team-wide pool and a local revoke would silently do nothing
      revokeTeam(COUNTERMEASURE_MARKER);
    }
  },
});
const COUNTERMEASURE_AMP = new Buff({
  name: "Lucy: Countermeasure Program",
  lostOnSwap: true,
  stats: [[Stat.Amp, 20]],
});

/* --------------------------------------------------------------------------- resonance chain */

/** S1: the interrupt immunity is nothing this calculator computes, and the Quick Action is banked
 *  off the team *defeating* a Spoofing-marked target, which a single-target rotation never does
 *  (same standing as Function Cracking below). What lands is the Intro's own +20% ATK for 14s,
 *  which covers the visit it opens and goes with her outro. */
const LC_S1_ATK = new Buff({
  name: "Lucy S1: The Moon, a Ticket, and a Dream",
  duration: 60 * 14,
  stats: [[Stat.BonusAtk, 20]],
});

const LC_S1 = new Sequence({
  name: "Lucy S1: The Moon, a Ticket, and a Dream",
  grants: [{ on: onAction(Intro), buff: LC_S1_ATK }],
});

/** S2's own extra instance behind Pulse Interference: 450% of ATK, Heavy Attack DMG, applying every
 *  Spoofing Program's *continuous* status on hit — of which the two her Liberation already lays are
 *  the two that reach this formula (the others are an enemy ATK reduction with nothing to reduce, a
 *  defensive glitch, and a Common-Class-only conversion). The node's text gives it no energy,
 *  concerto or off-tune and a chain hit has no row of its own in nanoka's table, so it declares none. */
const S2Instance = lucyAction("Skill - Pulse Interference (S2 Additional)", {
  node: Node.Skill, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 45000 }],
  afterAction: () => {
    applyEnemy(CYBERWARE_MALFUNCTION, 1);
    applyEnemy(BREACH_PROTOCOL, 1);
  },
});

/** S2. Its first clause is the starting RAM, 24 up to 32 — which is every Spoofing Program at once
 *  (2+4+4+5+6+5+6 = 32) rather than the five worth having at 24, and the two it adds are the
 *  defensive Weapon Glitch and the Common-Class-only Cyberpsychosis, so nothing here changes. Its
 *  third is the SQL multiplier, which lives on SQL itself above. */
const LC_S2 = new Sequence({
  name: "Lucy S2: The Blackwall, the Past, the Escape",
  updateBuffs: () => { if (runningAction(Skill3)) queue(S2Instance); },
});

/** S3, all three clauses against nanoka's own second rows: the Override at 1341.97%/2683.94%
 *  (x1.5), Cripple Movement at 1504.51% and Data Crash at 2256.77% (x1.65 apiece). The Crit. DMG
 *  is the Override's own, so it is added on that cast rather than held as a buff. */
const LC_S3 = new Sequence({
  name: "Lucy S3: Cyberpunk",
  applyStats: () => {
    if (runningAction(Lib) || runningAction(ELib)) { addStat(Stat.MulMv, 50); addStat(Stat.CritDmg, 100); }
    if (runningAction(CrippleMovement) || runningAction(DataCrash)) addStat(Stat.MulMv, 65);
  },
});

/** S4: anyone on the team inflicting Hack - Shifting, not just her, so it is watched from
 *  hitGlobal — the same `applied()` her own Countermeasure Program reads. 20s team buff, so it
 *  goes on her own next Intro; "All-Attribute DMG Bonus" is a plain untagged bonus (CLAUDE.md). */
const LC_S4_TEAM = new Buff({
  name: "Lucy S4: No Living Legends in Night City",
  duration: 60 * 20,
  stats: [[Stat.DmgBonus, 20]],
});

const LC_S4 = new Sequence({
  name: "Lucy S4: No Living Legends in Night City",
  hitGlobal: () => { if (applied(TUNE_HACK_SHIFTING)) applyTeam(LC_S4_TEAM, 1); },
});

/** S5: a second Optical Illusion stack and a shield off it. Both are defensive and Ghost Cyberware
 *  itself holds no stat, so this is held for its name. */
const LC_S5 = new Sequence({ name: "Lucy S5: A Broken Path to Hell" });

/** S6: her own Heavy and Hack damage against a target carrying Hack - Shifting or sitting in Hack -
 *  Interfered — damage *taken*, so it goes on as Damage Taken the way Cyberware Malfunction's own
 *  5% does, scoped to the two damage types the node names. Only her gear holds it, so only her
 *  hits read it. The Stagnation duration is nothing this calculator computes. */
const LC_S6 = new Sequence({
  name: "Lucy S6: I Really Want to Stay At Your House",
  applyStats: () => {
    if (!stacksOfEnemy(TUNE_HACK_SHIFTING) && !stacksOfEnemy(TUNE_HACK_INTERFERED)) return;
    addStat(Stat.DamageTaken, 40, Type.Heavy);
    addStat(Stat.DamageTaken, 60, Type.Hack);
  },
});

/* --------------------------------------------------------------------------- kit and loadout */

/** Ghost Cyberware (Inherent Skill): Optical Illusion negates one instance of damage taken. Purely
 *  defensive, so it holds no stat. */
const LC_INHERENT_1 = new Inherent({ name: "Inherent: Ghost Cyberware" });

/** Function Cracking (Inherent Skill): Network Backdoor is banked off the team *defeating* a
 *  Botnet-marked Overlord/Calamity target, which a single-target rotation never does — nothing here
 *  can ever fire, and the piece is present for the kit's shape. */
const LC_INHERENT_2 = new Inherent({ name: "Inherent: Function Cracking" });

const LUCY_TALENTS = new Talent({
  name: "Lucy: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

const LUCY_MATRIX = matrix("Lucy", 0, {
  updateBuffs: () => { if (runningAction(Lib)) applyTeam(NETWORK_BACKDOOR, 1); },
});

export const LUCY_RESONATOR = new Resonator({
  name: "Lucy",
  combatStart: () => applyEnemy(TUNE_SHIFTABLE, 1),
  matrix: LUCY_MATRIX,
  talent: LUCY_TALENTS,
  inherent1: LC_INHERENT_1,
  inherent2: LC_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Pistols,
  color: "#efe8de",
  intro: Intro,
  outro: Outro,
  // Algorithm Compaction replaces the Basic and Mid-air Attacks
  swapIn: () => (isHeld(ALGORITHM_COMPACTION) ? EBA1 : BA1),
  swapInAir: () => (isHeld(ALGORITHM_COMPACTION) ? EMA : MA),
  maxEnergy: 12500,
  forteScale: [0.01, 0.01, 1, 1, 1],
  maxForte1: 10000,
  maxForte2: 10000,

  hitGlobal: () => tuneHackResponse(DataCrash),

  stats: [
    [Stat.BaseHp, 11025], [Stat.BaseAtk, 425], [Stat.BaseDef, 1148.8868],
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    [Stat.TBB, 10],
  ],
});

/* ---------------------------------------------------------------------------------- rotation */

/** Intro straight into Basics 2-4 (the Intro's own follow-up is Stage 2), then Payload — charge
 *  and follow-up in one press — and Pulse Interference, which cashes the 20 TCP the Intro armed onto
 *  it and lands the bar on exactly 100. Deadlock spends that for Algorithm Compaction and an SQL;
 *  Thread Shredding 2-4 bank 100.1 Root Access, Dual Threading spends it, Multi-threading cashes
 *  the SQL and upgrades the Liberation, and Old Net Deep Dive closes the state and drops the
 *  Spoofing Programs. Echo, then out. She is always the team's main DPS, so this covers opener and
 *  loop. */

const BA234 = new ActionGroup("Basic - Locked Thread 234", [BA2, BA3, BA4]);
const EBA234 = new ActionGroup("Basic - Thread Shredding 234", [EBA2, EBA3, EBA4]);

const LC_ROTATION = new Rotation([
  START_LAST, BA1.instaCancel(), Lib, ECHO, HA1.instaSwap(),

  INTRO_LAST, BA234.cancel(), Skill1, Skill3,
  Deadlock, EBA234.holdCancel(),
  DualThreading, MultiThreadingResolver, ECHO,
  ELib, HA1, HA2.instaSwap(), OUTRO,
]);

/** Adam Smasher carries its own 1pc set, so the other four echoes run two ordinary 2-piece sets
 *  instead of a 5pc — ATK and Spectro. */
const LC_ECHOES = [
  new EchoLoadout(ADAM_SMASHER_LUCY, SHATTERED_DREAMS_1PC, CELESTIAL_LIGHT_2PC, NEONLIGHT_LEAP_2PC),
  new EchoLoadout(ADAM_SMASHER_LUCY, SHATTERED_DREAMS_1PC, CELESTIAL_LIGHT_2PC, LINGERING_TUNES_2PC),
  new EchoLoadout(ADAM_SMASHER_LUCY, SHATTERED_DREAMS_1PC, LINGERING_TUNES_2PC, REEL_2PC),
  new EchoLoadout(ADAM_SMASHER_LUCY, SHATTERED_DREAMS_1PC, CELESTIAL_LIGHT_2PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(ADAM_SMASHER_LUCY, SHATTERED_DREAMS_1PC, LINGERING_TUNES_2PC, MOONLIT_CLOUDS_2PC),
];

/** Matrix — Function Cracking: her Resonance Skills mark an Overlord/Calamity target with Botnet
 *  Mark, and a teammate killing it under that mark hands her **Network Backdoor**. Nothing in this
 *  engine kills anything, so the trigger is placed where her rotation actually reaches it: one
 *  stack on her own Liberation, granted to the whole team.
 *
 *  Two stacks, 2 min each, so both stand for good once the loop has run twice (see CLAUDE.md's own
 *  wording rule). Each is +10% All DMG Amplification and +10% additional Hack DMG Multiplier, and
 *  the second pays a further +5% of each on top of its own — 10/10 at one stack, 25/25 at two. The
 *  Hack half is a motion-value multiplier scoped to Hack, so it lands on Cripple Movement and Data
 *  Crash and nothing else. */
const NETWORK_BACKDOOR = new Buff({
  name: "Lucy: Network Backdoor", maxStacks: 2, duration: 60 * 120,
  applyStats: () => {
    const bonus = 10 * frozenStacks() + (frozenStacks() >= 2 ? 5 : 0);
    addStat(Stat.Amp, bonus);
    addStat(Stat.MulMv, bonus, Type.Hack);
  },
});


export const LUCY = new Loadout({
  resonator: LUCY_RESONATOR,
  weapons: [SPECTRAL_TRIGGER, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: LC_ECHOES,
  sequences: [LC_S1, LC_S2, LC_S3, LC_S4, LC_S5, LC_S6],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill, Substat.Basic),
    rotation: LC_ROTATION,
});
