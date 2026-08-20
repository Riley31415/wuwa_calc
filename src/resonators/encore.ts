/**
 * Encore — a fusion rectifier main DPS. Mayhem (forte1, 0-100) builds off nearly every hit; a
 * Heavy Attack at 100 spends it all for Cloudy Frenzy (Threshold state) or Cosmos Rupture
 * (during her own Liberation, Cosmos Rave — she loses control and her whole kit swaps to Cosmos'
 * own forms: Frolicking/Heavy Attack/Rampage/Dodge Counter, all "considered" the same damage
 * type their Threshold-state counterparts are).
 *
 * Angry Cosmos (Inherent Skill, +10% DMG Dealt above 70% HP during Cosmos Rave) is applied
 * unconditionally — no HP-loss tracking here, same assumed-always-true treatment Shorekeeper's
 * healing-gated text gets.
 *
 * Sequences 1-6, each its own Gear, all six in the default loadout, by explicit instruction:
 *  S1 Wooly's Fairy Tale — a landed Basic Attack grants +3% Fusion DMG Bonus, up to 4 stacks, 6s.
 *  S2 Sheep-counting Lullaby — extra Energy on Wooly Strike/Energetic Welcome, ICD not modelled
 *     (no real-time clock here), so it's paid every cast instead of once per 10s.
 *  S3 Fog? The Black Shores! — +40% DMG Multiplier on Cloudy Frenzy/Cosmos Rupture.
 *  S4 Adventure? Let's go! — Cosmos Rupture grants the whole team +20% Fusion DMG Bonus for 30s.
 *  S5 Hero Takes the Stage! — flat +35% Resonance Skill DMG Bonus.
 *  S6 Woolies Save the World! — a Cosmos Rave hit grants a stack of Lost Lamb (up to 5), each
 *     +5% ATK for 10s; the trigger is scoped to the same Cosmos-Rave action list Angry Cosmos
 *     reads, since that's exactly "dealing damage during Cosmos Rave".
 *
 * Numbers from the migrated sheet's own rows (cross-checked against nanoka.cc, character 1203, https://ww.nanoka.cc/character/1203,
 * for every named hit — all agree exactly); mechanics and sequence text from nanoka.cc. Her
 * mainslot echo is Inferno Rider (id 390080007, by explicit instruction) — its own 3-hit combo,
 * unlike most mainslot echoes, carries no permanent passive at all: casting it grants the caster
 * a temporary +12%/+12% Fusion/Basic Attack DMG Bonus window instead (see the action's own
 * apply()), same self-buff-on-cast shape as Bell-Borne Geochelone's own Shield.
 */
import { Buff, GlobalBuff, Gear, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Cast, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { STRINGMASTER } from "../weapons/rectifier.js";
import { INFERNO_RIDER, MOLTEN_RIFT_2PC, MOLTEN_RIFT_5PC } from "../echoes/jinzhou.js";

/** This resonator's own color. */
export const COLOR = "#e0a34f";

/** Mayhem is the gauge the game shows — up to 100, spent entirely by Cloudy Frenzy/Cosmos
 *  Rupture. */
export const ENCORE_MAYHEM = Resource.Forte1;

/* --------------------------------------------------------------- resonator */

/** Woolies Cheer Dance (Inherent Skill): +10% Fusion DMG Bonus for 10s on casting Flaming
 *  Woolies or Cosmos - Rampage — short enough that only the standing outro-loss rule matters. */
export const WOOLIES_CHEER_DANCE = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(10, Element.Fusion, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(WOOLIES_CHEER_DANCE);
  return "Encore: Woolies Cheer Dance";
});

/** Angry Cosmos (Inherent Skill, assumed always true — see file header) and S6's own Lost Lamb
 *  trigger both scope to the same "dealing damage during Cosmos Rave" action list. */
function inCosmosRave(a: import("../kit.js").Action): boolean {
  return a === CosmosFrolicking1 || a === CosmosFrolicking2 || a === CosmosFrolicking3 || a === CosmosFrolicking4
    || a === CosmosHeavy || a === CosmosRampage || a === CosmosDodgeCounter || a === CosmosRupture;
}
export const ANGRY_COSMOS = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (!inCosmosRave(ctx.action!)) return;
  ctx.add(10, Stat.TotalDmg);
  return "Encore: Angry Cosmos";
});

/* ------------------------------------------------------------------- sequences */

/** S1 Wooly's Fairy Tale: a landed Basic Attack grants +3% Fusion DMG Bonus, up to 4, 6s. */
export const S1 = new Gear("Encore S1", (ctx) => {
  if (ctx.action!.type === DamageType.Basic) ctx.grantSelf(S1_STACKS);
});
export const S1_STACKS = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(3 * stacks, Element.Fusion, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(S1_STACKS);
  return `Encore S1 x${stacks}`;
}, 4);

/** S2 Sheep-counting Lullaby: +10 Energy on Wooly Strike/Energetic Welcome — the 10s ICD isn't
 *  modelled (no real-time clock here), so it pays every cast instead of once per window. */
export const S2 = new Gear("Encore S2", (ctx) => {
  if (ctx.action === WoolyStrike || ctx.action === EnergeticWelcome) ctx.gain(Resource.Energy, 1000);
});

/** S3 Fog? The Black Shores!: +40% DMG Multiplier on Cloudy Frenzy/Cosmos Rupture. */
export const S3 = new Gear("Encore S3", (ctx) => {
  if (ctx.action === CloudyFrenzy || ctx.action === CosmosRupture) ctx.add(40, Stat.MulMv);
});

/** S4 Adventure? Let's go!: Cosmos Rupture grants the whole team +20% Fusion DMG Bonus, 30s —
 *  permanent uptime once granted, per the standing duration rule. */
export const S4 = new Gear("Encore S4", (ctx) => {
  if (ctx.action === CosmosRupture) ctx.grantGlobal(S4_TEAM);
});
export const S4_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(20, Element.Fusion, Stat.DmgBonus); return "Encore S4"; });

/** S5 Hero Takes the Stage!: flat +35% Resonance Skill DMG Bonus. */
export const S5 = new Gear("Encore S5", (ctx) => { ctx.add(35, DamageType.Skill, Stat.DmgBonus); });

/** S6 Woolies Save the World!: a Cosmos Rave hit grants a stack of Lost Lamb, up to 5, each
 *  +5% ATK for 10s. */
export const S6 = new Gear("Encore S6", (ctx) => {
  if (inCosmosRave(ctx.action!)) ctx.grantSelf(S6_LOST_LAMB);
});
export const S6_LOST_LAMB = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(5 * stacks, Stat.BonusAtk);
  if (isOutro(ctx.action!)) ctx.revoke(S6_LOST_LAMB);
  return `Encore S6 x${stacks}`;
}, 5);

/** Her echoes: Inferno Rider mainslot, full 5pc Molten Rift (both echoes/jinzhou.js) — Stringmaster
 *  (weapons/rectifier.js) as her weapon, by explicit instruction. 43311 crit-rate build. */
const ENCORE_LOADOUT = new Loadout(
  STRINGMASTER, INFERNO_RIDER, MOLTEN_RIFT_5PC, MOLTEN_RIFT_2PC,
  mainstats("CR", "fusion fusion", "atk atk"), chem("atk", "skill"),
);

export class Encore extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Encore",
      Element.Fusion,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(10512.5, Stat.BaseHp);
        ctx.add(425, Stat.BaseAtk);
        ctx.add(1247, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(12, Stat.BonusAtk);
        ctx.add(12, Element.Fusion, Stat.DmgBonus);
      },
      (ctx) => { ctx.grantSelf(ANGRY_COSMOS); },
      null,
      // all six sequences carried by default, per the file header
      [S1, S2, S3, S4, S5, S6],
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Encore(ENCORE_LOADOUT);

/* ----------------------------------------------------------------- actions */

function encoreAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Fusion,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter, heavy (Wooly Attack)
const BA1 = encoreAction("Basic: Wooly Attack 1", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 55.66, energy: 70, concerto: 140, offtune: 3360, forte1: 3 });
const BA2 = encoreAction("Basic: Wooly Attack 2", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 66.20, energy: 83, concerto: 166, offtune: 3996, forte1: 5 });
const BA3 = encoreAction("Basic: Wooly Attack 3", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 132.60, energy: 166, concerto: 332, offtune: 8004, forte1: 6 });
const BA4 = encoreAction("Basic: Wooly Attack 4", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 153.08, energy: 192, concerto: 384, offtune: 9240, forte1: 4 });
const WoolyStrike = encoreAction("Basic: Wooly Strike", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 238.57, energy: 300, concerto: 600, offtune: 14400, forte1: 25 });
const HA = encoreAction("Heavy: Wooly Attack", { node: Node.Normal, cast: Cast.Heavy, type: DamageType.Heavy, mv: 187.08, energy: 235, concerto: 470, offtune: 11292, forte1: 5 });
const MA = encoreAction("Basic: Wooly Attack (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 123.26, energy: 51, concerto: 100, offtune: 14400, forte1: 11 });
const DC = encoreAction("Basic: Wooly Attack (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 251.88, energy: 316, concerto: 332, offtune: 8004, forte1: 6 });

export const BA1234 = new Chain("Basic: Wooly Attack 1234", [BA1, BA2, BA3, BA4]);

// --- resonance skill: Flaming Woolies, then Energetic Welcome (press again shortly after)
const Skill1 = encoreAction("Skill: Flaming Woolies", {
  node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 612.88, energy: 1528, concerto: 1500, offtune: 25600, forte1: 32,
  priority: PRIORITY.BUFF_STATS, apply(ctx) { ctx.grantSelf(WOOLIES_CHEER_DANCE); },
});
const EnergeticWelcome = encoreAction("Skill: Energetic Welcome", { node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 339.16, energy: 75, concerto: 500, offtune: 9072, forte1: 30 });

// --- forte circuit: Cloudy Frenzy (Threshold), spends the full Mayhem gauge
const CloudyFrenzy = encoreAction("Heavy: Cloudy Frenzy", {
  node: Node.Forte, cast: Cast.Heavy, type: DamageType.Liberation, mv: 773.73, concerto: 1000, offtune: 41103, forte1: -100,
});

// --- liberation: Cosmos Rave — no damage of its own, just opens the state
const Liberation = encoreAction("Liberation: Cosmos Rave", {
  node: Node.Liberation, cast: Cast.Liberation, type: DamageType.Liberation, mv: 0,
  energy: -12500, concerto: 2000,
});

// --- Cosmos Rave's own moveset: Frolicking (Basic), Cosmos Heavy Attack, Cosmos - Rampage
//     (Skill), Cosmos Dodge Counter, Cosmos Rupture (Forte) — all "considered" the same damage
//     type their Threshold-state counterparts are.
const CosmosFrolicking1 = encoreAction("Basic: Cosmos - Frolicking 1", { node: Node.Liberation, cast: Cast.Basic, type: DamageType.Basic, mv: 180.36, energy: 132, concerto: 266, offtune: 6396, forte1: 8 });
const CosmosFrolicking2 = encoreAction("Basic: Cosmos - Frolicking 2", { node: Node.Liberation, cast: Cast.Basic, type: DamageType.Basic, mv: 169.20, energy: 123, concerto: 249, offtune: 6000, forte1: 12 });
const CosmosFrolicking3 = encoreAction("Basic: Cosmos - Frolicking 3", { node: Node.Liberation, cast: Cast.Basic, type: DamageType.Basic, mv: 263.96, energy: 192, concerto: 388, offtune: 9360, forte1: 16 });
const CosmosFrolicking4 = encoreAction("Basic: Cosmos - Frolicking 4", { node: Node.Liberation, cast: Cast.Basic, type: DamageType.Basic, mv: 582.03, energy: 429, concerto: 858, offtune: 20640, forte1: 27 });
export const CosmosFrolicking1234 = new Chain("Basic: Cosmos - Frolicking 1234",
  [CosmosFrolicking1, CosmosFrolicking2, CosmosFrolicking3, CosmosFrolicking4]);

const CosmosHeavy = encoreAction("Heavy: Cosmos - Heavy Attack", { node: Node.Liberation, cast: Cast.Heavy, type: DamageType.Heavy, mv: 217.58, energy: 160, concerto: 321, offtune: 7716, forte1: 9 });
const CosmosRampage = encoreAction("Skill: Cosmos - Rampage", {
  node: Node.Liberation, cast: Cast.Skill, type: DamageType.Skill, mv: 253.28, energy: 656, concerto: 800, offtune: 6168, forte1: 28,
  priority: PRIORITY.BUFF_STATS, apply(ctx) { ctx.grantSelf(WOOLIES_CHEER_DANCE); },
});
const CosmosDodgeCounter = encoreAction("Basic: Cosmos - Dodge Counter", { node: Node.Liberation, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 263.96, energy: 344, concerto: 388, offtune: 9360, forte1: 16 });
const CosmosRupture = encoreAction("Heavy: Cosmos Rupture", {
  node: Node.Forte, cast: Cast.Heavy, type: DamageType.Liberation, mv: 773.73, concerto: 1000, offtune: 41103, forte1: -100,
});

// --- intro / outro
const Intro = encoreAction("Intro: Woolies Helpers", {
  node: Node.Intro, cast: Cast.Intro, type: DamageType.Intro, mv: 198.81, energy: 1000, concerto: 1000, offtune: 15132, forte1: 40,
});
/** Thermal Field: a burn zone, 4 ticks over 6s, lumped into one action same as every other
 *  periodic effect elsewhere (Cantarella's Diffusion, Zhezhi's Inklit Spirit). No handoff buff
 *  is described on her own kit page, unlike most other kits' outros — left as a plain hit. */
const Outro = encoreAction("Outro: Thermal Field", {
  cast: Cast.Outro, type: DamageType.Outro, mv: 707.04, concerto: -10000, active: false,
});

/** A kit-valid line: Intro tops Mayhem partway, Basic 1234 into Wooly Strike, Flaming Woolies
 *  into Energetic Welcome, Heavy Attack at 100 Mayhem releases Cloudy Frenzy, Liberation opens
 *  Cosmos Rave, its own Frolicking combo into Cosmos Rampage, Cosmos Rupture spends the fresh
 *  Mayhem it banked, Outro closes the loop out. Intro is no longer placed here — the preceding
 *  member's outro triggers it (see the standing convention). */
export const ROTATION = [
  BA1234, WoolyStrike, HA, CloudyFrenzy,
  ECHO_CAST, Liberation, CosmosFrolicking1234, CosmosRampage, CosmosRupture,
  Outro,
];
