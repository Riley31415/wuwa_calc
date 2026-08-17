/**
 * Iuno — an aero support. Shields herself and the team almost every action (Waxing Ascent);
 * her intro/outro hand off a big Heavy Attack amplification window (From Gloom to Gleam).
 *
 * Numbers from the spreadsheet's stat rows; mechanics from nanoka.cc (character 1410).
 */
import { Buff, GlobalBuff, Gear, Mainslot, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { SIERRA_2PC } from "../shared/echoes.js";
import { COV_3PC } from "./augusta.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#2dd4c0";

/* --------------------------------------------------------------- resonator */

/* ------------------------------------------------------------------ weapon */

/** Moongazer's Sigil, her signature. Liberation damage gets a flat bonus and, per shield
 *  stack, pierces defence. R1, the rank the sheet's numbers describe. */
export const IUNO_SIG = new Gear("Moongazer's Sigil", (ctx) => {
  const a = ctx.action!;
  ctx.add(500, Stat.BaseAtk);
  ctx.add(36, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);
  ctx.add(20, DamageType.Liberation, Stat.DmgBonus);
  // a shield stacks it one for one; her intro takes it straight to the ceiling
  if (a.cast === DamageType.Intro) ctx.grantSelf(MOONGAZER_STACKS, 5);   // straight to the ceiling
  else if (ctx.shields) ctx.grantSelf(MOONGAZER_STACKS, ctx.shields);
});

export const MOONGAZER_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  // scoped to liberation damage — most of Lunar Cycle qualifies, intro/outro/echo don't
  ctx.add(7.2 * stacks, DamageType.Liberation, Stat.DefIgnore);
  return `Moongazer's Sigil: Plenilune Radiance x${stacks}`;
}, 5);

/* -------------------------------------------------------------- echo, sonata */

/** The echo's cast. */
export const ACTION_MYA = new Action("Echo: Lady of the Sea", {
  color: COLOR,
  cast: DamageType.Echo,
  element: Element.Aero,
  scaling: Scaling.Atk,
  type: DamageType.Echo,
  mv: 300.96,
  energy: 418,
});

export const MYA = new Mainslot("Lady of the Sea", ACTION_MYA, (ctx) => {
  ctx.add(12, DamageType.Liberation, Stat.DmgBonus);
  ctx.add(12, Element.Aero, Stat.DmgBonus);
});

/** Her echoes, from the sheet's `iuno r1` build. Aero rather than generic damage bonus, since
 *  the two 3-cost slots only pay out on her own element. Sierra Gale 2pc is generic gear,
 *  imported from shared/echoes.js; Crown of Valor 3pc lives in augusta.js now, her own sonata. */
const IUNO_LOADOUT = new Loadout(
  IUNO_SIG, MYA, COV_3PC, SIERRA_2PC,
  mainstats("CD", "aero aero", "atk atk"), chem("atk", "liberation"),
);

export class Iuno extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Iuno",
      Element.Aero,
      () => Intro,
      loadout,
      (ctx) => {
        // Derivation: her intro and liberation grant five Blessing stacks outright, no shield needed
        const { cast } = ctx.action!;
        if (cast === DamageType.Intro || cast === DamageType.Liberation) ctx.grantSelf(IUNO_BLESSING, 5);

        ctx.add(10525, Stat.BaseHp);
        ctx.add(450, Stat.BaseAtk);
        ctx.add(1124, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(8, Stat.CritRate);
        ctx.add(12, Stat.BonusAtk);
      },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Iuno(IUNO_LOADOUT);

/* ------------------------------------------------------ what her actions do */

/** Full Moon Domain: what Heavy Attack - Absolute Fullness (FHA) leaves at her feet — a
 *  team-wide shield watcher, so a teammate accrues Blessing off their own shielding. Global
 *  (max_stacks 1), so recasting it each rotation is free either way. */
export const IUNO_DOMAIN = new GlobalBuff(PRIORITY.UPDATE_BUFFS, (ctx) => {
  if (ctx.shields) ctx.grantSelf(IUNO_BLESSING, ctx.shields);
  return "Iuno: Full Moon Domain";
});

/** Blessing of the Wan Light: 4% all-damage amplification a stack, ten stacks. Amplification
 *  rather than damage bonus, so it multiplies its own term instead of diluting into the pile. */
export const IUNO_BLESSING = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  // ends early if switched off field — the outro is that switch, and carries none of it
  if (isOutro(ctx.action!)) {
    ctx.revoke(IUNO_BLESSING);
    return "Iuno: Blessing of the Wan Light x0";
  }
  ctx.add(4 * stacks, Stat.Amp);
  return `Iuno: Blessing of the Wan Light x${stacks}`;
}, 10);

/** From Gloom to Gleam: the window her outro hands the incoming resonator. */
export const IUNO_OUTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(IUNO_OUTRO);
  ctx.add(50, DamageType.Heavy, Stat.Amp);
  return "Iuno: Outro";
});


/* ----------------------------------------------------------------- actions */

function iunoAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Aero,
    color: COLOR,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics and dodge counter, all shielding
const BA1 = iunoAction("Moonring Basic 1", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Basic, mv: 87.68, energy: 123, concerto: 123, offtune: 3920, forte1: 4.25 });
const BA2 = iunoAction("Moonring Basic 2", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Basic, mv: 139.58, energy: 197, concerto: 197, offtune: 4120, forte1: 11.25 });
const BA3 = iunoAction("Moonring Basic 3", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Basic, mv: 266.61, energy: 373, concerto: 373, offtune: 11921, forte1: 19.5 });
const DC = iunoAction("Moonring Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, shields: 1, type: DamageType.Basic, mv: 248.73, energy: 200, concerto: 2397, offtune: 6321 });

// --- Moonbow basics (Lunar Cycle - New Moon), considered liberation damage; also shield
const MA1 = iunoAction("Moonbow Basic 1", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Liberation, mv: 126.45, energy: 233, concerto: 265, offtune: 4240 });
const MA2 = iunoAction("Moonbow Basic 2", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Liberation, mv: 167.01, energy: 325, concerto: 350, offtune: 5601 });
const MA3 = iunoAction("Moonbow Basic 3", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Liberation, mv: 334.02, energy: 600, concerto: 700, offtune: 11200 });
const MDC = iunoAction("Moonbow Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, shields: 1, type: DamageType.Liberation, mv: 310.17, energy: 177, concerto: 2351, offtune: 5601 });

// --- resonance skill
const Skill = iunoAction("Skill", { node: Node.Skill, cast: DamageType.Skill, shields: 1, type: DamageType.Skill, mv: 261.07, energy: 458, concerto: 600, offtune: 8086 });
const ESkill = iunoAction("Moonring Skill", { node: Node.Skill, cast: DamageType.Skill, shields: 1, type: DamageType.Skill, mv: 426.46, energy: 815, concerto: 800, offtune: 13200, forte1: 25 });
const MSkill = iunoAction("Moonbow Skill", { node: Node.Skill, cast: DamageType.Skill, shields: 1, type: DamageType.Liberation, mv: 439.58, energy: 936, concerto: 800, offtune: 10720 });

// --- liberation: shields and grants Blessing
const Liberation = iunoAction("Liberation", {
  node: Node.Liberation, cast: DamageType.Liberation, shields: 1, type: DamageType.Liberation, mv: 1093.46,
  energy: -12500, concerto: 2000, offtune: 96000, forte1: 60,
});

// --- intro / outro
const Intro = iunoAction("Intro", {
  node: Node.Intro, cast: DamageType.Intro, shields: 1, type: DamageType.Intro, mv: 159.09,
  energy: 1000, concerto: 1000, offtune: 10400, forte1: 40,
});
/** Her outro hands the Heavy Attack amplification window straight to the next intro. */
const Outro = iunoAction("Outro", {
  cast: DamageType.Outro, type: DamageType.Outro, mv: 100, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.outro(IUNO_OUTRO); },
});

// --- forte (jump / Flux) casts, all liberation damage while in Lunar Cycle. Same shielding
//     as the ordinary basics/dodge counter above.
const Jump = iunoAction("Forte Moonbow Jump", { node: Node.Forte, cast: DamageType.Heavy, shields: 1, type: DamageType.Liberation, mv: 250.51, energy: 350, concerto: 700, offtune: 1120 });
const FJump = iunoAction("Forte Moonring Jump", { node: Node.Forte, cast: DamageType.Heavy, shields: 1, type: DamageType.Liberation, mv: 316.72, energy: 444, concerto: 888, offtune: 14160 });
const FDC = iunoAction("Forte Moonbow Dodge Counter", { node: Node.Forte, cast: Cast.DodgeCounter, shields: 1, type: DamageType.Liberation, mv: 156.4, energy: 59, concerto: 2917, offtune: 2400 });
const FMA1 = iunoAction("Forte Moonbow Basic 1", { node: Node.Forte, cast: DamageType.Basic, shields: 1, type: DamageType.Liberation, mv: 205.97, energy: 233, concerto: 665, offtune: 4240, forte1: -11 });
const FMA2 = iunoAction("Forte Moonbow Basic 2", { node: Node.Forte, cast: DamageType.Basic, shields: 1, type: DamageType.Liberation, mv: 286.29, energy: 327, concerto: 951, offtune: 5601, forte1: -14 });
const FMA3 = iunoAction("Forte Moonbow Basic 3", { node: Node.Forte, cast: DamageType.Basic, shields: 1, type: DamageType.Liberation, mv: 532.82, energy: 600, concerto: 1700, offtune: 11200, forte1: -25 });
const FMSkill = iunoAction("Forte Moonbow Skill", { node: Node.Forte, cast: DamageType.Skill, shields: 1, type: DamageType.Liberation, mv: 638.38, energy: 936, concerto: 1800, offtune: 10720, forte1: -25 });

/** Heavy Attack - Absolute Fullness. Ends Lunar Cycle and conjures the Full Moon domain. */
const FHA = iunoAction("Forte Heavy", {
  node: Node.Forte, cast: DamageType.Heavy, shields: 1, type: DamageType.Liberation, mv: 159.05, energy: 500, offtune: 2400,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(IUNO_DOMAIN); },
});

/* ------------------------------------------------------------------ chains */

export const MA123 = new Chain("Moonbow Basic 123",
  [MA1, MA2, MA3, MDC]);
export const FMA123 = new Chain("Forte Moonbow Basic 123",
  [FMA1, FMA2, FMA3]);

/** The sheet's `iuno sub` rotation — a sub-DPS opener leaning on the forte Moonbow chain. Intro
 *  is no longer placed here — the preceding member's outro triggers it (see `onIntro`). */
export const ROTATION = [
  ESkill, ECHO_CAST, Liberation, Jump,
  FMSkill, FMA123, FMSkill, FHA,
  Outro,
];

/** The sheet's `iuno mdps` rotation — the fuller main-DPS line. */
export const ROTATION_MDPS = [
  Skill, ESkill, Jump, FMSkill,
  ECHO_CAST, Liberation,
  FMA123, FMA123, MSkill, MA123, FHA,
  Outro,
];
