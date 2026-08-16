/**
 * Shorekeeper — a spectro support. Her damage barely matters; the Stellarealm is what she's
 * for, giving the team crit rate then crit damage scaled off her own energy regen.
 *
 * Numbers from the spreadsheet's stat rows; mechanics from nanoka.cc (character 1505). The
 * realm's rates (0.01% CR/0.2% ER, 0.01% CD/0.1% ER) are assumed capped at a real build's 250% ER.
 */
import { Buff, GlobalBuff, Gear, Action, Chain, PRIORITY } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { isOutro, isLiberation } from "../state.js";
import { Stat, Element, DamageType, Node, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { FALLACY, ACTION_FALLACY, REJUV_5PC, REJUV_2PC } from "../shared/echoes.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#8fb3d9";

/* --------------------------------------------------------------- resonator */

export const SHOREKEEPER = new Gear((ctx) => {
  // the innate line every resonator carries
  ctx.add(100, Stat.Er);
  ctx.add(5, Stat.CritRate);
  ctx.add(150, Stat.CritDmg);

  ctx.add(16712.5, Stat.BaseHp);
  ctx.add(287.5, Stat.BaseAtk);
  ctx.add(12, Stat.BonusHp);
  ctx.add(10, Stat.Er);          // Self Gravitation, while the field is inside a Stellarealm
  ctx.add(12, Stat.HealingBonus); // stat-tree Healing Bonus+ nodes, 1.8+1.8+4.2+4.2 — unused by the
                               // formula (healing is out of scope), tracked for completeness only
  return "Shorekeeper";
// decides on the incoming realm stage and ends it right here — on the outro that's handing her
// the field, before Discernment (which doesn't get the realm's own bonus) ever runs
}, null, Element.Spectro, (ctx) => {
  if (ctx.stacksOf(SK_REALM) < 3) return Intro;
  ctx.revoke(SK_REALM);
  return EIntro;
});

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

/* ------------------------------------------------------------------ weapons */

/** Stellar Symphony, her signature: 12% HP to herself, 14% attack to the team, and concerto
 *  back on any liberation. R1, the rank the sheet's numbers describe. */
export const SK_SIG = new Gear((ctx) => {
  ctx.add(412.5, Stat.BaseAtk);
  ctx.add(77.04, Stat.Er);       // the level 90 energy regen substat
  ctx.add(12, Stat.BonusHp);
  ctx.grantGlobal(SK_SIG_TEAM);
  if (isLiberation(ctx.action!)) ctx.gain(Resource.Concerto, 8);
  return "Stellar Symphony";
});
export const SK_SIG_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(14, Stat.BonusAtk); return "Stellar Symphony: Astral Evolvement"; });

/* -------------------------------------------------------------- echo, sonata */

/** Her echoes, from the sheet's `sk r1` build — Fallacy and Rejuvenating Glow are generic gear,
 *  imported from shared/echoes.js. No crit main stat, ER-heavy substats — she's not here to hit
 *  anything; the realm pays team crit off her energy regen. */
export const LOADOUT = [SHOREKEEPER, SK_SIG, FALLACY, REJUV_5PC, REJUV_2PC,
    mainstats("HP", "ER ER", "hp hp"), chem("hp", "liberation", { er: true })];

/* ----------------------------------------------------------------- actions */

function skAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Spectro,
    color: COLOR,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics. Each stage banks Empirical Data in forte1; stage 3 is worth two.
const BA1 = skAction("Basic 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 31.78, energy: 0.5, concerto: 1.6, offtune: 0.2664, forte1: 1 });
const BA2 = skAction("Basic 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 47.72, energy: 0.76, concerto: 2.4, offtune: 0.4, forte1: 1 });
const BA3 = skAction("Basic 3", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 69.96, energy: 1.12, concerto: 3.56, offtune: 0.599, forte1: 2 });
const BA4 = skAction("Basic 4", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 72.72, energy: 1.15, concerto: 3.66, offtune: 0.6096, forte1: 1 });
const MA = skAction("Plunge", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 73.96, energy: 1.55, concerto: 5, offtune: 0.496, forte1: 1 });

// --- skill, forte, liberation. The forte casts spend the whole gauge.
// Overflowing Quietude (Inherent Skill): +70% Healing Bonus on casting her Resonance Skill — no
// duration given on the page, so applied same-cast rather than assuming an uptime window.
const Skill = skAction("Skill", {
  node: Node.Skill, cast: DamageType.Skill, type: DamageType.Skill, mv: 156.55, energy: 10, concerto: 30, offtune: 0.525,
  priority: PRIORITY.BUFF_STATS,
  apply(ctx) { ctx.add(70, Stat.HealingBonus); },
});
const FHA = skAction("Forte Heavy", { node: Node.Forte, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 281.3, energy: 4.95, concerto: 11, offtune: 0.636, forte1: -5 });
const FMA = skAction("Forte Plunge", { node: Node.Forte, cast: DamageType.Basic, type: DamageType.Basic, mv: 260.41, energy: 4, concerto: 11, offtune: 0.496, forte1: -5 });
const Liberation = skAction("Liberation", {
  node: Node.Liberation, cast: DamageType.Liberation, type: DamageType.Liberation, mv: 0, energy: -175, concerto: 20,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(SK_REALM); },
});

// --- intro / outro. EIntro is Discernment: replaces intro under a Supernal realm, scales off
//     HP, counts as liberation damage, always crits.
const Intro = skAction("Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Skill, mv: 226.5, energy: 10, concerto: 20, offtune: 1.1395,
});
const EIntro = skAction("Enhanced Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Liberation, scaling: Scaling.Hp, mv: 58.92,
  energy: 10.02, concerto: 20, offtune: 7.3242,
  // the realm already ended on the outro that triggered this (see the SHOREKEEPER Gear's
  // onIntro) — Discernment itself never sees it
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.add(100, Stat.CritRate); },
});
/** Puts Binary Butterfly on the team, so amplification starts with whoever she hands the
 *  field to. Deals no damage of its own. */
const Outro = skAction("Outro", {
  cast: DamageType.Outro, type: DamageType.Outro, mv: 0, concerto: -100, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(SK_OUTRO); },
});

/* ------------------------------------------------------------------ chains */

export const BA12 = new Chain("Basic 12",
  [BA1, BA2]);
export const BA23 = new Chain("Basic 23",
  [BA2, BA3]);
export const BA123 = new Chain("Basic 123",
  [BA1, BA2, BA3]);
export const BA234 = new Chain("Basic 234",
  [BA2, BA3, BA4]);
export const BA1234 = new Chain("Basic 1234",
  [BA1, BA2, BA3, BA4]);

/** The sheet's `sk opener`, intro up front. Only the first rotation of a fight looks like
 *  this — see LOOP below for the one that repeats. */
export const OPENER = [
  BA123, MA, FHA,
  Skill, BA23, BA12, FHA,
  ACTION_FALLACY, Liberation, Outro,
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
  ACTION_FALLACY, Liberation, Outro,
];
