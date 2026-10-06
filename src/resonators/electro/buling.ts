/**
 * Buling, ported to the new engine — sequence-0 core loop, except sequences 1-6 (see below). An
 * electro Rectifier support/healer built around Trigram, a real store (TRIGRAMS below, Phrolova's
 * Volatile Notes shape): four two-bit slots oldest-first, 1 Mountain and 2 Thunder, a gain at
 * capacity shifting the rest left and dropping the leftmost. Basic Attack Stage 2 hits bank
 * Mountain, Stage 4 and Mid-air hits and the Resonance Skill bank Thunder, and the held Heavy is
 * one press that resolves off the two leftmost: Mountain then Thunder is Mountain Over Thunder,
 * Thunder then Mountain is Thunder Over Mountain (both Minor Yang), two of a kind Twin Mountains
 * or Twin Thunders (Minor Yin, healing only, 0 mv), fewer than two Ghost Gate Omen (the failed
 * divination — no hit, every Trigram lost). forte1 is the count the store holds (cap 4), so a
 * Heavy pressed short reads red. Holding both Minors trades them for Yin-Yang Balance, kept until
 * the Liberation, which is Flashing Thunder Spell: Harmony under it and the plain Flashing
 * Thunder Spell otherwise — the Array, and Thunder Spell with it, only come off Harmony.
 *
 * Thunder Spell: opened (Primordial Qi, stack 1) when Liberation generates the Array; the first
 * Intro Skill cast from *any* team member while held escalates everyone to Yin and Yang (stack 2,
 * +10% Skill DMG to whoever's active), the second to Heaven, Earth, Mind (stack 3, +25%) — a
 * team-wide watcher via `updateGlobal()`, same shape Sigrika's own Blessing of Runes uses.
 *
 * Numbers from nanoka.cc (character 1307) at skill level 10. Energy Regen isn't published there,
 * so every action's own `energy` is the migrated (old-engine) sheet's number, ÷100 — confirmed
 * against the page's own Concerto Regen and Resonance Cost (150, `maxEnergy` below), which
 * matched the same sheet ÷100 everywhere they overlap. `offtune` isn't published either and has
 * no equivalent in the old sheet — left unset (0), a real gap, not a rounding shortcut.
 *
 * Sequences 1-6, each its own always-equipped gear, all in the default loadout — by explicit
 * instruction, same one-off exception Encore's own file documents:
 *  S1 +20% Crit Rate on Flashing Thunder Spell: Harmony.
 *  S2 25 Energy on entering Yin-Yang Balance, every 24s (ICD not modelled).
 *  S3 heals the team below 50% HP — out of scope, no-op.
 *  S4 flat +20% Healing Bonus, unused by the formula, tracked for completeness.
 *  S5 the Array inflicts 6 more Electro Flare the moment it is generated.
 *  S6 Heaven, Earth, Mind grants 50% Resonance Skill DMG Bonus instead of 25% — its own +25 on top.
 */
import { Tier, Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, coordinatedBuff } from "../../engine/gear.js";
import {
  applyTeam,
  applyCurrent,
  stacksOfTeam,
  isHeld,
  casting, addGain,
  runningAction,
  runningAnyOf,
  currentHit,
  addStat,
  revokeCurrent,
  revokeTeam,
  isActive,
  setStacksSelf,
  stacksOf,
  frozenStacks,
  currentTeam,
  asSource,
  queue,
  cancelHits,
} from "../../engine/context.js";
import { Action, ActionField, Cooldown, Rotation, NOINTRO, ECHO, ActionGroup, INTRO, OUTRO } from "../../engine/rotation.js";
import type { BulletDef } from "../../engine/rotation.js";
import { HEALS, heal, inflictElectroFlare } from "../../shared/status.js";
import { VARIATION } from "../../weapons/standard.js";
import { REJUV_5PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { FORMLESS_DEMON, TINGED_YEARNING_5PC } from "../../echoes/mengzhou.js";
import { JINHSI_RESONATOR } from "../spectro/jinhsi.js";
import { SUOMING_RESONATOR } from "./suoming.js";
import { HSIN_RESONATOR } from "./hsin.js";
import { mainstats, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function bulingAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

/** Pure state markers, no stat of their own — both are consumed the instant she holds both at
 *  once (the Heavy forms' consume bullet), entering Yin-Yang Balance. */
const MINOR_YANG = new Buff({ name: "Buling: Minor Yang" });
const MINOR_YIN = new Buff({ name: "Buling: Minor Yin" });

/** Held from the Heavy that completes the pair until the Liberation, which it upgrades to Harmony
 *  (the Liberation resolver below, and Harmony's own gate) — and which spends it. S2's own +25 Energy reads it too. */
const YIN_YANG_BALANCE = new Buff({ name: "Buling: Yin-Yang Balance" });

// a hit that banks a Trigram (gainTrigram() below), on hit: the store takes the kind, forte1 the count
const MOUNTAIN = { updateDebuffs: () => gainTrigram(1) };
const THUNDER = { updateDebuffs: () => gainTrigram(2) };

// --- basics, mid-air, dodge counter (Hexagram Calls, Lightning Falls) — Stage 2 banks Trigram:
//     Mountain, Stage 4 and Mid-air bank Trigram: Thunder
const BA1 = bulingAction("Basic - Hexagram Calls, Lightning Falls 1", { animFrames: 28, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, commitFrame: 8, mv: 2073, energy: 53, concerto: 167, offtune: 1668 },
    { hitFrame: 20, commitFrame: 8, mv: 2073, energy: 53, concerto: 167, offtune: 1668 },
  ]});
const BA2 = bulingAction("Basic - Hexagram Calls, Lightning Falls 2", { animFrames: 45, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 8, commitFrame: 2, mv: 3345, energy: 85, concerto: 270, offtune: 2692,
      ...MOUNTAIN },
    { hitFrame: 15, commitFrame: 2, mv: 3345, energy: 85, concerto: 270, offtune: 2692 },
  ]});
const BA3 = bulingAction("Basic - Hexagram Calls, Lightning Falls 3", { animFrames: 31, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 1, mv: 2351, energy: 60, concerto: 190, offtune: 1892 },
    { hitFrame: 10, commitFrame: 1, mv: 2351, energy: 60, concerto: 190, offtune: 1892 },
  ]});
const BA4 = bulingAction("Basic - Hexagram Calls, Lightning Falls 4", { animFrames: 60, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 23, mv: 9364, energy: 236, concerto: 754, offtune: 7536 }], ...THUNDER });
const MA = bulingAction("Mid-air - Hexagram Calls, Lightning Falls Plunge", { animFrames: 46, animPriority: { 41: 3 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 39, mv: 7396, energy: 124, concerto: 496, offtune: 4960 }], ...THUNDER });
const DC = bulingAction("Dodge Counter - Hexagram Calls, Lightning Falls 3", { animFrames: 31, castPriority: 2, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 1, mv: 2351, energy: 60, concerto: 190, offtune: 1892 },
    { hitFrame: 10, commitFrame: 1, mv: 2351, energy: 60, concerto: 190, offtune: 1892 },
  ], castConcerto: 1000});

const BA12 = new ActionGroup("Basic - Hexagram Calls, Lightning Falls 12", [BA1, BA2])
// The held Heavy spends the two leftmost Trigrams (spendTrigrams(), which every form runs first)
// and is whichever form that pair makes — see HA below. Twin Mountains/Twin Thunders heal only
// (0 mv, healing out of scope). The mixed pair banks Minor Yang, the matched one Minor Yin (and
// heals — her own healing marker, read by every healing sonata and weapon, see statuses.ts);
// holding both at once trades the pair for Yin-Yang Balance.
const banksMinor = (minor: Buff, other: Buff): void => {
  spendTrigrams();
  applyCurrent(minor, 1);
  if (isHeld(other)) {
    revokeCurrent(MINOR_YANG);
    revokeCurrent(MINOR_YIN);
    applyCurrent(YIN_YANG_BALANCE, 1);
  }
};
// all of it, the 15 Concerto and the 2-Trigram spend land on wuwalab's frame-40 consume, not the cast
const consume = (effect: () => void) => ({ hitFrame: 40, concerto: 1500, forte1: -2, element: null, type: null, subtype: null, updateDebuffs: effect });
const YANG = consume(() => banksMinor(MINOR_YANG, MINOR_YIN));
const HA_MOUNTAIN_OVER_THUNDER = bulingAction("Heavy - Mountain Over Thunder", { minForte1: 2, animFrames: 70, animPriority: { 70: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [YANG, { hitFrame: 46, commitFrame: 40, mv: 17893, energy: 300, offtune: 8000 }] });
const HA_THUNDER_OVER_MOUNTAIN = bulingAction("Heavy - Thunder Over Mountain", { minForte1: 2, animFrames: 70, animPriority: { 70: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [YANG, { hitFrame: 46, commitFrame: 40, mv: 8947, energy: 300, offtune: 8000 }] });
// the heal lands with the consume (wuwalab's heals[0] at 40)
const HA_TWIN_MOUNTAINS = bulingAction("Heavy - Twin Mountains", { minForte1: 2, animFrames: 60, animPriority: { 60: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, bullets: [
    consume(() => {
      banksMinor(MINOR_YIN, MINOR_YANG);
      applyCurrent(HEALS, 1);
    }),
  ]});
// its first heal on the consume, then 7 more a second apart (wuwalab: 40 to 460, eight in all)
const HA_TWIN_THUNDERS = bulingAction("Heavy - Twin Thunders", { minForte1: 2, animFrames: 60, animPriority: { 60: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, bullets: [
    consume(() => {
      banksMinor(MINOR_YIN, MINOR_YANG);
      applyCurrent(HEALS, 1);
      applyTeam(TWIN_THUNDERS_HEALS, 7);
    }),
  ]});
/** Twin Thunders' heals after its first — each tick her healing marker. */
const TWIN_THUNDERS_HEALS = coordinatedBuff("Buling: Twin Thunders (heals)", 7, () => BULING_RESONATOR, heal);
/** The failed divination — held with fewer than two Trigrams: no hit, and every Trigram lost
 *  (the 20% HP it costs is out of scope). */
const GhostGateOmen = bulingAction("Heavy - Ghost Gate Omen", { castPriority: 2,
  maxForte1: 1, node: Node.Normal, cast: Cast.Heavy, resetForte1: true,
  updateBuffs: () => setStacksSelf(TRIGRAMS, 1 << 8),
});
/** The one Heavy a rotation writes: resolved off the store's two leftmost Trigrams when the row
 *  is reached, the way an Intro is. */
const HEAVY_FORMS = new Set<Action>([HA_MOUNTAIN_OVER_THUNDER, HA_THUNDER_OVER_MOUNTAIN, HA_TWIN_MOUNTAINS, HA_TWIN_THUNDERS]);
const HA = new Action("Heavy - Trigram", {
  resolve: () => {
    const word = stacksOf(TRIGRAMS), a = word & 3, b = (word >> 2) & 3;
    if (!a || !b) return GhostGateOmen;
    if (a === b) return a === 1 ? HA_TWIN_MOUNTAINS : HA_TWIN_THUNDERS;
    return a === 1 ? HA_MOUNTAIN_OVER_THUNDER : HA_THUNDER_OVER_MOUNTAIN;
  },
});

// banks a Trigram: Thunder on cast
const Skill = bulingAction("Skill - In Shadow Thunder Stirs", { animFrames: 53, animPriority: { 47: 2 }, castPriority: 4, cooldown: 60 * 15, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 9, commitFrame: 0, mv: 5840, energy: 750, offtune: 3916 },
    { hitFrame: 60, commitFrame: 0, mv: 584, energy: 75, offtune: 392 },
    { hitFrame: 84, commitFrame: 0, mv: 584, energy: 75, offtune: 392 },
    { hitFrame: 108, commitFrame: 0, mv: 584, energy: 75, offtune: 392 },
    { hitFrame: 132, commitFrame: 0, mv: 584, energy: 75, offtune: 392 },
    { hitFrame: 156, commitFrame: 0, mv: 584, energy: 75, offtune: 392 },
    { hitFrame: 180, commitFrame: 0, mv: 584, energy: 75, offtune: 392 },
    { hitFrame: 204, commitFrame: 0, mv: 584, energy: 75, offtune: 392 },
    { hitFrame: 228, commitFrame: 0, mv: 584, energy: 75, offtune: 392 },
    { hitFrame: 252, commitFrame: 0, mv: 584, energy: 75, offtune: 392 },
    { hitFrame: 276, commitFrame: 0, mv: 584, energy: 75, offtune: 392 },
  ], castConcerto: 2300, updateBuffs: () => gainTrigram(2) });

// The Liberation is Harmony under Yin-Yang Balance — generating the Array, opening/refreshing
// Thunder Spell at Primordial Qi — and the plain Flashing Thunder Spell otherwise, which does
// neither. Resolved on its row, the way the Heavy is.
/** Both Liberation forms draw on the one 24s cooldown. */
const LIB_CD = new Cooldown({ frames: 60 * 24 });
const Harmony = bulingAction("Liberation - Flashing Thunder Spell - Harmony", {
  requireBuff: YIN_YANG_BALANCE, animFrames: 244, animPriority: { 238: 2 }, castPriority: 10, timestop: [0, 231], motionStop: [0, 187],
  cooldown: LIB_CD,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [
    // S5: the Array's 6 more Electro Flare the moment it is generated, at frame 0
    { hitFrame: 0, element: null, type: null, subtype: null, updateDebuffs: () => { if (isHeld(BL_S5)) inflictElectroFlare(6); } },
    { hitFrame: 187, mv: 53679, offtune: 72000 },
  ], castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => {
    for (const stage of THUNDER_SPELL_STAGES) revokeTeam(stage);
    applyTeam(PRIMORDIAL_QI, 1);
    revokeCurrent(YIN_YANG_BALANCE);
    // only one array at a time: a fresh cast sets it again, whatever the last had left
    cancelHits(ARRAYS);
    applyTeam(FIVE_THUNDERS_ARRAY, 1);
    queue(FiveThundersArray);
  },
});
const FlashingThunderSpell = bulingAction("Liberation - Flashing Thunder Spell", {
  animFrames: 244, animPriority: { 238: 2 }, castPriority: 10, timestop: [0, 231], motionStop: [0, 187],
  cooldown: LIB_CD,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 187, mv: 35786, offtune: 36000 }], castConcerto: 2000, resetEnergy: true,
});
/** The one Liberation a rotation writes, resolved on its row the way the Heavy is: Harmony while
 *  she holds Yin-Yang Balance, the plain cast otherwise. */
const LIB = new Action("Lib", {
  resolve: () => (isHeld(YIN_YANG_BALANCE) ? Harmony : FlashingThunderSpell),
});

/** Her Array: one action set at Harmony's frame 0, its twelve 19.89% pulls (2 Electro Flare each)
 *  its own bullets on her slot whoever is on field — wuwalab's 271 to 1591; the last takes it down. */
function arrayPulls(): BulletDef[] {
  const out: BulletDef[] = [];
  for (let k = 0; k < 11; k++) out.push({ hitFrame: 271 + 120 * k, mv: 1989, updateDebuffs: () => inflictElectroFlare(2) });
  out.push({
    hitFrame: 1591, mv: 1989,
    updateDebuffs: () => {
      inflictElectroFlare(2);
      revokeTeam(FIVE_THUNDERS_ARRAY);
    },
  });
  return out;
}
// a summon beside the fight (FIELD): what reads `field` passes its pulls over (Cantarella's Hazy Dream)
const FIVE_THUNDERS = new ActionField("Buling: Five Thunders Spell Array");
const FiveThundersArray = bulingAction("Liberation - Five Thunders Spell Array", {
  node: Node.Forte, type: Type.Liberation, bullets: arrayPulls(), field: FIVE_THUNDERS,
});
const ARRAYS = new Set<Action>([FiveThundersArray]);

const Intro = bulingAction("Intro - Summon and Smite", {
  qteFrames: 7, animFrames: 80, noSwapFrames: 59, animPriority: { 70: 2 }, castPriority: 11, motionStop: [7, 60],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    // her team heal, at the cast (wuwalab's heals[0])
    { hitFrame: 0, element: null, type: null, subtype: null, updateDebuffs: () => applyCurrent(HEALS, 1) },
    { hitFrame: 61, commitFrame: 7, mv: 13110, offtune: 8792, updateDebuffs: () => inflictElectroFlare(4) },
  ], castConcerto: 1000,
});
const Outro = bulingAction("Outro - Exorcism Spell", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => {
    applyTeam(BULING_OUTRO, 1);
    applyTeam(EXORCISM_HEALS, 16);
  },
});
/** Exorcism Spell heals the active resonator once a second for 16s, credited to her. */
const EXORCISM_HEALS = coordinatedBuff("Buling: Outro (heals)", 16, () => BULING_RESONATOR, heal);

/* ------------------------------------------------------------------------------------ buffs */

/** Thunder Spell's three stages, a buff each: opened at Primordial Qi by Harmony, stepped up to
 *  the next by every Intro, and standing only while the Array does — gone on the first action
 *  after its last pull. Paid out only to whoever's active. */
function thunderSpell(stage: string, next: (() => Buff) | null, pay: () => void): Buff {
  const self: Buff = new Buff({
    name: `Buling: Thunder Spell - ${stage}`,
    updateGlobal: () => {
      if (!stacksOfTeam(FIVE_THUNDERS_ARRAY)) {
        revokeTeam(self);
        return;
      }
      if (next && casting(Cast.Intro)) {
        revokeTeam(self);
        applyTeam(next(), 1);
      }
    },
    applyStats: () => {
      if (isActive()) pay();
    },
  });
  return self;
}
const HEAVEN_EARTH_MIND = thunderSpell("Heaven, Earth, Mind", null, () => {
  addStat(Stat.DmgBonus, 25, Type.Skill);
  if (currentTeam().slots.find((m) => m.resonator === BULING_RESONATOR)?.isHeld(BL_S6)) {
    asSource(BL_S6, () => addStat(Stat.DmgBonus, 25, Type.Skill));
  }
});
const YIN_AND_YANG = thunderSpell("Yin and Yang", () => HEAVEN_EARTH_MIND, () => addStat(Stat.DmgBonus, 10, Type.Skill));
const PRIMORDIAL_QI = thunderSpell("Primordial Qi", () => YIN_AND_YANG, () => 0);
const THUNDER_SPELL_STAGES = [PRIMORDIAL_QI, YIN_AND_YANG, HEAVEN_EARTH_MIND];

/** The Array standing: from Harmony's frame 0 to its last pull — what Thunder Spell above lives by. */
const FIVE_THUNDERS_ARRAY = new Buff({ name: "Buling: Five Thunders Spell Array", field: FIVE_THUNDERS });

/** The Trigram store, one packed word: bits 0-7 are four two-bit slots oldest-first (1 Mountain,
 *  2 Thunder), bit 8 always set so an empty store is still a held buff. Hers from combat start;
 *  the display reads the slots off as she stands. */
const TRIGRAMS = new Buff({
  name: "Buling: Trigrams", maxStacks: 0x1ff,
  display: (): string => {
    let slots = "";
    for (let shift = 0; shift < 8; shift += 2) slots += "-MT"[(frozenStacks() >> shift) & 3]!;
    return `Buling: Trigrams [${slots}]`;
  },
});

/** Bank one Trigram — 1 Mountain, 2 Thunder — into the store's first empty slot, and the count
 *  into forte1. Gated on a landed hit ("obtained when ... deals damage"; the Skill's is on cast,
 *  and it hits anyway). At four held, every Trigram shifts left, the leftmost is dropped and the
 *  new one takes the last slot — the count stands. */
function gainTrigram(kind: number): void {
  const word = stacksOf(TRIGRAMS);
  let trigrams = word & 0xff, n = 0;
  while (n < 4 && (trigrams >> (2 * n)) & 3) n++;
  if (n === 4) { trigrams >>= 2; n = 3; } else addGain({ forte1: 1 });
  setStacksSelf(TRIGRAMS, (word & ~0xff) | trigrams | (kind << (2 * n)));
}

/** A Heavy form spends the store's two leftmost Trigrams — the pair HA resolved it from. */
function spendTrigrams(): void {
  const word = stacksOf(TRIGRAMS);
  setStacksSelf(TRIGRAMS, (word & ~0xff) | ((word & 0xff) >> 4));
}

/** +15% (unscoped) DMG Amplification, 30s — permanent uptime once granted. */
const BULING_OUTRO = new Buff({
  name: "Buling: Outro",
  duration: 60 * 30,
  stats: [[Stat.Amp, 15]],
});

/** +25% Healing Bonus while healing an ally under 50% HP — no ally-HP tracking, named marker only. */
const BL_INHERENT_1 = new Inherent({ name: "Inherent: Time Arrives, Evil Declines" });

/** The source of Intro's own 4 Electro Flare stacks (declared on the Intro action). */
const BL_INHERENT_2 = new Inherent({ name: "Inherent: Earthly Immortal is Here!" });

/* ------------------------------------------------------------------------------- sequences */

const BL_S1 = new Sequence({
  name: "Buling S1",
  applyStats: () => { if (runningAction(Harmony)) addStat(Stat.CritRate, 20); }
});

const BL_S2 = new Sequence({
  name: "Buling S2",
  // on the consume that completed the pair (it clears both Minors); a later one has just banked one
  updateDebuffs: () => {
    if (!runningAnyOf(HEAVY_FORMS) || currentHit().index !== 0) return;
    if (isHeld(YIN_YANG_BALANCE) && !isHeld(MINOR_YANG) && !isHeld(MINOR_YIN)) addGain({ energy: 2500 });
  },
});

const BL_S3 = new Sequence({ name: "Buling S3" });

const BL_S4 = new Sequence({
  name: "Buling S4",
  stats: [[Stat.HealingBonus, 20]],
});

/** The Array inflicts 6 more Electro Flare the moment it is generated: Harmony's frame-0 bullet. */
const BL_S5 = new Sequence({ name: "Buling S5" });

const BL_S6 = new Sequence({
  name: "Buling S6",
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit.
// Healing Bonus+ nodes are unused by the formula (healing out of scope), tracked for completeness.
const BULING_TALENTS = new Talent({
  name: "Buling: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.HealingBonus, 12]],
});

const BULING_RESONATOR = new Resonator({
  name: "Buling",
  talent: BULING_TALENTS,
  inherent1: BL_INHERENT_1,
  inherent2: BL_INHERENT_2,
  tier: Tier.Free,
  element: Attribute.Electro,
  weapon: WeaponType.Rectifier,
  color: "#7a6ff0",
  intro: Intro,
  outro: Outro,
  maxEnergy: 15000,
  maxForte1: 4,

  // the Trigram store, empty (its always-set bit alone; see TRIGRAMS)
  combatStart: () => applyCurrent(TRIGRAMS, 1 << 8),

  stats: [[Stat.BaseHp, 10625], [Stat.BaseAtk, 225], [Stat.BaseDef, 1258.8866]],
});

// the kit-valid line: Mid-air banks Thunder, Basic 2 Mountain, and the Heavy reads [T, M] as
// Thunder Over Mountain for Minor Yang; Skill and Basic 4 bank two Thunders and the Heavy reads
// [T, T] as Twin Thunders for Minor Yin — Yin-Yang Balance, so the Liberation resolves to Harmony.
const BL_ROTATION = new Rotation([
  NOINTRO,
  INTRO.mashCancel(),
  Skill, BA4.jumpCancel(), MA, BA12.instaCancel(), HA, HA.cancel(), ECHO.instaDodge(), // TODO maybe cancel HA?
  LIB, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat, all six sequences (by explicit instruction — see file header)
export const BULING = new Loadout({
  resonator: BULING_RESONATOR,
  weapons: [VARIATION],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC),
    // Tinged Yearning's extra ATK is for whoever obtains or responds to a Unison
    new EchoLoadout(FORMLESS_DEMON, TINGED_YEARNING_5PC).requires(JINHSI_RESONATOR, SUOMING_RESONATOR, HSIN_RESONATOR),
  ],
  mainstats: [mainstats(Mainstat.CD4, Mainstat.ER3, Mainstat.ER3, Mainstat.ATK1, Mainstat.ATK1)],
  substat: substats(Substat.Er, Substat.CritRate, Substat.CritDmg, Substat.Liberation, Substat.AtkPct, Substat.Basic),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.Liberation, Substat.AtkPct, Substat.Basic, Substat.Heavy),
  rotation: BL_ROTATION,
  sequences: [BL_S1, BL_S2, BL_S3, BL_S4, BL_S5, BL_S6],
});
