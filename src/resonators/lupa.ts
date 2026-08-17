/**
 * Lupa — a fusion DPS. Wolflame/Wolfaith gate her enhanced heavies; her liberation opens a
 * team-wide window (Pack Hunt: stacking ATK; Glory: fusion RES ignore).
 *
 * Numbers from the migrated sheet (`data/actions.json`, `data/stats.json`); mechanics from
 * nanoka.cc (character 1207). Base ATK and stat-tree ATK% follow nanoka over the sheet, which
 * reads stale on both — flag if wrong.
 *
 * Simplified like Jingran's Earth Charm / Iuno's Full Moon Domain: Wolfaith's 10s decay,
 * Burning Matchpoint's regen multiplier (baked into basic MVs), Radiance Cleaver's
 * tune-strained bonus (untracked enemy state, left at zero), and ordinary-hit Wolflame regen
 * (unmodelled — only Liberation/Foebreaker/enhanced-heavy events move the gauge).
 */
import { Buff, GlobalBuff, Gear, Mainslot, Action, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isIntro, isOutro, isLiberation } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#ef4d6e";

/** Wolflame is the gauge the game shows; Wolfaith is the short-lived resource her enhanced
 *  heavies feed and her Dance With the Wolf casts spend. */
export const LUPA_WOLFLAME = Resource.Forte1;
export const LUPA_WOLFAITH = Resource.Forte2;

/* ------------------------------------------------------------- Pack Hunt, Glory, the outro */

/** Pack Hunt. Liberation grants level 1 (6% team ATK) outright; an intro — anyone's, while up —
 *  escalates it twice more to an 18% ceiling. "Overlord/Calamity Class" is a target-tier gate
 *  this engine has no notion of, so its 10% fusion bonus applies unconditionally. Global: one
 *  team-wide level rather than each holder's own independent stack, and it has to see every
 *  team member's own Intro, not just Lupa's own turn. `grantGlobal`'s stack count is a relative
 *  add (matching `grantSelf`), not the absolute target `grantTeam` used to take — a single
 *  shared instance never drifts, so a plain +1 a stack is all escalating needs now. */
export const PACK_HUNT = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isIntro(ctx.action!)) ctx.grantGlobal(PACK_HUNT);
  // re-read live: the grant above may just have moved it past the `stacks` this call started with
  const held = ctx.stacksOf(PACK_HUNT);
  ctx.add(6 * held, Stat.BonusAtk);
  ctx.add(10, Element.Fusion, Stat.DmgBonus);
  // read straight off each slot's own resonator, not a hand-kept counter
  if (ctx.teamElements().filter((e) => e === Element.Fusion).length >= 3) ctx.add(10, Element.Fusion, Stat.DmgBonus);
  return `Lupa: Pack Hunt x${held}`;
}, 3);

/** Glory. 3% fusion RES ignore a stack, up to three (one per fusion resonator, Lupa included),
 *  +6% flat once all three are held. Doesn't escalate — her liberation sets it once, to the
 *  team's fusion count at that moment. Global so it pays every team member's own hit, not just
 *  Lupa's. */
export const GLORY = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(3 * stacks, Element.Fusion, Stat.ResIgnore);
  if (stacks >= 3) ctx.add(6, Element.Fusion, Stat.ResIgnore);
  return `Lupa: Glory x${stacks}`;
}, 3);

/** Stand by Me, Warrior — what the next resonator actually holds. */
export const LUPA_OUTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(LUPA_OUTRO);
  ctx.add(20, Element.Fusion, Stat.Amp);
  ctx.add(25, DamageType.Basic, Stat.Amp);
  return "Lupa: Outro";
});

/** Set the Arena Ablaze. Dance With the Wolf and its Climax form leave this ready on her;
 *  whoever next casts a liberation while she holds it gets backed up by `fskillFUA` — queued
 *  onto her own slot, since it's her damage on her own buffs. Fires once, not on her own
 *  liberation (the kit means backing up *the active Resonator*, once she's off field). */
const LUPA_BACKUP_READY = new Buff(PRIORITY.BUFF_STATS,
  () => "Lupa: Set the Arena Ablaze (ready)");

/** Global from fight start, so it can catch a liberation cast at any point, from anyone. */
const BACKUP_WATCH = new GlobalBuff(PRIORITY.UPDATE_BUFFS, (ctx) => {
  const [lupaSlot] = isLiberation(ctx.action!) ? ctx.slotsWith(LUPA_BACKUP_READY) : [];
  // not on her own liberation — only matters once she's switched off field
  if (lupaSlot && ctx.slot !== lupaSlot) {
    ctx.queueOn(lupaSlot, fskillFUA);
    lupaSlot.removeBuff(LUPA_BACKUP_READY);
  }
  return "Lupa: Set the Arena Ablaze (watcher)";
});

/* --------------------------------------------------------------- resonator */

/* ------------------------------------------------------------------ weapons */

/**
 * Wildfire Mark, her signature: R1. Chain of three, only the last reaches the team:
 *   1. 12% ATK, flat.
 *   2. Intro/liberation gives *her* 24% Resonance Liberation DMG for 6s.
 *   3. Dealing Heavy Attack DMG once extends that by 4s, and the extension is what hands the
 *      whole team 24% Fusion DMG Bonus for 30s.
 *
 * Step 2 is modelled as permanently up (she opens every rotation with intro -> liberation).
 * Step 3 is a real gate: nothing pays the team until she's landed Heavy Attack DMG, which in
 * her rotation is Firestrike, well after her liberation.
 *
 * "Dealing Heavy Attack DMG" is the damage type, not the cast — Mid-air Firestrike is a
 * basic-attack press that deals it, and counts. "Up to 1 time" / "same name doesn't stack"
 * fall out of the buff being unstacked and a global grant being idempotent.
 */
const WILDFIRE_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(24, Element.Fusion, Stat.DmgBonus); return "Wildfire Mark: Blazing Starfire"; });

export const WILDFIRE_MARK = new Gear("Wildfire Mark", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(48.6, Stat.CritDmg);
  ctx.add(12, Stat.BonusAtk);
  ctx.add(24, DamageType.Liberation, Stat.DmgBonus);
  // granted at GEAR_STATS, so the hit that earns it is itself paid at BUFF_STATS same-cast
  if (ctx.action!.type === DamageType.Heavy) ctx.grantGlobal(WILDFIRE_TEAM);
});

/* -------------------------------------------------------------- echo, sonata */

export const ACTION_LIONESS = new Action("Echo: Lioness of Glory", {
  color: COLOR,
  cast: DamageType.Echo,
  element: Element.Fusion,
  scaling: Scaling.Atk,
  type: DamageType.Echo,
  mv: 273.6,
  energy: 380,
});

export const LIONESS_OF_GLORY = new Mainslot("Lioness of Glory", ACTION_LIONESS, (ctx) => {
  ctx.add(12, DamageType.Liberation, Stat.DmgBonus);
  ctx.add(12, Element.Fusion, Stat.DmgBonus);
});

const CLAWPRINT_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(15, Element.Fusion, Stat.DmgBonus); return "Flaming Clawprint"; });

export const CLAWPRINT_5PC = new Gear("Flaming Clawprint 5pc", (ctx) => {
  ctx.add(20, DamageType.Liberation, Stat.DmgBonus);
  ctx.grantGlobal(CLAWPRINT_TEAM);
});

export const CLAWPRINT_2PC = new Gear("Flaming Clawprint 2pc", (ctx) => {
  ctx.add(10, Element.Fusion, Stat.DmgBonus);
});

/** Her echoes: 43311 (one crit-rate 4-cost, two fusion 3-costs, two ATK 1-costs), matching the
 *  migrated build. Substats lean crit and liberation — her biggest hit and what opens the team
 *  window. */
const LUPA_LOADOUT = new Loadout(
  WILDFIRE_MARK, LIONESS_OF_GLORY, CLAWPRINT_5PC, CLAWPRINT_2PC,
  mainstats("CR", "fusion fusion", "atk atk"), chem("atk", "liberation"),
);

export class Lupa extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Lupa",
      Element.Fusion,
      // decides on Pack Hunt/Glory and strips them right here — on the outro that's handing her
      // the field, before Nowhere to Run! (which doesn't get their bonus) ever runs
      (ctx) => {
        if (ctx.stacksOf(PACK_HUNT) < 3) return Intro;
        ctx.revoke(PACK_HUNT);
        ctx.revoke(GLORY);
        return EIntro;
      },
      loadout,
      (ctx) => {
        // level 90 base stats — see the file header for the two figures that disagree with the sheet
        ctx.add(11912.5, Stat.BaseHp);
        ctx.add(387.5, Stat.BaseAtk);
      },
      (ctx) => {
        ctx.add(8, Stat.CritRate);
        ctx.add(12, Stat.BonusAtk);
      },
      (ctx) => { ctx.grantGlobal(BACKUP_WATCH); },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Lupa(LUPA_LOADOUT);

/* ------------------------------------------------------- what her actions do */

function lupaAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Fusion,
    color: COLOR,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics and mid-air
const BA1 = lupaAction("Basic 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 90.08, energy: 135, concerto: 268, offtune: 4264 });
const BA2 = lupaAction("Basic 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 90.08, energy: 134, concerto: 267, offtune: 4264 });
const BA3 = lupaAction("Basic 3", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 157.68, energy: 237, concerto: 468, offtune: 7464 });
const BA4 = lupaAction("Basic 4", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 246.24, energy: 366, concerto: 730, offtune: 11656 });
/** Basic Attack - Starfall, the enhanced follow-up after a plunging attack or dodge counter. */
const EBA = lupaAction("Enhanced Basic", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 168.66, energy: 251, concerto: 502, offtune: 7985 });

/** Basic Attack - Wolf's Descent, her plunging attack. Never placed in the rotations below (she
 *  never dodges/jumps into one there), exported for completeness like every other kit's own. */
export const MA = lupaAction("Plunge", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 104.79, energy: 156, concerto: 311, offtune: 4960 });
/** Basic Attack - Flaming Star, her dodge counter — same treatment as `MA` above. */
export const DC = lupaAction("Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 273.44, energy: 407, concerto: 813, offtune: 12944 });

const MA1 = lupaAction("Midair 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 76.73, energy: 114, concerto: 227, offtune: 3632 });
const MA2 = lupaAction("Midair 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 154.47, energy: 231, concerto: 461, offtune: 7312 });
const MA3 = lupaAction("Midair 3", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 56.96, energy: 86, concerto: 170, offtune: 2696 });

// --- heavy attacks. HA is the base cast; the three enhanced forms spend 50 Wolflame for a
//     point of Wolfaith instead of restoring the gauge. Nothing clamps forte1/forte2 below 0.
const HA = lupaAction("Heavy", { node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 112.72, energy: 168, concerto: 334, offtune: 5336 });

/** Mid-air Attack - Firestrike, at Wolflame 50+. Counts as Heavy Attack DMG. */
const EMA3 = lupaAction("Enhanced Midair 3", {
  node: Node.Normal, cast: DamageType.Basic, type: DamageType.Heavy, mv: 56.96, energy: 86, concerto: 1000, offtune: 2696,
  forte1: -50, forte2: 1,
});
/** Heavy Attack - Wolf's Gnawing, at Wolflame 50+. */
const EHA3 = lupaAction("Enhanced Heavy 1", {
  node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 112.22, energy: 166, concerto: 1000, offtune: 5312,
  forte1: -50, forte2: 1,
});
/** Heavy Attack - Wolf's Claw, at Wolflame 50+ and Wolfaith 1+. */
const EMA4 = lupaAction("Enhanced Heavy 2", {
  node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 240.5, energy: 358, concerto: 1000, offtune: 11385,
  forte1: -50, forte2: 1,
});

// --- resonance skill: Shewolf's Hunt and its Feral Fang follow-up, each restoring 15 Wolflame.
const Skill1 = lupaAction("Skill 1", {
  node: Node.Skill, cast: DamageType.Skill, type: DamageType.Skill, mv: 140.77, energy: 209, concerto: 417, offtune: 6664, forte1: 15,
});
// Feral Fang: 313.61% base, +50% DMG Multiplier to the marked target — kept as an explicit
// MulMv add rather than baked into mv, so the trace shows where the other 157.205% comes from.
// Reconciles the earlier 470.41% sourced here (313.61 x 1.5 = 470.415).
const Skill2 = lupaAction("Skill 2", {
  node: Node.Skill, cast: DamageType.Skill, type: DamageType.Skill, mv: 313.61, energy: 1367, offtune: 5328, forte1: 15,
  priority: PRIORITY.BUFF_STATS,
  apply(ctx) { ctx.add(50, Stat.MulMv); },
});

/** Resonance Skill - Foebreaker: consumes every point of Wolflame, enters Burning Matchpoint
 *  (not separately modelled — see the file header). */
const USkill = lupaAction("Liberation Skill", {
  node: Node.Liberation, cast: DamageType.Skill, type: DamageType.Skill, mv: 304.46, concerto: 2000, offtune: 6448,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.setCounter(LUPA_WOLFLAME, 0); },
});

// --- liberation: tops Wolflame to 100, spends every point of Wolfaith, opens the team window.
const Liberation = lupaAction("Liberation", {
  node: Node.Liberation, cast: DamageType.Liberation, type: DamageType.Liberation, mv: 820.44, energy: -12500, concerto: 2000, offtune: 48000,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    ctx.setCounter(LUPA_WOLFLAME, 100);   // tops the gauge
    ctx.setCounter(LUPA_WOLFAITH, 0);
    // granting it *is* level 1 (6% team ATK); anyone's intro escalates it from there
    ctx.grantGlobal(PACK_HUNT);
    ctx.grantGlobal(GLORY, ctx.teamElements().filter((e) => e === Element.Fusion).length);
  },
});

// --- forte circuit: Dance With the Wolf and its Climax form, each spending all Wolfaith. The
//     Climax variant isn't gated on Burning Matchpoint here — both are just callable.
const FSkill = lupaAction("Forte Skill", {
  node: Node.Forte, cast: DamageType.Skill, type: DamageType.Liberation, mv: 560.21, energy: 3000, concerto: 1502, offtune: 16016,
  priority: PRIORITY.UPDATE_BUFFS,
  forte2: -2,
  apply(ctx) { ctx.grantSelf(LUPA_BACKUP_READY); },
});
const UFSkill = lupaAction("Liberation Forte Skill", {
  node: Node.Forte, cast: DamageType.Skill, type: DamageType.Liberation, mv: 756.26, energy: 3000, concerto: 3000, offtune: 54416,
  priority: PRIORITY.UPDATE_BUFFS,
  forte2: -2,
  apply(ctx) { ctx.grantSelf(LUPA_BACKUP_READY); },
});
/** Set the Arena Ablaze — queued by `BACKUP_WATCH` the moment a teammate's liberation earns it,
 *  not placed in the rotation directly. */
const fskillFUA = lupaAction("FSkill Followup", { node: Node.Forte, type: DamageType.Skill, mv: 211.75, offtune: 9600, active: false });

// --- intro / outro
const Intro = lupaAction("Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Intro, mv: 198.4, energy: 1002, concerto: 1000, offtune: 9393,
});
/** Nowhere to Run! — replaces the intro once Pack Hunt is capped (Wild Hunt), not gated on
 *  that here. Strips Pack Hunt and Glory off the whole team either way. */
/** Nowhere to Run! — Pack Hunt/Glory already ended on the outro that triggered this (see the
 *  LUPA Gear's onIntro); this hit never sees their bonus. */
const EIntro = lupaAction("Enhanced Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Liberation, mv: 991.97, energy: 1000, concerto: 1000, offtune: 16000,
});
/** Stand by Me, Warrior: hands the incoming resonator her amplification window. */
const Outro = lupaAction("Outro", {
  cast: DamageType.Outro, type: DamageType.Outro, mv: 0, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.outro(LUPA_OUTRO); },
});

/** She isn't the team's lead, so the opener skips the real Intro entirely and starts on her
 *  own resonance skill instead. */
export const OPENER = [Skill1, Skill2, Liberation, USkill, MA1, MA2, EMA3, EMA4, UFSkill, ECHO_CAST, Outro];

/** The migrated `lupa` rotation, minus the hand-placed follow-up after UFSkill — `fskillFUA` is
 *  queued by `BACKUP_WATCH` instead of sitting in a fixed slot. The preceding member's outro
 *  triggers Nowhere to Run! rather than the opener's plain Skill 1/Skill 2, since by the second
 *  loop Pack Hunt is already up (see `onIntro`). */
export const LOOP = [
  Skill1, Liberation, USkill, MA1, MA2, EMA3, EMA4, UFSkill, ECHO_CAST, Outro,
];
