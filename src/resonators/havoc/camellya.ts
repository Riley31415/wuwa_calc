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
 *   Blossom/Floral Ravage. 15s, so lost after the outro action gains stats.
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
 * Concerto Energy: Ephemeral genuinely requires it full (100) and spends 70 — same clamp-then-
 * declared-delta shape as forte1, via concerto()/setConcerto(). "Consuming 10 Crimson Pistils
 * recovers 4 Concerto Energy and obtains 1 Crimson Bud" is checked as every full 10 consumed
 * from the 100 top (first at 90 or less) by *that one hit's own consumption*, read
 * off forte1() before vs. after — not a flat 1-per-hit rate — in CONSUME_CRIMSON_PISTIL's own
 * applyStats(), gated off entirely while Budding Mode is held. Its Energy Regen Multiplier is the
 * real stat (Stat.EnergyRegenMult): +150% outside Budding Mode, -100 (a x0 factor) while it's held.
 *
 * Seedbed/Epiphyte (Inherent Skills, always assumed known): +15% Havoc DMG Bonus flat; +15%
 * Basic DMG Bonus flat (interruption-resistance half not modelled) — both genuinely
 * unconditional, each its own piece of gear so the report's own source trace names them
 * individually. Vining Ronde and the Crimson Pistil/Bud economy that gates when Ephemeral is
 * actually available aren't tracked live — Ephemeral is just placed once the rotation calls for it.
 *
 * Numbers from nanoka.cc (character 1603) — MV/duration confirmed there directly (no
 * wuwalab.com entry, no migrated-sheet row). Energy/Concerto/Offtune come off nanoka's own
 * "Damage Data" table — see the comment above the action definitions for the column mapping.
 * Outro/Twining's own table gives 0 across the board, a real absence, not an unchecked gap.
 */
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyCurrent,
  revokeCurrent,
  casting,
  currentAction,
  addStat,
  setForte1,
  isHeld,
  concerto,
  setConcerto,
  stacksOf,
  frozenStacks,
  forte1,
} from "../../engine/context.js";
import { lostOnSwap, matrix } from "../../shared/helpers.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_CANCEL, OUTRO, ECHO_ONFIELD, DOUBLE_INTRO, SWAP } from "../../engine/rotation.js";
import { RED_SPRING } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { NM_CROWNLESS, HAVOC_ECLIPSE_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

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
const BA1 = camellyaAction("Basic - Burgeoning 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 62.53, energy: 0.93, concerto: 1.85, offtune: 2960, forte1: -6.15 });
const BA2 = camellyaAction("Basic - Burgeoning 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 92.96, energy: 1.38, concerto: 2.76, offtune: 4400, forte1: -9.14 }); // 46.48% x2
const BA3 = camellyaAction("Basic - Burgeoning 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 152.10, energy: 2.25, concerto: 4.5, offtune: 7200, forte1: -14.94 }); // 50.70% x3
/** Chain Basic Attack — hold Normal Attack after Stage 3 to keep striking, 20 hits. */
const BA4 = camellyaAction("Basic - Burgeoning 4 (Hold)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 494.00, energy: 5.4, concerto: 10.8, offtune: 17280, forte1: -36 }); // 24.70% x20
const BA5 = camellyaAction("Basic - Burgeoning 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 192.68, energy: 2.88, concerto: 5.72, offtune: 9120, forte1: -18.96 }); // 48.17% x4

const MA = camellyaAction("Mid-air - Attack", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 131.22, energy: 1.66, concerto: 3.3, offtune: 5280, forte1: -10.96 }); // 65.61% x2
const DC = camellyaAction("Dodge Counter - Burgeoning", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 298.20, energy: 2.25, concerto: 14.5, offtune: 7200, forte1: -24.9 }); // 99.40% x3
/** Considered Basic Attack DMG per Seedbed's own text. */
const HA = camellyaAction("Heavy - Pruning", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Basic, mv: 264.42, energy: 3.33, concerto: 6.66, offtune: 10641, forte1: -22.08 }); // 88.14% x3

// Crimson Blossom opens Blossom Mode; Vining Waltz/Blazing Waltz/Vining Ronde/Atonement replace
// Basic/Dodge Counter/Jump while it's up; Floral Ravage (Skill replacement) ends it.
const CrimsonBlossom = camellyaAction("Skill - Crimson Blossom", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Basic, mv: 227.24, concerto: 7, energy: 3.18, offtune: 10160, forte1: -21.1, // 113.62% x2
  updateBuffs: () => applyCurrent(BLOSSOM_MODE, 1),
});

const VW1 = camellyaAction("Basic - Vining Waltz 1", { node: Node.Skill, cast: Cast.Basic, type: Type1.Basic, mv: 96.33, energy: 1.43, concerto: 2.85, offtune: 4560, forte1: -9.47 });
const VW2 = camellyaAction("Basic - Vining Waltz 2", { node: Node.Skill, cast: Cast.Basic, type: Type1.Basic, mv: 91.26, energy: 1.36, concerto: 2.7, offtune: 4320, forte1: -8.98 }); // 45.63% x2
const VW3 = camellyaAction("Basic - Vining Waltz 3", { node: Node.Skill, cast: Cast.Basic, type: Type1.Basic, mv: 131.70, energy: 1.44, concerto: 2.88, offtune: 4608, forte1: -9.6 }); // 21.95% x6
/** Blazing Waltz — hold Normal Attack on Vining Waltz Stage 3 before it auto-continues to Stage
 *  4. Shares Vining Waltz 3's own per-hit row, multiplied out to its own real *19 hit count. */
const BlazingWaltz = camellyaAction("Basic - Blazing Waltz", { node: Node.Skill, cast: Cast.Basic, type: Type1.Basic, mv: 417.05, energy: 4.56, concerto: 9.12, offtune: 14592, forte1: -30.4 }); // 21.95% x19
const VW4 = camellyaAction("Basic - Vining Waltz 4", { node: Node.Skill, cast: Cast.Basic, type: Type1.Basic, mv: 202.77, energy: 3, concerto: 6, offtune: 9600, forte1: -19.92 }); // 67.59% x3

/** Jump's own replacement in Blossom Mode, ends it. Never placed in the rotation below (she
 *  never jumps into one there), exported for completeness. */
const ViningRonde = camellyaAction("Basic - Vining Ronde", { node: Node.Skill, cast: Cast.Basic, type: Type1.Basic, mv: 158.85, energy: 2.37, concerto: 4.71, offtune: 7521, forte1: -15.63 }); // 52.95% x3
const Atonement = camellyaAction("Dodge Counter - Atonement", { node: Node.Skill, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 226.66, energy: 1.36, concerto: 12.7, offtune: 4320, forte1: -18.94 }); // 113.33% x2

/** The Skill replacement in Blossom Mode, ends it. Considered Basic Attack DMG. */
const FloralRavage = camellyaAction("Skill - Floral Ravage", { node: Node.Skill, cast: Cast.Skill, type: Type1.Basic, mv: 263.05, concerto: 7, energy: 3.7, offtune: 11760, forte1: -24.45 }); // 52.61% x5

/** At full Crimson Pistil/Concerto — considered Basic Attack DMG, enters Budding Mode, genuinely
 *  recovers Crimson Pistil to a hard 100, and spends 70 Concerto off a hard-clamped-to-100
 *  starting point (see file header on both pre-clamps in CAMELLYA_RESONATOR's own updateBuffs()). */
/** Requires full Concerto and consumes 70 of it, so the bar is clamped back to 100 first; refills
 *  the gauge from empty, and folds every Crimson Bud held into the Budding Mode it opens. */
const Ephemeral = camellyaAction("Forte Skill - Ephemeral", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Basic, mv: 1262.45, forte1: 100, concerto: -70, energy: 12, offtune: 60800,
  updateBuffs: () => {
    setForte1(0);
    if (concerto() > 100) setConcerto(100);
    const buds = stacksOf(CRIMSON_BUD);
    revokeCurrent(BUDDING_MODE);
    applyCurrent(BUDDING_MODE, 1 + buds);
    revokeCurrent(CRIMSON_BUD);
  },
});

const Liberation = camellyaAction("Liberation - Fervor Efflorescent", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1202.81, concerto: 20, offtune: 84000, resetEnergy: true });

const Intro = camellyaAction("Intro - Everblooming", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.81, concerto: 10, forte1: 100, energy: 10, offtune: 9600,
  updateBuffs: () => setForte1(0),
});
/** No handoff buff is described on her own kit page, unlike most other kits' outros — left as a
 *  plain damage hit. The Ephemeral-boosted variant isn't separately placed. */
const Outro = camellyaAction("Outro - Twining", { cast: Cast.Outro, type: Type1.Outro, mv: 329.24, concerto: -100, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** A pure state/display marker, no stat of its own — opened by Crimson Blossom, ends on Floral
 *  Ravage/Vining Ronde or her own outro. */
const BLOSSOM_MODE = new Buff({
  name: "Camellya: Blossom Mode",
  convertStats: () => {
    if (currentAction() === FloralRavage || currentAction() === ViningRonde) revokeCurrent(BLOSSOM_MODE);
  },
});

/** Sweet Dream's own DMG Multiplier, on every stage of the Burgeoning combo plus seven other
 *  named actions. An 11-stack buff: 1 base stack (flat +50%) plus 1 more per Crimson Bud held
 *  the moment Ephemeral consumed them (up to 10, +5% each — granted by CAMELLYA_RESONATOR's own updateBuffs(),
 *  since a Gear's own updateBuffs() only runs once it's already held). 15s, lost after the outro
 *  action gains stats. */
function inSweetDream(a: Action): boolean {
  return a === BA1 || a === BA2 || a === BA3 || a === BA4 || a === BA5
    || a === VW1 || a === VW2 || a === VW3 || a === VW4 || a === BlazingWaltz
    || a === ViningRonde || a === Atonement || a === CrimsonBlossom || a === FloralRavage;
}
const BUDDING_MODE = new Buff({
  name: "Camellya: Sweet Dream", maxStacks: 11,
  applyStats: () => { if (inSweetDream(currentAction())) addStat(Stat.MulMv, 45 + 5 * frozenStacks()); },
  // two real end conditions: switched off field, and "all Crimson Pistils consumed" — checked
  // after applyStats() already paid out, excluding Ephemeral itself (whose own forte1 pre-clamp to 0
  // would otherwise be mistaken for "ran out" the instant Budding Mode opens)
  convertStats: () => {
    lostOnSwap();
    if (currentAction() !== Ephemeral && forte1() <= 0) revokeCurrent(BUDDING_MODE);
  },
  display: () => `Camellya: Sweet Dream +${frozenStacks()-1} Buds`,
});

/** A stack per full 10 Pistils a Sweet-Dream-listed hit consumes (counted from the 100 top)
 *  outside Budding Mode, capped at 10. Empty buff — Ephemeral consumes every held stack and it
 *  just decides how many of Budding Mode's own 11 stacks get granted. */
const CRIMSON_BUD = new Buff({
  name: "Camellya: Crimson Bud", maxStacks: 10,
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(CRIMSON_BUD); },
});

/** Seedbed (Inherent Skill): +15% Havoc DMG Bonus flat — genuinely unconditional. */
const SEEDBED = new Inherent({
  name: "Inherent: Seedbed",
  constantStats: () => addStat(Stat.DmgBonus, 15, Attribute.Havoc),
});

/** Epiphyte (Inherent Skill): +15% Basic DMG Bonus flat (interruption-resistance half not modelled). */
const EPIPHYTE = new Inherent({
  name: "Inherent: Epiphyte",
  constantStats: () => addStat(Stat.DmgBonus, 15, Type1.Basic),
});

/** Granted and immediately spent on every action that consumes Crimson Pistils (a negative
 *  forte1 delta), same one-shot-per-qualifying-action shape as Brant's own Trial by Fire and
 *  Tide. Carries Vegetative Universe's own two effects: Crimson Pistil consumption (banked into
 *  Concerto Energy + Crimson Bud gain, per full 10 Pistils *this hit's own* consumption takes
 *  from the 100 top, not a flat 1-per-hit rate) and the Energy Regen Multiplier. */
const CONSUME_CRIMSON_PISTIL = new Buff({
  name: "Camellya: Consume Crimson Pistil",
  applyStats: () => {
    const a = currentAction();
    const before = forte1();
    const after = before + a.forte1;
    // a bud per full 10 *consumed* from the 100 top — the first lands at 90 or less, so a
    // 100 -> 95 hit grants nothing (floor-of-forte would count crossing 100's own decade)
    const buds = Math.floor((100 - Math.max(0, after)) / 10) - Math.floor((100 - before) / 10);
    if (buds > 0) {
      if (!isHeld(BUDDING_MODE)) applyCurrent(CRIMSON_BUD, buds);
      addStat(Stat.AddConcerto, 4 * buds);
    }
    addStat(Stat.EnergyRegenMult, isHeld(BUDDING_MODE) ? -100 : 150);
  },
  convertStats: () => revokeCurrent(CONSUME_CRIMSON_PISTIL),
});

const CAMELLYA_RESONATOR = new Resonator({
  name: "Camellya",
  element: Attribute.Havoc,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  outro: () => Outro,
  color: "#e0507a",
  maxEnergy: 125,

  // any gauge-spending cast of hers is a Crimson Pistil consumption
  updateBuffs: () => { if (currentAction().forte1 < 0) applyCurrent(CONSUME_CRIMSON_PISTIL, 1); },

  constantStats: () => {
    addStat(Stat.BaseHp, 10325); addStat(Stat.BaseAtk, 450); addStat(Stat.BaseDef, 1161);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CAMELLYA_TALENTS = new Talent({
  name: "Camellya: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritDmg, 16); },
});

// a kit-valid line: Intro, the Burgeoning chain, Crimson Blossom opens Blossom Mode, the Vining
// Waltz chain (with the Blazing Waltz insert) into Floral Ravage closes it, Ephemeral spends the
// fresh Concerto and opens Budding Mode, Liberation, Outro. She's never the team's own lead, so
// this covers both opener and loop.

const VW1234_16s = new ActionGroup("Basic - Vining Waltz 123H4", [VW1, VW2, VW3, BlazingWaltz.swap(), VW4.swap()]);
const BA12345 = new ActionGroup("Basic - Burgeoning 1234H5", [BA1, BA2, BA3, BA4, BA5]);

const CM_ROTATION = new Rotation([
  INTRO, CrimsonBlossom, 
  BA12345,
  Liberation, Ephemeral,
  VW1234_16s,
  FloralRavage, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const CAMELLYA = new Loadout({
  resonator: CAMELLYA_RESONATOR,
  matrix: matrix("Camellya", 25),
  talent: CAMELLYA_TALENTS,
  inherent1: SEEDBED,
  inherent2: EPIPHYTE,
  weapons: [RED_SPRING, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
    rotation: CM_ROTATION,
});

const VW1234 = new ActionGroup("Basic - Vining Waltz 123H4", [VW1, VW2, VW3, BlazingWaltz, VW4]);

const CM_ROTATION_DOUBLE = new Rotation([
  DOUBLE_INTRO, ECHO_ONFIELD, CrimsonBlossom, FloralRavage, 
  HA, BA4, BA5.swap(), SWAP,
  
  INTRO,
  Liberation, Ephemeral,
  CrimsonBlossom, 
  VW1234,
  FloralRavage, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const CAMELLYA_DOUBLE = new Loadout({
  resonator: CAMELLYA_RESONATOR,
  matrix: matrix("Camellya", 25),
  talent: CAMELLYA_TALENTS,
  inherent1: SEEDBED,
  inherent2: EPIPHYTE,
  weapons: [RED_SPRING, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
    rotation: CM_ROTATION_DOUBLE,
});
