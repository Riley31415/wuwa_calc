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
import { Buff, GlobalBuff, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { Ctx, ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { MYRIAD_SNARE, LAMP_2PC, LAMP_5PC } from "../echoes/mengzhou.js";
import { JINGRAN_SIG } from "../weapons/broadblade.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#f2603c";

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
  (ctx, stacks) => `Jingran: Ghost Shroud x${stacks}`, 50);

/** Fortune in Disguise — fusion damage scaled off Max HP per stack, own ceiling. EARLY_CONVERSION
 *  since it reads total HP; seeded empty at fight start so his intro pays out same-cast. */
export const JINGRAN_FORTUNE = new Buff(PRIORITY.EARLY_CONVERSION, (ctx, stacks) => {
  // 0.05% fusion per 1000 Max HP per stack, capped at 2.5% — hence the 50,000 HP ceiling
  const perStack = Math.min(2.5, 0.05 * Math.floor(ctx.hp() / 1000));
  ctx.add(perStack * stacks, Element.Fusion, Stat.DmgBonus);
  return `Jingran: Fortune in Disguise x${stacks}`;
}, 50);

/** Fixation — no stats; a one-shot permission the feed below spends. */
export const JINGRAN_FIXATION = new Buff(PRIORITY.BUFF_STATS, () => "Jingran: Fixation");

/** Trace the Vestige — global, banks Ghost Shroud on whichever slot is running Jingran. */
export const JINGRAN_GHOST_FEED = new GlobalBuff(PRIORITY.UPDATE_BUFFS, (ctx) => {
  if (ctx.shields) {
    // the base rule pays 1 for anyone shielded; Trace the Vestige pays 2 for a teammate
    const own = ctx.slot.resonator?.name === "Jingran";
    const per = own ? 1 : 2;
    for (const slot of ctx.slotsWith("Jingran")) {
      slot.addStack(JINGRAN_GHOST_SHROUD, ctx.shields * per, ctx.owner);
      // Fixation pays once, on a teammate's shield, and is consumed doing it
      if (!own && slot.hasBuff(JINGRAN_FIXATION)) {
        slot.addStack(JINGRAN_GHOST_SHROUD, 15, ctx.owner);
        slot.removeBuff(JINGRAN_FIXATION);
      }
    }
  }
  return "Jingran: Trace the Vestige";
});

/* --------------------------------------------------------------- resonator */

/** Nether to Light (Inherent Skill): his DEF is fixed at 0 (the flat -99999 forces it there —
 *  nothing here scales off his own DEF, so this is purely matching the kit text, not load-
 *  bearing for any number below), plus two HP -> stat conversions in whole 1000 HP steps:
 *  Incoming Healing Bonus and Fusion DMG Bonus. LATE, so every buff has contributed base HP/HP%
 *  first. Attached at fight start, not gear — a permanent passive. Healing Bonus is unused by
 *  the formula (healing is out of scope), tracked for completeness only. */
export const JINGRAN_HP_TO_FUSION = new Buff(PRIORITY.EARLY_CONVERSION, (ctx) => {
  ctx.add(-99999, Stat.FlatDef);
  const steps = Math.floor(Math.min(ctx.hp(), 50000) / 1000);   // only HP up to 50k counts
  ctx.add(6.2 * steps, Stat.HealingTaken);                       // 6.2% Incoming Healing Bonus per 1000 HP, capped at 310%
  ctx.add(1.5 * steps, Element.Fusion, Stat.DmgBonus);           // 1.5% fusion per 1000 HP, capped at 75%
  return "Jingran: Nether to Light";
});

export const JINGRAN_HP_TO_ATK = new Buff(PRIORITY.EARLY_CONVERSION, (ctx) => {
  const steps = Math.floor(Math.min(ctx.hp(), 50000) / 1000);   // only HP up to 50k counts
  ctx.add(36 * steps, Stat.FlatAtk);                       // 36 ATK per 1000 HP, capped at 1800
  return "Jingran: Yang Changes, Yin Unites";
});


/** His own Resonator — shared by both loadouts below, only the mainstat spread differs. His
 *  weapon (Thousandfold Deliverance) lives in weapons/broadblade.js; his mainslot echo (Myriad Snare)
 *  and sonata (Lamp of Nether Road) live in echoes/mengzhou.js. */
export class Jingran extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Jingran",
      Element.Fusion,
      () => Intro,
      loadout,
      (ctx) => {
        // level 90 base stats, rebalanced after the spreadsheet was written (13713 HP / 350 ATK)
        ctx.add(15375, Stat.BaseHp);
        ctx.add(313, Stat.BaseAtk);
        ctx.add(12, Stat.BonusHp);
      },
      (ctx) => { ctx.add(8, Stat.CritRate); },
      (ctx) => {
        ctx.grantSelf(JINGRAN_HP_TO_FUSION);
        ctx.grantSelf(JINGRAN_HP_TO_ATK);
        ctx.grantSelf(JINGRAN_FIXATION);      // "upon engaging in combat, Jingran gains Fixation"
        ctx.grantGlobal(JINGRAN_GHOST_FEED);
        // entering combat tops Ghost Shroud up to 25 if he holds less
        ctx.grantSelf(JINGRAN_GHOST_SHROUD, 25);
      },
    );
  }
}

/** His echoes: the sheet's `jingran r1 cd/hp` build, running the Lamp 5pc his loadout already
 *  has. Substats are HP not ATK — it's his real damage stat, and two HP% rolls clear his
 *  50,000 HP ceiling. */
const JINGRAN_LOADOUT = new Loadout(
  JINGRAN_SIG, MYRIAD_SNARE, LAMP_5PC, LAMP_2PC,
  mainstats("CD CD", "", "hp hp hp"), chem("hp", "heavy"),
);
export const LOADOUT: ResonatorFactory = () => new Jingran(JINGRAN_LOADOUT);

/** Same build, 44111 CR/CD instead of double CD — for the Lupa team. */
const JINGRAN_LOADOUT_CRCD = new Loadout(
  JINGRAN_SIG, MYRIAD_SNARE, LAMP_5PC, LAMP_2PC,
  mainstats("CR CD", "", "hp hp hp"), chem("hp", "heavy"),
);
export const LOADOUT_CRCD: ResonatorFactory = () => new Jingran(JINGRAN_LOADOUT_CRCD);

/* ------------------------------------------------------- what his actions do */
/*
 * Qi is forte1: an action that just restores it needs no body. Only the casts that do more —
 * the heavy attack, the liberation, intro and outro — carry an apply().
 */

/* ----------------------------------------------------------------- actions */

/** Wrapper: element and scaling are the same for everything he does. */
function jingranAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Fusion,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics and mid-air. Stages 3 and 4 restore Qi. Unprefixed = Yang Font's own basic combo
//     (Devil's Bane); "Drink Soul" is Yin Vessel's. Mid-air Attack itself is shared by both
//     states — no separate name — so it's filed under his own basic-attack tree's own umbrella
//     name (Edge of Life and Death), same convention as every other kit's own tree-named basics.
const BA1 = jingranAction("Basic: Devil's Bane 1", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: DamageType.Basic, mv: 39.82, energy: 67, concerto: 134, offtune: 2136 });
const BA2 = jingranAction("Basic: Devil's Bane 2", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: DamageType.Basic, mv: 99.47, energy: 168, concerto: 335, offtune: 5337 });
const BA3 = jingranAction("Basic: Devil's Bane 3", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: DamageType.Heavy, mv: 159.1, energy: 269, concerto: 536, offtune: 8537, forte1: 50 });
const BA4 = jingranAction("Basic: Devil's Bane 4", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: DamageType.Heavy, mv: 124.24, energy: 209, concerto: 418, offtune: 6666, forte1: 50 });
const MA = jingranAction("Basic: Edge of Life and Death (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: DamageType.Basic, mv: 92.45, energy: 155, concerto: 310, offtune: 4960 });

// --- enhanced basics: Drink Soul, Yin Vessel's own basic combo
const EBA1 = jingranAction("Basic: Drink Soul 1", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: DamageType.Basic, mv: 44.74, energy: 75, concerto: 150, offtune: 2400 });
const EBA2 = jingranAction("Basic: Drink Soul 2", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: DamageType.Basic, mv: 74.56, energy: 126, concerto: 250, offtune: 4000 });
const EBA3 = jingranAction("Basic: Drink Soul 3", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: DamageType.Heavy, mv: 109.32, energy: 184, concerto: 368, offtune: 5864, forte1: 50 });
const EBA4 = jingranAction("Basic: Drink Soul 4", { node: Node.Normal, cast: Cast.Basic, shields: 1, type: DamageType.Heavy, mv: 153.16, energy: 260, concerto: 516, offtune: 8218, forte1: 50 });

// chains
export const BA234 = new Chain("Basic: Devil's Bane 234", [BA2, BA3, BA4]);
export const EBA234 = new Chain("Basic: Drink Soul 234", [EBA2, EBA3, EBA4]);

// --- dodge counters: Light Watch (Yang Font), Nether Dive (Yin Vessel), 100 Qi each
const DC = jingranAction("Basic: Light Watch", { node: Node.Normal, cast: Cast.DodgeCounter, shields: 1, type: DamageType.Heavy, mv: 198.8, energy: 336, concerto: 668, offtune: 10664, forte1: 100 });
const EDC = jingranAction("Basic: Nether Dive", { node: Node.Normal, cast: Cast.DodgeCounter, shields: 1, type: DamageType.Heavy, mv: 248.57, energy: 419, concerto: 836, offtune: 13337, forte1: 100 });

// --- resonance skill. Scorching Yang/Afterlife's Guide are Yang Font's own tap+hold pair;
//     Encroaching Yin/Netherworld Traverse are Yin Vessel's — the "2" casts are the hold-Normal-
//     Attack follow-ups, 100 Qi.
const Skill1 = jingranAction("Skill: Scorching Yang", {
  node: Node.Skill, cast: Cast.Skill, shields: 1, type: DamageType.Skill, mv: 164.04, energy: 175, concerto: 350, offtune: 5600,
});
const ESkill1 = jingranAction("Skill: Encroaching Yin", {
  node: Node.Skill, cast: Cast.Skill, shields: 1, type: DamageType.Skill, mv: 164.04, energy: 175, concerto: 350, offtune: 5600,
});
const Skill2 = jingranAction("Skill: Afterlife's Guide", {
  node: Node.Skill, cast: Cast.Skill, shields: 1, type: DamageType.Heavy, mv: 258.47, energy: 335, concerto: 500, offtune: 10667,
  forte1: 100,
});
const ESkill2 = jingranAction("Skill: Netherworld Traverse", {
  node: Node.Skill, cast: Cast.Skill, shields: 1, type: DamageType.Heavy, mv: 263.48, energy: 343, concerto: 500, offtune: 10936,
  forte1: 100,
});

// --- liberation. -125 is display only: a liberation doesn't move the running energy total.
const Lib = jingranAction("Liberation: Burial of Thousand Souls", {
  node: Node.Liberation, cast: Cast.Liberation, shields: 2, type: DamageType.Heavy, mv: 745.2,      // 93.15% x 8
  energy: -12500, concerto: 2000, offtune: 168000, forte1: 200,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.setCounter(JINGRAN_MINGFIRE, 100); },
});

/** Chimei Wangliang — the Yinghuo follow-up, one per heavy attack. Node LIB (attributed to the
 *  liberation) but no `cast`: it's a summon, not a press, so it fires no trigger. */
export const ACTION_LIB_FUA = jingranAction("Liberation: Chimei Wangliang", {
  node: Node.Liberation,
  type: DamageType.Heavy,
  mv: 83.51,
});

// --- intro / outro. Outro declares -100 concerto for display only.
const Intro = jingranAction("Intro: Question the Tombs", {
  node: Node.Intro, cast: Cast.Intro, shields: 1, type: DamageType.Intro, mv: 198.81,
  energy: 1000, concerto: 1000, offtune: 8000, forte1: 100,
  // spends every Ghost Shroud stack he walked in with for Fortune in Disguise. UPDATE_BUFFS:
  // this action's own shield must not be in the pile it converts.
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    const shroud = ctx.stacksOf(JINGRAN_GHOST_SHROUD);
    if (!shroud) return;
    ctx.revoke(JINGRAN_GHOST_SHROUD);
    ctx.grantSelf(JINGRAN_FORTUNE, shroud);
  },
});
const Outro = jingranAction("Outro: Rising Fortune and Ebbing Evil", {
  cast: Cast.Outro, type: DamageType.Outro, mv: 795, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    ctx.setCounter(JINGRAN_MINGFIRE, 0);
    ctx.revoke(JINGRAN_FORTUNE);
    ctx.grantSelf(JINGRAN_FIXATION);
  },
});

/** Heavy attack — Soul Raid / Stardome Meander, shared function, `mvPer1000` differs. Spends
 *  the whole Qi gauge; while Mingfire is up, summons Lib FUA and refunds most of the Qi. */
function heavyAttack(ctx: Ctx, mvPer1000: number): string {
  const mingfire = ctx.counter(JINGRAN_MINGFIRE);

  // above 25 Mingfire a heavy still has a Wayfarer's Mark to spend, which refunds 200 Qi
  if (mingfire > 25) {
    ctx.setCounter(JINGRAN_QI, ctx.counter(JINGRAN_QI) + 200);
  }
  if (mingfire > 0) {                                 // the burst window is open
    ctx.queue(ACTION_LIB_FUA);
    ctx.setCounter(JINGRAN_MINGFIRE, Math.max(0, mingfire - 25));

    // Mingfire's MV boost: 25 of it, only inside Yinghuo, only HP between 25k-50k counts.
    // Added straight to motion value (ADD_MV), so it needs no re-expressing.
    const steps = Math.max(0, Math.floor((Math.min(ctx.hp(), 50000) - 25000) / 1000));
    ctx.add(mvPer1000 * steps, Stat.AddMv);
  }
  return "Jingran: Fire of Life";
}

// --- heavy attacks ("forte skills"). Unprefixed = Yang Font's own (FHA = Stardome Meander,
//     switches him to Yin Vessel on landing), EFHA (Yin Vessel's own) = Soul Raid (switches him
//     to Yang Font).
const FHA = jingranAction("Heavy: Stardome Meander", {
  node: Node.Forte, cast: Cast.Heavy, shields: 2, type: DamageType.Heavy, mv: 240.38,          // 24.04% + 24.04% + 48.08% + 144.22%
  energy: 850, concerto: 1300, offtune: 10400, forte1: -300, priority: PRIORITY.LATE_CONVERSION, apply: (ctx) => heavyAttack(ctx, 21.65),   // 2.17% + 2.17% + 4.33% + 12.98%
});
const EFHA = jingranAction("Heavy: Soul Raid", {
  node: Node.Forte, cast: Cast.Heavy, shields: 2, type: DamageType.Heavy, mv: 234.29,          // 16.40% x2 + 21.09% x3 + 138.22%
  energy: 853, concerto: 1300, offtune: 10140, forte1: -300, priority: PRIORITY.LATE_CONVERSION, apply: (ctx) => heavyAttack(ctx, 21.10),    // 1.48% x2 + 1.90% x3 + 12.44%
});

/** His standard opener. Qi economy: intro 100, liberation +200 to 300, each of the four heavy
 *  attacks spends 300 and the first three refund 200 while Mingfire is above 25. Intro is no
 *  longer placed here — the preceding member's outro triggers it (see `onIntro`). */
export const ROTATION = [
  Lib, FHA,
  EBA234, EFHA,
  Skill1, Skill2, FHA,
  ESkill1, ESkill2, EFHA,
  ECHO_CAST, Outro,
];
