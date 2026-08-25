/** Mainslot echoes and sonatas from Mengzhou (versions 3.5-3.8). */
import {
  Buff, Sonata, Sonata2pc, Mainslot, Action, Stat, Attribute, Type1, Cast, Scaling,
  addStat, frozenStacks, applySelf, applyTeam, revokeTeam, currentAction, casting, revoke,
} from "../kit.js";
import { applied } from "../kit.js";
import { SHIELD } from "../statuses.js";
import { TUNE_STRAIN_SHIFTING } from "../tunebreak.js";

/* ------------------------------------------------------------------------------ Jingran, 3.6 */

/** Myriad Snare, Jingran's own mainslot echo — flat Fusion/Heavy Attack DMG Bonus for whoever
 *  wears it, no trigger. */
export const ACTION_MYRIAD_SNARE = new Action("Echo - Myriad Snare", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Hp, type: Type1.Echo, mv: 17.23, energy: 3.8,
});
export const MYRIAD_SNARE = new Mainslot({
  name: "Myriad Snare",
  action: ACTION_MYRIAD_SNARE,
  applyStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Fusion); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/** Lamp of Nether Road, Jingran's own sonata (paired directly with Myriad Snare above). 5pc: a
 *  shield grants 5% crit rate, four frozenStacks, full four pay 15% fusion damage on top. 2pc: +10%
 *  Bonus HP flat. Short window, so it still counts on the wearer's own outro (see jinzhou.ts's
 *  HERON_HANDOFF), then is lost. */
export const LAMP_STACKS = new Buff({
  name: "Lamp of Nether Road", maxStacks: 4,
  applyStats: () => {
    addStat(Stat.CritRate, 5 * frozenStacks());
    if (frozenStacks() >= 4) addStat(Stat.DmgBonus, 15, Attribute.Fusion);
  },
  convertStats: () => { if (casting(Cast.Outro)) revoke(LAMP_STACKS); },
});
export const LAMP_5PC = new Sonata({
  name: "Lamp of Nether Road 5pc",
  abbreviation: "Lamp",
  updateBuffs: () => { if (applied(SHIELD)) applySelf(LAMP_STACKS, applied(SHIELD)); },
});
export const LAMP_2PC = new Sonata2pc({ name: "Lamp of Nether Road 2pc", applyStats: () => addStat(Stat.BonusHp, 10) });

/* ----------------------------------------------------------------------------- Qingxiao, 3.6 */

/** Calamity Effigy, Qingxiao's own mainslot echo: one 405% Aero hit. Whoever wears it gets +10%
 *  Aero DMG Bonus flat, and +10% more for 15s on inflicting Tune Strain - Shifting — short and
 *  their own, so lost after the outro. Pairs with Heart of Evil's Purge below. */
export const ACTION_CALAMITY_EFFIGY = new Action("Echo - Calamity Effigy", {
  cast: Cast.Echo, element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.62,
});
export const CALAMITY_EFFIGY_STRAIN = new Buff({
  name: "Calamity Effigy (strain)",
  applyStats: () => addStat(Stat.DmgBonus, 10, Attribute.Aero),
  convertStats: () => { if (casting(Cast.Outro)) revoke(CALAMITY_EFFIGY_STRAIN); },
});
export const CALAMITY_EFFIGY = new Mainslot({
  name: "Calamity Effigy",
  abbreviation: "Effigy",
  action: ACTION_CALAMITY_EFFIGY,
  applyStats: () => addStat(Stat.DmgBonus, 10, Attribute.Aero),
  updateBuffs: () => { if (applied(TUNE_STRAIN_SHIFTING)) applySelf(CALAMITY_EFFIGY_STRAIN, 1); },
});

/** Heart of Evil's Purge, Calamity Effigy's own sonata. 2pc: +10% Aero DMG Bonus flat. 5pc:
 *  inflicting Tune Strain - Shifting grants +20% Crit. DMG and +30% Aero DMG Bonus for 15s — the
 *  wearer's own short window, lost after the outro. */
export const HEART_OF_EVILS_PURGE_2PC = new Sonata2pc({ name: "Heart of Evil's Purge 2pc", applyStats: () => addStat(Stat.DmgBonus, 10, Attribute.Aero) });
export const HEART_OF_EVILS_PURGE_5PC = new Sonata({
  name: "Heart of Evil's Purge 5pc",
  abbreviation: "HoEP",
  updateBuffs: () => { if (applied(TUNE_STRAIN_SHIFTING)) applySelf(HEART_OF_EVILS_PURGE_BUFF, 1); },
});
export const HEART_OF_EVILS_PURGE_BUFF = new Buff({
  name: "Heart of Evil's Purge",
  applyStats: () => { addStat(Stat.CritDmg, 20); addStat(Stat.DmgBonus, 30, Attribute.Aero); },
  convertStats: () => { if (casting(Cast.Outro)) revoke(HEART_OF_EVILS_PURGE_BUFF); },
});
