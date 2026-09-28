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
const BA1 = iunoAction("Basic - Moonring 1", { frames: 29, cancelFrames: 16, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 87.68, energy: 1.23, concerto: 1.23, offtune: 3920, forte1: 5 });
const BA2 = iunoAction("Basic - Moonring 2", { frames: 51, cancelFrames: 42, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 139.58, energy: 1.97, concerto: 1.97, offtune: 6242, forte1: 10 });
const BA3 = iunoAction("Basic - Moonring 3", { frames: 100, cancelFrames: 67, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 266.61, energy: 3.73, concerto: 3.73, offtune: 11921, forte1: 20 });
const DC = iunoAction("Dodge Counter - Moonring", { frames: 51, cancelFrames: 42, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, mv: 248.73, energy: 2, concerto: 13.97, offtune: 6321, forte1:10 });

const BA123 = new ActionGroup("Basic - Moonring 123", [BA1, BA2, BA3]);

// --- Moonbow basics (Lunar Cycle - New Moon), considered liberation damage; also shield
const MA1 = iunoAction("Basic - Moonbow 1", { frames: 34, cancelFrames: 15, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, mv: 126.45, energy: 2.33, concerto: 2.65, offtune: 4240 });
const MA2 = iunoAction("Basic - Moonbow 2", { frames: 45, cancelFrames: 24, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, mv: 167.01, energy: 3.27, concerto: 3.51, offtune: 5601 });
const MA3 = iunoAction("Basic - Moonbow 3", { frames: 92, cancelFrames: 53, node: Node.Normal, cast: Cast.Basic, type: Type.Liberation, mv: 334.02, energy: 6, concerto: 7, offtune: 11200 });
const MDC = iunoAction("Dodge Counter - Moonbow", { frames: 45, cancelFrames: 24, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Liberation, mv: 310.17, energy: 1.77, concerto: 13.51, offtune: 5601 });

const MA123 = new ActionGroup("Basic - Moonbow 123", [MA1, MA2, MA3]);

// --- resonance skill
const Skill = iunoAction("Skill - Pulse of Origins", { frames: 69, cancelFrames: 58, cooldown: 60 * 6, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, mv: 261.07, energy: 4.58, castConcerto: 6, offtune: 8086 });
const ESkill = iunoAction("Skill - Closing Refrain", { frames: 109, cancelFrames: 82, cooldown: 60 * 8, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, mv: 426.46, energy: 8.15, castConcerto: 8, offtune: 13200, castForte1: 25});
/** Arc Beyond the Edge: 2 charges on a 10s cooldown, its enhanced form the same press. */
const ARC_CD = new Cooldown({ frames: 60 * 10, charges: 2 });
const MSkill = iunoAction("Skill - Arc Beyond the Edge", { frames: 85, cancelFrames: 50, cooldown: ARC_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Liberation, mv: 439.58, energy: 9.36, castConcerto: 8, offtune: 10720 });

// --- liberation: shields and grants Blessing
const Liberation = iunoAction("Liberation - Beneath Lunar Tides", {
  frames: 250, cancelFrames: 240, timestop: 240, motionStop: 240, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, mv: 1093.46, castConcerto: 20,
  offtune: 96000, castForte1: 60, resetEnergy: true,
});

// --- intro / outro
const Intro = iunoAction("Intro - Illuminated Manifestation", {
  frames: 81, cancelFrames: 81, hitFrame: 76, motionStop: 27,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, mv: 159.09,
  energy: 10, castConcerto: 10, offtune: 10400, castForte1: 40,
});
const Outro = iunoAction("Outro - From Gloom to Gleam", {
  frames: 0, cancelFrames: 0,
  cast: Cast.Outro, type: Type.Outro, mv: 100, castConcerto: -100,
  updateBuffs: () => queueOutro(IUNO_OUTRO),
});

// --- forte (jump / Flux) casts, all liberation damage while in Lunar Cycle, same shielding
const JumpHeavy = iunoAction("Heavy - Flux: Moonbow", { frames: 86, cancelFrames: 70, node: Node.Forte, cast: Cast.Heavy, type: Type.Liberation, mv: 250.51, energy: 3.5, concerto: 7, offtune: 11200 });
const FJump = iunoAction("Heavy - Flux: Moonring", { frames: 114, cancelFrames: 97, node: Node.Forte, cast: Cast.Heavy, type: Type.Liberation, mv: 316.72, energy: 4.44, concerto: 8.88, offtune: 14160 });
const FMA1 = iunoAction("Forte Basic - Enhanced Moonbow 1", { frames: 34, cancelFrames: 15, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, mv: 205.97, energy: 2.33, concerto: 2.65, castConcerto: 4, offtune: 4240, castForte1: -10});
const FMA2 = iunoAction("Forte Basic - Enhanced Moonbow 2", { frames: 45, cancelFrames: 24, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, mv: 286.29, energy: 3.27, concerto: 3.51, castConcerto: 6, offtune: 5601, castForte1: -15});
const FMA3 = iunoAction("Forte Basic - Enhanced Moonbow 3", { frames: 92, cancelFrames: 53, node: Node.Forte, cast: Cast.Basic, type: Type.Liberation, mv: 532.82, energy: 6, concerto: 7, castConcerto: 10, offtune: 11200, castForte1: -25});
const FMSkill = iunoAction("Forte Skill - Enhanced Arc Beyond the Edge", { frames: 85, cancelFrames: 50, cooldown: ARC_CD, node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, mv: 638.38, energy: 9.36, castConcerto: 18, offtune: 10720, castForte1: -25});

const FMA123 = new ActionGroup("Forte - Enhanced Moonbow 123", [FMA1, FMA2, FMA3]);

/** Ends Lunar Cycle and conjures the Full Moon domain. */
const FHA = iunoAction("Heavy - Absolute Fullness", {
  frames: 89, cancelFrames: 66,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Liberation, mv: 159.05, energy: 5, offtune: 2400,
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

  // every cast of hers but the Outro shields
  updateDebuffs: () => { 
    if (runningAnyOf(SHIELDING)) gainShield(1); 
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
  updateDebuffs: () => { if (runningAction(FHA)) applyOthers(IUNO_BLESSING, 1); },
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
