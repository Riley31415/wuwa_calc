/**
 * Iuno — an aero support. She shields herself and the team almost every action (Waxing
 * Ascent), and her intro/outro hand the incoming resonator a big Heavy Attack amplification
 * window (From Gloom to Gleam).
 *
 * Numbers come from the spreadsheet's stat rows for `Iuno`, `Moongazer's Sigil` /
 * `Pulsation Bracer`, `Crown of Valor 3pc`, `Sierra Gale 2pc` and `Lady of the Sea`; the
 * mechanics are verified against her kit on nanoka.cc (character 1410).
 *
 * Shielding is declarative: an action says how many shields it grants through `applications`
 * and the engine seeds that as the SHIELDS stat, which any buff may add to. Watchers — her own
 * Full Moon Domain, Jingran's Ghost Shroud — read the total for that action and act on it, so
 * neither side needs to know the other exists.
 */
import { defineGear, defineBuff, defineAction, defineChain, PRIORITY } from "../registry.js";
import { add, get, counter, grantTeam, addStack, stacksOf } from "../state.js";
import {
  BASE_ATK, BASE_DEF, BASE_HP, BONUS_ATK, CRIT_RATE, AERO_DMG, BASIC_DMG,
  LIB_DMG, HEAVY_AMP, CRIT_DMG, AMP, ER, DEF_IGNORE, FORTE1,
  SHIELDS, SHIELDS_HELD,
} from "../stats.js";

export const IUNO = "Iuno";

/** Her gear, each named for the item rather than the slot it goes in, so another file can
 *  import one without the name meaning "whatever weapon this build happens to run". */
export const IUNO_SIG       = "Moongazer's Sigil";   // signature weapon, R1
export const NEW_STD_GAUNTLET       = "Pulsation Bracer";    // four-star alternative
export const MYA = "Lady of the Sea";     // mainslot echo
export const COV_3PC       = "Crown of Valor 3pc";
export const SIERRA_2PC      = "Sierra Gale 2pc";

/** From Gloom to Gleam: the window her outro hands the incoming resonator. */
export const IUNO_OUTRO = "Iuno: Outro";

/**
 * Full Moon Domain: the field she leaves up, held by the whole team. Its job is to supply
 * Blessing of the Wan Light, so a teammate standing in it accrues Blessing from their own
 * shielding rather than only from Iuno's own casts.
 */
export const IUNO_DOMAIN = "Iuno: Full Moon Domain";

/**
 * Blessing of the Wan Light: a stacking buff, ten stacks at 4% amplification each. It stacks
 * off shielding — the domain above is what makes that true for the team and not just for her.
 */
export const IUNO_BLESSING = "Iuno: Blessing of the Wan Light";
const BLESSING_MAX = 10, BLESSING_PER_STACK = 4;

/**
 * Her second sequence node, which pays a further 40% amplification to anyone already holding a
 * full ten stacks of Blessing. Not part of the kit: every build here is sequence 0, so this is
 * defined but not equipped — add IUNO_S2 to a loadout to price it.
 */
export const IUNO_S2 = "Iuno S2";
export const IUNO_S2_BONUS = "Iuno: Blessing at full stacks (S2)";
const BLESSING_FULL_BONUS = 40;

/** Waxing Ascent: her weapon and sonata scale on shields held, each with its own ceiling. */
const MOONGAZER_SHIELD_CAP = 5, CROWN_SHIELD_CAP = 5;

/**
 * Her real forte gauge (Sentience): basics and the resonance skill fill it, the forte
 * Moonbow/Flux casts spend it — this is what the sheet's `forte1` deltas track.
 */
export const IUNO_SENTIENCE = FORTE1;

/* --------------------------------------------------------------- resonator */

defineGear(IUNO, {
  /** The domain goes up for the whole team at the start, so Blessing accrues wherever the
   *  shielding happens rather than only on her. */
  onFightStart() { grantTeam(IUNO_DOMAIN); },

  apply() {
    add(100, ER);
    add(5, CRIT_RATE);
    add(150, CRIT_DMG);

    add(10525, BASE_HP);
    add(450, BASE_ATK);
    add(1124, BASE_DEF);
    add(8, CRIT_RATE);
    add(12, BONUS_ATK);
  },
});

/* ------------------------------------------------------------------ weapon */

/** Moongazer's Sigil, her signature. Liberation damage gets a flat bonus and, per shield
 *  stack, pierces defence. R1, the rank the sheet's numbers describe. */
defineGear(IUNO_SIG, {
  apply() {
    add(500, BASE_ATK);
    add(36, CRIT_RATE);
    add(12, BONUS_ATK);
    add(20, LIB_DMG);
    add(7.2 * Math.min(MOONGAZER_SHIELD_CAP, counter(SHIELDS_HELD)), DEF_IGNORE);
  },
});

/** Pulsation Bracer, the four-star alternative — the sheet's numbers assume half uptime on
 *  its own conversion stacks, so they are authored flat rather than re-deriving the stack
 *  count here. */
defineGear(NEW_STD_GAUNTLET, {
  apply() {
    add(587.5, BASE_ATK);
    add(24.3, CRIT_RATE);
    add(12, BONUS_ATK);
    add(24, BASIC_DMG);
  },
});

/* -------------------------------------------------------------- echo, sonata */

defineGear(MYA, {
  apply() {
    add(12, LIB_DMG);
    add(12, AERO_DMG);
  },
});

/** The echo's cast. */
export const ACTION_MYA = defineAction("Echo: Lady of the Sea", {
  source: "Echo",
  node: "echo",
  element: "aero",
  scaling: "atk",
  type: "echo",
  mv: 300.96,
  energy: 4.18,
});

defineGear(COV_3PC, {
  apply() {
    const stacks = Math.min(CROWN_SHIELD_CAP, counter(SHIELDS_HELD));
    add(4 * stacks, CRIT_DMG);
    add(6 * stacks, BONUS_ATK);
  },
});

defineGear(SIERRA_2PC, {
  apply() { add(10, AERO_DMG); },
});

/** Her echoes, from the sheet's `iuno r1` build. Aero rather than a generic damage bonus, so
 *  the two 3-cost slots only pay out on her own element — which is all she deals. */
export const IUNO_MAINSTATS = "43311 CD aero aero atk atk";
export const IUNO_SUBSTATS  = "chem atk liberation";

const ECHOES = [IUNO_MAINSTATS, IUNO_SUBSTATS];

export const LOADOUT = [IUNO, IUNO_SIG, MYA, COV_3PC, SIERRA_2PC, ...ECHOES];
export const LOADOUT_F2P = [IUNO, NEW_STD_GAUNTLET, MYA, COV_3PC, SIERRA_2PC, ...ECHOES];

/* ------------------------------------------------------ what her actions do */

/**
 * The domain, held by everyone: a shield watcher. It reads how many shields the action being
 * evaluated granted — the SHIELDS stat, which the action seeds and any buff may have added to
 * — and turns each one into a stack of Blessing.
 *
 * LATE, so every buff that could still add a shield has already contributed by the time it
 * reads the total.
 */
defineBuff(IUNO_DOMAIN, {
  priority: PRIORITY.LATE,
  apply() {
    const shields = get(SHIELDS);
    if (shields) addStack(IUNO_BLESSING, shields, BLESSING_MAX);
  },
});

/**
 * Blessing of the Wan Light: 4% all-damage amplification a stack, ten stacks — amplification
 * rather than a damage bonus, so it multiplies against its own term in the damage formula
 * instead of diluting into the pile her element and type already contribute.
 *
 * Returns the stacks it is actually paying for, per the stacking-buff convention.
 */
defineBuff(IUNO_BLESSING, {
  apply(stacks) {
    const held = Math.min(stacks, BLESSING_MAX);
    add(BLESSING_PER_STACK * held, AMP);
    return held;
  },
});

/**
 * S2. Like the domain it reaches the whole team, because the bonus is owed to whichever
 * resonator holds the stacks rather than to Iuno — and each of them holds their own count.
 */
defineGear(IUNO_S2, {
  onFightStart() { grantTeam(IUNO_S2_BONUS); },
  apply() {},
});

defineBuff(IUNO_S2_BONUS, {
  apply() {
    if (stacksOf(IUNO_BLESSING) >= BLESSING_MAX) add(BLESSING_FULL_BONUS, AMP);
  },
});

/** What the next resonator actually holds. */
defineBuff(IUNO_OUTRO, {
  apply() { add(50, HEAVY_AMP); },
});

/* ----------------------------------------------------------------- actions */

function iunoAction(name, def) {
  return defineAction(`Iuno: ${name}`, {
    source: "Iuno",
    element: "aero",
    scaling: "atk",
    ...def,
  });
}

// --- basics and dodge counter, all shielding
iunoAction("BA1", { node: "normal", type: "basic", mv: 87.68, energy: 1.23, concerto: 1.23, offtune: 0.392, forte1: 4.25, applications: 1 });
iunoAction("BA2", { node: "normal", type: "basic", mv: 139.58, energy: 1.97, concerto: 1.97, offtune: 0.412, forte1: 11.25, applications: 1 });
iunoAction("BA3", { node: "normal", type: "basic", mv: 266.61, energy: 3.73, concerto: 3.73, offtune: 1.1921, forte1: 19.5, applications: 1 });
iunoAction("DC", { node: "normal", type: "basic", mv: 248.73, energy: 2, concerto: 23.97, offtune: 0.6321, applications: 1 });

// --- Moonbow basics (in Lunar Cycle - New Moon), considered liberation damage; also shield
iunoAction("MA1", { node: "normal", type: "liberation", mv: 126.45, energy: 2.33, concerto: 2.65, offtune: 0.424, applications: 1 });
iunoAction("MA2", { node: "normal", type: "liberation", mv: 167.01, energy: 3.25, concerto: 3.5, offtune: 0.5601, applications: 1 });
iunoAction("MDC", { node: "normal", type: "liberation", mv: 310.17, energy: 1.77, concerto: 23.51, offtune: 0.5601, applications: 1 });

// --- resonance skill
iunoAction("Skill", { node: "skill", type: "skill", mv: 261.07, energy: 4.58, concerto: 6, offtune: 0.8086, applications: 1 });
iunoAction("ESkill", { node: "skill", type: "skill", mv: 426.46, energy: 8.15, concerto: 8, offtune: 1.32, forte1: 25, applications: 1 });
iunoAction("MSkill", { node: "skill", type: "liberation", mv: 439.58, energy: 9.36, concerto: 8, offtune: 1.072, applications: 1 });

// --- liberation: shields and grants Blessing
iunoAction("Liberation", {
  node: "liberation", type: "liberation", mv: 1093.46,
  energy: -125, concerto: 20, offtune: 9.6, forte1: 60,
  applications: 1,
});

// --- intro / outro
iunoAction("Intro", {
  node: "intro", type: "intro", mv: 159.09,
  energy: 10, concerto: 10, offtune: 1.04, forte1: 40,
  applications: 1,
});
/** Her outro hands the Heavy Attack amplification window straight to the next intro — no
 *  wrapper buff, just the action declaring what it publishes. */
iunoAction("Outro", {
  node: "outro", type: "outro", mv: 100, concerto: -100,
  outro: IUNO_OUTRO,
});

// --- forte (jump / Flux) casts, all liberation damage while in Lunar Cycle
iunoAction("Jump", { node: "forte", type: "liberation", mv: 250.51, energy: 3.5, concerto: 7, offtune: 0.112 });
iunoAction("FJump", { node: "forte", type: "liberation", mv: 316.72, energy: 4.44, concerto: 8.88, offtune: 1.416 });
iunoAction("FDC", { node: "forte", type: "liberation", mv: 156.4, energy: 0.59, concerto: 29.17, offtune: 0.24 });
iunoAction("FMA1", { node: "forte", type: "liberation", mv: 205.97, energy: 2.33, concerto: 6.65, offtune: 0.424, forte1: -11 });
iunoAction("FMA2", { node: "forte", type: "liberation", mv: 286.29, energy: 3.27, concerto: 9.51, offtune: 0.5601, forte1: -14 });
iunoAction("FMA3", { node: "forte", type: "liberation", mv: 532.82, energy: 6, concerto: 17, offtune: 1.12, forte1: -25 });
iunoAction("FMSkill", { node: "forte", type: "liberation", mv: 638.38, energy: 9.36, concerto: 18, offtune: 1.072, forte1: -25 });
iunoAction("FHA", { node: "forte", type: "liberation", mv: 159.05, energy: 5, offtune: 0.24 });

/* ------------------------------------------------------------------ chains */

export const BA123 = defineChain("Iuno: BA123",
  ["Iuno: BA1", "Iuno: BA2", "Iuno: BA3"]);
export const MA123 = defineChain("Iuno: MA123",
  ["Iuno: MA1", "Iuno: MA2", "Iuno: MDC"]);
export const FMA123 = defineChain("Iuno: FMA123",
  ["Iuno: FMA1", "Iuno: FMA2", "Iuno: FMA3"]);

/** The sheet's `iuno sub` rotation — a sub-DPS opener that leans on the forte Moonbow chain. */
export const ROTATION = [
  "Iuno: Intro", "Iuno: ESkill", "Iuno: Liberation", "Iuno: Jump",
  "Iuno: FMSkill", FMA123, "Iuno: FMSkill", "Iuno: FHA",
  ACTION_MYA, "Iuno: Outro",
];

/** The sheet's `iuno mdps` rotation — the fuller main-DPS line. */
export const ROTATION_MDPS = [
  "Iuno: Skill", "Iuno: Intro", "Iuno: ESkill", "Iuno: Jump", "Iuno: FMSkill",
  "Iuno: Liberation", FMA123, FMA123, "Iuno: MSkill", MA123, "Iuno: FHA",
  ACTION_MYA, "Iuno: Outro",
];
