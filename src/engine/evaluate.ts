/**
 * Running an action: the phase order, the snapshot each one resolves into, and `run()`, which
 * walks a rotation and drains whatever the casts queued behind them.
 */
import { Stat, EnemyStat, Type, Cast, ActionTag, INSTA_DELAY, SWAP_DELAY, FULL_CONCERTO, splitStop } from "./stats.js";
import type { Action, ActionGroup, ActionField, CancelledStep, DashMarker } from "./rotation.js";
import type { CastAdd } from "./runtime.js";
import { ctx, pendingQueue, tagWordOf, RESOURCE_STATS, replay, readAny, READ_APPLY, READ_CONVERT, READ_AFTER, applied as appliedRecord, resolving, hookReads, moved } from "./runtime.js";
import { Gear, PHASE_COUNT } from "./gear.js";
import type { VariantAt, Timed, StatRow } from "./state.js";
import {
  State, TeamMember, StatEntry, HeldBuff, ZERO_STATS, statRow, SUBTYPE_AMP_INDEX, BASIC_DMG_BONUS_INDEX, SUBTYPE_CRIT_RATE_INDEX, SUBTYPE_CRIT_DMG_INDEX, SUBTYPE_TOTAL_DMG_INDEX, SUBTYPE_DAMAGE_TAKEN_INDEX, FightSnapshot, capEnergy,
  EMPTY_HELD, EMPTY_FORTE, EMPTY_FIELDS, enemyDef, enemyRes, sortByDue, insertByDue, timedEntry,
} from "./state.js";
import { casting, isCast } from "./context.js";
import { damageAvgOf, foldStat } from "./damage.js";
import { ER_TOLERANCE } from "../shared/substats.js";

export interface Snapshot {
  action: Action;
  member: string;
  stat(key: Stat | EnemyStat): number;
  /** The same totals `stat()` reads, as the array itself — indexed by the stat, for damage.ts's
   *  dozen reads per row. */
  stats: StatRow;
  atk: number; hp: number; def: number;
  amp: number; dmgBonus: number;
  /** The `Subtype`-scoped part of `amp` on its own — the only amplification a dot row reads (see
   *  SUBTYPE_AMP_INDEX and damage.ts's own `ampFactor`). */
  subtypeAmp: number;
  subtypeCritRate: number; subtypeCritDmg: number;
  subtypeTotalDmg: number; subtypeDamageTaken: number;
  enemyRes: number; enemyDef: number;
}

/** What one evaluated action leaves for the search and the report's own grouping: who cast
 *  what, how the row folds, and its damage. All an untraced run builds; a traced one returns
 *  the full `ResolvedSnapshot` below, which extends it. */
export interface Result {
  action: Action;
  member: string;
  slot: string;
  triggered: boolean;
  /** The ActionGroup this row was pressed as part of, and whether it is that group's last cast —
   *  stamped by `run()` as it expands a group, and read by nothing but the report, which folds a
   *  group's members into one row. Null/false on every action pressed on its own, and on every
   *  follow-up queued *during* a group: a follow-up is not one of the casts the group names, and
   *  the report keeps it as a row of its own (after the group when collapsed, back in place when
   *  opened). */
  group: ActionGroup | null;
  groupEnd: boolean;
  /** The ActionGroup a follow-up was queued *out of* — set on every cast the engine queued while a
   *  group was being pressed, the last member's own follow-ups included (they land after the group
   *  has ended, but they are still that beat's spill). Null on the group's members themselves, on
   *  anything a rotation placed, and on an engine event (`queueEvent()`, the Tune Break): an event
   *  belongs to nobody, so it ends the spill rather than joining it. The report tucks a group's
   *  spill under it while it is collapsed (solver.ts's own `toLines()`). */
  groupSpill: ActionGroup | null;
  /** What queued this action, when something did: the Gear whose hook called
   *  `queue()`/`queueOn()`/`queueEvent()` — a buff, a piece of gear, or the cast it followed (an
   *  Action is a Gear too) — named and attributed exactly like a held buff, so the report can give
   *  it the same source colour. Null on every action a rotation placed itself, and on the
   *  `triggered` rows nothing queued: an Outro (a handoff), a summon echo's hit, a Tune Break.
   *  Trace-only — the action hover names it. */
  source: HeldBuff | null;
  /** Whether this cast reached the queue mid-fight (`queue()`/`queueOn()`/`queueEvent()`, or the
   *  Intro queue) rather than standing on the rotation list — stamped by `run()`. Broader than
   *  `source` (an event is queued by nobody) and narrower than `triggered` (a rotation's own
   *  summon echo is triggered but not queued): it is exactly "spliced in behind something else", which
   *  is what the scheduler reads to keep an Intro's own follow-ups with it (rotation.ts). */
  queued: boolean;
  /** This action's own average damage under each of the acting member's main-stat variants (see
   *  `TeamMember.variants`), in their order — `null` on every action of a member without any, and
   *  on every traced run. solver.ts sums these the way it sums the real `avg`. */
  variantAvg: number[] | null;
  /** This action's motion value and average damage, computed here so an untraced run never
   *  builds the stat snapshot the report reads them back from (damage.ts's `mvPercent`/`damageFactors`
   *  give the same numbers off a traced one). */
  mv: number;
  avg: number;
  /** The frame a split press's last hit landed, which filled this cast row in — what its Time cell
   *  reads. Unset on every other row. */
  hitAt?: number;
  /** The `SWAP_DELAY` a new resonator coming in costs, charged to the row that handed the field over. */
  swapFrames?: number;
  /** The game timer as this press was cast (`State.frame`) — a landed hit's, its own. */
  starts: number;
  /** What cast hooks added straight to the cast (`addToCast()`): energy, concerto, forte 1-5; null for none. */
  castGain: number[] | null;
  /** Its group's trailing dash was dropped for what took its place (`replaceNextDash()`): the
   *  group ends on this press, which its row then reads. */
  dashDropped?: boolean;
  /** The real timer as this press was cast (`State.real`), and as its last hit lands. */
  realStarts: number;
  ends: number;
}

/** A snapshot with everything the old report/display layer also wants: the raw per-entry trace
 *  (`entries`), a `slot` alias for `member` (display.ts's own field name), and resource counters
 *  — always empty here, since this engine folds Energy/Concerto/Offtune into Stat's own space
 *  rather than tracking a running counter (see `AddEnergy` above); a column fed entirely by
 *  zeroes is dropped by `buildReport()` itself, so this degrades to "not shown" rather than
 *  lying with a fake number. `triggered` is set by `run()`, not here — only it knows whether an
 *  action came off the rotation list or was queued mid-fight. */
export interface ResolvedSnapshot extends Result, Snapshot {
  entries: StatEntry[];
  /** What cast hooks added straight to the cast (`addToCast()`), by who: energy, concerto, forte 1-5. */
  castAdds: CastAdd[];
  /** The damage type the hit was actually evaluated as — its own `type`, unless a held Gear called
   *  `typeOverride()` on it: what `isType()` answered against. */
  type: Type | null;
  /** This slot's own forte gauges 1-5, as they stood once this action resolved. */
  forte: [number, number, number, number, number];
  /** The same five, as they stood *before* it — what the report compares against to decide whether
   *  a row actually moved a gauge (index.ts's own running-column blanking), which the traced deltas
   *  alone can't answer for a kit that sets one outright. Trace-only, same as `forte`. */
  forteBefore: [number, number, number, number, number];
  /** This slot's Resonator's own declared caps (`maxForte1`-`maxForte5`, gear.ts), 0 where a gauge
   *  has none (a count-down gauge, or one nobody capped) — what the report prints a gauge cell's
   *  own cap against (display.ts's own `gaugeSuffix`). Already a fixed array on the Resonator
   *  itself, so unlike `forte` it needs no per-action copy or `ctx.tracing` gate. */
  maxForte: [number, number, number, number, number];
  /** What a unit of each gauge reads as (`ResonatorDef.forteScale`). */
  forteScale: [number, number, number, number, number];
  /** Running totals as they stood once this action resolved — energy/concerto are this slot's
   *  own (TeamMember.energy/concerto), offtune is the enemy's shared one (State.offtune). All
   *  three are banked automatically by evaluate() itself; see AddEnergy/AddConcerto/AddOfftune. */
  energy: number;
  concerto: number;
  offtune: number;
  /** The same three, as they stood *before* this action — what the report compares against to
   *  decide whether a row actually moved one (index.ts's own running-column blanking). Kept here
   *  rather than read off the previous row, so a row with no previous row of its own — a group's
   *  own opened members, a member's first cast — still answers it. Trace-only, same as `forte`. */
  energyBefore: number;
  concertoBefore: number;
  offtuneBefore: number;
  /** The concerto this action itself added — not the floor a bar left below empty comes back up to. */
  concertoGained: number;
  /** The order this was evaluated in, across the whole run — a split press's row keeps its cast's. */
  seq: number;
  /** A split press's own steps, cast then each hit in, each with what it moved (`gaugeDelta`). */
  gaugeLog?: GaugeStep[];
  /** The gauges as the report shows them (`settleGauges()`): energy, concerto, off-tune, forte 1-5,
   *  before the press and once every hit of it is in, counting each press cast earlier in full and
   *  nothing cast later. */
  shownBefore?: number[];
  shownAfter?: number[];
  /** Which bars — energy, concerto, forte 1-5 — the cast found outside its own condition
   *  (`ActionDef.minEnergy` and on), null where it met them all or has none: what the report reads
   *  to flag those cells red. */
  castUnmet: boolean[] | null;
  /** Whether this is the outro that ends its owner's loop — every one but a double-Intro visit's
   *  own, which they come straight back from. The ER window leaves its own energy out. */
  endsLoop: boolean;
  /** This slot's own RealEnergy (see `TeamMember.realEnergy`) as it stood right before this
   *  action's own gain landed — what the Energy Requirements table reads off a resetEnergy-marked
   *  Liberation's own row to compute that loop's ER requirement. */
  realEnergyBefore: number;
  /** The fight clock as this action's cast started, in frames (`State.frame`), and how many frames
   *  the press charged the clock — its `animFrames` or its cut when it was an on-field press, else 0. */
  frame: number;
  frames: number;
  /** The press's one tag, its cut where the rotation cut it — what its row carries. */
  tag: ActionTag;
  /** Was its owner the resonator on field (`State.onField`) — FIELD or OFF-FIELD on a Field row. */
  active: boolean;
  /** Real frames of this press the game timer stood still for past its own time stop — another
   *  press's time stop still standing (`State.freeze()`). */
  timestopBanked: number;
  /** A hold cancel's frame the bars paid for the press it held into (`Action.holdPaid()`); -1 otherwise. */
  holdPaid: number;
  /** Every Buff actually held once this action resolved — local (this slot's own), global
   *  (team-wide), and enemy (debuffs on the target — `State.enemyStacks`) kept apart, since
   *  that's a real distinction to a resonator popover, not just a formatting detail. Equipped
   *  gear is excluded (see `TeamMember.equipped`); each entry carries its own name (`toString()`,
   *  so "Name xN" where it stacks) and whose kit it came from (`State.sourceOf`). */
  heldLocal: HeldBuff[];
  heldGlobal: HeldBuff[];
  heldEnemy: HeldBuff[];
  /** The fields this action put out — every `ActionField` whose own Buff was granted while it
   *  resolved (`applied()`, so an outro handoff adopted at an Intro counts there). This is what
   *  files a field's whole run of summons under the cast that created it, and what starts a fresh
   *  row each time one is opened again (solver.ts's `collapseFields`). Report-only. */
  opensFields: ActionField[];
}

/** One rendered line in the report: this engine has no multi-hit chain concept (a queued
 *  follow-up is already its own top-level row — see `run()`), so every group is a single action,
 *  never collapsed. Kept only so display.ts's own `buildReport(lines: ChainGroup[])` — otherwise
 *  unmodified — still has something to consume. */
/** Thrown by a Liberation that fires on a bar its build could never have filled, so the run can be
 *  abandoned where it stands rather than finished — caught by `runTeam`, which raises the ER tier
 *  and starts again. A marker, not an error: it carries nothing and never leaves teamrun. */
export const ER_SHORT = { erShort: true, member: "", need: 0 };

export interface ChainGroup<S extends Result = ResolvedSnapshot> {
  id: string;
  isChain: boolean;
  parts: { snap: S; dmg: { avg: number } }[];
  snap: S;
  mv: number;
  avg: number;
  /** The parts whose columns actually fold into this row — an ActionGroup's own casts, or every
   *  repeat of one triggered hit. The rest of `parts` are rows in their own right that merely
   *  resolved inside the span (a follow-up queued mid-group), and contribute nothing to the folded
   *  row's motion value, damage or resource totals. Empty on an ordinary single-action line. */
  members?: S[];
  /** A follow-up that fired *during* an ActionGroup, and so reads after it while the group is
   *  collapsed. Still a line of its own — its damage is its own and every total counts it here,
   *  once — but the report tucks it inside the group's own block so opening the group hides it and
   *  shows it back in its real place among the members instead (index.ts). */
  spill?: boolean;
  /** A field window's own summary row (solver.ts's `collapseFields`): the whole window read as one
   *  beat after the cast that opened it. Its motion value and damage are the hits' own, which stay
   *  lines of their own in the places they fired — so every total skips this row and only the
   *  display reads it. */
  aggregate?: boolean;
  /** Which field window this line belongs to — on the summary row, and on every hit it stands for,
   *  so the renderer can swap the one for the others (index.ts). */
  fieldKey?: string;
}

/** Evaluate one action on `state`'s active slot — a whole press, or one part of a press whose hits
 *  are queued (`Action.half`). The cast: an Intro adopts whatever's queued for it, then every held
 *  Gear's updateGlobal() (every slot's own gear, see `runGlobals`), then updateBuffs(). Each hit, at
 *  its own frame: on the first, updateDebuffs() and hitGlobal(); on every one, eachHit(), the grants
 *  its inflictions trigger, applyStats(), convertStats(), lateConvertStats(), and the onHit grants
 *  once it has banked. The end (`closePress`): afterAction(). An Outro's cast advances the active
 *  slot afterward.
 *
 *  The action itself is a Gear too, and its own hook for a phase runs first in that phase, ahead
 *  of every held Gear's (see `actionHook`) — so a cast's own effect is in place before anything
 *  reacting to it looks. */
export function evaluate(state: State, action: Action, triggered = false, source: HeldBuff | null = null, cut: ActionTag | null = null): Result {
  // always whoever is on field. A Negative Status's own damage used to be diverted onto a
  // resonator-less slot of its own, which meant no attacker's gear reached it and the one
  // amplification a dot row does read (`Subtype`-scoped, see damage.ts) could only ever be granted
  // team-wide. It now resolves on the acting slot exactly the way a Tune Break does — their stats,
  // their `Subtype` amplification — and, unlike a break, reports in their damage column too: the
  // status is theirs. It is still not their *action*: it is an ordinary active cast all the same,
  // exactly like a Tune Break — the resonator really is on field for it — so no "lost on swap"
  // buff mistakes it for its holder leaving. What separates it from a real press is
  // `triggeredAction()`, which a passive counting those tests instead.
  const slot = state.slot;
  ctx.state = state;
  ctx.slot = slot;
  ctx.act = action;
  // each part of a split press runs its own side — a hitless cast its hit's too — and a whole press all
  const half = action.half;
  const castSide = half === null || half === "cast", hitSide = half === null || half === "hit" || action.hitsAtCast;
  const lands = hitSide && action.bullets.length > 0;
  phaseMask = (castSide ? CAST_PHASES : 0) | (hitSide ? HIT_PHASES : 0) | (lands ? ON_HIT_PHASES : 0) | (half === null ? END_PHASES : 0);
  // a step's own cut, else the form's (an insta cancel, a swap)
  const tag = cut ?? action.tag;
  if (castSide) ctx.pressCut = tag;
  // a hold cancel lets go where the bars pay for the press it holds into: read ahead of the cast
  // for its hooks, then again on what the cast really added
  const held = tag === ActionTag.HoldCancel && castSide ? action.formOf ?? action : null;
  const cap = slot.resonator?.maxForte ?? NO_CAP;
  // the cast's own condition, read off the bars as it finds them
  const castUnmet = ctx.tracing && castSide ? action.castUnmet([slot.energy, slot.concerto, ...slot.forte]) : null;
  let charged = held ? action.holdCost(held.holdAt([slot.energy, slot.concerto, ...slot.forte], cap, ctx.holdNext)) : action.cost(tag);
  const realStart = state.real;
  // a wait on the game timer plays the real frames that take, held on by any time stop landing
  // inside it (`State.freeze()`); any other press the field moves on to ends one
  if (castSide && action.gameWait) {
    state.waitUntil = state.frame + action.animFrames;
    const len = state.realOf(state.waitUntil) - realStart;
    charged = { action: len, timestop: 0, global: 0, total: len };
  } else if (castSide && !triggered && state.real >= state.playsTo) state.waitUntil = 0;
  // the press's game frames: its real ones less what its own time stop, or one still standing, froze
  ctx.actFrames = charged.action + charged.global - Math.min(charged.action + charged.global, Math.max(action.timestop, state.frozenAhead()));
  const active = ctx.tracing && state.slot === state.slots[state.onField];
  ctx.triggered = triggered;
  ctx.tagWord = tagWordOf(action);
  // every action starts on its own type; a held Gear reassigns it from updateDebuffs() below, and
  // `typeOverride()` rebuilds `ctx.tagWord` when one does
  ctx.overrideType = null; ctx.overrideSubtype = null; ctx.droppedCast = null;
  if (ctx.swapLosses.size) ctx.swapLosses.clear();
  // what this action grants and spends is recorded under this stamp (see runtime.ts's `applied`)
  ctx.actionStamp++;
  // whatever ran out by now goes first of all, so no phase below ever visits it
  state.expireBuffs();
  const frameStart = state.frame;
  // Replaced rather than cleared/copied: the snapshot below keeps whichever array this action built,
  // so handing it a fresh one here is what makes that snapshot immutable at zero copying cost (the
  // old code cleared these and then cloned `totals` at the end, paying an O(entries) copy per
  // action for the same guarantee).
  // ...untraced, nothing keeps the array past this action, so it is cleared in place instead
  if (ctx.tracing) slot.effective = statRow();
  else slot.effective.set(ZERO_STATS);
  ctx.wrote = 0;
  // What each gauge held coming into this action. The report needs it to tell a row that
  // moved a gauge from one that merely reports the same balance again, and it cannot be
  // inferred from the traced deltas: a kit that sets a gauge outright (`setForteN`) moves it
  // with no delta to trace. Captured here, ahead of every phase, since updateBuffs can already
  // have set one by the time the declared deltas bank. Trace-only, same as `forte` below.
  const forteBefore: [number, number, number, number, number] = ctx.tracing ? [...slot.forte] : EMPTY_FORTE;
  // and the same for the three running totals, for the same reason
  const energyBefore = slot.energy, concertoBefore = slot.concerto, offtuneBefore = state.offtune;
  if (ctx.tracing) { slot.entries = []; slot.totals = new Map(); }

  if (castSide && casting(Cast.Intro)) {
    // the Outro's buffs land on the Intro's QTE frame, their durations starting there
    const intro = action.formOf ?? action, qte = intro.qteFrames;
    if (!qte) for (const gear of state.outroQueue.splice(0)) slot.addStack(gear, 1);
    else {
      insertByDue(state.timed, outroLanding(state, slot, state.real + qte));
    }
    // ...and whatever was waiting on this Intro lands right behind it (see `queueOnIntro()`)
    pendingQueue.push(...state.introQueue.splice(0));
  }

  // A phase's own roster and stack counts are captured before it runs (see `capture()`), so
  // nothing a gear does mid-phase shifts the ground under whatever this engine iterates to next.
  //
  // The cast: updateGlobal() first, for every slot's own held gear — not just the acting slot's —
  // plus global and enemy gear, whoever is casting. That's what lets a kit react to "any team
  // member's cast" through gear held locally (a self buff) instead of making it team-wide just to
  // be reachable. For a locally-held gear `ctx.slot` is switched to *its own holder* for the call,
  // so `revoke()`/`applySelf()`/`stacksOf()` inside it resolve against whoever holds it; global and
  // enemy gear keep `ctx.slot` on the actor. Then updateBuffs() over what that left.
  const gain = ctx.castGain;
  for (let i = 0; i < gain.length; i++) gain[i] = 0;
  ctx.inCast = false;
  if (ctx.tracing) ctx.castAdds = [];
  if (castSide) {
    ctx.inCast = true;
    actionHook(action.updateGlobalFn, 1);
    runGlobals(state, slot, false);
    capture(slot, state);
    actionHook(action.updateBuffsFn, 1);
    runPhase(1, true);
    ctx.inCast = false;
  }
  const holdPaid = held ? held.holdPaid([slot.energy, slot.concerto, ...slot.forte], cap, ctx.holdNext, gain) : -1;
  if (held) {
    ctx.holdCut = held.letGo(holdPaid);
    charged = action.holdCost(ctx.holdCut);
  }
  // the press plays its real frames whatever stops; its time stop freezes the game timer from its
  // own start frame, over its animation alongside any other, and what outlasts that stacks behind it all
  const realLen = charged.action + charged.global;
  const stop = splitStop(action.timestopFrom, action.timestop, charged.action, realLen);
  if (castSide && stop.own + stop.banked) state.freeze(realStart + action.timestopFrom, stop.own, stop.banked);
  const frozenIn = Math.min(realLen, state.frozenWithin(realStart, realStart + realLen));
  const timestopBanked = Math.max(0, frozenIn - charged.timestop);
  ctx.actFrames = realLen - frozenIn;
  ctx.actReal = realLen;

  // A part lands where it is due and a whole press on its cast; the rest of the press is only time
  // on the clock, which `run()` walks after it, landing each hit at its own frame.
  const frames = ctx.actFrames;
  // its motion stop holds every inactive resonator's animations and clocks from its cast the same
  // way, pushing their queued hits back (`shiftOffField()`)
  const hold = splitStop(action.motionStopFrom, action.motionStop, charged.action, realLen);
  ctx.offFieldFrom = realStart + action.motionStopFrom;
  ctx.offFieldShift = castSide && hold.own + hold.banked ? state.holdOffField(ctx.offFieldFrom, hold.own, hold.banked) : 0;

  // Every hit: the action's own updateDebuffs() and the hit's, every held Gear's, then the same for
  // hitGlobal(), then the grants its inflictions trigger
  if (hitSide) {
    capture(slot, state);
    actionHook(action.updateDebuffsFn, 0);
    if (lands) actionHook(action.lastBullet!.updateDebuffs, 0);
    runPhase(0, true);
    actionHook(action.hitGlobalFn, 0);
    if (lands) actionHook(action.lastBullet!.hitGlobal, 0);
    runGlobals(state, slot, true);
    capture(slot, state);
    runPhase(7, true);
  }

  // ...then applyStats()/convertStats() pay out over what's held *now*, not what was held a
  // moment ago: a buff updateBuffs() just granted pays into this same action, and one it just
  // revoked pays nothing. Captured again at post-update counts, so a buff that gained or spent
  // stacks reports the count it actually ended on to its own applyStats() — and this one capture
  // serves every stat phase from here down, none of which may change what is held.
  capture(slot, state);
  // The popover's own roster: what applyStats()/convertStats() pay out over *is* this action's
  // finalized buff set. Counts come along, since a hookless Gear is in no phase list and so in no
  // `frozen` below.
  const heldPools = ctx.tracing
    ? [slot.stacks, state.globalStacks, state.enemyStacks]
      .map((pool) => pool.gears().map((g) => [g, pool.get(g) ?? 0, pool.left(g)] as const))
    : null;
  // Every held Gear's constantStats first, ahead of any applyStats. Traced, they run like any
  // other phase so the report gets its per-entry sources; untraced, the slot's cached sum for
  // this action's tag word lands in one pass — built by running them just once (see `constBase`).
  // ...and what the acting member's main-stat variants (if any) start from: everything the phases
  // so far contributed, before the real build's constant base goes in
  // (all zeroes when the grant phases wrote no stat, the usual case — then `ZERO_STATS` itself,
  // read-only, and the base below is copied in rather than added onto zeroes)
  let pre: StatRow | null = null;
  let variantEff: StatRow[] | null = null;
  let variantAt: VariantAt | null = null;
  let anyDry = false;
  // a bare cast deals nothing and its row reads its hits' stats: the stat phases matter to it only
  // where it banks energy or off-tune, the two gains a stat scales (Energy Regen Multiplier, Buildup Rate)
  const statless = castSide && !hitSide && action.energy === 0 && action.offtune === 0 && gain[0] === 0;
  if (!statless && !ctx.tracing && slot.variants.length !== 0) {
    if (ctx.wrote === 0) pre = ZERO_STATS;
    else {
      pre = slot.pre;
      pre.set(slot.effective);
    }
  }
  // the stat phases change nothing in the fight, so a variant's dry re-run needs no snapshot of it —
  // only an afterAction (a whole press's) can, and that takes its own below
  let replay2 = 0, applyMoved = false;
  if (!statless) {
    if (ctx.tracing) runPhase(6, true);
    else {
      // ...and the variants' own bases alongside it: they are the same sum with one main stat
      // swapped, so whatever stales one stales the other. Load-bearing the moment anything that
      // comes and goes declares `constantStats` — without it a variant is scored against a base
      // built before the buff landed, and the search picks a main stat on numbers that never
      // happened.
      if (slot.constBaseVersion !== ctx.constVersion) {
        slot.constBase.clear();
        slot.variantAt.clear();
        slot.constBaseVersion = ctx.constVersion;
      }
      let base = slot.constBase.get(ctx.tagWord);
      if (base === undefined) slot.constBase.set(ctx.tagWord, base = cachedBase(slot, null, null, null, null));
      const effective = slot.effective;
      if (ctx.wrote === 0) effective.set(base);
      else for (let i = 0; i < effective.length; i++) effective[i] = effective[i]! + base[i]!;
    }
    // The stat phases are journaled while variants are in play (see `replay`/`reads`): a variant
    // whose main-stat piece moves no index a phase read would have run that phase's hooks down the
    // very same path, so the journaled writes stand for it (bit-identical, same order) and nothing
    // is re-run. Only a variant that moves an index a hook actually read runs the conversions again.
    ctx.mutHash = 0;
    ctx.recording = pre !== null;
    ctx.readStamp++;
    ctx.readPhase = READ_APPLY;
    replay.length = 0;
    actionHook(action.applyStatsFn, 2);
    runPhase(2, true);
    // the applyStats journal alone, and whether the phase moved anything, for a variant that must
    // still re-run the conversions: a replayed applyStats can stand in only if it moved nothing,
    // since its dry run starts from the fight as it stood before it
    replay2 = replay.length;
    applyMoved = ctx.mutHash !== 0;
    // ...and the real build's row as applyStats left it, the same variant's own starting point
    if (pre !== null) slot.post2.set(slot.effective);
    ctx.readPhase = READ_CONVERT;
    if (pre !== null) {
      hookLogLen = 0;
      hookReads.length = 0;
      logPhase(action.convertStatsFn, 3);
      logPhase(action.lateConvertStatsFn, 4);
    } else {
      actionHook(action.convertStatsFn, 3);
      runPhase(3, true);
      // ...and one phase later again, for a conversion that reads what another gear's convertStats()
      // just granted (see GearDef.lateConvertStats).
      actionHook(action.lateConvertStatsFn, 4);
      runPhase(4, true);
    }
    ctx.recording = false;
    ctx.dryRun = false;
  }

  // A variant's row differs from the real build's only where its main-stat piece differs from the
  // held one (`variantDiff`): it is the real build's row copied, with those indices recomputed
  // from the same operands in the same order — the variant's own base, then the journaled writes
  // to them. Pure through here, that happens after afterAction below, off the finished row. An
  // impure variant runs the conversion phases again now, dry, on the same captured roster — the
  // stat phases change nothing, so every hook reads exactly what it read in the real build, live
  // reads included. A variant whose resource stats would bank differently, or whose afterAction
  // would change the fight differently, is marked unsafe: its fight would not have been this fight.
  if (pre !== null) {
    const primaryEff = slot.effective;
    let at = slot.variantAt.get(ctx.tagWord);
    if (at === undefined) {
      const base = slot.constBase.get(ctx.tagWord)!;
      at = { bases: [], diffs: [] };
      for (let v = 0; v < slot.variants.length; v++) {
        const sub = slot.variantSubs[v] ?? null;
        const vbase = cachedBase(slot, slot.variantOf, slot.variants[v]!, sub && slot.variantSubOf, sub), diff: number[] = [];
        for (let i = 0; i < vbase.length; i++) if (vbase[i] !== base[i]) diff.push(i);
        at.bases.push(vbase); at.diffs.push(diff);
      }
      slot.variantAt.set(ctx.tagWord, at);
      for (let v = 0; v < slot.variants.length; v++) slot.variantEff[v] ??= statRow();
    }
    variantAt = at;
    variantEff = slot.variantEff;
    for (let v = 0; v < slot.variants.length; v++) {
      const eff = variantEff[v]!;
      const diff = at.diffs[v]!, vbase = at.bases[v]!;
      slot.variantDry[v] = readAny(diff, READ_APPLY | READ_CONVERT);
      if (!slot.variantDry[v]) continue;
      slot.variantEverDry[v] = true;
      if (!anyDry) { anyDry = true; ctx.dryRun = true; }
      const replayable = !applyMoved && !readAny(diff, READ_APPLY);
      if (replayable) sparseRow(diff, vbase, eff, slot.post2, pre, 0, replay2);
      else for (let i = 0; i < eff.length; i++) eff[i] = pre[i]! + vbase[i]!;
      slot.effective = eff;
      if (replayable) replayConversions(diff, eff);
      else {
        actionHook(action.applyStatsFn, 2);
        runPhase(2, true);
        actionHook(action.convertStatsFn, 3);
        runPhase(3, true);
        actionHook(action.lateConvertStatsFn, 4);
        runPhase(4, true);
      }
      for (let r = 0; r < RESOURCE_LIST.length; r++) {
        const s = RESOURCE_LIST[r]!;
        if (eff[s] !== primaryEff[s]) slot.variantUnsafe[v] = true;
      }
    }
    if (anyDry) { ctx.dryRun = false; slot.effective = primaryEff; }
  }
  // What belongs in the resonator popover is what's held while applyStats()/convertStats() run —
  // `heldPools` above. Buffs only: everything this
  // member `equip()`-ped is gear (see TeamMember.equipped), and the loadout popover on their own
  // name already names all of it. Globals need no such filter — equip() only ever writes to a
  // slot, so nothing equipped can reach globalStacks.
  //
  // Names are generated only now, after applyStats()/convertStats() have both run — a display() reading a
  // stat one of them just contributed (Jingran's HP-based step counts) needs the final number.
  // The *roster* named is `heldPools`, taken before those hooks ran (see above); only the naming
  // happens here. `currentHeldStacks` is still the same frozen map applyStats()/convertStats() just used
  // (not re-frozen here), so a buff's own stack-count display reports the count it held at that point.
  // Trace-only: every one of these is a `Gear.toString()`,
  // and nothing but the detail page's own resonator popover ever reads them (see `ctx.tracing`).
  let heldLocal: HeldBuff[] = EMPTY_HELD, heldGlobal: HeldBuff[] = EMPTY_HELD, heldEnemy: HeldBuff[] = EMPTY_HELD;
  if (ctx.tracing) {
    // the counts applyStats()/convertStats() just ran with, so a stack-count display still reports what it
    // actually held then rather than whatever a live re-read would show now
    // walked through the phase lists rather than `list` itself, since a dropped Gear stays in
    // `list` (see Pool)
    [heldLocal, heldGlobal, heldEnemy] = heldRosters(state, slot, heldPools!);
  }
  ctx.stacks = -1;
  ctx.buff = null;

  // which fields this action put out — read off the same grant record `applied()` answers from,
  // so every path counts (a team grant, a mark on the enemy, an outro handoff adopted at an Intro)
  let opensFields: ActionField[] = EMPTY_FIELDS;
  if (ctx.tracing) {
    const { gears, length } = appliedRecord.list();
    for (let i = 0; i < length; i++) {
      const gear = gears[i]!;
      if (!gear.field) continue;
      if (opensFields === EMPTY_FIELDS) opensFields = [];
      opensFields.push(gear.field);
    }
  }

  // Handed straight to the snapshot rather than cloned: this action's own map was created fresh at
  // the top of this call and the next `evaluate()` on this slot replaces it rather than clearing
  // it, so nothing can write to it again — the same immutability the old clone bought, without the
  // copy. Every scope matching this action is already folded in (see `pushStat`), so reading a
  // stat is one lookup rather than a re-sum across three freshly-built key strings.
  const effective = slot.effective;

  // bank this action's own declared energy/concerto/offtune (the resonator's own baseline for
  // performing it) plus whatever AddEnergy/AddConcerto/AddOfftune a held buff contributed, into
  // the real running totals — no kit ever touches these directly, same as forte.
  // Energy alone carries a multiplier: `(base + AddEnergy) x (1 + Energy Regen Multiplier)`.
  // a buff's gains bank with the half they belong to: the hit's with a hit, the cast's with a cast
  // each half banks what its own hooks granted: the stat phases' on the hit, updateBuffs' on the cast
  const addEnergy = effective[Stat.AddEnergy]! + gain[0]!;
  const energyGain = (action.energy + addEnergy) * (1 + effective[Stat.EnergyRegenMult]! / 100);
  slot.energy = Math.max(0, slot.energy + energyGain);
  // the Energy column counts up for the whole fight. A double-Intro visit's own outro hands the field
  // *backward* (rotation.ts's own outroDir): half of one loop, so only the other ends it
  const outro = castSide && casting(Cast.Outro);
  const endsLoop = outro && state.outroDir > 0;
  // A cast that spends Concerto outright — the `concerto: -100` every real outro declares — spends
  // it against the bar's own 100 ceiling: a bar that overran it is capped back first, so the
  // declared -100 empties it exactly rather than leaving the overrun behind; and a bar holding
  // less than the spend is short, which the report flags. A Unison outro declares no spend
  // (shared/unison.ts) and goes through neither. A buff's own AddConcerto spend (Suoming's Rift
  // Cleaver, -20 while Unison is held) is a stat, not a declared cost, and is left to the kit.
  // An outro still caps the bar at 100 either way — a bar cannot hold more than that into the
  // next visit, spent or not. Off-tune is the enemy's, not theirs, and carries over.
  const spend = action.concerto < 0 ? -action.concerto : 0;
  // a hit still in flight (an insta swap's, landing after the outro) hasn't banked yet, so the bar
  // goes below empty until that hit lands
  if ((spend > 0 || outro) && slot.concerto > FULL_CONCERTO) slot.concerto = FULL_CONCERTO;
  const addConcerto = effective[Stat.AddConcerto]! + gain[1]!;
  const concerto = slot.concerto + action.concerto + addConcerto;
  slot.concerto = spend > 0 ? concerto : Math.max(0, concerto);
  // what the press itself banked, the floor up from below empty aside (`gaugeDelta`)
  const concertoGained = action.concerto + addConcerto;
  // Off-Tune Buildup Rate scales what an action *builds*, never what lands on the bar directly:
  // DirectOfftune (a Tune Break's own drain, Denia's half-bar surge) is already the amount the bar
  // moves, so it goes on untouched. A declared negative would come off in full for the same reason.
  // Unclamped, unlike energy/concerto: a break can leave the bar below empty (see tunebreak.ts).
  const built = (action.offtune + effective[Stat.AddOfftune]!) * (1 + effective[Stat.OfftuneMult]! / 100);
  state.offtune += (built < 0 ? built : built * (effective[Stat.OfftuneBuildup]! / 100)) + effective[Stat.DirectOfftune]!;

  // RealEnergy (TeamMember.realEnergy): the same gain as the real Energy bar above, each holder
  // capped at their own maxEnergy, plus half of it shared to every *other* member — this is
  // the real ingame mechanic for energy being automatically shared across the team. A Liberation that resets the bar is a special case: it
  // action's own gain lands, so a resetEnergy-marked Liberation's "before" value excludes its own
  // contribution — exactly the "banked coming into this cast" figure the ER requirement wants.
  const realEnergyBefore = slot.realEnergy;
  slot.realEnergy = capEnergy(slot, slot.realEnergy + energyGain);
  const shared = energyGain / 2;
  for (const other of state.slots) {
    if (other !== slot) other.realEnergy = capEnergy(other, other.realEnergy + shared);
  }
  // The ER-requirement window (teamrun.ts's `erRollsFor`): two running sums and nothing else, so
  // every run carries the requirement without a second pass. The Liberation that closes a window
  // is in neither it nor the next, matching how the detail page walks the same span.
  if (action.resetEnergy) {
    slot.libCasts++;
    if (slot.libCasts > 1) {
      slot.erBefore = realEnergyBefore;
      slot.erA = slot.erGainEr;
      slot.erG = slot.erGain;
      // what this one Liberation asked of the constant ER. Every window counts, the opener's
      // included — only the very first cast is free, on the bar combatStart hands over.
      const want = realEnergyBefore > 0
        ? ((slot.resonator?.maxEnergy ?? 0) * 100 - (slot.erGainEr - slot.constEr * slot.erGain)) / realEnergyBefore
        : 0;
      if (want > slot.erWorst) slot.erWorst = want;
      slot.erWants.push(want);
      // Nothing after this point can make the bar have been full, so the rest of the fight is run
      // on a build that cannot cast what its rotation lists. Bail here and let teamrun re-equip.
      if (slot.erGuard && want > slot.constEr + ER_TOLERANCE + 1e-9) {
        ER_SHORT.member = slot.name;
        ER_SHORT.need = want;
        throw ER_SHORT;
      }
    }
    slot.erGainEr = 0;
    slot.erGain = 0;
    slot.realEnergy = 0;
  } else if (!endsLoop) {
    slot.erGain += energyGain;
    slot.erGainEr += energyGain * effective[Stat.ER]!;
  }

  // same shape, for whichever forte gauges this action declares a delta on — a kit assigns its
  // own meaning onto whichever slot fits (Jingran's Qi is forte1, his Mingfire is forte2) — plus
  // whatever AddForte1-5 a held buff contributed (Jingran's Fire of Life refunding Qi off its own
  // Mingfire spend, rather than reaching for setForte1 directly and leaving no trace of who paid
  // it). Unconditional, not gated on the action's own declared amount being nonzero — a buff can
  // contribute here even on an action that declares nothing itself.
  //
  // Every gauge fills freely past its Resonator's `maxForteN`, and a spend from it starts at the
  // cap rather than the overrun — the bar never really held more. Below 0 after a spend is a
  // spend the bar couldn't cover, and that row is flagged; the bar never really went below empty
  // either, so the member's next cast — or a gain landing first — clamps it back to 0 rather than
  // paying the shortfall off. A `resetForteN` cast (rotation.ts's own ActionDef) empties the gauge
  // ahead of its own delta.
  const forte = slot.forte;
  for (let i = 0; i < 5; i++) {
    const cap = slot.resonator?.maxForte[i] ?? 0;
    const delta = action.forteDeltas[i]! + effective[ADD_FORTE[i]!]! + gain[2 + i]!;
    if (action.resetForte[i] || (forte[i]! < 0 && (delta > 0 || (castSide && action.cast !== null)))) forte[i] = 0;
    if (cap > 0 && delta < 0 && forte[i]! > cap) forte[i] = cap;
    forte[i] = forte[i]! + delta;
  }

  // the hit is dealt and banked: its onHit grants, which pay from the next hit on
  if (lands) {
    capture(slot, state);
    actionHook(action.onHitFn, 8);
    runPhase(8, true);
    ctx.buff = null;
  }

  // Everything this action banks is now banked, so afterAction() is the one phase that can read a
  // gauge as the action actually leaves it — and the last chance to spend one back down before the
  // snapshot below reports it. Same frozen roster the stat phases just ran on.
  //
  // The variants' own afterAction runs first, dry, so each sees the roster and gauges exactly as
  // the real build's is about to — and each variant's damage is read here, off its own totals.
  // The real build's afterAction runs first, journaled, from the banked fight. A variant still pure
  // through it is the finished row with its own indices recomputed over the whole journal; any
  // other re-runs afterAction dry from the banked fight, on the row as afterAction found it — one
  // it already re-ran the conversions into, or the real build's with its indices recomputed — and
  // the real build's own result is put back after.
  let variantAvg: number[] | null = null;
  if (variantEff !== null && (phaseMask & END_PHASES) === 0) {
    // a part with no afterAction: each variant's row is the finished one with its own indices redone
    variantAvg = [];
    let primary = NaN;
    for (let v = 0; v < slot.variants.length; v++) {
      if (slot.variantDry[v]) {
        variantAvg.push(avgOf(action, variantEff[v]!));
        continue;
      }
      const own = scoreVariant(slot, v, action, variantAt!.diffs[v]!, variantAt!.bases[v]!, effective, pre!, replay.length);
      if (own === own) variantAvg.push(own);
      else variantAvg.push(primary === primary ? primary : (primary = avgOf(action, effective)));
    }
  } else if (variantEff !== null) {
    ctx.guarded = true;
    const [banked, done] = (state.snapshots ??= [new FightSnapshot(state), new FightSnapshot(state)]);
    const replay4 = replay.length;
    const post4 = slot.post4;
    post4.set(effective);
    banked.take(state);
    ctx.mutHash = 0;
    ctx.recording = true;
    ctx.readPhase = READ_AFTER;
    actionHook(action.afterActionFn, 5);
    runPhase(5, false);
    ctx.recording = false;
    ctx.buff = null;
    const primaryHash = ctx.mutHash;
    variantAvg = [];
    let anyDone = false;
    for (let v = 0; v < slot.variants.length; v++) {
      const eff = variantEff[v]!;
      const diff = variantAt!.diffs[v]!, vbase = variantAt!.bases[v]!;
      const dry = slot.variantDry[v]!;
      if (!dry && !readAny(diff, READ_AFTER)) {
        const own = scoreVariant(slot, v, action, diff, vbase, effective, pre!, replay.length);
        variantAvg.push(own === own ? own : avgOf(action, effective));
        continue;
      } else {
        if (!dry) {
          sparseRow(diff, vbase, eff, post4, pre!, 0, replay4);
          if (resourceMoved(diff, eff, post4)) slot.variantUnsafe[v] = true;
        }
        if (!anyDone) { anyDone = true; done.take(state); ctx.dryRun = true; }
        slot.variantEverDry[v] = true;
        slot.effective = eff;
        banked.restore(state);
        ctx.mutHash = 0;
        ctx.stacks = -1;
        actionHook(action.afterActionFn, 5);
        runPhase(5, false);
        if (ctx.mutHash !== primaryHash) slot.variantUnsafe[v] = true;
      }
      variantAvg.push(avgOf(action, eff));
    }
    if (anyDone) { ctx.dryRun = false; done.restore(state); ctx.buff = null; slot.effective = effective; }
    ctx.guarded = false;
  } else {
    ctx.mutHash = 0;
    actionHook(action.afterActionFn, 5);
    runPhase(5, false);
    ctx.buff = null;
  }
  // what a swap cancel paid on for the last time goes with it — at its end, where it queued one
  if (half === null) for (const gear of ctx.swapLosses) slot.revoke(gear);
  // the rest of the press is `run()`'s to walk, landing whatever hit falls due inside it
  if (realStart + realLen > state.playsTo) state.playsTo = realStart + realLen;
  const atk = foldStat(effective, Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk);
  const hp = foldStat(effective, Stat.BaseHp, Stat.BonusHp, Stat.FlatHp);
  const def = foldStat(effective, Stat.BaseDef, Stat.BonusDef, Stat.FlatDef);
  const mv = (action.mv + effective[Stat.AddMv]!) * (1 + effective[Stat.MulMv]! / 100);
  const avg = damageAvgOf(
    action, effective, atk, hp, def, effective[Stat.Amp]!, effective[SUBTYPE_AMP_INDEX]!, effective[Stat.DmgBonus]!,
    effective[SUBTYPE_CRIT_RATE_INDEX]!, effective[SUBTYPE_CRIT_DMG_INDEX]!,
    effective[SUBTYPE_TOTAL_DMG_INDEX]!, effective[SUBTYPE_DAMAGE_TAKEN_INDEX]!, enemyRes(), enemyDef(),
  );
  // `group`/`groupEnd`/`groupSpill`/`queued` are stamped by run() the moment this returns — nothing
  // mid-action reads them, unlike `triggered`, so none has to be threaded through this call
  const result: Result = {
    action, member: slot.name, slot: action.slot ?? slot.name, triggered, source,
    group: null, groupEnd: false, groupSpill: null, queued: false, mv, avg, variantAvg, starts: frameStart,
    castGain: anyNonZero(gain) ? gain.slice() : null,
    // the last hit is in at its own frame, not at the press's end or after the delay a cut costs
    realStarts: realStart,
    ends: realStart + (half === "cast" ? (action.formOf ?? action).lastHitDelay() : 0),
  };
  const snapshot: ResolvedSnapshot | null = !ctx.tracing ? null : {
    ...result,
    type: ctx.overrideType ?? action.lastBullet?.type ?? null,   // the effective type — see ResolvedSnapshot.type
    stat: statReader(effective), stats: effective, atk, hp, def,
    amp: effective[Stat.Amp]!,
    subtypeAmp: effective[SUBTYPE_AMP_INDEX]!,
    subtypeCritRate: effective[SUBTYPE_CRIT_RATE_INDEX]!,
    subtypeCritDmg: effective[SUBTYPE_CRIT_DMG_INDEX]!,
    subtypeTotalDmg: effective[SUBTYPE_TOTAL_DMG_INDEX]!,
    subtypeDamageTaken: effective[SUBTYPE_DAMAGE_TAKEN_INDEX]!,
    dmgBonus: effective[Stat.DmgBonus]!,
    enemyRes: enemyRes(),
    enemyDef: enemyDef(),
    entries: slot.entries,
    castAdds: ctx.castAdds,
    forte: [...slot.forte],
    forteBefore,
    maxForte: slot.resonator?.maxForte ?? EMPTY_FORTE,
    forteScale: slot.resonator?.forteScale ?? UNIT_FORTE,
    energy: slot.energy, concerto: slot.concerto, offtune: state.offtune,
    energyBefore, concertoBefore, offtuneBefore,
    seq: ++traceSeq,
    concertoGained,
    castUnmet,
    endsLoop,
    realEnergyBefore,
    frame: frameStart, frames, tag, active, timestopBanked, holdPaid,
    heldLocal, heldGlobal, heldEnemy,
    opensFields,
  };

  if (castSide && casting(Cast.Outro)) {
    const n = state.slots.length;
    state.active = (state.active + state.outroDir + n) % n;
  }
  return snapshot ?? result;
}

/** A press's motion stop on every inactive resonator's queued hits (`ctx.offFieldShift`, the real
 *  frames it held them past the hold already standing): each due after its cast at `from` comes
 *  that much later. Time stop moves none of them: animations play on through it. */
function shiftOffField(state: State, shift: number, from: number): void {
  for (const h of state.timed) {
    if (h.slot === state.presser || h.due <= from) continue;
    h.due += shift;
  }
  sortByDue(state.timed);
}

/** The end of a split press, where its animation (or its cut) runs out: afterAction() alone, over
 *  the roster as it stands, with no row of its own. */
function closePress(state: State, action: Action, triggered: boolean, cut: string): void {
  const slot = state.slot;
  ctx.state = state;
  ctx.slot = slot;
  ctx.act = action;
  ctx.pressCut = cut;
  phaseMask = END_PHASES;
  ctx.actFrames = 0;
  ctx.triggered = triggered;
  ctx.tagWord = tagWordOf(action);
  ctx.overrideType = null; ctx.overrideSubtype = null; ctx.droppedCast = null;
  ctx.swapLosses.clear();
  ctx.actionStamp++;
  state.expireBuffs();
  capture(slot, state);
  ctx.mutHash = 0;
  actionHook(action.afterActionFn, 5);
  runPhase(5, false);
  ctx.buff = null;
  ctx.stacks = -1;
}

/** Run a rotation across `state`, splicing in anything queue()d right after the action that
 *  queued it — each member's own action sequence, concatenated in turn order; Outro/Intro
 *  handoff and active-slot advancement happen automatically inside evaluate(). A queued
 *  follow-up runs on its own caller's slot even if the active slot has since moved on (e.g. an
 *  Outro evaluated between the queue() call and the follow-up actually running); a plain
 *  rotation entry always runs on whichever slot is active when its turn comes. */
/** One step `run()` plays. */
interface Step { action: Action; slot: number; by: HeldBuff | null; group: ActionGroup | null; end: boolean; spill: ActionGroup | null; queued: boolean; cut: ActionTag | null; at?: number; into?: Result | null; away?: boolean; losses?: Gear[]; frames?: number; closes?: boolean; triggered?: boolean; hold?: boolean; waited?: boolean; holdShift?: number; endCut?: string }

/** The steps still to play: whatever was put in front (a stack, its top playing next) ahead of the
 *  rest of the written list, walked by index — so putting a follow-up in front of the rest moves
 *  nothing already queued. */
class StepQueue {
  private front: Step[] = [];
  private at = 0;
  constructor(private readonly list: Step[]) {}
  get size(): number { return this.front.length + this.list.length - this.at; }
  peek(): Step | undefined { return this.front.length ? this.front[this.front.length - 1] : this.list[this.at]; }
  take(): Step { return this.front.length ? this.front.pop()! : this.list[this.at++]!; }
  /** `steps` next, in order, ahead of everything left. */
  unshift(steps: Step[]): void { for (let k = steps.length - 1; k >= 0; k--) this.front.push(steps[k]!); }
}

/** `until`: a flush's end — what would land after that real frame, queued on the way included, never does. */
export function run(state: State, rotation: Action[], flush = false, until = Infinity): Result[] {
  if (flush) state.drainUntil = until;
  const out: Result[] = [];
  // The steps to play (`StepQueue`): each rotation entry (`slot` -1: run on whoever is active when
  // its turn comes), and each queued follow-up put in right behind whatever queued it. An
  // ActionGroup is expanded here, before anything runs: from this point down only real casts
  // exist, and a group survives purely as the `group`/`end` tags the report reads back off each result.
  // a cancelled step plays its own Action (duck-checked, the class being rotation.ts's)
  const written: Step[] = [];
  for (const entry of rotation) {
    // a duck-check rather than `instanceof ActionGroup`: the class lives in rotation.ts, which
    // this module may only reference as types (see the import note at the top)
    const group = (entry as ActionGroup).actions !== undefined ? (entry as ActionGroup) : null;
    const members = group ? group.actions : [entry];
    for (let k = 0; k < members.length; k++) {
      const m = members[k]!;
      // a group expands one level: a cut group inside another is written cut on the outer one
      if ((m as ActionGroup).actions !== undefined) throw new Error(`${group!.name}: holds the group ${m.name} — cut the outer group instead`);
      const [a, cut] = unwrap(m);
      written.push(newStep(a, -1, null, group, group !== null && k === members.length - 1, null, false, cut));
    }
  }
  const steps = new StepQueue(written);
  ctx.insideGroup = false;
  // The group whose beat is still resolving — its own members, then the follow-ups they queued,
  // the last member's included. Every cast spliced in while this stands is that group's spill, and
  // the next rotation entry (or an engine event) clears it.
  let spillGroup: ActionGroup | null = null;
  let guard = 0;
  while (steps.size || (flush && (state.timed.length || state.behindNext.length))) {
    if (++guard > 10000) throw new Error("action queue did not drain");
    // the fight's end: nothing is coming to cast behind, so what waited for it is cast now — and
    // whatever would land past the end is dropped as it is queued
    if (flush && until < Infinity) {
      state.timed = state.timed.filter((h) => h.due <= until);
      state.behindNext = state.behindNext.filter((b) => b.at <= until);
      if (!steps.size && !state.timed.length && !state.behindNext.length) break;
    }
    if (flush && !steps.size && state.behindNext.length) {
      steps.unshift(state.behindNext.splice(0).map((b) => newStep(b.action, b.slot, b.by, null, false, null, true, null, b.at)));
    }
    // whatever is already queued plays before the clock moves on, but what waits out the press
    // playing (`ActionDef.afterPlay`)
    const ahead = steps.peek();
    const walking = ahead?.queued && !waitsPlay(ahead) ? state.real < state.playsTo : walk(state, steps, spillGroup);
    // a flush's end plays out what is left on the clock a frame at a time, in its own order
    const draining = flush && !steps.size;
    let first = 0;
    if (draining) {
      first = Infinity;
      for (const h of state.timed) first = Math.min(first, h.due);
    }
    // a hit on the clock whose time has come lands before the next cast, at its own frame — but one
    // landing off field (an Outro's, an insta swap's) due on the very frame the next press starts
    // lands after it, so the incoming Intro is cast first
    let anyDue = false;
    for (let k = 0; k < state.timed.length; k++) {
      if (!isDue(state.timed[k]!, draining, first, state.real, walking)) continue;
      anyDue = true;
      break;
    }
    if (anyDue) {
      const due: Timed[] = [], kept: Timed[] = [];
      for (const h of state.timed) (isDue(h, draining, first, state.real, walking) ? due : kept).push(h);
      sortByDue(due);
      state.timed = kept;
      // one landing mid-group is that group's spill, like any follow-up there, so its row stays whole
      const spill = ctx.insideGroup ? spillGroup : null;
      const landed: Step[] = [];
      for (const h of due) {
        if (h.action) {
          landed.push(newStep(h.action, h.slot, h.by, null, false, spill, true, null, h.due, h));
          continue;
        }
        // a function on the clock (a heal tick's, a kit's scheduled one) runs on its slot at its
        // frame, no row of its own — and what it queues plays there
        const now = state.real;
        state.setReal(h.due);
        ctx.state = state;
        ctx.slot = state.slots[h.slot]!;
        h.apply?.();
        state.setReal(Math.max(now, draining ? h.due : state.real));
        for (const q of pendingQueue) landed.push(newStep(q.action, q.slot, q.by, null, false, q.event ? null : spillGroup, true, null, h.due));
        pendingQueue.length = 0;
      }
      steps.unshift(landed);
    }
    if (!steps.size) continue;
    // a rotation press waits for the last one to finish playing: the walk only stopped short of it
    // to land what fell due on the way
    const up = steps.peek()!;
    if ((!up.queued || waitsPlay(up)) && state.real < state.playsTo) continue;
    const step = steps.take();
    // the fight is over at its end: nothing is cast past it (a break queued behind the last outro) —
    // but one cast by then that can't be swapped out of plays out, and the end waits for it
    if (step.at === undefined ? state.real > until : step.at > until) continue;
    const unswappable = flush && until < Infinity && step.action.afterPlay && step.action.half === null;
    if (step.closes) {
      const now = state.real, field = state.onField, before = state.active;
      state.active = step.slot;
      state.setReal(step.at!);
      if (step.away) state.onField = -1;
      ctx.pressFrames = step.frames ?? 0;
      ctx.pressStart = step.into?.realStarts ?? state.real;
      ctx.nextStep = steps.peek()?.action ?? null;
      closePress(state, step.action, !!step.triggered, step.endCut ?? "");
      if (ctx.dashReplaced) dropDash(steps, step.into);
      if (step.losses) for (const gear of step.losses) state.slots[step.slot]!.revoke(gear);
      state.setReal(Math.max(now, state.real));
      state.onField = field;
      state.active = before;
      if (pendingQueue.length) takeQueued(steps, spillGroup, step.at);
      continue;
    }
    // A new resonator's first press pays the swap: SWAP_DELAY on the clock, charged to the row that
    // handed the field over. The buff clocks run through them, and what a tick queues there plays
    // ahead of the press.
    if (!step.queued && !step.hold && state.presser >= 0 && state.presser !== state.active) {
      // a kit that keeps the field waiting (`ResonatorDef.holdBefore`) has the one leaving wait on
      // a row of their own before the swap — an Outro's was asked ahead of the Outro itself
      const holdFn = state.slot.resonator?.holdFn;
      if (holdFn && step.slot < 0) {
        ctx.state = state;
        ctx.slot = state.slot;
        const hold = holdFn(step.action);
        if (hold) {
          steps.unshift([newStep(hold, state.presser, null, null, false, null, false, null, undefined, null, true), step]);
          continue;
        }
      }
      if (state.swapPaid) {
        // an Outro handed over: the swap was paid before it
        state.swapPaid = false;
        state.swapRow = null;
        state.presser = state.active;
        steps.unshift([step]);
        continue;
      }
      if (state.swapRow) state.swapRow.swapFrames = (state.swapRow.swapFrames ?? 0) + SWAP_DELAY;
      state.swapRow = null;
      state.presser = state.active;
      state.playsTo = state.real + SWAP_DELAY;
      steps.unshift([step]);
      continue;
    }
    // the field is whoever makes the next press: a swap hands nothing over, the next press takes it
    if (!step.queued && !step.hold) {
      state.onField = state.active;
      state.presser = state.active;
    }
    spillGroup = step.group ?? step.spill;
    // A follow-up spliced in between two members is still *inside* the group, so this only moves on
    // a member's own row: set on every member but the last, cleared by the last. That is what lets
    // the bar fill part-way through a group and still break only on the cast that ends it.
    if (step.group) ctx.insideGroup = !step.end;
    const before = state.active;
    if (step.slot >= 0) state.active = step.slot;
    // A marker that gates the entry after it rather than standing for a cast (rotation.ts's own
    // EVERY_OTHER): it never lands itself, and a skip swallows the whole group where the entry it
    // gates is one. Read through the same "current" pointers as any other marker.
    if (step.action.skipNextFn) {
      ctx.state = state;
      ctx.slot = state.slot;
      if (step.action.skipNextFn()) {
        const gated = steps.size ? steps.take() : undefined;
        if (gated?.group) while (steps.size && steps.peek()!.group === gated.group) steps.take();
      }
      continue;
    }
    let action: Action | null = step.action;
    if (step.action.resolveFn) {
      // a marker reads state via the "current" pointers, same as any other kit logic — evaluate()
      // sets them again immediately after anyway, so no save/restore needed here
      ctx.state = state;
      ctx.slot = state.slot;
      action = resolving(step.action.resolveFn);
      // resolved to no cast at all this step (deferred onto a later one — see `queueOnIntro()`)
      if (!action) continue;
    }
    // An Outro waits, on the outgoing member and as one row, for whichever is longer: a kit that
    // keeps the field waiting (`ResonatorDef.holdBefore`), or the incoming visit reaching a cooldown
    // not back yet — so the press it gates lands ready rather than idling inside that visit. The
    // Outro comes round again after it, the cooldowns never asked twice — what the wait plays can
    // shift what the incoming visit would reach, and one wait is the whole hold — but a kit's hold
    // is, for whatever started behind what it waited out (Hecate's next enhanced attack).
    if (step.slot < 0 && isCast(action, Cast.Outro)) {
      // the visit this really opens: the next slot along, or with a double Intro in the team the one
      // this visit was seen to hand to (none the first time round)
      const next = state.successor ? state.successorOf(state.slot.visitChain!) : null;
      const to = state.successor ? next?.slot ?? -1 : (state.active + state.outroDir + state.slots.length) % state.slots.length;
      const into = to >= 0 ? state.slots[to]!.resonator : null;
      ctx.state = state;
      ctx.slot = state.slot;
      const hold = into?.holdFn && into.intro ? into.holdFn(into.intro) : null;
      // read at where the Outro would be cast: a hit landing mid-wait stops the clock short of it,
      // and the swap delay still to pay comes first
      const castAt = Math.max(state.real, state.playsTo) + (state.swapPaid ? 0 : SWAP_DELAY), gameAt = state.gameOf(castAt);
      // with no wait, time stop still standing carries into the visit; a wait plays through it
      // instead, the game timer standing still, so it runs that much longer in real frames and the
      // visit gets none (a kit's hold is in real frames already)
      const bank = state.frozenAhead(castAt);
      const planned = to >= 0 ? state.plannedGates?.(to, next?.visit ?? null) ?? null : null;
      const shortBanked = to >= 0 && state.handoffWaits ? state.slots[to]!.handoffShortfall(state.slot.visitChain, gameAt, planned, bank) : null;
      const short = shortBanked && bank ? state.slots[to]!.handoffShortfall(state.slot.visitChain, gameAt, planned) ?? shortBanked : shortBanked;
      // a cooldown's wait is on the game timer, a kit's hold on the real one
      const wait = step.waited ? hold
        : short && (!hold || short.frames + bank > hold.animFrames) ? short.cd.wait(short.frames, short.press) : hold;
      if (wait) {
        step.waited = true;
        steps.unshift([newStep(wait, -1, null, null, false, null, false, null), step]);
        continue;
      }
      // the swap out is paid on the way off, by the outgoing member's own last press, and the
      // Outro it triggers is cast once it has played — the Outro never carries the delay
      if (!state.swapPaid) {
        if (state.lastOwn) state.lastOwn.swapFrames = (state.lastOwn.swapFrames ?? 0) + SWAP_DELAY;
        state.playsTo = Math.max(state.real, state.playsTo) + SWAP_DELAY;
        state.swapPaid = true;
        steps.unshift([step]);
        continue;
      }
    }
    // a rotation entry with no charge left waits it out on a row of its own, spliced in ahead of
    // it so whatever the wait queues runs first, and then comes round again
    if (step.slot < 0 && action.cooldown) {
      ctx.state = state;
      ctx.slot = state.slot;
      state.slot.noteGate(action.cooldown, state.gameOf(Math.max(state.real, state.playsTo)), action.name, step);
      const cd = state.slot.cooldownAt(action.cooldown, state.frame);
      if (cd.charges <= 0) {
        steps.unshift([newStep(action.cooldown.wait(cd.next - state.frame, action.name), -1, null, null, false, null, false, null), step]);
        continue;
      }
      state.slot.spendCooldown(action.cooldown, state.frame, action.cooldownFrames || undefined);
    }
    if (pendingQueue.length) pendingQueue.length = 0;
    // "not really this resonator's own turn" rows the report dims: a follow-up the engine itself
    // queued (Phrolova's Hecate procs, Cantarella's Jolt, ...), a rotation marker or a cast that
    // declares itself one (a `.swap()` form), and an outro (a handoff, not an attack).
    // An engine-level event is not one by virtue of being an event — `queueEvent` says where a cast
    // lands and on whom, not whose press it is (Hiyuki's Stage 3 is an event *and* a press of her
    // own). A Tune Break declares itself one instead, the way the markers do, so every per-action
    // clock passes it over without knowing it by name — see tunebreak.ts.
    // Handed to evaluate() rather than stamped on the result after: gear reacting mid-action
    // needs it too (tunebreak.ts's own watcher won't auto-fire off one) — see triggeredAction().
    // A summon echo is a press of its wearer like any other, its own 8 frames.
    const ms = state.slot.mainslot;
    const uncut = !!ms && action === ms.onfield && !!step.cut && !action.cutPays(step.cut);
    const by = step.by;
    // a FIELD press, or anything with a source to name, is nobody's press
    const triggered = action.tag === ActionTag.Field || by !== null;
    // a dash the next press stops time on is cut short by it, an insta cancel that keeps its hit;
    // a marker there resolves only when reached, so it is taken as stopping nothing
    const nextPress = steps.peek()?.action;
    const dash = (step.action as unknown as DashMarker).after !== undefined && !!nextPress && !nextPress.resolveFn && nextPress.timestop > 0;
    // an echo whose cut frees its wearer no sooner plays whole (`Action.cutPays`)
    let cut = uncut ? null : dash ? ActionTag.InstaCancel : step.cut;
    const pressed = action;
    if (cut && !dash) [action, cut] = action.cutAs(cut);
    const kind = cut ?? action.tag;
    const checked = !dash && action.half === null;
    if (checked && LENGTH_CHECKED.has(kind)) checkCutLength(pressed.cancelOf ?? pressed, kind);
    // a marker resolving to presses of either kind can't be written insta for the hitless one alone
    const cutAt = kind === ActionTag.SwapCancel ? action.swapCutFrame : action.cutFrame;
    if (checked && !step.action.resolveFn && SLOW_CUTS.has(kind) && cutAt <= INSTA_DELAY) {
      throw new Error(`${action.name}: cuts at frame ${cutAt}, inside an insta cut's ${INSTA_DELAY} — write it as ${INSTA_OF[kind as ActionTag]} instead of ${kind}`);
    }
    // a press that takes time casts now and queues each hit on the time-ordered queue at its own
    // frame, and its end where it runs out
    const whole = action;
    const splits = whole.splitsHit(cut);
    const castAt = step.at ?? state.real, away = splits && whole.hitsAway(cut);
    let split: Timed[] | null = null;
    if (splits) {
      split = [];
      for (let k = 0; k < whole.bullets.length; k++) split.push(timedEntry(castAt + whole.hitDelay(k), whole.hitPart(k), state.active, null, away, undefined, undefined, 0, undefined, false));
    }
    if (split) {
      for (const h of split) insertByDue(state.timed, h);
      action = action.castPart();
    }
    // an Outro hands the field on as it is cast
    const n = state.slots.length, next = (state.active + state.outroDir + n) % n;
    if (isCast(action, Cast.Outro) && action.half !== "hit") {
      state.onField = next;
      const handoff = state.gameOf(Math.max(state.real, state.playsTo));
      state.slots[next]!.arrive(state.slots[state.active]!.visitChain, handoff);
      state.lastHandoff = { from: state.slots[state.active]!.visitChain, at: handoff };
    }
    // a landing hit is played at its own frame, then the clock goes back to where the fight is —
    // a split one off field whoever holds it: its owner left on the press it split from
    const now = state.real, field = state.onField;
    if (step.at !== undefined) state.setReal(step.at);
    if (step.away) state.onField = -1;
    ctx.pressFrames = step.frames ?? 0;
    ctx.pressStart = step.into?.realStarts ?? state.real;
    // a hold cancel holds into the next press, read as it stands now
    if (cut === ActionTag.HoldCancel) {
      const after = steps.peek()?.action ?? null;
      ctx.holdNext = after?.resolveFn ? resolving(after.resolveFn) : after;
    }
    ctx.nextStep = steps.peek()?.action ?? null;
    const result = evaluate(state, action, triggered, by, cut);
    ctx.holdNext = null;
    const dashEnded = ctx.dashReplaced ? dropDash(steps, result) : false;
    if (unswappable) state.drainUntil = until = Math.max(until, state.playsTo);
    const motionAdd = ctx.offFieldShift, stamp = ctx.actionStamp;
    // ...and a bullet it let go of before its commit never lands
    if (ctx.holdCut >= 0) {
      if (split) {
        split = split.filter((h, k) => {
          if (whole.bullets[k]!.commitFrame <= ctx.holdCut) return true;
          state.timed.splice(state.timed.indexOf(h), 1);
          return false;
        });
      }
      ctx.holdCut = -1;
    }
    // cast behind a press that stopped motion on its frame, it is held by that the way everything
    // off field already playing was
    if (split && step.holdShift) {
      for (const h of split) h.due += step.holdShift;
      sortByDue(state.timed);
    }
    // what this evaluation dealt, at the frame it landed: what the rotations' damage is summed from
    if (result.avg !== 0 || result.variantAvg) state.hits.push({ at: result.starts, slot: result.slot, member: result.member, avg: result.avg, variantAvg: result.variantAvg });
    if (ctx.offFieldShift !== 0) shiftOffField(state, ctx.offFieldShift, Math.max(now, ctx.offFieldFrom));
    // each hit carries its press's length, and the end — where what a swap cancel loses goes — is
    // where the press runs out, never ahead of a hit it committed
    if (split) {
      for (const h of split) {
        h.frames = ctx.actFrames;
        h.triggered = triggered;
      }
      let last = castAt;
      for (const h of split) last = Math.max(last, h.due);
      const runs = whole.castsInstantly ? whole.animFrames : ctx.actReal;
      const end = timedEntry(
        Math.max(last, castAt + runs + (step.holdShift ?? 0)), whole.endPart(), state.active, null, away, undefined,
        ctx.swapLosses.size ? [...ctx.swapLosses] : undefined, ctx.actFrames, true, triggered,
      );
      end.cut = kind;
      insertByDue(state.timed, end);
    }
    if (step.at !== undefined) {
      state.setReal(Math.max(now, state.real));
      state.onField = field;
    }
    if (step.into) {
      landHit(step.into, result, result.starts);
    } else {
      result.group = step.group;
      result.groupEnd = step.end || dashEnded;
      if (dashEnded) result.dashDropped = true;
      result.groupSpill = step.spill;
      result.queued = step.queued;
      // one row stands for the whole press, in cast order: each hit adds itself in as it lands
      if (split) {
        for (const h of state.timed) if (h.action?.formOf === whole && h.into === null) h.into = result;
        result.action = whole;
      }
      out.push(result);
      // the row the next resonator's swap frames go on: a swap-out press (an Outro's are paid
      // ahead of it, on `lastOwn`)
      const tag = cut ?? action.tag;
      const swaps = tag === ActionTag.SwapCancel || tag === ActionTag.InstaSwap;
      if (swaps) state.swapRow = result;
      if (!step.queued && !triggered && !isCast(action, Cast.Outro)) state.lastOwn = result;
    }
    // a queued follow-up's own turn doesn't stick — restore whoever was actually active,
    // unless the follow-up was itself an outro (genuinely advances the team)
    if (step.slot >= 0 && state.active === step.slot) state.active = before;

    if (pendingQueue.length) {
      // spliced in right after the action that queued them, i.e. at the read cursor. A follow-up
      // is never one of the casts a group names, whatever it was queued from; it belongs to
      // whatever beat spawned it — an engine event to nobody (`queueEvent`)
      const queued: Step[] = [];
      // a follow-up lands with whatever queued it: a hit at its own frame (a tick's, a queued hit's),
      // a cast at its cast, a whole press at its hit rather than after the rest of its frames
      const from = split ? result.realStarts : result.ends;
      const at = step.at ?? (from < state.real ? from : undefined);
      for (const p of pendingQueue) queued.push(newStep(p.action, p.slot, p.by, null, false, p.event ? null : spillGroup, true, null, at));
      steps.unshift(queued);
      pendingQueue.length = 0;
    }
    // what waited for the next rotation press is cast right behind it, on its own frame
    // (`queueOnBehindNext()`) — never behind the press that queued it
    if (state.behindNext.length && !step.queued && !triggered && step.slot < 0) {
      const held: Step[] = [];
      state.behindNext = state.behindNext.filter((b) => {
        if (b.stamp >= stamp) return true;
        const s = newStep(b.action, b.slot, b.by, null, false, null, true, null, b.at);
        s.holdShift = motionAdd;
        held.push(s);
        return false;
      });
      if (held.length) steps.unshift(held);
    }
  }
  return out;
}

/** The cuts that play up to the cut frame (`cutFrame`) — pointless on a press whose cut frame an
 *  insta cut (6f) already reaches, so writing one there throws. */
const SLOW_CUTS = new Set<string>([ActionTag.Cancel, ActionTag.MashCancel, ActionTag.DodgeCancel, ActionTag.JumpCancel, ActionTag.SwapCancel]);
/** What each of those is written as instead, cut insta. */
const INSTA_OF: Partial<Record<ActionTag, string>> = {
  [ActionTag.Cancel]: ".instaCancel()", [ActionTag.MashCancel]: ".instaCancel()", [ActionTag.HoldCancel]: ".instaCancel()", [ActionTag.DodgeCancel]: ".instaDodge()",
  [ActionTag.JumpCancel]: ".instaJump()", [ActionTag.SwapCancel]: ".instaSwap()",
};

/** The cuts weighed against the press they cut (`checkCutLength()`) — not an insta swap, which
 *  may run past a short press. */
const LENGTH_CHECKED = new Set<string>([ActionTag.Cancel, ActionTag.MashCancel, ActionTag.HoldCancel, ActionTag.DodgeCancel, ActionTag.InstaDodge, ActionTag.JumpCancel, ActionTag.InstaJump, ActionTag.InstaCancel, ActionTag.SwapCancel]);

/** A cut whose input timing runs longer than the press played out only made it longer — raw
 *  frames, time stop and all; the dash or jump itself isn't counted. An unmeasured press has none. */
function checkCutLength(base: Action, kind: ActionTag): void {
  if (!base.animFrames) return;
  const c = base.cost(kind), cut = c.action + c.global;
  if (cut > base.animFrames) throw new Error(`${base.name}: its ${kind} takes ${cut} frames, longer than the ${base.animFrames} it plays uncut`);
}

/** What a queued hit's row keeps of its cast when a hit lands: who pressed it, how and when, and
 *  the gauges it walked in with. The damage and motion value sum across its hits; the stats, buffs
 *  and gauge readings are the last one's — what the bars held once its last bullet was in. */
const CAST_KEEPS = new Set(["action", "member", "slot", "triggered", "group", "groupEnd", "groupSpill", "source", "queued",
  "frame", "realStarts", "frames", "tag", "active", "timestopBanked", "holdPaid", "endsLoop", "castUnmet", "realEnergyBefore",
  "energyBefore", "concertoBefore", "offtuneBefore", "forteBefore", "castGain", "castAdds", "seq", "gaugeLog"]);

/** One step of a press — its cast, or one of its hits — and what it moved: energy, concerto,
 *  off-tune, forte 1-5. */
export interface GaugeStep { seq: number; delta: number[] }
let traceSeq = 0;
// a forte gain on a bar left below 0 starts it from 0, so what that step banked is where it ended;
// concerto below empty floors at 0 on a step that spends none, which is no gain of its own
const gaugeDelta = (r: ResolvedSnapshot): number[] => [
  r.energy - r.energyBefore,
  r.concertoBefore < 0 && r.concerto === 0 ? r.concertoGained : r.concerto - r.concertoBefore,
  r.offtune - r.offtuneBefore,
  ...r.forte.map((f, i) => (r.forteBefore[i]! < 0 && f > r.forteBefore[i]! ? f : f - r.forteBefore[i]!)),
];

/** The gauges each row shows (`shownBefore`/`shownAfter`): the bars as the press was cast, plus
 *  every hit still to land of a press cast before it, then plus every step of its own that lands —
 *  with nothing cast after it counted, whatever order the hits came in. Off-tune is the team's,
 *  the rest each member's own. */
export function settleGauges(rows: ResolvedSnapshot[]): void {
  const stepsOf = (r: ResolvedSnapshot): GaugeStep[] => r.gaugeLog ?? [{ seq: r.seq, delta: gaugeDelta(r) }];
  // only a press with a step after some later cast can be in flight then
  const open = rows.filter((r) => stepsOf(r).some((st) => st.seq > r.seq));
  for (const r of rows) {
    const before = [r.energyBefore, r.concertoBefore, r.offtuneBefore, ...r.forteBefore];
    for (const x of open) {
      if (x === r || x.seq > r.seq) continue;
      for (const st of stepsOf(x)) {
        if (st.seq <= r.seq) continue;
        for (let i = 0; i < before.length; i++) if (i === 2 || x.member === r.member) before[i]! += st.delta[i]!;
      }
    }
    // a forte bar left below empty is clamped back to 0 by its member's cast, or by a gain landing
    for (let i = 3; i < before.length; i++) if (before[i]! < 0 && (r.action.cast !== null || r.action.resetForte[i - 3])) before[i] = 0;
    const after = before.slice();
    for (const st of stepsOf(r)) {
      for (let i = 0; i < after.length; i++) {
        if (i >= 3 && st.delta[i]! > 0 && after[i]! < 0) after[i] = 0;
        after[i]! += st.delta[i]!;
      }
    }
    r.shownBefore = before;
    r.shownAfter = after;
  }
}

/** Walk the clock toward where the last press ends, stopping at the first queued hit due before
 *  then: the timers run up to it, and it lands there. True while the walk is still short of its end. */
function walk(state: State, steps: StepQueue, spillGroup: ActionGroup | null): boolean {
  while (state.real < state.playsTo) {
    // the earliest due: a tick's hits join the queue unsorted
    let next = Infinity;
    for (const h of state.timed) next = Math.min(next, h.due);
    const from = state.real;
    // a stop starting ahead (mid-press) ends the stretch there, so each one stands from its start
    const ahead = Math.min(state.nextFreezeAfter(from), state.motionFrom > from ? state.motionFrom : Infinity);
    const to = Math.min(next < state.playsTo ? Math.max(from, next) : state.playsTo, ahead);
    // the clocks run on the game timer, which time stop stands still from `from` to where it
    // thaws; an off-field one also loses whatever of the rest motion stop still holds
    const thaw = Math.min(to, from + state.frozenFrom(from)), gameFrom = state.frame;
    const stop = Math.max(0, Math.min(to, state.motionUntil) - Math.max(thaw, state.motionFrom));
    ctx.state = state;
    ctx.slot = state.slot;
    state.runTicks(gameFrom, state.gameOf(to), stop, (game) => thaw + game - gameFrom);
    state.setReal(to);
    state.expireBuffs();
    if (pendingQueue.length) takeQueued(steps, spillGroup, undefined);
    if (to < state.playsTo) return true;
  }
  return false;
}

/** A press whose dodge something took the place of (`replaceNextDash()`): the dodge step goes, the
 *  group it closed closing on the press instead, and the press's row reads the cut it became. */
function dropDash(steps: StepQueue, row: Result | null | undefined): boolean {
  const dash = steps.peek();
  let ends = false;
  if (dash && (dash.action as unknown as DashMarker).after !== undefined) {
    steps.take();
    ends = dash.end;
    if (ends) ctx.insideGroup = false;
  }
  if (row) {
    (row as unknown as { tag: string }).tag = ctx.dashReplaced;
    if (ends) {
      row.groupEnd = true;
      row.dashDropped = true;
    }
  }
  ctx.dashReplaced = "";
  return ends;
}

/** A queued cast that waits out the press playing (`ActionDef.afterPlay`) — the cast, not its parts. */
const waitsPlay = (step: Step): boolean => step.action.afterPlay && step.action.half === null;

/** What the last hook queued (`pendingQueue`), put in front of the steps — at `at` where given. */
function takeQueued(steps: StepQueue, spillGroup: ActionGroup | null, at: number | undefined): void {
  const queued: Step[] = [];
  for (const q of pendingQueue) {
    const spill = q.event ? null : spillGroup;
    queued.push(newStep(q.action, q.slot, q.by, null, false, spill, true, null, at));
  }
  steps.unshift(queued);
  pendingQueue.length = 0;
}

/** A step with every field set, in one order — `run()` then reads one shape. `from`: the clock entry it
 *  lands off, whose own fields it carries. */
function newStep(
  action: Action, slot: number, by: HeldBuff | null, group: ActionGroup | null, end: boolean, spill: ActionGroup | null, queued: boolean,
  cut: ActionTag | null, at: number | undefined = undefined, from: Timed | null = null, hold = false,
): Step {
  return {
    // one cast once the press playing has run out goes where the clock then is
    action, slot, by, group, end, spill, queued, cut, at: action.afterPlay && !from ? undefined : at,
    into: from ? from.into : undefined, away: from ? from.away : undefined, losses: from ? from.losses : undefined,
    frames: from ? from.frames : undefined, closes: from ? from.closes : undefined, triggered: from ? from.triggered : undefined, endCut: from?.cut,
    hold, waited: false,
  };
}

/** A cancelled step plays its own Action (duck-checked, the class being rotation.ts's). */
function unwrap(a: Action): [Action, ActionTag | null] {
  return (a as CancelledStep).of !== undefined ? [(a as CancelledStep).of, (a as CancelledStep).kind] : [a, null];
}

/** The clock entry that lands an Outro's queued buffs on the Intro's QTE frame `due`. */
function outroLanding(state: State, slot: TeamMember, due: number): Timed {
  const land = (): void => {
    for (const gear of state.outroQueue.splice(0)) slot.addStack(gear, 1);
  };
  return timedEntry(due, null, state.active, null, undefined, land, undefined, undefined, undefined, undefined);
}

/** The popover's three rosters (`heldPools`), named at the counts the stat phases ran with. */
function heldRosters(state: State, slot: TeamMember, heldPools: (readonly [Gear, number, number])[][]): [HeldBuff[], HeldBuff[], HeldBuff[]] {
  const frozen = new Map<Gear, number>();
  for (let q = 0; q < 3; q++) {
    const list = capList[q]!, counts = capCounts[q]!, hooks = capHooks[q]!;
    for (let p = 0; p < PHASE_COUNT; p++) for (const k of hooks[p]!) frozen.set(list[k]!, counts[k]!);
  }
  // Gear with no hook at all is in none of those phase lists and so in no freeze, and falls back
  // to the count captured alongside it in `heldPools` — its own pool's, at the same moment the
  // phases captured theirs — a global or enemy Gear is never in `slot.stacks` to begin with.
  const describe = ([g, n, left]: readonly [Gear, number, number]): HeldBuff => {
    ctx.buff = g;
    ctx.stacks = frozen.get(g) ?? n;
    return { name: g.toString(), source: state.sourceOf.get(g) ?? "", left };
  };
  // nameless gear is engine machinery someone's setup put there, not a buff a kit put up
  // (tunebreak.ts's own watcher), so it belongs in no popover — same exclusion equipped gear gets
  const named = (b: HeldBuff): boolean => b.name !== "";
  return [
    heldPools[0]!.filter(([g]) => !slot.equipped.has(g) && !g.hidden).map(describe).filter(named),
    heldPools[1]!.filter(([g]) => !g.hidden).map(describe).filter(named),
    heldPools[2]!.filter(([g]) => !state.enemy.equipped.has(g) && !g.hidden).map(describe).filter(named),
  ];
}

const statReader = (row: StatRow) => (k: Stat | EnemyStat): number => row[k]!;

/** Whether a queued hit lands now: `run()`'s test, its loop state passed in. */
function isDue(h: Timed, draining: boolean, first: number, frame: number, walking: boolean): boolean {
  return draining ? h.due <= first : h.due < frame || (h.due === frame && (walking || !h.away));
}

/** Gauges read as held, for a slot with no resonator. */
const UNIT_FORTE: [number, number, number, number, number] = [1, 1, 1, 1, 1];
/** A bar with no cap, for a slot with no resonator. */
const NO_CAP: readonly number[] = [0, 0, 0, 0, 0];

function anyNonZero(list: number[]): boolean {
  for (let i = 0; i < list.length; i++) if (list[i] !== 0) return true;
  return false;
}

/** One row's average damage for `action` — a variant's, off its own totals. */
function avgOf(action: Action, eff: StatRow): number {
  return damageAvgOf(
    action, eff,
    foldStat(eff, Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk),
    foldStat(eff, Stat.BaseHp, Stat.BonusHp, Stat.FlatHp),
    foldStat(eff, Stat.BaseDef, Stat.BonusDef, Stat.FlatDef),
    eff[Stat.Amp]!, eff[SUBTYPE_AMP_INDEX]!, eff[Stat.DmgBonus]!,
    eff[SUBTYPE_CRIT_RATE_INDEX]!, eff[SUBTYPE_CRIT_DMG_INDEX]!,
    eff[SUBTYPE_TOTAL_DMG_INDEX]!, eff[SUBTYPE_DAMAGE_TAKEN_INDEX]!,
    enemyRes(), enemyDef(),
  );
}

/** Add one of a split press's hits, landed at `at`, into its cast row. */
function landHit(row: Result, hit: Result, at: number): void {
  // the first hit replaces what the cast dealt; each after it adds on
  const summed = row.hitAt !== undefined, avg = row.avg, mv = row.mv, variantAvg = row.variantAvg;
  if (ctx.tracing) {
    const r = row as unknown as Record<string, unknown>, h = hit as unknown as Record<string, unknown>;
    const fields = r.opensFields as ActionField[] | undefined;
    const steps = (r.gaugeLog as GaugeStep[] | undefined) ?? [{ seq: r.seq as number, delta: gaugeDelta(row as ResolvedSnapshot) }];
    steps.push({ seq: h.seq as number, delta: gaugeDelta(hit as ResolvedSnapshot) });
    for (const k of Object.keys(h)) if (!CAST_KEEPS.has(k)) r[k] = h[k];
    r.gaugeLog = steps;
    if (fields) r.opensFields = [...fields, ...(h.opensFields as ActionField[])];
  } else {
    // a lean row carries only these past what it keeps of its cast
    row.mv = hit.mv;
    row.avg = hit.avg;
    row.variantAvg = hit.variantAvg;
    row.starts = hit.starts;
    row.ends = hit.ends;
  }
  if (summed) {
    row.avg += avg;
    row.mv += mv;
    if (row.variantAvg && variantAvg) row.variantAvg = row.variantAvg.map((v, n) => v + variantAvg[n]!);
  }
  row.hitAt = at;
}

/** Build a variant's row for the action being evaluated: `from` copied, then every index its
 *  main-stat piece moves (`diff`, see `VariantAt`) recomputed from `pre` plus the variant's own base, plus the
 *  journaled writes `[k0, k1)` to that index in order — exactly the additions a run wearing it makes. */
function sparseRow(diff: number[], vbase: StatRow, eff: StatRow, from: StatRow, pre: StatRow, k0: number, k1: number): void {
  eff.set(from);
  chainJournal();
  const value = replay.value;
  for (let d = 0; d < diff.length; d++) {
    const i = diff[d]!;
    let x = pre[i]! + vbase[i]!;
    for (let k = chainHeadOf(i); k >= 0 && k < k1; k = chainNext[k]!) if (k >= k0) x = x + value[k]!;
    eff[i] = x;
  }
}

/** The journal's writes per stat index, linked in order (`chainNext`), rebuilt whenever it has grown
 *  or a new action started it — so a variant's few indices walk their own writes, not every one. */
let chainNext = new Int32Array(256);
const chainHead = new Int32Array(64), chainHeadKey = new Int32Array(64);
let chainKey = 0, chainLen = -1, chainStamp = -1;
function chainJournal(): void {
  const n = replay.length;
  if (chainStamp === ctx.readStamp && chainLen === n) return;
  chainStamp = ctx.readStamp;
  chainLen = n;
  chainKey++;
  if (chainNext.length < n) chainNext = new Int32Array(n * 2);
  const index = replay.index;
  for (let k = n - 1; k >= 0; k--) {
    const i = index[k]!;
    chainNext[k] = chainHeadKey[i] === chainKey ? chainHead[i]! : -1;
    chainHead[i] = k;
    chainHeadKey[i] = chainKey;
  }
}
const chainHeadOf = (i: number): number => (chainHeadKey[i] === chainKey ? chainHead[i]! : -1);

const RESOURCE_LIST = Int32Array.from(RESOURCE_STATS);

/** Per scaling, the row indices `damageAvgOf` reads: a variant moving none of them deals what the
 *  real build deals. */
const DAMAGE_READS: boolean[][] = (() => {
  const atk = [Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk], hp = [Stat.BaseHp, Stat.BonusHp, Stat.FlatHp], def = [Stat.BaseDef, Stat.BonusDef, Stat.FlatDef];
  const never = [Stat.ER, Stat.HealingBonus, Stat.HealingReceived, BASIC_DMG_BONUS_INDEX, ...RESOURCE_STATS];
  const reads = (...skip: number[]): boolean[] => {
    const row = Array.from(ZERO_STATS, () => true);
    for (const i of [...never, ...skip]) row[i] = false;
    return row;
  };
  return [reads(...hp, ...def), reads(...atk, ...def), reads(...atk, ...hp), reads(...atk, ...hp, ...def), reads(...atk, ...hp, ...def),
    Array.from(ZERO_STATS, () => false)];
})();

const patchAt: number[] = [], patchWas: number[] = [];

/** A pure variant's damage on the action being evaluated, without building its row: the indices its
 *  main-stat piece moves (`diff`) are worked out exactly as `sparseRow` would, and where one the
 *  formula reads differs they are put into the real build's finished row `from` for the formula and
 *  taken back out. NaN where it deals what the real build deals. Marks the variant unsafe where a
 *  resource index moved, as `resourceMoved` does. */
function scoreVariant(slot: TeamMember, v: number, action: Action, diff: number[], vbase: StatRow, from: StatRow, pre: StatRow, k1: number): number {
  chainJournal();
  const value = replay.value;
  const reads = action.scaling === null ? null : DAMAGE_READS[action.scaling]!;
  let moved = false, dealt = false;
  for (let d = 0; d < diff.length; d++) {
    const i = diff[d]!;
    let x = pre[i]! + vbase[i]!;
    for (let k = chainHeadOf(i); k >= 0 && k < k1; k = chainNext[k]!) x = x + value[k]!;
    patchAt[d] = x;
    if (x !== from[i]) {
      if (RESOURCE_MASK[i]) moved = true;
      if (reads !== null && reads[i]) dealt = true;
    }
  }
  if (moved) slot.variantUnsafe[v] = true;
  // nothing it deals moves, or a hit of no motion value at all: the real build's figure
  if (!dealt || (action.mv === 0 && from[Stat.AddMv] === 0 && !diff.includes(Stat.AddMv))) return NaN;
  for (let d = 0; d < diff.length; d++) {
    const i = diff[d]!;
    patchWas[d] = from[i]!;
    from[i] = patchAt[d]!;
  }
  const avg = avgOf(action, from);
  for (let d = 0; d < diff.length; d++) from[diff[d]!] = patchWas[d]!;
  return avg;
}

/** Whether a variant's row banks a resource differently from the real build's `from` — only its
 *  own moved indices (`diff`) can, every other one being a copy. */
function resourceMoved(diff: number[], eff: StatRow, from: StatRow): boolean {
  for (let d = 0; d < diff.length; d++) { const i = diff[d]!; if (RESOURCE_MASK[i] && eff[i] !== from[i]) return true; }
  return false;
}

const RESOURCE_MASK: boolean[] = Array.from(ZERO_STATS, () => false);
for (const s of RESOURCE_STATS) RESOURCE_MASK[s] = true;

const ADD_FORTE = [Stat.AddForte1, Stat.AddForte2, Stat.AddForte3, Stat.AddForte4, Stat.AddForte5];

const capList: Gear[][] = [[], [], []];
const capCounts: number[][] = [[], [], []];
const capHooks: number[][][] = [[], [], []];
const capFns: (() => void)[][][] = [[], [], []];

/** Take the three pools as they stand right now, for the phases that follow to run on. A Gear is
 *  only ever in one pool — a self buff is local, a team buff global, a debuff on the enemy — so
 *  the three are simply visited in turn, local first. */
let capSlot: TeamMember | null = null, capState: State | null = null, capVersion = -1;
function capture(slot: TeamMember, state: State): void {
  // the pools' arrays are only ever replaced, so unchanged ones are the very arrays captured last
  if (slot === capSlot && state === capState && ctx.poolVersion === capVersion) return;
  capSlot = slot;
  capState = state;
  capVersion = ctx.poolVersion;
  let pool = slot.stacks;
  capList[0] = pool.list; capCounts[0] = pool.counts; capHooks[0] = pool.hooks; capFns[0] = pool.fns;
  pool = state.globalStacks;
  capList[1] = pool.list; capCounts[1] = pool.counts; capHooks[1] = pool.hooks; capFns[1] = pool.fns;
  pool = state.enemyStacks;
  capList[2] = pool.list; capCounts[2] = pool.counts; capHooks[2] = pool.hooks; capFns[2] = pool.fns;
}

/** Every captured Gear's constantStats summed into a fresh array, in roster order — the slot's
 *  own cached base for one tag word. With `from`/`to`, the one Gear `from` (a held main-stat Buff)
 *  is stood in for by `to` at the very same position — and `from2` by `to2` likewise, the substat
 *  tier a variant's ER moves — so a variant's base is built by exactly the additions, in exactly
 *  the order, a real run wearing them would make. */
function constBaseOf(slot: TeamMember, from: Gear | null, to: Gear | null, from2: Gear | null = null, to2: Gear | null = null): StatRow {
  const live = slot.effective;
  slot.effective = statRow();
  for (let q = 0; q < 3; q++) {
    const list = capList[q]!, counts = capCounts[q]!, hooks = capHooks[q]![6]!;
    for (let i = 0, m = hooks.length; i < m; i++) {
      const k = hooks[i]!;
      const g = list[k]!;
      const gear = g === from ? to! : g === from2 ? to2! : g;
      ctx.buff = gear; ctx.stacks = counts[k]!;
      gear.constantStatsFn!();
    }
  }
  const base = slot.effective;
  slot.effective = live;
  return base;
}

/** `constBaseOf` across runs: a base is the slot's own constant roster (every captured Gear with
 *  `constantStats`, in order, with its count) summed for one tag word, and those hooks read nothing
 *  else — so a roster, a tag word and the pieces stood in name it. Replays what a real call leaves
 *  behind too: the writes it counts (`ctx.wrote`) and the last Gear it ran as current. */
interface CachedBase { row: StatRow; wrote: number; buff: Gear | null; stacks: number }
/** Per constant roster (keyed by its Gear ids and counts), its bases by tag word and stand-ins —
 *  `plain` the ones with no stand-in, by tag word alone, the commonest lookup by far. */
interface Roster { any: boolean; bases: Map<string, CachedBase>; plain: Map<number, CachedBase> }
const ROSTERS = new Map<string, Roster>();
let rosterBases = 0;
/** A slot's constant roster only moves when `ctx.constVersion` does, so it is looked up once per version. */
const SLOT_ROSTERS = new WeakMap<TeamMember, { version: number; roster: Roster }>();
function rosterOf(slot: TeamMember): Roster {
  const known = SLOT_ROSTERS.get(slot);
  if (known && known.version === ctx.constVersion) return known.roster;
  let key = "", any = false;
  for (let q = 0; q < 3; q++) {
    const list = capList[q]!, counts = capCounts[q]!, hooks = capHooks[q]![6]!;
    for (let i = 0; i < hooks.length; i++) key += `${list[hooks[i]!]!.id}x${counts[hooks[i]!]!},`;
    if (hooks.length) any = true;
    key += "|";
  }
  if (rosterBases > 50000) {
    ROSTERS.clear();
    rosterBases = 0;
  }
  let roster = ROSTERS.get(key);
  if (!roster) ROSTERS.set(key, (roster = { any, bases: new Map(), plain: new Map() }));
  SLOT_ROSTERS.set(slot, { version: ctx.constVersion, roster });
  return roster;
}
function cachedBase(slot: TeamMember, from: Gear | null, to: Gear | null, from2: Gear | null, to2: Gear | null): StatRow {
  const roster = rosterOf(slot);
  const plain = from === null && to === null && from2 === null && to2 === null;
  const key = plain ? "" : `${ctx.tagWord}#${from?.id ?? 0}>${to?.id ?? 0}#${from2?.id ?? 0}>${to2?.id ?? 0}`;
  let hit = plain ? roster.plain.get(ctx.tagWord) : roster.bases.get(key);
  if (hit === undefined) {
    const wrote = ctx.wrote;
    const row = constBaseOf(slot, from, to, from2, to2);
    hit = { row, wrote: ctx.wrote - wrote, buff: roster.any ? ctx.buff : null, stacks: ctx.stacks };
    if (plain) roster.plain.set(ctx.tagWord, hit);
    else roster.bases.set(key, hit);
    rosterBases++;
    return row;
  }
  ctx.wrote += hit.wrote;
  if (hit.buff) {
    ctx.buff = hit.buff;
    ctx.stacks = hit.stacks;
  }
  return hit.row;
}

/** Run one phase's hook on every captured Gear that has it, with the "current" pointers aimed at
 *  each in turn. `withStacks` hands each hook its own captured stack count (see `frozenStacks()`);
 *  afterAction runs without, reading the live count instead, since it is the one phase that
 *  runs after a gear may already have spent itself down. */
/** Which of `runPhase()`'s phases run for the action being evaluated: a cast half only the cast's
 *  (`updateBuffs`, and the popover's constant stats), a queued hit only the hit's, a whole press both. */
const CAST_PHASES = (1 << 1) | (1 << 6);
const HIT_PHASES = (1 << 0) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 6) | (1 << 7);
/** The onHit grants, on a part that lands a hit. */
const ON_HIT_PHASES = 1 << 8;
const END_PHASES = 1 << 5;
let phaseMask = CAST_PHASES | HIT_PHASES | ON_HIT_PHASES | END_PHASES;
function runPhase(p: number, withStacks: boolean): void {
  if (!((phaseMask >> p) & 1)) return;
  ctx.inStats = ((STAT_PHASES >> p) & 1) === 1;
  try {
    runHooks(p, withStacks);
  } finally {
    ctx.inStats = false;
  }
}
/** applyStats, convertStats, lateConvertStats, constantStats: stats only. */
const STAT_PHASES = (1 << 2) | (1 << 3) | (1 << 4) | (1 << 6);
function runHooks(p: number, withStacks: boolean): void {
  for (let q = 0; q < 3; q++) {
    const list = capList[q]!, counts = capCounts[q]!, hooks = capHooks[q]![p]!, fns = capFns[q]![p]!;
    for (let i = 0, m = hooks.length; i < m; i++) {
      const k = hooks[i]!;
      ctx.buff = list[k]!;
      if (withStacks) ctx.stacks = counts[k]!;
      fns[i]!();
    }
  }
}

/** One call of a conversion hook as the real build ran it: who ran, at what count, the reads it made
 *  (`hookReads` [r0, r1)) and the journal writes [w0, w1) it left. */
interface HookCall { fn: () => void; buff: Gear; stacks: number; r0: number; r1: number; w0: number; w1: number }
const hookLog: HookCall[] = [];
let hookLogLen = 0;

/** A conversion phase as `actionHook` + `runPhase` run it, each call logged (`hookLog`). */
function logPhase(own: (() => void) | undefined, p: number): void {
  if (!((phaseMask >> p) & 1)) return;
  if (own) logCall(own, ctx.act!, 1);
  for (let q = 0; q < 3; q++) {
    const list = capList[q]!, counts = capCounts[q]!, hooks = capHooks[q]![p]!, fns = capFns[q]![p]!;
    for (let i = 0, m = hooks.length; i < m; i++) logCall(fns[i]!, list[hooks[i]!]!, counts[hooks[i]!]!);
  }
}
function logCall(fn: () => void, buff: Gear, stacks: number): void {
  const r0 = hookReads.length, w0 = replay.length;
  ctx.buff = buff;
  ctx.stacks = stacks;
  ctx.inStats = true;
  try {
    fn();
  } finally {
    ctx.inStats = false;
  }
  let call = hookLog[hookLogLen];
  if (!call) hookLog[hookLogLen] = call = { fn, buff, stacks, r0, r1: 0, w0, w1: 0 };
  call.fn = fn;
  call.buff = buff;
  call.stacks = stacks;
  call.r0 = r0;
  call.r1 = hookReads.length;
  call.w0 = w0;
  call.w1 = replay.length;
  hookLogLen++;
}

/** A replayable dry variant's conversions onto its own row `eff` (`slot.effective`): a logged call
 *  that read no index this row differs at would run down the same path, so its journaled writes go
 *  in as they were, in order; one that did runs again, and every index either version wrote then
 *  differs too. The row comes out as re-running every call would leave it. */
function replayConversions(diff: number[], eff: StatRow): void {
  const key = ++moved.key, at = moved.at;
  for (let d = 0; d < diff.length; d++) at[diff[d]!] = key;
  const index = replay.index, value = replay.value, read = hookReads.index;
  for (let h = 0; h < hookLogLen; h++) {
    const call = hookLog[h]!;
    let rerun = false;
    for (let r = call.r0; r < call.r1; r++) {
      if (at[read[r]!] !== key) continue;
      rerun = true;
      break;
    }
    if (!rerun) {
      for (let k = call.w0; k < call.w1; k++) {
        const i = index[k]!;
        eff[i] = eff[i]! + value[k]!;
      }
      continue;
    }
    for (let k = call.w0; k < call.w1; k++) at[index[k]!] = key;
    ctx.buff = call.buff;
    ctx.stacks = call.stacks;
    ctx.inStats = true;
    ctx.trackWrites = true;
    try {
      call.fn();
    } finally {
      ctx.inStats = false;
      ctx.trackWrites = false;
    }
  }
}

/** Every slot's own held gear's global watcher, then the team's and the enemy's — `updateGlobal` on
 *  the cast, `hitGlobal` on the hit. A locally-held gear runs as its own holder (`ctx.slot`), with
 *  `frozenStacks()` reading its live count (-1: this walks live hook sets, not a frozen roster). */
function runGlobals(state: State, slot: TeamMember, hit: boolean): void {
  // each slot's own hooks for this side alone (`castHooks`/`hitHooks`)
  for (const s of state.slots) {
    const hooks = hit ? s.hitHooks : s.castHooks;
    if (!hooks.size) continue;
    for (const h of hooks) {
      ctx.slot = s;
      ctx.buff = h.gear;
      ctx.stacks = -1;
      (hit ? h.hit : h.cast)!();
    }
  }
  ctx.slot = slot;
  // both lists read before either runs: a hook here may put up another team-wide or enemy buff,
  // which lands in a new array (see `Pool`) — the ones in hand are the roster as it stood
  const globalHooks = state.globalStacks.globalHooks, enemyHooks = state.enemyStacks.globalHooks;
  for (let i = 0; i < globalHooks.length; i++) {
    const h = globalHooks[i]!;
    ctx.buff = h.gear;
    (hit ? h.hit : h.cast)?.();
  }
  for (let i = 0; i < enemyHooks.length; i++) {
    const h = enemyHooks[i]!;
    ctx.buff = h.gear;
    (hit ? h.hit : h.cast)?.();
  }
  ctx.buff = null;
}

/** Run one of the acting Action's own hooks (see the `Action` class), with the "current" pointers
 *  aimed at the action itself: whatever it grants is attributed through it and every stat it
 *  contributes is sourced to its own name. Called first in each phase, ahead of every held Gear's
 *  own hook, so an action's own effect is in place before anything reacting to it looks. */
function actionHook(fn: (() => void) | undefined, p: number): void {
  if (!fn || !((phaseMask >> p) & 1)) return;
  ctx.buff = ctx.act;
  ctx.stacks = 1;
  ctx.inStats = ((STAT_PHASES >> p) & 1) === 1;
  try {
    fn();
  } finally {
    ctx.inStats = false;
  }
}
