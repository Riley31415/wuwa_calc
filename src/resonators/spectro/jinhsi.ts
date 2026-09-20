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
 * - Casting Illuminous Epiphany grants **Unison**, once every 25s (shared/unison.ts — swapping out
 *   spends it in place of the Concerto bar, handed back on the outro row itself).
 *
 * That free outro is why she visits the field **twice a loop**, written as an outro-form
 * DOUBLE_INTRO section (rotation.ts): the first visit ends on the Unison outro and hands the field
 * *backward*, the resonator behind her plays their own rotation, and their outro brings it round
 * again for her main Intro chain — which ends on a real outro off a genuinely full bar (~116). The
 * grant's 25s limit is what stops the second Illuminous Epiphany handing over a second free one:
 * her first Epiphany of a rotation grants, and JX_UNISON_SPENT below holds the rest off until her
 * Liberation — the once-a-rotation cast — comes round again.
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
import { Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addStat,
  applyCurrent,
  applyTeam,
  currentAction,
  onAction,
  runningAction,
  frozenStacks,
  isHeld,
  isType,
  queue,
  revokeCurrent,
  revokeTeam,
  
  
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, START_3, SWAP, DOUBLE_INTRO, INTRO, ECHO_ONFIELD, OUTRO, NOINTRO, EVERY_OTHER } from "../../engine/rotation.js";
import { AGES_OF_HARVEST } from "../../weapons/broadblade.js";
import { NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { JUE, CELESTIAL_LIGHT_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { matrix } from "../../shared/helpers.js";
import { UNISON, unisonOutro } from "../../shared/unison.js";
import { STAY_TUNED, SWORN_VIGIL_5PC } from "../../echoes/mengzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function jinhsiAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Slash of Breaking Dawn, the chain she plays only outside Incarnation. Her real loop enters
//     Incarnation off the Intro, so none of these are placed below.
const BA1 = jinhsiAction("Basic - Slash of Breaking Dawn 1", { frames: 28, cancel: 17, node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 66.47, energy: 1.24, concerto: 2.48, offtune: 3960 });
const BA2 = jinhsiAction("Basic - Slash of Breaking Dawn 2", { frames: 45, cancel: 42, node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 97.49, energy: 1.84, concerto: 3.65, offtune: 5810 });
const BA3 = jinhsiAction("Basic - Slash of Breaking Dawn 3", { frames: 47, cancel: 39, node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 106.49, energy: 2, concerto: 3.99, offtune: 6349 });
const BA4 = jinhsiAction("Basic - Slash of Breaking Dawn 4", { frames: 74, cancel: 33, node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 157.72, energy: 2.95, concerto: 5.89, offtune: 9400 });
const HA = jinhsiAction("Heavy - Slash of Breaking Dawn", { frames: 106, cancel: 90, node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 238.6, energy: 4, concerto: 8, offtune: 12800 });
const MA = jinhsiAction("Mid-air - Slash of Breaking Dawn Plunge", { frames: 95, cancel: 52, node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 123.28, energy: 0.54, concerto: 1, offtune: 4960 });
const DC = jinhsiAction("Dodge Counter - Slash of Breaking Dawn", { frames: 48, cancel: 39, node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 146.78, energy: 2.78, concerto: 15.49, offtune: 8749 });

// --- Trailing Lights of Eons, and the alternative skill that opens Incarnation
const Skill = jinhsiAction("Skill - Trailing Lights of Eons", { frames: 64, cancel: 42, node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 155.68, energy: 2.21, concerto: 4.38, offtune: 6960 });
const Skill2 = jinhsiAction("Skill - Overflowing Radiance", {
  frames: 84, cancel: 74,
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 197.29, energy: 1.29, concerto: 4, offtune: 3974,
  updateBuffs: () => applyCurrent(INCARNATION, 1),
});

// --- Forte Circuit (Luminal Synthesis). The Incarnation basic chain is Resonance Skill DMG by its
//     own text, so it is tagged Skill and cast Basic; the Heavy and the Dodge Counter are not.
const IncBA1 = jinhsiAction("Basic - Incarnation 1", { frames: 26, cancel: 15, node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 88.62, energy: 1.24, concerto: 1.24, offtune: 3960 });
const IncBA2 = jinhsiAction("Basic - Incarnation 2", { frames: 41, cancel: 29, node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 129.95, energy: 1.83, concerto: 1.83, offtune: 5809 });
const IncBA3 = jinhsiAction("Basic - Incarnation 3", { frames: 54, cancel: 31, node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 165.74, energy: 2.32, concerto: 2.32, offtune: 7409 });
/** Stage 4 ends Incarnation and hands her Ordination Glow, the window Illuminous Epiphany lives in. */
const IncBA4 = jinhsiAction("Basic - Incarnation 4", {
  frames: 87, cancel: 71,
  node: Node.Forte, cast: Cast.Basic, type: Type1.Skill, mv: 186.69, energy: 2.67, concerto: 2.67, offtune: 8348,
  updateBuffs: () => { revokeCurrent(INCARNATION); applyCurrent(ORDINATION_GLOW, 1); },
});
const IncHeavy = jinhsiAction("Heavy - Incarnation", { frames: 78, cancel: 48, node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 159.06, energy: 2, concerto: 2, offtune: 6400 });
const IncDodge = jinhsiAction("Dodge Counter - Incarnation", { frames: 87, cancel: 87, node: Node.Forte, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 219.44, concerto: 13.08, offtune: 9810 });
const Skill3 = jinhsiAction("Skill - Crescent Divinity", { frames: 87, cancel: 71, node: Node.Forte, cast: Cast.Skill, type: Type1.Skill, mv: 503.8, energy: 3.19, concerto: 8, offtune: 10138 });

/** Illuminous Epiphany, the one press: Solar Flare's six taps, with Stella Glamor's detonation
 *  queued behind them — the row every Incandescence held pays out on (see INCANDESCENCE below). */
const Skill4 = jinhsiAction("Forte Skill - Illuminous Epiphany: Solar Flare", {
  frames: 42, cancel: 174,
  node: Node.Forte, cast: Cast.Skill, cutscene: true, type: Type1.Skill, mv: 119.34, energy: 1.98, concerto: 20, offtune: 14400,
  updateBuffs: () => {
    revokeCurrent(ORDINATION_GLOW);
    queue(StellaGlamor);
  },
});
const Skill4_Unison = Skill4.variant("Forte Skill - Illuminous Epiphany: Solar Flare", { 
  updateBuffs: () => {
    revokeCurrent(ORDINATION_GLOW);
    queue(StellaGlamor);
    applyCurrent(UNISON, 1);
  }
});
const StellaGlamor = jinhsiAction("Forte Skill - Illuminous Epiphany: Stella Glamor", { node: Node.Forte, type: Type1.Skill, mv: 347.92, energy: 5.67, offtune: 42002 });

const Liberation = jinhsiAction("Liberation - Purge of Light", {
  frames: 0, cancel: 231,
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Liberation, mv: 1666.03, concerto: 20, offtune: 84000, resetEnergy: true,
});

const Intro = jinhsiAction("Intro - Loong's Halo", {
  frames: 60, cancel: 49,
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 159.05, energy: 10, concerto: 10, offtune: 8000,
});
/** Temporal Bender hands the incoming resonator nothing of their own: it opens her own 20s window,
 *  under which Eras in Unity's channels run at one action instead of three. Both of her outros are
 *  this one cast — the first its Unison form, paid for by Unison, the second by the bar — so the
 *  window is re-opened twice a rotation. */
const Outro = jinhsiAction("Outro - Temporal Bender", {
  frames: 0, cancel: 0,
  cast: Cast.Outro, concerto: -100, swapOut: true,
  updateBuffs: () => applyCurrent(TEMPORAL_BENDER, 1),
});
const OutroUnison = unisonOutro(Outro);

/* ------------------------------------------------------------------------------------- buffs */

/** The two mode markers, no stat of their own — they name which replacement chain is live, the
 *  same way Camellya's Blossom Mode does. */
const INCARNATION = new Buff({ name: "Jinhsi: Incarnation", duration: 60 * 10 });
const ORDINATION_GLOW = new Buff({ name: "Jinhsi: Ordination Glow", duration: 60 * 5 });

/* Unison itself is shared/unison.ts's: whichever of her outros holds it is the free one, and the
 * other pays the real bar. */

/**
 * Eras in Unity — the whole Incandescence economy, held on Jinhsi's own slot and watching every
 * action from updateGlobal() (the Jingran shape: reacting to teammates' turns, paying onto her).
 * Twelve channels, one per (attribute, coordinated?) — the six attributes, Physical (the Tune
 * Break) being no Attribute DMG — each a buff of her own that stands while the channel cools: a
 * paying action's element pays +1 Incandescence off its same-attribute channel and a Coordinated
 * Attack pays +2 off its own channel beside it, and each closes for 3s, or 1s while Temporal
 * Bender stands (the kit's own 1s, which speeds both sides up). A DOT tick is ignored outright.
 * The 50 cap is INCANDESCENCE's own maxStacks.
 */
/** Temporal Bender's own 20s window, off either of her outros. Its only job is to speed Eras in
 *  Unity's channels up, so it carries no stat of its own. */
const TEMPORAL_BENDER = new Buff({ name: "Jinhsi: Temporal Bender", duration: 60 * 20 });

/** The twelve channels, held on her own slot while each is cooling. */
const ERAS_CHANNELS = new Map<Attribute, [Buff, Buff]>();
for (const [attribute, label] of [[Attribute.Aero, "Aero"], [Attribute.Electro, "Electro"], [Attribute.Fusion, "Fusion"], [Attribute.Glacio, "Glacio"], [Attribute.Spectro, "Spectro"], [Attribute.Havoc, "Havoc"]] as [Attribute, string][]) {
  const channel = (name: string): Buff => new Buff({ name, duration: () => (isHeld(TEMPORAL_BENDER) ? 60 : 180) });
  ERAS_CHANNELS.set(attribute, [channel(`Jinhsi: Eras in Unity - ${label}`), channel(`Jinhsi: Eras in Unity - ${label} (Coordinated)`)]);
}
const ERAS_IN_UNITY = new Buff({
  name: "Jinhsi: Eras in Unity",
  updateGlobal: () => {
    const a = currentAction();
    // a DOT tick (the Negative Status ladders) is nobody's attack, and the six attributes only: a
    // Physical hit (the Tune Break) is no Attribute DMG
    if (a.scaling === Scaling.Dot || !a.element || a.element === Attribute.Physical || a.mv <= 0) return;
    const [plain, coordinated] = ERAS_CHANNELS.get(a.element)!;
    if (!isHeld(plain)) {
      applyCurrent(plain, 1);
      applyTeam(INCANDESCENCE, 1);
    }
    if (isType(Type2.Coordinated) && !isHeld(coordinated)) {
      applyCurrent(coordinated, 1);
      applyTeam(INCANDESCENCE, 2);
    }
  },
});

/** Incandescence itself: what Eras in Unity banks, up to 50, with the cap carried by the stacks'
 *  own ceiling. Every stack held pays +44.54% DMG Multiplier onto Stella Glamor, which consumes
 *  the lot — the buff's whole payout is that one row of her forte. Held team-wide so the count
 *  reads on every row of the log; the Stella Glamor gate keeps the payout hers alone. */
const INCANDESCENCE = new Buff({
  name: "Jinhsi: Incandescence", maxStacks: 50,
  applyStats: () => { if (runningAction(StellaGlamor)) addStat(Stat.AddMv, 44.54 * frozenStacks()); },
  convertStats: () => { if (runningAction(StellaGlamor)) revokeTeam(INCANDESCENCE); },
});

/** Radiant Surge (Inherent Skill): +20% Spectro DMG Bonus, genuinely unconditional. */
const RADIANT_SURGE = new Inherent({
  name: "Inherent: Radiant Surge",
  stats: [[Stat.DmgBonus, 20, Attribute.Spectro]],
});

/** Converged Flash (Inherent Skill): Loong's Halo's own DMG Multiplier +50%. */
const CONVERGED_FLASH = new Inherent({
  name: "Inherent: Converged Flash",
  applyStats: () => { if (runningAction(Intro)) addStat(Stat.MulMv, 50); },
});

/* --------------------------------------------------------------------------- resonance chain */

/** S1's own stacking buff: one per Incarnation basic or Crescent Divinity, four at most, spent by
 *  Illuminous Epiphany. Both halves of that press are the one skill, so each stack pays on Solar
 *  Flare and on the Stella Glamor behind it, and it is Stella Glamor — the last of the pair — that
 *  consumes the lot, the same way Incandescence does. The 6s never binds: her rotation builds the
 *  four and spends them inside one burst (BA1-3, Crescent Divinity, BA4, Epiphany). */
const HERALD_OF_REVIVAL = new Buff({
  name: "Jinhsi S1: Herald of Revival", maxStacks: 4, duration: 60 * 6,
  applyStats: () => {
    if (runningAction(Skill4) || runningAction(StellaGlamor)) addStat(Stat.DmgBonus, 20 * frozenStacks());
  },
  convertStats: () => { if (runningAction(StellaGlamor)) revokeCurrent(HERALD_OF_REVIVAL); },
});

const JX_S1 = new Sequence({
  name: "Jinhsi S1: Abyssal Ascension",
  updateBuffs: () => {
    if (runningAction(IncBA1) || runningAction(IncBA2) || runningAction(IncBA3) || runningAction(IncBA4) || runningAction(Skill3)) {
      applyCurrent(HERALD_OF_REVIVAL, 1);
    }
  },
});

/** S2: 50 Incandescence back for standing *out of combat* 4s. A rotation here is one unbroken
 *  fight, so this never fires — the node is held for its name, like Phrolova's own S5. */
const JX_S2 = new Sequence({ name: "Jinhsi S2: Chronofrost Repose" ,
  combatStart: () => { applyTeam(INCANDESCENCE, 50); },
});

/** S3's stacks: +25% ATK apiece, two at most, one per Intro she casts. Its 20s covers her whole
 *  double-Intro pair, so the mid-loop outro — the free one Unison pays for, which she comes
 *  straight back from — keeps them and only the bar-paid outro that ends the loop drops them. */
const IMMORTALS_DESCENDANCY = new Buff({
  name: "Jinhsi S3: Immortal's Descendancy", maxStacks: 2, duration: 60 * 20,
  stats: [[Stat.BonusAtk, 25]], perStack: true,
});

const JX_S3 = new Sequence({
  name: "Jinhsi S3: Celestial Incarnate",
  grants: [{ on: onAction(Intro), buff: IMMORTALS_DESCENDANCY }],
});

/** S4: "all nearby Resonators", so it pays on their inactive actions too; "Attribute DMG Bonus"
 *  with no attribute named, so it goes on untagged. 20s team buff — lost on her own next Intro. */
const JX_S4_TEAM = new Buff({
  name: "Jinhsi S4: Benevolent Grace",
  duration: 60 * 20,
  stats: [[Stat.DmgBonus, 20]],
});

const JX_S4 = new Sequence({
  name: "Jinhsi S4: Benevolent Grace",
  // Solar Flare is the press; Stella Glamor is the detonation behind it, not a second cast
  updateBuffs: () => {
    if (runningAction(Liberation) || runningAction(Skill4)) applyTeam(JX_S4_TEAM, 1);
  },
});

/** S5: Purge of Light's own 1666.03% x 2.2, which is nanoka's second row for it. */
const JX_S5 = new Sequence({
  name: "Jinhsi S5: Frostfire Illumination",
  applyStats: () => { if (runningAction(Liberation)) addStat(Stat.MulMv, 120); },
});

/** S6: the same +45% on both halves of Illuminous Epiphany — and, because a motion value is
 *  `(base + added) x (1 + multiplier)` (damage.ts), the one multiplier lifts the 44.54% per
 *  Incandescence stack by 45% too, which is the node's second clause. */
const JX_S6 = new Sequence({
  name: "Jinhsi S6: Thawing Triumph",
  applyStats: () => {
    if (runningAction(Skill4) || runningAction(StellaGlamor)) addStat(Stat.MulMv, 45);
  },
});

/* --------------------------------------------------------------------------- kit and loadout */

const JINHSI_TALENTS = new Talent({
  name: "Jinhsi: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

const JINHSI_RESONATOR = new Resonator({
  name: "Jinhsi",
  matrix: matrix("Jinhsi", 25),
  talent: JINHSI_TALENTS,
  inherent1: RADIANT_SURGE,
  inherent2: CONVERGED_FLASH,
  element: Attribute.Spectro,
  weapon: WeaponType.Broadblade,
  intro: () => Intro,
  outro: () => (isHeld(UNISON) ? OutroUnison : Outro),
  color: "#c2ecfb",
  maxEnergy: 150,

  // Eras in Unity is hers the moment she is on the team, well before her first turn
  combatStart: () => applyCurrent(ERAS_IN_UNITY, 1),

  stats: [[Stat.BaseHp, 10825], [Stat.BaseAtk, 412.5], [Stat.BaseDef, 1258.8866]],
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
const BA1234 = new ActionGroup("Basic - Slash of Breaking Dawn 1234", [BA1, BA2, BA3, BA4]);

const IncBA12 = new ActionGroup("Basic - Incarnation 12", [IncBA1, IncBA2]);
const IncBA34 = new ActionGroup("Basic - Incarnation 34", [IncBA3, IncBA4]);

const JX_ROTATION = new Rotation([
  START_3, Liberation, SWAP,

  NOINTRO, BA1234, Skill2.dodgeCancel(), ECHO_ONFIELD, 
  IncBA1, IncBA2.jumpCancel(), IncBA3.jumpCancel(), IncBA4, 
  Skill4_Unison, OUTRO,

  DOUBLE_INTRO, Skill2.dodgeCancel(), 
  IncBA12, Skill3, IncBA34,
  ECHO_ONFIELD, Skill4_Unison, OUTRO,

  INTRO, Skill2.dodgeCancel(),
  IncBA12, Skill3, IncBA34,
  Skill4, Liberation, OUTRO,
]);

// her support rotation lists a Liberation every visit and the bar only fills for half of them, so
// each one is gated: the START cast plays, the opener's is skipped, and the loops alternate on
// her main-DPS rotation with both Liberations gated: the double-Intro visit stays, but the bar
// only fills every other time it comes round, so the cast alternates rather than being listed
// every loop and paid for on credit
const JX_ROTATION_EVERY_OTHER = new Rotation([
  START_3, EVERY_OTHER, Liberation, SWAP,

  NOINTRO, BA1234, Skill2.dodgeCancel(), ECHO_ONFIELD, 
  IncBA1, IncBA2.jumpCancel(), IncBA3.jumpCancel(), IncBA4, 
  Skill4_Unison, OUTRO,

  DOUBLE_INTRO, Skill2.dodgeCancel(), 
  IncBA12, Skill3, IncBA34,
  ECHO_ONFIELD, Skill4_Unison, OUTRO,

  INTRO, Skill2.dodgeCancel(),
  IncBA12, Skill3, IncBA34,
  Skill4, EVERY_OTHER, Liberation, OUTRO,
]);

const JX_ROTATION_SUPPORT = new Rotation([
  START_3, EVERY_OTHER, Liberation, SWAP,

  NOINTRO, BA1234, Skill2.dodgeCancel(), ECHO_ONFIELD, 
  IncBA1, IncBA2.jumpCancel(), IncBA3.jumpCancel(), IncBA4, 
  Skill4_Unison, EVERY_OTHER, Liberation, OUTRO,

  INTRO, Skill2.dodgeCancel(), ECHO_ONFIELD, 
  IncBA12, Skill3, IncBA34,
  Skill4_Unison, EVERY_OTHER, Liberation, OUTRO,
]);

const JX_ECHOES = [
  new EchoLoadout(JUE, CELESTIAL_LIGHT_5PC),
  new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC),
];

/** For teams whose Energy the rotation cannot keep up with — her Liberation every other visit
 *  instead of every one (see `JX_ROTATION_EVERY_OTHER`). */
export const JINHSI = new Loadout({
  resonator: JINHSI_RESONATOR,
  weapons: [AGES_OF_HARVEST, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: JX_ECHOES,
  sequences: [JX_S1, JX_S2, JX_S3, JX_S4, JX_S5, JX_S6],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  rotation: JX_ROTATION_EVERY_OTHER,
});

export const JINHSI_SUPPORT = new Loadout({
  resonator: JINHSI_RESONATOR,
  weapons: [AGES_OF_HARVEST, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: JX_ECHOES,
  sequences: [JX_S1, JX_S2, JX_S3, JX_S4, JX_S5, JX_S6],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  rotation: JX_ROTATION_SUPPORT,
});
