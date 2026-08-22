/**
 * Standard/f2p weapons, ported to the new engine — no signature character, usable by anyone of
 * the matching weapon type. Three generations, 5 weapons each: Ceaseless Aria (4-star), Stormy
 * Resolution (5-star), and the "new standard" 5-star set.
 *
 * Base ATK is ported via Stat.BaseAtk for fidelity to the source numbers; engine2's own atk
 * formula (core.ts's evaluate()) doesn't fold those contributions into Slot.baseAtk yet — a known
 * engine gap, not a modeling choice made here.
 */
import {
  Buff, Stat, Type1, Cast, AddConcerto,
  addStat, applySelf, isHeld, removeStack, revoke, casting, currentAction, stacks, queueOutro,
} from "../kit.js";

/* ---------------------------------------------------------------- Ceaseless Aria (4-star, 5) */

/** Shared passive of the five standard weapons. Two stacks: 1 is ready (a Skill cast restores
 *  Concerto and promotes to 2), 2 is cooling down (the wielder's own Outro demotes back to 1). */
export const CEASELESS_ARIA = new Buff({
  name: "Ceaseless Aria", maxStacks: 2,
  update: () => {
    if (stacks() === 1 && casting(Cast.Skill)) { applySelf(CEASELESS_ARIA, 1); addStat(AddConcerto, 1600); }
    else if (stacks() === 2 && casting(Cast.Outro)) removeStack(CEASELESS_ARIA, 1);
  },
});

export const VARIATION = new Buff({
  name: "Variation R5",
  apply: () => { addStat(Stat.BaseAtk, 337.5); addStat(Stat.Er, 51.84); },
  update: () => { if (!isHeld(CEASELESS_ARIA)) applySelf(CEASELESS_ARIA, 1); },
});

export const MARCATO = new Buff({
  name: "Marcato R5",
  apply: () => { addStat(Stat.BaseAtk, 338); addStat(Stat.Er, 51.84); },
  update: () => { if (!isHeld(CEASELESS_ARIA)) applySelf(CEASELESS_ARIA, 1); },
});

export const CADENZA = new Buff({
  name: "Cadenza R5",
  apply: () => { addStat(Stat.BaseAtk, 338); addStat(Stat.Er, 51.84); },
  update: () => { if (!isHeld(CEASELESS_ARIA)) applySelf(CEASELESS_ARIA, 1); },
});

export const OVERTURE = new Buff({
  name: "Overture R5",
  apply: () => { addStat(Stat.BaseAtk, 338); addStat(Stat.Er, 51.84); },
  update: () => { if (!isHeld(CEASELESS_ARIA)) applySelf(CEASELESS_ARIA, 1); },
});

export const DISCORD = new Buff({
  name: "Discord R5",
  apply: () => { addStat(Stat.BaseAtk, 338); addStat(Stat.Er, 51.84); },
  update: () => { if (!isHeld(CEASELESS_ARIA)) applySelf(CEASELESS_ARIA, 1); },
});

/* --------------------------------------------------------------- Stormy Resolution (5-star, 5) */

/** Static Mist, R1. Stormy Resolution: +12.8% ER flat. On the wielder's own Outro, hands the
 *  incoming resonator +10% ATK — the outro-handoff buff drops itself on their own outro. */
export const STATIC_MIST = new Buff({
  name: "Static Mist",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.Er, 12.8); },
  update: () => { if (casting(Cast.Outro)) queueOutro(STATIC_MIST_HANDOFF); },
});

export const STATIC_MIST_HANDOFF = new Buff({
  name: "Static Mist: Stormy Resolution",
  apply: () => addStat(Stat.BonusAtk, 10),
  // short window, so it still counts on the wearer's own outro (see jinzhou.ts's HERON_HANDOFF)
  convert: () => { if (casting(Cast.Outro)) revoke(STATIC_MIST_HANDOFF); },
});

/** Emerald of Genesis, R1. Stormy Resolution: +12.8% ER flat. Skill DMG stacks ATK twice over
 *  (6% a stack), lost after the outro action gains stats. */
export const EMERALD_OF_GENESIS = new Buff({
  name: "Emerald of Genesis",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.Er, 12.8); },
  update: () => { if (casting(Cast.Skill)) applySelf(EOG_STACKS, 1); },
});

export const EOG_STACKS = new Buff({
  name: "Emerald of Genesis: Stormy Resolution", maxStacks: 2,
  apply: () => addStat(Stat.BonusAtk, 6 * stacks()),
  convert: () => { if (casting(Cast.Outro)) revoke(EOG_STACKS); },
});

/** Cosmic Ripples, R1. Stormy Resolution: +12.8% ER flat. Basic Attack DMG stacks Basic DMG
 *  Bonus five times over (3.2% a stack), lost after the outro action gains stats. */
export const COSMIC_RIPPLES = new Buff({
  name: "Cosmic Ripples",
  apply: () => { addStat(Stat.BaseAtk, 500); addStat(Stat.BonusAtk, 54); addStat(Stat.Er, 12.8); },
  update: () => { if (currentAction().type === Type1.Basic) applySelf(COSMIC_RIPPLES_STACKS, 1); },
});

export const COSMIC_RIPPLES_STACKS = new Buff({
  name: "Cosmic Ripples: Stormy Resolution", maxStacks: 5,
  apply: () => addStat(Stat.DmgBonus, 3.2 * stacks(), Type1.Basic),
  convert: () => { if (casting(Cast.Outro)) revoke(COSMIC_RIPPLES_STACKS); },
});

/** Abyss Surges, R1. Stormy Resolution: +12.8% ER flat. A Skill hit grants Basic DMG Bonus; a
 *  Basic hit grants Skill DMG Bonus — both lost after the outro action gains stats. */
export const ABYSS_SURGES = new Buff({
  name: "Abyss Surges",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.BonusAtk, 36.45); addStat(Stat.Er, 12.8); },
  update: () => {
    if (currentAction().type === Type1.Skill) applySelf(ABYSS_SKILL_HIT, 1);
    if (currentAction().type === Type1.Basic) applySelf(ABYSS_BASIC_HIT, 1);
  },
});

export const ABYSS_SKILL_HIT = new Buff({
  name: "Abyss Surges: Stormy Resolution",
  apply: () => addStat(Stat.DmgBonus, 10, Type1.Basic),
  convert: () => { if (casting(Cast.Outro)) revoke(ABYSS_SKILL_HIT); },
});

export const ABYSS_BASIC_HIT = new Buff({
  name: "Abyss Surges: Stormy Resolution",
  apply: () => addStat(Stat.DmgBonus, 10, Type1.Skill),
  convert: () => { if (casting(Cast.Outro)) revoke(ABYSS_BASIC_HIT); },
});

/** Lustrous Razor, R1. Stormy Resolution: +12.8% ER flat. Skill cast stacks Liberation DMG
 *  Bonus three times over (7% a stack), lost after the outro action gains stats. */
export const LUSTROUS_RAZOR = new Buff({
  name: "Lustrous Razor",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.BonusAtk, 36.45); addStat(Stat.Er, 12.8); },
  update: () => { if (casting(Cast.Skill)) applySelf(LUSTROUS_RAZOR_STACKS, 1); },
});

export const LUSTROUS_RAZOR_STACKS = new Buff({
  name: "Lustrous Razor: Stormy Resolution", maxStacks: 3,
  apply: () => addStat(Stat.DmgBonus, 7 * stacks(), Type1.Liberation),
  convert: () => { if (casting(Cast.Outro)) revoke(LUSTROUS_RAZOR_STACKS); },
});

/* ------------------------------------------------------------------- new standard (5-star, 5) */

/** Radiance Cleaver, Lupa's f2p alternative. Tune-strained bonus skipped — untracked state. */
export const NEW_STD_BRAUDBLADE = new Buff({
  name: "Radiance Cleaver",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.BonusAtk, 12); },
});

/** Pulsation Bracer, Iuno's f2p alternative. Conversion-stack bonus skipped — untracked state. */
export const NEW_STD_GAUNTLET = new Buff({
  name: "Pulsation Bracer",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.BonusAtk, 12); },
});

/** Laser Shearer, R1: Signal Catcher, +12% ATK flat. Tune Strain half skipped — untracked
 *  enemy state. */
export const NEW_STD_SWORD = new Buff({
  name: "Laser Shearer",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.Er, 38.88); addStat(Stat.BonusAtk, 12); },
});

/** Boson Astrolabe, R1: Path Observer, +12% ATK flat. Only the wielder's own Tune Break cast
 *  procs it — a team-wide trigger would need a global watcher. Proc lost after the outro
 *  action gains stats. */
export const NEW_STD_RECTIFIER = new Buff({
  name: "Boson Astrolabe",
  apply: () => { addStat(Stat.BaseAtk, 525); addStat(Stat.Er, 38.88); addStat(Stat.BonusAtk, 12); },
  update: () => { if (casting(Cast.TuneBreak)) applySelf(PATH_OBSERVER_BUFF, 1); },
});

export const PATH_OBSERVER_BUFF = new Buff({
  name: "Boson Astrolabe: Path Observer",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Type1.Basic); },
  convert: () => { if (casting(Cast.Outro)) revoke(PATH_OBSERVER_BUFF); },
});

/** Phasic Homogenizer, R1: Insight Bearer, +12% ATK flat. Same simplification as Boson
 *  Astrolabe above. */
export const NEW_STD_PISTOL = new Buff({
  name: "Phasic Homogenizer",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.BonusAtk, 12); },
  update: () => { if (casting(Cast.TuneBreak)) applySelf(INSIGHT_BEARER_BUFF, 1); },
});

export const INSIGHT_BEARER_BUFF = new Buff({
  name: "Phasic Homogenizer: Insight Bearer",
  apply: () => addStat(Stat.DmgBonus, 20),
  convert: () => { if (casting(Cast.Outro)) revoke(INSIGHT_BEARER_BUFF); },
});
