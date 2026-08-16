/** Standard/f2p weapons — usable by more than one resonator, so they live apart from any one
 *  resonator's file. Each resonator's own file picks which of these its f2p loadout equips. */
import {
  add, action, gain, revoke, removeStack, stacksOf, grantSelf,
  isOutro, isSkill, isTuneBreak, outro,
} from "../state.js";
import { Buff, Gear, PRIORITY } from "../kit.js";
import { Stat, DamageType, Resource } from "../stats.js";

/** Ceaseless Aria — the six standard weapons' shared passive. One buff, two stacks: 1 is
 *  ready (a Skill cast restores Concerto and promotes to 2), 2 is cooling down (an Outro
 *  demotes back to 1). */
export const CEASELESS_ARIA = new Buff(PRIORITY.UPDATE_BUFFS, () => {
  const held = stacksOf(CEASELESS_ARIA);
  if (held === 1 && isSkill(action()!)) {
    gain(Resource.Concerto, 16);   // R5; R1 restores 8
    grantSelf(CEASELESS_ARIA);
  } else if (held === 2 && isOutro(action()!)) {
    removeStack(CEASELESS_ARIA, 1);
  }
  return held === 1 ? "Ceaseless Aria" : "Ceaseless Aria (cooldown)";
}, 2);

export const VARIATION = new Gear(() => {
  add(337.5, Stat.BaseAtk);
  add(51.84, Stat.Er);
  return "Variation R5";
}, () => { grantSelf(CEASELESS_ARIA); });

export const MARCATO = new Gear(() => {
  add(338, Stat.BaseAtk);
  add(51.84, Stat.Er);
  return "Marcato R5";
}, () => { grantSelf(CEASELESS_ARIA); });

export const CADENZA = new Gear(() => {
  add(338, Stat.BaseAtk);
  add(51.84, Stat.Er);
  return "Cadenza R5";
}, () => { grantSelf(CEASELESS_ARIA); });

export const OVERTURE = new Gear(() => {
  add(338, Stat.BaseAtk);
  add(51.84, Stat.Er);
  return "Overture R5";
}, () => { grantSelf(CEASELESS_ARIA); });

export const DISCORD = new Gear(() => {
  add(338, Stat.BaseAtk);
  add(51.84, Stat.Er);
  return "Discord R5";
}, () => { grantSelf(CEASELESS_ARIA); });

/** Static Mist, R1. Stormy Resolution: +12.8% ER flat. On the wielder's outro, hands the
 *  incoming resonator +10% ATK — the outro-handoff queue expires it on their own outro. */
export const STATIC_MIST = new Gear(() => {
  add(587.5, Stat.BaseAtk);
  add(24.3, Stat.CritRate);
  add(12.8, Stat.Er);
  if (isOutro(action()!)) outro(STATIC_MIST_HANDOFF);
  return "Static Mist";
});

export const STATIC_MIST_HANDOFF = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  if (isOutro(a)) revoke(STATIC_MIST_HANDOFF);
  add(10, Stat.BonusAtk);
  return "Static Mist: Stormy Resolution";
});

/** Emerald of Genesis, R1. Stormy Resolution: +12.8% ER flat. Skill DMG stacks ATK twice over
 *  (6% a stack), lost after the outro action gains stats. */
export const EMERALD_OF_GENESIS = new Gear(() => {
  add(587.5, Stat.BaseAtk);
  add(24.3, Stat.CritRate);
  add(12.8, Stat.Er);
  if (isSkill(action()!)) grantSelf(EOG_STACKS);
  return "Emerald of Genesis";
});

export const EOG_STACKS = new Buff(PRIORITY.BUFF_STATS, () => {
  const held = stacksOf(EOG_STACKS);
  add(6 * held, Stat.BonusAtk);
  if (isOutro(action()!)) revoke(EOG_STACKS);
  return `Emerald of Genesis: Stormy Resolution x${held}`;
}, 2);

/** Cosmic Ripples, R1. Stormy Resolution: +12.8% ER flat. Basic Attack DMG stacks Basic DMG
 *  Bonus five times over (3.2% a stack), lost after the outro action gains stats. */
export const COSMIC_RIPPLES = new Gear(() => {
  add(500, Stat.BaseAtk);
  add(54, Stat.BonusAtk);
  add(12.8, Stat.Er);
  if (action()!.type === DamageType.Basic) grantSelf(COSMIC_RIPPLES_STACKS);
  return "Cosmic Ripples";
});

export const COSMIC_RIPPLES_STACKS = new Buff(PRIORITY.BUFF_STATS, () => {
  const held = stacksOf(COSMIC_RIPPLES_STACKS);
  add(3.2 * held, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(action()!)) revoke(COSMIC_RIPPLES_STACKS);
  return `Cosmic Ripples: Stormy Resolution x${held}`;
}, 5);

/** Abyss Surges, R1. Stormy Resolution: +12.8% ER flat. A Skill hit grants Basic DMG Bonus; a
 *  Basic hit grants Skill DMG Bonus — both lost after the outro action gains stats. */
export const ABYSS_SURGES = new Gear(() => {
  add(587.5, Stat.BaseAtk);
  add(36.45, Stat.BonusAtk);
  add(12.8, Stat.Er);
  if (action()!.type === DamageType.Skill) grantSelf(ABYSS_SKILL_HIT);
  if (action()!.type === DamageType.Basic) grantSelf(ABYSS_BASIC_HIT);
  return "Abyss Surges";
});

export const ABYSS_SKILL_HIT = new Buff(PRIORITY.BUFF_STATS, () => {
  add(10, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(action()!)) revoke(ABYSS_SKILL_HIT);
  return "Abyss Surges: Stormy Resolution";
});

export const ABYSS_BASIC_HIT = new Buff(PRIORITY.BUFF_STATS, () => {
  add(10, DamageType.Skill, Stat.DmgBonus);
  if (isOutro(action()!)) revoke(ABYSS_BASIC_HIT);
  return "Abyss Surges: Stormy Resolution";
});

/** Lustrous Razor, R1. Stormy Resolution: +12.8% ER flat. Skill cast stacks Liberation DMG
 *  Bonus three times over (7% a stack), lost after the outro action gains stats. */
export const LUSTROUS_RAZOR = new Gear(() => {
  add(587.5, Stat.BaseAtk);
  add(36.45, Stat.BonusAtk);
  add(12.8, Stat.Er);
  if (isSkill(action()!)) grantSelf(LUSTROUS_RAZOR_STACKS);
  return "Lustrous Razor";
});

export const LUSTROUS_RAZOR_STACKS = new Buff(PRIORITY.BUFF_STATS, () => {
  const held = stacksOf(LUSTROUS_RAZOR_STACKS);
  add(7 * held, DamageType.Liberation, Stat.DmgBonus);
  if (isOutro(action()!)) revoke(LUSTROUS_RAZOR_STACKS);
  return `Lustrous Razor: Stormy Resolution x${held}`;
}, 3);

/** Radiance Cleaver, Lupa's f2p alternative. Tune-strained bonus skipped — untracked state. */
export const NEW_STD_BRAUDBLADE = new Gear(() => {
  add(587.5, Stat.BaseAtk);
  add(48.6, Stat.CritDmg);
  add(12, Stat.BonusAtk);
  return "Radiance Cleaver";
});

/** Pulsation Bracer, Iuno's f2p alternative. Conversion-stack bonus skipped — untracked state. */
export const NEW_STD_GAUNTLET = new Gear(() => {
  add(587.5, Stat.BaseAtk);
  add(24.3, Stat.CritRate);
  add(12, Stat.BonusAtk);
  return "Pulsation Bracer";
});

/** Laser Shearer, R1: Signal Catcher, +12% ATK flat. Tune Strain half skipped — untracked
 *  enemy state. */
export const NEW_STD_SWORD = new Gear(() => {
  add(587.5, Stat.BaseAtk);
  add(38.88, Stat.Er);
  add(12, Stat.BonusAtk);
  return "Laser Shearer";
});

/** Boson Astrolabe, R1: Path Observer, +12% ATK flat. Only the wielder's own Tune Break cast
 *  procs it — a team-wide trigger would need a global watcher. Proc lost after the outro
 *  action gains stats. */
export const NEW_STD_RECTIFIER = new Gear(() => {
  add(525, Stat.BaseAtk);
  add(38.88, Stat.Er);
  add(12, Stat.BonusAtk);
  if (isTuneBreak(action()!)) grantSelf(PATH_OBSERVER_BUFF);
  return "Boson Astrolabe";
});

export const PATH_OBSERVER_BUFF = new Buff(PRIORITY.BUFF_STATS, () => {
  add(12, Stat.BonusAtk);
  add(12, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(action()!)) revoke(PATH_OBSERVER_BUFF);
  return "Boson Astrolabe: Path Observer";
});

/** Phasic Homogenizer, R1: Insight Bearer, +12% ATK flat. Same simplification as Boson
 *  Astrolabe above. */
export const NEW_STD_PISTOL = new Gear(() => {
  add(587.5, Stat.BaseAtk);
  add(48.6, Stat.CritDmg);
  add(12, Stat.BonusAtk);
  if (isTuneBreak(action()!)) grantSelf(INSIGHT_BEARER_BUFF);
  return "Phasic Homogenizer";
});

export const INSIGHT_BEARER_BUFF = new Buff(PRIORITY.BUFF_STATS, () => {
  add(20, Stat.DmgBonus);
  if (isOutro(action()!)) revoke(INSIGHT_BEARER_BUFF);
  return "Phasic Homogenizer: Insight Bearer";
});

/** Stringmaster, R1: Electric Amplification. +12% Attribute DMG Bonus flat (unscoped — "all
 *  attribute" isn't the wielder's own element), +12% ATK on any inactive action. Skill DMG
 *  stacks ATK twice over (12% a stack), lost after the outro action gains stats. */
export const STRINGMASTER = new Gear(() => {
  add(500, Stat.BaseAtk);
  add(36, Stat.CritRate);
  add(12, Stat.DmgBonus);
  if (action()!.type === DamageType.Skill) grantSelf(STRINGMASTER_STACKS);
  return "Stringmaster";
});

export const STRINGMASTER_STACKS = new Buff(PRIORITY.BUFF_STATS, () => {
  if (!action()!.active) add(12, Stat.BonusAtk);
  const held = stacksOf(STRINGMASTER_STACKS);
  add(12 * held, Stat.BonusAtk);
  if (isOutro(action()!)) revoke(STRINGMASTER_STACKS);
  return `Stringmaster: Electric Amplification x${held}`;
}, 2);
