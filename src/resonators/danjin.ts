/**
 * Danjin — a havoc sword 4-star sub-DPS, standard/permanent-banner character (`alwaysUnlocked =
 * true`, matching Buling/Sanhua's own 4-star display treatment — see `Resonator.alwaysUnlocked`).
 * No sequences implemented, per the standing rule (sequence 0 only, unless explicitly granted).
 *
 * Ruby Blossom (forte1, 0-120): banked by Resonance Skill Crimson Fragment casts. At 60+, a held
 * Basic Attack becomes Heavy Attack: Chaoscleave (spends 60, or a stronger "Full Energy" version
 * at 120 spending that instead), which chains into Scatterbloom. Resonance Skill itself has three
 * forms depending on the preceding action: Carmine Gleam (plain press), Crimson Erosion (after
 * Basic Attack 2, Dodge Counter, or Intro — applies Incinerating Will on its second hit), and
 * Sanguine Pulse (after Basic Attack 3) — all placed directly below, same "fixed valid line, no
 * live queue" treatment as every other kit with more move-forms than this engine tracks live
 * state for (Sigrika's Runes, Buling's Trigram).
 *
 * Crimson Fragment's own HP cost (3% max HP a hit, waived under 1% HP) has no stat or damage
 * impact on its own — not modelled, same as every other HP-cost/healing mechanic elsewhere.
 *
 * Numbers from nanoka.cc (character 1602, https://ww.nanoka.cc/character/1602); no wuwalab.com
 * entry and no migrated-sheet row exist for this character (confirmed by grep against the
 * migration data), so — same gap as Rover: Havoc — Energy/Concerto/Offtune/Ruby Blossom-gain
 * deltas have no available source and are left at 0 throughout, flagged here rather than
 * guessed. MV/scaling/buff numbers are all nanoka's own complete "Skill Attributes (Lv.10)"
 * table.
 */
import { Buff, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { NM_CROWNLESS, HAVOC_ECLIPSE_2PC, HAVOC_ECLIPSE_5PC } from "../echoes/jinzhou.js";
import { EMERALD_OF_GENESIS } from "../weapons/standard.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#a83250";

/** Ruby Blossom is the gauge the game shows — up to 120, spent 60/120 by Chaoscleave. */
export const DANJIN_RUBY_BLOSSOM = Resource.Forte1;

/* --------------------------------------------------------------- resonator */

/** Incinerating Will: applied by Crimson Erosion's own second hit, +20% DMG dealt to the
 *  marked target for 12s — no per-target marking exists here, so this is modelled as a flat
 *  self buff once applied, permanent uptime (12s is under the 21s threshold, but Crimson
 *  Erosion is common enough across a real rotation that — same as Empyrean Anthem's own
 *  Coordinated Attack trigger — it's treated as effectively always up past the first hit). */
export const INCINERATING_WILL = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(20, Stat.DmgDealt);
  return "Danjin: Incinerating Will";
});

/** Duality: the window her outro hands the incoming resonator. */
export const DANJIN_OUTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(DANJIN_OUTRO);
  ctx.add(23, Element.Havoc, Stat.Amp);
  return "Danjin: Duality";
});

/** Her echoes: Nightmare: Crownless mainslot + Havoc Eclipse 5pc/2pc (all shared with Camellya,
 *  echoes/jinzhou.js) — Emerald of Genesis (weapons/standard.js) as her weapon, by explicit instruction.
 *  43311 crit-rate build. */
const DANJIN_LOADOUT = new Loadout(
  EMERALD_OF_GENESIS, NM_CROWNLESS, HAVOC_ECLIPSE_5PC, HAVOC_ECLIPSE_2PC,
  mainstats("CR", "havoc havoc", "atk atk"), chem("atk", "basic"),
);

export class Danjin extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Danjin",
      Element.Havoc,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(9438, Stat.BaseHp);
        ctx.add(263, Stat.BaseAtk);
        ctx.add(1149, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(12, Stat.BonusAtk);
        ctx.add(12, Element.Havoc, Stat.DmgBonus);
      },
    );
    this.alwaysUnlocked = true;   // 4-star — see the file header
  }
}
export const LOADOUT: ResonatorFactory = () => new Danjin(DANJIN_LOADOUT);

/* ----------------------------------------------------------------- actions */

function danjinAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Havoc,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter (Execution)
const BA1 = danjinAction("Basic: Execution 1", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 57.26 });
const BA2 = danjinAction("Basic: Execution 2", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 58.85 });
const BA3 = danjinAction("Basic: Execution 3", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 79.53 });
export const BA123 = new Chain("Basic: Execution 123", [BA1, BA2, BA3]);

export const MA = danjinAction("Mid-air Attack", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 98.61 });
const HA = danjinAction("Heavy Attack", { node: Node.Normal, cast: Cast.Heavy, type: DamageType.Heavy, mv: 111.36 });   // 37.12% x3
/** Ruby Shades: a successful Dodge Counter opens the Skill's own Crimson Erosion form. */
const DC = danjinAction("Dodge Counter: Ruby Shades", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 190.86 });   // 63.62% x3

// --- resonance skill: three forms depending on the preceding action (see the file header)
const CarmineGleam = danjinAction("Skill: Carmine Gleam", {
  node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 76.36,   // 38.18% x2
});
const CrimsonErosion1 = danjinAction("Skill: Crimson Erosion 1", { node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 128.84 });   // 64.42% x2
const CrimsonErosion2 = danjinAction("Skill: Crimson Erosion 2", {
  node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 119.30,   // 59.65% x2
  priority: PRIORITY.BUFF_STATS,
  apply(ctx) { ctx.grantSelf(INCINERATING_WILL); },
});
export const CrimsonErosion12 = new Chain("Skill: Crimson Erosion 12", [CrimsonErosion1, CrimsonErosion2]);

const SanguinePulse1 = danjinAction("Skill: Sanguine Pulse 1", { node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 112.14 });   // 56.07% x2
const SanguinePulse2 = danjinAction("Skill: Sanguine Pulse 2", { node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 128.85 });   // 42.95% x3
const SanguinePulse3 = danjinAction("Skill: Sanguine Pulse 3", { node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 193.26 });   // 64.42% x3
export const SanguinePulse123 = new Chain("Skill: Sanguine Pulse 123", [SanguinePulse1, SanguinePulse2, SanguinePulse3]);

// --- forte circuit: Chaoscleave (Heavy Attack DMG, at 60+ Ruby Blossom) into Scatterbloom
const Chaoscleave = danjinAction("Heavy: Chaoscleave", {
  node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 417.55, forte1: -60,   // 59.65% x7
});
const Scatterbloom = danjinAction("Heavy: Scatterbloom", {
  node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 178.93,
});
/** Full Energy variants, at 120 Ruby Blossom — spends 120 instead of 60. */
export const FullChaoscleave = danjinAction("Heavy: Chaoscleave (Full Energy)", {
  node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 1002.05, forte1: -120,   // 143.15% x7
});
export const FullScatterbloom = danjinAction("Heavy: Scatterbloom (Full Energy)", {
  node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 429.43,
});

// --- liberation: Crimson Bloom — consecutive attacks plus one Scarlet Burst, lumped into one hit
const Liberation = danjinAction("Liberation: Crimson Bloom", {
  node: Node.Liberation, cast: Cast.Liberation, type: DamageType.Liberation, mv: 785.37,   // 49.09%x8+392.65%
});

// --- intro / outro
const Intro = danjinAction("Intro: Vindication", {
  node: Node.Intro, cast: Cast.Intro, type: DamageType.Intro, mv: 198.84,   // 49.71% x4
});
const Outro = danjinAction("Outro: Duality", {
  cast: Cast.Outro, type: DamageType.Outro, mv: 0, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.outro(DANJIN_OUTRO); },
});

/** A kit-valid line: Intro (also opens Crimson Erosion, since it's a listed trigger), Execution
 *  123 banks Ruby Blossom, Sanguine Pulse follows Basic 3, Chaoscleave once 60+ is banked,
 *  Scatterbloom continues it, Liberation, Outro closes the loop. Intro is no longer placed here
 *  — the preceding member's outro triggers it (see the standing convention). */
export const ROTATION = [
  BA123, SanguinePulse123, HA, Chaoscleave, Scatterbloom,
  ECHO_CAST, Liberation, Outro,
];
