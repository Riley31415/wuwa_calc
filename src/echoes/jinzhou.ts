/**
 * Mainslot echoes and sonatas from Jinzhou (versions 1.0-1.4), ported to the new engine. Grouped
 * by region rather than version — generic/reused sets are filed here by their own earliest real
 * release. A mainslot echo is two things: an Action (`cast: Cast.Echo`) plus a Buff held by
 * whoever equips it — whatever the cast itself does lives on that Action (an echo's action is
 * only ever reachable while its own piece is equipped, so it needs no further gate), while a flat
 * unconditional equip passive goes in the Mainslot's own applyStats().
 */
import { isType,
  Buff, Sonata, Sonata2pc, Mainslot, Action, Stat, Attribute, Type1, Cast, Scaling,
  addStat, frozenStacks, casting, currentAction, revokeCurrent, applyCurrent, applyTeam, stacksOfTeam, revokeTeam,
  removeStackTeam, queueOutro, queue, lostOnSwap, triggeredAction,
} from "../engine/kit.js";
import { applied } from "../engine/kit.js";
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
});

export const BELL_BORNE_SHIELD: Buff = new Buff({
  name: "Bell-Borne Geochelone: Bell-Borne Shield", maxStacks: 2,
  // no "xN" suffix — the DMG Bonus is flat regardless of charge count
  display: () => BELL_BORNE_SHIELD.name,
  applyStats: () => addStat(Stat.DmgBonus, 10),
  updateBuffs: () => { if (casting(Cast.Outro)) removeStackTeam(BELL_BORNE_SHIELD, 1); },
});

/** Impermanence Heron, a generic mainslot echo. No equip passive — its own cast primes an Outro
 *  handoff: the incoming resonator gets +12% (unscoped) DMG Bonus for 15s. */
export const ACTION_HERON = new Action("Echo - Impermanence Heron", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 310.56, energy: 14.85, // TODO check 10 er on hit
  updateBuffs: () => queueOutro(HERON_HANDOFF),
});

export const HERON = new Mainslot({
  name: "Impermanence Heron",
  action: ACTION_HERON,
});

export const HERON_HANDOFF = new Buff({
  name: "Impermanence Heron: Outro",
  applyStats: () => addStat(Stat.DmgBonus, 12),
  // a plain 15s window — checked in convertStats() (after applyStats() pays out), not updateBuffs()
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(HERON_HANDOFF); },
});

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
});

/** Moonlit Clouds, a generic sonata. 2pc: +10% ER flat. 5pc: on Outro, the incoming resonator
 *  gets +22.5% ATK for 15s — same handoff shape as Heron, but unconditional. */
export const MOONLIT_CLOUDS_2PC = new Sonata2pc({ name: "Moonlit Clouds 2pc", constantStats: () => addStat(Stat.Er, 10) });

export const MOONLIT_CLOUDS_5PC = new Sonata({
  name: "Moonlit Clouds 5pc",
  updateBuffs: () => { if (casting(Cast.Outro)) queueOutro(MOONLIT_CLOUDS_HANDOFF); },
});

export const MOONLIT_CLOUDS_HANDOFF = new Buff({
  name: "Moonlit Clouds (outro)",
  applyStats: () => addStat(Stat.BonusAtk, 22.5),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(MOONLIT_CLOUDS_HANDOFF); },
});

/** Rejuvenating Glow, a generic sonata. 5pc: on healing an ally, +15% ATK flat, team-wide,
 *  permanent uptime once triggered. 2pc: +10% Healing Bonus flat, tracked for completeness only. */
export const REJUV_5PC = new Sonata({
  name: "Rejuvenating Glow 5pc",
  updateBuffs: () => { if (applied(HEALS)) applyTeam(REJUV_TEAM, 1); },
});
export const REJUV_TEAM = new Buff({ name: "Rejuvenating Glow (team)", applyStats: () => addStat(Stat.BonusAtk, 15) });

export const REJUV_2PC = new Sonata2pc({ name: "Rejuvenating Glow 2pc", constantStats: () => addStat(Stat.HealingBonus, 10) });

/* ------------------------------------------------------------------------------- Changli, 1.1 */

/** Molten Rift, Changli's own sonata — also reused by Encore's Inferno Rider mainslot below.
 *  2pc: +10% Fusion DMG Bonus flat. 5pc: +30% Fusion DMG Bonus for 15s after Resonance Skill. */
export const MOLTEN_RIFT_2PC = new Sonata2pc({ name: "Molten Rift 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Fusion) });
export const MOLTEN_RIFT_5PC = new Sonata({
  name: "Molten Rift 5pc",
  updateBuffs: () => { if (casting(Cast.Skill)) applyCurrent(MOLTEN_RIFT_BUFF, 1); },
});
export const MOLTEN_RIFT_BUFF = new Buff({
  name: "Molten Rift",
  applyStats: () => addStat(Stat.DmgBonus, 30, Attribute.Fusion),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(MOLTEN_RIFT_BUFF); },
});

/** Nightmare: Inferno Rider, Changli's own mainslot echo — her Skill DMG is Fusion. Flat
 *  Fusion/Skill DMG Bonus for whoever wears it, no trigger. */
export const ACTION_NM_INFERNO_RIDER = new Action("Echo - Nightmare: Inferno Rider", {
  cast: Cast.Echo, element: Attribute.Fusion, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.62,
});
export const NM_INFERNO_RIDER = new Mainslot({
  name: "Nightmare: Inferno Rider",
  action: ACTION_NM_INFERNO_RIDER,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Fusion); addStat(Stat.DmgBonus, 12, Type1.Skill); },
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
  applyStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Fusion); addStat(Stat.DmgBonus, 12, Type1.Basic); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(INFERNO_RIDER_WINDOW); },
});
export const INFERNO_RIDER = new Mainslot({
  name: "Inferno Rider",
  action: ACTION_INFERNO_RIDER,
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
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Havoc); addStat(Stat.DmgBonus, 12, Type1.Basic); },
});

export const ACTION_CROWNLESS = new Action("Echo - Nightmare: Crownless", {
  cast: Cast.Echo, element: Attribute.Havoc, scaling: Scaling.Atk, type: Type1.Echo, mv: 134.08*2, energy: 	2.09*2,
  updateBuffs: () => applyCurrent(CROWNLESS_WINDOW, 1),
});
export const CROWNLESS_WINDOW = new Buff({
  name: "Crownless",
  applyStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Havoc); addStat(Stat.DmgBonus, 12, Type1.Skill); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(CROWNLESS_WINDOW); },
});
export const CROWNLESS = new Mainslot({
  name: "Crownless",
  action: ACTION_CROWNLESS,
});

/** Havoc Eclipse, the matching sonata. 2pc: +10% Havoc DMG Bonus flat. 5pc: +7.5% Havoc DMG
 *  Bonus after Basic/Heavy Attack, up to 4 frozenStacks, 15s each. */
export const HAVOC_ECLIPSE_2PC = new Sonata2pc({ name: "Havoc Eclipse 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Havoc) });
export const HAVOC_ECLIPSE_5PC = new Sonata({
  name: "Havoc Eclipse 5pc",
  updateBuffs: () => {
    const a = currentAction();
    if (isType(Type1.Basic) || isType(Type1.Heavy)) applyCurrent(HAVOC_ECLIPSE_STACKS, 1);
  },
});
export const HAVOC_ECLIPSE_STACKS = new Buff({
  name: "Havoc Eclipse", maxStacks: 4,
  applyStats: () => addStat(Stat.DmgBonus, 7.5 * frozenStacks(), Attribute.Havoc),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(HAVOC_ECLIPSE_STACKS); },
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
  applyStats: () => { addStat(Stat.DmgBonus, 4 * frozenStacks(), Attribute.Glacio); addStat(Stat.DmgBonus, 4 * frozenStacks(), Type1.Skill); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(LAMPYLUMEN_MYRIAD_STACKS); },
});
export const LAMPYLUMEN_MYRIAD = new Mainslot({
  name: "Lampylumen Myriad",
  action: ACTION_LAMPYLUMEN_MYRIAD,
});

/** Freezing Frost, Lampylumen Myriad's own matching sonata. 2pc: +10% Glacio DMG Bonus flat.
 *  5pc: +10% Glacio DMG Bonus after Basic/Heavy Attack, up to 3 frozenStacks, 15s each. */
export const FREEZING_FROST_2PC = new Sonata2pc({ name: "Freezing Frost 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Glacio) });
export const FREEZING_FROST_5PC = new Sonata({
  name: "Freezing Frost 5pc",
  updateBuffs: () => {
    const a = currentAction();
    if (isType(Type1.Basic) || isType(Type1.Heavy)) applyCurrent(FREEZING_FROST_STACKS, 1);
  },
});
export const FREEZING_FROST_STACKS = new Buff({
  name: "Freezing Frost", maxStacks: 3,
  applyStats: () => addStat(Stat.DmgBonus, 10 * frozenStacks(), Attribute.Glacio),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(FREEZING_FROST_STACKS); },
});

/** Nightmare: Feilian Beringal — Sierra Gale's own real matching mainslot echo (Iuno just
 *  happens to reuse it). Flat Aero/Heavy Attack DMG Bonus, no trigger. */
export const ACTION_NM_FEILIAN_BERINGAL = new Action("Echo - Nightmare: Feilian Beringal", {
  cast: Cast.Echo, element: Attribute.Aero, scaling: Scaling.Atk, type: Type1.Echo, mv: 273.56, energy: 2.28 + 0.3 * 5, // 164.16%+21.88%x5
});
export const NM_FEILIAN_BERINGAL = new Mainslot({
  name: "Nightmare: Feilian Beringal",
  action: ACTION_NM_FEILIAN_BERINGAL,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Aero); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/** Sierra Gale, the matching sonata. 2pc: +10% Aero DMG Bonus flat. 5pc: +30% Aero DMG Bonus
 *  for 15s after Intro Skill. Iuno's own pick (only the 2pc). */
export const SIERRA_GALE_2PC = new Sonata2pc({ name: "Sierra Gale 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Aero) });
export const SIERRA_GALE_5PC = new Sonata({
  name: "Sierra Gale 5pc",
  updateBuffs: () => { if (casting(Cast.Intro)) applyCurrent(SIERRA_GALE_INTRO, 1); },
});
export const SIERRA_GALE_INTRO = new Buff({
  name: "Sierra Gale",
  applyStats: () => addStat(Stat.DmgBonus, 30, Attribute.Aero),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(SIERRA_GALE_INTRO); },
});

/** Jué — a Calamity Class Spectro mainslot echo. Its cast also summons Blessing of Time as a
 *  separate triggered action — 15 ticks of 16% Resonance Skill DMG, lumped into one action same
 *  as Zhezhi's Inklit Spirit/Cantarella's Diffusion — and grants a permanent +16% Resonance
 *  Skill DMG Bonus (uptime never lost, by explicit instruction). */
export const ACTION_JUE = new Action("Echo - Jué", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Atk, type: Type1.Echo, mv: 48.64 * 2 + 19.46 * 5, energy: 0.76 * 2 + 0.3 * 5,
  updateBuffs: () => { applyCurrent(JUE_BLESSING, 1); queue(ACTION_JUE_BLESSING); },
});
export const ACTION_JUE_BLESSING = new Action("Echo - Jué: Blessing of Time x15", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Atk, type: Type1.Skill, mv: 16 * 15,
});
export const JUE_BLESSING = new Buff({
  name: "Jué: Blessing of Time",
  applyStats: () => addStat(Stat.DmgBonus, 16, Type1.Skill),
});
export const JUE = new Mainslot({
  name: "Jué",
  action: ACTION_JUE,
});

/** Celestial Light, Jué's own matching sonata. 2pc: +10% Spectro DMG Bonus flat. 5pc: +30%
 *  Spectro DMG Bonus after Intro Skill — permanent uptime never lost, by explicit instruction. */
export const CELESTIAL_LIGHT_2PC = new Sonata2pc({ name: "Celestial Light 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Spectro) });
export const CELESTIAL_LIGHT_5PC = new Sonata({
  name: "Celestial Light 5pc",
  updateBuffs: () => { if (casting(Cast.Intro)) applyCurrent(CELESTIAL_LIGHT_INTRO, 1); },
});
export const CELESTIAL_LIGHT_INTRO = new Buff({
  name: "Celestial Light",
  applyStats: () => addStat(Stat.DmgBonus, 30, Attribute.Spectro),
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
  applyStats: () => addStat(Stat.BonusAtk, 12),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(MECH_ABOMINATION_ATK); },
});
export const MECH_ABOMINATION = new Mainslot({
  name: "Mech Abomination",
  action: ACTION_MECH_ABOMINATION,
});

/** Lingering Tunes, Mech Abomination's own matching sonata. 2pc: +10% ATK flat. 5pc: +60% Outro
 *  Skill DMG Bonus flat, and +5% ATK every 1.5s on field, up to 4 stacks. Modelled as 8 real
 *  stacks (matching the ~1.5s cadence) so the ATK bonus lands every *2* frozenStacks, discrete;
 *  displayed as the 1-4 tier this actually reads as. Lost on swap — tied to being on field. */
export const LINGERING_TUNES_2PC = new Sonata2pc({ name: "Lingering Tunes 2pc", constantStats: () => addStat(Stat.BonusAtk, 10) });
export const LINGERING_TUNES_5PC = new Sonata({
  name: "Lingering Tunes 5pc",
  constantStats: () => addStat(Stat.DmgBonus, 60, Type1.Outro),
  // the 1.5s cadence stands in for real on-field presses, so a queued follow-up, a status rung or
  // the shared Tune Break — active casts on the wearer's slot, but not them acting again — don't
  // advance it
  updateBuffs: () => { if (!triggeredAction() && currentAction().active) applyCurrent(LINGERING_TUNES_STACKS, 1); },
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
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Electro); addStat(Stat.DmgBonus, 12, Type1.Liberation); },
});

/** Nightmare: Tempest Mephis — the other Overlord-class Mephis (Yinlin's pick, carries Empyrean
 *  Anthem too). Flat Electro/Resonance Skill DMG Bonus, no trigger. */
export const ACTION_NM_TEMPEST_MEPHIS = new Action("Echo - Nightmare: Tempest Mephis", {
  cast: Cast.Echo, element: Attribute.Electro, scaling: Scaling.Atk, type: Type1.Echo, mv: 405, energy: 5.62,
});
export const NM_TEMPEST_MEPHIS = new Mainslot({
  name: "Nightmare: Tempest Mephis",
  action: ACTION_NM_TEMPEST_MEPHIS,
  constantStats: () => { addStat(Stat.DmgBonus, 12, Attribute.Electro); addStat(Stat.DmgBonus, 12, Type1.Skill); },
});

/** Void Thunder, a generic electro sonata. 2pc: +10% Electro DMG Bonus flat. 5pc: +15% Electro
 *  DMG Bonus per stack on releasing Heavy Attack or Resonance Skill, up to 2 frozenStacks, 15s a stack
 *  — lost after its own outro rather than modelled with literal per-stack decay. The stacks live
 *  on their own Buff, not the Sonata: revoking the gear itself would unequip the set for good. */
export const VOID_THUNDER_2PC = new Sonata2pc({ name: "Void Thunder 2pc", constantStats: () => addStat(Stat.DmgBonus, 10, Attribute.Electro) });
export const VOID_THUNDER_STACKS = new Buff({
  name: "Void Thunder 5pc: Electro", maxStacks: 2,
  applyStats: () => addStat(Stat.DmgBonus, 15 * frozenStacks(), Attribute.Electro),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(VOID_THUNDER_STACKS); },
});
export const VOID_THUNDER_5PC = new Sonata({
  name: "Void Thunder 5pc",
  updateBuffs: () => { if (casting(Cast.Heavy) || casting(Cast.Skill)) applyCurrent(VOID_THUNDER_STACKS, 1); },
});

/** Fallacy, a generic HP-scaling spectro mainslot echo. Its cast puts up a team-wide +10% ATK,
 *  gone the moment its own wearer casts an Intro. The wearer's own +10% ER reads that same
 *  buff's own uptime rather than firing only on the cast. The revoke lives on `FALLACY` (local,
 *  so it only ever sees its own wearer's turn), not on the global `FALLACY_TEAM` itself. */
export const ACTION_FALLACY = new Action("Echo - Fallacy of No Return", {
  cast: Cast.Echo, element: Attribute.Spectro, scaling: Scaling.Hp, type: Type1.Echo, mv: 15.85, energy: 3.04,
  updateBuffs: () => applyTeam(FALLACY_TEAM, 1),
});

export const FALLACY_TEAM = new Buff({ name: "Fallacy of No Return (team)", applyStats: () => addStat(Stat.BonusAtk, 10) });

export const FALLACY = new Mainslot({
  name: "Fallacy of No Return",
  action: ACTION_FALLACY,
  updateBuffs: () => { if (casting(Cast.Intro)) revokeTeam(FALLACY_TEAM); },
  applyStats: () => { if (stacksOfTeam(FALLACY_TEAM)) addStat(Stat.Er, 10); },
});
