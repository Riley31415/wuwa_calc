/** Mainslot echoes and sonatas from Rinascita (versions 2.0-2.4). */
import { isType,
  Buff, Sonata, Sonata2pc, Mainslot, EchoType, Stat, Attribute, Type1, Type2, Cast, Scaling,
  addStat, frozenStacks, applyCurrent, applyTeam, casting, currentAction, revokeCurrent, getStat, queue, queueOutro,
  revokeTeam, stacksOfEnemy, currentMember,
} from "../engine/kit.js";
import { Action } from "../engine/rotation.js";
import { applied, appliedByMe } from "../engine/kit.js";
import { AERO_EROSION } from "../shared/status.js";

/* ----------------------------------------------------------------------------- Carlotta, 2.0 */

/** Sentry Construct, Carlotta's own mainslot echo — flat Glacio/Resonance Skill DMG Bonus, no trigger. */
export const ACTION_SENTRY_CONSTRUCT = new Action("Echo - Sentry Construct", {
  cast: Cast.Echo, element: Attribute.Glacio, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.62,
});
export const SENTRY_CONSTRUCT = new Mainslot({
  name: "Sentry Construct",
  action: ACTION_SENTRY_CONSTRUCT,
  echoType: EchoType.TRANSFORM,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Glacio); addStat(Stat.DmgBonus, 12, Type1.Skill); },
});

/** Frosty Resolve, Carlotta's own sonata (also carried by Empyrean Anthem's Overlord-class
 *  echoes). 2pc: +12% Resonance Skill DMG Bonus flat. 5pc: Resonance Skill grants +22.5% Glacio
 *  DMG Bonus for 15s; Resonance Liberation grants +18% Resonance Skill DMG Bonus for 5s, up to
 *  2 stacks. */
export const FROSTY_RESOLVE_2PC = new Sonata2pc({
  name: "Frosty Resolve 2pc",
  constantStats: () => addStat(Stat.DmgBonus, 12, Type1.Skill),
});
export const FROSTY_RESOLVE_GLACIO = new Buff({
  name: "Frosty Resolve 5pc: Glacio",
  applyStats: () => addStat(Stat.DmgBonus, 22.5, Attribute.Glacio),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(FROSTY_RESOLVE_GLACIO); },
});
export const FROSTY_RESOLVE_SKILL_DMG = new Buff({
  name: "Frosty Resolve 5pc: Resonance Skill", maxStacks: 2,
  applyStats: () => addStat(Stat.DmgBonus, 18 * frozenStacks(), Type1.Skill),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(FROSTY_RESOLVE_SKILL_DMG); },
});
export const FROSTY_RESOLVE_5PC = new Sonata({
  name: "Frosty Resolve 5pc",
  sonata2pc: FROSTY_RESOLVE_2PC,
  updateBuffs: () => {
    if (casting(Cast.Skill)) applyCurrent(FROSTY_RESOLVE_GLACIO, 1);
    if (casting(Cast.Liberation)) applyCurrent(FROSTY_RESOLVE_SKILL_DMG, 1);
  },
});

/* ------------------------------------------------------------------------------- Roccia, 2.0 */

/** Nightmare: Impermanence Heron, Roccia's own mainslot echo — flat Havoc/Heavy Attack DMG
 *  Bonus, no trigger. */
export const ACTION_NM_HERON = new Action("Echo - Nightmare: Impermanence Heron", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.6,
});
export const NM_HERON = new Mainslot({
  name: "Nightmare: Impermanence Heron",
  action: ACTION_NM_HERON,
  echoType: EchoType.TRANSFORM,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Havoc); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/* ---------------------------------------------------------------------------- Cantarella, 2.2 */

/** Lorelei, Cantarella's own mainslot echo — flat Havoc/Basic DMG Bonus, no trigger. */
export const ACTION_LORELEI = new Action("Echo - Lorelei", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.62,
});
export const LORELEI = new Mainslot({
  name: "Lorelei",
  action: ACTION_LORELEI,
  echoType: EchoType.TRANSFORM,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Havoc); addStat(Stat.DmgBonus, 12, Type1.Basic); },
});

/** Midnight Veil, Cantarella's own sonata — also reused by Roccia and Phrolova. 2pc: +10% Havoc
 *  DMG Bonus flat. 5pc: her outro also fires a 480% Havoc burst and hands the incoming
 *  resonator +15% Havoc DMG Bonus for 15s. */
export const MIDNIGHT_VEIL_2PC = new Sonata2pc({
  name: "Midnight Veil 2pc",
  constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Havoc),
});
export const ACTION_MIDNIGHT_VEIL_BURST = new Action("Outro - Midnight Veil", {
  element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Outro, mv: 480,
});
export const MIDNIGHT_VEIL_HANDOFF = new Buff({
  name: "Midnight Veil (outro)",
  applyStats: () => addStat(Stat.DmgBonus, 15, Attribute.Havoc),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(MIDNIGHT_VEIL_HANDOFF); },
});
export const MIDNIGHT_VEIL_5PC = new Sonata({
  name: "Midnight Veil 5pc",
  sonata2pc: MIDNIGHT_VEIL_2PC,
  updateBuffs: () => {
    if (casting(Cast.Outro)) { queue(ACTION_MIDNIGHT_VEIL_BURST); queueOutro(MIDNIGHT_VEIL_HANDOFF); }
  },
});

/* ---------------------------------------------------------------------------------- Brant, 2.1 */

// TODO check how many hits for real
/** Dragon of Dirge, Brant's own mainslot echo — flat Fusion/Basic Attack DMG Bonus, no trigger. */
export const ACTION_DRAGON_OF_DIRGE = new Action("Echo - Dragon of Dirge", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 36.81 * 8, energy: 0.51 * 8,
});
export const DRAGON_OF_DIRGE = new Mainslot({
  name: "Dragon of Dirge",
  action: ACTION_DRAGON_OF_DIRGE,
  echoType: EchoType.TRANSFORM,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Fusion); addStat(Stat.DmgBonus, 12, Type1.Basic); },
});

export const TIDEBREAKING_2PC = new Sonata2pc({ name: "Tidebreaking Courage 2pc", constantStats: () => addStat(Stat.Er, 10) });

/** +15% ATK flat, and +30% (unscoped) DMG Bonus once Energy Regen reaches 250% — read via
 *  convertStats() so every ER contribution has already landed this action. */
export const TIDEBREAKING_5PC = new Sonata({
  name: "Tidebreaking Courage 5pc",
  sonata2pc: TIDEBREAKING_2PC,
  constantStats: () => addStat(Stat.BonusAtk, 15),
  convertStats: () => { if (getStat(Stat.Er) >= 250) addStat(Stat.DmgBonus, 30); },
});

/* --------------------------------------------------------------------------------- Phrolova */

/** Nightmare: Hecate, Phrolova's own mainslot echo — flat Havoc/Echo Skill DMG Bonus, no trigger. */
export const ACTION_NM_HECATE = new Action("Echo - Nightmare: Hecate", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 457.17, energy: 3.15,
});
export const NM_HECATE = new Mainslot({
  name: "Nightmare: Hecate",
  action: ACTION_NM_HECATE,
  echoType: EchoType.TRANSFORM,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Havoc); addStat(Stat.DmgBonus, 20, Type1.Echo); },
});

/* ------------------------------------------------------------------------------------ Zhezhi */

/** Nightmare: Lampylumen Myriad, Zhezhi's own mainslot echo — the only glacio Coordinated
 *  Attack character. Flat Glacio/Coordinated Attack DMG Bonus, no trigger. */
export const ACTION_NM_LAMPY = new Action("Echo - Nightmare: Lampylumen Myriad", {
  cast: Cast.Echo, element: Attribute.Glacio, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.6, energy: 3.8,
});
export const NM_LAMPY = new Mainslot({
  name: "Nightmare: Lampylumen Myriad",
  action: ACTION_NM_LAMPY,
  echoType: EchoType.SUMMON,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Glacio); addStat(Stat.DmgBonus, 30, Type2.Coordinated); },
});


export const ACTION_HECATE = new Action("Echo - Hecate", { // TODO unsure on hits
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 	45.59*6, energy: 	0.63*6,
});
export const HECATE = new Mainslot({
  name: "Hecate",
  action: ACTION_HECATE,
  echoType: EchoType.SUMMON,
  constantStats: () => { addStat(Stat.DmgBonus, 40, Type2.Coordinated); },
});

/** Empyrean Anthem, Zhezhi's own sonata. 2pc: +10% ER flat. 5pc: +80% Coordinated Attack DMG
 *  Bonus, self only. A Coordinated Attack crit also grants the whole team +20% ATK for 4s,
 *  assumed permanent uptime once one lands (a real source re-triggers well past 21s). */
export const EMPYREAN_ANTHEM_2PC = new Sonata2pc({ name: "Empyrean Anthem 2pc", constantStats: () => addStat(Stat.Er, 10) });
export const EMPYREAN_ANTHEM_5PC = new Sonata({
  name: "Empyrean Anthem 5pc",
  sonata2pc: EMPYREAN_ANTHEM_2PC,
  constantStats: () => addStat(Stat.DmgBonus, 80, Type2.Coordinated),
  updateBuffs: () => { if (isType(Type2.Coordinated)) applyTeam(EMPYREAN_ANTHEM_TEAM, 1); },
});
export const EMPYREAN_ANTHEM_TEAM = new Buff({
  name: "Empyrean Anthem (team)",
  applyStats: () => { if (currentAction().active) addStat(Stat.BonusAtk, 20); },
});

/* ------------------------------------------------------------------------------- Ciaccona */

/** Nightmare: Kelpie, Ciaccona's own mainslot echo — flat Glacio/Aero DMG Bonus for whoever wears
 *  it. The Echo Skill itself is Glacio; switching the wearer out with an Outro summons Kelpie once
 *  more for the same multiplier as Aero DMG, which is what ACTION_NM_KELPIE_OUTRO below is. */
export const ACTION_NM_KELPIE = new Action("Echo - Nightmare: Kelpie", {
  cast: Cast.Echo, element: Attribute.Glacio, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 2.81,
});
export const ACTION_NM_KELPIE_OUTRO = new Action("Echo - Nightmare: Kelpie (outro)", {
  element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 2.81, active: false,
});
export const NM_KELPIE = new Mainslot({
  name: "Nightmare: Kelpie",
  action: ACTION_NM_KELPIE,
  echoType: EchoType.TRANSFORM,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Glacio); addStat(Stat.DmgBonus, 12, Attribute.Aero); },
  updateBuffs: () => { if (casting(Cast.Outro)) queue(ACTION_NM_KELPIE_OUTRO); },
});

/* ----------------------------------------------------------------------------- Ciaccona, 2.3 */

/** Gusts of Welkin, the Aero Erosion sonata. 2pc: +10% Aero DMG Bonus flat. 5pc: inflicting Aero
 *  Erosion pays the whole team +15% Aero DMG Bonus and the resonator who inflicted it another 15%,
 *  20s — so the team half is lost on the applier's own next Intro and the self half on their own
 *  outro, per the standing duration rules. */
export const GUSTS_OF_WELKIN_TEAM = new Buff({
  name: "Gusts of Welkin (team)",
  applyStats: () => addStat(Stat.DmgBonus, 15, Attribute.Aero),
});
export const GUSTS_OF_WELKIN_SELF = new Buff({
  name: "Gusts of Welkin",
  applyStats: () => addStat(Stat.DmgBonus, 15, Attribute.Aero),
});
export const GUSTS_OF_WELKIN_2PC = new Sonata2pc({ name: "Gusts of Welkin 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Aero) });
export const GUSTS_OF_WELKIN_5PC = new Sonata({
  name: "Gusts of Welkin 5pc",
  sonata2pc: GUSTS_OF_WELKIN_2PC,
  updateBuffs: () => {
    if (appliedByMe(AERO_EROSION)) { applyTeam(GUSTS_OF_WELKIN_TEAM, 1); applyCurrent(GUSTS_OF_WELKIN_SELF, 1); }
  },
});

/* --------------------------------------------------------------------------- Cartethyia, 2.4 */

/** Reminiscence: Fleurdelys, the Windcleaver summon: eight 27.36% Aero hits and one 136.8%. The
 *  main-slot wearer gets +10% Aero DMG Bonus, and another +10% when that wearer is Rover: Aero or
 *  Cartethyia — of the two only Aero Rover exists in this calculator, so his is the only one
 *  checked, and by name: importing his own module here would close the cycle his loadout already
 *  opens by equipping this echo, and the loser of that race is whichever file the loader reaches
 *  second. */
export const ACTION_FLEURDELYS = new Action("Echo - Reminiscence: Fleurdelys", {
  cast: Cast.Echo, element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo,
  mv: 27.36 * 8 + 136.8, energy: 0.38 * 8 + 1.9,
});
export const FLEURDELYS = new Mainslot({
  name: "Reminiscence: Fleurdelys",
  action: ACTION_FLEURDELYS,
  echoType: EchoType.SUMMON,
  constantStats: () => {
    addStat(Stat.DmgBonus, 10, Attribute.Aero);
    if (currentMember().resonator?.name === "Aero Rover") addStat(Stat.DmgBonus, 10, Attribute.Aero);
  },
});

/** Windward Pilgrimage, the other Aero Erosion sonata. 2pc: +10% Aero DMG Bonus flat. 5pc:
 *  hitting a target that already carries Aero Erosion grants +10% Crit. Rate and +30% Aero DMG
 *  Bonus for 10s — a short self window, so lost after the outro. Unlike Gusts of Welkin above the
 *  trigger is the hit, not the inflict: `stacksOfEnemy`, so any hit while the status stands pays,
 *  including on Erosion a teammate put there. */
export const WINDWARD_2PC = new Sonata2pc({ name: "Windward Pilgrimage 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Aero) });
export const WINDWARD_5PC = new Sonata({
  name: "Windward Pilgrimage 5pc",
  sonata2pc: WINDWARD_2PC,
  updateBuffs: () => { if (stacksOfEnemy(AERO_EROSION) > 0) applyCurrent(WINDWARD_BUFF, 1); },
});
export const WINDWARD_BUFF = new Buff({
  name: "Windward Pilgrimage",
  applyStats: () => { addStat(Stat.CritRate, 10); addStat(Stat.DmgBonus, 30, Attribute.Aero); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(WINDWARD_BUFF); },
});
