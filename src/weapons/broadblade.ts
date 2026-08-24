/** Signature Broadblade weapons, ported to the new engine. Every piece works if equipped on any
 *  resonator, not just its own. */
import {
  Buff, Weapon, WeaponType, Stat, Attribute, Type1, Cast,
  addStat, stacks, casting, currentAction, revoke, applySelf, applyTeam, removeStack, lostOnSwap, isHeld,
} from "../kit.js";

/** Jiyan's sig, R1: Swordsworn. +12% Attribute DMG Bonus flat. Every Intro/Liberation cast
 *  grants +24% Heavy Attack DMG Bonus, up to 2 stacks, 14s. */
export const VERDANT_SUMMIT = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Verdant Summit",
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritDmg, 48.6);
    addStat(Stat.DmgBonus, 12);
  },
  update: () => { if (casting(Cast.Intro) || casting(Cast.Liberation)) applySelf(SWORDSWORN_STACKS); },
});
export const SWORDSWORN_STACKS = new Buff({
  name: "Verdant Summit: Swordsworn", maxStacks: 2,
  update: () => {
    addStat(Stat.DmgBonus, 24 * stacks(), Type1.Heavy);
    if (casting(Cast.Outro)) revoke(SWORDSWORN_STACKS);
  },
});

/** Jinhsi's sig, R1: Divine Blessing. +12% Attribute DMG Bonus flat. Intro gives Ageless Marking
 *  (+24% Resonance Skill DMG, 12s); Resonance Skill gives Ethereal Endowment (same) —
 *  independently stackable, up to +48%. */
export const AGES_OF_HARVEST = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Ages of Harvest",
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritDmg, 48.6);
    addStat(Stat.DmgBonus, 12);
  },
  update: () => {
    if (casting(Cast.Intro)) applySelf(AGELESS_MARKING);
    if (casting(Cast.Skill)) applySelf(ETHEREAL_ENDOWMENT);
  },
});
export const AGELESS_MARKING = new Buff({
  name: "Ages of Harvest: Ageless Marking",
  apply: () => addStat(Stat.DmgBonus, 24, Type1.Skill),
  convert: () => { if (casting(Cast.Outro)) revoke(AGELESS_MARKING); },
});
export const ETHEREAL_ENDOWMENT = new Buff({
  name: "Ages of Harvest: Ethereal Endowment",
  apply: () => addStat(Stat.DmgBonus, 24, Type1.Skill),
  convert: () => { if (casting(Cast.Outro)) revoke(ETHEREAL_ENDOWMENT); },
});

/** Augusta's sig, R1. +12% ATK flat. Intro/Skill cast grants +20% Heavy Attack DMG Bonus for
 *  15s; gaining a shield grants a stack (up to 5) of +7.2% Heavy Attack DEF ignore, 7s. */
export const THUNDERFLARE_DOMINION = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Thunderflare Dominion",
  apply: () => {
    addStat(Stat.BaseAtk, 675);
    addStat(Stat.CritRate, 12.15);
    addStat(Stat.BonusAtk, 12);
  },
  update: () => {
    const a = currentAction();
    if (casting(Cast.Intro) || casting(Cast.Skill)) applySelf(THUNDERBLAZE_DMG);
    if (a.shields) applySelf(THUNDERBLAZE_DEF, a.shields);
  },
});
export const THUNDERBLAZE_DMG = new Buff({
  name: "Thunderflare Dominion: Thunderblaze Eminence (heavy)",
  apply: () => addStat(Stat.DmgBonus, 20, Type1.Heavy),
  convert: () => { if (casting(Cast.Outro)) revoke(THUNDERBLAZE_DMG); },
});
export const THUNDERBLAZE_DEF = new Buff({
  name: "Thunderflare Dominion: Thunderblaze Eminence (def ignore)", maxStacks: 5,
  update: () => {
    addStat(Stat.DefIgnoreNew, 7.2 * stacks(), Type1.Heavy);
    if (casting(Cast.Outro)) revoke(THUNDERBLAZE_DEF);
  },
});

/** Lupa's sig, R1: Wildfire Mark. +12% ATK flat. Intro/Liberation grants her own +24% Liberation
 *  DMG Bonus for 6s (re-granted, not stacked, by a fresh cast). While up, the first Heavy Attack
 *  DMG dealt extends it and hands the team +24% Fusion DMG Bonus for 30s, permanent uptime once
 *  granted. "Heavy Attack DMG" is the damage type, not the cast. */
export const WILDFIRE_LIB_DMG = new Buff({
  name: "Wildfire Mark: Blazing Starfire",
  apply: () => addStat(Stat.DmgBonus, 24, Type1.Liberation),
  update: () => { if (currentAction().type === Type1.Heavy) applyTeam(WILDFIRE_TEAM, 1); },
  convert: () => { if (casting(Cast.Outro)) revoke(WILDFIRE_LIB_DMG); },
});
export const WILDFIRE_TEAM = new Buff({
  name: "Wildfire Mark: Blazing Starfire (team)",
  apply: () => addStat(Stat.DmgBonus, 24, Attribute.Fusion),
});
export const WILDFIRE_MARK = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Wildfire Mark",
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritDmg, 48.6);
    addStat(Stat.BonusAtk, 12);
  },
  update: () => {
    if (casting(Cast.Intro) || casting(Cast.Liberation)) { applySelf(WILDFIRE_LIB_DMG, 1); }
  },
});

/** Jingran's sig, R1: Thousandfold Deliverance. Nature's Order stacks on intro/shield, 6x 4%
 *  crit damage, full six sharpens heavy attacks with 12% crit rate. Cradle of Life stacks the
 *  same way, spent by a heavy attack for defence ignore. Both end on switching resonator; Intro
 *  is its own flat +1 rather than also counting its own declared shield, so it doesn't double-stack. */
export const JINGRAN_SIG = new Weapon({
  weaponType: WeaponType.Broadblade,
  name: "Thousandfold Deliverance",
  apply: () => {
    addStat(Stat.BaseAtk, 413);
    addStat(Stat.BonusHp, 72.2);
    addStat(Stat.DmgBonus, 12);
  },
  update: () => {
    const a = currentAction();
    if (casting(Cast.Intro)) { applySelf(NATURES_ORDER); applySelf(CRADLE_OF_LIFE); }
    else if (a.shields) { applySelf(NATURES_ORDER, a.shields); applySelf(CRADLE_OF_LIFE, a.shields); }
  },
});
export const NATURES_ORDER = new Buff({
  name: "Thousandfold Deliverance: Nature's Order", maxStacks: 6,
  // switching resonator ends it immediately, whoever wields the weapon — a genuine "lost on swap"
  update: () => lostOnSwap(),
  apply: () => {
    addStat(Stat.CritDmg, 4 * stacks());
    if (stacks() >= 6) addStat(Stat.CritRate, 12, Type1.Heavy);
  },
});
/** Spent by a heavy attack: up to two stacks, each piercing 15% defence. "Heavy attack" is the
 *  cast, not the damage type. Also ends on switching resonator. */
export const CRADLE_OF_LIFE = new Buff({
  name: "Thousandfold Deliverance: Cradle of Life", maxStacks: 6,
  update: () => {
    lostOnSwap();
    if (!casting(Cast.Heavy)) return;
    const spent = Math.min(stacks(), 2);
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
  apply: () => { addStat(Stat.BaseAtk, 412.5); addStat(Stat.Er, 77.04); addStat(Stat.BonusDef, 16); },
  update: () => {
    if (casting(Cast.Skill)) applySelf(DEFINITE_SOLUTION_CONCERTO, 1);
    if (currentAction().heals) applyTeam(DEFINITE_SOLUTION, 1);
  },
});
export const DEFINITE_SOLUTION = new Buff({
  name: "Starfield Calibrator: Definite Solution (team)",
  apply: () => { if (currentAction().active) addStat(Stat.CritDmg, 20); },
});
export const DEFINITE_SOLUTION_CONCERTO = new Buff({
  name: "Starfield Calibrator: Definite Solution", maxStacks: 2,
  apply: () => {
    if (stacks() === 1 && casting(Cast.Skill)) { applySelf(DEFINITE_SOLUTION_CONCERTO, 1); addStat(Stat.AddConcerto, 8); }
    else if (stacks() === 2 && casting(Cast.Outro)) removeStack(DEFINITE_SOLUTION_CONCERTO, 2);
  },
  display: () => `Starfield Calibrator: Definite Solution${stacks() === 1 ? "" : " (cooldown)"}`,
});
