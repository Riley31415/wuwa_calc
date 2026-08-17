/**
 * Camellya — a havoc sword main DPS built around Blossom Mode and Budding Mode, both entered
 * and exited by name rather than tracked as live combo state (same "fixed valid line" treatment
 * as every other kit whose move-forms outnumber what this engine simulates live, e.g. Sigrika's
 * Runes, Buling's Trigram):
 *
 * - Resonance Skill Crimson Blossom (considered Basic Attack DMG) opens Blossom Mode: Basic
 *   Attack becomes Vining Waltz (a 4-stage chain, with an optional Blazing Waltz insert on stage
 *   3), Dodge Counter becomes Atonement, and Resonance Skill itself becomes Floral Ravage, which
 *   ends Blossom Mode.
 * - Forte Circuit Ephemeral (at full Concerto) deals its own hit and enters Budding Mode: Sweet
 *   Dream — +50% DMG Multiplier (its own stated ceiling, at 10 Crimson Buds consumed; assumed
 *   spent in full, same "assumed full stacks" precedent as every other kit's own fixed line) on
 *   Normal Attack/Vining Waltz/Blazing Waltz/Vining Ronde/Dodge Counter Atonement/Crimson
 *   Blossom/Floral Ravage specifically. 15s stated duration (under the 21s threshold), so it's
 *   lost after the outro action gains stats, same as every other short window.
 *
 * Seedbed/Epiphyte (Inherent Skills, always assumed known): +15% Havoc DMG Bonus flat; +15%
 * Basic DMG Bonus flat (its own interruption-resistance half isn't modelled — no combat-formula
 * equivalent). Vining Ronde (the Jump replacement in Blossom Mode) and the Crimson Pistil/Bud
 * economy that gates when Ephemeral is actually available aren't tracked live — Ephemeral is
 * just placed once the rotation calls for it, same as every other forte-gauge kit here.
 *
 * Numbers from nanoka.cc (character 1603, https://ww.nanoka.cc/character/1603, weapon
 * 21020026, echo 6000090); no wuwalab.com entry and no migrated-sheet row exist for this
 * character (confirmed by grep against the migration data), so — same gap as Rover: Havoc/
 * Danjin — Energy/Concerto/Offtune/Crimson Pistil-gain deltas have no available source and are
 * left at 0 throughout, flagged here rather than guessed. MV/scaling/buff numbers are all
 * nanoka's own complete "Skill Attributes (Lv.10)" table.
 */
import { Buff, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { NM_CROWNLESS, HAVOC_ECLIPSE_2PC, HAVOC_ECLIPSE_5PC } from "../echoes/jinzhou.js";
import { RED_SPRING } from "../weapons/sword.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#e0507a";

/** Crimson Pistil is the gauge the game shows — up to 100, spent entirely by Ephemeral. */
export const CAMELLYA_CRIMSON_PISTIL = Resource.Forte1;

/* --------------------------------------------------------------- resonator */

/** Budding Mode: Sweet Dream's own +50% DMG Multiplier ceiling (10 Crimson Buds consumed,
 *  assumed spent in full — see file header), scoped to the seven actions its own text names.
 *  15s, so per the standing short-window rule it's lost after the outro action gains stats. */
function inSweetDream(a: import("../kit.js").Action): boolean {
  return a === BA1 || a === VW1 || a === VW2 || a === VW3 || a === VW4 || a === BlazingWaltz
    || a === ViningRonde || a === Atonement || a === CrimsonBlossom || a === FloralRavage;
}
export const BUDDING_MODE = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) { ctx.revoke(BUDDING_MODE); return; }
  if (inSweetDream(ctx.action!)) ctx.add(50, Stat.MulMv);
  return "Camellya: Budding Mode (Sweet Dream)";
});

/* ------------------------------------------------------------------ echo, sonata, weapon */

/** Her echoes: Nightmare: Crownless mainslot + Havoc Eclipse 5pc/2pc (all shared with Havoc
 *  Rover/Danjin, echoes/jinzhou.js) — Red Spring (her own signature) lives in weapons/sword.js.
 *  43311 crit-rate build. */
const CAMELLYA_LOADOUT = new Loadout(
  RED_SPRING, NM_CROWNLESS, HAVOC_ECLIPSE_5PC, HAVOC_ECLIPSE_2PC,
  mainstats("CR", "havoc havoc", "atk atk"), chem("atk", "basic"),
);

export class Camellya extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Camellya",
      Element.Havoc,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(10325, Stat.BaseHp);
        ctx.add(450, Stat.BaseAtk);
        ctx.add(1161, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(16, Stat.CritDmg);          // Burgeoning B3/B5 + Everblooming's own node, 2.4+5.6 x2
        ctx.add(12, Stat.BonusAtk);         // Valse B2/B4 + Fervor Efflorescent's own node, 1.8+4.2 x2
        ctx.add(15, Element.Havoc, Stat.DmgBonus);   // Seedbed
        ctx.add(15, DamageType.Basic, Stat.DmgBonus);   // Epiphyte
      },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Camellya(CAMELLYA_LOADOUT);

/* ----------------------------------------------------------------- actions */

function camellyaAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Havoc,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter (Burgeoning), outside Blossom Mode
const BA1 = camellyaAction("Basic: Burgeoning 1", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 62.53 });
const BA2 = camellyaAction("Basic: Burgeoning 2", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 92.96 });   // 46.48% x2
const BA3 = camellyaAction("Basic: Burgeoning 3", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 152.10 });   // 50.70% x3
/** Chain Basic Attack — hold Normal Attack after Stage 3 to keep striking, 20 hits. */
const BA4 = camellyaAction("Basic: Burgeoning 4 (Chain)", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 494.00 });   // 24.70% x20
const BA5 = camellyaAction("Basic: Burgeoning 5", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 192.68 });   // 48.17% x4
export const BA12345 = new Chain("Basic: Burgeoning 12345", [BA1, BA2, BA3, BA4, BA5]);

export const MA = camellyaAction("Mid-air Attack", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 131.22 });   // 65.61% x2
export const DC = camellyaAction("Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 298.20 });   // 99.40% x3
/** Heavy Attack: Pruning — considered Basic Attack DMG per Seedbed's own text. */
const HA = camellyaAction("Heavy: Pruning", { node: Node.Normal, cast: Cast.Heavy, type: DamageType.Basic, mv: 264.42 });   // 88.14% x3

// --- resonance skill: Crimson Blossom opens Blossom Mode; Vining Waltz/Blazing Waltz/Vining
//     Ronde/Atonement replace Basic/Dodge Counter/Jump while it's up; Floral Ravage (Skill
//     replacement) ends it.
const CrimsonBlossom = camellyaAction("Skill: Crimson Blossom", {
  node: Node.Skill, cast: Cast.Skill, type: DamageType.Basic, mv: 227.24,   // 113.62% x2
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(BLOSSOM_MODE); },
});
export const BLOSSOM_MODE = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (ctx.action === FloralRavage || isOutro(ctx.action!)) { ctx.revoke(BLOSSOM_MODE); return; }
  return "Camellya: Blossom Mode";
});

const VW1 = camellyaAction("Basic: Vining Waltz 1", { node: Node.Skill, cast: Cast.Basic, type: DamageType.Basic, mv: 96.33 });
const VW2 = camellyaAction("Basic: Vining Waltz 2", { node: Node.Skill, cast: Cast.Basic, type: DamageType.Basic, mv: 91.26 });   // 45.63% x2
const VW3 = camellyaAction("Basic: Vining Waltz 3", { node: Node.Skill, cast: Cast.Basic, type: DamageType.Basic, mv: 131.70 });   // 21.95% x6
/** Blazing Waltz — hold Normal Attack on Vining Waltz Stage 3 before it auto-continues to
 *  Stage 4. */
const BlazingWaltz = camellyaAction("Basic: Blazing Waltz", { node: Node.Skill, cast: Cast.Basic, type: DamageType.Basic, mv: 417.05 });   // 21.95% x19
const VW4 = camellyaAction("Basic: Vining Waltz 4", { node: Node.Skill, cast: Cast.Basic, type: DamageType.Basic, mv: 202.77 });   // 67.59% x3
export const VW1234 = new Chain("Basic: Vining Waltz 1234", [VW1, VW2, VW3, VW4]);
export const VW12Blazing4 = new Chain("Basic: Vining Waltz 12-Blazing-4", [VW1, VW2, BlazingWaltz, VW4]);

/** Vining Ronde — Jump's own replacement in Blossom Mode, ends it (per the kit's own text). */
export const ViningRonde = camellyaAction("Basic: Vining Ronde", {
  node: Node.Skill, cast: Cast.Basic, type: DamageType.Basic, mv: 158.85,   // 52.95% x3
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.revoke(BLOSSOM_MODE); },
});
/** Dodge Counter Atonement — the Blossom Mode Dodge Counter replacement. */
export const Atonement = camellyaAction("Dodge Counter: Atonement", { node: Node.Skill, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 226.66 });   // 113.33% x2

/** Floral Ravage — the Skill replacement in Blossom Mode, ends it. Considered Basic Attack DMG. */
const FloralRavage = camellyaAction("Skill: Floral Ravage", {
  node: Node.Skill, cast: Cast.Skill, type: DamageType.Basic, mv: 263.05,   // 52.61% x5
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.revoke(BLOSSOM_MODE); },
});

// --- forte circuit: Ephemeral, at full Crimson Pistil — considered Basic Attack DMG, enters
//     Budding Mode
const Ephemeral = camellyaAction("Forte: Ephemeral", {
  node: Node.Forte, cast: Cast.Skill, type: DamageType.Basic, mv: 1262.45, forte1: -100,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(BUDDING_MODE); },
});

// --- liberation: Fervor Efflorescent
const Liberation = camellyaAction("Liberation: Fervor Efflorescent", {
  node: Node.Liberation, cast: Cast.Liberation, type: DamageType.Liberation, mv: 1202.81,
});

// --- intro / outro
const Intro = camellyaAction("Intro: Everblooming", {
  node: Node.Intro, cast: Cast.Intro, type: DamageType.Intro, mv: 198.81,
});
/** Twining — no handoff buff is described on her own kit page, unlike most other kits' outros;
 *  left as a plain damage hit, nothing invented. The Ephemeral-boosted variant (459.02% instead
 *  of 329.24%) isn't separately placed — the rotation below closes on the plain form. */
const Outro = camellyaAction("Outro: Twining", {
  cast: Cast.Outro, type: DamageType.Outro, mv: 329.24, active: false,
});

/** A kit-valid line: Intro, the Burgeoning chain (through its own 20-hit Chain Basic Attack and
 *  finisher), Crimson Blossom opens Blossom Mode, the Vining Waltz chain (with the Blazing
 *  Waltz insert) into Floral Ravage closes it back out, Ephemeral spends the fresh Crimson
 *  Pistil and opens Budding Mode over the tail of it, Liberation, Outro closes the loop out.
 *  Intro is no longer placed here — the preceding member's outro triggers it (see the standing
 *  convention). */
export const ROTATION = [
  BA12345, HA,
  CrimsonBlossom, VW12Blazing4, FloralRavage,
  ECHO_CAST, Ephemeral, Liberation, Outro,
];
