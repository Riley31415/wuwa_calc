/**
 * Changli — a fusion sword main DPS. True Sight (12s, opened by Basic Attack Stage 4/Mid-air
 * Attack Stage 4/Resonance Skill/Intro) lets her next Basic Attack — ground or mid-air/jump —
 * become True Sight: Conquest/Charge instead, both Resonance Skill DMG and both banking a stack
 * of Enflamement (max 4, also granted outright x4 by Liberation). Heavy Attack at 4 Enflamement
 * becomes Flaming Sacrifice, spending them all.
 *
 * Numbers from nanoka.cc (character 1205, https://ww.nanoka.cc/character/1205, weapon 21020016) and wuwalab.com (registered,
 * cross-checked exactly), plus the migrated sheet for energy/concerto (offtune isn't given by
 * either, so it's left at 0 throughout — matching the same gap other kits have for it alone).
 * Mainslot echo and sonata are Molten Rift (Nightmare: Inferno Rider), by explicit instruction.
 */
import { Buff, GlobalBuff, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, Type1, Node, Cast, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { NM_INFERNO_RIDER, MOLTEN_RIFT_2PC, MOLTEN_RIFT_5PC } from "../echoes/jinzhou.js";
import { BLAZING_BRILLIANCE } from "../weapons/sword.js";

/** This resonator's own color. */
export const COLOR = "#f38b68";

/** Enflamement is the gauge the game shows — up to 4, spent entirely by Flaming Sacrifice. */
export const CHANGLI_ENFLAMEMENT = Resource.Forte1;

/* --------------------------------------------------------------- resonator */

/** True Sight: opened by Basic Attack Stage 4, Mid-air Attack Stage 4, Resonance Skill, or
 *  Intro — 12s, so per the standing duration rule this reads as permanent uptime once granted,
 *  but it's still explicitly ended by whichever of Conquest/Charge actually spends it (matching
 *  the kit's own "ends on release" wording), same shape as Sigrika's Decipher. */
export const TRUE_SIGHT = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(TRUE_SIGHT);
  return "Changli: True Sight";
});

/** Secret Strategist (Inherent Skill): each Enflamement stack held grants +5% Fusion DMG Bonus
 *  on True Sight: Conquest/Charge specifically. */
export const SECRET_STRATEGIST = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  const a = ctx.action!;
  if (a !== TrueSightConquest && a !== TrueSightCharge) return;
  ctx.add(5 * ctx.counter(CHANGLI_ENFLAMEMENT), Element.Fusion, Stat.DmgBonus);
  return "Changli: Secret Strategist";
});

/** Fiery Feather: Radiance of Fealty grants a 10s window (short — lost after the outro action
 *  gains stats) where the next Flaming Sacrifice gets +25% ATK. One-shot: consumed the instant
 *  Flaming Sacrifice lands, same shape as Sanhua's own Blade Mastery window. */
export const FIERY_FEATHER = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  const a = ctx.action!;
  if (a === FlamingSacrifice) ctx.add(25, Stat.BonusAtk);
  if (a === FlamingSacrifice || isOutro(a)) ctx.revoke(FIERY_FEATHER);
  return "Changli: Fiery Feather";
});

/** Changli's own outro window: Strategy of Duality. */
export const CHANGLI_OUTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(CHANGLI_OUTRO);
  ctx.add(20, Element.Fusion, Stat.Amp);
  ctx.add(25, Type1.Liberation, Stat.Amp);
  return "Changli: Strategy of Duality";
});

/** Her echoes: Nightmare: Inferno Rider mainslot, full 5pc Molten Rift (both echoes/jinzhou.js —
 *  Molten Rift is also reused by Encore's own Inferno Rider mainslot there); Blazing Brilliance
 *  (her own signature) lives in weapons/sword.js. 43311 crit-rate build. */
const CHANGLI_LOADOUT = new Loadout(
  BLAZING_BRILLIANCE, NM_INFERNO_RIDER, MOLTEN_RIFT_5PC, MOLTEN_RIFT_2PC,
  mainstats("CR", "fusion fusion", "atk atk"), chem("atk", "skill"),
);

export class Changli extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Changli",
      Element.Fusion,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(12762, Stat.BaseHp);
        ctx.add(410, Stat.BaseAtk);
        ctx.add(1181, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(8, Stat.CritRate);
        ctx.add(12, Stat.BonusAtk);
      },
      (ctx) => { ctx.grantSelf(SECRET_STRATEGIST); },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Changli(CHANGLI_LOADOUT);

/* ----------------------------------------------------------------- actions */

function changliAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Fusion,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, dodge counter, heavy (Blazing Enlightment). Stage 4 opens True Sight.
const BA1 = changliAction("Basic: Blazing Enlightment 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 58.98, energy: 88, concerto: 176 });
const BA2 = changliAction("Basic: Blazing Enlightment 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 70.98, energy: 106, concerto: 210 });
const BA3 = changliAction("Basic: Blazing Enlightment 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 109.35, energy: 162, concerto: 324 });
const BA4 = changliAction("Basic: Blazing Enlightment 4", {
  node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 169.02, energy: 251, concerto: 502,
  priority: PRIORITY.BUFF_STATS, apply(ctx) { ctx.grantSelf(TRUE_SIGHT); },
});
const DC = changliAction("Basic: Blazing Enlightment 3 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 247.92, energy: 312, concerto: 624 });
const HA = changliAction("Heavy: Blazing Enlightment", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 124.24, energy: 185, concerto: 369 });

export const BA1234 = new Chain("Basic: Blazing Enlightment 1234", [BA1, BA2, BA3, BA4]);

// --- mid-air basics, mid-air heavy — the same combo, airborne. Stage 4 also opens True Sight.
const MA1 = changliAction("Basic: Blazing Enlightment 1 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 61.35, energy: 91, concerto: 182 });
const MA2 = changliAction("Basic: Blazing Enlightment 2 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 101.74, energy: 152, concerto: 302 });
const MA3 = changliAction("Basic: Blazing Enlightment 3 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 132.00, energy: 198, concerto: 393 });
const MA4 = changliAction("Basic: Blazing Enlightment 4 (Mid-Air)", {
  node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 126.75, energy: 189, concerto: 377,
  priority: PRIORITY.BUFF_STATS, apply(ctx) { ctx.grantSelf(TRUE_SIGHT); },
});
export const MHA = changliAction("Heavy: Blazing Enlightment (Mid-air)", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 123.27, energy: 155, concerto: 100 });

export const MA1234 = new Chain("Basic: Blazing Enlightment 1234 (Mid-Air)", [MA1, MA2, MA3, MA4]);

// --- True Sight's own finishers: Conquest (ground Basic), Charge (jump/mid-air Basic) — both
//     Resonance Skill DMG, both bank a stack of Enflamement and end True Sight
const TrueSightConquest = changliAction("True Sight: Conquest", {
  node: Node.Skill, cast: Cast.Basic, type: Type1.Skill, mv: 294.73, energy: 420, concerto: 700, forte1: 1,
  priority: PRIORITY.UPDATE_BUFFS, apply(ctx) { ctx.revoke(TRUE_SIGHT); },
});
const TrueSightCharge = changliAction("True Sight: Charge", {
  node: Node.Skill, cast: Cast.Basic, type: Type1.Skill, mv: 181.70, energy: 257, concerto: 600, forte1: 1,
  priority: PRIORITY.UPDATE_BUFFS, apply(ctx) { ctx.revoke(TRUE_SIGHT); },
});

// --- resonance skill: Tripartite Flames — also opens True Sight: Capture (bundled into the
//     one hit's own total per wuwalab, not a separate press)
const Skill = changliAction("Skill: Tripartite Flames", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 409.40, energy: 800, concerto: 1400,
  priority: PRIORITY.BUFF_STATS, apply(ctx) { ctx.grantSelf(TRUE_SIGHT); },
});

// --- forte circuit: Flaming Sacrifice, at 4 Enflamement — Sweeping Force's own +20% Fusion DMG
//     Bonus / 15% DEF ignore pays on this same hit (no separate lingering buff, see file header)
const FlamingSacrifice = changliAction("Forte: Flaming Sacrifice", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Skill, mv: 654.10, energy: 661, concerto: 1000, forte1: -4,
  priority: PRIORITY.BUFF_STATS,
  apply(ctx) { ctx.add(20, Element.Fusion, Stat.DmgBonus); ctx.add(15, Stat.DefIgnore); },
});

// --- liberation: Radiance of Fealty — grants 4 Enflamement outright and opens Fiery Feather
const Liberation = changliAction("Liberation: Radiance of Fealty", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1212.75,
  energy: -12500, concerto: 2000, forte1: 4,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    ctx.add(20, Element.Fusion, Stat.DmgBonus); ctx.add(15, Stat.DefIgnore);   // Sweeping Force
    ctx.grantSelf(FIERY_FEATHER);
  },
});

// --- intro / outro. Intro also opens True Sight.
const Intro = changliAction("Intro: Obedience of Rules", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 148.34, energy: 1000, concerto: 1000,
  priority: PRIORITY.BUFF_STATS, apply(ctx) { ctx.grantSelf(TRUE_SIGHT); },
});
const Outro = changliAction("Outro: Strategy of Duality", {
  cast: Cast.Outro, mv: 0, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.outro(CHANGLI_OUTRO); },
});

/** A kit-valid line: Intro opens True Sight, Basic 123 into Conquest spends it for Enflamement,
 *  Skill re-opens True Sight and Charge spends it for a second Enflamement, Heavy Attack at 2
 *  Enflamement doesn't yet unlock Flaming Sacrifice — Liberation tops it to the full 4 (also
 *  overwriting whatever Heavy Attack would've been), Flaming Sacrifice spends it all under Fiery
 *  Feather's own window, Outro closes the loop out. Intro is no longer placed here — the
 *  preceding member's outro triggers it (see the standing convention). */
export const ROTATION = [
  BA1234, TrueSightConquest,
  Skill, TrueSightCharge,
  ECHO_CAST, Liberation, FlamingSacrifice, Outro,
];
