/** Signature Pistols weapons, ported to the new engine. */
import {
  Buff, Weapon, WeaponType, Stat, Type1, Cast,
  addStat, applySelf, isHeld, casting, currentAction, revoke,
} from "../kit.js";

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
