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
import { defineGear, defineBuff, defineAction, defineChain, PRIORITY } from "../registry.js";
import {
  add, get, hp, spend, counter, setCounter, gainTeam, grantTeam,
  equipped, onField, grantSelf, slotsWith, queue, note,
} from "../state.js";
import {
  BASE_ATK, BASE_HP, BONUS_HP, FLAT_ATK, CRIT_RATE, CRIT_DMG, ER, MV, DEF_IGNORE,
  DMG_BONUS, FUSION_DMG, HEAVY_DMG, COUNT_FUSION, SHIELDS, SHIELDS_HELD,
  FORTE1, FORTE2, FORTE3, FORTE4,
} from "../stats.js";

export const JINGRAN               = "Jingran";
export const JINGRAN_HP_CONVERSION = "Jingran: HP conversion";

/** His gear, each named for the item rather than the slot it goes in, so another file can
 *  import one without the name meaning "whatever weapon this build happens to run". */
export const JINGRAN_SIG = "Thousandfold Deliverance";   // signature weapon
export const MYRIAD_SNARE = "Myriad Snare";               // mainslot echo
export const LAMP_5PC     = "Lamp of Nether Road 5pc";
export const LAMP_2PC     = "Lamp of Nether Road 2pc";

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
 *  Shield       roughly once per action while dealing damage he gains a shield, declared on
 *               the action as `applications`. His weapon and sonata scale on the running
 *               total the engine banks from it, each with its own cap.
 *
 *  Ghost Shroud gained when OTHER resonators apply shields, max 50. His intro consumes all of
 *               it and converts it one for one into Fortune in Disguise.
 */

/** Three gauges left, so the three remaining generic forte counters cover them. */
export const JINGRAN_QI           = FORTE1;   // the gauge the game shows
export const JINGRAN_MINGFIRE     = FORTE2;   // the burst window
export const JINGRAN_FORTUNE      = FORTE3;   // Fortune in Disguise stacks
export const JINGRAN_GHOST_SHROUD = FORTE4;

/** Weapon and sonata cap the shields-held total at these. */
const THOUSANDFOLD_SHIELD_CAP = 6, LAMP_SHIELD_CAP = 4;

const QI_MAX = 300, QI_COST = 300, QI_REFUND = 200;
const MINGFIRE_ON_LIB = 100, MINGFIRE_PER_HEAVY = 25;
/** Above this much Mingfire a heavy still has a Wayfarer's Mark to spend. */
const MARK_THRESHOLD = 25;
const FORTUNE_MAX = 50, SHROUD_MAX = 50;

/** Ghost Shroud per ally shield. Trace the Vestige doubles the base one. */
export const JINGRAN_SHROUD_PER_SHIELD = 2;

/**
 * Ghost Shroud he opens holding. The sheet carried two contributions — 18 from his own uptime
 * ("avg 3/4 rots") and 15 from "1 other sheilder". Only his own 18 is seeded here: a real
 * shielder on the team now supplies the rest mechanically through JINGRAN_GHOST_FEED below.
 */
const OPENING_SHROUD = 18;

/** Only the heavy attack's Wayfarer's Mark refund still needs this; every other Qi change
 *  is a plain `forte1` delta on the action itself. */
const gainQi = (n) => setCounter(JINGRAN_QI, Math.min(QI_MAX, counter(JINGRAN_QI) + n));

/** His HP conversions pay out in whole 1000 HP steps, counting only HP inside a window. */
const per1000 = (value, lo, hi) =>
  Math.max(0, Math.floor((Math.min(value, hi) - lo) / 1000));

/**
 * Ghost Shroud, fed by teammates' shielding. A team-wide buff (granted once, at fight start),
 * so it runs on every resonator's every action. It reads the SHIELDS stat — how many shields
 * *that* action granted, after every buff that could have changed the number — and converts
 * each into Ghost Shroud on whoever is running Jingran. His own shielding is excluded:
 * "gained when OTHER resonators apply shields".
 */
export const JINGRAN_GHOST_FEED = defineBuff("Jingran: ghost shroud from allies", {
  apply() {
    if (equipped(JINGRAN)) return;
    const shields = get(SHIELDS);
    if (!shields) return;
    const n = shields * JINGRAN_SHROUD_PER_SHIELD;
    for (const slot of slotsWith(JINGRAN)) {
      slot.setCounter(JINGRAN_GHOST_SHROUD,
        Math.min(SHROUD_MAX, slot.counter(JINGRAN_GHOST_SHROUD) + n));
    }
  },
});

/** True while the liberation window is open. */
export const inYinghuo = () => counter(JINGRAN_MINGFIRE) > 0;

/** What his three forte gauges are called, for the display. */
export const GAUGES = [
  { key: JINGRAN_QI, label: "qi" },
  { key: JINGRAN_MINGFIRE, label: "mingfire" },
  { key: JINGRAN_FORTUNE, label: "fortune" },
  { key: JINGRAN_GHOST_SHROUD, label: "shroud" },
];

/* --------------------------------------------------------------- resonator */

defineGear(JINGRAN, {
  /** Only gear gets this. He is a fusion resonator, he opens holding Ghost Shroud that his
   *  intro converts, and his HP conversion is a permanent passive attached alongside him
   *  rather than a separate loadout entry. */
  onFightStart() {
    gainTeam(COUNT_FUSION, 1);
    setCounter(JINGRAN_GHOST_SHROUD, OPENING_SHROUD);
    grantSelf(JINGRAN_HP_CONVERSION);
    grantTeam(JINGRAN_GHOST_FEED);
  },

  apply() {
    // Every resonator's innate baseline. Held here rather than in a shared global buff so a
    // resonator's file is the single place its whole stat line is described.
    add(100, ER);
    add(5, CRIT_RATE);
    add(150, CRIT_DMG);   // a total multiplier, not a bonus: a crit deals 150%

    add(13713, BASE_HP);
    add(350, BASE_ATK);
    add(12, BONUS_HP);
    add(8, CRIT_RATE);

    // Qi is forte1, and his actions restore it with plain forte1 deltas, which the engine
    // adds without knowing the gauge has a ceiling. Clamp it here, the same way Shorekeeper
    // keeps Empirical Data inside its own bounds.
    setCounter(JINGRAN_QI, Math.max(0, Math.min(QI_MAX, counter(JINGRAN_QI))));

    // He inflicts no havoc bane, so nothing here contributes defReduce. Resonators that do
    // export it directly from their own file.
    //
    // His kit says "DEF remains 0 at all times" and nothing he does scales off DEF, so the
    // sheet's `flatDef -99999` sentinel is simply omitted. His HP → healing conversion is
    // omitted too: this calculator ignores healing.
  },
});

/**
 * His HP → damage conversions, all in whole 1000 HP steps. LATE, because they read total HP
 * after every other buff has contributed base HP and HP%. Not gear — it is a permanent
 * passive `JINGRAN`'s own onFightStart attaches, not something separately equipped.
 */
defineBuff(JINGRAN_HP_CONVERSION, {
  priority: PRIORITY.LATE,
  apply() {
    if (!onField()) return;                        // on-field only, the sheet's "burst"
    const steps = per1000(hp(), 0, 50000);         // only HP up to 50k counts
    add(36 * steps, FLAT_ATK);                     // 36 ATK per 1000 HP, capped at 1800
    add(1.5 * steps, FUSION_DMG);                  // 1.5% fusion per 1000 HP, capped at 75%
    // Fortune in Disguise: 0.05% fusion per 1000 HP per stack, capped at 2.5% a stack —
    // which is where the 50k HP ceiling comes from.
    add(0.05 * counter(JINGRAN_FORTUNE) * steps, FUSION_DMG);
  },
});

/* ------------------------------------------------------------------ weapon */

defineGear(JINGRAN_SIG, {
  apply() {
    add(413, BASE_ATK);
    add(72.2, BONUS_HP);
    add(12, DMG_BONUS);
    // fusion damage per shield stack, up to six
    add(10 * Math.min(THOUSANDFOLD_SHIELD_CAP, counter(SHIELDS_HELD)), FUSION_DMG);
  },
});

/* -------------------------------------------------------------- echo, sonata */

defineGear(MYRIAD_SNARE, {
  apply() {
    add(12, FUSION_DMG);
    add(12, HEAVY_DMG);
  },
});

/** The echo's cast, paired with the Mainslot buff above. */
export const ACTION_MYRIAD_SNARE = defineAction("Echo: Myriad Snare", {
  source: "Echo",
  node: "echo",
  element: "fusion",
  scaling: "hp",
  type: "echo",
  mv: 17.23,
  energy: 3.8,
});

defineGear(LAMP_5PC, {
  apply() {
    const stacks = Math.min(LAMP_SHIELD_CAP, counter(SHIELDS_HELD));
    add(5 * stacks, CRIT_RATE);
    // only pays out on the fourth stack: nothing below 4, one at or above
    add(15 * Math.max(0, stacks - (LAMP_SHIELD_CAP - 1)), FUSION_DMG);
  },
});

defineGear(LAMP_2PC, {
  apply() { add(10, BONUS_HP); },
});

/** Everything a Jingran build starts the fight holding. JINGRAN's own onFightStart attaches
 *  the HP conversion and the team-wide Ghost Shroud feed. */
/**
 * His echoes, from the sheet's `jingran r1 cd/hp` build — the strongest of the ones running
 * the Lamp 5pc his loadout already has. Both names come out of shared.js's catalogue, so
 * swapping either is one string: `41111 CR hp hp hp hp` and `44111 CR CD hp hp hp` are the
 * other two the sheet compared him on.
 *
 * All five 1-cost slots go to HP, which looks odd on a fusion DPS until you remember his
 * conversion pays 36 attack and 1.5% fusion damage per 1000 HP — HP is his attack stat.
 */
export const JINGRAN_MAINSTATS = "41111 CD hp hp hp hp";
export const JINGRAN_SUBSTATS  = "chem atk heavy";

export const LOADOUT = [
  JINGRAN, JINGRAN_SIG, MYRIAD_SNARE, LAMP_5PC, LAMP_2PC,
  JINGRAN_MAINSTATS, JINGRAN_SUBSTATS,
];

/* ------------------------------------------------------- what his actions do */
/*
 * An action has no hook of its own — whatever it does is a buff it brings along, applied for
 * that action only. These run after his gear in the same priority band, so they can read
 * summed totals such as hp().
 *
 * Qi is forte1, so an action that simply restores it says so with `forte1:` and needs no buff
 * at all — the engine already applies an action's resource deltas. Only the casts that do
 * something Qi cannot express on its own are left below: the heavy attack, which spends the
 * gauge and conditionally refunds it, and the liberation and intro, which move other gauges
 * at the same time. `JINGRAN`'s own apply() clamps the result to the gauge's bounds.
 */

/**
 * Heavy attack — Soul Raid / Stardome Meander.
 *
 * Spends the whole Qi gauge; while Mingfire is up it summons the Lib FUA follow-up and
 * refunds most of the Qi. Its motion value scales with max HP in 1000 HP steps, and the
 * signature weapon pierces defence on it — both were tag filters (`action3` / `action4`) in
 * the sheet.
 */
const HEAVY_ATTACK = defineBuff("Jingran: heavy attack", {
  apply() {
    const mingfire = counter(JINGRAN_MINGFIRE);

    if (!spend(JINGRAN_QI, QI_COST)) {
      note(`cast on ${counter(JINGRAN_QI)} Qi — check the rotation`);
      setCounter(JINGRAN_QI, 0);
    }
    if (mingfire > MARK_THRESHOLD) gainQi(QI_REFUND);   // a Wayfarer's Mark to spend
    if (mingfire > 0) {                                 // the burst window is open
      queue(ACTION_LIB_FUA);
      setCounter(JINGRAN_MINGFIRE, Math.max(0, mingfire - MINGFIRE_PER_HEAVY));
    }

    add(9.003 * per1000(hp(), 25000, 50000), MV);
    if (equipped(JINGRAN_SIG)) add(30, DEF_IGNORE);
  },
});

/** The liberation opens the burst window; its 200 Qi is a plain forte1 delta on the action. */
const LIBERATION = defineBuff("Jingran: liberation", {
  apply() { setCounter(JINGRAN_MINGFIRE, MINGFIRE_ON_LIB); },
});

/** The intro banks the Ghost Shroud he came in holding. Its 100 Qi is on the action too. */
const INTRO = defineBuff("Jingran: intro", {
  apply() {
    // consumes all Ghost Shroud, converting it one for one into Fortune in Disguise
    setCounter(JINGRAN_FORTUNE, Math.min(FORTUNE_MAX, counter(JINGRAN_GHOST_SHROUD)));
    setCounter(JINGRAN_GHOST_SHROUD, 0);
  },
});

/** Switching away ends the burst window and Fortune in Disguise. */
const OUTRO = defineBuff("Jingran: outro", {
  apply() {
    setCounter(JINGRAN_MINGFIRE, 0);
    setCounter(JINGRAN_FORTUNE, 0);
  },
});

/* ----------------------------------------------------------------- actions */

/** Wrapper: source, element and scaling are the same for everything he does. */
function jingranAction(name, def) {
  return defineAction(`Jingran: ${name}`, {
    source: "Jingran",
    element: "fusion",
    scaling: "atk",
    ...def,
  });
}

// --- basics and mid-air. Stages 3 and 4 restore Qi. Every damage-dealing action shields,
//     roughly once per hit, per his kit.
jingranAction("BA1", { node: "normal", type: "basic", mv: 39.82, energy: 0.67, concerto: 1.34, offtune: 0.2136, applications: 1 });
jingranAction("BA2", { node: "normal", type: "basic", mv: 99.47, energy: 1.68, concerto: 3.35, offtune: 0.5337, applications: 1 });
jingranAction("BA3", { node: "normal", type: "heavy", mv: 159.1, energy: 2.69, concerto: 5.36, offtune: 0.8537, forte1: 50, applications: 1 });
jingranAction("BA4", { node: "normal", type: "heavy", mv: 124.24, energy: 2.09, concerto: 4.18, offtune: 0.6666, forte1: 50, applications: 1 });
jingranAction("MA", { node: "normal", type: "basic", mv: 92.45, energy: 1.55, concerto: 3.1, offtune: 0.496, applications: 1 });

// --- enhanced basics
jingranAction("EBA1", { node: "normal", type: "basic", mv: 44.74, energy: 0.75, concerto: 1.5, offtune: 0.24, applications: 1 });
jingranAction("EBA2", { node: "normal", type: "basic", mv: 74.56, energy: 1.26, concerto: 2.5, offtune: 0.4, applications: 1 });
jingranAction("EBA3", { node: "normal", type: "heavy", mv: 109.32, energy: 1.84, concerto: 3.68, offtune: 0.5864, forte1: 50, applications: 1 });
jingranAction("EBA4", { node: "normal", type: "heavy", mv: 153.16, energy: 2.6, concerto: 5.16, offtune: 0.8218, forte1: 50, applications: 1 });

// --- dodge counters: Nether Dive / Light Watch, 100 Qi each
jingranAction("DC", { node: "normal", type: "heavy", mv: 198.8, energy: 3.36, concerto: 6.68, offtune: 1.0664, forte1: 100, applications: 1 });
jingranAction("EDC", { node: "normal", type: "heavy", mv: 248.57, energy: 4.19, concerto: 8.36, offtune: 1.3337, forte1: 100, applications: 1 });

// --- resonance skill. The "2" casts are the hold-Normal-Attack follow-ups (Netherworld
//     Traverse / Afterlife's Guide), 100 Qi.
jingranAction("Skill1", {
  node: "skill", type: "skill", mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 0.56,
  applications: 1,
});
jingranAction("Skill2", {
  node: "skill", type: "heavy", mv: 258.47, energy: 3.35, concerto: 5, offtune: 1.0667,
  forte1: 100, applications: 1,
});
jingranAction("ESkill1", {
  node: "skill", type: "skill", mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 0.56,
  applications: 1,
});
jingranAction("ESkill2", {
  node: "skill", type: "heavy", mv: 263.48, energy: 3.44, concerto: 5, offtune: 1.0937,
  forte1: 100, applications: 1,
});

// --- liberation. It declares its -125 for display, but a liberation contributes nothing to
//     the running energy total: it consumes whatever is banked.
jingranAction("Lib1", {
  node: "liberation", type: "heavy", mv: 496.8,
  energy: -125, concerto: 20, offtune: 16.8, forte1: 200,
  applications: 1, buffs: [LIBERATION],
});

/** Lib FUA — the Yinghuo follow-up, one per heavy attack. The sheet bundled four of these
 *  into a single 334.04% action, and 334.04 / 4 is exactly this. No `liberation` node: it is
 *  a summon, not the liberation cast, so it must not spend the energy bar. */
export const ACTION_LIB_FUA = defineAction("Jingran: Lib FUA", {
  source: "Jingran", element: "fusion", scaling: "atk",
  type: "heavy",
  mv: 83.51,
  applications: 1,
});

// --- intro / outro. The engine adopts queued outro buffs on any intro. The outro declares
//     its -100 concerto for display, but contributes nothing to the running total.
jingranAction("Intro", {
  node: "intro", type: "intro", mv: 198.81,
  energy: 2.5, concerto: 10, offtune: 0.8, forte1: 100,
  applications: 1, buffs: [INTRO],
});
jingranAction("Outro", {
  node: "outro", type: "outro", mv: 795, concerto: -100,
  buffs: [OUTRO],
});

// --- heavy attacks (the sheet's "forte skills"): Soul Raid and Stardome Meander
jingranAction("FSkill", {
  node: "forte", type: "heavy", mv: 307.34,
  energy: 10.53, concerto: 13, offtune: 1.014,
  applications: 1, buffs: [HEAVY_ATTACK],
});
jingranAction("EFSkill", {
  node: "forte", type: "heavy", mv: 315.34,
  energy: 10.5, concerto: 13, offtune: 1.04,
  applications: 1, buffs: [HEAVY_ATTACK],
});

/* ------------------------------------------------------------------ chains */
/* Typed as one entry in a rotation, evaluated part by part. Stages 1-2 are basic and 3-4 are
 * heavy, so the parts differ in type — that is fine, the collapsed row reports the whole
 * chain's motion value and the stats of whichever part hit hardest. */

export const BA1234 = defineChain("Jingran: BA1234",
  ["Jingran: BA1", "Jingran: BA2", "Jingran: BA3", "Jingran: BA4"]);
export const EBA1234 = defineChain("Jingran: EBA1234",
  ["Jingran: EBA1", "Jingran: EBA2", "Jingran: EBA3", "Jingran: EBA4"]);

/**
 * His standard opener. The Qi economy works out exactly: intro 100, liberation +200 to a full
 * 300, then each of the four heavy attacks spends 300 and the first three refund 200 while
 * Mingfire is above 25, with the basic stages topping up the difference. Every one of those
 * four heavies summons Lib FUA, which is where the sheet's "Lib FUA * 4" came from.
 */
export const ROTATION = [
  "Jingran: Intro", "Jingran: Lib1", "Jingran: FSkill",
  "Jingran: Skill1", "Jingran: ESkill2", "Jingran: EFSkill",
  "Jingran: BA2", "Jingran: BA3", "Jingran: BA4", "Jingran: FSkill",
  "Jingran: EBA2", "Jingran: EBA3", "Jingran: EBA4", "Jingran: EFSkill",
  ACTION_MYRIAD_SNARE, "Jingran: Outro",
];
