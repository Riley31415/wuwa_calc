/**
 * Running an action: the phase order, the snapshot each one resolves into, and `run()`, which
 * walks a rotation and drains whatever the casts queued behind them.
 */
import { Stat, EnemyStat, Type, Cast, ActionTag, INSTA_DELAY, SWAP_DELAY } from "./stats.js";
import type { Action, ActionGroup, ActionField, CancelledStep, DashMarker } from "./rotation.js";
import type { CastAdd } from "./runtime.js";
import { ctx, pendingQueue, tagWordOf, RESOURCE_STATS, replay, readAny, READ_APPLY, READ_CONVERT, READ_AFTER, applied as appliedRecord } from "./runtime.js";
import { Gear, PHASE_COUNT } from "./gear.js";
import type { VariantAt, Timed, StatRow } from "./state.js";
import {
  State, TeamMember, StatEntry, HeldBuff, ZERO_STATS, statRow, SUBTYPE_AMP_INDEX, SUBTYPE_CRIT_RATE_INDEX, SUBTYPE_CRIT_DMG_INDEX, SUBTYPE_TOTAL_DMG_INDEX, SUBTYPE_DAMAGE_TAKEN_INDEX, FightSnapshot, capEnergy,
  EMPTY_HELD, EMPTY_FORTE, EMPTY_FIELDS, enemyDef, enemyRes,
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
   *  builds the stat snapshot the report reads them back from (damage.ts's `mvPercent`/`damageAvg`
   *  give the same numbers off a traced one). */
  mv: number;
  avg: number;
  /** The frame a split press's last hit landed, which filled this cast row in — what its Time cell
   *  reads. Unset on every other row. */
  hitAt?: number;
  /** The `SWAP_DELAY` a new resonator coming in costs, charged to the row that handed the field over. */
  swapFrames?: number;
  /** The frame this press was cast, and the one its hit is in — its frames run out, or its cancel
   *  frame where it was cut (none of the cut's own frames) — short of a split hit. */
  starts: number;
  /** What cast hooks added straight to the cast (`addToCast()`): energy, concerto, forte 1-5; null for none. */
  castGain: number[] | null;
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
  /** This action spent Concerto it didn't have: it declares a negative `concerto` (an outro's
   *  -100) and the bar walked in holding less than that. A Unison outro declares no spend at all
   *  (shared/unison.ts), so it is never short whatever the bar held. What the report reads to
   *  flag the concerto cell red. */
  concertoShort: boolean;
  /** Per gauge, this action left it below 0 — it spent more than the gauge held (see the forte
   *  banking in `evaluate()`). What the report reads to flag the cell red. */
  forteShort: [boolean, boolean, boolean, boolean, boolean];
  /** Whether this action threw the Energy bar away — true on every outro but a double-Intro
   *  visit's own, which its owner comes straight back from (see `evaluate()`). What the report
   *  reads to blank the energy cell's own trace panel rather than credit a figure the same row
   *  discarded (display.ts's own `wiped`). */
  energyWiped: boolean;
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
  /** Frames of an earlier press's banked time stop this one played inside (`State.timestopBank`). */
  timestopBanked: number;
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
  // time stop outlasting this press is banked, and a bank already standing is spent on it first
  const charged = action.cost(tag);
  const timestopBanked = Math.min(state.timestopBank, charged.total);
  state.timestopBank += action.timestop - charged.timestop - timestopBanked;
  ctx.actFrames = charged.total - timestopBanked;
  const active = state.slot === state.slots[state.onField];
  ctx.triggered = triggered;
  ctx.tagWord = tagWordOf(action);
  // every action starts on its own type; a held Gear reassigns it from updateDebuffs() below, and
  // `typeOverride()` rebuilds `ctx.tagWord` when one does
  ctx.overrideType = null; ctx.overrideSubtype = null; ctx.droppedCast = null;
  ctx.swapLosses.clear();
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
  else slot.effective.fill(0);
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
      const due = state.frame + qte - Math.min(intro.timestop, qte);
      state.timed.push({ due, action: null, slot: state.active, into: null, by: null, apply: () => {
        for (const gear of state.outroQueue.splice(0)) slot.addStack(gear, 1);
      } });
      state.timed.sort((p, q) => p.due - q.due);
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
  ctx.castGain.fill(0);
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

  // A part lands where it is due and a whole press on its cast; the rest of the press is only time
  // on the clock, which `run()` walks after it, landing each hit at its own frame.
  const frames = ctx.actFrames;
  // how far off-field time falls behind the clock over the press: its motion stop pauses an
  // inactive resonator, while time stop it doesn't cover runs on for them though the clock is still
  const cost = action.cost(tag);
  const ownStop = Math.min(action.motionStop, cost.action);
  const stopBanked = Math.min(state.motionStopBank, cost.action + cost.global - ownStop);
  state.motionStopBank += action.motionStop - ownStop - stopBanked;
  const offFieldShift = frames - (cost.action + cost.global - ownStop - stopBanked);
  ctx.offFieldShift = offFieldShift;

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
  if (!ctx.tracing && slot.variants.length !== 0) {
    if (ctx.wrote === 0) pre = ZERO_STATS;
    else { pre = slot.pre; for (let i = 0; i < pre.length; i++) pre[i] = slot.effective[i]!; }
  }
  // the stat phases change nothing in the fight, so a variant's dry re-run needs no snapshot of it —
  // only an afterAction (a whole press's) can, and that takes its own below
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
    if (base === undefined) slot.constBase.set(ctx.tagWord, base = constBaseOf(slot, null, null));
    const effective = slot.effective;
    if (ctx.wrote === 0) for (let i = 0; i < effective.length; i++) effective[i] = base[i]!;
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
  // a hit of a split press takes its share of what the stat phases add per press (`PER_PRESS`)
  const share = action.mvShare;
  if (share !== 1) for (let k = 0; k < PER_PRESS.length; k++) shareBase[k] = slot.effective[PER_PRESS[k]!]!;
  actionHook(action.applyStatsFn, 2);
  runPhase(2, true);
  // the applyStats journal alone, and whether the phase moved anything, for a variant that must
  // still re-run the conversions: a replayed applyStats can stand in only if it moved nothing,
  // since its dry run starts from the fight as it stood before it
  const replay2 = replay.length, applyMoved = ctx.mutHash !== 0;
  // ...and the real build's row as applyStats left it, the same variant's own starting point
  if (pre !== null) { const post2 = slot.post2; for (let i = 0; i < post2.length; i++) post2[i] = slot.effective[i]!; }
  ctx.readPhase = READ_CONVERT;
  actionHook(action.convertStatsFn, 3);
  runPhase(3, true);
  // ...and one phase later again, for a conversion that reads what another gear's convertStats()
  // just granted (see GearDef.lateConvertStats).
  actionHook(action.lateConvertStatsFn, 4);
  runPhase(4, true);
  ctx.recording = false;
  if (share !== 1) shareOut(slot.effective, share);
  ctx.dryRun = false;

  // A variant's row differs from the real build's only where its main-stat piece differs from the
  // held one (`variantDiff`): it is the real build's row copied, with those indices recomputed
  // from the same operands in the same order — the variant's own base, then the journaled writes
  // to them. Pure through here, that happens after afterAction below, off the finished row. An
  // impure variant runs the conversion phases again now, dry, on the same captured roster — the
  // stat phases change nothing, so every hook reads exactly what it read in the real build, live
  // reads included. A variant whose resource stats would bank differently, or whose afterAction
  // would change the fight differently, is marked unsafe: its fight would not have been this fight.
  if (pre !== null) {
    variantEff = [];
    const primaryEff = slot.effective;
    let at = slot.variantAt.get(ctx.tagWord);
    if (at === undefined) {
      const base = slot.constBase.get(ctx.tagWord)!;
      at = { bases: [], diffs: [] };
      for (let v = 0; v < slot.variants.length; v++) {
        const sub = slot.variantSubs[v] ?? null;
        const vbase = constBaseOf(slot, slot.variantOf, slot.variants[v]!, sub && slot.variantSubOf, sub), diff: number[] = [];
        for (let i = 0; i < vbase.length; i++) if (vbase[i] !== base[i]) diff.push(i);
        at.bases.push(vbase); at.diffs.push(diff);
      }
      slot.variantAt.set(ctx.tagWord, at);
    }
    variantAt = at;
    for (let v = 0; v < slot.variants.length; v++) {
      const eff = slot.variantEff[v] ??= statRow();
      variantEff.push(eff);
      const diff = at.diffs[v]!, vbase = at.bases[v]!;
      slot.variantDry[v] = readAny(diff, READ_APPLY | READ_CONVERT);
      if (!slot.variantDry[v]) continue;
      if (!anyDry) { anyDry = true; ctx.dryRun = true; }
      const replayable = !applyMoved && !readAny(diff, READ_APPLY);
      if (replayable) sparseRow(diff, vbase, eff, slot.post2, pre, 0, replay2);
      else for (let i = 0; i < eff.length; i++) eff[i] = pre[i]! + vbase[i]!;
      slot.effective = eff;
      if (!replayable) { actionHook(action.applyStatsFn, 2); runPhase(2, true); }
      actionHook(action.convertStatsFn, 3);
      runPhase(3, true);
      actionHook(action.lateConvertStatsFn, 4);
      runPhase(4, true);
      if (share !== 1) shareOut(eff, share, pre, vbase);
      let unsafe = false;
      for (const s of RESOURCE_STATS) if (eff[s] !== primaryEff[s]) unsafe = true;
      if (unsafe) slot.variantUnsafe[v] = true;
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
    heldLocal = heldPools![0]!.filter(([g]) => !slot.equipped.has(g) && !g.hidden).map(describe).filter(named);
    heldGlobal = heldPools![1]!.filter(([g]) => !g.hidden).map(describe).filter(named);
    heldEnemy = heldPools![2]!.filter(([g]) => !state.enemy.equipped.has(g) && !g.hidden).map(describe).filter(named);
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
  const stat = (k: Stat | EnemyStat) => effective[k]!;

  // bank this action's own declared energy/concerto/offtune (the resonator's own baseline for
  // performing it) plus whatever AddEnergy/AddConcerto/AddOfftune a held buff contributed, into
  // the real running totals — no kit ever touches these directly, same as forte.
  // Energy alone carries a multiplier: `(base + AddEnergy) x (1 + Energy Regen Multiplier)`.
  // a buff's gains bank with the half they belong to: the hit's with a hit, the cast's with a cast
  // each half banks what its own hooks granted: the stat phases' on the hit, updateBuffs' on the cast
  const gain = ctx.castGain;
  const addEnergy = effective[Stat.AddEnergy]! + gain[0]!;
  const energyGain = (action.energy + addEnergy) * (1 + effective[Stat.EnergyRegenMult]! / 100);
  slot.energy = Math.max(0, slot.energy + energyGain);
  // An outro leaves the field with no Energy at all — not a spend of a known size, so it is simply
  // set to 0. ...except a double-Intro visit's own outro, which hands the field *backward*
  // (rotation.ts's own outroDir) and whose owner is coming straight back for their main Intro:
  // that visit is half of one loop, not the end of one, so the Energy column runs on across both
  // halves and only the outro that actually ends the loop wipes it. Jinhsi is the case — Unison
  // pays for the first of her two outros, and her banking is one figure across the pair.
  // an Outro's own bookkeeping is its cast's
  const outro = castSide && casting(Cast.Outro);
  const energyWiped = outro && state.outroDir > 0;
  if (outro && energyWiped) slot.energy = 0;
  // A cast that spends Concerto outright — the `concerto: -100` every real outro declares — spends
  // it against the bar's own 100 ceiling: a bar that overran it is capped back first, so the
  // declared -100 empties it exactly rather than leaving the overrun behind; and a bar holding
  // less than the spend is short, which the report flags. A Unison outro declares no spend
  // (shared/unison.ts) and goes through neither. A buff's own AddConcerto spend (Suoming's Rift
  // Cleaver, -20 while Unison is held) is a stat, not a declared cost, and is left to the kit.
  // An outro still caps the bar at 100 either way — a bar cannot hold more than that into the
  // next visit, spent or not. Off-tune is the enemy's, not theirs, and carries over.
  const spend = action.concerto < 0 ? -action.concerto : 0;
  // checked against the bar as it stands at the cast: a hit still in flight (an insta swap's,
  // landing after the outro) hasn't banked yet, so a spend it would have covered is short, and
  // the bar goes below empty until that hit lands
  const concertoShort = spend > 0 && slot.concerto < spend;
  if ((spend > 0 || outro) && slot.concerto > 100) slot.concerto = 100;
  const addConcerto = effective[Stat.AddConcerto]! + gain[1]!;
  const concerto = slot.concerto + action.concerto + addConcerto;
  slot.concerto = spend > 0 ? concerto : Math.max(0, concerto);
  // Off-Tune Buildup Rate scales what an action *builds*, never what lands on the bar directly:
  // DirectOfftune (a Tune Break's own drain, Denia's half-bar surge) is already the amount the bar
  // moves, so it goes on untouched. A declared negative would come off in full for the same reason.
  // Unclamped, unlike energy/concerto: a break can leave the bar below empty (see tunebreak.ts).
  const built = action.offtune + effective[Stat.AddOfftune]!;
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
  } else if (!energyWiped) {
    slot.erGain += energyGain;
    slot.erGainEr += energyGain * effective[Stat.Er]!;
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
  // spend the bar couldn't cover, and the row is flagged; the bar never really went below empty
  // either, so the next gain starts from 0 rather than paying the shortfall off. A `resetForteN`
  // cast (rotation.ts's own ActionDef) empties the gauge ahead of its own delta.
  const forte = slot.forte, forteShort: [boolean, boolean, boolean, boolean, boolean] = [false, false, false, false, false];
  for (let i = 0; i < 5; i++) {
    const cap = slot.resonator?.maxForte[i] ?? 0;
    const delta = action.forteDeltas[i]! + effective[ADD_FORTE[i]!]! + gain[2 + i]!;
    if (action.resetForte[i]) forte[i] = 0;
    if (cap > 0 && delta < 0 && forte[i]! > cap) forte[i] = cap;
    if (delta > 0 && forte[i]! < 0) forte[i] = 0;
    forte[i] = forte[i]! + delta;
    if (forte[i]! < 0) forteShort[i] = true;
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
  const avgOf = (eff: StatRow): number => damageAvgOf(
    action, eff,
    foldStat(eff, Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk),
    foldStat(eff, Stat.BaseHp, Stat.BonusHp, Stat.FlatHp),
    foldStat(eff, Stat.BaseDef, Stat.BonusDef, Stat.FlatDef),
    eff[Stat.Amp]!, eff[SUBTYPE_AMP_INDEX]!, eff[Stat.DmgBonus]!,
    eff[SUBTYPE_CRIT_RATE_INDEX]!, eff[SUBTYPE_CRIT_DMG_INDEX]!,
    eff[SUBTYPE_TOTAL_DMG_INDEX]!, eff[SUBTYPE_DAMAGE_TAKEN_INDEX]!,
    enemyRes(), enemyDef(),
  );
  // The real build's afterAction runs first, journaled, from the banked fight. A variant still pure
  // through it is the finished row with its own indices recomputed over the whole journal; any
  // other re-runs afterAction dry from the banked fight, on the row as afterAction found it — one
  // it already re-ran the conversions into, or the real build's with its indices recomputed — and
  // the real build's own result is put back after.
  let variantAvg: number[] | null = null;
  if (variantEff !== null && (phaseMask & END_PHASES) === 0) {
    // a part with no afterAction: each variant's row is the finished one with its own indices redone
    variantAvg = [];
    for (let v = 0; v < variantEff.length; v++) {
      const eff = variantEff[v]!;
      if (!slot.variantDry[v]) {
        sparseRow(variantAt!.diffs[v]!, variantAt!.bases[v]!, eff, effective, pre!, 0, replay.length);
        if (resourceMoved(variantAt!.diffs[v]!, eff, effective)) slot.variantUnsafe[v] = true;
      }
      variantAvg.push(avgOf(eff));
    }
  } else if (variantEff !== null) {
    ctx.guarded = true;
    const [banked, done] = (state.snapshots ??= [new FightSnapshot(state), new FightSnapshot(state)]);
    const replay4 = replay.length;
    const post4 = slot.post4;
    for (let i = 0; i < post4.length; i++) post4[i] = effective[i]!;
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
    for (let v = 0; v < variantEff.length; v++) {
      const eff = variantEff[v]!;
      const diff = variantAt!.diffs[v]!, vbase = variantAt!.bases[v]!;
      const dry = slot.variantDry[v]!;
      if (!dry && !readAny(diff, READ_AFTER)) {
        sparseRow(diff, vbase, eff, effective, pre!, 0, replay.length);
        if (resourceMoved(diff, eff, effective)) slot.variantUnsafe[v] = true;
      } else {
        if (!dry) {
          sparseRow(diff, vbase, eff, post4, pre!, 0, replay4);
          if (resourceMoved(diff, eff, post4)) slot.variantUnsafe[v] = true;
        }
        if (!anyDone) { anyDone = true; done.take(state); ctx.dryRun = true; }
        slot.effective = eff;
        banked.restore(state);
        ctx.mutHash = 0;
        ctx.stacks = -1;
        actionHook(action.afterActionFn, 5);
        runPhase(5, false);
        if (ctx.mutHash !== primaryHash) slot.variantUnsafe[v] = true;
      }
      variantAvg.push(avgOf(eff));
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
  if (frameStart + frames > state.playsTo) {
    state.playsTo = frameStart + frames;
    state.playStop = Math.max(0, offFieldShift);
  }
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
    castGain: gain.some((n) => n !== 0) ? gain.slice() : null,
    // the last hit is in at its own frame, not at the press's end or after the delay a cut costs
    ends: frameStart + (half === "cast" ? (action.formOf ?? action).lastHitDelay() : 0),
  };
  const snapshot: ResolvedSnapshot | null = !ctx.tracing ? null : {
    ...result,
    type: ctx.overrideType ?? action.lastBullet?.type ?? null,   // the effective type — see ResolvedSnapshot.type
    stat, stats: effective, atk, hp, def,
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
    energy: slot.energy, concerto: slot.concerto, offtune: state.offtune,
    energyBefore, concertoBefore, offtuneBefore,
    concertoShort,
    forteShort,
    energyWiped,
    realEnergyBefore,
    frame: frameStart, frames, tag, active, timestopBanked,
    heldLocal, heldGlobal, heldEnemy,
    opensFields,
  };

  if (castSide && casting(Cast.Outro)) {
    const n = state.slots.length;
    state.active = (state.active + state.outroDir + n) % n;
  }
  return snapshot ?? result;
}

/** A press's off-field shift (`ctx.offFieldShift`) on every inactive resonator's queued hits: its
 *  motion stop holds them back, time stop it doesn't cover brings them on — to the cast at most. */
function shiftOffField(state: State, shift: number, from: number): void {
  for (const h of state.timed) {
    if (h.slot === state.presser || h.due <= from) continue;
    h.due = shift > 0 ? h.due + shift : Math.max(from, h.due + shift);
  }
  state.timed.sort((p, q) => p.due - q.due);
  // their clocks too: a pause plays out as the press is walked (`playStop`), free frames at once
  if (shift < 0) state.runTicks(from, from, shift);
}

/** The end of a split press, where its animation (or its cut) runs out: afterAction() alone, over
 *  the roster as it stands, with no row of its own. */
function closePress(state: State, action: Action, triggered: boolean): void {
  const slot = state.slot;
  ctx.state = state;
  ctx.slot = slot;
  ctx.act = action;
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
interface Step { action: Action; slot: number; by: HeldBuff | null; group: ActionGroup | null; end: boolean; spill: ActionGroup | null; queued: boolean; cut: ActionTag | null; at?: number; into?: Result | null; away?: boolean; losses?: Gear[]; frames?: number; closes?: boolean; triggered?: boolean; hold?: boolean }

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

export function run(state: State, rotation: Action[], flush = false): Result[] {
  const out: Result[] = [];
  // The steps to play (`StepQueue`): each rotation entry (`slot` -1: run on whoever is active when
  // its turn comes), and each queued follow-up put in right behind whatever queued it. An
  // ActionGroup is expanded here, before anything runs: from this point down only real casts
  // exist, and a group survives purely as the `group`/`end` tags the report reads back off each result.
  // a cancelled step plays its own Action (duck-checked, the class being rotation.ts's)
  const unwrap = (a: Action): [Action, ActionTag | null] => ((a as CancelledStep).of !== undefined ? [(a as CancelledStep).of, (a as CancelledStep).kind] : [a, null]);
  const written: Step[] = [];
  for (const entry of rotation) {
    // a duck-check rather than `instanceof ActionGroup`: the class lives in rotation.ts, which
    // this module may only reference as types (see the import note at the top)
    const group = (entry as ActionGroup).actions !== undefined ? (entry as ActionGroup) : null;
    const members = group ? group.actions : [entry];
    members.forEach((m, k) => {
      // a group expands one level: a cut group inside another is written cut on the outer one
      if ((m as ActionGroup).actions !== undefined) throw new Error(`${group!.name}: holds the group ${m.name} — cut the outer group instead`);
      const [a, cut] = unwrap(m);
      written.push({ action: a, slot: -1, by: null, group, end: group !== null && k === members.length - 1, spill: null, queued: false, cut });
    });
  }
  const steps = new StepQueue(written);
  ctx.insideGroup = false;
  // The group whose beat is still resolving — its own members, then the follow-ups they queued,
  // the last member's included. Every cast spliced in while this stands is that group's spill, and
  // the next rotation entry (or an engine event) clears it.
  // Walk the clock toward where the last press ends, stopping at the first queued hit due before
  // then: the timers run up to it, and it lands there. True while the walk is still short of its end.
  const walk = (): boolean => {
    while (state.frame < state.playsTo) {
      // the earliest due: a tick's hits join the queue unsorted
      let next = Infinity;
      for (const h of state.timed) next = Math.min(next, h.due);
      const to = next < state.playsTo ? Math.max(state.frame, next) : state.playsTo;
      const stop = Math.min(state.playStop, to - state.frame);
      state.playStop -= stop;
      ctx.state = state;
      ctx.slot = state.slot;
      state.runTicks(state.frame, to, stop);
      state.frame = to;
      state.expireBuffs();
      if (pendingQueue.length) {
        steps.unshift(pendingQueue.map((q): Step => ({ action: q.action, slot: q.slot, by: q.by, group: null, end: false, spill: q.event ? null : spillGroup, queued: true, cut: null })));
        pendingQueue.length = 0;
      }
      if (to < state.playsTo) return true;
    }
    state.playStop = 0;
    return false;
  };
  let spillGroup: ActionGroup | null = null;
  let guard = 0;
  while (steps.size || (flush && state.timed.length)) {
    if (++guard > 10000) throw new Error("action queue did not drain");
    // whatever is already queued plays before the clock moves on
    const walking = steps.peek()?.queued ? state.frame < state.playsTo : walk();
    // a flush's end plays out what is left on the clock a frame at a time, in its own order
    const draining = flush && !steps.size;
    const first = draining ? Math.min(...state.timed.map((h) => h.due)) : 0;
    // a hit on the clock whose time has come lands before the next cast, at its own frame — but one
    // landing off field (an Outro's, an insta swap's) due on the very frame the next press starts
    // lands after it, so the incoming Intro is cast first
    const isDue = (h: Timed): boolean => (draining ? h.due <= first : h.due < state.frame || (h.due === state.frame && (walking || !h.away)));
    let anyDue = false;
    for (let k = 0; k < state.timed.length; k++) {
      if (!isDue(state.timed[k]!)) continue;
      anyDue = true;
      break;
    }
    if (anyDue) {
      const due: Timed[] = [], kept: Timed[] = [];
      for (const h of state.timed) (isDue(h) ? due : kept).push(h);
      due.sort((p, q) => p.due - q.due);
      state.timed = kept;
      // one landing mid-group is that group's spill, like any follow-up there, so its row stays whole
      const spill = ctx.insideGroup ? spillGroup : null;
      const landed: Step[] = [];
      for (const h of due) {
        if (h.action) {
          landed.push({ action: h.action, slot: h.slot, by: h.by, group: null, end: false, spill, queued: true, cut: null, at: h.due, into: h.into, away: h.away, losses: h.losses, frames: h.frames, closes: h.closes, triggered: h.triggered });
          continue;
        }
        // a function on the clock (a heal tick's, a kit's scheduled one) runs on its slot at its
        // frame, no row of its own — and what it queues plays there
        const now = state.frame;
        state.frame = h.due;
        ctx.state = state;
        ctx.slot = state.slots[h.slot]!;
        h.apply?.();
        state.frame = Math.max(now, draining ? h.due : state.frame);
        for (const q of pendingQueue) landed.push({ action: q.action, slot: q.slot, by: q.by, group: null, end: false, spill: q.event ? null : spillGroup, queued: true, cut: null, at: h.due });
        pendingQueue.length = 0;
      }
      steps.unshift(landed);
    }
    if (!steps.size) continue;
    // a rotation press waits for the last one to finish playing: the walk only stopped short of it
    // to land what fell due on the way
    if (!steps.peek()!.queued && state.frame < state.playsTo) continue;
    const step = steps.take();
    if (step.closes) {
      const now = state.frame, field = state.onField, before = state.active;
      state.active = step.slot;
      state.frame = step.at!;
      if (step.away) state.onField = -1;
      ctx.pressFrames = step.frames ?? 0;
      ctx.pressStart = step.into?.starts ?? state.frame;
      closePress(state, step.action, !!step.triggered);
      if (step.losses) for (const gear of step.losses) state.slots[step.slot]!.revoke(gear);
      state.frame = Math.max(now, state.frame);
      state.onField = field;
      state.active = before;
      if (pendingQueue.length) {
        steps.unshift(pendingQueue.map((q): Step => ({ action: q.action, slot: q.slot, by: q.by, group: null, end: false, spill: q.event ? null : spillGroup, queued: true, cut: null, at: step.at })));
        pendingQueue.length = 0;
      }
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
          steps.unshift([{ action: hold, slot: state.presser, by: null, group: null, end: false, spill: null, queued: false, cut: null, hold: true }, step]);
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
      state.playsTo = state.frame + SWAP_DELAY;
      state.playStop = 0;
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
      action = step.action.resolveFn();
      // resolved to no cast at all this step (deferred onto a later one — see `queueOnIntro()`)
      if (!action) continue;
    }
    // an Outro into a kit that keeps the field waiting (`ResonatorDef.holdBefore`) waits first, on
    // a row of its own, and the Outro comes round again
    const into = state.slots[(state.active + state.outroDir + state.slots.length) % state.slots.length]!.resonator;
    if (step.slot < 0 && isCast(action, Cast.Outro) && into?.holdFn && into.intro) {
      ctx.state = state;
      ctx.slot = state.slot;
      const hold = into.holdFn(into.intro);
      if (hold) {
        steps.unshift([{ action: hold, slot: -1, by: null, group: null, end: false, spill: null, queued: false, cut: null }, step]);
        continue;
      }
    }
    // ...and one whose visit will reach a cooldown not back yet waits it out the same way, on the
    // outgoing member, so the press it gates lands ready rather than idling inside that visit
    if (step.slot < 0 && isCast(action, Cast.Outro)) {
      const to = (state.active + state.outroDir + state.slots.length) % state.slots.length;
      // read at where the Outro would be cast: a hit landing mid-wait stops the clock short of it,
      // and the swap delay still to pay comes first
      const castAt = Math.max(state.frame, state.playsTo) + (state.swapPaid ? 0 : SWAP_DELAY);
      const short = state.slots[to]!.handoffShortfall(state.slot.visitChain, castAt, state.plannedGates?.(to) ?? null);
      if (short) {
        steps.unshift([{ action: short.cd.wait(short.frames), slot: -1, by: null, group: null, end: false, spill: null, queued: false, cut: null }, step]);
        continue;
      }
      // the swap out is paid on the way off, by the outgoing member's own last press, and the
      // Outro it triggers is cast once it has played — the Outro never carries the delay
      if (!state.swapPaid) {
        if (state.lastOwn) state.lastOwn.swapFrames = (state.lastOwn.swapFrames ?? 0) + SWAP_DELAY;
        state.playsTo = Math.max(state.frame, state.playsTo) + SWAP_DELAY;
        state.playStop = 0;
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
      state.slot.noteGate(action.cooldown, Math.max(state.frame, state.playsTo));
      const cd = state.slot.cooldownAt(action.cooldown, state.frame);
      if (cd.charges <= 0) {
        steps.unshift([{ action: action.cooldown.wait(cd.next - state.frame), slot: -1, by: null, group: null, end: false, spill: null, queued: false, cut: null }, step]);
        continue;
      }
      state.slot.spendCooldown(action.cooldown, state.frame, action.cooldownFrames || undefined);
    }
    pendingQueue.length = 0;
    // "not really this resonator's own turn" rows the report dims: a follow-up the engine itself
    // queued (Phrolova's Hecate procs, Cantarella's Jolt, ...), a rotation marker or a cast that
    // declares itself one (a `.swap()` form, a summon echo's own hit), and an outro (a
    // handoff, not an attack).
    // An engine-level event is not one by virtue of being an event — `queueEvent` says where a cast
    // lands and on whom, not whose press it is (Hiyuki's Stage 3 is an event *and* a press of her
    // own). A Tune Break declares itself one instead, the way the markers do, so every per-action
    // clock passes it over without knowing it by name — see tunebreak.ts.
    // Handed to evaluate() rather than stamped on the result after: gear reacting mid-action
    // needs it too (tunebreak.ts's own watcher won't auto-fire off one) — see triggeredAction().
    // No action declares itself one: a summon echo's hit (the mainslot's one summon form) is its
    // creature's, and a Tune Break nobody's.
    const ms = state.slot.mainslot;
    const summon = !!ms && ms.onfield === ms.outro && action === ms.onfield;
    // A summon's hit names the equipped mainslot itself as its source, so the row's hover wears
    // the gear's name in its owner's colour. Overrides whatever queueOnIntro() attributed — during
    // marker resolution `ctx.buff` is stale, so the deferred copy carried garbage.
    const by = summon ? { name: ms!.name, source: state.sourceOf.get(ms!) ?? state.slot.name, left: 0 } : step.by;
    // a FIELD press, or anything with a source to name, is nobody's press
    const triggered = action.tag === ActionTag.Field || by !== null;
    // a dash the next press stops time on is cut short by it, an insta cancel that keeps its hit;
    // a marker there resolves only when reached, so it is taken as stopping nothing
    const nextPress = steps.peek()?.action;
    const dash = (step.action as unknown as DashMarker).after !== undefined && !!nextPress && !nextPress.resolveFn && nextPress.timestop > 0;
    // a summon's hit is nobody's to cut
    let cut = summon ? null : dash ? ActionTag.InstaCancel : step.cut;
    const pressed = action;
    if (cut && !dash) [action, cut] = action.cutAs(cut);
    const kind = cut ?? action.tag;
    const checked = !dash && action.half === null;
    if (checked && LENGTH_CHECKED.has(kind)) checkCutLength(pressed.cancelOf ?? pressed, kind);
    // a marker resolving to presses of either kind can't be written insta for the hitless one alone
    if (checked && !step.action.resolveFn && SLOW_CUTS.has(kind) && action.cutFrame <= INSTA_DELAY) {
      throw new Error(`${action.name}: cuts at frame ${action.cutFrame}, inside an insta cut's ${INSTA_DELAY} — write it as ${INSTA_OF[kind as ActionTag]} instead of ${kind}`);
    }
    // a press that takes time casts now and queues each hit on the time-ordered queue at its own
    // frame, and its end where it runs out
    const whole = action;
    const splits = whole.splitsHit(cut);
    const castAt = step.at ?? state.frame, away = splits && whole.hitsAway(cut);
    const split = splits
      ? whole.bullets.map((_, k) => ({ due: castAt + whole.hitDelay(k), action: whole.hitPart(k), slot: state.active, into: null as Result | null, by: null, away, frames: 0, triggered: false }))
      : null;
    if (split) {
      state.timed.push(...split);
      state.timed.sort((p, q) => p.due - q.due);
      action = action.castPart();
    }
    // an Outro hands the field on as it is cast
    const n = state.slots.length, next = (state.active + state.outroDir + n) % n;
    if (isCast(action, Cast.Outro) && action.half !== "hit") {
      state.onField = next;
      state.slots[next]!.arrive(state.slots[state.active]!.visitChain, Math.max(state.frame, state.playsTo));
    }
    // a landing hit is played at its own frame, then the clock goes back to where the fight is —
    // a split one off field whoever holds it: its owner left on the press it split from
    const now = state.frame, field = state.onField;
    if (step.at !== undefined) state.frame = step.at;
    if (step.away) state.onField = -1;
    ctx.pressFrames = step.frames ?? 0;
    ctx.pressStart = step.into?.starts ?? state.frame;
    const result = evaluate(state, action, triggered, by, cut);
    if (ctx.offFieldShift !== 0) shiftOffField(state, ctx.offFieldShift, now);
    // each hit carries its press's length, and the end — where what a swap cancel loses goes — is
    // where the press runs out, never ahead of a hit it committed
    if (split) {
      for (const h of split) {
        h.frames = ctx.actFrames;
        h.triggered = triggered;
      }
      const last = split.reduce((m, h) => Math.max(m, h.due), castAt);
      const runs = whole.castsInstantly ? whole.instantEnd() : ctx.actFrames;
      state.timed.push({
        due: Math.max(last, castAt + runs), action: whole.endPart(), slot: state.active, into: null, by: null, away, frames: ctx.actFrames,
        losses: ctx.swapLosses.size ? [...ctx.swapLosses] : undefined, closes: true, triggered,
      });
      state.timed.sort((p, q) => p.due - q.due);
    }
    if (step.at !== undefined) {
      state.frame = Math.max(now, state.frame);
      state.onField = field;
    }
    if (step.into) {
      landHit(step.into, result, step.at!);
    } else {
      result.group = step.group;
      result.groupEnd = step.end;
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
      const from = split ? result.starts : result.ends;
      const at = step.at ?? (from < state.frame ? from : undefined);
      for (const p of pendingQueue) queued.push({ action: p.action, slot: p.slot, by: p.by, group: null, end: false, spill: p.event ? null : spillGroup, queued: true, cut: null, at });
      steps.unshift(queued);
      pendingQueue.length = 0;
    }
  }
  return out;
}

/** The cuts that play up to the cut frame (`cutFrame`) — pointless on a press whose cut frame an
 *  insta cut (6f) already reaches, so writing one there throws. */
const SLOW_CUTS = new Set<string>([ActionTag.Cancel, ActionTag.EasyCancel, ActionTag.DodgeCancel, ActionTag.JumpCancel, ActionTag.SwapCancel]);
/** What each of those is written as instead, cut insta. */
const INSTA_OF: Partial<Record<ActionTag, string>> = {
  [ActionTag.Cancel]: ".instaCancel()", [ActionTag.EasyCancel]: ".instaCancel()", [ActionTag.DodgeCancel]: ".instaDodge()",
  [ActionTag.JumpCancel]: ".instaJump()", [ActionTag.SwapCancel]: ".instaSwap()",
};

/** The cuts weighed against the press they cut (`checkCutLength()`) — not an insta swap, which
 *  may run past a short press. */
const LENGTH_CHECKED = new Set<string>([ActionTag.Cancel, ActionTag.EasyCancel, ActionTag.DodgeCancel, ActionTag.InstaDodge, ActionTag.JumpCancel, ActionTag.InstaJump, ActionTag.InstaCancel, ActionTag.SwapCancel]);

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
  "frame", "frames", "tag", "active", "timestopBanked", "energyWiped", "concertoShort", "realEnergyBefore",
  "energyBefore", "concertoBefore", "offtuneBefore", "forteBefore", "castGain", "castAdds"]);

/** Add one of a split press's hits, landed at `at`, into its cast row. */
function landHit(row: Result, hit: Result, at: number): void {
  // the first hit replaces what the cast dealt; each after it adds on
  const summed = row.hitAt !== undefined, avg = row.avg, mv = row.mv, variantAvg = row.variantAvg;
  if (ctx.tracing) {
    const r = row as unknown as Record<string, unknown>, h = hit as unknown as Record<string, unknown>;
    const fields = r.opensFields as ActionField[] | undefined, short = r.forteShort as boolean[] | undefined;
    for (const k of Object.keys(h)) if (!CAST_KEEPS.has(k)) r[k] = h[k];
    if (fields) r.opensFields = [...fields, ...(h.opensFields as ActionField[])];
    if (short) r.forteShort = short.map((b, n) => b || (h.forteShort as boolean[])[n]!);
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
  for (let i = 0; i < eff.length; i++) eff[i] = from[i]!;
  const index = replay.index, value = replay.value;
  for (let d = 0; d < diff.length; d++) {
    const i = diff[d]!;
    let x = pre[i]! + vbase[i]!;
    for (let k = k0; k < k1; k++) if (index[k] === i) x = x + value[k]!;
    eff[i] = x;
  }
}

/** Whether a variant's row banks a resource differently from the real build's `from` — only its
 *  own moved indices (`diff`) can, every other one being a copy. */
function resourceMoved(diff: number[], eff: StatRow, from: StatRow): boolean {
  for (let d = 0; d < diff.length; d++) { const i = diff[d]!; if (RESOURCE_MASK[i] && eff[i] !== from[i]) return true; }
  return false;
}

const RESOURCE_MASK: boolean[] = Array.from(ZERO_STATS, () => false);
for (const s of RESOURCE_STATS) RESOURCE_MASK[s] = true;

/** What a buff adds to a press as a whole — its motion value and what it banks — which a split
 *  press's hits share out by motion value rather than each taking in full. */
const PER_PRESS: Stat[] = [Stat.AddMv, Stat.AddEnergy, Stat.AddConcerto, Stat.AddOfftune, Stat.DirectOfftune,
  Stat.AddForte1, Stat.AddForte2, Stat.AddForte3, Stat.AddForte4, Stat.AddForte5];
const shareBase: number[] = PER_PRESS.map(() => 0);
/** Scale what the stat phases added to `PER_PRESS` down to this hit's `share`: over `shareBase`
 *  for the real build, over its own starting row (`pre` + `vbase`) for a variant's dry run. */
function shareOut(eff: StatRow, share: number, pre?: StatRow, vbase?: StatRow): void {
  for (let k = 0; k < PER_PRESS.length; k++) {
    const i = PER_PRESS[k]!, from = pre ? pre[i]! + vbase![i]! : shareBase[k]!;
    eff[i] = from + (eff[i]! - from) * share;
  }
}
const ADD_FORTE = [Stat.AddForte1, Stat.AddForte2, Stat.AddForte3, Stat.AddForte4, Stat.AddForte5];

const capList: Gear[][] = [[], [], []];
const capCounts: number[][] = [[], [], []];
const capHooks: number[][][] = [[], [], []];

/** Take the three pools as they stand right now, for the phases that follow to run on. A Gear is
 *  only ever in one pool — a self buff is local, a team buff global, a debuff on the enemy — so
 *  the three are simply visited in turn, local first. */
function capture(slot: TeamMember, state: State): void {
  let pool = slot.stacks;
  capList[0] = pool.list; capCounts[0] = pool.counts; capHooks[0] = pool.hooks;
  pool = state.globalStacks;
  capList[1] = pool.list; capCounts[1] = pool.counts; capHooks[1] = pool.hooks;
  pool = state.enemyStacks;
  capList[2] = pool.list; capCounts[2] = pool.counts; capHooks[2] = pool.hooks;
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
  ctx.inStats = STAT_PHASES.has(p);
  try {
    runHooks(p, withStacks);
  } finally {
    ctx.inStats = false;
  }
}
/** applyStats, convertStats, lateConvertStats, constantStats: stats only. */
const STAT_PHASES = new Set([2, 3, 4, 6]);
function runHooks(p: number, withStacks: boolean): void {
  for (let q = 0; q < 3; q++) {
    const list = capList[q]!, counts = capCounts[q]!, hooks = capHooks[q]![p]!;
    for (let i = 0, m = hooks.length; i < m; i++) {
      const k = hooks[i]!;
      const gear = list[k]!;
      ctx.buff = gear;
      if (withStacks) ctx.stacks = counts[k]!;
      gear.hookFns[p]!();
    }
  }
}

/** Every slot's own held gear's global watcher, then the team's and the enemy's — `updateGlobal` on
 *  the cast, `hitGlobal` on the hit. A locally-held gear runs as its own holder (`ctx.slot`), with
 *  `frozenStacks()` reading its live count (-1: this walks live hook sets, not a frozen roster). */
function runGlobals(state: State, slot: TeamMember, hit: boolean): void {
  for (const s of state.slots) {
    for (const gear of s.globalHooks) {
      ctx.slot = s;
      ctx.buff = gear;
      ctx.stacks = -1;
      (hit ? gear.hitGlobalFn : gear.updateGlobalFn)?.();
    }
  }
  ctx.slot = slot;
  // both lists read before either runs: a hook here may put up another team-wide or enemy buff,
  // which lands in a new array (see `Pool`) — the ones in hand are the roster as it stood
  const globalHooks = state.globalStacks.globalHooks, enemyHooks = state.enemyStacks.globalHooks;
  for (let i = 0; i < globalHooks.length; i++) {
    ctx.buff = globalHooks[i]!;
    (hit ? ctx.buff.hitGlobalFn : ctx.buff.updateGlobalFn)?.();
  }
  for (let i = 0; i < enemyHooks.length; i++) {
    ctx.buff = enemyHooks[i]!;
    (hit ? ctx.buff.hitGlobalFn : ctx.buff.updateGlobalFn)?.();
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
  ctx.inStats = STAT_PHASES.has(p);
  try {
    fn();
  } finally {
    ctx.inStats = false;
  }
}
