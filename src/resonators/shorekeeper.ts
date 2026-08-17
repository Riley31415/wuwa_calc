/**
 * Shorekeeper — a spectro support. Her damage barely matters; the Stellarealm is what she's
 * for, giving the team crit rate then crit damage scaled off her own energy regen.
 *
 * Numbers from the spreadsheet's stat rows; mechanics from nanoka.cc (character 1505, https://ww.nanoka.cc/character/1505). The
 * realm's rates (0.01% CR/0.2% ER, 0.01% CD/0.1% ER) are assumed capped at a real build's 250% ER.
 */
import { Buff, GlobalBuff, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { FALLACY, REJUV_5PC, REJUV_2PC } from "../echoes/jinzhou.js";
import { SK_SIG } from "../weapons/rectifier.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#8fb3d9";

/* --------------------------------------------------------------- resonator */

export const SK_OUTRO = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(15, Stat.Amp);
  return "Shorekeeper: Outro";
});

/**
 * The realm, as one buff whose stack count *is* the stage:
 *
 *   1  Outer      heals only, pays no stat — it is just waiting to evolve
 *   2  Inner      crit rate
 *   3  Supernal   crit rate and crit damage
 *
 * One buff means one `apply()` per action, so it cannot take two steps on one cast however the
 * engine schedules things — which a chain of three buffs granting each other could, and did.
 * Global: the stage is the whole team's shared realm, not any one resonator's own stack.
 */
export const SK_REALM = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx) => {
  // evolves when somebody intros into it; an outro is always followed by an intro, so it steps
  // *before* paying out — the outro that triggers the step is already standing in the new realm
  if (isOutro(ctx.action!)) ctx.grantGlobal(SK_REALM);

  const stage = ctx.stacksOf(SK_REALM);
  // rates off her Energy Regen, capped: a real build runs 250% ER, exactly where both caps bite
  if (stage >= 2) ctx.add(12.5, Stat.CritRate);
  if (stage >= 3) ctx.add(25, Stat.CritDmg);
  return `Shorekeeper: ${["Outer", "Inner", "Supernal"][stage - 1] ?? "no"} Stellarealm`;
}, 3);

/** Her echoes, from the sheet's `sk r1` build — Fallacy and Rejuvenating Glow are generic gear
 *  from echoes/jinzhou.js; Stellar Symphony (her own signature) lives in weapons/rectifier.js. No crit main
 *  stat, ER-heavy substats — she's not here to hit anything; the realm pays team crit off her
 *  energy regen. */
const SHOREKEEPER_LOADOUT = new Loadout(
  SK_SIG, FALLACY, REJUV_5PC, REJUV_2PC,
  mainstats("HP", "ER ER", "hp hp"), chem("hp", "liberation", { er: true }),
);

export class Shorekeeper extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Shorekeeper",
      Element.Spectro,
      // decides on the incoming realm stage and ends it right here — on the outro that's handing
      // her the field, before Discernment (which doesn't get the realm's own bonus) ever runs
      (ctx) => {
        if (ctx.stacksOf(SK_REALM) < 3) return Intro;
        ctx.revoke(SK_REALM);
        return EIntro;
      },
      loadout,
      (ctx) => {
        ctx.add(16712.5, Stat.BaseHp);
        ctx.add(287.5, Stat.BaseAtk);


        // TODO update to real logic
        ctx.add(10, Stat.Er);          // Self Gravitation, while the field is inside a Stellarealm
      },
      (ctx) => {
        ctx.add(12, Stat.BonusHp);
        ctx.add(12, Stat.HealingBonus); // stat-tree Healing Bonus+ nodes, 1.8+1.8+4.2+4.2 — unused
                                     // by the formula (healing is out of scope), tracked for
                                     // completeness only
      },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Shorekeeper(SHOREKEEPER_LOADOUT);

/* ----------------------------------------------------------------- actions */

function skAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Spectro,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics. Each stage banks Empirical Data in forte1; stage 3 is worth two.
const BA1 = skAction("Basic: Origin Calculus 1", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 31.78, energy: 50, concerto: 160, offtune: 2664, forte1: 1 });
const BA2 = skAction("Basic: Origin Calculus 2", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 47.72, energy: 76, concerto: 240, offtune: 4000, forte1: 1 });
const BA3 = skAction("Basic: Origin Calculus 3", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 69.96, energy: 112, concerto: 356, offtune: 5990, forte1: 2 });
const BA4 = skAction("Basic: Origin Calculus 4", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 72.72, energy: 115, concerto: 366, offtune: 6096, forte1: 1 });
const MA = skAction("Basic: Origin Calculus (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 73.96, energy: 155, concerto: 500, offtune: 4960, forte1: 1 });

// --- skill, forte, liberation. The forte casts spend the whole gauge.
// Overflowing Quietude (Inherent Skill): +70% Healing Bonus on casting her Resonance Skill — no
// duration given on the page, so applied same-cast rather than assuming an uptime window.
const Skill = skAction("Skill: Chaos Theory", {
  node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 156.55, energy: 1000, concerto: 3000, offtune: 5250,
  priority: PRIORITY.BUFF_STATS,
  apply(ctx) { ctx.add(70, Stat.HealingBonus); },
});
const FHA = skAction("Forte: Illation", { node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 281.3, energy: 495, concerto: 1100, offtune: 6360, forte1: -5 });
const FMA = skAction("Forte: Transmutation", { node: Node.Forte, cast: Cast.Basic, type: DamageType.Basic, mv: 260.41, energy: 400, concerto: 1100, offtune: 4960, forte1: -5 });
const Liberation = skAction("Liberation: End Loop", {
  node: Node.Liberation, cast: Cast.Liberation, type: DamageType.Liberation, mv: 0, energy: -17500, concerto: 2000,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(SK_REALM); },
});

// --- intro / outro. EIntro is Discernment: replaces intro under a Supernal realm, scales off
//     HP, counts as liberation damage, always crits.
const Intro = skAction("Intro: Enlightenment", {
  node: Node.Intro, cast: Cast.Intro, type: DamageType.Skill, mv: 226.5, energy: 1000, concerto: 2000, offtune: 11395,
});
const EIntro = skAction("Intro 2: Discernment", {
  node: Node.Intro, cast: Cast.Intro, type: DamageType.Liberation, scaling: Scaling.Hp, mv: 58.92,
  energy: 1002, concerto: 2000, offtune: 73242,
  // the realm already ended on the outro that triggered this (see the SHOREKEEPER Gear's
  // onIntro) — Discernment itself never sees it
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.add(100, Stat.CritRate); },
});
/** Puts Binary Butterfly on the team, so amplification starts with whoever she hands the
 *  field to. Deals no damage of its own. */
const Outro = skAction("Outro: Binary Butterfly", {
  cast: Cast.Outro, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(SK_OUTRO); },
});

/* ------------------------------------------------------------------ chains */

export const BA12 = new Chain("Basic: Origin Calculus 12",
  [BA1, BA2]);
export const BA23 = new Chain("Basic: Origin Calculus 23",
  [BA2, BA3]);
export const BA123 = new Chain("Basic: Origin Calculus 123",
  [BA1, BA2, BA3]);
export const BA234 = new Chain("Basic: Origin Calculus 234",
  [BA2, BA3, BA4]);
export const BA1234 = new Chain("Basic: Origin Calculus 1234",
  [BA1, BA2, BA3, BA4]);

/** The sheet's `sk opener`, intro up front. Only the first rotation of a fight looks like
 *  this — see LOOP below for the one that repeats. */
export const OPENER = [
  BA123, MA, FHA,
  Skill, BA23, BA12, FHA,
  ECHO_CAST, Liberation, Outro,
];

/**
 * Her loop, and the default: the sheet's `sk` rotation. By the second rotation a Supernal realm
 * is always up, so the preceding member's outro triggers Discernment rather than the ordinary
 * intro (see `onIntro`) — it hits far harder and ends the realm, which is what lets the next
 * liberation open a fresh one.
 *
 * The loop is shorter than the opener (one basic string, one forte heavy) — it generates just
 * over the 100 concerto the outro spends, so she leaves the field where she found the bar.
 *
 * Outro is last here (not second, as the sheet lists it), since it closes the on-field window
 * and hands the field on — the rest of her rotation would otherwise resolve on someone else.
 */
export const LOOP = [
  BA123, MA, FHA, Skill,
  ECHO_CAST, Liberation, Outro,
];
