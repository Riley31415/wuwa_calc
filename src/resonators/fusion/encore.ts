/**
 * Encore, ported to the new engine — a standard 5-star (`Tier.Standard`), so her build
 * is costed at S2, with S3-S6 opening rows of their own once that role's Sequences box is. A
 * fusion rectifier main DPS. Mayhem (forte1, 0-100) builds off nearly every hit; a Heavy Attack at 100 spends it all for Cloudy Frenzy (Threshold state) or
 * Cosmos Rupture (during her own Liberation, Cosmos Rave — her whole kit swaps to Cosmos' own
 * forms: Frolicking/Heavy Attack/Rampage/Dodge Counter, all "considered" the same damage type
 * their Threshold-state counterparts are).
 *
 * Angry Cosmos (Inherent Skill, +10% DMG Dealt above 70% HP during Cosmos Rave) is applied
 * unconditionally — no HP-loss tracking here, same assumed-always-true treatment Shorekeeper's
 * healing-gated text gets.
 *
 * Sequences 1-6, each its own always-equipped gear, all six in the default loadout:
 *  S1 a landed Basic Attack grants +3% Fusion DMG Bonus, up to 4 frozenStacks, 6s.
 *  S2 +10 Energy on Wooly Strike/Energetic Welcome, ICD not modelled.
 *  S3 +40% DMG Multiplier on Cloudy Frenzy/Cosmos Rupture.
 *  S4 Cosmos Rupture grants the whole team +20% Fusion DMG Bonus for 30s.
 *  S5 flat +35% Resonance Skill DMG Bonus.
 *  S6 a hit landed while Woolies Cheer Dance is held grants a stack of Lost Lamb (up to 5), each
 *     +5% ATK for 10s.
 *
 * Numbers from the old-engine reference file's own rows (cross-checked against nanoka.cc,
 * character 1203, for every named hit — all agree exactly); energy/concerto carried ×100
 * relative to this file's own scale. Her mainslot echo is Inferno Rider (plain, not
 * "Nightmare:") — see echoes/jinzhou.ts's own INFERNO_RIDER.
 */
import { Tier, Stat, Attribute, WeaponType, Type, Cast, Node, Scaling, BuffTarget } from "../../engine/stats.js";
import { Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout } from "../../engine/gear.js";
import {
  applyCurrent,
  revokeCurrent,
  isHeld,
  onAction,
  runningAction,
  addStat,
  onCast,
} from "../../engine/context.js";
import { ActionGroup, Action, Rotation, ECHO, INTRO } from "../../engine/rotation.js";
import { LETHEAN_ELEGY, RIME_DRAPED_SPROUTS, STRINGMASTER, WHISPERS_OF_SIRENS } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { INFERNO_RIDER, MOLTEN_RIFT_5PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { substats, highSubs, Substat } from "../../shared/substats.js";

/* ----------------------------------------------------------------------------------- actions */

function encoreAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// energy/concerto come off the old reference file's own numbers (÷100 — see file header); offtune
// carries over unscaled, same as everywhere else in this project.
// --- basics, mid-air, dodge counter, heavy (Wooly Attack)
const BA1 = encoreAction("Basic - Wooly Attack 1", { animFrames: 18, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 10, mv: 5566, energy: 70, concerto: 140, offtune: 3360, forte1: 3 }]});
const BA2 = encoreAction("Basic - Wooly Attack 2", { animFrames: 22, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 11, mv: 6620, energy: 83, concerto: 166, offtune: 3996, forte1: 5 }]});
const BA3 = encoreAction("Basic - Wooly Attack 3", { animFrames: 45, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 29, commitFrame: 5, mv: 6630, energy: 83, concerto: 166, offtune: 4002, forte1: 3 },
    { hitFrame: 34, commitFrame: 5, mv: 6630, energy: 83, concerto: 166, offtune: 4002, forte1: 3 },
  ]});
const BA4 = encoreAction("Basic - Wooly Attack 4", { animFrames: 46, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 13, mv: 3827, energy: 48, concerto: 96, offtune: 2310, forte1: 1 },
    { hitFrame: 25, mv: 3827, energy: 48, concerto: 96, offtune: 2310, forte1: 1 },
    { hitFrame: 37, mv: 3827, energy: 48, concerto: 96, offtune: 2310, forte1: 1 },
    { hitFrame: 49, mv: 3827, energy: 48, concerto: 96, offtune: 2310, forte1: 1 },
  ]});
const WoolyStrike = encoreAction("Basic - Wooly Strike", { animFrames: 76, node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 34, commitFrame: 0, mv: 23857, energy: 300, concerto: 600, offtune: 14400, forte1: 25 }]});
const HA = encoreAction("Heavy - Wooly Attack", { animFrames: 56, node: Node.Normal, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 24, mv: 18708, energy: 235, concerto: 470, offtune: 11292, forte1: 5 }]});
const MA = encoreAction("Mid-air - Wooly Attack Plunge", { node: Node.Normal, cast: Cast.Basic, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 12326, energy: 51, concerto: 100, offtune: 14400, forte1: 11 }] });
const DC = encoreAction("Dodge Counter - Wooly Attack", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 25188, energy: 316, concerto: 1332, offtune: 8004, forte1: 6 }] });

// Flaming Woolies, then Energetic Welcome (press again shortly after)
const Skill1 = encoreAction("Skill - Flaming Woolies", { animFrames: 110, cooldown: 60 * 10, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 30, mv: 7661, energy: 191, offtune: 3200, forte1: 4 },
    { hitFrame: 42, mv: 7661, energy: 191, offtune: 3200, forte1: 4 },
    { hitFrame: 52, mv: 7661, energy: 191, offtune: 3200, forte1: 4 },
    { hitFrame: 63, mv: 7661, energy: 191, offtune: 3200, forte1: 4 },
    { hitFrame: 72, mv: 7661, energy: 191, offtune: 3200, forte1: 4 },
    { hitFrame: 83, mv: 7661, energy: 191, offtune: 3200, forte1: 4 },
    { hitFrame: 95, mv: 7661, energy: 191, offtune: 3200, forte1: 4 },
    { hitFrame: 105, mv: 7661, energy: 191, offtune: 3200, forte1: 4 },
  ], castConcerto: 1500});
const Skill2 = encoreAction("Skill - Energetic Welcome", { animFrames: 48, node: Node.Skill, cast: Cast.Skill, type: Type.Skill, bullets: [{ hitFrame: 14, mv: 33916, energy: 75, concerto: 151, offtune: 9072, forte1: 30 }], castConcerto: 500});

// Cloudy Frenzy (Threshold), spends the full Mayhem gauge
// Cloudy Frenzy/Cosmos Rupture each spend the whole Mayhem gauge — both fire only at 100, so the
// declared cap as a negative delta lands exactly on 0 (maxForte1: 100 below), same as Electro
// Rover's own Overshock.
const SPEND_MAYHEM = { minForte1: 100, castForte1: -100 };
const CloudyFrenzy = encoreAction("Forte Heavy - Cloudy Frenzy", { animFrames: 202, node: Node.Forte, cast: Cast.Heavy, type: Type.Liberation, bullets: [{ hitFrame: 171, commitFrame: 138, mv: 33400, energy: 1000, offtune: 40320 }], castConcerto: 1000, ...SPEND_MAYHEM });

/** No damage of its own, just opens the state. */
const Liberation = encoreAction("Liberation - Cosmos Rave", { animFrames: 140, prioFrames: 140, timestop: [0, 140], motionStop: [0, 137], cooldown: 60 * 16, node: Node.Liberation, cast: Cast.Liberation, castConcerto: 2000, resetEnergy: true });

// Cosmos Rave's own moveset: Frolicking (Basic), Cosmos Heavy Attack, Cosmos - Rampage (Skill),
// Cosmos Dodge Counter, Cosmos Rupture (Forte) — all "considered" their Threshold-state damage type
const UBA1 = encoreAction("Basic - Cosmos: Frolicking 1", { animFrames: 29, node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 5, mv: 9018, energy: 66, concerto: 133, offtune: 3198, forte1: 4 },
    { hitFrame: 22, mv: 9018, energy: 66, concerto: 133, offtune: 3198, forte1: 4 },
  ]});
const UBA2 = encoreAction("Basic - Cosmos: Frolicking 2", { animFrames: 43, node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 11, mv: 5640, energy: 41, concerto: 83, offtune: 2000, forte1: 4 },
    { hitFrame: 23, mv: 5640, energy: 41, concerto: 83, offtune: 2000, forte1: 4 },
    { hitFrame: 37, mv: 5640, energy: 41, concerto: 83, offtune: 2000, forte1: 4 },
  ]});
const UBA3 = encoreAction("Basic - Cosmos: Frolicking 3", { animFrames: 47, node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 14, mv: 6599, energy: 48, concerto: 97, offtune: 2340, forte1: 4 },
    { hitFrame: 24, mv: 6599, energy: 48, concerto: 97, offtune: 2340, forte1: 4 },
    { hitFrame: 34, mv: 6599, energy: 48, concerto: 97, offtune: 2340, forte1: 4 },
    { hitFrame: 43, mv: 6599, energy: 48, concerto: 97, offtune: 2340, forte1: 4 },
  ]});
const UBA4 = encoreAction("Basic - Cosmos: Frolicking 4", { animFrames: 110, node: Node.Liberation, cast: Cast.Basic, type: Type.Basic, bullets: [
    { hitFrame: 10, mv: 19401, energy: 143, concerto: 286, offtune: 6880, forte1: 9 },
    { hitFrame: 50, commitFrame: 26, mv: 19401, energy: 143, concerto: 286, offtune: 6880, forte1: 9 },
    { hitFrame: 98, commitFrame: 26, mv: 19401, energy: 143, concerto: 286, offtune: 6880, forte1: 9 },
  ]});

const CosmosHeavy = encoreAction("Heavy - Cosmos: Heavy Attack", { node: Node.Liberation, cast: Cast.Heavy, type: Type.Heavy, bullets: [{ hitFrame: 0, mv: 21758, energy: 160, concerto: 321, offtune: 7716, forte1: 9 }] });
const USkill = encoreAction("Skill - Cosmos: Rampage", { animFrames: 47, cooldown: 60 * 4, node: Node.Liberation, cast: Cast.Skill, type: Type.Skill, bullets: [
    { hitFrame: 35, mv: 6332, energy: 164, concerto: 200, offtune: 1542, forte1: 7 },
    { hitFrame: 35, mv: 6332, energy: 164, concerto: 200, offtune: 1542, forte1: 7 },
    { hitFrame: 35, mv: 6332, energy: 164, concerto: 200, offtune: 1542, forte1: 7 },
    { hitFrame: 35, mv: 6332, energy: 164, concerto: 200, offtune: 1542, forte1: 7 },
  ], castConcerto: 1000});
const CosmosDodgeCounter = encoreAction("Dodge Counter - Cosmos", { node: Node.Liberation, cast: Cast.DodgeCounter, type: Type.Basic, bullets: [{ hitFrame: 0, mv: 26396, energy: 192, concerto: 1388, offtune: 9360, forte1: 16 }] });
const FHA = encoreAction("Forte Heavy - Cosmos Rupture", { animFrames: 239, prioFrames: 239, node: Node.Forte, cast: Cast.Heavy, type: Type.Liberation, bullets: [
    { hitFrame: 42, mv: 4642, offtune: 2803 },
    { hitFrame: 72, commitFrame: 42, mv: 4642, offtune: 2803 },
    { hitFrame: 102, commitFrame: 42, mv: 4642, offtune: 2803 },
    { hitFrame: 132, commitFrame: 42, mv: 4642, offtune: 2803 },
    { hitFrame: 162, commitFrame: 42, mv: 4642, offtune: 2803 },
    { hitFrame: 192, commitFrame: 42, mv: 4642, offtune: 2803 },
    { hitFrame: 203, mv: 49521, offtune: 29891 },
  ], castConcerto: 1000, ...SPEND_MAYHEM, castForte1: -100 });

const Intro = encoreAction("Intro - Woolies Helpers", { animFrames: 80, noSwapFrames: 75, prioFrames: 92, motionStop: [0, 56], node: Node.Intro, cast: Cast.Intro, type: Type.Intro, bullets: [{ hitFrame: 60, mv: 19881, energy: 1000, offtune: 15132, forte1: 40 }], castConcerto: 1000});
/** A burn zone, 4 ticks over 6s, lumped into one action same as every other periodic effect
 *  elsewhere. No handoff buff is described on her own kit page — left as a plain hit. */
const Outro = encoreAction("Outro - Thermal Field", { animFrames: 0, cast: Cast.Outro, type: Type.Outro, bullets: [{ hitFrame: 0, mv: 17676 }, { hitFrame: 90, mv: 17676 }, { hitFrame: 180, mv: 17676 }, { hitFrame: 270, mv: 17676 }], minConcerto: 10000, castConcerto: -10000});

/* ------------------------------------------------------------------------------------ buffs */

/** +10% Fusion DMG Bonus for 10s on casting Flaming Woolies or Cosmos - Rampage. */
const WOOLIES_CHEER_DANCE = new Buff({
  name: "Inherent: Woolies Cheer Dance",
  duration: 60 * 10,
  stats: [[Stat.DmgBonus, 10, Attribute.Fusion]],
});
const EN_INHERENT_2 = new Inherent({
  name: "Inherent: Woolies Cheer Dance",
  updateBuffs: () => { if (runningAction(Skill1) || runningAction(USkill)) applyCurrent(WOOLIES_CHEER_DANCE, 1); },
});

/** Assumed always true — see file header. Granted/revoked alongside Cosmos Rave itself, so
 *  applyStats() doesn't need to check any particular action. */
const ANGRY_COSMOS = new Buff({
  name: "Inherent: Angry Cosmos", duration: 60 * 10,
  stats: [[Stat.DmgBonus, 10]],
  afterAction: () => { if (runningAction(FHA)) revokeCurrent(ANGRY_COSMOS); },
});
const EN_INHERENT_1 = new Inherent({
  name: "Inherent: Angry Cosmos",
  grants: [{ on: onAction(Liberation), buff: ANGRY_COSMOS }],
});

/* ------------------------------------------------------------------------------- sequences */

const S1_STACKS = new Buff({
  name: "Encore S1: Wooly's Fairy Tale", maxStacks: 4, duration: 60 * 6,
  stats: [[Stat.DmgBonus, 3, Attribute.Fusion]], perStack: true,
});
const S1 = new Sequence({
  name: "Encore S1",
  grants: [{ on: onCast(Cast.Basic), buff: S1_STACKS, onHit: true }],
});

// 10s ICD isn't modelled, so it pays every cast instead of once per window
const S2 = new Sequence({
  name: "Encore S2", // note removed ba5 trigger to model 10s cooldown
  applyStats: () => { if (runningAction(Skill2)) addStat(Stat.AddEnergy, 1000); },
});

const S3 = new Sequence({
  name: "Encore S3",
  applyStats: () => { if (runningAction(CloudyFrenzy) || runningAction(FHA)) addStat(Stat.MulMv, 40); },
});

/** Permanent uptime once granted, per the standing duration rule (30s). */
const S4_TEAM = new Buff({
  name: "Encore S4: Adventure? Let's go!",
  duration: 60 * 30,
  stats: [[Stat.DmgBonus, 20, Attribute.Fusion]],
});
const S4 = new Sequence({
  name: "Encore S4",
  grants: [{ on: onAction(FHA), buff: S4_TEAM, to: BuffTarget.Team }],
});

const S5 = new Sequence({
  name: "Encore S5",
  stats: [[Stat.DmgBonus, 35, Type.Skill]],
});

const S6_LOST_LAMB = new Buff({
  name: "Encore S6: Lost Lamb", maxStacks: 5, duration: 60 * 10,
  stats: [[Stat.BonusAtk, 5]], perStack: true,
});
const S6 = new Sequence({
  name: "Encore S6",
  grants: [{ on: () => isHeld(WOOLIES_CHEER_DANCE), buff: S6_LOST_LAMB, onHit: true }],
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const ENCORE_TALENTS = new Talent({
  name: "Encore: Talents",
  stats: [[Stat.BonusAtk, 12], [Stat.DmgBonus, 12, Attribute.Fusion]],
});

const ENCORE_RESONATOR = new Resonator({
  name: "Encore",
  talent: ENCORE_TALENTS,
  inherent1: EN_INHERENT_1,
  inherent2: EN_INHERENT_2,
  tier: Tier.Standard,
  element: Attribute.Fusion,
  weapon: WeaponType.Rectifier,
  color: "#e56b9a",
  intro: Intro,
  maxEnergy: 12500,
  maxForte1: 100,

  stats: [[Stat.BaseHp, 10512.5], [Stat.BaseAtk, 425], [Stat.BaseDef, 1246.6644]],
});

// a kit-valid line: Intro tops Mayhem partway, Basic 1234 into Wooly Strike, Heavy Attack at 100
// Mayhem releases Cloudy Frenzy, Liberation opens Cosmos Rave, its own Frolicking combo into
// Cosmos Rampage, Cosmos Rupture spends the fresh Mayhem it banked. She's never the team's own
// lead, so this covers both opener and loop.

const UBA1234 = new ActionGroup("Basic - Cosmos: Frolicking 1234", [UBA1, UBA2, UBA3, UBA4]);

const EN_ROTATION = new Rotation([
  INTRO, ECHO,  // would be swapped
  Skill1, // would be swapped
  Liberation,
  USkill,
  UBA1234.cancel(),
  USkill,
  UBA1234.cancel(),
  USkill.cancel(),
  FHA.instaSwap(), Outro,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat, all six sequences (by explicit instruction — see file header)
export const ENCORE = new Loadout({
  resonator: ENCORE_RESONATOR,
  weapons: [STRINGMASTER, COSMIC_RIPPLES, NEW_STD_RECTIFIER, LETHEAN_ELEGY, WHISPERS_OF_SIRENS, RIME_DRAPED_SPROUTS],
  echoLoadouts: [new EchoLoadout(INFERNO_RIDER, MOLTEN_RIFT_5PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: substats(Substat.CritDmg, Substat.CritRate, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Skill),
  highSubstat: highSubs(Substat.CritRate, Substat.CritDmg, Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Skill),
    rotation: EN_ROTATION,
  sequences: [S1, S2, S3, S4, S5, S6],
});
