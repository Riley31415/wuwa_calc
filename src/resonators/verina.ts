/**
 * Verina, ported to the new engine. `standardCharacter: true` — her sequence nodes are folded in
 * unconditionally, each its own gear piece: S2 Sprouting Reflections, S4 Blossoming Embrace
 * (permanent +15% Spectro DMG once granted), S6 Joyous Harvest (+20% Starflower Blooms DMG plus a
 * Coordinated Attack). S1/S3/S5 are healing-only, no damage-relevant effect — do-nothing pieces.
 *
 * Photosynthesis Energy (forte1, max 4) builds off Basic 5/Skill/Intro; a held Heavy or Mid-air
 * Attack at 1+ becomes a Starflower Blooms variant, spending a stack. Liberation places
 * Photosynthesis Mark on the enemy — rather than tracking live ticks, the mark's own convert()
 * waits for her next Outro and queues one lump action for the whole window's 12 ticks at once,
 * same treatment as Zhezhi's Inklit Spirit/Cantarella's Diffusion.
 *
 * Gift of Nature (Inherent Skill): +20% ATK, team-wide, on either Starflower Blooms variant,
 * Liberation, or Outro. Real duration 20s, but explicitly lost on her own *next* Intro instead of
 * outro — it keeps paying the team the whole time she's off field.
 *
 * Numbers from nanoka.cc (character 1503) — she has no migrated-sheet row, so this is nanoka's own
 * Skill Attributes table throughout; anything not exposed there stays 0, flagged rather than guessed.
 */
import {
  Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling,
  applyTeam, revokeTeam, applyEnemy, revokeEnemy, isHeld, casting, currentAction, addStat,
  queue, applySelf
} from "../kit.js";
import { VARIATION } from "../weapons/standard.js";
import { FALLACY, REJUV_5PC, REJUV_2PC } from "../echoes/jinzhou.js";
import { mainstats } from "../shared/mainstats.js";
import { chem } from "../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function verinaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune come off nanoka's own Damage Data table; BA3/MA3 are each multiple
// repeated hits folded into one action, same as their own mv already was.
export const BA1 = verinaAction("Basic - Cultivation 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 37.86, energy: 0.95, concerto: 3.04, offtune: 7600 });
export const BA2 = verinaAction("Basic - Cultivation 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 51.16, energy: 1.28, concerto: 4.11, offtune: 10200 });
export const BA3 = verinaAction("Basic - Cultivation 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 51.16, energy: 1.28, concerto: 4.11, offtune: 10200 });
export const BA4 = verinaAction("Basic - Cultivation 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 67.32, energy: 1.69, concerto: 5.41, offtune: 13600 });
export const BA5 = verinaAction("Basic - Cultivation 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 71.62, energy: 1.8, concerto: 5.76, offtune: 14400, forte1: 1 });
export const HA = verinaAction("Heavy - Cultivation", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 99.41, energy: 2.5, concerto: 8, offtune: 20000 });
export const MA1 = verinaAction("Basic - Cultivation 1 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 56.37, energy: 1.41, concerto: 4.53, offtune: 11340 });
export const MA2 = verinaAction("Basic - Cultivation 2 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 53.19, energy: 1.33, concerto: 4.28, offtune: 10700 });
export const MA3 = verinaAction("Basic - Cultivation 3 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 76.26, energy: 1.89, concerto: 6.12, offtune: 15342 });
export const MHA = verinaAction("Heavy - Cultivation (Mid-air)", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 61.64, energy: 0.51, concerto: 1, offtune: 12400 });
export const DC = verinaAction("Basic - Cultivation (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 129.23, energy: 3.25, concerto: 15.6, offtune: 14000 });

// base gain only — S2's own extra Photosynthesis Energy/Energy is traced separately (VERINA_S2)
export const Skill = verinaAction("Skill - Botany Experiment", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 178.95, energy: 15, concerto: 30, offtune: 26600, forte1: 1 });

// Starflower Blooms spends 1 Photosynthesis Energy either way, heals
export const StarflowerHeavy = verinaAction("Forte Heavy - Starflower Blooms", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 162.37, energy: 2.91, concerto: 4.66, offtune: 14600, forte1: -1, heals: true });
// Mid-air Starflower Blooms is its own 3-stage combo (same shape as the MA1-3 chain it replaces);
// only stage 1 banks the forte spend/heal, since the Forte Gauge is spent once for the whole combo.
export const ForteMidair1 = verinaAction("Forte Basic - Starflower Blooms (Mid-Air) 1",
    { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 67.64, energy: 1.41, concerto: 4.53, offtune: 11340, forte1: -1, heals: true });
export const ForteMidair2 = verinaAction("Forte Basic - Starflower Blooms (Mid-Air) 2",
    { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 63.82, energy: 1.33, concerto: 4.28, offtune: 10700, forte1: -1, heals: true });
export const ForteMidair3 = verinaAction("Forte Basic - Starflower Blooms (Mid-Air) 3",
    { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 30.50 * 3, energy: 1.89, concerto: 6.12, offtune: 15342, forte1: -1, heals: true });

// Arboreal Flourish places Photosynthesis Mark on the enemy (see file header), heals
export const Liberation = verinaAction("Liberation - Arboreal Flourish", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 198.81, concerto: 20, heals: true, resetEnergy: true });
/** One Coordinated Attack tick, S6's own single-hit reuse. */
export const PhotosynthesisTick = verinaAction("Liberation - Photosynthesis Mark", { node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 9.95, heals: true });
/** The full 12-tick window, queued off Photosynthesis Mark's own convert() at her own outro. */
export const PhotosynthesisMark = verinaAction("Liberation - Photosynthesis Mark x12", { node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 119.4, offtune: 20000, concerto: 4.04, energy: 1.46, active: false, heals: true });

export const Intro = verinaAction("Intro - Verdant Growth", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 99.41, energy: 10, concerto: 10, offtune: 11230, forte1: 1 });
/** Blossom: no damage of its own, just the Gift of Nature/S4 trigger and (skipped) healing. */
export const Outro = verinaAction("Outro - Blossom", { cast: Cast.Outro, active: false, heals: true });

/* ------------------------------------------------------------------------------------ buffs */

/** Gift of Nature (Inherent Skill) — see the file header for why this ends on her own next Intro
 *  rather than outro. Still pays out on that Intro itself: convert() revokes only after apply() has. */
export const GIFT_OF_NATURE = new Buff({
  name: "Verina: Gift of Nature",
  apply: () => addStat(Stat.BonusAtk, 20),
  // granted from VERINA's own update() below since a global buff's own update() can't fire before
  // it's held once, and the Resonator itself is always self-held from team setup
  convert: () => { if (casting(Cast.Intro) && isHeld(VERINA)) revokeTeam(GIFT_OF_NATURE); },
});
/** Gift of Nature's own trigger — always-equipped Inherent Skill piece. */
export const VR_INHERENT_1 = new Inherent({
  name: "Verina: Gift of Nature",
  update: () => {
    const a = currentAction();
    if (a === StarflowerHeavy || a === ForteMidair1 || a === Liberation || a === Outro) applyTeam(GIFT_OF_NATURE, 1);
  },
});

export const VR_INHERENT_2 = new Inherent({ name: "Verina: Grace of Life" }); // revive teammate

/** Starflower Blooms spends a Photosynthesis Energy stack "to recover Concerto Energy" — the
 *  Forte Circuit's own `"Photosynthesis Energy" Concerto Regen = 12` row, which has no damage row
 *  of its own to hang off so nanoka's per-hit figures never carry it. Once per Starflower cast,
 *  not once per mid-air stage: the gauge is spent once for the whole combo (see the actions'
 *  own note), so only the Heavy and the mid-air's own stage 1 pay out. */
export const STARFLOWER_CONCERTO = new Buff({
  name: "Verina: Starflower Blooms Concerto",
  apply: () => {
    const a = currentAction();
    if (a === StarflowerHeavy || a === ForteMidair1) addStat(Stat.AddConcerto, 12);
  },
});

/** Blossom's own team-wide DMG Amp — 30s is past the 21s permanent-uptime threshold, so it's
 *  granted once and never revoked. The 19% ATK/s heal to the incoming Resonator is out of scope
 *  for the formula (Outro already carries heals: true). */
export const VERINA_OUTRO = new Buff({
  name: "Verina: Blossom",
  apply: () => addStat(Stat.Amp, 15),
});

/** Photosynthesis Mark: a genuine debuff on the enemy, not a self buff — closing out on her own
 *  outro is what pays for the 12-tick window, via the queued follow-up below. */
export const PHOTOSYNTHESIS_MARK = new Buff({
  name: "Verina: Photosynthesis Mark",
  convert: () => {
    if (!casting(Cast.Outro) || !isHeld(VERINA)) return;
    queue(PhotosynthesisMark);
    revokeEnemy(PHOTOSYNTHESIS_MARK);
  },
});

/** S2 Sprouting Reflections: Botany Experiment's own +1 Photosynthesis Energy/+10 Energy on top
 *  of its base gain. */
export const VERINA_S2 = new Sequence({
  name: "Verina S2: Sprouting Reflections",
  apply: () => { if (currentAction() === Skill) { addStat(Stat.AddForte1, 1); addStat(Stat.AddConcerto, 10); } },
});

/** S4 Blossoming Embrace: the trigger lives here; the payout is `S4_TEAM` (permanent uptime once
 *  granted, per the standing duration rule). */
export const VERINA_S4 = new Sequence({
  name: "Verina S4: Blossoming Embrace",
  update: () => {
    const a = currentAction();
    // ForteMidair1 stands in for "cast Starflower Blooms (Mid-Air)" — only needs to trigger once
    if (a === StarflowerHeavy || a === ForteMidair1 || a === Liberation || a === Outro) applyTeam(S4_TEAM, 1);
  },
});
export const S4_TEAM = new Buff({
  name: "Verina S4: Blossoming Embrace", apply: () => addStat(Stat.DmgBonus, 15, Attribute.Spectro),
});

/** S6 Joyous Harvest: Starflower Blooms deals +20% more DMG and also triggers one Coordinated
 *  Attack — the same single-hit value Photosynthesis Mark's own periodic proc has. */
export const VERINA_S6 = new Sequence({
  name: "Verina S6: Joyous Harvest",
  // the DMG boost lands on every Mid-air stage; the Coordinated Attack triggers once per combo
  apply: () => {
    const a = currentAction();
    if (a === StarflowerHeavy || a === ForteMidair1 || a === ForteMidair2 || a === ForteMidair3) addStat(Stat.DmgBonus, 20);
  },
  update: () => { if (currentAction() === StarflowerHeavy || currentAction() === ForteMidair1) queue(PhotosynthesisTick); },
});

// S1 Moment of Emergence, S3 The Choice to Flourish, S5 Miraculous Blooms — healing-only,
// do-nothing gear pieces held for the name only (see file header)
export const VERINA_S1 = new Sequence({ name: "Verina S1: Moment of Emergence" });
export const VERINA_S3 = new Sequence({ name: "Verina S3: The Choice to Flourish" });
export const VERINA_S5 = new Sequence({ name: "Verina S5: Miraculous Blooms" });

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. `standardCharacter: true` — see the file header. */
export const VERINA = new Resonator({
  name: "Verina",
  abbreviation: "Verina",
  element: Attribute.Spectro,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  color: "#8fe08f",
  maxEnergy: 175, // her own real 175%, not the generic 125% default — matches Shorekeeper's own

  standardCharacter: true,

  update: () => {
    if (currentAction() === Liberation) applyEnemy(PHOTOSYNTHESIS_MARK, 1);
    if (currentAction() === Outro) applyTeam(VERINA_OUTRO, 1);
  },

  apply: () => {
    addStat(Stat.BaseHp, 14238); addStat(Stat.BaseAtk, 338); addStat(Stat.BaseDef, 1100);
    addStat(Stat.Er, 100); addStat(Stat.CritRate, 5); addStat(Stat.CritDmg, 150);
  },
});

// stat-tree bonus alone — Healing Bonus+ unused by the formula (healing out of scope), kept for
// completeness only
export const VERINA_TALENTS = new Talent({
  name: "Verina: Talents",
  apply: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.HealingBonus, 12); },
  update: () => applySelf(STARFLOWER_CONCERTO, 1),
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

// her real support/healer spread rather than the usual 43311 crit build; both Inherent Skills +
// every sequence node (standardCharacter — see file header) alongside resonator + talents
export const VERINA_LOADOUT = new Loadout(
  VERINA,
  false,
  VERINA_TALENTS,
  VR_INHERENT_1,
  VR_INHERENT_2,
  [VARIATION],
  [new EchoLoadout(FALLACY, REJUV_5PC, REJUV_2PC)],
  [mainstats("ATK", "ER ER", "atk atk")],
  chem("atk", "liberation"),
  VR_OPENER, VR_LOOP,
  VERINA_S1,
  VERINA_S2,
  VERINA_S3,
  VERINA_S4,
  VERINA_S5,
  VERINA_S6,
);
