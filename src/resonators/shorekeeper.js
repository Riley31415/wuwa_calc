/**
 * Shorekeeper — a spectro support. Her damage barely matters; what she is for is the
 * Stellarealm, which gives the team crit rate and then crit damage scaled off her own energy
 * regen, plus a team-wide amplification and two team-wide attack buffs.
 *
 * Numbers come from the spreadsheet's stat rows for `Shorekeeper`, `Stellar Symphony`,
 * `Variation`, `Rejuvenating Glow` and `Fallacy`; the mechanics are verified against her kit
 * on nanoka.cc (character 1505).
 *
 * Her kit gives the realm as a rate, not a constant:
 *   Inner Stellarealm     0.01% crit rate per 0.2% energy regen, capped at 12.5%
 *   Supernal Stellarealm  0.01% crit damage per 0.1% energy regen, capped at 25%
 * A real build runs 250% ER, which is exactly where both caps bite, so she is assumed to sit
 * there and the realm pays its capped 12.5% / 25% — the same numbers the sheet hardcoded.
 */
import { Buff, Gear, Action, Chain, PRIORITY } from "../kit.js";
import {
  add, counter, setCounter, action, isOutro, isLiberation, nextSlot,
  grantTeam, grantOthers, revokeTeam, grantSelf, revoke, gain, slotsWith, stacksOf,
} from "../state.js";
import {
  BASE_ATK, BASE_HP, BONUS_HP, BONUS_ATK, CRIT_RATE, CRIT_DMG, ER, AMP,
  CONCERTO, FORTE1,
  SPECTRO, BASIC, HEAVY, SKILL, LIB, OUTRO, ECHO, INTRO, NORMAL, FORTE,
  SCALE_HP,
} from "../stats.js";
import { mainstats, chem } from "../shared.js";

/* --------------------------------------------------------------- resonator */

export const SHOREKEEPER = new Gear(() => {
  // the innate line every resonator carries
  add(100, ER);
  add(5, CRIT_RATE);
  add(150, CRIT_DMG);

  add(16712.5, BASE_HP);
  add(287.5, BASE_ATK);
  add(12, BONUS_HP);
  add(10, ER);          // Self Gravitation, while the field is inside a Stellarealm
  return "Shorekeeper";
}, null, SPECTRO);

export const SK_OUTRO = new Buff(PRIORITY.BUFF_STATS,
  () => { add(15, AMP); return "Shorekeeper: Outro"; });

/**
 * The realm, as one buff whose stack count *is* the stage:
 *
 *   1  Outer      heals only, pays no stat — it is just waiting to evolve
 *   2  Inner      crit rate
 *   3  Supernal   crit rate and crit damage
 *
 * One buff means one `apply()` per action, so it cannot take two steps on one cast however the
 * engine schedules things — which a chain of three buffs granting each other could, and did.
 */
export const SK_REALM = new Buff(PRIORITY.BUFF_STATS, () => {
  // handing the field back to her ends the realm, and that outro gets nothing from it
  if (isOutro(action()) && nextSlot().hasBuff(SHOREKEEPER)) {
    revokeTeam(SK_REALM);
    return "Shorekeeper: Stellarealm (ended)";
  }

  // The realm evolves when somebody intros into it, and an outro is always followed by an intro
  // — so it steps *before* paying out, and the outro that triggers the step is already standing
  // in the realm it just became.
  if (isOutro(action())) {
    for (const slot of slotsWith(SK_REALM)) {
        slot.addStack(SK_REALM);
    }
  }

  const stage = stacksOf(SK_REALM);
  // The kit gives these as rates off her own Energy Regen — 0.01% crit rate per 0.2% ER,
  // 0.01% crit damage per 0.1% — each with a cap. A real build runs 250% ER, which is exactly
  // where both caps bite, so she is assumed to sit there and the realm simply pays them out.
  if (stage >= 2) add(12.5, CRIT_RATE);
  if (stage >= 3) add(25, CRIT_DMG);
  return `Shorekeeper: ${["Outer", "Inner", "Supernal"][stage - 1] ?? "no"} Stellarealm`;
}, 3);

/* ------------------------------------------------------------------ weapons */

/**
 * Stellar Symphony, her signature: 12% HP to herself, 14% attack to the team, and concerto
 * back on any liberation. R1, the rank the sheet's numbers describe.
 */
export const SK_SIG = new Gear(() => {
  add(412.5, BASE_ATK);
  add(77.04, ER);       // the level 90 energy regen substat
  add(12, BONUS_HP);
  grantTeam(SK_SIG_TEAM);
  if (isLiberation(action())) gain(CONCERTO, 8);
  return "Stellar Symphony";
});
export const SK_SIG_TEAM = new Buff(PRIORITY.BUFF_STATS,
  () => { add(14, BONUS_ATK); return "Stellar Symphony: Astral Evolvement"; });

/**
 * Variation, the four-star alternative.
 *
 * Worth knowing: R5 and R1 are identical for damage. Base attack and the energy regen substat
 * do not scale with rank, and the passive only restores concerto — 8 at R1, 16 at R5. So the
 * rank changes rotation feel, not numbers.
 *
 * Its cooldown is a two-buff state machine rather than a timer. Ready fires on a resonance
 * skill and swaps itself for the cooling half; the cooling half watches for a liberation and
 * swaps back. That stands in for "once every 20s" without the engine needing a clock.
 */
export const VARIATION = new Gear(() => {
  add(337.5, BASE_ATK);
  add(51.84, ER);       // the level 90 energy regen substat
  return "Variation R5";
}, () => { grantSelf(VARIATION_READY); });

export const VARIATION_READY = new Buff(PRIORITY.UPDATE_BUFFS, () => {
  if (action().cast === SKILL) {
    gain(CONCERTO, 16);          // R5; R1 restores 8
    revoke(VARIATION_READY);
    grantSelf(VARIATION_COOLDOWN);
  }
  return "Variation: Ceaseless Aria";
});

export const VARIATION_COOLDOWN = new Buff(PRIORITY.UPDATE_BUFFS, () => {
  if (isLiberation(action())) {
    revoke(VARIATION_COOLDOWN);
    grantSelf(VARIATION_READY);
  }
  return "Variation: Ceaseless Aria (cooldown)";
});

/* -------------------------------------------------------------- echo, sonata */

export const FALLACY = new Gear(() => "Fallacy"); // buffs come from the action. maybe we link the echo action here?
export const FALLACY_TEAM = new Buff(PRIORITY.BUFF_STATS,
  () => { add(10, BONUS_ATK); return "Fallacy"; });

/** The echo's cast. `cast: ECHO` marks it as one even though it deals spectro echo damage. */
export const ACTION_FALLACY = new Action("Echo: Fallacy", {
  source: "Echo",
  cast: ECHO,
  element: SPECTRO,
  scaling: SCALE_HP,
  type: ECHO,
  mv: 15.85,
  energy: 3.04,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() {
    add(10, ER);          // the sheet assumes permanent uptime
    grantOthers(FALLACY_TEAM);
  },
});

export const REJUV_5PC = new Gear(() => { grantTeam(REJUV_TEAM); return "Rejuvenating Glow 5pc"; });
export const REJUV_TEAM = new Buff(PRIORITY.BUFF_STATS,
  () => { add(15, BONUS_ATK); return "Rejuvenating Glow"; });

/** 2pc is a healing bonus, and this calculator ignores healing — so it contributes nothing. */
export const REJUV_2PC = new Gear(() => "Rejuvenating Glow 2pc");

/**
 * Her echoes, from the sheet's `sk r1` build. No crit main stat and an ER-heavy substat
 * spread, because she is not here to hit anything: the realm pays the team crit off her energy
 * regen, and HP is what her own numbers scale on.
 */

export const LOADOUT = [SHOREKEEPER, SK_SIG, FALLACY, REJUV_5PC, REJUV_2PC,
    mainstats("HP", "ER ER", "hp hp"), chem("hp", "liberation", { er: true })];
/** The same build on the four-star alternative. */
export const LOADOUT_ALT = [SHOREKEEPER, VARIATION, FALLACY, REJUV_5PC, REJUV_2PC,
    mainstats("HP", "ER ER", "hp hp"), chem("hp", "liberation", { er: true })];

/* ----------------------------------------------------------------- actions */

function skAction(name, def) {
  return new Action(`Shorekeeper: ${name}`, {
    source: "Shorekeeper",
    element: SPECTRO,
    scaling: "atk",
    ...def,
  });
}

// --- basics. Each stage banks Empirical Data in forte1; stage 3 is worth two.
const BA1 = skAction("Basic 1", { node: NORMAL, cast: BASIC, type: BASIC, mv: 31.78, energy: 0.5, concerto: 1.6, offtune: 0.2664, forte1: 1 });
const BA2 = skAction("Basic 2", { node: NORMAL, cast: BASIC, type: BASIC, mv: 47.72, energy: 0.76, concerto: 2.4, offtune: 0.4, forte1: 1 });
const BA3 = skAction("Basic 3", { node: NORMAL, cast: BASIC, type: BASIC, mv: 69.96, energy: 1.12, concerto: 3.56, offtune: 0.599, forte1: 2 });
const BA4 = skAction("Basic 4", { node: NORMAL, cast: BASIC, type: BASIC, mv: 72.72, energy: 1.15, concerto: 3.66, offtune: 0.6096, forte1: 1 });
const MA = skAction("Plunge", { node: NORMAL, cast: BASIC, type: BASIC, mv: 73.96, energy: 1.55, concerto: 5, offtune: 0.496, forte1: 1 });

// --- skill, forte, liberation. The forte casts spend the whole gauge.
const Skill = skAction("Skill", { node: SKILL, cast: SKILL, type: SKILL, mv: 156.55, energy: 10, concerto: 30, offtune: 0.525 });
const FHA = skAction("Forte Heavy", { node: FORTE, cast: HEAVY, type: HEAVY, mv: 281.3, energy: 4.95, concerto: 11, offtune: 0.636, forte1: -5 });
const FMA = skAction("Forte Plunge", { node: FORTE, cast: BASIC, type: BASIC, mv: 260.41, energy: 4, concerto: 11, offtune: 0.496, forte1: -5 });
const Liberation = skAction("Liberation", {
  node: LIB, cast: LIB, type: LIB, mv: 0, energy: -175, concerto: 20,
  /** It opens the realm, on the blue rung. */
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { grantTeam(SK_REALM); },
});

// --- intro / outro. EIntro is Discernment: it replaces the intro while a Supernal realm is
//     up, scales off HP, counts as liberation damage, and always crits.
const Intro = skAction("Intro", {
  node: INTRO, cast: INTRO, type: SKILL, mv: 226.5, energy: 10, concerto: 20, offtune: 1.1395,
});
const EIntro = skAction("Enhanced Intro", {
  node: INTRO, cast: INTRO, type: LIB, scaling: SCALE_HP, mv: 58.92,
  energy: 10.02, concerto: 20, offtune: 7.3242,
  /** Discernment always crits. The realm is already gone by now — the outro that swapped her
   *  in ended it, so there is nothing here to revoke. */
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { add(100, CRIT_RATE); },
});
/** `cast: OUTRO` marks it as one; it deals no damage at all. Casting it is what puts Binary
 *  Butterfly on the team, so the amplification starts with whoever she hands the field to. */
const Outro = skAction("Outro", {
  cast: OUTRO, type: OUTRO, mv: 0, concerto: -100,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { grantTeam(SK_OUTRO); },
});

/* ------------------------------------------------------------------ chains */
/* The sheet carried BA12/BA23/BA123/BA234/BA1234 as pre-summed actions. They are exactly the
 * sums of their stages — motion value, energy, concerto, off-tune and data alike — so they are
 * chains here and the totals still match. */

export const BA12 = new Chain("Shorekeeper: Basic 12",
  [BA1, BA2]);
export const BA23 = new Chain("Shorekeeper: Basic 23",
  [BA2, BA3]);
export const BA123 = new Chain("Shorekeeper: Basic 123",
  [BA1, BA2, BA3]);
export const BA234 = new Chain("Shorekeeper: Basic 234",
  [BA2, BA3, BA4]);
export const BA1234 = new Chain("Shorekeeper: Basic 1234",
  [BA1, BA2, BA3, BA4]);

/** The sheet's `sk opener`, with her intro in front so the on-field window opens. Only the
 *  first rotation of a fight looks like this — see ROTATION below for the one that repeats. */
export const ROTATION_OPENER = [
  Intro,
  BA123, MA, FHA,
  Skill, BA23, BA12, FHA,
  ACTION_FALLACY, Liberation, Outro,
];

/**
 * Her loop, and the default: the sheet's `sk` rotation, which opens with Discernment rather
 * than the ordinary intro.
 *
 * That is not a preference, it is what the kit does — Discernment replaces the intro whenever a
 * Supernal realm is up, and by the second rotation one always is: the liberation opens the blue
 * realm and the two outros that follow evolve it blue → purple → gold. It hits far harder than
 * the intro (it scales off her HP, counts as liberation damage and always crits), and it ends
 * the realm, which is what lets the next liberation open a fresh one.
 *
 * The loop is shorter than the opener: one basic string and one forte heavy, not two of each.
 * That is what makes it a loop — it generates just over the 100 concerto the outro spends, so
 * she leaves the field with the bar where she found it. The second FHA the opener runs has no
 * Empirical Data left to spend by then anyway.
 *
 * The sheet lists the outro second rather than last, which reads as a rotation that swaps out
 * immediately. It is a spreadsheet artefact: there, order only decides the running totals and
 * the burst window, so the outro sits wherever it was typed. Here the outro closes the on-field
 * window and hands the field to the next resonator, so it has to be last or the rest of her
 * rotation would resolve on somebody else's slot.
 */
export const ROTATION = [
  EIntro,
  BA123, MA, FHA, Skill,
  ACTION_FALLACY, Liberation, Outro,
];
