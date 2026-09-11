/** Signature Sword weapons. Every piece works if equipped on any resonator, not just its own.
 *  Each export is the weapon's five refinements, R1 first (gear.ts's own `refinements()`); a
 *  number that grows with rank is written as its five values. */
import { WeaponType, Stat, Attribute, Type1, Type2, Cast, LifeTime, BuffTarget } from "../engine/stats.js";
import { Buff, Weapon, refinements } from "../engine/gear.js";
import {
  addStat,
  frozenStacks,
  casting,
  currentAction,
  revokeCurrent,
  applyCurrent,
  removeStack,
  applyTeam,
  stacksOfEnemy,
  revokeTeam,
  isActive,
  onCast,
  onType,
  onInflict,
  either,
  isHeld,
} from "../engine/context.js";
import { oneSecondPassed } from "../shared/helpers.js";
import { consumedConcerto, gainedUnison } from "../shared/unison.js";
import { TUNE_RUPTURE_SHIFTING, TUNE_STRAIN_SHIFTING } from "../shared/tunebreak.js";
import { AERO_EROSION, FUSION_BURST, GLACIO_CHAFE, HAVOC_BANE } from "../shared/status.js";

/** Changli's sig: Crimson Phoenix. +12% ATK flat. Resonance Skill grants 5 stacks of Searing
 *  Feather outright (up to 14) — the per-hit 0.5s-ICD trickle isn't modelled. */
export const BLAZING_BRILLIANCE = refinements((r, rank) => {
  const SEARING_FEATHER = new Buff({
    name: `Blazing Brilliance: Crimson Phoenix${rank}`, maxStacks: 14,
    stats: [[Stat.DmgBonus, [4, 5, 6, 7, 8][r]!, Type1.Skill]], perStack: true, early: true, until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Sword, name: `Blazing Brilliance${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritDmg, 48.6], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onType(Type1.Skill), buff: SEARING_FEATHER, stacks: 5 }],
  });
});

/** Camellya's sig: Beyond the Cycle. +12% ATK flat. Basic Attack DMG grants +10% Basic DMG
 *  Bonus for 14s, up to 3 stacks (ICD not modelled). Consuming Concerto grants +40% Basic DMG
 *  Bonus for 10s — ten engine seconds, counted down a stack apiece and refreshed by every spend. */
export const RED_SPRING = refinements((r, rank) => {
  const RED_SPRING_BASIC = new Buff({
    name: `Red Spring: Beyond the Cycle${rank}`, maxStacks: 3,
    stats: [[Stat.DmgBonus, [10, 12.5, 15, 17.5, 20][r]!, Type1.Basic]], perStack: true, until: LifeTime.Outro,
  });
  const RED_SPRING_CONSUME: Buff = new Buff({
    name: `Red Spring: Beyond the Cycle${rank}`, maxStacks: 10,
    // the stacks are its 10s, not a multiplied payout — one spent per engine second, gone at zero
    display: () => `Red Spring: Beyond the Cycle${rank} (${frozenStacks()}s)`,
    updateBuffs: () => { if (oneSecondPassed()) removeStack(RED_SPRING_CONSUME, 1); },
    stats: [[Stat.DmgBonus, [40, 50, 60, 70, 80][r]!, Type1.Basic]], until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Sword, name: `Red Spring${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: onType(Type1.Basic), buff: RED_SPRING_BASIC },
      { on: consumedConcerto, buff: RED_SPRING_CONSUME, stacks: 10 },
    ],
  });
});

/** Brant's sig: Laughter Prevails. +8% Crit Rate flat. Two independent +24% Basic Attack DMG
 *  Bonus instances (Liberation 10s, Basic Attack DMG 4s) — both up at once is +48%, not capped. */
export const UNFLICKERING_VALOR = refinements((r, rank) => {
  const LAUGHTER_PREVAILS_LIB = new Buff({
    name: `Unflickering Valor: Laughter Prevails${rank} (liberation)`,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Type1.Basic]], until: LifeTime.Outro,
  });
  const LAUGHTER_PREVAILS_BASIC = new Buff({
    name: `Unflickering Valor: Laughter Prevails${rank} (basic)`,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Type1.Basic]], until: LifeTime.Outro,
  });
  return new Weapon({
    weaponType: WeaponType.Sword, name: `Unflickering Valor${rank}`,
    stats: [[Stat.BaseAtk, 413], [Stat.Er, 77.04], [Stat.CritRate, [8, 10, 12, 14, 16][r]!]],
    grants: [
      { on: onCast(Cast.Liberation), buff: LAUGHTER_PREVAILS_LIB },
      { on: onType(Type1.Basic), buff: LAUGHTER_PREVAILS_BASIC },
    ],
  });
});

/** Qiuyuan's sig: When A Heart Settles. +12% ATK flat; his Intro grants the team +20% Echo
 *  Skill DMG Bonus, permanent once granted. Bamboo Cleaver: an Echo Skill cast within 10s of an
 *  Intro/Basic grants a stack, up to two — no literal timer here, so the window an Intro or Basic
 *  opens simply stands until he leaves the field. */
export const EMERALD_SENTENCE = refinements((r, rank) => {
  const HEART_SETTLES_TEAM = new Buff({
    name: `Emerald Sentence: When A Heart Settles${rank}`,
    stats: [[Stat.DmgBonus, [20, 25, 30, 35, 40][r]!, Type1.Echo]],
  });
  /** The window an Intro or Basic opens for the next Echo Skills — nameless, so it stays out of
   *  the held list: it says only that the stacks below can be earned, and pays nothing itself. */
  const BAMBOO_READY = new Buff({ until: LifeTime.Swap });
  /** Lost entirely if switched off field, same as Quietude Within. */
  const BAMBOO_CLEAVER: Buff = new Buff({
    name: `Emerald Sentence: Bamboo Cleaver${rank}`, maxStacks: 2, until: LifeTime.Swap,
    stats: [[Stat.DmgBonus, [30, 37.5, 45, 52.5, 60][r]!, Type1.Heavy]], perStack: true,
  });
  return new Weapon({
    weaponType: WeaponType.Sword, name: `Emerald Sentence${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [
      { on: onCast(Cast.Intro), buff: HEART_SETTLES_TEAM, to: BuffTarget.Team },
      { on: () => casting(Cast.Intro) || casting(Cast.Basic), buff: BAMBOO_READY },
      { on: () => casting(Cast.Echo) && isHeld(BAMBOO_READY), buff: BAMBOO_CLEAVER },
    ],
  });
});

/** Glint of Clouds, Qingxiao's sig: Evil's Scourge. +12% ATK flat. Inflicting Tune Strain -
 *  Shifting grants +11.2% Aero DMG Bonus a stack, up to 5, 2s each (once per 0.5s) — short, but
 *  every cast of hers re-inflicts, so it climbs straight to five and stays: at max the window
 *  becomes 30s (permanent uptime) and her Aero DMG ignores 10% of the target's DEF. Short of
 *  five it's lost after the outro. */
export const GLINT_OF_CLOUDS = refinements((r, rank) => {
  const EVILS_SCOURGE: Buff = new Buff({
    name: `Glint of Clouds: Evil's Scourge${rank}`, maxStacks: 5,
    stats: [[Stat.DmgBonus, [11.2, 14, 16.8, 19.6, 22.4][r]!, Attribute.Aero]], perStack: true,
    applyStats: () => { if (frozenStacks() >= 5) addStat(Stat.DefIgnoreNew, [10, 12.5, 15, 17.5, 20][r]!, Attribute.Aero); },
    convertStats: () => { if (casting(Cast.Outro) && frozenStacks() < 5) revokeCurrent(EVILS_SCOURGE); },
  });
  return new Weapon({
    weaponType: WeaponType.Sword, name: `Glint of Clouds${rank}`,
    stats: [[Stat.BaseAtk, 500], [Stat.CritRate, 36], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onInflict(TUNE_STRAIN_SHIFTING), buff: EVILS_SCOURGE }],
  });
});

/** Frostburn, Hiyuki's sig: Self No More. +12% ATK flat, and two payouts off the wielder's own
 *  Glacio Chafe. The page states no duration on the first pair, so they stand once granted; the
 *  Glacio Chafe DMG amplification is a 6s window, so lost after the outro. Both are ordinary self
 *  buffs — "if the wielder is the active Resonator" needs no check of its own, because a Glacio
 *  Chafe hit resolves on whoever is on field (evaluate.ts's own `evaluate()`), so the wielder's own
 *  amplification reaches it exactly when they are the one holding the field. */
export const FROSTBURN = refinements((r, rank) => {
  const SELF_NO_MORE = new Buff({
    name: `Frostburn: Self No More${rank}`, until: LifeTime.Outro,
    stats: [[Stat.Amp, [28, 35, 42, 49, 56][r]!, Attribute.Glacio], [Stat.DefIgnoreNew, [10, 12.5, 15, 17.5, 20][r]!, Type1.Liberation]],
    applyStats: () => { if (isActive()) addStat(Stat.Amp, [20, 25, 30, 35, 40][r]!, Type2.GlacioChafe); },
  });
  return new Weapon({
    weaponType: WeaponType.Sword, name: `Frostburn${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    // `onInflict`: a "when *you* inflict" payout, so the two extra stacks Lucilla's Film Roll
    // adds to the wielder's own are hers and pay nothing here
    grants: [{ on: onInflict(GLACIO_CHAFE), buff: SELF_NO_MORE }],
  });
});

/** Azure Oath, Yangyang: Xuanling's sig: Unbending. +12% All-Attribute DMG Bonus flat (plain
 *  Dmg Bonus, no tag), and inflicting Havoc Bane pays the wielder +36% Heavy Attack DMG
 *  Amplification and 12% Heavy Attack DEF ignore for 8s — a short self window, so lost after the
 *  outro. `onInflict`: a "when *you* inflict" payout, so a stack Chisa's Thread of Bane hands
 *  out off the wielder's swing is hers and pays nothing here. */
export const AZURE_OATH = refinements((r, rank) => {
  const UNBENDING = new Buff({
    name: `Azure Oath: Unbending${rank}`, until: LifeTime.Outro,
    stats: [[Stat.Amp, [36, 45, 54, 63, 72][r]!, Type1.Heavy], [Stat.DefIgnoreNew, [12, 15, 18, 21, 24][r]!, Type1.Heavy]],
  });
  return new Weapon({
    weaponType: WeaponType.Sword, name: `Azure Oath${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.DmgBonus, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onInflict(HAVOC_BANE), buff: UNBENDING }],
  });
});

/** Everbright Polestar, Aemeath's sig: Starchaser. +12% All-Attribute DMG Bonus flat (plain
 *  Dmg Bonus, no tag), and inflicting Tune Rupture - Shifting or Fusion Burst has the wielder's
 *  Resonance Liberation DMG ignore 32% DEF and 10% Fusion RES for 8s — a short self window, so
 *  lost after the outro. `onInflict`: a "when *you* inflict" payout. */
export const EVERBRIGHT_POLESTAR = refinements((r, rank) => {
  const STARCHASER = new Buff({
    name: `Everbright Polestar: Starchaser${rank}`, until: LifeTime.Outro,
    stats: [[Stat.DefIgnoreNew, [32, 40, 48, 56, 64][r]!, Type1.Liberation]],
    applyStats: () => { if (currentAction().type1 === Type1.Liberation) addStat(Stat.ResIgnore, [10, 15, 20, 25, 30][r]!, Attribute.Fusion); },
  });
  return new Weapon({
    weaponType: WeaponType.Sword, name: `Everbright Polestar${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.DmgBonus, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: onInflict(TUNE_RUPTURE_SHIFTING, FUSION_BURST), buff: STARCHASER }],
  });
});

/** Defier's Thorn, Cartethyia's sig: A Free Knight's Tarantella. +12% Max HP flat. An Intro
 *  Skill or any Basic Attack DMG opens a 15s window: the wielder's damage ignores 8% of the
 *  target's DEF, and takes 20% amplification while the target holds at least one Aero Erosion,
 *  whoever put it there. The Erosion is read live, so that half pays nothing once the stacks
 *  lapse; the window itself is short, so it is lost after the outro. */
export const DEFIERS_THORN = refinements((r, rank) => {
  const FREE_KNIGHTS_TARANTELLA = new Buff({
    name: `Defier's Thorn: A Free Knight's Tarantella${rank}`, until: LifeTime.Outro,
    stats: [[Stat.DefIgnoreOld, [8, 10, 12, 14, 16][r]!]],
    applyStats: () => { if (stacksOfEnemy(AERO_EROSION) > 0) addStat(Stat.Amp, [20, 25, 30, 35, 40][r]!); },
  });
  return new Weapon({
    weaponType: WeaponType.Sword, name: `Defier's Thorn${rank}`,
    // the 12% is A Free Knight's Tarantella's own flat half
    stats: [[Stat.BaseAtk, 413], [Stat.BonusHp, 72.2], [Stat.BonusHp, [12, 15, 18, 21, 24][r]!]],
    grants: [{ on: either(onCast(Cast.Intro), onType(Type1.Basic)), buff: FREE_KNIGHTS_TARANTELLA }],
  });
});

/** Unspoken Rue: Locked Thunder, Trapped Rain. +12% ATK flat. Obtaining Unison grants +30%
 *  Electro DMG Bonus for 30s (permanent once granted) and Binding Mind — the whole team's +24%
 *  Electro DMG Bonus for 30s, one instance by name — clearing Yearning Mind. Consuming Concerto
 *  grants Yearning Mind — the wielder's own +40% Electro DMG Bonus for 14s, ended early by
 *  switching out — clearing Binding Mind. The two replace each other, so whichever the wielder
 *  did last is the one standing. */
export const UNSPOKEN_RUE = refinements((r, rank) => {
  const LOCKED_THUNDER = new Buff({
    name: `Unspoken Rue: Locked Thunder, Trapped Rain${rank}`,
    stats: [[Stat.DmgBonus, [30, 37.5, 45, 52.5, 60][r]!, Attribute.Electro]],
  });
  const BINDING_MIND = new Buff({
    name: `Unspoken Rue: Binding Mind${rank}`,
    stats: [[Stat.DmgBonus, [24, 30, 36, 42, 48][r]!, Attribute.Electro]],
  });
  const YEARNING_MIND = new Buff({
    name: `Unspoken Rue: Yearning Mind${rank}`, until: LifeTime.Swap,
    stats: [[Stat.DmgBonus, [40, 50, 60, 70, 80][r]!, Attribute.Electro]],
  });
  return new Weapon({
    weaponType: WeaponType.Sword, name: `Unspoken Rue${rank}`,
    stats: [[Stat.BaseAtk, 587.5], [Stat.CritRate, 24.3], [Stat.BonusAtk, [12, 15, 18, 21, 24][r]!]],
    updateBuffs: () => {
      if (gainedUnison()) { applyCurrent(LOCKED_THUNDER, 1); applyTeam(BINDING_MIND, 1); revokeCurrent(YEARNING_MIND); }
      if (consumedConcerto()) { applyCurrent(YEARNING_MIND, 1); revokeTeam(BINDING_MIND); }
    },
  });
});
