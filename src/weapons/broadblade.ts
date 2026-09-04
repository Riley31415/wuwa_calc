/** Signature Broadblade weapons, ported to the new engine. Every piece works if equipped on any
 *  resonator, not just its own. */
import { WeaponType, Stat, Attribute, Type1, Cast } from "../engine/stats.js";
import { Buff, Weapon } from "../engine/gear.js";
import {
  isType,
  addStat,
  frozenStacks,
  casting,
  currentAction,
  currentTeam,
  addBuff,
  revokeCurrent,
  applyCurrent,
  applyTeam,
  removeStack,
  isHeld,
} from "../engine/context.js";
import { applied } from "../engine/context.js";
import { lostOnSwap } from "../shared/helpers.js";
import { SHIELD, HEALS, inflictedNegativeStatus, inflictedNegativeStatusBy } from "../shared/status.js";

/** Jiyan's sig, R1: Swordsworn. +12% Attribute DMG Bonus flat. Every Intro/Liberation cast
 *  grants +24% Heavy Attack DMG Bonus, up to 2 frozenStacks, 14s. */
export const VERDANT_SUMMIT = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Verdant Summit",
  constantStats: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritDmg, 48.6);
    addStat(Stat.DmgBonus, 12);
  },
  updateBuffs: () => { if (casting(Cast.Intro) || casting(Cast.Liberation)) applyCurrent(SWORDSWORN_STACKS); },
});
export const SWORDSWORN_STACKS = new Buff({
  name: "Verdant Summit: Swordsworn", maxStacks: 2,
  updateBuffs: () => {
    addStat(Stat.DmgBonus, 24 * frozenStacks(), Type1.Heavy);
    if (casting(Cast.Outro)) revokeCurrent(SWORDSWORN_STACKS);
  },
});

/** Jinhsi's sig, R1: Divine Blessing. +12% Attribute DMG Bonus flat. Intro gives Ageless Marking
 *  (+24% Resonance Skill DMG, 12s); Resonance Skill gives Ethereal Endowment (same) —
 *  independently stackable, up to +48%. */
export const AGES_OF_HARVEST = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Ages of Harvest",
  constantStats: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritDmg, 48.6);
    addStat(Stat.DmgBonus, 12);
  },
  updateBuffs: () => {
    if (casting(Cast.Intro)) applyCurrent(AGELESS_MARKING);
    if (casting(Cast.Skill)) applyCurrent(ETHEREAL_ENDOWMENT);
  },
});
export const AGELESS_MARKING = new Buff({
  name: "Ages of Harvest: Ageless Marking",
  applyStats: () => addStat(Stat.DmgBonus, 24, Type1.Skill),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(AGELESS_MARKING); },
});
export const ETHEREAL_ENDOWMENT = new Buff({
  name: "Ages of Harvest: Ethereal Endowment",
  applyStats: () => addStat(Stat.DmgBonus, 24, Type1.Skill),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(ETHEREAL_ENDOWMENT); },
});

/** Augusta's sig, R1. +12% ATK flat. Intro/Skill cast grants +20% Heavy Attack DMG Bonus for
 *  15s; gaining a shield grants a stack (up to 5) of +7.2% Heavy Attack DEF ignore, 7s. */
export const THUNDERFLARE_DOMINION = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Thunderflare Dominion",
  constantStats: () => {
    addStat(Stat.BaseAtk, 675);
    addStat(Stat.CritRate, 12.15);
    addStat(Stat.BonusAtk, 12);
  },
  updateBuffs: () => {
    if (casting(Cast.Intro) || casting(Cast.Skill)) applyCurrent(THUNDERBLAZE_DMG);
    if (applied(SHIELD)) applyCurrent(THUNDERBLAZE_DEF, applied(SHIELD));
  },
});
export const THUNDERBLAZE_DMG = new Buff({
  name: "Thunderflare Dominion: Thunderblaze Eminence (heavy)",
  applyStats: () => addStat(Stat.DmgBonus, 20, Type1.Heavy),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(THUNDERBLAZE_DMG); },
});
export const THUNDERBLAZE_DEF = new Buff({
  name: "Thunderflare Dominion: Thunderblaze Eminence (def ignore)", maxStacks: 5,
  updateBuffs: () => {
    addStat(Stat.DefIgnoreNew, 7.2 * frozenStacks(), Type1.Heavy);
    if (casting(Cast.Outro)) revokeCurrent(THUNDERBLAZE_DEF);
  },
});

/** Lupa's sig, R1: Wildfire Mark. +12% ATK flat. Intro/Liberation grants her own +24% Liberation
 *  DMG Bonus for 6s (re-granted, not stacked, by a fresh cast). While up, the first Heavy Attack
 *  DMG dealt extends it and hands the team +24% Fusion DMG Bonus for 30s, permanent uptime once
 *  granted. "Heavy Attack DMG" is the damage type, not the cast. */
export const WILDFIRE_LIB_DMG = new Buff({
  name: "Wildfire Mark: Blazing Starfire",
  applyStats: () => addStat(Stat.DmgBonus, 24, Type1.Liberation),
  updateBuffs: () => { if (isType(Type1.Heavy)) applyTeam(WILDFIRE_TEAM, 1); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(WILDFIRE_LIB_DMG); },
});
export const WILDFIRE_TEAM = new Buff({
  name: "Wildfire Mark: Blazing Starfire (team)",
  applyStats: () => addStat(Stat.DmgBonus, 24, Attribute.Fusion),
});
export const WILDFIRE_MARK = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Wildfire Mark",
  constantStats: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritDmg, 48.6);
    addStat(Stat.BonusAtk, 12);
  },
  updateBuffs: () => {
    if (casting(Cast.Intro) || casting(Cast.Liberation)) { applyCurrent(WILDFIRE_LIB_DMG, 1); }
  },
});

/** Jingran's sig, R1: Thousandfold Deliverance. Nature's Order stacks on intro/shield, 6x 4%
 *  crit damage, full six sharpens heavy attacks with 12% crit rate. Cradle of Life stacks the
 *  same way, spent by a heavy attack for defence ignore. Both end on switching resonator; Intro
 *  is its own flat +1 rather than also counting the shield it grants, so it doesn't double-stack. */
export const JINGRAN_SIG = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Thousandfold Deliverance",
  constantStats: () => {
    addStat(Stat.BaseAtk, 413);
    addStat(Stat.BonusHp, 72.2);
    addStat(Stat.DmgBonus, 12);
  },
  updateBuffs: () => {
    if (casting(Cast.Intro)) { applyCurrent(NATURES_ORDER); applyCurrent(CRADLE_OF_LIFE); }
    else if (applied(SHIELD)) { applyCurrent(NATURES_ORDER, applied(SHIELD)); applyCurrent(CRADLE_OF_LIFE, applied(SHIELD)); }
  },
});
export const NATURES_ORDER = new Buff({
  name: "Thousandfold Deliverance: Nature's Order", maxStacks: 6,
  // switching resonator ends it immediately, whoever wields the weapon — a genuine "lost on swap"
  updateBuffs: () => lostOnSwap(),
  applyStats: () => {
    addStat(Stat.CritDmg, 4 * frozenStacks());
    if (frozenStacks() >= 6) addStat(Stat.CritRate, 12, Type1.Heavy);
  },
});
/** Spent by a heavy attack: up to two frozenStacks, each piercing 15% defence. "Heavy attack" is the
 *  cast, not the damage type. Also ends on switching resonator. */
export const CRADLE_OF_LIFE = new Buff({
  name: "Thousandfold Deliverance: Cradle of Life", maxStacks: 6,
  updateBuffs: () => {
    lostOnSwap();
    if (!casting(Cast.Heavy)) return;
    const spent = Math.min(frozenStacks(), 2);
    addStat(Stat.DefIgnoreNew, 15 * spent, Type1.Heavy);
    removeStack(CRADLE_OF_LIFE, spent);
  },
});

/** Starfield Calibrator, Mornye's sig, R1: Definite Solution. Base 412.5 ATK and a huge 77.04% ER
 *  — the ER is the point, since her own Liberation converts everything past 100% into crit. +16%
 *  DEF flat (she scales her Liberation and her healing off DEF). Healing anyone hands the whole
 *  team +20% Crit. DMG for 4s; her rotation heals on both her skill and her field, so it holds.
 *  The Resonance Skill's 8 Concerto on a 20s cooldown works like Variation's Ceaseless Aria:
 *  first Skill cast grants it and goes on cooldown, reset by the wielder's Outro. */
export const STARFIELD_CALIBRATOR = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Starfield Calibrator",
  constantStats: () => { addStat(Stat.BaseAtk, 412.5); addStat(Stat.Er, 77.04); addStat(Stat.BonusDef, 16); },
  updateBuffs: () => {
    if (casting(Cast.Skill)) applyCurrent(DEFINITE_SOLUTION_CONCERTO, 1);
    if (applied(HEALS)) applyTeam(DEFINITE_SOLUTION, 1);
  },
});
export const DEFINITE_SOLUTION = new Buff({
  name: "Starfield Calibrator: Definite Solution (team)",
  applyStats: () => { if (currentAction().active) addStat(Stat.CritDmg, 20); },
});
export const DEFINITE_SOLUTION_CONCERTO = new Buff({
  name: "Starfield Calibrator: Definite Solution", maxStacks: 2,
  applyStats: () => {
    if (frozenStacks() === 1 && casting(Cast.Skill)) { applyCurrent(DEFINITE_SOLUTION_CONCERTO, 1); addStat(Stat.AddConcerto, 8); }
    else if (frozenStacks() === 2 && casting(Cast.Outro)) removeStack(DEFINITE_SOLUTION_CONCERTO, 2);
  },
  display: () => `Starfield Calibrator: Definite Solution${frozenStacks() === 1 ? "" : " (cooldown)"}`,
});

/** Kumokiri, Chisa's sig, R1: Thread of Fate. +12% ATK flat. Casting her Intro or inflicting a
 *  Negative Status (Havoc Bane counts) grants a stack of +8% Resonance Liberation DMG Bonus, up to
 *  3, 15s each — lost after the outro like every short self window here. At 3 stacks, each
 *  resonator on the team who inflicts a Negative Status gets +24% All-Attribute DMG Bonus for 15s
 *  — theirs alone, a short self window lost after their own outro; a teammate who never inflicts
 *  one never has it. "Effects of the same name" so it doesn't restack itself. */
export const KUMOKIRI = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Kumokiri",
  constantStats: () => {
    addStat(Stat.BaseAtk, 500);
    addStat(Stat.CritRate, 36);
    addStat(Stat.BonusAtk, 12);
  },
  updateBuffs: () => { if (casting(Cast.Intro) || inflictedNegativeStatus()) applyCurrent(THREAD_OF_FATE_STACKS, 1); },
});
export const THREAD_OF_FATE_STACKS = new Buff({
  name: "Kumokiri: Thread of Fate", maxStacks: 3,
  // watched from updateGlobal so a teammate's own cast is seen — where `currentSlot` is this
  // buff's holder, so the actor is read off the team and the payout put on their slot by name
  updateGlobal() {
    const actor = currentTeam().slot;
    if (frozenStacks() >= 3 && actor.resonator && inflictedNegativeStatusBy(actor)) addBuff(actor.resonator, THREAD_OF_FATE_BONUS, 1);
  },
  applyStats: () => addStat(Stat.DmgBonus, 8 * frozenStacks(), Type1.Liberation),
});

export const THREAD_OF_FATE_BONUS = new Buff({
  name: "Kumokiri: Thread of Fate (team)",
  applyStats: () => addStat(Stat.DmgBonus, 24),
});
