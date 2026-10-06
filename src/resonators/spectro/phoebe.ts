/**
 * Phoebe — a limited 5-star Spectro Rectifier with two exclusive stances and one loadout each:
 * PHOEBE_ABSOLUTION (her own damage) and PHOEBE_CONFESSION (the Spectro Frazzle support every
 * Frazzle team runs).
 *
 * Both are the same Forte Circuit spent two ways. The stance cast restores Divine Voice (forte2,
 * 0-60) to full: hold Basic for Heavy Attack Absolution Litany and she is in Absolution, hold
 * Skill for Resonance Skill Utter Confession and she is in Confession. Neither can be cast while
 * Divine Voice remains (`maxForte2: 0`), and once it runs dry the stance no longer ends — so a
 * visit casts the stance on an empty bar and spends all of it on Heavy Attack: Starflash (30 a
 * cast, 15 in Absolution, opened by a Stage 3 or a Dodge Counter). The stance is whatever that
 * cast put up and nothing a build equips: she enters combat in neither, on an empty bar, and each
 * loadout differs only in which of the two casts its rotation names.
 *
 * Prayer is deliberately not modelled. It holds 120 and fills itself at 5 a second with nothing
 * else feeding it, so it is only ever a 24-second cooldown on entering a stance — and the
 * rotations below enter one exactly once a visit, which no 24s cooldown would ever block. A gauge
 * for it would be a bar that fills and empties on schedule and gates nothing.
 *
 * What the two stances change: Absolution multiplies — Starflash gains 256% amplification against
 * a Frazzled target, and the Liberation and Outro run at 3.55x. Confession applies — Starflash
 * lays 5 Spectro Frazzle, the Liberation 8, and her Outro hands the incoming resonator Silent
 * Prayer: 10% Spectro RES off the target, 100% amplification on its Spectro Frazzle DMG, and the
 * status's own tick interval stretched by half (shared/status.ts's FRAZZLE_SLOWED).
 *
 * The Ring of Mirrors is a 30s buff her Skill summons, and the Chamuel's Star chain below is her
 * Basic Attack while she stands inside it, so those presses require it. Refracted Holy Light, which
 * only fires while she is *outside* the ring, is declared and unused. A Stage 3 or Dodge Counter cast
 * with Divine Voice readies the next Heavy Attack as Starflash (STARFLASH_READY), which Starflash
 * consumes. Mid-air Heavy Attack is pure traversal and carries no motion value at all.
 *
 * Motion values, energy, concerto and off-tune off nanoka.cc (character 1506, CDN 3.7.3), each
 * action summed from its own Skill Attributes row plus the flat "Concerto Regen" rows beside it.
 * The Outro is the one row nanoka's own damage entries do not reconcile — its text states 528.41%
 * of ATK, and wuwalab's frame data resolves that into the eight 66.06% hits used here. The stance
 * multipliers are read off nanoka's own S-chain twin rows: 401.60% x 3.55 is the Absolution
 * Liberation, x 5.8 that same cast at S1, so each "increase the DMG Multiplier by N%" is a
 * multiplier on the row rather than points added to it — the Liberation plays each row as its own
 * form, off-tune and all. Base stats from the same nanoka file.
 */
import { Stat, EnemyStat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addStat,
  addEnemyStat,
  applyCurrent,
  applyEnemy,
  applyTeam,
  currentTeam,
  forte2,
  isHeld,
  onAction,
  queue,
  revokeCurrent,
  runningAction,
  stacksOfEnemy,
} from "../../engine/context.js";
import { Action, ActionGroup, Rotation, ECHO, NOINTRO, ActionTag, INTRO, OUTRO } from "../../engine/rotation.js";
import { FRAZZLE_SLOWED, SPECTRO_FRAZZLE } from "../../shared/status.js";
import { LUMINOUS_HYMN, STRINGMASTER } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { ETERNAL_RADIANCE_5PC, CAPITANEUS } from "../../echoes/rinascita.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

/** The two stances. Neither is equipped — the forte cast that enters one puts it up and ends the
 *  other, which is the kit's own wording ("Absolution and Confession cannot coexist. Entering into
 *  one will end the other"). Once up a stance is permanent: only the opposite cast replaces it,
 *  and a loop exhausts Divine Voice before every stance cast, which is the condition the kit says
 *  keeps a stance standing. So she is in neither until her first stance cast lands, her opening
 *  visit's Liberation included. Absolution's Starflash is its own form (FHA_ABS). */
const ABSOLUTION = new Buff({ name: "Phoebe: Absolution" });
const CONFESSION = new Buff({ name: "Phoebe: Confession" });

/** Ring of Mirrors: 30s off her Skill's summon, a new summon replacing (refreshing) the old. Her
 *  Chamuel's Star presses require it. */
const RING_OF_MIRRORS = new Buff({ name: "Phoebe: Ring of Mirrors", duration: 60 * 30 });

/** "When Phoebe has Divine Voice, casting Basic Attack Stage 3 or Dodge Counter replaces the next
 *  Heavy Attack with Heavy Attack: Starflash": a one-shot every stance-cast Starflash consumes. */
const STARFLASH_READY = new Buff({ name: "Phoebe: Starflash Ready" });
function readyStarflash(): void {
  if (forte2() > 0) applyCurrent(STARFLASH_READY, 1);
}

function phoebeAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- O Come Divine Light: her chain outside the Ring of Mirrors.
const BA1 = phoebeAction("Basic - O Come Divine Light 1", { animFrames: 26, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 16, mv: 2953, energy: 100, concerto: 199, offtune: 3184 }]});
const BA2 = phoebeAction("Basic - O Come Divine Light 2", { animFrames: 33, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 2237, energy: 60, concerto: 120, offtune: 1920 },
    { hitFrame: 26, mv: 2734, energy: 74, concerto: 147, offtune: 2347 },
  ]});
const BA3 = phoebeAction("Basic - O Come Divine Light 3", { animFrames: 60, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 36, mv: 1424, energy: 37, concerto: 73, offtune: 1164 },
    { hitFrame: 42, commitFrame: 36, mv: 1424, energy: 37, concerto: 73, offtune: 1164 },
    { hitFrame: 48, commitFrame: 36, mv: 1424, energy: 37, concerto: 73, offtune: 1164 },
    { hitFrame: 54, commitFrame: 36, mv: 1424, energy: 37, concerto: 73, offtune: 1164 },
    { hitFrame: 60, commitFrame: 36, mv: 1424, energy: 37, concerto: 73, offtune: 1164 },
    { hitFrame: 66, commitFrame: 36, mv: 1424, energy: 37, concerto: 73, offtune: 1164 },
    { hitFrame: 72, commitFrame: 36, mv: 1424, energy: 37, concerto: 73, offtune: 1164 },
    { hitFrame: 78, commitFrame: 36, mv: 1424, energy: 37, concerto: 73, offtune: 1164 },
  ], updateBuffs: () => readyStarflash()});
const DC = phoebeAction("Dodge Counter - O Come Divine Light", { animFrames: 60, castPriority: 2, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 36, mv: 2158, energy: 56, concerto: 111, offtune: 1764 },
    { hitFrame: 42, commitFrame: 36, mv: 2158, energy: 56, concerto: 111, offtune: 1764 },
    { hitFrame: 48, commitFrame: 36, mv: 2158, energy: 56, concerto: 111, offtune: 1764 },
    { hitFrame: 54, commitFrame: 36, mv: 2158, energy: 56, concerto: 111, offtune: 1764 },
    { hitFrame: 60, commitFrame: 36, mv: 2158, energy: 56, concerto: 111, offtune: 1764 },
    { hitFrame: 66, commitFrame: 36, mv: 2158, energy: 56, concerto: 111, offtune: 1764 },
    { hitFrame: 72, commitFrame: 36, mv: 2158, energy: 56, concerto: 111, offtune: 1764 },
    { hitFrame: 78, commitFrame: 36, mv: 2158, energy: 56, concerto: 111, offtune: 1764 },
  ], castConcerto: 1000, updateBuffs: () => readyStarflash()});
const MA = phoebeAction("Mid-air - O Come Divine Light", { animFrames: 78, animPriority: { 8: 3 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 2, mv: 4623, energy: 150, concerto: 300, offtune: 4800 },
    { hitFrame: 27, mv: 4623, energy: 150, concerto: 300, offtune: 4800 },
  ]});
const HA = phoebeAction("Heavy - O Come Divine Light", { animFrames: 61, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 40, mv: 4135, energy: 70, concerto: 139, offtune: 2218 },
    { hitFrame: 49, commitFrame: 40, mv: 4135, energy: 70, concerto: 139, offtune: 2218 },
    { hitFrame: 58, commitFrame: 40, mv: 4135, energy: 70, concerto: 139, offtune: 2218 },
    { hitFrame: 67, commitFrame: 40, mv: 4135, energy: 70, concerto: 139, offtune: 2218 },
  ]});

// --- Chamuel's Star: the same chain while she stands inside the Ring of Mirrors. Basic Attack
//     DMG, and only castable while the ring stands.
const CBA1 = phoebeAction("Basic - Chamuel's Star 1", { requireBuff: RING_OF_MIRRORS, animFrames: 22, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 18, mv: 5935, energy: 100, concerto: 199, offtune: 3184 }]});
const CBA2 = phoebeAction("Basic - Chamuel's Star 2", { requireBuff: RING_OF_MIRRORS, animFrames: 32, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, commitFrame: 0, mv: 3977, energy: 67, concerto: 134, offtune: 2134 },
    { hitFrame: 120, commitFrame: 0, mv: 3977, energy: 67, concerto: 134, offtune: 2134 },
  ]});
const CBA3 = phoebeAction("Basic - Chamuel's Star 3", { requireBuff: RING_OF_MIRRORS, animFrames: 61, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 36, commitFrame: 0, mv: 2893, energy: 49, concerto: 97, offtune: 1552 },
    { hitFrame: 42, commitFrame: 0, mv: 2893, energy: 49, concerto: 97, offtune: 1552 },
    { hitFrame: 48, commitFrame: 0, mv: 2893, energy: 49, concerto: 97, offtune: 1552 },
    { hitFrame: 54, commitFrame: 0, mv: 2893, energy: 49, concerto: 97, offtune: 1552 },
    { hitFrame: 60, commitFrame: 0, mv: 2893, energy: 49, concerto: 97, offtune: 1552 },
    { hitFrame: 66, commitFrame: 0, mv: 2893, energy: 49, concerto: 97, offtune: 1552 },
  ], updateBuffs: () => readyStarflash()});
const CDC = phoebeAction("Dodge Counter - Chamuel's Star", { requireBuff: RING_OF_MIRRORS, animFrames: 60, castPriority: 2, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 36, commitFrame: 0, mv: 4384, energy: 74, concerto: 147, offtune: 2352 },
    { hitFrame: 42, commitFrame: 0, mv: 4384, energy: 74, concerto: 147, offtune: 2352 },
    { hitFrame: 48, commitFrame: 0, mv: 4384, energy: 74, concerto: 147, offtune: 2352 },
    { hitFrame: 54, commitFrame: 0, mv: 4384, energy: 74, concerto: 147, offtune: 2352 },
    { hitFrame: 60, commitFrame: 0, mv: 4384, energy: 74, concerto: 147, offtune: 2352 },
    { hitFrame: 66, commitFrame: 0, mv: 4384, energy: 74, concerto: 147, offtune: 2352 },
  ], castConcerto: 1000, updateBuffs: () => readyStarflash()});
const CBA123 = new ActionGroup("Basic - Chamuel's Star 123", [CBA1, CBA2, CBA3]);

// --- To Where Light Shines: the ring itself, the re-press that teleports her to it, and the
//     refraction a Basic or Dodge Counter causes while she is outside it.
const Skill = phoebeAction("Skill - To Where Light Shines", {
  animFrames: 70, castPriority: 3,
  cooldown: 60 * 12,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 37, commitFrame: 0, mv: 6263, energy: 57, concerto: 114, offtune: 3360 },
    { hitFrame: 44, commitFrame: 0, mv: 6263, energy: 57, concerto: 114, offtune: 3360 },
  ],
  // the summon: a new ring replaces the standing one, so the grant refreshes its 30s
  updateBuffs: () => applyCurrent(RING_OF_MIRRORS, 1),
});
const SkillTeleport = phoebeAction("Skill - To Where Light Shines (Teleport)", {
  requireBuff: RING_OF_MIRRORS,
  cooldown: 42,
  animFrames: 91, castPriority: 4,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 53, mv: 6263, energy: 57, concerto: 114, offtune: 3360 },
    { hitFrame: 59, commitFrame: 53, mv: 6263, energy: 57, concerto: 114, offtune: 3360 },
  ],
});
const Refracted = phoebeAction("Skill - Ring of Mirrors: Refracted Holy Light", {
  animFrames: 18,
  node: Node.Skill, type: Type.Basic, bullets: [{ hitFrame: 6, mv: 1492 }, { hitFrame: 18, mv: 1492 }],
});

// --- Radiant Invocation: the two stance casts, and the Starflash that spends what they restore.
const HeavyAbs = phoebeAction("Forte Heavy - Absolution Litany", {
  animFrames: 66, castPriority: 3,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 48, commitFrame: 0, mv: 63819, energy: 1000, offtune: 32872, updateDebuffs: () => applyEnemy(SPECTRO_FRAZZLE, 1) },
  ], castConcerto: 1000,
  // restores the full 60, and only once Divine Voice is exhausted
  castForte2: 60, maxForte2: 0,
  updateBuffs: () => {
    revokeCurrent(CONFESSION);
    applyCurrent(ABSOLUTION, 1);
  },
});
const SkillConf = phoebeAction("Forte Skill - Utter Confession", {
  animFrames: 66, castPriority: 3,
  node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 48, commitFrame: 0, mv: 18788, energy: 1800, offtune: 24720, updateDebuffs: () => applyEnemy(SPECTRO_FRAZZLE, 1) },
  ], castConcerto: 4000,
  castForte2: 60, maxForte2: 0,
  updateBuffs: () => {
    revokeCurrent(ABSOLUTION);
    applyCurrent(CONFESSION, 1);
  },
});

/** Heavy Attack: Starflash — 30 Divine Voice, castable while any remains. Each stance has its own
 *  form below; this stanceless one never has Divine Voice to spend. */
const FHA = phoebeAction("Forte Heavy - Starflash", {
  animFrames: 55, castPriority: 3,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 28, mv: 8269, energy: 153, concerto: 138, offtune: 6467 },
    { hitFrame: 34, commitFrame: 28, mv: 8269, energy: 153, concerto: 138, offtune: 6467 },
    { hitFrame: 40, commitFrame: 28, mv: 8269, energy: 153, concerto: 138, offtune: 6467 },
  ],
  castForte2: -30, minForte2: 1,
  requireBuff: STARFLASH_READY,
  updateBuffs: () => revokeCurrent(STARFLASH_READY),
});
/** Confession's Starflash: the same 30, laying five Spectro Frazzle. */
const FHA_CONF = FHA.variant("Forte Heavy - Starflash (Confession)", { requireBuff: STARFLASH_READY, bullets: [
    { hitFrame: 28, mv: 8269, energy: 153, concerto: 138, offtune: 6467, updateDebuffs: () => applyEnemy(SPECTRO_FRAZZLE, 5) },
    { hitFrame: 34, commitFrame: 28, mv: 8269, energy: 153, concerto: 138, offtune: 6467 },
    { hitFrame: 40, commitFrame: 28, mv: 8269, energy: 153, concerto: 138, offtune: 6467 },
  ]});
/** Absolution's Starflash: 15 Divine Voice, and 256% amplification against a Frazzled target. */
const FHA_ABS = FHA.variant("Forte Heavy - Starflash (Absolution)", { castPriority: 3,
  requireBuff: STARFLASH_READY,
  castForte2: -15,
  applyStats: () => {
    if (stacksOfEnemy(SPECTRO_FRAZZLE) > 0) addStat(Stat.Amp, 256);
  },
});
/** S3's Confession Starflash: nanoka's own twin row (288.56%), whose off-tune is 0.1467 against
 *  the base row's 0.6467 — a separate entry, so a form of its own rather than a multiplier. */
const FHA_S3 = FHA.variant("Forte Heavy - Starflash (S3 Confession)", { requireBuff: STARFLASH_READY, bullets: [
    { hitFrame: 28, mv: 28856, energy: 153, concerto: 138, offtune: 1467, updateDebuffs: () => applyEnemy(SPECTRO_FRAZZLE, 5) },
    { hitFrame: 34, commitFrame: 28, mv: 28856, energy: 153, concerto: 138, offtune: 1467 },
    { hitFrame: 40, commitFrame: 28, mv: 28856, energy: 153, concerto: 138, offtune: 1467 },
  ]});
/** The Starflash a rotation writes: her stance's own, Confession's S3 form once S3 is held. */
const Starflash = new Action("Starflash Resolver", { resolve: () => {
  if (isHeld(ABSOLUTION)) return FHA_ABS;
  if (!isHeld(CONFESSION)) return FHA;
  return isHeld(PHOEBE_S3) ? FHA_S3 : FHA_CONF;
} });
/** S6's extra Starflash at the ring's location: no Divine Voice, and not a Heavy Attack cast —
 *  so it needs no readied Heavy, consumes none, and never opens or closes anything. */
const StarflashFreeConf = FHA_CONF.variant("Forte Heavy - Starflash (Ring of Mirrors, Confession)", {
  cast: null, castForte2: 0, minForte2: undefined, requireBuff: undefined, updateBuffs: undefined, tag: ActionTag.Field,
});
const StarflashFreeAbs = FHA_ABS.variant("Forte Heavy - Starflash (Ring of Mirrors, Absolution)", {
  cast: null, castForte2: 0, minForte2: undefined, requireBuff: undefined, updateBuffs: undefined, tag: ActionTag.Field,
});
const StarflashFreeS3 = FHA_S3.variant("Forte Heavy - Starflash (Ring of Mirrors, S3 Confession)", {
  cast: null, castForte2: 0, minForte2: undefined, requireBuff: undefined, updateBuffs: undefined, tag: ActionTag.Field,
});

/** Dawn of Enlightenment's one hit, by stance and S1: each its own nanoka row (encore 1506202092-095),
 *  off-tune included — 4.8 plain, 8.4 in Absolution, 4.8 in Absolution at S1, 8.4 in Confession at S1. */
const libHit = (mv: number, offtune: number) => [{ hitFrame: 186, mv, offtune, updateDebuffs: () => {
  if (!isHeld(CONFESSION)) return;
  // S1 puts on the most the target can hold instead of the flat eight
  applyEnemy(SPECTRO_FRAZZLE, isHeld(PHOEBE_S1) ? currentTeam().enemyMax(SPECTRO_FRAZZLE) : 8);
} }];
const LibPlain = phoebeAction("Liberation - Dawn of Enlightenment", {
  animFrames: 220, castPriority: 10, timestop: [0, 220], motionStop: [0, 218],
  cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation,
  bullets: libHit(40160, 48000), castConcerto: 2000, resetEnergy: true,
});
const LibAbsolution = LibPlain.variant("Liberation - Dawn of Enlightenment (Absolution)", { bullets: libHit(142567, 84000) });
const LibAbsolutionS1 = LibPlain.variant("Liberation - Dawn of Enlightenment (Absolution S1)", { bullets: libHit(232926, 48000) });
const LibConfession = LibPlain.variant("Liberation - Dawn of Enlightenment (Confession)", {});
const LibConfessionS1 = LibPlain.variant("Liberation - Dawn of Enlightenment (Confession S1)", { bullets: libHit(76304, 84000) });
/** The Liberation a rotation writes: the row her stance and S1 call for, read at the cast. */
const Liberation = new Action("Liberation Resolver", {
  cast: Cast.Liberation,
  resolve: () => {
    if (isHeld(ABSOLUTION)) return isHeld(PHOEBE_S1) ? LibAbsolutionS1 : LibAbsolution;
    if (!isHeld(CONFESSION)) return LibPlain;
    return isHeld(PHOEBE_S1) ? LibConfessionS1 : LibConfession;
  },
});

const Intro = phoebeAction("Intro - Golden Grace", {
  qteFrames: 53, animFrames: 98, noSwapFrames: 69, animPriority: { 69: 9 }, castPriority: 11, motionStop: [4, 46],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 45, mv: 19881, energy: 1000, offtune: 8000 }], castConcerto: 1000,
});

/** Attentive Heart: 528.41% of ATK, x3.55 in Absolution, and in Confession Silent Prayer onto the
 *  whole team, with the slowed tick interval onto the target. */
const Outro = phoebeAction("Outro - Attentive Heart", {
  animFrames: 180, animPriority: { 0: 10 }, castPriority: 10,
  cast: Cast.Outro, type: Type.Outro, bullets: [
    { hitFrame: 30, commitFrame: 3, mv: 6606 },
    { hitFrame: 45, mv: 6606 },
    { hitFrame: 60, mv: 6606 },
    { hitFrame: 75, mv: 6606 },
    { hitFrame: 90, mv: 6606 },
    { hitFrame: 105, mv: 6606 },
    { hitFrame: 120, mv: 6606 },
    { hitFrame: 135, mv: 6606 },
  ], minConcerto: 10000, castConcerto: -10000,
  applyStats: () => {
    if (isHeld(ABSOLUTION)) addStat(Stat.MulMv, 255);
    if (isHeld(PHOEBE_S2) && isHeld(ABSOLUTION) && stacksOfEnemy(SPECTRO_FRAZZLE) > 0) addStat(Stat.Amp, 120);
  },
  updateBuffs: () => {
    if (!isHeld(CONFESSION)) return;
    applyTeam(SILENT_PRAYER, 1);
    if (isHeld(PHOEBE_S2)) applyTeam(SILENT_PRAYER_S2, 1);
    applyEnemy(FRAZZLE_SLOWED, 1);
  },
});

/* ------------------------------------------------------------------------------------ buffs */

/** Presence (Inherent Skill): one more Mid-air Heavy Attack, which is traversal — a no-op held
 *  for the name. */
const PHOEBE_INHERENT_1 = new Inherent({ name: "Inherent: Presence" });

/** Revelation (Inherent Skill): +12% Spectro DMG Bonus in either stance. */
const PHOEBE_INHERENT_2 = new Inherent({
  name: "Inherent: Revelation",
  applyStats: () => {
    if (isHeld(ABSOLUTION) || isHeld(CONFESSION)) addStat(Stat.DmgBonus, 12, Attribute.Spectro);
  },
});

/** Silent Prayer: 30s, so permanent once it lands. Team-wide rather than the "Resonator on the
 *  field" handoff its own text describes, because what it amplifies is Spectro Frazzle DMG — and a
 *  status's rungs fire on whoever *applied* it, which is rarely whoever received the handoff. In a
 *  Zani team that is the whole of it: every Heliacal Ember row lands on Phoebe's or Spectro
 *  Rover's slot while Zani is the one who intro'd behind the Outro, so a single-holder buff would
 *  have amplified none of the damage it exists to amplify. Phoebe is not excluded for the same
 *  reason — she is one of the appliers those rows are filed under. The Spectro RES shred is
 *  target-side anyway and reaches every attacker once any member holds this. */
const SILENT_PRAYER = new Buff({
  name: "Phoebe: Silent Prayer",
  stats: [[Stat.Amp, 100, Subtype.SpectroFrazzle]],
  applyStats: () => addEnemyStat(EnemyStat.ResReduce, 10, Attribute.Spectro),
});

/** S2's Confession half: another 120% on Silent Prayer's own amplification, granted the same way
 *  rather than the buff above having to know which sequence level put it up. */
const SILENT_PRAYER_S2 = new Buff({
  name: "Phoebe S2: A Boat Adrift in Tears",
  stats: [[Stat.Amp, 120, Subtype.SpectroFrazzle]],
});

/* -------------------------------------------------------------------------------- sequences */

/** S1: the Liberation's own multipliers and the Confession Frazzle cap — paid out on the cast
 *  itself, which is where both halves are read. */
const PHOEBE_S1 = new Sequence({ name: "Phoebe S1: Warm Light and Bedside Wishes" });

/** S2: Absolution amplifies her Outro against a Frazzled target; Confession pays into Silent
 *  Prayer. Both halves live on the casts that grant them (the Outro above). */
const PHOEBE_S2 = new Sequence({ name: "Phoebe S2: A Boat Adrift in Tears" });

/** S3: Starflash's multiplier x1.91 in Absolution — nanoka's twin row (82.69% -> 157.92%). In
 *  Confession it is FHA_S3, which the rotation's Starflash resolves to while this is held. */
const PHOEBE_S3 = new Sequence({
  name: "Phoebe S3: Daisy Wreaths and Dreams",
  applyStats: () => {
    if (runningAction(FHA_ABS) || runningAction(StarflashFreeAbs)) addStat(Stat.MulMv, 91);
  },
});

/** S4: any of her four Basic-chain presses landing takes 10% Spectro RES off the target for 30s
 *  — permanent once it lands, so a plain debuff nothing revokes. */
const S4_SPECTRO_RES = new Debuff({
  name: "Phoebe S4: Ringing Bells on Wings Aloft",
  applyStats: () => addEnemyStat(EnemyStat.ResReduce, 10, Attribute.Spectro),
});
const PHOEBE_S4 = new Sequence({
  name: "Phoebe S4: Ringing Bells on Wings Aloft",
  grants: [{ on: onAction(BA1, BA2, BA3, DC, CBA1, CBA2, CBA3, CDC), buff: () => S4_SPECTRO_RES, to: BuffTarget.Enemy }],
});

/** S5: +12% Spectro DMG Bonus for 15s off Intro Skill Golden Grace — a short self window, lost
 *  after her outro. */
const S5_SPECTRO = new Buff({
  name: "Phoebe S5: Prayer to the Distant Light", duration: 60 * 15,
  stats: [[Stat.DmgBonus, 12, Attribute.Spectro]],
});
const PHOEBE_S5 = new Sequence({
  name: "Phoebe S5: Prayer to the Distant Light",
  grants: [{ on: onAction(Intro), buff: S5_SPECTRO }],
});

/** S6: summoning the ring in either stance grants +10% ATK for 20s and fires a free Starflash at
 *  it. The extra stagnation the node also grants is nothing this engine models. */
const S6_ATK = new Buff({
  name: "Phoebe S6: Whispering Chirps in Silence", duration: 60 * 20,
  stats: [[Stat.BonusAtk, 10]],
});
const PHOEBE_S6 = new Sequence({
  name: "Phoebe S6: Whispering Chirps in Silence",
  updateBuffs: () => {
    if (!runningAction(Skill) || !(isHeld(ABSOLUTION) || isHeld(CONFESSION))) return;
    applyCurrent(S6_ATK, 1);
    if (isHeld(ABSOLUTION)) queue(StarflashFreeAbs);
    else queue(isHeld(PHOEBE_S3) ? StarflashFreeS3 : StarflashFreeConf);
  },
});

const PHOEBE_SEQUENCES = [PHOEBE_S1, PHOEBE_S2, PHOEBE_S3, PHOEBE_S4, PHOEBE_S5, PHOEBE_S6];

const PHOEBE_TALENTS = new Talent({
  name: "Phoebe: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritDmg, 16]],
});

/** Her, as a Resonator. Divine Voice (forte2) is her only gauge here — see the header for why
 *  Prayer is not one. */
const PHOEBE_RESONATOR = new Resonator({
  name: "Phoebe",
  talent: PHOEBE_TALENTS,
  inherent1: PHOEBE_INHERENT_1,
  inherent2: PHOEBE_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Rectifier,
  color: "#f2e5c0",
  intro: Intro,
  outro: Outro,
  maxEnergy: 12500,
  maxForte2: 60,

  stats: [[Stat.BaseHp, 10825], [Stat.BaseAtk, 412.5], [Stat.BaseDef, 1258.8866]],
});

/* --------------------------------------------------------------------------------- rotations */

/** Confession, the support visit: the ring, then two Chamuel's Star chains each opening a
 *  Starflash (5 Spectro Frazzle, 30 Divine Voice) — which empties the bar exactly — then Utter
 *  Confession to refill it and re-enter the stance, the Liberation's eight stacks, and the Outro
 *  that hands Silent Prayer on. 101.5 Concerto over the visit, so the Outro fires. */
const PHOEBE_CONFESSION_ROTATION = new Rotation([
  // leading, she has no Intro's 10 Concerto: two more chains make up the OUTRO's 100
  NOINTRO, SkillConf.instaCancel(), Liberation, Skill.instaDodge(),
  CBA123.instaDodge(), Starflash.dodgeCancel(),
  CBA123.instaDodge(), 
  CBA123.instaDodge(), Starflash, ECHO.instaCancel(), OUTRO,

  INTRO.mashCancel(), Liberation, SkillConf.instaDodge(), Skill.instaDodge(),
  CBA123.instaDodge(), Starflash.dodgeCancel(),
  CBA123.instaDodge(), Starflash,
  ECHO.instaCancel(), OUTRO,
]);

/** Absolution: Starflash costs 15 instead of 30, so the same bar pays for four of them, and it is
 *  those four the stance is built around. Absolution Litany banks only 10 Concerto against Utter
 *  Confession's 40, which is exactly why this loop needs the two extra chains to reach 100. */
const PHOEBE_ABSOLUTION_ROTATION = new Rotation([
  INTRO.mashCancel(), Liberation, HeavyAbs.instaDodge(), Skill.instaDodge(),
  CBA123.instaDodge(), Starflash.dodgeCancel(),
  CBA123.instaDodge(), Starflash.dodgeCancel(),
  CBA123.instaDodge(), Starflash.dodgeCancel(),
  CBA123.instaDodge(), Starflash.cancel(),
  ECHO.instaCancel(), OUTRO,
]);

/* ---------------------------------------------------------------------------------- loadouts */

const PHOEBE_BUILD = {
  resonator: PHOEBE_RESONATOR,
  weapons: [LUMINOUS_HYMN, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Heavy, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Basic, Substat.Liberation),
  sequences: PHOEBE_SEQUENCES,
};
const PEEB_ECHOES_CONF = [
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(CAPITANEUS, ETERNAL_RADIANCE_5PC),
];
const PEEB_ECHOES_ABS = [
  new EchoLoadout(CAPITANEUS, ETERNAL_RADIANCE_5PC),
];
export const PHOEBE_CONFESSION = new Loadout({ ...PHOEBE_BUILD, rotation: PHOEBE_CONFESSION_ROTATION, echoLoadouts: PEEB_ECHOES_CONF });
export const PHOEBE_ABSOLUTION = new Loadout({ ...PHOEBE_BUILD, rotation: PHOEBE_ABSOLUTION_ROTATION, echoLoadouts: PEEB_ECHOES_ABS });
