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
  add, action, addStack, stacksOf, outro, revoke, isOutro, grantTeam,
} from "../state.js";
import {
  BASE_ATK, BASE_DEF, BASE_HP, BONUS_ATK, CRIT_RATE, DMG_BONUS,
  CRIT_DMG, AMP, ER, DEF_IGNORE, FORTE1,
  AERO, BASIC, HEAVY, SKILL, LIB, INTRO, OUTRO, ECHO, NORMAL, FORTE,
} from "../stats.js";
import { mainstats, chem } from "../shared.js";

/* --------------------------------------------------------------- resonator */

export const IUNO = new Gear(() => {
  // Derivation: her intro and liberation grant five Blessing stacks outright, no shield needed.
  // On her rather than in the actions because it is an inherent skill.
  const cast = action().cast;
  if (cast === INTRO || cast === LIB) addStack(IUNO_BLESSING, 5);

  add(100, ER);
  add(5, CRIT_RATE);
  add(150, CRIT_DMG);

  add(10525, BASE_HP);
  add(450, BASE_ATK);
  add(1124, BASE_DEF);
  add(8, CRIT_RATE);
  add(12, BONUS_ATK);
  return "Iuno";
}, null, AERO);

/* ------------------------------------------------------------------ weapon */

/** Moongazer's Sigil, her signature. Liberation damage gets a flat bonus and, per shield
 *  stack, pierces defence. R1, the rank the sheet's numbers describe. */
export const IUNO_SIG = new Gear(() => {
  add(500, BASE_ATK);
  add(36, CRIT_RATE);
  add(12, BONUS_ATK);
  add(20, LIB, DMG_BONUS);
  // A shield stacks it one for one; her intro takes it straight to the ceiling.
  const a = action();
  if (a.cast === INTRO) addStack(MOONGAZER_STACKS, 5);   // straight to the ceiling
  else if (a.shields) addStack(MOONGAZER_STACKS, a.shields);
  return "Moongazer's Sigil";
});

export const MOONGAZER_STACKS = new Buff(PRIORITY.BUFF_STATS, () => {
  const held = stacksOf(MOONGAZER_STACKS);
  // "Obtaining Shield allows **Resonance Liberation DMG** to ignore DEF" — scoped, so only a
  // cast that deals liberation damage resolves it. Most of what she does in Lunar Cycle
  // counts as liberation damage; her intro, outro and echo cast do not.
  add(7.2 * held, LIB, DEF_IGNORE);
  return `Moongazer's Sigil: Plenilune Radiance x${held}`;
}, 5);

/** Pulsation Bracer, the four-star alternative — the sheet's numbers assume half uptime on
 *  its own conversion stacks, so they are authored flat rather than re-deriving the stack
 *  count here. */
export const NEW_STD_GAUNTLET = new Gear(() => {
  add(587.5, BASE_ATK);
  add(24.3, CRIT_RATE);
  add(12, BONUS_ATK);
  add(24, BASIC, DMG_BONUS);
  return "Pulsation Bracer";
});

/* -------------------------------------------------------------- echo, sonata */

export const MYA = new Gear(() => {
  add(12, LIB, DMG_BONUS);
  add(12, AERO, DMG_BONUS);
  return "Lady of the Sea";
});

/** The echo's cast. */
export const ACTION_MYA = new Action("Echo: Lady of the Sea", {
  source: "Echo",
  cast: ECHO,
  element: AERO,
  scaling: "atk",
  type: ECHO,
  mv: 300.96,
  energy: 4.18
});

export const COV_3PC = new Gear(() => {
  const { shields } = action();
  if (shields) addStack(CROWN_STACKS, shields);
  return "Crown of Valor 3pc";
});

export const CROWN_STACKS = new Buff(PRIORITY.BUFF_STATS, () => {
  const held = stacksOf(CROWN_STACKS);
  add(6 * held, BONUS_ATK);
  add(4 * held, CRIT_DMG);
  return `Crown of Valor x${held}`;
}, 5);

export const SIERRA_2PC = new Gear(() => { add(10, AERO, DMG_BONUS); return "Sierra Gale 2pc"; });

/** Her echoes, from the sheet's `iuno r1` build. Aero rather than a generic damage bonus, so
 *  the two 3-cost slots only pay out on her own element — which is all she deals. */

export const LOADOUT = [IUNO, IUNO_SIG, MYA, COV_3PC, SIERRA_2PC,
    mainstats("CD", "aero aero", "atk atk"), chem("atk", "liberation")];
export const LOADOUT_F2P = [IUNO, NEW_STD_GAUNTLET, MYA, COV_3PC, SIERRA_2PC,
    mainstats("CD", "aero aero", "atk atk"), chem("atk", "liberation")];

/* ------------------------------------------------------ what her actions do */

/**
 * Full Moon Domain: the field Heavy Attack - Absolute Fullness leaves at her feet. `FHA` below is
 * that cast, and this is what it leaves behind — a team-scoped shield response, so from then on
 * a teammate standing in it accrues Blessing from *their own* shielding rather than only from
 * Iuno's casts. The stacks land on whoever was shielded (`e.slot`), not on Iuno.
 *
 * Granted to the whole team, so whoever is acting reads their own shielding off the action.
 * `grantTeam` is idempotent, so re-casting it every rotation neither doubles it nor logs again.
 *
 * The domain has a real duration in game; here it simply stays up once conjured, which is the
 * uptime a rotation that casts it every cycle actually gets.
 */
export const IUNO_DOMAIN = new Buff(PRIORITY.UPDATE_BUFFS, () => {
  const shields = action().shields;
  if (shields) addStack(IUNO_BLESSING, shields);
  return "Iuno: Full Moon Domain";
});

/**
 * Blessing of the Wan Light: 4% all-damage amplification a stack, ten stacks — amplification
 * rather than a damage bonus, so it multiplies against its own term in the damage formula
 * instead of diluting into the pile her element and type already contribute.
 *
 * Returns the stacks it is actually paying for, per the stacking-buff convention.
 */
export const IUNO_BLESSING = new Buff(PRIORITY.BUFF_STATS, () => {
  // "ends early if the receiving Resonator is switched off the field" — the outro is that
  // switch, so it takes itself off and the cast doing the switching carries none of it.
  // Held here rather than in the domain: it ends on the swap whether a domain is up or not.
  if (isOutro(action())) {
    revoke(IUNO_BLESSING);
    return "Iuno: Blessing of the Wan Light x0";
  }

  const held = stacksOf(IUNO_BLESSING);
  add(4 * held, AMP);
  return `Iuno: Blessing of the Wan Light x${held}`;
}, 10);

/** From Gloom to Gleam: the window her outro hands the incoming resonator, and what that
 *  resonator actually holds. */
export const IUNO_OUTRO = new Buff(PRIORITY.BUFF_STATS,
  () => { add(50, HEAVY, AMP); return "Iuno: Outro"; });


/* ----------------------------------------------------------------- actions */

function iunoAction(name, def) {
  return new Action(`Iuno: ${name}`, {
    source: "Iuno",
    element: AERO,
    scaling: "atk",
    ...def
  });
}

// --- basics and dodge counter, all shielding
const BA1 = iunoAction("Moonring Basic 1", { node: NORMAL, cast: BASIC, shields: 1, type: BASIC, mv: 87.68, energy: 1.23, concerto: 1.23, offtune: 0.392, forte1: 4.25 });
const BA2 = iunoAction("Moonring Basic 2", { node: NORMAL, cast: BASIC, shields: 1, type: BASIC, mv: 139.58, energy: 1.97, concerto: 1.97, offtune: 0.412, forte1: 11.25 });
const BA3 = iunoAction("Moonring Basic 3", { node: NORMAL, cast: BASIC, shields: 1, type: BASIC, mv: 266.61, energy: 3.73, concerto: 3.73, offtune: 1.1921, forte1: 19.5 });
const DC = iunoAction("Moonring Dodge Counter", { node: NORMAL, cast: BASIC, shields: 1, type: BASIC, mv: 248.73, energy: 2, concerto: 23.97, offtune: 0.6321 });

// --- Moonbow basics (in Lunar Cycle - New Moon), considered liberation damage; also shield
const MA1 = iunoAction("Moonbow Basic 1", { node: NORMAL, cast: BASIC, shields: 1, type: LIB, mv: 126.45, energy: 2.33, concerto: 2.65, offtune: 0.424 });
const MA2 = iunoAction("Moonbow Basic 2", { node: NORMAL, cast: BASIC, shields: 1, type: LIB, mv: 167.01, energy: 3.25, concerto: 3.5, offtune: 0.5601 });
const MA3 = iunoAction("Moonbow Basic 3", { node: NORMAL, cast: BASIC, shields: 1, type: LIB, mv: 334.02, energy: 6, concerto: 7, offtune: 1.1200 });
const MDC = iunoAction("Moonbow Dodge Counter", { node: NORMAL, cast: BASIC, shields: 1, type: LIB, mv: 310.17, energy: 1.77, concerto: 23.51, offtune: 0.5601 });

// --- resonance skill
const Skill = iunoAction("Skill", { node: SKILL, cast: SKILL, shields: 1, type: SKILL, mv: 261.07, energy: 4.58, concerto: 6, offtune: 0.8086 });
const ESkill = iunoAction("Moonring Skill", { node: SKILL, cast: SKILL, shields: 1, type: SKILL, mv: 426.46, energy: 8.15, concerto: 8, offtune: 1.32, forte1: 25 });
const MSkill = iunoAction("Moonbow Skill", { node: SKILL, cast: SKILL, shields: 1, type: LIB, mv: 439.58, energy: 9.36, concerto: 8, offtune: 1.072 });

// --- liberation: shields and grants Blessing
const Liberation = iunoAction("Liberation", {
  node: LIB, cast: LIB, shields: 1, type: LIB, mv: 1093.46,
  energy: -125, concerto: 20, offtune: 9.6, forte1: 60
});

// --- intro / outro
const Intro = iunoAction("Intro", {
  node: INTRO, cast: INTRO, shields: 1, type: INTRO, mv: 159.09,
  energy: 10, concerto: 10, offtune: 1.04, forte1: 40
});
/** Her outro hands the Heavy Attack amplification window straight to the next intro. */
const Outro = iunoAction("Outro", {
  cast: OUTRO, type: OUTRO, mv: 100, concerto: -100,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { outro(IUNO_OUTRO); }
});

// --- forte (jump / Flux) casts, all liberation damage while in Lunar Cycle. Every one of
//     these is a Moonbow basic, a Flux heavy or a dodge counter, so Waxing Ascent shields on
//     each of them exactly as it does on the ordinary ones above.
const Jump = iunoAction("Forte Moonbow Jump", { node: FORTE, cast: HEAVY, shields: 1, type: LIB, mv: 250.51, energy: 3.5, concerto: 7, offtune: 0.112 });
const FJump = iunoAction("Forte Moonring Jump", { node: FORTE, cast: HEAVY, shields: 1, type: LIB, mv: 316.72, energy: 4.44, concerto: 8.88, offtune: 1.416 });
const FDC = iunoAction("Forte Moonbow Dodge Counter", { node: FORTE, cast: BASIC, shields: 1, type: LIB, mv: 156.4, energy: 0.59, concerto: 29.17, offtune: 0.24 });
const FMA1 = iunoAction("Forte Moonbow Basic 1", { node: FORTE, cast: BASIC, shields: 1, type: LIB, mv: 205.97, energy: 2.33, concerto: 6.65, offtune: 0.424, forte1: -11 });
const FMA2 = iunoAction("Forte Moonbow Basic 2", { node: FORTE, cast: BASIC, shields: 1, type: LIB, mv: 286.29, energy: 3.27, concerto: 9.51, offtune: 0.5601, forte1: -14 });
const FMA3 = iunoAction("Forte Moonbow Basic 3", { node: FORTE, cast: BASIC, shields: 1, type: LIB, mv: 532.82, energy: 6, concerto: 17, offtune: 1.12, forte1: -25 });
const FMSkill = iunoAction("Forte Moonbow Skill", { node: FORTE, cast: SKILL, shields: 1, type: LIB, mv: 638.38, energy: 9.36, concerto: 18, offtune: 1.072, forte1: -25 });

/** Heavy Attack - Absolute Fullness. Ends Lunar Cycle and conjures the Full Moon domain, which
 *  is what makes everyone else's shielding pay Blessing for the rest of the fight. */
const FHA = iunoAction("Forte Heavy", {
  node: FORTE, cast: HEAVY, shields: 1, type: LIB, mv: 159.05, energy: 5, offtune: 0.24,
  /** Conjures the domain. Idempotent, so recasting it each rotation neither doubles it nor
   *  writes another log line. */
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { grantTeam(IUNO_DOMAIN); },
});

/* ------------------------------------------------------------------ chains */

export const MA123 = new Chain("Iuno: Moonbow Basic 123",
  [MA1, MA2, MA3, MDC]);
export const FMA123 = new Chain("Iuno: Forte Moonbow Basic 123",
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
