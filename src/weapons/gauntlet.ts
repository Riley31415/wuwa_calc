/** Signature Gauntlets weapons, ported to the new engine. */
import {
  Buff, Weapon, WeaponType, Stat, Attribute, Type1, Cast,
  addStat, applySelf, setStacksSelf, casting, currentAction, revoke, stacks,
} from "../kit.js";

/** Verity's Handle, Xiangli Yao's sig, R1: Ad Veritatem. +12% Attribute DMG Bonus flat.
 *  Liberation grants +48% Liberation DMG Bonus for 8s, extended by each Skill cast while up —
 *  approximated as a flat re-grant per Skill cast rather than a real countdown. Not owned by any
 *  resonator implemented yet — exported standalone. */
export const VERITYS_HANDLE = new Weapon({
  weaponType: WeaponType.Gauntlets,
  name: "Verity's Handle",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.DmgBonus, 12); },
  update: () => { if (casting(Cast.Liberation) || casting(Cast.Skill)) applySelf(AD_VERITATEM, 1); },
});
export const AD_VERITATEM = new Buff({
  name: "Verity's Handle: Ad Veritatem",
  apply: () => addStat(Stat.DmgBonus, 48, Type1.Liberation),
  convert: () => { if (casting(Cast.Outro)) revoke(AD_VERITATEM); },
});

/** Tragicomedy, Roccia's sig, R1: Fool's Warble. +12% ATK flat. Basic Attack or Intro grants
 *  +48% Heavy Attack DMG Bonus for 3s. "Basic Attack" is the cast, not the damage type — checked
 *  against `cast` directly since a cast2 match shouldn't count. */
export const TRAGICOMEDY = new Weapon({
  weaponType: WeaponType.Gauntlets,
  name: "Tragicomedy",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.BonusAtk, 12); },
  update: () => {
    const a = currentAction();
    if (a.cast === Cast.Basic || a.cast === Cast.Intro) applySelf(FOOLS_WARBLE, 1);
  },
});
export const FOOLS_WARBLE = new Buff({
  name: "Tragicomedy: Fool's Warble",
  apply: () => addStat(Stat.DmgBonus, 48, Type1.Heavy),
  convert: () => { if (casting(Cast.Outro)) revoke(FOOLS_WARBLE); },
});

/** Solsworn Ciphers, Sigrika's sig, R1: Sunward. +12% ATK flat. Intro/Echo Skill grants +32%
 *  Echo Skill DMG Amp for 15s; dealing Echo Skill DMG makes Aero DMG ignore 10% DEF for 6s. */
export const SOLSWORN_CIPHERS = new Weapon({
  weaponType: WeaponType.Gauntlets,
  name: "Solsworn Ciphers",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.BonusAtk, 12); },
  update: () => {
    if (casting(Cast.Intro) || casting(Cast.Echo)) applySelf(SUNWARD_AMP, 1);
    if (currentAction().type === Type1.Echo) applySelf(SUNWARD_IGNORE, 1);
  },
});
export const SUNWARD_AMP = new Buff({
  name: "Solsworn Ciphers: Sunward (echo amp)",
  apply: () => addStat(Stat.Amp, 32, Type1.Echo),
  convert: () => { if (casting(Cast.Outro)) revoke(SUNWARD_AMP); },
});
export const SUNWARD_IGNORE = new Buff({
  name: "Solsworn Ciphers: Sunward (def ignore)",
  apply: () => addStat(Stat.DefIgnoreNew, 10, Attribute.Aero),
  convert: () => { if (casting(Cast.Outro)) revoke(SUNWARD_IGNORE); },
});

/** Moongazer's Sigil, Iuno's sig, R1. Liberation damage gets a flat bonus and, per shield stack,
 *  pierces defence — her own Intro takes the stack straight to the ceiling, every other
 *  shielding cast adds one per shield it declares. */
export const IUNO_SIG = new Weapon({
  weaponType: WeaponType.Gauntlets,
  name: "Moongazer's Sigil",
  apply: () => {
    addStat(Stat.BaseAtk, 500); addStat(Stat.CritRate, 36); addStat(Stat.BonusAtk, 12);
    addStat(Stat.DmgBonus, 20, Type1.Liberation);
  },
  update: () => {
    if (casting(Cast.Intro)) setStacksSelf(MOONGAZER_STACKS, 5);
    else if (currentAction().shields) applySelf(MOONGAZER_STACKS, currentAction().shields);
  },
});
export const MOONGAZER_STACKS = new Buff({
  name: "Moongazer's Sigil: Plenilune Radiance", maxStacks: 5,
  // scoped to liberation damage — most of Lunar Cycle qualifies, intro/outro/echo don't
  apply: () => addStat(Stat.DefIgnoreNew, 7.2 * stacks(), Type1.Liberation),
});
