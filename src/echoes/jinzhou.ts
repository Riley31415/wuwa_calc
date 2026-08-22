/**
 * Mainslot echoes and sonatas from Jinzhou (versions 1.0-1.4), ported to the new engine. Grouped
 * by region rather than version — generic/reused sets are filed here by their own earliest real
 * release, not by whichever character's build happens to reuse them later.
 *
 * A mainslot echo is two things: an Action (its own cast, `cast: Cast.Echo`) plus a Buff held by
 * whoever equips it. A piece with no passive from merely equipping it puts its whole effect in
 * the Buff's own update(), gated on `currentAction() === ITS_OWN_ACTION`; a piece with a flat
 * unconditional passive puts it in the Buff's apply() instead, same as any other stat line.
 */
import {
  Buff, Mainslot, Action, Stat, Element, Type1, Type2, Cast, Scaling,
  addStat, stacks, casting, currentAction, revoke, applySelf, applyTeam, stacksOfTeam, revokeTeam,
  removeStackTeam, queueOutro, queue, lostOnSwap,
} from "../kit.js";

function jinzhouAction(id: string, def: object): Action {
  return new Action(id, { cast: Cast.Echo, type: Type1.Echo, scaling: Scaling.Atk, ...def });
}

/* -------------------------------------------------------------------------- generic, unowned */

/** Bell-Borne Geochelone, a 5-cost mainslot echo. No equip passive — its own cast grants the
 *  team 2 stacks of Bell-Borne Shield (only the +10% DMG Bonus half is modelled; the shield/DMG
 *  reduction itself is out of scope). A stack is lost on any teammate's outro, so a fresh cast
 *  survives one outro before wearing off on the next. */
export const ACTION_BELL_BORNE = jinzhouAction("Echo - Bell-Borne Geochelone", { element: Element.Glacio, scaling: Scaling.Def, mv: 145.92 });

export const BELL_BORNE_GEOCHELONE = new Buff({
  name: "Bell-Borne Geochelone",
  update: () => { if (currentAction() === ACTION_BELL_BORNE) applyTeam(BELL_BORNE_SHIELD, 2); },
});

export const BELL_BORNE_SHIELD = new Buff({
  name: "Bell-Borne Geochelone: Bell-Borne Shield", maxStacks: 2,
  apply: () => addStat(Stat.DmgBonus, 10),
  update: () => { if (casting(Cast.Outro)) removeStackTeam(BELL_BORNE_SHIELD, 1); },
});

/** Impermanence Heron, a generic mainslot echo. No equip passive — its own cast primes an Outro
 *  handoff: the incoming resonator gets +12% (unscoped) DMG Bonus for 15s. */
export const ACTION_HERON = jinzhouAction("Echo - Impermanence Heron", { element: Element.Havoc, mv: 310.56 });

export const HERON = new Mainslot({
  name: "Impermanence Heron",
  action: ACTION_HERON,
  update: () => { if (currentAction() === ACTION_HERON) queueOutro(HERON_HANDOFF); },
});

export const HERON_HANDOFF = new Buff({
  name: "Impermanence Heron: Outro",
  apply: () => addStat(Stat.DmgBonus, 12),
  // a plain 15s window, not "lost on swap" wording — still counts on the wearer's own outro,
  // so this is checked in convert() (after apply() pays out), not update()
  convert: () => { if (casting(Cast.Outro)) revoke(HERON_HANDOFF); },
});

/** Moonlit Clouds, a generic sonata. 2pc: +10% ER flat. 5pc: on Outro, the incoming resonator
 *  gets +22.5% ATK for 15s — same handoff shape as Heron above, but unconditional. */
export const MOONLIT_CLOUDS_2PC = new Buff({ name: "Moonlit Clouds 2pc", apply: () => addStat(Stat.Er, 10) });

export const MOONLIT_CLOUDS_5PC = new Buff({
  name: "Moonlit Clouds 5pc",
  update: () => { if (casting(Cast.Outro)) queueOutro(MOONLIT_CLOUDS_HANDOFF); },
});

export const MOONLIT_CLOUDS_HANDOFF = new Buff({
  name: "Moonlit Clouds 5pc",
  apply: () => addStat(Stat.BonusAtk, 22.5),
  // plain 15s window, not "lost on swap" wording — see HERON_HANDOFF's own comment above
  convert: () => { if (casting(Cast.Outro)) revoke(MOONLIT_CLOUDS_HANDOFF); },
});

/** Rejuvenating Glow, a generic sonata. 5pc: on healing an ally, +15% ATK flat, team-wide,
 *  permanent uptime once triggered (real duration is well past this project's 21s-or-longer
 *  "never lost" cutoff). 2pc: +10% Healing Bonus flat, unused by the formula, tracked for
 *  completeness only. */
export const REJUV_5PC = new Buff({
  name: "Rejuvenating Glow 5pc",
  update: () => { if (currentAction().heals) applyTeam(REJUV_TEAM, 1); },
});
export const REJUV_TEAM = new Buff({ name: "Rejuvenating Glow", apply: () => addStat(Stat.BonusAtk, 15) });

export const REJUV_2PC = new Buff({ name: "Rejuvenating Glow 2pc", apply: () => addStat(Stat.HealingBonus, 10) });

/** Fallacy, a generic HP-scaling spectro mainslot echo. Its cast puts up one genuinely team-wide
 *  buff: +10% ATK for the whole team, gone the moment its own wearer casts an Intro — not just
 *  anyone's. The wearer's own +10% ER isn't tied to the cast itself any more — it reads that same
 *  buff's own uptime, so it comes and goes with it instead of firing only on the one action that
 *  cast it. `cast: Cast.Echo` marks it as one even though it deals spectro echo damage.
 *
 *  The revoke lives on `FALLACY` (the wearer's own Mainslot), not on `FALLACY_TEAM` itself:
 *  `FALLACY_TEAM` is global, so its own update() would run on *every* member's turn regardless of
 *  who's wearing the echo — `casting(Cast.Intro)` there can't tell "the wearer just introed" apart
 *  from "literally anyone did". `FALLACY`'s own update() only ever runs on its wearer's own turn
 *  in the first place (it's local, not global), so the same check there is naturally scoped to
 *  the one intro that should matter. */
export const ACTION_FALLACY = jinzhouAction("Echo - Fallacy of No Return", { element: Element.Spectro, scaling: Scaling.Hp, mv: 15.85 });

export const FALLACY_TEAM = new Buff({ name: "Fallacy of No Return", apply: () => addStat(Stat.BonusAtk, 10) });

export const FALLACY = new Mainslot({
  name: "Fallacy of No Return",
  action: ACTION_FALLACY,
  update: () => {
    if (currentAction() === ACTION_FALLACY) applyTeam(FALLACY_TEAM, 1);
    if (casting(Cast.Intro)) revokeTeam(FALLACY_TEAM);
  },
  apply: () => { if (stacksOfTeam(FALLACY_TEAM)) addStat(Stat.Er, 10); },
});

/* -------------------------------------------------------------------------------- Zhezhi, 1.2 */

/** Nightmare: Lampylumen Myriad, Zhezhi's own mainslot echo — she's the only glacio Coordinated
 *  Attack character. Flat Glacio/Coordinated Attack DMG Bonus for whoever wears it, no trigger. */
export const ACTION_NM_LAMPY = jinzhouAction("Echo - Nightmare: Lampylumen Myriad", { element: Element.Glacio, mv: 273.6 });
export const NM_LAMPY = new Mainslot({
  name: "Nightmare: Lampylumen Myriad",
  action: ACTION_NM_LAMPY,
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Glacio); addStat(Stat.DmgBonus, 30, Type2.Coordinated); },
});

/** Empyrean Anthem, Zhezhi's own sonata. 2pc: +10% ER flat. 5pc: +80% Coordinated Attack DMG
 *  Bonus, self only. A Coordinated Attack crit also grants the whole team +20% ATK for 4s,
 *  assumed unconditional uptime — never revoked, per the standing duration rule once one lands
 *  (a real source re-triggers well past 21s). Still only lands on whoever's actually active. */
export const EMPYREAN_ANTHEM_2PC = new Buff({ name: "Empyrean Anthem 2pc", apply: () => addStat(Stat.Er, 10) });
export const EMPYREAN_ANTHEM_5PC = new Buff({
  name: "Empyrean Anthem 5pc",
  apply: () => addStat(Stat.DmgBonus, 80, Type2.Coordinated),
  update: () => { if (currentAction().type2 === Type2.Coordinated) applyTeam(EMPYREAN_ANTHEM_TEAM, 1); },
});
export const EMPYREAN_ANTHEM_TEAM = new Buff({
  name: "Empyrean Anthem 5pc",
  apply: () => { if (currentAction().active) addStat(Stat.BonusAtk, 20); },
});

/* ------------------------------------------------------------------------------- Changli, 1.1 */

/** Molten Rift, Changli's own sonata — also reused by Encore's Inferno Rider mainslot below.
 *  2pc: +10% Fusion DMG Bonus flat. 5pc: +30% Fusion DMG Bonus for 15s after Resonance Skill. */
export const MOLTEN_RIFT_2PC = new Buff({ name: "Molten Rift 2pc", apply: () => addStat(Stat.DmgBonus, 10, Element.Fusion) });
export const MOLTEN_RIFT_5PC = new Buff({
  name: "Molten Rift 5pc",
  update: () => { if (casting(Cast.Skill)) applySelf(MOLTEN_RIFT_BUFF, 1); },
});
export const MOLTEN_RIFT_BUFF = new Buff({
  name: "Molten Rift",
  apply: () => addStat(Stat.DmgBonus, 30, Element.Fusion),
  // plain 15s window, so it still counts on the wearer's own outro (see HERON_HANDOFF's comment)
  convert: () => { if (casting(Cast.Outro)) revoke(MOLTEN_RIFT_BUFF); },
});

/** Nightmare: Inferno Rider, Changli's own mainslot echo — her Skill DMG is Fusion. Flat
 *  Fusion/Skill DMG Bonus for whoever wears it, no trigger. */
export const ACTION_NM_INFERNO_RIDER = jinzhouAction("Echo - Nightmare: Inferno Rider", { element: Element.Fusion, mv: 405 });
export const NM_INFERNO_RIDER = new Buff({
  name: "Nightmare: Inferno Rider",
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Fusion); addStat(Stat.DmgBonus, 12, Type1.Skill); },
});

/* -------------------------------------------------------------------------------- Encore, 1.0 */

/** Inferno Rider (plain, not "Nightmare:") — Encore's own mainslot echo. No permanent passive:
 *  casting it grants the caster a temporary +12%/+12% Fusion/Basic Attack DMG Bonus window. */
export const ACTION_INFERNO_RIDER = jinzhouAction("Echo - Inferno Rider", { element: Element.Fusion, mv: 505 });
export const INFERNO_RIDER_WINDOW = new Buff({
  name: "Inferno Rider",
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Fusion); addStat(Stat.DmgBonus, 12, Type1.Basic); },
  // a temporary window, not "lost on swap" wording — still counts on the wearer's own outro
  convert: () => { if (casting(Cast.Outro)) revoke(INFERNO_RIDER_WINDOW); },
});
export const INFERNO_RIDER = new Buff({
  name: "Inferno Rider",
  update: () => { if (currentAction() === ACTION_INFERNO_RIDER) applySelf(INFERNO_RIDER_WINDOW, 1); },
});

/* ------------------------------------------------------------------ Camellya 1.4 / Rover 1.0 */

/** Nightmare: Crownless, the shared Havoc mainslot echo for Camellya and Havoc Rover — both
 *  Basic-Attack-focused Havoc sword users. Flat Havoc/Basic Attack DMG Bonus, no trigger. */
export const ACTION_NM_CROWNLESS = jinzhouAction("Echo - Nightmare: Crownless", { element: Element.Havoc, mv: 264.6 });
export const NM_CROWNLESS = new Buff({
  name: "Nightmare: Crownless",
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Havoc); addStat(Stat.DmgBonus, 12, Type1.Basic); },
});

/** Havoc Eclipse, the matching sonata. 2pc: +10% Havoc DMG Bonus flat. 5pc: +7.5% Havoc DMG
 *  Bonus after Basic/Heavy Attack, up to 4 stacks, 15s each. */
export const HAVOC_ECLIPSE_2PC = new Buff({ name: "Havoc Eclipse 2pc", apply: () => addStat(Stat.DmgBonus, 10, Element.Havoc) });
export const HAVOC_ECLIPSE_5PC = new Buff({
  name: "Havoc Eclipse 5pc",
  update: () => {
    const a = currentAction();
    if (a.type === Type1.Basic || a.type === Type1.Heavy) applySelf(HAVOC_ECLIPSE_STACKS, 1);
  },
});
export const HAVOC_ECLIPSE_STACKS = new Buff({
  name: "Havoc Eclipse", maxStacks: 4,
  apply: () => addStat(Stat.DmgBonus, 7.5 * stacks(), Element.Havoc),
  // 15s a stack, so still counts on the wearer's own outro (see HERON_HANDOFF's own comment)
  convert: () => { if (casting(Cast.Outro)) revoke(HAVOC_ECLIPSE_STACKS); },
});

/* --------------------------------------------------------- old Jinzhou sonatas, none in a build */

/** Lampylumen Myriad (plain, not "Nightmare:") — an old Jinzhou-era mainslot echo. No equip
 *  passive — its own cast's 3 hits grant a stacking +4% Glacio / +4% Resonance Skill DMG Bonus
 *  for 15s, up to 3 stacks. Not owned by any resonator implemented yet — exported standalone. */
export const ACTION_LAMPYLUMEN_MYRIAD = jinzhouAction("Echo - Lampylumen Myriad", { element: Element.Glacio, mv: 667.20 });   // 200.16%+200.16%+266.88%
export const LAMPYLUMEN_MYRIAD_STACKS = new Buff({
  name: "Lampylumen Myriad", maxStacks: 3,
  apply: () => { addStat(Stat.DmgBonus, 4 * stacks(), Element.Glacio); addStat(Stat.DmgBonus, 4 * stacks(), Type1.Skill); },
  // 15s a stack, so still counts on the wearer's own outro (see HERON_HANDOFF's own comment)
  convert: () => { if (casting(Cast.Outro)) revoke(LAMPYLUMEN_MYRIAD_STACKS); },
});
export const LAMPYLUMEN_MYRIAD = new Buff({
  name: "Lampylumen Myriad",
  update: () => { if (currentAction() === ACTION_LAMPYLUMEN_MYRIAD) applySelf(LAMPYLUMEN_MYRIAD_STACKS, 3); },
});

/** Freezing Frost, Lampylumen Myriad's own matching sonata. 2pc: +10% Glacio DMG Bonus flat.
 *  5pc: +10% Glacio DMG Bonus after Basic/Heavy Attack, up to 3 stacks, 15s each. */
export const FREEZING_FROST_2PC = new Buff({ name: "Freezing Frost 2pc", apply: () => addStat(Stat.DmgBonus, 10, Element.Glacio) });
export const FREEZING_FROST_5PC = new Buff({
  name: "Freezing Frost 5pc",
  update: () => {
    const a = currentAction();
    if (a.type === Type1.Basic || a.type === Type1.Heavy) applySelf(FREEZING_FROST_STACKS, 1);
  },
});
export const FREEZING_FROST_STACKS = new Buff({
  name: "Freezing Frost", maxStacks: 3,
  apply: () => addStat(Stat.DmgBonus, 10 * stacks(), Element.Glacio),
  // 15s a stack, so still counts on the wearer's own outro (see HERON_HANDOFF's own comment)
  convert: () => { if (casting(Cast.Outro)) revoke(FREEZING_FROST_STACKS); },
});

/** Nightmare: Feilian Beringal — Sierra Gale's own real matching mainslot echo (a Jinzhou-era
 *  set; Iuno just happens to reuse it). Flat Aero/Heavy Attack DMG Bonus, no trigger. */
export const ACTION_NM_FEILIAN_BERINGAL = jinzhouAction("Echo - Nightmare: Feilian Beringal", { element: Element.Aero, mv: 273.56 });   // 164.16%+21.88%x5
export const NM_FEILIAN_BERINGAL = new Buff({
  name: "Nightmare: Feilian Beringal",
  apply: () => { addStat(Stat.DmgBonus, 12, Element.Aero); addStat(Stat.DmgBonus, 12, Type1.Heavy); },
});

/** Sierra Gale, the matching sonata. 2pc: +10% Aero DMG Bonus flat. 5pc: +30% Aero DMG Bonus
 *  for 15s after Intro Skill. Iuno's own pick (only the 2pc). */
export const SIERRA_GALE_2PC = new Buff({ name: "Sierra Gale 2pc", apply: () => addStat(Stat.DmgBonus, 10, Element.Aero) });
export const SIERRA_GALE_5PC = new Buff({
  name: "Sierra Gale 5pc",
  update: () => { if (casting(Cast.Intro)) applySelf(SIERRA_GALE_INTRO, 1); },
});
export const SIERRA_GALE_INTRO = new Buff({
  name: "Sierra Gale 5pc",
  apply: () => addStat(Stat.DmgBonus, 30, Element.Aero),
  // plain 15s window, so it still counts on the wearer's own outro (see HERON_HANDOFF's comment)
  convert: () => { if (casting(Cast.Outro)) revoke(SIERRA_GALE_INTRO); },
});

/** Jué — a Calamity Class Spectro mainslot echo. Its own cast (48.64%x2+19.46%x5 Echo DMG) also
 *  summons Blessing of Time as a separate triggered action — 15 ticks of 16% Resonance Skill DMG,
 *  lumped into one action the same way Zhezhi's Inklit Spirit/Cantarella's Diffusion lump their
 *  own multi-hit windows into one — and grants the wearer a permanent +16% Resonance Skill DMG
 *  Bonus (uptime never lost, by explicit instruction — not modelled as a 15s window). */
export const ACTION_JUE = jinzhouAction("Echo - Jué", { element: Element.Spectro, mv: 48.64 * 2 + 19.46 * 5, energy: 76*2 + 30*5 });
export const ACTION_JUE_BLESSING = jinzhouAction("Echo - Jué: Blessing of Time x15", {
  element: Element.Spectro, type: Type1.Skill, mv: 16 * 15,
});
export const JUE_BLESSING = new Buff({
  name: "Jué: Blessing of Time",
  apply: () => addStat(Stat.DmgBonus, 16, Type1.Skill),
});
export const JUE = new Buff({
  name: "Jué",
  update: () => {
    if (currentAction() !== ACTION_JUE) return;
    applySelf(JUE_BLESSING, 1);
    queue(ACTION_JUE_BLESSING);
  },
});

/** Celestial Light, Jué's own matching sonata. 2pc: +10% Spectro DMG Bonus flat. 5pc: +30%
 *  Spectro DMG Bonus after Intro Skill — permanent uptime never lost, by explicit instruction. */
export const CELESTIAL_LIGHT_2PC = new Buff({ name: "Celestial Light 2pc", apply: () => addStat(Stat.DmgBonus, 10, Element.Spectro) });
export const CELESTIAL_LIGHT_5PC = new Buff({
  name: "Celestial Light 5pc",
  update: () => { if (casting(Cast.Intro)) applySelf(CELESTIAL_LIGHT_INTRO, 1); },
});
export const CELESTIAL_LIGHT_INTRO = new Buff({
  name: "Celestial Light 5pc",
  apply: () => addStat(Stat.DmgBonus, 30, Element.Spectro),
});

/** Mech Abomination — an Electro mainslot echo. Its own strike also grants the caster +12% ATK
 *  for 15s and summons Mech Waste to attack: a hit (320%) plus its own explosion (160%) after a
 *  while, combined into one 480% follow-up action queued off the initial strike rather than
 *  folded into its own flat MV. Mech Waste's damage "equals the Resonator's Outro Skill DMG" —
 *  just a stat scope, not a live lookup, so it's typed `Type1.Outro` and nothing more. */
export const ACTION_MECH_ABOMINATION = jinzhouAction("Echo - Mech Abomination", { element: Element.Electro, mv: 48.64,energy: 76, });
export const ACTION_MECH_WASTE = jinzhouAction("Echo - Mech Abomination: Mech Waste", {
  element: Element.Electro, type: Type1.Outro, mv: 480, energy: 152,
});
export const MECH_ABOMINATION_ATK = new Buff({
  name: "Mech Abomination",
  apply: () => addStat(Stat.BonusAtk, 12),
  // plain 15s window, so it still counts on the wearer's own outro (see HERON_HANDOFF's comment)
  convert: () => { if (casting(Cast.Outro)) revoke(MECH_ABOMINATION_ATK); },
});
export const MECH_ABOMINATION = new Buff({
  name: "Mech Abomination",
  update: () => {
    if (currentAction() !== ACTION_MECH_ABOMINATION) return;
    applySelf(MECH_ABOMINATION_ATK, 1);
    queue(ACTION_MECH_WASTE);
  },
});

/** Lingering Tunes, Mech Abomination's own matching sonata. 2pc: +10% ATK flat. 5pc: +60% Outro
 *  Skill DMG Bonus flat (a general stat scope, not a live lookup — same as Mech Waste above), and
 *  +5% ATK every 1.5s while on field, up to 4 stacks. Modelled as 8 real stacks (one a non-
 *  triggered, i.e. active, action — roughly the same 1.5s cadence) so the ATK bonus can land on
 *  its own real cadence too: 5% every *2* stacks, discrete (2 stacks in, one jump; odd counts pay
 *  the same as the even one below them), rather than every single stack. Displayed as the 1-4
 *  tier this actually reads as, not the raw 1-8 undercount. Lost on swap rather than assumed
 *  granted outright, since the kit page frames it as tied to actually being on field, not a
 *  fire-and-forget proc. */
export const LINGERING_TUNES_2PC = new Buff({ name: "Lingering Tunes 2pc", apply: () => addStat(Stat.BonusAtk, 10) });
export const LINGERING_TUNES_5PC = new Buff({
  name: "Lingering Tunes 5pc",
  apply: () => addStat(Stat.DmgBonus, 60, Type1.Outro),
  update: () => { if (currentAction().active) applySelf(LINGERING_TUNES_STACKS, 1); },
});
export const LINGERING_TUNES_STACKS = new Buff({
  name: "Lingering Tunes: 5pc", maxStacks: 8,
  apply: () => addStat(Stat.BonusAtk, 5 * Math.floor(stacks() / 2)),
  update: () => lostOnSwap(),
  display: () => `Lingering Tunes: 5pc x${Math.ceil(stacks() / 2)}`,
});
