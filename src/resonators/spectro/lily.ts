/**
 * Lily — a Spectro Pistols healer/support. Her damage is two HP-scaled hits that read her Energy Regen as
 * crit (Intro - Eternal Bloom, the Finale ending either Woven heavy); what she is worth is what she hands
 * the team:
 *
 * - **Outro - Blooming Fragrance**: 25% All DMG Amplification for 30s.
 * - **Cradle Lullaby** (Liberation, 25s): every teammate's Intro adds a stack of Dream Aroma, +7%
 *   ATK each to the whole team, up to 4. Her own Intro ends both, so the stacks are the ones her
 *   two teammates' Intros build between her visits.
 * - **Silvered Dream** (an Outro inside 6s of a Finale, once every 20s): the active resonator's
 *   Echo Skill Crit. Rate +10% and Crit. DMG +20%, and +7% ATK per Unison Boon stack to a resonator
 *   that can trigger Unison Response.
 *
 * Her Resonance Skill switches which Woven heavy the next full Dream Perfume (forte1, 300) pays
 * for; the rotation enters Phantasm form once and stays in it, so it writes the Phantasm presses
 * themselves. The channel builds Dreambell Chime (forte2, 300) and the rotation holds it into
 * its Finale, letting go the frame the bar fills; a channel played out casts its Finale by itself,
 * and one cut short turns the Chime it built back into Dream Perfume.
 *
 * Healing is the HEALS marker alone (status.ts): each Woven channel's two heals and Slumberland's
 * seventeen, 3s apart, all on her slot, so her weapon and sonata see each one.
 *
 * MVs off encore's release rows (character 1512) at skill level 10; frames, priorities, per-hit Energy,
 * Concerto, off-tune and Dream Perfume (forte1), and the Woven channels' Dreambell Chime (forte2) and
 * Concerto steps, base and S3, are wuwalab's. Dreambind's continuous 19.89% is left out — its tick rate is
 * nowhere in the data.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, Position, Input } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addStat,
  addGain,
  cancelHits,
  forte2,
  pressCut,
  queueEvent,
  applyCurrent,
  applyTeam,
  casting,
  currentFrame,
  currentMember,
  reduceCooldown,
  frozenStacks,
  getStat,
  isActive,
  isHeld,
  revokeCurrent,
  revokeTeam,
  runningAction,
  runningAnyOf,
  stacksOf,
  stacksOfTeam,
  notAfter,
  after,
  midair,
  holds,
  lacks,
  forte1,
  concerto,
  grounded,
} from "../../engine/context.js";
import { Action, ActionGroup, Cooldown, Rotation, SWAPIN, SUCCESSFUL_DODGE } from "../../engine/rotation.js";
import { HEALS } from "../status.js";
import { BOON_REACTOR, UNISON_BOON } from "../unison.js";
import { LULLABY } from "../../weapons/pistol.js";
import { CADENZA, STATIC_MIST } from "../../weapons/standard.js";
import { FALLACY_MAINSLOT, REJUV_5PC, FALLACY } from "../../echoes/jinzhou.js";
import { FORMRENDER_MAINSLOT, TINGED_YEARNING_5PC, FORMRENDER } from "../../echoes/mengzhou.js";
import { JINHSI_RESONATOR } from "./jinhsi.js";
import { SUOMING_RESONATOR } from "../electro/suoming.js";
import { HSIN_RESONATOR } from "../electro/hsin.js";
import { mainstats, Mainstat } from "../../echoes/mainstats.js";
import { Echoes } from "../../echoes/echoes.js";
import { substats, highSubs, Substat } from "../../echoes/substats.js";
import { JINGRAN_RESONATOR } from "../fusion/jingran.js";
import { SPACETREK_EXPLORER, SPACETREK_EXPLORER_MAINSLOT, STARRY_RADIANCE_5PC } from "../../echoes/lahairoi.js";

/* ----------------------------------------------------------------------------------- states */

/** Nightmare Blend's mode: Woven Phantasm in place of Woven Fairytale until Reverie Blend. */
const PHANTASM_MODE = new Buff({ name: "Lily: Woven Phantasm" });
/** Set by the Liberation, spent by the Intro it turns into Eternal Bloom. */
const ETERNAL_READY = new Buff({ name: "Lily: Eternal Bloom Ready" });

/* ----------------------------------------------------------------------------------- actions */

function lilyAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Mend and Cleanse. Frames, priorities, per-hit gains and events off wuwalab (2026-11-20, the release
//     kit); the MVs agree with encore's level-10 rows hit for hit
const BA1 = lilyAction("Basic - Mend and Cleanse 1", { input: [Input.Basic, Input.SwapIn], notAfter: () => [BA1, BA2, BA3, IntroBase, IntroEternalPhantasm, IntroEternalFairytale, DC], position: Position.Grounded, animFrames: 24, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 6362, energy: 100, concerto: 260, offtune: 3200, forte1: 49 },
  ]});
const BA2 = lilyAction("Basic - Mend and Cleanse 2", { input: Input.Basic, after: () => [BA1], animFrames: 44, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets:
    [6, 16, 22, 28].map((hitFrame) => ({ hitFrame, mv: 2915, energy: 46, concerto: 120, offtune: 1466, forte1: 22 })),
  });
// both Intros "Press Normal Attack shortly after casting this skill to cast Basic Attack Stage 3"
const BA3 = lilyAction("Basic - Mend and Cleanse 3", { input: Input.Basic, after: () => [BA2, IntroBase, IntroEternalPhantasm, IntroEternalFairytale], animFrames: 36, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 29, commitFrame: 14, mv: 9543, energy: 150, concerto: 390, offtune: 4800, forte1: 72 },
  ]});
// the dodge counter leads into Stage 4 too
const BA4 = lilyAction("Basic - Mend and Cleanse 4", { input: Input.Basic, after: () => [BA3, DC], animFrames: 72, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets:
    [26, 39, 48, 57].map((hitFrame) => ({ hitFrame, commitFrame: 26, mv: 3845, energy: 61, concerto: 158, offtune: 1934, forte1: 28 })),
  });
const MA = lilyAction("Mid-air - Plunging Attack", { input: [Input.Basic, Input.SwapIn], position: Position.Midair, endPosition: Position.Grounded, animFrames: 56, animPriority: { 0: 6, 36: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 43, commitFrame: 37, mv: 11452, energy: 180, concerto: 468, offtune: 5760, forte1: 81 },
  ]});
const DC = lilyAction("Dodge Counter - Mend and Cleanse", { input: Input.Basic, after: () => [SUCCESSFUL_DODGE], animFrames: 60, animPriority: { 0: 7, 60: 2 }, castPriority: 7, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 29, commitFrame: 14, mv: 23858, energy: 300, concerto: 780, offtune: 9600, forte1: 133 },
  ], castConcerto: 1000});

// --- Dream Blend: one button switching the Woven heavy at its hit, both forms on one 13s cooldown,
//     each carrying 2.5 Energy and the flat Concerto Regen 8 on cast
const BLEND_CD = new Cooldown({ frames: 60 * 13 });
const BLEND = { animFrames: 40, animPriority: { 0: 5, 32: 2 }, castPriority: 5, cooldown: BLEND_CD,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, castEnergy: 250, castConcerto: 800 };
const BLEND_HIT = { hitFrame: 30, mv: 15905, offtune: 7736, forte1: 130 };
const SkillPhantasm = lilyAction("Skill - Nightmare Blend", { ...BLEND, input: Input.Skill, lacks: PHANTASM_MODE,
  bullets: [{ ...BLEND_HIT, updateDebuffs: () => applyCurrent(PHANTASM_MODE, 1) }],
});
const SkillFairytale = lilyAction("Skill - Reverie Blend", { ...BLEND, input: Input.Skill, holds: PHANTASM_MODE,
  bullets: [{ ...BLEND_HIT, updateDebuffs: () => revokeCurrent(PHANTASM_MODE) }],
});

/** A heal or gauge event of a press's own: a hit dealing nothing. */
const event = (hitFrame: number, extra: object) => ({ hitFrame, mv: 0, element: null, type: null, subtype: null, ...extra });
const wovenHeal = (hitFrame: number) => event(hitFrame, { updateDebuffs: () => applyCurrent(HEALS, 1) });

// --- the Forte heavies: at full Dream Perfume, held Normal Attack spends the whole bar for a channel
//     that builds Dreambell Chime (forte2) and up to 30 Concerto and heals the team twice; at 300 Chime the
//     Finale stops it. wuwalab commits every step early; a cut channel stops building in-game, so each
//     commits on its own frame. Each step is a bullet's own gain, so a hold into the Finale sees the bar fill
// cast priority 2: in practice it cancels nothing, every press before it holding 2 to its end; it holds 3 itself
const WOVEN = { resetForte1: true, castPriority: 2, animPriority: { 0: 3 }, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy,
  // Eternal Bloom's Deep Dream Fragrance, spent by the next Woven for 100 Chime
  updateBuffs: () => {
    if (!isHeld(DEEP_DREAM)) return;
    revokeCurrent(DEEP_DREAM);
    addGain({ forte2: 100 });
  },
  // played out, it casts its own Finale; cut short of full, the Chime left turns back into Dream Perfume
  // (at full, the hold cancel into the Finale spends it)
  afterAction: () => {
    if (!pressCut()) {
      queueEvent(runningAnyOf(PHANTASMS) ? PhantasmsEnd : FairytalesFinale);
      return;
    }
    const left = forte2();
    if (left > 0 && left < 300) addGain({ forte1: left, forte2: -left });
  },
};
/** Woven Fairytale, its Chime and Concerto steps the base ones or (`s3`) S3's faster ones. */
const wovenFairytale = (s3: boolean): Action => lilyAction("Forte Heavy - Woven Fairytale", { ...WOVEN, input: Input.BasicHold, minForte1: 300, lacks: PHANTASM_MODE, valid: () => isHeld(SL_S3) === s3, animFrames: 312,
  timestop: [1, 57], motionStop: [1, 57],
  bullets: [
    { hitFrame: 70, mv: 2486, energy: 45, offtune: 1000 },
    ...[88, 100, 112, 124, 136, 148, 160, 172, 184, 196, 208, 220, 232, 244, 256, 268, 280, 292, 304].map((hitFrame) =>
      ({ hitFrame, mv: 2486, energy: 78, offtune: 1727 })),
    wovenHeal(90), wovenHeal(150),
    ...(s3
      ? [...[89, 149].map((f) => event(f, { concerto: 1500 })),
        ...[104, 116, 128, 140, 152, 164, 176, 188, 200, 212, 224, 236, 248, 260, 272, 284, 296].map((f) => event(f, { forte2: 60 }))]
      : [...[89, 149, 209].map((f) => event(f, { concerto: 1000 })),
        ...[110, 128, 146, 165, 182, 200, 218, 236, 254, 273, 290, 306].map((f) => event(f, { forte2: 38 }))]),
  ] });
/** Woven Phantasm, the same way. */
const wovenPhantasm = (s3: boolean): Action => lilyAction("Forte Heavy - Woven Phantasm", { ...WOVEN, input: Input.BasicHold, minForte1: 300, holds: PHANTASM_MODE, valid: () => isHeld(SL_S3) === s3, animFrames: 264,
  bullets: [
    ...Array.from({ length: 23 }, (_, k) => ({ hitFrame: 30 + 10 * k, mv: 2161, energy: 60, offtune: 1333 })),
    wovenHeal(2), wovenHeal(62),
    ...(s3 ? [1, 61].map((f) => event(f, { concerto: 1500 })) : [1, 61, 121].map((f) => event(f, { concerto: 1000 }))),
    ...Array.from({ length: 15 }, (_, k) => event(45 + 15 * k, { forte2: s3 ? 50 : 24 })),
  ] });
const WovenFairytaleBase = wovenFairytale(false), WovenFairytaleS3 = wovenFairytale(true);
const WovenPhantasmBase = wovenPhantasm(false), WovenPhantasmS3 = wovenPhantasm(true);
const PHANTASMS = new Set<Action>([WovenPhantasmBase, WovenPhantasmS3]);
// the press a rotation writes: S3's faster form where she holds it
const WovenFairytale = new Action("Woven Fairytale Resolver", { cast: Cast.Heavy, resolve: () => (isHeld(SL_S3) ? WovenFairytaleS3 : WovenFairytaleBase) });
const WovenPhantasm = new Action("Woven Phantasm Resolver", { cast: Cast.Heavy, resolve: () => (isHeld(SL_S3) ? WovenPhantasmS3 : WovenPhantasmBase) });

// the Finale at full Dreambell Chime, spending it whole, Sillage on its hit. Phantasm's End casts at 4,
// above its channel's 3 (wuwalab's 3 could never stop it), so it stops it the moment the bar fills
/** Silvered Dream's 20s, on the Finale that grants its Sillage: a Finale waits for it, and the Outro
 *  spending the Sillage restarts it from there. */
const SILVERED_CD = new Cooldown({ frames: 60 * 20 });
const FINALE = { resetForte2: true, cooldown: SILVERED_CD, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, scaling: Scaling.Hp };
const FINALE_HIT = { mv: 3579, energy: 2000, concerto: 1000, offtune: 4000, updateDebuffs: () => applyCurrent(SILLAGE, 1) };
const FairytalesFinale = lilyAction("Heavy - Fairytale's Finale", { ...FINALE, input: Input.BasicHold, after: () => [WovenFairytaleBase, WovenFairytaleS3], minForte2: 300, lacks: PHANTASM_MODE,
  animFrames: 98, noSwapFrames: 46, animPriority: { 0: 6, 37: 5, 97: 2 }, castPriority: 6,
  bullets: [{ hitFrame: 46, ...FINALE_HIT }] });
const PhantasmsEnd = lilyAction("Heavy - Phantasm's End", { ...FINALE, input: Input.BasicHold, after: () => [...PHANTASMS], minForte2: 300, holds: PHANTASM_MODE,
  animFrames: 43, noSwapFrames: 16, animPriority: { 0: 3 }, castPriority: 4,
  bullets: [{ hitFrame: 16, ...FINALE_HIT }] });

/** Both Finales and Eternal Bloom: what her ER pays crit on. */
const ER_CRIT_HITS = new Set<Action>([FairytalesFinale, PhantasmsEnd]);
/** The two Finales: what S3's Energy and S6's +100% read. */
const FINALES = new Set<Action>([FairytalesFinale, PhantasmsEnd]);

// --- Into the Dream Cradle: Slumberland, Cradle Lullaby and Eternal Bloom. Slumberland's heals are its own
//     events, as wuwalab has them: the first at 290, sixteen more 3s apart. Its 3302 frames are Slumberland,
//     where she can do nothing but swap out or end it, so a rotation mash-swaps it into the Outro the moment its
//     302-frame time stop ends, and the heals play on behind the swap
const Liberation = lilyAction("Liberation - Into the Dream Cradle", {
  input: Input.Liberation, animFrames: 3302, noSwapFrames: 302, animPriority: { 0: 10, 302: 2 }, castPriority: 10, timestop: [0, 302], motionStop: [0, 302], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, castConcerto: 2000, castEnergy: -17500,
  updateBuffs: () => {
    applyTeam(CRADLE_LULLABY, 1);
    applyCurrent(ETERNAL_READY, 1);
  },
  bullets: Array.from({ length: 17 }, (_, k) => event(290 + 180 * k, { updateDebuffs: () => applyCurrent(HEALS, 1) })),
});
const SLUMBERLAND = new Set<Action>([Liberation]);

// --- Blooming Dream: First Bloom, or Eternal Bloom on the first Intro after a Liberation, each
//     with the Intro's flat Concerto Regen 10
const INTRO = { endPosition: Position.Grounded, castPriority: 11, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, castConcerto: 1000 };
const IntroBase = lilyAction("Intro - First Bloom", { input: Input.Intro, valid: () => !isHeld(ETERNAL_READY), ...INTRO, animFrames: 44, noSwapFrames: 44, motionStop: [3, 44], animPriority: { 0: 11, 44: 2 },
  bullets: [6, 16, 22, 28].map((hitFrame) => ({ hitFrame, mv: 5436, energy: 86, offtune: 2734 })) });
// its 130 Dream Perfume a step of its own at 80, ahead of the hit; Deep Dream Fragrance on cast
const ETERNAL = { ...INTRO, scaling: Scaling.Hp, 
  animFrames: 82, noSwapFrames: 81, qteFrames: 76, motionStop: [4, 82], animPriority: { 0: 11, 81: 2 },
  bullets: [event(80, { forte1: 130 }), { hitFrame: 87, commitFrame: 80, mv: 3610, energy: 342, offtune: 82936 }],
  updateBuffs: () => {
    revokeCurrent(ETERNAL_READY);
    applyCurrent(DEEP_DREAM, 1);
    // "Casting Intro Skill - Eternal Bloom also ends Slumberland immediately": its heals still to come go
    cancelHits(SLUMBERLAND);
  },
};
// one press, written twice so `intro` can pick the chain off the form she arrives in
const IntroEternalPhantasm = lilyAction("Intro - Eternal Bloom", { ...ETERNAL, input: Input.Intro, valid: () => isHeld(ETERNAL_READY) && isHeld(PHANTASM_MODE) });
const IntroEternalFairytale = lilyAction("Intro - Eternal Bloom", { ...ETERNAL, input: Input.Intro, valid: () => isHeld(ETERNAL_READY) && !isHeld(PHANTASM_MODE) });
ER_CRIT_HITS.add(IntroEternalPhantasm);
ER_CRIT_HITS.add(IntroEternalFairytale);
/** Eternal Bloom, either form: what S6's +700% reads. */
const ETERNALS = new Set<Action>([IntroEternalPhantasm, IntroEternalFairytale]);

/** Blooming Fragrance: the team's 25% amplification, and Silvered Dream where a Finale's Sillage
 *  still stands. */
const Outro = lilyAction("Outro - Blooming Fragrance", {
  animFrames: 0,
  cast: Cast.Outro, input: Input.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => {
    applyTeam(BLOOMING_FRAGRANCE, 1);
    if (!isHeld(SILLAGE)) return;
    revokeCurrent(SILLAGE);
    // spending it is what starts the 20s: the Finale's own spend moved out to here, so the true cycle
    // is 20s plus however long Sillage was held
    const cd = currentMember().cooldownAt(SILVERED_CD, currentFrame());
    reduceCooldown(SILVERED_CD, cd.next - 60 * 20 - currentFrame());
    applyTeam(SILVERED_DREAM, 1);
  },
});

/* ------------------------------------------------------------------------------------- buffs */


/** Cradle Lullaby: 25s; each teammate's Intro adds Dream Aroma (two from S1), and her own Intro —
 *  "Lily is the incoming Resonator" — ends it and the Aroma with it. */
const CRADLE_LULLABY: Buff = new Buff({
  name: "Lily: Cradle Lullaby", duration: 60 * 25,
  updateGlobal: () => {
    if (!casting(Cast.Intro)) return;
    if (currentMember().resonator !== LILY_RESONATOR) {
      applyTeam(DREAM_AROMA, stacksOfTeam(WHITE_FLOWERS) ? 2 : 1);
      return;
    }
    revokeTeam(DREAM_AROMA);
    revokeTeam(CRADLE_LULLABY);
  },
});
/** Dream Aroma: +7% ATK a stack to the team, up to 4, ending with Cradle Lullaby. From S2 each
 *  stack also pays +2% Crit. Rate and +6% Crit. DMG. */
const DREAM_AROMA: Buff = new Buff({
  name: "Lily: Dream Aroma", maxStacks: 4, lostWith: CRADLE_LULLABY,
  applyStats: () => {
    const n = frozenStacks();
    addStat(Stat.BonusAtk, 7 * n);
    if (!stacksOfTeam(REQUIEM)) return;
    addStat(Stat.CritRate, 2 * n);
    addStat(Stat.CritDmg, 6 * n);
  },
});

/** Blooming Fragrance: +25% All DMG Amplification, 30s. */
const BLOOMING_FRAGRANCE = new Buff({
  name: "Lily: Outro",
  duration: 60 * 30,
  stats: [[Stat.Amp, 25]],
});

/** Sillage: 6s off either Finale, spent by the Outro for Silvered Dream. */
const SILLAGE = new Buff({ name: "Lily: Sillage", duration: 60 * 6 });
/** Silvered Dream, 30s: the active resonator's Echo Skill crit, and +7% ATK per Unison Boon stack
 *  (counting 4) to one that can trigger Unison Response — a Boon reactor, the only ones holding it. */
const SILVERED_DREAM = new Buff({
  name: "Lily: Silvered Dream",
  duration: 60 * 30,
  applyStats: () => {
    if (!isActive()) return;
    addStat(Stat.CritRate, 10, Type.Echo);
    addStat(Stat.CritDmg, 20, Type.Echo);
    if (isHeld(BOON_REACTOR)) addStat(Stat.BonusAtk, 7 * Math.min(4, stacksOf(UNISON_BOON)));
  },
});

/** Woven Scent's two once-every-20s Concerto gains: Eternal Bloom's 10 and a Finale's 15. */
const ETERNAL_SCENT_ICD = new Buff({ duration: 60 * 20 });
const FINALE_SCENT_ICD = new Buff({ duration: 60 * 20 });

/** Deep Dream Fragrance: 8s off Eternal Bloom, spent by the next Woven heavy for 100 Dreambell Chime. */
const DEEP_DREAM = new Buff({ name: "Lily: Deep Dream Fragrance", duration: 60 * 8 });

/* --------------------------------------------------------------------------------- sequences */

/** S1: two Dream Aroma stacks an Intro (read by Cradle Lullaby); the interruption immunity reaches
 *  no formula. */
const WHITE_FLOWERS = new Buff({ name: "Lily S1: Look, White Flowers from the Ruins of Dreams" });
const SL_S1 = new Sequence({
  name: "Lily S1: Look, White Flowers from the Ruins of Dreams",
  combatStart: () => applyTeam(WHITE_FLOWERS, 1),
});

/** S2: each Dream Aroma stack also pays crit (read by Dream Aroma itself). */
const REQUIEM = new Buff({ name: "Lily S2: Listen, a Requiem from the Dream Cradle" });
const SL_S2 = new Sequence({
  name: "Lily S2: Listen, a Requiem from the Dream Cradle",
  combatStart: () => applyTeam(REQUIEM, 1),
});

/** S3: 170 Dream Perfume entering combat and again on Eternal Bloom, 10 Concerto on the Liberation, 10
 *  Energy on a Finale's hit; its faster Chime is the Woven channels' own S3 steps. Its once-every-12s on
 *  the combat entry is a start-of-combat effect, fired once. */
const SL_S3: Sequence = new Sequence({
  name: "Lily S3: May Your Soul Wander No More",
  combatStart: () => addGain({ forte1: 170 }),
  updateBuffs: () => {
    if (runningAnyOf(ETERNALS)) addGain({ forte1: 170 });
    if (runningAction(Liberation)) addGain({ concerto: 1000 });
  },
  updateDebuffs: () => {
    if (runningAnyOf(FINALES)) addGain({ energy: 1000 });
  },
});

/** S4: Slumberland's +30% healing reaches no formula. */
const SL_S4 = new Sequence({ name: "Lily S4: May Your Past Sink into Silence" });

/** S5: a wider pull, nothing this calculator reads. */
const SL_S5 = new Sequence({ name: "Lily S5: May You Find Peace in Endless Light" });

/** S6: the Finales deal 100% more Spectro DMG and Eternal Bloom 700% more, read as Mornye's S6 "deals
 *  400% more DMG" is. */
const SL_S6 = new Sequence({
  name: "Lily S6: May My Reverie Never End",
  applyStats: () => {
    if (runningAnyOf(FINALES)) addStat(Stat.DmgBonus, 100, Attribute.Spectro);
    if (runningAnyOf(ETERNALS)) addStat(Stat.DmgBonus, 700, Attribute.Spectro);
  },
});

const SL_SEQUENCES = [SL_S1, SL_S2, SL_S3, SL_S4, SL_S5, SL_S6];

/* --------------------------------------------------------------------------- kit and loadout */

/** Woven Scent (Inherent Skill): Eternal Bloom restores 10 Concerto and a Finale 15, each once every 20s. */
const SL_INHERENT_1 = new Inherent({
  name: "Inherent: Woven Scent",
  updateBuffs: () => {
    if (runningAnyOf(ETERNALS) && !isHeld(ETERNAL_SCENT_ICD)) {
      applyCurrent(ETERNAL_SCENT_ICD, 1);
      addGain({ concerto: 1000 });
    }
    if (runningAnyOf(FINALES) && !isHeld(FINALE_SCENT_ICD)) {
      applyCurrent(FINALE_SCENT_ICD, 1);
      addGain({ concerto: 1500 });
    }
  },
});

/** Flowers for You (Inherent Skill): DMG Reduction, a revive shield and Floral Blessing's
 *  conditional heal — nothing this calculator reads. */
const SL_INHERENT_2 = new Inherent({ name: "Inherent: Flowers for You" });

const LILY_TALENTS = new Talent({
  name: "Lily: Talents",
  stats: [
    [Stat.BonusHp, 11.9999997],
    [Stat.HealingBonus, 12], // stat-tree Healing Bonus+ nodes — unused by the formula
  ],
});

export const LILY_RESONATOR = new Resonator({
  id: 1512,
  name: "Lily",
  talent: LILY_TALENTS,
  inherent1: SL_INHERENT_1,
  inherent2: SL_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Pistols,
  color: "#d9b8e8",
  actions: [BA1, BA2, BA3, BA4, MA, DC, SkillPhantasm, SkillFairytale, WovenFairytaleBase, WovenFairytaleS3, WovenPhantasmBase, WovenPhantasmS3, FairytalesFinale, PhantasmsEnd, Liberation, IntroBase, Outro, IntroEternalPhantasm, IntroEternalFairytale],
  maxEnergy: 17500,
  maxForte1: 300,
  // Dreambell Chime, built by the Woven channel and spent whole by its Finale
  maxForte2: 300,
  stats: [[Stat.BaseHp, 16712.5], [Stat.BaseAtk, 287.5], [Stat.BaseDef, 1099.998]],
  // every 1% of ER past 100% is +0.5% Crit. Rate and +1% Crit. DMG on those three, capped at 80/160
  convertStats: () => {
    if (!runningAnyOf(ER_CRIT_HITS)) return;
    const converted = getStat(Stat.ER) - 100;
    addStat(Stat.CritRate, Math.min(80, 0.5 * converted));
    addStat(Stat.CritDmg, Math.min(160, converted));
  },
});

/* ---------------------------------------------------------------------------------- rotation */

const BA12 = new ActionGroup("Basic - Mend and Cleanse 12", [BA1, BA2]);
const BA123 = new ActionGroup("Basic - Mend and Cleanse 123", [BA1, BA2, BA3]);

/** The fastest chains to full Dream Perfume (src/explorer/lilysearch.mjs): Basic 1-2, the Blend and Basic 1
 *  in the opener; arriving first on First Bloom, Basic 3-4 and the Blend; each Eternal Bloom loop, Basic 3-4 —
 *  no Blend after the first, so every Woven is Phantasm's. The Woven holds into its Finale, Silvered Dream's
 *  cooldown on the Finale waits where a loop runs short of it, and the Liberation goes last so Slumberland and
 *  Cradle Lullaby open on the teammates' visits. */
const SL_ROTATION = new Rotation([
  SWAPIN, BA12.cancel(), SkillPhantasm, BA1, WovenPhantasm.holdCancel(), PhantasmsEnd.cancel(),
  FALLACY.instaCancel(), FORMRENDER.instaCancel(), SPACETREK_EXPLORER.instaCancel(), Liberation.mashSwap(), Outro,

  // ba3 c skill is barely faster than skill ba1
  IntroEternalPhantasm, BA3.cancel(), SkillFairytale, WovenFairytale.holdCancel(), FairytalesFinale.cancel(),
  FALLACY.instaCancel(), FORMRENDER.instaCancel(), SPACETREK_EXPLORER.instaCancel(), Liberation.mashSwap(), Outro,

  IntroEternalFairytale, BA3.cancel(), SkillPhantasm, WovenPhantasm.holdCancel(), PhantasmsEnd.cancel(),
  FALLACY.instaCancel(), FORMRENDER.instaCancel(), SPACETREK_EXPLORER.instaCancel(), Liberation.mashSwap(), Outro,

  // unenhanced intro, untested
  IntroBase, BA3, BA4.cancel(), SkillPhantasm, WovenPhantasm.holdCancel(), PhantasmsEnd.cancel(),
  FALLACY.instaCancel(), FORMRENDER.instaCancel(), SPACETREK_EXPLORER.instaCancel(), Liberation.mashSwap(), Outro,
]);

/** Her presses the rotation explorer's bench stands her in with (src/explorer/skbench.ts). */
export const LILY_PRESSES = { IntroBase, Outro };

export const LILY = new Loadout({
  id: 15121,
  // 260% Energy Regen on the character screen at least, where her ER-to-crit conversion caps
  minEr: 260,
  resonator: LILY_RESONATOR,
  weapons: [LULLABY, CADENZA, STATIC_MIST],
  echoes: new Echoes({
    sets: [
      new EchoLoadout(FALLACY_MAINSLOT, REJUV_5PC),
      new EchoLoadout(SPACETREK_EXPLORER_MAINSLOT, STARRY_RADIANCE_5PC).requires(JINGRAN_RESONATOR),
      new EchoLoadout(FORMRENDER_MAINSLOT, TINGED_YEARNING_5PC).requires(JINHSI_RESONATOR, SUOMING_RESONATOR, HSIN_RESONATOR),
    ],
    mainstats: [mainstats(Mainstat.HP4, Mainstat.ER3, Mainstat.ER3, Mainstat.HP1, Mainstat.HP1)],
    substats: substats(Substat.Er, Substat.CritDmg, Substat.CritRate, Substat.Heavy, Substat.HpPct, Substat.FlatHp),
    highSubstats: highSubs(Substat.CritDmg, Substat.CritRate, Substat.Er, Substat.Heavy, Substat.HpPct, Substat.FlatHp, Substat.Skill),
  }),
  rotation: SL_ROTATION,
  sequences: SL_SEQUENCES,
});
