/**
 * Buling, ported to the new engine — sequence-0 core loop, except sequences 1-6 (see below). An
 * electro Rectifier support/healer built around Trigram (Mountain/Thunder, up to 4 held, FIFO):
 * Basic Attack Stage 2 grants Mountain, Stage 4/Mid-air/Resonance Skill grant Thunder, and a
 * Heavy Attack spends a specific pair for Minor Yang (Mountain+Thunder) or Minor Yin (two of the
 * same) — both real Buffs, consumed the instant she holds both at once, entering Yin-Yang
 * Balance. Holding both Minors upgrades Liberation to Flashing Thunder Spell: Harmony (assumed
 * always the case, since nothing tracks a live 4-slot Trigram queue — same "fixed valid line, no
 * live queue" treatment as Zhezhi's Imprints/Sigrika's Runes). Yin-Yang Balance itself is held
 * for exactly the one action that grants it (real kit text keeps it until the following
 * Liberation, but nothing else here reads it that late), long enough for S2's own +25 Energy to
 * see it from its own applyStats(). The rotation hand-places one kit-valid Trigram/Minor sequence
 * rather than a runtime state machine. Healing is out of scope, so both healing-only Heavy
 * Attacks carry 0 mv, not a missing number.
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
 *  S5 the Array inflicts 6 more Electro Flare — nothing reads Electro Flare yet, no-op.
 *  S6 Heaven, Earth, Mind grants 50% Resonance Skill DMG Bonus instead of 25% — read by THUNDER_SPELL.
 */
import {
  Buff, Talent, Inherent, Sequence, Resonator, Tier, Loadout, EchoLoadout, Stat, Attribute, WeaponType, Type1,
  Cast, Node, Scaling, applyTeam, applyCurrent, stacksOfTeam, isHeld, casting, currentAction, currentTeam, addStat,
  queueOnIntro, revokeCurrent, revokeTeam,
} from "../../engine/kit.js";
import { Action, Rotation, NOINTRO, INTRO, ECHO_CANCEL, OUTRO } from "../../engine/rotation.js";
import { applyEnemy } from "../../engine/kit.js";
import { ELECTRO_FLARE, HEALS } from "../../shared/status.js";
import { COSMIC_RIPPLES, NEW_STD_RECTIFIER, VARIATION } from "../../weapons/standard.js";
import { REJUV_5PC, REJUV_2PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { mainstats, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function bulingAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- basics, mid-air, dodge counter (Hexagram Calls, Lightning Falls) — Stage 2 grants Trigram:
//     Mountain, Stage 4/Mid-air grant Trigram: Thunder (fixed valid line, not enforced here)
const BA1 = bulingAction("Basic - Hexagram Calls, Lightning Falls 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 41.46, offtune: 3336, energy: 1.06, concerto: 3.34 });
const BA2 = bulingAction("Basic - Hexagram Calls, Lightning Falls 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 66.90, offtune: 5384, energy: 1.70, concerto: 5.40, forte1: 1 });
const BA3 = bulingAction("Basic - Hexagram Calls, Lightning Falls 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 47.02, offtune: 3784, energy: 1.20, concerto: 3.80 });
const BA4 = bulingAction("Basic - Hexagram Calls, Lightning Falls 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 93.64, offtune: 7536, energy: 2.36, concerto: 7.54, forte1: 1 });
const MA = bulingAction("Basic - Hexagram Calls, Lightning Falls (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.96, offtune: 4960, energy: 1.24, concerto: 4.96, forte1: 1 });
const DC = bulingAction("Basic - Hexagram Calls, Lightning Falls 3 (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 47.02, offtune: 3784, energy: 1.20, concerto: 13.80 });

// hold Normal Attack to spend a specific Trigram pair left-to-right for a Minor state. Twin
// Mountains/Twin Thunders heal only (0 mv, healing out of scope).
// The mixed-trigram heavies bank Minor Yang, the paired ones Minor Yin (and heal — her own
// healing marker, read by every healing sonata and weapon, see statuses.ts); holding both at once
// trades the pair for Yin-Yang Balance.
const YANG = { updateBuffs: () => {
  applyCurrent(MINOR_YANG, 1);
  if (isHeld(MINOR_YIN)) { revokeCurrent(MINOR_YANG); revokeCurrent(MINOR_YIN); applyCurrent(YIN_YANG_BALANCE, 1); }
} };
const YIN = {
  updateDebuffs: () => applyCurrent(HEALS, 1),
  updateBuffs: () => {
    applyCurrent(MINOR_YIN, 1);
    if (isHeld(MINOR_YANG)) { revokeCurrent(MINOR_YANG); revokeCurrent(MINOR_YIN); applyCurrent(YIN_YANG_BALANCE, 1); }
  },
};
const HA_MOUNTAIN_OVER_THUNDER = bulingAction("Heavy - Mountain Over Thunder", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 178.93, offtune: 8000, energy: 3.00, concerto: 15, forte1: -2, ...YANG });
const HA_THUNDER_OVER_MOUNTAIN = bulingAction("Heavy - Thunder Over Mountain", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 89.47, offtune: 8000, energy: 3.00, concerto: 15, forte1: -2, ...YANG });
const HA_TWIN_MOUNTAINS = bulingAction("Heavy - Twin Mountains", { node: Node.Normal, cast: Cast.Heavy, concerto: 15, forte1: -2, ...YIN });
const HA_TWIN_THUNDERS = bulingAction("Heavy - Twin Thunders", { node: Node.Normal, cast: Cast.Heavy, concerto: 15, forte1: -2, ...YIN });

// grants a Trigram: Thunder
const Skill = bulingAction("Skill - In Shadow Thunder Stirs", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 116.8, offtune: 7832, energy: 15.00, concerto: 23, forte1: +1 });

// assumed always cast as Harmony (see file header) — generates the Array, opening/refreshing
// Thunder Spell at Primordial Qi
const Liberation = bulingAction("Liberation - Flashing Thunder Spell - Harmony", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 536.79, offtune: 72000, concerto: 20, resetEnergy: true,
  updateBuffs: () => { revokeTeam(THUNDER_SPELL); applyTeam(THUNDER_SPELL, 1); revokeCurrent(YIN_YANG_BALANCE); },
});

/** The migrated sheet's own full 12-tick lifetime total (238.32% mv, 25 energy, 24 Electro
 *  Flare) rather than one representative tick, same lumped-window treatment as Zhezhi's Inklit
 *  Spirit/Cantarella's Diffusion. Nanoka's own single-tick number is 19.89% mv, for reference. */
const ACTION_FIVE_THUNDERS_ARRAY = bulingAction("Liberation - Five Thunders Spell Array x12", {
  type: Type1.Liberation, mv: 238.32, energy: 25, active: false,
  updateDebuffs: () => applyEnemy(ELECTRO_FLARE, 24),
});

const Intro = bulingAction("Intro - Summon and Smite", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 131.10, offtune: 8792, concerto: 10,
  updateDebuffs: () => applyEnemy(ELECTRO_FLARE, 4),
});
// the Array's whole window as one lump, deferred behind the next Intro: it ticks on past the swap
const Outro = bulingAction("Outro - Exorcism Spell", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => { queueOnIntro(ACTION_FIVE_THUNDERS_ARRAY); applyTeam(BULING_OUTRO, 1); }
});

/* ------------------------------------------------------------------------------------ buffs */

/** Named for its own current stage rather than a stack count, same reasoning as Shorekeeper's
 *  Stellarealm. Paid out only to whoever's active. */
const THUNDER_SPELL_STAGE = ["Primordial Qi", "Yin and Yang", "Heaven, Earth, Mind"];
const THUNDER_SPELL = new Buff({
  name: "Buling: Thunder Spell", maxStacks: 3,
  display: (): string => `Buling: Thunder Spell - ${THUNDER_SPELL_STAGE[stacksOfTeam(THUNDER_SPELL) - 1]}`,
  updateGlobal: () => { if (casting(Cast.Intro) && stacksOfTeam(THUNDER_SPELL) < 3) applyTeam(THUNDER_SPELL, 1); },
  applyStats: () => {
    if (!currentAction().active) return;
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

/** Pure state markers, no stat of their own — both are consumed the instant she holds both at
 *  once (see BULING_RESONATOR's own updateBuffs()), entering Yin-Yang Balance. */
const MINOR_YANG = new Buff({ name: "Buling: Minor Yang" });
const MINOR_YIN = new Buff({ name: "Buling: Minor Yin" });

/** Held for exactly the one action that grants it (BULING_RESONATOR's own updateBuffs() grants, its own
 *  convertStats() revokes) — the only real reader left is S2's own +25 Energy, between those two. */
const YIN_YANG_BALANCE = new Buff({ name: "Buling: Yin-Yang Balance" ,
});

/** +15% (unscoped) DMG Amplification, 30s — permanent uptime once granted. */
const BULING_OUTRO = new Buff({
  name: "Buling: Outro",
  applyStats: () => addStat(Stat.Amp, 15),
});

/** +25% Healing Bonus while healing an ally under 50% HP — no ally-HP tracking, named marker only. */
const BL_INHERENT_1 = new Inherent({ name: "Buling: Time Arrives, Evil Declines" });

/** The source of Intro's own 4 Electro Flare stacks (declared on the Intro action). */
const BL_INHERENT_2 = new Inherent({ name: "Buling: Earthly Immortal is Here!" });

/* ------------------------------------------------------------------------------- sequences */

const BL_S1 = new Sequence({
  name: "Buling S1",
  applyStats: () => { if (currentAction() == Liberation) addStat(Stat.CritRate, 20); }
});

const BL_S2 = new Sequence({
  name: "Buling S2",
  applyStats: () => { if (isHeld(YIN_YANG_BALANCE)) addStat(Stat.AddEnergy, 25); },
});

const BL_S3 = new Sequence({ name: "Buling S3" });

const BL_S4 = new Sequence({
  name: "Buling S4",
  applyStats: () => addStat(Stat.HealingBonus, 20),
});

const BL_S5 = new Sequence({ name: "Buling S5" });

const BL_S6 = new Sequence({ name: "Buling S6" });

const BULING_RESONATOR = new Resonator({
  name: "Buling",
  tier: Tier.Free,
  element: Attribute.Electro,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  outro: () => Outro,
  color: "#7a6ff0",
  maxEnergy: 150,

  constantStats: () => {
    addStat(Stat.BaseHp, 10625); addStat(Stat.BaseAtk, 225); addStat(Stat.BaseDef, 1259);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit.
// Healing Bonus+ nodes are unused by the formula (healing out of scope), tracked for completeness.
const BULING_TALENTS = new Talent({
  name: "Buling: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.HealingBonus, 12); },
});

// the kit-valid line: Mid-air opens with a Thunder Trigram, Basic 1/2 adds Mountain, Heavy:
// Thunder Over Mountain spends both for Minor Yang, Skill and Basic 4 each add a fresh Thunder,
// Heavy: Twin Thunders spends both for Minor Yin — unlocking Harmony for the Liberation after.
// BL_ROTATION for a non-leading slot (opens on her own Intro); BL_OPENER for a leading one.
const BL_ROTATION = new Rotation([
  NOINTRO,
  INTRO, MA, BA2, HA_THUNDER_OVER_MOUNTAIN,
  Skill, BA4, HA_TWIN_THUNDERS, ECHO_CANCEL,
  Liberation, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat, all six sequences (by explicit instruction — see file header)
export const BULING = new Loadout({
  resonator: BULING_RESONATOR,
  talent: BULING_TALENTS,
  inherent1: BL_INHERENT_1,
  inherent2: BL_INHERENT_2,
  weapons: [VARIATION],
  echoLoadouts: [new EchoLoadout(FALLACY, REJUV_5PC, REJUV_2PC)],
  mainstats: [mainstats(Mainstat.CD4, Mainstat.ER3, Mainstat.ER3, Mainstat.ATK1, Mainstat.ATK1)],
  substat: chem("atk", "liberation", { er: true }),
    rotation: BL_ROTATION,
  sequences: [BL_S1, BL_S2, BL_S3, BL_S4, BL_S5, BL_S6],
});
