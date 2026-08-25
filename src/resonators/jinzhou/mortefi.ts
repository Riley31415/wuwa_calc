/**
 * Mortefi, ported to the new engine — a `standardCharacter: true` 4-star, all six sequence nodes
 * folded into the loadout unconditionally. A fusion Pistols off-field Coordinated Attack support:
 * Burning Rhapsody (Liberation) opens a 10s window where the active resonator's own Basic/Heavy
 * hits trigger Mortefi's own Marcato — lumped into one action queued off his Outro, same shape as
 * Zhezhi's Inklit Spirit/Cantarella's Diffusion, rather than live per-hit tracking.
 *
 * Numbers from nanoka.cc (character 1204, https://ww.nanoka.cc/character/1204), cross-checked
 * against the migrated (old-engine) sheet's own totals.
 */
import {
  Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling,
  applySelf, applyTeam, revokeTeam, stacksOfTeam, isHeld, casting, currentAction, addStat, revoke, queue,
  queueOutro, lostOnSwap,
} from "../../kit.js";
import { STATIC_MIST, CADENZA, NEW_STD_PISTOL } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../../echoes/jinzhou.js";
import { NM_HECATE, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC, HECATE } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../mainstats.js";
import { chem } from "../../substats.js";

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

// --- resonance liberation: Violent Finale opens Burning Rhapsody; Marcato's own window is queued
//     separately off Outro (see ACTION_LIB_COORDS below)
const Liberation = mortefiAction("Liberation - Violent Finale", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 159.05, concerto: 20, offtune: 96000, resetEnergy: true });
/** The whole Burning Rhapsody window, lumped: 35 Coordinated Attacks x 2 Marcato = 70 hits, the
 *  migrated sheet's own assumed real-rotation uptime, not a theoretical duration/0.35s max. */
const ACTION_LIB_COORDS = mortefiAction("Liberation - Marcato x70", { node: Node.Liberation, type: Type1.Liberation, type2: Type2.Coordinated, mv: 31.81 * 70, active: false });
/** S5 Funerary Quartet's own real-triggered burst — see `MORTEFI_S5` below. */
const ACTION_S5_MARCATO = mortefiAction("Liberation - Marcato x4 (S5 Funerary Quartet)", { node: Node.Liberation, type: Type1.Liberation, type2: Type2.Coordinated, mv: 31.81 * 4 * 0.5 });

// --- intro / outro
const Intro = mortefiAction("Intro - Dissonance", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 168.99, energy: 10, concerto: 10, offtune: 8000 });
const Outro = mortefiAction("Outro - Rage Transposition", { cast: Cast.Outro, mv: 0, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** Burning Rhapsody's own "is the window open" flag — no stat of its own, just what S5 reads.
 *  Team-wide, closed on Mortefi's own Outro specifically (`isHeld(MORTEFI)`). */
const BURNING_RHAPSODY = new Buff({
  name: "Mortefi: Burning Rhapsody",
  updateBuffs: () => { if (casting(Cast.Outro) && isHeld(MORTEFI)) revokeTeam(BURNING_RHAPSODY); },
});

/** Harmonic Control (Inherent Skill): +25% Fury Fugue DMG for 8s after Passionate Variation —
 *  short window, lost after the outro action gains stats. */
const HARMONIC_CONTROL = new Buff({
  name: "Mortefi: Harmonic Control",
  applyStats: () => { if (currentAction() === FSkill) addStat(Stat.DmgBonus, 25); },
  convertStats: () => { if (casting(Cast.Outro)) revoke(HARMONIC_CONTROL); },
});
/** Harmonic Control's own trigger — always-equipped Inherent Skill piece. */
const MO_INHERENT_1 = new Inherent({
  name: "Mortefi: Harmonic Control",
  updateBuffs: () => { if (currentAction() === Skill) applySelf(HARMONIC_CONTROL, 1); },
});

/** Rhythmic Vibrato (Inherent Skill): a live per-Marcato-hit stacking ramp, incompatible with the
 *  lumped single-action window above — held for the name only. */
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
  convertStats: () => { if (casting(Cast.Intro) && isHeld(MORTEFI)) revokeTeam(S6_TEAM_ATK); },
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

/** S4 Cathartic Waltz: extends Burning Rhapsody 10s -> 17s — already folded into
 *  ACTION_LIB_COORDS's own 70-hit total above, so this is a documentary marker only. */
const MORTEFI_S4 = new Sequence({ name: "Mortefi S4: Cathartic Waltz" });

/** S5 Funerary Quartet: Mortefi's own Passionate Variation/Fury Fugue hit fires 4 more (half-DMG)
 *  Marcato while Burning Rhapsody is open. */
const MORTEFI_S5 = new Sequence({
  name: "Mortefi S5: Funerary Quartet",
  updateBuffs: () => {
    const a = currentAction();
    if (stacksOfTeam(BURNING_RHAPSODY) && (a === Skill || a === FSkill)) queue(ACTION_S5_MARCATO);
  },
});

/** S6 Apoplectic Instrumental — payout lives in `S6_TEAM_ATK` above, this is just its trigger. */
const MORTEFI_S6 = new Sequence({
  name: "Mortefi S6: Apoplectic Instrumental",
  updateBuffs: () => { if (currentAction() === Liberation) applyTeam(S6_TEAM_ATK, 1); },
});

/** Him, as a Resonator: name/element/weapon, every grant/spend/queue rule his kit needs, and his
 *  own base stat line. `standardCharacter: true` — see the file header. */
const MORTEFI = new Resonator({
  name: "Mortefi",
  abbreviation: "Mort",
  element: Attribute.Fusion,
  weapon: WeaponType.Pistols,
  intro: () => Intro,
  color: "#e8734f",
  maxEnergy: 125,
  standardCharacter: true,

  updateBuffs: () => {
    const a = currentAction();
    if (a === Liberation) applyTeam(BURNING_RHAPSODY, 1);
    if (a === Outro) { queue(ACTION_LIB_COORDS); queueOutro(MORTEFI_OUTRO); }
  },

  applyStats: () => {
    addStat(Stat.BaseHp, 10025); addStat(Stat.BaseAtk, 250); addStat(Stat.BaseDef, 1137);
  },
});

// stat-tree bonus alone, spread across four skill nodes (Fusion DMG + ATK), same +12%/+12% shape
// as every other resonator's own
const MORTEFI_TALENTS = new Talent({
  name: "Mortefi: Talents",
  applyStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Attribute.Fusion); },
});

/** A kit-valid line: Intro, a full Impromptu Show combo, Passionate Variation, Liberation (opens
 *  Burning Rhapsody — its own Marcato total queued off Outro), a second combo back to 100
 *  Annoyance, Fury Fugue while the window's still open (S5's own real trigger), Outro. */
const MO_ROTATION = [
  INTRO,
  Skill,
  BA4, // TODO swap this
  BA1, BA2, BA3, BA4,
  FSkill,
  Liberation,
  ECHO_CAST,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// his real 5pc Moonlit Clouds + Impermanence Heron build, Static Mist signature-adjacent standard
// weapon, all six sequence nodes (standardCharacter — see file header)
export const MORT_LOADOUT = new Loadout({
  resonator: MORTEFI,
  talent: MORTEFI_TALENTS,
  inherent1: MO_INHERENT_1,
  inherent2: MO_INHERENT_2,
  weapons: [STATIC_MIST, CADENZA, NEW_STD_PISTOL],
  echoLoadouts: [
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(HECATE, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
  opener: MO_ROTATION,
  loop: MO_ROTATION,
  sequences: [MORTEFI_S1, MORTEFI_S2, MORTEFI_S3, MORTEFI_S4, MORTEFI_S5, MORTEFI_S6],
});
