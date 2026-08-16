/**
 * Brant — a fusion sword support/sub-DPS. Bravo (Forte gauge, forte1, max 100) builds off
 * Normal Attack/Resonance Skill/Intro hits; at 100, Resonance Skill is replaced by Returned
 * from Ashes (spends it all). Liberation opens Aflame (12s): doubles Bravo gain on mid-air
 * combo hits specifically — AFLAME's own body re-applies the same forte1 gain a second time
 * when it's up, rather than needing separate doubled-value action variants — and swaps his
 * ATK-from-Energy-Regen conversion (Theatrical Moment -> "My" Moment, a bigger per-% rate).
 *
 * Numbers from nanoka.cc (character 1206, weapon 21020036, echo 6000084). His mid-air combo
 * (4 basic stages, each with a charged/held variant) is nanoka's own per-hit table, each stage
 * its own Action; MA12, MA234, MA1H2H34, etc. are Chains grouping those stages for display —
 * cross-checked against the migrated sheet's own pre-built combo multipliers, which sum to the
 * same totals (e.g. MA1H2H34 = MA1-charged + MA2-charged + MA3 + MA4, to the hundredth of a
 * percent).
 *
 * Interlude Applause (Intro makes the next Mid-air Attack start at stage 2) isn't modelled —
 * every rotation below goes straight from Intro into Liberation, so it never actually has a
 * mid-air attack to apply to.
 *
 * Healing (Waves of Acclaims, Voyager's Blaze, and Liberation's own heal) is out of scope for
 * this calculator, per the standing rule. Returned from Ashes' shield (4750 + 17.1 per 1% Energy
 * Regen, 30s) is the same kind of defensive stat, so its HP value is likewise not modelled — but
 * it's still flagged via `shields: 1` on FSkill below, since that's just a count of shield-
 * granting events for whichever teammate's own kit reacts to it (see Iuno/Jingran).
 */
import { Buff, Gear, Action, Chain, PRIORITY } from "../kit.js";
import type { ActionDef } from "../kit.js";
import {
  add, get, gain, grantSelf, stacksOf, revoke, outro, isOutro, isLiberation,
} from "../state.js";
import { Stat, Element, DamageType, Node, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* --------------------------------------------------------------- resonator */

export const BRANT = new Gear(() => {
  add(100, Stat.Er);
  add(5, Stat.CritRate);
  add(150, Stat.CritDmg);

  add(11675, Stat.BaseHp);
  add(375, Stat.BaseAtk);
  add(1308, Stat.BaseDef);
  add(8, Stat.CritRate);
  add(12, Stat.BonusAtk);

  return "Brant";
}, () => { grantSelf(THEATRICAL_MOMENT); }, Element.Fusion, () => Intro);

/** Trial by Fire and Tide (Inherent Skill): +15% Fusion DMG Bonus, on his mid-air combo stages
 *  specifically — placed on each of those actions directly below, rather than as a Gear-wide
 *  check, since it's their own passive, not a generic one. */
function midAirBonus(): void { add(15, Element.Fusion, Stat.DmgBonus); }

/** Theatrical Moment / "My" Moment: +12 ATK per 1% Energy Regen over 150%, capped at +1560
 *  (i.e. 280% ER) — doubled to +20 per 1%, capped at +2600 (same 280% ER cap), while Aflame is
 *  up. EARLY_CONVERSION so every ER contribution (gear, sonata, substats) has already landed. */
export const THEATRICAL_MOMENT = new Buff(PRIORITY.EARLY_CONVERSION, () => {
  const aflame = stacksOf(AFLAME) > 0;
  const perPoint = aflame ? 20 : 12;
  const cap = aflame ? 2600 : 1560;
  const over = Math.max(0, get(Stat.Er) - 150);
  add(Math.min(cap, perPoint * over), Stat.FlatAtk);
  return aflame ? 'Brant: "My" Moment' : "Brant: Theatrical Moment";
});

/** Aflame: 12s, opened by Liberation — lost after the outro action gains stats, per the
 *  standing short-duration rule. Also ends early the instant Returned from Ashes is cast while
 *  it's up, per the kit's own explicit rule (see FSkill below). Doubles Bravo gain specifically
 *  on Normal Attack (node: NORMAL, his mid-air combo) and Resonance Skill (node: SKILL, Anchors
 *  Aweigh!) hits, per the kit's own wording — not Intro — by re-granting the same forte1 amount
 *  a second time; the base gain already lands before this buff's body runs. */
export const AFLAME = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  if (isOutro(a)) { revoke(AFLAME); return; }
  if (a.node === Node.Normal || a.node === Node.Skill) gain(Resource.Forte1, a.forte1);
  return "Brant: Aflame";
});

/* ------------------------------------------------------------------ weapon */

/** Unflickering Valor, R1: Laughter Prevails. +8% Crit Rate flat. Two independent, stackable
 *  +24% Basic Attack DMG Bonus instances — casting Liberation grants one (10s), dealing Basic
 *  Attack DMG grants the other (4s); both up at once is +48%, not capped to one. Both short
 *  enough that only the standing outro-loss rule matters for either. */
export const UNFLICKERING_VALOR = new Gear((stacks, a) => {
  add(413, Stat.BaseAtk);
  add(77.04, Stat.Er);
  add(8, Stat.CritRate);
  if (isLiberation(a)) grantSelf(LAUGHTER_PREVAILS_LIB);
  if (a.type === DamageType.Basic) grantSelf(LAUGHTER_PREVAILS_BASIC);
  return "Unflickering Valor";
});

export const LAUGHTER_PREVAILS_LIB = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  add(24, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(a)) revoke(LAUGHTER_PREVAILS_LIB);
  return "Unflickering Valor: Laughter Prevails (Liberation)";
});

export const LAUGHTER_PREVAILS_BASIC = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  add(24, DamageType.Basic, Stat.DmgBonus);
  if (isOutro(a)) revoke(LAUGHTER_PREVAILS_BASIC);
  return "Unflickering Valor: Laughter Prevails (Basic Attack)";
});

/* -------------------------------------------------------------- echo, sonata */

/** Dragon of Dirge, his mainslot echo — flat Fusion/Basic Attack DMG Bonus for whoever wears it,
 *  no trigger. */
export const DRAGON_OF_DIRGE = new Gear(() => {
  add(12, Element.Fusion, Stat.DmgBonus);
  add(12, DamageType.Basic, Stat.DmgBonus);
  return "Dragon of Dirge";
});

/** The echo's own cast (Grief Rift): a 5s, 25s-cooldown periodic zone with no real per-second
 *  clock here, so — matching Cantarella's Diffusion / Phrolova's Hecate cycle — this is just
 *  the one tick nanoka actually gives a number for, not placed in any rotation below (none of
 *  the migrated ones use it either). */
export const ACTION_DRAGON_OF_DIRGE = new Action("Echo: Dragon of Dirge", {
  cast: DamageType.Echo, element: Element.Fusion, scaling: Scaling.Atk, type: DamageType.Echo, mv: 36.81, energy: 0.51,
});

export const TIDEBREAKING_2PC = new Gear(() => { add(10, Stat.Er); return "Tidebreaking Courage 2pc"; });

/** Tidebreaking Courage 5pc: +15% ATK flat, and +30% (unscoped) DMG Bonus once Energy Regen
 *  actually reaches 250% — a real threshold read off the total, not assumed. EARLY_CONVERSION
 *  (overriding Gear's default GEAR_STATS) so every other ER contribution — the 2pc, mainstats,
 *  substats, all listed after this piece in the loadout — has already landed before it reads
 *  `get(ER)`. */
export const TIDEBREAKING_5PC = new Gear(() => {
  add(15, Stat.BonusAtk);
  if (get(Stat.Er) >= 250) add(30, Stat.DmgBonus);
  return "Tidebreaking Courage 5pc";
}, null, null, null, PRIORITY.EARLY_CONVERSION);

/** His echoes: Dragon of Dirge mainslot, Tidebreaking Courage 5pc/2pc — leaning on the build's
 *  own "Key Stat: Energy Regen 280%" recommendation. */
export const LOADOUT = [
  BRANT, UNFLICKERING_VALOR, DRAGON_OF_DIRGE, TIDEBREAKING_5PC, TIDEBREAKING_2PC,
  mainstats("CR", "ER ER", "atk atk"),
  chem("atk", "basic"),
];

/* ----------------------------------------------------------------- actions */

function brantAction(name: string, def: ActionDef): Action {
  return new Action(`Brant: ${name}`, {
    element: Element.Fusion,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- intro / outro
const Intro = brantAction("Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Intro, mv: 253.49, energy: 0, concerto: 10, forte1: 25,
});
const Outro = brantAction("Outro", {
  cast: DamageType.Outro, type: DamageType.Outro, mv: 0, concerto: -100, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { outro(BRANT_OUTRO); },
});
export const BRANT_OUTRO = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  if (isOutro(a)) revoke(BRANT_OUTRO);
  add(20, Element.Fusion, Stat.Amp);
  add(25, DamageType.Skill, Stat.Amp);
  return "Brant: Outro";
});

// --- resonance skill: Anchors Aweigh!, and liberation: To the Horizon (opens Aflame)
const Skill = brantAction("Skill", {
  node: Node.Skill, cast: DamageType.Skill, type: DamageType.Skill, mv: 333.92, energy: 7.18, concerto: 10, forte1: 7.93,
});
const Liberation = brantAction("Liberation", {
  node: Node.Liberation, cast: DamageType.Liberation, type: DamageType.Liberation, mv: 680.45, energy: -175, concerto: 20,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { grantSelf(AFLAME); },
});

// --- forte circuit: Returned from Ashes, at 100 Bravo — considered Basic Attack DMG, spends
//     the whole gauge, and ends Aflame (if up) once it resolves. AUTO_ACTION so this row still
//     gets Aflame's own stats (e.g. THEATRICAL_MOMENT's "My Moment" rate) before it's revoked —
//     per the kit's own wording, casting this "ends [Aflame] after Returned from Ashes ends".
const FSkill = brantAction("Forte Skill", {
  node: Node.Forte, cast: DamageType.Skill, type: DamageType.Basic, mv: 1888.71, energy: 30, concerto: 50, forte1: -100,
  shields: 1,
  priority: PRIORITY.AUTO_ACTION,
  apply: () => { if (stacksOf(AFLAME)) revoke(AFLAME); },
});

// --- mid-air combo stages. Each carries Trial by Fire and Tide's own +15% Fusion DMG Bonus (see
//     midAirBonus above); forte1 is the base (un-doubled) Bravo gain — AFLAME doubles it live.
const MA1 = brantAction("Midair 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 215.81, energy: 1.82, concerto: 7.28, forte1: 9.76, priority: PRIORITY.BUFF_STATS, apply: midAirBonus });
const MA1H = brantAction("Midair 1 Hold", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 548.29, energy: 4.96, concerto: 9.85, forte1: 21.95, priority: PRIORITY.BUFF_STATS, apply: midAirBonus });
const MA2 = brantAction("Midair 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 262.79, energy: 2.52, concerto: 10.08, forte1: 12.2, priority: PRIORITY.BUFF_STATS, apply: midAirBonus });
const MA2H = brantAction("Midair 2 Hold", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 460.01, energy: 5.46, concerto: 10.92, forte1: 24.39, priority: PRIORITY.BUFF_STATS, apply: midAirBonus });
const MA3 = brantAction("Midair 3", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 261.97, energy: 2.52, concerto: 10.08, forte1: 13.41, priority: PRIORITY.BUFF_STATS, apply: midAirBonus });
const MA4 = brantAction("Midair 4", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 253.85, energy: 3.78, concerto: 7.55, forte1: 9.76, priority: PRIORITY.BUFF_STATS, apply: midAirBonus });
export const MA12 = new Chain("Brant: Midair 12", [MA1, MA2]);
export const MA234 = new Chain("Brant: Midair 234", [MA2, MA3, MA4]);
export const MA2H34 = new Chain("Brant: Midair 2Hold34", [MA2H, MA3, MA4]);
export const MA1234 = new Chain("Brant: Midair 1234", [MA1, MA2, MA3, MA4]);
export const MA1H2H34 = new Chain("Brant: Midair 1Hold2Hold34", [MA1H, MA2H, MA3, MA4]);

/** The sheet's `brant 1 anchor` rotation — identical to the sub rotation; the sheet's own extra
 *  entry there is just a Tune Break note, which the engine's own auto-tune-break watcher
 *  already handles without a placed action. */
export const ROTATION_1_ANCHOR = [
    Liberation, MA1H2H34, FSkill, Outro,
];
