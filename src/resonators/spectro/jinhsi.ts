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
 * **Incandescence** is a 50-stack buff of her own (not a forte gauge), fed by Eras in Unity (see
 * ERAS_IN_UNITY below): +1 whenever anyone in the party inflicts Attribute DMG, +2 on a
 * Coordinated Attack, each rate-limited per attribute — the kit's once-per-3s read as once per 3
 * *actions* here, since this engine has no clock, and her Outro Temporal Bender's 1s window as
 * once per action. The stacks pay out on Stella Glamor and are consumed by it: +44.54% DMG
 * Multiplier apiece on its 347.92% base, more than doubling it off a decently fed bar.
 *
 * MVs and energy/concerto/off-tune off nanoka.cc (character 1304,
 * https://ww.nanoka.cc/character/1304), read the way CLAUDE.md describes. The second, larger row
 * on Purge of Light, Solar Flare and Stella Glamor is that same hit re-shown at its sequence tier,
 * and the nodes below reproduce each as a multiplier off the base row: 1666.03% x 2.2 = 3665.27%
 * is S5, 19.89% and 347.92% x 1.45 are S6. Loong's Halo's own second row is not a sequence: its
 * 238.58% is the base 159.05% with Converged Flash's +50% already folded in, which is why that
 * inherent contributes the multiplier below instead.
 */
import {
  Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Stat, Attribute,
  WeaponType, Type1, Type2, Cast, Node, Scaling, addStat, applyCurrent, applyTeam, casting, currentAction,
  frozenStacks, isHeld, isType, queue, removeStack, revokeCurrent, revokeTeam, setStacksSelf, stacksOf, triggeredAction,
} from "../../engine/kit.js";
import { ActionGroup, Action, Rotation, START_3, SWAP, DOUBLE_INTRO, INTRO, ECHO_ONFIELD, OUTRO } from "../../engine/rotation.js";
import { AGES_OF_HARVEST } from "../../weapons/broadblade.js";
import { NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { JUE, CELESTIAL_LIGHT_5PC } from "../../echoes/jinzhou.js";
import { VOIDWING_MOTH } from "../../echoes/lahairoi.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { matrix } from "../../shared/helpers.js";

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
 *  queued behind them — the row every Incandescence held pays out on (see INCANDESCENCE below). */
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

const Intro = jinhsiAction("Intro - Loong's Halo", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 159.05, energy: 10, concerto: 10, offtune: 8000,
});
/** Temporal Bender hands the incoming resonator nothing of their own: its 20s window is the
 *  second Eras in Unity stack, under which the channels run at one action instead of three. Both
 *  of her outros are this one cast — the first paid for by Unison, the second by the bar — and
 *  with two a rotation the 20s windows overlap end to end, so the stack is permanent once up. */
const Outro = jinhsiAction("Outro - Temporal Bender", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => { if ((stacksOf(ERAS_IN_UNITY) & 3) < 2) applyCurrent(ERAS_IN_UNITY, 1); },
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

/**
 * Eras in Unity — the whole Incandescence economy, held on Jinhsi's own slot and watching every
 * action from updateGlobal() (the Jingran shape: reacting to teammates' turns, paying onto her).
 * Its stack count is a packed word, the same trick as Hiyuki's Snow Rust, since kit state has to
 * live in stacks for the engine's own snapshot/restore to see it:
 *
 *   bits 0-1   the real stacks: 1 always (from combat start), 2 once Temporal Bender's window
 *              opens — her first Outro raises it and it never comes off: she outros twice a
 *              rotation, so the 20s windows overlap end to end (the ≥21s permanence convention)
 *   bits 2-29  fourteen 2-bit cooldowns, one per (attribute, coordinated?) channel: the actions
 *              still to wait before that channel pays again, 3..0, at bit 2 + 2*(2*attr + coord)
 *
 * Only an active, non-triggered action ticks the channels down one — a queued sub-hit (a turret
 * shot, a coordinated tick) lands inside its trigger's own second, so it may still pay an open
 * channel but never passes time, and a DOT tick is ignored outright. A paying action's element
 * pays +1 Incandescence off its same-attribute channel and a Coordinated Attack pays +2 off its
 * own channel beside it — both back to cooldown 3, or 1 under the outro window (the kit's own
 * 1s, which speeds both sides up). The 50 cap is INCANDESCENCE's own maxStacks.
 */
const ERAS_IN_UNITY = new Buff({
  name: "Jinhsi: Eras in Unity", maxStacks: 0x3fffffff,
  display: () => ((frozenStacks() & 3) === 2 ? "Eras in Unity (outro)" : "Eras in Unity"),
  updateGlobal: () => {
    const a = currentAction();
    // a DOT tick (the Negative Status ladders) is nobody's attack — no time, no pay
    if (a.scaling === Scaling.Dot) return;
    let word = stacksOf(ERAS_IN_UNITY);
    // only a real press passes time: a queued sub-hit (a turret shot, a coordinated tick) lands
    // inside its trigger's own second, so it may pay an open channel but never advances the clock
    if (a.active && !triggeredAction()) {
      for (let shift = 2; shift < 30; shift += 2) {
        if ((word >> shift) & 3) word -= 1 << shift;
      }
    }
    if (a.element && a.mv > 0) {
      const shift = 2 + 4 * ((a.element >> 6) - 1);
      if (!((word >> shift) & 3)) {
        word |= ((word & 3) === 2 ? 1 : 3) << shift;
        applyCurrent(INCANDESCENCE, 1);
      }
      if (isType(Type2.Coordinated) && !((word >> (shift + 2)) & 3)) {
        word |= ((word & 3) === 2 ? 1 : 3) << (shift + 2);
        applyCurrent(INCANDESCENCE, 2);
      }
    }
    setStacksSelf(ERAS_IN_UNITY, word);
  },
});

/** Incandescence itself: what Eras in Unity banks, up to 50, with the cap carried by the stacks'
 *  own ceiling. Every stack held pays +44.54% DMG Multiplier onto Stella Glamor, which consumes
 *  the lot — the buff's whole payout is that one row of her forte. */
const INCANDESCENCE = new Buff({
  name: "Jinhsi: Incandescence", maxStacks: 50,
  applyStats: () => { if (currentAction() === StellaGlamor) addStat(Stat.AddMv, 44.54 * frozenStacks()); },
  convertStats: () => { if (currentAction() === StellaGlamor) revokeCurrent(INCANDESCENCE); },
});

/** Radiant Surge (Inherent Skill): +20% Spectro DMG Bonus, genuinely unconditional. */
const RADIANT_SURGE = new Inherent({
  name: "Inherent: Radiant Surge",
  constantStats: () => addStat(Stat.DmgBonus, 20, Attribute.Spectro),
});

/** Converged Flash (Inherent Skill): Loong's Halo's own DMG Multiplier +50%. */
const CONVERGED_FLASH = new Inherent({
  name: "Inherent: Converged Flash",
  applyStats: () => { if (currentAction() === Intro) addStat(Stat.MulMv, 50); },
});

/* --------------------------------------------------------------------------- resonance chain */

/** S1's own stacking buff: one per Incarnation basic or Crescent Divinity, four at most, spent by
 *  Illuminous Epiphany. Both halves of that press are the one skill, so each stack pays on Solar
 *  Flare and on the Stella Glamor behind it, and it is Stella Glamor — the last of the pair — that
 *  consumes the lot, the same way Incandescence does. The 6s never binds: her rotation builds the
 *  four and spends them inside one burst (BA1-3, Crescent Divinity, BA4, Epiphany). */
const HERALD_OF_REVIVAL = new Buff({
  name: "Jinhsi S1: Herald of Revival", maxStacks: 4,
  applyStats: () => {
    const a = currentAction();
    if (a === SolarFlare || a === StellaGlamor) addStat(Stat.DmgBonus, 20 * frozenStacks());
  },
  convertStats: () => { if (currentAction() === StellaGlamor) revokeCurrent(HERALD_OF_REVIVAL); },
});

const JX_S1 = new Sequence({
  name: "Jinhsi S1: Abyssal Ascension",
  updateBuffs: () => {
    const a = currentAction();
    if (a === IncBA1 || a === IncBA2 || a === IncBA3 || a === IncBA4 || a === CrescentDivinity) {
      applyCurrent(HERALD_OF_REVIVAL, 1);
    }
  },
});

/** S2: 50 Incandescence back for standing *out of combat* 4s. A rotation here is one unbroken
 *  fight, so this never fires — the node is held for its name, like Phrolova's own S5. */
const JX_S2 = new Sequence({ name: "Jinhsi S2: Chronofrost Repose" ,
  combatStart: () => { applyCurrent(INCANDESCENCE, 50); },
});

/** S3's stacks: +25% ATK apiece, two at most, one per Intro she casts. Its 20s covers her whole
 *  double-Intro pair, so the mid-loop outro — the free one Unison pays for, which she comes
 *  straight back from — keeps them and only the bar-paid outro that ends the loop drops them.
 *  `isHeld(UNISON)` is what tells those two apart (see the Outro cast above), read from
 *  updateBuffs because the Outro's own convertStats is what spends the Unison. */
const IMMORTALS_DESCENDANCY = new Buff({
  name: "Jinhsi S3: Immortal's Descendancy", maxStacks: 2,
  applyStats: () => addStat(Stat.BonusAtk, 25 * frozenStacks()),
});

const JX_S3 = new Sequence({
  name: "Jinhsi S3: Celestial Incarnate",
  updateBuffs: () => { if (currentAction() === Intro) applyCurrent(IMMORTALS_DESCENDANCY, 1); },
});

/** S4: "all nearby Resonators", so it pays on their inactive actions too; "Attribute DMG Bonus"
 *  with no attribute named, so it goes on untagged. 20s team buff — lost on her own next Intro. */
const JX_S4_TEAM = new Buff({
  name: "Jinhsi S4: Benevolent Grace (team)",
  applyStats: () => addStat(Stat.DmgBonus, 20),
});

const JX_S4 = new Sequence({
  name: "Jinhsi S4: Benevolent Grace",
  // Solar Flare is the press; Stella Glamor is the detonation behind it, not a second cast
  updateBuffs: () => {
    const a = currentAction();
    if (a === Liberation || a === SolarFlare) applyTeam(JX_S4_TEAM, 1);
  },
});

/** S5: Purge of Light's own 1666.03% x 2.2, which is nanoka's second row for it. */
const JX_S5 = new Sequence({
  name: "Jinhsi S5: Frostfire Illumination",
  applyStats: () => { if (currentAction() === Liberation) addStat(Stat.MulMv, 120); },
});

/** S6: the same +45% on both halves of Illuminous Epiphany — and, because a motion value is
 *  `(base + added) x (1 + multiplier)` (damage.ts), the one multiplier lifts the 44.54% per
 *  Incandescence stack by 45% too, which is the node's second clause. */
const JX_S6 = new Sequence({
  name: "Jinhsi S6: Thawing Triumph",
  applyStats: () => {
    const a = currentAction();
    if (a === SolarFlare || a === StellaGlamor) addStat(Stat.MulMv, 45);
  },
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

  // Eras in Unity is hers the moment she is on the team, well before her first turn
  combatStart: () => applyCurrent(ERAS_IN_UNITY, 1),

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

  DOUBLE_INTRO, ESkill, 
  IncBA123, CrescentDivinity, IncBA4, SolarFlare, Skill.swap(),
  OUTRO,

  INTRO, ECHO_ONFIELD, ESkill, 
  IncBA123, CrescentDivinity, IncBA4, SolarFlare, 
  Liberation, Skill.swap(), OUTRO,
]);

const JX_ECHOES = [
  new EchoLoadout(JUE, CELESTIAL_LIGHT_5PC)
];

export const JINHSI = new Loadout({
  resonator: JINHSI_RESONATOR,
  talent: JINHSI_TALENTS,
  inherent1: RADIANT_SURGE,
  inherent2: CONVERGED_FLASH,
  weapons: [AGES_OF_HARVEST, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: JX_ECHOES,
  matrix: matrix("Jinhsi", 25),
  sequences: [JX_S1, JX_S2, JX_S3, JX_S4, JX_S5, JX_S6],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
  rotation: JX_ROTATION,
});
