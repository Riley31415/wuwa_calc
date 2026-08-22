/**
 * Signature Gauntlets weapons, ported to the new engine — grouped by weapon type rather than
 * version (see weapons_standard.ts for the non-signature, any-type-usable weapons).
 *
 * Base ATK is ported via Stat.BaseAtk for fidelity to the source numbers; see the note at the
 * top of weapons_standard.ts — engine2's own atk formula doesn't fold those contributions in yet.
 */
import {
  Buff, Weapon, WeaponType, Stat, Element, Type1, Cast,
  addStat, applySelf, setStacksSelf, casting, currentAction, revoke, stacks,
} from "../kit.js";

/** Verity's Handle, Xiangli Yao's signature, R1: Ad Veritatem. +12% Attribute DMG Bonus flat
 *  (unscoped). Casting Resonance Liberation grants +48% Resonance Liberation DMG Bonus for 8s,
 *  extended 5s (up to 3 times) by each Resonance Skill cast while it's up — approximated here as
 *  a flat re-grant per Skill cast (the buff's own body re-adds the window rather than tracking a
 *  real countdown, same shape as every other short-window weapon passive), lost after the outro
 *  action gains stats. Not owned by any resonator implemented in this codebase yet — exported
 *  standalone. Xiangli Yao, released 1.2 — https://ww.nanoka.cc/weapon/21040016 */
export const VERITYS_HANDLE = new Weapon({
  weaponType: WeaponType.Gauntlets,
  name: "Verity's Handle",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.DmgBonus, 12); },
  update: () => { if (casting(Cast.Liberation) || casting(Cast.Skill)) applySelf(AD_VERITATEM, 1); },
});
export const AD_VERITATEM = new Buff({
  name: "Verity's Handle: Ad Veritatem",
  apply: () => addStat(Stat.DmgBonus, 48, Type1.Liberation),
  // short window, so it still counts on the wearer's own outro (see jinzhou.ts's HERON_HANDOFF)
  convert: () => { if (casting(Cast.Outro)) revoke(AD_VERITATEM); },
});

/** Tragicomedy, Roccia's signature, R1: Fool's Warble. +12% ATK flat. Casting Basic Attack or
 *  Intro Skill grants +48% Heavy Attack DMG Bonus for 3s — short enough that only the standing
 *  outro-loss rule matters. "Basic Attack" read as the cast (any of Pero, Easy's four stages or
 *  Real Fantasy's three, all `cast: Cast.Basic`), not the damage type — checked against `cast`
 *  directly rather than `casting()`, since a cast2 match must not count here. Roccia, character
 *  1606, released 2.0 — https://ww.nanoka.cc/character/1606,
 *  https://ww.nanoka.cc/weapon/21040026 */
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

/** Solsworn Ciphers, Sigrika's signature, R1: Sunward. +12% ATK flat. Casting Intro Skill or
 *  Echo Skill grants +32% Echo Skill DMG Amplification for 15s. Dealing Echo Skill DMG makes
 *  Aero DMG ignore 10% DEF for 6s — both short enough that only the standing outro-loss rule
 *  matters for either. Sigrika, character 1412, released 3.2 —
 *  https://ww.nanoka.cc/character/1412, https://ww.nanoka.cc/weapon/21040066 */
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
  apply: () => addStat(Stat.DefIgnore, 10, Element.Aero),
  convert: () => { if (casting(Cast.Outro)) revoke(SUNWARD_IGNORE); },
});

/** Moongazer's Sigil, Iuno's signature. Liberation damage gets a flat bonus and, per shield
 *  stack, pierces defence — her own Intro takes the stack straight to the ceiling, every other
 *  shielding cast of hers adds one per shield it declares. R1, the rank the sheet's numbers
 *  describe. Iuno, character 1410, released 2.6 — https://ww.nanoka.cc/character/1410 */
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
  apply: () => addStat(Stat.DefIgnore, 7.2 * stacks(), Type1.Liberation),
});
