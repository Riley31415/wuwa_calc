/**
 * Zhezhi, ported to the new engine — sequence-0 core loop only. A glacio Coordinated-Attack
 * support/sub-DPS, similar shape to Cantarella: her Liberation (Living Canvas) opens a passive
 * 30s window where Inklit Spirits perform Coordinated Attacks off the *active* resonator's own
 * hits — one lump action for the whole 21-hit window (`ACTION_LIB_COORDS`), queued off her own
 * Outro rather than placed directly in the rotation, same treatment as Cantarella's Diffusion.
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
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Action, Stat, Attribute, WeaponType, Type1, Type2, Cast,
  Node, Scaling, applyCurrent, currentAction, casting, revokeSelf, addStat, frozenStacks, queue, queueOutro,
  lostOnSwap,
} from "../../engine/kit.js";
import { Rotation, INTRO, ECHO_CAST, OUTRO_NEXT } from "../../engine/rotation.js";
import { RIME_DRAPED_SPROUTS, STRINGMASTER, LETHEAN_ELEGY, WHISPERS_OF_SIRENS } from "../../weapons/rectifier.js";
import { VARIATION, NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { EMPYREAN_ANTHEM_2PC, EMPYREAN_ANTHEM_5PC, NM_LAMPY } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../engine/mainstats.js";
import { chem } from "../../engine/substats.js";
import { HERON, MOONLIT_CLOUDS_2PC, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { CANTA_LOADOUT } from "../v20rinascita/cantarella.js";

/* ----------------------------------------------------------------------------------- actions */

function zhezhiAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter (Dimming Brush)
const BA1 = zhezhiAction("Basic - Dimming Brush 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 83.52, energy: 1.5, concerto: 4.8, offtune: 4800, forte1: 10 });
const BA2 = zhezhiAction("Basic - Dimming Brush 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 102.75, energy: 1.85, concerto: 5.95, offtune: 5905, forte1: 15 });
const BA3 = zhezhiAction("Basic - Dimming Brush 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 133.61, energy: 2.4, concerto: 7.68, offtune: 7680, forte1: 25 });

const MA = zhezhiAction("Basic - Dimming Brush (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 229.53, energy: 3.4, concerto: 10.91, offtune: 10865, forte1: 10 });
const DC = zhezhiAction("Basic - Dimming Brush (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 145.35, energy: 2.15, concerto: 20, offtune: 6880, forte1: 15 });
const HA = zhezhiAction("Heavy - Dimming Brush", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 112.72, energy: 1.67, concerto: 5.34, offtune: 5336, forte1: 15 });

// spends 60 Afflatus for a pair of Imprints
const Skill = zhezhiAction("Skill - Manifestation", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 295.26, energy: 7.92, concerto: 8, offtune: 4737, forte1: -60,
});

// spends the remaining 30 Afflatus for a third Imprint, then Stroke of Genius x2, then
// Creation's Zenith (spends both Painter's Delight frozenStacks, never tracked directly)
const FHA = zhezhiAction("Forte Heavy - Conjuration", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 249.03, energy: 2.1, concerto: 6.69, offtune: 6681, forte1: -30,
});
const FSkill = zhezhiAction("Forte Skill - Stroke of Genius", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Basic, mv: 298.22, energy: 7, concerto: 13, offtune: 7736,
});
const FSkill3 = zhezhiAction("Forte Skill - Creation's Zenith", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Basic, mv: 357.87, energy: 7.02, concerto: 13, offtune: 10401,
  updateBuffs: () => applyCurrent(IVORY_HERALD, 1),
});

// opens the Inklit Spirit window, no damage of its own
const Liberation = zhezhiAction("Liberation - Living Canvas", {
  node: Node.Liberation, cast: Cast.Liberation, mv: 0, concerto: 20, resetEnergy: true,
});
/** Up to 21 Coordinated Attack hits over 30s, lumped into one action, queued off her own Outro. */
const ACTION_LIB_COORDS = zhezhiAction("Liberation - Inklit Spirit x21", {
  node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 1369.41, offtune: 96012, active: false,
});

const Intro = zhezhiAction("Intro - Radiant Ruin", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 258.48, energy: 10.02, concerto: 10, offtune: 10401, forte1: 45,
});
const Outro = zhezhiAction("Outro - Carve and Draw", {
  cast: Cast.Outro, mv: 0, active: false,
  updateBuffs: () => { queue(ACTION_LIB_COORDS); queueOutro(ZHEZHI_OUTRO); },
});

/* ------------------------------------------------------------------------------------ buffs */

/** Calligrapher's Touch (Inherent Skill): +6% ATK a stack, up to 3, on Stroke of Genius or
 *  Creation's Zenith — 27s, permanent uptime once granted. */
const CALLIGRAPHERS_TOUCH = new Buff({
  name: "Zhezhi: Calligrapher's Touch", maxStacks: 3,
  applyStats: () => addStat(Stat.BonusAtk, 6 * frozenStacks()),
});
const ZZ_INHERENT_1 = new Inherent({
  name: "Zhezhi: Calligrapher's Touch",
  updateBuffs: () => { const a = currentAction(); if (a === FSkill || a === FSkill3) applyCurrent(CALLIGRAPHERS_TOUCH, 1); },
});

/** +18% Basic Attack DMG Bonus, 27s, permanent uptime — only Creation's Zenith grants this, not
 *  Stroke of Genius. */
const IVORY_HERALD = new Buff({
  name: "Zhezhi: Ivory Herald",
  applyStats: () => addStat(Stat.DmgBonus, 18, Type1.Basic),
});

/** The window her outro hands the incoming resonator. */
const ZHEZHI_OUTRO = new Buff({
  name: "Zhezhi: Outro",
  applyStats: () => {
    addStat(Stat.Amp, 20, Attribute.Glacio);
    addStat(Stat.Amp, 25, Type1.Skill);
  },
  updateBuffs: () => { lostOnSwap(); },
});

/** Flourish (Inherent Skill): restores 15 Energy to whoever adopts Carve and Draw, paid on their
 *  own Intro. Its own Buff, queued alongside ZHEZHI_OUTRO, so it traces to its own source name. */
const ZZ_FLOURISH = new Buff({
  name: "Zhezhi: Flourish",
  applyStats: () => {
    addStat(Stat.AddEnergy, 15);
    revokeSelf(ZZ_FLOURISH);
  },
});

const ZZ_INHERENT_2 = new Inherent({
  name: "Zhezhi: Flourish",
  updateBuffs: () => {
    if (currentAction() === Outro) {
      queueOutro(ZZ_FLOURISH);
    }
  }
});

const ZHEZHI = new Resonator({
  name: "Zhezhi",
  element: Attribute.Glacio,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  outro: () => Outro,
  color: "#8fd3e8",
  maxEnergy: 125,

  constantStats: () => {
    addStat(Stat.BaseHp, 12250); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1198);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const ZHEZHI_TALENTS = new Talent({
  name: "Zhezhi: Talents",
  constantStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

// the kit-valid line reconstructed from the old sheet: Intro banks Afflatus, three basics push
// it to 90+, Skill opens two Imprints, the forte Heavy Attack opens the third, two Strokes of
// Genius and a Creation's Zenith spend all three, Liberation opens the Coordinated Attack window
// before Outro closes the loop. She's never the team's own lead, so this covers both opener/loop.

const ZZ_ROTATION = new Rotation([
  INTRO, ECHO_CAST, BA1, BA2, BA3,
  Skill, FHA, FSkill, FSkill, FSkill3,
  Liberation, OUTRO_NEXT,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, viable weapons, and two real
// echo choices — Empyrean Anthem or Moonlit Clouds — both automatically iterated (see kit.ts's
// own EchoLoadout)
export const ZZ_LOADOUT = new Loadout({
  resonator: ZHEZHI,
  talent: ZHEZHI_TALENTS,
  inherent1: ZZ_INHERENT_1,
  inherent2: ZZ_INHERENT_2,
  weapons: [RIME_DRAPED_SPROUTS, COSMIC_RIPPLES, VARIATION, NEW_STD_RECTIFIER, STRINGMASTER, LETHEAN_ELEGY, WHISPERS_OF_SIRENS],
  echoLoadouts: [
    new EchoLoadout(NM_LAMPY, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
    rotation: ZZ_ROTATION,
});
