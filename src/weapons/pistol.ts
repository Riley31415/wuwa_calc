/**
 * Signature Pistols weapons, ported to the new engine — grouped by weapon type rather than
 * version (see weapons_standard.ts for the non-signature, any-type-usable weapons).
 *
 * Base ATK is ported via Stat.BaseAtk for fidelity to the source numbers; see the note at the
 * top of weapons_standard.ts — engine2's own atk formula doesn't fold those contributions in yet.
 */
import {
  Buff, Stat, Type1, Cast,
  addStat, applySelf, isHeld, casting, currentAction, revoke,
} from "../kit.js";

/** The Last Dance, Carlotta's signature, R1: Silent Eulogy. +12% ATK flat. Intro or Liberation
 *  cast grants +48% Resonance Skill DMG Bonus for 5s — short enough that only the standing
 *  outro-loss rule matters. Carlotta, character 1107, released 2.0 —
 *  https://ww.nanoka.cc/character/1107, https://ww.nanoka.cc/weapon/21030016 */
export const THE_LAST_DANCE = new Buff({
  name: "The Last Dance",
  apply: () => { addStat(Stat.BaseAtk, 500); addStat(Stat.CritDmg, 72); addStat(Stat.BonusAtk, 12); },
  update: () => { if (casting(Cast.Intro) || casting(Cast.Liberation)) applySelf(SILENT_EULOGY, 1); },
});
export const SILENT_EULOGY = new Buff({
  name: "The Last Dance: Silent Eulogy",
  apply: () => addStat(Stat.DmgBonus, 48, Type1.Skill),
  // short window, so it still counts on the wearer's own outro (see jinzhou.ts's HERON_HANDOFF)
  convert: () => { if (casting(Cast.Outro)) revoke(SILENT_EULOGY); },
});

/** Lux & Umbra, Galbrena's signature, R1: To Fire She Returns. +12% ATK flat. Dealing Echo
 *  Skill DMG grants +24% Heavy Attack DMG Amplification for 6s; dealing Heavy Attack DMG grants
 *  +24% Echo Skill DMG Amplification for 6s — both short enough that only the standing
 *  outro-loss rule matters. While both are up, dealing DMG ignores 8% DEF. Galbrena, character
 *  1208, released 2.7 — https://ww.nanoka.cc/character/1208,
 *  https://ww.nanoka.cc/weapon/21030036 */
export const LUX_UMBRA = new Buff({
  name: "Lux & Umbra",
  apply: () => {
    addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.BonusAtk, 12);
    if (isHeld(TO_FIRE_SHE_RETURNS_HEAVY) && isHeld(TO_FIRE_SHE_RETURNS_ECHO)) addStat(Stat.DefIgnore, 8);
  },
  update: () => {
    const a = currentAction();
    if (a.type === Type1.Echo) applySelf(TO_FIRE_SHE_RETURNS_HEAVY, 1);
    if (a.type === Type1.Heavy) applySelf(TO_FIRE_SHE_RETURNS_ECHO, 1);
  },
});
export const TO_FIRE_SHE_RETURNS_HEAVY = new Buff({
  name: "Lux & Umbra: To Fire She Returns (Heavy)",
  apply: () => addStat(Stat.Amp, 24, Type1.Heavy),
  convert: () => { if (casting(Cast.Outro)) revoke(TO_FIRE_SHE_RETURNS_HEAVY); },
});
export const TO_FIRE_SHE_RETURNS_ECHO = new Buff({
  name: "Lux & Umbra: To Fire She Returns (Echo)",
  apply: () => addStat(Stat.Amp, 24, Type1.Echo),
  convert: () => { if (casting(Cast.Outro)) revoke(TO_FIRE_SHE_RETURNS_ECHO); },
});
