/**
 * Sanhua — a glacio sword support. Concerto-efficient, and her Outro (Silversnow) hands the
 * incoming resonator a Basic Attack DMG Amplification window. Her Forte Circuit (Heavy Attack:
 * Detonate) bursts whichever Ice Creations are up — Ice Thorn (from her Intro), Ice Prism (from
 * her Skill), Glacier (from her Liberation), each its own stackable buff FHA's own apply() reads
 * and consumes, queueing the matching burst hit(s) rather than having them placed by hand. Each
 * burst has its own damage, typed as Resonance Skill DMG per the kit text. Clarity stacks (gating
 * the Detonate release-window size) are pure gameplay timing, not a damage modifier, so they
 * aren't tracked.
 *
 * Numbers from nanoka.cc (character 1102, https://ww.nanoka.cc/character/1102); concerto/offtune values (never exposed on her page's
 * text, same gap Brant's Skill hit) come from the migrated sheet, cross-checked everywhere else.
 * The Ice Thorn burst is a real exception, not a data gap: it pays 0 concerto (every other burst
 * pays 15), just 2 Energy — kept as given rather than smoothed over.
 *
 * Sequences 1-6, each its own Gear, all six in the default loadout:
 *  S1 Solitude's Embrace — Basic 5 grants +15% Crit Rate for 10s (outro-loss window).
 *  S2 Snowy Clarity — STA cost/interruption-resistance only; no damage-relevant effect, so this
 *     is a no-op placeholder.
 *  S3 Anomalous Vision — +35% DMG vs sub-70% HP targets; no enemy-HP tracking here, so modelled
 *     as a flat +24.5% DMG Bonus (35% at an assumed 70% uptime), per explicit approval.
 *  S4 Blade Mastery — Liberation refunds 10 Energy and arms a one-shot +120% DMG Bonus for the
 *     very next Detonate.
 *  S5 Unraveling Fate — +100% Crit DMG on Ice Burst (type2: BURST), and Liberation grants 2
 *     Glacier stacks instead of 1 (so Detonate queues the Glacier burst twice that cycle).
 *  S6 Daybreak Radiance — detonating an Ice Prism or Glacier grants the whole team +10% ATK for
 *     20s, stacking twice.
 *
 * Moonlit Clouds (sonata) and Impermanence Heron (mainslot echo) are generic gear usable by any
 * resonator, so they live in echoes/jinzhou.js instead — this file just imports what its own
 * default loadout equips.
 */
import { Buff, Gear, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, Type1, Type2, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { EMERALD_OF_GENESIS } from "../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../echoes/jinzhou.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#5fc9e8";

/* --------------------------------------------------------------- resonator */

/** Condensation (Inherent Skill): +20% Resonance Skill DMG for 8s after casting Intro Skill
 *  Freezing Thorns — short enough that only the standing outro-loss rule matters. */
export const CONDENSATION = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(20, Type1.Skill, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(CONDENSATION);
  return "Sanhua: Condensation";
});

/** Avalanche (Inherent Skill): +20% Ice Burst DMG for 8s after casting Basic Attack 5. Scoped
 *  via type2: BURST (see DETONATE_* below) rather than SKILL, since Ice Burst is typed as
 *  Resonance Skill DMG but isn't the only thing that is. */
export const AVALANCHE = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(20, Type2.Burst, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(AVALANCHE);
  return "Sanhua: Avalanche";
});

/* ------------------------------------------------------------------- sequences */

/** S1 Solitude's Embrace: Basic Attack 5 grants +15% Crit Rate for 10s. */
export const S1 = new Gear("Sanhua S1", (ctx) => {
  if (ctx.action === BA5) ctx.grantSelf(S1_CRIT);
});
export const S1_CRIT = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(15, Stat.CritRate);
  if (isOutro(ctx.action!)) ctx.revoke(S1_CRIT);
  return "Sanhua S1";
});

/** S2 Snowy Clarity: Detonate STA cost down, interruption resistance on Skill cast — neither
 *  has a damage-relevant effect in this calculator, so this is a no-op placeholder. */
export const S2 = new Gear("Sanhua S2");

/** S3 Anomalous Vision: +35% DMG vs targets below 70% HP. No enemy-HP tracking here, so modelled
 *  as a flat 35% * 70% assumed uptime, per explicit approval. */
export const S3 = new Gear("Sanhua S3", (ctx) => { ctx.add(24.5, Stat.DmgBonus); });

/** S4 Blade Mastery: Liberation refunds 10 Energy (see Liberation's own apply() below) and arms
 *  a one-shot +120% DMG Bonus for the very next Detonate — consumed the instant FHA lands, or
 *  lost on outro if Detonate never comes. */
export const S4 = new Gear("Sanhua S4");
export const S4_WINDOW = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  const a = ctx.action!;
  if (a === FHA) ctx.add(120, Stat.DmgBonus);
  if (a === FHA || isOutro(a)) ctx.revoke(S4_WINDOW);
  return "Sanhua S4";
});

/** S5 Unraveling Fate: +100% Crit DMG on Ice Burst (type2: BURST, same scoping as Avalanche).
 *  Liberation's own apply() reads this to grant 2 Glacier stacks instead of 1. Ice Creations
 *  auto-exploding even when not detonated needs no extra modelling — every rotation below
 *  detonates everything anyway. */
export const S5 = new Gear("Sanhua S5", (ctx) => { ctx.add(100, Type2.Burst, Stat.CritDmg); });

/** S6 Daybreak Radiance: detonating an Ice Prism or a Glacier grants the other 2 team members
 *  +10% ATK, permanently, stacking twice — read from DETONATE_PRISM/DETONATE_GLACIER's own
 *  apply() below. Local (not Sanhua's own global reward), delivered like Fallacy. */
export const S6 = new Gear("Sanhua S6");
export const S6_ATK = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(10 * stacks, Stat.BonusAtk);
  return `Sanhua S6 x${stacks}`;
}, 2);

/** Her echoes, leaning on the combat role's own "Concerto Efficiency" / "Basic Attack DMG
 *  Amplification" tags. Emerald of Genesis (a standard weapon, already shared) tops her own
 *  nanoka-recommended weapon list — she has no signature, being 4-star. Default loadout carries
 *  all six sequences, lumped in with the sonata pieces. */
const SANHUA_LOADOUT = new Loadout(
  EMERALD_OF_GENESIS, HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC,
  mainstats("CD", "glacio glacio", "atk atk"), chem("atk", "skill"),
);

export class Sanhua extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Sanhua",
      Element.Glacio,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(10063, Stat.BaseHp);
        ctx.add(275, Stat.BaseAtk);
        ctx.add(941, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(12, Stat.BonusAtk);          // Eternal Frost B2/B4 + Glacial Gaze B2/B4 ATK+ nodes
        ctx.add(12, Element.Glacio, Stat.DmgBonus);  // Frigid Light B3/B5 + Freezing Thorns B3/B5 Glacio DMG Bonus+ nodes
      },
      null,
      null,
      [S1, S2, S3, S4, S5, S6],
    );
    this.alwaysUnlocked = true;
  }
}
export const LOADOUT: ResonatorFactory = () => new Sanhua(SANHUA_LOADOUT);

/* ----------------------------------------------------------------- actions */

function sanhuaAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Glacio,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- intro / outro
const Intro = sanhuaAction("Intro: Freezing Thorns", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 139.17, energy: 1000, concerto: 1000, offtune: 2800,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(CONDENSATION); ctx.grantSelf(THORN_BUFF); },
});
const Outro = sanhuaAction("Outro: Silversnow", {
  cast: Cast.Outro, mv: 0, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.outro(SANHUA_OUTRO); },
});
export const SANHUA_OUTRO = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(SANHUA_OUTRO);
  ctx.add(38, Type1.Basic, Stat.Amp);
  return "Sanhua: Silversnow";
});

// --- resonance skill (creates Ice Prism) and liberation (creates Glacier, refunds Energy/arms
//     Blade Mastery under S4, doubles the Glacier grant under S5)
const Skill = sanhuaAction("Skill: Eternal Frost", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 359.85, energy: 1000, concerto: 1500,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(PRISM_BUFF); },
});
const Liberation = sanhuaAction("Liberation: Glacial Gaze", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 809.48, energy: -10000, concerto: 2000,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    ctx.grantSelf(GLACIER_BUFF, ctx.stacksOf(S5) ? 2 : 1);
    if (ctx.stacksOf(S4)) { ctx.gain(Resource.Energy, 1000); ctx.grantSelf(S4_WINDOW); }
  },
});

// --- normal attacks: five basics, a heavy, a mid-air
const BA1 = sanhuaAction("Basic: Frigid Light 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 48.71, energy: 87, concerto: 200, offtune: 4340 });
const BA2 = sanhuaAction("Basic: Frigid Light 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.76, energy: 132, concerto: 400, offtune: 4960 });
const BA3 = sanhuaAction("Basic: Frigid Light 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.32, energy: 152, concerto: 800, offtune: 4560 });
const BA4 = sanhuaAction("Basic: Frigid Light 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.34, energy: 142, concerto: 800, offtune: 13440 });
const BA5 = sanhuaAction("Basic: Frigid Light 5", {
  node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 233.81, energy: 420, concerto: 1000, offtune: 9520,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(AVALANCHE); },
});
export const HA = sanhuaAction("Heavy: Frigid Light", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 111.35, energy: 200, concerto: 800, offtune: 8000 });
export const MA = sanhuaAction("Basic: Frigid Light (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.29, energy: 51, concerto: 100, offtune: 8000 });

export const BA123 = new Chain("Basic: Frigid Light 123", [BA1, BA2, BA3]);
export const BA12345 = new Chain("Basic: Frigid Light 12345", [BA1, BA2, BA3, BA4, BA5]);

/** Ice Creations: one stackable marker buff each, granted by the cast that makes them (Intro ->
 *  Thorn, Skill -> Prism, Liberation -> Glacier, doubled under S5) and consumed by Detonate's own
 *  apply() below, which queues the matching burst(s) rather than having them placed by hand. Real
 *  in-game durations (Thorn 8s, Prism/Glacier 5s) are all short enough that only the standing
 *  outro-loss rule matters if Detonate never comes. */
export const THORN_BUFF = new Buff(PRIORITY.UPDATE_BUFFS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(THORN_BUFF);
  return "Ice Thorn";
});
export const PRISM_BUFF = new Buff(PRIORITY.UPDATE_BUFFS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(PRISM_BUFF);
  return "Ice Prism";
});
export const GLACIER_BUFF = new Buff(PRIORITY.UPDATE_BUFFS, (ctx, stacks) => {
  if (isOutro(ctx.action!)) ctx.revoke(GLACIER_BUFF);
  return `Glacier x${stacks}`;
}, 2);

// --- forte circuit: Detonate itself (Heavy Attack DMG), then Ice Burst on whichever Ice
//     Creations are up (Resonance Skill DMG, type2: BURST for Avalanche/S5's own scoping). The
//     Ice Thorn burst is the one exception noted above: 0 concerto, just 2 Energy.
export const FHA = sanhuaAction("Heavy: Detonate", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 372.58, energy: 468, concerto: 1500,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    if (ctx.stacksOf(THORN_BUFF)) { ctx.queue(DETONATE_THORN); ctx.removeStack(THORN_BUFF); }
    if (ctx.stacksOf(PRISM_BUFF)) { ctx.queue(DETONATE_PRISM); ctx.removeStack(PRISM_BUFF); }
    const glaciers = ctx.stacksOf(GLACIER_BUFF);
    for (let i = 0; i < glaciers; i++) ctx.queue(DETONATE_GLACIER);
    if (glaciers) ctx.removeStack(GLACIER_BUFF, glaciers);
  },
});
export const DETONATE_THORN = sanhuaAction("Ice Burst (Thorn)", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Skill, type2: Type2.Burst, mv: 59.65, energy: 200, concerto: 0 });
export const DETONATE_PRISM = sanhuaAction("Ice Burst (Prism)", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Skill, type2: Type2.Burst, mv: 79.53, energy: 700, concerto: 1500,
  priority: PRIORITY.UPDATE_BUFFS,
  apply: (ctx) => { if (ctx.stacksOf(S6)) ctx.grantOthers(S6_ATK); },
});
export const DETONATE_GLACIER = sanhuaAction("Ice Burst (Glacier)", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Skill, type2: Type2.Burst, mv: 139.17, energy: 700, concerto: 1500,
  priority: PRIORITY.UPDATE_BUFFS,
  apply: (ctx) => { if (ctx.stacksOf(S6)) ctx.grantOthers(S6_ATK); },
});

/** Intro is no longer placed here — the preceding member's outro triggers it (see `onIntro`).
 *  Skill/Liberation come first so Condensation (opened by Intro) covers the Skill cast; the
 *  basics chain ends on Basic 5 so Avalanche (and S1's Crit Rate) are up for the Detonate that
 *  follows it, and Blade Mastery's window (if S4) still covers that same Detonate. */
export const ROTATION = [
  Skill, Liberation, FHA, ECHO_CAST, Outro,
];
