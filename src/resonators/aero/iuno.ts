/**
 * Iuno, ported to the new engine — sequence-0 core loop only. An aero support: shields herself
 * and the team almost every action (Waxing Ascent); her intro/outro hand off a big Heavy Attack
 * amplification window (From Gloom to Gleam).
 *
 * Numbers from nanoka.cc (character 1410, https://ww.nanoka.cc/character/1410); forte1 (Lunar
 * Cycle) deltas come off the migrated (old-engine) sheet instead, cross-checked where it also
 * gives a combined row (BA123 = BA1+BA2+BA3, FMA123 = FMA1+FMA2+FMA3, both exact).
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, Stat, Attribute, WeaponType, Type1, Cast, Node,
  Scaling, applyCurrent, applyTeam, currentAction, casting, queueOutro, revokeCurrent, addStat, frozenStacks, applied,
  ActionGroup,
  setForte1,
  forte1,
} from "../../engine/kit.js";
import { lostOnSwap } from "../../shared/helpers.js";
import { Rotation, INTRO, ECHO_ONFIELD, OUTRO_NEXT, ECHO_CANCEL, ECHO_OUTRO } from "../../engine/rotation.js";
import { SHIELD } from "../../shared/status.js";
import { IUNO_SIG, VERITYS_HANDLE } from "../../weapons/gauntlet.js";
import { MARCATO, NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import { MYA, COV_3PC } from "../../echoes/septimont.js";
import { WINDWARD_5PC, WINDWARD_2PC, NM_KELPIE } from "../../echoes/rinascita.js";
import { SIERRA_GALE_2PC, HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC, REJUV_5PC, REJUV_2PC, FALLACY } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function iunoAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- basics and dodge counter, all shielding
const BA1 = iunoAction("Basic - Moonring 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 87.68, energy: 1.23, concerto: 1.23, offtune: 3920, forte1: 5 });
const BA2 = iunoAction("Basic - Moonring 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 139.58, energy: 1.97, concerto: 1.97, offtune: 6242, forte1: 10 });
const BA3 = iunoAction("Basic - Moonring 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 266.61, energy: 3.73, concerto: 3.73, offtune: 11921, forte1: 20 });
const DC = iunoAction("Basic - Moonring (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 248.73, energy: 2, concerto: 13.97, offtune: 6321, forte1:10 });

const BA123 = new ActionGroup("Basic - Moonring 123", [BA1, BA2, BA3]);

// --- Moonbow basics (Lunar Cycle - New Moon), considered liberation damage; also shield
const MA1 = iunoAction("Basic - Moonbow 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 126.45, energy: 2.33, concerto: 2.65, offtune: 4240 });
const MA2 = iunoAction("Basic - Moonbow 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 167.01, energy: 3.27, concerto: 3.51, offtune: 5601 });
const MA3 = iunoAction("Basic - Moonbow 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Liberation, mv: 334.02, energy: 6, concerto: 7, offtune: 11200 });
const MDC = iunoAction("Basic - Moonbow (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Liberation, mv: 310.17, energy: 1.77, concerto: 13.51, offtune: 5601 });

const MA123 = new ActionGroup("Basic - Moonbow 123", [MA1, MA2, MA3]);

// --- resonance skill
const Skill = iunoAction("Skill - Pulse of Origins", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 261.07, energy: 4.58, concerto: 6, offtune: 8086 });
const ESkill = iunoAction("Skill - Closing Refrain", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 426.46, energy: 8.15, concerto: 8, offtune: 13200, forte1: 25 });
const MSkill = iunoAction("Skill - Arc Beyond the Edge", { node: Node.Skill, cast: Cast.Skill, type: Type1.Liberation, mv: 439.58, energy: 9.36, concerto: 8, offtune: 10720 });

// --- liberation: shields and grants Blessing
const Liberation = iunoAction("Liberation - Beneath Lunar Tides", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1093.46, concerto: 20,
  offtune: 96000, forte1: 60, resetEnergy: true,
});

// --- intro / outro
const Intro = iunoAction("Intro - Illuminated Manifestation", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 159.09,
  energy: 10, concerto: 10, offtune: 10400, forte1: 40,
});
const Outro = iunoAction("Outro - From Gloom to Gleam", {
  cast: Cast.Outro, type: Type1.Outro, mv: 100, concerto: -100, active: false,
  updateBuffs: () => queueOutro(IUNO_OUTRO),
});

// --- forte (jump / Flux) casts, all liberation damage while in Lunar Cycle, same shielding
const Jump = iunoAction("Forte - Flux: Moonbow", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Liberation, mv: 250.51, energy: 3.5, concerto: 7, offtune: 11200 });
const FJump = iunoAction("Forte - Flux: Moonring", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Liberation, mv: 316.72, energy: 4.44, concerto: 8.88, offtune: 14160 });
const FMA1 = iunoAction("Forte - Enhanced Moonbow 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Liberation, mv: 205.97, energy: 2.33, concerto: 6.65, offtune: 4240, forte1: -10 });
const FMA2 = iunoAction("Forte - Enhanced Moonbow 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Liberation, mv: 286.29, energy: 3.27, concerto: 9.51, offtune: 5601, forte1: -15 });
const FMA3 = iunoAction("Forte - Enhanced Moonbow 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Liberation, mv: 532.82, energy: 6, concerto: 17, offtune: 11200, forte1: -25 });
const FMSkill = iunoAction("Forte - Enhanced Arc Beyond the Edge", { node: Node.Forte, cast: Cast.Skill, type: Type1.Liberation, mv: 638.38, energy: 9.36, concerto: 18, offtune: 10720, forte1: -25 });

const FMA123 = new ActionGroup("Forte - Enhanced Moonbow 123", [FMA1, FMA2, FMA3]);

/** Ends Lunar Cycle and conjures the Full Moon domain. */
const FHA = iunoAction("Forte - Absolute Fullness", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Liberation, mv: 159.05, energy: 5, offtune: 2400,
  updateBuffs: () => applyTeam(IUNO_DOMAIN, 1),
});

/* ------------------------------------------------------------------------------------ buffs */

/** 4% all-damage amplification a stack, ten stacks — amp, not bonus, so it multiplies its own
 *  term. Lost entirely if switched off field. */
const IUNO_BLESSING = new Buff({
  name: "Iuno: Blessing of the Wan Light", maxStacks: 10,
  applyStats: () => addStat(Stat.Amp, 4 * frozenStacks()),
  updateBuffs: () => lostOnSwap(),
});

/** What FHA leaves at her feet — team-wide, permanent uptime. Its own updateBuffs() runs on every
 *  member's turn; Blessing still stacks per-member off their own shielding. */
const IUNO_DOMAIN = new Buff({
  name: "Iuno: Full Moon Domain",
  updateBuffs: () => { if (applied(SHIELD)) applyCurrent(IUNO_BLESSING, applied(SHIELD)); },
});

const IO_INHERENT_2 = new Inherent({
  name: "Iuno: Derivation",
  updateBuffs: () => { if (casting(Cast.Intro) || casting(Cast.Liberation)) applyCurrent(IUNO_BLESSING, 5); },
});
const IO_INHERENT_1 = new Inherent({ name: "Iuno: Waxing Ascent" }); // gains shields

/** The window her outro hands the incoming resonator. */
const IUNO_OUTRO = new Buff({
  name: "Iuno: Outro",
  applyStats: () => addStat(Stat.Amp, 50, Type1.Heavy),
  updateBuffs: () => { lostOnSwap(); },
});

const SHIELDING = new Set<Action>([
  BA1, BA2, BA3, DC, MA1, MA2, MA3, MDC, Skill, ESkill, MSkill, Liberation, Intro,
  Jump, FJump, FMA1, FMA2, FMA3, FMSkill, FHA,
]);

const IUNO_RESONATOR = new Resonator({
  name: "Iuno",
  element: Attribute.Aero,
  weapon: WeaponType.Gauntlets,
  intro: () => Intro,
  outro: () => Outro,
  color: "#2dd4c0",
  maxEnergy: 125,

  // every cast of hers but the Outro shields
  updateDebuffs: () => { 
    if (SHIELDING.has(currentAction())) applyCurrent(SHIELD, 1); 
    if (currentAction().forte1 < 0 && forte1() > 100) setForte1(100); // Lunar Cycle's own forte1 cap
    if (currentAction().forte1 > 0 && forte1() < 0) setForte1(0); // Lunar Cycle's own forte1 cap
  },

  constantStats: () => {
    addStat(Stat.BaseHp, 10525); addStat(Stat.BaseAtk, 450); addStat(Stat.BaseDef, 1124);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const IUNO_TALENTS = new Talent({
  name: "Iuno: Talents",
  constantStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});


const IO_ROTATION = new Rotation([
  INTRO, ESkill, ECHO_CANCEL,Liberation, Jump,
  FMSkill, FMA123, FMSkill, 
  FHA, OUTRO_NEXT,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const IUNO = new Loadout({
  resonator: IUNO_RESONATOR,
  talent: IUNO_TALENTS,
  inherent1: IO_INHERENT_1,
  inherent2: IO_INHERENT_2,
  weapons: [IUNO_SIG, NEW_STD_GAUNTLET, MARCATO, ABYSS_SURGES, VERITYS_HANDLE],
  echoLoadouts: [
    new EchoLoadout(MYA, COV_3PC, SIERRA_GALE_2PC),

    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(HERON, COV_3PC, MOONLIT_CLOUDS_2PC),

    new EchoLoadout(FALLACY, REJUV_5PC, REJUV_2PC),
    new EchoLoadout(FALLACY, COV_3PC, REJUV_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: chem("atk", "liberation"),
    rotation: IO_ROTATION,
});


const IO_ROTATION_MDPS = new Rotation([
  INTRO, Skill, ESkill, // todo swap skill eskill
  Jump, //FMA1, 
  FMSkill, 
  FMA123, Liberation, 
  FMA123, FMSkill, 
  MA123, 
  FHA, ECHO_OUTRO, OUTRO_NEXT,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const IUNO_MDPS = new Loadout({
  resonator: IUNO_RESONATOR,
  talent: IUNO_TALENTS,
  inherent1: IO_INHERENT_1,
  inherent2: IO_INHERENT_2,
  weapons: [IUNO_SIG, NEW_STD_GAUNTLET, ABYSS_SURGES, VERITYS_HANDLE],
  echoLoadouts: [
    new EchoLoadout(MYA, COV_3PC, SIERRA_GALE_2PC),
    new EchoLoadout(NM_KELPIE, WINDWARD_5PC, WINDWARD_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: chem("atk", "liberation"),
  rotation: IO_ROTATION_MDPS,
});
