/** Mainslot echoes and sonatas from Mengzhou (versions 3.5-3.8). */
import {
  Buff, Sonata, Sonata2pc, Mainslot, Action, Stat, Attribute, Type1, Cast, Scaling,
  addStat, stacks, applySelf, currentAction, casting, revoke,
} from "../kit.js";

/* ------------------------------------------------------------------------------ Jingran, 3.6 */

/** Myriad Snare, Jingran's own mainslot echo — flat Fusion/Heavy Attack DMG Bonus for whoever
 *  wears it, no trigger. */
export const ACTION_MYRIAD_SNARE = new Action("Echo - Myriad Snare", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Hp, type: Type1.Echo, mv: 17.23, energy: 3.8,
});
export const MYRIAD_SNARE = new Mainslot({
  name: "Myriad Snare",
  action: ACTION_MYRIAD_SNARE,
  apply: () => { addStat(Stat.DmgBonus, 12, Attribute.Fusion); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/** Lamp of Nether Road, Jingran's own sonata (paired directly with Myriad Snare above). 5pc: a
 *  shield grants 5% crit rate, four stacks, full four pay 15% fusion damage on top. 2pc: +10%
 *  Bonus HP flat. Short window, so it still counts on the wearer's own outro (see jinzhou.ts's
 *  HERON_HANDOFF), then is lost. */
export const LAMP_STACKS = new Buff({
  name: "Lamp of Nether Road", maxStacks: 4,
  apply: () => {
    addStat(Stat.CritRate, 5 * stacks());
    if (stacks() >= 4) addStat(Stat.DmgBonus, 15, Attribute.Fusion);
  },
  convert: () => { if (casting(Cast.Outro)) revoke(LAMP_STACKS); },
});
export const LAMP_5PC = new Sonata({
  name: "Lamp of Nether Road 5pc",
  update: () => { if (currentAction().shields) applySelf(LAMP_STACKS, currentAction().shields); },
});
export const LAMP_2PC = new Sonata2pc({ name: "Lamp of Nether Road 2pc", apply: () => addStat(Stat.BonusHp, 10) });
