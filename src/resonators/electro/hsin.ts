/**
 * Hsin — a limited 5-star electro Rectifier main DPS with two forms and two Resonance Modes, one
 * loadout each: HSIN (Resonance Mode - Electro Flare) and HSIN_UNISON (Resonance Mode - Unison).
 *
 * Answering Form is her ground state: presses bank Answering Heart (forte1, 0-100), and at 100 her
 * Heavy becomes Realm Wanderer/Protector, which spends it and unlocks Formshift. Formshift (a
 * Liberation cast) turns her into Illumining Form for the Heart Manifest window: 21 Edict for
 * Soaring Pillar coordinated hits, 5 Electro Flare, and Illumining presses bank Illumining Heart
 * (forte2, 0-300). At 300 her Skill becomes Pillars Aligned, opening Mechanism Dominion, whose
 * presses spend the Heart; empty, her Heavy becomes Beholding/Stilling All Horizons and unlocks
 * Pillars Across Heaven, the real Liberation, which ends Heart Manifest and returns her to
 * Answering Form.
 *
 * Flare mode's own loop: every Electro Rage the team inflicts becomes Heart of Thunder on her
 * (cap 100) and is taken off the target; Skill - Illumining Form (Heartward by Moon) fires it as one
 * Electro Flare DMG instance, 35% of the current rung a stack, then clears it. Thunderglow
 * (one a stack teammates inflict, cap 10, while she is out of Heart Manifest) arms Fleeting
 * Thunder in each Manifest: while it stands the target's Flare is pinned at its cap (16 at most),
 * so every Flare anyone lands overflows straight into Electro Rage for her Heart of Thunder.
 * Pillars Across Heaven ends Manifest and takes the mark with it.
 *
 * That the tick spends no stacks is a *separate* clause, keyed to her entering combat rather than
 * to the mark — status.ts's FLARE_RETAINED, laid once by the mode's combatStart — so it stands for
 * the whole fight and Pillars does not take it down. The target therefore stays at the cap between Manifests too, and the Flare a
 * teammate lands there is Rage rather than stacks that were going to halve away.
 *
 * Numbers from encore.moe's beta data (character 1311, `?v=Beta`) at skill level 10: motion
 * values, energy, concerto (per-hit ElementPower plus the flat Concerto Regen rows) and off-tune
 * (WeaknessLvl x10000) per hit, checked unit for unit against Buling's own rows. Base stats and
 * the talent tree from the same file. The per-hit Answering/Illumining Heart gains and what each
 * Mechanism Dominion press spends are the game's own SpecialEnergy1/SpecialEnergy2 rows, a
 * hundredth of the point each (708 = 7.08 Answering Heart); they add on top of the kit text's flat
 * grants, the way Concerto Regen rows do — 60 on an Answering Intro, 300 on a Unison Illumining
 * one, 150 on the primed Heartlock collapse, 100 more on the Intro at S2. Dodge Counter -
 * Illumining Form: Pillars Aligned has no published row, so it spends nothing here. Everything
 * else comes from nanoka's 3.7.2 data for her (character 1311), which also re-tuned the off-tune of
 * Realm Protector, Pillars Aligned, Stilling All Horizons and Pillars Across Heaven — note that
 * CDN's older version directories are stale earlier betas, not older patches.
 * Sequences 1-6 are modelled off that same file — see their own block below.
 *
 * Unison mode (shared/unison.ts): the first Formshift after any of her Intros grants Unison, and
 * she can trigger Unison Response.
 * Her four Intro forms are the mode's own smaller ones, replaced by the Manifold Unison pair —
 * Resonance Skill DMG, far larger — on a Unison Response, which also banks Source Intent, or by
 * spending Source Intent on an Intro that is no response. An Illumining Intro of either kind
 * lands her straight in Mechanism Dominion with 300 Illumining Heart. Tides of Succession is +50%
 * ATK off a Manifold Intro, lost on swap; Gleaning Simple Joys lets the team's
 * Unison Boon reach three stacks and hands one to everyone off *any* member's response; and her
 * Outro spends Nightglow on Shared Light — every teammate who gained a Unison of their own takes
 * +20% All DMG Amplification for 30s. The loop is Jinhsi's double-Intro shape: an Answering
 * visit ending on Formshift's Unison outro, the resonator behind her plays, and their outro
 * brings her back in Illumining Form for Dominion, Stilling and Pillars Across Heaven.
 */
import { Tier, Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, ResonanceMode, Sequence, Resonator, Loadout, EchoLoadout, coordinatedBuff } from "../../engine/gear.js";
import {
  addBuff,
  addStat,
  applied,
  asSource,
  appliedByMember,
  applyCurrent,
  applyEnemy,
  applyTeam,
  casting,
  consume,
  currentAction,
  runningAnyOf,
  runningAction,
  currentTeam,
  frozenStacks,
  isHeld,
  queue,
  removeStack,
  revokeCurrent,
  revokeEnemy,
  revokeTeam,
  setStacksSelf,
  stacksOf,
  stacksOfEnemy,
  stacksOfTeam,
  isActive,
  forte2,
  setForte2,
  addForte1,
  pressed,
} from "../../engine/context.js";
import { Action, ActionField, ActionGroup, Rotation, ECHO, NOINTRO, ActionTag, INTRO, START_3, DOUBLE_INTRO } from "../../engine/rotation.js";
import { UNISON, UNISON_BOON, UNISON_RESPONSE, grantBoon, respondToUnison, boonPayout, unisonIntro, unisonOutro, unisonResponse } from "../../shared/unison.js";
import { ELECTRO_FLARE, ELECTRO_RAGE, FLARE_RETAINED, inflictElectroFlare } from "../../shared/status.js";
import { BLOOMING_JADEHAVEN, FREEZE_FRAME, LETHEAN_ELEGY, STRINGMASTER } from "../../weapons/rectifier.js";
import { COSMIC_RIPPLES } from "../../weapons/standard.js";
import { STAY_TUNED_HSIN, SWORN_VIGIL_5PC } from "../../echoes/mengzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function hsinAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

/** One of her own Electro Flare DMG instances: a dot-scaled Status hit carrying no motion value of
 *  its own — the rung the target is standing on is what it is worth, added by the status itself
 *  (status.ts's own ELECTRO_FLARE, so the value is sourced to the Flare that set it) — and `mul`
 *  is the percentage the kit text puts on top of that rung: +75 for a 175% instance, -65 for 35%.
 *  `source`, where the percentage is a count's rather than the cast's, names the gear the panel
 *  files it under, the same way the rung itself is filed under the Flare (read late, since the
 *  buffs are declared below the actions). */
const flareHit = (name: string, mul: () => number, def: object = {}, source: (() => Buff) | null = null): Action =>
  new Action(name, {
    element: Attribute.Electro, type: Type.Status, subtype: Subtype.ElectroFlare, scaling: Scaling.Dot, hits: [{ at: 0 }],
    applyStats: () => {
      if (source) asSource(source(), () => addStat(Stat.MulMv, mul()));
      else addStat(Stat.MulMv, mul());
    },
    ...def,
  });

// --- Answering Form: basics, heavy, mid-air, dodge counter, skill (Manifold Bloom). Every hit
//     banks Answering Heart, and only these do.
// PLACEHOLDER FRAMES
const BA1 = hsinAction("Basic - Answering Form 1", { animFrames: 30, commitFrames: 16, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 16, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 16, mv: 41.76, energy: 0.75, concerto: 1.2, offtune: 2400, forte1: 7.08 },
  ]});
// PLACEHOLDER FRAMES
const BA2 = hsinAction("Basic - Answering Form 2", { animFrames: 64, commitFrames: 42, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 42, mv: 15.15, energy: 0.2751, concerto: 0.4372, offtune: 870.9449 },
    { at: 42, mv: 15.15, energy: 0.2751, concerto: 0.4372, offtune: 870.9449 },
    { at: 42, mv: 68.14, energy: 1.2374, concerto: 1.9663, offtune: 3917.2401 },
    { at: 42, mv: 53, energy: 0.9624, concerto: 1.5293, offtune: 3046.8701, forte1: 15.4 },
  ]});
// PLACEHOLDER FRAMES
const BA3 = hsinAction("Basic - Answering Form 3", { animFrames: 66, commitFrames: 12, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 12, mv: 31.51, energy: 0.57, concerto: 0.48, offtune: 960.0609 },
    { at: 12, mv: 31.51, energy: 0.57, concerto: 0.48, offtune: 960.0609 },
    { at: 12, mv: 23.63, energy: 0.4275, concerto: 0.36, offtune: 719.9695 },
    { at: 12, mv: 23.63, energy: 0.4275, concerto: 0.36, offtune: 719.9695 },
    { at: 12, mv: 47.26, energy: 0.855, concerto: 0.72, offtune: 1439.9392, forte1: 8.51 },
  ]});
// PLACEHOLDER FRAMES
const BA4 = hsinAction("Basic - Answering Form 4", { animFrames: 89, commitFrames: 77, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 77, mv: 39.72, energy: 0.718, concerto: 1.5701, offtune: 3134.7578 },
    { at: 77, mv: 39.72, energy: 0.718, concerto: 1.5701, offtune: 3134.7578 },
    { at: 77, mv: 119.15, energy: 2.154, concerto: 4.7098, offtune: 9403.4844, forte1: 27.7 },
  ]});
// PLACEHOLDER FRAMES
const HA = hsinAction("Heavy - Answering Form", { animFrames: 44, commitFrames: 0, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 44, mv: 10.28, energy: 0.1861, concerto: 0.3001, offtune: 590.8299 },
    { at: 44, mv: 20.55, energy: 0.372, concerto: 0.5999, offtune: 1181.0851 },
    { at: 44, mv: 10.28, energy: 0.1861, concerto: 0.3001, offtune: 590.8299 },
    { at: 44, mv: 20.55, energy: 0.372, concerto: 0.5999, offtune: 1181.0851 },
    { at: 44, mv: 20.55, energy: 0.372, concerto: 0.5999, offtune: 1181.0851 },
    { at: 44, mv: 20.55, energy: 0.3718, concerto: 0.6001, offtune: 1181.0849, forte1: 10.46 },
  ]});
const MA = hsinAction("Mid-air - Answering Form Plunge", { animFrames: 58, commitFrames: 40, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 22.44, energy: 0.41, concerto: 0.65, offtune: 2080, forte1: 2.28 });
// PLACEHOLDER FRAMES
const ReignHold = hsinAction("Heavy - Answering Form: Reign at Ease (Mid-Air)", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600 },
    { at: 0, mv: 27.84, energy: 0.5, concerto: 0.8, offtune: 1600, forte1: 76.5 },
  ]});
const ReignPlunge = hsinAction("Mid-air - Answering Form: Reign at Ease Plunge", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 22.44, energy: 0.41, concerto: 0.65, offtune: 2080, forte1: 2.28 });
// PLACEHOLDER FRAMES
const DC = hsinAction("Dodge Counter - Answering Form", { animFrames: 61, commitFrames: 38, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 38, mv: 44.98, energy: 0.812, concerto: 1.296, offtune: 2586 },
    { at: 38, mv: 44.98, energy: 0.812, concerto: 1.296, offtune: 2586 },
    { at: 38, mv: 67.47, energy: 1.218, concerto: 1.944, offtune: 3879 },
    { at: 38, mv: 67.47, energy: 1.218, concerto: 1.944, offtune: 3879, forte1: 22.86 },
  ], castConcerto: 10});
// PLACEHOLDER FRAMES
const Skill = hsinAction("Skill - Answering Form", { animFrames: 95, commitFrames: 69, cooldown: 60 * 12, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 69, mv: 25.06, energy: 0.45, concerto: 0.36, offtune: 1440.0575 },
    { at: 69, mv: 25.06, energy: 0.45, concerto: 0.36, offtune: 1440.0575 },
    { at: 69, mv: 25.06, energy: 0.45, concerto: 0.36, offtune: 1440.0575 },
    { at: 69, mv: 16.71, energy: 0.3001, concerto: 0.2401, offtune: 960.2299 },
    { at: 69, mv: 16.71, energy: 0.3001, concerto: 0.2401, offtune: 960.2299 },
    { at: 69, mv: 58.46, energy: 1.0498, concerto: 0.8398, offtune: 3359.3677, forte1: 8.52 },
  ]});

// --- Answering Form: Realm Wanderer at 100 Answering Heart, Realm Protector when Resolution of
//     Wishes (once per 24s — every visit) is spent on it. Both Skill DMG, both unlock Formshift.
const REALM = {
  node: Node.Forte, cast: Cast.Heavy, type: Type.Skill, concerto: 8.64, castForte1: -100,
  updateBuffs: () => applyCurrent(FORMSHIFT_UNLOCKED, 1),
};
// PLACEHOLDER FRAMES
const RealmWanderer = hsinAction("Forte Heavy - Answering Form: Realm Wanderer", { animFrames: 122, commitFrames: 106, ...REALM, hits: [
    { at: 106, mv: 45.65, energy: 0.4312, concerto: 0.6912, offtune: 1374.172 },
    { at: 106, mv: 11.42, energy: 0.1079, concerto: 0.1729, offtune: 343.7688 },
    { at: 106, mv: 11.42, energy: 0.1079, concerto: 0.1729, offtune: 343.7688 },
    { at: 106, mv: 11.42, energy: 0.1079, concerto: 0.1729, offtune: 343.7688 },
    { at: 106, mv: 11.42, energy: 0.1079, concerto: 0.1729, offtune: 343.7688 },
    { at: 106, mv: 11.42, energy: 0.1079, concerto: 0.1729, offtune: 343.7688 },
    { at: 106, mv: 11.42, energy: 0.1079, concerto: 0.1729, offtune: 343.7688 },
    { at: 106, mv: 456.45, energy: 4.3114, concerto: 6.9114, offtune: 13740.2152 },
  ]});
// PLACEHOLDER FRAMES
const RealmProtector = hsinAction("Forte Heavy - Answering Form: Realm Protector", {
  animFrames: 122, commitFrames: 107,
  ...REALM, hits: [
    { at: 107, mv: 99.32, energy: 1.0712, concerto: 0.6912, offtune: 5175.8084,
      updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(1); } },
    { at: 107, mv: 24.83, energy: 0.2678, concerto: 0.1728, offtune: 1293.9521 },
    { at: 107, mv: 24.83, energy: 0.2678, concerto: 0.1728, offtune: 1293.9521 },
    { at: 107, mv: 24.83, energy: 0.2678, concerto: 0.1728, offtune: 1293.9521 },
    { at: 107, mv: 24.83, energy: 0.2678, concerto: 0.1728, offtune: 1293.9521 },
    { at: 107, mv: 24.83, energy: 0.2678, concerto: 0.1728, offtune: 1293.9521 },
    { at: 107, mv: 24.83, energy: 0.2678, concerto: 0.1728, offtune: 1293.9521 },
    { at: 107, mv: 993.15, energy: 10.712, concerto: 6.912, offtune: 51755.479 },
  ],
});

// --- Illumining Form outside Mechanism Dominion: Stage 1 plants the Modular Heartlock, Stage 2,
//     the Heavy, the Dodge Counter and the Skill collapse it. Every hit banks Illumining Heart.
const collapseHeartlock = (): void => { if (isHeld(HEARTLOCK)) { revokeCurrent(HEARTLOCK); queue(Heartlock); } };
const COLLAPSE = { updateBuffs: collapseHeartlock };
// PLACEHOLDER FRAMES
const IBA1 = hsinAction("Basic - Illumining Form 1", { animFrames: 45, commitFrames: 30, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 30, mv: 12.55, energy: 0.228, concerto: 0.366, offtune: 721.8 },
    { at: 30, mv: 12.55, energy: 0.228, concerto: 0.366, offtune: 721.8 },
    { at: 30, mv: 37.65, energy: 0.684, concerto: 1.098, offtune: 2165.4, forte2: 28.55 },
  ], updateBuffs: () => applyCurrent(HEARTLOCK, 1) });
// PLACEHOLDER FRAMES
const IBA2 = hsinAction("Basic - Illumining Form 2", { animFrames: 30, commitFrames: 18, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 18, mv: 34.8, energy: 0.63, concerto: 1, offtune: 2000 },
    { at: 18, mv: 34.8, energy: 0.63, concerto: 1, offtune: 2000, forte2: 31.66 },
  ], ...COLLAPSE });
// PLACEHOLDER FRAMES
const IBA3 = hsinAction("Basic - Illumining Form 3", { animFrames: 98, commitFrames: 53, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 53, mv: 9.11, energy: 0.1671, concerto: 0.2651, offtune: 523.7875 },
    { at: 53, mv: 9.11, energy: 0.1671, concerto: 0.2651, offtune: 523.7875 },
    { at: 53, mv: 9.11, energy: 0.1671, concerto: 0.2651, offtune: 523.7875 },
    { at: 53, mv: 9.11, energy: 0.1671, concerto: 0.2651, offtune: 523.7875 },
    { at: 53, mv: 18.21, energy: 0.334, concerto: 0.53, offtune: 1047 },
    { at: 53, mv: 18.21, energy: 0.334, concerto: 0.53, offtune: 1047 },
    { at: 53, mv: 27.31, energy: 0.5009, concerto: 0.7949, offtune: 1570.2125 },
    { at: 53, mv: 27.31, energy: 0.5009, concerto: 0.7949, offtune: 1570.2125 },
    { at: 53, mv: 27.31, energy: 0.5009, concerto: 0.7949, offtune: 1570.2125 },
    { at: 53, mv: 27.31, energy: 0.5009, concerto: 0.7949, offtune: 1570.2125, forte2: 82.8 },
  ]});
// PLACEHOLDER FRAMES
const Heartlock = hsinAction("Basic - Illumining Form: Modular Heartlock", { animFrames: 7, commitFrames: 0, node: Node.Normal, type: Type.Basic, hits: [
    { at: 7, mv: 20.92, energy: 0.38, concerto: 0.61, offtune: 1203 },
    { at: 7, mv: 20.92, energy: 0.38, concerto: 0.61, offtune: 1203, forte2: 19.04 },
  ]});
// PLACEHOLDER FRAMES
const IHA = hsinAction("Heavy - Illumining Form", { animFrames: 43, commitFrames: 32, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 32, mv: 53.93, energy: 0.97, concerto: 1.55, offtune: 3100 },
    { at: 32, mv: 53.93, energy: 0.97, concerto: 1.55, offtune: 3100, forte2: 31.66 },
  ], ...COLLAPSE });
// PLACEHOLDER FRAMES
const UpwardCut = hsinAction("Basic - Illumining Form: Upward Cut", { animFrames: 38, commitFrames: 34, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 34, mv: 35.03, energy: 0.632, concerto: 1.0121, offtune: 2014.115 },
    { at: 34, mv: 52.54, energy: 0.948, concerto: 1.5179, offtune: 3020.885, forte2: 39.84 },
  ]});
// PLACEHOLDER FRAMES
const IMA = hsinAction("Mid-air - Illumining Form Plunge", { animFrames: 53, commitFrames: 47, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 47, mv: 13.47, energy: 0.252, concerto: 0.39, offtune: 1248 },
    { at: 47, mv: 8.98, energy: 0.168, concerto: 0.26, offtune: 832, forte2: 10.22 },
  ]});
// PLACEHOLDER FRAMES
const IDC = hsinAction("Dodge Counter - Illumining Form", { animFrames: 43, commitFrames: 32, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 32, mv: 95.68, energy: 1.72, concerto: 2.75, offtune: 5500 },
    { at: 32, mv: 95.68, energy: 1.72, concerto: 2.75, offtune: 5500, forte2: 73.98 },
  ], castConcerto: 10, ...COLLAPSE });

/** Heartward by Moon's last stage: one Electro Flare DMG instance at 35% of the target's rung per
 *  Heart of Thunder she holds (42% at S1). The stacks are all cleared a moment after the cast. */
const ThunderHit = flareHit("Skill - Illumining Form: Heart of Thunder",
  () => (isHeld(HS_S1) ? 42 : 35) * stacksOfTeam(HEART_OF_THUNDER) - 100,
  { convertStats: () => revokeTeam(HEART_OF_THUNDER) }, () => HEART_OF_THUNDER);

/** Skill - Illumining Form (Heartward by Moon): the Heart of Thunder instance above, and a collapse. */
// PLACEHOLDER FRAMES
const ISkill = hsinAction("Skill - Illumining Form", { animFrames: 100, commitFrames: 90, cooldown: 60 * 20,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 90, mv: 11.14, energy: 0.2001, concerto: 0.3201, offtune: 640.2874 },
    { at: 90, mv: 11.14, energy: 0.2001, concerto: 0.3201, offtune: 640.2874 },
    { at: 90, mv: 11.14, energy: 0.2001, concerto: 0.3201, offtune: 640.2874 },
    { at: 90, mv: 11.14, energy: 0.2001, concerto: 0.3201, offtune: 640.2874 },
    { at: 90, mv: 178.14, energy: 3.1996, concerto: 5.1196, offtune: 10238.8504, forte2: 114.49 },
  ],
  updateBuffs: () => {
    collapseHeartlock();
    if (stacksOfTeam(HEART_OF_THUNDER) > 0) queue(ThunderHit);
  },
});

// --- Illumining Form: Pillars Aligned at 300 Illumining Heart opens Mechanism Dominion (13s), and
//     the Dominion presses spend the Heart per hit.
//     In Flare mode Pillars Aligned lays 5 Electro Flare, and each Dominion cast lays 1 more —
//     five of those a Formshift, whichever casts spend them (PILLAR_CHARGES).
const pillarFlare = (): void => {
  if (!isHeld(MODE_FLARE) || !stacksOf(PILLAR_CHARGES)) return;
  inflictElectroFlare(1); removeStack(PILLAR_CHARGES, 1);
};
const PILLAR_FLARE = { updateDebuffs: pillarFlare };
// PLACEHOLDER FRAMES
const PillarsAligned = hsinAction("Forte Skill - Illumining Form: Pillars Aligned", {
  animFrames: 152, commitFrames: 122, timestop: 30, motionStop: 152,
  cooldown: 60 * 12,
  node: Node.Forte, cast: Cast.Skill, type: Type.Skill, hits: [
    {
      at: 122, mv: 179.43, energy: 1.026, concerto: 2.6339, offtune: 3253.5275,
      updateDebuffs: () => {
        if (isHeld(MODE_FLARE)) inflictElectroFlare(5);
        pillarFlare();
      },
    },
    { at: 122, mv: 179.43, energy: 1.026, concerto: 2.6339, offtune: 3253.5275 },
    { at: 122, mv: 179.43, energy: 1.026, concerto: 2.6339, offtune: 3253.5275 },
    { at: 122, mv: 179.43, energy: 1.026, concerto: 2.6339, offtune: 3253.5275 },
    { at: 122, mv: 17.95, energy: 0.1026, concerto: 0.2635, offtune: 325.4797 },
    { at: 122, mv: 35.89, energy: 0.2052, concerto: 0.5268, offtune: 650.778 },
    { at: 122, mv: 35.89, energy: 0.2052, concerto: 0.5268, offtune: 650.778 },
    { at: 122, mv: 44.86, energy: 0.2565, concerto: 0.6585, offtune: 813.4272 },
    { at: 122, mv: 44.86, energy: 0.2565, concerto: 0.6588, offtune: 813.4271 },
  ],
  applyStats: () => { setForte2(300); },
  updateBuffs: () => applyCurrent(MECHANISM_DOMINION, 1),
});
// PLACEHOLDER FRAMES
const FBA1 = hsinAction("Basic - Illumining Form: Pillars Aligned 1", { animFrames: 35, commitFrames: 12, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 12, mv: 28.86, energy: 0.52, concerto: 0.83, offtune: 1659,
      ...PILLAR_FLARE },
    { at: 12, mv: 28.86, energy: 0.52, concerto: 0.83, offtune: 1659 },
    { at: 12, mv: 28.86, energy: 0.52, concerto: 0.83, offtune: 1659 },
  ], castForte2: -59.16});
// PLACEHOLDER FRAMES
const FBA2 = hsinAction("Basic - Illumining Form: Pillars Aligned 2", { animFrames: 49, commitFrames: 15, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 15, mv: 38.23, energy: 0.69, concerto: 1.1, offtune: 2198,
      ...PILLAR_FLARE },
    { at: 15, mv: 38.23, energy: 0.69, concerto: 1.1, offtune: 2198 },
    { at: 15, mv: 38.23, energy: 0.69, concerto: 1.1, offtune: 2198 },
  ], castForte2: -78.36});
// PLACEHOLDER FRAMES
const FBA3 = hsinAction("Basic - Illumining Form: Pillars Aligned 3", { animFrames: 46, commitFrames: 39, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 39, mv: 21.35, energy: 0.39, concerto: 0.62, offtune: 1228,
      ...PILLAR_FLARE },
    { at: 39, mv: 21.35, energy: 0.39, concerto: 0.62, offtune: 1228 },
    { at: 39, mv: 21.35, energy: 0.39, concerto: 0.62, offtune: 1228 },
    { at: 39, mv: 21.35, energy: 0.39, concerto: 0.62, offtune: 1228 },
    { at: 39, mv: 21.35, energy: 0.39, concerto: 0.62, offtune: 1228 },
  ], castForte2: -72.95});
// PLACEHOLDER FRAMES
const FBA4 = hsinAction("Basic - Illumining Form: Pillars Aligned 4", { animFrames: 90, commitFrames: 67, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 67, mv: 16.64, energy: 0.3, concerto: 0.4801, offtune: 956.1149,
      ...PILLAR_FLARE },
    { at: 67, mv: 16.64, energy: 0.3, concerto: 0.4801, offtune: 956.1149 },
    { at: 67, mv: 16.64, energy: 0.3, concerto: 0.4801, offtune: 956.1149 },
    { at: 67, mv: 16.64, energy: 0.3, concerto: 0.4801, offtune: 956.1149 },
    { at: 67, mv: 16.64, energy: 0.3, concerto: 0.4801, offtune: 956.1149 },
    { at: 67, mv: 16.64, energy: 0.3, concerto: 0.4801, offtune: 956.1149 },
    { at: 67, mv: 16.64, energy: 0.3, concerto: 0.4801, offtune: 956.1149 },
    { at: 67, mv: 49.9, energy: 0.9, concerto: 1.4393, offtune: 2867.1957 },
  ], castForte2: -113.68});
// PLACEHOLDER FRAMES
const FADC = hsinAction("Dodge Counter - Illumining Form: Pillars Aligned", { animFrames: 49, commitFrames: 15, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Basic, hits: [
    { at: 15, mv: 66.07, energy: 1.19, concerto: 5.2333, offtune: 3798,
      ...PILLAR_FLARE },
    { at: 15, mv: 66.07, energy: 1.19, concerto: 5.2333, offtune: 3798 },
    { at: 15, mv: 66.07, energy: 1.19, concerto: 5.2334, offtune: 3798 },
  ]});
const FBA1234 = new ActionGroup("Basic - Illumining Form: Pillars Aligned 1234", [FBA1, FBA2, FBA3, FBA4]);
const FBA123 = new ActionGroup("Basic - Illumining Form: Pillars Aligned 123", [FBA1, FBA2, FBA3]);
const FBA12 = new ActionGroup("Basic - Illumining Form: Pillars Aligned 12", [FBA1, FBA2]);
const BA1234 = new ActionGroup("Basic - Answering Form 1234", [BA1, BA2, BA3, BA4]);

// --- Illumining Form: Beholding All Horizons once the Heart is spent, Stilling when Law of Heaven
//     (once per 24s — every visit) is spent on it. Both end Dominion and unlock Pillars Across Heaven.
const HORIZONS = {
  node: Node.Forte, cast: Cast.Heavy, type: Type.Skill, resetForte2: true,
  updateBuffs: () => { revokeCurrent(MECHANISM_DOMINION); applyCurrent(PILLARS_UNLOCKED, 1); },
};
// PLACEHOLDER FRAMES
const Beholding = hsinAction("Forte Heavy - Illumining Form: Beholding All Horizons", { animFrames: 150, commitFrames: 150, timestop: 150, motionStop: 150, ...HORIZONS, hits: [
    { at: 150, mv: 10.27, energy: 0.0523, offtune: 2.5501 },
    { at: 150, mv: 10.27, energy: 0.0523, offtune: 2.5501 },
    { at: 150, mv: 10.27, energy: 0.0523, offtune: 2.5501 },
    { at: 150, mv: 10.27, energy: 0.0523, offtune: 2.5501 },
    { at: 150, mv: 369.7, energy: 1.8808, offtune: 91.7996 },
  ]});
// PLACEHOLDER FRAMES
const FHA = hsinAction("Forte Heavy - Illumining Form: Stilling All Horizons", {
  animFrames: 150, commitFrames: 150, timestop: 150, motionStop: 150,
  ...HORIZONS, hits: [
    { at: 150, mv: 27.05, energy: 0.3524, offtune: 1188.3405,
      updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(5); } },
    { at: 150, mv: 27.05, energy: 0.3524, offtune: 1188.3405 },
    { at: 150, mv: 27.05, energy: 0.3524, offtune: 1188.3405 },
    { at: 150, mv: 27.05, energy: 0.3524, offtune: 1188.3405 },
    { at: 150, mv: 973.49, energy: 12.6804, offtune: 42766.638 },
  ],
});

// --- the two Liberations: Formshift into Illumining Form, Pillars Across Heaven back out of it
const Lib1 = hsinAction("Liberation - Formshift", {
  animFrames: 254, commitFrames: 254, timestop: 254, motionStop: 254,
  cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, concerto: 20, resetForte2: true,
  // Flare mode: the Heart Manifest it opens pins the target's Flare at the cap, and forces it up
  // there the moment it starts — so her own 5 Flare all overflow into Electro Rage and bank as
  // Heart of Thunder through Forms Turn, Heart Abides (MODE_FLARE): 6 Flare, Formshift, 13 Flare
  // and +5 Heart. Filled here, ahead of the inflict, since Gleaning's own fill only follows in
  // its hitGlobal.
  updateDebuffs: () => {
    if (!isHeld(MODE_FLARE)) return;
    const room = currentTeam().enemyMax(ELECTRO_FLARE) - stacksOfEnemy(ELECTRO_FLARE);
    if (room > 0) applyEnemy(ELECTRO_FLARE, room);
    inflictElectroFlare(5);
  },
  updateBuffs: () => {
    if (isHeld(MODE_UNISON) && isHeld(FORMSHIFT_UNISON)) {
      applyCurrent(UNISON, 1);
      revokeCurrent(FORMSHIFT_UNISON);
    }
    revokeCurrent(FORMSHIFT_UNLOCKED);
    applyCurrent(ILLUMINING_FORM, 1); applyCurrent(HEART_MANIFEST, 1);
    revokeTeam(EDICT); applyTeam(EDICT, 21);
    if (isHeld(MODE_FLARE)) { applyCurrent(HEARTLOCK_PRIMED, 1); setStacksSelf(PILLAR_CHARGES, 5); }
  },
});
/** The Sanctum comes down as Resonance Skill DMG: 125 Energy, and the end of Heart Manifest. */
// PLACEHOLDER FRAMES
const Lib2 = hsinAction("Liberation - Pillars Across Heaven", {
  animFrames: 305, commitFrames: 302, timestop: 302, motionStop: 302,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Skill, hits: [
    { at: 302, mv: 80.51, concerto: 0.8, offtune: 1958.5578 },
    { at: 302, mv: 90.57, concerto: 0.9, offtune: 2203.2864 },
    { at: 302, mv: 60.38, concerto: 0.6, offtune: 1468.8576 },
    { at: 302, mv: 100.64, concerto: 1.0001, offtune: 2448.2581 },
    { at: 302, mv: 70.45, concerto: 0.7001, offtune: 1713.8293 },
    { at: 302, mv: 1610.12, concerto: 15.9998, offtune: 39169.2108, updateDebuffs: () => { if (isHeld(HS_S3) && isHeld(MODE_FLARE) && stacksOfEnemy(ELECTRO_FLARE) > 0) queue(PillarsFlare); } },
  ], resetEnergy: true,
  updateBuffs: () => {
    revokeCurrent(PILLARS_UNLOCKED); revokeCurrent(ILLUMINING_FORM); revokeCurrent(HEART_MANIFEST);
    revokeTeam(THUNDERGLOW); revokeCurrent(PILLAR_CHARGES); revokeEnemy(FLEETING_THUNDER);
    applyCurrent(NIGHTGLOW, 1);
  },
});

/** Soaring Pillar: one Edict spent a second while the active resonator deals damage, considered
 *  Resonance Liberation DMG. */
const SANCTUM = new ActionField("Hsin: Manifold Sanctum");
const SoaringPillar = hsinAction("Liberation - Soaring Pillar", {
  tag: ActionTag.Field, type: Type.Liberation, subtype: Subtype.Coordinated, mv: 11.37, field: SANCTUM,
});

// --- intros: the Flare-mode forms, then the Unison mode's own four — its plain pair, and the
//     Manifold Unison pair (Resonance Skill DMG) a Unison Response or a held Source Intent puts
//     in their place. An Illumining Intro of either kind opens Mechanism Dominion at 300 Heart.
const MANIFOLD = {
  // a response banks Source Intent for a later Intro; an Intro that is no response spent it
  updateBuffs: () => {
    respondToUnison();
    if (unisonResponse()) applyCurrent(SOURCE_INTENT, 1);
    else revokeCurrent(SOURCE_INTENT);
  },
};
// PLACEHOLDER FRAMES
const UIntro = hsinAction("Intro - Answering Form", {

  animFrames: 44, commitFrames: 44, motionStop: 14,

  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 44, mv: 10.28, energy: 0.7503, concerto: 0.3001, offtune: 590.8299 },
    { at: 44, mv: 20.55, energy: 1.4999, concerto: 0.5999, offtune: 1181.0851 },
    { at: 44, mv: 10.28, energy: 0.7503, concerto: 0.3001, offtune: 590.8299 },
    { at: 44, mv: 20.55, energy: 1.4999, concerto: 0.5999, offtune: 1181.0851 },
    { at: 44, mv: 20.55, energy: 1.4999, concerto: 0.5999, offtune: 1181.0851 },
    { at: 44, mv: 20.55, energy: 1.4997, concerto: 0.6001, offtune: 1181.0849, forte1: 68.38 },
  ], castConcerto: 10,
});
// PLACEHOLDER FRAMES
const ManifoldAnswering = hsinAction("Intro - Answering Form: Manifold Unison", {

  animFrames: 44, commitFrames: 44, motionStop: 14,

  node: Node.Intro, cast: Cast.Intro, type: Type.Skill, hits: [
    { at: 44, mv: 60.59, energy: 0.75, concerto: 0.3, offtune: 590.6 },
    { at: 44, mv: 121.18, energy: 1.5, concerto: 0.6, offtune: 1181.2 },
    { at: 44, mv: 60.59, energy: 0.75, concerto: 0.3, offtune: 590.6 },
    { at: 44, mv: 121.18, energy: 1.5, concerto: 0.6, offtune: 1181.2 },
    { at: 44, mv: 121.18, energy: 1.5, concerto: 0.6, offtune: 1181.2 },
    { at: 44, mv: 121.18, energy: 1.5, concerto: 0.6, offtune: 1181.2, forte1: 68.38 },
  ], castConcerto: 10,
  ...MANIFOLD,
});
// PLACEHOLDER FRAMES
const UIIntro = hsinAction("Intro - Illumining Form", {
  animFrames: 152, commitFrames: 152, timestop: 30, motionStop: 152,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 152, mv: 56.59, energy: 1.5019, concerto: 1.6339, offtune: 3253.485 },
    { at: 152, mv: 56.59, energy: 1.5019, concerto: 1.6339, offtune: 3253.485 },
    { at: 152, mv: 56.59, energy: 1.5019, concerto: 1.6339, offtune: 3253.485 },
    { at: 152, mv: 56.59, energy: 1.5019, concerto: 1.6339, offtune: 3253.485 },
    { at: 152, mv: 5.66, energy: 0.1502, concerto: 0.1634, offtune: 325.406 },
    { at: 152, mv: 11.32, energy: 0.3004, concerto: 0.3268, offtune: 650.812 },
    { at: 152, mv: 11.32, energy: 0.3004, concerto: 0.3268, offtune: 650.812 },
    { at: 152, mv: 14.15, energy: 0.3756, concerto: 0.4086, offtune: 813.515 },
    { at: 152, mv: 14.15, energy: 0.3758, concerto: 0.4088, offtune: 813.515, forte2: 300 },
  ], castConcerto: 10,
  // lands straight in Mechanism Dominion at 300 Illumining Heart
  updateBuffs: () => applyCurrent(MECHANISM_DOMINION, 1),
});
// PLACEHOLDER FRAMES
const ManifoldIllumining = hsinAction("Intro - Illumining Form: Manifold Unison", {
  animFrames: 152, commitFrames: 152, timestop: 30, motionStop: 152,
  node: Node.Intro, cast: Cast.Intro, type: Type.Skill, hits: [
    { at: 152, mv: 157.22, energy: 1.5019, concerto: 2.6339, offtune: 3253.4758 },
    { at: 152, mv: 157.22, energy: 1.5019, concerto: 2.6339, offtune: 3253.4758 },
    { at: 152, mv: 157.22, energy: 1.5019, concerto: 2.6339, offtune: 3253.4758 },
    { at: 152, mv: 157.22, energy: 1.5019, concerto: 2.6339, offtune: 3253.4758 },
    { at: 152, mv: 15.73, energy: 0.1503, concerto: 0.2635, offtune: 325.5131 },
    { at: 152, mv: 31.45, energy: 0.3004, concerto: 0.5269, offtune: 650.8193 },
    { at: 152, mv: 31.45, energy: 0.3004, concerto: 0.5269, offtune: 650.8193 },
    { at: 152, mv: 39.31, energy: 0.3755, concerto: 0.6586, offtune: 813.4724 },
    { at: 152, mv: 39.31, energy: 0.3758, concerto: 0.6585, offtune: 813.4727, forte2: 300 },
  ], castConcerto: 10,
  updateBuffs: () => {
    MANIFOLD.updateBuffs();
    applyCurrent(MECHANISM_DOMINION, 1);
  },
});
// PLACEHOLDER FRAMES
const FlareIntro = hsinAction("Intro - Answering Form (Flare)", {

  animFrames: 66, commitFrames: 66, motionStop: 39,

  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 66, mv: 7.88, energy: 0.5002, concerto: 0.7278, offtune: 453.0225,
      updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(1); } },
    { at: 66, mv: 7.88, energy: 0.5002, concerto: 0.7278, offtune: 453.0225 },
    { at: 66, mv: 7.88, energy: 0.5002, concerto: 0.7278, offtune: 453.0225 },
    { at: 66, mv: 7.88, energy: 0.5002, concerto: 0.7278, offtune: 453.0225 },
    { at: 66, mv: 126.02, energy: 7.9992, concerto: 11.6388, offtune: 7244.91, forte1: 74.97 },
  ],
});
// PLACEHOLDER FRAMES
const FlareIIntro = hsinAction("Intro - Illumining Form (Flare)", {

  animFrames: 98, commitFrames: 98, motionStop: 18,

  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 98, mv: 11.42, energy: 0.5, concerto: 0.329, offtune: 656.7,
      updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(1); } },
    { at: 98, mv: 11.42, energy: 0.5, concerto: 0.329, offtune: 656.7 },
    { at: 98, mv: 11.42, energy: 0.5, concerto: 0.329, offtune: 656.7 },
    { at: 98, mv: 11.42, energy: 0.5, concerto: 0.329, offtune: 656.7 },
    { at: 98, mv: 11.42, energy: 0.5, concerto: 0.329, offtune: 656.7 },
    { at: 98, mv: 11.42, energy: 0.5, concerto: 0.329, offtune: 656.7 },
    { at: 98, mv: 39.97, energy: 1.75, concerto: 1.1515, offtune: 2298.45 },
    { at: 98, mv: 39.97, energy: 1.75, concerto: 1.1515, offtune: 2298.45 },
    { at: 98, mv: 39.97, energy: 1.75, concerto: 1.1515, offtune: 2298.45 },
    { at: 98, mv: 39.97, energy: 1.75, concerto: 1.1515, offtune: 2298.45, forte2: 51.96 },
  ], castConcerto: 10,
});
const Outro = hsinAction("Outro - Herself a Thousand Lanterns", {
  animFrames: 0, commitFrames: 0,
  cast: Cast.Outro, type: Type.Outro, mv: 100, castConcerto: -100,
  updateBuffs: () => {
    if (!isHeld(NIGHTGLOW)) return;
    revokeCurrent(NIGHTGLOW); 
    if (isHeld(MODE_FLARE)) { 
      applyTeam(OUTRO_FLARE, 1); 
    }
    if (isHeld(MODE_UNISON)) {
      applyTeam(OUTRO_UNISON, 1); 
    }
  },
});
const OutroUnison = unisonOutro(Outro);

/** Nightglow: banked by entering combat and by Pillars Across Heaven, spent by her Outro — so the
 *  first visit's Outro already carries the mode's handoff, before any Liberation has landed. */
const NIGHTGLOW = new Buff({ name: "Hsin: Nightglow" });

/** Outro, Flare mode: +20% Electro DMG Amplification for everyone but her, 20s — a team buff that
 *  short is lost on her own next Intro. */
const OUTRO_FLARE = new Buff({
  name: "Hsin: Outro (flare)",
  duration: 60 * 20,
  applyStats: () => { if (isActive() && !isHeld(HSIN_RESONATOR)) addStat(Stat.Amp, 20, Attribute.Electro); },
});

/** Shared Light: a teammate who gained a Unison of their own carries it, and her Nightglow Outro
 *  turns it into +20% All DMG Amplification for 30s — permanent once granted. */
const SHARED_LIGHT = new Buff({ name: "Hsin: Shared Light" });
const OUTRO_UNISON = new Buff({ 
  name: "Hsin: Outro (unison)", duration: 60 * 30, applyStats: () => { if(isHeld(SHARED_LIGHT)) addStat(Stat.Amp, 20); }
});

/* ------------------------------------------------------------------------------------ buffs */

/** The two Resonance Modes, one loadout each. Every mode-bound branch reads its own. */
const MODE_FLARE = new ResonanceMode({ name: "Resonance Mode - Electro Flare",
  // "When Hsin enters combat, targets within a certain range do not lose Electro Flare stacks when
  // it's triggered automatically" — the whole fight, not a window, so it goes up once and stands:
  // nothing revokes it, and only leaving Flare mode would, which a loadout never does. status.ts's
  // tick reads FLARE_RETAINED for exactly this.
  combatStart: () => applyEnemy(FLARE_RETAINED, 1),
  // Forms Turn, Heart Abides, Flare mode: every Electro Rage the team inflicts is hers, and comes
  // off the target — watched from her own slot on every hit, so a teammate's overflow lands on her
  hitGlobal: () => {
    if (!isHeld(MODE_FLARE)) return;
    const rage = applied(ELECTRO_RAGE);
    if (rage > 0) applyTeam(HEART_OF_THUNDER, rage);
    if (stacksOfEnemy(ELECTRO_RAGE) > 0) consume(ELECTRO_RAGE, stacksOfEnemy(ELECTRO_RAGE));
  },
});

/** This kit's own carrier for the Unison Boon payout (shared/unison.ts's `boonPayout`). */
const HS_BOON_PAYOUT = boonPayout();

/** Resonance Mode - Unison: her own Unison Response hands the team a Unison Boon (once,
 *  refreshed after) and, as a responder, the Boon pays her; a teammate who gains a Unison of
 *  their own takes Shared Light, watched from her slot on every action. */
const MODE_UNISON = new ResonanceMode({
  name: "Resonance Mode - Unison",
  // the Boon is a count; the carrier the mode grants is what reads it and pays her for it, so the
  // loadout hover traces the bonus back here (shared/unison.ts)
  combatStart: () => { applyCurrent(HS_BOON_PAYOUT, 1); },
  updateBuffs: () => {
    if (unisonResponse()) grantBoon(HS_BOON_RESPONSE);
    if (casting(Cast.Intro)) applyCurrent(FORMSHIFT_UNISON, 1);
  },
  updateGlobal: () => {
    const actor = currentTeam().slot;
    // `isHeld`, not applied: this runs ahead of the grant's own updateBuffs, and a Unison is held
    // from its grant to the outro that spends it
    if (actor.resonator && !actor.isHeld(HSIN_RESONATOR) && actor.isHeld(UNISON)) addBuff(actor.resonator, SHARED_LIGHT, 1);
  },
});

/** Source Intent: banked by a Unison Response, spent by the next Intro that is no response to
 *  make it a Manifold Unison one all the same. */
const SOURCE_INTENT = new Buff({ name: "Hsin: Source Intent" });

/** Any of her Intros arms the next Formshift to grant Unison; that Formshift spends it. */
const FORMSHIFT_UNISON = new Buff({});

/** Her own two Unison Boon grants — one each, refreshed after: her Unison Response (the shared
 *  rule) and Gleaning Simple Joys' off anybody's response. Neither carries a `name`, so neither
 *  enters the held-buffs list (evaluate.ts's own `named()`): each only remembers a grant already
 *  made, and the Unison Boon stack it handed over is the row that reports it. */
const HS_BOON_RESPONSE = new Buff({});
const HS_BOON_GLEANING = new Buff({});

/** Form and unlock markers — Illumining Form picks her Intro, the two unlocks are what the
 *  Liberation button does next. Heart Manifest is the 45s window, and survives a swap. The two
 *  unlocks carry no `name`: which button is live is not a buff of hers to show. */
const ILLUMINING_FORM = new Buff({ name: "Hsin: Illumining Form" });
const FORMSHIFT_UNLOCKED = new Buff({});
const PILLARS_UNLOCKED = new Buff({});
const HEART_MANIFEST = new Buff({ name: "Hsin: Heart Manifest", duration: 60 * 45 });

/** Illumining Heart's own gate: a Normal Attack - Illumining Form or Resonance Skill - Illumining
 *  Form hit only banks it "not in the Mechanism Dominion state" — held from Pillars Aligned (or an
 *  Illumining Intro landing straight in Dominion) to Beholding/Stilling All Horizons closing it, it
 *  negates whatever forte2 one of those actions would otherwise add, in case a rotation ever
 *  presses one under Dominion (the Forte-unlocked presses replace them here regardless). */
const DOMINION_GATED = [IBA1, IBA2, IBA3, Heartlock, IHA, UpwardCut, IMA, IDC, ISkill];
const MECHANISM_DOMINION = new Buff({
  name: "Hsin: Mechanism Dominion",
  duration: 60 * 13,
  applyStats: () => {
    const a = pressed();
    if (DOMINION_GATED.includes(a)) addStat(Stat.AddCastForte2, -(a.forte2 - a.castForte[1]!));
  },
});

/** The Modular Heartlock standing on the target, and the Flare-mode priming that makes its next
 *  collapse worth 150 Illumining Heart — once per Formshift, paid on the collapse hit itself. */
const HEARTLOCK = new Buff({ name: "Hsin: Modular Heartlock" });
const HEARTLOCK_PRIMED = new Buff({
  name: "Hsin: Formshift Extra Modular Heartlock",
  applyStats: () => { if (runningAction(Heartlock)) addStat(Stat.AddForte2, 150); },
  convertStats: () => { if (runningAction(Heartlock)) revokeCurrent(HEARTLOCK_PRIMED); },
});

/** Edict: 21 Soaring Pillars, one a second, banked by Formshift. */
const EDICT = coordinatedBuff("Hsin: Edict", 21, () => HSIN_RESONATOR, SoaringPillar);

/** The 5 Dominion hits that lay a Flare each, reset by every Formshift. */
const PILLAR_CHARGES = new Buff({ name: "Hsin: Pillars Aligned Flare Charges", maxStacks: 5 });

/** Heart of Thunder: the team's Electro Rage, taken off the target and banked on her, 100 at most.
 *  Spent by Skill - Illumining Form. Held team-wide so the count reads on every row of the log,
 *  though only her own casts ever read or spend it. */
const HEART_OF_THUNDER: Buff = new Buff({
  name: "Hsin: Heart of Thunder", maxStacks: 100,
  // the count is the shared one, and a source row reads it off the slot it is filed on — which
  // holds none of it (`asSource` on ThunderHit's multiplier), so the stacks are named here
  display: () => `Hsin: Heart of Thunder x${stacksOfTeam(HEART_OF_THUNDER)}`,
});

/** Thunderglow: one per stack of Electro Flare a teammate inflicts while she is out of Heart
 *  Manifest, cap 10 — full, her next Manifest pins the target's Flare at its cap. Overflow past the target's
 *  own cap counts too: it was still inflicted, it just banked as Electro Rage (status.ts).
 *  Cleared when Manifest ends. Held team-wide so the count reads on every row of the log; only
 *  her own Manifest ever reads it. */
const THUNDERGLOW = new Buff({ name: "Hsin: Thunderglow", maxStacks: 10 });

/** Fleeting Thunder: the cap pin, laid by a Heart Manifest that opens on full Thunderglow. Landing
 *  it fills the target to the Flare limit (16 at most), and a limit raised while it stands fills
 *  the target again — Suisui's +3 is exactly that. Leaving Manifest takes it off; the kit also
 *  drops it when the target leaves her range, which a boss standing in front of her never does. */
const FLEETING_THUNDER = new Debuff({ name: "Hsin: Fleeting Thunder" });


/** How many *distinct* team slots have inflicted Electro Flare — Tides of Succession holds one bit
 *  per slot rather than a plain count (Hiyuki's Snow Rust shape), so this is how many of its three
 *  bits are up. Her own payout stops at the kit's two. */
const tidesPayers = (): number => {
  const slots = frozenStacks();
  return (slots & 1) + ((slots >> 1) & 1) + ((slots >> 2) & 1);
};
/** Tides of Succession, Unison mode: a Manifold Unison Intro is +50% ATK for 8s, ended by
 *  switching out. */
const TIDES_UNISON = new Buff({
  name: "Inherent: Tides of Succession (Manifold Unison)",
  duration: 60 * 8,
  lostOnSwap: true,
  stats: [[Stat.BonusAtk, 50]],
});
/** Tides of Succession, Flare mode: +25% Electro DMG Bonus per resonator on the team who has
 *  inflicted Electro Flare, two at most. One bit a slot, so a resonator's second inflict pays
 *  nothing — the kit's "each Resonator can trigger this effect only once". */
const TIDES_OF_SUCCESSION = new Buff({
  name: "Inherent: Tides of Succession", maxStacks: 1 + 2 + 4,
  display: () => `Inherent: Tides of Succession x${Math.min(2, tidesPayers())}`,
  applyStats: () => addStat(Stat.DmgBonus, 25 * Math.min(2, tidesPayers()), Attribute.Electro),
});
/** Tides of Succession's Rover clause: Electro Rover's own Intro hands him and Hsin +20% Electro
 *  DMG Bonus for 30s. The kit text says 7s and is wrong — 30s is the real window, so don't let a
 *  re-sync against the page put 7 back. */
const THUNDEROUS_BOND = new Buff({
  name: "Inherent: Tides of Succession (Electro Rover)",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 20, Attribute.Electro]],
});
const HS_INHERENT_1 = new Inherent({
  name: "Inherent: Tides of Succession",
  updateBuffs: () => {
    if (isHeld(MODE_UNISON) && (runningAction(ManifoldAnswering) || runningAction(ManifoldIllumining))) applyCurrent(TIDES_UNISON, 1);
  },
  updateGlobal: () => {
    if (!isHeld(MODE_FLARE)) return;
    const actor = currentTeam().slot;
    if (casting(Cast.Intro) && actor.resonator?.name === "Electro Rover") {
      applyCurrent(THUNDEROUS_BOND, 1);
      addBuff(actor.resonator, THUNDEROUS_BOND, 1);
    }
  },
  hitGlobal: () => {
    if (!isHeld(MODE_FLARE)) return;
    // the applier's own bit — already up means this slot has had its stack and gets no second
    const slot = 1 << currentTeam().active;
    if (appliedByMember(ELECTRO_FLARE, currentTeam().slot) && (stacksOf(TIDES_OF_SUCCESSION) & slot) === 0) {
      applyCurrent(TIDES_OF_SUCCESSION, slot);
    }
  },
});

/** Gleaning Simple Joys (Inherent 2). Unison mode: the team's Unison Boon may reach three stacks
 *  (the shared buff's own cap), and any member's Unison Response hands everyone one — once from
 *  this, refreshed after. Flare mode: Thunderglow a stack per Flare teammates inflict out of
 *  Heart Manifest; in it, a bare target is given 1 Flare, and full Thunderglow lays Fleeting
 *  Thunder, which fills the target's Flare to its cap (16 at most). Leaving Manifest (Pillars
 *  Across Heaven) removes the mark with the rest — the tick spending no stacks is not the mark's
 *  doing and outlives it (status.ts's FLARE_RETAINED). */
const HS_INHERENT_2 = new Inherent({
  name: "Inherent: Gleaning Simple Joys",
  hitGlobal: () => {
    const actor = currentTeam().slot;
    if (isHeld(MODE_UNISON)) {
      // the response went up on the Intro's cast and stands until its hit pays out
      if (actor.isHeld(UNISON_RESPONSE)) grantBoon(HS_BOON_GLEANING);
      return;
    }
    if (!isHeld(MODE_FLARE)) return;
    if (!isHeld(HEART_MANIFEST)) {
      const inflicted = actor.isHeld(HSIN_RESONATOR) ? 0 : appliedByMember(ELECTRO_FLARE, actor);
      // guarded: a 0-stack grant would still put an empty entry in the pool
      if (inflicted > 0) applyTeam(THUNDERGLOW, inflicted);
      return;
    }
    if (stacksOfEnemy(ELECTRO_FLARE) === 0) inflictElectroFlare(1);
    if (stacksOfTeam(THUNDERGLOW) < 10) return;
    applyEnemy(FLEETING_THUNDER, 1);
    // the mark fills the target as it lands and again on a raised limit. Nothing spends Flare while
    // FLARE_RETAINED stands, so "short of the limit" is exactly those two moments — no need to
    // remember the limit the last fill saw. Straight stacks, not `inflictElectroFlare`: this is the
    // mark topping the target up, not a Flare she inflicts, so the shortfall must not bank as Rage.
    const cap = Math.min(16, currentTeam().enemyMax(ELECTRO_FLARE));
    if (stacksOfEnemy(ELECTRO_FLARE) < cap) applyEnemy(ELECTRO_FLARE, cap - stacksOfEnemy(ELECTRO_FLARE));
  },
});

/* --------------------------------------------------------------------------------- sequences */

/** S1. Unison: both Manifold Unison Intros hit for +15% DMG Multiplier, and +10% more a Unison
 *  Boon stack the team holds, four at most — a fourth only ever exists at S6, which is what raises
 *  the Boon's own cap that far. Flare: entering combat floors Heart of Thunder at 50 (a
 *  start-of-combat effect, its 12s cooldown ignored), and the Illumining Skill's Flare instance
 *  pays 42% of the rung a Heart of Thunder stack instead of 35% — a rate ThunderHit reads off this
 *  sequence itself, since the stacks it clears are what it multiplies.
 *  Radiance Ward is damage reduction, out of scope. */
const HS_S1 = new Sequence({
  name: "Hsin S1: A Boat to Cross the Rising Tide",
  combatStart: () => {
    applyTeam(HEART_OF_THUNDER, 50);
  },
  applyStats: () => {
    if (runningAction(ManifoldAnswering) || runningAction(ManifoldIllumining)) addStat(Stat.MulMv, 15 + 10 * Math.min(4, stacksOfTeam(UNISON_BOON)));
  },
});

/** S2: +60% DMG Multiplier on both Realm forms and both Horizons forms, and entering combat hands
 *  her 100 more Answering Heart. Its other half resets the two once-per-24s upgrades'
 *  cooldowns, which changes nothing here: the rotation already spends Resolution of Wishes and Law
 *  of Heaven every visit. */
const HS_S2 = new Sequence({
  name: "Hsin S2: To Wake Is to Wonder What I Am",
  combatStart: () => {
    addForte1(100);
  },
  applyStats: () => {
    if (runningAction(RealmWanderer) || runningAction(RealmProtector) || runningAction(Beholding) || runningAction(FHA)) addStat(Stat.MulMv, 60);
  },
});

/** The instance S3 fires off the last stage of Pillars Across Heaven: 1500% of the target's rung. */
const PillarsFlare = flareHit("Liberation - Pillars Across Heaven: Electro Flare", () => 1400);
/** S3: +70% DMG Multiplier on Pillars Across Heaven; in Unison mode it also crits 20% harder, plus
 *  15% a Unison Boon stack, four at most; in Flare mode it fires the instance above. */
const HS_S3 = new Sequence({
  name: "Hsin S3: A Dream of Return Among the Hills",
  applyStats: () => {
    if (!runningAction(Lib2)) return;
    addStat(Stat.MulMv, 70);
    if (isHeld(MODE_UNISON)) addStat(Stat.CritDmg, 20 + 15 * Math.min(4, stacksOfTeam(UNISON_BOON)));
  },
});

/** S4's payout: +20% DMG Bonus for the whole team, 30s and re-granted constantly — permanent from
 *  the first action that lays a status or a Unison. */
const RIVER_OF_LANTERNS = new Buff({
  name: "Hsin S4: A River of Lanterns, a River of Wishes",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 20]],
});
const HS_S4 = new Sequence({
  name: "Hsin S4: A River of Lanterns, a River of Wishes",
  // from hitGlobal "me" is the holder, so the acting slot has to be named (status.ts); a Unison or
  // response goes up on the cast, so the hit reads it held rather than applied
  hitGlobal: () => {
    const actor = currentTeam().slot;
    if (appliedByMember(ELECTRO_FLARE, actor) || appliedByMember(ELECTRO_RAGE, actor)
      || actor.isHeld(UNISON) || actor.isHeld(UNISON_RESPONSE)) applyTeam(RIVER_OF_LANTERNS, 1);
  },
});

/** S5 is a damage reduction and a death save — neither reaches the formula. Held for the name. */
const HS_S5 = new Sequence({ name: "Hsin S5: Forms Turn as the Heart Wills" });

/** S6's own Unison Boon grant, off any member's response — one, refreshed after, and nameless,
 *  like her other two. */
const HS_BOON_S6 = new Buff({});
/** S6: the target takes 40% more Resonance Skill DMG from her and 20% less of its DEF counts
 *  against it; in Unison mode the team's Unison Boon reaches a fourth stack (the cap unison.ts
 *  declares) and any member's response hands everyone one; in Flare mode every Electro Flare hit
 *  around her crits at a fixed 80% rate for 230% — scoped to the status, which is the only crit a
 *  dot row reads (damage.ts), so "fixed" needs no override: nothing else ever pays into it. */
const HS_S6 = new Sequence({
  name: "Hsin S6: The Moon Owes Its Light to the Living",
  // held, not applied: the response went up on the Intro's cast and stands until its hit
  hitGlobal: () => {
    if (!isHeld(MODE_UNISON)) return;
    if (currentTeam().slot.isHeld(UNISON_RESPONSE)) grantBoon(HS_BOON_S6);
  },
  applyStats: () => {
    addStat(Stat.DamageTaken, 40, Type.Skill);
    addStat(Stat.DefIgnoreNew, 20, Type.Skill);
    if (isHeld(MODE_FLARE)) { addStat(Stat.CritRate, 80, Subtype.ElectroFlare); addStat(Stat.CritDmg, 230, Subtype.ElectroFlare); }
  },
});

const HS_SEQUENCES = [HS_S1, HS_S2, HS_S3, HS_S4, HS_S5, HS_S6];

/* --------------------------------------------------------------------------- kit and loadout */

const HSIN_TALENTS = new Talent({
  name: "Hsin: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

/** Normal Attack, Resonance Skill and Intro Skill - Answering Form (Manifold included): the hits that
 *  bank Answering Heart, and only while she is on field when they land. */
const ANSWERING_HEART_HITS = new Set<Action>([BA1, BA2, BA3, BA4, HA, MA, ReignHold, ReignPlunge, DC, Skill, UIntro, ManifoldAnswering, FlareIntro]);

const HSIN_RESONATOR = new Resonator({
  name: "Hsin",
  talent: HSIN_TALENTS,
  inherent1: HS_INHERENT_1,
  inherent2: HS_INHERENT_2,
  tier: Tier.Limited,
  element: Attribute.Electro,
  weapon: WeaponType.Rectifier,
  // Unison mode: the Manifold form on a Unison Response, or on a held Source Intent
  combatStart: () => applyCurrent(NIGHTGLOW, 1),
  // Answering Heart comes off an Answering Form hit only while she is the active resonator: a hit
  // landing after she has left (a swap-out's) banks none of its own
  applyStats: () => {
    const a = pressed();
    if (!isActive() && runningAnyOf(ANSWERING_HEART_HITS)) addStat(Stat.AddForte1, -(a.forte1 - a.castForte[0]!));
  },
  color: "#f1a49b",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  intro: new Action("Intro Resolver", { cast: Cast.Intro, resolve: () => {
      if (!isHeld(MODE_UNISON)) return isHeld(ILLUMINING_FORM) ? FlareIIntro : FlareIntro;
      const manifold = unisonIntro() || isHeld(SOURCE_INTENT);
      return isHeld(ILLUMINING_FORM) ? (manifold ? ManifoldIllumining : UIIntro) : (manifold ? ManifoldAnswering : UIntro);
    } }),
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 300,


  stats: [[Stat.BaseHp, 10300], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1112.2202]],
});

// The Flare-mode visit as the kit reads: the Intro chains into Stage 4, the Skill into Stage 4
// again, Realm Protector spends the Heart and Formshift follows; Stage 1-2 collapse the primed
// Heartlock, Pillars Aligned opens Dominion, its four stages lay the Flare charges, the Skill
// spends the Heart of Thunder they overflowed into, Stilling closes Dominion and Pillars Across
// Heaven ends the visit. She is never the team's lead, so this covers opener and loop both.
const IBA12 = new ActionGroup("Basic - Illumining Form 12", [IBA1, IBA2]);
const BA34 = new ActionGroup("Basic - Answering Form 34", [BA3, BA4]);

/** Which Outro this resonator casts, resolved when its row is reached — whichever the
 *  kit's state calls for there. */
const OutroResolver = new Action("Outro Resolver", { cast: Cast.Outro, resolve: () => (isHeld(UNISON) ? OutroUnison : Outro) });

const HS_ROTATION_FLARE = new Rotation([
  INTRO, BA4.easyCancel(),
  RealmProtector.easyCancel(), Lib1, ECHO, 
  
  ISkill,IBA12.easyCancel(), 
  PillarsAligned, 
  
  FBA1234.cancel(), FHA,
  Lib2, Skill.instaSwap(), OutroResolver,
]);

// The Unison-mode loop, Jinhsi's double-Intro shape. The Answering pre-visit: the Intro (its
// Manifold form off a response or a held Source Intent) chains into Stage 3, the Skill into Stage
// 4, Realm Protector spends the Heart and Formshift's Unison pays the outro that hands the field
// back. Her return is in Illumining Form: that Intro lands her in Dominion at 300 Heart, its four
// stages spend it, Stilling closes Dominion and Pillars Across Heaven ends the visit on a real bar.
// Leading, the Intro's 68 Answering Heart and its stages 1-2 are a full chain and then Stage 1-2
// again, so the section's own Stage 3-4 continue it: 126 Heart into Realm Protector's 100.
const HS_ROTATION_UNISON = new Rotation([
  DOUBLE_INTRO, BA34.easyCancel(),
  RealmProtector.easyCancel(), Lib1, OutroResolver,

  INTRO, 
  ECHO, 
  FBA1234, FHA,
  Lib2, Skill.instaSwap(), OutroResolver,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build in Electro Flare mode: resonator + talents + both Inherent Skills, her own
// rectifier and echo, the two Electro Flare sonatas, mainstat/substat
export const HSIN_FLARE = new Loadout({
  resonator: HSIN_RESONATOR,
  weapons: [BLOOMING_JADEHAVEN, COSMIC_RIPPLES, STRINGMASTER, LETHEAN_ELEGY, FREEZE_FRAME],
  echoLoadouts: [new EchoLoadout(STAY_TUNED_HSIN, SWORN_VIGIL_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Skill, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Skill, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  rotation: HS_ROTATION_FLARE,
  mode: MODE_FLARE,
  sequences: HS_SEQUENCES,
});

export const HSIN_UNISON = new Loadout({
  resonator: HSIN_RESONATOR,
  weapons: [BLOOMING_JADEHAVEN, COSMIC_RIPPLES, STRINGMASTER, LETHEAN_ELEGY, FREEZE_FRAME],
  echoLoadouts: [new EchoLoadout(STAY_TUNED_HSIN, SWORN_VIGIL_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Skill, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic),
  rotation: HS_ROTATION_UNISON,
  mode: MODE_UNISON,
  sequences: HS_SEQUENCES,
});
