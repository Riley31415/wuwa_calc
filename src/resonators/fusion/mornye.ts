/**
 * Mornye, ported to the new engine — a Fusion Broadblade support/sub-DPS, and the second kit built
 * on the Tune Break variants (see tunebreak.ts).
 *
 * Unlike Lynae she never *inflicts* a Shifting; she only answers one, so she wants a Shifter beside
 * her. Both halves of Decoupling are the same shape as Lynae's Spectral Analysis:
 *
 * - **Rupture**: any teammate's break resolving as a Rupture queues her Particle Jet (298.22%).
 * - **Strain**: each stack of Tune Strain - Interfered turns every point of her Tune Break Boost
 *   into +0.12% of her total damage. She carries only the flat 10 every tune-break-era resonator
 *   has (nanoka's own `stats_weakness.weakness_mastery`) — her kit adds none of its own.
 *
 * Her real contribution is the **Syntony Field**: +50% Off-Tune Buildup Rate to the whole team,
 * which is what fills the shared bar faster and so lands more breaks for everyone (the engine banks
 * off-tune through `Stat.OfftuneBuildup`, see evaluate()). The Liberation upgrades it to a High
 * Syntony Field, which keeps that and adds +20% team DEF.
 *
 * Her Liberation and her healing scale off DEF; everything else is ATK (nanoka's own
 * `related_property` per hit). MVs and energy/concerto/off-tune off nanoka.cc (character 1209,
 * https://ww.nanoka.cc/character/1209), read the way CLAUDE.md describes.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, Stat, Attribute, WeaponType, Type1, Cast, Node,
  Scaling, addStat, applyCurrent, applyTeam, currentAction, queue, queueOutro, revokeCurrent, getStat, stacksOf,
  maxStackIncrease, Debuff, applyEnemy, revokeEnemy, isHeld, stacksOfEnemy,
  ActionGroup,
} from "../../engine/kit.js";
import { Rotation, START_COMBAT, OPENER, INTRO, ECHO_CAST, OUTRO_NEXT, START_COMBAT_NON_OPENER } from "../../engine/rotation.js";
import { HEALS } from "../../shared/status.js";
import {
  TUNE_BREAK, TUNE_RUPTURE_INTERFERED, TUNE_STRAIN_INTERFERED, interferedWindow, tuneRuptureResponse,
  tuneStrainBonus,
} from "../../shared/tunebreak.js";
import { STARFIELD_CALIBRATOR } from "../../weapons/broadblade.js";
import { DISCORD } from "../../weapons/standard.js";
import { REACTOR_HUSK, SPACETREK_EXPLORER, STARRY_RADIANCE_5PC, STARRY_RADIANCE_2PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function mornyeAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// --- Baseline Mode, the ground chain she opens from
const BA1 = mornyeAction("Basic - Ground State Calibration 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 55.69, energy: 0.89, concerto: 2.8, offtune: 2800, forte1: 20 });
const BA2 = mornyeAction("Basic - Ground State Calibration 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 119.32, energy: 1.92, concerto: 6, offtune: 6000, forte1: 43 });
const BA3 = mornyeAction("Basic - Ground State Calibration 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 103.4, energy: 1.67, concerto: 5.2, offtune: 5200, forte1:37 });
const BA4 = mornyeAction("Basic - Ground State Calibration 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 135.2, energy: 2.13, concerto: 6.8, offtune: 6800, forte1:100 });
const HA = mornyeAction("Heavy - Ground State Calibration", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 37, energy: 0.79, concerto: 2.5, offtune: 2480, forte1: 20 });
const MA = mornyeAction("Basic - Ground State Calibration (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 98.61, energy: 1.55, concerto: 4.96, offtune: 4960 });
const DC = mornyeAction("Basic - Ground State Calibration (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 162.23, energy: 2.55, concerto: 18.16, offtune: 8160, forte1: 20 });

// --- Wide Field Observation Mode, the airborne state the Syntony Field lives in
const WBA1 = mornyeAction("Basic - Wide Field Observation 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 55.68, energy: 0.88, concerto: 1.4, offtune: 2800, forte2: 10 });
const WBA2 = mornyeAction("Basic - Wide Field Observation 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 103.4, energy: 1.64, concerto: 2.56, offtune: 5200, forte2: 12 });
const WBA3 = mornyeAction("Basic - Wide Field Observation 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 103.42, energy: 1.64, concerto: 2.56, offtune: 5200, forte2: 18 });
const WDC = mornyeAction("Basic - Wide Field Observation (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 103.4, energy: 1.64, concerto: 12.56, offtune: 5200, forte2: 12 });

// --- Forte Circuit. Geopotential Shift is what banks Rest Mass Energy into the airborne state;
//     Inversion is the payoff once Relative Momentum tops out.
// her Intro is what puts her airborne, and the field comes up with the state
const FIELD = { updateBuffs: () => queue(SyntonyFieldHit) };
const GeopotentialShift = mornyeAction("Heavy - Geopotential Shift", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 143.16, energy: 3.01, concerto: 9.61, offtune: 9600, forte1: -100, ...FIELD });
const Inversion = mornyeAction("Heavy - Inversion", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 258.46, energy: 3.25, concerto: 11.96, offtune: 10400, forte2: -100,
  updateBuffs: () => applyEnemy(OBSERVATION_MARKER, 1),
});

/** The field's own opening hit, counted as Resonance Liberation DMG by the kit page. */
const SyntonyFieldHit = mornyeAction("Forte - Syntony Field", {
  node: Node.Forte, type: Type1.Liberation, mv: 198.85, active: false,
  updateBuffs: () => applyTeam(SYNTONY_FIELD, 1),
});

// --- Resolution. Expectation Error is the baseline Resonance Skill and does nothing but heal
//     (94 + 24.94% of her DEF); it carries no motion value, energy, concerto or off-tune of its
//     own. The Parry state it opens is purely defensive and holds no stat, so it is not modelled —
//     and being attacked out of it is what casts Optimal Solution, which this calculator has no
//     incoming attacks to trigger, so a rotation names that directly.
// updateDebuffs on both skills is her own healing marker, read by every healing sonata and weapon
// (statuses.ts) — applied to the healer alone, never the team
const SKILL_HEAL = { updateDebuffs: () => applyCurrent(HEALS, 1) };
const Skill = mornyeAction("Skill - Expectation Error", { node: Node.Skill, cast: Cast.Skill, ...SKILL_HEAL });
const OptimalSolution = mornyeAction("Skill - Optimal Solution", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 179.73, energy: 3.96, concerto: 9.04, offtune: 9040, forte1: 100 });
const DistributedArray = mornyeAction("Skill - Distributed Array", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 159.08, energy: 18.52, concerto: 10, offtune: 8000, forte2: 60, ...SKILL_HEAL });

/** Critical Protocol scales off DEF, not ATK. */
const Liberation = mornyeAction("Liberation - Critical Protocol", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, scaling: Scaling.Def,
  mv: 522.33, concerto: 20, offtune: 72000, resetEnergy: true,
  // trades the field up, so the plain one goes as the High one lands
  updateBuffs: () => {
    applyCurrent(CRITICAL_PROTOCOL, 1);
    if (stacksOf(SYNTONY_FIELD)) {
      revokeCurrent(SYNTONY_FIELD);
      applyTeam(HIGH_SYNTONY_FIELD, 1);
    }
  },
});

const Intro = mornyeAction("Intro - Convergence", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 202.79, energy: 10, concerto: 10, offtune: 13600, ...FIELD });
const Outro = mornyeAction("Outro - Recursion", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => applyTeam(RECURSION)
});

/** Her answer to a Rupture break, queued by the engine's own break (see MORNYE's updateBuffs())
 *  rather than played. An ordinary active cast, like every Tune Break response: it is her own hit,
 *  and marking it inactive would have every "lost on switching out" buff she holds revoke itself
 *  the moment a break went off. */
const ParticleJet = mornyeAction("Tune Rupture Response - Particle Jet", {
  node: Node.Forte, type: Type1.Rupture, mv: 298.22,
});

/* ------------------------------------------------------------------------------------- buffs */

/** Syntony Field: 25s, so permanent uptime. The +50% Off-Tune Buildup Rate is the whole point —
 *  it is what makes the team's shared bar fill faster and so lands more Tune Breaks, which is what
 *  both her own halves and any Shifter beside her are paid in. Team-wide but field-bound, so it
 *  only counts for whoever is actually on field. */
const SYNTONY_FIELD = new Buff({
  name: "Mornye: Syntony Field",
  applyStats: () => { addStat(Stat.OfftuneBuildup, 50); },
});

/** The Liberation eats the Syntony Field and leaves this instead: everything above plus +20% team
 *  DEF, same 25s. Modelled as its own buff holding both halves, with the plain field revoked as it
 *  lands, so the two never double up. */
const HIGH_SYNTONY_FIELD = new Buff({
  name: "Mornye: High Syntony Field",
  applyStats: () => {
    addStat(Stat.OfftuneBuildup, 50);
    addStat(Stat.BonusDef, 20);
  },
});

/** Recursion (Outro): +25% All DMG Amplification to the team for 30s. */
const RECURSION = new Buff({
  name: "Mornye: Outro",
  applyStats: () => addStat(Stat.Amp, 25),
});

/** Critical Protocol's own conversion: every 1% of ER past 100% is +0.5% Crit. Rate (cap 80) and
 *  +1% Crit. DMG (cap 160) *on that skill only*. Taken at the cap, per CLAUDE.md's rule for a
 *  bonus keyed off the resonator's own stats — she runs an ER weapon, an ER echo and an ER main
 *  stat, so 260% ER is the build rather than a stretch. */
const CRITICAL_PROTOCOL = new Buff({
  name: "Mornye: Critical Protocol",
  convertStats: () => {
    revokeCurrent(CRITICAL_PROTOCOL);
    addStat(Stat.CritRate, Math.min(80, 0.5 * (getStat(Stat.Er) - 100)));
    addStat(Stat.CritDmg, Math.min(160, 1 * (getStat(Stat.Er) - 100)));
  }
});

/** Observation Marker: left on the target by Inversion for 30s — permanent uptime — and what arms
 *  the chain: any teammate's Tune Break DMG against the marked target has Mornye inflict the
 *  Interfered Marker below. Watching from the debuff itself, so it only reacts while inflicted,
 *  and the applyEnemy() inside inherits this debuff's own source — her doing, whoever broke. */
const OBSERVATION_MARKER = new Debuff({
  name: "Mornye: Observation Marker",
  // cleared before it goes back on: the marker counts its own 8s off in its stacks (tunebreak.ts),
  // and unlike a Rupture/Hack Interfered it can be re-marked inside that window — a break that
  // leaves a Strain, or none at all, is held off by nothing — so a fresh one starts the count over
  // rather than pushing the old one along.
  updateGlobal: () => {
    if (currentAction() !== TUNE_BREAK) return;
    revokeEnemy(INTERFERED_MARKER);
    applyEnemy(INTERFERED_MARKER, 1);
  },
});

/** Interfered Marker: while the target is under Tune Rupture/Strain - Interfered, whoever's on
 *  field deals +0.25% DMG per 1% of Mornye's ER past 100%, up to 40% — taken at the cap, same
 *  260%-ER build call as Critical Protocol above. 8s, the same window every Interfered runs on
 *  (tunebreak.ts) rather than a clock of its own, refreshed by every break the marker answers. */
const INTERFERED_MARKER = interferedWindow({
  name: "Mornye: Interfered Marker",
  applyStats: () => {
    if (stacksOfEnemy(TUNE_RUPTURE_INTERFERED) > 0 || stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0) addStat(Stat.DmgBonus, 40);
  },
});

/* --------------------------------------------------------------------------- kit and loadout */

/** Blueprint: +10% ER flat, plus 20 Concerto on her Intro and on Wide Field stage 3 — both once
 *  every 20s, which over a 2-minute rotation is once each per loop. */
const MO_INHERENT_1 = new Inherent({
  name: "Mornye: Blueprint",
  constantStats: () => addStat(Stat.Er, 10),
  applyStats: () => {
    const a = currentAction();
    if (a === Intro || a === WBA3) addStat(Stat.AddConcerto, 20);
  },
});

/** Boundedness is a damage-taken cap and a revive — no damage of its own, so it is here as the
 *  piece of gear it is and contributes nothing. */
const MO_INHERENT_2 = new Inherent({ name: "Mornye: Boundedness" });

const MORNYE_TALENTS = new Talent({
  name: "Mornye: Talents",
  constantStats: () => { addStat(Stat.BonusDef, 15.2); addStat(Stat.HealingBonus, 12); },
});

const MORNYE = new Resonator({
  name: "Mornye",
  element: Attribute.Fusion,
  weapon: WeaponType.Broadblade,
  intro: () => Intro,
  outro: () => Outro,
  color: "#ecabe3",
  maxEnergy: 175,

  updateGlobal: () => tuneRuptureResponse(ParticleJet),
  combatStart: () => maxStackIncrease(TUNE_STRAIN_INTERFERED, 1),
  lateConvertStats: () => tuneStrainBonus(),

  constantStats: () => {
    addStat(Stat.BaseHp, 15375); addStat(Stat.BaseAtk, 287.5); addStat(Stat.BaseDef, 1356.7);
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    addStat(Stat.Tbb, 10);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

const BA123 = new ActionGroup("Basic - Ground State Calibration 123", [BA1, BA2, BA3]);
const WBA123 = new ActionGroup("Basic - Wide Field Observation 123", [WBA1, WBA2, WBA3]);

/** Intro straight into Wide Field Observation (which is what raises the Syntony Field), the Wide
 *  Field chain into Inversion, then Distributed Array, the echo and the Liberation to trade the
 *  field up before handing off. She is never the team's lead, so this is both opener and loop. */
const MO_ROTATION = new Rotation([
  START_COMBAT_NON_OPENER, Skill, START_COMBAT_NON_OPENER,
  OPENER, BA123, GeopotentialShift,
  INTRO, Liberation,
  WBA123, DistributedArray, Inversion, 
  ECHO_CAST, OUTRO_NEXT,
]);

/** ER is the build: her Liberation converts everything past 100% into crit, so the sig's 77% and
 *  Reactor Husk's own 10% are both doing real work. */
const MO_ECHOES = [
  new EchoLoadout(REACTOR_HUSK, STARRY_RADIANCE_5PC, STARRY_RADIANCE_2PC),
  new EchoLoadout(SPACETREK_EXPLORER, STARRY_RADIANCE_5PC, STARRY_RADIANCE_2PC),
];

export const MORNYE_LOADOUT = new Loadout({
  resonator: MORNYE,
  talent: MORNYE_TALENTS,
  inherent1: MO_INHERENT_1,
  inherent2: MO_INHERENT_2,
  weapons: [STARFIELD_CALIBRATOR, DISCORD],
  echoLoadouts: MO_ECHOES,
  mainstats: mainstatOptions(Mainstat.DEF4, Mainstat.ER3, Mainstat.DEF1),
  substat: chem("def", "liberation"),
    rotation: MO_ROTATION,
});
