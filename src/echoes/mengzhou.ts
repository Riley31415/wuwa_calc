/**
 * Mainslot echoes and sonatas from Mengzhou (versions 3.5-3.8), ported to the new engine. See
 * src/echoes/mengzhou.ts for the original — each resonator's own file picks which of these its
 * loadout equips.
 */
import {
  Buff, Mainslot, Action, Stat, Element, Type1, Cast, Scaling,
  addStat, stacks, applySelf, currentAction,
} from "../kit.js";

/* ------------------------------------------------------------------------------ Jingran, 3.6 */

/** Myriad Snare, Jingran's own mainslot echo — flat Fusion/Heavy Attack DMG Bonus for whoever
 *  wears it, no trigger. */
export const ACTION_MYRIAD_SNARE = new Action("Echo - Myriad Snare", {
  cast: Cast.Echo, element: Element.Fusion, scaling: Scaling.Hp, type: Type1.Echo, mv: 17.23,
});
export const MYRIAD_SNARE = new Mainslot({
  name: "Myriad Snare",
  action: ACTION_MYRIAD_SNARE,
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Fusion); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/** Lamp of Nether Road, Jingran's own sonata (paired directly with Myriad Snare above). 5pc: a
 *  shield grants 5% crit rate, four stacks, full four pay 15% fusion damage on top. 2pc: +10%
 *  Bonus HP flat. */
export const LAMP_STACKS = new Buff({
  name: "Lamp of Nether Road", maxStacks: 4,
  apply: () => {
    addStat(Stat.CritRate, 5 * stacks());
    if (stacks() >= 4) addStat(Stat.DmgBonus, 15, Element.Fusion);
  },
});
export const LAMP_5PC = new Buff({
  name: "Lamp of Nether Road 5pc",
  update: () => { if (currentAction().shields) applySelf(LAMP_STACKS, currentAction().shields); },
});
export const LAMP_2PC = new Buff({ name: "Lamp of Nether Road 2pc", apply: () => addStat(Stat.BonusHp, 10) });
