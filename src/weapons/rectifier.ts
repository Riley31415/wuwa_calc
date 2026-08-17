/** Signature Rectifier weapons — grouped by weapon type rather than version (see standard.ts
 *  for the non-signature, any-type-usable weapons). Each section is the character it's
 *  signature to. Stringmaster lives here too, despite being a standard/permanent-availability
 *  weapon (Union Exchange, not a limited signature) — it isn't part of any of the three named
 *  tiers standard.ts covers, so by weapon type it belongs alongside Encore's own gear instead. */
import { isOutro, isLiberation } from "../state.js";
import { Buff, GlobalBuff, Gear, PRIORITY } from "../kit.js";
import { Stat, DamageType, Cast, Resource, Element } from "../stats.js";

/** Rime-Draped Sprouts, Zhezhi's signature, R1. +12% ATK flat. While on field, casting
 *  Resonance Skill (any of its forms) grants +12% Basic Attack DMG Bonus a stack, up to 3, 6s —
 *  short enough that only the standing outro-loss rule matters. At 3+ stacks, her own Outro
 *  spends them all for +52% Basic Attack DMG Bonus, 27s — permanent uptime once granted, and
 *  explicitly still up off-field per the weapon's own text, so no active check on the stat
 *  itself, only on gaining the first buff. Zhezhi, character 1105, released 1.2 —
 *  https://ww.nanoka.cc/character/1105, https://ww.nanoka.cc/weapon/21050026 */
export const RIME_DRAPED_SPROUTS = new Gear("Rime-Draped Sprouts", (ctx) => {
  const a = ctx.action!;
  ctx.add(500, Stat.BaseAtk);
  ctx.add(72, Stat.CritDmg);
  ctx.add(12, Stat.BonusAtk);
  if (a.active && a.cast === Cast.Skill) ctx.grantSelf(PANORAMA_STACKS);
});
export const PANORAMA_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(12 * stacks, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(PANORAMA_STACKS);
  return `Rime-Draped Sprouts: Panorama x${stacks}`;
}, 3);
export const PANORAMA_OFFIELD = new Buff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(52, DamageType.Basic, Stat.DmgBonus); return "Rime-Draped Sprouts: Panorama"; });

/** Whispers of Sirens, Cantarella's signature, R1: From the Deep. +12% ATK flat. Gentle Dream:
 *  an Echo Skill cast within 10s of an Intro/Basic grants a stack, up to two (echoes are assumed
 *  unique, so no per-name tracking) — same "stays ready" approximation as Qiuyuan's Bamboo
 *  Cleaver, and the same one-buff-three-levels shape (1 ready, 2/3 the real stacks). Stack 1
 *  pays +40% Basic Attack DMG Bonus, stack 2 also ignores 12% Havoc RES. Lost entirely if she's
 *  switched off field. Cantarella, character 1607, released 2.2 —
 *  https://ww.nanoka.cc/character/1607, https://ww.nanoka.cc/weapon/21050056 */
export const WHISPERS_OF_SIRENS = new Gear("Whispers of Sirens", (ctx) => {
  const a = ctx.action!;
  ctx.add(500, Stat.BaseAtk);
  ctx.add(72, Stat.CritDmg);
  ctx.add(12, Stat.BonusAtk);

  const gentle = ctx.stacksOf(GENTLE_DREAM);
  if (a.cast === Cast.Intro || a.cast === Cast.Basic) {
    if (!gentle) ctx.grantSelf(GENTLE_DREAM);
  }
});
export const GENTLE_DREAM = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  const a = ctx.action!;
  if (!a.active) { ctx.revoke(GENTLE_DREAM); return; }
  if (a.cast === Cast.Echo || a.cast2 === Cast.Echo) ctx.grantSelf(GENTLE_DREAM);
  const held = ctx.stacksOf(GENTLE_DREAM);
  if (held < 2) return;
  ctx.add(40, DamageType.Basic, Stat.DmgBonus);
  if (held >= 3) ctx.add(12, Element.Havoc, Stat.ResIgnore);
  return `Whispers of Sirens: Gentle Dream x${held - 1}`;
}, 3);

/** Lethean Elegy, Phrolova's signature, R1: Underworld Requiem. +12% ATK flat. Dealing Echo
 *  Skill DMG (a damage-type hit, not just a cast that counts as one) grants +32% Skill DMG
 *  Bonus, +32% Echo Skill DMG Amplification and 8% DEF ignore for 12s. R5 (`LETHEAN_ELEGY_R5`,
 *  by explicit instruction alongside Phrolova's own S1-S6 loadout): base ATK/Crit Rate are the
 *  same at every refinement — only the passive's own numbers scale (+24% ATK flat; +64%/+64%/
 *  16% DEF ignore on the same trigger). Phrolova, character 1608, released 2.5 —
 *  https://ww.nanoka.cc/character/1608, https://ww.nanoka.cc/weapon/21050066 */
export const LETHEAN_ELEGY = new Gear("Lethean Elegy", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(24.3, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);
  if (ctx.action!.type === DamageType.Echo) ctx.grantSelf(UNDERWORLD_REQUIEM);
});
export const UNDERWORLD_REQUIEM = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(32, DamageType.Skill, Stat.DmgBonus);
  ctx.add(32, DamageType.Echo, Stat.Amp);
  ctx.add(8, Stat.DefIgnore);
  return "Lethean Elegy: Underworld Requiem";
});
export const LETHEAN_ELEGY_R5 = new Gear("Lethean Elegy R5", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(24.3, Stat.CritRate);
  ctx.add(24, Stat.BonusAtk);
  if (ctx.action!.type === DamageType.Echo) ctx.grantSelf(UNDERWORLD_REQUIEM_R5);
});
export const UNDERWORLD_REQUIEM_R5 = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(64, DamageType.Skill, Stat.DmgBonus);
  ctx.add(64, DamageType.Echo, Stat.Amp);
  ctx.add(16, Stat.DefIgnore);
  return "Lethean Elegy: Underworld Requiem R5";
});

/**
 * Freeze Frame, Lucilla's signature (R1 "Light's Offering"): +12% ATK flat. After inflicting
 * Glacio Chafe, the wielder gets +30% Glacio DMG Bonus for 12s (short window, lost after the
 * outro action gains stats) and the whole team — wielder included — gets +24% ATK for 30s
 * (permanent uptime). "Effects of the same name cannot be stacked", matching both buffs'
 * default max_stacks of 1. Reacts to the wielder's *own* chafe application (`a.chafe`), so it
 * still works if someone other than Lucilla equips it. Lucilla, character 1109, released 3.4 —
 * https://ww.nanoka.cc/character/1109, https://ww.nanoka.cc/weapon/21050086
 */
export const FREEZE_FRAME = new Gear("Freeze Frame", (ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(24.3, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);
  if (ctx.action!.chafe > 0) { ctx.grantSelf(FREEZE_FRAME_SELF); ctx.grantGlobal(FREEZE_FRAME_TEAM); }
});
export const FREEZE_FRAME_SELF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(30, Element.Glacio, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(FREEZE_FRAME_SELF);
  return "Freeze Frame: Light's Offering";
});
export const FREEZE_FRAME_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(24, Stat.BonusAtk); return "Freeze Frame: Light's Offering"; });

/** Stellar Symphony, Shorekeeper's signature: 12% HP to herself, 14% attack to the team, and
 *  concerto back on any liberation. R1, the rank the sheet's numbers describe. Shorekeeper,
 *  character 1505, released 1.3 — https://ww.nanoka.cc/character/1505 */
export const SK_SIG = new Gear("Stellar Symphony", (ctx) => {
  ctx.add(412.5, Stat.BaseAtk);
  ctx.add(77.04, Stat.Er);       // the level 90 energy regen substat
  ctx.add(12, Stat.BonusHp);
  ctx.grantGlobal(SK_SIG_TEAM);
  if (isLiberation(ctx.action!)) ctx.gain(Resource.Concerto, 800);
});
export const SK_SIG_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(14, Stat.BonusAtk); return "Stellar Symphony: Astral Evolvement"; });

/** Stringmaster, R1: Electric Amplification. +12% Attribute DMG Bonus flat (unscoped — "all
 *  attribute" isn't the wielder's own element), +12% ATK on any inactive action. Skill DMG
 *  stacks ATK twice over (12% a stack), lost after the outro action gains stats. Encore's own
 *  weapon, by explicit instruction. */
export const STRINGMASTER = new Gear("Stringmaster", (ctx) => {
  ctx.add(500, Stat.BaseAtk);
  ctx.add(36, Stat.CritRate);
  ctx.add(12, Stat.DmgBonus);
  if (ctx.action!.type === DamageType.Skill) ctx.grantSelf(STRINGMASTER_STACKS);
});
export const STRINGMASTER_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (!ctx.action!.active) ctx.add(12, Stat.BonusAtk);
  const held = ctx.stacksOf(STRINGMASTER_STACKS);
  ctx.add(12 * held, Stat.BonusAtk);
  if (isOutro(ctx.action!)) ctx.revoke(STRINGMASTER_STACKS);
  return `Stringmaster: Electric Amplification x${held}`;
}, 2);
