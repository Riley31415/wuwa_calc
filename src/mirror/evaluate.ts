/**
 * What a run hands the page: evaluate.ts's Result and ResolvedSnapshot, and the report lines they
 * fold into — the same shapes, filled from the WebAssembly engine's reply.
 */
import type { Stat, EnemyStat, Type, ActionTag } from "../engine/stats.js";
import type { Action, ActionField } from "./rotation.js";
import type { StatEntry, HeldBuff } from "./state.js";

/** One `addToCast()` call, for the hover panels: who added what — energy, concerto, forte 1-5. */
export interface CastAdd { source: string; owner: string | null; gains: number[] }

export interface Result {
  action: Action;
  member: string;
  slot: string;
  triggered: boolean;
  source: HeldBuff | null;
  queued: boolean;
  variantAvg: number[] | null;
  mv: number;
  avg: number;
  hitAt?: number;
  swapFrames?: number;
  starts: number;
  castGain: number[] | null;
  ends: number;
}

export interface Snapshot {
  action: Action;
  member: string;
  stat(key: Stat | EnemyStat): number;
  stats: number[];
  atk: number; hp: number; def: number;
  amp: number; dmgBonus: number;
  subtypeAmp: number;
  subtypeCritRate: number; subtypeCritDmg: number;
  subtypeTotalDmg: number; subtypeDamageTaken: number;
  enemyRes: number; enemyDef: number;
}

export interface ResolvedSnapshot extends Result, Snapshot {
  entries: StatEntry[];
  castAdds: CastAdd[];
  type: Type | null;
  forte: [number, number, number, number, number];
  forteBefore: [number, number, number, number, number];
  maxForte: [number, number, number, number, number];
  energy: number;
  concerto: number;
  offtune: number;
  energyBefore: number;
  concertoBefore: number;
  offtuneBefore: number;
  concertoShort: boolean;
  forteShort: [boolean, boolean, boolean, boolean, boolean];
  energyWiped: boolean;
  realEnergyBefore: number;
  frame: number;
  frames: number;
  tag: ActionTag;
  active: boolean;
  timestopBanked: number;
  heldLocal: HeldBuff[];
  heldGlobal: HeldBuff[];
  heldEnemy: HeldBuff[];
  opensFields: ActionField[];
}

/** One rendered line in the report: a single press, a group's members, or a folded run. */
export interface ChainGroup<S extends Result = ResolvedSnapshot> {
  id: string;
  isChain: boolean;
  parts: { snap: S; dmg: { avg: number } }[];
  snap: S;
  mv: number;
  avg: number;
  members?: S[];
  spill?: boolean;
  aggregate?: boolean;
  fieldKey?: string;
}
