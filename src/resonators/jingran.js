/**
 * Jingran — resonator passives, signature weapon, sonata, echo, his state and his actions.
 *
 * Numbers come from the spreadsheet's stat rows for `Jingran`, `Thousandfold Deliverance`,
 * `Myriad Snare` and `Lamp of Nether Road`; the mechanics come from his kit on nanoka.cc.
 *
 * Modelled differently from the sheet on purpose: shields, Qi, Mingfire and Ghost Shroud are
 * simulated rather than hand-authored per action slot, and buffs that used to be conditional
 * on an action tag now live in the action that triggers them. So his numbers will not match
 * the old sheet exactly.
 */
import { Buff, Gear, Action, Chain, PRIORITY } from "../kit.js";
import {
  add, hp, spend, counter, setCounter, grantTeam, action,
  equipped, onField, grantSelf, slotsWith, queue, note,
  addStack, stacksOf, removeStack, revoke,
} from "../state.js";
import {
  BASE_ATK, BASE_HP, BONUS_HP, FLAT_ATK, CRIT_RATE, CRIT_DMG, ER, ADD_MV, DEF_IGNORE,
  DMG_BONUS,
  FUSION, BASIC, HEAVY, SKILL, INTRO, OUTRO, ECHO, NORMAL, FORTE, LIB,
  SCALE_HP,
  FORTE1, FORTE2,
  FLAT_DEF,
} from "../stats.js";
import { mainstats, chem } from "../shared.js";

/* ------------------------------------------------------- his kit mechanics */
/*
 *  Qi           the forte gauge, max 300. A heavy attack (Soul Raid in Yin Vessel /
 *               Stardome Meander in Yang Font) costs the full 300. Restored by basic stages
 *               3 and 4 (50), the intro (100), the hold-Normal-Attack skill follow-ups
 *               (100), dodge counters (100) and the liberation (200).
 *
 *  Mingfire     100 from the liberation, 25 spent per heavy attack. It is the only gauge the
 *               burst window needs, because both of the things the kit names fall out of it:
 *                 Yinghuo         mingfire > 0   — the heavy summons the Lib FUA follow-up
 *                 Wayfarer's Mark mingfire > 25  — the heavy refunds 200 Qi
 *               100 Mingfire therefore gives four follow-ups and three refunds.
 *
 *  Earth Charm  assumed permanently up — his intro and either resonance skill grant it and
 *               both are in every rotation. While it holds, each damaging action shields him,
 *               which is what `shields: 1` on his actions says.
 *
 *  Ghost Shroud a stacking buff, max 50. Trace the Vestige pays 2 a shield when a *teammate*
 *               shields and 1 when he shields himself; Fixation pays a one-off 15 on top of
 *               the next ally shield. His intro spends the lot for Fortune in Disguise.
 */

/** Two gauges, so the first two generic forte counters cover them. Ghost Shroud and Fortune
 *  in Disguise are stacking buffs rather than gauges — the game calls both of them stacks. */
export const JINGRAN_QI       = FORTE1;   // the gauge the game shows
export const JINGRAN_MINGFIRE = FORTE2;   // the burst window

const QI_MAX = 300, QI_COST = 300, QI_REFUND = 200;
const MINGFIRE_ON_LIB = 100, MINGFIRE_PER_HEAVY = 25;
/** Above this much Mingfire a heavy still has a Wayfarer's Mark to spend. */
const MARK_THRESHOLD = 25;

/* --- Trace the Vestige, and what it feeds ------------------------------------------------ */


const FORTUNE_MAX = 50, SHROUD_MAX = 50;

/**
 * Ghost Shroud per shield. The kit states it twice: the base rule pays 1 whenever anyone on
 * the team is shielded, and Trace the Vestige pays 2 for a resonator *other than* Jingran. So
 * his own Earth Charm shields are worth half what a teammate's are.
 */
const SHROUD_PER_ALLY_SHIELD = 2, SHROUD_PER_OWN_SHIELD = 1;

/** Fixation: held from the start of the fight and re-granted by his outro. The next shield a
 *  teammate gains pays this on top of the ordinary 2, and spends it. */
const FIXATION_SHROUD = 15;

/**
 * He does not walk in empty: entering combat tops Ghost Shroud up to 25 if he holds less. That
 * is the inherent skill, not an assumption about a previous rotation — so his opener converts
 * at least 25 stacks of Fortune in Disguise even with nobody shielding him.
 */
const SHROUD_ON_ENTERING_COMBAT = 25;

/*
 * Nothing of his is a guaranteed crit. A machine translation of the CN kit renders 重击 ("heavy
 * attack") as "critical hit", which makes half his kit look like it always crits; the EN text
 * says "dealing Heavy Attack DMG" throughout. Those casts carry `type: HEAVY` and nothing more.
 */

/** Fortune in Disguise: 0.05% fusion damage per 1000 Max HP per stack, capped at 2.5% a stack
 *  — which is exactly where the 50,000 HP ceiling on the conversions comes from. */
const FORTUNE_PER_1000_HP = 0.05, FORTUNE_CAP_PER_STACK = 2.5;

/**
 * Ghost Shroud — a resource, so it contributes no stats of its own; the stack count *is* the
 * value. His intro spends it.
 */
export const JINGRAN_GHOST_SHROUD = new Buff("Jingran: Ghost Shroud", PRIORITY.BUFF_STATS,
  () => stacksOf(JINGRAN_GHOST_SHROUD), SHROUD_MAX);

/**
 * Fortune in Disguise. Each stack pays fusion damage scaled off his Max HP, and the per-stack
 * payout has its own ceiling, so the stacks and the HP window are two independent caps.
 *
 * EARLY_CONVERSION: it reads total HP, so every buff contributing base HP and HP% has to have
 * run first — and it is seeded empty at fight start (see JINGRAN's onFightStart) so the intro
 * that converts Ghost Shroud into it pays out on that same cast.
 */
export const JINGRAN_FORTUNE = new Buff("Jingran: Fortune in Disguise", PRIORITY.EARLY_CONVERSION, () => {
  const held = stacksOf(JINGRAN_FORTUNE);
  // Holding none contributes nothing at all rather than a zero — his outro revokes the stacks
  // before this runs, and a 0% row in the damage-bonus panel is noise, not information.
  if (!held) return held;

  const perStack = Math.min(FORTUNE_CAP_PER_STACK,
    FORTUNE_PER_1000_HP * Math.floor(hp() / 1000));
  add(perStack * held, FUSION, DMG_BONUS);
  return held;
}, FORTUNE_MAX);

/** Fixation. Carries no stats — it is a one-shot permission the feed below spends. */
export const JINGRAN_FIXATION = new Buff("Jingran: Fixation", PRIORITY.BUFF_STATS, () => {});

/**
 * Trace the Vestige. A team-wide buff, so it runs on every resonator's every action and sees
 * whoever is shielding. It reads the shields the action grants and banks Ghost Shroud on
 * whichever slot is running Jingran — which may not be the acting one, and usually is not.
 *
 * `equipped(JINGRAN)` is how it tells his own shielding from a teammate's, since the buff runs
 * in the acting resonator's context either way.
 */
export const JINGRAN_GHOST_FEED = new Buff("Jingran: Trace the Vestige", PRIORITY.UPDATE_BUFFS, () => {
  const shields = action().shields;
  if (!shields) return;
  const own = equipped(JINGRAN);
  const per = own ? SHROUD_PER_OWN_SHIELD : SHROUD_PER_ALLY_SHIELD;

  for (const slot of slotsWith(JINGRAN)) {
    slot.addStack(JINGRAN_GHOST_SHROUD, shields * per);
    // Fixation pays once, on a teammate's shield, and is consumed doing it
    if (!own && slot.hasBuff(JINGRAN_FIXATION)) {
      slot.addStack(JINGRAN_GHOST_SHROUD, FIXATION_SHROUD);
      slot.removeBuff(JINGRAN_FIXATION);
    }
  }
});

/* --------------------------------------------------------------- resonator */

export const JINGRAN = new Gear("Jingran", () => {
  // Every resonator's innate baseline. Held here rather than in a shared global buff so a
  // resonator's file is the single place its whole stat line is described.
  add(100, ER);
  add(5, CRIT_RATE);
  add(150, CRIT_DMG);   // a total multiplier, not a bonus: a crit deals 150%

  // Level 90 base stats, from his kit page. These were rebalanced after the spreadsheet was
  // written, which carried 13713 HP / 350 ATK — HP is his damage stat, so the gap mattered.
  add(15375, BASE_HP);
  add(313, BASE_ATK);
  add(12, BONUS_HP);
  add(8, CRIT_RATE);
}, () => {
  grantSelf(JINGRAN_HP_TO_FUSION);
  grantSelf(JINGRAN_HP_TO_ATK);
  grantSelf(JINGRAN_FIXATION);      // "upon engaging in combat, Jingran gains Fixation"
  grantTeam(JINGRAN_GHOST_FEED);
  // entering combat tops Ghost Shroud up to 25 if he holds less
  addStack(JINGRAN_GHOST_SHROUD, SHROUD_ON_ENTERING_COMBAT);
}, FUSION);

/**
 * His HP → damage conversions, all in whole 1000 HP steps. LATE, because they read total HP
 * after every other buff has contributed base HP and HP%. Not gear — it is a permanent
 * passive `JINGRAN`'s own onFightStart attaches, not something separately equipped.
 */
export const JINGRAN_HP_TO_FUSION = new Buff("Jingran: Nether to Light", PRIORITY.EARLY_CONVERSION, () => {
  add(-99999, FLAT_DEF)
  const steps = Math.floor(Math.min(hp(), 50000) / 1000);   // only HP up to 50k counts
  add(1.5 * steps, FUSION, DMG_BONUS);                    // 1.5% fusion per 1000 HP, capped at 75%
});

export const JINGRAN_HP_TO_ATK = new Buff("Jingran: Yang Changes, Yin Unites", PRIORITY.EARLY_CONVERSION, () => {
  const steps = Math.floor(Math.min(hp(), 50000) / 1000);   // only HP up to 50k counts
  add(36 * steps, FLAT_ATK);                       // 36 ATK per 1000 HP, capped at 1800
});


/* ------------------------------------------------------------------ weapon */

/**
 * Thousandfold Deliverance, R1. Its Nature's Order stacks on the intro or on gaining a shield,
 * six of them at 6% crit damage each, and the full six sharpen heavy attacks specifically.
 * Cradle of Life stacks alongside it and is spent by a heavy attack for defence ignore — two
 * stacks at 15% each, which is why the heavy below adds a flat 30 rather than counting anything.
 *
 * These are the 3.6.5 numbers. nanoka's static JSON still carries the pre-rework payout (10%
 * fusion damage a stack, up to 60%) — the page text is ahead of the blob, so trust the page.
 */
const NATURES_ORDER_MAX = 6, NATURES_ORDER_CRIT_DMG = 6;
/** At full stacks, heavy attacks — and only heavy attacks — crit more often. */
const NATURES_ORDER_HEAVY_CRIT_RATE = 12;

const CRADLE_MAX = 6, CRADLE_SPENT_PER_HEAVY = 2, CRADLE_DEF_IGNORE = 15;

/**
 * Is this cast a Heavy Attack — the button, not the damage type?
 *
 * A placeholder: it matches `HA` in the action's own id, which is the naming convention the
 * other resonators already use (`FHA`). Replace it the moment actions carry a cast type of
 * their own; `type: HEAVY` is not it, since that is the damage type and half his basics
 * carry it without being heavy-attack casts.
 */
const isHeavyAttackCast = (a) => /HA/.test(a.id);

export const JINGRAN_SIG = new Gear("Thousandfold Deliverance", () => {
  add(413, BASE_ATK);
  add(72.2, BONUS_HP);
  add(12, DMG_BONUS);

  // one stack a shield, and one for the intro — both triggers are listed, so a cast that is
  // an intro *and* shields pays both
  const a = action();
  const gained = a.shields + (a.node === INTRO ? 1 : 0);
  if (gained) {
    addStack(NATURES_ORDER, gained);
    addStack(CRADLE_OF_LIFE, gained);
  }
});

export const NATURES_ORDER = new Buff("Thousandfold Deliverance: Nature's Order", PRIORITY.BUFF_STATS, () => {
  const held = stacksOf(NATURES_ORDER);
  add(NATURES_ORDER_CRIT_DMG * held, CRIT_DMG);
  // the full six pay crit rate, scoped so only heavy attack damage resolves it
  if (held >= NATURES_ORDER_MAX) add(NATURES_ORDER_HEAVY_CRIT_RATE, HEAVY, CRIT_RATE);
  return held;
}, NATURES_ORDER_MAX);

/**
 * Cradle of Life. Stacks on exactly the same trigger as Nature's Order, but instead of paying
 * out while held it is **spent**: a heavy attack consumes up to two stacks and each one it
 * consumes pierces 15% of the target's defence.
 *
 * Which casts are heavy attacks is matched on the action id for now — `HA` in the name —
 * standing in until every action declares the kind of cast it is.
 */
export const CRADLE_OF_LIFE = new Buff("Thousandfold Deliverance: Cradle of Life", PRIORITY.BUFF_STATS, () => {
  const held = stacksOf(CRADLE_OF_LIFE);
  if (!held || !isHeavyAttackCast(action())) return held;

  const spent = Math.min(held, CRADLE_SPENT_PER_HEAVY);
  add(CRADLE_DEF_IGNORE * spent, HEAVY, DEF_IGNORE);
  removeStack(CRADLE_OF_LIFE, spent);
  return spent;
}, CRADLE_MAX);

/* -------------------------------------------------------------- echo, sonata */

export const MYRIAD_SNARE = new Gear("Myriad Snare", () => {
  add(12, FUSION, DMG_BONUS);
  add(12, HEAVY, DMG_BONUS);
});

/** The echo's cast, paired with the Mainslot buff above. */
export const ACTION_MYRIAD_SNARE = new Action("Echo: Myriad Snare", {
  source: "Echo",
  node: ECHO,
  element: FUSION,
  scaling: SCALE_HP,
  type: ECHO,
  mv: 17.23,
  energy: 3.8,
});

/**
 * Lamp of Nether Road 5pc: a shield grants 5% crit rate, four stacks, and the full four pay a
 * further 15% fusion damage on top.
 */
const LAMP_MAX = 4, LAMP_CRIT_PER_STACK = 5, LAMP_FULL_FUSION = 15;

export const LAMP_5PC = new Gear("Lamp of Nether Road 5pc", () => {
  const { shields } = action();
  if (shields) addStack(LAMP_STACKS, shields);
});

export const LAMP_STACKS = new Buff("Lamp of Nether Road", PRIORITY.BUFF_STATS, () => {
  const held = stacksOf(LAMP_STACKS);
  add(LAMP_CRIT_PER_STACK * held, CRIT_RATE);
  if (held >= LAMP_MAX) add(LAMP_FULL_FUSION, FUSION, DMG_BONUS);
  return held;
}, LAMP_MAX);

export const LAMP_2PC = new Gear("Lamp of Nether Road 2pc", () => { add(10, BONUS_HP); });

/**
 * His echoes, from the sheet's `jingran r1 cd/hp` build — the strongest of the ones running
 * the Lamp 5pc his loadout already has. Both are built by calling shared.js's generators, so
 * swapping either is one edit here: `mainstats("CR", "", "hp hp hp hp")` and
 * `mainstats("CR CD", "", "hp hp hp")` are the other two the sheet compared him on.
 *
 * Substats are `chem("hp", "heavy")` rather than atk: HP is his real damage stat (it drives
 * the ATK conversion, the fusion bonus and every stack of Fortune in Disguise), and two HP%
 * rolls instead of one is what clears his 50,000 HP ceiling — below it every one of those
 * conversions is still climbing.
 */
export const LOADOUT = [
  JINGRAN, JINGRAN_SIG, MYRIAD_SNARE, LAMP_5PC, LAMP_2PC,
  mainstats("CD CD", "", "hp hp hp"),
  chem("hp", "heavy"),
];

/* ------------------------------------------------------- what his actions do */
/*
 * An action that does something beyond its numbers writes it as its own `apply()`. Those run
 * after his gear in the same priority band, so they can read summed totals such as hp().
 *
 * Qi is forte1, so an action that simply restores it says so with `forte1:` and needs no body
 * at all — the engine already applies an action's resource deltas. Only the casts that do
 * something Qi cannot express on its own carry one: the heavy attack, which spends the gauge
 * and conditionally refunds it, and the liberation, intro and outro, which move other state at
 * the same time. `JINGRAN`'s own apply() clamps the result to the gauge's bounds.
 */

/**
 * Fire of Life adds motion value per 1000 Max HP over 25,000, counting up to 50,000 — and the
 * two forms are worth different amounts, so each heavy passes its own.
 */
const SOUL_RAID_MV_PER_1000 = 21.10;    // 1.48% x2 + 1.90% x3 + 12.44%
const STARDOME_MV_PER_1000  = 21.65;    // 2.17% + 2.17% + 4.33% + 12.98%

/**
 * Heavy attack — Soul Raid / Stardome Meander. Shared by both forms, so it is a plain function
 * two actions point at rather than anything registered; `mvPer1000` is the only thing that
 * differs between them.
 *
 * Spends the whole Qi gauge; while Mingfire is up it summons the Lib FUA follow-up and
 * refunds most of the Qi. The signature weapon pierces defence on it — a tag filter
 * (`action3` / `action4`) in the sheet.
 */
function heavyAttack(mvPer1000) {
  const mingfire = counter(JINGRAN_MINGFIRE);

  if (!spend(JINGRAN_QI, QI_COST)) {
    note(`cast on ${counter(JINGRAN_QI)} Qi — check the rotation`);
    setCounter(JINGRAN_QI, 0);
  }
  // a Wayfarer's Mark to spend
  if (mingfire > MARK_THRESHOLD) {
    setCounter(JINGRAN_QI, Math.min(QI_MAX, counter(JINGRAN_QI) + QI_REFUND));
  }
  if (mingfire > 0) {                                 // the burst window is open
    queue(ACTION_LIB_FUA);
    setCounter(JINGRAN_MINGFIRE, Math.max(0, mingfire - MINGFIRE_PER_HEAVY));

    // The motion-value boost is Mingfire's doing: it costs 25 of it and is only paid inside
    // Yinghuo, so it belongs in here rather than on every heavy he casts. Only Max HP between
    // 25k and 50k counts toward it.
    //
    // The kit adds this straight to the motion value, which is what ADD_MV is: it lands inside
    // the parentheses, in the action's own percent units, so it needs no re-expressing.
    const steps = Math.max(0, Math.floor((Math.min(hp(), 50000) - 25000) / 1000));
    add(mvPer1000 * steps, ADD_MV);
  }
}

/* ----------------------------------------------------------------- actions */

/** Wrapper: source, element and scaling are the same for everything he does. */
function jingranAction(name, def) {
  return new Action(`Jingran: ${name}`, {
    source: "Jingran",
    element: FUSION,
    scaling: "atk",
    ...def,
  });
}

// --- basics and mid-air. Stages 3 and 4 restore Qi. Every damage-dealing action shields,
//     roughly once per hit, per his kit.
const BA1 = jingranAction("BA1", { node: NORMAL, type: BASIC, mv: 39.82, energy: 0.67, concerto: 1.34, offtune: 0.2136, shields: 1 });
const BA2 = jingranAction("BA2", { node: NORMAL, type: BASIC, mv: 99.47, energy: 1.68, concerto: 3.35, offtune: 0.5337, shields: 1 });
const BA3 = jingranAction("BA3", { node: NORMAL, type: HEAVY, mv: 159.1, energy: 2.69, concerto: 5.36, offtune: 0.8537, forte1: 50, shields: 1 });
const BA4 = jingranAction("BA4", { node: NORMAL, type: HEAVY, mv: 124.24, energy: 2.09, concerto: 4.18, offtune: 0.6666, forte1: 50, shields: 1 });
const MA = jingranAction("MA", { node: NORMAL, type: BASIC, mv: 92.45, energy: 1.55, concerto: 3.1, offtune: 0.496, shields: 1 });

// --- enhanced basics
const EBA1 = jingranAction("EBA1", { node: NORMAL, type: BASIC, mv: 44.74, energy: 0.75, concerto: 1.5, offtune: 0.24, shields: 1 });
const EBA2 = jingranAction("EBA2", { node: NORMAL, type: BASIC, mv: 74.56, energy: 1.26, concerto: 2.5, offtune: 0.4, shields: 1 });
const EBA3 = jingranAction("EBA3", { node: NORMAL, type: HEAVY, mv: 109.32, energy: 1.84, concerto: 3.68, offtune: 0.5864, forte1: 50, shields: 1 });
const EBA4 = jingranAction("EBA4", { node: NORMAL, type: HEAVY, mv: 153.16, energy: 2.6, concerto: 5.16, offtune: 0.8218, forte1: 50, shields: 1 });

// --- dodge counters: Nether Dive / Light Watch, 100 Qi each
const DC = jingranAction("DC", { node: NORMAL, type: HEAVY, mv: 198.8, energy: 3.36, concerto: 6.68, offtune: 1.0664, forte1: 100, shields: 1 });
const EDC = jingranAction("EDC", { node: NORMAL, type: HEAVY, mv: 248.57, energy: 4.19, concerto: 8.36, offtune: 1.3337, forte1: 100, shields: 1 });

// --- resonance skill. The "2" casts are the hold-Normal-Attack follow-ups (Netherworld
//     Traverse / Afterlife's Guide), 100 Qi.
const Skill1 = jingranAction("Skill1", {
  node: SKILL, type: SKILL, mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 0.56,
  shields: 1,
});
const ESkill1 = jingranAction("ESkill1", {
  node: SKILL, type: SKILL, mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 0.56,
  shields: 1,
});
const Skill2 = jingranAction("Skill2", {
  node: SKILL, type: HEAVY, mv: 258.47, energy: 3.35, concerto: 5, offtune: 1.0667,
  forte1: 100, shields: 1,
});
const ESkill2 = jingranAction("ESkill2", {
  node: SKILL, type: HEAVY, mv: 263.48, energy: 3.43, concerto: 5, offtune: 1.0936,
  forte1: 100, shields: 1,
});

// --- liberation. It declares its -125 for display, but a liberation contributes nothing to
//     the running energy total: it consumes whatever is banked.
const Lib1 = jingranAction("Lib1", {
  node: LIB, type: HEAVY, mv: 745.2,      // 93.15% x 8
  energy: -125, concerto: 20, offtune: 16.8, forte1: 200,
  shields: 2,
  /** Opens the burst window; its 200 Qi is a plain forte1 delta above. */
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { setCounter(JINGRAN_MINGFIRE, MINGFIRE_ON_LIB); },
});

/** Lib FUA — the Yinghuo follow-up, one per heavy attack. The sheet bundled four of these
 *  into a single 334.04% action, and 334.04 / 4 is exactly this. No `liberation` node: it is
 *  a summon, not the liberation cast, so it must not spend the energy bar. */
export const ACTION_LIB_FUA = new Action("Jingran: Lib FUA", {
  source: "Jingran", element: FUSION, scaling: "atk",
  type: HEAVY,
  mv: 83.51,
});

// --- intro / outro. The engine adopts queued outro buffs on any intro. The outro declares
//     its -100 concerto for display, but contributes nothing to the running total.
const Intro = jingranAction("Intro", {
  node: INTRO, type: INTRO, mv: 198.81,
  energy: 10, concerto: 10, offtune: 0.8, forte1: 100,
  shields: 1,
  /**
   * Spends every Ghost Shroud stack he walked in with, one for one, for Fortune in Disguise.
   * Both are stacking buffs, so it is a straight handover. Its 100 Qi is the forte1 above.
   *
   * UPDATE_BUFFS: the conversion happens on cast while the shield this action grants is only
   * gained on hit — so its own shield must not be in the pile it converts.
   */
  priority: PRIORITY.UPDATE_BUFFS,
  apply() {
    const shroud = stacksOf(JINGRAN_GHOST_SHROUD);
    if (!shroud) return;
    revoke(JINGRAN_GHOST_SHROUD);
    addStack(JINGRAN_FORTUNE, shroud);
  },
});
const Outro = jingranAction("Outro", {
  node: OUTRO, type: OUTRO, mv: 795, concerto: -100,
  /** Switching away closes the burst window and ends Fortune in Disguise, and hands him a
   *  fresh Fixation for the next rotation. */
  priority: PRIORITY.UPDATE_BUFFS,
  apply() {
    setCounter(JINGRAN_MINGFIRE, 0);
    revoke(JINGRAN_FORTUNE);
    grantSelf(JINGRAN_FIXATION);
  },
});

// --- heavy attacks (the sheet's "forte skills"). The unprefixed one is the Yang Font cast,
//     matching BA/EBA: he starts in Yang Font, so FHA is Stardome Meander and EFHA —
//     the Yin Vessel form — is Soul Raid.
const FHA = jingranAction("FHA", {
  node: FORTE, type: HEAVY, mv: 240.38,          // 24.04% + 24.04% + 48.08% + 144.22%
  energy: 8.5, concerto: 13, offtune: 1.04,
  shields: 2, priority: PRIORITY.LATE_CONVERSION, apply: () => heavyAttack(STARDOME_MV_PER_1000), // later lets add the actual buff name
});
const EFHA = jingranAction("EFHA", {
  node: FORTE, type: HEAVY, mv: 234.29,          // 16.40% x2 + 21.09% x3 + 138.22%
  energy: 8.53, concerto: 13, offtune: 1.014,
  shields: 2, priority: PRIORITY.LATE_CONVERSION, apply: () => heavyAttack(SOUL_RAID_MV_PER_1000),
});

/* ------------------------------------------------------------------ chains */
/* Typed as one entry in a rotation, evaluated part by part. Stages 1-2 are basic and 3-4 are
 * heavy, so the parts differ in type — that is fine, the collapsed row reports the whole
 * chain's motion value and the stats of whichever part hit hardest. */

export const BA234 = new Chain("Jingran: BA234",
  [BA2, BA3, BA4]);
export const EBA234 = new Chain("Jingran: EBA234",
  [EBA2, EBA3, EBA4]);

/**
 * His standard opener. The Qi economy works out exactly: intro 100, liberation +200 to a full
 * 300, then each of the four heavy attacks spends 300 and the first three refund 200 while
 * Mingfire is above 25, with the basic stages topping up the difference. Every one of those
 * four heavies summons Lib FUA, which is where the sheet's "Lib FUA * 4" came from.
 */
export const ROTATION = [
  Intro, Lib1, FHA,
  EBA234, EFHA,
  Skill1, Skill2, FHA,
  ESkill1, ESkill2, EFHA,
  ACTION_MYRIAD_SNARE, Outro,
];
