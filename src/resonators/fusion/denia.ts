/**
 * Denia, ported to the new engine — a Fusion Rectifier sub-DPS/support, the third kit built on
 * the Tune Break variants (see tunebreak.ts) and the first on Fusion Burst.
 *
 * She is a two-form, two-mode resonator. The *forms* are her own state machine, which the
 * rotation walks: Stagecraft Form (the default; Normal Attacks bank Void Particle) and Breakdown
 * Form (Normal Attacks spend Void Particle to become Resonance Liberation DMG at x1.5, and bank
 * Conformal Charge). Final Act - Stagecraft flips her into Breakdown and grants Entropy Shift:
 * Breakdown Form (+30% ATK, 12s); Final Act - Breakdown spends the full Conformal Charge, flips
 * her back, grants Entropy Shift: Stagecraft Form (30s) and drops the Erosion Field (7 Liberation
 * ticks over 30s). Banish is the enhanced Breakdown skill, its Stage 2 scaling with the Dark
 * Cores it spends.
 *
 * The *modes* are `ResonanceMode` gear, one loadout each, the Lynae/Lucilla shape:
 * - **Fusion Burst**: her listed casts inflict Fusion Burst (2 stacks off the intros, both
 *   liberations and the field; 1 off the Stage 3/4 basics), Etched Colors hands the team +30%
 *   Fusion DMG Bonus while an Entropy Shift is up, and her Outro amplifies Fusion Burst DMG 60%
 *   around the active resonator.
 * - **Tune Strain**: the same casts lay Tune Strain - Shifting instead, Etched Colors hands the
 *   team Tune Break Boost, she responds to Strain the way Lynae/Mornye do (see `strainPayout`), and
 *   her Outro is a 15%/40% All DMG Amp handoff.
 *
 * Gauges: Void Particle is forte1 (0-100) and Conformal Charge forte2 (0-100); Dark Cores are an
 * ordinary stacking buff (DARK_CORE), which is what lets S3 raise their ceiling. Per-cast gains are declared on the actions; the Void Particle spend and the Liberation
 * retag ride the VOID_PARTICLE buff (evaluate.ts's typeOverride) rather than a second set of actions
 * — nanoka's enhanced rows are the plain ones at x1.5 MV with identical energy/concerto/off-tune.
 * Only Dark Cores are read back (Banish Stage 2's multiplier). An Entropy Shift's own time-based
 * regen — 1 Void Particle a second, a Dark Core every 12s — is banked on her Outro instead, over
 * the stretch she spends off field, taken as 20 of the engine's seconds; the Dark Core each Final
 * Act stands for is the one that interval yields while she is on it.
 *
 * Fusion Burst DMG is the status's own ladder (status.ts): it calculates at the target's cap and
 * clears — or, beside Aemeath's Fusion Burst mode, past 5 stacks at the cap's rung (aemeath.ts) —
 * and reads only Fusion-Burst-scoped amplification, which is what her Outro hands the team.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1211, read the way CLAUDE.md
 * describes — the page is client-rendered, so from the 3.6+365 static JSON it fetches) at skill
 * level 10. Per-cast Void Particle/Conformal Charge amounts are the migrated sheet's own, since
 * nanoka only names which casts grant them.
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, ResonanceMode, Resonator, Loadout, EchoLoadout, Sequence, coordinatedBuff } from "../../engine/gear.js";
import {
  asSource,
  typeOverride,
  addBuff,
  addStat,
  appliedByMember,
  appliedByMe,
  onApplied,
  currentTeam,
  isType,
  queue,
  removeStack,
  stacksOfEnemy,
  applyCurrent,
  applyTeam,
  casting,
  currentAction,
  runningAction,
  isHeld,
  maxStackIncrease,
  queueOutro,
  revokeCurrent as revokeCurrent,
  revokeTeam,
  frozenStacks,
  forte1,
  setForte1,
  getStat,
  forte2,
  stacksOf,
  stacksOfTeam,
  addToCast,
  runningBullet,
} from "../../engine/context.js";
import { Action, Cooldown, Rotation, NOINTRO, ECHO, ActionGroup, ActionField, INTRO } from "../../engine/rotation.js";
import { applied, applyEnemy } from "../../engine/context.js";
import { FUSION_BURST, FUSION_BURST_ACTIONS } from "../../shared/status.js";
import { ENEMY_MAX_OFFTUNE, TUNE_STRAIN_SHIFTING } from "../../shared/tunebreak.js";
import { applyStrain, TUNE_STRAIN_INTERFERED, strainPayout } from "../../shared/tunebreak.js";
import { FORGED_DWARF_STAR, STRINGMASTER } from "../../weapons/rectifier.js";
import { COSMIC_RIPPLES, NEW_STD_RECTIFIER } from "../../weapons/standard.js";
import {
  TRICKSTER, CHROMATIC_FOAM_5PC, VOIDWING_MOTH, REEL_5PC,
  HYVATIA,
  NEONLIGHT_LEAP_5PC,
  TRAILBLAZING_STAR_5PC,
  SIGILLUM,
} from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { CLAWPRINT_5PC, LIONESS_OF_GLORY } from "../../echoes/septimont.js";

/* ----------------------------------------------------------------------------------- actions */

function deniaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// --- Stagecraft Form. Normal Attacks bank Void Particle (forte1). Dodge Counter carries the
//     hidden +10 Concerto every dodge counter gets (CLAUDE.md).
const BA1 = deniaAction("Basic - Stagecraft Form 1", { animFrames: 16, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 9, commitFrame: 3, mv: 3269, energy: 69, concerto: 137, offtune: 2192, forte1: 4 }]});
const BA2 = deniaAction("Basic - Stagecraft Form 2", { animFrames: 33, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, commitFrame: 4, mv: 3018, energy: 64, concerto: 127, offtune: 2024, forte1: 4 },
    { hitFrame: 24, commitFrame: 4, mv: 3018, energy: 64, concerto: 127, offtune: 2024, forte1: 4 },
  ]});
const BA3 = deniaAction("Basic - Stagecraft Form 3", { animFrames: 38, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 20, commitFrame: 4, mv: 2549, energy: 54, concerto: 107, offtune: 1710, forte1: 3, updateDebuffs: () => deniaLays(1) },
    { hitFrame: 29, commitFrame: 4, mv: 2549, energy: 54, concerto: 107, offtune: 1710, forte1: 3 },
    { hitFrame: 38, commitFrame: 4, mv: 2549, energy: 54, concerto: 107, offtune: 1710, forte1: 3 },
  ]});
const BA4 = deniaAction("Basic - Stagecraft Form 4", { animFrames: 57, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 18, commitFrame: 0, mv: 12800, energy: 69, concerto: 537, offtune: 8584, forte1: 30, updateDebuffs: () => deniaLays(1) }]});
const HA = deniaAction("Heavy - Stagecraft Form", { animFrames: 94, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 42, mv: 8076, energy: 170, concerto: 339, offtune: 5416, forte1: 10 },
    { hitFrame: 54, commitFrame: 42, mv: 8076, energy: 170, concerto: 339, offtune: 5416, forte1: 10 },
  ]});
const MA = deniaAction("Mid-air - Stagecraft Form Plunge", { animFrames: 41, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 22, mv: 2959, energy: 62, concerto: 124, offtune: 1984, forte1: 4 },
    { hitFrame: 37, mv: 4438, energy: 93, concerto: 186, offtune: 2976, forte1: 6 },
  ]});
const DC = deniaAction("Dodge Counter - Stagecraft Form 3", { animFrames: 38, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 20, commitFrame: 4, mv: 4935, energy: 104, concerto: 207, offtune: 1710, forte1: 6 },
    { hitFrame: 29, commitFrame: 4, mv: 4935, energy: 104, concerto: 207, offtune: 1710, forte1: 6 },
    { hitFrame: 38, commitFrame: 4, mv: 4935, energy: 104, concerto: 207, offtune: 1710, forte1: 6 },
  ], castConcerto: 1000});

// --- Breakdown Form: Basic Attack DMG, banking Conformal Charge (forte2). Each also declares the
//     Void Particle (forte1) it spends when she holds any — the sheet's own figures, declared here
//     rather than on the buff so the gauge shows the spend, and how far past 0 it runs. The mid-air
//     chain shares every number with the ground one, so it shares these — bar its own dodge
//     counter, which is its own action below.
const UBA1 = deniaAction("Basic - Breakdown Form 1", { animFrames: 21, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 13, mv: 3651, energy: 77, concerto: 153, offtune: 2448, forte2: 3 }], castForte1: -18});
const UBA2 = deniaAction("Basic - Breakdown Form 2", { animFrames: 52, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 3751, energy: 79, concerto: 158, offtune: 2516, forte2: 4 },
    { hitFrame: 26, commitFrame: 14, mv: 1407, energy: 30, concerto: 59, offtune: 944, forte2: 2 },
    { hitFrame: 32, commitFrame: 14, mv: 1407, energy: 30, concerto: 59, offtune: 944, forte2: 2 },
    { hitFrame: 38, commitFrame: 14, mv: 1407, energy: 30, concerto: 59, offtune: 944, forte2: 2 },
    { hitFrame: 44, commitFrame: 14, mv: 1407, energy: 30, concerto: 59, offtune: 944, forte2: 2 },
  ], castForte1: -46});
const UBA3 = deniaAction("Basic - Breakdown Form 3", { animFrames: 36, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 23, mv: 6239, energy: 131, concerto: 262, offtune: 4184, forte2: 6, updateDebuffs: () => deniaLays(1) }], castForte1: -30});
const UBA4 = deniaAction("Basic - Breakdown Form 4", { animFrames: 63, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 3554, energy: 75, concerto: 149, offtune: 2384, updateDebuffs: () => deniaLays(1), forte2: 3 },
    { hitFrame: 36, commitFrame: 30, mv: 8292, energy: 174, concerto: 348, offtune: 5561, forte2: 8 },
  ], castForte1: -58});
const UHA = deniaAction("Heavy - Breakdown Form", { animFrames: 74, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 63, mv: 13706, energy: 288, concerto: 575, offtune: 9192, forte2: 13 }], castForte1: -66});
const UMHA = deniaAction("Heavy - Breakdown Form (Mid-Air)", { animFrames: 48, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 22, mv: 2959, energy: 62, concerto: 124, offtune: 1984, forte2: 3 },
    { hitFrame: 34, mv: 4438, energy: 93, concerto: 186, offtune: 2976, forte2: 4 },
  ], castForte1: -37});
// Both Breakdown dodge counters *are* Stage 3: ground and mid-air alike carry every one of UBA3's
// values (wuwalab's own "Stage 3 (Dodge Counter)" / "Stage 3 (Mid-Air Dodge Counter)"), plus the
// hidden +10 Concerto every dodge counter carries (CLAUDE.md). Kept as two actions even though
// nothing separates them, so a rotation still says which one it played — the same reason the
// mid-air chain has its own entries above. nanoka has a single 108.08% "Dodge Counter - Breakdown
// Form" row instead, matching neither.
const UDC = deniaAction("Dodge Counter - Breakdown Form 3", { animFrames: 36, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 23, mv: 6239, energy: 131, concerto: 262, offtune: 4184, forte2: 6, updateDebuffs: () => deniaLays(1) }], castForte1: -30, castConcerto: 1000});
const UMDC = deniaAction("Dodge Counter - Breakdown Form 3 (Mid-Air)", { animFrames: 36, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 23, mv: 6239, energy: 131, concerto: 262, offtune: 4184, forte2: 6, updateDebuffs: () => deniaLays(1) }], castForte1: -30, castConcerto: 1000});

// --- Resonance Skill: Phantom Bubble in Stagecraft (its 24.4 Concerto is what makes her loop),
//     Beckon in Breakdown, or Banish in its place while a Dark Core is held. Stage 2 spends every
//     core for +150% of its base multiplier apiece (see BANISH_CORES) and is Liberation DMG.
const Skill = deniaAction("Skill - Phantom Bubble", { animFrames: 64, cooldown: 60 * 20, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 5, mv: 1742, energy: 4, concerto: 407, offtune: 1168 },
    { hitFrame: 14, commitFrame: 5, mv: 1742, energy: 4, concerto: 407, offtune: 1168 },
    { hitFrame: 23, commitFrame: 5, mv: 1742, energy: 4, concerto: 407, offtune: 1168 },
    { hitFrame: 32, commitFrame: 5, mv: 5225, energy: 10, concerto: 1219, offtune: 3504 },
  ], castForte1: 25});
/** Beckon and Banish draw on one 4s cooldown. */
const BECKON_CD = new Cooldown({ frames: 60 * 4 });
const Beckon = deniaAction("Skill - Beckon", { animFrames: 60, cooldown: BECKON_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 0, mv: 3110, energy: 66, concerto: 131, offtune: 2086, forte2: 3 },
    { hitFrame: 9, commitFrame: 0, mv: 1452, energy: 31, concerto: 61, offtune: 974, forte2: 2 },
    { hitFrame: 24, commitFrame: 0, mv: 1452, energy: 31, concerto: 61, offtune: 974, forte2: 2 },
    { hitFrame: 39, commitFrame: 0, mv: 1452, energy: 31, concerto: 61, offtune: 974, forte2: 2 },
    { hitFrame: 54, commitFrame: 0, mv: 1452, energy: 31, concerto: 61, offtune: 974, forte2: 2 },
    { hitFrame: 69, commitFrame: 0, mv: 1452, energy: 31, concerto: 61, offtune: 974, forte2: 2 },
  ]});
const Banish1 = deniaAction("Skill - Banish 1", { animFrames: 57, cooldown: BECKON_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 28, commitFrame: 10, mv: 3468, energy: 73, concerto: 146, offtune: 2326 },
    { hitFrame: 35, commitFrame: 10, mv: 3468, energy: 73, concerto: 146, offtune: 2326 },
    { hitFrame: 42, commitFrame: 10, mv: 3468, energy: 73, concerto: 146, offtune: 2326 },
  ]});
const Banish2 = deniaAction("Skill - Banish 2", { animFrames: 71, cooldown: 30, node: Node.Skill, cast: Cast.Skill, type: Type.Liberation, bullets: [{ hitFrame: 23, commitFrame: 0, mv: 11201, energy: 235, concerto: 1470, offtune: 7512 }], castForte2: 40});

// --- Final Act. Stagecraft spends the Energy bar (125); Breakdown spends the full Conformal
//     Charge and every Void Particle instead (zeroed in DENIA_RESONATOR's update — "all", not a fixed
//     delta), and drops the Erosion Field: a 136.33% Liberation pull as it lands and every 4s of
//     its 30s after — eight in all (wuwalab's hit count), the first queued straight off the cast
//     and the rest one every four active presses by anyone (EROSION_FIELD below), each its own
//     cast to the modes below.
const Lib1 = deniaAction("Liberation - Final Act (Stagecraft)", {
  animFrames: 259, timestop: 251, motionStop: 251, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 257, mv: 39762, offtune: 48000, updateDebuffs: () => deniaLays(2) }],
  castConcerto: 2000, resetEnergy: true, 
  updateBuffs: () => { 
    revokeCurrent(ENTROPY_STAGECRAFT); applyCurrent(ENTROPY_BREAKDOWN);
  },
});
/** Spends every Void Particle and all the Conformal Charge, and shifts back to Stagecraft. */
const Lib2 = deniaAction("Liberation - Final Act (Breakdown)", { minForte2: 100,
  animFrames: 171, timestop: 131, motionStop: 131, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    {
      hitFrame: 104, mv: 19881, energy: 750, offtune: 13132,
      // the field pulls as the Final Act lands, its first pull queued off the hit
      updateDebuffs: () => {
        deniaLays(2);
        queue(ErosionField);
      },
    },
    { hitFrame: 111, mv: 19881, energy: 750, offtune: 13132 },
    { hitFrame: 118, mv: 19881, energy: 750, offtune: 13132 },
    { hitFrame: 125, mv: 19881, energy: 750, offtune: 13132 },
  ],
  castConcerto: 2000, resetForte1: true,
  // the Breakdown shift's +30% ATK pays into this cast: the shift takes itself off next action
  updateBuffs: () => {
    applyCurrent(ENTROPY_STAGECRAFT);
    // only one field of hers at a time: a fresh cast starts the clock over
    const field = isHeld(DN_S4) ? EROSION_FIELD_S4 : EROSION_FIELD;
    revokeTeam(field);
    applyTeam(field, field.maxStacks);
  }, resetForte2: true
});
/** Her field, and the one pull of it — the pair sits together the way a status ladder sits with
 *  its own gear (shared/status.ts): EROSION_FIELD below is the window standing, and granting that
 *  is what the report reads as her dropping the field. */
const EROSION = new ActionField("Denia: Erosion Field");
const ErosionField = deniaAction("Forte - Erosion Field", {
  node: Node.Forte, type: Type.Liberation, bullets: [{ hitFrame: 0, mv: 13633 }], field: EROSION, updateDebuffs: () => deniaLays(2),
});

// --- Intros, one per form. Both bank a Dark Core and 25 Void Particle.
const Intro = deniaAction("Intro - It's Been A While!", {
  animFrames: 53, prioFrames: 50, motionStop: 42,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 28, mv: 10462, energy: 1000, offtune: 7016, updateDebuffs: () => deniaLays(2) }], castConcerto: 1000, castForte1: 25,
  updateBuffs: () => applyCurrent(DARK_CORE),
});
// Knock Knock is the Breakdown-form Intro, so it shifts form as well as banking its own Dark Core
const EIntro = deniaAction("Intro - Knock Knock", {
  animFrames: 81, prioFrames: 77, motionStop: 39,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 73, mv: 5174, energy: 334, offtune: 3470, updateDebuffs: () => deniaLays(2) },
    { hitFrame: 80, commitFrame: 77, mv: 5174, energy: 334, offtune: 3470 },
    { hitFrame: 87, commitFrame: 77, mv: 5174, energy: 334, offtune: 3470 },
  ], castConcerto: 1000, castForte1: 25,
  updateBuffs: () => {
    revokeCurrent(ENTROPY_STAGECRAFT);
    applyCurrent(ENTROPY_BREAKDOWN);
    applyCurrent(DARK_CORE); 
  },
});
// mutually exclusive: Burst amplifies the team's Fusion Burst, Strain hands off to the incoming
const Outro = deniaAction("Outro - Unfinished Lies", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => {
    if (isHeld(MODE_BURST)) applyTeam(UNFINISHED_LIES_BURST, 1);
    else queueOutro(UNFINISHED_LIES_STRAIN);
  }
});

/* ------------------------------------------------------------------------------------- modes */

/** What the casts on both modes' lists lay, on their first hit: the intros, both Final Acts and
 *  every field tick `n` = 2 Fusion Burst, the Stage 3/4 basics (the Breakdown dodge counters are
 *  Stage 3) 1 — or, in Strain mode, one Tune Strain - Shifting. */
function deniaLays(n: number): void {
  if (isHeld(MODE_BURST)) applyEnemy(FUSION_BURST, n);
  else if (isHeld(MODE_STRAIN)) applyStrain();
}

/** A loadout equips exactly one; each puts its own thing on the target from `deniaLays()`, so
 *  gear reacting to it (Chromatic Foam, her weapon, Reel of Spliced Memories, the Strain outro)
 *  reads `applied()` the same action. Fusion Burst detonates itself once the target is at the cap
 *  (statuses.ts), so nothing here has to fire its damage.
 *  Strain also responds to Strain, and the team's first Shifting fills half the off-tune bar. */
/** This kit's own carrier for the Tune Strain payout (tunebreak.ts's `strainPayout`). */
const DE_STRAIN_PAYOUT = strainPayout();

const MODE_BURST = new ResonanceMode({
  name: "Resonance Mode - Fusion Burst",
});
const MODE_STRAIN = new ResonanceMode({
  name: "Resonance Mode - Tune Strain",

  // Shattered Hours: "while Denia is in the team", whichever mode
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1); applyCurrent(DE_STRAIN_PAYOUT, 1);
    applyTeam(OFFTUNE_SURGE, 1);
  },
});

/** Strain mode's one-shot: the team's first Tune Strain - Shifting raises the target's Off-Tune
 *  Level by half the bar flat (DirectOfftune, so no buildup rate scales it), once a fight. Team-wide rather than hers: a team
 *  buff's applyStats() runs on whoever is acting, so whichever member's Shifting cast comes first pays
 *  it out on their own action (a locally-held buff only ever sees Denia's turns). Spent once the hit that fires it is in. */
const OFFTUNE_SURGE = new Buff({
  name: "Resonance Mode - Tune Strain",
  // S2 takes the same one-shot to the whole bar
  applyStats: () => {
    if (!applied(TUNE_STRAIN_SHIFTING)) return;
    addStat(Stat.DirectOfftune, ENEMY_MAX_OFFTUNE / 2);
    // S2 takes the opening surge from half the bar to the whole — the other half is its own
    if (isHeld(DN_S2)) asSource(DN_S2, () => addStat(Stat.DirectOfftune, ENEMY_MAX_OFFTUNE / 2));
  },
  afterHit: () => { if (applied(TUNE_STRAIN_SHIFTING)) revokeTeam(OFFTUNE_SURGE); },
});

/* ------------------------------------------------------------------------------------- buffs */

/** Breakdown Form holding Void Particle: each Normal Attack (whose own declared forte1 is the
 *  spend) is Resonance Liberation DMG at x1.5 the plain multiplier and banks Conformal Charge
 *  twice over — the retag through typeOverride (first phase of the action, so Forged Dwarf Star's
 *  Liberation bonus, the liberation substats and every isType() check all see it), the x1.5 as
 *  MulMv, and the double Charge as a second copy of whatever Charge the action itself declares.
 *  A Breakdown attack is recognised by its own gauges — it spends Void Particle and banks Charge —
 *  so nothing here lists them; the dodge counter is Stage 3 and carries Stage 3's, so it enhances
 *  like any other. Held from Final Act - Stagecraft (which opens Breakdown Form) until
 *  Final Act - Breakdown spends everything and flips her back. */
const pressed = (): Action => currentAction().formOf ?? currentAction();
/** On a queued hit the press's own cast has already paid its Void Particle, so it is added back. */
const spendsVoid = (): boolean => {
  const a = pressed();
  const paid = currentAction().half === "hit" ? a.castForte[0]! : 0;
  return a.forte1 < 0 && a.forte2 > 0 && forte1() - paid > 0;
};

/** Entropy Shift: Breakdown Form — +30% ATK for 12s, granted by Final Act - Stagecraft and Knock
 *  Knock. Replaced by Final Act - Breakdown's own Stagecraft shift — after that cast rather than
 *  in it, so the ATK still pays into the Final Act that ends it — and short enough to come off
 *  after her outro otherwise. */
const ENTROPY_BREAKDOWN = new Buff({
  name: "Entropy Shift: Breakdown Form",
  duration: 60 * 12,
  stats: [[Stat.BonusAtk, 30]],

  // the retag has to land in the first phase, before anything reads the type (see typeOverride)
  updateDebuffs: () => { if (spendsVoid()) typeOverride(Type.Liberation); },

  // S3 has Final Act - Breakdown hand back 30 Concerto; S6's own standing pair is on its node
  updateBuffs: () => {
    if (isHeld(ENTROPY_STAGECRAFT) && !runningAction(Lib2)) revokeCurrent(ENTROPY_BREAKDOWN);
    if (isHeld(DN_S3) && runningAction(Lib2)) asSource(DN_S3, () => addToCast({ concerto: 3000 }));
  },
  applyStats: () => {
    if (!spendsVoid()) return;
    addStat(Stat.MulMv, 50);
    addStat(Stat.AddForte2, currentAction().forte2 - currentAction().castForte[1]!);
  },
});

/** Erosion Field: 30s from Final Act - Breakdown, pulling every 4s — on this clockless engine
 *  thirty active, non-triggered presses by anyone on the team, one tick every fourth of them,
 *  seven in all. The same window every other field is (gear.ts's `coordinatedBuff`): team-held so it counts
 *  everyone's turns, ticking onto her own slot whoever is on field, and gone with the last of them. */
const EROSION_FIELD = coordinatedBuff("Denia: Erosion Field", 30, () => DENIA_RESONATOR, ErosionField, { every: 4 });
/** The same field on S4's own 3s interval: ten pulls across the 30s rather than seven, counted the
 *  only way this engine can count them — one every third press, over the thirty that fit. */
const EROSION_FIELD_S4 = coordinatedBuff("Denia: Erosion Field", 30, () => DENIA_RESONATOR, ErosionField, { every: 3 });

/** Entropy Shift: Stagecraft Form — 30s from Final Act - Breakdown, so it bridges to the next
 *  loop. Its 1 Void Particle/s and its Dark Core are both banked on her outro: the time she is off
 *  field, taken as 20 of the engine's seconds. */
const ENTROPY_STAGECRAFT = new Buff({
  name: "Entropy Shift: Stagecraft Form",
  duration: 60 * 30,
  // S3 takes its regen to 4 Void Particle a second, so the same off-field window banks four times as much
  // the shift's own Dark Core keeps coming while she is off field too: one across that window at
  // the kit's 12s, three at S3's 6s
  updateBuffs: () => {
    if (!casting(Cast.Outro)) return;
    applyCurrent(DARK_CORE, isHeld(DN_S3) ? 4 : 2);
    addToCast({ forte1: 20 });
    // S3 takes the regen to 4 a second, so the same off-field window banks 60 more
    if (isHeld(DN_S3)) asSource(DN_S3, () => addToCast({ forte1: 60 }));
  },
});


/** Etched Colors (Inherent Skill): while either Entropy Shift is up, the whole team gets the
 *  mode's payout. Granted as the first shift lands and never revoked: from then on she is always
 *  in one — the Stagecraft shift's 30s bridges every loop to the next Final Act. One buff a mode,
 *  because a team buff's applyStats() runs on whoever's acting and can't ask isHeld() which mode
 *  Denia holds — DN_INHERENT_2's own updateBuffs() picks. */
const ETCHED_COLORS_BURST = new Buff({
  name: "Inherent: Etched Colors (burst)",
  stats: [[Stat.DmgBonus, 30, Attribute.Fusion]],
});

/** +10 Tune Break Boost, plus 8 per 10% of each resonator's own Off-Tune Buildup Rate past 100%
 *  up to 40 — taken at the cap per CLAUDE.md's own-stats rule (a Syntony Field alone clears it).
 *  The real stat, so the Strain payout and the damage formula's own tbbFactor both see it. */
const ETCHED_COLORS_STRAIN = new Buff({
  name: "Inherent: Etched Colors (strain)",
  convertStats: () => {
    addStat(Stat.Tbb, 10 + Math.min(40, Math.max(0, 8 * (getStat(Stat.OfftuneBuildup) - 100) / 10)));
  },
});

/** Etched Colors — the grant; the payout is the two team buffs above. Either cast that starts an
 *  Entropy Shift is the moment it comes up. */
const DN_INHERENT_2 = new Inherent({
  name: "Inherent: Etched Colors",
  updateBuffs: () => {
    if (runningAction(Lib1) || runningAction(EIntro)) applyTeam(isHeld(MODE_BURST) ? ETCHED_COLORS_BURST : ETCHED_COLORS_STRAIN, 1);
  },
});

/** Banish Stage 2 spends every Dark Core held for +150% of its base multiplier apiece — read off
 *  the gauge before the cast's own -3 lands (deltas bank once the action has resolved). */
const DARK_CORE = new Buff({
  name: "Denia: Dark Core", maxStacks: 5,
  // declared at S3's own five and held down to three without it — a local buff's cap can't be
  // raised the way an enemy debuff's can (context.ts's own maxStackIncrease)
  updateBuffs: () => {
    const over = stacksOf(DARK_CORE) - (isHeld(DN_S3) ? 5 : 3);
    if (over > 0) removeStack(DARK_CORE, over);
  },
  applyStats: () => { if (runningAction(Banish2)) addStat(Stat.MulMv, 150 * frozenStacks()); },
  afterAction: () => { if (runningAction(Banish2)) revokeCurrent(DARK_CORE); },
});

/** Unfinished Lies (Outro), Fusion Burst mode: Fusion Burst DMG against targets near the active
 *  resonator is amplified 60% for 30s — team-wide, permanent uptime. Scoped to Subtype.FusionBurst,
 *  which is what every Fusion Burst rung carries (status.ts), and the one amplification a dot reads. */
const UNFINISHED_LIES_BURST = new Buff({
  name: "Denia: Outro (burst)",
  duration: 60 * 30,
  stats: [[Stat.Amp, 60, Subtype.FusionBurst]],
});

/** Unfinished Lies, Tune Strain mode: the incoming resonator's All DMG is amplified 15% for 16s —
 *  40% instead once they inflict a Tune Strain - Shifting of their own (applied during a cast of
 *  theirs), the second buff being that upgraded state, which replaces the first — and lost the
 *  moment they switch out. */
const UNFINISHED_LIES_STRAIN: Buff = new Buff({
  name: "Denia: Outro (strain)", duration: 60 * 16,
  stats: [[Stat.Amp, 15]],
  updateBuffs: () => {
    // handed to a holder already upgraded, it is that upgrade refreshed
    if (!isHeld(UNFINISHED_LIES_SHIFTING)) return;
    revokeCurrent(UNFINISHED_LIES_STRAIN);
    applyCurrent(UNFINISHED_LIES_SHIFTING, 1);
  },
  // the holder's own Shifting upgrades it on the hit that lays it
  hitGlobal: () => {
    if (!appliedByMe(TUNE_STRAIN_SHIFTING)) return;
    revokeCurrent(UNFINISHED_LIES_STRAIN);
    applyCurrent(UNFINISHED_LIES_SHIFTING, 1);
  },
  lostOnSwap: true,
});
const UNFINISHED_LIES_SHIFTING: Buff = new Buff({
  name: "Denia: Outro (shifting)", duration: 60 * 16,
  stats: [[Stat.Amp, 40]],
  grants: [{ on: onApplied(TUNE_STRAIN_SHIFTING) }],
  lostOnSwap: true,
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: +30% Crit. DMG, and she enters the fight already in an Entropy Shift — Stagecraft, the form
 *  her loop always starts in. The interrupt immunity is no stat. */
const DN_S1 = new Sequence({
  name: "Denia S1: Silent Glows in a Dimlit Dream",
  stats: [[Stat.CritDmg, 30]],
  combatStart: () => applyCurrent(ENTROPY_STAGECRAFT, 1),
});

/** Tossed in the Tides (S2), Fusion Burst: +50% Fusion DMG Bonus to whoever on the team lays a
 *  Fusion Burst, 15s — hers holds for her window, a teammate's goes with their swap-out. */
const TIDES_BURST = new Buff({
  name: "Denia S2: Tossed in the Tides of Reality (burst)",
  duration: 60 * 15,
  stats: [[Stat.DmgBonus, 50, Attribute.Fusion]],
});
/** Degenerate Voidmatter (S2): a stack every time a Fusion Burst calculates around the team, 10 at
 *  most, each 1% of the target's Fusion RES ignored. Hers alone, so it goes with her outro. */
const DEGENERATE_VOIDMATTER = new Buff({
  name: "Denia S2: Degenerate Voidmatter", maxStacks: 10, duration: 60 * 15,
  stats: [[Stat.ResIgnore, 1, Attribute.Fusion]], perStack: true,
});
/** The Tune Strain half: +20 Tune Break Boost to whoever lays a Shifting, 15s. */
const TIDES_STRAIN = new Buff({
  name: "Denia S2: Tossed in the Tides of Reality (strain)",
  duration: 60 * 15,
  stats: [[Stat.Tbb, 20]],
});
/** S2: the mode's own handout above, and Banish at x1.4 — nanoka's second Stage 2 ladder
 *  (392.04/627.26/862.48/1097.70/1332.92% against 280.03/448.04/616.06/784.07/952.09), so
 *  multiplicative, and over the Dark Core ladder rather than under it. */
const DN_S2 = new Sequence({
  name: "Denia S2: Tossed in the Tides of Reality",
  // from hitGlobal "me" is Denia, so the acting slot has to be named (status.ts)
  hitGlobal: () => {
    const acting = currentTeam().slot;
    if (!isHeld(MODE_BURST)) {
      if (acting.resonator && appliedByMember(TUNE_STRAIN_SHIFTING, acting)) addBuff(acting.resonator, TIDES_STRAIN, 1);
      return;
    }
    if (acting.resonator && appliedByMember(FUSION_BURST, acting)) addBuff(acting.resonator, TIDES_BURST, 1);
    if (isType(Subtype.FusionBurst)) applyCurrent(DEGENERATE_VOIDMATTER, 1);
  },
  applyStats: () => { if (runningAction(Banish1) || runningAction(Banish2)) addStat(Stat.MulMv, 40); },
});

/** S3: Final Act - Breakdown at x1.8 (row 357.86% against its own 198.81% a hit, multiplicative);
 *  five Dark Cores and a full Void Particle bar from the moment the fight opens; and at the cap,
 *  Stage 4 or Phantom Bubble spends the lot for a flat +1200% of multiplier as Resonance
 *  Liberation DMG — additive, which nanoka's own variant rows say outright (1328.00% against
 *  128.00%, and 217.42%*3+652.25% against 17.42%*3+52.25%). The two Entropy Shift enhancements are
 *  paid by the shifts themselves. */
const DN_S3 = new Sequence({
  name: "Denia S3: Through Dark and Wind, the Erlking Follows",
  combatStart: () => { applyCurrent(DARK_CORE, 5); setForte1(100); },
  // the 30 Concerto is paid here rather than on the shift the node enhances: Final Act -
  // Breakdown revokes that shift in its own updateBuffs
  updateBuffs: () => {
    if (runningAction(Lib2)) addToCast({ concerto: 3000 });
  },
  // the retag has to land in the first phase, before anything reads the type (see typeOverride)
  updateDebuffs: () => {
    if ((runningAction(BA4) || runningAction(Skill)) && stacksOf(DARK_CORE) >= 5) typeOverride(Type.Liberation);
  },
  applyStats: () => {
    if (runningAction(Lib2)) addStat(Stat.MulMv, 80);
    if ((runningBullet(BA4, -1) || runningBullet(Skill, -1)) && stacksOf(DARK_CORE) >= 5) addStat(Stat.AddMv, 120000);
  },
  // the lot is spent once that press runs out, so every hit of it pays
  afterAction: () => {
    if ((runningAction(BA4) || runningAction(Skill)) && stacksOf(DARK_CORE) >= 5) revokeCurrent(DARK_CORE);
  },
});

/** S4: the Erosion Field pulls every 3s rather than every 4s — the field itself, granted by Final
 *  Act - Breakdown above. */
const DN_S4 = new Sequence({ name: "Denia S4: From the Far Beyond, to the Far Beyond" });

/** S5: Final Act - Stagecraft deals 100% more. "DMG", not "DMG Multiplier", and nanoka carries no
 *  second row for it — so a damage bonus rather than a multiplier. */
const DN_S5 = new Sequence({
  name: "Denia S5: If Lies Patch Up a Heart",
  applyStats: () => { if (runningAction(Lib1)) addStat(Stat.DmgBonus, 100); },
});

/** Whether the Erosion Field she drops is standing — what Final Act - Breakdown leaves behind, and
 *  the window S6's own burst answers to. */
const erosionStanding = (): boolean => stacksOfTeam(EROSION_FIELD) > 0 || stacksOfTeam(EROSION_FIELD_S4) > 0;

/** S6: +60% ATK and +60% Fusion DMG Bonus in either Entropy Shift; in Fusion Burst, every pull of
 *  her Erosion Field calculates a Fusion Burst at the target's cap without taking the stacks, at
 *  +200% of its multiplier; and in Tune Strain a stack of Interfered off every Tune Break the team
 *  lands on a Shifting target. */
const DN_S6 = new Sequence({
  name: "Denia S6: May You Find Your Sun in the Silence",
  // +60% ATK and +60% Fusion DMG Bonus for as long as either Entropy Shift stands — both are hers,
  // and this hook runs on her turns alone, which is what "while in Entropy Shift states" asks
  applyStats: () => {
    if (isHeld(MODE_BURST) && isType(Subtype.FusionBurst) && erosionStanding()) addStat(Stat.MulMv, 200);
    if (!isHeld(ENTROPY_BREAKDOWN) && !isHeld(ENTROPY_STAGECRAFT)) return;
    addStat(Stat.BonusAtk, 60);
    addStat(Stat.DmgBonus, 60, Attribute.Fusion);
  },
  updateBuffs: () => {
    if (!isHeld(MODE_BURST) || !runningAction(ErosionField)) return;
    queue(FUSION_BURST_ACTIONS[currentTeam().enemyMax(FUSION_BURST)]!);
  },
  hitGlobal: () => {
    if (isHeld(MODE_BURST) || !isType(Type.Break)) return;
    if (stacksOfEnemy(TUNE_STRAIN_SHIFTING) > 0) applyEnemy(TUNE_STRAIN_INTERFERED, 1);
  },
});

const DN_SEQUENCES = [DN_S1, DN_S2, DN_S3, DN_S4, DN_S5, DN_S6];

/* --------------------------------------------------------------------------- kit and loadout */

const DN_INHERENT_1 = new Inherent({
  name: "Inherent: Vestiges of Falsehood",
  combatStart: () => {
    applyCurrent(DARK_CORE, 2);
    setForte1(20);
  },
});

const DENIA_TALENTS = new Talent({
  name: "Denia: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritDmg, 16]],
});

const DENIA_RESONATOR = new Resonator({
  name: "Denia",
  talent: DENIA_TALENTS,
  inherent1: DN_INHERENT_1,
  inherent2: DN_INHERENT_2,
  element: Attribute.Fusion,
  weapon: WeaponType.Rectifier,
  // Final Act - Breakdown always closes her loop back in Stagecraft Form, so It's Been A While!
  // is the Intro she enters with; Knock Knock (the Breakdown-form one) is kept for completeness
  color: "#ecabe3",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  intro: new Action("Intro Resolver", { cast: Cast.Intro, resolve: () => stacksOf(ENTROPY_BREAKDOWN) ? EIntro : Intro }),
  maxEnergy: 12500,
  maxForte1: 100,
  maxForte2: 100,

  stats: [
    [Stat.BaseHp, 11025], [Stat.BaseAtk, 425], [Stat.BaseDef, 1148.8868],
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    [Stat.Tbb, 10],
  ],
});

/* ---------------------------------------------------------------------------------- rotation */

/** The migrated sheet's own "denia intro" line: It's Been A While! into its Stage 4 follow-up,
 *  Phantom Bubble, Final Act - Stagecraft to flip into Breakdown, two Void Particle Basic 1-2
 *  pairs, Banish on all three cores, Final Act - Breakdown (which drops the Erosion Field), the
 *  echo and out. Both opener and loop — Final Act - Breakdown leaves her in Stagecraft Form, where
 *  the next loop's Intro picks up. */
const UBA1234 = new ActionGroup("Basic - Breakdown Form 1234", [UBA1, UBA2, UBA3, UBA4]);
const UBA12 = new ActionGroup("Basic - Breakdown Form 12", [UBA1, UBA2]);
const USkill12 = new ActionGroup("Skill - Banish 12", [Banish1, Banish2]);

const DN_ROTATION_BURST = new Rotation([
  NOINTRO, Skill.instaCancel(), Lib1,
  UBA12.jumpCancel(), UBA1234.cancel(), 
  USkill12.instaCancel(), Lib2, 
  ECHO.instaSwap(), Outro,

  INTRO, BA4.instaCancel(), Skill.instaCancel(), Lib1,
  UBA1234.cancel(), 
  USkill12.instaCancel(), Lib2, 
  ECHO.instaSwap(), Outro,
]);

const DN_ROTATION_BURST_S3 = new Rotation([
  NOINTRO,
  INTRO, Lib1,
  UBA1234.cancel(), 
  USkill12.instaCancel(), Lib2,
  ECHO.instaSwap(), Outro,
]);

/** One loadout per Resonance Mode, each with the echo set built for it: Trickster + Chromatic Foam
 *  rides Fusion Burst (the set triggers off the Burst she inflicts), Voidwing Moth + Reel of
 *  Spliced Memories rides Tune Strain (off her own Shifting). */
export const DENIA_BURST = new Loadout({
  resonator: DENIA_RESONATOR,
  weapons: [FORGED_DWARF_STAR, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER],
  echoLoadouts: [
    new EchoLoadout(TRICKSTER, CHROMATIC_FOAM_5PC),
    new EchoLoadout(LIONESS_OF_GLORY, CLAWPRINT_5PC),
    new EchoLoadout(SIGILLUM, TRAILBLAZING_STAR_5PC), 
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Basic),
  rotation: { 0: DN_ROTATION_BURST, 3: DN_ROTATION_BURST_S3 },
  sequences: DN_SEQUENCES,
  mode: MODE_BURST,
});

const DN_ROTATION_STRAIN = new Rotation([
  NOINTRO, Skill.instaCancel(), Lib1,
  UBA12.dodgeCancel(), UBA12.jumpCancel(), UBA12.cancel(),
  USkill12.instaCancel(), Lib2,
  ECHO.instaSwap(), Outro,

  INTRO, BA4.instaCancel(), Skill.instaCancel(), Lib1,
  UBA12.jumpCancel(), UBA12.cancel(),
  USkill12.instaCancel(), Lib2,
  ECHO.instaSwap(), Outro,
]);

const DN_ROTATION_STRAIN_S3 = new Rotation([
  NOINTRO,
  INTRO, Lib1,
  UBA12.jumpCancel(), UBA12.cancel(),
  USkill12.instaCancel(), Lib2,
  ECHO.instaSwap(), Outro,
]);

export const DENIA_STRAIN = new Loadout({
  resonator: DENIA_RESONATOR,
  weapons: [FORGED_DWARF_STAR, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER],
  echoLoadouts: [
    new EchoLoadout(VOIDWING_MOTH, REEL_5PC),
    new EchoLoadout(HYVATIA, NEONLIGHT_LEAP_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  rotation: { 0: DN_ROTATION_STRAIN, 3: DN_ROTATION_STRAIN_S3 },
  sequences: DN_SEQUENCES,
  mode: MODE_STRAIN,
});
