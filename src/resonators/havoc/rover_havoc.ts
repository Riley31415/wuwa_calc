/**
 * Rover: Havoc, ported to the new engine — a standard/permanent-banner 5-star
 * (`Tier.Free`), all six sequence nodes folded into the loadout unconditionally,
 * each owning its own trigger. Umbra (forte1, 0-100) gates Dark Surge: at full, Devastation opens
 * it, re-numbering Basic/Heavy Attack into Enhanced forms and replacing Wingblade with Lifetaker —
 * no stated duration, so lost after the outro action per the standing rule.
 *
 * Numbers from nanoka.cc (character 1605, https://ww.nanoka.cc/character/1605) — no migrated-sheet
 * row exists for this character, so this is nanoka's own tables throughout (energy/concerto off
 * Damage Data's own Energy/Elemental DMG columns, offtune off Weakness Break DMG x10000).
 */
import {
  Buff, Talent, Inherent, Sequence, Resonator, Tier, Loadout, EchoLoadout, Stat, EnemyStat, Attribute,
  WeaponType, Type1, Cast, Node, Scaling, applyCurrent, applyEnemy, revokeEnemy, isHeld, revokeCurrent, casting,
  currentAction, addStat, addEnemyStat, Debuff,
  } from "../../engine/kit.js";
import { ActionGroup, Action, Rotation, START_2, SWAP, INTRO, ECHO_SWAP, OUTRO, START_3 } from "../../engine/rotation.js";
import { HEALS } from "../../shared/status.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { BLAZING_BRILLIANCE, RED_SPRING } from "../../weapons/sword.js";
import { NM_CROWNLESS, HAVOC_ECLIPSE_5PC, HAVOC_ECLIPSE_2PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function roverAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter (Tuneslayer), outside Dark Surge. forte1 (Umbra) gains are
//     nanoka's own per-action list, resolved to a per-stage delta by differencing against shorter
//     combos sharing a prefix (cross-checked two ways, all consistent).
const BA1 = roverAction("Basic - Tuneslayer 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 56.67, energy: 0.6, concerto: 0.74, offtune: 2400, forte1: 3 });
const BA2 = roverAction("Basic - Tuneslayer 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 113.34, energy: 1.2, concerto: 1.48, offtune: 4800, forte1: 6 });
const BA3 = roverAction("Basic - Tuneslayer 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 85.00, energy: 0.9, concerto: 1.11, offtune: 2800, forte1: 4 });
const BA4 = roverAction("Basic - Tuneslayer 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 120.90, energy: 1.26, concerto: 1.56, offtune: 5121, forte1: 9 });
const BA5 = roverAction("Basic - Tuneslayer 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 188.88, energy: 2, concerto: 2.48, offtune: 8000, forte1: 10 });

const MA = roverAction("Basic - Mid-air Attack", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 117.10, energy: 0.41, concerto: 1, offtune: 9600, forte1: 9 });
const DC = roverAction("Basic - Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 179.43, energy: 1.9, concerto: 10.86, offtune: 4640 });
const HA = roverAction("Heavy - Attack", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 95.43, energy: 0.96, concerto: 1.19, offtune: 5360 });

// --- forte circuit: Devastation, at full Umbra — enters Dark Surge, considered Heavy Attack DMG,
//     and (S4) shreds the target's own Havoc RES
const Devastation = roverAction("Forte Heavy - Devastation", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 228.14, energy: 1.7, offtune: 56320, forte1: -100,
  updateBuffs: () => applyCurrent(DARK_SURGE, 1),
});

// --- Dark Surge: Enhanced Basic 1-5, Enhanced Heavy -> Thwackblade -> re-entry into Enhanced
//     Basic 3, Enhanced Mid-air/Dodge Counter — all their own base damage types (only the
//     Heavy/Thwackblade pair counts as Heavy Attack DMG; basics stay Basic Attack DMG).
const EBA1 = roverAction("Forte Basic - Umbra 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 56.37, energy: 0.42, concerto: 0.72, offtune: 1440 });
const EBA2 = roverAction("Forte Basic - Umbra 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 93.94, energy: 0.7, concerto: 1.2, offtune: 2560 });
const EBA3 = roverAction("Forte Basic - Umbra 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 155.67, energy: 1.16, concerto: 1.98, offtune: 4480 });
const EBA4 = roverAction("Forte Basic - Umbra 4", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 222.78, energy: 1.64, concerto: 2.83, offtune: 13280 });
// updateDebuffs is her own healing marker, read by every healing sonata and weapon (statuses.ts)
// — applied to the healer alone, never the team
const EBA5 = roverAction("Forte Basic - Umbra 5", {
  node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 228.15, energy: 1.7, concerto: 1.81, offtune: 56320,
  updateDebuffs: () => applyCurrent(HEALS, 1),
});

const EMA = roverAction("Forte Basic - Umbra Plunge", { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 123.27, energy: 0.41, concerto: 1, offtune: 9600 });
const EDC = roverAction("Forte Basic - Umbra Dodge Counter", { node: Node.Forte, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 316.71, energy: 2.36, concerto: 11.98, offtune: 4640 });

const EHA = roverAction("Forte Heavy - Umbra", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 128.83, energy: 0.96, concerto: 1.64, offtune: 6400 });
const EHA2 = roverAction("Forte Heavy - Umbra: Thwackblade", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 166.45, energy: 1.24, concerto: 2.12, offtune: 8704 });

// --- resonance skill: Wingblade outside Dark Surge, Lifetaker inside it — both share
//     cast: Cast.Skill (S1's own "Resonance Skill DMG" wording covers either).
const Skill = roverAction("Skill - Wingblade", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 572.58, energy: 12, concerto: 15, offtune: 8640, forte1: 39 });
const ESkill = roverAction("Forte Skill - Umbra: Lifetaker", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 592.50, energy: 8, concerto: 15, offtune: 11664, forte1: 39 });

// --- liberation: Deadening Abyss — also shreds the target's own Havoc RES (S4)
const Liberation = roverAction("Liberation - Deadening Abyss", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1520.90, concerto: 20, offtune: 53760, resetEnergy: true });

// --- intro / outro
const Intro = roverAction("Intro - Instant of Annihilation", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, forte1: 29, mv: 198.81, energy: 10, concerto: 10, offtune: 1867 });
/** Soundweaver: a Havoc Field, 3 ticks over 6s, lumped into one action. No Skill Attributes/
 *  Damage Data table on the page at all, so energy/concerto/offtune stay 0 — a real absence. */
const Outro = roverAction("Outro - Soundweaver", { cast: Cast.Outro, type: Type1.Outro, mv: 429.9, concerto: -100, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** Dark Surge (base kit): opened by Devastation, lost after the outro action (no stated real
 *  duration). Metamorph pays its own +20% Havoc DMG Bonus directly, below. */
const DARK_SURGE = new Buff({
  name: "Havoc Rover: Dark Surge",
  updateBuffs: () => { if (casting(Cast.Outro)) revokeCurrent(DARK_SURGE); },
});
/** Metamorph (Inherent Skill): +20% Havoc DMG Bonus while Dark Surge is held. */
const RH_INHERENT_1 = new Inherent({
  name: "Havoc Rover: Metamorph",
  applyStats: () => { if (isHeld(DARK_SURGE)) addStat(Stat.DmgBonus, 20, Attribute.Havoc); },
});
/** Bleak Crescendo (Inherent Skill): +1 Energy per Basic Attack hit while in Dark Surge (its own
 *  1/s ICD not modelled, same as every other ICD-gated passive elsewhere). */
const RH_INHERENT_2 = new Inherent({
  name: "Havoc Rover: Bleak Crescendo",
  applyStats: () => {
    if (isHeld(DARK_SURGE) && casting(Cast.Basic)) {
      addStat(Stat.AddEnergy, 1);
    }
  }
});

/** S4 Annihilated Silence: a genuine enemy debuff (target-side RES shred, not a personal ignore) —
 *  lost on Rover's own next Intro rather than tracked as permanent. Trigger in `ROVER_S4` below. */
const S4_RES_SHRED = new Debuff({
  name: "Havoc Rover S4: Annihilated Silence",
  applyStats: () => addEnemyStat(EnemyStat.ResShred, 10, Attribute.Havoc),
  convertStats: () => { if (casting(Cast.Intro) && isHeld(ROVER_HAVOC_RESONATOR)) revokeEnemy(S4_RES_SHRED); },
});

/** Him, as a Resonator: name/element/weapon, every grant/spend/queue rule his kit needs, and his
 *  own base stat line. `Tier.Free` — see the file header. */
const ROVER_HAVOC_RESONATOR = new Resonator({
  name: "Havoc Rover",
  element: Attribute.Havoc,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  outro: () => Outro,
  color: "#7c6fd6",
  maxEnergy: 125,
  tier: Tier.Free,

  constantStats: () => {
    addStat(Stat.BaseHp, 10825); addStat(Stat.BaseAtk, 413); addStat(Stat.BaseDef, 1259);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
const ROVER_TALENTS = new Talent({
  name: "Havoc Rover: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Attribute.Havoc); },
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as their own always-equipped gear pieces (Tier.Free), each owning
// its own trigger rather than the central Resonator updateBuffs() above.

const ROVER_S1 = new Sequence({
  name: "Havoc Rover S1: Cryptic Insight", applyStats: () => addStat(Stat.DmgBonus, 30, Type1.Skill),
});

// S2 Waning Crescent: resets Resonance Skill's cooldown on entering Dark Surge — no real-time
// clock here, a genuine no-op, held for the name only
const ROVER_S2 = new Sequence({ name: "Havoc Rover S2: Waning Crescent" });

// S3 Surging Resonance: a heal — out of scope, a genuine no-op, held for the name only
const ROVER_S3 = new Sequence({ name: "Havoc Rover S3: Surging Resonance" });

// S4 Annihilated Silence's own trigger — payout lives in S4_RES_SHRED above
const ROVER_S4 = new Sequence({
  name: "Havoc Rover S4: Annihilated Silence",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Devastation || a === Liberation) applyEnemy(S4_RES_SHRED, 1);
  },
});

// S5 Aeon Symphony: +50% DMG Multiplier on Enhanced Basic Attack Stage 5 specifically
const ROVER_S5 = new Sequence({
  name: "Havoc Rover S5: Aeon Symphony",
  applyStats: () => { if (currentAction() === EBA5) addStat(Stat.MulMv, 50); },
});

// S6 Ebbing Undercurrent: +25% Crit Rate while Dark Surge is held
const ROVER_S6 = new Sequence({
  name: "Havoc Rover S6: Ebbing Undercurrent",
  applyStats: () => { if (isHeld(DARK_SURGE)) addStat(Stat.CritRate, 25); },
});

const BA12345 = new ActionGroup("Basic - Tuneslayer 12345", [BA1, BA2, BA3, BA4, BA5]);
const EBA12345 = new ActionGroup("Forte Basic - Umbra 12345", [EBA1, EBA2, EBA3, EBA4, EBA5]);

// TODO double intro
const RH_ROTATION = new Rotation([
  INTRO, BA12345,
  Skill, Devastation, ESkill,
  EBA12345,
  START_3, START_2, Liberation, SWAP, ECHO_SWAP, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit + all six
// sequence nodes (Tier.Free), weapon, mainslot echo, sonata pieces, mainstat/substat
export const ROVER_HAVOC = new Loadout({
  resonator: ROVER_HAVOC_RESONATOR,
  talent: ROVER_TALENTS,
  inherent1: RH_INHERENT_1,
  inherent2: RH_INHERENT_2,
  weapons: [RED_SPRING, EMERALD_OF_GENESIS, BLAZING_BRILLIANCE],
  echoLoadouts: [new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC, HAVOC_ECLIPSE_2PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
    rotation: RH_ROTATION,
  sequences: [ROVER_S1, ROVER_S2, ROVER_S3, ROVER_S4, ROVER_S5, ROVER_S6],
});
