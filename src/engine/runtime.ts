/**
 * The engine's ambient state — the "current" pointers every hook runs against, the per-action
 * scratch maps, the dry-run journal and the pending-cast queue. The leaf of the engine: it holds
 * what `context.ts` and `evaluate.ts` both write, and imports nothing from either.
 */
import { Stat, Attribute, Type1, Type2, tagBand, TYPE2_BITS } from "./stats.js";
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
  /** Bumped whenever a Gear with `constantStats` enters or leaves any pool — which is team setup,
   *  and then essentially never — so every slot's `constBase` cache can tell it is stale. */
  constVersion: number;
  /** What a held Gear assigned for the action being evaluated (see `typeOverride()`) — the engine's
   *  own "override type1 / override type2", null when nothing did. Cleared by `evaluate()` for every
   *  action; read by `isType()`, the tag list, and the snapshot. */
  overrideType1: Type1 | null;
  overrideType2: Type2 | null;
  /** Everything applied during the action being evaluated, and how many stacks of it — see
   *  `applied()`. Module-level rather than on the State so the stack methods (which have no State
   *  in hand) can record into it; `evaluate()` is never re-entered, so one shared map is safe. */
  appliedNow: Map<Gear, number>;
  /** The same, split by whose kit is responsible for each stack — what `appliedByMe()` reads.
   *
   *  Kept per source rather than as a single "who did it last", because two kits genuinely do
   *  inflict the same status on one action: Chisa's Thread of Bane hands out Havoc Bane off whoever
   *  is hitting the marked target, on top of whatever that resonator's own cast just inflicted, and
   *  Lucilla's Film Roll adds two Glacio Chafe to anyone else's one. Enemy-pool gear runs last in
   *  `updateDebuffs`, so under last-writer-wins both of those silently took the credit for the
   *  actor's own stacks and every "when *you* inflict" passive on the actor stopped paying.
   *
   *  `sourceOf` is already correct by the time this runs — every grant path calls `attribute()`
   *  first (see the public `apply*` wrappers) — so the source is read off the Gear rather than
   *  passed down through six call sites. */
  appliedBy: Map<Gear, Map<string, number>>;
  /** Everything *spent off the target* during the action being evaluated, and how many stacks of it
   *  — the mirror of `ctx.appliedNow` above, and the other half of the picture a kit needs: the stack
   *  pools record what a cast puts on and nothing at all about what a cast takes back, so before this
   *  there was no way for "when you consume a Negative Status stack" to be anything but assumed.
   *
   *  Filled only by `consume()`, never by `removeStackEnemy()`/`revokeEnemy()`. That is the point of
   *  the split: most removals are bookkeeping rather than a resonator spending anything — a status
   *  converting into another (Hiyuki's Chafe into Glacio Bite), a window counting itself down
   *  (tunebreak.ts's Interfered), a Negative Status paying for its own calculation off the stacks it
   *  had banked (every ladder in status.ts) — and none of those is a resonator consuming a stack. A
   *  kit says which it means by which function it calls, and only two do mean it: Xuanling's Sword
   *  Stance Flow spending a Havoc Bane, and Hiyuki's Frostbind spending ten Glacio Bite. */
  consumedNow: Map<Gear, number>;
  /** The same, split by the member who did the spending — what `consumedByMe()` reads. Keyed on the
   *  slot the consuming gear was running as (`ctx.slot`), not on `sourceOf` the way `ctx.appliedBy` is:
   *  a debuff's *source* is whose kit put it on the target, which is exactly the wrong question here.
   *  What a "when you consume" passive means is who spent it, and that is whoever's hook called
   *  `consume()`. */
  consumedBy: Map<Gear, Map<string, number>>;
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
  constVersion: 0,
  overrideType1: null,
  overrideType2: null,
  appliedNow: new Map(),
  appliedBy: new Map(),
  consumedNow: new Map(),
  consumedBy: new Map(),
  tracing: false,
  insideGroup: false,
};

export const tagWord = (element: Attribute | null, type: Type1 | null, type2: Type2 | null): number =>
  (element ?? 0) | (type ?? 0) | (type2 ?? 0);
export const tagWordOf = (action: Action): number => {
  let word = action._tagWord;
  if (word === undefined) action._tagWord = word = tagWord(action.element, action.type, action.type2);
  return word;
};

/** What a dry run wrote in place — a Pool's `at` or a member's `globalHooks`, the Gear, and what
 *  that key held before — as flat triples, for `undoDry()` to reverse before a snapshot is put
 *  back. A journal rather than a copy because a variant writes two or three entries and the copy
 *  was the whole map, once per variant per action. */
export const dryLog: (Map<Gear, number> | Set<Gear> | Gear | number | boolean | undefined)[] = [];
export function undoDry(): void {
  for (let i = dryLog.length - 3; i >= 0; i -= 3) {
    const target = dryLog[i], gear = dryLog[i + 1] as Gear, prev = dryLog[i + 2];
    if (target instanceof Map) { if (prev === undefined) target.delete(gear); else target.set(gear, prev as number); }
    else if (prev) (target as Set<Gear>).add(gear); else (target as Set<Gear>).delete(gear);
  }
  dryLog.length = 0;
}

export const noteMutation = (id: number, n: number): void => { ctx.mutHash = (Math.imul(ctx.mutHash ^ id, 0x9e3779b1) + n) | 0; };
/** The stats `evaluate()` banks into the running gauges — a variant that moves any of these would
 *  bank differently, so the real build's fight isn't its fight either. */
export const RESOURCE_STATS: Stat[] = [
  Stat.AddEnergy, Stat.AddConcerto, Stat.AddOfftune, Stat.DirectOfftune, Stat.OfftuneBuildup, Stat.EnergyRegenMult,
  Stat.AddForte1, Stat.AddForte2, Stat.AddForte3, Stat.AddForte4, Stat.AddForte5,
];

export const recordApplied = (gear: Gear, n: number): void => {
  if (n <= 0) return;
  ctx.appliedNow.set(gear, (ctx.appliedNow.get(gear) ?? 0) + n);
  const source = ctx.state!.sourceOf.get(gear);
  if (source === undefined) return;
  let per = ctx.appliedBy.get(gear);
  if (per === undefined) ctx.appliedBy.set(gear, (per = new Map()));
  per.set(source, (per.get(source) ?? 0) + n);
};

export const recordConsumed = (gear: Gear, n: number): void => {
  if (n <= 0) return;
  ctx.consumedNow.set(gear, (ctx.consumedNow.get(gear) ?? 0) + n);
  const by = ctx.slot!.name;
  let per = ctx.consumedBy.get(gear);
  if (per === undefined) ctx.consumedBy.set(gear, (per = new Map()));
  per.set(by, (per.get(by) ?? 0) + n);
};

export const pendingQueue: { action: Action; slot: number; by: HeldBuff | null; event: boolean }[] = [];
