/**
 * Calculation state, and the ambient namespace buff/action functions author against.
 *
 * Every buff a resonator is under sits on its own list, and reaches it three ways:
 *
 *   1. own gear        seeded onto its own resonator at the start of the fight (see
 *                      kit.js — gear is what actually adds a buff), plus the states its
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
  SLOT_RESOURCES, TEAM_RESOURCES, ENERGY, CONCERTO, FORTE1, FORTE2, FORTE3, FORTE4, OFFTUNE,
  scopedStat, TAGS_MATCHED, INTRO, OUTRO, ECHO, LIB,
} from "./stats.js";
import {
  Gear, Chain, asBuff, asAction, labelOf, nameOf, setLabel, PRIORITY, PRIORITY_BANDS,
} from "./kit.js";

/** What an action is, for matching scoped stats: its element and its damage type. */
const tagsOf = (action) => TAGS_MATCHED.map((k) => action?.[k]).filter(Boolean);

/**
 * Which button an action is, rather than what damage it deals. Shorekeeper's intro deals skill
 * damage and her Discernment deals liberation damage; both are intros, because both are `cast:
 * INTRO`. A summoned follow-up is no cast at all and answers false to every one of these.
 */
export const isIntro = (action) => action.cast === INTRO;
export const isOutro = (action) => action.cast === OUTRO;
export const isEcho = (action) => action.cast === ECHO;
export const isLiberation = (action) => action.cast === LIB;

/* ------------------------------------------------------------------- one slot */

export class Slot {
  constructor(name, index, state = null) {
    this.name = name;
    this.index = index;
    /** The fight this slot belongs to, so buff events can reach its log. */
    this.state = state;
    /** Every buff on this resonator. Buff -> { revokeOnOutro, via }; the stack count lives on
     *  the Buff itself. */
    this.list = new Map();
    /**
     * Resources and gauges: six real fields, not a map keyed by name. A resonator has exactly
     * these six running totals; `counter()`/`setCounter()` below are the only way to reach
     * them, and both reject any name that is not one of the six, so nothing can start a
     * seventh by typo or on a whim the way a bare `Map` would silently allow.
     *
     * The forte gauges stay generic (`forte1`..`forte4`) rather than named for what they mean
     * to one resonator — Qi, Sentience, Wolflame — since a kit assigns its own meaning onto
     * whichever slot fits (see e.g. `LUPA_WOLFLAME = FORTE1` in lupa.js), and this table holds
     * every resonator's kit, not just one.
     */
    this.energy = 0;
    this.concerto = 0;
    this.forte1 = 0;
    this.forte2 = 0;
    this.forte3 = 0;
    this.forte4 = 0;
    /** Stat entries rebuilt for every action. */
    this.entries = [];
    /** Who moved which counter during the action being evaluated, rebuilt alongside `entries`.
     *  Counters are running totals rather than stats, so this is the only record of what a
     *  single cast did to one — which is what the resource columns' hover panels show. */
    this.counterLog = [];
    /** On field, i.e. inside the intro→outro window. The sheet called this "burst". */
    this.onField = false;
    /** The Gear representing the resonator themself — the first entry in their loadout, by
     *  convention — set once by `State.startFight()`. Its `.element` is what team-composition
     *  logic reads to tell what this slot is holding without a hand-maintained counter. */
    this.resonator = null;
  }

  /**
   * Record a buff event against this resonator, prefixed with the action in progress.
   *
   * Every change to the buff list goes through the four methods below, so logging here — rather
   * than at `grant`/`adopt`/`revoke` — is what makes the log complete: a buff that arrives by a
   * route nobody thought to instrument still shows up.
   *
   * `make` is a function, not a string, because a buff is granted *before* it has ever run and
   * only names itself by running. Deferring the wording to read time means the line says what
   * the buff turned out to be called rather than "(unnamed buff)"; the action tag is captured
   * now, since by read time the fight has moved on.
   */
  note(buff, make) {
    if (!this.state) return;
    const tag = this.state.tag();
    this.state.events.push({ buff, render: () => `${tag}${this.name} ${make()}` });
  }

  /**
   * Put a buff on this resonator's list — idempotent, so re-asserting a team aura every action
   * neither duplicates it nor disturbs it.
   *
   * Being *held* and being *stacked* are two separate things: the stack count lives on the Buff
   * itself (see kit.js), so this only decides whether the buff's `apply()` runs here.
   * `addStack` is what moves the count.
   */
  addBuff(buff, { revokeOnOutro = false, via = "gear", front = false } = {}) {
    asBuff(buff);                        // fail fast on an undefined reference
    if (this.list.has(buff)) return this;
    this.note(buff, () => `gained ${nameOf(this.list.get(buff) ?? buff)} (${via})`);
    // keyed by the definition, holding this resonator's own instance of it
    const entry = buff.instance();
    entry.revokeOnOutro = revokeOnOutro;
    entry.via = via;
    if (front) {
      // states go first, so a state that moves a counter applies before the gear that scales
      // on it, and that gear reads the value this action produced.
      const rest = [...this.list.entries()];
      this.list.clear();
      this.list.set(buff, entry);
      for (const [k, v] of rest) this.list.set(k, v);
    } else {
      this.list.set(buff, entry);
    }
    return this;
  }

  /** Hold the buff if it is not held already, and stack this resonator's own instance of it.
   *  The ceiling is the buff's `max_stacks`; anything past it is discarded. */
  addStack(buff, n = 1) {
    // A grant already carries the first stack, so asking for 3 on something not yet held means
    // three, not four.
    const fresh = !this.list.has(buff);
    this.addBuff(buff, { via: "state" });
    const held = this.list.get(buff);
    const before = held.stacks;
    const after = held.addStacks(fresh ? Math.max(0, n - 1) : n);
    if (after !== before) {
      const capped = after === held.max_stacks && before + n > held.max_stacks ? " (capped)" : "";
      this.note(buff, () => `${nameOf(held)} ${before} -> ${after}${capped}`);
    }
    return after;
  }

  /** Spend stacks; the buff drops off this list once it is empty. */
  removeStack(buff, n = 1) {
    const held = this.list.get(buff);
    if (!held) return false;
    const before = held.stacks;
    const after = held.removeStacks(n);
    if (after !== before) {
      this.note(buff, () => `${nameOf(held)} ${before} -> ${after} (spent ${before - after})`);
    }
    if (after <= 0) { this.list.delete(buff); this.note(buff, () => `lost ${nameOf(held)} (empty)`); }
    return true;
  }

  /** Clear the buff entirely. Its stacks go with it: the instance holding them is discarded,
   *  so a buff taken away and later granted again starts from nothing. */
  removeBuff(buff) {
    const held = this.list.get(buff);
    if (!held) return false;
    this.list.delete(buff);
    const at = held.max_stacks > 1 ? ` (at ${held.stacks})` : "";
    this.note(buff, () => `lost ${nameOf(held)}${at}`);
    return true;
  }
  hasBuff(buff) { return this.list.has(buff); }
  /** This resonator's stack count for a buff. 0 if it does not hold it. */
  stacksOf(buff) { return this.list.get(buff)?.stacks ?? 0; }

  /** One of the six named resources — throws on anything else, rather than silently reading 0
   *  for a counter that was never declared. */
  counter(name) {
    switch (name) {
      case ENERGY: return this.energy;
      case CONCERTO: return this.concerto;
      case FORTE1: return this.forte1;
      case FORTE2: return this.forte2;
      case FORTE3: return this.forte3;
      case FORTE4: return this.forte4;
      default: throw new Error(`Slot: no such counter "${name}"`);
    }
  }
  setCounter(name, v) {
    const before = this.counter(name);   // also rejects an unknown name before anything moves
    switch (name) {
      case ENERGY: this.energy = v; break;
      case CONCERTO: this.concerto = v; break;
      case FORTE1: this.forte1 = v; break;
      case FORTE2: this.forte2 = v; break;
      case FORTE3: this.forte3 = v; break;
      case FORTE4: this.forte4 = v; break;
    }
    // the *object* that moved it, not its name — a buff only names itself once it runs, so the
    // wording is resolved at the end of the action (see `evaluate`)
    if (v !== before) this.counterLog.push({ counter: name, delta: v - before, src: CTX?.source });
    return v;
  }

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
  /**
   * `buffs` seeds every slot's list before anything is equipped — the engine's own standing
   * rules, as opposed to anything a build brought with it. The automatic tune break is one
   * (see shared.js): the engine has no idea what a tune break is, it just runs the buff.
   */
  constructor({ team = ["slot1"], level = 90, enemyLevel = 100, res = 20, buffs = [] } = {}) {
    // the log and the action tag come first: a slot writes to them the moment it is handed a buff
    /**
     * Log lines. Written as thunks — see `Slot.note()` for why the wording is deferred — and
     * frozen into strings at the end of the action that produced them, so a line says what a
     * buff was called *then* rather than what it was last called at the end of the fight.
     */
    this.events = [];
    this.currentAction = null;
    this.slots = team.map((n, i) => new Slot(n, i, this));
    this.active = 0;
    this.config = { level, enemyLevel, res };
    for (const slot of this.slots) for (const b of buffs) slot.addBuff(b, { via: "engine" });

    /** Buff names published, waiting for the next intro to pick them up. */
    this.outroQueue = [];
    /**
     * Off-tune: the one team-wide running total, a real field rather than a map entry — see
     * `Slot`'s own counters for why. `counter()`/`setCounter()` only ever recognise `OFFTUNE`;
     * anything else throws instead of quietly starting a new team counter nobody declared.
     */
    this.offtune = 0;
    /** The team-wide counterpart of `Slot.counterLog`, for the off-tune bar. */
    this.counterLog = [];
    this.flags = new Set();
    /** Follow-up actions queued by an action, spliced in after the current one. */
    this.pending = [];
    this.chainSeq = 0;
  }

  get slot() { return this.slots[this.active]; }
  slotOf(name) { return this.slots.find((s) => s.name === name); }

  /**
   * Freeze every log line written so far into its final wording. Called at the end of each
   * action, once every buff involved has reported its name.
   *
   * Lines written before any action has run — equipping gear at `startFight()` — simply wait
   * here until the first one does, which is exactly when those names first exist.
   */
  settleLog() {
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      if (typeof e === "string") continue;
      // a line about a buff nobody has run yet cannot be worded — Iuno's gear is equipped
      // before she ever acts, and only names itself once she does. It waits.
      if (e.buff && labelOf(e.buff) == null) continue;
      this.events[i] = e.render();
    }
  }

  /** The event log. Anything not yet frozen is worded on the way out. */
  get log() {
    return this.events.map((line) => (typeof line === "string" ? line : line.render()));
  }

  counter(name) {
    if (name !== OFFTUNE) throw new Error(`State: no such team counter "${name}"`);
    return this.offtune;
  }
  setCounter(name, v) {
    const before = this.counter(name);   // also rejects an unknown name before anything moves
    this.offtune = v;
    // the *object* that moved it, not its name — a buff only names itself once it runs, so the
    // wording is resolved at the end of the action (see `evaluate`)
    if (v !== before) this.counterLog.push({ counter: name, delta: v - before, src: CTX?.source });
    return v;
  }

  /** Prefix for a log line: the full action name, when one is in progress. */
  tag() { return this.currentAction ? `${this.currentAction}: ` : ""; }

  /**
   * Mechanism 1 — equip each resonator's gear: seed the matching-name buff, then run every
   * equipped gear's onFightStart(). Only gear gets this hook (see kit.js), so the second
   * pass only has to walk the gear lists themselves, not the resulting buff lists.
   */
  startFight(loadouts) {
    for (const [slotName, gearList] of Object.entries(loadouts)) {
      const slot = this.slotOf(slotName);
      if (!slot) throw new Error(`no slot named "${slotName}"`);
      // Two distinct Gear objects with the same name are two separate entries on the list, so
      // both would apply and the stat line would silently double. Nothing enforces unique names
      // globally any more — a loadout is the only place a collision can actually do harm, and
      // it is the place that can say so usefully.
      const seen = new Set();
      for (const gear of gearList) {
        if (!(gear instanceof Gear)) {
          throw new Error(`${slotName}: startFight() only equips Gear, got ${gear}`);
        }
        // By identity: a Gear has no name to collide on any more, and equipping the very same
        // object twice is the collision that actually doubles a stat line.
        if (seen.has(gear)) throw new Error(`${slotName} equips the same gear twice`);
        seen.add(gear);
        slot.addBuff(gear, { via: "gear" });
      }
      // The first entry is the resonator themself, by loadout convention — every kit file
      // lists their own Gear first and their weapon/echoes/stats after.
      slot.resonator = gearList[0];
    }
    for (const [slotName, gearList] of Object.entries(loadouts)) {
      const slot = this.slotOf(slotName);
      for (const gear of gearList) {
        if (!gear.onFightStart) continue;
        withContext({ state: this, slot, action: null, source: gear }, gear.onFightStart);
      }
    }
    return this;
  }

  /** Mechanism 2 — publish a buff for whoever intros next. */
  publishOutro(buff) {
    asBuff(buff);
    this.outroQueue.push(buff);
    const tag = this.tag();
    this.events.push({ buff, render: () => `${tag}published ${nameOf(buff)} to the outro queue` });
  }

  /** Mechanism 2 — the acting resonator intros and adopts whatever is queued. */
  adoptOutroBuffs() {
    if (!this.outroQueue.length) return [];
    const taken = this.outroQueue.splice(0);
    for (const buff of taken) this.slot.addBuff(buff, { revokeOnOutro: true, via: "outro" });
    return taken;
  }

  /** Mechanism 2 — the acting resonator outros; the buffs it adopted expire. */
  revokeOutroBuffs() {
    const gone = [];
    for (const [buff, meta] of this.slot.list) {
      if (meta.revokeOnOutro) { this.slot.removeBuff(buff); gone.push(buff); }
    }
    return gone;
  }

  /** Mechanism 3 — a grant to specific slots. Idempotent, so a buff may re-assert it every
   *  action without the list or the log growing — and without stacking it. */
  grant(buff, slots) {
    asBuff(buff);
    const fresh = slots.filter((s) => !s.hasBuff(buff));
    for (const s of fresh) s.addBuff(buff, { via: "grant" });
    return fresh.length;
  }

  /* ------------------------------------------------------------ evaluation */

  /**
   * Evaluate one action: rebuild the acting resonator's stats from its buff list, let the
   * action contribute, and return the resolved snapshot.
   */
  evaluate(action, meta = {}) {
    asAction(action);
    // A queued step belongs to whoever queued it. `run()` pins the slot and restores it after,
    // so a follow-up an outro summoned still resolves on the resonator that summoned it.
    if (meta.slot != null) this.active = meta.slot;
    const slot = this.slot;
    this.currentAction = action;

    // --- general rules every resonator shares, before anything kit-specific runs ---

    // An intro opens the on-field window and adopts whatever the previous resonator left in
    // the outro queue. An outro closes the window; it is half-open, matching the sheet, so
    // the outro action itself is already off field.
    //
    // An intro is recognised by its *cast* — which button it is — not by its damage type.
    // Shorekeeper's intro deals skill damage and her Discernment deals liberation damage;
    // both are still intros, because both are cast: INTRO.
    if (isIntro(action)) { slot.onField = true; this.adoptOutroBuffs(); }
    if (isOutro(action)) slot.onField = false;

    // 1. resources first, so buffs that scale on a counter see this action's own change.
    //    Every one is a running total across the rotation. The forte gauges, energy and
    //    concerto belong to the resonator; off-tune is one bar the whole team fills.
    //
    //    A liberation contributes nothing to energy and an outro nothing to concerto: both
    //    consume whatever is banked, which no running total can express, so they simply do
    //    not move it. The costs they declare (-125, -100) are kept for display.
    //    Both logs are cleared first, and the deltas are credited to the action itself, so the
    //    resource panels read the same way the stat panels do: one row per thing that moved it.
    slot.counterLog = [];
    this.counterLog = [];
    const ctx = { state: this, slot, action, source: null };

    withContext({ ...ctx, source: action }, () => {
      for (const r of SLOT_RESOURCES) {
        const spendsEverything = action[r] < 0 && (r === ENERGY || r === CONCERTO);
        slot.setCounter(r, slot.counter(r) + (spendsEverything ? 0 : action[r]));
      }
      for (const r of TEAM_RESOURCES) this.setCounter(r, this.counter(r) + action[r]);
    });

    slot.entries = [];

    // 2. every buff applies, stage by stage: UPDATE_BUFFS, GEAR_STATS, BUFF_STATS, then the two
    //    conversion stages.
    //
    //    A stage does not materialise its list once and walk it. It **drains**: it runs whatever
    //    is waiting, then looks again, until nothing new turns up. That is what lets a buff grant
    //    another buff of the *same* priority and have it still apply on this cast — a state that
    //    opens another state, a passive that installs the thing that pays out — instead of the
    //    grant landing a moment too late and waiting for the next action.
    //
    //    Reaching later stages was never in question (the list is re-read at each one, so a
    //    weapon stacking something into existence at GEAR_STATS has it pay out at BUFF_STATS).
    //    Only an *earlier* stage is out of reach, and that is unavoidable: it has already run.
    //
    //    `ran` is what makes draining terminate and keeps it honest — one apply() per buff per
    //    action, keyed on the definition, so a buff revoked and re-granted mid-pass still runs
    //    exactly once and two buffs granting each other cannot ping-pong.
    const ran = new Set();

    /**
     * Run one buff, and keep the name it reports.
     *
     * `apply()` returning its own name is the only way a buff is named at all, so the label is
     * recorded on this resonator's instance (which carries the stack count the name may quote)
     * and on the shared definition, so anything holding only the definition can still read it.
     */
    const runBuff = (buff) => {
      const said = withContext({ ...ctx, source: buff }, () => buff.apply());
      if (typeof said === "string" && said) setLabel(buff, said);
    };

    /** Run everything at this band that has not run yet, repeatedly, until nothing new appears. */
    const drain = (band) => {
      for (let sweep = 0; ; sweep++) {
        // The acting resonator's own *instances* run, not the definitions — that is what makes a
        // stacking buff report this resonator's count when it names itself in a trace.
        const running = [...slot.list.values()]
          .filter((buff) => !ran.has(buff.definition) && buff.priority === band);
        if (!running.length) return;
        if (sweep > 1000) {
          throw new Error(`priority band ${band} did not settle — a buff granting new buffs forever?`);
        }
        // Claimed before any of them run, so a buff that revokes itself still applies once.
        for (const buff of running) ran.add(buff.definition);
        for (const buff of running) runBuff(buff);
      }
    };

    for (const band of PRIORITY_BANDS) {
      drain(band);

      // The action's own body joins its own stage, last — which is what lets it read summed
      // totals like hp() when it sits at GEAR_STATS or later. It stands in for a buff here, and
      // an Action already has the `name`-ish identity `add()` wants: its own `toString()`.
      if (action.apply && action.priority === band) {
        withContext({ ...ctx, source: action }, () => action.apply());
        drain(band);   // and whatever the body just granted at this band runs too
      }
    }

    // Every buff has now said what it is called, so the traces can be worded. Done here rather
    // than at each `add()` because at that moment the buff contributing was still mid-apply and
    // had not reported its name yet.
    for (const e of slot.entries) e.source = nameOf(e.src);
    for (const e of slot.counterLog) e.source = nameOf(e.src);
    for (const e of this.counterLog) e.source = nameOf(e.src);
    this.settleLog();

    const snapshot = this.resolve(action, meta);

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
    // `cast` and `scaling` deliberately do NOT participate — Jingran's liberation is cast
    // "liberation" but type "heavy", so resolving cast would start paying liberation bonuses
    // on it. See TAGS_MATCHED in stats.js.
    const totals = new Map();
    for (const e of slot.entries) totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.value);

    const stat = (s) => tagsOf(action).reduce(
      (n, tag) => n + (totals.get(scopedStat(tag, s)) ?? 0), totals.get(s) ?? 0);

    return {
      action,
      slot: slot.name,
      // A queued follow-up (`queue()`/`queueOn()`) always names the slot it runs on; a plain
      // rotation entry never does — that is the one thing telling the two apart by the time a
      // snapshot exists, so display gets it for free rather than the engine tagging it twice.
      triggered: meta.slot != null,
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
      // Same shape display.js always read from the old Map (`counters[ENERGY]`, etc.) — only
      // the storage behind `slot`/`this` changed, not what a snapshot hands downstream.
      counters: {
        [ENERGY]: slot.energy, [CONCERTO]: slot.concerto,
        [FORTE1]: slot.forte1, [FORTE2]: slot.forte2, [FORTE3]: slot.forte3, [FORTE4]: slot.forte4,
      },
      teamCounters: { [OFFTUNE]: this.offtune },
      // Who moved a counter on this action. Copied rather than referenced: the automatic tune
      // break resets the off-tune bar *after* this snapshot is taken, and a live reference would
      // hand the row a delta its own total does not include — leaving the panel's arithmetic
      // short by exactly the reset.
      counterLog: [...slot.counterLog],
      teamCounterLog: [...this.counterLog],
      buffs: [...slot.list.values()].map(nameOf),
      stacks: Object.fromEntries([...slot.list.values()].map((h) => [nameOf(h), h.stacks])),
    };
  }

  /**
   * Run a rotation. Follow-ups an action queues are spliced in **directly after** it, in the
   * order they were queued, and a follow-up may itself queue more.
   */
  run(rotation) {
    const out = [];
    const queue = rotation.flatMap((entry) => this.expand(entry));
    let guard = 0;
    while (queue.length) {
      if (++guard > 10000) throw new Error("action queue did not drain — cyclic queue()?");
      const step = queue.shift();
      this.pending = [];
      // A queued step names the slot it was queued on, so switching to it is temporary: the
      // rotation carries on from wherever it was — unless the step itself was an outro, whose
      // switch is the whole point and has to stand.
      const before = this.active;
      out.push(this.evaluate(step.action, step));
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
  expand(entry) {
    if (!(entry instanceof Chain)) return [{ action: asAction(entry) }];
    const instance = `${entry.id}#${++this.chainSeq}`;
    return entry.members.map((m) => ({ action: m, chain: instance, chainOf: entry.id }));
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
  // The *object* that contributed, not its name. A buff only names itself by running, and it is
  // still running right now — the wording is filled in once the pass is over (see `evaluate`).
  c.slot.entries.push({ stat, value, src: c.source });
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

/** The action being evaluated — the `Action` itself, whose `is()` tests element / type / cast. */
export const action = () => cur().action;

/** The fight's settings: level, enemyLevel, res, maxOfftune. Read-only by convention. */
export const config = () => cur().state.config;

export const equipped = (buff) => cur().slot.hasBuff(buff);
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
 * does nothing if already held. Use `addStack` when a buff is meant to gain a stack.
 *
 * Goes to the *front* of the list, so a state that moves a counter applies before the gear
 * that scales on it and the gear reads the value this action produced. Order within a stage
 * is irrelevant for anything that merely adds a stat.
 */
export function grantSelf(buff) {
  const slot = cur().slot;
  if (slot.hasBuff(buff)) return slot;
  return slot.addBuff(buff, { via: "state", front: true });
}

/**
 * Put the buff on the acting resonator if it is not there already, and add `n` stacks to it.
 * The ceiling is the buff's own `max_stacks`, enforced by the buff — nothing here passes a cap,
 * and a grant that would overflow simply tops out.
 *
 * Read the result back off the buff itself: `NATURES_ORDER.stacks`.
 */
export const addStack = (buff, n = 1) => cur().slot.addStack(buff, n);

/** This resonator's stack count for a buff — live, so a buff sees stacks granted earlier in
 *  the same action. 0 if it is not held. */
export const stacksOf = (buff) => cur().slot.stacksOf(buff);

/** Spend stacks; the buff drops off the acting resonator once it is empty. */
export const removeStack = (buff, n = 1) => cur().slot.removeStack(buff, n);

/** Record something notable — a rotation that spends a gauge it does not have, say. Prefixed
 *  with the full name of the action in progress. */
export function note(msg) {
  const tag = cur().state.tag();
  cur().state.events.push({ buff: null, render: () => `${tag}${msg}` });
}

/** Queue a follow-up action, evaluated straight after the current one, on the resonator that
 *  queued it. */
export function queue(action) {
  asAction(action);
  cur().state.pending.push({ action, slot: cur().state.active });
}

/** Queue a follow-up on a specific resonator rather than whoever is acting — a teammate's own
 *  assist attack, summoned by something the *current* actor did, dealing the assisting
 *  resonator's own damage on their own buffs. `slot` is one of the `Slot`s `slotsWith()` (or
 *  `self()`) hands back. */
export function queueOn(slot, action) {
  asAction(action);
  cur().state.pending.push({ action, slot: slot.index });
}

/* the three buff delivery mechanisms, from inside a buff or action */
export const outro = (buff) => cur().state.publishOutro(buff);
export function grantTeam(buff) {
  cur().state.grant(buff, cur().state.slots);
}
export function grantOthers(buff) {
  const c = cur();
  c.state.grant(buff, c.state.slots.filter((s) => s !== c.slot));
}

/** Take a buff off every slot — how a team-wide aura ends. */
export function revokeTeam(buff) {
  let n = 0;
  for (const slot of cur().state.slots) if (slot.removeBuff(buff)) n++;
  return n;
}
export const revoke = (buff) => cur().slot.removeBuff(buff);

/** Every slot currently holding `buff`. Lets one resonator's code find another's — an
 *  ally applying a shield needs to reach whoever is running Jingran. */
export const slotsWith = (buff) => cur().state.slots.filter((s) => s.hasBuff(buff));

/** Every resonator currently on the team, by element — one entry per slot, in team order.
 *  Team-composition logic reads this directly rather than a hand-maintained counter: Lupa's
 *  Pack Hunt counts how many are FUSION itself, off this, rather than a `countFusion` a slot
 *  would otherwise have to remember to keep updated on entering and leaving the team. */
export const teamElements = () => cur().state.slots.map((s) => s.resonator?.element);
