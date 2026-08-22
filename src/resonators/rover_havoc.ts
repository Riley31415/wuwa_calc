/**
 * Rover: Havoc, ported to the new engine — sequence-0 core loop, but a standard/permanent-banner
 * 5-star (unlocked via the 1.0 story quest, not a limited gacha pull) — `standardCharacter: true`
 * on the Resonator, so his own S1-S6 resonance-chain bonuses are folded into his loadout
 * unconditionally, each its own always-equipped gear piece (`ROVER_S1`-`ROVER_S6`) that owns its
 * own trigger logic — the central Resonator's own update() only ever handles his base/
 * Inherent-Skill kit, nothing sequence-specific.
 *
 * Umbra (forte1, 0-100): builds off Basic Attack hits/Skill/Liberation/Intro casts. At 100, hold
 * Basic Attack to cast Devastation (Heavy Attack DMG) and enter Dark Surge: Basic Attack becomes
 * a re-numbered 5-stage Enhanced Basic Attack, Heavy Attack becomes Enhanced Heavy Attack
 * (chaining into Thwackblade, then back into Enhanced Basic Attack 3), and Resonance Skill
 * Wingblade is replaced by Lifetaker. No explicit real duration is given on the page, so per the
 * standing short-window rule Dark Surge is lost after the outro action gains stats, same as every
 * other window without a stated real-time length. Metamorph (Inherent Skill): +20% Havoc DMG
 * Bonus while in Dark Surge, paid by the same buff directly.
 *
 * S1 Cryptic Insight (+30% Resonance Skill DMG Bonus flat), S2 Waning Crescent (resets Resonance
 * Skill's cooldown on entering Dark Surge — no real-time clock here, a genuine no-op, not
 * modelled), S3 Surging Resonance (a heal — out of scope, a genuine no-op, not modelled), S4
 * Annihilated Silence (Devastation/Liberation shred 10% of the target's own Havoc RES — a real
 * target-side reduction, not a personal ignore, so `Stat.ResShred` not `Stat.ResIgnore`, and a
 * genuine debuff on the enemy itself rather than a team buff; lost on Rover's own next Intro
 * rather than tracked as truly permanent, same shape as Verina's Gift of Nature/Sanhua's S6), S5
 * Aeon Symphony (+50% DMG Multiplier on Enhanced Basic Attack Stage 5 specifically), and S6
 * Ebbing Undercurrent (+25% Crit Rate while in Dark Surge — reads whether Dark Surge is held
 * rather than duplicating its own trigger).
 *
 * Numbers from nanoka.cc (character 1605, https://ww.nanoka.cc/character/1605) — no
 * wuwalab.com entry and no migrated-sheet row exist for this character, so this is nanoka's own
 * "Skill Attributes"/"Damage Data" tables throughout, same as Verina/Sanhua: energy/concerto come
 * off the Damage Data table's own Energy/Elemental DMG columns directly, offtune off its Weakness
 * Break DMG column x10000, added to any flat listed Concerto Regen a cast also carries (Wingblade,
 * Lifetaker, Liberation, Intro). Outro (Soundweaver) is the one action with no such table on the
 * page at all, so it alone stays at 0 for all three — a real absence, not an unchecked gap.
 */
import {
  Buff, Resonator, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyEnemy, revokeEnemy, isHeld, revoke, casting, currentAction, addStat,
  Debuff,
} from "../kit.js";
import { EMERALD_OF_GENESIS } from "../weapons/standard.js";
import { NM_CROWNLESS, HAVOC_ECLIPSE_5PC, HAVOC_ECLIPSE_2PC } from "../echoes/jinzhou.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------------------------------------ buffs */

/** Dark Surge (base kit): opened by Devastation, no stated real duration — short-window treatment
 *  (lost after the outro action gains stats). Metamorph (Inherent Skill) pays its own +20% Havoc
 *  DMG Bonus here directly. S6's own +25% Crit Rate while this is held lives in its own gear
 *  piece (`ROVER_S6`, below), not baked in here, per the standing "all sequence logic lives in
 *  the sequence piece" rule. */
export const DARK_SURGE = new Buff({
  name: "Havoc Rover: Dark Surge",
  apply: () => addStat(Stat.DmgBonus, 20, Element.Havoc),
  update: () => { if (casting(Cast.Outro)) revoke(DARK_SURGE); },
});

/** S4 Annihilated Silence: a genuine debuff on the enemy itself (`applyEnemy`/`State.enemyStacks`),
 *  not a team buff — a RES reduction is target-side, not something the team carries. Lost on
 *  Rover's own next Intro rather than tracked as truly permanent, same shape as Verina's Gift of
 *  Nature/Sanhua's S6. Trigger lives in `ROVER_S4`, below. */
export const S4_RES_SHRED = new Debuff({
  name: "Havoc Rover S4: Annihilated Silence",
  apply: () => addStat(Stat.ResShred, 10, Element.Havoc),
  convert: () => { if (casting(Cast.Intro) && isHeld(ROVER_HAVOC)) revokeEnemy(S4_RES_SHRED); },
});

/* ----------------------------------------------------------------------------------- actions */

function roverAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Havoc, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune all come off nanoka's own Damage Data table (energy/concerto straight
// off its own Energy/Elemental DMG columns, x10000 for offtune's Weakness Break DMG column).
// --- basics, mid-air, dodge counter (Tuneslayer), outside Dark Surge
// forte1 (Umbra) gains below are nanoka's own per-action list, not the Damage Data table — read
// as cumulative combo totals (e.g. "Tuneslayer 1 2 3" = 13 for stages 1+2+3 together) and
// resolved to a per-stage delta by differencing against the shorter combos that share a prefix
// (cross-checked two ways: "1 2" = 9 = 3+6, "2 3" = 10 = 6+4, "2 3 4" = 19 = 6+4+9, "12345" = 32 =
// 3+6+4+9+10 — all consistent).
export const BA1 = roverAction("Basic - Tuneslayer 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 56.67, energy: 0.6, concerto: 0.74, offtune: 2400, forte1: 3 });
export const BA2 = roverAction("Basic - Tuneslayer 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 113.34, energy: 1.2, concerto: 1.48, offtune: 4800, forte1: 6 });
export const BA3 = roverAction("Basic - Tuneslayer 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 85.00, energy: 0.9, concerto: 1.11, offtune: 2800, forte1: 4 });
export const BA4 = roverAction("Basic - Tuneslayer 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 120.90, energy: 1.26, concerto: 1.56, offtune: 5130, forte1: 9 });
export const BA5 = roverAction("Basic - Tuneslayer 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 188.88, energy: 2, concerto: 2.48, offtune: 8000, forte1: 10 });

export const MA = roverAction("Basic - Mid-air Attack", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 117.10, energy: 0.41, concerto: 1, offtune: 9600, forte1: 9 });
export const DC = roverAction("Basic - Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 179.43, energy: 1.9, concerto: 0.86, offtune: 4640 });
export const HA = roverAction("Heavy - Attack", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 95.43, energy: 0.96, concerto: 1.19, offtune: 5360 });

// --- forte circuit: Devastation, at full Umbra — enters Dark Surge, considered Heavy Attack DMG,
//     and (S4) shreds the target's own Havoc RES
export const Devastation = roverAction("Forte Heavy - Devastation", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 228.14, energy: 1.7, offtune: 56320, forte1: -100 });

// --- Dark Surge: Enhanced Basic Attack 1-5, Enhanced Heavy Attack -> Thwackblade -> re-entry
//     into Enhanced Basic 3, Enhanced Mid-air/Dodge Counter — all considered their own base
//     damage types per the kit text ("Umbra: ... DMG, considered as Heavy Attack DMG" only for
//     the Heavy/Thwackblade pair; the basics stay Basic Attack DMG). S5 pays EBA5 specifically.
export const EBA1 = roverAction("Forte Basic - Umbra 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 56.37, energy: 0.42, concerto: 0.72, offtune: 1440 });
export const EBA2 = roverAction("Forte Basic - Umbra 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 93.94, energy: 0.7, concerto: 1.2, offtune: 2560 });
export const EBA3 = roverAction("Forte Basic - Umbra 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 155.67, energy: 1.16, concerto: 1.98, offtune: 4480 });
export const EBA4 = roverAction("Forte Basic - Umbra 4", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 222.78, energy: 1.1, concerto: 1.89, offtune: 6640 });
export const EBA5 = roverAction("Forte Basic - Umbra 5", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 228.15, energy: 1.06, concerto: 1.81, offtune: 6720, heals: true });

export const EMA = roverAction("Forte Basic - Umbra Plunge", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 123.27, energy: 0.41, concerto: 1, offtune: 9600 });
export const EDC = roverAction("Forte Basic - Umbra Dodge Counter", { node: Node.Forte, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 316.71, energy: 2.36, concerto: 1.98, offtune: 4640 });

export const EHA = roverAction("Forte Heavy - Umbra", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 128.83, energy: 0.96, concerto: 1.64, offtune: 6400 });
export const EHA2 = roverAction("Forte Heavy - Umbra: Thwackblade", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 166.45, energy: 1.24, concerto: 2.12, offtune: 8720 });

// --- resonance skill: Wingblade outside Dark Surge, Lifetaker (Skill replacement) inside it —
//     both "Resonance Skill DMG" per S1's own wording, hence sharing cast: Cast.Skill. Both carry
//     a flat listed Concerto Regen (15 apiece) — their own per-hit Elemental DMG columns read 0,
//     so that flat number is the whole of it, same shape as Verina's Skill/Liberation/Intro.
export const Skill = roverAction("Skill - Wingblade", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 572.58, energy: 12, concerto: 15, offtune: 8640, forte1: 39 });
export const ESkill = roverAction("Forte Skill - Umbra: Lifetaker", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 592.50, energy: 12, concerto: 15, offtune: 9360, forte1: 39 });

// --- liberation: Deadening Abyss — also shreds the target's own Havoc RES (S4). Flat Concerto
//     Regen (20), own Elemental DMG entry reads 0, same shape as Wingblade/Lifetaker above.
export const Liberation = roverAction("Liberation - Deadening Abyss", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1520.90, concerto: 20, offtune: 53760 });

// --- intro / outro
export const Intro = roverAction("Intro - Instant of Annihilation", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, forte1: 29, mv: 198.81, energy: 10, concerto: 10, offtune: 1870 });
/** Soundweaver: a Havoc Field, 3 ticks (143.3% ATK each) over 6s — no real per-second clock here,
 *  so lumped into one action, same treatment as every other periodic zone elsewhere (Cantarella's
 *  Diffusion, Zhezhi's Inklit Spirit). No handoff buff is described on the page, and unlike every
 *  other action here, the page carries no Skill Attributes/Damage Data table for it at all, so
 *  energy/concerto/offtune stay unset (0) — a real absence on the page, not left unchecked. */
export const Outro = roverAction("Outro - Soundweaver", { cast: Cast.Outro, type: Type1.Outro, mv: 429.9, active: false });

/** Him, as a Resonator: name/element/weapon, every grant/spend/queue rule his kit needs, and his
 *  own base stat line. `standardCharacter: true` — see the file header. The stat-tree talent
 *  bonus and all six sequence nodes live in their own separate Buffs below — just more pieces of
 *  his loadout, not special-cased on the Resonator itself. */
export const ROVER_HAVOC = new Resonator({
  name: "Havoc Rover",
  element: Element.Havoc,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  color: "#7c6fd6",
  maxEnergy: 12500,
  standardCharacter: true,

  // base kit only — every sequence's own trigger lives in its own gear piece (ROVER_S1-S6,
  // below), not here.
  update: () => { if (currentAction() === Devastation) applySelf(DARK_SURGE, 1); },

  apply: () => {
    addStat(Stat.BaseHp, 10825); addStat(Stat.BaseAtk, 413); addStat(Stat.BaseDef, 1259);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
export const ROVER_TALENTS = new Buff({
  name: "Havoc Rover: Talents",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Element.Havoc); },
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as their own always-equipped gear pieces (standardCharacter — see file
// header); every trigger a sequence needs lives in its own piece rather than the central
// Resonator update() above, which only ever handles his base/Inherent-Skill kit.

export const ROVER_S1 = new Buff({
  name: "Havoc Rover S1: Cryptic Insight", apply: () => addStat(Stat.DmgBonus, 30, Type1.Skill),
});

// S2 Waning Crescent: resets Resonance Skill's cooldown on entering Dark Surge — no real-time
// clock here, a genuine no-op, held for the name only
export const ROVER_S2 = new Buff({ name: "Havoc Rover S2: Waning Crescent" });

// S3 Surging Resonance: a heal — out of scope, a genuine no-op, held for the name only
export const ROVER_S3 = new Buff({ name: "Havoc Rover S3: Surging Resonance" });

export const ROVER_S4 = new Buff({
  name: "Havoc Rover S4: Annihilated Silence",
  update: () => {
    const a = currentAction();
    if (a === Devastation || a === Liberation) applyEnemy(S4_RES_SHRED, 1);
  },
});

export const ROVER_S5 = new Buff({
  name: "Havoc Rover S5: Aeon Symphony",
  apply: () => { if (currentAction() === EBA5) addStat(Stat.MulMv, 50); },
});

// +25% Crit Rate while Dark Surge is held — reads whether it's held rather than duplicating
// Devastation's own trigger, same shape as every other "while X is up" scoping in this codebase
export const ROVER_S6 = new Buff({
  name: "Havoc Rover S6: Ebbing Undercurrent",
  apply: () => { if (isHeld(DARK_SURGE)) addStat(Stat.CritRate, 25); },
});

export const RH_ROTATION = [
  INTRO,
  BA1, BA2, BA3, BA4, BA5, 
  Skill, Devastation, ESkill,
  EBA1, EBA2, EBA3, EBA4, EBA5,
  Liberation, ECHO_CAST, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + all six sequence nodes (standardCharacter — see
// file header), weapon, mainslot echo, sonata pieces, mainstat/substat
export const RH_LOADOUT = [
  ROVER_HAVOC, ROVER_TALENTS, ROVER_S1, ROVER_S2, ROVER_S3, ROVER_S4, ROVER_S5, ROVER_S6,
  EMERALD_OF_GENESIS,
  NM_CROWNLESS, HAVOC_ECLIPSE_5PC, HAVOC_ECLIPSE_2PC,
  mainstats("CD", "havoc havoc", "atk atk"), chem("atk", "basic"),
];
