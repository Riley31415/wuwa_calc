/** Standard/f2p weapons, ported to the new engine — no signature character, usable by anyone of
 *  the matching weapon type. Three generations, 5 weapons each: Ceaseless Aria (4-star), Stormy
 *  Resolution (5-star), and the "new standard" 5-star set. */
import { isType,
  Buff, Weapon, WeaponType, Stat, Type1, Cast, Attribute,
  addStat, applyCurrent, isHeld, removeStack, revokeCurrent, casting, currentAction, frozenStacks, queueOutro, stacksOfEnemy,
} from "../kit.js";
import { applied } from "../kit.js";
import { HEALS } from "../shared/status.js";
import { TUNE_STRAIN_INTERFERED } from "../shared/tunebreak.js";

/* ---------------------------------------------------------------- Ceaseless Aria (4-star, 5) */

/** One Ceaseless Aria instance a weapon, so each carries its own name for attribution. Granted
 *  on the wielder's first Resonance Skill cast (restoring Concerto) and promoted to cooldown the
 *  same action; a repeat cast on cooldown does nothing. Lost entirely on the wielder's Outro. */
function ceaselessAria(name: string): Buff {
  const buff: Buff = new Buff({
    name: `${name}: Ceaseless Aria R5`, maxStacks: 2,
    applyStats: () => {
      if (frozenStacks() === 1 && casting(Cast.Skill)) { applyCurrent(buff, 1); addStat(Stat.AddConcerto, 16); }
      else if (frozenStacks() === 2 && casting(Cast.Outro)) removeStack(buff, 2);
    },
    display: () => `${name}: Ceaseless Aria R5${frozenStacks() === 1 ? "" : " (cooldown)"}`,
  });
  return buff;
}

/** The five standard weapons — identical stats and behavior, only the name differs. */
function concertoWeapon(name: string, weaponType: WeaponType): Weapon {
  const aria = ceaselessAria(name);
  return new Weapon({
    weaponType,
    standard: true,
    name: `${name} R5`,
    constantStats: () => { addStat(Stat.BaseAtk, 337.5); addStat(Stat.Er, 51.84); },
    updateBuffs: () => { if (casting(Cast.Skill)) applyCurrent(aria, 1); },
  });
}

export const VARIATION = concertoWeapon("Variation", WeaponType.Rectifier);
export const MARCATO = concertoWeapon("Marcato", WeaponType.Gauntlets);
export const CADENZA = concertoWeapon("Cadenza", WeaponType.Pistols);
export const OVERTURE = concertoWeapon("Overture", WeaponType.Sword);
export const DISCORD = concertoWeapon("Discord", WeaponType.Broadblade);

/* --------------------------------------------------------------- Stormy Resolution (5-star, 5) */

/** Static Mist, R1. +12.8% ER flat. On the wielder's own Outro, hands the incoming resonator +10% ATK. */
export const STATIC_MIST = new Weapon({
  weaponType: WeaponType.Pistols,
  standard: true,
  name: "Static Mist",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.Er, 12.8); },
  updateBuffs: () => { if (casting(Cast.Outro)) queueOutro(STATIC_MIST_HANDOFF); },
});

export const STATIC_MIST_HANDOFF = new Buff({
  name: "Static Mist: Stormy Resolution",
  applyStats: () => addStat(Stat.BonusAtk, 10),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(STATIC_MIST_HANDOFF); },
});

/** Emerald of Genesis, R1. +12.8% ER flat. Skill DMG stacks ATK twice over (6% a stack). */
export const EMERALD_OF_GENESIS = new Weapon({
  weaponType: WeaponType.Sword,
  standard: true,
  name: "Emerald of Genesis",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.Er, 12.8); },
  updateBuffs: () => { if (casting(Cast.Skill)) applyCurrent(EOG_STACKS, 1); },
});

export const EOG_STACKS = new Buff({
  name: "Emerald of Genesis: Stormy Resolution", maxStacks: 2,
  applyStats: () => addStat(Stat.BonusAtk, 6 * frozenStacks()),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(EOG_STACKS); },
});

/** Cosmic Ripples, R1. +12.8% ER flat. Basic Attack DMG stacks Basic DMG Bonus 5x over (3.2% a stack). */
export const COSMIC_RIPPLES = new Weapon({
  weaponType: WeaponType.Rectifier,
  standard: true,
  name: "Cosmic Ripples",
  constantStats: () => { addStat(Stat.BaseAtk, 500); addStat(Stat.BonusAtk, 54); addStat(Stat.Er, 12.8); },
  updateBuffs: () => { if (isType(Type1.Basic)) applyCurrent(COSMIC_RIPPLES_STACKS, 1); },
});

export const COSMIC_RIPPLES_STACKS = new Buff({
  name: "Cosmic Ripples: Stormy Resolution", maxStacks: 5,
  applyStats: () => addStat(Stat.DmgBonus, 3.2 * frozenStacks(), Type1.Basic),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(COSMIC_RIPPLES_STACKS); },
});

/** Abyss Surges, R1. +12.8% ER flat. A Skill hit grants Basic DMG Bonus; a Basic hit grants
 *  Skill DMG Bonus. */
export const ABYSS_SURGES = new Weapon({
  weaponType: WeaponType.Gauntlets,
  standard: true,
  name: "Abyss Surges",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.BonusAtk, 36.45); addStat(Stat.Er, 12.8); },
  updateBuffs: () => {
    if (isType(Type1.Skill)) applyCurrent(ABYSS_SKILL_HIT, 1);
    if (isType(Type1.Basic)) applyCurrent(ABYSS_BASIC_HIT, 1);
  },
});

export const ABYSS_SKILL_HIT = new Buff({
  name: "Abyss Surges: Stormy Resolution",
  applyStats: () => addStat(Stat.DmgBonus, 10, Type1.Basic),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(ABYSS_SKILL_HIT); },
});

export const ABYSS_BASIC_HIT = new Buff({
  name: "Abyss Surges: Stormy Resolution",
  applyStats: () => addStat(Stat.DmgBonus, 10, Type1.Skill),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(ABYSS_BASIC_HIT); },
});

/** Lustrous Razor, R1. +12.8% ER flat. Skill cast stacks Liberation DMG Bonus 3x over (7% a stack). */
export const LUSTROUS_RAZOR = new Weapon({
  weaponType: WeaponType.Broadblade,
  standard: true,
  name: "Lustrous Razor",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.BonusAtk, 36.45); addStat(Stat.Er, 12.8); },
  updateBuffs: () => { if (casting(Cast.Skill)) applyCurrent(LUSTROUS_RAZOR_STACKS, 1); },
});

export const LUSTROUS_RAZOR_STACKS = new Buff({
  name: "Lustrous Razor: Stormy Resolution", maxStacks: 3,
  applyStats: () => addStat(Stat.DmgBonus, 7 * frozenStacks(), Type1.Liberation),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(LUSTROUS_RAZOR_STACKS); },
});

/* ------------------------------------------------------------------- new standard (5-star, 5) */

/** The five new-standard weapons all key off the Tune Break system (see tunebreak.ts). Three pay
 *  off *hitting* a target under Tune Strain - Interfered — 3s windows that every hit retriggers,
 *  so they hold for as long as the wielder keeps swinging at an Interfered target, and go after
 *  the outro like any other short self buff. Two pay off *any team member's* Tune Break cast, so
 *  they watch from updateGlobal() rather than the wielder's own turns. */

/** Whether the action being evaluated is the wielder's own hit on a Tune Strain - Interfered
 *  target — what Radiance Cleaver, Laser Shearer and Pulsation Bracer all trigger on. */
const hitInterfered = (): boolean => currentAction().mv > 0 && stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0;

/** Radiance Cleaver, R1: Edge Breaker, +12% ATK flat. Hitting a Tune Strain - Interfered target
 *  grants +24% Resonance Liberation DMG Bonus for 3s, retriggered by every hit. */
export const NEW_STD_BRAUDBLADE = new Weapon({
  weaponType: WeaponType.Broadblade,
  standard: true,
  name: "Radiance Cleaver",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => { if (hitInterfered()) applyCurrent(EDGE_BREAKER_BUFF, 1); },
});
export const EDGE_BREAKER_BUFF = new Buff({
  name: "Radiance Cleaver: Edge Breaker",
  applyStats: () => addStat(Stat.DmgBonus, 24, Type1.Liberation),
});

/** Pulsation Bracer, R1: Barrier Breacher, +12% ATK flat. Hitting a Tune Strain - Interfered target
 *  grants +6% Basic Attack DMG Bonus a stack, up to 4, 3s, retriggered by every hit — the once-per-
 *  0.5s limit is one stack per action here. */
export const NEW_STD_GAUNTLET = new Weapon({
  weaponType: WeaponType.Gauntlets,
  standard: true,
  name: "Pulsation Bracer",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => { if (hitInterfered()) applyCurrent(BARRIER_BREACHER_STACKS, 1); },
});
export const BARRIER_BREACHER_STACKS = new Buff({
  name: "Pulsation Bracer: Barrier Breacher", maxStacks: 4,
  applyStats: () => addStat(Stat.DmgBonus, 6 * frozenStacks(), Type1.Basic),
});

/** Laser Shearer, R1: Signal Catcher, +12% ATK flat. Hitting a Tune Strain - Interfered target
 *  grants +24% Resonance Skill DMG Bonus for 3s, retriggered by every hit. */
export const NEW_STD_SWORD = new Weapon({
  weaponType: WeaponType.Sword,
  standard: true,
  name: "Laser Shearer",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.Er, 38.88); addStat(Stat.BonusAtk, 12); },
  updateBuffs: () => { if (hitInterfered()) applyCurrent(SIGNAL_CATCHER_BUFF, 1); },
});
export const SIGNAL_CATCHER_BUFF = new Buff({
  name: "Laser Shearer: Signal Catcher",
  applyStats: () => addStat(Stat.DmgBonus, 24, Type1.Skill),
});

/** Bloodpact's Pledge R5: Harmonious Vibrancy. +38.88% ER flat. Providing healing pays the wielder
 *  +26% Resonance Skill DMG Bonus for 6s — that half works for anyone, so it lives here. The other
 *  half names Rover: Aero's own Unbound Flow outright, so its trigger lives in their kit file
 *  instead (rover_aero.ts's own updateBuffs(), gated on holding this weapon): importing those two
 *  actions here would make weapons/standard.ts and resonators/aero/rover_aero.ts a cycle, and whichever
 *  loaded second would read the other's exports before they were initialized. */
export const BLOODPACTS_PLEDGE = new Weapon({
  weaponType: WeaponType.Sword,
  standard: true,
  name: "Bloodpact's Pledge R5",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.Er, 38.88); },
  updateBuffs: () => { if (applied(HEALS)) applyCurrent(HARMONIOUS_VIBRANCY, 1); },
});

export const HARMONIOUS_VIBRANCY = new Buff({
  name: "Bloodpact's Pledge R5: Harmonious Vibrancy",
  applyStats: () => addStat(Stat.DmgBonus, 26, Type1.Skill),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(HARMONIOUS_VIBRANCY); },
});

/** The Unbound Flow half: 26% team Aero Amplification for 30s, so permanent uptime, and only on
 *  the resonators actually on the field. Applied by Rover: Aero themselves — see the weapon's own
 *  comment above for why the trigger lives there rather than here. */
export const BLOODPACT_AERO_AMP = new Buff({
  name: "Bloodpact's Pledge R5: Harmonious Vibrancy (team)",
  applyStats: () => { if (currentAction().active) addStat(Stat.Amp, 26, Attribute.Aero) },
});

/** Boson Astrolabe, R1: Path Observer, +12% ATK flat. Any team member's Tune Break cast grants the
 *  wielder +12% ATK and +12% Basic Attack DMG Bonus for 14s — watched from updateGlobal() so a
 *  break on a teammate's turn counts, landing on the wielder's own slot; a short self buff, lost
 *  after the wielder's outro. */
export const NEW_STD_RECTIFIER = new Weapon({
  weaponType: WeaponType.Rectifier,
  standard: true,
  name: "Boson Astrolabe",
  constantStats: () => { addStat(Stat.BaseAtk, 525); addStat(Stat.Er, 38.88); addStat(Stat.BonusAtk, 12); },
  updateGlobal: () => { if (casting(Cast.TuneBreak)) applyCurrent(PATH_OBSERVER_BUFF, 1); },
});

export const PATH_OBSERVER_BUFF = new Buff({
  name: "Boson Astrolabe: Path Observer",
  applyStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Type1.Basic); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(PATH_OBSERVER_BUFF); },
});

/** Phasic Homogenizer, R1: Insight Bearer, +12% ATK flat. Any team member's Tune Break cast grants
 *  the wielder +20% All-Attribute DMG Bonus for 14s — same shape as Boson Astrolabe above. */
export const NEW_STD_PISTOL = new Weapon({
  weaponType: WeaponType.Pistols,
  standard: true,
  name: "Phasic Homogenizer",
  constantStats: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.BonusAtk, 12); },
  updateGlobal: () => { if (casting(Cast.TuneBreak)) applyCurrent(INSIGHT_BEARER_BUFF, 1); },
});

export const INSIGHT_BEARER_BUFF = new Buff({
  name: "Phasic Homogenizer: Insight Bearer",
  applyStats: () => addStat(Stat.DmgBonus, 20),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(INSIGHT_BEARER_BUFF); },
});
