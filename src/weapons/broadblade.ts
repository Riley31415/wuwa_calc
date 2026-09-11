/** Signature Broadblade weapons. Every piece works if equipped on any resonator, not just its
 *  own. Each export is the weapon's five refinements, R1 first (gear.ts's own `refinements()`);
 *  a number that grows with rank is written as its five values. */
import { WeaponType, Stat, Attribute, Type1, Cast, LifeTime, BuffTarget } from "../engine/stats.js";
import { Buff, Weapon, refinements } from "../engine/gear.js";
import {
  addStat, frozenStacks, casting, currentTeam, addBuff, applyCurrent, removeStack, revokeCurrent, applied,
  onCast, onType, onApplied, either, isActive,
} from "../engine/context.js";
import { SHIELD, HEALS, inflictedNegativeStatus, inflictedNegativeStatusBy } from "../shared/status.js";

/** Jiyan's sig: Swordsworn. +12% Attribute DMG Bonus flat. Every Intro/Liberation cast
 *  grants +24% Heavy Attack DMG Bonus, up to 2 stacks, 14s. */
export const VERDANT_SUMMIT = refinements((r, rank) => {
  const SWORDSWORN_STACKS = new Buff({
    name: `Verdant Summit: Swordsworn${rank}`, maxStacks: 2,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Type1.Heavy]], perStack: true, early: true, until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, name: `Verdant Summit${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritDmg, 48.6], [Stat.DmgBonus, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onCast(Cast.Intro, Cast.Liberation), buff: SWORDSWORN_STACKS }],
  });
});

/** Jinhsi's sig: Divine Blessing. +12% Attribute DMG Bonus flat. Intro gives Ageless Marking
 *  (+24% Resonance Skill DMG, 12s); Resonance Skill gives Ethereal Endowment (same) —
 *  independently stackable, up to +48%. */
export const AGES_OF_HARVEST = refinements((r, rank) => {
  const AGELESS_MARKING = new Buff({
    name: `Ages of Harvest: Ageless Marking${rank}`,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Type1.Skill]], until: LifeTime.Outro,
  });
  const ETHEREAL_ENDOWMENT = new Buff({
    name: `Ages of Harvest: Ethereal Endowment${rank}`,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Type1.Skill]], until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, name: `Ages of Harvest${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritDmg, 48.6], [Stat.DmgBonus, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: onCast(Cast.Intro), buff: AGELESS_MARKING },
      { on: onCast(Cast.Skill), buff: ETHEREAL_ENDOWMENT },
    ],
  });
});

/** Augusta's sig. +12% ATK flat. Intro/Skill cast grants +20% Heavy Attack DMG Bonus for
 *  15s; gaining a shield grants a stack (up to 5) of +7.2% Heavy Attack DEF ignore, 7s. */
export const THUNDERFLARE_DOMINION = refinements((r, rank) => {
  const THUNDERBLAZE_DMG = new Buff({
    name: `Thunderflare Dominion: Thunderblaze Eminence${rank} (intro/skill)`,
    stats: [[Stat.DmgBonus, [20, 25, 30, 35, 40][r]!, Type1.Heavy]], until: LifeTime.Outro,
  });
  const THUNDERBLAZE_DEF = new Buff({
    name: `Thunderflare Dominion: Thunderblaze Eminence${rank} (shield)`, maxStacks: 5,
    stats: [[Stat.DefIgnoreNew, [7.2, 8.4, 9.6, 10.8, 12][r]!, Type1.Heavy]], perStack: true, early: true, until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, name: `Thunderflare Dominion${rank}`,
    stats: [[Stat.BaseAtk, 675], [Stat.CritRate, 12.15], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: onCast(Cast.Intro, Cast.Skill), buff: THUNDERBLAZE_DMG },
      { on: onApplied(SHIELD), buff: THUNDERBLAZE_DEF, stacks: () => applied(SHIELD) },
    ],
  });
});

/** Lupa's sig: Wildfire Mark. +12% ATK flat. Intro/Liberation grants her own +24% Liberation
 *  DMG Bonus for 6s (re-granted, not stacked, by a fresh cast). While up, the first Heavy Attack
 *  DMG dealt extends it and hands the team +24% Fusion DMG Bonus for 30s, permanent uptime once
 *  granted. "Heavy Attack DMG" is the damage type, not the cast. */
export const WILDFIRE_MARK = refinements((r, rank) => {
  const WILDFIRE_TEAM = new Buff({
    name: `Wildfire Mark: Blazing Starfire${rank} (team)`,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Attribute.Fusion]],
  });
  const WILDFIRE_LIB_DMG = new Buff({
    name: `Wildfire Mark: Blazing Starfire${rank}`,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Type1.Liberation]], until: LifeTime.Outro,
    grants: [{ on: onType(Type1.Heavy), buff: WILDFIRE_TEAM, to: BuffTarget.Team }],
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, name: `Wildfire Mark${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritDmg, 48.6], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onCast(Cast.Intro, Cast.Liberation), buff: WILDFIRE_LIB_DMG }],
  });
});

/** Jingran's sig: Thousandfold Deliverance. Nature's Order stacks on intro/shield, 6x 4%
 *  crit damage, full six sharpens heavy attacks with 12% crit rate. Cradle of Life stacks the
 *  same way, spent by a heavy attack for defence ignore. Both end on switching resonator; Intro
 *  is its own flat +1 rather than also counting the shield it grants, so it doesn't double-stack. */
export const JINGRAN_SIG = refinements((r, rank) => {
  const NATURES_ORDER = new Buff({
    name: `Thousandfold Deliverance: Nature's Order${rank}`, maxStacks: 6, until: LifeTime.Swap,
    stats: [[Stat.CritDmg, [4, 5, 6, 7, 8][r]!]], perStack: true,
    applyStats: () => { if (frozenStacks() >= 6) addStat(Stat.CritRate, [12, 15, 18, 21, 24][r]!, Type1.Heavy); },
  });
  /** Spent by a heavy attack: up to two stacks, each piercing 15% defence. "Heavy attack" is the
   *  cast, not the damage type. Also ends on switching resonator. */
  const CRADLE_OF_LIFE: Buff = new Buff({
    name: `Thousandfold Deliverance: Cradle of Life${rank}`, maxStacks: 6, until: LifeTime.Swap,
    updateBuffs: () => {
      if (!casting(Cast.Heavy)) return;
      const spent = Math.min(frozenStacks(), 2);
      addStat(Stat.DefIgnoreNew, [15, 17.5, 20, 22.5, 25][r]! * spent, Type1.Heavy);
      removeStack(CRADLE_OF_LIFE, spent);
    },
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, name: `Thousandfold Deliverance${rank}`,
    stats: [[Stat.BaseAtk, 413], [Stat.BonusHp, 72.2], [Stat.DmgBonus, [12, 15, 18, 21, 24][r]!]],
    updateBuffs: () => {
      if (casting(Cast.Intro)) { applyCurrent(NATURES_ORDER); applyCurrent(CRADLE_OF_LIFE); }
      else if (applied(SHIELD)) { applyCurrent(NATURES_ORDER, applied(SHIELD)); applyCurrent(CRADLE_OF_LIFE, applied(SHIELD)); }
    },
  });
});

/** Starfield Calibrator, Mornye's sig: Definite Solution. Base 412.5 ATK and a huge 77.04% ER
 *  — the ER is the point, since her own Liberation converts everything past 100% into crit. +16%
 *  DEF flat (she scales her Liberation and her healing off DEF). Healing anyone hands the whole
 *  team +20% Crit. DMG for 4s; her rotation heals on both her skill and her field, so it holds.
 *  The Resonance Skill's 8 Concerto on a 20s cooldown works like Variation's Ceaseless Aria: a
 *  charge held from the start of the fight, spent by the Skill, handed back by the wielder's Outro. */
export const STARFIELD_CALIBRATOR = refinements((r, rank) => {
  const DEFINITE_SOLUTION_TEAM = new Buff({
    name: `Starfield Calibrator: Definite Solution${rank} (team)`,
    stats: [[Stat.CritDmg, [20, 25, 30, 35, 40][r]!]], when: isActive,
  });
  /** The charge the Skill spends: held from the moment the weapon is equipped, gone the cast it
   *  pays for, and back on the wielder's own Outro. */
  const DEFINITE_SOLUTION: Buff = new Buff({
    name: `Starfield Calibrator: Definite Solution${rank}`,
    applyStats: () => {
      if (!casting(Cast.Skill)) return;
      addStat(Stat.AddConcerto, [8, 10, 12, 14, 16][r]!);
      revokeCurrent(DEFINITE_SOLUTION);
    },
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, name: `Starfield Calibrator${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.Er, 77.04], [Stat.BonusDef, [16, 20, 24, 28, 32][r]!]],
    combatStart: () => applyCurrent(DEFINITE_SOLUTION, 1),
    grants: [
      { on: onApplied(HEALS), buff: DEFINITE_SOLUTION_TEAM, to: BuffTarget.Team },
      { on: onCast(Cast.Outro), buff: DEFINITE_SOLUTION },
    ],
  });
});

/** Kumokiri, Chisa's sig: Thread of Fate. +12% ATK flat. Casting her Intro or inflicting a
 *  Negative Status (Havoc Bane counts) grants a stack of +8% Resonance Liberation DMG Bonus, up to
 *  3, 15s each — lost after the outro like every short self window here. At 3 stacks, each
 *  resonator on the team who inflicts a Negative Status gets +24% All-Attribute DMG Bonus for 15s
 *  — theirs alone, a short self window lost after their own outro; a teammate who never inflicts
 *  one never has it. "Effects of the same name" so it doesn't restack itself. */
export const KUMOKIRI = refinements((r, rank) => {
  const THREAD_OF_FATE_BONUS = new Buff({
    name: `Kumokiri: Thread of Fate${rank} (team)`,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!]],
  });
  const THREAD_OF_FATE_STACKS = new Buff({
    name: `Kumokiri: Thread of Fate${rank}`, maxStacks: 3,
    stats: [[Stat.DmgBonus, [8, 10, 12, 14, 16][r]!, Type1.Liberation]], perStack: true,
    // watched from updateGlobal so a teammate's own cast is seen — where `currentSlot` is this
    // buff's holder, so the actor is read off the team and the payout put on their slot by name
    updateGlobal() {
      const actor = currentTeam().slot;
      if (frozenStacks() >= 3 && actor.resonator && inflictedNegativeStatusBy(actor)) addBuff(actor.resonator, THREAD_OF_FATE_BONUS, 1);
    },
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, name: `Kumokiri${rank}`,
    stats: [[Stat.BaseAtk, 500], [Stat.CritRate, 36], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: either(onCast(Cast.Intro), inflictedNegativeStatus), buff: THREAD_OF_FATE_STACKS }],
  });
});
