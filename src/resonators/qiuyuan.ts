/**
 * Qiuyuan — an aero sword DPS. Swordster's Soliloquy builds off basics/dodge counters/intro,
 * unlocking Thus Spoke the Blade: Inkwash (replaces Basic Attack) at 200, Bamboo's Shade (team
 * Echo Skill DMG) at 400, and Inksplash of Mind (replaces Heavy Attack with a three-hit combo,
 * spending the whole 600) once full.
 *
 * Numbers from nanoka.cc (character 1411, https://ww.nanoka.cc/character/1411, weapon 21020066, echo 6000116); cross-checked against
 * the migrated sheet's `Qiuyuan`/`Fenrico`/`Law of Harmony 3pc` rows, which already flatten two
 * always-on passives into plain stat lines rather than modelling them as triggers — kept that
 * way here too, for the reasons noted at each one.
 */
import { Buff, GlobalBuff, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { FALLACY, REJUV_2PC } from "../echoes/jinzhou.js";
import { LAW_OF_HARMONY_3PC } from "../echoes/septimont.js";
import { EMERALD_SENTENCE } from "../weapons/sword.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#6bb668";

/* --------------------------------------------------------------- resonator */

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
  if (a === FHA3) { ctx.gain(Resource.Concerto, 3000); ctx.revoke(QUIETUDE_WITHIN); }
  return "Qiuyuan: Quietude Within";
});

/** His echoes: Fallacy mainslot + Rejuvenating Glow 2pc (both generic, echoes/jinzhou.js), Law of
 *  Harmony 3pc (his own, echoes/septimont.js — his own mainslot echo Fenrico also lives there, for
 *  whoever else picks it up); Emerald Sentence (his own signature) lives in weapons/sword.js. 43311
 *  crit-rate build, since Sundering Strike's team Crit. DMG bonus scales off his own Crit. Rate
 *  past 50%, capped at a 65% build. */
const QIUYUAN_LOADOUT = new Loadout(
  EMERALD_SENTENCE, FALLACY, LAW_OF_HARMONY_3PC, REJUV_2PC,
  mainstats("CD", "aero aero", "atk atk"), chem("atk", "heavy"),
);

export class Qiuyuan extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Qiuyuan",
      Element.Aero,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(12238, Stat.BaseHp);
        ctx.add(375, Stat.BaseAtk);
        ctx.add(1198, Stat.BaseDef);
        // his own thresholds, checked every one of his own actions since resources land before this
        if (ctx.counter(Resource.Forte1) >= 400) ctx.grantGlobal(BAMBOO_SHADE);
        if (ctx.counter(Resource.Forte1) >= 600) ctx.grantSelf(QUIETUDE_WITHIN);
      },
      (ctx) => {
        ctx.add(8, Stat.CritRate);
        ctx.add(12, Stat.BonusAtk);   // stat-tree bonus; Drink Away Woes Age-Old's 10% is its own buff below
      },
      (ctx) => { ctx.grantSelf(DRINK_AWAY_WOES); },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Qiuyuan(QIUYUAN_LOADOUT);

/* ----------------------------------------------------------------- actions */

function qiuyuanAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Aero,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter — below 200 Soliloquy
const BA1 = qiuyuanAction("Basic: Inkwash 1", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 41.76, energy: 75, concerto: 240, offtune: 2400 });
const BA2 = qiuyuanAction("Basic: Inkwash 2", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 69.6, energy: 126, concerto: 400, offtune: 2000 });
const BA3 = qiuyuanAction("Basic: Inkwash 3", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 164.25, energy: 298, concerto: 946, offtune: 9440, forte1: 100 });
const MA = qiuyuanAction("Basic: Inkwash (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 116.91, energy: 210, concerto: 672, offtune: 6720 });
const HA = qiuyuanAction("Heavy: Inkwash", { node: Node.Normal, cast: Cast.Heavy, type: DamageType.Heavy, mv: 165.61, energy: 209, concerto: 667, offtune: 6664 });
// the sheet's own DC row has no forte1 — the page is explicit that Dodge Counter restores 100
const DC = qiuyuanAction("Basic: Inkwash (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Heavy, mv: 278.36, energy: 350, concerto: 2120, offtune: 11200, forte1: 100 });

export const BA123 = new Chain("Basic: Inkwash 123", [BA1, BA2, BA3]);

// --- Thus Spoke the Blade: Inkwash — Basic Attack replaced from 200 Soliloquy on
const EBA1 = qiuyuanAction("Basic: Thus Spoke the Blade - Inkwash 1", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Heavy, mv: 119.3, energy: 150, concerto: 480, offtune: 4800, forte1: 100 });
const EBA2 = qiuyuanAction("Basic: Thus Spoke the Blade - Inkwash 2", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Heavy, mv: 185.5, energy: 234, concerto: 747, offtune: 7464, forte1: 100 });
const EBA3 = qiuyuanAction("Basic: Thus Spoke the Blade - Inkwash 3", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Heavy, mv: 145.77, energy: 369, concerto: 707, offtune: 5916, forte1: 100 });
const EBA4 = qiuyuanAction("Basic: Thus Spoke the Blade - Inkwash 4", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Heavy, mv: 172.37, energy: 434, concerto: 833, offtune: 6936, forte1: 100 });

export const EBA34 = new Chain("Basic: Thus Spoke the Blade - Inkwash 34", [EBA3, EBA4]);
export const EBA1234 = new Chain("Basic: Thus Spoke the Blade - Inkwash 1234", [EBA1, EBA2, EBA3, EBA4]);

// --- resonance skill: Undaunted Wayfarer. Tap is the rotation's default; Hold assumes a fixed
//     3-tick dash, same as the sheet.
const Skill = qiuyuanAction("Skill: Through the Groves (Tap)", { node: Node.Skill, cast: Cast.Skill, type: DamageType.Echo, mv: 215.52, energy: 1509, concerto: 1000, offtune: 8673 });
const SkillHold = qiuyuanAction("Skill: Through the Groves (Hold)", { node: Node.Skill, cast: Cast.Skill, type: DamageType.Echo, mv: 215.53, energy: 1538, concerto: 1000, offtune: 4273 });

// --- liberation: Sundering Strike. Team Crit. DMG scales off his own Crit. Rate past 50%,
//     capped at 30% — flat here, on the assumption his build clears the 65% cap the sheet
//     recommends, per the user.
const Liberation = qiuyuanAction("Liberation: Sundering Strike", {
  node: Node.Liberation, cast: Cast.Liberation, type: DamageType.Echo, mv: 795.24, energy: -12500, concerto: 2000, offtune: 96000,
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
const Intro = qiuyuanAction("Intro: Attack the Must-Defend", {
  node: Node.Intro, cast: Cast.Intro, type: DamageType.Heavy, mv: 238.62, energy: 1000, concerto: 1000, offtune: 9600, forte1: 400,
});
const Outro = qiuyuanAction("Outro: Strike Before Ready", {
  cast: Cast.Outro, type: DamageType.Echo, mv: 100, concerto: -10000, active: false,
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
export const FHA1 = qiuyuanAction("Heavy: Thus Spoke the Blade - To Teach", { node: Node.Forte, cast: Cast.Heavy, cast2: Cast.Echo, type: DamageType.Heavy, mv: 457.2, energy: 770, concerto: 1475, offtune: 12265, forte1: -200 });
export const FHA2 = qiuyuanAction("Heavy: Thus Spoke the Blade - To Save", { node: Node.Forte, cast: Cast.Heavy, cast2: Cast.Echo, type: DamageType.Heavy, mv: 209.67, energy: 354, concerto: 678, offtune: 5628, forte1: -200 });
export const FHA3 = qiuyuanAction("Heavy: Thus Spoke the Blade - To Sacrifice", { node: Node.Forte, cast: Cast.Heavy, cast2: Cast.Echo, type: DamageType.Heavy, mv: 217.7, energy: 365, concerto: 701, offtune: 5840, forte1: -200 });

export const FHA123 = new Chain("Heavy: Inksplash of Mind", [FHA1, FHA2, FHA3]);

/** The sheet's `qy` rotation: Intro tops Soliloquy at 400 (Bamboo's Shade), Inkwash 34 fills the
 *  rest to 600 (Inksplash of Mind), Liberation, then the full combo spends it — cast for his own
 *  equipped Fallacy. Intro is no longer placed here — the preceding member's outro triggers it
 *  (see `onIntro`). */
export const ROTATION = [
  EBA34, ECHO_CAST, Liberation, FHA123, Skill, Outro,
];
