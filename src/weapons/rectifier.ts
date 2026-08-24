/** Signature Rectifier weapons, ported to the new engine. Stringmaster (Encore's own,
 *  standard/permanent-availability) lives here too since it isn't part of any named tier. */
import {
  Buff, Weapon, WeaponType, Stat, Attribute, Type1, Cast,
  addStat, stacks, stacksOf, applySelf, applyTeam, revoke, removeStack, casting, currentAction, lostOnSwap,
} from "../kit.js";

/** Rime-Draped Sprouts, Zhezhi's sig, R1. +12% ATK flat. On field, Resonance Skill grants +12%
 *  Basic Attack DMG Bonus a stack, up to 3, 6s. At 3+ stacks, her Outro spends them all for
 *  +52% Basic Attack DMG Bonus, 27s, permanent uptime. */
export const RIME_DRAPED_SPROUTS = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Rime-Draped Sprouts",
  update: () => { if (casting(Cast.Skill)) applySelf(PANORAMA_STACKS, 1); },
  apply: () => {
    addStat(Stat.BaseAtk, 500);
    addStat(Stat.CritDmg, 72);
    addStat(Stat.BonusAtk, 12);
  },
});
export const PANORAMA_STACKS = new Buff({
  name: "Rime-Draped Sprouts: Panorama", maxStacks: 3,
  apply: () => addStat(Stat.DmgBonus, 12 * stacks(), Type1.Basic),
  // on outro: 3+ stacks convert into the permanent off-field version, short of 3 they're just lost
  update: () => {
    if (casting(Cast.Outro)) {
      if (stacks() >= 3) applySelf(PANORAMA_OFFIELD, 1);
      revoke(PANORAMA_STACKS);
    }
  },
});
export const PANORAMA_OFFIELD = new Buff({
  name: "Rime-Draped Sprouts: Panorama (off field)", apply: () => {
    if (!currentAction().active) {
      addStat(Stat.DmgBonus, 52, Type1.Basic);
    }
  }
});

/** Whispers of Sirens, Cantarella's sig, R1: From the Deep. +12% ATK flat. Gentle Dream: an Echo
 *  Skill cast within 10s of an Intro/Basic grants a stack, up to two. Stack 1 pays +40% Basic
 *  Attack DMG Bonus, stack 2 also ignores 12% Havoc RES. Lost entirely if switched off field. */
export const WHISPERS_OF_SIRENS = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Whispers of Sirens",
  update: () => {
    if ((casting(Cast.Intro) || casting(Cast.Basic)) && !stacksOf(GENTLE_DREAM)) applySelf(GENTLE_DREAM, 1);
  },
  apply: () => {
    addStat(Stat.BaseAtk, 500);
    addStat(Stat.CritDmg, 72);
    addStat(Stat.BonusAtk, 12);
  },
});
export const GENTLE_DREAM = new Buff({
  name: "Whispers of Sirens: Gentle Dream", maxStacks: 3,
  update: () => {
    lostOnSwap();
    if (casting(Cast.Echo)) applySelf(GENTLE_DREAM, 1);
  },
  apply: () => {
    const held = stacks();
    if (held < 2) return;
    addStat(Stat.DmgBonus, 40, Type1.Basic);
    if (held >= 3) addStat(Stat.ResIgnore, 12, Attribute.Havoc);
  },
});

/** Lethean Elegy, Phrolova's sig, R1: Underworld Requiem. +12% ATK flat. Dealing Echo Skill DMG
 *  grants +32% Skill DMG Bonus, +32% Echo Skill DMG Amp, 8% DEF ignore for 12s. R5: same base
 *  ATK/Crit Rate, only the passive's own numbers scale (+24% ATK flat; +64%/+64%/16%). */
export const LETHEAN_ELEGY = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Lethean Elegy",
  update: () => { if (currentAction().type === Type1.Echo) applySelf(UNDERWORLD_REQUIEM, 1); },
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 12);
  },
});
export const UNDERWORLD_REQUIEM = new Buff({
  name: "Lethean Elegy: Underworld Requiem",
  apply: () => {
    addStat(Stat.DmgBonus, 32, Type1.Skill);
    addStat(Stat.Amp, 32, Type1.Echo);
    addStat(Stat.DefIgnoreNew, 8);
  },
});
export const LETHEAN_ELEGY_R5 = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Lethean Elegy R5",
  update: () => { if (currentAction().type === Type1.Echo) applySelf(UNDERWORLD_REQUIEM_R5, 1); },
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 24);
  },
});
export const UNDERWORLD_REQUIEM_R5 = new Buff({
  name: "Lethean Elegy: Underworld Requiem R5",
  apply: () => {
    addStat(Stat.DmgBonus, 64, Type1.Skill);
    addStat(Stat.Amp, 64, Type1.Echo);
    addStat(Stat.DefIgnoreNew, 16);
  },
});

/** Freeze Frame, Lucilla's sig (R1 "Light's Offering"): +12% ATK flat. After inflicting Glacio
 *  Chafe, the wielder gets +30% Glacio DMG Bonus for 12s and the whole team gets +24% ATK for
 *  30s (permanent uptime). Reacts to the wielder's *own* chafe, so it works on anyone equipping it. */
export const FREEZE_FRAME = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Freeze Frame",
  update: () => { if (currentAction().chafe > 0) { applySelf(FREEZE_FRAME_SELF, 1); applyTeam(FREEZE_FRAME_TEAM, 1); } },
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 12);
  },
});
export const FREEZE_FRAME_SELF = new Buff({
  name: "Freeze Frame: Light's Offering",
  apply: () => addStat(Stat.DmgBonus, 30, Attribute.Glacio),
  convert: () => { if (casting(Cast.Outro)) revoke(FREEZE_FRAME_SELF); },
});
export const FREEZE_FRAME_TEAM = new Buff({
  name: "Freeze Frame: Light's Offering (team)", apply: () => addStat(Stat.BonusAtk, 24),
});

/** Stellar Symphony, Shorekeeper's sig, R1: 12% HP to herself, 14% attack to the team, and 8
 *  Concerto on a Skill or Liberation cast, once every 20s — the cooldown works like Variation's
 *  Ceaseless Aria: first cast grants it and goes on cooldown, reset by the wielder's Outro. */
export const SK_SIG = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Stellar Symphony",
  update: () => {
    if (casting(Cast.Skill) || casting(Cast.Liberation)) applySelf(SK_SIG_CONCERTO, 1);
    if (casting(Cast.Skill) && currentAction().heals) {
      applyTeam(SK_SIG_TEAM, 1);
    }
  },
  apply: () => {
    addStat(Stat.BaseAtk, 412.5);
    addStat(Stat.Er, 77.04);
    addStat(Stat.BonusHp, 12);
  },
});
export const SK_SIG_TEAM = new Buff({
  name: "Stellar Symphony: Astral Evolvement (team)", apply: () => addStat(Stat.BonusAtk, 14),
});
export const SK_SIG_CONCERTO = new Buff({
  name: "Stellar Symphony: Astral Evolvement", maxStacks: 2,
  apply: () => {
    if (stacks() === 1 && (casting(Cast.Skill) || casting(Cast.Liberation))) {
      applySelf(SK_SIG_CONCERTO, 1); addStat(Stat.AddConcerto, 8);
    } else if (stacks() === 2 && casting(Cast.Outro)) removeStack(SK_SIG_CONCERTO, 2);
  },
  display: () => `Stellar Symphony: Astral Evolvement${stacks() === 1 ? "" : " (cooldown)"}`,
});

/** Stringmaster, R1: Electric Amplification. +12% Attribute DMG Bonus flat, +12% ATK on any
 *  inactive action. Skill DMG stacks ATK twice over (12% a stack). Encore's own weapon. */
export const STRINGMASTER = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Stringmaster",
  update: () => { if (currentAction().type === Type1.Skill) applySelf(STRINGMASTER_STACKS, 1); },
  apply: () => {
    addStat(Stat.BaseAtk, 500);
    addStat(Stat.CritRate, 36);
    addStat(Stat.DmgBonus, 12);
  },
});
export const STRINGMASTER_STACKS = new Buff({
  name: "Stringmaster: Electric Amplification", maxStacks: 2,
  apply: () => {
    if (!currentAction().active) addStat(Stat.BonusAtk, 12);
    addStat(Stat.BonusAtk, 12 * stacks());
  },
  convert: () => { if (casting(Cast.Outro)) revoke(STRINGMASTER_STACKS); },
});
