/** Signature Sword weapons, ported to the new engine. Every piece works if equipped on any
 *  resonator, not just its own. */
import {
  Buff, Weapon, WeaponType, Stat, Type1, Cast,
  addStat, stacks, casting, currentAction, revoke, applySelf, stacksOf, applyTeam, lostOnSwap,
} from "../kit.js";

/** Changli's sig, R1: Crimson Phoenix. +12% ATK flat. Resonance Skill grants 5 stacks of Searing
 *  Feather outright (up to 14) — the per-hit 0.5s-ICD trickle isn't modelled. */
export const BLAZING_BRILLIANCE = new Weapon({
  weaponType: WeaponType.Sword,
  name: "Blazing Brilliance",
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritDmg, 48.6);
    addStat(Stat.BonusAtk, 12);
  },
  update: () => { if (currentAction().type === Type1.Skill) applySelf(SEARING_FEATHER, 5); },
});
export const SEARING_FEATHER = new Buff({
  name: "Blazing Brilliance: Crimson Phoenix", maxStacks: 14,
  // pays off current stacks before revoking — apply()'s stacks() would already read 0 otherwise
  update: () => {
    addStat(Stat.DmgBonus, 4 * stacks(), Type1.Skill);
    if (casting(Cast.Outro)) revoke(SEARING_FEATHER);
  },
});

/** Camellya's sig, R1: Beyond the Cycle. +12% ATK flat. Basic Attack DMG grants +10% Basic DMG
 *  Bonus for 14s, up to 3 stacks (ICD not modelled). The Concerto-consumption half (+40% Basic
 *  DMG for 10s) has no clean trigger here — Concerto isn't spent per-action — left unmodelled. */
export const RED_SPRING = new Weapon({
  weaponType: WeaponType.Sword,
  name: "Red Spring",
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 12);
  },
  update: () => {
    if (currentAction().type === Type1.Basic) applySelf(RED_SPRING_BASIC);
    if (currentAction().concerto < 0) applySelf(RED_SPRING_CONSUME);
  },
});
export const RED_SPRING_BASIC = new Buff({
  name: "Red Spring: Beyond the Cycle", maxStacks: 3,
  apply: () => { addStat(Stat.DmgBonus, 10 * stacks(), Type1.Basic); },
  convert: () => { if (casting(Cast.Outro)) revoke(RED_SPRING_BASIC); },
});
export const RED_SPRING_CONSUME = new Buff({
  name: "Red Spring: Beyond the Cycle (consume)",
  update: () => { lostOnSwap(); },
  apply: () => { addStat(Stat.DmgBonus, 40, Type1.Basic); },
});

/** Brant's sig, R1: Laughter Prevails. +8% Crit Rate flat. Two independent +24% Basic Attack DMG
 *  Bonus instances (Liberation 10s, Basic Attack DMG 4s) — both up at once is +48%, not capped. */
export const UNFLICKERING_VALOR = new Weapon({
  weaponType: WeaponType.Sword,
  name: "Unflickering Valor",
  apply: () => {
    addStat(Stat.BaseAtk, 413);
    addStat(Stat.Er, 77.04);
    addStat(Stat.CritRate, 8);
  },
  update: () => {
    if (casting(Cast.Liberation)) applySelf(LAUGHTER_PREVAILS_LIB);
    if (currentAction().type === Type1.Basic) applySelf(LAUGHTER_PREVAILS_BASIC);
  },
});
export const LAUGHTER_PREVAILS_LIB = new Buff({
  name: "Unflickering Valor: Laughter Prevails (Liberation)",
  apply: () => addStat(Stat.DmgBonus, 24, Type1.Basic),
  convert: () => { if (casting(Cast.Outro)) revoke(LAUGHTER_PREVAILS_LIB); },
});
export const LAUGHTER_PREVAILS_BASIC = new Buff({
  name: "Unflickering Valor: Laughter Prevails (Basic Attack)",
  apply: () => addStat(Stat.DmgBonus, 24, Type1.Basic),
  convert: () => { if (casting(Cast.Outro)) revoke(LAUGHTER_PREVAILS_BASIC); },
});

/** Qiuyuan's sig, R1: When A Heart Settles. +12% ATK flat; his Intro grants the team +20% Echo
 *  Skill DMG Bonus, permanent once granted. Bamboo Cleaver: an Echo Skill cast within 10s of an
 *  Intro/Basic grants a stack (up to two) — no literal timer, so it stays ready until something
 *  else happens. One buff stores all three states: stack 1 is "ready" (no bonus), 2-3 are real. */
export const EMERALD_SENTENCE = new Weapon({
  weaponType: WeaponType.Sword,
  name: "Emerald Sentence",
  apply: () => {
    addStat(Stat.BaseAtk, 587.5);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 12);
  },
  update: () => {
    const a = currentAction();
    if (a.cast === Cast.Intro) applyTeam(HEART_SETTLES_TEAM);
    if ((a.cast === Cast.Intro || a.cast === Cast.Basic) && !stacksOf(BAMBOO_CLEAVER)) {
      applySelf(BAMBOO_CLEAVER);
    }
  },
});
export const HEART_SETTLES_TEAM = new Buff({
  name: "Emerald Sentence: When A Heart Settles",
  apply: () => addStat(Stat.DmgBonus, 20, Type1.Echo),
});
/** Lost entirely if switched off field, same as Quietude Within. */
export const BAMBOO_CLEAVER = new Buff({
  name: "Emerald Sentence: Bamboo Cleaver", maxStacks: 3,
  update: () => {
    lostOnSwap();
    if (casting(Cast.Echo)) applySelf(BAMBOO_CLEAVER);
  },
  apply: () => { if (stacks() >= 2) addStat(Stat.DmgBonus, 30 * (stacks() - 1), Type1.Heavy); },
});
