/**
 * Jinhsi — a Spectro Broadblade main DPS whose whole loop is one burst window, and whose damage is
 * almost all Resonance Skill DMG: Incarnation - Basic Attack is "considered as Resonance Skill
 * DMG" by her own Forte Circuit text, so only the out-of-Incarnation chain below is really Basic.
 *
 * The state machine, named rather than tracked as live combo state (same treatment as Camellya's
 * Blossom Mode):
 *
 * - Intro Loong's Halo (or Basic Attack 4) opens a 5s window in which Resonance Skill becomes
 *   **Overflowing Radiance**, which is what sends her into **Incarnation** (10s).
 * - In Incarnation: Incarnation - Basic Attack 1-4, with Crescent Divinity as the Resonance Skill
 *   (10s cooldown, and it does not reset the basic cycle).
 * - Incarnation - Basic Attack 4 ends Incarnation and opens **Ordination Glow** (5s), in which the
 *   Resonance Skill is **Illuminous Epiphany**: Solar Flare's six taps, and Stella Glamor's
 *   detonation as its last hit, 128 frames into its animation.
 * - Casting Illuminous Epiphany grants **Unison**, once every 25s (shared/unison.ts — swapping out
 *   spends it in place of the Concerto bar, handed back on the outro row itself).
 *
 * That free outro is why she visits the field **twice a loop**, written as an outro-form
 * DOUBLE_INTRO section (rotation.ts): the first visit ends on the Unison outro and hands the field
 * *backward*, the resonator behind her plays their own rotation, and their outro brings it round
 * again for her main Intro chain — which ends on a real outro off a genuinely full bar (~116). The
 * grant's 25s limit is what stops the second Illuminous Epiphany handing over a second free one:
 * her first Epiphany of a rotation grants, and JX_UNISON_SPENT below holds the rest off until her
 * Liberation — the once-a-rotation cast — comes round again.
 *
 * **Incandescence** is a 50-stack buff of her own (not a forte gauge), fed by Eras in Unity (see
 * ERAS_IN_UNITY below): +1 whenever anyone in the party inflicts Attribute DMG, +2 on a
 * Coordinated Attack, each rate-limited per attribute — once per 3s on the fight clock, once per
 * 1s while her Outro's Temporal Bender stands. The stacks pay out on Stella Glamor and are consumed
 * by it: +44.54% DMG
 * Multiplier apiece on its 347.92% base, more than doubling it off a decently fed bar.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1304,
 * https://ww.nanoka.cc/character/1304), read the way CLAUDE.md describes. The second, larger row
 * on Purge of Light, Solar Flare and Stella Glamor is that same hit re-shown at its sequence tier,
 * and the nodes below reproduce each as a multiplier off the base row: 1666.03% x 2.2 = 3665.27%
 * is S5, 19.89% and 347.92% x 1.45 are S6. Loong's Halo's own second row is not a sequence: its
 * 238.58% is the base 159.05% with Converged Flash's +50% already folded in, which is why that
 * inherent contributes the multiplier below instead.
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, matrix } from "../../engine/gear.js";
import {
  addStat,
  applyCurrent,
  applyTeam,
  currentCast, currentHit,
  onAction,
  runningAction,
  runningAnyOf,
  runningBullet,
  frozenStacks,
  isHeld,
  isType,
  queue,
  revokeCurrent,
  revokeTeam,
  currentTeam,
  setStacksSelf,
  stacksOf,
  
  
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, START_LAST, ECHO, NOINTRO, INTRO, OUTRO, DOUBLE_INTRO } from "../../engine/rotation.js";
import { AGES_OF_HARVEST } from "../../weapons/broadblade.js";
import { NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { JUE, CELESTIAL_LIGHT_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { UNISON, unisonOutro } from "../../shared/unison.js";
import { STAY_TUNED, SWORN_VIGIL_5PC } from "../../echoes/mengzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function jinhsiAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

/** The mode markers, no stat of their own — they name which replacement chain is live: the 5s
 *  Overflowing Radiance window off Basic 4 or the Intro, Incarnation, then Ordination Glow. */
const RADIANCE_WINDOW = new Buff({ name: "Jinhsi: Overflowing Radiance", duration: 60 * 5 });
const INCARNATION = new Buff({ name: "Jinhsi: Incarnation", duration: 60 * 10 });
const ORDINATION_GLOW = new Buff({ name: "Jinhsi: Ordination Glow", duration: 60 * 5 });

// --- Slash of Breaking Dawn, the chain she plays only outside Incarnation. Her real loop enters
//     Incarnation off the Intro, so none of these are placed below.
const BA1 = jinhsiAction("Basic - Slash of Breaking Dawn 1", { animFrames: 28, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 17, mv: 6647, energy: 124, concerto: 248, offtune: 3960 }]});
const BA2 = jinhsiAction("Basic - Slash of Breaking Dawn 2", { animFrames: 45, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 3899, energy: 73, concerto: 146, offtune: 2324 },
    { hitFrame: 27, mv: 1950, energy: 37, concerto: 73, offtune: 1162 },
    { hitFrame: 34, mv: 1950, energy: 37, concerto: 73, offtune: 1162 },
    { hitFrame: 42, mv: 1950, energy: 37, concerto: 73, offtune: 1162 },
  ]});
const BA3 = jinhsiAction("Basic - Slash of Breaking Dawn 3", { animFrames: 47, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 15, mv: 1065, energy: 20, concerto: 40, offtune: 635 },
    { hitFrame: 18, mv: 1065, energy: 20, concerto: 40, offtune: 635 },
    { hitFrame: 21, mv: 1065, energy: 20, concerto: 40, offtune: 635 },
    { hitFrame: 24, mv: 1065, energy: 20, concerto: 40, offtune: 635 },
    { hitFrame: 27, mv: 1065, energy: 20, concerto: 40, offtune: 635 },
    { hitFrame: 30, mv: 1065, energy: 20, concerto: 40, offtune: 635 },
    { hitFrame: 33, mv: 1065, energy: 20, concerto: 40, offtune: 635 },
    { hitFrame: 39, mv: 3194, energy: 60, concerto: 119, offtune: 1904 },
  ]});
const BA4 = jinhsiAction("Basic - Slash of Breaking Dawn 4", { animFrames: 74, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 25, mv: 6309, energy: 118, concerto: 236, offtune: 3760 },
    { hitFrame: 33, mv: 9463, energy: 177, concerto: 353, offtune: 5640 },
  ],
  updateBuffs: () => applyCurrent(RADIANCE_WINDOW, 1),
});
const HA = jinhsiAction("Heavy - Slash of Breaking Dawn", { animFrames: 106, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 15, mv: 2386, energy: 40, concerto: 80, offtune: 1280 },
    { hitFrame: 22, commitFrame: 15, mv: 2386, energy: 40, concerto: 80, offtune: 1280 },
    { hitFrame: 29, commitFrame: 15, mv: 2386, energy: 40, concerto: 80, offtune: 1280 },
    { hitFrame: 37, commitFrame: 15, mv: 2386, energy: 40, concerto: 80, offtune: 1280 },
    { hitFrame: 44, commitFrame: 15, mv: 2386, energy: 40, concerto: 80, offtune: 1280 },
    { hitFrame: 75, mv: 3579, energy: 60, concerto: 120, offtune: 1920 },
    { hitFrame: 90, mv: 8351, energy: 140, concerto: 280, offtune: 4480 },
  ]});
const MA = jinhsiAction("Mid-air - Slash of Breaking Dawn Plunge", { animFrames: 95, animPriority: { 71: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 7, mv: 1233, energy: 6, concerto: 10, offtune: 496 },
    { hitFrame: 38, mv: 2466, energy: 11, concerto: 20, offtune: 992 },
    { hitFrame: 52, mv: 8629, energy: 37, concerto: 70, offtune: 3472 },
  ]});
const DC = jinhsiAction("Dodge Counter - Slash of Breaking Dawn", { animFrames: 48, castPriority: 2, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 15, mv: 1468, energy: 28, concerto: 55, offtune: 875 },
    { hitFrame: 18, mv: 1468, energy: 28, concerto: 55, offtune: 875 },
    { hitFrame: 21, mv: 1468, energy: 28, concerto: 55, offtune: 875 },
    { hitFrame: 24, mv: 1468, energy: 28, concerto: 55, offtune: 875 },
    { hitFrame: 27, mv: 1468, energy: 28, concerto: 55, offtune: 875 },
    { hitFrame: 30, mv: 1468, energy: 28, concerto: 55, offtune: 875 },
    { hitFrame: 33, mv: 1468, energy: 28, concerto: 55, offtune: 875 },
    { hitFrame: 39, mv: 4402, energy: 82, concerto: 164, offtune: 2624 },
  ], castConcerto: 1000});

// --- Trailing Lights of Eons, and the alternative skill that opens Incarnation. Trailing Lights
//     (3s) and Crescent Divinity (10s) share one cooldown, each setting it to its own length
const SKILL_CD = new Cooldown({ frames: 60 * 3 });
const Skill = jinhsiAction("Skill - Trailing Lights of Eons", { animFrames: 64, animPriority: { 64: 2 }, castPriority: 4, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 11, mv: 1946, energy: 28, concerto: 55, offtune: 870 },
    { hitFrame: 16, mv: 1946, energy: 28, concerto: 55, offtune: 870 },
    { hitFrame: 21, mv: 1946, energy: 28, concerto: 55, offtune: 870 },
    { hitFrame: 26, mv: 1946, energy: 28, concerto: 55, offtune: 870 },
    { hitFrame: 42, mv: 7784, energy: 109, concerto: 218, offtune: 3480 },
  ]});
const Skill2 = jinhsiAction("Skill - Overflowing Radiance", {
  animFrames: 84, castPriority: 4, cooldown: 60 * 12, requireBuff: RADIANCE_WINDOW,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 11, mv: 987, energy: 7, offtune: 199 },
    { hitFrame: 16, mv: 987, energy: 7, offtune: 199 },
    { hitFrame: 21, mv: 987, energy: 7, offtune: 199 },
    { hitFrame: 26, mv: 987, energy: 7, offtune: 199 },
    { hitFrame: 33, mv: 2959, energy: 19, offtune: 596 },
    { hitFrame: 41, mv: 2959, energy: 19, offtune: 596 },
    { hitFrame: 49, mv: 2959, energy: 19, offtune: 596 },
    { hitFrame: 56, mv: 2959, energy: 19, offtune: 596 },
    { hitFrame: 74, mv: 3945, energy: 25, offtune: 794 },
  ], castConcerto: 400,
  updateBuffs: () => {
    revokeCurrent(RADIANCE_WINDOW);
    applyCurrent(INCARNATION, 1);
  },
});

// --- Forte Circuit (Luminal Synthesis). The Incarnation basic chain is Resonance Skill DMG by its
//     own text, so it is tagged Skill and cast Basic; the Heavy and the Dodge Counter are not.
const IncBA1 = jinhsiAction("Basic - Incarnation 1", { requireBuff: INCARNATION, animFrames: 26, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Skill, bullets: [{ hitFrame: 15, commitFrame: 12, mv: 8862, energy: 124, concerto: 124, offtune: 3960 }]});
const IncBA2 = jinhsiAction("Basic - Incarnation 2", { requireBuff: INCARNATION, animFrames: 41, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Skill, bullets: [
    { hitFrame: 16, commitFrame: 13, mv: 7797, energy: 109, concerto: 109, offtune: 3485 },
    { hitFrame: 25, commitFrame: 13, mv: 2599, energy: 37, concerto: 37, offtune: 1162 },
    { hitFrame: 29, commitFrame: 13, mv: 2599, energy: 37, concerto: 37, offtune: 1162 },
  ]});
  // theoretical commit from 18-24, but window is small
const IncBA3 = jinhsiAction("Basic - Incarnation 3", { requireBuff: INCARNATION, animFrames: 54, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Skill, bullets: [
    { hitFrame: 26, commitFrame: 18, mv: 9944, energy: 139, concerto: 139, offtune: 4445 },
    { hitFrame: 31, mv: 6630, energy: 93, concerto: 93, offtune: 2964 },
  ]});
/** Stage 4 ends Incarnation and hands her Ordination Glow, the window Illuminous Epiphany lives in. */
const IncBA4 = jinhsiAction("Basic - Incarnation 4", {
  animFrames: 87, castPriority: 2, requireBuff: INCARNATION,
  node: Node.Forte, cast: Cast.Basic, type: Type.Skill, bullets: [
    { hitFrame: 0, mv: 1867, energy: 27, concerto: 27, offtune: 835 },
    { hitFrame: 9, commitFrame: 0, mv: 1867, energy: 27, concerto: 27, offtune: 835 },
    { hitFrame: 18, commitFrame: 0, mv: 1867, energy: 27, concerto: 27, offtune: 835 },
    { hitFrame: 27, commitFrame: 0, mv: 1867, energy: 27, concerto: 27, offtune: 835 },
    { hitFrame: 36, commitFrame: 0, mv: 1867, energy: 27, concerto: 27, offtune: 835 },
    { hitFrame: 45, commitFrame: 0, mv: 1867, energy: 27, concerto: 27, offtune: 835 },
    { hitFrame: 71, commitFrame: 0, mv: 7467, energy: 105, concerto: 105, offtune: 3338 },
  ],
  updateBuffs: () => {
    revokeCurrent(INCARNATION);
    applyCurrent(ORDINATION_GLOW, 1);
  },
});
const IncHeavy = jinhsiAction("Heavy - Incarnation", { animFrames: 78, animPriority: { 0: 6, 67: 2 }, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 36, mv: 4772, energy: 60, concerto: 60, offtune: 1920 },
    { hitFrame: 48, mv: 11134, energy: 140, concerto: 140, offtune: 4480 },
  ]});
const IncDodge = jinhsiAction("Dodge Counter - Incarnation", { requireBuff: INCARNATION, animFrames: 87, castPriority: 2, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 20, mv: 4389, concerto: 62, offtune: 1962 },
    { hitFrame: 48, mv: 3292, concerto: 46, offtune: 1472 },
    { hitFrame: 56, mv: 3292, concerto: 46, offtune: 1472 },
    { hitFrame: 71, mv: 10971, concerto: 154, offtune: 4904 },
  ], castConcerto: 1000});
const Skill3 = jinhsiAction("Skill - Crescent Divinity", { requireBuff: INCARNATION, animFrames: 87, castPriority: 4, cooldown: SKILL_CD, cooldownFrames: 60 * 10, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 20, commitFrame: 29, mv: 10076, energy: 64, offtune: 2028 },
    { hitFrame: 53, mv: 7557, energy: 48, offtune: 1521 },
    { hitFrame: 60, mv: 7557, energy: 48, offtune: 1521 },
    { hitFrame: 71, mv: 25190, energy: 159, offtune: 5068 },
  ], castConcerto: 800});

/** Illuminous Epiphany, the one press: Solar Flare's six taps, then Stella Glamor's detonation —
 *  the hit every Incandescence held pays out on (see INCANDESCENCE below). */
const Skill4 = jinhsiAction("Forte Skill - Illuminous Epiphany", {
  animFrames: 174, castPriority: 10, timestop: [0, 132], motionStop: [0, 174], requireBuff: ORDINATION_GLOW,
  node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 87, mv: 1989, energy: 33, offtune: 2400 },
    { hitFrame: 93, commitFrame: 87, mv: 1989, energy: 33, offtune: 2400 },
    { hitFrame: 99, commitFrame: 87, mv: 1989, energy: 33, offtune: 2400 },
    { hitFrame: 105, commitFrame: 87, mv: 1989, energy: 33, offtune: 2400 },
    { hitFrame: 111, commitFrame: 87, mv: 1989, energy: 33, offtune: 2400 },
    { hitFrame: 117, commitFrame: 87, mv: 1989, energy: 33, offtune: 2400 },
    { hitFrame: 128, mv: 34792, energy: 567, offtune: 42002 },
  ], castConcerto: 2000,
  updateBuffs: () => revokeCurrent(ORDINATION_GLOW),
});
const Skill4_Unison = Skill4.variant("Forte Skill - Illuminous Epiphany", {
  updateBuffs: () => {
    revokeCurrent(ORDINATION_GLOW);
    applyCurrent(UNISON, 1);
  }
});
/** Both forms of the press, and its last hit: Stella Glamor. */
const EPIPHANY = new Set<Action>([Skill4, Skill4_Unison]);
const stellaGlamor = (): boolean => runningBullet(Skill4, -1) || runningBullet(Skill4_Unison, -1);

const Liberation = jinhsiAction("Liberation - Purge of Light", {
  animFrames: 231, animPriority: { 203: 0 }, castPriority: 10, timestop: [0, 231], motionStop: [0, 231], cooldown: 60 * 24,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 106, mv: 49981, offtune: 25200 }, { hitFrame: 114, mv: 116622, offtune: 58800 }], castConcerto: 2000, resetEnergy: true,
});

const Intro = jinhsiAction("Intro - Loong's Halo", {
  qteFrames: 42, animFrames: 60, noSwapFrames: 78, animPriority: { 60: 1 }, castPriority: 11, motionStop: [4, 37],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 49, mv: 15905, energy: 1000, offtune: 8000 }], castConcerto: 1000,
  // "while not in Incarnation", it opens the Overflowing Radiance window
  updateBuffs: () => {
    if (!isHeld(INCARNATION)) applyCurrent(RADIANCE_WINDOW, 1);
  },
});
/** Temporal Bender hands the incoming resonator nothing of their own: it opens her own 20s window,
 *  under which Eras in Unity's channels run at one action instead of three. Both of her outros are
 *  this one cast — the first its Unison form, paid for by Unison, the second by the bar — so the
 *  window is re-opened twice a rotation. */
const Outro = jinhsiAction("Outro - Temporal Bender", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => applyCurrent(TEMPORAL_BENDER, 1),
});
const OutroUnison = unisonOutro(Outro);

/* ------------------------------------------------------------------------------------- buffs */

/* Unison itself is shared/unison.ts's: whichever of her outros holds it is the free one, and the
 * other pays the real bar. */

/**
 * Eras in Unity — the whole Incandescence economy, held on Jinhsi's own slot and watching every
 * hit from hitGlobal() (the Jingran shape: reacting to teammates' turns, paying onto her).
 * Twelve channels, one per (attribute, coordinated?) — the six attributes, Physical (the Tune
 * Break) being no Attribute DMG — each a buff of her own that stands while the channel cools: a
 * paying action's element pays +1 Incandescence off its same-attribute channel and a Coordinated
 * Attack pays +2 off its own channel beside it, and each closes for 3s, or 1s while Temporal
 * Bender stands (the kit's own 1s, which speeds both sides up). A DOT tick is ignored outright.
 * The 50 cap is INCANDESCENCE's own maxStacks.
 */
/** Temporal Bender's own 20s window, off either of her outros. Its only job is to speed Eras in
 *  Unity's channels up, so it carries no stat of its own. */
const TEMPORAL_BENDER = new Buff({ name: "Jinhsi: Temporal Bender", duration: 60 * 20 });

/** The twelve channels, each held on her own slot as the fight frame it next opens at — read
 *  against the frame being evaluated, so a hit landing at its own frame (a tick's) reads it true. */
const ERAS_CHANNELS = new Map<Attribute, [Buff, Buff]>();
for (const [attribute, label] of [[Attribute.Aero, "Aero"], [Attribute.Electro, "Electro"], [Attribute.Fusion, "Fusion"], [Attribute.Glacio, "Glacio"], [Attribute.Spectro, "Spectro"], [Attribute.Havoc, "Havoc"]] as [Attribute, string][]) {
  const channel = (name: string): Buff => new Buff({ name, maxStacks: 1e9, hidden: true });
  ERAS_CHANNELS.set(attribute, [channel(`Jinhsi: Eras in Unity - ${label}`), channel(`Jinhsi: Eras in Unity - ${label} (Coordinated)`)]);
}
const ERAS_IN_UNITY = new Buff({
  name: "Jinhsi: Eras in Unity",
  hitGlobal: () => {
    // a DOT tick (the Negative Status ladders) is nobody's attack, and the six attributes only: a
    // Physical hit (the Tune Break) is no Attribute DMG
    const element = currentHit().element;
    if (currentCast().scaling === Scaling.Dot || !element || element === Attribute.Physical) return;
    const [plain, coordinated] = ERAS_CHANNELS.get(element)!;
    const now = currentTeam().frame, shut = now + (isHeld(TEMPORAL_BENDER) ? 60 : 180);
    if (stacksOf(plain) <= now) {
      setStacksSelf(plain, shut);
      applyTeam(INCANDESCENCE, 1);
    }
    if (isType(Subtype.Coordinated) && stacksOf(coordinated) <= now) {
      setStacksSelf(coordinated, shut);
      applyTeam(INCANDESCENCE, 2);
    }
  },
});

/** Incandescence itself: what Eras in Unity banks, up to 50, with the cap carried by the stacks'
 *  own ceiling. Every stack held pays +44.54% DMG Multiplier onto Stella Glamor, which consumes
 *  the lot — the buff's whole payout is that one row of her forte. Held team-wide so the count
 *  reads on every row of the log; the Stella Glamor gate keeps the payout hers alone. */
const INCANDESCENCE = new Buff({
  name: "Jinhsi: Incandescence", maxStacks: 50,
  applyStats: () => { if (stellaGlamor()) addStat(Stat.AddMv, 4454 * frozenStacks()); },
  afterAction: () => { if (runningAnyOf(EPIPHANY)) revokeTeam(INCANDESCENCE); },
});

/** Radiant Surge (Inherent Skill): +20% Spectro DMG Bonus, genuinely unconditional. */
const RADIANT_SURGE = new Inherent({
  name: "Inherent: Radiant Surge",
  stats: [[Stat.DmgBonus, 20, Attribute.Spectro]],
});

/** Converged Flash (Inherent Skill): Loong's Halo's own DMG Multiplier +50%. */
const CONVERGED_FLASH = new Inherent({
  name: "Inherent: Converged Flash",
  applyStats: () => { if (runningAction(Intro)) addStat(Stat.MulMv, 50); },
});

/* --------------------------------------------------------------------------- resonance chain */

/** S1's own stacking buff: one per Incarnation basic or Crescent Divinity, four at most, spent by
 *  Illuminous Epiphany. Both halves of that press are the one skill, so each stack pays on Solar
 *  Flare and on the Stella Glamor behind it, and it is Stella Glamor — the last of the pair — that
 *  consumes the lot, the same way Incandescence does. The 6s never binds: her rotation builds the
 *  four and spends them inside one burst (BA1-3, Crescent Divinity, BA4, Epiphany). */
const HERALD_OF_REVIVAL = new Buff({
  name: "Jinhsi S1: Herald of Revival", maxStacks: 4, duration: 60 * 6,
  applyStats: () => {
    if (runningAnyOf(EPIPHANY)) addStat(Stat.DmgBonus, 20 * frozenStacks());
  },
  afterAction: () => { if (runningAnyOf(EPIPHANY)) revokeCurrent(HERALD_OF_REVIVAL); },
});

const JX_S1 = new Sequence({
  name: "Jinhsi S1: Abyssal Ascension",
  updateBuffs: () => {
    if (runningAction(IncBA1) || runningAction(IncBA2) || runningAction(IncBA3) || runningAction(IncBA4) || runningAction(Skill3)) {
      applyCurrent(HERALD_OF_REVIVAL, 1);
    }
  },
});

/** S2: 50 Incandescence back for standing *out of combat* 4s. A rotation here is one unbroken
 *  fight, so this never fires — the node is held for its name, like Phrolova's own S5. */
const JX_S2 = new Sequence({ name: "Jinhsi S2: Chronofrost Repose" ,
  combatStart: () => { applyTeam(INCANDESCENCE, 50); },
});

/** S3's stacks: +25% ATK apiece, two at most, one per Intro she casts. Its 20s covers her whole
 *  double-Intro pair, so the mid-loop outro — the free one Unison pays for, which she comes
 *  straight back from — keeps them and only the bar-paid outro that ends the loop drops them. */
const IMMORTALS_DESCENDANCY = new Buff({
  name: "Jinhsi S3: Immortal's Descendancy", maxStacks: 2, duration: 60 * 20,
  stats: [[Stat.BonusAtk, 25]], perStack: true,
});

const JX_S3 = new Sequence({
  name: "Jinhsi S3: Celestial Incarnate",
  grants: [{ on: onAction(Intro), buff: IMMORTALS_DESCENDANCY }],
});

/** S4: "all nearby Resonators", so it pays on their inactive actions too; "Attribute DMG Bonus"
 *  with no attribute named, so it goes on untagged. 20s team buff — lost on her own next Intro. */
const JX_S4_TEAM = new Buff({
  name: "Jinhsi S4: Benevolent Grace",
  duration: 60 * 20,
  stats: [[Stat.DmgBonus, 20]],
});

const JX_S4 = new Sequence({
  name: "Jinhsi S4: Benevolent Grace",
  updateBuffs: () => {
    if (runningAction(Liberation) || runningAnyOf(EPIPHANY)) applyTeam(JX_S4_TEAM, 1);
  },
});

/** S5: Purge of Light's own 1666.03% x 2.2, which is nanoka's second row for it. */
const JX_S5 = new Sequence({
  name: "Jinhsi S5: Frostfire Illumination",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 120); },
});

/** S6: the same +45% on both halves of Illuminous Epiphany — and, because a motion value is
 *  `(base + added) x (1 + multiplier)` (damage.ts), the one multiplier lifts the 44.54% per
 *  Incandescence stack by 45% too, which is the node's second clause. */
const JX_S6 = new Sequence({
  name: "Jinhsi S6: Thawing Triumph",
  applyStats: () => {
    if (runningAnyOf(EPIPHANY)) addStat(Stat.MulMv, 45);
  },
});

/* --------------------------------------------------------------------------- kit and loadout */

const JINHSI_TALENTS = new Talent({
  name: "Jinhsi: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

export const JINHSI_RESONATOR = new Resonator({
  name: "Jinhsi",
  matrix: matrix("Jinhsi", 25),
  talent: JINHSI_TALENTS,
  inherent1: RADIANT_SURGE,
  inherent2: CONVERGED_FLASH,
  element: Attribute.Spectro,
  weapon: WeaponType.Broadblade,
  color: "#c2ecfb",
  intro: Intro,
  outro: () => (isHeld(UNISON) ? OutroUnison : Outro),
  maxEnergy: 15000,

  // Eras in Unity is hers the moment she is on the team, well before her first turn
  combatStart: () => applyCurrent(ERAS_IN_UNITY, 1),

  stats: [[Stat.BaseHp, 10825], [Stat.BaseAtk, 412.5], [Stat.BaseDef, 1258.8866]],
});

/* ---------------------------------------------------------------------------------- rotation */

/** Both visits run the same line — Intro into Overflowing Radiance, the Incarnation basic chain,
 *  Illuminous Epiphany — since Epiphany is what hands over the Unison the first of them leaves on.
 *  The once-per-visit casts go in the second, the longer one: the echo (so Jué's Blessing of Time
 *  covers the burst rather than the next resonator's), Crescent Divinity between stages 3 and 4
 *  (its 10s cooldown, and the Incarnation basic cycle does not reset), and Purge of Light last of
 *  all, just ahead of the outro. Delaying the Liberation costs no buff uptime — nothing in her kit
 *  or on Ages of Harvest scopes to Liberation — and it is the cast that resets RealEnergy, so
 *  leaving it to the end is what makes the Energy Requirements table measure the whole loop's
 *  banking. Trailing Lights of Eons is pressed only in the opening scramble: on every visit after,
 *  the Intro's own 5s window means the Resonance Skill button is Overflowing Radiance. */
const BA1234 = new ActionGroup("Basic - Slash of Breaking Dawn 1234", [BA1, BA2, BA3, BA4]);

const IncBA12 = new ActionGroup("Basic - Incarnation 12", [IncBA1, IncBA2]);
const IncBA34 = new ActionGroup("Basic - Incarnation 34", [IncBA3, IncBA4]);
const IncBA123 = new ActionGroup("Basic - Incarnation 123", [IncBA1, IncBA2, IncBA3]);

/** Which Intro / Outro this resonator casts, resolved when its row is reached — whichever the
 *  kit's state calls for there (a kit with more than one). */

const JX_ROTATION_FULL = new Rotation([
  START_LAST, Liberation, Skill.instaSwap(),

  DOUBLE_INTRO, Skill2, 
  IncBA12.cancel(), Skill3, IncBA34.instaCancel(),
  ECHO, Skill4_Unison, OUTRO,

  INTRO, Skill2,
  IncBA12.cancel(), Skill3, IncBA34.instaCancel(),
  Skill4, Liberation, OUTRO,
]);

// her support rotation lists a Liberation every visit and the bar only fills for half of them, so
// each one is gated: the START cast plays, the opener's is skipped, and the loops alternate on
// her main-DPS rotation with both Liberations gated: the double-Intro visit stays, but the bar
// only fills every other time it comes round, so the cast alternates rather than being listed
// every loop and paid for on credit
const JX_ROTATION_EVERY_OTHER = new Rotation([
  START_LAST, Liberation.everyOther(), Skill.instaSwap(),

  NOINTRO, BA1234.instaCancel(), Skill2.instaCancel(), ECHO, Liberation.everyOther(),
  IncBA1, IncBA2.instaJump(), IncBA3.instaJump(), IncBA4.instaCancel(), 
  Skill4_Unison, OUTRO,

  DOUBLE_INTRO, Skill2.instaDodge(), 
  IncBA12.cancel(), Skill3, IncBA34.instaCancel(),
  ECHO, Skill4_Unison, Liberation.everyOther(), OUTRO,

  INTRO, Skill2.instaDodge(),
  IncBA12.cancel(), Skill3, IncBA34.instaCancel(),
  Skill4, OUTRO,
]);

const JX_ROTATION_SUPPORT = new Rotation([
  START_LAST, Liberation.everyOther(), Skill.instaSwap(),

  NOINTRO, BA1234.instaCancel(), Skill2.instaCancel(), ECHO, Liberation.everyOther(), 
  IncBA1, IncBA2.instaJump(), IncBA3.instaJump(), IncBA4.instaCancel(), 
  Skill4_Unison, OUTRO,

  INTRO, Skill2.instaDodge(), ECHO, 
  IncBA12.cancel(), Skill3, IncBA34.instaCancel(),
  Skill4_Unison, Liberation.everyOther(), OUTRO,
]);

const JX_ECHOES = [
  new EchoLoadout(JUE, CELESTIAL_LIGHT_5PC),
  new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC),
];

/** For teams whose Energy the rotation cannot keep up with — her Liberation every other visit
 *  instead of every one (see `JX_ROTATION_EVERY_OTHER`). */
export const JINHSI = new Loadout({
  resonator: JINHSI_RESONATOR,
  weapons: [AGES_OF_HARVEST, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: JX_ECHOES,
  sequences: [JX_S1, JX_S2, JX_S3, JX_S4, JX_S5, JX_S6],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation, Substat.Basic),
  rotation: JX_ROTATION_EVERY_OTHER,
});
export const JINHSI_FULL = new Loadout({
  resonator: JINHSI_RESONATOR,
  weapons: [AGES_OF_HARVEST, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: JX_ECHOES,
  sequences: [JX_S1, JX_S2, JX_S3, JX_S4, JX_S5, JX_S6],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation, Substat.Basic),
  rotation: JX_ROTATION_FULL,
});
export const JINHSI_SUPPORT = new Loadout({
  resonator: JINHSI_RESONATOR,
  weapons: [AGES_OF_HARVEST, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: JX_ECHOES,
  sequences: [JX_S1, JX_S2, JX_S3, JX_S4, JX_S5, JX_S6],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation, Substat.Basic),
  rotation: JX_ROTATION_SUPPORT,
});
