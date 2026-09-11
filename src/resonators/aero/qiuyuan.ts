/**
 * Qiuyuan, ported to the new engine — Sequences 1-6 in their own block below; weapon/echo pieces
 * are real ports rather than a flat approximation, since this is the full-team test.
 *
 * Soliloquy is his own forte1 gauge — a declared `forte1: N` on every action that moves it
 * (100 a basic/enhanced-basic, 400 on Intro, -200 a Forte heavy), not a hand-rolled buff-stack.
 *
 * Energy/concerto/off-tune off the migrated sheet's own Qiuyuan rows (off-tune x10000 into this
 * engine's units, same as every other ported kit). The sheet also carries combined rows — BA123,
 * EBA1234, EBA34, FHA123 — which are just their parts summed; this file models the parts, so it
 * reads the individual rows. The Liberation's own -125 Energy spend isn't declared: `resetEnergy`
 * is what expresses it (see rotation.ts's own `ActionDef.resetEnergy`), and the Outro's -100 Concerto
 * isn't either — `evaluate()` empties both bars on an outro itself.
 */
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling, LifeTime } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  applyCurrent,
  forte1,
  currentAction,
  onAction,
  runningAction,
  queueOutro,
  applyTeam,
  revokeCurrent,
  addStat,
  frozenStacks,
  isActive,
  isHeld,
  queue,
  currentTeam,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, START_3, SWAP, NOINTRO, ECHO_CANCEL, OUTRO, DODGE, INTRO_2, INTRO_3 } from "../../engine/rotation.js";
import { EMERALD_SENTENCE } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { REJUV_2PC, HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC, SIERRA_GALE_2PC, BELL_BORNE_GEOCHELONE } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { LAW_OF_HARMONY_3PC, FENRICO } from "../../echoes/septimont.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function qiuyuanAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

const BA1 = qiuyuanAction("Basic - Inkwash 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 41.76, energy: 0.75, concerto: 2.4, offtune: 2400 });
const BA2 = qiuyuanAction("Basic - Inkwash 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 69.6, energy: 1.26, concerto: 4, offtune: 4000 });
const BA3 = qiuyuanAction("Basic - Inkwash 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 164.25, energy: 2.98, concerto: 9.46, offtune: 9440, forte1: 100 });

// grants no Soliloquy of its own; it exists to chain straight into Inkwash Stage 4
const HA = qiuyuanAction("Heavy - Inkwash", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 165.61, energy: 2.09, concerto: 6.67, offtune: 6664 });

const EBA1 = qiuyuanAction("Basic - Thus Spoke the Blade: Inkwash 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 119.3, energy: 1.5, concerto: 4.8, offtune: 4800, forte1: 100 });
const EBA2 = qiuyuanAction("Basic - Thus Spoke the Blade: Inkwash 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 185.5, energy: 2.34, concerto: 7.47, offtune: 7464, forte1: 100 });
const EBA3 = qiuyuanAction("Basic - Thus Spoke the Blade: Inkwash 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 145.77, energy: 3.69, concerto: 7.07, offtune: 5862, forte1: 100 });
const EBA4 = qiuyuanAction("Basic - Thus Spoke the Blade: Inkwash 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 172.37, energy: 4.34, concerto: 8.33, offtune: 6936, forte1: 100 });

const Skill = qiuyuanAction("Skill - Through the Groves", { node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 215.52, energy: 15.09, concerto: 10, offtune: 8673 });

const Liberation = qiuyuanAction("Liberation - Sundering Strike", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Echo, mv: 795.24, concerto: 20, offtune: 96000, resetEnergy: true,
  updateBuffs: () => applyTeam(SUNDERING_STRIKE, 1),
});

const Intro = qiuyuanAction("Intro - Attack the Must-Defend", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Heavy, mv: 238.62, energy: 10, concerto: 10, offtune: 9600, forte1: 400,
});
const Outro = qiuyuanAction("Outro - Strike Before Ready", {
  cast: Cast.Outro, type: Type1.Echo, mv: 100, concerto: -100, swapOut: true,
  updateBuffs: () => queueOutro(QIUYUAN_OUTRO),
});

/** S3's Straw Cape in Drizzly Rain: the Skill while Concerto is full outside Inksplash of Mind — 60
 *  Concerto for 500% as Echo Skill DMG (nanoka's own chain rows: 75%+75%x3+200%, the Wayfarer's
 *  shape, whose energy and off-tune it carries) and 400 Soliloquy back. It ends Quietude Within and
 *  arms the state below for the next Inksplash and the next Outro. */
const StrawCape = qiuyuanAction("Skill - Straw Cape in Drizzly Rain (S3)", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 500, energy: 15.38, concerto: -60, offtune: 4273, forte1: 400,
  updateBuffs: () => { revokeCurrent(QUIETUDE_WITHIN); applyCurrent(STRAW_CAPE, 1); },
});
/** The Outro Straw Cape leaves him: 500% as Echo Skill DMG (its own chain row) in place of Strike
 *  Before Ready's 100%, the handoff unchanged. */
const OutroS3 = qiuyuanAction("Outro - Sheath Fallen, New Shoots Revealed (S3)", {
  cast: Cast.Outro, type: Type1.Echo, mv: 500, concerto: -100, swapOut: true,
  updateBuffs: () => { queueOutro(QIUYUAN_OUTRO); revokeCurrent(STRAW_CAPE); },
});
/** S6: 600% as Echo Skill DMG (its own chain row) as Inksplash of Mind ends under him — To
 *  Sacrifice spends the last of the Soliloquy, so it fires off that. */
const InksplashExit = qiuyuanAction("Forte - Inksplash of Mind (S6)", { node: Node.Forte, type: Type1.Echo, mv: 600 });

// cast: HEAVY (real heavy-attack identity) plus cast2: ECHO ("considered as performing Echo Skill")
const FHA1 = qiuyuanAction("Forte Heavy - Thus Spoke the Blade: To Teach", { node: Node.Forte, cast: Cast.Heavy, cast2: Cast.Echo, type: Type1.Heavy, mv: 457.2, energy: 7.7, concerto: 14.75, offtune: 12265, forte1: -200 });
const FHA2 = qiuyuanAction("Forte Heavy - Thus Spoke the Blade: To Save", { node: Node.Forte, cast: Cast.Heavy, cast2: Cast.Echo, type: Type1.Heavy, mv: 209.67, energy: 3.54, concerto: 6.78, offtune: 5625, forte1: -200 });
const FHA3 = qiuyuanAction("Forte Heavy - Thus Spoke the Blade: To Sacrifice", { node: Node.Forte, cast: Cast.Heavy, cast2: Cast.Echo, type: Type1.Heavy, mv: 217.7, energy: 3.65, concerto: 7.01, offtune: 5840, forte1: -200 });

/* ------------------------------------------------------------------------------------ buffs */

const FLOWING_PANACEA = new Buff({
  name: "Qiuyuan: Flowing Panacea",
  stats: [[Stat.BonusAtk, 10]],
  until: LifeTime.Outro,
});

// team-wide, permanent once granted at 400 Soliloquy; S2 adds +30% Echo Skill DMG Amplification,
// read off his own slot since the node is his local gear and this buff pays the team
const BAMBOO_SHADE = new Buff({
  name: "Qiuyuan: Bamboo's Shade",
  stats: [[Stat.DmgBonus, 30, Type1.Echo]],
  applyStats: () => {
    if (currentTeam().slots.find((m) => m.resonator === QIUYUAN_RESONATOR)?.isHeld(QY_S2)) {
      asSource(QY_S2, () => addStat(Stat.Amp, 30, Type1.Echo));
    }
  },
});

// one stack per Inksplash entered this visit: a second Inksplash in the same visit (the MDPS
// loops) only sees the tail of its 10s, so it pays that Inksplash's To Teach and ends there
const QUIETUDE_WITHIN = new Buff({
  name: "Inherent: Quietude Within", maxStacks: 2,
  until: LifeTime.Swap,
  applyStats: () => {
    if (runningAction(FHA1) || runningAction(FHA2) || runningAction(FHA3)) addStat(Stat.TotalDmg, 50);
    // "Thus Spoke the Blade: To Sacrifice additionally restores 30 of Concerto Energy on hit" —
    // in the skill's own text, not in nanoka's attribute table (see CLAUDE.md).
    if (runningAction(FHA3)) addStat(Stat.AddConcerto, 30);
  },
  convertStats: () => { if (runningAction(FHA1) && frozenStacks() >= 2) revokeCurrent(QUIETUDE_WITHIN); },
});

// team-wide — "all nearby active Resonators," gated on the acting resonator's own active flag
const SUNDERING_STRIKE = new Buff({
  name: "Qiuyuan: Sundering Strike",
  applyStats: () => { if (isActive()) addStat(Stat.CritDmg, 30); },
});

const QIUYUAN_OUTRO = new Buff({
  name: "Qiuyuan: Outro",
  stats: [[Stat.Amp, 50, Type1.Echo]],
  until: LifeTime.Swap,
});

const QY_INHERENT_2 = new Inherent({
  name: "Inherent: Drink Away Woes Age-Old",
  grants: [{ on: () => currentAction().forte1 > 0, buff: FLOWING_PANACEA }],
});

const QY_INHERENT_1 = new Inherent({
  name: "Inherent: Quietude Within",
  updateBuffs: () => {
    // on the cast that fills the bar, not every cast at a full one (a stack an Inksplash entered);
    // no Quietude on the Inksplash a Straw Cape opens (S3) — the Straw Cape state pays instead
    const soliloquy = forte1() + currentAction().forte1;
    if (forte1() < 600 && soliloquy >= 600 && !isHeld(STRAW_CAPE)) applyCurrent(QUIETUDE_WITHIN, 1);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
const QIUYUAN_TALENTS = new Talent({
  name: "Qiuyuan: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const QIUYUAN_RESONATOR = new Resonator({
  name: "Qiuyuan",
  stats: [[Stat.BaseHp, 12238], [Stat.BaseAtk, 375], [Stat.BaseDef, 1198]],
  talent: QIUYUAN_TALENTS,
  inherent1: QY_INHERENT_1,
  inherent2: QY_INHERENT_2,
  element: Attribute.Aero,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  outro: () => (isHeld(STRAW_CAPE) ? OutroS3 : Outro),
  color: "#4fae6b",
  maxEnergy: 125,
  maxForte1: 600,
  updateBuffs: () => {
    // forte1() only reflects every *prior* action's own contribution, so what the gauge is about
    // to become (forte1() + a.forte1) is what has to be checked, not what it reads right now
    const soliloquy = forte1() + currentAction().forte1;
    if (soliloquy >= 400) applyTeam(BAMBOO_SHADE, 1);
  },

});

/* --------------------------------------------------------------------------------- sequences */

/** S1: +20% Crit. Rate. The interrupt immunity is no stat. */
const QY_S1 = new Sequence({ name: "Qiuyuan S1: Sword Sheathed, Mind Unclouded", stats: [[Stat.CritRate, 20]] });

/** S2: Bamboo's Shade also amplifies Echo Skill DMG 30% — paid by the Shade itself (above). */
const QY_S2 = new Sequence({ name: "Qiuyuan S2: O Blade, I, Who Teach No More" });

/** What a Straw Cape leaves standing until the Outro it replaces: the next Inksplash's three
 *  Heavies gain 600% of ATK each — additive, nanoka's own S3 rows are 211.44% a hit against
 *  91.44% — and 30 Concerto apiece on hit, in place of the Quietude Within they no longer get. */
const STRAW_CAPE = new Buff({
  name: "Qiuyuan S3: Straw Cape in Drizzly Rain",
  applyStats: () => {
    if (runningAction(FHA1) || runningAction(FHA2) || runningAction(FHA3)) { addStat(Stat.AddMv, 600); addStat(Stat.AddConcerto, 30); }
  },
});
/** S3: Sundering Strike gains 500% of ATK — additive too, its S3 row being 1295.24% against
 *  795.24% — and Straw Cape in Drizzly Rain, which the S3 rotation casts once a loop. */
const QY_S3 = new Sequence({
  name: "Qiuyuan S3: O Blade, I, Who Save No More",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.AddMv, 500); },
});

/** S4: +20% ATK. */
const QY_S4 = new Sequence({ name: "Qiuyuan S4: O Blade, I, Who Sacrifice No More", stats: [[Stat.BonusAtk, 20]] });

/** S5: 15% of the target's DEF ignored — the new ignore, his being a 2.7 kit (stats.ts). */
const QY_S5 = new Sequence({ name: "Qiuyuan S5: O Blade, I, Who Await to be Wielded", stats: [[Stat.DefIgnoreNew, 15]] });

/** S6's crit off a Straw Cape: +100% Crit. DMG for 6s, gone the moment he switches out. */
const THUS_I_SPOKE = new Buff({
  name: "Qiuyuan S6: Thus I Heard, Thus I Saw, Thus I Spoke",
  stats: [[Stat.CritDmg, 100]], until: LifeTime.Swap,
});
/** S6: the Inksplash-ending hit above whenever he is the one on field as it ends, and the crit
 *  window off Straw Cape. The stagnation is no stat. */
const QY_S6 = new Sequence({
  name: "Qiuyuan S6: Thus I Heard, Thus I Saw, Thus I Spoke",
  updateBuffs: () => {
    if (runningAction(FHA3) && isActive()) queue(InksplashExit);
  },
  grants: [{ on: onAction(StrawCape), buff: THUS_I_SPOKE }],
});

const QY_SEQUENCES = [QY_S1, QY_S2, QY_S3, QY_S4, QY_S5, QY_S6];

// His Liberation is a team buff, so the opener spends it on a swap-in of its own rather than
// waiting for his turn — it is the one cast worth being on field for in the fight's first seconds.
// The rest follows when the field comes back round; no second Liberation, it has already gone.

const FHA123 = new ActionGroup("Forte - Thus Spoke the Blade: Heavy 123", [FHA1, FHA2, FHA3]);

const EBA12 = new ActionGroup("Basic - Thus Spoke the Blade: Inkwash 12", [EBA1, EBA2]);
const EBA34 = new ActionGroup("Basic - Thus Spoke the Blade: Inkwash 34", [EBA3, EBA4]);

const QY_ROTATION = new Rotation([

  NOINTRO,
  HA, EBA4, HA, EBA4, 
  ECHO_CANCEL, Liberation,
  EBA12, DODGE, EBA12, 
  FHA123, 
  OUTRO,

  INTRO_2, EBA34, 
  ECHO_CANCEL, Liberation, Skill,
  FHA123, 
  OUTRO,

  START_3, Liberation, SWAP,

  INTRO_3, EBA34, 
  ECHO_CANCEL, Skill,
  FHA123, 
  Liberation,
  OUTRO,
]);

/** From S3 on: the bar is full once the Liberation lands, so Straw Cape goes there — its 400
 *  Soliloquy and the Inkwash 3 it hands back reach a second Inksplash at +600% a Heavy, and the
 *  Outro that follows is Sheath Fallen. The opener has no full bar before its first Outro, so it
 *  stays as it is. */
const QY_ROTATION_MDPS = new Rotation([
  START_3, Liberation, SWAP,

  INTRO_2, EBA34, 
  ECHO_CANCEL, Liberation, Skill,  
  FHA123, 
  HA, EBA4, HA, EBA4, EBA12, DODGE, EBA12, 
  FHA123, 
  OUTRO,

  INTRO_3, EBA34, 
  ECHO_CANCEL, Skill,
  FHA123, 
  HA, EBA4, HA, EBA4, EBA12, DODGE, EBA12, 
  FHA123, 
  Liberation, 
  OUTRO,
]);

const QY_ROTATION_MDPS_S3 = new Rotation([
  START_3, Liberation, SWAP,

  INTRO_2, EBA34, 
  ECHO_CANCEL, Liberation, Skill,
  FHA123, 
  StrawCape, EBA34, FHA123,
  OUTRO,

  INTRO_3, EBA34, 
  ECHO_CANCEL, Skill,
  FHA123, 
  StrawCape, EBA34, 
  FHA123, 
  Liberation, OUTRO,
]);

/* ---------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills, and four real echo choices —
// Fenrico/Law of Harmony+Sierra Gale, Heron/Law of Harmony+Moonlit, Fallacy/Law of Harmony+Rejuv,
// or Heron/full Moonlit Clouds — all automatically iterated (see gear.ts's own EchoLoadout)
export const QIUYUAN = new Loadout({
  resonator: QIUYUAN_RESONATOR,
  weapons: [EMERALD_SENTENCE, EMERALD_OF_GENESIS],
  echoLoadouts: [
    new EchoLoadout(FENRICO, LAW_OF_HARMONY_3PC, SIERRA_GALE_2PC),
    
    new EchoLoadout(HERON, LAW_OF_HARMONY_3PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, LAW_OF_HARMONY_3PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(FALLACY, LAW_OF_HARMONY_3PC, REJUV_2PC),

    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.Er, Substat.FlatAtk),
  rotation: QY_ROTATION,
  sequences: QY_SEQUENCES,
});

export const QIUYUAN_MDPS = new Loadout({
  resonator: QIUYUAN_RESONATOR,
  weapons: [EMERALD_SENTENCE, EMERALD_OF_GENESIS],
  echoLoadouts: [
    new EchoLoadout(FENRICO, LAW_OF_HARMONY_3PC, SIERRA_GALE_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.Er, Substat.FlatAtk),
  rotation: { 0: QY_ROTATION_MDPS, 3: QY_ROTATION_MDPS_S3 },
  sequences: QY_SEQUENCES,
});