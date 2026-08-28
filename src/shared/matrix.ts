/**
 * Matrices — one optional piece per kit, worn only in Matrix Mode (the comparison table's own
 * box; see kit.ts's `Loadout.matrix`). Matrix Mode itself already hands every resonator a flat
 * +20% total DMG, so a Matrix's own "deal 25% more total DMG" is worth (1.20 + 0.25) / 1.20 over
 * that baseline, not a full 1.25x — which is `pct / 1.2` as an additive Total Damage stat: 20.83%
 * for a 25% Matrix, 16.67% for a 20% one. Teams without a single Matrix are left exactly as they
 * were, since the baseline cancels out of every comparison.
 */
import { Matrix, addStat } from "../engine/kit.js";
import type { GearDef } from "../engine/kit.js";
import { Stat } from "../engine/stats.js";

/** `<resonator>: Matrix` — `totalDmg` is the listed "deal N% more total DMG", rebased onto Matrix
 *  Mode's own +20%. Anything else the Matrix does (a Liberation-triggered team buff) goes in `def`. */
export const matrix = (resonator: string, totalDmg: number, def: Omit<GearDef, "name" | "constantStats"> = {}): Matrix =>
  new Matrix({ name: `${resonator}: Matrix`, constantStats: () => addStat(Stat.TotalDmg, totalDmg / 1.2), ...def });
