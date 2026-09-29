/**
 * Iuno, ported to the new engine — Sequences 1-6 in their own block below. An aero support: shields herself
 * and the team almost every action (Waxing Ascent); her intro/outro hand off a big Heavy Attack
 * amplification window (From Gloom to Gleam).
 *
 * Numbers from nanoka.cc (character 1410, https://ww.nanoka.cc/character/1410); forte1 (Lunar
 * Cycle) deltas come off the migrated (old-engine) sheet instead, cross-checked where it also
 * gives a combined row (BA123 = BA1+BA2+BA3, FMA123 = FMA1+FMA2+FMA3, both exact).
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  stacksOfTeam,
  applyCurrent,
  applyTeam,
  currentAction,
  runningAction,
  casting,
  queueOutro,
  addStat,
  frozenStacks,
  applied,
  forte1,
  currentTeam,
  applyOthers,
  elapsed,
  resetCooldown,
  runningAnyOf,
  onApplied,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, ECHO, INTRO } from "../../engine/rotation.js";
import { SHIELD, gainShield } from "../../shared/status.js";
import { IUNO_SIG, VERITYS_HANDLE } from "../../weapons/gauntlet.js";
import { MARCATO, NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import { MYA, COV_3PC } from "../../echoes/septimont.js";
import { WINDWARD_5PC, NM_KELPIE } from "../../echoes/rinascita.js";
import { SIERRA_GALE_2PC, HERON, MOONLIT_CLOUDS_5PC, REJUV_5PC, FALLACY } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function iunoAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- basics and dodge counter, all shielding
const BA1 = iunoAction("Basic - Moonring 1", { animFrames: 29, commitFrames: 16, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 16, mv: 87.68, energy: 1.23, concerto: 1.23, offtune: 3920, forte1: 5 }]});
const BA2 = iunoAction("Basic - Moonring 2", { animFrames: 51, commitFrames: 42, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 25, mv: 46.06, energy: 0.65, concerto: 0.65, offtune: 2060 },
    { at: 32, mv: 46.06, energy: 0.65, concerto: 0.65, offtune: 2060 },
    { at: 42, mv: 47.46, energy: 0.67, concerto: 0.67, offtune: 2122, forte1: 10 },
  ]});
const BA3 = iunoAction("Basic - Moonring 3", { animFrames: 100, commitFrames: 67, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 29, mv: 87.98, energy: 1.23, concerto: 1.23, offtune: 3934 },
    { at: 56, mv: 87.98, energy: 1.23, concerto: 1.23, offtune: 3934 },
    { at: 67, mv: 90.65, energy: 1.27, concerto: 1.27, offtune: 4053, forte1: 20 },
  ]});
const DC = iunoAction("Dodge Counter - Moonring", { animFrames: 51, commitFrames: 42, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 25, mv: 82.08, energy: 0.66, concerto: 4.6097, offtune: 2086 },
    { at: 32, mv: 82.08, energy: 0.66, concerto: 4.6097, offtune: 2086 },
    { at: 42, mv: 84.57, energy: 0.68, concerto: 4.7506, offtune: 2149, forte1: 10 },
  ]});

const BA123 = new ActionGroup("Basic - Moonring 123", [BA1, BA2, BA3]);

// --- Moonbow basics (Lunar Cycle - New Moon), considered liberation damage; also shield
const MA1 = iunoAction("Basic - Moonbow 1", { animFrames: 34, commitFrames: 15, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, hits: [{ at: 15, mv: 126.45, energy: 2.33, concerto: 2.65, offtune: 4240 }]});
const MA2 = iunoAction("Basic - Moonbow 2", { animFrames: 45, commitFrames: 24, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, hits: [
    { at: 10, mv: 55.67, energy: 1.09, concerto: 1.17, offtune: 1867 },
    { at: 17, mv: 55.67, energy: 1.09, concerto: 1.17, offtune: 1867 },
    { at: 24, mv: 55.67, energy: 1.09, concerto: 1.17, offtune: 1867 },
  ]});
const MA3 = iunoAction("Basic - Moonbow 3", { animFrames: 92, commitFrames: 53, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, hits: [
    { at: 18, mv: 167.01, energy: 3, concerto: 3.5, offtune: 5600 },
    { at: 53, mv: 167.01, energy: 3, concerto: 3.5, offtune: 5600 },
  ]});
const MDC = iunoAction("Dodge Counter - Moonbow", { animFrames: 45, commitFrames: 24, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Liberation, hits: [
    { at: 10, mv: 103.39, energy: 0.59, concerto: 4.5033, offtune: 1867 },
    { at: 17, mv: 103.39, energy: 0.59, concerto: 4.5033, offtune: 1867 },
    { at: 24, mv: 103.39, energy: 0.59, concerto: 4.5034, offtune: 1867 },
  ]});

const MA123 = new ActionGroup("Basic - Moonbow 123", [MA1, MA2, MA3]);

// --- resonance skill
const Skill = iunoAction("Skill - Pulse of Origins", { animFrames: 69, commitFrames: 58, cooldown: 60 * 6, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 28, mv: 18.65, energy: 0.33, offtune: 578 },
    { at: 32, mv: 18.65, energy: 0.33, offtune: 578 },
    { at: 35, mv: 18.65, energy: 0.33, offtune: 578 },
    { at: 39, mv: 18.65, energy: 0.33, offtune: 578 },
    { at: 42, mv: 18.65, energy: 0.33, offtune: 578 },
    { at: 46, mv: 18.65, energy: 0.33, offtune: 578 },
    { at: 50, mv: 18.65, energy: 0.33, offtune: 578 },
    { at: 58, mv: 130.52, energy: 2.27, offtune: 4040 },
  ], castConcerto: 6});
const ESkill = iunoAction("Skill - Closing Refrain", { animFrames: 109, commitFrames: 82, cooldown: 60 * 8, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 14, mv: 140.73, energy: 2.69, offtune: 4356 },
    { at: 74, mv: 140.73, energy: 2.69, offtune: 4356 },
    { at: 82, mv: 145, energy: 2.77, offtune: 4488 },
  ], castConcerto: 8, castForte1: 25});
/** Arc Beyond the Edge: 2 charges on a 10s cooldown, its enhanced form the same press. */
const ARC_CD = new Cooldown({ frames: 60 * 10, charges: 2 });
const MSkill = iunoAction("Skill - Arc Beyond the Edge", { animFrames: 85, commitFrames: 50, cooldown: ARC_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Liberation, hits: [
    { at: 50, mv: 219.79, energy: 4.68, offtune: 5360 },
    { at: 78, mv: 219.79, energy: 4.68, offtune: 5360 },
  ], castConcerto: 8});

// --- liberation: shields and grants Blessing
const Liberation = iunoAction("Liberation - Beneath Lunar Tides", {
  animFrames: 250, commitFrames: 240, timestop: 240, motionStop: 240, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, hits: [{ at: 196, mv: 1093.46, offtune: 96000 }], castConcerto: 20, castForte1: 60, resetEnergy: true,
});

// --- intro / outro
const Intro = iunoAction("Intro - Illuminated Manifestation", {
  animFrames: 81, commitFrames: 81, motionStop: 27,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 48, mv: 15.91, energy: 1, offtune: 1040 },
    { at: 52, mv: 15.91, energy: 1, offtune: 1040 },
    { at: 55, mv: 15.91, energy: 1, offtune: 1040 },
    { at: 59, mv: 15.91, energy: 1, offtune: 1040 },
    { at: 62, mv: 15.91, energy: 1, offtune: 1040 },
    { at: 66, mv: 15.91, energy: 1, offtune: 1040 },
    { at: 70, mv: 15.91, energy: 1, offtune: 1040 },
    { at: 76, mv: 47.72, energy: 3, offtune: 3120 },
  ], castConcerto: 10, castForte1: 40,
});
const Outro = iunoAction("Outro - From Gloom to Gleam", {
  animFrames: 0, commitFrames: 0,
  cast: Cast.Outro, type: Type.Outro, hits: [{ at: 0, mv: 100 }], castConcerto: -100,
  updateBuffs: () => queueOutro(IUNO_OUTRO),
});

// --- forte (jump / Flux) casts, all liberation damage while in Lunar Cycle, same shielding
const JumpHeavy = iunoAction("Heavy - Flux: Moonbow", { animFrames: 86, commitFrames: 70, node: Node.Forte, cast: Cast.Heavy, type: Type.Liberation, hits: [{ at: 70, mv: 250.51, energy: 3.5, concerto: 7, offtune: 11200 }]});
const FJump = iunoAction("Heavy - Flux: Moonring", { animFrames: 114, commitFrames: 97, node: Node.Forte, cast: Cast.Heavy, type: Type.Liberation, hits: [
    { at: 66, mv: 79.18, energy: 1.11, concerto: 2.22, offtune: 3540 },
    { at: 82, mv: 79.18, energy: 1.11, concerto: 2.22, offtune: 3540 },
    { at: 90, mv: 79.18, energy: 1.11, concerto: 2.22, offtune: 3540 },
    { at: 97, mv: 79.18, energy: 1.11, concerto: 2.22, offtune: 3540 },
  ]});
const FMA1 = iunoAction("Forte Basic - Enhanced Moonbow 1", { animFrames: 34, commitFrames: 15, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, hits: [{ at: 15, mv: 205.97, energy: 2.33, concerto: 2.65, offtune: 4240 }], castConcerto: 4, castForte1: -10});
const FMA2 = iunoAction("Forte Basic - Enhanced Moonbow 2", { animFrames: 45, commitFrames: 24, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, hits: [
    { at: 10, mv: 95.43, energy: 1.09, concerto: 1.17, offtune: 1867 },
    { at: 17, mv: 95.43, energy: 1.09, concerto: 1.17, offtune: 1867 },
    { at: 24, mv: 95.43, energy: 1.09, concerto: 1.17, offtune: 1867 },
  ], castConcerto: 6, castForte1: -15});
const FMA3 = iunoAction("Forte Basic - Enhanced Moonbow 3", { animFrames: 92, commitFrames: 53, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, hits: [
    { at: 18, mv: 266.41, energy: 3, concerto: 3.5, offtune: 5600 },
    { at: 53, mv: 266.41, energy: 3, concerto: 3.5, offtune: 5600 },
  ], castConcerto: 10, castForte1: -25});
const FMSkill = iunoAction("Forte Skill - Enhanced Arc Beyond the Edge", { animFrames: 85, commitFrames: 50, cooldown: ARC_CD, node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, hits: [
    { at: 50, mv: 319.19, energy: 4.68, offtune: 5360 },
    { at: 78, mv: 319.19, energy: 4.68, offtune: 5360 },
  ], castConcerto: 18, castForte1: -25});

const FMA123 = new ActionGroup("Forte - Enhanced Moonbow 123", [FMA1, FMA2, FMA3]);

/** Ends Lunar Cycle and conjures the Full Moon domain. */
const FHA = iunoAction("Heavy - Absolute Fullness", {
  animFrames: 89, commitFrames: 66,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Liberation, hits: [{ at: 66, mv: 159.05, energy: 5, offtune: 2400 }],
  updateBuffs: () => applyTeam(IUNO_DOMAIN, 1),
});

/* ------------------------------------------------------------------------------------ buffs */

/** 4% all-damage amplification a stack, ten stacks — amp, not bonus, so it multiplies its own
 *  term. Lost entirely if switched off field. S2 pays a full ten stacks 40% more, read off her
 *  own slot: the node is her local gear and this buff sits on whoever was shielded. */
const IUNO_BLESSING = new Buff({
  name: "Iuno: Blessing of the Wan Light", maxStacks: 10, duration: 60 * 10,
  stats: [[Stat.Amp, 4]], perStack: true,
  applyStats: () => {
    if (frozenStacks() >= 10 && currentTeam().slots.find((m) => m.resonator === IUNO_RESONATOR)?.isHeld(IO_S2)) {
      asSource(IO_S2, () => addStat(Stat.Amp, 40));
    }
  },
  lostOnSwap: true,
});

/** What FHA leaves at her feet — team-wide, permanent uptime. Its grant fires on every member's
 *  hit; Blessing still stacks per-member off their own shielding. */
const IUNO_DOMAIN = new Buff({
  name: "Iuno: Full Moon Domain", duration: 60 * 30,
  grants: [{ on: onApplied(SHIELD), buff: IUNO_BLESSING, stacks: () => applied(SHIELD) }],
  // S1's own point of Energy a second is paid by that node (it reads this domain instead)
});

const IO_INHERENT_2 = new Inherent({
  name: "Inherent: Derivation",
  updateBuffs: () => { if (casting(Cast.Intro) || casting(Cast.Liberation)) applyCurrent(IUNO_BLESSING, 5); },
});
const IO_INHERENT_1 = new Inherent({ name: "Inherent: Waxing Ascent" }); // gains shields

/** The window her outro hands the incoming resonator. */
const IUNO_OUTRO = new Buff({
  name: "Iuno: Outro",
  duration: 60 * 14,
  stats: [[Stat.Amp, 50, Type.Heavy]],
  lostOnSwap: true,
});

/** Her casts inside Lunar Cycle — Flux either way, everything Moonbow, and Absolute Fullness, which
 *  is what ends it. Moonring presses can also land inside it (Half Moon), but no rotation here makes
 *  one there, so the state is read off the action rather than tracked. */
const LUNAR_CYCLE = new Set<Action>([JumpHeavy, FJump, MA1, MA2, MA3, MDC, MSkill, FMA1, FMA2, FMA3, FMSkill, FHA]);
/** The three S3 names: Moonbow - Basic Attack, Arc Beyond the Edge and Moonbow - Dodge Counter —
 *  the Sentience-spending forms are the same skills enhanced, so they count. */
const MOONBOW = new Set<Action>([MA1, MA2, MA3, MDC, MSkill, FMA1, FMA2, FMA3, FMSkill]);

const SHIELDING = new Set<Action>([
  BA1, BA2, BA3, DC, MA1, MA2, MA3, MDC, Skill, ESkill, MSkill, Liberation, Intro,
  JumpHeavy, FJump, FMA1, FMA2, FMA3, FMSkill, FHA,
]);

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const IUNO_TALENTS = new Talent({
  name: "Iuno: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const IUNO_RESONATOR = new Resonator({
  name: "Iuno",
  stats: [[Stat.BaseHp, 10525], [Stat.BaseAtk, 450], [Stat.BaseDef, 1124.4424]],
  talent: IUNO_TALENTS,
  inherent1: IO_INHERENT_1,
  inherent2: IO_INHERENT_2,
  element: Attribute.Aero,
  weapon: WeaponType.Gauntlets,
  color: "#2dd4c0",
  intro: Intro,
  maxEnergy: 125,
  maxForte1: 100,

  // every hit of hers but the Outro's shields, at the shield's own cooldown
  updateDebuffs: () => {
    if (runningAnyOf(SHIELDING)) gainShield();
  },

});


/* --------------------------------------------------------------------------------- sequences */

/** S1: +40% ATK while in Lunar Cycle; the point of Energy a second inside the domain is paid by
 *  the domain itself (above). The interrupt immunity is no stat. */
const IO_S1 = new Sequence({
  name: "Iuno S1: Wax or Wane, All Gild the Bough",
  applyStats: () => {
    if (runningAnyOf(LUNAR_CYCLE)) addStat(Stat.BonusAtk, 40);
    // a point of Energy a second while she herself stands in her own Full Moon Domain — this hook
    // runs on her turns alone, which is that condition
    if (stacksOfTeam(IUNO_DOMAIN) > 0) addStat(Stat.AddEnergy, elapsed() / 60);
  },
});

/** S2: +40% all DMG Amplification on top for anyone at ten Blessing stacks — paid by the Blessing
 *  itself (above). */
const IO_S2 = new Sequence({ name: "Iuno S2: Day or Night, Let This Be Eternal" });

/** S3: Moonbow presses, Arc Beyond the Edge and the Moonbow Dodge Counter amplified 65% while in
 *  Lunar Cycle. Its cycle-keeping half is control flow, not a stat. */
const IO_S3 = new Sequence({
  name: "Iuno S3: I Drink Deep of Their Forgetting",
  applyStats: () => { if (runningAnyOf(MOONBOW)) addStat(Stat.Amp, 65); },
});

/** S4: Absolute Fullness shields the whole team, and a shield gained inside the domain it conjures
 *  is a Blessing stack — she gains her own off that cast already, so the others get theirs here. */
const IO_S4 = new Sequence({
  name: "Iuno S4: Rainy Season Dwell in My Eyes",
  updateDebuffs: () => {
    if (runningAction(FHA)) applyOthers(IUNO_BLESSING, 1);
  },
});

/** S5: +20% Resonance Liberation DMG Bonus. */
const IO_S5 = new Sequence({
  name: "Iuno S5: A Thousand Futile Glimpses",
  stats: [[Stat.DmgBonus, 20, Type.Liberation]],
});

/** S6: Absolute Fullness gains 1600% of ATK on its multiplier — additive, nanoka's own S6 row is
 *  1759.05% against the plain 159.05% — and casting it puts her straight back into New Moon with a
 *  full 100 Sentience and both Arc charges: the second Moonbow string the S6 rotations press after it. */
const IO_S6 = new Sequence({
  name: "Iuno S6: I Am the Constant in the Chaos",
  applyStats: () => { if (runningAction(FHA)) { addStat(Stat.AddMv, 1600); addStat(Stat.AddForte1, 100); } },
  updateBuffs: () => { if (runningAction(FHA)) resetCooldown(ARC_CD); },
});

const IO_SEQUENCES = [IO_S1, IO_S2, IO_S3, IO_S4, IO_S5, IO_S6];

const IO_ROTATION = new Rotation([
  INTRO, ESkill.instaCancel(), ECHO.instaDodge(), Liberation, JumpHeavy,
  FMSkill, FMA123.cancel(), FMSkill.easyCancel(), 
  FHA.instaSwap(), Outro,
]);

const IO_ROTATION_MDPS = new Rotation([
  INTRO, ESkill.instaCancel(), // todo swap skill
  JumpHeavy,
  FMSkill, 
  FMA123.cancel(), Liberation, 
  FMA123.cancel(), FMSkill, 
  MA123.cancel(), 
  FHA.instaSwap(), Outro,
]);

/** The same at S6 — see IO_ROTATION_S6. */
const IO_ROTATION_MDPS_S6 = new Rotation([
  INTRO, Liberation, JumpHeavy,
  FMSkill, FMA123.cancel(), FMSkill.cancel(),
  FHA, 
  FMSkill, FMA123.cancel(), FMSkill, Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const IUNO = new Loadout({
  resonator: IUNO_RESONATOR,
  weapons: [IUNO_SIG, NEW_STD_GAUNTLET, MARCATO, ABYSS_SURGES, VERITYS_HANDLE],
  echoLoadouts: [
    new EchoLoadout(MYA, COV_3PC, SIERRA_GALE_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(FALLACY, REJUV_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  rotation: IO_ROTATION,
  sequences: IO_SEQUENCES,
});

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const IUNO_MDPS = new Loadout({
  resonator: IUNO_RESONATOR,
  weapons: [IUNO_SIG, NEW_STD_GAUNTLET, ABYSS_SURGES, VERITYS_HANDLE],
  echoLoadouts: [
    new EchoLoadout(MYA, COV_3PC, SIERRA_GALE_2PC),
    new EchoLoadout(NM_KELPIE, WINDWARD_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  rotation: { 0: IO_ROTATION_MDPS, 6: IO_ROTATION_MDPS_S6 },
  sequences: IO_SEQUENCES,
});
