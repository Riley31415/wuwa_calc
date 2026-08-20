/** Mainslot echoes and sonatas from Jinzhou (versions 1.0-1.4) — grouped by region rather than
 *  version number. Generic/reused sets are filed here by their own earliest real release, not
 *  by whichever character's build happens to reuse them later (Sierra Gale is a Jinzhou-era set
 *  even though the only implemented resonator equipping it, Iuno, released in Septimont). Each
 *  resonator's own file picks which of these its loadout equips. */
import { isOutro, isSkill } from "../state.js";
import { Buff, GlobalBuff, Gear, Mainslot, Action, PRIORITY } from "../kit.js";
import { DamageType, Cast, Element, Scaling, Stat, Type2 } from "../stats.js";
const { Echo } = DamageType;
const { Glacio, Havoc, Aero, Spectro, Electro, Fusion } = Element;
const { Def, Atk } = Scaling;
const { DmgBonus, BonusAtk, Er, HealingBonus } = Stat;

/* -------------------------------------------------------------------------- generic, unowned */

/**
 * Bell-Borne Geochelone, a 5-cost mainslot echo. No passive from merely equipping it — the
 * whole effect is on its Skill cast: Glacio DMG off 145.92% of the caster's own DEF, plus
 * "Bell-Borne Shield" for the team — not a real shield, just the buff's name (DMG Reduction
 * itself is out of scope for a DPS calculator, so only the +10% DMG Bonus half is modelled).
 * Modelled as a 2-stack global buff rather than its real 15s timer / "3 hits" counter: a stack
 * is lost on any teammate's outro, so a fresh cast survives one outro before wearing off on
 * the next, matching "basically lasts until the next character outros". A generic, unowned
 * Overlord Class echo — see nanoka.cc's own Echo list for its numeric ID.
 */
export const ACTION_BELL_BORNE = new Action("Echo: Bell-Borne Geochelone", {
  cast: Cast.Echo,
  element: Glacio,
  scaling: Def,
  type: Echo,
  mv: 145.92,
  energy: 455,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(BELL_BORNE_SHIELD, 2); },
});

export const BELL_BORNE_GEOCHELONE = new Mainslot("Bell-Borne Geochelone", ACTION_BELL_BORNE);

export const BELL_BORNE_SHIELD = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(10, DmgBonus);
  if (isOutro(ctx.action!)) ctx.removeStack(BELL_BORNE_SHIELD, 1);
  return `Bell-Borne Geochelone: Bell-Borne Shield`;
}, 2);

/** Impermanence Heron, a generic mainslot echo — its own hit, plus: if the wielder casts their
 *  Outro within its own primed window, the incoming resonator gets +12% (unscoped) DMG Bonus
 *  for 15s. Both windows short enough for the standing outro-loss rule. A generic, unowned
 *  Overlord Class echo — see nanoka.cc's own Echo list for its numeric ID. */
/** The echo's own cast — the "fly up and smack down" hit; the held flame-spit follow-up isn't
 *  modelled, same as other echoes' periodic/charged variants elsewhere. Also primes the Outro
 *  handoff below. */
export const ACTION_HERON = new Action("Echo: Impermanence Heron", {
  cast: Cast.Echo, element: Havoc, scaling: Atk, type: Echo,
  mv: 310.56, energy: 485,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.outro(HERON_HANDOFF); },
});

export const HERON = new Mainslot("Impermanence Heron", ACTION_HERON);

export const HERON_HANDOFF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(HERON_HANDOFF);
  ctx.add(12, DmgBonus);
  return "Impermanence Heron: Outro";
});

/** Moonlit Clouds, a generic sonata. 2pc: +10% ER flat. 5pc: on Outro, the incoming resonator
 *  gets +22.5% ATK for 15s — same outro-handoff shape as Heron above, but unconditional. A
 *  generic, unowned Elite Class sonata — see nanoka.cc's own Echo list for its numeric ID. */
export const MOONLIT_CLOUDS_2PC = new Gear("Moonlit Clouds 2pc", (ctx) => { ctx.add(10, Er); });

export const MOONLIT_CLOUDS_5PC = new Gear("Moonlit Clouds 5pc", (ctx) => {
  ctx.outro(MOONLIT_CLOUDS_HANDOFF);
});

export const MOONLIT_CLOUDS_HANDOFF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(22.5, BonusAtk);
  if (isOutro(ctx.action!)) ctx.revoke(MOONLIT_CLOUDS_HANDOFF);
  return "Moonlit Clouds 5pc: Outro";
});

/** Rejuvenating Glow, a generic sonata. 5pc: +15% ATK flat, team-wide (its real "on healing
 *  ally" trigger is unconditional here — healing itself is out of scope, so it's modelled as
 *  always up once equipped). 2pc: +10% Healing Bonus flat, unused by the formula, tracked for
 *  completeness only. Shorekeeper's own pick, character 1505. */
export const REJUV_5PC = new Gear("Rejuvenating Glow 5pc", (ctx) => { ctx.grantGlobal(REJUV_TEAM); });
export const REJUV_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(15, BonusAtk); return "Rejuvenating Glow"; });

export const REJUV_2PC = new Gear("Rejuvenating Glow 2pc", (ctx) => { ctx.add(10, HealingBonus); });

/** Fallacy, a generic HP-scaling spectro mainslot echo. Its cast grants the whole *rest* of the
 *  team (not the caster) +10% ATK, permanent uptime — same delivery shape as Freeze Frame's
 *  team buff (`grantOthers`, no revoke). `cast: ECHO` marks it as one even though it deals
 *  spectro echo damage. Shorekeeper's own pick, character 1505 — https://ww.nanoka.cc/character/1505 */
export const FALLACY_TEAM = new Buff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(10, BonusAtk); return "Fallacy of No Return"; });

export const ACTION_FALLACY = new Action("Echo: Fallacy of No Return", {
  cast: Cast.Echo,
  element: Spectro,
  scaling: Scaling.Hp,
  type: Echo,
  mv: 15.85,
  energy: 304,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    ctx.add(10, Er);          // the sheet assumes permanent uptime
    ctx.grantOthers(FALLACY_TEAM);
  },
});

export const FALLACY = new Mainslot("Fallacy of No Return", ACTION_FALLACY);

/* -------------------------------------------------------------------------------- Zhezhi, 1.2 */

/** Nightmare: Lampylumen Myriad, Zhezhi's own mainslot echo — she's the only glacio Coordinated
 *  Attack character, hence living here rather than as a truly generic piece. Flat Glacio/
 *  Coordinated Attack DMG Bonus for whoever wears it, no trigger. Zhezhi, character 1105,
 *  released 1.2 — https://ww.nanoka.cc/character/1105, https://ww.nanoka.cc/echo/6000105 */
export const ACTION_NM_LAMPY = new Action("Echo: Nightmare: Lampylumen Myriad", {
  cast: Cast.Echo,
  element: Glacio,
  scaling: Atk,
  type: Echo,
  mv: 273.6,
  energy: 380,
});
export const NM_LAMPY = new Mainslot("Nightmare: Lampylumen Myriad", ACTION_NM_LAMPY, (ctx) => {
  ctx.add(12, Glacio, DmgBonus);
  ctx.add(30, Type2.Coordinated, DmgBonus);
});

/** Empyrean Anthem, Zhezhi's own sonata (paired with Nightmare: Lampylumen Myriad above — the
 *  same Overlord Class echo also carries Frosty Resolve, Carlotta's own 2.0 pick, see
 *  echoes/rinascita.ts). 2pc: +10% ER flat. 5pc: +80% Coordinated Attack DMG Bonus, self only
 *  (the wearer's own Coordinated Attack hits, e.g. Cantarella's Diffusion, Zhezhi's own Inklit
 *  Spirits). A Coordinated Attack crit also grants the whole team +20% ATK for 4s, assumed
 *  unconditional uptime rather than gated on the crit itself (this calculator computes average
 *  damage, not per-hit crit rolls, same simplification precedent as Sanhua's S3) — and never
 *  revoked: a Coordinated Attack source worth building this sonata around (Zhezhi's own 21
 *  Inklit Spirits, one a second) re-triggers it well past the 21s mark, so per the standing
 *  duration rule it's permanent uptime once the first one lands. Still only lands on whoever's
 *  actually active, per the standing wording rule. */
export const EMPYREAN_ANTHEM_2PC = new Gear("Empyrean Anthem 2pc", (ctx) => { ctx.add(10, Er); });
export const EMPYREAN_ANTHEM_5PC = new Gear("Empyrean Anthem 5pc", (ctx) => {
  ctx.add(80, Type2.Coordinated, DmgBonus);
  // the trigger is the wearer's own Coordinated Attack landing, not just any of their casts
  if (ctx.action!.type2 === Type2.Coordinated) ctx.grantGlobal(EMPYREAN_ANTHEM_TEAM);
});
export const EMPYREAN_ANTHEM_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx) => {
  if (!ctx.action!.active) return;
  ctx.add(20, BonusAtk);
  return "Empyrean Anthem 5pc";
});

/* ------------------------------------------------------------------------------- Changli, 1.1 */

/** Molten Rift, Changli's own sonata — also reused by Encore's Inferno Rider mainslot below
 *  (both are cost-4 fusion Overlord Class echoes). 2pc: +10% Fusion DMG Bonus flat. 5pc: +30%
 *  Fusion DMG Bonus for 15s after Resonance Skill — short enough that only the standing
 *  outro-loss rule matters. Changli, character 1205, released 1.1 —
 *  https://ww.nanoka.cc/character/1205 */
export const MOLTEN_RIFT_2PC = new Gear("Molten Rift 2pc", (ctx) => { ctx.add(10, Fusion, DmgBonus); });
export const MOLTEN_RIFT_5PC = new Gear("Molten Rift 5pc", (ctx) => {
  if (isSkill(ctx.action!)) ctx.grantSelf(MOLTEN_RIFT_BUFF);
});
export const MOLTEN_RIFT_BUFF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(30, Fusion, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(MOLTEN_RIFT_BUFF);
  return "Molten Rift";
});

/** Nightmare: Inferno Rider, Changli's own mainslot echo — her Skill DMG is Fusion, so it lives
 *  here rather than as a truly generic piece. Flat Fusion/Skill DMG Bonus for whoever wears it,
 *  no trigger. https://ww.nanoka.cc/echo/6000091 */
export const ACTION_NM_INFERNO_RIDER = new Action("Echo: Nightmare: Inferno Rider", {
  cast: Cast.Echo,
  element: Fusion,
  scaling: Atk,
  type: Echo,
  mv: 405,
  energy: 562,
});
export const NM_INFERNO_RIDER = new Mainslot("Nightmare: Inferno Rider", ACTION_NM_INFERNO_RIDER, (ctx) => {
  ctx.add(12, Fusion, DmgBonus);
  ctx.add(12, DamageType.Skill, DmgBonus);
});

/* -------------------------------------------------------------------------------- Encore, 1.0 */

/** Inferno Rider (plain, not "Nightmare:") — Encore's own mainslot echo, by explicit
 *  instruction. Its own 3-hit combo, unlike most mainslot echoes, carries no permanent passive
 *  at all: casting it grants the caster a temporary +12%/+12% Fusion/Basic Attack DMG Bonus
 *  window instead (see the action's own apply()), same self-buff-on-cast shape as Bell-Borne
 *  Geochelone's own Shield. Encore, character 1203, released 1.0 (Tidal Chorus standard
 *  banner) — https://ww.nanoka.cc/character/1203 */
export const ACTION_INFERNO_RIDER = new Action("Echo: Inferno Rider", {
  cast: Cast.Echo,
  element: Fusion,
  scaling: Atk,
  type: Echo,
  mv: 505,
  energy: 1260,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(INFERNO_RIDER_WINDOW); },
});
export const INFERNO_RIDER_WINDOW = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(12, Fusion, DmgBonus);
  ctx.add(12, DamageType.Basic, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(INFERNO_RIDER_WINDOW);
  return "Inferno Rider";
});
export const INFERNO_RIDER = new Mainslot("Inferno Rider", ACTION_INFERNO_RIDER);

/* ------------------------------------------------------------------ Camellya 1.4 / Rover 1.0 */

/** Nightmare: Crownless, the shared Havoc mainslot echo for Camellya and Havoc Rover — both
 *  Basic-Attack-focused Havoc sword users. Its own hit, plus flat Havoc/Basic Attack DMG Bonus
 *  for whoever wears it, no trigger. https://ww.nanoka.cc/echo/6000090 */
export const ACTION_NM_CROWNLESS = new Action("Echo: Nightmare: Crownless", {
  cast: Cast.Echo,
  element: Havoc,
  scaling: Atk,
  type: Echo,
  mv: 264.6,
  energy: 367,
});
export const NM_CROWNLESS = new Mainslot("Nightmare: Crownless", ACTION_NM_CROWNLESS, (ctx) => {
  ctx.add(12, Havoc, DmgBonus);
  ctx.add(12, DamageType.Basic, DmgBonus);
});

/** Havoc Eclipse, the matching sonata (paired with Nightmare: Crownless above). 2pc: +10% Havoc
 *  DMG Bonus flat. 5pc: +7.5% Havoc DMG Bonus after Basic/Heavy Attack, up to 4 stacks, 15s each
 *  — short enough that only the standing outro-loss rule matters. */
export const HAVOC_ECLIPSE_2PC = new Gear("Havoc Eclipse 2pc", (ctx) => { ctx.add(10, Havoc, DmgBonus); });
export const HAVOC_ECLIPSE_5PC = new Gear("Havoc Eclipse 5pc", (ctx) => {
  const a = ctx.action!;
  if (a.type === DamageType.Basic || a.type === DamageType.Heavy) ctx.grantSelf(HAVOC_ECLIPSE_STACKS);
});
export const HAVOC_ECLIPSE_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(7.5 * stacks, Havoc, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(HAVOC_ECLIPSE_STACKS);
  return `Havoc Eclipse x${stacks}`;
}, 4);

/* --------------------------------------------------------- old Jinzhou sonatas, none in a build */

/** Lampylumen Myriad (plain, not "Nightmare:") — an old Havoc-Nightmare-predating Jinzhou-era
 *  mainslot echo. No mainslot equip bonus described on its own page (unlike most others) —
 *  the whole passive is on the caster's own Skill cast instead: each of its 3 hits grants a
 *  stacking +4% Glacio DMG Bonus / +4% Resonance Skill DMG Bonus for 15s, up to 3 stacks, same
 *  self-buff-on-cast shape as Bell-Borne Geochelone's own Shield. Not owned by any resonator
 *  implemented in this codebase yet — exported standalone.
 *  https://ww.nanoka.cc/echo/6000044 */
export const ACTION_LAMPYLUMEN_MYRIAD = new Action("Echo: Lampylumen Myriad", {
  cast: Cast.Echo, element: Glacio, scaling: Atk, type: Echo,
  mv: 667.20,   // 200.16%+200.16%+266.88%
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(LAMPYLUMEN_MYRIAD_STACKS, 3); },
});
export const LAMPYLUMEN_MYRIAD = new Mainslot("Lampylumen Myriad", ACTION_LAMPYLUMEN_MYRIAD);
export const LAMPYLUMEN_MYRIAD_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(4 * stacks, Glacio, DmgBonus);
  ctx.add(4 * stacks, DamageType.Skill, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(LAMPYLUMEN_MYRIAD_STACKS);
  return `Lampylumen Myriad x${stacks}`;
}, 3);

/** Freezing Frost, Lampylumen Myriad's own matching sonata. 2pc: +10% Glacio DMG Bonus flat.
 *  5pc: +10% Glacio DMG Bonus after Basic/Heavy Attack, up to 3 stacks, 15s each — short enough
 *  that only the standing outro-loss rule matters. */
export const FREEZING_FROST_2PC = new Gear("Freezing Frost 2pc", (ctx) => { ctx.add(10, Glacio, DmgBonus); });
export const FREEZING_FROST_5PC = new Gear("Freezing Frost 5pc", (ctx) => {
  const a = ctx.action!;
  if (a.type === DamageType.Basic || a.type === DamageType.Heavy) ctx.grantSelf(FREEZING_FROST_STACKS);
});
export const FREEZING_FROST_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(10 * stacks, Glacio, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(FREEZING_FROST_STACKS);
  return `Freezing Frost x${stacks}`;
}, 3);

/** Nightmare: Feilian Beringal — Sierra Gale's own real matching mainslot echo (renamed from
 *  the placeholder "generic 2.x" filing it had before — it's a Jinzhou-era set, not tied to
 *  Iuno's own 2.6 release; she just happens to reuse it, per the standing rule that gear works
 *  on whoever equips it). Its own hit (a first strike plus 5 lesser Whirlwind Beam ticks,
 *  lumped into one action same as every other multi-hit echo elsewhere), plus flat Aero/Heavy
 *  Attack DMG Bonus for whoever wears it, no trigger. https://ww.nanoka.cc/echo/6000086 */
export const ACTION_NM_FEILIAN_BERINGAL = new Action("Echo: Nightmare: Feilian Beringal", {
  cast: Cast.Echo, element: Aero, scaling: Atk, type: Echo,
  mv: 273.56,   // 164.16%+21.88%x5
});
export const NM_FEILIAN_BERINGAL = new Mainslot("Nightmare: Feilian Beringal", ACTION_NM_FEILIAN_BERINGAL, (ctx) => {
  ctx.add(12, Aero, DmgBonus);
  ctx.add(12, DamageType.Heavy, DmgBonus);
});

/** Sierra Gale, the matching sonata (paired with Nightmare: Feilian Beringal above). 2pc: +10%
 *  Aero DMG Bonus flat. 5pc: +30% Aero DMG Bonus for 15s after Intro Skill — short enough that
 *  only the standing outro-loss rule matters. Iuno's own pick (only the 2pc, see iuno.ts). */
export const SIERRA_GALE_2PC = new Gear("Sierra Gale 2pc", (ctx) => { ctx.add(10, Aero, DmgBonus); });
export const SIERRA_GALE_5PC = new Gear("Sierra Gale 5pc", (ctx) => {
  if (ctx.action!.cast === Cast.Intro) ctx.grantSelf(SIERRA_GALE_INTRO);
});
export const SIERRA_GALE_INTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(30, Aero, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(SIERRA_GALE_INTRO);
  return "Sierra Gale 5pc";
});

/** Jué — a Calamity Class (5-cost, not the usual 4-cost Overlord) Spectro mainslot echo. Its
 *  own cast (a rising strike, 5 lightning ticks, then two spiralling hits, lumped into one
 *  action) also grants Blessing of Time: +16% Resonance Skill DMG Bonus for 15s, and the
 *  wearer's own next Resonance Skill hit additionally deals 16% Spectro DMG once a second for
 *  the rest of that window — approximated as a flat re-add on the Skill hit itself rather than
 *  a real per-second tick, same shape as every other window-scaled bonus elsewhere. Not owned
 *  by any resonator implemented in this codebase yet — exported standalone.
 *  https://ww.nanoka.cc/echo/6000059 */
export const ACTION_JUE = new Action("Echo: Jué", {
  cast: Cast.Echo, element: Spectro, scaling: Atk, type: Echo,
  mv: 243.22,   // 48.64%+19.46%x5+48.64%x2
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(JUE_BLESSING); },
});
export const JUE = new Mainslot("Jué", ACTION_JUE);
export const JUE_BLESSING = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(16, DamageType.Skill, DmgBonus);
  if (isSkill(ctx.action!)) ctx.add(16, Spectro, DmgBonus);   // the per-second Spectro DoT, folded onto the hit itself
  if (isOutro(ctx.action!)) ctx.revoke(JUE_BLESSING);
  return "Jué: Blessing of Time";
});

/** Celestial Light, Jué's own matching sonata. 2pc: +10% Spectro DMG Bonus flat. 5pc: +30%
 *  Spectro DMG Bonus for 15s after Intro Skill — same shape as Sierra Gale's own 5pc. */
export const CELESTIAL_LIGHT_2PC = new Gear("Celestial Light 2pc", (ctx) => { ctx.add(10, Spectro, DmgBonus); });
export const CELESTIAL_LIGHT_5PC = new Gear("Celestial Light 5pc", (ctx) => {
  if (ctx.action!.cast === Cast.Intro) ctx.grantSelf(CELESTIAL_LIGHT_INTRO);
});
export const CELESTIAL_LIGHT_INTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(30, Spectro, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(CELESTIAL_LIGHT_INTRO);
  return "Celestial Light 5pc";
});

/** Mech Abomination — an Electro mainslot echo. Its own cast (a strike plus a Mech Waste
 *  summon that hits once then explodes, lumped into one action) also grants the caster +12%
 *  ATK for 15s — short enough that only the standing outro-loss rule matters. The summon's own
 *  explosion is described as scaling off "the Resonator's Outro Skill DMG", a per-character
 *  value with no general formula here — folded into the action's own flat MV instead of
 *  modelled as a live lookup. Not owned by any resonator implemented in this codebase yet —
 *  exported standalone. https://ww.nanoka.cc/echo/6000048 */
export const ACTION_MECH_ABOMINATION = new Action("Echo: Mech Abomination", {
  cast: Cast.Echo, element: Electro, scaling: Atk, type: Echo,
  mv: 528.64,   // 48.64%+320%+160%
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(MECH_ABOMINATION_ATK); },
});
export const MECH_ABOMINATION = new Mainslot("Mech Abomination", ACTION_MECH_ABOMINATION);
export const MECH_ABOMINATION_ATK = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(12, BonusAtk);
  if (isOutro(ctx.action!)) ctx.revoke(MECH_ABOMINATION_ATK);
  return "Mech Abomination";
});

/** Lingering Tunes, Mech Abomination's own matching sonata. 2pc: +10% ATK flat. 5pc: +5% ATK
 *  every 1.5s while on field, up to 4 stacks (modelled as granted outright since this engine
 *  has no per-1.5s clock — same "assumed always up" treatment as Rejuvenating Glow's own 5pc),
 *  plus +60% Outro Skill DMG Bonus, unused by the formula (Outro Skill DMG is just `type:
 *  Outro`, already covered by the flat ATK), tracked for completeness only. */
export const LINGERING_TUNES_2PC = new Gear("Lingering Tunes 2pc", (ctx) => { ctx.add(10, BonusAtk); });
export const LINGERING_TUNES_5PC = new Gear("Lingering Tunes 5pc", (ctx) => { ctx.add(20, BonusAtk); });
