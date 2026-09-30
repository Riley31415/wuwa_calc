/**
 * Jiyan, ported to the new engine — a limited 5-star (`Tier.Limited`), Sequences 1-6 in their
 * own block below. An aero broadblade main DPS. His Liberation (Emerald Storm - Prelude)
 * deals no damage itself but opens Qingloong Mode (10s), replacing his kit with the three-stage
 * Heavy Attack Lance of Qingloong; cast with 30+ Resolve it queues Emerald Storm - Finale itself
 * (considered Heavy Attack DMG), spending the 30 — never placed in a rotation by hand. Windqueller inside the mode gets +20% DMG for
 * free; outside it consumes 30 Resolve (15 at S1) for the same +20%, or is the plain cast below
 * that — one action reading the mode and the gauge itself.
 *
 * Numbers from nanoka.cc (character 1404) — MV/energy/concerto/offtune all resolved off the
 * site's own level-10 damage table; no migrated-sheet rows exist for him. Resolve (forte1, cap
 * 60) gain amounts per hit are published nowhere, so they're hand-derived plausible values
 * (Intro 15, ordinary Lone Lance hits 5-10); only the "30 banked before Prelude" gate matters to
 * the rotation, and it clears exactly. Its 15s-idle decay isn't tracked.
 *
 * His two Inherent Skills, off the page's own "INHERENT SKILLS" section:
 *  - Heavenly Balance: +10% ATK for 15s after his Intro.
 *  - Tempest Taming: +12% Crit DMG for 8s whenever his attacks hit — held for his whole field
 *    window.
 * Discipline (Outro): the incoming resonator holds "Jiyan: Outro" x2, and each of their Heavy
 * casts consumes a charge to fire one 313.40% coordinated lance on Jiyan's own slot — same
 * "queued and owned by the kit that earned it" shape as Lupa's Set the Arena Ablaze; the 1s
 * trigger ICD isn't modelled.
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence, matrix } from "../../engine/gear.js";
import {
  applyCurrent,
  onAction,
  runningAction,
  casting,
  revokeCurrent,
  isHeld,
  addStat,
  removeStack,
  forte1,
  queue,
  queueOn,
  triggeredAction,
  queueOutro,
  isActive,
  applyTeam,
  frozenStacks,
  onCast,
  addToCast,
} from "../../engine/context.js";
import { Action, Cooldown, Rotation, START_3, ECHO, ActionField, INTRO } from "../../engine/rotation.js";
import { VERDANT_SUMMIT } from "../../weapons/broadblade.js";
import { NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR } from "../../weapons/standard.js";
import { NM_FEILIAN_BERINGAL, SIERRA_GALE_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { NM_KELPIE, WINDWARD_5PC } from "../../echoes/rinascita.js";

/* ----------------------------------------------------------------------------------- actions */

function jiyanAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Aero, scaling: Scaling.Atk, ...def });
}

// --- basics, heavies, mid-air, dodge counter (Lone Lance) — every hit feeds Resolve TODO get actual forte values
const BA1 = jiyanAction("Basic - Lone Lance 1", { animFrames: 14, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 73.16, energy: 0.92, concerto: 1.84, offtune: 2944 });
const BA2 = jiyanAction("Basic - Lone Lance 2", { animFrames: 24, bullets: [{ hitFrame: 23, mv: 43.73, energy: 0.55, concerto: 1.10, offtune: 1760 }], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
// PLACEHOLDER FRAMES
const BA3 = jiyanAction("Basic - Lone Lance 3", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 36.38, energy: 0.45, concerto: 0.91, offtune: 1464 },
    { hitFrame: 0, mv: 36.38, energy: 0.45, concerto: 0.91, offtune: 1464 },
    { hitFrame: 0, mv: 36.38, energy: 0.45, concerto: 0.91, offtune: 1464 },
    { hitFrame: 0, mv: 36.38, energy: 0.45, concerto: 0.91, offtune: 1464 },
    { hitFrame: 0, mv: 36.38, energy: 0.45, concerto: 0.91, offtune: 1464 },
  ]});
// PLACEHOLDER FRAMES
const BA4 = jiyanAction("Basic - Lone Lance 4", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 66.2, energy: 0.83, concerto: 1.66, offtune: 2664 },
    { hitFrame: 0, mv: 66.2, energy: 0.83, concerto: 1.66, offtune: 2664 },
  ]});
// PLACEHOLDER FRAMES
const BA5 = jiyanAction("Basic - Lone Lance 5", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 23.6, energy: 0.2934, concerto: 0.5914, offtune: 949.7988 },
    { hitFrame: 0, mv: 23.6, energy: 0.2934, concerto: 0.5914, offtune: 949.7988 },
    { hitFrame: 0, mv: 23.6, energy: 0.2934, concerto: 0.5914, offtune: 949.7988 },
    { hitFrame: 0, mv: 23.6, energy: 0.2934, concerto: 0.5914, offtune: 949.7988 },
    { hitFrame: 0, mv: 23.6, energy: 0.2934, concerto: 0.5914, offtune: 949.7988 },
    { hitFrame: 0, mv: 23.6, energy: 0.2934, concerto: 0.5914, offtune: 949.7988 },
    { hitFrame: 0, mv: 23.6, energy: 0.2934, concerto: 0.5914, offtune: 949.7988 },
    { hitFrame: 0, mv: 153.45, energy: 1.908, concerto: 3.8452, offtune: 6175.7043 },
    { hitFrame: 0, mv: 153.45, energy: 1.9082, concerto: 3.845, offtune: 6175.7041 },
  ]});

// PLACEHOLDER FRAMES
const HA = jiyanAction("Heavy - Lone Lance", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 0, mv: 22.2, energy: 0.27, concerto: 0.55, offtune: 894 },
    { hitFrame: 0, mv: 22.2, energy: 0.27, concerto: 0.55, offtune: 894 },
    { hitFrame: 0, mv: 22.2, energy: 0.27, concerto: 0.55, offtune: 894 },
    { hitFrame: 0, mv: 22.2, energy: 0.27, concerto: 0.55, offtune: 894 },
    { hitFrame: 0, mv: 22.2, energy: 0.27, concerto: 0.55, offtune: 894 },
    { hitFrame: 0, mv: 22.2, energy: 0.27, concerto: 0.55, offtune: 894 },
  ]});
/** Windborne Strike, holding Basic during the Heavy Attack. */
const HA2 = jiyanAction("Heavy - Windborne Strike", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, mv: 105.96, energy: 1.33, concerto: 2.66, offtune: 4264 });
/** Abyssal Slash, releasing Basic during the Heavy Attack. */
const HA3 = jiyanAction("Heavy - Abyssal Slash", { node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, mv: 81.71, energy: 1.02, concerto: 2.05, offtune: 3288 });

const MA = jiyanAction("Mid-air - Lone Lance Plunge", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 123.26, energy: 0.51, concerto: 1.00, offtune: 4960 });
const MA2 = jiyanAction("Mid-air - Lone Lance Plunge (Follow-Up)", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 155.66, energy: 1.95, concerto: 3.91, offtune: 6264 });
/** Banner of Triumph, the mid-air attack after Windborne Strike or a mid-air Windqueller. */
const MA3 = jiyanAction("Basic - Banner of Triumph", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 79.52, energy: 1.00, concerto: 2.00, offtune: 3200 });
// PLACEHOLDER FRAMES
const DC = jiyanAction("Dodge Counter - Lone Lance", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 0, mv: 125.84, energy: 1.58, concerto: 1.66, offtune: 2664 },
    { hitFrame: 0, mv: 125.84, energy: 1.58, concerto: 1.66, offtune: 2664 },
  ], castConcerto: 10});

/** Qingloong Mode itself, opened by Prelude and over when he leaves — what Windqueller reads to
 *  know its +20% is free. Nameless: the mode is the lances on screen, not a line of its own. */
const QINGLOONG_MODE = new Buff({ duration: 60 * 10 });
/** Held through a Windqueller that bought its +20% with Resolve. */
const WINDQUELLER_BOUGHT = new Buff({ hidden: true });

/** Windqueller, one action for its three faces. Qingloong at War (Forte Circuit): +20% DMG free
 *  inside the mode; outside it, bought with 30 Resolve when he holds that many (15 at S1, which
 *  cuts the cost), and neither below that — the plain cast. The gauge is read here before the
 *  spend lands, so it is the bar he cast on that decides. */
// S1 "can be used 1 more time": a second charge on the 7s cooldown
const SKILL_CD = new Cooldown({ frames: 60 * 7, charges: () => (isHeld(JY_S1) ? 2 : 1) });
// PLACEHOLDER FRAMES
const Skill = jiyanAction("Skill - Windqueller", {
  animFrames: 43, cooldown: SKILL_CD,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 30, mv: 106.36, energy: 2.25, offtune: 1620 },
    { hitFrame: 30, mv: 106.36, energy: 2.25, offtune: 1620 },
    { hitFrame: 30, mv: 106.36, energy: 2.25, offtune: 1620 },
    { hitFrame: 30, mv: 106.36, energy: 2.25, offtune: 1620 },
  ], castConcerto: 16,
  updateBuffs: () => {
    if (isHeld(QINGLOONG_MODE)) return;
    const cost = isHeld(JY_S1) ? 15 : 30;
    if (forte1() < cost) return;
    addToCast({ forte1: -cost });
    applyCurrent(WINDQUELLER_BOUGHT, 1);
  },
  applyStats: () => { if (isHeld(QINGLOONG_MODE) || isHeld(WINDQUELLER_BOUGHT)) addStat(Stat.DmgBonus, 20); },
  afterAction: () => revokeCurrent(WINDQUELLER_BOUGHT),
});

/** Emerald Storm - Prelude: no damage of its own, just opens Qingloong Mode. */
// Prelude releases Finale itself whenever the 30 Resolve it spends is banked
const Liberation = jiyanAction("Liberation - Emerald Storm: Prelude", {
  animFrames: 60, timestop: 60, motionStop: 60, prioFrames: 60,
  cooldown: 60 * 16,
  node: Node.Liberation, cast: Cast.Liberation, concerto: 20, resetEnergy: true,
  updateBuffs: () => {
    applyCurrent(QINGLOONG_MODE, 1);
    if (forte1() >= 30) queue(Finale);
  },
});
/** Emerald Storm - Finale, released by Prelude at 30+ Resolve — considered Heavy Attack DMG. */
// PLACEHOLDER FRAMES
const Finale = jiyanAction("Liberation - Emerald Storm: Finale", { animFrames: 60, timestop: 60, motionStop: 60, prioFrames: 60, node: Node.Liberation, cast: Cast.Liberation, type: Type.Heavy, bullets: [
    { hitFrame: 60, mv: 142.91, offtune: 21504 },
    { hitFrame: 60, mv: 142.91, offtune: 21504 },
    { hitFrame: 60, mv: 428.73, offtune: 64512 },
  ], castForte1: -30});

// Lance of Qingloong, the mode's own three-stage Heavy Attack — 8 hits a stage
// PLACEHOLDER FRAMES
const Lance1 = jiyanAction("Heavy - Lance of Qingloong 1", { animFrames: 90, node: Node.Liberation, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 58, mv: 65.52, energy: 0.47, concerto: 0.95, offtune: 1534 },
    { hitFrame: 58, mv: 65.52, energy: 0.47, concerto: 0.95, offtune: 1534 },
    { hitFrame: 58, mv: 65.52, energy: 0.47, concerto: 0.95, offtune: 1534 },
    { hitFrame: 58, mv: 65.52, energy: 0.47, concerto: 0.95, offtune: 1534 },
    { hitFrame: 58, mv: 65.52, energy: 0.47, concerto: 0.95, offtune: 1534 },
    { hitFrame: 58, mv: 65.52, energy: 0.47, concerto: 0.95, offtune: 1534 },
    { hitFrame: 58, mv: 65.52, energy: 0.47, concerto: 0.95, offtune: 1534 },
    { hitFrame: 58, mv: 65.52, energy: 0.47, concerto: 0.95, offtune: 1534 },
  ]});
// PLACEHOLDER FRAMES
const Lance2 = jiyanAction("Heavy - Lance of Qingloong 2", { animFrames: 87, node: Node.Liberation, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 87, mv: 61.55, energy: 0.45, concerto: 0.9, offtune: 1441 },
    { hitFrame: 87, mv: 61.55, energy: 0.45, concerto: 0.9, offtune: 1441 },
    { hitFrame: 87, mv: 61.55, energy: 0.45, concerto: 0.9, offtune: 1441 },
    { hitFrame: 87, mv: 61.55, energy: 0.45, concerto: 0.9, offtune: 1441 },
    { hitFrame: 87, mv: 61.55, energy: 0.45, concerto: 0.9, offtune: 1441 },
    { hitFrame: 87, mv: 61.55, energy: 0.45, concerto: 0.9, offtune: 1441 },
    { hitFrame: 87, mv: 61.55, energy: 0.45, concerto: 0.9, offtune: 1441 },
    { hitFrame: 87, mv: 61.55, energy: 0.45, concerto: 0.9, offtune: 1441 },
  ]});
// PLACEHOLDER FRAMES
const Lance3 = jiyanAction("Heavy - Lance of Qingloong 3", { animFrames: 96, node: Node.Liberation, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 96, mv: 66.76, energy: 0.48, concerto: 0.97, offtune: 1563 },
    { hitFrame: 96, mv: 66.76, energy: 0.48, concerto: 0.97, offtune: 1563 },
    { hitFrame: 96, mv: 66.76, energy: 0.48, concerto: 0.97, offtune: 1563 },
    { hitFrame: 96, mv: 66.76, energy: 0.48, concerto: 0.97, offtune: 1563 },
    { hitFrame: 96, mv: 66.76, energy: 0.48, concerto: 0.97, offtune: 1563 },
    { hitFrame: 96, mv: 66.76, energy: 0.48, concerto: 0.97, offtune: 1563 },
    { hitFrame: 96, mv: 66.76, energy: 0.48, concerto: 0.97, offtune: 1563 },
    { hitFrame: 96, mv: 66.76, energy: 0.48, concerto: 0.97, offtune: 1563 },
  ]});

const Intro = jiyanAction("Intro - Tactical Strike", { animFrames: 129, bullets: [{ hitFrame: 50, mv: 198.81, energy: 10.00, offtune: 7416, forte1: 30 }], node: Node.Intro, cast: Cast.Intro, type: Type.Intro, castConcerto: 10});
/** Discipline: no damage of its own, just the handoff — its lances are ACTION_OUTRO_COORD. */
const Outro = jiyanAction("Outro - Discipline", {
  cast: Cast.Outro, castConcerto: -100,
  // queued twice so the adopter picks the buff up at both charges
  updateBuffs: () => { queueOutro(JIYAN_OUTRO); queueOutro(JIYAN_OUTRO); },
});
/** One coordinated lance strike — queued onto his own slot by JIYAN_OUTRO below, once per stack
 *  the incoming resonator's Heavy casts consume. */
const DISCIPLINE_FIELD = new ActionField("Jiyan: Discipline");
const ACTION_OUTRO_COORD = jiyanAction("Outro - Discipline (Coordinated Lance)", { type: Type.Outro, subtype: Subtype.Coordinated, mv: 313.40, field: DISCIPLINE_FIELD });

/* ------------------------------------------------------------------------------------ buffs */

/** Heavenly Balance (Inherent Skill): +10% ATK for 15s after his Intro. */
const HEAVENLY_BALANCE = new Buff({
  name: "Inherent: Heavenly Balance",
  duration: 60 * 15,
  stats: [[Stat.BonusAtk, 10]],
});
const JY_INHERENT_1 = new Inherent({
  name: "Inherent: Heavenly Balance",
  grants: [{ on: onCast(Cast.Intro), buff: HEAVENLY_BALANCE }],
});

/** Tempest Taming (Inherent Skill): +12% Crit DMG for 8s on hit — held for his whole field
 *  window. */
const TEMPEST_TAMING = new Buff({
  name: "Inherent: Tempest Taming",
  duration: 60 * 8,
  stats: [[Stat.CritDmg, 12]],
});
const JY_INHERENT_2 = new Inherent({
  name: "Inherent: Tempest Taming",
  // a real on-field press: not a queued follow-up, a status rung or the shared Tune Break, all of
  // which are active casts on his slot but not him swinging again
  afterAction: () => { if (!triggeredAction() && isActive()) applyCurrent(TEMPEST_TAMING, 1); },
});

/** Discipline — the outro handoff: 2 charges on the incoming resonator, each Heavy cast of theirs
 *  consuming one to fire a coordinated lance on Jiyan's own slot. Whatever's left is lost when
 *  they leave the field. */
const JIYAN_OUTRO: Buff = new Buff({
  field: DISCIPLINE_FIELD,
  name: "Jiyan: Outro", maxStacks: 2, duration: 60 * 8,
  updateBuffs: () => {
    if (casting(Cast.Heavy)) { queueOn(JIYAN_RESONATOR, ACTION_OUTRO_COORD); removeStack(JIYAN_OUTRO, 1); }
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from his kit
const JIYAN_TALENTS = new Talent({
  name: "Jiyan: Talents",
  stats: [[Stat.CritRate, 8], [Stat.BonusAtk, 12]],
});

const JIYAN_RESONATOR = new Resonator({
  name: "Jiyan",
  matrix: matrix("Jiyan", 25),
  talent: JIYAN_TALENTS,
  inherent1: JY_INHERENT_1,
  inherent2: JY_INHERENT_2,
  element: Attribute.Aero,
  weapon: WeaponType.Broadblade,
  color: "#4fc98f",
  intro: Intro,
  maxEnergy: 125,
  maxForte1: 60,

  stats: [[Stat.BaseHp, 10487.5], [Stat.BaseAtk, 437.5], [Stat.BaseDef, 1185.5534]],
});

// Intro banks the 30 Resolve Prelude's auto-queued Finale spends; the lances ride the mode with
// the free in-mode Windqueller, and the closing Windqueller finds the gauge empty, so it neither
// spends nor boosts. He's never the team's own lead, so this covers both opener and loop.

/* --------------------------------------------------------------------------------- sequences */

/** S1: Windqueller holds a second charge — the extra in-mode cast the S1 rotation makes — and its
 *  Resolve cost drops to 15, which the Skill itself reads off this being held. */
const JY_S1 = new Sequence({ name: "Jiyan S1: Benevolence" });

/** S2: Tactical Strike banks 30 more Resolve — nothing here spends them, Finale takes its 30 and
 *  the in-mode Windqueller is free — and +28% ATK for 15s, so until he leaves the field. */
const VERSATILITY = new Buff({
  name: "Jiyan S2: Versatility",
  duration: 60 * 15,
  stats: [[Stat.BonusAtk, 28]],
});
const JY_S2 = new Sequence({
  name: "Jiyan S2: Versatility",
  updateBuffs: () => { if (runningAction(Intro)) addToCast({ forte1: 30 }); },
  grants: [{ on: onAction(Intro), buff: VERSATILITY }],
});

/** S3: +16% Crit. Rate and +32% Crit. DMG for 8s off Windqueller, either Emerald Storm or Tactical
 *  Strike — the Intro grants it first and the lances refresh nothing, but Windqueller lands inside
 *  the mode, so it holds for his whole field window and goes with his Outro. */
const SPECTATION = new Buff({
  name: "Jiyan S3: Spectation",
  duration: 60 * 8,
  stats: [[Stat.CritRate, 16], [Stat.CritDmg, 32]],
});
const JY_S3 = new Sequence({
  name: "Jiyan S3: Spectation",
  updateBuffs: () => {
    if (runningAction(Skill) || runningAction(Liberation) || runningAction(Finale) || runningAction(Intro)) applyCurrent(SPECTATION, 1);
  },
});

/** S4: +25% Heavy Attack DMG Bonus to the team off either Emerald Storm, 30s — permanent. */
const PRUDENCE = new Buff({
  name: "Jiyan S4: Prudence",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 25, Type.Heavy]],
});
const JY_S4 = new Sequence({
  name: "Jiyan S4: Prudence",
  updateBuffs: () => { if (runningAction(Liberation) || runningAction(Finale)) applyTeam(PRUDENCE, 1); },
});

/** S5: Discipline's lances hit for +120% of their multiplier, and every hit of his is +3% ATK a
 *  stack up to 15 — maxed outright by Tactical Strike, so the full 45% for his whole window. */
const RESOLUTION = new Buff({
  name: "Jiyan S5: Resolution", maxStacks: 15, duration: 60 * 8,
  stats: [[Stat.BonusAtk, 3]], perStack: true,
});
const JY_S5 = new Sequence({
  name: "Jiyan S5: Resolution",
  applyStats: () => { if (runningAction(ACTION_OUTRO_COORD)) addStat(Stat.MulMv, 120); },
  updateBuffs: () => { if (runningAction(Intro)) applyCurrent(RESOLUTION, 15); },
  afterAction: () => {
    if (!runningAction(Intro) && !triggeredAction() && isActive()) applyCurrent(RESOLUTION, 1);
  },
});

/** S6: a Momentum stack off every Heavy, Tactical Strike or Windqueller, two at most; Finale spends
 *  them all for +120% of its multiplier each. Prelude fires Finale straight off the Intro's one
 *  stack here — a Heavy ahead of the Liberation would bank the second. */
const MOMENTUM = new Buff({
  name: "Jiyan S6: Momentum", maxStacks: 2,
  applyStats: () => { if (runningAction(Finale)) addStat(Stat.MulMv, 120 * frozenStacks()); },
  afterAction: () => { if (runningAction(Finale)) revokeCurrent(MOMENTUM); },
});
const JY_S6 = new Sequence({
  name: "Jiyan S6: Fortitude",
  updateBuffs: () => {
    if (casting(Cast.Heavy) || runningAction(Intro) || runningAction(Skill)) applyCurrent(MOMENTUM, 1);
  },
});

const JY_SEQUENCES = [JY_S1, JY_S2, JY_S3, JY_S4, JY_S5, JY_S6];

const JY_ROTATION = new Rotation([
  START_3, Skill.instaSwap(),

  INTRO, 
  Liberation,
  Lance1.cancel(), Skill, 
  Lance1.dodgeCancel(),
  Lance1.dodgeCancel(),
  Lance1.dodgeCancel(),
  Lance1.dodgeCancel(),
  Lance1.dodgeCancel(),
  Lance1.dodgeCancel(),
  Skill, ECHO.instaSwap(), Outro,
]);

const JY_ROTATION_S6 = new Rotation([
  START_3, Skill.instaSwap(),

  INTRO, 
  Liberation,
  Lance1.cancel(), Skill, 
  Lance1.dodgeCancel(),
  Lance1.dodgeCancel(),
  Lance1.dodgeCancel(),
  Lance1.dodgeCancel(),
  Lance1.dodgeCancel(),
  Lance1.dodgeCancel(),
  Skill, ECHO.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// his real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const JIYAN = new Loadout({
  resonator: JIYAN_RESONATOR,
  weapons: [VERDANT_SUMMIT, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: [new EchoLoadout(NM_FEILIAN_BERINGAL, SIERRA_GALE_5PC),
      new EchoLoadout(NM_KELPIE, WINDWARD_5PC),],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Aero3, Mainstat.ATK1),
  substat: substats(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Skill),
  rotation: { 0: JY_ROTATION, 6: JY_ROTATION_S6 },
  sequences: JY_SEQUENCES,
});
