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
 *   team Tune Break Boost, she responds to Strain the way Lynae/Mornye do (tuneStrainBonus), and
 *   her Outro is a 15%/40% All DMG Amp handoff.
 *
 * Gauges: Void Particle is forte1 (0-100), Conformal Charge forte2 (0-100), Dark Cores forte3
 * (0-3). Per-cast gains are declared on the actions; the Void Particle spend and the Liberation
 * retag ride the VOID_PARTICLE buff (kit.ts's typeOverride) rather than a second set of actions
 * — nanoka's enhanced rows are the plain ones at x1.5 MV with identical energy/concerto/off-tune.
 * Only Dark Cores are read back (Banish Stage 2's multiplier). Time-based regen (an Entropy Shift's 1 Void Particle/s and 1 Dark
 * Core/12s) has nowhere to go in an engine with no clock and isn't modelled — the kit-valid loop
 * reaches three cores through Vestiges of Falsehood plus her Intro regardless.
 *
 * Fusion Burst DMG itself (the status's own damage) has no engine model yet, so everything scoped
 * to `Type2.FusionBurst` here is inert until it does — the same standing as Lucilla's Montage
 * (chafe). Her casts still inflict it, which is what Chromatic Foam and her
 * own weapon react to.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1211, read the way CLAUDE.md
 * describes — the page is client-rendered, so from the 3.6+365 static JSON it fetches) at skill
 * level 10. Per-cast Void Particle/Conformal Charge amounts are the migrated sheet's own, since
 * nanoka only names which casts grant them.
 */
import {
  typeOverride, Buff, Talent, Inherent, ResonanceMode, Resonator, Loadout, EchoLoadout, Action, Stat, Attribute,
  WeaponType, Type1, Type2, Cast, Node, Scaling, addStat, applyCurrent, applyTeam, casting, currentAction, isHeld,
  maxStackIncrease, queue, queueOutro, revokeCurrent as revokeCurrent, revokeTeam, frozenStacks, lostOnSwap, forte1,
  forte3, setForte1, setForte2, setForte3, getStat, forte2,
  stacksOf,
  addForte2,
  addForte1,
} from "../../engine/kit.js";
import { Rotation, START_COMBAT, OPENER, INTRO, ECHO_CAST, OUTRO_NEXT, START_COMBAT_NON_OPENER } from "../../engine/rotation.js";
import { applied, applyEnemy } from "../../engine/kit.js";
import { FUSION_BURST } from "../../shared/status.js";
import { ENEMY_MAX_OFFTUNE, TUNE_STRAIN_SHIFTING } from "../../shared/tunebreak.js";
import { applyStrain, TUNE_STRAIN_INTERFERED, tuneStrainBonus } from "../../shared/tunebreak.js";
import { FORGED_DWARF_STAR, STRINGMASTER } from "../../weapons/rectifier.js";
import { COSMIC_RIPPLES, NEW_STD_RECTIFIER } from "../../weapons/standard.js";
import {
  TRICKSTER, CHROMATIC_FOAM_5PC, CHROMATIC_FOAM_2PC, VOIDWING_MOTH, REEL_5PC, REEL_2PC,
  HYVATIA,
  NEONLIGHT_LEAP_5PC,
  NEONLIGHT_LEAP_2PC,
  TRAILBLAZING_STAR_5PC,
  TRAILBLAZING_STAR_2PC,
  NEBULOUS_CANNON,
} from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { CLAWPRINT_2PC, CLAWPRINT_5PC, LIONESS_OF_GLORY } from "../../echoes/septimont.js";

/* ----------------------------------------------------------------------------------- actions */

function deniaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// --- Stagecraft Form. Normal Attacks bank Void Particle (forte1). Dodge Counter carries the
//     hidden +10 Concerto every dodge counter gets (CLAUDE.md).
const BA1 = deniaAction("Basic - Stagecraft Form 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 32.69, energy: 0.69, concerto: 1.37, offtune: 2192, forte1: 4 });
const BA2 = deniaAction("Basic - Stagecraft Form 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 60.36, energy: 1.28, concerto: 2.54, offtune: 4048, forte1: 8 });
const BA3 = deniaAction("Basic - Stagecraft Form 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 76.47, energy: 1.62, concerto: 3.21, offtune: 5130, forte1: 9 });
const BA4 = deniaAction("Basic - Stagecraft Form 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 128, energy: 0.69, concerto: 5.37, offtune: 8584, forte1: 30 });
const HA = deniaAction("Heavy - Stagecraft Form", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 161.52, energy: 3.40, concerto: 6.78, offtune: 10832, forte1: 20 });
const MA = deniaAction("Basic - Stagecraft Form (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.97, energy: 1.55, concerto: 3.10, offtune: 4960, forte1: 10 });
const DC = deniaAction("Basic - Stagecraft Form 3 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 148.05, energy: 3.12, concerto: 16.21, offtune: 5130, forte1: 18 });

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
const UDC = deniaAction("Basic - Breakdown Form 3 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 62.39, energy: 1.31, concerto: 12.62, offtune: 4184, forte1: -30, forte2: 6 });
const UMDC = deniaAction("Basic - Breakdown Form 3 (Mid-Air Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 62.39, energy: 1.31, concerto: 12.62, offtune: 4184, forte1: -30, forte2: 6 });

// --- Resonance Skill: Phantom Bubble in Stagecraft (its 24.4 Concerto is what makes her loop),
//     Beckon in Breakdown, or Banish in its place while a Dark Core is held. Stage 2 spends every
//     core for +150% of its base multiplier apiece (see BANISH_CORES) and is Liberation DMG.
const Skill = deniaAction("Skill - Phantom Bubble", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 104.51, energy: 0.22, concerto: 24.40, offtune: 7008, forte1: 25 });
const Beckon = deniaAction("Skill - Beckon", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 103.70, energy: 2.21, concerto: 4.36, offtune: 6956, forte2: 13 });
const Banish1 = deniaAction("Skill - Banish 1", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 104.04, energy: 2.19, concerto: 4.38, offtune: 6978 });
const Banish2 = deniaAction("Skill - Banish 2", { node: Node.Skill, cast: Cast.Skill, type: Type1.Liberation, mv: 112.01, energy: 2.35, concerto: 14.70, offtune: 7512, forte2: 40 });

// --- Final Act. Stagecraft spends the Energy bar (125); Breakdown spends the full Conformal
//     Charge and every Void Particle instead (zeroed in DENIA's update — "all", not a fixed
//     delta), and drops the Erosion Field: seven 136.33% Liberation ticks over its 30s, lumped
//     like Jué's Blessing of Time and queued off the cast.
// the Breakdown shift replaces the Stagecraft one as it lands, and the field comes with it
// (`applySelf(DARK_CORE)` assumes the 12s have passed)
const TO_BREAKDOWN = {
  updateBuffs: () => { revokeCurrent(ENTROPY_STAGECRAFT); applyCurrent(ENTROPY_BREAKDOWN); applyCurrent(DARK_CORE, 1); },
};
const Lib1 = deniaAction("Liberation - Final Act (Stagecraft)", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 397.62,
  concerto: 20, offtune: 48000, resetEnergy: true, ...TO_BREAKDOWN,
});
/** Spends every Void Particle and all the Conformal Charge, and shifts back to Stagecraft. */
const Lib2 = deniaAction("Liberation - Final Act (Breakdown)", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 795.24, energy: 30,
  concerto: 20, offtune: 52528, forte2: -100, 
  updateBuffs: () => {
    addForte1(-forte1());
    if (forte2() > 100) setForte2(100);
    revokeCurrent(ENTROPY_BREAKDOWN);
    applyCurrent(ENTROPY_STAGECRAFT);
    applyCurrent(DARK_CORE, 1); // assume 12 seconds has passed
  },
});
const ErosionField = deniaAction("Forte - Erosion Field x6", {
  node: Node.Forte, type: Type1.Liberation, mv: 136.33 * 6, active: false,
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
    applyCurrent(DARK_CORE, 1); // assume 12 seconds has passed
    applyCurrent(DARK_CORE);    // ...plus the one every Intro of hers banks
  },
});
// mutually exclusive: Burst amplifies the team's Fusion Burst, Strain hands off to the incoming
const Outro = deniaAction("Outro - Unfinished Lies", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => {
    queue(ErosionField);
    if (isHeld(MODE_BURST)) applyTeam(UNFINISHED_LIES_BURST, 1);
    else queueOutro(UNFINISHED_LIES_STRAIN);
  }
});

/* ------------------------------------------------------------------------------------- modes */

/** The casts on both modes' lists: the intros, both Final Acts and the field inflict 2 Fusion
 *  Burst (or one Tune Strain - Shifting), the Stage 3/4 basics 1 (or the same Shifting). */
const inflictsTwo = (a: Action): boolean => a === Intro || a === EIntro || a === Lib1 || a === Lib2 || a === ErosionField;
const inflictsOne = (a: Action): boolean => a === BA3 || a === BA4 || a === UBA3 || a === UBA4;

/** A loadout equips exactly one; each puts its own thing on the target from updateDebuffs(), so
 *  gear reacting to it (Chromatic Foam, her weapon, Reel of Spliced Memories, the Strain outro)
 *  reads `applied()` the same action. Fusion Burst detonates itself once the target is at the cap
 *  (statuses.ts), so nothing here has to fire its damage.
 *  Strain also responds to Strain, and the team's first Shifting fills half the off-tune bar. */
const MODE_BURST = new ResonanceMode({
  name: "Denia: Resonance Mode - Fusion Burst",
  updateDebuffs: () => {
    const a = currentAction();
    if (inflictsTwo(a)) applyEnemy(FUSION_BURST, 2);
    else if (inflictsOne(a)) applyEnemy(FUSION_BURST, 1);
  },
});
const MODE_STRAIN = new ResonanceMode({
  name: "Denia: Resonance Mode - Tune Strain",

  // Shattered Hours: "while Denia is in the team", whichever mode
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1);
    applyTeam(OFFTUNE_SURGE, 1);
  },
  updateDebuffs: () => { const a = currentAction(); if (inflictsTwo(a) || inflictsOne(a)) applyStrain(); },
  lateConvertStats: () => tuneStrainBonus(),
});

/** Strain mode's one-shot: the team's first Tune Strain - Shifting raises the target's Off-Tune
 *  Level by half the bar flat (DirectOfftune, so no buildup rate scales it), once a fight. Team-wide rather than hers: a team
 *  buff's applyStats() runs on whoever is acting, so whichever member's Shifting cast comes first pays
 *  it out on their own action (a locally-held buff only ever sees Denia's turns). Spent as it fires. */
const OFFTUNE_SURGE = new Buff({
  name: "Denia: Resonance Mode - Tune Strain",
  applyStats: () => { if (applied(TUNE_STRAIN_SHIFTING)) addStat(Stat.DirectOfftune, ENEMY_MAX_OFFTUNE / 2); },
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
 *  Knock. Replaced outright by Final Act - Breakdown's own Stagecraft shift (see DENIA's update),
 *  and short enough to come off after her outro otherwise. */
const ENTROPY_BREAKDOWN = new Buff({
  name: "Entropy Shift: Breakdown Form",

  // the retag has to land in the first phase, before anything reads the type (see typeOverride)
  updateDebuffs: () => { if (spendsVoid(currentAction()) && forte1() > 0) typeOverride(Type1.Liberation); },

  applyStats: () => {
    addStat(Stat.BonusAtk, 30);

    const a = currentAction();
    if (!spendsVoid(a) || forte1() <= 0) return;
    addStat(Stat.MulMv, 50);
    addStat(Stat.AddForte2, a.forte2);
  },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(ENTROPY_BREAKDOWN); },
});

const ENTROPY_STAGECRAFT = new Buff({
  name: "Entropy Shift: Stagecraft Form",
  applyStats: () => { if (currentAction() === ErosionField) addStat(Stat.AddForte1, 20); } // assume 20 seconds passed
});

/** Etched Colors (Inherent Skill): while either Entropy Shift is up, the whole team gets the
 *  mode's payout. Granted as the first shift lands and never revoked — the Stagecraft shift's 30s
 *  bridges every loop to the next Final Act, so one is always up from then on. One buff a mode,
 *  because a team buff's applyStats() runs on whoever's acting and can't ask isHeld() which mode Denia
 *  holds — DN_INHERENT_2's own updateBuffs() picks. */
const ETCHED_COLORS_BURST = new Buff({
  name: "Denia: Etched Colors (burst)",
  applyStats: () => addStat(Stat.DmgBonus, 30, Attribute.Fusion),
});

/** +10 Tune Break Boost, plus 8 per 10% of each resonator's own Off-Tune Buildup Rate past 100%
 *  up to 40 — taken at the cap per CLAUDE.md's own-stats rule (a Syntony Field alone clears it).
 *  The real stat, so tuneStrainBonus() and the damage formula's own tbbFactor both see it. */
const ETCHED_COLORS_STRAIN = new Buff({
  name: "Denia: Etched Colors (strain)",
  convertStats: () => { 
    addStat(Stat.Tbb, 10 + Math.min(40, Math.max(0, 8 * (getStat(Stat.OfftuneBuildup) - 100) / 10)));
  },
});

/** Etched Colors — the grant; the payout is the two team buffs above. Either cast that starts an
 *  Entropy Shift is the moment it comes up. */
const DN_INHERENT_2 = new Inherent({
  name: "Denia: Etched Colors",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Lib1 || a === EIntro) applyTeam(isHeld(MODE_BURST) ? ETCHED_COLORS_BURST : ETCHED_COLORS_STRAIN, 1);
  },
});

/** Banish Stage 2 spends every Dark Core held for +150% of its base multiplier apiece — read off
 *  the gauge before the cast's own -3 lands (deltas bank once the action has resolved). */
const DARK_CORE = new Buff({
  name: "Denia: Dark Core", maxStacks: 3,
  applyStats: () => {
    if (currentAction() === Banish2) {
      addStat(Stat.MulMv, 150 * frozenStacks()),
      revokeCurrent(DARK_CORE);
    }
  }
});

/** Unfinished Lies (Outro), Fusion Burst mode: Fusion Burst DMG against targets near the active
 *  resonator is amplified 60% for 30s — team-wide, permanent uptime, active actions only. Scoped
 *  to Type2.FusionBurst, which no action declares yet, so inert for now (see the file comment). */
const UNFINISHED_LIES_BURST = new Buff({
  name: "Denia: Outro (burst)",
  applyStats: () => { addStat(Stat.Amp, 60, Type2.FusionBurst); },
});

/** Unfinished Lies, Tune Strain mode: the incoming resonator's All DMG is amplified 15% for 16s —
 *  40% instead once they inflict a Tune Strain - Shifting of their own (applied during a cast of
 *  theirs), stack 2 being that upgraded state — and lost the moment they switch out. */
const UNFINISHED_LIES_STRAIN = new Buff({
  name: "Denia: Outro (strain)", maxStacks: 2,
  display: () => (frozenStacks() === 2 ? "Denia: Outro (shifting)" : "Denia: Outro (strain)"),
  updateBuffs: () => {
    lostOnSwap();
    if (applied(TUNE_STRAIN_SHIFTING)) applyCurrent(UNFINISHED_LIES_STRAIN, 1);
  },
  applyStats: () => addStat(Stat.Amp, frozenStacks() === 2 ? 40 : 15),
});

/* --------------------------------------------------------------------------- kit and loadout */

/** Vestiges of Falsehood (Inherent Skill): engaging combat in Stagecraft Form tops Dark Cores up
 *  to 2 and Void Particle up to 20, once every 12s — her Intro, once a loop. Set here, before the
 *  Intro's own +1 core / +25 Void Particle bank, so she opens Banish on all three cores. */
const DN_INHERENT_1 = new Inherent({
  name: "Denia: Vestiges of Falsehood",
  combatStart: () => {
    applyCurrent(DARK_CORE, 2);
    if (forte1() < 20) setForte1(20);
  },
});

const DENIA_TALENTS = new Talent({
  name: "Denia: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritDmg, 16); },
});

const DENIA = new Resonator({
  name: "Denia",
  element: Attribute.Fusion,
  weapon: WeaponType.Rectifier,
  // Final Act - Breakdown always closes her loop back in Stagecraft Form, so It's Been A While!
  // is the Intro she enters with; Knock Knock (the Breakdown-form one) is kept for completeness
  intro: () => stacksOf(ENTROPY_BREAKDOWN) ? EIntro : Intro,
  outro: () => Outro,
  color: "#c9557d",
  maxEnergy: 125,

  constantStats: () => {
    addStat(Stat.BaseHp, 11025); addStat(Stat.BaseAtk, 425); addStat(Stat.BaseDef, 1148.89);
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    addStat(Stat.Tbb, 10);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

/** The migrated sheet's own "denia intro" line: It's Been A While! into its Stage 4 follow-up,
 *  Phantom Bubble, Final Act - Stagecraft to flip into Breakdown, two Void Particle Basic 1-2
 *  pairs, Banish on all three cores, Final Act - Breakdown (which drops the Erosion Field), the
 *  echo and out. Both opener and loop — Final Act - Breakdown leaves her in Stagecraft Form, where
 *  the next loop's Intro picks up. */

const DN_ROTATION = new Rotation([


  OPENER, BA1, Skill, Lib1,
  UBA1, UBA2, UBA1, UBA2, UBA1, UBA2,
  Banish1, Banish2, Lib2,
  ECHO_CAST, OUTRO_NEXT,

  INTRO, BA4, Skill, Lib1,
  UBA1, UBA2, UBA1, UBA2,
  Banish1, Banish2, Lib2,
  ECHO_CAST, OUTRO_NEXT,
]);

/** One loadout per Resonance Mode, each with the echo set built for it: Trickster + Chromatic Foam
 *  rides Fusion Burst (the set triggers off the Burst she inflicts), Voidwing Moth + Reel of
 *  Spliced Memories rides Tune Strain (off her own Shifting). */
export const DENIA_BURST = new Loadout({
  resonator: DENIA,
  talent: DENIA_TALENTS,
  inherent1: DN_INHERENT_1,
  inherent2: DN_INHERENT_2,
  weapons: [FORGED_DWARF_STAR, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER],
  echoLoadouts: [
    new EchoLoadout(TRICKSTER, CHROMATIC_FOAM_5PC, CHROMATIC_FOAM_2PC),
    new EchoLoadout(LIONESS_OF_GLORY, CLAWPRINT_5PC, CLAWPRINT_2PC),
    new EchoLoadout(NEBULOUS_CANNON, TRAILBLAZING_STAR_5PC, TRAILBLAZING_STAR_2PC), // TODO fix mainslot
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: chem("atk", "liberation"),
    rotation: DN_ROTATION,
  mode: MODE_BURST,
});

export const DENIA_STRAIN = new Loadout({
  resonator: DENIA,
  talent: DENIA_TALENTS,
  inherent1: DN_INHERENT_1,
  inherent2: DN_INHERENT_2,
  weapons: [FORGED_DWARF_STAR, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER],
  echoLoadouts: [
    new EchoLoadout(VOIDWING_MOTH, REEL_5PC, REEL_2PC),
    new EchoLoadout(HYVATIA, NEONLIGHT_LEAP_5PC, NEONLIGHT_LEAP_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: chem("atk", "liberation"),
    rotation: DN_ROTATION,
  mode: MODE_STRAIN,
});
