/**
 * Cartethyia, ported to the new engine — a limited 5-star aero Sword main DPS who scales off Max
 * HP, and the only kit here with two forms of her own rather than a mode toggle.
 *
 * As Cartethyia she plants Sword Shadows: Basic Attack Stage 4 leaves a Sword of Divinity's
 * Shadow, her Heavy Attack and Intro a Sword of Discord's Shadow, her Resonance Skill a Sword of
 * Virtue's Shadow (one of each at a time, 20s). A Mid-air Attack recalls every shadow standing,
 * which both picks the Plunging Attack's own form — one, two or three shadows recalled, four
 * separate motion values — and converts each shadow into its Heart: Virtue, Mandate of Divinity,
 * Power of Discord. The rotation below plants all three before it plunges, so the three-shadow
 * plunge is the one it names; the other forms are declared beside it and unused, same as any kit's
 * off-line moves.
 *
 * Resonance Liberation - A Knight's Heartfelt Prayers spends the bar to become Fleurdelys for 12s
 * (Manifest), and every Fleurdelys press banks Conviction (forte1, 0-120). At 120 the Liberation
 * becomes Blade of Howling Squall, which spends the Conviction, ends Manifest and strips the
 * target's Aero Erosion — each stack removed amplifying that very hit 20%, five stacks' worth at
 * most. The HP cost (half her Max HP, a quarter at S5) never reaches the formula: every motion
 * value here reads Max HP, not current.
 *
 * The three Hearts, held from the plunge until Manifest ends:
 *  - Heart of Virtue is a force field and interruption resistance, so it carries no stat.
 *  - Mandate of Divinity amplifies Aero Erosion DMG 50% and halves its tick interval — the second
 *    half is real here, since Aero Erosion runs on a clock now (shared/status.ts): a second of
 *    hers advances the target's own half-second clock twice over.
 *  - Power of Discord levels the Aero Erosion stacks across nearby targets, which is nothing
 *    against the single target this calculator fights.
 *
 * MVs from nanoka.cc (character 1409) at skill level 10, cross-checked hit for hit against
 * wuwalab's own frame data, which is where energy, per-hit Concerto, off-tune and Conviction come
 * from — nanoka publishes none of those four for her beyond the flat Concerto Regen rows, which
 * agree. Her Fleurdelys-form Intro (Sword to Call for Freedom) is the one gap: its text says it
 * restores Conviction and neither source gives a number, so it carries none. Nothing casts it —
 * the loop always leaves Manifest on the Blade — so no number here depends on it.
 */
import { Tier, Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addStat,
  appliedByMember,
  applyCurrent,
  applyEnemy,
  applyOthers,
  applyTeam,
  casting,
  currentAction,
  runningAction,
  currentMember,
  currentTeam,
  forte1,
  isHeld,
  maxStackIncrease,
  queue,
  removeStackEnemy,
  revokeCurrent,
  revokeEnemy,
  revokeTeam,
  setStacksSelf,
  stacksOf,
  stacksOfEnemy,
  isActive,
  reduceCooldown,
} from "../../engine/context.js";
import { Action, Rotation, ECHO, ActionGroup, INTRO } from "../../engine/rotation.js";
import { tuneBreak, SWORD_BREAK, BROADBLADE_BREAK } from "../../shared/tunebreak.js";
import {
  AERO_EROSION, AERO_EROSION_ACTIONS, hasNegativeStatus, inflictedNegativeStatusBy, negativeStatusRung,
  EROSION_HASTE,
} from "../../shared/status.js";
import { DEFIERS_THORN, RED_SPRING } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { FLEURDELYS, WINDWARD_5PC } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function cartethyiaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Hp, ...def });
}

/** Aero Erosion this cast puts on the target, declared where the kit text puts it. */
const erosion = (n: number) => ({ updateDebuffs: () => applyEnemy(AERO_EROSION, n) });

/** "Instantly trigger 1 instance of Aero Erosion DMG and reduce the stack by 1" — Fleurdelys's
 *  Basic Stage 5, Mid-air Stage 2 and May Tempest Break the Tides. Once the hit is in, so S6's
 *  at-cap check still sees what it inflicted: the rung fires at that count, then the stack goes. */
const EROSION_BURST = {
  afterAction: () => {
    const rung = negativeStatusRung(AERO_EROSION_ACTIONS, stacksOfEnemy(AERO_EROSION));
    if (!rung) return;
    queue(rung);
    removeStackEnemy(AERO_EROSION, 1);
  },
};

// --- Cartethyia: basics, heavy, dodge counter (Sword to Carve My Forms). Stage 4 lays the Aero
//     Erosion and the Sword of Divinity's Shadow; the Heavy is considered Basic Attack DMG.
const BA1 = cartethyiaAction("Basic - Sword to Carve My Forms 1", { animFrames: 20, commitFrames: 13, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 13, mv: 4.78, energy: 0.7, concerto: 0.98, offtune: 2240 }]});
const BA2 = cartethyiaAction("Basic - Sword to Carve My Forms 2", { animFrames: 49, commitFrames: 39, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 20, mv: 3.94, energy: 0.58, concerto: 0.81, offtune: 1844 },
    { at: 30, mv: 3.94, energy: 0.58, concerto: 0.81, offtune: 1844 },
    { at: 39, mv: 5.25, energy: 0.77, concerto: 1.08, offtune: 2458 },
  ]});
const BA3 = cartethyiaAction("Basic - Sword to Carve My Forms 3", { animFrames: 60, commitFrames: 44, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 8, mv: 4.28, energy: 0.63, concerto: 0.88, offtune: 2004 },
    { at: 20, mv: 4.28, energy: 0.63, concerto: 0.88, offtune: 2004 },
    { at: 32, mv: 4.28, energy: 0.63, concerto: 0.88, offtune: 2004 },
    { at: 44, mv: 4.28, energy: 0.63, concerto: 0.88, offtune: 2004 },
  ]});
const BA4 = cartethyiaAction("Basic - Sword to Carve My Forms 4", {
  animFrames: 62, commitFrames: 11,
  node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 17, mv: 2.52, energy: 0.37, concerto: 0.52, offtune: 1179, ...erosion(1) },
    { at: 24, mv: 2.52, energy: 0.37, concerto: 0.52, offtune: 1179 },
    { at: 31, mv: 2.52, energy: 0.37, concerto: 0.52, offtune: 1179 },
    { at: 41, mv: 7.54, energy: 1.11, concerto: 1.55, offtune: 3536 },
  ],
  updateBuffs: () => applyCurrent(SWORD_OF_DIVINITY, 1),
});
const DC = cartethyiaAction("Dodge Counter - Sword to Carve My Forms", { animFrames: 60, commitFrames: 44, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 8, mv: 6.85, energy: 0.63, concerto: 1.41, offtune: 2004 },
    { at: 20, mv: 6.85, energy: 0.63, concerto: 1.41, offtune: 2004 },
    { at: 32, mv: 6.85, energy: 0.63, concerto: 1.41, offtune: 2004 },
    { at: 44, mv: 6.85, energy: 0.63, concerto: 1.41, offtune: 2004 },
  ]});
const HA = cartethyiaAction("Heavy - Sword to Carve My Forms", {
  animFrames: 65, commitFrames: 29,
  node: Node.Normal, cast: Cast.Heavy, type: Type.Basic, hits: [
    { at: 29, mv: 2.08, energy: 0.42, concerto: 0.59, offtune: 1334 },
    { at: 36, mv: 2.08, energy: 0.42, concerto: 0.59, offtune: 1334 },
    { at: 43, mv: 2.08, energy: 0.42, concerto: 0.59, offtune: 1334 },
    { at: 56, mv: 6.24, energy: 1.25, concerto: 1.75, offtune: 4000 },
  ],
  updateBuffs: () => applyCurrent(SWORD_OF_DISCORD, 1),
});
const BA234 = new ActionGroup("Basic - Sword to Carve My Forms 234", [BA2, BA3, BA4]);

// --- the Plunging Attack, one form per shadow count. Considered Aero Erosion DMG in its own
//     right (`subtype`), so every Aero Erosion amplification on the team pays into it.
const RECALL = {
  updateBuffs: () => {
    // S2: each Sword Shadow recalled takes 1s off Sword to Bear Their Names
    const recalled = [SWORD_OF_VIRTUE, SWORD_OF_DIVINITY, SWORD_OF_DISCORD].filter((s) => isHeld(s)).length;
    if (isHeld(CT_S2) && recalled) reduceCooldown(Skill, 60 * recalled);
    if (isHeld(SWORD_OF_VIRTUE)) { revokeCurrent(SWORD_OF_VIRTUE); applyCurrent(HEART_OF_VIRTUE, 1); }
    if (isHeld(SWORD_OF_DIVINITY)) { revokeCurrent(SWORD_OF_DIVINITY); applyCurrent(MANDATE_OF_DIVINITY, 1); }
    if (isHeld(SWORD_OF_DISCORD)) { revokeCurrent(SWORD_OF_DISCORD); applyCurrent(POWER_OF_DISCORD, 1); }
  },
};
const PLUNGE = { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, subtype: Subtype.AeroErosion, offtune: 4248, ...RECALL };
const Plunge = cartethyiaAction("Mid-air - Plunging Attack", { animFrames: 45, commitFrames: 35, ...PLUNGE, hits: [{ at: 32, mv: 5.65, energy: 1.33, concerto: 1.86, offtune: 4248 }]});
const Plunge1 = cartethyiaAction("Mid-air - Plunging Attack (1 Sword Shadow)", { animFrames: 45, commitFrames: 35, ...PLUNGE, hits: [{ at: 32, mv: 5.65, energy: 1.33, concerto: 1.86, offtune: 4248 }]});
const Plunge2 = cartethyiaAction("Mid-air - Plunging Attack (2 Sword Shadows)", { animFrames: 51, commitFrames: 42, ...PLUNGE, hits: [
    { at: 33, mv: 3.3, energy: 0.45, concerto: 0.62, offtune: 1416 },
    { at: 41, mv: 3.3, energy: 0.45, concerto: 0.62, offtune: 1416 },
    { at: 48, mv: 3.3, energy: 0.45, concerto: 0.62, offtune: 1416 },
  ]});
const Plunge3 = cartethyiaAction("Mid-air - Plunging Attack (3 Sword Shadows)", { animFrames: 51, commitFrames: 43, ...PLUNGE, hits: [
    { at: 32, mv: 11.29, energy: 0.45, concerto: 0.62, offtune: 1416 },
    { at: 42, mv: 11.29, energy: 0.45, concerto: 0.62, offtune: 1416 },
    { at: 52, mv: 11.29, energy: 0.45, concerto: 0.62, offtune: 1416 },
  ]});



// --- Cartethyia: skill and intro, both considered their own DMG and both laying 2 Aero Erosion
const Skill = cartethyiaAction("Skill - Sword to Bear Their Names", {
  animFrames: 61, commitFrames: 4, cooldown: 60 * 14,
  node: Node.Skill, cast: Cast.Skill, type: Type.Basic, hits: [
    { at: 4, mv: 6.89, energy: 3.8, offtune: 1680, ...erosion(2) },
    { at: 13, mv: 6.89, energy: 3.8, offtune: 1680 },
    { at: 22, mv: 6.89, energy: 3.8, offtune: 1680 },
    { at: 40, mv: 8.86, energy: 4.88, offtune: 2160 },
  ], castConcerto: 10,
  updateBuffs: () => applyCurrent(SWORD_OF_VIRTUE, 1),
});
const Intro = cartethyiaAction("Intro - Sword to Mark Tide's Trace", {
  animFrames: 56, commitFrames: 56, motionStop: 29,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 35, mv: 2.08, energy: 1.67, offtune: 1168, ...erosion(2) },
    { at: 47, mv: 2.08, energy: 1.67, offtune: 1168 },
    { at: 59, mv: 2.08, energy: 1.67, offtune: 1168 },
    { at: 65, mv: 6.24, energy: 5, offtune: 3504 },
  ], castConcerto: 10,
  updateBuffs: () => { revokeTeam(WINDS_DIVINE_BLESSING); applyCurrent(SWORD_OF_DISCORD, 1); },
});

// --- Fleurdelys (the Tempest forte circuit): every press banks Conviction, nothing spends it but
//     the Blade. Her Heavy and Enhanced Heavy are considered Basic Attack DMG.
const FBA1 = cartethyiaAction("Basic - Tempest 1", { animFrames: 21, commitFrames: 16, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 16, mv: 6.49, energy: 0.75, concerto: 1.05, offtune: 2400, forte1: 4 }]});
const FBA2 = cartethyiaAction("Basic - Tempest 2", { animFrames: 55, commitFrames: 43, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 16, mv: 3.63, energy: 0.77, concerto: 1.07, offtune: 2439 },
    { at: 43, mv: 1.82, energy: 0.39, concerto: 0.54, offtune: 1220 },
    { at: 49, mv: 1.82, energy: 0.39, concerto: 0.54, offtune: 1220 },
    { at: 55, mv: 1.82, energy: 0.39, concerto: 0.54, offtune: 1220, forte1: 14 },
  ]});
const FBA3 = cartethyiaAction("Basic - Tempest 3", { animFrames: 59, commitFrames: 46, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 20, mv: 2.13, energy: 0.45, concerto: 0.63, offtune: 1440 },
    { at: 26, mv: 2.13, energy: 0.45, concerto: 0.63, offtune: 1440 },
    { at: 30, mv: 2.13, energy: 0.45, concerto: 0.63, offtune: 1440 },
    { at: 46, mv: 4.26, energy: 0.9, concerto: 1.26, offtune: 2880, forte1: 14 },
  ]});
const FBA4 = cartethyiaAction("Basic - Tempest 4", { animFrames: 60, commitFrames: 10, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 22, mv: 2.74, energy: 0.45, concerto: 0.63, offtune: 1440 },
    { at: 31, mv: 2.74, energy: 0.45, concerto: 0.63, offtune: 1440 },
    { at: 40, mv: 2.74, energy: 0.45, concerto: 0.63, offtune: 1440 },
    { at: 49, mv: 2.74, energy: 0.45, concerto: 0.63, offtune: 1440 },
    { at: 58, mv: 2.74, energy: 0.45, concerto: 0.63, offtune: 1440, forte1: 10 },
  ]});
const FBA5 = cartethyiaAction("Basic - Tempest 5", { animFrames: 50, commitFrames: 24, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 24, mv: 7.2, energy: 0.4, concerto: 0.56, offtune: 1268, updateDebuffs: () => fleurdelysErosion() },
    { at: 58, mv: 28.8, energy: 1.59, concerto: 2.22, offtune: 5069, forte1: 20 },
  ], ...EROSION_BURST });
const FDC = cartethyiaAction("Dodge Counter - Tempest", { animFrames: 61, commitFrames: 51, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 20, mv: 3.2, energy: 0.45, concerto: 0.63, offtune: 1440 },
    { at: 28, mv: 3.2, energy: 0.45, concerto: 0.63, offtune: 1440 },
    { at: 33, mv: 3.2, energy: 0.45, concerto: 0.63, offtune: 1440 },
    { at: 51, mv: 6.39, energy: 0.9, concerto: 1.26, offtune: 2880, forte1: 14 },
  ]});
const UpwardCut = cartethyiaAction("Basic - Tempest Upward Cut", { animFrames: 39, commitFrames: 24, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 24, mv: 4.54, energy: 0.76, concerto: 1.06, offtune: 2420 },
    { at: 32, mv: 4.54, energy: 0.76, concerto: 1.06, offtune: 2420, forte1: 8 },
  ]});
const FMA1 = cartethyiaAction("Mid-air - Tempest 1", { animFrames: 48, commitFrames: 37, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 11, mv: 2.99, energy: 0.66, concerto: 0.93, offtune: 2107 },
    { at: 23, mv: 2.99, energy: 0.66, concerto: 0.93, offtune: 2107 },
    { at: 37, mv: 3.08, energy: 0.68, concerto: 0.95, offtune: 2171, forte1: 6 },
  ]});
const FMA2 = cartethyiaAction("Mid-air - Tempest 2", { animFrames: 71, commitFrames: 53, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 16, mv: 7.39, energy: 0.52, concerto: 0.72, offtune: 1644, updateDebuffs: () => fleurdelysErosion() },
    { at: 25, mv: 7.39, energy: 0.52, concerto: 0.72, offtune: 1644 },
    { at: 53, mv: 14.77, energy: 1.03, concerto: 1.44, offtune: 3288, forte1: 15 },
  ], ...EROSION_BURST });
const FMA3 = cartethyiaAction("Mid-air - Tempest 3", { animFrames: 48, commitFrames: 38, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 38, mv: 2.2, energy: 0.48, concerto: 0.67, offtune: 1528, forte1: 10 }]});
const FHA = cartethyiaAction("Heavy - Tempest", { animFrames: 67, commitFrames: 37, node: Node.Forte, cast: Cast.Heavy, type: Type.Basic, hits: [
    { at: 37, mv: 5.7, energy: 0.704, concerto: 0.9825, offtune: 2246.8 },
    { at: 44, mv: 5.7, energy: 0.704, concerto: 0.9825, offtune: 2246.8 },
    { at: 51, mv: 2.85, energy: 0.352, concerto: 0.495, offtune: 1123.4, forte1: 8 },
  ]});
const FEHA = cartethyiaAction("Heavy - Tempest (Enhanced)", { node: Node.Forte, cast: Cast.Heavy, type: Type.Basic, mv: 19.45, energy: 2.40, concerto: 3.38, offtune: 7665, forte1: 24, updateDebuffs: () => fleurdelysErosion() });
const FSkill1 = cartethyiaAction("Skill - Sword to Answer Waves' Call", { animFrames: 69, commitFrames: 54, cooldown: 60 * 14, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 5, mv: 1.86, energy: 0.18, offtune: 551 },
    { at: 11, mv: 1.86, energy: 0.18, offtune: 551 },
    { at: 17, mv: 1.86, energy: 0.18, offtune: 551 },
    { at: 23, mv: 1.86, energy: 0.18, offtune: 551 },
    { at: 54, mv: 17.36, energy: 1.61, offtune: 5136, forte1: 8 },
  ], castConcerto: 10});
const FSkill2 = cartethyiaAction("Skill - May Tempest Break the Tides", { animFrames: 101, commitFrames: 50, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 50, mv: 1.86, energy: 0.66, offtune: 551, updateDebuffs: () => fleurdelysErosion() },
    { at: 56, mv: 1.86, energy: 0.66, offtune: 551 },
    { at: 80, mv: 7.03, energy: 2.5, offtune: 2079 },
    { at: 86, mv: 7.03, energy: 2.5, offtune: 2079 },
    { at: 92, mv: 7.03, energy: 2.5, offtune: 2079, forte1: 28 },
  ], castConcerto: 10, ...EROSION_BURST });
/** Her Intro in Fleurdelys form — reached only by swapping out mid-Manifest and back in, which
 *  this loop never does. Conviction unknown (see the file header), so it banks none. */
const FIntro = cartethyiaAction("Intro - Sword to Call for Freedom", {
  animFrames: 71, commitFrames: 71, motionStop: 43,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [{ at: 48, mv: 4.28, energy: 0.53, offtune: 1685 }, { at: 61, mv: 9.97, energy: 1.23, offtune: 3932 }], castConcerto: 10,
  updateBuffs: () => revokeTeam(WINDS_DIVINE_BLESSING),
});


const FBA345 = new ActionGroup("Basic - Tempest 345", [FBA3, FBA4, FBA5]);
const FBA12345 = new ActionGroup("Basic - Tempest 12345", [FBA1, FBA2, FBA3, FBA4, FBA5]);

// --- the two Liberations: the transform, then the Blade once Conviction is full
const Liberation = cartethyiaAction("Liberation - A Knight's Heartfelt Prayers", {
  animFrames: 198, commitFrames: 198, timestop: 198, motionStop: 198, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, mv: 0, castConcerto: 20, resetEnergy: true,
  updateBuffs: () => applyCurrent(MANIFEST, 1),
});
/** Blade of Howling Squall: spends every Conviction, ends Manifest, and strips the target's Aero
 *  Erosion — 20% amplification on this one hit per stack taken, five at most. The strip waits for
 *  `afterAction` so the hit itself still reads the count it is paid for. */
const Lib2 = cartethyiaAction("Liberation - Blade of Howling Squall", {
  animFrames: 301, commitFrames: 301, timestop: 301, motionStop: 301, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, hits: [
    { at: 253, mv: 13.12, offtune: 24000 },
    { at: 263, mv: 13.12, offtune: 24000 },
    { at: 273, mv: 13.12, offtune: 24000 },
    { at: 284, mv: 13.12, offtune: 24000 },
    { at: 294, mv: 13.12, offtune: 24000 },
    { at: 304, mv: 13.12, offtune: 24000 },
    { at: 314, mv: 13.12, offtune: 24000 },
  ], castConcerto: 20, castForte1: -120,
  // S6 stops the strip but not the payout: the amplification still reads what the target holds
  applyStats: () => addStat(Stat.Amp, 20 * Math.min(5, stacksOfEnemy(AERO_EROSION))),
  updateBuffs: () => {
    revokeCurrent(MANIFEST); revokeCurrent(HEART_OF_VIRTUE);
    revokeCurrent(MANDATE_OF_DIVINITY); revokeCurrent(POWER_OF_DISCORD);
    revokeEnemy(EROSION_HASTE);
  },
  afterAction: () => {
    if (isHeld(CT_S6)) applyEnemy(AERO_EROSION, currentTeam().enemyMax(AERO_EROSION));
    else revokeEnemy(AERO_EROSION);
  },
});
const Outro = cartethyiaAction("Outro - Wind's Divine Blessing", {
  animFrames: 0, commitFrames: 0,
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => applyTeam(WINDS_DIVINE_BLESSING, 1),
});

/* ------------------------------------------------------------------------------------ buffs */

/** The three Sword Shadows, one of each at a time — pure markers, spent by the Plunging Attack
 *  that recalls them (see `RECALL` above). */
const SWORD_OF_DIVINITY = new Buff({ name: "Cartethyia: Sword of Divinity's Shadow", duration: 60 * 20 });
const SWORD_OF_DISCORD = new Buff({ name: "Cartethyia: Sword of Discord's Shadow", duration: 60 * 20 });
const SWORD_OF_VIRTUE = new Buff({ name: "Cartethyia: Sword of Virtue's Shadow", duration: 60 * 20 });

/** Manifest: 12s as Fleurdelys, opened by A Knight's Heartfelt Prayers and closed by the Blade.
 *  It survives a swap on purpose — that is what her Fleurdelys-form Intro is for. No stat of its
 *  own; S6 is what reads it. */
const MANIFEST = new Buff({ name: "Cartethyia: Manifest", duration: 60 * 12 });

/** Heart of Virtue: a force field and interruption resistance, so nothing the formula reads. */
const HEART_OF_VIRTUE = new Buff({ name: "Cartethyia: Heart of Virtue" });

/** Mandate of Divinity: +50% Aero Erosion DMG Amplification, and the status's own tick interval
 *  halved for as long as she is the one on field — a marker on the target (shared/status.ts's
 *  EROSION_HASTE) that her presses keep up and her swap-out takes down. */
const MANDATE_OF_DIVINITY = new Buff({
  name: "Cartethyia: Mandate of Divinity",
  stats: [[Stat.Amp, 50, Subtype.AeroErosion]],
  updateBuffs: () => {
    if (currentAction().swapOut) revokeEnemy(EROSION_HASTE);
    else applyEnemy(EROSION_HASTE, 1);
  },
});

/** Power of Discord: levels the Aero Erosion stacks across every nearby target, which is nothing
 *  against the one target this calculator fights. Held for the name. */
const POWER_OF_DISCORD = new Buff({ name: "Cartethyia: Power of Discord" });

/** A Heart's Truest Wishes (Inherent Skill): +20% Healing Received for every Resonator but her —
 *  unused by the formula, healing being out of scope — and 25 Windstrings to Rover: Aero on his
 *  own Omega Storm. `applyOthers` from her own updateGlobal is that "everyone but her" exactly:
 *  the hook runs on every action with the pointers on her, so the grant lands on the other two.
 *  Rover is read by name, the way the Fleurdelys echo reads him, rather than by importing his
 *  module. */
const TRUEST_WISHES = new Buff({
  name: "Inherent: A Heart's Truest Wishes",
  stats: [[Stat.HealingReceived, 20]],
  applyStats: () => {
    if (casting(Cast.Liberation) && currentMember().resonator?.name === "Aero Rover") addStat(Stat.AddCastForte1, 25);
  },
});
const CT_INHERENT_1 = new Inherent({
  name: "Inherent: A Heart's Truest Wishes",
  updateGlobal: () => applyOthers(TRUEST_WISHES, 1),
});

/** Wind's Indelible Imprint (Inherent Skill): the target takes 30% more DMG from her while it
 *  holds 1-3 Aero Erosion, and another 10% a stack past the third, three of those at most. Her
 *  own gear, so it pays on her turns alone. */
const CT_INHERENT_2 = new Inherent({
  name: "Inherent: Wind's Indelible Imprint",
  applyStats: () => {
    const held = stacksOfEnemy(AERO_EROSION);
    if (held < 1) return;
    addStat(Stat.Amp, 30 + 10 * Math.min(3, Math.max(0, held - 3)));
  },
});

/** Wind's Divine Blessing (Outro): +17.5% Aero DMG Amplification for 20s to whoever is active —
 *  never her, and only into a target already carrying a Negative Status. 20s, so it is lost on
 *  her own next Intro (both of them revoke it). */
const WINDS_DIVINE_BLESSING = new Buff({
  name: "Cartethyia: Outro",
  duration: 60 * 20,
  applyStats: () => {
    if (!isActive() || isHeld(CARTETHYIA_RESONATOR) || !hasNegativeStatus()) return;
    addStat(Stat.Amp, 17.5, Attribute.Aero);
  },
});

/* -------------------------------------------------------------------------------- sequences */

/** S1: Crit. DMG +25% each time Conviction reaches 30/60/90/120, four stacks, gone once the Blade
 *  is cast. The Zeal half needs a defeated enemy, which this fight never has. */
const CROWN_OF_FATE = new Buff({
  name: "Cartethyia S1: Crown Destined by Fate", maxStacks: 4, duration: 60 * 15,
  applyStats: () => addStat(Stat.CritDmg, 25 * stacksOf(CROWN_OF_FATE)),
});
const CT_S1 = new Sequence({
  name: "Cartethyia S1: Crown Destined by Fate",
  // afterAction is the one phase that sees Conviction as the cast actually left it
  afterAction: () => {
    if (runningAction(Lib2)) { revokeCurrent(CROWN_OF_FATE); return; }
    const rungs = Math.min(4, Math.floor(forte1() / 30));
    if (rungs > stacksOf(CROWN_OF_FATE)) setStacksSelf(CROWN_OF_FATE, rungs);
  },
});

/** S2: the Liberation raises the Aero Erosion cap 3 and arms one attack that lays 3 stacks and
 *  fires an Aero Erosion instance without spending any; Cartethyia's own Basic, Heavy, Dodge
 *  Counter and Intro hit 50% harder, her Mid-air 200%. Her Fleurdelys presses (`Node.Forte`) are
 *  not hers for this. */
const BROKEN_BLADE = new Buff({
  name: "Cartethyia S2: Blade Broken by Tempest",
  updateDebuffs: () => {
    if (!currentAction().hits.length) return;
    applyEnemy(AERO_EROSION, 3);
    const rung = negativeStatusRung(AERO_EROSION_ACTIONS, stacksOfEnemy(AERO_EROSION));
    if (rung) queue(rung);
    revokeCurrent(BROKEN_BLADE);
  },
});
const CT_S2 = new Sequence({
  name: "Cartethyia S2: Blade Broken by Tempest",
  updateBuffs: () => {
    if (!runningAction(Liberation)) return;
    maxStackIncrease(AERO_EROSION, 3);
    applyCurrent(BROKEN_BLADE, 1);
  },
  applyStats: () => {
    const a = currentAction();
    if (a.node === Node.Forte) return;
    if (runningAction(Plunge) || runningAction(Plunge1) || runningAction(Plunge2) || runningAction(Plunge3)) addStat(Stat.MulMv, 200);
    else if (casting(Cast.Basic) || casting(Cast.Heavy) || casting(Cast.DodgeCounter) || casting(Cast.Intro)) addStat(Stat.MulMv, 50);
  },
});

/** S3: the four Fleurdelys casts that already burst Aero Erosion now lay 2 stacks of it first
 *  (their first hits, `fleurdelysErosion()`), and the Blade's own multiplier doubles. */
const CT_S3 = new Sequence({
  name: "Cartethyia S3: Prisoner Hanged in the Tower",
  applyStats: () => { if (runningAction(Lib2)) addStat(Stat.MulMv, 100); },
});
function fleurdelysErosion(): void {
  if (isHeld(CT_S3)) applyEnemy(AERO_EROSION, 2);
}

/** S4: anyone on the team inflicting a Negative Status hands the whole team +20% DMG Bonus for
 *  20s — permanent uptime in practice, since her own line lays Aero Erosion every visit. */
const SACRIFICE = new Buff({
  name: "Cartethyia S4: Sacrifice Made for Salvation",
  duration: 60 * 20,
  stats: [[Stat.DmgBonus, 20]],
});
const CT_S4 = new Sequence({
  name: "Cartethyia S4: Sacrifice Made for Salvation",
  // from hitGlobal "me" is the holder, so the acting slot has to be named (status.ts)
  hitGlobal: () => { if (inflictedNegativeStatusBy(currentTeam().slot)) applyTeam(SACRIFICE, 1); },
});

/** S5: a once-per-10-minutes death save and a cheaper Liberation HP cost — neither reaches the
 *  formula, since her motion values read Max HP rather than current. Held for the name. */
const CT_S5 = new Sequence({ name: "Cartethyia S5: Hope Reshaped in Storms" });

/** S6: the Blade tops the target's Aero Erosion up instead of stripping it (see the Blade's own
 *  afterAction), any teammate inflicting Aero Erosion at the cap fires an instance of it, and the
 *  target takes 40% more DMG from Fleurdelys. The 30s window on the middle half covers the whole
 *  loop — her Intro and both Liberations all open it — so it is simply always on. */
const CT_S6 = new Sequence({
  name: "Cartethyia S6: Freedom Found in Storm's Wake",
  hitGlobal: () => {
    if (!appliedByMember(AERO_EROSION, currentTeam().slot)) return;
    if (stacksOfEnemy(AERO_EROSION) < currentTeam().enemyMax(AERO_EROSION)) return;
    const rung = negativeStatusRung(AERO_EROSION_ACTIONS, stacksOfEnemy(AERO_EROSION));
    if (rung) queue(rung);
  },
  applyStats: () => { if (isHeld(MANIFEST)) addStat(Stat.Amp, 40); },
});

/* --------------------------------------------------------------------------- kit and loadout */

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CARTETHYIA_TALENTS = new Talent({
  name: "Cartethyia: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusHp, 12]],
});

/** Her, as a Resonator: name/element/weapon, and her own base stat line. The Intro resolves by
 *  form — Manifest survives a swap, so a visit begun mid-Manifest opens as Fleurdelys. */
const TB_BASE = tuneBreak(91, 91, 70, SWORD_BREAK);
const TB_FORM = tuneBreak(94, 94, 64, BROADBLADE_BREAK);

const CARTETHYIA_RESONATOR = new Resonator({
  name: "Cartethyia",
  talent: CARTETHYIA_TALENTS,
  inherent1: CT_INHERENT_1,
  inherent2: CT_INHERENT_2,
  tier: Tier.Limited,
  element: Attribute.Aero,
  weapon: WeaponType.Sword,
  color: "#3553fb",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  intro: new Action("Intro Resolver", { cast: Cast.Intro, resolve: () => (isHeld(MANIFEST) ? FIntro : Intro) }),
  // a Tune Break per form: Fleurdelys's is the broadblade's
  tuneBreak: new Action("Tune Break Resolver", { resolve: () => (isHeld(MANIFEST) ? TB_FORM : TB_BASE) }),
  maxEnergy: 125,
  maxForte1: 120,

  stats: [[Stat.BaseHp, 14800], [Stat.BaseAtk, 312.5], [Stat.BaseDef, 611.11]],
});

// The line the kit asks for: her Intro plants a Discord shadow and chains into Stage 2, the Skill
// plants Virtue, Stage 4 plants Divinity, and the plunge recalls all three for its own biggest
// form plus every Heart. Then the transform, a Fleurdelys chain that banks exactly 120 Conviction
// (8 + 28 + 14 + 10 + 20 + 8 + 24 + 8), and the Blade. She is never the team's own lead, so this
// covers opener and loop both.

const CT_ROTATION = new Rotation([
  INTRO, BA234.cancel(),
  Skill, Plunge3,
  Liberation,
  FSkill1, FSkill2, FBA345, FBA12345,
  Lib2, ECHO.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, her own sword and echo, the
// two Aero Erosion sonatas, mainstat/substat
export const CARTETHYIA = new Loadout({
  resonator: CARTETHYIA_RESONATOR,
  sequences: [CT_S1, CT_S2, CT_S3, CT_S4, CT_S5, CT_S6],
  weapons: [DEFIERS_THORN, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [new EchoLoadout(FLEURDELYS, WINDWARD_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.HP4, Mainstat.Aero3, Mainstat.HP1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.HpPct, Substat.Basic, Substat.FlatHp, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.HpPct, Substat.Basic, Substat.FlatHp, Substat.Liberation),
  rotation: CT_ROTATION,
});
