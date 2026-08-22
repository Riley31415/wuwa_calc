/**
 * Mainslot echoes and sonatas from Lahairoi (versions 2.8-3.4), ported to the new engine. See
 * src/echoes/lahairoi.ts for the original — each resonator's own file picks which of these its
 * loadout equips. (Buling and Lucilla, also Lahairoi-era, own no mainslot echo or sonata of
 * their own — Lucilla reuses Bell-Borne Geochelone/Moonlit Clouds from echoes_jinzhou.ts and
 * Dream of the Lost from echoes_septimont.ts.)
 */
import {
  Buff, Mainslot, Action, Stat, Element, Type1, Cast, Scaling,
  addStat, applySelf, casting, currentAction, revoke,
} from "../kit.js";

/* ------------------------------------------------------------------------------ Sigrika, 3.2 */

/** Nameless Explorer, Sigrika's own mainslot echo — flat Aero/Echo Skill DMG Bonus for whoever
 *  wears it, no trigger. */
export const ACTION_NAMELESS_EXPLORER = new Action("Echo - Nameless Explorer", {
  cast: Cast.Echo, element: Element.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6,
});
export const NAMELESS_EXPLORER = new Mainslot({
  name: "Nameless Explorer",
  action: ACTION_NAMELESS_EXPLORER,
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Aero); addStat(Stat.DmgBonus, 20, Type1.Echo); },
});

/** Sound of True Name, Sigrika's own sonata (paired directly with Nameless Explorer above).
 *  2pc: +10% Aero DMG Bonus flat. 5pc: dealing Echo Skill DMG grants +20% Echo Skill Crit Rate
 *  and +15% Aero DMG Bonus for 5s — short window, lost after the outro action gains stats. */
export const SOUND_OF_TRUE_NAME_2PC = new Buff({ name: "Sound of True Name 2pc", apply: () => addStat(Stat.DmgBonus, 10, Element.Aero) });
export const SOUND_OF_TRUE_NAME_BUFF = new Buff({
  name: "Sound of True Name 5pc",
  apply: () => { addStat(Stat.CritRate, 20, Type1.Echo); addStat(Stat.DmgBonus, 15, Element.Aero); },
  convert: () => { if (casting(Cast.Outro)) revoke(SOUND_OF_TRUE_NAME_BUFF); },
});
export const SOUND_OF_TRUE_NAME_5PC = new Buff({
  name: "Sound of True Name 5pc",
  update: () => { if (currentAction().type === Type1.Echo) applySelf(SOUND_OF_TRUE_NAME_BUFF, 1); },
});
