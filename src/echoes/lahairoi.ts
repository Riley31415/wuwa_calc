/** Mainslot echoes and sonatas from Lahairoi (versions 2.8-3.4). Buling and Lucilla, also
 *  Lahairoi-era, own no mainslot echo/sonata of their own — Lucilla reuses Bell-Borne
 *  Geochelone/Moonlit Clouds from jinzhou.ts and Dream of the Lost from septimont.ts. */
import {
  Buff, Sonata, Sonata2pc, Mainslot, Action, Stat, Attribute, Type1, Cast, Scaling,
  addStat, applySelf, casting, currentAction, queueOutro, revoke,
} from "../kit.js";

/* ------------------------------------------------------------------------------ Sigrika, 3.2 */

/** Nameless Explorer, Sigrika's own mainslot echo — flat Aero/Echo Skill DMG Bonus for whoever
 *  wears it, no trigger. */
export const ACTION_NAMELESS_EXPLORER = new Action("Echo - Nameless Explorer", {
  cast: Cast.Echo, element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
});
export const NAMELESS_EXPLORER = new Mainslot({
  name: "Nameless Explorer",
  action: ACTION_NAMELESS_EXPLORER,
  apply: () => { addStat(Stat.DmgBonus, 12, Attribute.Aero); addStat(Stat.DmgBonus, 20, Type1.Echo); },
});

/** Sound of True Name, Sigrika's own sonata (paired directly with Nameless Explorer above).
 *  2pc: +10% Aero DMG Bonus flat. 5pc: dealing Echo Skill DMG grants +20% Echo Skill Crit Rate
 *  and +15% Aero DMG Bonus for 5s — short window, lost after the outro action gains stats. */
export const SOUND_OF_TRUE_NAME_2PC = new Sonata2pc({ name: "Sound of True Name 2pc", apply: () => addStat(Stat.DmgBonus, 10, Attribute.Aero) });
export const SOUND_OF_TRUE_NAME_BUFF = new Buff({
  name: "Sound of True Name 5pc",
  apply: () => { addStat(Stat.CritRate, 20, Type1.Echo); addStat(Stat.DmgBonus, 15, Attribute.Aero); },
  convert: () => { if (casting(Cast.Outro)) revoke(SOUND_OF_TRUE_NAME_BUFF); },
});
export const SOUND_OF_TRUE_NAME_5PC = new Sonata({
  name: "Sound of True Name 5pc",
  abbreviation: "SoTN",
  update: () => { if (currentAction().type === Type1.Echo) applySelf(SOUND_OF_TRUE_NAME_BUFF, 1); },
});

/* -------------------------------------------------------------------------------- Lynae, 3.6 */

/** Hyvatia: ten lasers at 27.36% apiece. */
export const ACTION_HYVATIA = new Action("Echo - Hyvatia", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Atk, type: Type1.Echo,
  mv: 27.36 * 10,
});

/** Its own handoff: an Outro within 15s of the summon hands the next resonator's Intro +10%
 *  All-Attribute DMG Bonus for 15s. Modelled the way every other echo handoff here is — queued
 *  onto the outro rather than tracking the 15s window, which a rotation never misses. */
export const HYVATIA_HANDOFF = new Buff({
  name: "Hyvatia: Outro",
  apply: () => addStat(Stat.DmgBonus, 10),
  convert: () => { if (casting(Cast.Outro)) revoke(HYVATIA_HANDOFF); },
});

export const HYVATIA = new Mainslot({
  name: "Hyvatia",
  abbreviation: "Hyvatia",
  action: ACTION_HYVATIA,
  update: () => { if (currentAction() === ACTION_HYVATIA) queueOutro(HYVATIA_HANDOFF); },
});
