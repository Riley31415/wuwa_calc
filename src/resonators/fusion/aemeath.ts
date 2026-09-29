/**
 * Aemeath — a Fusion Sword main DPS whose damage is nearly all Resonance Liberation DMG, built on
 * the Tune Break variants (see tunebreak.ts) and, in her other mode, Fusion Burst.
 *
 * Two forms, walked by the rotation: Aemeath and her Mech share every gauge and stat, each with its
 * own basic chain, heavies and dodge counter. The Sync Strikes, the Seraphic Duets and both
 * liberations flip form as they land. Both heavies are Resonance Liberation DMG.
 *
 * Her loop is the two gauges. **Synchronization Rate** (forte1, 0-200) builds off basics, dodge
 * counters and Sync Strikes, +40 on an Intro and +30 on Overdrive; Stage 4 of either chain opens
 * Seraphic Duo, where a Duet spends 100 of it. **Resonance Rate** (forte2, 0-4) gains 1 per Duet
 * and 1 per Overdrive (2 with Starlume Acceleration, off the Intro). Overdrive opens Heavenfall
 * Edict: Unbound; at 4 Resonance Rate under Unbound she enters Instant Response, where a Charged
 * II heavy is amplified 200% and refills the Synchronization Rate, and then Finale (1789%) spends
 * both gauges whole.
 *
 * The *modes* are `ResonanceMode` gear, one loadout each, the Denia/Lynae shape:
 * - **Tune Rupture**: her listed casts lay Tune Rupture - Shifting; she answers a Rupture break with
 *   Starburst; every Rupture response on the team banks 10 Rupturous Trail on the target, which a
 *   Seraphic Duet spends into its own volley of Tune Rupture DMG. Between the Stars, Silent
 *   Protection, Stardust and the Trail each carry their own effect.
 * - **Fusion Burst**: the same casts lay a Fusion Burst stack; Fusion Trail mirrors every stack the
 *   team lands; the status calculates past 5 stacks at the cap's rung and an empty target gets one
 *   back; a Seraphic Duet calculates it again at the cap's rung without spending the stacks, +10%
 *   multiplier a Trail stack. Between the Stars is 30% x2, the Outro upgrades on Fusion Burst.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1210, the 3.6+365 static JSON the page
 * fetches) at skill level 10. Per-hit Synchronization Rate off wuwalab (forte_2 x100), which nanoka
 * doesn't list; wuwalab omits Mid-air Attack - Mech entirely, so that cast is left out rather than
 * given an invented gauge value. Form Switch (no damage, auto-casts the new form's Stage 1) isn't an
 * action: a rotation flips form through a Sync Strike, a Duet or a liberation.
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, ResonanceMode, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  addStat,
  addBuff,
  revokeBuff,
  applyCurrent,
  applyEnemy,
  applied,
  appliedByMember,
  casting,
  currentAction, isType,
  runningAction,
  currentMember,
  currentTeam,
  isHeld,
  frozenStacks,
  applyTeam,
  asActor,
  maxStackIncrease,
  queue,
  queueOn,
  removeStack,
  revokeCurrent,
  revokeEnemy,
  stacksOf,
  stacksOfEnemy,
  forte1,
  forte2,
  inflicting,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, START_3, START_2, START_1, INTRO } from "../../engine/rotation.js";
import { TUNE_RUPTURE_SHIFTING, applyRupture, tuneRuptureResponse, tuneBreak, SWORD_BREAK } from "../../shared/tunebreak.js";
import { FUSION_BURST, FUSION_BURST_ACTIONS } from "../../shared/status.js";
import { EVERBRIGHT_POLESTAR } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { SIGILLUM, TRAILBLAZING_STAR_5PC } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* =================================================================================== shared */

/* ----------------------------------------------------------------------------------- actions */

function aemeathAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

const TO_MECH = { updateBuffs: () => applyCurrent(MECH_FORM, 1) };
const TO_AEMEATH = { updateBuffs: () => revokeCurrent(MECH_FORM) };
const DUO = { updateBuffs: () => applyCurrent(SERAPHIC_DUO, 1) };

// --- Aemeath form. forte1 is the Synchronization Rate each hit recovers; heavies recover none.
//     The dodge counter carries the hidden +10 Concerto every dodge counter gets (CLAUDE.md).
const ABA1 = aemeathAction("Basic - Aemeath 1", { animFrames: 23, commitFrames: 16, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 16, mv: 46.35, energy: 0.84, concerto: 1.67, offtune: 2664, forte1: 3.29 }]});
const ABA2 = aemeathAction("Basic - Aemeath 2", { animFrames: 43, commitFrames: 23, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 6, mv: 13.89, energy: 0.25, concerto: 0.5, offtune: 799 },
    { at: 11, mv: 20.84, energy: 0.38, concerto: 0.75, offtune: 1198 },
    { at: 23, mv: 34.73, energy: 0.63, concerto: 1.25, offtune: 1996, forte1: 6.44 },
  ]});
const ABA3 = aemeathAction("Basic - Aemeath 3", { animFrames: 46, commitFrames: 27, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 4, mv: 9.32, energy: 0.17, concerto: 0.34, offtune: 536, updateDebuffs: () => aemeathLays() },
    { at: 12, mv: 9.32, energy: 0.17, concerto: 0.34, offtune: 536 },
    { at: 18, mv: 9.32, energy: 0.17, concerto: 0.34, offtune: 536 },
    { at: 25, mv: 18.63, energy: 0.34, concerto: 0.67, offtune: 1071 },
    { at: 27, mv: 46.56, energy: 0.84, concerto: 1.68, offtune: 2676, forte1: 16.66 },
  ]});
const ABA4 = aemeathAction("Basic - Aemeath 4", { animFrames: 60, commitFrames: 46, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 0, mv: 6.73, energy: 0.13, concerto: 0.25, offtune: 387, updateDebuffs: () => aemeathLays() },
    { at: 2, mv: 6.73, energy: 0.13, concerto: 0.25, offtune: 387 },
    { at: 11, mv: 6.73, energy: 0.13, concerto: 0.25, offtune: 387 },
    { at: 20, mv: 6.73, energy: 0.13, concerto: 0.25, offtune: 387 },
    { at: 29, mv: 6.73, energy: 0.13, concerto: 0.25, offtune: 387 },
    { at: 46, mv: 100.94, energy: 1.82, concerto: 3.63, offtune: 5802, forte1: 23.31 },
  ], ...DUO });
const AHA1 = aemeathAction("Heavy - Aemeath: Charged I", { node: Node.Normal, cast: Cast.Heavy, type: Type.Liberation, mv: 92.83, energy: 1.68, concerto: 3.34, offtune: 5337, updateDebuffs: () => { if (isHeld(AE_S3) && isHeld(INSTANT_RESPONSE)) aemeathLays(); } });
const AHA2 = aemeathAction("Heavy - Aemeath: Charged II", { animFrames: 95, commitFrames: 81, node: Node.Normal, cast: Cast.Heavy, type: Type.Liberation, hits: [
    { at: 44, mv: 11.6, energy: 0.21, concerto: 0.42, offtune: 667, updateDebuffs: () => { if (isHeld(AE_S3) && isHeld(INSTANT_RESPONSE)) aemeathLays(); } },
    { at: 49, mv: 11.6, energy: 0.21, concerto: 0.42, offtune: 667 },
    { at: 60, mv: 11.6, energy: 0.21, concerto: 0.42, offtune: 667 },
    { at: 66, mv: 11.6, energy: 0.21, concerto: 0.42, offtune: 667 },
    { at: 81, mv: 185.6, energy: 3.34, concerto: 6.67, offtune: 10669 },
  ]});
const AMA = aemeathAction("Mid-air - Aemeath Plunge", { animFrames: 53, commitFrames: 42, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 42, mv: 86.29, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 11.71 }]});
const ADC = aemeathAction("Dodge Counter - Aemeath", { animFrames: 54, commitFrames: 27, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 4, mv: 26.02, energy: 0.32, concerto: 1.6447, offtune: 1016 },
    { at: 12, mv: 26.02, energy: 0.32, concerto: 1.6447, offtune: 1016 },
    { at: 18, mv: 26.02, energy: 0.32, concerto: 1.6447, offtune: 1016 },
    { at: 25, mv: 52.03, energy: 0.64, concerto: 3.2637, offtune: 2031 },
    { at: 27, mv: 130.06, energy: 1.59, concerto: 8.1722, offtune: 5076, forte1: 28.99 },
  ]});

// --- Mech form
const MBA1 = aemeathAction("Basic - Mech 1", { animFrames: 33, commitFrames: 12, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 12, mv: 23.2, energy: 0.42, concerto: 0.84, offtune: 1334 },
    { at: 20, mv: 23.2, energy: 0.42, concerto: 0.84, offtune: 1334 },
    { at: 28, mv: 23.2, energy: 0.42, concerto: 0.84, offtune: 1334, forte1: 6.45 },
  ]});
const MBA2 = aemeathAction("Basic - Mech 2", { animFrames: 47, commitFrames: 31, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 10, mv: 18.57, energy: 0.34, concerto: 0.67, offtune: 1068 },
    { at: 31, mv: 74.26, energy: 1.34, concerto: 2.67, offtune: 4269, forte1: 9.6 },
  ]});
const MBA3 = aemeathAction("Basic - Mech 3", { animFrames: 64, commitFrames: 51, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 0, mv: 11.65, energy: 0.21, concerto: 0.42, offtune: 670, updateDebuffs: () => aemeathLays() },
    { at: 10, mv: 3.89, energy: 0.07, concerto: 0.14, offtune: 224 },
    { at: 14, mv: 3.89, energy: 0.07, concerto: 0.14, offtune: 224 },
    { at: 19, mv: 3.89, energy: 0.07, concerto: 0.14, offtune: 224 },
    { at: 23, mv: 3.89, energy: 0.07, concerto: 0.14, offtune: 224 },
    { at: 28, mv: 3.89, energy: 0.07, concerto: 0.14, offtune: 224 },
    { at: 32, mv: 3.89, energy: 0.07, concerto: 0.14, offtune: 224 },
    { at: 51, mv: 81.54, energy: 1.47, concerto: 2.93, offtune: 4688, forte1: 19.88 },
  ]});
const MBA4 = aemeathAction("Basic - Mech 4", { animFrames: 62, commitFrames: 38, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 38, mv: 40.38, energy: 0.73, concerto: 1.46, offtune: 2321, updateDebuffs: () => aemeathLays() },
    { at: 71, mv: 94.21, energy: 1.7, concerto: 3.39, offtune: 5416, forte1: 23.28 },
  ], ...DUO });
const MHA1 = aemeathAction("Heavy - Mech: Charged I", { node: Node.Normal, cast: Cast.Heavy, type: Type.Liberation, mv: 92.83, energy: 1.67, concerto: 3.34, offtune: 5336, updateDebuffs: () => { if (isHeld(AE_S3) && isHeld(INSTANT_RESPONSE)) aemeathLays(); } });
const MHA2 = aemeathAction("Heavy - Mech: Charged II", { animFrames: 56, commitFrames: 40, node: Node.Normal, cast: Cast.Heavy, type: Type.Liberation, hits: [{ at: 40, mv: 232, energy: 4.17, concerto: 8.34, offtune: 13336, updateDebuffs: () => { if (isHeld(AE_S3) && isHeld(INSTANT_RESPONSE)) aemeathLays(); } }]});
const MDC = aemeathAction("Dodge Counter - Mech", { animFrames: 66, commitFrames: 51, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 0, mv: 28.35, energy: 0.36, concerto: 1.7214, offtune: 1150 },
    { at: 10, mv: 9.45, energy: 0.12, concerto: 0.5738, offtune: 384 },
    { at: 14, mv: 9.45, energy: 0.12, concerto: 0.5738, offtune: 384 },
    { at: 19, mv: 9.45, energy: 0.12, concerto: 0.5738, offtune: 384 },
    { at: 23, mv: 9.45, energy: 0.12, concerto: 0.5738, offtune: 384 },
    { at: 28, mv: 9.45, energy: 0.12, concerto: 0.5738, offtune: 384 },
    { at: 32, mv: 9.45, energy: 0.12, concerto: 0.5738, offtune: 384 },
    { at: 51, mv: 198.44, energy: 2.52, concerto: 12.0258, offtune: 8048, forte1: 32.2 },
  ]});

// --- Resonance Skill: the Sync Strikes, combo follow-ups off Stage 2-4, a heavy or a dodge counter
const ArmamentMerge = aemeathAction("Skill - Sync Strike: Armament Merge", { animFrames: 79, commitFrames: 65, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 6, mv: 67.29, energy: 1.21, concerto: 2.42, offtune: 3868, updateDebuffs: () => aemeathLays() },
    { at: 44, mv: 26.92, energy: 0.49, concerto: 0.97, offtune: 1548 },
    { at: 65, mv: 40.38, energy: 0.73, concerto: 1.46, offtune: 2321, forte1: 18.29 },
  ], ...TO_MECH });
const CallOfDawn = aemeathAction("Skill - Sync Strike: Call of Dawn", { animFrames: 72, commitFrames: 59, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 10, mv: 16.33, energy: 0.3, concerto: 0.59, offtune: 939, updateDebuffs: () => aemeathLays() },
    { at: 52, mv: 16.33, energy: 0.3, concerto: 0.59, offtune: 939 },
    { at: 56, mv: 16.33, energy: 0.3, concerto: 0.59, offtune: 939 },
    { at: 59, mv: 114.28, energy: 2.06, concerto: 4.11, offtune: 6569, forte1: 22.18 },
  ], ...TO_AEMEATH });

// --- Forte Circuit: the Seraphic Duets, Resonance Liberation DMG off Seraphic Duo, 100
//     Synchronization Rate apiece and +1 Resonance Rate. Overture is Aemeath's, Encore the Mech's.
const DUET = { node: Node.Forte, cast: Cast.Skill, type: Type.Liberation, castForte1: -100, forte2: 1 };
const AmyFSkill = aemeathAction("Forte - Seraphic Duet: Overture", { animFrames: 180, commitFrames: 180, timestop: 99, motionStop: 99, ...DUET, hits: [
    { at: 0, mv: 17.9, energy: 0.25, concerto: 0.5, offtune: 800, updateDebuffs: () => duetLands() },
    { at: 40, mv: 14.92, energy: 0.21, concerto: 0.42, offtune: 667 },
    { at: 44, mv: 14.92, energy: 0.21, concerto: 0.42, offtune: 667 },
    { at: 48, mv: 14.92, energy: 0.21, concerto: 0.42, offtune: 667 },
    { at: 52, mv: 14.92, energy: 0.21, concerto: 0.42, offtune: 667 },
    { at: 56, mv: 14.92, energy: 0.21, concerto: 0.42, offtune: 667 },
    { at: 60, mv: 14.92, energy: 0.21, concerto: 0.42, offtune: 667 },
    { at: 120, mv: 23.86, energy: 0.34, concerto: 0.67, offtune: 1067 },
    { at: 124, mv: 23.86, energy: 0.34, concerto: 0.67, offtune: 1067 },
    { at: 128, mv: 23.86, energy: 0.34, concerto: 0.67, offtune: 1067 },
    { at: 153, mv: 59.65, energy: 0.84, concerto: 1.67, offtune: 2667 },
    { at: 159, mv: 59.65, energy: 0.84, concerto: 1.67, offtune: 2667 },
    { at: 165, mv: 59.65, energy: 0.84, concerto: 1.67, offtune: 2667, forte2: 1 },
  ], ...TO_MECH });
const MechFSkill = aemeathAction("Forte - Seraphic Duet: Encore", { animFrames: 145, commitFrames: 145, timestop: 60, motionStop: 60, ...DUET, hits: [
    { at: 0, mv: 17.9, energy: 0.25, concerto: 0.5, offtune: 800, updateDebuffs: () => duetLands() },
    { at: 6, mv: 17.9, energy: 0.25, concerto: 0.5, offtune: 800 },
    { at: 68, mv: 35.79, energy: 0.5, concerto: 1, offtune: 1600 },
    { at: 80, mv: 35.79, energy: 0.5, concerto: 1, offtune: 1600 },
    { at: 89, mv: 17.9, energy: 0.25, concerto: 0.5, offtune: 800 },
    { at: 101, mv: 17.9, energy: 0.25, concerto: 0.5, offtune: 800 },
    { at: 120, mv: 178.93, energy: 2.5, concerto: 5, offtune: 8000 },
    { at: 124, mv: 35.79, energy: 0.5, concerto: 1, offtune: 1600, forte2: 1 },
  ], ...TO_AEMEATH });
const isDuet = (): boolean => runningAction(AmyFSkill) || runningAction(MechFSkill);

// --- Resonance Liberation. Overdrive spends the Energy bar (125), banks 30 Synchronization Rate
//     and a Resonance Rate, and opens Unbound and Stardust Resonance. Finale
//     spends both gauges whole — the caps as its deltas, clamped to them first so it lands on 0;
//     what it closes, each buff closes itself. Both carry their flat 20 Concerto Regen.
const Lib1 = aemeathAction("Liberation - Heavenfall Edict: Overdrive", {
  animFrames: 262, commitFrames: 262, timestop: 262, motionStop: 262, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, hits: [
    { at: 214, mv: 200.8, offtune: 16800 },
    { at: 238, mv: 267.74, offtune: 22400 },
    { at: 245, mv: 267.74, offtune: 22400 },
    { at: 252, mv: 267.74, offtune: 22400 },
  ], castConcerto: 20,
  resetEnergy: true, castForte1: 30, castForte2: 1,
  updateBuffs: () => { applyCurrent(MECH_FORM, 1); applyCurrent(UNBOUND, 1); applyCurrent(STARDUST, 2); },
});
const Lib2 = aemeathAction("Liberation - Heavenfall Edict: Finale", {
  animFrames: 340, commitFrames: 340, timestop: 340, motionStop: 340, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, hits: [{ at: 260, mv: 1789.29, energy: 20, offtune: 84000 }], castConcerto: 20, castForte1: -200, castForte2: -4,
  updateBuffs: () => revokeCurrent(MECH_FORM),
});

// --- Intros, one per form: 40 Synchronization Rate and Starlume Acceleration
const INTRO_DEF = { node: Node.Intro, cast: Cast.Intro, type: Type.Intro, energy: 10, concerto: 10, forte1: 40, updateBuffs: () => applyCurrent(STARLUME, 1) };
const Intro = aemeathAction("Intro - Songs Across the Universe", { animFrames: 72, commitFrames: 74, motionStop: 45, ...INTRO_DEF, hits: [
    { at: 52, mv: 13.46, energy: 1, concerto: 1.0001, offtune: 774, updateDebuffs: () => aemeathLays() },
    { at: 56, mv: 13.46, energy: 1, concerto: 1.0001, offtune: 774 },
    { at: 59, mv: 107.66, energy: 8, concerto: 7.9998, offtune: 6189, forte1: 40 },
  ]});
const EIntro = aemeathAction("Intro - Debut of Meteoric Radiance", { animFrames: 74, commitFrames: 76, motionStop: 40, ...INTRO_DEF, hits: [
    { at: 42, mv: 65.3, energy: 4, concerto: 4, offtune: 3754, updateDebuffs: () => aemeathLays() },
    { at: 60, mv: 97.95, energy: 6, concerto: 6, offtune: 5631, forte1: 40 },
  ]});

/** Silent Protection: everyone but her, and "casting this skill resets the effects above" — so a
 *  member's old one comes off before the fresh grant rather than stacking. */
const Outro = aemeathAction("Outro - Silent Protection", {
  animFrames: 0, commitFrames: 0,
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => {
    const buff = isHeld(MODE_BURST) ? SILENT_PROTECTION_BURST : SILENT_PROTECTION_RUPTURE;
    for (const m of currentTeam().slots) {
      if (!m.resonator || m.resonator === AEMEATH_RESONATOR) continue;
      revokeBuff(m.resonator, buff);
      addBuff(m.resonator, buff, 1);
    }
  },
});

/* ------------------------------------------------------------------------------------- buffs */

/** Which form she is in — picks the Intro. Set by every cast that switches her. */
const MECH_FORM = new Buff({ name: "Aemeath: Mech Form" });

const SERAPHIC_DUO = new Buff({
  name: "Aemeath: Seraphic Duo",
  duration: 60 * 5,
});

/** Starlume Acceleration: 15s off the Intro; Overdrive restores one more Resonance Rate and ends
 *  it. */
const STARLUME = new Buff({
  name: "Aemeath: Starlume Acceleration",
  duration: 60 * 15,
  applyStats: () => { if (runningAction(Lib1)) addStat(Stat.AddForte2, 1); },
  convertStats: () => { if (runningAction(Lib1)) revokeCurrent(STARLUME); },
});

/** Stardust Resonance: 30s off Overdrive, enhancing the next two Seraphic Duets — held as two
 *  charges. In Tune Rupture the Duet's volley is 10 instances rather than 5 (the second five as
 *  AddMv, so the Trail's multiplier covers them); in Fusion Burst the Duet's own Fusion Burst is
 *  +200% multiplier, on top of the Trail's. "The next Seraphic Duet cast within 30s after
 *  Overdrive doesn't consume Rupturous Trail / Fusion Trail" is the Duet at both charges, so the
 *  charge is spent after the action, once the Trail has read it. */
const STARDUST = new Buff({
  name: "Aemeath: Stardust Resonance", maxStacks: 2, duration: 60 * 30,
  applyStats: () => {
    if (runningAction(Volley)) addStat(Stat.AddMv, 109.35 * 5);
    if (!runningAction(DuetBurst)) return;
    addStat(Stat.MulMv, 200);
    // S2 raises the Stardust Duet's own Fusion Burst multiplier to 400% — the 200 over it is its own
    if (isHeld(AE_S2)) asSource(AE_S2, () => addStat(Stat.MulMv, 200));
  },
  afterAction: () => { if (runningAction(Volley) || runningAction(DuetBurst)) removeStack(STARDUST, 1); },
});

/** Heavenfall Edict: Unbound — 60s off Overdrive, until Finale. The first action that leaves the
 *  Resonance Rate at its cap of 4 while this is held enters Instant Response. */
const UNBOUND = new Buff({
  name: "Aemeath: Heavenfall Edict - Unbound",
  duration: 60 * 60,
  convertStats: () => { if (runningAction(Lib2)) revokeCurrent(UNBOUND); },
  afterAction: () => { if (forte2() >= 4) applyCurrent(INSTANT_RESPONSE, 1); },
});

/** Instant Response: under Unbound a Charged II restores the whole Synchronization Rate (200 — the
 *  cap, clamped by AEMEATH_RESONATOR's own afterAction). Either Charged II or Finale ends it. */
const INSTANT_RESPONSE = new Buff({
  name: "Aemeath: Instant Response",
  applyStats: () => {
    if ((runningAction(AHA2) || runningAction(MHA2)) && isHeld(UNBOUND)) addStat(Stat.AddForte1, 200);
  },
  convertStats: () => {
    if (runningAction(AHA2) || runningAction(MHA2) || runningAction(Lib2)) revokeCurrent(INSTANT_RESPONSE);
  },
});

/* ---------------------------------------------------------------------------- kit and talents */

/** Before All Sounds: in Instant Response, both forms' heavies are amplified 200%. */
const AE_INHERENT_1 = new Inherent({
  name: "Inherent: Before All Sounds",
  // Brilliance (S1) inherits every Instant Response effect, this one included
  applyStats: () => { if ((isHeld(INSTANT_RESPONSE) || isHeld(BRILLIANCE)) && casting(Cast.Heavy)) addStat(Stat.Amp, 200); },
});

const AEMEATH_TALENTS = new Talent({
  name: "Aemeath: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

/** Between the Stars' own grant, from `hitGlobal` so a teammate's own hit is seen — which runs
 *  with the "current" slot pointed at her, so the actor is read off the team (a queued response
 *  lands on the slot that queued it, so Mornye's Particle Jet counts Mornye). Both modes' payout
 *  buffs are declared further down; only this hook's own body reads them, so it never runs before
 *  they exist. */
const AE_INHERENT_2 = new Inherent({
  name: "Inherent: Between the Stars",
  hitGlobal: () => {
    const actor = currentTeam().slot;
    const slot = 1 << currentTeam().active;
    if (isHeld(MODE_BURST)) {
      if (!appliedByMember(FUSION_BURST, actor) || (stacksOf(BETWEEN_THE_STARS_BURST) & slot) !== 0) return;
      applyCurrent(BETWEEN_THE_STARS_BURST, slot);
      return;
    }
    if (!appliedByMember(TUNE_RUPTURE_SHIFTING, actor) && !isType(Type.Rupture)) return;
    if ((stacksOf(BETWEEN_THE_STARS_RUPTURE) & slot) !== 0) return;
    applyCurrent(BETWEEN_THE_STARS_RUPTURE, slot);
  },
});

const TB_BASE = tuneBreak(90, 89, 68, SWORD_BREAK);
const TB_FORM = tuneBreak(94, 94, 64, [[4, 173.34], [48, 226.66], [74, 1200]]);

export const AEMEATH_RESONATOR = new Resonator({
  name: "Aemeath",
  talent: AEMEATH_TALENTS,
  inherent1: AE_INHERENT_1,
  inherent2: AE_INHERENT_2,
  element: Attribute.Fusion,
  weapon: WeaponType.Sword,
  color: "#ff4680",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  intro: new Action("Intro Resolver", { cast: Cast.Intro, resolve: () => (stacksOf(MECH_FORM) ? EIntro : Intro) }),
  // a Tune Break per form: the Mech form's is the broadblade's
  tuneBreak: new Action("Tune Break Resolver", { resolve: () => (stacksOf(MECH_FORM) ? TB_FORM : TB_BASE) }),
  maxEnergy: 125,
  maxForte1: 200,
  maxForte2: 4,

  stats: [
    [Stat.BaseHp, 11025], [Stat.BaseAtk, 425], [Stat.BaseDef, 1148.8868],
    // the flat 10 every tune-break-era resonator carries (nanoka's own weakness_mastery)
    [Stat.Tbb, 10],
  ],
});

/* --------------------------------------------------------------------------------- sequences */

/** Instant Response - Brilliance (S1): held from the start of the fight — she is out of combat and
 *  casting nothing for the 4s it asks for — and it inherits Instant Response outright, so the
 *  amplification above and S1's own Crit. DMG both read it. Outside Unbound a Charged II takes the
 *  100 Synchronization Rate and ends it, the same way Instant Response is spent by one. */
const BRILLIANCE = new Buff({
  name: "Aemeath S1: Instant Response - Brilliance",
  applyStats: () => {
    if ((runningAction(AHA2) || runningAction(MHA2)) && !isHeld(UNBOUND)) addStat(Stat.AddForte1, 100);
  },
  convertStats: () => { if (runningAction(AHA2) || runningAction(MHA2) || runningAction(Lib2)) revokeCurrent(BRILLIANCE); },
});
/** S1: +300% Crit. DMG on either form's heavy in Instant Response, Brilliance included, and the
 *  Brilliance window above. Sealed Trail is a kill effect, and this calculator fights one boss. */
const AE_S1 = new Sequence({
  name: "Aemeath S1: Gilded Glimmer of the First Dawn",
  combatStart: () => applyCurrent(BRILLIANCE, 1),
  applyStats: () => {
    if ((isHeld(INSTANT_RESPONSE) || isHeld(BRILLIANCE)) && casting(Cast.Heavy)) addStat(Stat.CritDmg, 300);
  },
});

/** S2: both Duets at x2 of their multiplier — no sequence row on nanoka, so multiplicative. In
 *  Tune Rupture the volley ramps 20% an instance to a cap of 5, which over its own 5 instances
 *  averages 40% and over Stardust's 10 averages 70%; the mode's other two lines are paid by
 *  Stardust and Fusion Trail themselves. The kill trigger is out of scope. */
const AE_S2 = new Sequence({
  name: "Aemeath S2: Downy Notes of Snowfluff",
  applyStats: () => {
    if (isDuet()) addStat(Stat.MulMv, 100);
    if (runningAction(Volley)) addStat(Stat.MulMv, isHeld(STARDUST) ? 70 : 40);
  },
});

/** S3: Finale at x2 and Overdrive at x1.4 — again no sequence rows, so multiplicative. The Instant
 *  Response heavies' own inflict and the rewritten Between the Stars are paid where each already
 *  lives (`inflicts()` and the two payout buffs). */
const AE_S3 = new Sequence({
  name: "Aemeath S3: Fervor Sightly Burns Bright as New",
  applyStats: () => {
    if (runningAction(Lib2)) addStat(Stat.MulMv, 100);
    if (runningAction(Lib1)) addStat(Stat.MulMv, 40);
  },
});

/** S4: +20% All-Attribute DMG Bonus to the team off either Intro, either Sync Strike or either
 *  Duet — 30s, so permanent. */
const ETHEREAL_WALTZ = new Buff({
  name: "Aemeath S4: Ethereal Waltz on Binary Tides",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 20]],
});
const AE_S4 = new Sequence({
  name: "Aemeath S4: Ethereal Waltz on Binary Tides",
  updateBuffs: () => {
    if (runningAction(Intro) || runningAction(EIntro) || runningAction(ArmamentMerge) || runningAction(CallOfDawn) || isDuet()) applyTeam(ETHEREAL_WALTZ, 1);
  },
});

/** S5: a kill-reset on Starflux and a once-per-fight cheat death. No formula effect. */
const AE_S5 = new Sequence({ name: "Aemeath S5: Voyage to the Astral Shore" });

/** S6: the target takes 40% more Resonance Liberation DMG from her — which is what her heavies and
 *  Duets deal too; both Trails cap at 60 and double what the Forte Circuit lays (in the modes
 *  themselves); and each mode's status damage crits at a fixed 80%/275%. Tune Rupture DMG carries
 *  no Subtype tag to scope that crit to (damage.ts), so hers is the factor it averages out to
 *  instead: 0.2 + 0.8 x 2.75 = 2.4, written as Total Damage — the one term a tune row multiplies
 *  by that a kit can reach, where a motion-value bonus would only sum with the Trail's own. */
const AE_S6 = new Sequence({
  name: "Aemeath S6: A Zephyr-Kissed Journey to You",
  // her Resonance Mode isn't equipped yet at combatStart, so the Trail's cap is raised from
  // updateGlobal instead — the first cast of the fight, whoever casts it, ahead of any hit laying it
  updateGlobal: () => {
    if (!isHeld(MODE_BURST)) { maxStackIncrease(RUPTUROUS_TRAIL, 30); return; }
    maxStackIncrease(FUSION_TRAIL, 30);
  },
  hitGlobal: () => {
    if (!isHeld(MODE_BURST)) return;
    // the fixed crit itself, written straight out rather than through a buff of its own: onto the
    // cast being evaluated (`asActor`, since this hook runs as her whoever is up), so a burst that
    // calculates on a teammate's turn crits the same way hers does. Scoped to Fusion Burst, which
    // is the only crit a dot row reads at all (damage.ts), so every other action reads past it.
    asActor(() => {
      addStat(Stat.CritRate, 80, Subtype.FusionBurst);
      addStat(Stat.CritDmg, 275, Subtype.FusionBurst);
    });
  },
  applyStats: () => {
    addStat(Stat.DamageTaken, 40, Type.Liberation);
    if (runningAction(Volley) || runningAction(Starburst)) addStat(Stat.TotalDmg, 140);
  },
});

const AE_SEQUENCES = [AE_S1, AE_S2, AE_S3, AE_S4, AE_S5, AE_S6];

/* ======================================================================= Tune Rupture mode */

/** Her answer to a Rupture break, queued by the engine's own break (MODE_RUPTURE) rather than
 *  played — active, like every Tune Break response (see Mornye's Particle Jet). The 8s per-target
 *  cooldown is the Interfered window itself: no second break lands inside it. */
const Starburst = aemeathAction("Tune Rupture Response - Starburst", { animFrames: 0, node: Node.Forte, type: Type.Rupture, hits: [{ at: 0, mv: 596.43 }], scaling: Scaling.Tune });

/** The Duet's own Tune Rupture DMG: 5 instances of 109.35%, queued off the Duet. Stardust makes it
 *  10 and the Rupturous Trail multiplies it — each from its own buff. */
const Volley = aemeathAction("Forte - Seraphic Duet: Tune Rupture", { node: Node.Forte, type: Type.Rupture, mv: 109.35 * 5, scaling: Scaling.Tune });

/** Rupturous Trail: 10 stacks on the target every time a resonator on the team responds to Tune
 *  Rupture - Interfered, cap 30, 30s (standing). The Duet's volley is +4% multiplier a stack and
 *  spends them all — unless it is the first Stardust Duet (both charges up), which pays and
 *  leaves them. */
const RUPTUROUS_TRAIL = new Debuff({
  name: "Aemeath: Rupturous Trail", maxStacks: 30, duration: 60 * 30,
  applyStats: () => { if (runningAction(Volley)) addStat(Stat.MulMv, 4 * frozenStacks()); },
  convertStats: () => { if (runningAction(Volley) && stacksOf(STARDUST) !== 2) revokeEnemy(RUPTUROUS_TRAIL); },
});

/** How many distinct team slots Between the Stars has counted — one bit per slot, the way
 *  Hiyuki's Snow Rust holds it, so the tier is how many of the three bits are up. */
const betweenTheStars = (): number => {
  const slots = frozenStacks();
  return (slots & 1) + ((slots >> 1) & 1) + ((slots >> 2) & 1);
};

/** Between the Stars, Tune Rupture: +20% Crit. DMG the first time each resonator on the team lays
 *  a Tune Rupture - Shifting or deals Tune Rupture DMG, cap 3; at 3, Finale is amplified 25%.
 *  "Each Resonator can only trigger this effect once" is carried by the stacks themselves: slot 1
 *  banks 1, slot 2 banks 2, slot 3 banks 4, so what is held is the set of who has already paid. */
const BETWEEN_THE_STARS_RUPTURE = new Buff({
  name: "Inherent: Between the Stars (rupture)", maxStacks: 1 + 2 + 4,
  display: () => `Inherent: Between the Stars (rupture) x${betweenTheStars()}`,
  // S3 replaces the tiering outright: a flat 60% off the first inflict, and Finale amplified with it
  applyStats: () => {
    const tiers = betweenTheStars();
    if (isHeld(AE_S3)) asSource(AE_S3, () => addStat(Stat.CritDmg, 60));
    else addStat(Stat.CritDmg, 20 * tiers);
    if (!runningAction(Lib2)) return;
    if (tiers >= 3) addStat(Stat.Amp, 25);
    else if (isHeld(AE_S3)) asSource(AE_S3, () => addStat(Stat.Amp, 25));
  },
});

/** Silent Protection (Outro), Tune Rupture: everyone but her gets +10% All DMG Amplification for
 *  20s, 20% once they lay a Tune Rupture - Shifting of their own — stack 2 is that upgraded state.
 *  A 20s team buff, so lost on her next Intro. */
const SILENT_PROTECTION_RUPTURE = new Buff({
  name: "Aemeath: Outro (rupture)", maxStacks: 2, duration: 60 * 20,
  grants: [{ on: inflicting(() => appliedByMember(TUNE_RUPTURE_SHIFTING, currentMember()) > 0) }],
  applyStats: () => addStat(Stat.Amp, frozenStacks() === 2 ? 20 : 10),
});

/** The mode's Shifting, or in the other mode a Fusion Burst stack: the first hit of Stage 3-4 of
 *  either form, both Sync Strikes and both Intros — and S3's heavies in Instant Response. */
function aemeathLays(): void {
  if (isHeld(MODE_BURST)) applyEnemy(FUSION_BURST, 1);
  else if (isHeld(MODE_RUPTURE)) applyRupture();
}
/** A Duet's first hit: S6's own 10 stacks (from here rather than the Trail, which an empty target
 *  doesn't hold), then the mode's follow-up. */
function duetLands(): void {
  if (isHeld(AE_S6)) applyEnemy(isHeld(MODE_BURST) ? FUSION_TRAIL : RUPTUROUS_TRAIL, 10);
  if (isHeld(MODE_BURST)) queue(DuetBurst);
  else if (isHeld(MODE_RUPTURE)) queue(Volley);
}

/** Held on her slot, so its hitGlobal runs as her whoever is acting: the Starburst response and
 *  the Trail are hers. A response is any Rupture-typed hit that isn't her own Duet volley. The
 *  volley follows the Duet's hit, after S6 has laid its stacks. */
const MODE_RUPTURE = new ResonanceMode({
  name: "Resonance Mode - Tune Rupture",
  hitGlobal: () => {
    tuneRuptureResponse(Starburst);
    const a = currentAction();
    if (isType(Type.Rupture) && !runningAction(Volley)) applyEnemy(RUPTUROUS_TRAIL, isHeld(AE_S6) ? 20 : 10);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

const ABA234 = new ActionGroup("Basic - Aemeath 234", [ABA2, ABA3, ABA4]);
const MBA234 = new ActionGroup("Basic - Mech 234", [MBA2, MBA3, MBA4]);

/** Intro (+40 Rate, Starlume) into Stage 3-4, Overdrive (Rate 2 with Starlume — Unbound, Stardust),
 *  the Mech chain into the free Encore, the Aemeath chain into Overture (Rate 4, Instant Response),
 *  the Charged II to refill the gauge, the echo, Finale and out. Never the team's lead. */
const ABA34 = new ActionGroup("Basic - Aemeath 34", [ABA3, ABA4]);

const AE_ROTATION = new Rotation([
  INTRO, ABA34.cancel(), Lib1,
  MBA234.cancel(), MechFSkill,
  ABA234.cancel(), AmyFSkill,
  MHA2.cancel(), Lib2, ECHO.instaSwap(),
  Outro,
]);

// S1: Brilliance stands at the opening, so the Charged II ahead of Overdrive is amplified and
// hands back the whole 100 Synchronization Rate it would otherwise take a chain to rebuild
const AE_ROTATION_S1 = new Rotation([
  START_1, START_2, START_3, AHA2.instaSwap(),

  INTRO, ABA34.cancel(), Lib1,
  MBA234.cancel(), MechFSkill,
  ABA234.cancel(), AmyFSkill,
  MHA2.cancel(), Lib2, ECHO.instaSwap(),
  Outro,
]);

export const AEMEATH_RUPTURE = new Loadout({
  resonator: AEMEATH_RESONATOR,
  weapons: [EVERBRIGHT_POLESTAR, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(SIGILLUM, TRAILBLAZING_STAR_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Basic),
  rotation: { 0: AE_ROTATION, 1: AE_ROTATION_S1 },
  sequences: AE_SEQUENCES,
  mode: MODE_RUPTURE,
});

/* ======================================================================= Fusion Burst mode */

/** The Duet's own Fusion Burst: the status calculated at the target's max-stack rung without
 *  spending the stacks — a dot hit like the ladder's own, carrying no motion value of its own; the
 *  rung is added by the status itself (status.ts's own FUSION_BURST, so the value is sourced to
 *  it and reads the fight's cap), the way Hsin's Heart of Thunder reads Electro Flare. The Trail
 *  and Stardust multiply it from their own buffs. */
const DuetBurst = new Action("Forte - Seraphic Duet: Fusion Burst", {
  element: Attribute.Fusion, type: Type.Status, subtype: Subtype.FusionBurst, scaling: Scaling.Dot, hits: [{ at: 0 }],
});

/** Fusion Trail: a stack for every Fusion Burst stack anyone on the team lands, cap 30, 30s
 *  (standing). The Duet's Fusion Burst is +10% multiplier a stack and spends them all — unless it
 *  is the first Stardust Duet (both charges up), which pays and leaves them. */
const FUSION_TRAIL = new Debuff({
  name: "Aemeath: Fusion Trail", maxStacks: 30, duration: 60 * 30,
  applyStats: () => {
    if (!runningAction(DuetBurst)) return;
    // the count is read out here: inside `asSource` the "current" gear is the node, not this trail
    const trail = frozenStacks();
    addStat(Stat.MulMv, 10 * trail);
    // S2 pays 15% a stack rather than 10% — the 5 more a stack is the node's own
    if (isHeld(AE_S2)) asSource(AE_S2, () => addStat(Stat.MulMv, 5 * trail));
  },
  convertStats: () => { if (runningAction(DuetBurst) && stacksOf(STARDUST) !== 2) revokeEnemy(FUSION_TRAIL); },
});

/** Between the Stars, Fusion Burst: +30% Crit. DMG the first time each resonator on the team lays
 *  Fusion Burst, cap 2; at 2, Finale is amplified 25%. The same per-slot bits as the Rupture one. */
const BETWEEN_THE_STARS_BURST = new Buff({
  name: "Inherent: Between the Stars (burst)", maxStacks: 1 + 2 + 4,
  display: () => `Inherent: Between the Stars (burst) x${Math.min(2, betweenTheStars())}`,
  applyStats: () => {
    const n = Math.min(2, betweenTheStars());
    if (isHeld(AE_S3)) asSource(AE_S3, () => addStat(Stat.CritDmg, 60));
    else addStat(Stat.CritDmg, 30 * n);
    if (!runningAction(Lib2)) return;
    if (n >= 2) addStat(Stat.Amp, 25);
    else if (isHeld(AE_S3)) asSource(AE_S3, () => addStat(Stat.Amp, 25));
  },
});

/** Silent Protection (Outro), Fusion Burst: everyone but her gets +10% All DMG Amplification for
 *  20s, 20% once they lay Fusion Burst of their own — stack 2 is that upgraded state. */
const SILENT_PROTECTION_BURST = new Buff({
  name: "Aemeath: Outro (burst)", maxStacks: 2, duration: 60 * 20,
  grants: [{ on: inflicting(() => appliedByMember(FUSION_BURST, currentMember()) > 0) }],
  applyStats: () => addStat(Stat.Amp, frozenStacks() === 2 ? 20 : 10),
});

/** Held on her slot, so its hitGlobal runs as her whoever is acting. Her listed casts lay a
 *  stack; every stack the team lands mirrors into Fusion Trail; and the mode's own upkeep — past 5
 *  stacks the status calculates at the cap's rung on whoever is on field (the ladder's own rule,
 *  status.ts) and clears, and a target left on 0 gets a stack back, hers. The fight opens on that
 *  stack too. A Duet's hit queues its own calculation. */
const MODE_BURST = new ResonanceMode({
  name: "Resonance Mode - Fusion Burst",
  hitGlobal: () => {
    const team = currentTeam();
    if (stacksOfEnemy(FUSION_BURST) > 5) {
      queueOn(team.slot.resonator!, FUSION_BURST_ACTIONS[team.enemyMax(FUSION_BURST)]!);
      revokeEnemy(FUSION_BURST);
    }
    if (stacksOfEnemy(FUSION_BURST) === 0) {
      applyEnemy(FUSION_BURST, 1);
    }
    const landed = applied(FUSION_BURST);
    if (landed > 0) applyEnemy(FUSION_TRAIL, isHeld(AE_S6) ? landed * 2 : landed);
  },
});

export const AEMEATH_BURST = new Loadout({
  resonator: AEMEATH_RESONATOR,
  weapons: [EVERBRIGHT_POLESTAR, EMERALD_OF_GENESIS],
  echoLoadouts: [
    new EchoLoadout(SIGILLUM, TRAILBLAZING_STAR_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Liberation, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  rotation: { 0: AE_ROTATION, 1: AE_ROTATION_S1 },
  sequences: AE_SEQUENCES,
  mode: MODE_BURST,
});
