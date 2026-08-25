/**
 * Yinlin, ported to the new engine — sequence-0 core loop, a limited 5-star (not
 * `standardCharacter`). An electro rectifier off-field Coordinated Attack sub-DPS, built around
 * her marks, all modelled as real enemy debuffs:
 *  - Sinner's Mark: applied on hit by her Basic Attacks (dodge counter included), Liberation and
 *    Intro; removed when she switches out (any inactive action of hers).
 *  - Execution Mode: opened by Magnetic Roar, 4 charges — each Basic/Dodge Counter cast against
 *    a Sinner-marked target consumes one and fires an Electromagnetic Blast on her own slot.
 *  - Punishment Mark: Chameleon Cipher hitting a Sinner-marked target upgrades the mark, 18s.
 *    While it stands, damage taken calls down Judgment Strikes (Coordinated, Resonance Skill
 *    DMG, up to 1/s) — the whole window lumped into one 18-hit action queued off her Outro and
 *    consumed by it, so no mark means no strikes.
 * Deadly Focus's Lightning Execution bonus is likewise gated on the target actually holding
 * Sinner's Mark rather than assumed.
 *
 * MV/energy/concerto/offtune resolved off nanoka.cc's own level-10 damage table (character
 * 1302); forte (Judgment Points), concerto and energy per action come from the user's sheet
 * data, which scales the gauge so Chameleon Cipher spends 40 — the rotation banks 45 before it.
 *
 * Her two Inherent Skills, off the page's own "INHERENT SKILLS" section:
 *  - Pain Immersion: +15% Crit Rate for 5s after Magnetic Roar.
 *  - Deadly Focus: Lightning Execution +10% DMG against Sinner's Mark, and +10% ATK for 4s when
 *    triggered.
 */
import {
  Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling,
  applySelf, setStacksSelf, removeStack, applyEnemy, revokeEnemy, stacksOfEnemy, isHeld, currentAction, casting, revoke, addStat, queue, queueOutro, lostOnSwap,
} from "../../kit.js";
import { STRINGMASTER } from "../../weapons/rectifier.js";
import { VARIATION, NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC } from "../../echoes/rinascita.js";
import { NM_TEMPEST_MEPHIS, HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../mainstats.js";
import { chem } from "../../substats.js";

/* ----------------------------------------------------------------------------------- actions */

function yinlinAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter, heavy (Zapstring's Dance)
const BA1 = yinlinAction("Basic - Zapstring's Dance 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 28.81, energy: 0.60, concerto: 2.00, offtune: 3144, forte1: 1 });
const BA2 = yinlinAction("Basic - Zapstring's Dance 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 33.82 * 2, energy: 1.50, concerto: 5.00, offtune: 6152, forte1: 1 });
const BA3 = yinlinAction("Basic - Zapstring's Dance 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 13.99 * 7, energy: 2.45, concerto: 7.00, offtune: 7147, forte1: 3 });
const BA4 = yinlinAction("Basic - Zapstring's Dance 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 75.16, energy: 1.50, concerto: 6.00, offtune: 4976, forte1: 4 });

const HA = yinlinAction("Heavy - Zapstring's Dance", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 29.83 * 2, energy: 1.80, concerto: 4.50, offtune: 9392, forte1: 8 });
const MA = yinlinAction("Basic - Zapstring's Dance (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 123.27, energy: 0.51, concerto: 5.00, offtune: 4960, forte1: 2 });
const DC = yinlinAction("Basic - Zapstring's Dance (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 24.22 * 7, energy: 3.99, concerto: 17.00, offtune: 11746 });

// Magnetic Roar opens Execution Mode; Lightning Execution is the follow-up Skill press
const Skill1 = yinlinAction("Skill - Magnetic Roar", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 59.65 * 3, energy: 15.00, concerto: 10, offtune: 6666, forte1: 12 });
const Skill2 = yinlinAction("Skill - Lightning Execution", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 89.47 * 4, energy: 15.00, concerto: 15, offtune: 5328, forte1: 4 });
/** One Electromagnetic Blast — queued onto her own slot by EXECUTION_MODE below, once per charge
 *  her Basic/Dodge Counter casts against a Sinner-marked target consume. */
const ACTION_BLAST = yinlinAction("Skill - Electromagnetic Blast", { node: Node.Skill, type: Type1.Skill, mv: 19.89, concerto: 5.00 });

const Liberation = yinlinAction("Liberation - Thundering Wrath", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 116.56 * 7, concerto: 20, offtune: 36001, resetEnergy: true });

/** Chameleon Cipher: spends every Judgment Point, upgrades Sinner's Mark to Punishment Mark. */
const FHA = yinlinAction("Forte Heavy - Chameleon Cipher", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 178.93 * 2, energy: 10.00, concerto: 20.00, offtune: 52000, forte1: -40 });
/** Punishment Mark's whole 18s window at its 1/s ceiling, lumped — Resonance Skill DMG, queued
 *  off her own Outro while the mark stands (it consumes the mark — see PUNISHMENT_MARK). */
const ACTION_JUDGMENT_STRIKES = yinlinAction("Forte - Judgment Strike x18", { node: Node.Forte, type: Type1.Skill, type2: Type2.Coordinated, mv: 78.64 * 18, active: false });

const Intro = yinlinAction("Intro - Raging Storm", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 14.32 * 10, energy: 10.00, concerto: 10, offtune: 9520, forte1: 12 });
const Outro = yinlinAction("Outro - Strategist", { cast: Cast.Outro, active: false });

/* ------------------------------------------------------------------------------------ marks */

/** Sinner's Mark: applied by her Basic Attacks/Liberation/Intro on hit — no stat, it gates the
 *  Blasts, Deadly Focus and the Cipher upgrade. "Removed when Yinlin is switched out" = removed
 *  on any inactive action of hers (her own lostOnSwap can't carry the check — the mark has to
 *  survive other members' inactive actions, so it tests whose slot is acting itself). */
const SINNERS_MARK: Debuff = new Debuff({
  name: "Yinlin: Sinner's Mark",
  updateBuffs: () => { if (!currentAction().active && isHeld(YINLIN)) revokeEnemy(SINNERS_MARK); },
});

/** Punishment Mark: what Chameleon Cipher turns a Sinner's Mark into, 18s. Its Judgment Strike
 *  window is the queued lump above, which consumes the mark once it lands. */
const PUNISHMENT_MARK = new Debuff({
  name: "Yinlin: Punishment Mark",
  convertStats: () => { if (currentAction() === ACTION_JUDGMENT_STRIKES) revokeEnemy(PUNISHMENT_MARK); },
});

/** Execution Mode: 4 Blast charges off Magnetic Roar — each Basic/Dodge Counter cast against a
 *  Sinner-marked target spends one for an Electromagnetic Blast. Whatever's left is lost when
 *  she leaves the field. */
const EXECUTION_MODE: Buff = new Buff({
  name: "Yinlin: Execution Mode", maxStacks: 4,
  updateBuffs: () => {
    if ((casting(Cast.Basic) || casting(Cast.DodgeCounter)) && stacksOfEnemy(SINNERS_MARK)) {
      queue(ACTION_BLAST);
      removeStack(EXECUTION_MODE, 1);
    }
  },
  convertStats: () => { if (casting(Cast.Outro)) revoke(EXECUTION_MODE); },
});

/* ------------------------------------------------------------------------------------ buffs */

/** Pain Immersion (Inherent Skill): +15% Crit Rate for 5s after Magnetic Roar. */
const PAIN_IMMERSION = new Buff({
  name: "Yinlin: Pain Immersion",
  applyStats: () => addStat(Stat.CritRate, 15),
  convertStats: () => { if (casting(Cast.Outro)) revoke(PAIN_IMMERSION); },
});
const YL_INHERENT_1 = new Inherent({
  name: "Yinlin: Pain Immersion",
  updateBuffs: () => { if (currentAction() === Skill1) applySelf(PAIN_IMMERSION, 1); },
});

/** Deadly Focus (Inherent Skill): the +10% ATK half — the +10% on Lightning Execution itself
 *  lives on YL_INHERENT_2's own apply below. Both halves need the target Sinner-marked. */
const DEADLY_FOCUS = new Buff({
  name: "Yinlin: Deadly Focus",
  applyStats: () => addStat(Stat.BonusAtk, 10),
  convertStats: () => { if (casting(Cast.Outro)) revoke(DEADLY_FOCUS); },
});
const YL_INHERENT_2 = new Inherent({
  name: "Yinlin: Deadly Focus",
  updateBuffs: () => { if (currentAction() === Skill2 && stacksOfEnemy(SINNERS_MARK)) applySelf(DEADLY_FOCUS, 1); },
  applyStats: () => { if (currentAction() === Skill2 && stacksOfEnemy(SINNERS_MARK)) addStat(Stat.DmgBonus, 10); },
});

/** Strategist — the outro handoff: "for 14s or until they are switched out". */
const YINLIN_OUTRO = new Buff({
  name: "Yinlin: Outro",
  applyStats: () => { addStat(Stat.Amp, 20, Attribute.Electro); addStat(Stat.Amp, 25, Type1.Liberation); },
  updateBuffs: () => { lostOnSwap(); },
});

const YINLIN = new Resonator({
  name: "Yinlin",
  abbreviation: "Yinlin",
  element: Attribute.Electro,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  color: "#a45ee8",
  maxEnergy: 125,

  updateBuffs: () => {
    const a = currentAction();
    // this runs ahead of EXECUTION_MODE's own update (equipped gear first), so a Basic's own
    // fresh mark already gates that same cast's Blast
    if (casting(Cast.Basic) || casting(Cast.DodgeCounter) || casting(Cast.Intro) || a === Liberation) {
      applyEnemy(SINNERS_MARK, 1);
    }
    if (a === Skill1) setStacksSelf(EXECUTION_MODE, 4);
    if (a === FHA && stacksOfEnemy(SINNERS_MARK)) { revokeEnemy(SINNERS_MARK); applyEnemy(PUNISHMENT_MARK, 1); }
    if (a === Outro) {
      if (stacksOfEnemy(PUNISHMENT_MARK)) queue(ACTION_JUDGMENT_STRIKES);
      queueOutro(YINLIN_OUTRO);
    }
  },

  applyStats: () => {
    addStat(Stat.BaseHp, 11000); addStat(Stat.BaseAtk, 400); addStat(Stat.BaseDef, 1283.33);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const YINLIN_TALENTS = new Talent({
  name: "Yinlin: Talents",
  applyStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// the kit-valid line: Magnetic Roar opens Execution Mode, the full combo (marked by its own first
// hits) fires all 4 Blasts, the Heavy tops the gauge to the 45 that covers Chameleon Cipher's 40,
// which upgrades the mark for Judgment Strikes off Outro. She's never the team's own lead, so
// this covers both opener and loop.
const YL_ROTATION = [
  INTRO, 
  Skill1, HA, Liberation, Skill2, FHA,
  ECHO_CAST,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, and two real
// echo choices — Empyrean Anthem behind her Coordinated Judgment Strikes, or Moonlit Clouds
export const YINLIN_LOADOUT = new Loadout({
  resonator: YINLIN,
  talent: YINLIN_TALENTS,
  inherent1: YL_INHERENT_1,
  inherent2: YL_INHERENT_2,
  weapons: [STRINGMASTER, VARIATION, NEW_STD_RECTIFIER, COSMIC_RIPPLES],
  echoLoadouts: [
    new EchoLoadout(NM_TEMPEST_MEPHIS, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
  opener: YL_ROTATION,
  loop: YL_ROTATION,
});
