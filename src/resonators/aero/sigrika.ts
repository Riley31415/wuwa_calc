/**
 * Sigrika, ported to the new engine — an aero gauntlets DPS built around Echo Skill DMG: most of
 * her real kit tags `type: Echo` even though most casts (Elucidated, BIG BOOMY BOOM!, etc.) aren't
 * literal Echo casts.
 * Her Runes are a real store (RUNES below, Phrolova's Volatile Notes shape): four two-bit slots
 * oldest-first, 1 Trust and 2 Answer — two of them without Full Stop, all four from 50. A Rune
 * gained at capacity shifts the rest left and drops the leftmost. Elucidated and Dodge Counter -
 * Decipher hits bank Trust, BIG BOOMY BOOM! and Soliskin to the Aid hits bank Answer; Convergent
 * (Intro) doubles the next gain and Divergent (Liberation) mirrors it, neither at 100 Full Stop.
 * Schemata of Runes is one press: it spends the two leftmost and its follow-up is theirs — Trust
 * and Answer for Runic Outburst, two Trusts for Chain Whip, two Answers for Soliskin. forte1 is
 * the count the store holds (cap 4), so a Schemata pressed without a pair reads red; Full Stop is
 * forte2 (cap 100, +50 a Schemata, all of it for Learn My True Name), and Soliskin Vitality a real
 * 0-60 gauge fed by any team member's Echo cast.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  applyCurrent,
  applyTeam,
  isHeld,
  stacksOfTeam,
  removeStack,
  revokeCurrent,
  casting,
  currentAction, pressed,
  onAction,
  runningAction,
  addStat,
  frozenStacks,
  getStat,
  queue,
  isActive,
  setStacksSelf,
  stacksOf,
  forte2,
  lostOnSwap,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, INTRO, ActionTag } from "../../engine/rotation.js";
import { SOLSWORN_CIPHERS } from "../../weapons/gauntlet.js";
import { NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import { NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function sigrikaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// a hit that banks a Rune (gainRune() below): the store takes the kind, forte1 the count
const RUNE_TRUST = { updateDebuffs: () => gainRune(1) };
const RUNE_ANSWER = { updateDebuffs: () => gainRune(2) };

// --- basics, mid-air, dodge counter (One, Two, Three) — Stage 4 opens Decipher
const BA1 = sigrikaAction("Basic - One, Two, Three 1", { animFrames: 22, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 14, mv: 5297, energy: 84, concerto: 167, offtune: 2664 }]});
const BA2 = sigrikaAction("Basic - One, Two, Three 2", { animFrames: 41, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, mv: 5034, energy: 80, concerto: 159, offtune: 2532 },
    { hitFrame: 30, mv: 5034, energy: 80, concerto: 159, offtune: 2532 },
  ]});
const BA3 = sigrikaAction("Basic - One, Two, Three 3", { animFrames: 44, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 3341, energy: 53, concerto: 105, offtune: 1680 },
    { hitFrame: 16, mv: 3341, energy: 53, concerto: 105, offtune: 1680 },
    { hitFrame: 34, mv: 4454, energy: 70, concerto: 140, offtune: 2240 },
  ]});
const BA4 = sigrikaAction("Basic - One, Two, Three 4", {
  animFrames: 78,
  node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 22, mv: 4136, energy: 65, concerto: 130, offtune: 2080 },
    { hitFrame: 28, mv: 5170, energy: 82, concerto: 163, offtune: 2600 },
    { hitFrame: 46, mv: 5170, energy: 82, concerto: 163, offtune: 2600 },
    { hitFrame: 72, commitFrame: 60, mv: 6203, energy: 98, concerto: 195, offtune: 3120 },
  ],
  updateBuffs: () => applyCurrent(DECIPHER, 1),
});
const MA = sigrikaAction("Mid-air - One, Two, Three Plunge", { animFrames: 44, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 38, mv: 10478, energy: 155, concerto: 310, offtune: 4960 }]});
const MDC = sigrikaAction("Dodge Counter - One, Two, Three (Mid-Air)", { animFrames: 44, bullets: [{ hitFrame: 38, mv: 20617, energy: 305, concerto: 610, offtune: 9920 }], node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, castConcerto: 1000});
const DC = sigrikaAction("Dodge Counter - One, Two, Three", { animFrames: 42, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 6591, energy: 98, concerto: 195, offtune: 3008 },
    { hitFrame: 16, mv: 6591, energy: 98, concerto: 195, offtune: 3008 },
    { hitFrame: 34, mv: 8788, energy: 130, concerto: 260, offtune: 4010 },
  ], castConcerto: 1000});
const HA = sigrikaAction("Heavy - One, Two, Three", { animFrames: 42, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 32, mv: 5814, energy: 92, concerto: 183, offtune: 2924 },
    { hitFrame: 32, mv: 5814, energy: 92, concerto: 183, offtune: 2924 },
  ]});

// --- Decipher-gated finishers: both grant a Rune: Trust and exit Decipher, both Echo Skill DMG
//     (the migrated sheet only carries one row for the pair — same numbers used for both here)
const EBA = sigrikaAction("Basic - Elucidated", { animFrames: 66, node: Node.Normal, cast: Cast.Basic, type: Type.Echo, bullets: [
    { hitFrame: 8, mv: 6156, energy: 52, concerto: 104, offtune: 1652,
      ...RUNE_TRUST },
    { hitFrame: 16, mv: 6156, energy: 52, concerto: 104, offtune: 1652 },
    { hitFrame: 24, mv: 6156, energy: 52, concerto: 104, offtune: 1652 },
    { hitFrame: 66, commitFrame: 26, mv: 12311, energy: 104, concerto: 207, offtune: 3303 },
  ]});
const EDC = sigrikaAction("Dodge Counter - Decipher", { animFrames: 66, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Echo, bullets: [
    { hitFrame: 8, mv: 6156, energy: 52, concerto: 104, offtune: 1652,
      ...RUNE_TRUST },
    { hitFrame: 16, mv: 6156, energy: 52, concerto: 104, offtune: 1652 },
    { hitFrame: 24, mv: 6156, energy: 52, concerto: 104, offtune: 1652 },
    { hitFrame: 66, commitFrame: 26, mv: 12311, energy: 104, concerto: 207, offtune: 3303 },
  ], castConcerto: 1000});

// --- resonance skill: BOOMY BOOM! (base), or — while in Decipher — BIG BOOMY BOOM! / Soliskin to
//     the Aid (the latter needs 50 Full Stop held, spends none), both banking a Rune: Answer
const Skill = sigrikaAction("Skill - BOOMY BOOM!", { animFrames: 56, cooldown: 60 * 10, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 10, mv: 2863, energy: 45, concerto: 90, offtune: 1440 },
    { hitFrame: 16, mv: 2863, energy: 45, concerto: 90, offtune: 1440 },
    { hitFrame: 36, mv: 2863, energy: 45, concerto: 90, offtune: 1440 },
    { hitFrame: 48, mv: 5726, energy: 90, concerto: 180, offtune: 2880 },
  ]});
const ESkill = sigrikaAction("Skill - BIG BOOMY BOOM!", { animFrames: 56, node: Node.Skill, cast: Cast.Skill, type: Type.Echo, bullets: [
    { hitFrame: 6, mv: 2881, energy: 25, concerto: 49, offtune: 773,
      ...RUNE_ANSWER },
    { hitFrame: 18, mv: 2881, energy: 25, concerto: 49, offtune: 773 },
    { hitFrame: 30, mv: 2881, energy: 25, concerto: 49, offtune: 773 },
    { hitFrame: 42, mv: 2881, energy: 25, concerto: 49, offtune: 773 },
    { hitFrame: 54, mv: 17285, energy: 145, concerto: 290, offtune: 4637 },
  ]});
const ESkill50 = sigrikaAction("Skill - Soliskin to the Aid", { animFrames: 54, node: Node.Skill, cast: Cast.Skill, type: Type.Echo, bullets: [
    { hitFrame: 6, mv: 2783, energy: 24, concerto: 47, offtune: 747,
      ...RUNE_ANSWER },
    { hitFrame: 16, mv: 2783, energy: 24, concerto: 47, offtune: 747 },
    { hitFrame: 24, mv: 2783, energy: 24, concerto: 47, offtune: 747 },
    { hitFrame: 50, mv: 19477, energy: 164, concerto: 327, offtune: 5225 },
  ]});

// --- forte circuit: Schemata of Runes lands its own hit and banks 50 Full Stop, spends the two
//     leftmost Runes, and its follow-up is whichever pair they were (spendRunes() below)
// ...each a FIELD follow-up of Schemata's hit (cast as it lands, its cancel frame): its frames are
// only the time until its own hit, none of the fight's
const RunicOutburst = sigrikaAction("Forte - Runic Outburst", { tag: ActionTag.Field, animFrames: 68,
   node: Node.Forte, type: Type.Echo, bullets: [
     { hitFrame: 20, mv: 11767, energy: 200, concerto: 140, offtune: 4960 },
     { hitFrame: 36, mv: 20592, energy: 350, concerto: 245, offtune: 8680 },
     { hitFrame: 68, mv: 26475, energy: 450, concerto: 315, offtune: 11160 },
   ]});
const RunicChainWhip = sigrikaAction("Forte - Runic Chain Whip", { tag: ActionTag.Field, animFrames: 66,
  node: Node.Forte, type: Type.Echo, bullets: [
    { hitFrame: 6, mv: 4970, energy: 125, concerto: 88, offtune: 3100 },
    { hitFrame: 12, mv: 4970, energy: 125, concerto: 88, offtune: 3100 },
    { hitFrame: 18, mv: 4970, energy: 125, concerto: 88, offtune: 3100 },
    { hitFrame: 24, mv: 4970, energy: 125, concerto: 88, offtune: 3100 },
    { hitFrame: 54, mv: 6626, energy: 167, concerto: 117, offtune: 4134 },
    { hitFrame: 60, mv: 6626, energy: 167, concerto: 117, offtune: 4134 },
    { hitFrame: 66, mv: 6626, energy: 167, concerto: 117, offtune: 4134 },
  ]});
const RunicSoliskin = sigrikaAction("Forte - Runic Soliskin", { tag: ActionTag.Field, animFrames: 78,
   node: Node.Forte, type: Type.Echo, bullets: [
     { hitFrame: 18, mv: 3976, energy: 100, concerto: 70, offtune: 2480 },
     { hitFrame: 36, mv: 5963, energy: 150, concerto: 105, offtune: 3720 },
     { hitFrame: 45, mv: 5963, energy: 150, concerto: 105, offtune: 3720 },
     { hitFrame: 54, mv: 5963, energy: 150, concerto: 105, offtune: 3720 },
     { hitFrame: 63, mv: 5963, energy: 150, concerto: 105, offtune: 3720 },
     { hitFrame: 78, mv: 11926, energy: 300, concerto: 210, offtune: 7440 },
   ]});

const FHA = sigrikaAction("Forte Heavy - Schemata of Runes", { minForte1: 2,
  animFrames: 76,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Echo, bullets: [{ hitFrame: 12, mv: 13251, energy: 334, concerto: 50, offtune: 2664, forte2: 50 }], castForte1: -2,
  // on hit: the spend and the follow-up it plays
  updateDebuffs: spendRunes,
});

/** Schemata of Runes spends the two leftmost Runes and plays the follow-up they make: Trust and
 *  Answer for Runic Outburst, two Trusts for Chain Whip, two Answers for Soliskin. Without a pair
 *  nothing follows, and the action's own -2 leaves forte1 red. */
function spendRunes(): void {
  const word = stacksOf(RUNES), a = word & 3, b = (word >> 2) & 3;
  setStacksSelf(RUNES, (word & ~0xff) | ((word & 0xff) >> 4));
  if (!a || !b) return;
  queue(a !== b ? RunicOutburst : a === 1 ? RunicChainWhip : RunicSoliskin);
}

/** Learn My True Name: at 100 Full Stop, spends it all. */
const FSkill = sigrikaAction("Forte Skill - Learn My True Name", { minForte2: 100,
   animFrames: 138, cooldown: 60 * 25,
   node: Node.Forte, cast: Cast.Skill, type: Type.Echo, bullets: [
     { hitFrame: 86, mv: 30287, energy: 136, concerto: 500, offtune: 25334 },
     { hitFrame: 130, commitFrame: 86, mv: 90861, energy: 407, concerto: 1500, offtune: 76002 },
   ], castConcerto: 1000, castForte2: -100
});

const Liberation = sigrikaAction("Liberation - Where Trust Leads Me!", {
  animFrames: 228, timestop: 228, motionStop: 228, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Echo, bullets: [{ hitFrame: 176, mv: 86143, offtune: 50400 }], castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => applyCurrent(DIVERGENT),
});

const Intro = sigrikaAction("Intro - Solsworn Etymology", { animFrames: 58, prioFrames: 58, motionStop: 38, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 46, mv: 16342, energy: 1000, offtune: 7736 }], castConcerto: 1000});
/** In This Very Moment carries no team buff on her own page (unlike most other kits' outros). */
const Outro = sigrikaAction("Outro - In This Very Moment", { animFrames: 48, cast: Cast.Outro, type: Type.Outro, bullets: [{ hitFrame: 18, mv: 79500 }], minConcerto: 10000, castConcerto: -10000});

/* ------------------------------------------------------------------------------------ buffs */

/** True Names Aligned (Inherent Skill): a teammate's Echo Skill cast grants the whole team a stack
 *  of Blessing of Runes (up to 6) — +3% Aero/Echo Skill DMG a stack to whoever's active, +30%/+30%
 *  flat more at the full 6 for Sigrika specifically. Granted via `SIGRIKA_RESONATOR`'s own `updateGlobal()`
 *  (not this buff's own updateBuffs()) since a global buff's updateBuffs() can't fire before it's held once. */
const BLESSING_OF_RUNES = new Buff({
  name: "Sigrika: Blessing of Runes", maxStacks: 6,
  applyStats: () => {
    const held = stacksOfTeam(BLESSING_OF_RUNES);
    if (held >= 6 && isHeld(SIGRIKA_RESONATOR)) { addStat(Stat.DmgBonus, 30, Attribute.Aero); addStat(Stat.DmgBonus, 30, Type.Echo); }

    if (isActive()) {
        addStat(Stat.DmgBonus, 3 * held, Attribute.Aero);
        addStat(Stat.DmgBonus, 3 * held, Type.Echo);
    }
  },
});

/** True Names Aligned, in full: the ER-to-Echo-DMG conversion above, plus (via updateGlobal(), so
 *  it reacts to any team member's Echo cast) the Blessing of Runes grant that mechanic feeds. */
const SR_INHERENT_2 = new Inherent({
  name: "Inherent: True Names Aligned",
  updateGlobal: () => { if (casting(Cast.Echo)) applyTeam(BLESSING_OF_RUNES, 1); },
  convertStats: () => addStat(Stat.DmgBonus, Math.min(50, 2 * Math.max(0, Math.floor(getStat(Stat.Er)) - 125)), Type.Echo),
});
/** True Names Invoked (Inherent Skill): casting Intro grants Convergent — the only source of it. */
const SR_INHERENT_1 = new Inherent({
  name: "Inherent: True Names Invoked",
  grants: [{ on: onAction(Intro), buff: () => CONVERGENT }],
});

/** Whether the current action grants Sigrika a Rune — Elucidated/Decipher's own Dodge Counter
 *  variant (Trust), or BIG BOOMY BOOM!/Soliskin to the Aid (Answer). */
function gainsRune(): boolean {
  return runningAction(EBA) || runningAction(EDC) || runningAction(ESkill) || runningAction(ESkill50);
}

/** Decipher: opened by Basic Attack Stage 4, closed by whichever finisher next grants a Rune.
 *  While up, Basic Attack becomes Elucidated and Dodge Counter its own Decipher variant. */
const DECIPHER = new Buff({
  name: "Sigrika: Decipher",
  duration: 60 * 5,
  lostOnSwap: true,
  afterAction: () => { if (gainsRune()) revokeCurrent(DECIPHER); },
});

/** Convergent (Intro, 20s) doubles the next Rune gained, Divergent (Liberation, 20s) adds one of
 *  the opposite kind; Convergent takes priority when both stand, and neither takes effect at 100
 *  Full Stop. Both are read and spent by gainRune() below. */
const CONVERGENT = new Buff({ name: "Sigrika: Convergent", duration: 60 * 20 });
const DIVERGENT = new Buff({ name: "Sigrika: Divergent", duration: 60 * 20 });

/** The Rune store, one packed word: bits 0-7 are four two-bit slots oldest-first (1 Trust,
 *  2 Answer), bit 8 always set so an empty store is still a held buff. Hers from combat start;
 *  the display reads the slots off as she stands. */
const RUNES = new Buff({
  name: "Sigrika: Runes", maxStacks: 0x1ff,
  display: (): string => {
    let slots = "";
    for (let shift = 0; shift < 8; shift += 2) slots += "-TA"[(frozenStacks() >> shift) & 3]!;
    return `Sigrika: Runes [${slots}]`;
  },
});

/** Bank one Rune — 1 Trust, 2 Answer — into the store's first empty slot, and the count into
 *  forte1. Gated on a landed hit ("hitting a target directly with..."). Capacity is two Runes
 *  without Full Stop and four from 50: a gain at capacity shifts every Rune left, dropping the
 *  leftmost, and takes the last slot — the count stands. Convergent/Divergent, unless Full Stop is
 *  at 100, make the gain two: the same kind again, or the opposite. */
function gainRune(kind: number): void {
  if (!pressed().bullets.length) return;
  let extra = 0;
  if (forte2() < 100) {
    if (isHeld(CONVERGENT)) { extra = kind; revokeCurrent(CONVERGENT); }
    else if (isHeld(DIVERGENT)) { extra = 3 - kind; revokeCurrent(DIVERGENT); }
  }
  pushRune(kind);
  if (extra) pushRune(extra);
}
function pushRune(kind: number): void {
  const cap = forte2() >= 50 ? 4 : 2;
  const word = stacksOf(RUNES);
  let runes = word & 0xff, n = 0;
  while (n < 4 && (runes >> (2 * n)) & 3) n++;
  if (n >= cap) { runes >>= 2; n--; } else addStat(Stat.AddForte1, 1);
  setStacksSelf(RUNES, (word & ~0xff) | runes | (kind << (2 * n)));
}

/** Innate Gift?: up to 2 frozenStacks (4 from S3), each +30% Echo Skill DMG Amplification — granted
 *  when a Runic follow-up spends a full 30 Soliskin Vitality. Ends after Learn My True Name, or on
 *  swap-off, until S3 keeps it through both. S6 adds a stack's worth of Amplification and DEF ignore
 *  on the Runic follow-ups and Learn My True Name, each to its own cap. */
const INNATE_GIFT = new Buff({
  name: "Sigrika: Innate Gift?", maxStacks: 4,
  applyStats: () => {
    if (runningAction(RunicChainWhip) || runningAction(RunicOutburst) || runningAction(RunicSoliskin) || runningAction(FSkill)) {
        const n = frozenStacks();
        addStat(Stat.Amp, 30 * n, Type.Echo);
        if (isHeld(SR_S6)) {
          asSource(SR_S6, () => { addStat(Stat.Amp, Math.min(60, 15 * n)); addStat(Stat.DefIgnoreNew, Math.min(30, 7.5 * n)); });
        }
    }
  },
  updateBuffs: () => {
    if (isHeld(SR_S3)) return;
    lostOnSwap();
    // spent once Learn My True Name has hit: a Runic follow-up still in flight lands with it
    if (isHeld(INNATE_SPENT) && !runningAction(RunicOutburst) && !runningAction(RunicChainWhip) && !runningAction(RunicSoliskin)) {
      revokeCurrent(INNATE_GIFT);
      revokeCurrent(INNATE_SPENT);
    }
  },
  afterAction: () => { if (runningAction(FSkill) && !isHeld(SR_S3)) applyCurrent(INNATE_SPENT, 1); },
});
const INNATE_SPENT = new Buff({ name: "Sigrika: Innate Gift? (spent)", hidden: true, lostOnSwap: true });

/** Soliskin Vitality: a genuine 0-60 gauge, +10 whenever any team member casts an Echo Skill
 *  (granted via `SIGRIKA_RESONATOR`'s own updateGlobal(), same reasoning as Blessing of Runes above). Spent
 *  by whichever Runic follow-up fires: 30+ points spends exactly 30 for +50% DMG Multiplier and a
 *  stack of Innate Gift?; under 30 spends everything held for +15% DMG Amplification per 10 points. */
const SOLISKIN_VITALITY = new Buff({
  name: "Sigrika: Soliskin Vitality", maxStacks: 60,
  updateBuffs: () => {
    if (!runningAction(RunicOutburst) && !runningAction(RunicChainWhip) && !runningAction(RunicSoliskin)) return;
    const held = frozenStacks();
    // two stacks at most until S3 (the buff's own cap is S3's four)
    if (held >= 30 && (isHeld(SR_S3) || stacksOf(INNATE_GIFT) < 2)) applyCurrent(INNATE_GIFT, 1);
  },
  applyStats: () => {
    if (!runningAction(RunicOutburst) && !runningAction(RunicChainWhip) && !runningAction(RunicSoliskin)) return;
    const held = frozenStacks();
    if (held >= 30) { addStat(Stat.MulMv, 50); }
    else if (held > 0) addStat(Stat.Amp, 15 * Math.floor(held / 10));
  },
  // spent once the follow-up is over, so every hit of it pays off the gauge it found
  afterAction: () => {
    if (runningAction(RunicOutburst) || runningAction(RunicChainWhip) || runningAction(RunicSoliskin)) {
      removeStack(SOLISKIN_VITALITY, Math.min(frozenStacks(), 30));
    }
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const SIGRIKA_TALENTS = new Talent({
  name: "Sigrika: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. */
const SIGRIKA_RESONATOR = new Resonator({
  name: "Sigrika",
  stats: [[Stat.BaseHp, 10775], [Stat.BaseAtk, 437.5], [Stat.BaseDef, 1136.6646]],
  talent: SIGRIKA_TALENTS,
  inherent1: SR_INHERENT_1,
  inherent2: SR_INHERENT_2,
  element: Attribute.Aero,
  weapon: WeaponType.Gauntlets,
  color: "#e0aa7e",
  intro: Intro,
  maxEnergy: 12500,
  maxForte1: 4,
  maxForte2: 100,

  // the Rune store, empty (its always-set bit alone; see RUNES)
  combatStart: () => applyCurrent(RUNES, 1 << 8),
  // Soliskin Vitality's own gain — any team member's Echo cast
  updateGlobal: () => { if (casting(Cast.Echo)) applyCurrent(SOLISKIN_VITALITY, 10); },

});

/* --------------------------------------------------------------------------------- sequences */

/** S1: Elucidated, Decipher, BIG BOOMY BOOM! and Soliskin to the Aid deal x1.7 — multiplicative,
 *  nanoka's own S1 rows (104.64% against 61.56%). The interrupt immunity and the Encapsulated
 *  stagnation stacks are no stat. */
const SR_S1 = new Sequence({
  name: "Sigrika S1: The Gleam Meant for Radiance",
  applyStats: () => {
    if (runningAction(EBA) || runningAction(EDC) || runningAction(ESkill) || runningAction(ESkill50)) addStat(Stat.MulMv, 70);
  },
});

/** S2: Learn My True Name x2.2 (666.31% against 302.87%), and Divergent from having been out of
 *  combat — held from the start, so the first Rune gain after the Intro's Convergent doubles too. */
const SR_S2 = new Sequence({
  name: "Sigrika S2: The Bitterness Steeped in Hope",
  combatStart: () => applyCurrent(DIVERGENT, 1),
  applyStats: () => { if (runningAction(FSkill)) addStat(Stat.MulMv, 120); },
});

/** S3: Innate Gift? stacks to 4 (SOLISKIN_VITALITY's grant) and survives Learn My True Name and
 *  the swap (INNATE_GIFT). */
const SR_S3 = new Sequence({ name: "Sigrika S3: I Flee, Yet I Seek" });

/** S4: +20% ATK to the team for 20s off any member's Echo Skill cast — every visit casts one, so
 *  it never lapses. */
const I_LOSE_YET_I_GAIN = new Buff({ name: "Sigrika S4: I Lose, Yet I Gain", duration: 60 * 20, stats: [[Stat.BonusAtk, 20]] });
const SR_S4 = new Sequence({
  name: "Sigrika S4: I Lose, Yet I Gain",
  updateGlobal: () => { if (casting(Cast.Echo)) applyTeam(I_LOSE_YET_I_GAIN, 1); },
});

/** S5: Where Trust Leads Me! x1.3 (1119.86% against 861.43%). */
const SR_S5 = new Sequence({
  name: "Sigrika S5: Until Submerged by the Dark",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 30); },
});

/** S6: the target takes 30% more from her, and Innate Gift?'s extra Amplification and DEF ignore
 *  per stack (in INNATE_GIFT). */
const SR_S6 = new Sequence({ name: "Sigrika S6: True Names Resurfaced, Rising in Light", stats: [[Stat.DamageTaken, 30]] });

const SR_SEQUENCES = [SR_S1, SR_S2, SR_S3, SR_S4, SR_S5, SR_S6];

/** The kit-valid line: the Intro's Convergent makes the first Elucidated two Trusts, which the
 *  first Schemata spends for Chain Whip and 50 Full Stop; the Liberation's Divergent makes the
 *  second Elucidated a Trust and an Answer, which the second Schemata spends for Runic Outburst
 *  and the 100 Full Stop Learn My True Name takes. She's never the team's own lead, so this same
 *  rotation covers both. */

const BA234 = new ActionGroup("Basic - One, Two, Three 234", [BA2, BA3, BA4]);

const BA34 = new ActionGroup("Basic - One, Two, Three 34", [BA3, BA4]);

const SR_ROTATION = new Rotation([
  INTRO, ECHO, 
  BA234, EBA.cancel(), FHA.cancel(), Liberation,
  BA234, EBA.cancel(), FHA.cancel(), FSkill,
  Skill, BA34, EBA.instaSwap(),
  Outro,
]);

const SR_ROTATION_FAST = new Rotation([
  INTRO, ECHO, 
  BA234, EBA.cancel(), FHA.cancel(), Liberation,
  BA234, EBA.cancel(), FHA.cancel(), FSkill,
  Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit, weapon,
// mainslot echo, sonata pieces, mainstat/substat
export const SIGRIKA = new Loadout({
  resonator: SIGRIKA_RESONATOR,
  weapons: [SOLSWORN_CIPHERS, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [new EchoLoadout(NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ER3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  rotation: SR_ROTATION,
  sequences: SR_SEQUENCES,
});

// her real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit, weapon,
// mainslot echo, sonata pieces, mainstat/substat
export const SIGRIKA_FAST = new Loadout({
  resonator: SIGRIKA_RESONATOR,
  weapons: [SOLSWORN_CIPHERS, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [new EchoLoadout(NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ER3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  rotation: SR_ROTATION_FAST,
  sequences: SR_SEQUENCES,
});
