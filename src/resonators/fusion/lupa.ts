/**
 * Lupa, ported to the new engine — sequence-0 core loop, a limited 5-star
 * (`Tier.Limited`). A fusion broadblade sub-DPS/support. Wolflame (forte1) gates her enhanced
 * Heavy Attacks, each spending 50 Wolflame for a point of Wolfaith (forte2, no live 10s decay
 * tracked). At 2 Wolfaith, Resonance Skill is replaced by Dance With the Wolf. Her own Liberation
 * tops Wolflame to 100, spends every point of Wolfaith, and opens Pack Hunt (team ATK, escalating
 * on any Intro) and Glory (Fusion RES ignore, scaled off the team's own Fusion count).
 *
 * Numbers from nanoka.cc (character 1207) for MV; energy/concerto come off the migrated
 * (old-engine) sheet. Offtune has no migrated sheet row for her at all, so the old reference
 * file's own nanoka-sourced numbers are trusted as-is. forte1 (Wolflame)/forte2 (Wolfaith) deltas
 * are hand-derived from the kit text.
 *
 * Wolfaith's own 10s decay and Radiance Cleaver's tune-strained bonus (untracked enemy state) are
 * left unmodelled, same as the old reference. Ordinary-hit Wolflame regen is modelled on every
 * Normal Attack; Burning Matchpoint's own +500% Wolflame multiplier on top is BURNING_MATCHPOINT
 * below.
 *
 * Her real two Inherent Skills, confirmed off the page's own "INHERENT SKILLS" section:
 *  - Remember My Name: Sprint state/interrupt resistance — no combat-formula effect this engine
 *    models, so it's a do-nothing marker.
 *  - Applause of Victory: cooldown-reset half is a genuine no-op, but its own bundled "Resonance
 *    Liberation - Glory" text is where Glory (team Fusion RES ignore) actually comes from — not a
 *    bare base-kit Liberation effect (see GLORY's own trigger below).
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  isType,
  isHeld,
  applyCurrent,
  applyTeam,
  applyEnemy,
  revokeCurrent,
  revokeTeam,
  revokeEnemy,
  casting,
  currentHit, addGain,
  onAction,
  runningAction,
  currentTeam,
  addStat,
  frozenStacks,
  stacksOfTeam,
  queueOn,
  queueQTE,
  onCast,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, NOINTRO, ECHO, ActionTag, INTRO, OUTRO } from "../../engine/rotation.js";
import { WILDFIRE_MARK } from "../../weapons/broadblade.js";
import { NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { LIONESS_OF_GLORY, CLAWPRINT_5PC } from "../../echoes/septimont.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function lupaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

/** "Lupa can perform Feral Fang within a certain period of time" after Shewolf's Hunt: spent by
 *  Feral Fang, gone if she is switched out first. */
const FERAL_FANG_READY = new Buff({ name: "Lupa: Feral Fang Ready", lostOnSwap: true });

/** "Use Basic Attack or Resonance Skill in time to cast Foebreaker": opened by Fire-Kissed Glory,
 *  spent by Foebreaker. */
const FOEBREAKER_READY = new Buff({ name: "Lupa: Foebreaker Ready" });

/** Wild Hunt: entered the moment Pack Hunt reaches its cap (once per Pack Hunt), and what makes
 *  her next Intro Nowhere to Run!, which spends it. Held team-wide: it is entered on whoever's
 *  Intro tops Pack Hunt up. */
const WILD_HUNT = new Buff({ name: "Lupa: Wild Hunt" });

/** Burning Matchpoint: opened by Foebreaker, ends the moment either form of Dance With the Wolf
 *  is cast. While held, true Normal Attack hits (not her enhanced Heavy Attacks) restore 500%
 *  MORE Wolflame on hit — a straight +5x of the action's own declared forte1 gain. */
const BURNING_MATCHPOINT: Buff = new Buff({
  name: "Lupa: Burning Matchpoint", duration: 60 * 12,
  updateDebuffs: () => { if (isType(Type.Basic)) addGain({ forte1: 5 * currentHit().forte1 }); },
  updateBuffs: () => { if (runningAction(FSkill) || runningAction(UFSkill)) revokeCurrent(BURNING_MATCHPOINT); },
});

// energy/concerto off the migrated sheet; offtune off the old reference's own nanoka numbers (see
// file header). Ordinary Basic/Heavy hits feed Wolflame in this simplified model.
const BA1 = lupaAction("Basic - Flaming Star 1", { animFrames: 42, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 2252, energy: 34, concerto: 67, offtune: 1066, forte1: 18750 },
    { hitFrame: 23, mv: 2252, energy: 34, concerto: 67, offtune: 1066, forte1: 18750 },
    { hitFrame: 34, mv: 4504, energy: 67, concerto: 134, offtune: 2132, forte1: 37500 },
  ]});
const BA2 = lupaAction("Basic - Flaming Star 2", { animFrames: 32, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 10, mv: 9008, energy: 134, concerto: 267, offtune: 4264, forte1: 75000 }]});
const BA3 = lupaAction("Basic - Flaming Star 3", { animFrames: 67, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 20, mv: 7884, energy: 117, concerto: 234, offtune: 3732, forte1: 62287 },
    { hitFrame: 24, mv: 1314, energy: 20, concerto: 39, offtune: 622, forte1: 10452 },
    { hitFrame: 30, mv: 1314, energy: 20, concerto: 39, offtune: 622, forte1: 10452 },
    { hitFrame: 35, mv: 1314, energy: 20, concerto: 39, offtune: 622, forte1: 10452 },
    { hitFrame: 41, mv: 1314, energy: 20, concerto: 39, offtune: 622, forte1: 10452 },
    { hitFrame: 46, mv: 1314, energy: 20, concerto: 39, offtune: 622, forte1: 10452 },
    { hitFrame: 51, mv: 1314, energy: 20, concerto: 39, offtune: 622, forte1: 10453 },
  ]});
const BA4 = lupaAction("Basic - Flaming Star 4", { animFrames: 89, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 7387, energy: 110, concerto: 219, offtune: 3497, forte1: 52481 },
    { hitFrame: 47, mv: 7387, energy: 110, concerto: 219, offtune: 3497, forte1: 52481 },
    { hitFrame: 66, mv: 4925, energy: 73, concerto: 146, offtune: 2331, forte1: 35019 },
    { hitFrame: 73, mv: 4925, energy: 73, concerto: 146, offtune: 2331, forte1: 35019 },
  ]});
/** Basic Attack - Starfall, the enhanced follow-up after a plunging attack or dodge counter. */
const EBA = lupaAction("Basic - Flaming Star: Starfall", { animFrames: 73, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 6, mv: 1265, energy: 19, concerto: 38, offtune: 599, forte1: 3760 },
    { hitFrame: 13, commitFrame: 6, mv: 1265, energy: 19, concerto: 38, offtune: 599, forte1: 3760 },
    { hitFrame: 20, commitFrame: 6, mv: 1265, energy: 19, concerto: 38, offtune: 599, forte1: 3760 },
    { hitFrame: 28, commitFrame: 6, mv: 1265, energy: 19, concerto: 38, offtune: 599, forte1: 3760 },
    { hitFrame: 42, mv: 11806, energy: 175, concerto: 350, offtune: 5589, forte1: 34960 },
  ]});

/** Wolf's Descent, her plunging attack — never placed in the rotation below, kept for completeness. */
const MA = lupaAction("Mid-air - Flaming Star: Plunge", { animFrames: 69, animPriority: { 0: 6, 40: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 26, mv: 2620, energy: 39, concerto: 78, offtune: 1240, forte1: 12500 },
    { hitFrame: 40, mv: 5239, energy: 78, concerto: 155, offtune: 2480, forte1: 25000 },
    { hitFrame: 55, mv: 2620, energy: 39, concerto: 78, offtune: 1240, forte1: 12500 },
  ]});
/** Flaming Star, her dodge counter — same treatment as `MA` above. */
const DC = lupaAction("Dodge Counter - Flaming Star", { animFrames: 73, animPriority: { 63: 2 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 15, mv: 3418, energy: 51, concerto: 102, offtune: 1618 },
    { hitFrame: 23, commitFrame: 15, mv: 3418, energy: 51, concerto: 102, offtune: 1618 },
    { hitFrame: 30, commitFrame: 15, mv: 3418, energy: 51, concerto: 102, offtune: 1618 },
    { hitFrame: 37, commitFrame: 15, mv: 3418, energy: 51, concerto: 102, offtune: 1618 },
    { hitFrame: 49, mv: 13672, energy: 203, concerto: 405, offtune: 6472 },
  ], castConcerto: 1000});

const MA1 = lupaAction("Mid-air - Flaming Star 1", { animFrames: 30, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 14, mv: 7673, energy: 114, concerto: 227, offtune: 3632, forte1: 70000 }]});
const MA2 = lupaAction("Mid-air - Flaming Star 2", { animFrames: 56, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 7723, energy: 115, concerto: 229, offtune: 3656, forte1: 65000 },
    { hitFrame: 23, mv: 1931, energy: 29, concerto: 58, offtune: 914, forte1: 16250 },
    { hitFrame: 27, commitFrame: 23, mv: 1931, energy: 29, concerto: 58, offtune: 914, forte1: 16250 },
    { hitFrame: 32, commitFrame: 23, mv: 1931, energy: 29, concerto: 58, offtune: 914, forte1: 16250 },
    { hitFrame: 36, commitFrame: 23, mv: 1931, energy: 29, concerto: 58, offtune: 914, forte1: 16250 },
  ]});
const MA3 = lupaAction("Mid-air - Flaming Star 3", { maxForte1: 499999, animFrames: 71, animPriority: { 0: 6, 46: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 19, mv: 2848, energy: 43, concerto: 85, offtune: 1348 },
    { hitFrame: 50, mv: 2848, energy: 43, concerto: 85, offtune: 1348 },
  ]});

// base cast, plus three 50-Wolflame-consuming enhanced forms (each earns a point of Wolfaith
// rather than restoring the gauge)
const HA = lupaAction("Heavy - Flaming Star", { maxForte1: 499999, animFrames: 51, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 18, mv: 5636, energy: 84, concerto: 167, offtune: 2668 },
    { hitFrame: 28, mv: 5636, energy: 84, concerto: 167, offtune: 2668 },
  ]});
/** Firestrike, at Wolflame 50+. Counts as Heavy Attack DMG. */
const EMA3 = lupaAction("Mid-air - Firestrike", { minForte1: 500000, animFrames: 71, animPriority: { 0: 6, 46: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 32, mv: 2848, energy: 43, concerto: 500, offtune: 1348 },
    { hitFrame: 50, mv: 2848, energy: 43, concerto: 500, offtune: 1348, forte2: 1 },
  ], castForte1: -500000});
/** Wolf's Gnawing, at Wolflame 50+. */
const EHA3 = lupaAction("Heavy - Wolf's Gnawing", { minForte1: 500000, animFrames: 50, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 26, mv: 5611, energy: 83, concerto: 500, offtune: 2656 },
    { hitFrame: 40, mv: 5611, energy: 83, concerto: 500, offtune: 2656, forte2: 1 },
  ], castForte1: -500000});
/** Wolf's Claw, at Wolflame 50+ and Wolfaith 1+. */
const EHA4 = lupaAction("Heavy - Wolf's Claw", { minForte1: 500000, minForte2: 1, animFrames: 96, animPriority: { 2: 4, 82: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 24, mv: 7215, energy: 107, concerto: 300, offtune: 3415 },
    { hitFrame: 41, mv: 1804, energy: 27, concerto: 75, offtune: 854 },
    { hitFrame: 46, commitFrame: 41, mv: 1804, energy: 27, concerto: 75, offtune: 854 },
    { hitFrame: 50, commitFrame: 41, mv: 1804, energy: 27, concerto: 75, offtune: 854 },
    { hitFrame: 54, commitFrame: 41, mv: 1804, energy: 27, concerto: 75, offtune: 854 },
    { hitFrame: 75, mv: 9619, energy: 143, concerto: 400, offtune: 4554, forte2: 1 },
  ], castForte1: -500000});

// Shewolf's Hunt and its Feral Fang follow-up, each restoring 15 Wolflame
const Skill1 = lupaAction("Skill - Shewolf's Hunt", {
  animFrames: 56, animPriority: { 30: 2 }, castPriority: 4, cooldown: 60 * 12,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 28, mv: 14077, energy: 209, concerto: 417, offtune: 6664, forte1: 150000 }],
  updateBuffs: () => applyCurrent(FERAL_FANG_READY, 1),
  updateDebuffs: () => applyEnemy(LUPA_MARK, 1),
});
/** Feral Fang: +50% DMG Multiplier against the marked target, kept as an explicit MulMv add (see
 *  LUPA_RESONATOR's own updateBuffs() below) rather than baked into mv, so the trace shows where it comes from. */
const Skill2 = lupaAction("Skill - Feral Fang", { requireBuff: FERAL_FANG_READY, updateBuffs: () => revokeCurrent(FERAL_FANG_READY), animFrames: 63, animPriority: { 57: 0 }, castPriority: 4, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 44, mv: 31361, energy: 1367, offtune: 5328, forte1: 150000 }]});

/** Foebreaker: consumes every point of Wolflame. Always placed right after Liberation, whose own
 *  updateBuffs() hard-resets Wolflame to exactly 100 first, so forte1: -100 always lands on 0. Opens
 *  Burning Matchpoint (see BURNING_MATCHPOINT below). */
const USkill = lupaAction("Skill - Foebreaker", {
  animFrames: 58, animPriority: { 10: 6, 54: 2 }, castPriority: 4,
  node: Node.Liberation, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 48, mv: 30446, concerto: 2000, offtune: 6448 }], castForte1: -1000000,
  requireBuff: FOEBREAKER_READY,
  updateBuffs: () => {
    revokeCurrent(FOEBREAKER_READY);
    applyCurrent(BURNING_MATCHPOINT, 1);
  },
});

// tops Wolflame to 100, spends every point of Wolfaith, opens Pack Hunt/Glory
const Liberation = lupaAction("Liberation - Fire-Kissed Glory", {
  animFrames: 220, animPriority: { 200: 4, 210: 2 }, castPriority: 10, timestop: [0, 220], motionStop: [13, 220], cooldown: 60 * 20,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 168, mv: 82044, offtune: 48000 }], castConcerto: 2000, castForte1: 1500000, resetEnergy: true,
  // "Restores 100 points of Wolflame" is a hard top-off, not additive on top of whatever was
  // already held, and every point of Wolfaith goes: both reset ahead of the declared +100
  resetForte1: true, resetForte2: true,
  // a fresh window at its own one stack (6% ATK): the Liberation *grants* Pack Hunt, and the
  // Intros that enhanced the last one don't carry into it
  updateBuffs: () => {
    revokeTeam(PACK_HUNT);
    applyTeam(PACK_HUNT, 1);
    applyCurrent(FOEBREAKER_READY, 1);
  },
});

// Dance With the Wolf and its Climax form, each spending every point of Wolfaith (a fixed -2
// delta — always exactly 2 in this fixed-rotation-line, the only gate that lets either one fire)
// both Dance With the Wolf forms put Backup Ready on the team
const BACKUP = { updateBuffs: () => applyTeam(LUPA_BACKUP_READY, 1) };
const FSkill = lupaAction("Forte Skill - Dance With the Wolf", { minForte2: 2, animFrames: 151, animPriority: { 0: 8, 20: 4, 128: 2 }, castPriority: 4, node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, bullets: [
    { hitFrame: 54, mv: 5602, energy: 300, concerto: 150, offtune: 1602 },
    { hitFrame: 67, mv: 4202, energy: 225, concerto: 113, offtune: 1201 },
    { hitFrame: 73, mv: 4202, energy: 225, concerto: 113, offtune: 1201 },
    { hitFrame: 78, mv: 4202, energy: 225, concerto: 113, offtune: 1201 },
    { hitFrame: 84, mv: 4202, energy: 225, concerto: 113, offtune: 1201 },
    { hitFrame: 102, mv: 33611, energy: 1800, concerto: 900, offtune: 9610 },
  ], castForte2: -2, ...BACKUP });
// cast in Burning Matchpoint; S6 lifts that, but no rotation casts it outside one
const UFSkill = lupaAction("Forte Skill - Dance With the Wolf: Climax", { minForte2: 2, requireBuff: BURNING_MATCHPOINT, animFrames: 151, animPriority: { 12: 8, 32: 4, 141: 2 }, castPriority: 4, noSwapFrames: 12, node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, bullets: [
    { hitFrame: 54, mv: 7563, energy: 300, concerto: 300, offtune: 5442 },
    { hitFrame: 67, mv: 5672, energy: 225, concerto: 225, offtune: 4081 },
    { hitFrame: 73, mv: 5672, energy: 225, concerto: 225, offtune: 4081 },
    { hitFrame: 78, mv: 5672, energy: 225, concerto: 225, offtune: 4081 },
    { hitFrame: 84, mv: 5672, energy: 225, concerto: 225, offtune: 4081 },
    { hitFrame: 102, mv: 45375, energy: 1800, concerto: 1800, offtune: 32650 },
  ], castForte2: -2, ...BACKUP });
/** Set the Arena Ablaze — queued by LUPA_BACKUP_READY the moment a teammate's Liberation earns
 *  it, not placed in the rotation directly. */
const fskillFUA = lupaAction("Forte Skill - Set the Arena Ablaze", { tag: ActionTag.Field, animFrames: 96, node: Node.Forte, type: Type.Skill, bullets: [{ hitFrame: 57, mv: 4235, offtune: 1920 }, { hitFrame: 70, mv: 16940, offtune: 7680 }]});

const Intro = lupaAction("Intro - Try Focusing, Eh?", { qteFrames: 10, animFrames: 70, noSwapFrames: 60, animPriority: { 60: 2 }, castPriority: 11, motionStop: [6, 60], node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 24, mv: 2976, energy: 150, offtune: 1409 },
    { hitFrame: 34, mv: 4216, energy: 213, offtune: 1996 },
    { hitFrame: 38, commitFrame: 34, mv: 4216, energy: 213, offtune: 1996 },
    { hitFrame: 43, commitFrame: 34, mv: 4216, energy: 213, offtune: 1996 },
    { hitFrame: 47, commitFrame: 34, mv: 4216, energy: 213, offtune: 1996 },
  ], castConcerto: 1000});
/** Nowhere to Run! — replaces plain Intro once Pack Hunt is maxed (see LUPA_RESONATOR's own intro()
 *  selector below). Casting it ends Pack Hunt/Glory, ahead of every other hook of its cast and of
 *  its own damage — bar S6, which keeps both windows. */
const EIntro = lupaAction("Intro - Nowhere to Run!", {
  qteFrames: 68, animFrames: 150, animPriority: { 140: 2 }, castPriority: 11, timestop: [6, 90], motionStop: [6, 150], node: Node.Intro, cast: Cast.Intro, type: Type.Liberation,
  requireBuff: WILD_HUNT,
  updateGlobal: () => {
    revokeTeam(WILD_HUNT);
    if (isHeld(LP_S6)) return;
    revokeTeam(PACK_HUNT);
    revokeTeam(GLORY);
  },
  bullets: [
    { hitFrame: 114, mv: 79357, energy: 800, offtune: 12800 },
    { hitFrame: 116, mv: 4960, energy: 50, offtune: 800 },
    { hitFrame: 120, commitFrame: 116, mv: 4960, energy: 50, offtune: 800 },
    { hitFrame: 124, commitFrame: 116, mv: 4960, energy: 50, offtune: 800 },
    { hitFrame: 129, commitFrame: 116, mv: 4960, energy: 50, offtune: 800 },
  ], castConcerto: 1000});
/** Stand by Me, Warrior: no damage of its own, just the outro handoff. */
const Outro = lupaAction("Outro - Stand by Me, Warrior", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => queueQTE(LUPA_OUTRO),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Pack Hunt: 1 stack (6% team ATK) granted outright by her own Liberation, escalating +1 more on
 *  any team member's own Intro, capped at 3 (18% ATK). "Overlord/Calamity Class" is a target-tier
 *  gate this engine has no notion of, so the +10% Fusion DMG Bonus (and its "3+ Fusion members"
 *  escalation) applies unconditionally. Ended by her own intro() selector below once maxed. */
const PACK_HUNT = new Buff({
  name: "Lupa: Pack Hunt", maxStacks: 3, duration: 60 * 35,
  stats: [[Stat.BonusAtk, 6]], perStack: true,
  grants: [{ on: onCast(Cast.Intro), to: BuffTarget.Team }],
  applyStats: () => {
    addStat(Stat.DmgBonus, 10, Attribute.Fusion);
    // S3 drops the three-Fusion requirement on the second half — her node, read off her own slot,
    // since this buff is the team's and `isHeld()` here would only ever answer for whoever is up
    const fusionCount = currentTeam().slots.filter((s) => s.resonator?.element === Attribute.Fusion).length;
    if (fusionCount >= 3) addStat(Stat.DmgBonus, 10, Attribute.Fusion);
    else if (lupaHolds(LP_S3)) asSource(LP_S3, () => addStat(Stat.DmgBonus, 10, Attribute.Fusion));
  },
});

/** Whether Lupa herself has a node equipped, asked from a team buff — those pay out on whoever is
 *  acting, so `isHeld()` there answers for that resonator rather than for the buff's owner. */
const lupaHolds = (node: Sequence): boolean =>
  currentTeam().slots.find((m) => m.resonator === LUPA_RESONATOR)?.isHeld(node) ?? false;

/** Glory: 3% Fusion RES ignore a stack, one per Fusion resonator on the team (herself included, up
 *  to 3), +6% flat once all three are held — so 3%, 6% or 15% by the count, read live off the
 *  team's own Fusion count at her Liberation cast. Just the payout — its trigger lives on
 *  LP_INHERENT_2 below (see file header). */
const GLORY = new Buff({
  name: "Lupa: Glory", maxStacks: 3, duration: 60 * 35,
  // the count is who it is scaled by, not a stack of anything: it reads as the Fusion members
  display: () => `Lupa: Glory (${frozenStacks()} Fusion)`,
  applyStats: () => {
    // S3 replaces the count outright — a flat 15% for the team however many Fusion resonators
    // stand in it, which is what the count reaches at three anyway. Her node, read off her own
    // slot: this buff pays whoever is acting, not its owner
    if (lupaHolds(LP_S3)) { asSource(LP_S3, () => addStat(Stat.ResIgnore, 15, Attribute.Fusion)); return; }
    addStat(Stat.ResIgnore, 3 * frozenStacks(), Attribute.Fusion);
    if (frozenStacks() >= 3) addStat(Stat.ResIgnore, 6, Attribute.Fusion);
  },
});

/** Stand by Me, Warrior — the outro handoff. Short window, so it still counts on the recipient's
 *  own outro (see echoes/jinzhou.ts's HERON_HANDOFF). */
const LUPA_OUTRO = new Buff({
  name: "Lupa: Outro",
  duration: 60 * 14,
  stats: [[Stat.Amp, 20, Attribute.Fusion], [Stat.Amp, 25, Type.Basic]],
  lostOnSwap: true,
});

/** Wildfire Banner: +12% ATK for 8s on casting Feral Fang, Wolf's Gnawing/Wolf's Claw/Firestrike,
 *  Fire-Kissed Glory, or Dance With the Wolf/its Climax form — part of her Forte Circuit, not an
 *  Inherent Skill. Just the payout — its trigger lives on LUPA_RESONATOR's own updateBuffs() below. */
const WILDFIRE_BANNER = new Buff({
  name: "Lupa: Wildfire Banner",
  duration: 60 * 8,
  stats: [[Stat.BonusAtk, 12]],
  afterAction: () => { if (runningAction(fskillFUA)) revokeCurrent(WILDFIRE_BANNER); },
});

/** Remember My Name (Inherent Skill): a Sprint state/interrupt resistance passive — see file header. */
const LP_INHERENT_1 = new Inherent({ name: "Inherent: Remember My Name" });
/** Applause of Victory (Inherent Skill): Glory's own trigger — see file header. */
const LP_INHERENT_2 = new Inherent({
  name: "Inherent: Applause of Victory",
  updateBuffs: () => {
    if (runningAction(Liberation)) {
      revokeTeam(GLORY);
      applyTeam(GLORY, currentTeam().slots.filter((s) => s.resonator?.element === Attribute.Fusion).length);
    }
  },
});

/** Mark: a genuine debuff on the enemy — Shewolf's Hunt (Skill1) marks the target, Feral Fang
 *  (Skill2) is the "against the marked target" follow-up that consumes it for +50% DMG Multiplier.
 *  Also ends on a Liberation cast with the mark still up and unconsumed. */
const LUPA_MARK = new Debuff({
  name: "Lupa: Mark",
  duration: 60 * 8,
  applyStats: () => { if (runningAction(Skill2)) addStat(Stat.MulMv, 50); },
  afterAction: () => { if (runningAction(Skill2) || runningAction(Liberation)) revokeEnemy(LUPA_MARK); },
});

/** Set the Arena Ablaze: Dance With the Wolf/its Climax form leave this ready on her — whoever
 *  next casts a Liberation while she holds it (not her own) queues fskillFUA onto her own slot,
 *  same "queued and owned by the kit that earned it" shape as Roccia's own Magic Box. Granted
 *  team-wide so its own updateBuffs() sees any teammate's Liberation cast, not just her own turn. */
const LUPA_BACKUP_READY = new Buff({
    name: "Lupa: Set the Arena Ablaze",
    duration: 60 * 8,
    updateBuffs: () => {
        if (casting(Cast.Liberation) && currentTeam().slot.resonator !== LUPA_RESONATOR) {
            queueOn(LUPA_RESONATOR, fskillFUA);
            revokeTeam(LUPA_BACKUP_READY);
        }
    }
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: +20% Crit. Rate for 10s off Fire-Kissed Glory — her own window, so until her outro — and 10
 *  Concerto with it. The interrupt immunity is no stat. */
const NAMELESS_ONE = new Buff({
  name: "Lupa S1: Behold the Nameless One",
  duration: 60 * 10,
  stats: [[Stat.CritRate, 20]],
});
const LP_S1 = new Sequence({
  name: "Lupa S1: Behold the Nameless One",
  grants: [{ on: onAction(Liberation), buff: NAMELESS_ONE }],
  updateDebuffs: () => { if (runningAction(Liberation)) addGain({ concerto: 1000 }); },
});

/** S2: +20% Fusion DMG Bonus to the team a stack, two at most, off Fire-Kissed Glory or any of the
 *  three Wolflame-spending heavies — 30s, so permanent. */
const HER_HUNTING_FIELD = new Buff({
  name: "Lupa S2: Every Ground, Her Hunting Field", maxStacks: 2, duration: 60 * 30,
  stats: [[Stat.DmgBonus, 20, Attribute.Fusion]], perStack: true,
});
const LP_S2 = new Sequence({
  name: "Lupa S2: Every Ground, Her Hunting Field",
  updateBuffs: () => {
    if (runningAction(Liberation) || runningAction(EHA3) || runningAction(EHA4) || runningAction(EMA3)) applyTeam(HER_HUNTING_FIELD, 1);
  },
});

/** S3: Nowhere to Run! at x2 — nanoka's second rows (1587.14%+99.20%*4), and nothing else
 *  multiplies it. Pack Hunt's own Fusion-count gate and Glory's extra 15% are paid by those two. */
const LP_S3 = new Sequence({
  name: "Lupa S3: Wolflame Howls in Her Wake",
  applyStats: () => { if (runningAction(EIntro)) addStat(Stat.MulMv, 100); },
});

/** S4: Dance With the Wolf: Climax at x2.25 — nanoka's second rows (170.16%+127.62%*4+1020.92%),
 *  and nothing else multiplies it either. */
const LP_S4 = new Sequence({
  name: "Lupa S4: High and Aflame Is Her Banner",
  applyStats: () => { if (runningAction(UFSkill)) addStat(Stat.MulMv, 125); },
});

/** S5: +15% Resonance Liberation DMG Bonus for 10s off either Intro — hers alone, so until her outro. */
const THUNDEROUS_TRIUMPH = new Buff({
  name: "Lupa S5: Embrace the Thunderous Triumph",
  duration: 60 * 10,
  stats: [[Stat.DmgBonus, 15, Type.Liberation]],
});
const LP_S5 = new Sequence({
  name: "Lupa S5: Embrace the Thunderous Triumph",
  updateBuffs: () => { if (runningAction(Intro) || runningAction(EIntro)) applyCurrent(THUNDEROUS_TRIUMPH, 1); },
});

/** S6: 30% of the target's DEF ignored on Climax, Fire-Kissed Glory and Nowhere to Run! — the old
 *  ignore, hers being a 2.4 kit (stats.ts) — 100 Wolflame back on Feral Fang, and Nowhere to Run!
 *  keeping both Liberation windows alive (in her own intro selector). */
const LP_S6 = new Sequence({
  name: "Lupa S6: To the Brightest Flaming Star",
  applyStats: () => {
    if (runningAction(UFSkill) || runningAction(Liberation) || runningAction(EIntro)) addStat(Stat.DefIgnoreOld, 30);
  },
  updateDebuffs: () => { if (runningAction(Skill2)) addGain({ forte1: 1000000 }); },
});

const LP_SEQUENCES = [LP_S1, LP_S2, LP_S3, LP_S4, LP_S5, LP_S6];

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const LUPA_TALENTS = new Talent({
  name: "Lupa: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. Sequence-0 only — a limited 5-star (`Tier.Limited`). */
const LUPA_RESONATOR = new Resonator({
  name: "Lupa",
  stats: [[Stat.BaseHp, 11912.5], [Stat.BaseAtk, 387.5], [Stat.BaseDef, 1185.5534]],
  talent: LUPA_TALENTS,
  inherent1: LP_INHERENT_1,
  inherent2: LP_INHERENT_2,
  element: Attribute.Fusion,
  weapon: WeaponType.Broadblade,
  color: "#e8483a",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  intro: () => (stacksOfTeam(WILD_HUNT) ? EIntro : Intro),
  outro: Outro,
  maxEnergy: 12500,
  forteScale: [0.0001, 1, 1, 1, 1],
  maxForte1: 1000000,
  maxForte2: 2,

  // any Intro that takes Pack Hunt to its cap enters Wild Hunt, read ahead of that Intro's own stack
  updateGlobal: () => {
    if (casting(Cast.Intro) && stacksOfTeam(PACK_HUNT) === 2) applyTeam(WILD_HUNT, 1);
  },

  // every cast that arms Set the Arena Ablaze
  updateBuffs: () => {
    if (runningAction(Skill2) || runningAction(EHA3) || runningAction(EHA4) || runningAction(EMA3) || runningAction(Liberation) || runningAction(FSkill) || runningAction(UFSkill)) {
      applyCurrent(WILDFIRE_BANNER, 1);
    }
  },

});

const MA12 = new ActionGroup("Mid-air - Flaming Star 12", [MA1, MA2]);
const Skill12 = new ActionGroup("Skill - Shewolf's Hunt + Feral Fang", [Skill1, Skill2]);

const LP_LOOP = new Rotation([
  NOINTRO, Skill1, INTRO, ECHO.instaDodge(),
  Liberation, USkill, MA12, EMA3, EHA4.mashCancel(), UFSkill.swapCancel(), OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit, weapon,
// mainslot echo, sonata pieces, mainstat/substat
export const LUPA = new Loadout({
  resonator: LUPA_RESONATOR,
  weapons: [WILDFIRE_MARK, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: [
    new EchoLoadout(LIONESS_OF_GLORY, CLAWPRINT_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill, Substat.Heavy),
  rotation: { 0: LP_LOOP },
  sequences: LP_SEQUENCES,
});
