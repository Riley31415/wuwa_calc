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
 * Numbers from nanoka.cc (character 1102); concerto/offtune values (never exposed on her page's
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
 * resonator, so they live in shared/echoes.js instead — this file just imports what its own
 * default loadout equips.
 */
import { Buff, Gear, Action, Chain, PRIORITY } from "../kit.js";
import type { ActionDef } from "../kit.js";
import {
  add, gain, grantSelf, grantOthers, stacksOf, removeStack, revoke, outro, isOutro, queue,
} from "../state.js";
import { Stat, Element, DamageType, Type2, Node, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { EMERALD_OF_GENESIS } from "../shared/weapons.js";
import { HERON, ACTION_HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../shared/echoes.js";

/* --------------------------------------------------------------- resonator */

export const SANHUA = new Gear(() => {
  add(100, Stat.Er);
  add(5, Stat.CritRate);
  add(150, Stat.CritDmg);

  add(10063, Stat.BaseHp);
  add(275, Stat.BaseAtk);
  add(941, Stat.BaseDef);
  add(12, Stat.BonusAtk);          // Eternal Frost B2/B4 + Glacial Gaze B2/B4 ATK+ nodes
  add(12, Element.Glacio, Stat.DmgBonus);  // Frigid Light B3/B5 + Freezing Thorns B3/B5 Glacio DMG Bonus+ nodes

  return "Sanhua";
}, null, Element.Glacio, () => Intro);

/** Condensation (Inherent Skill): +20% Resonance Skill DMG for 8s after casting Intro Skill
 *  Freezing Thorns — short enough that only the standing outro-loss rule matters. */
export const CONDENSATION = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  add(20, DamageType.Skill, Stat.DmgBonus);
  if (isOutro(a)) revoke(CONDENSATION);
  return "Sanhua: Condensation";
});

/** Avalanche (Inherent Skill): +20% Ice Burst DMG for 8s after casting Basic Attack 5. Scoped
 *  via type2: BURST (see DETONATE_* below) rather than SKILL, since Ice Burst is typed as
 *  Resonance Skill DMG but isn't the only thing that is. */
export const AVALANCHE = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  add(20, Type2.Burst, Stat.DmgBonus);
  if (isOutro(a)) revoke(AVALANCHE);
  return "Sanhua: Avalanche";
});

/* ------------------------------------------------------------------- sequences */

/** S1 Solitude's Embrace: Basic Attack 5 grants +15% Crit Rate for 10s. */
export const S1 = new Gear((stacks, a) => {
  if (a === BA5) grantSelf(S1_CRIT);
  return "Sanhua S1";
});
export const S1_CRIT = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  add(15, Stat.CritRate);
  if (isOutro(a)) revoke(S1_CRIT);
  return "Sanhua S1";
});

/** S2 Snowy Clarity: Detonate STA cost down, interruption resistance on Skill cast — neither
 *  has a damage-relevant effect in this calculator, so this is a no-op placeholder. */
export const S2 = new Gear(() => "Sanhua S2");

/** S3 Anomalous Vision: +35% DMG vs targets below 70% HP. No enemy-HP tracking here, so modelled
 *  as a flat 35% * 70% assumed uptime, per explicit approval. */
export const S3 = new Gear(() => { add(24.5, Stat.DmgBonus); return "Sanhua S3"; });

/** S4 Blade Mastery: Liberation refunds 10 Energy (see Liberation's own apply() below) and arms
 *  a one-shot +120% DMG Bonus for the very next Detonate — consumed the instant FHA lands, or
 *  lost on outro if Detonate never comes. */
export const S4 = new Gear(() => "Sanhua S4");
export const S4_WINDOW = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  if (a === FHA) add(120, Stat.DmgBonus);
  if (a === FHA || isOutro(a)) revoke(S4_WINDOW);
  return "Sanhua S4";
});

/** S5 Unraveling Fate: +100% Crit DMG on Ice Burst (type2: BURST, same scoping as Avalanche).
 *  Liberation's own apply() reads this to grant 2 Glacier stacks instead of 1. Ice Creations
 *  auto-exploding even when not detonated needs no extra modelling — every rotation below
 *  detonates everything anyway. */
export const S5 = new Gear(() => { add(100, Type2.Burst, Stat.CritDmg); return "Sanhua S5"; });

/** S6 Daybreak Radiance: detonating an Ice Prism or a Glacier grants the other 2 team members
 *  +10% ATK, permanently, stacking twice — read from DETONATE_PRISM/DETONATE_GLACIER's own
 *  apply() below. Local (not Sanhua's own global reward), delivered like Fallacy. */
export const S6 = new Gear(() => "Sanhua S6");
export const S6_ATK = new Buff(PRIORITY.BUFF_STATS, (stacks) => {
  add(10 * stacks, Stat.BonusAtk);
  return `Sanhua S6 x${stacks}`;
}, 2);

/** Her echoes, leaning on the combat role's own "Concerto Efficiency" / "Basic Attack DMG
 *  Amplification" tags. Emerald of Genesis (a standard weapon, already shared) tops her own
 *  nanoka-recommended weapon list — she has no signature, being 4-star. Default loadout carries
 *  all six sequences. */
export const LOADOUT = [
  SANHUA, EMERALD_OF_GENESIS, HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC,
  S1, S2, S3, S4, S5, S6,
  mainstats("CD", "glacio glacio", "atk atk"),
  chem("atk", "skill"),
];

/* ----------------------------------------------------------------- actions */

function sanhuaAction(name: string, def: ActionDef): Action {
  return new Action(`Sanhua: ${name}`, {
    element: Element.Glacio,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- intro / outro
const Intro = sanhuaAction("Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Intro, mv: 139.17, energy: 10, concerto: 10, offtune: 0.28,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { grantSelf(CONDENSATION); grantSelf(THORN_BUFF); },
});
const Outro = sanhuaAction("Outro", {
  cast: DamageType.Outro, type: DamageType.Outro, mv: 0, concerto: -100, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { outro(SANHUA_OUTRO); },
});
export const SANHUA_OUTRO = new Buff(PRIORITY.BUFF_STATS, (stacks, a) => {
  if (isOutro(a)) revoke(SANHUA_OUTRO);
  add(38, DamageType.Basic, Stat.Amp);
  return "Sanhua: Silversnow";
});

// --- resonance skill (creates Ice Prism) and liberation (creates Glacier, refunds Energy/arms
//     Blade Mastery under S4, doubles the Glacier grant under S5)
const Skill = sanhuaAction("Skill", {
  node: Node.Skill, cast: DamageType.Skill, type: DamageType.Skill, mv: 359.85, energy: 10, concerto: 15,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { grantSelf(PRISM_BUFF); },
});
const Liberation = sanhuaAction("Liberation", {
  node: Node.Liberation, cast: DamageType.Liberation, type: DamageType.Liberation, mv: 809.48, energy: -100, concerto: 20,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() {
    grantSelf(GLACIER_BUFF, stacksOf(S5) ? 2 : 1);
    if (stacksOf(S4)) { gain(Resource.Energy, 10); grantSelf(S4_WINDOW); }
  },
});

// --- normal attacks: five basics, a heavy, a mid-air
const BA1 = sanhuaAction("Basic 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 48.71, energy: 0.87, concerto: 2, offtune: 0.434 });
const BA2 = sanhuaAction("Basic 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 73.76, energy: 1.32, concerto: 4, offtune: 0.496 });
const BA3 = sanhuaAction("Basic 3", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 86.32, energy: 1.52, concerto: 8, offtune: 0.456 });
const BA4 = sanhuaAction("Basic 4", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 79.34, energy: 1.42, concerto: 8, offtune: 1.344 });
const BA5 = sanhuaAction("Basic 5", {
  node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 233.81, energy: 4.2, concerto: 10, offtune: 0.952,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() { grantSelf(AVALANCHE); },
});
export const HA = sanhuaAction("Heavy", { node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 111.35, energy: 2, concerto: 8, offtune: 0.8 });
export const MA = sanhuaAction("Plunge", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 86.29, energy: 0.51, concerto: 1, offtune: 0.8 });

export const BA123 = new Chain("Sanhua: Basic 123", [BA1, BA2, BA3]);
export const BA12345 = new Chain("Sanhua: Basic 12345", [BA1, BA2, BA3, BA4, BA5]);

/** Ice Creations: one stackable marker buff each, granted by the cast that makes them (Intro ->
 *  Thorn, Skill -> Prism, Liberation -> Glacier, doubled under S5) and consumed by Detonate's own
 *  apply() below, which queues the matching burst(s) rather than having them placed by hand. Real
 *  in-game durations (Thorn 8s, Prism/Glacier 5s) are all short enough that only the standing
 *  outro-loss rule matters if Detonate never comes. */
export const THORN_BUFF = new Buff(PRIORITY.UPDATE_BUFFS, (stacks, a) => {
  if (isOutro(a)) revoke(THORN_BUFF);
  return "Ice Thorn";
});
export const PRISM_BUFF = new Buff(PRIORITY.UPDATE_BUFFS, (stacks, a) => {
  if (isOutro(a)) revoke(PRISM_BUFF);
  return "Ice Prism";
});
export const GLACIER_BUFF = new Buff(PRIORITY.UPDATE_BUFFS, (stacks, a) => {
  if (isOutro(a)) revoke(GLACIER_BUFF);
  return `Glacier x${stacks}`;
}, 2);

// --- forte circuit: Detonate itself (Heavy Attack DMG), then Ice Burst on whichever Ice
//     Creations are up (Resonance Skill DMG, type2: BURST for Avalanche/S5's own scoping). The
//     Ice Thorn burst is the one exception noted above: 0 concerto, just 2 Energy.
export const FHA = sanhuaAction("Forte Heavy", {
  node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 372.58, energy: 4.68, concerto: 15,
  priority: PRIORITY.UPDATE_BUFFS,
  apply() {
    if (stacksOf(THORN_BUFF)) { queue(DETONATE_THORN); removeStack(THORN_BUFF); }
    if (stacksOf(PRISM_BUFF)) { queue(DETONATE_PRISM); removeStack(PRISM_BUFF); }
    const glaciers = stacksOf(GLACIER_BUFF);
    for (let i = 0; i < glaciers; i++) queue(DETONATE_GLACIER);
    if (glaciers) removeStack(GLACIER_BUFF, glaciers);
  },
});
export const DETONATE_THORN = sanhuaAction("Detonate Intro", { node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Skill, type2: Type2.Burst, mv: 59.65, energy: 2, concerto: 0 });
export const DETONATE_PRISM = sanhuaAction("Detonate Skill", {
  node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Skill, type2: Type2.Burst, mv: 79.53, energy: 7, concerto: 15,
  priority: PRIORITY.UPDATE_BUFFS,
  apply: () => { if (stacksOf(S6)) grantOthers(S6_ATK); },
});
export const DETONATE_GLACIER = sanhuaAction("Detonate Liberation", {
  node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Skill, type2: Type2.Burst, mv: 139.17, energy: 7, concerto: 15,
  priority: PRIORITY.UPDATE_BUFFS,
  apply: () => { if (stacksOf(S6)) grantOthers(S6_ATK); },
});

/** Intro is no longer placed here — the preceding member's outro triggers it (see `onIntro`).
 *  Skill/Liberation come first so Condensation (opened by Intro) covers the Skill cast; the
 *  basics chain ends on Basic 5 so Avalanche (and S1's Crit Rate) are up for the Detonate that
 *  follows it, and Blade Mastery's window (if S4) still covers that same Detonate. */
export const ROTATION = [
  Skill, Liberation, FHA, ACTION_HERON, Outro,
];
