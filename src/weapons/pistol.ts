/** Signature Pistols weapons, ported to the new engine. */
import {
  Buff, Debuff, Weapon, WeaponType, Stat, EnemyStat, Attribute, Type1, Cast,
  addStat, addEnemyStat, applySelf, applyEnemy, applyTeam, isHeld, casting, currentAction, revoke, stacks,
} from "../kit.js";
import { isShifted } from "../tunebreak.js";

/** The Last Dance, Carlotta's sig, R1: Silent Eulogy. +12% ATK flat. Intro/Liberation grants
 *  +48% Resonance Skill DMG Bonus for 5s. */
export const THE_LAST_DANCE = new Weapon({
  weaponType: WeaponType.Pistols,
  name: "The Last Dance",
  apply: () => { addStat(Stat.BaseAtk, 500); addStat(Stat.CritDmg, 72); addStat(Stat.BonusAtk, 12); },
  update: () => { if (casting(Cast.Intro) || casting(Cast.Liberation)) applySelf(SILENT_EULOGY, 1); },
});
export const SILENT_EULOGY = new Buff({
  name: "The Last Dance: Silent Eulogy",
  apply: () => addStat(Stat.DmgBonus, 48, Type1.Skill),
  convert: () => { if (casting(Cast.Outro)) revoke(SILENT_EULOGY); },
});

/** Lux & Umbra, Galbrena's sig, R1: To Fire She Returns. +12% ATK flat. Echo Skill DMG grants
 *  +24% Heavy Attack DMG Amp for 6s; Heavy Attack DMG grants +24% Echo Skill DMG Amp for 6s.
 *  While both are up, dealing DMG ignores 8% DEF. */
export const LUX_UMBRA = new Weapon({
  weaponType: WeaponType.Pistols,
  name: "Lux & Umbra",
  apply: () => {
    addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.BonusAtk, 12);
    if (isHeld(TO_FIRE_SHE_RETURNS_HEAVY) && isHeld(TO_FIRE_SHE_RETURNS_ECHO)) addStat(Stat.DefIgnoreNew, 8);
  },
  update: () => {
    const a = currentAction();
    if (a.type === Type1.Echo) applySelf(TO_FIRE_SHE_RETURNS_HEAVY, 1);
    if (a.type === Type1.Heavy) applySelf(TO_FIRE_SHE_RETURNS_ECHO, 1);
  },
});
export const TO_FIRE_SHE_RETURNS_HEAVY = new Buff({
  name: "Lux & Umbra: To Fire She Returns (heavy)",
  apply: () => addStat(Stat.Amp, 24, Type1.Heavy),
  convert: () => { if (casting(Cast.Outro)) revoke(TO_FIRE_SHE_RETURNS_HEAVY); },
});
export const TO_FIRE_SHE_RETURNS_ECHO = new Buff({
  name: "Lux & Umbra: To Fire She Returns (echo)",
  apply: () => addStat(Stat.Amp, 24, Type1.Echo),
  convert: () => { if (casting(Cast.Outro)) revoke(TO_FIRE_SHE_RETURNS_ECHO); },
});

/** Woodland Aria, Ciaccona's sig, R1: Lingering Summer Tune. +12% ATK flat. Inflicting Aero
 *  Erosion pays +24% Aero DMG Bonus for 10s, and hitting a target that has Aero Erosion shreds
 *  10% of its own Aero RES for 20s. No target-side status tracking here, so the shred rides the
 *  same trigger as the bonus — the cast that inflicts the Erosion is also the one hitting it. */
export const WOODLAND_ARIA = new Weapon({
  weaponType: WeaponType.Pistols,
  name: "Woodland Aria",
  apply: () => { addStat(Stat.BaseAtk, 500); addStat(Stat.CritRate, 36); addStat(Stat.BonusAtk, 12); },
  update: () => {
    if (currentAction().erosion > 0) { applySelf(LINGERING_SUMMER_TUNE, 1); applyEnemy(LINGERING_SUMMER_SHRED, 1); }
  },
});
export const LINGERING_SUMMER_TUNE = new Buff({
  name: "Woodland Aria: Lingering Summer Tune",
  apply: () => addStat(Stat.DmgBonus, 24, Attribute.Aero),
});
export const LINGERING_SUMMER_SHRED = new Debuff({
  name: "Woodland Aria: Lingering Summer Tune",
  apply: () => addEnemyStat(EnemyStat.ResShred, 10, Attribute.Aero),
});

/** Spectrum Blaster, Lynae's sig, R1: Attendance Exemption Protocol. +12% ATK flat. An Intro or
 *  any Basic Attack DMG puts up +36% Basic Attack DMG Bonus for 4s — short and re-applied by most
 *  of her own combo, so it reads as uptime. The second half stacks team-wide off her own Shifting:
 *  each Tune Rupture/Strain - Shifting she inflicts during a Basic Attack is +8% all DMG for the
 *  whole team, 3 stacks, 30s (permanent uptime at that duration, see CLAUDE.md). */
export const SPECTRUM_BLASTER = new Weapon({
  weaponType: WeaponType.Pistols,
  name: "Spectrum Blaster",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.BonusAtk, 12); },
  update: () => {
    const a = currentAction();
    if (casting(Cast.Intro) || a.type === Type1.Basic) applySelf(ATTENDANCE_EXEMPTION, 1);
    if (casting(Cast.Basic) && (a.rupture || a.strain)) applyTeam(SPECTRUM_CHORUS, 1);
  },
});
export const ATTENDANCE_EXEMPTION = new Buff({
  name: "Spectrum Blaster: Attendance Exemption Protocol",
  apply: () => addStat(Stat.DmgBonus, 36, Type1.Basic),
  convert: () => { if (casting(Cast.Outro)) revoke(ATTENDANCE_EXEMPTION); },
});
export const SPECTRUM_CHORUS = new Buff({
  name: "Spectrum Blaster: Attendance Exemption Protocol (team)", maxStacks: 3,
  apply: () => addStat(Stat.DmgBonus, 8 * stacks()),
});
