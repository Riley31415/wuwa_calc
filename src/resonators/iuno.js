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
import { Buff, Gear, Action, Chain, PRIORITY } from "../kit.js";
import {
  add, action, grantTeam, addStack, stacksOf, outro, revoke, isOutro,
} from "../state.js";
import {
  BASE_ATK, BASE_DEF, BASE_HP, BONUS_ATK, CRIT_RATE, DMG_BONUS,
  CRIT_DMG, AMP, ER, DEF_IGNORE, FORTE1,
  AERO, BASIC, HEAVY, SKILL, LIB, INTRO, OUTRO, ECHO, NORMAL, FORTE,
} from "../stats.js";
import { mainstats, chem } from "../shared.js";

/** Derivation: her intro and her liberation hand her five Blessing stacks outright. */
const DERIVATION_STACKS = 5;

/**
 * Blessing of the Wan Light: a stacking buff, ten stacks at 4% amplification each. It stacks
 * off shielding — the domain above is what makes that true for the team and not just for her.
 */
const BLESSING_MAX = 10, BLESSING_PER_STACK = 4;

/**
 * Her second sequence node, which pays a further 40% amplification to anyone already holding a
 * full ten stacks of Blessing. Not part of the kit: every build here is sequence 0, so this is
 * defined but not equipped — add IUNO_S2 to a loadout to price it.
 */
const BLESSING_FULL_BONUS = 40;

/** Her weapon and her sonata each stack on gaining a shield, with their own ceilings. */
const MOONGAZER_MAX = 5, MOONGAZER_DEF_IGNORE = 7.2;
const CROWN_MAX = 5, CROWN_ATK = 6, CROWN_CRIT_DMG = 4;

/**
 * Her real forte gauge (Sentience): basics and the resonance skill fill it, the forte
 * Moonbow/Flux casts spend it — this is what the sheet's `forte1` deltas track.
 */
export const IUNO_SENTIENCE = FORTE1;

/* --------------------------------------------------------------- resonator */

export const IUNO = new Gear("Iuno", () => {
  // Derivation: her intro and liberation grant five Blessing stacks outright, no shield
  // needed. This is on her rather than in the actions because it is an inherent skill.
  const node = action().node;
  if (node === INTRO || node === LIB) {
    addStack(IUNO_BLESSING, DERIVATION_STACKS);
  }

  add(100, ER);
  add(5, CRIT_RATE);
  add(150, CRIT_DMG);

  add(10525, BASE_HP);
  add(450, BASE_ATK);
  add(1124, BASE_DEF);
  add(8, CRIT_RATE);
  add(12, BONUS_ATK);
}, null, AERO);

/* ------------------------------------------------------------------ weapon */

/** Moongazer's Sigil, her signature. Liberation damage gets a flat bonus and, per shield
 *  stack, pierces defence. R1, the rank the sheet's numbers describe. */
export const IUNO_SIG = new Gear("Moongazer's Sigil", () => {
  add(500, BASE_ATK);
  add(36, CRIT_RATE);
  add(12, BONUS_ATK);
  add(20, LIB, DMG_BONUS);
  // A shield stacks it one for one; her intro takes it straight to the ceiling.
  const a = action();
  if (a.node === INTRO) addStack(MOONGAZER_STACKS, MOONGAZER_MAX);
  else if (a.shields) addStack(MOONGAZER_STACKS, a.shields);
});

export const MOONGAZER_STACKS = new Buff("Moongazer's Sigil: Plenilune Radiance", PRIORITY.BUFF_STATS, () => {
  const held = stacksOf(MOONGAZER_STACKS);
  // "Obtaining Shield allows **Resonance Liberation DMG** to ignore DEF" — scoped, so only a
  // cast that deals liberation damage resolves it. Most of what she does in Lunar Cycle
  // counts as liberation damage; her intro, outro and echo cast do not.
  add(MOONGAZER_DEF_IGNORE * held, LIB, DEF_IGNORE);
  return held;
}, MOONGAZER_MAX);

/** Pulsation Bracer, the four-star alternative — the sheet's numbers assume half uptime on
 *  its own conversion stacks, so they are authored flat rather than re-deriving the stack
 *  count here. */
export const NEW_STD_GAUNTLET = new Gear("Pulsation Bracer", () => {
  add(587.5, BASE_ATK);
  add(24.3, CRIT_RATE);
  add(12, BONUS_ATK);
  add(24, BASIC, DMG_BONUS);
});

/* -------------------------------------------------------------- echo, sonata */

export const MYA = new Gear("Lady of the Sea", () => {
  add(12, LIB, DMG_BONUS);
  add(12, AERO, DMG_BONUS);
});

/** The echo's cast. */
export const ACTION_MYA = new Action("Echo: Lady of the Sea", {
  source: "Echo",
  node: ECHO,
  element: AERO,
  scaling: "atk",
  type: ECHO,
  mv: 300.96,
  energy: 4.18,
});

export const COV_3PC = new Gear("Crown of Valor 3pc", () => {
  const { shields } = action();
  if (shields) addStack(CROWN_STACKS, shields);
});

export const CROWN_STACKS = new Buff("Crown of Valor", PRIORITY.BUFF_STATS, () => {
  const held = stacksOf(CROWN_STACKS);
  add(CROWN_ATK * held, BONUS_ATK);
  add(CROWN_CRIT_DMG * held, CRIT_DMG);
  return held;
}, CROWN_MAX);

export const SIERRA_2PC = new Gear("Sierra Gale 2pc", () => { add(10, AERO, DMG_BONUS); });

/** Her echoes, from the sheet's `iuno r1` build. Aero rather than a generic damage bonus, so
 *  the two 3-cost slots only pay out on her own element — which is all she deals. */

export const LOADOUT = [IUNO, IUNO_SIG, MYA, COV_3PC, SIERRA_2PC,
    mainstats("CD", "aero aero", "atk atk"), chem("atk", "liberation")];
export const LOADOUT_F2P = [IUNO, NEW_STD_GAUNTLET, MYA, COV_3PC, SIERRA_2PC,
    mainstats("CD", "aero aero", "atk atk"), chem("atk", "liberation")];

/* ------------------------------------------------------ what her actions do */

/**
 * The domain, held by everyone once `Iuno: FHA` conjures it: a shield watcher. It reads how
 * many shields the action being evaluated grants and turns each into a stack of Blessing, for
 * whoever is acting — so a teammate standing in it accrues Blessing off their own shielding.
 */
/**
 * Full Moon Domain: the field Heavy Attack - Absolute Fullness leaves at her feet. `FHA` below
 * is that cast, and it grants this to the whole team, so from then on a teammate standing in it
 * accrues Blessing from their own shielding rather than only from Iuno's casts.
 *
 * The domain has a real duration in game; here it simply stays up once conjured, which is the
 * uptime a rotation that casts it every cycle actually gets.
 */
export const IUNO_DOMAIN = new Buff("Iuno: Full Moon Domain", PRIORITY.UPDATE_BUFFS, () => {
  const shields = action().shields;
  if (shields) addStack(IUNO_BLESSING, shields);
});

/**
 * Blessing of the Wan Light: 4% all-damage amplification a stack, ten stacks — amplification
 * rather than a damage bonus, so it multiplies against its own term in the damage formula
 * instead of diluting into the pile her element and type already contribute.
 *
 * Returns the stacks it is actually paying for, per the stacking-buff convention.
 */
export const IUNO_BLESSING = new Buff("Iuno: Blessing of the Wan Light", PRIORITY.BUFF_STATS, () => {
  // "ends early if the receiving Resonator is switched off the field" — the outro is that
  // switch, so it takes itself off and the cast doing the switching carries none of it.
  // Held here rather than in the domain: it ends on the swap whether a domain is up or not.
  if (isOutro(action())) return void revoke(IUNO_BLESSING);

  const held = stacksOf(IUNO_BLESSING);
  add(BLESSING_PER_STACK * held, AMP);
  return held;
}, BLESSING_MAX);

/** From Gloom to Gleam: the window her outro hands the incoming resonator, and what that
 *  resonator actually holds. */
export const IUNO_OUTRO = new Buff("Iuno: Outro", PRIORITY.BUFF_STATS, () => { add(50, HEAVY, AMP); });


/* ----------------------------------------------------------------- actions */

function iunoAction(name, def) {
  return new Action(`Iuno: ${name}`, {
    source: "Iuno",
    element: AERO,
    scaling: "atk",
    ...def,
  });
}

// --- basics and dodge counter, all shielding
const BA1 = iunoAction("BA1", { node: NORMAL, type: BASIC, mv: 87.68, energy: 1.23, concerto: 1.23, offtune: 0.392, forte1: 4.25, shields: 1 });
const BA2 = iunoAction("BA2", { node: NORMAL, type: BASIC, mv: 139.58, energy: 1.97, concerto: 1.97, offtune: 0.412, forte1: 11.25, shields: 1 });
const BA3 = iunoAction("BA3", { node: NORMAL, type: BASIC, mv: 266.61, energy: 3.73, concerto: 3.73, offtune: 1.1921, forte1: 19.5, shields: 1 });
const DC = iunoAction("DC", { node: NORMAL, type: BASIC, mv: 248.73, energy: 2, concerto: 23.97, offtune: 0.6321, shields: 1 });

// --- Moonbow basics (in Lunar Cycle - New Moon), considered liberation damage; also shield
const MA1 = iunoAction("MA1", { node: NORMAL, type: LIB, mv: 126.45, energy: 2.33, concerto: 2.65, offtune: 0.424, shields: 1 });
const MA2 = iunoAction("MA2", { node: NORMAL, type: LIB, mv: 167.01, energy: 3.25, concerto: 3.5, offtune: 0.5601, shields: 1 });
const MDC = iunoAction("MDC", { node: NORMAL, type: LIB, mv: 310.17, energy: 1.77, concerto: 23.51, offtune: 0.5601, shields: 1 });

// --- resonance skill
const Skill = iunoAction("Skill", { node: SKILL, type: SKILL, mv: 261.07, energy: 4.58, concerto: 6, offtune: 0.8086, shields: 1 });
const ESkill = iunoAction("ESkill", { node: SKILL, type: SKILL, mv: 426.46, energy: 8.15, concerto: 8, offtune: 1.32, forte1: 25, shields: 1 });
const MSkill = iunoAction("MSkill", { node: SKILL, type: LIB, mv: 439.58, energy: 9.36, concerto: 8, offtune: 1.072, shields: 1 });

// --- liberation: shields and grants Blessing
const Liberation = iunoAction("Liberation", {
  node: LIB, type: LIB, mv: 1093.46,
  energy: -125, concerto: 20, offtune: 9.6, forte1: 60,
  shields: 1,
});

// --- intro / outro
const Intro = iunoAction("Intro", {
  node: INTRO, type: INTRO, mv: 159.09,
  energy: 10, concerto: 10, offtune: 1.04, forte1: 40,
  shields: 1,
});
/** Her outro hands the Heavy Attack amplification window straight to the next intro. */
const Outro = iunoAction("Outro", {
  node: OUTRO, type: OUTRO, mv: 100, concerto: -100,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { outro(IUNO_OUTRO); },
});

// --- forte (jump / Flux) casts, all liberation damage while in Lunar Cycle. Every one of
//     these is a Moonbow basic, a Flux heavy or a dodge counter, so Waxing Ascent shields on
//     each of them exactly as it does on the ordinary ones above.
const Jump = iunoAction("Jump", { node: FORTE, type: LIB, mv: 250.51, energy: 3.5, concerto: 7, offtune: 0.112, shields: 1 });
const FJump = iunoAction("FJump", { node: FORTE, type: LIB, mv: 316.72, energy: 4.44, concerto: 8.88, offtune: 1.416, shields: 1 });
const FDC = iunoAction("FDC", { node: FORTE, type: LIB, mv: 156.4, energy: 0.59, concerto: 29.17, offtune: 0.24, shields: 1 });
const FMA1 = iunoAction("FMA1", { node: FORTE, type: LIB, mv: 205.97, energy: 2.33, concerto: 6.65, offtune: 0.424, forte1: -11, shields: 1 });
const FMA2 = iunoAction("FMA2", { node: FORTE, type: LIB, mv: 286.29, energy: 3.27, concerto: 9.51, offtune: 0.5601, forte1: -14, shields: 1 });
const FMA3 = iunoAction("FMA3", { node: FORTE, type: LIB, mv: 532.82, energy: 6, concerto: 17, offtune: 1.12, forte1: -25, shields: 1 });
const FMSkill = iunoAction("FMSkill", { node: FORTE, type: LIB, mv: 638.38, energy: 9.36, concerto: 18, offtune: 1.072, forte1: -25, shields: 1 });

/** Heavy Attack - Absolute Fullness. Ends Lunar Cycle and conjures the Full Moon domain, which
 *  is what makes everyone else's shielding pay Blessing for the rest of the fight. */
const FHA = iunoAction("FHA", {
  node: FORTE, type: LIB, mv: 159.05, energy: 5, offtune: 0.24, shields: 1,
  /** Conjures the domain, for everyone. `grantTeam` is idempotent, so recasting it each
   *  rotation neither stacks it nor writes another log line. */
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { grantTeam(IUNO_DOMAIN); },
});

/* ------------------------------------------------------------------ chains */

export const BA123 = new Chain("Iuno: BA123",
  [BA1, BA2, BA3]);
export const MA123 = new Chain("Iuno: MA123",
  [MA1, MA2, MDC]);
export const FMA123 = new Chain("Iuno: FMA123",
  [FMA1, FMA2, FMA3]);

/** The sheet's `iuno sub` rotation — a sub-DPS opener that leans on the forte Moonbow chain. */
export const ROTATION = [
  Intro, ESkill, Liberation, Jump,
  FMSkill, FMA123, FMSkill, FHA,
  ACTION_MYA, Outro,
];

/** The sheet's `iuno mdps` rotation — the fuller main-DPS line. */
export const ROTATION_MDPS = [
  Skill, Intro, ESkill, Jump, FMSkill,
  Liberation, FMA123, FMA123, MSkill, MA123, FHA,
  ACTION_MYA, Outro,
];
