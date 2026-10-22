/**
 * Lily — a Spectro Pistols healer/support (3.8.1 beta). Her damage is two HP-scaled hits that read
 * her Energy Regen as crit (Intro - Eternal Bloom, the Finale ending either Woven heavy); what she
 * is worth is what she hands the team:
 *
 * - **Outro - Blooming Fragrance**: 25% All DMG Amplification for 30s.
 * - **Cradle Lullaby** (Liberation, 25s): every teammate's Intro adds a stack of Dream Aroma, +7%
 *   ATK each to the whole team, up to 4. Her own Intro ends both, so the stacks are the ones her
 *   two teammates' Intros build between her visits.
 * - **Silvered Dream** (an Outro inside 6s of a Finale, once every 25s): the active resonator's
 *   Echo Skill Crit. Rate +10% and Crit. DMG +20%, and +7% ATK per Unison Boon stack to a resonator
 *   that can trigger Unison Response.
 *
 * Her Resonance Skill only switches which Woven heavy the next full Dream Perfume (forte1, 300)
 * pays for, and the two carry the same MV and gains, so the rotation writes resolvers (BLEND,
 * WOVEN, FINALE) and plays whichever her state calls for. Dreambell Chime only decides when the
 * Finale comes out, and the channel always plays to its end here, so it is no gauge.
 *
 * Healing is the HEALS marker alone (status.ts): Woven's two ticks a second apart and Slumberland's
 * every 3s for 50s, both on her slot, so her weapon and sonata see each one.
 *
 * MVs, energy, concerto and off-tune off nanoka.cc (character 1512, the 3.8.1 static JSON) at skill
 * level 10, with the flat Concerto Regen rows added on cast and the dodge counter's hidden +10. The
 * ×1.4 twin rows on Eternal Bloom and both Finales are S5's, paid by SL_S5. Wuwalab has no Lily yet,
 * so every frame is a placeholder and **no Dream Perfume gain is declared**: nanoka gives none, and
 * only S3's 170 on Eternal Bloom is stated. Dreambind's continuous 19.89% is left out — its tick
 * rate is nowhere in the data.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, Position } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, coordinatedBuff } from "../../engine/gear.js";
import {
  addStat,
  addGain,
  applyCurrent,
  applyTeam,
  casting,
  currentMember,
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
} from "../../engine/context.js";
import { Action, ActionGroup, Cooldown, Rotation, SWAPIN, DODGE } from "../../engine/rotation.js";
import { heal } from "../../shared/status.js";
import { BOON_REACTOR, UNISON_BOON } from "../../shared/unison.js";
import { LULLABY } from "../../weapons/pistol.js";
import { CADENZA, STATIC_MIST } from "../../weapons/standard.js";
import { FALLACY, REJUV_5PC, ACTION_FALLACY } from "../../echoes/jinzhou.js";
import { FORMRENDER, TINGED_YEARNING_5PC, ACTION_FORMRENDER } from "../../echoes/mengzhou.js";
import { JINHSI_RESONATOR } from "./jinhsi.js";
import { SUOMING_RESONATOR } from "../electro/suoming.js";
import { HSIN_RESONATOR } from "../electro/hsin.js";
import { mainstats, Mainstat } from "../../shared/mainstats.js";
import { Echoes } from "../../shared/echoes.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { JINGRAN_RESONATOR } from "../fusion/jingran.js";
import { ACTION_SPACETREK, SPACETREK_EXPLORER, STARRY_RADIANCE_5PC } from "../../echoes/lahairoi.js";

/* ----------------------------------------------------------------------------------- states */

/** Nightmare Blend's mode: Woven Phantasm in place of Woven Fairytale until Reverie Blend. */
const PHANTASM_MODE = new Buff({ name: "Lily: Woven Phantasm" });
/** Set by the Liberation, spent by the Intro it turns into Eternal Bloom. */
const ETERNAL_READY = new Buff({ name: "Lily: Eternal Bloom Ready" });

/* ----------------------------------------------------------------------------------- actions */

function lilyAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Mend and Cleanse. PLACEHOLDER FRAMES throughout, every hit on its last frame: Stage 2, the Intro and
//     the Finale are sized so her opener runs 8.0s and her loop 6.0s
const BA1 = lilyAction("Basic - Mend and Cleanse 1", { animFrames: 60, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 60, mv: 7428, energy: 117, concerto: 374, offtune: 3736 },
  ]});
const BA2 = lilyAction("Basic - Mend and Cleanse 2", { chains: [BA1], animFrames: 75, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 75, mv: 2517, energy: 40, concerto: 127, offtune: 934 },
    ...[0, 1, 2].map(() => ({ hitFrame: 75, mv: 2517, energy: 40, concerto: 127, offtune: 1266 })),
  ]});
// both Intros "Press Normal Attack shortly after casting this skill to cast Basic Attack Stage 3"
const BA3 = lilyAction("Basic - Mend and Cleanse 3", { chains: () => [BA2, IntroFirst, IntroEternal], animFrames: 0, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 10609, energy: 167, concerto: 534, offtune: 5064 },
  ]});
// the dodge counter leads into Stage 4 too
const BA4 = lilyAction("Basic - Mend and Cleanse 4", { chains: () => [BA3, DC], animFrames: 0, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    ...[0, 1, 2].map(() => ({ hitFrame: 60, mv: 3977, energy: 63, concerto: 200, offtune: 760 })),
    { hitFrame: 0, mv: 3977, energy: 63, concerto: 200, offtune: 1600 },
  ]});
const MA = lilyAction("Mid-air - Plunging Attack", { castPosition: Position.Midair, endPosition: Position.Grounded, animFrames: 60, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 60, mv: 11452, energy: 180, concerto: 576, offtune: 5760 },
  ]});
const DC = lilyAction("Dodge Counter - Mend and Cleanse", { chains: [DODGE], animFrames: 60, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 60, mv: 9941, energy: 125, concerto: 400, offtune: 4000 },
  ], castConcerto: 1000});

// --- Dream Blend: one button switching the Woven heavy, both forms on one 5s cooldown, each
//     carrying the skill's flat Concerto Regen 8 on cast
const BLEND_CD = new Cooldown({ frames: 60 * 5 });
const BLEND_HIT = { hitFrame: 0, mv: 15905, energy: 250, concerto: 800, offtune: 8000 };
const NightmareBlend = lilyAction("Skill - Nightmare Blend", { forbidBuff: PHANTASM_MODE, animFrames: 0, castPriority: 4, cooldown: BLEND_CD,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [BLEND_HIT], castConcerto: 800,
  updateBuffs: () => applyCurrent(PHANTASM_MODE, 1),
});
const ReverieBlend = lilyAction("Skill - Reverie Blend", { requireBuff: PHANTASM_MODE, animFrames: 0, castPriority: 4, cooldown: BLEND_CD,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [BLEND_HIT], castConcerto: 800,
  updateBuffs: () => revokeCurrent(PHANTASM_MODE),
});

/** Woven's own heals: every second for 2s, on her slot. */
const WOVEN_HEALS = coordinatedBuff("Lily: Woven Healing", 2, () => LILY_RESONATOR, heal, { every: 1 });

// --- the Forte heavies: at full Dream Perfume, held Normal Attack spends the bar for a channel,
//     and the Finale ends it (cast by itself at the channel's end). 3s long, Woven Scent's
//     three ticks inside it; PLACEHOLDER hits at its end
const WOVEN = { minForte1: 300, resetForte1: true, animFrames: 180, castPriority: 6, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy,
  updateBuffs: () => applyTeam(WOVEN_HEALS, WOVEN_HEALS.maxStacks),
};
const WovenFairytale = lilyAction("Forte Heavy - Woven Fairytale", { ...WOVEN, forbidBuff: PHANTASM_MODE,
  bullets: Array.from({ length: 20 }, () => ({ hitFrame: 180, mv: 2486, energy: 105, offtune: 292 })) });
const WovenPhantasm = lilyAction("Forte Heavy - Woven Phantasm", { ...WOVEN, requireBuff: PHANTASM_MODE,
  bullets: Array.from({ length: 11 }, () => ({ hitFrame: 180, mv: 4519, energy: 191, offtune: 363 })) });

const FINALE = { animFrames: 24, castPriority: 6, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, scaling: Scaling.Hp,
  bullets: [{ hitFrame: 24, mv: 3579, energy: 800, offtune: 8000 }],
  updateBuffs: () => applyCurrent(SILLAGE, 1),
};
const FairytalesFinale = lilyAction("Heavy - Fairytale's Finale", { ...FINALE, chains: [WovenFairytale] });
const PhantasmsEnd = lilyAction("Heavy - Phantasm's End", { ...FINALE, chains: [WovenPhantasm] });

/** The Finale, Eternal Bloom and Phantasm's End: what her ER pays crit on, and S5/S6 multiply. */
const ER_CRIT_HITS = new Set<Action>([FairytalesFinale, PhantasmsEnd]);

// --- Into the Dream Cradle: no hit of its own, just Slumberland, Cradle Lullaby and Eternal Bloom.
//     PLACEHOLDER FRAMES, the time stop its whole 60
const Liberation = lilyAction("Liberation - Into the Dream Cradle", {
  animFrames: 60, castPriority: 10, timestop: [0, 60], motionStop: [0, 60], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, castConcerto: 2000, castEnergy: -17500,
  updateBuffs: () => {
    applyTeam(SLUMBERLAND, SLUMBERLAND.maxStacks);
    applyTeam(CRADLE_LULLABY, 1);
    applyCurrent(ETERNAL_READY, 1);
  },
});

// --- Blooming Dream: First Bloom, or Eternal Bloom on the first Intro after a Liberation, each
//     with the Intro's flat Concerto Regen 10. PLACEHOLDER FRAMES
const INTRO = { endPosition: Position.Grounded, animFrames: 15, castPriority: 11, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, castConcerto: 1000 };
const IntroFirst = lilyAction("Intro - First Bloom", { ...INTRO,
  bullets: Array.from({ length: 4 }, () => ({ hitFrame: 15, mv: 4692, energy: 74, offtune: 2360 })) });
const IntroEternal = lilyAction("Intro - Eternal Bloom", { ...INTRO, scaling: Scaling.Hp, requireBuff: ETERNAL_READY,
  bullets: [{ hitFrame: 15, mv: 3609, energy: 275, offtune: 80800 }],
  updateBuffs: () => revokeCurrent(ETERNAL_READY),
});
ER_CRIT_HITS.add(IntroEternal);

/** Blooming Fragrance: the team's 25% amplification, and Silvered Dream where a Finale's Sillage
 *  still stands. */
const Outro = lilyAction("Outro - Blooming Fragrance", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => {
    applyTeam(BLOOMING_FRAGRANCE, 1);
    if (!isHeld(SILLAGE) || isHeld(SILVERED_DREAM_ICD)) return;
    revokeCurrent(SILLAGE);
    applyCurrent(SILVERED_DREAM_ICD, 1);
    applyTeam(SILVERED_DREAM, 1);
  },
});

/** The presses the rotation writes for the two-form buttons, resolved off her Blend mode. */
const BLEND = new Action("Skill - Dream Blend", { resolve: () => (isHeld(PHANTASM_MODE) ? ReverieBlend : NightmareBlend) });
const WOVEN_HEAVY = new Action("Forte Heavy - Woven", { resolve: () => (isHeld(PHANTASM_MODE) ? WovenPhantasm : WovenFairytale) });
const FINALE_HEAVY = new Action("Heavy - Finale", { resolve: () => (isHeld(PHANTASM_MODE) ? PhantasmsEnd : FairytalesFinale) });

/* ------------------------------------------------------------------------------------- buffs */

/** Slumberland: a heal every 3s for 50s, on her slot whoever is on field. */
const SLUMBERLAND = coordinatedBuff("Lily: Slumberland", 50, () => LILY_RESONATOR, heal, { every: 3 });

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

/** Sillage: 6s off either Finale, spent by the Outro for Silvered Dream (once every 25s). */
const SILLAGE = new Buff({ name: "Lily: Sillage", duration: 60 * 6 });
const SILVERED_DREAM_ICD = new Buff({ duration: 60 * 25 });
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

/** Woven Scent's first half: 6 Concerto a second for 3s. */
const WOVEN_SCENT = new Buff({
  name: "Inherent: Woven Scent",
  duration: 60 * 3,
  tick: { every: 60, fire: () => addGain({ concerto: 600 }) },
});
const WOVEN_SCENT_ICD = new Buff({ duration: 60 * 20 });
const FINALE_SCENT_ICD = new Buff({ duration: 60 * 20 });

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

/** S3: Eternal Bloom's cast adds 25 Concerto and 170 Dream Perfume. Its faster Dreambell Chime
 *  and +50% healing reach no formula here. */
const SL_S3 = new Sequence({
  name: "Lily S3: May Your Soul Wander No More",
  updateBuffs: () => { if (runningAction(IntroEternal)) addGain({ concerto: 2500, forte1: 170 }); },
});

const SL_S4 = new Sequence({ name: "Lily S4: May Your Past Sink into Silence" });

const SL_S5 = new Sequence({
  name: "Lily S5: May You Find Peace in Endless Light",
  applyStats: () => { if (runningAnyOf(ER_CRIT_HITS)) addStat(Stat.MulMv, 40); },
});

/** S6: those three deal 500% more Spectro DMG, read as Mornye's S6 "deals 400% more DMG" is. */
const SL_S6 = new Sequence({
  name: "Lily S6: May My Reverie Never End",
  applyStats: () => { if (runningAnyOf(ER_CRIT_HITS)) addStat(Stat.DmgBonus, 500, Attribute.Spectro); },
});

const SL_SEQUENCES = [SL_S1, SL_S2, SL_S3, SL_S4, SL_S5, SL_S6];

/* --------------------------------------------------------------------------- kit and loadout */

/** Woven Scent (Inherent Skill): a Woven heavy starts 6 Concerto a second for 3s, a Finale adds 10,
 *  each once every 20s. */
const SL_INHERENT_1 = new Inherent({
  name: "Inherent: Woven Scent",
  updateBuffs: () => {
    if ((runningAction(WovenFairytale) || runningAction(WovenPhantasm)) && !isHeld(WOVEN_SCENT_ICD)) {
      applyCurrent(WOVEN_SCENT_ICD, 1);
      applyCurrent(WOVEN_SCENT, 1);
    }
    if ((runningAction(FairytalesFinale) || runningAction(PhantasmsEnd)) && !isHeld(FINALE_SCENT_ICD)) {
      applyCurrent(FINALE_SCENT_ICD, 1);
      addGain({ concerto: 1000 });
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
  intro: () => (isHeld(ETERNAL_READY) ? IntroEternal : IntroFirst),
  swapIn: BA1,
  swapInAir: MA,
  maxEnergy: 17500,
  maxForte1: 300,
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
const BA1234 = new ActionGroup("Basic - Mend and Cleanse 1234", [BA1, BA2, BA3, BA4]);
const BA34 = new ActionGroup("Basic - Mend and Cleanse 34", [BA3, BA4]);

/** Basics for Dream Perfume and Concerto, the Blend for its hit, the Woven channel into its Finale,
 *  and the Liberation last so Slumberland and Cradle Lullaby open on the teammates' visits. The
 *  Intro chains straight into Stage 3. Concerto per loop: ~110 before Lullaby's 8. */
const SL_ROTATION = new Rotation([
  SWAPIN, BA1234, BA12, BLEND, WOVEN_HEAVY, FINALE_HEAVY,
  Liberation, ACTION_FALLACY.instaSwap(), ACTION_FORMRENDER.instaSwap(), ACTION_SPACETREK.instaSwap(), Outro,

  IntroFirst, IntroEternal, BA34, BA12, BLEND, WOVEN_HEAVY, FINALE_HEAVY,
  Liberation, ACTION_FALLACY.instaSwap(), ACTION_FORMRENDER.instaSwap(), ACTION_SPACETREK.instaSwap(), Outro,
]);

export const LILY = new Loadout({
  id: 15121,
  resonator: LILY_RESONATOR,
  weapons: [LULLABY, CADENZA, STATIC_MIST],
  echoes: new Echoes({
    sets: [
      new EchoLoadout(FALLACY, REJUV_5PC),
      new EchoLoadout(SPACETREK_EXPLORER, STARRY_RADIANCE_5PC).requires(JINGRAN_RESONATOR),
      new EchoLoadout(FORMRENDER, TINGED_YEARNING_5PC).requires(JINHSI_RESONATOR, SUOMING_RESONATOR, HSIN_RESONATOR),
    ],
    mainstats: [mainstats(Mainstat.HP4, Mainstat.ER3, Mainstat.ER3, Mainstat.HP1, Mainstat.HP1)],
    substats: substats(Substat.Er, Substat.CritDmg, Substat.CritRate, Substat.Heavy, Substat.HpPct, Substat.FlatHp),
    highSubstats: highSubs(Substat.CritDmg, Substat.CritRate, Substat.Er, Substat.Heavy, Substat.HpPct, Substat.FlatHp, Substat.Skill),
  }),
  rotation: SL_ROTATION,
  sequences: SL_SEQUENCES,
});
