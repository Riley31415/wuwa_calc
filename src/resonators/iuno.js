/**
 * Iuno — an aero support. She shields herself and the team almost every action (Waxing
 * Ascent), and her intro/outro hand the incoming resonator a big Heavy Attack amplification
 * window (From Gloom to Gleam).
 *
 * Numbers come from the spreadsheet's stat rows for `Iuno`, `Moongazer's Sigil` /
 * `Pulsation Bracer`, `Crown of Valor 3pc`, `Sierra Gale 2pc` and `Lady of the Sea`; the
 * mechanics are verified against her kit on nanoka.cc (character 1410).
 *
 * Shielding is declarative: an action says how many shields it grants through its own `shields`
 * field, and any buff that cares reads it back off the action. Watchers — her own Full Moon
 * Domain, Jingran's Trace the Vestige — act on that number, so neither side needs to know the
 * other exists.
 */
import { defineGear, defineBuff, defineAction, defineChain, PRIORITY } from "../registry.js";
import {
  add, action, grantTeam, addStack, stacksOf, outro, revoke, isOutro,
} from "../state.js";
import {
  BASE_ATK, BASE_DEF, BASE_HP, BONUS_ATK, CRIT_RATE, DMG_BONUS,
  CRIT_DMG, AMP, ER, DEF_IGNORE, FORTE1,
  AERO, BASIC, HEAVY, SKILL, LIB, INTRO, OUTRO, ECHO, NORMAL, FORTE,
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
 * Full Moon Domain: the field Heavy Attack - Absolute Fullness leaves at her feet. `Iuno: FHA`
 * is that cast, and it grants this to the whole team, so from then on a teammate standing in it
 * accrues Blessing from their own shielding rather than only from Iuno's casts.
 *
 * The domain has a real duration in game; here it simply stays up once conjured, which is the
 * uptime a rotation that casts it every cycle actually gets.
 */
export const IUNO_DOMAIN = "Iuno: Full Moon Domain";

/** Derivation: her intro and her liberation hand her five Blessing stacks outright. */
const DERIVATION_STACKS = 5;

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
const BLESSING_FULL_BONUS = 40;

/** Her weapon and her sonata each stack on gaining a shield, with their own ceilings. */
export const MOONGAZER_STACKS = "Moongazer's Sigil: Plenilune Radiance";
export const CROWN_STACKS     = "Crown of Valor";
const MOONGAZER_MAX = 5, MOONGAZER_DEF_IGNORE = 7.2;
const CROWN_MAX = 5, CROWN_ATK = 6, CROWN_CRIT_DMG = 4;

/**
 * Her real forte gauge (Sentience): basics and the resonance skill fill it, the forte
 * Moonbow/Flux casts spend it — this is what the sheet's `forte1` deltas track.
 */
export const IUNO_SENTIENCE = FORTE1;

/* --------------------------------------------------------------- resonator */

defineGear(IUNO, {
  apply() {
    // Derivation: her intro and liberation grant five Blessing stacks outright, no shield
    // needed. This is on her rather than in the actions because it is an inherent skill.
    const node = action().node;
    if (node === INTRO || node === LIB) {
      addStack(IUNO_BLESSING, DERIVATION_STACKS, BLESSING_MAX);
    }

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
    add(20, LIB, DMG_BONUS);
    // A shield stacks it one for one; her intro takes it straight to the ceiling.
    const a = action();
    if (a.node === INTRO) addStack(MOONGAZER_STACKS, MOONGAZER_MAX, MOONGAZER_MAX);
    else if (a.shields) addStack(MOONGAZER_STACKS, a.shields, MOONGAZER_MAX);
  },
});

defineBuff(MOONGAZER_STACKS, {
  priority: PRIORITY.BUFF_STATS,
  apply() {
    const held = Math.min(stacksOf(MOONGAZER_STACKS), MOONGAZER_MAX);
    // "Obtaining Shield allows **Resonance Liberation DMG** to ignore DEF" — scoped, so only a
    // cast that deals liberation damage resolves it. Most of what she does in Lunar Cycle
    // counts as liberation damage; her intro, outro and echo cast do not.
    add(MOONGAZER_DEF_IGNORE * held, LIB, DEF_IGNORE);
    return held;
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
    add(24, BASIC, DMG_BONUS);
  },
});

/* -------------------------------------------------------------- echo, sonata */

defineGear(MYA, {
  apply() {
    add(12, LIB, DMG_BONUS);
    add(12, AERO, DMG_BONUS);
  },
});

/** The echo's cast. */
export const ACTION_MYA = defineAction("Echo: Lady of the Sea", {
  source: "Echo",
  node: ECHO,
  element: AERO,
  scaling: "atk",
  type: ECHO,
  mv: 300.96,
  energy: 4.18,
});

defineGear(COV_3PC, {
  apply() {
    const { shields } = action();
    if (shields) addStack(CROWN_STACKS, shields, CROWN_MAX);
  },
});

defineBuff(CROWN_STACKS, {
  priority: PRIORITY.BUFF_STATS,
  apply() {
    const held = Math.min(stacksOf(CROWN_STACKS), CROWN_MAX);
    add(CROWN_ATK * held, BONUS_ATK);
    add(CROWN_CRIT_DMG * held, CRIT_DMG);
    return held;
  },
});

defineGear(SIERRA_2PC, {
  apply() { add(10, AERO, DMG_BONUS); },
});

/** Her echoes, from the sheet's `iuno r1` build. Aero rather than a generic damage bonus, so
 *  the two 3-cost slots only pay out on her own element — which is all she deals. */

export const LOADOUT = [IUNO, IUNO_SIG, MYA, COV_3PC, SIERRA_2PC, 
    "43311 CD aero aero atk atk", "Chem Substats: atk liberation"];
export const LOADOUT_F2P = [IUNO, NEW_STD_GAUNTLET, MYA, COV_3PC, SIERRA_2PC, 
    "43311 CD aero aero atk atk", "Chem Substats: atk liberation"];

/* ------------------------------------------------------ what her actions do */

/**
 * The domain, held by everyone once `Iuno: FHA` conjures it: a shield watcher. It reads how
 * many shields the action being evaluated grants and turns each into a stack of Blessing, for
 * whoever is acting — so a teammate standing in it accrues Blessing off their own shielding.
 */
defineBuff(IUNO_DOMAIN, {
  // It stacks Blessing, so it runs at UPDATE_BUFFS — ahead of Blessing's own BUFF_STATS payout.
  // The pass re-reads the buff list at each stage, so a stack this creates from nothing still
  // pays out on the same cast; nothing needs pre-seeding.
  priority: PRIORITY.UPDATE_BUFFS,
  apply() {
    const shields = action().shields;
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
  priority: PRIORITY.BUFF_STATS,
  /** Reads the stack count **live** rather than the count the pass was built with, so stacks
   *  granted earlier in this same action — Derivation's five, on cast — already count. */
  apply() {
    // "ends early if the receiving Resonator is switched off the field" — the outro is that
    // switch, so it takes itself off and the cast doing the switching carries none of it.
    // Held here rather than in the domain: it ends on the swap whether a domain is up or not.
    if (isOutro(action())) return void revoke(IUNO_BLESSING);

    const held = Math.min(stacksOf(IUNO_BLESSING), BLESSING_MAX);
    add(BLESSING_PER_STACK * held, AMP);
    return held;
  },
});

/** What the next resonator actually holds. */
defineBuff(IUNO_OUTRO, {
  priority: PRIORITY.BUFF_STATS,
  apply() { add(50, HEAVY, AMP); },
});


/* ----------------------------------------------------------------- actions */

function iunoAction(name, def) {
  return defineAction(`Iuno: ${name}`, {
    source: "Iuno",
    element: AERO,
    scaling: "atk",
    ...def,
  });
}

// --- basics and dodge counter, all shielding
iunoAction("BA1", { node: NORMAL, type: BASIC, mv: 87.68, energy: 1.23, concerto: 1.23, offtune: 0.392, forte1: 4.25, shields: 1 });
iunoAction("BA2", { node: NORMAL, type: BASIC, mv: 139.58, energy: 1.97, concerto: 1.97, offtune: 0.412, forte1: 11.25, shields: 1 });
iunoAction("BA3", { node: NORMAL, type: BASIC, mv: 266.61, energy: 3.73, concerto: 3.73, offtune: 1.1921, forte1: 19.5, shields: 1 });
iunoAction("DC", { node: NORMAL, type: BASIC, mv: 248.73, energy: 2, concerto: 23.97, offtune: 0.6321, shields: 1 });

// --- Moonbow basics (in Lunar Cycle - New Moon), considered liberation damage; also shield
iunoAction("MA1", { node: NORMAL, type: LIB, mv: 126.45, energy: 2.33, concerto: 2.65, offtune: 0.424, shields: 1 });
iunoAction("MA2", { node: NORMAL, type: LIB, mv: 167.01, energy: 3.25, concerto: 3.5, offtune: 0.5601, shields: 1 });
iunoAction("MDC", { node: NORMAL, type: LIB, mv: 310.17, energy: 1.77, concerto: 23.51, offtune: 0.5601, shields: 1 });

// --- resonance skill
iunoAction("Skill", { node: SKILL, type: SKILL, mv: 261.07, energy: 4.58, concerto: 6, offtune: 0.8086, shields: 1 });
iunoAction("ESkill", { node: SKILL, type: SKILL, mv: 426.46, energy: 8.15, concerto: 8, offtune: 1.32, forte1: 25, shields: 1 });
iunoAction("MSkill", { node: SKILL, type: LIB, mv: 439.58, energy: 9.36, concerto: 8, offtune: 1.072, shields: 1 });

// --- liberation: shields and grants Blessing
iunoAction("Liberation", {
  node: LIB, type: LIB, mv: 1093.46,
  energy: -125, concerto: 20, offtune: 9.6, forte1: 60,
  shields: 1,
});

// --- intro / outro
iunoAction("Intro", {
  node: INTRO, type: INTRO, mv: 159.09,
  energy: 10, concerto: 10, offtune: 1.04, forte1: 40,
  shields: 1,
});
/** Her outro hands the Heavy Attack amplification window straight to the next intro. */
iunoAction("Outro", {
  node: OUTRO, type: OUTRO, mv: 100, concerto: -100,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { outro(IUNO_OUTRO); },
});

// --- forte (jump / Flux) casts, all liberation damage while in Lunar Cycle. Every one of
//     these is a Moonbow basic, a Flux heavy or a dodge counter, so Waxing Ascent shields on
//     each of them exactly as it does on the ordinary ones above.
iunoAction("Jump", { node: FORTE, type: LIB, mv: 250.51, energy: 3.5, concerto: 7, offtune: 0.112, shields: 1 });
iunoAction("FJump", { node: FORTE, type: LIB, mv: 316.72, energy: 4.44, concerto: 8.88, offtune: 1.416, shields: 1 });
iunoAction("FDC", { node: FORTE, type: LIB, mv: 156.4, energy: 0.59, concerto: 29.17, offtune: 0.24, shields: 1 });
iunoAction("FMA1", { node: FORTE, type: LIB, mv: 205.97, energy: 2.33, concerto: 6.65, offtune: 0.424, forte1: -11, shields: 1 });
iunoAction("FMA2", { node: FORTE, type: LIB, mv: 286.29, energy: 3.27, concerto: 9.51, offtune: 0.5601, forte1: -14, shields: 1 });
iunoAction("FMA3", { node: FORTE, type: LIB, mv: 532.82, energy: 6, concerto: 17, offtune: 1.12, forte1: -25, shields: 1 });
iunoAction("FMSkill", { node: FORTE, type: LIB, mv: 638.38, energy: 9.36, concerto: 18, offtune: 1.072, forte1: -25, shields: 1 });

/** Heavy Attack - Absolute Fullness. Ends Lunar Cycle and conjures the Full Moon domain, which
 *  is what makes everyone else's shielding pay Blessing for the rest of the fight. */
iunoAction("FHA", {
  node: FORTE, type: LIB, mv: 159.05, energy: 5, offtune: 0.24, shields: 1,
  /** Conjures the domain, for everyone. `grantTeam` is idempotent, so recasting it each
   *  rotation neither stacks it nor writes another log line. */
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { grantTeam(IUNO_DOMAIN); },
});

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
