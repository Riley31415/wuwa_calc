/**
 * Lupa — a fusion DPS. Two gauges (Wolflame, Wolfaith) gate her enhanced heavies, her
 * liberation opens a team-wide window (Pack Hunt: stacking ATK, escalated by anyone's intro;
 * Glory: fusion RES ignore that scales with the team's fusion count), and her weapon and
 * outro both hand out fusion buffs of their own.
 *
 * Numbers come from the migrated sheet rows for `Lupa`, `Wildfire Mark`, `Radiance Cleaver`
 * and `Lioness of Glory` (data/actions.json, data/stats.json); the mechanics are verified
 * against her kit on nanoka.cc (character 1207).
 *
 * Two numeric discrepancies against the migrated sheet, resolved in nanoka's favour per the
 * project's standing rule that nanoka is the source of truth for numbers:
 *   - base ATK: nanoka's current page gives 387.5 at level 90; the sheet's row (337.5, tagged
 *     "inherent 12") reads like it predates a rebalance, the same way Jingran's HP row did.
 *   - the stat-tree bonus ATK%: nanoka's own skill-tree nodes sum to 12% (four nodes: 1.8 +
 *     1.8 + 4.2 + 4.2), not the sheet's 24% — 12% is also the figure every other resonator's
 *     own ascension-tree bonus already uses in this codebase (Iuno's and Jingran's both work
 *     out the same way), so 24% reads like a doubled entry rather than a real rebalance.
 *   Flag either if this turns out wrong.
 *
 * Simplified rather than fully modelled, the same way Jingran's Earth Charm and Iuno's Full
 * Moon Domain are:
 *   - Wolfaith's 10s decay back into Wolflame — every cast that matters here spends it the
 *     same action it is gained in, so the window never actually elapses in a tight rotation.
 *   - Burning Matchpoint's Wolflame-regen multiplier — the basic-attack motion values below
 *     are already the sheet's resolved per-stage numbers, which is where a regen-rate change
 *     would have been baked in if it mattered to them.
 *   - Radiance Cleaver's on-hit liberation bonus against tune-strained targets — an enemy
 *     debuff state this engine does not track, and the sheet's own row carries no "assume full
 *     uptime" note the way her other conditional passives do, so it reads as deliberately left
 *     at zero rather than merely unauthored.
 *   - Wolflame regen from ordinary hits — nanoka's prose names no figure for it (unlike
 *     Jingran's Qi, which states exact amounts per action) and the migrated sheet carries no
 *     forte deltas for her basics either. Only the numbered events are modelled: Liberation
 *     tops the gauge to 100, Foebreaker empties it, and each enhanced heavy spends 50.
 */
import { Buff, Gear, Action, PRIORITY } from "../kit.js";
import {
  add, action, self, isIntro, isLiberation, grantTeam, grantSelf,
  revokeTeam, slotsWith, stacksOf, queueOn, teamElements, setCounter, outro,
} from "../state.js";
import {
  BASE_ATK, BASE_HP, ER, CRIT_RATE, CRIT_DMG, BONUS_ATK, DMG_BONUS, AMP, LIB, RES_IGNORE,
  FORTE1, FORTE2,
  FUSION, BASIC, HEAVY, SKILL, INTRO, OUTRO, ECHO, NORMAL, FORTE,
} from "../stats.js";
import { mainstats, chem } from "../shared.js";

/** How many resonators currently on the team are fusion — read straight off each slot's own
 *  resonator (see `Slot.resonator` / `teamElements()` in state.js), not a hand-kept counter. */
const fusionCount = () => teamElements().filter((e) => e === FUSION).length;

/** Wolflame is the gauge the game shows; Wolfaith is the short-lived resource her enhanced
 *  heavies feed and her Dance With the Wolf casts spend. */
export const LUPA_WOLFLAME = FORTE1;
export const LUPA_WOLFAITH = FORTE2;
const WOLFLAME_MAX = 100, WOLFLAME_PER_ENHANCED_HEAVY = 50;

/* ------------------------------------------------------------- Pack Hunt, Glory, the outro */

/**
 * Every resonator's own copy of a buff normally stacks independently (see kit.js: `instance()`
 * hands each holder their own object). Pack Hunt and Glory are meant to read as one team-wide
 * level instead, so whenever either changes, every current holder's own copy is set to the same
 * number here — no single resonator's copy is the "real" one; they are just kept identical.
 */
function setStacksForTeam(buff, stacks) {
  const clamped = Math.min(buff.max_stacks, Math.max(0, stacks));
  for (const slot of slotsWith(buff)) {
    const before = slot.stacksOf(buff);
    if (before < clamped) slot.addStack(buff, clamped - before);
    else if (before > clamped) slot.removeStack(buff, before - clamped);
  }
}

/**
 * Pack Hunt. Her liberation grants it at level 1 (6% team ATK) outright; casting an intro
 * skill — anyone's, while it is up — escalates it, twice more, to an 18% ceiling (`max_stacks:
 * 3` below is what actually caps it — `setStacksForTeam` clamps to it on every call).
 *
 * "Overlord Class or Calamity Class" is an enemy-tier gate this engine has no notion of, so the
 * 10% fusion damage bonus it names is applied unconditionally — the same simplification every
 * other target-tier-gated passive in this codebase already makes.
 */
export const PACK_HUNT = new Buff("Lupa: Pack Hunt", PRIORITY.BUFF_STATS, () => {
  if (isIntro(action())) setStacksForTeam(PACK_HUNT, stacksOf(PACK_HUNT) + 1);
  const held = stacksOf(PACK_HUNT);
  if (!held) return held;
  add(6 * held, BONUS_ATK);
  add(10, FUSION, DMG_BONUS);
  if (fusionCount() >= 3) add(10, FUSION, DMG_BONUS);
  return held;
}, 3);

/**
 * Glory. 3% fusion RES ignore a stack, up to three — one per fusion resonator on the team,
 * Lupa included — and a further +6% flat once all three stacks are held. Unlike Pack Hunt it
 * never escalates on its own, so her liberation sets it once, to however many fusion
 * resonators are actually on the team *at that moment*, rather than every holder re-deriving
 * the same team-composition question on every action they take.
 */
export const GLORY = new Buff("Lupa: Glory", PRIORITY.BUFF_STATS, () => {
  const held = stacksOf(GLORY);
  if (!held) return held;
  add(3 * held, FUSION, RES_IGNORE);
  if (held >= 3) add(6, FUSION, RES_IGNORE);
  return held;
}, 3);

/** Stand by Me, Warrior — what the next resonator actually holds. */
export const LUPA_OUTRO = new Buff("Lupa: Outro", PRIORITY.BUFF_STATS, () => {
  add(20, FUSION, AMP);
  add(25, BASIC, AMP);
});

/**
 * Set the Arena Ablaze. Dance With the Wolf and its Climax form both leave this ready on her;
 * whoever next casts a resonance liberation while she still holds it gets backed up by
 * `fskillFUA` (defined further down, alongside her other forte casts) — her own follow-up,
 * queued onto her own slot rather than the caster's, since it is her damage on her own buffs,
 * merely timed off somebody else's cast. Fires once: the watcher below consumes the flag the
 * moment it uses it, and does not trigger on Lupa's own liberation — the kit calls out "the
 * active Resonator" backing *up*, which only makes sense once she has switched off field.
 *
 * The kit's 8s window is not modelled — the same "stays up" simplification as Iuno's Full Moon
 * Domain — since nothing in her rotation lets it lapse before the liberation it is meant for.
 */
const LUPA_BACKUP_READY = new Buff("Lupa: Set the Arena Ablaze (ready)", PRIORITY.BUFF_STATS, () => {});

/** Team-wide from the start of the fight, so it can catch a liberation cast by anyone at any
 *  point, not only right after Lupa's own forte cast. */
const BACKUP_WATCH = new Buff("Lupa: Set the Arena Ablaze (watcher)", PRIORITY.UPDATE_BUFFS, () => {
  if (!isLiberation(action())) return;
  const [lupaSlot] = slotsWith(LUPA_BACKUP_READY);
  if (!lupaSlot || self() === lupaSlot) return;
  queueOn(lupaSlot, fskillFUA);
  lupaSlot.removeBuff(LUPA_BACKUP_READY);
});

/* --------------------------------------------------------------- resonator */

export const LUPA = new Gear("Lupa", () => {
  // Every resonator's innate baseline.
  add(100, ER);
  add(5, CRIT_RATE);
  add(150, CRIT_DMG);

  // Level 90 base stats, from her kit page. See the file header for the two figures that
  // disagree with the migrated sheet.
  add(11912.5, BASE_HP);
  add(387.5, BASE_ATK);
  add(8, CRIT_RATE);
  add(12, BONUS_ATK);
}, () => { grantTeam(BACKUP_WATCH); }, FUSION);

/* ------------------------------------------------------------------ weapons */

/** Wildfire Mark, her signature: R1, the rank the sheet's numbers describe. */
const WILDFIRE_TEAM = new Buff("Wildfire Mark: Blazing Starfire", PRIORITY.BUFF_STATS,
  () => { add(24, FUSION, DMG_BONUS); });

export const WILDFIRE_MARK = new Gear("Wildfire Mark", () => {
  add(587.5, BASE_ATK);
  add(48.6, CRIT_DMG);
  add(12, BONUS_ATK);
  add(24, LIB, DMG_BONUS);
  grantTeam(WILDFIRE_TEAM);
});

/** Radiance Cleaver, the f2p alternative. Its own conditional (a liberation bonus against
 *  tune-strained targets) is left out — see the file header. */
export const RADIANCE_CLEAVER = new Gear("Radiance Cleaver", () => {
  add(587.5, BASE_ATK);
  add(48.6, CRIT_DMG);
  add(12, BONUS_ATK);
});

/* -------------------------------------------------------------- echo, sonata */

export const LIONESS_OF_GLORY = new Gear("Lioness of Glory", () => {
  add(12, LIB, DMG_BONUS);
  add(12, FUSION, DMG_BONUS);
});

export const ACTION_LIONESS = new Action("Echo: Lioness of Glory", {
  source: "Echo",
  node: ECHO,
  element: FUSION,
  scaling: "atk",
  type: ECHO,
  mv: 273.6,
  energy: 3.8,
});

const CLAWPRINT_TEAM = new Buff("Flaming Clawprint", PRIORITY.BUFF_STATS,
  () => { add(15, FUSION, DMG_BONUS); });

export const CLAWPRINT_5PC = new Gear("Flaming Clawprint 5pc", () => {
  add(20, LIB, DMG_BONUS);
  grantTeam(CLAWPRINT_TEAM);
});

export const CLAWPRINT_2PC = new Gear("Flaming Clawprint 2pc", () => {
  add(10, FUSION, DMG_BONUS);
});

/**
 * Her echoes: 43311, one crit-rate 4-cost, two fusion 3-costs and two ATK 1-costs, matching the
 * migrated `CR ele ele atk atk` build. Substats lean crit and liberation, since her liberation
 * is both her biggest single hit and what opens Pack Hunt and Glory for the team.
 */
export const LOADOUT = [
  LUPA, WILDFIRE_MARK, LIONESS_OF_GLORY, CLAWPRINT_5PC, CLAWPRINT_2PC,
  mainstats("CR", "fusion fusion", "atk atk"),
  chem("atk", "liberation"),
];
/** The same build on the f2p weapon. */
export const LOADOUT_F2P = [
  LUPA, RADIANCE_CLEAVER, LIONESS_OF_GLORY, CLAWPRINT_5PC, CLAWPRINT_2PC,
  mainstats("CR", "fusion fusion", "atk atk"),
  chem("atk", "liberation"),
];

/* ------------------------------------------------------- what her actions do */

function lupaAction(name, def) {
  return new Action(`Lupa: ${name}`, {
    source: "Lupa",
    element: FUSION,
    scaling: "atk",
    ...def,
  });
}

// --- basics and mid-air
const BA1 = lupaAction("BA1", { node: NORMAL, type: BASIC, mv: 90.08, energy: 1.35, concerto: 2.68 });
const BA2 = lupaAction("BA2", { node: NORMAL, type: BASIC, mv: 90.08, energy: 1.34, concerto: 2.67 });
const BA3 = lupaAction("BA3", { node: NORMAL, type: BASIC, mv: 157.68, energy: 2.37, concerto: 4.68 });
const BA4 = lupaAction("BA4", { node: NORMAL, type: BASIC, mv: 246.24, energy: 3.66, concerto: 7.3 });
/** Basic Attack - Starfall, the enhanced follow-up after a plunging attack or dodge counter. */
const EBA = lupaAction("EBA", { node: NORMAL, type: BASIC, mv: 168.66, energy: 2.51, concerto: 5.02 });

const MA1 = lupaAction("MA1", { node: NORMAL, type: BASIC, mv: 76.73, energy: 1.14, concerto: 2.27 });
const MA2 = lupaAction("MA2", { node: NORMAL, type: BASIC, mv: 154.47, energy: 2.31, concerto: 4.61 });
const MA3 = lupaAction("MA3", { node: NORMAL, type: BASIC, mv: 56.96, energy: 0.86, concerto: 1.7 });

// --- heavy attacks. HA is the base cast; the three enhanced forms each spend 50 Wolflame for
//     a point of Wolfaith rather than restoring the gauge — plain declarative deltas, same as
//     every other resource on these actions. Nothing clamps forte1/forte2 at 0 or at the cap;
//     that is fine, the same way a rotation can already run a resonator's energy negative.
const HA = lupaAction("HA", { node: NORMAL, type: HEAVY, mv: 112.72, energy: 1.68, concerto: 3.34 });

/** Mid-air Attack - Firestrike, at Wolflame 50+. Counts as Heavy Attack DMG. */
const EMA3 = lupaAction("EMA3", {
  node: NORMAL, type: HEAVY, mv: 56.96, energy: 0.86, concerto: 10,
  forte1: -WOLFLAME_PER_ENHANCED_HEAVY, forte2: 1,
});
/** Heavy Attack - Wolf's Claw, at Wolflame 50+ and Wolfaith 1+. */
const EHA3 = lupaAction("EHA3", {
  node: NORMAL, type: HEAVY, mv: 112.22, energy: 1.66, concerto: 10,
  forte1: -WOLFLAME_PER_ENHANCED_HEAVY, forte2: 1,
});
/** Heavy Attack - Wolf's Gnawing, at Wolflame 50+. */
const EMA4 = lupaAction("EMA4", {
  node: NORMAL, type: HEAVY, mv: 240.5, energy: 3.58, concerto: 10,
  forte1: -WOLFLAME_PER_ENHANCED_HEAVY, forte2: 1,
});

// --- resonance skill: Shewolf's Hunt and its Feral Fang follow-up, each restoring 15 Wolflame.
const Skill1 = lupaAction("Skill1", {
  node: SKILL, type: SKILL, mv: 140.77, energy: 2.09, concerto: 4.17, forte1: 15,
});
const Skill2 = lupaAction("Skill2", {
  node: SKILL, type: SKILL, mv: 470.41, energy: 13.67, forte1: 15,
});

/** Resonance Skill - Foebreaker: consumes every point of Wolflame and enters Burning
 *  Matchpoint (not separately modelled — see the file header). */
const USkill = lupaAction("USkill", {
  node: LIB, type: SKILL, mv: 304.46, concerto: 20,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { setCounter(LUPA_WOLFLAME, 0); },
});

// --- liberation: tops Wolflame to 100, spends every point of Wolfaith, and opens the team
//     window — Pack Hunt and Glory both granted here.
const Liberation = lupaAction("Liberation", {
  node: LIB, type: LIB, mv: 820.44, energy: -125, concerto: 20,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() {
    setCounter(LUPA_WOLFLAME, WOLFLAME_MAX);
    setCounter(LUPA_WOLFAITH, 0);
    grantTeam(PACK_HUNT);
    setStacksForTeam(PACK_HUNT, stacksOf(PACK_HUNT) + 1);
    grantTeam(GLORY);
    setStacksForTeam(GLORY, fusionCount());
  },
});

// --- forte circuit: Dance With the Wolf and its Climax form, each spending every point of
//     Wolfaith. The Climax variant only becomes available in Burning Matchpoint, which this
//     engine does not gate on — both are simply available actions a rotation can call.
const FSkill = lupaAction("FSkill", {
  node: FORTE, type: LIB, mv: 560.21, energy: 30, concerto: 15.02,
  priority: PRIORITY.UPDATE_BUFFS,
  forte2: -2,
  apply() { grantSelf(LUPA_BACKUP_READY); },
});
const UFSkill = lupaAction("UFSkill", {
  node: FORTE, type: LIB, mv: 756.26, energy: 30, concerto: 30,
  priority: PRIORITY.UPDATE_BUFFS,
  forte2: -2,
  apply() { grantSelf(LUPA_BACKUP_READY); },
});
/** Set the Arena Ablaze — the follow-up Dance With the Wolf leaves behind for whoever's next
 *  liberation backs her up (see `BACKUP_WATCH` above). Queued by that watcher now, not placed
 *  in the rotation: nothing about when it fires is a rotation author's choice to make. */
const fskillFUA = lupaAction("fskill FUA", { node: FORTE, type: SKILL, mv: 211.75 });

// --- intro / outro
const Intro = lupaAction("Intro", {
  node: INTRO, type: INTRO, mv: 198.4, energy: 10.02, concerto: 10,
});
/**
 * Nowhere to Run! — replaces the intro once Pack Hunt is capped (Wild Hunt). Not gated on that
 * state here, the same way Shorekeeper's Discernment isn't gated on her realm — but casting it
 * still does what the kit says regardless: it strips Pack Hunt and Glory off the whole team.
 * `revokeTeam` discards every resonator's own copy outright, so a later liberation regrants
 * fresh ones at 0 rather than reading a stale count nothing explicitly cleared.
 */
const EIntro = lupaAction("EIntro", {
  node: INTRO, type: LIB, mv: 991.97, energy: 10, concerto: 10,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() {
    revokeTeam(PACK_HUNT);
    revokeTeam(GLORY);
  },
});
/** Stand by Me, Warrior: hands the incoming resonator her amplification window. */
const Outro = lupaAction("Outro", {
  node: OUTRO, type: OUTRO, mv: 0, concerto: -100,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { outro(LUPA_OUTRO); },
});

/**
 * The migrated `lupa` rotation, minus the follow-up it hand-placed after UFSkill: that is
 * `fskillFUA`, which `BACKUP_WATCH` now queues itself the moment a teammate's liberation
 * actually earns it (see above), rather than a fixed slot in the list pretending to know when.
 */
export const ROTATION = [
  EIntro, Skill1, ACTION_LIONESS, Liberation, USkill, MA1, MA2, EMA3, EMA4, UFSkill, Outro,
];
