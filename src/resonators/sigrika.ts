/**
 * Sigrika — an aero gauntlets main DPS built almost entirely around Echo Skill DMG: Basic Attack
 * - Elucidated, Dodge Counter - Decipher, BIG BOOMY BOOM!, Soliskin to the Aid, Heavy Attack -
 * Schemata of Runes and its own Runic follow-ups, and Forte Circuit - Learn My True Name are all
 * `type: Echo` even though most aren't literal Echo casts.
 *
 * Runes (Trust/Answer, up to 4 held) gate which Runic follow-up Schemata of Runes triggers —
 * this engine doesn't track a live 4-slot rune queue (same "fixed valid line, no live queue"
 * treatment as Buling's Trigram/Zhezhi's Imprints), so instead of one Schemata action that reads
 * bank state, there are three separate named variants below (Runic Outburst/Chain Whip/
 * Soliskin) — the rotation author picks whichever the placed line actually earns. Only Runic
 * Outburst (a Trust+Answer spend, the natural default from an even mix of triggers) is placed
 * in the default rotation; the other two are exported for completeness.
 *
 * Convergent/Divergent (doubling the next Rune gained) are pure future-generation bookkeeping —
 * no damage or stat of their own — so they're skipped entirely rather than half-modelled.
 * Encapsulated (Outro) is a Stagnate-on-Echo-cast crowd-control effect, out of scope same as
 * every other CC-only mechanic elsewhere. Full Stop is tracked on forte1, Soliskin Vitality on
 * forte2 — both real gauges with a real damage payout, unlike the rune queue.
 *
 * Numbers from nanoka.cc (character 1412, https://ww.nanoka.cc/character/1412, weapon 21040066, echo 6000192) for every named hit's
 * MV — she's on wuwalab.com too, but unregistered there yet (checked directly). Energy/concerto/
 * offtune/Full Stop/Rune deltas aren't cleanly exposed on nanoka's own page, but the migrated
 * sheet already has her — same gap Brant/Sanhua/Buling/Carlotta have, filled the same way.
 * Mid-air/Mid-air Dodge Counter/the base Heavy Attack have no sheet row at all, so they're still
 * bare (nanoka's own MV only).
 */
import { Buff, GlobalBuff, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro, isEcho } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, Type1, Node, Cast, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_2PC, SOUND_OF_TRUE_NAME_5PC } from "../echoes/lahairoi.js";
import { SOLSWORN_CIPHERS } from "../weapons/gauntlet.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#7ee0c9";

/** Full Stop — gates Learn My True Name at 100; Schemata of Runes grants 50 a cast. */
export const SIGRIKA_FULL_STOP = Resource.Forte1;
/** Soliskin Vitality — up to 60, +10 per ally Echo Skill cast (echoes assumed unique, per the
 *  standing rule); Schemata of Runes spends 30 of it for a stronger Runic follow-up. */
export const SIGRIKA_VITALITY = Resource.Forte2;

/* --------------------------------------------------------------- resonator */

/** True Names Aligned (Inherent Skill): a teammate's Echo Skill cast grants a stack of Blessing
 *  of Runes, up to 6 — +3% Aero DMG Bonus / +3% Echo Skill DMG Bonus a stack to whoever's active,
 *  +30%/+30% flat more at the full 6. Global: it escalates off any team member's own Echo cast
 *  and pays whoever's currently active, not just Sigrika. */
export const BLESSING_OF_RUNES = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  if (isEcho(ctx.action!)) ctx.grantGlobal(BLESSING_OF_RUNES);
  // re-read live: the grant above may just have moved it past the `stacks` this call started with
  const held = ctx.stacksOf(BLESSING_OF_RUNES);
  if (!ctx.action!.active) return;
  ctx.add(3 * held, Element.Aero, Stat.DmgBonus);
  ctx.add(3 * held, Type1.Echo, Stat.DmgBonus);
  if (held >= 6) {
    ctx.add(30, Element.Aero, Stat.DmgBonus);
    ctx.add(30, Type1.Echo, Stat.DmgBonus);
  }
  return `Sigrika: Blessing of Runes x${held}`;
}, 6);

/** The same passive's own Energy Regen conversion: +2% Echo Skill DMG Bonus per 1% ER over 125%,
 *  capped at 50%. EARLY_CONVERSION so every ER contribution has already landed. */
export const SIGRIKA_ER_CONVERSION = new Buff(PRIORITY.EARLY_CONVERSION, (ctx) => {
  const over = Math.max(0, ctx.get(Stat.Er) - 125);
  ctx.add(Math.min(50, 2 * over), Type1.Echo, Stat.DmgBonus);
  return "Sigrika: True Names Aligned";
});

/** Innate Gift?: up to 2 stacks, each +30% DMG Amplification to the Runic follow-ups and Learn
 *  My True Name — granted when Schemata of Runes spends a full 30 Soliskin Vitality (see the
 *  Schemata actions below). Ends after Learn My True Name resolves, or on switching off field. */
export const INNATE_GIFT = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  if (!ctx.action!.active) { ctx.revoke(INNATE_GIFT); return; }
  ctx.add(30 * stacks, Type1.Echo, Stat.Amp);
  return `Sigrika: Innate Gift? x${stacks}`;
}, 2);

/** Applause handoff — In This Very Moment carries no team buff on her own page (unlike most
 *  other kits' outros), so nothing is granted here; the action itself is a plain damage hit. */

/** Her echoes: Nameless Explorer mainslot + its own matching Sound of True Name set (both her
 *  own, echoes/lahairoi.js) — the pairing named directly. Solsworn Ciphers (her own signature) lives
 *  in weapons/gauntlet.js. 43311 crit-rate build; her weapon's own substat is Crit DMG, same balancing
 *  precedent as every other CR-tree kit here (Cantarella, Carlotta). */
const SIGRIKA_LOADOUT = new Loadout(
  SOLSWORN_CIPHERS, NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC, SOUND_OF_TRUE_NAME_2PC,
  mainstats("CR", "aero aero", "atk atk"), chem("atk", "skill"),
);

export class Sigrika extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Sigrika",
      Element.Aero,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(10775, Stat.BaseHp);
        ctx.add(438, Stat.BaseAtk);
        ctx.add(1137, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(8, Stat.CritRate);
        ctx.add(12, Stat.BonusAtk);
      },
      (ctx) => { ctx.grantSelf(SIGRIKA_ER_CONVERSION); ctx.grantGlobal(BLESSING_OF_RUNES); },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Sigrika(SIGRIKA_LOADOUT);

/* ----------------------------------------------------------------- actions */

function sigrikaAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Aero,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter (One, Two, Three). Energy/concerto/offtune come from the
//     migrated sheet, same gap-fill as every other unregistered kit here — Mid-air/Dodge
//     Counter/Heavy have no sheet row at all, so they're still bare (nanoka's own MV only).
const BA1 = sigrikaAction("Basic: One, Two, Three 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 52.97, energy: 84, concerto: 167, offtune: 2700 });
const BA2 = sigrikaAction("Basic: One, Two, Three 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 100.68, energy: 160, concerto: 318, offtune: 5100 });   // 50.34% x2
const BA3 = sigrikaAction("Basic: One, Two, Three 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 111.36, energy: 176, concerto: 350, offtune: 5600 });    // 33.41+33.41+44.54
const BA4 = sigrikaAction("Basic: One, Two, Three 4", {
  node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 206.79,   // 41.36+51.70+51.70+62.03
  energy: 327, concerto: 651, offtune: 10400,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(DECIPHER); },
});
const MA = sigrikaAction("Basic: One, Two, Three (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 104.78 });
const MDC = sigrikaAction("Basic: One, Two, Three (Mid-Air Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 206.17 });
const DC = sigrikaAction("Basic: One, Two, Three (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 219.70 });   // 65.91+65.91+87.88
const HA = sigrikaAction("Heavy: One, Two, Three", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 116.28 });   // 58.14% x2

export const BA1234 = new Chain("Basic: One, Two, Three 1234", [BA1, BA2, BA3, BA4]);

/** Decipher: opened by Basic Attack Stage 4, 5s real duration (short — lost after the outro
 *  action gains stats). While up, Normal Attack becomes Elucidated and Dodge Counter becomes
 *  Decipher's own variant; Resonance Skill also has its own Decipher-gated forms below. */
export const DECIPHER = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(DECIPHER);
  return "Sigrika: Decipher";
});

// --- Decipher-gated finishers: both grant a Rune: Trust and exit Decipher, both Echo Skill DMG
//     (the migrated sheet only has one row for the pair — same numbers, both used here)
const Elucidated = sigrikaAction("Basic: Elucidated", {
  node: Node.Normal, cast: Cast.Basic, type: Type1.Echo, mv: 307.79,   // 61.56% x3 + 123.11%
  energy: 260, concerto: 520,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.revoke(DECIPHER); },
});
export const DodgeCounterDecipher = sigrikaAction("Basic: Decipher (Dodge Counter)", {
  node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Echo, mv: 307.79,   // 61.56% x3 + 123.11%
  energy: 260, concerto: 520,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.revoke(DECIPHER); },
});

// --- resonance skill: BOOMY BOOM! (base), or — while in Decipher — BIG BOOMY BOOM! (grants
//     Rune: Answer) / Soliskin to the Aid (also 50+ Full Stop, likewise grants Rune: Answer)
const Skill = sigrikaAction("Skill: BOOMY BOOM!", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 143.15, energy: 225, concerto: 450 });   // 28.63% x3 + 57.26%
const BigSkill = sigrikaAction("Skill: BIG BOOMY BOOM!", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 288.09,   // 28.81% x4 + 172.85%
  energy: 245, concerto: 490,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.revoke(DECIPHER); },
});
const SoliskinAid = sigrikaAction("Skill: Soliskin to the Aid", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Echo, mv: 278.26,   // 27.83% x3 + 194.77%
  energy: 236, concerto: 472,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.revoke(DECIPHER); },
});

// --- forte circuit: Schemata of Runes always lands its own base hit, then queues one of three
//     Runic follow-ups depending on which pair of Runes it spends — matching the migrated sheet's
//     own shape (a base "FHA" row plus separate "Runic Outburst/Chain Whip/Soliskin" rows), same
//     trigger-then-queued-followup pattern as Sanhua's own Detonate. Three base variants exist
//     rather than one that reads live rune state (see the file header — the rotation places
//     whichever variant the runes it actually banked support). Spending a full 30 Soliskin
//     Vitality grants Innate Gift? and a flat +50% DMG Multiplier on the follow-up itself; the
//     lesser 15%-per-10-points path (partial Vitality) isn't modelled separately — the rotation
//     below always has 30+ banked by the time Schemata comes up.
function spendVitality(ctx: import("../state.js").Ctx): void {
  if (ctx.counter(SIGRIKA_VITALITY) < 30) return;
  ctx.setCounter(SIGRIKA_VITALITY, ctx.counter(SIGRIKA_VITALITY) - 30);
  ctx.add(50, Stat.MulMv);
  ctx.grantSelf(INNATE_GIFT);
}
const RunicOutburst = sigrikaAction("Skill: Runic Outburst", {   // 117.67+205.92+264.75
  node: Node.Forte, type: Type1.Echo, mv: 588.34, energy: 1000, concerto: 700, offtune: 24800,
  priority: PRIORITY.BUFF_STATS, apply: spendVitality,
});
const RunicChainWhip = sigrikaAction("Skill: Runic Chain Whip", {   // 49.70x4+66.26x3
  node: Node.Forte, type: Type1.Echo, mv: 397.58, energy: 1000, concerto: 703, offtune: 24802,
  priority: PRIORITY.BUFF_STATS, apply: spendVitality,
});
const RunicSoliskin = sigrikaAction("Skill: Runic Soliskin", {   // 39.76+59.63x4+119.26
  node: Node.Forte, type: Type1.Echo, mv: 397.54, energy: 1000, concerto: 703, offtune: 24802,
  priority: PRIORITY.BUFF_STATS, apply: spendVitality,
});

const SchemataOutburst = sigrikaAction("Heavy: Schemata of Runes (Runic Outburst)", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Echo, mv: 132.51,
  energy: 334, concerto: 750, offtune: 27500, forte1: 50,
  priority: PRIORITY.UPDATE_BUFFS, apply(ctx) { ctx.queue(RunicOutburst); },
});
export const SchemataChainWhip = sigrikaAction("Heavy: Schemata of Runes (Runic Chain Whip)", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Echo, mv: 132.51,
  energy: 334, concerto: 750, offtune: 27500, forte1: 50,
  priority: PRIORITY.UPDATE_BUFFS, apply(ctx) { ctx.queue(RunicChainWhip); },
});
export const SchemataSoliskin = sigrikaAction("Heavy: Schemata of Runes (Runic Soliskin)", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Echo, mv: 132.51,
  energy: 334, concerto: 750, offtune: 27500, forte1: 50,
  priority: PRIORITY.UPDATE_BUFFS, apply(ctx) { ctx.queue(RunicSoliskin); },
});

/** Learn My True Name: at 100 Full Stop, spends it all. */
const LearnMyTrueName = sigrikaAction("Forte: Learn My True Name", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Echo, mv: 1211.48,   // 302.87% + 908.61%
  energy: 543, concerto: 3000, offtune: 101300, forte1: -100,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.revoke(INNATE_GIFT); },
});

// --- liberation: Where Trust Leads Me!
const Liberation = sigrikaAction("Liberation: Where Trust Leads Me!", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Echo, mv: 861.43,
  energy: -12500, concerto: 2000, offtune: 50400,
});

// --- intro / outro
const Intro = sigrikaAction("Intro: Solsworn Etymology", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 163.42, energy: 1000, concerto: 1000, offtune: 7700,
});
const Outro = sigrikaAction("Outro: In This Very Moment", {
  cast: Cast.Outro, type: Type1.Outro, mv: 795, concerto: -10000, active: false,
});

/** A kit-valid line: Intro opens Decipher-free, the basics chain opens Decipher on Stage 4,
 *  Elucidated spends it for a Rune: Trust, BOOMY BOOM! into BIG BOOMY BOOM! banks a Rune: Answer
 *  (Decipher re-opened by another basics pass), Schemata of Runes spends the Trust+Answer pair
 *  for Runic Outburst, Learn My True Name closes the forte circuit once Full Stop is banked,
 *  Liberation closes the loop. Intro is no longer placed here — the preceding member's outro
 *  triggers it (see the standing convention). */
export const ROTATION = [
  BA1234, Elucidated,
  BA1234, Skill, BigSkill,
  SchemataOutburst, LearnMyTrueName,
  ECHO_CAST, Liberation, Outro,
];
