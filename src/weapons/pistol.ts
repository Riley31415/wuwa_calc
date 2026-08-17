/** Signature Pistols weapons — grouped by weapon type rather than version (see standard.ts for
 *  the non-signature, any-type-usable weapons). Each section is the character it's signature to. */
import { isOutro, isIntro, isLiberation } from "../state.js";
import { Buff, Gear, PRIORITY } from "../kit.js";
import { Stat, DamageType } from "../stats.js";

/** The Last Dance, Carlotta's signature, R1: Silent Eulogy. +12% ATK flat. Intro or Liberation
 *  cast grants +48% Resonance Skill DMG Bonus for 5s — short enough that only the standing
 *  outro-loss rule matters. Carlotta, character 1107, released 2.0 —
 *  https://ww.nanoka.cc/character/1107, https://ww.nanoka.cc/weapon/21030016 */
export const THE_LAST_DANCE = new Gear("The Last Dance", (ctx) => {
  ctx.add(500, Stat.BaseAtk);
  ctx.add(72, Stat.CritDmg);
  ctx.add(12, Stat.BonusAtk);
  if (isIntro(ctx.action!) || isLiberation(ctx.action!)) ctx.grantSelf(SILENT_EULOGY);
});
export const SILENT_EULOGY = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(48, DamageType.Skill, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(SILENT_EULOGY);
  return "The Last Dance: Silent Eulogy";
});

/** Lux & Umbra, Galbrena's signature, R1: To Fire She Returns. +12% ATK flat. Dealing Echo
 *  Skill DMG grants +24% Heavy Attack DMG Amplification for 6s; dealing Heavy Attack DMG grants
 *  +24% Echo Skill DMG Amplification for 6s — both short enough that only the standing
 *  outro-loss rule matters. While both are up, dealing DMG ignores 8% DEF. Galbrena, character
 *  1208, released 2.7 — https://ww.nanoka.cc/character/1208,
 *  https://ww.nanoka.cc/weapon/21030036 */
export const LUX_UMBRA = new Gear("Lux & Umbra", (ctx) => {
  const a = ctx.action!;
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(48.6, Stat.CritDmg);
  ctx.add(12, Stat.BonusAtk);
  if (a.type === DamageType.Echo) ctx.grantSelf(TO_FIRE_SHE_RETURNS_HEAVY);
  if (a.type === DamageType.Heavy) ctx.grantSelf(TO_FIRE_SHE_RETURNS_ECHO);
  if (ctx.stacksOf(TO_FIRE_SHE_RETURNS_HEAVY) && ctx.stacksOf(TO_FIRE_SHE_RETURNS_ECHO)) ctx.add(8, Stat.DefIgnore);
});
export const TO_FIRE_SHE_RETURNS_HEAVY = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(24, DamageType.Heavy, Stat.Amp);
  if (isOutro(ctx.action!)) ctx.revoke(TO_FIRE_SHE_RETURNS_HEAVY);
  return "Lux & Umbra: To Fire She Returns (Heavy)";
});
export const TO_FIRE_SHE_RETURNS_ECHO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(24, DamageType.Echo, Stat.Amp);
  if (isOutro(ctx.action!)) ctx.revoke(TO_FIRE_SHE_RETURNS_ECHO);
  return "Lux & Umbra: To Fire She Returns (Echo)";
});
