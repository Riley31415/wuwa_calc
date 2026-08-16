/** Standard mainslot echoes and sonatas usable by more than one resonator — the mainslot/sonata
 *  equivalent of weapons.ts. Each resonator's own file picks which of these its loadout equips.
 *  Casts with their own dedicated Action (Bell-Borne, Heron, Fallacy) override `color` to WHITE
 *  or GREEN instead of inheriting whoever's wearing them, same reasoning as their generic gear. */
import { isOutro } from "../state.js";
import { Buff, GlobalBuff, Gear, Action, PRIORITY, WHITE, GREEN } from "../kit.js";
import { DamageType, Element, Scaling, Stat } from "../stats.js";
const { Echo } = DamageType;
const { Glacio, Havoc, Aero, Spectro } = Element;
const { Def, Atk, Hp } = Scaling;
const { DmgBonus, BonusAtk, Er, HealingBonus } = Stat;

/**
 * Bell-Borne Geochelone, a 5-cost mainslot echo. No passive from merely equipping it — the
 * whole effect is on its Skill cast: Glacio DMG off 145.92% of the caster's own DEF, plus
 * "Bell-Borne Shield" for the team — not a real shield, just the buff's name (DMG Reduction
 * itself is out of scope for a DPS calculator, so only the +10% DMG Bonus half is modelled).
 * Modelled as a 2-stack global buff rather than its real 15s timer / "3 hits" counter: a stack
 * is lost on any teammate's outro, so a fresh cast survives one outro before wearing off on
 * the next, matching "basically lasts until the next character outros".
 */
export const BELL_BORNE_GEOCHELONE = new Gear(() => "Bell-Borne Geochelone");

export const ACTION_BELL_BORNE = new Action("Echo: Bell-Borne Geochelone", {
  color: WHITE,
  cast: Echo,
  element: Glacio,
  scaling: Def,
  type: Echo,
  mv: 145.92,
  energy: 4.55,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(BELL_BORNE_SHIELD, 2); },
});

export const BELL_BORNE_SHIELD = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(10, DmgBonus);
  if (isOutro(ctx.action!)) ctx.removeStack(BELL_BORNE_SHIELD, 1);
  return `Bell-Borne Geochelone: Bell-Borne Shield`;
}, 2);

/** Impermanence Heron, a generic mainslot echo — its own hit, plus: if the wielder casts their
 *  Outro within its own primed window, the incoming resonator gets +12% (unscoped) DMG Bonus
 *  for 15s. Both windows short enough for the standing outro-loss rule. */
export const HERON = new Gear((ctx) => {
  if (isOutro(ctx.action!) && ctx.stacksOf(HERON_PRIMED)) { ctx.outro(HERON_HANDOFF); ctx.revoke(HERON_PRIMED); }
  return "Impermanence Heron";
});

export const HERON_PRIMED = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(HERON_PRIMED);
  return "Impermanence Heron";
});

export const HERON_HANDOFF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(HERON_HANDOFF);
  ctx.add(12, DmgBonus);
  return "Impermanence Heron: Outro";
});

/** The echo's own cast — the "fly up and smack down" hit; the held flame-spit follow-up isn't
 *  modelled, same as other echoes' periodic/charged variants elsewhere in this codebase. Also
 *  primes the Outro handoff above. */
export const ACTION_HERON = new Action("Echo: Heron", {
  color: WHITE, cast: Echo, element: Havoc, scaling: Atk, type: Echo,
  mv: 310.56, energy: 4.85,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(HERON_PRIMED); },
});

/** Moonlit Clouds, a generic sonata. 2pc: +10% ER flat. 5pc: on Outro, the incoming resonator
 *  gets +22.5% ATK for 15s — same outro-handoff shape as Heron above, but unconditional. */
export const MOONLIT_CLOUDS_2PC = new Gear((ctx) => { ctx.add(10, Er); return "Moonlit Clouds 2pc"; });

export const MOONLIT_CLOUDS_5PC = new Gear((ctx) => {
  if (isOutro(ctx.action!)) ctx.outro(MOONLIT_CLOUDS_HANDOFF);
  return "Moonlit Clouds 5pc";
});

export const MOONLIT_CLOUDS_HANDOFF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(22.5, BonusAtk);
  if (isOutro(ctx.action!)) ctx.revoke(MOONLIT_CLOUDS_HANDOFF);
  return "Moonlit Clouds 5pc: Outro";
});

/** Fallacy, a generic HP-scaling spectro mainslot echo. Its cast grants the whole *rest* of the
 *  team (not the caster) +10% ATK, permanent uptime — same delivery shape as Freeze Frame's
 *  team buff (`grantOthers`, no revoke). `cast: ECHO` marks it as one even though it deals
 *  spectro echo damage. */
export const FALLACY = new Gear(() => "Fallacy of No Return");
export const FALLACY_TEAM = new Buff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(10, BonusAtk); return "Fallacy of No Return"; });

export const ACTION_FALLACY = new Action("Echo: Fallacy", {
  color: GREEN,
  cast: Echo,
  element: Spectro,
  scaling: Hp,
  type: Echo,
  mv: 15.85,
  energy: 3.04,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    ctx.add(10, Er);          // the sheet assumes permanent uptime
    ctx.grantOthers(FALLACY_TEAM);
  },
});

/** Rejuvenating Glow, a generic sonata. 5pc: +15% ATK flat, team-wide (its real "on healing
 *  ally" trigger is unconditional here — healing itself is out of scope, so it's modelled as
 *  always up once equipped). 2pc: +10% Healing Bonus flat, unused by the formula, tracked for
 *  completeness only. */
export const REJUV_5PC = new Gear((ctx) => { ctx.grantGlobal(REJUV_TEAM); return "Rejuvenating Glow 5pc"; });
export const REJUV_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(15, BonusAtk); return "Rejuvenating Glow"; });

export const REJUV_2PC = new Gear((ctx) => { ctx.add(10, HealingBonus); return "Rejuvenating Glow 2pc"; });

/** Sierra Gale 2pc, a generic sonata — Iuno's aero 2pc: +10% Aero DMG Bonus flat. */
export const SIERRA_2PC = new Gear((ctx) => { ctx.add(10, Aero, DmgBonus); return "Sierra Gale 2pc"; });
