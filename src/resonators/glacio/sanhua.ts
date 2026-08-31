/**
 * Sanhua, ported to the new engine. `Tier.Free` — a 4-star, so all six sequence
 * nodes (SANHUA_S1-S6) are always-equipped gear pieces folded into her loadout unconditionally,
 * each owning its own trigger logic per the standing "sequence logic lives in the sequence piece"
 * rule. Her Forte Circuit (Detonate) bursts whichever Ice Creations are up — Ice Thorn (Intro),
 * Ice Prism (Skill), Glacier (Liberation, doubled by S5) — each a stackable marker buff Detonate's
 * own updateBuffs() reads and consumes.
 */
import {
  Buff, Talent, Inherent, Sequence, Resonator, Tier, Loadout, EchoLoadout, Stat, Attribute, WeaponType, Type1,
  Cast, Node, Scaling, applyCurrent, applyTeam, revokeTeam, isHeld, stacksOf, removeStack, revokeCurrent, casting,
  currentAction, addStat, frozenStacks, queue, queueOutro, } from "../../engine/kit.js";
import { lostOnSwap } from "../../shared/helpers.js";
import { Action, Rotation, INTRO, ECHO_SWAP, OUTRO, NOINTRO } from "../../engine/rotation.js";
import { EMERALD_OF_GENESIS, OVERTURE } from "../../weapons/standard.js";
import { HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC } from "../../echoes/jinzhou.js";
import { mainstatOptions, Mainstat } from "../../shared/mainstats.js";
import { chem } from "../../shared/substats.js";
import { BLAZING_BRILLIANCE } from "../../weapons/sword.js";

/* ----------------------------------------------------------------------------------- actions */

function sanhuaAction(id: string, def: object): Action {
  return new Action(id, { element: Attribute.Glacio, scaling: Scaling.Atk, ...def });
}

// Intro creates Ice Thorn; Skill creates Ice Prism; Liberation creates a Glacier stack (a second
// under S5) and arms Blade Mastery (S4) — each marker granted by the cast that makes it, for
// Detonate to spend below.
const Intro = sanhuaAction("Intro - Freezing Thorns", {
  node: Node.Intro, cast: Cast.Intro, type: Type1.Intro, mv: 139.17, energy: 10, concerto: 10, offtune: 2800,
  updateBuffs: () => applyCurrent(THORN_BUFF, 1),
});
const Outro = sanhuaAction("Outro - Silversnow", {
  cast: Cast.Outro, concerto: -100, active: false,
  updateBuffs: () => queueOutro(SANHUA_OUTRO),
});

const Skill = sanhuaAction("Skill - Eternal Frost", {
  node: Node.Skill, cast: Cast.Skill, type: Type1.Skill, mv: 359.85, offtune: 8000, energy: 10, concerto: 15,
  updateBuffs: () => applyCurrent(PRISM_BUFF, 1),
});
const Liberation = sanhuaAction("Liberation - Glacial Gaze", {
  node: Node.Liberation, cast: Cast.Liberation, type: Type1.Liberation, mv: 809.48, offtune: 61440, energy: 10, concerto: 20, resetEnergy: true,
  updateBuffs: () => applyCurrent(GLACIER_BUFF, 1),
});

const BA1 = sanhuaAction("Basic - Frigid Light 1", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 48.71, energy: 0.87, concerto: 2, offtune: 2800 });
const BA2 = sanhuaAction("Basic - Frigid Light 2", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 73.76, energy: 1.32, concerto: 4, offtune: 4240 });
const BA3 = sanhuaAction("Basic - Frigid Light 3", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.32, energy: 1.52, concerto: 8, offtune: 4960 });
const BA4 = sanhuaAction("Basic - Frigid Light 4", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 79.34, energy: 1.42, concerto: 8, offtune: 4560 });
const BA5 = sanhuaAction("Basic - Frigid Light 5", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 233.81, energy: 4.2, concerto: 10, offtune: 13440 });
const HA = sanhuaAction("Heavy - Frigid Light", { node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 111.35, energy: 2, concerto: 8, offtune: 8000 });
const MA = sanhuaAction("Basic - Frigid Light (Mid-Air)", { node: Node.Normal, cast: Cast.Basic, type: Type1.Basic, mv: 86.29, energy: 0.51, concerto: 1, offtune: 9520 });

// Ice Thorn's own burst is a real exception, not a data gap: 0 concerto (every other burst pays
// 1500), just 200 Energy — kept as given rather than smoothed over.
const FHA = sanhuaAction("Forte Heavy - Detonate", {
  node: Node.Normal, cast: Cast.Heavy, type: Type1.Heavy, mv: 372.58, offtune: 14992, energy: 4.68, concerto: 15,
  // spends whichever Ice Creations are up and queues the matching burst(s)
  updateBuffs: () => {
    if (stacksOf(THORN_BUFF)) { queue(DETONATE_THORN); removeStack(THORN_BUFF, 1); }
    if (stacksOf(PRISM_BUFF)) { queue(DETONATE_PRISM); removeStack(PRISM_BUFF, 1); }
    const glaciers = stacksOf(GLACIER_BUFF);
    for (let i = 0; i < glaciers; i++) queue(DETONATE_GLACIER);
    if (glaciers) removeStack(GLACIER_BUFF, glaciers);
  },
});
const DETONATE_THORN = sanhuaAction("Forte - Ice Burst (Thorn)", { node: Node.Normal, type: Type1.Skill, mv: 59.65, energy: 2, concerto: 0 });
const DETONATE_PRISM = sanhuaAction("Forte - Ice Burst (Prism)", { node: Node.Normal, type: Type1.Skill, mv: 79.53, energy: 7, concerto: 15 });
const DETONATE_GLACIER = sanhuaAction("Forte - Ice Burst (Glacier)", { node: Node.Normal, type: Type1.Skill, mv: 139.17, energy: 7, concerto: 15 });

/* ------------------------------------------------------------------------------------ buffs */

/** Condensation (Inherent Skill): +20% Resonance Skill DMG for 8s after Intro. */
const CONDENSATION = new Buff({
  name: "Sanhua: Condensation",
  applyStats: () => addStat(Stat.DmgBonus, 20, Type1.Skill),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(CONDENSATION); },
});
/** Condensation's own trigger — always-equipped Inherent Skill piece. */
const SH_INHERENT_1 = new Inherent({
  name: "Sanhua: Condensation",
  updateBuffs: () => { if (currentAction() === Intro) applyCurrent(CONDENSATION, 1); },
});

/** Avalanche (Inherent Skill): +20% Ice Burst DMG for 8s after Basic Attack 5. Scoped by checking
 *  the three Ice Burst actions directly — not Type2.FusionBurst, which is Fusion's own proc type. */
const AVALANCHE = new Buff({
  name: "Sanhua: Avalanche",
  applyStats: () => {
    const a = currentAction();
    if (a === DETONATE_THORN || a === DETONATE_PRISM || a === DETONATE_GLACIER) addStat(Stat.DmgBonus, 20);
  },
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(AVALANCHE); },
});
/** Avalanche's own trigger — always-equipped Inherent Skill piece. */
const SH_INHERENT_2 = new Inherent({
  name: "Sanhua: Avalanche",
  updateBuffs: () => { if (currentAction() === BA5) applyCurrent(AVALANCHE, 1); },
});

/** S1 Solitude's Embrace: Basic Attack 5 grants +15% Crit Rate, 10s. Trigger lives in SANHUA_S1. */
const S1_CRIT = new Buff({
  name: "Sanhua S1: Solitude's Embrace",
  applyStats: () => addStat(Stat.CritRate, 15),
  convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(S1_CRIT); },
});

/** S4 Blade Mastery: arms a one-shot +120% DMG Bonus for the next Detonate, consumed on landing
 *  or lost on outro if Detonate never comes. Trigger lives in SANHUA_S4. */
const S4_WINDOW = new Buff({
  name: "Sanhua S4: Blade Mastery",
  applyStats: () => { if (currentAction() === FHA) addStat(Stat.DmgBonus, 120); },
  convertStats: () => { if (currentAction() === FHA || casting(Cast.Outro)) revokeCurrent(S4_WINDOW); },
});

/** S6 Daybreak Radiance: detonating an Ice Prism/Glacier grants the *other* two members +10% ATK,
 *  excluding Sanhua herself. Lost on her own next Intro, same shape as Verina's Gift of Nature. */
const S6_ATK = new Buff({
  name: "Sanhua S6: Daybreak Radiance", maxStacks: 2,
  applyStats: () => { if (!isHeld(SANHUA_RESONATOR)) addStat(Stat.BonusAtk, 10 * frozenStacks()); },
  convertStats: () => { if (casting(Cast.Intro) && isHeld(SANHUA_RESONATOR)) revokeTeam(S6_ATK); },
});

/** Ice Creations: one stackable marker each, granted by the cast that makes it and consumed by
 *  Detonate's own updateBuffs() below, which queues the matching burst(s). No stat of their own. */
const THORN_BUFF = new Buff({
  name: "Sanhua: Ice Thorn", convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(THORN_BUFF); },
});
const PRISM_BUFF = new Buff({
  name: "Sanhua: Ice Prism", convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(PRISM_BUFF); },
});
const GLACIER_BUFF = new Buff({
  name: "Sanhua: Glacier", maxStacks: 2, convertStats: () => { if (casting(Cast.Outro)) revokeCurrent(GLACIER_BUFF); },
});

const SANHUA_OUTRO = new Buff({
  name: "Sanhua: Outro",
  applyStats: () => addStat(Stat.Amp, 38, Type1.Basic),
  updateBuffs: () => { lostOnSwap(); },
});

/* -------------------------------------------------------------------------------- sequences */
// All six live here as always-equipped gear pieces (Tier.Free — see file header); every
// trigger a sequence needs lives in its own piece, not the central Resonator updateBuffs() below.

const SANHUA_S1 = new Sequence({
  name: "Sanhua S1: Solitude's Embrace",
  updateBuffs: () => { if (currentAction() === BA5) applyCurrent(S1_CRIT, 1); },
});

// S2 Snowy Clarity: STA-cost/interruption-resistance only — a do-nothing piece, held for the name
const SANHUA_S2 = new Sequence({ name: "Sanhua S2: Snowy Clarity" });

// S3 Anomalous Vision: flat DMG Bonus, no separate trigger needed
const SANHUA_S3 = new Sequence({
  name: "Sanhua S3: Anomalous Vision", applyStats: () => addStat(Stat.DmgBonus, 24.5),
});

const SANHUA_S4 = new Sequence({
  name: "Sanhua S4: Blade Mastery",
  updateBuffs: () => { if (currentAction() === Liberation) applyCurrent(S4_WINDOW, 1); },
});

/** S5 Unraveling Fate: +100% Crit DMG on Ice Burst, plus a *second* Glacier stack on top of
 *  Liberation's own base 1 — Glacial Gaze's burst really does fire twice under S5, confirmed
 *  against the real game rather than smoothed down to a single hit. */
const SANHUA_S5 = new Sequence({
  name: "Sanhua S5: Unraveling Fate",
  applyStats: () => {
    const a = currentAction();
    if (a === DETONATE_THORN || a === DETONATE_PRISM || a === DETONATE_GLACIER) addStat(Stat.CritDmg, 100);
  },
  updateBuffs: () => { if (currentAction() === Liberation) applyCurrent(GLACIER_BUFF, 1); },
});

const SANHUA_S6 = new Sequence({
  name: "Sanhua S6: Daybreak Radiance",
  updateBuffs: () => {
    if (currentAction() === DETONATE_PRISM || currentAction() === DETONATE_GLACIER) applyTeam(S6_ATK, 1);
  },
});

/** Her, as a Resonator: name/element/weapon, every grant/spend/queue rule her kit needs, and her
 *  own base stat line. `Tier.Free` — see the file header. */
const SANHUA_RESONATOR = new Resonator({
  name: "Sanhua",
  element: Attribute.Glacio,
  weapon: WeaponType.Sword,
  intro: () => Intro,
  outro: () => Outro,
  color: "#5fc9e8",
  maxEnergy: 125,
  tier: Tier.Free,

  constantStats: () => {
    addStat(Stat.BaseHp, 10063); addStat(Stat.BaseAtk, 275); addStat(Stat.BaseDef, 941);
  },
});

// stat-tree bonus alone, its own piece of gear so it's independently identifiable from her kit
const SANHUA_TALENTS = new Talent({
  name: "Sanhua: Talents",
  constantStats: () => { addStat(Stat.BonusAtk, 12); addStat(Stat.DmgBonus, 12, Attribute.Glacio); },
});

// Skill/Liberation first so Condensation (opened by Intro) covers the Skill cast; basics end on
// Basic 5 so Avalanche/S1 are up for the Detonate that follows. She's never the team's lead, so
// this same rotation covers both opener and loop.

const SH_ROTATION = new Rotation([
  NOINTRO, FHA,
  INTRO, Skill, Liberation, FHA, ECHO_SWAP, OUTRO,
]);

/* ----------------------------------------------------------------------------------- loadout */

// her real build: resonator + talents + both Inherent Skills + every sequence node
// (Tier.Free — see file header), weapon, mainslot echo, sonata pieces, mainstat/substat
export const SANHUA = new Loadout({
  resonator: SANHUA_RESONATOR,
  talent: SANHUA_TALENTS,
  inherent1: SH_INHERENT_1,
  inherent2: SH_INHERENT_2,
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS, OVERTURE],
  echoLoadouts: [new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC, MOONLIT_CLOUDS_2PC)],
  mainstats: mainstatOptions(Mainstat.CR4, Mainstat.CD4, Mainstat.ATK3, Mainstat.Glacio3, Mainstat.ATK1),
  substat: chem("atk", "skill"),
    rotation: SH_ROTATION,
  sequences: [SANHUA_S1, SANHUA_S2, SANHUA_S3, SANHUA_S4, SANHUA_S5, SANHUA_S6],
});
