/**
 * Camellya, ported to the new engine — sequence-0 core loop, a limited 5-star
 * (`Tier.Limited`). A havoc sword main DPS built around Blossom Mode and Budding Mode, both
 * entered and exited by name rather than tracked as live combo state (same "fixed valid line"
 * treatment as Sigrika's Runes/Buling's Trigram):
 *
 * - Resonance Skill Crimson Blossom (considered Basic Attack DMG) opens Blossom Mode: Basic
 *   Attack becomes Vining Waltz (4 stages, with an optional Blazing Waltz insert on stage 3),
 *   Dodge Counter becomes Atonement, and Resonance Skill becomes Floral Ravage, which ends it.
 * - Forte Circuit Ephemeral (at full Concerto) deals its own hit and enters Budding Mode: Sweet
 *   Dream — a flat +50% DMG Multiplier, plus +5% more a Crimson Bud actually held at the moment
 *   Ephemeral consumed them (up to +50% more at 10, genuinely tracked as an 11-stack buff) — on
 *   every stage of Normal Attack/Vining Waltz/Blazing Waltz/Vining Ronde/Atonement/Crimson
 *   Blossom/Floral Ravage. 15s action gains stats.
 *
 * Crimson Pistil (forte1, 0-100 in-game): both Intro and Ephemeral genuinely *recover* it to a
 * hard 100, not spend it — both pre-clamp to 0 before their own declared +100 field lands, so
 * Ephemeral's own +100 doesn't stack on top of whatever Intro already banked earlier in the run.
 * Ordinary hits during Blossom/Budding Mode drain it live, per the migrated sheet's own
 * SpecialEnergy1 column ÷100, onto the real 0-100 scale — nothing in her kit reads forte1() for
 * an effect, so this is a trace/hover value only. Not gated to only fire during Blossom/Budding Mode here, unlike
 * the real kit text — same "always applies" simplification the MV/energy/concerto/offtune
 * columns already carry for these same actions.
 *
 * Concerto Energy: Ephemeral genuinely requires it full (100) and spends 70 — its declared -70
 * is spent against the bar's own 100 ceiling by the engine (evaluate.ts), and flagged red when
 * the bar held less. "Consuming 10 Crimson Pistils
 * recovers 4 Concerto Energy and obtains 1 Crimson Bud" is checked as every full 10 consumed
 * from the 100 top (first at 90 or less) by *that one hit's own consumption*, read
 * off forte1() before vs. after — not a flat 1-per-hit rate — at the cast that banks the spend
 * (CAMELLYA_RESONATOR's updateBuffs()), gated off entirely while Budding Mode is held. Its Energy
 * Regen Multiplier is the real stat (Stat.EnergyRegenMult): +150% outside Budding Mode, -100 (a x0
 * factor) while it's held.
 *
 * Seedbed/Epiphyte (Inherent Skills, always assumed known): +15% Havoc DMG Bonus flat; +15%
 * Basic DMG Bonus flat (interruption-resistance half not modelled) — both genuinely
 * unconditional, each its own piece of gear so the report's own source trace names them
 * individually. Vining Ronde and the Crimson Pistil/Bud economy that gates when Ephemeral is
 * actually available aren't tracked live — Ephemeral is just placed once the rotation calls for it.
 *
 * MVs and durations from nanoka.cc (character 1603); frames and per-hit gains from wuwalab,
 * cross-checked against encore.moe. Twining's own row gives 0 gains, a real absence.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence, matrix } from "../../engine/gear.js";
import {
  asSource,
  applyCurrent,
  revokeCurrent,
  currentAction,
  onAction,
  runningAction,
  addStat,
  isHeld,
  stacksOf,
  frozenStacks,
  forte1,
  lostOnSwap,
  addToCast,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, INTRO, DOUBLE_INTRO } from "../../engine/rotation.js";
import { RED_SPRING } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { NM_CROWNLESS, HAVOC_ECLIPSE_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { tuneBreak, SWORD_BREAK } from "../../shared/tunebreak.js";

/* ----------------------------------------------------------------------------------- actions */

function camellyaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune all come off nanoka's own "Damage Data" table — Energy column ->
// energy, Elemental DMG column -> concerto, Weakness Break DMG column x10000 -> offtune, same
// convention Rover Havoc's/Danjin's own files established. forte1 (Crimson Pistil consumption)
// comes off that same table family — the migrated sheet's SpecialEnergy1 column ÷100, onto the
// real 0-100 cap. A table with a second row at a
// much higher % (Ephemeral/Liberation/Intro) is that same hit re-shown at a sequence-boosted
// tier, not a second real hit — only the first (sequence-0) row is used. A flat listed "Concerto
// Regen" adds on top of whatever the table's own Elemental DMG column already gives.
// --- basics, mid-air, dodge counter (Burgeoning), outside Blossom Mode
const BA1 = camellyaAction("Basic - Burgeoning 1", { animFrames: 19, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 9, mv: 6253, energy: 93, concerto: 185, offtune: 2960 }], castForte1: -615});
const BA2 = camellyaAction("Basic - Burgeoning 2", { animFrames: 33, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 4648, energy: 69, concerto: 138, offtune: 2200 },
    { hitFrame: 21, mv: 4648, energy: 69, concerto: 138, offtune: 2200 },
  ], castForte1: -914}); // 46.48% x2
const BA3 = camellyaAction("Basic - Burgeoning 3", { animFrames: 62, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 6, mv: 5070, energy: 75, concerto: 150, offtune: 2400 },
    { hitFrame: 33, mv: 5070, energy: 75, concerto: 150, offtune: 2400 },
    { hitFrame: 45, mv: 5070, energy: 75, concerto: 150, offtune: 2400 },
  ], castForte1: -1494}); // 50.70% x3
/** Chain Basic Attack — hold Normal Attack after Stage 3 to keep striking, 20 hits. */
const BA4 = camellyaAction("Basic - Burgeoning 4 (Hold)", { animFrames: 148, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 22, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 30, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 38, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 46, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 54, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 61, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 69, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 76, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 82, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 88, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 95, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 101, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 107, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 113, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 119, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 126, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 132, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 138, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
    { hitFrame: 144, mv: 2470, energy: 27, concerto: 54, offtune: 864 },
  ], castForte1: -3600}); // 24.70% x20
const BA5 = camellyaAction("Basic - Burgeoning 5", { animFrames: 94, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 3, mv: 4817, energy: 72, concerto: 143, offtune: 2280 },
    { hitFrame: 42, mv: 4817, energy: 72, concerto: 143, offtune: 2280 },
    { hitFrame: 50, mv: 4817, energy: 72, concerto: 143, offtune: 2280 },
    { hitFrame: 83, commitFrame: 50, mv: 4817, energy: 72, concerto: 143, offtune: 2280 },
  ], castForte1: -1896}); // 48.17% x4

const MA = camellyaAction("Mid-air - Plunging Attack", { animFrames: 63, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 29, mv: 6561, energy: 83, concerto: 165, offtune: 2640 },
    { hitFrame: 38, mv: 6561, energy: 83, concerto: 165, offtune: 2640 },
  ], castForte1: -1096}); // 65.61% x2
const DC = camellyaAction("Dodge Counter - Burgeoning", { animFrames: 62, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 6, mv: 9940, energy: 75, concerto: 150, offtune: 2400 },
    { hitFrame: 33, mv: 9940, energy: 75, concerto: 150, offtune: 2400 },
    { hitFrame: 45, mv: 9940, energy: 75, concerto: 150, offtune: 2400 },
  ], castForte1: -2490, castConcerto: 1000}); // 99.40% x3
/** Considered Basic Attack DMG per Seedbed's own text. */
const HA = camellyaAction("Heavy - Pruning", { animFrames: 87, node: Node.Normal, cast: Cast.Heavy, type: Type.Basic, bullets: [
    { hitFrame: 32, mv: 8814, energy: 111, concerto: 222, offtune: 3547 },
    { hitFrame: 43, mv: 8814, energy: 111, concerto: 222, offtune: 3547 },
    { hitFrame: 72, mv: 8814, energy: 111, concerto: 222, offtune: 3547 },
  ], castForte1: -2208}); // 88.14% x3

// Crimson Blossom opens Blossom Mode; Vining Waltz/Blazing Waltz/Vining Ronde/Atonement replace
// Basic/Dodge Counter/Jump while it's up; Floral Ravage (Skill replacement) ends it.
const CrimsonBlossom = camellyaAction("Skill - Crimson Blossom", {
  animFrames: 85, cooldown: 60 * 4,
  node: Node.Skill, cast: Cast.Skill, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 11362, energy: 159, offtune: 5080 },
    { hitFrame: 35, mv: 11362, energy: 159, offtune: 5080 },
  ], castForte1: -2110, castConcerto: 700, // 113.62% x2
  updateBuffs: () => applyCurrent(BLOSSOM_MODE, 1),
});

const VW1 = camellyaAction("Basic - Vining Waltz 1", { animFrames: 37, node: Node.Skill, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 20, mv: 9633, energy: 143, concerto: 285, offtune: 4560 }], castForte1: -947});
const VW2 = camellyaAction("Basic - Vining Waltz 2", { animFrames: 36, node: Node.Skill, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 19, mv: 4563, energy: 68, concerto: 135, offtune: 2160 },
    { hitFrame: 30, mv: 4563, energy: 68, concerto: 135, offtune: 2160 },
  ], castForte1: -898}); // 45.63% x2
const VW3 = camellyaAction("Basic - Vining Waltz 3", { animFrames: 71, node: Node.Skill, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 28, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 34, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 40, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 46, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 52, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 58, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
  ], castForte1: -960}); // 21.95% x6
/** Blazing Waltz — hold Normal Attack on Vining Waltz Stage 3 before it auto-continues to Stage
 *  4. Shares Vining Waltz 3's own per-hit row, multiplied out to its own real *19 hit count. */
const BlazingWaltz = camellyaAction("Basic - Blazing Waltz", { animFrames: 117, node: Node.Skill, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 6, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 12, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 18, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 24, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 30, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 36, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 42, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 48, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 54, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 60, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 66, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 72, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 78, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 84, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 90, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 96, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 102, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
    { hitFrame: 108, mv: 2195, energy: 24, concerto: 48, offtune: 768 },
  ], castForte1: -3040}); // 21.95% x19
const VW4 = camellyaAction("Basic - Vining Waltz 4", { animFrames: 82, node: Node.Skill, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 25, mv: 6759, energy: 100, concerto: 200, offtune: 3200 },
    { hitFrame: 30, mv: 6759, energy: 100, concerto: 200, offtune: 3200 },
    { hitFrame: 63, commitFrame: 30, mv: 6759, energy: 100, concerto: 200, offtune: 3200 },
  ], castForte1: -1992}); // 67.59% x3

/** Jump's own replacement in Blossom Mode, ends it. Never placed in the rotation below (she
 *  never jumps into one there), exported for completeness. */
const ViningRonde = camellyaAction("Basic - Vining Ronde", { animFrames: 68, node: Node.Skill, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 5295, energy: 79, concerto: 157, offtune: 2507 },
    { hitFrame: 22, mv: 5295, energy: 79, concerto: 157, offtune: 2507 },
    { hitFrame: 54, mv: 5295, energy: 79, concerto: 157, offtune: 2507 },
  ], castForte1: -1563}); // 52.95% x3
const Atonement = camellyaAction("Dodge Counter - Atonement", { animFrames: 39, node: Node.Skill, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 19, mv: 11333, energy: 68, concerto: 135, offtune: 2160 },
    { hitFrame: 31, mv: 11333, energy: 68, concerto: 135, offtune: 2160 },
  ], castForte1: -1894, castConcerto: 1000}); // 113.33% x2

/** The Skill replacement in Blossom Mode, ends it. Considered Basic Attack DMG. */
const FloralRavage = camellyaAction("Skill - Floral Ravage", { cooldown: 60 * 4, animFrames: 96, node: Node.Skill, cast: Cast.Skill, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 5261, energy: 74, offtune: 2352 },
    { hitFrame: 24, mv: 5261, energy: 74, offtune: 2352 },
    { hitFrame: 32, mv: 5261, energy: 74, offtune: 2352 },
    { hitFrame: 63, mv: 5261, energy: 74, offtune: 2352 },
    { hitFrame: 71, mv: 5261, energy: 74, offtune: 2352 },
  ], castForte1: -2445, castConcerto: 700}); // 52.61% x5

/** At full Crimson Pistil/Concerto — considered Basic Attack DMG, enters Budding Mode, genuinely
 *  recovers Crimson Pistil to a hard 100, and spends 70 Concerto off a hard-clamped-to-100
 *  starting point (see file header on both pre-clamps in CAMELLYA_RESONATOR's own updateBuffs()). */
/** Requires full Concerto and consumes 70 of it; refills the gauge from empty, and folds every
 *  Crimson Bud held into the Budding Mode it opens. */
/** Ephemeral and S6's Perennial share one 25s cooldown. */
const Ephemeral = camellyaAction("Forte Skill - Ephemeral", {
  animFrames: 85, cooldown: 60 * 25,
  node: Node.Forte, cast: Cast.Skill, type: Type.Basic, bullets: [{ hitFrame: 60, mv: 126245, energy: 1200, offtune: 60800 }], resetForte1: true, minConcerto: 10000, castConcerto: -7000,
  castForte1: 10000, updateBuffs: () => {
    const buds = stacksOf(CRIMSON_BUD);
    revokeCurrent(BUDDING_MODE);
    applyCurrent(BUDDING_MODE, 1 + buds);
    revokeCurrent(CRIMSON_BUD);
    applyCurrent(TWINING, 1);
  },
});

/** S6: the Skill within 15s of Ephemeral at full Concerto — 100% of Ephemeral's DMG (so S2's
 *  boost too), Basic DMG, spends 50 Concerto, refunds 50 Pistils, drops every Bud and re-opens
 *  Budding Mode at Sweet Dream's 250% cap. No row of its own on nanoka: no energy/off-tune. */
const Perennial = camellyaAction("Forte Skill - Perennial (S6)", {
  animFrames: 85, cooldown: 60 * 25, // "can be cast once every 25s"
  node: Node.Forte, cast: Cast.Skill, type: Type.Basic, bullets: [{ hitFrame: 60, mv: 126245, energy: 1200, offtune: 60800 }], minConcerto: 10000, castConcerto: -5000,
  castForte1: 5000, updateBuffs: () => {
    revokeCurrent(BUDDING_MODE);
    applyCurrent(BUDDING_MODE, 11);
    revokeCurrent(CRIMSON_BUD);
  },
});

const Liberation = camellyaAction("Liberation - Fervor Efflorescent", { animFrames: 264, prioFrames: 239, timestop: [0, 240], motionStop: [0, 240], cooldown: 60 * 25, node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 176, mv: 120281, offtune: 84000 }], castConcerto: 2000, resetEnergy: true });

const Intro = camellyaAction("Intro - Everblooming", {
  prioFrames: 77, motionStop: [6, 34],
  animFrames: 77, noSwapFrames: 85,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 41, mv: 19881, energy: 1000, offtune: 9600 }], castConcerto: 1000, resetForte1: true, castForte1: 10000 
});
/** No handoff buff is described on her own kit page, unlike most other kits' outros — left as a
 *  plain damage hit. The Ephemeral-boosted variant isn't separately placed. */
const Outro = camellyaAction("Outro - Twining", { cast: Cast.Outro, type: Type.Outro, bullets: [{ hitFrame: 0, mv: 32924 }], minConcerto: 10000, castConcerto: -10000});
/** After Ephemeral the next Twining deals 459.02% more, its second hit 37 frames in (wuwalab). */
const OutroEphemeral = Outro.variant("Outro - Twining (Ephemeral)", {
  bullets: [{ hitFrame: 0, mv: 32924 }, { hitFrame: 37, commitFrame: 0, mv: 45902 }],
  updateBuffs: () => revokeCurrent(TWINING),
});
const OutroResolver = new Action("Outro Resolver", { cast: Cast.Outro, resolve: () => (isHeld(TWINING) ? OutroEphemeral : Outro) });

/* ------------------------------------------------------------------------------------ buffs */

/** A pure state/display marker, no stat of its own — opened by Crimson Blossom, ends on Floral
 *  Ravage/Vining Ronde or her own outro. */
const BLOSSOM_MODE = new Buff({
  name: "Camellya: Blossom Mode",
  afterAction: () => {
    if (runningAction(FloralRavage) || runningAction(ViningRonde)) revokeCurrent(BLOSSOM_MODE);
  },
});

/** Sweet Dream's own DMG Multiplier, on every stage of the Burgeoning combo plus seven other
 *  named actions. An 11-stack buff: 1 base stack (flat +50%) plus 1 more per Crimson Bud held
 *  the moment Ephemeral consumed them (up to 10, +5% each — granted by CAMELLYA_RESONATOR's own updateBuffs(),
 *  since a Gear's own updateBuffs() only runs once it's already held). 15s
 *  action gains stats. */
function inSweetDream(): boolean {
  return runningAction(BA1) || runningAction(BA2) || runningAction(BA3) || runningAction(BA4) || runningAction(BA5)
    || runningAction(VW1) || runningAction(VW2) || runningAction(VW3) || runningAction(VW4) || runningAction(BlazingWaltz)
    || runningAction(ViningRonde) || runningAction(Atonement) || runningAction(CrimsonBlossom) || runningAction(FloralRavage);
}
const BUDDING_MODE = new Buff({
  name: "Camellya: Sweet Dream", maxStacks: 11, duration: 60 * 15,
  // S6 lifts the flat 50 to 200 (Perennial's 11 stacks land on the 250 cap); S3 is +58% ATK while held
  applyStats: () => {
    if (isHeld(CM_S3)) asSource(CM_S3, () => addStat(Stat.BonusAtk, 58));
    if (!inSweetDream()) return;
    addStat(Stat.MulMv, 45 + 5 * frozenStacks());
    // S6 lifts the flat half from 45 to 195 — the 150 it adds is the node's own
    if (isHeld(CM_S6)) asSource(CM_S6, () => addStat(Stat.MulMv, 150));
  },
  // two real end conditions: switched off field, and "all Crimson Pistils consumed" — the latter
  // read once the press is over and its drain banked, excluding the two casts that open it
  updateBuffs: () => lostOnSwap(),
  afterAction: () => {
    if (!runningAction(Ephemeral) && !runningAction(Perennial) && forte1() <= 0) revokeCurrent(BUDDING_MODE);
  },
  display: () => `Camellya: Sweet Dream +${frozenStacks()-1} Buds`,
});

/** A stack per full 10 Pistils a Sweet-Dream-listed hit consumes (counted from the 100 top)
 *  outside Budding Mode, capped at 10. Empty buff — Ephemeral consumes every held stack and it
 *  just decides how many of Budding Mode's own 11 stacks get granted. */
const CRIMSON_BUD = new Buff({
  name: "Camellya: Crimson Bud", maxStacks: 10, duration: 60 * 15,
});

/** Ephemeral's mark on the next Twining (OutroEphemeral spends it). */
const TWINING = new Buff({ name: "Camellya: Twining" });
/** Seedbed (Inherent Skill): +15% Havoc DMG Bonus flat — genuinely unconditional. */
const SEEDBED = new Inherent({
  name: "Inherent: Seedbed",
  stats: [[Stat.DmgBonus, 15, Attribute.Havoc]],
});

/** Epiphyte (Inherent Skill): +15% Basic DMG Bonus flat (interruption-resistance half not modelled). */
const EPIPHYTE = new Inherent({
  name: "Inherent: Epiphyte",
  stats: [[Stat.DmgBonus, 15, Type.Basic]],
});

/** Granted and spent at the end of every action that consumes Crimson Pistils (a negative
 *  forte1 delta), same one-shot-per-qualifying-action shape as Brant's own Trial by Fire and
 *  Tide. Carries Vegetative Universe's own two effects: Crimson Pistil consumption (banked into
 *  Concerto Energy + Crimson Bud gain, per full 10 Pistils *this hit's own* consumption takes
 *  from the 100 top, not a flat 1-per-hit rate) and the Energy Regen Multiplier. */
const CONSUME_CRIMSON_PISTIL = new Buff({
  name: "Camellya: Consume Crimson Pistil", maxStacks: 11,
  // one stack for the consumption itself, one more per full 10 it took — those pay 4 Concerto
  // apiece on the cast that grants them (CAMELLYA_RESONATOR's updateBuffs)
  applyStats: () => {
    addStat(Stat.EnergyRegenMult, isHeld(BUDDING_MODE) ? -100 : 150);
  },
  afterAction: () => revokeCurrent(CONSUME_CRIMSON_PISTIL),
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CAMELLYA_TALENTS = new Talent({
  name: "Camellya: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritDmg, 16]],
});

const CAMELLYA_RESONATOR = new Resonator({
  name: "Camellya",
  matrix: matrix("Camellya", 25),
  talent: CAMELLYA_TALENTS,
  inherent1: SEEDBED,
  inherent2: EPIPHYTE,
  element: Attribute.Havoc,
  weapon: WeaponType.Sword,
  tuneBreak: tuneBreak(89, [0, 91], [0, 70], SWORD_BREAK),
  color: "#891c2b",
  intro: Intro,
  maxEnergy: 12500,
  forteScale: [0.01, 1, 1, 1, 1],
  maxForte1: 10000,

  // any gauge-spending cast of hers is a Crimson Pistil consumption, counted as the cast spends it
  updateBuffs: () => {
    const spent = currentAction().forte1;
    if (spent >= 0) return;
    const before = forte1();
    // a bud per full 10 *consumed* from the 100 top — the first lands at 90 or less, so a
    // 100 -> 95 hit grants nothing (floor-of-forte would count crossing 100's own decade)
    const buds = Math.max(0, Math.floor((10000 - Math.max(0, before + spent)) / 1000) - Math.floor((10000 - before) / 1000));
    if (buds > 0 && !isHeld(BUDDING_MODE)) applyCurrent(CRIMSON_BUD, buds);
    applyCurrent(CONSUME_CRIMSON_PISTIL, 1 + buds);
    if (buds > 0) addToCast({ concerto: 400 * buds });
  },

  stats: [[Stat.BaseHp, 10325], [Stat.BaseAtk, 450], [Stat.BaseDef, 1161.109]],
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: +28% Crit. DMG for 18s off Everblooming — until her Outro. The interrupt immunity is no stat. */
const SOMEWHERE_NO_ONE_TRAVELLED = new Buff({
  name: "Camellya S1: Somewhere No One Travelled",
  duration: 60 * 18,
  stats: [[Stat.CritDmg, 28]],
});
const CM_S1 = new Sequence({
  name: "Camellya S1: Somewhere No One Travelled",
  grants: [{ on: onAction(Intro), buff: SOMEWHERE_NO_ONE_TRAVELLED }],
});

/** S2: Ephemeral at x2.2 of its multiplier — nanoka's second row (2777.38% against 1262.45%), so
 *  multiplicative — and Perennial with it, being 100% of Ephemeral's DMG. */
const CM_S2 = new Sequence({
  name: "Camellya S2: Calling Upon the Silent Rose",
  applyStats: () => { if (runningAction(Ephemeral) || runningAction(Perennial)) addStat(Stat.MulMv, 120); },
});

/** S3: Fervor Efflorescent at x1.5 (row 1804.21% against 1202.81%, multiplicative); the +58% ATK
 *  in Budding Mode is paid by Sweet Dream itself. */
const CM_S3 = new Sequence({
  name: "Camellya S3: A Bud Adorned by Thorns",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 50); },
});

/** S4: +25% Basic Attack DMG Bonus to the team off Everblooming, 30s — permanent. */
const ROOTS_SET_DEEP = new Buff({
  name: "Camellya S4: Roots Set Deep In Eternity",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 25, Type.Basic]],
});
const CM_S4 = new Sequence({
  name: "Camellya S4: Roots Set Deep In Eternity",
  grants: [{ on: onAction(Intro), buff: ROOTS_SET_DEEP, to: BuffTarget.Team }],
});

/** S5: Everblooming at x4.03 (row 801.21%) and Twining at x1.68 (row 553.11%) — both multiplicative. */
const CM_S5 = new Sequence({
  name: "Camellya S5: Infinity Held in Your Palm",
  applyStats: () => {
    if (runningAction(Intro)) addStat(Stat.MulMv, 303);
    if (runningAction(Outro) || runningAction(OutroEphemeral)) addStat(Stat.MulMv, 68);
  },
});

/** S6: Sweet Dream's flat 50% becomes 200% (read off this node by Sweet Dream itself), and
 *  Perennial — the extra cast the S6 rotation makes. */
const CM_S6 = new Sequence({ name: "Camellya S6: Bloom For You Thousand Times Over" });

const CM_SEQUENCES = [CM_S1, CM_S2, CM_S3, CM_S4, CM_S5, CM_S6];

/* ---------------------------------------------------------------------------------- rotation */

// a kit-valid line: Intro, the Burgeoning chain, Crimson Blossom opens Blossom Mode, the Vining
// Waltz chain (with the Blazing Waltz insert) into Floral Ravage closes it, Ephemeral spends the
// fresh Concerto and opens Budding Mode, Liberation, Outro. She's never the team's own lead, so
// this covers both opener and loop.

const VW1234 = new ActionGroup("Basic - Vining Waltz 123H4", [VW1, VW2, VW3, BlazingWaltz, VW4]);

const CM_ROTATION_16s = new Rotation([
  INTRO, CrimsonBlossom.cancel(), ECHO.instaDodge(), VW1234, 
  Liberation, VW1, Ephemeral, VW1234,
  FloralRavage.instaSwap(), OutroResolver,
]);
const CM_ROTATION_16s_S6 = new Rotation([
  INTRO, CrimsonBlossom.cancel(), ECHO, VW1234, 
  Liberation, VW1, Ephemeral, VW1234,
  FloralRavage, Perennial.instaSwap(),
]);

const CM_ROTATION_DOUBLE = new Rotation([
  DOUBLE_INTRO, CrimsonBlossom.cancel(), ECHO,
  HA, BA4, FloralRavage.instaSwap(),

  INTRO, 
  Liberation, Ephemeral, CrimsonBlossom.cancel(),
  VW1234, FloralRavage, ECHO.instaSwap(),
  OutroResolver,
]);
const CM_ROTATION_DOUBLE_FAST_SUP = new Rotation([
  DOUBLE_INTRO, CrimsonBlossom.cancel(), ECHO,
  HA, BA4, FloralRavage.instaSwap(),

  INTRO, 
  Liberation, Ephemeral, CrimsonBlossom.cancel(),
  VW1234, ECHO.instaDodge(), VW1234, FloralRavage, ECHO.instaSwap(),
  OutroResolver,
]);
const CM_ROTATION_DOUBLE_S6 = new Rotation([
  DOUBLE_INTRO, CrimsonBlossom.cancel(), ECHO,
  HA, BA4, FloralRavage.instaSwap(),
  
  INTRO, 
  Liberation, Ephemeral, CrimsonBlossom.cancel(),
  VW1234, ECHO.instaDodge(), VW1, Perennial, VW1234, FloralRavage,
  OutroResolver,
]);


/* ----------------------------------------------------------------------------------- loadout */


// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const CAMELLYA_DOUBLE_ALWAYS = new Loadout({
  resonator: CAMELLYA_RESONATOR,
  weapons: [RED_SPRING, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  rotation: { 0: CM_ROTATION_DOUBLE_FAST_SUP, 6: CM_ROTATION_DOUBLE_S6 },
  sequences: CM_SEQUENCES,
});

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const CAMELLYA_DOUBLE_123S6 = new Loadout({
  resonator: CAMELLYA_RESONATOR,
  weapons: [RED_SPRING, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  rotation: { 0: CM_ROTATION_DOUBLE, 6: CM_ROTATION_16s_S6 },
  sequences: CM_SEQUENCES,
});


// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const CAMELLYA_123_ALWAYS_OUTRO = new Loadout({
  resonator: CAMELLYA_RESONATOR,
  weapons: [RED_SPRING, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Liberation),
  rotation: { 0: CM_ROTATION_16s },
  sequences: CM_SEQUENCES,
});
