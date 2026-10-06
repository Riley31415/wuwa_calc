/**
 * Sigrika, ported to the new engine — an aero gauntlets DPS built around Echo Skill DMG: most of
 * her real kit tags `type: Echo` even though most casts (Elucidated, BIG BOOMY BOOM!, etc.) aren't
 * literal Echo casts.
 * Her Runes are a real store (RUNES below, Phrolova's Volatile Notes shape): four two-bit slots
 * filled left to right, 1 Trust, 2 Answer, 3 Full Stop. Only the two after the Full Stops take
 * Runes: slots 3-4 stay locked until a Schemata turns 1-2 into its 50 Full Stop. A Rune gained
 * with both full shifts the pair left and drops the older. Elucidated and Dodge Counter -
 * Decipher hits bank Trust, BIG BOOMY BOOM! and Soliskin to the Aid hits bank Answer; Convergent
 * (Intro) doubles the next gain and Divergent (Liberation) mirrors it, neither at 100 Full Stop.
 * Schemata of Runes is one press: it spends the pair, filling its slots with Full Stop, and its
 * follow-up is theirs — Trust and Answer for Runic Outburst, two Trusts for Chain Whip, two
 * Answers for Soliskin. forte1 is the count the store holds (cap 2), so a Schemata pressed
 * without a pair reads red; Full Stop is
 * forte2 (cap 100, +50 a Schemata, all of it for Learn My True Name), and Soliskin Vitality a real
 * 0-60 gauge fed by any team member's Echo cast.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, Position } from "../../engine/stats.js";
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
  addGain,
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
  saveChain,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, INTRO, OUTRO, ActionTag, START_LAST, INTRO_LAST, DODGE } from "../../engine/rotation.js";
import { SOLSWORN_CIPHERS } from "../../weapons/gauntlet.js";
import { NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import { NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function sigrikaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

/** Decipher: opened by Basic Attack Stage 4 for 5s, left on casting whichever finisher grants a
 *  Rune. While up, Basic Attack becomes Elucidated and the Skill and Dodge Counter their own. */
const DECIPHER = new Buff({
  name: "Sigrika: Decipher",
  duration: 60 * 5,
  lostOnSwap: true,
  updateBuffs: () => { if (gainsRune()) revokeCurrent(DECIPHER); },
});

// a hit that banks a Rune: its own forte1 is the count, gainRune() below the store's kind; the
// doubled form's carries Convergent's or Divergent's extra Rune too (DOUBLED below)
const RUNE_TRUST = { forte1: 1, updateDebuffs: () => gainRune(1, null) };
const RUNE_ANSWER = { forte1: 1, updateDebuffs: () => gainRune(2, null) };

// --- basics, mid-air, dodge counter (One, Two, Three) — Stage 4 opens Decipher
// "with at least 50 points of Full Stop, her Basic Attack cycle starts from Stage 2"
const BA1 = sigrikaAction("Basic - One, Two, Three 1", { animFrames: 22, castPriority: 2, maxForte2: 49, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 14, mv: 5297, energy: 84, concerto: 167, offtune: 2664 }]});
// "Press Normal Attack shortly after casting" the Heavy, the Plunging Attack, the Mid-air Dodge Counter
// or the Intro "to cast Basic Attack Stage 2" (at 50 Full Stop the cycle starts here: SIGRIKA_RESONATOR)
const BA2 = sigrikaAction("Basic - One, Two, Three 2", { chains: () => [BA1, HA, MA, MDC, Intro], animFrames: 41, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, mv: 5034, energy: 80, concerto: 159, offtune: 2532 },
    { hitFrame: 30, mv: 5034, energy: 80, concerto: 159, offtune: 2532 },
  ]});
// BOOMY BOOM!: "Press Normal Attack shortly after casting BOOMY BOOM! to cast Basic Attack Stage 3"
const BA3 = sigrikaAction("Basic - One, Two, Three 3", { chains: () => [BA2, Skill], animFrames: 44, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 3341, energy: 53, concerto: 105, offtune: 1680 },
    { hitFrame: 16, mv: 3341, energy: 53, concerto: 105, offtune: 1680 },
    { hitFrame: 34, mv: 4454, energy: 70, concerto: 140, offtune: 2240 },
  ]});
// the Dodge Counter: "Press Normal Attack shortly after casting Dodge Counter to cast Basic Attack Stage 4"
const BA4 = sigrikaAction("Basic - One, Two, Three 4", {
  chains: () => [BA3, DC], animFrames: 78, animPriority: { 72: 1 }, castPriority: 2,
  node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 22, mv: 4136, energy: 65, concerto: 130, offtune: 2080 },
    { hitFrame: 28, mv: 5170, energy: 82, concerto: 163, offtune: 2600 },
    { hitFrame: 46, mv: 5170, energy: 82, concerto: 163, offtune: 2600 },
    // Decipher (Elucidated's window) opens on frame 60, not on the cast
    { hitFrame: 60, element: null, type: null, subtype: null, updateDebuffs: () => applyCurrent(DECIPHER, 1) },
    { hitFrame: 72, commitFrame: 60, mv: 6203, energy: 98, concerto: 195, offtune: 3120 },
  ],
});
const MA = sigrikaAction("Mid-air - One, Two, Three Plunge", { castPosition: Position.Midair, endPosition: Position.Grounded, animFrames: 44, animPriority: { 36: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 38, mv: 10478, energy: 155, concerto: 310, offtune: 4960 }]});
// "after a successful Dodge in mid-air"; Basic Attack Stage 2 follows it, so it lands
const MDC = sigrikaAction("Dodge Counter - One, Two, Three (Mid-Air)", { chains: [DODGE], castPosition: Position.Midair, endPosition: Position.Grounded, animFrames: 44, animPriority: { 0: 6, 36: 2 }, castPriority: 8, bullets: [{ hitFrame: 38, mv: 20617, energy: 305, concerto: 610, offtune: 9920 }], node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, castConcerto: 1000});
// "after a successful Dodge on the ground"
const DC = sigrikaAction("Dodge Counter - One, Two, Three", { chains: [DODGE], castPosition: Position.Grounded, animFrames: 42, animPriority: { 0: 2 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 6591, energy: 98, concerto: 195, offtune: 3008 },
    { hitFrame: 16, mv: 6591, energy: 98, concerto: 195, offtune: 3008 },
    { hitFrame: 34, mv: 8788, energy: 130, concerto: 260, offtune: 4010 },
  ], castConcerto: 1000});
const HA = sigrikaAction("Heavy - One, Two, Three", { animFrames: 42, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 32, mv: 5814, energy: 92, concerto: 183, offtune: 2924 },
    { hitFrame: 32, mv: 5814, energy: 92, concerto: 183, offtune: 2924 },
  ]});

// --- Decipher-gated finishers: both grant a Rune: Trust and exit Decipher, both Echo Skill DMG
//     (the migrated sheet only carries one row for the pair — same numbers used for both here)
// the Decipher presses are all cast "on the ground"
const EBA = sigrikaAction("Basic - Elucidated", { castPosition: Position.Grounded, animFrames: 66, animPriority: { 66: 2 }, castPriority: 1, requireBuff: DECIPHER, node: Node.Normal, cast: Cast.Basic, type: Type.Echo, bullets: [
    { hitFrame: 8, mv: 6156, energy: 52, concerto: 104, offtune: 1652, ...RUNE_TRUST ,
       },
    { hitFrame: 16, mv: 6156, energy: 52, concerto: 104, offtune: 1652 },
    { hitFrame: 24, mv: 6156, energy: 52, concerto: 104, offtune: 1652 },
    { hitFrame: 66, commitFrame: 26, mv: 12311, energy: 104, concerto: 207, offtune: 3303 },
  ]});
const EDC = sigrikaAction("Dodge Counter - Decipher", { chains: [DODGE], castPosition: Position.Grounded, animFrames: 66, animPriority: { 66: 2 }, castPriority: 8, requireBuff: DECIPHER, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Echo, bullets: [
    { hitFrame: 8, mv: 6156, energy: 52, concerto: 104, offtune: 1652, ...RUNE_TRUST ,
       },
    { hitFrame: 16, mv: 6156, energy: 52, concerto: 104, offtune: 1652 },
    { hitFrame: 24, mv: 6156, energy: 52, concerto: 104, offtune: 1652 },
    { hitFrame: 66, commitFrame: 26, mv: 12311, energy: 104, concerto: 207, offtune: 3303 },
  ], castConcerto: 1000});

// --- resonance skill: BOOMY BOOM! (base), or — while in Decipher — BIG BOOMY BOOM! / Soliskin to
//     the Aid (the latter needs 50 Full Stop held, spends none), both banking a Rune: Answer
const Skill = sigrikaAction("Skill - BOOMY BOOM!", { animFrames: 56, animPriority: { 56: 2 }, castPriority: 3, cooldown: 60 * 10, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 10, mv: 2863, energy: 45, concerto: 90, offtune: 1440 },
    { hitFrame: 16, mv: 2863, energy: 45, concerto: 90, offtune: 1440 },
    { hitFrame: 36, mv: 2863, energy: 45, concerto: 90, offtune: 1440 },
    { hitFrame: 48, mv: 5726, energy: 90, concerto: 180, offtune: 2880 },
  ]});
const ESkill = sigrikaAction("Skill - BIG BOOMY BOOM!", { castPosition: Position.Grounded, animFrames: 56, animPriority: { 56: 2 }, castPriority: 2, requireBuff: DECIPHER, node: Node.Skill, cast: Cast.Skill, type: Type.Echo, bullets: [
    { hitFrame: 6, mv: 2881, energy: 25, concerto: 49, offtune: 773, ...RUNE_ANSWER,},
    { hitFrame: 18, mv: 2881, energy: 25, concerto: 49, offtune: 773 },
    { hitFrame: 30, mv: 2881, energy: 25, concerto: 49, offtune: 773 },
    { hitFrame: 42, mv: 2881, energy: 25, concerto: 49, offtune: 773 },
    { hitFrame: 54, mv: 17285, energy: 145, concerto: 290, offtune: 4637, ...RUNE_ANSWER }, // TODO unknown if this late
  ]});
const ESkill50 = sigrikaAction("Skill - Soliskin to the Aid", { castPosition: Position.Grounded, animFrames: 54, animPriority: { 54: 2 }, castPriority: 2, requireBuff: DECIPHER, minForte2: 50, node: Node.Skill, cast: Cast.Skill, type: Type.Echo, bullets: [
    { hitFrame: 6, mv: 2783, energy: 24, concerto: 47, offtune: 747, ...RUNE_ANSWER,},
    { hitFrame: 16, mv: 2783, energy: 24, concerto: 47, offtune: 747 },
    { hitFrame: 24, mv: 2783, energy: 24, concerto: 47, offtune: 747 },
    { hitFrame: 50, mv: 19477, energy: 164, concerto: 327, offtune: 5225 },
  ]});

/** `press` with its first Rune hit (of `kind`) banking `by`'s extra Rune too — Convergent's the same
 *  kind, Divergent's the opposite — at two forte1, so a hold into Schemata of Runes sees both. */
function doubled(press: Action, kind: number, by: "Convergent" | "Divergent"): Action {
  const k = press.bullets.findIndex((b) => b.forte1);
  const rune = { forte1: 2, updateDebuffs: () => gainRune(kind, by) };
  return press.variant(`${press.name} (${by})`, { bullets: press.bullets.map((b, i) => (i === k ? { ...b, ...rune } : b)) });
}
const EBA_C = doubled(EBA, 1, "Convergent"), EBA_D = doubled(EBA, 1, "Divergent");
const EDC_C = doubled(EDC, 1, "Convergent"), EDC_D = doubled(EDC, 1, "Divergent");
const ESkill_C = doubled(ESkill, 2, "Convergent"), ESkill_D = doubled(ESkill, 2, "Divergent");
const ESkill50_C = doubled(ESkill50, 2, "Convergent"), ESkill50_D = doubled(ESkill50, 2, "Divergent");
/** Every Rune-banking press: what Decipher ends on, and what S1 multiplies. */
const RUNE_PRESSES = [EBA, EDC, ESkill, ESkill50, EBA_C, EDC_C, ESkill_C, ESkill50_C, EBA_D, EDC_D, ESkill_D, ESkill50_D];

/** Which form of a Rune press comes out: Convergent's while it stands, else Divergent's, short of
 *  100 Full Stop (where neither doubles), else the plain one. */
function runeForm(plain: Action, convergent: Action, divergent: Action): Action {
  if (forte2() >= 100) return plain;
  return isHeld(CONVERGENT) ? convergent : isHeld(DIVERGENT) ? divergent : plain;
}
/** What Decipher's Basic Attack, Dodge Counter and Skill come out as (`runeForm()`), the Skill's
 *  Soliskin to the Aid from 50 Full Stop and BIG BOOMY BOOM! below it. */
const EBASIC = new Action("Elucidated Resolver", { cast: Cast.Basic, resolve: () => runeForm(EBA, EBA_C, EBA_D) });
const DecipherCounter = new Action("Decipher Dodge Counter Resolver", { cast: Cast.DodgeCounter, resolve: () => runeForm(EDC, EDC_C, EDC_D) });
const ESKILL = new Action("Decipher Skill Resolver", { cast: Cast.Skill,
  resolve: () => (forte2() >= 50 ? runeForm(ESkill50, ESkill50_C, ESkill50_D) : runeForm(ESkill, ESkill_C, ESkill_D)) });

// --- forte circuit: Schemata of Runes lands its own hit and banks 50 Full Stop, spends the two
//     leftmost Runes, and its follow-up is whichever pair they were (spendRunes() below)
// ...each a FIELD follow-up of its own commit on Schemata (25/31/35): its frames are
// only the time until its own hit, none of the fight's
const RunicOutburst = sigrikaAction("Forte - Runic Outburst", { tag: ActionTag.OffField, animFrames: 68,
   node: Node.Forte, type: Type.Echo, bullets: [
     { hitFrame: 20, commitFrame: 0, mv: 11767, energy: 200, concerto: 140, offtune: 4960 },
     { hitFrame: 36, commitFrame: 0, mv: 20592, energy: 350, concerto: 245, offtune: 8680 },
     { hitFrame: 68, commitFrame: 0, mv: 26475, energy: 450, concerto: 315, offtune: 11160 },
   ]});
const RunicChainWhip = sigrikaAction("Forte - Runic Chain Whip", { tag: ActionTag.OffField, animFrames: 66,
  node: Node.Forte, type: Type.Echo, bullets: [
    { hitFrame: 6, commitFrame: 0, mv: 4970, energy: 125, concerto: 88, offtune: 3100 },
    { hitFrame: 12, commitFrame: 0, mv: 4970, energy: 125, concerto: 88, offtune: 3100 },
    { hitFrame: 18, commitFrame: 0, mv: 4970, energy: 125, concerto: 88, offtune: 3100 },
    { hitFrame: 24, commitFrame: 0, mv: 4970, energy: 125, concerto: 88, offtune: 3100 },
    { hitFrame: 54, commitFrame: 0, mv: 6626, energy: 167, concerto: 117, offtune: 4134 },
    { hitFrame: 60, commitFrame: 0, mv: 6626, energy: 167, concerto: 117, offtune: 4134 },
    { hitFrame: 66, commitFrame: 0, mv: 6626, energy: 167, concerto: 117, offtune: 4134 },
  ]});
const RunicSoliskin = sigrikaAction("Forte - Runic Soliskin", { tag: ActionTag.OffField, animFrames: 78,
   node: Node.Forte, type: Type.Echo, bullets: [
     { hitFrame: 18, commitFrame: 0, mv: 3976, energy: 100, concerto: 70, offtune: 2480 },
     { hitFrame: 36, commitFrame: 0, mv: 5963, energy: 150, concerto: 105, offtune: 3720 },
     { hitFrame: 45, commitFrame: 0, mv: 5963, energy: 150, concerto: 105, offtune: 3720 },
     { hitFrame: 54, commitFrame: 0, mv: 5963, energy: 150, concerto: 105, offtune: 3720 },
     { hitFrame: 63, commitFrame: 0, mv: 5963, energy: 150, concerto: 105, offtune: 3720 },
     { hitFrame: 78, commitFrame: 0, mv: 11926, energy: 300, concerto: 210, offtune: 7440 },
   ]});

/** Schemata of Runes with no pair to spend: its own hit alone, no follow-up. */
const FHA_BARE = sigrikaAction("Forte Heavy - Schemata of Runes", { minForte1: 2,
  animFrames: 76, animPriority: { 0: 5, 40: 4, 58: 2 }, castPriority: 9,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Echo, bullets: [
    { hitFrame: 12, mv: 13251, energy: 334, concerto: 50, offtune: 2664, forte2: 50 },
  ],
});
/** Each form commits its own follow-up at wuwalab's event frame (commit_outburst 25,
 *  commit_soliskin 31, commit_chain_whip 35), which is where a cancel can cut it. */
const schemata = (label: string, frame: number, follow: () => Action): Action =>
  FHA_BARE.variant(`Forte Heavy - Schemata of Runes (${label})`, { bullets: [
    ...FHA_BARE.bullets,
    { hitFrame: frame, element: null, type: null, subtype: null, updateDebuffs: () => spendRunes(follow()) },
  ]});
const FHA_OUTBURST = schemata("Outburst", 25, () => RunicOutburst);
const FHA_SOLISKIN = schemata("Soliskin", 31, () => RunicSoliskin);
const FHA_CHAIN_WHIP = schemata("Chain Whip", 35, () => RunicChainWhip);
/** The Schemata a rotation writes: the form the two leftmost Runes make as it is cast. */
const FHA = new Action("Schemata of Runes Resolver", { cast: Cast.Heavy, resolve: () => {
  const follow = followUp();
  return follow === RunicOutburst ? FHA_OUTBURST : follow === RunicSoliskin ? FHA_SOLISKIN : follow === RunicChainWhip ? FHA_CHAIN_WHIP : FHA_BARE;
} });

/** The follow-up the two leftmost Runes make — Trust and Answer for Runic Outburst, two Trusts
 *  for Chain Whip, two Answers for Soliskin — or null without a pair. */
function followUp(): Action | null {
  const word = stacksOf(RUNES), at = 2 * fullStops(word), a = (word >> at) & 3, b = (word >> (at + 2)) & 3;
  if (at >= 8 || !a || !b) return null;
  return a !== b ? RunicOutburst : a === 1 ? RunicChainWhip : RunicSoliskin;
}
/** Schemata's commit for `follow`: where the pair still makes it, spends it (two forte1) and plays it. */
function spendRunes(follow: Action): void {
  if (followUp() !== follow) return;
  // the pair's two slots become the Full Stop it banked
  const word = stacksOf(RUNES), at = 2 * fullStops(word);
  setStacksSelf(RUNES, (word & ~(0xf << at)) | (0xf << at));
  addGain({ forte1: -2 });
  queue(follow);
}

/** Learn My True Name: at 100 Full Stop, spends it all. */

// NOTE: manaully set to 140/146 frames because last hit is after animation ends, dont want to cancel it early.
const FSkill = sigrikaAction("Forte Skill - Learn My True Name", { minForte2: 100,
   animFrames: 146, noSwapFrames: 132, 
   animPriority: { 0: 10, 132: 9, 138: 2 }, castPriority: 5, cooldown: 60 * 25,
   node: Node.Forte, cast: Cast.Skill, type: Type.Echo, bullets: [
     { hitFrame: 88, mv: 30287, energy: 136, concerto: 500, offtune: 25334 },
     { hitFrame: 140, commitFrame: 88, mv: 90861, energy: 407, concerto: 1500, offtune: 76002 },
   ], castConcerto: 1000, castForte2: -100,
  // the Full Stop it spends leaves the store, the Runes after it moving up
  updateBuffs: () => {
    const word = stacksOf(RUNES);
    setStacksSelf(RUNES, (word & ~0xff) | ((word & 0xff) >> (2 * fullStops(word))));
  },
});

const Liberation = sigrikaAction("Liberation - Where Trust Leads Me!", {
  animFrames: 228, animPriority: { 206: 2 }, castPriority: 10, timestop: [0, 228], motionStop: [0, 228], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Echo, bullets: [{ hitFrame: 176, mv: 86143, offtune: 50400 }], castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => applyCurrent(DIVERGENT),
});

const Intro = sigrikaAction("Intro - Solsworn Etymology", { endPosition: Position.Grounded, qteFrames: 42, animFrames: 58, noSwapFrames: 48, animPriority: { 58: 2 }, castPriority: 11, motionStop: [5, 42], node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 46, mv: 16342, energy: 1000, offtune: 7736 }], castConcerto: 1000});
/** In This Very Moment carries no team buff on her own page (unlike most other kits' outros). */
// wuwalab's priority is all 0 (missing): an Outro's usual 10, held its whole length
const Outro = sigrikaAction("Outro - In This Very Moment", { animFrames: 48, castPriority: 10, cast: Cast.Outro, type: Type.Outro, bullets: [{ hitFrame: 18, mv: 79500 }], minConcerto: 10000, castConcerto: -10000});

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
  convertStats: () => addStat(Stat.DmgBonus, Math.min(50, 2 * Math.max(0, Math.floor(getStat(Stat.ER)) - 125)), Type.Echo),
});
/** True Names Invoked (Inherent Skill): casting Intro grants Convergent — the only source of it. */
const SR_INHERENT_1 = new Inherent({
  name: "Inherent: True Names Invoked",
  grants: [{ on: onAction(Intro), buff: () => CONVERGENT }],
});

/** Whether the current action grants Sigrika a Rune — Elucidated/Decipher's own Dodge Counter
 *  variant (Trust), or BIG BOOMY BOOM!/Soliskin to the Aid (Answer). */
function gainsRune(): boolean {
  return RUNE_PRESSES.some((a) => runningAction(a));
}

/** Convergent (Intro, 20s) doubles the next Rune gained, Divergent (Liberation, 20s) adds one of
 *  the opposite kind; Convergent takes priority when both stand, and neither takes effect at 100
 *  Full Stop. Both are read and spent by gainRune() below. */
const CONVERGENT = new Buff({ name: "Sigrika: Convergent", duration: 60 * 20 });
const DIVERGENT = new Buff({ name: "Sigrika: Divergent", duration: 60 * 20 });

/** The Rune store, one packed word: bits 0-7 are four two-bit slots left to right (1 Trust,
 *  2 Answer, 3 Full Stop), bit 8 always set so an empty store is still a held buff. Hers from
 *  combat start; the display reads the slots off as she stands. */
const RUNES = new Buff({
  name: "Sigrika: Runes", maxStacks: 0x1ff,
  display: (): string => {
    const word = frozenStacks();
    let slots = "";
    for (let k = 0; k < 4; k++) slots += "-TAF"[(word >> (2 * k)) & 3]!;
    return `Sigrika: Runes [${slots}]`;
  },
});
/** How many slots of `word` are Full Stop: 0, 2 or 4, always leading. */
function fullStops(word: number): number {
  let n = 0;
  while (n < 4 && ((word >> (2 * n)) & 3) === 3) n++;
  return n;
}

/** Bank one Rune — 1 Trust, 2 Answer — into the first empty slot after the Full Stops, on the hit
 *  that lands it ("hitting a target directly with..."), whose own +1 forte1 is the count. Two take
 *  Runes at a time: a gain with both full shifts the older out and takes the second — the count
 *  stands; with all four Full Stop there is no room. Convergent/Divergent, unless Full Stop is
 *  at 100, make the gain two: the same kind again, or the opposite. */
function gainRune(kind: number, by: "Convergent" | "Divergent" | null): void {
  const doubler = by === "Convergent" ? CONVERGENT : by === "Divergent" ? DIVERGENT : null;
  let extra = 0;
  if (doubler && isHeld(doubler)) {
    extra = doubler === CONVERGENT ? kind : 3 - kind;
    revokeCurrent(doubler);
  } else if (doubler) addGain({ forte1: -1 });
  // the hit's own forte1 counts these: a Rune pushed at capacity takes its one back
  if (!pushRune(kind)) addGain({ forte1: -1 });
  if (extra && !pushRune(extra)) addGain({ forte1: -1 });
}
/** Push a Rune into the store; false where both its slots were full (or none is open), so the
 *  count stands. */
function pushRune(kind: number): boolean {
  const word = stacksOf(RUNES), at = 2 * fullStops(word);
  if (at >= 8) return false;
  const a = (word >> at) & 3, b = (word >> (at + 2)) & 3;
  const pair = !a ? kind : !b ? a | (kind << 2) : b | (kind << 2);
  setStacksSelf(RUNES, (word & ~(0xf << at)) | (pair << at));
  return !a || !b;
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
  updateBuffs: () => { if (!isHeld(SR_S3)) lostOnSwap(); },
  // spent once Learn My True Name ends: a hit of it landing behind a cut no longer runs it, and pays nothing
  afterAction: () => { if (runningAction(FSkill) && !isHeld(SR_S3)) revokeCurrent(INNATE_GIFT); },
});

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
  outro: Outro,
  swapIn: () => (forte2() >= 50 ? BA2 : BA1),
  swapInAir: MA,
  maxEnergy: 12500,
  maxForte1: 2,
  maxForte2: 100,

  // "When Sigrika has at least 50 points of Full Stop, her Basic Attack cycle starts from Stage 2":
  // whatever she presses then, the next Basic may be Stage 2
  updateBuffs: () => {
    if (forte2() >= 50) saveChain(BA1);
  },

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
    if (RUNE_PRESSES.some((a) => runningAction(a))) addStat(Stat.MulMv, 70);
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
  BA234, EBASIC.cancel(), FHA.cancel(), Liberation,
  BA234, EBASIC.cancel(), FHA.holdCancel(), FSkill,
  Skill, BA34, EBASIC.cancel(),
  OUTRO,
]);

const SR_ROTATION_DOUBLE = new Rotation([
  START_LAST, Liberation, 
  Skill, BA34, EBASIC.instaSwap(),

  INTRO_LAST, ECHO, FHA.dodgeCancel(),
  BA234, ESKILL, BA234, EBASIC.cancel(),
  FHA.holdCancel(), FSkill, Liberation, 
  Skill, BA34, EBASIC.cancel(),
  OUTRO,
]);

// TODO s2+ rotation

const SR_ROTATION_FAST = new Rotation([
  INTRO, ECHO, 
  BA234, EBASIC.cancel(), FHA.cancel(), Liberation,
  BA234, EBASIC.cancel(), FHA.holdCancel(), FSkill,
  OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit, weapon,
// mainslot echo, sonata pieces, mainstat/substat
export const SIGRIKA_EBA = new Loadout({
  resonator: SIGRIKA_RESONATOR,
  weapons: [SOLSWORN_CIPHERS, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [new EchoLoadout(NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ER3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.AtkPct, Substat.FlatAtk, Substat.Basic, Substat.Skill),
  rotation: SR_ROTATION,
  sequences: SR_SEQUENCES,
});
export const SIGRIKA_DOUBLE = new Loadout({
  resonator: SIGRIKA_RESONATOR,
  weapons: [SOLSWORN_CIPHERS, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [new EchoLoadout(NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ER3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.AtkPct, Substat.FlatAtk, Substat.Basic, Substat.Skill),
  rotation: SR_ROTATION_DOUBLE,
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
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.AtkPct, Substat.FlatAtk, Substat.Basic, Substat.Skill),
  rotation: SR_ROTATION_FAST,
  sequences: SR_SEQUENCES,
});
