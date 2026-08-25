/**
 * Encore, ported to the new engine — sequence-6 standard 5* character
 * explicit instruction (see [[project_no_resonance_chains]]'s own Encore exception — every other
 * resonator here is sequence-0 only). A fusion rectifier main DPS. Mayhem (forte1, 0-100) builds
 * off nearly every hit; a Heavy Attack at 100 spends it all for Cloudy Frenzy (Threshold state) or
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
import {
  Buff, Talent, Inherent, Sequence, Resonator, Loadout, EchoLoadout, Action, ECHO_CAST, INTRO, Stat, Attribute, WeaponType, Type1, Cast, Node, Scaling,
  applySelf, applyTeam, revoke, isHeld, casting, currentAction, addStat, frozenStacks, queueOutro,
  forte1, setForte1,
} from "../../kit.js";
import { STRINGMASTER } from "../../weapons/rectifier.js";
import { NEW_STD_RECTIFIER, COSMIC_RIPPLES } from "../../weapons/standard.js";
import { INFERNO_RIDER, MOLTEN_RIFT_5PC, MOLTEN_RIFT_2PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../mainstats.js";
import { chem } from "../../substats.js";

/* ----------------------------------------------------------------------------------- actions */

function encoreAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Fusion, scaling: Scaling.Atk, ...def });
}

// energy/concerto come off the old reference file's own numbers (÷100 — see file header); offtune
// carries over unscaled, same as everywhere else in this project.
// --- basics, mid-air, dodge counter, heavy (Wooly Attack)
const BA1 = encoreAction("Basic - Wooly Attack 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 55.66, energy: 0.70, concerto: 1.40, offtune: 3360, forte1: 3 });
const BA2 = encoreAction("Basic - Wooly Attack 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 66.20, energy: 0.83, concerto: 1.66, offtune: 3996, forte1: 5 });
const BA3 = encoreAction("Basic - Wooly Attack 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 132.60, energy: 1.66, concerto: 3.32, offtune: 8004, forte1: 6 });
const BA4 = encoreAction("Basic - Wooly Attack 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 153.08, energy: 1.92, concerto: 3.84, offtune: 9240, forte1: 4 });
const WoolyStrike = encoreAction("Basic - Wooly Strike", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 238.57, energy: 3.00, concerto: 6.00, offtune: 14400, forte1: 25 });
const HA = encoreAction("Heavy - Wooly Attack", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 187.08, energy: 2.35, concerto: 4.70, offtune: 11292, forte1: 5 });
const MA = encoreAction("Basic - Wooly Attack (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 123.26, energy: 0.51, concerto: 1.00, offtune: 14400, forte1: 11 });
const DC = encoreAction("Basic - Wooly Attack (Dodge Counter)", { node: Node.Normal, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 251.88, energy: 3.16, concerto: 13.32, offtune: 8004, forte1: 6 });

// Flaming Woolies, then Energetic Welcome (press again shortly after)
const Skill1 = encoreAction("Skill - Flaming Woolies", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 612.88, energy: 15.28, concerto: 15.00, offtune: 25600, forte1: 32 });
const Skill2 = encoreAction("Skill - Energetic Welcome", { node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 339.16, energy: 0.75, concerto: 6.51, offtune: 9072, forte1: 30 });

// Cloudy Frenzy (Threshold), spends the full Mayhem gauge
const CloudyFrenzy = encoreAction("Heavy - Cloudy Frenzy", { node: Node.Forte, active: false, cast: Cast.Heavy, type: Type1.Liberation, mv: 773.73, concerto: 10.00, offtune: 46709, forte1: -100 });

/** No damage of its own, just opens the state. */
const Liberation = encoreAction("Liberation - Cosmos Rave", { node: Node.Liberation, cast: Cast.Liberation, concerto: 20, resetEnergy: true });

// Cosmos Rave's own moveset: Frolicking (Basic), Cosmos Heavy Attack, Cosmos - Rampage (Skill),
// Cosmos Dodge Counter, Cosmos Rupture (Forte) — all "considered" their Threshold-state damage type
const UBA1 = encoreAction("Basic - Cosmos: Frolicking 1", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 180.36, energy: 1.32, concerto: 2.66, offtune: 6396, forte1: 8 });
const UBA2 = encoreAction("Basic - Cosmos: Frolicking 2", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 169.20, energy: 1.23, concerto: 2.49, offtune: 6000, forte1: 12 });
const UBA3 = encoreAction("Basic - Cosmos: Frolicking 3", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 263.96, energy: 1.92, concerto: 3.88, offtune: 9360, forte1: 16 });
const UBA4 = encoreAction("Basic - Cosmos: Frolicking 4", { node: Node.Liberation, cast: Cast.Basic, type: Type1.Basic, mv: 582.03, energy: 4.29, concerto: 8.58, offtune: 20640, forte1: 27 });

const CosmosHeavy = encoreAction("Heavy - Cosmos: Heavy Attack", { node: Node.Liberation, cast: Cast.Heavy, type: Type1.Heavy, mv: 217.58, energy: 1.60, concerto: 3.21, offtune: 7716, forte1: 9 });
const USkill = encoreAction("Skill - Cosmos: Rampage", { node: Node.Liberation, cast: Cast.Skill, type: Type1.Skill, mv: 253.28, energy: 6.56, concerto: 8.00, offtune: 6168, forte1: 28 });
const CosmosDodgeCounter = encoreAction("Basic - Cosmos: Dodge Counter", { node: Node.Liberation, cast: Cast.DodgeCounter, type: Type1.Basic, mv: 263.96, energy: 1.92, concerto: 13.88, offtune: 9360, forte1: 16 });
const FHA = encoreAction("Forte Heavy - Cosmos Rupture", { node: Node.Forte, cast: Cast.Heavy, type: Type1.Liberation, mv: 773.73, concerto: 10.00, offtune: 46709, forte1: -100, active: false });

const Intro = encoreAction("Intro - Woolies Helpers", { node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 198.81, energy: 10.00, concerto: 10.00, offtune: 15132, forte1: 40 });
/** A burn zone, 4 ticks over 6s, lumped into one action same as every other periodic effect
 *  elsewhere. No handoff buff is described on her own kit page — left as a plain hit. */
const Outro = encoreAction("Outro - Thermal Field", { cast: Cast.Outro, type: Type1.Outro, mv: 707.04, active: false });

/* ------------------------------------------------------------------------------------ buffs */

/** +10% Fusion DMG Bonus for 10s on casting Flaming Woolies or Cosmos - Rampage. */
const WOOLIES_CHEER_DANCE = new Buff({
  name: "Encore: Woolies Cheer Dance",
  applyStats: () => addStat(Stat.DmgBonus, 10, Attribute.Fusion),
  convertStats: () => { if (casting(Cast.Outro)) revoke(WOOLIES_CHEER_DANCE); },
});
const EN_INHERENT_2 = new Inherent({
  name: "Encore: Woolies Cheer Dance",
  updateBuffs: () => { const a = currentAction(); if (a === Skill1 || a === USkill) applySelf(WOOLIES_CHEER_DANCE, 1); },
});

/** Assumed always true — see file header. Granted/revoked alongside Cosmos Rave itself, so
 *  applyStats() doesn't need to check any particular action. */
const ANGRY_COSMOS = new Buff({
  name: "Encore: Angry Cosmos",
  applyStats: () => addStat(Stat.DmgBonus, 10),
  convertStats: () => { if (currentAction() === FHA) revoke(ANGRY_COSMOS); },
});
const EN_INHERENT_1 = new Inherent({
  name: "Encore: Angry Cosmos",
  updateBuffs: () => { if (currentAction() === Liberation) applySelf(ANGRY_COSMOS, 1); },
});

/* ------------------------------------------------------------------------------- sequences */

const S1_STACKS = new Buff({
  name: "Encore S1: Wooly's Fairy Tale", maxStacks: 4,
  applyStats: () => addStat(Stat.DmgBonus, 3 * frozenStacks(), Attribute.Fusion),
  convertStats: () => { if (casting(Cast.Outro)) revoke(S1_STACKS); },
});
const S1 = new Sequence({
  name: "Encore S1",
  updateBuffs: () => { if (casting(Cast.Basic)) applySelf(S1_STACKS, 1); },
});

// 10s ICD isn't modelled, so it pays every cast instead of once per window
const S2 = new Sequence({
  name: "Encore S2", // note removed ba5 trigger to model 10s cooldown
  updateBuffs: () => { if (currentAction() === Skill2) addStat(Stat.AddEnergy, 10); },
});

const S3 = new Sequence({
  name: "Encore S3",
  applyStats: () => { if (currentAction() === CloudyFrenzy || currentAction() === FHA) addStat(Stat.MulMv, 40); },
});

/** Permanent uptime once granted, per the standing duration rule (30s). */
const S4_TEAM = new Buff({
  name: "Encore S4: Adventure? Let's go!",
  applyStats: () => addStat(Stat.DmgBonus, 20, Attribute.Fusion),
});
const S4 = new Sequence({
  name: "Encore S4",
  updateBuffs: () => { if (currentAction() === FHA) applyTeam(S4_TEAM, 1); },
});

const S5 = new Sequence({
  name: "Encore S5",
  applyStats: () => addStat(Stat.DmgBonus, 35, Type1.Skill),
});

const S6_LOST_LAMB = new Buff({
  name: "Encore S6: Lost Lamb", maxStacks: 5,
  applyStats: () => addStat(Stat.BonusAtk, 5 * frozenStacks()),
  convertStats: () => { if (casting(Cast.Outro)) revoke(S6_LOST_LAMB); },
});
const S6 = new Sequence({
  name: "Encore S6",
  updateBuffs: () => { if (isHeld(WOOLIES_CHEER_DANCE)) applySelf(S6_LOST_LAMB, 1); },
});

const ENCORE = new Resonator({
  name: "Encore",
  standardCharacter: true,
  abbreviation: "Encore",
  element: Attribute.Fusion,
  weapon: WeaponType.Rectifier,
  intro: () => Intro,
  color: "#e56b9a",
  maxEnergy: 125,

  // Cloudy Frenzy/Cosmos Rupture each spend the whole Mayhem gauge — pre-clamp an overshoot back
  // to exactly 100 so the declared forte1: -100 field lands exactly on 0, same pattern as
  // Galbrena's own Purging Flame/Ascent of Malice.
  updateBuffs: () => {
    const a = currentAction();
    if ((a === CloudyFrenzy || a === FHA) && forte1() >= 100) setForte1(100);
  },

  applyStats: () => {
    addStat(Stat.BaseHp, 10512.5); addStat(Stat.BaseAtk, 425); addStat(Stat.BaseDef, 1247);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const ENCORE_TALENTS = new Talent({
  name: "Encore: Talents",
  applyStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Attribute.Fusion); },
});

// a kit-valid line: Intro tops Mayhem partway, Basic 1234 into Wooly Strike, Heavy Attack at 100
// Mayhem releases Cloudy Frenzy, Liberation opens Cosmos Rave, its own Frolicking combo into
// Cosmos Rampage, Cosmos Rupture spends the fresh Mayhem it banked. She's never the team's own
// lead, so this covers both opener and loop.
const EN_ROTATION = [
  INTRO,
  ECHO_CAST,  // would be swapped
  Skill1, Skill2, // would be swapped
  Liberation,
  USkill,
  UBA1, UBA2, UBA3, UBA4,
  USkill,
  UBA1, UBA2, UBA3, UBA4,
  USkill,
  FHA,
  Outro,
];

/* ----------------------------------------------------------------------------------- loadout */

// her real 43311 build: resonator + talents + both Inherent Skills, weapon, mainslot echo,
// sonata pieces, mainstat/substat, all six sequences (by explicit instruction — see file header)
export const ENCORE_LOADOUT = new Loadout({
  resonator: ENCORE,
  talent: ENCORE_TALENTS,
  inherent1: EN_INHERENT_1,
  inherent2: EN_INHERENT_2,
  weapons: [STRINGMASTER, NEW_STD_RECTIFIER, COSMIC_RIPPLES],
  echoLoadouts: [new EchoLoadout(INFERNO_RIDER, MOLTEN_RIFT_5PC, MOLTEN_RIFT_2PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Fusion3, Mainstat.ATK1),
  substat: chem("atk", "basic"),
  opener: EN_ROTATION,
  loop: EN_ROTATION,
  sequences: [S1, S2, S3, S4, S5, S6],
});
