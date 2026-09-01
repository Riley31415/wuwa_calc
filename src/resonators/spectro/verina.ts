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
import {
  Buff, Talent, Inherent, Sequence, Resonator, Tier, Loadout, EchoLoadout, Stat, Attribute, WeaponType, Type1,
  Type2, Cast, Node, Scaling, applyTeam, revokeTeam, applyEnemy, isHeld, casting, currentAction,
  addStat, queue, applyCurrent,
} from "../../kit.js";
import { Action, Rotation, NOINTRO, INTRO, ECHO_SWAP, OUTRO, JUMP, ActionField } from "../../rotation.js";
import { coordinatedBuff } from "../../shared/helpers.js";
import { HEALS } from "../../shared/status.js";
import { VARIATION } from "../../weapons/standard.js";
import { REJUV_5PC, REJUV_2PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { mainstats, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { SPACETREK_EXPLORER, STARRY_RADIANCE_2PC, STARRY_RADIANCE_5PC } from "../../echoes/lahairoi.js";

/* ----------------------------------------------------------------------------------- actions */

function verinaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune come off nanoka's own Damage Data table; BA3/MA3 are each multiple
// repeated hits folded into one action, same as their own mv already was.
const BA1 = verinaAction("Basic - Cultivation 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 37.86, energy: 0.95, concerto: 3.04, offtune: 7600 });
const BA2 = verinaAction("Basic - Cultivation 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 51.16, energy: 1.28, concerto: 4.11, offtune: 10200 });
const BA3 = verinaAction("Basic - Cultivation 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 51.16, energy: 1.28, concerto: 4.11, offtune: 10200 });
const BA4 = verinaAction("Basic - Cultivation 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 67.32, energy: 1.69, concerto: 5.41, offtune: 13600 });
const BA5 = verinaAction("Basic - Cultivation 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 71.62, energy: 1.8, concerto: 5.76, offtune: 14400, forte1: 1 });
const HA = verinaAction("Heavy - Cultivation", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 99.41, energy: 2.5, concerto: 8, offtune: 20000 });
const MA1 = verinaAction("Basic - Cultivation 1 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 56.37, energy: 1.41, concerto: 4.53, offtune: 11340 });
const MA2 = verinaAction("Basic - Cultivation 2 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 53.19, energy: 1.33, concerto: 4.28, offtune: 10700 });
const MA3 = verinaAction("Basic - Cultivation 3 (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 76.26, energy: 1.89, concerto: 6.12, offtune: 15342 });
const MHA = verinaAction("Heavy - Cultivation (Mid-air)", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 61.64, energy: 0.51, concerto: 1, offtune: 12400 });
const DC = verinaAction("Basic - Cultivation (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 129.23, energy: 3.25, concerto: 15.6, offtune: 14000 });

// base gain only — S2's own extra Photosynthesis Energy/Energy is traced separately (VERINA_S2)
const Skill = verinaAction("Skill - Botany Experiment", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 178.95, energy: 15, concerto: 30, offtune: 26600, forte1: 1 });

/** Starflower Blooms spends a Photosynthesis Energy stack "to recover Concerto Energy" — the
 *  Forte Circuit's own `"Photosynthesis Energy" Concerto Regen = 12` row, which has no damage row
 *  of its own to hang off so nanoka's per-hit figures never carry it. Once per Starflower cast,
 *  not once per mid-air stage: the gauge is spent once for the whole combo (see the actions'
 *  own note), so only the Heavy and the mid-air's own stage 1 pay out. */
const STARFLOWER_CONCERTO = { updateDebuffs: () => {
  addStat(Stat.AddConcerto, 12);
  applyCurrent(HEALS, 1);
}};

// Starflower Blooms spends 1 Photosynthesis Energy either way, heals
const StarflowerHeavy = verinaAction("Forte Heavy - Starflower Blooms", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 162.37, energy: 2.91, concerto: 4.66, offtune: 14600, forte1: -1, ...STARFLOWER_CONCERTO });
// Mid-air Starflower Blooms is its own 3-stage combo (same shape as the MA1-3 chain it replaces);
// only stage 1 banks the forte spend/heal, since the Forte Gauge is spent once for the whole combo.
const ForteMidair1 = verinaAction("Forte Basic - Starflower Blooms (Mid-Air) 1",
    { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 67.64, energy: 1.41, concerto: 4.53, offtune: 11340, forte1: -1, ...STARFLOWER_CONCERTO });
const ForteMidair2 = verinaAction("Forte Basic - Starflower Blooms (Mid-Air) 2",
    { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 63.82, energy: 1.33, concerto: 4.28, offtune: 10700, forte1: -1, ...STARFLOWER_CONCERTO });
const ForteMidair3 = verinaAction("Forte Basic - Starflower Blooms (Mid-Air) 3",
    { node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 30.50 * 3, energy: 1.89, concerto: 6.12, offtune: 15342, forte1: -1, ...STARFLOWER_CONCERTO });

// Arboreal Flourish places Photosynthesis Mark on the enemy (see file header), heals
const Liberation = verinaAction("Liberation - Arboreal Flourish", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 198.81, concerto: 20, resetEnergy: true,
  updateBuffs: () => applyEnemy(PHOTOSYNTHESIS_MARK, 12),
});
/** One Coordinated Attack tick — the mark's own per-action proc, and S6's single-hit reuse. It
 *  banks nothing: nanoka's damage row (1503031013) and wuwalab's per-hit entry both give 0
 *  energy/concerto/off-tune — the 1.46/4.04/20000 the old x12 lump declared match neither source
 *  and are dropped, not divided up. Each tick heals: VERINA_RESONATOR's own HEALS list names it. */
const PHOTOSYNTHESIS_FIELD = new ActionField("Verina: Photosynthesis Mark");
const PhotosynthesisTick = verinaAction("Liberation - Photosynthesis Mark", {
  node: Node.Liberation, type: Type1.Basic, type2: Type2.Coordinated, mv: 9.95, active: false, field: PHOTOSYNTHESIS_FIELD,
});
/** S6's one-off reuse of the same hit — her own follow-up off her own combo, not the mark's, so
 *  this copy names no field and stays out of the report's field row. */
const S6Tick = PhotosynthesisTick.variant("Liberation - Photosynthesis Mark", { field: null });

const Intro = verinaAction("Intro - Verdant Growth", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 99.41, energy: 10, concerto: 10, offtune: 11230, forte1: 1 });
/** Blossom: no damage of its own, just the outro handoff, the Gift of Nature/S4 trigger and
 *  (skipped) healing. */
const Outro = verinaAction("Outro - Blossom", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => applyTeam(VERINA_OUTRO, 1),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Gift of Nature (Inherent Skill) — see the file header for why this ends on her own next Intro
 *  rather than outro. Still pays out on that Intro itself: convertStats() revokes only after applyStats() has. */
const GIFT_OF_NATURE = new Buff({
  name: "Verina: Gift of Nature",
  applyStats: () => addStat(Stat.BonusAtk, 20),
  // granted from VERINA_RESONATOR's own updateBuffs() below since a global buff's own updateBuffs() can't fire before
  // it's held once, and the Resonator itself is always self-held from team setup
  convertStats: () => { if (casting(Cast.Intro) && isHeld(VERINA_RESONATOR)) revokeTeam(GIFT_OF_NATURE); },
});
/** Gift of Nature's own trigger — always-equipped Inherent Skill piece. */
const VR_INHERENT_1 = new Inherent({
  name: "Verina: Gift of Nature",
  updateBuffs: () => {
    const a = currentAction();
    if (a === StarflowerHeavy || a === ForteMidair1 || a === Liberation || a === Outro) applyTeam(GIFT_OF_NATURE, 1);
  },
});

const VR_INHERENT_2 = new Inherent({ name: "Verina: Grace of Life" }); // revive teammate


/** Blossom's own team-wide DMG Amp — 30s is past the 21s permanent-uptime threshold, so it's
 *  granted once and never revoked. The 19% ATK/s heal to the incoming Resonator is out of scope
 *  for the formula (her Outro already puts up the HEALS marker). */
const VERINA_OUTRO = new Buff({
  name: "Verina: Blossom",
  applyStats: () => addStat(Stat.Amp, 15),
});

/** Photosynthesis Mark: a genuine debuff on the enemy, 12 stacks that are the mark's own 12s —
 *  one Coordinated tick drawn per qualifying action at the marked target. */
const PHOTOSYNTHESIS_MARK = coordinatedBuff("Verina: Photosynthesis Mark", 12, () => VERINA_RESONATOR, PhotosynthesisTick, { enemy: true });

/** S2 Sprouting Reflections: Botany Experiment's own +1 Photosynthesis Energy/+10 Energy on top
 *  of its base gain. */
const VERINA_S2 = new Sequence({
  name: "Verina S2: Sprouting Reflections",
  applyStats: () => { if (currentAction() === Skill) { addStat(Stat.AddForte1, 1); addStat(Stat.AddConcerto, 10); } },
});

/** S4 Blossoming Embrace: the trigger lives here; the payout is `S4_TEAM` (permanent uptime once
 *  granted, per the standing duration rule). */
const VERINA_S4 = new Sequence({
  name: "Verina S4: Blossoming Embrace",
  updateBuffs: () => {
    const a = currentAction();
    // ForteMidair1 stands in for "cast Starflower Blooms (Mid-Air)" — only needs to trigger once
    if (a === StarflowerHeavy || a === ForteMidair1 || a === Liberation || a === Outro) applyTeam(S4_TEAM, 1);
  },
});
const S4_TEAM = new Buff({
  name: "Verina S4: Blossoming Embrace", applyStats: () => addStat(Stat.DmgBonus, 15, Attribute.Spectro),
});

/** S6 Joyous Harvest: Starflower Blooms deals +20% more DMG and also triggers one Coordinated
 *  Attack — the same single-hit value Photosynthesis Mark's own periodic proc has. */
const VERINA_S6 = new Sequence({
  name: "Verina S6: Joyous Harvest",
  // the DMG boost lands on every Mid-air stage; the Coordinated Attack triggers once per combo
  applyStats: () => {
    const a = currentAction();
    if (a === StarflowerHeavy || a === ForteMidair1 || a === ForteMidair2 || a === ForteMidair3) {
      addStat(Stat.DmgBonus, 20);
      queue(S6Tick);
    }
  },
});

// S1 Moment of Emergence, S3 The Choice to Flourish, S5 Miraculous Blooms — healing-only,
// do-nothing gear pieces held for the name only (see file header)
const VERINA_S1 = new Sequence({ name: "Verina S1: Moment of Emergence" });
const VERINA_S3 = new Sequence({ name: "Verina S3: The Choice to Flourish" });
const VERINA_S5 = new Sequence({ name: "Verina S5: Miraculous Blooms" });

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. `Tier.Standard` — see the file header. */
const VERINA_RESONATOR = new Resonator({
  name: "Verina",
  element: Attribute.Spectro,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  outro: () => Outro,
  color: "#8fe08f",
  maxEnergy: 175, // her own real 175%, not the generic 125% default — matches Shorekeeper's own

  tier: Tier.Standard,

  updateDebuffs: () => {
    const a = currentAction();
    // her own healing marker, read by every healing sonata and weapon (statuses.ts) —
    // applied to the healer alone, never the team
    if (a === StarflowerHeavy || a === ForteMidair1 || a === ForteMidair2 || a === ForteMidair3 || a === Liberation || a === PhotosynthesisTick || a === S6Tick || a === Outro) applyCurrent(HEALS, 1);
  },

  constantStats: () => {
    addStat(Stat.BaseHp, 14238); addStat(Stat.BaseAtk, 338); addStat(Stat.BaseDef, 1100);
  },
});

// stat-tree bonus alone — Healing Bonus+ unused by the formula (healing out of scope), kept for
// completeness only
const VERINA_TALENTS = new Talent({
  name: "Verina: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.HealingBonus, 12); }
});

const VR_LOOP = new Rotation([
  NOINTRO, Skill, Liberation,
  JUMP,
  ForteMidair1, ForteMidair2,
  ECHO_SWAP, OUTRO,
  INTRO, Skill, Liberation,
  JUMP,
  ForteMidair1,
  ECHO_SWAP, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real support/healer spread rather than the usual 43311 crit build; both Inherent Skills +
// every sequence node (Tier.Standard — see file header) alongside resonator + talents
export const VERINA = new Loadout({
  resonator: VERINA_RESONATOR,
  talent: VERINA_TALENTS,
  inherent1: VR_INHERENT_1,
  inherent2: VR_INHERENT_2,
  weapons: [VARIATION],
  echoLoadouts: [new EchoLoadout(FALLACY, REJUV_5PC, REJUV_2PC),
      new EchoLoadout(SPACETREK_EXPLORER, STARRY_RADIANCE_5PC, STARRY_RADIANCE_2PC),],
  mainstats: [mainstats(Mainstat.ATK4, Mainstat.ER3, Mainstat.ER3, Mainstat.ATK1, Mainstat.ATK1)],
  substat: chem("atk", "liberation"),
    rotation: VR_LOOP,
  sequences: [VERINA_S1, VERINA_S2, VERINA_S3, VERINA_S4, VERINA_S5, VERINA_S6],
});
