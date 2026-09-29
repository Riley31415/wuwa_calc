/**
 * Rebecca — an Electro Pistols sub-DPS, and the first half of the Cyberpunk collab pair. Filed
 * under Lahairoi with Lucy and their shared echo, the era they released alongside, rather than
 * a region of their own.
 *
 * She is the first kit in the project built on the *Hack* branch of the Tune Break variants (see
 * tunebreak.ts), and she works both ends of it: her Intros, either Fervor finisher and BOOM!
 * Fireworks! all lay Hack - Shifting, and she answers Hack - Interfered with Meltdown, a
 * 2358.89% tune-scaled hit. Tune damage reads Tune Break Boost and nothing else, which is why her
 * own Tag, You're It! hands +30 of it to whoever laid the Shifting.
 *
 * Three gauges, all real numbers off the actions:
 * - **Fervor** (forte1, 0-120): banked by every Normal Attack and Resonance Skill, and by 50 the
 *   moment A Girl Gets What She Wants! triggers off an Intro. At 120 the plain Heavy Attack is
 *   replaced by its finisher — Rat-tat-tat!: Huntress or Bang-bang-bang!: Guts by mode — which
 *   spends the whole bar.
 * - **Hot Hand** (forte2, 0-120): regenerates 10/s, which this engine has no clock for; she is off
 *   field for well over the 12s it takes to fill, so it is simply full at every Intro (set at
 *   combat start and again on her own Outro) and the finisher's own +40 is declared on the action.
 *
 * Overload is not tracked: it only ever gates BOOM! Fireworks!, which the mode fires by itself
 * either way. It caps late enough that the detonation lands after she has already swapped out, so
 * BOOM! is deferred behind the next resonator's Intro and is inactive — her hit, not her field time.
 *
 * **Switch Gears!** is the mode pair: Huntress (+30% Crit. DMG) and Guts (15% DEF ignore), swapped
 * by every Resonance Skill and Intro Skill — each of which exists in a Huntress form and a Guts
 * form, so which she casts *is* which mode she is in. She starts in Huntress. A Girl Gets What She
 * Wants! grants whichever of the two she is not currently in, for 12s.
 *
 * MVs off nanoka.cc (character 1308), per-hit x hit count as CLAUDE.md describes, with the flat
 * Concerto Regen rows folded in (Liberation 20, both Intros 10). Energy/concerto/off-tune and the
 * per-action Fervor are wuwalab's frame data (api.wuwalab.com/api/app/characters/rebecca) summed
 * the same way, cross-checked against the migrated sheet. The Mk. 31 HMG has no published fire
 * rate; the sheet's own 5 standard / 5 first-enhancement / 10 second-enhancement split is what
 * reaches 90 Overload exactly, so that is how the mode is lumped here. Her dodge counters are left
 * out: nanoka gives their motion values but no source gives their Fervor, and neither rotation
 * plays one.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, coordinatedBuff } from "../../engine/gear.js";
import {
  addBuff,
  addStat,
  applyCurrent,
  applyTeam,
  basicDmgBonus,
  casting,
  currentAction, pressed,
  onAction,
  runningAction,
  currentTeam,
  isHeld,
  queue,
  queueOnIntro,
  queueOutro,
  revokeCurrent,
  forte1,
  forte2,
  setForte2,
  isActive,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, ECHO, ActionField, FIRST_INTRO, ActionTag, INTRO } from "../../engine/rotation.js";
import { applied, inflicting } from "../../engine/context.js";
import { applyHack, tuneHackResponse, TUNE_HACK_SHIFTING } from "../../shared/tunebreak.js";
import { SKULL_THRASHER } from "../../weapons/pistol.js";
import { NEW_STD_PISTOL, STATIC_MIST } from "../../weapons/standard.js";
import { HERON, STONEWALL_BRACER, MOONLIT_CLOUDS_5PC, LINGERING_TUNES_2PC, VOID_THUNDER_2PC, MOONLIT_CLOUDS_2PC } from "../../echoes/jinzhou.js";
import { ADAM_SMASHER_REBECCA, SHATTERED_DREAMS_1PC, HYVATIA, NEONLIGHT_LEAP_5PC, REEL_2PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { LUCY_RESONATOR } from "../spectro/lucy.js";
import { SWORN_VIGIL_2PC } from "../../echoes/mengzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function rebeccaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- Mix-'n'-Match, the Huntress half. Heavy Attack - Huntress is the held burst, which counts as
//     Basic Attack DMG; releasing it turns into Eat Lead!, which does not.
const HBA1 = rebeccaAction("Basic - Huntress 1", { animFrames: 26, commitFrames: 22, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 8, mv: 36.76, energy: 0.55, concerto: 1.09, offtune: 1740, forte1: 3.53 },
    { at: 22, mv: 36.76, energy: 0.55, concerto: 1.09, offtune: 1740, forte1: 3.53 },
  ]});
const HBA2 = rebeccaAction("Basic - Huntress 2", { animFrames: 40, commitFrames: 30, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 12, mv: 19.13, energy: 0.29, concerto: 0.57, offtune: 906, forte1: 1.84 },
    { at: 13, mv: 19.13, energy: 0.29, concerto: 0.57, offtune: 906, forte1: 1.84 },
    { at: 14, mv: 19.13, energy: 0.29, concerto: 0.57, offtune: 906, forte1: 1.84 },
    { at: 16, mv: 19.13, energy: 0.29, concerto: 0.57, offtune: 906, forte1: 1.84 },
    { at: 30, mv: 19.13, energy: 0.29, concerto: 0.57, offtune: 906, forte1: 1.84 },
  ]});
const HBA3 = rebeccaAction("Basic - Huntress 3", { animFrames: 42, commitFrames: 18, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 18, mv: 109.85, energy: 1.63, concerto: 3.25, offtune: 5200, forte1: 10.54 }]});
const HHA = rebeccaAction("Heavy - Huntress", { animFrames: 32, commitFrames: 32, node: Node.Normal, cast: Cast.Heavy, type: Type.Basic, hits: [
    { at: 26, mv: 16.9, energy: 0.25, concerto: 0.5, offtune: 800, forte1: 1.79 },
    { at: 32, mv: 16.9, energy: 0.25, concerto: 0.5, offtune: 800, forte1: 1.79 },
  ]});
const EatLead = rebeccaAction("Heavy - Eat Lead!: Huntress", { animFrames: 36, commitFrames: 13, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 0, mv: 60.84, energy: 0.9, concerto: 1.8, offtune: 2880, forte1: 5.84 },
    { at: 13, mv: 60.84, energy: 0.9, concerto: 1.8, offtune: 2880, forte1: 5.84 },
  ]});
const HMA = rebeccaAction("Mid-air - Huntress Plunge", { animFrames: 43, commitFrames: 34, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 34, mv: 136.04, energy: 2.02, concerto: 4.03, offtune: 6440, forte1: 13.05 }]});
const HTD = rebeccaAction("Basic - Tactical Dodge: Huntress", { animFrames: 36, commitFrames: 30, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 6, mv: 16.9, energy: 0.25, concerto: 0.5, offtune: 800, forte1: 1.79 },
    { at: 10, mv: 16.9, energy: 0.25, concerto: 0.5, offtune: 800, forte1: 1.79 },
    { at: 16, mv: 16.9, energy: 0.25, concerto: 0.5, offtune: 800, forte1: 1.79 },
    { at: 20, mv: 16.9, energy: 0.25, concerto: 0.5, offtune: 800, forte1: 1.79 },
    { at: 30, mv: 16.9, energy: 0.25, concerto: 0.5, offtune: 800, forte1: 1.79 },
  ]});
// the somersault: no damage row of its own on nanoka and no gauges anywhere, and the one thing it
// grants — the Heavy Attack - Huntress held out of it costing no STA — is stamina, which is unmodelled
const CominInHot = rebeccaAction("Basic - Comin' in Hot!: Huntress", { node: Node.Normal, cast: Cast.Basic });

// --- the Guts half: fewer, heavier shots, and its Heavy Attack is a real Heavy.
// custom frames for first hit
const GBA1 = rebeccaAction("Basic - Guts 1", { animFrames: 56, commitFrames: 31, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 14, mv: 61.69, energy: 0.92, concerto: 1.83, offtune: 2920, forte1: 6.81 },
    { at: 31, mv: 61.69, energy: 0.92, concerto: 1.83, offtune: 2920, forte1: 6.81 },
  ]});
const GBA2 = rebeccaAction("Basic - Guts 2", { animFrames: 33, commitFrames: 11, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 11, mv: 84.5, energy: 1.25, concerto: 2.5, offtune: 4000, forte1: 9.32 }]});
const GBA3 = rebeccaAction("Basic - Guts 3", { animFrames: 85, commitFrames: 58, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 13, mv: 33.77, energy: 0.5, concerto: 1, offtune: 1599, forte1: 3.73 },
    { at: 23, mv: 33.77, energy: 0.5, concerto: 1, offtune: 1599, forte1: 3.73 },
    { at: 58, mv: 157.57, energy: 2.34, concerto: 4.67, offtune: 7460, forte1: 17.38 },
  ]});
const GHA = rebeccaAction("Heavy - Guts", { animFrames: 68, commitFrames: 50, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [{ at: 50, mv: 202.79, energy: 3, concerto: 6, offtune: 9600, forte1: 19.45 }]});
const GMA = rebeccaAction("Mid-air - Guts Plunge", { animFrames: 57, commitFrames: 34, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 34, mv: 104.78, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 10.05 }]});
const GTD = rebeccaAction("Basic - Tactical Dodge: Guts", { animFrames: 40, commitFrames: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 6, mv: 101.4, energy: 1.5, concerto: 3, offtune: 4800, forte1: 9.73 }]});

/** The ground presses each Tactical Dodge can be cast out of (`ResonatorDef.dodge`). */
const HUNTRESS_DODGES = new Set<Action>([HBA1, HBA2, HBA3, HHA, EatLead, CominInHot, HTD]);
const GUTS_DODGES = new Set<Action>([GBA1, GBA2, GBA3, GTD]);

// --- Tactical Tweaks: one Resonance Skill per mode, each ending in the other one.
// the mode swap lands in convertStats(), after the cast that made it has already paid out under
// the old mode
// on cast (`updateBuffs`): the form she is in by the time a dash cutting the cast is made
const TO_GUTS = { updateBuffs: () => { revokeCurrent(HUNTRESS); applyCurrent(GUTS, 1); } };
const TO_HUNTRESS = { updateBuffs: () => { revokeCurrent(GUTS); applyCurrent(HUNTRESS, 1); } };
/** Both skill forms share one 1s cooldown. */
const SKILL_CD = new Cooldown({ frames: 60 });
const Skill = rebeccaAction("Skill - It's Big Boomin' Time!", { animFrames: 87, commitFrames: 60, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 30, mv: 23.66, energy: 0.35, concerto: 0.7, offtune: 1120, forte1: 2.27 },
    { at: 32, mv: 23.66, energy: 0.35, concerto: 0.7, offtune: 1120, forte1: 2.27 },
    { at: 34, mv: 23.66, energy: 0.35, concerto: 0.7, offtune: 1120, forte1: 2.27 },
    { at: 36, mv: 23.66, energy: 0.35, concerto: 0.7, offtune: 1120, forte1: 2.27 },
    { at: 38, mv: 35.49, energy: 0.53, concerto: 1.05, offtune: 1680, forte1: 3.41 },
    { at: 40, mv: 35.49, energy: 0.53, concerto: 1.05, offtune: 1680, forte1: 3.41 },
    { at: 42, mv: 35.49, energy: 0.53, concerto: 1.05, offtune: 1680, forte1: 3.41 },
    { at: 60, mv: 35.49, energy: 0.53, concerto: 1.05, offtune: 1680, forte1: 3.41 },
  ], ...TO_GUTS });
const ESkill = rebeccaAction("Skill - Come 'n' Get Me!", { animFrames: 110, commitFrames: 70, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 12, mv: 23.66, energy: 0.35, concerto: 0.7, offtune: 1120, forte1: 2.27 },
    { at: 36, mv: 4.74, energy: 0.07, concerto: 0.14, offtune: 224, forte1: 0.46 },
    { at: 62, mv: 23.66, energy: 0.35, concerto: 0.7, offtune: 1120, forte1: 2.27 },
    { at: 64, mv: 23.66, energy: 0.35, concerto: 0.7, offtune: 1120, forte1: 2.27 },
    { at: 66, mv: 137.22, energy: 2.03, concerto: 4.06, offtune: 6496, forte1: 13.17 },
    { at: 68, mv: 11.83, energy: 0.18, concerto: 0.35, offtune: 560, forte1: 1.14 },
    { at: 70, mv: 11.83, energy: 0.18, concerto: 0.35, offtune: 560, forte1: 1.14 },
  ], ...TO_HUNTRESS });

// --- Gloves Are Comin' Off!: the Fervor finishers. Both count as Basic Attack DMG, both spend the
//     whole 120 and restore 40 Hot Hand, and both lay Hack - Shifting.
// Fervor's own ceiling, applied on the two casts that spend it rather than on every action — so
// that cast's own delta lands exactly on empty, and everything before it still reports what the
// gauge really banked. Both hack, too.
const SPEND_FERVOR = { updateDebuffs: () => applyHack() };
const FHAHunt = rebeccaAction("Forte Heavy - Rat-tat-tat!: Huntress", { animFrames: 110, commitFrames: 84, node: Node.Forte, cast: Cast.Heavy, type: Type.Basic, hits: [
    { at: 12, mv: 19.89, energy: 0.75, concerto: 1, offtune: 2216 },
    { at: 46, mv: 19.89, energy: 0.75, concerto: 1, offtune: 2216 },
    { at: 50, mv: 19.89, energy: 0.75, concerto: 1, offtune: 2216 },
    { at: 56, mv: 19.89, energy: 0.75, concerto: 1, offtune: 2216 },
    { at: 84, mv: 318.1, energy: 12, concerto: 16, offtune: 35456, forte2: 40 },
  ], castForte1: -120, ...SPEND_FERVOR });
const FHAGuts = rebeccaAction("Forte Heavy - Bang-bang-bang!: Guts", { animFrames: 90, commitFrames: 64, node: Node.Forte, cast: Cast.Heavy, type: Type.Basic, hits: [{ at: 64, mv: 278.34, energy: 15, concerto: 20, offtune: 44320, forte2: 40 }], castForte1: -120, ...SPEND_FERVOR });

// --- Party 'til Dawn!: the Liberation opens Mk. 31 HMG mode, which fires itself for 9.5s and
//     banks Overload as it goes. The three tiers are lumped one action apiece (see the file
//     comment); the button press itself deals no damage, so its cost and its 20 Concerto Regen
//     ride the first burst. Every hit of the mode is Basic Attack DMG.
// Party 'til Dawn! is only the button press; the mode then fires itself through its three
// firepower tiers, and BOOM! Fireworks! goes off once Overload caps — late enough that it lands
// on the next resonator's time, so it is deferred behind their Intro (still on Rebecca's slot)
const Lib1 = rebeccaAction("Liberation - Party 'til Dawn!", {
  animFrames: 180, commitFrames: 180, timestop: 180, motionStop: 180, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, resetEnergy: true,
});
const Lib2 = rebeccaAction("Liberation - Mk. 31 HMG x5", {
  animFrames: 0, 
  node: Node.Liberation, type: Type.Basic, cast: Cast.Liberation, hits: [{ at: 0, mv: 121.5, concerto: 22.8, offtune: 8045 }], 
});
const Lib3 = rebeccaAction("Liberation - Mk. 31 HMG 1st Enhancement x5", {
  animFrames: 0,
  node: Node.Liberation, type: Type.Basic, cast: Cast.Liberation, hits: [{ at: 0, mv: 243, concerto: 5.6, offtune: 16090 }], 
});
const Lib4 = rebeccaAction("Liberation - Mk. 31 HMG 2nd Enhancement x10", {
  animFrames: 0, 
  node: Node.Liberation, type: Type.Basic, cast: Cast.Liberation, hits: [{ at: 0, mv: 729, concerto: 16.7, offtune: 48260 }], 
});
const Lib234 = new ActionGroup("Liberation - Mk. 31 HMG", [Lib2, Lib3, Lib4]);
// fires behind whoever intros after her, so it is inactive: it is her hit, not her field time
const Boom = rebeccaAction("Liberation - BOOM! Fireworks!", { tag: ActionTag.Field,
  animFrames: 133,
  commitFrames: 133,
  node: Node.Liberation, type: Type.Basic, cast: Cast.Liberation, hits: [
    { at: 66, mv: 63.62, energy: 2, concerto: 1, offtune: 3103 },
    { at: 79, mv: 572.58, energy: 18, concerto: 9, offtune: 27922 },
  ],
  updateDebuffs: () => applyHack(),
});

// --- My Turn!: one Intro per mode, each ending in the other one, each worth 50 Fervor through A
//     Girl Gets What She Wants! (see A_GIRL) rather than on the action itself.
const Intro = rebeccaAction("Intro - Yo, It's Big Boomin' Time!", { animFrames: 96, commitFrames: 96, motionStop: 90, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 44, mv: 27.04, energy: 1, offtune: 1280 },
    { at: 46, mv: 27.04, energy: 1, offtune: 1280 },
    { at: 48, mv: 27.04, energy: 1, offtune: 1280 },
    { at: 50, mv: 27.04, energy: 1, offtune: 1280 },
    { at: 52, mv: 27.04, energy: 1, offtune: 1280 },
    { at: 54, mv: 27.04, energy: 1, offtune: 1280 },
    { at: 56, mv: 40.56, energy: 1.5, offtune: 1920 },
    { at: 72, mv: 67.6, energy: 2.5, offtune: 3200 },
  ], castConcerto: 10, updateDebuffs: () => applyHack(), ...TO_GUTS });
const EIntro = rebeccaAction("Intro - Hey, Leadhead, Come 'n' Get Me!", { animFrames: 89, commitFrames: 69, motionStop: 58, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 29, mv: 10.14, energy: 0.5, offtune: 480 },
    { at: 53, mv: 30.42, energy: 1.5, offtune: 1440 },
    { at: 54, mv: 40.56, energy: 2, offtune: 1920 },
    { at: 55, mv: 40.56, energy: 2, offtune: 1920 },
    { at: 57, mv: 40.56, energy: 2, offtune: 1920 },
    { at: 59, mv: 40.56, energy: 2, offtune: 1920 },
  ], castConcerto: 10, updateDebuffs: () => applyHack(), ...TO_HUNTRESS });

/** Preem Choom (Outro): the turret is the pair of windows below — the outro row itself deals
 *  nothing any more. Handing to Lucy, she enhances it: +250% DMG Multiplier at 4s on field
 *  instead of 14 — a different window with its own boosted tick, the same 175% total either way
 *  (14 x 12.5, or 4 x 12.5 x 3.5). */
// her Outro hands the Bonds over; the 12s+ she then spends off field refills Fervor, which is what
// arms A Girl Gets What She Wants! on her next Intro
const Outro = rebeccaAction("Outro - Preem Choom", {
  animFrames: 0,
  cast: Cast.Outro, type: Type.Outro, castConcerto: -100,
  updateBuffs: () => {
    // whoever this outro hands the field to is who decides which turret stands — Lucy enhances it
    const st = currentTeam();
    const next = st.slots[(st.active + st.outroDir + st.slots.length) % st.slots.length]!;
    if (next.resonator?.name === "Lucy") applyTeam(REBECCA_TURRET_LUCY, 4);
    else applyTeam(REBECCA_TURRET, 14);
    queueOutro(EDGERUNNER_BONDS);
    addStat(Stat.AddForte2, 120); // from 12 seconds offfield
  },
});
/** One turret shot at 2.5% — five of them per action-second of the turret's fire, each its own
 *  row so the field grouping counts them — and the Lucy-enhanced shot beside it, the same
 *  shot at +250% DMG Multiplier. */
const TURRET_FIELD = new ActionField("Rebecca: Outro Turret");
const TurretTick = rebeccaAction("Outro - Preem Choom: Turret", { type: Type.Outro, mv: 2.5, field: TURRET_FIELD });
const TurretTickLucy = TurretTick.variant("Outro - Preem Choom: Turret (Enhanced)", {
  applyStats: () => addStat(Stat.MulMv, 250),
});
/** The turret itself: a team-held window of its seconds, firing a volley each of them — hers or
 *  anyone's turn, and never ended by a swap. */
const REBECCA_TURRET = coordinatedBuff("Rebecca: Outro Turret", 14, () => REBECCA_RESONATOR, TurretTick, { hits: 5 });
const REBECCA_TURRET_LUCY = coordinatedBuff("Rebecca: Outro Turret (Lucy)", 4, () => REBECCA_RESONATOR, TurretTickLucy, { hits: 5 });

/** Her answer to a Hack break — tune-scaled, so it reads Tune Break Boost and nothing else.
 *  Queued by the break rather than played, and capped in-game at one per target every 8s, which
 *  this engine has no clock to enforce. An ordinary active cast, like every Tune Break response:
 *  it is her own hit, and marking it inactive would have every "lost on switching out" buff she
 *  holds revoke itself the moment a break went off. */
const Meltdown = rebeccaAction("Tune Hack Response - Meltdown", {
  animFrames: 0,
  node: Node.Forte, type: Type.Hack, scaling: Scaling.Tune, hits: [{ at: 0, mv: 2358.89 }],
});

/* ------------------------------------------------------------------------------------- buffs */

/** Switch Gears!: the two modes. Which one she holds decides which Intro and which Resonance
 *  Skill she casts, and every one of those casts swaps her into the other — done in convertStats()
 *  so the cast itself still pays out under the mode she started it in. */
const HUNTRESS = new Buff({ name: "Rebecca: Huntress", stats: [[Stat.CritDmg, 30]] });
const GUTS = new Buff({ name: "Rebecca: Guts", stats: [[Stat.DefIgnoreNew, 15]] });

/** A Girl Gets What She Wants!: at 120 Hot Hand, a Resonance Skill or Intro Skill grants both
 *  modes' stat bonuses at once for 12s — so it pays whichever of the two she is not already in.
 *  Hot Hand cannot be restored while it is up, so a finisher's own +40 is cancelled back out. The
 *  Intro that triggers it also restores 50 Fervor. 12s. */
const A_GIRL = new Buff({
  name: "Rebecca: A Girl Gets What She Wants!",
  duration: 60 * 12,
  applyStats: () => {
    if (forte2() >= 120 && (casting(Cast.Skill) || casting(Cast.Intro))) {
      addStat(Stat.AddCastForte2, -120); // consume 10 per sec for 12s
      // the Fervor rides on the trigger itself, not on any Intro cast while the window is up
      if (casting(Cast.Intro)) addStat(Stat.AddCastForte1, 50);
    }
    // both modes' bonuses at once — and at S4 each at 160% of itself, so the mode she is already
    // in gains the other 60% on top of its own
    const k = isHeld(RB_S4) ? 1.6 : 1;
    if (!isHeld(HUNTRESS)) addStat(Stat.CritDmg, 30 * k);
    else if (k > 1) addStat(Stat.CritDmg, 30 * (k - 1));
    if (!isHeld(GUTS)) addStat(Stat.DefIgnoreNew, 15 * k);
    else if (k > 1) addStat(Stat.DefIgnoreNew, 15 * (k - 1));
    const a = pressed();
    if (a.forte2 > a.castForte[1]!) addStat(Stat.AddCastForte2, -(a.forte2 - a.castForte[1]!));
  },
});

/** Tag, You're It! (Inherent Skill), the ATK half: +10% for 12s on triggering A Girl Gets What She
 *  Wants! or casting either Fervor finisher, 2 stacks. */
const TAG_YOURE_IT = new Buff({
  name: "Inherent: Tag, You're It!", maxStacks: 2, duration: 60 * 12,
  stats: [[Stat.BonusAtk, 10]], perStack: true,
});

/** The other half: whichever resonator inflicts Hack - Shifting gets +30 Tune Break Boost for 30s
 *  — permanent uptime, and theirs alone rather than the team's (see RB_INHERENT_1 for the watch). */
const TAG_TBB = new Buff({
  name: "Inherent: Tag, You're It! (team)",
  duration: 60 * 30,
  stats: [[Stat.Tbb, 30]],
});

/** Left an Opening! (Inherent Skill): her Liberation gives every nearby resonator +20% ATK for
 *  30s — permanent uptime, and "nearby" rather than "active", so it pays on inactive actions too.
 *  The interruption-resistance half carries no stat. */
const LEFT_AN_OPENING = new Buff({
  name: "Inherent: Left an Opening!",
  duration: 60 * 30,
  stats: [[Stat.BonusAtk, 20]],
});

/** Preem Choom (Outro): the incoming resonator gets Edgerunner Bonds, +15% All DMG Amplification
 *  for 14s, and with it Overlimit — a stack every 0.2s, each +0.5% Heavy Attack DMG Amplification
 *  up to +35%. Lucy is handed the cap the instant the Bonds land; anyone else ramps to it on the
 *  Bonds' own clock across the full 14s. Both end early on switching out. */
const EDGERUNNER_BONDS = new Buff({
  name: "Rebecca: Outro - Edgerunner Bonds",
  duration: 60 * 14,
  stats: [[Stat.Amp, 15]],
  updateBuffs: () => { if (isHeld(LUCY_RESONATOR)) applyCurrent(OVERLIMIT, 70); },
  tick: { every: 12, fire: () => applyCurrent(OVERLIMIT, 1) },
  lostOnSwap: true,
});

const OVERLIMIT = new Buff({
  name: "Rebecca: Outro - Overlimit", maxStacks: 70,
  lostOnSwap: true,
  stats: [[Stat.Amp, 0.5, Type.Heavy]], perStack: true,
});

/* --------------------------------------------------------------------------- resonance chain */

/** S1: +50% multiplier on the plain shots of both modes — the three-stage Basics, Heavy Attack -
 *  Huntress (the held burst, not Eat Lead!) and both Tactical Dodges. The Street Smarts stamina
 *  refund and the Liberation's interruption immunity carry no number here. */
const RB_S1 = new Sequence({
  name: "Rebecca S1: Try Not to Get in the Way!",
  applyStats: () => {
    if (runningAction(HBA1) || runningAction(HBA2) || runningAction(HBA3) || runningAction(HHA) || runningAction(HTD) || runningAction(GBA1) || runningAction(GBA2) || runningAction(GBA3) || runningAction(GTD)) addStat(Stat.MulMv, 50);
  },
});

/** S2: either Intro or the Liberation press gives the team +20% All-Attribute DMG Bonus for 30s —
 *  permanent, and "all Resonators in the team" so it pays off field too. And whoever inflicts
 *  Hack - Shifting gets +15% All DMG Amplification for 30s, theirs alone — watched from her own
 *  node the way Tag, You're It! watches for the Tune Break Boost. */
const OH_HEY_CHOOM_TEAM = new Buff({
  name: "Rebecca S2: Oh, Hey Choom! (intro/lib)",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 20]],
});
const OH_HEY_CHOOM_HACK = new Buff({
  name: "Rebecca S2: Oh, Hey Choom! (hack)",
  duration: 60 * 30,
  stats: [[Stat.Amp, 15]],
});
const RB_S2 = new Sequence({
  name: "Rebecca S2: Oh, Hey Choom!",
  hitGlobal: () => {
    const acting = currentTeam().slot.resonator;
    if (acting && applied(TUNE_HACK_SHIFTING)) addBuff(acting, OH_HEY_CHOOM_HACK, 1);
  },
  updateBuffs: () => { if (runningAction(Intro) || runningAction(EIntro) || runningAction(Lib1)) applyTeam(OH_HEY_CHOOM_TEAM, 1); },
});

/** S3: +60% multiplier on everything Party 'til Dawn! fires — the Mk. 31 HMG tiers and BOOM!
 *  Fireworks! — and 120 Hot Hand on either Intro. Hot Hand cannot be restored while A Girl Gets
 *  What She Wants! is up, and the Intro is what triggers it, so the grant only lands on an Intro
 *  that didn't (never, off a full bar). The explosion range carries no number. */
const RB_S3 = new Sequence({
  name: "Rebecca S3: Don't Sweat Your Six!",
  applyStats: () => {
    if (runningAction(Lib2) || runningAction(Lib3) || runningAction(Lib4) || runningAction(Boom)) addStat(Stat.MulMv, 60);
    if (casting(Cast.Intro) && !isHeld(A_GIRL)) addStat(Stat.AddCastForte2, 120);
  },
});

/** S4: A Girl Gets What She Wants! grants 60% more — read by the buff itself (see A_GIRL). */
const RB_S4 = new Sequence({ name: "Rebecca S4: Got Ya Covered!" });

/** S5: +20% Basic Attack DMG Bonus for 8s on inflicting Hack - Shifting — off her own active
 *  casts (an Intro or a Fervor finisher; BOOM! lands after she has left), refreshed by each and
 * . */
const DREAMIN_ON_THE_EDGE = new Buff({
  name: "Rebecca S5: Dreamin' on the Edge",
  duration: 60 * 8,
  stats: [[Stat.DmgBonus, 20, Type.Basic]],
});
const RB_S5 = new Sequence({
  name: "Rebecca S5: Dreamin' on the Edge",
  grants: [{ on: inflicting(() => isActive() && applied(TUNE_HACK_SHIFTING) > 0), buff: DREAMIN_ON_THE_EDGE }],
});

/** S6: her Basic Attack DMG Bonus from every source is 40% higher — a conversion off the
 *  Basic-scoped bonus the action already counted (`basicDmgBonus()`), taken late so every other
 *  conversion has landed first. Either Fervor finisher also deals one more 900% ATK hit, Basic
 *  Attack DMG, queued behind it, and restores 20 more Hot Hand (blocked, like the finisher's own
 *  40, while A Girl Gets What She Wants! is up). The revive and out-of-combat Fervor carry nothing. */
const S6Hunt = rebeccaAction("Forte Heavy - Rat-tat-tat!: Huntress (S6 Strike)", { node: Node.Forte, type: Type.Basic, mv: 900 });
const S6Guts = rebeccaAction("Forte Heavy - Bang-bang-bang!: Guts (S6 Strike)", { node: Node.Forte, type: Type.Basic, mv: 900 });
const RB_S6 = new Sequence({
  name: "Rebecca S6: Maybe, Just Maybe...",
  applyStats: () => {
    if ((runningAction(FHAHunt) || runningAction(FHAGuts)) && !isHeld(A_GIRL)) addStat(Stat.AddForte2, 20);
  },
  lateConvertStats: () => { addStat(Stat.DmgBonus, 0.4 * basicDmgBonus(), Type.Basic); },
  updateBuffs: () => {
    if (runningAction(FHAHunt)) queue(S6Hunt);
    if (runningAction(FHAGuts)) queue(S6Guts);
  },
});

/* --------------------------------------------------------------------------- kit and loadout */

const RB_INHERENT_1 = new Inherent({
  name: "Inherent: Tag, You're It!",
  // Watched from her own inherent rather than through a team-wide marker: the Tune Break Boost is
  // the *inflicter's*, so it has to land on whoever is actually acting — and hitGlobal's own
  // currentSlot is Rebecca (this gear's holder), not them, so it goes through the acting slot's
  // resonator instead of applySelf.
  hitGlobal: () => {
    const acting = currentTeam().slot.resonator;
    if (acting && applied(TUNE_HACK_SHIFTING)) addBuff(acting, TAG_TBB, 1);
  },
  updateBuffs: () => {
    if (applied(A_GIRL) || runningAction(FHAHunt) || runningAction(FHAGuts)) applyCurrent(TAG_YOURE_IT, 1);
  },
});

const RB_INHERENT_2 = new Inherent({
  name: "Inherent: Left an Opening!",
  grants: [{ on: onAction(Lib1), buff: LEFT_AN_OPENING, to: BuffTarget.Team }],
});

const REBECCA_TALENTS = new Talent({
  name: "Rebecca: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

const REBECCA_RESONATOR = new Resonator({
  name: "Rebecca",
  talent: REBECCA_TALENTS,
  inherent1: RB_INHERENT_1,
  inherent2: RB_INHERENT_2,
  element: Attribute.Electro,
  weapon: WeaponType.Pistols,
  // whichever mode she is in decides which Intro she has; her loop always ends in Huntress
  color: "#abebda",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  intro: new Action("Intro Resolver", { cast: Cast.Intro, resolve: () => (isHeld(GUTS) ? EIntro : Intro) }),
  // her Tactical Dodges, each off its own mode's ground presses; a Skill or Intro dodges in whichever
  // mode it switched her into
  dodge: (after) => {
    if (after.cast === Cast.Skill || after.cast === Cast.Intro) return isHeld(GUTS) ? GTD : HTD;
    return HUNTRESS_DODGES.has(after) ? HTD : GUTS_DODGES.has(after) ? GTD : null;
  },
  maxEnergy: 125,
  maxForte1: 120,
  maxForte2: 120,

  // she starts in Huntress with a full Hot Hand bar
  combatStart: () => { applyCurrent(HUNTRESS, 1); setForte2(120); },

  hitGlobal: () => tuneHackResponse(Meltdown),

  // at a full Hot Hand bar, a Resonance Skill or Intro Skill trades it for the 12s window
  updateBuffs: () => {
    if (forte2() >= 120 && (casting(Cast.Skill) || casting(Cast.Intro))) {
      applyCurrent(A_GIRL, 1);
    }
  },

  stats: [
    [Stat.BaseHp, 11600], [Stat.BaseAtk, 400], [Stat.BaseDef, 1173.3312],
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    [Stat.Tbb, 10],
  ],
});

/* ---------------------------------------------------------------------------------- rotation */

const RB_ROTATION = new Rotation([
  FIRST_INTRO, GBA1.dodgeCancel(), GBA2, GBA3.cancel(),
  GHA.easyCancel(), 
  FHAGuts, 
  GHA.easyCancel(),
  ECHO.instaDodge(),Lib1, Lib234, Boom.instaSwap(), Outro,

  INTRO, HMA,
  Skill.dodgeCancel(),
  GHA.easyCancel(), 
  FHAGuts, 
  GHA.easyCancel(),
  ECHO.instaDodge(),Lib1, Lib234, Boom.instaSwap(), Outro,
]);

/** Adam Smasher carries its own 1pc set, so the other four echoes run two ordinary 2-piece sets
 *  instead of a 5pc — ATK and Electro. The other two builds are the classic handoff sets, which
 *  she can run instead since everything she gives Lucy is a handoff anyway. */
const RB_ECHOES = [
  new EchoLoadout(ADAM_SMASHER_REBECCA, SHATTERED_DREAMS_1PC, LINGERING_TUNES_2PC, VOID_THUNDER_2PC),
  new EchoLoadout(ADAM_SMASHER_REBECCA, SHATTERED_DREAMS_1PC, LINGERING_TUNES_2PC, REEL_2PC),
  new EchoLoadout(ADAM_SMASHER_REBECCA, SHATTERED_DREAMS_1PC, SWORN_VIGIL_2PC, VOID_THUNDER_2PC),

  new EchoLoadout(ADAM_SMASHER_REBECCA, SHATTERED_DREAMS_1PC, LINGERING_TUNES_2PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(ADAM_SMASHER_REBECCA, SHATTERED_DREAMS_1PC, MOONLIT_CLOUDS_2PC, VOID_THUNDER_2PC),

  new EchoLoadout(HYVATIA, NEONLIGHT_LEAP_5PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(STONEWALL_BRACER, MOONLIT_CLOUDS_5PC),
];

export const REBECCA = new Loadout({
  resonator: REBECCA_RESONATOR,
  sequences: [RB_S1, RB_S2, RB_S3, RB_S4, RB_S5, RB_S6],
  weapons: [SKULL_THRASHER, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: RB_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ER3, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Heavy),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Heavy),
    rotation: RB_ROTATION,
});
