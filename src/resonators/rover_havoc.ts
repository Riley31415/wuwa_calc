/**
 * Rover: Havoc — a havoc sword main DPS, standard/permanent-banner 5-star (unlocked via the
 * 1.0 story quest, not a limited gacha pull — per explicit instruction, "implement to S6 and
 * allow by default": `alwaysUnlocked = true`, same display treatment as a 4-star's own
 * sequences, see `Resonator.alwaysUnlocked`).
 *
 * Umbra (forte1, 0-100): builds off Basic Attack hits/Skill/Liberation/Intro casts. At 100,
 * hold Basic Attack to cast Devastation (Heavy Attack DMG) and enter Dark Surge: Basic Attack
 * becomes a re-numbered 5-stage Enhanced Basic Attack, Heavy Attack becomes Enhanced Heavy
 * Attack (chaining into Thwackblade, then back into Enhanced Basic Attack 3), and Resonance
 * Skill Wingblade is replaced by Lifetaker. Modelled as a Buff (`DARK_SURGE`) granted on
 * Devastation, spending the full 100 Umbra — no explicit real duration is given on the page, so
 * per the standing short-window rule it's lost after the outro action gains stats, same as
 * every other window without a stated real-time length.
 *
 * Metamorph (Inherent Skill): +20% Havoc DMG Bonus while in Dark Surge — paid by `DARK_SURGE`
 * directly. Bleak Crescendo (Inherent Skill, +1 Energy per Basic Attack hit in Dark Surge, 1/s
 * ICD): skipped, same simplification as every other ICD-gated per-hit trickle elsewhere
 * (Augusta's Glory's Favor, Changli's Crimson Phoenix).
 *
 * Numbers from nanoka.cc (character 1605); no wuwalab.com entry and no migrated-sheet row exist
 * for this character (brand new, not in the migration data at all — confirmed by grep), so
 * unlike every other kit here, Energy/Concerto/Offtune/Umbra-gain deltas have literally no
 * available source and are left at 0 throughout, flagged here rather than guessed. MV/scaling/
 * buff numbers are all nanoka's own "Skill Attributes (Lv.10)" table, which is complete.
 */
import { Buff, GlobalBuff, Gear, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { NM_CROWNLESS, HAVOC_ECLIPSE_2PC, HAVOC_ECLIPSE_5PC } from "../echoes/jinzhou.js";
import { EMERALD_OF_GENESIS } from "../weapons/standard.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#5c5c5c";

/** Umbra is the gauge the game shows — up to 100, spent entirely by Devastation. */
export const ROVER_UMBRA = Resource.Forte1;

/* --------------------------------------------------------------- resonator */

/** Dark Surge: opened by Devastation, no stated real duration — short-window treatment (lost
 *  after the outro action gains stats). Metamorph pays its own +20% Havoc DMG Bonus here. */
export const DARK_SURGE = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) { ctx.revoke(DARK_SURGE); return; }
  ctx.add(20, Element.Havoc, Stat.DmgBonus);
  return "Rover: Dark Surge (Metamorph)";
});

/* ------------------------------------------------------------------- sequences */

/** S1 Cryptic Insight: +30% Resonance Skill DMG Bonus flat (Wingblade and its Dark Surge
 *  replacement Lifetaker both share `cast: Cast.Skill`). */
export const S1 = new Gear("Rover S1", (ctx) => { ctx.add(30, DamageType.Skill, Stat.DmgBonus); });

/** S2 Waning Crescent: resets Resonance Skill's cooldown on entering Dark Surge — no real-time
 *  clock here, so this is a no-op, same treatment as every other cooldown-only effect. */
export const S2 = new Gear("Rover S2");

/** S3 Surging Resonance: HP restore on Basic Attack 5 in Dark Surge — healing is out of scope. */
export const S3 = new Gear("Rover S3");

/** S4 Annihilated Silence: Devastation and Liberation Deadening Abyss reduce the target's own
 *  Havoc RES by 10% for 20s on hit — team-wide (RES reduction is target-side, not source-side),
 *  short window (≤20s) so lost after the outro action gains stats. */
export const S4 = new Gear("Rover S4", (ctx) => {
  if (ctx.action === Devastation || ctx.action === Liberation) ctx.grantGlobal(S4_RES_SHRED);
});
export const S4_RES_SHRED = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) { ctx.revoke(S4_RES_SHRED); return; }
  ctx.add(10, Element.Havoc, Stat.ResIgnore);
  return "Rover S4: Annihilated Silence";
});

/** S5 Aeon Symphony: Enhanced Basic Attack Stage 5 (Dark Surge) deals +50% additional Havoc
 *  DMG, scoped to that one hit specifically. */
export const S5 = new Gear("Rover S5", (ctx) => {
  if (ctx.action === EBA5) ctx.add(50, Stat.MulMv);
});

/** S6 Ebbing Undercurrent: +25% Crit Rate while in Dark Surge. */
export const S6 = new Gear("Rover S6", (ctx) => {
  if (ctx.stacksOf(DARK_SURGE)) ctx.add(25, Stat.CritRate);
});

/** His echoes: Nightmare: Crownless mainslot + Havoc Eclipse 5pc/2pc (all shared with Camellya,
 *  echoes/jinzhou.js) — Emerald of Genesis (weapons/standard.js) as his weapon, by explicit instruction.
 *  43311 crit-rate build. All six sequences carried by default, per "implement to S6" — see the
 *  file header. */
const ROVER_LOADOUT = new Loadout(
  EMERALD_OF_GENESIS, NM_CROWNLESS, HAVOC_ECLIPSE_5PC, HAVOC_ECLIPSE_2PC,
  mainstats("CR", "havoc havoc", "atk atk"), chem("atk", "basic"),
);

export class RoverHavoc extends Resonator {
  constructor(loadout: Loadout, sequences: Gear[] = []) {
    super(
      "Rover: Havoc",
      Element.Havoc,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(10825, Stat.BaseHp);
        ctx.add(413, Stat.BaseAtk);
        ctx.add(1259, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(12, Stat.BonusAtk);
        ctx.add(12, Element.Havoc, Stat.DmgBonus);
      },
      null,
      null,
      sequences,
    );
    this.alwaysUnlocked = true;   // standard 5-star — see the file header
  }
}
export const LOADOUT: ResonatorFactory = () => new RoverHavoc(ROVER_LOADOUT, [S1, S2, S3, S4, S5, S6]);

/* ----------------------------------------------------------------- actions */

function roverAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Havoc,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter (Tuneslayer), outside Dark Surge
const BA1 = roverAction("Basic: Tuneslayer 1", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 56.67 });
const BA2 = roverAction("Basic: Tuneslayer 2", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 113.34 });   // 56.67% x2
const BA3 = roverAction("Basic: Tuneslayer 3", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 85.00 });
const BA4 = roverAction("Basic: Tuneslayer 4", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 120.90 });   // 40.30% x3
const BA5 = roverAction("Basic: Tuneslayer 5", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 188.88 });   // 94.44% x2
export const BA12345 = new Chain("Basic: Tuneslayer 12345", [BA1, BA2, BA3, BA4, BA5]);

export const MA = roverAction("Mid-air Attack", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Basic, mv: 117.10 });
export const DC = roverAction("Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 179.43 });
const HA = roverAction("Heavy Attack", { node: Node.Normal, cast: Cast.Heavy, type: DamageType.Heavy, mv: 95.43 });

// --- forte circuit: Devastation, at full Umbra — enters Dark Surge, considered Heavy Attack DMG
const Devastation = roverAction("Forte: Devastation", {
  node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 228.14, forte1: -100,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(DARK_SURGE); },
});

// --- Dark Surge: Enhanced Basic Attack 1-5, Enhanced Heavy Attack -> Thwackblade -> re-entry
//     into Enhanced Basic 3, Enhanced Mid-air/Dodge Counter — all considered their own base
//     damage types per the kit text ("Umbra: ... DMG, considered as Heavy Attack DMG" only for
//     the Heavy/Thwackblade pair; the basics stay Basic Attack DMG).
const EBA1 = roverAction("Umbra: Basic Attack 1", { node: Node.Forte, cast: Cast.Basic, type: DamageType.Basic, mv: 56.37 });
const EBA2 = roverAction("Umbra: Basic Attack 2", { node: Node.Forte, cast: Cast.Basic, type: DamageType.Basic, mv: 93.94 });
const EBA3 = roverAction("Umbra: Basic Attack 3", { node: Node.Forte, cast: Cast.Basic, type: DamageType.Basic, mv: 155.67 });
const EBA4 = roverAction("Umbra: Basic Attack 4", { node: Node.Forte, cast: Cast.Basic, type: DamageType.Basic, mv: 222.78 });   // 37.13%x3+111.39%
const EBA5 = roverAction("Umbra: Basic Attack 5", { node: Node.Forte, cast: Cast.Basic, type: DamageType.Basic, mv: 228.15 });   // 28.52%x4+114.07%
export const EBA12345 = new Chain("Umbra: Basic Attack 12345", [EBA1, EBA2, EBA3, EBA4, EBA5]);

export const EMA = roverAction("Umbra: Plunging Attack", { node: Node.Forte, cast: Cast.Basic, type: DamageType.Basic, mv: 123.27 });
export const EDC = roverAction("Umbra: Dodge Counter", { node: Node.Forte, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 316.71 });

const EHA = roverAction("Umbra: Heavy Attack", { node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 128.83 });
const Thwackblade = roverAction("Umbra: Thwackblade", { node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 166.45 });   // 126.65%+9.95%x4

// --- resonance skill: Wingblade outside Dark Surge, Lifetaker (Skill replacement) inside it —
//     both "Resonance Skill DMG" per S1's own wording, hence sharing cast: Cast.Skill
const Wingblade = roverAction("Skill: Wingblade", { node: Node.Skill, cast: Cast.Skill, type: DamageType.Skill, mv: 572.58 });   // 286.29% x2
const Lifetaker = roverAction("Umbra: Lifetaker", { node: Node.Forte, cast: Cast.Skill, type: DamageType.Skill, mv: 592.50 });   // 276.35%x2+9.95%x4

// --- liberation: Deadening Abyss
const Liberation = roverAction("Liberation: Deadening Abyss", {
  node: Node.Liberation, cast: Cast.Liberation, type: DamageType.Liberation, mv: 1520.90,
});

// --- intro / outro
const Intro = roverAction("Intro: Instant of Annihilation", {
  node: Node.Intro, cast: Cast.Intro, type: DamageType.Intro, mv: 198.81,
});
/** Soundweaver: a Havoc Field, 3 ticks (143.3% ATK each) over 6s — no real per-second clock
 *  here, so lumped into one action, same treatment as every other periodic zone elsewhere
 *  (Cantarella's Diffusion, Brant's Grief Rift). No handoff buff is described on the page. */
const Outro = roverAction("Outro: Soundweaver", {
  cast: Cast.Outro, type: DamageType.Outro, mv: 429.9, active: false,   // 143.3% x3
});

/** A kit-valid line: Intro, the normal Tuneslayer combo tops Umbra, Wingblade, Devastation
 *  spends it and enters Dark Surge, the Enhanced Basic combo, Enhanced Heavy Attack into
 *  Thwackblade into a re-entered Enhanced Basic 3, Lifetaker (Dark Surge's own Skill
 *  replacement), Liberation, Outro closes the loop out. Intro is no longer placed here — the
 *  preceding member's outro triggers it (see the standing convention). */
export const ROTATION = [
  BA12345, Wingblade, Devastation,
  EBA12345, EHA, Thwackblade, EBA3,
  Lifetaker, ECHO_CAST, Liberation, Outro,
];
