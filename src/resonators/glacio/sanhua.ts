/**
 * Sanhua, ported to the new engine. `Tier.Free` — a 4-star, so all six sequence
 * nodes (SANHUA_S1-S6) are always-equipped gear pieces folded into her loadout unconditionally,
 * each owning its own trigger logic per the standing "sequence logic lives in the sequence piece"
 * rule. Her Forte Circuit (Detonate) bursts whichever Ice Creations are up — Ice Thorn (Intro),
 * Ice Prism (Skill), Glacier (Liberation, doubled by S5) — each a stackable marker buff Detonate's
 * own updateBuffs() reads and consumes.
 */
import { Tier, Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  revokeTeam,
  isHeld,
  stacksOf,
  removeStack,
  revokeCurrent,
  casting,
  onAction,
  runningAction,
  addStat,
  frozenStacks,
  queue,
  queueQTE,
} from "../../engine/context.js";
import { Action, Rotation, ECHO, NOINTRO, ActionGroup, INTRO, OUTRO } from "../../engine/rotation.js";
import { tuneBreak, SWORD_BREAK } from "../../shared/tunebreak.js";
import { EMERALD_OF_GENESIS, OVERTURE } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { BLAZING_BRILLIANCE } from "../../weapons/sword.js";

/* ----------------------------------------------------------------------------------- actions */

function sanhuaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

// Intro creates Ice Thorn; Skill creates Ice Prism; Liberation creates a Glacier stack (a second
// under S5) and arms Blade Mastery (S4) — each marker granted by the cast that makes it, for
// Detonate to spend below.
const Intro = sanhuaAction("Intro - Freezing Thorns", {
  qteFrames: 52, animFrames: 60, animPriority: { 0: 8 }, castPriority: 11, noSwapFrames: 70, motionStop: [0, 52],
  node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 54, mv: 13917, energy: 1000, offtune: 7304 }], castConcerto: 1000,
  updateBuffs: () => applyCurrent(THORN_BUFF, 1),
});
const Outro = sanhuaAction("Outro - Silversnow", {
  animFrames: 0,
  cast: Cast.Outro, minConcerto: 10000, castConcerto: -10000,
  updateBuffs: () => queueQTE(SANHUA_OUTRO),
});

const Skill = sanhuaAction("Skill - Eternal Frost", {
  animFrames: 60, animPriority: { 59: 2 }, castPriority: 4, cooldown: 60 * 10,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 18, mv: 35985, energy: 1000, offtune: 8000 }], castConcerto: 1500,
  updateBuffs: () => applyCurrent(PRISM_BUFF, 1),
});
const Liberation = sanhuaAction("Liberation - Glacial Gaze", {
  animFrames: 97, animPriority: { 93: 0 }, castPriority: 10, timestop: [0, 90], motionStop: [0, 90], cooldown: 60 * 16,
  node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, bullets: [{ hitFrame: 72, mv: 80948, offtune: 61440 }], castConcerto: 2000, resetEnergy: true,
  updateBuffs: () => applyCurrent(GLACIER_BUFF, 1),
});

const BA1 = sanhuaAction("Basic - Frigid Light 1", { animFrames: 23, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 13, mv: 4871, energy: 87, concerto: 200, offtune: 2800 }]});
const BA2 = sanhuaAction("Basic - Frigid Light 2", { animFrames: 33, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 24, mv: 7376, energy: 132, concerto: 400, offtune: 4240 }]});
const BA3 = sanhuaAction("Basic - Frigid Light 3", { animFrames: 36, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 18, mv: 2158, energy: 38, concerto: 200, offtune: 1240 },
    { hitFrame: 24, mv: 2158, energy: 38, concerto: 200, offtune: 1240 },
    { hitFrame: 30, mv: 2158, energy: 38, concerto: 200, offtune: 1240 },
    { hitFrame: 36, mv: 2158, energy: 38, concerto: 200, offtune: 1240 },
  ]});
const BA4 = sanhuaAction("Basic - Frigid Light 4", { animFrames: 36, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 12, mv: 3967, energy: 71, concerto: 400, offtune: 2280 },
    { hitFrame: 24, mv: 3967, energy: 71, concerto: 400, offtune: 2280 },
  ]});
const BA5 = sanhuaAction("Basic - Frigid Light 5", { animFrames: 109, animPriority: { 6: 4, 41: 2 }, castPriority: 2, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 32, mv: 23381, energy: 420, concerto: 1000, offtune: 13440 }]});
const HA = sanhuaAction("Heavy - Frigid Light", { animFrames: 50, animPriority: { 47: 2 }, castPriority: 3, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 10, mv: 2227, energy: 40, concerto: 160, offtune: 1600 },
    { hitFrame: 14, commitFrame: 10, mv: 2227, energy: 40, concerto: 160, offtune: 1600 },
    { hitFrame: 18, commitFrame: 10, mv: 2227, energy: 40, concerto: 160, offtune: 1600 },
    { hitFrame: 22, commitFrame: 10, mv: 2227, energy: 40, concerto: 160, offtune: 1600 },
    { hitFrame: 36, mv: 2227, energy: 40, concerto: 160, offtune: 1600 },
  ]});
const MA = sanhuaAction("Mid-air - Frigid Light Plunge", { animFrames: 60, animPriority: { 44: 2 }, castPriority: 6, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 34, mv: 8629, energy: 51, concerto: 100, offtune: 9520 }]});
const BA23 = new ActionGroup("Basic - Frigid Light 23", [BA2, BA3]);
const BA234 = new ActionGroup("Basic - Frigid Light 234", [BA2, BA3, BA4]);

// Ice Thorn's own burst is a real exception, not a data gap: 0 concerto (every other burst pays
// 1500), just 200 Energy — kept as given rather than smoothed over.
const FHA = sanhuaAction("Forte Heavy - Detonate", {
  animFrames: 101, castPriority: 3,
  node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [
    { hitFrame: 51, mv: 18629, energy: 234, concerto: 750, offtune: 7496,
      // on its hit, spends whichever Ice Creations are up and queues the matching burst(s)
      updateDebuffs: () => {
        if (stacksOf(THORN_BUFF)) { queue(DETONATE_THORN); removeStack(THORN_BUFF, 1); }
        if (stacksOf(PRISM_BUFF)) { queue(DETONATE_PRISM); removeStack(PRISM_BUFF, 1); }
        const glaciers = stacksOf(GLACIER_BUFF);
        for (let i = 0; i < glaciers; i++) queue(DETONATE_GLACIER);
        if (glaciers) removeStack(GLACIER_BUFF, glaciers);
      } },
    { hitFrame: 101, mv: 18629, energy: 234, concerto: 750, offtune: 7496 },
  ],
});
const DETONATE_THORN = sanhuaAction("Forte - Ice Burst (Thorn)", { node: Node.Normal, type: Type.Skill, bullets: [{ hitFrame: 0, mv: 5965, energy: 200, concerto: 0 }] });
const DETONATE_PRISM = sanhuaAction("Forte - Ice Burst (Prism)", { node: Node.Normal, type: Type.Skill, bullets: [{ hitFrame: 0, mv: 7953, energy: 700 }], castConcerto: 1500 });
const DETONATE_GLACIER = sanhuaAction("Forte - Ice Burst (Glacier)", { node: Node.Normal, type: Type.Skill, bullets: [{ hitFrame: 0, mv: 13917, energy: 700 }], castConcerto: 1500 });

/* ------------------------------------------------------------------------------------ buffs */

/** Condensation (Inherent Skill): +20% Resonance Skill DMG for 8s after Intro. */
const CONDENSATION = new Buff({
  name: "Inherent: Condensation",
  duration: 60 * 8,
  stats: [[Stat.DmgBonus, 20, Type.Skill]],
});
/** Condensation's own trigger — always-equipped Inherent Skill piece. */
const SH_INHERENT_1 = new Inherent({
  name: "Inherent: Condensation",
  grants: [{ on: onAction(Intro), buff: CONDENSATION }],
});

/** Avalanche (Inherent Skill): +20% Ice Burst DMG for 8s after Basic Attack 5. Scoped by checking
 *  the three Ice Burst actions directly — not Subtype.FusionBurst, which is Fusion's own proc type. */
const AVALANCHE = new Buff({
  name: "Inherent: Avalanche",
  duration: 60 * 8,
  applyStats: () => {
    if (runningAction(DETONATE_THORN) || runningAction(DETONATE_PRISM) || runningAction(DETONATE_GLACIER)) addStat(Stat.DmgBonus, 20);
  },
});
/** Avalanche's own trigger — always-equipped Inherent Skill piece. */
const SH_INHERENT_2 = new Inherent({
  name: "Inherent: Avalanche",
  grants: [{ on: onAction(BA5), buff: AVALANCHE }],
});

/** S1 Solitude's Embrace: Basic Attack 5 grants +15% Crit Rate, 10s. Trigger lives in SANHUA_S1. */
const S1_CRIT = new Buff({
  name: "Sanhua S1: Solitude's Embrace",
  duration: 60 * 10,
  stats: [[Stat.CritRate, 15]],
});

/** S4 Blade Mastery: arms a one-shot +120% DMG Bonus for the next Detonate within 5s, consumed on
 *  landing. Trigger lives in SANHUA_S4. */
const S4_WINDOW = new Buff({
  name: "Sanhua S4: Blade Mastery",
  duration: 60 * 5,
  applyStats: () => { if (runningAction(FHA)) addStat(Stat.DmgBonus, 120); },
  afterAction: () => { if (runningAction(FHA)) revokeCurrent(S4_WINDOW); },
});

/** S6 Daybreak Radiance: detonating an Ice Prism/Glacier grants the *other* two members +10% ATK,
 *  excluding Sanhua herself. Lost on her own next Intro, same shape as Verina's Gift of Nature. */
const S6_ATK = new Buff({
  name: "Sanhua S6: Daybreak Radiance", maxStacks: 2, duration: 60 * 20,
  applyStats: () => { if (!isHeld(SANHUA_RESONATOR)) addStat(Stat.BonusAtk, 10 * frozenStacks()); },
  updateBuffs: () => { if (casting(Cast.Intro) && isHeld(SANHUA_RESONATOR)) revokeTeam(S6_ATK); },
});

/** Ice Creations: one stackable marker each, granted by the cast that makes it and consumed by
 *  Detonate's own updateDebuffs() below, which queues the matching burst(s). No stat of their own. */
const THORN_BUFF = new Buff({
  name: "Sanhua: Ice Thorn",
});
const PRISM_BUFF = new Buff({
  name: "Sanhua: Ice Prism",
});
const GLACIER_BUFF = new Buff({
  name: "Sanhua: Glacier", maxStacks: 2, duration: 60 * 5,
});

const SANHUA_OUTRO = new Buff({
  name: "Sanhua: Outro",
  duration: 60 * 14,
  stats: [[Stat.Amp, 38, Type.Basic]],
  lostOnSwap: true,
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as always-equipped gear pieces (Tier.Free — see file header); every
// trigger a sequence needs lives in its own piece, not the central Resonator updateBuffs() below.

const SANHUA_S1 = new Sequence({
  name: "Sanhua S1: Solitude's Embrace",
  grants: [{ on: onAction(BA5), buff: S1_CRIT }],
});

// S2 Snowy Clarity: STA-cost/interruption-resistance only — a do-nothing piece, held for the name
const SANHUA_S2 = new Sequence({ name: "Sanhua S2: Snowy Clarity" });

// S3 Anomalous Vision: flat DMG Bonus, no separate trigger needed
const SANHUA_S3 = new Sequence({
  name: "Sanhua S3: Anomalous Vision", stats: [[Stat.DmgBonus, 24.5]],
});

const SANHUA_S4 = new Sequence({
  name: "Sanhua S4: Blade Mastery",
  grants: [{ on: onAction(Liberation), buff: S4_WINDOW }],
});

/** S5 Unraveling Fate: +100% Crit DMG on Ice Burst, plus a *second* Glacier stack on top of
 *  Liberation's own base 1 — Glacial Gaze's burst really does fire twice under S5, confirmed
 *  against the real game rather than smoothed down to a single hit. */
const SANHUA_S5 = new Sequence({
  name: "Sanhua S5: Unraveling Fate",
  applyStats: () => {
    if (runningAction(DETONATE_THORN) || runningAction(DETONATE_PRISM) || runningAction(DETONATE_GLACIER)) addStat(Stat.CritDmg, 100);
  },
  grants: [{ on: onAction(Liberation), buff: GLACIER_BUFF }],
});

const SANHUA_S6 = new Sequence({
  name: "Sanhua S6: Daybreak Radiance",
  updateBuffs: () => {
    if (runningAction(DETONATE_PRISM) || runningAction(DETONATE_GLACIER)) applyTeam(S6_ATK, 1);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const SANHUA_TALENTS = new Talent({
  name: "Sanhua: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.DmgBonus, 12, Attribute.Glacio]],
});

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. `Tier.Free` — see the file header. */
const SANHUA_RESONATOR = new Resonator({
  name: "Sanhua",
  talent: SANHUA_TALENTS,
  inherent1: SH_INHERENT_1,
  inherent2: SH_INHERENT_2,
  element: Attribute.Glacio,
  weapon: WeaponType.Sword,
  color: "#5fc9e8",
  intro: Intro,
  outro: Outro,
  tuneBreak: tuneBreak(92, [0, 92], [0, 70], SWORD_BREAK),
  maxEnergy: 12500,
  tier: Tier.Free,

  stats: [[Stat.BaseHp, 10062.5], [Stat.BaseAtk, 275], [Stat.BaseDef, 941.1094]],
});

// Skill/Liberation first so Condensation (opened by Intro) covers the Skill cast; basics end on
// Basic 5 so Avalanche/S1 are up for the Detonate that follows. She's never the team's lead, so
// this same rotation covers both opener and loop.

const SH_ROTATION_S5 = new Rotation([
  NOINTRO, BA23,
  INTRO, Skill.cancel(), Liberation, FHA, ECHO.instaSwap(), OUTRO,
]);
const SH_ROTATION = new Rotation([
  NOINTRO, BA234.cancel(), Skill, Liberation, FHA, ECHO.instaSwap(), OUTRO,
  INTRO, BA23, Skill.cancel(), Liberation, FHA, ECHO.instaSwap(), OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real build: resonator + talents + both Inherent Skills + every sequence node
// (Tier.Free — see file header), weapon, mainslot echo, sonata pieces, mainstat/substat
export const SANHUA = new Loadout({
  resonator: SANHUA_RESONATOR,
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS, OVERTURE],
  echoLoadouts: [new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Liberation, Substat.Heavy),
    rotation: { 0: SH_ROTATION, 5: SH_ROTATION_S5 },
  sequences: [SANHUA_S1, SANHUA_S2, SANHUA_S3, SANHUA_S4, SANHUA_S5, SANHUA_S6],
});
