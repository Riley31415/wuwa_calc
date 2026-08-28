/** Mainslot echoes and sonatas from Mengzhou (versions 3.5-3.8). */
import {
  Buff, Sonata, Sonata2pc, Mainslot, EchoType, Action, Stat, Attribute, Type1, Cast, Scaling,
  addStat, frozenStacks, applyCurrent, applyTeam, queue, removeStack, revokeTeam, currentAction, casting,
  revokeCurrent, triggeredAction,
} from "../engine/kit.js";
import { applied, appliedByMe } from "../engine/kit.js";
import { SHIELD, HAVOC_BANE, GLACIO_CHAFE } from "../shared/status.js";
import { TUNE_STRAIN_SHIFTING } from "../shared/tunebreak.js";

/* ------------------------------------------------------------------------------ Jingran, 3.6 */

/** Myriad Snare, Jingran's own mainslot echo — flat Fusion/Heavy Attack DMG Bonus for whoever
 *  wears it, no trigger. */
export const ACTION_MYRIAD_SNARE = new Action("Echo - Myriad Snare", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Hp, type: Type1.Echo, mv: 17.23, energy: 3.8,
});
export const MYRIAD_SNARE = new Mainslot({
  name: "Myriad Snare",
  action: ACTION_MYRIAD_SNARE,
  echoType: EchoType.SUMMON,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Fusion); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
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
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(LAMP_STACKS); },
});
export const LAMP_5PC = new Sonata({
  name: "Lamp of Nether Road 5pc",
  updateBuffs: () => { if (applied(SHIELD)) applyCurrent(LAMP_STACKS, applied(SHIELD)); },
});
export const LAMP_2PC = new Sonata2pc({ name: "Lamp of Nether Road 2pc", constantStats: () => addStat(Stat.BonusHp, 10) });

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
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(CALAMITY_EFFIGY_STRAIN); },
});
export const CALAMITY_EFFIGY = new Mainslot({
  name: "Calamity Effigy",
  action: ACTION_CALAMITY_EFFIGY,
  echoType: EchoType.TRANSFORM,
  constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Aero),
  updateBuffs: () => { if (appliedByMe(TUNE_STRAIN_SHIFTING)) applyCurrent(CALAMITY_EFFIGY_STRAIN, 1); },
});

/** Heart of Evil's Purge, Calamity Effigy's own sonata. 2pc: +10% Aero DMG Bonus flat. 5pc:
 *  inflicting Tune Strain - Shifting grants +20% Crit. DMG and +30% Aero DMG Bonus for 15s — the
 *  wearer's own short window, lost after the outro. */
export const HEART_OF_EVILS_PURGE_2PC = new Sonata2pc({ name: "Heart of Evil's Purge 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Aero) });
export const HEART_OF_EVILS_PURGE_5PC = new Sonata({
  name: "Heart of Evil's Purge 5pc",
  updateBuffs: () => { if (appliedByMe(TUNE_STRAIN_SHIFTING)) applyCurrent(HEART_OF_EVILS_PURGE_BUFF, 1); },
});
export const HEART_OF_EVILS_PURGE_BUFF = new Buff({
  name: "Heart of Evil's Purge",
  applyStats: () => { addStat(Stat.CritDmg, 20); addStat(Stat.DmgBonus, 30, Attribute.Aero); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(HEART_OF_EVILS_PURGE_BUFF); },
});

/* ------------------------------------------------------------------ Yangyang: Xuanling */

/** Thousand-Puppet Pavilion, Yangyang: Xuanling's own mainslot echo. The cast itself is one 60.80%
 *  Havoc hit that also summons 4 Blades of Thousand Memories for 15s; while any are out, the
 *  wearer inflicting Havoc Bane spends one for a 22.80% Havoc hit — `appliedByMe`, so a stack
 *  Chisa's Thread of Bane hands out off the wearer's swing is hers and spends no blade. The blade's own 1s cooldown isn't modelled — nothing here has a
 *  clock — but the four blades are, as the buff's own stacks, so a visit only ever cashes what the
 *  cast actually summoned, and never off a triggered action, which is what stops one blade's own
 *  hit from spending the next three beside a kit that inflicts on every hit. */
export const ACTION_THOUSAND_PUPPET_PAVILION = new Action("Echo - Thousand-Puppet Pavilion", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 	109.44, energy: 1.52,
  updateBuffs: () => queue(ACTION_BLADE_OF_THOUSAND_MEMORIES),
});
export const ACTION_BLADE_OF_THOUSAND_MEMORIES = new Action("Echo - Blade of Thousand Memories x4", {
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 41.04*4, energy: 0.57*4,
});
export const THOUSAND_PUPPET_PAVILION = new Mainslot({
  name: "Thousand-Puppet Pavilion",
  action: ACTION_THOUSAND_PUPPET_PAVILION,
  echoType: EchoType.SUMMON,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Havoc); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/** Song of Feathered Trace, Thousand-Puppet Pavilion's own sonata. 2pc: +10% Energy Regen flat.
 *  5pc has one branch per Negative Status, and a wearer only ever reaches one of them: inflicting
 *  Havoc Bane grants Xuanling's Feather (+20% Crit. Rate, +35% Heavy Attack DMG Bonus, 15s), and
 *  inflicting Glacio Chafe grants the whole team Chongming's Feather (+0.1% ATK per 1% of the
 *  wearer's own Energy Regen, capped at +25%, 10s). Both are short windows — the self one is lost
 *  after the outro, the team one on the wearer's next intro. Chongming's is taken at its own cap
 *  per CLAUDE.md's rule for a team buff scaled by the applier's own stats, the same way Halo of
 *  Starry Radiance takes its. Both branches read `appliedByMe`: they are "when *you* inflict"
 *  payouts, so a stack one of the markers that inflict off somebody else's cast adds (Chisa's
 *  Thread of Bane, Lucilla's Film Roll) belongs to that marker's owner, not to the wearer. */
export const FEATHERED_TRACE_2PC = new Sonata2pc({ name: "Song of Feathered Trace 2pc", constantStats: () => addStat(Stat.Er, 10) });
export const FEATHERED_TRACE_5PC = new Sonata({
  name: "Song of Feathered Trace 5pc",
  updateBuffs: () => {
    if (appliedByMe(HAVOC_BANE)) applyCurrent(XUANLINGS_FEATHER, 1);
    if (appliedByMe(GLACIO_CHAFE)) applyTeam(CHONGMINGS_FEATHER, 1);
  },
});
export const XUANLINGS_FEATHER = new Buff({
  name: "Song of Feathered Trace: Xuanling's Feather",
  applyStats: () => { addStat(Stat.CritRate, 20); addStat(Stat.DmgBonus, 35, Type1.Heavy); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(XUANLINGS_FEATHER); },
});
export const CHONGMINGS_FEATHER = new Buff({
  name: "Song of Feathered Trace: Chongming's Feather",
  applyStats: () => addStat(Stat.BonusAtk, 25),
});

/* -------------------------------------------------------------------------------- Suisui, 3.6 */

/** Forbidden Bastion, Suisui's own mainslot echo: one 237.60% Glacio bash, and +10% Healing Bonus
 *  for whoever wears it — a healer's echo, so the flat half is a stat this calculator never reads
 *  (statuses.ts's own note on Healing Bonus). It carries no sonata of its own; Suisui pairs it
 *  with Song of Feathered Trace above, whose Chongming's Feather branch is written for exactly her
 *  — Glacio Chafe into an Energy-Regen-scaled team ATK buff. */
export const ACTION_FORBIDDEN_BASTION = new Action("Echo - Forbidden Bastion", {
  cast: Cast.Echo, element: Attribute.Glacio, scaling: Scaling.Atk, type: Type1.Echo, mv: 237.60, energy: 3.30,
});
export const FORBIDDEN_BASTION = new Mainslot({
  name: "Forbidden Bastion",
  action: ACTION_FORBIDDEN_BASTION,
  echoType: EchoType.SUMMON,
  constantStats: () => addStat(Stat.HealingBonus, 10),
});
