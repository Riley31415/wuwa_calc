/**
 * Lucilla, ported to the new engine — sequence-0 core loop only. A glacio Rectifier support/sub-
 * DPS built around Resonance Mode: a stance her loadout commits to for the whole fight (see
 * `ResonanceMode` in gear.ts), not something toggled mid-rotation. Chafe mode reworks her into a
 * Glacio Chafe applicator; Echo mode reworks her into an Echo Skill enabler/amplifier instead —
 * same animations, different DMG typing and payout. Both modes are implemented: `MODE_ECHO`/
 * `MODE_CHAFE` each get their own loadout/rotation pair sharing every other piece of her kit —
 * same "one build per stance" shape Qiuyuan's own two loadouts use for a mainslot swap.
 *
 * Liberation - Clear As Day drops her into Reminiscence: Basic Attack is replaced by Basic Attack
 * - Tracing Forms (still Basic Attack DMG regardless of mode), and Stage 3 spends banked Photos
 * on Oblivion, each one "considered as casting a different Echo Skill" under Echo mode — a real
 * `cast: Cast.Echo` action, so anyone's own "on Echo cast" watcher fires for real. Under Chafe
 * mode, the same actions are Basic Attack DMG instead — MODE_CHAFE's own typeOverride on the one
 * Liberation and Letting It Go action; Oblivion alone keeps a Chafe-form action of its own, since
 * that form also drops the Echo cast — and Oblivion additionally inflicts 1 stack of Glacio Chafe
 * on the target.
 *
 * Slow Motion (Inherent Skill 1) also branches by mode: casting Spotlight grants the whole team
 * +25% Echo Skill DMG Bonus under Echo, or sheds 8% of the target's own Glacio RES under Chafe —
 * a genuine debuff on the enemy itself, not a team buff, same shape as Havoc Rover's own
 * Annihilated Silence. Remembrance (Inherent Skill 2) banks Film Roll under Chafe the same way
 * Déjà Vu/Remembrance bank Zoom under Echo (2 a Photo Oblivion spends, plus 4 more on each
 * Liberation cast). Film Roll fuels a passive Glacio Chafe re-proc off any *other* active
 * teammate's own Chafe hit, but that re-proc deals no damage of its own, so only the bank is
 * modelled, not the spend. Montage (Outro Skill) also
 * branches: Echo hands the incoming resonator a 14s Echo Skill DMG Amp handoff; Chafe instead
 * grants a permanent +60% Glacio Chafe DMG Amp to whoever's active, which pays into every Glacio
 * Chafe calculation her stacks set off (statuses.ts).
 *
 * Trace/Photo (the resource gating Liberation, 0-150 Trace = 0-3 Photos) is tracked on forte1
 * exactly like the kit page does, Oblivion spending 50 (1 Photo) each — and unlike
 * Concerto/Energy elsewhere, it's read back: Tracing Forms 3 queues one Oblivion per Photo
 * actually banked (`forte1() / 50`, floored and capped at 3). Perfect Focus (Basic 3, Spotlight)
 * is assumed always hit, matching the kit page's own "perfect" rows.
 *
 * Numbers from nanoka.cc (character 1109) at skill level 10, read straight off its own per-hit
 * Damage Data (not the migrated old-engine sheet, which predates offtune entirely and is missing
 * or wrong on several energy/concerto figures). Two exceptions folded in by hand: Liberation's
 * own `maxEnergy: 0` below and Letting It Go's own flat +20 Concerto Regen both come from the
 * page's own skill description text instead of a per-hit figure. Chafe mode's own numbers (the
 * self-buff/RES shred/Film Roll grants) likewise come from that page's own description text — the
 * old migrated sheet predates Chafe mode entirely, so none of it could be cross-checked.
 */
import { Stat, EnemyStat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, ResonanceMode, Sequence } from "../../engine/gear.js";
import {
  typeOverride,
  applied,
  applyCurrent,
  applyTeam,
  applyEnemy,
  isHeld,
  onAction,
  runningAction,
  currentTeam,
  addStat,
  addEnemyStat,
  frozenStacks,
  forte1,
  queue,
  queueOutro,
  removeStackTeam,
  revokeCurrent,
  isActive,
  reduceCooldown,
} from "../../engine/context.js";
import { ActionGroup, Action, ActionField, Cooldown, Rotation, ECHO, START_3, INTRO_3, INTRO } from "../../engine/rotation.js";
import { GLACIO_CHAFE, GLACIO_CHAFE_ACTIONS, OWN_CHAFE_RUNGS } from "../../shared/status.js";
import { FREEZE_FRAME, STRINGMASTER, LETHEAN_ELEGY } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { BELL_BORNE_GEOCHELONE, HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC, REJUV_2PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { DREAM_OF_THE_LOST_3PC, LAW_OF_HARMONY_3PC } from "../../echoes/septimont.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { GLOMMOTH, QUIET_SNOWFALL_2PC, QUIET_SNOWFALL_5PC } from "../../echoes/lahairoi.js";

/* ----------------------------------------------------------------------------------- actions */

function lucillaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune all come off nanoka's own per-hit Damage Data (energy/Elemental DMG
// columns straight off each named hit, offtune off its Weakness Break DMG column), not the
// migrated sheet — that sheet predates offtune entirely and undercounted several figures
// outright. Liberation costs no Resonance Energy at all (maxEnergy: 0 below), so no energy field.
// Clip It and Oblivion (Chafe) each inflict a stack of Glacio Chafe
const CHAFES = { updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1) };
/** The Glacio Chafe hits of her own visit, filed under one field her Intro opens (Hiyuki's Glacio
 *  Bite does the same): the shared rungs, somewhere of hers to sit in the table. */
const CHAFE_FIELD = new ActionField("Lucilla: Glacio Chafe");
const CHAFE_WINDOW = new Buff({ field: CHAFE_FIELD });
const CHAFE_RUNGS: (Action | null)[] = GLACIO_CHAFE_ACTIONS.map((a) => a?.variant(a.name, { field: CHAFE_FIELD }) ?? null);
const Intro = lucillaAction("Intro - Clip It", {
  animFrames: 81, commitFrames: 42, motionStop: 74, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [{ at: 38, mv: 97.42, energy: 11.75, concerto: 4.13, offtune: 5600, forte1: 100 }], castConcerto: 10,
  ...CHAFES,
  updateBuffs: () => applyCurrent(CHAFE_WINDOW, 1),
});
// mutually exclusive: Echo hands off MONTAGE_HANDOFF, Chafe grants MONTAGE_CHAFE team-wide
const Outro = lucillaAction("Outro - Montage", {
  animFrames: 0, commitFrames: 0,
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => {
    if (isHeld(MODE_CHAFE)) applyTeam(MONTAGE_CHAFE, 1);
    else queueOutro(MONTAGE_HANDOFF);
  }
});

// normal attacks: Basic 1/2, Basic 3 (Focus Ring, always assumed Perfect/Commendable)
const BA1 = lucillaAction("Basic - Snapshot 1", { animFrames: 30, commitFrames: 14, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 14, mv: 59.29, energy: 1.07, concerto: 1.71, offtune: 3408 }]});
const BA2 = lucillaAction("Basic - Snapshot 2", { animFrames: 32, commitFrames: 24, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 14, mv: 26.89, energy: 0.49, concerto: 0.78, offtune: 1546 },
    { at: 24, mv: 40.34, energy: 0.73, concerto: 1.16, offtune: 2319 },
  ]});
const BA3 = lucillaAction("Basic - Snapshot 3 - Commendable", { animFrames: 106, commitFrames: 50, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 50, mv: 235.27, energy: 4.23, concerto: 6.77, offtune: 13524, forte1: 50 }]});
const MA = lucillaAction("Mid-air - Snapshot Plunge", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 86.29, energy: 1.55, concerto: 3.66, offtune: 4960 });
const DC = lucillaAction("Dodge Counter - Snapshot", { animFrames: 32, commitFrames: 24, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 14, mv: 67.83, energy: 1.22, concerto: 7.38, offtune: 3899 },
    { at: 24, mv: 82.9, energy: 1.49, concerto: 9.02, offtune: 4766 },
  ]});

// Phantom Frame (the pull-in dash, held to deploy Focus Ring) into either Compensate (cursor
// outside Perfect Focus) or Spotlight (cursor within it); the rotation below only places
// Spotlight, Compensate exported for completeness.
// an unheld on-field press casts Compensate directly, so both draw on the one 16s cooldown
const SKILL_CD = new Cooldown({ frames: 60 * 16 });
// also reduces the Resonance Skill's own cooldown by 8s
const Compensate = lucillaAction("Skill - Compensate", {
  animFrames: 60, commitFrames: 53, cooldown: SKILL_CD,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 16, mv: 13.26, energy: 0.42, concerto: 0.69, offtune: 1334 },
    { at: 22, mv: 13.26, energy: 0.42, concerto: 0.69, offtune: 1334 },
    { at: 28, mv: 13.26, energy: 0.42, concerto: 0.69, offtune: 1334 },
    { at: 53, mv: 249.07, energy: 9.31, concerto: 3.08, offtune: 4176, forte1: 25 },
  ],
  updateBuffs: () => reduceCooldown(SKILL_CD, 60 * 8),
});
// Spotlight lays a Chafe stack too, but only in Glacio Chafe mode
const Spotlight = lucillaAction("Skill - Spotlight", {
  animFrames: 107, commitFrames: 107, cooldown: SKILL_CD,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 16, mv: 13.26, energy: 0.42, concerto: 0.69, offtune: 1334,
      updateDebuffs: () => { if (isHeld(MODE_CHAFE)) applyEnemy(GLACIO_CHAFE, 1); } },
    { at: 22, mv: 13.26, energy: 0.42, concerto: 0.69, offtune: 1334 },
    { at: 28, mv: 13.26, energy: 0.42, concerto: 0.69, offtune: 1334 },
    { at: 57, mv: 82.35, energy: 4.19, concerto: 1.02, offtune: 1381 },
    { at: 70, mv: 82.35, energy: 4.19, concerto: 1.02, offtune: 1381 },
    { at: 101, mv: 274.48, energy: 13.94, concerto: 3.4, offtune: 4602, forte1: 50 },
    { at: 143, mv: 109.8, energy: 5.58, concerto: 1.36, offtune: 1841 },
  ],
  applyStats: () => { addStat(Stat.AddConcerto, 20); }
});

// Echo Skill DMG under Echo mode; Chafe mode's own typeOverride makes it Basic Attack DMG instead
// (see MODE_CHAFE) — one action, not one per mode
const Liberation = lucillaAction("Liberation - Clear As Day", {
  animFrames: 266, commitFrames: 266, timestop: 264, motionStop: 264, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Echo, hits: [{ at: 204, mv: 142.74, offtune: 38400 }], castConcerto: 20, castForte1: -150,
  applyStats: () => { addStat(Stat.AddForte1, 150); },
  updateBuffs: () => {
    applyCurrent(LIB_SELF_DMG, 1);
    if (isHeld(MODE_CHAFE)) applyTeam(FILM_ROLL, 4); else applyTeam(ZOOM, 1);
  },
});

// Reminiscence: Basic Attack - Tracing Forms (unconditionally Basic Attack DMG) and Letting It Go
// (mode-typed). Stage 3 itself triggers Oblivion once per Photo actually banked (forte1, max 3).
const UBA1 = lucillaAction("Basic - Tracing Forms 1", { animFrames: 27, commitFrames: 19, node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 8, mv: 30.64, energy: 0.43, concerto: 0.83, offtune: 1370 },
    { at: 19, mv: 45.95, energy: 0.65, concerto: 1.24, offtune: 2055 },
  ]});
const UBA2 = lucillaAction("Basic - Tracing Forms 2", { animFrames: 54, commitFrames: 31, node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 10, mv: 59.77, energy: 4.836, concerto: 1.9745, offtune: 2672 },
    { at: 31, mv: 89.65, energy: 7.254, concerto: 2.9555, offtune: 4008 },
  ]});
const UBA3 = lucillaAction("Basic - Tracing Forms 3", {
  animFrames: 142, commitFrames: 118,
  node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 34, mv: 52.12, energy: 0.73, concerto: 1.4, offtune: 2330,
      // on Stage 3's hit
      updateDebuffs: () => {
        const photos = Math.min(3, Math.floor(forte1() / 50));
        for (let i = 0; i < photos; i++) queue(isHeld(MODE_CHAFE) ? OblivionChafe : OblivionEcho);
      } },
    { at: 46, mv: 52.12, energy: 0.73, concerto: 1.4, offtune: 2330 },
    { at: 58, mv: 52.12, energy: 0.73, concerto: 1.4, offtune: 2330 },
    { at: 70, mv: 52.12, energy: 0.73, concerto: 1.4, offtune: 2330 },
    { at: 82, mv: 52.12, energy: 0.73, concerto: 1.4, offtune: 2330 },
    { at: 94, mv: 52.12, energy: 0.73, concerto: 1.4, offtune: 2330 },
    { at: 106, mv: 52.12, energy: 0.73, concerto: 1.4, offtune: 2330 },
    { at: 118, mv: 52.12, energy: 0.73, concerto: 1.4, offtune: 2330 },
  ],
});

/** Spends a banked Photo for an extra hit — queued by Stage 3 itself. Under Echo mode this is
 *  Echo Skill DMG and a real Echo cast; under Chafe mode it's Basic Attack DMG and inflicts 1
 *  stack of Glacio Chafe. No Energy/Concerto Regen on the page — a real 0. Still two actions,
 *  unlike the Liberation and Letting It Go below: the modes differ in *cast* here too (Echo mode's
 *  is a real Echo cast, what "on Echo cast" watchers fire on; Chafe mode's is no cast at all), and
 *  typeOverride only assigns a damage type. */
const OblivionEcho = lucillaAction("Forte Echo - Oblivion", { animFrames: 0, node: Node.Forte, cast: Cast.Echo, type: Type.Echo, mv: 285.48, offtune: 9600, castForte1: -50});
const OblivionChafe = lucillaAction("Forte - Oblivion (Chafe)", { animFrames: 0, node: Node.Forte, type: Type.Basic, hits: [{ at: 0, mv: 285.48, offtune: 9600 }], castForte1: -50, ...CHAFES });

// concerto is 7.88 off its own 3 Damage Data hits, plus a separate flat +20 the page states
// Letting It Go "additionally restores" — both folded into the one number below.
// Echo Skill DMG, retagged Basic Attack DMG by Chafe mode the same way the Liberation is
const LettingGo = lucillaAction("Basic - Letting It Go", { animFrames: 77, commitFrames: 54, node: Node.Liberation, type: Type.Echo, hits: [
    { at: 0, mv: 84.81, energy: 0.34, concerto: 0.2233, offtune: 3652 },
    { at: 12, mv: 84.81, energy: 0.34, concerto: 0.2233, offtune: 3652 },
    { at: 24, mv: 84.81, energy: 0.34, concerto: 0.2233, offtune: 3652 },
    { at: 54, mv: 593.64, energy: 2.34, concerto: 7.2101, offtune: 25558 },
  ],
  applyStats: () => { addStat(Stat.AddConcerto, 20); }
 });

/* ------------------------------------------------------------------------------------ buffs */

/** A loadout equips exactly one. Neither carries its own stat line — both are pure markers other
 *  pieces read via `isHeld(MODE_ECHO)`, same as checking a sequence Gear. */
const MODE_ECHO = new ResonanceMode({ name: "Resonance Mode - Echo" });
/** Chafe mode is also what makes Clear As Day and Letting It Go Basic Attack DMG rather than Echo
 *  Skill DMG — assigned through typeOverride, the first phase of the hit, so every scoped stat
 *  and hit-side isType() check sees Basic. */
const MODE_CHAFE = new ResonanceMode({
  name: "Resonance Mode - Glacio Chafe",
  // the retag has to land in the hit's first phase, before anything there reads the type
  updateDebuffs: () => { if (runningAction(Liberation) || runningAction(LettingGo)) typeOverride(Type.Basic); },
});

/** Slow Motion (Inherent Skill): while casting Spotlight, Echo mode grants the whole team +25%
 *  Echo Skill DMG Bonus for 30s — permanent uptime. Team-wide since it lands on whoever's own
 *  turn it currently is, not just Lucilla's own. */
const SLOW_MOTION_TEAM = new Buff({
  name: "Inherent: Slow Motion (echo)",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 25, Type.Echo]],
});
/** Chafe-mode payout: -8% Glacio RES on the target for 30s — a genuine enemy debuff, permanent
 *  uptime once granted. */
const SLOW_MOTION_CHAFE = new Debuff({
  name: "Inherent: Slow Motion (chafe)",
  duration: 60 * 30,
  applyStats: () => addEnemyStat(EnemyStat.ResReduce, 8, Attribute.Glacio),
});
const LC_INHERENT_1 = new Inherent({
  name: "Inherent: Slow Motion",
  updateBuffs: () => {
    if (!runningAction(Spotlight)) return;
    if (isHeld(MODE_ECHO)) applyTeam(SLOW_MOTION_TEAM, 1);
    else if (isHeld(MODE_CHAFE)) applyEnemy(SLOW_MOTION_CHAFE, 1);
  },
});

/** Déjà Vu (Forte Circuit, base kit): Liberation grants 1 stack of Zoom under Echo mode, or 4
 *  stacks of Film Roll under Chafe (see LUCILLA_RESONATOR's own updateBuffs() for the Echo half, LC_INHERENT_2
 *  for the Chafe half). Zoom is team-wide (lands on whichever teammate is attacking); Film Roll
 *  is hers alone. */
const ZOOM = new Buff({
  name: "Lucilla: Zoom", maxStacks: 4, duration: 60 * 30,
  applyStats: () => { if (isActive()) addStat(Stat.CritDmg, 10 * frozenStacks(), Type.Echo); },
});
/** Any *other* active resonator inflicting Glacio Chafe spends a stack of this
 *  Her own casts never trigger it. Cap 10;
 *
 *  Held team-wide, so it ticks on whoever is acting; `currentTeam().slot` is that actor. This runs
 *  in updateDebuffs, where the acting kit's own inflictions have already landed (its gear comes
 *  before team gear in the phase) and its own stacks still reach everything reading `applied()`. */
const FILM_ROLL: Buff = new Buff({
  name: "Lucilla: Film Roll", maxStacks: 10, duration: 60 * 30,
  updateDebuffs: () => {
    if (!isActive() || currentTeam().slot.resonator === LUCILLA_RESONATOR) return;
    const n = Math.min(applied(GLACIO_CHAFE), frozenStacks());
    if (n <= 0) return;
    removeStackTeam(FILM_ROLL, 1);
    applyEnemy(GLACIO_CHAFE, 2);
  },
});

/** Remembrance (Inherent Skill): each Photo consumed (each Oblivion cast) grants 1 Zoom under
 *  Echo mode or 2 Film Roll under Chafe — on top of Déjà Vu's own flat Liberation grant. */
const LC_INHERENT_2 = new Inherent({
  name: "Inherent: Remembrance",
  grants: [{ on: onAction(OblivionEcho), buff: ZOOM, to: BuffTarget.Team }, { on: onAction(OblivionChafe), buff: FILM_ROLL, stacks: 2, to: BuffTarget.Team }],
});

/** Clear As Day's own cast: +30% Basic Attack/Echo Skill DMG Bonus (Chafe/Echo), 10s. */
const LIB_SELF_DMG = new Buff({
  name: "Lucilla: Clear As Day",
  duration: 60 * 10,
  applyStats: () => addStat(Stat.DmgBonus, 30, isHeld(MODE_CHAFE) ? Type.Basic : Type.Echo),
});

/** Montage (Outro Skill), Echo mode: the incoming resonator gets +50% Echo Skill DMG
 *  Amplification for 14s. */
const MONTAGE_HANDOFF = new Buff({
  name: "Lucilla: Outro (echo)",
  duration: 60 * 14,
  stats: [[Stat.Amp, 50, Type.Echo]],
  lostOnSwap: true,
});

/** Montage, Chafe mode: +60% Glacio Chafe DMG Amplification for 30s to whoever's active,
 *  team-wide rather than a handoff — permanent uptime once granted. Scoped to
 *  `Subtype.GlacioChafe`, the one amplification a dot hit reads (damage.ts). */
const MONTAGE_CHAFE = new Buff({
  name: "Lucilla: Outro (chafe)",
  duration: 60 * 30,
  stats: [[Stat.Amp, 60, Subtype.GlacioChafe]],
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const LUCILLA_TALENTS = new Talent({
  name: "Lucilla: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

const LUCILLA_RESONATOR = new Resonator({
  name: "Lucilla",
  talent: LUCILLA_TALENTS,
  inherent1: LC_INHERENT_1,
  inherent2: LC_INHERENT_2,
  element: Attribute.Glacio,
  weapon: WeaponType.Rectifier,
  color: "#4f74c2",
  intro: Intro,
  maxEnergy: 0,
  maxForte1: 150,

  stats: [[Stat.BaseHp, 12237.5], [Stat.BaseAtk, 375], [Stat.BaseDef, 1197.7756]],
});
OWN_CHAFE_RUNGS.set(LUCILLA_RESONATOR, CHAFE_RUNGS);

// the kit page's own line, both modes: a held Phantom Frame -> Spotlight opener, Liberation into
// Reminiscence, the Tracing Forms combo (Stage 3 auto-queues its own Oblivion/Letting It Go
// hits) closes it out. The mode held decides the typing (and which Oblivion Stage 3 queues), not
// the rotation. She's never the team's own lead, so this covers both opener and loop.

const UBA123 = new ActionGroup("Basic - Tracing Forms 123", [UBA1, UBA2, UBA3]);

const LC_ROTATION = new Rotation([
  INTRO.easyCancel(), Spotlight, Liberation,
  UBA123, LettingGo, ECHO.instaSwap(), Outro,

  START_3, Spotlight, BA1.instaSwap(),

  INTRO_3.easyCancel(), ECHO.instaDodge(), Liberation, UBA123, LettingGo.cancel(),
  Spotlight, 
  Outro,
]);

/* --------------------------------------------------------------------------------- sequences */

/** S1: +20% Crit. Rate for 10s off Spotlight — a short self buff, so it is gone by her next visit
 *  (CLAUDE.md's own window rule). Its Perfect Focus auto-fill only saves the aim her rows already
 *  assume, and the interrupt immunity is no stat. */
const DISTANT_NOON = new Buff({
  name: "Lucilla S1: Distant Noon",
  duration: 60 * 10,
  stats: [[Stat.CritRate, 20]],
});
const LC_S1 = new Sequence({
  name: "Lucilla S1: Distant Noon",
  grants: [{ on: onAction(Spotlight), buff: DISTANT_NOON }],
});

/** S2, off Clear As Day and branching on the mode she is committed to: Chafe amplifies every
 *  Glacio Chafe around the active resonator by 80% (`Subtype.GlacioChafe`, the one amp a dot hit
 *  reads), Echo hands the team +40% Echo Skill DMG Bonus. Both stand for the whole of Reminiscence
 *  and 30s past it, so both are permanent — and one team buff each, since a teammate holds neither
 *  her mode nor this node to branch on. */
const SLUMBERING_CHAFE = new Buff({
  name: "Lucilla S2: Slumbering Moonlight (chafe)",
  stats: [[Stat.Amp, 80, Subtype.GlacioChafe]],
});
const SLUMBERING_ECHO = new Buff({
  name: "Lucilla S2: Slumbering Moonlight (echo)",
  stats: [[Stat.DmgBonus, 40, Type.Echo]],
});
const LC_S2 = new Sequence({
  name: "Lucilla S2: Slumbering Moonlight",
  updateBuffs: () => {
    if (!runningAction(Liberation)) return;
    applyTeam(isHeld(MODE_CHAFE) ? SLUMBERING_CHAFE : SLUMBERING_ECHO, 1);
  },
});

/** S3: +100% DMG Multiplier on Letting It Go. */
const LC_S3 = new Sequence({
  name: "Lucilla S3: Days Fade Unheard",
  applyStats: () => { if (runningAction(LettingGo)) addStat(Stat.MulMv, 100); },
});

/** S4: +10% ATK a stack off each Oblivion, up to 3 — 6s, so the three Photos Stage 3 spends and
 *  the Letting It Go behind them are the whole of it. The damage reduction is out of scope. */
const PAST_FADES = new Buff({
  name: "Lucilla S4: The Past Fades Into Silence", maxStacks: 3, duration: 60 * 6,
  stats: [[Stat.BonusAtk, 10]], perStack: true,
});
const LC_S4 = new Sequence({
  name: "Lucilla S4: The Past Fades Into Silence",
  updateBuffs: () => {
    if (runningAction(OblivionEcho) || runningAction(OblivionChafe)) applyCurrent(PAST_FADES, 1);
  },
});

/** S5: +50% DMG Multiplier on Oblivion, either form. */
const LC_S5 = new Sequence({
  name: "Lucilla S5: Time is Like a Stream",
  applyStats: () => {
    if (runningAction(OblivionEcho) || runningAction(OblivionChafe)) addStat(Stat.MulMv, 50);
  },
});

/** S6: a Remembrance stack per Photo spent, up to 3, each +200% DMG on Letting It Go — which then
 *  spends the lot, so the count it pays on is whatever the Oblivions ahead of it banked. Its
 *  Longing half only refills Trace out of combat. */
const REMEMBRANCE_S6 = new Buff({
  name: "Lucilla S6: Remembrance", maxStacks: 3,
  applyStats: () => { if (runningAction(LettingGo)) addStat(Stat.DmgBonus, 200 * frozenStacks()); },
  convertStats: () => { if (runningAction(LettingGo)) revokeCurrent(REMEMBRANCE_S6); },
});
const LC_S6 = new Sequence({
  name: "Lucilla S6: Gazing In the Mist of Time",
  updateBuffs: () => {
    if (runningAction(OblivionEcho) || runningAction(OblivionChafe)) applyCurrent(REMEMBRANCE_S6, 1);
  },
});

const LC_SEQUENCES = [LC_S1, LC_S2, LC_S3, LC_S4, LC_S5, LC_S6];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat, Resonance Mode (Echo). Freeze Frame, her own signature.
// every echo choice, shared by both her Echo and Chafe mode loadouts — automatically iterated
// (see gear.ts's own EchoLoadout)
const LC_ECHOES = [
  new EchoLoadout(BELL_BORNE_GEOCHELONE, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(HERON, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(FALLACY, DREAM_OF_THE_LOST_3PC, REJUV_2PC),

  new EchoLoadout(BELL_BORNE_GEOCHELONE, LAW_OF_HARMONY_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(FALLACY, LAW_OF_HARMONY_3PC, REJUV_2PC),

  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC),
];

const LC_ECHOES_CHAFE = [
  new EchoLoadout(GLOMMOTH, DREAM_OF_THE_LOST_3PC, QUIET_SNOWFALL_2PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(GLOMMOTH, QUIET_SNOWFALL_5PC),
];

export const LUCILLA = new Loadout({
  resonator: LUCILLA_RESONATOR,
  weapons: [FREEZE_FRAME, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER, LETHEAN_ELEGY],
  echoLoadouts: LC_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.FlatAtk, Substat.Basic, Substat.Skill),
  rotation: LC_ROTATION,
  sequences: LC_SEQUENCES,
  mode: MODE_ECHO,
});

// same weapons/mainstat/substat/echo choices and rotation, the other Resonance Mode
export const LUCILLA_CHAFE = new Loadout({
  resonator: LUCILLA_RESONATOR,
  weapons: [FREEZE_FRAME, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER],
  echoLoadouts: LC_ECHOES_CHAFE,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Skill),
  rotation: LC_ROTATION,
  sequences: LC_SEQUENCES,
  mode: MODE_CHAFE,
});
