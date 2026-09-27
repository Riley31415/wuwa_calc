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
  addStat,
  queueOutro,
  applyTeam,
  isHeld,
  queue,
  
  currentTeam,
  queueOn,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ActionField, NOINTRO, ECHO, START_3, INTRO } from "../../engine/rotation.js";
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
const BA1 = zhezhiAction("Basic - Dimming Brush 1", { frames: 36, cancelFrames: 28, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 83.52, energy: 1.5, concerto: 4.8, offtune: 4800, forte1: 10 });
const BA2 = zhezhiAction("Basic - Dimming Brush 2", { frames: 44, cancelFrames: 24, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 102.75, energy: 1.85, concerto: 5.95, offtune: 5905, forte1: 15 });
const BA3 = zhezhiAction("Basic - Dimming Brush 3", { frames: 60, cancelFrames: 40, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 133.61, energy: 2.4, concerto: 7.68, offtune: 7680, forte1: 25 });

const MA = zhezhiAction("Mid-air - Dimming Brush 12", { frames: 66, cancelFrames: 36, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 229.53, energy: 3.4, concerto: 10.91, offtune: 10865, forte1: 25 });
const DC = zhezhiAction("Dodge Counter - Dimming Brush", { frames: 34, cancelFrames: 13, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, mv: 145.35, energy: 2.15, concerto: 20, offtune: 6880, forte1: 15 });
const HA = zhezhiAction("Heavy - Dimming Brush", { frames: 40, cancelFrames: 32, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, mv: 112.72, energy: 1.67, concerto: 5.34, offtune: 5336, forte1: 15 });

// spends 60 Afflatus for a pair of Imprints
const Skill = zhezhiAction("Skill - Manifestation", {
  frames: 40, cancelFrames: 24, cooldown: 60 * 6,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, mv: 295.26, energy: 7.92, castConcerto: 8, offtune: 4737, castForte1: -60,
});

// spends the remaining 30 Afflatus for a third Imprint, then Stroke of Genius x2, then
// Creation's Zenith (spends both Painter's Delight frozenStacks, never tracked directly)
const FHA = zhezhiAction("Forte Heavy - Conjuration", {
  frames: 75, cancelFrames: 28,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, mv: 249.03, energy: 2.1, concerto: 6.69, offtune: 6681, castForte1: -30,
});
const FSkill = zhezhiAction("Skill - Stroke of Genius", {
  frames: 52, cancelFrames: 18, motionStop: 12,
  node: Node.Forte, cast: Cast.Skill, type: Type.Basic, mv: 298.22, energy: 7, castConcerto: 13, offtune: 7736, forte2: 1,
});
const FSkill3 = zhezhiAction("Forte Skill - Creation's Zenith", {
  frames: 72, cancelFrames: 28, motionStop: 52,
  node: Node.Forte, cast: Cast.Skill, type: Type.Basic, mv: 357.87, energy: 7.02, castConcerto: 13, offtune: 10401, castForte2: -2,
  updateBuffs: () => applyCurrent(IVORY_HERALD, 1),
});

// opens the Inklit Spirit window, no damage of its own — the window itself is INKLIT_SPIRITS below
const Liberation = zhezhiAction("Liberation - Living Canvas", {
  frames: 166, cancelFrames: 166, timestop: 166, motionStop: 166, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, castConcerto: 20, resetEnergy: true,
  updateBuffs: () => applyTeam(INKLIT_SPIRITS, isHeld(ZZ_S2) ? 27 : 21),
});
const INKLIT_FIELD = new ActionField("Zhezhi: Inklit Spirits");
/** One Inklit Spirit — a real Coordinated Attack, summoned one per qualifying action by
 *  INKLIT_SPIRITS below, always on her own slot however far the field has moved on. */
const ACTION_INKLIT = zhezhiAction("Liberation - Inklit Spirit", {
  node: Node.Liberation, type: Type.Basic, subtype: Subtype.Coordinated, mv: 65.21, offtune: 4572, field: INKLIT_FIELD,
});

/** S5's extra spirit: 140% of one Inklit Spirit, its own row on the kit page (91.30%, and no
 *  off-tune of its own) — Basic Attack DMG, and it never summons a spirit of its own. */
const ACTION_INKLIT_S5 = zhezhiAction("Liberation - Inklit Spirit (S5)", {
  node: Node.Liberation, type: Type.Basic, subtype: Subtype.Coordinated, mv: 91.30, field: INKLIT_FIELD,
});
/** S6's extra Herald: 120% of Stroke of Genius, likewise its own row (357.86%, no energy, concerto
 *  or off-tune) — Basic Attack DMG, summoned rather than cast. */
const ACTION_HERALD_S6 = zhezhiAction("Skill - Ivory Herald (S6)", {
  node: Node.Forte, type: Type.Basic, mv: 357.86,
});

const Intro = zhezhiAction("Intro - Radiant Ruin", {
  frames: 80, cancelFrames: 80, motionStop: 55,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, mv: 258.48, energy: 10.02, castConcerto: 10, offtune: 10401, castForte1: 45,
});
const Outro = zhezhiAction("Outro - Carve and Draw", {
  frames: 0, cancelFrames: 0,
  cast: Cast.Outro, castConcerto: -100,
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
 *  own Intro. Its own Buff, queued alongside ZHEZHI_OUTRO, so it traces to its own source name. */
const ZZ_FLOURISH = new Buff({
  name: "Inherent: Flourish",
  stats: [[Stat.AddEnergy, 15]],
  applyStats: () => {
    revokeCurrent(ZZ_FLOURISH);
  },
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
  maxEnergy: 125,
  maxForte1: 90,
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
  BA123.cancel(), Liberation,
  Skill.cancel(), FHA.cancel(), FSkill, FSkill, FSkill3, ECHO.instaSwap(),
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
  applyStats: () => { if (runningAction(FSkill3)) addStat(Stat.AddEnergy, 15); },
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
const ZZ_S6 = new Sequence({
  name: "Zhezhi S6: Infinite Legacy",
  updateBuffs: () => {
    if (runningAction(FSkill) || runningAction(FSkill3)) queue(ACTION_HERALD_S6);
  },
});

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
