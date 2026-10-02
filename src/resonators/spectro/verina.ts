/**
 * Verina, ported to the new engine. `Tier.Standard` — a standard 5-star, costed at S2,
 * with S3-S6 opening rows of their own once that role's Sequences box is. Every node is its own
 * gear piece: S2 Sprouting Reflections, S4 Blossoming Embrace (permanent +15% Spectro DMG once
 * granted), S6 Joyous Harvest (+20% Starflower Blooms DMG plus a Coordinated Attack). S1/S3/S5 are healing-only, no damage-relevant effect — do-nothing pieces.
 *
 * Photosynthesis Energy (forte1, max 4) builds off Basic 5/Skill/Intro; a held Heavy or Mid-air
 * Attack at 1+ becomes a Starflower Blooms variant, spending a stack. Liberation places
 * Photosynthesis Mark on the enemy at 12 stacks — the 12s duration *as* the stacks: every active,
 * non-triggered action anyone takes at the marked target draws one real Coordinated Attack tick
 * and spends one stack, same treatment as Zhezhi's Inklit Spirit/Cantarella's Diffusion.
 *
 * Gift of Nature (Inherent Skill): +20% ATK, team-wide, on either Starflower Blooms variant,
 * Liberation, or Outro. Real duration 20s, but explicitly lost on her own *next* Intro instead of
 * outro — it keeps paying the team the whole time she's off field.
 *
 * Numbers from nanoka.cc (character 1503) — she has no migrated-sheet row, so this is nanoka's own
 * Skill Attributes table throughout; anything not exposed there stays 0, flagged rather than guessed.
 */
import { Tier, Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, coordinatedBuff } from "../../engine/gear.js";
import {
  applyTeam,
  revokeTeam,
  applyEnemy,
  isHeld,
  casting,
  runningAction,
  addStat,
  queue,
  applyCurrent,
  addToCast,
} from "../../engine/context.js";
import { Action, Rotation, NOINTRO, ECHO, ActionField, ActionGroup, INTRO } from "../../engine/rotation.js";
import { HEALS } from "../../shared/status.js";
import { VARIATION } from "../../weapons/standard.js";
import { REJUV_5PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { mainstats, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { SPACETREK_EXPLORER, STARRY_RADIANCE_5PC } from "../../echoes/lahairoi.js";

/* ----------------------------------------------------------------------------------- actions */

function verinaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune come off nanoka's own Damage Data table; BA3/MA3 are each multiple
// repeated hits folded into one action, same as their own mv already was.
const BA1 = verinaAction("Basic - Cultivation 1", { animFrames: 29, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 14, mv: 3786, energy: 95, concerto: 304, offtune: 7600 }]});
const BA2 = verinaAction("Basic - Cultivation 2", { animFrames: 35, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 20, mv: 5116, energy: 128, concerto: 411, offtune: 10200 }]});
const BA3 = verinaAction("Basic - Cultivation 3", { animFrames: 43, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 20, mv: 2558, energy: 64, concerto: 205, offtune: 5100 },
    { hitFrame: 24, commitFrame: 20, mv: 2558, energy: 64, concerto: 205, offtune: 5100 },
  ]});
const BA4 = verinaAction("Basic - Cultivation 4", { animFrames: 43, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 10, mv: 6732, energy: 169, concerto: 541, offtune: 13600 }]});
const BA5 = verinaAction("Basic - Cultivation 5", { animFrames: 58, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 10, mv: 7162, energy: 180, concerto: 576, offtune: 14400, forte1: 1 }]});
const HA = verinaAction("Heavy - Cultivation", { animFrames: 48, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 9, mv: 9941, energy: 250, concerto: 800, offtune: 20000 }]});
const MA1 = verinaAction("Mid-air - Cultivation 1", { animFrames: 21, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 15, mv: 5637, energy: 141, concerto: 453, offtune: 11340 }]});
const MA2 = verinaAction("Mid-air - Cultivation 2", { animFrames: 18, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 12, mv: 5319, energy: 133, concerto: 428, offtune: 10700 }]});
const MA3 = verinaAction("Mid-air - Cultivation 3", { animFrames: 33, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 24, mv: 2542, energy: 63, concerto: 204, offtune: 5114 },
    { hitFrame: 28, commitFrame: 24, mv: 2542, energy: 63, concerto: 204, offtune: 5114 },
    { hitFrame: 32, commitFrame: 24, mv: 2542, energy: 63, concerto: 204, offtune: 5114 },
  ]});
const MHA = verinaAction("Heavy - Cultivation (Mid-air)", { animFrames: 36, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 28, mv: 6164, energy: 51, concerto: 100, offtune: 12400 }]});
const DC = verinaAction("Dodge Counter - Cultivation", { animFrames: 20, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 14, mv: 12923, energy: 325, concerto: 560, offtune: 14000 }], castConcerto: 1000});

// base gain only — S2's own extra Photosynthesis Energy/Energy is traced separately (VERINA_S2)
const Skill = verinaAction("Skill - Botany Experiment", { animFrames: 65, cooldown: 60 * 12, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 24, mv: 3579, energy: 300, offtune: 5320 },
    { hitFrame: 27, commitFrame: 24, mv: 3579, energy: 300, offtune: 5320 },
    { hitFrame: 30, commitFrame: 24, mv: 3579, energy: 300, offtune: 5320 },
    { hitFrame: 45, commitFrame: 24, mv: 7158, energy: 600, offtune: 10640 },
  ], castConcerto: 3000, castForte1: 1});

/** Starflower Blooms spends a Photosynthesis Energy stack "to recover Concerto Energy" — the
 *  Forte Circuit's own `"Photosynthesis Energy" Concerto Regen = 12` row, which has no damage row
 *  of its own to hang off so nanoka's per-hit figures never carry it. Once per Starflower cast,
 *  not once per mid-air stage: the gauge is spent once for the whole combo (see the actions'
 *  own note), so only the Heavy and the mid-air's own stage 1 pay out. */
const STARFLOWER_CONCERTO = { updateDebuffs: () => {
  addStat(Stat.AddConcerto, 1200);
  applyCurrent(HEALS, 1);
}};

// Starflower Blooms spends 1 Photosynthesis Energy either way, heals
const StarflowerHeavy = verinaAction("Forte Heavy - Starflower Blooms", { minForte1: 1, animFrames: 48, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 9, mv: 6495, energy: 116, concerto: 186, offtune: 5840,
      ...STARFLOWER_CONCERTO },
    { hitFrame: 20, mv: 9742, energy: 175, concerto: 280, offtune: 8760 },
  ], castForte1: -1});
// Mid-air Starflower Blooms is its own 3-stage combo (same shape as the MA1-3 chain it replaces);
// only stage 1 banks the forte spend/heal, since the Forte Gauge is spent once for the whole combo.
const ForteMidair1 = verinaAction("Forte Mid-air - Starflower Blooms 1",
    { minForte1: 1, animFrames: 21, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 15, mv: 6764, energy: 141, concerto: 453, offtune: 11340 }], castForte1: -1, ...STARFLOWER_CONCERTO });
const ForteMidair2 = verinaAction("Forte Mid-air - Starflower Blooms 2",
    { animFrames: 18, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 12, mv: 6382, energy: 133, concerto: 428, offtune: 10700 }], castForte1: -1, ...STARFLOWER_CONCERTO });
const ForteMidair3 = verinaAction("Forte Mid-air - Starflower Blooms 3",
    { animFrames: 33, node: Node.Forte, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 24, mv: 3050, energy: 63, concerto: 204, offtune: 5114,
      ...STARFLOWER_CONCERTO },
    { hitFrame: 28, commitFrame: 24, mv: 3050, energy: 63, concerto: 204, offtune: 5114 },
    { hitFrame: 32, commitFrame: 24, mv: 3050, energy: 63, concerto: 204, offtune: 5114 },
  ], castForte1: -1});

// Arboreal Flourish places Photosynthesis Mark on the enemy (see file header), heals
const Liberation = verinaAction("Liberation - Arboreal Flourish", {
  animFrames: 150, timestop: 106, motionStop: 59, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 58, mv: 19881 }], castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => applyEnemy(PHOTOSYNTHESIS_MARK, 12),
});
/** One Coordinated Attack tick — the mark's own per-action proc, and S6's single-hit reuse. It
 *  banks nothing: nanoka's damage row (1503031013) and wuwalab's per-hit entry both give 0
 *  energy/concerto/off-tune — the 1.46/4.04/20000 the old x12 lump declared match neither source
 *  and are dropped, not divided up. Each tick heals: VERINA_RESONATOR's own HEALS list names it. */
const PHOTOSYNTHESIS_FIELD = new ActionField("Verina: Photosynthesis Mark");
const PhotosynthesisTick = verinaAction("Liberation - Photosynthesis Mark", {
  node: Node.Liberation, type: Type.Basic, subtype: Subtype.Coordinated, bullets: [{ hitFrame: 22, mv: 995 }], field: PHOTOSYNTHESIS_FIELD,
});
/** S6's one-off reuse of the same hit — her own follow-up off her own combo, not the mark's, so
 *  this copy names no field and stays out of the report's field row. */
const S6Tick = PhotosynthesisTick.variant("Liberation - Photosynthesis Mark", { field: null });

const Intro = verinaAction("Intro - Verdant Growth", { animFrames: 98, prioFrames: 52, motionStop: 51, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 62, mv: 9941, energy: 1000, offtune: 11230 }], castConcerto: 1000, castForte1: 1});
/** Blossom: no damage of its own, just the outro handoff, the Gift of Nature/S4 trigger and
 *  (skipped) healing. */
const Outro = verinaAction("Outro - Blossom", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => applyTeam(VERINA_OUTRO, 1),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Gift of Nature (Inherent Skill) — see the file header for why this ends on her own next Intro
 *  rather than outro. Still pays out on that Intro itself: afterAction() revokes once its hits are in. */
const GIFT_OF_NATURE = new Buff({
  name: "Inherent: Gift of Nature",
  duration: 60 * 20,
  stats: [[Stat.BonusAtk, 20]],
  // granted from VERINA_RESONATOR's own updateBuffs() below since a global buff's own updateBuffs() can't fire before
  // it's held once, and the Resonator itself is always self-held from team setup
  afterAction: () => { if (casting(Cast.Intro) && isHeld(VERINA_RESONATOR)) revokeTeam(GIFT_OF_NATURE); },
});
/** Gift of Nature's own trigger — always-equipped Inherent Skill piece. */
const VR_INHERENT_1 = new Inherent({
  name: "Inherent: Gift of Nature",
  updateBuffs: () => {
    if (runningAction(StarflowerHeavy) || runningAction(ForteMidair1) || runningAction(Liberation) || runningAction(Outro)) applyTeam(GIFT_OF_NATURE, 1);
  },
});

const VR_INHERENT_2 = new Inherent({ name: "Inherent: Grace of Life" }); // revive teammate


/** Blossom's own team-wide DMG Amp — 30s is past the 21s permanent-uptime threshold, so it's
 *  granted once and never revoked. The 19% ATK/s heal to the incoming Resonator is out of scope
 *  for the formula (her Outro already puts up the HEALS marker). */
const VERINA_OUTRO = new Buff({
  name: "Verina: Blossom",
  duration: 60 * 30,
  stats: [[Stat.Amp, 15]],
});

/** Photosynthesis Mark: a genuine debuff on the enemy, 12 stacks that are the mark's own 12s —
 *  one Coordinated tick drawn per qualifying action at the marked target. */
const PHOTOSYNTHESIS_MARK = coordinatedBuff("Verina: Photosynthesis Mark", 12, () => VERINA_RESONATOR, PhotosynthesisTick);

/** S2 Sprouting Reflections: Botany Experiment's own +1 Photosynthesis Energy/+10 Energy on top
 *  of its base gain. */
const VERINA_S2 = new Sequence({
  name: "Verina S2: Sprouting Reflections",
  updateBuffs: () => {
    if (runningAction(Skill)) addToCast({ forte1: 1, concerto: 1000 });
  },
});

/** S4 Blossoming Embrace: the trigger lives here; the payout is `S4_TEAM` (permanent uptime once
 *  granted, per the standing duration rule). */
const VERINA_S4 = new Sequence({
  name: "Verina S4: Blossoming Embrace",
  updateBuffs: () => {
    // ForteMidair1 stands in for "cast Starflower Blooms (Mid-Air)" — only needs to trigger once
    if (runningAction(StarflowerHeavy) || runningAction(ForteMidair1) || runningAction(Liberation) || runningAction(Outro)) applyTeam(S4_TEAM, 1);
  },
});
const S4_TEAM = new Buff({
  name: "Verina S4: Blossoming Embrace", duration: 60 * 24, stats: [[Stat.DmgBonus, 15, Attribute.Spectro]],
});

/** S6 Joyous Harvest: Starflower Blooms deals +20% more DMG and also triggers one Coordinated
 *  Attack — the same single-hit value Photosynthesis Mark's own periodic proc has. */
const VERINA_S6 = new Sequence({
  name: "Verina S6: Joyous Harvest",
  // the DMG boost lands on every hit of every Starflower press; the Coordinated Attack once a press
  updateBuffs: () => {
    if (runningAction(StarflowerHeavy) || runningAction(ForteMidair1) || runningAction(ForteMidair2) || runningAction(ForteMidair3)) queue(S6Tick);
  },
  applyStats: () => {
    if (runningAction(StarflowerHeavy) || runningAction(ForteMidair1) || runningAction(ForteMidair2) || runningAction(ForteMidair3)) addStat(Stat.DmgBonus, 20);
  },
});

// S1 Moment of Emergence, S3 The Choice to Flourish, S5 Miraculous Blooms — healing-only,
// do-nothing gear pieces held for the name only (see file header)
const VERINA_S1 = new Sequence({ name: "Verina S1: Moment of Emergence" });
const VERINA_S3 = new Sequence({ name: "Verina S3: The Choice to Flourish" });
const VERINA_S5 = new Sequence({ name: "Verina S5: Miraculous Blooms" });

// stat-tree bonus alone — Healing Bonus+ unused by the formula (healing out of scope), kept for
// completeness only
const VERINA_TALENTS = new Talent({
  name: "Verina: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.HealingBonus, 12]],
});

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. `Tier.Standard` — see the file header. */
const VERINA_RESONATOR = new Resonator({
  name: "Verina",
  stats: [[Stat.BaseHp, 14237.5], [Stat.BaseAtk, 337.5], [Stat.BaseDef, 1099.998]],
  talent: VERINA_TALENTS,
  inherent1: VR_INHERENT_1,
  inherent2: VR_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Rectifier,
  color: "#cfee7a",
  intro: Intro,
  maxEnergy: 17500, // her own real 175%, not the generic 125% default — matches Shorekeeper's own
  maxForte1: 4,

  tier: Tier.Standard,

  updateDebuffs: () => {
    // her own healing marker, read by every healing sonata and weapon (statuses.ts) — applied to the
    // healer alone; the Starflower Heavy's and Mid-air 3's heal is their first hit's (STARFLOWER_CONCERTO)
    if (runningAction(ForteMidair1) || runningAction(ForteMidair2) || runningAction(Liberation) || runningAction(PhotosynthesisTick) || runningAction(S6Tick) || runningAction(Outro)) applyCurrent(HEALS, 1);
  },

});

const BA345 = new ActionGroup("Basic - Cultivation 345", [BA3, BA4, BA5]);

const VR_LOOP = new Rotation([
  NOINTRO, BA345.cancel(), Liberation, 
  Skill.jumpCancel(), ForteMidair1, ForteMidair2,
  ECHO.instaSwap(), Outro,

  INTRO, Liberation,
  Skill.jumpCancel(), ForteMidair1, ForteMidair2,
  ECHO.instaSwap(), Outro,
]);

const VR_S2 = new Rotation([
  NOINTRO, Liberation, 
  Skill.jumpCancel(), ForteMidair1, ForteMidair2,
  ECHO.instaSwap(), Outro,

  INTRO, Liberation,
  Skill.jumpCancel(), ForteMidair1, ForteMidair2,
  ECHO.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real support/healer spread rather than the usual 43311 crit build; both Inherent Skills +
// every sequence node (Tier.Standard — see file header) alongside resonator + talents
export const VERINA = new Loadout({
  resonator: VERINA_RESONATOR,
  weapons: [VARIATION],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(SPACETREK_EXPLORER, STARRY_RADIANCE_5PC),
    //new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC),
    //new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    ],
  mainstats: [mainstats(Mainstat.ATK4, Mainstat.ER3, Mainstat.ER3, Mainstat.ATK1, Mainstat.ATK1)],
  substat: substats(Substat.Er, Substat.CritRate, Substat.CritDmg, Substat.Liberation, Substat.AtkPct, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.Liberation, Substat.AtkPct, Substat.Basic),
    // S2 loop disabled for now: dropping BA345 from the window costs every teammate ~3.1 ER and
    // loses her own damage too. Re-point at VR_S2 once that rotation is settled.
    rotation: VR_LOOP,
  sequences: [VERINA_S1, VERINA_S2, VERINA_S3, VERINA_S4, VERINA_S5, VERINA_S6],
});
