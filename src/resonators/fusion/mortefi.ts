/**
 * Mortefi, ported to the new engine — a `Tier.Free` 4-star, all six sequence nodes
 * folded into the loadout unconditionally. A fusion Pistols off-field Coordinated Attack support:
 * Burning Rhapsody (Liberation) opens a window where the active resonator's own Basic/Heavy/Skill
 * casts trigger Mortefi's own Marcato — real per-cast coordinated attacks (see BURNING_RHAPSODY
 * below), each firing on his own slot, with Rhythmic Vibrato ramping them live.
 *
 * Numbers from nanoka.cc (character 1204, https://ww.nanoka.cc/character/1204), cross-checked
 * against the migrated (old-engine) sheet's own totals.
 */
import {
  Buff, Talent, Inherent, Sequence, Resonator, Tier, Loadout, EchoLoadout, Stat, Attribute, WeaponType, Type1,
  Type2, Cast, Node, Scaling, applyCurrent, applyTeam, revokeTeam, stacksOfTeam, removeStackTeam, isHeld,
  casting, currentAction, triggeredAction, frozenStacks, isType, addStat, revokeCurrent, queue, queueOn,
  queueOutro, } from "../../kit.js";
import { lostOnSwap } from "../../shared/helpers.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_SWAP, OUTRO, ActionField } from "../../rotation.js";
import { STATIC_MIST, CADENZA, NEW_STD_PISTOL } from "../../weapons/standard.js";
import { HERON, STONEWALL_BRACER, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../../echoes/jinzhou.js";
import { NM_HECATE, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC, HECATE } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { THE_LAST_DANCE } from "../../weapons/pistol.js";

/* ----------------------------------------------------------------------------------- actions */

function mortefiAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter, heavy (Impromptu Show) — BA2/BA4 fold multiple hits into
//     one action, same as their own mv already did
const BA1 = mortefiAction("Basic - Impromptu Show 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 48.30, energy: 0.86, concerto: 2.77, offtune: 2800, forte1: 5 });
const BA2 = mortefiAction("Basic - Impromptu Show 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 40.78 * 2, energy: 1.46, concerto: 4.68, offtune: 4720, forte1: 10 });
const BA3 = mortefiAction("Basic - Impromptu Show 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 107.30, energy: 1.92, concerto: 6.16, offtune: 6160, forte1: 10 });
const BA4 = mortefiAction("Basic - Impromptu Show 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 21.02 * 4 + 126.93, energy: 3.76, concerto: 12.09, offtune: 12080, forte1: 25 });

const HA = mortefiAction("Heavy - Impromptu Show", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 167.01, energy: 2.4, concerto: 7.68, offtune: 9600 });
const MA1 = mortefiAction("Basic - Impromptu Show 1 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 23.25, energy: 0.41, concerto: 1, offtune: 1360 });
const MA2 = mortefiAction("Basic - Impromptu Show 2 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 23.25, energy: 0.41, concerto: 1, offtune: 1360 });
const DC = mortefiAction("Basic - Impromptu Show (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 194.98, energy: 3.5, concerto: 16.4, offtune: 6400 });

// --- resonance skill: Passionate Variation. Elemental DMG reads 0, so concerto is the flat
//     Concerto Regen (18) instead, same treatment as every other such row.
const Skill = mortefiAction("Skill - Passionate Variation", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 208.76, energy: 10, concerto: 18, offtune: 7200, forte1: 40 });

// --- forte circuit: Fury Fugue — spends every point of Annoyance, considered Resonance Skill DMG
const FSkill = mortefiAction("Forte Skill - Fury Fugue", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 326.05, energy: 10, concerto: 18, offtune: 8000, forte1: -100 });

// --- resonance liberation: Violent Finale opens Burning Rhapsody — 28 coordinated attacks banked
//     (10s / 0.35s), the window itself and its firing rules in BURNING_RHAPSODY below. A fresh
//     window is a fresh Rhythmic Vibrato ramp, so the old one is wiped here.
const Liberation = mortefiAction("Liberation - Violent Finale", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 159.05, concerto: 20, offtune: 96000, resetEnergy: true,
  updateBuffs: () => { revokeCurrent(VIBRATO); applyTeam(BURNING_RHAPSODY, 28); },
});
/** Burning Rhapsody as the report reads it: the field his Liberation puts out, which every
 *  Marcato below fires from and BURNING_RHAPSODY's own grant opens. */
const MARCATO_FIELD = new ActionField("Mortefi: Burning Rhapsody");
/** One Marcato, every hit its own row so the detail table's field row counts them — this is the
 *  lead hit of a coordinated attack, which is what carries the Vibrato ramp's +1. */
const ACTION_MARCATO = mortefiAction("Liberation - Marcato", {
  node: Node.Liberation, type: Type1.Liberation, type2: Type2.Coordinated, mv: 31.81, active: false, field: MARCATO_FIELD,
  updateBuffs: () => applyCurrent(VIBRATO, 1),
});
/** The second hit of a Heavy/Skill pair — same hit, but inside the lead's 0.35s Vibrato ICD, so
 *  this copy carries no gain. Same name; the two fold together in the report. */
const ACTION_MARCATO_PAIRED = ACTION_MARCATO.variant("Liberation - Marcato", { updateBuffs: undefined });
/** S5 Funerary Quartet's own real-triggered burst, hit by hit — see `MORTEFI_S5` below. The lead
 *  hit ramps Vibrato once (one 0.35s ICD); the other three carry no gain. His own hit off his own
 *  press, not the field's — no `field` flag, so it stays out of the report's field grouping. */
const ACTION_S5_MARCATO = mortefiAction("Liberation - Marcato (S5 Funerary Quartet)", {
  node: Node.Liberation, type: Type1.Liberation, type2: Type2.Coordinated, mv: 31.81 * 0.5,
  updateBuffs: () => applyCurrent(VIBRATO, 1),
});
const ACTION_S5_MARCATO_PAIRED = ACTION_S5_MARCATO.variant("Liberation - Marcato (S5 Funerary Quartet)", { updateBuffs: undefined });

// --- intro / outro
const Intro = mortefiAction("Intro - Dissonance", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 168.99, energy: 10, concerto: 10, offtune: 8000 });
const Outro = mortefiAction("Outro - Rage Transposition", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => queueOutro(MORTEFI_OUTRO),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Burning Rhapsody as the countdown it is — each stack one 0.35s coordinated-attack slot,
 *  28 banked by the Liberation (10s) plus S4's own 20 (+7s), spent only by firing. On every
 *  active, non-triggered cast: a Basic (with a real hit — mv > 0) draws up to three single
 *  Marcato, a Heavy up to three doubles, each coordinated attack one stack and never more than
 *  remain; a Resonance Skill draws one free double, spending nothing. Empty is over — it outlives
 *  his swap (the ticks land on his own slot regardless), unlike the old lumped window. */
const BURNING_RHAPSODY = new Buff({
  name: "Mortefi: Burning Rhapsody",
  maxStacks: 48,
  field: MARCATO_FIELD,
  updateBuffs: () => {
    if (!currentAction().active || triggeredAction()) return;
    if (casting(Cast.Skill)) { queueOn(MORTEFI_RESONATOR, ACTION_MARCATO); queueOn(MORTEFI_RESONATOR, ACTION_MARCATO_PAIRED); return; }
    const heavy = casting(Cast.Heavy);
    if (!heavy && !(casting(Cast.Basic) && currentAction().mv > 0)) return;
    const n = Math.min(3, stacksOfTeam(BURNING_RHAPSODY));
    for (let i = 0; i < n; i++) {
      queueOn(MORTEFI_RESONATOR, ACTION_MARCATO);
      if (heavy) queueOn(MORTEFI_RESONATOR, ACTION_MARCATO_PAIRED);
    }
    removeStackTeam(BURNING_RHAPSODY, n);
  },
});

/** Rhythmic Vibrato (Inherent Skill), live: each coordinated attack's Marcato hit(s) raise the
 *  next Marcato's DMG by 1.5%, up to 50 — granted by the tick actions themselves, paid out here
 *  off the frozen count so a tick's own gain lands on the next one, not itself. Reset when the
 *  window does (the next Violent Finale — see Liberation). */
const VIBRATO = new Buff({
  name: "Mortefi: Rhythmic Vibrato",
  maxStacks: 50,
  // held by Mortefi alone, so any Coordinated-typed row on his slot is a Marcato
  applyStats: () => { if (isType(Type2.Coordinated)) addStat(Stat.DmgBonus, 1.5 * frozenStacks()); },
});

/** Harmonic Control (Inherent Skill): +25% Fury Fugue DMG for 8s after Passionate Variation —
 *  short window, lost after the outro action gains stats. */
const HARMONIC_CONTROL = new Buff({
  name: "Mortefi: Harmonic Control",
  applyStats: () => { if (currentAction() === FSkill) addStat(Stat.DmgBonus, 25); },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(HARMONIC_CONTROL); },
});
/** Harmonic Control's own trigger — always-equipped Inherent Skill piece. */
const MO_INHERENT_1 = new Inherent({
  name: "Mortefi: Harmonic Control",
  updateBuffs: () => { if (currentAction() === Skill) applyCurrent(HARMONIC_CONTROL, 1); },
});

/** Rhythmic Vibrato (Inherent Skill) — the name; the live ramp itself is the `VIBRATO` buff
 *  above, granted by the Marcato tick actions. */
const MO_INHERENT_2 = new Inherent({ name: "Mortefi: Rhythmic Vibrato" });

/** The window his outro hands the incoming resonator — "or until they are switched out" is
 *  lost-on-swap wording, checked via lostOnSwap() rather than the usual convertStats(). */
const MORTEFI_OUTRO = new Buff({
  name: "Mortefi: Outro",
  applyStats: () => addStat(Stat.Amp, 38, Type1.Heavy),
  updateBuffs: () => { lostOnSwap(); },
});

/** S6 Apoplectic Instrumental: team-wide +20% ATK, 20s — lost on the applier's own next Intro. */
const S6_TEAM_ATK = new Buff({
  name: "Mortefi S6: Apoplectic Instrumental",
  applyStats: () => addStat(Stat.BonusAtk, 20),
  convertStats: () => { if (casting(Cast.Intro) && isHeld(MORTEFI_RESONATOR)) revokeTeam(S6_TEAM_ATK); },
});

/** S1 Solitary Etude: extra Marcato off a teammate's own Resonance Skill cast — depends on their
 *  own kit, so it's a documentary no-op, same reasoning as Rover Havoc's S2/S3. */
const MORTEFI_S1 = new Sequence({ name: "Mortefi S1: Solitary Etude" });

/** S2 Hypocritical Hymn: +10 Energy on Echo Skill — its own 20s ICD dropped, per the standing
 *  ICD simplification. */
const MORTEFI_S2 = new Sequence({
  name: "Mortefi S2: Hypocritical Hymn",
  updateBuffs: () => { if (casting(Cast.Echo)) addStat(Stat.AddEnergy, 10); },
});

/** S3 Flaming Recitativo: +30% Crit DMG on Marcato hits, scoped to `Type2.Coordinated` (covers
 *  both the base window and S5's own burst below). */
const MORTEFI_S3 = new Sequence({
  name: "Mortefi S3: Flaming Recitativo",
  applyStats: () => addStat(Stat.CritDmg, 30, Type2.Coordinated),
});

/** S4 Cathartic Waltz: extends Burning Rhapsody 10s -> 17s — 20 more 0.35s coordinated-attack
 *  slots banked on top of the Liberation's own 28. */
const MORTEFI_S4 = new Sequence({
  name: "Mortefi S4: Cathartic Waltz",
  updateBuffs: () => { if (currentAction() === Liberation) applyTeam(BURNING_RHAPSODY, 20); },
});

/** S5 Funerary Quartet: Mortefi's own Passionate Variation/Fury Fugue hit fires 4 more (half-DMG)
 *  Marcato — his own follow-up, not the Liberation window's, so it fires whether or not Burning
 *  Rhapsody stands. */
const MORTEFI_S5 = new Sequence({
  name: "Mortefi S5: Funerary Quartet",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Skill || a === FSkill) {
      queue(ACTION_S5_MARCATO);
      for (let i = 0; i < 3; i++) queue(ACTION_S5_MARCATO_PAIRED);
    }
  },
});

/** S6 Apoplectic Instrumental — payout lives in `S6_TEAM_ATK` above, this is just its trigger. */
const MORTEFI_S6 = new Sequence({
  name: "Mortefi S6: Apoplectic Instrumental",
  updateBuffs: () => { if (currentAction() === Liberation) applyTeam(S6_TEAM_ATK, 1); },
});

/** Him, as a Resonator: name/element/weapon, every grant/spend/queue rule his kit needs, and his
 *  own base stat line. `Tier.Free` — see the file header. */
const MORTEFI_RESONATOR = new Resonator({
  name: "Mortefi",
  element: Attribute.Fusion,
  weapon: WeaponType.Pistols,
  intro: () => Intro,
  outro: () => Outro,
  color: "#e8734f",
  maxEnergy: 125,
  tier: Tier.Free,

  constantStats: () => {
    addStat(Stat.BaseHp, 10025); addStat(Stat.BaseAtk, 250); addStat(Stat.BaseDef, 1137);
  },
});

// stat-tree bonus alone, spread across four skill nodes (Fusion DMG + ATK), same +12%/+12% shape
// as every other resonator's own
const MORTEFI_TALENTS = new Talent({
  name: "Mortefi: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Attribute.Fusion); },
});

/** A kit-valid line: Intro, a full Impromptu Show combo, Passionate Variation, Liberation (opens
 *  Burning Rhapsody — its own Marcato total queued off Outro), a second combo back to 100
 *  Annoyance, Fury Fugue while the window's still open (S5's own real trigger), Outro. */

const BA1234 = new ActionGroup("Basic - Impromptu Show 1234", [BA1, BA2, BA3, BA4]);

const MO_ROTATION = new Rotation([
  INTRO, Skill,
  BA1234, // TODO swap this
  BA1234,
  FSkill,
  Liberation,
  ECHO_SWAP, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// his real 5pc Moonlit Clouds + Impermanence Heron build, Static Mist signature-adjacent standard
// weapon, all six sequence nodes (Tier.Free — see file header)
export const MORTEFI = new Loadout({
  resonator: MORTEFI_RESONATOR,
  talent: MORTEFI_TALENTS,
  inherent1: MO_INHERENT_1,
  inherent2: MO_INHERENT_2,
  weapons: [STATIC_MIST, CADENZA, NEW_STD_PISTOL, THE_LAST_DANCE],
  echoLoadouts: [
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(STONEWALL_BRACER, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(HECATE, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
    rotation: MO_ROTATION,
  sequences: [MORTEFI_S1, MORTEFI_S2, MORTEFI_S3, MORTEFI_S4, MORTEFI_S5, MORTEFI_S6],
});
