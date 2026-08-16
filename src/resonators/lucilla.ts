/**
 * Lucilla — a glacio "Rectifier" support/sub-DPS built around Resonance Mode: a stance her
 * loadout commits to for the whole fight (see `Mode` in kit.js), not something toggled mid-
 * rotation. Chafe mode reworks her into a Glacio Chafe applicator; Echo mode reworks her into
 * an Echo Skill enabler/amplifier instead — same animations, different DMG typing and payout.
 * Only **Echo mode** is implemented here, per explicit scope; `MODE_CHAFE` exists as a marker
 * so the loadout shape is right, but nothing in this file reacts to it yet.
 *
 * Liberation - Clear As Day drops her into Reminiscence: Basic Attack is replaced by Basic
 * Attack - Tracing Forms (still Basic Attack DMG regardless of mode — the mode split is on
 * Oblivion and Letting It Go, not the Tracing Forms hits themselves), and stage 3 spends banked
 * Photos on Oblivion, each one "considered as casting a different Echo Skill" under Echo mode —
 * a real `cast: ECHO` action, so anyone's own "on Echo cast" watcher fires for real, same as
 * any other echo (every echo cast is assumed unique, per the standing rule).
 *
 * Trace/Photo (the resource gating Liberation, 0-150 Trace = 0-3 Photos) is tracked on forte1
 * exactly like the sheet does — a raw Trace-point counter, Oblivion spending 50 (1 Photo) each.
 * Unlike Concerto/Energy elsewhere, this one *is* read back: Tracing Forms 3 queues one Oblivion
 * per Photo actually banked (`counter(Forte1) / 50`, floored and capped at 3), so the rotation's
 * own hand-placed timing decides how many Photos are in the bank by then rather than a count
 * assumed fixed at 3. Perfect Focus (Basic 3, Spotlight) is likewise assumed always hit, matching
 * the sheet's own "perfect" rows — the Unremarkable/miss variants are never used here.
 *
 * Numbers from nanoka.cc (character 1109, weapon 21050086); cross-checked against the migrated
 * sheet's `lucilla echo` rotation and `Lucilla`/`Lucilla Echo`/`Freeze Frame` stat rows. One
 * departure from the sheet: Liberation's `energy: -125` is dropped — the page is explicit that
 * "Clear As Day consumes no Resonance Energy" (she holds 0 max Energy to begin with), so that
 * number reads like a template default left over from every other character's ultimate-cost row
 * rather than something that applies to her.
 */
import { Buff, GlobalBuff, Gear, Mode, Action, Chain, PRIORITY } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { isOutro } from "../state.js";
import { Stat, Element, DamageType, Node, Resource, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { DREAM_OF_THE_LOST_3PC } from "./phrolova.js";
import { BELL_BORNE_GEOCHELONE, ACTION_BELL_BORNE, MOONLIT_CLOUDS_2PC } from "../shared/echoes.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#4f74c2";

/* --------------------------------------------------------------- resonator */

export const LUCILLA = new Gear((ctx) => {
  ctx.add(100, Stat.Er);
  ctx.add(5, Stat.CritRate);
  ctx.add(150, Stat.CritDmg);

  ctx.add(12237.5, Stat.BaseHp);
  ctx.add(375, Stat.BaseAtk);
  ctx.add(1197.78, Stat.BaseDef);
  ctx.add(8, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);

  return "Lucilla";
}, null, Element.Glacio, () => Intro);

/** Resonance Mode: a loadout equips exactly one. Neither carries its own stat line — both are
 *  pure markers other pieces read via `stacksOf(MODE_ECHO)`, same as checking a sequence Gear. */
export const MODE_ECHO = new Mode(() => "Lucilla: Resonance Mode - Echo");
/** Not implemented — declared only so the loadout shape (and `startFight`'s "at most one Mode"
 *  check) has a second real mode to be mutually exclusive with. */
export const MODE_CHAFE = new Mode(() => "Lucilla: Resonance Mode - Glacio Chafe");

/** Slow Motion (Inherent Skill): while casting Spotlight (the Perfect Focus Skill press, not
 *  the quick Compensate tap), Echo mode grants the whole team +25% Echo Skill DMG Bonus for
 *  30s — permanent uptime, per the standing duration rule. */
export const SLOW_MOTION_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(25, DamageType.Echo, Stat.DmgBonus); return "Lucilla: Slow Motion"; });

/** Déjà Vu / Remembrance (Forte Circuit + Inherent Skill, both always-on): Liberation grants 1
 *  stack of Zoom, and — under Remembrance — so does every Photo Oblivion spends, up to 4 stacks
 *  total (Remembrance itself raises the cap from 1 to 4). Global since the bonus lands on
 *  whichever teammate is actively attacking, not Lucilla specifically. */
export const ZOOM = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  if (!ctx.action!.active) return;
  ctx.add(10 * stacks, DamageType.Echo, Stat.CritDmg);
  return `Lucilla: Zoom x${stacks}`;
}, 4);

/** Clear As Day's own cast, Echo mode: +30% Echo Skill DMG Bonus to Lucilla for 10s — short
 *  window, lost after the outro action gains stats. */
export const LIB_SELF_DMG = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(30, DamageType.Echo, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(LIB_SELF_DMG);
  return "Lucilla: Clear As Day";
});

/** Montage (Outro Skill), Echo mode: the incoming resonator gets +50% Echo Skill DMG
 *  Amplification for 14s — short window, lost once they themselves outro. */
export const MONTAGE_HANDOFF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(MONTAGE_HANDOFF);
  ctx.add(50, DamageType.Echo, Stat.Amp);
  return "Lucilla: Montage";
});

/* ------------------------------------------------------------------ weapon */

/**
 * Freeze Frame (signature, R1 "Light's Offering"): +12% ATK flat. After inflicting Glacio
 * Chafe, the wielder gets +30% Glacio DMG Bonus for 12s (short window, lost after the outro
 * action gains stats) and the whole team — wielder included — gets +24% ATK for 30s (permanent
 * uptime). "Effects of the same name cannot be stacked", matching both buffs' default max_stacks
 * of 1. Reacts to the wielder's *own* chafe application (`a.chafe`), so it still works if
 * someone other than Lucilla equips it.
 */
export const FREEZE_FRAME = new Gear((ctx) => {
  ctx.add(587.5, Stat.BaseAtk);
  ctx.add(24.3, Stat.CritRate);
  ctx.add(12, Stat.BonusAtk);
  if (ctx.action!.chafe > 0) { ctx.grantSelf(FREEZE_FRAME_SELF); ctx.grantGlobal(FREEZE_FRAME_TEAM); }
  return "Freeze Frame";
});
export const FREEZE_FRAME_SELF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(30, Element.Glacio, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(FREEZE_FRAME_SELF);
  return "Freeze Frame: Light's Offering";
});
export const FREEZE_FRAME_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(24, Stat.BonusAtk); return "Freeze Frame: Light's Offering"; });

/** Echoes/sonata: Bell-Borne Geochelone mainslot, Moonlit Clouds 2pc + Dream of the Lost 3pc —
 *  all generic gear reused as-is, per the standing rule that gear works on whoever equips it. */
export const LOADOUT = [
  LUCILLA, MODE_ECHO, FREEZE_FRAME, BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_2PC, DREAM_OF_THE_LOST_3PC,
  mainstats("CD", "glacio glacio", "atk atk"),
  chem("atk", "basic"),
];

/* ----------------------------------------------------------------- actions */

function lucillaAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Glacio,
    color: COLOR,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- intro / outro
const Intro = lucillaAction("Intro", {
  node: Node.Intro, cast: DamageType.Intro, type: DamageType.Intro, mv: 97.42,
  energy: 11.75, concerto: 14.13, forte1: 100, offtune: 0.56, chafe: 1,
});
const Outro = lucillaAction("Outro", {
  cast: DamageType.Outro, type: DamageType.Outro, mv: 0, concerto: -100, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.outro(MONTAGE_HANDOFF); },
});

// --- normal attacks: Basic 1/2, Basic 3 (Focus Ring, always assumed Perfect/Commendable)
const BA1 = lucillaAction("Basic 1", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 59.29, energy: 1.07, concerto: 1.71, offtune: 0.34 });
const BA2 = lucillaAction("Basic 2", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 67.23, energy: 1.22, concerto: 1.94, offtune: 0.39 });
const BA3 = lucillaAction("Basic 3", { node: Node.Normal, cast: DamageType.Basic, type: DamageType.Basic, mv: 235.27, energy: 4.23, concerto: 6.77, forte1: 50, offtune: 1.35 });
export const BA123 = new Chain("Basic 123", [BA1, BA2, BA3]);

// --- resonance skill: a quick tap (Compensate) for the CD-reduction utility (unmodeled — no CD
//     tracking here, same as other kits' skill-CD text), then later a held Perfect Focus press
//     (Spotlight) — the sheet's own rotation presses both, and the numbers below are its own
//     tested values rather than re-derived from the page's separate move list.
const SkillTap = lucillaAction("Skill tap", { node: Node.Skill, cast: DamageType.Skill, type: DamageType.Skill, mv: 42.39, energy: 1.35, concerto: 3.15, offtune: 0.42 });
const SkillPerfect = lucillaAction("Skill perfect", {
  node: Node.Skill, cast: DamageType.Skill, type: DamageType.Skill, mv: 548.98,
  energy: 27.9, concerto: 26.8, forte1: 50, offtune: 0.92,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { if (ctx.stacksOf(MODE_ECHO)) ctx.grantGlobal(SLOW_MOTION_TEAM); },
});

// --- liberation: Clear As Day, Echo mode — Echo Skill DMG, no Energy cost (see file header)
const Liberation = lucillaAction("Liberation", {
  node: Node.Liberation, cast: DamageType.Liberation, type: DamageType.Echo, mv: 142.74,
  concerto: 20, offtune: 3.84,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(LIB_SELF_DMG); ctx.grantGlobal(ZOOM); },
});

// --- Reminiscence: Basic Attack - Tracing Forms (unconditionally Basic Attack DMG regardless
//     of mode) and Letting It Go (mode-typed). node: liberation, matching the sheet. Stage 3
//     itself triggers Oblivion — a real follow-up action, not a separately-placed rotation step
//     — once per Photo actually banked, read straight off forte1 (max 3, 50 Trace each).
const UBA1 = lucillaAction("Tracing Forms 1", { node: Node.Liberation, cast: DamageType.Basic, type: DamageType.Basic, mv: 76.59, energy: 1.08, concerto: 2.54, offtune: 0.34 });
const UBA2 = lucillaAction("Tracing Forms 2", { node: Node.Liberation, cast: DamageType.Basic, type: DamageType.Basic, mv: 149.42, energy: 2.1, concerto: 4.94, offtune: 0.67 });
const UBA3 = lucillaAction("Tracing Forms 3", {
  node: Node.Liberation, cast: DamageType.Basic, type: DamageType.Basic, mv: 416.96,
  energy: 5.84, concerto: 11.2, offtune: 1.864,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    const photos = Math.min(3, Math.floor(ctx.counter(Resource.Forte1) / 50));
    for (let i = 0; i < photos; i++) ctx.queue(OblivionEcho);
  },
});
export const UBA123 = new Chain("Tracing Forms 123", [UBA1, UBA2, UBA3]);

/** Oblivion: during Tracing Forms 3, spends a banked Photo (50 Trace) for an extra hit — queued
 *  by Stage 3 itself above, once per Photo actually banked at that point. Under Echo mode this
 *  is Echo Skill DMG and a real Echo cast (Remembrance's own Zoom stack too). */
const OblivionEcho = lucillaAction("Oblivion", {
  node: Node.Forte, cast: DamageType.Echo, type: DamageType.Echo, mv: 285.48,
  forte1: -50, offtune: 0.96,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(ZOOM); },
});

const LettingGoEcho = lucillaAction("Letting It Go", {
  node: Node.Liberation, type: DamageType.Echo, mv: 848.07,
  energy: 3.36, concerto: 27.88, offtune: 3.67,
});

/** The sheet's `lucilla echo` rotation: Intro, a quick Skill tap then a held Spotlight,
 *  Liberation into Reminiscence, the Tracing Forms combo (Stage 3 auto-queues its 3 Oblivion
 *  hits), Letting It Go closes it out — Bell-Borne Geochelone's own cast placed before Outro,
 *  same ordering Sanhua's file uses for its own mainslot echo. */
export const ROTATION = [
  SkillPerfect, ACTION_BELL_BORNE, Liberation, UBA123,
  LettingGoEcho, Outro,
];
