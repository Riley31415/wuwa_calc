/** Signature Sword weapons, ported to the new engine. Each section is the character it's
 *  signature to; every piece works if equipped on any resonator, not just its own. */
import {
  Buff, Stat, Type1, Cast,
  addStat, stacks, casting, currentAction, revoke, applySelf, stacksOf, applyTeam, lostOnSwap,
} from "../kit.js";

/** Changli's sig, R1: Crimson Phoenix. +12% ATK flat. Resonance Skill cast grants 5 stacks of
 *  Searing Feather outright (up to 14) — the per-hit 0.5s-ICD trickle is skipped, same as every
 *  other ICD-gated stack elsewhere. */
export const BLAZING_BRILLIANCE = new Buff({
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
  // pays off current stacks before revoking on its own outro — apply()'s stacks() would already
  // read 0 by then if the revoke ran first, so both live together here in the right order
  update: () => {
    addStat(Stat.DmgBonus, 4 * stacks(), Type1.Skill);
    if (casting(Cast.Outro)) revoke(SEARING_FEATHER);
  },
});

/** Camellya's sig, R1: Beyond the Cycle. +12% ATK flat. Dealing Basic Attack DMG grants +10%
 *  Basic Attack DMG Bonus for 14s (once per second, up to 3 stacks — the ICD isn't modelled).
 *  The Concerto-consumption half of the passive (+40% Basic DMG for 10s) has no clean trigger in
 *  this engine (Concerto isn't spent per-action) — left unmodelled rather than guessed at. */
export const RED_SPRING = new Buff({
  name: "Red Spring",
  apply: () => {
    addStat(Stat.BaseAtk, 588);
    addStat(Stat.CritRate, 24.3);
    addStat(Stat.BonusAtk, 12);
  },
  update: () => { if (currentAction().type === Type1.Basic) applySelf(RED_SPRING_BASIC); },
});
export const RED_SPRING_BASIC = new Buff({
  name: "Red Spring: Beyond the Cycle", maxStacks: 3,
  update: () => {
    addStat(Stat.DmgBonus, 10 * stacks(), Type1.Basic);
    if (casting(Cast.Outro)) revoke(RED_SPRING_BASIC);
  },
});

/** Brant's sig, R1: Laughter Prevails. +8% Crit Rate flat. Two independent +24% Basic Attack DMG
 *  Bonus instances — Liberation cast grants one (10s), dealing Basic Attack DMG grants the other
 *  (4s); both up at once is +48%, not capped to one. */
export const UNFLICKERING_VALOR = new Buff({
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
  // 10s window, so it still counts on the wearer's own outro (see jinzhou.ts's HERON_HANDOFF)
  convert: () => { if (casting(Cast.Outro)) revoke(LAUGHTER_PREVAILS_LIB); },
});
export const LAUGHTER_PREVAILS_BASIC = new Buff({
  name: "Unflickering Valor: Laughter Prevails (Basic Attack)",
  apply: () => addStat(Stat.DmgBonus, 24, Type1.Basic),
  // 4s window, same reasoning
  convert: () => { if (casting(Cast.Outro)) revoke(LAUGHTER_PREVAILS_BASIC); },
});

/** Qiuyuan's sig, R1: When A Heart Settles. +12% ATK flat; his Intro grants the team +20% Echo
 *  Skill DMG Bonus (team-wide, permanent once granted). Bamboo Cleaver: an Echo Skill cast within
 *  10s of an Intro/Basic Attack grants a stack of +30% Heavy Attack DMG Bonus, up to two — no
 *  literal timer here, so "within 10s" is approximated by staying ready until something other
 *  than Intro/Basic/Echo happens. One buff stores all three states: stack 1 is "ready" (no
 *  bonus), stacks 2-3 are the real Bamboo Cleaver stacks. */
export const EMERALD_SENTENCE = new Buff({
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
/** Lost entirely if switched off field — any inactive action, same as Quietude Within. */
export const BAMBOO_CLEAVER = new Buff({
  name: "Emerald Sentence: Bamboo Cleaver", maxStacks: 3,
  update: () => {
    lostOnSwap();
    if (casting(Cast.Echo)) applySelf(BAMBOO_CLEAVER);
  },
  apply: () => { if (stacks() >= 2) addStat(Stat.DmgBonus, 30 * (stacks() - 1), Type1.Heavy); },
});
