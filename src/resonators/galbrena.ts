/**
 * Galbrena — a fusion pistols main DPS. Threshold State (default) banks Sinflame off her own
 * hits; at 100, Resonance Skill - Encroach is replaced by Ascent of Malice, which converts it
 * all into Purging Flame and drops her into Demon Hypostasis — Basic/Heavy/Mid-air/Dodge Counter/
 * Skill are all replaced with their own "enhanced" forms (Seraphic Execution, Flamewing Verdict,
 * Hellsent Barrage, Purgatory Scourge, Ravage), each spending Purging Flame on hit and scaled up
 * by 1.5% DMG per point of Afterflame she's holding (own ceiling 60%, at 40 Afterflame).
 *
 * Two gaps, flagged rather than guessed:
 * - Purging Flame itself (spent per enhanced-mode hit) has no published per-hit cost, so it
 *   isn't tracked as a real gauge — Demon Hypostasis is entered once (Ascent of Malice) and the
 *   enhanced actions below are placed directly, same "fixed valid line, no live gauge" treatment
 *   as Buling's Trigram/Sigrika's Runes.
 * - Hellstride (a Dodge-triggered fixed 666-point hit, "not affected by any DMG Bonus effects")
 *   is a flat non-scaling number outside this engine's ATK/HP/DEF-scaling formula entirely, so
 *   it isn't modelled — matching the precedent of skipping every other DMG-bonus-immune fixed
 *   hit elsewhere (Carlotta's Shadow Step).
 *
 * Oathbound Hunt (Inherent Skill): landing an attack grants 1 stack (up to 4) of a team-wide-
 * scoped +5%/stack DMG Dealt bonus to Galbrena's own casts, 5.5s — short enough that only the
 * standing outro-loss rule matters; the "once every 5s per skill type" ICD isn't modelled, same
 * simplification as every other ICD-gated passive here (Augusta's Glory's Favor, etc).
 *
 * Numbers from nanoka.cc (character 1208, https://ww.nanoka.cc/character/1208, weapon 21030036, echo 6000120) for every named hit's
 * MV — she has no wuwalab.com entry yet (unreleased), so this is nanoka's own rendered "Skill
 * Attributes (Lv.10)" table. Energy/concerto/offtune/Sinflame deltas aren't cleanly exposed on
 * nanoka's own page, but the migrated sheet already has her — same gap Brant/Sanhua/Buling/
 * Carlotta/Roccia/Sigrika have, filled the same way. Mid-air Sustained Fire and the Dodge
 * Counter have no sheet row at all, so they're still bare (nanoka's own MV only).
 */
import { Buff, GlobalBuff, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro, isIntro, isEcho, isLiberation } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, DamageType, Node, Cast, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { CLAWPRINT_2PC } from "../echoes/rinascita.js";
import { CORROSAURUS, FLAMEWING_SHADOW_3PC } from "../echoes/septimont.js";
import { LUX_UMBRA } from "../weapons/pistol.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#e85c5c";

/** Sinflame is the gauge the game shows for Ascent of Malice's own gate; Afterflame is the
 *  Demon Hypostasis damage-scaling stack. */
export const GALBRENA_SINFLAME = Resource.Forte1;
export const GALBRENA_AFTERFLAME = Resource.Forte2;

/* --------------------------------------------------------------- resonator */

/** Burning Drive: +20% ATK for 4s on Intro/Hellstride/Seraphic Execution Stage 4/Encroach/
 *  Ascent of Malice/Ravage — short window, lost after the outro action gains stats. */
export const BURNING_DRIVE = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(20, Stat.BonusAtk);
  if (isOutro(ctx.action!)) ctx.revoke(BURNING_DRIVE);
  return "Galbrena: Burning Drive";
});

/** Oathbound Hunt: +5% DMG Dealt a stack (own casts only), up to 4, 5.5s — short window, ICD not
 *  modelled (see file header). */
export const OATHBOUND_HUNT = new Buff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  ctx.add(5 * stacks, Stat.TotalDmg);
  if (isOutro(ctx.action!)) ctx.revoke(OATHBOUND_HUNT);
  return `Galbrena: Oathbound Hunt x${stacks}`;
}, 4);

/** Demon Hypostasis's own Afterflame scaling: +1.5% DMG Dealt per point held, own ceiling 60%
 *  (40 Afterflame) — scoped to the five enhanced-mode actions specifically, since that's what
 *  the kit text scales, not her whole kit. */
export const AFTERFLAME_SCALING = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  const a = ctx.action!;
  if (a !== SeraphicExecution1 && a !== SeraphicExecution2 && a !== SeraphicExecution3
    && a !== SeraphicExecution4 && a !== SeraphicExecution5
    && a !== FlamewingVerdict1 && a !== FlamewingVerdict2 && a !== FlamewingVerdict3
    && a !== Ravage) return;
  const afterflame = ctx.counter(GALBRENA_AFTERFLAME);
  ctx.add(Math.min(60, 1.5 * afterflame), Stat.TotalDmg);
  return "Galbrena: Demon Hypostasis (Afterflame)";
});

/** Hellfire Absolution's own window: +85% DMG Multiplier on the same five enhanced-mode actions,
 *  14s — short enough that only the standing outro-loss rule matters. */
export const HELLFIRE_WINDOW = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  const a = ctx.action!;
  if (isOutro(a)) { ctx.revoke(HELLFIRE_WINDOW); return; }
  if (a !== SeraphicExecution1 && a !== SeraphicExecution2 && a !== SeraphicExecution3
    && a !== SeraphicExecution4 && a !== SeraphicExecution5
    && a !== FlamewingVerdict1 && a !== FlamewingVerdict2 && a !== FlamewingVerdict3) return;
  ctx.add(85, Stat.MulMv);
  return "Galbrena: Hellfire Absolution";
});

/** Her echoes: Corrosaurus mainslot, Flamewing's Shadow 3pc (both her own, echoes/septimont.js) +
 *  Flaming Clawprint 2pc (Lupa's own sonata, echoes/rinascita.js); Lux & Umbra (her own signature)
 *  lives in weapons/pistol.js. 43311 crit-rate build. */
const GALBRENA_LOADOUT = new Loadout(
  LUX_UMBRA, CORROSAURUS, FLAMEWING_SHADOW_3PC, CLAWPRINT_2PC,
  mainstats("CR", "fusion fusion", "atk atk"), chem("atk", "heavy"),
);

export class Galbrena extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Galbrena",
      Element.Fusion,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(10300, Stat.BaseHp);
        ctx.add(463, Stat.BaseAtk);
        ctx.add(1112, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(12, Stat.BonusAtk);
        ctx.add(16, Stat.CritDmg);
      },
      (ctx) => { ctx.grantSelf(AFTERFLAME_SCALING); },
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Galbrena(GALBRENA_LOADOUT);

/* ----------------------------------------------------------------- actions */

function galbrenaAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Fusion,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- Threshold State basics: Slayer's Trigger. Stages 1-3 Heavy Attack DMG, Stage 4 Echo Skill.
//     Energy/concerto/offtune/Sinflame come from the migrated sheet, same gap-fill as every
//     other unregistered kit here — Mid-air Sustained Fire/Dodge Counter have no sheet row at
//     all, so they're still bare (nanoka's own MV only).
const BA1 = galbrenaAction("Basic: Slayer's Trigger 1", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Heavy, mv: 59.18, energy: 83, concerto: 116, offtune: 2646, forte1: 7.41 });
const BA2 = galbrenaAction("Basic: Slayer's Trigger 2", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Heavy, mv: 131.53, energy: 185, concerto: 259, offtune: 5880, forte1: 18.52 });   // 26.31+26.31+78.91
const BA3 = galbrenaAction("Basic: Slayer's Trigger 3", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Heavy, mv: 142.98, energy: 200, concerto: 280, offtune: 6394, forte1: 18.52 });   // 28.60+28.60+42.89+42.89
const BA4 = galbrenaAction("Basic: Slayer's Trigger 4", {
  node: Node.Normal, cast: Cast.Basic, type: DamageType.Echo, mv: 177.86,
  energy: 249, concerto: 348, offtune: 7952, forte1: 14.81,
});
export const BA1234 = new Chain("Basic: Slayer's Trigger 1234", [BA1, BA2, BA3, BA4]);

const DC = galbrenaAction("Basic: Blood for Blood (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: DamageType.Heavy, mv: 205.24 });   // 41.05x2+61.57x2
const MA = galbrenaAction("Basic: Ashfall Barrage (Plunge)", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Heavy, mv: 143.15, energy: 200, concerto: 280, offtune: 6400 });
export const MASustained = galbrenaAction("Basic: Ashfall Barrage (Sustained Fire)", { node: Node.Normal, cast: Cast.Basic, type: DamageType.Heavy, mv: 26.84 });

// --- Threshold State heavy: Volley of Death, 3 held stages
const HA1 = galbrenaAction("Heavy: Volley of Death 1", { node: Node.Normal, cast: Cast.Heavy, type: DamageType.Heavy, mv: 106.60, energy: 150, concerto: 210, offtune: 4764, forte1: 7.41 });   // 53.30x2
const HA2 = galbrenaAction("Heavy: Volley of Death 2", { node: Node.Normal, cast: Cast.Heavy, type: DamageType.Heavy, mv: 69.18, energy: 98, concerto: 136, offtune: 3094, forte1: 25.93 });   // 34.59x2
const HA3 = galbrenaAction("Heavy: Volley of Death 3", { node: Node.Normal, cast: Cast.Heavy, type: DamageType.Echo, mv: 167.70, energy: 237, concerto: 329, offtune: 7499, forte1: 18.52 });   // 16.77x3+117.39
export const HA123 = new Chain("Heavy: Volley of Death 123", [HA1, HA2, HA3]);

// --- Threshold State resonance skill: Encroach (base), Ascent of Malice (100 Sinflame, opens
//     Demon Hypostasis and converts Sinflame into Purging Flame — see file header)
const Encroach = galbrenaAction("Skill: Encroach", {
  node: Node.Skill, cast: Cast.Skill, type: DamageType.Heavy, mv: 35.78,   // 10.74+25.04
  energy: 659, offtune: 5039, forte1: 18.52,
  priority: PRIORITY.BUFF_STATS, apply(ctx) { ctx.grantSelf(BURNING_DRIVE); },
});
const AscentOfMalice = galbrenaAction("Skill: Ascent of Malice", {
  node: Node.Skill, cast: Cast.Skill, type: DamageType.Heavy, mv: 103.14,   // 51.57x2
  energy: 1476, concerto: 1000, offtune: 5588, forte1: -100,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(BURNING_DRIVE); ctx.setCounter(GALBRENA_SINFLAME, 0); },
});

// --- Demon Hypostasis: Seraphic Execution (Basic), Flamewing Verdict (Heavy), Ravage (Skill) —
//     Mid-air/Dodge Counter enhanced forms aren't placed in the rotation below, skipped for the
//     same reason Augusta's own unused Mid-air/Dodge variants are: nanoka gives their MV, but
//     nothing here ever calls them. Burning Drive is Seraphic Execution's own Stage 4 specifically
//     — not the Threshold-state Slayer's Trigger Stage 4 above, per the kit text's own wording.
const SeraphicExecution1 = galbrenaAction("Basic: Seraphic Execution 1", { node: Node.Forte, cast: Cast.Basic, type: DamageType.Heavy, mv: 58.99, energy: 100, concerto: 554, offtune: 2374 });
const SeraphicExecution2 = galbrenaAction("Basic: Seraphic Execution 2", { node: Node.Forte, cast: Cast.Basic, type: DamageType.Heavy, mv: 139.19, energy: 200, concerto: 695, offtune: 5600 });   // 27.84x2+83.51
const SeraphicExecution3 = galbrenaAction("Basic: Seraphic Execution 3", { node: Node.Forte, cast: Cast.Basic, type: DamageType.Heavy, mv: 243.17, energy: 334, concerto: 879, offtune: 9786 });   // 24.32x3+170.21
const SeraphicExecution4 = galbrenaAction("Basic: Seraphic Execution 4", {
  node: Node.Forte, cast: Cast.Basic, type: DamageType.Echo, mv: 181.47,   // 18.15x3+127.02
  energy: 256, concerto: 770, offtune: 7305,
  priority: PRIORITY.BUFF_STATS, apply(ctx) { ctx.grantSelf(BURNING_DRIVE); },
});
const SeraphicExecution5 = galbrenaAction("Basic: Seraphic Execution 5", { node: Node.Forte, cast: Cast.Basic, type: DamageType.Echo, mv: 224.27, energy: 308, concerto: 846, offtune: 9025 });   // 67.28+156.99
export const SeraphicExecution12345 = new Chain("Basic: Seraphic Execution 12345",
  [SeraphicExecution1, SeraphicExecution2, SeraphicExecution3, SeraphicExecution4, SeraphicExecution5]);

const FlamewingVerdict1 = galbrenaAction("Heavy: Flamewing Verdict 1", { node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 118.44, energy: 174, concerto: 660, offtune: 4766 });   // 59.22x2
const FlamewingVerdict2 = galbrenaAction("Heavy: Flamewing Verdict 2", { node: Node.Forte, cast: Cast.Heavy, type: DamageType.Heavy, mv: 76.70, energy: 122, concerto: 586, offtune: 3086 });   // 38.35x2
const FlamewingVerdict3 = galbrenaAction("Heavy: Flamewing Verdict 3", { node: Node.Forte, cast: Cast.Heavy, type: DamageType.Echo, mv: 176.84, energy: 249, concerto: 764, offtune: 7117 });   // 17.69x3+123.77
export const FlamewingVerdict123 = new Chain("Heavy: Flamewing Verdict 123", [FlamewingVerdict1, FlamewingVerdict2, FlamewingVerdict3]);

const Ravage = galbrenaAction("Skill: Ravage", {
  node: Node.Forte, cast: Cast.Skill, type: DamageType.Heavy, mv: 35.78,   // 10.74+25.04
  energy: 659, concerto: 222, offtune: 5039,
  priority: PRIORITY.BUFF_STATS, apply(ctx) { ctx.grantSelf(BURNING_DRIVE); },
});

// --- liberation: Hellfire Absolution
const Liberation = galbrenaAction("Liberation: Hellfire Absolution", {
  node: Node.Liberation, cast: Cast.Liberation, type: DamageType.Echo, mv: 1109.04,   // 110.90+90.74x11
  energy: -12500, concerto: 2000, offtune: 84003,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(HELLFIRE_WINDOW); },
});

// --- intro / outro
const Intro = galbrenaAction("Intro: Hellflare Overload", {
  node: Node.Intro, cast: Cast.Intro, type: DamageType.Intro, mv: 94.12,
  energy: 1000, concerto: 1000, offtune: 4208, forte1: 11.11,
  priority: PRIORITY.BUFF_STATS, apply(ctx) { ctx.grantSelf(BURNING_DRIVE); },
});
const Outro = galbrenaAction("Outro: Ashen Pursuit", {
  cast: Cast.Outro, type: DamageType.Outro, mv: 795, concerto: -10000, active: false,   // 79.50x3+556.50
});

/** A kit-valid line: Intro, Encroach opens Burning Drive and (assumed) banks the Sinflame needed
 *  for Ascent of Malice (see file header), which converts it into Purging Flame and opens Demon
 *  Hypostasis — Seraphic Execution and Flamewing Verdict follow while it's up, Liberation opens
 *  its own +85% window over the tail of it, Outro closes the loop out. Intro is no longer placed
 *  here — the preceding member's outro triggers it (see the standing convention). */
export const ROTATION = [
  Encroach, AscentOfMalice,
  SeraphicExecution12345, FlamewingVerdict123,
  ECHO_CAST, Liberation, Outro,
];
