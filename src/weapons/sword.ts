/** Signature Sword weapons, ported to the new engine. Every piece works if equipped on any
 *  resonator, not just its own. */
import { isType,
  Buff, Weapon, WeaponType, Stat, Attribute, Type1, Cast,
  addStat, frozenStacks, casting, currentAction, revokeSelf, applySelf, stacksOf, applyTeam, lostOnSwap, applied,
} from "../kit.js";
import { TUNE_STRAIN_SHIFTING } from "../tunebreak.js";

/** Changli's sig, R1: Crimson Phoenix. +12% ATK flat. Resonance Skill grants 5 stacks of Searing
 *  Feather outright (up to 14) — the per-hit 0.5s-ICD trickle isn't modelled. */
export const BLAZING_BRILLIANCE = new Weapon({
  weaponType: WeaponType.Sword,
  name: "Blazing Brilliance",
  constantStats: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritDmg, 48.6);
    addStat(Stat.BonusAtk, 12);
  },
  updateBuffs: () => { if (isType(Type1.Skill)) applySelf(SEARING_FEATHER, 5); },
});
export const SEARING_FEATHER = new Buff({
  name: "Blazing Brilliance: Crimson Phoenix", maxStacks: 14,
  // pays off current stacks before revoking — applyStats()'s frozenStacks() would already read 0 otherwise
  updateBuffs: () => {
    addStat(Stat.DmgBonus, 4 * frozenStacks(), Type1.Skill);
    if (casting(Cast.Outro)) revokeSelf(SEARING_FEATHER);
  },
});

/** Camellya's sig, R1: Beyond the Cycle. +12% ATK flat. Basic Attack DMG grants +10% Basic DMG
 *  Bonus for 14s, up to 3 stacks (ICD not modelled). The Concerto-consumption half (+40% Basic
 *  DMG for 10s) has no clean trigger here — Concerto isn't spent per-action — left unmodelled. */
export const RED_SPRING = new Weapon({
  weaponType: WeaponType.Sword,
  name: "Red Spring",
  constantStats: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 12);
  },
  updateBuffs: () => {
    if (isType(Type1.Basic)) applySelf(RED_SPRING_BASIC);
    if (currentAction().concerto < 0) applySelf(RED_SPRING_CONSUME);
  },
});
export const RED_SPRING_BASIC = new Buff({
  name: "Red Spring: Beyond the Cycle", maxStacks: 3,
  applyStats: () => { addStat(Stat.DmgBonus, 10 * frozenStacks(), Type1.Basic); },
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(RED_SPRING_BASIC); },
});
export const RED_SPRING_CONSUME = new Buff({
  name: "Red Spring: Beyond the Cycle (consume)",
  updateBuffs: () => { lostOnSwap(); },
  applyStats: () => { addStat(Stat.DmgBonus, 40, Type1.Basic); },
});

/** Brant's sig, R1: Laughter Prevails. +8% Crit Rate flat. Two independent +24% Basic Attack DMG
 *  Bonus instances (Liberation 10s, Basic Attack DMG 4s) — both up at once is +48%, not capped. */
export const UNFLICKERING_VALOR = new Weapon({
  weaponType: WeaponType.Sword,
  name: "Unflickering Valor",
  constantStats: () => {
    addStat(Stat.BaseAtk, 413);
    addStat(Stat.Er, 77.04);
    addStat(Stat.CritRate, 8);
  },
  updateBuffs: () => {
    if (casting(Cast.Liberation)) applySelf(LAUGHTER_PREVAILS_LIB);
    if (isType(Type1.Basic)) applySelf(LAUGHTER_PREVAILS_BASIC);
  },
});
export const LAUGHTER_PREVAILS_LIB = new Buff({
  name: "Unflickering Valor: Laughter Prevails (Liberation)",
  applyStats: () => addStat(Stat.DmgBonus, 24, Type1.Basic),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(LAUGHTER_PREVAILS_LIB); },
});
export const LAUGHTER_PREVAILS_BASIC = new Buff({
  name: "Unflickering Valor: Laughter Prevails (Basic Attack)",
  applyStats: () => addStat(Stat.DmgBonus, 24, Type1.Basic),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(LAUGHTER_PREVAILS_BASIC); },
});

/** Qiuyuan's sig, R1: When A Heart Settles. +12% ATK flat; his Intro grants the team +20% Echo
 *  Skill DMG Bonus, permanent once granted. Bamboo Cleaver: an Echo Skill cast within 10s of an
 *  Intro/Basic grants a stack (up to two) — no literal timer, so it stays ready until something
 *  else happens. One buff stores all three states: stack 1 is "ready" (no bonus), 2-3 are real. */
export const EMERALD_SENTENCE = new Weapon({
  weaponType: WeaponType.Sword,
  name: "Emerald Sentence",
  constantStats: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 12);
  },
  updateBuffs: () => {
    if (casting(Cast.Intro)) applyTeam(HEART_SETTLES_TEAM);
    if ((casting(Cast.Intro) || casting(Cast.Basic)) && !stacksOf(BAMBOO_CLEAVER)) {
      applySelf(BAMBOO_CLEAVER);
    }
  },
});
export const HEART_SETTLES_TEAM = new Buff({
  name: "Emerald Sentence: When A Heart Settles",
  applyStats: () => addStat(Stat.DmgBonus, 20, Type1.Echo),
});
/** Lost entirely if switched off field, same as Quietude Within. */
export const BAMBOO_CLEAVER = new Buff({
  name: "Emerald Sentence: Bamboo Cleaver", maxStacks: 3,
  updateBuffs: () => {
    lostOnSwap();
    if (casting(Cast.Echo)) applySelf(BAMBOO_CLEAVER);
  },
  applyStats: () => { if (frozenStacks() >= 2) addStat(Stat.DmgBonus, 30 * (frozenStacks() - 1), Type1.Heavy); },
});

/** Glint of Clouds, Qingxiao's sig, R1: Evil's Scourge. +12% ATK flat. Inflicting Tune Strain -
 *  Shifting grants +11.2% Aero DMG Bonus a stack, up to 5, 2s each (once per 0.5s) — short, but
 *  every cast of hers re-inflicts, so it climbs straight to five and stays: at max the window
 *  becomes 30s (permanent uptime) and her Aero DMG ignores 10% of the target's DEF. Short of
 *  five it's lost after the outro. */
export const GLINT_OF_CLOUDS = new Weapon({
  weaponType: WeaponType.Sword,
  name: "Glint of Clouds",
  constantStats: () => { addStat(Stat.BaseAtk, 500); addStat(Stat.CritRate, 36); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => { if (applied(TUNE_STRAIN_SHIFTING)) applySelf(EVILS_SCOURGE, 1); },
});
export const EVILS_SCOURGE = new Buff({
  name: "Glint of Clouds: Evil's Scourge", maxStacks: 5,
  applyStats: () => {
    addStat(Stat.DmgBonus, 11.2 * frozenStacks(), Attribute.Aero);
    if (frozenStacks() >= 5) addStat(Stat.DefIgnoreNew, 10, Attribute.Aero);
  },
  convertStats: () => { if (casting(Cast.Outro) && frozenStacks() < 5) revokeSelf(EVILS_SCOURGE); },
});
