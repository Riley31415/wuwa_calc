/**
 * Iuno, ported to the new engine — sequence-0 core loop only. An aero support: shields herself
 * and the team almost every action (Waxing Ascent); her intro/outro hand off a big Heavy Attack
 * amplification window (From Gloom to Gleam).
 *
 * Numbers from nanoka.cc (character 1410, https://ww.nanoka.cc/character/1410).
 */
import {
  Buff, Resonator, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, currentAction, casting, queueOutro, revoke, addStat, stacks, lostOnSwap,
} from "../kit.js";
import { IUNO_SIG } from "../weapons/gauntlet.js";
import { MYA, COV_3PC } from "../echoes/septimont.js";
import { SIERRA_GALE_2PC } from "../echoes/jinzhou.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------------------------------------ buffs */

/** Blessing of the Wan Light: 4% all-damage amplification a stack, ten stacks. Amplification
 *  rather than damage bonus, so it multiplies its own term instead of diluting into the pile. */
export const IUNO_BLESSING = new Buff({
  name: "Iuno: Blessing of the Wan Light", maxStacks: 10,
  apply: () => addStat(Stat.Amp, 4 * stacks()),
  // ends early if switched off field, carrying none of it — a genuine "lost on swap" case
  update: () => lostOnSwap(),
});

/** Full Moon Domain: what Heavy Attack - Absolute Fullness (FHA) leaves at her feet — team-wide,
 *  permanent uptime once granted (never revoked). Its own update() runs on every member's own
 *  turn (that's what "team-wide" gets from being global), and applySelf() inside it always
 *  targets whoever's actually acting — so Blessing itself still stacks individually, one pool a
 *  member, off their own shielding. */
export const IUNO_DOMAIN = new Buff({
  name: "Iuno: Full Moon Domain",
  update: () => { if (currentAction().shields) applySelf(IUNO_BLESSING, currentAction().shields); },
});

/** From Gloom to Gleam: the window her outro hands the incoming resonator. */
export const IUNO_OUTRO = new Buff({
  name: "Iuno: Outro",
  apply: () => addStat(Stat.Amp, 50, Type1.Heavy),
  // a plain window, not "lost on swap" wording — still counts on the recipient's own outro (see
  // jinzhou.ts's HERON_HANDOFF for the same shape)
  convert: () => { if (casting(Cast.Outro)) revoke(IUNO_OUTRO); },
});

/* ----------------------------------------------------------------------------------- actions */

function iunoAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Aero, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune are her own kit's real generation per cast — Liberation/Outro's own
// old declared "spend the bar" costs aren't repeated here (TODO_ENGINE.md: that's what
// Resonator.maxEnergy and the engine's own outro handling are for).
// --- basics and dodge counter, all shielding
export const BA1 = iunoAction("Basic - Moonring 1", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Basic, mv: 87.68, energy: 1.23, concerto: 1.23, offtune: 3920 });
export const BA2 = iunoAction("Basic - Moonring 2", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Basic, mv: 139.58, energy: 1.97, concerto: 1.97, offtune: 4120 });
export const BA3 = iunoAction("Basic - Moonring 3", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Basic, mv: 266.61, energy: 3.73, concerto: 3.73, offtune: 11921 });
export const DC = iunoAction("Basic - Moonring (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, shields: 1, type: Type1.Basic, mv: 248.73, energy: 2, concerto: 23.97, offtune: 6321 });

// --- Moonbow basics (Lunar Cycle - New Moon), considered liberation damage; also shield
export const MA1 = iunoAction("Basic - Moonbow 1", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Liberation, mv: 126.45, energy: 2.33, concerto: 2.65, offtune: 4240 });
export const MA2 = iunoAction("Basic - Moonbow 2", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Liberation, mv: 167.01, energy: 3.25, concerto: 3.5, offtune: 5601 });
export const MA3 = iunoAction("Basic - Moonbow 3", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: Type1.Liberation, mv: 334.02, energy: 6, concerto: 7, offtune: 11200 });
export const MDC = iunoAction("Basic - Moonbow (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, shields: 1, type: Type1.Liberation, mv: 310.17, energy: 1.77, concerto: 23.51, offtune: 5601 });

// --- resonance skill
export const Skill = iunoAction("Skill - Pulse of Origins", { node: Node.Skill, cast: Cast.Skill, shields: 1, type: Type1.Skill, mv: 261.07, energy: 4.58, concerto: 6, offtune: 8086 });
export const ESkill = iunoAction("Skill - Closing Refrain", { node: Node.Skill, cast: Cast.Skill, shields: 1, type: Type1.Skill, mv: 426.46, energy: 8.15, concerto: 8, offtune: 13200 });
export const MSkill = iunoAction("Skill - Arc Beyond the Edge", { node: Node.Skill, cast: Cast.Skill, shields: 1, type: Type1.Liberation, mv: 439.58, energy: 9.36, concerto: 8, offtune: 10720 });

// --- liberation: shields and grants Blessing
export const Liberation = iunoAction("Liberation - Beneath Lunar Tides", {
  node: Node.Liberation, cast: Cast.Liberation, shields: 1, type: Type1.Liberation, mv: 1093.46, concerto: 20,
  offtune: 96000,
});

// --- intro / outro
export const Intro = iunoAction("Intro - Illuminated Manifestation", {
  node: Node.Intro, cast: Cast.Intro, shields: 1, type: Type1.Intro, mv: 159.09,
  energy: 10, concerto: 10, offtune: 10400,
});
/** Her outro hands the Heavy Attack amplification window straight to the next intro. */
export const Outro = iunoAction("Outro - From Gloom to Gleam", {
  cast: Cast.Outro, type: Type1.Outro, mv: 100, active: false,
});

// --- forte (jump / Flux) casts, all liberation damage while in Lunar Cycle. Same shielding as
//     the ordinary basics/dodge counter above.
export const Jump = iunoAction("Forte - Flux: Moonbow", { node: Node.Forte, cast: Cast.Heavy, shields: 1, type: Type1.Liberation, mv: 250.51, energy: 3.5, concerto: 7, offtune: 1120 });
export const FJump = iunoAction("Forte - Flux: Moonring", { node: Node.Forte, cast: Cast.Heavy, shields: 1, type: Type1.Liberation, mv: 316.72, energy: 4.44, concerto: 8.88, offtune: 14160 });
export const FMA1 = iunoAction("Forte - Enhanced Moonbow 1", { node: Node.Forte, cast: Cast.Basic, shields: 1, type: Type1.Liberation, mv: 205.97, energy: 2.33, concerto: 6.65, offtune: 4240 });
export const FMA2 = iunoAction("Forte - Enhanced Moonbow 2", { node: Node.Forte, cast: Cast.Basic, shields: 1, type: Type1.Liberation, mv: 286.29, energy: 3.27, concerto: 9.51, offtune: 5601 });
export const FMA3 = iunoAction("Forte - Enhanced Moonbow 3", { node: Node.Forte, cast: Cast.Basic, shields: 1, type: Type1.Liberation, mv: 532.82, energy: 6, concerto: 17, offtune: 11200 });
export const FMSkill = iunoAction("Forte - Enhanced Arc Beyond the Edge", { node: Node.Forte, cast: Cast.Skill, shields: 1, type: Type1.Liberation, mv: 638.38, energy: 9.36, concerto: 18, offtune: 10720 });

/** Heavy Attack - Absolute Fullness. Ends Lunar Cycle and conjures the Full Moon domain. */
export const FHA = iunoAction("Forte - Absolute Fullness", { node: Node.Forte, cast: Cast.Heavy, shields: 1, type: Type1.Liberation, mv: 159.05, energy: 5, offtune: 2400 });

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. The stat-tree talent bonus lives in its own `IUNO_TALENTS` buff below —
 *  just another piece of her loadout, not special-cased on the Resonator itself. */
export const IUNO = new Resonator({
  name: "Iuno",
  element: Element.Aero,
  weapon: WeaponType.Gauntlets,
  intro: () => Intro,
  color: "#2dd4c0",
  maxEnergy: 12500,

  update: () => {
    const a = currentAction();
    // her intro and liberation grant five Blessing stacks outright, no shield needed
    if (a.cast === Cast.Intro || a.cast === Cast.Liberation) applySelf(IUNO_BLESSING, 5);
    if (a === FHA) applyTeam(IUNO_DOMAIN, 1);
    if (a === Outro) queueOutro(IUNO_OUTRO);
  },

  apply: () => {
    addStat(Stat.BaseHp, 10525); addStat(Stat.BaseAtk, 450); addStat(Stat.BaseDef, 1124);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const IUNO_TALENTS = new Buff({
  name: "Iuno: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// no separate opener written for her sub-DPS line — reused for both passes, matching every other
// no-separate-loop kit in this codebase (Qiuyuan, Cantarella)
export const IO_ROTATION = [
  INTRO, ESkill, ECHO_CAST, Liberation, Jump,
  FMSkill, FMA1, FMA2, FMA3, FMSkill, FHA,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents, weapon, mainslot echo, sonata pieces, mainstat/substat
export const IO_LOADOUT = [
  IUNO, IUNO_TALENTS,
  IUNO_SIG,
  MYA, COV_3PC, SIERRA_GALE_2PC,
  mainstats("CD", "aero aero", "atk atk"), chem("atk", "liberation"),
];
