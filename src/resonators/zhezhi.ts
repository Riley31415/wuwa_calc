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
 * at 2 stacks, it's replaced again by Creation's Zenith (removes one, spends every stack, and
 * grants Ivory Herald — +18% Basic Attack DMG Bonus, 27s, permanent uptime once granted). Live
 * Imprint tracking isn't simulated — the rotation below just places Skill, then the Heavy Attack
 * follow-up, then Stroke of Genius twice, then Creation's Zenith by hand, in the order that's
 * actually kit-valid (opens exactly 3 Imprints, spends exactly 3). Painter's Delight itself
 * carries no stat of its own — pure gating, nothing here reads it — so it isn't modelled as a
 * buff at all, only what it gates (Creation's Zenith's own cast) is.
 *
 * Numbers from nanoka.cc (character 1105, https://ww.nanoka.cc/character/1105) — base stats
 * (12,250 HP / 375 ATK / 1,198 DEF) confirmed there directly; every action's own MV/energy/
 * concerto/offtune/forte1 delta ported from the migrated (old-engine) sheet, which already cites
 * the same character page and cross-checks its own multi-hit totals.
 */
import {
  Buff, Resonator, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Type2, Cast, Node, Scaling,
  applySelf, currentAction, casting, revoke, addStat, stacks, queue, queueOutro, AddEnergy,
} from "../kit.js";
import { RIME_DRAPED_SPROUTS } from "../weapons/rectifier.js";
import { EMPYREAN_ANTHEM_2PC, EMPYREAN_ANTHEM_5PC, NM_LAMPY } from "../echoes/jinzhou.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------------------------------------ buffs */

/** Calligrapher's Touch (Inherent Skill): +6% ATK a stack, up to 3, on Stroke of Genius or
 *  Creation's Zenith — both share Resonance Skill's own `cast` tag, so her own update() below
 *  checks for the two forte forms by identity rather than by cast type. 27s, so per the standing
 *  duration rule this is permanent uptime once granted, never revoked. */
export const CALLIGRAPHERS_TOUCH = new Buff({
  name: "Zhezhi: Calligrapher's Touch", maxStacks: 3,
  apply: () => addStat(Stat.BonusAtk, 6 * stacks()),
});

/** Ivory Herald: Creation's Zenith's own +18% Basic Attack DMG Bonus, 27s — permanent uptime
 *  once granted, never revoked. Stroke of Genius doesn't grant this, only Creation's Zenith. */
export const IVORY_HERALD = new Buff({
  name: "Zhezhi: Ivory Herald",
  apply: () => addStat(Stat.DmgBonus, 18, Type1.Basic),
});

/** Carve and Draw: the window her outro hands the incoming resonator — +20% Glacio DMG Amp,
 *  +25% Skill DMG Amp, 14s (short enough that only the standing outro-loss rule matters). Flourish
 *  (Inherent Skill) restores 15 Energy to whoever adopts this, paid out the instant they do —
 *  their own Intro cast, the one action every recipient of a queued outro buff is guaranteed to
 *  have just played. */
export const ZHEZHI_OUTRO = new Buff({
  name: "Zhezhi: Outro",
  apply: () => {
    addStat(Stat.Amp, 20, Element.Glacio);
    addStat(Stat.Amp, 25, Type1.Skill);
    if (casting(Cast.Intro)) addStat(AddEnergy, 1500);
  },
  // a plain window, not "lost on swap" wording — still counts on the recipient's own outro (see
  // jinzhou.ts's HERON_HANDOFF for the same shape)
  convert: () => { if (casting(Cast.Outro)) revoke(ZHEZHI_OUTRO); },
});

/* ----------------------------------------------------------------------------------- actions */

function zhezhiAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Glacio, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune are her own kit's real generation per cast — Liberation/Outro's own
// old declared "spend the bar" costs aren't repeated here (TODO_ENGINE.md: that's what
// Resonator.maxEnergy and the engine's own outro handling are for).
// --- basics, mid-air, dodge counter (Dimming Brush)
export const BA1 = zhezhiAction("Basic - Dimming Brush 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 83.52, energy: 150, concerto: 480, offtune: 4800, forte1: 10 });
export const BA2 = zhezhiAction("Basic - Dimming Brush 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 102.75, energy: 185, concerto: 595, offtune: 5905, forte1: 15 });
export const BA3 = zhezhiAction("Basic - Dimming Brush 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 133.61, energy: 240, concerto: 768, offtune: 7680, forte1: 25 });

export const MA = zhezhiAction("Basic - Dimming Brush (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 229.53, energy: 340, concerto: 1091, offtune: 10865, forte1: 25 });
export const DC = zhezhiAction("Basic - Dimming Brush (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 145.35, energy: 215, concerto: 2000, offtune: 6880 });
export const HA = zhezhiAction("Heavy - Dimming Brush", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 112.72, energy: 167, concerto: 534, offtune: 5336, forte1: 15 });

// --- resonance skill: Manifestation, base cast — spends 60 Afflatus for a pair of Imprints
export const Skill = zhezhiAction("Skill - Manifestation", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 295.26, energy: 792, concerto: 800, offtune: 4737, forte1: -60,
});

// --- forte circuit: Heavy Attack - Conjuration (spends the remaining 30 Afflatus for a third
//     Imprint), then Stroke of Genius (twice — two of the three Imprints), then Creation's
//     Zenith (the last Imprint, plus both Painter's Delight stacks it never tracks directly)
export const FHA = zhezhiAction("Forte Heavy - Conjuration", {
  node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 249.03, energy: 210, concerto: 669, offtune: 6681, forte1: -30,
});
export const FSkill = zhezhiAction("Forte Skill - Stroke of Genius", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Basic, mv: 298.22, energy: 700, concerto: 1300, offtune: 7736,
});
export const FSkill3 = zhezhiAction("Forte Skill - Creation's Zenith", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Basic, mv: 357.87, energy: 702, concerto: 1300, offtune: 10401,
});

// --- liberation: Living Canvas — opens the Inklit Spirit window, no damage of its own
export const Liberation = zhezhiAction("Liberation - Living Canvas", {
  node: Node.Liberation, cast: Cast.Liberation, mv: 0, concerto: 2000,
});
/** Inklit Spirit: up to 21 Coordinated Attack hits over 30s, one per second the active resonator
 *  lands a hit — lumped into one action, same treatment as Cantarella's Diffusion, queued the
 *  same way too: off her own Outro rather than placed directly in the rotation. */
export const ACTION_LIB_COORDS = zhezhiAction("Liberation - Inklit Spirit x21", {
  node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 1369.41, active: false,
});

// --- intro / outro
export const Intro = zhezhiAction("Intro - Radiant Ruin", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 258.48, energy: 1002, concerto: 1000, offtune: 10401, forte1: 45,
});
export const Outro = zhezhiAction("Outro - Carve and Draw", { cast: Cast.Outro, mv: 0, active: false });

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. The stat-tree talent bonus lives in its own `ZHEZHI_TALENTS` buff below —
 *  just another piece of her loadout, not special-cased on the Resonator itself. */
export const ZHEZHI = new Resonator({
  name: "Zhezhi",
  element: Element.Glacio,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  color: "#8fd3e8",
  maxEnergy: 12500,

  update: () => {
    const a = currentAction();
    if (a === FSkill || a === FSkill3) applySelf(CALLIGRAPHERS_TOUCH, 1);
    if (a === FSkill3) applySelf(IVORY_HERALD, 1);
    if (a === Outro) { queue(ACTION_LIB_COORDS); queueOutro(ZHEZHI_OUTRO); }
  },

  apply: () => {
    addStat(Stat.BaseHp, 12250); addStat(Stat.BaseAtk, 375); addStat(Stat.BaseDef, 1198);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
export const ZHEZHI_TALENTS = new Buff({
  name: "Zhezhi: Talents",
  apply: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusAtk, 12); },
});

/** The kit-valid line reconstructed from the old sheet: Intro banks Afflatus, three basics push
 *  it to 90+, Skill opens two Imprints, the forte Heavy Attack opens the third, two Strokes of
 *  Genius and a Creation's Zenith spend all three, Liberation opens the Coordinated Attack window
 *  (its own Inklit Spirit hits queued off Outro, not placed here — see ACTION_LIB_COORDS' own
 *  comment) before Outro closes the loop out. She's never the team's own lead, so unlike a
 *  first-position member's own opener, this same rotation covers both. */
export const ZZ_ROTATION = [
  INTRO, BA1, BA2, BA3,
  Skill, FHA, FSkill, FSkill, FSkill3,
  ECHO_CAST, Liberation,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents, weapon, mainslot echo, sonata pieces, mainstat/substat
export const ZZ_LOADOUT = [
  ZHEZHI, ZHEZHI_TALENTS,
  RIME_DRAPED_SPROUTS,
  NM_LAMPY, EMPYREAN_ANTHEM_5PC, EMPYREAN_ANTHEM_2PC,
  mainstats("CR", "glacio glacio", "atk atk"), chem("atk", "basic"),
];
