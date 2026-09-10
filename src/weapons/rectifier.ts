/** Signature Rectifier weapons. Stringmaster (Encore's own, standard/permanent-availability)
 *  lives here too since it isn't part of any named tier. Each export is the weapon's five
 *  refinements, R1 first (gear.ts's own `refinements()`); a number that grows with rank is
 *  written as its five values. */
import { WeaponType, Stat, Attribute, Type1, Type2, Cast, LifeTime, BuffTarget } from "../engine/stats.js";
import { Buff, Weapon, refinements } from "../engine/gear.js";
import {
  addStat, frozenStacks, stacksOf, isHeld, applyCurrent, applyTeam, revokeCurrent, removeStack, casting,
  currentAction, isActive, applied, onCast, onType, onInflict, onApplied, either, both,
} from "../engine/context.js";
import { GLACIO_CHAFE, FUSION_BURST, HEALS, ELECTRO_FLARE } from "../shared/status.js";
import { TUNE_STRAIN_SHIFTING } from "../shared/tunebreak.js";
import { unisonResponse } from "../shared/unison.js";

/** Rime-Draped Sprouts, Zhezhi's sig. +12% ATK flat. On field, Resonance Skill grants +12%
 *  Basic Attack DMG Bonus a stack, up to 3, 6s. At 3+ stacks, her Outro spends them all for
 *  +52% Basic Attack DMG Bonus, 27s, permanent uptime. */
export const RIME_DRAPED_SPROUTS = refinements((r, rank) => {
  const PANORAMA_OFFIELD = new Buff({
    name: `Rime-Draped Sprouts: Panorama (off field)${rank}`,
    stats: [[Stat.DmgBonus, [52, 65, 78, 91, 104][r]!, Type1.Basic]], when: () => !isActive(),
  });
  const PANORAMA_STACKS: Buff = new Buff({
    name: `Rime-Draped Sprouts: Panorama${rank}`, maxStacks: 3,
    stats: [[Stat.DmgBonus, [12, 15, 18, 21, 24][r]!, Type1.Basic]], perStack: true,
    // on outro: 3+ stacks convert into the permanent off-field version, short of 3 they're just lost
    updateBuffs: () => {
      if (casting(Cast.Outro)) {
        if (frozenStacks() >= 3) applyCurrent(PANORAMA_OFFIELD, 1);
        revokeCurrent(PANORAMA_STACKS);
      }
    },
  });
  return new Weapon({
    weaponType: WeaponType.Rectifier, name: `Rime-Draped Sprouts${rank}`,
    stats: [[Stat.BaseAtk, 500], [Stat.CritDmg, 72], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onCast(Cast.Skill), buff: PANORAMA_STACKS }],
  });
});

/** Stringmaster: Electric Amplification. +12% Attribute DMG Bonus flat, +12% ATK on any
 *  inactive action. Skill DMG stacks ATK twice over (12% a stack). Encore's own weapon. */
export const STRINGMASTER = refinements((r, rank) => {
  const STRINGMASTER_STACKS = new Buff({
    name: `Stringmaster: Electric Amplification${rank}`, maxStacks: 2, until: LifeTime.Outro,
    applyStats: () => {
      if (!isActive()) addStat(Stat.BonusAtk, [12, 15, 18, 21, 24][r]!);
      addStat(Stat.BonusAtk, [12, 15, 18, 21, 24][r]! * frozenStacks());
    },
  });
  return new Weapon({
    weaponType: WeaponType.Rectifier, name: `Stringmaster${rank}`,
    stats: [[Stat.BaseAtk, 500], [Stat.CritRate, 36], [Stat.DmgBonus, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onType(Type1.Skill), buff: STRINGMASTER_STACKS }],
  });
});

/** Whispers of Sirens, Cantarella's sig: From the Deep. +12% ATK flat. Gentle Dream: an Echo
 *  Skill cast within 10s of an Intro/Basic grants a stack, up to two. Stack 1 pays +40% Basic
 *  Attack DMG Bonus, stack 2 also ignores 12% Havoc RES. Lost entirely if switched off field. */
export const WHISPERS_OF_SIRENS = refinements((r, rank) => {
  const GENTLE_DREAM: Buff = new Buff({
    name: `Whispers of Sirens: Gentle Dream${rank}`, maxStacks: 3, until: LifeTime.Swap,
    grants: [{ on: onCast(Cast.Echo) }],
    applyStats: () => {
      const held = frozenStacks();
      if (held < 2) return;
      addStat(Stat.DmgBonus, [40, 50, 60, 70, 80][r]!, Type1.Basic);
      if (held >= 3) addStat(Stat.ResIgnore, [12, 15, 18, 21, 24][r]!, Attribute.Havoc);
    },
  });
  return new Weapon({
    weaponType: WeaponType.Rectifier, name: `Whispers of Sirens${rank}`,
    stats: [[Stat.BaseAtk, 500], [Stat.CritDmg, 72], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: () => (casting(Cast.Intro) || casting(Cast.Basic)) && !stacksOf(GENTLE_DREAM), buff: GENTLE_DREAM }],
  });
});

/** Lethean Elegy, Phrolova's sig: Underworld Requiem. +12% ATK flat. Dealing Echo Skill DMG
 *  grants +32% Skill DMG Bonus, +32% Echo Skill DMG Amp, 8% DEF ignore for 12s. Base ATK/Crit
 *  Rate never change with rank; only the passive's own numbers scale. */
export const LETHEAN_ELEGY = refinements((r, rank) => {
  const UNDERWORLD_REQUIEM = new Buff({
    name: `Lethean Elegy: Underworld Requiem${rank}`,
    stats: [
      [Stat.DmgBonus, [32, 40, 48, 56, 64][r]!, Type1.Skill],
      [Stat.Amp, [32, 40, 48, 56, 64][r]!, Type1.Echo],
      [Stat.DefIgnoreOld, [8, 10, 12, 14, 16][r]!],
    ],
  });
  return new Weapon({
    weaponType: WeaponType.Rectifier, name: `Lethean Elegy${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onType(Type1.Echo), buff: UNDERWORLD_REQUIEM }],
  });
});

/** Freeze Frame, Lucilla's sig ("Light's Offering"): +12% ATK flat. After inflicting Glacio
 *  Chafe, the wielder gets +30% Glacio DMG Bonus for 12s and the whole team gets +24% ATK for
 *  30s (permanent uptime). Reacts to the wielder's *own* chafe, so it works on anyone equipping it. */
export const FREEZE_FRAME = refinements((r, rank) => {
  const FREEZE_FRAME_SELF = new Buff({
    name: `Freeze Frame: Light's Offering${rank}`,
    stats: [[Stat.DmgBonus, [30, 37.5, 45, 52.5, 60][r]!, Attribute.Glacio]], until: LifeTime.Outro,
  });
  const FREEZE_FRAME_TEAM = new Buff({
    name: `Freeze Frame: Light's Offering${rank}`,
    stats: [[Stat.BonusAtk, [24, 30, 36, 42, 48][r]!]],
  });
  return new Weapon({
    weaponType: WeaponType.Rectifier, name: `Freeze Frame${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: onInflict(GLACIO_CHAFE), buff: FREEZE_FRAME_SELF },
      { on: onInflict(GLACIO_CHAFE), buff: FREEZE_FRAME_TEAM, to: BuffTarget.Team },
    ],
  });
});

/** Stellar Symphony, Shorekeeper's sig: 12% HP to herself, 14% attack to the team, and 8
 *  Concerto on a Liberation cast, once every 20s — the cooldown works like Variation's
 *  Ceaseless Aria: first cast grants it and goes on cooldown, reset by the wielder's Outro. */
export const SK_SIG = refinements((r, rank) => {
  const SK_SIG_TEAM = new Buff({
    name: `Stellar Symphony: Astral Evolvement${rank}`,
    stats: [[Stat.BonusAtk, [14, 17.5, 21, 24.5, 28][r]!]],
  });
  const SK_SIG_CONCERTO: Buff = new Buff({
    name: `Stellar Symphony: Astral Evolvement${rank}`, maxStacks: 2,
    applyStats: () => {
      if (frozenStacks() === 1 && (casting(Cast.Liberation))) {
        applyCurrent(SK_SIG_CONCERTO, 1); addStat(Stat.AddConcerto, [8, 10, 12, 14, 16][r]!);
      } else if (frozenStacks() === 2 && casting(Cast.Outro)) removeStack(SK_SIG_CONCERTO, 2);
    },
    display: () => `Stellar Symphony: Astral Evolvement${rank}${frozenStacks() === 1 ? "" : " (cooldown)"}`,
  });
  return new Weapon({
    weaponType: WeaponType.Rectifier, name: `Stellar Symphony${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.Er, 77.04], [Stat.BonusHp, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: onCast(Cast.Liberation), buff: SK_SIG_CONCERTO },
      { on: both(onCast(Cast.Skill), onApplied(HEALS)), buff: SK_SIG_TEAM, to: BuffTarget.Team },
    ],
  });
});

/** Forged Dwarf Star, Denia's sig: Dissolution. +12% ATK flat. The wielder inflicting Fusion
 *  Burst or Tune Strain - Shifting (either applied during her cast) puts up +36% Resonance
 *  Liberation DMG Bonus for 5s — short and her own, so lost after her outro. While that's up, any
 *  team member's own such cast hands the whole team +24% ATK for 15s — a short team window, so
 *  lost on the wielder's next intro. Same name doesn't stack. */
export const FORGED_DWARF_STAR = refinements((r, rank) => {
  const DISSOLUTION_TEAM = new Buff({
    name: `Forged Dwarf Star: Dissolution${rank}`,
    stats: [[Stat.BonusAtk, [24, 30, 36, 42, 48][r]!]],
  });
  const DISSOLUTION_LIB = new Buff({
    name: `Forged Dwarf Star: Dissolution${rank}`,
    stats: [[Stat.DmgBonus, [36, 45, 54, 63, 72][r]!, Type1.Liberation]],
    // the team half reacts to *anyone's* cast, so it watches from updateGlobal (runs every action
    // for a locally-held buff) rather than update (the wielder's own turns only)
    updateGlobal: () => { if (applied(FUSION_BURST) || applied(TUNE_STRAIN_SHIFTING)) applyTeam(DISSOLUTION_TEAM, 1); },
  });
  return new Weapon({
    weaponType: WeaponType.Rectifier, name: `Forged Dwarf Star${rank}`,
    stats: [[Stat.BaseAtk, 500], [Stat.CritRate, 36], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onInflict(FUSION_BURST, TUNE_STRAIN_SHIFTING), buff: DISSOLUTION_LIB }],
  });
});

/** Firstlight's Herald, Suisui's sig: Spring Wreath. +12% Max HP flat, and 8 Concerto on a
 *  Resonance Liberation once every 20s — the cooldown works like Stellar Symphony's above: the
 *  cast arms it and pays, the charge parks on cooldown, and the wielder's own Outro resets it. The
 *  rest is two 6s marks: inflicting Glacio Chafe leaves Snow Taint, healing leaves Ripples, and
 *  holding both is +20% ATK for the whole team. Neither mark is revoked here — the wielder's own
 *  Outro renews both for another 6s, which is what keeps the team's ATK standing across the
 *  handoff. */
export const FIRSTLIGHTS_HERALD = refinements((r, rank) => {
  const SPRING_WREATH_CONCERTO: Buff = new Buff({
    name: `Firstlight's Herald: Spring Wreath${rank}`, maxStacks: 2,
    applyStats: () => {
      if (frozenStacks() === 1 && casting(Cast.Liberation)) {
        applyCurrent(SPRING_WREATH_CONCERTO, 1); addStat(Stat.AddConcerto, [8, 10, 12, 14, 16][r]!);
      } else if (frozenStacks() === 2 && casting(Cast.Outro)) removeStack(SPRING_WREATH_CONCERTO, 2);
    },
    display: () => `Firstlight's Herald: Spring Wreath${rank}${frozenStacks() === 1 ? "" : " (cooldown)"}`,
  });
  const SNOW_TAINT = new Buff({ name: `Firstlight's Herald: Snow Taint${rank}` });
  const RIPPLES = new Buff({ name: `Firstlight's Herald: Ripples${rank}` });
  const SPRING_WREATH_TEAM = new Buff({
    name: `Firstlight's Herald: Spring Wreath${rank}`,
    stats: [[Stat.BonusAtk, [20, 25, 30, 35, 40][r]!]],
  });
  return new Weapon({
    weaponType: WeaponType.Rectifier, name: `Firstlight's Herald${rank}`,
    stats: [[Stat.BaseAtk, 412.5], [Stat.Er, 77.04], [Stat.BonusHp, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: onCast(Cast.Liberation), buff: SPRING_WREATH_CONCERTO },
      { on: onInflict(GLACIO_CHAFE), buff: SNOW_TAINT },
      { on: onApplied(HEALS), buff: RIPPLES },
      { on: () => isHeld(SNOW_TAINT) && isHeld(RIPPLES), buff: SPRING_WREATH_TEAM, to: BuffTarget.Team },
    ],
  });
});

/** Blooming Jadehaven: Hundredfold Artifice. +12% All-Attribute DMG Bonus flat (plain Dmg
 *  Bonus, no tag). Inflicting Electro Flare or triggering Unison Response pays +36% Resonance
 *  Skill DMG Amplification and 10% Electro RES ignore on Skill DMG — no duration stated, so it
 *  stands once granted. While the wielder is on field, Electro Flare DMG is amplified 30% (30s,
 *  permanent uptime): a Flare tick resolves on its applier's slot, so `active` is the on-field
 *  check. */
export const BLOOMING_JADEHAVEN = refinements((r, rank) => {
  const HUNDREDFOLD_ARTIFICE = new Buff({
    name: `Blooming Jadehaven: Hundredfold Artifice${rank}`,
    stats: [[Stat.Amp, [36, 45, 54, 63, 72][r]!, Type1.Skill]],
    applyStats: () => {
      if (currentAction().type1 === Type1.Skill) addStat(Stat.ResIgnore, [10, 15, 20, 25, 30][r]!, Attribute.Electro);
      if (isActive()) addStat(Stat.Amp, [30, 37.5, 45, 52.5, 60][r]!, Type2.ElectroFlare);
    },
  });
  return new Weapon({
    weaponType: WeaponType.Rectifier, name: `Blooming Jadehaven${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.DmgBonus, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: either(onInflict(ELECTRO_FLARE), unisonResponse), buff: HUNDREDFOLD_ARTIFICE }],
  });
});
