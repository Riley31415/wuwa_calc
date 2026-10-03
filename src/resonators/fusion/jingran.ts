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
 *  - Hark the Dust: casting Intro Skill/Encroaching Yin/Scorching Yang grants Earth Charm, 15s of
 *    a shield whenever he deals damage as the active resonator (0.5s cooldown).
 *  - Trace the Vestige: on entering combat, tops Ghost Shroud to 25 if under; when a *teammate's*
 *    own shield lands, Jingran gains 2 Ghost Shroud a shield — bundled with Fixation, its own
 *    one-shot bonus on that same trigger (granted on combat start and his own Outro, pays a flat
 *    +15 more on top the next time a teammate shields, then is spent).
 * The teammate half is a hidden team buff, so it sees a shield gained on anyone's cast or hit.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  asSource,
  addToCast,
  addForte1,
  applyCurrent,
  forte2,
  removeStack,
  stacksOfTeam,
  revokeTeam,
  isHeld,
  onAction,
  runningAction,
  pressed,
  isActive,
  currentTeam,
  queue,
  revokeCurrent,
  addStat,
  getStat,
  frozenStacks,
  inflicting,
  runningBullet,
} from "../../engine/context.js";
import { ActionGroup, Action, ActionField, Rotation, ECHO, ActionTag, INTRO, START } from "../../engine/rotation.js";
import { applied, applyTeam } from "../../engine/context.js";
import { SHIELD, gainShield } from "../../shared/status.js";
import { JINGRAN_SIG, THUNDERFLARE_DOMINION, VERDANT_SUMMIT } from "../../weapons/broadblade.js";
import { NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { MYRIAD_SNARE, LAMP_5PC, LAMP_2PC } from "../../echoes/mengzhou.js";
import { tuneBreak } from "../../shared/tunebreak.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { COV_3PC } from "../../echoes/septimont.js";

/* ----------------------------------------------------------------------------------- actions */

function jingranAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// --- basics and mid-air. Stages 3/4 restore Qi. Unprefixed = Yang Font's own basic combo
//     (Devil's Bane); "Drink Soul" is Yin Vessel's.
const BA1 = jingranAction("Basic - Devil's Bane 1", { animFrames: 20, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 14, mv: 3982, energy: 67, concerto: 134, offtune: 2136 }]});
const BA2 = jingranAction("Basic - Devil's Bane 2", { animFrames: 43, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 16, mv: 5968, energy: 101, concerto: 201, offtune: 3202 },
    { hitFrame: 30, mv: 3979, energy: 67, concerto: 134, offtune: 2135 },
  ]});
const BA3 = jingranAction("Basic - Devil's Bane 3", { animFrames: 67, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 6, mv: 4773, energy: 81, concerto: 161, offtune: 2561 },
    { hitFrame: 18, mv: 4773, energy: 81, concerto: 161, offtune: 2561 },
    { hitFrame: 43, mv: 6364, energy: 107, concerto: 214, offtune: 3415 },
  ], castForte1: 50});
const BA4 = jingranAction("Basic - Devil's Bane 4", { animFrames: 52, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 6, mv: 8695, energy: 146, concerto: 292, offtune: 4665 },
    { hitFrame: 14, mv: 1243, energy: 21, concerto: 42, offtune: 667 },
    { hitFrame: 22, mv: 1243, energy: 21, concerto: 42, offtune: 667 },
    { hitFrame: 30, mv: 1243, energy: 21, concerto: 42, offtune: 667 },
  ], castForte1: 50});
const MA = jingranAction("Mid-air - Edge of Life and Death Plunge", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 9245, energy: 155, concerto: 310, offtune: 4960 }] });

const EBA1 = jingranAction("Basic - Drink Soul 1", { animFrames: 20, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 12, mv: 4474, energy: 75, concerto: 150, offtune: 2400 }]});
const EBA2 = jingranAction("Basic - Drink Soul 2", { animFrames: 33, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 3728, energy: 63, concerto: 125, offtune: 2000 },
    { hitFrame: 22, mv: 3728, energy: 63, concerto: 125, offtune: 2000 },
  ]});
const EBA3 = jingranAction("Basic - Drink Soul 3", { animFrames: 46, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 12, mv: 2733, energy: 46, concerto: 92, offtune: 1466 },
    { hitFrame: 20, mv: 2733, energy: 46, concerto: 92, offtune: 1466 },
    { hitFrame: 28, mv: 2733, energy: 46, concerto: 92, offtune: 1466 },
    { hitFrame: 36, mv: 2733, energy: 46, concerto: 92, offtune: 1466 },
  ], castForte1: 50});
const EBA4 = jingranAction("Basic - Drink Soul 4", { animFrames: 81, node: Node.Normal, cast: Cast.Basic, type: Type.Heavy, bullets: [
    { hitFrame: 14, mv: 4595, energy: 78, concerto: 155, offtune: 2465 },
    { hitFrame: 24, mv: 4595, energy: 78, concerto: 155, offtune: 2465 },
    { hitFrame: 51, mv: 3063, energy: 52, concerto: 103, offtune: 1644 },
    { hitFrame: 55, mv: 3063, energy: 52, concerto: 103, offtune: 1644 },
  ], castForte1: 50});

// --- dodge counters: Light Watch (Yang Font), Nether Dive (Yin Vessel), 100 Qi each
const DC = jingranAction("Dodge Counter - Light Watch", { animFrames: 67, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Heavy, bullets: [
    { hitFrame: 6, mv: 7457, energy: 126, concerto: 251, offtune: 4001 },
    { hitFrame: 18, mv: 7457, energy: 126, concerto: 251, offtune: 4001 },
    { hitFrame: 43, mv: 9943, energy: 167, concerto: 334, offtune: 5335 },
  ], castConcerto: 1000, castForte1: 100 });
const EDC = jingranAction("Dodge Counter - Nether Dive", { animFrames: 46, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Heavy, bullets: [
    { hitFrame: 12, mv: 4970, energy: 84, concerto: 167, offtune: 2666 },
    { hitFrame: 20, mv: 4970, energy: 84, concerto: 167, offtune: 2666 },
    { hitFrame: 28, mv: 4970, energy: 84, concerto: 167, offtune: 2666 },
    { hitFrame: 36, mv: 4970, energy: 84, concerto: 167, offtune: 2666 },
  ], castConcerto: 1000, castForte1: 100 });

// --- resonance skill. Scorching Yang/Afterlife's Guide are Yang Font's own tap+hold pair;
//     Encroaching Yin/Netherworld Traverse are Yin Vessel's.
const Skill1 = jingranAction("Skill - Scorching Yang", { animFrames: 47, cooldown: 60 * 15, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 14, mv: 6561, energy: 70, concerto: 140, offtune: 2240 },
    { hitFrame: 24, mv: 3281, energy: 35, concerto: 70, offtune: 1120 },
    { hitFrame: 37, mv: 3281, energy: 35, concerto: 70, offtune: 1120 },
    { hitFrame: 47, mv: 3281, energy: 35, concerto: 70, offtune: 1120 },
  ]});
const Skill2 = jingranAction("Skill - Afterlife's Guide", { animFrames: 79, node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, bullets: [
    { hitFrame: 12, mv: 6587, energy: 86, concerto: 125, offtune: 2734 },
    { hitFrame: 30, mv: 6587, energy: 86, concerto: 125, offtune: 2734 },
    { hitFrame: 71, mv: 13174, energy: 171, concerto: 250, offtune: 5468 },
  ], castForte1: 100});
const ESkill1 = jingranAction("Skill - Encroaching Yin", { animFrames: 48, cooldown: 60 * 15, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 14, mv: 6561, energy: 70, concerto: 140, offtune: 2240 },
    { hitFrame: 24, mv: 3281, energy: 35, concerto: 70, offtune: 1120 },
    { hitFrame: 37, mv: 3281, energy: 35, concerto: 70, offtune: 1120 },
    { hitFrame: 47, mv: 3281, energy: 35, concerto: 70, offtune: 1120 },
  ]});
const ESkill2 = jingranAction("Skill - Netherworld Traverse", { animFrames: 80, node: Node.Skill, cast: Cast.Skill, type: Type.Heavy, bullets: [
    { hitFrame: 8, mv: 5169, energy: 67, concerto: 100, offtune: 2133 },
    { hitFrame: 24, mv: 2585, energy: 34, concerto: 50, offtune: 1067 },
    { hitFrame: 32, mv: 2585, energy: 34, concerto: 50, offtune: 1067 },
    { hitFrame: 64, mv: 3877, energy: 50, concerto: 75, offtune: 1600 },
    { hitFrame: 72, commitFrame: 64, mv: 3877, energy: 50, concerto: 75, offtune: 1600 },
    { hitFrame: 80, commitFrame: 64, mv: 3877, energy: 50, concerto: 75, offtune: 1600 },
    { hitFrame: 88, commitFrame: 64, mv: 3877, energy: 50, concerto: 75, offtune: 1600 },
  ], castForte1: 100});

const Lib = jingranAction("Liberation - Burial of Thousand Souls", {
  animFrames: 280, prioFrames: 280, timestop: [0, 280], motionStop: [0, 280], cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Heavy, bullets: [
    { hitFrame: 184, mv: 9315, offtune: 21000 },
    { hitFrame: 196, mv: 9315, offtune: 21000 },
    { hitFrame: 208, mv: 9315, offtune: 21000 },
    { hitFrame: 262, mv: 9315, offtune: 21000 },
    { hitFrame: 270, commitFrame: 262, mv: 9315, offtune: 21000 },
    { hitFrame: 280, commitFrame: 262, mv: 9315, offtune: 21000 },
    { hitFrame: 290, commitFrame: 262, mv: 9315, offtune: 21000 },
    { hitFrame: 300, commitFrame: 262, mv: 9315, offtune: 21000 },
  ], castForte1: 200, castForte2: 10000, resetEnergy: true, castConcerto: 2000,
});
/** One per heavy attack while Mingfire is up. Node Liberation (attributed to it) but no `cast`:
 *  it's a summon, not a press. */
const ACTION_LIB_FUA = jingranAction("Liberation - Chimei Wangliang", { tag: ActionTag.Field, animFrames: 54, node: Node.Liberation, type: Type.Heavy, bullets: [{ hitFrame: 54, commitFrame: 0, mv: 8351 }]});

// his Intro trades every Ghost Shroud held for the same count of Fortune in Disguise — run here,
// ahead of JINGRAN_RESONATOR's own per-shield grant, so a shield the Intro itself grants carries into the
// next cycle rather than being spent by that same cast
const Intro = jingranAction("Intro - Question the Tombs", {
  animFrames: 63, noSwapFrames: 60, prioFrames: 60, motionStop: [5, 58],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 46, mv: 19881, energy: 1000, offtune: 8000 }], castConcerto: 1000, castForte1: 100,
  updateBuffs: () => {
    const shroud = stacksOfTeam(JINGRAN_GHOST_SHROUD);
    if (shroud) { revokeTeam(JINGRAN_GHOST_SHROUD); applyCurrent(JINGRAN_FORTUNE, shroud); }
  },
});
const Outro = jingranAction("Outro - Rising Fortune and Ebbing Evil", {
  animFrames: 0,
  cast: Cast.Outro, type: Type.Outro, bullets: [{ hitFrame: 0, mv: 79500 }], minConcerto: 10000, castConcerto: -10000,
  resetForte2: true,
  updateBuffs: () => revokeCurrent(JINGRAN_FORTUNE),
});

// --- heavy attacks ("forte skills"). Unprefixed = Yang Font's own (FHA = Stardome Meander,
//     switches him to Yin Vessel on landing), EFHA (Yin Vessel's own) = Soul Raid.
// the cast burns the Mingfire and refunds the Qi off the bar it found; Fire of Life itself boosts
// the heavy's hits and summons Chimei Wangliang once the press is over
const BURNS_MINGFIRE = {
  updateBuffs: () => {
    if (forte2() <= 0) return;
    applyCurrent(JINGRAN_FIRE_OF_LIFE, 1);
    queue(ACTION_LIB_FUA);
    addToCast({ forte2: -2500, forte1: forte2() > 2500 ? 200 : 0 });
  },
};
const FHA = jingranAction("Forte Heavy - Stardome Meander", { minForte1: 300, animFrames: 90, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 20, mv: 2404, energy: 85, concerto: 130, offtune: 1040 },
    { hitFrame: 38, mv: 2404, energy: 85, concerto: 130, offtune: 1040 },
    { hitFrame: 67, mv: 4808, energy: 170, concerto: 260, offtune: 2080 },
    { hitFrame: 80, mv: 14422, energy: 510, concerto: 780, offtune: 6240 },
  ], castForte1: -300, ...BURNS_MINGFIRE }); // 24.04%+24.04%+48.08%+144.22%
const EFHA = jingranAction("Forte Heavy - Soul Raid", { minForte1: 300, animFrames: 81, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 16, mv: 1640, energy: 60, concerto: 91, offtune: 710 },
    { hitFrame: 24, mv: 1640, energy: 60, concerto: 91, offtune: 710 },
    { hitFrame: 48, mv: 2109, energy: 77, concerto: 117, offtune: 913 },
    { hitFrame: 61, mv: 2109, energy: 77, concerto: 117, offtune: 913 },
    { hitFrame: 69, mv: 2109, energy: 77, concerto: 117, offtune: 913 },
    { hitFrame: 77, mv: 13822, energy: 502, concerto: 767, offtune: 5981 },
  ], castForte1: -300, ...BURNS_MINGFIRE }); // 16.40%x2+21.09%x3+138.22%

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
 *  a shield whenever *he* gains one of his own (at the shield's own 0.5s cooldown, `gainShield()`
 *  — granted on JINGRAN_RESONATOR's own updateBuffs() below, not here). Trace the Vestige
 *  (Inherent Skill) adds a second, separate income on top: +2 a shield on a *teammate's* own
 *  shield, plus a flat +15 more via Fixation — see JR_INHERENT_2 below. */
/** Held team-wide so the count reads on every row of the log rather than only his own, the way
 *  Jinhsi's Incandescence is — nothing but his Intro spends it and nothing but his own conversion
 *  reads it, so where it is parked changes no number. */
const JINGRAN_GHOST_SHROUD = new Buff({ name: "Jingran: Ghost Shroud", maxStacks: 50 });

/** Granted by Intro Skill, Encroaching Yin, or Scorching Yang: while held, every hit he deals as the
 *  active resonator shields him (`gainShield()`'s 0.5s cooldown) — JINGRAN_RESONATOR's updateDebuffs. */
const JINGRAN_EARTH_CHARM = new Buff({ name: "Jingran: Earth Charm", duration: 60 * 15 });
const JR_INHERENT_1 = new Inherent({
  name: "Inherent: Hark the Dust",
  updateBuffs: () => {
    if (runningAction(Intro) || runningAction(Skill1) || runningAction(ESkill1)) applyCurrent(JINGRAN_EARTH_CHARM, 1);
  },
});

/** Fusion damage scaled off Max HP per stack, own ceiling. The one HP-scaled buff here with a
 *  real stack count (Ghost Shroud converts 1:1 into it on his intro), so its own display()
 *  reproduces "name xN" and appends the HP breakpoint after. */
const JINGRAN_FORTUNE = new Buff({
  name: "Jingran: Fortune in Disguise", maxStacks: 50, duration: 60 * 15,
  convertStats: () => {
    const steps = hpSteps(); // 0.05% fusion per 1000 Max HP per stack, capped at 2.5%
    addStat(Stat.DmgBonus, Math.min(2.5, 0.05 * steps) * frozenStacks(), Attribute.Fusion);
  },
});

/** A one-shot bonus: the next teammate (not his own) shield after it's granted pays a flat 15
 *  Ghost Shroud more on top of Trace the Vestige's own base 2-a-shield rate, and spends it. Held
 *  team-wide so the watcher below can spend it on whoever's turn the shield lands. */
const JINGRAN_FIXATION = new Buff({ name: "Jingran: Fixation" });
/** Trace the Vestige's own 0.5s trigger cooldown. */
const VESTIGE_COOLDOWN = new Buff({ name: "Jingran: Trace the Vestige Cooldown", duration: 30, hidden: true });
// a teammate's shield, gained on their cast or their hit: +2 Ghost Shroud, +15 more on Fixation
const vestige = (): void => {
  if (currentTeam().slot.resonator === JINGRAN_RESONATOR || !applied(SHIELD) || stacksOfTeam(VESTIGE_COOLDOWN)) return;
  applyTeam(VESTIGE_COOLDOWN, 1);
  applyTeam(JINGRAN_GHOST_SHROUD, 2);
  if (!stacksOfTeam(JINGRAN_FIXATION)) return;
  revokeTeam(JINGRAN_FIXATION);
  applyTeam(JINGRAN_GHOST_SHROUD, 15);
};
/** The watcher itself, team-held so it runs on every member's turn — after the caster's own gear,
 *  so a shield their cast grants is already applied. */
const VESTIGE = new Buff({ name: "Jingran: Trace the Vestige", hidden: true, updateBuffs: vestige, hitGlobal: vestige });
const JR_INHERENT_2 = new Inherent({
  name: "Inherent: Trace the Vestige",
  combatStart: () => {
    applyTeam(VESTIGE, 1);
    applyTeam(JINGRAN_FIXATION, 1); // "upon engaging in combat, Jingran gains Fixation"
    applyTeam(JINGRAN_GHOST_SHROUD, 25); // "upon entering combat, tops Ghost Shroud up to 25"
  },
  grants: [{ on: onAction(Outro), buff: JINGRAN_FIXATION, to: BuffTarget.Team }],
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
  // S3 replaces it with Yin-Yang Everflow's own 50 a step (capped 2500) while that window stands
  convertStats: () => {
    const steps = hpSteps(); // 36 ATK/1000 HP, capped 1800
    addStat(Stat.FlatAtk, 36 * steps);
    // S3's Yin-Yang Everflow takes the step to 50 — the 14 more a step is that node's own
    if (isHeld(JR_EVERFLOW)) asSource(JR_S3, () => addStat(Stat.FlatAtk, 14 * steps));
  },
});

/** While Mingfire (forte2) is lit, a heavy attack burns up to 25 of it, summons Chimei
 *  Wangliang, boosts its own motion value off HP above the first 25,000, and — above 25 Mingfire
 *  — refunds 200 Qi. Self-applied the moment a heavy attack catches Mingfire lit (`BURNS_MINGFIRE`,
 *  which spends and refunds on the cast), and gone with that heavy's end. */
function fireSteps(): number { return Math.max(0, Math.floor((Math.min(hp(), 50000) - 25000) / 1000)); }

const JINGRAN_FIRE_OF_LIFE = new Buff({
  name: "Jingran: Fire of Life",
  // its own heavy's hits only, not another press's still landing behind it
  convertStats: () => {
    // the whole heavy's on its final hit: 2.17%+2.17%+4.33%+12.98% / 1.48%x2+1.90%x3+12.44%
    if (runningBullet(FHA, -1)) addStat(Stat.AddMv, 2165 * fireSteps());
    if (runningBullet(EFHA, -1)) addStat(Stat.AddMv, 2110 * fireSteps());
  },
  afterAction: () => {
    if (!runningAction(FHA) && !runningAction(EFHA)) return;
    revokeCurrent(JINGRAN_FIRE_OF_LIFE);
  },
});

/* --------------------------------------------------------------------------------- sequences */

/** S1: all four Resonance Skill forms at x1.8 — nanoka's second rows (118.10%+59.05%*3,
 *  93.03%+46.52%*2+69.77%*4, 118.57%*2+237.13%), and nothing else multiplies them, so a plain
 *  multiplier lands on exactly that. The interrupt immunity is no stat. */
const JR_S1 = new Sequence({
  name: "Jingran S1: Yin and Yang in Harmony, the Ultimate Law of Being",
  applyStats: () => {
    if (runningAction(Skill1) || runningAction(Skill2) || runningAction(ESkill1) || runningAction(ESkill2)) addStat(Stat.MulMv, 80);
  },
});

/** Netherworld's Boon (S2): banked on entering combat and spent by the first Soul Raid or Stardome
 *  Meander — a quarter of the Energy bar back and 180% amplification on the cast that takes it. The
 *  4s the amplification then stands for is no clock here, and the heavy that spent it is the only
 *  one inside that window in the loop below anyway. */
const NETHERWORLDS_BOON = new Buff({
  name: "Jingran S2: Netherworld's Boon",
  updateBuffs: () => {
    if (runningAction(FHA) || runningAction(EFHA)) addToCast({ energy: 3125 });
  },
  applyStats: () => {
    if (runningAction(FHA) || runningAction(EFHA)) addStat(Stat.Amp, 180);
  },
  afterAction: () => {
    if (runningAction(FHA) || runningAction(EFHA)) revokeCurrent(NETHERWORLDS_BOON);
  },
});
/** S2: both Forte heavies at x1.46 — nanoka's second rows (35.10%+35.10%+70.19%+210.56% and
 *  23.95%*2+30.79%*3+201.80%) — which is one multiplier over the whole bracket, so it carries Fire
 *  of Life's own per-HP increase with it, exactly as the node's second sentence says. Entering
 *  combat banks 300 Qi and the Boon above. */
const JR_S2 = new Sequence({
  name: "Jingran S2: A Solitary Lantern, Across Lands Shade-Trodden",
  combatStart: () => { addForte1(300); applyCurrent(NETHERWORLDS_BOON, 1); },
  applyStats: () => {
    if (runningAction(FHA) || runningAction(EFHA)) addStat(Stat.MulMv, 46);
  },
});

/** Yin-Yang Everflow (S3): 15s off the Liberation, so it stands for his whole window — the ATK
 *  conversion above reads it. */
const JR_EVERFLOW = new Buff({
  name: "Jingran S3: Yin-Yang Everflow",
  duration: 60 * 15,
});
/** S3: five Ghost Shroud a Forte heavy, and the Everflow window above. */
const JR_S3 = new Sequence({
  name: "Jingran S3: World's Course Shifts, Each to Their Rightful Paths",
  updateBuffs: () => {
    if (runningAction(FHA) || runningAction(EFHA)) applyTeam(JINGRAN_GHOST_SHROUD, 5);
  },
  grants: [{ on: onAction(Lib), buff: JR_EVERFLOW }],
});

/** S4: +20% All-Attribute DMG Bonus to the team whenever anyone on it gains a Shield, 30s — his
 *  own casts shield on nearly every press, so it stands for the fight. */
const WHERE_REALITY_MEETS = new Buff({
  name: "Jingran S4: Where Reality Meets Illusion, Where Living Meet Dead",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 20]],
});
const JR_S4 = new Sequence({
  name: "Jingran S4: Where Reality Meets Illusion, Where Living Meet Dead",
  hitGlobal: () => { if (applied(SHIELD)) applyTeam(WHERE_REALITY_MEETS, 1); },
});

/** S5: a once-per-fight cheat death. No formula effect. */
const JR_S5 = new Sequence({ name: "Jingran S5: Ends Return to Beginnings, Truth of Life Laid Bare" });

/** The Parade's own field: its eight summons read as one row under the Liberation that opened it
 *  rather than eight lines through the visit. Fire of Life's own two carry no field and stay the
 *  separate lines they are. */
const PARADE_FIELD = new ActionField("Jingran: Parade of Thousand Souls");
/** The same Chimei Wangliang, filed under that field. */
const ACTION_PARADE_FUA = ACTION_LIB_FUA.variant("Liberation - Chimei Wangliang", { field: PARADE_FIELD });

/** Parade of Thousand Souls (S6): eight charges off the Liberation — the cast that lights Yinghuo
 *  — one spent per damaging press of his for another Chimei Wangliang, the same summon Fire of
 *  Life makes. Gone when Yinghuo does, and the next Liberation opens a fresh eight. */
const JR_PARADE = new Buff({
  name: "Jingran S6: Parade of Thousand Souls", maxStacks: 8, duration: 60 * 15,
  field: PARADE_FIELD,
  // it ends with Yinghuo, which nothing here marks — its own 15s is his visit either way, so the
  // window is what carries it rather than a poke at the Mingfire gauge, which is a different thing;
  // a charge a press that lands hits, taken as it is cast
  updateBuffs: () => {
    // never off a summon's own damage, or each would call up the next until the charges ran out
    if (runningAction(Lib) || runningAction(ACTION_LIB_FUA) || runningAction(ACTION_PARADE_FUA) || !pressed().bullets.length) return;
    removeStack(JR_PARADE, 1);
    queue(ACTION_PARADE_FUA);
  },
});
/** S6: the target takes 40% more Heavy Attack DMG from him, Chimei Wangliang at x1.8 (row 150.31%
 *  against 83.51%), and the Parade above. */
const JR_S6 = new Sequence({
  name: "Jingran S6: As Favors and Feuds Fade, New Stories Await",
  grants: [{ on: onAction(Lib), buff: JR_PARADE, stacks: 8 }],
  applyStats: () => {
    addStat(Stat.DamageTaken, 40, Type.Heavy);
    if (runningAction(ACTION_LIB_FUA) || runningAction(ACTION_PARADE_FUA)) addStat(Stat.MulMv, 80);
  },
});

const JR_SEQUENCES = [JR_S1, JR_S2, JR_S3, JR_S4, JR_S5, JR_S6];

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
const JINGRAN_TALENTS = new Talent({
  name: "Jingran: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusHp, 12]],
});

/** Shadow Step: every dodge she makes on the ground in combat — a fixed 30 + 25 Fusion, Basic
 *  Attack DMG. */
const ShadowStep = jingranAction("Dodge - Shadow Step", { animFrames: 20, type: Type.Basic, scaling: Scaling.Fixed, bullets: [{ hitFrame: 4, mv: 3000 }, { hitFrame: 16, mv: 2500 }]});

const JINGRAN_RESONATOR = new Resonator({
  name: "Jingran",
  stats: [[Stat.BaseHp, 15375], [Stat.BaseAtk, 312.5]],
  talent: JINGRAN_TALENTS,
  inherent1: JR_INHERENT_1,
  inherent2: JR_INHERENT_2,
  element: Attribute.Fusion,
  weapon: WeaponType.Broadblade,
  dodge: () => ShadowStep,
  color: "#f2c13c",
  intro: Intro,
  // his broadblade break lands its last hit at 80, not the class's 66
  tuneBreak: tuneBreak(94, [0, 94], [0, 64], [[4, 17334], [26, 22666], [80, 120000]]),
  maxEnergy: 12500,
  forteScale: [1, 0.01, 1, 1, 1],
  maxForte1: 300,
  maxForte2: 10000,

  // Nether to Light/Yang Changes, Yin Unites are Forte Circuit-scoped, not Inherent Skills —
  // self-applied here so they keep their own distinct source name.
  combatStart: () => {
    applyCurrent(JINGRAN_HP_TO_FUSION, 1);
    applyCurrent(JINGRAN_HP_TO_ATK, 1);
  },

  // Earth Charm: a shield on every hit he deals as the active resonator, at the shield's own cooldown
  updateDebuffs: () => {
    if (isActive() && isHeld(JINGRAN_EARTH_CHARM)) gainShield();
  },

  // base kit: +1 Ghost Shroud per shield whenever he gains one of his own
  grants: [{ on: inflicting(() => applied(SHIELD) > 0), buff: JINGRAN_GHOST_SHROUD, stacks: () => applied(SHIELD), to: BuffTarget.Team }],

});

// Qi economy: intro 100, liberation +200 to 300, each of the four heavy attacks spends 300 and
// the first three refund 200 while Mingfire is above 25.

const Skill12 = new ActionGroup("Skill - Encroaching Yin + Netherworld Traverse", [Skill1, Skill2]);
const ESkill12 = new ActionGroup("Skill - Scorching Yang + Afterlife's Guide", [ESkill1, ESkill2]);
const EBA234 = new ActionGroup("Basic - Drink Soul 234", [EBA2, EBA3, EBA4]);
const BA234 = new ActionGroup("Basic - Devil's Bane 234", [BA2, BA3, BA4]);

const JR_ROTATION = new Rotation([
  INTRO,
  Lib, FHA,
  EBA234.cancel(), EFHA,
  Skill12, FHA,
  ESkill12.cancel(), EFHA,
  ECHO.instaSwap(), Outro,
]);

const JR_ROTATION_S2 = new Rotation([
  START, FHA.instaSwap(),

  INTRO,
  Lib, EFHA,
  BA234.cancel(), FHA,
  ESkill12.cancel(), EFHA,
  Skill12, FHA,
  ECHO.instaSwap(), Outro,
]);


/* ----------------------------------------------------------------------------------- loadout */

// his real 44111 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const JINGRAN = new Loadout({
  resonator: JINGRAN_RESONATOR,
  weapons: [JINGRAN_SIG, NEW_STD_BRAUDBLADE, THUNDERFLARE_DOMINION, LUSTROUS_RAZOR, VERDANT_SUMMIT],
  echoLoadouts: [new EchoLoadout(MYRIAD_SNARE, LAMP_5PC),
  new EchoLoadout(MYRIAD_SNARE, COV_3PC, LAMP_2PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.HP4, Mainstat.Fusion3, Mainstat.ATK1, Mainstat.HP1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.HpPct, Substat.Heavy, Substat.AtkPct, Substat.FlatAtk),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.HpPct, Substat.Heavy, Substat.AtkPct, Substat.FlatAtk),
  rotation: { 0: JR_ROTATION, 2: JR_ROTATION_S2 },
  sequences: JR_SEQUENCES,
});
