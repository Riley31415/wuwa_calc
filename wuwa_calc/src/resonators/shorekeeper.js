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
import { defineGear, defineBuff, defineAction, defineChain, PRIORITY } from "../registry.js";
import {
  add, counter, setCounter, action, isOutro,
  grantTeam, grantOthers, revokeTeam, grantSelf, revoke, gain,
} from "../state.js";
import {
  BASE_ATK, BASE_HP, BONUS_HP, BONUS_ATK, CRIT_RATE, CRIT_DMG, ER, AMP,
  CONCERTO, FORTE1,
} from "../stats.js";

export const SHOREKEEPER = "Shorekeeper";
export const SK_OUTRO   = "Shorekeeper: Outro";

/** The realm, in the three colours it shows in game. */
export const SK_BLUE_REALM   = "Shorekeeper: Outer Stellarealm";
export const SK_PURPLE_REALM = "Shorekeeper: Inner Stellarealm";
export const SK_GOLD_REALM   = "Shorekeeper: Supernal Stellarealm";

export const SK_SIG     = "Stellar Symphony";
export const SK_SIG_TEAM   = "Stellar Symphony: Astral Evolvement";
export const VARIATION = "Variation R5";
export const VARIATION_READY    = "Variation: Ceaseless Aria";
export const VARIATION_COOLDOWN = "Variation: Ceaseless Aria (cooldown)";
export const FALLACY      = "Fallacy";
export const FALLACY_TEAM = "Fallacy: team";
export const REJUV_5PC    = "Rejuvenating Glow 5pc";
export const REJUV_2PC    = "Rejuvenating Glow 2pc";
export const REJUV_TEAM   = "Rejuvenating Glow: team";

/** Empirical Data lives in her forte gauge, 0 to 5 segments. */
const DATA_MAX = 5;

/** Inner Stellarealm: 0.01% crit rate per 0.2% ER. Supernal: 0.01% crit damage per 0.1%. */
const CR_PER_ER = 0.01 / 0.2, CR_CAP = 12.5;
const CD_PER_ER = 0.01 / 0.1, CD_CAP = 25;

/**
 * The realm's payout. Her energy regen is taken as a flat 250%, which is what a real build
 * lands on and exactly where both caps bite — 250 × 0.05 = 12.5, 250 × 0.1 = 25 — so this is
 * the same pair of numbers the spreadsheet hardcoded.
 *
 * Reading her live total across the team is possible (`statOf`) but is not worth re-running
 * her whole buff list on every action of everyone else's rotation.
 */
const ASSUMED_ER = 250;
const REALM_CR = Math.min(CR_CAP, ASSUMED_ER * CR_PER_ER);
const REALM_CD = Math.min(CD_CAP, ASSUMED_ER * CD_PER_ER);

export const GAUGES = [{ key: FORTE1, label: "data" }];

/* --------------------------------------------------------------- resonator */

defineGear(SHOREKEEPER, {
  apply() {
    // the innate line every resonator carries
    add(100, ER);
    add(5, CRIT_RATE);
    add(150, CRIT_DMG);

    add(16712.5, BASE_HP);
    add(287.5, BASE_ATK);
    add(12, BONUS_HP);
    add(10, ER);          // Self Gravitation, while the field is inside a Stellarealm

    // Empirical Data holds 0-5 segments, so keep the gauge inside its bounds
    setCounter(FORTE1, Math.max(0, Math.min(DATA_MAX, counter(FORTE1))));

    // Binary Butterfly amplifies the whole team's damage
    grantTeam(SK_OUTRO);
  },
});

defineBuff(SK_OUTRO, {
  apply() { add(15, AMP); },
});

/* ------------------------------------------------------------------- realm */
/*
 * Her liberation puts the blue realm on the team. Each outro after that advances it, because
 * the realm evolves when somebody intros into it and an outro is always followed by an intro:
 *
 *   blue   -> purple  on the next outro. Purple pays crit rate.
 *   purple -> gold    on the outro after. Gold pays crit rate and crit damage.
 *
 * Her enhanced intro (Discernment) ends the realm outright, which is what the kit says:
 * "casting Discernment ends the current Stellarealm".
 *
 * Each colour is granted to every slot, so whoever is on the field is standing in it.
 */

defineBuff(SK_BLUE_REALM, {
  apply() {
    // the outer realm only heals, so it pays no stat — it just waits to evolve
    if (isOutro(action())) {
      revokeTeam(SK_BLUE_REALM);
      grantTeam(SK_PURPLE_REALM);
    }
  },
});

defineBuff(SK_PURPLE_REALM, {
  apply() {
    add(REALM_CR, CRIT_RATE);
    if (isOutro(action())) {
      revokeTeam(SK_PURPLE_REALM);
      grantTeam(SK_GOLD_REALM);
    }
  },
});

defineBuff(SK_GOLD_REALM, {
  apply() {
    add(REALM_CR, CRIT_RATE);
    add(REALM_CD, CRIT_DMG);
  },
});

/* ------------------------------------------------------------------ weapons */

/**
 * Stellar Symphony, her signature: 12% HP to herself, 14% attack to the team, and concerto
 * back on any liberation. R1, the rank the sheet's numbers describe.
 */
defineGear(SK_SIG, {
  apply() {
    add(412.5, BASE_ATK);
    add(77.04, ER);       // the level 90 energy regen substat
    add(12, BONUS_HP);
    grantTeam(SK_SIG_TEAM);
    if (action().node === "liberation") gain(CONCERTO, 8);
  },
});
defineBuff(SK_SIG_TEAM, { apply() { add(14, BONUS_ATK); } });

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
defineGear(VARIATION, {
  onFightStart() { grantSelf(VARIATION_READY); },
  apply() {
    add(337.5, BASE_ATK);
    add(51.84, ER);       // the level 90 energy regen substat
  },
});

defineBuff(VARIATION_READY, {
  apply() {
    if (!/skill/i.test(action().id)) return;
    gain(CONCERTO, 16);          // R5; R1 restores 8
    revoke(VARIATION_READY);
    grantSelf(VARIATION_COOLDOWN);
  },
});

defineBuff(VARIATION_COOLDOWN, {
  apply() {
    if (action().node !== "liberation") return;
    revoke(VARIATION_COOLDOWN);
    grantSelf(VARIATION_READY);
  },
});

/* -------------------------------------------------------------- echo, sonata */

defineGear(FALLACY, {
  apply() {
    add(10, ER);          // the sheet assumes permanent uptime
    grantOthers(FALLACY_TEAM);
  },
});
defineBuff(FALLACY_TEAM, { apply() { add(10, BONUS_ATK); } });

/** The echo's cast. `node: "echo"` marks it as one even though it deals spectro echo damage. */
export const ACTION_FALLACY = defineAction("Echo: Fallacy", {
  source: "Echo",
  node: "echo",
  element: "spectro",
  scaling: "hp",
  type: "echo",
  mv: 15.85,
  energy: 3.04,
});

defineGear(REJUV_5PC, {
  apply() { grantTeam(REJUV_TEAM); },
});
defineBuff(REJUV_TEAM, { apply() { add(15, BONUS_ATK); } });

/** 2pc is a healing bonus, and this calculator ignores healing — so it contributes nothing. */
defineGear(REJUV_2PC, { apply() {} });

/**
 * Her echoes, from the sheet's `sk r1` build. No crit main stat and an ER-heavy substat
 * spread, because she is not here to hit anything: the realm pays the team crit off her energy
 * regen, and HP is what her own numbers scale on.
 */
export const SK_MAINSTATS = "43311 HP ER ER hp hp";
export const SK_SUBSTATS  = "chem ER hp liberation";

const ECHOES = [SK_MAINSTATS, SK_SUBSTATS];

export const LOADOUT = [SHOREKEEPER, SK_SIG, FALLACY, REJUV_5PC, REJUV_2PC, ...ECHOES];
/** The same build on the four-star alternative. */
export const LOADOUT_ALT = [SHOREKEEPER, VARIATION, FALLACY, REJUV_5PC, REJUV_2PC, ...ECHOES];

/* ------------------------------------------------------ what her actions do */

/** Her liberation opens the realm. */
const OPEN_REALM = defineBuff("Shorekeeper: open the Stellarealm", {
  apply() { grantTeam(SK_BLUE_REALM); },
});

/** Discernment ends whichever realm is up, and always crits. */
const DISCERNMENT = defineBuff("Shorekeeper: Discernment", {
  apply() {
    add(100, CRIT_RATE);          // guaranteed critical hit
    revokeTeam(SK_BLUE_REALM);
    revokeTeam(SK_PURPLE_REALM);
    revokeTeam(SK_GOLD_REALM);
  },
});

/* ----------------------------------------------------------------- actions */

function skAction(name, def) {
  return defineAction(`Shorekeeper: ${name}`, {
    source: "Shorekeeper",
    element: "spectro",
    scaling: "atk",
    ...def,
  });
}

// --- basics. Each stage banks Empirical Data in forte1; stage 3 is worth two.
skAction("BA1", { node: "normal", type: "basic", mv: 31.78, energy: 0.5, concerto: 1.6, offtune: 0.2664, forte1: 1 });
skAction("BA2", { node: "normal", type: "basic", mv: 47.72, energy: 0.76, concerto: 2.4, offtune: 0.4, forte1: 1 });
skAction("BA3", { node: "normal", type: "basic", mv: 69.96, energy: 1.12, concerto: 3.56, offtune: 0.599, forte1: 2 });
skAction("BA4", { node: "normal", type: "basic", mv: 72.72, energy: 1.15, concerto: 3.66, offtune: 0.6096, forte1: 1 });
skAction("MA", { node: "normal", type: "basic", mv: 73.96, energy: 1.55, concerto: 5, offtune: 0.496, forte1: 1 });

// --- skill, forte, liberation. The forte casts spend the whole gauge.
skAction("Skill", { node: "skill", type: "skill", mv: 156.55, energy: 10, concerto: 30, offtune: 0.525 });
skAction("FHA", { node: "forte", type: "heavy", mv: 281.3, energy: 4.95, concerto: 11, offtune: 0.636, forte1: -5 });
skAction("FMA", { node: "forte", type: "basic", mv: 260.41, energy: 4, concerto: 11, offtune: 0.496, forte1: -5 });
skAction("Liberation", {
  node: "liberation", type: "liberation", mv: 0, energy: -175, concerto: 28,
  buffs: [OPEN_REALM],
});

// --- intro / outro. EIntro is Discernment: it replaces the intro while a Supernal realm is
//     up, scales off HP, counts as liberation damage, always crits, and ends the realm.
skAction("Intro", {
  node: "intro", type: "skill", mv: 226.5, energy: 10, concerto: 20, offtune: 1.1395,
});
skAction("EIntro", {
  node: "intro", type: "liberation", scaling: "hp", mv: 58.92,
  energy: 10.02, concerto: 20, offtune: 7.3242,
  buffs: [DISCERNMENT],
});
/** `node: "outro"` marks it as one; it deals no damage at all. */
skAction("Outro", { node: "outro", type: "outro", mv: 0, concerto: -100 });

/* ------------------------------------------------------------------ chains */
/* The sheet carried BA12/BA23/BA123/BA234/BA1234 as pre-summed actions. They are exactly the
 * sums of their stages — motion value, energy, concerto, off-tune and data alike — so they are
 * chains here and the totals still match. */

export const BA12 = defineChain("Shorekeeper: BA12",
  ["Shorekeeper: BA1", "Shorekeeper: BA2"]);
export const BA23 = defineChain("Shorekeeper: BA23",
  ["Shorekeeper: BA2", "Shorekeeper: BA3"]);
export const BA123 = defineChain("Shorekeeper: BA123",
  ["Shorekeeper: BA1", "Shorekeeper: BA2", "Shorekeeper: BA3"]);
export const BA234 = defineChain("Shorekeeper: BA234",
  ["Shorekeeper: BA2", "Shorekeeper: BA3", "Shorekeeper: BA4"]);
export const BA1234 = defineChain("Shorekeeper: BA1234",
  ["Shorekeeper: BA1", "Shorekeeper: BA2", "Shorekeeper: BA3", "Shorekeeper: BA4"]);

/** The sheet's `sk opener`, with her intro in front so the on-field window opens. Only the
 *  first rotation of a fight looks like this — see ROTATION below for the one that repeats. */
export const ROTATION_OPENER = [
  "Shorekeeper: Intro",
  BA123, "Shorekeeper: MA", "Shorekeeper: FHA",
  "Shorekeeper: Skill", BA23, BA12, "Shorekeeper: FHA",
  ACTION_FALLACY, "Shorekeeper: Liberation", "Shorekeeper: Outro",
];

/**
 * Her loop, and the default: every rotation after the first opens with Discernment rather than
 * the ordinary intro.
 *
 * That is not a preference, it is what the kit does — Discernment replaces the intro whenever a
 * Supernal realm is up, and by the second rotation one always is: the liberation opens the blue
 * realm and the two outros that follow evolve it blue → purple → gold. It hits far harder than
 * the intro (it scales off her HP, counts as liberation damage and always crits), and it ends
 * the realm, which is what lets the next liberation open a fresh one.
 */
export const ROTATION = [
  "Shorekeeper: EIntro",
  BA123, "Shorekeeper: MA", "Shorekeeper: FHA",
  "Shorekeeper: Skill", BA23, BA12, "Shorekeeper: FHA",
  ACTION_FALLACY, "Shorekeeper: Liberation", "Shorekeeper: Outro",
];
