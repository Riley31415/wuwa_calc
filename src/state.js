/**
 * Calculation state, and the ambient namespace buff/action functions author against.
 *
 * Every buff a resonator is under sits on its own list, and reaches it three ways:
 *
 *   1. own gear        seeded onto its own resonator at the start of the fight (see
 *                      registry.js — gear is what actually adds a buff), plus the states its
 *                      own actions open
 *   2. the outro queue a buff published by a buff or action; handed to the NEXT resonator when
 *                      it intros and dropped when that resonator outros. (The sheet's "next".)
 *   3. a direct grant  added to the whole team's lists, or to everyone else's.
 *                      (The sheet's "team" and "other".)
 *
 * During each action every buff on the acting resonator's list applies its stats, and the
 * buffs the action itself brings apply on top.
 *
 * Authoring style follows TODO.md: functions use the ambient namespace (`add(36, CRIT_RATE)`)
 * rather than threading `state` through every call. `withContext` binds it.
 */
import {
  ATK, HP, DEF, BASE_ATK, BASE_HP, BASE_DEF, FLAT_ATK, FLAT_HP, FLAT_DEF,
  BONUS_ATK, BONUS_HP, BONUS_DEF, DMG_BONUS, AMP, isPercent,
  SLOT_RESOURCES, TEAM_RESOURCES, ENERGY, CONCERTO, OFFTUNE,
  scopedStat, TAGS_MATCHED, INTRO, OUTRO, ECHO, LIB,
} from "./stats.js";
import {
  getBuff, getAction, hasAction, getChain, hasChain, isGear, getGearOnFightStart,
  PRIORITY_BANDS,
} from "./registry.js";

/** What an action is, for matching scoped stats: its element and its damage type. */
const tagsOf = (action) => TAGS_MATCHED.map((k) => action?.[k]).filter(Boolean);

/* ------------------------------------------------------- automatic tune break */
/**
 * Off-tune is one bar the whole team fills, and nobody presses tune break — it goes off the
 * moment the bar is full. So the engine casts it rather than making every rotation spell out
 * where it lands, which was always a guess.
 *
 * The bar resets to -3 rather than 0: for about three seconds afterwards nothing can build
 * off-tune at all, and the actions inside that window would otherwise be free progress toward
 * the next break.
 */
const TUNE_BREAK_ACTION = "Auto Tune Break";
const OFFTUNE_AFTER_BREAK = -3;

/**
 * Which button an action is, rather than what damage it deals. Shorekeeper's intro deals skill
 * damage and her Discernment deals liberation damage; both are intros. Her outro and the echo
 * casts deal no outro or echo damage at all, which is what the `outro` and `echo` nodes are
 * for.
 */
export const isIntro = (action) => action.node === INTRO;
export const isOutro = (action) => action.node === OUTRO;
export const isEcho = (action) => action.node === ECHO;
export const isLiberation = (action) => action.node === LIB;

/* ------------------------------------------------------------------- one slot */

export class Slot {
  constructor(name, index) {
    this.name = name;
    this.index = index;
    /** Every buff on this resonator. name -> { name, revokeOnOutro, via, stacks } */
    this.list = new Map();
    /** Resources and gauges: qi, forte1, energy, ... */
    this.counters = new Map();
    /** Stat entries rebuilt for every action. */
    this.entries = [];
    /** On field, i.e. inside the intro→outro window. The sheet called this "burst". */
    this.onField = false;
  }

  /**
   * Add a buff, or — if the resonator already holds it — stack it. A fresh add starts at 1
   * stack; each further call adds `n` more, capped at `cap`. Most buffs never call this a
   * second time (the grant helpers in this file guard on `hasBuff` first, which is what keeps
   * a re-asserted team aura from stacking), so most buffs simply sit at 1 stack forever — a
   * buff opts into stacking just by being added again on purpose.
   */
  addBuff(name, { revokeOnOutro = false, via = "gear", n = 1, cap = Infinity, front = false } = {}) {
    getBuff(name);                       // fail fast on a typo
    const existing = this.list.get(name);
    if (existing) {
      existing.stacks = Math.min(cap, existing.stacks + n);
      return this;
    }
    const entry = { name, revokeOnOutro, via, stacks: Math.min(cap, n) };
    if (front) {
      // states go first, so a state that moves a counter applies before the gear that scales
      // on it, and that gear reads the value this action produced.
      const rest = [...this.list.entries()];
      this.list.clear();
      this.list.set(name, entry);
      for (const [k, v] of rest) this.list.set(k, v);
    } else {
      this.list.set(name, entry);
    }
    return this;
  }

  /** Remove one stack; the buff disappears once it reaches zero. */
  removeStack(name, n = 1) {
    const e = this.list.get(name);
    if (!e) return false;
    e.stacks -= n;
    if (e.stacks <= 0) this.list.delete(name);
    return true;
  }

  /** Clear the buff entirely, regardless of how many stacks it holds. */
  removeBuff(name) { return this.list.delete(name); }
  hasBuff(name) { return this.list.has(name); }
  stacksOf(name) { return this.list.get(name)?.stacks ?? 0; }

  counter(name) { return this.counters.get(name) ?? 0; }
  setCounter(name, v) { this.counters.set(name, v); return v; }

  /** Sum of every contribution to `stat` for the action being evaluated. */
  total(stat) {
    let n = 0;
    for (const e of this.entries) if (e.stat === stat) n += e.value;
    return n;
  }

  /** Flat totals fold base × (1 + bonus%) + flat, and are computed on demand so a LATE
   *  conversion that adds flatAtk is picked up by any later read. */
  derived(kind) {
    const [base, bonus, flat] =
      kind === ATK ? [BASE_ATK, BONUS_ATK, FLAT_ATK]
      : kind === HP ? [BASE_HP, BONUS_HP, FLAT_HP]
      : [BASE_DEF, BONUS_DEF, FLAT_DEF];
    return Math.floor(this.total(base) * (1 + this.total(bonus) / 100) + this.total(flat));
  }
}

/* ---------------------------------------------------------------- whole state */

export class State {
  constructor({ team = ["slot1"], level = 90, enemyLevel = 100, res = 20 } = {}) {
    this.slots = team.map((n, i) => new Slot(n, i));
    this.active = 0;
    this.config = { level, enemyLevel, res };

    /** Buff names published, waiting for the next intro to pick them up. */
    this.outroQueue = [];
    /**
     * Team-wide counters: fusion count, shield count, break bar. Persist across actions,
     * unlike stats, which are rebuilt from the buff list every action.
     */
    this.counters = new Map();
    this.flags = new Set();
    /** Follow-up actions queued by an action, spliced in after the current one. */
    this.pending = [];
    this.log = [];
    this.chainSeq = 0;
    /** The action id currently being evaluated, so log lines can name it. Includes the
     *  source — every action id is `${source}: ${action}` — so a log line naming it always
     *  reads as a full name, not a bare resonator name. */
    this.currentAction = null;
  }

  get slot() { return this.slots[this.active]; }
  slotOf(name) { return this.slots.find((s) => s.name === name); }

  counter(name) { return this.counters.get(name) ?? 0; }
  setCounter(name, v) { this.counters.set(name, v); return v; }

  /** Prefix for a log line: the full action name, when one is in progress. */
  tag() { return this.currentAction ? `${this.currentAction}: ` : ""; }

  /**
   * Mechanism 1 — equip each resonator's gear: seed the matching-name buff, then run every
   * equipped gear's onFightStart(). Only gear gets this hook (see registry.js), so the second
   * pass only has to walk the gear lists themselves, not the resulting buff lists.
   */
  startFight(loadouts) {
    for (const [slotName, gearList] of Object.entries(loadouts)) {
      const slot = this.slotOf(slotName);
      if (!slot) throw new Error(`no slot named "${slotName}"`);
      for (const name of gearList) {
        if (!isGear(name)) {
          throw new Error(`"${name}" is not gear — startFight() only equips gear, `
            + `defined with defineGear()`);
        }
        slot.addBuff(name, { via: "gear" });
      }
    }
    for (const [slotName, gearList] of Object.entries(loadouts)) {
      const slot = this.slotOf(slotName);
      for (const name of gearList) {
        const onFightStart = getGearOnFightStart(name);
        if (!onFightStart) continue;
        withContext({ state: this, slot, action: null, source: name }, onFightStart);
      }
    }
    return this;
  }

  /** Mechanism 2 — publish a buff for whoever intros next. */
  publishOutro(name) {
    getBuff(name);
    this.outroQueue.push(name);
    this.log.push(`${this.tag()}published ${name} to the outro queue`);
  }

  /** Mechanism 2 — the acting resonator intros and adopts whatever is queued. */
  adoptOutroBuffs() {
    if (!this.outroQueue.length) return [];
    const taken = this.outroQueue.splice(0);
    for (const name of taken) this.slot.addBuff(name, { revokeOnOutro: true, via: "outro" });
    this.log.push(`${this.tag()}adopted [${taken.join(", ")}]`);
    return taken;
  }

  /** Mechanism 2 — the acting resonator outros; the buffs it adopted expire. */
  revokeOutroBuffs() {
    const gone = [];
    for (const [name, meta] of this.slot.list) {
      if (meta.revokeOnOutro) { this.slot.removeBuff(name); gone.push(name); }
    }
    if (gone.length) this.log.push(`${this.tag()}lost [${gone.join(", ")}]`);
    return gone;
  }

  /** Mechanism 3 — a grant to specific slots. Idempotent, so a buff may re-assert it every
   *  action without the list or the log growing — and without stacking it. */
  grant(name, slots) {
    const fresh = slots.filter((s) => !s.hasBuff(name));
    for (const s of fresh) s.addBuff(name, { via: "grant" });
    if (fresh.length) {
      this.log.push(`${this.tag()}granted ${name} -> [${fresh.map((s) => s.name).join(", ")}]`);
    }
    return fresh.length;
  }

  /* ------------------------------------------------------------ evaluation */

  /**
   * Evaluate one action: rebuild the acting resonator's stats from its buff list, let the
   * action contribute, and return the resolved snapshot.
   */
  evaluate(actionId, meta = {}) {
    const action = getAction(actionId);
    // A queued step belongs to whoever queued it. `run()` pins the slot and restores it after,
    // so a follow-up an outro summoned still resolves on the resonator that summoned it.
    if (meta.slot != null) this.active = meta.slot;
    const slot = this.slot;
    this.currentAction = actionId;

    // --- general rules every resonator shares, before anything kit-specific runs ---

    // An intro opens the on-field window and adopts whatever the previous resonator left in
    // the outro queue. An outro closes the window; it is half-open, matching the sheet, so
    // the outro action itself is already off field.
    //
    // An intro is recognised by its *node* — which button it is — not by its damage type.
    // Shorekeeper's intro deals skill damage and her Discernment deals liberation damage;
    // both are still intros. There is no outro node, so an outro goes by type.
    if (isIntro(action)) { slot.onField = true; this.adoptOutroBuffs(); }
    if (isOutro(action)) slot.onField = false;

    // 1. resources first, so buffs that scale on a counter see this action's own change.
    //    Every one is a running total across the rotation. The forte gauges, energy and
    //    concerto belong to the resonator; off-tune is one bar the whole team fills.
    //
    //    A liberation contributes nothing to energy and an outro nothing to concerto: both
    //    consume whatever is banked, which no running total can express, so they simply do
    //    not move it. The costs they declare (-125, -100) are kept for display.
    for (const r of SLOT_RESOURCES) {
      const spendsEverything = action[r] < 0 && (r === ENERGY || r === CONCERTO);
      slot.setCounter(r, slot.counter(r) + (spendsEverything ? 0 : action[r]));
    }
    for (const r of TEAM_RESOURCES) this.setCounter(r, this.counter(r) + action[r]);

    slot.entries = [];
    const ctx = { state: this, slot, action, source: null };

    // 2. every buff applies, stage by stage: UPDATE_BUFFS, GEAR_STATS, BUFF_STATS, then the two
    //    conversion stages.
    //
    //    The list is re-read at the top of each stage rather than materialised once, so a buff
    //    that an earlier stage *created* still runs in its own — a weapon stacking a buff into
    //    existence at GEAR_STATS has it pay out at BUFF_STATS on the same cast, with nothing
    //    pre-seeded. A buff added at a stage already gone by simply waits for the next action.
    //
    //    Within a stage the names are collected before any of them run, so a buff that revokes
    //    itself still applies once, and the resonator's own buffs come before the action's body.
    //    Stack counts are never cached: `stacksOf()` reads live.
    const used = new Map();
    const ran = new Set();

    for (const band of PRIORITY_BANDS) {
      const names = [...slot.list.keys()]
        .filter((name) => !ran.has(name) && getBuff(name).priority === band);
      for (const name of names) ran.add(name);

      const running = names.map((name) => getBuff(name));
      // The action's own body joins its own stage, last — which is what lets it read summed
      // totals like hp() when it sits at GEAR_STATS or later.
      if (action.apply && action.priority === band) {
        running.push({ name: action.id, apply: action.apply });
      }

      for (const buff of running) {
        const result = withContext({ ...ctx, source: buff.name }, () => buff.apply());
        if (result !== undefined) used.set(buff.name, result);
      }
    }
    slot.lastUsed = used;

    const snapshot = this.resolve(action, meta);

    // The off-tune bar filled: break the enemy's tune, cast by whoever is on field right now.
    // Queued rather than folded into this action so it lands as its own row, and after any
    // follow-up this action already summoned.
    if (action.id !== TUNE_BREAK_ACTION && this.config.maxOfftune
        && this.counter(OFFTUNE) >= this.config.maxOfftune && hasAction(TUNE_BREAK_ACTION)) {
      this.setCounter(OFFTUNE, OFFTUNE_AFTER_BREAK);
      this.pending.push({ id: TUNE_BREAK_ACTION, slot: this.active });
    }

    if (isOutro(action)) {
      this.revokeOutroBuffs();
      this.active = (this.active + 1) % this.slots.length;
    }
    return snapshot;
  }

  /**
   * Collapse the entries into the numbers the damage formula wants.
   *
   * Everything here is captured eagerly. `slot.entries` is rebuilt for the next action, so
   * a snapshot that read through to the live slot would report the *last* action's totals
   * for every row.
   */
  resolve(action, meta = {}) {
    const slot = this.slot;
    // Every stat picks up its generic total plus whatever was scoped to what this action *is*.
    // `node` and `scaling` deliberately do NOT participate — Jingran's Lib1 has node
    // "liberation" but type "heavy", so resolving node would start paying liberation bonuses
    // on it. See TAGS_MATCHED in stats.js.
    const totals = new Map();
    for (const e of slot.entries) totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.value);

    const stat = (s) => tagsOf(action).reduce(
      (n, tag) => n + (totals.get(scopedStat(tag, s)) ?? 0), totals.get(s) ?? 0);

    return {
      action,
      slot: slot.name,
      chain: meta.chain ?? null,
      chainOf: meta.chainOf ?? null,
      onField: slot.onField,
      atk: slot.derived(ATK),
      hp: slot.derived(HP),
      def: slot.derived(DEF),
      dmgBonus: stat(DMG_BONUS),
      amp: stat(AMP),
      entries: slot.entries,
      totals,
      stat,
      counters: Object.fromEntries(slot.counters),
      teamCounters: Object.fromEntries(this.counters),
      buffs: [...slot.list.keys()],
      stacks: Object.fromEntries([...slot.list.entries()].map(([n, m]) => [n, m.stacks])),
    };
  }

  /**
   * Run a rotation. Follow-ups an action queues are spliced in **directly after** it, in the
   * order they were queued, and a follow-up may itself queue more.
   */
  run(rotation) {
    const out = [];
    const queue = rotation.flatMap((id) => this.expand(id));
    let guard = 0;
    while (queue.length) {
      if (++guard > 10000) throw new Error("action queue did not drain — cyclic queue()?");
      const step = queue.shift();
      this.pending = [];
      // A queued step names the slot it was queued on, so switching to it is temporary: the
      // rotation carries on from wherever it was — unless the step itself was an outro, whose
      // switch is the whole point and has to stand.
      const before = this.active;
      out.push(this.evaluate(step.id, step));
      if (step.slot != null && this.active === step.slot) this.active = before;
      // follow-ups belong to the action that queued them, not to any chain
      if (this.pending.length) queue.splice(0, 0, ...this.pending);
    }
    return out;
  }

  /**
   * One rotation entry becomes one or more steps. A chain expands into its members, each
   * tagged with the same instance id so the results can be collapsed back into one row.
   */
  expand(id) {
    if (!hasChain(id)) return [{ id }];
    const instance = `${id}#${++this.chainSeq}`;
    return getChain(id).members.map((m) => ({ id: m, chain: instance, chainOf: id }));
  }
}

/* ------------------------------------------------- the ambient state namespace */

let CTX = null;

export function withContext(ctx, fn) {
  const prev = CTX;
  CTX = ctx;
  try { return fn(); } finally { CTX = prev; }
}

function cur() {
  if (!CTX) throw new Error("no active calculation — call inside State.evaluate()");
  return CTX;
}

/**
 * Contribute to a stat. Ratio stats are in percent units: `add(36, CRIT_RATE)` is +36%.
 *
 * A third form scopes the contribution to what the action is — its element or its damage type:
 *
 * ```js
 * add(12, DMG_BONUS);                 // 12% damage, on anything
 * add(12, "fusion", DMG_BONUS);       // 12% fusion damage
 * add(50, "heavy", AMP);              // 50% amplification, heavy attacks only
 * add(12, "heavy", CRIT_RATE);        // 12% crit rate, heavy attacks only
 * ```
 *
 * Any stat can be scoped this way; there is nothing special about damage bonus or
 * amplification. An action resolves the ones matching itself when its stats are summed.
 */
export function add(value, tagOrStat, maybeStat) {
  const scoped = maybeStat !== undefined;
  const stat = scoped ? scopedStat(tagOrStat, maybeStat) : tagOrStat;
  if (!Number.isFinite(value)) throw new Error(`add(): ${stat} got ${value}`);
  const c = cur();
  c.slot.entries.push({ stat, value, source: c.source });
  return value;
}

/**
 * Read the running total of a stat (percent units for ratio stats), including everything
 * scoped to the action being evaluated — so `get(DMG_BONUS)` on a fusion heavy sees the
 * generic bonus plus the fusion one plus the heavy one.
 */
export function get(stat) {
  const c = cur();
  return tagsOf(c.action).reduce(
    (n, tag) => n + c.slot.total(scopedStat(tag, stat)), c.slot.total(stat));
}
export const pct = (stat) => (isPercent(stat) ? get(stat) / 100 : get(stat));

/** Summed totals. Safe to read from the action's apply() and from LATE conversions. */
export const atk = () => cur().slot.derived(ATK);
export const hp = () => cur().slot.derived(HP);
export const def = () => cur().slot.derived(DEF);

/* counters — per resonator */
export const counter = (name) => cur().slot.counter(name);
export const setCounter = (name, v) => cur().slot.setCounter(name, v);
export const gain = (name, n = 1) => cur().slot.setCounter(name, cur().slot.counter(name) + n);
export function spend(name, n) {
  const have = cur().slot.counter(name);
  if (have < n) return false;
  cur().slot.setCounter(name, have - n);
  return true;
}

/* counters — team wide: fusion count, shield count, break bar */
export const teamCounter = (name) => cur().state.counter(name);
export const setTeamCounter = (name, v) => cur().state.setCounter(name, v);
export const gainTeam = (name, n = 1) =>
  cur().state.setCounter(name, cur().state.counter(name) + n);
export function spendTeam(name, n) {
  const have = cur().state.counter(name);
  if (have < n) return false;
  cur().state.setCounter(name, have - n);
  return true;
}
export const flag = (name) => cur().state.flags.add(name);
export const flagged = (name) => cur().state.flags.has(name);

/** The action being evaluated. `is()` tests its element / type / node. */
export function action() {
  const a = cur().action;
  return {
    ...a,
    is: (...tags) => tags.some((t) => t === a.element || t === a.type || t === a.node),
  };
}

export const equipped = (name) => cur().slot.hasBuff(name);
export const self = () => cur().slot;

/**
 * The slot an outro is about to hand the field to — the next one in the cycle. The switch
 * itself happens after the buff pass, so during an outro this is who is coming *in*, which is
 * what a buff needs to know to end on the swap rather than on the incoming resonator's intro.
 */
export const nextSlot = () => {
  const c = cur();
  return c.state.slots[(c.state.active + 1) % c.state.slots.length];
};
/** Inside the intro→outro window. Gate on-field-only passives on this. */
export const onField = () => cur().slot.onField;

/**
 * Put a buff on the acting resonator's own list — how an action opens a state. Idempotent:
 * does nothing if already held, so a re-triggered state does not stack. Use `addStack` instead
 * when a buff is meant to stack.
 *
 * Goes to the *front* of the list, so a state that moves a counter applies before the gear
 * that scales on it and the gear reads the value this action produced. Order within a stage
 * is irrelevant for anything that merely adds a stat.
 */
export function grantSelf(buffName) {
  const slot = cur().slot;
  if (slot.hasBuff(buffName)) return slot;
  return slot.addBuff(buffName, { via: "state", front: true });
}

/**
 * Add a stack of a buff to the acting resonator — unlike `grantSelf`, this does NOT check
 * whether it is already held, so calling it repeatedly is how a buff stacks (the generic
 * Shield buff in shared.js calling `addStack(SHIELD, n)` on itself every action it fires).
 */
export const addStack = (buffName, n = 1, cap = Infinity) =>
  cur().slot.addBuff(buffName, { via: "state", n, cap });

/** Current stack count of a buff on the acting resonator. 0 if not held. */
export const stacksOf = (buffName) => cur().slot.stacksOf(buffName);

/** Remove a single stack; the buff disappears once it reaches zero. */
export const removeStack = (buffName, n = 1) => cur().slot.removeStack(buffName, n);

/** Record something notable — a rotation that spends a gauge it does not have, say. Prefixed
 *  with the full name of the action in progress. */
export const note = (msg) => cur().state.log.push(`${cur().state.tag()}${msg}`);

/** Queue a follow-up action, evaluated straight after the current one, on the resonator that
 *  queued it. */
export function queue(actionId) {
  getAction(actionId);
  cur().state.pending.push({ id: actionId, slot: cur().state.active });
}

/* the three buff delivery mechanisms, from inside a buff or action */
export const outro = (buffName) => cur().state.publishOutro(buffName);
export function grantTeam(buffName) {
  cur().state.grant(buffName, cur().state.slots);
}
export function grantOthers(buffName) {
  const c = cur();
  c.state.grant(buffName, c.state.slots.filter((s) => s !== c.slot));
}

/** Take a buff off every slot — how a team-wide aura ends. */
export function revokeTeam(buffName) {
  let n = 0;
  for (const slot of cur().state.slots) if (slot.removeBuff(buffName)) n++;
  return n;
}
export const revoke = (buffName) => cur().slot.removeBuff(buffName);

/** Every slot currently holding `buffName`. Lets one resonator's code find another's — an
 *  ally applying a shield needs to reach whoever is running Jingran. */
export const slotsWith = (buffName) => cur().state.slots.filter((s) => s.hasBuff(buffName));
