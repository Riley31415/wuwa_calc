/**
 * Danjin, ported to the new engine — a havoc sword 4-star sub-DPS, standard/permanent-banner
 * character (`Tier.Free`), so her full S1-S6 resonance chain is folded into her
 * loadout unconditionally, each its own always-equipped gear piece (`DJ_S1`-`DJ_S6`).
 *
 * Ruby Blossom (forte1, 0-120): banked by Resonance Skill casts. At 60+, a held Basic Attack
 * becomes Heavy Attack: Chaoscleave (spends 60, or a stronger "Full Energy" version at 120
 * spending that instead), which chains into Scatterbloom. Resonance Skill itself has three forms
 * depending on the preceding action: Carmine Gleam (plain press), Crimson Erosion (after Basic
 * Attack 2, Dodge Counter, or Intro — applies Incinerating Will on its second hit), and Sanguine
 * Pulse (after Basic Attack 3) — all placed directly below, same "fixed valid line, no live
 * queue" treatment as Sigrika's Runes/Buling's Trigram.
 *
 * Crimson Light (Inherent Skill): granted fresh on Dodge Counter: Ruby Shades, survives into the
 * very next action only if that's Crimson Erosion 1 — +20% (unscoped) DMG Bonus there, and
 * doubles that same action's own Ruby Blossom gain. Overflow (+30% Heavy Attack DMG Bonus, 5s):
 * permanent-uptime-once-granted per the standing short-window rule
 * action gains stats, not a one-shot next-hit consumption. Crimson Fragment's own HP cost and
 * Chaoscleave's own healing have no stat/damage impact — not modelled.
 *
 * Numbers from nanoka.cc (character 1602) — MV/duration/sequence text confirmed there directly
 * (no wuwalab.com entry, no migrated-sheet row). Energy/Concerto/Offtune come off nanoka's own
 * "Damage Data" table — see the comment above the action definitions for the column mapping.
 * Resonance Cost (`maxEnergy` below) is her own real 100%, not the generic 125% default.
 */
import { Tier, Stat, Attribute, WeaponType, Type, Cast, Node, Scaling } from "../../engine/stats.js";
import { Buff, Debuff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyCurrent,
  applyTeam,
  applyEnemy,
  revokeCurrent,
  revokeTeam,
  isHeld,
  stacksOfEnemy,
  casting,
  onAction,
  runningAction,
  addStat,
  queueOutro,
  forte1,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, START_3, INTRO } from "../../engine/rotation.js";
import { tuneBreak, SWORD_BREAK } from "../../shared/tunebreak.js";
import { HEALS } from "../../shared/status.js";
import { EMERALD_OF_GENESIS } from "../../weapons/standard.js";
import { BLAZING_BRILLIANCE, EMERALD_SENTENCE } from "../../weapons/sword.js";
import { NM_HERON, MIDNIGHT_VEIL_5PC } from "../../echoes/rinascita.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";
import { CROWNLESS, HAVOC_ECLIPSE_5PC, HERON, MOONLIT_CLOUDS_5PC, REJUV_5PC } from "../../echoes/jinzhou.js";
import { FALLACY } from "../../echoes/jinzhou.js";

/* ----------------------------------------------------------------------------------- actions */

function danjinAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Havoc, scaling: Scaling.Atk, ...def });
}

// energy/concerto/offtune all come off nanoka's own "Damage Data" table — Energy column ->
// energy, Elemental DMG column -> concerto, Weakness Break DMG column x10000 -> offtune, same
// convention Rover Havoc's own file established. A flat listed "Concerto Regen" adds on top of
// whatever the table's own Elemental DMG column already gives.
// --- basics, mid-air, dodge counter (Execution)
const BA1 = danjinAction("Basic - Execution 1", { animFrames: 16, commitFrames: 9, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 9, mv: 57.26, energy: 0.9, concerto: 1.08, offtune: 1680 }]});
const BA2 = danjinAction("Basic - Execution 2", { animFrames: 25, commitFrames: 10, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 10, mv: 58.85, energy: 0.92, concerto: 1.11, offtune: 2960 }]});
const BA3 = danjinAction("Basic - Execution 3", { animFrames: 28, commitFrames: 12, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 12, mv: 79.53, energy: 1.25, concerto: 1.5, offtune: 3120 }]});

const MA = danjinAction("Mid-air - Execution Plunge", { animFrames: 62, commitFrames: 36, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, hits: [{ at: 36, mv: 98.61, energy: 0.51, concerto: 1, offtune: 9600 }]});
const HA = danjinAction("Heavy - Execution", { animFrames: 40, commitFrames: 16, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 9, mv: 37.12, energy: 0.58, concerto: 0.7, offtune: 1786 },
    { at: 13, mv: 37.12, energy: 0.58, concerto: 0.7, offtune: 1786 },
    { at: 17, mv: 37.12, energy: 0.58, concerto: 0.7, offtune: 1786 },
  ]}); // 37.12% x3
/** A successful Dodge Counter opens the Skill's own Crimson Erosion form, and grants Crimson Light. */
const DC = danjinAction("Dodge Counter - Ruby Shades", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, mv: 190.86, energy: 3, concerto: 11.8, offtune: 4800 }); // 63.62% x3

// three forms depending on the preceding action (see file header)
const CarmineGleam = danjinAction("Skill - Carmine Gleam", { animFrames: 29, commitFrames: 21, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [{ at: 12, mv: 38.18, energy: 0.6, offtune: 1480 }, { at: 21, mv: 38.18, energy: 0.6, offtune: 1480 }], castForte1: 10.5, castConcerto: 8}); // 38.18% x2
const CrimsonErosion1 = danjinAction("Skill - Crimson Erosion 1", { animFrames: 37, commitFrames: 18, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [{ at: 10, mv: 64.42, energy: 1.25, offtune: 2120 }, { at: 18, mv: 64.42, energy: 1.25, offtune: 2120 }], castForte1: 10.5, castConcerto: 8}); // 64.42% x2
const CrimsonErosion2 = danjinAction("Skill - Crimson Erosion 2", {
  animFrames: 46, commitFrames: 20,
  node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 11, mv: 59.65, energy: 1.25, offtune: 2000, updateDebuffs: () => applyEnemy(INCINERATING_WILL, 1) },
    { at: 20, mv: 59.65, energy: 1.25, offtune: 2000 },
  ], castForte1: 10.5, castConcerto: 8,
});

// NOTE 40.5 forte for sanguine pulse 123, not sure on individual
const SanguinePulse1 = danjinAction("Skill - Sanguine Pulse 1", { animFrames: 33, commitFrames: 20, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [{ at: 8, mv: 56.07, energy: 1.5, offtune: 1880 }, { at: 20, mv: 56.07, energy: 1.5, offtune: 1880 }], castForte1: 13.5, castConcerto: 8}); // 56.07% x2
const SanguinePulse2 = danjinAction("Skill - Sanguine Pulse 2", { animFrames: 37, commitFrames: 24, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 4, mv: 42.95, energy: 1, offtune: 1410 },
    { at: 8, mv: 42.95, energy: 1, offtune: 1410 },
    { at: 24, mv: 42.95, energy: 1, offtune: 1410 },
  ], castForte1: 13.5, castConcerto: 8}); // 42.95% x3
const SanguinePulse3 = danjinAction("Skill - Sanguine Pulse 3", { animFrames: 59, commitFrames: 36, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, hits: [
    { at: 6, mv: 64.42, energy: 1.25, offtune: 2120 },
    { at: 16, mv: 64.42, energy: 1.25, offtune: 2120 },
    { at: 36, mv: 64.42, energy: 1.25, offtune: 2120 },
  ], castForte1: 13.5, castConcerto: 8}); // 64.42% x3

// Chaoscleave (Heavy Attack DMG, at 60+ Ruby Blossom) into Scatterbloom
// updateDebuffs on both Chaoscleaves is her own healing marker, read by every healing sonata and
// weapon (statuses.ts) — applied to the healer alone, never the team
const Chaoscleave = danjinAction("Forte Heavy - Chaoscleave", {
  animFrames: 72, commitFrames: 61,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 9, mv: 59.65, energy: 2, offtune: 1654,
      updateDebuffs: () => applyCurrent(HEALS, 1) },
    { at: 17, mv: 59.65, energy: 2, offtune: 1654 },
    { at: 24, mv: 59.65, energy: 2, offtune: 1654 },
    { at: 31, mv: 59.65, energy: 2, offtune: 1654 },
    { at: 39, mv: 59.65, energy: 2, offtune: 1654 },
    { at: 46, mv: 59.65, energy: 2, offtune: 1654 },
    { at: 62, mv: 59.65, energy: 2, offtune: 1654 },
  ], castForte1: -60, castConcerto: 50,
});
const Scatterbloom = danjinAction("Forte Heavy - Scatterbloom", { animFrames: 49, commitFrames: 19, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, mv: 178.93, energy: 6, offtune: 5360 });
/** Full Energy variants, at 120 Ruby Blossom — spends 120 instead of 60. No separate Concerto
 *  Regen is given, so it carries Chaoscleave's own. */
const FullChaoscleave = danjinAction("Forte Heavy - Chaoscleave (Full Energy)", {
  animFrames: 72, commitFrames: 61,
  node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, hits: [
    { at: 9, mv: 143.15, energy: 2, offtune: 1654,
      updateDebuffs: () => applyCurrent(HEALS, 1) },
    { at: 17, mv: 143.15, energy: 2, offtune: 1654 },
    { at: 24, mv: 143.15, energy: 2, offtune: 1654 },
    { at: 31, mv: 143.15, energy: 2, offtune: 1654 },
    { at: 39, mv: 143.15, energy: 2, offtune: 1654 },
    { at: 46, mv: 143.15, energy: 2, offtune: 1654 },
    { at: 62, mv: 143.15, energy: 2, offtune: 1654 },
  ], castForte1: -120, castConcerto: 50,
});
const FullScatterbloom = danjinAction("Heavy - Scatterbloom (Full Energy)", { animFrames: 49, commitFrames: 19, node: Node.Forte, cast: Cast.Heavy, type: Type.Heavy, hits: [{ at: 19, mv: 429.43, energy: 6, offtune: 5360 }]});

// consecutive attacks plus one Scarlet Burst, lumped into one hit
const Liberation = danjinAction("Liberation - Crimson Bloom", { animFrames: 192, commitFrames: 192, timestop: 195, motionStop: 180, cooldown: 60 * 16, node: Node.Liberation, cast: Cast.Liberation, type: Type.Liberation, hits: [
    { at: 74, mv: 49.09, offtune: 3840 },
    { at: 80, mv: 49.09, offtune: 3840 },
    { at: 91, mv: 49.09, offtune: 3840 },
    { at: 95, mv: 49.09, offtune: 3840 },
    { at: 102, mv: 49.09, offtune: 3840 },
    { at: 106, mv: 49.09, offtune: 3840 },
    { at: 120, mv: 49.09, offtune: 3840 },
    { at: 128, mv: 49.09, offtune: 3840 },
    { at: 169, mv: 392.65, offtune: 30720 },
  ], castConcerto: 20, resetEnergy: true }); // 49.09%x8+392.65%

const Intro = danjinAction("Intro - Vindication", { animFrames: 103, commitFrames: 99, motionStop: 48, node: Node.Intro, cast: Cast.Intro, type: Type.Intro, hits: [
    { at: 54, mv: 49.71, energy: 1.25, offtune: 3060 },
    { at: 64, mv: 49.71, energy: 1.25, offtune: 3060 },
    { at: 73, mv: 49.71, energy: 1.25, offtune: 3060 },
    { at: 81, mv: 49.71, energy: 1.25, offtune: 3060 },
  ], castEnergy: 5, castConcerto: 10}); // 49.71% x4
const Outro = danjinAction("Outro - Duality", {
  animFrames: 0, commitFrames: 0,
  cast: Cast.Outro, castConcerto: -100,
  updateBuffs: () => queueOutro(DANJIN_OUTRO),
});

/* ------------------------------------------------------------------------------------ buffs */

/** A genuine debuff on the enemy — applied by Crimson Erosion's own second hit, +20% (unscoped)
 *  DMG Bonus to whoever's actually landing the hit. 12s. */
const INCINERATING_WILL = new Debuff({
  name: "Danjin: Incinerating Will", duration: 60 * 12,
  applyStats: () => { if (isHeld(DANJIN_RESONATOR)) addStat(Stat.DmgBonus, 20); },
});

/** Overflow (Inherent Skill): +30% Heavy Attack DMG Bonus, 5s, once granted after Sanguine Pulse —
 *  a real time window, not consumed by the next hit alone. */
const OVERFLOW = new Buff({
  name: "Inherent: Overflow",
  duration: 60 * 5,
  stats: [[Stat.DmgBonus, 30, Type.Heavy]],
});
const DJ_INHERENT_OVERFLOW = new Inherent({
  name: "Inherent: Overflow",
  grants: [{ on: onAction(SanguinePulse3), buff: OVERFLOW }],
});

/** Crimson Light (Inherent Skill): granted the instant Dodge Counter lands. Survives into
 *  whatever comes right after: if that's Crimson Erosion 1, it pays out (+20% unscoped DMG
 *  Bonus, doubles that action's own Ruby Blossom gain via AddForte1); on anything else it
 *  revokes itself in updateBuffs() before applyStats() runs that action. */
const CRIMSON_LIGHT = new Buff({
  name: "Inherent: Crimson Light",
  applyStats: () => {
    if (runningAction(CrimsonErosion1)) { addStat(Stat.DmgBonus, 20); addStat(Stat.AddForte1, CrimsonErosion1.forte1); }
  },
  updateBuffs: () => { if (!runningAction(CrimsonErosion1)) revokeCurrent(CRIMSON_LIGHT); },
});
const DJ_INHERENT_CRIMSON_LIGHT = new Inherent({
  name: "Inherent: Crimson Light",
  grants: [{ on: onAction(DC), buff: CRIMSON_LIGHT }],
});

/** The window her outro hands the incoming resonator — "or until they are switched out" is
 *  lost-on-swap wording, so it ends on the swap-out action rather than at the outro. */
const DANJIN_OUTRO = new Buff({
  name: "Danjin: Outro",
  duration: 60 * 14,
  stats: [[Stat.Amp, 23, Attribute.Havoc]],
  lostOnSwap: true,
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const DANJIN_TALENTS = new Talent({
  name: "Danjin: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.DmgBonus, 12, Attribute.Havoc]],
});

const DANJIN_RESONATOR = new Resonator({
  name: "Danjin",
  talent: DANJIN_TALENTS,
  inherent1: DJ_INHERENT_OVERFLOW,
  inherent2: DJ_INHERENT_CRIMSON_LIGHT,
  element: Attribute.Havoc,
  weapon: WeaponType.Sword,
  color: "#a83250",
  intro: Intro,
  tuneBreak: tuneBreak(91, 91, 70, SWORD_BREAK),
  maxEnergy: 100,
  maxForte1: 120,
  tier: Tier.Free,

  stats: [[Stat.BaseHp, 9437.5], [Stat.BaseAtk, 262.5], [Stat.BaseDef, 1148.8868]],
});

/* -------------------------------------------------------------------------------- sequences */
// all six live here as their own always-equipped gear pieces (Tier.Free — see file
// header); every trigger a sequence needs lives in its own piece, not the central updateBuffs() above

/** +5% ATK a stack, up to 6, 6s, on any hit landed while Incinerating Will is up. "Loses 1 stack
 *  each time she takes damage" isn't modelled — no damage-taken tracking here. */
const DJ_S1_STACKS = new Buff({
  name: "Danjin S1: Crimson Heart of Justice", maxStacks: 6, duration: 60 * 6,
  stats: [[Stat.BonusAtk, 5]], perStack: true,
});
const DJ_S1 = new Sequence({
  name: "Danjin S1: Crimson Heart of Justice",
  // on the hit, behind the Incinerating Will Crimson Erosion 2's own hit lays
  updateDebuffs: () => {
    if (stacksOfEnemy(INCINERATING_WILL) > 0) applyCurrent(DJ_S1_STACKS, 1);
  },
});

/** S2: +20% (unscoped) DMG Bonus on any hit landed while Incinerating Will is up. */
const DJ_S2 = new Sequence({
  name: "Danjin S2: Dusted Mirror",
  applyStats: () => { if (stacksOfEnemy(INCINERATING_WILL)) addStat(Stat.DmgBonus, 20); },
});

/** S3: flat +30% Resonance Liberation DMG Bonus. */
const DJ_S3 = new Sequence({
  name: "Danjin S3: Fleeting Blossom",
  stats: [[Stat.DmgBonus, 30, Type.Liberation]],
});

/** S4: +15% Crit Rate above 60 Ruby Blossom, stated to persist through Chaoscleave/Scatterbloom
 *  even as Chaoscleave itself spends the gauge below 60 — granted whenever forte1 > 60, only
 *  revoked once it's below 60 AND the current action isn't Chaoscleave/Scatterbloom (either form). */
const DJ_S4_ACTIVE = new Buff({
  name: "Danjin S4: Solitary Carnation",
  stats: [[Stat.CritRate, 15]],
});
const DJ_S4 = new Sequence({
  name: "Danjin S4: Solitary Carnation",
  updateBuffs: () => {
    if (forte1() > 60) applyCurrent(DJ_S4_ACTIVE, 1);
    else if (!runningAction(Chaoscleave) && !runningAction(FullChaoscleave) && !runningAction(Scatterbloom) && !runningAction(FullScatterbloom)) revokeCurrent(DJ_S4_ACTIVE);
  },
});

/** S5: +15% Havoc DMG Bonus flat, +15% more below 60% HP — no HP tracking, so the low-HP half is
 *  assumed always true. */
const DJ_S5 = new Sequence({
  name: "Danjin S5: Reigning Blade",
  stats: [[Stat.DmgBonus, 30, Attribute.Havoc]],
});

/** S6: Chaoscleave grants the whole team +20% ATK, 20s — lost on her own next Intro. */
const DJ_S6_TEAM = new Buff({
  name: "Danjin S6: Bloodied Jade",
  duration: 60 * 20,
  stats: [[Stat.BonusAtk, 20]],
  convertStats: () => { if (casting(Cast.Intro) && isHeld(DANJIN_RESONATOR)) revokeTeam(DJ_S6_TEAM); },
});
const DJ_S6 = new Sequence({
  name: "Danjin S6: Bloodied Jade",
  updateBuffs: () => { if (runningAction(Chaoscleave) || runningAction(FullChaoscleave)) applyTeam(DJ_S6_TEAM, 1); },
});

// a kit-valid line: Intro is a listed Crimson Erosion trigger, so the Skill press right after
// opens Incinerating Will; Liberation early banks Fleeting Blossom's own scoped bonus; Carmine
// Gleam into Execution 2/3 into Sanguine Pulse is the other listed Skill form; plain
// Chaoscleave/Scatterbloom close the forte circuit. Plain Chaoscleave (60), not Full Energy
// (120), on purpose: this line only banks 72 Ruby Blossom a pass, so Full Energy was never
// really reachable — forcing it would've compounded a shortfall loop over loop, permanently
// killing S4's threshold after the first pass. She's never the team's own lead, so this covers
// both opener and loop.

const BA23 = new ActionGroup("Basic - Execution 23", [BA2, BA3]);
const Crimson12 = new ActionGroup("Skill - Crimson Erosion 12", [CrimsonErosion1, CrimsonErosion2])
const Sanguine123 = new ActionGroup("Skill - Sanguine Pulse 123", [SanguinePulse1, SanguinePulse2, SanguinePulse3])
const Forte12 = new ActionGroup("Forte Heavy - Chaoscleave + Scatterbloom", [Chaoscleave, Scatterbloom])

const DJ_ROTATION = new Rotation([
  INTRO, Crimson12.cancel(),
  Liberation,
  CarmineGleam, BA23,
  Sanguine123,
  Forte12,
  ECHO.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real build: resonator + talents + both Inherent Skills + every sequence node
// (Tier.Free — see file header), weapon, mainslot echo, sonata pieces, mainstat/substat
export const DANJIN = new Loadout({
  resonator: DANJIN_RESONATOR,
  weapons: [EMERALD_SENTENCE, EMERALD_OF_GENESIS, BLAZING_BRILLIANCE],
  echoLoadouts: [new EchoLoadout(NM_HERON, MIDNIGHT_VEIL_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(CROWNLESS, HAVOC_ECLIPSE_5PC),
  ],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Havoc3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Liberation),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Liberation),
    rotation: DJ_ROTATION,
  sequences: [DJ_S1, DJ_S2, DJ_S3, DJ_S4, DJ_S5, DJ_S6],
});
