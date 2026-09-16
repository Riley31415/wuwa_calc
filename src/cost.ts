/**
 * What a build costs to *own*, for the ranking view — a single number per member, summed over a
 * team, so teams can be ranked against what they ask of an account rather than against damage
 * alone. Only two things are ever paid for: a limited resonator (their copy and each chain node)
 * and a limited signature weapon (each refinement). Everything permanently available — a 4-star,
 * a Rover, a standard 5-star, and any of their weapons — is free, and so is refinement on a
 * standard or 4-star weapon and the chain of a standard 5-star, neither of which is costed yet.
 *
 * Nothing here reads the solver or the page: it takes the pieces a build already names (its
 * resonator, its chain level, the weapon instance at the rank it runs) and adds them up.
 */
import { Tier } from "./engine/stats.js";
import type { Loadout, Resonator, Weapon } from "./engine/gear.js";

/** The whole price list, in "one limited character" units. Provisional — every number here is a
 *  knob the ranking is expected to be re-tuned on. */
export const COST = {
  /** A limited 5-star's own copy, at S0. */
  limited: 1,
  /** Each resonance-chain node S1-S6 a limited resonator holds: 7 for the full S6 build. A
   *  standard 5-star's chain is not costed yet, and a 4-star's or a Rover's comes free with them. */
  sequence: 1,
  /** Each refinement of a limited signature weapon — R1 pays one of these, R5 five, so 3.3333 for
   *  a maxed signature. Standard and 4-star refinement is not costed yet. */
  refine: 2 / 3,
};

/** Limited resonators handed out for free: the copy costs nothing, the chain is still bought a
 *  node at a time like anyone else's. By name, since the tier they carry is the real one. */
const FREE_COPY = new Set(["Rebecca"]);

/** What owning `r` with `sequence` chain nodes held costs. */
export function resonatorCost(r: Resonator, sequence: number): number {
  if (r.tier !== Tier.Limited) return 0;
  return (FREE_COPY.has(r.name) ? 0 : COST.limited) + sequence * COST.sequence;
}

/** What owning `w` costs — a signature at the rank this instance is, nothing for anything else. */
export const weaponCost = (w: Weapon): number =>
  w.tier === Tier.Limited ? w.refinement * COST.refine : 0;

/** One member's whole build: their resonator at the level it runs, plus the weapon it wears. */
export const buildCost = (l: Loadout, weapon: Weapon, sequence: number): number =>
  resonatorCost(l.resonator, sequence) + weaponCost(weapon);

/** A team's cost — every member's build added up. */
export const teamCost = (builds: { loadout: Loadout; weapon: Weapon; sequence: number }[]): number =>
  builds.reduce((total, b) => total + buildCost(b.loadout, b.weapon, b.sequence), 0);
