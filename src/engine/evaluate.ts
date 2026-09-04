/**
 * Running an action: the phase order, the snapshot each one resolves into, and `run()`, which
 * walks a rotation and drains whatever the casts queued behind them.
 */
import { Stat, EnemyStat, Attribute, WeaponType, Tier, Type1, Type2, Cast, Node, Scaling, scopedStat, tagBand, STAT_COUNT, TYPE2_BITS } from "./stats.js";
import type { Tag, StatKey } from "./stats.js";
import type { Rotation, Action, ActionGroup, ActionDef, ActionField } from "./rotation.js";
import { ctx, dryLog, undoDry, noteMutation, recordApplied, recordConsumed, pendingQueue, tagWord, tagWordOf, RESOURCE_STATS } from "./runtime.js";
import { Gear, Buff, Debuff, Resonator, Loadout, Matrix, Mainslot, Weapon, PHASE_COUNT } from "./gear.js";
import {
  State, TeamMember, StatEntry, HeldBuff, ZERO_STATS, TYPE2_AMP_INDEX, FightSnapshot, capEnergy,
  EMPTY_HELD, EMPTY_FORTE, EMPTY_FIELDS, enemyDef, enemyRes,
} from "./state.js";
import { addStat, getStat, withTeam, currentAction, menuStats, casting, isCast } from "./context.js";
import { damage } from "./damage.js";

export interface Snapshot {
  action: Action;
  member: string;
  stat(key: Stat | EnemyStat): number;
  /** The same totals `stat()` reads, as the array itself — indexed by the stat, for damage.ts's
   *  dozen reads per row. */
  stats: number[];
  atk: number; hp: number; def: number;
  amp: number; dmgBonus: number;
  /** The `Type2`-scoped part of `amp` on its own — the only amplification a dot row reads (see
   *  TYPE2_AMP_INDEX and damage.ts's own `ampFactor`). */
  type2Amp: number;
  enemyRes: number; enemyDef: number;
}

/** A snapshot with everything the old report/display layer also wants: the raw per-entry trace
 *  (`entries`), a `slot` alias for `member` (display.ts's own field name), and resource counters
 *  — always empty here, since this engine folds Energy/Concerto/Offtune into Stat's own space
 *  rather than tracking a running counter (see `AddEnergy` above); a column fed entirely by
 *  zeroes is dropped by `buildReport()` itself, so this degrades to "not shown" rather than
 *  lying with a fake number. `triggered` is set by `run()`, not here — only it knows whether an
 *  action came off the rotation list or was queued mid-fight. */
export interface ResolvedSnapshot extends Snapshot {
  slot: string;
  entries: StatEntry[];
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
   *  `triggered` rows nothing queued: an Outro (a handoff), and the rotation markers that declare
   *  themselves triggered (a summon echo's hit, the swaps). Trace-only — the action hover names it. */
  triggeredBy: HeldBuff | null;
  /** The damage type this action was actually evaluated as — its own `type`, unless a held Gear
   *  called `typeOverride()` on it (`action.type` off a snapshot is always the base type; this is
   *  the effective one, what `isType()` answered against). */
  type: Type1 | null;
  /** This slot's own forte gauges 1-5, as they stood once this action resolved. */
  forte: [number, number, number, number, number];
  /** The same five, as they stood *before* it — what the report compares against to decide whether
   *  a row actually moved a gauge (index.ts's own running-column blanking), which the traced deltas
   *  alone can't answer for a kit that sets one outright. Trace-only, same as `forte`. */
  forteBefore: [number, number, number, number, number];
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
  /** What this action's own outro had to spend: the bar it walked in on plus whatever concerto
   *  landed on it this same action — 0 on every action that isn't an outro. The added half is
   *  what pays for an outro a full bar didn't (Jinhsi's Unison, which hands the outro back the
   *  100 it costs), so a bar the cast never needed doesn't read as short. Not folded into
   *  `concerto` above (that is already the post-spend figure); it's what the report reads to flag
   *  an outro that fired on an underfull bar. */
  concertoSpent: number;
  /** Whether this action threw the Energy bar away — true on every outro but a double-Intro
   *  visit's own, which its owner comes straight back from (see `evaluate()`). What the report
   *  reads to blank the energy cell's own trace panel rather than credit a figure the same row
   *  discarded (display.ts's own `wiped`). */
  energyWiped: boolean;
  /** This slot's own RealEnergy (see `TeamMember.realEnergy`) as it stood right before this
   *  action's own gain landed — what the Energy Requirements table reads off a resetEnergy-marked
   *  Liberation's own row to compute that loop's ER requirement. */
  realEnergyBefore: number;
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
  /** This action's own average damage under each of the acting member's main-stat variants (see
   *  `TeamMember.variants`), in their order — `null` on every action of a member without any, and
   *  on every traced run. solver.ts sums these the way it sums the real `avg`. */
  variantAvg: number[] | null;
}

/** One rendered line in the report: this engine has no multi-hit chain concept (a queued
 *  follow-up is already its own top-level row — see `run()`), so every group is a single action,
 *  never collapsed. Kept only so display.ts's own `buildReport(lines: ChainGroup[])` — otherwise
 *  unmodified — still has something to consume. */
export interface ChainGroup {
  id: string;
  isChain: boolean;
  parts: { snap: ResolvedSnapshot; dmg: { avg: number } }[];
  snap: ResolvedSnapshot;
  mv: number;
  avg: number;
  /** The parts whose columns actually fold into this row — an ActionGroup's own casts, or every
   *  repeat of one triggered hit. The rest of `parts` are rows in their own right that merely
   *  resolved inside the span (a follow-up queued mid-group), and contribute nothing to the folded
   *  row's motion value, damage or resource totals. Empty on an ordinary single-action line. */
  members?: ResolvedSnapshot[];
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

/** Evaluate one action on `state`'s active slot: an Intro-cast adopts whatever's queued for it
 *  first; then every held Gear's updateDebuffs() runs — local (acting slot), global, and enemy
 *  together — so what this cast inflicts is on the target before anything reacts; then every
 *  held Gear's updateGlobal() (every slot's own gear, not just the acting one — see its own
 *  comment below); then every held Gear's updateBuffs(); then every applyStats(), then every
 *  convertStats(), then every lateConvertStats(); an Outro-cast advances the active slot
 *  afterward.
 *
 *  The action itself is a Gear too, and its own hook for a phase runs first in that phase, ahead
 *  of every held Gear's (see `actionHook`) — so a cast's own effect is in place before anything
 *  reacting to it looks. */
export function evaluate(state: State, action: Action, triggered = false, triggeredBy: HeldBuff | null = null): ResolvedSnapshot {
  // always whoever is on field. A Negative Status's own damage used to be diverted onto a
  // resonator-less slot of its own, which meant no attacker's gear reached it and the one
  // amplification a dot row does read (`Type2`-scoped, see damage.ts) could only ever be granted
  // team-wide. It now resolves on the acting slot exactly the way a Tune Break does — their stats,
  // their `Type2` amplification — and, unlike a break, reports in their damage column too: the
  // status is theirs. It is still not their *action*: it is an ordinary active cast all the same,
  // exactly like a Tune Break — the resonator really is on field for it — so no "lost on swap"
  // buff mistakes it for its holder leaving. What separates it from a real press is
  // `triggeredAction()`, which a passive counting those tests instead.
  const slot = state.slot;
  ctx.state = state;
  ctx.slot = slot;
  ctx.act = action;
  ctx.triggered = triggered;
  ctx.tagWord = tagWordOf(action);
  // every action starts on its own type; a held Gear reassigns it from updateDebuffs() below, and
  // `typeOverride()` rebuilds `ctx.tagWord` when one does
  ctx.overrideType1 = null; ctx.overrideType2 = null;
  // a fresh map rather than a clear, same reasoning as `slot.effective` below
  ctx.appliedNow = new Map();
  ctx.appliedBy = new Map();
  ctx.consumedNow = new Map();
  ctx.consumedBy = new Map();
  // Replaced rather than cleared/copied: the snapshot below keeps whichever array this action built,
  // so handing it a fresh one here is what makes that snapshot immutable at zero copying cost (the
  // old code cleared these and then cloned `totals` at the end, paying an O(entries) copy per
  // action for the same guarantee).
  slot.effective = ZERO_STATS.slice();
  // What each gauge held coming into this action. The report needs it to tell a row that
  // moved a gauge from one that merely reports the same balance again, and it cannot be
  // inferred from the traced deltas: a kit that sets a gauge outright (`setForteN`) moves it
  // with no delta to trace. Captured here, ahead of every phase, since updateBuffs can already
  // have set one by the time the declared deltas bank. Trace-only, same as `forte` below.
  const forteBefore: [number, number, number, number, number] = ctx.tracing ? [...slot.forte] : EMPTY_FORTE;
  // and the same for the three running totals, for the same reason
  const energyBefore = slot.energy, concertoBefore = slot.concerto, offtuneBefore = state.offtune;
  if (ctx.tracing) { slot.entries = []; slot.totals = new Map(); }

  if (casting(Cast.Intro)) {
    for (const gear of state.outroQueue.splice(0)) slot.addStack(gear, 1);
    // ...and whatever was waiting on this Intro lands right behind it (see `queueOnIntro()`)
    pendingQueue.push(...state.introQueue.splice(0));
  }

  // A phase's own roster and stack counts are captured before it runs (see `capture()`), so
  // nothing a gear does mid-phase shifts the ground under whatever this engine iterates to next.
  //
  // updateDebuffs() first of all: what this cast inflicts (Shifting, Negative Statuses, the shield
  // marker) goes on the target before anything — updateGlobal() included — looks at `applied()`.
  capture(slot, state);
  actionHook(action.updateDebuffsFn);
  runPhase(0, true);

  // updateGlobal() runs next, and runs for every slot's own held gear — not just the acting
  // slot's — plus global and enemy gear, regardless of whose turn this actually is. That's what
  // lets a kit react to "any team member's own action" through gear held locally (a self buff)
  // instead of needing the whole thing to live in globalStacks just to be reachable from someone
  // else's turn. For a locally-held gear, `ctx.slot` is switched to *its own holder* for the
  // call (not the slot actually acting) — so `revoke()`/`applySelf()`/`stacksOf()` inside it
  // still resolve against whoever holds it, the same way they would if that holder were the one
  // acting. Global and enemy gear keep the ordinary convention instead: `ctx.slot` stays the
  // real acting slot, matching every other global buff's own updateBuffs().
  actionHook(action.updateGlobalFn);
  for (const s of state.slots) {
    for (const gear of s.globalHooks) {
      ctx.slot = s;
      ctx.buff = gear;
      // -1, not a captured count: this phase walks each slot's live hook set rather than a frozen
      // roster, so there is no "count at phase start" to hand over and `frozenStacks()` reads the
      // holder's own live one instead (its documented fallback). Without this it kept whatever the
      // *previous* phase's last gear happened to hold — a number belonging to another buff
      // entirely, which silently broke every `frozenStacks()` read in an updateGlobal.
      ctx.stacks = -1;
      gear.updateGlobalFn!();
    }
  }
  ctx.slot = slot;
  // Both lists are read before either runs: a hook here may put up another team-wide or enemy
  // buff, and that lands in a new array (see `Pool`) — the ones in hand are the roster as it
  // stood, which is the behaviour. Not deduplicated across the two pools, as it never was.
  const globalHooks = state.globalStacks.globalHooks, enemyHooks = state.enemyStacks.globalHooks;
  for (let i = 0; i < globalHooks.length; i++) { ctx.buff = globalHooks[i]!; ctx.buff.updateGlobalFn!(); }
  for (let i = 0; i < enemyHooks.length; i++) { ctx.buff = enemyHooks[i]!; ctx.buff.updateGlobalFn!(); }
  ctx.buff = null;

  // updateBuffs() decides what's held; it runs over whatever updateDebuffs()/updateGlobal() left —
  // a debuff those just put up gets its own updateBuffs() this same action.
  capture(slot, state);
  actionHook(action.updateBuffsFn);
  runPhase(1, true);

  // ...then applyStats()/convertStats() pay out over what's held *now*, not what was held a
  // moment ago: a buff updateBuffs() just granted pays into this same action, and one it just
  // revoked pays nothing. Captured again at post-update counts, so a buff that gained or spent
  // stacks reports the count it actually ended on to its own applyStats() — and this one capture
  // serves every phase from here down, so a buff that spends itself in convertStats() (Jingran's
  // Fire of Life) still reaches lateConvertStats()/afterAction() and the popover below.
  capture(slot, state);
  // The popover's own roster, taken here rather than read off the live pools after the phases
  // below have run: what applyStats()/convertStats() pay out over *is* this action's finalized
  // buff set, and whatever those hooks then revoke only takes effect from the next action on.
  // Reading afterwards dropped exactly the gear that clears itself every action — the Shield and
  // Healed markers, which are revoked in their own convertStats() and so were never in the panel
  // for the cast that granted them. Counts come along, since a hookless Gear is in no phase list
  // and so in no `frozen` below.
  const heldPools = ctx.tracing
    ? [slot.stacks, state.globalStacks, state.enemyStacks]
      .map((pool) => pool.gears().map((g) => [g, pool.get(g) ?? 0] as const))
    : null;
  // Every held Gear's constantStats first, ahead of any applyStats. Traced, they run like any
  // other phase so the report gets its per-entry sources; untraced, the slot's cached sum for
  // this action's tag word lands in one pass — built by running them just once (see `constBase`).
  // ...and what the acting member's main-stat variants (if any) start from: everything the phases
  // so far contributed, before the real build's constant base goes in
  const pre = !ctx.tracing && slot.variants.length !== 0 ? slot.effective.slice() : null;
  // ...and the fight as it stands going into them, for each variant to start from
  ctx.guarded = pre !== null;
  const snapshots = pre !== null ? (state.snapshots ??= [new FightSnapshot(state), new FightSnapshot(state), new FightSnapshot(state)]) : null;
  if (snapshots !== null) snapshots[0].take(state);
  if (ctx.tracing) runPhase(6, true);
  else {
    // ...and the variants' own bases alongside it: they are the same sum with one main stat
    // swapped, so whatever stales one stales the other. Load-bearing the moment anything that
    // comes and goes declares `constantStats` — without it a variant is scored against a base
    // built before the buff landed, and the search picks a main stat on numbers that never
    // happened.
    if (slot.constBaseVersion !== ctx.constVersion) {
      slot.constBase.clear();
      for (const m of slot.variantBase) m.clear();
      slot.constBaseVersion = ctx.constVersion;
    }
    let base = slot.constBase.get(ctx.tagWord);
    if (base === undefined) slot.constBase.set(ctx.tagWord, base = constBaseOf(slot, null, null));
    const effective = slot.effective;
    for (let i = 0; i < effective.length; i++) effective[i] = effective[i]! + base[i]!;
  }
  ctx.mutHash = 0;
  actionHook(action.applyStatsFn);
  runPhase(2, true);
  actionHook(action.convertStatsFn);
  runPhase(3, true);
  // ...and one phase later again, for a conversion that reads what another gear's convertStats()
  // just granted (see GearDef.lateConvertStats).
  actionHook(action.lateConvertStatsFn);
  runPhase(4, true);

  // Each variant now: the same three phases again on the same captured roster, from the same
  // starting point plus its own base, with the fight rolled back to what the real build left
  // after each (`ctx.dryRun`/`restoreFight`) — so every hook reads exactly what it read in the real
  // build, live reads included. A variant whose hooks would have granted/spent/queued anything
  // different, or whose resource stats would bank differently, is marked unsafe: its fight would
  // not have been this fight.
  let variantEff: number[][] | null = null;
  if (pre !== null && snapshots !== null) {
    const primaryHash = ctx.mutHash, primaryEff = slot.effective;
    const [before, after] = snapshots;
    after.take(state);
    variantEff = [];
    ctx.dryRun = true;
    for (let v = 0; v < slot.variants.length; v++) {
      let vbase = slot.variantBase[v]!.get(ctx.tagWord);
      if (vbase === undefined) slot.variantBase[v]!.set(ctx.tagWord, vbase = constBaseOf(slot, slot.variantOf, slot.variants[v]!));
      const eff = pre.slice();
      for (let i = 0; i < eff.length; i++) eff[i] = eff[i]! + vbase[i]!;
      slot.effective = eff;
      before.restore(state);
      ctx.mutHash = 0;
      actionHook(action.applyStatsFn);
      runPhase(2, true);
      actionHook(action.convertStatsFn);
      runPhase(3, true);
      actionHook(action.lateConvertStatsFn);
      runPhase(4, true);
      let unsafe = ctx.mutHash !== primaryHash;
      for (const s of RESOURCE_STATS) if (eff[s] !== primaryEff[s]) unsafe = true;
      if (unsafe) slot.variantUnsafe[v] = true;
      variantEff.push(eff);
    }
    ctx.dryRun = false;
    after.restore(state);
    slot.effective = primaryEff;
  }

  // What belongs in the resonator popover is what's held once updateBuffs() has finished, before
  // applyStats()/convertStats() run. A buff that spends/revokes itself inside its own convertStats() (Jingran's
  // Fire of Life: does its one job, then removes itself the same action) still counts as having
  // been present and paid out, so it still belongs in the list — which is why the roster comes off
  // `active`/the pre-convert pools rather than being re-derived here. Buffs only: everything this
  // member `equip()`-ped is gear (see TeamMember.equipped), and the loadout popover on their own
  // name already names all of it. Globals need no such filter — equip() only ever writes to a
  // slot, so nothing equipped can reach globalStacks.
  //
  // Names are generated only now, after applyStats()/convertStats() have both run — a display() reading a
  // stat one of them just contributed (Jingran's HP-based step counts) needs the final number.
  // The *roster* named is `heldPools`, taken before those hooks ran (see above); only the naming
  // happens here. `currentHeldStacks` is still the same frozen map applyStats()/convertStats() just used
  // (not re-frozen here), so a buff's own stack-count display still reports the count it actually held at
  // that point too, not whatever's left once convertStats() may have spent it down (Fire of Life again — 0
  // stacks by now, were this re-frozen). Trace-only: every one of these is a `Gear.toString()`,
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
    // phases captured theirs. A live read would be wrong twice over now: a gear revoked in
    // convertStats() is out of every pool by here, and a global or enemy Gear is never in
    // `slot.stacks` to begin with.
    const describe = ([g, n]: readonly [Gear, number]): HeldBuff => {
      ctx.buff = g;
      ctx.stacks = frozen.get(g) ?? n;
      return { name: g.toString(), source: state.sourceOf.get(g) ?? "" };
    };
    // nameless gear is engine machinery someone's setup put there, not a buff a kit put up
    // (tunebreak.ts's own watcher), so it belongs in no popover — same exclusion equipped gear gets
    const named = (b: HeldBuff): boolean => b.name !== "";
    heldLocal = heldPools![0]!.filter(([g]) => !slot.equipped.has(g)).map(describe).filter(named);
    heldGlobal = heldPools![1]!.map(describe).filter(named);
    heldEnemy = heldPools![2]!.filter(([g]) => !state.enemy.equipped.has(g)).map(describe).filter(named);
  }
  ctx.stacks = -1;
  ctx.buff = null;

  // which fields this action put out — read off the same grant record `applied()` answers from,
  // so every path counts (a team grant, a mark on the enemy, an outro handoff adopted at an Intro)
  let opensFields: ActionField[] = EMPTY_FIELDS;
  if (ctx.tracing) {
    for (const [gear] of ctx.appliedNow) {
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
  // atk/hp/def stay unscoped, matching the old engine — only formula-facing stats scope.
  // BaseAtk/BaseHp/BaseDef are themselves summed entries (a resonator's own kit-base value plus
  // a weapon's own base line), not a fixed per-slot number, matching the old engine's total().
  const base = effective[Stat.BaseAtk]!, baseHp = effective[Stat.BaseHp]!, baseDef = effective[Stat.BaseDef]!;

  // bank this action's own declared energy/concerto/offtune (the resonator's own baseline for
  // performing it) plus whatever AddEnergy/AddConcerto/AddOfftune a held buff contributed, into
  // the real running totals — no kit ever touches these directly, same as forte.
  // Energy alone carries a multiplier: `(base + AddEnergy) x (1 + Energy Regen Multiplier)`.
  const energyGain = (action.energy + effective[Stat.AddEnergy]!) * (1 + effective[Stat.EnergyRegenMult]! / 100);
  slot.energy = Math.max(0, slot.energy + energyGain);
  // An outro spends a full Concerto bar to fire and leaves the field with no Energy at all. The
  // spend is the outro's own declared `concerto: -100` — every outro in the project carries it, so
  // it banks through the ordinary line below like any other cast's — which leaves only the ceiling
  // it spends against to settle here: a bar over 100 is capped back to it first, so the declared
  // -100 empties it exactly rather than leaving whatever it had overrun by. Energy is not a spend
  // of a known size, so it is simply set to 0. What the bar held on the way in is kept for the
  // report's underfull-outro flag. Off-tune is the enemy's, not theirs, and carries over.
  // ...except a double-Intro visit's own outro, which hands the field *backward* (rotation.ts's
  // own outroDir) and whose owner is coming straight back for their main Intro: that visit is half
  // of one loop, not the end of one, so the Energy column runs on across both halves and only the
  // outro that actually ends the loop wipes it. Jinhsi is the case — Unison pays for the first of
  // her two outros, and her banking is one figure across the pair.
  const outro = casting(Cast.Outro);
  // AddConcerto included: it lands on the bar in the same line the outro's own -100 does, so an
  // outro handed the 100 it costs (Unison again) was never short, whatever the bar itself held.
  const concertoSpent = outro ? slot.concerto + effective[Stat.AddConcerto]! : 0;
  const energyWiped = outro && state.outroDir > 0;
  if (outro) {
    if (energyWiped) slot.energy = 0;
    if (slot.concerto > 100) slot.concerto = 100;
  }
  slot.concerto = Math.max(0, slot.concerto + action.concerto + effective[Stat.AddConcerto]!);
  // Off-Tune Buildup Rate scales what an action *builds*, never what lands on the bar directly:
  // DirectOfftune (a Tune Break's own drain, Denia's half-bar surge) is already the amount the bar
  // moves, so it goes on untouched. A declared negative would come off in full for the same reason.
  // Unclamped, unlike energy/concerto: a break can leave the bar below empty (see tunebreak.ts).
  const built = action.offtune + effective[Stat.AddOfftune]!;
  state.offtune += (built < 0 ? built : built * (effective[Stat.OfftuneBuildup]! / 100)) + effective[Stat.DirectOfftune]!;

  // RealEnergy (TeamMember.realEnergy): the same gain as the real Energy bar above, each holder
  // capped at their own maxEnergy, plus half of it shared to every *other* member — a standing
  // assumption for the ER-requirement estimate, not a real game mechanic. Captured before this
  // action's own gain lands, so a resetEnergy-marked Liberation's "before" value excludes its own
  // contribution — exactly the "banked coming into this cast" figure the ER requirement wants.
  const realEnergyBefore = slot.realEnergy;
  slot.realEnergy = capEnergy(slot, slot.realEnergy + energyGain);
  const shared = energyGain / 2;
  for (const other of state.slots) {
    if (other !== slot) other.realEnergy = capEnergy(other, other.realEnergy + shared);
  }
  if (action.resetEnergy) slot.realEnergy = 0;

  // same shape, for whichever forte gauges this action declares a delta on — a kit assigns its
  // own meaning onto whichever slot fits (Jingran's Qi is forte1, his Mingfire is forte2) — plus
  // whatever AddForte1-5 a held buff contributed (Jingran's Fire of Life refunding Qi off its own
  // Mingfire spend, rather than reaching for setForte1 directly and leaving no trace of who paid
  // it). Unconditional now, not gated on the action's own declared amount being nonzero — a buff
  // can contribute here even on an action that declares nothing itself.
  const forte = slot.forte;
  forte[0] += action.forte1 + effective[Stat.AddForte1]!;
  forte[1] += action.forte2 + effective[Stat.AddForte2]!;
  forte[2] += action.forte3 + effective[Stat.AddForte3]!;
  forte[3] += action.forte4 + effective[Stat.AddForte4]!;
  forte[4] += action.forte5 + effective[Stat.AddForte5]!;

  // Everything this action banks is now banked, so afterAction() is the one phase that can read a
  // gauge as the action actually leaves it — and the last chance to spend one back down before the
  // snapshot below reports it. Same frozen roster the stat phases just ran on.
  //
  // The variants' own afterAction runs first, dry, so each sees the roster and gauges exactly as
  // the real build's is about to — and each variant's damage is read here, off its own totals.
  let variantAvg: number[] | null = null;
  const variantHash: number[] = [];
  if (variantEff !== null && snapshots !== null) {
    variantAvg = [];
    const banked = snapshots[2];
    banked.take(state);
    ctx.dryRun = true;
    for (let v = 0; v < variantEff.length; v++) {
      const eff = variantEff[v]!;
      slot.effective = eff;
      ctx.mutHash = 0;
      ctx.stacks = -1;
      actionHook(action.afterActionFn);
      runPhase(5, false);
      variantHash.push(ctx.mutHash);
      banked.restore(state);
      const b = eff[Stat.BaseAtk]!, bh = eff[Stat.BaseHp]!, bd = eff[Stat.BaseDef]!;
      variantAvg.push(damage({
        action, stat: (k) => eff[k]!, stats: eff,
        atk: b + eff[Stat.BonusAtk]! / 100 * b + eff[Stat.FlatAtk]!,
        hp: bh + eff[Stat.BonusHp]! / 100 * bh + eff[Stat.FlatHp]!,
        def: bd + eff[Stat.BonusDef]! / 100 * bd + eff[Stat.FlatDef]!,
        amp: eff[Stat.Amp]!, type2Amp: eff[TYPE2_AMP_INDEX]!, dmgBonus: eff[Stat.DmgBonus]!,
        enemyRes: enemyRes(), enemyDef: enemyDef(),
      }).avg);
    }
    ctx.dryRun = false;
    ctx.guarded = false;
    slot.effective = effective;
  }
  ctx.mutHash = 0;
  actionHook(action.afterActionFn);
  runPhase(5, false);
  ctx.buff = null;
  for (let v = 0; v < variantHash.length; v++) if (variantHash[v] !== ctx.mutHash) slot.variantUnsafe[v] = true;

  const snapshot: ResolvedSnapshot = {
    action,
    type: ctx.overrideType1 ?? action.type,   // the effective type — see ResolvedSnapshot.type
    member: slot.name,
    slot: action.slot ?? slot.name,
    stat,
    stats: effective,
    atk: base + effective[Stat.BonusAtk]! / 100 * base + effective[Stat.FlatAtk]!,
    hp: baseHp + effective[Stat.BonusHp]! / 100 * baseHp + effective[Stat.FlatHp]!,
    def: baseDef + effective[Stat.BonusDef]! / 100 * baseDef + effective[Stat.FlatDef]!,
    amp: effective[Stat.Amp]!,
    type2Amp: effective[TYPE2_AMP_INDEX]!,
    dmgBonus: effective[Stat.DmgBonus]!,
    enemyRes: enemyRes(),
    enemyDef: enemyDef(),
    entries: slot.entries,
    triggered,
    triggeredBy,
    // stamped by run() the moment this returns — nothing mid-action reads either, unlike
    // `triggered`, so neither has to be threaded through this call
    group: null,
    groupEnd: false,
    groupSpill: null,
    // report-only, so copied only when something will actually read it (display.ts's gauge columns)
    forte: ctx.tracing ? [...slot.forte] : EMPTY_FORTE,
    forteBefore,
    energy: slot.energy, concerto: slot.concerto, offtune: state.offtune,
    energyBefore, concertoBefore, offtuneBefore,
    concertoSpent,
    energyWiped,
    realEnergyBefore,
    heldLocal, heldGlobal, heldEnemy,
    opensFields,
    variantAvg,
  };

  if (casting(Cast.Outro)) {
    const n = state.slots.length;
    state.active = (state.active + state.outroDir + n) % n;
  }
  return snapshot;
}

/** Run a rotation across `state`, splicing in anything queue()d right after the action that
 *  queued it — each member's own action sequence, concatenated in turn order; Outro/Intro
 *  handoff and active-slot advancement happen automatically inside evaluate(). A queued
 *  follow-up runs on its own caller's slot even if the active slot has since moved on (e.g. an
 *  Outro evaluated between the queue() call and the follow-up actually running); a plain
 *  rotation entry always runs on whichever slot is active when its turn comes. */
export function run(state: State, rotation: Action[]): ResolvedSnapshot[] {
  const out: ResolvedSnapshot[] = [];
  // Two parallel arrays walked by index rather than a list of `{action, slot}` objects drained
  // with shift(): shift() is O(n) per step (and splice-at-front the same again), so a rotation
  // that queues follow-ups was quadratic in its own length for no reason. `slots` holds -1 for an
  // ordinary rotation entry — "run on whoever is active when its turn comes".
  // An ActionGroup is expanded here, before anything runs: from this point down the queue
  // machinery only ever sees real casts, and a group survives purely as the `groups`/`ends` tags
  // the report reads back off each snapshot.
  const actions: Action[] = [];
  const slots: number[] = [];
  // what queued each entry, parallel to `slots` — null for a rotation entry, which nothing did
  const bys: (HeldBuff | null)[] = [];
  const groups: (ActionGroup | null)[] = [];
  const ends: boolean[] = [];
  // which group's spill each entry is, parallel to the rest — null for everything a rotation placed
  const spills: (ActionGroup | null)[] = [];
  for (const entry of rotation) {
    // a duck-check rather than `instanceof ActionGroup`: the class lives in rotation.ts, which
    // this module may only reference as types (see the import note at the top)
    const group = (entry as ActionGroup).actions !== undefined ? (entry as ActionGroup) : null;
    const members = group ? group.actions : [entry];
    members.forEach((a, k) => {
      actions.push(a); slots.push(-1); bys.push(null); spills.push(null);
      groups.push(group); ends.push(group !== null && k === members.length - 1);
    });
  }
  ctx.insideGroup = false;
  // The group whose beat is still resolving — its own members, then the follow-ups they queued,
  // the last member's included. Every cast spliced in while this stands is that group's spill, and
  // the next rotation entry (or an engine event) clears it.
  let spillGroup: ActionGroup | null = null;
  let i = 0, guard = 0;
  while (i < actions.length) {
    if (++guard > 10000) throw new Error("action queue did not drain");
    const stepAction = actions[i]!, stepSlot = slots[i]!, stepBy = bys[i]!;
    const stepGroup = groups[i]!, stepEnd = ends[i]!, stepSpill = spills[i]!;
    i++;
    spillGroup = stepGroup ?? stepSpill;
    // A follow-up spliced in between two members is still *inside* the group, so this only moves on
    // a member's own row: set on every member but the last, cleared by the last. That is what lets
    // the bar fill part-way through a group and still break only on the cast that ends it.
    if (stepGroup) ctx.insideGroup = !stepEnd;
    const before = state.active;
    if (stepSlot >= 0) state.active = stepSlot;
    let action: Action | null = stepAction;
    if (stepAction.resolveFn) {
      // a marker reads state via the "current" pointers, same as any other kit logic — evaluate()
      // sets them again immediately after anyway, so no save/restore needed here
      ctx.state = state;
      ctx.slot = state.slot;
      action = stepAction.resolveFn();
      // resolved to no cast at all this step (deferred onto a later one — see `queueOnIntro()`)
      if (!action) continue;
    }
    pendingQueue.length = 0;
    // "not really this resonator's own turn" rows the report dims: a follow-up the engine itself
    // queued (Phrolova's Hecate procs, Cantarella's Jolt, ...), a rotation marker or a cast that
    // declares itself one (rotation.ts's swap markers, a summon echo's own hit), and an outro (a
    // handoff, not an attack).
    // An engine-level event is *not* one, though it reports under its own bucket rather than any
    // member's (`ActionDef.slot`): a Tune Break is a beat of the fight's own, so it counts off
    // every per-action clock and stands as a row in its own right — see `queueEvent`.
    // Handed to evaluate() rather than stamped on the snapshot after: gear reacting mid-action
    // needs it too (tunebreak.ts's own watcher won't auto-fire off one) — see triggeredAction().
    const triggered = stepSlot >= 0 || stepAction.triggered || action.triggered || isCast(action, Cast.Outro);
    // A triggered echo form names the equipped mainslot itself as its trigger, so the row's hover
    // wears the gear's name in its owner's colour. Overrides whatever queueOnIntro() attributed —
    // during marker resolution `ctx.buff` is stale, so the deferred swap copy carried garbage.
    const ms = state.slot.mainslot;
    const by = ms && action.triggered && (action === ms.onfield || action === ms.outro || action === ms.cancel)
      ? { name: ms.name, source: state.sourceOf.get(ms) ?? state.slot.name } : stepBy;
    const snapshot = evaluate(state, action, triggered, by);
    snapshot.group = stepGroup;
    snapshot.groupEnd = stepEnd;
    snapshot.groupSpill = stepSpill;
    out.push(snapshot);
    // a queued follow-up's own turn doesn't stick — restore whoever was actually active,
    // unless the follow-up was itself an outro (genuinely advances the team)
    if (stepSlot >= 0 && state.active === stepSlot) state.active = before;

    if (pendingQueue.length) {
      // spliced in right after the action that queued them — i.e. at the read cursor, which is
      // exactly where the old shift()-based list spliced at its own front
      const qa: Action[] = [], qs: number[] = [], qb: (HeldBuff | null)[] = [];
      for (const p of pendingQueue) { qa.push(p.action); qs.push(p.slot); qb.push(p.by); }
      actions.splice(i, 0, ...qa);
      slots.splice(i, 0, ...qs);
      bys.splice(i, 0, ...qb);
      // a follow-up is never one of the casts a group names, whatever it was queued from
      groups.splice(i, 0, ...qa.map(() => null));
      ends.splice(i, 0, ...qa.map(() => false));
      // a follow-up belongs to whatever beat spawned it — an engine event to nobody (`queueEvent`)
      spills.splice(i, 0, ...pendingQueue.map((p) => (p.event ? null : spillGroup)));
    }
  }
  return out;
}

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
 *  is stood in for by `to` at the very same position, so a variant's base is built by exactly the
 *  additions, in exactly the order, a real run wearing `to` would make. */
function constBaseOf(slot: TeamMember, from: Gear | null, to: Gear | null): number[] {
  const live = slot.effective;
  slot.effective = ZERO_STATS.slice();
  for (let q = 0; q < 3; q++) {
    const list = capList[q]!, counts = capCounts[q]!, hooks = capHooks[q]![6]!;
    for (let i = 0, m = hooks.length; i < m; i++) {
      const k = hooks[i]!;
      const gear = list[k] === from ? to! : list[k]!;
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
function runPhase(p: number, withStacks: boolean): void {
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

/** Run one of the acting Action's own hooks (see the `Action` class), with the "current" pointers
 *  aimed at the action itself: whatever it grants is attributed through it and every stat it
 *  contributes is sourced to its own name. Called first in each phase, ahead of every held Gear's
 *  own hook, so an action's own effect is in place before anything reacting to it looks. */
function actionHook(fn: (() => void) | undefined): void {
  if (!fn) return;
  ctx.buff = ctx.act;
  ctx.stacks = 1;
  fn();
}
