/** Mainslot echoes and sonatas from Septimont (versions 2.5-2.7) — see echoes/jinzhou.ts for
 *  the region split's own rationale. Each resonator's own file picks which of these its loadout
 *  equips. */
import { isOutro, isIntro, isEcho } from "../state.js";
import { Buff, GlobalBuff, Gear, Mainslot, Action, PRIORITY } from "../kit.js";
import { DamageType, Cast, Element, Scaling, Stat } from "../stats.js";
const { Echo } = DamageType;
const { Havoc, Electro, Aero, Fusion } = Element;
const { Atk } = Scaling;
const { DmgBonus, BonusAtk, CritDmg } = Stat;

/* --------------------------------------------------------------------------------- Phrolova, 2.5 */

/** Nightmare: Hecate, Phrolova's own mainslot echo — flat Havoc/Echo Skill DMG Bonus for
 *  whoever wears it, no trigger. Phrolova, character 1608, released 2.5 —
 *  https://ww.nanoka.cc/character/1608, https://ww.nanoka.cc/echo/6000115 */
export const ACTION_NM_HECATE = new Action("Echo: Nightmare: Hecate", {
  cast: Cast.Echo, element: Havoc, scaling: Atk, type: Echo, mv: 457.17, energy: 315,
});
export const NM_HECATE = new Mainslot("Nightmare: Hecate", ACTION_NM_HECATE, (ctx) => {
  ctx.add(12, Havoc, DmgBonus);
  ctx.add(20, DamageType.Echo, DmgBonus);
});

/** Dream of the Lost 3pc, Phrolova's own sonata — also reused by Lucilla (both hold 0 max
 *  Resonance Energy). "Holding 0 Resonance Energy" is checked for real off the wearer's own
 *  `maxEnergy`, rather than assumed unconditionally true because only they equip it. */
export const DREAM_OF_THE_LOST_3PC = new Gear("Dream of the Lost 3pc", (ctx) => {
  if (ctx.slot.resonator?.maxEnergy !== 0) return;
  ctx.add(20, Stat.CritRate);
  ctx.add(35, DamageType.Echo, DmgBonus);
});

/* ----------------------------------------------------------------------------- Augusta, 2.6 */

/** False Sovereign, Augusta's own mainslot echo — she's the only Electro Heavy Attack
 *  character, so it lives here rather than as a truly generic piece. Flat Electro/Heavy Attack
 *  DMG Bonus for whoever wears it. Casting Intro also summons it for a bonus hit — the skill's
 *  own 2-charge/8s-CD gating isn't modelled (no real-time clock here), so it's assumed available
 *  whenever an Intro lands, same treatment as every other cooldown-gated echo. Augusta, character
 *  1306, released 2.6 — https://ww.nanoka.cc/character/1306 */
export const ACTION_FALSE_SOVEREIGN = new Action("Echo: False Sovereign", {
  cast: Cast.Echo, element: Electro, scaling: Atk, type: Echo, mv: 221.4,
});
export const FALSE_SOVEREIGN = new Mainslot("False Sovereign", ACTION_FALSE_SOVEREIGN, (ctx) => {
  ctx.add(12, Electro, DmgBonus);
  ctx.add(12, DamageType.Heavy, DmgBonus);
  if (isIntro(ctx.action!)) ctx.queue(ACTION_FALSE_SOVEREIGN_INTRO);
});
/** The bonus summon on the wielder's own Intro cast — not a real press, so no `cast` trigger,
 *  same treatment as Phrolova's Hecate follow-ups. */
export const ACTION_FALSE_SOVEREIGN_INTRO = new Action("Echo: False Sovereign (Intro)", {
  element: Electro, scaling: Atk, type: Echo, mv: 405, energy: 304,
});

/** Crown of Valor, Augusta's own sonata — also reused by Iuno. 3pc: a shield stacks +6% ATK /
 *  +4% Crit DMG, up to five. */
export const COV_3PC = new Gear("Crown of Valor 3pc", (ctx) => {
  if (ctx.shields) ctx.grantSelf(CROWN_STACKS, ctx.shields);
});
export const CROWN_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(6 * stacks, BonusAtk);
  ctx.add(4 * stacks, CritDmg);
  return `Crown of Valor x${stacks}`;
}, 5);

/** Void Thunder, a generic sonata reused by Augusta. 2pc: +10% Electro DMG Bonus flat. 5pc:
 *  +30% Electro DMG Bonus flat (its real trigger is unconditional here — same "assumed always
 *  up" treatment as Rejuvenating Glow's own 5pc, echoes/jinzhou.ts). */
export const VOID_THUNDER_2PC = new Gear("Void Thunder 2pc", (ctx) => { ctx.add(10, Electro, DmgBonus); });
export const VOID_THUNDER_5PC = new Gear("Void Thunder 5pc", (ctx) => { ctx.add(30, Electro, DmgBonus); });

/* ------------------------------------------------------------------------------- Iuno, 2.6 */

/** Lady of the Sea, Iuno's own mainslot echo. Iuno, character 1410, released 2.6 —
 *  https://ww.nanoka.cc/character/1410. (Her own sonata pick, Sierra Gale, is actually a
 *  Jinzhou-era set — see echoes/jinzhou.ts — she just reuses it.) */
export const ACTION_MYA = new Action("Echo: Lady of the Sea", {
  cast: Cast.Echo, element: Aero, scaling: Atk, type: Echo, mv: 300.96, energy: 418,
});
export const MYA = new Mainslot("Lady of the Sea", ACTION_MYA, (ctx) => {
  ctx.add(12, DamageType.Liberation, DmgBonus);
  ctx.add(12, Aero, DmgBonus);
});

/* ----------------------------------------------------------------------------- Galbrena, 2.7 */

/** Corrosaurus, Galbrena's own mainslot echo — flat Fusion/Echo Skill DMG Bonus for whoever
 *  wears it, no trigger. Galbrena, character 1208, released 2.7 —
 *  https://ww.nanoka.cc/character/1208, https://ww.nanoka.cc/echo/6000120 */
export const ACTION_CORROSAURUS = new Action("Echo: Corrosaurus", {
  cast: Cast.Echo, element: Fusion, scaling: Atk, type: Echo, mv: 273.6, energy: 380,
});
export const CORROSAURUS = new Mainslot("Corrosaurus", ACTION_CORROSAURUS, (ctx) => {
  ctx.add(12, Fusion, DmgBonus);
  ctx.add(20, DamageType.Echo, DmgBonus);
});

/** Flamewing's Shadow 3pc, Galbrena's own sonata: dealing Echo Skill DMG grants +20% Heavy
 *  Attack Crit Rate for 6s; dealing Heavy Attack DMG grants +20% Echo Skill Crit Rate for 6s;
 *  while both are up, +16% Fusion DMG Bonus. Same shape as her own weapon's DEF-ignore pairing
 *  (weapons/pistol.ts). */
export const FLAMEWING_SHADOW_3PC = new Gear("Flamewing's Shadow 3pc", (ctx) => {
  const a = ctx.action!;
  if (a.type === DamageType.Echo) ctx.grantSelf(FLAMEWING_SHADOW_HEAVY);
  if (a.type === DamageType.Heavy) ctx.grantSelf(FLAMEWING_SHADOW_ECHO);
  if (ctx.stacksOf(FLAMEWING_SHADOW_HEAVY) && ctx.stacksOf(FLAMEWING_SHADOW_ECHO)) ctx.add(16, Fusion, DmgBonus);
});
export const FLAMEWING_SHADOW_HEAVY = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(20, DamageType.Heavy, Stat.CritRate);
  if (isOutro(ctx.action!)) ctx.revoke(FLAMEWING_SHADOW_HEAVY);
  return "Flamewing's Shadow: Heavy Attack Crit. Rate";
});
export const FLAMEWING_SHADOW_ECHO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(20, DamageType.Echo, Stat.CritRate);
  if (isOutro(ctx.action!)) ctx.revoke(FLAMEWING_SHADOW_ECHO);
  return "Flamewing's Shadow: Echo Skill Crit. Rate";
});

/* ------------------------------------------------------------------------------- Qiuyuan, 2.7 */

/** Reminiscence: Fenrico, Qiuyuan's own mainslot echo — flat Aero/Heavy DMG Bonus for whoever
 *  wears it in the mainslot, no trigger. Qiuyuan, character 1411, released 2.7 —
 *  https://ww.nanoka.cc/character/1411, https://ww.nanoka.cc/echo/6000116 */
export const ACTION_FENRICO = new Action("Echo: Reminiscence: Fenrico", {
  cast: Cast.Echo, element: Aero, scaling: Atk, type: Echo, mv: 273.6, energy: 380,
});
export const FENRICO = new Mainslot("Reminiscence: Fenrico", ACTION_FENRICO, (ctx) => {
  ctx.add(12, Aero, DmgBonus);
  ctx.add(12, DamageType.Heavy, DmgBonus);
});

/** Law of Harmony 3pc, Qiuyuan's own sonata: casting Echo Skill grants the caster +30% Heavy
 *  Attack DMG Bonus for 4s, and the whole team +4% Echo Skill DMG Bonus, stacking up to 4 — one
 *  stack per distinct named Echo that's triggered it (every echo cast is assumed unique). */
export const LAW_OF_HARMONY_3PC = new Gear("Law of Harmony 3pc", (ctx) => {
  if (isEcho(ctx.action!)) {
    ctx.grantSelf(LAW_OF_HARMONY_SELF);
    ctx.grantGlobal(LAW_OF_HARMONY_TEAM);
  }
});
export const LAW_OF_HARMONY_SELF = new Buff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(30, DamageType.Heavy, DmgBonus); return "Law of Harmony"; });
export const LAW_OF_HARMONY_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(4 * stacks, DamageType.Echo, DmgBonus);
  return `Law of Harmony x${stacks}`;
}, 4);
