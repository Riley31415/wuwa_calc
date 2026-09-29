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
 * Substance — a ratio, not a fixed number, so Chromatic Splendor's own updateBuffs() spends it
 * on the cast, reading forte1() before zeroing it.
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
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Debuff, matrix } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  applyEnemy,
  stacksOfEnemy,
  queue,
  isHeld,
  currentAction,
  runningAction,
  revokeCurrent,
  addStat,
  forte1,
  forte2,
  reduceCooldown,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, START_3, START_2, INTRO } from "../../engine/rotation.js";
import { THE_LAST_DANCE } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { FROSTY_RESOLVE_5PC, SENTRY_CONSTRUCT } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function carlottaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter (Silent Execution)
const BA1 = carlottaAction("Basic - Silent Execution 1", { animFrames: 16, commitFrames: 13, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 13, mv: 54.08, energy: 0.8, concerto: 1.6, offtune: 2560 }]});
const BA2 = carlottaAction("Basic - Silent Execution 2", { animFrames: 44, commitFrames: 38, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 16, mv: 39.55, energy: 0.59, concerto: 1.17, offtune: 1872 },
    { at: 30, mv: 39.55, energy: 0.59, concerto: 1.17, offtune: 1872 },
    { at: 38, mv: 52.73, energy: 0.78, concerto: 1.56, offtune: 2496, forte1: 3 },
  ]});
const MA1 = carlottaAction("Mid-air - Silent Execution Plunge", { animFrames: 47, commitFrames: 36, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 104.78, energy: 3, concerto: 6, offtune: 9600 });
const MA2 = carlottaAction("Basic - Silent Execution: Customary Greetings", { animFrames: 56, commitFrames: 46, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 239.98, energy: 2.11, concerto: 4.2, offtune: 6720, forte1: 3 });
const DC = carlottaAction("Dodge Counter - Silent Execution", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, mv: 241.32, energy: 3.58, concerto: 17.15, offtune: 11425, forte2: 10, castForte1: -1});

// Necessary Measures: Basic Attack replaced while holding Moldable Crystals, each stage spending
// one. Not placed in the rotation below (see file header), kept for completeness.
const NM1 = carlottaAction("Basic - Silent Execution: Necessary Measures 1", { animFrames: 60, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 65.91, energy: 0.98, concerto: 1.95, offtune: 3120, forte2: 10, castForte1: -1});
const NM2 = carlottaAction("Basic - Silent Execution: Necessary Measures 2", { animFrames: 60, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 133.51, energy: 1.98, concerto: 3.96, offtune: 6320, forte2: 10, castForte1: -1});
const NM3 = carlottaAction("Basic - Silent Execution: Necessary Measures 3", { animFrames: 60, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 233.25, energy: 3.47, concerto: 6.9, offtune: 11040, forte2: 10, castForte1: -1});

// base cast, and Containment Tactics once Substance is full
const HA = carlottaAction("Heavy - Silent Execution", { animFrames: 54, commitFrames: 38, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 15, mv: 22.82, energy: 0.34, concerto: 0.68, offtune: 1080 },
    { at: 16, mv: 22.82, energy: 0.34, concerto: 0.68, offtune: 1080 },
    { at: 18, mv: 22.82, energy: 0.34, concerto: 0.68, offtune: 1080 },
    { at: 19, mv: 22.82, energy: 0.34, concerto: 0.68, offtune: 1080 },
    { at: 38, mv: 60.84, energy: 0.9, concerto: 1.8, offtune: 2880, forte1: 3 },
  ]});
const EHA = carlottaAction("Heavy - Silent Execution: Containment Tactics", {
  animFrames: 54, commitFrames: 38,
  node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, mv: 228.18, energy: 2.26, concerto: 15, offtune: 7200, castForte2: -120,
  updateBuffs: () => reduceCooldown(Skill1, 60 * 6),
});

// Art of Violence, then Chromatic Splendor (press again shortly after) — Chromatic Splendor's
// own Substance gain/crystal spend is dynamic (see CHROMATIC_SPLENDOR_SPEND below)
const Skill1 = carlottaAction("Skill - Art of Violence", {
  animFrames: 46, commitFrames: 35, cooldown: 60 * 14,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 8, mv: 144.11, energy: 1, offtune: 3068 },
    { at: 35, mv: 144.11, energy: 1, offtune: 3068, forte1: 3 },
  ], castConcerto: 5,
});
const Skill2 = carlottaAction("Skill - Chromatic Splendor", {
  animFrames: 121, commitFrames: 82,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 40, mv: 112.73, energy: 0.6, offtune: 2400 },
    { at: 53, mv: 112.73, energy: 0.6, offtune: 2400 },
    { at: 82, mv: 338.18, energy: 1.8, offtune: 7200 },
  ], castConcerto: 5,
  // the crystal-to-Substance conversion, spent on the cast off the crystals it found
  updateBuffs: () => {
    const crystals = Math.min(6, forte1());
    addStat(Stat.AddCastForte1, -crystals);
    addStat(Stat.AddCastForte2, 10 * crystals);
  },
});

// considered Resonance Skill DMG, spends all Substance; Tinted Crystal's 22s cooldown is this cast's
const FHA = carlottaAction("Forte Heavy - Imminent Oblivion", {
  animFrames: 124, commitFrames: 92, cooldown: 60 * 22,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Skill, hits: [
    { at: 18, mv: 66.83, energy: 1.36, offtune: 7789 },
    { at: 25, mv: 66.83, energy: 1.36, offtune: 7789 },
    { at: 31, mv: 66.83, energy: 1.36, offtune: 7789 },
    { at: 38, mv: 66.83, energy: 1.36, offtune: 7789 },
    { at: 42, mv: 66.83, energy: 1.36, offtune: 7789 },
    { at: 92, mv: 501.21, energy: 10.2, offtune: 58416 },
  ], castConcerto: 15, castForte2: -120,
  updateBuffs: () => reduceCooldown(Skill1, 60 * 6),
});

// Era of New Wave opens Twilight Tango; Death Knell (up to 4, each granting 1 Meta Vector) then
// Fatal Finale (requires and spends all 4) close it out. Death Knell's shots are real presses of
// about a second each, not a frozen-world cinematic, so they carry no time stop and count as time
const Lib1 = carlottaAction("Liberation - Era of New Wave", {
  animFrames: 182, timestop: 182, motionStop: 138,
  commitFrames: 130,
  cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Skill, hits: [{ at: 130, mv: 402.71, offtune: 33600 }], castConcerto: 20, resetEnergy: true,
  resetForte2: true, // Twilight Tango removes all Substance on opening
  updateBuffs: () => applyCurrent(TWILIGHT_TANGO, 1),
  updateDebuffs: () => applyEnemy(DECONSTRUCTION, 1),
});
const DeathKnell = carlottaAction("Liberation - Death Knell", {
  animFrames: 70, commitFrames: 52,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Skill, hits: [
    { at: 40, mv: 183.64, energy: 5, offtune: 9600 },
    { at: 81, mv: 14.5 },
    { at: 81, mv: 14.5 },
    { at: 83, mv: 14.5 },
    { at: 83, mv: 14.5 },
  ], castConcerto: 7, castForte3: 1,
});
const FatalFinale = carlottaAction("Liberation - Fatal Finale", {
  animFrames: 170, timestop: 170, motionStop: 140,
  commitFrames: 138,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Skill, hits: [{ at: 138, mv: 644.33, offtune: 50400 }], castConcerto: 10, castForte3: -4,
});

const Intro = carlottaAction("Intro - Wintertime Aria", {
  animFrames: 84, motionStop: 84, commitFrames: 70,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 56, mv: 178.93, energy: 6, offtune: 5601 },
    { at: 65, mv: 59.65, energy: 2, offtune: 1867 },
    { at: 80, mv: 59.65, energy: 2, offtune: 1867, forte2: 30 },
  ], castConcerto: 10, castForte1: 3,
});
/** No handoff buff of any kind is described on her own kit page — left as a plain damage hit. */
const Outro = carlottaAction("Outro - Closing Remark", { commitFrames: 0, animFrames: 0, cast: Cast.Outro, type: Type.Outro, hits: [{ at: 0, mv: 794.2 }], castConcerto: -100});

/* ------------------------------------------------------------------------------------ buffs */

/** A genuine debuff on the enemy — permanent uptime once inflicted. Its 18% DEF Shred only lands
 *  while Carlotta herself is the active member, checked by `isHeld(CARLOTTA_RESONATOR)`: this buff's own
 *  applyStats() runs on every member's turn, but `currentSlot` there is always whoever's acting. */
const DECONSTRUCTION = new Debuff({
  name: "Carlotta: Deconstruction", duration: 60 * 4,
  applyStats: () => { if (isHeld(CARLOTTA_RESONATOR)) addStat(Stat.DefIgnoreOld, 18); },
});

const CL_INHERENT_1 = new Inherent({
  name: "Inherent: Flawless Purity",
  // interrupt immune
});

const CL_INHERENT_2 = new Inherent({
  name: "Inherent: Ars Gratia Artis",
  updateDebuffs: () => {
    if (runningAction(Intro) || runningAction(Skill2) || runningAction(DeathKnell) || runningAction(FHA)) applyEnemy(DECONSTRUCTION, 1);
  },
});

/** A pure state marker — entered on Era of New Wave, left once Fatal Finale resolves, so Final
 *  Bow can read whether it's still open. Revoked in convertStats(), not updateBuffs(), so a same-action
 *  reader still sees it held. */
const TWILIGHT_TANGO = new Buff({
  name: "Carlotta: Twilight Tango", duration: 60 * 10,
  convertStats: () => {
    if (runningAction(FatalFinale)) revokeCurrent(TWILIGHT_TANGO);
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
    if (runningAction(Lib1) || runningAction(DeathKnell) || runningAction(FatalFinale)) addStat(Stat.MulMv, 80);
  },
  convertStats: () => {
    if (isHeld(TWILIGHT_TANGO) && currentAction().swapOut) revokeCurrent(FINAL_BOW);
  },
});

/* --------------------------------------------------------------------------- resonance chain */

/** S1: +12.5% Crit Rate on any hit into a Deconstruction target, and Chromatic Splendor restores
 *  30 more Substance — it always follows Art of Violence, whose Dispersion is what it asks for. */
const CL_S1 = new Sequence({
  name: "Carlotta S1: Beauty Blazes Brightest Before It Fades",
  applyStats: () => { if (stacksOfEnemy(DECONSTRUCTION) > 0) addStat(Stat.CritRate, 12.5); },
  convertStats: () => { if (runningAction(Skill2)) addStat(Stat.AddForte2, 30); },
});

/** S2: Fatal Finale's multiplier +126%. */
const CL_S2 = new Sequence({
  name: "Carlotta S2: Fallen Petals Give Life to New Blooms",
  applyStats: () => { if (runningAction(FatalFinale)) addStat(Stat.MulMv, 126); },
});

/** S3: one more strike at the end of Closing Remark — 1032.18% ATK, queued behind the outro on her
 *  own slot — and +93% multiplier on Art of Violence and Chromatic Splendor. */
const Sparks = carlottaAction("Outro - Kaleidoscope Sparks", { animFrames: 0, type: Type.Outro, hits: [{ at: 0, mv: 1032.18 }]});
const CL_S3 = new Sequence({
  name: "Carlotta S3: Adelante, Cortado, Spinning in Grace",
  applyStats: () => { if (runningAction(Skill1) || runningAction(Skill2)) addStat(Stat.MulMv, 93); },
  updateDebuffs: () => {
    if (runningAction(Outro)) queue(Sparks);
  },
});

/** S4: any of her three Heavy Attacks gives the whole team +25% Resonance Skill DMG Bonus for 30s —
 *  "all Resonators in the team", so it pays off-field too, and long enough to be permanent. */
const FINEST_WINE = new Buff({
  name: "Carlotta S4: Yesterday's Raindrops Make Finest Wine",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 25, Type.Skill]],
});
const CL_S4 = new Sequence({
  name: "Carlotta S4: Yesterday's Raindrops Make Finest Wine",
  updateBuffs: () => { if (runningAction(HA) || runningAction(EHA) || runningAction(FHA)) applyTeam(FINEST_WINE, 1); },
});

/** S5: Imminent Oblivion's multiplier +47%. */
const CL_S5 = new Sequence({
  name: "Carlotta S5: Toast to Past, Today, and Every Day to Come",
  applyStats: () => { if (runningAction(FHA)) addStat(Stat.MulMv, 47); },
});

/** S6: Death Knell's shots hit harder and double up — +186.6% multiplier in total. */
const CL_S6 = new Sequence({
  name: "Carlotta S6: As the Curtain Falls, I Remain What I Am",
  applyStats: () => { if (runningAction(DeathKnell)) addStat(Stat.MulMv, 186.6); },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CARLOTTA_TALENTS = new Talent({
  name: "Carlotta: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const CARLOTTA_RESONATOR = new Resonator({
  name: "Carlotta",
  stats: [[Stat.BaseHp, 12450], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1197.7756]],
  matrix: matrix("Carlotta", 25),
  talent: CARLOTTA_TALENTS,
  inherent1: CL_INHERENT_1,
  inherent2: CL_INHERENT_2,
  element: Attribute.Glacio,
  weapon: WeaponType.Pistols,
  color: "#8fb3d9",
  intro: Intro,
  maxEnergy: 125,
  maxForte1: 6,
  maxForte2: 120,
  maxForte3: 4,

  // Final Bow is a state entered on the gauge filling, so it is read off the gauge as each
  // action leaves it — the only phase that sees Chromatic Splendor's own conversion banked
  afterAction: () => { if (forte2() >= 120) applyCurrent(FINAL_BOW, 1); },

});

// Intro (+30 Substance, on the 30 the last Chromatic Splendor left) into Art of Violence/Chromatic
// Splendor (six crystals, +60) fills the gauge — Final Bow — which Imminent Oblivion then spends
// before Liberation opens Twilight Tango with the state still up.
// She's never the team's own lead, so this covers both opener and loop.

const DeathKnellx4 = new ActionGroup("Liberation - Death Knell x4", [DeathKnell, DeathKnell, DeathKnell, DeathKnell]);
const Skill12 = new ActionGroup("Skill - Art of Violence + Chromatic Splendor", [Skill1, Skill2]);
const NM123 = new ActionGroup("Silent Execution: Necessary Measures 123", [NM1, NM2, NM3]);

const CL_ROTATION = new Rotation([
  START_2, HA, NM123.instaSwap(),
  START_3, Skill12.instaSwap(),
  INTRO, Skill12, MA1.easyCancel(), FHA.cancel(),
  Lib1, DeathKnellx4.cancel(), FatalFinale,
  Skill12, ECHO.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const CARLOTTA = new Loadout({
  resonator: CARLOTTA_RESONATOR,
  sequences: [CL_S1, CL_S2, CL_S3, CL_S4, CL_S5, CL_S6],
  weapons: [THE_LAST_DANCE, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: [new EchoLoadout(SENTRY_CONSTRUCT, FROSTY_RESOLVE_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.Skill, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic),
    rotation: CL_ROTATION,
});
