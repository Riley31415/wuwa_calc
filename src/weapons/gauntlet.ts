/** Signature Gauntlets weapons, ported to the new engine. */
import { isType,
  Buff, Weapon, WeaponType, Stat, Attribute, Type1, Cast,
  addStat, applyCurrent, setStacksSelf, casting, currentAction, revokeCurrent, frozenStacks,
} from "../engine/kit.js";
import { applied, appliedByMe } from "../engine/kit.js";
import { SHIELD } from "../shared/status.js";
import { TUNE_STRAIN_SHIFTING } from "../shared/tunebreak.js";

/** Verity's Handle, Xiangli Yao's sig, R1: Ad Veritatem. +12% Attribute DMG Bonus flat.
 *  Liberation grants +48% Liberation DMG Bonus for 8s, extended by each Skill cast while up —
 *  approximated as a flat re-grant per Skill cast rather than a real countdown. Not owned by any
 *  resonator implemented yet — exported standalone. */
export const VERITYS_HANDLE = new Weapon({
  weaponType: WeaponType.Gauntlets,
  name: "Verity's Handle",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.DmgBonus, 12); },
  updateBuffs: () => { if (casting(Cast.Liberation) || casting(Cast.Skill)) applyCurrent(AD_VERITATEM, 1); },
});
export const AD_VERITATEM = new Buff({
  name: "Verity's Handle: Ad Veritatem",
  applyStats: () => addStat(Stat.DmgBonus, 48, Type1.Liberation),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(AD_VERITATEM); },
});

/** Tragicomedy, Roccia's sig, R1: Fool's Warble. +12% ATK flat. Basic Attack or Intro grants
 *  +48% Heavy Attack DMG Bonus for 3s. "Basic Attack" is the cast, not the damage type — checked
 *  against `cast` directly since a cast2 match shouldn't count. */
export const TRAGICOMEDY = new Weapon({
  weaponType: WeaponType.Gauntlets,
  name: "Tragicomedy",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => {
    if (casting(Cast.Basic) || casting(Cast.Intro)) applyCurrent(FOOLS_WARBLE, 1);
  },
});
export const FOOLS_WARBLE = new Buff({
  name: "Tragicomedy: Fool's Warble",
  applyStats: () => addStat(Stat.DmgBonus, 48, Type1.Heavy),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(FOOLS_WARBLE); },
});

/** Solsworn Ciphers, Sigrika's sig, R1: Sunward. +12% ATK flat. Intro/Echo Skill grants +32%
 *  Echo Skill DMG Amp for 15s; dealing Echo Skill DMG makes Aero DMG ignore 10% DEF for 6s. */
export const SOLSWORN_CIPHERS = new Weapon({
  weaponType: WeaponType.Gauntlets,
  name: "Solsworn Ciphers",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => {
    if (casting(Cast.Intro) || casting(Cast.Echo)) applyCurrent(SUNWARD_AMP, 1);
    if (isType(Type1.Echo)) applyCurrent(SUNWARD_IGNORE, 1);
  },
});
export const SUNWARD_AMP = new Buff({
  name: "Solsworn Ciphers: Sunward (echo amp)",
  applyStats: () => addStat(Stat.Amp, 32, Type1.Echo),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(SUNWARD_AMP); },
});
export const SUNWARD_IGNORE = new Buff({
  name: "Solsworn Ciphers: Sunward (def ignore)",
  applyStats: () => addStat(Stat.DefIgnoreNew, 10, Attribute.Aero),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(SUNWARD_IGNORE); },
});

/** Moongazer's Sigil, Iuno's sig, R1. Liberation damage gets a flat bonus and, per shield stack,
 *  pierces defence — her own Intro takes the stack straight to the ceiling, every other
 *  shielding cast adds one per shield it declares. */
export const IUNO_SIG = new Weapon({
  weaponType: WeaponType.Gauntlets,
  name: "Moongazer's Sigil",
  constantStats: () => {
    addStat(Stat.BaseAtk, 500); addStat(Stat.CritRate, 36); addStat(Stat.BonusAtk, 12);
    addStat(Stat.DmgBonus, 20, Type1.Liberation);
  },
  updateBuffs: () => {
    if (casting(Cast.Intro)) setStacksSelf(MOONGAZER_STACKS, 5);
    else if (applied(SHIELD)) applyCurrent(MOONGAZER_STACKS, applied(SHIELD));
  },
});
export const MOONGAZER_STACKS = new Buff({
  name: "Moongazer's Sigil: Plenilune Radiance", maxStacks: 5,
  // scoped to liberation damage — most of Lunar Cycle qualifies, intro/outro/echo don't
  applyStats: () => addStat(Stat.DefIgnoreNew, 7.2 * frozenStacks(), Type1.Liberation),
});

/** Daybreaker's Spine, Luuk's sig, R1: Suturing Dayline. +12% ATK flat. Dealing Basic Attack DMG
 *  puts up +20% Spectro DMG Bonus for 4s, and each Tune Strain - Shifting the wielder inflicts (a
 *  cast declaring `strain`) puts up +20% Basic Attack DMG Amplification and 10% DEF ignore on Basic
 *  Attack DMG for 6s — both short self buffs, re-applied by nearly everything he does, lost after
 *  his outro. */
export const DAYBREAKERS_SPINE = new Weapon({
  weaponType: WeaponType.Gauntlets,
  name: "Daybreaker's Spine",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => {
    const a = currentAction();
    if (isType(Type1.Basic)) applyCurrent(SUTURING_DAYLINE_SPECTRO, 1);
    if (appliedByMe(TUNE_STRAIN_SHIFTING)) applyCurrent(SUTURING_DAYLINE_STRAIN, 1);
  },
});
export const SUTURING_DAYLINE_SPECTRO = new Buff({
  name: "Daybreaker's Spine: Suturing Dayline (spectro)",
  applyStats: () => addStat(Stat.DmgBonus, 20, Attribute.Spectro),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(SUTURING_DAYLINE_SPECTRO); },
});
export const SUTURING_DAYLINE_STRAIN = new Buff({
  name: "Daybreaker's Spine: Suturing Dayline (strain)",
  applyStats: () => { addStat(Stat.Amp, 20, Type1.Basic); addStat(Stat.DefIgnoreNew, 10, Type1.Basic); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(SUTURING_DAYLINE_STRAIN); },
});
