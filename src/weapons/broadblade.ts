/** Signature Broadblade weapons — grouped by weapon type rather than version (see standard.ts
 *  for the non-signature, any-type-usable weapons). Each section is the character it's
 *  signature to. */
import { isOutro, isIntro, isSkill, isLiberation, castedAs } from "../state.js";
import { Buff, GlobalBuff, Gear, PRIORITY } from "../kit.js";
import { Stat, DamageType, Cast, Element } from "../stats.js";

/** Verdant Summit, Jiyan's signature, R1: Swordsworn. +12% Attribute DMG Bonus flat (unscoped —
 *  "all attribute" isn't the wielder's own element only). Every Intro Skill or Resonance
 *  Liberation cast grants +24% Heavy Attack DMG Bonus, up to 2 stacks, 14s — short enough that
 *  only the standing outro-loss rule matters. Not owned by any resonator implemented in this
 *  codebase yet — exported standalone. Jiyan, released 1.0 (Tidal Chorus era) —
 *  https://ww.nanoka.cc/weapon/21010016 */
export const VERDANT_SUMMIT = new Gear("Verdant Summit", (ctx) => {
  const a = ctx.action!;
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(48.6, Stat.CritDmg);
  ctx.add(12, Stat.DmgBonus);
  if (isIntro(a) || isLiberation(a)) ctx.grantSelf(SWORDSWORN_STACKS);
});
export const SWORDSWORN_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(24 * stacks, DamageType.Heavy, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(SWORDSWORN_STACKS);
  return `Verdant Summit: Swordsworn x${stacks}`;
}, 2);

/** Ages of Harvest, Jinhsi's signature, R1: Divine Blessing. +12% Attribute DMG Bonus flat
 *  (unscoped). Casting Intro Skill gives Ageless Marking (+24% Resonance Skill DMG Bonus, 12s);
 *  casting Resonance Skill gives Ethereal Endowment (+24% Resonance Skill DMG Bonus, 12s) — both
 *  independently stackable (up to +48% at once), both short enough that only the standing
 *  outro-loss rule matters. Not owned by any resonator implemented in this codebase yet —
 *  exported standalone. Jinhsi, released 1.1 — https://ww.nanoka.cc/weapon/21010026 */
export const AGES_OF_HARVEST = new Gear("Ages of Harvest", (ctx) => {
  const a = ctx.action!;
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(48.6, Stat.CritDmg);
  ctx.add(12, Stat.DmgBonus);
  if (isIntro(a)) ctx.grantSelf(AGELESS_MARKING);
  if (isSkill(a)) ctx.grantSelf(ETHEREAL_ENDOWMENT);
});
export const AGELESS_MARKING = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(24, DamageType.Skill, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(AGELESS_MARKING);
  return "Ages of Harvest: Ageless Marking";
});
export const ETHEREAL_ENDOWMENT = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(24, DamageType.Skill, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(ETHEREAL_ENDOWMENT);
  return "Ages of Harvest: Ethereal Endowment";
});

/** Thunderflare Dominion, Augusta's signature, R1. +12% ATK flat. Intro/Skill cast grants +20%
 *  Heavy Attack DMG Bonus for 15s; gaining a shield grants +7.2% Heavy Attack DMG DEF ignore a
 *  stack (up to 5), 7s — both short enough that only the standing outro-loss rule matters for
 *  either. Augusta, character 1306, released 2.6 — https://ww.nanoka.cc/character/1306 */
export const THUNDERFLARE_DOMINION = new Gear("Thunderflare Dominion", (ctx) => {
  const a = ctx.action!;
  ctx.add(675, Stat.BaseAtk);
  ctx.add(12.15, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);
  if (a.cast === Cast.Intro || a.cast === Cast.Skill) ctx.grantSelf(THUNDERBLAZE_DMG);
  if (ctx.shields) ctx.grantSelf(THUNDERBLAZE_DEF, ctx.shields);
});
export const THUNDERBLAZE_DMG = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(20, DamageType.Heavy, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(THUNDERBLAZE_DMG);
  return "Thunderflare Dominion: Thunderblaze Eminence";
});
export const THUNDERBLAZE_DEF = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(7.2 * stacks, DamageType.Heavy, Stat.DefIgnore);
  if (isOutro(ctx.action!)) ctx.revoke(THUNDERBLAZE_DEF);
  return `Thunderflare Dominion: Thunderblaze Eminence x${stacks}`;
}, 5);

/** Wildfire Mark, Lupa's signature: R1. Chain of three, only the last reaches the team:
 *   1. 12% ATK, flat.
 *   2. Intro/liberation gives *her* 24% Resonance Liberation DMG for 6s.
 *   3. Dealing Heavy Attack DMG once extends that by 4s, and the extension is what hands the
 *      whole team 24% Fusion DMG Bonus for 30s.
 *
 * Step 2 is modelled as permanently up (she opens every rotation with intro -> liberation).
 * Step 3 is a real gate: nothing pays the team until she's landed Heavy Attack DMG, which in
 * her rotation is Firestrike, well after her liberation.
 *
 * "Dealing Heavy Attack DMG" is the damage type, not the cast — Mid-air Firestrike is a
 * basic-attack press that deals it, and counts. "Up to 1 time" / "same name doesn't stack"
 * fall out of the buff being unstacked and a global grant being idempotent. Lupa, character
 * 1207, released 2.4 — https://ww.nanoka.cc/character/1207 */
export const WILDFIRE_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(24, Element.Fusion, Stat.DmgBonus); return "Wildfire Mark: Blazing Starfire"; });
export const WILDFIRE_MARK = new Gear("Wildfire Mark", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(48.6, Stat.CritDmg);
  ctx.add(12, Stat.BonusAtk);
  ctx.add(24, DamageType.Liberation, Stat.DmgBonus);
  // granted at GEAR_STATS, so the hit that earns it is itself paid at BUFF_STATS same-cast
  if (ctx.action!.type === DamageType.Heavy) ctx.grantGlobal(WILDFIRE_TEAM);
});

/** Thousandfold Deliverance, Jingran's signature, R1. Nature's Order stacks on intro/shield,
 *  6x 4% crit damage, full six sharpens heavy attacks. Cradle of Life stacks the same way, spent
 *  by a heavy for defence ignore. Both end on his outro. Jingran, released 3.6 (his own
 *  nanoka.cc character page still reads "Stay tuned" as of this writing). */
export const JINGRAN_SIG = new Gear("Thousandfold Deliverance", (ctx) => {
  const a = ctx.action!;
  ctx.add(413, Stat.BaseAtk);
  ctx.add(72.2, Stat.BonusHp);
  ctx.add(12, Stat.DmgBonus);

  // the shield trigger has a 0.5s ICD, but every cast that shields him twice (his liberation,
  // both heavy attacks) is long enough that the two shields land more than 0.5s apart — so
  // `shields` itself is the stack count, not capped to 1. The intro is a separate trigger — a
  // cast that's both pays both.
  const gained = ctx.shields + (a.cast === Cast.Intro ? 1 : 0);
  if (gained) {
    ctx.grantSelf(NATURES_ORDER, gained);
    ctx.grantSelf(CRADLE_OF_LIFE, gained);
  }
});
export const NATURES_ORDER = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  // switching resonator ends it immediately — whoever is wielding the weapon, not just Jingran
  if (isOutro(ctx.action!)) {
    ctx.revoke(NATURES_ORDER);
    return "Thousandfold Deliverance: Nature's Order x0";
  }
  ctx.add(4 * stacks, Stat.CritDmg);
  // the full six pay crit rate, scoped so only heavy attack damage resolves it
  if (stacks >= 6) ctx.add(12, DamageType.Heavy, Stat.CritRate);
  return `Thousandfold Deliverance: Nature's Order x${stacks}`;
}, 6);
/** Cradle of Life — stacks like Nature's Order but is spent: a heavy attack consumes up to two
 *  stacks, each piercing 15% defence. "Heavy attack" is the cast, not the damage type (his
 *  basic stages 3/4 deal Heavy Attack DMG without being heavy-attack casts). Also ends on
 *  switching resonator, same as Nature's Order. */
export const CRADLE_OF_LIFE = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  if (isOutro(ctx.action!)) {
    ctx.revoke(CRADLE_OF_LIFE);
    return;
  }
  if (!castedAs(ctx.action!, DamageType.Heavy)) return;

  const spent = Math.min(stacks, 2);
  ctx.add(15 * spent, DamageType.Heavy, Stat.DefIgnore);
  ctx.removeStack(CRADLE_OF_LIFE, spent);
  return `Thousandfold Deliverance: Cradle of Life x${stacks}`;
}, 6);
