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
  runningAction,
  casting,
  queueQTE,
  addStat,
  frozenStacks,
  applied,
  currentTeam,
  applyOthers,
  elapsed,
  resetCooldown,
  runningAnyOf,
  onApplied,
  addGain,
  isHeld,
  revokeCurrent,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, ECHO, INTRO, OUTRO } from "../../engine/rotation.js";
import { SHIELD } from "../../shared/status.js";
import { IUNO_SIG, VERITYS_HANDLE } from "../../weapons/gauntlet.js";
import { MARCATO, NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import { MYA, COV_3PC } from "../../echoes/septimont.js";
import { WINDWARD_5PC, NM_KELPIE } from "../../echoes/rinascita.js";
import { CARTETHYIA_RESONATOR } from "./cartethyia.js";
import { CIACCONA_RESONATOR } from "./ciaccona.js";
import { ROVER_AERO_RESONATOR } from "./rover_aero.js";
import { SIERRA_GALE_2PC, HERON, MOONLIT_CLOUDS_5PC, REJUV_5PC, FALLACY } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function iunoAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

/** Lunar Cycle, 15s: entered by Closing Refrain or the Liberation (Half Moon by default), ended
 *  by Absolute Fullness. Half Moon is Lunar Cycle without NEW_MOON. */
const LUNAR_CYCLE = new Buff({ name: "Iuno: Lunar Cycle", duration: 60 * 15 });
/** Lunar Cycle - New Moon: Flux: Moonbow switches into it, Flux: Moonring back out; it ends with
 *  the cycle, so the New Moon presses require it alone. */
const NEW_MOON = new Buff({ name: "Iuno: New Moon", lostWith: LUNAR_CYCLE });
/** "When not in Lunar Cycle, casting Moonring - Basic Attack Stage 3, Intro Skill, or Pulse of
 *  Origins replaces Iuno's Resonance Skill with Closing Refrain for 5s." */
const CLOSING_REFRAIN_READY = new Buff({ name: "Iuno: Closing Refrain Ready", duration: 60 * 5 });

// --- basics and dodge counter, all shielding
const BA1 = iunoAction("Basic - Moonring 1", { animFrames: 29, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 16, mv: 8768, energy: 123, concerto: 123, offtune: 3920, forte1: 5 }]});
const BA2 = iunoAction("Basic - Moonring 2", { animFrames: 51, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 25, mv: 4606, energy: 65, concerto: 65, offtune: 2060 },
    { hitFrame: 32, mv: 4606, energy: 65, concerto: 65, offtune: 2060 },
    { hitFrame: 42, mv: 4746, energy: 67, concerto: 67, offtune: 2122, forte1: 10 },
  ]});
const BA3 = iunoAction("Basic - Moonring 3", { animFrames: 100, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 29, mv: 8798, energy: 123, concerto: 123, offtune: 3934 },
    { hitFrame: 56, mv: 8798, energy: 123, concerto: 123, offtune: 3934 },
    { hitFrame: 67, mv: 9065, energy: 127, concerto: 127, offtune: 4053, forte1: 20 },
  ],
  updateBuffs: () => { if (!isHeld(LUNAR_CYCLE)) applyCurrent(CLOSING_REFRAIN_READY, 1); },
});
const DC = iunoAction("Dodge Counter - Moonring", { animFrames: 51, animPriority: { 0: 5, 51: 1 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 25, mv: 8208, energy: 66, concerto: 131, offtune: 2086 },
    { hitFrame: 32, mv: 8208, energy: 66, concerto: 131, offtune: 2086 },
    { hitFrame: 42, mv: 8457, energy: 68, concerto: 135, offtune: 2149, forte1: 10 },
  ], castConcerto: 1000});

const BA123 = new ActionGroup("Basic - Moonring 123", [BA1, BA2, BA3]);

// --- Moonbow basics (Lunar Cycle - New Moon), considered liberation damage; also shield
const MA1 = iunoAction("Basic - Moonbow 1", { requireBuff: NEW_MOON, animFrames: 34, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [{ hitFrame: 15, mv: 12645, energy: 233, concerto: 265, offtune: 4240 }]});
const MA2 = iunoAction("Basic - Moonbow 2", { requireBuff: NEW_MOON, animFrames: 45, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 10, mv: 5567, energy: 109, concerto: 117, offtune: 1867 },
    { hitFrame: 17, mv: 5567, energy: 109, concerto: 117, offtune: 1867 },
    { hitFrame: 24, mv: 5567, energy: 109, concerto: 117, offtune: 1867 },
  ]});
const MA3 = iunoAction("Basic - Moonbow 3", { requireBuff: NEW_MOON, animFrames: 92, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 18, mv: 16701, energy: 300, concerto: 350, offtune: 5600 },
    { hitFrame: 53, mv: 16701, energy: 300, concerto: 350, offtune: 5600 },
  ]});
const MDC = iunoAction("Dodge Counter - Moonbow", { requireBuff: NEW_MOON, animFrames: 45, animPriority: { 0: 5, 45: 1 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Liberation, bullets: [
    { hitFrame: 10, mv: 10339, energy: 59, concerto: 117, offtune: 1867 },
    { hitFrame: 17, mv: 10339, energy: 59, concerto: 117, offtune: 1867 },
    { hitFrame: 24, mv: 10339, energy: 59, concerto: 117, offtune: 1867 },
  ], castConcerto: 1000});

const MA123 = new ActionGroup("Basic - Moonbow 123", [MA1, MA2, MA3]);

// --- resonance skill
const Skill = iunoAction("Skill - Pulse of Origins", { animFrames: 69, animPriority: { 69: 2 }, castPriority: 4, cooldown: 60 * 6, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 28, mv: 1865, energy: 33, offtune: 578 },
    { hitFrame: 32, mv: 1865, energy: 33, offtune: 578 },
    { hitFrame: 35, mv: 1865, energy: 33, offtune: 578 },
    { hitFrame: 39, mv: 1865, energy: 33, offtune: 578 },
    { hitFrame: 42, mv: 1865, energy: 33, offtune: 578 },
    { hitFrame: 46, mv: 1865, energy: 33, offtune: 578 },
    { hitFrame: 50, mv: 1865, energy: 33, offtune: 578 },
    { hitFrame: 58, mv: 13052, energy: 227, offtune: 4040 },
  ], castConcerto: 600,
  updateBuffs: () => { if (!isHeld(LUNAR_CYCLE)) applyCurrent(CLOSING_REFRAIN_READY, 1); },
});
const ESkill = iunoAction("Skill - Closing Refrain", { requireBuff: CLOSING_REFRAIN_READY, animFrames: 109, animPriority: { 109: 2 }, castPriority: 4, cooldown: 60 * 8, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 14, mv: 14073, energy: 269, offtune: 4356 },
    { hitFrame: 74, mv: 14073, energy: 269, offtune: 4356 },
    { hitFrame: 82, mv: 14500, energy: 277, offtune: 4488 },
  ], castConcerto: 800, castForte1: 25,
  updateBuffs: () => revokeCurrent(CLOSING_REFRAIN_READY),
  // "deals Aero DMG, and activates Lunar Cycle": Half Moon unless already inside it
  afterAction: () => {
    if (!isHeld(LUNAR_CYCLE)) revokeCurrent(NEW_MOON);
    applyCurrent(LUNAR_CYCLE, 1);
  },
});
/** Arc Beyond the Edge: 2 charges on a 10s cooldown, its enhanced form the same press. */
const ARC_CD = new Cooldown({ frames: 60 * 10, charges: 2 });
const MSkill = iunoAction("Skill - Arc Beyond the Edge", { requireBuff: NEW_MOON, animFrames: 85, animPriority: { 85: 2 }, castPriority: 4, cooldown: ARC_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Liberation, bullets: [
    { hitFrame: 50, mv: 21979, energy: 468, offtune: 5360 },
    { hitFrame: 78, commitFrame: 50, mv: 21979, energy: 468, offtune: 5360 },
  ], castConcerto: 800});

// --- liberation: shields and grants Blessing
const Liberation = iunoAction("Liberation - Beneath Lunar Tides", {
  animFrames: 250, animPriority: { 240: 2 }, castPriority: 10, timestop: [0, 240], motionStop: [0, 240], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 196, mv: 109346, offtune: 96000 }], castConcerto: 2000, castForte1: 60, resetEnergy: true,
  // "Deal Aero DMG and activate the Lunar Cycle state": Half Moon unless already inside it
  afterAction: () => {
    if (!isHeld(LUNAR_CYCLE)) revokeCurrent(NEW_MOON);
    applyCurrent(LUNAR_CYCLE, 1);
  },
});

// --- intro / outro
const Intro = iunoAction("Intro - Illuminated Manifestation", {
  qteFrames: 36, animFrames: 81, noSwapFrames: 84, animPriority: { 81: 2 }, castPriority: 11, motionStop: [6, 32],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 48, mv: 1591, energy: 100, offtune: 1040 },
    { hitFrame: 52, mv: 1591, energy: 100, offtune: 1040 },
    { hitFrame: 55, mv: 1591, energy: 100, offtune: 1040 },
    { hitFrame: 59, mv: 1591, energy: 100, offtune: 1040 },
    { hitFrame: 62, mv: 1591, energy: 100, offtune: 1040 },
    { hitFrame: 66, mv: 1591, energy: 100, offtune: 1040 },
    { hitFrame: 70, mv: 1591, energy: 100, offtune: 1040 },
    { hitFrame: 76, mv: 4772, energy: 300, offtune: 3120 },
  ], castConcerto: 1000, castForte1: 40,
  updateBuffs: () => { if (!isHeld(LUNAR_CYCLE)) applyCurrent(CLOSING_REFRAIN_READY, 1); },
});
const Outro = iunoAction("Outro - From Gloom to Gleam", {
  animFrames: 0,
  cast: Cast.Outro, type: Type.Outro, bullets: [{ hitFrame: 0, mv: 10000 }], minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => queueQTE(IUNO_OUTRO),
});

// --- forte (jump / Flux) casts, all liberation damage while in Lunar Cycle, same shielding
const JumpHeavy = iunoAction("Heavy - Flux: Moonbow", { requireBuff: LUNAR_CYCLE, animFrames: 86, animPriority: { 86: 2 }, castPriority: 4, node: Node.Forte, cast: Cast.Heavy, type: Type.Liberation, bullets: [{ hitFrame: 70, mv: 25051, energy: 350, concerto: 700, offtune: 11200 }],
  updateBuffs: () => applyCurrent(NEW_MOON, 1),
});
const FJump = iunoAction("Heavy - Flux: Moonring", { requireBuff: NEW_MOON, animFrames: 114, animPriority: { 114: 2 }, castPriority: 4, node: Node.Forte, cast: Cast.Heavy, type: Type.Liberation, bullets: [
    { hitFrame: 66, mv: 7918, energy: 111, concerto: 222, offtune: 3540 },
    { hitFrame: 82, mv: 7918, energy: 111, concerto: 222, offtune: 3540 },
    { hitFrame: 90, mv: 7918, energy: 111, concerto: 222, offtune: 3540 },
    { hitFrame: 97, mv: 7918, energy: 111, concerto: 222, offtune: 3540 },
  ],
  updateBuffs: () => revokeCurrent(NEW_MOON),
});
const FMA1 = iunoAction("Forte Basic - Enhanced Moonbow 1", { requireBuff: NEW_MOON, animFrames: 34, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [{ hitFrame: 15, mv: 20597, energy: 233, concerto: 265, offtune: 4240 }], castConcerto: 400, castForte1: -10});
const FMA2 = iunoAction("Forte Basic - Enhanced Moonbow 2", { requireBuff: NEW_MOON, animFrames: 45, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 10, mv: 9543, energy: 109, concerto: 117, offtune: 1867 },
    { hitFrame: 17, mv: 9543, energy: 109, concerto: 117, offtune: 1867 },
    { hitFrame: 24, mv: 9543, energy: 109, concerto: 117, offtune: 1867 },
  ], castConcerto: 600, castForte1: -15});
const FMA3 = iunoAction("Forte Basic - Enhanced Moonbow 3", { requireBuff: NEW_MOON, animFrames: 92, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, bullets: [
    { hitFrame: 18, mv: 26641, energy: 300, concerto: 350, offtune: 5600 },
    { hitFrame: 53, mv: 26641, energy: 300, concerto: 350, offtune: 5600 },
  ], castConcerto: 1000, castForte1: -25});
const FMSkill = iunoAction("Forte Skill - Enhanced Arc Beyond the Edge", { requireBuff: NEW_MOON, animFrames: 85, animPriority: { 85: 2 }, castPriority: 4, cooldown: ARC_CD, node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, bullets: [
    { hitFrame: 50, mv: 31919, energy: 468, offtune: 5360 },
    { hitFrame: 78, commitFrame: 50, mv: 31919, energy: 468, offtune: 5360 },
  ], castConcerto: 1800, castForte1: -25});

const FMA123 = new ActionGroup("Forte - Enhanced Moonbow 123", [FMA1, FMA2, FMA3]);

/** Ends Lunar Cycle and conjures the Full Moon domain. Needs a full Concerto bar, and spends none.
 *  S6 puts her straight back into New Moon on the same cast. */
const FHA = iunoAction("Heavy - Absolute Fullness", {
  animFrames: 89, animPriority: { 0: 5, 89: 2 }, castPriority: 8,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Liberation, bullets: [{ hitFrame: 66, mv: 15905, energy: 500, offtune: 2400 }], minConcerto: 10000,
  updateBuffs: () => {
    applyTeam(IUNO_DOMAIN, 1);
    revokeCurrent(LUNAR_CYCLE);
    revokeCurrent(NEW_MOON);
    if (!isHeld(IO_S6)) return;
    applyCurrent(LUNAR_CYCLE, 1);
    applyCurrent(NEW_MOON, 1);
  },
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
  outro: Outro,
  maxEnergy: 12500,
  maxForte1: 100,

  // Waxing Ascent: a shield on every cast of these, no cooldown
  updateBuffs: () => {
    if (runningAnyOf(SHIELDING)) applyCurrent(SHIELD, 1);
  },

});


/* --------------------------------------------------------------------------------- sequences */

/** S1: +40% ATK while Lunar Cycle is held; the point of Energy a second inside the domain is paid by
 *  the domain itself (above). The interrupt immunity is no stat. */
const IO_S1 = new Sequence({
  name: "Iuno S1: Wax or Wane, All Gild the Bough",
  // a point of Energy a second while she herself stands in her own Full Moon Domain — this hook
  // runs on her turns alone, which is that condition
  updateBuffs: () => {
    if (stacksOfTeam(IUNO_DOMAIN) > 0) addGain({ energy: Math.round(elapsed() * 100 / 60) });
  },
  applyStats: () => {
    if (isHeld(LUNAR_CYCLE)) addStat(Stat.BonusAtk, 40);
  },
});

/** S2: +40% all DMG Amplification on top for anyone at ten Blessing stacks — paid by the Blessing
 *  itself (above). */
const IO_S2 = new Sequence({ name: "Iuno S2: Day or Night, Let This Be Eternal" });

/** S3: Moonbow presses, Arc Beyond the Edge and the Moonbow Dodge Counter amplified 65% while in
 *  Lunar Cycle. Its cycle-keeping half is control flow, not a stat. */
const IO_S3 = new Sequence({
  name: "Iuno S3: I Drink Deep of Their Forgetting",
  applyStats: () => { if (runningAnyOf(MOONBOW) && isHeld(LUNAR_CYCLE)) addStat(Stat.Amp, 65); },
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
 *  1759.05% against the plain 159.05% — and casting it puts her straight back into New Moon (FHA's
 *  own updateBuffs) with a full 100 Sentience and both Arc charges: the second Moonbow string the
 *  S6 rotations press after it. */
const IO_S6 = new Sequence({
  name: "Iuno S6: I Am the Constant in the Chaos",
  applyStats: () => { if (runningAction(FHA)) addStat(Stat.AddMv, 160000); },
  updateDebuffs: () => { if (runningAction(FHA)) addGain({ forte1: 100 }); },
  updateBuffs: () => { if (runningAction(FHA)) resetCooldown(ARC_CD); },
});

const IO_SEQUENCES = [IO_S1, IO_S2, IO_S3, IO_S4, IO_S5, IO_S6];

const IO_ROTATION = new Rotation([
  INTRO, ECHO.instaDodge(), 
  Liberation, JumpHeavy,
  FMA123.cancel(), FMSkill, FMSkill.cancel(), 
  FHA.instaSwap(), OUTRO,
]);

const IO_ROTATION_MDPS = new Rotation([
  INTRO, ECHO,
  JumpHeavy,
  FMSkill, 
  FMA123.cancel(), Liberation, 
  FMA123.cancel(), FMSkill, 
  MA123.cancel(), 
  FHA.instaSwap(), OUTRO,
]);

/** The same at S6 — see IO_ROTATION_S6. */
const IO_ROTATION_MDPS_S6 = new Rotation([
  INTRO, Liberation, JumpHeavy,
  FMSkill, 
  FMA123.cancel(), FMSkill.cancel(),
  FHA, ECHO, 
  FMSkill, FMA123.cancel(), FMSkill, OUTRO,
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
  // an ER 3-cost is on the table: behind Roccia her bar wants more Energy than her spread can carry
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Skill, Substat.Basic),
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
    // Windward's 5pc needs Aero Erosion on the target, which only these three inflict
    new EchoLoadout(NM_KELPIE, WINDWARD_5PC).requires(CARTETHYIA_RESONATOR, CIACCONA_RESONATOR, ROVER_AERO_RESONATOR),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Skill, Substat.Basic),
  rotation: { 0: IO_ROTATION_MDPS, 6: IO_ROTATION_MDPS_S6 },
  sequences: IO_SEQUENCES,
});
