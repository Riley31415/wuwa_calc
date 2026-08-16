/**
 * Qiuyuan — an aero sword DPS. Swordster's Soliloquy builds off basics/dodge counters/intro,
 * unlocking Thus Spoke the Blade: Inkwash (replaces Basic Attack) at 200, Bamboo's Shade (team
 * Echo Skill DMG) at 400, and Inksplash of Mind (replaces Heavy Attack with a three-hit combo,
 * spending the whole 600) once full.
 *
 * Numbers from nanoka.cc (character 1411, weapon 21020066, echo 6000116); cross-checked against
 * the migrated sheet's `Qiuyuan`/`Fenrico`/`Law of Harmony 3pc` rows, which already flatten two
 * always-on passives into plain stat lines rather than modelling them as triggers — kept that
 * way here too, for the reasons noted at each one.
 */
import { Buff, GlobalBuff, Gear, Action, Chain, PRIORITY } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { isIntro, isOutro, isEcho } from "../state.js";
import { Stat, Element, DamageType, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { FALLACY, ACTION_FALLACY, REJUV_2PC } from "../shared/echoes.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#6bb668";

/* --------------------------------------------------------------- resonator */

export const QIUYUAN = new Gear((ctx) => {
  ctx.add(100, Stat.Er);
  ctx.add(5, Stat.CritRate);
  ctx.add(150, Stat.CritDmg);

  ctx.add(12238, Stat.BaseHp);
  ctx.add(375, Stat.BaseAtk);
  ctx.add(1198, Stat.BaseDef);
  ctx.add(8, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);   // stat-tree bonus; Drink Away Woes Age-Old's 10% is its own buff below

  // his own thresholds, checked every one of his own actions since resources land before this
  if (ctx.counter(Resource.Forte1) >= 400) ctx.grantGlobal(BAMBOO_SHADE);
  if (ctx.counter(Resource.Forte1) >= 600) ctx.grantSelf(QUIETUDE_WITHIN);
  return "Qiuyuan";
}, (ctx) => { ctx.grantSelf(DRINK_AWAY_WOES); }, Element.Aero, () => Intro);

/** Drink Away Woes Age-Old (Inherent Skill): simplified from "brews on an Echo Skill cast,
 *  consumed by the next Soliloquy gain" to just watching for any Soliloquy gain directly —
 *  his rotation's one Echo cast comes after everything that would spend it, so the real
 *  two-step trigger would never actually pay out. */
export const DRINK_AWAY_WOES = new Buff(PRIORITY.UPDATE_BUFFS, (ctx) => {
  if (ctx.action!.forte1 > 0) ctx.grantSelf(FLOWING_PANACEA);
  return "Qiuyuan: Drink Away Woes (watcher)";
});

/** Flowing Panacea: +10% ATK. Ends on his outro — which still gets the bonus, since the
 *  revoke happens after that last cast's cut, not instead of it. */
export const FLOWING_PANACEA = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(10, Stat.BonusAtk);
  if (isOutro(ctx.action!)) ctx.revoke(FLOWING_PANACEA);
  return "Qiuyuan: Flowing Panacea";
});

/** Bamboo's Shade: 30% Echo Skill DMG Bonus, team-wide. His own Skill/Liberation/Outro are
 *  "considered as Echo Skill DMG" (type ECHO) even though they're not literal Echo casts, so
 *  this scopes the same way theirs does. */
export const BAMBOO_SHADE = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(30, DamageType.Echo, Stat.DmgBonus); return "Qiuyuan: Bamboo's Shade"; });

/** Quietude Within (Inherent Skill): +50% DMG to the Inksplash of Mind combo specifically —
 *  gated on exact action identity since To Teach/To Save/To Sacrifice share `type: HEAVY` with
 *  his ordinary heavy attack, which doesn't get this. To Sacrifice also restores 30 Concerto.
 *  Ends early if he's switched off field — any inactive action, not just his own outro. */
export const QUIETUDE_WITHIN = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  const a = ctx.action!;
  if (!a.active) { ctx.revoke(QUIETUDE_WITHIN); return; }
  if (a !== FHA1 && a !== FHA2 && a !== FHA3) return;
  ctx.add(50, Stat.DmgDealt);
  if (a === FHA3) { ctx.gain(Resource.Concerto, 30); ctx.revoke(QUIETUDE_WITHIN); }
  return "Qiuyuan: Quietude Within";
});

/* ------------------------------------------------------------------ weapon */

/**
 * Emerald Sentence, R1: When A Heart Settles. +12% ATK flat, and his Intro grants the team
 * 20% Echo Skill DMG Bonus for 30s (max_stacks 1, so a repeat grant is naturally non-stacking).
 *
 * Bamboo Cleaver: an Echo Skill cast within 10s of an Intro/Basic Attack grants a stack of
 * +30% Heavy Attack DMG Bonus, up to two. No literal timer exists here, so "within 10s" is
 * approximated by staying ready until something other than Intro/Basic/Echo happens —
 * closer to the real gate than either ignoring it or leaving it on forever. One buff stores
 * all three of its own states rather than a separate ready flag: stack 1 is "ready" (no
 * bonus yet), stacks 2 and 3 are the real 1st/2nd Bamboo Cleaver stacks.
 */
export const EMERALD_SENTENCE = new Gear((ctx) => {
  const a = ctx.action!;
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(24.3, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);

  if (isIntro(a)) ctx.grantGlobal(HEART_SETTLES_TEAM);

  const cleaver = ctx.stacksOf(BAMBOO_CLEAVER);
  if (a.cast === DamageType.Intro || a.cast === DamageType.Basic) {
    if (!cleaver) ctx.grantSelf(BAMBOO_CLEAVER);          // reach "ready"
  }

  return "Emerald Sentence";
});

export const HEART_SETTLES_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(20, DamageType.Echo, Stat.DmgBonus); return "Emerald Sentence: When A Heart Settles"; });

/** Lost entirely if he's switched off field — any inactive action, same as Quietude Within. */
export const BAMBOO_CLEAVER = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (!ctx.action!.active) { ctx.revoke(BAMBOO_CLEAVER); return; }
  if (isEcho(ctx.action!)) {
    ctx.grantSelf(BAMBOO_CLEAVER);
  }
  const held = ctx.stacksOf(BAMBOO_CLEAVER);
  if (held < 2) return;
  ctx.add(30 * (held - 1), DamageType.Heavy, Stat.DmgBonus);
  return `Emerald Sentence: Bamboo Cleaver x${held - 1}`;
}, 3);

/* -------------------------------------------------------------- echo, sonata */

/** Reminiscence: Fenrico, his mainslot echo — flat Aero/Heavy DMG Bonus for whoever wears it
 *  in the mainslot, no trigger involved. */
export const FENRICO = new Gear((ctx) => {
  ctx.add(12, Element.Aero, Stat.DmgBonus);
  ctx.add(12, DamageType.Heavy, Stat.DmgBonus);
  return "Reminiscence: Fenrico";
});

export const ACTION_FENRICO = new Action("Echo: Fenrico", {
  color: COLOR,
  cast: DamageType.Echo,
  element: Element.Aero,
  scaling: Scaling.Atk,
  type: DamageType.Echo,
  mv: 273.6,
  energy: 3.8,
});

/**
 * Law of Harmony 3pc: casting Echo Skill grants the caster +30% Heavy Attack DMG Bonus for
 * 4s, and the whole team +4% Echo Skill DMG Bonus, stacking up to 4 — one stack per distinct
 * named Echo that's triggered it (every echo cast is assumed unique, so a repeat cast of his
 * own Echo: Fenrico across a later loop counts as another one same as it would in a real fight).
 **/
export const LAW_OF_HARMONY_3PC = new Gear((ctx) => {
  if (isEcho(ctx.action!)) {
    ctx.grantSelf(LAW_OF_HARMONY_SELF);
    ctx.grantGlobal(LAW_OF_HARMONY_TEAM);
  }
  return "Law of Harmony 3pc";
});

export const LAW_OF_HARMONY_SELF = new Buff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(30, DamageType.Heavy, Stat.DmgBonus); return "Law of Harmony"; });

export const LAW_OF_HARMONY_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(4 * stacks, DamageType.Echo, Stat.DmgBonus);
  return `Law of Harmony x${stacks}`;
}, 4);

/** His echoes: Fallacy mainslot, Law of Harmony 3pc, Rejuvenating Glow 2pc — both generic gear,
 *  reused as-is. 43311 crit-rate build, since Sundering Strike's team Crit. DMG bonus scales
 *  off his own Crit. Rate past 50%, capped at a 65% build. */
export const LOADOUT = [
  QIUYUAN, EMERALD_SENTENCE, FALLACY, LAW_OF_HARMONY_3PC, REJUV_2PC,
  mainstats("CD", "aero aero", "atk atk"),
  chem("atk", "heavy"),
];

/* ----------------------------------------------------------------- actions */

function qiuyuanAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Aero,
    color: COLOR,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter — below 200 Soliloquy
const BA1 = qiuyuanAction("Basic 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 41.76, energy: 0.75, concerto: 2.4, offtune: 0.24 });
const BA2 = qiuyuanAction("Basic 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 69.6, energy: 1.26, concerto: 4, offtune: 0.2 });
const BA3 = qiuyuanAction("Basic 3", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 164.25, energy: 2.98, concerto: 9.46, offtune: 0.944, forte1: 100 });
const MA = qiuyuanAction("Midair", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 116.91, energy: 2.1, concerto: 6.72, offtune: 0.672 });
const HA = qiuyuanAction("Heavy", { node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 165.61, energy: 2.09, concerto: 6.67, offtune: 0.6664 });
// the sheet's own DC row has no forte1 — the page is explicit that Dodge Counter restores 100
const DC = qiuyuanAction("Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Heavy, mv: 278.36, energy: 3.5, concerto: 21.2, offtune: 1.12, forte1: 100 });

export const BA123 = new Chain("Basic 123", [BA1, BA2, BA3]);

// --- Thus Spoke the Blade: Inkwash — Basic Attack replaced from 200 Soliloquy on
const EBA1 = qiuyuanAction("Inkwash Basic 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Heavy, mv: 119.3, energy: 1.5, concerto: 4.8, offtune: 0.48, forte1: 100 });
const EBA2 = qiuyuanAction("Inkwash Basic 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Heavy, mv: 185.5, energy: 2.34, concerto: 7.47, offtune: 0.7464, forte1: 100 });
const EBA3 = qiuyuanAction("Inkwash Basic 3", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Heavy, mv: 145.77, energy: 3.69, concerto: 7.07, offtune: 0.5916, forte1: 100 });
const EBA4 = qiuyuanAction("Inkwash Basic 4", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Heavy, mv: 172.37, energy: 4.34, concerto: 8.33, offtune: 0.6936, forte1: 100 });

export const EBA34 = new Chain("Inkwash Basic 34", [EBA3, EBA4]);
export const EBA1234 = new Chain("Inkwash Basic 1234", [EBA1, EBA2, EBA3, EBA4]);

// --- resonance skill: Undaunted Wayfarer. Tap is the rotation's default; Hold assumes a fixed
//     3-tick dash, same as the sheet.
const Skill = qiuyuanAction("Skill", { node: Node.Skill, cast: DamageType.Skill, type: DamageType.Echo, mv: 215.52, energy: 15.09, concerto: 10, offtune: 0.8673 });
const SkillHold = qiuyuanAction("Skill Hold", { node: Node.Skill, cast: DamageType.Skill, type: DamageType.Echo, mv: 215.53, energy: 15.38, concerto: 10, offtune: 0.4273 });

// --- liberation: Sundering Strike. Team Crit. DMG scales off his own Crit. Rate past 50%,
//     capped at 30% — flat here, on the assumption his build clears the 65% cap the sheet
//     recommends, per the user.
const Liberation = qiuyuanAction("Liberation", {
  node: Node.Liberation, cast: DamageType.Liberation, type: DamageType.Echo, mv: 795.24, energy: -125, concerto: 20, offtune: 9.6,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(SUNDERING_STRIKE_CD); },
});
// "all nearby active Resonators in the team" — skip inactive actions rather than paying them.
// Global now, so it reacts to everyone directly — no more per-slot copy to stay held on.
const SUNDERING_STRIKE_CD = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx) => {
  if (!ctx.action!.active) return;
  ctx.add(30, Stat.CritDmg);
  return "Qiuyuan: Sundering Strike";
});

// --- intro / outro
const Intro = qiuyuanAction("Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Heavy, mv: 238.62, energy: 10, concerto: 10, offtune: 0.96, forte1: 400,
});
const Outro = qiuyuanAction("Outro", {
  cast: DamageType.Outro, type: DamageType.Echo, mv: 100, concerto: -100, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.outro(QIUYUAN_OUTRO); },
});
export const QIUYUAN_OUTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(QIUYUAN_OUTRO);
  ctx.add(50, DamageType.Echo, Stat.Amp);
  return "Qiuyuan: Outro";
});

// --- Inksplash of Mind: Heavy Attack replaced with this three-hit combo once Soliloquy is
//     full, spending all 600 across the three hits. Quietude Within above pays the +50%.
// still cast: HEAVY (real heavy-attack casts, for anything keying off that) plus
// cast2: ECHO — the wiki: "Performing To Teach/To Save/To Sacrifice is considered as
// performing Echo Skill." A single `cast` field can't hold both identities at once.
export const FHA1 = qiuyuanAction("Forte Heavy 1", { node: Node.Forte, cast: DamageType.Heavy, cast2: DamageType.Echo, type: DamageType.Heavy, mv: 457.2, energy: 7.7, concerto: 14.75, offtune: 1.2265, forte1: -200 });
export const FHA2 = qiuyuanAction("Forte Heavy 2", { node: Node.Forte, cast: DamageType.Heavy, cast2: DamageType.Echo, type: DamageType.Heavy, mv: 209.67, energy: 3.54, concerto: 6.78, offtune: 0.5628, forte1: -200 });
export const FHA3 = qiuyuanAction("Forte Heavy 3", { node: Node.Forte, cast: DamageType.Heavy, cast2: DamageType.Echo, type: DamageType.Heavy, mv: 217.7, energy: 3.65, concerto: 7.01, offtune: 0.584, forte1: -200 });

export const FHA123 = new Chain("Forte Heavy 123", [FHA1, FHA2, FHA3]);

/** The sheet's `qy` rotation: Intro tops Soliloquy at 400 (Bamboo's Shade), Inkwash 34 fills the
 *  rest to 600 (Inksplash of Mind), Liberation, then the full combo spends it — cast for his own
 *  equipped Fallacy. Intro is no longer placed here — the preceding member's outro triggers it
 *  (see `onIntro`). */
export const ROTATION = [
  ACTION_FALLACY, EBA34, Liberation, FHA123, Skill, Outro,
];
