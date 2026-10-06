/**
 * Running an action: the phase order, the snapshot each one resolves into, and `run()`, which
 * walks a rotation and drains whatever the casts queued behind them.
 */
import { Stat, EnemyStat, Type, Cast, ActionTag, Scaling, INSTA_DELAY, SWAP_DELAY, FULL_CONCERTO, MASH_DELAY, DESPAWN_TIME, Position, POSITION_NAME, splitStop } from "./stats.js";
import type { Action, ActionGroup, ActionField, CancelledStep, DashMarker, Bullet } from "./rotation.js";
import { SWAP, SKIP, EveryOther, INTRO, DEFAULT_DODGE, ECHO_DODGE } from "./rotation.js";
import type { GainAdd } from "./runtime.js";
import { ctx, pendingQueue, tagWordOf, RESOURCE_STATS, replay, readAny, READ_APPLY, READ_CONVERT, READ_AFTER, applied as appliedRecord, resolving, hookReads, moved } from "./runtime.js";
import { Gear, PHASE_COUNT } from "./gear.js";
import type { VariantAt, VariantBases, VariantMemo, PieceSwap, Timed, StatRow } from "./state.js";
import {
  State, TeamMember, StatEntry, HeldBuff, ZERO_STATS, statRow, SUBTYPE_AMP_INDEX, BASIC_DMG_BONUS_INDEX, SUBTYPE_CRIT_RATE_INDEX, SUBTYPE_CRIT_DMG_INDEX, SUBTYPE_TOTAL_DMG_INDEX, SUBTYPE_DAMAGE_TAKEN_INDEX, FightSnapshot, capEnergy,
  EMPTY_HELD, EMPTY_FORTE, EMPTY_FIELDS, enemyDef, enemyRes, sortByDue, insertByDue, timedEntry,
} from "./state.js";
import { casting, isCast, asSource } from "./context.js";
import { damageFactorsInto, avgFromFactors, foldStat, FACTOR_COUNT } from "./damage.js";
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
  /** A split press's hits still to land, counted down as each does (`lastHit()`). */
  pending?: number;
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
   *  on every traced run. Its hit record carries it (`State.hits`), which teamrun.ts sums the way it
   *  sums the real `avg`; a split press's row keeps its cast's. */
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
  /** What hooks added to the press (`addGain()`), every part of it summed: energy, concerto, forte
   *  1-5, off-tune, direct off-tune; null for none. */
  gain: number[] | null;
  /** Its group's trailing dash was dropped for what took its place (`replaceNextDash()`): the
   *  group ends on this press, which its row then reads. */
  dashDropped?: boolean;
  /** The real timer as this press was cast (`State.real`), and as its last hit lands. */
  realStarts: number;
  ends: number;
}

/** A snapshot with everything the old report/display layer also wants: the raw per-entry trace
 *  (`entries`), a `slot` alias for `member` (display.ts's own field name), and resource counters
 *  — always empty here, since this engine banks Energy/Concerto/Offtune into running counters
 *  of its own (`TeamMember.energy`, `State.offtune`); a column fed entirely by
 *  zeroes is dropped by `buildReport()` itself, so this degrades to "not shown" rather than
 *  lying with a fake number. `triggered` is set by `run()`, not here — only it knows whether an
 *  action came off the rotation list or was queued mid-fight. */
export interface ResolvedSnapshot extends Result, Snapshot {
  entries: StatEntry[];
  /** What hooks added to the press (`addGain()`), every part of it, by who. */
  adds: GainAdd[];
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
   *  three are banked automatically by evaluate() itself, a hook's own through `addGain()`. */
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
  /** The `requireBuff` buffs the cast didn't find held; null where it found them all. */
  buffUnmet: Gear[] | null;
  /** The `forbidBuff` buffs the cast found held; null where it found none. */
  buffForbidden: Gear[] | null;
  /** Whose kit each `requireBuff` then `forbidBuff` buff came from as the cast found it (`State.sourceOf`),
   *  the caster's where nothing granted it yet: what the action hover colours them by. */
  buffSources: string[] | null;
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
  /** Was its owner the resonator on field (`State.onField`) — what dims a row whose owner was off it. */
  active: boolean;
  /** Real frames of this press the game timer stood still for past its own time stop — another
   *  press's time stop still standing (`State.freeze()`). */
  timestopBanked: number;
  /** A hold cancel's frame the bars paid for the press it held into (`Action.holdPaid()`), and the
   *  frame it let go (`Action.letGo()`); -1 otherwise. */
  holdPaid: number;
  holdCut: number;
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
  // each part of a split press runs its own side, and a whole press all — a hit's hooks on a hit
  // alone: a press with no bullet has its cast and nothing else
  const half = action.half;
  const castSide = half === null || half === "cast", hitSide = (half === null || half === "hit") && action.bullets.length > 0;
  // a bullet dealing nothing (an event's marker) runs its own hooks but sets off no onHit
  const lands = hitSide && action.mv > 0;
  phaseMask = (castSide ? CAST_PHASES : 0) | (hitSide ? HIT_PHASES : 0) | (lands ? ON_HIT_PHASES : 0) | (half === null ? END_PHASES : 0);
  // a step's own cut, else the form's (an insta cancel, a swap)
  const tag = cut ?? action.tag;
  if (castSide) ctx.pressCut = tag;
  // a hold cancel lets go where the bars pay for the press it holds into: read ahead of the cast
  // for its hooks, then again on what the cast really added
  const held = (tag === ActionTag.HoldCancel || tag === ActionTag.MashCancel) && castSide ? action.formOf ?? action : null;
  const mash = tag === ActionTag.MashCancel;
  const cap = slot.resonator?.maxForte ?? NO_CAP;
  // the cast's own condition, read off the bars as it finds them
  const castUnmet = castSide && (action.castMin || action.castMax) ? action.castUnmet([slot.energy, slot.concerto, ...slot.forte]) : null;
  const buffUnmet = castSide ? action.buffsUnmet(state, slot) : null;
  const buffForbidden = castSide ? action.buffsForbidden(state, slot) : null;
  if ((castUnmet || buffUnmet || buffForbidden) && !triggered) warnUnmet(state, slot, action, castUnmet, buffUnmet, buffForbidden);
  const buffSources = ctx.tracing && castSide && (action.requireBuffs || action.forbidBuffs)
    ? [...action.requireBuffs ?? [], ...action.forbidBuffs ?? []].map((g) => state.sourceOf.get(g) ?? slot.name)
    : null;
  const realStart = state.real;
  // its owner's hits already on the clock (an earlier press's committed bullets) bank while it holds;
  // its own split hits are queued there too, and `holdPaid()` walks those itself
  const pending: { at: number; bullet: Bullet }[] = [];
  if (held) {
    for (const h of state.timed) {
      const a = h.action;
      if (!a || a.formOf === held || state.slots[h.slot] !== slot || (a.half !== "hit" && a.half !== null)) continue;
      for (const bullet of a.bullets) pending.push({ at: h.due - realStart + (a.half === null ? bullet.hitFrame : 0), bullet });
    }
  }
  let charged = held ? action.holdCost(held.holdAt([slot.energy, slot.concerto, ...slot.forte], cap, ctx.holdNext, null, pending, mash)) : action.cost(tag);
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
    // what an outro handed over lands as the Intro is cast; the Outro's own buffs on its QTE frame,
    // their durations starting there
    for (const gear of state.outroQueue.splice(0)) slot.addStack(gear, 1);
    const intro = action.formOf ?? action, qte = intro.qteFrames;
    if (!qte) for (const gear of state.qteQueue.splice(0)) slot.addStack(gear, 1);
    else insertByDue(state.timed, qteLanding(state, slot, state.real + qte));
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
  const gain = ctx.gain;
  for (let i = 0; i < gain.length; i++) gain[i] = 0;
  ctx.inCast = false;
  ctx.inHit = false;
  ctx.hit = null;
  if (ctx.tracing) ctx.adds = [];
  if (castSide) {
    ctx.inCast = true;
    actionHook(action.updateGlobalFn, 1);
    runGlobals(state, slot, false);
    capture(slot, state);
    actionHook(action.updateBuffsFn, 1);
    runPhase(1, true);
    ctx.inCast = false;
  }
  let holdPaid = held ? held.holdPaid([slot.energy, slot.concerto, ...slot.forte], cap, ctx.holdNext, gain, pending) : -1;
  if (held) {
    // it holds on until the next press can cut in as well: its priority, and a mash into an Outro
    // the press's no-swap frames
    const next = ctx.holdNext;
    // a buff the next press needs and doesn't find yet: held to its last bullet, and let go where
    // the buff lands instead (`settleHold()`)
    const watched = !!(ctx.holdNext?.buffsUnmet(state, slot) || ctx.holdNext?.buffsForbidden(state, slot));
    if (watched) {
      state.holdWatch = {
        press: held, owner: slot, next: ctx.holdNext!, kind: tag, start: realStart, least: realStart + held.letGo(holdPaid, mash, next),
        paid: Math.min(held.freeForNext(next, holdPaid, mash), held.animFrames), cut: 0, playsToBefore: state.playsTo, result: null,
      };
      holdPaid = held.bullets.length ? Math.max(holdPaid, held.lastHitDelay()) : held.animFrames;
    }
    ctx.holdCut = held.letGo(holdPaid, mash, next);
    // what the press played before holding out its least, or its mash input: to where the bars paid
    // and the next press could follow
    holdPaid = Math.min(held.freeForNext(next, holdPaid, mash), held.animFrames);
    if (watched) state.holdWatch!.cut = ctx.holdCut;
    else checkHoldCut(held, tag, ctx.holdCut);
    if (!mash && next?.cast === Cast.Outro && ctx.holdCut < held.noSwapFrames) {
      throw new Error(`${held.name}: its ${tag} lets go into ${next.name} at frame ${ctx.holdCut}, inside its ${held.noSwapFrames} no-swap frames — mash it instead`);
    }
    charged = action.holdCost(ctx.holdCut);
  }
  const holdCut = held ? ctx.holdCut : -1;
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
    // the bullet stays current through the hit's stat phases and its onHit, its gains added ahead of those
    ctx.hit = action.lastBullet;
    ctx.inHit = true;
    capture(slot, state);
    actionHook(action.updateDebuffsFn, 0);
    actionHook(ctx.hit!.updateDebuffs, 0);
    runPhase(0, true);
    actionHook(action.hitGlobalFn, 0);
    actionHook(ctx.hit!.hitGlobal, 0);
    runGlobals(state, slot, true);
    capture(slot, state);
    runPhase(7, true);
    ctx.inHit = false;
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
  let pre: StatRow | null = null, constRow: StatRow | null = null;
  let variantEff: StatRow[] | null = null;
  let variantAt: VariantAt | null = null;
  let anyDry = false;
  // stats pay into hits alone: a bare cast deals nothing, its row reads its hits' stats, and what
  // it banks (`castEnergy`, `castOfftune`, a cast hook's gain) is flat
  const statless = !hitSide;
  if (!statless && !ctx.tracing && slot.variants.length !== 0) {
    if (ctx.wrote === 0) pre = ZERO_STATS;
    else {
      pre = slot.pre;
      pre.set(slot.effective);
    }
  }
  // the stat phases change nothing in the fight, so a variant's dry re-run needs no snapshot of it —
  // only an afterAction (a whole press's) can, and that takes its own below
  let replay2 = 0, applyMoved = false, post2 = slot.post2;
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
      if (base === undefined) slot.constBase.set(ctx.tagWord, base = cachedBase(slot, null));
      constRow = base;
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
    // ...and the real build's row as applyStats left it, the same variant's own starting point — the
    // finished row itself where no conversion follows
    if (pre !== null && hasConversions(action)) post2.set(slot.effective);
    else post2 = slot.effective;
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
      at = { ...variantBasesOf(slot), memo: null, memo2: null };
      slot.variantAt.set(ctx.tagWord, at);
    }
    variantAt = at;
    variantEff = slot.variantEff;
    // no index any variant moves was read: none re-runs a phase
    const clean = !readAny(at.union, READ_APPLY | READ_CONVERT);
    if (clean) for (let v = 0; v < slot.variants.length; v++) slot.variantDry[v] = false;
    for (let v = 0; v < slot.variants.length && !clean; v++) {
      const diff = at.diffs[v]!, vbase = at.bases[v]!;
      slot.variantDry[v] = readAny(diff, READ_APPLY | READ_CONVERT);
      if (!slot.variantDry[v]) continue;
      // a variant's own row, only ever needed by one re-run dry
      const eff = (variantEff[v] ??= statRow());
      if (!anyDry) { anyDry = true; ctx.dryRun = true; }
      const replayable = !applyMoved && !readAny(diff, READ_APPLY);
      if (replayable) sparseRow(diff, vbase, eff, post2, pre, 0, replay2);
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

  // bank what this part declares of its own (its cast's `castX`, its bullet's) plus whatever its
  // hooks added (`addGain()`), each part with its own: no kit ever touches these directly.
  // Energy alone carries a multiplier: `hits x (1 + Energy Regen Multiplier) + cast + added`.
  const own = action.banks;
  // the hits' own energy is scaled by ER (and the Energy Regen Multiplier) and shared; the cast's
  // (`castEnergy`, banked where no stat runs) and what a hook added are neither
  const hitEnergy = own[0]! - action.castEnergy;
  const baseEnergy = hitEnergy > 0 ? hitEnergy * (1 + effective[Stat.EnergyRegenMult]! / 100) : hitEnergy;
  const flatEnergy = action.castEnergy + gain[0]!;
  const energyGain = baseEnergy + flatEnergy;
  slot.energy = Math.max(0, slot.energy + energyGain);
  // the Energy column counts up for the whole fight. A double-Intro visit's own outro hands the field
  // *backward* (rotation.ts's own outroDir): half of one loop, so only the other ends it
  const outro = castSide && casting(Cast.Outro);
  const endsLoop = outro && state.outroDir > 0;
  // A cast that spends Concerto outright — the `concerto: -100` every real outro declares — spends
  // it against the bar's own 100 ceiling: a bar that overran it is capped back first, so the
  // declared -100 empties it exactly rather than leaving the overrun behind; and a bar holding
  // less than the spend is short, which the report flags. A Unison outro declares no spend
  // (shared/unison.ts) and goes through neither. A hook's own concerto spend (Suoming's Rift
  // Cleaver, -20 while Unison is held) is an `addGain()`, not a declared cost, and is left to the kit.
  // An outro still caps the bar at 100 either way — a bar cannot hold more than that into the
  // next visit, spent or not. Off-tune is the enemy's, not theirs, and carries over.
  const spend = own[1]! < 0 ? -own[1]! : 0;
  // a hit still in flight (an insta swap's, landing after the outro) hasn't banked yet, so the bar
  // goes below empty until that hit lands
  if ((spend > 0 || outro) && slot.concerto > FULL_CONCERTO) slot.concerto = FULL_CONCERTO;
  // what the press itself banked, the floor up from below empty aside (`gaugeDelta`)
  const concertoGained = own[1]! + gain[1]!;
  const concerto = slot.concerto + concertoGained;
  slot.concerto = spend > 0 ? concerto : Math.max(0, concerto);
  // Off-Tune Buildup Rate and its multiplier scale what an action *builds*, never what lands on the
  // bar directly: direct off-tune (Denia's half-bar surge) is already the amount the bar moves, so it
  // goes on untouched, and a declared negative comes off in full. The cast's own (`castOfftune`, a
  // Tune Break's drain) runs no stat, so it lands as direct does.
  // Unclamped, unlike energy/concerto: a break can leave the bar below empty (see tunebreak.ts).
  const declared = own[7]! - action.castOfftune + gain[7]!;
  state.offtune += (declared < 0 ? declared : declared * (1 + effective[Stat.OfftuneMult]! / 100) * (effective[Stat.OfftuneBuildup]! / 100)) + action.castOfftune + gain[8]!;

  // RealEnergy (TeamMember.realEnergy): the action's own gain, the one ER scales (flat gains
  // go in `erFlat`), each holder capped at their own maxEnergy, plus half of it shared to every *other* member — this is
  // the real ingame mechanic for energy being automatically shared across the team. A Liberation that resets the bar is a special case: it
  // action's own gain lands, so a resetEnergy-marked Liberation's "before" value excludes its own
  // contribution — exactly the "banked coming into this cast" figure the ER requirement wants.
  const realEnergyBefore = slot.realEnergy;
  // every bar already sits inside its own ceiling, so a press banking none moves none
  if (baseEnergy !== 0) {
    slot.realEnergy = capEnergy(slot, slot.realEnergy + baseEnergy);
    const shared = baseEnergy / 2;
    for (const other of state.slots) {
      if (other !== slot) other.realEnergy = capEnergy(other, other.realEnergy + shared);
    }
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
        ? ((slot.resonator?.maxEnergy ?? 0) * 100 - (slot.erGainEr - slot.constEr * slot.erGain) - 100 * slot.erFlat) / realEnergyBefore
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
    slot.erFlat = 0;
    slot.realEnergy = 0;
  } else if (!endsLoop) {
    slot.erGain += baseEnergy;
    slot.erGainEr += baseEnergy * effective[Stat.ER]!;
    slot.erFlat += flatEnergy;
  }

  // same shape, for whichever forte gauges this action declares a delta on — a kit assigns its
  // own meaning onto whichever slot fits (Jingran's Qi is forte1, his Mingfire is forte2) — plus
  // whatever a hook added (`addGain()`: Jingran's Fire of Life refunding Qi off its own Mingfire
  // spend, rather than reaching for setForte1 directly and leaving no trace of who paid it).
  // Unconditional, not gated on the action's own declared amount being nonzero — a hook can add
  // here even on an action that declares nothing itself.
  //
  // Every gauge fills freely past its Resonator's `maxForteN`, and a spend from it starts at the
  // cap rather than the overrun — the bar never really held more. Below 0 after a spend is a
  // spend the bar couldn't cover, and that row is flagged; the bar never really went below empty
  // either, so the member's next cast — or a gain landing first — clamps it back to 0 rather than
  // paying the shortfall off. A `resetForteN` cast (rotation.ts's own ActionDef) empties the gauge
  // ahead of its own delta.
  const forte = slot.forte, caps = slot.resonator?.maxForte ?? NO_CAP;
  for (let i = 0; i < 5; i++) {
    const cap = caps[i]!;
    const delta = own[2 + i]! + gain[2 + i]!;
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
    if (!anyDry) variantAvg = scoreVariants(slot, action, variantAt!, effective, pre!, constRow);
    else {
      variantAvg = [];
      for (let v = 0; v < slot.variants.length; v++) {
        variantAvg.push(slot.variantDry[v] ? avgOf(action, variantEff[v]!) : scoreVariant(slot, v, action, variantAt!, effective, pre!));
      }
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
    // with none re-run dry and afterAction reading no index a variant moves, all score as a part does
    const pure = !anyDry && !readAny(variantAt!.union, READ_AFTER);
    variantAvg = pure ? scoreVariants(slot, action, variantAt!, effective, pre!, constRow) : [];
    let anyDone = false;
    for (let v = 0; v < slot.variants.length && !pure; v++) {
      const eff = (variantEff[v] ??= statRow());
      const diff = variantAt!.diffs[v]!, vbase = variantAt!.bases[v]!;
      const dry = slot.variantDry[v]!;
      if (!dry && !readAny(diff, READ_AFTER)) {
        variantAvg.push(scoreVariant(slot, v, action, variantAt!, effective, pre!));
        continue;
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
  // the rest of the press is `run()`'s to walk, landing whatever hit falls due inside it
  if (realStart + realLen > state.playsTo) state.playsTo = realStart + realLen;
  const mv = (action.mv + effective[Stat.AddMv]!) * (1 + effective[Stat.MulMv]! / 100);
  const avg = avgOf(action, effective);
  // `group`/`groupEnd`/`groupSpill`/`queued` are stamped by run() the moment this returns — nothing
  // mid-action reads them, unlike `triggered`, so none has to be threaded through this call
  const result: Result = {
    action, member: slot.name, slot: action.slot ?? slot.name, triggered, source,
    group: null, groupEnd: false, groupSpill: null, queued: false, mv, avg, variantAvg, starts: frameStart,
    gain: anyNonZero(gain) ? gain.slice() : null,
    // the last hit is in at its own frame, not at the press's end or after the delay a cut costs
    realStarts: realStart,
    ends: realStart + (half === "cast" ? (action.formOf ?? action).lastHitDelay() : 0),
    // filled in by the first hit landing (`landHit()`); present from the start so every row is one shape
    hitAt: undefined,
    pending: undefined,
  };
  const snapshot: ResolvedSnapshot | null = !ctx.tracing ? null : {
    ...result,
    atk: foldStat(effective, Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk),
    hp: foldStat(effective, Stat.BaseHp, Stat.BonusHp, Stat.FlatHp),
    def: foldStat(effective, Stat.BaseDef, Stat.BonusDef, Stat.FlatDef),
    type: ctx.overrideType ?? action.lastBullet?.type ?? null,   // the effective type — see ResolvedSnapshot.type
    stat: statReader(effective), stats: effective,
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
    adds: ctx.adds,
    forte: [...slot.forte],
    forteBefore,
    maxForte: slot.resonator?.maxForte ?? EMPTY_FORTE,
    forteScale: slot.resonator?.forteScale ?? UNIT_FORTE,
    energy: slot.energy, concerto: slot.concerto, offtune: state.offtune,
    energyBefore, concertoBefore, offtuneBefore,
    seq: ++traceSeq,
    concertoGained,
    castUnmet,
    buffUnmet,
    buffForbidden,
    buffSources,
    endsLoop,
    realEnergyBefore,
    frame: frameStart, frames, tag, active, timestopBanked, holdPaid, holdCut,
    heldLocal, heldGlobal, heldEnemy,
    opensFields,
  };

  if (castSide && casting(Cast.Outro)) {
    const n = state.slots.length;
    state.active = (state.active + state.outroDir + n) % n;
  }
  ctx.hit = null;
  return snapshot ?? result;
}

/** A press's motion stop on every inactive resonator's queued hits (`ctx.offFieldShift`, the real
 *  frames it held them past the hold already standing): each due after its cast at `from` comes
 *  that much later. Time stop moves none of them: animations play on through it. */
function shiftOffField(state: State, shift: number, from: number): void {
  for (const h of state.timed) {
    if (h.slot === state.presser || h.due <= from) continue;
    // a hold cut short gives back what it held, never past where the new one starts
    h.due = Math.max(from, h.due + shift);
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
interface Step { action: Action; slot: number; by: HeldBuff | null; group: ActionGroup | null; end: boolean; spill: ActionGroup | null; queued: boolean; event: boolean; cut: ActionTag | null; at?: number; into?: Result | null; away?: boolean; frames?: number; closes?: boolean; triggered?: boolean; hold?: boolean; waited?: boolean; holdShift?: number; endCut?: string; check?: () => void }

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
  /** The steps the rotation wrote still to come, past anything queued in front of them. */
  *written(): Generator<Step> {
    for (let k = this.front.length - 1; k >= 0; k--) if (this.front[k]!.slot < 0 && !this.front[k]!.queued) yield this.front[k]!;
    for (let k = this.at; k < this.list.length; k++) if (this.list[k]!.slot < 0 && !this.list[k]!.queued) yield this.list[k]!;
  }
}

/** `steps`' presses, each resolved as it is reached — none for a marker resolving to nothing or a skip. */
function* pressesOf(steps: Iterable<Step>): Generator<Action> {
  for (const step of steps) {
    const a = step.action.resolveFn ? resolving(step.action.resolveFn) : step.action;
    if (a && a !== SKIP) yield a;
  }
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
  const nextWas = ctx.nextPresses;
  ctx.nextPresses = () => pressesOf(steps.written());
  // The group whose beat is still resolving — its own members, then the follow-ups they queued,
  // the last member's included. Every cast spliced in while this stands is that group's spill, and
  // the next rotation entry (or an engine event) clears it.
  let spillGroup: ActionGroup | null = null;
  let guard = 0;
  while (steps.size || (flush && (state.timed.length || state.behindNext.length))) {
    if (++guard > 10000) throw new Error("action queue did not drain");
    settleHold(state);
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
    // whatever is already queued plays before the clock moves on, but an engine event, which
    // waits out the press playing (`queueEvent()`)
    const ahead = steps.peek();
    const walking = ahead?.queued && !ahead.event ? state.real < state.playsTo : walk(state, steps, spillGroup);
    // a flush's end plays out what is left on the clock a frame at a time, in its own order
    const draining = flush && !steps.size;
    // the clock is kept in due order, so what can be due is a run at its head
    const timed = state.timed, first = draining && timed.length ? timed[0]!.due : 0, limit = draining ? first : state.real;
    // a hit on the clock whose time has come lands before the next cast, at its own frame — but one
    // landing off field (an Outro's, an insta swap's) due on the very frame the next press starts
    // lands after it, so the incoming Intro is cast first
    let head = 0, anyDue = false;
    for (; head < timed.length && timed[head]!.due <= limit; head++) if (isDue(timed[head]!, draining, first, state.real, walking)) anyDue = true;
    if (anyDue) {
      const due: Timed[] = [], kept: Timed[] = [];
      for (let k = 0; k < head; k++) (isDue(timed[k]!, draining, first, state.real, walking) ? due : kept).push(timed[k]!);
      for (let k = head; k < timed.length; k++) kept.push(timed[k]!);
      state.timed = kept;
      // one landing mid-group is that group's spill, like any follow-up there, so its row stays whole
      const spill = ctx.insideGroup ? spillGroup : null;
      const landed: Step[] = [];
      for (const h of due) {
        // a check on the clock runs in its place among what lands, behind everything due before it
        if (h.check) {
          const check = newStep(SKIP, h.slot, null, null, false, spill, true, null, h.due);
          check.check = h.check;
          landed.push(check);
          continue;
        }
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
        for (const q of pendingQueue) landed.push(queuedStep(q, spillGroup, h.due));
        pendingQueue.length = 0;
      }
      steps.unshift(landed);
    }
    if (!steps.size) continue;
    // a rotation press waits for the last one to finish playing: the walk only stopped short of it
    // to land what fell due on the way
    const up = steps.peek()!;
    if ((!up.queued || up.event) && state.real < state.playsTo) continue;
    const step = steps.take();
    // the fight is over at its end: nothing is cast past it (a break queued behind the last outro) —
    // but one cast by then that can't be swapped out of plays out, and the end waits for it
    if (step.at === undefined ? state.real > until : step.at > until) continue;
    if (step.check) {
      const now = state.real;
      state.setReal(step.at!);
      ctx.state = state;
      ctx.slot = state.slots[step.slot]!;
      step.check();
      state.setReal(Math.max(now, state.real));
      continue;
    }
    const unswappable = flush && until < Infinity && step.event;
    if (step.closes) {
      const now = state.real, field = state.onField, before = state.active;
      state.active = step.slot;
      state.setReal(step.at!);
      if (step.away) state.onField = -1;
      ctx.pressFrames = step.frames ?? 0;
      ctx.pressStart = step.into?.realStarts ?? state.real;
      closePress(state, step.action, !!step.triggered, step.endCut ?? "");
      state.setReal(Math.max(now, state.real));
      state.onField = field;
      state.active = before;
      if (pendingQueue.length) takeQueued(steps, spillGroup, step.at);
      continue;
    }
    // a member pressing again is done with any press of theirs still playing on behind a swap: its end
    // lands now, ahead of the new cast, behind the hits a hold kept past their own frame — the hits
    // still to come stay where they are, the kit's to cut (an Outro or SWAP is the swap-out itself)
    // ...a real press: a wait (a cooldown's, a handoff's) has no cast and no bullets, and presses nothing
    const presses = step.action.cast !== null || step.action.bullets.length > 0 || !!step.action.resolveFn;
    if (!step.queued && step.slot < 0 && presses && step.action !== SWAP && step.action.cast !== Cast.Outro) {
      const owner = state.active, now = state.real;
      const ends = state.timed.filter((h) => h.behind && h.slot === owner && h.due > now);
      const open = state.timed.filter((h) => ends.some((e) => e === h || (h.into !== null && h.into === e.into && (h.at ?? h.due) <= now)));
      if (open.length) {
        state.timed = state.timed.filter((h) => !open.includes(h));
        open.sort((a, b) => Number(!!a.closes) - Number(!!b.closes) || a.due - b.due);
        steps.unshift([...open.map((h) => newStep(h.action!, h.slot, h.by, null, false, null, true, null, now, h)), step]);
        continue;
      }
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
        // an Outro or a swap form handed over: the swap was paid before it
        state.swapPaid = false;
        state.presser = state.active;
        steps.unshift([step]);
        continue;
      }
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
    let action: Action | null = step.action;
    if (step.action.resolveFn) {
      // a marker reads state via the "current" pointers, same as any other kit logic — evaluate()
      // sets them again immediately after anyway, so no save/restore needed here
      ctx.state = state;
      ctx.slot = state.slot;
      action = resolving(step.action.resolveFn);
      // an `everyOther()` reached for real, not peeked at: its count moves on, play or skip
      if (step.action instanceof EveryOther) state.slot.everyOther++;
      // resolved to no cast at all this step (deferred onto a later one — see `queueOnIntro()`)
      if (!action) continue;
      // skipped, and the rest of its group with it
      if (action === SKIP) {
        if (step.group) {
          while (steps.size && steps.peek()!.group === step.group) steps.take();
          ctx.insideGroup = false;
        }
        continue;
      }
    }
    // a plain dodge something takes the place of on the frame it would be cast (the enemy's
    // `takesCut`, a ready Tune Break): the press it cut reads the cut it became, and what
    // replaces it plays here instead — the group the dodge closed closing on that press
    const behind = state.lastOwn, marker = step.action as unknown as DashMarker;
    if (marker.after !== undefined && (action === DEFAULT_DODGE || action === ECHO_DODGE)
      && behind && behind.member === state.slot.name && state.enemy.resonator?.takesCut) {
      ctx.state = state;
      ctx.slot = state.slot;
      const enemy = state.enemy.resonator;
      asSource(enemy, () => enemy.takesCut!(behind.action, marker.kind));
      if (ctx.cutReplaced) {
        (behind as unknown as { tag: string }).tag = ctx.cutReplaced;
        // the dodge the rotation wrote is still what the next press follows
        state.slot.lastPress = action;
        if (step.end) {
          behind.groupEnd = true;
          behind.dashDropped = true;
        }
        ctx.cutReplaced = "";
        if (pendingQueue.length) takeQueued(steps, spillGroup, undefined);
        continue;
      }
    }
    // ...and the same behind a swap form or a plain, on-hit or insta cancel, read once on the frame
    // the rotation's next step would be cast: the cut's delay already played, what goes in plays
    // there ahead of that step — a swap form's Outro or SWAP still after it
    const cutBehind = state.lastOwnCut;
    if (step.slot < 0 && !step.queued && STEP_CUTS.has(cutBehind)
      && behind && behind.member === state.slot.name && state.enemy.resonator?.takesCut) {
      state.lastOwnCut = "";
      ctx.state = state;
      ctx.slot = state.slot;
      const enemy = state.enemy.resonator;
      // the step reached is the press after the cut
      ctx.nextPresses = () => pressesOf([step, ...steps.written()]);
      asSource(enemy, () => enemy.takesCut!(behind.action, cutBehind as ActionTag));
      ctx.nextPresses = () => pressesOf(steps.written());
      if (ctx.cutReplaced) {
        (behind as unknown as { tag: string }).tag = ctx.cutReplaced;
        ctx.cutReplaced = "";
        steps.unshift([step]);
        if (pendingQueue.length) takeQueued(steps, spillGroup, undefined);
        continue;
      }
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
      // asked with the INTRO the arrival will cast, read only once reached
      const hold = into?.holdFn && into.intro ? into.holdFn(INTRO) : null;
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
    // an OFF_FIELD press, an Outro (a handoff), or anything with a source to name, is nobody's press
    const triggered = action.tag === ActionTag.OffField || action.cast === Cast.Outro || by !== null;
    // a dash the next press out-prioritises is cut short by it, an insta cancel that keeps its hit:
    // its cast priority above the dash's own where an insta cut hands over
    let dash = false;
    if ((step.action as unknown as DashMarker).after !== undefined) {
      const ahead = steps.peek();
      const next = !ahead || ahead.queued || ahead.slot >= 0 ? null : ahead.action.resolveFn ? resolving(ahead.action.resolveFn) : ahead.action;
      const c = action.cost(ActionTag.InstaCancel);
      dash = !!next && next !== SKIP && next.cutIn !== null && next.cutIn > action.priorityAt(c.action + c.global);
    }
    // an echo whose cut frees its wearer no sooner plays whole (`Action.cutPays`)
    let cut = uncut ? null : dash ? ActionTag.InstaCancel : step.cut;
    const pressed = action;
    if (cut && !dash) [action, cut] = action.cutAs(cut);
    const kind = cut ?? action.tag;
    const checked = !dash && action.half === null;
    if (checked && LENGTH_CHECKED.has(kind)) checkCutLength(pressed.cancelOf ?? pressed, kind);
    // a marker resolving to presses of either kind can't be written insta for the hitless one alone
    const slow = checked && !step.action.resolveFn && SLOW_CUTS.has(kind), cutAt = !slow ? 0 : action.cutFrame;
    if (slow && cutAt <= INSTA_DELAY) {
      throw new Error(`${action.name}: cuts at frame ${cutAt}, inside an insta cut's ${INSTA_DELAY} — write it as ${INSTA_OF[kind as ActionTag]} instead of ${kind}`);
    }
    // nothing is cast at priority 0, the floor any press has to beat; what the engine queues aside is no
    // press, nor a wait (no cast, no hits)
    if (step.slot < 0 && !step.queued && !triggered && (action.cast !== null || action.bullets.length > 0) && !((action.castPriority ?? 0) >= 1)) {
      throw new Error(`${action.name}: pressed at cast priority ${action.castPriority ?? 0} — a press needs 1 or more`);
    }
    // a member's own press off the rotation, OFF_FIELD ones aside: what it follows and where they stand
    const mover = step.slot < 0 && !step.queued && by === null && pressed.tag !== ActionTag.OffField
      && (pressed.cast !== null || pressed.bullets.length > 0) ? state.slot : null;
    if (mover) checkPress(state, pressed, step.at ?? state.real);
    const breaker = pressed.cast === Cast.TuneBreak && pressed.half === null ? state.slot : null;
    // a written cut lands only where what cuts in beats the press's priority: its dash or jump, the
    // press a cut-short dash gives way to, else the next press
    if (step.slot < 0 && !step.queued && PRIORITY_CUTS.has(kind)) {
      ctx.state = state;
      ctx.slot = state.slot;
      const ahead = steps.peek();
      const after = !ahead || ahead.queued || ahead.slot >= 0 ? null : ahead.action.resolveFn ? resolving(ahead.action.resolveFn) : ahead.action;
      checkPriority(action, cut, after);
    }
    if (step.slot < 0 && !step.queued && checked) checkSwap(state, action, kind, steps.peek());
    // a press that takes time casts now and queues each hit on the time-ordered queue at its own
    // frame, and its end where it runs out
    const whole = action;
    const splits = whole.splitsHit(cut);
    const castAt = step.at ?? state.real, away = splits && whole.hitsAway(cut);
    let split: Timed[] | null = null, splitEnd: Timed | null = null;
    if (splits) {
      split = [];
      for (let k = 0; k < whole.bullets.length; k++) {
        const due = castAt + whole.hitDelay(k);
        // `at` keeps its own frame, where a motion stop's hold moves `due` on
        const hit = timedEntry(due, whole.hitPart(k), state.active, null, away, undefined, 0, undefined, false);
        hit.at = due;
        split.push(hit);
      }
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
    if (cut === ActionTag.HoldCancel || cut === ActionTag.MashCancel) {
      const after = steps.peek()?.action ?? ctx.holdBeyond;
      ctx.holdNext = after?.resolveFn ? resolving(after.resolveFn) : after;
    }
    ctx.hitsLeft = step.into?.pending ?? 1;
    const result = evaluate(state, action, triggered, by, cut);
    if (step.into?.pending) step.into.pending--;
    ctx.hitsLeft = 1;
    // SWAP takes its owner off the field, as an Outro does: whoever presses next takes it
    if (action === SWAP) state.onField = -1;
    ctx.holdNext = null;
    if (state.holdWatch?.result === null) state.holdWatch.result = result;
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
    // each hit carries its press's length, and the end (afterAction) is where the press stops: a cut
    // one at its cut and delay, ahead of any committed hit still to land, else past its last hit
    if (split) {
      for (const h of split) {
        h.frames = ctx.actFrames;
        h.triggered = triggered;
      }
      let last = castAt;
      for (const h of split) last = Math.max(last, h.due);
      // a swap form cuts nothing: the press plays on behind the swap to its own end
      const plays = whole.castsInstantly || SWAP_FORMS.has(kind);
      const stops = castAt + (plays ? whole.animFrames : ctx.actReal) + (step.holdShift ?? 0);
      const end = timedEntry(
        cut && !plays ? stops : Math.max(last, stops), whole.endPart(), state.active, null, away, undefined,
        ctx.actFrames, true, triggered,
      );
      end.cut = kind;
      // ...and a swap form's plays on behind the swap, until its owner presses again
      end.behind = SWAP_FORMS.has(kind);
      insertByDue(state.timed, end);
      splitEnd = end;
    }
    // a Tune Break is nobody's press, but it moves who casts it
    if (breaker && pressed.endPosition !== null) breaker.position = pressed.endPosition;
    if (mover) {
      if (pressed.keepsChain && mover.lastPress) mover.savedChains.push(mover.lastPress);
      mover.lastPress = pressed;
      // cut within an insta cut's frames, a press never gets where it goes; a jump always lifts
      const short = kind !== ActionTag.Default && ctx.actReal <= INSTA_DELAY && pressed.cast !== Cast.Jump;
      if (pressed.endPosition !== null && !short) mover.position = pressed.endPosition;
      mover.endsAt = splitEnd ? splitEnd.due : castAt + ctx.actReal;
    }
    if (step.at !== undefined) {
      state.setReal(Math.max(now, state.real));
      state.onField = field;
    }
    if (step.into) {
      landHit(step.into, result, result.starts);
    } else {
      result.group = step.group;
      result.groupEnd = step.end;
      result.groupSpill = step.spill;
      result.queued = step.queued;
      // one row stands for the whole press, in cast order: each hit adds itself in as it lands
      if (split) {
        for (const h of split) h.into = result;
        result.pending = split.length;
        splitEnd!.into = result;
        result.action = whole;
      }
      out.push(result);
      // a swap form's own delay is the swap's: the Outro or SWAP after it pays none
      const tag = cut ?? action.tag;
      if (SWAP_FORMS.has(tag)) state.swapPaid = true;
      if (!step.queued && !triggered && !isCast(action, Cast.Outro)) {
        state.lastOwn = result;
        state.lastOwnCut = tag;
        // a cut something may follow is read on its own cut frame (the enemy's `atCut`), behind
        // whatever lands by then: the cut's delay after it is only the input
        const enemy = state.enemy.resonator;
        if (enemy?.atCut && TAKEN_CUTS.has(tag)) {
          const check = (): void => asSource(enemy, () => enemy.atCut!(whole, tag));
          const entry = timedEntry(castAt + whole.cost(tag).action, null, state.active, null, false, undefined, undefined, undefined, undefined);
          entry.check = check;
          insertByDue(state.timed, entry);
        }
      }
    }
    // a queued follow-up's own turn doesn't stick — restore whoever was actually active,
    // unless the follow-up was itself an outro (genuinely advances the team)
    if (step.slot >= 0 && state.active === step.slot) state.active = before;

    if (pendingQueue.length) {
      // spliced in right after the action that queued them, i.e. at the read cursor. A follow-up
      // is never one of the casts a group names, whatever it was queued from; it belongs to
      // whatever beat spawned it — an engine event to nobody (`queueEvent`)
      // a follow-up lands with whatever queued it: a hit at its own frame (a tick's, a queued hit's),
      // a cast at its cast, a whole press at its hit rather than after the rest of its frames
      const from = split ? result.realStarts : result.ends;
      takeQueued(steps, spillGroup, step.at ?? (from < state.real ? from : undefined));
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
  ctx.nextPresses = nextWas;
  return out;
}

/** The cuts that play up to the cut frame (`cutFrame`) — pointless on a press whose cut frame an
 *  insta cut (6f) already reaches, so writing one there throws. */
const SLOW_CUTS = new Set<string>([ActionTag.Cancel, ActionTag.DodgeCancel, ActionTag.JumpCancel, ActionTag.SwapCancel]);
/** What each of those is written as instead, cut insta. */
const INSTA_OF: Partial<Record<ActionTag, string>> = {
  [ActionTag.Cancel]: ".instaCancel()", [ActionTag.MashCancel]: ".instaCancel()", [ActionTag.HoldCancel]: ".instaCancel()", [ActionTag.DodgeCancel]: ".instaDodge()",
  [ActionTag.JumpCancel]: ".instaJump()", [ActionTag.SwapCancel]: ".instaSwap()", [ActionTag.MashSwap]: ".instaSwap()",
};

/** The swap forms: a press swapped out of, playing on behind the swap. */
const SWAP_FORMS = new Set<string>([ActionTag.SwapCancel, ActionTag.InstaSwap, ActionTag.MashSwap]);
/** What a swap form is written as in front of an Outro with an animation, which it can't be — a
 *  plain cancel keeping the hits an insta swap let land, where an insta cancel would drop them. */
const PLAIN_OF: Partial<Record<ActionTag, string>> = {
  [ActionTag.SwapCancel]: ".cancel()", [ActionTag.InstaSwap]: ".cancel()", [ActionTag.MashSwap]: ".mashCancel()",
};
/** ...and what a plain cut is written as in front of one with none, which only a swap reaches. */
const SWAP_OF: Partial<Record<ActionTag, string>> = {
  [ActionTag.Cancel]: ".swapCancel()", [ActionTag.InstaCancel]: ".instaSwap()", [ActionTag.MashCancel]: ".mashSwap()",
  [ActionTag.HoldCancel]: ".mashSwap()", [ActionTag.HitCancel]: ".swapCancel()",
};

/** The swap rules on `press` cut by `kind`, the next written press `ahead` read as it resolves: a swap
 *  form never inside its no-swap frames (a mash swap waits them out); in front of an Outro, a swap
 *  form where it has no animation and a plain cut where it has one — never inside them either. */
function checkSwap(state: State, press: Action, kind: string, ahead: Step | null | undefined): void {
  const at = press.cost(kind as ActionTag).action, block = press.noSwapFrames;
  if (kind === ActionTag.MashSwap && press.animFrames && block + MASH_DELAY >= press.animFrames) {
    throw new Error(`${press.name}: its mash swap lets go at frame ${block + MASH_DELAY} of ${press.animFrames}, saving nothing over playing it out`);
  }
  if ((kind === ActionTag.SwapCancel || kind === ActionTag.InstaSwap) && at < block) {
    throw new Error(`${press.name}: its ${kind} swaps at frame ${at}, inside its ${block} no-swap frames — write .mashSwap() instead`);
  }
  if (!ahead || ahead.queued || ahead.slot >= 0) return;
  ctx.state = state;
  ctx.slot = state.slot;
  const next = ahead.action.resolveFn ? resolving(ahead.action.resolveFn) : ahead.action;
  // a press played out swaps into whatever Outro follows
  if (next?.cast !== Cast.Outro || kind === ActionTag.Default || kind === ActionTag.OffField) return;
  if (SWAP_FORMS.has(kind) && next.animFrames) {
    throw new Error(`${press.name}: a ${kind} into ${next.name}, an Outro with an animation — write ${PLAIN_OF[kind as ActionTag]} instead`);
  }
  if (!SWAP_FORMS.has(kind) && !next.animFrames) {
    throw new Error(`${press.name}: a ${kind} into ${next.name}, an Outro with no animation — write ${SWAP_OF[kind as ActionTag] ?? "a swap form"} instead`);
  }
  // a mash cancel waits them out (`Action.letGo()`), and a hold is checked where it lets go
  if (!SWAP_FORMS.has(kind) && kind !== ActionTag.MashCancel && kind !== ActionTag.HoldCancel && at < block) {
    throw new Error(`${press.name}: its ${kind} into ${next.name} lets go at frame ${at}, inside its ${block} no-swap frames`);
  }
}

/** The cuts weighed against the priority of the press they cut (`checkPriority()`); a hold or a mash
 *  waits for it instead (`Action.letGo()`), and a swap answers to no-swap frames. */
const PRIORITY_CUTS = new Set<string>([ActionTag.Cancel, ActionTag.DodgeCancel, ActionTag.JumpCancel, ActionTag.InstaCancel,
  ActionTag.InstaDodge, ActionTag.InstaJump, ActionTag.HitCancel, ActionTag.DodgeOnHit, ActionTag.JumpOnHit]);

/** `by` cuts `press` only with a cast priority above `press`'s own at the frame `by` starts on —
 *  the cut and its delay played. Nothing is checked where either side declares none. */
function checkPriority(press: Action, cut: ActionTag | null, by: Action | null): void {
  const cast = by?.cutIn ?? null;
  if (cast === null) return;
  const c = press.cost(cut), at = c.action + c.global, tier = press.priorityAt(at);
  if (cast <= tier) throw new Error(`${press.name}: ${cut ?? press.tag} into ${by!.name} at frame ${at} — its cast priority ${cast} doesn't beat ${tier} there`);
}

/** `press` by the acting member at real frame `at`: an arrival restarts their chain and spawns them
 *  where despawned, then its swap-in, `chains` (or a saved chain) and `castPosition` are checked. */
function checkPress(state: State, press: Action, at: number): void {
  const slot = state.slot, from = state.lastActor, arriving = from !== slot.index;
  if (arriving) {
    slot.lastPress = null;
    slot.savedChains = [];
    if (at - slot.endsAt >= DESPAWN_TIME) slot.position = null;
    // still standing, they keep where they stand; despawned, they come in where the one leaving does (START: grounded)
    if (slot.position === null) slot.position = (from >= 0 && !state.inStart ? state.slots[from]!.position : null) ?? Position.Grounded;
    state.lastActor = slot.index;
  }
  // an arrival with no Intro opens on its swap-in press, its own chains waived
  let opens = false;
  if (arriving && press.cast !== Cast.Intro) {
    const air = !state.inStart && slot.position === Position.Midair, swapIn = air ? slot.resonator?.swapInAir : slot.resonator?.swapIn;
    if (!swapIn) throw new Error(`${slot.name}: swaps in ${POSITION_NAME[slot.position!]} but declares no ${air ? "swapInAir" : "swapIn"}`);
    ctx.state = state;
    ctx.slot = slot;
    let want = resolving(swapIn);
    if (want.resolveFn) want = resolving(want.resolveFn) ?? want;
    for (let a: Action | null = press; a && !opens; a = a.cancelOf ?? a.formOf) opens = a === want;
    if (!opens) throw new Error(`${slot.name}: swaps in ${POSITION_NAME[slot.position!]} on ${press.name} — a swap-in opens on ${want.name}`);
  }
  if (!opens && !press.follows(slot.lastPress)) {
    const k = slot.savedChains.findIndex((a) => press.follows(a));
    if (k < 0) {
      const adv = slot.savedChains.length ? ` or the saved chains ${slot.savedChains.map((a) => a.name).join(", ")}` : "";
      throw new Error(`${slot.name}: ${press.name} follows ${slot.lastPress?.name ?? "nothing, first in its visit"}${adv} — its chains allow only ${press.chainNames().join(", ")}`);
    }
    slot.savedChains.splice(k, 1);
  }
  if (press.castPosition !== null && slot.position !== press.castPosition) {
    throw new Error(`${slot.name}: ${press.name} cast ${POSITION_NAME[slot.position!]} — it needs ${POSITION_NAME[press.castPosition]}`);
  }
  // an Intro always places its owner, wherever they came in
  if (press.cast === Cast.Intro && press.endPosition === null) throw new Error(`${slot.name}: ${press.name} declares no endPosition — every Intro places its owner`);
}

/** A hold or mash cancel lets go short of its press's end — a mash's input delay played — or it
 *  saves nothing over playing the press out. */
function checkHoldCut(press: Action, kind: ActionTag, cut: number): void {
  if (!press.animFrames) return;
  if (cut >= press.animFrames) {
    throw new Error(`${press.name}: its ${kind} lets go at frame ${cut} of ${press.animFrames}, saving nothing over playing it out`);
  }
}

/** The cuts the enemy's `takesCut` is asked behind on the rotation's next step — a dodge cut is
 *  asked on its own dash instead. */
const STEP_CUTS = new Set<string>([ActionTag.SwapCancel, ActionTag.Cancel, ActionTag.HitCancel, ActionTag.InstaCancel]);
/** Every cut the enemy's `takesCut` is asked behind, each read first on its own cut frame (`atCut`). */
const TAKEN_CUTS = new Set<string>([...STEP_CUTS, ActionTag.DodgeCancel, ActionTag.InstaDodge, ActionTag.DodgeOnHit]);

/** The cuts weighed against the press they cut (`checkCutLength()`) — not an insta swap, which
 *  may run past a short press. */
const LENGTH_CHECKED = new Set<string>([ActionTag.Cancel, ActionTag.MashCancel, ActionTag.HoldCancel, ActionTag.DodgeCancel, ActionTag.InstaDodge, ActionTag.JumpCancel, ActionTag.InstaJump, ActionTag.InstaCancel, ActionTag.SwapCancel, ActionTag.MashSwap]);

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
  "frame", "realStarts", "frames", "tag", "active", "timestopBanked", "holdPaid", "holdCut", "endsLoop", "castUnmet", "buffUnmet", "buffForbidden", "buffSources", "realEnergyBefore",
  "energyBefore", "concertoBefore", "offtuneBefore", "forteBefore", "gain", "adds", "seq", "gaugeLog"]);

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

/** A hold or mash cancel whose next press needs (or can't have) a buff it found wrong at the cast: `press` (the
 *  whole press) held from real frame `start` for `cut` frames at the most, let go no sooner than `least` —
 *  `paid` frames in, where its bars and window let the next press follow. */
export interface HoldWatch {
  press: Action; owner: TeamMember; next: Action; kind: ActionTag; start: number; least: number; paid: number; cut: number; playsToBefore: number; result: Result | null;
}

/** Let a watched hold go (`HoldWatch`) once its next press's buffs stand: the next press starts
 *  there, and its bullets not committed by then never land. */
function settleHold(state: State): void {
  const w = state.holdWatch;
  if (!w?.result) return;
  const end = w.start + w.cut;
  if (state.real >= end) {
    state.holdWatch = null;
    checkHoldCut(w.press, w.kind, w.cut);
    return;
  }
  if (w.next.buffsUnmet(state, w.owner) || w.next.buffsForbidden(state, w.owner)) return;
  state.holdWatch = null;
  // the buff landing is the last thing to give way where it lands after the bars and the window:
  // a mash's input lands `MASH_DELAY` after it, as after either of those
  const paid = Math.max(w.paid, state.real - w.start);
  const at = Math.min(end, Math.max(w.least, state.real + (w.kind === ActionTag.MashCancel ? MASH_DELAY : 0))), cut = at - w.start;
  checkHoldCut(w.press, w.kind, cut);
  if (state.playsTo === end) state.playsTo = Math.max(w.playsToBefore, at);
  let last = at;
  state.timed = state.timed.filter((h) => {
    if (h.into !== w.result || h.action?.half !== "hit") return true;
    if (w.press.bullets[h.action.hitIndex]!.commitFrame > cut) return false;
    last = Math.max(last, h.due);
    return true;
  });
  const frames = cut - Math.min(cut, state.frozenWithin(w.start, at));
  for (const h of state.timed) {
    if (h.into !== w.result) continue;
    if (h.action?.half === "end") h.due = last;
    h.frames = frames;
  }
  sortByDue(state.timed);
  const row = w.result as Partial<ResolvedSnapshot>;
  if (row.frames !== undefined) {
    row.frames = frames;
    row.holdPaid = paid;
    row.holdCut = cut;
  }
}

/** Unmet cast conditions already warned: one line per team, member, press and condition. */
const warned = new Set<string>();
/** Warn that `action` was cast outside its concerto, forte or buff condition — once per team. */
function warnUnmet(state: State, slot: TeamMember, action: Action, bars: boolean[] | null, buffs: Gear[] | null, forbidden: Gear[] | null): void {
  const what: string[] = [];
  for (let k = 1; k < 7; k++) {
    if (!bars?.[k]) continue;
    // concerto in points, a forte gauge in its resonator's own units
    const min = action.castMin?.[k] ?? -Infinity, scale = k === 1 ? 100 : 1 / (slot.resonator?.forteScale[k - 2] ?? 1);
    const has = k === 1 ? slot.concerto : slot.forte[k - 2]!;
    const need = min > -Infinity ? `>= ${min / scale}` : `<= ${action.castMax![k]! / scale}`;
    what.push(`${k === 1 ? "concerto" : `forte${k - 1}`} ${has / scale} (needs ${need})`);
  }
  for (const b of buffs ?? []) what.push(`buff ${b.name}`);
  const under = (forbidden ?? []).map((b) => `buff ${b.name}`);
  if (!what.length && !under.length) return;
  const team = state.slots.map((m) => m.name).join(" / ");
  const key = `${team}|${slot.name}|${action.name}|${what.join(",")}|${under.join(",")}`;
  if (warned.has(key)) return;
  warned.add(key);
  const parts = [what.length ? `without ${what.join(", ")}` : "", under.length ? `under ${under.join(", ")}` : ""].filter(Boolean);
  console.warn(`[${team}] ${slot.name}: ${action.name} cast ${parts.join(" and ")}`);
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
    state.runTicks(gameFrom, state.gameOf(to), stop, thaw);
    state.setReal(to);
    state.expireBuffs();
    settleHold(state);
    if (pendingQueue.length) takeQueued(steps, spillGroup, undefined);
    if (to < state.playsTo) return true;
  }
  return false;
}

/** What the last hook queued (`pendingQueue`), put in front of the steps — at `at` where given. */
function takeQueued(steps: StepQueue, spillGroup: ActionGroup | null, at: number | undefined): void {
  steps.unshift(pendingQueue.map((q) => queuedStep(q, spillGroup, at)));
  pendingQueue.length = 0;
}

/** A step for one queued cast: an engine event (`queueEvent()`) is nobody's spill, and waits out the
 *  press playing to go where the clock then is. */
function queuedStep(q: (typeof pendingQueue)[number], spillGroup: ActionGroup | null, at: number | undefined): Step {
  const step = newStep(q.action, q.slot, q.by, null, false, q.event ? null : spillGroup, true, null, q.event ? undefined : at);
  step.event = q.event;
  return step;
}

/** A step with every field set, in one order — `run()` then reads one shape. `from`: the clock entry it
 *  lands off, whose own fields it carries. */
function newStep(
  action: Action, slot: number, by: HeldBuff | null, group: ActionGroup | null, end: boolean, spill: ActionGroup | null, queued: boolean,
  cut: ActionTag | null, at: number | undefined = undefined, from: Timed | null = null, hold = false,
): Step {
  return {
    action, slot, by, group, end, spill, queued, event: false, cut, at,
    into: from ? from.into : undefined, away: from ? from.away : undefined,
    frames: from ? from.frames : undefined, closes: from ? from.closes : undefined, triggered: from ? from.triggered : undefined, endCut: from?.cut,
    hold, waited: false, holdShift: undefined, check: undefined,
  };
}

/** A cancelled step plays its own Action (duck-checked, the class being rotation.ts's). */
function unwrap(a: Action): [Action, ActionTag | null] {
  return (a as CancelledStep).of !== undefined ? [(a as CancelledStep).of, (a as CancelledStep).kind] : [a, null];
}

/** The clock entry that lands an Outro's own buffs (`queueQTE`) on the Intro's QTE frame `due`. */
function qteLanding(state: State, slot: TeamMember, due: number): Timed {
  const land = (): void => {
    for (const gear of state.qteQueue.splice(0)) slot.addStack(gear, 1);
  };
  return timedEntry(due, null, state.active, null, undefined, land, undefined, undefined, undefined);
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
    heldPools[0]!.filter(([g]) => !slot.equipped.has(g)).map(describe).filter(named),
    heldPools[1]!.map(describe).filter(named),
    heldPools[2]!.filter(([g]) => !state.enemy.equipped.has(g)).map(describe).filter(named),
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
  factorsOf(ONE, 0, action.scaling, eff);
  return avgFromFactors(ONE, 0, action.scaling, action.mv);
}

/** A row's damage factors (`damageFactorsInto()`) into `out[k...]` — folding only the one stat the
 *  scaling reads. */
function factorsOf(out: Float64Array, k: number, scaling: Scaling | null, eff: StatRow): void {
  damageFactorsInto(
    out, k, scaling, eff,
    scaling === Scaling.Atk ? foldStat(eff, Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk) : 0,
    scaling === Scaling.Hp ? foldStat(eff, Stat.BaseHp, Stat.BonusHp, Stat.FlatHp) : 0,
    scaling === Scaling.Def ? foldStat(eff, Stat.BaseDef, Stat.BonusDef, Stat.FlatDef) : 0,
    eff[Stat.Amp]!, eff[SUBTYPE_AMP_INDEX]!, eff[Stat.DmgBonus]!,
    eff[SUBTYPE_CRIT_RATE_INDEX]!, eff[SUBTYPE_CRIT_DMG_INDEX]!,
    eff[SUBTYPE_TOTAL_DMG_INDEX]!, eff[SUBTYPE_DAMAGE_TAKEN_INDEX]!,
    enemyRes(), enemyDef(),
  );
}

/** What a row reads off the last hit that dealt something: a marker bullet landing after it moves
 *  the gauges but leaves the stats the damage paid on. */
const DAMAGE_KEEPS = new Set(["type", "stat", "stats", "atk", "hp", "def", "amp", "subtypeAmp", "subtypeCritRate", "subtypeCritDmg",
  "subtypeTotalDmg", "subtypeDamageTaken", "dmgBonus", "enemyRes", "enemyDef", "entries", "heldLocal", "heldGlobal", "heldEnemy"]);

/** Add one of a split press's hits, landed at `at`, into its cast row. */
function landHit(row: Result, hit: Result, at: number): void {
  // the first hit replaces what the cast dealt; each after it adds on
  const summed = row.hitAt !== undefined, avg = row.avg, mv = row.mv;
  if (ctx.tracing) {
    const r = row as unknown as Record<string, unknown>, h = hit as unknown as Record<string, unknown>;
    const fields = r.opensFields as ActionField[] | undefined;
    const steps = (r.gaugeLog as GaugeStep[] | undefined) ?? [{ seq: r.seq as number, delta: gaugeDelta(row as ResolvedSnapshot) }];
    steps.push({ seq: h.seq as number, delta: gaugeDelta(hit as ResolvedSnapshot) });
    const marker = hit.action.mv === 0 && summed && mv !== 0;
    for (const k of Object.keys(h)) if (!CAST_KEEPS.has(k) && !(marker && DAMAGE_KEEPS.has(k))) r[k] = h[k];
    r.gaugeLog = steps;
    // what hooks added sums over the press, every part's own
    const g = r.gain as number[] | null, hg = h.gain as number[] | null;
    if (hg) r.gain = g ? g.map((v, n) => v + hg[n]!) : hg.slice();
    r.adds = [...(r.adds as GainAdd[]), ...(h.adds as GainAdd[])];
    if (fields) r.opensFields = [...fields, ...(h.opensFields as ActionField[])];
  } else {
    // a lean row carries only these past what it keeps of its cast
    row.mv = hit.mv;
    row.avg = hit.avg;
    row.starts = hit.starts;
    row.ends = hit.ends;
  }
  if (summed) {
    row.avg += avg;
    row.mv += mv;
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

/** Per scaling, the row indices `damageFactorsInto` reads: a variant moving none of them deals what the
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

/** A pure variant's damage factors into `out[k...]`, its moved indices (as `sparseRow` works them) patched
 *  into `from` and back out. False where it deals what the real build deals; unsafe where a resource moved. */
function variantFactors(slot: TeamMember, v: number, scaling: Scaling | null, diff: number[], vbase: StatRow, from: StatRow, pre: StatRow,
  out: Float64Array, k: number): boolean {
  chainJournal();
  const value = replay.value, k1 = replay.length;
  const reads = scaling === null ? null : DAMAGE_READS[scaling]!;
  let moved = false, dealt = false;
  for (let d = 0; d < diff.length; d++) {
    const i = diff[d]!;
    let x = pre[i]! + vbase[i]!;
    for (let j = chainHeadOf(i); j >= 0 && j < k1; j = chainNext[j]!) x = x + value[j]!;
    patchAt[d] = x;
    if (x !== from[i]) {
      if (RESOURCE_MASK[i]) moved = true;
      if (reads !== null && reads[i]) dealt = true;
    }
  }
  if (moved) slot.variantUnsafe[v] = true;
  if (!dealt) return false;
  for (let d = 0; d < diff.length; d++) {
    const i = diff[d]!;
    patchWas[d] = from[i]!;
    from[i] = patchAt[d]!;
  }
  factorsOf(out, k, scaling, from);
  for (let d = 0; d < diff.length; d++) from[diff[d]!] = patchWas[d]!;
  return true;
}

/** Whether variant `v` deals what the real build does at motion value `mv`: it moves nothing the
 *  formula reads, or the hit has no motion value and the variant adds none. */
const dealsPrimary = (dealt: boolean, mv: number, from: StatRow, at: VariantAt, v: number): boolean =>
  !dealt || (mv === 0 && from[Stat.AddMv] === 0 && !at.addMv[v]);

const ONE = new Float64Array(FACTOR_COUNT);

/** Variant `v`'s damage on the action being evaluated, worked out alone (`variantFactors()`). */
function scoreVariant(slot: TeamMember, v: number, action: Action, at: VariantAt, from: StatRow, pre: StatRow): number {
  const dealt = variantFactors(slot, v, action.scaling, at.diffs[v]!, at.bases[v]!, from, pre, ONE, 0);
  return dealsPrimary(dealt, action.mv, from, at, v) ? avgOf(action, from) : avgFromFactors(ONE, 0, action.scaling, action.mv);
}

/** Every variant's damage, none re-run dry: their factors are worked out once for what the part reads
 *  (`VariantMemo`, kept per tag word), and each part's own motion value goes over them. */
function scoreVariants(slot: TeamMember, action: Action, at: VariantAt, from: StatRow, pre: StatRow, base: StatRow | null): number[] {
  const n = slot.variants.length, scaling = action.scaling, mv = action.mv;
  let memo = at.memo, fresh = false;
  if (memo === null || !memoHolds(memo, scaling, from, pre, base)) {
    const prev = at.memo2;
    if (prev !== null && memoHolds(prev, scaling, from, pre, base)) {
      at.memo2 = memo;
      at.memo = memo = prev;
    } else {
      memo = keep(at, n, scaling, from, pre, base);
      fresh = true;
      factorsOf(memo.factors, n * FACTOR_COUNT, scaling, from);
      for (let v = 0; v < n; v++) memo.dealt[v] = variantFactors(slot, v, scaling, at.diffs[v]!, at.bases[v]!, from, pre, memo.factors, v * FACTOR_COUNT);
    }
  }
  if (!fresh && memo.out !== null && memo.mv === mv) return memo.out;
  const f = memo.factors, primary = avgFromFactors(f, n * FACTOR_COUNT, scaling, mv);
  const out: number[] = [];
  for (let v = 0; v < n; v++) out.push(dealsPrimary(memo.dealt[v]!, mv, from, at, v) ? primary : avgFromFactors(f, v * FACTOR_COUNT, scaling, mv));
  memo.mv = mv;
  memo.out = out;
  return out;
}

/** Whether `memo` was worked out off exactly what the part being evaluated reads. */
function memoHolds(memo: VariantMemo, scaling: Scaling | null, eff: StatRow, pre: StatRow, base: StatRow | null): boolean {
  if (memo.scaling !== scaling || memo.length !== replay.length) return false;
  const index = replay.index, value = replay.value;
  for (let k = 0; k < memo.length; k++) if (memo.index[k] !== index[k] || memo.value[k] !== value[k]) return false;
  // the very constant base with nothing written ahead of it, then the very same journal: the same rows
  if (base !== null && base === memo.base && pre === ZERO_STATS && memo.zeroPre) return true;
  const mEff = memo.eff, mPre = memo.pre;
  for (let i = 0; i < eff.length; i++) if (mEff[i] !== eff[i] || mPre[i] !== pre[i]) return false;
  return true;
}

/** `at`'s memo, set to what the part being evaluated reads — its factors still to fill — the one it
 *  replaces kept second. */
function keep(at: VariantAt, n: number, scaling: Scaling | null, eff: StatRow, pre: StatRow, base: StatRow | null): VariantMemo {
  const memo = at.memo2 ?? {
    scaling, eff: statRow(), pre: statRow(), index: [], value: [], length: 0, factors: new Float64Array((n + 1) * FACTOR_COUNT), dealt: [], mv: 0, out: null,
    base: null, zeroPre: false,
  };
  at.memo2 = at.memo;
  at.memo = memo;
  memo.scaling = scaling;
  memo.out = null;
  memo.base = base;
  memo.zeroPre = pre === ZERO_STATS;
  memo.eff.set(eff);
  memo.pre.set(pre);
  const len = replay.length;
  for (let k = 0; k < len; k++) {
    memo.index[k] = replay.index[k]!;
    memo.value[k] = replay.value[k]!;
  }
  memo.length = len;
  return memo;
}

/** Whether a variant's row banks a resource differently from the real build's `from` — only its
 *  own moved indices (`diff`) can, every other one being a copy. */
function resourceMoved(diff: number[], eff: StatRow, from: StatRow): boolean {
  for (let d = 0; d < diff.length; d++) { const i = diff[d]!; if (RESOURCE_MASK[i] && eff[i] !== from[i]) return true; }
  return false;
}

const RESOURCE_MASK: boolean[] = Array.from(ZERO_STATS, () => false);
for (const s of RESOURCE_STATS) RESOURCE_MASK[s] = true;

const capList: Gear[][] = [[], [], []];
const capCounts: number[][] = [[], [], []];
const capHooks: number[][][] = [[], [], []];
const capFns: (() => void)[][][] = [[], [], []];

/** Take the three pools as they stand right now, for the phases that follow to run on. A Gear is
 *  only ever in one pool — a self buff is local, a team buff global, a debuff on the enemy — so
 *  the three are simply visited in turn, local first. */
let capSlot: TeamMember | null = null, capState: State | null = null, capVersion = -1;
/** The phases (bit per phase) some captured Gear has a hook for. */
let capPhases = 0;
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
  capPhases = slot.stacks.phases | state.globalStacks.phases | pool.phases;
}

/** Every captured Gear's constantStats summed into a fresh array, in roster order — the slot's
 *  own cached base for one tag word. With `swaps`, each held piece a variant swaps (a main stat, a
 *  set piece, the substat tier its ER moves) is stood in for by its own at the very same position,
 *  so a variant's base is built by exactly the additions, in exactly the order, a real run wearing
 *  them would make. */
function constBaseOf(slot: TeamMember, swaps: readonly PieceSwap[] | null): StatRow {
  const live = slot.effective;
  slot.effective = statRow();
  for (let q = 0; q < 3; q++) {
    const list = capList[q]!, counts = capCounts[q]!, hooks = capHooks[q]![6]!;
    for (let i = 0, m = hooks.length; i < m; i++) {
      const k = hooks[i]!;
      let gear = list[k]!;
      if (swaps) gear = swapped(gear, swaps);
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
interface Roster { any: boolean; bases: Map<string, CachedBase>; plain: Map<number, CachedBase>; variants: Map<string, VariantBases> }
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
  if (!roster) ROSTERS.set(key, (roster = { any, bases: new Map(), plain: new Map(), variants: new Map() }));
  SLOT_ROSTERS.set(slot, { version: ctx.constVersion, roster });
  return roster;
}
function cachedBase(slot: TeamMember, swaps: readonly PieceSwap[] | null): StatRow {
  const roster = rosterOf(slot);
  const plain = swaps === null;
  const key = plain ? "" : `${ctx.tagWord}#${swapKey(swaps)}`;
  let hit = plain ? roster.plain.get(ctx.tagWord) : roster.bases.get(key);
  if (hit === undefined) {
    const wrote = ctx.wrote;
    const row = constBaseOf(slot, swaps);
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

/** The slot's variants' bases for the tag word being evaluated and where each differs from the real
 *  build's — fixed by the constant roster and the pieces swapped, so made once for every run. */
function variantBasesOf(slot: TeamMember): VariantBases {
  const roster = rosterOf(slot);
  const key = `${ctx.tagWord}#${slot.variantKey ??= slot.variants.map(swapKey).join(",")}`;
  let made = roster.variants.get(key);
  if (made) return made;
  const base = slot.constBase.get(ctx.tagWord)!;
  made = { bases: [], diffs: [], union: [], addMv: [] };
  for (let v = 0; v < slot.variants.length; v++) {
    const vbase = cachedBase(slot, slot.variants[v]!), diff: number[] = [];
    for (let i = 0; i < vbase.length; i++) if (vbase[i] !== base[i]) diff.push(i);
    made.bases.push(vbase);
    made.diffs.push(diff);
    made.addMv.push(diff.includes(Stat.AddMv));
    for (const i of diff) if (!made.union.includes(i)) made.union.push(i);
  }
  roster.variants.set(key, made);
  rosterBases++;
  return made;
}

/** The piece `swaps` stand in for `gear`, else `gear` itself. */
function swapped(gear: Gear, swaps: readonly PieceSwap[]): Gear {
  for (const [from, to] of swaps) if (gear === from) return to;
  return gear;
}
const swapKey = (swaps: readonly PieceSwap[]): string => swaps.map(([from, to]) => `${from.id}>${to.id}`).join("+");

/** Run one phase's hook on every captured Gear that has it, with the "current" pointers aimed at
 *  each in turn. `withStacks` hands each hook its own captured stack count (see `frozenStacks()`);
 *  afterAction runs without, reading the live count instead, since it is the one phase that
 *  runs after a gear may already have spent itself down. */
/** Which of `runPhase()`'s phases run for the action being evaluated: a cast half the cast's
 *  (`updateBuffs`) and no stat phase, a queued hit only the hit's, a whole press both. */
const CAST_PHASES = 1 << 1;
const HIT_PHASES = (1 << 0) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 6) | (1 << 7);
/** The onHit grants, on a part that lands a hit. */
const ON_HIT_PHASES = 1 << 8;
const END_PHASES = 1 << 5;
let phaseMask = CAST_PHASES | HIT_PHASES | ON_HIT_PHASES | END_PHASES;
function runPhase(p: number, withStacks: boolean): void {
  if (!(((phaseMask & capPhases) >> p) & 1)) return;
  ctx.inStats = ((STAT_PHASES >> p) & 1) === 1;
  ctx.inEnd = p === 5;
  try {
    runHooks(p, withStacks);
  } finally {
    ctx.inStats = false;
    ctx.inEnd = false;
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

/** Whether the part being evaluated has a conversion to run: its own, or a captured Gear's. */
function hasConversions(action: Action): boolean {
  if (action.convertStatsFn || action.lateConvertStatsFn) return true;
  for (let q = 0; q < 3; q++) if (capHooks[q]![3]!.length || capHooks[q]![4]!.length) return true;
  return false;
}

/** A conversion phase as `actionHook` + `runPhase` run it, each call logged (`hookLog`). */
function logPhase(own: (() => void) | undefined, p: number): void {
  if (!((phaseMask >> p) & 1)) return;
  if (own) logCall(own, ctx.act!, 1);
  if (!((capPhases >> p) & 1)) return;
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
  ctx.inEnd = p === 5;
  try {
    fn();
  } finally {
    ctx.inStats = false;
    ctx.inEnd = false;
  }
}
