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
  stacksOfEnemy,
  stacksOfTeam,
  applyOn,
  setForte2,
  runningBullet,
} from "../../engine/context.js";
import { Action, Rotation, ECHO, ActionGroup, INTRO, OUTRO } from "../../engine/rotation.js";
import { tuneBreak } from "../../shared/tunebreak.js";
import {
  HELIACAL_EMBER, HELIACAL_EMBER_ACTIONS, SPECTRO_FRAZZLE, negativeStatusRung, queueOnApplier,
} from "../../shared/status.js";
import { BLAZING_JUSTICE, TRAGICOMEDY } from "../../weapons/gauntlet.js";
import { ABYSS_SURGES, NEW_STD_GAUNTLET } from "../../weapons/standard.js";
import { CAPITANEUS, NM_MOURNING_AIX, ETERNAL_RADIANCE_5PC } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function zaniAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Spectro, scaling: Scaling.Atk, ...def });
}

/** Inferno Mode: 20s off Rekindle, until The Last Stand. The Heavy Slash chain (which needs it), a
 *  150 Blaze ceiling in place of 100, and +25% on the multiplier of every ordinary Basic Attack —
 *  which is only the Routine Negotiation chain, the Heavy Slashes dealing Heavy Attack DMG. */
const INFERNO_MODE = new Buff({
  name: "Zani: Inferno Mode", duration: 60 * 20,
  stats: [[Stat.MulMv, 25, Type.Basic]],
});

/** Standard Defense Protocol's block stance: "press Normal Attack within a certain time to perform
 *  Basic Attack Stage 3" — the follow-up needs it and ends it; it ends early on a swap out. */
const BLOCK_STANCE = new Buff({ name: "Zani: Block Stance", lostOnSwap: true });

// --- Routine Negotiation: the ordinary chain, every hit of which banks Redundant Energy. Stage 3
//     has a second form, the one the block stance hands back — the same press for 10 more.
const BA1 = zaniAction("Basic - Routine Negotiation 1", { animFrames: 24, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 16, mv: 5885, energy: 93, concerto: 185, offtune: 2960, forte1: 5 }]});
const BA2 = zaniAction("Basic - Routine Negotiation 2", { animFrames: 32, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 18, mv: 7953, energy: 125, concerto: 250, offtune: 4000, forte1: 5 }]});
const BA3 = zaniAction("Basic - Routine Negotiation 3", { animFrames: 57, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 4242, energy: 67, concerto: 134, offtune: 2134, forte1: 5 },
    { hitFrame: 33, mv: 4242, energy: 67, concerto: 134, offtune: 2134, forte1: 5 },
    { hitFrame: 51, mv: 4242, energy: 67, concerto: 134, offtune: 2134, forte1: 10 },
  ]});
const BA3Follow = zaniAction("Basic - Routine Negotiation 3 (Follow-Up)", { requireBuff: BLOCK_STANCE, updateBuffs: () => revokeCurrent(BLOCK_STANCE), animFrames: 57, castPriority: 2, bullets: [
    { hitFrame: 12, mv: 4242, energy: 67, concerto: 134, offtune: 2134, forte1: 5 },
    { hitFrame: 33, mv: 4242, energy: 67, concerto: 134, offtune: 2134, forte1: 5 },
    { hitFrame: 51, mv: 4242, energy: 67, concerto: 134, offtune: 2134, forte1: 20 },
  ], node: Node.Normal, cast: Cast.Basic, type: Type.Basic});
const BA4 = zaniAction("Basic - Routine Negotiation 4", { animFrames: 103, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 26, mv: 6760, energy: 107, concerto: 213, offtune: 3400, forte1: 5 },
    { hitFrame: 42, mv: 6760, energy: 107, concerto: 213, offtune: 3400, forte1: 5 },
    { hitFrame: 69, mv: 6760, energy: 107, concerto: 213, offtune: 3400, forte1: 5 },
    { hitFrame: 77, mv: 6760, energy: 107, concerto: 213, offtune: 3400, forte1: 10 },
  ]});
const Breakthrough = zaniAction("Basic - Breakthrough", { animFrames: 110, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 26, mv: 6150, energy: 97, concerto: 194, offtune: 3094, forte1: 15 },
    { hitFrame: 50, mv: 1758, energy: 28, concerto: 56, offtune: 884, forte1: 10 },
    { hitFrame: 60, mv: 1758, energy: 28, concerto: 56, offtune: 884, forte1: 10 },
    { hitFrame: 70, mv: 1758, energy: 28, concerto: 56, offtune: 884, forte1: 10 },
    { hitFrame: 80, mv: 1758, energy: 28, concerto: 56, offtune: 884, forte1: 10 },
    { hitFrame: 90, mv: 1758, energy: 28, concerto: 56, offtune: 884, forte1: 10 },
    { hitFrame: 100, mv: 1758, energy: 28, concerto: 56, offtune: 884, forte1: 10 },
    { hitFrame: 110, mv: 1758, energy: 28, concerto: 56, offtune: 884, forte1: 10 },
  ]});
const MA = zaniAction("Mid-air - Routine Negotiation", { animFrames: 60, animPriority: { 56: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 48, mv: 10498, energy: 165, concerto: 330, offtune: 5280, forte1: 5 }]});
const HA = zaniAction("Heavy - Routine Negotiation", { animFrames: 63, castPriority: 2, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 12, mv: 4108, energy: 65, concerto: 130, offtune: 2066, forte1: 5 },
    { hitFrame: 35, mv: 4108, energy: 65, concerto: 130, offtune: 2066, forte1: 5 },
    { hitFrame: 41, mv: 4108, energy: 65, concerto: 130, offtune: 2066, forte1: 5 },
    { hitFrame: 47, mv: 4108, energy: 65, concerto: 130, offtune: 2066, forte1: 5 },
  ]});
const DC = zaniAction("Dodge Counter - Routine Negotiation", { animFrames: 57, animPriority: { 2: 2 }, castPriority: 8, node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 7423, energy: 117, concerto: 234, offtune: 2134, forte1: 5 },
    { hitFrame: 33, mv: 7423, energy: 117, concerto: 234, offtune: 2134, forte1: 5 },
    { hitFrame: 51, mv: 7423, energy: 117, concerto: 234, offtune: 2134, forte1: 10 },
  ], castConcerto: 1000});

// --- Restless Watch: the plain skill, and Crisis Response Protocol's Targeted Action once
//     Redundant Energy is full. Targeted Action deals Spectro Frazzle DMG without inflicting any
//     Frazzle — it lays the Ember itself — and opens Sunburst.
const Skill = zaniAction("Skill - Standard Defense Protocol", {
  animFrames: 18, animPriority: { 0: 2 }, castPriority: 7,
  cooldown: 60 * 5,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 8, mv: 6394, energy: 567, offtune: 2144 }], castConcerto: 500, castForte1: 20,
  updateBuffs: () => applyCurrent(BLOCK_STANCE, 1),
});
// "When Zani is not in Inferno Mode and has full Redundant Energy"
const TargetedAction = zaniAction("Forte Skill - Targeted Action", { minForte1: 100,
  animFrames: 134, animPriority: { 134: 2 }, castPriority: 4, noSwapFrames: 38,
  node: Node.Forte, cast: Cast.Skill, type: Type.Skill, subtype: Subtype.SpectroFrazzle,
  bullets: [
    { hitFrame: 66, mv: 8619, energy: 174, concerto: 300, offtune: 3468,
      updateDebuffs: () => applyEnemy(HELIACAL_EMBER, 1) },
    { hitFrame: 117, mv: 2873, energy: 58, concerto: 100, offtune: 1156 },
    { hitFrame: 128, mv: 17237, energy: 347, concerto: 600, offtune: 6936 },
  ], castConcerto: 1000, resetForte1: true,
  updateBuffs: () => {
    applyCurrent(SUNBURST, 1);
    applyTeam(BLAZE, 10);
    syncBlaze();
  },
});

// --- Scorching Light: the Inferno Mode chain, pressed on Basic Attack but dealing Heavy Attack
//     DMG that also counts as Spectro Frazzle DMG. Each spends Blaze, and Nightfall's own spend
//     is what pays for its multiplier (SCORCHING_LIGHT below).
const HEAVY_SLASH = { requireBuff: INFERNO_MODE, node: Node.Forte, cast: Cast.Basic, type: Type.Heavy, subtype: Subtype.SpectroFrazzle };

/** One Heavy Slash. Its Blaze is spent hit by hit (SLASH_SPEND below), by BLAZE itself. */
const blazeSlash = (name: string, def: object): Action => zaniAction(name, { ...HEAVY_SLASH, ...def });

// "When Blaze is no less than 30, Basic Attack is replaced with Heavy Slash - Daybreak"
const Daybreak = blazeSlash("Forte Basic - Heavy Slash: Daybreak", { minForte2: 30, animFrames: 31, animPriority: { 31: 2 }, castPriority: 4, bullets: [
    { hitFrame: 20, mv: 4971, energy: 57, concerto: 75, offtune: 1000 },
    { hitFrame: 29, mv: 11929, energy: 135, concerto: 180, offtune: 2400 },
    { hitFrame: 31, mv: 2983, energy: 34, concerto: 45, offtune: 600 },
  ] });
const Dawning = blazeSlash("Forte Basic - Heavy Slash: Dawning", { animFrames: 79, animPriority: { 79: 2 }, castPriority: 4, bullets: [
    { hitFrame: 18, mv: 14843, energy: 179, concerto: 210, offtune: 3173 },
    { hitFrame: 28, mv: 3393, energy: 41, concerto: 48, offtune: 726 },
    { hitFrame: 56, mv: 14843, energy: 179, concerto: 210, offtune: 3173 },
    { hitFrame: 67, mv: 4665, energy: 57, concerto: 66, offtune: 998 },
    { hitFrame: 71, mv: 4665, energy: 57, concerto: 66, offtune: 998 },
  ]});
const Nightfall = blazeSlash("Forte Basic - Heavy Slash: Nightfall", { animFrames: 151, animPriority: { 151: 2 }, castPriority: 4, bullets: [
    { hitFrame: 22, mv: 5170, energy: 117, concerto: 156, offtune: 2080 },
    { hitFrame: 32, mv: 1591, energy: 36, concerto: 48, offtune: 640 },
    { hitFrame: 51, mv: 5170, energy: 117, concerto: 156, offtune: 2080 },
    { hitFrame: 61, mv: 1591, energy: 36, concerto: 48, offtune: 640 },
    { hitFrame: 80, mv: 7953, energy: 180, concerto: 240, offtune: 3200 },
    { hitFrame: 90, mv: 796, energy: 18, concerto: 24, offtune: 320 },
    { hitFrame: 94, mv: 796, energy: 18, concerto: 24, offtune: 320 },
    { hitFrame: 118, mv: 2784, energy: 63, concerto: 84, offtune: 1120 },
    { hitFrame: 133, mv: 13917, energy: 315, concerto: 420, offtune: 5600 },
  ]});
// "... and Zani has no less than 30 Blazes, ... perform Heavy Slash - Lightsmash"
const Lightsmash = blazeSlash("Forte Dodge Counter - Heavy Slash: Lightsmash", { minForte2: 30,
  animFrames: 77, animPriority: { 2: 4, 73: 2 }, castPriority: 8, bullets: [
    { hitFrame: 12, mv: 14843, energy: 179, concerto: 210, offtune: 3173 },
    { hitFrame: 22, mv: 3393, energy: 41, concerto: 48, offtune: 726 },
    { hitFrame: 50, mv: 14843, energy: 179, concerto: 210, offtune: 3173 },
    { hitFrame: 63, mv: 4665, energy: 57, concerto: 66, offtune: 998 },
    { hitFrame: 69, mv: 4665, energy: 57, concerto: 66, offtune: 998 },
  ], castConcerto: 1000, cast: Cast.DodgeCounter,
});
const UBA123 = new ActionGroup("Forte Basic - Daybreak + Dawning + Nightfall", [Daybreak, Dawning, Nightfall]);
/** The Blaze each Heavy Slash hit consumes, by bullet (wuwalab's per-hit spend): 10/20/40/20 a press. */
const SLASH_SPEND = new Map<Action, number[]>([
  [Daybreak, [0, 10, 0]],
  [Dawning, [10, 0, 10, 0, 0]],
  [Nightfall, [5, 0, 5, 0, 10, 0, 0, 0, 20]],
  [Lightsmash, [10, 0, 10, 0, 0]],
]);
/** What the Heavy Slash hit being run spends, 0 off any other hit. */
function slashSpend(): number {
  for (const [slash, spend] of SLASH_SPEND) {
    for (let k = 0; k < spend.length; k++) if (spend[k] && runningBullet(slash, k)) return spend[k]!;
  }
  return 0;
}

// --- Between Dawn and Dusk: Rekindle opens Inferno Mode with 50 Blaze, The Last Stand closes it.
//     Only Rekindle costs the bar.
const Lib1 = zaniAction("Liberation - Rekindle", {
  animFrames: 200, animPriority: { 200: 2 }, castPriority: 10, timestop: [0, 200], motionStop: [0, 200],
  cooldown: 60 * 25,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, 
  bullets: [{ hitFrame: 120, mv: 31852, offtune: 67200 }], castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => {
    applyCurrent(INFERNO_MODE, 1);
    applyTeam(BLAZE, 50);
    syncBlaze();
  },
});
// "When in Inferno Mode, Resonance Liberation The Last Stand becomes available"
const Lib2 = zaniAction("Liberation - The Last Stand", { requireBuff: INFERNO_MODE,
  animFrames: 134, animPriority: { 134: 2 }, castPriority: 10, timestop: [0, 134], motionStop: [0, 134],
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, 
  bullets: [{ hitFrame: 44, mv: 19112, offtune: 15120 }, { hitFrame: 128, mv: 108296, offtune: 85680 }], castConcerto: 1000,
  updateBuffs: () => {
    revokeCurrent(INFERNO_MODE);
    revokeCurrent(CLOCK_OUT_REFILL);
    syncBlaze();
  },
});

const Intro = zaniAction("Intro - Immediate Execution", {
  animFrames: 90, noSwapFrames: 80, animPriority: { 78: 5, 90: 2 }, castPriority: 11, motionStop: [4, 80],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [
    { hitFrame: 20, mv: 2424, energy: 120, offtune: 1220 },
    { hitFrame: 26, commitFrame: 20, mv: 2424, energy: 120, offtune: 1220 },
    { hitFrame: 32, commitFrame: 20, mv: 2424, energy: 120, offtune: 1220 },
    { hitFrame: 38, commitFrame: 20, mv: 2424, energy: 120, offtune: 1220 },
    { hitFrame: 44, commitFrame: 20, mv: 2424, energy: 120, offtune: 1220 },
    { hitFrame: 78, mv: 8080, energy: 400, offtune: 4064 },
  ], castConcerto: 1000, castForte1: 50,
  // her own 20s team handoff is lost here, the standing rule for a team buff that short
  updateBuffs: () => revokeTeam(BEACON),
});

/** Beacon For the Future: 150% of ATK as Spectro Frazzle DMG, +10% for every Heliacal Ember on
 *  the target, and it takes them all with it. The stacks are read in applyStats and spent in
 *  afterAction, so this cast pays for the ones it is about to clear. */
const Outro = zaniAction("Outro - Beacon For the Future", {
  animFrames: 0,
  cast: Cast.Outro, type: Type.Outro, subtype: Subtype.SpectroFrazzle, bullets: [{ hitFrame: 0, mv: 15000 }], minConcerto: 10000, castConcerto: -10000,
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

/** Blaze, her whole Forte Circuit resource — a team-wide stacking buff rather than a forte gauge.
 *  Most of it is banked by the Heliacal Ember conversion, which fires off a *teammate's* cast (the
 *  Resonator's own hitGlobal below), so a team buff is the one thing every slot can already
 *  reach without writing across to hers. 150 is Inferno Mode's ceiling and `applyTeam` clamps to
 *  it, so the count can never read past what she could really hold.
 *
 *  It also spends the Heavy Slashes' Blaze, hit by hit after each hit's damage, and pays Scorching
 *  Light's per-Blaze term: each Nightfall hit adds 9.95% a Blaze that hit consumes, read off the
 *  count before its own spend. S3's tally of what an Inferno Mode spent takes the same number. */
/** After any Blaze change: its 100 cap outside Inferno Mode (150 in it, BLAZE's own), then her forte2
 *  gauge set to the count, which the Heavy Slashes' conditions read — on her own slot whoever's
 *  hit moved it. */
function syncBlaze(): void {
  applyOn(ZANI_RESONATOR, () => {
    const over = stacksOfTeam(BLAZE) - 100;
    if (over > 0 && !isHeld(INFERNO_MODE)) removeStackTeam(BLAZE, over);
    setForte2(stacksOfTeam(BLAZE));
  });
}
const BLAZE = new Buff({
  name: "Zani: Blaze", maxStacks: 150,
  applyStats: () => {
    if (runningAction(Nightfall)) addStat(Stat.AddMv, 995 * Math.min(slashSpend(), frozenStacks()));
  },
  afterHit: () => {
    const spend = Math.min(slashSpend(), stacksOfTeam(BLAZE));
    if (!spend) return;
    removeStackTeam(BLAZE, spend);
    syncBlaze();
    if (isHeld(ZANI_S3) && isHeld(INFERNO_MODE)) applyCurrent(BLAZE_SPENT, spend);
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
  applyStats: () => {
    if (runningBullet(Lib2, -1)) addStat(Stat.AddMv, Math.min(120000, 800 * frozenStacks()));
  },
});
const ZANI_S3 = new Sequence({
  name: "Zani S3: Each Day A New Commute",
  afterAction: () => { if (runningAction(Lib2)) revokeCurrent(BLAZE_SPENT); },
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
    syncBlaze();
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
  outro: Outro,
  tuneBreak: tuneBreak(94, [0, 94], [0, 70], [[72, 160000]]),
  maxEnergy: 12500,
  maxForte1: 100,
  // Blaze's mirror (syncBlaze): Inferno Mode's 150, the lower 100 clamped there
  maxForte2: 150,

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
      syncBlaze();
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
  Lib2, ECHO.instaSwap(), OUTRO,
]);
const ZANI_ROTATION_S6 = new Rotation([
  INTRO, Skill, BA3Follow, TargetedAction,
  Lib1,
  UBA123, UBA123, UBA123.cancel(),
  Lib2, ECHO.instaSwap(), OUTRO,
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
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.Heavy, Substat.AtkPct, Substat.FlatAtk, Substat.Liberation, Substat.Skill),
  rotation: {0: ZANI_ROTATION, 6: ZANI_ROTATION_S6},
  sequences: [ZANI_S1, ZANI_S2, ZANI_S3, ZANI_S4, ZANI_S5, ZANI_S6],
});
