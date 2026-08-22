/**
 * Verina, ported to the new engine — sequence-0 core loop, but a `standardCharacter: true` (see
 * kit.ts's own doc comment on the flag), so her useful sequence nodes are folded in
 * unconditionally, each its own gear piece: S2 Sprouting Reflections (`VERINA_S2` — Botany
 * Experiment's own +1 Photosynthesis Energy/+10 Energy on top of its base gain, traced through
 * AddForte1/AddEnergy rather than folded into Skill's own flat declared fields), S4 Blossoming
 * Embrace (`VERINA_S4` triggers `S4_TEAM`'s own permanent +15% Spectro DMG Bonus), and S6 Joyous
 * Harvest (`VERINA_S6` — Starflower Blooms deals +20% more DMG and additionally triggers one
 * Coordinated Attack of its own). S1/S3/S5 are healing-threshold-only nodes with no damage-
 * relevant effect, so they're do-nothing gear pieces (`VERINA_S1`/`VERINA_S3`/`VERINA_S5`) — held
 * for the name only, same as every other out-of-scope healing mechanic on her own page (Grace of
 * Life's shield included). `heals: true` is still set
 * on every action her own page describes as healing (Liberation, both Starflower Blooms variants,
 * Outro, both Photosynthesis Mark actions) even though the formula doesn't use it, same as
 * Shorekeeper's own Chaos Theory.
 *
 * Photosynthesis Energy (forte1, max 4) builds off Basic Attack 5/Resonance Skill/Intro; a held
 * Heavy Attack or Mid-air Attack at 1+ becomes its own Starflower Blooms variant, spending a
 * stack. Liberation places Photosynthesis Mark on the enemy itself (a genuine debuff, not a self
 * buff) — for as long as it's up, any team member's hit on the marked target also triggers one of
 * Verina's own Coordinated Attacks (once a second). Rather than tracking that live, the mark's own
 * convert() waits for her own next Outro and then, in that same conversion step, removes itself
 * and queues one lump action for the whole window's worth of ticks (12, same treatment as Zhezhi's
 * Inklit Spirit/Cantarella's Diffusion) — the mark closing out is what pays for the ticks it was
 * open for, rather than the ticks being placed by hand mid-rotation.
 *
 * Gift of Nature (Inherent Skill): +20% ATK, team-wide, for casting either Starflower Blooms
 * variant, Liberation, or Outro. Real duration is 20s, but rather than the usual "lost at outro"
 * approximation this one is explicitly lost on her own *next* Intro instead — it keeps paying the
 * team the whole time she's off field and only clears once she's back, by explicit instruction.
 *
 * Numbers from nanoka.cc (character 1503, https://ww.nanoka.cc/character/1503) — she has no
 * migrated-sheet row (an older, unmigrated build), so this is nanoka's own "Skill Attributes"
 * table throughout; Energy/offtune generated per hit aren't exposed there beyond the odd Concerto
 * Regen figure it does give directly (used where shown), so everything else is 0, flagged rather
 * than guessed.
 */
import {
  Buff, Resonator, Action, ECHO_CAST, INTRO, Stat, Element, WeaponType, Type1, Type2, Cast, Node, Scaling,
  applyTeam, revokeTeam, applyEnemy, revokeEnemy, isHeld, casting, currentAction, addStat,
  queue, AddForte1, AddEnergy,
  AddConcerto,
} from "../kit.js";
import { VARIATION } from "../weapons/standard.js";
import { FALLACY, REJUV_5PC, REJUV_2PC } from "../echoes/jinzhou.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ------------------------------------------------------------------------------------ buffs */

/** Gift of Nature (Inherent Skill) — see the file header for why this ends on her own next Intro
 *  rather than her outro. Still pays out on that Intro itself: convert() only revokes after
 *  apply() already has. */
export const GIFT_OF_NATURE = new Buff({
  name: "Verina: Gift of Nature",
  apply: () => addStat(Stat.BonusAtk, 20),
  // granted from VERINA's own update() below, not this buff's own — a global buff's own update()
  // only runs once it's already held, which it isn't the very first time; the Resonator itself is
  // always self-held from team setup, so it has no such bootstrapping problem (same reasoning as
  // Sigrika's Blessing of Runes)
  convert: () => { if (casting(Cast.Intro) && isHeld(VERINA)) revokeTeam(GIFT_OF_NATURE); },
});

/** Photosynthesis Mark: a genuine debuff on the enemy (not a self buff) — see the file header.
 *  Carries no stat of its own; closing out on her own outro is what pays for the 12-tick window,
 *  via the queued follow-up below, not this buff directly. */
export const PHOTOSYNTHESIS_MARK = new Buff({
  name: "Verina: Photosynthesis Mark",
  convert: () => {
    if (!casting(Cast.Outro) || !isHeld(VERINA)) return;
    queue(PhotosynthesisMark);
    revokeEnemy(PHOTOSYNTHESIS_MARK);
  },
});

/** S2 Sprouting Reflections: Botany Experiment's own +1 Photosynthesis Energy/+10 Energy on top
 *  of its base gain — see the file header for why this is its own gear piece instead of folded
 *  into Skill's own flat fields. */
export const VERINA_S2 = new Buff({
  name: "Verina S2: Sprouting Reflections",
  apply: () => { if (currentAction() === Skill) { addStat(AddForte1, 1); addStat(AddConcerto, 10); } },
});

/** S4 Blossoming Embrace: the trigger lives here, its own gear piece; the actual team-wide payout
 *  is `S4_TEAM` (permanent uptime once granted, per the standing duration rule). */
export const VERINA_S4 = new Buff({
  name: "Verina S4: Blossoming Embrace",
  update: () => {
    const a = currentAction();
    // ForteMidair1 alone stands in for "cast Starflower Blooms (Mid-Air)" — S4_TEAM is a
    // permanent-once-granted buff, so it only needs the trigger once per combo, not once a stage.
    if (a === StarflowerHeavy || a === ForteMidair1 || a === Liberation || a === Outro) applyTeam(S4_TEAM, 1);
  },
});
export const S4_TEAM = new Buff({
  name: "Verina S4: Blossoming Embrace", apply: () => addStat(Stat.DmgBonus, 15, Element.Spectro),
});

/** S6 Joyous Harvest: Starflower Blooms deals +20% more DMG and additionally triggers one
 *  Coordinated Attack of its own — the same single-hit value Photosynthesis Mark's own periodic
 *  proc has, not the full 12-tick sum. */
export const VERINA_S6 = new Buff({
  name: "Verina S6: Joyous Harvest",
  // the DMG boost lands on every one of Mid-air's own 3 stages, but the Coordinated Attack is
  // triggered once per combo (ForteMidair1 standing in for "cast", same as S4/Gift of Nature above)
  apply: () => {
    const a = currentAction();
    if (a === StarflowerHeavy || a === ForteMidair1 || a === ForteMidair2 || a === ForteMidair3) addStat(Stat.DmgBonus, 20);
  },
  update: () => { if (currentAction() === StarflowerHeavy || currentAction() === ForteMidair1) queue(PhotosynthesisTick); },
});

// S1 Moment of Emergence, S3 The Choice to Flourish, S5 Miraculous Blooms — all healing-only, no
// damage-relevant effect (see file header); do-nothing gear pieces, just the name
export const VERINA_S1 = new Buff({ name: "Verina S1: Moment of Emergence" });
export const VERINA_S3 = new Buff({ name: "Verina S3: The Choice to Flourish" });
export const VERINA_S5 = new Buff({ name: "Verina S5: Miraculous Blooms" });

/* ----------------------------------------------------------------------------------- actions */

function verinaAction(id: string, def: object): Action {
  return new Action(id, { element: Element.Spectro, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter, heavy (Cultivation). energy/concerto/offtune all come off
//     nanoka's own Damage Data table (energy/concerto straight off its own raw Energy/Elemental
//     DMG columns, x10000 for offtune's Weakness Break DMG column); BA3/MA3 are each two/three
//     repeated hits folded into one action same as their own mv already was, so their own
//     per-hit column values are summed the same number of times.
export const BA1 = verinaAction("Basic - Cultivation 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 37.86, energy: 0.95, concerto: 3.04, offtune: 7600 });
export const BA2 = verinaAction("Basic - Cultivation 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 51.16, energy: 1.28, concerto: 4.11, offtune: 10200 });
export const BA3 = verinaAction("Basic - Cultivation 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 51.16, energy: 1.28, concerto: 4.1, offtune: 10200 });
export const BA4 = verinaAction("Basic - Cultivation 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 67.32, energy: 1.69, concerto: 5.41, offtune: 13600 });
export const BA5 = verinaAction("Basic - Cultivation 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 71.62, energy: 1.8, concerto: 5.76, offtune: 14400, forte1: 1 });
export const HA = verinaAction("Heavy - Cultivation", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 99.41, energy: 2.5, concerto: 8, offtune: 20000 });
export const MA1 = verinaAction("Basic - Cultivation 1 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 56.37, energy: 1.41, concerto: 4.53, offtune: 11340 });
export const MA2 = verinaAction("Basic - Cultivation 2 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 53.19, energy: 1.33, concerto: 4.28, offtune: 10700 });
export const MA3 = verinaAction("Basic - Cultivation 3 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 76.26, energy: 1.89, concerto: 6.12, offtune: 15330 });
export const MHA = verinaAction("Heavy - Cultivation (Mid-air)", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 61.64, energy: 0.51, concerto: 1, offtune: 12400 });
export const DC = verinaAction("Basic - Cultivation (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 129.23, energy: 3.25, concerto: 5.6, offtune: 14000 });

// --- resonance skill: Botany Experiment — base gain only; S2's own extra Photosynthesis
//     Energy/Energy is traced separately (see VERINA_S2 above). concerto stays the flat listed
//     Concerto Regen (30) — its own table entries read 0 Elemental DMG, nothing to add on top.
export const Skill = verinaAction("Skill - Botany Experiment", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 178.95, energy: 15, concerto: 30, offtune: 26600, forte1: 1 });

// --- forte circuit: Starflower Blooms, spends 1 Photosynthesis Energy either way, heals
export const StarflowerHeavy = verinaAction("Forte Heavy - Starflower Blooms", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 162.37, energy: 2.91, concerto: 12 + 4.66, offtune: 14600, forte1: -1, heals: true });
// Mid-air Starflower Blooms is itself a 3-stage combo, same shape as the plain MA1-3 chain it
// replaces — each stage is "considered as Basic Attack DMG" and so carries its own baseline
// energy/concerto/offtune same as MA1-3 do (nanoka's own per-entry Damage Data columns), plus the
// flat "Photosynthesis Energy" Concerto Regen (12) on every stage. Only the forte spend/heal are
// banked onto stage 1 alone, since the Forte Gauge itself is only spent once for the whole combo,
// not once a stage. Stage 3 hits 3 times (30.50%*3), so its own mv and per-hit columns are all
// tripled.
export const ForteMidair1 = verinaAction("Forte Basic - Starflower Blooms (Mid-Air) 1",
    { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 67.64, energy: 1.41, concerto: 12 + 4.53, offtune: 11340, forte1: -1, heals: true });
export const ForteMidair2 = verinaAction("Forte Basic - Starflower Blooms (Mid-Air) 2",
    { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 63.82, energy: 1.33, concerto: 12 + 4.28, offtune: 10700, forte1: -1, heals: true });
export const ForteMidair3 = verinaAction("Forte Basic - Starflower Blooms (Mid-Air) 3",
    { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 30.50 * 3, energy: 1.89, concerto: 12 + 2.04 * 3, offtune: 15330, forte1: -1, heals: true });

// --- liberation: Arboreal Flourish — places Photosynthesis Mark on the enemy (see file header),
//     heals. Every one of its own Damage Data entries (main hit and the Coordinated tick alike)
//     reads 0 Energy/Elemental DMG/Weakness Break DMG, so energy/offtune both stay 0 here too —
//     concerto is the flat listed Concerto Regen (20), same as Skill above.
export const Liberation = verinaAction("Liberation - Arboreal Flourish", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 198.81, concerto: 20, heals: true });
/** One Coordinated Attack tick, S6's own single-hit reuse. */
export const PhotosynthesisTick = verinaAction("Liberation - Photosynthesis Mark", { node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 9.95, heals: true });
/** The full 12-tick window, queued off Photosynthesis Mark's own convert() at her own outro. */
export const PhotosynthesisMark = verinaAction("Liberation - Photosynthesis Mark x12", { node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 119.4, active: false, heals: true });

// --- intro / outro
export const Intro = verinaAction("Intro - Verdant Growth", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 99.41, energy: 10, concerto: 10, offtune: 11230, forte1: 1 });
/** Blossom: no damage of its own, just the Gift of Nature/S4 trigger and (skipped) healing. */
export const Outro = verinaAction("Outro - Blossom", { cast: Cast.Outro, active: false, heals: true });

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. `standardCharacter: true` — see the file header. The stat-tree talent
 *  bonus and every sequence node live in their own separate Buffs above — just more pieces of her
 *  loadout, not special-cased on the Resonator itself. */
export const VERINA = new Resonator({
  name: "Verina",
  element: Element.Spectro,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  color: "#8fe08f",
  maxEnergy: 12500,
  standardCharacter: true,

  update: () => {
    const a = currentAction();
    if (a === Liberation) applyEnemy(PHOTOSYNTHESIS_MARK, 1);
    if (a === StarflowerHeavy || a === ForteMidair1 || a === Liberation || a === Outro) applyTeam(GIFT_OF_NATURE, 1);
  },

  apply: () => {
    addStat(Stat.BaseHp, 14238); addStat(Stat.BaseAtk, 338); addStat(Stat.BaseDef, 1100);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit —
// Healing Bonus+ nodes unused by the formula (healing out of scope), tracked for completeness only
export const VERINA_TALENTS = new Buff({
  name: "Verina: Talents",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.HealingBonus, 12); },
});

export const VR_OPENER = [
  Skill, Liberation,
  ForteMidair1, ForteMidair2,
  ECHO_CAST, Outro,
];

export const VR_LOOP = [
  INTRO, Skill, Liberation,
  ForteMidair1,
  ECHO_CAST, Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real support/healer spread rather than the usual 43311 crit build — her own damage is
// incidental to the kit; every sequence node (standardCharacter — see file header) alongside
// resonator + talents
export const VR_LOADOUT = [
  VERINA, VERINA_TALENTS, VERINA_S1, VERINA_S2, VERINA_S3, VERINA_S4, VERINA_S5, VERINA_S6,
  VARIATION,
  FALLACY, REJUV_5PC, REJUV_2PC,
  mainstats("ATK", "ER ER", "atk atk"), chem("atk", "liberation"),
];
