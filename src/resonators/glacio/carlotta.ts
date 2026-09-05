/**
 * Carlotta, ported to the new engine — sequence-0 core loop only. A glacio pistols main DPS,
 * almost everything she does "considered Resonance Skill DMG": Chromatic Splendor, Death Knell,
 * Fatal Finale and Imminent Oblivion all carry `type: Skill` for that reason, even though only
 * two of them are literal Resonance Skill button presses.
 *
 * Substance (forte2, 0-120) gates Heavy Attack - Containment Tactics and Forte Circuit -
 * Imminent Oblivion (both spend it all) and Final Bow: a state entered the moment it fills, held
 * through any spend after, and ended only by a swap-out while Twilight Tango is up — so Era of
 * New Wave and the whole Tango that follows (Death Knell, Fatal Finale) get +80% DMG Multiplier.
 * The rotation below fills it, spends it on Imminent Oblivion, then casts the Liberation.
 *
 * Meta Vector (forte3): each Death Knell grants 1, Fatal Finale requires and spends all 4 — a
 * declarative forte3 delta on those two actions.
 *
 * Moldable Crystal (forte1, 0-6): restored by several actions (+3 each, declarative) and spent 1
 * a strike by Necessary Measures/Dodge Counter (also declarative). The one genuinely dynamic
 * spend is Chromatic Splendor, which consumes *every* crystal held and converts each into 10
 * Substance — a ratio, not a fixed number, so it's `CHROMATIC_SPLENDOR_SPEND` below, a
 * self-applied Buff whose own convertStats() reads forte1() before zeroing it, same shape as
 * Jingran's Fire of Life.
 *
 * Deconstruction (Ars Gratia Artis, Inherent Skill, always assumed known): several actions
 * inflict it. Modelled as a genuine enemy debuff (not a team buff) whose 18% DEF Shred only
 * takes effect while Carlotta herself is the active member, by explicit instruction. Lost after
 * her own outro action gains stats, by explicit instruction — not permanent uptime.
 *
 * Numbers from nanoka.cc (character 1107) — base stats confirmed there directly; every action's
 * own MV/energy/concerto/offtune/forte1 delta ported from the migrated (old-engine) sheet, with
 * one exception: the sheet's own Intro Substance gain (+60) disagreed with the page's explicit
 * "restore 30 points of Substance," so the page's own 30 is used. No Outro handoff buff is
 * described on her own page (unlike every other kit so far) — Closing Remark is left as a plain
 * damage hit, nothing invented.
 */
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Debuff } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  applyEnemy,
  revokeEnemy,
  stacksOfEnemy,
  queue,
  isHeld,
  currentAction,
  casting,
  revokeCurrent,
  addStat,
  forte1,
  forte2,
  setForte2,
} from "../../engine/context.js";
import { matrix } from "../../shared/helpers.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_SWAP, OUTRO, SWAP, START_3 } from "../../engine/rotation.js";
import { THE_LAST_DANCE } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { FROSTY_RESOLVE_5PC, SENTRY_CONSTRUCT } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function carlottaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter (Silent Execution)
const BA1 = carlottaAction("Basic - Silent Execution 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 54.08, energy: 0.8, concerto: 1.6, offtune: 2560 });
const BA2 = carlottaAction("Basic - Silent Execution 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 131.83, energy: 1.96, concerto: 3.9, offtune: 6240, forte1: 3 });
const MA1 = carlottaAction("Mid-air - Silent Execution", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 104.78, energy: 3, concerto: 6, offtune: 9600 });
const MA2 = carlottaAction("Basic - Silent Execution: Customary Greetings", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 239.98, energy: 2.11, concerto: 4.2, offtune: 6720, forte1: 3 });
const DC = carlottaAction("Dodge Counter - Silent Execution", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 241.32, energy: 3.58, concerto: 17.15, offtune: 11425, forte2: 10, forte1: -1 });

// Necessary Measures: Basic Attack replaced while holding Moldable Crystals, each stage spending
// one. Not placed in the rotation below (see file header), kept for completeness.
const NM1 = carlottaAction("Basic - Silent Execution: Necessary Measures 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 65.91, energy: 0.98, concerto: 1.95, offtune: 3120, forte2: 10, forte1: -1 });
const NM2 = carlottaAction("Basic - Silent Execution: Necessary Measures 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 133.51, energy: 1.98, concerto: 3.96, offtune: 6320, forte2: 10, forte1: -1 });
const NM3 = carlottaAction("Basic - Silent Execution: Necessary Measures 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 233.25, energy: 3.47, concerto: 6.9, offtune: 11040, forte2: 10, forte1: -1 });

// base cast, and Containment Tactics once Substance is full
const HA = carlottaAction("Heavy - Silent Execution", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 152.12, energy: 2.26, concerto: 4.52, offtune: 7200, forte1: 3 });
const EHA = carlottaAction("Heavy - Silent Execution: Containment Tactics", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 228.18, energy: 2.26, concerto: 15, offtune: 7200, forte2: -120,
  updateBuffs: () => { if (forte2() > 120) setForte2(120); },
});

// Art of Violence, then Chromatic Splendor (press again shortly after) — Chromatic Splendor's
// own Substance gain/crystal spend is dynamic (see CHROMATIC_SPLENDOR_SPEND below)
const Skill1 = carlottaAction("Skill - Art of Violence", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 288.22, energy: 2, concerto: 5, offtune: 6136, forte1: 3,
});
const Skill2 = carlottaAction("Skill - Chromatic Splendor", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 563.64, energy: 3, concerto: 5, offtune: 12000,
  // the crystal-to-Substance conversion
  updateBuffs: () => applyCurrent(CHROMATIC_SPLENDOR_SPEND, 1),
});

// considered Resonance Skill DMG, spends all Substance
const FHA = carlottaAction("Forte Heavy - Imminent Oblivion", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Skill, mv: 835.36, energy: 17, concerto: 15, offtune: 97361, forte2: -120,
  updateBuffs: () => { if (forte2() > 120) setForte2(120); },
});

// Era of New Wave opens Twilight Tango; Death Knell (up to 4, each granting 1 Meta Vector) then
// Fatal Finale (requires and spends all 4) close it out. Death Knell's shots are real presses of
// about a second each, not a frozen-world cinematic, so they count as time (helpers.ts's second)
const Lib1 = carlottaAction("Liberation - Era of New Wave", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Skill, mv: 402.71, concerto: 20, offtune: 33600, resetEnergy: true,
  // opens Twilight Tango, zeroes the gauge
  updateBuffs: () => {
    applyEnemy(DECONSTRUCTION, 1);
    applyCurrent(TWILIGHT_TANGO, 1);
    setForte2(0); // Twilight Tango removes all Substance on opening
  },
});
const DeathKnell = carlottaAction("Liberation - Death Knell", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Skill, realTime: true, mv: 241.64, energy: 5, concerto: 7, offtune: 9600, forte3: 1,
});
const FatalFinale = carlottaAction("Liberation - Fatal Finale", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Skill, mv: 644.33, concerto: 10, offtune: 50400, forte3: -4,
});

const Intro = carlottaAction("Intro - Wintertime Aria", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 298.23, energy: 10, concerto: 10, offtune: 9335, forte2: 30, forte1: 3,
});
/** No handoff buff of any kind is described on her own kit page — left as a plain damage hit. */
const Outro = carlottaAction("Outro - Closing Remark", { cast: Cast.Outro, type: Type1.Outro, mv: 794.2, concerto: -100, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** A genuine debuff on the enemy — permanent uptime once inflicted. Its 18% DEF Shred only lands
 *  while Carlotta herself is the active member, checked by `isHeld(CARLOTTA_RESONATOR)`: this buff's own
 *  applyStats() runs on every member's turn, but `currentSlot` there is always whoever's acting. */
const DECONSTRUCTION = new Debuff({
  name: "Carlotta: Deconstruction",
  applyStats: () => { if (isHeld(CARLOTTA_RESONATOR)) addStat(Stat.DefIgnoreOld, 18); },
  convertStats: () => { if (casting(Cast.Outro) && isHeld(CARLOTTA_RESONATOR)) revokeEnemy(DECONSTRUCTION); },
});

const CL_INHERENT_1 = new Inherent({
  name: "Inherent: Flawless Purity",
  // interrupt immune
});

const CL_INHERENT_2 = new Inherent({
  name: "Inherent: Ars Gratia Artis",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Intro || a === Skill2 || a === DeathKnell || a === FHA) applyEnemy(DECONSTRUCTION, 1);
  },
});

/** Consumes every crystal currently held and converts each into 10 Substance — self-applied on
 *  Skill2, its own convertStats() reads forte1() before zeroing it, same shape as Jingran's Fire of Life. */
const CHROMATIC_SPLENDOR_SPEND = new Buff({
  name: "Carlotta: Chromatic Splendor",
  convertStats: () => {
    const crystals = forte1();
    addStat(Stat.AddForte1, -crystals);
    addStat(Stat.AddForte2, 10 * crystals);
    revokeCurrent(CHROMATIC_SPLENDOR_SPEND);
  },
});

/** A pure state marker — entered on Era of New Wave, left once Fatal Finale resolves, so Final
 *  Bow can read whether it's still open. Revoked in convertStats(), not updateBuffs(), so a same-action
 *  reader still sees it held. */
const TWILIGHT_TANGO = new Buff({
  name: "Carlotta: Twilight Tango",
  convertStats: () => {
    if (currentAction() === FatalFinale) revokeCurrent(TWILIGHT_TANGO);
  },
});

/** +80% DMG Multiplier on Era of New Wave, Death Knell and Fatal Finale — entered the moment
 *  Substance fills (CARLOTTA_RESONATOR's own afterAction), whatever action did it, and spending
 *  it again (Imminent Oblivion, Containment Tactics) does not end it: only being switched off
 *  field while Twilight Tango is up does. Identity check since these three share `type: Skill`
 *  with other hits that shouldn't get it. */
const FINAL_BOW = new Buff({
  name: "Carlotta: Final Bow",
  applyStats: () => {
    const a = currentAction();
    if (a === Lib1 || a === DeathKnell || a === FatalFinale) addStat(Stat.MulMv, 80);
  },
  convertStats: () => {
    if (isHeld(TWILIGHT_TANGO) && !currentAction().active) revokeCurrent(FINAL_BOW);
  },
});

/* --------------------------------------------------------------------------- resonance chain */

/** S1: +12.5% Crit Rate on any hit into a Deconstruction target, and Chromatic Splendor restores
 *  30 more Substance — it always follows Art of Violence, whose Dispersion is what it asks for. */
const CL_S1 = new Sequence({
  name: "Carlotta S1: Beauty Blazes Brightest Before It Fades",
  applyStats: () => { if (stacksOfEnemy(DECONSTRUCTION) > 0) addStat(Stat.CritRate, 12.5); },
  convertStats: () => { if (currentAction() === Skill2) addStat(Stat.AddForte2, 30); },
});

/** S2: Fatal Finale's multiplier +126%. */
const CL_S2 = new Sequence({
  name: "Carlotta S2: Fallen Petals Give Life to New Blooms",
  applyStats: () => { if (currentAction() === FatalFinale) addStat(Stat.MulMv, 126); },
});

/** S3: one more strike at the end of Closing Remark — 1032.18% ATK, queued behind the outro on her
 *  own slot — and +93% multiplier on Art of Violence and Chromatic Splendor. */
const Sparks = carlottaAction("Outro - Kaleidoscope Sparks", { type: Type1.Outro, mv: 1032.18, active: false });
const CL_S3 = new Sequence({
  name: "Carlotta S3: Adelante, Cortado, Spinning in Grace",
  applyStats: () => { const a = currentAction(); if (a === Skill1 || a === Skill2) addStat(Stat.MulMv, 93); },
  updateBuffs: () => { if (currentAction() === Outro) queue(Sparks); },
});

/** S4: any of her three Heavy Attacks gives the whole team +25% Resonance Skill DMG Bonus for 30s —
 *  "all Resonators in the team", so it pays off-field too, and long enough to be permanent. */
const FINEST_WINE = new Buff({
  name: "Carlotta S4: Yesterday's Raindrops Make Finest Wine (team)",
  applyStats: () => addStat(Stat.DmgBonus, 25, Type1.Skill),
});
const CL_S4 = new Sequence({
  name: "Carlotta S4: Yesterday's Raindrops Make Finest Wine",
  updateBuffs: () => { const a = currentAction(); if (a === HA || a === EHA || a === FHA) applyTeam(FINEST_WINE, 1); },
});

/** S5: Imminent Oblivion's multiplier +47%. */
const CL_S5 = new Sequence({
  name: "Carlotta S5: Toast to Past, Today, and Every Day to Come",
  applyStats: () => { if (currentAction() === FHA) addStat(Stat.MulMv, 47); },
});

/** S6: Death Knell's shots hit harder and double up — +186.6% multiplier in total. */
const CL_S6 = new Sequence({
  name: "Carlotta S6: As the Curtain Falls, I Remain What I Am",
  applyStats: () => { if (currentAction() === DeathKnell) addStat(Stat.MulMv, 186.6); },
});

const CARLOTTA_RESONATOR = new Resonator({
  name: "Carlotta",
  element: Attribute.Glacio,
  weapon: WeaponType.Pistols,
  intro: () => Intro,
  outro: () => Outro,
  color: "#8fb3d9",
  maxEnergy: 125,

  // Final Bow is a state entered on the gauge filling, so it is read off the gauge as each
  // action leaves it — the only phase that sees Chromatic Splendor's own conversion banked
  afterAction: () => { if (forte2() >= 120) applyCurrent(FINAL_BOW, 1); },

  constantStats: () => {
    addStat(Stat.BaseHp, 12450); addStat(Stat.BaseAtk, 463); addStat(Stat.BaseDef, 1198);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CARLOTTA_TALENTS = new Talent({
  name: "Carlotta: Talents",
  constantStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// Intro (+30 Substance, on the 30 the last Chromatic Splendor left) into Art of Violence/Chromatic
// Splendor (six crystals, +60) fills the gauge — Final Bow — which Imminent Oblivion then spends
// before Liberation opens Twilight Tango with the state still up.
// She's never the team's own lead, so this covers both opener and loop.

const DeathKnellx4 = new ActionGroup("Liberation - Death Knell x4", [DeathKnell, DeathKnell, DeathKnell, DeathKnell]);
const Skill12 = new ActionGroup("Skill - Art of Violence + Chromatic Splendor", [Skill1, Skill2]);
const Skill12Swap = new ActionGroup("Skill - Art of Violence + Chromatic Splendor", [Skill1, Skill2.swap()]);

const CL_ROTATION = new Rotation([
  START_3, Skill12Swap, SWAP,
  INTRO, Skill12, MA1, FHA,
  Lib1, DeathKnellx4, FatalFinale,
  Skill12, ECHO_SWAP, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const CARLOTTA = new Loadout({
  resonator: CARLOTTA_RESONATOR,
  matrix: matrix("Carlotta", 25),
  talent: CARLOTTA_TALENTS,
  inherent1: CL_INHERENT_1,
  inherent2: CL_INHERENT_2,
  sequences: [CL_S1, CL_S2, CL_S3, CL_S4, CL_S5, CL_S6],
  weapons: [THE_LAST_DANCE, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: [new EchoLoadout(SENTRY_CONSTRUCT, FROSTY_RESOLVE_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
    rotation: CL_ROTATION,
});
