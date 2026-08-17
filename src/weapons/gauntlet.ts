/** Signature Gauntlets weapons — grouped by weapon type rather than version (see standard.ts
 *  for the non-signature, any-type-usable weapons). Each section is the character it's
 *  signature to. */
import { isOutro, isIntro, isSkill, isLiberation, isEcho } from "../state.js";
import { Buff, Gear, PRIORITY } from "../kit.js";
import { Stat, DamageType, Cast, Element } from "../stats.js";

/** Verity's Handle, Xiangli Yao's signature, R1: Ad Veritatem. +12% Attribute DMG Bonus flat
 *  (unscoped). Casting Resonance Liberation grants +48% Resonance Liberation DMG Bonus for 8s,
 *  extended 5s (up to 3 times) by each Resonance Skill cast while it's up — approximated here as
 *  a flat re-grant per Skill cast (the buff's own body re-adds the window rather than tracking a
 *  real countdown, same shape as every other short-window weapon passive), lost after the outro
 *  action gains stats. Not owned by any resonator implemented in this codebase yet — exported
 *  standalone. Xiangli Yao, released 1.2 — https://ww.nanoka.cc/weapon/21040016 */
export const VERITYS_HANDLE = new Gear("Verity's Handle", (ctx) => {
  const a = ctx.action!;
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(48.6, Stat.CritDmg);
  ctx.add(12, Stat.DmgBonus);
  if (isLiberation(a) || isSkill(a)) ctx.grantSelf(AD_VERITATEM);
});
export const AD_VERITATEM = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(48, DamageType.Liberation, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(AD_VERITATEM);
  return "Verity's Handle: Ad Veritatem";
});

/** Tragicomedy, Roccia's signature, R1: Fool's Warble. +12% ATK flat. Casting Basic Attack or
 *  Intro Skill grants +48% Heavy Attack DMG Bonus for 3s — short enough that only the standing
 *  outro-loss rule matters. "Basic Attack" read as the cast (any of Pero, Easy's four stages or
 *  Real Fantasy's three, all `cast: Cast.Basic`), not the damage type. Roccia, character 1606,
 *  released 2.0 — https://ww.nanoka.cc/character/1606, https://ww.nanoka.cc/weapon/21040026 */
export const TRAGICOMEDY = new Gear("Tragicomedy", (ctx) => {
  const a = ctx.action!;
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(24.3, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);
  if (a.cast === Cast.Basic || a.cast === Cast.Intro) ctx.grantSelf(FOOLS_WARBLE);
});
export const FOOLS_WARBLE = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(48, DamageType.Heavy, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(FOOLS_WARBLE);
  return "Tragicomedy: Fool's Warble";
});

/** Solsworn Ciphers, Sigrika's signature, R1: Sunward. +12% ATK flat. Casting Intro Skill or
 *  Echo Skill grants +32% Echo Skill DMG Amplification for 15s. Dealing Echo Skill DMG makes
 *  Aero DMG ignore 10% DEF for 6s — both short enough that only the standing outro-loss rule
 *  matters for either. Sigrika, character 1412, released 3.2 —
 *  https://ww.nanoka.cc/character/1412, https://ww.nanoka.cc/weapon/21040066 */
export const SOLSWORN_CIPHERS = new Gear("Solsworn Ciphers", (ctx) => {
  const a = ctx.action!;
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(48.6, Stat.CritDmg);
  ctx.add(12, Stat.BonusAtk);
  if (isIntro(a) || isEcho(a)) ctx.grantSelf(SUNWARD_AMP);
  if (a.type === DamageType.Echo) ctx.grantSelf(SUNWARD_IGNORE);
});
export const SUNWARD_AMP = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(32, DamageType.Echo, Stat.Amp);
  if (isOutro(ctx.action!)) ctx.revoke(SUNWARD_AMP);
  return "Solsworn Ciphers: Sunward";
});
export const SUNWARD_IGNORE = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(10, Element.Aero, Stat.DefIgnore);
  if (isOutro(ctx.action!)) ctx.revoke(SUNWARD_IGNORE);
  return "Solsworn Ciphers: Sunward";
});

/** Moongazer's Sigil, Iuno's signature. Liberation damage gets a flat bonus and, per shield
 *  stack, pierces defence. R1, the rank the sheet's numbers describe. Iuno, character 1410,
 *  released 2.6 — https://ww.nanoka.cc/character/1410 */
export const IUNO_SIG = new Gear("Moongazer's Sigil", (ctx) => {
  const a = ctx.action!;
  ctx.add(500, Stat.BaseAtk);
  ctx.add(36, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);
  ctx.add(20, DamageType.Liberation, Stat.DmgBonus);
  // a shield stacks it one for one; her intro takes it straight to the ceiling
  if (a.cast === Cast.Intro) ctx.grantSelf(MOONGAZER_STACKS, 5);   // straight to the ceiling
  else if (ctx.shields) ctx.grantSelf(MOONGAZER_STACKS, ctx.shields);
});
export const MOONGAZER_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  // scoped to liberation damage — most of Lunar Cycle qualifies, intro/outro/echo don't
  ctx.add(7.2 * stacks, DamageType.Liberation, Stat.DefIgnore);
  return `Moongazer's Sigil: Plenilune Radiance x${stacks}`;
}, 5);
