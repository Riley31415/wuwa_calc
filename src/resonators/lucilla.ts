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
 * Numbers from nanoka.cc (character 1109, https://ww.nanoka.cc/character/1109, weapon 21050086); cross-checked against the migrated
 * sheet's `lucilla echo` rotation and `Lucilla`/`Lucilla Echo`/`Freeze Frame` stat rows. One
 * departure from the sheet: Liberation's `energy: -12500` is dropped — the page is explicit that
 * "Clear As Day consumes no Resonance Energy" (she holds 0 max Energy to begin with), so that
 * number reads like a template default left over from every other character's ultimate-cost row
 * rather than something that applies to her.
 */
import { Buff, GlobalBuff, Mode, Action, Chain, PRIORITY, ECHO_CAST } from "../kit.js";
import type { ActionDef } from "../kit.js";
import { Resonator, Loadout, isOutro } from "../state.js";
import type { ResonatorFactory } from "../state.js";
import { Stat, Element, Type1, Node, Resource, Cast, Scaling } from "../stats.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";
import { BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_2PC } from "../echoes/jinzhou.js";
import { DREAM_OF_THE_LOST_3PC } from "../echoes/septimont.js";
import { FREEZE_FRAME } from "../weapons/rectifier.js";

/** This resonator's own color — every action from the wrapper below defaults to it. */
export const COLOR = "#4f74c2";

/* --------------------------------------------------------------- resonator */

/** Resonance Mode: a loadout equips exactly one. Neither carries its own stat line — both are
 *  pure markers other pieces read via `stacksOf(MODE_ECHO)`, same as checking a sequence Gear. */
export const MODE_ECHO = new Mode("Resonance Mode - Echo");
/** Not implemented — declared only so the loadout shape (and `startFight`'s "at most one Mode"
 *  check) has a second real mode to be mutually exclusive with. */
export const MODE_CHAFE = new Mode("Resonance Mode - Glacio Chafe");

/** Slow Motion (Inherent Skill): while casting Spotlight (the Perfect Focus Skill press, not
 *  the quick Compensate tap), Echo mode grants the whole team +25% Echo Skill DMG Bonus for
 *  30s — permanent uptime, per the standing duration rule. */
export const SLOW_MOTION_TEAM = new GlobalBuff(PRIORITY.BUFF_STATS,
  (ctx) => { ctx.add(25, Type1.Echo, Stat.DmgBonus); return "Lucilla: Slow Motion"; });

/** Déjà Vu / Remembrance (Forte Circuit + Inherent Skill, both always-on): Liberation grants 1
 *  stack of Zoom, and — under Remembrance — so does every Photo Oblivion spends, up to 4 stacks
 *  total (Remembrance itself raises the cap from 1 to 4). Global since the bonus lands on
 *  whichever teammate is actively attacking, not Lucilla specifically. */
export const ZOOM = new GlobalBuff(PRIORITY.BUFF_STATS, (ctx, stacks) => {
  if (!ctx.action!.active) return;
  ctx.add(10 * stacks, Type1.Echo, Stat.CritDmg);
  return `Lucilla: Zoom x${stacks}`;
}, 4);

/** Clear As Day's own cast, Echo mode: +30% Echo Skill DMG Bonus to Lucilla for 10s — short
 *  window, lost after the outro action gains stats. */
export const LIB_SELF_DMG = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  ctx.add(30, Type1.Echo, Stat.DmgBonus);
  if (isOutro(ctx.action!)) ctx.revoke(LIB_SELF_DMG);
  return "Lucilla: Clear As Day";
});

/** Montage (Outro Skill), Echo mode: the incoming resonator gets +50% Echo Skill DMG
 *  Amplification for 14s — short window, lost once they themselves outro. */
export const MONTAGE_HANDOFF = new Buff(PRIORITY.BUFF_STATS, (ctx) => {
  if (isOutro(ctx.action!)) ctx.revoke(MONTAGE_HANDOFF);
  ctx.add(50, Type1.Echo, Stat.Amp);
  return "Lucilla: Montage";
});

/** Echoes/sonata: Bell-Borne Geochelone mainslot (echoes/jinzhou.js), Moonlit Clouds 2pc (echoes/jinzhou.js)
 *  + Dream of the Lost 3pc (Phrolova's own sonata, echoes/septimont.js) — all reused as-is, per the
 *  standing rule that gear works on whoever equips it. Freeze Frame (her own signature) lives
 *  in weapons/rectifier.js. */
const LUCILLA_LOADOUT = new Loadout(
  FREEZE_FRAME, BELL_BORNE_GEOCHELONE, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC,
  mainstats("CD", "glacio glacio", "atk atk"), chem("atk", "basic"),
);

export class Lucilla extends Resonator {
  constructor(loadout: Loadout) {
    super(
      "Lucilla",
      Element.Glacio,
      () => Intro,
      loadout,
      (ctx) => {
        ctx.add(12237.5, Stat.BaseHp);
        ctx.add(375, Stat.BaseAtk);
        ctx.add(1197.8, Stat.BaseDef);
      },
      (ctx) => {
        ctx.add(8, Stat.CritRate);
        ctx.add(12, Stat.BonusAtk);
      },
      null,
      MODE_ECHO,
      [],
      0,   // Clear As Day costs no Resonance Energy — see DREAM_OF_THE_LOST_3PC's own check
    );
  }
}
export const LOADOUT: ResonatorFactory = () => new Lucilla(LUCILLA_LOADOUT);

/* ----------------------------------------------------------------- actions */

function lucillaAction(name: string, def: ActionDef): Action {
  return new Action(name, {
    element: Element.Glacio,
    scaling: Scaling.Atk,
    ...def,
  });
}

// --- intro / outro
const Intro = lucillaAction("Intro: Clip It", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 97.42,
  energy: 1175, concerto: 1413, forte1: 100, offtune: 5600, chafe: 1,
});
const Outro = lucillaAction("Outro: Montage", {
  cast: Cast.Outro, mv: 0, concerto: -10000, active: false,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.outro(MONTAGE_HANDOFF); },
});

// --- normal attacks: Basic 1/2, Basic 3 (Focus Ring, always assumed Perfect/Commendable)
const BA1 = lucillaAction("Basic: Snapshot 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 59.29, energy: 107, concerto: 171, offtune: 3400 });
const BA2 = lucillaAction("Basic: Snapshot 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 67.23, energy: 122, concerto: 194, offtune: 3900 });
const BA3 = lucillaAction("Basic: Snapshot 3 - Commendable", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 235.27, energy: 423, concerto: 677, forte1: 50, offtune: 13500 });
export const BA123 = new Chain("Basic: Snapshot 123", [BA1, BA2, BA3]);

// --- resonance skill: Phantom Frame (the pull-in dash, held to deploy Focus Ring) into either
//     Compensate (cursor outside Perfect Focus) or Spotlight (cursor within it) — two distinct
//     finishers off the same opener, so each gets its own chain rather than one action standing
//     in for both. Numbers are the migrated sheet's own tested rows ("Skill tap"/"Skill miss"/
//     "Skill perfect"), matching the kit page's own Lv.10 Skill Attributes table exactly
//     (Phantom Frame 13.26%x3, Compensate 249.07%, Spotlight 82.35+82.35+274.48+109.80%).
const PhantomFrame = lucillaAction("Skill: Phantom Frame", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 39.78, energy: 135, concerto: 315, offtune: 4200 });
// Compensate: also reduces the Resonance Skill's own cooldown by 8s — unmodeled, no CD tracking
// here, same as other kits' skill-CD text. Still `cast: SKILL` like Phantom Frame — both
// Compensate and Spotlight are outcomes of the same Resonance Skill button, not a follow-up
// press of their own, so a generic "on Skill cast" weapon still sees them.
const Compensate = lucillaAction("Skill: Compensate", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 249.07, energy: 931, concerto: 308, forte1: 25, offtune: 4200 });
const Spotlight = lucillaAction("Skill: Spotlight", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 548.98,
  energy: 2790, concerto: 2680, forte1: 50, offtune: 9200,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { if (ctx.stacksOf(MODE_ECHO)) ctx.grantGlobal(SLOW_MOTION_TEAM); },
});
export const SKILL_COMPENSATE = new Chain("Skill: Compensate", [PhantomFrame, Compensate]);
export const SKILL_SPOTLIGHT = new Chain("Skill: Spotlight", [PhantomFrame, Spotlight]);

// --- liberation: Clear As Day, Echo mode — Echo Skill DMG, no Energy cost (see file header)
const Liberation = lucillaAction("Liberation: Clear As Day (Echo)", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Echo, mv: 142.74,
  concerto: 2000, offtune: 38400,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantSelf(LIB_SELF_DMG); ctx.grantGlobal(ZOOM); },
});

// --- Reminiscence: Basic Attack - Tracing Forms (unconditionally Basic Attack DMG regardless
//     of mode) and Letting It Go (mode-typed). node: liberation, matching the sheet. Stage 3
//     itself triggers Oblivion — a real follow-up action, not a separately-placed rotation step
//     — once per Photo actually banked, read straight off forte1 (max 3, 50 Trace each).
const UBA1 = lucillaAction("Basic: Tracing Forms 1", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 76.59, energy: 108, concerto: 254, offtune: 3400 });
const UBA2 = lucillaAction("Basic: Tracing Forms 2", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 149.42, energy: 210, concerto: 494, offtune: 6700 });
const UBA3 = lucillaAction("Basic: Tracing Forms 3", {
  node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 416.96,
  energy: 584, concerto: 1120, offtune: 18640,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) {
    const photos = Math.min(3, Math.floor(ctx.counter(Resource.Forte1) / 50));
    for (let i = 0; i < photos; i++) ctx.queue(OblivionEcho);
  },
});
export const UBA123 = new Chain("Basic: Tracing Forms 123", [UBA1, UBA2, UBA3]);

/** Oblivion: during Tracing Forms 3, spends a banked Photo (50 Trace) for an extra hit — queued
 *  by Stage 3 itself above, once per Photo actually banked at that point. Under Echo mode this
 *  is Echo Skill DMG and a real Echo cast (Remembrance's own Zoom stack too). */
const OblivionEcho = lucillaAction("Forte: Oblivion (Echo)", {
  node: Node.Forte, cast: Cast.Echo, type: Type1.Echo, mv: 285.48,
  forte1: -50, offtune: 9600,
  priority: PRIORITY.UPDATE_BUFFS,
  apply(ctx) { ctx.grantGlobal(ZOOM); },
});

const LettingGoEcho = lucillaAction("Basic: Letting It Go (Echo)", {
  node: Node.Liberation, type: Type1.Echo, mv: 848.07,
  energy: 336, concerto: 2788, offtune: 36700,
});

/** The sheet's `lucilla echo` rotation: Intro, a held Phantom Frame -> Spotlight, Liberation into
 *  Reminiscence, the Tracing Forms combo (Stage 3 auto-queues its 3 Oblivion hits), Letting It Go
 *  closes it out — Bell-Borne Geochelone's own cast placed before Outro, same ordering Sanhua's
 *  file uses for its own mainslot echo. */
export const ROTATION = [
  SKILL_SPOTLIGHT, ECHO_CAST, Liberation, UBA123,
  LettingGoEcho, Outro,
];
