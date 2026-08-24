/** Standard/f2p weapons, ported to the new engine — no signature character, usable by anyone of
 *  the matching weapon type. Three generations, 5 weapons each: Ceaseless Aria (4-star), Stormy
 *  Resolution (5-star), and the "new standard" 5-star set. */
import {
  Buff, Weapon, WeaponType, Stat, Type1, Cast, Attribute,
  addStat, applySelf, isHeld, removeStack, revoke, casting, currentAction, stacks, queueOutro,
} from "../kit.js";

/* ---------------------------------------------------------------- Ceaseless Aria (4-star, 5) */

/** One Ceaseless Aria instance a weapon, so each carries its own name for attribution. Granted
 *  on the wielder's first Resonance Skill cast (restoring Concerto) and promoted to cooldown the
 *  same action; a repeat cast on cooldown does nothing. Lost entirely on the wielder's Outro. */
function ceaselessAria(name: string): Buff {
  const buff: Buff = new Buff({
    name: `${name}: Ceaseless Aria R5`, maxStacks: 2,
    apply: () => {
      if (stacks() === 1 && casting(Cast.Skill)) { applySelf(buff, 1); addStat(Stat.AddConcerto, 16); }
      else if (stacks() === 2 && casting(Cast.Outro)) removeStack(buff, 2);
    },
    display: () => `${name}: Ceaseless Aria R5${stacks() === 1 ? "" : " (cooldown)"}`,
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
    apply: () => { addStat(Stat.BaseAtk, 337.5); addStat(Stat.Er, 51.84); },
    update: () => { if (casting(Cast.Skill)) applySelf(aria, 1); },
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
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.Er, 12.8); },
  update: () => { if (casting(Cast.Outro)) queueOutro(STATIC_MIST_HANDOFF); },
});

export const STATIC_MIST_HANDOFF = new Buff({
  name: "Static Mist: Stormy Resolution",
  apply: () => addStat(Stat.BonusAtk, 10),
  convert: () => { if (casting(Cast.Outro)) revoke(STATIC_MIST_HANDOFF); },
});

/** Emerald of Genesis, R1. +12.8% ER flat. Skill DMG stacks ATK twice over (6% a stack). */
export const EMERALD_OF_GENESIS = new Weapon({
  weaponType: WeaponType.Sword,
  standard: true,
  name: "Emerald of Genesis",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.Er, 12.8); },
  update: () => { if (casting(Cast.Skill)) applySelf(EOG_STACKS, 1); },
});

export const EOG_STACKS = new Buff({
  name: "Emerald of Genesis: Stormy Resolution", maxStacks: 2,
  apply: () => addStat(Stat.BonusAtk, 6 * stacks()),
  convert: () => { if (casting(Cast.Outro)) revoke(EOG_STACKS); },
});

/** Cosmic Ripples, R1. +12.8% ER flat. Basic Attack DMG stacks Basic DMG Bonus 5x over (3.2% a stack). */
export const COSMIC_RIPPLES = new Weapon({
  weaponType: WeaponType.Rectifier,
  standard: true,
  name: "Cosmic Ripples",
  apply: () => { addStat(Stat.BaseAtk, 500); addStat(Stat.BonusAtk, 54); addStat(Stat.Er, 12.8); },
  update: () => { if (currentAction().type === Type1.Basic) applySelf(COSMIC_RIPPLES_STACKS, 1); },
});

export const COSMIC_RIPPLES_STACKS = new Buff({
  name: "Cosmic Ripples: Stormy Resolution", maxStacks: 5,
  apply: () => addStat(Stat.DmgBonus, 3.2 * stacks(), Type1.Basic),
  convert: () => { if (casting(Cast.Outro)) revoke(COSMIC_RIPPLES_STACKS); },
});

/** Abyss Surges, R1. +12.8% ER flat. A Skill hit grants Basic DMG Bonus; a Basic hit grants
 *  Skill DMG Bonus. */
export const ABYSS_SURGES = new Weapon({
  weaponType: WeaponType.Gauntlets,
  standard: true,
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

/** Lustrous Razor, R1. +12.8% ER flat. Skill cast stacks Liberation DMG Bonus 3x over (7% a stack). */
export const LUSTROUS_RAZOR = new Weapon({
  weaponType: WeaponType.Broadblade,
  standard: true,
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
export const NEW_STD_BRAUDBLADE = new Weapon({
  weaponType: WeaponType.Broadblade,
  standard: true,
  name: "Radiance Cleaver",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.BonusAtk, 12); },
});

/** Pulsation Bracer, Iuno's f2p alternative. Conversion-stack bonus skipped — untracked state. */
export const NEW_STD_GAUNTLET = new Weapon({
  weaponType: WeaponType.Gauntlets,
  standard: true,
  name: "Pulsation Bracer",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritRate, 24.3); addStat(Stat.BonusAtk, 12); },
});

/** Laser Shearer, R1: Signal Catcher, +12% ATK flat. Tune Strain half skipped — untracked enemy state. */
export const NEW_STD_SWORD = new Weapon({
  weaponType: WeaponType.Sword,
  standard: true,
  name: "Laser Shearer",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.Er, 38.88); addStat(Stat.BonusAtk, 12); },
});

/** Bloodpact's Pledge R5: Harmonious Vibrancy. +38.88% ER flat. Providing healing pays the wielder
 *  +26% Resonance Skill DMG Bonus for 6s — that half works for anyone, so it lives here. The other
 *  half names Rover: Aero's own Unbound Flow outright, so its trigger lives in their kit file
 *  instead (rover_aero.ts's own update(), gated on holding this weapon): importing those two
 *  actions here would make weapons/standard.ts and resonators/rover_aero.ts a cycle, and whichever
 *  loaded second would read the other's exports before they were initialized. */
export const BLOODPACTS_PLEDGE = new Weapon({
  weaponType: WeaponType.Sword,
  standard: true,
  name: "Bloodpact's Pledge R5",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.Er, 38.88); },
  update: () => { if (currentAction().heals) applySelf(HARMONIOUS_VIBRANCY, 1); },
});

export const HARMONIOUS_VIBRANCY = new Buff({
  name: "Bloodpact's Pledge R5: Harmonious Vibrancy",
  apply: () => addStat(Stat.DmgBonus, 26, Type1.Skill),
  convert: () => { if (casting(Cast.Outro)) revoke(HARMONIOUS_VIBRANCY); },
});

/** The Unbound Flow half: 26% team Aero Amplification for 30s, so permanent uptime, and only on
 *  the resonators actually on the field. Applied by Rover: Aero themselves — see the weapon's own
 *  comment above for why the trigger lives there rather than here. */
export const BLOODPACT_AERO_AMP = new Buff({
  name: "Bloodpact's Pledge R5: Harmonious Vibrancy (team)",
  apply: () => { if (currentAction().active) addStat(Stat.Amp, 26, Attribute.Aero) },
});

/** Boson Astrolabe, R1: Path Observer, +12% ATK flat. Only the wielder's own Tune Break cast
 *  procs it — a team-wide trigger would need a global watcher. */
export const NEW_STD_RECTIFIER = new Weapon({
  weaponType: WeaponType.Rectifier,
  standard: true,
  name: "Boson Astrolabe",
  apply: () => { addStat(Stat.BaseAtk, 525); addStat(Stat.Er, 38.88); addStat(Stat.BonusAtk, 12); },
  update: () => { if (casting(Cast.TuneBreak)) applySelf(PATH_OBSERVER_BUFF, 1); },
});

export const PATH_OBSERVER_BUFF = new Buff({
  name: "Boson Astrolabe: Path Observer",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Type1.Basic); },
  convert: () => { if (casting(Cast.Outro)) revoke(PATH_OBSERVER_BUFF); },
});

/** Phasic Homogenizer, R1: Insight Bearer, +12% ATK flat. Same trigger shape as Boson Astrolabe. */
export const NEW_STD_PISTOL = new Weapon({
  weaponType: WeaponType.Pistols,
  standard: true,
  name: "Phasic Homogenizer",
  apply: () => { addStat(Stat.BaseAtk, 587.5); addStat(Stat.CritDmg, 48.6); addStat(Stat.BonusAtk, 12); },
  update: () => { if (casting(Cast.TuneBreak)) applySelf(INSIGHT_BEARER_BUFF, 1); },
});

export const INSIGHT_BEARER_BUFF = new Buff({
  name: "Phasic Homogenizer: Insight Bearer",
  apply: () => addStat(Stat.DmgBonus, 20),
  convert: () => { if (casting(Cast.Outro)) revoke(INSIGHT_BEARER_BUFF); },
});
