/**
 * Suisui — a Glacio Rectifier healer/support, and the first kit built around Negative Statuses in
 * general rather than one of them. She deals almost no damage; everything she is worth is the
 * three things she hands the team.
 *
 * **Ceaseless Landscape** (Resonance Liberation, 30s, so permanent uptime here) raises the target's
 * limit on whichever Negative Status the team is actually playing — Spectro Frazzle, Fusion Burst,
 * Glacio Chafe and Aero Erosion each +3 once anyone inflicts it or deals its damage, Electro Flare
 * and Electro Rage together off Flare — and lets a Havoc kit that spends Havoc Bane ignore 6% of
 * the target's DEF and 12% of its Havoc RES. That cap raise is why she stands in front of Hiyuki
 * (whose every converted Chafe stack calculates at the *limit*, so +3 moves every hit up three
 * rungs) and Yangyang: Xuanling (whose Unbroken Vow tiers on the Bane count).
 *
 * **Outro - Rippling Waters** is 25% All DMG Amplification for the team, plus a tier list paid out
 * of the Floral Epistle it consumes: 200 buys the first Plume Step, 400 the second and a DMG bonus
 * scaled off her own Energy Regen, 600 the third and Undulating Mist, an ATK buff she hands the
 * incoming resonator on every handoff from then on. Her rotation banks well past 600, so all three
 * tiers are live. Both Energy-Regen-scaled figures are taken at their cap per CLAUDE.md's rule for
 * a team buff scaled by the applier's own stats (both want 260% ER, which her build reaches).
 *
 * **Sky Over Water** (Inherent Skill) enhances whichever of Awakening Spring / Intro - Tinkling
 * Jade comes first every 25s: +18 Concerto, +13 Resonance Energy, +80% Crit. Rate, +240% Glacio DMG
 * and nanoka's own enhanced off-tune row (81,600 against the plain 9,600). One cast a rotation, the
 * way every other "once every Ns" in this project is read — Awakening Spring takes it in the
 * opener, the Intro every visit after, and her Outro arms the next one.
 *
 * Her two stances are the two gauges and nothing else: Zephyr banks **Cloud Breath** (forte1, 120),
 * which Awakening Spring or the Intro spends to drop her into **Drizzle Stance**, where the same
 * buttons bank **Floral Epistle** (forte2, 600) for the Outro to spend. The engine gates nothing on
 * a gauge and the rotation below is the kit-valid line, so the stances need no state of their own —
 * each has its own actions.
 *
 * Not modelled, because none of it reaches a damage formula: every heal (Enrichment, Spring's
 * Birth, the Plume Steps, Drizzle Stance's own channel — only the HEALS marker they set matters,
 * for Rejuvenating Glow and her own weapon), Reflecting Shadows' interruption resistance, and
 * Glimmering Gold's once-per-10-minutes revive.
 *
 * Sequences 1-6 are from nanoka's released 3.7.0 data — see their own block below. S3 changes the
 * line itself (the Drizzle skill chains into a Kingfisher Stage 4), so the loadout carries a second
 * rotation for S3 and up.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1110, the 3.6+365 static JSON — the
 * page is client-rendered) at skill level 10, per-hit x hit count, with the flat Concerto Regen
 * rows folded in (the Intro's 10, the Liberation's 20) and the hidden +10 on the dodge counter.
 * Both gauges are wuwalab's frame data (api.wuwalab.com/api/app/characters/suisui), which nanoka
 * does not expose; the two agree on every MV/energy/concerto/off-tune figure they share. Her
 * `weakness_mastery` is 0, so she carries no flat Tune Break Boost.
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, coordinatedBuff } from "../../engine/gear.js";
import {
  addBuff,
  addStat,
  applied,
  appliedByMember,
  applyCurrent,
  applyEnemy,
  applyTeam,
  concerto,
  consumedAny,
  consumedByMe,
  onAction,
  runningAction,
  currentTeam,
  isType,
  maxStackIncrease,
  queueOn,
  queueOutro,
  removeStackTeam,
  revokeCurrent,
  revokeTeam,
  stacksOfTeam,
  
  forte2,
  isActive,
  casting,
  currentMember,
  ticksOfTeam,
  isHeld,
  addToCast,
} from "../../engine/context.js";
import { ActionGroup, Action, Cooldown, Rotation, NOINTRO, ECHO, INTRO } from "../../engine/rotation.js";
import {
  AERO_EROSION, ELECTRO_FLARE, ELECTRO_RAGE, FUSION_BURST, GLACIO_CHAFE, HAVOC_BANE, HEALS, SPECTRO_FRAZZLE,
  inflictedNegativeStatusBy, heal } from "../../shared/status.js";
import { FIRSTLIGHTS_HERALD } from "../../weapons/rectifier.js";
import { VARIATION } from "../../weapons/standard.js";
import { FORBIDDEN_BASTION, FEATHERED_TRACE_5PC } from "../../echoes/mengzhou.js";
import { mainstats, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function suisuiAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

// --- Zephyr Stance: the chain she opens a fight from, banking Cloud Breath (forte1) for
//     Awakening Spring. Resonance Skill - Zephyr Stance's own 40 is the kit page's, not the
//     per-hit table's — wuwalab carries no gauge on those six hits either.
const BA1 = suisuiAction("Basic - Zephyr Stance 1", { animFrames: 24, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 8, commitFrame: 2, mv: 63.15, energy: 1, concerto: 3.18, offtune: 3176, forte1: 24 }]});
const BA2 = suisuiAction("Basic - Zephyr Stance 2", { animFrames: 46, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 61, energy: 0.96, concerto: 3.07, offtune: 3068, forte1: 23 },
    { hitFrame: 30, commitFrame: 27, mv: 61, energy: 0.96, concerto: 3.07, offtune: 3068, forte1: 23 },
  ]});
const BA3 = suisuiAction("Basic - Zephyr Stance 3", { animFrames: 51, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 22, mv: 41.8, energy: 0.66, concerto: 2.11, offtune: 2103, forte1: 16 },
    { hitFrame: 29, mv: 41.8, energy: 0.66, concerto: 2.11, offtune: 2103, forte1: 16 },
    { hitFrame: 41, commitFrame: 35, mv: 55.74, energy: 0.88, concerto: 2.81, offtune: 2804, forte1: 21 },
  ]});
const BA4 = suisuiAction("Basic - Zephyr Stance 4", { animFrames: 60, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 2, commitFrame: 0, mv: 15.91, energy: 0.25, concerto: 0.8, offtune: 800, forte1: 6 },
    { hitFrame: 8, commitFrame: 0, mv: 15.91, energy: 0.25, concerto: 0.8, offtune: 800, forte1: 6 },
    { hitFrame: 14, commitFrame: 0, mv: 15.91, energy: 0.25, concerto: 0.8, offtune: 800, forte1: 6 },
    { hitFrame: 20, commitFrame: 0, mv: 15.91, energy: 0.25, concerto: 0.8, offtune: 800, forte1: 6 },
    { hitFrame: 26, commitFrame: 0, mv: 15.91, energy: 0.25, concerto: 0.8, offtune: 800, forte1: 6 },
    { hitFrame: 41, commitFrame: 0, mv: 79.53, energy: 1.25, concerto: 4, offtune: 4000, forte1: 30 },
  ]});
const MA = suisuiAction("Mid-air - Zephyr Stance Plunge", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 70.72, energy: 1.86, concerto: 5.93, offtune: 5928 });
const DC = suisuiAction("Dodge Counter - Zephyr Stance 3", { animFrames: 35, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 13, mv: 51.2, energy: 0.81, concerto: 5.58, offtune: 2576, forte1: 9 },
    { hitFrame: 17, mv: 51.2, energy: 0.81, concerto: 5.58, offtune: 2576, forte1: 9 },
    { hitFrame: 26, mv: 68.27, energy: 1.08, concerto: 7.44, offtune: 3434, forte1: 12 },
  ]});
// the Zephyr and Drizzle Stance skills share one 6s cooldown
const SKILL_CD = new Cooldown({ frames: 60 * 6 });
const Skill = suisuiAction("Skill - Vernal Screen: Zephyr Stance", { cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, mv: 143.16, energy: 2.28, concerto: 7.20, offtune: 7200, forte1: 40 });

/** Awakening Spring: replaces the Zephyr skill at full Cloud Breath, spends the whole bar and drops
 *  her into Drizzle Stance, which clears Floral Epistle on the way in. HP-scaled, and one of the
 *  two casts Sky Over Water enhances. */
const ESkill = suisuiAction("Skill - Awakening Spring", {
  animFrames: 78, cooldown: 60 * 15,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, scaling: Scaling.Hp,
  bullets: [{ hitFrame: 60, mv: 28.63, energy: 5, concerto: 9.6, offtune: 9600 }], castForte1: -120, resetForte2: true,
  updateDebuffs: () => {
    applyEnemy(GLACIO_CHAFE, 1);
    applyCurrent(HEALS, 1);
    applyTeam(ENRICHMENT, 2);
  },
});

// --- Drizzle Stance: the same buttons, banking Floral Epistle (forte2) for the Outro. Illuminating
//     Dew and Swallow's Cut are the two ways out of the Heavy, so a chain only ever takes one.
const FBA1 = suisuiAction("Basic - Drizzle Stance 1", { animFrames: 31, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 20, mv: 19.57, energy: 0.31, concerto: 0.99, offtune: 984, forte2: 21 },
    { hitFrame: 24, mv: 19.57, energy: 0.31, concerto: 0.99, offtune: 984, forte2: 21 },
    { hitFrame: 31, commitFrame: 28, mv: 19.57, energy: 0.31, concerto: 0.99, offtune: 984, forte2: 21 },
    { hitFrame: 34, commitFrame: 28, mv: 19.57, energy: 0.31, concerto: 0.99, offtune: 984, forte2: 21 },
  ]});
const FBA2 = suisuiAction("Basic - Drizzle Stance 2", { animFrames: 70, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 23, mv: 31.81, energy: 0.5, concerto: 1.6, offtune: 1600, forte2: 34 },
    { hitFrame: 32, mv: 31.81, energy: 0.5, concerto: 1.6, offtune: 1600, forte2: 34 },
    { hitFrame: 36, mv: 15.91, energy: 0.25, concerto: 0.8, offtune: 800, forte2: 17 },
    { hitFrame: 40, commitFrame: 36, mv: 15.91, energy: 0.25, concerto: 0.8, offtune: 800, forte2: 17 },
    { hitFrame: 43, commitFrame: 36, mv: 15.91, energy: 0.25, concerto: 0.8, offtune: 800, forte2: 17 },
    { hitFrame: 47, commitFrame: 36, mv: 15.91, energy: 0.25, concerto: 0.8, offtune: 800, forte2: 17 },
    { hitFrame: 51, commitFrame: 36, mv: 31.81, energy: 0.5, concerto: 1.6, offtune: 1600, forte2: 34 },
  ]});
const FBA3 = suisuiAction("Basic - Drizzle Stance 3", { animFrames: 66, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 13.76, energy: 0.22, concerto: 0.7, offtune: 692, forte2: 15 },
    { hitFrame: 16, mv: 13.76, energy: 0.22, concerto: 0.7, offtune: 692, forte2: 15 },
    { hitFrame: 20, mv: 13.76, energy: 0.22, concerto: 0.7, offtune: 692, forte2: 15 },
    { hitFrame: 25, mv: 13.76, energy: 0.22, concerto: 0.7, offtune: 692, forte2: 15 },
    { hitFrame: 29, mv: 13.76, energy: 0.22, concerto: 0.7, offtune: 692, forte2: 15 },
    { hitFrame: 34, mv: 13.76, energy: 0.22, concerto: 0.7, offtune: 692, forte2: 15 },
    { hitFrame: 38, mv: 13.76, energy: 0.22, concerto: 0.7, offtune: 692, forte2: 15 },
    { hitFrame: 43, mv: 13.76, energy: 0.22, concerto: 0.7, offtune: 692, forte2: 15 },
    { hitFrame: 47, mv: 13.76, energy: 0.22, concerto: 0.7, offtune: 692, forte2: 15 },
    { hitFrame: 52, mv: 13.76, energy: 0.22, concerto: 0.7, offtune: 692, forte2: 15 },
    { hitFrame: 56, mv: 13.76, energy: 0.22, concerto: 0.7, offtune: 692, forte2: 15 },
    { hitFrame: 61, commitFrame: 56, mv: 13.76, energy: 0.22, concerto: 0.7, offtune: 692, forte2: 15 },
  ]});
const FBA4 = suisuiAction("Basic - Drizzle Stance 4", {
  animFrames: 64,
  node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 48, mv: 159.05, energy: 2.5, concerto: 8, offtune: 8000, forte2: 170 }],
  updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1),
});
const FHA = suisuiAction("Heavy - Drizzle Stance", { animFrames: 97, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 14, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600, forte2: 13 },
    { hitFrame: 17, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600, forte2: 13 },
    { hitFrame: 20, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600, forte2: 13 },
    { hitFrame: 23, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600, forte2: 13 },
    { hitFrame: 26, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600, forte2: 13 },
    { hitFrame: 29, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600, forte2: 13 },
    { hitFrame: 32, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600, forte2: 13 },
    { hitFrame: 35, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600, forte2: 13 },
    { hitFrame: 38, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600, forte2: 13 },
    { hitFrame: 41, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600, forte2: 13 },
    { hitFrame: 82, mv: 119.29, energy: 1.88, concerto: 6, offtune: 6000, forte2: 128 },
  ]});
const FHA2 = suisuiAction("Basic - Illuminating Dew", { animFrames: 64, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 30, mv: 104.98, energy: 2.75, concerto: 8.8, offtune: 8800 }]});
const FMA = suisuiAction("Basic - Swallow's Cut", { animFrames: 60, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 33, mv: 107.65, energy: 2.82, concerto: 9.03, offtune: 9024 }]});
const FSkill = suisuiAction("Skill - Vernal Screen: Drizzle Stance", { animFrames: 54, cooldown: SKILL_CD, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 26, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600, forte2: 100 },
    { hitFrame: 30, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600 },
    { hitFrame: 35, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600 },
    { hitFrame: 40, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600 },
    { hitFrame: 45, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600 },
    { hitFrame: 50, mv: 11.93, energy: 0.19, concerto: 0.6, offtune: 600 },
    { hitFrame: 57, commitFrame: 54, mv: 71.58, energy: 1.13, concerto: 3.6, offtune: 3600 },
  ]});

/** Song of Thoroughfare: no damage of its own, just the Landscape and its 20 Concerto. */
const Liberation = suisuiAction("Liberation - Song of Thoroughfare", {
  animFrames: 264, timestop: 264, motionStop: 264, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, castConcerto: 20, resetEnergy: true,
  updateBuffs: () => applyTeam(CEASELESS_LANDSCAPE, 1)
});

/** Tinkling Jade: the other cast Sky Over Water enhances, and the ordinary way into Drizzle Stance
 *  — it spends whatever Cloud Breath she is holding whether or not the bar is full. */
const Intro = suisuiAction("Intro - Tinkling Jade", {
  animFrames: 78, prioFrames: 78, motionStop: 55,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, scaling: Scaling.Hp,
  bullets: [{ hitFrame: 60, mv: 28.63, energy: 10, concerto: 9.6, offtune: 9600 }], castConcerto: 10, resetForte1: true, resetForte2: true,
  updateDebuffs: () => {
    applyEnemy(GLACIO_CHAFE, 1);
    applyCurrent(HEALS, 1);
    applyTeam(ENRICHMENT, 2);
  },
});

/** Enrichment: a stack on each teammate off Awakening Spring / Tinkling Jade, spent by their next
 *  Intro for Spring's Birth — ten heals two seconds apart, hers (Sky Over Water), so every "on heal"
 *  piece she wears sees each tick. Team-held as the pair of stacks the two teammates hold. */
const ENRICHMENT = new Buff({
  name: "Suisui: Enrichment", maxStacks: 2,
  updateGlobal: () => {
    if (!casting(Cast.Intro) || currentMember().resonator === SUISUI_RESONATOR) return;
    removeStackTeam(ENRICHMENT, 1);
    applyTeam(SPRINGS_BIRTH, SPRINGS_BIRTH.maxStacks);
  },
});
const SPRINGS_BIRTH = coordinatedBuff("Suisui: Spring's Birth", 20, () => SUISUI_RESONATOR, heal, { every: 2 });

/** Rippling Waters: the team's 25% amplification, every Floral Epistle tier, and the three-step
 *  Transcendent Dance armed for the two visits after. The bar is cleared rather than spent by a
 *  declared delta ("consumes all" has no fixed size, and the engine's gauges have no ceiling), and
 *  nothing here tests what it held: 600 consumed — the top tier — is simply taken as read. */
const Outro = suisuiAction("Outro - Rippling Waters", {
  animFrames: 0,
  cast: Cast.Outro, castConcerto: -100, resetForte2: true,
  updateBuffs: () => {
    applyTeam(RIPPLING_WATERS, 1);
    applyTeam(ROAMING_TRANSCENDENT, 1);
    // a fresh dance, not a top-up: a step the last one never got round to goes with it
    revokeTeam(TRANSCENDENT_DANCE);
    applyTeam(TRANSCENDENT_DANCE, 1);
  },
});

/* ------------------------------------------------------------------------------------- buffs */

/** The four Negative Statuses Ceaseless Landscape raises by name, each with the damage tag its own
 *  ladder rungs carry — the Landscape pays on inflicting one *or* on dealing its damage. Havoc Bane
 *  is deliberately not here; it has the DEF/RES branch below instead. */
const LANDSCAPE_CAPS: [Debuff, Subtype][] = [
  [SPECTRO_FRAZZLE, Subtype.SpectroFrazzle],
  [FUSION_BURST, Subtype.FusionBurst],
  [GLACIO_CHAFE, Subtype.GlacioChafe],
  [AERO_EROSION, Subtype.AeroErosion],
];

/** Ceaseless Landscape: 30s off every Liberation, so permanent here. Watched globally (it lives in
 *  the team pool) so every ally's own turn counts, not just hers. The real raise is 15s and
 *  unstackable; this engine's maxStackIncrease() only ever raises a cap for the rest of the fight,
 *  which is the closest that gets — the same reading Chisa's Resonant Thread of Closure uses. From
 *  hitGlobal the team pool runs behind every slot's own gear, so the very first Chafe of a fight
 *  is still calculated at the unraised cap and everything after it at +3.
 *
 *  The Havoc branch reads the engine's own consumption log (context.ts's `consume()`/`consumedByMe()`)
 *  rather than the target merely carrying a Bane, and from `afterAction` because that is the phase
 *  a kit spends its stacks in — Xuanling's Sword Stance Flow, the only cast in the roster that
 *  spends any, deliberately waits until then so the cast itself still reads the full count. Against
 *  a 30s buff a payout landing on the action after the spend never shows. */
const CEASELESS_LANDSCAPE = new Buff({
  name: "Suisui: Ceaseless Landscape",
  duration: 60 * 30,
  hitGlobal: () => {
    for (const [status, tag] of LANDSCAPE_CAPS) {
      if (applied(status) || isType(tag)) maxStackIncrease(status, 3);
    }
    if (applied(ELECTRO_FLARE) || isType(Subtype.ElectroFlare)) {
      maxStackIncrease(ELECTRO_FLARE, 3);
      maxStackIncrease(ELECTRO_RAGE, 3);
    }
  },
  afterAction: () => { if (consumedByMe(HAVOC_BANE)) applyCurrent(VOID_TIDE, 1); },
});

/** Ceaseless Landscape's Havoc branch, held by whoever spends the Bane: 6% DEF ignore and 12%
 *  Havoc RES ignore, both on their Havoc DMG alone. 30s, so it never drops once it is up. */
const VOID_TIDE = new Buff({
  name: "Suisui: Ceaseless Landscape (bane)",
  duration: 60 * 30,
  stats: [[Stat.DefIgnoreNew, 6, Attribute.Havoc], [Stat.ResIgnore, 12, Attribute.Havoc]],
});

/** Rippling Waters' own 25% All DMG Amplification — 30s, so permanent once granted. */
const RIPPLING_WATERS = new Buff({
  name: "Suisui: Outro",
  duration: 60 * 30,
  stats: [[Stat.Amp, 25]],
});

/** Reflecting Shadows: 6s to the whole team off every Plume Step, and what the 400-Epistle tier
 *  below is gated on. Nothing else reads it — its own effect is interruption resistance. */
const REFLECTING_SHADOWS = new Buff({ name: "Suisui: Reflecting Shadows", duration: 60 * 6 });

/** The 400-Epistle tier: the active resonator inside the Landscape deals 0.2% more DMG per 1% of
 *  Suisui's Energy Regen over 200%, capped at 12% — taken at the cap (CLAUDE.md), which wants 260%
 *  ER. The *active* resonator's, as the kit says, so an off-field action of anyone's is paid
 *  nothing. Runs for the 30s of one Roaming Transcendent, restarted by every Outro. */
const ROAMING_TRANSCENDENT = new Buff({
  name: "Suisui: Roaming Transcendent",
  duration: 60 * 30,
  applyStats: () => {
    if (isActive()) addStat(Stat.DmgBonus, 12);
  },
});

/** One Plume Step: no damage of its own, just the Chafe it lays and the heal it gives. A row on
 *  her own slot (`queueOn`), not a grant made on whoever is on field — the step is hers, so her own
 *  weapon and sonata are what read the inflict and the heal. */
const PlumeStep = suisuiAction("Outro - Plume Step", {
  animFrames: 0,
  updateDebuffs: () => {
    applyEnemy(GLACIO_CHAFE, 1);
    applyCurrent(HEALS, 1);
  },
});

/** The Transcendent Dance: her three Plume Steps, spaced across the thirty seconds of one Roaming
 *  Transcendent rather than bunched at the end of a visit — a clock of the dance's own, a step for
 *  every 6s of it, motion stop not counted. She stops the dance whenever she is the one on field,
 *  which is the kit's own rule: its clock stands still for her presses.
 *
 *  The first step arms the Undulating Mist handoff rather than handing it over itself: from then on
 *  it is each teammate's own Outro that gives the Mist to whoever intros behind them, for the rest
 *  of the Roaming Transcendent. */
const TRANSCENDENT_DANCE = new Buff({
  name: "Suisui: Transcendent Dance", duration: 60 * 30,
  tick: {
    every: () => (currentTeam().slot.resonator === SUISUI_RESONATOR ? 0 : 60 * 6),
    fire: (n) => { if (n <= 3) queueOn(SUISUI_RESONATOR, PlumeStep); },
    skipMotionStop: true,
  },
  updateBuffs: () => {
    if (currentTeam().slot.resonator === SUISUI_RESONATOR) return;
    // the dance has ticked at all, so its first step is behind it
    if (ticksOfTeam(TRANSCENDENT_DANCE) > 0 && casting(Cast.Outro)) queueOutro(UNDULATING_MIST);
  },
});

/** Undulating Mist: 14s or until its holder is switched off field, and worth +0.1% ATK per 0.12% of
 *  Suisui's Energy Regen over 200% every time they consume a Negative Status or Electro Rage stack,
 *  capped at 50% — taken at the cap, same 260% ER threshold as the tier above.
 *
 *  Two buffs, one a stage: the Mist itself, as handed to whoever intro'd (see the Transcendent
 *  Dance's own `queueOutro`), and the Mist consumed — that holder having since spent a stack off
 *  the target, which is what actually buys the ATK. The kit ends the two together: switching the
 *  holder off field drops the Mist and the ATK with it.
 *
 *  Its trigger names no particular status — any Negative Status or Electro Rage stack — so it reads
 *  `consumedAny()`. Held locally, so it only ever runs on its own holder's turn and the only member
 *  who could have spent anything is them.
 *
 *  Watched twice, because a kit declares its spend in whichever phase suits it. `hitGlobal`, on the
 *  holder's own hit, sees a spend in `updateDebuffs` or another `hitGlobal` (Hiyuki's Frostbind,
 *  Hsin's Rage), so it is paid for itself; one in `afterAction` pays from the next action. */
function mistEarned(): boolean {
  // S1 widens the trigger to inflicting any Negative Status, or dealing its damage
  const me = currentTeam().slot;
  // ...and never with Electro Rover in the team: sitting in the sub-DPS slot they take the handoff
  // and hold the Mist out, so nothing anyone spends behind them earns the ATK and the 600 tier
  // pays that team nothing
  return consumedAny() > 0
    || (stacksOfTeam(MOUNTAINS_WASHED) > 0 && (inflictedNegativeStatusBy(me) || NEGATIVE_STATUS_TAGS.some(isType)));
}
const UNDULATING_MIST: Buff = new Buff({
  name: "Suisui: Undulating Mist", duration: 60 * 14,
  // a Mist handed to a holder already paid off is that Mist refreshed
  updateBuffs: () => { if (isHeld(MIST_CONSUMED)) consumeMist(); },
  hitGlobal: () => { if (currentTeam().slot === currentMember() && mistEarned()) consumeMist(); },
  afterAction: () => { if (mistEarned()) consumeMist(); },
  lostOnSwap: true,
});
const MIST_CONSUMED: Buff = new Buff({
  name: "Suisui: Undulating Mist (consumed)", duration: 60 * 14,
  stats: [[Stat.BonusAtk, 50]],
  hitGlobal: () => { if (currentTeam().slot === currentMember() && mistEarned()) applyCurrent(MIST_CONSUMED, 1); },
  afterAction: () => { if (mistEarned()) applyCurrent(MIST_CONSUMED, 1); },
  lostOnSwap: true,
});
function consumeMist(): void {
  revokeCurrent(UNDULATING_MIST);
  applyCurrent(MIST_CONSUMED, 1);
}

/* --------------------------------------------------------------------------------- sequences */

/** The five Negative Statuses with a damage tag of their own — the Landscape's four and Electro
 *  Flare. Havoc Bane has none, and is S2's consume branch instead. */
const TAGGED_STATUSES: [Debuff, Subtype][] = [...LANDSCAPE_CAPS, [ELECTRO_FLARE, Subtype.ElectroFlare]];
const NEGATIVE_STATUS_TAGS: Subtype[] = TAGGED_STATUSES.map(([, tag]) => tag);

/** S1 on the team: Undulating Mist's ATK also comes off inflicting a Negative Status or dealing its
 *  damage (read by the Mist itself, above). Reflecting Shadows' longer third step and the
 *  Drizzle chain's interruption immunity reach no formula. */
const MOUNTAINS_WASHED = new Buff({ name: "Suisui S1: Mountains Washed Into Paintings" });
const SS_S1 = new Sequence({
  name: "Suisui S1: Mountains Washed Into Paintings",
  combatStart: () => applyTeam(MOUNTAINS_WASHED, 1),
});

/** S2's payout: +50% Crit. DMG, 30s — permanent once a member has it, but each member earns their
 *  own by inflicting/dealing/spending a status themselves (the team-wide "all nearby Resonators"
 *  is who is *eligible*, not who is paid). The "active resonator not in the Landscape" clause never
 *  binds against a boss standing in it. */
const CLOUDS_POUR = new Buff({
  name: "Suisui S2: Clouds Pour Like Molten Gold",
  duration: 60 * 30,
  stats: [[Stat.CritDmg, 50]],
});
/** S2's watcher, in the team pool so every member's own turn is seen: inside Ceaseless Landscape,
 *  the acting member inflicting one of the five tagged statuses or dealing its damage (the
 *  Landscape's own test), or spending Havoc Bane (its consume branch, from afterAction for the same
 *  reason), hands that member the payout. No `name`, so the watcher itself stays out of the
 *  held-buffs list — what it hands over is Clouds Pour, which has its own row. */
const CLOUDS_POUR_WATCH = new Buff({
  hitGlobal: () => {
    if (!stacksOfTeam(CEASELESS_LANDSCAPE)) return;
    const actor = currentTeam().slot;
    // inflicting Havoc Bane is deliberately not here — only spending it pays, below
    if (actor.resonator && TAGGED_STATUSES.some(([status, tag]) => appliedByMember(status, actor) || isType(tag))) addBuff(actor.resonator, CLOUDS_POUR, 1);
  },
  afterAction: () => { if (stacksOfTeam(CEASELESS_LANDSCAPE) && consumedByMe(HAVOC_BANE)) applyCurrent(CLOUDS_POUR, 1); },
});
const SS_S2 = new Sequence({
  name: "Suisui S2: Clouds Pour Like Molten Gold",
  combatStart: () => applyTeam(CLOUDS_POUR_WATCH, 1),
});

/** Kingfisher: granted by the Drizzle skill, spent by the Stage 4 it lets her skip straight to for
 *  +20 Concerto and +350 Floral Epistle — once every 25s, which one grant a visit already is. Ends
 *  on switching out. */
const KINGFISHER = new Buff({
  name: "Suisui S3: Kingfisher",
  lostOnSwap: true,
  applyStats: () => {
    if (!runningAction(FBA4)) return;
    addStat(Stat.AddConcerto, 20);
    addStat(Stat.AddForte2, 350);
  },
  afterAction: () => { if (runningAction(FBA4)) revokeCurrent(KINGFISHER); },
});
const SS_S3 = new Sequence({
  name: "Suisui S3: Sparse Curtains Invite Evening Glow",
  grants: [{ on: onAction(FSkill), buff: KINGFISHER }],
});

/** S4 is +50% on two heals — nothing this calculator reads. */
const SS_S4 = new Sequence({ name: "Suisui S4: Autumn Mountains in Choir Sing" });

const SS_S5 = new Sequence({
  name: "Suisui S5: I Long To Ride The Eastern Wind",
  applyStats: () => {
    if (runningAction(FBA1) || runningAction(FBA2) || runningAction(FBA3) || runningAction(FBA4) || runningAction(FHA)) addStat(Stat.MulMv, 100);
  },
});

const SS_S6 = new Sequence({
  name: "Suisui S6: Staying True To This Splendid Realm",
  applyStats: () => { if (runningAction(Intro) || runningAction(ESkill)) addStat(Stat.CritDmg, 500); },
});

const SS_SEQUENCES = [SS_S1, SS_S2, SS_S3, SS_S4, SS_S5, SS_S6];

/* --------------------------------------------------------------------------- kit and loadout */

/** Sky Over Water (Inherent Skill): the enhancement above, hers from the first action of a fight.
 *  Spring's Birth, its other half, is a heal-over-time and pays no stat. */
const SS_INHERENT_1 = new Inherent({
  name: "Inherent: Sky Over Water",
  updateBuffs: () => { if (runningAction(ESkill) || runningAction(Intro)) addToCast({ concerto: 18, energy: 13 }); },
  applyStats: () => {
    if (!runningAction(ESkill) && !runningAction(Intro)) return;
    addStat(Stat.CritRate, 80);
    addStat(Stat.DmgBonus, 240, Attribute.Glacio);
    addStat(Stat.AddOfftune, 72000);
  }
});

/** Glimmering Gold (Inherent Skill): a once-per-10-minutes revive, nothing this calculator reads. */
const SS_INHERENT_2 = new Inherent({ name: "Inherent: Glimmering Gold" });

const SUISUI_TALENTS = new Talent({
  name: "Suisui: Talents",
  stats: [
    [Stat.BonusHp, 12],
    [Stat.HealingBonus, 12], // stat-tree Healing Bonus+ nodes — unused by the formula
  ],
});

const SUISUI_RESONATOR = new Resonator({
  name: "Suisui",
  talent: SUISUI_TALENTS,
  inherent1: SS_INHERENT_1,
  inherent2: SS_INHERENT_2,
  element: Attribute.Glacio,
  weapon: WeaponType.Rectifier,
  color: "#e8e6a6",
  intro: Intro,
  maxEnergy: 175,
  maxForte1: 120,
  maxForte2: 600,

  stats: [[Stat.BaseHp, 16712.5], [Stat.BaseAtk, 287.5], [Stat.BaseDef, 1099.998]],
});

/* ---------------------------------------------------------------------------------- rotation */

const FBA1234 = new ActionGroup("Basic - Drizzle Stance 1234", [FBA1, FBA2, FBA3, FBA4]);
const BA123 = new ActionGroup("Basic - Zephyr Stance 123", [BA1, BA2, BA3]);

/** She leads, so the opener is the Zephyr half: three basics and the skill fill Cloud Breath well
 *  past 120 for Awakening Spring, which is what puts her into Drizzle Stance with no Intro to hand
 *  her there. Every visit after, the Intro does that job and the prefix is skipped.
 *
 *  From there it is one Drizzle chain: the four stages, the Heavy into Swallow's Cut, and the
 *  Drizzle skill — 962 Floral Epistle against the 600 the top Outro tier wants, and comfortably
 *  inside the stance's own 15s at the table's frame counts. The Liberation sits in an inline
 *  start-of-combat section: she spends the bar she walks into the fight holding in the opening
 *  scramble, so the Landscape is up from the first action, and re-casts it every visit after.
 *
 *  Concerto: 135.7 by the opener's Outro (Awakening Spring takes Sky Over Water's +18 there, and
 *  the scramble's Liberation is already banked) and 122.2 every loop after — both well clear of the
 *  100 the Outro spends. */
const SS_ROTATION = new Rotation([
  NOINTRO, BA123.cancel(), ESkill,
  INTRO,
  FSkill, FBA1234.cancel(),
  ECHO.instaDodge(), Liberation, Outro,
]);

/** From S3 the Drizzle skill chains straight into a Stage 4 that spends Kingfisher — +20 Concerto
 *  and +350 Floral Epistle — before the ordinary four-stage chain. */
const SS_ROTATION_S3 = new Rotation([
  NOINTRO, BA123.cancel(), ESkill,
  INTRO,
  FSkill, FBA4.cancel(),
  ECHO.instaDodge(), Liberation, Outro,
]);

export const SUISUI = new Loadout({
  resonator: SUISUI_RESONATOR,
  weapons: [FIRSTLIGHTS_HERALD, VARIATION],
  echoLoadouts: [
    new EchoLoadout(FORBIDDEN_BASTION, FEATHERED_TRACE_5PC),
  ],
  mainstats: [mainstats(Mainstat.HP4, Mainstat.ER3, Mainstat.ER3, Mainstat.HP1, Mainstat.HP1)],
  substat: substats(Substat.Er, Substat.CritDmg, Substat.CritRate, Substat.Skill, Substat.HpPct, Substat.FlatHp),
  highSubstat: highSubs(Substat.CritDmg, Substat.CritRate, Substat.Er, Substat.Skill, Substat.HpPct, Substat.FlatHp),
  rotation: { 0: SS_ROTATION, //3: SS_ROTATION_S3 disabled for er and rot extend

  },
  sequences: SS_SEQUENCES,
});
