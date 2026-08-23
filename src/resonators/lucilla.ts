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
 * mode, the same actions are Basic Attack DMG instead, and Oblivion additionally inflicts 1 stack
 * of Glacio Chafe on the target.
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
 * grants a permanent +60% Glacio Chafe DMG Amp to whoever's active — currently inert regardless,
 * since no action anywhere yet declares `Type2.GlacioChafe` for it to scope against.
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
  Buff, Debuff, Talent, Inherent, Resonator, Loadout, ResonanceMode, Action, ECHO_CAST, INTRO, Stat, EnemyStat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling,
  applySelf, applyTeam, applyEnemy, isHeld, casting, currentAction, addStat, addEnemyStat, stacks, forte1, queue, queueOutro, revoke,
  lostOnSwap,
} from "../kit.js";
import { FREEZE_FRAME } from "../weapons/rectifier.js";
import { BELL_BORNE_GEOCHELONE, HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC } from "../echoes/jinzhou.js";
import { DREAM_OF_THE_LOST_3PC } from "../echoes/septimont.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function lucillaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune all come off nanoka's own per-hit Damage Data (energy/Elemental DMG
// columns straight off each named hit, offtune off its Weakness Break DMG column), not the
// migrated sheet — that sheet predates offtune entirely and undercounted several figures
// outright. Liberation costs no Resonance Energy at all (maxEnergy: 0 below), so no energy field.
export const Intro = lucillaAction("Intro - Clip It", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 97.42, energy: 11.75, concerto: 14.13, offtune: 5600, forte1: 100, chafe: 1 });
export const Outro = lucillaAction("Outro - Montage", { cast: Cast.Outro, mv: 0, active: false });

// normal attacks: Basic 1/2, Basic 3 (Focus Ring, always assumed Perfect/Commendable)
export const BA1 = lucillaAction("Basic - Snapshot 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 59.29, energy: 1.07, concerto: 1.71, offtune: 3408 });
export const BA2 = lucillaAction("Basic - Snapshot 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 67.23, energy: 1.22, concerto: 1.94, offtune: 3865 });
export const BA3 = lucillaAction("Basic - Snapshot 3 - Commendable", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 235.27, energy: 4.23, concerto: 6.77, offtune: 13524, forte1: 50 });
export const MA = lucillaAction("Basic - Snapshot (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.29, energy: 1.55, concerto: 3.66, offtune: 4960 });
export const DC = lucillaAction("Basic - Snapshot (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 150.73, energy: 2.71, concerto: 6.40, offtune: 8665 });

// Phantom Frame (the pull-in dash, held to deploy Focus Ring) into either Compensate (cursor
// outside Perfect Focus) or Spotlight (cursor within it); the rotation below only places
// Spotlight, Compensate exported for completeness.
export const PhantomFrame = lucillaAction("Skill - Phantom Frame", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 39.78, energy: 1.26, concerto: 2.07, offtune: 4002 });
// also reduces the Resonance Skill's own cooldown by 8s — unmodeled, no CD tracking here
export const Compensate = lucillaAction("Skill - Compensate", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 249.07, energy: 9.31, concerto: 3.08, offtune: 4176, forte1: 25 });
export const Spotlight = lucillaAction("Skill - Spotlight", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 548.98, energy: 27.90, concerto: 6.80, offtune: 9205, forte1: 50 });

// Echo Skill DMG under Echo mode, Basic Attack DMG under Chafe (separate Action objects, since
// `type` is fixed data)
export const Liberation = lucillaAction("Liberation - Clear As Day (Echo)", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Echo, mv: 142.74, concerto: 20, offtune: 38400 });
export const LiberationChafe = lucillaAction("Liberation - Clear As Day (Chafe)", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Basic, mv: 142.74, concerto: 20, offtune: 38400 });

// Reminiscence: Basic Attack - Tracing Forms (unconditionally Basic Attack DMG) and Letting It Go
// (mode-typed). Stage 3 itself triggers Oblivion once per Photo actually banked (forte1, max 3).
export const UBA1 = lucillaAction("Basic - Tracing Forms 1", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 76.59, energy: 1.08, concerto: 2.07, offtune: 3425 });
export const UBA2 = lucillaAction("Basic - Tracing Forms 2", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 149.42, energy: 2.10, concerto: 4.02, offtune: 6680 });
export const UBA3 = lucillaAction("Basic - Tracing Forms 3", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 416.96, energy: 5.84, concerto: 11.20, offtune: 18640 });

/** Spends a banked Photo for an extra hit — queued by Stage 3 itself. Under Echo mode this is
 *  Echo Skill DMG and a real Echo cast; under Chafe mode it's Basic Attack DMG and inflicts 1
 *  stack of Glacio Chafe. No Energy/Concerto Regen on the page — a real 0. */
export const OblivionEcho = lucillaAction("Forte - Oblivion (Echo)", { node: Node.Forte, cast: Cast.Echo, type: Type1.Echo, mv: 285.48, offtune: 9600, forte1: -50 });
export const OblivionChafe = lucillaAction("Forte - Oblivion (Chafe)", { node: Node.Forte, type: Type1.Basic, mv: 285.48, offtune: 9600, forte1: -50, chafe: 1 });

// concerto is 7.88 off its own 3 Damage Data hits, plus a separate flat +20 the page states
// Letting It Go "additionally restores" — both folded into the one number below.
export const LettingGoEcho = lucillaAction("Basic - Letting It Go (Echo)", { node: Node.Liberation, type: Type1.Echo, mv: 848.07, energy: 3.36, concerto: 27.88, offtune: 36514 });
export const LettingGoChafe = lucillaAction("Basic - Letting It Go (Chafe)", { node: Node.Liberation, type: Type1.Basic, mv: 848.07, energy: 3.36, concerto: 27.88, offtune: 36514 });

/* ------------------------------------------------------------------------------------ buffs */

/** A loadout equips exactly one. Neither carries its own stat line — both are pure markers other
 *  pieces read via `isHeld(MODE_ECHO)`, same as checking a sequence Gear. */
export const MODE_ECHO = new ResonanceMode({ name: "Lucilla: Resonance Mode - Echo" });
export const MODE_CHAFE = new ResonanceMode({ name: "Lucilla: Resonance Mode - Glacio Chafe" });

/** Slow Motion (Inherent Skill): while casting Spotlight, Echo mode grants the whole team +25%
 *  Echo Skill DMG Bonus for 30s — permanent uptime. Team-wide since it lands on whoever's own
 *  turn it currently is, not just Lucilla's own. */
export const SLOW_MOTION_TEAM = new Buff({
  name: "Lucilla: Slow Motion",
  apply: () => addStat(Stat.DmgBonus, 25, Type1.Echo),
});
/** Chafe-mode payout: -8% Glacio RES on the target for 30s — a genuine enemy debuff, permanent
 *  uptime once granted. */
export const SLOW_MOTION_CHAFE = new Debuff({
  name: "Lucilla: Slow Motion",
  apply: () => addEnemyStat(EnemyStat.ResShred, 8, Attribute.Glacio),
});
export const LC_INHERENT_1 = new Inherent({
  name: "Lucilla: Slow Motion",
  update: () => {
    if (currentAction() !== Spotlight) return;
    if (isHeld(MODE_ECHO)) applyTeam(SLOW_MOTION_TEAM, 1);
    else if (isHeld(MODE_CHAFE)) applyEnemy(SLOW_MOTION_CHAFE, 1);
  },
});

/** Déjà Vu (Forte Circuit, base kit): Liberation grants 1 stack of Zoom under Echo mode, or 4
 *  stacks of Film Roll under Chafe (see LUCILLA's own update() for the Echo half, LC_INHERENT_2
 *  for the Chafe half). Zoom is team-wide (lands on whichever teammate is attacking); Film Roll
 *  is hers alone. */
export const ZOOM = new Buff({
  name: "Lucilla: Zoom", maxStacks: 4,
  apply: () => { if (currentAction().active) addStat(Stat.CritDmg, 10 * stacks(), Type1.Echo); },
});
/** Fuels a passive Glacio Chafe re-proc off any *other* active teammate's own Chafe hit — no
 *  damage of its own, so like Buling's own Electro Flare stacks, only the bank is modelled.
 *  Remembrance raises its own cap to 10. */
export const FILM_ROLL = new Buff({ name: "Lucilla: Film Roll", maxStacks: 10 });

/** Remembrance (Inherent Skill): each Photo consumed (each Oblivion cast) grants 1 Zoom under
 *  Echo mode or 2 Film Roll under Chafe — on top of Déjà Vu's own flat Liberation grant. */
export const LC_INHERENT_2 = new Inherent({
  name: "Lucilla: Remembrance",
  update: () => {
    const a = currentAction();
    if (a === OblivionEcho) applyTeam(ZOOM, 1);
    if (a === OblivionChafe) applyTeam(FILM_ROLL, 2);
  },
});

/** Clear As Day's own cast: +30% Basic Attack/Echo Skill DMG Bonus (Chafe/Echo), 10s. */
export const LIB_SELF_DMG = new Buff({
  name: "Lucilla: Clear As Day",
  apply: () => addStat(Stat.DmgBonus, 30, isHeld(MODE_CHAFE) ? Type1.Basic : Type1.Echo),
  convert: () => { if (casting(Cast.Outro)) revoke(LIB_SELF_DMG); },
});

/** Montage (Outro Skill), Echo mode: the incoming resonator gets +50% Echo Skill DMG
 *  Amplification for 14s. */
export const MONTAGE_HANDOFF = new Buff({
  name: "Lucilla: Outro",
  apply: () => addStat(Stat.Amp, 50, Type1.Echo),
  update: () => { lostOnSwap(); },
});

/** Montage, Chafe mode: +60% Glacio Chafe DMG Amplification for 30s to whoever's active,
 *  team-wide rather than a handoff — permanent uptime once granted. Scoped to
 *  `Type2.GlacioChafe`, which nothing here declares yet, so this has no live effect. */
export const MONTAGE_CHAFE = new Buff({
  name: "Lucilla: Montage (chafe)",
  apply: () => addStat(Stat.Amp, 60, Type2.GlacioChafe),
});

export const LUCILLA = new Resonator({
  name: "Lucilla",
  element: Attribute.Glacio,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  color: "#4f74c2",
  maxEnergy: 0,

  update: () => {
    const a = currentAction();
    if (a === Liberation || a === LiberationChafe) applySelf(LIB_SELF_DMG, 1);
    if (a === Liberation) applyTeam(ZOOM, 1);
    if (a === LiberationChafe) applyTeam(FILM_ROLL, 4);
    if (a === UBA3) {
      const photos = Math.min(3, Math.floor(forte1() / 50));
      const chafe = isHeld(MODE_CHAFE);
      for (let i = 0; i < photos; i++) queue(chafe ? OblivionChafe : OblivionEcho);
      queue(chafe ? LettingGoChafe : LettingGoEcho);
    }
    // mutually exclusive: Echo hands off MONTAGE_HANDOFF, Chafe grants MONTAGE_CHAFE team-wide
    if (a === Outro) {
      if (isHeld(MODE_CHAFE)) applyTeam(MONTAGE_CHAFE, 1);
      else queueOutro(MONTAGE_HANDOFF);
    }
  },

  apply: () => {
    addStat(Stat.BaseHp, 12237.5); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1197.8);
    addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const LUCILLA_TALENTS = new Talent({
  name: "Lucilla: Talents",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8); }
});

// the kit page's own Echo-mode line: a held Phantom Frame -> Spotlight opener, Liberation into
// Reminiscence, the Tracing Forms combo (Stage 3 auto-queues its own Oblivion/Letting It Go
// hits) closes it out. She's never the team's own lead, so this covers both opener and loop.
export const LC_ROTATION = [
  INTRO, PhantomFrame, Spotlight, ECHO_CAST, Liberation,
  UBA1, UBA2, UBA3, Outro,
];

// same kit-valid line, Chafe mode — only the mode-typed actions differ; every trigger above
// already branches on isHeld(MODE_CHAFE) to pick them.
export const LC_ROTATION_CHAFE = [
  INTRO, PhantomFrame, Spotlight, ECHO_CAST, LiberationChafe,
  UBA1, UBA2, UBA3, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat, Resonance Mode (Echo). Freeze Frame, her own signature.
export const LC_LOADOUT = new Loadout(
  LUCILLA,
  LUCILLA_TALENTS,
  LC_INHERENT_1,
  LC_INHERENT_2,
  FREEZE_FRAME,
  BELL_BORNE_GEOCHELONE,
  DREAM_OF_THE_LOST_3PC,
  MOONLIT_CLOUDS_2PC,
  mainstats("CD", "glacio glacio", "atk atk"),
  chem("atk", "basic"),
  undefined, undefined, undefined, undefined, undefined, undefined,
  MODE_ECHO,
);

// same weapon/mainstat/substat, different mainslot/sonata and Resonance Mode — same shape as
// Qiuyuan's own two loadouts, which likewise only ever swap mainslot/sonata
export const LC_LOADOUT_CHAFE = new Loadout(
  LUCILLA,
  LUCILLA_TALENTS,
  LC_INHERENT_1,
  LC_INHERENT_2,
  FREEZE_FRAME,
  HERON,
  MOONLIT_CLOUDS_5PC,
  MOONLIT_CLOUDS_2PC,
  mainstats("CD", "glacio glacio", "atk atk"),
  chem("atk", "basic"),
  undefined, undefined, undefined, undefined, undefined, undefined,
  MODE_CHAFE,
);
