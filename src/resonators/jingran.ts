/**
 * Jingran — resonator passives, signature weapon, sonata, echo, his state and his actions.
 *
 * Numbers come from the spreadsheet's stat rows for `Jingran`, `Thousandfold Deliverance`,
 * `Myriad Snare` and `Lamp of Nether Road`; the mechanics come from his kit on nanoka.cc.
 *
 * Modelled differently from the sheet on purpose: shields, Qi, Mingfire and Ghost Shroud are
 * simulated rather than hand-authored per action slot. His numbers will not match the old sheet
 * exactly.
 */
import { Buff, GlobalBuff, Gear, Action, Chain, PRIORITY } from "../kit.js";
import type { ActionDef } from "../kit.js";
import {
  add, hp, spend, counter, setCounter, action, grantGlobal,
  equipped, grantSelf, slotsWith, queue, note, isOutro, castedAs,
  stacksOf, removeStack, revoke,
} from "../state.js";
import { Stat, Element, DamageType, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------- his kit mechanics */
/*
 *  Qi           forte gauge, max 300; a heavy attack costs it all, restored by basics/intro/
 *               skill follow-ups/dodge counters/liberation.
 *  Mingfire     100 from liberation, 25 per heavy; while up a heavy summons Lib FUA and, above
 *               25, refunds 200 Qi.
 *  Earth Charm  assumed permanently up (intro/skill grant it); each damaging cast shields him.
 *  Ghost Shroud stacking buff, max 50; his intro spends it all for Fortune in Disguise.
 */

/** Ghost Shroud and Fortune in Disguise are stacking buffs, not gauges. */
export const JINGRAN_QI       = Resource.Forte1;   // the gauge the game shows
export const JINGRAN_MINGFIRE = Resource.Forte2;   // the burst window

/* --- Trace the Vestige, and what it feeds ------------------------------------------------ */

/* His kit carries no guaranteed crits — those casts are `type: HEAVY` and nothing more. */

/** Ghost Shroud — a resource; the stack count *is* the value. His intro spends it. */
export const JINGRAN_GHOST_SHROUD = new Buff(PRIORITY.BUFF_STATS,
  (stacks) => `Jingran: Ghost Shroud x${stacks}`, 50);

/** Fortune in Disguise — fusion damage scaled off Max HP per stack, own ceiling. EARLY_CONVERSION
 *  since it reads total HP; seeded empty at fight start so his intro pays out same-cast. */
export const JINGRAN_FORTUNE = new Buff(PRIORITY.EARLY_CONVERSION, (stacks) => {
  // 0.05% fusion per 1000 Max HP per stack, capped at 2.5% — hence the 50,000 HP ceiling
  const perStack = Math.min(2.5, 0.05 * Math.floor(hp() / 1000));
  add(perStack * stacks, Element.Fusion, Stat.DmgBonus);
  return `Jingran: Fortune in Disguise x${stacks}`;
}, 50);

/** Fixation — no stats; a one-shot permission the feed below spends. */
export const JINGRAN_FIXATION = new Buff(PRIORITY.BUFF_STATS, () => "Jingran: Fixation");

/** Trace the Vestige — global, banks Ghost Shroud on whichever slot is running Jingran. */
export const JINGRAN_GHOST_FEED = new GlobalBuff(PRIORITY.UPDATE_BUFFS, (stacks, { shields }) => {
  if (shields) {
    // the base rule pays 1 for anyone shielded; Trace the Vestige pays 2 for a teammate
    const own = equipped(JINGRAN);
    const per = own ? 1 : 2;
    for (const slot of slotsWith(JINGRAN)) {
      slot.addStack(JINGRAN_GHOST_SHROUD, shields * per);
      // Fixation pays once, on a teammate's shield, and is consumed doing it
      if (!own && slot.hasBuff(JINGRAN_FIXATION)) {
        slot.addStack(JINGRAN_GHOST_SHROUD, 15);
        slot.removeBuff(JINGRAN_FIXATION);
      }
    }
  }
  return "Jingran: Trace the Vestige";
});

/* --------------------------------------------------------------- resonator */

export const JINGRAN = new Gear(() => {
  add(100, Stat.Er);
  add(5, Stat.CritRate);
  add(150, Stat.CritDmg);   // a total multiplier, not a bonus: a crit deals 150%

  // level 90 base stats, rebalanced after the spreadsheet was written (13713 HP / 350 ATK)
  add(15375, Stat.BaseHp);
  add(313, Stat.BaseAtk);
  add(12, Stat.BonusHp);
  add(8, Stat.CritRate);
  return "Jingran";
}, () => {
  grantSelf(JINGRAN_HP_TO_FUSION);
  grantSelf(JINGRAN_HP_TO_ATK);
  grantSelf(JINGRAN_FIXATION);      // "upon engaging in combat, Jingran gains Fixation"
  grantGlobal(JINGRAN_GHOST_FEED);
  // entering combat tops Ghost Shroud up to 25 if he holds less
  grantSelf(JINGRAN_GHOST_SHROUD, 25);
}, Element.Fusion, () => Intro);

/** Nether to Light (Inherent Skill): his DEF is fixed at 0 (the flat -99999 forces it there —
 *  nothing here scales off his own DEF, so this is purely matching the kit text, not load-
 *  bearing for any number below), plus two HP -> stat conversions in whole 1000 HP steps:
 *  Incoming Healing Bonus and Fusion DMG Bonus. LATE, so every buff has contributed base HP/HP%
 *  first. Attached at fight start, not gear — a permanent passive. Healing Bonus is unused by
 *  the formula (healing is out of scope), tracked for completeness only. */
export const JINGRAN_HP_TO_FUSION = new Buff(PRIORITY.EARLY_CONVERSION, () => {
  add(-99999, Stat.FlatDef);
  const steps = Math.floor(Math.min(hp(), 50000) / 1000);   // only HP up to 50k counts
  add(6.2 * steps, Stat.HealingTaken);                       // 6.2% Incoming Healing Bonus per 1000 HP, capped at 310%
  add(1.5 * steps, Element.Fusion, Stat.DmgBonus);           // 1.5% fusion per 1000 HP, capped at 75%
  return "Jingran: Nether to Light";
});

export const JINGRAN_HP_TO_ATK = new Buff(PRIORITY.EARLY_CONVERSION, () => {
  const steps = Math.floor(Math.min(hp(), 50000) / 1000);   // only HP up to 50k counts
  add(36 * steps, Stat.FlatAtk);                       // 36 ATK per 1000 HP, capped at 1800
  return "Jingran: Yang Changes, Yin Unites";
});


/* ------------------------------------------------------------------ weapon */

/** Thousandfold Deliverance, R1. Nature's Order stacks on intro/shield, 6x 4% crit damage,
 *  full six sharpens heavy attacks. Cradle of Life stacks the same way, spent by a heavy for
 *  defence ignore. Both end on his outro. */

export const JINGRAN_SIG = new Gear((stacks, a) => {
  add(413, Stat.BaseAtk);
  add(72.2, Stat.BonusHp);
  add(12, Stat.DmgBonus);

  // the shield trigger has a 0.5s ICD, but every cast that shields him twice (his liberation,
  // both heavy attacks) is long enough that the two shields land more than 0.5s apart — so
  // `shields` itself is the stack count, not capped to 1. The intro is a separate trigger — a
  // cast that's both pays both.
  const gained = a.shields + (a.cast === DamageType.Intro ? 1 : 0);
  if (gained) {
    grantSelf(NATURES_ORDER, gained);
    grantSelf(CRADLE_OF_LIFE, gained);
  }
  return "Thousandfold Deliverance";
});

export const NATURES_ORDER = new Buff(PRIORITY.BUFF_STATS, (stacks) => {
  // switching resonator ends it immediately — whoever is wielding the weapon, not just Jingran
  if (isOutro(action()!)) {
    revoke(NATURES_ORDER);
    return "Thousandfold Deliverance: Nature's Order x0";
  }
  add(4 * stacks, Stat.CritDmg);
  // the full six pay crit rate, scoped so only heavy attack damage resolves it
  if (stacks >= 6) add(12, DamageType.Heavy, Stat.CritRate);
  return `Thousandfold Deliverance: Nature's Order x${stacks}`;
}, 6);

/** Cradle of Life — stacks like Nature's Order but is spent: a heavy attack consumes up to two
 *  stacks, each piercing 15% defence. "Heavy attack" is the cast, not the damage type (his
 *  basic stages 3/4 deal Heavy Attack DMG without being heavy-attack casts). Also ends on
 *  switching resonator, same as Nature's Order. */
export const CRADLE_OF_LIFE = new Buff(PRIORITY.BUFF_STATS, (stacks) => {
  if (isOutro(action()!)) {
    revoke(CRADLE_OF_LIFE);
    return;
  }
  if (!castedAs(action()!, DamageType.Heavy)) return;

  const spent = Math.min(stacks, 2);
  add(15 * spent, DamageType.Heavy, Stat.DefIgnore);
  removeStack(CRADLE_OF_LIFE, spent);
  return `Thousandfold Deliverance: Cradle of Life x${stacks}`;
}, 6);

/* -------------------------------------------------------------- echo, sonata */

export const MYRIAD_SNARE = new Gear(() => {
  add(12, Element.Fusion, Stat.DmgBonus);
  add(12, DamageType.Heavy, Stat.DmgBonus);
  return "Myriad Snare";
});

/** The echo's cast, paired with the Mainslot buff above. */
export const ACTION_MYRIAD_SNARE = new Action("Echo: Myriad Snare", {
  cast: DamageType.Echo,
  element: Element.Fusion,
  scaling: Scaling.Hp,
  type: DamageType.Echo,
  mv: 17.23,
  energy: 3.8,
});

/** Lamp of Nether Road 5pc: a shield grants 5% crit rate, four stacks, full four pay 15% fusion
 *  damage on top. */
export const LAMP_5PC = new Gear((stacks, { shields }) => {
  if (shields) grantSelf(LAMP_STACKS, shields);
  return "Lamp of Nether Road 5pc";
});

export const LAMP_STACKS = new Buff(PRIORITY.BUFF_STATS, (stacks) => {
  add(5 * stacks, Stat.CritRate);
  if (stacks >= 4) add(15, Element.Fusion, Stat.DmgBonus);
  return `Lamp of Nether Road x${stacks}`;
}, 4);

export const LAMP_2PC = new Gear(() => { add(10, Stat.BonusHp); return "Lamp of Nether Road 2pc"; });

/** His echoes: the sheet's `jingran r1 cd/hp` build, running the Lamp 5pc his loadout already
 *  has. Substats are HP not ATK — it's his real damage stat, and two HP% rolls clear his
 *  50,000 HP ceiling. */
export const LOADOUT = [
  JINGRAN, JINGRAN_SIG, MYRIAD_SNARE, LAMP_5PC, LAMP_2PC,
  mainstats("CD CD", "", "hp hp hp"),
  chem("hp", "heavy"),
];

/** Same build, 44111 CR/CD instead of double CD — for the Lupa team. */
export const LOADOUT_CRCD = [
  JINGRAN, JINGRAN_SIG, MYRIAD_SNARE, LAMP_5PC, LAMP_2PC,
  mainstats("CR CD", "", "hp hp hp"),
  chem("hp", "heavy"),
];

/* ------------------------------------------------------- what his actions do */
/*
 * Qi is forte1: an action that just restores it needs no body. Only the casts that do more —
 * the heavy attack, the liberation, intro and outro — carry an apply().
 */

/* ----------------------------------------------------------------- actions */

/** Wrapper: element and scaling are the same for everything he does. */
function jingranAction(name: string, def: ActionDef): Action {
  return new Action(`Jingran: ${name}`, {
    element: Element.Fusion,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics and mid-air. Stages 3 and 4 restore Qi.
const BA1 = jingranAction("Yang Basic 1", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Basic, mv: 39.82, energy: 0.67, concerto: 1.34, offtune: 0.2136 });
const BA2 = jingranAction("Yang Basic 2", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Basic, mv: 99.47, energy: 1.68, concerto: 3.35, offtune: 0.5337 });
const BA3 = jingranAction("Yang Basic 3", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Heavy, mv: 159.1, energy: 2.69, concerto: 5.36, offtune: 0.8537, forte1: 50 });
const BA4 = jingranAction("Yang Basic 4", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Heavy, mv: 124.24, energy: 2.09, concerto: 4.18, offtune: 0.6666, forte1: 50 });
const MA = jingranAction("Plunge", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Basic, mv: 92.45, energy: 1.55, concerto: 3.1, offtune: 0.496 });

// --- enhanced basics
const EBA1 = jingranAction("Yin Basic 1", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Basic, mv: 44.74, energy: 0.75, concerto: 1.5, offtune: 0.24 });
const EBA2 = jingranAction("Yin Basic 2", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Basic, mv: 74.56, energy: 1.26, concerto: 2.5, offtune: 0.4 });
const EBA3 = jingranAction("Yin Basic 3", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Heavy, mv: 109.32, energy: 1.84, concerto: 3.68, offtune: 0.5864, forte1: 50 });
const EBA4 = jingranAction("Yin Basic 4", { node: Node.Normal, cast: DamageType.Basic, shields: 1, type: DamageType.Heavy, mv: 153.16, energy: 2.6, concerto: 5.16, offtune: 0.8218, forte1: 50 });

// chains
export const BA234 = new Chain("Jingran: Yang Basic 234", [BA2, BA3, BA4]);
export const EBA234 = new Chain("Jingran: Yin Basic 234", [EBA2, EBA3, EBA4]);

// --- dodge counters: Nether Dive / Light Watch, 100 Qi each
const DC = jingranAction("Yang Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, shields: 1, type: DamageType.Heavy, mv: 198.8, energy: 3.36, concerto: 6.68, offtune: 1.0664, forte1: 100 });
const EDC = jingranAction("Yin Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, shields: 1, type: DamageType.Heavy, mv: 248.57, energy: 4.19, concerto: 8.36, offtune: 1.3337, forte1: 100 });

// --- resonance skill. The "2" casts are the hold-Normal-Attack follow-ups, 100 Qi.
const Skill1 = jingranAction("Yang Skill 1", {
  node: Node.Skill, cast: DamageType.Skill, shields: 1, type: DamageType.Skill, mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 0.56,
});
const ESkill1 = jingranAction("Yin Skill 1", {
  node: Node.Skill, cast: DamageType.Skill, shields: 1, type: DamageType.Skill, mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 0.56,
});
const Skill2 = jingranAction("Yang Skill 2", {
  node: Node.Skill, cast: DamageType.Skill, shields: 1, type: DamageType.Heavy, mv: 258.47, energy: 3.35, concerto: 5, offtune: 1.0667,
  forte1: 100,
});
const ESkill2 = jingranAction("Yin Skill 2", {
  node: Node.Skill, cast: DamageType.Skill, shields: 1, type: DamageType.Heavy, mv: 263.48, energy: 3.43, concerto: 5, offtune: 1.0936,
  forte1: 100,
});

// --- liberation. -125 is display only: a liberation doesn't move the running energy total.
const Lib = jingranAction("Liberation", {
  node: Node.Liberation, cast: DamageType.Liberation, shields: 2, type: DamageType.Heavy, mv: 745.2,      // 93.15% x 8
  energy: -125, concerto: 20, offtune: 16.8, forte1: 200,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { setCounter(JINGRAN_MINGFIRE, 100); },
});

/** Chimei Wangliang — the Yinghuo follow-up, one per heavy attack. Node LIB (attributed to the
 *  liberation) but no `cast`: it's a summon, not a press, so it fires no trigger. */
export const ACTION_LIB_FUA = jingranAction("Liberation Followup", {
  node: Node.Liberation,
  type: DamageType.Heavy,
  mv: 83.51,
});

// --- intro / outro. Outro declares -100 concerto for display only.
const Intro = jingranAction("Intro", {
  node: Node.Intro, cast: DamageType.Intro, shields: 1, type: DamageType.Intro, mv: 198.81,
  energy: 10, concerto: 10, offtune: 0.8, forte1: 100,
  // spends every Ghost Shroud stack he walked in with for Fortune in Disguise. UPDATE_BUFFS:
  // this action's own shield must not be in the pile it converts.
  priority: PRIORITY.UPDATE_BUFFS,
  apply() {
    const shroud = stacksOf(JINGRAN_GHOST_SHROUD);
    if (!shroud) return;
    revoke(JINGRAN_GHOST_SHROUD);
    grantSelf(JINGRAN_FORTUNE, shroud);
  },
});
const Outro = jingranAction("Outro", {
  cast: DamageType.Outro, type: DamageType.Outro, mv: 795, concerto: -100, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() {
    setCounter(JINGRAN_MINGFIRE, 0);
    revoke(JINGRAN_FORTUNE);
    grantSelf(JINGRAN_FIXATION);
  },
});

/** Heavy attack — Soul Raid / Stardome Meander, shared function, `mvPer1000` differs. Spends
 *  the whole Qi gauge; while Mingfire is up, summons Lib FUA and refunds most of the Qi. */
function heavyAttack(mvPer1000: number): string {
  const mingfire = counter(JINGRAN_MINGFIRE);

  // above 25 Mingfire a heavy still has a Wayfarer's Mark to spend, which refunds 200 Qi
  if (mingfire > 25) {
    setCounter(JINGRAN_QI, counter(JINGRAN_QI) + 200);
  }
  if (mingfire > 0) {                                 // the burst window is open
    queue(ACTION_LIB_FUA);
    setCounter(JINGRAN_MINGFIRE, Math.max(0, mingfire - 25));

    // Mingfire's MV boost: 25 of it, only inside Yinghuo, only HP between 25k-50k counts.
    // Added straight to motion value (ADD_MV), so it needs no re-expressing.
    const steps = Math.max(0, Math.floor((Math.min(hp(), 50000) - 25000) / 1000));
    add(mvPer1000 * steps, Stat.AddMv);
  }
  return "Jingran: Fire of Life";
}

// --- heavy attacks ("forte skills"). Unprefixed = Yang Font (FHA = Stardome Meander),
//     EFHA (Yin Vessel) = Soul Raid.
const FHA = jingranAction("Yang Forte Heavy", {
  node: Node.Forte, cast: DamageType.Heavy, shields: 2, type: DamageType.Heavy, mv: 240.38,          // 24.04% + 24.04% + 48.08% + 144.22%
  energy: 8.5, concerto: 13, offtune: 1.04, forte1: -300, priority: PRIORITY.LATE_CONVERSION, apply: () => heavyAttack(21.65),   // 2.17% + 2.17% + 4.33% + 12.98%
});
const EFHA = jingranAction("Yin Forte Heavy", {
  node: Node.Forte, cast: DamageType.Heavy, shields: 2, type: DamageType.Heavy, mv: 234.29,          // 16.40% x2 + 21.09% x3 + 138.22%
  energy: 8.53, concerto: 13, offtune: 1.014, forte1: -300, priority: PRIORITY.LATE_CONVERSION, apply: () => heavyAttack(21.10),    // 1.48% x2 + 1.90% x3 + 12.44%
});

/** His standard opener. Qi economy: intro 100, liberation +200 to 300, each of the four heavy
 *  attacks spends 300 and the first three refund 200 while Mingfire is above 25. Intro is no
 *  longer placed here — the preceding member's outro triggers it (see `onIntro`). */
export const ROTATION = [
  Lib, FHA,
  EBA234, EFHA,
  Skill1, Skill2, FHA,
  ESkill1, ESkill2, EFHA,
  ACTION_MYRIAD_SNARE, Outro,
];
