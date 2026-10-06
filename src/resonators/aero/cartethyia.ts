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
 * most. The transform's HP cost (half her Max HP, a quarter at S5) never reaches the formula: every
 * motion value here reads Max HP, not current. The Blade restores 50% Max HP — a heal marker at 0f.
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
import { Tier, Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling, Position } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addStat,
  appliedByMember,
  applyCurrent,
  applyEnemy,
  applyOthers,
  applyTeam,
  casting,
  currentCast,
  runningAction,
  currentMember,
  currentTeam,
  forte1,
  isHeld,
  maxStackIncrease,
  queue,
  removeStackEnemy,
  consume,
  revokeCurrent,
  revokeEnemy,
  revokeTeam,
  setStacksSelf,
  stacksOf,
  stacksOfEnemy,
  isActive,
  reduceCooldown,
  addGain,
} from "../../engine/context.js";
import { Action, Rotation, ECHO, ActionGroup, INTRO, OUTRO, DODGE } from "../../engine/rotation.js";
import { tuneBreak, SWORD_BREAK, BROADBLADE_BREAK } from "../../shared/tunebreak.js";
import {
  AERO_EROSION, AERO_EROSION_ACTIONS, hasNegativeStatus, inflictedNegativeStatusBy, negativeStatusRung,
  EROSION_HASTE, HEALS,
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

/** The three Sword Shadows, one of each at a time — pure markers, spent by the Plunging Attack
 *  that recalls them (see `RECALL` below). */
const SWORD_OF_DIVINITY = new Buff({ name: "Cartethyia: Sword of Divinity's Shadow", duration: 60 * 20 });
const SWORD_OF_DISCORD = new Buff({ name: "Cartethyia: Sword of Discord's Shadow", duration: 60 * 20 });
const SWORD_OF_VIRTUE = new Buff({ name: "Cartethyia: Sword of Virtue's Shadow", duration: 60 * 20 });

/** Manifest: 12s as Fleurdelys, opened by A Knight's Heartfelt Prayers and closed by the Blade.
 *  It survives a swap on purpose — that is what her Fleurdelys-form Intro is for. No stat of its
 *  own; S6 is what reads it, and every Fleurdelys press requires it. */
const MANIFEST = new Buff({ name: "Cartethyia: Manifest", duration: 60 * 12 });

/** "Following Sword to Answer Waves' Call, press Resonance Skill again" for May Tempest Break the
 *  Tides: no window length is published, and a swap or the end of Manifest ends it. */
const MAY_TEMPEST_READY = new Buff({ name: "Fleurdelys: May Tempest Break the Tides Ready", lostOnSwap: true, lostWith: MANIFEST });

/** "Instantly trigger 1 instance of Aero Erosion DMG and reduce the stack by 1" — Fleurdelys's
 *  Basic Stage 5, Mid-air Stage 2 and May Tempest Break the Tides, on the hit wuwalab detonates on
 *  (their last): the rung fires at the count held, then the stack goes, as a consume a teammate's
 *  "when you consume" passive sees (Suisui's Undulating Mist). */
const EROSION_BURST = {
  updateDebuffs: () => {
    const rung = negativeStatusRung(AERO_EROSION_ACTIONS, stacksOfEnemy(AERO_EROSION));
    if (!rung) return;
    queue(rung);
    consume(AERO_EROSION, 1);
  },
};

// --- Cartethyia: basics, heavy, dodge counter (Sword to Carve My Forms). Stage 4 lays the Aero
//     Erosion and the Sword of Divinity's Shadow; the Heavy is considered Basic Attack DMG.
const BA1 = cartethyiaAction("Basic - Sword to Carve My Forms 1", { animFrames: 20, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 13, mv: 478, energy: 70, concerto: 98, offtune: 2240 }]});
// "Press Normal Attack shortly after the Plunging Attack" / "after Sword to Mark Tide's Trace" for Stage 2
const BA2 = cartethyiaAction("Basic - Sword to Carve My Forms 2", { chains: () => [BA1, Plunge, Plunge1, Plunge2, Plunge3, Intro], animFrames: 49, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 20, mv: 394, energy: 58, concerto: 81, offtune: 1844 },
    { hitFrame: 30, mv: 394, energy: 58, concerto: 81, offtune: 1844 },
    { hitFrame: 39, mv: 525, energy: 77, concerto: 108, offtune: 2458 },
  ]});
const BA3 = cartethyiaAction("Basic - Sword to Carve My Forms 3", { chains: [BA2], animFrames: 60, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 428, energy: 63, concerto: 88, offtune: 2004 },
    { hitFrame: 20, mv: 428, energy: 63, concerto: 88, offtune: 2004 },
    { hitFrame: 32, mv: 428, energy: 63, concerto: 88, offtune: 2004 },
    { hitFrame: 44, mv: 428, energy: 63, concerto: 88, offtune: 2004 },
  ]});
const BA4 = cartethyiaAction("Basic - Sword to Carve My Forms 4", {
  chains: [BA3], animFrames: 62, castPriority: 2,
  node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 17, commitFrame: 11, mv: 252, energy: 37, concerto: 52, offtune: 1179 },
    { hitFrame: 24, commitFrame: 11, mv: 252, energy: 37, concerto: 52, offtune: 1179 },
    { hitFrame: 31, commitFrame: 11, mv: 252, energy: 37, concerto: 52, offtune: 1179 },
    // the old Divinity shadow goes on the finisher, the new one stands 6 frames on (wuwalab)
    { hitFrame: 41, commitFrame: 11, mv: 754, energy: 111, concerto: 155, offtune: 3536, updateDebuffs: () => {
      applyEnemy(AERO_EROSION, 1);
      revokeCurrent(SWORD_OF_DIVINITY);
    } },
    { hitFrame: 47, commitFrame: 11, element: null, type: null, subtype: null, updateDebuffs: () => applyCurrent(SWORD_OF_DIVINITY, 1) },
  ],
});
const DC = cartethyiaAction("Dodge Counter - Sword to Carve My Forms", { chains: [DODGE], animFrames: 60, animPriority: { 3: 2 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 685, energy: 63, concerto: 141, offtune: 2004 },
    { hitFrame: 20, mv: 685, energy: 63, concerto: 141, offtune: 2004 },
    { hitFrame: 32, mv: 685, energy: 63, concerto: 141, offtune: 2004 },
    { hitFrame: 44, mv: 685, energy: 63, concerto: 141, offtune: 2004 },
  ], castConcerto: 1000});
const HA = cartethyiaAction("Heavy - Sword to Carve My Forms", {
  animFrames: 65, animPriority: { 65: 2 }, castPriority: 4,
  node: Node.Normal, cast: Cast.Heavy, type: Type.Basic, bullets: [
    // the standing Discord shadow goes on the first hit, the new one comes on the last
    { hitFrame: 29, mv: 208, energy: 42, concerto: 59, offtune: 1334, updateDebuffs: () => revokeCurrent(SWORD_OF_DISCORD) },
    { hitFrame: 36, commitFrame: 29, mv: 208, energy: 42, concerto: 59, offtune: 1334 },
    { hitFrame: 43, commitFrame: 29, mv: 208, energy: 42, concerto: 59, offtune: 1334 },
    { hitFrame: 56, commitFrame: 29, mv: 624, energy: 125, concerto: 175, offtune: 4000, updateDebuffs: () => applyCurrent(SWORD_OF_DISCORD, 1) },
  ],
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
// "Release Normal Attack button while airborne to perform Plunging Attack": it lands
const PLUNGE = { castPosition: Position.Midair, endPosition: Position.Grounded, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, subtype: Subtype.AeroErosion, ...RECALL };
const Plunge = cartethyiaAction("Mid-air - Plunging Attack", { animFrames: 45, castPriority: 5, ...PLUNGE, bullets: [{ hitFrame: 32, mv: 565, energy: 133, concerto: 186, offtune: 4248 }]});
const Plunge1 = cartethyiaAction("Mid-air - Plunging Attack (1 Sword Shadow)", { animFrames: 45, castPriority: 5, ...PLUNGE, bullets: [{ hitFrame: 32, mv: 565, energy: 133, concerto: 186, offtune: 4248 }]});
const Plunge2 = cartethyiaAction("Mid-air - Plunging Attack (2 Sword Shadows)", { animFrames: 51, castPriority: 5, ...PLUNGE, bullets: [
    { hitFrame: 33, mv: 330, energy: 45, concerto: 62, offtune: 1416 },
    { hitFrame: 41, commitFrame: 33, mv: 330, energy: 45, concerto: 62, offtune: 1416 },
    { hitFrame: 48, commitFrame: 33, mv: 330, energy: 45, concerto: 62, offtune: 1416 },
  ]});
const Plunge3 = cartethyiaAction("Mid-air - Plunging Attack (3 Sword Shadows)", { animFrames: 51, castPriority: 5, ...PLUNGE, bullets: [
    { hitFrame: 32, mv: 1129, energy: 45, concerto: 62, offtune: 1416 },
    { hitFrame: 42, commitFrame: 32, mv: 1129, energy: 45, concerto: 62, offtune: 1416 },
    { hitFrame: 52, commitFrame: 32, mv: 1129, energy: 45, concerto: 62, offtune: 1416 },
  ]});
/** The Plunging Attack a rotation writes: its form is however many Sword Shadows stand to recall. */
const PlungeResolver = new Action("Plunging Attack Resolver", {
  resolve: () => [Plunge, Plunge1, Plunge2, Plunge3][[SWORD_OF_VIRTUE, SWORD_OF_DIVINITY, SWORD_OF_DISCORD].filter((g) => isHeld(g)).length]!,
});



// --- Cartethyia: skill and intro, both considered their own DMG and both laying 2 Aero Erosion
const Skill = cartethyiaAction("Skill - Sword to Bear Their Names", {
  endPosition: Position.Midair, animFrames: 61, castPriority: 4, cooldown: 60 * 14,
  node: Node.Skill, cast: Cast.Skill, type: Type.Basic, bullets: [
    { hitFrame: 4, mv: 689, energy: 380, offtune: 1680 },
    { hitFrame: 13, commitFrame: 4, mv: 689, energy: 380, offtune: 1680 },
    { hitFrame: 22, commitFrame: 4, mv: 689, energy: 380, offtune: 1680 },
    // the plunge lays the Erosion and takes the old Virtue shadow; the new one stands at 45 (wuwalab)
    { hitFrame: 40, commitFrame: 4, mv: 886, energy: 488, offtune: 2160, updateDebuffs: () => {
      applyEnemy(AERO_EROSION, 2);
      revokeCurrent(SWORD_OF_VIRTUE);
    } },
    { hitFrame: 45, commitFrame: 4, element: null, type: null, subtype: null, updateDebuffs: () => applyCurrent(SWORD_OF_VIRTUE, 1) },
  ], castConcerto: 1000,
});
const Intro = cartethyiaAction("Intro - Sword to Mark Tide's Trace", {
  endPosition: Position.Grounded, qteFrames: 32, animFrames: 56, noSwapFrames: 40, animPriority: { 56: 2 }, castPriority: 11, motionStop: [6, 34],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    // the Discord shadow stands at 6, goes at 60 and is planted again at 67 (wuwalab)
    { hitFrame: 6, element: null, type: null, subtype: null, updateDebuffs: () => applyCurrent(SWORD_OF_DISCORD, 1) },
    { hitFrame: 35, mv: 208, energy: 167, offtune: 1168 },
    { hitFrame: 47, commitFrame: 35, mv: 208, energy: 167, offtune: 1168 },
    { hitFrame: 59, commitFrame: 35, mv: 208, energy: 167, offtune: 1168 },
    { hitFrame: 60, commitFrame: 35, element: null, type: null, subtype: null, updateDebuffs: () => revokeCurrent(SWORD_OF_DISCORD) },
    { hitFrame: 65, commitFrame: 35, mv: 624, energy: 500, offtune: 3504, updateDebuffs: () => applyEnemy(AERO_EROSION, 2) },
    { hitFrame: 67, commitFrame: 35, element: null, type: null, subtype: null, updateDebuffs: () => applyCurrent(SWORD_OF_DISCORD, 1) },
  ], castConcerto: 1000,
  updateBuffs: () => revokeTeam(WINDS_DIVINE_BLESSING),
});

// --- Fleurdelys (the Tempest forte circuit): every press banks Conviction, nothing spends it but
//     the Blade. Her Heavy and Enhanced Heavy are considered Basic Attack DMG.
const FBA1 = cartethyiaAction("Basic - Tempest 1", { requireBuff: MANIFEST, animFrames: 21, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 16, mv: 649, energy: 75, concerto: 105, offtune: 2400, forte1: 4 }]});
// "Press Normal Attack shortly after Fleurdelys - Sword to Call for Freedom to cast ... Stage 2"
const FBA2 = cartethyiaAction("Basic - Tempest 2", { chains: () => [FBA1, FIntro], requireBuff: MANIFEST, animFrames: 55, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 363, energy: 77, concerto: 107, offtune: 2439, forte1: 4 },
    { hitFrame: 43, mv: 182, energy: 39, concerto: 54, offtune: 1220, forte1: 4 },
    { hitFrame: 49, commitFrame: 43, mv: 182, energy: 39, concerto: 54, offtune: 1220, forte1: 4 },
    { hitFrame: 55, commitFrame: 43, mv: 182, energy: 39, concerto: 54, offtune: 1220, forte1: 2 },
  ]});
// Stage 3 also follows Mid-air Stage 3 and May Tempest Break the Tides ("Follow up with Basic Attack")
const FBA3 = cartethyiaAction("Basic - Tempest 3", { chains: () => [FBA2, FMA3, FSkill2], requireBuff: MANIFEST, animFrames: 59, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 20, mv: 213, energy: 45, concerto: 63, offtune: 1440, forte1: 2 },
    { hitFrame: 26, mv: 213, energy: 45, concerto: 63, offtune: 1440, forte1: 2 },
    { hitFrame: 30, mv: 213, energy: 45, concerto: 63, offtune: 1440, forte1: 2 },
    { hitFrame: 46, mv: 426, energy: 90, concerto: 126, offtune: 2880, forte1: 8 },
  ]});
// Dodge Counter - Fleurdelys: "Follow up with Basic Attack shortly afterward to cast ... Stage 4"
const FBA4 = cartethyiaAction("Basic - Tempest 4", { chains: () => [FBA3, FDC], requireBuff: MANIFEST, animFrames: 60, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 22, commitFrame: 10, mv: 274, energy: 45, concerto: 63, offtune: 1440, forte1: 2 },
    { hitFrame: 31, commitFrame: 10, mv: 274, energy: 45, concerto: 63, offtune: 1440, forte1: 2 },
    { hitFrame: 40, commitFrame: 10, mv: 274, energy: 45, concerto: 63, offtune: 1440, forte1: 2 },
    { hitFrame: 49, commitFrame: 10, mv: 274, energy: 45, concerto: 63, offtune: 1440, forte1: 2 },
    { hitFrame: 58, commitFrame: 10, mv: 274, energy: 45, concerto: 63, offtune: 1440, forte1: 2 },
  ]});
const FBA5 = cartethyiaAction("Basic - Tempest 5", { chains: [FBA4], requireBuff: MANIFEST, animFrames: 50, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 24, commitFrame: 18, mv: 720, energy: 40, concerto: 56, offtune: 1268, updateDebuffs: () => fleurdelysErosion(), forte1: 10 },
    { hitFrame: 58, commitFrame: 18, mv: 2880, energy: 159, concerto: 222, offtune: 5069, forte1: 10, ...EROSION_BURST },
  ]});
const FDC = cartethyiaAction("Dodge Counter - Tempest", { chains: [DODGE], requireBuff: MANIFEST, animFrames: 61, animPriority: { 60: 2 }, castPriority: 8, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 20, mv: 320, energy: 45, concerto: 63, offtune: 1440, forte1: 2 },
    { hitFrame: 28, mv: 320, energy: 45, concerto: 63, offtune: 1440, forte1: 2 },
    { hitFrame: 33, mv: 320, energy: 45, concerto: 63, offtune: 1440, forte1: 2 },
    { hitFrame: 51, mv: 639, energy: 90, concerto: 126, offtune: 2880, forte1: 8 },
  ], castConcerto: 1000});
// "While Fleurdelys is on the ground, Jump to cast this skill": a jump, so it leaves her airborne
const UpwardCut = cartethyiaAction("Basic - Tempest Upward Cut", { castPosition: Position.Grounded, endPosition: Position.Midair, requireBuff: MANIFEST, animFrames: 39, animPriority: { 39: 2 }, castPriority: 6, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 24, mv: 454, energy: 76, concerto: 106, offtune: 2420, forte1: 4 },
    { hitFrame: 32, commitFrame: 24, mv: 454, energy: 76, concerto: 106, offtune: 2420, forte1: 4 },
  ]});
const FMA1 = cartethyiaAction("Mid-air - Tempest 1", { castPosition: Position.Midair, requireBuff: MANIFEST, animFrames: 48, castPriority: 4, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 299, energy: 66, concerto: 93, offtune: 2107, forte1: 3 },
    { hitFrame: 23, mv: 299, energy: 66, concerto: 93, offtune: 2107, forte1: 3 },
    { hitFrame: 37, mv: 308, energy: 68, concerto: 95, offtune: 2171, forte1: 2 },
  ]});
const FMA2 = cartethyiaAction("Mid-air - Tempest 2", { chains: [FMA1], castPosition: Position.Midair, requireBuff: MANIFEST, animFrames: 71, animPriority: { 70: 0 }, castPriority: 4, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 739, energy: 52, concerto: 72, offtune: 1644, updateDebuffs: () => fleurdelysErosion(), forte1: 5 },
    { hitFrame: 25, commitFrame: 16, mv: 739, energy: 52, concerto: 72, offtune: 1644, forte1: 5 },
    { hitFrame: 53, mv: 1477, energy: 103, concerto: 144, offtune: 3288, forte1: 5, ...EROSION_BURST },
  ]});
// "While airborne, hold Normal Attack to cast Mid-air Attack - Fleurdelys Stage 3" at any point of the
// string; Basic Attack - Fleurdelys Stage 3 follows it, so it leaves her on the ground
const FMA3 = cartethyiaAction("Mid-air - Tempest 3", { castPosition: Position.Midair, endPosition: Position.Grounded, requireBuff: MANIFEST, animFrames: 48, animPriority: { 49: 2 }, castPriority: 4, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 38, mv: 220, energy: 48, concerto: 67, offtune: 1528, forte1: 10 }]});
const FHA = cartethyiaAction("Heavy - Tempest", { requireBuff: MANIFEST, animFrames: 51, animPriority: { 1: 2 }, castPriority: 6, node: Node.Forte, cast: Cast.Heavy, type: Type.Basic, bullets: [
    { hitFrame: 34, mv: 428, energy: 53, concerto: 74, offtune: 1685, forte1: 4 },
    { hitFrame: 45, mv: 997, energy: 123, concerto: 172, offtune: 3932, forte1: 4 },
  ]});
// "While casting Heavy Attack - Fleurdelys, press Normal Attack again"
const FEHA = cartethyiaAction("Heavy - Tempest (Enhanced)", { chains: [FHA], requireBuff: MANIFEST, animFrames: 67, animPriority: { 5: 2 }, castPriority: 6, node: Node.Forte, cast: Cast.Heavy, type: Type.Basic, bullets: [
    { hitFrame: 37, mv: 778, energy: 96, concerto: 135, offtune: 3066, updateDebuffs: () => fleurdelysErosion(), forte1: 8 },
    { hitFrame: 44, commitFrame: 37, mv: 778, energy: 96, concerto: 135, offtune: 3066, forte1: 8 },
    { hitFrame: 51, commitFrame: 37, mv: 389, energy: 48, concerto: 68, offtune: 1533, forte1: 8 },
  ]});
const FSkill1 = cartethyiaAction("Skill - Sword to Answer Waves' Call", { requireBuff: MANIFEST, animFrames: 69, animPriority: { 55: 2 }, castPriority: 4, cooldown: 60 * 14, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 5, mv: 186, energy: 18, offtune: 551, forte1: 2 },
    { hitFrame: 11, commitFrame: 5, mv: 186, energy: 18, offtune: 551, forte1: 2 },
    { hitFrame: 17, commitFrame: 5, mv: 186, energy: 18, offtune: 551, forte1: 2 },
    { hitFrame: 23, commitFrame: 5, mv: 186, energy: 18, offtune: 551, forte1: 2 },
    { hitFrame: 54, mv: 1736, energy: 161, offtune: 5136, forte1: 4 },
  ], castConcerto: 1000,
  updateBuffs: () => applyCurrent(MAY_TEMPEST_READY, 1),
});
// "Following Resonance Skill - Sword to Answer Waves' Call, press Resonance Skill again"
const FSkill2 = cartethyiaAction("Skill - May Tempest Break the Tides", { chains: [FSkill1], requireBuff: MAY_TEMPEST_READY, animFrames: 101, animPriority: { 100: 2 }, castPriority: 4, node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 50, mv: 186, energy: 66, offtune: 551, updateDebuffs: () => fleurdelysErosion(), forte1: 5 },
    { hitFrame: 56, commitFrame: 50, mv: 186, energy: 66, offtune: 551, forte1: 5 },
    { hitFrame: 80, commitFrame: 50, mv: 703, energy: 250, offtune: 2079, forte1: 6 },
    { hitFrame: 86, commitFrame: 50, mv: 703, energy: 250, offtune: 2079, forte1: 6 },
    { hitFrame: 92, commitFrame: 50, mv: 703, energy: 250, offtune: 2079, forte1: 6, ...EROSION_BURST },
  ], castConcerto: 1000,
  updateBuffs: () => revokeCurrent(MAY_TEMPEST_READY),
});
/** Her Intro in Fleurdelys form — reached only by swapping out mid-Manifest and back in, which
 *  this loop never does. Conviction unknown (see the file header), so it banks none. */
const FIntro = cartethyiaAction("Intro - Sword to Call for Freedom", { endPosition: Position.Grounded, qteFrames: 47, requireBuff: MANIFEST,
  animFrames: 71, noSwapFrames: 56, animPriority: { 71: 2 }, castPriority: 11, motionStop: [6, 48],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 48, mv: 428, energy: 53, offtune: 1685 }, { hitFrame: 61, mv: 997, energy: 123, offtune: 3932 }], castConcerto: 1000,
  updateBuffs: () => revokeTeam(WINDS_DIVINE_BLESSING),
  castForte1: 10,
});


const FBA345 = new ActionGroup("Basic - Tempest 345", [FBA3, FBA4, FBA5]);
const FBA12345 = new ActionGroup("Basic - Tempest 12345", [FBA1, FBA2, FBA3, FBA4, FBA5]);

// --- the two Liberations: the transform, then the Blade once Conviction is full
const Liberation = cartethyiaAction("Liberation - A Knight's Heartfelt Prayers", {
  animFrames: 198, castPriority: 10, timestop: [0, 198], motionStop: [0, 198], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 198, mv: 0 }], castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => applyCurrent(MANIFEST, 1),
});
/** Blade of Howling Squall: spends every Conviction, ends Manifest, and strips the target's Aero
 *  Erosion — 20% amplification on this one hit per stack taken, five at most. The strip lands at
 *  316, past the last hit (wuwalab's clear_aero_erosion), so every hit reads the count it is paid for. */
const Lib2 = cartethyiaAction("Liberation - Blade of Howling Squall", { requireBuff: MANIFEST, minForte1: 120,
  animFrames: 301, castPriority: 10, timestop: [0, 301], motionStop: [0, 301], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    // "restores 50% of Max HP": wuwalab's self heal at 0f, ahead of the hits
    { hitFrame: 0, element: null, type: null, subtype: null, updateDebuffs: () => applyCurrent(HEALS, 1) },
    { hitFrame: 253, mv: 1312, offtune: 24000 },
    { hitFrame: 263, commitFrame: 253, mv: 1312, offtune: 24000 },
    { hitFrame: 273, commitFrame: 253, mv: 1312, offtune: 24000 },
    { hitFrame: 284, commitFrame: 253, mv: 1312, offtune: 24000 },
    { hitFrame: 294, commitFrame: 253, mv: 1312, offtune: 24000 },
    { hitFrame: 304, commitFrame: 253, mv: 1312, offtune: 24000 },
    { hitFrame: 314, commitFrame: 253, mv: 1312, offtune: 24000 },
    { hitFrame: 316, commitFrame: 253, element: null, type: null, subtype: null, updateDebuffs: () => {
      if (isHeld(CT_S6)) applyEnemy(AERO_EROSION, currentTeam().enemyMax(AERO_EROSION));
      else consume(AERO_EROSION, stacksOfEnemy(AERO_EROSION));
    } },
  ], castConcerto: 2000, castForte1: -120,
  // S6 stops the strip but not the payout: the amplification still reads what the target holds
  applyStats: () => addStat(Stat.Amp, 20 * Math.min(5, stacksOfEnemy(AERO_EROSION))),
  updateBuffs: () => {
    revokeCurrent(MANIFEST); revokeCurrent(HEART_OF_VIRTUE);
    revokeCurrent(MANDATE_OF_DIVINITY); revokeCurrent(POWER_OF_DISCORD);
    revokeEnemy(EROSION_HASTE);
  },
});
const Outro = cartethyiaAction("Outro - Wind's Divine Blessing", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => applyTeam(WINDS_DIVINE_BLESSING, 1),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Heart of Virtue: a force field and interruption resistance, so nothing the formula reads. */
const HEART_OF_VIRTUE = new Buff({ name: "Cartethyia: Heart of Virtue" });

/** Mandate of Divinity: +50% Aero Erosion DMG Amplification, and the status's own tick interval
 *  halved for as long as she is the one on field — a marker on the target (shared/status.ts's
 *  EROSION_HASTE) that her presses keep up and her swap-out takes down. */
const MANDATE_OF_DIVINITY = new Buff({
  name: "Cartethyia: Mandate of Divinity",
  stats: [[Stat.Amp, 50, Subtype.AeroErosion]],
  updateBuffs: () => {
    if (currentCast().swapOut) revokeEnemy(EROSION_HASTE);
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
  updateBuffs: () => {
    if (casting(Cast.Liberation) && currentMember().resonator?.name === "Aero Rover") addGain({ forte1: 25 });
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
    if (currentCast().node === Node.Forte) return;
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
 *  316 bullet), any teammate inflicting Aero Erosion at the cap fires an instance of it, and the
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
  applyStats: () => { if (isHeld(MANIFEST)) addStat(Stat.TotalDmg, 40); },
});

/* --------------------------------------------------------------------------- kit and loadout */

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const CARTETHYIA_TALENTS = new Talent({
  name: "Cartethyia: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusHp, 12]],
});

/** Her, as a Resonator: name/element/weapon, and her own base stat line. The Intro resolves by
 *  form — Manifest survives a swap, so a visit begun mid-Manifest opens as Fleurdelys. */
const TB_BASE = tuneBreak(91, [0, 91], [0, 70], SWORD_BREAK);
const TB_FORM = tuneBreak(94, [0, 94], [0, 64], BROADBLADE_BREAK);

export const CARTETHYIA_RESONATOR = new Resonator({
  name: "Cartethyia",
  talent: CARTETHYIA_TALENTS,
  inherent1: CT_INHERENT_1,
  inherent2: CT_INHERENT_2,
  tier: Tier.Limited,
  element: Attribute.Aero,
  weapon: WeaponType.Sword,
  color: "#3553fb",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  intro: () => (isHeld(MANIFEST) ? FIntro : Intro),
  outro: Outro,
  swapIn: () => (isHeld(MANIFEST) ? FBA1 : BA1),
  // no mid-air string as Cartethyia: her Plunging Attack, in the form the standing shadows make
  swapInAir: () => (isHeld(MANIFEST) ? FMA1 : [Plunge, Plunge1, Plunge2, Plunge3][[SWORD_OF_VIRTUE, SWORD_OF_DIVINITY, SWORD_OF_DISCORD].filter((g) => isHeld(g)).length]!),
  // a Tune Break per form: Fleurdelys's is the broadblade's
  tuneBreak: new Action("Tune Break Resolver", { resolve: () => (isHeld(MANIFEST) ? TB_FORM : TB_BASE) }),
  maxEnergy: 12500,
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
  Skill, PlungeResolver,
  Liberation,
  FSkill1, FSkill2, FBA345, FBA12345,
  Lib2, ECHO.instaSwap(), OUTRO,
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
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.HpPct, Substat.Basic, Substat.FlatHp, Substat.Liberation, Substat.Skill),
  rotation: CT_ROTATION,
});
