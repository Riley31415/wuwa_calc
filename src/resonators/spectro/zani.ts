/**
 * Zani — a limited 5-star Spectro Gauntlets main DPS built on Spectro Frazzle, and the only kit
 * that turns the status into something else.
 *
 * Heliacal Ember is the whole point: while she is on the team, *any* resonator inflicting Spectro
 * Frazzle immediately fires the target's whole Frazzle ladder and converts every stack into a
 * Heliacal Ember, 5 Blaze to her a stack. So in her teams the target never carries Frazzle for
 * longer than the action that applied it — the status ticks itself nowhere, and what stands on
 * the target instead is up to 60 Embers, which her Outro spends for +10% DMG each. An Ember is
 * not a Negative Status (shared/status.ts holds it, and deliberately leaves it out of the six):
 * the Frazzle that became one still counts as inflicted, because `applied()` records at the grant
 * and the conversion happens a phase later, and the conversion is no consumption either — it
 * takes the stacks off with `revokeEnemy`, never `consume()`.
 *
 * Redundant Energy (forte1, 0-100) is her one forte gauge, banked by Normal Attacks, the Intro
 * and Standard Defense Protocol and spent whole by Targeted Action — which sends her into
 * Sunburst, lays an Ember and banks 10 Blaze. It cannot be gained in Inferno Mode at all, which
 * needs no machinery here: nothing she casts inside Inferno banks any.
 *
 * Blaze is not a gauge but a team-wide stacking buff (BLAZE below), because the Ember conversion
 * that banks most of it fires off teammates’ casts rather than her own. Liberation Rekindle opens
 * Inferno Mode and her Basic Attack becomes the Heavy Slash chain: Daybreak (10 Blaze), Dawning
 * (20), Nightfall (40, and every Blaze it spends adds 9.95% to its own multiplier, paid out by
 * BLAZE itself). Liberation The Last Stand ends Inferno.
 *
 * Not modelled: the block-stance branch. Standard Defense Protocol and Ready Stance answer being
 * *attacked* with Pinpoint Strike, Forcible Riposte and Lightsmash, and this calculator's target
 * never swings — Forcible Riposte is Targeted Action's numbers to the point anyway, and Lightsmash
 * is Dawning's. Lightsmash is declared (a dodge can open it) and the other two are not, Pinpoint
 * Strike's own Redundant Energy gain being unpublished.
 *
 * Motion values, energy, concerto and off-tune off nanoka.cc (character 1507, CDN 3.7.3), each
 * action summed from its own Skill Attributes row plus the flat "Concerto Regen" rows beside it.
 * Per-hit Redundant Energy and Blaze — which nanoka's text does not carry — are wuwalab's frame
 * data for her, in whole points: Nightfall's hits sum to exactly the "up to 40 Blazes" her Forte
 * Circuit states, which is what confirms the unit. Base stats from the same nanoka file.
 */
import { Stat, Attribute, WeaponType, Type, Subtype, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  addStat,
  applied,
  applyCurrent,
  applyEnemy,
  applyTeam,
  asSource,
  frozenStacks,
  isHeld,
  onAction,
  revokeCurrent,
  revokeEnemy,
  removeStackTeam,
  revokeTeam,
  runningAction,
  stacksOf,
  stacksOfEnemy,
  stacksOfTeam,
} from "../../engine/context.js";
import { Action, Rotation, ECHO, ActionGroup, INTRO } from "../../engine/rotation.js";
import { tuneBreak } from "../../shared/tunebreak.js";
import {
  HELIACAL_EMBER, HELIACAL_EMBER_ACTIONS, SPECTRO_FRAZZLE, negativeStatusRung, queueOnApplier,
} from "../../shared/status.js";
import { BLAZING_JUSTICE, TRAGICOMEDY, VERITYS_HANDLE } from "../../weapons/gauntlet.js";
import { ABYSS_SURGES, NEW_STD_GAUNTLET } from "../../weapons/standard.js";
import { CAPITANEUS, NM_MOURNING_AIX, ETERNAL_RADIANCE_5PC } from "../../echoes/rinascita.js";
import { JUE, CELESTIAL_LIGHT_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function zaniAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

// --- Routine Negotiation: the ordinary chain, every hit of which banks Redundant Energy. Stage 3
//     has a second form, the one the block stance hands back — the same press for 10 more.
const BA1 = zaniAction("Basic - Routine Negotiation 1", { frames: 24, cancelFrames: 16, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 58.85, energy: 0.93, concerto: 1.85, offtune: 2960, forte1: 5 });
const BA2 = zaniAction("Basic - Routine Negotiation 2", { frames: 32, cancelFrames: 18, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 79.53, energy: 1.25, concerto: 2.50, offtune: 4000, forte1: 5 });
const BA3 = zaniAction("Basic - Routine Negotiation 3", { frames: 57, cancelFrames: 51, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 127.26, energy: 2.01, concerto: 4.02, offtune: 6402, forte1: 20 });
const BA3Follow = zaniAction("Basic - Routine Negotiation 3 (Follow-Up)", { frames: 57, cancelFrames: 51, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 127.26, energy: 2.01, concerto: 4.02, offtune: 6402, forte1: 30 });
const BA4 = zaniAction("Basic - Routine Negotiation 4", { frames: 103, cancelFrames: 77, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 270.40, energy: 4.28, concerto: 8.52, offtune: 13600, forte1: 25 });
const Breakthrough = zaniAction("Basic - Breakthrough", { frames: 110, cancelFrames: 110, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 184.56, energy: 2.93, concerto: 5.86, offtune: 9282, forte1: 85 });
const MA = zaniAction("Mid-air - Routine Negotiation", { frames: 60, cancelFrames: 48, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, mv: 104.98, energy: 1.65, concerto: 3.30, offtune: 5280, forte1: 5 });
const HA = zaniAction("Heavy - Routine Negotiation", { frames: 63, cancelFrames: 47, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, mv: 164.32, energy: 2.60, concerto: 5.20, offtune: 8264, forte1: 20 });
const DC = zaniAction("Dodge Counter - Routine Negotiation", { frames: 57, cancelFrames: 51, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, mv: 222.69, energy: 3.51, concerto: 7.02 + 10, offtune: 6402, forte1: 20 });

// --- Restless Watch: the plain skill, and Crisis Response Protocol's Targeted Action once
//     Redundant Energy is full. Targeted Action deals Spectro Frazzle DMG without inflicting any
//     Frazzle — it lays the Ember itself — and opens Sunburst.
const Skill = zaniAction("Skill - Standard Defense Protocol", {
  frames: 18, cancelFrames: 8,
  cooldown: 60 * 5,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, mv: 63.94, energy: 5.67, castConcerto: 5, offtune: 2144, castForte1: 20,
});
const TargetedAction = zaniAction("Forte Skill - Targeted Action", {
  frames: 134, cancelFrames: 128,
  node: Node.Forte, cast: Cast.Skill, type: Type.Skill, subtype: Subtype.SpectroFrazzle,
  mv: 287.29, energy: 5.79, concerto: 10, castConcerto: 10, offtune: 11560, resetForte1: true,
  updateDebuffs: () => applyEnemy(HELIACAL_EMBER, 1),
  updateBuffs: () => {
    applyCurrent(SUNBURST, 1);
    applyTeam(BLAZE, 10);
  },
});

// --- Scorching Light: the Inferno Mode chain, pressed on Basic Attack but dealing Heavy Attack
//     DMG that also counts as Spectro Frazzle DMG. Each spends Blaze, and Nightfall's own spend
//     is what pays for its multiplier (SCORCHING_LIGHT below).
const HEAVY_SLASH = { node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, subtype: Subtype.SpectroFrazzle };

/** One Heavy Slash and the Blaze it costs. The spend lands in `afterAction`, a phase later than
 *  every stat — so BLAZE's own per-Blaze payout still reads the count the cast was made on — and
 *  S3's tally of what an Inferno Mode spent is taken off the same number. */
const blazeSlash = (name: string, blaze: number, def: object): Action =>
  zaniAction(name, {
    ...HEAVY_SLASH, ...def,
    afterAction: () => {
      removeStackTeam(BLAZE, blaze);
      if (isHeld(ZANI_S3) && isHeld(INFERNO_MODE)) applyCurrent(BLAZE_SPENT, blaze);
    },
  });

const Daybreak = blazeSlash("Forte Basic - Heavy Slash: Daybreak", 10, { frames: 31, cancelFrames: 31, mv: 198.83, energy: 2.26, concerto: 3.00, offtune: 4000 });
const Dawning = blazeSlash("Forte Basic - Heavy Slash: Dawning", 20, { frames: 79, cancelFrames: 71, mv: 424.09, energy: 5.13, concerto: 6.00, offtune: 9068 });
const Nightfall = blazeSlash("Forte Basic - Heavy Slash: Nightfall", 40, { frames: 151, cancelFrames: 133, mv: 397.68, energy: 9.00, concerto: 12.00, offtune: 16000 });
const Lightsmash = blazeSlash("Forte Dodge Counter - Heavy Slash: Lightsmash", 20, {
  frames: 77, cancelFrames: 69, cast: Cast.DodgeCounter, mv: 424.09, energy: 5.13, concerto: 6.00 + 10, offtune: 9068,
});
const UBA123 = new ActionGroup("Forte Basic - Daybreak + Dawning + Nightfall", [Daybreak, Dawning, Nightfall]);

// --- Between Dawn and Dusk: Rekindle opens Inferno Mode with 50 Blaze, The Last Stand closes it.
//     Only Rekindle costs the bar.
const Lib1 = zaniAction("Liberation - Rekindle", {
  frames: 200, cancelFrames: 200, timestop: 200, motionStop: 200,
  cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, 
  mv: 318.52, castConcerto: 20, offtune: 67200, resetEnergy: true,
  updateBuffs: () => {
    applyCurrent(INFERNO_MODE, 1);
    applyTeam(BLAZE, 50);
  },
});
const Lib2 = zaniAction("Liberation - The Last Stand", {
  frames: 134, cancelFrames: 134, timestop: 134, motionStop: 134,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, 
  mv: 1274.08, castConcerto: 10, offtune: 100800,
  updateBuffs: () => {
    revokeCurrent(INFERNO_MODE);
    revokeCurrent(CLOCK_OUT_REFILL);
  },
});

const Intro = zaniAction("Intro - Immediate Execution", {
  frames: 90, cancelFrames: 78, motionStop: 77,
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, mv: 202.00, energy: 10.00, castConcerto: 10, offtune: 10164, castForte1: 50,
  // her own 20s team handoff is lost here, the standing rule for a team buff that short
  updateBuffs: () => revokeTeam(BEACON),
});

/** Beacon For the Future: 150% of ATK as Spectro Frazzle DMG, +10% for every Heliacal Ember on
 *  the target, and it takes them all with it. The stacks are read in applyStats and spent in
 *  afterAction, so this cast pays for the ones it is about to clear. */
const Outro = zaniAction("Outro - Beacon For the Future", {
  frames: 0, cancelFrames: 0,
  cast: Cast.Outro, type: Type.Outro, subtype: Subtype.SpectroFrazzle, mv: 150, castConcerto: -100,
  // +10% a stack, sourced to the Embers themselves so the row says which of them paid for it
  applyStats: () => asSource(HELIACAL_EMBER, () => addStat(Stat.TotalDmg, 10 * stacksOfEnemy(HELIACAL_EMBER))),
  updateBuffs: () => applyTeam(BEACON, 1),
  afterAction: () => revokeEnemy(HELIACAL_EMBER),
});

/* ------------------------------------------------------------------------------------ buffs */

/** Sunburst: +20% amplification on the Spectro Frazzle DMG *she* deals, 14s off Targeted Action —
 *  a short self window. */
const SUNBURST = new Buff({
  name: "Zani: Sunburst", duration: 60 * 14,
  stats: [[Stat.Amp, 20, Subtype.SpectroFrazzle]],
});

/** Quick Response (Inherent Skill): +12% Spectro DMG Bonus for 14s off her Intro. */
const QUICK_RESPONSE = new Buff({
  name: "Inherent: Quick Response", duration: 60 * 14,
  stats: [[Stat.DmgBonus, 12, Attribute.Spectro]],
});
const ZANI_INHERENT_1 = new Inherent({
  name: "Inherent: Quick Response",
  grants: [{ on: onAction(Intro), buff: QUICK_RESPONSE }],
});

/** Fear No Pain (Inherent Skill): -40% DMG taken in Ready Stance. Defence is out of scope for
 *  this calculator — a no-op held for the name. */
const ZANI_INHERENT_2 = new Inherent({ name: "Inherent: Fear No Pain" });

/** Inferno Mode: the Heavy Slash chain, a 150 Blaze ceiling in place of 100, and +25% on the
 *  multiplier of every ordinary Basic Attack — which is only the Routine Negotiation chain, the
 *  Heavy Slashes that replace it dealing Heavy Attack DMG. */
const INFERNO_MODE = new Buff({
  name: "Zani: Inferno Mode",
  stats: [[Stat.MulMv, 25, Type.Basic]],
});

/** Blaze, her whole Forte Circuit resource — a team-wide stacking buff rather than a forte gauge.
 *  Most of it is banked by the Heliacal Ember conversion, which fires off a *teammate's* cast (the
 *  Resonator's own hitGlobal below), so a team buff is the one thing every slot can already
 *  reach without writing across to hers. 150 is Inferno Mode's ceiling and `applyTeam` clamps to
 *  it, so the count can never read past what she could really hold.
 *
 *  It also carries Scorching Light's per-Blaze term: Heavy Slash - Nightfall spends up to 40 and
 *  every one adds 9.95% onto that cast's own multiplier. Paid out here, while the spend itself
 *  waits for `afterAction` (`blazeSlash` above), so this reads the count the cast was made on. */
const BLAZE = new Buff({
  name: "Zani: Blaze", maxStacks: 150,
  applyStats: () => {
    if (runningAction(Nightfall)) addStat(Stat.AddMv, 9.95 * Math.min(40, frozenStacks()));
  },
});

/** Beacon For the Future's own handoff: +20% Spectro amplification for everyone but her, for as
 *  long as the target still carries an Ember — which her Outro just cleared, so this pays from
 *  the first Frazzle the team converts after it. 20s, so her own next Intro takes it down. */
const BEACON = new Buff({
  name: "Zani: Outro",
  applyStats: () => {
    if (isHeld(ZANI_RESONATOR) || stacksOfEnemy(HELIACAL_EMBER) === 0) return;
    addStat(Stat.Amp, 20, Attribute.Spectro);
  },
});

/* -------------------------------------------------------------------------------- sequences */

/** S1: +50% Spectro DMG Bonus for 14s off Targeted Action. Nightfall's interrupt immunity is
 *  nothing this engine models. */
const S1_SPECTRO = new Buff({
  name: "Zani S1: When the Alarm Clock Rings", duration: 60 * 14,
  stats: [[Stat.DmgBonus, 50, Attribute.Spectro]],
});
const ZANI_S1 = new Sequence({
  name: "Zani S1: When the Alarm Clock Rings",
  grants: [{ on: onAction(TargetedAction), buff: S1_SPECTRO }],
});

/** S2: +20% Crit. Rate flat, and Targeted Action's multiplier x1.8 — nanoka's own S-chain twin of
 *  that row is 287.29% x 1.8, so the 80% is a multiplier on it rather than points added to it. */
const ZANI_S2 = new Sequence({
  name: "Zani S2: Stale Bread With Energy Drink",
  stats: [[Stat.CritRate, 20]],
  applyStats: () => { if (runningAction(TargetedAction)) addStat(Stat.MulMv, 80); },
});

/** Every Blaze spent inside one Inferno Mode, which is what S3 pays The Last Stand for. Banked
 *  off whatever the acting cast declared it would spend, so the Heavy Slash chain feeds it
 *  without any of them naming the sequence. */
const BLAZE_SPENT = new Buff({
  name: "Zani S3: Each Day A New Commute", maxStacks: 150,
  display: () => `Zani S3: Each Day A New Commute (${frozenStacks()} Blaze)`,
  // +8% on The Last Stand's last stage a Blaze, capped at 1200 — points onto the multiplier, the
  // way the Forte Circuit's own "Additional Multiplier Per Blaze" row is. `frozenStacks()` is this
  // buff's own count as the action ended on it, which is what the Sequence read through
  // `stacksOf()` from outside.
  applyStats: () => { if (runningAction(Lib2)) addStat(Stat.AddMv, Math.min(1200, 8 * frozenStacks())); },
});
const ZANI_S3 = new Sequence({
  name: "Zani S3: Each Day A New Commute",
  convertStats: () => { if (runningAction(Lib2)) revokeCurrent(BLAZE_SPENT); },
});

/** S4: +20% ATK to the whole team for 30s off her Intro — permanent once granted. */
const S4_ATK = new Buff({ name: "Zani S4: More Efficiency, Less Drama", stats: [[Stat.BonusAtk, 20]] });
const ZANI_S4 = new Sequence({
  name: "Zani S4: More Efficiency, Less Drama",
  grants: [{ on: onAction(Intro), buff: S4_ATK, to: BuffTarget.Team }],
});

/** S5: Rekindle's multiplier x2.2 — nanoka's twin row again (318.52% x 2.2). */
const ZANI_S5 = new Sequence({
  name: "Zani S5: Delivered In Full On Time",
  applyStats: () => { if (runningAction(Lib1)) addStat(Stat.MulMv, 120); },
});

/** The one Blaze refill S6 grants per Inferno Mode — put up by Rekindle, spent by the first
 *  Heavy Slash that leaves her under 70. Read in afterAction, the one phase that sees the gauge
 *  as the cast actually left it. */
const CLOCK_OUT_REFILL = new Buff({ });

/** S6: the Heavy Slash chain's multipliers x1.4, another 40% on Nightfall's multiplier a Blaze on
 *  top of the base 9.95%, and the refill above. The fatal-blow clause is out of scope. */
const ZANI_S6 = new Sequence({
  name: "Zani S6: First Things First? Clock Out!",
  updateBuffs: () => { if (runningAction(Lib1)) applyCurrent(CLOCK_OUT_REFILL, 1); },
  // the two multipliers are unconditional in the node's own text — it is only the refill below
  // that it gates on Inferno Mode, and the Heavy Slashes are in it whenever they are castable
  applyStats: () => {
    if (runningAction(Daybreak) || runningAction(Dawning) || runningAction(Nightfall) || runningAction(Lightsmash)) {
      addStat(Stat.MulMv, 40);
    }
  },
  afterAction: () => {
    if (!isHeld(INFERNO_MODE) || !isHeld(CLOCK_OUT_REFILL) || stacksOfTeam(BLAZE) >= 70) return;
    applyTeam(BLAZE, 70);
    revokeCurrent(CLOCK_OUT_REFILL);
  },
});

const ZANI_TALENTS = new Talent({
  name: "Zani: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.CritRate, 8]],
});

/** Her, as a Resonator — and the Heliacal Ember conversion, which lives here because it is the
 *  Forte Circuit's and has to answer a *teammate's* hit: `hitGlobal` runs her own gear on
 *  every hit anyone lands, with the pointers still on her, so the Blaze lands on her bar while
 *  she is off field. The rung fires on whoever put the Frazzle there — Negative Status damage is
 *  theirs, not hers. The clamp after it is Blaze's real ceiling, 100 until Inferno Mode raises it
 *  (the Resonator can only declare the one number, so the lower tier is enforced here). */
const ZANI_RESONATOR = new Resonator({
  name: "Zani",
  talent: ZANI_TALENTS,
  inherent1: ZANI_INHERENT_1,
  inherent2: ZANI_INHERENT_2,
  element: Attribute.Spectro,
  weapon: WeaponType.Gauntlets,
  color: "#b8a897",
  intro: Intro,
  tuneBreak: tuneBreak(94, 94, 70),
  maxEnergy: 125,
  maxForte1: 100,

  stats: [[Stat.BaseHp, 10775], [Stat.BaseAtk, 437.5], [Stat.BaseDef, 1136.6646]],
  hitGlobal: () => {
    if (applied(SPECTRO_FRAZZLE) > 0) {
      const held = stacksOfEnemy(SPECTRO_FRAZZLE);
      // the whole ladder as the stacks come off — 6 converted fires 6+5+4+3+2+1 — reported as
      // one "Heliacal Ember - N Stacks" row whose MV is those rungs (shared/status.ts)
      const rung = negativeStatusRung(HELIACAL_EMBER_ACTIONS, held);
      if (rung) queueOnApplier(SPECTRO_FRAZZLE, rung);
      revokeEnemy(SPECTRO_FRAZZLE);
      const before = stacksOfEnemy(HELIACAL_EMBER);
      applyTeam(BLAZE, 5 * (applyEnemy(HELIACAL_EMBER, held) - before));
    }
  },
});

/* ---------------------------------------------------------------------------------- rotation */

/** Her one loop, and she is always the team's main DPS. The Intro (50), Standard Defense Protocol
 *  (20) and the Stage 3 it hands back (30) fill Redundant Energy exactly, so Targeted Action
 *  lands on 100 and spends the lot; Rekindle then opens Inferno with the Blaze her teammates'
 *  Frazzle has been converting into Embers all along, and two full Daybreak/Dawning/Nightfall
 *  chains (70 Blaze each) spend the 150 before The Last Stand closes it.
 *
 *  No start-of-combat section: the opening scramble finds her with no Resonance Energy, no
 *  Redundant Energy and no Blaze, so there is nothing of hers worth spending in it. */
const ZANI_ROTATION = new Rotation([
  INTRO, Skill, BA3Follow, TargetedAction,
  Lib1,
  UBA123, UBA123.cancel(),
  Lib2, ECHO.instaSwap(), Outro,
]);
const ZANI_ROTATION_S6 = new Rotation([
  INTRO, Skill, BA3Follow, TargetedAction,
  Lib1,
  UBA123, UBA123, UBA123.cancel(),
  Lib2, ECHO.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

export const ZANI = new Loadout({
  resonator: ZANI_RESONATOR,
  weapons: [BLAZING_JUSTICE, NEW_STD_GAUNTLET, ABYSS_SURGES, TRAGICOMEDY],
  echoLoadouts: [
    new EchoLoadout(CAPITANEUS, ETERNAL_RADIANCE_5PC),
    new EchoLoadout(NM_MOURNING_AIX, ETERNAL_RADIANCE_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Spectro3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.Heavy, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Heavy, Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  rotation: {0: ZANI_ROTATION, 6: ZANI_ROTATION_S6},
  sequences: [ZANI_S1, ZANI_S2, ZANI_S3, ZANI_S4, ZANI_S5, ZANI_S6],
});
