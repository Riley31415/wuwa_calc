/**
 * Jingran, ported to the new engine — sequence-0 core loop only.
 *
 * Numbers from nanoka.cc (character 1212, Fusion broadblade).
 *
 *   Qi           forte1; a heavy attack costs 300, restored by basics/intro/skill follow-ups/
 *                dodge counters/liberation — every one of those declares its own delta straight
 *                on the action, no manual setForte1 anywhere in this file.
 *   Mingfire     forte2; 100 from liberation, 25 per heavy while lit — that spend, and the +200
 *                Qi refund above 25, both go through `addStat(AddForte1/AddForte2, ...)` inside
 *                Fire of Life's own convertStats() so both trace back to it in the forte hover.
 *   Ghost Shroud stacking buff, max 50; his intro spends it all for Fortune in Disguise.
 *
 * His real two Inherent Skills, confirmed off the page's own "INHERENT SKILLS" section (not the
 * Forte Circuit-scoped HP conversions — JINGRAN_HP_TO_FUSION/JINGRAN_HP_TO_ATK below, part of his
 * own "Qi Modulation" page section instead):
 *  - Hark the Dust: casting Intro Skill/Encroaching Yin/Scorching Yang grants Earth Charm (a
 *    shield-on-hit passive — healing/shield value out of scope, so it's a do-nothing marker).
 *  - Trace the Vestige: on entering combat, tops Ghost Shroud to 25 if under; when a *teammate's*
 *    own shield lands, Jingran gains 2 Ghost Shroud a shield — bundled with Fixation, its own
 *    one-shot bonus on that same trigger (granted on combat start and his own Outro, pays a flat
 *    +15 more on top the next time a teammate shields, then is spent).
 * Both react to *any* team member's shield via updateGlobal(), rather than needing to be
 * genuinely team-wide buffs just to be reachable from a teammate's turn.
 */
import { Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyCurrent,
  forte2,
  setForte2,
  stacksOf,
  isHeld,
  currentAction,
  currentTeam,
  queue,
  revokeCurrent,
  addStat,
  getStat,
  frozenStacks,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, INTRO, ECHO_SWAP, OUTRO } from "../../engine/rotation.js";
import { applied, applyTeam } from "../../engine/context.js";
import { SHIELD } from "../../shared/status.js";
import { JINGRAN_SIG, THUNDERFLARE_DOMINION, VERDANT_SUMMIT } from "../../weapons/broadblade.js";
import { NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { MYRIAD_SNARE, LAMP_5PC, LAMP_2PC } from "../../echoes/mengzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { COV_3PC } from "../../echoes/septimont.js";

/* ----------------------------------------------------------------------------------- actions */

function jingranAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// --- basics and mid-air. Stages 3/4 restore Qi. Unprefixed = Yang Font's own basic combo
//     (Devil's Bane); "Drink Soul" is Yin Vessel's.
const BA1 = jingranAction("Basic - Devil's Bane 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 39.82, energy: 0.67, concerto: 1.34, offtune: 2136 });
const BA2 = jingranAction("Basic - Devil's Bane 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 99.47, energy: 1.68, concerto: 3.35, offtune: 5337 });
const BA3 = jingranAction("Basic - Devil's Bane 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 159.1, energy: 2.69, concerto: 5.36, offtune: 8537, forte1: 50 });
const BA4 = jingranAction("Basic - Devil's Bane 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 124.24, energy: 2.09, concerto: 4.18, offtune: 6666, forte1: 50 });
const MA = jingranAction("Mid-air - Edge of Life and Death", { node: Node.Normal, cast: Cast.MidAir, type: Type1.Basic, mv: 92.45, energy: 1.55, concerto: 3.1, offtune: 4960 });

const EBA1 = jingranAction("Basic - Drink Soul 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 44.74, energy: 0.75, concerto: 1.5, offtune: 2400 });
const EBA2 = jingranAction("Basic - Drink Soul 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 74.56, energy: 1.26, concerto: 2.5, offtune: 4000 });
const EBA3 = jingranAction("Basic - Drink Soul 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 109.32, energy: 1.84, concerto: 3.68, offtune: 5864, forte1: 50 });
const EBA4 = jingranAction("Basic - Drink Soul 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Heavy, mv: 153.16, energy: 2.6, concerto: 5.16, offtune: 8218, forte1: 50 });

// --- dodge counters: Light Watch (Yang Font), Nether Dive (Yin Vessel), 100 Qi each
const DC = jingranAction("Dodge Counter - Light Watch", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Heavy, mv: 198.8, energy: 10, concerto: 6.68, offtune: 8000, forte1: 100 });
const EDC = jingranAction("Dodge Counter - Nether Dive", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Heavy, mv: 248.57, energy: 4.19, concerto: 18.36, offtune: 13337, forte1: 100 });

// --- resonance skill. Scorching Yang/Afterlife's Guide are Yang Font's own tap+hold pair;
//     Encroaching Yin/Netherworld Traverse are Yin Vessel's.
const Skill1 = jingranAction("Skill - Scorching Yang", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 5600 });
const Skill2 = jingranAction("Skill - Afterlife's Guide", { node: Node.Skill, cast: Cast.Skill, type: Type1.Heavy, mv: 258.47, energy: 3.35, concerto: 5, offtune: 10667, forte1: 100 });
const ESkill1 = jingranAction("Skill - Encroaching Yin", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 5600 });
const ESkill2 = jingranAction("Skill - Netherworld Traverse", { node: Node.Skill, cast: Cast.Skill, type: Type1.Heavy, mv: 263.48, energy: 3.43, concerto: 5, offtune: 10936, forte1: 100 });

const Lib = jingranAction("Liberation - Burial of Thousand Souls", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Heavy, mv: 745.2, // 93.15% x 8
  offtune: 168000, forte1: 200, forte2: 100, resetEnergy: true, concerto: 20,
});
/** One per heavy attack while Mingfire is up. Node Liberation (attributed to it) but no `cast`:
 *  it's a summon, not a press. */
const ACTION_LIB_FUA = jingranAction("Liberation - Chimei Wangliang", { node: Node.Liberation, type: Type1.Heavy, mv: 83.51 });

// his Intro trades every Ghost Shroud held for the same count of Fortune in Disguise — run here,
// ahead of JINGRAN_RESONATOR's own per-shield grant, so a shield the Intro itself grants carries into the
// next cycle rather than being spent by that same cast
const Intro = jingranAction("Intro - Question the Tombs", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.81, energy: 10, concerto: 10, offtune: 8000, forte1: 100,
  updateBuffs: () => {
    const shroud = stacksOf(JINGRAN_GHOST_SHROUD);
    if (shroud) { revokeCurrent(JINGRAN_GHOST_SHROUD); applyCurrent(JINGRAN_FORTUNE, shroud); }
  },
});
const Outro = jingranAction("Outro - Rising Fortune and Ebbing Evil", {
  cast: Cast.Outro, type: Type1.Outro, mv: 795, concerto: -100, active: false,
  updateBuffs: () => { revokeCurrent(JINGRAN_FORTUNE); setForte2(0); },
});

// --- heavy attacks ("forte skills"). Unprefixed = Yang Font's own (FHA = Stardome Meander,
//     switches him to Yin Vessel on landing), EFHA (Yin Vessel's own) = Soul Raid.
// granted here, not read here — JINGRAN_FIRE_OF_LIFE's own convertStats() does the spend/queue/
// MV-boost/Qi-refund work, this same action
const BURNS_MINGFIRE = { updateBuffs: () => { if (forte2() > 0) applyCurrent(JINGRAN_FIRE_OF_LIFE, 1); } };
const FHA = jingranAction("Forte Heavy - Stardome Meander", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 240.38, energy: 8.5, concerto: 13, offtune: 10400, forte1: -300, ...BURNS_MINGFIRE }); // 24.04%+24.04%+48.08%+144.22%
const EFHA = jingranAction("Forte Heavy - Soul Raid", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Heavy, mv: 234.29, energy: 8.53, concerto: 13, offtune: 10140, forte1: -300, ...BURNS_MINGFIRE }); // 16.40%x2+21.09%x3+138.22%

/* ------------------------------------------------------------------------------------ buffs */

/** The HP fold every HP-scaled conversion below reads. Only ever accurate from convertStats(): every
 *  other held Gear's own applyStats() has to have already run. */
function hp(): number {
  const base = getStat(Stat.BaseHp);
  return base + getStat(Stat.BonusHp) / 100 * base + getStat(Stat.FlatHp);
}

/** Same fold, for DEF — what `JINGRAN_HP_TO_FUSION` reads to zero his own DEF out exactly. */
function def(): number {
  const base = getStat(Stat.BaseDef);
  return base + getStat(Stat.BonusDef) / 100 * base + getStat(Stat.FlatDef);
}

/** How many whole 1000-HP steps his HP-scaled conversions read, capped at 50 (the shared 50,000
 *  HP ceiling). */
function hpSteps(): number { return Math.floor(Math.min(hp(), 50000) / 1000); }

/** Ghost Shroud — a resource; the stack count *is* the value. His intro spends it. Base kit: +1
 *  a shield whenever *he* gains one of his own (its own 0.5s ICD dropped, per the standing ICD
 *  simplification — granted on JINGRAN_RESONATOR's own updateBuffs() below, not here). Trace the Vestige
 *  (Inherent Skill) adds a second, separate income on top: +2 a shield on a *teammate's* own
 *  shield, plus a flat +15 more via Fixation — see JR_INHERENT_2 below. */
const JINGRAN_GHOST_SHROUD = new Buff({ name: "Jingran: Ghost Shroud", maxStacks: 50 });

/** Granted by Intro Skill, Encroaching Yin, or Scorching Yang. No stat of its own — a do-nothing
 *  marker, present in the resonator popover once one of those three casts, permanent uptime after. */
const JINGRAN_EARTH_CHARM = new Buff({ name: "Jingran: Earth Charm" });
const JR_INHERENT_1 = new Inherent({
  name: "Inherent: Hark the Dust",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Intro || a === Skill1 || a === ESkill1) applyCurrent(JINGRAN_EARTH_CHARM, 1);
  },
});

/** Fusion damage scaled off Max HP per stack, own ceiling. The one HP-scaled buff here with a
 *  real stack count (Ghost Shroud converts 1:1 into it on his intro), so its own display()
 *  reproduces "name xN" and appends the HP breakpoint after. */
const JINGRAN_FORTUNE = new Buff({
  name: "Jingran: Fortune in Disguise", maxStacks: 50,
  convertStats: () => {
    const steps = hpSteps(); // 0.05% fusion per 1000 Max HP per stack, capped at 2.5%
    addStat(Stat.DmgBonus, Math.min(2.5, 0.05 * steps) * frozenStacks(), Attribute.Fusion);
  },
});

/** A one-shot bonus: the next teammate (not his own) shield after it's granted pays a flat 15
 *  Ghost Shroud more on top of Trace the Vestige's own base 2-a-shield rate, and spends it. */
const JINGRAN_FIXATION = new Buff({ name: "Jingran: Fixation" });
const JR_INHERENT_2 = new Inherent({
  name: "Inherent: Trace the Vestige",
  combatStart: () => {
    applyCurrent(JINGRAN_FIXATION, 1); // "upon engaging in combat, Jingran gains Fixation"
    applyCurrent(JINGRAN_GHOST_SHROUD, 25); // "upon entering combat, tops Ghost Shroud up to 25"
  },
  updateBuffs: () => { if (currentAction() === Outro) applyCurrent(JINGRAN_FIXATION, 1); },
  // `currentSlot` is switched to Jingran's own slot for this call regardless of who's actually
  // acting, so `applySelf()`/`isHeld()` below always resolve against him specifically.
  updateGlobal: () => {
    const a = currentAction();
    if (currentTeam().slot.resonator === JINGRAN_RESONATOR || !applied(SHIELD)) return;
    applyCurrent(JINGRAN_GHOST_SHROUD, 2 * applied(SHIELD));
    if (isHeld(JINGRAN_FIXATION)) { revokeCurrent(JINGRAN_FIXATION); applyCurrent(JINGRAN_GHOST_SHROUD, 15); }
  },
});

/** Part of his Forte Circuit's own page section ("Qi Modulation"), not an Inherent Skill. His
 *  DEF is fixed at 0, plus two HP -> stat conversions in whole 1000 HP steps: Incoming Healing
 *  Bonus and Fusion DMG Bonus. Self-applied once at JINGRAN_RESONATOR's own combatStart (not added to the
 *  loadout) so it keeps its own distinct "@Nk HP" source name in the report's hover trace. */
const JINGRAN_HP_TO_FUSION = new Buff({
  name: "Jingran: Nether to Light",
  convertStats: () => {
    addStat(Stat.FlatDef, -def());
    const steps = hpSteps();
    addStat(Stat.HealingReceived, 6.2 * steps); // 6.2% Incoming Healing Bonus per 1000 HP, capped 310%
    addStat(Stat.DmgBonus, 1.5 * steps, Attribute.Fusion); // 1.5% fusion per 1000 HP, capped 75%
  },
});
/** Same Forte Circuit page section as Nether to Light above, same unconditional self-applied shape. */
const JINGRAN_HP_TO_ATK = new Buff({
  name: "Jingran: Yang Changes, Yin Unites",
  convertStats: () => {
    const steps = hpSteps();
    addStat(Stat.FlatAtk, 36 * steps); // 36 ATK/1000 HP, capped 1800
  },
});

/** While Mingfire (forte2) is lit, a heavy attack burns up to 25 of it, summons Chimei
 *  Wangliang, boosts its own motion value off HP above the first 25,000, and — above 25 Mingfire
 *  — refunds 200 Qi. Self-applied the moment a heavy attack catches Mingfire lit, so its
 *  convertStats() runs this same action, then revokes itself so it doesn't fire again next cast. */
function fireSteps(): number { return Math.max(0, Math.floor((Math.min(hp(), 50000) - 25000) / 1000)); }

const JINGRAN_FIRE_OF_LIFE = new Buff({
  name: "Jingran: Fire of Life",
  convertStats: () => {
    const a = currentAction();
    const mingfire = forte2();
    queue(ACTION_LIB_FUA);
    addStat(Stat.AddForte2, -25);
    if (mingfire > 25) addStat(Stat.AddForte1, 200);
    addStat(Stat.AddMv, (a === FHA ? 21.65 : 21.10) * fireSteps()); // 2.17%+2.17%+4.33%+12.98% / 1.48%x2+1.90%x3+12.44%
    revokeCurrent(JINGRAN_FIRE_OF_LIFE);
  },
});

const SHIELDS = new Map<Action, number>([
  [BA1, 1], [BA2, 1], [BA3, 2], [BA4, 2], [MA, 1], [EBA1, 1], [EBA2, 1], [EBA3, 2], [EBA4, 2],
  [DC, 1], [EDC, 1], [Skill1, 1], [ESkill1, 1], [Skill2, 3], [ESkill2, 3], [Lib, 3], [Intro, 1], [FHA, 2], [EFHA, 2],
]);

const JINGRAN_RESONATOR = new Resonator({
  name: "Jingran",
  element: Attribute.Fusion,
  weapon: WeaponType.Broadblade,
  intro: () => Intro,
  outro: () => Outro,
  color: "#f2603c",
  maxEnergy: 125,

  // Nether to Light/Yang Changes, Yin Unites are Forte Circuit-scoped, not Inherent Skills —
  // self-applied here so they keep their own distinct source name.
  combatStart: () => {
    applyCurrent(JINGRAN_HP_TO_FUSION, 1);
    applyCurrent(JINGRAN_HP_TO_ATK, 1);
  },

  // every cast of his shields — two off the chain closers, both enhanced skills, the Liberation
  // and both Forte heavies, one off everything else
  updateDebuffs: () => {
    const n = SHIELDS.get(currentAction());
    if (n) applyCurrent(SHIELD, n);
  },

  // base kit: +1 Ghost Shroud per shield whenever he gains one of his own
  updateBuffs: () => { if (applied(SHIELD)) applyCurrent(JINGRAN_GHOST_SHROUD, applied(SHIELD)); },

  constantStats: () => {
    addStat(Stat.BaseHp, 15375); addStat(Stat.BaseAtk, 313);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
const JINGRAN_TALENTS = new Talent({
  name: "Jingran: Talents",
  constantStats: () => { addStat(Stat.CritRate, 8); addStat(Stat.BonusHp, 12); }
});

// Qi economy: intro 100, liberation +200 to 300, each of the four heavy attacks spends 300 and
// the first three refund 200 while Mingfire is above 25.

const EBA234 = new ActionGroup("Basic - Drink Soul 234", [EBA2, EBA3, EBA4]);

const JR_ROTATION = new Rotation([
  INTRO, Lib, FHA,
  ESkill1, ESkill2, EFHA,
  Skill1, Skill2, FHA,
  EBA234, EFHA,
  ECHO_SWAP, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// his real 44111 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const JINGRAN = new Loadout({
  resonator: JINGRAN_RESONATOR,
  talent: JINGRAN_TALENTS,
  inherent1: JR_INHERENT_1,
  inherent2: JR_INHERENT_2,
  weapons: [JINGRAN_SIG, NEW_STD_BRAUDBLADE, THUNDERFLARE_DOMINION, LUSTROUS_RAZOR, VERDANT_SUMMIT],
  echoLoadouts: [new EchoLoadout(MYRIAD_SNARE, LAMP_5PC),
  new EchoLoadout(MYRIAD_SNARE, COV_3PC, LAMP_2PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.HP4, Mainstat.Fusion3, Mainstat.ATK1, Mainstat.HP1),
  substat: chem("hp", "heavy"),
    rotation: JR_ROTATION,
});
