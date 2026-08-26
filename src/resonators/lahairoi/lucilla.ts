/**
 * Lucilla, ported to the new engine — sequence-0 core loop only. A glacio Rectifier support/sub-
 * DPS built around Resonance Mode: a stance her loadout commits to for the whole fight (see
 * `ResonanceMode` in kit.ts), not something toggled mid-rotation. Chafe mode reworks her into a
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
 * teammate's own Chafe hit, but that re-proc deals no damage of its own, so — like Buling's own
 * Electro Flare stacks — only the bank is modelled, not the spend. Montage (Outro Skill) also
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
import {
  typeOverride, Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, ResonanceMode, Action, Stat,
  EnemyStat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling, applied, applySelf, applyTeam, applyEnemy,
  isHeld, casting, currentAction, currentTeam, addStat, addEnemyStat, frozenStacks, forte1, queue, queueOutro,
  removeStackTeam, revokeSelf, lostOnSwap,
} from "../../kit.js";
import { Rotation, INTRO, ECHO_CAST, OUTRO_NEXT } from "../../rotation.js";
import { GLACIO_CHAFE } from "../../statuses.js";
import { FREEZE_FRAME, STRINGMASTER, LETHEAN_ELEGY } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { BELL_BORNE_GEOCHELONE, HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC, REJUV_2PC, FREEZING_FROST_2PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { DREAM_OF_THE_LOST_3PC, LAW_OF_HARMONY_3PC } from "../../echoes/septimont.js";
import { NM_HECATE } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../mainstats.js";
import { chem } from "../../substats.js";

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
const Intro = lucillaAction("Intro - Clip It", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 97.42, energy: 11.75, concerto: 14.13, offtune: 5600, forte1: 100, ...CHAFES });
// mutually exclusive: Echo hands off MONTAGE_HANDOFF, Chafe grants MONTAGE_CHAFE team-wide
const Outro = lucillaAction("Outro - Montage", {
  cast: Cast.Outro, mv: 0, active: false,
  updateBuffs: () => {
    if (isHeld(MODE_CHAFE)) applyTeam(MONTAGE_CHAFE, 1);
    else queueOutro(MONTAGE_HANDOFF);
  },
});

// normal attacks: Basic 1/2, Basic 3 (Focus Ring, always assumed Perfect/Commendable)
const BA1 = lucillaAction("Basic - Snapshot 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 59.29, energy: 1.07, concerto: 1.71, offtune: 3408 });
const BA2 = lucillaAction("Basic - Snapshot 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 67.23, energy: 1.22, concerto: 1.94, offtune: 3865 });
const BA3 = lucillaAction("Basic - Snapshot 3 - Commendable", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 235.27, energy: 4.23, concerto: 6.77, offtune: 13524, forte1: 50 });
const MA = lucillaAction("Basic - Snapshot (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.29, energy: 1.55, concerto: 3.66, offtune: 4960 });
const DC = lucillaAction("Basic - Snapshot (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 150.73, energy: 2.71, concerto: 16.4, offtune: 8665 });

// Phantom Frame (the pull-in dash, held to deploy Focus Ring) into either Compensate (cursor
// outside Perfect Focus) or Spotlight (cursor within it); the rotation below only places
// Spotlight, Compensate exported for completeness.
const PhantomFrame = lucillaAction("Skill - Phantom Frame", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 39.78, energy: 1.26, concerto: 2.07, offtune: 4002 });
// also reduces the Resonance Skill's own cooldown by 8s — unmodeled, no CD tracking here
const Compensate = lucillaAction("Skill - Compensate", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 249.07, energy: 9.31, concerto: 3.08, offtune: 4176, forte1: 25 });
// Spotlight lays a Chafe stack too, but only in Glacio Chafe mode
const Spotlight = lucillaAction("Skill - Spotlight", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 548.98, energy: 27.90, concerto: 6.8, offtune: 9205, forte1: 50,
  updateDebuffs: () => { if (isHeld(MODE_CHAFE)) applyEnemy(GLACIO_CHAFE, 1); },
  applyStats: () => { addStat(Stat.AddConcerto, 20); }
});

// Echo Skill DMG under Echo mode; Chafe mode's own typeOverride makes it Basic Attack DMG instead
// (see MODE_CHAFE) — one action, not one per mode
const Liberation = lucillaAction("Liberation - Clear As Day", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Echo, mv: 142.74, concerto: 20, offtune: 38400,
  updateBuffs: () => {
    applySelf(LIB_SELF_DMG, 1);
    if (isHeld(MODE_CHAFE)) applyTeam(FILM_ROLL, 4); else applyTeam(ZOOM, 1);
  },
});

// Reminiscence: Basic Attack - Tracing Forms (unconditionally Basic Attack DMG) and Letting It Go
// (mode-typed). Stage 3 itself triggers Oblivion once per Photo actually banked (forte1, max 3).
const UBA1 = lucillaAction("Basic - Tracing Forms 1", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 76.59, energy: 1.08, concerto: 2.07, offtune: 3425 });
const UBA2 = lucillaAction("Basic - Tracing Forms 2", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 149.42, energy: 12.09, concerto: 4.93, offtune: 6680 });
const UBA3 = lucillaAction("Basic - Tracing Forms 3", {
  node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 416.96, energy: 5.84, concerto: 11.20, offtune: 18640,
  updateBuffs: () => {
    const photos = Math.min(3, Math.floor(forte1() / 50));
    for (let i = 0; i < photos; i++) queue(isHeld(MODE_CHAFE) ? OblivionChafe : OblivionEcho);
    queue(LettingGo);
  },
});

/** Spends a banked Photo for an extra hit — queued by Stage 3 itself. Under Echo mode this is
 *  Echo Skill DMG and a real Echo cast; under Chafe mode it's Basic Attack DMG and inflicts 1
 *  stack of Glacio Chafe. No Energy/Concerto Regen on the page — a real 0. Still two actions,
 *  unlike the Liberation and Letting It Go below: the modes differ in *cast* here too (Echo mode's
 *  is a real Echo cast, what "on Echo cast" watchers fire on; Chafe mode's is no cast at all), and
 *  typeOverride only assigns a damage type. */
const OblivionEcho = lucillaAction("Forte - Oblivion (Echo)", { node: Node.Forte, cast: Cast.Echo, type: Type1.Echo, mv: 285.48, offtune: 9600, forte1: -50 });
const OblivionChafe = lucillaAction("Forte - Oblivion (Chafe)", { node: Node.Forte, type: Type1.Basic, mv: 285.48, offtune: 9600, forte1: -50, ...CHAFES });

// concerto is 7.88 off its own 3 Damage Data hits, plus a separate flat +20 the page states
// Letting It Go "additionally restores" — both folded into the one number below.
// Echo Skill DMG, retagged Basic Attack DMG by Chafe mode the same way the Liberation is
const LettingGo = lucillaAction("Basic - Letting It Go", { node: Node.Liberation, type: Type1.Echo, mv: 848.07, energy: 3.36, concerto: 7.88, offtune: 36514,
  applyStats: () => { addStat(Stat.AddConcerto, 20); }
 });

/* ------------------------------------------------------------------------------------ buffs */

/** A loadout equips exactly one. Neither carries its own stat line — both are pure markers other
 *  pieces read via `isHeld(MODE_ECHO)`, same as checking a sequence Gear. */
const MODE_ECHO = new ResonanceMode({ name: "Lucilla: Resonance Mode - Echo" });
/** Chafe mode is also what makes Clear As Day and Letting It Go Basic Attack DMG rather than Echo
 *  Skill DMG — assigned through typeOverride, the first phase of the action, so every scoped stat
 *  and isType() check sees Basic. */
const MODE_CHAFE = new ResonanceMode({
  name: "Lucilla: Resonance Mode - Glacio Chafe",
  // the retag has to land in the first phase, before anything reads the type (see typeOverride)
  updateDebuffs: () => { const a = currentAction(); if (a === Liberation || a === LettingGo) typeOverride(Type1.Basic); },
});

/** Slow Motion (Inherent Skill): while casting Spotlight, Echo mode grants the whole team +25%
 *  Echo Skill DMG Bonus for 30s — permanent uptime. Team-wide since it lands on whoever's own
 *  turn it currently is, not just Lucilla's own. */
const SLOW_MOTION_TEAM = new Buff({
  name: "Lucilla: Slow Motion",
  applyStats: () => addStat(Stat.DmgBonus, 25, Type1.Echo),
});
/** Chafe-mode payout: -8% Glacio RES on the target for 30s — a genuine enemy debuff, permanent
 *  uptime once granted. */
const SLOW_MOTION_CHAFE = new Debuff({
  name: "Lucilla: Slow Motion",
  applyStats: () => addEnemyStat(EnemyStat.ResShred, 8, Attribute.Glacio),
});
const LC_INHERENT_1 = new Inherent({
  name: "Lucilla: Slow Motion",
  updateBuffs: () => {
    if (currentAction() !== Spotlight) return;
    if (isHeld(MODE_ECHO)) applyTeam(SLOW_MOTION_TEAM, 1);
    else if (isHeld(MODE_CHAFE)) applyEnemy(SLOW_MOTION_CHAFE, 1);
  },
});

/** Déjà Vu (Forte Circuit, base kit): Liberation grants 1 stack of Zoom under Echo mode, or 4
 *  stacks of Film Roll under Chafe (see LUCILLA's own updateBuffs() for the Echo half, LC_INHERENT_2
 *  for the Chafe half). Zoom is team-wide (lands on whichever teammate is attacking); Film Roll
 *  is hers alone. */
const ZOOM = new Buff({
  name: "Lucilla: Zoom", maxStacks: 4,
  applyStats: () => { if (currentAction().active) addStat(Stat.CritDmg, 10 * frozenStacks(), Type1.Echo); },
});
/** Any *other* active resonator inflicting Glacio Chafe spends a stack of this to have Lucilla
 *  inflict two more. Her own casts never trigger it. Cap 10; the real 0.5s cooldown isn't
 *  modelled, so one trigger an action.
 *
 *  Held team-wide, so it ticks on whoever is acting; `currentTeam().slot` is that actor. This runs
 *  in updateDebuffs, where the acting kit's own inflictions have already landed (its gear comes
 *  before team gear in the phase) and its two stacks still reach everything reading `applied()`. */
const FILM_ROLL: Buff = new Buff({
  name: "Lucilla: Film Roll", maxStacks: 10,
  updateDebuffs: () => {
    if (!currentAction().active || currentTeam().slot.resonator === LUCILLA) return;
    if (!applied(GLACIO_CHAFE)) return;
    removeStackTeam(FILM_ROLL, 1);
    applyEnemy(GLACIO_CHAFE, 2);
  },
});

/** Remembrance (Inherent Skill): each Photo consumed (each Oblivion cast) grants 1 Zoom under
 *  Echo mode or 2 Film Roll under Chafe — on top of Déjà Vu's own flat Liberation grant. */
const LC_INHERENT_2 = new Inherent({
  name: "Lucilla: Remembrance",
  updateBuffs: () => {
    const a = currentAction();
    if (a === OblivionEcho) applyTeam(ZOOM, 1);
    if (a === OblivionChafe) applyTeam(FILM_ROLL, 2);
  },
});

/** Clear As Day's own cast: +30% Basic Attack/Echo Skill DMG Bonus (Chafe/Echo), 10s. */
const LIB_SELF_DMG = new Buff({
  name: "Lucilla: Clear As Day",
  applyStats: () => addStat(Stat.DmgBonus, 30, isHeld(MODE_CHAFE) ? Type1.Basic : Type1.Echo),
  convertStats: () => { if (casting(Cast.Outro)) revokeSelf(LIB_SELF_DMG); },
});

/** Montage (Outro Skill), Echo mode: the incoming resonator gets +50% Echo Skill DMG
 *  Amplification for 14s. */
const MONTAGE_HANDOFF = new Buff({
  name: "Lucilla: Outro (echo)",
  applyStats: () => addStat(Stat.Amp, 50, Type1.Echo),
  updateBuffs: () => { lostOnSwap(); },
});

/** Montage, Chafe mode: +60% Glacio Chafe DMG Amplification for 30s to whoever's active,
 *  team-wide rather than a handoff — permanent uptime once granted. Scoped to
 *  `Type2.GlacioChafe`, the one amplification a dot hit reads (damage.ts). */
const MONTAGE_CHAFE = new Buff({
  name: "Lucilla: Outro (chafe)",
  applyStats: () => addStat(Stat.Amp, 60, Type2.GlacioChafe),
});

const LUCILLA = new Resonator({
  name: "Lucilla",
  element: Attribute.Glacio,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  outro: () => Outro,
  color: "#4f74c2",
  maxEnergy: 0,

  constantStats: () => {
    addStat(Stat.BaseHp, 12237.5); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1197.8);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const LUCILLA_TALENTS = new Talent({
  name: "Lucilla: Talents",
  constantStats: () => {
    addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8);
  },
});

// the kit page's own line, both modes: a held Phantom Frame -> Spotlight opener, Liberation into
// Reminiscence, the Tracing Forms combo (Stage 3 auto-queues its own Oblivion/Letting It Go
// hits) closes it out. The mode held decides the typing (and which Oblivion Stage 3 queues), not
// the rotation. She's never the team's own lead, so this covers both opener and loop.

const LC_ROTATION = new Rotation([
  INTRO, PhantomFrame, Spotlight, ECHO_CAST, Liberation,
  UBA1, UBA2, UBA3, OUTRO_NEXT,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat, Resonance Mode (Echo). Freeze Frame, her own signature.
// every echo choice, shared by both her Echo and Chafe mode loadouts — automatically iterated
// (see kit.ts's own EchoLoadout)
const LC_ECHOES = [
  new EchoLoadout(BELL_BORNE_GEOCHELONE, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(NM_HECATE, DREAM_OF_THE_LOST_3PC, FREEZING_FROST_2PC),
  new EchoLoadout(HERON, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(FALLACY, DREAM_OF_THE_LOST_3PC, REJUV_2PC),

  new EchoLoadout(HERON, LAW_OF_HARMONY_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(BELL_BORNE_GEOCHELONE, LAW_OF_HARMONY_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(FALLACY, LAW_OF_HARMONY_3PC, REJUV_2PC),

  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
];

export const LUCILLA_LOADOUT = new Loadout({
  resonator: LUCILLA,
  talent: LUCILLA_TALENTS,
  inherent1: LC_INHERENT_1,
  inherent2: LC_INHERENT_2,
  weapons: [FREEZE_FRAME, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER, LETHEAN_ELEGY],
  echoLoadouts: LC_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
    rotation: LC_ROTATION,
  mode: MODE_ECHO,
});

// same weapons/mainstat/substat/echo choices and rotation, the other Resonance Mode
export const LUCILLA_LOADOUT_CHAFE = new Loadout({
  resonator: LUCILLA,
  talent: LUCILLA_TALENTS,
  inherent1: LC_INHERENT_1,
  inherent2: LC_INHERENT_2,
  weapons: [FREEZE_FRAME, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER, LETHEAN_ELEGY],
  echoLoadouts: LC_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
    rotation: LC_ROTATION,
  mode: MODE_CHAFE,
});
