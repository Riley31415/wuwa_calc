/** Signature Broadblade weapons. Every piece works if equipped on any resonator, not just its
 *  own. Each export is the weapon's five refinements, R1 first (gear.ts's own `refinements()`);
 *  a number that grows with rank is written as its five values. */
import { WeaponType, Stat, Attribute, Type, Cast, BuffTarget } from "../engine/stats.js";
import { Buff, Weapon, refinements } from "../engine/gear.js";
import {
  addStat, frozenStacks, casting, currentTeam, currentMember, addBuff, applyCurrent, removeStack, revokeCurrent, applied,
  onCast, onApplied, isActive, isType, setStacksSelf,
  applyTeam, extendCurrent, isHeld,
  addGain,
} from "../engine/context.js";
import { SHIELD, HEALS, inflictedNegativeStatusBy } from "../shared/status.js";

/** Jiyan's sig: Swordsworn. +12% Attribute DMG Bonus flat. Every Intro/Liberation cast
 *  grants +24% Heavy Attack DMG Bonus, up to 2 stacks, 14s. */
export const VERDANT_SUMMIT = refinements((r, rank) => {
  const SWORDSWORN_STACKS = new Buff({
    name: `Verdant Summit: Swordsworn${rank}`, maxStacks: 2, duration: 60 * 14,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Type.Heavy]], perStack: true,
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
    duration: 60 * 12,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Type.Skill]],
  });
  const ETHEREAL_ENDOWMENT = new Buff({
    name: `Ages of Harvest: Ethereal Endowment${rank}`,
    duration: 60 * 12,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Type.Skill]],
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, name: `Ages of Harvest${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.DmgBonus, [12, 15, 18, 21, 24][r]!]],
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
    duration: 60 * 15,
    stats: [[Stat.DmgBonus, [20, 25, 30, 35, 40][r]!, Type.Heavy]],
  });
  const THUNDERBLAZE_DEF = new Buff({
    name: `Thunderflare Dominion: Thunderblaze Eminence${rank} (shield)`, maxStacks: 5, duration: 60 * 7,
    stats: [[Stat.DefIgnoreNew, [7.2, 8.4, 9.6, 10.8, 12][r]!, Type.Heavy]], perStack: true,
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
 *  DMG Bonus for 6s. Heavy Attack DMG (the type, not the cast) extends it 4s, once a grant, and
 *  that extension hands the team +24% Fusion DMG Bonus for 30s. */
export const WILDFIRE_MARK = refinements((r, rank) => {
  const WILDFIRE_TEAM = new Buff({
    name: `Wildfire Mark: Blazing Starfire${rank} (team)`,
    duration: 60 * 30,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Attribute.Fusion]],
  });
  const WILDFIRE_EXTENDED = new Buff({ name: `Wildfire Mark: Blazing Starfire${rank} (extended)`, hidden: true });
  const WILDFIRE_LIB_DMG: Buff = new Buff({
    name: `Wildfire Mark: Blazing Starfire${rank}`,
    duration: 60 * 6,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Type.Liberation]],
    updateDebuffs: () => {
      if (!isType(Type.Heavy) || isHeld(WILDFIRE_EXTENDED)) return;
      extendCurrent(WILDFIRE_LIB_DMG, 60 * 4);
      applyCurrent(WILDFIRE_EXTENDED, 1);
      applyTeam(WILDFIRE_TEAM, 1);
    },
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, name: `Wildfire Mark${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritDmg, 48.6], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onCast(Cast.Intro, Cast.Liberation), buff: WILDFIRE_LIB_DMG }],
    // a fresh grant can be extended again
    updateBuffs: () => { if (casting(Cast.Intro) || casting(Cast.Liberation)) revokeCurrent(WILDFIRE_EXTENDED); },
  });
});

/** Jingran's sig: Thousandfold Deliverance. Nature's Order stacks on intro/shield, 6x 4%
 *  crit damage, full six sharpens heavy attacks with 12% crit rate. Cradle of Life stacks the
 *  same way, spent by a heavy attack for defence ignore. Both end on switching resonator, and both
 *  are two triggers rather than one — his Intro shields as well, so that cast pays +2. */
export const JINGRAN_SIG = refinements((r, rank) => {
  const NATURES_ORDER = new Buff({
    name: `Thousandfold Deliverance: Nature's Order${rank}`, maxStacks: 6, duration: 60 * 7, lostOnSwap: true,
    stats: [[Stat.CritDmg, [4, 5, 6, 7, 8][r]!]], perStack: true,
    applyStats: () => { if (frozenStacks() >= 6) addStat(Stat.CritRate, [12, 15, 18, 21, 24][r]!, Type.Heavy); },
  });
  /** What a heavy's spend actually pays out, held at the stacks it spent. The press and the
   *  summons it queues — Jingran's Chimei Wangliang, Fire of Life's own and the Parade's at S6 —
   *  are separate actions, so one buff covering the window is what gets them the same figure; a
   *  stat paid on the press alone stopped at the press. It runs its 2s. */
  const CRADLE_SPENT: Buff = new Buff({
    name: `Thousandfold Deliverance: Cradle of Life${rank} (spent)`, maxStacks: 2, duration: 60 * 2,
    stats: [[Stat.DefIgnoreNew, [15, 17.5, 20, 22.5, 25][r]!, Type.Heavy]], perStack: true,
  });
  /** Spent by a heavy attack: up to two stacks, each piercing 15% defence. "Heavy attack" is the
   *  cast, not the damage type. Also ends on switching resonator. */
  const CRADLE_OF_LIFE: Buff = new Buff({
    name: `Thousandfold Deliverance: Cradle of Life${rank}`, maxStacks: 6, duration: 60 * 7, lostOnSwap: true,
    updateBuffs: () => {
      if (!casting(Cast.Heavy)) return;
      const spent = Math.min(frozenStacks(), 2);
      if (!spent) return;
      removeStack(CRADLE_OF_LIFE, spent);
      // applied mid-phase, so it misses this action's own updateBuffs (and its revoke above) but
      // still pays into the press that put it up — which is what makes one buff cover both
      setStacksSelf(CRADLE_SPENT, spent);
    },
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, name: `Thousandfold Deliverance${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.BonusHp, 72.225], [Stat.DmgBonus, [12, 15, 18, 21, 24][r]!]],
    // two separate triggers, so his Intro — which also shields — pays both and stacks twice
    grants: [
      { on: onCast(Cast.Intro), buff: NATURES_ORDER },
      { on: onCast(Cast.Intro), buff: CRADLE_OF_LIFE },
      { on: onApplied(SHIELD), buff: NATURES_ORDER, stacks: () => applied(SHIELD) },
      { on: onApplied(SHIELD), buff: CRADLE_OF_LIFE, stacks: () => applied(SHIELD) },
    ],
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
    duration: 60 * 4,
    stats: [[Stat.CritDmg, [20, 25, 30, 35, 40][r]!]], when: isActive,
  });
  /** The charge the Skill spends: held from the moment the weapon is equipped, gone the cast it
   *  pays for, and back on the wielder's own Outro. */
  const DEFINITE_SOLUTION: Buff = new Buff({
    name: `Starfield Calibrator: Definite Solution${rank}`,
    updateBuffs: () => {
      if (!casting(Cast.Skill)) return;
      addGain({ concerto: [800, 1000, 1200, 1400, 1600][r]! });
      revokeCurrent(DEFINITE_SOLUTION);
    },
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, name: `Starfield Calibrator${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.ER, 77.04], [Stat.BonusDef, [16, 20, 24, 28, 32][r]!]],
    combatStart: () => applyCurrent(DEFINITE_SOLUTION, 1),
    grants: [
      { on: onApplied(HEALS), buff: DEFINITE_SOLUTION_TEAM, to: BuffTarget.Team },
      { on: onCast(Cast.Outro), buff: DEFINITE_SOLUTION },
    ],
  });
});

/** Kumokiri, Chisa's sig: Thread of Fate. +12% ATK flat. Casting her Intro or inflicting a
 *  Negative Status (Havoc Bane counts) grants a stack of +8% Resonance Liberation DMG Bonus, up to
 *  3, 15s each. At 3 stacks, each
 *  resonator on the team who inflicts a Negative Status gets +24% All-Attribute DMG Bonus for 15s
 *  — theirs alone, a short self window lost after their own outro; a teammate who never inflicts
 *  one never has it. "Effects of the same name" so it doesn't restack itself. */
export const KUMOKIRI = refinements((r, rank) => {
  const THREAD_OF_FATE_BONUS = new Buff({
    name: `Kumokiri: Thread of Fate${rank} (team)`,
    duration: 60 * 15,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!]],
  });
  const THREAD_OF_FATE_STACKS = new Buff({
    name: `Kumokiri: Thread of Fate${rank}`, maxStacks: 3, duration: 60 * 15,
    stats: [[Stat.DmgBonus, [8, 10, 12, 14, 16][r]!, Type.Liberation]], perStack: true,
    // on every hit, to each member credited with an inflict on it — whoever's hit it was
    hitGlobal() {
      if (frozenStacks() < 3) return;
      for (const m of currentTeam().slots) if (m.resonator && inflictedNegativeStatusBy(m)) addBuff(m.resonator, THREAD_OF_FATE_BONUS, 1);
    },
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, name: `Kumokiri${rank}`,
    stats: [[Stat.BaseAtk, 500], [Stat.CritRate, 36], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onCast(Cast.Intro), buff: THREAD_OF_FATE_STACKS }],
    // any hit her own inflict is credited on — her Snare's Bane off a teammate's swing included
    hitGlobal: () => { if (inflictedNegativeStatusBy(currentMember())) applyCurrent(THREAD_OF_FATE_STACKS, 1); },
  });
});
