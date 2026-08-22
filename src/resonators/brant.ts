/**
 * Brant — a fusion sword support/sub-DPS. Bravo (Forte gauge, forte1, max 100) builds off
 * Normal Attack/Resonance Skill/Intro hits; at 100, Resonance Skill is replaced by Returned
 * from Ashes (spends it all). Liberation opens Aflame (12s): doubles Bravo gain on mid-air
 * combo hits specifically — AFLAME's own body re-applies the same forte1 gain a second time
 * when it's up, rather than needing separate doubled-value action variants — and swaps his
 * ATK-from-Energy-Regen conversion (Theatrical Moment -> "My" Moment, a bigger per-% rate).
 *
 * Numbers from nanoka.cc (character 1206, https://ww.nanoka.cc/character/1206, weapon 21020036, echo 6000084). His mid-air combo
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
import { Buff, Action, Chain, PRIORITY } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { Ctx, ResonatorFactory } from "../state.js";
import { Stat, Element, Type1, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { DRAGON_OF_DIRGE, TIDEBREAKING_2PC, TIDEBREAKING_5PC } from "../echoes/rinascita.js";
import { UNFLICKERING_VALOR } from "../weapons/sword.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#a0522d";

/* --------------------------------------------------------------- resonator */

/** Trial by Fire and Tide (Inherent Skill): +15% Fusion DMG Bonus, on his mid-air combo stages
 *  specifically — placed on each of those actions directly below, rather than as a Gear-wide
 *  check, since it's their own passive, not a generic one. */
function midAirBonus(ctx: Ctx): void { ctx.add(15, Element.Fusion, Stat.DmgBonus); }

/** Theatrical Moment / "My" Moment: +12 ATK per 1% Energy Regen over 150%, capped at +1560
 *  (i.e. 280% ER) — doubled to +20 per 1%, capped at +2600 (same 280% ER cap), while Aflame is
 *  up. EARLY_CONVERSION so every ER contribution (gear, sonata, substats) has already landed. */
export const THEATRICAL_MOMENT = new Buff(PRIORITY.EARLY_CONVERSION, (ctx) => {
  const aflame = ctx.stacksOf(AFLAME) > 0;
  const perPoint = aflame ? 20 : 12;
  const cap = aflame ? 2600 : 1560;
  const over = Math.max(0, ctx.get(Stat.Er) - 150);
  ctx.add(Math.min(cap, perPoint * over), Stat.FlatAtk);
  return aflame ? 'Brant: "My" Moment' : "Brant: Theatrical Moment";
});

/** Aflame: 12s, opened by Liberation — lost after the outro action gains stats, per the
 *  standing short-duration rule. Also ends early the instant Returned from Ashes is cast while
 *  it's up, per the kit's own explicit rule (see FSkill below). Doubles Bravo gain specifically
 *  on Normal Attack (node: NORMAL, his mid-air combo) and Resonance Skill (node: SKILL, Anchors
 *  Aweigh!) hits, per the kit's own wording — not Intro — by re-granting the same forte1 amount
 *  a second time; the base gain already lands before this buff's body runs. */
export const AFLAME = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  const a = ctx.action!;
  if (isOutro(a)) { ctx.revoke(AFLAME); return; }
  if (a.node === Node.Normal || a.node === Node.Skill) ctx.gain(Resource.Forte1, a.forte1);
  return "Brant: Aflame";
});

/** His echoes: Dragon of Dirge mainslot, Tidebreaking Courage 5pc/2pc (echoes/rinascita.js) —
 *  Unflickering Valor (his own signature, weapons/sword.js) — leaning on the build's
 *  own "Key Stat: Energy Regen 280%" recommendation. */
const BRANT_LOADOUT = new Loadout(
  UNFLICKERING_VALOR, DRAGON_OF_DIRGE, TIDEBREAKING_5PC, TIDEBREAKING_2PC,
  mainstats("CR", "ER ER", "atk atk"), chem("atk", "basic"),
);

export class Brant extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Brant",
      Element.Fusion,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(11675, Stat.BaseHp);
        ctx.add(375, Stat.BaseAtk);
        ctx.add(1308, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(8, Stat.CritRate);
        ctx.add(12, Stat.BonusAtk);
      },
      (ctx) => { ctx.grantSelf(THEATRICAL_MOMENT); },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Brant(BRANT_LOADOUT);

/* ----------------------------------------------------------------- actions */

function brantAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Fusion,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- intro / outro
const Intro = brantAction("Intro: Applaud for Me!", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 253.49, energy: 0, concerto: 1000, forte1: 25,
});
const Outro = brantAction("Outro: The Course is Set!", {
  cast: Cast.Outro, mv: 0, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.outro(BRANT_OUTRO); },
});
export const BRANT_OUTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(BRANT_OUTRO);
  ctx.add(20, Element.Fusion, Stat.Amp);
  ctx.add(25, Type1.Skill, Stat.Amp);
  return "Brant: Outro";
});

// --- resonance skill: Anchors Aweigh!, and liberation: To the Horizon (opens Aflame)
const Skill = brantAction("Skill: Anchors Aweigh!", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 333.92, energy: 718, concerto: 1000, forte1: 7.93,
});
const Liberation = brantAction("Liberation: To the Horizon", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 680.45, energy: -17500, concerto: 2000,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(AFLAME); },
});

// --- forte circuit: Returned from Ashes, at 100 Bravo — considered Basic Attack DMG, spends
//     the whole gauge, and ends Aflame (if up) once it resolves. AUTO_ACTION so this row still
//     gets Aflame's own stats (e.g. THEATRICAL_MOMENT's "My Moment" rate) before it's revoked —
//     per the kit's own wording, casting this "ends [Aflame] after Returned from Ashes ends".
const FSkill = brantAction("Forte: Returned from Ashes", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Basic, mv: 1888.71, energy: 3000, concerto: 5000, forte1: -100,
  shields: 1,
  priority: PRIORITY.AUTO_ACTION,
  apply: (ctx) => { if (ctx.stacksOf(AFLAME)) ctx.revoke(AFLAME); },
});

// --- mid-air combo stages. Each carries Trial by Fire and Tide's own +15% Fusion DMG Bonus (see
//     midAirBonus above); forte1 is the base (un-doubled) Bravo gain — AFLAME doubles it live.
const MA1 = brantAction("Basic: Captain's Rhapsody (Mid-Air) 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 215.81, energy: 182, concerto: 728, forte1: 9.76, priority: PRIORITY.BUFF_STATS, apply: midAirBonus });
const MA1H = brantAction("Basic: Captain's Rhapsody (Mid-Air) 1 (Hold)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 548.29, energy: 496, concerto: 985, forte1: 21.95, priority: PRIORITY.BUFF_STATS, apply: midAirBonus });
const MA2 = brantAction("Basic: Captain's Rhapsody (Mid-Air) 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 262.79, energy: 252, concerto: 1008, forte1: 12.2, priority: PRIORITY.BUFF_STATS, apply: midAirBonus });
const MA2H = brantAction("Basic: Captain's Rhapsody (Mid-Air) 2 (Hold)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 460.01, energy: 546, concerto: 1092, forte1: 24.39, priority: PRIORITY.BUFF_STATS, apply: midAirBonus });
const MA3 = brantAction("Basic: Captain's Rhapsody (Mid-Air) 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 261.97, energy: 252, concerto: 1008, forte1: 13.41, priority: PRIORITY.BUFF_STATS, apply: midAirBonus });
const MA4 = brantAction("Basic: Captain's Rhapsody (Mid-Air) 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 253.85, energy: 378, concerto: 755, forte1: 9.76, priority: PRIORITY.BUFF_STATS, apply: midAirBonus });
export const MA12 = new Chain("Basic: Captain's Rhapsody (Mid-Air) 12", [MA1, MA2]);
export const MA234 = new Chain("Basic: Captain's Rhapsody (Mid-Air) 234", [MA2, MA3, MA4]);
export const MA2H34 = new Chain("Basic: Captain's Rhapsody (Mid-Air) 2H34", [MA2H, MA3, MA4]);
export const MA1234 = new Chain("Basic: Captain's Rhapsody (Mid-Air) 1234", [MA1, MA2, MA3, MA4]);
export const MA1H2H34 = new Chain("Basic: Captain's Rhapsody (Mid-Air) 1H2H34", [MA1H, MA2H, MA3, MA4]);

/** The sheet's `brant 1 anchor` rotation — identical to the sub rotation; the sheet's own extra
 *  entry there is just a Tune Break note, which the engine's own auto-tune-break watcher
 *  already handles without a placed action. */
export const ROTATION_1_ANCHOR = [
    Liberation, MA1H2H34, FSkill, Outro,
];
