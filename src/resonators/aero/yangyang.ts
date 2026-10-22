/**
 * Yangyang, an Aero Sword 4-star support. `Tier.Free` — a 4-star, so all six sequence nodes are
 * always-equipped pieces folded into her loadout. Melody (forte1, 0-3) is banked one at a time by
 * the Intro, the Skill, Basic Attack Stage 4 and Zephyr Song; at three the Heavy Attack and Dodge
 * Counter become Stormy Strike, which launches her, and the mid-air Basic becomes Feather Release,
 * which spends them all.
 *
 * Numbers: MVs and per-hit gauges from wuwalab (character `yangyang`), checked against encore.moe's
 * 1402 rows — every hit's MV, energy, concerto and off-tune agree; flat Concerto Regen rows from encore.
 */
import { Tier, Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget, Position } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addGain,
  addStat,
  applyCurrent,
  forte1,
  isHeld,
  isType,
  onAction,
  queueQTE,
  runningAction,
} from "../../engine/context.js";
import { Action, ActionGroup, Rotation, SWAPIN, DODGE } from "../../engine/rotation.js";
import { tuneBreak, SWORD_BREAK } from "../../shared/tunebreak.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC, ACTION_HERON } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { Echoes } from "../../shared/echoes.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function yangyangAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

const Intro = yangyangAction("Intro - Cerulean Song", {
  endPosition: Position.Grounded, qteFrames: 34, animFrames: 54, noSwapFrames: 48, animPriority: { 0: 11, 54: 1 }, castPriority: 11, motionStop: [0, 36],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 38, mv: 7952, energy: 500, offtune: 3600 },
    { hitFrame: 44, commitFrame: 38, mv: 7952, energy: 500, offtune: 3600 },
  ], castConcerto: 1000, castForte1: 1,
});
const Outro = yangyangAction("Outro - Whispering Breeze", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => queueQTE(WHISPERING_BREEZE),
});

const BA1 = yangyangAction("Basic - Feather as Blade 1", { animFrames: 21, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 10, mv: 4473, energy: 75, concerto: 240, offtune: 2400 }]});
const BA2 = yangyangAction("Basic - Feather as Blade 2", { chains: [BA1], animFrames: 27, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 13, mv: 5964, energy: 100, concerto: 320, offtune: 3200 }]});
const BA3 = yangyangAction("Basic - Feather as Blade 3", { chains: [BA2], animFrames: 43, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 13, mv: 4681, energy: 78, concerto: 251, offtune: 2520 },
    { hitFrame: 28, mv: 4681, energy: 78, concerto: 251, offtune: 2520 },
  ]});
// Stage 4's last hit banks a Melody
const BA4 = yangyangAction("Basic - Feather as Blade 4", { chains: [BA3], animFrames: 69, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 5, mv: 5936, energy: 100, concerto: 318, offtune: 3192 },
    { hitFrame: 16, mv: 5936, energy: 100, concerto: 318, offtune: 3192 },
    { hitFrame: 48, mv: 7914, energy: 132, concerto: 424, offtune: 4256, forte1: 1 },
  ]});

// at three Melodies the Heavy Attack, Dodge Counter and mid-air Basic are their Stormy Strike /
// Feather Release forms instead
const HA = yangyangAction("Heavy - Feather as Blade", { maxForte1: 2, animFrames: 34, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 15, mv: 1988, energy: 33, concerto: 106, offtune: 1067 },
    { hitFrame: 19, commitFrame: 15, mv: 1988, energy: 33, concerto: 106, offtune: 1067 },
    { hitFrame: 23, commitFrame: 15, mv: 1988, energy: 33, concerto: 106, offtune: 1067 },
  ]});
const DC = yangyangAction("Dodge Counter - Feather as Blade", { chains: [DODGE], maxForte1: 2, animFrames: 35, animPriority: { 0: 8, 7: 2 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Heavy, bullets: [
    { hitFrame: 21, mv: 8707, energy: 136, concerto: 198, offtune: 2000 },
    { hitFrame: 27, commitFrame: 21, mv: 8707, energy: 136, concerto: 198, offtune: 2000 },
  ], castConcerto: 1000});
// "Use Basic Attack after Heavy Attack or Dodge Counter"; deals Heavy Attack DMG and banks a Melody
const ZephyrSong = yangyangAction("Basic - Zephyr Song", { chains: [HA, DC], animFrames: 43, animPriority: { 0: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 11, commitFrame: 2, mv: 10661, energy: 178, concerto: 572, offtune: 5760, forte1: 1 },
  ]});
const MA = yangyangAction("Mid-air - Feather as Blade Plunge", { castPosition: Position.Midair, endPosition: Position.Grounded, maxForte1: 2, animFrames: 57, animPriority: { 0: 6, 45: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 33, mv: 9244, energy: 51, concerto: 100, offtune: 4960 },
  ]});

// Stormy Strike is the Heavy Attack (or its counter) carried on into two more hits that launch her
const STORMY = [
  { hitFrame: 31, mv: 3802, energy: 63, concerto: 204, offtune: 2040 },
  { hitFrame: 39, mv: 3802, energy: 63, concerto: 204, offtune: 2040 },
];
const StormyStrike = yangyangAction("Heavy - Stormy Strike", { endPosition: Position.Midair, minForte1: 3, animFrames: 48, animPriority: { 0: 2 }, castPriority: 2, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 15, mv: 1988, energy: 33, concerto: 106, offtune: 1067 },
    { hitFrame: 19, commitFrame: 15, mv: 1988, energy: 33, concerto: 106, offtune: 1067 },
    { hitFrame: 23, commitFrame: 15, mv: 1988, energy: 33, concerto: 106, offtune: 1067 },
    ...STORMY,
  ]});
const StormyDC = yangyangAction("Dodge Counter - Stormy Strike", { chains: [DODGE], endPosition: Position.Midair, minForte1: 3, animFrames: 64, animPriority: { 0: 8, 7: 2 }, castPriority: 8, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Heavy, bullets: [
    { hitFrame: 21, mv: 8707, energy: 136, concerto: 198, offtune: 2000 },
    { hitFrame: 27, commitFrame: 21, mv: 8707, energy: 136, concerto: 198, offtune: 2000 },
    { hitFrame: 47, mv: 3802, energy: 63, concerto: 204, offtune: 2040 },
    { hitFrame: 54, mv: 3802, energy: 63, concerto: 204, offtune: 2040 },
  ], castConcerto: 1000});
// "cast Basic Attack in mid-air to consume all Melodies", the last hit the sheathe as she lands
const FeatherRelease = yangyangAction("Forte Mid-air - Feather Release", { castPosition: Position.Midair, endPosition: Position.Grounded, minForte1: 3, resetForte1: true,
  animFrames: 119, animPriority: { 0: 6, 62: 2 }, castPriority: 6,
  node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 2173, energy: 36, concerto: 100, offtune: 1167 },
    { hitFrame: 21, mv: 2173, energy: 36, concerto: 100, offtune: 1167 },
    { hitFrame: 27, mv: 2173, energy: 36, concerto: 100, offtune: 1167 },
    { hitFrame: 34, mv: 2173, energy: 36, concerto: 100, offtune: 1167 },
    { hitFrame: 57, mv: 2173, energy: 36, concerto: 100, offtune: 1167 },
    { hitFrame: 58, mv: 12681, energy: 212, concerto: 400, offtune: 6804 },
    { hitFrame: 95, mv: 12681, energy: 212, concerto: 400, offtune: 6804 },
  ], castConcerto: 3000,
});

// banks its Melody on cast (wuwalab's frame-0 resource gain)
const Skill = yangyangAction("Skill - Zephyr Domain", { animFrames: 44, animPriority: { 0: 4, 44: 2 }, castPriority: 4, cooldown: 60 * 10, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 17, mv: 3453, energy: 118, offtune: 590 },
    { hitFrame: 29, commitFrame: 17, mv: 3453, energy: 118, offtune: 590 },
    { hitFrame: 41, commitFrame: 17, mv: 3453, energy: 118, offtune: 590 },
    { hitFrame: 53, commitFrame: 17, mv: 3453, energy: 118, offtune: 590 },
    { hitFrame: 71, commitFrame: 17, mv: 20719, energy: 710, offtune: 3538 },
  ], castConcerto: 1500, castForte1: 1});

const SPIRAL = { commitFrame: 63, mv: 4658, offtune: 3072 };
const Liberation = yangyangAction("Liberation - Wind Spirals", { animFrames: 133, animPriority: { 0: 10 }, castPriority: 10, timestop: [0, 133], motionStop: [0, 69], cooldown: 60 * 16,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    { hitFrame: 75, ...SPIRAL },
    { hitFrame: 83, ...SPIRAL },
    { hitFrame: 92, ...SPIRAL },
    { hitFrame: 100, ...SPIRAL },
    { hitFrame: 109, ...SPIRAL },
    { hitFrame: 117, ...SPIRAL },
    { hitFrame: 125, ...SPIRAL },
    { hitFrame: 134, ...SPIRAL },
    { hitFrame: 142, ...SPIRAL },
    { hitFrame: 151, ...SPIRAL },
    { hitFrame: 159, ...SPIRAL },
    { hitFrame: 167, ...SPIRAL },
    { hitFrame: 186, commitFrame: 63, mv: 37270, offtune: 24576 },
  ], castConcerto: 2000, castEnergy: -10000,
});

/* ------------------------------------------------------------------------------------ buffs */

/** Lazuline Mercy (Inherent Skill): +8% Aero DMG Bonus for 8s after Intro. */
const LAZULINE_MERCY = new Buff({
  name: "Inherent: Lazuline Mercy",
  duration: 60 * 8,
  stats: [[Stat.DmgBonus, 8, Attribute.Aero]],
});
const YY_INHERENT_1 = new Inherent({
  name: "Inherent: Lazuline Mercy",
  grants: [{ on: onAction(Intro), buff: LAZULINE_MERCY }],
});
/** Compassion (Inherent Skill): 30 STA back after Feather Release — no stat, held for the name. */
const YY_INHERENT_2 = new Inherent({ name: "Inherent: Compassion" });

/** Whispering Breeze (Outro): the incoming resonator restores 4 Resonance Energy a second for 5s,
 *  flat, banked on each second's tick. */
const WHISPERING_BREEZE = new Buff({
  name: "Yangyang: Outro",
  duration: 60 * 5,
  tick: { every: 60, fire: () => addGain({ energy: 400 }) },
});

/** S1: Intro adds another +15% Aero DMG Bonus for 8s. */
const S1_AERO = new Buff({
  name: "Yangyang S1: Sapphire Skies, Soaring Sparrows",
  duration: 60 * 8,
  stats: [[Stat.DmgBonus, 15, Attribute.Aero]],
});
/** S2's 20s window between its Energy payouts. */
const S2_COOLDOWN = new Buff({ name: "Yangyang S2: cooldown", duration: 60 * 20 });
/** S6: +20% ATK to the whole team for 20s after Feather Release. */
const S6_TEAM_ATK = new Buff({
  name: "Yangyang S6: A Tribute to Life's Sweet Hymn",
  duration: 60 * 20,
  stats: [[Stat.BonusAtk, 20]],
});

/* -------------------------------------------------------------------------------- sequences */

const YY_S1 = new Sequence({
  name: "Yangyang S1: Sapphire Skies, Soaring Sparrows",
  grants: [{ on: onAction(Intro), buff: S1_AERO }],
});

/** S2: a Heavy Attack hit restores 10 more Energy, once every 20s. */
const YY_S2 = new Sequence({
  name: "Yangyang S2: Nesting Twigs, in Beaks They Harrow",
  updateDebuffs: () => {
    if (!isType(Type.Heavy) || isHeld(S2_COOLDOWN)) return;
    addGain({ energy: 1000 });
    applyCurrent(S2_COOLDOWN, 1);
  },
});

/** S3: +40% Resonance Skill DMG Bonus; the wider pull is no stat. */
const YY_S3 = new Sequence({
  name: "Yangyang S3: Nature Sings in Symphony",
  stats: [[Stat.DmgBonus, 40, Type.Skill]],
});

/** S4: Feather Release deals 95% more DMG. */
const YY_S4 = new Sequence({
  name: "Yangyang S4: Close Your Eyes and Listen in",
  applyStats: () => { if (runningAction(FeatherRelease)) addStat(Stat.DmgBonus, 95); },
});

/** S5: Wind Spirals deals 85% more DMG. */
const YY_S5 = new Sequence({
  name: "Yangyang S5: Winds Whisper in Harmony",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.DmgBonus, 85); },
});

const YY_S6 = new Sequence({
  name: "Yangyang S6: A Tribute to Life's Sweet Hymn",
  grants: [{ on: onAction(FeatherRelease), buff: S6_TEAM_ATK, to: BuffTarget.Team }],
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const YANGYANG_TALENTS = new Talent({
  name: "Yangyang: Talents",
  stats: [[Stat.BonusAtk, 11.9999997], [Stat.DmgBonus, 12, Attribute.Aero]],
});

const YANGYANG_RESONATOR = new Resonator({
  id: 1402,
  name: "Yangyang",
  talent: YANGYANG_TALENTS,
  inherent1: YY_INHERENT_1,
  inherent2: YY_INHERENT_2,
  element: Attribute.Aero,
  weapon: WeaponType.Sword,
  color: "#4e82d9",
  intro: Intro,
  swapIn: BA1,
  swapInAir: () => (forte1() >= 3 ? FeatherRelease : MA),
  tuneBreak: tuneBreak(89, 89, [0, 90], [0, 70], SWORD_BREAK),
  maxEnergy: 10000,
  maxForte1: 3,
  tier: Tier.Free,

  stats: [[Stat.BaseHp, 10200], [Stat.BaseAtk, 250], [Stat.BaseDef, 1099.998]],
});

/* ---------------------------------------------------------------------------------- rotation */

// Intro, Skill and Stage 4 are the three Melodies (the opener's Zephyr Song stands in for the
// Intro); Stormy Strike launches her into Feather Release, then Wind Spirals and the Heron.
const BA1234 = new ActionGroup("Basic - Feather as Blade 1234", [BA1, BA2, BA3, BA4]);


// claude generated
const YY_ROTATION = new Rotation([
  SWAPIN, BA1234.cancel(), Skill, HA, ZephyrSong,
  StormyStrike, FeatherRelease.cancel(), Liberation, ACTION_HERON.instaSwap(), Outro,

  Intro, Skill, BA1234,
  StormyStrike, FeatherRelease.cancel(), Liberation, ACTION_HERON.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

export const YANGYANG = new Loadout({
  id: 14021,
  resonator: YANGYANG_RESONATOR,
  weapons: [EMERALD_OF_GENESIS],
  echoes: new Echoes({
    sets: [new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)],
    mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
    substats: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Basic),
    highSubstats: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Basic, Substat.Skill),
  }),
  rotation: YY_ROTATION,
  sequences: [YY_S1, YY_S2, YY_S3, YY_S4, YY_S5, YY_S6],
});
