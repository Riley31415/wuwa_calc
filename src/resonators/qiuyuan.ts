/**
 * Qiuyuan, ported to the new engine. Sequence-0 core loop; weapon/echo pieces are real ports
 * rather than a flat approximation, since this is the full-team test.
 *
 * Soliloquy is his own forte1 gauge — a declared `forte1: N` on every action that moves it
 * (100 a basic/enhanced-basic, 400 on Intro, -200 a Forte heavy), not a hand-rolled buff-stack.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, forte1, currentAction, casting, queueOutro, applyTeam, revoke, lostOnSwap,
  addStat, stacks,
} from "../kit.js";
import { EMERALD_SENTENCE } from "../weapons/sword.js";
import { FALLACY, REJUV_2PC, HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../echoes/jinzhou.js";
import { LAW_OF_HARMONY_3PC } from "../echoes/septimont.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function qiuyuanAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

export const BA1 = qiuyuanAction("Basic - Inkwash 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 41.76 });
export const BA2 = qiuyuanAction("Basic - Inkwash 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 69.6 });
export const BA3 = qiuyuanAction("Basic - Inkwash 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 164.25, forte1: 100 });

export const EBA1 = qiuyuanAction("Forte - Thus Spoke the Blade: Inkwash 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 119.3, forte1: 100 });
export const EBA2 = qiuyuanAction("Forte - Thus Spoke the Blade: Inkwash 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 185.5, forte1: 100 });
export const EBA3 = qiuyuanAction("Forte - Thus Spoke the Blade: Inkwash 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 145.77, forte1: 100 });
export const EBA4 = qiuyuanAction("Forte - Thus Spoke the Blade: Inkwash 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 172.37, forte1: 100 });

export const Skill = qiuyuanAction("Skill - Through the Groves", { node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 215.52 });

export const Liberation = qiuyuanAction("Liberation - Sundering Strike", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Echo, mv: 795.24,
});

export const Intro = qiuyuanAction("Intro - Attack the Must-Defend", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Heavy, mv: 238.62, forte1: 400,
});
export const Outro = qiuyuanAction("Outro - Strike Before Ready", {
  cast: Cast.Outro, type: Type1.Echo, mv: 100, active: false,
});

// cast: HEAVY (real heavy-attack identity) plus cast2: ECHO ("considered as performing Echo Skill")
export const FHA1 = qiuyuanAction("Forte - Thus Spoke the Blade: To Teach", { node: Node.Forte, cast: Cast.Heavy, cast2: Cast.Echo, type: Type1.Heavy, mv: 457.2, forte1: -200 });
export const FHA2 = qiuyuanAction("Forte - Thus Spoke the Blade: To Save", { node: Node.Forte, cast: Cast.Heavy, cast2: Cast.Echo, type: Type1.Heavy, mv: 209.67, forte1: -200 });
export const FHA3 = qiuyuanAction("Forte - Thus Spoke the Blade: To Sacrifice", { node: Node.Forte, cast: Cast.Heavy, cast2: Cast.Echo, type: Type1.Heavy, mv: 217.7, forte1: -200 });

/* ------------------------------------------------------------------------------------ buffs */

export const FLOWING_PANACEA = new Buff({
  name: "Qiuyuan: Flowing Panacea",
  apply: () => addStat(Stat.BonusAtk, 10),
  convert: () => { if (casting(Cast.Outro)) revoke(FLOWING_PANACEA); },
});

// team-wide, permanent once granted at 400 Soliloquy
export const BAMBOO_SHADE = new Buff({
  name: "Qiuyuan: Bamboo's Shade", apply: () => addStat(Stat.DmgBonus, 30, Type1.Echo),
});

export const QUIETUDE_WITHIN = new Buff({
  name: "Qiuyuan: Quietude Within",
  update: () => {
    lostOnSwap();
    // TODO needs special handling for double forte
  },
  apply: () => {
    const a = currentAction();
    if (a === FHA1 || a === FHA2 || a === FHA3) addStat(Stat.TotalDmg, 50);
  },
});

// team-wide — "all nearby active Resonators," gated on the acting resonator's own active flag
export const SUNDERING_STRIKE_CD = new Buff({
  name: "Qiuyuan: Sundering Strike",
  apply: () => { if (currentAction().active) addStat(Stat.CritDmg, 30); },
});

export const QIUYUAN_OUTRO = new Buff({
  name: "Qiuyuan: Outro",
  apply: () => addStat(Stat.Amp, 50, Type1.Echo),
  update: () => { lostOnSwap(); },
});

export const QY_INHERENT_2 = new Inherent({
  name: "Qiuyuan: Drink Away Woes Age-Old",
  update: () => { if (currentAction().forte1 > 0) applySelf(FLOWING_PANACEA, 1); },
});

export const QY_INHERENT_1 = new Inherent({
  name: "Qiuyuan: Quietude Within",
  update: () => {
    const soliloquy = forte1() + currentAction().forte1;
    if (soliloquy >= 600) applySelf(QUIETUDE_WITHIN, 1);
  },
});

export const QIUYUAN = new Resonator({
  name: "Qiuyuan",
  element: Attribute.Aero,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  color: "#4fae6b",
  maxEnergy: 125,
  update: () => {
    const a = currentAction();
    if (a === Outro) queueOutro(QIUYUAN_OUTRO);
    if (a === Liberation) applyTeam(SUNDERING_STRIKE_CD, 1);
    // forte1() only reflects every *prior* action's own contribution, so what the gauge is about
    // to become (forte1() + a.forte1) is what has to be checked, not what it reads right now
    const soliloquy = forte1() + a.forte1;
    if (soliloquy >= 400) applyTeam(BAMBOO_SHADE, 1);
  },

  apply: () => {
    addStat(Stat.BaseHp, 12238); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1198);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
export const QIUYUAN_TALENTS = new Talent({
  name: "Qiuyuan: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

export const QY_ROTATION = [INTRO, EBA3, EBA4, ECHO_CAST, Liberation, Skill, FHA1, FHA2, FHA3, Outro];

/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const QY_LOADOUT = new Loadout(
  QIUYUAN,
  QIUYUAN_TALENTS,
  QY_INHERENT_1,
  QY_INHERENT_2,
  EMERALD_SENTENCE,
  FALLACY,
  LAW_OF_HARMONY_3PC,
  REJUV_2PC,
  mainstats("CD", "aero aero", "atk atk"),
  chem("atk", "heavy"),
);

// second build: Impermanence Heron mainslot, full Moonlit Clouds 5pc instead of the Law of
// Harmony/Rejuvenating Glow split above
export const QY_LOADOUT_MOONLIT = new Loadout(
  QIUYUAN,
  QIUYUAN_TALENTS,
  QY_INHERENT_1,
  QY_INHERENT_2,
  EMERALD_SENTENCE,
  HERON,
  MOONLIT_CLOUDS_5PC,
  MOONLIT_CLOUDS_2PC,
  mainstats("CD", "aero aero", "atk atk"),
  chem("atk", "heavy"),
);
