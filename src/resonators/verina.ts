/**
 * Verina — a spectro rectifier support/healer. Photosynthesis Energy (forte1, max 4) builds off
 * Basic Attack 5/Resonance Skill/Intro; a held Heavy Attack or Mid-air Attack at 1+ becomes its
 * own Starflower Blooms variant, spending a stack. Liberation applies Photosynthesis Mark: for
 * its own 12s, any team member's hit on the marked target also triggers one of Verina's own
 * Coordinated Attacks (once a second) — lumped into one 12-tick action, same treatment as
 * Zhezhi's Inklit Spirit / Cantarella's Diffusion.
 *
 * Healing itself — every heal number on her own page, Grace of Life's shield, S1/S3/S5's own
 * healing-only text — is out of scope for this calculator, per the standing rule; only what
 * pays real damage or a real stat is modelled below.
 *
 * Sequences 1-6, each its own Gear, all six in the default loadout, by explicit instruction:
 *  S1 Moment of Emergence — Outro healing only, no-op.
 *  S2 Sprouting Reflections — Botany Experiment grants +1 Photosynthesis Energy and +10 Energy.
 *  S3 The Choice to Flourish — Photosynthesis Mark healing only, no-op.
 *  S4 Blossoming Embrace — Starflower Blooms (either)/Liberation/Outro grants the team +15%
 *     Spectro DMG Bonus for 24s.
 *  S5 Miraculous Blooms — healing threshold only, no-op.
 *  S6 Joyous Harvest — Starflower Blooms (either) deals +20% more DMG and additionally triggers
 *     one Coordinated Attack of its own (the same single-hit value Photosynthesis Mark's own
 *     periodic proc has, not the full 12-tick sum) — healing this triggers also isn't modelled.
 *
 * Numbers from nanoka.cc (character 1503, https://ww.nanoka.cc/character/1503) for every named hit's MV — she has no wuwalab.com entry
 * yet checked, and isn't on the migrated sheet either (an older, unmigrated build), so this is
 * nanoka's own rendered "Skill Attributes (Lv.10)" table throughout. Energy/concerto/offtune
 * generated per hit aren't exposed on nanoka's own page beyond the odd Concerto Regen figure it
 * does give directly (used where shown) — everything else reads `energy: 0`/`offtune: 0`, flagged
 * rather than guessed. Weapon (Variation R5) and echoes (Fallacy mainslot, full 5pc Rejuvenating
 * Glow) are both generic gear already shared across other kits here, by explicit instruction.
 */
import { Buff, GlobalBuff, Gear, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, Type1, Type2, Node, Cast, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { VARIATION } from "../weapons/standard.js";
import { FALLACY, REJUV_5PC, REJUV_2PC } from "../echoes/jinzhou.js";

/** This resonator's own color. */
export const COLOR = "#8fe08f";

/** Photosynthesis Energy is the gauge the game shows — up to 4, spent 1 a cast by either
 *  Starflower Blooms variant. */
export const VERINA_PHOTOSYNTHESIS = Resource.Forte1;

/* --------------------------------------------------------------- resonator */

/** Gift of Nature (Inherent Skill): +20% ATK, team-wide, for 20s on casting either Starflower
 *  Blooms variant, Liberation, or Outro — exactly 20s, so per the standing wording rule ("20s or
 *  less") this is lost after the outro action gains stats, not permanent. Global since the whole
 *  team gets it. */
export const GIFT_OF_NATURE = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(20, Stat.BonusAtk);
  if (isOutro(ctx.action!)) ctx.revoke(GIFT_OF_NATURE);
  return "Verina: Gift of Nature";
});

/* ------------------------------------------------------------------- sequences */

/** S2 Sprouting Reflections: Botany Experiment grants +1 Photosynthesis Energy and +10 Energy
 *  on top of its own base gain. */
export const S2 = new Gear("Verina S2", (ctx) => {
  if (ctx.action === Skill) { ctx.gain(Resource.Forte1, 1); ctx.gain(Resource.Energy, 1000); }
});

/** S4 Blossoming Embrace: Starflower Blooms/Liberation/Outro grants the team +15% Spectro DMG
 *  Bonus for 24s — permanent uptime once granted, per the standing duration rule. */
export const S4 = new Gear("Verina S4", (ctx) => {
  const a = ctx.action!;
  if (a === StarflowerHeavy || a === StarflowerMidair || a === Liberation || a === Outro) ctx.grantGlobal(S4_TEAM);
});
export const S4_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(15, Element.Spectro, Stat.DmgBonus); return "Verina S4"; });

/** S6 Joyous Harvest: Starflower Blooms (either) deals +20% more DMG and triggers one
 *  Coordinated Attack of its own — the same single-hit value Photosynthesis Mark's periodic proc
 *  has (see PHOTOSYNTHESIS_TICK below), not the full 12-tick sum. */
export const S6 = new Gear("Verina S6", (ctx) => {
  const a = ctx.action!;
  if (a === StarflowerHeavy || a === StarflowerMidair) { ctx.add(20, Stat.MulMv); ctx.queue(PhotosynthesisTick); }
});

/* ------------------------------------------------------------------ weapon, echo, sonata */

/** Her echoes: Fallacy mainslot, full 5pc Rejuvenating Glow — both generic gear, by explicit
 *  instruction. Variation R5 (weapons/standard.js) as her weapon, likewise. Support/healer spread
 *  rather than the usual 43311 crit build — her own damage is incidental to the kit. */
const VERINA_LOADOUT = new Loadout(
  VARIATION, FALLACY, REJUV_5PC, REJUV_2PC,
  mainstats("HP", "ER ER", "atk atk"), chem("atk", "liberation", { er: true }),
);

export class Verina extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Verina",
      Element.Spectro,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(14238, Stat.BaseHp);
        ctx.add(338, Stat.BaseAtk);
        ctx.add(1100, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(12, Stat.BonusAtk);
        ctx.add(12, Stat.HealingBonus);   // stat-tree Healing Bonus+ nodes — unused by the
                                           // formula (healing out of scope), tracked for
                                           // completeness only
      },
      null,
      null,
      [S2, S4, S6],
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Verina(VERINA_LOADOUT);

/* ----------------------------------------------------------------- actions */

function verinaAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Spectro,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter, heavy (Cultivation)
const BA1 = verinaAction("Basic: Cultivation 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 37.86 });
const BA2 = verinaAction("Basic: Cultivation 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 51.16 });
const BA3 = verinaAction("Basic: Cultivation 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 51.16 });   // 25.58% x2
const BA4 = verinaAction("Basic: Cultivation 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 67.32 });
const BA5 = verinaAction("Basic: Cultivation 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 71.62, forte1: 1 });
const HA = verinaAction("Heavy: Cultivation", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 99.41 });
const MA1 = verinaAction("Basic: Cultivation 1 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 56.37 });
const MA2 = verinaAction("Basic: Cultivation 2 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 53.19 });
const MA3 = verinaAction("Basic: Cultivation 3 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 76.26 });   // 25.42% x3
export const MHA = verinaAction("Heavy: Cultivation (Mid-air)", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 61.64 });
const DC = verinaAction("Basic: Cultivation (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 129.23 });

export const BA12345 = new Chain("Basic: Cultivation 12345", [BA1, BA2, BA3, BA4, BA5]);

// --- resonance skill: Botany Experiment
const Skill = verinaAction("Skill: Botany Experiment", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 178.95,   // 35.79% x3 + 71.58%
  concerto: 3000, forte1: 1,
});

// --- forte circuit: Starflower Blooms, spends 1 Photosynthesis Energy either way
const StarflowerHeavy = verinaAction("Heavy: Starflower Blooms", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 162.37,   // 64.95% + 97.42%
  concerto: 1200, forte1: -1,
  priority: PRIORITY.BUFF_STATS, apply(ctx) { ctx.grantGlobal(GIFT_OF_NATURE); },
});
const StarflowerMidair = verinaAction("Basic: Starflower Blooms (Mid-Air)", {
  node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 222.96,   // 67.64+63.82+30.50x3
  concerto: 1200, forte1: -1,
  priority: PRIORITY.BUFF_STATS, apply(ctx) { ctx.grantGlobal(GIFT_OF_NATURE); },
});

// --- liberation: Arboreal Flourish — applies Photosynthesis Mark, whose own 12 ticks (1/s,
//     9.95% each) are lumped into one action, same treatment as Zhezhi's Inklit Spirit. Not
//     queued off Liberation itself since the real window spans everyone else's own actions too;
//     placed directly in the rotation below instead, same as Phrolova's Hecate auto-cycle.
const Liberation = verinaAction("Liberation: Arboreal Flourish", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 198.81,
  energy: -17500, concerto: 2000,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(GIFT_OF_NATURE); },
});
/** One Coordinated Attack tick, S6's own single-hit reuse. */
const PhotosynthesisTick = verinaAction("Photosynthesis Mark", {
  node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 9.95, active: false,
});
/** The full 12-tick window off her own Liberation. */
const PhotosynthesisMark = verinaAction("Photosynthesis Mark x12", {
  node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 119.4, active: false,
});

// --- intro / outro
const Intro = verinaAction("Intro: Verdant Growth", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 99.41, concerto: 1000, forte1: 1,
});
/** Blossom: no damage of its own, just the Gift of Nature/S4 trigger and (skipped) healing. */
const Outro = verinaAction("Outro: Blossom", {
  cast: Cast.Outro, mv: 0, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(GIFT_OF_NATURE); },
});

/** A kit-valid line: Intro banks a Photosynthesis Energy, the basics chain banks another off
 *  Stage 5, Skill banks a third, a held Heavy Attack spends one for Starflower Blooms, Liberation
 *  applies Photosynthesis Mark and its own 12-tick window follows directly, Outro closes the
 *  loop out. Intro is no longer placed here — the preceding member's outro triggers it (see the
 *  standing convention). */
export const ROTATION = [
  BA12345, Skill, StarflowerHeavy,
  ECHO_CAST, Liberation, PhotosynthesisMark, Outro,
];
