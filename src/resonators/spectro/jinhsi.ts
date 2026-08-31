/**
 * Jinhsi — a Spectro Broadblade main DPS whose whole loop is one burst window, and whose damage is
 * almost all Resonance Skill DMG: Incarnation - Basic Attack is "considered as Resonance Skill
 * DMG" by her own Forte Circuit text, so only the out-of-Incarnation chain below is really Basic.
 *
 * The state machine, named rather than tracked as live combo state (same treatment as Camellya's
 * Blossom Mode):
 *
 * - Intro Loong's Halo (or Basic Attack 4) opens a 5s window in which Resonance Skill becomes
 *   **Overflowing Radiance**, which is what sends her into **Incarnation** (10s).
 * - In Incarnation: Incarnation - Basic Attack 1-4, with Crescent Divinity as the Resonance Skill
 *   (10s cooldown, and it does not reset the basic cycle).
 * - Incarnation - Basic Attack 4 ends Incarnation and opens **Ordination Glow** (5s), in which the
 *   Resonance Skill is **Illuminous Epiphany**: Solar Flare's six taps, then Stella Glamor's
 *   detonation queued behind them as the delayed hit it is.
 * - Casting Illuminous Epiphany grants **Unison**, once every 25s. Swapping out spends it in place
 *   of the Concerto bar — modelled as the 100 Concerto that outro would otherwise have cost,
 *   handed back on the outro row itself, so the cast keeps its ordinary `concerto: -100`.
 *
 * That free outro is why she visits the field **twice a loop**, written as an outro-form
 * DOUBLE_INTRO section (rotation.ts): the first visit ends on the Unison outro and hands the field
 * *backward*, the resonator behind her plays their own rotation, and their outro brings it round
 * again for her main Intro chain — which ends on a real outro off a genuinely full bar (~116). The
 * grant's 25s limit is what stops the second Illuminous Epiphany handing over a second free one;
 * UNISON_COOLDOWN below carries that, cleared by the bar-paid outro.
 *
 * **Incandescence (her Forte Gauge) is deliberately not implemented yet**, by instruction. Two
 * things wait on it: Eras in Unity (the team's own Attribute/Coordinated DMG feeding her, and her
 * Outro Temporal Bender speeding that up to once a second for 20s), and Stella Glamor's own
 * "+44.54% DMG Multiplier per Incandescence consumed" — so Stella Glamor below is the bare 347.92%
 * and her Outro is a damageless row that grants nothing.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1304,
 * https://ww.nanoka.cc/character/1304), read the way CLAUDE.md describes. The second, larger row
 * on Purge of Light, Loong's Halo, Solar Flare and Stella Glamor is that same hit re-shown at a
 * sequence tier (S5/S6) — every build here is S0, so only the base row is used. Loong's Halo is
 * the exception that isn't a sequence: its 238.58% row is the base 159.05% with Converged Flash's
 * own +50% already folded in, which is why that inherent contributes the multiplier below instead.
 */
import {
  Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Stat, Attribute,
  WeaponType, Type1, Cast, Node, Scaling, addStat, applyCurrent, casting, currentAction, isHeld,
  queue, revokeCurrent,
} from "../../engine/kit.js";
import { ActionGroup, Action, Rotation, START_3, SWAP, DOUBLE_INTRO, INTRO, ECHO_ONFIELD, OUTRO } from "../../engine/rotation.js";
import { AGES_OF_HARVEST } from "../../weapons/broadblade.js";
import { NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { JUE, CELESTIAL_LIGHT_5PC, CELESTIAL_LIGHT_2PC } from "../../echoes/jinzhou.js";
import { VOIDWING_MOTH } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function jinhsiAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Slash of Breaking Dawn, the chain she plays only outside Incarnation. Her real loop enters
//     Incarnation off the Intro, so none of these are placed below.
const BA1 = jinhsiAction("Basic - Slash of Breaking Dawn 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 66.47, energy: 1.24, concerto: 2.48, offtune: 3960 });
const BA2 = jinhsiAction("Basic - Slash of Breaking Dawn 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 97.49, energy: 1.84, concerto: 3.65, offtune: 5810 });
const BA3 = jinhsiAction("Basic - Slash of Breaking Dawn 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 106.49, energy: 2, concerto: 3.99, offtune: 6349 });
const BA4 = jinhsiAction("Basic - Slash of Breaking Dawn 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 157.72, energy: 2.95, concerto: 5.89, offtune: 9400 });
const HA = jinhsiAction("Heavy - Slash of Breaking Dawn", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 238.6, energy: 4, concerto: 8, offtune: 12800 });
const MA = jinhsiAction("Basic - Slash of Breaking Dawn (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 123.28, energy: 0.54, concerto: 1, offtune: 4960 });
const DC = jinhsiAction("Basic - Slash of Breaking Dawn (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 146.78, energy: 2.78, concerto: 15.49, offtune: 8749 });

// --- Trailing Lights of Eons, and the alternative skill that opens Incarnation
const Skill = jinhsiAction("Skill - Trailing Lights of Eons", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 155.68, energy: 2.21, concerto: 4.38, offtune: 6960 });
const ESkill = jinhsiAction("Skill - Overflowing Radiance", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 197.29, energy: 1.29, concerto: 4, offtune: 3974,
  updateBuffs: () => applyCurrent(INCARNATION, 1),
});

// --- Forte Circuit (Luminal Synthesis). The Incarnation basic chain is Resonance Skill DMG by its
//     own text, so it is tagged Skill and cast Basic; the Heavy and the Dodge Counter are not.
const IncBA1 = jinhsiAction("Forte - Incarnation - Basic Attack 1", { node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 88.62, energy: 1.24, concerto: 1.24, offtune: 3960 });
const IncBA2 = jinhsiAction("Forte - Incarnation - Basic Attack 2", { node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 129.95, energy: 1.83, concerto: 1.83, offtune: 5809 });
const IncBA3 = jinhsiAction("Forte - Incarnation - Basic Attack 3", { node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 165.74, energy: 2.32, concerto: 2.32, offtune: 7409 });
/** Stage 4 ends Incarnation and hands her Ordination Glow, the window Illuminous Epiphany lives in. */
const IncBA4 = jinhsiAction("Forte - Incarnation - Basic Attack 4", {
  node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 186.69, energy: 2.67, concerto: 2.67, offtune: 8348,
  updateBuffs: () => { revokeCurrent(INCARNATION); applyCurrent(ORDINATION_GLOW, 1); },
});
const IncHeavy = jinhsiAction("Forte - Incarnation - Heavy Attack", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 159.06, energy: 2, concerto: 2, offtune: 6400 });
const IncDodge = jinhsiAction("Forte - Incarnation - Dodge Counter", { node: Node.Forte, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 219.44, concerto: 13.08, offtune: 9810 });
const CrescentDivinity = jinhsiAction("Forte - Crescent Divinity", { node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 503.8, energy: 3.19, concerto: 8, offtune: 10138 });

/** Illuminous Epiphany, the one press: Solar Flare's six taps, with Stella Glamor's detonation
 *  queued behind them. The Incandescence it consumes — up to 50, each worth +44.54% DMG Multiplier
 *  on Stella Glamor — waits on her Forte Gauge (see the file header). */
const SolarFlare = jinhsiAction("Forte - Illuminous Epiphany: Solar Flare", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 119.34, energy: 1.98, concerto: 20, offtune: 14400,
  updateBuffs: () => {
    revokeCurrent(ORDINATION_GLOW);
    if (!isHeld(UNISON_COOLDOWN)) { applyCurrent(UNISON, 1); applyCurrent(UNISON_COOLDOWN, 1); }
    queue(StellaGlamor);
  },
});
const StellaGlamor = jinhsiAction("Forte - Illuminous Epiphany: Stella Glamor", { node: Node.Forte, type: Type1.Skill, mv: 347.92, energy: 5.67, offtune: 42002 });

const Liberation = jinhsiAction("Liberation - Purge of Light", { node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 1666.03, concerto: 20, offtune: 84000, resetEnergy: true });

const Intro = jinhsiAction("Intro - Loong's Halo", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 159.05, energy: 10, concerto: 10, offtune: 8000 });
/** Temporal Bender hands the incoming resonator nothing: all it does is speed up her own
 *  Incandescence gain, which is the gauge this file does not model yet. Both of her outros are
 *  this one cast — the first paid for by Unison, the second by the bar. */
const Outro = jinhsiAction("Outro - Temporal Bender", {
  cast: Cast.Outro, type: Type1.Outro, concerto: -100, active: false,
  // Unison pays for this one and is spent by it; the outro that has none is the one far enough
  // past the grant's own 25s limit for the next Illuminous Epiphany to hand another over.
  convertStats: () => { if (isHeld(UNISON)) revokeCurrent(UNISON); else revokeCurrent(UNISON_COOLDOWN); },
});

/* ------------------------------------------------------------------------------------- buffs */

/** The two mode markers, no stat of their own — they name which replacement chain is live, the
 *  same way Camellya's Blossom Mode does. */
const INCARNATION = new Buff({ name: "Jinhsi: Incarnation" });
const ORDINATION_GLOW = new Buff({ name: "Jinhsi: Ordination Glow" });

/** Unison, from Illuminous Epiphany: swapping out consumes it to fire her Outro and the incoming
 *  Intro in place of a full Concerto bar. Modelled as the 100 Concerto that outro would otherwise
 *  have cost, handed back on the outro itself, so the cast keeps its ordinary `concerto: -100`. */
const UNISON = new Buff({
  name: "Jinhsi: Unison",
  applyStats: () => { if (casting(Cast.Outro)) addStat(Stat.AddConcerto, 100); },
});

/** The grant's own "once every 25s" — longer than the gap between her two visits, so only the
 *  first Illuminous Epiphany of a loop hands a Unison over and the second outro pays the real bar.
 *  Cleared by that second outro (see the Outro action above), which is where the 25s has run out. */
const UNISON_COOLDOWN = new Buff({ name: "Jinhsi: Unison Cooldown" });

/** Radiant Surge (Inherent Skill): +20% Spectro DMG Bonus, genuinely unconditional. */
const RADIANT_SURGE = new Inherent({
  name: "Jinhsi: Radiant Surge",
  constantStats: () => addStat(Stat.DmgBonus, 20, Attribute.Spectro),
});

/** Converged Flash (Inherent Skill): Loong's Halo's own DMG Multiplier +50%. */
const CONVERGED_FLASH = new Inherent({
  name: "Jinhsi: Converged Flash",
  applyStats: () => { if (currentAction() === Intro) addStat(Stat.MulMv, 50); },
});

/* --------------------------------------------------------------------------- kit and loadout */

const JINHSI_TALENTS = new Talent({
  name: "Jinhsi: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8); },
});

const JINHSI_RESONATOR = new Resonator({
  name: "Jinhsi",
  element: Attribute.Spectro,
  weapon: WeaponType.Broadblade,
  intro: () => Intro,
  outro: () => Outro,
  color: "#f2c75c",
  maxEnergy: 150,

  constantStats: () => {
    addStat(Stat.BaseHp, 10825); addStat(Stat.BaseAtk, 412.5); addStat(Stat.BaseDef, 1258.9);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

/** Both visits run the same line — Intro into Overflowing Radiance, the Incarnation basic chain,
 *  Illuminous Epiphany — since Epiphany is what hands over the Unison the first of them leaves on.
 *  The once-per-visit casts go in the second, the longer one: the echo (so Jué's Blessing of Time
 *  covers the burst rather than the next resonator's), Crescent Divinity between stages 3 and 4
 *  (its 10s cooldown, and the Incarnation basic cycle does not reset), and Purge of Light last of
 *  all, just ahead of the outro. Delaying the Liberation costs no buff uptime — nothing in her kit
 *  or on Ages of Harvest scopes to Liberation — and it is the cast that resets RealEnergy, so
 *  leaving it to the end is what makes the Energy Requirements table measure the whole loop's
 *  banking. Trailing Lights of Eons is pressed only in the opening scramble: on every visit after,
 *  the Intro's own 5s window means the Resonance Skill button is Overflowing Radiance. */
const IncBA123 = new ActionGroup("Basic - Incarnation 123", [IncBA1, IncBA2, IncBA3]);

const JX_ROTATION = new Rotation([
  START_3, Liberation, SWAP,

  DOUBLE_INTRO, ECHO_ONFIELD, ESkill, 
  IncBA123, CrescentDivinity, IncBA4, SolarFlare, Skill.swap(),
  OUTRO,

  INTRO, ESkill, 
  IncBA123, CrescentDivinity, IncBA4, SolarFlare, 
  Liberation, Skill.swap(), OUTRO,
]);

const JX_ECHOES = [
  new EchoLoadout(JUE, CELESTIAL_LIGHT_5PC, CELESTIAL_LIGHT_2PC)
];

export const JINHSI = new Loadout({
  resonator: JINHSI_RESONATOR,
  talent: JINHSI_TALENTS,
  inherent1: RADIANT_SURGE,
  inherent2: CONVERGED_FLASH,
  weapons: [AGES_OF_HARVEST, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: JX_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
  rotation: JX_ROTATION,
});
