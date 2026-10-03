/**
 * Yangyang: Xuanling — a Havoc Sword main DPS built on Havoc Bane, and very nearly an all-Heavy
 * kit: only the two four-stage Basic Attack chains are Basic Attack DMG. Both Resonance Skill
 * forms, both Heavy Attacks, Feather Fall, the whole Havoc in Bloom chain and even the Liberation
 * are *considered Heavy Attack DMG* — which is what her sig, her sonata and her echo all pay into.
 * Filed under Mengzhou with her own echo and sonata, the version she arrives in, rather than under
 * Huanglong with the rest of the country she comes from.
 *
 * Her loop is two stances and two gauges:
 * - **Melody** (forte1, 0-100) starts full and is spent by Basic Attacks. A full four-stage chain
 *   costs 110, so it bottoms out inside stage 4 — the two stage-4 casts floor the bar themselves,
 *   since nothing in this engine does.
 * - Melody empty unlocks **Sword Stance Flow**, which switches to the other stance, refills Melody
 *   and banks a point of **Azure Plume** (forte2, 0-2).
 * - At 2 Azure Plume the stance's Heavy Attack opens. **Heavy - Azure Sword Stance** spends the
 *   plume outright; **Heavy - Feather Sword Stance** spends none and auto-casts **Mid-air Attack -
 *   Feather Fall**, which spends it instead and opens **Hark the Wind** — the 12s window where
 *   Feather basics become the far larger **Havoc in Bloom** chain.
 * - The Liberation spends all Melody for a 1988% hit, banks a plume of its own, and raises Havoc
 *   Bane on the target to its cap.
 *
 * Havoc Bane is the whole point. **Unbroken Vow** amplifies her damage by 10% a stack up to 3, and
 * by 12% a stack — so a flat 36% — from 4 to 6, and the target's base cap is 3: reaching that
 * second tier at all takes a kit that raises Negative Status caps, which is why Chisa stands
 * behind her. Two more passives ride on *anyone* on the team inflicting it: **Feathered Oath**
 * (Forte Circuit) at +25% Crit. DMG a stack to the six Heavy casts it names, and **Windbound**
 * (Inherent), which at 6 becomes **One with the Wind** and has her next Sword Stance Flow summon
 * Feather Release for 6 stacks at once.
 *
 * Two pieces are deliberately absent. **Refrain** propagates the highest Havoc Bane count across
 * targets in range, which does nothing to the single boss this calculator fights. **Wraith of
 * Sound** (a fixed 523 Havoc hit) only fires when a Sword Stance Flow resets the Basic chain,
 * which the rotation below never does. Every passive cooldown is a nameless buff lasting it: 1s on
 * Windbound, Feathered Oath and the S6 Shadow, 25s on the two Crit. DMG windows and on S6's window.
 *
 * MVs off nanoka.cc (character 1610) at level 10, per-hit x hit count as CLAUDE.md describes, with
 * the flat Concerto Regen rows folded in (the Liberation 20, the Intro 10) and the hidden +10 on
 * both dodge counters. Melody and Azure Plume are wuwalab's frame data
 * (api.wuwalab.com/api/app/characters/xuanling), which nanoka does not expose. Dodge Counter -
 * Havoc in Bloom shares Basic - Havoc in Bloom's own rows exactly, hit for hit, so the three
 * actions below stand for both. Her `weakness_mastery` is 0, so she carries no flat Tune Break
 * Boost of her own.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  addStat,
  applied,
  applyCurrent,
  applyEnemy,
  applyTeam,
  casting,
  consume,
  currentAction,
  triggeredAction,
  runningAction,
  currentTeam,
  forte1,
  frozenStacks,
  isActive,
  isHeld,
  maxStackIncrease,
  queue,
  queueOn,
  removeStack,
  revokeCurrent,
  setForte1,
  setForte2,
  stacksOfEnemy,
  leftOnTeam,
  runningAnyOf,
  both,
  onInflict,
  onApplied,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, START_LAST, INTRO_LAST, ActionTag } from "../../engine/rotation.js";
import { HAVOC_BANE, anyNegativeStatusInflicted } from "../../shared/status.js";
import { AZURE_OATH, EMERALD_SENTENCE } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { THOUSAND_PUPPET_PAVILION, FEATHERED_TRACE_5PC } from "../../echoes/mengzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function yangyangAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

/** Both Sword Stance Flow forms, which are where every stored payout is cashed. Feather Release
 *  inflicts in `updateDebuffs`, the hit's first phase, so the team's own "on inflicting Havoc Bane"
 *  passives see all six stacks this action; the Flow's own "consume 1 stack on hit" is its first
 *  hit's (FLOW_CONSUME, wuwalab's consume_havoc_bane), behind that inflict. */
const FLOW = {
  updateDebuffs: () => {
    if (!isHeld(ONE_WITH_THE_WIND)) return;
    applyEnemy(HAVOC_BANE, 6);
    revokeCurrent(ONE_WITH_THE_WIND);
  },
  updateBuffs: () => {
    if (!isHeld(VOICE_UPON_VOICE)) return;
    queue(ShadowOfXuanling);
    revokeCurrent(VOICE_UPON_VOICE);
  },
};
// `consume`, not a plain remove: this is the kit spending a stack, and a teammate's own "when you
// consume Havoc Bane" passive has no other way to see it (context.ts's own `consumed()`)
const FLOW_CONSUME = { updateDebuffs: () => consume(HAVOC_BANE, 1) };

// --- Succor and Smite: the two four-stage Basic chains, the only ordinary Basic Attack DMG she
//     has. Stage 4 of each lands a stack of Havoc Bane.
const BA_A1 = yangyangAction("Basic - Azure Sword Stance 1", { animFrames: 19, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 14, mv: 4772, energy: 75, concerto: 150, offtune: 2400, forte1: -1200 }]});
const BA_A2 = yangyangAction("Basic - Azure Sword Stance 2", { animFrames: 44, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 6, mv: 2014, energy: 32, concerto: 64, offtune: 1013, forte1: -480 },
    { hitFrame: 15, mv: 2014, energy: 32, concerto: 64, offtune: 1013, forte1: -480 },
    { hitFrame: 37, mv: 6041, energy: 95, concerto: 190, offtune: 3039, forte1: -1440 },
  ]});
const BA_A3 = yangyangAction("Basic - Azure Sword Stance 3", { animFrames: 43, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 3021, energy: 48, concerto: 95, offtune: 1520, forte1: -780 },
    { hitFrame: 35, mv: 7048, energy: 111, concerto: 222, offtune: 3545, forte1: -1820 },
  ]});
const BA_A4 = yangyangAction("Basic - Azure Sword Stance 4", {
  animFrames: 76,
  node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 1857, energy: 30, concerto: 59, offtune: 934, forte1: -480 },
    { hitFrame: 21, mv: 1857, energy: 30, concerto: 59, offtune: 934, forte1: -480 },
    { hitFrame: 41, mv: 14849, energy: 234, concerto: 467, offtune: 7469, forte1: -3840,
      updateDebuffs: () => applyEnemy(HAVOC_BANE, isHeld(XL_S3) ? 2 : 1) },
  ],
});
const MA_A = yangyangAction("Mid-air - Azure Sword Stance Plunge", { animFrames: 53, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 34, mv: 9861, energy: 155, concerto: 310, offtune: 4960, forte1: -1200 }]});
const DC_A = yangyangAction("Dodge Counter - Azure Sword Stance 2", { animFrames: 44, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 6, mv: 3923, energy: 62, concerto: 124, offtune: 1973, forte1: -480 },
    { hitFrame: 15, mv: 3923, energy: 62, concerto: 124, offtune: 1973, forte1: -480 },
    { hitFrame: 37, mv: 11767, energy: 185, concerto: 370, offtune: 5919, forte1: -1440 },
  ], castConcerto: 1000});

const BA_F1 = yangyangAction("Basic - Feather Sword Stance 1", { animFrames: 33, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 3977, energy: 63, concerto: 125, offtune: 2000, forte1: -600 },
    { hitFrame: 27, mv: 3977, energy: 63, concerto: 125, offtune: 2000, forte1: -600 },
  ]});
const BA_F2 = yangyangAction("Basic - Feather Sword Stance 2", { animFrames: 42, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 3356, energy: 53, concerto: 106, offtune: 1688, forte1: -800 },
    { hitFrame: 20, commitFrame: 12, mv: 3356, energy: 53, concerto: 106, offtune: 1688, forte1: -800 },
    { hitFrame: 29, commitFrame: 12, mv: 3356, energy: 53, concerto: 106, offtune: 1688, forte1: -800 },
  ]});
const BA_F3 = yangyangAction("Basic - Feather Sword Stance 3", { animFrames: 33, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 1486, energy: 24, concerto: 47, offtune: 748, forte1: -2600 },
    { hitFrame: 16, mv: 743, energy: 12, concerto: 24, offtune: 374 },
    { hitFrame: 25, commitFrame: 16, mv: 743, energy: 12, concerto: 24, offtune: 374 },
    { hitFrame: 34, commitFrame: 16, mv: 743, energy: 12, concerto: 24, offtune: 374 },
    { hitFrame: 54, commitFrame: 16, mv: 3714, energy: 59, concerto: 117, offtune: 1868 },
  ]});
const BA_F4 = yangyangAction("Basic - Feather Sword Stance 4", {
  animFrames: 93,
  node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 50, mv: 7158, energy: 113, concerto: 225, offtune: 3600, forte1: -1440 },
    { hitFrame: 52, mv: 7158, energy: 113, concerto: 225, offtune: 3600, forte1: -1440 },
    { hitFrame: 54, mv: 9543, energy: 150, concerto: 300, offtune: 4800, forte1: -1920,
      updateDebuffs: () => applyEnemy(HAVOC_BANE, isHeld(XL_S3) ? 2 : 1) },
  ],
});
const MA_F = yangyangAction("Mid-air - Feather Sword Stance Plunge", { animFrames: 53, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 34, mv: 9861, energy: 155, concerto: 310, offtune: 4960, forte1: -1200 }]});
const DC_F = yangyangAction("Dodge Counter - Feather Sword Stance 2", { animFrames: 42, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 6537, energy: 103, concerto: 206, offtune: 3288, forte1: -800 },
    { hitFrame: 20, commitFrame: 12, mv: 6537, energy: 103, concerto: 206, offtune: 3288, forte1: -800 },
    { hitFrame: 29, commitFrame: 12, mv: 6537, energy: 103, concerto: 206, offtune: 3288, forte1: -800 },
  ], castConcerto: 1000});

// --- Feather's Edge: the plain stance switch, castable any time and worth nothing but its own
//     hit — the Flow forms below replace it the moment Melody empties.
const SwitchAzure = yangyangAction("Skill - Sword Stance Switch: Azure", { animFrames: 59, node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, bullets: [
    { hitFrame: 22, mv: 6995, energy: 110, concerto: 220, offtune: 3519 },
    { hitFrame: 41, mv: 1555, energy: 25, concerto: 49, offtune: 782 },
    { hitFrame: 50, commitFrame: 41, mv: 1555, energy: 25, concerto: 49, offtune: 782 },
    { hitFrame: 59, commitFrame: 41, mv: 1555, energy: 25, concerto: 49, offtune: 782 },
  ],
  updateBuffs: () => revokeCurrent(FEATHER_STANCE),
});
const SwitchFeather = yangyangAction("Skill - Sword Stance Switch: Feather", { animFrames: 44, node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, bullets: [
    { hitFrame: 28, mv: 3356, energy: 53, concerto: 106, offtune: 1688 },
    { hitFrame: 36, commitFrame: 28, mv: 3356, energy: 53, concerto: 106, offtune: 1688 },
    { hitFrame: 44, commitFrame: 28, mv: 3356, energy: 53, concerto: 106, offtune: 1688 },
  ],
  updateBuffs: () => applyCurrent(FEATHER_STANCE, 1),
});

// --- The Way of Ten Thousand Voices. Sword Stance Flow refills Melody outright rather than
//     adding to it, so the refill is a set (the bar is at 0 by the time either is castable).
const FlowAzure = yangyangAction("Skill - Sword Stance Flow: Azure", {
  // hidden prio frames? wuwalab's priority never reaches 10, yet the press holds to 46 in game
  animFrames: 59, prioFrames: 46,
  node: Node.Forte, cast: Cast.Skill, type: Type.Heavy, bullets: [
    { hitFrame: 22, mv: 6995, energy: 696, concerto: 600, offtune: 3519, ...FLOW_CONSUME },
    { hitFrame: 41, mv: 1555, energy: 155, concerto: 134, offtune: 782 },
    { hitFrame: 50, commitFrame: 41, mv: 1555, energy: 155, concerto: 134, offtune: 782 },
    { hitFrame: 59, commitFrame: 41, mv: 1555, energy: 155, concerto: 134, offtune: 782 },
  ], castForte2: 1,castForte1: 10000,
  ...FLOW,
  updateBuffs: () => {
    revokeCurrent(FEATHER_STANCE);
    FLOW.updateBuffs();
  },
});
const FlowFeather = yangyangAction("Skill - Sword Stance Flow: Feather", {
  animFrames: 44,
  node: Node.Forte, cast: Cast.Skill, type: Type.Heavy, bullets: [
    { hitFrame: 28, mv: 3356, energy: 387, concerto: 334, offtune: 1688, ...FLOW_CONSUME },
    { hitFrame: 36, commitFrame: 28, mv: 3356, energy: 387, concerto: 334, offtune: 1688 },
    { hitFrame: 44, commitFrame: 28, mv: 3356, energy: 387, concerto: 334, offtune: 1688 },
  ], castForte2: 1, castForte1: 10000, 
  ...FLOW,
  updateBuffs: () => {
    applyCurrent(FEATHER_STANCE, 1);
    FLOW.updateBuffs();
  },
});

const HeavyAzure = yangyangAction("Forte Heavy - Azure Sword Stance", { minForte2: 2,
  animFrames: 105,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 52, mv: 13516, energy: 280, concerto: 450, offtune: 3200,
      updateDebuffs: () => applyEnemy(HAVOC_BANE, isHeld(XL_S3) ? 3 : 2) },
    { hitFrame: 60, mv: 13516, energy: 280, concerto: 450, offtune: 3200 },
    { hitFrame: 70, mv: 18021, energy: 374, concerto: 600, offtune: 4266 },
  ],
  updateBuffs: () => {
    if (isHeld(BATED_BREATH_CD)) return;
    applyCurrent(BATED_BREATH, 1);
    applyCurrent(BATED_BREATH_CD, 1);
  },
  // "consumes all Azure Plume": -100 shows the whole-bar drain; the bar reads empty after it
  castForte2: -2,
});
const HeavyFeather = yangyangAction("Forte Heavy - Feather Sword Stance", { minForte2: 2,
  animFrames: 45,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 36, mv: 2171, energy: 19, concerto: 47, offtune: 747,
      updateDebuffs: () => applyEnemy(HAVOC_BANE, isHeld(XL_S3) ? 3 : 2) },
    { hitFrame: 45, mv: 19534, energy: 168, concerto: 420, offtune: 6718 },
  ],
  updateBuffs: () => {
    if (isHeld(STREAMING_STORM_CD)) return;
    applyCurrent(STREAMING_STORM, 1);
    applyCurrent(STREAMING_STORM_CD, 1);
  },
});
const FeatherFall = yangyangAction("Forte Mid-air - Feather Fall", { minForte2: 2,
  animFrames: 76,
  node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 10, mv: 1480, energy: 17, concerto: 42, offtune: 662 },
    { hitFrame: 19, commitFrame: 10, mv: 1480, energy: 17, concerto: 42, offtune: 662 },
    { hitFrame: 28, commitFrame: 10, mv: 1480, energy: 17, concerto: 42, offtune: 662 },
    { hitFrame: 58, mv: 6657, energy: 75, concerto: 186, offtune: 2976 },
  ],
  // Feather Sword Stance itself spends none — this auto-cast follow-up consumes all Azure Plume
  castForte2: -2,
});
const HiB1 = yangyangAction("Basic - Havoc in Bloom 1", { animFrames: 38, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 14, mv: 3979, energy: 45, concerto: 112, offtune: 1779 },
    { hitFrame: 20, commitFrame: 14, mv: 3979, energy: 45, concerto: 112, offtune: 1779 },
    { hitFrame: 26, commitFrame: 14, mv: 3979, energy: 45, concerto: 112, offtune: 1779 },
  ]});
const HiB2 = yangyangAction("Basic - Havoc in Bloom 2", { animFrames: 69, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 36, mv: 8925, energy: 100, concerto: 250, offtune: 3991 },
    { hitFrame: 48, mv: 6694, energy: 75, concerto: 188, offtune: 2993 },
    { hitFrame: 60, mv: 6694, energy: 75, concerto: 188, offtune: 2993 },
  ]});
const HiB3 = yangyangAction("Basic - Havoc in Bloom 3", { animFrames: 108, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 6, mv: 2398, energy: 16, concerto: 76, offtune: 640 },
    { hitFrame: 15, commitFrame: 6, mv: 2398, energy: 16, concerto: 76, offtune: 640 },
    { hitFrame: 24, commitFrame: 6, mv: 2398, energy: 16, concerto: 76, offtune: 640 },
    { hitFrame: 33, commitFrame: 6, mv: 2398, energy: 16, concerto: 76, offtune: 640 },
    { hitFrame: 42, commitFrame: 6, mv: 2398, energy: 16, concerto: 76, offtune: 640 },
    { hitFrame: 72, mv: 27969, energy: 187, concerto: 887, offtune: 7465 },
  ]});

// --- Hush of a Thousand Voices. Heavy Attack DMG despite the cast, and it ends holding a plume.
const Lib = yangyangAction("Liberation - Hush of a Thousand Voices", {
  animFrames: 300, prioFrames: 294, timestop: [0, 300], motionStop: [0, 300], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Heavy, bullets: [
    // One Life, One Blade's own first line: the hit raises Havoc Bane to the target's limit, which
    // is the fight's rather than the declared 3 (Chisa's +3 to every Negative Status cap)
    { hitFrame: 252, mv: 198810, offtune: 136400, updateDebuffs: () => applyEnemy(HAVOC_BANE, currentTeam().enemyMax(HAVOC_BANE)) },
  ], castConcerto: 2000, resetForte1: true,
  castForte2: 1, resetEnergy: true,
  updateBuffs: () => applyCurrent(VOICE_UPON_VOICE, 1),
});
/** Voice upon Voice cashed on the next Sword Stance Flow. A summon, so it is queued rather than
 *  named by the rotation. */
const ShadowOfXuanling = yangyangAction("Liberation - Shadow of Xuanling", { tag: ActionTag.Field, animFrames: 12, node: Node.Liberation, type: Type.Heavy, bullets: [{ hitFrame: 12, commitFrame: 0, mv: 33798 }]});
/** The three sequence Shadows — the Liberation's own 337.98% row (no energy/concerto/off-tune of
 *  its own), Heavy DMG, each filed under the cast that summons it. */
const ShadowUnfaltering = yangyangAction("Liberation - Shadow of Xuanling: Unfaltering (S1)", { tag: ActionTag.Field, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 33798 }] });
const ShadowStrungNotes = yangyangAction("Liberation - Shadow of Xuanling: Strung Notes (S2)", { tag: ActionTag.Field, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 33798 }] });
const ShadowWitheredWood = yangyangAction("Liberation - Shadow of Xuanling: Still as Withered Wood (S6)", { tag: ActionTag.Field, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 33798 }] });

/** Skybound Feather is one Intro with one animation per stance (nanoka's two identical damage
 *  entries; wuwalab's "Skytouch" and "Aria of the Feather"), picked by the stance she left in. */
const INTRO = {
  animFrames: 47, prioFrames: 38, noSwapFrames: 44, motionStop: [5, 35],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 40, mv: 11659, energy: 1000, offtune: 5864, updateDebuffs: () => applyEnemy(HAVOC_BANE, 1) },
  ], castConcerto: 1000,
  castForte2: 1,
};
const IntroAzure = yangyangAction("Intro - Skybound Feather (Azure)", INTRO);
const IntroFeather = yangyangAction("Intro - Skybound Feather (Feather)", INTRO);
const INTROS = new Set<Action>([IntroAzure, IntroFeather]);
const Outro = yangyangAction("Outro - As the Wind Wills", {
  animFrames: 0,
  cast: Cast.Outro, type: Type.Outro, bullets: [{ hitFrame: 0, mv: 30000 }], minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => applyTeam(TONAL_SWITCH, 1),
});

/* ------------------------------------------------------------------------------------- buffs */

/** The six casts Feathered Oath names, and the five of them Streaming Storm does — she has other
 *  Heavy Attack DMG (both stance switches, both Flows, the Liberation), so neither can be a plain
 *  `isType(Type.Heavy)` check. */
const FEATHER_HEAVIES: Action[] = [HeavyFeather, FeatherFall, HiB1, HiB2, HiB3];
const OATH_ACTIONS = new Set<Action>([HeavyAzure, ...FEATHER_HEAVIES]);
const STORM_ACTIONS = new Set<Action>(FEATHER_HEAVIES);

/** Feathered Oath (Forte Circuit): a stack whenever anyone on the team inflicts Havoc Bane, at
 *  most one a second (`OATH_ICD`), up to 6, each +25% Crit. DMG on the casts above. "While
 *  Yangyang is the active Resonator" needs no check — every cast it names is one of hers, made on
 *  field. A stack lasts 4s and every fresh Havoc Bane renews the set, so a gap with no Bane in it
 *  runs it out on its own; her outro ends it too, per CLAUDE.md's own wording rule. */
const FEATHERED_OATH = new Buff({
  name: "Xuanling: Feathered Oath", maxStacks: 6, duration: 60 * 4,
  applyStats: () => { if (runningAnyOf(OATH_ACTIONS)) addStat(Stat.CritDmg, 25 * frozenStacks()); },
});

/** Bated Breath and Streaming Storm: the two +160% Crit. DMG windows, each opened by its own Heavy
 *  Attack and each gained at most once every 25s — the cooldown starts as the window is gained
 *  (`BATED_BREATH_CD`, `STREAMING_STORM_CD`). "While Yangyang: Xuanling is the active Resonator"
 *  needs no check on either: every cast either window pays is one of hers, made on field. */
const BATED_BREATH_CD = new Buff({ duration: 60 * 25 });
const STREAMING_STORM_CD = new Buff({ duration: 60 * 25 });

const BATED_BREATH = new Buff({
  name: "Xuanling: Bated Breath",
  stats: [[Stat.CritDmg, 160]], when: () => runningAction(HeavyAzure),
  // "when Heavy Attack - Azure Sword Stance ends, Bated Breath is removed" — it closes on the very
  // cast that opened it, once that press is over
  afterAction: () => {
    if (runningAction(HeavyAzure)) revokeCurrent(BATED_BREATH);
  },
});

/** Streaming Storm: the same shape, but the window stays open across the whole Feather Heavy chain
 *  it starts — the Heavy itself, Feather Fall, and Havoc in Bloom — rather than closing on its own
 *  cast, so it is spent when Stage 3 ends instead. */
const STREAMING_STORM = new Buff({
  name: "Xuanling: Streaming Storm",
  duration: 60 * 15,
  stats: [[Stat.CritDmg, 160]], when: () => runningAnyOf(STORM_ACTIONS),
  afterAction: () => {
    if (runningAction(HiB3)) revokeCurrent(STREAMING_STORM);
  },
});

/** Windbound and what it becomes. Neither carries a stat: Windbound is a counter, and One with the
 *  Wind is spent by the next Sword Stance Flow for Feather Release's 6 stacks of Havoc Bane (see
 *  `FLOW` above, which is also what removes it). */
const WINDBOUND = new Buff({ name: "Xuanling: Windbound", maxStacks: 6 });
/** The 1s gates on a Windbound stack and a Feathered Oath stack — nameless, so no popover row. */
const WINDBOUND_ICD = new Buff({ duration: 60 });
const OATH_ICD = new Buff({ duration: 60 });
const ONE_WITH_THE_WIND = new Buff({ name: "Xuanling: One with the Wind" });

/** Feather Sword Stance, entered by either Feather Switch or Flow and left by either Azure one;
 *  without it she is in Azure, her default. Read only to pick which Intro plays. */
const FEATHER_STANCE = new Buff({ name: "Xuanling: Feather Sword Stance" });

/** Voice upon Voice: banked by the Liberation, spent by the next Sword Stance Flow for the Shadow
 *  of Xuanling summon. Does not stack, and no stat of its own. */
const VOICE_UPON_VOICE = new Buff({ 
  name: "Xuanling: Voice upon Voice" 
});

/** Tonal Switch (Outro Skill): 20s on every resonator in the team *but* her, and it pays out only
 *  once that resonator has inflicted Havoc Bane themselves — so the window is one buff and the
 *  payout another, granted on the turn they actually inflict. Held team-wide so it ticks on
 *  whoever is acting; the payout is local and is granted with whatever the window has left, so the
 *  two run out together rather than the payout outliving what it belongs to. */
const TONAL_SWITCH = new Buff({
  name: "Xuanling: Tonal Switch",
  duration: 60 * 20,
  // `onInflict` (`appliedByMe`): the amplification is that resonator's for inflicting it themselves,
  // and Chisa's Unseen Snare hands Havoc Bane out off whoever is hitting her marked target
  grants: [{
    on: both(onInflict(HAVOC_BANE), () => currentTeam().slot.resonator !== XUANLING_RESONATOR),
    buff: (): Buff => TONAL_SWITCH_AMP,
  }],
});
const TONAL_SWITCH_AMP = new Buff({
  name: "Xuanling: Outro",
  duration: () => leftOnTeam(TONAL_SWITCH) || 60 * 20,
  stats: [[Stat.Amp, 20, Attribute.Havoc]],
});

/* --------------------------------------------------------------------------------- sequences */

const isFlow = (): boolean => runningAction(FlowAzure) || runningAction(FlowFeather);

/** S1: a Shadow of Xuanling: Unfaltering off every Sword Stance Flow. Stagnation and the interrupt
 *  immunity are no stat. */
const XL_S1 = new Sequence({
  name: "Xuanling S1: At the Wind's Breath, the Blossoms Wake",
  updateBuffs: () => { if (isFlow()) queue(ShadowUnfaltering); },
});

/** Strung Notes (S2): one stack, spent by her first stance Basic for a Shadow of Xuanling. */
const STRUNG_NOTES = new Buff({
  name: "Xuanling S2: Strung Notes",
  updateBuffs: () => {
    if (!casting(Cast.Basic) || currentAction().node !== Node.Normal) return;
    revokeCurrent(STRUNG_NOTES);
    queue(ShadowStrungNotes);
  },
});
/** S2: +100% DMG on both Heavies, Feather Fall and Havoc in Bloom. The out-of-combat lines are
 *  taken once at the start of the fight: Strung Notes above and 2 Azure Plume (the cooldown reset
 *  has nothing to reset yet). The plume is banked, not pressed — this line opens no Heavy before
 *  the swap. */
const XL_S2 = new Sequence({
  name: "Xuanling S2: River Carries Her Song Away",
  combatStart: () => { applyCurrent(STRUNG_NOTES, 1); setForte2(2); },
  applyStats: () => { if (runningAnyOf(OATH_ACTIONS)) addStat(Stat.DmgBonus, 100); },
});

/** S3: the Liberation Amplified by 175%; the Intro and both Flows raise the target's Havoc Bane
 *  cap by 3 (20s, renewed every visit, and the engine takes one raise a source) — which is what
 *  the Liberation's raise-to-max then fills; and the extra stack on both Stage 4s and both
 *  Heavies is inside their own inflicts above. */
const XL_S3 = new Sequence({
  name: "Xuanling S3: My Grief Follows You into the Clouds",
  updateDebuffs: () => { if (runningAnyOf(INTROS) || isFlow()) maxStackIncrease(HAVOC_BANE, 3); },
  applyStats: () => { if (runningAction(Lib)) addStat(Stat.Amp, 175); },
});

/** S4: +20% ATK to the team for 20s off the Intro, either Switch or either Flow — granted on every
 *  visit's first cast and again mid-visit, so it never lapses between them. */
const A_LETTER_AND_MY_LONGING = new Buff({
  name: "Xuanling S4: Across the Miles, a Letter and My Longing",
  duration: 60 * 20,
  stats: [[Stat.BonusAtk, 20]],
});
const XL_S4 = new Sequence({
  name: "Xuanling S4: Across the Miles, a Letter and My Longing",
  updateBuffs: () => {
    if (runningAnyOf(INTROS) || runningAction(SwitchAzure) || runningAction(SwitchFeather) || isFlow()) applyTeam(A_LETTER_AND_MY_LONGING, 1);
  },
});

/** S5: a once-per-fight cheat death. No formula effect. */
const XL_S5 = new Sequence({ name: "Xuanling S5: Take Wing. Take Wing." });

/** Voice Flux (S6): the target takes 40% more Heavy Attack DMG from her, 30s off her own first Havoc
 *  Bane — permanent. */
const VOICE_FLUX = new Buff({
  name: "Xuanling S6: Voice Flux",
  duration: 60 * 30,
  stats: [[Stat.DamageTaken, 40, Type.Heavy]],
});
/** Still as Withered Wood (S6): five charges off a Sword Stance Flow, one spent whenever *anyone*
 *  on the team inflicts any of the six Negative Statuses while she is on field — hers, a teammate's,
 *  or a marker's, which is why this reads `anyNegativeStatusInflicted()` rather than her own share.
 *  Watched from hitGlobal so a teammate's hit reaches it; "me" there is her, so `isActive()` is
 *  the "if Yangyang: Xuanling is on the field" the node asks for and the Shadow is queued onto her
 *  by name. A Shadow comes at most once a second (`WITHERED_WOOD_ICD`). */
const WITHERED_WOOD = new Buff({
  name: "Xuanling S6: Still as Withered Wood", maxStacks: 5, duration: 60 * 30,
  hitGlobal: () => {
    // never off its own Shadow's damage: a marker that re-inflicts on whatever hits the target
    // (Chisa's Thread of Bane) would otherwise have each summon trigger the next until the charges
    // ran out, which is the runaway the node's own 1s limiter stops in game
    // `triggeredAction()`, the row's own flag: a queued follow-up like the Pavilion's Blades is one,
    // so it never spends a charge off each Blade
    if (!isActive() || isHeld(WITHERED_WOOD_ICD) || runningAction(ShadowWitheredWood) || !anyNegativeStatusInflicted() || triggeredAction()) return;
    applyCurrent(WITHERED_WOOD_ICD, 1);
    removeStack(WITHERED_WOOD, 1);
    queueOn(XUANLING_RESONATOR, ShadowWitheredWood);
  },
});
/** The window's own 25s cooldown, from the Flow that opens it, and the Shadow's 1s gate. No
 *  `name`: a cooldown is not a buff she holds. */
const WITHERED_WOOD_CD = new Buff({ duration: 60 * 25 });
const WITHERED_WOOD_ICD = new Buff({ duration: 60 });
const XL_S6 = new Sequence({
  name: "Xuanling S6: Let the Azure Keep Its Light",
  // her own Havoc Bane, read as the action's own inflict — Chisa's marker re-sources it onto
  // herself, which `appliedByMe()` (`onInflict`) would then read as nobody's
  grants: [{ on: onApplied(HAVOC_BANE), buff: VOICE_FLUX }],
  // opened after the window above has had its look at this hit, so the Flow that opens it never
  // spends a charge on its own Feather Release
  afterAction: () => {
    if (isFlow() && !isHeld(WITHERED_WOOD_CD)) {
      applyCurrent(WITHERED_WOOD, 5);
      applyCurrent(WITHERED_WOOD_CD, 1);
    }
  },
  applyStats: () => { if (runningAction(ShadowWitheredWood)) addStat(Stat.CritRate, 100); },
});

const XL_SEQUENCES = [XL_S1, XL_S2, XL_S3, XL_S4, XL_S5, XL_S6];

/* --------------------------------------------------------------------------- kit and loadout */

/** Unbroken Vow (Inherent Skill): 10% amplification a stack up to 3, 12% a stack — capped, so a
 *  flat 36% — from 4 to 6. Only ever her own damage, which is what holding it locally already
 *  means. The count is read live rather than frozen: the stacks a cast lands are on the target by
 *  the time it hits, which is the same "on hit" the Liberation's own raise-to-max is written as. */
const XUANLING_INHERENT_1 = new Inherent({
  name: "Inherent: Unbroken Vow",
  applyStats: () => {
    const bane = stacksOfEnemy(HAVOC_BANE);
    if (bane === 0) return;
    addStat(Stat.Amp, bane <= 3 ? 10 * bane : 30 + 12 * Math.min(6, bane - 3));
  },
});

/** One Life, One Blade (Inherent Skill), the Windbound half — its other line rides on the
 *  Liberation itself. From `hitGlobal`, so a teammate's own hit is seen; that runs with the
 *  "current" slot already pointed at her, so every read and grant below is hers. */
const XUANLING_INHERENT_2 = new Inherent({
  name: "Inherent: One Life, One Blade",
  hitGlobal: () => {
    if (isHeld(WINDBOUND_ICD) || !applied(HAVOC_BANE) || isHeld(ONE_WITH_THE_WIND)) return;
    applyCurrent(WINDBOUND_ICD, 1);
    if (applyCurrent(WINDBOUND, 1) < 6) return;
    revokeCurrent(WINDBOUND);
    applyCurrent(ONE_WITH_THE_WIND, 1);
  },
});

const XUANLING_TALENTS = new Talent({
  name: "Xuanling: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

export const XUANLING_RESONATOR = new Resonator({
  name: "Xuanling",
  stats: [[Stat.BaseHp, 11025], [Stat.BaseAtk, 425], [Stat.BaseDef, 1148.8868]],
  talent: XUANLING_TALENTS,
  inherent1: XUANLING_INHERENT_1,
  inherent2: XUANLING_INHERENT_2,
  element: Attribute.Havoc,
  weapon: WeaponType.Sword,
  color: "#6140e5",
  // resolved when its row is reached: the Skybound Feather of the stance she left in
  intro: new Action("Intro Resolver", { cast: Cast.Intro, resolve: () => (isHeld(FEATHER_STANCE) ? IntroFeather : IntroAzure) }),
  maxEnergy: 12500,
  forteScale: [0.01, 1, 1, 1, 1],
  maxForte1: 10000,
  maxForte2: 2,

  /* Feathered Oath is Forte Circuit machinery, which lives on the Resonator rather than a loadout
   * slot of its own. Same trigger as Windbound above and the same `hitGlobal` reason: it counts
   * Havoc Bane inflicted by anyone on the team, her own casts included. */
  hitGlobal: () => {
    if (isHeld(OATH_ICD) || !applied(HAVOC_BANE)) return;
    applyCurrent(OATH_ICD, 1);
    applyCurrent(FEATHERED_OATH, 1);
  },

  /* Melody starts a fight full, unlike every other gauge in this engine. */
  combatStart: () => setForte1(10000),

  applyStats: () => {
    if (currentAction().node === Node.Normal && forte1() > 0) addStat(Stat.ER, 20);
  },

});

/* ---------------------------------------------------------------------------------- rotation */

const BA_F1234 = new ActionGroup("Basic - Feather Sword Stance 1234", [BA_F1, BA_F2, BA_F3, BA_F4]);
const BA_A1234 = new ActionGroup("Basic - Azure Sword Stance 1234", [BA_A1, BA_A2, BA_A3, BA_A4]);
const HiB123 = new ActionGroup("Forte Basic: Havoc in Bloom 123", [HiB1, HiB2, HiB3]);

/** One visit, in gauge order. The Intro banks a plume, the Azure chain spends the whole Melody
 *  bar, and Sword Stance Flow: Feather refills it and takes the plume to 2 — which opens the
 *  Feather Heavy, and with it Streaming Storm, Feather Fall, Hark the Wind and the Havoc in Bloom
 *  chain, the largest run of Heavy Attack DMG she has. The Liberation then spends the refilled
 *  Melody and banks the next plume, Sword Stance Flow: Azure tops it back to 2 and cashes Voice
 *  upon Voice for the Shadow, and the Azure Heavy spends it on the way out with Bated Breath up.
 *  The echo goes in early rather than at the exit: its four Blades of Thousand Memories are spent
 *  one per Havoc Bane she inflicts, and the four casts that inflict one all come after it. She is
 *  always the team's main DPS, so this covers the loop and there is no opener chain. */
const XUANLING_ROTATION = new Rotation([
  START_LAST, SwitchFeather.instaSwap(), // start in feather stance, so the first cast is a switch to Azure

  INTRO_LAST, BA_F1234.cancel(), FlowAzure.holdCancel(), HeavyAzure.cancel(),
  Lib, FlowFeather.cancel(), ECHO, HeavyFeather, FeatherFall, HiB123.swapCancel(),
  Outro,
]);

const XUANLING_ROTATION_S1 = new Rotation([
  START_LAST, HeavyAzure, SwitchFeather.instaSwap(), // start in feather stance, so the first cast is a switch to Azure

  INTRO_LAST, BA_F1234.cancel(), FlowAzure.holdCancel(), HeavyAzure.cancel(),
  Lib, FlowFeather.cancel(), ECHO, HeavyFeather, FeatherFall, HiB123.swapCancel(),
  Outro,
]);

const XUANLING_ECHOES = [
  new EchoLoadout(THOUSAND_PUPPET_PAVILION, FEATHERED_TRACE_5PC),
];

export const XUANLING = new Loadout({
  resonator: XUANLING_RESONATOR,
  weapons: [AZURE_OATH, EMERALD_OF_GENESIS, EMERALD_SENTENCE],
  echoLoadouts: XUANLING_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Heavy, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Heavy, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  rotation: { 0: XUANLING_ROTATION, 1: XUANLING_ROTATION_S1 },
  sequences: XL_SEQUENCES,
});
