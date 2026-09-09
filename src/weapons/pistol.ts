/** Signature Pistols weapons. Each export is the weapon's five refinements, R1 first (gear.ts's
 *  own `refinements()`); a number that grows with rank is written as its five values. */
import { WeaponType, Stat, EnemyStat, Attribute, Type1, Cast } from "../engine/stats.js";
import { Buff, Debuff, Weapon, refinements } from "../engine/gear.js";
import { addStat, isHeld, onCast, onType, onInflict, either, both } from "../engine/context.js";
import { AERO_EROSION } from "../shared/status.js";
import { TUNE_HACK_SHIFTING, TUNE_RUPTURE_SHIFTING, TUNE_STRAIN_SHIFTING } from "../shared/tunebreak.js";

/** The Last Dance, Carlotta's sig: Silent Eulogy. +12% ATK flat. Intro/Liberation grants
 *  +48% Resonance Skill DMG Bonus for 5s. */
export const THE_LAST_DANCE = refinements((r, rank) => {
  const SILENT_EULOGY = new Buff({
    name: `The Last Dance: Silent Eulogy${rank}`,
    stats: [[Stat.DmgBonus, [48, 60, 72, 84, 96][r]!, Type1.Skill]], until: "outro",
  });
  return new Weapon({
    weaponType: WeaponType.Pistols, name: `The Last Dance${rank}`,
    stats: [[Stat.BaseAtk, 500], [Stat.CritDmg, 72], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onCast(Cast.Intro, Cast.Liberation), buff: SILENT_EULOGY }],
  });
});

/** Lux & Umbra, Galbrena's sig: To Fire She Returns. +12% ATK flat. Echo Skill DMG grants
 *  +24% Heavy Attack DMG Amp for 6s; Heavy Attack DMG grants +24% Echo Skill DMG Amp for 6s.
 *  While both are up, dealing DMG ignores 8% DEF. */
export const LUX_UMBRA = refinements((r, rank) => {
  const TO_FIRE_SHE_RETURNS_HEAVY = new Buff({
    name: `Lux & Umbra: To Fire She Returns (heavy)${rank}`,
    stats: [[Stat.Amp, [24, 30, 36, 42, 48][r]!, Type1.Heavy]], until: "outro",
  });
  const TO_FIRE_SHE_RETURNS_ECHO = new Buff({
    name: `Lux & Umbra: To Fire She Returns (echo)${rank}`,
    stats: [[Stat.Amp, [24, 30, 36, 42, 48][r]!, Type1.Echo]], until: "outro",
  });
  return new Weapon({
    weaponType: WeaponType.Pistols, name: `Lux & Umbra${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritDmg, 48.6], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    applyStats: () => {
      if (isHeld(TO_FIRE_SHE_RETURNS_HEAVY) && isHeld(TO_FIRE_SHE_RETURNS_ECHO)) addStat(Stat.DefIgnoreNew, [8, 10, 12, 14, 16][r]!);
    },
    grants: [
      { on: onType(Type1.Echo), buff: TO_FIRE_SHE_RETURNS_HEAVY },
      { on: onType(Type1.Heavy), buff: TO_FIRE_SHE_RETURNS_ECHO },
    ],
  });
});

/** Woodland Aria, Ciaccona's sig: Lingering Summer Tune. +12% ATK flat. Inflicting Aero
 *  Erosion pays +24% Aero DMG Bonus for 10s, and hitting a target that has Aero Erosion shreds
 *  10% of its own Aero RES for 20s. No target-side status tracking here, so the shred rides the
 *  same trigger as the bonus — the cast that inflicts the Erosion is also the one hitting it. */
export const WOODLAND_ARIA = refinements((r, rank) => {
  const LINGERING_SUMMER_TUNE = new Buff({
    name: `Woodland Aria: Lingering Summer Tune${rank}`,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Attribute.Aero]],
  });
  const LINGERING_SUMMER_SHRED = new Debuff({
    name: `Woodland Aria: Lingering Summer Tune${rank}`,
    stats: [[EnemyStat.ResReduce, [10, 11.5, 13, 14.5, 16][r]!, Attribute.Aero]],
  });
  return new Weapon({
    weaponType: WeaponType.Pistols, name: `Woodland Aria${rank}`,
    stats: [[Stat.BaseAtk, 500], [Stat.CritRate, 36], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: onInflict(AERO_EROSION), buff: LINGERING_SUMMER_TUNE },
      { on: onInflict(AERO_EROSION), buff: LINGERING_SUMMER_SHRED, to: "enemy" },
    ],
  });
});

/** Spectrum Blaster, Lynae's sig: Attendance Exemption Protocol. +12% ATK flat. An Intro or
 *  any Basic Attack DMG puts up +36% Basic Attack DMG Bonus for 4s — short and re-applied by most
 *  of her own combo, so it reads as uptime. The second half stacks team-wide off her own Shifting:
 *  each Tune Rupture/Strain - Shifting she inflicts during a Basic Attack is +8% all DMG for the
 *  whole team, 3 stacks, 30s (permanent uptime at that duration, see CLAUDE.md). */
export const SPECTRUM_BLASTER = refinements((r, rank) => {
  const ATTENDANCE_EXEMPTION = new Buff({
    name: `Spectrum Blaster: Attendance Exemption Protocol${rank}`,
    stats: [[Stat.DmgBonus, [36, 45, 54, 63, 72][r]!, Type1.Basic]], until: "outro",
  });
  const SPECTRUM_CHORUS = new Buff({
    name: `Spectrum Blaster: Attendance Exemption Protocol${rank}`, maxStacks: 3,
    stats: [[Stat.DmgBonus, [8, 10, 12, 14, 16][r]!]], perStack: true,
  });
  return new Weapon({
    weaponType: WeaponType.Pistols, name: `Spectrum Blaster${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: either(onCast(Cast.Intro), onType(Type1.Basic)), buff: ATTENDANCE_EXEMPTION },
      { on: both(onCast(Cast.Basic, Cast.MidAir), onInflict(TUNE_RUPTURE_SHIFTING, TUNE_STRAIN_SHIFTING)), buff: SPECTRUM_CHORUS, to: "team" },
    ],
  });
});

/** Skull Thrasher, Rebecca's sig: Wakeful Loner. +12% ATK flat. Her Intro grants +24% Basic
 *  Attack DMG Bonus for 14s; inflicting Hack - Shifting grants another +12% for 14s (a separate
 *  effect, so the two stack) and hands the whole team +24% ATK for 30s — permanent uptime at that
 *  duration, so it is never taken back off. */
export const SKULL_THRASHER = refinements((r, rank) => {
  const WAKEFUL_LONER_INTRO = new Buff({
    name: `Skull Thrasher: Wakeful Loner (intro)${rank}`,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Type1.Basic]], until: "outro",
  });
  const WAKEFUL_LONER_HACK = new Buff({
    name: `Skull Thrasher: Wakeful Loner (hack)${rank}`,
    stats: [[Stat.DmgBonus, [12, 15, 18, 21, 24][r]!, Type1.Basic]], until: "outro",
  });
  const WAKEFUL_LONER_TEAM = new Buff({
    name: `Skull Thrasher: Wakeful Loner${rank}`,
    stats: [[Stat.BonusAtk, [24, 30, 36, 42, 48][r]!]],
  });
  return new Weapon({
    weaponType: WeaponType.Pistols, name: `Skull Thrasher${rank}`,
    stats: [[Stat.BaseAtk, 500], [Stat.CritDmg, 72], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: onCast(Cast.Intro), buff: WAKEFUL_LONER_INTRO },
      { on: onInflict(TUNE_HACK_SHIFTING), buff: WAKEFUL_LONER_HACK },
      { on: onInflict(TUNE_HACK_SHIFTING), buff: WAKEFUL_LONER_TEAM, to: "team" },
    ],
  });
});

/** Spectral Trigger, Lucy's sig: Sunken Dream. +12% ATK flat. Casting a Resonance Skill grants
 *  +20% Spectro DMG Bonus a stack, up to 2, 14s each — short windows, lost after the outro.
 *  Inflicting Hack - Shifting grants +30% Heavy Attack DMG Amplification for 14s, during which
 *  Heavy Attack DMG ignores 10% of the target's DEF. */
export const SPECTRAL_TRIGGER = refinements((r, rank) => {
  const SUNKEN_DREAM_STACKS = new Buff({
    name: `Spectral Trigger: Sunken Dream (spectro)${rank}`, maxStacks: 2,
    stats: [[Stat.DmgBonus, [20, 25, 30, 35, 40][r]!, Attribute.Spectro]], perStack: true, until: "outro",
  });
  const SUNKEN_DREAM_HACK = new Buff({
    name: `Spectral Trigger: Sunken Dream (heavy)${rank}`, until: "outro",
    stats: [[Stat.Amp, [30, 37.5, 45, 52.5, 60][r]!, Type1.Heavy], [Stat.DefIgnoreNew, [10, 12.5, 15, 17.5, 20][r]!, Type1.Heavy]],
  });
  return new Weapon({
    weaponType: WeaponType.Pistols, name: `Spectral Trigger${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritDmg, 48.6], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: onCast(Cast.Skill), buff: SUNKEN_DREAM_STACKS },
      { on: onInflict(TUNE_HACK_SHIFTING), buff: SUNKEN_DREAM_HACK },
    ],
  });
});
