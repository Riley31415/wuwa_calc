/**
 * The four things a kit is made of: buffs, gear, actions and chains.
 *
 * Each is a class, and each definition **is** the object other code holds. There is no registry
 * and no name lookup: a rotation is an array of `Action`s, a loadout is an array of `Gear`, and
 * a buff that grants another one passes the `Buff` itself. Names survive only for display.
 *
 * A **buff** is anything with a name that can apply stats: a passive, a conversion, a state,
 * an outro effect, an action-local effect. It has no life of its own — something has to add
 * it to a resonator.
 *
 * **Gear** is what actually does that adding. A gear entry — a resonator's own kit, a weapon,
 * a mainslot, a sonata, a 2pc — *is* a buff (it extends one), and `State.startFight()` puts it
 * on the resonator the moment it is equipped. Gear is the only thing with an `onFightStart()`
 * hook, since it is the only thing whose presence at the start of the fight is meaningful — a
 * buff with no gear behind it has to be granted by something during play, at which point
 * `apply()` already runs every action.
 *
 * An **action** is a step in a rotation. It carries the static numbers (motion value, energy,
 * concerto, offtune, forte, shields) and, optionally, an `apply()` of its own — whatever that
 * cast does beyond its numbers, run in the middle of the buff pass rather than defined
 * somewhere else and referenced by name.
 *
 * Nothing here imports `state.js`, which is what keeps the dependency graph acyclic:
 * kit.js <- state.js <- the resonators. (`damage.js` is safe to reach for — it only reads
 * `stats.js`.)
 */
import { mvPercent } from "./damage.js";

/**
 * Five stages, named for what actually goes in each. There is **no default**: every buff and
 * every action body states its own, so a definition always says when it runs.
 *
 * The pass walks these in order and re-reads the resonator's buff list at each stage, so a buff
 * added by an earlier stage still runs in its own — a weapon can stack a buff into existence at
 * GEAR_STATS and that buff still pays out at BUFF_STATS on the same cast, with nothing needing
 * to be pre-seeded. Only the reverse fails: a buff added at a stage already gone by waits for
 * the next action.
 */
export const PRIORITY = {
  /**
   * What the cast changes, before anything reads a number: open or spend a state, grant or
   * revoke a buff, stack or consume another. Anything with a side effect beyond `add()`.
   *
   * It has to land before anything that reacts to the cast *connecting* — a shield is gained on
   * hit, so Jingran's intro spends his Ghost Shroud here, before his own hit adds to the pile.
   *
   * Nothing here may rely on `hp()` / `atk()`: gear has not contributed yet.
   */
  UPDATE_BUFFS: 0,

  /**
   * Every gear entry, always — `Gear` assigns this and accepts no priority of its own.
   * Gear supplies the base stat line, so it settles before anything reads a total: the stats
   * at this layer are the "unbuffed" ones.
   */
  GEAR_STATS: 1,

  /**
   * A buff whose `apply()` is nothing but `add()` calls: a stacking buff's payout, a team aura,
   * the stat an outro hands over. Runs after gear, so the two never race.
   */
  BUFF_STATS: 2,

  /**
   * Conversions that read a summed total the stages above built:
   *   Jingran      total HP -> flat ATK, and -> fusion damage
   *   Shorekeeper  total ER -> the team's crit rate and crit damage
   */
  EARLY_CONVERSION: 3,

  /**
   * The last word on stats: conversions reading what an EARLY_CONVERSION produced, and
   * aggregations over everything above.
   */
  LATE_CONVERSION: 4,

  /**
   * After every number is settled — for a buff that decides whether the cast summons *another*
   * cast. The automatic tune break is the one: it has to read the off-tune bar after everything
   * that could have added to it, including a conversion that boosts off-tune buildup.
   *
   * Nothing here should add a stat. By this point the totals have already been read.
   */
  AUTO_ACTION: 5,
};

/** The stages in the order the pass walks them. */
export const PRIORITY_BANDS = [...new Set(Object.values(PRIORITY))].sort((a, b) => a - b);

const PRIORITY_NAMES = new Set(Object.values(PRIORITY));

/**
 * A buff: named stats, applied wherever it is added. `apply()` takes no arguments — a buff that
 * stacks reads its own `stacks` field, which is live, so it sees stacks granted earlier in the
 * same action. Most buffs never stack at all and never ask; they sit at `max_stacks` of 1.
 *
 * A buff refers to itself by the `const` it is assigned to. That is not a cycle: `apply()` only
 * ever runs long after the assignment has completed.
 */
export class Buff {
  constructor(name, priority, apply, max_stacks = 1) {
    if (typeof apply !== "function") throw new Error(`buff "${name}" needs an apply() function`);
    if (!PRIORITY_NAMES.has(priority)) {
      throw new Error(`buff "${name}" needs an explicit PRIORITY — there is no default`);
    }
    if (!(max_stacks >= 1)) throw new Error(`buff "${name}": max_stacks must be at least 1`);
    this.name = name;
    this.priority = priority;
    this.apply = apply;
    /**
     * How many stacks are live. The ceiling is enforced here rather than at every call site, so
     * a kit says how many stacks a thing has once — in its definition — and everything that
     * grants one can just grant it and let the excess fall on the floor.
     */
    this.max_stacks = max_stacks;
    this.stacks = 0;
  }

  /**
   * A copy for one resonator to hold.
   *
   * The `const` a kit file exports is the **definition**; a slot never holds it directly, it
   * holds one of these. That is what keeps stacks per resonator: two people standing in the same
   * aura each accrue their own, and one of them losing it does not empty the other's. Only the
   * instance on the acting resonator ticks on any given action.
   *
   * Everything else — name, priority, apply, max_stacks — is shared with the definition, so a
   * kit still describes a buff exactly once.
   */
  instance() {
    const copy = Object.create(Object.getPrototypeOf(this));
    Object.assign(copy, this);
    copy.stacks = 0;
    copy.definition = this;
    return copy;
  }

  /** Grant stacks, discarding whatever goes past the ceiling. Returns the new count. */
  addStacks(n = 1) {
    this.stacks = Math.min(this.max_stacks, this.stacks + n);
    return this.stacks;
  }

  /** Spend stacks; never goes below empty. Returns the new count. */
  removeStacks(n = 1) {
    this.stacks = Math.max(0, this.stacks - n);
    return this.stacks;
  }

  /**
   * So a log line or a trace can interpolate a buff directly: `granted ${buff}`.
   *
   * A buff that can stack says how many it is holding, since for those the count *is* the
   * interesting part of the reading — "Nature's Order x6" rather than a bare name against a
   * number that only makes sense once you know the stacks behind it.
   *
   * The count is per resonator, so this only reads correctly on an instance (see `instance()`).
   * A definition always reports x0, because a definition never holds anything.
   */
  toString() {
    return this.max_stacks > 1 ? `${this.name} x${this.stacks}` : this.name;
  }
}

/**
 * Gear: a buff that something equips, plus an optional `onFightStart()` — the one hook only
 * gear gets, run once when `State.startFight()` equips it.
 *
 * Gear is always `GEAR_STATS` and cannot say otherwise: it is what supplies the unbuffed stat
 * line, and everything downstream is ordered around that being settled. Gear that also has to
 * *change* something puts that in its `onFightStart()`, or the effect lives in a buff of its own.
 */
export class Gear extends Buff {
  /**
   * `element` is what a resonator's own Gear declares (`new Gear("Lupa", apply, onFightStart,
   * FUSION)`) — weapons, echoes and stat sticks leave it null, since only a resonator has an
   * elemental identity of their own. `State.startFight()` reads it off the first piece of gear
   * in a loadout — the resonator itself, by loadout convention — so team-composition logic
   * (Lupa's Pack Hunt counting how many fusion resonators are on the team, say) can read it
   * straight off `Slot.resonator` rather than a hand-maintained team counter.
   */
  constructor(name, apply, onFightStart = null, element = null) {
    super(name, PRIORITY.GEAR_STATS, apply);
    this.onFightStart = onFightStart;
    this.element = element;
  }
}

/**
 * One step in a rotation. Everything it declares is static; only `apply()` runs.
 */
export class Action {
  constructor(id, def = {}) {
    this.id = id;
    this.source = def.source ?? id.split(":")[0].trim();
    // tags: what the action *is*. An action resolves the scoped damage bonuses that match
    // these itself, which is why buffs no longer carry a tag filter.
    this.element = def.element ?? null;
    this.type = def.type ?? null;
    this.node = def.node ?? null;
    this.scaling = def.scaling ?? null;
    this.mv = def.mv ?? 0;
    // resource deltas, negative to spend
    this.energy = def.energy ?? 0;
    this.concerto = def.concerto ?? 0;
    this.offtune = def.offtune ?? 0;
    this.forte1 = def.forte1 ?? 0;
    this.forte2 = def.forte2 ?? 0;
    this.forte3 = def.forte3 ?? 0;
    this.forte4 = def.forte4 ?? 0;
    // How many shields this action grants. Everything shield-driven in the game is phrased as
    // an event — "upon gaining a Shield, gain 1 stack" — so this is that event, and the buffs
    // that care read it off the action and turn it into stacks of their own.
    this.shields = def.shields ?? 0;
    // What the action itself does — spend a gauge, open a state, queue a follow-up, add its own
    // stats. Written straight here rather than as a buff the action carries: it only ever runs
    // for this action, so naming it bought nothing but a layer to look through.
    //
    // It runs in `priority`'s stage, after the resonator's own buffs in that stage. An action
    // with a body must state one — a body that reads hp()/atk() cannot sit at UPDATE_BUFFS,
    // since gear has not contributed yet.
    this.apply = def.apply ?? null;
    this.priority = def.priority ?? null;
    // Only a body needs a stage; an action that is nothing but numbers never runs in the pass.
    if (this.apply && !PRIORITY_NAMES.has(this.priority)) {
      throw new Error(`action "${id}" has an apply() and so needs an explicit PRIORITY`);
    }
  }

  /** Does this action carry any of these tags? Tests element, damage type and node. */
  is(...tags) {
    return tags.some((t) => t === this.element || t === this.type || t === this.node);
  }

  toString() { return this.id; }
}

/**
 * A chain is one thing you write in a rotation that stands for several actions — `BA1234`
 * for the whole basic string. Each member is still evaluated on its own, snapshotting its
 * own buffs; the chain only affects how the result is displayed.
 *
 * Members may be of different types (BA1/BA2 are basic, BA3/BA4 are heavy). That is allowed:
 * the collapsed row shows the total motion value of the whole chain, and the stats of
 * whichever part hit hardest.
 */
export class Chain {
  constructor(id, members) {
    if (!Array.isArray(members) || !members.length) {
      throw new Error(`chain "${id}" needs a non-empty member list`);
    }
    for (const m of members) {
      if (!(m instanceof Action)) {
        throw new Error(`chain "${id}" has a member that is not an Action: ${m}`);
      }
    }
    this.id = id;
    this.members = [...members];
  }
  toString() { return this.id; }
}

/**
 * Collapse chain results for display.
 *
 * A chain is evaluated member by member — each part snapshots its own buffs and gets its own
 * damage — but reads as one line in the output. The collapsed row carries:
 *
 *   - the **total motion value** of every part combined
 *   - the **summed damage** of every part
 *   - the stats of whichever part hit hardest, since the parts may be of different types
 *     (BA1/BA2 are basic, BA3/BA4 are heavy) and no single set of stats describes them all
 *
 * Nothing here changes a calculation; it only groups results.
 *
 * @param rows  [{ snap, dmg }] in evaluation order, as returned alongside State.run()
 * @returns     [{ id, parts, snap, mv, noCrit, crit, avg, isChain }]
 */
export function collapseChains(rows) {
  const groups = [];
  const byInstance = new Map();

  for (const row of rows) {
    const instance = row.snap.chain;
    if (!instance) {
      groups.push({ id: row.snap.action.id, parts: [row], isChain: false });
      continue;
    }
    const existing = byInstance.get(instance);
    if (existing) {
      existing.parts.push(row);
    } else {
      const group = { id: row.snap.chainOf, parts: [row], isChain: true };
      byInstance.set(instance, group);
      groups.push(group);
    }
  }

  return groups.map((g) => {
    const best = g.parts.reduce((a, b) => (b.dmg.avg > a.dmg.avg ? b : a));
    const sum = (pick) => g.parts.reduce((n, p) => n + pick(p), 0);
    return {
      id: g.id,
      isChain: g.isChain,
      parts: g.parts,
      snap: best.snap,                       // the hardest-hitting part's stats
      mv: sum((p) => mvPercent(p.snap)),     // but the whole chain's motion value
      noCrit: sum((p) => p.dmg.noCrit),
      crit: sum((p) => p.dmg.crit),
      avg: sum((p) => p.dmg.avg),
    };
  });
}

/* --------------------------------------------------------------------- guards */
/*
 * With definitions passed by reference a typo is a `ReferenceError` at load rather than a
 * lookup miss at run time — but `undefined` still slips through an optional field or a bad
 * property read, so the entry points that accept one check what they were handed.
 */

export function asBuff(b, what = "a buff") {
  if (!(b instanceof Buff)) throw new TypeError(`expected ${what}, got ${b}`);
  return b;
}

export function asAction(a, what = "an action") {
  if (!(a instanceof Action)) throw new TypeError(`expected ${what}, got ${a}`);
  return a;
}
