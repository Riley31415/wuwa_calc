/** Mainslot echoes and sonatas from Lahairoi (versions 2.8-3.4) — see echoes/jinzhou.ts for the
 *  region split's own rationale. Each resonator's own file picks which of these its loadout
 *  equips. (Buling and Lucilla, also Lahairoi-era, own no mainslot echo or sonata of their own
 *  — Lucilla reuses Bell-Borne Geochelone/Moonlit Clouds from jinzhou.ts and Dream of the Lost
 *  from septimont.ts.) */
import { isOutro } from "../state.js";
import { Buff, Gear, Mainslot, Action, PRIORITY } from "../kit.js";
import { DamageType, Cast, Element, Scaling, Stat } from "../stats.js";
const { Echo } = DamageType;
const { Aero } = Element;
const { Atk } = Scaling;
const { DmgBonus } = Stat;

/* ------------------------------------------------------------------------------ Sigrika, 3.2 */

/** Nameless Explorer, Sigrika's own mainslot echo — flat Aero/Echo Skill DMG Bonus for whoever
 *  wears it, no trigger. Sigrika, character 1412, released 3.2 —
 *  https://ww.nanoka.cc/character/1412, https://ww.nanoka.cc/echo/6000192 */
export const ACTION_NAMELESS_EXPLORER = new Action("Echo: Nameless Explorer", {
  cast: Cast.Echo, element: Aero, scaling: Atk, type: Echo, mv: 273.6, energy: 380,
});
export const NAMELESS_EXPLORER = new Mainslot("Nameless Explorer", ACTION_NAMELESS_EXPLORER, (ctx) => {
  ctx.add(12, Aero, DmgBonus);
  ctx.add(20, DamageType.Echo, DmgBonus);
});

/** Sound of True Name, Sigrika's own sonata (paired directly with Nameless Explorer above).
 *  2pc: +10% Aero DMG Bonus flat. 5pc: dealing Echo Skill DMG grants +20% Echo Skill Crit Rate
 *  and +15% Aero DMG Bonus for 5s — short window, lost after the outro action gains stats. */
export const SOUND_OF_TRUE_NAME_2PC = new Gear("Sound of True Name 2pc", (ctx) => { ctx.add(10, Aero, DmgBonus); });
export const SOUND_OF_TRUE_NAME_5PC = new Gear("Sound of True Name 5pc", (ctx) => {
  if (ctx.action!.type === Echo) ctx.grantSelf(SOUND_OF_TRUE_NAME_BUFF);
});
export const SOUND_OF_TRUE_NAME_BUFF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(20, DamageType.Echo, Stat.CritRate);
  ctx.add(15, Aero, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(SOUND_OF_TRUE_NAME_BUFF);
  return "Sound of True Name";
});
