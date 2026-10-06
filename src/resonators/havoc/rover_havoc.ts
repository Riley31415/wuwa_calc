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
import { Tier, Stat, EnemyStat, Attribute, WeaponType, Type, Cast, Node, Scaling, Position } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Debuff } from "../../engine/gear.js";
import {
  applyCurrent,
  applyEnemy,
  isHeld,
  casting,
  runningAction,
  addStat, addGain,
  addEnemyStat,
  resetCooldown,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, ECHO, INTRO, OUTRO, START, DODGE } from "../../engine/rotation.js";
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

/** Dark Surge (base kit): opened by Devastation. Metamorph pays its own +20% Havoc DMG Bonus
 *  directly, below. */
const DARK_SURGE = new Buff({
  name: "Havoc Rover: Dark Surge",
  // UNKNOWN: the kit states no duration; 12s is a stand-in
  duration: 60 * 12,
});
// --- basics, mid-air, dodge counter (Tuneslayer), outside Dark Surge. forte1 (Umbra) gains are
//     nanoka's own per-action list, resolved to a per-stage delta by differencing against shorter
//     combos sharing a prefix (cross-checked two ways, all consistent).
const BA1 = roverAction("Basic - Tuneslayer 1", { animFrames: 18, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 18, mv: 5667, energy: 60, concerto: 74, offtune: 2400, forte1: 3 }] });
// PLACEHOLDER FRAMES
const BA2 = roverAction("Basic - Tuneslayer 2", { chains: [BA1], animFrames: 33, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 33, mv: 5667, energy: 60, concerto: 74, offtune: 2400 },
    { hitFrame: 33, mv: 5667, energy: 60, concerto: 74, offtune: 2400, forte1: 6 },
  ]});
const BA3 = roverAction("Basic - Tuneslayer 3", { chains: [BA2], animFrames: 33, castPriority: 2, bullets: [{ hitFrame: 27, mv: 8500, energy: 90, concerto: 111, offtune: 2800, forte1: 4 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
// PLACEHOLDER FRAMES. "Use Basic Attack after casting Heavy Attack to cast Basic Attack 4"
const BA4 = roverAction("Basic - Tuneslayer 4", { chains: () => [BA3, HA], castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 4030, energy: 42, concerto: 52, offtune: 1707 },
    { hitFrame: 0, mv: 4030, energy: 42, concerto: 52, offtune: 1707 },
    { hitFrame: 0, mv: 4030, energy: 42, concerto: 52, offtune: 1707, forte1: 9 },
  ]});
// PLACEHOLDER FRAMES
const BA5 = roverAction("Basic - Tuneslayer 5", { chains: [BA4], castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 9444, energy: 100, concerto: 124, offtune: 4000 },
    { hitFrame: 0, mv: 9444, energy: 100, concerto: 124, offtune: 4000, forte1: 10 },
  ]});

const MA = roverAction("Mid-air - Plunging Attack", { castPosition: Position.Midair, endPosition: Position.Grounded, animFrames: 37, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 37, mv: 11710, energy: 41, concerto: 100, offtune: 9600, forte1: 9 }] });
const DC = roverAction("Dodge Counter - Tuneslayer", { chains: [DODGE], castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 17943, energy: 190, concerto: 86, offtune: 4640 }], castConcerto: 1000 });
const HA = roverAction("Heavy - Attack", { castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 9543, energy: 96, concerto: 119, offtune: 5360 }] });

// --- forte circuit: Devastation, at full Umbra — enters Dark Surge, considered Heavy Attack DMG,
//     and (S4) shreds the target's own Havoc RES
const Devastation = roverAction("Forte Heavy - Devastation", { minForte1: 100,
  animFrames: 62, castPriority: 6, bullets: [{ hitFrame: 15, mv: 22814, energy: 170, offtune: 56320 }],
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, castForte1: -100,
  updateBuffs: () => {
    applyCurrent(DARK_SURGE, 1);
    // S2: entering Dark Surge through Devastation resets Wingblade's cooldown
    if (isHeld(ROVER_S2)) resetCooldown(Skill);
  },
});

// --- Dark Surge: Enhanced Basic 1-5, Enhanced Heavy -> Thwackblade -> re-entry into Enhanced
//     Basic 3, Enhanced Mid-air/Dodge Counter — all their own base damage types (only the
//     Heavy/Thwackblade pair counts as Heavy Attack DMG; basics stay Basic Attack DMG).
const EBA1 = roverAction("Basic - Umbra 1", { castPriority: 2, requireBuff: DARK_SURGE, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 5637, energy: 42, concerto: 72, offtune: 1440 }] });
const EBA2 = roverAction("Basic - Umbra 2", { chains: [EBA1], castPriority: 2, requireBuff: DARK_SURGE, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 9394, energy: 70, concerto: 120, offtune: 2560 }] });
// "Use Basic Attack after casting Heavy Attack Thwackblade to cast Enhanced Basic Attack 3"
const EBA3 = roverAction("Basic - Umbra 3", { chains: () => [EBA2, EHA2], castPriority: 2, requireBuff: DARK_SURGE, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 15567, energy: 116, concerto: 198, offtune: 4480 }] });
// PLACEHOLDER FRAMES
const EBA4 = roverAction("Basic - Umbra 4", { chains: [EBA3], castPriority: 2, requireBuff: DARK_SURGE, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 3713, energy: 27.33, concerto: 47.17, offtune: 2213.3333 },
    { hitFrame: 0, mv: 3713, energy: 27.33, concerto: 47.17, offtune: 2213.3333 },
    { hitFrame: 0, mv: 3713, energy: 27.33, concerto: 47.17, offtune: 2213.3333 },
    { hitFrame: 0, mv: 11139, energy: 82.01, concerto: 141.49, offtune: 6640.0001 },
  ]});
// updateDebuffs is her own healing marker, read by every healing sonata and weapon (statuses.ts)
// — applied to the healer alone, never the team
// PLACEHOLDER FRAMES
const EBA5 = roverAction("Basic - Umbra 5", { chains: [EBA4], requireBuff: DARK_SURGE,
  animFrames: 63, castPriority: 2,
  node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 24, mv: 2852, energy: 21.25, concerto: 22.63, offtune: 7040.3086,
      updateDebuffs: () => applyCurrent(HEALS, 1) },
    { hitFrame: 24, mv: 2852, energy: 21.25, concerto: 22.63, offtune: 7040.3086 },
    { hitFrame: 24, mv: 2852, energy: 21.25, concerto: 22.63, offtune: 7040.3086 },
    { hitFrame: 24, mv: 2852, energy: 21.25, concerto: 22.63, offtune: 7040.3086 },
    { hitFrame: 24, mv: 11407, energy: 85, concerto: 90.48, offtune: 28158.7656 },
  ],
});

const EMA = roverAction("Mid-air - Umbra Plunge", { castPosition: Position.Midair, endPosition: Position.Grounded, castPriority: 6, requireBuff: DARK_SURGE, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 12327, energy: 41, concerto: 100, offtune: 9600 }] });
const EDC = roverAction("Dodge Counter - Umbra", { chains: [DODGE], castPriority: 8, requireBuff: DARK_SURGE, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 31671, energy: 236, concerto: 198, offtune: 4640 }], castConcerto: 1000 });

const EHA = roverAction("Heavy - Umbra", { requireBuff: DARK_SURGE, animFrames: 43, castPriority: 6, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 43, mv: 12883, energy: 96, concerto: 164, offtune: 6400 }] });
// PLACEHOLDER FRAMES
const EHA2 = roverAction("Heavy - Umbra: Thwackblade", { chains: [EHA], requireBuff: DARK_SURGE, animFrames: 42, castPriority: 6, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 42, mv: 12665, energy: 94.35, concerto: 161.31, offtune: 6622.7792 },
    { hitFrame: 42, mv: 995, energy: 7.41, concerto: 12.67, offtune: 520.3052 },
    { hitFrame: 42, mv: 995, energy: 7.41, concerto: 12.67, offtune: 520.3052 },
    { hitFrame: 42, mv: 995, energy: 7.41, concerto: 12.67, offtune: 520.3052 },
    { hitFrame: 42, mv: 995, energy: 7.42, concerto: 12.68, offtune: 520.3052 },
  ]});

// --- resonance skill: Wingblade outside Dark Surge, Lifetaker inside it — both share
//     cast: Cast.Skill (S1's own "Resonance Skill DMG" wording covers either).
/** Wingblade and Umbra: Lifetaker share one 12s cooldown. */
const SKILL_CD = new Cooldown({ frames: 60 * 12 });
// PLACEHOLDER FRAMES
const Skill = roverAction("Skill - Wingblade", { animFrames: 66, castPriority: 4, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 66, mv: 28629, energy: 600, offtune: 4320 },
    { hitFrame: 66, mv: 28629, energy: 600, offtune: 4320, forte1: 39 },
  ], castConcerto: 1500});
// PLACEHOLDER FRAMES
const ESkill = roverAction("Skill - Umbra: Lifetaker", { requireBuff: DARK_SURGE, animFrames: 66, castPriority: 4, cooldown: SKILL_CD, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 66, mv: 27635, energy: 373.13, offtune: 5440.2471 },
    { hitFrame: 66, mv: 27635, energy: 373.13, offtune: 5440.2471 },
    { hitFrame: 66, mv: 995, energy: 13.43, offtune: 195.8765 },
    { hitFrame: 66, mv: 995, energy: 13.43, offtune: 195.8765 },
    { hitFrame: 66, mv: 995, energy: 13.43, offtune: 195.8765 },
    { hitFrame: 66, mv: 995, energy: 13.45, offtune: 195.8763, forte1: 39 },
  ], castConcerto: 1500});

// --- liberation: Deadening Abyss — also shreds the target's own Havoc RES (S4)
const Liberation = roverAction("Liberation - Deadening Abyss", { animFrames: 139, timestop: [0, 139], motionStop: [0, 139], castPriority: 10, cooldown: 60 * 16, node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 139, mv: 152090, offtune: 53760 }], castConcerto: 2000, resetEnergy: true });

// --- intro / outro
const Intro = roverAction("Intro - Instant of Annihilation", { endPosition: Position.Grounded, animFrames: 60, castPriority: 11, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 60, mv: 19881, energy: 1000, offtune: 1867, forte1: 29 }], castConcerto: 1000 });
/** Soundweaver: a Havoc Field, 3 ticks over 6s, lumped into one action. No Skill Attributes/
 *  Damage Data table on the page at all, so energy/concerto/offtune stay 0 — a real absence. */
const Outro = roverAction("Outro - Soundweaver", { cast: Cast.Outro, type: Type.Outro, bullets: [{ hitFrame: 0, mv: 42990 }], minConcerto: 10000, castConcerto: -10000});

/* ------------------------------------------------------------------------------------ buffs */

/** Metamorph (Inherent Skill): +20% Havoc DMG Bonus while Dark Surge is held. */
const RH_INHERENT_1 = new Inherent({
  name: "Inherent: Metamorph",
  applyStats: () => { if (isHeld(DARK_SURGE)) addStat(Stat.DmgBonus, 20, Attribute.Havoc); },
});
/** Bleak Crescendo (Inherent Skill): +1 Energy per Basic Attack hit while in Dark Surge (its own
 *  1/s ICD not modelled, same as every other ICD-gated passive elsewhere). */
const RH_INHERENT_2 = new Inherent({
  name: "Inherent: Bleak Crescendo",
  updateDebuffs: () => {
    if (isHeld(DARK_SURGE) && casting(Cast.Basic)) addGain({ energy: 100 });
  }
});

/** S4 Annihilated Silence: a genuine enemy debuff (target-side RES shred, not a personal ignore),
 *  its stated 20s. Trigger in `ROVER_S4` below. */
const S4_RES_SHRED = new Debuff({
  name: "Havoc Rover S4: Annihilated Silence",
  duration: 60 * 20,
  applyStats: () => addEnemyStat(EnemyStat.ResReduce, 10, Attribute.Havoc),
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
  outro: Outro,
  swapIn: () => (isHeld(DARK_SURGE) ? EBA1 : BA1),
  swapInAir: () => (isHeld(DARK_SURGE) ? EMA : MA),
  maxEnergy: 12500,
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
  START, Liberation, ECHO.instaSwap(),

  INTRO, BA12345,
  Skill, Devastation, ESkill,
  EBA12345, EBA12345, EBA1,
  Liberation, Skill, ECHO.instaSwap(), OUTRO,
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
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Skill, Substat.Heavy),
    rotation: RH_ROTATION,
  sequences: [ROVER_S1, ROVER_S2, ROVER_S3, ROVER_S4, ROVER_S5, ROVER_S6],
});
