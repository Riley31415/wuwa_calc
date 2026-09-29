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
  currentAction, pressed,
  onAction,
  runningAction,
  currentTeam,
  addStat,
  frozenStacks,
  stacksOfTeam,
  queueOn,
  queueOutro,
  onCast,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, NOINTRO, ECHO, ActionTag, INTRO } from "../../engine/rotation.js";
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

// energy/concerto off the migrated sheet; offtune off the old reference's own nanoka numbers (see
// file header). Ordinary Basic/Heavy hits feed Wolflame in this simplified model.
const BA1 = lupaAction("Basic - Flaming Star 1", { animFrames: 42, commitFrames: 34, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 10, mv: 22.52, energy: 0.34, concerto: 0.67, offtune: 1066, forte1: 1.875 },
    { at: 23, mv: 22.52, energy: 0.34, concerto: 0.67, offtune: 1066, forte1: 1.875 },
    { at: 34, mv: 45.04, energy: 0.66, concerto: 1.33, offtune: 2132, forte1: 3.75 },
  ]});
const BA2 = lupaAction("Basic - Flaming Star 2", { animFrames: 32, commitFrames: 10, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 10, mv: 90.08, energy: 1.34, concerto: 2.67, offtune: 4264, forte1: 7.5 }]});
const BA3 = lupaAction("Basic - Flaming Star 3", { animFrames: 67, commitFrames: 51, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 20, mv: 78.84, energy: 1.17, concerto: 2.34, offtune: 3732, forte1: 6.2287 },
    { at: 24, mv: 13.14, energy: 0.2, concerto: 0.39, offtune: 622, forte1: 1.0452 },
    { at: 30, mv: 13.14, energy: 0.2, concerto: 0.39, offtune: 622, forte1: 1.0452 },
    { at: 35, mv: 13.14, energy: 0.2, concerto: 0.39, offtune: 622, forte1: 1.0452 },
    { at: 41, mv: 13.14, energy: 0.2, concerto: 0.39, offtune: 622, forte1: 1.0452 },
    { at: 46, mv: 13.14, energy: 0.2, concerto: 0.39, offtune: 622, forte1: 1.0452 },
    { at: 51, mv: 13.14, energy: 0.2, concerto: 0.39, offtune: 622, forte1: 1.0453 },
  ]});
const BA4 = lupaAction("Basic - Flaming Star 4", { animFrames: 89, commitFrames: 73, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 10, mv: 73.87, energy: 1.1, concerto: 2.19, offtune: 3497, forte1: 5.2481 },
    { at: 47, mv: 73.87, energy: 1.1, concerto: 2.19, offtune: 3497, forte1: 5.2481 },
    { at: 66, mv: 49.25, energy: 0.73, concerto: 1.46, offtune: 2331, forte1: 3.5019 },
    { at: 73, mv: 49.25, energy: 0.73, concerto: 1.46, offtune: 2331, forte1: 3.5019 },
  ]});
/** Basic Attack - Starfall, the enhanced follow-up after a plunging attack or dodge counter. */
const EBA = lupaAction("Basic - Flaming Star: Starfall", { animFrames: 73, commitFrames: 42, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 6, mv: 12.65, energy: 0.19, concerto: 0.38, offtune: 599, forte1: 0.376 },
    { at: 13, mv: 12.65, energy: 0.19, concerto: 0.38, offtune: 599, forte1: 0.376 },
    { at: 20, mv: 12.65, energy: 0.19, concerto: 0.38, offtune: 599, forte1: 0.376 },
    { at: 28, mv: 12.65, energy: 0.19, concerto: 0.38, offtune: 599, forte1: 0.376 },
    { at: 42, mv: 118.06, energy: 1.75, concerto: 3.5, offtune: 5589, forte1: 3.496 },
  ]});

/** Wolf's Descent, her plunging attack — never placed in the rotation below, kept for completeness. */
const MA = lupaAction("Mid-air - Flaming Star: Plunge", { animFrames: 69, commitFrames: 55, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 26, mv: 26.2, energy: 0.39, concerto: 0.78, offtune: 1240, forte1: 1.25 },
    { at: 40, mv: 52.39, energy: 0.78, concerto: 1.55, offtune: 2480, forte1: 2.5 },
    { at: 55, mv: 26.2, energy: 0.39, concerto: 0.78, offtune: 1240, forte1: 1.25 },
  ]});
/** Flaming Star, her dodge counter — same treatment as `MA` above. */
const DC = lupaAction("Dodge Counter - Flaming Star", { animFrames: 73, commitFrames: 49, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 15, mv: 34.18, energy: 0.51, concerto: 2.2746, offtune: 1618 },
    { at: 23, mv: 34.18, energy: 0.51, concerto: 2.2746, offtune: 1618 },
    { at: 30, mv: 34.18, energy: 0.51, concerto: 2.2746, offtune: 1618 },
    { at: 37, mv: 34.18, energy: 0.51, concerto: 2.2746, offtune: 1618 },
    { at: 49, mv: 136.72, energy: 2.03, concerto: 9.0316, offtune: 6472 },
  ]});

const MA1 = lupaAction("Mid-air - Flaming Star 1", { animFrames: 30, commitFrames: 14, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 14, mv: 76.73, energy: 1.14, concerto: 2.27, offtune: 3632, forte1: 7 }]});
const MA2 = lupaAction("Mid-air - Flaming Star 2", { animFrames: 56, commitFrames: 23, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 10, mv: 77.23, energy: 1.15, concerto: 2.29, offtune: 3656, forte1: 6.5 },
    { at: 23, mv: 19.31, energy: 0.29, concerto: 0.58, offtune: 914, forte1: 1.625 },
    { at: 27, mv: 19.31, energy: 0.29, concerto: 0.58, offtune: 914, forte1: 1.625 },
    { at: 32, mv: 19.31, energy: 0.29, concerto: 0.58, offtune: 914, forte1: 1.625 },
    { at: 36, mv: 19.31, energy: 0.29, concerto: 0.58, offtune: 914, forte1: 1.625 },
  ]});
const MA3 = lupaAction("Mid-air - Flaming Star 3", { animFrames: 71, commitFrames: 50, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 19, mv: 28.48, energy: 0.43, concerto: 0.85, offtune: 1348 },
    { at: 50, mv: 28.48, energy: 0.43, concerto: 0.85, offtune: 1348 },
  ]});

// base cast, plus three 50-Wolflame-consuming enhanced forms (each earns a point of Wolfaith
// rather than restoring the gauge)
const HA = lupaAction("Heavy - Flaming Star", { animFrames: 51, commitFrames: 28, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 18, mv: 56.36, energy: 0.84, concerto: 1.67, offtune: 2668 },
    { at: 28, mv: 56.36, energy: 0.84, concerto: 1.67, offtune: 2668 },
  ]});
/** Firestrike, at Wolflame 50+. Counts as Heavy Attack DMG. */
const EMA3 = lupaAction("Mid-air - Firestrike", { animFrames: 71, commitFrames: 50, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, hits: [
    { at: 32, mv: 28.48, energy: 0.43, concerto: 5, offtune: 1348 },
    { at: 50, mv: 28.48, energy: 0.43, concerto: 5, offtune: 1348, forte2: 1 },
  ], castForte1: -50});
/** Wolf's Gnawing, at Wolflame 50+. */
const EHA3 = lupaAction("Heavy - Wolf's Gnawing", { animFrames: 50, commitFrames: 40, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 26, mv: 56.11, energy: 0.83, concerto: 5, offtune: 2656 },
    { at: 40, mv: 56.11, energy: 0.83, concerto: 5, offtune: 2656, forte2: 1 },
  ], castForte1: -50});
/** Wolf's Claw, at Wolflame 50+ and Wolfaith 1+. */
const EHA4 = lupaAction("Heavy - Wolf's Claw", { animFrames: 96, commitFrames: 75, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 24, mv: 72.15, energy: 1.07, concerto: 3, offtune: 3415 },
    { at: 41, mv: 18.04, energy: 0.27, concerto: 0.75, offtune: 854 },
    { at: 46, mv: 18.04, energy: 0.27, concerto: 0.75, offtune: 854 },
    { at: 50, mv: 18.04, energy: 0.27, concerto: 0.75, offtune: 854 },
    { at: 54, mv: 18.04, energy: 0.27, concerto: 0.75, offtune: 854 },
    { at: 75, mv: 96.19, energy: 1.43, concerto: 4, offtune: 4554, forte2: 1 },
  ], castForte1: -50});

// Shewolf's Hunt and its Feral Fang follow-up, each restoring 15 Wolflame
const Skill1 = lupaAction("Skill - Shewolf's Hunt", {
  animFrames: 56, commitFrames: 28, cooldown: 60 * 12,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [{ at: 28, mv: 140.77, energy: 2.09, concerto: 4.17, offtune: 6664, forte1: 15 }],
  updateDebuffs: () => applyEnemy(LUPA_MARK, 1),
});
/** Feral Fang: +50% DMG Multiplier against the marked target, kept as an explicit MulMv add (see
 *  LUPA_RESONATOR's own updateBuffs() below) rather than baked into mv, so the trace shows where it comes from. */
const Skill2 = lupaAction("Skill - Feral Fang", { animFrames: 63, commitFrames: 44, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [{ at: 44, mv: 313.61, energy: 13.67, offtune: 5328, forte1: 15 }]});

/** Foebreaker: consumes every point of Wolflame. Always placed right after Liberation, whose own
 *  updateBuffs() hard-resets Wolflame to exactly 100 first, so forte1: -100 always lands on 0. Opens
 *  Burning Matchpoint (see BURNING_MATCHPOINT below). */
const USkill = lupaAction("Skill - Foebreaker", {
  animFrames: 58, commitFrames: 48,
  node: Node.Liberation, cast: Cast.Skill, type: Type.Skill, hits: [{ at: 48, mv: 304.46, concerto: 20, offtune: 6448 }], castForte1: -100,
  updateBuffs: () => applyCurrent(BURNING_MATCHPOINT, 1),
});

// tops Wolflame to 100, spends every point of Wolfaith, opens Pack Hunt/Glory
const Liberation = lupaAction("Liberation - Fire-Kissed Glory", {
  animFrames: 220, commitFrames: 220, timestop: 220, motionStop: 208, cooldown: 60 * 20,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, hits: [{ at: 168, mv: 820.44, offtune: 48000 }], castConcerto: 20, castForte1: 100, resetEnergy: true,
  // "Restores 100 points of Wolflame" is a hard top-off, not additive on top of whatever was
  // already held, and every point of Wolfaith goes: both reset ahead of the declared +100
  resetForte1: true, resetForte2: true,
  // a fresh window at its own one stack (6% ATK): the Liberation *grants* Pack Hunt, and the
  // Intros that enhanced the last one don't carry into it
  updateBuffs: () => { revokeTeam(PACK_HUNT); applyTeam(PACK_HUNT, 1); },
});

// Dance With the Wolf and its Climax form, each spending every point of Wolfaith (a fixed -2
// delta — always exactly 2 in this fixed-rotation-line, the only gate that lets either one fire)
// both Dance With the Wolf forms put Backup Ready on the team
const BACKUP = { updateBuffs: () => applyTeam(LUPA_BACKUP_READY, 1) };
const FSkill = lupaAction("Forte Skill - Dance With the Wolf", { animFrames: 151, commitFrames: 102, node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, hits: [
    { at: 54, mv: 56.02, energy: 3, concerto: 1.5, offtune: 1602 },
    { at: 67, mv: 42.02, energy: 2.25, concerto: 1.13, offtune: 1201 },
    { at: 73, mv: 42.02, energy: 2.25, concerto: 1.13, offtune: 1201 },
    { at: 78, mv: 42.02, energy: 2.25, concerto: 1.13, offtune: 1201 },
    { at: 84, mv: 42.02, energy: 2.25, concerto: 1.13, offtune: 1201 },
    { at: 102, mv: 336.11, energy: 18, concerto: 9, offtune: 9610 },
  ], castForte2: -2, ...BACKUP });
const UFSkill = lupaAction("Forte Skill - Dance With the Wolf: Climax", { animFrames: 151, commitFrames: 102, node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, hits: [
    { at: 54, mv: 75.63, energy: 3, concerto: 3, offtune: 5442 },
    { at: 67, mv: 56.72, energy: 2.25, concerto: 2.25, offtune: 4081 },
    { at: 73, mv: 56.72, energy: 2.25, concerto: 2.25, offtune: 4081 },
    { at: 78, mv: 56.72, energy: 2.25, concerto: 2.25, offtune: 4081 },
    { at: 84, mv: 56.72, energy: 2.25, concerto: 2.25, offtune: 4081 },
    { at: 102, mv: 453.75, energy: 18, concerto: 18, offtune: 32650 },
  ], castForte2: -2, ...BACKUP });
/** Set the Arena Ablaze — queued by LUPA_BACKUP_READY the moment a teammate's Liberation earns
 *  it, not placed in the rotation directly. */
const fskillFUA = lupaAction("Forte Skill - Set the Arena Ablaze", { tag: ActionTag.Field, animFrames: 96, commitFrames: 70, node: Node.Forte, type: Type.Skill, hits: [{ at: 57, mv: 42.35, offtune: 1920 }, { at: 70, mv: 169.4, offtune: 7680 }]});

const Intro = lupaAction("Intro - Try Focusing, Eh?", { animFrames: 70, commitFrames: 60, motionStop: 55, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 24, mv: 29.76, energy: 1.5, offtune: 1409 },
    { at: 34, mv: 42.16, energy: 2.13, offtune: 1996 },
    { at: 38, mv: 42.16, energy: 2.13, offtune: 1996 },
    { at: 43, mv: 42.16, energy: 2.13, offtune: 1996 },
    { at: 47, mv: 42.16, energy: 2.13, offtune: 1996 },
  ], castConcerto: 10});
/** Nowhere to Run! — replaces plain Intro once Pack Hunt is maxed (see LUPA_RESONATOR's own intro()
 *  selector below, which also ends Pack Hunt/Glory right there, before this hit's own damage). */
const EIntro = lupaAction("Intro - Nowhere to Run!", { animFrames: 150, commitFrames: 140, timestop: 85, motionStop: 145, node: Node.Intro, cast: Cast.Intro, type: Type.Liberation, hits: [
    { at: 114, mv: 793.57, energy: 8, offtune: 12800 },
    { at: 116, mv: 49.6, energy: 0.5, offtune: 800 },
    { at: 120, mv: 49.6, energy: 0.5, offtune: 800 },
    { at: 124, mv: 49.6, energy: 0.5, offtune: 800 },
    { at: 129, mv: 49.6, energy: 0.5, offtune: 800 },
  ], castConcerto: 10});
/** Stand by Me, Warrior: no damage of its own, just the outro handoff. */
const Outro = lupaAction("Outro - Stand by Me, Warrior", {
  animFrames: 0, commitFrames: 0,
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => queueOutro(LUPA_OUTRO),
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
  convertStats: () => { if (runningAction(fskillFUA)) revokeCurrent(WILDFIRE_BANNER); },
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
  convertStats: () => { if (runningAction(Skill2) || runningAction(Liberation)) revokeEnemy(LUPA_MARK); },
});

/** Burning Matchpoint: opened by Foebreaker, ends the moment either form of Dance With the Wolf
 *  is cast. While held, true Normal Attack hits (not her enhanced Heavy Attacks) restore 500%
 *  MORE Wolflame on hit — a straight +5x of the action's own declared forte1 gain. */
const BURNING_MATCHPOINT = new Buff({
  name: "Lupa: Burning Matchpoint", duration: 60 * 12,
  applyStats: () => {
    const a = pressed();
    if (isType(Type.Basic)) addStat(Stat.AddForte1, 5 * (a.forte1 - a.castForte[0]!));
  },
  convertStats: () => { if (runningAction(FSkill) || runningAction(UFSkill)) revokeCurrent(BURNING_MATCHPOINT); },
});

/** Set the Arena Ablaze: Dance With the Wolf/its Climax form leave this ready on her — whoever
 *  next casts a Liberation while she holds it (not her own) queues fskillFUA onto her own slot,
 *  same "queued and owned by the kit that earned it" shape as Roccia's own Magic Box. Granted
 *  team-wide so its own applyStats() sees any teammate's Liberation cast, not just her own turn. */
const LUPA_BACKUP_READY = new Buff({
    name: "Lupa: Set the Arena Ablaze",
    duration: 60 * 8,
    applyStats: () => {
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
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.AddConcerto, 10); },
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
    if (runningAction(Skill2)) addStat(Stat.AddForte1, 100);
  },
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
  intro: new Action("Intro Resolver", { cast: Cast.Intro, resolve: () => {
      if (stacksOfTeam(PACK_HUNT) < 3) return Intro;
      // S6: Nowhere to Run! no longer ends either window
      if (!isHeld(LP_S6)) { revokeTeam(PACK_HUNT); revokeTeam(GLORY); }
      return EIntro;
    } }),
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 2,

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
  NOINTRO, INTRO, ECHO.instaDodge(),
  Liberation, USkill, MA12, EMA3, EHA4.easyCancel(), UFSkill.swapCancel(), Outro,
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
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Skill),
  rotation: { 0: LP_LOOP },
  sequences: LP_SEQUENCES,
});
