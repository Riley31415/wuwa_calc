/**
 * Mainslot echoes and sonatas from Septimont (versions 2.5-2.7), ported to the new engine. See
 * src/echoes/septimont.ts for the original — each resonator's own file picks which of these its
 * loadout equips.
 */
import {
  Buff, Mainslot, Action, Stat, Element, Type1, Cast, Scaling,
  addStat, stacks, stacksOf, stacksOfTeam, applySelf, applyTeam, casting, currentAction, revoke, maxEnergy, queue,
} from "../kit.js";

/* --------------------------------------------------------------------------------- Phrolova, 2.5 */

/** Nightmare: Hecate, Phrolova's own mainslot echo — flat Havoc/Echo Skill DMG Bonus for
 *  whoever wears it, no trigger. */
export const ACTION_NM_HECATE = new Action("Echo - Nightmare: Hecate", {
  cast: Cast.Echo, element: Element.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 457.17,
});
export const NM_HECATE = new Mainslot({
  name: "Nightmare: Hecate",
  action: ACTION_NM_HECATE,
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Havoc); addStat(Stat.DmgBonus, 20, Type1.Echo); },
});

/** Dream of the Lost 3pc, Phrolova's own sonata — also reused by Lucilla (both hold 0 max
 *  Resonance Energy). "Holding 0 Resonance Energy" is checked for real off the wearer's own
 *  `maxEnergy()`, rather than assumed unconditionally true because only they equip it. */
export const DREAM_OF_THE_LOST_3PC = new Buff({
  name: "Dream of the Lost 3pc",
  apply: () => {
    if (maxEnergy() !== 0) return;
    addStat(Stat.CritRate, 20);
    addStat(Stat.DmgBonus, 35, Type1.Echo);
  },
});

/* ----------------------------------------------------------------------------- Augusta, 2.6 */

/** False Sovereign, Augusta's own mainslot echo — flat Electro/Heavy Attack DMG Bonus for
 *  whoever wears it. Casting Intro also summons it for a bonus hit — the skill's own 2-charge/
 *  8s-CD gating isn't modelled (no real-time clock here), assumed available whenever an Intro
 *  lands, same treatment as every other cooldown-gated echo. */
export const ACTION_FALSE_SOVEREIGN = new Action("Echo - False Sovereign", {
  cast: Cast.Echo, element: Element.Electro, scaling: Scaling.Atk, type: Type1.Echo, mv: 221.4,
});
export const ACTION_FALSE_SOVEREIGN_INTRO = new Action("Echo - False Sovereign (Intro)", {
  element: Element.Electro, scaling: Scaling.Atk, type: Type1.Echo, mv: 405,
});
export const FALSE_SOVEREIGN = new Buff({
  name: "False Sovereign",
  update: () => { if (casting(Cast.Intro)) queue(ACTION_FALSE_SOVEREIGN_INTRO); },
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Electro); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/** Crown of Valor, Augusta's own sonata — also reused by Iuno. 3pc: a shield stacks +6% ATK /
 *  +4% Crit DMG, up to five. */
export const CROWN_STACKS = new Buff({
  name: "Crown of Valor", maxStacks: 5,
  apply: () => { addStat(Stat.BonusAtk, 6 * stacks()); addStat(Stat.CritDmg, 4 * stacks()); },
});
export const COV_3PC = new Buff({
  name: "Crown of Valor 3pc",
  update: () => { if (currentAction().shields) applySelf(CROWN_STACKS, currentAction().shields); },
});

/** Void Thunder, a generic sonata reused by Augusta. 2pc: +10% Electro DMG Bonus flat. 5pc:
 *  +30% Electro DMG Bonus flat (its real trigger is unconditional here — same "assumed always
 *  up" treatment as Rejuvenating Glow's own 5pc). */
export const VOID_THUNDER_2PC = new Buff({ name: "Void Thunder 2pc", apply: () => addStat(Stat.DmgBonus, 10, Element.Electro) });
export const VOID_THUNDER_5PC = new Buff({ name: "Void Thunder 5pc", apply: () => addStat(Stat.DmgBonus, 30, Element.Electro) });

/* ------------------------------------------------------------------------------- Iuno, 2.6 */

/** Lady of the Sea, Iuno's own mainslot echo. (Her own sonata pick, Sierra Gale, is a
 *  Jinzhou-era set — see echoes_jinzhou.ts — she just reuses it.) */
export const ACTION_MYA = new Action("Echo - Lady of the Sea", {
  cast: Cast.Echo, element: Element.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 300.96,
});
export const MYA = new Mainslot({
  name: "Lady of the Sea",
  action: ACTION_MYA,
  apply: () => { addStat(Stat.DmgBonus, 12, Type1.Liberation); addStat(Stat.DmgBonus, 12, Element.Aero); },
});

/* ----------------------------------------------------------------------------- Galbrena, 2.7 */

/** Corrosaurus, Galbrena's own mainslot echo — flat Fusion/Echo Skill DMG Bonus for whoever
 *  wears it, no trigger. */
export const ACTION_CORROSAURUS = new Action("Echo - Corrosaurus", {
  cast: Cast.Echo, element: Element.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6,
});
export const CORROSAURUS = new Buff({
  name: "Corrosaurus",
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Fusion); addStat(Stat.DmgBonus, 20, Type1.Echo); },
});

/** Flamewing's Shadow 3pc, Galbrena's own sonata: dealing Echo Skill DMG grants +20% Heavy
 *  Attack Crit Rate for 6s; dealing Heavy Attack DMG grants +20% Echo Skill Crit Rate for 6s;
 *  while both are up, +16% Fusion DMG Bonus. */
export const FLAMEWING_SHADOW_HEAVY = new Buff({
  name: "Flamewing's Shadow: Heavy Attack Crit. Rate",
  apply: () => addStat(Stat.CritRate, 20, Type1.Heavy),
  // 6s window, so it still counts on the wearer's own outro (see jinzhou.ts's HERON_HANDOFF)
  convert: () => { if (casting(Cast.Outro)) revoke(FLAMEWING_SHADOW_HEAVY); },
});
export const FLAMEWING_SHADOW_ECHO = new Buff({
  name: "Flamewing's Shadow: Echo Skill Crit. Rate",
  apply: () => addStat(Stat.CritRate, 20, Type1.Echo),
  convert: () => { if (casting(Cast.Outro)) revoke(FLAMEWING_SHADOW_ECHO); },
});
export const FLAMEWING_SHADOW_3PC = new Buff({
  name: "Flamewing's Shadow 3pc",
  update: () => {
    const a = currentAction();
    if (a.type === Type1.Echo) applySelf(FLAMEWING_SHADOW_HEAVY, 1);
    if (a.type === Type1.Heavy) applySelf(FLAMEWING_SHADOW_ECHO, 1);
  },
  apply: () => {
    if (stacksOf(FLAMEWING_SHADOW_HEAVY) && stacksOf(FLAMEWING_SHADOW_ECHO)) addStat(Stat.DmgBonus, 16, Element.Fusion);
  },
});

/* ------------------------------------------------------------------------------- Qiuyuan, 2.7 */

/** Reminiscence: Fenrico, Qiuyuan's own mainslot echo — flat Aero/Heavy DMG Bonus for whoever
 *  wears it, no trigger. */
export const ACTION_FENRICO = new Action("Echo - Reminiscence: Fenrico", {
  cast: Cast.Echo, element: Element.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6,
});
export const FENRICO = new Buff({
  name: "Reminiscence: Fenrico",
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Aero); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/** Law of Harmony 3pc, Qiuyuan's own sonata: casting Echo Skill grants the caster +30% Heavy
 *  Attack DMG Bonus for 4s (short window, lost after the outro action gains stats), and the
 *  whole team +4% Echo Skill DMG Bonus, stacking up to 4 — one stack per distinct named Echo
 *  that's triggered it (every echo cast is assumed unique). */
export const LAW_OF_HARMONY_SELF = new Buff({
  name: "Law of Harmony",
  apply: () => addStat(Stat.DmgBonus, 30, Type1.Heavy),
  convert: () => { if (casting(Cast.Outro)) revoke(LAW_OF_HARMONY_SELF); },
});
export const LAW_OF_HARMONY_TEAM = new Buff({
  name: "Law of Harmony", maxStacks: 4,
  apply: () => { addStat(Stat.DmgBonus, 4 * stacksOfTeam(LAW_OF_HARMONY_TEAM), Type1.Echo); },
});
export const LAW_OF_HARMONY_3PC = new Buff({
  name: "Law of Harmony 3pc",
  update: () => {
    if (casting(Cast.Echo)) { applySelf(LAW_OF_HARMONY_SELF, 1); applyTeam(LAW_OF_HARMONY_TEAM, 1); }
  },
});
