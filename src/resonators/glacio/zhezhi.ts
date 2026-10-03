/**
 * Zhezhi, ported to the new engine — sequence-0 core loop only. A glacio Coordinated-Attack
 * support/sub-DPS, similar shape to Cantarella: her Liberation (Living Canvas) opens a passive
 * 30s window where Inklit Spirits perform Coordinated Attacks off the *active* resonator's own
 * hits — real ones now: the Liberation banks a team-wide 21-stack countdown (`INKLIT_SPIRITS`),
 * and every active, non-triggered action anyone takes summons one spirit and spends one stack,
 * same treatment as Cantarella's Diffusion.
 *
 * Afflatus (forte1, up to 90) gates her forte chain: at 60+, Resonance Skill (Manifestation)
 * summons Phantasmic Imprint - Left/Right (spending 60); at 30+, the Heavy Attack - Conjuration
 * follow-up summons Phantasmic Imprint - Middle (spending 30). With an Imprint nearby, Resonance
 * Skill is replaced by Stroke of Genius (removes one, grants a Painter's Delight stack, up to 2);
 * at 2 frozenStacks, it's replaced again by Creation's Zenith (removes one, spends every stack, and
 * grants Ivory Herald — +18% Basic Attack DMG Bonus, 27s, permanent uptime once granted). Live
 * Imprint tracking isn't simulated — the rotation below just places Skill, then the Heavy Attack
 * follow-up, then Stroke of Genius twice, then Creation's Zenith by hand, in kit-valid order.
 * Painter's Delight itself carries no stat — pure gating, not modelled as a buff at all.
 *
 * Numbers from nanoka.cc (character 1105) — base stats confirmed there directly; every action's
 * own MV/energy/concerto/offtune/forte1 delta ported from the migrated (old-engine) sheet.
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence, coordinatedBuff, matrix } from "../../engine/gear.js";
import {
  applyCurrent,
  onAction,
  runningAction,
  casting,
  revokeCurrent,
  queueOutro,
  applyTeam,
  isHeld,
  queue,
  currentTeam,
  queueOn,
  addToCast,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ActionField, NOINTRO, ECHO, INTRO } from "../../engine/rotation.js";
import { RIME_DRAPED_SPROUTS, STRINGMASTER, LETHEAN_ELEGY, WHISPERS_OF_SIRENS } from "../../weapons/rectifier.js";
import { VARIATION, NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { EMPYREAN_ANTHEM_5PC, NM_LAMPY } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function zhezhiAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter (Dimming Brush)
const BA1 = zhezhiAction("Basic - Dimming Brush 1", { animFrames: 36, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, commitFrame: 12, mv: 4176, energy: 75, concerto: 240, offtune: 2400, forte1: 500 },
    { hitFrame: 34, commitFrame: 28, mv: 4176, energy: 75, concerto: 240, offtune: 2400, forte1: 500 },
  ]});
const BA2 = zhezhiAction("Basic - Dimming Brush 2", { animFrames: 44, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 30, commitFrame: 24, mv: 2055, energy: 37, concerto: 119, offtune: 1181, forte1: 300 },
    { hitFrame: 34, commitFrame: 24, mv: 2055, energy: 37, concerto: 119, offtune: 1181, forte1: 300 },
    { hitFrame: 38, commitFrame: 24, mv: 2055, energy: 37, concerto: 119, offtune: 1181, forte1: 300 },
    { hitFrame: 42, commitFrame: 24, mv: 2055, energy: 37, concerto: 119, offtune: 1181, forte1: 300 },
    { hitFrame: 46, commitFrame: 24, mv: 2055, energy: 37, concerto: 119, offtune: 1181, forte1: 300 },
  ]});
const BA3 = zhezhiAction("Basic - Dimming Brush 3", { animFrames: 60, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 44, commitFrame: 40, mv: 13361, energy: 240, concerto: 768, offtune: 7680, forte1: 2500 }]});

const MA = zhezhiAction("Mid-air - Dimming Brush 12", { animFrames: 66, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 39, commitFrame: 36, mv: 22953, energy: 340, concerto: 1091, offtune: 10865, forte1: 2500 }]});
const DC = zhezhiAction("Dodge Counter - Dimming Brush", { animFrames: 34, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 18, commitFrame: 13, mv: 2907, energy: 43, offtune: 1376, forte1: 300 },
    { hitFrame: 23, commitFrame: 13, mv: 2907, energy: 43, offtune: 1376, forte1: 300 },
    { hitFrame: 26, commitFrame: 13, mv: 2907, energy: 43, offtune: 1376, forte1: 300 },
    { hitFrame: 30, commitFrame: 13, mv: 2907, energy: 43, offtune: 1376, forte1: 300 },
    { hitFrame: 35, commitFrame: 13, mv: 2907, energy: 43, offtune: 1376, forte1: 300 },
  ], castConcerto: 2000});
const HA = zhezhiAction("Heavy - Dimming Brush", { animFrames: 40, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 34, commitFrame: 32, mv: 11272, energy: 167, concerto: 534, offtune: 5336, forte1: 1500 }]});

// spends 60 Afflatus for a pair of Imprints
const Skill = zhezhiAction("Skill - Manifestation", {
  animFrames: 40, cooldown: 60 * 6,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 26, commitFrame: 24, mv: 9842, energy: 264, offtune: 1769 },
    { hitFrame: 32, commitFrame: 24, mv: 9842, energy: 264, offtune: 1769 },
    { hitFrame: 38, commitFrame: 24, mv: 9842, energy: 264, offtune: 1769 },
  ], castConcerto: 800, castForte1: -6000,
});

// spends the remaining 30 Afflatus for a third Imprint, then Stroke of Genius x2, then
// Creation's Zenith (spends both Painter's Delight frozenStacks, never tracked directly)
const FHA = zhezhiAction("Forte Heavy - Conjuration", {
  animFrames: 75,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 28, mv: 8301, energy: 70, concerto: 223, offtune: 2227 },
    { hitFrame: 34, commitFrame: 28, mv: 8301, energy: 70, concerto: 223, offtune: 2227 },
    { hitFrame: 40, commitFrame: 28, mv: 8301, energy: 70, concerto: 223, offtune: 2227 },
  ], castForte1: -3000,
});
const FSkill = zhezhiAction("Skill - Stroke of Genius", {
  animFrames: 52, prioFrames: 20, motionStop: [0, 12],
  node: Node.Forte, cast: Cast.Skill, type: Type.Basic, bullets: [{ hitFrame: 46, commitFrame: 18, mv: 29822, energy: 700, offtune: 7464, updateDebuffs: () => { if (isHeld(ZZ_S6)) queue(ACTION_HERALD_S6); } }], castConcerto: 1300, castForte2: 1,
});
const FSkill3 = zhezhiAction("Forte Skill - Creation's Zenith", { minForte2: 2,
  animFrames: 72, prioFrames: 32, motionStop: [0, 52],
  node: Node.Forte, cast: Cast.Skill, type: Type.Basic, bullets: [
    { hitFrame: 56, commitFrame: 28, mv: 11929, energy: 234, offtune: 3467, updateDebuffs: () => { if (isHeld(ZZ_S6)) queue(ACTION_HERALD_S6); } },
    { hitFrame: 68, commitFrame: 28, mv: 11929, energy: 234, offtune: 3467 },
    { hitFrame: 79, commitFrame: 28, mv: 11929, energy: 234, offtune: 3467 },
  ], castConcerto: 1300, castForte2: -2,
  updateBuffs: () => applyCurrent(IVORY_HERALD, 1),
});

// opens the Inklit Spirit window, no damage of its own — the window itself is INKLIT_SPIRITS below
const Liberation = zhezhiAction("Liberation - Living Canvas", {
  animFrames: 166, prioFrames: 166, timestop: [0, 166], motionStop: [0, 166], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => applyTeam(INKLIT_SPIRITS, isHeld(ZZ_S2) ? 27 : 21),
});
const INKLIT_FIELD = new ActionField("Zhezhi: Inklit Spirits");
/** One Inklit Spirit — a real Coordinated Attack, summoned one per qualifying action by
 *  INKLIT_SPIRITS below, always on her own slot however far the field has moved on. */
const ACTION_INKLIT = zhezhiAction("Liberation - Inklit Spirit", {
  node: Node.Liberation, type: Type.Basic, subtype: Subtype.Coordinated, bullets: [{ hitFrame: 37, mv: 6521, offtune: 4572 }], field: INKLIT_FIELD,
});

/** S5's extra spirit: 140% of one Inklit Spirit, its own row on the kit page (91.30%, and no
 *  off-tune of its own) — Basic Attack DMG, and it never summons a spirit of its own. */
const ACTION_INKLIT_S5 = zhezhiAction("Liberation - Inklit Spirit (S5)", {
  node: Node.Liberation, type: Type.Basic, subtype: Subtype.Coordinated, bullets: [{ hitFrame: 37, mv: 9130 }], field: INKLIT_FIELD,
});
/** S6's extra Herald: 120% of Stroke of Genius, likewise its own row (357.86%, no energy, concerto
 *  or off-tune) — Basic Attack DMG, summoned rather than cast. */
const ACTION_HERALD_S6 = zhezhiAction("Skill - Ivory Herald (S6)", {
  node: Node.Forte, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 35786 }],
});

const Intro = zhezhiAction("Intro - Radiant Ruin", {
  animFrames: 80, noSwapFrames: 80, prioFrames: 80, motionStop: [5, 59],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 66, commitFrame: 36, mv: 8616, energy: 334, offtune: 3467 },
    { hitFrame: 72, commitFrame: 36, mv: 8616, energy: 334, offtune: 3467 },
    { hitFrame: 78, commitFrame: 36, mv: 8616, energy: 334, offtune: 3467 },
  ], castConcerto: 1000, castForte1: 4500,
});
const Outro = zhezhiAction("Outro - Carve and Draw", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => queueOutro(ZHEZHI_OUTRO),
});

/* ------------------------------------------------------------------------------------ buffs */

/** The Inklit Spirit window: Living Canvas banks 21 team-wide, one spirit summoned per qualifying
 *  action — "the active Resonator deals DMG", once a second, read as once an action. Declared at
 *  S2's own 27, the ceiling that node raises it to; the Liberation grants the count it actually has. */
const INKLIT_SPIRITS = coordinatedBuff("Zhezhi: Inklit Spirits", 27, () => ZHEZHI_RESONATOR, ACTION_INKLIT, {
  // S5: one extra spirit every third one summoned. The node is her own local gear, so it is read
  // off her slot by identity; the spirit lands on her slot like the rest.
  onTick: (n) => {
    if (n % 3 === 0 && currentTeam().memberOf(ZHEZHI_RESONATOR).isHeld(ZZ_S5)) queueOn(ZHEZHI_RESONATOR, ACTION_INKLIT_S5);
  },
});

/** Calligrapher's Touch (Inherent Skill): +6% ATK a stack, up to 3, on Stroke of Genius or
 *  Creation's Zenith — 27s, permanent uptime once granted. */
const CALLIGRAPHERS_TOUCH = new Buff({
  name: "Inherent: Calligrapher's Touch", maxStacks: 3, duration: 60 * 27,
  stats: [[Stat.BonusAtk, 6]], perStack: true,
});
const ZZ_INHERENT_1 = new Inherent({
  name: "Inherent: Calligrapher's Touch",
  updateBuffs: () => { if (runningAction(FSkill) || runningAction(FSkill3)) applyCurrent(CALLIGRAPHERS_TOUCH, 1); },
});

/** +18% Basic Attack DMG Bonus, 27s, permanent uptime — only Creation's Zenith grants this, not
 *  Stroke of Genius. */
const IVORY_HERALD = new Buff({
  name: "Zhezhi: Ivory Herald",
  duration: 60 * 27,
  stats: [[Stat.DmgBonus, 18, Type.Basic]],
});

/** The window her outro hands the incoming resonator. */
const ZHEZHI_OUTRO = new Buff({
  name: "Zhezhi: Outro",
  duration: 60 * 14,
  stats: [[Stat.Amp, 20, Attribute.Glacio], [Stat.Amp, 25, Type.Skill]],
  lostOnSwap: true,
});

/** Flourish (Inherent Skill): restores 15 Energy to whoever adopts Carve and Draw, paid on their
 *  own Intro, then dropped. Its own Buff, queued alongside ZHEZHI_OUTRO, so it traces to its own name. */
const ZZ_FLOURISH = new Buff({
  name: "Inherent: Flourish",
  updateBuffs: () => {
    if (casting(Cast.Intro)) addToCast({ energy: 1500 });
  },
  afterAction: () => { if (casting(Cast.Intro)) revokeCurrent(ZZ_FLOURISH); },
});

const ZZ_INHERENT_2 = new Inherent({
  name: "Inherent: Flourish",
  updateBuffs: () => {
    if (runningAction(Outro)) {
      queueOutro(ZZ_FLOURISH);
    }
  }
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const ZHEZHI_TALENTS = new Talent({
  name: "Zhezhi: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const ZHEZHI_MATRIX = matrix("Zhezhi", 20, {
  updateBuffs: () => { if (casting(Cast.Liberation)) applyTeam(ZHEZHI_MATRIX_TEAM); },
});

const ZHEZHI_RESONATOR = new Resonator({
  name: "Zhezhi",
  matrix: ZHEZHI_MATRIX,
  talent: ZHEZHI_TALENTS,
  inherent1: ZZ_INHERENT_1,
  inherent2: ZZ_INHERENT_2,
  element: Attribute.Glacio,
  weapon: WeaponType.Rectifier,
  color: "#8fd3e8",
  intro: Intro,
  maxEnergy: 12500,
  forteScale: [0.01, 1, 1, 1, 1],
  maxForte1: 9000,
  maxForte2: 2,

  stats: [[Stat.BaseHp, 12250], [Stat.BaseAtk, 375], [Stat.BaseDef, 1197.7756]],
});

// the kit-valid line reconstructed from the old sheet: Intro banks Afflatus, three basics push
// it to 90+, Skill opens two Imprints, the forte Heavy Attack opens the third, two Strokes of
// Genius and a Creation's Zenith spend all three, Liberation opens the Coordinated Attack window
// before Outro closes the loop. She's never the team's own lead, so this covers both opener/loop.

const BA123 = new ActionGroup("Basic - Dimming Brush 123", [BA1, BA2, BA3]);

const ZZ_ROTATION = new Rotation([
  NOINTRO, BA123,

  INTRO,
  BA123.cancel(), ECHO.instaDodge(), Liberation,
  Skill, FHA.cancel(), FSkill.jumpCancel(), FSkill.jumpCancel(), FSkill3.instaSwap(),
  Outro,
]);

/* --------------------------------------------------------------------------------- sequences */

/** S1: Creation's Zenith restores 15 Energy and grants +10% Crit. Rate for 27s — permanent uptime
 *  once the loop's own Zenith lands. */
const BRUSHWORKS_FINISH = new Buff({
  name: "Zhezhi S1: Brushwork's Finish",
  duration: 60 * 27,
  stats: [[Stat.CritRate, 10]],
});
const ZZ_S1 = new Sequence({
  name: "Zhezhi S1: Brushwork's Finish",
  updateBuffs: () => {
    if (runningAction(FSkill3)) addToCast({ energy: 1500 });
  },
  grants: [{ on: onAction(FSkill3), buff: BRUSHWORKS_FINISH }],
});

/** S2: six more Inklit Spirits off Living Canvas — read off this node by the Liberation itself,
 *  which is what grants the window. */
const ZZ_S2 = new Sequence({ name: "Zhezhi S2: Vivid Strokes" });

/** S3: +15% ATK a stack, up to 3, off Manifestation/Stroke of Genius/Creation's Zenith — 27s, so
 *  permanent uptime, and the loop casts four of them. */
const REFLECTIONS_GRACE = new Buff({
  name: "Zhezhi S3: Reflection's Grace", maxStacks: 3, duration: 60 * 27,
  stats: [[Stat.BonusAtk, 15]], perStack: true,
});
const ZZ_S3 = new Sequence({
  name: "Zhezhi S3: Reflection's Grace",
  updateBuffs: () => {
    if (runningAction(Skill) || runningAction(FSkill) || runningAction(FSkill3)) applyCurrent(REFLECTIONS_GRACE, 1);
  },
});

/** S4: +20% team ATK off Living Canvas for 30s — permanent uptime. */
const HUES_SPECTRUM = new Buff({
  name: "Zhezhi S4: Hue's Spectrum",
  duration: 60 * 30,
  stats: [[Stat.BonusAtk, 20]],
});
const ZZ_S4 = new Sequence({
  name: "Zhezhi S4: Hue's Spectrum",
  grants: [{ on: onAction(Liberation), buff: HUES_SPECTRUM, to: BuffTarget.Team }],
});

/** S5: one extra spirit every third one summoned — fired by the window itself (INKLIT_SPIRITS
 *  above), which is what counts them. */
const ZZ_S5 = new Sequence({ name: "Zhezhi S5: Composition's Clue" });

/** S6: an extra Ivory Herald off either forte Skill. */
const ZZ_S6 = new Sequence({ name: "Zhezhi S6: Infinite Legacy" });

const ZZ_SEQUENCES = [ZZ_S1, ZZ_S2, ZZ_S3, ZZ_S4, ZZ_S5, ZZ_S6];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, and two real
// echo choices — Empyrean Anthem or Moonlit Clouds — both automatically iterated (see gear.ts's
// own EchoLoadout)
/** Matrix: her Liberation grants the team +30% Resonance Skill DMG Bonus for 30s — permanent. */
const ZHEZHI_MATRIX_TEAM = new Buff({
  name: "Zhezhi: Matrix Buff", duration: 60 * 30,
  stats: [[Stat.DmgBonus, 30, Type.Skill]],
});

export const ZHEZHI = new Loadout({
  resonator: ZHEZHI_RESONATOR,
  weapons: [RIME_DRAPED_SPROUTS, COSMIC_RIPPLES, VARIATION, NEW_STD_RECTIFIER, STRINGMASTER, LETHEAN_ELEGY, WHISPERS_OF_SIRENS],
  echoLoadouts: [
    new EchoLoadout(NM_LAMPY, EMPYREAN_ANTHEM_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Basic, Substat.AtkPct, Substat.FlatAtk, Substat.Skill),
  rotation: ZZ_ROTATION,
  sequences: ZZ_SEQUENCES,
});
