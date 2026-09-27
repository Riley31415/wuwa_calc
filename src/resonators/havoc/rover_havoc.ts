/**
 * Rover: Havoc, ported to the new engine — a standard/permanent-banner 5-star
 * (`Tier.Free`), all six sequence nodes folded into the loadout unconditionally,
 * each owning its own trigger. Umbra (forte1, 0-100) gates Dark Surge: at full, Devastation opens
 * it, re-numbering Basic/Heavy Attack into Enhanced forms and replacing Wingblade with Lifetaker —
 * no stated duration action per the standing rule.
 *
 * Numbers from nanoka.cc (character 1605, https://ww.nanoka.cc/character/1605) — no migrated-sheet
 * row exists for this character, so this is nanoka's own tables throughout (energy/concerto off
 * Damage Data's own Energy/Elemental DMG columns, offtune off Weakness Break DMG x10000).
 */
import { Tier, Stat, EnemyStat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Debuff } from "../../engine/gear.js";
import {
  applyCurrent,
  applyEnemy,
  revokeEnemy,
  isHeld,
  revokeCurrent,
  casting,
  runningAction,
  addStat,
  addEnemyStat,
  resetCooldown,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, START_2, ECHO, START_3, INTRO } from "../../engine/rotation.js";
import { HEALS } from "../../shared/status.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { BLAZING_BRILLIANCE, RED_SPRING } from "../../weapons/sword.js";
import { NM_CROWNLESS, HAVOC_ECLIPSE_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function roverAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter (Tuneslayer), outside Dark Surge. forte1 (Umbra) gains are
//     nanoka's own per-action list, resolved to a per-stage delta by differencing against shorter
//     combos sharing a prefix (cross-checked two ways, all consistent).
const BA1 = roverAction("Basic - Tuneslayer 1", { frames: 18, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 56.67, energy: 0.6, concerto: 0.74, offtune: 2400, forte1: 3 });
const BA2 = roverAction("Basic - Tuneslayer 2", { frames: 33, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 113.34, energy: 1.2, concerto: 1.48, offtune: 4800, forte1: 6 });
const BA3 = roverAction("Basic - Tuneslayer 3", { frames: 33, cancelFrames: 27, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 85.00, energy: 0.9, concerto: 1.11, offtune: 2800, forte1: 4 });
const BA4 = roverAction("Basic - Tuneslayer 4", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 120.90, energy: 1.26, concerto: 1.56, offtune: 5121, forte1: 9 });
const BA5 = roverAction("Basic - Tuneslayer 5", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 188.88, energy: 2, concerto: 2.48, offtune: 8000, forte1: 10 });

const MA = roverAction("Mid-air - Plunging Attack", { frames: 37, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 117.10, energy: 0.41, concerto: 1, offtune: 9600, forte1: 9 });
const DC = roverAction("Dodge Counter - Tuneslayer", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, mv: 179.43, energy: 1.9, concerto: 0.86, castConcerto: 10, offtune: 4640 });
const HA = roverAction("Heavy - Attack", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, mv: 95.43, energy: 0.96, concerto: 1.19, offtune: 5360 });

// --- forte circuit: Devastation, at full Umbra — enters Dark Surge, considered Heavy Attack DMG,
//     and (S4) shreds the target's own Havoc RES
const Devastation = roverAction("Forte Heavy - Devastation", {
  frames: 62, cancelFrames: 15,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, mv: 228.14, energy: 1.7, offtune: 56320, castForte1: -100,
  updateBuffs: () => {
    applyCurrent(DARK_SURGE, 1);
    // S2: entering Dark Surge through Devastation resets Wingblade's cooldown
    if (isHeld(ROVER_S2)) resetCooldown(Skill);
  },
});

// --- Dark Surge: Enhanced Basic 1-5, Enhanced Heavy -> Thwackblade -> re-entry into Enhanced
//     Basic 3, Enhanced Mid-air/Dodge Counter — all their own base damage types (only the
//     Heavy/Thwackblade pair counts as Heavy Attack DMG; basics stay Basic Attack DMG).
const EBA1 = roverAction("Basic - Umbra 1", { node: Node.Forte, cast: Cast.Basic, type: Type.Basic, mv: 56.37, energy: 0.42, concerto: 0.72, offtune: 1440 });
const EBA2 = roverAction("Basic - Umbra 2", { node: Node.Forte, cast: Cast.Basic, type: Type.Basic, mv: 93.94, energy: 0.7, concerto: 1.2, offtune: 2560 });
const EBA3 = roverAction("Basic - Umbra 3", { node: Node.Forte, cast: Cast.Basic, type: Type.Basic, mv: 155.67, energy: 1.16, concerto: 1.98, offtune: 4480 });
const EBA4 = roverAction("Basic - Umbra 4", { node: Node.Forte, cast: Cast.Basic, type: Type.Basic, mv: 222.78, energy: 1.64, concerto: 2.83, offtune: 13280 });
// updateDebuffs is her own healing marker, read by every healing sonata and weapon (statuses.ts)
// — applied to the healer alone, never the team
const EBA5 = roverAction("Basic - Umbra 5", {
  frames: 63, cancelFrames: 24,
  node: Node.Forte, cast: Cast.Basic, type: Type.Basic, mv: 228.15, energy: 1.7, concerto: 1.81, offtune: 56320,
  updateDebuffs: () => applyCurrent(HEALS, 1),
});

const EMA = roverAction("Mid-air - Umbra Plunge", { node: Node.Forte, cast: Cast.Basic, type: Type.Basic, mv: 123.27, energy: 0.41, concerto: 1, offtune: 9600 });
const EDC = roverAction("Dodge Counter - Umbra", { node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Basic, mv: 316.71, energy: 2.36, concerto: 1.98, castConcerto: 10, offtune: 4640 });

const EHA = roverAction("Heavy - Umbra", { frames: 43, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, mv: 128.83, energy: 0.96, concerto: 1.64, offtune: 6400 });
const EHA2 = roverAction("Heavy - Umbra: Thwackblade", { frames: 42, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, mv: 166.45, energy: 1.24, concerto: 2.12, offtune: 8704 });

// --- resonance skill: Wingblade outside Dark Surge, Lifetaker inside it — both share
//     cast: Cast.Skill (S1's own "Resonance Skill DMG" wording covers either).
/** Wingblade and Umbra: Lifetaker share one 12s cooldown. */
const SKILL_CD = new Cooldown({ frames: 60 * 12 });
const Skill = roverAction("Skill - Wingblade", { frames: 66, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, mv: 572.58, energy: 12, castConcerto: 15, offtune: 8640, forte1: 39 });
const ESkill = roverAction("Skill - Umbra: Lifetaker", { frames: 66, cooldown: SKILL_CD, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, mv: 592.50, energy: 8, castConcerto: 15, offtune: 11664, forte1: 39 });

// --- liberation: Deadening Abyss — also shreds the target's own Havoc RES (S4)
const Liberation = roverAction("Liberation - Deadening Abyss", { frames: 139, timestop: 139, cooldown: 60 * 16, node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, mv: 1520.90, castConcerto: 20, offtune: 53760, resetEnergy: true });

// --- intro / outro
const Intro = roverAction("Intro - Instant of Annihilation", { frames: 60, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, forte1: 29, mv: 198.81, energy: 10, castConcerto: 10, offtune: 1867 });
/** Soundweaver: a Havoc Field, 3 ticks over 6s, lumped into one action. No Skill Attributes/
 *  Damage Data table on the page at all, so energy/concerto/offtune stay 0 — a real absence. */
const Outro = roverAction("Outro - Soundweaver", { cast: Cast.Outro, type: Type.Outro, mv: 429.9, castConcerto: -100});

/* ------------------------------------------------------------------------------------ buffs */

/** Dark Surge (base kit): opened by Devastation, lost after the outro action (no stated real
 *  duration). Metamorph pays its own +20% Havoc DMG Bonus directly, below. */
const DARK_SURGE = new Buff({
  name: "Havoc Rover: Dark Surge",
  updateBuffs: () => { if (casting(Cast.Outro)) revokeCurrent(DARK_SURGE); },
});
/** Metamorph (Inherent Skill): +20% Havoc DMG Bonus while Dark Surge is held. */
const RH_INHERENT_1 = new Inherent({
  name: "Inherent: Metamorph",
  applyStats: () => { if (isHeld(DARK_SURGE)) addStat(Stat.DmgBonus, 20, Attribute.Havoc); },
});
/** Bleak Crescendo (Inherent Skill): +1 Energy per Basic Attack hit while in Dark Surge (its own
 *  1/s ICD not modelled, same as every other ICD-gated passive elsewhere). */
const RH_INHERENT_2 = new Inherent({
  name: "Inherent: Bleak Crescendo",
  applyStats: () => {
    if (isHeld(DARK_SURGE) && casting(Cast.Basic)) {
      addStat(Stat.AddCastEnergy, 1);
    }
  }
});

/** S4 Annihilated Silence: a genuine enemy debuff (target-side RES shred, not a personal ignore) —
 *  lost on Rover's own next Intro rather than tracked as permanent. Trigger in `ROVER_S4` below. */
const S4_RES_SHRED = new Debuff({
  name: "Havoc Rover S4: Annihilated Silence",
  duration: 60 * 20,
  applyStats: () => addEnemyStat(EnemyStat.ResReduce, 10, Attribute.Havoc),
  convertStats: () => { if (casting(Cast.Intro) && isHeld(ROVER_HAVOC_RESONATOR)) revokeEnemy(S4_RES_SHRED); },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
const ROVER_TALENTS = new Talent({
  name: "Havoc Rover: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.DmgBonus, 12, Attribute.Havoc]],
});

/** Him, as a Resonator: name/element/weapon, every grant/spend/queue rule his kit needs, and his
 *  own base stat line. `Tier.Free` — see the file header. */
const ROVER_HAVOC_RESONATOR = new Resonator({
  name: "Havoc Rover",
  talent: ROVER_TALENTS,
  inherent1: RH_INHERENT_1,
  inherent2: RH_INHERENT_2,
  element: Attribute.Havoc,
  weapon: WeaponType.Sword,
  color: "#823ac6",
  intro: Intro,
  maxEnergy: 125,
  maxForte1: 100,
  tier: Tier.Free,

  stats: [[Stat.BaseHp, 10825], [Stat.BaseAtk, 412.5], [Stat.BaseDef, 1258.8866]],
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as their own always-equipped gear pieces (Tier.Free), each owning
// its own trigger rather than the central Resonator updateBuffs() above.

const ROVER_S1 = new Sequence({
  name: "Havoc Rover S1: Cryptic Insight", stats: [[Stat.DmgBonus, 30, Type.Skill]],
});

// S2 Waning Crescent: resets Resonance Skill's cooldown on entering Dark Surge — read off this
// node by Devastation itself
const ROVER_S2 = new Sequence({ name: "Havoc Rover S2: Waning Crescent" });

// S3 Surging Resonance: a heal — out of scope, a genuine no-op, held for the name only
const ROVER_S3 = new Sequence({ name: "Havoc Rover S3: Surging Resonance" });

// S4 Annihilated Silence's own trigger — payout lives in S4_RES_SHRED above
const ROVER_S4 = new Sequence({
  name: "Havoc Rover S4: Annihilated Silence",
  afterAction: () => {
    if (runningAction(Devastation) || runningAction(Liberation)) applyEnemy(S4_RES_SHRED, 1);
  },
});

// S5 Aeon Symphony: +50% DMG Multiplier on Enhanced Basic Attack Stage 5 specifically
const ROVER_S5 = new Sequence({
  name: "Havoc Rover S5: Aeon Symphony",
  applyStats: () => { if (runningAction(EBA5)) addStat(Stat.MulMv, 50); },
});

// S6 Ebbing Undercurrent: +25% Crit Rate while Dark Surge is held
const ROVER_S6 = new Sequence({
  name: "Havoc Rover S6: Ebbing Undercurrent",
  applyStats: () => { if (isHeld(DARK_SURGE)) addStat(Stat.CritRate, 25); },
});

const BA12345 = new ActionGroup("Basic - Tuneslayer 12345", [BA1, BA2, BA3, BA4, BA5]);
const EBA12345 = new ActionGroup("Forte Basic - Umbra 12345", [EBA1, EBA2, EBA3, EBA4, EBA5]);

const RH_ROTATION = new Rotation([
  START_3, START_2, Liberation, ECHO.instaSwap(),

  INTRO, BA12345,
  Skill, Devastation, ESkill,
  EBA12345, EBA12345, EBA1,
  Liberation, Skill, ECHO.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills + Forte Circuit + all six
// sequence nodes (Tier.Free), weapon, mainslot echo, sonata pieces, mainstat/substat
export const ROVER_HAVOC = new Loadout({
  resonator: ROVER_HAVOC_RESONATOR,
  weapons: [RED_SPRING, EMERALD_OF_GENESIS, BLAZING_BRILLIANCE],
  echoLoadouts: [new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
    rotation: RH_ROTATION,
  sequences: [ROVER_S1, ROVER_S2, ROVER_S3, ROVER_S4, ROVER_S5, ROVER_S6],
});
