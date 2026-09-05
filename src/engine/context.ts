/**
 * The kit-facing API: everything a resonator/weapon/echo file calls from inside a hook —
 * `addStat`, the `applied`/`consumed` questions, the forte gauges and concerto, every
 * grant/spend/revoke path, and the queues. All of it reads `ctx` for whose turn it is.
 */
import { Stat, EnemyStat, Attribute, WeaponType, Tier, Type1, Type2, Cast, Node, Scaling, scopedStat, tagBand, STAT_COUNT, TYPE2_BITS } from "./stats.js";
import type { Tag, StatKey } from "./stats.js";
import type { Rotation, Action, ActionGroup, ActionDef, ActionField } from "./rotation.js";
import { ctx, dryLog, undoDry, noteMutation, recordApplied, recordConsumed, pendingQueue, tagWord, tagWordOf, RESOURCE_STATS } from "./runtime.js";
import { Gear, Buff, Debuff, Resonator, Loadout, Matrix, Mainslot, Weapon } from "./gear.js";
import { State, TeamMember, StatEntry, HeldBuff, ZERO_STATS, TYPE2_AMP_INDEX, BASIC_DMG_BONUS_INDEX } from "./state.js";

/** The three pools a phase reads — the acting slot's own, then team-wide, then enemy — as the
 *  arrays they held when `capture()` last ran. Three references apiece, nothing copied: a Pool's
 *  arrays are copy-on-write, so whatever a hook grants or spends mid-phase lands in new arrays and
 *  these keep describing the roster the phase started on. Module-level scratch rather than an
 *  object per capture — `evaluate()` is never re-entered, so one shared set is safe. */

/** Whether this run is capturing the report's own per-entry trace — every `StatEntry`, the scoped
 *  `totals` behind it, and the held-buff rosters each snapshot carries for the resonator popover.
 *
 *  Off by default: the comparison table runs thousands of teams and reads nothing but each row's
 *  own damage/member/action, while building that trace means an object allocation and a
 *  `Gear.toString()` (which formats "Name xN") for every stat every buff contributes on every
 *  action — by far the most expensive thing this engine does, and pure waste for a row nobody has
 *  opened. `setTracing(true)` before re-running the one team whose detail page is actually being
 *  shown; see index.ts's own `detailFor()`. */
export function setTracing(on: boolean): void { ctx.tracing = on; }

export const currentAction = (): Action => ctx.act!;

/** True while the fight is part-way through an `ActionGroup` — set on every member but the last
 *  (see `run()`), and so still true across any follow-up queued off a mid-group cast. Only
 *  tunebreak.ts reads it: a group is one beat, so the bar may fill inside one but the break waits
 *  for the cast that ends it. Module state rather than a snapshot field because it has to answer
 *  for the action being evaluated *right now*, from inside a hook. */
export const midActionGroup = (): boolean => ctx.insideGroup;
/** Whether the action being evaluated was queued rather than played — an engine-spawned follow-up
 *  or event, a summon echo's own hit, or an outro handoff. The same answer the snapshot reports
 *  (`ResolvedSnapshot.triggered`), readable mid-action by gear that must not fire off one. */
export const triggeredAction = (): boolean => ctx.triggered;
export const currentTeam = (): State => ctx.state!;
/** Whichever member the engine is mid-call for — the acting slot in every ordinary phase, and the
 *  gear's *own holder* inside updateGlobal() (see `evaluate()`). What a rotation marker's own
 *  `resolve()` reads to find the resonator/mainslot it stands in for. */
export const currentMember = (): TeamMember => ctx.slot!;

/** Is the action being evaluated this cast type — checks both `cast` and `cast2`. */
export function casting(cast: Cast): boolean {
  return isCast(ctx.act!, cast);
}

/** Assign the action being evaluated a different damage type, for a kit whose state changes what a
 *  cast *counts as* rather than what it does — Denia's Breakdown Form hits becoming Resonance
 *  Liberation DMG while she holds Void Particle, Lucilla's Chafe mode making Clear As Day Basic
 *  Attack DMG. Pass a `Type1` to stand in for the action's own `type`, or a `Type2` for its
 *  `type2`; the assignment *replaces* that slot, so a Basic hit assigned Liberation is not Basic
 *  any more, and it lasts the one action (every action starts clean).
 *
 *  **Call it from `updateDebuffs()`** — not a debuff, but that is the first phase of the action,
 *  and everything that could care runs after it: `updateGlobal`/`updateBuffs`, every
 *  `applyStats`/`convertStats`, every `isType()` anywhere, the tags each scoped stat matches
 *  against (rebuilt here, so a Liberation-scoped bonus pays on a retagged Basic), and the
 *  snapshot's own `type`. The one gap is that phase itself: another gear's `updateDebuffs` may
 *  already have run and asked `isType()` before this call lands, so don't assign from anywhere
 *  later and don't rely on ordering within it.
 *
 *  The Action is never touched — kits compare actions by identity, and a mutated singleton would
 *  leak across the teams a worker runs. */
export function typeOverride(type: Type1 | Type2): void {
  const a = ctx.act!;
  if (type & TYPE2_BITS) ctx.overrideType2 = type as Type2;
  else ctx.overrideType1 = type as Type1;
  // the same three tags `tagWordOf()` folds, with the assignment standing in for whichever slot
  // it claimed
  ctx.tagWord = tagWord(a.element, ctx.overrideType1 ?? a.type, ctx.overrideType2 ?? a.type2);
}

/** Is the action being evaluated this damage type — its own `type` or `type2`, or whichever of
 *  the two a held Gear's `typeOverride` assigned for this evaluation, which stands in for that
 *  slot (a Basic hit assigned Liberation answers Liberation, not Basic). Kits ask this, never
 *  `currentAction().type` directly, so an assignment is seen by every check everywhere. */
export function isType(type: Type1 | Type2): boolean {
  const a = ctx.act!;
  return (ctx.overrideType1 ?? a.type) === type || (ctx.overrideType2 ?? a.type2) === type;
}

/** The same question about an action that isn't the one being evaluated — a snapshot's own, after
 *  the fact. Nothing outside this file should ever read `.cast`/`.cast2` directly: an action can
 *  count as two casts at once (Qiuyuan's Thus Spoke the Blade trio are Heavy Attacks whose
 *  performance also counts as performing an Echo Skill, which is what feeds Sigrika's own
 *  Soliskin Vitality), and a bare `.cast === X` silently misses every one of them. */
export function isCast(action: Action, cast: Cast): boolean {
  return action.cast === cast || action.cast2 === cast;
}

/** How many stacks of this Gear were applied *during the action being evaluated* — 0 if none.
 *  Every grant path (self, team, enemy, an outro handoff adopted at an Intro) records here, before
 *  any cap or "already held at that count" early-out, so re-inflicting a 1-stack debuff that's
 *  already on the target still reads as inflicted this action. Cleared at the top of every
 *  `evaluate()`. This is what a piece of gear reacting to "inflicts Tune Strain - Shifting" /
 *  "inflicts Fusion Burst" / "gains a shield" reads (see statuses.ts) — the counts, not just a
 *  yes/no, so a two-shield cast still counts twice. */
export function applied(gear: Gear): number { return ctx.appliedNow.get(gear) ?? 0; }

/** Same as `applied()`, but only counting it when *the resonator whose turn it is* is what put it
 *  on — 0 when it landed on this action off somebody else's kit.
 *
 *  The two differ exactly when one resonator's marker inflicts something off the back of a
 *  *teammate's* cast (Chisa's Unseen Snare handing out Havoc Bane on whoever is hitting the marked
 *  target). `applied()` is a plain "did this land this action", which is right for a kit reacting
 *  to the fight — Lucy's Countermeasure watching for anyone's Hack - Shifting, Lucilla's Film Roll
 *  answering a teammate's Chafe. It is wrong for a "when *you* inflict X" passive: a weapon or
 *  sonata worn by the teammate whose swing merely triggered Chisa's marker would read the Bane as
 *  theirs and pay out, when the kit text credits it to Chisa alone. Those read this instead.
 *
 *  "Whose doing" is `State.sourceOf`, already maintained on every grant path (see `attribute()`),
 *  so a debuff inherits the source of whichever Gear granted it rather than whoever was on field.
 *  It is compared against the acting slot, *not* against the asking Gear's own source: an outro
 *  handoff (Electro Rover's Electro Core) is sourced to whoever granted it but held and triggered
 *  by the resonator who received it, and that resonator inflicting the status is exactly the case
 *  it must still fire on.
 *
 *  Only meaningful for locally-held gear reading it in `updateBuffs`/`applyStats`, where the acting
 *  slot *is* the wearer. Inside `updateGlobal` a locally-held gear runs with `ctx.slot` switched
 *  to its own holder rather than the actor, so this would ask about the holder: a passive watching
 *  the whole team from there wants plain `applied()` for "did this land at all", or
 *  `appliedByMember()` below against `currentTeam().slot` for "did the acting slot land it".
 *
 *  Returns the acting slot's *own share*, not the action's whole count: when a marker inflicts
 *  alongside the actor (see `ctx.appliedBy`), the two are genuinely different numbers, and the share
 *  is the one a "when you inflict" passive means. Every caller today only asks whether it is
 *  nonzero. */
export function appliedByMe(gear: Gear): number {
  return appliedByMember(gear, ctx.slot!);
}

/** The same question about a *specific* member rather than whoever is current — how many stacks of
 *  this Gear that member is themselves responsible for on the action being evaluated.
 *
 *  `appliedByMe()` is this asked about `ctx.slot`, which is the right slot everywhere except
 *  `updateGlobal`: there a locally-held gear runs as its own *holder* while some teammate is the
 *  one acting, so a passive watching the whole team for "each resonator who inflicts X" has to name
 *  the acting slot (`currentTeam().slot`) instead of asking about itself. Hiyuki's Fine Snow, which
 *  banks one stack of Snow Rust per resonator who lands a Negative Status, is that case. */
export function appliedByMember(gear: Gear, member: TeamMember): number {
  return ctx.appliedBy.get(gear)?.get(member.name) ?? 0;
}

/** How many stacks of this Gear were *spent off the target* on the action being evaluated, by
 *  anyone — `applied()`'s counterpart, and the same per-action lifetime: cleared at the top of
 *  every `evaluate()`, so it answers "did this cast consume any" and nothing longer.
 *
 *  Only counts a spend a kit actually declared as one, through `consume()` (see `ctx.consumedNow`).
 *  Note when in the action a consumption is visible: a cast that spends its stacks in `afterAction`
 *  — the usual place, so the cast itself still reads the full count — is invisible to any reader
 *  earlier in that same action, and a passive paying out for it wants `afterAction` too. */
export function consumed(gear: Gear): number { return ctx.consumedNow.get(gear) ?? 0; }

/** Same as `consumed()`, but only the share the member whose turn it is spent themselves. This is
 *  what a "when *you* consume X" passive means — Suisui's Ceaseless Landscape paying the resonator
 *  who spends Havoc Bane, not whoever happens to be watching. Same `ctx.slot` caveat as
 *  `appliedByMe()`: inside `updateGlobal` that is the asking gear's own holder rather than the
 *  actor, so a team-wide watcher there wants `consumedByMember()` against `currentTeam().slot`. */
export function consumedByMe(gear: Gear): number {
  return consumedByMember(gear, ctx.slot!);
}

/** The same question about a *specific* member rather than whoever is current. */
export function consumedByMember(gear: Gear, member: TeamMember): number {
  return ctx.consumedBy.get(gear)?.get(member.name) ?? 0;
}

/** How many stacks of *anything* were consumed on this action, across every Gear and member — for
 *  a passive whose text names no particular status ("when they consume Negative Status or Electro
 *  Rage stacks", Suisui's Undulating Mist). Every `consume()` call site is a Negative Status being
 *  spent, so the total needs no filtering; a caller wanting one specific status asks `consumed()`
 *  instead. */
export function consumedAny(): number {
  let total = 0;
  for (const n of ctx.consumedNow.values()) total += n;
  return total;
}

/** This buff's own stack count — frozen at the start of the phase (see `capture()`), not a live
 *  re-read. A buff that revokes itself in `updateBuffs()` still reports its true held count to its own
 *  `applyStats()` this same action, matching the old engine's `apply(ctx, stacks)` — `stacks` was a
 *  parameter bound once, never re-read mid-action either.
 *
 *  Carried alongside `ctx.buff` rather than looked up in a frozen Map: the engine walks the
 *  held roster one gear at a time and already knows each one's frozen count as it goes, so handing
 *  that count over directly removes the only reason that Map had to exist. -1 means "no phase is
 *  running" — a display() called outside one falls back to the live count. */
export function frozenStacks(): number {
  return ctx.stacks >= 0 ? ctx.stacks : ctx.slot!.stacksOf(ctx.buff!);
}

/** Shared write path for addStat()/addEnemyStat() — pushes the trace entry and bumps the running
 *  total, keyed off whatever string the caller already resolved (plain or scoped). Source (which
 *  Gear) and owner (whose *kit* granted it — `State.sourceOf`, not whoever's turn it happens to
 *  be) are read off the "current" pointers, not passed in — every call site stays exactly as
 *  terse as before, but the report can still trace every value back to what granted it and colour
 *  it by that kit. Falls back to whoever's actually acting only if this Gear was somehow never
 *  attributed (shouldn't happen — every grant path calls `attribute()`). */
function pushStat(stat: Stat | EnemyStat, tag: Tag | undefined, value: number): void {
  const slot = ctx.slot!;

  // The formula-facing total: an unscoped contribution always counts, a scoped one only when its
  // own tag is the action's in that band — `ctx.tagWord` masked to the tag's six bits is the
  // tag itself. Folding that test in here is what lets `get()` and the snapshot's own `stat()`
  // be a single read rather than a re-sum over every scope.
  if (tag === undefined || (ctx.tagWord & tagBand(tag)) === tag) {
    slot.effective[stat] = slot.effective[stat]! + value;
    // ...and again into the Negative-Status-scoped subtotal, if that's what this is (see
    // TYPE2_AMP_INDEX). Only reached by an amplification that carried a scope at all, so it
    // costs nothing on the ordinary path.
    if (stat === Stat.Amp && tag !== undefined && (tag & TYPE2_BITS) !== 0) {
      slot.effective[TYPE2_AMP_INDEX] = slot.effective[TYPE2_AMP_INDEX]! + value;
    }
    // ...and the Basic-scoped part of DMG Bonus into its own (see BASIC_DMG_BONUS_INDEX)
    if (stat === Stat.DmgBonus && tag === Type1.Basic) {
      slot.effective[BASIC_DMG_BONUS_INDEX] = slot.effective[BASIC_DMG_BONUS_INDEX]! + value;
    }
  }

  if (!ctx.tracing) return;

  // Trace-only from here (see `ctx.tracing`): the scoped running total and the per-entry record the
  // report's own hover panels read. `toString()`, not `.name` directly — a maxStacks > 1 Gear
  // reads "Name xN" (see Gear's own toString()), so those panels show the stack count behind
  // every value.
  const key = tag === undefined ? stat : scopedStat(tag, stat);
  slot.entries.push({
    stat: key, value,
    source: ctx.buff?.toString() ?? "",
    owner: (ctx.buff && ctx.state!.sourceOf.get(ctx.buff)) ?? slot.name ?? null,
  });
  slot.totals.set(key, (slot.totals.get(key) ?? 0) + value);
}

/** Contribute a personal stat — optionally scoped (`addStat(Stat.DmgBonus, 12, Attribute.Havoc)`).
 *  For the attacker's own line only; a debuff that changes the *enemy's* own stat (Res Reduce,
 *  Def Reduce) is `addEnemyStat()` instead, below. */
export function addStat(stat: Stat, value: number, tag?: Tag): void {
  pushStat(stat, tag, value);
}

/** Contribute to an `EnemyStat` — a real debuff on the target (Res Reduce, Def Reduce) that every
 *  attacker reads identically, not a personal modifier. Its own function (not `addStat`) so a kit
 *  can't reach for `Stat.ResIgnore`-style attacker-side stats when it actually means a target-side
 *  one, or vice versa — same split as the two enums themselves (see `EnemyStat` in stats.ts). Still
 *  folds into the acting resonator's own running totals underneath, same as any other enemy
 *  debuff (`State.enemyStacks`'s own gear runs through this same acting slot every action, so
 *  every attacker ends up reading the identical number). */
export function addEnemyStat(stat: EnemyStat, value: number, tag?: Tag): void {
  pushStat(stat, tag, value);
}

/** Every value the three tag enums hold, for `menuStats()`'s own zipped passes below. */
const ALL_ATTRIBUTES: Attribute[] = [
  Attribute.Aero, Attribute.Electro, Attribute.Fusion, Attribute.Glacio,
  Attribute.Spectro, Attribute.Havoc, Attribute.Physical,
];
const ALL_TYPE1: Type1[] = [
  Type1.Basic, Type1.Heavy, Type1.Skill, Type1.Liberation, Type1.Intro, Type1.Outro,
  Type1.Echo, Type1.Status, Type1.Break, Type1.Rupture, Type1.Hack, Type1.Utility,
];
const ALL_TYPE2: Type2[] = [
  Type2.Coordinated, Type2.SpectroFrazzle, Type2.AeroErosion,
  Type2.FusionBurst, Type2.GlacioChafe, Type2.ElectroFlare,
];

/**
 * A loadout's own equipped gear, read cold — no action ever cast, just every `constantStats()`
 * call each piece makes. Drives the ordinary `addStat()`/`pushStat()` path exactly as a real
 * action would, unmodified: since there is no acting action here, a scoped call (a mainslot's
 * own attribute+type dmg bonus, a sonata 2pc's) is replayed once per Attribute/Type1/Type2 value
 * so it lands on whichever pass actually matches its own tag — the three bands are independent,
 * so one pass tests one attribute and one Type1 and one Type2 candidate at once, `ALL_TYPE1`'s
 * own length many passes covering the lot. An unscoped call (`tag === undefined`) matches every
 * pass regardless, so it is deduped back down to the one entry it actually is afterward. For the
 * loadout hover's own "menu stats" section (index.ts).
 */
export function menuStats(gear: Gear[]): StatEntry[] {
  const slot = new TeamMember("");
  const state = new State([]);
  // the ambient pointers this cold run borrows, put back with an Object.assign below —
  // `menuStats` is called mid-render, and a real fight may be part-way through one
  const saved = { slot: ctx.slot, state: ctx.state, buff: ctx.buff, stacks: ctx.stacks, tagWord: ctx.tagWord, tracing: ctx.tracing };
  ctx.slot = slot;
  ctx.state = state;
  ctx.stacks = 1;
  ctx.tracing = true;
  const passes = ALL_TYPE1.length;
  for (const g of gear) {
    if (!g.constantStatsFn) continue;
    ctx.buff = g;
    for (let i = 0; i < passes; i++) {
      ctx.tagWord = (ALL_ATTRIBUTES[i] ?? 0) | ALL_TYPE1[i]! | (ALL_TYPE2[i] ?? 0);
      g.constantStatsFn();
    }
  }
  Object.assign(ctx, saved);

  // Collapse the duplicate pushes an unscoped call made on every pass back down to one — a scoped
  // call only ever matched a single pass to begin with, so this is a no-op for those.
  const seen = new Set<string>();
  return slot.entries.filter((e) => {
    const key = `${e.source} ${e.stat}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Running total for the action being evaluated, including any scoped variant matching it — one
 *  lookup, since `pushStat()` already folded every matching scope in as it was written. */
export function getStat(stat: Stat): number {
  return ctx.slot!.effective[stat]!;
}
export function pct(stat: Stat): number { return getStat(stat) / 100; }
/** The Basic Attack DMG Bonus alone — every `addStat(Stat.DmgBonus, n, Type1.Basic)` this action
 *  counted, and nothing plain or element-scoped. The one scoped subtotal kept outside tracing
 *  (see state.ts's own BASIC_DMG_BONUS_INDEX); 0 on an action the scope didn't match. */
export function basicDmgBonus(): number { return ctx.slot!.effective[BASIC_DMG_BONUS_INDEX]!; }

// local — the acting resonator's own held Gear. Read-only, so these still take any Gear
// (checking whether a Mainslot/Resonator is equipped is legitimate); only the stack-modifying
// functions below are Buff-only — a Resonator/Mainslot/weapon's own "equipped" identity is
// established once, by equip(), and never granted/revoked again mid-fight.
export function stacksOf(gear: Gear): number { return ctx.slot!.stacksOf(gear); }
export function isHeld(gear: Gear): boolean { return ctx.slot!.isHeld(gear); }
export function maxEnergy(): number { return ctx.slot!.resonator?.maxEnergy ?? 0; }

/** The acting resonator's own forte gauges, 1-5 — plain numbers, not a Buff's stack count
 *  (Jingran's Qi is `forte1()`, his Mingfire is `forte2()`). No floor, no ceiling — a kit's own
 *  declared `forte1`/`forte2` deltas on an action can be negative when consumed, and this can run
 *  negative too (a kit clamps its own gauge's real bounds itself, if it ever needs to, by calling
 *  `setForteN` directly rather than relying on this to do it). One tiny factory rather than five
 *  hand-written copies of the same three lines. */
function forteGauge(i: 0 | 1 | 2 | 3 | 4) {
  return {
    get: (): number => ctx.slot!.forte[i],
    set: (value: number): number => { noteMutation(-1 - i, value); return (ctx.slot!.forte[i] = value); },
    add: (delta: number): number => { noteMutation(-1 - i, delta); return (ctx.slot!.forte[i] = ctx.slot!.forte[i] + delta); },
  };
}
export const { get: forte1, set: setForte1, add: addForte1 } = forteGauge(0);
export const { get: forte2, set: setForte2, add: addForte2 } = forteGauge(1);
export const { get: forte3, set: setForte3, add: addForte3 } = forteGauge(2);
export const { get: forte4, set: setForte4, add: addForte4 } = forteGauge(3);
export const { get: forte5, set: setForte5, add: addForte5 } = forteGauge(4);

/** The target's own gauges, 1-5 — the same plain numbers as a member's forte, but on the enemy
 *  (`State.enemy`) rather than whoever is acting, for a debuff that keeps a clock of its own on
 *  the target (status.ts's Electro Flare and Aero Erosion: seconds to their next tick).
 *  Never banked by evaluate() — only a kit moves them. */
function enemyGauge(i: 0 | 1 | 2 | 3 | 4) {
  return {
    get: (): number => ctx.state!.enemy.forte[i],
    set: (value: number): number => { noteMutation(-6 - i, value); return (ctx.state!.enemy.forte[i] = value); },
    add: (delta: number): number => { noteMutation(-6 - i, delta); return (ctx.state!.enemy.forte[i] = ctx.state!.enemy.forte[i] + delta); },
  };
}
export const { get: enemyForte1, set: setEnemyForte1, add: addEnemyForte1 } = enemyGauge(0);
export const { get: enemyForte2, set: setEnemyForte2, add: addEnemyForte2 } = enemyGauge(1);

/** The acting resonator's own running Concerto Energy — same "a kit clamps its own gauge's real
 *  bounds itself, by calling this directly" shape as `setForteN` above (Camellya's own Ephemeral:
 *  "requires full Concerto, consumes 70" only makes sense against a clamped-to-100 starting
 *  point, not whatever this run happens to have overshot to). Read-only everywhere else — a kit
 *  still never *adds* to this directly, same as forte; evaluate() alone banks `action.concerto`/
 *  `AddConcerto` into it every action. */
export function concerto(): number { return ctx.slot!.concerto; }
export function setConcerto(value: number): number {
  noteMutation(-10, value);
  return (ctx.slot!.concerto = value);
}

/** Record whose kit this Gear came from (see `State.sourceOf`). Called by every grant, so a buff
 *  is attributed the moment it lands rather than guessed at from its name later.
 *
 *  Whatever is granting right now is `ctx.buff` — the Gear whose own updateBuffs() is mid-run — so
 *  a buff a buff puts up inherits that buff's source. Outside any Gear's update (which is only
 *  ever `equip()` during team setup) there's nothing to inherit from, so it's sourced to the
 *  member being equipped. */
function attribute(gear: Gear): void {
  const inherited = ctx.buff ? ctx.state!.sourceOf.get(ctx.buff) : undefined;
  ctx.state!.sourceOf.set(gear, inherited ?? ctx.slot!.name);
}

export function applyCurrent(buff: Buff, n = 1): number {
  attribute(buff);
  return ctx.slot!.addStack(buff, n);
}

/** Grant during team setup, not mid-fight — same as `applySelf` but also fires this Gear's own
 *  `combatStart()` exactly once, and (unlike every stack-modifying function below) takes any
 *  Gear, not just a Buff — this is the one place a Resonator/Mainslot/weapon's own "equipped"
 *  status is ever granted. Use this (not `applySelf`) for a resonator's own kit/talents, weapon,
 *  echoes, and mainstat/substat rolls when first assembling a team. */
export function equip(gear: Gear, n = 1): number {
  attribute(gear);
  const result = ctx.slot!.addStack(gear, n);
  ctx.slot!.equipped.add(gear);
  if (gear instanceof Mainslot) ctx.slot!.mainslot = gear;
  // as `ctx.buff` for the call, same as every other hook: what combatStart() grants inherits
  // this gear's own source, and maxStackIncrease() can name it
  const prevBuff = ctx.buff;
  ctx.buff = gear;
  try { gear.combatStartFn?.(); } finally { ctx.buff = prevBuff; }
  return result;
}

/** `equip()` onto the enemy (`State.enemy`) rather than the acting slot — for the Tune Break
 *  resonator and its gear at team setup (solver.ts, as it builds a team). */
export function equipEnemy(gear: Gear, n = 1): number {
  const prev = ctx.slot;
  ctx.slot = ctx.state!.enemy;
  try { return equip(gear, n); } finally { ctx.slot = prev; }
}

export function setStacksSelf(buff: Buff, n: number): number {
  attribute(buff);
  return ctx.slot!.setStacks(buff, n);
}
export function removeStack(buff: Buff, n = 1): number { return ctx.slot!.removeStack(buff, n); }
export function revokeCurrent(buff: Buff): void { ctx.slot!.revoke(buff); }

/** The Gear whose hook is running right now. Exported for the kit-authoring shortcuts in
 *  shared/helpers.ts (`lostOnSwap()`), which are ordinary callers of this API rather than part of
 *  the engine; nothing inside a kit needs it, since a hook already knows which gear it belongs to. */
export function currentGear(): Gear { return ctx.buff!; }

// team-wide — one shared copy, ticks on every slot's own turn regardless of who's acting
export function stacksOfTeam(gear: Gear): number { return ctx.state!.stacksOfGlobal(gear); }
export function applyTeam(buff: Buff, n = 1): number {
  attribute(buff);
  return ctx.state!.addStackGlobal(buff, n);
}
export function removeStackTeam(buff: Buff, n = 1): number { return ctx.state!.removeStackGlobal(buff, n); }
export function revokeTeam(buff: Buff): void { ctx.state!.revokeGlobal(buff); }

// placed on the enemy rather than any resonator — same "ticks on every slot's own turn" shape as
// the Team functions above, kept as its own pool so the report can tell the two apart (see
// State.enemyStacks)
export function stacksOfEnemy(gear: Gear): number { return ctx.state!.stacksOfEnemy(gear); }
export function applyEnemy(debuff: Debuff, n = 1): number {
  attribute(debuff);
  return ctx.state!.addStackEnemy(debuff, n);
}
export function removeStackEnemy(debuff: Debuff, n = 1): number { return ctx.state!.removeStackEnemy(debuff, n); }
/** Spend stacks off the target *and say so*: `removeStackEnemy()` plus the record `consumed()` /
 *  `consumedByMe()` read (see `ctx.consumedNow`). Any kit whose text is "consumes N stacks of X" should
 *  reach for this rather than the plain remove, so a teammate's "when you consume" passive can see
 *  it — nothing else in the engine ever notices a stack leaving the target.
 *
 *  Logs what actually left, not what was asked for: spending ten off a target holding four records
 *  four. Returns the target's new count, same as `removeStackEnemy()`. */
export function consume(debuff: Debuff, n = 1): number {
  const before = ctx.state!.stacksOfEnemy(debuff);
  const after = ctx.state!.removeStackEnemy(debuff, n);
  if (!ctx.dryRun) recordConsumed(debuff, before - after);
  return after;
}
export function revokeEnemy(debuff: Debuff): void { ctx.state!.revokeEnemy(debuff); }
/** Raise an enemy debuff's cap for the rest of the fight: its effective max becomes its own
 *  declared maxStacks plus every increase granted. Works before the debuff is ever applied, so a
 *  kit can call it from combatStart(). Deduplicated by whichever Gear is running — one gear only
 *  ever raises a given debuff's cap once, so an "on hit, not stackable" raise can just be called
 *  on every hit (see `State.enemyMaxSources`). */
export function maxStackIncrease(debuff: Debuff, n = 1): void {
  ctx.state!.increaseMaxEnemy(debuff, n, ctx.buff?.name ?? ctx.slot!.name);
}

/** Grant/spend a Buff on one specific resonator's own local frozenStacks, regardless of whose turn it
 *  is — for a kit that reacts to the whole team but pays out onto one specific member (Jingran's
 *  Trace the Vestige, feeding his own Ghost Shroud off anyone's shield). Resolved via
 *  `State.memberOf()`, so it throws rather than silently no-opping if that resonator isn't
 *  actually on this team. */
export function addBuff(resonator: Resonator, buff: Buff, n = 1): number {
  attribute(buff);
  return ctx.state!.memberOf(resonator).addStack(buff, n);
}
export function removeBuff(resonator: Resonator, buff: Buff, n = 1): number {
  return ctx.state!.memberOf(resonator).removeStack(buff, n);
}
export function revokeBuff(resonator: Resonator, buff: Buff): void {
  ctx.state!.memberOf(resonator).revoke(buff);
}

/** Grant to every slot except the one currently acting. */
export function applyOthers(buff: Buff, n = 1): void {
  attribute(buff);
  for (const s of ctx.state!.slots) if (s !== ctx.slot) s.addStack(buff, n);
}

/** Publish a Buff for whoever intros next — adopted automatically the moment an Intro-cast
 *  action is evaluated, before that action's own updateBuffs()/applyStats()/convertStats() run. */
export function queueOutro(buff: Buff): void {
  // attributed here, at the outro that publishes it — not when the next resonator adopts it,
  // which would credit the buff to whoever received it rather than whoever handed it over
  noteMutation(buff.id, 3e6);
  if (ctx.dryRun) return;
  attribute(buff);
  ctx.state!.outroQueue.push(buff);
}

/** Captures which slot queued it — `ctx.slot`, not `state.active`: they're the same slot in
 *  every ordinary updateBuffs()/applyStats()/convertStats() call, but they can genuinely differ inside
 *  updateGlobal() (a locally-held gear reacting to a teammate's own turn runs with `ctx.slot`
 *  switched to *its own* holder, not whoever's actually acting — see evaluate()'s own updateGlobal
 *  phase). Pinning to `ctx.slot` is what lets a follow-up like this still land on its own
 *  caller's slot when queued that way (Phrolova's Maestro drawing a Hecate note off a teammate's
 *  own Echo Skill cast, say) instead of misfiring on whoever triggered it. Also covers the
 *  original reason this was pinned at all: an Outro right after can advance `state.active` before
 *  this runs, so without pinning to *some* fixed slot, a follow-up would misfire on whoever's turn
 *  it happens to be by then (matches the old engine's `ctx.queue()`). */
/** Whichever Gear's hook is running right now, as the same `{ name, source }` pair a held buff
 *  reports itself with — what a follow-up queued from it names as having triggered it
 *  (`ResolvedSnapshot.triggeredBy`). `ctx.buff` is every kind of Gear at once here, which is
 *  exactly the point: the acting Action is one too, so a hit a cast spawns names that cast, a hit a
 *  buff spawns names the buff, and one a weapon or sonata spawns names the piece.
 *
 *  `.name`, not `toString()`: a stacking buff's "x3" is a fact about this instant, not about what
 *  did the triggering. `source` is whose kit it belongs to — `sourceOf` for anything that was
 *  granted, and otherwise the slot it ran on, which is what a plain cast or an equipped piece is
 *  “from”. Same value `HeldBuff.source` carries, so the report colours it the same way. */
const queuedBy = (): HeldBuff | null => {
  const gear = ctx.buff;
  if (!gear?.name) return null;
  return { name: gear.name, source: ctx.state!.sourceOf.get(gear) ?? ctx.slot!.name };
};
export function queue(action: Action): void {
  noteMutation(action.id, 4e6);
  if (ctx.dryRun) return;
  pendingQueue.push({ action, slot: ctx.state!.slots.indexOf(ctx.slot!), by: queuedBy(), event: false });
}

/** Queue an action behind the *next Intro anyone casts* rather than behind this action — for a
 *  cast that outlives its own caster's visit (a transform echo pressed just before swapping out
 *  finishes on the incoming resonator's time). Pinned to the queuing slot the same way `queue()`
 *  is, so it lands on its own owner however far the field has moved on by then. */
export function queueOnIntro(action: Action): void {
  noteMutation(action.id, 7e6);
  if (ctx.dryRun) return;
  ctx.state!.introQueue.push({ action, slot: ctx.state!.slots.indexOf(ctx.slot!), by: queuedBy(), event: false });
}

/** Queue an action that belongs to nobody — the two ways an engine-level event differs from a
 *  resonator's own follow-up, which is all the Tune Break needs to be one (tunebreak.ts):
 *
 *  - *behind* everything this action already queued, because a break resolves the press it went
 *    off on rather than interrupting it: every follow-up that press spawned lands first, banking
 *    its own off-tune onto the still-full bar, and the break drops the overshoot when it comes;
 *  - *unpinned* (slot -1, exactly like a rotation entry), so it runs on whoever is on field when it
 *    resolves rather than on whoever queued it. That's the difference on a break that goes off on
 *    an Outro: the handoff has landed by then, and the break is the incoming resonator's to eat. */
export function queueEvent(action: Action): void {
  noteMutation(action.id, 5e6);
  if (ctx.dryRun) return;
  pendingQueue.push({ action, slot: -1, by: queuedBy(), event: true });
}

/** Same as `queue()`, but attributed to one specific resonator's own slot regardless of whose
 *  turn it actually is or who's reacting — for a kit reacting through `updateGlobal()` (so
 *  `ctx.slot` is its own holder, not the real actor) that still wants the follow-up to land on
 *  whoever it's actually for. Resolved via `State.memberOf()`, same "throws rather than silently
 *  no-opping" contract as `addBuff()`. */
export function queueOn(resonator: Resonator, action: Action): void {
  noteMutation(action.id, 6e6);
  if (ctx.dryRun) return;
  pendingQueue.push({ action, slot: ctx.state!.slots.indexOf(ctx.state!.memberOf(resonator)), by: queuedBy(), event: false });
}

/** Run `fn` (a resonator's initial grants, before any rotation has evaluated) with the "current"
 *  pointers aimed at `state`'s active slot. Save/restore, so nested use can't corrupt an outer
 *  in-flight call. */
export function withTeam(state: State, fn: () => void): void {
  const prevState = ctx.state, prevSlot = ctx.slot, prevBuff = ctx.buff, prevAction = ctx.act;
  ctx.state = state;
  ctx.slot = state.slot;
  try { fn(); } finally {
    ctx.state = prevState; ctx.slot = prevSlot; ctx.buff = prevBuff; ctx.act = prevAction;
  }
}
