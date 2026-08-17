/** Standard/f2p weapons — no signature character, usable by anyone of the matching weapon type.
 *  Three generations, 5 weapons each (one per weapon type), 15 total: Ceaseless Aria (the
 *  original 4-star standard set), Stormy Resolution (the 5-star standard set), and the "new
 *  standard" 5-star set. Each resonator's own file picks which of these its f2p loadout equips.
 *  Signature weapons live in their own weapon-type file instead (sword.ts, broadblade.ts,
 *  pistol.ts, gauntlet.ts, rectifier.ts) — including Stringmaster, which isn't part of any of
 *  these three named tiers, so it lives in rectifier.ts alongside Encore's own gear. */
import { isOutro, isSkill, isTuneBreak } from "../state.js";
import { Buff, Gear, PRIORITY } from "../kit.js";
import { Stat, DamageType, Resource } from "../stats.js";

/* ---------------------------------------------------------------- Ceaseless Aria (4-star, 5) */

/** Ceaseless Aria — the five standard weapons' shared passive. One buff, two stacks: 1 is
 *  ready (a Skill cast restores Concerto and promotes to 2), 2 is cooling down (an Outro
 *  demotes back to 1). */
export const CEASELESS_ARIA = new Buff(PRIORITY.UPDATE_BUFFS, (ctx) => {
  const held = ctx.stacksOf(CEASELESS_ARIA);
  if (held === 1 && isSkill(ctx.action!)) {
    ctx.gain(Resource.Concerto, 1600);   // R5; R1 restores 800
    ctx.grantSelf(CEASELESS_ARIA);
  } else if (held === 2 && isOutro(ctx.action!)) {
    ctx.removeStack(CEASELESS_ARIA, 1);
  }
  return held === 1 ? "Ceaseless Aria" : "Ceaseless Aria (cooldown)";
}, 2);

export const VARIATION = new Gear("Variation R5", (ctx) => {
  ctx.add(337.5, Stat.BaseAtk);
  ctx.add(51.84, Stat.Er);
}, (ctx) => { ctx.grantSelf(CEASELESS_ARIA); });

export const MARCATO = new Gear("Marcato R5", (ctx) => {
  ctx.add(338, Stat.BaseAtk);
  ctx.add(51.84, Stat.Er);
}, (ctx) => { ctx.grantSelf(CEASELESS_ARIA); });

export const CADENZA = new Gear("Cadenza R5", (ctx) => {
  ctx.add(338, Stat.BaseAtk);
  ctx.add(51.84, Stat.Er);
}, (ctx) => { ctx.grantSelf(CEASELESS_ARIA); });

export const OVERTURE = new Gear("Overture R5", (ctx) => {
  ctx.add(338, Stat.BaseAtk);
  ctx.add(51.84, Stat.Er);
}, (ctx) => { ctx.grantSelf(CEASELESS_ARIA); });

export const DISCORD = new Gear("Discord R5", (ctx) => {
  ctx.add(338, Stat.BaseAtk);
  ctx.add(51.84, Stat.Er);
}, (ctx) => { ctx.grantSelf(CEASELESS_ARIA); });

/* --------------------------------------------------------------- Stormy Resolution (5-star, 5) */

/** Static Mist, R1. Stormy Resolution: +12.8% ER flat. On the wielder's outro, hands the
 *  incoming resonator +10% ATK — the outro-handoff queue expires it on their own outro. */
export const STATIC_MIST = new Gear("Static Mist", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(24.3, Stat.CritRate);
  ctx.add(12.8, Stat.Er);
  if (isOutro(ctx.action!)) ctx.outro(STATIC_MIST_HANDOFF);
});

export const STATIC_MIST_HANDOFF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(STATIC_MIST_HANDOFF);
  ctx.add(10, Stat.BonusAtk);
  return "Static Mist: Stormy Resolution";
});

/** Emerald of Genesis, R1. Stormy Resolution: +12.8% ER flat. Skill DMG stacks ATK twice over
 *  (6% a stack), lost after the outro action gains stats. */
export const EMERALD_OF_GENESIS = new Gear("Emerald of Genesis", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(24.3, Stat.CritRate);
  ctx.add(12.8, Stat.Er);
  if (isSkill(ctx.action!)) ctx.grantSelf(EOG_STACKS);
});

export const EOG_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  const held = ctx.stacksOf(EOG_STACKS);
  ctx.add(6 * held, Stat.BonusAtk);
  if (isOutro(ctx.action!)) ctx.revoke(EOG_STACKS);
  return `Emerald of Genesis: Stormy Resolution x${held}`;
}, 2);

/** Cosmic Ripples, R1. Stormy Resolution: +12.8% ER flat. Basic Attack DMG stacks Basic DMG
 *  Bonus five times over (3.2% a stack), lost after the outro action gains stats. */
export const COSMIC_RIPPLES = new Gear("Cosmic Ripples", (ctx) => {
  ctx.add(500, Stat.BaseAtk);
  ctx.add(54, Stat.BonusAtk);
  ctx.add(12.8, Stat.Er);
  if (ctx.action!.type === DamageType.Basic) ctx.grantSelf(COSMIC_RIPPLES_STACKS);
});

export const COSMIC_RIPPLES_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  const held = ctx.stacksOf(COSMIC_RIPPLES_STACKS);
  ctx.add(3.2 * held, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(COSMIC_RIPPLES_STACKS);
  return `Cosmic Ripples: Stormy Resolution x${held}`;
}, 5);

/** Abyss Surges, R1. Stormy Resolution: +12.8% ER flat. A Skill hit grants Basic DMG Bonus; a
 *  Basic hit grants Skill DMG Bonus — both lost after the outro action gains stats. */
export const ABYSS_SURGES = new Gear("Abyss Surges", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(36.45, Stat.BonusAtk);
  ctx.add(12.8, Stat.Er);
  if (ctx.action!.type === DamageType.Skill) ctx.grantSelf(ABYSS_SKILL_HIT);
  if (ctx.action!.type === DamageType.Basic) ctx.grantSelf(ABYSS_BASIC_HIT);
});

export const ABYSS_SKILL_HIT = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(10, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(ABYSS_SKILL_HIT);
  return "Abyss Surges: Stormy Resolution";
});

export const ABYSS_BASIC_HIT = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(10, DamageType.Skill, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(ABYSS_BASIC_HIT);
  return "Abyss Surges: Stormy Resolution";
});

/** Lustrous Razor, R1. Stormy Resolution: +12.8% ER flat. Skill cast stacks Liberation DMG
 *  Bonus three times over (7% a stack), lost after the outro action gains stats. */
export const LUSTROUS_RAZOR = new Gear("Lustrous Razor", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(36.45, Stat.BonusAtk);
  ctx.add(12.8, Stat.Er);
  if (isSkill(ctx.action!)) ctx.grantSelf(LUSTROUS_RAZOR_STACKS);
});

export const LUSTROUS_RAZOR_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  const held = ctx.stacksOf(LUSTROUS_RAZOR_STACKS);
  ctx.add(7 * held, DamageType.Liberation, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(LUSTROUS_RAZOR_STACKS);
  return `Lustrous Razor: Stormy Resolution x${held}`;
}, 3);

/* ------------------------------------------------------------------- new standard (5-star, 5) */

/** Radiance Cleaver, Lupa's f2p alternative. Tune-strained bonus skipped — untracked state. */
export const NEW_STD_BRAUDBLADE = new Gear("Radiance Cleaver", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(48.6, Stat.CritDmg);
  ctx.add(12, Stat.BonusAtk);
});

/** Pulsation Bracer, Iuno's f2p alternative. Conversion-stack bonus skipped — untracked state. */
export const NEW_STD_GAUNTLET = new Gear("Pulsation Bracer", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(24.3, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);
});

/** Laser Shearer, R1: Signal Catcher, +12% ATK flat. Tune Strain half skipped — untracked
 *  enemy state. */
export const NEW_STD_SWORD = new Gear("Laser Shearer", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(38.88, Stat.Er);
  ctx.add(12, Stat.BonusAtk);
});

/** Boson Astrolabe, R1: Path Observer, +12% ATK flat. Only the wielder's own Tune Break cast
 *  procs it — a team-wide trigger would need a global watcher. Proc lost after the outro
 *  action gains stats. */
export const NEW_STD_RECTIFIER = new Gear("Boson Astrolabe", (ctx) => {
  ctx.add(525, Stat.BaseAtk);
  ctx.add(38.88, Stat.Er);
  ctx.add(12, Stat.BonusAtk);
  if (isTuneBreak(ctx.action!)) ctx.grantSelf(PATH_OBSERVER_BUFF);
});

export const PATH_OBSERVER_BUFF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(12, Stat.BonusAtk);
  ctx.add(12, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(PATH_OBSERVER_BUFF);
  return "Boson Astrolabe: Path Observer";
});

/** Phasic Homogenizer, R1: Insight Bearer, +12% ATK flat. Same simplification as Boson
 *  Astrolabe above. */
export const NEW_STD_PISTOL = new Gear("Phasic Homogenizer", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(48.6, Stat.CritDmg);
  ctx.add(12, Stat.BonusAtk);
  if (isTuneBreak(ctx.action!)) ctx.grantSelf(INSIGHT_BEARER_BUFF);
});

export const INSIGHT_BEARER_BUFF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(20, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(INSIGHT_BEARER_BUFF);
  return "Phasic Homogenizer: Insight Bearer";
});
