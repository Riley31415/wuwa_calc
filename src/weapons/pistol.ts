/** Signature Pistols weapons, ported to the new engine. */
import { isType,
  Buff, Debuff, Weapon, WeaponType, Stat, EnemyStat, Attribute, Type1, Cast,
  addStat, addEnemyStat, applySelf, applyEnemy, applyTeam, isHeld, casting, currentAction, revokeSelf, frozenStacks,
} from "../kit.js";
import { applied } from "../kit.js";
import { AERO_EROSION } from "../statuses.js";
import { TUNE_HACK_SHIFTING, TUNE_RUPTURE_SHIFTING, TUNE_STRAIN_SHIFTING } from "../tunebreak.js";

/** The Last Dance, Carlotta's sig, R1: Silent Eulogy. +12% ATK flat. Intro/Liberation grants
 *  +48% Resonance Skill DMG Bonus for 5s. */
export const THE_LAST_DANCE = new Weapon({
  weaponType: WeaponType.Pistols,
  name: "The Last Dance",
  constantStats: () => { addStat(Stat.BaseAtk, 500); addStat(Stat.CritDmg, 72); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => { if (casting(Cast.Intro) || casting(Cast.Liberation)) applySelf(SILENT_EULOGY, 1); },
});
export const SILENT_EULOGY = new Buff({
  name: "The Last Dance: Silent Eulogy",
  applyStats: () => addStat(Stat.DmgBonus, 48, Type1.Skill),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(SILENT_EULOGY); },
});

/** Lux & Umbra, Galbrena's sig, R1: To Fire She Returns. +12% ATK flat. Echo Skill DMG grants
 *  +24% Heavy Attack DMG Amp for 6s; Heavy Attack DMG grants +24% Echo Skill DMG Amp for 6s.
 *  While both are up, dealing DMG ignores 8% DEF. */
export const LUX_UMBRA = new Weapon({
  weaponType: WeaponType.Pistols,
  name: "Lux & Umbra",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.BonusAtk, 12); },
  applyStats: () => {
    if (isHeld(TO_FIRE_SHE_RETURNS_HEAVY) && isHeld(TO_FIRE_SHE_RETURNS_ECHO)) addStat(Stat.DefIgnoreNew, 8);
  },
  updateBuffs: () => {
    const a = currentAction();
    if (isType(Type1.Echo)) applySelf(TO_FIRE_SHE_RETURNS_HEAVY, 1);
    if (isType(Type1.Heavy)) applySelf(TO_FIRE_SHE_RETURNS_ECHO, 1);
  },
});
export const TO_FIRE_SHE_RETURNS_HEAVY = new Buff({
  name: "Lux & Umbra: To Fire She Returns (heavy)",
  applyStats: () => addStat(Stat.Amp, 24, Type1.Heavy),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(TO_FIRE_SHE_RETURNS_HEAVY); },
});
export const TO_FIRE_SHE_RETURNS_ECHO = new Buff({
  name: "Lux & Umbra: To Fire She Returns (echo)",
  applyStats: () => addStat(Stat.Amp, 24, Type1.Echo),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(TO_FIRE_SHE_RETURNS_ECHO); },
});

/** Woodland Aria, Ciaccona's sig, R1: Lingering Summer Tune. +12% ATK flat. Inflicting Aero
 *  Erosion pays +24% Aero DMG Bonus for 10s, and hitting a target that has Aero Erosion shreds
 *  10% of its own Aero RES for 20s. No target-side status tracking here, so the shred rides the
 *  same trigger as the bonus — the cast that inflicts the Erosion is also the one hitting it. */
export const WOODLAND_ARIA = new Weapon({
  weaponType: WeaponType.Pistols,
  name: "Woodland Aria",
  constantStats: () => { addStat(Stat.BaseAtk, 500); addStat(Stat.CritRate, 36); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => {
    if (applied(AERO_EROSION)) { applySelf(LINGERING_SUMMER_TUNE, 1); applyEnemy(LINGERING_SUMMER_SHRED, 1); }
  },
});
export const LINGERING_SUMMER_TUNE = new Buff({
  name: "Woodland Aria: Lingering Summer Tune",
  applyStats: () => addStat(Stat.DmgBonus, 24, Attribute.Aero),
});
export const LINGERING_SUMMER_SHRED = new Debuff({
  name: "Woodland Aria: Lingering Summer Tune",
  applyStats: () => addEnemyStat(EnemyStat.ResShred, 10, Attribute.Aero),
});

/** Spectrum Blaster, Lynae's sig, R1: Attendance Exemption Protocol. +12% ATK flat. An Intro or
 *  any Basic Attack DMG puts up +36% Basic Attack DMG Bonus for 4s — short and re-applied by most
 *  of her own combo, so it reads as uptime. The second half stacks team-wide off her own Shifting:
 *  each Tune Rupture/Strain - Shifting she inflicts during a Basic Attack is +8% all DMG for the
 *  whole team, 3 frozenStacks, 30s (permanent uptime at that duration, see CLAUDE.md). */
export const SPECTRUM_BLASTER = new Weapon({
  weaponType: WeaponType.Pistols,
  name: "Spectrum Blaster",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => {
    const a = currentAction();
    if (casting(Cast.Intro) || isType(Type1.Basic)) applySelf(ATTENDANCE_EXEMPTION, 1);
    if (casting(Cast.Basic) && (applied(TUNE_RUPTURE_SHIFTING) || applied(TUNE_STRAIN_SHIFTING))) applyTeam(SPECTRUM_CHORUS, 1);
  },
});
export const ATTENDANCE_EXEMPTION = new Buff({
  name: "Spectrum Blaster: Attendance Exemption Protocol",
  applyStats: () => addStat(Stat.DmgBonus, 36, Type1.Basic),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(ATTENDANCE_EXEMPTION); },
});
export const SPECTRUM_CHORUS = new Buff({
  name: "Spectrum Blaster: Attendance Exemption Protocol (team)", maxStacks: 3,
  applyStats: () => addStat(Stat.DmgBonus, 8 * frozenStacks()),
});

/** Skull Thrasher, Rebecca's sig, R1: Wakeful Loner. +12% ATK flat. Her Intro grants +24% Basic
 *  Attack DMG Bonus for 14s; inflicting Hack - Shifting grants another +12% for 14s (a separate
 *  effect, so the two stack) and hands the whole team +24% ATK for 30s — permanent uptime at that
 *  duration, so it is never taken back off. */
export const SKULL_THRASHER = new Weapon({
  weaponType: WeaponType.Pistols,
  name: "Skull Thrasher",
  constantStats: () => { addStat(Stat.BaseAtk, 500); addStat(Stat.CritDmg, 72); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => {
    if (casting(Cast.Intro)) applySelf(WAKEFUL_LONER_INTRO, 1);
    if (applied(TUNE_HACK_SHIFTING)) { applySelf(WAKEFUL_LONER_HACK, 1); applyTeam(WAKEFUL_LONER_TEAM, 1); }
  },
});
export const WAKEFUL_LONER_INTRO = new Buff({
  name: "Skull Thrasher: Wakeful Loner (intro)",
  applyStats: () => addStat(Stat.DmgBonus, 24, Type1.Basic),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(WAKEFUL_LONER_INTRO); },
});
export const WAKEFUL_LONER_HACK = new Buff({
  name: "Skull Thrasher: Wakeful Loner (hack)",
  applyStats: () => addStat(Stat.DmgBonus, 12, Type1.Basic),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(WAKEFUL_LONER_HACK); },
});
export const WAKEFUL_LONER_TEAM = new Buff({
  name: "Skull Thrasher: Wakeful Loner (team)",
  applyStats: () => addStat(Stat.BonusAtk, 24),
});

/** Spectral Trigger, Lucy's sig, R1: Sunken Dream. +12% ATK flat. Casting a Resonance Skill grants
 *  +20% Spectro DMG Bonus a stack, up to 2, 14s each — short windows, lost after the outro.
 *  Inflicting Hack - Shifting grants +30% Heavy Attack DMG Amplification for 14s, during which
 *  Heavy Attack DMG ignores 10% of the target's DEF. */
export const SPECTRAL_TRIGGER = new Weapon({
  weaponType: WeaponType.Pistols,
  name: "Spectral Trigger",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => {
    if (casting(Cast.Skill)) applySelf(SUNKEN_DREAM_STACKS, 1);
    if (applied(TUNE_HACK_SHIFTING)) applySelf(SUNKEN_DREAM_HACK, 1);
  },
});
export const SUNKEN_DREAM_STACKS = new Buff({
  name: "Spectral Trigger: Sunken Dream (spectro)", maxStacks: 2,
  applyStats: () => addStat(Stat.DmgBonus, 20 * frozenStacks(), Attribute.Spectro),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(SUNKEN_DREAM_STACKS); },
});
export const SUNKEN_DREAM_HACK = new Buff({
  name: "Spectral Trigger: Sunken Dream (heavy)",
  applyStats: () => { addStat(Stat.Amp, 30, Type1.Heavy); addStat(Stat.DefIgnoreNew, 10, Type1.Heavy); },
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(SUNKEN_DREAM_HACK); },
});
