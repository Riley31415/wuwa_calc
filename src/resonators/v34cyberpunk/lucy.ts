/**
 * Lucy — a Spectro Pistols main DPS, and the other half of the Cyberpunk collab pair (filed under
 * Lahairoi with Rebecca and their shared echo). Everything
 * that matters in her kit is Heavy Attack DMG, including the Basic Attack chain she gets in her
 * enhanced state and the Resonance Skill and Liberation that bracket it.
 *
 * She is the second Hack kit (see tunebreak.ts and Rebecca's own file): Payload, Deadlock and
 * Multi-threading all lay Hack - Shifting, and she answers Hack - Interfered with Data Crash, a
 * 1367.75% tune-scaled hit.
 *
 * Her loop is one state machine with two gauges:
 * - **TCP** (forte1, 0-100), banked by the ordinary Locked Thread attacks and by Payload/Pulse
 *   Interference. At 100 both Resonance Skills are replaced by **Deadlock**, which spends the whole
 *   bar and drops her into **Algorithm Compaction** (+65% Spectro DMG Bonus, 8s) with one **SQL**.
 * - **Root Access** (forte2, 0-100), banked only inside Compaction, by Thread Shredding and Single
 *   Threading. At 100 Single Threading becomes **Dual Threading**, which spends it and opens
 *   **Multi-threading** — the SQL hit, x3.7 its own multiplier, and what upgrades the Liberation to
 *   Old Net Deep Dive. The Liberation then ends Compaction and clears TCP.
 *
 * Digital Handshake's +1 TCP/s while on field has no clock to run on here, so the buff Pulse
 * Interference grants is a marker that hands out nothing; her loop reaches exactly 100 TCP without
 * it — the Skill chain's own 24, the 20 the Intro arms onto the Pulse Interference that follows
 * it, and 56 off Basics 2-4.
 *
 * The Liberation's Protocol Interface spends 24 RAM across up to seven Spoofing Programs; the
 * damage-optimal set against a single boss is Ping (2) + Cyberware Malfunction (4) + Breach
 * Protocol (4) + Synapse Burnout (5) + Cripple Movement (6) = 21, and that is what fires here.
 * Weapon Glitch is defensive and Cyberpsychosis only works on Common Class enemies, so neither is
 * worth the rest. Cripple Movement's own -5% enemy ATK has nothing to reduce in this calculator.
 *
 * Function Cracking's Network Backdoor is banked off *defeating* a marked Overlord/Calamity target,
 * which a single-target rotation never does — the piece is present for the kit's shape and pays
 * nothing (same standing as Luuk's Pulses Under the Snow).
 *
 * MVs off nanoka.cc (character 1511), per-hit x hit count as CLAUDE.md describes, with the flat
 * Concerto Regen rows folded in (Liberation 20, Intro 10, Pulse Interference / Deadlock / Dual
 * Threading / Multi-threading 8 apiece) and the hidden +10 on both dodge counters.
 * Energy/off-tune and the per-action TCP/Root Access are wuwalab's frame data
 * (api.wuwalab.com/api/app/characters/lucy) summed the same way, cross-checked against the
 * migrated sheet.
 */
import {
  Buff, Debuff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, Stat, EnemyStat, Attribute, WeaponType,
  Type1, Cast, Node, Scaling, addStat, addEnemyStat, applyEnemy, applyCurrent, applyTeam, casting, currentAction,
  isHeld, queue, queueOutro, revokeSelf as revokeSelf, revokeTeam, forte1, forte2, setForte1, setForte2,
  lostOnSwap, getStat,
} from "../../engine/kit.js";
import { Rotation, START_COMBAT, INTRO, ECHO_CAST, OUTRO_NEXT } from "../../engine/rotation.js";
import { applied } from "../../engine/kit.js";
import { applyHack, tuneHackResponse, TUNE_HACK_SHIFTING } from "../../engine/tunebreak.js";
import { SPECTRAL_TRIGGER } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { CELESTIAL_LIGHT_2PC, LINGERING_TUNES_2PC } from "../../echoes/jinzhou.js";
import { ADAM_SMASHER_LUCY, NEONLIGHT_LEAP_2PC, REEL_2PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../engine/mainstats.js";
import { chem } from "../../engine/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function lucyAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Locked Thread, the ordinary chain. Everything here banks TCP.
const BA1 = lucyAction("Basic - Locked Thread 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 121.49, energy: 1.9, concerto: 6.17, offtune: 7520, forte1: 16 });
const BA2 = lucyAction("Basic - Locked Thread 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 60.76, energy: 0.96, concerto: 3.07, offtune: 3761, forte1: 12 });
const BA3 = lucyAction("Basic - Locked Thread 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 120.2, energy: 1.87, concerto: 6.06, offtune: 7440, forte1: 18 });
const BA4 = lucyAction("Basic - Locked Thread 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 155.09, energy: 2.4, concerto: 7.8, offtune: 9600, forte1: 26 });
const MA = lucyAction("Basic - Locked Thread (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 116.32, energy: 2.26, concerto: 5.86, offtune: 7200, forte1: 8 });
const DC = lucyAction("Basic - Locked Thread (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 197.73, energy: 3.83, concerto: 19.96, offtune: 12240, forte1: 12 });
const HA1 = lucyAction("Heavy - Locked Thread 1", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 73.67, energy: 1.43, concerto: 3.73, offtune: 4560, forte1: 10 });
const HA2 = lucyAction("Heavy - Locked Thread 2", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 284.32, energy: 5.51, concerto: 14.32, offtune: 17602, forte1: 20.02 });

// --- Algorithm Compaction replaces the whole chain. Thread Shredding is Basic-cast but Heavy
//     Attack DMG; the mid-air and dodge counter forms stay Basic. All of it banks Root Access.
const EBA1 = lucyAction("Basic - Thread Shredding 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 77.96, energy: 1.12, concerto: 4.48, offtune: 4480, forte2: 16.2 });
const EBA2 = lucyAction("Basic - Thread Shredding 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 111.35, energy: 1.6, concerto: 6.4, offtune: 6400, forte2: 29.55 });
const EBA3 = lucyAction("Basic - Thread Shredding 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 140.6, energy: 2.05, concerto: 8.1, offtune: 8080, forte2: 37.3 });
const EBA4 = lucyAction("Basic - Thread Shredding 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 125.3, energy: 1.8, concerto: 7.2, offtune: 7200, forte2: 33.25 });
const EMA = lucyAction("Basic - Algorithm Compaction (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 125.26, energy: 2.26, concerto: 5.86, offtune: 7200, forte2: 33.22 });
const EDC = lucyAction("Basic - Algorithm Compaction (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 194.85, energy: 3.5, concerto: 21.2, offtune: 11200, forte2: 29.55 });
const EHA = lucyAction("Heavy - Single Threading", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 116.95, energy: 1.7, concerto: 6.75, offtune: 6720, forte2: 31 });
// Payload's charge, Deadlock and Multi-threading each land a Tune Hack
const HACKS = { updateDebuffs: () => applyHack() };
// each gauge's own ceiling is applied on the one cast that spends it rather than on every action
// — so that cast's own -100 lands exactly on empty, and everything before it still reports what
// the gauge really banked
const DualThreading = lucyAction("Heavy - Dual Threading", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 167.05, energy: 3, concerto: 8, offtune: 6720, forte2: -100,
  updateBuffs: () => { if (forte2() > 100) setForte2(100); },
});
/** Multi-threading, at its bare values — the SQL form is the same cast with SQL's own additions on
 *  top (see SQL below), which is how nanoka lists it. */
const MultiThreading = lucyAction("Heavy - Multi-threading", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 238.6, energy: 3, concerto: 8, offtune: 10080, ...HACKS });

// --- Protocol Breach. Payload is the charge; hitting with it automatically triggers the follow-up,
//     which is in turn what activates Pulse Interference — so the follow-up is queued off the charge
//     rather than named by a rotation. Deadlock replaces both Payload and Pulse Interference at 100
//     TCP and is Heavy Attack DMG rather than Resonance Skill DMG.
const Skill1 = lucyAction("Skill - Payload (Charge)", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 30.08, energy: 1.5, concerto: 2.4, offtune: 1512, forte1: 3.6, ...HACKS,
  updateBuffs: () => queue(Skill2), // hitting with the charge triggers the follow-up on its own
});
const Skill2 = lucyAction("Skill - Payload (Follow-Up)", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 70.17, energy: 3.5, concerto: 5.6, offtune: 3528, forte1: 8.4 });
const Skill3 = lucyAction("Skill - Pulse Interference", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 308.6, energy: 5, concerto: 8, offtune: 15520, forte1: 12,
  updateBuffs: () => applyCurrent(DIGITAL_HANDSHAKE, 1),
});
const Deadlock = lucyAction("Skill - Deadlock", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Heavy, mv: 258.47, energy: 10, concerto: 8, forte1: -100, ...HACKS,
  updateBuffs: () => {
    if (forte1() > 100) setForte1(100);
    // enters Algorithm Compaction with one SQL; casting it again inside the state grants neither
    if (!isHeld(ALGORITHM_COMPACTION)) { applyCurrent(ALGORITHM_COMPACTION, 1); applyCurrent(SQL, 1); }
  },
});

// --- Netrunner. Override is the Protocol Interface closing; Old Net Deep Dive is the same cast at
//     double the multiplier once Multi-threading has upgraded it.
// either Liberation clears TCP and fires the three damaging Spoofing Programs; ending Algorithm
// Compaction is the buff's own job, one phase later, so the Override still pays under it
const OVERRIDE = {
  updateBuffs: () => {
    setForte1(0);
    applyEnemy(CYBERWARE_MALFUNCTION, 1);
    applyEnemy(BREACH_PROTOCOL, 1);
    queue(Ping); queue(SynapseBurnout); queue(CrippleMovement);
  },
};
const Lib = lucyAction("Liberation - Netrunner: Override", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 894.65, concerto: 20, offtune: 43200, resetEnergy: true, ...OVERRIDE,
});
const ELib = lucyAction("Liberation - Old Net Deep Dive: Override", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 1789.29, concerto: 20, offtune: 86400, resetEnergy: true, ...OVERRIDE,
});
// queued off the Liberation rather than played, but active casts all the same — she fires them from
// inside her own Protocol Interface, on field, and marking them inactive would have her drop every
// "lost on switching out" buff she is holding partway through her own Liberation
const Ping = lucyAction("Liberation - Spoofing Program: Ping", { node: Node.Liberation, type: Type1.Heavy, mv: 79.53 });
const SynapseBurnout = lucyAction("Liberation - Spoofing Program: Synapse Burnout", { node: Node.Liberation, type: Type1.Heavy, mv: 79.53 });
const CrippleMovement = lucyAction("Liberation - Spoofing Program: Cripple Movement", {
  node: Node.Liberation, type: Type1.Hack, scaling: Scaling.Tune, mv: 911.83,
});

const Intro = lucyAction("Intro - Outdated Hallucination", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 138.28, energy: 10, concerto: 10, offtune: 8560,
  updateBuffs: () => applyCurrent(OUTDATED_HALLUCINATION, 1),
});
const Outro = lucyAction("Outro - Countermeasure Program", {
  cast: Cast.Outro, type: Type1.Outro, mv: 0, active: false,
  updateBuffs: () => { queueOutro(COUNTERMEASURE_HANDOFF); applyTeam(COUNTERMEASURE_MARKER, 1); },
});

/** Her answer to a Hack break — tune-scaled, so it reads Tune Break Boost and nothing else.
 *  Queued by the break rather than played, and capped in-game at one per target every 8s, which
 *  this engine has no clock to enforce. An ordinary active cast, like every Tune Break response:
 *  it is her own hit, and marking it inactive would have every "lost on switching out" buff she
 *  holds revoke itself the moment a break went off. */
const DataCrash = lucyAction("Tune Hack Response - Data Crash", {
  node: Node.Forte, type: Type1.Hack, scaling: Scaling.Tune, mv: 1367.75,
});

/* ------------------------------------------------------------------------------------- buffs */

/** Algorithm Compaction: entered by Deadlock, +65% Spectro DMG Bonus for 8s, and held until either
 *  Liberation ends it — which is the same beat, her loop spending the state in one pass. */
const ALGORITHM_COMPACTION = new Buff({
  name: "Lucy: Algorithm Compaction",
  applyStats: () => addStat(Stat.DmgBonus, 65, Attribute.Spectro),
  convertStats: () => { if (currentAction() === Outro) revokeSelf(ALGORITHM_COMPACTION); },
});

/** SQL: one stack, banked on entering Algorithm Compaction and spent by the next Multi-threading
 *  for +270% of its own DMG Multiplier — nanoka lists the SQL form as its own rows, at x3.7 the
 *  multiplier with its own energy and off-tune, so those two deltas ride here as well. Without it
 *  the cast instead costs 20% of her current HP, which is no stat. */
const SQL = new Buff({
  name: "Lucy: SQL",
  applyStats: () => {
    if (currentAction() !== MultiThreading) return;
    addStat(Stat.MulMv, 270);
    addStat(Stat.AddEnergy, 7);
    addStat(Stat.AddOfftune, 57600);
  },
  convertStats: () => { if (currentAction() === MultiThreading) revokeSelf(SQL); },
});

/** Outdated Hallucination arms it: after her Intro, the *next* Pulse Interference grants 20.6 TCP on
 *  top of the 12 the cast banks itself. Spent as it pays, so a second Pulse Interference before the
 *  next Intro gets nothing. */
const OUTDATED_HALLUCINATION = new Buff({
  name: "Lucy: Outdated Hallucination",
  applyStats: () => { if (currentAction() === Skill3) addStat(Stat.AddForte1, 20.60); },
  convertStats: () => { if (currentAction() === Skill3) revokeSelf(OUTDATED_HALLUCINATION); },
});

/** Digital Handshake: granted by Pulse Interference, and while she is on field and out of
 *  Algorithm Compaction it feeds her 1 TCP a second — a clock this engine has none of, so it hands
 *  out nothing and is here as the marker it is. With no TCP to give, neither condition that would
 *  end it (reaching 100 TCP, or either Liberation) has anything to end, so it simply stands. */
const DIGITAL_HANDSHAKE = new Buff({ name: "Lucy: Digital Handshake" });

/** Spoofing Program: Cyberware Malfunction — marked targets take 5% more DMG for 30s, so permanent
 *  uptime. There is no target-side "damage taken" stat here (EnemyStat is res and def only), so it
 *  lands as Total Damage from the target itself: enemy-pool gear runs through whoever is acting, so
 *  every attacker reads the identical 5%. */
const CYBERWARE_MALFUNCTION = new Debuff({
  name: "Spoofing Program: Cyberware Malfunction",
  applyStats: () => addStat(Stat.TotalDmg, 5),
});

/** Spoofing Program: Breach Protocol — marked targets' DEF reduced 5% for 30s, permanent uptime. */
const BREACH_PROTOCOL = new Debuff({
  name: "Spoofing Program: Breach Protocol",
  applyStats: () => addEnemyStat(EnemyStat.DefReduce, 5),
});

/** Countermeasure Program (Outro), the handoff half: the incoming resonator gets +25% Basic Attack
 *  DMG Amplification for 14s or until they switch out. */
const COUNTERMEASURE_HANDOFF = new Buff({
  name: "Lucy: Outro",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(Stat.Amp, 25, Type1.Basic),
});

/** The team half: a 25s marker on everyone, during which an active resonator *other than Lucy*
 *  inflicting Hack - Shifting gains +20% All DMG Amplification until they switch out. Team-wide so
 *  that it ticks on every member's own turn and can pay out onto whoever is actually acting; the
 *  DMG-reduction and Stagnate halves are defensive and carry no stat. */
const COUNTERMEASURE_MARKER = new Buff({
  name: "Lucy: Countermeasure Program",
  updateBuffs: () => { 
    if (applied(TUNE_HACK_SHIFTING) && !isHeld(LUCY)) {
      applyCurrent(COUNTERMEASURE_AMP, 1); 
      // revokeTeam, not revoke: the marker was handed out with applyTeam, so it lives in the
      // team-wide pool and a local revoke would silently do nothing
      revokeTeam(COUNTERMEASURE_MARKER);
    }
  },
});
const COUNTERMEASURE_AMP = new Buff({
  name: "Lucy: Countermeasure Program",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(Stat.Amp, 20),
});

/* --------------------------------------------------------------------------- kit and loadout */

/** Ghost Cyberware (Inherent Skill): Optical Illusion negates one instance of damage taken. Purely
 *  defensive, so it holds no stat. */
const LC_INHERENT_1 = new Inherent({ name: "Lucy: Ghost Cyberware" });

/** Function Cracking (Inherent Skill): Network Backdoor is banked off the team *defeating* a
 *  Botnet-marked Overlord/Calamity target, which a single-target rotation never does — nothing here
 *  can ever fire, and the piece is present for the kit's shape. */
const LC_INHERENT_2 = new Inherent({ name: "Lucy: Function Cracking" });

const LUCY_TALENTS = new Talent({
  name: "Lucy: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8); },
});

export const LUCY = new Resonator({
  name: "Lucy",
  element: Attribute.Spectro,
  weapon: WeaponType.Pistols,
  intro: () => Intro,
  outro: () => Outro,
  color: "#efe8de",
  maxEnergy: 125,

  updateGlobal: () => tuneHackResponse(DataCrash),

  constantStats: () => {
    addStat(Stat.BaseHp, 11025); addStat(Stat.BaseAtk, 425); addStat(Stat.BaseDef, 1148.89);
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    addStat(Stat.Tbb, 10);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

/** Intro straight into Basics 2-4 (the Intro's own follow-up is Stage 2), then Payload — whose
 *  follow-up triggers itself — and Pulse Interference, which cashes the 20 TCP the Intro armed onto
 *  it and lands the bar on exactly 100. Deadlock spends that for Algorithm Compaction and an SQL;
 *  Thread Shredding 2-4 bank 100.1 Root Access, Dual Threading spends it, Multi-threading cashes
 *  the SQL and upgrades the Liberation, and Old Net Deep Dive closes the state and drops the
 *  Spoofing Programs. Echo, then out. She is always the team's main DPS, so this covers opener and
 *  loop. */

const LC_ROTATION = new Rotation([
  START_COMBAT, Lib, START_COMBAT,
  INTRO, BA2, BA3, BA4, Skill1, Skill3,
  Deadlock, EBA2, EBA3, EBA4,
  DualThreading, MultiThreading, ECHO_CAST,
  ELib, OUTRO_NEXT,
]);

/** Adam Smasher carries its own 1pc set, so the other four echoes run two ordinary 2-piece sets
 *  instead of a 5pc — ATK and Spectro. */
const LC_ECHOES = [
  new EchoLoadout(ADAM_SMASHER_LUCY, NEONLIGHT_LEAP_2PC, CELESTIAL_LIGHT_2PC),
  new EchoLoadout(ADAM_SMASHER_LUCY, LINGERING_TUNES_2PC, CELESTIAL_LIGHT_2PC),
  new EchoLoadout(ADAM_SMASHER_LUCY, LINGERING_TUNES_2PC, REEL_2PC),
];

export const LUCY_LOADOUT = new Loadout({
  resonator: LUCY,
  talent: LUCY_TALENTS,
  inherent1: LC_INHERENT_1,
  inherent2: LC_INHERENT_2,
  weapons: [SPECTRAL_TRIGGER, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: LC_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: chem("atk", "heavy"),
    rotation: LC_ROTATION,
});
