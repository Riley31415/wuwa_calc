/** Signature Gauntlets weapons. Each export is the weapon's five refinements, R1 first (gear.ts's
 *  own `refinements()`); a number that grows with rank is written as its five values. */
import { WeaponType, Stat, Attribute, Type1, Cast, LifeTime } from "../engine/stats.js";
import { Buff, Weapon, refinements } from "../engine/gear.js";
import { applyCurrent, setStacksSelf, casting, applied, onCast, onType, onInflict } from "../engine/context.js";
import { SHIELD } from "../shared/status.js";
import { TUNE_STRAIN_SHIFTING } from "../shared/tunebreak.js";

/** Verity's Handle, Xiangli Yao's sig: Ad Veritatem. +12% Attribute DMG Bonus flat.
 *  Liberation grants +48% Liberation DMG Bonus for 8s, extended by each Skill cast while up —
 *  approximated as a flat re-grant per Skill cast rather than a real countdown. Not owned by any
 *  resonator implemented yet — exported standalone. */
export const VERITYS_HANDLE = refinements((r, rank) => {
  const AD_VERITATEM = new Buff({
    name: `Verity's Handle: Ad Veritatem${rank}`,
    stats: [[Stat.DmgBonus, [48, 60, 72, 84, 96][r]!, Type1.Liberation]], until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Gauntlets, name: `Verity's Handle${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritDmg, 48.6], [Stat.DmgBonus, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onCast(Cast.Liberation), buff: AD_VERITATEM }],
  });
});

/** Tragicomedy, Roccia's sig: Fool's Warble. +12% ATK flat. Basic Attack or Intro grants
 *  +48% Heavy Attack DMG Bonus for 3s. "Basic Attack" is the cast, not the damage type. */
export const TRAGICOMEDY = refinements((r, rank) => {
  const FOOLS_WARBLE = new Buff({
    name: `Tragicomedy: Fool's Warble${rank}`,
    stats: [[Stat.DmgBonus, [48, 60, 72, 84, 96][r]!, Type1.Heavy]], until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Gauntlets, name: `Tragicomedy${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onCast(Cast.Basic, Cast.Intro), buff: FOOLS_WARBLE }],
  });
});

/** Solsworn Ciphers, Sigrika's sig: Sunward. +12% ATK flat. Intro/Echo Skill grants +32%
 *  Echo Skill DMG Amp for 15s; dealing Echo Skill DMG makes Aero DMG ignore 10% DEF for 6s. */
export const SOLSWORN_CIPHERS = refinements((r, rank) => {
  const SUNWARD_AMP = new Buff({
    name: `Solsworn Ciphers: Sunward (echo amp)${rank}`,
    stats: [[Stat.Amp, [32, 40, 48, 56, 64][r]!, Type1.Echo]], until: LifeTime.Outro,
  });
  const SUNWARD_IGNORE = new Buff({
    name: `Solsworn Ciphers: Sunward (def ignore)${rank}`,
    stats: [[Stat.DefIgnoreNew, [10, 12.5, 15, 17.5, 20][r]!, Attribute.Aero]], until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Gauntlets, name: `Solsworn Ciphers${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritDmg, 48.6], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: onCast(Cast.Intro, Cast.Echo), buff: SUNWARD_AMP },
      { on: onType(Type1.Echo), buff: SUNWARD_IGNORE },
    ],
  });
});

/** Moongazer's Sigil, Iuno's sig. Liberation damage gets a flat bonus and, per shield stack,
 *  pierces defence — her own Intro takes the stack straight to the ceiling, every other
 *  shielding cast adds one per shield it declares. */
export const IUNO_SIG = refinements((r, rank) => {
  const MOONGAZER_STACKS = new Buff({
    name: `Moongazer's Sigil: Plenilune Radiance${rank}`, maxStacks: 5,
    // scoped to liberation damage — most of Lunar Cycle qualifies, intro/outro/echo don't
    stats: [[Stat.DefIgnoreNew, [7.2, 8.4, 9.6, 10.8, 12][r]!, Type1.Liberation]], perStack: true,
  });
  return new Weapon({
    weaponType: WeaponType.Gauntlets, name: `Moongazer's Sigil${rank}`,
    stats: [
      [Stat.BaseAtk, 500], [Stat.CritRate, 36], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!],
      [Stat.DmgBonus, [20, 25, 30, 35, 40][r]!, Type1.Liberation],
    ],
    updateBuffs: () => {
      if (casting(Cast.Intro)) setStacksSelf(MOONGAZER_STACKS, 5);
      else if (applied(SHIELD)) applyCurrent(MOONGAZER_STACKS, applied(SHIELD));
    },
  });
});

/** Daybreaker's Spine, Luuk's sig: Suturing Dayline. +12% ATK flat. Dealing Basic Attack DMG
 *  puts up +20% Spectro DMG Bonus for 4s, and each Tune Strain - Shifting the wielder inflicts (a
 *  cast declaring `strain`) puts up +20% Basic Attack DMG Amplification and 10% DEF ignore on Basic
 *  Attack DMG for 6s — both short self buffs, re-applied by nearly everything he does, lost after
 *  his outro. */
export const DAYBREAKERS_SPINE = refinements((r, rank) => {
  const SUTURING_DAYLINE_SPECTRO = new Buff({
    name: `Daybreaker's Spine: Suturing Dayline (spectro)${rank}`,
    stats: [[Stat.DmgBonus, [20, 25, 30, 35, 40][r]!, Attribute.Spectro]], until: LifeTime.Outro,
  });
  const SUTURING_DAYLINE_STRAIN = new Buff({
    name: `Daybreaker's Spine: Suturing Dayline (strain)${rank}`, until: LifeTime.Outro,
    stats: [[Stat.Amp, [20, 25, 30, 35, 40][r]!, Type1.Basic], [Stat.DefIgnoreNew, [10, 12.5, 15, 17.5, 20][r]!, Type1.Basic]],
  });
  return new Weapon({
    weaponType: WeaponType.Gauntlets, name: `Daybreaker's Spine${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: onType(Type1.Basic), buff: SUTURING_DAYLINE_SPECTRO },
      { on: onInflict(TUNE_STRAIN_SHIFTING), buff: SUTURING_DAYLINE_STRAIN },
    ],
  });
});
