/** Signature Rectifier weapons, ported to the new engine. Stringmaster (Encore's own,
 *  standard/permanent-availability) lives here too since it isn't part of any named tier. */
import { isType,
  Buff, Weapon, WeaponType, Stat, Attribute, Type1, Cast,
  addStat, frozenStacks, stacksOf, isHeld, applyCurrent, applyTeam, revokeCurrent, revokeTeam, removeStack, casting, currentAction, lostOnSwap,
} from "../engine/kit.js";
import { applied, appliedByMe } from "../engine/kit.js";
import { GLACIO_CHAFE, FUSION_BURST, HEALS } from "../shared/status.js";
import { TUNE_STRAIN_SHIFTING } from "../shared/tunebreak.js";

/** Rime-Draped Sprouts, Zhezhi's sig, R1. +12% ATK flat. On field, Resonance Skill grants +12%
 *  Basic Attack DMG Bonus a stack, up to 3, 6s. At 3+ frozenStacks, her Outro spends them all for
 *  +52% Basic Attack DMG Bonus, 27s, permanent uptime. */
export const RIME_DRAPED_SPROUTS = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Rime-Draped Sprouts",
  updateBuffs: () => { if (casting(Cast.Skill)) applyCurrent(PANORAMA_STACKS, 1); },
  constantStats: () => {
    addStat(Stat.BaseAtk, 500);
    addStat(Stat.CritDmg, 72);
    addStat(Stat.BonusAtk, 12);
  },
});
export const PANORAMA_STACKS = new Buff({
  name: "Rime-Draped Sprouts: Panorama", maxStacks: 3,
  applyStats: () => addStat(Stat.DmgBonus, 12 * frozenStacks(), Type1.Basic),
  // on outro: 3+ stacks convert into the permanent off-field version, short of 3 they're just lost
  updateBuffs: () => {
    if (casting(Cast.Outro)) {
      if (frozenStacks() >= 3) applyCurrent(PANORAMA_OFFIELD, 1);
      revokeCurrent(PANORAMA_STACKS);
    }
  },
});
export const PANORAMA_OFFIELD = new Buff({
  name: "Rime-Draped Sprouts: Panorama (off field)", applyStats: () => {
    if (!currentAction().active) {
      addStat(Stat.DmgBonus, 52, Type1.Basic);
    }
  }
});

/** Stringmaster, R1: Electric Amplification. +12% Attribute DMG Bonus flat, +12% ATK on any
 *  inactive action. Skill DMG stacks ATK twice over (12% a stack). Encore's own weapon. */
export const STRINGMASTER = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Stringmaster",
  updateBuffs: () => { if (isType(Type1.Skill)) applyCurrent(STRINGMASTER_STACKS, 1); },
  constantStats: () => {
    addStat(Stat.BaseAtk, 500);
    addStat(Stat.CritRate, 36);
    addStat(Stat.DmgBonus, 12);
  },
});
export const STRINGMASTER_STACKS = new Buff({
  name: "Stringmaster: Electric Amplification", maxStacks: 2,
  applyStats: () => {
    if (!currentAction().active) addStat(Stat.BonusAtk, 12);
    addStat(Stat.BonusAtk, 12 * frozenStacks());
  },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(STRINGMASTER_STACKS); },
});

/** Whispers of Sirens, Cantarella's sig, R1: From the Deep. +12% ATK flat. Gentle Dream: an Echo
 *  Skill cast within 10s of an Intro/Basic grants a stack, up to two. Stack 1 pays +40% Basic
 *  Attack DMG Bonus, stack 2 also ignores 12% Havoc RES. Lost entirely if switched off field. */
export const WHISPERS_OF_SIRENS = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Whispers of Sirens",
  updateBuffs: () => {
    if ((casting(Cast.Intro) || casting(Cast.Basic)) && !stacksOf(GENTLE_DREAM)) applyCurrent(GENTLE_DREAM, 1);
  },
  constantStats: () => {
    addStat(Stat.BaseAtk, 500);
    addStat(Stat.CritDmg, 72);
    addStat(Stat.BonusAtk, 12);
  },
});
export const GENTLE_DREAM = new Buff({
  name: "Whispers of Sirens: Gentle Dream", maxStacks: 3,
  updateBuffs: () => {
    lostOnSwap();
    if (casting(Cast.Echo)) applyCurrent(GENTLE_DREAM, 1);
  },
  applyStats: () => {
    const held = frozenStacks();
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
  updateBuffs: () => { if (isType(Type1.Echo)) applyCurrent(UNDERWORLD_REQUIEM, 1); },
  constantStats: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 12);
  },
});
export const UNDERWORLD_REQUIEM = new Buff({
  name: "Lethean Elegy: Underworld Requiem",
  applyStats: () => {
    addStat(Stat.DmgBonus, 32, Type1.Skill);
    addStat(Stat.Amp, 32, Type1.Echo);
    addStat(Stat.DefIgnoreOld, 8);
  },
});

/** Freeze Frame, Lucilla's sig (R1 "Light's Offering"): +12% ATK flat. After inflicting Glacio
 *  Chafe, the wielder gets +30% Glacio DMG Bonus for 12s and the whole team gets +24% ATK for
 *  30s (permanent uptime). Reacts to the wielder's *own* chafe, so it works on anyone equipping it. */
export const FREEZE_FRAME = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Freeze Frame",
  updateBuffs: () => { if (appliedByMe(GLACIO_CHAFE)) { applyCurrent(FREEZE_FRAME_SELF, 1); applyTeam(FREEZE_FRAME_TEAM, 1); } },
  constantStats: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 12);
  },
});
export const FREEZE_FRAME_SELF = new Buff({
  name: "Freeze Frame: Light's Offering",
  applyStats: () => addStat(Stat.DmgBonus, 30, Attribute.Glacio),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(FREEZE_FRAME_SELF); },
});
export const FREEZE_FRAME_TEAM = new Buff({
  name: "Freeze Frame: Light's Offering (team)", applyStats: () => addStat(Stat.BonusAtk, 24),
});

/** Stellar Symphony, Shorekeeper's sig, R1: 12% HP to herself, 14% attack to the team, and 8
 *  Concerto on a Skill or Liberation cast, once every 20s — the cooldown works like Variation's
 *  Ceaseless Aria: first cast grants it and goes on cooldown, reset by the wielder's Outro. */
export const SK_SIG = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Stellar Symphony",
  updateBuffs: () => {
    if (casting(Cast.Skill) || casting(Cast.Liberation)) applyCurrent(SK_SIG_CONCERTO, 1);
    if (casting(Cast.Skill) && applied(HEALS)) {
      applyTeam(SK_SIG_TEAM, 1);
    }
  },
  constantStats: () => {
    addStat(Stat.BaseAtk, 412.5);
    addStat(Stat.Er, 77.04);
    addStat(Stat.BonusHp, 12);
  },
});
export const SK_SIG_TEAM = new Buff({
  name: "Stellar Symphony: Astral Evolvement (team)", applyStats: () => addStat(Stat.BonusAtk, 14),
});
export const SK_SIG_CONCERTO = new Buff({
  name: "Stellar Symphony: Astral Evolvement", maxStacks: 2,
  applyStats: () => {
    if (frozenStacks() === 1 && (casting(Cast.Skill) || casting(Cast.Liberation))) {
      applyCurrent(SK_SIG_CONCERTO, 1); addStat(Stat.AddConcerto, 8);
    } else if (frozenStacks() === 2 && casting(Cast.Outro)) removeStack(SK_SIG_CONCERTO, 2);
  },
  display: () => `Stellar Symphony: Astral Evolvement${frozenStacks() === 1 ? "" : " (cooldown)"}`,
});

/** Forged Dwarf Star, Denia's sig, R1: Dissolution. +12% ATK flat. The wielder inflicting Fusion
 *  Burst or Tune Strain - Shifting (either applied during her cast) puts up +36% Resonance
 *  Liberation DMG Bonus for 5s — short and her own, so lost after her outro. While that's up, any
 *  team member's own such cast hands the whole team +24% ATK for 15s — a short team window, so
 *  lost on the wielder's next intro. Same name doesn't stack. */
export const FORGED_DWARF_STAR = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Forged Dwarf Star",
  constantStats: () => { addStat(Stat.BaseAtk, 500); addStat(Stat.CritRate, 36); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => { if (appliedByMe(FUSION_BURST) || appliedByMe(TUNE_STRAIN_SHIFTING)) applyCurrent(DISSOLUTION_LIB, 1); },
});
export const DISSOLUTION_LIB = new Buff({
  name: "Forged Dwarf Star: Dissolution",
  applyStats: () => addStat(Stat.DmgBonus, 36, Type1.Liberation),
  // the team half reacts to *anyone's* cast, so it watches from updateGlobal (runs every action
  // for a locally-held buff) rather than update (the wielder's own turns only)
  updateGlobal: () => { if (applied(FUSION_BURST) || applied(TUNE_STRAIN_SHIFTING)) applyTeam(DISSOLUTION_TEAM, 1); },
});
export const DISSOLUTION_TEAM = new Buff({
  name: "Forged Dwarf Star: Dissolution (team)", applyStats: () => addStat(Stat.BonusAtk, 24),
});

/** Firstlight's Herald, Suisui's sig, R1: Spring Wreath. +12% Max HP flat, and 8 Concerto on a
 *  Resonance Liberation once every 20s — the cooldown works like Stellar Symphony's above: the
 *  cast arms it and pays, the charge parks on cooldown, and the wielder's own Outro resets it. The
 *  rest is two 6s marks: inflicting Glacio Chafe leaves Snow Taint, healing leaves Ripples, and
 *  holding both is +20% ATK for the whole team. Neither mark is revoked here — the wielder's own
 *  Outro renews both for another 6s, which is what keeps the team's ATK standing across the
 *  handoff. */
export const FIRSTLIGHTS_HERALD = new Weapon({
  weaponType: WeaponType.Rectifier,
  name: "Firstlight's Herald",
  updateBuffs: () => {
    if (casting(Cast.Liberation)) applyCurrent(SPRING_WREATH_CONCERTO, 1);
    if (appliedByMe(GLACIO_CHAFE)) applyCurrent(SNOW_TAINT, 1);
    if (applied(HEALS)) applyCurrent(RIPPLES, 1);
    if (isHeld(SNOW_TAINT) && isHeld(RIPPLES)) applyTeam(SPRING_WREATH_TEAM, 1);
  },
  constantStats: () => {
    addStat(Stat.BaseAtk, 412.5);
    addStat(Stat.Er, 77.04);
    addStat(Stat.BonusHp, 12);
  },
});
export const SPRING_WREATH_CONCERTO = new Buff({
  name: "Firstlight's Herald: Spring Wreath", maxStacks: 2,
  applyStats: () => {
    if (frozenStacks() === 1 && casting(Cast.Liberation)) {
      applyCurrent(SPRING_WREATH_CONCERTO, 1); addStat(Stat.AddConcerto, 8);
    } else if (frozenStacks() === 2 && casting(Cast.Outro)) removeStack(SPRING_WREATH_CONCERTO, 2);
  },
  display: () => `Firstlight's Herald: Spring Wreath${frozenStacks() === 1 ? "" : " (cooldown)"}`,
});
export const SNOW_TAINT = new Buff({ name: "Firstlight's Herald: Snow Taint" });
export const RIPPLES = new Buff({ name: "Firstlight's Herald: Ripples" });
export const SPRING_WREATH_TEAM = new Buff({
  name: "Firstlight's Herald: Spring Wreath (team)", applyStats: () => addStat(Stat.BonusAtk, 20),
});
