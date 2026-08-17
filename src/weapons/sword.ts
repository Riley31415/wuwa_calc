/** Signature Sword weapons — grouped by weapon type rather than version (see standard.ts for
 *  the non-signature, any-type-usable weapons). Each section is the character it's signature to. */
import { isOutro, isLiberation, isEcho } from "../state.js";
import { Buff, GlobalBuff, Gear, PRIORITY } from "../kit.js";
import { Stat, DamageType, Cast } from "../stats.js";

/** Blazing Brilliance, Changli's signature, R1: Crimson Phoenix. +12% ATK flat. Resonance
 *  Skill cast grants 5 stacks of Searing Feather outright (up to 14), each +4% Resonance Skill
 *  DMG Bonus — the per-hit 0.5s-ICD trickle is skipped, same simplification as every other
 *  ICD-gated stack elsewhere (Augusta's Glory's Favor). Changli, character 1205, released 1.1 —
 *  https://ww.nanoka.cc/character/1205, https://ww.nanoka.cc/weapon/21020016 */
export const BLAZING_BRILLIANCE = new Gear("Blazing Brilliance", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(48.6, Stat.CritDmg);
  ctx.add(12, Stat.BonusAtk);
  if (ctx.action!.type === DamageType.Skill) ctx.grantSelf(SEARING_FEATHER, 5);
});
export const SEARING_FEATHER = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(4 * stacks, DamageType.Skill, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(SEARING_FEATHER);
  return `Blazing Brilliance: Crimson Phoenix x${stacks}`;
}, 14);

/** Red Spring, Camellya's signature, R1: Beyond the Cycle. +12% ATK flat. When dealing Basic
 *  Attack DMG, the wielder gains +10% Basic Attack DMG Bonus for 14s (once per second, up to 3
 *  stacks — the once-per-second ICD isn't modelled, same simplification as every other ICD-gated
 *  stack elsewhere). The Concerto-consumption half of its passive (+40% Basic DMG Bonus for
 *  10s) has no clean trigger in this engine (Concerto isn't spent on a per-action basis here,
 *  only read by whichever action ends the fight loop) so it's left unmodelled rather than
 *  guessed at — flagged here rather than faked. Camellya isn't implemented as a playable
 *  resonator in this codebase (only her gear, shared with Havoc Rover); this weapon is exported
 *  for whoever equips it. Camellya, character 1603, released 1.4 —
 *  https://ww.nanoka.cc/character/1603, https://ww.nanoka.cc/weapon/21020026 */
export const RED_SPRING = new Gear("Red Spring", (ctx) => {
  ctx.add(588, Stat.BaseAtk);
  ctx.add(24.3, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);
  if (ctx.action!.type === DamageType.Basic) ctx.grantSelf(RED_SPRING_BASIC);
});
export const RED_SPRING_BASIC = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(10 * stacks, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(RED_SPRING_BASIC);
  return `Red Spring: Beyond the Cycle x${stacks}`;
}, 3);

/** Unflickering Valor, Brant's signature, R1: Laughter Prevails. +8% Crit Rate flat. Two
 *  independent, stackable +24% Basic Attack DMG Bonus instances — casting Liberation grants one
 *  (10s), dealing Basic Attack DMG grants the other (4s); both up at once is +48%, not capped to
 *  one. Both short enough that only the standing outro-loss rule matters for either. Brant,
 *  character 1206, released 2.1 — https://ww.nanoka.cc/character/1206,
 *  https://ww.nanoka.cc/weapon/21020036 */
export const UNFLICKERING_VALOR = new Gear("Unflickering Valor", (ctx) => {
  ctx.add(413, Stat.BaseAtk);
  ctx.add(77.04, Stat.Er);
  ctx.add(8, Stat.CritRate);
  if (isLiberation(ctx.action!)) ctx.grantSelf(LAUGHTER_PREVAILS_LIB);
  if (ctx.action!.type === DamageType.Basic) ctx.grantSelf(LAUGHTER_PREVAILS_BASIC);
});
export const LAUGHTER_PREVAILS_LIB = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(24, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(LAUGHTER_PREVAILS_LIB);
  return "Unflickering Valor: Laughter Prevails (Liberation)";
});
export const LAUGHTER_PREVAILS_BASIC = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(24, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(LAUGHTER_PREVAILS_BASIC);
  return "Unflickering Valor: Laughter Prevails (Basic Attack)";
});

/** Emerald Sentence, Qiuyuan's signature, R1: When A Heart Settles. +12% ATK flat, and his
 *  Intro grants the team 20% Echo Skill DMG Bonus for 30s (max_stacks 1, so a repeat grant is
 *  naturally non-stacking).
 *
 * Bamboo Cleaver: an Echo Skill cast within 10s of an Intro/Basic Attack grants a stack of
 * +30% Heavy Attack DMG Bonus, up to two. No literal timer exists here, so "within 10s" is
 * approximated by staying ready until something other than Intro/Basic/Echo happens — closer
 * to the real gate than either ignoring it or leaving it on forever. One buff stores all three
 * of its own states rather than a separate ready flag: stack 1 is "ready" (no bonus yet),
 * stacks 2 and 3 are the real 1st/2nd Bamboo Cleaver stacks. Qiuyuan, character 1411, released
 * 2.7 — https://ww.nanoka.cc/character/1411, https://ww.nanoka.cc/weapon/21020066 */
export const EMERALD_SENTENCE = new Gear("Emerald Sentence", (ctx) => {
  const a = ctx.action!;
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(24.3, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);

  if (a.cast === Cast.Intro) ctx.grantGlobal(HEART_SETTLES_TEAM);

  const cleaver = ctx.stacksOf(BAMBOO_CLEAVER);
  if (a.cast === Cast.Intro || a.cast === Cast.Basic) {
    if (!cleaver) ctx.grantSelf(BAMBOO_CLEAVER);          // reach "ready"
  }
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
