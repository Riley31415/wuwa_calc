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
 *   team Tune Break Boost, she responds to Strain the way Lynae/Mornye do (TUNE_STRAIN_RESPONDER), and
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
import { Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling, LifeTime } from "../../engine/stats.js";
import { Buff, Talent, Inherent, ResonanceMode, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  typeOverride,
  addBuff,
  addStat,
  appliedByMember,
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
} from "../../engine/context.js";
import { Action, Rotation, NOINTRO, INTRO, ECHO_SWAP, OUTRO, JUMP, ActionGroup, DODGE, ActionField } from "../../engine/rotation.js";
import { applied, applyEnemy } from "../../engine/context.js";
import { coordinatedBuff } from "../../shared/helpers.js";
import { FUSION_BURST, FUSION_BURST_ACTIONS } from "../../shared/status.js";
import { ENEMY_MAX_OFFTUNE, TUNE_STRAIN_SHIFTING } from "../../shared/tunebreak.js";
import { applyStrain, TUNE_STRAIN_INTERFERED, TUNE_STRAIN_RESPONDER } from "../../shared/tunebreak.js";
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
const BA1 = deniaAction("Basic - Stagecraft Form 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 32.69, energy: 0.69, concerto: 1.37, offtune: 2192, forte1: 4 });
const BA2 = deniaAction("Basic - Stagecraft Form 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 60.36, energy: 1.28, concerto: 2.54, offtune: 4048, forte1: 8 });
const BA3 = deniaAction("Basic - Stagecraft Form 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 76.47, energy: 1.62, concerto: 3.21, offtune: 5130, forte1: 9 });
const BA4 = deniaAction("Basic - Stagecraft Form 4", { cutscene: true,node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 128, energy: 0.69, concerto: 5.37, offtune: 8584, forte1: 30 });
const HA = deniaAction("Heavy - Stagecraft Form", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 161.52, energy: 3.40, concerto: 6.78, offtune: 10832, forte1: 20 });
const MA = deniaAction("Mid-air - Stagecraft Form", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.97, energy: 1.55, concerto: 3.10, offtune: 4960, forte1: 10 });
const DC = deniaAction("Dodge Counter - Stagecraft Form 3", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 148.05, energy: 3.12, concerto: 16.21, offtune: 5130, forte1: 18 });

// --- Breakdown Form: Basic Attack DMG, banking Conformal Charge (forte2). Each also declares the
//     Void Particle (forte1) it spends when she holds any — the sheet's own figures, declared here
//     rather than on the buff so the gauge shows the spend, and how far past 0 it runs. The mid-air
//     chain shares every number with the ground one, so it shares these — bar its own dodge
//     counter, which is its own action below.
const UBA1 = deniaAction("Basic - Breakdown Form 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 36.51, energy: 0.77, concerto: 1.53, offtune: 2448, forte1: -18, forte2: 3 });
const UBA2 = deniaAction("Basic - Breakdown Form 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 93.79, energy: 1.99, concerto: 3.94, offtune: 6292, forte1: -46, forte2: 12 });
const UBA3 = deniaAction("Basic - Breakdown Form 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 62.39, energy: 1.31, concerto: 2.62, offtune: 4184, forte1: -30, forte2: 6 });
const UBA4 = deniaAction("Basic - Breakdown Form 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 118.46, energy: 2.49, concerto: 4.97, offtune: 7945, forte1: -58, forte2: 11 });
const UHA = deniaAction("Heavy - Breakdown Form", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 137.06, energy: 2.88, concerto: 5.75, offtune: 9192, forte1: -66, forte2: 13 });
const UMHA = deniaAction("Heavy - Breakdown Form (Mid-Air)", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 73.97, energy: 1.55, concerto: 3.10, offtune: 4960, forte1: -37, forte2: 7 });
// Both Breakdown dodge counters *are* Stage 3: ground and mid-air alike carry every one of UBA3's
// values (wuwalab's own "Stage 3 (Dodge Counter)" / "Stage 3 (Mid-Air Dodge Counter)"), plus the
// hidden +10 Concerto every dodge counter carries (CLAUDE.md). Kept as two actions even though
// nothing separates them, so a rotation still says which one it played — the same reason the
// mid-air chain has its own entries above. nanoka has a single 108.08% "Dodge Counter - Breakdown
// Form" row instead, matching neither.
const UDC = deniaAction("Dodge Counter - Breakdown Form 3", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 62.39, energy: 1.31, concerto: 12.62, offtune: 4184, forte1: -30, forte2: 6 });
const UMDC = deniaAction("Dodge Counter - Breakdown Form 3 (Mid-Air)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 62.39, energy: 1.31, concerto: 12.62, offtune: 4184, forte1: -30, forte2: 6 });

// --- Resonance Skill: Phantom Bubble in Stagecraft (its 24.4 Concerto is what makes her loop),
//     Beckon in Breakdown, or Banish in its place while a Dark Core is held. Stage 2 spends every
//     core for +150% of its base multiplier apiece (see BANISH_CORES) and is Liberation DMG.
const Skill = deniaAction("Skill - Phantom Bubble", { cutscene: true,node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 104.51, energy: 0.22, concerto: 24.40, offtune: 7008, forte1: 25 });
const Beckon = deniaAction("Skill - Beckon", { cutscene: true,node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 103.70, energy: 2.21, concerto: 4.36, offtune: 6956, forte2: 13 });
const Banish1 = deniaAction("Skill - Banish 1", { cutscene: true,node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 104.04, energy: 2.19, concerto: 4.38, offtune: 6978 });
const Banish2 = deniaAction("Skill - Banish 2", { cutscene: true,node: Node.Skill, cast: Cast.Skill, type: Type1.Liberation, mv: 112.01, energy: 2.35, concerto: 14.70, offtune: 7512, forte2: 40 });

// --- Final Act. Stagecraft spends the Energy bar (125); Breakdown spends the full Conformal
//     Charge and every Void Particle instead (zeroed in DENIA_RESONATOR's update — "all", not a fixed
//     delta), and drops the Erosion Field: a 136.33% Liberation pull every 4s for 30s — seven
//     ticks, one every five active presses by anyone (EROSION_FIELD below), each its own cast to
//     the modes below.
const Lib1 = deniaAction("Liberation - Final Act (Stagecraft)", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Liberation, mv: 397.62,
  concerto: 20, offtune: 48000, resetEnergy: true, 
  updateBuffs: () => { 
    revokeCurrent(ENTROPY_STAGECRAFT); applyCurrent(ENTROPY_BREAKDOWN);
  },
});
/** Spends every Void Particle and all the Conformal Charge, and shifts back to Stagecraft. */
const Lib2 = deniaAction("Liberation - Final Act (Breakdown)", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Liberation, mv: 795.24, energy: 30,
  concerto: 20, offtune: 52528, resetForte1: true, forte2: -100,
  updateBuffs: () => {
    revokeCurrent(ENTROPY_BREAKDOWN);
    applyCurrent(ENTROPY_STAGECRAFT);
    // only one field of hers at a time: a fresh cast starts the clock over
    const field = isHeld(DN_S4) ? EROSION_FIELD_S4 : EROSION_FIELD;
    revokeTeam(field);
    applyTeam(field, isHeld(DN_S4) ? 30 : 35);
  },
});
/** Her field, and the one pull of it — the pair sits together the way a status ladder sits with
 *  its own gear (shared/status.ts): EROSION_FIELD below is the window standing, and granting that
 *  is what the report reads as her dropping the field. */
const EROSION = new ActionField("Denia: Erosion Field");
const ErosionField = deniaAction("Forte - Erosion Field", {
  node: Node.Forte, type: Type1.Liberation, mv: 136.33, field: EROSION,
});

// --- Intros, one per form. Both bank a Dark Core and 25 Void Particle.
const Intro = deniaAction("Intro - It's Been A While!", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 104.62, energy: 10, concerto: 10, offtune: 7016, forte1: 25,
  updateBuffs: () => applyCurrent(DARK_CORE),
});
// Knock Knock is the Breakdown-form Intro, so it shifts form as well as banking its own Dark Core
const EIntro = deniaAction("Intro - Knock Knock", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 155.22, energy: 10.02, concerto: 10, offtune: 10410, forte1: 25,
  updateBuffs: () => {
    revokeCurrent(ENTROPY_STAGECRAFT);
    applyCurrent(ENTROPY_BREAKDOWN);
    applyCurrent(DARK_CORE); 
  },
});
// mutually exclusive: Burst amplifies the team's Fusion Burst, Strain hands off to the incoming
const Outro = deniaAction("Outro - Unfinished Lies", {
  cast: Cast.Outro, concerto: -100, swapOut: true,
  updateBuffs: () => {
    if (isHeld(MODE_BURST)) applyTeam(UNFINISHED_LIES_BURST, 1);
    else queueOutro(UNFINISHED_LIES_STRAIN);
  }
});

/* ------------------------------------------------------------------------------------- modes */

/** The casts on both modes' lists: the intros, both Final Acts and every field tick inflict 2
 *  Fusion Burst (or one Tune Strain - Shifting); the Stage 3/4 basics — the Breakdown dodge
 *  counters are Stage 3 — inflict 1 (or the same Shifting). */
const inflictsTwo = (): boolean => runningAction(Intro) || runningAction(EIntro) || runningAction(Lib1) || runningAction(Lib2) || runningAction(ErosionField);
const inflictsOne = (): boolean => runningAction(BA3) || runningAction(BA4) || runningAction(UBA3) || runningAction(UBA4) || runningAction(UDC) || runningAction(UMDC);

/** A loadout equips exactly one; each puts its own thing on the target from updateDebuffs(), so
 *  gear reacting to it (Chromatic Foam, her weapon, Reel of Spliced Memories, the Strain outro)
 *  reads `applied()` the same action. Fusion Burst detonates itself once the target is at the cap
 *  (statuses.ts), so nothing here has to fire its damage.
 *  Strain also responds to Strain, and the team's first Shifting fills half the off-tune bar. */
const MODE_BURST = new ResonanceMode({
  name: "Resonance Mode - Fusion Burst",
  updateDebuffs: () => {
    if (inflictsTwo()) applyEnemy(FUSION_BURST, 2);
    else if (inflictsOne()) applyEnemy(FUSION_BURST, 1);
  },
});
const MODE_STRAIN = new ResonanceMode({
  name: "Resonance Mode - Tune Strain",

  // Shattered Hours: "while Denia is in the team", whichever mode
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1); applyCurrent(TUNE_STRAIN_RESPONDER, 1);
    applyTeam(OFFTUNE_SURGE, 1);
  },
  updateDebuffs: () => { if (inflictsTwo() || inflictsOne()) applyStrain(); },
});

/** Strain mode's one-shot: the team's first Tune Strain - Shifting raises the target's Off-Tune
 *  Level by half the bar flat (DirectOfftune, so no buildup rate scales it), once a fight. Team-wide rather than hers: a team
 *  buff's applyStats() runs on whoever is acting, so whichever member's Shifting cast comes first pays
 *  it out on their own action (a locally-held buff only ever sees Denia's turns). Spent as it fires. */
const OFFTUNE_SURGE = new Buff({
  name: "Resonance Mode - Tune Strain",
  // S2 takes the same one-shot to the whole bar
  applyStats: () => {
    if (!applied(TUNE_STRAIN_SHIFTING)) return;
    addStat(Stat.DirectOfftune, ENEMY_MAX_OFFTUNE / 2);
    // S2 takes the opening surge from half the bar to the whole — the other half is its own
    if (isHeld(DN_S2)) asSource(DN_S2, () => addStat(Stat.DirectOfftune, ENEMY_MAX_OFFTUNE / 2));
  },
  convertStats: () => { if (applied(TUNE_STRAIN_SHIFTING)) revokeTeam(OFFTUNE_SURGE); },
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
const spendsVoid = (a: Action): boolean => a.forte1 < 0 && a.forte2 > 0;

/** Entropy Shift: Breakdown Form — +30% ATK for 12s, granted by Final Act - Stagecraft and Knock
 *  Knock. Replaced outright by Final Act - Breakdown's own Stagecraft shift (see DENIA_RESONATOR's update),
 *  and short enough to come off after her outro otherwise. */
const ENTROPY_BREAKDOWN = new Buff({
  name: "Entropy Shift: Breakdown Form",
  stats: [[Stat.BonusAtk, 30]],

  // the retag has to land in the first phase, before anything reads the type (see typeOverride)
  updateDebuffs: () => { if (spendsVoid(currentAction()) && forte1() > 0) typeOverride(Type1.Liberation); },

  applyStats: () => {
    // S3 has Final Act - Breakdown hand back 30 Concerto; S6's own standing pair is on its node
    if (isHeld(DN_S3) && runningAction(Lib2)) asSource(DN_S3, () => addStat(Stat.AddConcerto, 30));

    const a = currentAction();
    if (!spendsVoid(a) || forte1() <= 0) return;
    addStat(Stat.MulMv, 50);
    addStat(Stat.AddForte2, a.forte2);
  },
  until: LifeTime.Outro,
});

/** Erosion Field: 30s from Final Act - Breakdown, pulling every 4s — on this clockless engine
 *  thirty-five active, non-triggered presses by anyone on the team, one tick every fifth of them,
 *  seven in all. The same window every other field is (shared/helpers.ts): team-held so it counts
 *  everyone's turns, ticking onto her own slot whoever is on field, and gone with the last of them. */
const EROSION_FIELD = coordinatedBuff("Denia: Erosion Field", 35, () => DENIA_RESONATOR, ErosionField, { every: 5 });
/** The same field on S4's own 3s interval: ten pulls across the 30s rather than seven, counted the
 *  only way this engine can count them — one every third press, over the thirty that fit. */
const EROSION_FIELD_S4 = coordinatedBuff("Denia: Erosion Field", 30, () => DENIA_RESONATOR, ErosionField, { every: 3 });

/** Entropy Shift: Stagecraft Form — 30s from Final Act - Breakdown, so it bridges to the next
 *  loop. Its 1 Void Particle/s and its Dark Core are both banked on her outro: the time she is off
 *  field, taken as 20 of the engine's seconds. */
const ENTROPY_STAGECRAFT = new Buff({
  name: "Entropy Shift: Stagecraft Form",
  // S3 takes its regen to 4 Void Particle a second, so the same off-field window banks four times as much
  // the shift's own Dark Core keeps coming while she is off field too: one across that window at
  // the kit's 12s, three at S3's 6s
  updateBuffs: () => {
    if (!casting(Cast.Outro)) return;
    applyCurrent(DARK_CORE, isHeld(DN_S3) ? 4 : 2);
  },
  applyStats: () => {
    if (!casting(Cast.Outro)) return;
    addStat(Stat.AddForte1, 20);
    // S3 takes the regen to 4 a second, so the same off-field window banks 60 more
    if (isHeld(DN_S3)) asSource(DN_S3, () => addStat(Stat.AddForte1, 60));
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
  applyStats: () => {
    if (runningAction(Banish2)) {
      addStat(Stat.MulMv, 150 * frozenStacks()),
      revokeCurrent(DARK_CORE);
    }
  }
});

/** Unfinished Lies (Outro), Fusion Burst mode: Fusion Burst DMG against targets near the active
 *  resonator is amplified 60% for 30s — team-wide, permanent uptime. Scoped to Type2.FusionBurst,
 *  which is what every Fusion Burst rung carries (status.ts), and the one amplification a dot reads. */
const UNFINISHED_LIES_BURST = new Buff({
  name: "Denia: Outro (burst)",
  stats: [[Stat.Amp, 60, Type2.FusionBurst]],
});

/** Unfinished Lies, Tune Strain mode: the incoming resonator's All DMG is amplified 15% for 16s —
 *  40% instead once they inflict a Tune Strain - Shifting of their own (applied during a cast of
 *  theirs), stack 2 being that upgraded state — and lost the moment they switch out. */
const UNFINISHED_LIES_STRAIN = new Buff({
  name: "Denia: Outro (strain)", maxStacks: 2,
  display: () => (frozenStacks() === 2 ? "Denia: Outro (shifting)" : "Denia: Outro (strain)"),
  updateBuffs: () => {
    if (applied(TUNE_STRAIN_SHIFTING)) applyCurrent(UNFINISHED_LIES_STRAIN, 1);
  },
  applyStats: () => addStat(Stat.Amp, frozenStacks() === 2 ? 40 : 15),
  until: LifeTime.Swap,
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
  stats: [[Stat.DmgBonus, 50, Attribute.Fusion]], until: LifeTime.AfterSwap,
});
/** Degenerate Voidmatter (S2): a stack every time a Fusion Burst calculates around the team, 10 at
 *  most, each 1% of the target's Fusion RES ignored. Hers alone, so it goes with her outro. */
const DEGENERATE_VOIDMATTER = new Buff({
  name: "Denia S2: Degenerate Voidmatter", maxStacks: 10,
  stats: [[Stat.ResIgnore, 1, Attribute.Fusion]], perStack: true, until: LifeTime.Outro,
});
/** The Tune Strain half: +20 Tune Break Boost to whoever lays a Shifting, 15s. */
const TIDES_STRAIN = new Buff({
  name: "Denia S2: Tossed in the Tides of Reality (strain)",
  stats: [[Stat.Tbb, 20]], until: LifeTime.AfterSwap,
});
/** S2: the mode's own handout above, and Banish at x1.4 — nanoka's second Stage 2 ladder
 *  (392.04/627.26/862.48/1097.70/1332.92% against 280.03/448.04/616.06/784.07/952.09), so
 *  multiplicative, and over the Dark Core ladder rather than under it. */
const DN_S2 = new Sequence({
  name: "Denia S2: Tossed in the Tides of Reality",
  // from updateGlobal "me" is Denia, so the acting slot has to be named (status.ts)
  updateGlobal: () => {
    const acting = currentTeam().slot;
    if (!isHeld(MODE_BURST)) {
      if (acting.resonator && appliedByMember(TUNE_STRAIN_SHIFTING, acting)) addBuff(acting.resonator, TIDES_STRAIN, 1);
      return;
    }
    if (acting.resonator && appliedByMember(FUSION_BURST, acting)) addBuff(acting.resonator, TIDES_BURST, 1);
    if (isType(Type2.FusionBurst)) applyCurrent(DEGENERATE_VOIDMATTER, 1);
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
  // the retag has to land in the first phase, before anything reads the type (see typeOverride)
  updateDebuffs: () => {
    if ((runningAction(BA4) || runningAction(Skill)) && stacksOf(DARK_CORE) >= 5) typeOverride(Type1.Liberation);
  },
  applyStats: () => {
    // the 30 Concerto is paid here rather than on the shift the node enhances: Final Act -
    // Breakdown revokes that shift in its own updateBuffs, a phase ahead of every stat
    if (runningAction(Lib2)) {
      addStat(Stat.MulMv, 80);
      addStat(Stat.AddConcerto, 30);
    }
    if ((runningAction(BA4) || runningAction(Skill)) && stacksOf(DARK_CORE) >= 5) {
      addStat(Stat.AddMv, 1200);
      revokeCurrent(DARK_CORE);
    }
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
    if (isHeld(MODE_BURST) && isType(Type2.FusionBurst) && erosionStanding()) addStat(Stat.MulMv, 200);
    if (!isHeld(ENTROPY_BREAKDOWN) && !isHeld(ENTROPY_STAGECRAFT)) return;
    addStat(Stat.BonusAtk, 60);
    addStat(Stat.DmgBonus, 60, Attribute.Fusion);
  },
  updateBuffs: () => {
    if (!isHeld(MODE_BURST) || !runningAction(ErosionField)) return;
    queue(FUSION_BURST_ACTIONS[currentTeam().enemyMax(FUSION_BURST)]!);
  },
  updateGlobal: () => {
    if (isHeld(MODE_BURST) || currentAction().type1 !== Type1.Break) return;
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
  intro: () => stacksOf(ENTROPY_BREAKDOWN) ? EIntro : Intro,
  outro: () => Outro,
  color: "#ecabe3",
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 100,

  stats: [
    [Stat.BaseHp, 11025], [Stat.BaseAtk, 425], [Stat.BaseDef, 1148.89],
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
  NOINTRO, BA4, Skill, Lib1,
  UBA12, JUMP, UBA1234, 
  USkill12, Lib2, 
  ECHO_SWAP, OUTRO,

  INTRO, BA4, Skill, Lib1,
  UBA1234, 
  USkill12, Lib2, 
  ECHO_SWAP, OUTRO,
]);

const DN_ROTATION_BURST_S3 = new Rotation([
  NOINTRO,
  INTRO, Lib1,
  UBA1234, 
  Lib2, 
  ECHO_SWAP, OUTRO,
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
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.Er, Substat.FlatAtk),
  rotation: { 0: DN_ROTATION_BURST, 3: DN_ROTATION_BURST_S3 },
  sequences: DN_SEQUENCES,
  mode: MODE_BURST,
});

const DN_ROTATION_STRAIN = new Rotation([
  NOINTRO, Skill, Lib1,
  UBA12, DODGE, UBA12, JUMP, UBA12,
  USkill12, Lib2,
  ECHO_SWAP, OUTRO,

  INTRO, BA4, Skill, Lib1,
  UBA12, JUMP, UBA12,
  USkill12, Lib2,
  ECHO_SWAP, OUTRO,
]);

const DN_ROTATION_STRAIN_S3 = new Rotation([
  NOINTRO,
  INTRO, Lib1,
  UBA12, JUMP, UBA12, USkill12,
  Lib2,
  ECHO_SWAP, OUTRO,
]);

export const DENIA_STRAIN = new Loadout({
  resonator: DENIA_RESONATOR,
  weapons: [FORGED_DWARF_STAR, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER],
  echoLoadouts: [
    new EchoLoadout(VOIDWING_MOTH, REEL_5PC),
    new EchoLoadout(HYVATIA, NEONLIGHT_LEAP_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.Er, Substat.FlatAtk),
  rotation: { 0: DN_ROTATION_STRAIN, 3: DN_ROTATION_STRAIN_S3 },
  sequences: DN_SEQUENCES,
  mode: MODE_STRAIN,
});
