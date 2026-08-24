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
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, currentAction, casting, queueOutro, revoke, addStat, stacks, lostOnSwap,
} from "../../kit.js";
import { IUNO_SIG, VERITYS_HANDLE } from "../../weapons/gauntlet.js";
import { MARCATO, NEW_STD_GAUNTLET, ABYSS_SURGES } from "../../weapons/standard.js";
import { MYA, COV_3PC } from "../../echoes/septimont.js";
import { SIERRA_GALE_2PC, HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC, REJUV_5PC, REJUV_2PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { mainstatOptions } from "../../mainstats.js";
import { chem } from "../../substats.js";

/* ----------------------------------------------------------------------------------- actions */

function iunoAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- basics and dodge counter, all shielding
export const BA1 = iunoAction("Basic - Moonring 1", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Basic, mv: 87.68, energy: 1.23, concerto: 1.23, offtune: 3920, forte1: 4.25 });
export const BA2 = iunoAction("Basic - Moonring 2", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Basic, mv: 139.58, energy: 1.97, concerto: 1.97, offtune: 6242, forte1: 11.25 });
export const BA3 = iunoAction("Basic - Moonring 3", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Basic, mv: 266.61, energy: 3.73, concerto: 3.73, offtune: 11921, forte1: 19.5 });
export const DC = iunoAction("Basic - Moonring (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, shields: 1, type: Type1.Basic, mv: 248.73, energy: 2, concerto: 13.97, offtune: 6321 });

// --- Moonbow basics (Lunar Cycle - New Moon), considered liberation damage; also shield
export const MA1 = iunoAction("Basic - Moonbow 1", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Liberation, mv: 126.45, energy: 2.33, concerto: 2.65, offtune: 4240 });
export const MA2 = iunoAction("Basic - Moonbow 2", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Liberation, mv: 167.01, energy: 3.27, concerto: 3.51, offtune: 5601 });
export const MA3 = iunoAction("Basic - Moonbow 3", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Liberation, mv: 334.02, energy: 6, concerto: 7, offtune: 11200 });
export const MDC = iunoAction("Basic - Moonbow (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, shields: 1, type: Type1.Liberation, mv: 310.17, energy: 1.77, concerto: 13.51, offtune: 5601 });

// --- resonance skill
export const Skill = iunoAction("Skill - Pulse of Origins", { node: Node.Skill, cast: Cast.Skill, shields: 1, type: Type1.Skill, mv: 261.07, energy: 4.58, concerto: 6, offtune: 8086 });
export const ESkill = iunoAction("Skill - Closing Refrain", { node: Node.Skill, cast: Cast.Skill, shields: 1, type: Type1.Skill, mv: 426.46, energy: 8.15, concerto: 8, offtune: 13200, forte1: 25 });
export const MSkill = iunoAction("Skill - Arc Beyond the Edge", { node: Node.Skill, cast: Cast.Skill, shields: 1, type: Type1.Liberation, mv: 439.58, energy: 9.36, concerto: 8, offtune: 10720 });

// --- liberation: shields and grants Blessing
export const Liberation = iunoAction("Liberation - Beneath Lunar Tides", {
  node: Node.Liberation, cast: Cast.Liberation, shields: 1, type: Type1.Liberation, mv: 1093.46, concerto: 20,
  offtune: 96000, forte1: 60, resetEnergy: true,
});

// --- intro / outro
export const Intro = iunoAction("Intro - Illuminated Manifestation", {
  node: Node.Intro, cast: Cast.Intro, shields: 1, type: Type1.Intro, mv: 159.09,
  energy: 10, concerto: 10, offtune: 10400, forte1: 40,
});
export const Outro = iunoAction("Outro - From Gloom to Gleam", {
  cast: Cast.Outro, type: Type1.Outro, mv: 100, active: false,
});

// --- forte (jump / Flux) casts, all liberation damage while in Lunar Cycle, same shielding
export const Jump = iunoAction("Forte - Flux: Moonbow", { node: Node.Forte, cast: Cast.Heavy, shields: 1, type: Type1.Liberation, mv: 250.51, energy: 3.5, concerto: 7, offtune: 11200 });
export const FJump = iunoAction("Forte - Flux: Moonring", { node: Node.Forte, cast: Cast.Heavy, shields: 1, type: Type1.Liberation, mv: 316.72, energy: 4.44, concerto: 8.88, offtune: 14160 });
export const FMA1 = iunoAction("Forte - Enhanced Moonbow 1", { node: Node.Forte, cast: Cast.Basic, shields: 1, type: Type1.Liberation, mv: 205.97, energy: 2.33, concerto: 6.65, offtune: 4240, forte1: -11 });
export const FMA2 = iunoAction("Forte - Enhanced Moonbow 2", { node: Node.Forte, cast: Cast.Basic, shields: 1, type: Type1.Liberation, mv: 286.29, energy: 3.27, concerto: 9.51, offtune: 5601, forte1: -14 });
export const FMA3 = iunoAction("Forte - Enhanced Moonbow 3", { node: Node.Forte, cast: Cast.Basic, shields: 1, type: Type1.Liberation, mv: 532.82, energy: 6, concerto: 17, offtune: 11200, forte1: -25 });
export const FMSkill = iunoAction("Forte - Enhanced Arc Beyond the Edge", { node: Node.Forte, cast: Cast.Skill, shields: 1, type: Type1.Liberation, mv: 638.38, energy: 9.36, concerto: 18, offtune: 10720, forte1: -25 });

/** Ends Lunar Cycle and conjures the Full Moon domain. */
export const FHA = iunoAction("Forte - Absolute Fullness", { node: Node.Forte, cast: Cast.Heavy, shields: 1, type: Type1.Liberation, mv: 159.05, energy: 5, offtune: 2400 });

/* ------------------------------------------------------------------------------------ buffs */

/** 4% all-damage amplification a stack, ten stacks — amp, not bonus, so it multiplies its own
 *  term. Lost entirely if switched off field. */
export const IUNO_BLESSING = new Buff({
  name: "Iuno: Blessing of the Wan Light", maxStacks: 10,
  apply: () => addStat(Stat.Amp, 4 * stacks()),
  update: () => lostOnSwap(),
});

/** What FHA leaves at her feet — team-wide, permanent uptime. Its own update() runs on every
 *  member's turn; Blessing still stacks per-member off their own shielding. */
export const IUNO_DOMAIN = new Buff({
  name: "Iuno: Full Moon Domain",
  update: () => { if (currentAction().shields) applySelf(IUNO_BLESSING, currentAction().shields); },
});

export const IO_INHERENT_2 = new Inherent({
  name: "Iuno: Derivation",
  update: () => { if (casting(Cast.Intro) || casting(Cast.Liberation)) applySelf(IUNO_BLESSING, 5); },
});
export const IO_INHERENT_1 = new Inherent({ name: "Iuno: Waxing Ascent" }); // gains shields

/** The window her outro hands the incoming resonator. */
export const IUNO_OUTRO = new Buff({
  name: "Iuno: Outro",
  apply: () => addStat(Stat.Amp, 50, Type1.Heavy),
  update: () => { lostOnSwap(); },
});

export const IUNO = new Resonator({
  name: "Iuno",
  abbreviation: "Uno",
  element: Attribute.Aero,
  weapon: WeaponType.Gauntlets,
  intro: () => Intro,
  color: "#2dd4c0",
  maxEnergy: 125,

  update: () => {
    const a = currentAction();
    if (a === Outro) queueOutro(IUNO_OUTRO);
    if (a === FHA) applyTeam(IUNO_DOMAIN, 1);
  },

  apply: () => {
    addStat(Stat.BaseHp, 10525); addStat(Stat.BaseAtk, 450); addStat(Stat.BaseDef, 1124);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const IUNO_TALENTS = new Talent({
  name: "Iuno: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// no separate opener written for her sub-DPS line — reused for both passes
export const IO_ROTATION = [
  INTRO, ESkill, ECHO_CAST, Liberation, Jump,
  FMSkill, FMA1, FMA2, FMA3, FMSkill, FHA,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const UNO_LOADOUT = new Loadout(
  IUNO,
  false,
  IUNO_TALENTS,
  IO_INHERENT_1,
  IO_INHERENT_2,
  [IUNO_SIG, MARCATO, NEW_STD_GAUNTLET, ABYSS_SURGES, VERITYS_HANDLE],
  [
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(FALLACY, REJUV_5PC, REJUV_2PC),
    new EchoLoadout(MYA, COV_3PC, SIERRA_GALE_2PC),
    new EchoLoadout(FALLACY, COV_3PC, REJUV_2PC),
    new EchoLoadout(HERON, COV_3PC, MOONLIT_CLOUDS_2PC),
  ],
  mainstatOptions(["CR", "CD"], ["atk", "aero"], ["atk"]),
  chem("atk", "liberation"),
  IO_ROTATION, IO_ROTATION,
);
