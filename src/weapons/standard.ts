/** Standard/f2p weapons — no signature character, usable by anyone of the matching weapon type.
 *  Three generations, 5 weapons each: Ceaseless Aria (4-star), Stormy Resolution (5-star), and
 *  the "new standard" 5-star set. Each export is the weapon's five refinements, R1 first
 *  (gear.ts's own `refinements()`); a number that grows with rank is written as its five values. */
import { WeaponType, Stat, Type1, Cast, Attribute, Tier, LifeTime, BuffTarget } from "../engine/stats.js";
import { Buff, Weapon, refinements } from "../engine/gear.js";
import {
  addStat, applyCurrent, removeStack, casting, currentAction, frozenStacks, stacksOfEnemy, isActive, applied,
  onCast, onType, onApplied,
} from "../engine/context.js";
import { HEALS } from "../shared/status.js";
import { TUNE_STRAIN_INTERFERED } from "../shared/tunebreak.js";

/* ---------------------------------------------------------------- Ceaseless Aria (4-star, 5) */

/** The five 4-star standard weapons — identical stats and behavior, only the name differs. Four
 *  are the craftable (`Tier.Free`, so a loadout runs them at R5); Variation is a standard weapon,
 *  so a loadout runs it at R1 and a build carrying it reads R0 (page/table.ts's `memberLabel()`).
 *  Ceaseless Aria is granted on the wielder's first Resonance Skill cast (restoring `concerto` —
 *  8 at R1, 16 at R5) and promoted to cooldown the same action; a repeat cast on cooldown does
 *  nothing. Lost entirely on the wielder's Outro. */
function concertoWeapon(name: string, weaponType: WeaponType, tier: Tier = Tier.Free): Weapon[] {
  return refinements((r, rank) => {
    const aria: Buff = new Buff({
      name: `${name}: Ceaseless Aria${rank}`, maxStacks: 2,
      applyStats: () => {
        if (frozenStacks() === 1 && casting(Cast.Skill)) { applyCurrent(aria, 1); addStat(Stat.AddConcerto, [8, 10, 12, 14, 16][r]!); }
        else if (frozenStacks() === 2 && casting(Cast.Outro)) removeStack(aria, 2);
      },
      display: () => `${name}: Ceaseless Aria${rank}${frozenStacks() === 1 ? "" : " (cooldown)"}`,
    });
    return new Weapon({
      weaponType, tier, name: `${name}${rank}`,
      stats: [[Stat.BaseAtk, 337.5], [Stat.Er, 51.84]],
      grants: [{ on: onCast(Cast.Skill), buff: aria }],
    });
  });
}

export const VARIATION = concertoWeapon("Variation", WeaponType.Rectifier, Tier.Standard);
export const MARCATO = concertoWeapon("Marcato", WeaponType.Gauntlets);
export const CADENZA = concertoWeapon("Cadenza", WeaponType.Pistols);
export const OVERTURE = concertoWeapon("Overture", WeaponType.Sword);
export const DISCORD = concertoWeapon("Discord", WeaponType.Broadblade);

/* --------------------------------------------------------------- Stormy Resolution (5-star, 5) */

/** Static Mist. +12.8% ER flat. On the wielder's own Outro, hands the incoming resonator +10% ATK. */
export const STATIC_MIST = refinements((r, rank) => {
  const STATIC_MIST_HANDOFF = new Buff({
    name: `Static Mist: Stormy Resolution${rank}`,
    stats: [[Stat.BonusAtk, [10, 12.5, 15, 17.5, 20][r]!]], until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Pistols, tier: Tier.Standard, name: `Static Mist${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.Er, [12.8, 16, 19.2, 22.4, 25.6][r]!]],
    grants: [{ on: onCast(Cast.Outro), buff: STATIC_MIST_HANDOFF, to: BuffTarget.Next }],
  });
});

/** Emerald of Genesis. +12.8% ER flat. Skill DMG stacks ATK twice over (6% a stack). */
export const EMERALD_OF_GENESIS = refinements((r, rank) => {
  const EOG_STACKS = new Buff({
    name: `Emerald of Genesis: Stormy Resolution${rank}`, maxStacks: 2,
    stats: [[Stat.BonusAtk, [6, 7.5, 9, 10.5, 12][r]!]], perStack: true, until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Sword, tier: Tier.Standard, name: `Emerald of Genesis${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.Er, [12.8, 16, 19.2, 22.4, 25.6][r]!]],
    grants: [{ on: onCast(Cast.Skill), buff: EOG_STACKS }],
  });
});

/** Cosmic Ripples. +12.8% ER flat. Basic Attack DMG stacks Basic DMG Bonus 5x over (3.2% a stack). */
export const COSMIC_RIPPLES = refinements((r, rank) => {
  const COSMIC_RIPPLES_STACKS = new Buff({
    name: `Cosmic Ripples: Stormy Resolution${rank}`, maxStacks: 5,
    stats: [[Stat.DmgBonus, [3.2, 4, 4.8, 5.6, 6.4][r]!, Type1.Basic]], perStack: true, until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Rectifier, tier: Tier.Standard, name: `Cosmic Ripples${rank}`,
    stats: [[Stat.BaseAtk, 500], [Stat.BonusAtk, 54], [Stat.Er, [12.8, 16, 19.2, 22.4, 25.6][r]!]],
    grants: [{ on: onType(Type1.Basic), buff: COSMIC_RIPPLES_STACKS }],
  });
});

/** Abyss Surges. +12.8% ER flat. A Skill hit grants Basic DMG Bonus; a Basic hit grants
 *  Skill DMG Bonus. */
export const ABYSS_SURGES = refinements((r, rank) => {
  const ABYSS_SKILL_HIT = new Buff({
    name: `Abyss Surges: Stormy Resolution${rank}`,
    stats: [[Stat.DmgBonus, [10, 12.5, 15, 17.5, 20][r]!, Type1.Basic]], until: LifeTime.Outro,
  });
  const ABYSS_BASIC_HIT = new Buff({
    name: `Abyss Surges: Stormy Resolution${rank}`,
    stats: [[Stat.DmgBonus, [10, 12.5, 15, 17.5, 20][r]!, Type1.Skill]], until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Gauntlets, tier: Tier.Standard, name: `Abyss Surges${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.BonusAtk, 36.45], [Stat.Er, [12.8, 16, 19.2, 22.4, 25.6][r]!]],
    grants: [
      { on: onType(Type1.Skill), buff: ABYSS_SKILL_HIT },
      { on: onType(Type1.Basic), buff: ABYSS_BASIC_HIT },
    ],
  });
});

/** Lustrous Razor. +12.8% ER flat. Skill cast stacks Liberation DMG Bonus 3x over (7% a stack). */
export const LUSTROUS_RAZOR = refinements((r, rank) => {
  const LUSTROUS_RAZOR_STACKS = new Buff({
    name: `Lustrous Razor: Stormy Resolution${rank}`, maxStacks: 3,
    stats: [[Stat.DmgBonus, [7, 8.75, 10.5, 12.25, 14][r]!, Type1.Liberation]], perStack: true, until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, tier: Tier.Standard, name: `Lustrous Razor${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.BonusAtk, 36.45], [Stat.Er, [12.8, 16, 19.2, 22.4, 25.6][r]!]],
    grants: [{ on: onCast(Cast.Skill), buff: LUSTROUS_RAZOR_STACKS }],
  });
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

/** Radiance Cleaver: Edge Breaker, +12% ATK flat. Hitting a Tune Strain - Interfered target
 *  grants +24% Resonance Liberation DMG Bonus for 3s, retriggered by every hit. */
export const NEW_STD_BRAUDBLADE = refinements((r, rank) => {
  const EDGE_BREAKER_BUFF = new Buff({
    name: `Radiance Cleaver: Edge Breaker${rank}`,
    stats: [[Stat.DmgBonus, [24, 27, 30, 33, 36][r]!, Type1.Liberation]],
  });
  return new Weapon({
    weaponType: WeaponType.Broadblade, tier: Tier.Standard, name: `Radiance Cleaver${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritDmg, 48.6], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: hitInterfered, buff: EDGE_BREAKER_BUFF }],
  });
});

/** Pulsation Bracer: Barrier Breacher, +12% ATK flat. Hitting a Tune Strain - Interfered target
 *  grants +6% Basic Attack DMG Bonus a stack, up to 4, 3s, retriggered by every hit — the once-per-
 *  0.5s limit is one stack per action here. */
export const NEW_STD_GAUNTLET = refinements((r, rank) => {
  const BARRIER_BREACHER_STACKS = new Buff({
    name: `Pulsation Bracer: Barrier Breacher${rank}`, maxStacks: 4,
    stats: [[Stat.DmgBonus, [6, 6.7, 7.5, 8.2, 9][r]!, Type1.Basic]], perStack: true,
  });
  return new Weapon({
    weaponType: WeaponType.Gauntlets, tier: Tier.Standard, name: `Pulsation Bracer${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: hitInterfered, buff: BARRIER_BREACHER_STACKS }],
  });
});

/** Laser Shearer: Signal Catcher, +12% ATK flat. Hitting a Tune Strain - Interfered target
 *  grants +24% Resonance Skill DMG Bonus for 3s, retriggered by every hit. */
export const NEW_STD_SWORD = refinements((r, rank) => {
  const SIGNAL_CATCHER_BUFF = new Buff({
    name: `Laser Shearer: Signal Catcher${rank}`,
    stats: [[Stat.DmgBonus, [24, 27, 30, 33, 36][r]!, Type1.Skill]],
  });
  return new Weapon({
    weaponType: WeaponType.Sword, tier: Tier.Standard, name: `Laser Shearer${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.Er, 38.88], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: hitInterfered, buff: SIGNAL_CATCHER_BUFF }],
  });
});

/** Bloodpact's Pledge: Harmonious Vibrancy. +38.88% ER flat. Providing healing pays the wielder
 *  +26% Resonance Skill DMG Bonus (at R5) for 6s — that half works for anyone, so it lives here.
 *  The other half names Rover: Aero's own Unbound Flow outright, so its trigger lives in their kit
 *  file instead (rover_aero.ts's own updateBuffs(), gated on holding this weapon): importing those
 *  two actions here would make weapons/standard.ts and resonators/aero/rover_aero.ts a cycle, and
 *  whichever loaded second would read the other's exports before they were initialized. */
export const BLOODPACTS_PLEDGE = refinements((r, rank) => {
  const HARMONIOUS_VIBRANCY = new Buff({
    name: `Bloodpact's Pledge: Harmonious Vibrancy${rank}`,
    stats: [[Stat.DmgBonus, [10, 14, 18, 22, 26][r]!, Type1.Skill]], until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Sword, tier: Tier.Free, name: `Bloodpact's Pledge${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.Er, 38.88]],
    grants: [{ on: onApplied(HEALS), buff: HARMONIOUS_VIBRANCY }],
  });
});

/** The Unbound Flow half, one buff per refinement in step with `BLOODPACTS_PLEDGE`: 26% team Aero
 *  Amplification at R5 for 30s, so permanent uptime, and only on the resonators actually on the
 *  field. Applied by Rover: Aero themselves off whichever rank they hold — see the weapon's own
 *  comment above for why the trigger lives there rather than here. */
export const BLOODPACT_AERO_AMP: Buff[] = [10, 14, 18, 22, 26].map((amp, r) => new Buff({
  name: `Bloodpact's Pledge: Harmonious Vibrancy R${r + 1}`,
  stats: [[Stat.Amp, amp, Attribute.Aero]], when: isActive,
}));

/** Boson Astrolabe: Path Observer, +12% ATK flat. Any team member's Tune Break cast grants the
 *  wielder +12% ATK and +12% Basic Attack DMG Bonus for 14s — watched from updateGlobal() so a
 *  break on a teammate's turn counts, landing on the wielder's own slot; a short self buff, lost
 *  after the wielder's outro. */
export const NEW_STD_RECTIFIER = refinements((r, rank) => {
  const PATH_OBSERVER_BUFF = new Buff({
    name: `Boson Astrolabe: Path Observer${rank}`, until: LifeTime.Outro,
    stats: [[Stat.BonusAtk, [12, 13.5, 15, 16.5, 18][r]!], [Stat.DmgBonus, [12, 13.5, 15, 16.5, 18][r]!, Type1.Basic]],
  });
  return new Weapon({
    weaponType: WeaponType.Rectifier, tier: Tier.Standard, name: `Boson Astrolabe${rank}`,
    stats: [[Stat.BaseAtk, 525], [Stat.Er, 38.88], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    updateGlobal: () => { if (casting(Cast.TuneBreak)) applyCurrent(PATH_OBSERVER_BUFF, 1); },
  });
});

/** Phasic Homogenizer: Insight Bearer, +12% ATK flat. Any team member's Tune Break cast grants
 *  the wielder +20% All-Attribute DMG Bonus for 14s — same shape as Boson Astrolabe above. */
export const NEW_STD_PISTOL = refinements((r, rank) => {
  const INSIGHT_BEARER_BUFF = new Buff({
    name: `Phasic Homogenizer: Insight Bearer${rank}`, until: LifeTime.Outro,
    stats: [[Stat.DmgBonus, [20, 22.5, 25, 27.5, 30][r]!]],
  });
  return new Weapon({
    weaponType: WeaponType.Pistols, tier: Tier.Standard, name: `Phasic Homogenizer${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritDmg, 48.6], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    updateGlobal: () => { if (casting(Cast.TuneBreak)) applyCurrent(INSIGHT_BEARER_BUFF, 1); },
  });
});
