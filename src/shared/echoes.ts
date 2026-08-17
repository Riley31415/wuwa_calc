/** Standard mainslot echoes and sonatas usable by more than one resonator — the mainslot/sonata
 *  equivalent of weapons.ts. Each resonator's own file picks which of these its loadout equips.
 *  Casts with their own dedicated Action (Bell-Borne, Heron, Fallacy) override `color` to WHITE
 *  or GREEN instead of inheriting whoever's wearing them, same reasoning as their generic gear. */
import { isOutro, isSkill, isLiberation } from "../state.js";
import { Buff, GlobalBuff, Gear, Mainslot, Action, PRIORITY, WHITE, GREEN } from "../kit.js";
import { DamageType, Element, Scaling, Stat, Type2 } from "../stats.js";
const { Echo } = DamageType;
const { Glacio, Havoc, Aero, Spectro, Electro } = Element;
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
export const ACTION_BELL_BORNE = new Action("Echo: Bell-Borne Geochelone", {
  color: WHITE,
  cast: Echo,
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
 *  for 15s. Both windows short enough for the standing outro-loss rule. */
/** The echo's own cast — the "fly up and smack down" hit; the held flame-spit follow-up isn't
 *  modelled, same as other echoes' periodic/charged variants elsewhere in this codebase. Also
 *  primes the Outro handoff below. */
export const ACTION_HERON = new Action("Echo: Heron", {
  color: WHITE, cast: Echo, element: Havoc, scaling: Atk, type: Echo,
  mv: 310.56, energy: 485,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(HERON_PRIMED); },
});

export const HERON = new Mainslot("Impermanence Heron", ACTION_HERON, (ctx) => {
  if (isOutro(ctx.action!) && ctx.stacksOf(HERON_PRIMED)) { ctx.outro(HERON_HANDOFF); ctx.revoke(HERON_PRIMED); }
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

/** Moonlit Clouds, a generic sonata. 2pc: +10% ER flat. 5pc: on Outro, the incoming resonator
 *  gets +22.5% ATK for 15s — same outro-handoff shape as Heron above, but unconditional. */
export const MOONLIT_CLOUDS_2PC = new Gear("Moonlit Clouds 2pc", (ctx) => { ctx.add(10, Er); });

export const MOONLIT_CLOUDS_5PC = new Gear("Moonlit Clouds 5pc", (ctx) => {
  if (isOutro(ctx.action!)) ctx.outro(MOONLIT_CLOUDS_HANDOFF);
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
export const FALLACY_TEAM = new Buff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(10, BonusAtk); return "Fallacy of No Return"; });

export const ACTION_FALLACY = new Action("Echo: Fallacy", {
  color: GREEN,
  cast: Echo,
  element: Spectro,
  scaling: Hp,
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

/** Rejuvenating Glow, a generic sonata. 5pc: +15% ATK flat, team-wide (its real "on healing
 *  ally" trigger is unconditional here — healing itself is out of scope, so it's modelled as
 *  always up once equipped). 2pc: +10% Healing Bonus flat, unused by the formula, tracked for
 *  completeness only. */
export const REJUV_5PC = new Gear("Rejuvenating Glow 5pc", (ctx) => { ctx.grantGlobal(REJUV_TEAM); });
export const REJUV_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(15, BonusAtk); return "Rejuvenating Glow"; });

export const REJUV_2PC = new Gear("Rejuvenating Glow 2pc", (ctx) => { ctx.add(10, HealingBonus); });

/** Sierra Gale 2pc, a generic sonata — Iuno's aero 2pc: +10% Aero DMG Bonus flat. */
export const SIERRA_2PC = new Gear("Sierra Gale 2pc", (ctx) => { ctx.add(10, Aero, DmgBonus); });

/** Void Thunder, a generic sonata. 2pc: +10% Electro DMG Bonus flat. 5pc: +30% Electro DMG
 *  Bonus flat (its real trigger is unconditional here — same "assumed always up" treatment as
 *  Rejuvenating Glow's own 5pc above). */
export const VOID_THUNDER_2PC = new Gear("Void Thunder 2pc", (ctx) => { ctx.add(10, Electro, DmgBonus); });
export const VOID_THUNDER_5PC = new Gear("Void Thunder 5pc", (ctx) => { ctx.add(30, Electro, DmgBonus); });

/** Empyrean Anthem, a generic sonata. 2pc: +10% ER flat. 5pc: +80% Coordinated Attack DMG
 *  Bonus, self only (the wearer's own Coordinated Attack hits, e.g. Cantarella's Diffusion,
 *  Zhezhi's own Inklit Spirits). A Coordinated Attack crit also grants the whole team +20% ATK
 *  for 4s, assumed unconditional uptime rather than gated on the crit itself (this calculator
 *  computes average damage, not per-hit crit rolls, same simplification precedent as Sanhua's
 *  S3) — and never revoked: a Coordinated Attack source worth building this sonata around
 *  (Zhezhi's own 21 Inklit Spirits, one a second) re-triggers it well past the 21s mark, so
 *  per the standing duration rule it's permanent uptime once the first one lands. Still only
 *  lands on whoever's actually active, per the standing wording rule. */
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

/** Frosty Resolve, a generic sonata (the same Overlord Class echo as Empyrean Anthem — Sentry
 *  Construct/Nightmare: Lampylumen Myriad, both cost-4 Overlords, can carry either set). 2pc:
 *  +12% Resonance Skill DMG Bonus flat. 5pc: a Resonance Skill cast (either form) grants +22.5%
 *  Glacio DMG Bonus for 15s (short window, standard outro-loss handling); a Resonance Liberation
 *  cast separately grants +18% Resonance Skill DMG Bonus for 5s, up to 2 stacks. */
export const FROSTY_RESOLVE_2PC = new Gear("Frosty Resolve 2pc", (ctx) => { ctx.add(12, DamageType.Skill, DmgBonus); });
export const FROSTY_RESOLVE_5PC = new Gear("Frosty Resolve 5pc", (ctx) => {
  if (isSkill(ctx.action!)) ctx.grantSelf(FROSTY_RESOLVE_GLACIO);
  if (isLiberation(ctx.action!)) ctx.grantSelf(FROSTY_RESOLVE_SKILL_DMG);
});
export const FROSTY_RESOLVE_GLACIO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(22.5, Glacio, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(FROSTY_RESOLVE_GLACIO);
  return "Frosty Resolve 5pc";
});
export const FROSTY_RESOLVE_SKILL_DMG = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(18 * stacks, DamageType.Skill, DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(FROSTY_RESOLVE_SKILL_DMG);
  return `Frosty Resolve 5pc x${stacks}`;
}, 2);
