/**
 * Shorekeeper, ported to the new engine. Her damage barely matters; the Stellarealm is what she's
 * for, giving the team crit rate then crit damage scaled off her own energy regen.
 *
 * The realm's life: End Loop *generates* the Outer Stellarealm — a new one replaces whatever is
 * standing rather than evolving it — every Intro anyone casts inside it steps it a stage (modelled
 * on the outro that hands the field over), and Discernment, her replacement Intro at Supernal,
 * ends it — or, with S1, leaves it standing for her own next End Loop to replace.
 *
 * Numbers from nanoka.cc (character 1505); Base DEF (1100) confirmed there directly, since the
 * migrated sheet this was ported from didn't carry it. Her resonance chain is below the buffs.
 */
import { Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyTeam,
  applyCurrent,
  addBuff,
  revokeBuff,
  stacksOfTeam,
  runningAction,
  currentTeam,
  isHeld,
  revokeTeam,
  addStat,
  
  casting,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, START_3, NOINTRO, ECHO, INTRO } from "../../engine/rotation.js";
import { HEALS } from "../../shared/status.js";
import { SK_SIG } from "../../weapons/rectifier.js";
import { VARIATION } from "../../weapons/standard.js";
import { REJUV_5PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";
import { mainstats, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { SPACETREK_EXPLORER, STARRY_RADIANCE_5PC } from "../../echoes/lahairoi.js";

/* ----------------------------------------------------------------------------------- actions */

function skAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// Empirical Data (forte1): 1 a stage, capped at 5 — the engine floors at 0 but imposes no
// ceiling itself, so BA3's +2/MA's +1 landing on 5 relies on this loop never running a fourth
// basic before Forte: Illation spends the whole gauge below.
const BA1 = skAction("Basic - Origin Calculus 1", { animFrames: 23, commitFrames: 15, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 15, mv: 31.78, energy: 0.5, concerto: 1.6, offtune: 2664, forte1: 1 }]});
const BA2 = skAction("Basic - Origin Calculus 2", { animFrames: 33, commitFrames: 20, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 8, mv: 23.86, energy: 0.38, concerto: 1.2, offtune: 2000, forte1: 1 },
    { at: 20, mv: 23.86, energy: 0.38, concerto: 1.2, offtune: 2000 },
  ]});
const BA3 = skAction("Basic - Origin Calculus 3", { animFrames: 47, commitFrames: 20, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [
    { at: 20, mv: 23.32, energy: 0.37, concerto: 1.18, offtune: 1955 },
    { at: 29, mv: 23.32, energy: 0.37, concerto: 1.18, offtune: 1955, forte1: 1 },
    { at: 38, mv: 23.32, energy: 0.37, concerto: 1.18, offtune: 1955, forte1: 1 },
  ]});

const MA = skAction("Mid-air - Origin Calculus Plunge", { animFrames: 50, commitFrames: 46, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 46, mv: 73.96, energy: 1.55, concerto: 5, offtune: 4960, forte1: 1 }]});

const Skill = skAction("Skill - Chaos Theory", { animFrames: 39, commitFrames: 17, cooldown: 60 * 16, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 55, mv: 31.31, energy: 2, concerto: 2, offtune: 1050, updateDebuffs: () => applyCurrent(HEALS, 1) },
    { at: 57, mv: 31.31, energy: 2, concerto: 2, offtune: 1050 },
    { at: 60, mv: 31.31, energy: 2, concerto: 2, offtune: 1050 },
    { at: 62, mv: 31.31, energy: 2, concerto: 2, offtune: 1050 },
    { at: 65, mv: 31.31, energy: 2, concerto: 2, offtune: 1050 },
  ], castConcerto: 20});

const FHA = skAction("Forte Heavy - Illation", { animFrames: 48, commitFrames: 5, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 22, mv: 56.26, energy: 0.99, offtune: 1272 },
    { at: 34, mv: 56.26, energy: 0.99, offtune: 1272 },
    { at: 46, mv: 56.26, energy: 0.99, offtune: 1272 },
    { at: 58, mv: 56.26, energy: 0.99, offtune: 1272 },
    { at: 64, mv: 56.26, energy: 0.99, offtune: 1272 },
  ], castConcerto: 11, castForte1: -5});

const Liberation = skAction("Liberation - End Loop", {
  animFrames: 207, commitFrames: 207, timestop: 207, motionStop: 207, cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, castConcerto: 20, resetEnergy: true,
  // "Generate the Outer Stellarealm": a cast puts up a *new* realm rather than stepping the one
  // already standing, so whatever stage is up is replaced by Outer — which is what puts the realm
  // S1 carried through Discernment back at the bottom.
  updateBuffs: () => {
    for (const realm of REALMS) revokeTeam(realm);
    applyTeam(OUTER_REALM, 1);
  },
});

const Intro = skAction("Intro - Enlightenment", { animFrames: 85, commitFrames: 44, motionStop: 29, node: Node.Intro, cast: Cast.Intro, type: Type.Skill, hits: [
    { at: 83, mv: 45.3, energy: 2, concerto: 2, offtune: 2279, updateDebuffs: () => applyCurrent(HEALS, 1) },
    { at: 85, mv: 45.3, energy: 2, concerto: 2, offtune: 2279 },
    { at: 87, mv: 45.3, energy: 2, concerto: 2, offtune: 2279 },
    { at: 90, mv: 45.3, energy: 2, concerto: 2, offtune: 2279 },
    { at: 92, mv: 45.3, energy: 2, concerto: 2, offtune: 2279 },
  ], castConcerto: 10});
// replaces plain Intro under a Supernal Stellarealm (see SHOREKEEPER_RESONATOR's own intro() below); scales
// off HP, counts as liberation damage, always crits, and ends the realm on resolving
const EIntro = skAction("Intro - Discernment", {
  animFrames: 215, commitFrames: 143, timestop: 135, motionStop: 135,
  node: Node.Intro, cast: Cast.Intro, type: Type.Liberation, scaling: Scaling.Hp, hits: [
    { at: 143, mv: 19.64, energy: 3.34, offtune: 24414, updateDebuffs: () => applyCurrent(HEALS, 1) },
    { at: 155, mv: 19.64, energy: 3.34, offtune: 24414 },
    { at: 167, mv: 19.64, energy: 3.34, offtune: 24414 },
  ], castConcerto: 20,
  applyStats: () => { addStat(Stat.CritRate, 100); },
  updateBuffs: () => {
    // One Discernment per Supernal realm generated (its own text), with nothing here to enforce
    // it: her End Loop stands between any two of her Intros and puts a fresh Outer realm up, so
    // the stage alone can never still read Supernal by the time she arrives again.
    // S1: "Casting Intro Skill Discernment no longer ends the existing Stellarealm" — so the realm
    // stands as it is (Supernal, until her next End Loop replaces it) and Rover keeps the Self
    // Gravitation that only ever falls off with it
    if (isHeld(SK_S1)) return;
    for (const realm of REALMS) revokeTeam(realm);
    // doesn't fall off Rover on its own just because the realm ends
    const rover = currentTeam().slots.find((s) => s.resonator?.name.includes("Rover"))?.resonator;
    if (rover) revokeBuff(rover, SK_ROVER_GRAVITATION);
  },
});

/** Puts Binary Butterfly on the team, so amplification starts with whoever she hands the field to. */
const Outro = skAction("Outro - Binary Butterfly", {
  animFrames: 0, commitFrames: 0,
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => applyTeam(SK_OUTRO, 1),
});

/* ------------------------------------------------------------------------------------ buffs */

/** The realm, a team-wide buff a stage: Outer (heals only, no stat), Inner (+12.5% Crit Rate),
 *  Supernal (also +25% Crit Dmg). Evolves on any outro — each stage hands over to the next, and
 *  Supernal is refreshed — and ends only when Discernment plays (see SHOREKEEPER_RESONATOR's own
 *  updateBuffs() below). `realmStage()` is which one stands, 1-3, or 0 for none. */
function stellarealm(stage: string, next: (() => Buff) | null, stats: [Stat, number][]): Buff {
  const self: Buff = new Buff({
    name: `Shorekeeper: ${stage} Stellarealm`, duration: 60 * 30, stats,
    updateBuffs: () => {
      if (!casting(Cast.Outro)) return;
      if (next) {
        revokeTeam(self);
        applyTeam(next(), 1);
      } else applyTeam(self, 1);
    },
  });
  return self;
}
const SUPERNAL_REALM = stellarealm("Supernal", null, [[Stat.CritRate, 12.5], [Stat.CritDmg, 25]]);
const INNER_REALM = stellarealm("Inner", () => SUPERNAL_REALM, [[Stat.CritRate, 12.5]]);
const OUTER_REALM = stellarealm("Outer", () => INNER_REALM, []);
const REALMS = [OUTER_REALM, INNER_REALM, SUPERNAL_REALM];
const realmStage = (): number => REALMS.findIndex((realm) => stacksOfTeam(realm) > 0) + 1;

/** Team-wide amplification her outro puts up — permanent uptime once granted, not a handoff. */
const SK_OUTRO = new Buff({
  name: "Shorekeeper: Outro",
  duration: 60 * 30,
  stats: [[Stat.Amp, 15]],
});

/** Self Gravitation's own extension onto Rover — lives on Rover's own local stack (granted via
 *  addBuff(), see SK_INHERENT_2 below) so the ER still traces to Shorekeeper on Rover's own row. */
const SK_ROVER_GRAVITATION = new Buff({
  name: "Inherent: Self Gravitation",
  applyStats: () => { if (realmStage()) addStat(Stat.Er, 10); },
});

/** Self Gravitation (Inherent Skill): +10% ER while inside a Stellarealm — assumed always true
 *  once one is up. Also extends to any teammate whose name contains "Rover", via updateGlobal()
 *  so it reaches their turn from turn one regardless of team order. */
const SK_INHERENT_2 = new Inherent({
  name: "Inherent: Self Gravitation",
  applyStats: () => {
    if (realmStage()) addStat(Stat.Er, 10);
  },
  updateGlobal: () => {
    // gated on the realm being up, not unconditional — otherwise this would re-grant Rover's
    // copy right back after SHOREKEEPER_RESONATOR's own updateBuffs() revokes it on EIntro
    if (!realmStage()) return;
    const rover = currentTeam().slots.find((s) => s.resonator?.name.includes("Rover"))?.resonator;
    if (rover) addBuff(rover, SK_ROVER_GRAVITATION);
  },
});

const SK_INHERENT_1 = new Inherent({ name: "Inherent: Life Entwined" }); // revive

/* --------------------------------------------------------------------------- resonance chain */

/** S1: the range and the +10s reach nothing this calculator computes. What does is its third
 *  clause — Discernment no longer ends the Stellarealm, read by EIntro above. */
const SK_S1 = new Sequence({ name: "Shorekeeper S1: Unspoken Conjecture" });

/** S2: on the *Outer* realm, and every stage above it "has all the effects of the Outer" — so it
 *  pays whenever any realm stands. Team-wide, so it cannot live on the node itself (a Sequence is
 *  gear on her own slot and its stats reach only her turns): the node mirrors the realm onto a
 *  buff of the team's, put up and taken down with it from updateGlobal, which runs whoever acts. */
const SK_S2_TEAM = new Buff({
  name: "Shorekeeper S2: Night's Gift and Refusal",
  stats: [[Stat.BonusAtk, 40]],
});

const SK_S2 = new Sequence({
  name: "Shorekeeper S2: Night's Gift and Refusal",
  updateGlobal: () => {
    if (realmStage()) applyTeam(SK_S2_TEAM, 1);
    else revokeTeam(SK_S2_TEAM);
  },
});

const SK_S3 = new Sequence({
  name: "Shorekeeper S3: Infinity Awaits Me",
  applyStats: () => {
    if (runningAction(Liberation)) addStat(Stat.AddConcerto, 20);
  },
});

/** S4: Healing Bonus is out of this calculator's formula, so this is tracked for completeness the
 *  way her talents' own 12% is. Named Overflowing Quietude, which is a chain node and not the
 *  Inherent Skill an older comment on Chaos Theory called it. */
const SK_S4 = new Sequence({
  name: "Shorekeeper S4: Overflowing Quietude",
  applyStats: () => { if (runningAction(Skill)) addStat(Stat.HealingBonus, 70); },
});

/** S5: two pull ranges. Nothing here has a range, so this is held for its name alone. */
const SK_S5 = new Sequence({ name: "Shorekeeper S5: Echoes in Silence" });

const SK_S6 = new Sequence({
  name: "Shorekeeper S6: To the New World",
  applyStats: () => { if (runningAction(EIntro)) { addStat(Stat.MulMv, 42); addStat(Stat.CritDmg, 500); } },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const SHOREKEEPER_TALENTS = new Talent({
  name: "Shorekeeper: Talents",
  stats: [
    [Stat.BonusHp, 12],
    [Stat.HealingBonus, 12], // stat-tree Healing Bonus+ nodes — unused by the formula
  ],
});

const SHOREKEEPER_RESONATOR = new Resonator({
  name: "Shorekeeper",
  stats: [[Stat.BaseHp, 16712.5], [Stat.BaseAtk, 287.5], [Stat.BaseDef, 1099.998]],
  talent: SHOREKEEPER_TALENTS,
  inherent1: SK_INHERENT_1,
  inherent2: SK_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Rectifier,
  color: "#728cf3",
  // resolved when its row is reached: whichever Intro the kit's state calls for there
  intro: new Action("Intro Resolver", { cast: Cast.Intro, resolve: () => (realmStage() >= 3 ? EIntro : Intro) }),
  maxEnergy: 175,
  maxForte1: 5,
  // reads the realm as it stands, already stepped by the preceding outro

  updateDebuffs: () => {
    // her own healing marker, read by every healing sonata and weapon (statuses.ts) — applied to the
    // healer alone; Chaos Theory's and both Intros' are their first hits'
    if (runningAction(Liberation)) applyCurrent(HEALS, 1);
  },

});

// INTRO resolves to plain Intro or Discernment on its own — same marker for opener and loop.
// The loop is shorter than the opener; it generates just over the 100 concerto the outro spends.
// NOINTRO ROTATIONS DO NOT HAVE AN INTRO

const BA123 = new ActionGroup("Basic - Origin Calculus 123", [BA1, BA2, BA3]);

const BA23 = new ActionGroup("Basic - Origin Calculus 23", [BA2, BA3]);
const BA12 = new ActionGroup("Basic - Origin Calculus 12", [BA1, BA2]);

const SK_LOOP = new Rotation([
  START_3, Skill.cancel(), Liberation, ECHO.instaSwap(),

  NOINTRO, 
  BA123.jump(), MA, FHA.instaCancel(),
  Skill, BA23.dodgeCancel(),
  BA12.easyCancel(), FHA.instaCancel(), 
  Liberation, ECHO.instaSwap(), Outro,

  INTRO, 
  BA123.jump(), MA, FHA.instaCancel(), Skill.cancel(),
  Liberation, ECHO.instaSwap(), Outro,
]);

const SK_LOOP_S3 = new Rotation([
  START_3, Skill.cancel(), Liberation, ECHO.instaSwap(),

  NOINTRO, 
  BA123.jump(), MA, FHA.instaCancel(),
  Skill.cancel(),
  Liberation, ECHO.instaSwap(), Outro,

  INTRO, BA1,
  Skill,
  Liberation, ECHO.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat
export const SHOREKEEPER = new Loadout({
  resonator: SHOREKEEPER_RESONATOR,
  weapons: [SK_SIG, VARIATION],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(SPACETREK_EXPLORER, STARRY_RADIANCE_5PC),
    //new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC),
    //new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  ],
  sequences: [SK_S1, SK_S2, SK_S3, SK_S4, SK_S5, SK_S6],
  mainstats: [mainstats(Mainstat.HP4, Mainstat.ER3, Mainstat.ER3, Mainstat.HP1, Mainstat.HP1)],
  substat: substats(Substat.Er, Substat.CritDmg, Substat.CritRate, Substat.Liberation, Substat.HpPct, Substat.Heavy),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Er, Substat.Liberation, Substat.HpPct, Substat.Heavy),
    // S3 loop disabled for now: it drops a whole Basic line and cuts her Intro chain to one press,
    // which costs her ~7.2 Energy a window and half of that to whoever she is standing in front of
    // — enough to put twelve teams' Liberations out of reach. Re-point this at SK_LOOP_S3 once that
    // rotation is settled.
    rotation: SK_LOOP,
});
