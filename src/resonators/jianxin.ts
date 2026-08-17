/**
 * Jianxin — an aero gauntlets support. Chi (forte1, max 120) builds off Basic Attack/Calming
 * Air/Chi Counter-Parry/Intro hits; a held Heavy Attack at max Chi becomes Primordial Chi Spiral,
 * channelling through Zhoutian Progress tiers (Pushing Punch -> Minor -> Major Zhoutian Inner ->
 * Outer) before releasing whichever tier's own Shock. Most of her kit is shields (the tiered
 * Zhoutian shields, Reflection's own +20% to them, the continuous heal they carry) — all out of
 * scope for this calculator, per the standing rule, same as every other kit's healing text.
 *
 * Two further gaps, flagged rather than guessed:
 * - Zhoutian Progress's own "Chi Strike" continuous damage (24.86% a tick) and Purification
 *   Force Field's own pull-in continuous damage (29.83% a tick) both give a per-tick MV but no
 *   tick count or interval, so neither is modelled — only each one's own release/explosion hit
 *   is (the Zhoutian tier's own Shock, the Force Field's own Explosion Damage).
 * - The rotation below channels all the way to Major Zhoutian - Outer; Pushing Punch/Minor
 *   Zhoutian/Major Zhoutian - Inner are exported for completeness (an early-release line would
 *   place one of those instead) but not placed by default.
 *
 * Sequences 1-6, each its own Gear, all six in the default loadout, by explicit instruction:
 *  S1 Verdant Branchlet — Chi economy only (extra Chi from Basic Attacks), no-op.
 *  S2 Tao Seeker's Journey — an extra Calming Air charge, no-op (charge/cooldown, not tracked).
 *  S3 Principles of Wuwei — Chi Counter availability timing, no-op.
 *  S4 Multitide Reflection — Primordial Chi Spiral grants +80% Resonance Liberation DMG for 14s.
 *  S5 Mirroring Introspection — Liberation's own AoE range, no-op (no target-count model here).
 *  S6 Truth from Within — a Pushing-Punch-gated enhanced Chi Counter, 556.67% Heavy Attack DMG;
 *     the Zhoutian 4 shield it also grants is skipped (shields are out of scope throughout).
 *
 * Numbers from nanoka.cc (character 1405, https://ww.nanoka.cc/character/1405) for every named hit's MV — she has no wuwalab.com
 * entry checked and isn't on the migrated sheet either (an older, unmigrated build), so this is
 * nanoka's own rendered "Skill Attributes (Lv.10)" table throughout. Energy generated per hit
 * isn't exposed on nanoka's own page beyond the Concerto Regen figures it does give directly
 * (used where shown) — everything else reads `energy: 0`/`offtune: 0`, flagged rather than
 * guessed. Weapon (Marcato R5) and echoes (Impermanence Heron mainslot, full 5pc Moonlit Clouds)
 * are both generic gear already shared across other kits here, by explicit instruction.
 */
import { Buff, GlobalBuff, Gear, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Cast, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { MARCATO } from "../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../echoes/jinzhou.js";

/** This resonator's own color. */
export const COLOR = "#b8d94f";

/** Chi is the gauge the game shows — up to 120, spent entirely by Primordial Chi Spiral. */
export const JIANXIN_CHI = Resource.Forte1;

/* --------------------------------------------------------------- resonator */

/** Formless Release (Inherent Skill): flat +20% Resonance Liberation DMG Bonus. */
export const FORMLESS_RELEASE = new Buff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(20, DamageType.Liberation, Stat.DmgBonus); return "Jianxin: Formless Release"; });

/** Jianxin's own outro window: Transcendence. */
export const JIANXIN_OUTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(JIANXIN_OUTRO);
  ctx.add(38, DamageType.Liberation, Stat.Amp);
  return "Jianxin: Transcendence";
});

/* ------------------------------------------------------------------- sequences */

/** S4 Multitide Reflection: Primordial Chi Spiral grants +80% Resonance Liberation DMG for 14s
 *  — short enough that only the standing outro-loss rule matters. */
export const S4 = new Gear("Jianxin S4", (ctx) => {
  if (ctx.action!.node === Node.Forte) ctx.grantSelf(S4_WINDOW);
});
export const S4_WINDOW = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(80, DamageType.Liberation, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(S4_WINDOW);
  return "Jianxin S4";
});

/** S6 Truth from Within: during Primordial Chi Spiral, after Pushing Punch, an enhanced Chi
 *  Counter usable once in 5s — the ICD isn't modelled (no real-time clock here), so it's placed
 *  directly instead; the Zhoutian 4 shield it also grants is skipped (shields out of scope). */
export const SpecialChiCounter = jianxinAction("Skill: Special Chi Counter", { node: Node.Forte, cast: Cast.Skill, type: DamageType.Heavy, mv: 556.67 });
export const S6 = new Gear("Jianxin S6");

/* ------------------------------------------------------------------ loadout */

/** Her echoes: Impermanence Heron mainslot, full 5pc Moonlit Clouds — both generic gear, by
 *  explicit instruction. Marcato R5 (weapons/standard.js) as her weapon, likewise. */
const JIANXIN_LOADOUT = new Loadout(
  MARCATO, HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC,
  mainstats("CR", "aero aero", "atk atk"), chem("atk", "liberation"),
);

export class Jianxin extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Jianxin",
      Element.Aero,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(14113, Stat.BaseHp);
        ctx.add(338, Stat.BaseAtk);
        ctx.add(1124, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(8, Stat.CritRate);
        ctx.add(12, Stat.BonusAtk);
      },
      (ctx) => { ctx.grantSelf(FORMLESS_RELEASE); },
      null,
      [S4, S6],
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Jianxin(JIANXIN_LOADOUT);

/* ----------------------------------------------------------------- actions */

function jianxinAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Aero,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter, heavy (Fengyiquan)
const BA1 = jianxinAction("Basic: Fengyiquan 1", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 69.46 });
const BA2 = jianxinAction("Basic: Fengyiquan 2", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 133.18 });   // 26.64% x2 + 79.90%
const BA3 = jianxinAction("Basic: Fengyiquan 3", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 167.00 });   // 41.75% x4
const BA4 = jianxinAction("Basic: Fengyiquan 4", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 113.40 });
const HA = jianxinAction("Heavy: Fengyiquan", { node: Node.Normal, cast: Cast.Heavy, type: DamageType.Heavy, mv: 126.07 });
const MA = jianxinAction("Basic: Fengyiquan (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 123.27 });
const DC = jianxinAction("Basic: Fengyiquan (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 244.95 });   // 40.83% x2 + 163.29%

export const BA1234 = new Chain("Basic: Fengyiquan 1234", [BA1, BA2, BA3, BA4]);

// --- resonance skill: Calming Air opens Parry Stance — Chi Parry (released early) is the
//     rotation's own placed choice; Chi Counter (only reachable if actually hit) is exported for
//     completeness, same treatment as every other reactive/defensive proc elsewhere.
const ChiParry = jianxinAction("Skill: Chi Parry", { node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 258.73, concerto: 800 });
export const ChiCounter = jianxinAction("Skill: Chi Counter", { node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 334.60, concerto: 1400 });

// --- forte circuit: Primordial Chi Spiral, channelled all the way to Major Zhoutian - Outer
//     (see the file header for the earlier-release variants, exported but not placed).
export const PushingPunch = jianxinAction("Heavy: Pushing Punch", { node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 248.52, concerto: 1000 });
export const MinorZhoutianShock = jianxinAction("Heavy: Minor Zhoutian Shock", { node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 139.17, concerto: 500 });
export const MajorZhoutianInnerShock = jianxinAction("Heavy: Major Zhoutian - Inner Shock", { node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 377.74, concerto: 1800 });
const MajorZhoutianOuterShock = jianxinAction("Heavy: Major Zhoutian - Outer Shock", { node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 516.91, concerto: 2300, forte1: -120 });
export const YieldingPull = jianxinAction("Heavy: Yielding Pull", { node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 218.70, concerto: 700 });

// --- liberation: Purification Force Field — only the Explosion Damage is modelled (see header)
const Liberation = jianxinAction("Liberation: Purification Force Field", {
  node: Node.Liberation, cast: Cast.Liberation, type: DamageType.Liberation, mv: 636.20,
  energy: -15000, concerto: 2000,
});

// --- intro / outro
const Intro = jianxinAction("Intro: Essence of Tao", {
  node: Node.Intro, cast: Cast.Intro, type: DamageType.Intro, mv: 169.00, concerto: 1000,   // 33.80% x3 + 67.60%
});
const Outro = jianxinAction("Outro: Transcendence", {
  cast: Cast.Outro, type: DamageType.Outro, mv: 0, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.outro(JIANXIN_OUTRO); },
});

/** A kit-valid line: Intro, Basic 1234 into Chi Parry, Heavy Attack channels Primordial Chi
 *  Spiral all the way to Major Zhoutian - Outer, Liberation closes on Formless Release/S4's own
 *  window, Outro closes the loop out. Intro is no longer placed here — the preceding member's
 *  outro triggers it (see the standing convention). */
export const ROTATION = [
  BA1234, ChiParry, MajorZhoutianOuterShock,
  ECHO_CAST, Liberation, Outro,
];
