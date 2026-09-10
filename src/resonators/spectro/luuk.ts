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
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  addStat,
  applyCurrent,
  casting,
  currentAction,
  runningAction,
  forte1,
  getStat,
  maxStackIncrease,
  queue,
  revokeCurrent,
  setForte1,
  frozenStacks,
  stacksOfEnemy,
  applyEnemy,
  applyTeam,
  isHeld,
  stacksOf,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, START_3, SWAP, INTRO, ECHO_SWAP, OUTRO, DODGE } from "../../engine/rotation.js";
import { applied } from "../../engine/context.js";
import { lostOnSwap } from "../../shared/helpers.js";
import { TUNE_STRAIN_SHIFTING } from "../../shared/tunebreak.js";
import { applyStrain, TUNE_BREAK, TUNE_STRAIN_INTERFERED, TUNE_STRAIN_RESPONDER } from "../../shared/tunebreak.js";
import { DAYBREAKERS_SPINE } from "../../weapons/gauntlet.js";
import { NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import {
  NEBULOUS_CANNON, GILDED_REVELATION_5PC, VOIDWING_MOTH, REEL_5PC,
} from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

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
const DC = luukAction("Dodge Counter - Such is Light", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 251.8, energy: 2.24, concerto: 17.46, offtune: 7120, forte1: 11.13 });

// --- the mid-air chain. Stage 2 and 3 come in two forms by input: Scythe: Dissection (Normal
//     Attack) or Scythe: Resection (Jump), the latter inflicting Tune Strain - Shifting. Stage 3
//     of either is what replaces Resonance Skill with Aureole of Execution.
const MA1 = luukAction("Mid-air - Such is Light 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 57.46, energy: 0.85, concerto: 1.7, offtune: 2720, forte1: 8.5 });
const MA2 = luukAction("Mid-air - Scythe: Dissection 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 94.09, energy: 1.4, concerto: 2.5, offtune: 4000, forte1: 12.5 });
const MA3 = luukAction("Mid-air - Scythe: Dissection 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 143.1, energy: 2.73, concerto: 3.96, offtune: 6320, forte1: 19.76 });
// Resection 2/3, Golden Reflux, every Aureole of Execution and his Intro lay Tune Strain - Shifting
const STRAIN = { updateDebuffs: () => applyStrain() };
const MA2R = luukAction("Mid-air - Scythe: Resection 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 100.84, energy: 1.5, concerto: 2.7, offtune: 4320, forte1: 13.5, ...STRAIN });
const MA3R = luukAction("Mid-air - Scythe: Resection 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 149.84, energy: 2.82, concerto: 4.16, offtune: 6640, forte1: 20.76, ...STRAIN });
const MA4 = luukAction("Mid-air - Such is Light 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78, energy: 1.55, concerto: 1, offtune: 4960, forte1: 15.5 });
const MDC = luukAction("Dodge Counter - Such is Light (Mid-Air)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 256.87, energy: 2.3, concerto: 17.6, offtune: 7360, forte1: 23 });

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
const Gavel = luukAction("Basic - Gavel of Earthshaker", {
  node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 306.9, energy: 6, concerto: 10, offtune: 8080, forte1: 25.25,
  updateBuffs: () => queue(IchorDeposit),
});

/** Ichor Blade: 10 flat Spectro DMG every 0.15s for 5s, counted as Basic Attack DMG but immune to
 *  every bonus — Scaling.Fixed, in the same x100 units Roccia's own fixed hit uses. Taken at the
 *  table's full 5s (33 ticks); in play it vanishes on his next damaging cast, so this is its
 *  ceiling — at 330 damage a summon, nothing turns on it. Hurled by the Intro and by Breach. */
const IchorBlade = luukAction("Forte - Ichor Blade", { node: Node.Forte, type: Type1.Basic, scaling: Scaling.Fixed, mv: 10 * 33 });

const Liberation = luukAction("Liberation - Rewritten in Winter's Margins", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Basic, mv: 994.09, concerto: 20, offtune: 67200, resetEnergy: true,
});

const Intro = luukAction("Intro - Before Injection of Dawn", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 218.01, energy: 10.02, concerto: 10, offtune: 10320, forte1: 100, ...STRAIN,
  // updateBuffs: () => applyCurrent(DAWNLIT_KEEP, 1),  // DAWNLIT_KEEP grants no stat and nothing reads it
});
const Outro = luukAction("Outro - Bow to the Last Light", {
  cast: Cast.Outro, type: Type1.Outro, mv: 500, concerto: -100, swapOut: true,
  updateBuffs: () => applyCurrent(GOLDEN_RULE),
});

/** Every form of Aureole of Execution — what banks an Endnote. */
const isAureole = (): boolean => runningAction(Ring) || runningAction(Breach) || runningAction(Glare);

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
    if (forte1() <= 0 && !runningAction(Gavel) && !runningAction(IchorDeposit) && !runningAction(TUNE_BREAK)) revokeCurrent(AUREATE_JUDGE);
  },
  applyStats: () => {
    const a = currentAction();
    if (a.forte1 > 0) addStat(Stat.AddForte1, -a.forte1);
    if (isAureole() || runningAction(Gavel)) { addStat(Stat.MulMv, 110); addStat(Stat.AddOfftune, 25200); }
    if (isAureole()) {
      addStat(Stat.AddForte1, -100);
    }
    if (runningAction(IchorDeposit)) addStat(Stat.MulMv, 110);
  },
});

/** Endnotes on the Endgame: every Aureole cast banks a stack, 3 max, each +25% to the Liberation's
 *  own DMG Multiplier; the Liberation spends them all, and switching out drops them. */
const ENDNOTES = new Buff({
  name: "Luuk: Endnotes on the Endgame", maxStacks: 3,
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 25 * frozenStacks()); },
  convertStats: () => { lostOnSwap(); if (runningAction(Liberation)) revokeCurrent(ENDNOTES); },
});

/** Golden Rule: a teammate's Outro that brings Luuk in hands him 200 Ichor Flow and 12 Concerto —
 *  once per 24s, which at the length these loops run is every loop. He is always brought in that
 *  way, so it's simply armed on his own Outro (and at combat start, for his first entry) and paid
 *  on the Intro that follows. */
const GOLDEN_RULE = new Buff({
  name: "Luuk: Golden Rule",
  applyStats: () => { if (casting(Cast.Intro)) { addStat(Stat.AddForte1, 200); addStat(Stat.AddConcerto, 12); } },
  convertStats: () => { if (casting(Cast.Intro)) revokeCurrent(GOLDEN_RULE); },
});

/** Uncaused Diagnosis, the ATK half: any nearby teammate (himself included) inflicting Tune Strain
 *  - Shifting or dealing Tune Break DMG gives him +25% ATK for 20s — a short self buff, lost after
 *  his outro. "Nearby", so it lands whether or not he's on field. */
const UNCAUSED_DIAGNOSIS_ATK = new Buff({
  name: "Inherent: Uncaused Diagnosis",
  stats: [[Stat.BonusAtk, 25]],
});

/** Dawnlit Keep: one stack, granted by his Intro (or 4s out of combat), spent on taking a hit for
 *  -60% DMG taken and interruption immunity — purely defensive, so it holds no stat here. */
const DAWNLIT_KEEP = new Buff({ name: "Luuk: Dawnlit Keep", maxStacks: 1 });

/* --------------------------------------------------------------------------- kit and loadout */

/** Pulses Under the Snow (Inherent Skill): Perpetuating Daytime is banked off the team *defeating*
 *  targets under Tune Strain - Interfered and spent re-applying those stacks on the next Tune
 *  Break. A single-target rotation never defeats anything, so nothing here can ever fire — the
 *  piece is present for the kit's shape and contributes nothing. */
const LK_INHERENT_1 = new Inherent({ name: "Inherent: Pulses Under the Snow" });

/** Uncaused Diagnosis (Inherent Skill): against a target under Tune Strain - Interfered, every 10
 *  points of his Tune Break Boost amplifies his own hits by 5%, up to 30% — read live in convertStats()
 *  so every Tbb contribution has landed (the era's flat 10, Reel's +20, ...). The ATK half watches
 *  the whole team's casts from updateGlobal(), see UNCAUSED_DIAGNOSIS_ATK. */
const LK_INHERENT_2 = new Inherent({
  name: "Inherent: Uncaused Diagnosis",
  updateGlobal: () => {
    if (applied(TUNE_STRAIN_SHIFTING) || runningAction(TUNE_BREAK)) applyCurrent(UNCAUSED_DIAGNOSIS_ATK, 1);
  },
  // late, like every Tune Break Boost read — a team's own Tbb can arrive from another gear's
  // convertStats (Denia's Etched Colors), which an ordinary convertStats here would race
  lateConvertStats: () => {
    if (stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0) addStat(Stat.Amp, Math.min(30, 5 * Math.floor(getStat(Stat.Tbb) / 10)));
  },
});

const LUUK_TALENTS = new Talent({
  name: "Luuk: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

const LUUK_RESONATOR = new Resonator({
  name: "Luuk Herssen",
  talent: LUUK_TALENTS,
  inherent1: LK_INHERENT_1,
  inherent2: LK_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Gauntlets,
  intro: () => Intro,
  outro: () => Outro,
  color: "#ddb246",
  maxEnergy: 125,
  maxForte1: 300,

  // his kit raises the target's Tune Strain - Interfered limit by 1 on top of the base 1; Golden
  // Rule is armed from the start so his first Intro is brought in the same way every later one is
  combatStart: () => { maxStackIncrease(TUNE_STRAIN_INTERFERED, 1); applyCurrent(TUNE_STRAIN_RESPONDER, 1); applyCurrent(GOLDEN_RULE, 1); },

  updateBuffs: () => {
    if (forte1() >= 300) applyCurrent(AUREATE_JUDGE, 1);
    if (isAureole()) applyCurrent(ENDNOTES, 1);
  },

  constantStats: () => {
    addStat(Stat.BaseHp, 10300); addStat(Stat.BaseAtk, 462.5); addStat(Stat.BaseDef, 1112.2);
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    addStat(Stat.Tbb, 10);
  },
});

/* --------------------------------------------------------------------------------- sequences */

/** Every cast the kit calls a Mid-air Attack — the chain, both Scythe forms, and the Gavel, which
 *  its own page names one even though this file files it under the Forte node. */
const midAir = (): boolean => runningAction(MA1) || runningAction(MA2) || runningAction(MA3)
  || runningAction(MA2R) || runningAction(MA3R) || runningAction(MA4) || runningAction(Gavel);

/** S1: +150% Mid-air Attack DMG Bonus. The Dawnlit Keep half is a shield charge — no stat here,
 *  and nothing reads the buff. */
const LK_S1 = new Sequence({
  name: "Luuk S1: Gold Kindled in Ash",
  applyStats: () => { if (midAir()) addStat(Stat.DmgBonus, 150); },
});

/** S2: the Liberation +60% multiplier — additive with Endnotes' own, which the node says outright
 *  and nanoka's rows confirm (1839.00% at one Endnote against 994.09% base, so 1 + 0.6 + 0.25) —
 *  and Uncaused Diagnosis doubled: 10% a 10 points of Tune Break Boost to a 60% cap, which is the
 *  base reading again on top of itself. */
const LK_S2 = new Sequence({
  name: "Luuk S2: Avalanche Roaring in Eyes",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 60); },
  lateConvertStats: () => {
    if (stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0) addStat(Stat.Amp, Math.min(30, 5 * Math.floor(getStat(Stat.Tbb) / 10)));
  },
});

/** S3: +136% multiplier on every Aureole form in Aureate Judge, and on the Gavel and Ichor Deposit
 *  a Glare marks — additive with the state's own +110%, which nanoka's third row for each hit gives
 *  exactly (Ring 766.90% against 221.33%, so x3.46). Perpetuating Daytime never fires here. */
const LK_S3 = new Sequence({
  name: "Luuk S3: Spine Tempered by Golden Rain",
  applyStats: () => {
    if (!isHeld(AUREATE_JUDGE)) return;
    if (isAureole() || runningAction(Gavel) || runningAction(IchorDeposit)) addStat(Stat.MulMv, 136);
  },
});

/** S4: +20% DMG to the whole team for 20s off any member's Tune Break — one lands every loop, so
 *  it never lapses. */
const PULSE_UNDER_RIME = new Buff({ name: "Luuk S4: Pulse Thrumming Under Rime", stats: [[Stat.DmgBonus, 20]] });
const LK_S4 = new Sequence({
  name: "Luuk S4: Pulse Thrumming Under Rime",
  updateGlobal: () => { if (runningAction(TUNE_BREAK)) applyTeam(PULSE_UNDER_RIME, 1); },
});

/** S5: +80% DMG Bonus on his Intro and Outro, and Golden Reflux at x1.5 — multiplicative, its own
 *  second row (301.80% against 201.20%), and nothing else multiplies it. The extra charge and the
 *  shorter cooldown buy no press this line doesn't already make. */
const LK_S5 = new Sequence({
  name: "Luuk S5: Through the Stillness of Snowstorm",
  applyStats: () => {
    if (runningAction(Intro) || runningAction(Outro)) addStat(Stat.DmgBonus, 80);
    if (runningAction(Skill)) addStat(Stat.MulMv, 50);
  },
});

/** What a team Tune Break leaves for S6: 25s in which the target takes 30% more from every Aureole
 *  form, the Ichor Deposit and the Gavel. One break a loop, so it stands. */
const DAWN_UNFURLING = new Buff({
  name: "Luuk S6: Dawn Unfurling over Frostlands",
  applyStats: () => {
    if (isAureole() || runningAction(IchorDeposit) || runningAction(Gavel)) addStat(Stat.DamageTaken, 30); // unknown if it stacks with strain?
  },
});
/** S6: that window, +40% Liberation DMG Bonus an Endnote to a 120% cap, and two more Tune Strain -
 *  Interfered on the target off every hit of his that lands on one. "Ignores the max stack limit"
 *  has no engine form — the cap is raised by the two it adds instead, which holds the target at
 *  four rather than letting every cast pile on without end. */
const LK_S6 = new Sequence({
  name: "Luuk S6: Dawn Unfurling over Frostlands",
  combatStart: () => maxStackIncrease(TUNE_STRAIN_INTERFERED, 2),
  updateGlobal: () => { if (runningAction(TUNE_BREAK)) applyCurrent(DAWN_UNFURLING, 1); },
  updateDebuffs: () => {
    if (currentAction().mv > 0 && stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0) applyEnemy(TUNE_STRAIN_INTERFERED, 2);
  },
  applyStats: () => {
    if (runningAction(Liberation)) addStat(Stat.DmgBonus, Math.min(120, 40 * stacksOf(ENDNOTES)));
  },
});

const LK_SEQUENCES = [LK_S1, LK_S2, LK_S3, LK_S4, LK_S5, LK_S6];

/* ---------------------------------------------------------------------------------- rotation */

/** The migrated sheet's own line: the Intro (100 Flow) plus Golden Rule (200) fill the gauge, so
 *  the whole loop runs in Aureate Judge — Intro into mid-air Stage 2/3 (Stage 3 opens Aureole),
 *  Ring, the mid-air chain, Breach, chain again, Glare, the marked Gavel (which detonates the
 *  marked Deposit), Liberation at three Endnotes, echo, out. He's always the team's main DPS, so
 *  this covers opener and loop. */

const MA123 = new ActionGroup("Mid-air - Scythe: Dissection 123", [MA1, MA2, MA3]);

const MA23 = new ActionGroup("Mid-air - Scythe: Dissection 23", [MA2, MA3]);

const LK_ROTATION = new Rotation([
  START_3, Skill, Liberation, SWAP,
  INTRO, MA23, Ring, GoldenImpale,  // TODO add dodge/jumps
  MA123, Breach, GoldenImpale, 
  MA123, Glare, Gavel,
  Liberation, ECHO_SWAP, OUTRO,
]);

const LK_ECHOES = [
  new EchoLoadout(NEBULOUS_CANNON, GILDED_REVELATION_5PC),
];

export const LUUK = new Loadout({
  resonator: LUUK_RESONATOR,
  weapons: [DAYBREAKERS_SPINE, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: LK_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Er),
  rotation: LK_ROTATION,
  sequences: LK_SEQUENCES,
});
