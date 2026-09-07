/**
 * Suoming — an Electro Sword main DPS whose damage is nearly all Basic Attack DMG: every Intro,
 * both Forte skills and Engraved Heart are "considered Basic Attack DMG" by her own text, so only
 * Rift Cleaver, Crimson Gleam and the Liberation are anything else.
 *
 * Three states, named rather than tracked as live combo state (the Jinhsi/Camellya shape), with
 * **Delusion** (forte 1, 800 cap) as the one gauge:
 *
 * - **Awakened Mind** (the default, DEEP_MIND not held): Furled Canopy basics build Delusion.
 *   Intro Flash Rift, or Sealed Delusion at a full bar, sends her into Deep Mind, clearing it.
 * - **Deep Mind**: Unfurled Canopy basics and Whirling Thunder build Delusion; the Liberation is
 *   only available here (+200 Delusion), and Intro Thunder Rending grants +200 too. At a full bar
 *   the Resonance Skill is Unforsaken Mind, after which the Basic Attack is Engraved Heart —
 *   **Calamity Mind** for its duration, cleared Delusion, and Awakened Mind the moment it ends
 *   (never a state anything reads, so not a marker here).
 * - The Rift Cleaver is the plain Resonance Skill in either state.
 *
 * **Unison** (shared/unison.ts): the Liberation grants it, 5s, once every 25s — one Liberation a
 * loop, so always. Two ways to spend it, and a loadout takes one:
 *
 * - Rift Cleaver with Unison (Sunken Seal, Forged Lock) removes it, spends 20 Concerto, clears
 *   Delusion and grants **Seal Master**: +40% DMG Multiplier on Unfurled Canopy and Whirling
 *   Thunder, +80% Crit. DMG, 12s or until switched out — the main-DPS way to play her, and the
 *   whole of SM_ROTATION_MDPS below.
 * - Swapping out with it (a Unison outro, the bar handed back) grants **Aligned Seals**, 30s, and
 *   with it her Outro hands the incoming resonator +30% Electro DMG Bonus, +20% a Unison Boon
 *   stack they hold up to +40%, 8s or until switched out; and Blight Rain, Miasmic Thunder summons
 *   a Thunder Crest coordinated attack a second off the active resonator's damage, six in all.
 *   Seal Master cannot be gained while Aligned Seals stands, and each ends the other. This is
 *   the one rotation written: a short sub-DPS visit that always leaves on the Unison outro.
 *
 * **Unison Response**: a teammate's Unison outro (Jinhsi's) makes her Intro its Unison form,
 * which hands the whole team Unison Boon — one stack from her this way, 30s refreshed, so
 * permanent — and a Unison Intro also pays +10 Concerto (Rain-Soaked Covenant, once every 25s).
 * Each stack is +3% DMG dealt to the team's responders, which is her alone. Sequences 1-6 are
 * modelled from nanoka's released 3.7.0 data (character 1312) — see their own block below.
 *
 * Numbers from encore.moe's beta data (character 1312, `?v=Beta`): per-hit MV/energy/concerto/
 * off-tune/Delusion summed per action the way CLAUDE.md describes, each Intro's "Concerto Regen
 * 10" added on top of its hits, and the dodge counters' hidden +10. The duplicated larger rows on
 * the intros (x1.6), Engraved Heart (x1.5) and the Unfurled basics (x1.4) are S1, S6 and Seal
 * Master re-shown — only Seal Master's contributes its multiplier here. Engraved Heart's held form
 * ("hold to continuously attack") has three unlabelled rows and no text of its own — not
 * modelled. Blight Rain's Thunder Crest window is the kit's own once a second, six at most,
 * as a coordinated window (helpers.ts's `coordinatedBuff`).
 */
import { Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addStat,
  applyCurrent,
  applyTeam,
  casting,
  currentAction,
  forte1,
  isHeld,
  queueOutro,
  revokeCurrent,
  setForte1,
  stacksOfTeam,
} from "../../engine/context.js";
import { Action, ActionField, ActionGroup, Rotation, DOUBLE_INTRO, INTRO, OUTRO, ECHO_SWAP, DODGE, NOINTRO } from "../../engine/rotation.js";
import { NINE_SHADOWS, UNISON, UNISON_BOON, UNISON_RESPONDER, respondToUnison, unisonIntro, unisonOutro, unisonResponse } from "../../shared/unison.js";
import { coordinatedBuff, lostOnSwap } from "../../shared/helpers.js";
import { RED_SPRING, UNSPOKEN_RUE } from "../../weapons/sword.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { STAY_TUNED, SWORN_VIGIL_5PC, ELECTRIC_REFLECTION_5PC, SOUL_OF_DESPAIR } from "../../echoes/mengzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function suomingAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Electro, scaling: Scaling.Atk, ...def });
}

// --- Furled Canopy, the Awakened Mind chain
const BA1 = suomingAction("Basic - Furled Canopy 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 31.55, energy: 1.91, concerto: 1.79, offtune: 3174, forte1: 120 });
const BA2 = suomingAction("Basic - Furled Canopy 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 15.73 * 2 + 31.46, energy: 0.95 * 2 + 1.9, concerto: 0.89 * 2 + 1.78, offtune: 1583 * 2 + 3165, forte1: 40 * 2 + 80 });
const BA3 = suomingAction("Basic - Furled Canopy 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 22.01 * 3 + 44.02, energy: 1.33 * 3 + 2.66, concerto: 1.25 * 3 + 2.5, offtune: 2214 * 3 + 4428, forte1: 36 * 3 + 72 });
const MA = suomingAction("Mid-air - Furled Canopy", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 84.2, energy: 5.09, concerto: 4.77, offtune: 8470 });
const DC = suomingAction("Dodge Counter - Furled Canopy", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 27.66 * 2 + 55.32, energy: 1.67 * 2 + 3.34, concerto: 1.57 * 2 + 3.13 + 10, offtune: 2783 * 2 + 5565, forte1: 160 });

// --- Unfurled Canopy, the Deep Mind chain, and Whirling Thunder held out of its stage 2
const UBA1 = suomingAction("Basic - Unfurled Canopy 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 65.42 + 32.71 * 2, energy: 1.58 + 0.79 * 2, concerto: 2 + 1 * 2, offtune: 3949 + 1975 * 2, forte1: 60 + 30 * 2 });
const UBA2 = suomingAction("Basic - Unfurled Canopy 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 114.4 + 38.14 * 3, energy: 2.77 + 0.93 * 3, concerto: 2 + 0.67 * 3, offtune: 5705 + 1902 * 3, forte1: 80 + 27 * 3 });
const UBA3 = suomingAction("Basic - Unfurled Canopy 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 58.64 * 4, energy: 1.42 * 4, concerto: 3.75 * 4, offtune: 3540 * 4, forte1: 45 * 4 });
const UBA4 = suomingAction("Basic - Unfurled Canopy 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 107.25 * 2 + 143, energy: 2.59 * 2 + 3.46, concerto: 4.5 * 2 + 6, offtune: 6474 * 2 + 8632, forte1: 54 * 2 + 72 });
const UHA1 = suomingAction("Heavy - Unfurled Canopy: Whirling Thunder 1", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Basic, mv: 73.32 * 3 + 36.66 * 2, energy: 1.77 * 3 + 0.89 * 2, concerto: 3.75 * 3 + 1.88 * 2, offtune: 4425 * 3 + 2213 * 2, forte1: 45 * 3 + 23 * 2 });
const UHA2 = suomingAction("Heavy - Unfurled Canopy: Whirling Thunder 2", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Basic, mv: 56.69 * 5, energy: 1.37 * 5, concerto: 3 * 5, offtune: 3422 * 5, forte1: 36 * 5 });
const UDC = suomingAction("Dodge Counter - Unfurled Canopy", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 174.04 + 58.02 * 3, energy: 4.21 + 1.41 * 3, concerto: 3.94 + 1.32 * 3 + 10, offtune: 7004 + 2335 * 3, forte1: 80 + 27 * 3 });

// --- Rift Cleaver, the plain Resonance Skill in either state. Holding Unison additionally spends
//     it, 20 Concerto, and every point of Delusion, for Seal Master (see SUNKEN_SEAL below).
//     Crimson Gleam is the follow-up a counter-cast Rift Cleaver triggers, which needs the target
//     to attack into it — left for a rotation to name.
const RiftCleaver = suomingAction("Skill - Furled Canopy: Rift Cleaver", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 106.61, energy: 3.68, concerto: 3.45, offtune: 6128,
  updateBuffs: () => {
    if (!isHeld(UNISON)) return;
    addStat(Stat.AddConcerto, -20);
    setForte1(0);
    revokeCurrent(UNISON);
    if (!isHeld(ALIGNED_SEALS)) applyCurrent(SEAL_MASTER, 1);
  },
});
const CrimsonGleamParry = suomingAction("Skill - Unfurled Canopy: Crimson Gleam", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 47.25 + 23.63 * 2 + 63, energy: 1.63 + 0.82 * 2 + 2.18, concerto: 1.53 + 0.77 * 2 + 2.04, offtune: 2717 + 1359 * 2 + 3622 });

// --- Umbral Canopy: Miasma Lock, Deep Mind only; grants Unison and 200 Delusion
const Liberation = suomingAction("Liberation - Umbral Canopy: Miasma Lock", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Liberation, mv: 69.59 * 7 + 208.76, concerto: 20, offtune: 8400 * 7 + 25200, forte1: 200, resetEnergy: true,
  updateBuffs: () => { applyCurrent(UNISON, 1); },
});
/** Blight Rain, Miasmic Thunder: the Thunder Crest, one a second off the active resonator's own
 *  damage during the Unison outro's window, on her own slot. */
const BLIGHT_RAIN_FIELD = new ActionField("Suoming: Blight Rain, Miasmic Thunder");
const ThunderCrest = suomingAction("Liberation - Blight Rain, Miasmic Thunder", {
  type: Type1.Liberation, type2: Type2.Coordinated, mv: 59.65, field: BLIGHT_RAIN_FIELD,
});

// --- the four Intros, all Basic Attack DMG: Furled forms from Awakened Mind (into Deep Mind,
//     Delusion cleared), Unfurled forms from Deep Mind (+200 Delusion); the (Unison) pair answer a
//     Unison outro and are what triggers Unison Response
const INTRO_FURLED = { node: Node.Intro, cast: Cast.Intro, resetForte1: true, type: Type1.Basic, mv: 110.89 * 2 + 36.97 * 4, energy: 3 * 2 + 1 * 4, concerto: 1.5 * 2 + 0.5 * 4 + 10, offtune: 5578 * 2 + 1860 * 4 };
const IntroFlashRift = suomingAction("Intro - Furled Canopy: Flash Rift", {
  ...INTRO_FURLED,
  updateBuffs: () => applyCurrent(DEEP_MIND, 1),
});
const IntroSealedDelusion = suomingAction("Intro - Furled Canopy: Sealed Delusion (Unison)", {
  ...INTRO_FURLED, updateDebuffs: respondToUnison,
  updateBuffs: () => applyCurrent(DEEP_MIND, 1),
});

const INTRO_UNFURLED = { node: Node.Intro, cast: Cast.Intro, type: Type1.Basic, mv: 131.43 * 3 + 65.72 * 2, energy: 2.5 * 3 + 1.25 * 2, concerto: 10, offtune: 4407 * 3 + 2204 * 2, forte1: 200 };
const IntroThunderRending = suomingAction("Intro - Unfurled Canopy: Thunder Rending", INTRO_UNFURLED);
const IntroWhirlingThunder = suomingAction("Intro - Unfurled Canopy: Whirling Thunder (Unison)", { ...INTRO_UNFURLED, updateDebuffs: respondToUnison });


const INTROS = [IntroFlashRift, IntroThunderRending, IntroSealedDelusion, IntroWhirlingThunder];

// --- Forte Circuit: the two full-bar skills and Engraved Heart behind them, all Basic Attack DMG
const SealedDelusion = suomingAction("Forte Skill - Furled Canopy: Sealed Delusion", {
  node: Node.Forte, cast: Cast.Skill, type: Type1.Basic, mv: 62.78 * 2 + 31.39 * 4, energy: 2.17 * 2 + 1.09 * 4, concerto: 2.03 * 2 + 1.02 * 4, offtune: 3609 * 2 + 1805 * 4,
  // only fires at a full 800 Delusion — maxForte1 (800) clamps an overrun back to the cap before
  // this lands exactly on 0, same as Engraved Heart's own -800
  forte1: -800,
  updateBuffs: () => applyCurrent(DEEP_MIND, 1),
});
const UnforsakenMind = suomingAction("Skill - Unfurled Canopy: Unforsaken Mind", { node: Node.Forte, cast: Cast.Skill, type: Type1.Basic, mv: 152.67, offtune: 8776 });
/** Calamity Mind for its own duration, Awakened Mind once it ends: Deep Mind is simply over. */
const EngravedHeart = suomingAction("Forte Basic - Umbral Canopy: Engraved Heart", {
  node: Node.Forte, cast: Cast.Basic, type: Type1.Basic, mv: 1939.29, energy: 20.49, concerto: 25, offtune: 26016,
  forte1: -800,
  updateBuffs: () => revokeCurrent(DEEP_MIND),
});

/** Canopy Rumble. With Unison still held this is the Unison outro: Aligned Seals, the Crest
 *  window, and the Aligned handoff on top of the ordinary one. Unison itself is spent by its own
 *  conversion, after these hooks. */
const Outro = suomingAction("Outro - Canopy Rumble", {
  cast: Cast.Outro, concerto: -100, swapOut: true,
  updateBuffs: () => {
    queueOutro(CANOPY_RUMBLE);
    if (isHeld(UNISON)) {
      applyCurrent(ALIGNED_SEALS, 1); revokeCurrent(SEAL_MASTER);
      applyTeam(BLIGHT_RAIN, 6);
    }
    if (isHeld(ALIGNED_SEALS)) queueOutro(ALIGNED_SEALS_HANDOFF);
  },
});
const OutroUnison = unisonOutro(Outro);

/* ------------------------------------------------------------------------------------- buffs */

/** The Deep Mind marker, no stat of its own — Awakened Mind is its absence. */
const DEEP_MIND = new Buff({ name: "Suoming: Deep Mind" });

/** Rain-Soaked Covenant (Inherent Skill): any Intro is +50% Electro DMG Bonus for 15s, ended
 *  early by switching out; a Unison Intro also pays +10 Concerto, once every 25s — once a loop. */
const RAIN_SOAKED_COVENANT = new Buff({
  name: "Suoming: Rain-Soaked Covenant",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(Stat.DmgBonus, 50, Attribute.Electro),
});
const RAIN_SOAKED_INHERENT = new Inherent({
  name: "Inherent: Rain-Soaked Covenant",
  updateBuffs: () => { if (INTROS.includes(currentAction())) applyCurrent(RAIN_SOAKED_COVENANT, 1); },
  applyStats: () => { if (currentAction() === IntroSealedDelusion || currentAction() === IntroWhirlingThunder) addStat(Stat.AddConcerto, 10); },
});

/** Seal Master: +40% DMG Multiplier on the Unfurled Canopy chain and Whirling Thunder, +80% Crit.
 *  DMG, 12s or until switched out. Gaining Unison ends it — the next
 *  Liberation — as does Aligned Seals (the Outro cast above). */
const SEAL_MASTER = new Buff({
  name: "Suoming: Seal Master",
  updateBuffs: () => { lostOnSwap(); if (isHeld(UNISON) && casting(Cast.Liberation)) revokeCurrent(SEAL_MASTER); },
  applyStats: () => {
    const a = currentAction();
    if (a === UBA1 || a === UBA2 || a === UBA3 || a === UBA4 || a === UHA1 || a === UHA2) addStat(Stat.MulMv, 40);
    addStat(Stat.CritDmg, 80);
  },
});

/** Aligned Seals: 30s, so permanent once she has left on a Unison outro. No stat of its own — it
 *  is what upgrades her Outro (ALIGNED_SEALS_HANDOFF) and what bars Seal Master. */
const ALIGNED_SEALS = new Buff({ name: "Suoming: Aligned Seals" });
const SUNKEN_SEAL = new Inherent({ name: "Inherent: Sunken Seal, Forged Lock" });

/** Canopy Rumble's handoff: +20% Electro DMG Amplification, and +25% Resonance Skill DMG
 *  Amplification while the holder has Unison Boon — 8s or until switched out, so lost on swap. */
const CANOPY_RUMBLE = new Buff({
  name: "Suoming: Outro",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => {
    addStat(Stat.Amp, 20, Attribute.Electro);
    if (stacksOfTeam(UNISON_BOON)) addStat(Stat.Amp, 25, Type1.Skill);
  },
});

/** The Aligned Seals half of her Outro: +30% Electro DMG Bonus, +20% a Unison Boon stack the
 *  holder has, up to +40% — 8s or until switched out. */
const ALIGNED_SEALS_HANDOFF = new Buff({
  name: "Suoming: Outro (aligned)",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(Stat.DmgBonus, 30 + Math.min(40, 20 * stacksOfTeam(UNISON_BOON)), Attribute.Electro),
});

/** Blight Rain, Miasmic Thunder's window: six Thunder Crests, one a second off the active
 *  resonator's own presses, on her slot however far the field has moved on. */
const BLIGHT_RAIN = coordinatedBuff("Suoming: Blight Rain, Miasmic Thunder", 6, () => SUOMING_RESONATOR, ThunderCrest);

/** Unison Response: her Unison Intro hands the team one stack of Unison Boon — one from her this
 *  way, refreshed after that. The marker is what remembers she already has. */
const BOON_RESPONSE = new Buff({ name: "Suoming: Unison Boon (response)" });

/* --------------------------------------------------------------------------------- sequences */

/** S1: +60% DMG Multiplier on all four Intros. Unforsaken Mind's interruption immunity is nothing
 *  the formula reads. */
const SM_S1 = new Sequence({
  name: "Suoming S1: Into the Blight Rain",
  applyStats: () => { if (INTROS.includes(currentAction())) addStat(Stat.MulMv, 60); },
});

/** S2's handoff: the incoming resonator's Crit. DMG +10%, +6% a Unison Boon stack they hold up to
 *  +24% — 30s or until switched out, so lost on swap. */
const BREAKING_THUNDER_HANDOFF = new Buff({
  name: "Suoming S2: Outro",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(Stat.CritDmg, 10 + Math.min(24, 6 * stacksOfTeam(UNISON_BOON))),
});
/** S2: +40% Crit. DMG, and her Outro carries the handoff above on top of Canopy Rumble. */
const SM_S2 = new Sequence({
  name: "Suoming S2: Breaking Thunder, Slaying Evil",
  constantStats: () => addStat(Stat.CritDmg, 40),
  updateBuffs: () => { if (casting(Cast.Outro)) queueOutro(BREAKING_THUNDER_HANDOFF); },
});

/** S3's own: +30% Basic Attack DMG Amplification off a Liberation, 25s — permanent. */
const LONE_CANOPY = new Buff({
  name: "Suoming S3: Lone Canopy, Solitary Road",
  applyStats: () => addStat(Stat.Amp, 30, Type1.Basic),
});
/** S3: Flash Rift and Thunder Rending — the Intros that are no response — grant the team's Unison
 *  Boon too, once every 25s. The kit's own clause makes it the one grant she has: a stack she has
 *  already put up is only refreshed, so it shares the response's marker rather than adding a
 *  second. And every Liberation opens the amplification above. */
const SM_S3 = new Sequence({
  name: "Suoming S3: Lone Canopy, Solitary Road",
  updateBuffs: () => {
    const a = currentAction();
    if ((a === IntroFlashRift || a === IntroThunderRending) && !isHeld(BOON_RESPONSE)) { applyTeam(UNISON_BOON, 1); applyCurrent(BOON_RESPONSE, 1); }
    if (casting(Cast.Liberation)) applyCurrent(LONE_CANOPY, 1);
  },
});

const SM_S4 = new Sequence({
  name: "Suoming S4: Covenant Borne Upon the Heart",
  constantStats: () => addStat(Stat.BonusAtk, 20),
});

const SM_S5 = new Sequence({
  name: "Suoming S5: Seal Deep, Never Forgotten",
  applyStats: () => { if (currentAction() === Liberation) addStat(Stat.MulMv, 40); },
});

/** S6: every Unison Boon stack pays the whole team's responders half again (unison.ts's own
 *  NINE_SHADOWS, up from the moment the fight starts), Engraved Heart's multiplier +50%, and Seal
 *  Master's Crit. DMG another +80%. */
const SM_S6 = new Sequence({
  name: "Suoming S6: Nine Shadows at Her Side",
  combatStart: () => applyTeam(NINE_SHADOWS, 1),
  applyStats: () => {
    if (currentAction() === EngravedHeart) addStat(Stat.MulMv, 50);
    if (isHeld(SEAL_MASTER)) addStat(Stat.CritDmg, 80);
  },
});

const SM_SEQUENCES = [SM_S1, SM_S2, SM_S3, SM_S4, SM_S5, SM_S6];

/* --------------------------------------------------------------------------- kit and loadout */

const SUOMING_TALENTS = new Talent({
  name: "Talents: Suoming",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.CritRate, 8); },
});

const SUOMING_RESONATOR = new Resonator({
  name: "Suoming",
  talent: SUOMING_TALENTS,
  inherent1: RAIN_SOAKED_INHERENT,
  inherent2: SUNKEN_SEAL,
  element: Attribute.Electro,
  weapon: WeaponType.Sword,
  // which state she is in, and whether the outro she answers was a Unison one — read off the
  // queue, since the handoff is adopted only once the Intro row itself is evaluated
  intro: () => (isHeld(DEEP_MIND)
    ? (unisonIntro() ? IntroWhirlingThunder : IntroThunderRending)
    : (unisonIntro() ? IntroSealedDelusion : IntroFlashRift)),
  outro: () => (isHeld(UNISON) ? OutroUnison : Outro),
  color: "#ea5d64",
  maxEnergy: 125,
  maxForte1: 800,
  // Unison Response: the team's Unison Boon, one stack from her, refreshed after the first
  updateBuffs: () => {
    if (unisonResponse() && !isHeld(BOON_RESPONSE)) { applyTeam(UNISON_BOON, 1); applyCurrent(BOON_RESPONSE, 1); }
  },
  // she can trigger Unison Response, so Unison Boon pays her (shared/unison.ts)
  combatStart: () => applyCurrent(UNISON_RESPONDER, 1),
  constantStats: () => {
    addStat(Stat.BaseHp, 10300); addStat(Stat.BaseAtk, 462.5); addStat(Stat.BaseDef, 1148.89);
  },
});

/* ---------------------------------------------------------------------------------- rotation */

/** The double-Intro sub-DPS loop. The pre-visit is the short one — in, the Liberation for its
 *  Unison, and straight out on the Unison outro, the bar handed back so she never pays a real
 *  one — leaving whoever plays next under six Thunder Crests and the Aligned handoff. Their outro
 *  brings her round again for the real visit: her Intro (its Unison form when the outro she
 *  answers carried one) banks 200 Delusion in Deep Mind, the Unfurled chain carries it past 800
 *  for Unforsaken Mind, and Engraved Heart spends the lot. */
const UBA234 = new ActionGroup("Basic - Unfurled Canopy 234", [UBA2, UBA3, UBA4]);
const UBA34 = new ActionGroup("Basic - Unfurled Canopy 34", [UBA3, UBA4]);
const UBA12 = new ActionGroup("Basic - Unfurled Canopy 12", [UBA1, UBA2]);
const UBA1234 = new ActionGroup("Basic - Unfurled Canopy 1234", [UBA1, UBA2, UBA3, UBA4]);
const BA123 = new ActionGroup("Basic - Furled Canopy 123", [BA1, BA2, BA3]);

const SM_ROTATION = new Rotation([
  NOINTRO, BA123, BA123, SealedDelusion,
  DOUBLE_INTRO, Liberation, OUTRO,

  INTRO, UHA2, RiftCleaver, UBA3, UBA4,
  UnforsakenMind, EngravedHeart, ECHO_SWAP, OUTRO,
]);

/** The Seal Master main-DPS loop, the kit's other way to spend a Unison. Her Intro drops her into
 *  Deep Mind on an empty bar, the Liberation is the Unison she is here for, and the Rift Cleaver
 *  behind it spends it — 20 Concerto and every point of Delusion the Liberation just paid — for
 *  the 12s Seal Master window. The whole Unfurled chain runs inside that window, its own
 *  multipliers +40% and hers +80% Crit. DMG, rebuilding the 800 Delusion for Unforsaken Mind;
 *  Engraved Heart spends the bar and leaves her in Awakened Mind, which is the state the next
 *  loop's Flash Rift is written for. */
const SM_ROTATION_MDPS = new Rotation([

  INTRO, Liberation, 
  RiftCleaver, UBA34, DODGE,
  UBA1234, DODGE,
  UBA12,
  UnforsakenMind, EngravedHeart,
  ECHO_SWAP, OUTRO,
]);

const SM_ECHOES = [
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(STAY_TUNED, ELECTRIC_REFLECTION_5PC),
  new EchoLoadout(SOUL_OF_DESPAIR, ELECTRIC_REFLECTION_5PC),
  new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC),
  new EchoLoadout(SOUL_OF_DESPAIR, SWORN_VIGIL_5PC),
];

export const SUOMING = new Loadout({
  resonator: SUOMING_RESONATOR,
  weapons: [UNSPOKEN_RUE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: SM_ECHOES,
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
  sequences: SM_SEQUENCES,
  rotation: SM_ROTATION,
});

export const SUOMING_MDPS = new Loadout({
  resonator: SUOMING_RESONATOR,
  weapons: [UNSPOKEN_RUE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Electro3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
  sequences: SM_SEQUENCES,
  rotation: SM_ROTATION_MDPS,
});