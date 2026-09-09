/**
 * Mainslot echoes and sonatas from Jinzhou (versions 1.0-1.4). Grouped by region rather than
 * version — generic/reused sets are filed here by their own earliest real release. A mainslot echo
 * is two things: an Action (`cast: Cast.Echo`) plus a piece held by whoever equips it — whatever
 * the cast itself does lives on that Action, while a flat equip passive is the Mainslot's `stats`.
 */
import { Stat, Attribute, Type1, Cast, Scaling } from "../engine/stats.js";
import { Buff, Sonata, Sonata2pc, Mainslot, EchoType } from "../engine/gear.js";
import {
  addStat, frozenStacks, casting, applyCurrent, applyTeam, stacksOfTeam, revokeTeam, removeStackTeam, queueOutro, queue,
  triggeredAction, isActive, onCast, onType, onApplied,
} from "../engine/context.js";
import { Action, ActionField } from "../engine/rotation.js";
import { coordinatedBuff, handoff, lostOnSwap } from "../shared/helpers.js";
import { HEALS, SHIELD } from "../shared/status.js";

/* -------------------------------------------------------------------------- generic, unowned */

/** Bell-Borne Geochelone, a 5-cost mainslot echo. No equip passive — its own cast grants the
 *  team 2 stacks of Bell-Borne Shield (only the +10% DMG Bonus half is modelled). A stack is
 *  lost on any teammate's outro. */
export const ACTION_BELL_BORNE = new Action("Echo - Bell-Borne Geochelone", {
  cast: Cast.Echo, element: Attribute.Glacio, scaling: Scaling.Def, type: Type1.Echo, mv: 145.92, energy: 4.55,
  updateBuffs: () => applyTeam(BELL_BORNE_SHIELD, 2),
});

export const BELL_BORNE_GEOCHELONE = new Mainslot({
  name: "Bell-Borne Geochelone",
  action: ACTION_BELL_BORNE,
  echoType: EchoType.SUMMON,
});

export const BELL_BORNE_SHIELD: Buff = new Buff({
  name: "Bell-Borne Geochelone: Bell-Borne Shield", maxStacks: 2,
  // no "xN" suffix — the DMG Bonus is flat regardless of charge count
  display: () => BELL_BORNE_SHIELD.name,
  stats: [[Stat.DmgBonus, 10]],
  updateBuffs: () => { if (casting(Cast.Outro)) removeStackTeam(BELL_BORNE_SHIELD, 1); },
});

/** Impermanence Heron, a generic mainslot echo. No equip passive — its own cast primes an Outro
 *  handoff: the incoming resonator gets +12% (unscoped) DMG Bonus for 15s — long enough to outlast
 *  their own visit, so it runs to the end of the next handoff (shared/helpers.ts). */
export const ACTION_HERON = new Action("Echo - Impermanence Heron", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 310.56, energy: 14.85, // TODO check 10 er on hit
  updateBuffs: () => queueOutro(HERON_HANDOFF),
});

export const HERON = new Mainslot({
  name: "Impermanence Heron",
  action: ACTION_HERON,
  echoType: EchoType.TRANSFORM,
});

export const HERON_HANDOFF = handoff("Impermanence Heron: Outro", () => addStat(Stat.DmgBonus, 12));

/** Stonewall Bracer, a generic Elite Class mainslot echo (Huanglong). No equip passive — its own
 *  cast is a transformation: a 112.64% Physical charge into a 168.96% Physical smash, taken as the
 *  one cast the rotation presses, and a shield worth 10% of the wearer's own Max HP for 7s. Both
 *  hits bank Energy and neither banks Concerto or Off-Tune — nanoka's own rows (echo 390077021),
 *  which is what a Physical echo looks like: no element to resonate with.
 *
 *  The shield is why it is worth wearing over Impermanence Heron on a Moonlit Clouds support: it is
 *  the SHIELD marker every "on gaining a shield" passive in the roster reads (statuses.ts), so a
 *  teammate's kit pays out for it. The shield's own damage absorption is not modelled — nothing in
 *  this calculator takes damage. */
export const ACTION_STONEWALL_BRACER = new Action("Echo - Stonewall Bracer", {
  cast: Cast.Echo, element: Attribute.Physical, scaling: Scaling.Atk, type: Type1.Echo,
  mv: 281.60, energy: 4.40,
  updateDebuffs: () => applyCurrent(SHIELD, 1),
});

export const STONEWALL_BRACER = new Mainslot({
  name: "Stonewall Bracer",
  action: ACTION_STONEWALL_BRACER,
  echoType: EchoType.TRANSFORM,
});

/** Moonlit Clouds, a generic sonata. 2pc: +10% ER flat. 5pc: on Outro, the incoming resonator
 *  gets +22.5% ATK for 15s — same handoff shape as Heron, but unconditional. */
export const MOONLIT_CLOUDS_2PC = new Sonata2pc({ name: "Moonlit Clouds 2pc", stats: [[Stat.Er, 10]] });

export const MOONLIT_CLOUDS_5PC = new Sonata({
  name: "Moonlit Clouds 5pc",
  sonata2pc: MOONLIT_CLOUDS_2PC,
  grants: [{ on: onCast(Cast.Outro), buff: () => MOONLIT_CLOUDS_HANDOFF, to: "next" }],
});

export const MOONLIT_CLOUDS_HANDOFF = handoff("Moonlit Clouds", () => addStat(Stat.BonusAtk, 22.5));

export const REJUV_2PC = new Sonata2pc({ name: "Rejuvenating Glow 2pc", stats: [[Stat.HealingBonus, 10]] });
/** Rejuvenating Glow, a generic sonata. 5pc: on healing an ally, +15% ATK flat, team-wide,
 *  permanent uptime once triggered. 2pc: +10% Healing Bonus flat, tracked for completeness only. */
export const REJUV_5PC = new Sonata({
  name: "Rejuvenating Glow 5pc",
  sonata2pc: REJUV_2PC,
  grants: [{ on: onApplied(HEALS), buff: () => REJUV_TEAM, to: "team" }],
});
export const REJUV_TEAM = new Buff({ name: "Rejuvenating Glow", stats: [[Stat.BonusAtk, 15]] });

/* ------------------------------------------------------------------------------- Changli, 1.1 */

/** Molten Rift, Changli's own sonata — also reused by Encore's Inferno Rider mainslot below.
 *  2pc: +10% Fusion DMG Bonus flat. 5pc: +30% Fusion DMG Bonus for 15s after Resonance Skill. */
export const MOLTEN_RIFT_2PC = new Sonata2pc({ name: "Molten Rift 2pc", stats: [[Stat.DmgBonus, 10, Attribute.Fusion]] });
export const MOLTEN_RIFT_5PC = new Sonata({
  name: "Molten Rift 5pc",
  sonata2pc: MOLTEN_RIFT_2PC,
  grants: [{ on: onCast(Cast.Skill), buff: () => MOLTEN_RIFT_BUFF }],
});
export const MOLTEN_RIFT_BUFF = new Buff({
  name: "Molten Rift",
  stats: [[Stat.DmgBonus, 30, Attribute.Fusion]], until: "outro",
});

/** Nightmare: Inferno Rider, Changli's own mainslot echo — her Skill DMG is Fusion. Flat
 *  Fusion/Skill DMG Bonus for whoever wears it, no trigger. */
export const ACTION_NM_INFERNO_RIDER = new Action("Echo - Nightmare: Inferno Rider", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.62,
});
export const NM_INFERNO_RIDER = new Mainslot({
  name: "Nightmare: Inferno Rider",
  action: ACTION_NM_INFERNO_RIDER,
  echoType: EchoType.TRANSFORM,
  stats: [[Stat.DmgBonus, 12, Attribute.Fusion], [Stat.DmgBonus, 12, Type1.Skill]],
});

/* -------------------------------------------------------------------------------- Encore, 1.0 */

/** Inferno Rider (plain, not "Nightmare:") — Encore's own mainslot echo. No permanent passive:
 *  casting it grants a temporary +12%/+12% Fusion/Basic Attack DMG Bonus window. */
export const ACTION_INFERNO_RIDER = new Action("Echo - Inferno Rider", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 252.4 + 282.8 * 2, energy: 3.78 + 4.41 * 2,
  updateBuffs: () => applyCurrent(INFERNO_RIDER_WINDOW, 1),
});
export const INFERNO_RIDER_WINDOW = new Buff({
  name: "Inferno Rider",
  stats: [[Stat.DmgBonus, 12, Attribute.Fusion], [Stat.DmgBonus, 12, Type1.Basic]], until: "outro",
});
export const INFERNO_RIDER = new Mainslot({
  name: "Inferno Rider",
  action: ACTION_INFERNO_RIDER,
  echoType: EchoType.TRANSFORM,
});

/* ------------------------------------------------------------------ Camellya 1.4 / Rover 1.0 */

// TODO implement dreamless
/** Nightmare: Crownless, the shared Havoc mainslot echo for Camellya and Havoc Rover. Flat
 *  Havoc/Basic Attack DMG Bonus, no trigger. */
// TODO 20% dmg bonus to echo on consecutive hits
export const ACTION_NM_CROWNLESS = new Action("Echo - Nightmare: Crownless", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 264.6, energy: 3.67,
});
export const NM_CROWNLESS = new Mainslot({
  name: "Nightmare: Crownless",
  action: ACTION_NM_CROWNLESS,
  echoType: EchoType.TRANSFORM,
  stats: [[Stat.DmgBonus, 12, Attribute.Havoc], [Stat.DmgBonus, 12, Type1.Basic]],
});

export const ACTION_CROWNLESS = new Action("Echo - Nightmare: Crownless", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 134.08*2, energy: 	2.09*2,
  updateBuffs: () => applyCurrent(CROWNLESS_WINDOW, 1),
});
export const CROWNLESS_WINDOW = new Buff({
  name: "Crownless",
  stats: [[Stat.DmgBonus, 12, Attribute.Havoc], [Stat.DmgBonus, 12, Type1.Skill]], until: "outro",
});
export const CROWNLESS = new Mainslot({
  name: "Crownless",
  action: ACTION_CROWNLESS,
  echoType: EchoType.TRANSFORM,
});

/** Havoc Eclipse, the matching sonata. 2pc: +10% Havoc DMG Bonus flat. 5pc: +7.5% Havoc DMG
 *  Bonus after Basic/Heavy Attack, up to 4 stacks, 15s each. */
export const HAVOC_ECLIPSE_2PC = new Sonata2pc({ name: "Havoc Eclipse 2pc", stats: [[Stat.DmgBonus, 10, Attribute.Havoc]] });
export const HAVOC_ECLIPSE_5PC = new Sonata({
  name: "Havoc Eclipse 5pc",
  sonata2pc: HAVOC_ECLIPSE_2PC,
  grants: [{ on: onType(Type1.Basic, Type1.Heavy), buff: () => HAVOC_ECLIPSE_STACKS }],
});
export const HAVOC_ECLIPSE_STACKS = new Buff({
  name: "Havoc Eclipse", maxStacks: 4,
  stats: [[Stat.DmgBonus, 7.5, Attribute.Havoc]], perStack: true, until: "outro",
});

/* --------------------------------------------------------- old Jinzhou sonatas, none in a build */

/** Lampylumen Myriad (plain, not "Nightmare:") — an old Jinzhou-era mainslot echo. No equip
 *  passive — its cast's 3 hits grant a stacking +4% Glacio / +4% Resonance Skill DMG Bonus for
 *  15s, up to 3 stacks. Not owned by any resonator implemented yet — exported standalone. */
export const ACTION_LAMPYLUMEN_MYRIAD = new Action("Echo - Lampylumen Myriad", {
  cast: Cast.Echo, element: Attribute.Glacio, scaling: Scaling.Atk, type: Type1.Echo, mv: 667.20, energy: 3.12 * 2 + 4.17, // 200.16%+200.16%+266.88%
  updateBuffs: () => applyCurrent(LAMPYLUMEN_MYRIAD_STACKS, 3),
});
export const LAMPYLUMEN_MYRIAD_STACKS = new Buff({
  name: "Lampylumen Myriad", maxStacks: 3,
  stats: [[Stat.DmgBonus, 4, Attribute.Glacio], [Stat.DmgBonus, 4, Type1.Skill]], perStack: true, until: "outro",
});
export const LAMPYLUMEN_MYRIAD = new Mainslot({
  name: "Lampylumen Myriad",
  action: ACTION_LAMPYLUMEN_MYRIAD,
  echoType: EchoType.TRANSFORM,
});

/** Freezing Frost, Lampylumen Myriad's own matching sonata. 2pc: +10% Glacio DMG Bonus flat.
 *  5pc: +10% Glacio DMG Bonus after Basic/Heavy Attack, up to 3 stacks, 15s each. */
export const FREEZING_FROST_2PC = new Sonata2pc({ name: "Freezing Frost 2pc", stats: [[Stat.DmgBonus, 10, Attribute.Glacio]] });
export const FREEZING_FROST_5PC = new Sonata({
  name: "Freezing Frost 5pc",
  sonata2pc: FREEZING_FROST_2PC,
  grants: [{ on: onType(Type1.Basic, Type1.Heavy), buff: () => FREEZING_FROST_STACKS }],
});
export const FREEZING_FROST_STACKS = new Buff({
  name: "Freezing Frost", maxStacks: 3,
  stats: [[Stat.DmgBonus, 10, Attribute.Glacio]], perStack: true, until: "outro",
});

/** Nightmare: Feilian Beringal — Sierra Gale's own real matching mainslot echo (Iuno just
 *  happens to reuse it). Flat Aero/Heavy Attack DMG Bonus, no trigger. */
export const ACTION_NM_FEILIAN_BERINGAL = new Action("Echo - Nightmare: Feilian Beringal", {
  cast: Cast.Echo, element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.56, energy: 2.28 + 0.3 * 5, // 164.16%+21.88%x5
});
export const NM_FEILIAN_BERINGAL = new Mainslot({
  name: "Nightmare: Feilian Beringal",
  action: ACTION_NM_FEILIAN_BERINGAL,
  echoType: EchoType.SUMMON,
  stats: [[Stat.DmgBonus, 12, Attribute.Aero], [Stat.DmgBonus, 12, Type1.Heavy]],
});

/** Sierra Gale, the matching sonata. 2pc: +10% Aero DMG Bonus flat. 5pc: +30% Aero DMG Bonus
 *  for 15s after Intro Skill. Iuno's own pick (only the 2pc). */
export const SIERRA_GALE_2PC = new Sonata2pc({ name: "Sierra Gale 2pc", stats: [[Stat.DmgBonus, 10, Attribute.Aero]] });
export const SIERRA_GALE_5PC = new Sonata({
  name: "Sierra Gale 5pc",
  sonata2pc: SIERRA_GALE_2PC,
  grants: [{ on: onCast(Cast.Intro), buff: () => SIERRA_GALE_INTRO }],
});
export const SIERRA_GALE_INTRO = new Buff({
  name: "Sierra Gale",
  stats: [[Stat.DmgBonus, 30, Attribute.Aero]], until: "outro",
});

/** Jué — a Calamity Class Spectro mainslot echo. Its cast grants the wearer Blessing of Time,
 *  the 15s window as a self-held coordinated countdown (`coordinatedBuff`, owner null — an echo
 *  has no resonator to name): every active, non-triggered action anywhere lands one 16% tick on
 *  the wearer's own slot, considered their Resonance Skill DMG, and while any stack remains they
 *  keep the +16% Resonance Skill DMG Bonus. The echo's own 20s cooldown means a rotation re-banks
 *  it about once a loop, so the bonus is live for the burst it was pressed for and gone after.
 *  A tick is an active row: it is the wearer's own hit, not a swap, so none of their "lost on
 *  switching out" buffs (an outro handoff they just adopted) should drop on it. */
export const ACTION_JUE = new Action("Echo - Jué", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Atk, type: Type1.Echo, mv: 48.64 * 2 + 19.46 * 5, energy: 0.76 * 2 + 0.3 * 5,
  updateBuffs: () => applyCurrent(JUE_BLESSING, 15),
});
/** Blessing of Time's own summon — the field it fires from, named for the report (rotation.ts's
 *  `ActionField`); JUE_BLESSING below is the buff whose grant puts it out. */
const JUE_FIELD = new ActionField("Jué: Blessing of Time");
export const ACTION_JUE_TICK = new Action("Echo - Jué: Blessing of Time", {
  element: Attribute.Spectro, scaling: Scaling.Atk, type: Type1.Skill, mv: 16, field: JUE_FIELD,
});
export const JUE_BLESSING = coordinatedBuff("Jué: Blessing of Time", 15, null, ACTION_JUE_TICK, {
  applyStats: () => addStat(Stat.DmgBonus, 16, Type1.Skill),
});
export const JUE = new Mainslot({
  name: "Jué",
  action: ACTION_JUE,
  echoType: EchoType.SUMMON,
});

/** Celestial Light, Jué's own matching sonata. 2pc: +10% Spectro DMG Bonus flat. 5pc: +30%
 *  Spectro DMG Bonus after Intro Skill, lost after the outro pays out — a double-Intro rotation
 *  (Jinhsi's) re-arms it on each of its two Intros, so both visits run covered. */
export const CELESTIAL_LIGHT_2PC = new Sonata2pc({ name: "Celestial Light 2pc", stats: [[Stat.DmgBonus, 10, Attribute.Spectro]] });
export const CELESTIAL_LIGHT_5PC = new Sonata({
  name: "Celestial Light 5pc",
  sonata2pc: CELESTIAL_LIGHT_2PC,
  grants: [{ on: onCast(Cast.Intro), buff: () => CELESTIAL_LIGHT_INTRO }],
});
export const CELESTIAL_LIGHT_INTRO = new Buff({
  name: "Celestial Light",
  stats: [[Stat.DmgBonus, 30, Attribute.Spectro]], until: "outro",
});

/** Mech Abomination — an Electro mainslot echo. Its strike also grants +12% ATK for 15s and
 *  summons Mech Waste to attack (a hit + explosion, combined into one 480% follow-up queued off
 *  the initial strike). Mech Waste's damage "equals the Resonator's Outro Skill DMG" — just a
 *  stat scope (`Type1.Outro`), not a live lookup. */
export const ACTION_MECH_ABOMINATION = new Action("Echo - Mech Abomination", {
  cast: Cast.Echo, element: Attribute.Electro, scaling: Scaling.Atk, type: Type1.Echo, mv: 48.64, energy: 0.76,
  updateBuffs: () => { applyCurrent(MECH_ABOMINATION_ATK, 1); queue(ACTION_MECH_WASTE); },
});
export const ACTION_MECH_WASTE = new Action("Echo - Mech Abomination: Mech Waste", {
  cast: Cast.Echo, element: Attribute.Electro, scaling: Scaling.Atk, type: Type1.Outro, mv: 480, energy: 1.52,
});
export const MECH_ABOMINATION_ATK = new Buff({
  name: "Mech Abomination",
  stats: [[Stat.BonusAtk, 12]], until: "outro",
});
export const MECH_ABOMINATION = new Mainslot({
  name: "Mech Abomination",
  action: ACTION_MECH_ABOMINATION,
  echoType: EchoType.TRANSFORM,
});

/** Lingering Tunes, Mech Abomination's own matching sonata. 2pc: +10% ATK flat. 5pc: +60% Outro
 *  Skill DMG Bonus flat, and +5% ATK every 1.5s on field, up to 4 stacks. Modelled as 8 real
 *  stacks (matching the ~1.5s cadence) so the ATK bonus lands every *2* stacks, discrete;
 *  displayed as the 1-4 tier this actually reads as. Lost on swap — tied to being on field. */
export const LINGERING_TUNES_2PC = new Sonata2pc({ name: "Lingering Tunes 2pc", stats: [[Stat.BonusAtk, 10]] });
export const LINGERING_TUNES_5PC = new Sonata({
  name: "Lingering Tunes 5pc",
  sonata2pc: LINGERING_TUNES_2PC,
  stats: [[Stat.DmgBonus, 60, Type1.Outro]],
  // the 1.5s cadence stands in for real on-field presses, so a queued follow-up, a status rung or
  // the shared Tune Break — active casts on the wearer's slot, but not them acting again — don't
  // advance it
  grants: [{ on: () => !triggeredAction() && isActive(), buff: () => LINGERING_TUNES_STACKS }],
});
export const LINGERING_TUNES_STACKS = new Buff({
  name: "Lingering Tunes", maxStacks: 8,
  applyStats: () => addStat(Stat.BonusAtk, 5 * Math.floor(frozenStacks() / 2)),
  updateBuffs: () => lostOnSwap(),
  display: () => `Lingering Tunes x${Math.ceil(frozenStacks() / 2)}`,
});

/** Nightmare: Thundering Mephis — Void Thunder's own Overlord-class mainslot echo (Xiangli Yao's
 *  pick). Flat Electro/Liberation DMG Bonus, no trigger. */
export const ACTION_NM_MEPHIS = new Action("Echo - Nightmare: Thundering Mephis", {
  cast: Cast.Echo, element: Attribute.Electro, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.62,
});
export const NM_MEPHIS = new Mainslot({
  name: "Nightmare: Thundering Mephis",
  action: ACTION_NM_MEPHIS,
  echoType: EchoType.TRANSFORM,
  stats: [[Stat.DmgBonus, 12, Attribute.Electro], [Stat.DmgBonus, 12, Type1.Liberation]],
});

/** Nightmare: Tempest Mephis — the other Overlord-class Mephis (Yinlin's pick, carries Empyrean
 *  Anthem too). Flat Electro/Resonance Skill DMG Bonus, no trigger. */
export const ACTION_NM_TEMPEST_MEPHIS = new Action("Echo - Nightmare: Tempest Mephis", {
  cast: Cast.Echo, element: Attribute.Electro, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.62,
});
export const NM_TEMPEST_MEPHIS = new Mainslot({
  name: "Nightmare: Tempest Mephis",
  action: ACTION_NM_TEMPEST_MEPHIS,
  echoType: EchoType.TRANSFORM,
  stats: [[Stat.DmgBonus, 12, Attribute.Electro], [Stat.DmgBonus, 12, Type1.Skill]],
});

/** Void Thunder, a generic electro sonata. 2pc: +10% Electro DMG Bonus flat. 5pc: +15% Electro
 *  DMG Bonus per stack on releasing Heavy Attack or Resonance Skill, up to 2 stacks, 15s a stack
 *  — lost after its own outro rather than modelled with literal per-stack decay. The stacks live
 *  on their own Buff, not the Sonata: revoking the gear itself would unequip the set for good. */
export const VOID_THUNDER_2PC = new Sonata2pc({ name: "Void Thunder 2pc", stats: [[Stat.DmgBonus, 10, Attribute.Electro]] });
export const VOID_THUNDER_STACKS = new Buff({
  name: "Void Thunder 5pc: Electro", maxStacks: 2,
  stats: [[Stat.DmgBonus, 15, Attribute.Electro]], perStack: true, until: "outro",
});
export const VOID_THUNDER_5PC = new Sonata({
  name: "Void Thunder 5pc",
  sonata2pc: VOID_THUNDER_2PC,
  grants: [{ on: onCast(Cast.Heavy, Cast.Skill), buff: VOID_THUNDER_STACKS }],
});

/** Fallacy, a generic HP-scaling spectro mainslot echo. Its cast puts up a team-wide +10% ATK,
 *  gone the moment its own wearer casts an Intro. The wearer's own +10% ER reads that same
 *  buff's own uptime rather than firing only on the cast. The revoke lives on `FALLACY` (local,
 *  so it only ever sees its own wearer's turn), not on the global `FALLACY_TEAM` itself. */
export const ACTION_FALLACY = new Action("Echo - Fallacy of No Return", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Hp, type: Type1.Echo, mv: 15.85, energy: 3.04,
  updateBuffs: () => applyTeam(FALLACY_TEAM, 1),
});

export const FALLACY_TEAM = new Buff({ name: "Fallacy of No Return", stats: [[Stat.BonusAtk, 10]] });

export const FALLACY = new Mainslot({
  name: "Fallacy of No Return",
  action: ACTION_FALLACY,
  echoType: EchoType.SUMMON,
  updateBuffs: () => { if (casting(Cast.Intro)) revokeTeam(FALLACY_TEAM); },
  applyStats: () => { if (stacksOfTeam(FALLACY_TEAM)) addStat(Stat.Er, 10); },
});
