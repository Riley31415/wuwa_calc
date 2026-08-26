/**
 * Luuk Herssen — a Spectro Gauntlets main DPS whose whole kit is Basic Attack DMG, and the third
 * kit on the Tune Break variants (see tunebreak.ts). He both inflicts Tune Strain - Shifting (his
 * Intro, Golden Reflux, every form of Aureole of Execution, and the Scythe: Resection mid-air line)
 * and answers Tune Strain - Interfered the way Lynae and Mornye do: 0.12% total DMG per point of
 * his Tune Break Boost per stack on the target, whose stack cap he raises by 1.
 *
 * Ichor Flow (forte1, 0-300) is the gauge everything turns on. Full Flow enters Aureate Judge,
 * where every Aureole form hits for +110% MV and spends 100 Flow, Flow stops restoring, and the
 * state ends when the gauge empties; an Aureate Glare also marks the next Gavel of Earthshaker and
 * its Ichor Deposit for +110%. All of that is stat contributions from the one AUREATE_JUDGE buff onto
 * the one set of base actions — nanoka's Aureate rows carry identical energy/concerto and a flat
 * +25 200 off-tune per cast on top of the base, so that is what the buff adds. Golden Rule hands
 * him 200 Flow and 12 Concerto whenever a teammate's Outro brings him in, which with the Intro's
 * own 100 is exactly what fills the gauge — so his loop runs entirely in Aureate Judge.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1510), per-hit × hit count as CLAUDE.md
 * describes, with the flat Concerto Regen rows folded in (Liberation 20, Intro 10, Gavel 10) and the
 * hidden +10 on both Dodge Counters. Ichor Flow: the Intro's 100, Golden Rule's 200 and the Aureate
 * spend of 100 are kit text; every per-hit restore is wuwalab's frame data (api.wuwalab.com
 * /api/app/characters/luukherssen, `forte_1` per hit in the same x100 units as energy — a hit's
 * Flow is its energy x10), summed per action the same way the MVs are.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, Stat, Attribute, WeaponType, Type1, Cast, Node,
  Scaling, addStat, applyCurrent, casting, currentAction, forte1, getStat, maxStackIncrease, queue, revokeSelf,
  setForte1, frozenStacks, stacksOfEnemy, lostOnSwap,
} from "../../engine/kit.js";
import { Rotation, START_COMBAT, INTRO, ECHO_CAST, OUTRO_NEXT } from "../../engine/rotation.js";
import { applied } from "../../engine/kit.js";
import { TUNE_STRAIN_SHIFTING } from "../../engine/tunebreak.js";
import { applyStrain, TUNE_BREAK, TUNE_STRAIN_INTERFERED, tuneStrainBonus } from "../../engine/tunebreak.js";
import { DAYBREAKERS_SPINE } from "../../weapons/gauntlet.js";
import { NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import {
  NEBULOUS_CANNON, GILDED_REVELATION_5PC, GILDED_REVELATION_2PC, VOIDWING_MOTH, REEL_5PC, REEL_2PC,
} from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../engine/mainstats.js";
import { chem } from "../../engine/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function luukAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Such is Light, the ground chain. Stage 3 hurls a whirling blade (5.02% x30, taken at the
//     table's own full count); Stage 4 is what replaces Resonance Skill with Aureole of Execution.
const BA1 = luukAction("Basic - Such is Light 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 81.12, energy: 1.2, concerto: 2.4, offtune: 3840, forte1: 12 });
const BA2 = luukAction("Basic - Such is Light 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 150.4, energy: 2.23, concerto: 4.45, offtune: 7120, forte1: 22.25 });
const BA3 = luukAction("Basic - Such is Light 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 150.6, energy: 2.4, concerto: 4.5, offtune: 7110, forte1: 22.5 });
const BA4 = luukAction("Basic - Such is Light 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 96.33, energy: 1.43, concerto: 2.85, offtune: 4560, forte1: 14.25 });
const HA = luukAction("Heavy - Such is Light", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 91.26, energy: 1.35, concerto: 2.7, offtune: 4320, forte1: 13.5 });
const DC = luukAction("Basic - Such is Light (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 251.8, energy: 2.24, concerto: 17.46, offtune: 7120, forte1: 11.13 });

// --- the mid-air chain. Stage 2 and 3 come in two forms by input: Scythe: Dissection (Normal
//     Attack) or Scythe: Resection (Jump), the latter inflicting Tune Strain - Shifting. Stage 3
//     of either is what replaces Resonance Skill with Aureole of Execution.
const MA1 = luukAction("Basic - Such is Light (Mid-Air) 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 57.46, energy: 0.85, concerto: 1.7, offtune: 2720, forte1: 8.5 });
const MA2 = luukAction("Basic - Scythe: Dissection 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 94.09, energy: 1.4, concerto: 2.5, offtune: 4000, forte1: 12.5 });
const MA3 = luukAction("Basic - Scythe: Dissection 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 143.1, energy: 2.73, concerto: 3.96, offtune: 6320, forte1: 19.76 });
// Resection 2/3, Golden Reflux, every Aureole of Execution and his Intro lay Tune Strain - Shifting
const STRAIN = { updateDebuffs: () => applyStrain() };
const MA2R = luukAction("Basic - Scythe: Resection 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 100.84, energy: 1.5, concerto: 2.7, offtune: 4320, forte1: 13.5, ...STRAIN });
const MA3R = luukAction("Basic - Scythe: Resection 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 149.84, energy: 2.82, concerto: 4.16, offtune: 6640, forte1: 20.76, ...STRAIN });
const MA4 = luukAction("Basic - Such is Light (Mid-Air) 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78, energy: 1.55, concerto: 1, offtune: 4960, forte1: 15.5 });
const MDC = luukAction("Basic - Such is Light (Mid-Air Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 256.87, energy: 2.3, concerto: 17.6, offtune: 7360, forte1: 23 });

// --- Reunion of All the Fallen. Golden Reflux is the plain Resonance Skill (2 charges); after
//     Basic Stage 4 / Mid-air Stage 3 it becomes Aureole of Execution, cycling Ring -> Breach ->
//     Glare, every form Basic Attack DMG, each inflicting Tune Strain - Shifting and banking an
//     Endnote. Ring and Breach reset the mid-air chain and make the next Normal Attack a Golden
//     Impale; Breach also hurls an Ichor Blade; Glare lays the Ichor Deposit that Gavel of
//     Earthshaker detonates.
const Skill = luukAction("Skill - Golden Reflux", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 201.2, energy: 2.3, concerto: 4.6, offtune: 7360, forte1: 23, ...STRAIN });
const Ring = luukAction("Skill - Aureole of Execution: Ring", { node: Node.Skill, cast: Cast.Skill, type: Type1.Basic, mv: 221.33, energy: 8, concerto: 10, offtune: 10400, forte1: 32.5, ...STRAIN });
const Breach = luukAction("Skill - Aureole of Execution: Breach", { node: Node.Skill, cast: Cast.Skill, type: Type1.Basic, mv: 287.73, energy: 8.01, concerto: 10.02, offtune: 10320, forte1: 32.25, ...STRAIN });
const Glare = luukAction("Skill - Aureole of Execution: Glare", { node: Node.Skill, cast: Cast.Skill, type: Type1.Basic, mv: 354.11, energy: 6, concerto: 10, offtune: 7840, forte1: 24.5, ...STRAIN });
const GoldenImpale = luukAction("Basic - Golden Impale", { node: Node.Skill, cast: Cast.Basic, type: Type1.Basic, mv: 155.47, energy: 2.3, concerto: 4.6, offtune: 7360, forte1: 23 });
/** Detonates 5s after Glare lays it, or the moment a Gavel of Earthshaker lands on it — queued
 *  off the Gavel here, since the rotation always follows a Glare with one. */
const IchorDeposit = luukAction("Skill - Ichor Deposit", { node: Node.Skill, type: Type1.Basic, mv: 153.45 });

// --- Spark from the Frost. Gavel of Earthshaker is the mid-air slam a Glare opens up; it
//     detonates the Deposit, and its Concerto is all the flat regen row (the hit itself carries 0).
const Gavel = luukAction("Forte - Gavel of Earthshaker", {
  node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 306.9, energy: 6, concerto: 10, offtune: 8080, forte1: 25.25,
  updateBuffs: () => queue(IchorDeposit),
});

/** Ichor Blade: 10 flat Spectro DMG every 0.15s for 5s, counted as Basic Attack DMG but immune to
 *  every bonus — Scaling.Fixed, in the same x100 units Roccia's own fixed hit uses. Taken at the
 *  table's full 5s (33 ticks); in play it vanishes on his next damaging cast, so this is its
 *  ceiling — at 330 damage a summon, nothing turns on it. Hurled by the Intro and by Breach. */
const IchorBlade = luukAction("Forte - Ichor Blade", { node: Node.Forte, type: Type1.Basic, scaling: Scaling.Fixed, mv: 1000 * 33 });

const Liberation = luukAction("Liberation - Rewritten in Winter's Margins", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Basic, mv: 994.09, concerto: 20, offtune: 67200, resetEnergy: true,
});

const Intro = luukAction("Intro - Before Injection of Dawn", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 218.01, energy: 10.02, concerto: 10, offtune: 10320, forte1: 100, ...STRAIN,
  updateBuffs: () => applyCurrent(DAWNLIT_KEEP, 1),
});
const Outro = luukAction("Outro - Bow to the Last Light", {
  cast: Cast.Outro, type: Type1.Outro, mv: 500, active: false,
  updateBuffs: () => applyCurrent(GOLDEN_RULE),
});

/** Every form of Aureole of Execution — what banks an Endnote. */
const isAureole = (a: Action): boolean => a === Ring || a === Breach || a === Glare;

/* ------------------------------------------------------------------------------------- buffs */

/** Aureate Judge: entered at full Ichor Flow (300). While it's up, every Aureole form hits for
 *  +110% MV, banks the flat +25 200 off-tune nanoka's Aureate rows add over the base, and spends
 *  100 Flow; Flow doesn't restore — every positive Flow delta an action declares is cancelled back
 *  out here. It ends once the gauge empties, except that the Gavel of Earthshaker and Ichor Deposit
 *  an Aureate Glare marks (+110% MV, the Gavel's own +25 200 too) are still paid as part of the
 *  state — one beat longer rather than a separate mark buff. */
const AUREATE_JUDGE = new Buff({
  name: "Luuk: Aureate Judge",
  updateBuffs: () => {
    const a = currentAction();
    // a Tune Break landing between the Glare and its Gavel/Deposit isn't his cast, so it can't close it
    if (forte1() <= 0 && a !== Gavel && a !== IchorDeposit && a !== TUNE_BREAK) revokeSelf(AUREATE_JUDGE);
  },
  applyStats: () => {
    const a = currentAction();
    if (a.forte1 > 0) addStat(Stat.AddForte1, -a.forte1);
    if (isAureole(a) || a === Gavel) { addStat(Stat.MulMv, 110); addStat(Stat.AddOfftune, 25200); }
    if (isAureole(a)) {
      if (forte1() > 300) setForte1(300);
      addStat(Stat.AddForte1, -100);
    }
    if (a === IchorDeposit) addStat(Stat.MulMv, 110);
  },
});

/** Endnotes on the Endgame: every Aureole cast banks a stack, 3 max, each +25% to the Liberation's
 *  own DMG Multiplier; the Liberation spends them all, and switching out drops them. */
const ENDNOTES = new Buff({
  name: "Luuk: Endnotes on the Endgame", maxStacks: 3,
  applyStats: () => { if (currentAction() === Liberation) addStat(Stat.MulMv, 25 * frozenStacks()); },
  convertStats: () => { lostOnSwap(); if (currentAction() === Liberation) revokeSelf(ENDNOTES); },
});

/** Golden Rule: a teammate's Outro that brings Luuk in hands him 200 Ichor Flow and 12 Concerto —
 *  once per 24s, which at the length these loops run is every loop. He is always brought in that
 *  way, so it's simply armed on his own Outro (and at combat start, for his first entry) and paid
 *  on the Intro that follows. */
const GOLDEN_RULE = new Buff({
  name: "Luuk: Golden Rule",
  applyStats: () => { if (casting(Cast.Intro)) { addStat(Stat.AddForte1, 200); addStat(Stat.AddConcerto, 12); } },
  convertStats: () => { if (casting(Cast.Intro)) revokeSelf(GOLDEN_RULE); },
});

/** Uncaused Diagnosis, the ATK half: any nearby teammate (himself included) inflicting Tune Strain
 *  - Shifting or dealing Tune Break DMG gives him +25% ATK for 20s — a short self buff, lost after
 *  his outro. "Nearby", so it lands whether or not he's on field. */
const UNCAUSED_DIAGNOSIS_ATK = new Buff({
  name: "Luuk: Uncaused Diagnosis",
  applyStats: () => addStat(Stat.BonusAtk, 25),
});

/** Dawnlit Keep: one stack, granted by his Intro (or 4s out of combat), spent on taking a hit for
 *  -60% DMG taken and interruption immunity — purely defensive, so it holds no stat here. */
const DAWNLIT_KEEP = new Buff({ name: "Luuk: Dawnlit Keep", maxStacks: 1 });

/* --------------------------------------------------------------------------- kit and loadout */

/** Pulses Under the Snow (Inherent Skill): Perpetuating Daytime is banked off the team *defeating*
 *  targets under Tune Strain - Interfered and spent re-applying those stacks on the next Tune
 *  Break. A single-target rotation never defeats anything, so nothing here can ever fire — the
 *  piece is present for the kit's shape and contributes nothing. */
const LK_INHERENT_1 = new Inherent({ name: "Luuk: Pulses Under the Snow" });

/** Uncaused Diagnosis (Inherent Skill): against a target under Tune Strain - Interfered, every 10
 *  points of his Tune Break Boost amplifies his own hits by 5%, up to 30% — read live in convertStats()
 *  so every Tbb contribution has landed (the era's flat 10, Reel's +20, ...). The ATK half watches
 *  the whole team's casts from updateGlobal(), see UNCAUSED_DIAGNOSIS_ATK. */
const LK_INHERENT_2 = new Inherent({
  name: "Luuk: Uncaused Diagnosis",
  updateGlobal: () => {
    const a = currentAction();
    if (applied(TUNE_STRAIN_SHIFTING) || a === TUNE_BREAK) applyCurrent(UNCAUSED_DIAGNOSIS_ATK, 1);
  },
  // late, like every Tune Break Boost read — a team's own Tbb can arrive from another gear's
  // convertStats (Denia's Etched Colors), which an ordinary convertStats here would race
  lateConvertStats: () => {
    if (stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0) addStat(Stat.Amp, Math.min(30, 5 * Math.floor(getStat(Stat.Tbb) / 10)));
  },
});

const LUUK_TALENTS = new Talent({
  name: "Luuk: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8); },
});

const LUUK = new Resonator({
  name: "Luuk",
  element: Attribute.Spectro,
  weapon: WeaponType.Gauntlets,
  intro: () => Intro,
  outro: () => Outro,
  color: "#d9b44a",
  maxEnergy: 125,

  // his kit raises the target's Tune Strain - Interfered limit by 1 on top of the base 1; Golden
  // Rule is armed from the start so his first Intro is brought in the same way every later one is
  combatStart: () => { maxStackIncrease(TUNE_STRAIN_INTERFERED, 1); applyCurrent(GOLDEN_RULE, 1); },
  lateConvertStats: () => tuneStrainBonus(),

  updateBuffs: () => {
    if (forte1() >= 300) applyCurrent(AUREATE_JUDGE, 1);
    if (isAureole(currentAction())) applyCurrent(ENDNOTES, 1);
  },

  constantStats: () => {
    addStat(Stat.BaseHp, 10300); addStat(Stat.BaseAtk, 462.5); addStat(Stat.BaseDef, 1112.2);
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    addStat(Stat.Tbb, 10);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

/** The migrated sheet's own line: the Intro (100 Flow) plus Golden Rule (200) fill the gauge, so
 *  the whole loop runs in Aureate Judge — Intro into mid-air Stage 2/3 (Stage 3 opens Aureole),
 *  Ring, the mid-air chain, Breach, chain again, Glare, the marked Gavel (which detonates the
 *  marked Deposit), Liberation at three Endnotes, echo, out. He's always the team's main DPS, so
 *  this covers opener and loop. */

const LK_ROTATION = new Rotation([
  START_COMBAT, Skill, Liberation, START_COMBAT,
  INTRO, MA2, MA3,
  Ring, MA1, MA2, MA3,
  Breach, MA1, MA2, MA3,
  Glare, Gavel,
  Liberation, ECHO_CAST, OUTRO_NEXT,
]);

const LK_ECHOES = [
  new EchoLoadout(NEBULOUS_CANNON, GILDED_REVELATION_5PC, GILDED_REVELATION_2PC),
];

export const LUUK_LOADOUT = new Loadout({
  resonator: LUUK,
  talent: LUUK_TALENTS,
  inherent1: LK_INHERENT_1,
  inherent2: LK_INHERENT_2,
  weapons: [DAYBREAKERS_SPINE, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: LK_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
    rotation: LK_ROTATION,
});
