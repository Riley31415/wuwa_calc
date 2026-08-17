/**
 * Carlotta — a glacio pistols main DPS, almost everything she does "considered Resonance Skill
 * DMG": Chromatic Splendor, Death Knell, Fatal Finale and Imminent Oblivion all carry `type:
 * Skill` for that reason, even though only two of them are literal Resonance Skill button
 * presses.
 *
 * Substance (forte1, 0-120) gates Heavy Attack - Containment Tactics and Forte Circuit -
 * Imminent Oblivion (both spend it all) and Final Bow: if it's still full the instant Liberation
 * (Era of New Wave) is cast, that hit and the whole Twilight Tango that follows (Death Knell,
 * Fatal Finale) get +80% DMG Multiplier, ending when Fatal Finale resolves. Read live off
 * `counter(Forte1)` at the Liberation cast, same threshold-check shape as Qiuyuan's Bamboo's
 * Shade/Quietude Within — in the rotation below Imminent Oblivion spends the gauge right before
 * Liberation, so Final Bow doesn't actually trigger on this particular line; a build that skips
 * Imminent Oblivion or reorders around it would see it fire. Moldable Crystals (the resource
 * gating Basic Attack -> Necessary Measures and Dodge Counter's own bonus) aren't separately
 * tracked — same "fixed valid line, no live queue" treatment as Buling's Trigram/Zhezhi's
 * Imprints — Substance's own forte1 deltas are taken as given rather than derived from a crystal
 * count.
 *
 * Deconstruction (Ars Gratia Artis, Inherent Skill, always assumed known): Intro, Chromatic
 * Splendor, Liberation, Death Knell and Imminent Oblivion all inflict it, and any DMG (not just
 * Carlotta's own) against an inflicted target ignores 18% DEF. Modelled as a permanent-uptime
 * GlobalBuff adding team-wide DEF ignore rather than a real 4s-duration enemy debuff — it's
 * re-inflicted by nearly every cast in her kit, so per the standing duration rule it's
 * effectively always up past the first hit.
 *
 * Numbers from nanoka.cc (character 1107, echo 6000083, weapon 21030016) for every named hit's
 * MV, cross-checked against the migrated sheet's own multi-hit totals (all agree exactly).
 * Energy/concerto/offtune/Substance deltas aren't cleanly exposed on the page itself, so those
 * come from the migrated sheet directly, same gap other kits (Sanhua, Brant, Zhezhi) have — one
 * exception: the sheet's own Intro Substance gain (+60) disagrees with the page's explicit "restore
 * 30 points of Substance upon casting Intro Skill", so the page is trusted there instead, per the
 * standing rule. Her own page describes no Outro handoff buff at all (unlike every other kit
 * implemented so far) — Closing Remark is left as a plain damage hit, nothing invented.
 */
import { Buff, GlobalBuff, Gear, Mainslot, Action, PRIORITY, WHITE, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro, isIntro, isLiberation } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Cast, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { FROSTY_RESOLVE_2PC, FROSTY_RESOLVE_5PC } from "../shared/echoes.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#a78bfa";

/** The gauge the game shows — up to 120, spent by Containment Tactics/Imminent Oblivion. */
export const CARLOTTA_SUBSTANCE = Resource.Forte1;

/* --------------------------------------------------------------- resonator */

/** Deconstruction: any DMG against an inflicted target ignores 18% DEF — modelled as team-wide
 *  DEF ignore, permanent uptime once inflicted (see file header). Global so it lands on whoever
 *  is currently acting, not just Carlotta. */
export const DECONSTRUCTION = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(18, Stat.DefShred); return "Carlotta: Deconstruction"; });

/** Final Bow: +80% DMG Multiplier on Era of New Wave, Death Knell and Fatal Finale — granted at
 *  the Liberation cast if Substance was full then (see Lib1 below), spent by identity check
 *  since these three all share `type: Skill` with several of her other hits that shouldn't get
 *  it (same pattern as Sanhua's S4_WINDOW). Ends when Fatal Finale resolves, or on outro if
 *  Twilight Tango is still open. */
export const FINAL_BOW = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  const a = ctx.action!;
  if (a === Lib1 || a === DeathKnell || a === FatalFinale) ctx.add(80, Stat.MulMv);
  if (a === FatalFinale || isOutro(a)) ctx.revoke(FINAL_BOW);
  return "Carlotta: Final Bow";
});

/* ------------------------------------------------------------------ weapon */

/** The Last Dance, R1: Silent Eulogy. +12% ATK flat. Intro or Liberation cast grants +48%
 *  Resonance Skill DMG Bonus for 5s — short enough that only the standing outro-loss rule
 *  matters. */
export const THE_LAST_DANCE = new Gear("The Last Dance", (ctx) => {
  ctx.add(500, Stat.BaseAtk);
  ctx.add(72, Stat.CritDmg);
  ctx.add(12, Stat.BonusAtk);
  if (isIntro(ctx.action!) || isLiberation(ctx.action!)) ctx.grantSelf(SILENT_EULOGY);
});
export const SILENT_EULOGY = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(48, DamageType.Skill, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(SILENT_EULOGY);
  return "The Last Dance: Silent Eulogy";
});

/* -------------------------------------------------------------- echo, sonata */

/** The echo's own base cast — the Strike Capacitor-charged dive form (a second 405% hit with
 *  its own freeze, unlocked by the wearer's own Liberation resetting its cooldown) isn't
 *  modelled separately, same treatment as other cooldown/charge-gated echo forms elsewhere
 *  (Bell-Borne's held variant, False Sovereign's charge count). */
export const ACTION_SENTRY_CONSTRUCT = new Action("Echo: Sentry Construct", {
  color: WHITE,
  cast: DamageType.Echo,
  element: Element.Glacio,
  scaling: Scaling.Atk,
  type: DamageType.Echo,
  mv: 405,
  energy: 562,
});

/** Sentry Construct, her own mainslot echo — she's the only glacio pistols Resonance-Skill
 *  character, so it lives here rather than shared/echoes.js. Flat Glacio/Resonance Skill DMG
 *  Bonus for whoever wears it, no trigger. */
export const SENTRY_CONSTRUCT = new Mainslot("Sentry Construct", ACTION_SENTRY_CONSTRUCT, (ctx) => {
  ctx.add(12, Element.Glacio, Stat.DmgBonus);
  ctx.add(12, DamageType.Skill, Stat.DmgBonus);
});

/** Her echoes: Sentry Construct mainslot, full 5pc Frosty Resolve (both bonuses, shared/echoes.js
 *  — the same Overlord Class echo carries either that or Empyrean Anthem, Zhezhi's own pick).
 *  43311 crit-rate build; nearly everything she does is Resonance Skill DMG. */
const CARLOTTA_LOADOUT = new Loadout(
  THE_LAST_DANCE, SENTRY_CONSTRUCT, FROSTY_RESOLVE_5PC, FROSTY_RESOLVE_2PC,
  mainstats("CR", "glacio glacio", "atk atk"), chem("atk", "skill"),
);

export class Carlotta extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Carlotta",
      Element.Glacio,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(12450, Stat.BaseHp);
        ctx.add(463, Stat.BaseAtk);
        ctx.add(1198, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(8, Stat.CritRate);
        ctx.add(12, Stat.BonusAtk);
      },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Carlotta(CARLOTTA_LOADOUT);

/* ----------------------------------------------------------------- actions */

function carlottaAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Glacio,
    color: COLOR,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- basics, mid-air, dodge counter (Silent Execution)
const BA1 = carlottaAction("Basic 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 54.08, energy: 80, concerto: 160, offtune: 2560 });
const BA2 = carlottaAction("Basic 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 131.83, energy: 196, concerto: 390, offtune: 6240 });
export const MA1 = carlottaAction("Mid-air Attack", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 104.78, energy: 300, concerto: 600, offtune: 9600 });
export const MA2 = carlottaAction("Customary Greetings", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 239.98, energy: 211, concerto: 420, offtune: 6720 });
export const DC = carlottaAction("Dodge Counter", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Basic, mv: 241.32, energy: 358, concerto: 715, offtune: 11426, forte1: 10 });

// --- Necessary Measures: Basic Attack replaced while holding Moldable Crystals, each stage
//     spending one. Not placed in the rotation below (see file header), kept for completeness.
export const NM1 = carlottaAction("Necessary Measures 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 65.91, energy: 98, concerto: 195, offtune: 3120, forte1: 10 });
export const NM2 = carlottaAction("Necessary Measures 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 133.51, energy: 198, concerto: 396, offtune: 5320, forte1: 10 });
export const NM3 = carlottaAction("Necessary Measures 3", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 233.25, energy: 347, concerto: 690, offtune: 11040, forte1: 10 });

// --- heavy attack: base cast, and Containment Tactics once Substance is full
const HA = carlottaAction("Heavy", { node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 152.12, energy: 226, concerto: 452, offtune: 7200 });
export const EHA = carlottaAction("Containment Tactics", { node: Node.Normal, cast: DamageType.Heavy, type: DamageType.Heavy, mv: 228.18, energy: 226, concerto: 1500, offtune: 7200, forte1: -120 });

// --- resonance skill: Art of Violence, then Chromatic Splendor (press again shortly after)
const Skill1 = carlottaAction("Art of Violence", {
  node: Node.Skill, cast: DamageType.Skill, type: DamageType.Skill, mv: 288.22, energy: 200, concerto: 500, offtune: 6136,
});
const Skill2 = carlottaAction("Chromatic Splendor", {
  node: Node.Skill, cast: DamageType.Skill, type: DamageType.Skill, mv: 563.64, energy: 300, concerto: 500, offtune: 6136, forte1: 30,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(DECONSTRUCTION); },
});

// --- forte circuit: Imminent Oblivion, considered Resonance Skill DMG, spends all Substance
const FHA = carlottaAction("Imminent Oblivion", {
  node: Node.Forte, cast: DamageType.Heavy, type: DamageType.Skill, mv: 835.36, energy: 1700, concerto: 1500, offtune: 97361, forte1: -120,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(DECONSTRUCTION); },
});

// --- liberation: Era of New Wave opens Twilight Tango; Death Knell (press Normal/Liberation,
//     up to 4 times) then Fatal Finale (at 4 Meta Vectors) close it out — Meta Vector count isn't
//     separately tracked, the rotation below just places exactly 4 Death Knells then one Fatal
//     Finale, matching the kit text.
const Lib1 = carlottaAction("Liberation", {
  node: Node.Liberation, cast: DamageType.Liberation, type: DamageType.Skill, mv: 402.71,
  energy: -12500, concerto: 2000, offtune: 33600,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    if (ctx.counter(Resource.Forte1) >= 120) ctx.grantSelf(FINAL_BOW);
    ctx.setCounter(Resource.Forte1, 0);   // Twilight Tango removes all Substance on opening
    ctx.grantGlobal(DECONSTRUCTION);
  },
});
const DeathKnell = carlottaAction("Death Knell", {
  node: Node.Liberation, type: DamageType.Skill, mv: 241.64, energy: 500, concerto: 700, offtune: 9600,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(DECONSTRUCTION); },
});
const FatalFinale = carlottaAction("Fatal Finale", {
  node: Node.Liberation, type: DamageType.Skill, mv: 644.33, energy: 0, concerto: 1000, offtune: 50400,
});

// --- intro / outro
const Intro = carlottaAction("Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Intro, mv: 298.23,
  energy: 1000, concerto: 1000, offtune: 9335, forte1: 30,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(DECONSTRUCTION); },
});
/** Closing Remark — no handoff buff of any kind is described on her own kit page, unlike every
 *  other kit implemented so far; left as a plain damage hit rather than inventing one. */
const Outro = carlottaAction("Outro", {
  cast: DamageType.Outro, type: DamageType.Outro, mv: 794.2, concerto: -10000, active: false,
});

/** The migrated sheet's `lotta` rotation: Intro (auto, not placed) tops Substance partway,
 *  Art of Violence into Chromatic Splendor, a mid-air hit, Imminent Oblivion spends the gauge,
 *  Liberation opens Twilight Tango (Substance already spent, so Final Bow doesn't trigger on
 *  this particular line — see file header), four Death Knells and a Fatal Finale close it out,
 *  a second Art of Violence/Chromatic Splendor pair, then her own echo cast and Outro. The
 *  sheet's own row order has the echo cast *after* Outro — moved ahead of it here, same as
 *  every other kit's own mainslot placement, since Outro already hands the field to whoever's
 *  next by the time a later step evaluates. */
export const ROTATION = [
  Skill1, Skill2, MA1, FHA,
  Lib1, DeathKnell, DeathKnell, DeathKnell, DeathKnell, FatalFinale,
  Skill1, Skill2, ECHO_CAST, Outro,
];
