/**
 * Jiyan, ported to the new engine — a limited 5-star (`Tier.Limited`), Sequences 1-6 in their
 * own block below. An aero broadblade main DPS. His Liberation (Emerald Storm - Prelude)
 * deals no damage itself but opens Qingloong Mode (10s), replacing his kit with the three-stage
 * Heavy Attack Lance of Qingloong; cast with 30+ Resolve it queues Emerald Storm - Finale itself
 * (considered Heavy Attack DMG), spending the 30 — never placed in a rotation by hand. Windqueller inside the mode gets +20% DMG for
 * free; outside it consumes 30 Resolve for the same +20% — modelled as two actions (Skill/USkill),
 * both carrying the bonus, the rotation only placing the consuming form when the gauge covers it.
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
 *    window, lost after his outro.
 * Discipline (Outro): the incoming resonator holds "Jiyan: Outro" x2, and each of their Heavy
 * casts consumes a charge to fire one 313.40% coordinated lance on Jiyan's own slot — same
 * "queued and owned by the kit that earned it" shape as Lupa's Set the Arena Ablaze; the 1s
 * trigger ICD isn't modelled.
 */
import { Stat, Attribute, WeaponType, Type1, Type2, Cast, Node, Scaling, LifeTime } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Resonator, Loadout, EchoLoadout, Sequence } from "../../engine/gear.js";
import {
  applyCurrent,
  onAction,
  runningAction,
  casting,
  revokeCurrent,
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
} from "../../engine/context.js";
import { matrix } from "../../shared/helpers.js";
import { Action, Rotation, START_3, SWAP, INTRO, ECHO_CANCEL, OUTRO, ActionField, DODGE } from "../../engine/rotation.js";
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
const BA1 = jiyanAction("Basic - Lone Lance 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.16, energy: 0.92, concerto: 1.84, offtune: 2944 });
const BA2 = jiyanAction("Basic - Lone Lance 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 43.73, energy: 0.55, concerto: 1.10, offtune: 1760 });
const BA3 = jiyanAction("Basic - Lone Lance 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 36.38 * 5, energy: 2.25, concerto: 4.55, offtune: 7320 });
const BA4 = jiyanAction("Basic - Lone Lance 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 66.20 * 2, energy: 1.66, concerto: 3.32, offtune: 5328 });
const BA5 = jiyanAction("Basic - Lone Lance 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 23.60 * 7 + 153.45 * 2, energy: 5.87, concerto: 11.83, offtune: 19000 });

const HA = jiyanAction("Heavy - Lone Lance", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 22.20 * 6, energy: 1.62, concerto: 3.30, offtune: 5364 });
/** Windborne Strike, holding Basic during the Heavy Attack. */
const HA2 = jiyanAction("Heavy - Windborne Strike", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 105.96, energy: 1.33, concerto: 2.66, offtune: 4264 });
/** Abyssal Slash, releasing Basic during the Heavy Attack. */
const HA3 = jiyanAction("Heavy - Abyssal Slash", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 81.71, energy: 1.02, concerto: 2.05, offtune: 3288 });

const MA = jiyanAction("Mid-air - Lone Lance", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 123.26, energy: 0.51, concerto: 1.00, offtune: 4960 });
const MA2 = jiyanAction("Mid-air - Lone Lance (Follow-Up)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 155.66, energy: 1.95, concerto: 3.91, offtune: 6264 });
/** Banner of Triumph, the mid-air attack after Windborne Strike or a mid-air Windqueller. */
const MA3 = jiyanAction("Basic - Banner of Triumph", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.52, energy: 1.00, concerto: 2.00, offtune: 3200 });
const DC = jiyanAction("Dodge Counter - Lone Lance", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 125.84 * 2, energy: 3.16, concerto: 13.32, offtune: 5328 });

// Windqueller's three forms — at 30+ Resolve out of Qingloong Mode it consumes 30 for +20% DMG,
// below 30 it's the plain cast with neither, inside the mode the +20% is free (the bonus lives on
// JIYAN_RESONATOR's own apply below, on the two boosted forms only)
// Qingloong at War (Forte Circuit): Windqueller +20% DMG — free in-mode, or off the 30 Resolve
// the out-of-mode action's own forte1 already spends
const WINDQUELLER = { applyStats: () => addStat(Stat.DmgBonus, 20) };
const Skill = jiyanAction("Skill - Windqueller", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 106.36 * 4, energy: 9.00, concerto: 16, offtune: 6480, forte1: -30, ...WINDQUELLER });
const SkillLowResolve = jiyanAction("Skill - Windqueller (Low Resolve)", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 106.36 * 4, energy: 9.00, concerto: 16, offtune: 6480 });
const USkill = jiyanAction("Skill - Windqueller (Qingloong)", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 106.36 * 4, energy: 9.00, concerto: 16, offtune: 6480, ...WINDQUELLER });

/** Emerald Storm - Prelude: no damage of its own, just opens Qingloong Mode. */
// Prelude releases Finale itself whenever the 30 Resolve it spends is banked
const Liberation = jiyanAction("Liberation - Emerald Storm: Prelude", {
  node: Node.Liberation, cast: Cast.Liberation, cutscene: true, concerto: 20, resetEnergy: true,
  updateBuffs: () => { if (forte1() >= 30) queue(Finale); }
});
/** Emerald Storm - Finale, released by Prelude at 30+ Resolve — considered Heavy Attack DMG. */
const Finale = jiyanAction("Liberation - Emerald Storm: Finale", { node: Node.Liberation, cast: Cast.Liberation, cutscene: true, type: Type1.Heavy, mv: 142.91 * 2 + 428.73, offtune: 107520, forte1: -30 });

// Lance of Qingloong, the mode's own three-stage Heavy Attack — 8 hits a stage
const Lance1 = jiyanAction("Heavy - Lance of Qingloong 1", { node: Node.Liberation, cast: Cast.Heavy, type: Type1.Heavy, mv: 65.52 * 8, energy: 3.76, concerto: 7.60, offtune: 12272 });
const Lance2 = jiyanAction("Heavy - Lance of Qingloong 2", { node: Node.Liberation, cast: Cast.Heavy, type: Type1.Heavy, mv: 61.55 * 8, energy: 3.60, concerto: 7.20, offtune: 11528 });
const Lance3 = jiyanAction("Heavy - Lance of Qingloong 3", { node: Node.Liberation, cast: Cast.Heavy, type: Type1.Heavy, mv: 66.76 * 8, energy: 3.84, concerto: 7.76, offtune: 12504 });

const Intro = jiyanAction("Intro - Tactical Strike", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.81, energy: 10.00, concerto: 10, offtune: 7416, forte1: 30 });
/** Discipline: no damage of its own, just the handoff — its lances are ACTION_OUTRO_COORD. */
const Outro = jiyanAction("Outro - Discipline", {
  cast: Cast.Outro, concerto: -100, swapOut: true,
  // queued twice so the adopter picks the buff up at both charges
  updateBuffs: () => { queueOutro(JIYAN_OUTRO); queueOutro(JIYAN_OUTRO); },
});
/** One coordinated lance strike — queued onto his own slot by JIYAN_OUTRO below, once per stack
 *  the incoming resonator's Heavy casts consume. */
const DISCIPLINE_FIELD = new ActionField("Jiyan: Discipline");
const ACTION_OUTRO_COORD = jiyanAction("Outro - Discipline (Coordinated Lance)", { type: Type1.Outro, type2: Type2.Coordinated, mv: 313.40, field: DISCIPLINE_FIELD });

/* ------------------------------------------------------------------------------------ buffs */

/** Heavenly Balance (Inherent Skill): +10% ATK for 15s after his Intro. */
const HEAVENLY_BALANCE = new Buff({
  name: "Inherent: Heavenly Balance",
  stats: [[Stat.BonusAtk, 10]],
  until: LifeTime.Outro,
});
const JY_INHERENT_1 = new Inherent({
  name: "Inherent: Heavenly Balance",
  grants: [{ on: onCast(Cast.Intro), buff: HEAVENLY_BALANCE }],
});

/** Tempest Taming (Inherent Skill): +12% Crit DMG for 8s on hit — held for his whole field
 *  window, lost after his outro. */
const TEMPEST_TAMING = new Buff({
  name: "Inherent: Tempest Taming",
  stats: [[Stat.CritDmg, 12]],
  until: LifeTime.Outro,
});
const JY_INHERENT_2 = new Inherent({
  name: "Inherent: Tempest Taming",
  // a real on-field press: not a queued follow-up, a status rung or the shared Tune Break, all of
  // which are active casts on his slot but not him swinging again
  updateBuffs: () => { if (!triggeredAction() && isActive()) applyCurrent(TEMPEST_TAMING, 1); },
});

/** Discipline — the outro handoff: 2 charges on the incoming resonator, each Heavy cast of theirs
 *  consuming one to fire a coordinated lance on Jiyan's own slot. Whatever's left is lost when
 *  they leave the field. */
const JIYAN_OUTRO: Buff = new Buff({
  field: DISCIPLINE_FIELD,
  name: "Jiyan: Outro", maxStacks: 2,
  updateBuffs: () => {
    if (casting(Cast.Heavy)) { queueOn(JIYAN_RESONATOR, ACTION_OUTRO_COORD); removeStack(JIYAN_OUTRO, 1); }
  },
  until: LifeTime.Outro,
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
  intro: () => Intro,
  outro: () => Outro,
  color: "#4fc98f",
  maxEnergy: 125,
  maxForte1: 60,

  stats: [[Stat.BaseHp, 10487.5], [Stat.BaseAtk, 437.5], [Stat.BaseDef, 1185.55]],
});

// Intro banks the 30 Resolve Prelude's auto-queued Finale spends; the lances ride the mode with
// the free in-mode Windqueller, and the closing Windqueller is the low-Resolve form — the gauge
// is empty by then, so it neither spends nor boosts. He's never the team's own lead, so this
// covers both opener and loop.

/* --------------------------------------------------------------------------------- sequences */

/** S1: Windqueller holds a second charge — the extra in-mode cast the S1 rotation makes — and its
 *  Resolve cost drops by 15, refunded onto the one form that spends. */
const JY_S1 = new Sequence({
  name: "Jiyan S1: Benevolence",
  applyStats: () => { if (runningAction(Skill)) addStat(Stat.AddForte1, 15); },
});

/** S2: Tactical Strike banks 30 more Resolve — nothing here spends them, Finale takes its 30 and
 *  the in-mode Windqueller is free — and +28% ATK for 15s, so until he leaves the field. */
const VERSATILITY = new Buff({
  name: "Jiyan S2: Versatility",
  stats: [[Stat.BonusAtk, 28]],
  until: LifeTime.AfterSwap,
});
const JY_S2 = new Sequence({
  name: "Jiyan S2: Versatility",
  applyStats: () => { if (runningAction(Intro)) addStat(Stat.AddForte1, 30); },
  grants: [{ on: onAction(Intro), buff: VERSATILITY }],
});

/** S3: +16% Crit. Rate and +32% Crit. DMG for 8s off Windqueller, either Emerald Storm or Tactical
 *  Strike — the Intro grants it first and the lances refresh nothing, but Windqueller lands inside
 *  the mode, so it holds for his whole field window and goes with his Outro. */
const SPECTATION = new Buff({
  name: "Jiyan S3: Spectation",
  stats: [[Stat.CritRate, 16], [Stat.CritDmg, 32]],
  until: LifeTime.AfterSwap,
});
const JY_S3 = new Sequence({
  name: "Jiyan S3: Spectation",
  updateBuffs: () => {
    if (runningAction(Skill) || runningAction(SkillLowResolve) || runningAction(USkill) || runningAction(Liberation) || runningAction(Finale) || runningAction(Intro)) applyCurrent(SPECTATION, 1);
  },
});

/** S4: +25% Heavy Attack DMG Bonus to the team off either Emerald Storm, 30s — permanent. */
const PRUDENCE = new Buff({
  name: "Jiyan S4: Prudence",
  stats: [[Stat.DmgBonus, 25, Type1.Heavy]],
});
const JY_S4 = new Sequence({
  name: "Jiyan S4: Prudence",
  updateBuffs: () => { if (runningAction(Liberation) || runningAction(Finale)) applyTeam(PRUDENCE, 1); },
});

/** S5: Discipline's lances hit for +120% of their multiplier, and every hit of his is +3% ATK a
 *  stack up to 15 — maxed outright by Tactical Strike, so the full 45% for his whole window. */
const RESOLUTION = new Buff({
  name: "Jiyan S5: Resolution", maxStacks: 15,
  stats: [[Stat.BonusAtk, 3]], perStack: true,
  until: LifeTime.AfterSwap,
});
const JY_S5 = new Sequence({
  name: "Jiyan S5: Resolution",
  applyStats: () => { if (runningAction(ACTION_OUTRO_COORD)) addStat(Stat.MulMv, 120); },
  updateBuffs: () => {
    if (runningAction(Intro)) applyCurrent(RESOLUTION, 15);
    else if (!triggeredAction() && isActive()) applyCurrent(RESOLUTION, 1);
  },
});

/** S6: a Momentum stack off every Heavy, Tactical Strike or Windqueller, two at most; Finale spends
 *  them all for +120% of its multiplier each. Prelude fires Finale straight off the Intro's one
 *  stack here — a Heavy ahead of the Liberation would bank the second. */
const MOMENTUM = new Buff({
  name: "Jiyan S6: Momentum", maxStacks: 2,
  applyStats: () => { if (runningAction(Finale)) addStat(Stat.MulMv, 120 * frozenStacks()); },
  convertStats: () => { if (runningAction(Finale)) revokeCurrent(MOMENTUM); },
});
const JY_S6 = new Sequence({
  name: "Jiyan S6: Fortitude",
  updateBuffs: () => {
    if (casting(Cast.Heavy) || runningAction(Intro) || runningAction(Skill) || runningAction(SkillLowResolve) || runningAction(USkill)) applyCurrent(MOMENTUM, 1);
  },
});

const JY_SEQUENCES = [JY_S1, JY_S2, JY_S3, JY_S4, JY_S5, JY_S6];

const JY_ROTATION = new Rotation([
  START_3, SkillLowResolve.swap(), SWAP,

  INTRO, ECHO_CANCEL,
  Liberation,
  Lance1, USkill, 
  Lance1, DODGE,
  Lance1, DODGE,
  Lance1, DODGE,
  Lance1, DODGE,
  Lance1, DODGE,
  Lance1, DODGE,
  SkillLowResolve.swap(), OUTRO,
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
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Er),
  rotation: JY_ROTATION,
  sequences: JY_SEQUENCES,
});
