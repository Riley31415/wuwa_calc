/** What the page reads of shared/tunebreak.ts, substats.ts and mainstats.ts. */
import { Stat } from "../engine/stats.js";
import type { StatKey } from "../engine/stats.js";
import { ENEMY, BASE_RESISTANCE_GEAR, breakdownOf } from "./gear.js";
import type { Buff, Gear, Resonator } from "./gear.js";

/** The Tune Break enemy, the bucket the break's damage reports under. */
export const TUNE_BREAK_ENEMY: Resonator = ENEMY;
export const BASE_RESISTANCE: Gear = BASE_RESISTANCE_GEAR;
/** The bar's own ceiling, x10000 like every `offtune` an action declares. */
export const ENEMY_MAX_OFFTUNE = 392_000;

/** ER points a build may come up short by (substats.ts). */
export const ER_TOLERANCE = 0.0;
/** The stats a spread's hover leaves lit where they rolled once: a Liberation's ER line. */
export const litStats = (maxEnergy: number): StatKey[] => (maxEnergy ? [Stat.Er] : []);
/** A spread's rolls, one buff apiece. */
export const substatRollBuffs = (piece: Buff): Buff[] => breakdownOf(piece);
/** A main-stat build's echoes, one buff apiece. */
export const mainstatSlotBuffs = (piece: Buff): Buff[] => breakdownOf(piece);
