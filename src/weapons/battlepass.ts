/** Pioneer Podcast (battle pass) 4-star weapons: the original five and the Oath of Tide Hunters five.
 *  Each export is the weapon's five refinements, R1 first (gear.ts's own `refinements()`). */
import { WeaponType, Stat, Type, Cast, Tier } from "../engine/stats.js";
import { Buff, Weapon, refinements } from "../engine/gear.js";
import { applyCurrent, isHeld, isType, onCast } from "../engine/context.js";

/* ------------------------------------------------------------------ Pioneer Podcast (original) */

/** Autumntrace: Edge Direction. Dealing Basic or Heavy Attack DMG stacks ATK 5x over, 7s, once every 1s. */
export const AUTUMNTRACE = refinements((r, rank) => {
  const EDGE_DIRECTION = new Buff({
    name: `Autumntrace: Edge Direction${rank}`, maxStacks: 5, duration: 60 * 7,
    stats: [[Stat.BonusAtk, [4, 6.2, 8.4, 10.6, 12.8][r]!]], perStack: true,
  });
  const EDGE_DIRECTION_GAP = new Buff({ duration: 60 });
  return new Weapon({
    id: 21010074,
    weaponType: WeaponType.Broadblade, tier: Tier.Standard, name: `Autumntrace${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.CritRate, 20.25]],
    afterHit: () => {
      if (!(isType(Type.Basic) || isType(Type.Heavy)) || isHeld(EDGE_DIRECTION_GAP)) return;
      applyCurrent(EDGE_DIRECTION, 1);
      applyCurrent(EDGE_DIRECTION_GAP, 1);
    },
  });
});

/** Lumingloss: Pale Gale. A Resonance Skill cast grants Basic and Heavy Attack DMG Bonus for 10s. */
export const LUMINGLOSS = refinements((r, rank) => {
  const PALE_GALE = new Buff({
    name: `Lumingloss: Pale Gale${rank}`, duration: 60 * 10,
    stats: [
      [Stat.DmgBonus, [20, 31, 42, 53, 64][r]!, Type.Basic],
      [Stat.DmgBonus, [20, 31, 42, 53, 64][r]!, Type.Heavy],
    ],
  });
  return new Weapon({
    id: 21020074,
    weaponType: WeaponType.Sword, tier: Tier.Standard, name: `Lumingloss${rank}`,
    stats: [[Stat.BaseAtk, 387.5], [Stat.BonusAtk, 36.45]],
    grants: [{ on: onCast(Cast.Skill), buff: PALE_GALE }],
  });
});

/** Thunderbolt: Unstoppable. Basic or Heavy Attack hits stack Resonance Skill DMG Bonus 3x over, 10s,
 *  once every 1s. */
export const THUNDERBOLT = refinements((r, rank) => {
  const UNSTOPPABLE = new Buff({
    name: `Thunderbolt: Unstoppable${rank}`, maxStacks: 3, duration: 60 * 10,
    stats: [[Stat.DmgBonus, [7, 11, 15, 19, 23][r]!, Type.Skill]], perStack: true,
  });
  const UNSTOPPABLE_GAP = new Buff({ duration: 60 });
  return new Weapon({
    id: 21030074,
    weaponType: WeaponType.Pistols, tier: Tier.Standard, name: `Thunderbolt${rank}`,
    stats: [[Stat.BaseAtk, 387.5], [Stat.BonusAtk, 36.45]],
    afterHit: () => {
      if (!(isType(Type.Basic) || isType(Type.Heavy)) || isHeld(UNSTOPPABLE_GAP)) return;
      applyCurrent(UNSTOPPABLE, 1);
      applyCurrent(UNSTOPPABLE_GAP, 1);
    },
  });
});

/** Stonard: Wallbreaker. A Resonance Skill cast grants the wielder Liberation DMG Bonus for 15s. */
export const STONARD = refinements((r, rank) => {
  const WALLBREAKER = new Buff({
    name: `Stonard: Wallbreaker${rank}`, duration: 60 * 15,
    stats: [[Stat.DmgBonus, [18, 27, 36, 45, 54][r]!, Type.Liberation]],
  });
  return new Weapon({
    id: 21040074,
    weaponType: WeaponType.Gauntlets, tier: Tier.Standard, name: `Stonard${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.CritRate, 20.25]],
    grants: [{ on: onCast(Cast.Skill), buff: WALLBREAKER }],
  });
});

/** Augment: Forgiving Resilience. A Resonance Liberation cast grants the wielder ATK for 15s. */
export const AUGMENT = refinements((r, rank) => {
  const FORGIVING_RESILIENCE = new Buff({
    name: `Augment: Forgiving Resilience${rank}`, duration: 60 * 15,
    stats: [[Stat.BonusAtk, [15, 23.25, 31.5, 39.75, 48][r]!]],
  });
  return new Weapon({
    id: 21050074,
    weaponType: WeaponType.Rectifier, tier: Tier.Standard, name: `Augment${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.CritRate, 20.25]],
    grants: [{ on: onCast(Cast.Liberation), buff: FORGIVING_RESILIENCE }],
  });
});

/* ---------------------------------------------------------------------- Oath of Tide Hunters */

/** Aureate Zenith. A Resonance Liberation cast grants ATK and Heavy Attack DMG Bonus for 15s. */
export const AUREATE_ZENITH = refinements((r, rank) => {
  const TIDE_HUNTERS = new Buff({
    name: `Aureate Zenith: Oath of Tide Hunters${rank}`, duration: 60 * 15,
    stats: [
      [Stat.BonusAtk, [7.2, 11.1, 15.1, 19, 23][r]!],
      [Stat.DmgBonus, [10.8, 16.7, 22.6, 28.6, 34.5][r]!, Type.Heavy],
    ],
  });
  return new Weapon({
    id: 21010104,
    weaponType: WeaponType.Broadblade, tier: Tier.Standard, name: `Aureate Zenith${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.CritDmg, 40.5]],
    grants: [{ on: onCast(Cast.Liberation), buff: TIDE_HUNTERS }],
  });
});

/** Feather Edge. A Resonance Liberation cast grants ATK and Liberation DMG Bonus for 15s. */
export const FEATHER_EDGE = refinements((r, rank) => {
  const TIDE_HUNTERS = new Buff({
    name: `Feather Edge: Oath of Tide Hunters${rank}`, duration: 60 * 15,
    stats: [
      [Stat.BonusAtk, [7.2, 11.1, 15.1, 19, 23][r]!],
      [Stat.DmgBonus, [10.8, 16.7, 22.6, 28.6, 34.5][r]!, Type.Liberation],
    ],
  });
  return new Weapon({
    id: 21020104,
    weaponType: WeaponType.Sword, tier: Tier.Standard, name: `Feather Edge${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.CritRate, 20.25]],
    grants: [{ on: onCast(Cast.Liberation), buff: TIDE_HUNTERS }],
  });
});

/** Solar Flame. Dealing Basic or Heavy Attack DMG stacks ATK and Heavy Attack DMG Bonus 4x over, 7s,
 *  once every 1s. */
export const SOLAR_FLAME = refinements((r, rank) => {
  const TIDE_HUNTERS = new Buff({
    name: `Solar Flame: Oath of Tide Hunters${rank}`, maxStacks: 4, duration: 60 * 7,
    stats: [
      [Stat.BonusAtk, [2.2, 3.4, 4.7, 5.9, 7.2][r]!],
      [Stat.DmgBonus, [2.2, 3.4, 4.7, 5.9, 7.2][r]!, Type.Heavy],
    ],
    perStack: true,
  });
  const TIDE_HUNTERS_GAP = new Buff({ duration: 60 });
  return new Weapon({
    id: 21030104,
    weaponType: WeaponType.Pistols, tier: Tier.Standard, name: `Solar Flame${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.CritRate, 20.25]],
    afterHit: () => {
      if (!(isType(Type.Basic) || isType(Type.Heavy)) || isHeld(TIDE_HUNTERS_GAP)) return;
      applyCurrent(TIDE_HUNTERS, 1);
      applyCurrent(TIDE_HUNTERS_GAP, 1);
    },
  });
});

/** Aether Strike. A Resonance Liberation cast grants ATK and Liberation DMG Bonus for 15s. */
export const AETHER_STRIKE = refinements((r, rank) => {
  const TIDE_HUNTERS = new Buff({
    name: `Aether Strike: Oath of Tide Hunters${rank}`, duration: 60 * 15,
    stats: [
      [Stat.BonusAtk, [7.2, 11.1, 15.1, 19, 23][r]!],
      [Stat.DmgBonus, [10.8, 16.7, 22.6, 28.6, 34.5][r]!, Type.Liberation],
    ],
  });
  return new Weapon({
    id: 21040104,
    weaponType: WeaponType.Gauntlets, tier: Tier.Standard, name: `Aether Strike${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.CritDmg, 40.5]],
    grants: [{ on: onCast(Cast.Liberation), buff: TIDE_HUNTERS }],
  });
});

/** Radiant Dawn. A Resonance Skill cast grants ATK and Basic Attack DMG Bonus for 10s. */
export const RADIANT_DAWN = refinements((r, rank) => {
  const TIDE_HUNTERS = new Buff({
    name: `Radiant Dawn: Oath of Tide Hunters${rank}`, duration: 60 * 10,
    stats: [
      [Stat.BonusAtk, [9, 13.9, 18.9, 23.8, 28.8][r]!],
      [Stat.DmgBonus, [9, 13.9, 18.9, 23.8, 28.8][r]!, Type.Basic],
    ],
  });
  return new Weapon({
    id: 21050104,
    weaponType: WeaponType.Rectifier, tier: Tier.Standard, name: `Radiant Dawn${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.CritDmg, 40.5]],
    grants: [{ on: onCast(Cast.Skill), buff: TIDE_HUNTERS }],
  });
});
