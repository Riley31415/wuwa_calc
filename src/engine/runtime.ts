/**
 * The engine's ambient state — the "current" pointers every hook runs against, the per-action
 * scratch maps, the dry-run journal and the pending-cast queue. The leaf of the engine: it holds
 * what `context.ts` and `evaluate.ts` both write, and imports nothing from either.
 */
import { Stat, Attribute, Type1, Type2 } from "./stats.js";
import type { Action } from "./rotation.js";
import type { Gear } from "./gear.js";
import type { State, TeamMember, HeldBuff } from "./state.js";

/** The engine's ambient state: which team, member, gear and action a hook is running for, plus the
 *  per-action scratch every phase writes through. One object rather than a module of `let`s
 *  because `context.ts` and `evaluate.ts` both write these and an ES module cannot assign to a
 *  binding it imported — a field on a shared object it can. Never re-entered: `evaluate()` runs
 *  one action at a time, so one set is safe. */
export const ctx: {
  state: State | null;
  slot: TeamMember | null;
  buff: Gear | null;
  act: Action | null;
  /** Whether the action being evaluated is the report's own "not really this resonator's turn" kind
   *  — see `triggeredAction()`. Passed in by `run()`, which is the only thing that knows. */
  triggered: boolean;
  /** The frozen stack count of whichever Gear is mid-callback, or -1 outside any phase — see
   *  `frozenStacks()`. */
  stacks: number;
  /** The tags of the action being evaluated as one word (`tagWordOf(ctx.act)`, or the same with
   *  the override types swapped in), resolved once per action so `pushStat()` can test a scope
   *  against it with one mask. */
  tagWord: number;
  /** Set while `evaluate()` re-runs the stat phases for a main-stat variant (see
   *  `TeamMember.variants`). Grants, spends and gauge writes go ahead — a hook later in the same
   *  phase may read them live, exactly as it did in the real run — but onto copies, and
   *  `restoreFight()` puts the real fight back afterwards; the queues and `applied()` stay untouched,
   *  since nothing reads those mid-phase. */
  dryRun: boolean;
  /** Set while a `snapshotFight()` is live — from the one taken ahead of the real build's stat
   *  phases until the last variant is restored — so every in-place structure a snapshot only holds
   *  by reference (a Pool's `at`, a member's `globalHooks`) is copied before its first write, by
   *  the real build's own hooks as much as by a dry run's. Everything else a snapshot holds is
   *  copy-on-write already, or a plain number. */
  guarded: boolean;
  /** A running hash of every mutation attempted (which Gear or action, by how much) since it was
   *  last zeroed — taken over the real build's stat phases, then over each variant's dry re-run of
   *  the same, and compared: a variant that would have granted, spent or queued anything the real
   *  build didn't is one whose numbers can't stand in for a real run. */
  mutHash: number;
  /** How many stat writes the action being evaluated has made — zeroed at its start, so the
   *  constant base can be copied in rather than added when the grant phases wrote nothing. */
  wrote: number;
  /** Whether `pushStat()` is journaling its writes into `replay` and `getStat()` its reads into
   *  `reads` right now — while a varied action's stat phases run for real. */
  recording: boolean;
  /** Which phase a recorded read is charged to: `READ_APPLY`, `READ_CONVERT` or `READ_AFTER`. */
  readPhase: number;
  /** Bumped per varied action, so `reads` needs no clearing. */
  readStamp: number;
  /** Bumped whenever a Gear with `constantStats` enters or leaves any pool — which is team setup,
   *  and then essentially never — so every slot's `constBase` cache can tell it is stale. */
  constVersion: number;
  /** What a held Gear assigned for the action being evaluated (see `typeOverride()`) — the engine's
   *  own "override type1 / override type2", null when nothing did. Cleared by `evaluate()` for every
   *  action; read by `isType()`, the tag list, and the snapshot. */
  overrideType1: Type1 | null;
  overrideType2: Type2 | null;
  /** Bumped at the top of every `evaluate()`: what stamps this action's grant records (`applied`,
   *  `consumed`) as current, so neither is ever cleared. */
  actionStamp: number;
  tracing: boolean;
  insideGroup: boolean;
} = {
  state: null,
  slot: null,
  buff: null,
  act: null,
  triggered: false,
  stacks: -1,
  tagWord: 0,
  dryRun: false,
  guarded: false,
  mutHash: 0,
  wrote: 0,
  recording: false,
  readPhase: 0,
  readStamp: 0,
  constVersion: 0,
  overrideType1: null,
  overrideType2: null,
  actionStamp: 0,
  tracing: false,
  insideGroup: false,
};

export const tagWord = (element: Attribute | null, type: Type1 | null, type2: Type2 | null): number =>
  (element ?? 0) | (type ?? 0) | (type2 ?? 0);
export const tagWordOf = (action: Action): number => {
  let word = action._tagWord;
  if (word === undefined) action._tagWord = word = tagWord(action.element, action.type1, action.type2);
  return word;
};

/** What a dry run wrote in place — a Pool's `at` or a member's `globalHooks`, the Gear, and what
 *  that key held before — as flat triples, for `undoDry()` to reverse before a snapshot is put
 *  back. A journal rather than a copy because a variant writes two or three entries and the copy
 *  was the whole map, once per variant per action. */
export const dryLog: (Map<Gear, number> | Set<Gear> | Gear | number | boolean | undefined)[] = [];
export function undoDry(): void {
  if (dryLog.length === 0) return;
  for (let i = dryLog.length - 3; i >= 0; i -= 3) {
    const target = dryLog[i], gear = dryLog[i + 1] as Gear, prev = dryLog[i + 2];
    if (target instanceof Map) { if (prev === undefined) target.delete(gear); else target.set(gear, prev as number); }
    else if (prev) (target as Set<Gear>).add(gear); else (target as Set<Gear>).delete(gear);
  }
  dryLog.length = 0;
}

/** The applyStats phase's writes to `effective`, as flat (index, value) pairs — `length` is the
 *  live count, the arrays only ever grow. Replayed in order onto each variant's own starting
 *  stats, which lands bit-for-bit what re-running the phase there would have. */
export const replay = { index: [] as number[], value: [] as number[], length: 0 };
export const recordWrite = (index: number, value: number): void => {
  const n = replay.length++;
  replay.index[n] = index; replay.value[n] = value;
};

/** The stat indices read during a varied action's stat phases, by phase: a variant whose own
 *  main-stat piece moves none of the indices a phase read would have run that phase's hooks down
 *  the very same path, so their journaled writes stand for it (see `evaluate()`). */
export const READ_APPLY = 1, READ_CONVERT = 2, READ_AFTER = 4;
export const reads = { stamp: new Int32Array(64), phases: new Int32Array(64) };
export const recordRead = (index: number): void => {
  if (reads.stamp[index] !== ctx.readStamp) { reads.stamp[index] = ctx.readStamp; reads.phases[index] = ctx.readPhase; }
  else reads.phases[index] = reads.phases[index]! | ctx.readPhase;
};
/** Whether any of `indices` was read in one of `phases` during the current varied action. */
export const readAny = (indices: number[], phases: number): boolean => {
  for (let d = 0; d < indices.length; d++) {
    const i = indices[d]!;
    if (reads.stamp[i] === ctx.readStamp && (reads.phases[i]! & phases) !== 0) return true;
  }
  return false;
};

export const noteMutation = (id: number, n: number): void => { ctx.mutHash = (Math.imul(ctx.mutHash ^ id, 0x9e3779b1) + n) | 0; };
/** The stats `evaluate()` banks into the running gauges — a variant that moves any of these would
 *  bank differently, so the real build's fight isn't its fight either. */
export const RESOURCE_STATS: Stat[] = [
  Stat.AddEnergy, Stat.AddConcerto, Stat.AddOfftune, Stat.DirectOfftune, Stat.OfftuneBuildup, Stat.EnergyRegenMult,
  Stat.AddForte1, Stat.AddForte2, Stat.AddForte3, Stat.AddForte4, Stat.AddForte5,
];

/** What was granted (or spent) during the action being evaluated, by Gear and by whose doing —
 *  what `applied()`/`appliedByMe()`/`consumed()` answer from. Flat arrays indexed by `Gear.id`,
 *  each entry current only while its stamp is this action's (`ctx.actionStamp`), so nothing is
 *  cleared between actions; `by` keeps one count per member (`TeamMember.index`, the enemy last).
 *  Module-level rather than on the State so the stack methods (which have no State in hand) can
 *  record into it; `evaluate()` is never re-entered, so one shared record is safe. */
export class GrantRecord {
  private stamp = new Int32Array(2048);
  private now = new Float64Array(2048);
  private byStamp = new Int32Array(2048 * MEMBERS);
  private by = new Float64Array(2048 * MEMBERS);
  /** Every Gear recorded this action, for a reader that walks them (`consumedAny()`, the fields a
   *  cast opened). */
  private gears: Gear[] = [];
  private gearsLen = 0;
  private gearsStamp = -1;
  private grow(id: number): void {
    let n = this.stamp.length;
    while (id >= n) n *= 2;
    const copy = <T extends Int32Array | Float64Array>(a: T, size: number): T => { const b = new (a.constructor as new (n: number) => T)(size); b.set(a); return b; };
    this.stamp = copy(this.stamp, n); this.now = copy(this.now, n);
    this.byStamp = copy(this.byStamp, n * MEMBERS); this.by = copy(this.by, n * MEMBERS);
  }
  /** Record `n` of `gear`, credited to member `who` (-1 for nobody). */
  add(gear: Gear, n: number, who: number): void {
    const id = gear.id, stamp = ctx.actionStamp;
    if (id >= this.stamp.length) this.grow(id);
    if (this.gearsStamp !== stamp) { this.gearsStamp = stamp; this.gearsLen = 0; }
    if (this.stamp[id] !== stamp) { this.stamp[id] = stamp; this.now[id] = n; this.gears[this.gearsLen++] = gear; }
    else this.now[id] = this.now[id]! + n;
    if (who < 0) return;
    const k = id * MEMBERS + who;
    if (this.byStamp[k] !== stamp) { this.byStamp[k] = stamp; this.by[k] = n; }
    else this.by[k] = this.by[k]! + n;
  }
  get(gear: Gear): number {
    const id = gear.id;
    return id < this.stamp.length && this.stamp[id] === ctx.actionStamp ? this.now[id]! : 0;
  }
  getBy(gear: Gear, who: number): number {
    const k = gear.id * MEMBERS + who;
    return k < this.byStamp.length && this.byStamp[k] === ctx.actionStamp ? this.by[k]! : 0;
  }
  /** The Gear recorded this action, in order — `length` of them, the array reused. */
  list(): { gears: Gear[]; length: number } {
    return { gears: this.gears, length: this.gearsStamp === ctx.actionStamp ? this.gearsLen : 0 };
  }
}
/** Three members and the enemy — the most `TeamMember.index` can be, plus one. */
export const MEMBERS = 4;
export const applied = new GrantRecord();
export const consumed = new GrantRecord();

/** Every grant path records here, before any cap or "already held" early-out, so re-inflicting a
 *  1-stack debuff that's already on the target still reads as inflicted this action. Credited to
 *  whose *kit* granted it (`State.sourceOf`) — see `appliedByMe()` for why not whoever is on field. */
export const recordApplied = (gear: Gear, n: number): void => {
  if (n <= 0) return;
  applied.add(gear, n, ctx.state!.sourceIndexOf(gear));
};

/** Filled only by `consume()`, never by `removeStackEnemy()`/`revokeEnemy()`: a status converting
 *  into another, a window counting itself down, or a ladder paying off its own stacks is
 *  bookkeeping, not a resonator spending anything. Credited to the member whose hook called it. */
export const recordConsumed = (gear: Gear, n: number): void => {
  if (n <= 0) return;
  consumed.add(gear, n, ctx.slot!.index);
};

export const pendingQueue: { action: Action; slot: number; by: HeldBuff | null; event: boolean }[] = [];
