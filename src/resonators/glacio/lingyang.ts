/**
 * Lingyang, a standard 5-star Glacio Gauntlets main DPS (`Tier.FreeS0`: free, costed from S0; S1-S6 in
 * their own block below). Lion's Spirit (forte1, cap 100) is restored by Furious Punches, the Intro and
 * the Liberation, never while it drains. At 100, Heavy Attack Glorious Plunge (or Basic right after
 * the Intro or Liberation) enters Striding Lion: the bar drains over 5s (10s under Lion's Vigor),
 * paying 35 Concerto across the full bar, and the stance ends when it runs dry.
 *
 * Numbers: frames, MVs and per-hit gauges from wuwalab (character `lingyang`), checked against
 * encore.moe's 1104 rows — every hit's MV, energy, concerto and off-tune agree; flat Concerto Regen
 * rows (Intro 10, Liberation 20, Lion's Spirit 35) from encore.
 */
import { Tier, Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, Position, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addGain,
  addStat,
  runningAction,
  currentHit,
  applyCurrent,
  casting,
  forte1,
  isHeld,
  onAction,
  previousPress,
  queue,
  revokeCurrent,
  saveChain,
  setForte1,
} from "../../engine/context.js";
import { Action, Rotation, SWAPIN, SUCCESSFUL_DODGE, ActionGroup } from "../../engine/rotation.js";
import { tuneBreak } from "../../shared/tunebreak.js";
import { ABYSS_SURGES, NEW_STD_GAUNTLET } from "../../weapons/standard.js";
import { LAMPYLUMEN_MYRIAD_MAINSLOT, FREEZING_FROST_5PC, LAMPYLUMEN_MYRIAD_1, MECH_ABOMINATION_MAINSLOT, LINGERING_TUNES_5PC, MECH_ABOMINATION, LAMPYLUMEN_MYRIAD_3, LAMPYLUMEN_MYRIAD_2 } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { Echoes } from "../../shared/echoes.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { BLAZING_JUSTICE } from "../../weapons/gauntlet.js";
import { FROSTY_RESOLVE_5PC, NM_LAMPY_MAINSLOT, SENTRY_CONSTRUCT, SENTRY_CONSTRUCT_MAINSLOT } from "../../echoes/rinascita.js";

/* ------------------------------------------------------------------------------------ states */

/** Lion's Spirit draining: 2 points every 6f (the full bar in 5s), 1 under Lion's Vigor (10s),
 *  each point 0.35 Concerto. Runs on until the bar is empty, stance or not. */
const LIONS_SPIRIT_DRAIN: Buff = new Buff({
  name: "Lingyang: Lion's Spirit (drain)",
  tick: {
    every: 6,
    fire: () => {
      const n = Math.min(forte1(), isHeld(LIONS_VIGOR) ? 1 : 2);
      if (n > 0) addGain({ forte1: -n, concerto: 35 * n });
      if (forte1() <= 0) revokeCurrent(LIONS_SPIRIT_DRAIN);
    },
  },
});
/** Striding Lion, the stance; ends when the drain runs the bar dry. */
const STRIDING_LION = new Buff({ name: "Lingyang: Striding Lion", lostWith: LIONS_SPIRIT_DRAIN });
/** Diligent Practice's 3s window after a Basic Attack in Striding Lion. */
const DILIGENT_WINDOW = new Buff({ name: "Inherent: Diligent Practice (window)", duration: 60 * 3, lostWith: STRIDING_LION });
/** Basic Attack 3/4/5/Feral Roars hit: the Resonance Skill is Furious Punches. */
const FURIOUS_READY = new Buff({ name: "Lingyang: Furious Punches Ready" });
/** Furious Punches cast: Basic Attack 5 is Feral Roars. */
const ROARS_READY = new Buff({ name: "Lingyang: Feral Roars Ready" });

/** Lion's Vigor (Liberation): +50% Glacio DMG Bonus for 14s; it also halves the drain (above). */
const LIONS_VIGOR = new Buff({
  name: "Lingyang: Lion's Vigor",
  duration: 60 * 14,
  stats: [[Stat.DmgBonus, 50, Attribute.Glacio]],
});

/* ----------------------------------------------------------------------------------- actions */

function lingyangAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

/** The entry hit: the drain starts here, from the cap. */
const startDrain = (): void => {
  if (forte1() > 100) setForte1(100);
  applyCurrent(LIONS_SPIRIT_DRAIN, 1);
};
const furiousReady = (): void => { applyCurrent(FURIOUS_READY, 1); };

const Intro = lingyangAction("Intro - Lion Awakens", {
  endPosition: Position.Grounded, qteFrames: 67, animFrames: 101, noSwapFrames: 90, animPriority: { 0: 11, 101: 2 }, castPriority: 11, motionStop: [0, 58],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 59, mv: 6627, energy: 500, offtune: 6188 },
    { hitFrame: 83, mv: 6627, energy: 500, offtune: 6188 },
  ], castConcerto: 1000,
  // Lion's Spirit is never restored while it drains
  updateBuffs: () => {
    if (!isHeld(LIONS_SPIRIT_DRAIN)) addGain({ forte1: 40 });
    // S2: 10 more Resonance Energy, once every 20s
    if (isHeld(LY_S2) && !isHeld(S2_COOLDOWN)) {
      addGain({ energy: 1000 });
      applyCurrent(S2_COOLDOWN, 1);
    }
  },
  // Lion's Pride (Inherent Skill): Lion Awakens deals 50% more DMG
  applyStats: () => { if (isHeld(LY_INHERENT_1)) addStat(Stat.MulMv, 50); },
});
const Outro = lingyangAction("Outro - Frosty Marks", {
  animFrames: 0,
  cast: Cast.Outro, type: Type.Outro, minConcerto: 10000, castConcerto: -10000,
  bullets: [{ hitFrame: 0, mv: 58794 }],
});

const BA1 = lingyangAction("Basic - Majestic Fists 1", { notAfter: () => [BA1, BA2, BA3, BA4], animFrames: 18, animPriority: { 0: 2, 6: 3, 18: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 5965, energy: 75, concerto: 150, offtune: 2400 },
  ]});
const BA2 = lingyangAction("Basic - Majestic Fists 2", { after: [BA1], animFrames: 24, animPriority: { 0: 2, 8: 3, 24: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 7953, energy: 100, concerto: 200, offtune: 3200 },
  ]});
const BA3 = lingyangAction("Basic - Majestic Fists 3", { after: [BA2], animFrames: 48, animPriority: { 0: 2, 6: 3, 38: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 7287, energy: 91, concerto: 183, offtune: 2920 },
    { hitFrame: 29, mv: 7287, energy: 91, concerto: 183, offtune: 2920, updateDebuffs: furiousReady },
  ]});
const BA4 = lingyangAction("Basic - Majestic Fists 4", { after: [BA3], animFrames: 58, animPriority: { 0: 2, 2: 3, 54: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 2041, energy: 25, concerto: 51, offtune: 818 },
    { hitFrame: 16, mv: 2041, energy: 25, concerto: 51, offtune: 818 },
    { hitFrame: 22, mv: 2041, energy: 25, concerto: 51, offtune: 818 },
    { hitFrame: 28, mv: 2041, energy: 25, concerto: 51, offtune: 818 },
    { hitFrame: 34, mv: 2041, energy: 25, concerto: 51, offtune: 818 },
    { hitFrame: 42, mv: 4372, energy: 54, concerto: 109, offtune: 1752, updateDebuffs: furiousReady },
  ]});
// after Furious Punches, Basic Attack 5 is Feral Roars instead
const BA5 = lingyangAction("Basic - Majestic Fists 5", { after: [BA4], forbidBuff: ROARS_READY, animFrames: 48, animPriority: { 0: 2, 10: 3, 48: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 24, mv: 15249, energy: 191, concerto: 383, offtune: 6160, updateDebuffs: furiousReady },
  ]});
const FeralRoars = lingyangAction("Basic - Feral Roars", { after: [BA4], requireBuff: ROARS_READY, animFrames: 56, animPriority: { 0: 2, 10: 3, 48: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 7953, energy: 100, concerto: 200, offtune: 3200 },
    { hitFrame: 31, mv: 7953, energy: 100, concerto: 200, offtune: 3200, updateDebuffs: furiousReady },
  ],
  updateBuffs: () => revokeCurrent(ROARS_READY),
});

const HA = lingyangAction("Heavy - Majestic Fists", { maxForte1: 99, animFrames: 51, animPriority: { 0: 3 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 22, mv: 14573, energy: 183, concerto: 366, offtune: 5840 },
  ]});
const MA = lingyangAction("Mid-air - Majestic Fists Plunge", { castPosition: Position.Midair, endPosition: Position.Grounded, animFrames: 38, animPriority: { 0: 3, 2: 9, 36: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 28, mv: 12327, energy: 51, concerto: 100, offtune: 4960 },
  ]});
const DC = lingyangAction("Dodge Counter - Majestic Fists", { after: [SUCCESSFUL_DODGE], animFrames: 49, animPriority: { 0: 8, 45: 2 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 12605, energy: 158, concerto: 167, offtune: 2672 },
    { hitFrame: 28, mv: 12605, energy: 158, concerto: 167, offtune: 2672 },
  ], castConcerto: 1000});

// the Resonance Skill never resets the Basic Attack cycle: the next Basic follows the one before it
const AncientArts = lingyangAction("Skill - Ancient Arts", { forbidBuff: FURIOUS_READY, animFrames: 43, animPriority: { 0: 2, 33: 2 }, castPriority: 2, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 20, mv: 13261, energy: 166, concerto: 333, offtune: 5360 },
  ],
  updateBuffs: () => saveChain(previousPress()),
});
// after Feral Roars, the cycle starts again from Basic Attack 3
const FuriousPunches = lingyangAction("Skill - Furious Punches", { requireBuff: FURIOUS_READY, animFrames: 52, animPriority: { 0: 5, 42: 2 }, castPriority: 5, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 18, mv: 7625, energy: 95, concerto: 191, offtune: 3080, updateDebuffs: () => { if (!isHeld(LIONS_SPIRIT_DRAIN)) addGain({ forte1: 20 }); } },
    { hitFrame: 24, commitFrame: 18, mv: 7625, energy: 95, concerto: 191, offtune: 3080 },
  ],
  updateBuffs: () => {
    const prev = previousPress();
    saveChain((prev?.cancelOf ?? prev?.formOf ?? prev) === FeralRoars ? BA2 : prev);
    revokeCurrent(FURIOUS_READY);
    applyCurrent(ROARS_READY, 1);
  },
});

const Liberation = lingyangAction("Liberation - Strive: Lion's Vigor", {
  animFrames: 182, animPriority: { 0: 10, 180: 2 }, castPriority: 10, timestop: [0, 210], motionStop: [0, 151], cooldown: 60 * 20,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    { hitFrame: 120, mv: 39762, offtune: 168000 },
  ], castConcerto: 2000, castEnergy: -12500,
  updateBuffs: () => {
    if (!isHeld(LIONS_SPIRIT_DRAIN)) addGain({ forte1: 60 });
    applyCurrent(LIONS_VIGOR, 1);
    // S5: a 200% strike of its own, on wuwalab's frame 150
    if (isHeld(LY_S5)) queue(LiberationS5, 150);
  },
});
const LiberationS5 = lingyangAction("Liberation - Strive: Lion's Vigor (S5)", { node: Node.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 0, mv: 20000, offtune: 42000 }] });

/* ------------------------------------------------------------------------- Striding Lion */

const ENTRY_HIT = { hitFrame: 24, mv: 17237, energy: 260, concerto: 260, offtune: 6960, updateDebuffs: startDrain };
// wuwalab opens Diligent Practice's window on Glorious Plunge as on the Basic entry
const GloriousPlunge = lingyangAction("Heavy - Glorious Plunge", { minForte1: 100, endPosition: Position.Midair, animFrames: 54, animPriority: { 0: 3, 36: 3 }, castPriority: 3, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [ENTRY_HIT],
  updateBuffs: () => {
    applyCurrent(STRIDING_LION, 1);
    // if (isHeld(LY_INHERENT_2)) applyCurrent(DILIGENT_WINDOW, 1); // wuwalab is wrong, it shouldnt open the window
  },
});
// "After casting Lion Awakens or Strive: Lion's Vigor, if Lion's Spirit is full, use Basic Attack"
const StridingLionEntry = lingyangAction("Basic - Striding Lion", { after: () => [Intro, Liberation], minForte1: 100, endPosition: Position.Midair, animFrames: 54, animPriority: { 0: 4, 36: 3 }, castPriority: 4, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [ENTRY_HIT],
  updateBuffs: () => {
    applyCurrent(STRIDING_LION, 1);
    if (isHeld(LY_INHERENT_2)) applyCurrent(DILIGENT_WINDOW, 1);
  },
});

const FMA1 = lingyangAction("Mid-air - Feral Gyrate 1", { notAfter: () => [FMA1], requireBuff: STRIDING_LION, minForte1: 10, castPosition: Position.Midair, animFrames: 73, animPriority: { 0: 3, 61: 3 }, castPriority: 3, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 20, mv: 8708, energy: 175, concerto: 175, offtune: 2808 },
    { hitFrame: 32, mv: 8708, energy: 175, concerto: 175, offtune: 2808 },
    { hitFrame: 56, mv: 11611, energy: 233, concerto: 233, offtune: 3744 },
  ],
  updateBuffs: () => { if (isHeld(LY_INHERENT_2)) applyCurrent(DILIGENT_WINDOW, 1); },
});
const FMA2 = lingyangAction("Mid-air - Feral Gyrate 2", { after: [FMA1], requireBuff: STRIDING_LION, minForte1: 10, castPosition: Position.Midair, animFrames: 72, animPriority: { 0: 3, 62: 3 }, castPriority: 3, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 3177, energy: 63, concerto: 63, offtune: 1027 },
    { hitFrame: 22, mv: 3177, energy: 63, concerto: 63, offtune: 1027 },
    { hitFrame: 30, mv: 3177, energy: 63, concerto: 63, offtune: 1027 },
    { hitFrame: 38, mv: 3177, energy: 63, concerto: 63, offtune: 1027 },
    { hitFrame: 46, mv: 3177, energy: 63, concerto: 63, offtune: 1027 },
    { hitFrame: 56, mv: 3177, energy: 63, concerto: 63, offtune: 1027 },
  ],
  updateBuffs: () => { if (isHeld(LY_INHERENT_2)) applyCurrent(DILIGENT_WINDOW, 1); },
});
// below 10 Lion's Spirit the Basic is Stormy Kicks, which ends the stance (the drain runs on)
const StormyKicks = lingyangAction("Mid-air - Stormy Kicks", { requireBuff: STRIDING_LION, maxForte1: 9, castPosition: Position.Midair, animFrames: 128, animPriority: { 0: 6, 126: 0 }, castPriority: 6, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 36, mv: 3603, energy: 72, concerto: 72, offtune: 1158 },
    { hitFrame: 44, mv: 3603, energy: 72, concerto: 72, offtune: 1158 },
    { hitFrame: 48, mv: 3603, energy: 72, concerto: 72, offtune: 1158 },
    { hitFrame: 54, mv: 3603, energy: 72, concerto: 72, offtune: 1158 },
    { hitFrame: 58, mv: 3603, energy: 72, concerto: 72, offtune: 1158 },
    { hitFrame: 66, mv: 3603, energy: 72, concerto: 72, offtune: 1158 },
    { hitFrame: 70, mv: 3603, energy: 72, concerto: 72, offtune: 1158 },
    { hitFrame: 76, mv: 3603, energy: 72, concerto: 72, offtune: 1158 },
    { hitFrame: 96, mv: 19215, energy: 386, concerto: 386, offtune: 6176 },
  ],
  updateBuffs: () => revokeCurrent(STRIDING_LION),
});
// the jump inside Striding Lion dismounts him (wuwalab Jump: Dismount, leave_striding_lion)
const Dismount = lingyangAction("Jump - Dismount", { requireBuff: STRIDING_LION, endPosition: Position.Grounded, animFrames: 20, animPriority: { 0: 9 }, castPriority: 8, node: Node.Forte, cast: Cast.Jump,
  updateBuffs: () => revokeCurrent(STRIDING_LION),
});
// "use Basic Attack after Heavy Attack" (Lion's Spirit not full), or after Stormy Kicks
const TailStrike = lingyangAction("Mid-air - Tail Strike", { after: () => [HA, StormyKicks], maxForte1: 99, endPosition: Position.Grounded, animFrames: 94, animPriority: { 0: 3, 2: 9, 37: 2 }, castPriority: 3, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 24, mv: 17496, energy: 73, concerto: 146, offtune: 7040 },
    { hitFrame: 57, mv: 17496, energy: 73, concerto: 146, offtune: 7040 },
  ],
  updateBuffs: () => revokeCurrent(STRIDING_LION),
});

// Mountain Roamer keeps the Feral Gyrate cycle; inside Diligent Practice's window it adds a strike
// of 150% its DMG (248.64%, Resonance Skill DMG) and spends the window
const ROAMER_HIT = { mv: 8288, energy: 166, concerto: 166, offtune: 2680 };
// only a Gyrate 1 needs carrying (its Gyrate 2 follows); after a Gyrate 2 the next Basic is a Gyrate 1 anyway
const roamerCast = (): void => {
  let p = previousPress();
  for (let n = 0; n < 2; n++) {
    while (p && (p.cancelOf ?? p.formOf)) p = p.cancelOf ?? p.formOf;
    if (p instanceof ActionGroup) p = p.actions[p.actions.length - 1]!;
  }
  if (p === FMA1) saveChain(FMA1);
  revokeCurrent(DILIGENT_WINDOW);
};
// S6's bonus lands with Mountain Roamer's first hit (wuwalab grant_s6_basic_bonus, frame 18)
const s6Grant = (): void => { if (isHeld(LY_S6)) applyCurrent(DEMONS_TREMBLE, 1); };
const Roamer = lingyangAction("Skill - Mountain Roamer", { requireBuff: STRIDING_LION, castPosition: Position.Midair, animFrames: 46, animPriority: { 0: 4, 33: 3 }, castPriority: 4, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 18, ...ROAMER_HIT, updateDebuffs: s6Grant },
    { hitFrame: 30, commitFrame: 18, ...ROAMER_HIT },
  ],
  updateBuffs: roamerCast,
});
const RoamerDiligent = lingyangAction("Skill - Mountain Roamer (Diligent Practice)", { requireBuff: DILIGENT_WINDOW, castPosition: Position.Midair, animFrames: 46, animPriority: { 0: 4, 33: 3 }, castPriority: 4, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 18, ...ROAMER_HIT, updateDebuffs: s6Grant },
    { hitFrame: 25, mv: 24864, energy: 100, concerto: 100 },
    { hitFrame: 30, commitFrame: 18, ...ROAMER_HIT },
  ],
  updateBuffs: roamerCast,
});
const MountainRoamer = new Action("Mountain Roamer Resolver", { cast: Cast.Skill, resolve: () => (isHeld(DILIGENT_WINDOW) ? RoamerDiligent : Roamer) });

/* ------------------------------------------------------------------------------------ gear */

/** Lion's Pride (Inherent Skill): Lion Awakens +50% DMG — paid by the Intro itself. */
const LY_INHERENT_1 = new Inherent({ name: "Inherent: Lion's Pride" });
/** Diligent Practice (Inherent Skill): the Mountain Roamer strike above, read off this being held. */
const LY_INHERENT_2 = new Inherent({ name: "Inherent: Diligent Practice" });

/* -------------------------------------------------------------------------------- sequences */

/** S1: Anti-Interruption under Lion's Vigor � no stat. */
const LY_S1 = new Sequence({ name: "Lingyang S1: Lion of Light, Blessings Abound" });

/** S2's 20s window between its Energy payouts (the Intro pays it). */
const S2_COOLDOWN = new Buff({ name: "Lingyang S2: cooldown", duration: 60 * 20 });
const LY_S2 = new Sequence({ name: "Lingyang S2: Dominant and Fierce, Power Unbound" });

/** S3: under Lion's Vigor, +20% Basic Attack and +10% Resonance Skill DMG Bonus. */
const LY_S3 = new Sequence({
  name: "Lingyang S3: Jaw-Dropping Feats, Loud and Wide",
  applyStats: () => {
    if (!isHeld(LIONS_VIGOR)) return;
    addStat(Stat.DmgBonus, 20, Type.Basic);
    addStat(Stat.DmgBonus, 10, Type.Skill);
  },
});

/** S4: Frosty Marks gives the whole team +20% Glacio DMG Bonus for 30s. */
const IMMORTALS_BOW = new Buff({
  name: "Lingyang S4: Immortals Bow, in Reverence Flawed",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 20, Attribute.Glacio]],
});
const LY_S4 = new Sequence({
  name: "Lingyang S4: Immortals Bow, in Reverence Flawed",
  grants: [{ on: onAction(Outro), buff: IMMORTALS_BOW, to: BuffTarget.Team }],
});

/** S5: the Liberation's extra strike � queued by the Liberation itself. */
const LY_S5 = new Sequence({ name: "Lingyang S5: Seven Stars Shine, Stepped upon High" });

/** S6: for 3s after a Mountain Roamer, the next Basic Attack gets +100% Basic Attack DMG Bonus.
 *  wuwalab spends it partway through that Basic (consume_s6_basic_bonus): Gyrate 1 at frame 53,
 *  Gyrate 2 at 48, Stormy Kicks at 90 � the hits after that miss it. */
const DEMONS_TREMBLE: Buff = new Buff({
  name: "Lingyang S6: Demons Tremble, Divine Power Nigh",
  duration: 60 * 3,
  applyStats: () => {
    const spent = runningAction(FMA1) ? 53 : runningAction(FMA2) ? 48 : runningAction(StormyKicks) ? 90 : Infinity;
    if (currentHit().hitFrame < spent) addStat(Stat.DmgBonus, 100, Type.Basic);
  },
  afterAction: () => { if (casting(Cast.Basic)) revokeCurrent(DEMONS_TREMBLE); },
});
const LY_S6 = new Sequence({ name: "Lingyang S6: Demons Tremble, Divine Power Nigh" });

// wuwalab: the Tune Break leaves Striding Lion (leave_striding_lion), the drain running on
const LY_TB_BASE = tuneBreak(94, 94, [0, 94], [0, 70], [[72, 160000]]);
const LY_TUNE_BREAK = LY_TB_BASE.variant(LY_TB_BASE.name, { updateBuffs: () => revokeCurrent(STRIDING_LION) });
LY_TUNE_BREAK.formOf = LY_TB_BASE.formOf;

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
const LINGYANG_TALENTS = new Talent({
  name: "Lingyang: Talents",
  stats: [[Stat.BonusAtk, 11.9999997], [Stat.DmgBonus, 12, Attribute.Glacio]],
});

const LINGYANG_RESONATOR = new Resonator({
  id: 1104,
  name: "Lingyang",
  talent: LINGYANG_TALENTS,
  inherent1: LY_INHERENT_1,
  inherent2: LY_INHERENT_2,
  element: Attribute.Glacio,
  weapon: WeaponType.Gauntlets,
  color: "#a89a8e",
  intro: Intro,
  swapIn: BA1,
  swapInAir: () => (isHeld(STRIDING_LION) ? (forte1() < 10 ? StormyKicks : FMA1) : MA),
  tuneBreak: LY_TUNE_BREAK,
  jump: () => (isHeld(STRIDING_LION) ? Dismount : null),
  maxEnergy: 12500,
  maxForte1: 100,
  tier: Tier.FreeS0,

  stats: [[Stat.BaseHp, 10387.5], [Stat.BaseAtk, 437.5], [Stat.BaseDef, 1209.9978]],
});

/* ---------------------------------------------------------------------------------- rotation */

const FMA12 = new ActionGroup("Mid-air - Feral Gyrate 12", [FMA1, FMA2]);

const LY_ROTATION_BASIC = new Rotation([
  Intro, MECH_ABOMINATION, SENTRY_CONSTRUCT, LAMPYLUMEN_MYRIAD_1, LAMPYLUMEN_MYRIAD_2, LAMPYLUMEN_MYRIAD_3.dodgeCancel(), 
  Liberation, StridingLionEntry, 
  // best Striding Lion fill for Sanhua + Shorekeeper (window search, 31068 team DPS)
  FMA1.hitCancel(), MountainRoamer, FMA2.instaCancel(), MountainRoamer,
  FMA1.hitCancel(), MountainRoamer, FMA2.instaCancel(), MountainRoamer,
  FMA1.instaCancel(), MountainRoamer, FMA2.instaCancel(), MountainRoamer,
  FMA1.instaCancel(), MountainRoamer, FMA2.instaCancel(), MountainRoamer,
  FMA1.hitCancel(), MountainRoamer, //FMA2.instaCancel(), MountainRoamer, // best is 9 skill in practice?
  StormyKicks.swapCancel(),
  Outro,
]);

// need to check better s6 rot

/* ----------------------------------------------------------------------------------- loadout */

export const LINGYANG = new Loadout({
  id: 11041,
  resonator: LINGYANG_RESONATOR,
  weapons: [BLAZING_JUSTICE, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoes: new Echoes({
    sets: [
      new EchoLoadout(LAMPYLUMEN_MYRIAD_MAINSLOT, FREEZING_FROST_5PC),
      new EchoLoadout(SENTRY_CONSTRUCT_MAINSLOT, FROSTY_RESOLVE_5PC),
      new EchoLoadout(MECH_ABOMINATION_MAINSLOT, LINGERING_TUNES_5PC),
    ],
    mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.Glacio3, Mainstat.ATK3, Mainstat.ER3, Mainstat.ATK1),
    substats: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.Skill, Substat.FlatAtk),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  }),
  rotation: { 0: LY_ROTATION_BASIC },
  sequences: [LY_S1, LY_S2, LY_S3, LY_S4, LY_S5, LY_S6],
});
