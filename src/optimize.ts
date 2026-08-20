/**
 * Weapon-choice optimizer: for a given team, tries every candidate weapon a resonator's own
 * weapon type can equip — their own current pick (usually a signature) plus the standard
 * options of the same type — and keeps whichever wins. Uses the same numbers-only fast path
 * the comparison table itself wants: `state.run()` + `damage()`, no `buildReport()` — so trying
 * a handful of candidates per member costs about the same as running the team once (see
 * `sumTeamLoop`).
 *
 * One pass per member, holding the other two at their own already-declared loadout — not full
 * coordinate ascent. A weapon choice almost always only changes its own wearer's own stats, so
 * this is exact for every kit here except the handful whose weapon also pays a team-wide buff
 * (Wildfire Mark, Freeze Frame, Stellar Symphony); those still get a correct answer for their
 * own slot, just not one re-checked for a knock-on team effect on a second pass. Good enough for
 * "which weapon does this one character use", the question this answers for now.
 */
import { State, Enemy, Loadout } from "./state.js";
import type { ResonatorFactory, Resonator, ResolvedSnapshot, RotationEntry } from "./state.js";
import { collapseChains } from "./kit.js";
import type { ChainGroup, Gear } from "./kit.js";
import { damage } from "./damage.js";
import { ELEMENTS } from "./stats.js";
import { AUTO_TUNE_BREAK, attributeMisc } from "./shared/tunebreak.js";

import {
  VARIATION, MARCATO, CADENZA, OVERTURE, DISCORD,
  STATIC_MIST, EMERALD_OF_GENESIS, COSMIC_RIPPLES, ABYSS_SURGES, LUSTROUS_RAZOR,
  NEW_STD_BRAUDBLADE, NEW_STD_GAUNTLET, NEW_STD_SWORD, NEW_STD_RECTIFIER, NEW_STD_PISTOL,
} from "./weapons/standard.js";
import { STRINGMASTER } from "./weapons/rectifier.js";

// level 100 enemy, a flat 20% base resistance, 39.2% max off-tune — same standing numbers
// index.ts's own runTeam() uses; duplicated rather than imported, matching team.ts/run.ts's
// own precedent (index.ts is the browser entry, not something engine code should import from).
const ENEMY_LEVEL = 100, DEFAULT_RES = 20, MAX_OFFTUNE = 392000;

/* ------------------------------------------------------------- weapon-type catalogue */

export type WeaponType = "sword" | "broadblade" | "pistol" | "gauntlet" | "rectifier";

/** Every implemented resonator's own weapon type — not modelled anywhere in the engine itself
 *  (a `Gear` carries no notion of "type", see kit.js), so it's pure metadata for this file's
 *  own candidate selection, keyed by the exact name each carries in index.ts's own TEAMS. */
export const RESONATOR_WEAPON_TYPE: Record<string, WeaponType> = {
  // sword
  Changli: "sword", Camellya: "sword", Brant: "sword", Qiuyuan: "sword", Sanhua: "sword",
  "Rover: Havoc": "sword", Danjin: "sword",
  // broadblade
  Augusta: "broadblade", Lupa: "broadblade", Jingran: "broadblade",
  // pistols
  Carlotta: "pistol", Galbrena: "pistol",
  // gauntlets
  Roccia: "gauntlet", Sigrika: "gauntlet", Iuno: "gauntlet", Jianxin: "gauntlet",
  // rectifier
  Zhezhi: "rectifier", Cantarella: "rectifier", Phrolova: "rectifier", Lucilla: "rectifier",
  Shorekeeper: "rectifier", Encore: "rectifier", Verina: "rectifier", Buling: "rectifier",
};

/** The standard/f2p options for each weapon type — Ceaseless Aria, Stormy Resolution, and the
 *  "new standard" tier (see weapons/standard.ts); Stringmaster (weapons/rectifier.ts) is also
 *  standard-availability despite living alongside Encore's own gear there. */
export const STANDARD_WEAPONS: Record<WeaponType, Gear[]> = {
  sword: [OVERTURE, EMERALD_OF_GENESIS, NEW_STD_SWORD],
  broadblade: [DISCORD, LUSTROUS_RAZOR, NEW_STD_BRAUDBLADE],
  pistol: [CADENZA, STATIC_MIST, NEW_STD_PISTOL],
  gauntlet: [MARCATO, ABYSS_SURGES, NEW_STD_GAUNTLET],
  rectifier: [VARIATION, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER],
};

/** A resonator factory that equips `weapon` instead of whatever `factory` itself declares,
 *  every other piece (mainslot, sonata, 2pc, mainstat, substat) unchanged. Doesn't touch the
 *  resonator file itself — `Resonator.loadout` is a plain mutable field, so this just builds
 *  one the normal way and swaps it before anything reads it. */
export function withWeapon(factory: ResonatorFactory, weapon: Gear): ResonatorFactory {
  return () => {
    const resonator = factory();
    const l = resonator.loadout;
    resonator.loadout = new Loadout(weapon, l.mainslot, l.sonata, l.pc2, l.mainstat, l.substat);
    return resonator;
  };
}

/* --------------------------------------------------------------- the numbers-only fast path */

/** The subset of index.ts's own `Member` this file needs — structurally compatible, so index.ts
 *  can hand its real `Member[]` in directly without either side importing the other's type. */
export interface FastMember {
  name: string;
  loadout: ResonatorFactory;
  loop: RotationEntry[];
}

export interface FastResult {
  total: number;
  bySlot: Map<string, number>;
  lines: ChainGroup[];
  resonators: Map<string, Resonator>;
}

/** Run just the loop — no opener, no buildReport() — and sum `damage().avg` straight off the
 *  resolved snapshots. This is the whole of what a weapon comparison (or the comparison table
 *  itself) needs: a number per member and a grand total, not a rendered table. */
export function sumTeamLoop(members: FastMember[]): FastResult {
  const enemy = new Enemy({
    level: ENEMY_LEVEL,
    baseRes: Object.fromEntries(ELEMENTS.map((e) => [e, DEFAULT_RES])),
    maxOfftune: MAX_OFFTUNE,
  });
  const state = new State({ team: members.map((m) => m.name), enemy, buffs: [AUTO_TUNE_BREAK] });
  state.startFight(Object.fromEntries(members.map((m) => [m.name, m.loadout])));

  const lines: ChainGroup[] = [];
  for (const m of members) {
    if (!m.loop.length) continue;
    const rows = state.run(m.loop).map((s) => ({ snap: attributeMisc(s), dmg: damage(s) }));
    lines.push(...collapseChains(rows));
  }

  const bySlot = new Map<string, number>();
  let total = 0;
  for (const line of lines) {
    const slot = (line.snap as ResolvedSnapshot).slot;
    bySlot.set(slot, (bySlot.get(slot) ?? 0) + line.avg);
    total += line.avg;
  }

  const resonators = new Map<string, Resonator>();
  for (const slot of state.slots) if (slot.resonator) resonators.set(slot.name, slot.resonator);

  return { total, bySlot, lines, resonators };
}

/* ---------------------------------------------------------------------- the weapon sweep */

export interface WeaponChange { name: string; weapon: string; }

/** Try every weapon candidate for `members[index]`, holding the rest of the team at their own
 *  declared loadout, and return that one member with whichever won swapped in. `weapon` names
 *  the winner ("current" if nothing beat the member's own starting pick) for `changed` to key
 *  off — this is also what lets the caller verify a signature is actually winning. */
function optimizeSlot<M extends FastMember>(members: M[], index: number): { member: M; weapon: string; changed: boolean } {
  const target = members[index]!;
  const type = RESONATOR_WEAPON_TYPE[target.name];
  const candidates: Array<{ weapon: string; loadout: ResonatorFactory }> = [
    { weapon: "current", loadout: target.loadout },
    ...(type ? STANDARD_WEAPONS[type] : []).map((w) => ({ weapon: w.name, loadout: withWeapon(target.loadout, w) })),
  ];

  let best = candidates[0]!;
  let bestTotal = -Infinity;
  for (const candidate of candidates) {
    const trial = members.map((m, i) => (i === index ? { ...m, loadout: candidate.loadout } : m));
    const { total } = sumTeamLoop(trial);
    if (total > bestTotal) { bestTotal = total; best = candidate; }
  }
  return { member: { ...target, loadout: best.loadout }, weapon: best.weapon, changed: best !== candidates[0] };
}

export interface OptimizedTeam<M extends FastMember> extends FastResult {
  members: M[];
  /** Every member whose own best weapon wasn't their starting pick — empty when every slot's
   *  own default (usually a signature) already wins, which is the expected outcome. */
  changes: WeaponChange[];
}

/** Optimize every slot's own weapon, one at a time, then run the resulting team once more for
 *  the numbers the comparison table actually shows. */
export function optimizeTeam<M extends FastMember>(members: M[]): OptimizedTeam<M> {
  const optimized = members.slice();
  const changes: WeaponChange[] = [];
  for (let i = 0; i < optimized.length; i++) {
    const result = optimizeSlot(optimized, i);
    optimized[i] = result.member;
    if (result.changed) changes.push({ name: result.member.name, weapon: result.weapon });
  }
  return { members: optimized, changes, ...sumTeamLoop(optimized) };
}
