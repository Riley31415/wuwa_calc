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
 * (cap 100) and is taken off the target; either form's base Skill fires it as one Electro Flare
 * DMG instance, 35% of the current rung a stack, then clears it. Thunderglow
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
import { Tier, Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling, Position } from "../../engine/stats.js";
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
  currentHit,
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
  addForte1,
  addGain,
} from "../../engine/context.js";
import { Action, ActionField, ActionGroup, Rotation, ECHO, ActionTag, INTRO, OUTRO, DOUBLE_INTRO, INTRO_OPENER, DODGE } from "../../engine/rotation.js";
import { UNISON, UNISON_BOON, UNISON_RESPONSE, BOON_REACTOR, grantBoon, respondToUnison, unisonIntro, unisonOutro, unisonResponse } from "../../shared/unison.js";
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

/** Form and unlock markers, declared ahead of the presses they gate ("While in Answering Form",
 *  "While in Illumining Form"). Answering Form stands from combat start and after Pillars Across
 *  Heaven, Illumining Form from Formshift; the two unlocks are what the Liberation button does next.
 *  Heart Manifest is the 45s window, and survives a swap. */
const ANSWERING_FORM = new Buff({ name: "Hsin: Answering Form" });
const ILLUMINING_FORM = new Buff({ name: "Hsin: Illumining Form" });
const FORMSHIFT_UNLOCKED = new Buff({ name: "Hsin: Formshift Unlocked" });
const PILLARS_UNLOCKED = new Buff({ name: "Hsin: Pillars Across Heaven Unlocked" });
const HEART_MANIFEST = new Buff({ name: "Hsin: Heart Manifest", duration: 60 * 45 });
/** Mechanism Dominion: 13s off Pillars Aligned or an Illumining Unison Intro, closed by either
 *  Horizons Heavy or by leaving Illumining Form. It also negates Illumining Heart on the presses
 *  DOMINION_GATED lists. */
const MECHANISM_DOMINION = new Buff({
  name: "Hsin: Mechanism Dominion",
  duration: 60 * 13, lostWith: ILLUMINING_FORM,
  updateDebuffs: () => { if (DOMINION_GATED.some((a) => runningAction(a))) addGain({ forte2: -currentHit().forte2 }); },
});

/** One of her own Electro Flare DMG instances: a dot-scaled Status hit carrying no motion value of
 *  its own — the rung the target is standing on is what it is worth, added by the status itself
 *  (status.ts's own ELECTRO_FLARE, so the value is sourced to the Flare that set it) — and `mul`
 *  is the percentage the kit text puts on top of that rung: +75 for a 175% instance, -65 for 35%.
 *  `source`, where the percentage is a count's rather than the cast's, names the gear the panel
 *  files it under, the same way the rung itself is filed under the Flare (read late, since the
 *  buffs are declared below the actions). */
const flareHit = (name: string, mul: () => number, def: object = {}, source: (() => Buff) | null = null): Action =>
  new Action(name, {
    element: Attribute.Electro, type: Type.Status, subtype: Subtype.ElectroFlare, scaling: Scaling.Dot, bullets: [{ hitFrame: 0 }],
    applyStats: () => {
      if (source) asSource(source(), () => addStat(Stat.MulMv, mul()));
      else addStat(Stat.MulMv, mul());
    },
    ...def,
  });

// --- Answering Form: basics, heavy, mid-air, dodge counter, skill (Manifold Bloom). Every hit
//     banks Answering Heart, and only these do.
const BA1 = hsinAction("Basic - Answering Form 1", { requireBuff: ANSWERING_FORM, animFrames: 30, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 2784, energy: 50, concerto: 80, offtune: 1600, forte1: 283 },
    { hitFrame: 16, mv: 4176, energy: 75, concerto: 120, offtune: 2400, forte1: 425 },
  ]});
// the Heavy and both Answering plunges each lead "within a short time" into Stage 2
const BA2 = hsinAction("Basic - Answering Form 2", { chains: () => [BA1, HA, MA, ReignPlunge], requireBuff: ANSWERING_FORM, animFrames: 64, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 24, mv: 1515, energy: 28, concerto: 44, offtune: 871, forte1: 154 },
    { hitFrame: 30, commitFrame: 24, mv: 1515, energy: 28, concerto: 44, offtune: 871, forte1: 154 },
    { hitFrame: 38, mv: 6814, energy: 123, concerto: 196, offtune: 3917, forte1: 693 },
    { hitFrame: 42, mv: 5300, energy: 96, concerto: 153, offtune: 3047, forte1: 539 },
  ]});
// the Dodge Counter, and Unison mode's Answering Intros ("Stage 3 (when in Resonance Mode - Unison)")
const BA3 = hsinAction("Basic - Answering Form 3", { chains: () => [BA2, DC, UIntro, ManifoldAnswering], requireBuff: ANSWERING_FORM, animFrames: 66, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 27, commitFrame: 12, mv: 3151, energy: 57, concerto: 48, offtune: 960, forte1: 170 },
    { hitFrame: 31, commitFrame: 12, mv: 3151, energy: 57, concerto: 48, offtune: 960, forte1: 170 },
    { hitFrame: 45, commitFrame: 12, mv: 2363, energy: 43, concerto: 36, offtune: 720, forte1: 128 },
    { hitFrame: 49, commitFrame: 12, mv: 2363, energy: 43, concerto: 36, offtune: 720, forte1: 128 },
    { hitFrame: 84, commitFrame: 12, mv: 4726, energy: 85, concerto: 72, offtune: 1440, forte1: 255 },
  ]});
// the Skill, and the Flare-mode Answering Intro ("Stage 4 (when in Resonance Mode - Electro Flare)")
const BA4 = hsinAction("Basic - Answering Form 4", { chains: () => [BA3, Skill, FlareIntro], requireBuff: ANSWERING_FORM, animFrames: 89, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 26, mv: 3972, energy: 72, concerto: 157, offtune: 3135, forte1: 554 },
    { hitFrame: 51, mv: 3972, energy: 72, concerto: 157, offtune: 3135, forte1: 554 },
    { hitFrame: 79, commitFrame: 77, mv: 11915, energy: 215, concerto: 471, offtune: 9403, forte1: 1662 },
  ]});
const HA = hsinAction("Heavy - Answering Form", { requireBuff: ANSWERING_FORM, animFrames: 44, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 21, commitFrame: 0, mv: 2055, energy: 37, concerto: 60, offtune: 1181, forte1: 209 },
    { hitFrame: 25, commitFrame: 0, mv: 1028, energy: 19, concerto: 30, offtune: 591, forte1: 105 },
    { hitFrame: 29, commitFrame: 0, mv: 1028, energy: 19, concerto: 30, offtune: 591, forte1: 105 },
    { hitFrame: 35, commitFrame: 0, mv: 2055, energy: 37, concerto: 60, offtune: 1181, forte1: 209 },
    { hitFrame: 39, commitFrame: 0, mv: 2055, energy: 37, concerto: 60, offtune: 1181, forte1: 209 },
    { hitFrame: 43, commitFrame: 0, mv: 2055, energy: 37, concerto: 60, offtune: 1181, forte1: 209 },
  ]});
const MA = hsinAction("Mid-air - Answering Form Plunge", { castPosition: Position.Midair, endPosition: Position.Grounded, requireBuff: ANSWERING_FORM, animFrames: 58, animPriority: { 38: 5, 58: 2 }, castPriority: 6, bullets: [{ hitFrame: 40, mv: 2244, energy: 41, concerto: 65, offtune: 2080, forte1: 228 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
// PLACEHOLDER FRAMES
const ReignHold = hsinAction("Heavy - Answering Form: Reign at Ease (Mid-Air)", { castPosition: Position.Midair, castPriority: 2, requireBuff: ANSWERING_FORM, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600 },
    { hitFrame: 0, mv: 2784, energy: 50, concerto: 80, offtune: 1600, forte1: 7650 },
  ]});
// released out of the hold: a Plunging Attack, "transforming into the Moon Fox upon landing"
const ReignPlunge = hsinAction("Mid-air - Answering Form: Reign at Ease Plunge", { chains: [ReignHold], castPosition: Position.Midair, endPosition: Position.Grounded, castPriority: 6, requireBuff: ANSWERING_FORM, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 2244, energy: 41, concerto: 65, offtune: 2080, forte1: 228 }] });
const DC = hsinAction("Dodge Counter - Answering Form", { chains: [DODGE], requireBuff: ANSWERING_FORM, animFrames: 61, castPriority: 2, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 24, mv: 4498, energy: 81, concerto: 130, offtune: 2586, forte1: 457 },
    { hitFrame: 30, commitFrame: 24, mv: 4498, energy: 81, concerto: 130, offtune: 2586, forte1: 457 },
    { hitFrame: 34, mv: 6747, energy: 122, concerto: 194, offtune: 3879, forte1: 686 },
    { hitFrame: 38, mv: 6747, energy: 122, concerto: 194, offtune: 3879, forte1: 686 },
  ], castConcerto: 1000});
const Skill = hsinAction("Skill - Answering Form", { requireBuff: ANSWERING_FORM, animFrames: 95, animPriority: { 45: 6, 95: 2 }, castPriority: 4, cooldown: 60 * 12, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 14, mv: 2506, energy: 45, concerto: 36, offtune: 1440, forte1: 128 },
    { hitFrame: 26, mv: 2506, energy: 45, concerto: 36, offtune: 1440, forte1: 128 },
    { hitFrame: 45, mv: 2506, energy: 45, concerto: 36, offtune: 1440, forte1: 128 },
    { hitFrame: 59, mv: 1671, energy: 30, concerto: 24, offtune: 960, forte1: 85 },
    { hitFrame: 67, commitFrame: 59, mv: 1671, energy: 30, concerto: 24, offtune: 960, forte1: 85 },
    { hitFrame: 69, mv: 5846, energy: 105, concerto: 84, offtune: 3360, forte1: 298,
      updateDebuffs: () => detonateHeart(AnsweringThunderHit) },
  ],
});

// --- Answering Form: Realm Wanderer at 100 Answering Heart, Realm Protector when Resolution of
//     Wishes (once per 24s — every visit) is spent on it. Both Skill DMG, both unlock Formshift.
const REALM = {
  node: Node.Forte, cast: Cast.Heavy, type: Type.Skill, minForte1: 10000, castForte1: -10000, requireBuff: ANSWERING_FORM,
  updateBuffs: () => applyCurrent(FORMSHIFT_UNLOCKED, 1),
};
const RealmWanderer = hsinAction("Forte Heavy - Answering Form: Realm Wanderer", { animFrames: 122, noSwapFrames: 114, animPriority: { 0: 11, 122: 2 }, castPriority: 5, ...REALM, bullets: [
    { hitFrame: 14, mv: 4565, energy: 43, concerto: 69, offtune: 1374 },
    { hitFrame: 47, mv: 1142, energy: 11, concerto: 18, offtune: 344 },
    { hitFrame: 54, commitFrame: 47, mv: 1142, energy: 11, concerto: 18, offtune: 344 },
    { hitFrame: 60, commitFrame: 47, mv: 1142, energy: 11, concerto: 18, offtune: 344 },
    { hitFrame: 67, commitFrame: 47, mv: 1142, energy: 11, concerto: 18, offtune: 344 },
    { hitFrame: 74, commitFrame: 47, mv: 1142, energy: 11, concerto: 18, offtune: 344 },
    { hitFrame: 80, commitFrame: 47, mv: 1142, energy: 11, concerto: 18, offtune: 344 },
    { hitFrame: 107, commitFrame: 106, mv: 45645, energy: 430, concerto: 687, offtune: 13739 },
  ], castForte1: -10000});
const RealmProtector = hsinAction("Forte Heavy - Answering Form: Realm Protector", {
  // Resolution of Wishes is gained once every 24s
  animFrames: 122, noSwapFrames: 114, animPriority: { 0: 11, 122: 2 }, castPriority: 5, cooldown: 60 * 24,
  ...REALM, bullets: [
    { hitFrame: 14, mv: 9932, energy: 107, concerto: 69, offtune: 5176,
      updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(1); } },
    { hitFrame: 47, mv: 2483, energy: 27, concerto: 18, offtune: 1294 },
    { hitFrame: 54, commitFrame: 47, mv: 2483, energy: 27, concerto: 18, offtune: 1294 },
    { hitFrame: 60, commitFrame: 47, mv: 2483, energy: 27, concerto: 18, offtune: 1294 },
    { hitFrame: 67, commitFrame: 47, mv: 2483, energy: 27, concerto: 18, offtune: 1294 },
    { hitFrame: 74, commitFrame: 47, mv: 2483, energy: 27, concerto: 18, offtune: 1294 },
    { hitFrame: 80, commitFrame: 47, mv: 2483, energy: 27, concerto: 18, offtune: 1294 },
    { hitFrame: 107, mv: 99315, energy: 1070, concerto: 687, offtune: 51755 },
  ], castForte1: -10000
});

// --- Illumining Form outside Mechanism Dominion: Stage 1 plants the Modular Heartlock, Stage 2,
//     the Heavy, the Dodge Counter and the Skill collapse it on their first hit. Every hit banks
//     Illumining Heart.
const collapseHeartlock = (): void => {
  if (!isHeld(HEARTLOCK)) return;
  revokeCurrent(HEARTLOCK);
  queue(Heartlock);
};
const COLLAPSE = { updateDebuffs: collapseHeartlock };
const IBA1 = hsinAction("Basic - Illumining Form 1", { requireBuff: ILLUMINING_FORM, animFrames: 45, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 4, commitFrame: 0, mv: 1255, energy: 23, concerto: 37, offtune: 722, forte2: 571 },
    { hitFrame: 10, commitFrame: 0, mv: 1255, energy: 23, concerto: 37, offtune: 722, forte2: 571 },
    { hitFrame: 32, commitFrame: 0, mv: 3765, energy: 68, concerto: 109, offtune: 2165, forte2: 1713 },
  ], updateBuffs: () => applyCurrent(HEARTLOCK, 1) });
const IBA2 = hsinAction("Basic - Illumining Form 2", { chains: [IBA1], requireBuff: ILLUMINING_FORM, animFrames: 30, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, mv: 3480, energy: 63, concerto: 100, offtune: 2000, forte2: 1583, ...COLLAPSE },
    { hitFrame: 25, commitFrame: 18, mv: 3480, energy: 63, concerto: 100, offtune: 2000, forte2: 1583 },
  ]});
// the Heavy and the Dodge Counter each lead "within a short time" into Stage 3
const IBA3 = hsinAction("Basic - Illumining Form 3", { chains: () => [IBA2, IHA, IDC], requireBuff: ILLUMINING_FORM, animFrames: 98, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, commitFrame: 0, mv: 911, energy: 17, concerto: 27, offtune: 524, forte2: 414 },
    { hitFrame: 18, commitFrame: 0, mv: 2731, energy: 50, concerto: 79, offtune: 1570, forte2: 1242 },
    { hitFrame: 26, commitFrame: 0, mv: 911, energy: 17, concerto: 27, offtune: 524, forte2: 414 },
    { hitFrame: 26, commitFrame: 0, mv: 2731, energy: 50, concerto: 79, offtune: 1570, forte2: 1242 },
    { hitFrame: 34, commitFrame: 0, mv: 911, energy: 17, concerto: 27, offtune: 524, forte2: 414 },
    { hitFrame: 34, commitFrame: 0, mv: 2731, energy: 50, concerto: 79, offtune: 1570, forte2: 1242 },
    { hitFrame: 41, commitFrame: 0, mv: 911, energy: 17, concerto: 27, offtune: 524, forte2: 414 },
    { hitFrame: 41, commitFrame: 0, mv: 2731, energy: 50, concerto: 79, offtune: 1570, forte2: 1242 },
    { hitFrame: 59, commitFrame: 53, mv: 1821, energy: 33, concerto: 53, offtune: 1047, forte2: 828 },
    { hitFrame: 62, commitFrame: 53, mv: 1821, energy: 33, concerto: 53, offtune: 1047, forte2: 828 },
  ]});
const Heartlock = hsinAction("Basic - Illumining Form: Modular Heartlock", { animFrames: 7, node: Node.Normal, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 2092, energy: 38, concerto: 61, offtune: 1203, forte2: 952 },
    { hitFrame: 7, commitFrame: 0, mv: 2092, energy: 38, concerto: 61, offtune: 1203, forte2: 952 },
  ]});
const IHA = hsinAction("Heavy - Illumining Form", { requireBuff: ILLUMINING_FORM, animFrames: 43, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 35, commitFrame: 32, mv: 5393, energy: 97, concerto: 155, offtune: 3100, forte2: 1583, ...COLLAPSE },
    { hitFrame: 41, commitFrame: 32, mv: 5393, energy: 97, concerto: 155, offtune: 3100, forte2: 1583 },
  ]});
const UpwardCut = hsinAction("Basic - Illumining Form: Upward Cut", { castPosition: Position.Grounded, requireBuff: ILLUMINING_FORM, animFrames: 38, animPriority: { 38: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 22, mv: 3503, energy: 63, concerto: 101, offtune: 2014, forte2: 1594 },
    { hitFrame: 34, mv: 5254, energy: 95, concerto: 152, offtune: 3021, forte2: 2390 },
  ]});
const IMA = hsinAction("Mid-air - Illumining Form Plunge", { castPosition: Position.Midair, endPosition: Position.Grounded, requireBuff: ILLUMINING_FORM, cooldown: 60 * 1.5, animFrames: 53, animPriority: { 0: 6, 29: 5, 53: 2 }, castPriority: 9, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 31, mv: 1347, energy: 25, concerto: 39, offtune: 1248, forte2: 613 },
    { hitFrame: 47, mv: 898, energy: 17, concerto: 26, offtune: 832, forte2: 409 },
  ]});
const IDC = hsinAction("Dodge Counter - Illumining Form", { chains: [DODGE], requireBuff: ILLUMINING_FORM, animFrames: 43, animPriority: { 33: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 35, commitFrame: 32, mv: 9568, energy: 172, concerto: 275, offtune: 5500, forte2: 4352, ...COLLAPSE },
    { hitFrame: 41, commitFrame: 32, mv: 9568, energy: 172, concerto: 275, offtune: 5500, forte2: 4352 },
  ], castConcerto: 1000 });

/** Either form's base Skill consumes every Heart of Thunder on its last stage and detonates the
 *  Flare there: one Electro Flare DMG instance at 35% of the target's rung per stack it took (42%
 *  for Heartward by Moon at S1 in Flare mode). A Skill cut before that hit commits spends none;
 *  one whose last stage lands with her off the field (an insta swap's) spends them and fires none. */
const thunderHit = (form: string, s1Rate: boolean): Action => flareHit(`Skill - ${form}: Heart of Thunder`,
  () => (s1Rate && isHeld(HS_S1) && isHeld(MODE_FLARE) ? 42 : 35) * stacksOfTeam(HEART_OF_THUNDER) - 100,
  { afterAction: () => revokeTeam(HEART_OF_THUNDER) }, () => HEART_OF_THUNDER);
const ThunderHit = thunderHit("Illumining Form", true);
const AnsweringThunderHit = thunderHit("Answering Form", false);

/** Skill - Illumining Form (Heartward by Moon): the Heart of Thunder instance above, and a collapse. */
const ISkill = hsinAction("Skill - Illumining Form", { castPosition: Position.Grounded, requireBuff: ILLUMINING_FORM, animFrames: 100, animPriority: { 100: 2 }, castPriority: 4, cooldown: 60 * 20,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 20, mv: 1114, energy: 20, concerto: 32, offtune: 640, forte2: 573, ...COLLAPSE },
    { hitFrame: 29, mv: 1114, energy: 20, concerto: 32, offtune: 640, forte2: 573 },
    { hitFrame: 38, mv: 1114, energy: 20, concerto: 32, offtune: 640, forte2: 573 },
    { hitFrame: 47, mv: 1114, energy: 20, concerto: 32, offtune: 640, forte2: 573 },
    { hitFrame: 90, mv: 17814, energy: 320, concerto: 512, offtune: 10240, forte2: 9156,
      updateDebuffs: () => detonateHeart(ThunderHit) },
  ],
});

// --- Illumining Form: Pillars Aligned at 300 Illumining Heart opens Mechanism Dominion (13s), and
//     the Dominion presses spend the Heart per hit.
//     In Flare mode Pillars Aligned lays 5 Electro Flare, and the Dominion presses' marked hits 1
//     more each (Stage 4 twice) — five of those a Formshift, whichever hits spend them (PILLAR_CHARGES).
const pillarFlare = (): void => {
  if (!isHeld(MODE_FLARE) || !stacksOf(PILLAR_CHARGES)) return;
  inflictElectroFlare(1); removeStack(PILLAR_CHARGES, 1);
};
const PILLAR_FLARE = { updateDebuffs: pillarFlare };
const PillarsAligned = hsinAction("Forte Skill - Illumining Form: Pillars Aligned", { castPosition: Position.Grounded, requireBuff: ILLUMINING_FORM,
  animFrames: 152, animPriority: { 152: 2 }, castPriority: 10, timestop: [0, 30], motionStop: [0, 152], 
  cooldown: 60 * 12,
  node: Node.Forte, cast: Cast.Skill, type: Type.Skill, bullets: [
    {
      hitFrame: 14, mv: 1795, energy: 11, concerto: 263, offtune: 326,
      updateDebuffs: () => {
        if (isHeld(MODE_FLARE)) inflictElectroFlare(5);
      },
    },
    { hitFrame: 42, mv: 3589, energy: 21, concerto: 263, offtune: 651 },
    { hitFrame: 48, commitFrame: 42, mv: 3589, energy: 21, concerto: 263, offtune: 651 },
    { hitFrame: 68, mv: 4486, energy: 26, concerto: 263, offtune: 814 },
    { hitFrame: 74, commitFrame: 68, mv: 4486, energy: 26, concerto: 27, offtune: 814 },
    { hitFrame: 122, mv: 17943, energy: 102, concerto: 53, offtune: 3253 },
    { hitFrame: 128, commitFrame: 122, mv: 17943, energy: 102, concerto: 53, offtune: 3253 },
    { hitFrame: 134, commitFrame: 122, mv: 17943, energy: 102, concerto: 66, offtune: 3253 },
    { hitFrame: 140, commitFrame: 122, mv: 17943, energy: 102, concerto: 66, offtune: 3253 },
  ],
  // cast on a full 300 Illumining Heart, which the Dominion presses then spend; +20 Concerto (wuwalab)
  minForte2: 30000, castConcerto: 2000,
  updateBuffs: () => applyCurrent(MECHANISM_DOMINION, 1),
});
const FBA1 = hsinAction("Basic - Illumining Form: Pillars Aligned 1", { requireBuff: MECHANISM_DOMINION, animFrames: 35, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, commitFrame: 12, mv: 2886, energy: 52, concerto: 83, offtune: 1659,
      ...PILLAR_FLARE, forte2: -1972 },
    { hitFrame: 26, commitFrame: 12, mv: 2886, energy: 52, concerto: 83, offtune: 1659, forte2: -1972 },
    { hitFrame: 35, commitFrame: 12, mv: 2886, energy: 52, concerto: 83, offtune: 1659, forte2: -1972 },
  ]});
const FBA2 = hsinAction("Basic - Illumining Form: Pillars Aligned 2", { chains: [FBA1], requireBuff: MECHANISM_DOMINION, animFrames: 49, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 21, commitFrame: 15, mv: 3823, energy: 69, concerto: 110, offtune: 2198,
      ...PILLAR_FLARE, forte2: -2612 },
    { hitFrame: 29, commitFrame: 15, mv: 3823, energy: 69, concerto: 110, offtune: 2198, forte2: -2612 },
    { hitFrame: 38, commitFrame: 15, mv: 3823, energy: 69, concerto: 110, offtune: 2198, forte2: -2612 },
  ]});
const FBA3 = hsinAction("Basic - Illumining Form: Pillars Aligned 3", { chains: () => [FBA2, FADC], requireBuff: MECHANISM_DOMINION, animFrames: 46, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, mv: 2135, energy: 39, concerto: 62, offtune: 1228,
      ...PILLAR_FLARE, forte2: -1459 },
    { hitFrame: 16, mv: 2135, energy: 39, concerto: 62, offtune: 1228, forte2: -1459 },
    { hitFrame: 24, mv: 2135, energy: 39, concerto: 62, offtune: 1228, forte2: -1459 },
    { hitFrame: 31, mv: 2135, energy: 39, concerto: 62, offtune: 1228, forte2: -1459 },
    { hitFrame: 39, mv: 2135, energy: 39, concerto: 62, offtune: 1228, forte2: -1459 },
  ]});
const FBA4 = hsinAction("Basic - Illumining Form: Pillars Aligned 4", { chains: [FBA3], requireBuff: MECHANISM_DOMINION, animFrames: 90, animPriority: { 82: 0 }, castPriority: 2, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 7, mv: 1664, energy: 30, concerto: 48, offtune: 956,
      ...PILLAR_FLARE, forte2: -1137 },
    { hitFrame: 16, mv: 1664, energy: 30, concerto: 48, offtune: 956, forte2: -1137 },
    { hitFrame: 25, mv: 1664, energy: 30, concerto: 48, offtune: 956, forte2: -1137 },
    { hitFrame: 34, mv: 1664, energy: 30, concerto: 48, offtune: 956, forte2: -1137 },
    { hitFrame: 43, mv: 1664, energy: 30, concerto: 48, offtune: 956, forte2: -1137 },
    { hitFrame: 52, mv: 1664, energy: 30, concerto: 48, offtune: 956, forte2: -1137 },
    { hitFrame: 61, mv: 1664, energy: 30, concerto: 48, offtune: 956, forte2: -1137 },
    { hitFrame: 67, mv: 4990, energy: 90, concerto: 144, offtune: 2868, ...PILLAR_FLARE, forte2: -3409 },
  ]});
const FADC = hsinAction("Dodge Counter - Illumining Form: Pillars Aligned", { chains: [DODGE], requireBuff: MECHANISM_DOMINION, animFrames: 49, animPriority: { 26: 2 }, castPriority: 2, node: Node.Forte, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 21, commitFrame: 15, mv: 6607, energy: 119, concerto: 190, offtune: 3798,
      ...PILLAR_FLARE, forte2: -2257 },
    { hitFrame: 29, commitFrame: 15, mv: 6607, energy: 119, concerto: 190, offtune: 3798, forte2: -2257 },
    { hitFrame: 38, commitFrame: 15, mv: 6607, energy: 119, concerto: 190, offtune: 3798, forte2: -2257 },
  ], castConcerto: 1000});

// --- Illumining Form: Beholding All Horizons once the Heart is spent, Stilling when Law of Heaven
//     (once per 24s — every visit) is spent on it. Both need the Heart at 0 or below "during the
//     Mechanism Dominion state", clear it, end Dominion and unlock Pillars Across Heaven.
const HORIZONS = {
  node: Node.Forte, cast: Cast.Heavy, type: Type.Skill, maxForte2: 0, resetForte2: true, castConcerto: 2000,
  requireBuff: MECHANISM_DOMINION,
  updateBuffs: () => { revokeCurrent(MECHANISM_DOMINION); applyCurrent(PILLARS_UNLOCKED, 1); },
};
const Beholding = hsinAction("Forte Heavy - Illumining Form: Beholding All Horizons", { animFrames: 150, animPriority: { 150: 0 }, castPriority: 10, timestop: [0, 150], motionStop: [0, 150], ...HORIZONS, bullets: [
    { hitFrame: 86, mv: 1027, energy: 6, offtune: 3 },
    { hitFrame: 92, commitFrame: 86, mv: 1027, energy: 6, offtune: 3 },
    { hitFrame: 98, commitFrame: 86, mv: 1027, energy: 6, offtune: 3 },
    { hitFrame: 104, commitFrame: 86, mv: 1027, energy: 6, offtune: 3 },
    { hitFrame: 113, mv: 36970, energy: 185, offtune: 90 },
  ]});
const FHA = hsinAction("Forte Heavy - Illumining Form: Stilling All Horizons", {
  // Law of Heaven is gained once every 24s
  animFrames: 150, animPriority: { 150: 0 }, castPriority: 10, timestop: [0, 150], motionStop: [0, 150], cooldown: 60 * 24,
  ...HORIZONS, bullets: [
    { hitFrame: 86, mv: 2705, energy: 36, offtune: 1188 },
    { hitFrame: 92, commitFrame: 86, mv: 2705, energy: 36, offtune: 1188 },
    { hitFrame: 98, commitFrame: 86, mv: 2705, energy: 36, offtune: 1188 },
    { hitFrame: 104, commitFrame: 86, mv: 2705, energy: 36, offtune: 1188 },
    { hitFrame: 113, mv: 97349, energy: 1265, offtune: 42768,
      updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(5); } },
  ],
});

// --- the two Liberations: Formshift into Illumining Form, Pillars Across Heaven back out of it
const Lib1 = hsinAction("Liberation - Formshift", {
  requireBuff: FORMSHIFT_UNLOCKED, animFrames: 254, animPriority: { 254: 2 }, castPriority: 10, timestop: [0, 254], motionStop: [0, 254], 
  cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, castConcerto: 2000, resetForte2: true,
  // no damage of its own: a 0-MV bullet at 206 carries wuwalab's 5-Flare inflict
  bullets: [{
    hitFrame: 206, mv: 0,
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
  }],
  updateBuffs: () => {
    if (isHeld(MODE_UNISON) && isHeld(FORMSHIFT_UNISON)) {
      applyCurrent(UNISON, 1);
      revokeCurrent(FORMSHIFT_UNISON);
    }
    revokeCurrent(FORMSHIFT_UNLOCKED);
    revokeCurrent(ANSWERING_FORM);
    applyCurrent(ILLUMINING_FORM, 1);
    applyCurrent(HEART_MANIFEST, 1);
    revokeTeam(EDICT);
    applyTeam(EDICT, 21);
    if (isHeld(MODE_FLARE)) {
      applyCurrent(HEARTLOCK_PRIMED, 1);
      setStacksSelf(PILLAR_CHARGES, 5);
    }
  },
});
/** The Sanctum comes down as Resonance Skill DMG: 125 Energy, and the end of Heart Manifest. */
const Lib2 = hsinAction("Liberation - Pillars Across Heaven", {
  requireBuff: PILLARS_UNLOCKED, animFrames: 305, animPriority: { 302: 0 }, castPriority: 10, timestop: [0, 302], motionStop: [0, 302], 
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Skill, bullets: [
    { hitFrame: 136, mv: 8051, offtune: 1959 },
    { hitFrame: 150, mv: 9057, offtune: 2204 },
    { hitFrame: 164, mv: 6038, offtune: 1469 },
    { hitFrame: 190, mv: 10064, offtune: 2448 },
    { hitFrame: 214, mv: 7045, offtune: 1714 },
    { hitFrame: 240, mv: 161012, offtune: 39168, updateDebuffs: () => { if (isHeld(HS_S3) && isHeld(MODE_FLARE) && stacksOfEnemy(ELECTRO_FLARE) > 0) queue(PillarsFlare); } },
  ], castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => {
    revokeCurrent(PILLARS_UNLOCKED); revokeCurrent(ILLUMINING_FORM); revokeCurrent(HEART_MANIFEST);
    applyCurrent(ANSWERING_FORM, 1);
    revokeTeam(THUNDERGLOW); revokeCurrent(PILLAR_CHARGES); revokeEnemy(FLEETING_THUNDER);
    applyCurrent(NIGHTGLOW, 1);
  },
});

/** Soaring Pillar: one Edict spent a second while the active resonator deals damage, considered
 *  Resonance Liberation DMG. */
const SANCTUM = new ActionField("Hsin: Manifold Sanctum");
const SoaringPillar = hsinAction("Liberation - Soaring Pillar", {
  tag: ActionTag.OffField, type: Type.Liberation, subtype: Subtype.Coordinated, bullets: [{ hitFrame: 24, mv: 1137 }], field: SANCTUM,
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
const UIntro = hsinAction("Intro - Answering Form", { endPosition: Position.Grounded, requireBuff: ANSWERING_FORM,

  animFrames: 44, noSwapFrames: 44, motionStop: [0, 14], animPriority: { 44: 2 }, castPriority: 11,

  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 23, commitFrame: 2, mv: 1028, energy: 75, concerto: 30, offtune: 591, forte1: 65 },
    { hitFrame: 27, commitFrame: 2, mv: 2055, energy: 150, concerto: 60, offtune: 1181, forte1: 130 },
    { hitFrame: 31, commitFrame: 2, mv: 1028, energy: 75, concerto: 30, offtune: 591, forte1: 65 },
    { hitFrame: 37, commitFrame: 2, mv: 2055, energy: 150, concerto: 60, offtune: 1181, forte1: 130 },
    { hitFrame: 41, commitFrame: 2, mv: 2055, energy: 150, concerto: 60, offtune: 1181, forte1: 130 },
    { hitFrame: 45, commitFrame: 2, mv: 2055, energy: 150, concerto: 60, offtune: 1181, forte1: 130 },
  ], castConcerto: 1000, castForte1: 6000
});
const ManifoldAnswering = hsinAction("Intro - Answering Form: Manifold Unison", { endPosition: Position.Grounded, requireBuff: ANSWERING_FORM,

  animFrames: 44, noSwapFrames: 44, motionStop: [0, 14], animPriority: { 44: 2 }, castPriority: 11,

  node: Node.Intro, cast: Cast.Intro, type: Type.Skill, bullets: [
    { hitFrame: 23, commitFrame: 2, mv: 6059, energy: 75, concerto: 30, offtune: 591, forte1: 65 },
    { hitFrame: 27, commitFrame: 2, mv: 12118, energy: 150, concerto: 60, offtune: 1181, forte1: 130 },
    { hitFrame: 31, commitFrame: 2, mv: 6059, energy: 75, concerto: 30, offtune: 591, forte1: 65 },
    { hitFrame: 37, commitFrame: 2, mv: 12118, energy: 150, concerto: 60, offtune: 1181, forte1: 130 },
    { hitFrame: 41, commitFrame: 2, mv: 12118, energy: 150, concerto: 60, offtune: 1181, forte1: 130 },
    { hitFrame: 45, commitFrame: 2, mv: 12118, energy: 150, concerto: 60, offtune: 1181, forte1: 130 },
  ], castConcerto: 1000,
  ...MANIFOLD, castForte1: 6000
});
const UIIntro = hsinAction("Intro - Illumining Form", { endPosition: Position.Grounded, qteFrames: 8, requireBuff: ILLUMINING_FORM,
  animFrames: 152, noSwapFrames: 151, timestop: [0, 30], motionStop: [0, 152], animPriority: { 152: 2 }, castPriority: 11,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 14, mv: 566, energy: 15, concerto: 17, offtune: 326 },
    { hitFrame: 42, mv: 1132, energy: 30, concerto: 33, offtune: 651 },
    { hitFrame: 48, commitFrame: 42, mv: 1132, energy: 30, concerto: 33, offtune: 651 },
    { hitFrame: 68, mv: 1415, energy: 38, concerto: 41, offtune: 814 },
    { hitFrame: 74, commitFrame: 68, mv: 1415, energy: 38, concerto: 41, offtune: 814 },
    { hitFrame: 122, mv: 5659, energy: 150, concerto: 163, offtune: 3253 },
    { hitFrame: 128, commitFrame: 122, mv: 5659, energy: 150, concerto: 163, offtune: 3253 },
    { hitFrame: 134, commitFrame: 122, mv: 5659, energy: 150, concerto: 163, offtune: 3253 },
    { hitFrame: 140, commitFrame: 122, mv: 5659, energy: 150, concerto: 163, offtune: 3253 },
  ], castConcerto: 1000,
  // lands straight in Mechanism Dominion at 300 Illumining Heart
  castForte2: 30000, updateBuffs: () => applyCurrent(MECHANISM_DOMINION, 1),
});
const ManifoldIllumining = hsinAction("Intro - Illumining Form: Manifold Unison", { endPosition: Position.Grounded, qteFrames: 8, requireBuff: ILLUMINING_FORM,
  animFrames: 152, noSwapFrames: 151, timestop: [0, 30], motionStop: [0, 152], animPriority: { 152: 2 }, castPriority: 11,
  node: Node.Intro, cast: Cast.Intro, type: Type.Skill, bullets: [
    { hitFrame: 14, mv: 1573, energy: 15, concerto: 27, offtune: 326 },
    { hitFrame: 42, mv: 3145, energy: 30, concerto: 53, offtune: 651 },
    { hitFrame: 48, commitFrame: 42, mv: 3145, energy: 30, concerto: 53, offtune: 651 },
    { hitFrame: 68, mv: 3931, energy: 38, concerto: 66, offtune: 814 },
    { hitFrame: 74, commitFrame: 68, mv: 3931, energy: 38, concerto: 66, offtune: 814 },
    { hitFrame: 122, mv: 15722, energy: 150, concerto: 263, offtune: 3253 },
    { hitFrame: 128, commitFrame: 122, mv: 15722, energy: 150, concerto: 263, offtune: 3253 },
    { hitFrame: 134, commitFrame: 122, mv: 15722, energy: 150, concerto: 263, offtune: 3253 },
    { hitFrame: 140, commitFrame: 122, mv: 15722, energy: 150, concerto: 263, offtune: 3253 },
  ], castConcerto: 1000,
  castForte2: 30000, updateBuffs: () => {
    MANIFOLD.updateBuffs();
    applyCurrent(MECHANISM_DOMINION, 1);
  },
});
const FlareIntro = hsinAction("Intro - Answering Form (Flare)", { endPosition: Position.Grounded, requireBuff: ANSWERING_FORM,

  animFrames: 66, noSwapFrames: 66, motionStop: [0, 39], animPriority: { 66: 2 }, castPriority: 11,

  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 39, commitFrame: 12, mv: 788, energy: 50, concerto: 23, offtune: 453,
      forte1: 75, updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(1); } },
    { hitFrame: 43, commitFrame: 12, mv: 788, energy: 50, concerto: 23, offtune: 453, forte1: 75 },
    { hitFrame: 57, commitFrame: 12, mv: 788, energy: 50, concerto: 23, offtune: 453, forte1: 75 },
    { hitFrame: 61, commitFrame: 12, mv: 788, energy: 50, concerto: 23, offtune: 453, forte1: 75 },
    { hitFrame: 84, commitFrame: 12, mv: 12602, energy: 800, concerto: 363, offtune: 7245, forte1: 1197 },
  ], castConcerto: 1000, castForte1: 6000
});
const FlareIIntro = hsinAction("Intro - Illumining Form (Flare)", { endPosition: Position.Grounded, requireBuff: ILLUMINING_FORM,

  animFrames: 98, noSwapFrames: 91, motionStop: [0, 18], animPriority: { 98: 2 }, castPriority: 11,

  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 20, commitFrame: 2, mv: 1142, energy: 50, concerto: 33, offtune: 657,
      forte2: 260, updateDebuffs: () => { if (isHeld(MODE_FLARE)) inflictElectroFlare(1); } },
    { hitFrame: 20, commitFrame: 2, mv: 3997, energy: 175, concerto: 115, offtune: 2298, forte2: 909 },
    { hitFrame: 28, commitFrame: 2, mv: 1142, energy: 50, concerto: 33, offtune: 657, forte2: 260 },
    { hitFrame: 28, commitFrame: 2, mv: 3997, energy: 175, concerto: 115, offtune: 2298, forte2: 909 },
    { hitFrame: 36, commitFrame: 2, mv: 1142, energy: 50, concerto: 33, offtune: 657, forte2: 260 },
    { hitFrame: 36, commitFrame: 2, mv: 3997, energy: 175, concerto: 115, offtune: 2298, forte2: 909 },
    { hitFrame: 43, commitFrame: 2, mv: 1142, energy: 50, concerto: 33, offtune: 657, forte2: 260 },
    { hitFrame: 43, commitFrame: 2, mv: 3997, energy: 175, concerto: 115, offtune: 2298, forte2: 909 },
    { hitFrame: 61, commitFrame: 2, mv: 1142, energy: 50, concerto: 33, offtune: 657, forte2: 260 },
    { hitFrame: 64, commitFrame: 2, mv: 1142, energy: 50, concerto: 33, offtune: 657, forte2: 260 },
  ], castConcerto: 1000,
});
const Outro = hsinAction("Outro - Herself a Thousand Lanterns", {
  animFrames: 0,
  cast: Cast.Outro, type: Type.Outro, bullets: [{ hitFrame: 0, mv: 5000 }, { hitFrame: 5, commitFrame: 0, mv: 5000 }], minConcerto: 10000, castConcerto: -10000,
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
  // S1's floor of 50 Heart of Thunder is Flare's alone, so it goes up here: the mode is equipped
  // after her sequences, so it sees S1 where S1's own combatStart can't see the mode
  combatStart: () => {
    applyEnemy(FLARE_RETAINED, 1);
    const held = stacksOfTeam(HEART_OF_THUNDER);
    if (isHeld(HS_S1) && held < 50) applyTeam(HEART_OF_THUNDER, 50 - held);
  },
  // Forms Turn, Heart Abides, Flare mode: every Electro Rage the team inflicts is hers, and comes
  // off the target — watched from her own slot on every hit, so a teammate's overflow lands on her
  hitGlobal: () => {
    if (!isHeld(MODE_FLARE)) return;
    const rage = applied(ELECTRO_RAGE);
    if (rage > 0) applyTeam(HEART_OF_THUNDER, rage);
    if (stacksOfEnemy(ELECTRO_RAGE) > 0) consume(ELECTRO_RAGE, stacksOfEnemy(ELECTRO_RAGE));
  },
});

/** Resonance Mode - Unison: she is a Unison Boon reactor, and her own Unison Response hands every
 *  reactor a Unison Boon (once, refreshed after); a teammate who gains a Unison of their own takes
 *  Shared Light, watched from her slot on every action. */
const MODE_UNISON = new ResonanceMode({
  name: "Resonance Mode - Unison",
  combatStart: () => { applyCurrent(BOON_REACTOR, 1); },
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

/** Illumining Heart's own gate (read by MECHANISM_DOMINION, declared with the forms): a Normal Attack - Illumining Form or Resonance Skill - Illumining
 *  Form hit only banks it "not in the Mechanism Dominion state" — held from Pillars Aligned (or an
 *  Illumining Intro landing straight in Dominion) to Beholding/Stilling All Horizons closing it, it
 *  negates whatever forte2 one of those actions would otherwise add, in case a rotation ever
 *  presses one under Dominion (the Forte-unlocked presses replace them here regardless). */
const DOMINION_GATED = [IBA1, IBA2, IBA3, Heartlock, IHA, UpwardCut, IMA, IDC, ISkill];

/** The Modular Heartlock standing on the target, and the Flare-mode priming that makes its next
 *  collapse worth 150 Illumining Heart — once per Formshift, paid on the collapse's own cast. */
const HEARTLOCK = new Buff({ name: "Hsin: Modular Heartlock" });
const HEARTLOCK_PRIMED = new Buff({
  name: "Hsin: Formshift Extra Modular Heartlock",
  updateBuffs: () => {
    if (!runningAction(Heartlock)) return;
    addGain({ forte2: 15000 });
    revokeCurrent(HEARTLOCK_PRIMED);
  },
});

/** Edict: 21 Soaring Pillars, one a second, banked by Formshift. */
const EDICT = coordinatedBuff("Hsin: Edict", 21, () => HSIN_RESONATOR, SoaringPillar);

/** The 5 Dominion hits that lay a Flare each, reset by every Formshift. */
const PILLAR_CHARGES = new Buff({ name: "Hsin: Pillars Aligned Flare Charges", maxStacks: 5 });

/** Heart of Thunder: the team's Electro Rage, taken off the target and banked on her, 100 at most.
 *  Spent whole by either form's base Skill on its last stage. Held team-wide so the count reads
 *  on every row of the log, though only her own casts ever read or spend it. */
const HEART_OF_THUNDER: Buff = new Buff({
  name: "Hsin: Heart of Thunder", maxStacks: 100,
  // the count is the shared one, and a row reads it off the slot it is filed on, which holds
  // none of it, so the stacks are named here
  display: () => `Hsin: Heart of Thunder x${stacksOfTeam(HEART_OF_THUNDER)}`,
});
/** A Skill's last stage: on field it detonates the Heart of Thunder (the hit spends it once it
 *  lands), off field it spends it with nothing fired. */
function detonateHeart(hit: Action): void {
  if (!stacksOfTeam(HEART_OF_THUNDER)) return;
  if (isActive()) queue(hit);
  else revokeTeam(HEART_OF_THUNDER);
}

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

/** S1. In Unison mode only: both Manifold Unison Intros hit for +15% DMG Multiplier, and +10% more
 *  a Unison Boon stack the team holds, four at most — a fourth only ever exists at S6, which is
 *  what raises the Boon's own cap that far. In Flare mode only: entering combat floors Heart of
 *  Thunder at 50 (a start-of-combat effect, its 12s cooldown ignored; MODE_FLARE lays it), and the Illumining Skill's
 *  Flare instance pays 42% of the rung a Heart of Thunder stack instead of 35% — a rate ThunderHit
 *  reads off this sequence itself, since the stacks it spends are what it multiplies.
 *  Radiance Ward is damage reduction, out of scope. */
const HS_S1 = new Sequence({
  name: "Hsin S1: A Boat to Cross the Rising Tide",
  applyStats: () => {
    if (!isHeld(MODE_UNISON)) return;
    if (runningAction(ManifoldAnswering) || runningAction(ManifoldIllumining)) addStat(Stat.MulMv, 15 + 10 * Math.min(4, stacksOf(UNISON_BOON)));
  },
});

/** S2: +60% DMG Multiplier on both Realm forms and both Horizons forms, and entering combat hands
 *  her 100 more Answering Heart. Its other half resets the two once-per-24s upgrades'
 *  cooldowns, which changes nothing here: the rotation already spends Resolution of Wishes and Law
 *  of Heaven every visit. */
const HS_S2 = new Sequence({
  name: "Hsin S2: To Wake Is to Wonder What I Am",
  combatStart: () => {
    addForte1(10000);
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
    if (isHeld(MODE_UNISON)) addStat(Stat.CritDmg, 20 + 15 * Math.min(4, stacksOf(UNISON_BOON)));
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

export const HSIN_RESONATOR = new Resonator({
  name: "Hsin",
  talent: HSIN_TALENTS,
  inherent1: HS_INHERENT_1,
  inherent2: HS_INHERENT_2,
  tier: Tier.Limited,
  element: Attribute.Electro,
  weapon: WeaponType.Rectifier,
  // Unison mode: the Manifold form on a Unison Response, or on a held Source Intent
  combatStart: () => {
    applyCurrent(NIGHTGLOW, 1);
    applyCurrent(ANSWERING_FORM, 1);
  },
  // Answering Heart comes off an Answering Form hit only while she is the active resonator: a hit
  // landing after she has left (a swap-out's) banks none of its own
  updateDebuffs: () => { if (!isActive() && runningAnyOf(ANSWERING_HEART_HITS)) addGain({ forte1: -currentHit().forte1 }); },
  color: "#f1a49b",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  outro: () => (isHeld(UNISON) ? OutroUnison : Outro),
  intro: () => {
      if (!isHeld(MODE_UNISON)) return isHeld(ILLUMINING_FORM) ? FlareIIntro : FlareIntro;
      const manifold = unisonIntro() || isHeld(SOURCE_INTENT);
      return isHeld(ILLUMINING_FORM) ? (manifold ? ManifoldIllumining : UIIntro) : (manifold ? ManifoldAnswering : UIntro);
    },
  // each form's own Basic Attack; Illumining's is cast in mid-air too ("consumes STA when Hsin is in mid-air")
  swapIn: () => (isHeld(MECHANISM_DOMINION) ? FBA1 : isHeld(ILLUMINING_FORM) ? IBA1 : BA1),
  swapInAir: () => (isHeld(MECHANISM_DOMINION) ? FBA1 : isHeld(ILLUMINING_FORM) ? IBA1 : MA),
  maxEnergy: 12500,
  forteScale: [0.01, 0.01, 1, 1, 1],
  maxForte1: 10000,
  maxForte2: 30000,


  stats: [[Stat.BaseHp, 10300], [Stat.BaseAtk, 462.5], [Stat.BaseDef, 1112.2202]],
});

// The Flare-mode visit as the kit reads: the Intro chains into Stage 4, the Skill into Stage 4
// again, Realm Protector spends the Heart and Formshift follows; Stage 1-2 collapse the primed
// Heartlock, Pillars Aligned opens Dominion, its four stages lay the Flare charges, the Skill
// spends the Heart of Thunder they overflowed into, Stilling closes Dominion and Pillars Across
// Heaven ends the visit. She is never the team's lead, so this covers opener and loop both.

const BA34 = new ActionGroup("Basic - Answering Form 34", [BA3, BA4]);
const BA1234 = new ActionGroup("Basic - Answering Form 1234", [BA1, BA2, BA3, BA4]);

const IBA12 = new ActionGroup("Basic - Illumining Form 12", [IBA1, IBA2]);
const IBA123 = new ActionGroup("Basic - Illumining Form 123", [IBA1, IBA2, IBA3]);

const FBA1234 = new ActionGroup("Basic - Illumining Form: Pillars Aligned 1234", [FBA1, FBA2, FBA3, FBA4]);
const FBA123 = new ActionGroup("Basic - Illumining Form: Pillars Aligned 123", [FBA1, FBA2, FBA3]);
const FBA12 = new ActionGroup("Basic - Illumining Form: Pillars Aligned 12", [FBA1, FBA2]);

/** Which Outro this resonator casts, resolved when its row is reached — whichever the
 *  kit's state calls for there. */

const HS_ROTATION_FLARE = new Rotation([
  INTRO, BA4.holdCancel(),
  RealmProtector, Lib1, ECHO,
  IBA1.instaCancel(), ISkill.mashCancel(),
  //IBA123.instaCancel(), ISkill.holdCancel(),
  PillarsAligned, 
  //FBA1234.holdCancel(), FHA,
  //FBA12.dodgeCancel(), FBA12.dodgeCancel(), FBA1.holdCancel(),FHA,
  FBA12.dodgeCancel(), FBA123.holdCancel(),FHA,
  Lib2, BA1.instaSwap(), OUTRO,
]);
const HS_ROTATION_FLARE_S2 = new Rotation([
  INTRO, BA4.holdCancel(), INTRO_OPENER,  
  RealmProtector, Lib1, ECHO,
  IBA1.instaCancel(), ISkill.mashCancel(),
  PillarsAligned, 
  FBA12.dodgeCancel(), FBA123.holdCancel(),FHA,
  Lib2, BA1.instaSwap(), OUTRO,
]);

// The Unison-mode loop, Jinhsi's double-Intro shape. The Answering pre-visit: the Intro (its
// Manifold form off a response or a held Source Intent) chains into Stage 3, the Skill into Stage
// 4, Realm Protector spends the Heart and Formshift's Unison pays the outro that hands the field
// back. Her return is in Illumining Form: that Intro lands her in Dominion at 300 Heart, its four
// stages spend it, Stilling closes Dominion and Pillars Across Heaven ends the visit on a real bar.
// Leading, the Intro's 68 Answering Heart and its stages 1-2 are a full chain and then Stage 1-2
// again, so the section's own Stage 3-4 continue it: 126 Heart into Realm Protector's 100.
const HS_ROTATION_UNISON = new Rotation([
  DOUBLE_INTRO, BA34.holdCancel(),
  RealmProtector, Lib1, OUTRO,

  INTRO, 
  ECHO, 
  FBA12.dodgeCancel(), FBA123.holdCancel(),FHA,
  Lib2, Skill.instaSwap(), OUTRO,
]);
const HS_ROTATION_UNISON_S2 = new Rotation([
  DOUBLE_INTRO, BA34.holdCancel(), INTRO_OPENER,  
  RealmProtector, Lib1, OUTRO,

  INTRO, 
  ECHO, 
  FBA12.dodgeCancel(), FBA123.holdCancel(),FHA,
  Lib2, Skill.instaSwap(), OUTRO,
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
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Skill, Substat.AtkPct, Substat.FlatAtk, Substat.Basic, Substat.Liberation),
  rotation: {0: HS_ROTATION_FLARE, 2: HS_ROTATION_FLARE_S2},
  mode: MODE_FLARE,
  sequences: HS_SEQUENCES,
});

export const HSIN_UNISON = new Loadout({
  resonator: HSIN_RESONATOR,
  weapons: [BLOOMING_JADEHAVEN, COSMIC_RIPPLES, STRINGMASTER, LETHEAN_ELEGY, FREEZE_FRAME],
  echoLoadouts: [new EchoLoadout(STAY_TUNED_HSIN, SWORN_VIGIL_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Skill, Substat.AtkPct, Substat.FlatAtk, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Basic, Substat.Liberation),
  rotation: {0: HS_ROTATION_UNISON, 2: HS_ROTATION_UNISON_S2},
  mode: MODE_UNISON,
  sequences: HS_SEQUENCES,
});
