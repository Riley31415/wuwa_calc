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
 *  S1 +20% Crit Rate on Flashing Thunder Spell: Harmony and its own Array (scoped to Liberation
 *     DMG so both pick it up without a trigger).
 *  S2 25 Energy on entering Yin-Yang Balance, every 24s (ICD not modelled).
 *  S3 heals the team below 50% HP — out of scope, no-op.
 *  S4 flat +20% Healing Bonus, unused by the formula, tracked for completeness.
 *  S5 the Array inflicts 6 more Electro Flare the moment it is generated.
 *  S6 Heaven, Earth, Mind grants 50% Resonance Skill DMG Bonus instead of 25% — read by THUNDER_SPELL.
 */
import { Tier, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyTeam,
  applyCurrent,
  stacksOfTeam,
  isHeld,
  casting,
  currentAction,
  runningAction,
  currentTeam,
  addStat,
  revokeCurrent,
  revokeTeam,
  isActive,
  setStacksSelf,
  stacksOf,
  frozenStacks,
} from "../../engine/context.js";
import { Action, ActionField, Rotation, NOINTRO, INTRO, ECHO_CANCEL, OUTRO, JUMP } from "../../engine/rotation.js";
import { HEALS, inflictElectroFlare } from "../../shared/status.js";
import { coordinatedBuff } from "../../shared/helpers.js";
import { VARIATION } from "../../weapons/standard.js";
import { REJUV_5PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { mainstats, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function bulingAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// a hit that banks a Trigram (gainTrigram() below): the store takes the kind, forte1 the count
const MOUNTAIN = { updateBuffs: () => gainTrigram(1) };
const THUNDER = { updateBuffs: () => gainTrigram(2) };

// --- basics, mid-air, dodge counter (Hexagram Calls, Lightning Falls) — Stage 2 banks Trigram:
//     Mountain, Stage 4 and Mid-air bank Trigram: Thunder
const BA1 = bulingAction("Basic - Hexagram Calls, Lightning Falls 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 41.46, offtune: 3336, energy: 1.06, concerto: 3.34 });
const BA2 = bulingAction("Basic - Hexagram Calls, Lightning Falls 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 66.90, offtune: 5384, energy: 1.70, concerto: 5.40, ...MOUNTAIN });
const BA3 = bulingAction("Basic - Hexagram Calls, Lightning Falls 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 47.02, offtune: 3784, energy: 1.20, concerto: 3.80 });
const BA4 = bulingAction("Basic - Hexagram Calls, Lightning Falls 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 93.64, offtune: 7536, energy: 2.36, concerto: 7.54, ...THUNDER });
const MA = bulingAction("Mid-air - Hexagram Calls, Lightning Falls", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.96, offtune: 4960, energy: 1.24, concerto: 4.96, ...THUNDER });
const DC = bulingAction("Dodge Counter - Hexagram Calls, Lightning Falls 3", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 47.02, offtune: 3784, energy: 1.20, concerto: 13.80 });

// The held Heavy spends the two leftmost Trigrams (spendTrigrams(), which every form runs first)
// and is whichever form that pair makes — see HA below. Twin Mountains/Twin Thunders heal only
// (0 mv, healing out of scope). The mixed pair banks Minor Yang, the matched one Minor Yin (and
// heals — her own healing marker, read by every healing sonata and weapon, see statuses.ts);
// holding both at once trades the pair for Yin-Yang Balance.
const YANG = { updateBuffs: () => {
  spendTrigrams();
  applyCurrent(MINOR_YANG, 1);
  if (isHeld(MINOR_YIN)) { revokeCurrent(MINOR_YANG); revokeCurrent(MINOR_YIN); applyCurrent(YIN_YANG_BALANCE, 1); }
} };
const YIN = {
  updateDebuffs: () => applyCurrent(HEALS, 1),
  updateBuffs: () => {
    spendTrigrams();
    applyCurrent(MINOR_YIN, 1);
    if (isHeld(MINOR_YANG)) { revokeCurrent(MINOR_YANG); revokeCurrent(MINOR_YIN); applyCurrent(YIN_YANG_BALANCE, 1); }
  },
};
const HA_MOUNTAIN_OVER_THUNDER = bulingAction("Heavy - Mountain Over Thunder", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 178.93, offtune: 8000, energy: 3.00, concerto: 15, forte1: -2, ...YANG });
const HA_THUNDER_OVER_MOUNTAIN = bulingAction("Heavy - Thunder Over Mountain", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 89.47, offtune: 8000, energy: 3.00, concerto: 15, forte1: -2, ...YANG });
const HA_TWIN_MOUNTAINS = bulingAction("Heavy - Twin Mountains", { node: Node.Normal, cast: Cast.Heavy, concerto: 15, forte1: -2, ...YIN });
const HA_TWIN_THUNDERS = bulingAction("Heavy - Twin Thunders", { node: Node.Normal, cast: Cast.Heavy, concerto: 15, forte1: -2, ...YIN });
/** The failed divination — held with fewer than two Trigrams: no hit, and every Trigram lost
 *  (the 20% HP it costs is out of scope). */
const GhostGateOmen = bulingAction("Heavy - Ghost Gate Omen", {
  node: Node.Normal, cast: Cast.Heavy, resetForte1: true,
  updateBuffs: () => setStacksSelf(TRIGRAMS, 1 << 8),
});
/** The one Heavy a rotation writes: resolved off the store's two leftmost Trigrams when the row
 *  is reached, the way an Intro is. */
const HA = new Action("Heavy - Trigram", {
  resolve: () => {
    const word = stacksOf(TRIGRAMS), a = word & 3, b = (word >> 2) & 3;
    if (!a || !b) return GhostGateOmen;
    if (a === b) return a === 1 ? HA_TWIN_MOUNTAINS : HA_TWIN_THUNDERS;
    return a === 1 ? HA_MOUNTAIN_OVER_THUNDER : HA_THUNDER_OVER_MOUNTAIN;
  },
});

// banks a Trigram: Thunder on cast
const Skill = bulingAction("Skill - In Shadow Thunder Stirs", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 116.8, offtune: 7832, energy: 15.00, concerto: 23, ...THUNDER });

// The Liberation is Harmony under Yin-Yang Balance — generating the Array, opening/refreshing
// Thunder Spell at Primordial Qi — and the plain Flashing Thunder Spell otherwise, which does
// neither. Resolved on its row, the way the Heavy is.
const Harmony = bulingAction("Liberation - Flashing Thunder Spell - Harmony", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Liberation, mv: 536.79, offtune: 72000, concerto: 20, resetEnergy: true,
  updateBuffs: () => {
    revokeTeam(THUNDER_SPELL); applyTeam(THUNDER_SPELL, 1); revokeCurrent(YIN_YANG_BALANCE);
    // only one array at a time: a fresh cast starts its 24s over
    revokeTeam(FIVE_THUNDERS_ARRAY); applyTeam(FIVE_THUNDERS_ARRAY, 24);
  },
});
const FlashingThunderSpell = bulingAction("Liberation - Flashing Thunder Spell", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Liberation, mv: 357.86, offtune: 36000, concerto: 20, resetEnergy: true,
});
const Liberation = new Action("Liberation - Flashing Thunder Spell (either)", {
  resolve: () => (isHeld(YIN_YANG_BALANCE) ? Harmony : FlashingThunderSpell),
});

/** The Array's own pull: 19.89% mv and 2 Electro Flare every 2s for 24s (nanoka), twelve in all,
 *  each on her own slot whoever is on field. Energy is the migrated sheet's 25 over the whole
 *  window, split evenly — nanoka publishes none. */
const FIVE_THUNDERS = new ActionField("Buling: Five Thunders Spell Array");
const ArrayTick = bulingAction("Liberation - Five Thunders Spell Array", {
  type: Type1.Liberation, mv: 19.89, energy: 2.08, field: FIVE_THUNDERS,
  updateDebuffs: () => inflictElectroFlare(2),
});

const Intro = bulingAction("Intro - Summon and Smite", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 131.10, offtune: 8792, concerto: 10,
  updateDebuffs: () => inflictElectroFlare(4),
});
const Outro = bulingAction("Outro - Exorcism Spell", {
  cast: Cast.Outro, concerto: -100, swapOut: true,
  updateBuffs: () => applyTeam(BULING_OUTRO, 1),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Named for its own current stage rather than a stack count, same reasoning as Shorekeeper's
 *  Stellarealm. Paid out only to whoever's active. */
const THUNDER_SPELL_STAGE = ["Primordial Qi", "Yin and Yang", "Heaven, Earth, Mind"];
const THUNDER_SPELL = new Buff({
  name: "Buling: Thunder Spell", maxStacks: 3,
  display: (): string => `Buling: Thunder Spell - ${THUNDER_SPELL_STAGE[stacksOfTeam(THUNDER_SPELL) - 1]}`,
  // stands only while the Array does: gone on the first action after its last pull
  updateGlobal: () => {
    if (!stacksOfTeam(FIVE_THUNDERS_ARRAY)) { revokeTeam(THUNDER_SPELL); return; }
    if (casting(Cast.Intro) && stacksOfTeam(THUNDER_SPELL) < 3) applyTeam(THUNDER_SPELL, 1);
  },
  applyStats: () => {
    if (!isActive()) return;
    const stage = stacksOfTeam(THUNDER_SPELL);
    if (stage === 2) addStat(Stat.DmgBonus, 10, Type1.Skill);
    else if (stage >= 3) {
      // pays out on whoever's active, not necessarily Buling — S6 is her own local Sequence, so
      // it's read off her own slot specifically, found by resonator identity
      const buling = currentTeam().slots.find((s) => s.resonator === BULING_RESONATOR);
      addStat(Stat.DmgBonus, buling?.isHeld(BL_S6) ? 50 : 25, Type1.Skill);
    }
  },
});

/** The Array standing: 24 of the engine's seconds, one pull every second of them (helpers.ts's
 *  own field window). Granted by the Liberation, and what Thunder Spell above lives by. */
const FIVE_THUNDERS_ARRAY = coordinatedBuff("Buling: Five Thunders Spell Array", 24, () => BULING_RESONATOR, ArrayTick, { every: 2 });

/** Pure state markers, no stat of their own — both are consumed the instant she holds both at
 *  once (the Heavy forms' own updateBuffs), entering Yin-Yang Balance. */
const MINOR_YANG = new Buff({ name: "Buling: Minor Yang" });
const MINOR_YIN = new Buff({ name: "Buling: Minor Yin" });

/** Held from the Heavy that completes the pair until the Liberation, which it upgrades to Harmony
 *  (the Liberation resolver above) — and which spends it. S2's own +25 Energy reads it too. */
const YIN_YANG_BALANCE = new Buff({ name: "Buling: Yin-Yang Balance" });

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
  if (!currentAction().mv) return;
  const word = stacksOf(TRIGRAMS);
  let trigrams = word & 0xff, n = 0;
  while (n < 4 && (trigrams >> (2 * n)) & 3) n++;
  if (n === 4) { trigrams >>= 2; n = 3; } else addStat(Stat.AddForte1, 1);
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
  applyStats: () => { if (isHeld(YIN_YANG_BALANCE)) addStat(Stat.AddEnergy, 25); },
});

const BL_S3 = new Sequence({ name: "Buling S3" });

const BL_S4 = new Sequence({
  name: "Buling S4",
  stats: [[Stat.HealingBonus, 20]],
});

/** The Array inflicts 6 more Electro Flare the moment it is generated. */
const BL_S5 = new Sequence({
  name: "Buling S5",
  updateDebuffs: () => { if (runningAction(Harmony)) inflictElectroFlare(6); },
});

const BL_S6 = new Sequence({ name: "Buling S6" });

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
  intro: () => Intro,
  outro: () => Outro,
  color: "#7a6ff0",
  maxEnergy: 150,
  maxForte1: 4,

  // the Trigram store, empty (its always-set bit alone; see TRIGRAMS)
  combatStart: () => applyCurrent(TRIGRAMS, 1 << 8),

  stats: [[Stat.BaseHp, 10625], [Stat.BaseAtk, 225], [Stat.BaseDef, 1259]],
});

// the kit-valid line: Mid-air banks Thunder, Basic 2 Mountain, and the Heavy reads [T, M] as
// Thunder Over Mountain for Minor Yang; Skill and Basic 4 bank two Thunders and the Heavy reads
// [T, T] as Twin Thunders for Minor Yin — Yin-Yang Balance, so the Liberation resolves to Harmony.
const BL_ROTATION = new Rotation([
  NOINTRO,
  INTRO, JUMP, MA, BA2, HA,
  Skill, BA4, HA, ECHO_CANCEL,
  Liberation, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat, all six sequences (by explicit instruction — see file header)
export const BULING = new Loadout({
  resonator: BULING_RESONATOR,
  weapons: [VARIATION],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC),
  ],
  mainstats: [mainstats(Mainstat.CD4, Mainstat.ER3, Mainstat.ER3, Mainstat.ATK1, Mainstat.ATK1)],
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, true),
  highSubstat: highSubs(Substat.Er, Substat.Liberation, Substat.AtkPct, Substat.Liberation),
    rotation: BL_ROTATION,
  sequences: [BL_S1, BL_S2, BL_S3, BL_S4, BL_S5, BL_S6],
});
