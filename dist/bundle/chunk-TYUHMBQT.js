// dist/src/engine/runtime.js
var ctx = {
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
  appliedNow: /* @__PURE__ */ new Map(),
  appliedBy: /* @__PURE__ */ new Map(),
  consumedNow: /* @__PURE__ */ new Map(),
  consumedBy: /* @__PURE__ */ new Map(),
  tracing: false,
  insideGroup: false
};
var tagWord = (element, type, type2) => (element ?? 0) | (type ?? 0) | (type2 ?? 0);
var tagWordOf = (action) => {
  let word = action._tagWord;
  if (word === void 0)
    action._tagWord = word = tagWord(action.element, action.type, action.type2);
  return word;
};
var dryLog = [];
function undoDry() {
  for (let i = dryLog.length - 3; i >= 0; i -= 3) {
    const target = dryLog[i], gear = dryLog[i + 1], prev = dryLog[i + 2];
    if (target instanceof Map) {
      if (prev === void 0)
        target.delete(gear);
      else
        target.set(gear, prev);
    } else if (prev)
      target.add(gear);
    else
      target.delete(gear);
  }
  dryLog.length = 0;
}
var noteMutation = (id, n) => {
  ctx.mutHash = Math.imul(ctx.mutHash ^ id, 2654435761) + n | 0;
};
var RESOURCE_STATS = [
  25,
  26,
  27,
  28,
  13,
  14,
  29,
  30,
  31,
  32,
  33
];
var recordApplied = (gear, n) => {
  if (n <= 0)
    return;
  ctx.appliedNow.set(gear, (ctx.appliedNow.get(gear) ?? 0) + n);
  const source = ctx.state.sourceOf.get(gear);
  if (source === void 0)
    return;
  let per = ctx.appliedBy.get(gear);
  if (per === void 0)
    ctx.appliedBy.set(gear, per = /* @__PURE__ */ new Map());
  per.set(source, (per.get(source) ?? 0) + n);
};
var recordConsumed = (gear, n) => {
  if (n <= 0)
    return;
  ctx.consumedNow.set(gear, (ctx.consumedNow.get(gear) ?? 0) + n);
  const by = ctx.slot.name;
  let per = ctx.consumedBy.get(gear);
  if (per === void 0)
    ctx.consumedBy.set(gear, per = /* @__PURE__ */ new Map());
  per.set(by, (per.get(by) ?? 0) + n);
};
var pendingQueue = [];

// dist/src/engine/stats.js
var STAT_COUNT = 35 + 1;
var STAT_NAME = {
  [
    0
    /* Stat.BaseAtk */
  ]: "Base ATK",
  [
    1
    /* Stat.BaseHp */
  ]: "Base HP",
  [
    2
    /* Stat.BaseDef */
  ]: "Base DEF",
  [
    3
    /* Stat.FlatAtk */
  ]: "Flat ATK",
  [
    4
    /* Stat.FlatHp */
  ]: "Flat HP",
  [
    5
    /* Stat.FlatDef */
  ]: "Flat DEF",
  [
    6
    /* Stat.BonusAtk */
  ]: "ATK%",
  [
    7
    /* Stat.BonusHp */
  ]: "HP%",
  [
    8
    /* Stat.BonusDef */
  ]: "DEF%",
  [
    9
    /* Stat.CritRate */
  ]: "Crit Rate",
  [
    10
    /* Stat.CritDmg */
  ]: "Crit Dmg",
  [
    11
    /* Stat.Er */
  ]: "Energy Regen",
  [
    12
    /* Stat.Tbb */
  ]: "Tune Break Boost",
  [
    13
    /* Stat.OfftuneBuildup */
  ]: "Buildup",
  [
    14
    /* Stat.EnergyRegenMult */
  ]: "Energy Regen Multiplier",
  [
    15
    /* Stat.AddMv */
  ]: "MV increase",
  [
    16
    /* Stat.MulMv */
  ]: "MV multiplier",
  [
    17
    /* Stat.DmgBonus */
  ]: "Dmg Bonus",
  [
    18
    /* Stat.Amp */
  ]: "Amplification",
  [
    19
    /* Stat.TotalDmg */
  ]: "Total Damage",
  [
    20
    /* Stat.ResIgnore */
  ]: "Res Ignore",
  [
    21
    /* Stat.DefIgnoreNew */
  ]: "Def Ignore (new)",
  [
    22
    /* Stat.DefIgnoreOld */
  ]: "Def Ignore (old)",
  [
    23
    /* Stat.HealingBonus */
  ]: "Healing Bonus",
  [
    24
    /* Stat.HealingTaken */
  ]: "Healing Recieved",
  [
    25
    /* Stat.AddEnergy */
  ]: "Energy",
  [
    26
    /* Stat.AddConcerto */
  ]: "Concerto",
  [
    27
    /* Stat.AddOfftune */
  ]: "Offtune",
  [
    28
    /* Stat.DirectOfftune */
  ]: "DirectOfftune",
  [
    29
    /* Stat.AddForte1 */
  ]: "Forte1",
  [
    30
    /* Stat.AddForte2 */
  ]: "Forte2",
  [
    31
    /* Stat.AddForte3 */
  ]: "Forte3",
  [
    32
    /* Stat.AddForte4 */
  ]: "Forte4",
  [
    33
    /* Stat.AddForte5 */
  ]: "Forte5",
  [
    34
    /* EnemyStat.ResReduce */
  ]: "Res Reduce",
  [
    35
    /* EnemyStat.DefReduce */
  ]: "Def Reduce"
};
var STAT_BITS = 63;
var ATTRIBUTE_BITS = 63 << 6;
var TYPE1_BITS = 63 << 12;
var TYPE2_BITS = 63 << 18;
var TAG_BITS = ATTRIBUTE_BITS | TYPE1_BITS | TYPE2_BITS;
if (STAT_COUNT > STAT_BITS + 1)
  throw new Error("stats.ts: more stats than fit in the six-bit stat field");
var tagBand = (tag) => tag & TYPE2_BITS ? TYPE2_BITS : tag & TYPE1_BITS ? TYPE1_BITS : ATTRIBUTE_BITS;
var tagKind = (tag) => tag & TYPE2_BITS ? 3 : tag & TYPE1_BITS ? 2 : 1;
var TAG_NAME = {
  [
    64
    /* Attribute.Aero */
  ]: "Aero",
  [
    128
    /* Attribute.Electro */
  ]: "Electro",
  [
    192
    /* Attribute.Fusion */
  ]: "Fusion",
  [
    256
    /* Attribute.Glacio */
  ]: "Glacio",
  [
    320
    /* Attribute.Spectro */
  ]: "Spectro",
  [
    384
    /* Attribute.Havoc */
  ]: "Havoc",
  [
    448
    /* Attribute.Physical */
  ]: "Physical",
  [
    4096
    /* Type1.Basic */
  ]: "Basic",
  [
    8192
    /* Type1.Heavy */
  ]: "Heavy",
  [
    12288
    /* Type1.Skill */
  ]: "Skill",
  [
    16384
    /* Type1.Liberation */
  ]: "Liberation",
  [
    20480
    /* Type1.Intro */
  ]: "Intro",
  [
    24576
    /* Type1.Outro */
  ]: "Outro",
  [
    28672
    /* Type1.Echo */
  ]: "Echo",
  [
    32768
    /* Type1.Status */
  ]: "Status",
  [
    36864
    /* Type1.Break */
  ]: "Tune Break",
  [
    40960
    /* Type1.Rupture */
  ]: "Tune Rupture",
  [
    49152
    /* Type1.Hack */
  ]: "Tune Hack",
  [
    53248
    /* Type1.Utility */
  ]: "Utility",
  [
    262144
    /* Type2.Coordinated */
  ]: "Coordinated",
  [
    524288
    /* Type2.SpectroFrazzle */
  ]: "Spectro Frazzle",
  [
    786432
    /* Type2.AeroErosion */
  ]: "Aero Erosion",
  [
    1048576
    /* Type2.FusionBurst */
  ]: "Fusion Burst",
  [
    1310720
    /* Type2.GlacioChafe */
  ]: "Glacio Chafe",
  [
    1572864
    /* Type2.ElectroFlare */
  ]: "Electro Flare"
};
var scopedStat = (tag, stat) => stat | tag;
var splitStat = (key) => [key & STAT_BITS, key & TAG_BITS || null];
var CAST_NAME = {
  [
    0
    /* Cast.DodgeCounter */
  ]: "Dodge Counter",
  [
    1
    /* Cast.Basic */
  ]: "Basic",
  [
    2
    /* Cast.MidAir */
  ]: "Mid-air",
  [
    3
    /* Cast.Heavy */
  ]: "Heavy",
  [
    4
    /* Cast.Skill */
  ]: "Skill",
  [
    5
    /* Cast.Liberation */
  ]: "Liberation",
  [
    6
    /* Cast.Intro */
  ]: "Intro",
  [
    7
    /* Cast.Outro */
  ]: "Outro",
  [
    8
    /* Cast.Echo */
  ]: "Echo",
  [
    9
    /* Cast.TuneBreak */
  ]: "Tune Break"
};
var NODE_NAME = {
  [
    0
    /* Node.Normal */
  ]: "Normal",
  [
    1
    /* Node.Skill */
  ]: "Skill",
  [
    2
    /* Node.Forte */
  ]: "Forte",
  [
    3
    /* Node.Liberation */
  ]: "Liberation",
  [
    4
    /* Node.Intro */
  ]: "Intro"
};
var SCALING_NAME = {
  [
    0
    /* Scaling.Atk */
  ]: "ATK",
  [
    1
    /* Scaling.Hp */
  ]: "HP",
  [
    2
    /* Scaling.Def */
  ]: "DEF",
  [
    3
    /* Scaling.Dot */
  ]: "DOT",
  [
    4
    /* Scaling.Tune */
  ]: "TUNE",
  [
    5
    /* Scaling.Fixed */
  ]: "FIXED"
};
var PERCENT_STATS = /* @__PURE__ */ new Set([
  6,
  7,
  8,
  9,
  10,
  11,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  34,
  35
]);
var isPercent = (key) => PERCENT_STATS.has(splitStat(key)[0]);
function statLabel(key) {
  const [stat, tag] = splitStat(key);
  return tag === null ? STAT_NAME[stat] : `${TAG_NAME[tag]} ${STAT_NAME[stat]}`;
}
var RESOURCE_NAME = {
  [
    0
    /* Resource.Offtune */
  ]: "offtune",
  [
    1
    /* Resource.Energy */
  ]: "energy",
  [
    2
    /* Resource.Concerto */
  ]: "concerto",
  [
    3
    /* Resource.Forte1 */
  ]: "forte1",
  [
    4
    /* Resource.Forte2 */
  ]: "forte2",
  [
    5
    /* Resource.Forte3 */
  ]: "forte3",
  [
    6
    /* Resource.Forte4 */
  ]: "forte4",
  [
    7
    /* Resource.Forte5 */
  ]: "forte5"
};

// dist/src/engine/state.js
var EMPTY_HELD = [];
var EMPTY_FORTE = [0, 0, 0, 0, 0];
var EMPTY_FIELDS = [];
var capEnergy = (member2, value) => Math.min(member2.resonator?.maxEnergy ?? 0, Math.max(0, value));
var TYPE2_AMP_INDEX = STAT_COUNT;
var BASIC_DMG_BONUS_INDEX = STAT_COUNT + 1;
var ZERO_STATS = new Array(STAT_COUNT + 2).fill(0);
ZERO_STATS[0] = 0.5;
ZERO_STATS[0] = 0;
var Pool = class {
  /** Every Gear granted here, in the order it was first granted — a Map's own order, so hooks run
   *  in the same sequence they always did. A dropped Gear *stays in place*: the phase lists stop
   *  naming its position and `at` forgets it, so nothing reaches it, and its slot is reclaimed by
   *  `compact()` once the dead outnumber the live. Positions therefore never shift on a drop,
   *  which is what keeps a drop down to filtering the one or two phase lists the Gear was in. A
   *  Gear dropped and re-granted goes to the end, as it would in a Map. */
  list = [];
  /** The stack count of `list[i]`. */
  counts = [];
  /** For each phase (`PHASE_*`, in bit order), the positions in `list` of the live Gear that has
   *  that hook — so a phase visits the two or three it will actually call rather than probing all
   *  ~20 for a hook they mostly haven't got. */
  hooks = Array.from({ length: PHASE_COUNT }, () => []);
  /** The live Gear here with an `updateGlobalFn`, in order — what `evaluate()`'s updateGlobal
   *  phase walks for the team-wide and enemy pools. */
  globalHooks = [];
  /** Where each live Gear sits in `list`. Written in place — nothing iterates it — except while a
   *  `snapshot()` is live (`ctx.guarded`), where the first write swaps in a copy (`write()`) so
   *  `restore()` can put the original back untouched. */
  at = /* @__PURE__ */ new Map();
  atCloned = false;
  /** How many entries of `list` are dropped Gear. */
  dead = 0;
  has(gear) {
    return this.at.has(gear);
  }
  /** Everything a dry run can move, by reference — the arrays are never written in place, and
   *  `at` is cloned before a ctx.guarded write ever touches it — for `restore()` to hand back. */
  snapshotInto(s) {
    s.list = this.list;
    s.counts = this.counts;
    s.hooks = this.hooks;
    s.globalHooks = this.globalHooks;
    s.at = this.at;
    s.dead = this.dead;
  }
  restore(s) {
    this.list = s.list;
    this.counts = s.counts;
    this.hooks = s.hooks;
    this.globalHooks = s.globalHooks;
    this.at = s.at;
    this.dead = s.dead;
    this.atCloned = false;
  }
  /** Ahead of a write to `at`. Under a dry run the write is journaled for `undoDry()` to reverse;
   *  otherwise, while a snapshot is live, the first write swaps in a copy so the snapshot's own
   *  map stays as it was. */
  write(gear) {
    if (ctx.dryRun)
      dryLog.push(this.at, gear, this.at.get(gear));
    else if (ctx.guarded && !this.atCloned) {
      this.at = new Map(this.at);
      this.atCloned = true;
    }
  }
  get(gear) {
    const i = this.at.get(gear);
    return i === void 0 ? void 0 : this.counts[i];
  }
  /** Every live Gear, in order — for the report's popover; the phases read `hooks` instead. */
  gears() {
    return this.list.filter((g, i) => this.at.get(g) === i);
  }
  set(gear, n) {
    const i = this.at.get(gear);
    if (i !== void 0) {
      const counts2 = this.counts.slice();
      counts2[i] = n;
      this.counts = counts2;
      return;
    }
    const k = this.list.length;
    this.write(gear);
    this.at.set(gear, k);
    const list = this.list.slice(), counts = this.counts.slice();
    list.push(gear);
    counts.push(n);
    this.list = list;
    this.counts = counts;
    if (gear.hookMask) {
      const hooks = this.hooks.slice();
      for (let mask = gear.hookMask, p = 0; mask; mask >>= 1, p++) {
        if (!(mask & 1))
          continue;
        const phase = hooks[p].slice();
        phase.push(k);
        hooks[p] = phase;
      }
      this.hooks = hooks;
    }
    if (gear.updateGlobalFn)
      this.globalHooks = [...this.globalHooks, gear];
    if (gear.constantStatsFn)
      ctx.constVersion++;
  }
  delete(gear) {
    const i = this.at.get(gear);
    if (i === void 0)
      return;
    this.write(gear);
    this.at.delete(gear);
    if (gear.constantStatsFn)
      ctx.constVersion++;
    if (gear.hookMask) {
      const hooks = this.hooks.slice();
      for (let mask = gear.hookMask, p = 0; mask; mask >>= 1, p++)
        if (mask & 1)
          hooks[p] = hooks[p].filter((k) => k !== i);
      this.hooks = hooks;
    }
    if (gear.updateGlobalFn)
      this.globalHooks = this.globalHooks.filter((g) => g !== gear);
    if (++this.dead > 32)
      this.compact();
  }
  /** Squeeze the dropped entries out of `list`/`counts` and renumber everything after them. */
  compact() {
    const list = [], counts = [];
    const hooks = Array.from({ length: PHASE_COUNT }, () => []);
    for (let i = 0; i < this.list.length; i++) {
      const gear = this.list[i];
      if (this.at.get(gear) !== i)
        continue;
      const k = list.length;
      this.write(gear);
      this.at.set(gear, k);
      list.push(gear);
      counts.push(this.counts[i]);
      for (let mask = gear.hookMask, p = 0; mask; mask >>= 1, p++)
        if (mask & 1)
          hooks[p].push(k);
    }
    this.list = list;
    this.counts = counts;
    this.hooks = hooks;
    this.dead = 0;
  }
};
var TeamMember = class {
  name;
  /** Whichever Resonator is actually equipped here — set once, by Resonator's own combatStart,
   *  the moment it's equip()-ped. Attribute/energy/name all live on it, not duplicated here; null
   *  only in the brief window between constructing a State (from bare names) and equip()ping
   *  each member's own Resonator. */
  resonator = null;
  /** Whichever Mainslot echo is equipped here — cached by `equip()` rather than re-found by
   *  scanning this member's whole held set every time an ECHO_* marker comes up (see
   *  `run()`). Set once at team setup, like `resonator` above. */
  mainslot = null;
  /** Generic forte gauges — a resonator assigns its own meaning onto whichever fits its kit
   *  (Jingran's Qi is forte 1, his Mingfire is forte 2). Real numeric bars, not stacking Buffs:
   *  nothing here caps at a Buff's own maxStacks, and there's no revoke-at-0 — a kit clamps its
   *  own ceiling itself (see `setForte()`/`addForte()`). Five slots, matching stats.ts's own
   *  Resource.Forte1-5. */
  forte = [0, 0, 0, 0, 0];
  /** Running totals, banked automatically by evaluate() itself off however much AddEnergy/
   *  AddConcerto this action's own held Gear contributed (see `AddEnergy`/`AddConcerto` above) —
   *  no kit ever adds to these directly, the same way none adds to `forte` by calling addStat(). */
  energy = 0;
  concerto = 0;
  /** A second, parallel energy counter for the ER-requirement estimate (the detail page's own
   *  Energy Requirements table) — unlike `energy` above, it starts a fight already filled (set to
   *  `maxEnergy` by Resonator's own combatStart) and only resets on a `resetEnergy`-marked
   *  Liberation cast, not on every outro. Same gain (and the same maxEnergy ceiling) as `energy`,
   *  plus half of every *other* member's own gain (see `evaluate()`). */
  realEnergy = 0;
  stacks = new Pool();
  /** Exactly the gear in `stacks` that declares an `updateGlobalFn`, kept in lockstep by the four
   *  mutators below. `evaluate()` walks every slot's own global hooks on *every* action, and only
   *  about one gear in twenty-five has one — scanning `stacks` for them meant ~33 iterator steps
   *  per slot per action to reach one or two. Insertion order matches `stacks`' own (both are
   *  written in the same call, and neither a re-`set` nor a re-`add` moves an existing entry), so
   *  the hooks still run in the order they always did. */
  globalHooks = /* @__PURE__ */ new Set();
  /** Whatever was `equip()`-ped onto this member at team setup — their resonator and its talents,
   *  weapon, mainslot echo, sonata pieces, mainstat/substat rolls. Held in `stacks` like anything
   *  else (that's how their applyStats() runs), but it's gear, not a buff their kit put up, so the
   *  report's own "what's on this resonator" panel leaves it out (see `heldLocal` in evaluate()).
   *  `equip()` is the only thing that writes here, and it's the only way gear is ever granted. */
  equipped = /* @__PURE__ */ new Set();
  entries = [];
  /** Running sum per *scoped* stat key ("Dmg Bonus:Fusion" kept apart from "Dmg Bonus"), kept in
   *  lockstep with `entries` (same push site in `addStat()`, same reset in `evaluate()`). Only the
   *  report's own trace panels read this, so it's filled on the traced path only — `get()` and the
   *  damage formula both read `effective` below instead. */
  totals = /* @__PURE__ */ new Map();
  /** Running sum per stat with every scope *that matches the action being evaluated* already
   *  folded in — so `get(Stat.DmgBonus)` on a Fusion Basic Attack is one read, not a re-sum of
   *  "Dmg Bonus" + "Dmg Bonus:Fusion" + "Dmg Bonus:Basic" behind three freshly-built key strings.
   *  Written by `pushStat()`, which knows the tag before it's been concatenated into a key and can
   *  test it against the action's own tags directly. Indexed by `STAT_INDEX`, not keyed by the
   *  stat string. Replaced (not cleared) each action, so a snapshot can keep the one it was built
   *  with at zero copying cost. */
  effective = ZERO_STATS.slice();
  /** What every held Gear's `constantStats` adds up to for this slot, per action tag word (the
   *  scopes that match), in `effective`'s own shape — built the first time each tag word is seen
   *  and added into `effective` in one pass every action after (see `evaluate()`). Cleared when
   *  `ctx.constVersion` moves on. */
  constBase = /* @__PURE__ */ new Map();
  constBaseVersion = -1;
  /** Main-stat variants to score alongside this member's own build (solver.ts's own
   *  `scoreMainstats()`): the held main-stat Buff each stands in for, the alternatives, and per
   *  alternative the same per-tag-word constant base `constBase` keeps for the real one. Every
   *  action this member takes is then re-scored once per variant (see `evaluate()`) — nothing else
   *  in the fight changes, since a main stat only ever feeds its wearer. */
  variantOf = null;
  variants = [];
  variantBase = [];
  /** Set per variant when its dry re-run would have changed the fight — a mutation the real build
   *  didn't make, or a resource stat that banks differently — so its scores can't be trusted and
   *  the solver runs it for real instead. */
  variantUnsafe = [];
  constructor(name) {
    this.name = name;
  }
  stacksOf(gear) {
    return this.stacks.get(gear) ?? 0;
  }
  isHeld(gear) {
    return this.stacks.has(gear);
  }
  /* The four mutators below write the pool only when it actually ends up different — a Pool
   * write is a copy (see `Pool`), and a kit that re-grants a buff it already holds at full stacks
   * (`applySelf(BUFF, 1)` every action, the commonest shape there is) would otherwise copy the
   * counts for nothing on most actions. */
  addStack(gear, n = 1) {
    noteMutation(gear.id, n);
    if (!ctx.dryRun)
      recordApplied(gear, n);
    const next = Math.min(gear.maxStacks, this.stacksOf(gear) + n);
    if (this.stacks.get(gear) === next)
      return next;
    this.stacks.set(gear, next);
    if (gear.updateGlobalFn) {
      this.writeHooks(gear);
      this.globalHooks.add(gear);
    }
    return next;
  }
  removeStack(gear, n = 1) {
    noteMutation(gear.id, -n);
    const next = Math.max(0, this.stacksOf(gear) - n);
    if (next === 0) {
      if (!this.stacks.has(gear))
        return 0;
      this.stacks.delete(gear);
      this.writeHooks(gear);
      this.globalHooks.delete(gear);
      return 0;
    }
    if (this.stacks.get(gear) === next)
      return next;
    this.stacks.set(gear, next);
    return next;
  }
  setStacks(gear, n) {
    noteMutation(gear.id, 1e6 + n);
    if (!ctx.dryRun)
      recordApplied(gear, n - this.stacksOf(gear));
    const next = Math.max(0, Math.min(gear.maxStacks, n));
    if (next === 0) {
      if (!this.stacks.has(gear))
        return 0;
      this.stacks.delete(gear);
      this.writeHooks(gear);
      this.globalHooks.delete(gear);
      return 0;
    }
    if (this.stacks.get(gear) === next)
      return next;
    this.stacks.set(gear, next);
    if (gear.updateGlobalFn) {
      this.writeHooks(gear);
      this.globalHooks.add(gear);
    }
    return next;
  }
  revoke(gear) {
    noteMutation(gear.id, -1e6);
    if (!this.stacks.has(gear))
      return;
    this.stacks.delete(gear);
    this.writeHooks(gear);
    this.globalHooks.delete(gear);
  }
  /** `globalHooks` is written in place — except while a snapshot is live (`ctx.guarded`), where the
   *  first write swaps in a copy so `restore()` can hand the original back (see `Pool.write()`). */
  hooksCloned = false;
  writeHooks(gear) {
    if (ctx.dryRun)
      dryLog.push(this.globalHooks, gear, this.globalHooks.has(gear));
    else if (ctx.guarded && !this.hooksCloned) {
      this.globalHooks = new Set(this.globalHooks);
      this.hooksCloned = true;
    }
  }
  /** Everything of this member's a dry run can move (see `evaluate()`'s variants). */
  snapshotInto(s) {
    this.stacks.snapshotInto(s.pool);
    s.globalHooks = this.globalHooks;
    for (let i = 0; i < 5; i++)
      s.forte[i] = this.forte[i];
    s.concerto = this.concerto;
  }
  restore(s) {
    this.stacks.restore(s.pool);
    this.globalHooks = s.globalHooks;
    this.hooksCloned = false;
    for (let i = 0; i < 5; i++)
      this.forte[i] = s.forte[i];
    this.concerto = s.concerto;
  }
  total(stat) {
    return this.totals.get(stat) ?? 0;
  }
};
var State = class {
  slots;
  active = 0;
  /** Which way the next Outro hands the field over: +1 for the ordinary handoff to the next
   *  resonator in team order, -1 for the outro closing a DOUBLE_INTRO section (rotation.ts). The scheduler
   *  sets it right before the outro is evaluated and puts it back to +1 straight after, so a
   *  kit-queued outro — or any other path into `evaluate()` — always advances forward. */
  outroDir = 1;
  globalStacks = new Pool();
  // use Buff here? how are maxstacks even handled?
  /** Debuffs placed on the enemy rather than held by any resonator — mechanically identical to
   *  `globalStacks` (ticks on every slot's own turn regardless of who's acting), kept as its own
   *  map purely so the resonator popover can bucket it into its own "Enemy debuffs" section
   *  instead of mixing it into "Global buffs" — a real distinction to the report, not just
   *  formatting (see `buffsPopover` in index.ts). */
  /** The enemy itself, as a member of nobody's team: the dummy Tune Break resonator, its Base
   *  Resistance and the break's own machinery are `equipEnemy()`-ped onto it at setup, the way a
   *  real member's kit and gear are `equip()`-ped. Its pool *is* `enemyStacks` below, so what is
   *  equipped here runs in the enemy phase beside every debuff a kit inflicts. */
  enemy = new TeamMember("");
  // named by the enemy Resonator as it is equipped
  enemyStacks = this.enemy.stacks;
  // TODO change Gear to Debuff
  /** Raised caps for enemy debuffs, kept beside the stack counts: the effective max of any enemy
   *  debuff is its own declared maxStacks plus this entry. Independent of `enemyStacks`, so a cap
   *  can be raised before the debuff is ever applied (kits do it at combatStart). */
  enemyMaxIncrease = /* @__PURE__ */ new Map();
  // TODO change Gear to Debuff
  /** Which Gear has already paid an increase into `enemyMaxIncrease`, by name and per debuff.
   *  Every kit that raises a cap says the effect isn't stackable, but the trigger is usually
   *  "on hit" rather than once — so a source that has already raised this debuff's cap is
   *  ignored the second time, while a second kit raising the same cap still counts. */
  enemyMaxSources = /* @__PURE__ */ new Map();
  // TODO change Gear to Debuff
  outroQueue = [];
  /** Casts waiting for the next Intro — queued behind it, on the slot that queued them, the
   *  moment an Intro-cast action is evaluated (see `queueOnIntro()`). */
  introQueue = [];
  /** Off-tune buildup — the enemy's own bar, not any one member's, banked automatically by
   *  evaluate() off whichever held Gear contributed AddOfftune this action, same as
   *  TeamMember's own energy/concerto. */
  offtune = 0;
  /** Whose kit each piece of Gear ultimately came from, by member name.
   *
   *  Gear equipped at setup is sourced to whoever equipped it. Everything else inherits: a buff
   *  granted while another Gear's own updateBuffs() is running is that Gear's doing, so it carries
   *  that Gear's source rather than the name of whichever member happened to be on field when it
   *  landed. Shorekeeper's echo granting "Fallacy of No Return" onto Iuno stays sourced to
   *  Shorekeeper; Iuno's domain stacking Blessing onto Jingran stays sourced to Iuno.
   *
   *  Lives on the State, not the Gear: a Gear is a module-level singleton shared by every team,
   *  so writing to it would leak one team's attribution into another's. */
  sourceOf = /* @__PURE__ */ new Map();
  /** The three fight snapshots `evaluate()` takes around a varied action — before the stat phases,
   *  after them, and after banking — made once, the first time this team needs them. */
  snapshots = null;
  constructor(names) {
    this.slots = names.map((n) => new TeamMember(n));
  }
  get slot() {
    return this.slots[this.active];
  }
  slotByName(name) {
    return this.slots.find((s) => s.name === name);
  }
  /** Whichever TeamMember currently holds this Resonator — what addBuff()/removeBuff() resolve
   *  a resonator reference against. Throws rather than returning undefined: a kit reaching for
   *  another resonator by reference is asserting they're on this team, and a silent no-op on a
   *  typo'd or absent one would be a much worse bug to chase than a thrown error. */
  memberOf(resonator) {
    const member2 = this.slots.find((s) => s.resonator === resonator);
    if (!member2)
      throw new Error(`${resonator.name} is not on this team`);
    return member2;
  }
  stacksOfGlobal(gear) {
    return this.globalStacks.get(gear) ?? 0;
  }
  addStackGlobal(gear, n = 1) {
    noteMutation(gear.id, n);
    const next = Math.min(gear.maxStacks, this.stacksOfGlobal(gear) + n);
    if (!ctx.dryRun)
      recordApplied(gear, n);
    if (this.globalStacks.get(gear) === next)
      return next;
    this.globalStacks.set(gear, next);
    return next;
  }
  removeStackGlobal(gear, n = 1) {
    noteMutation(gear.id, -n);
    const next = Math.max(0, this.stacksOfGlobal(gear) - n);
    if (next === 0) {
      if (!this.globalStacks.has(gear))
        return 0;
      this.globalStacks.delete(gear);
      return 0;
    }
    if (this.globalStacks.get(gear) === next)
      return next;
    this.globalStacks.set(gear, next);
    return next;
  }
  setStacksGlobal(gear, n) {
    noteMutation(gear.id, 1e6 + n);
    const next = Math.max(0, Math.min(gear.maxStacks, n));
    if (!ctx.dryRun)
      recordApplied(gear, n - this.stacksOfGlobal(gear));
    if (next === 0) {
      if (!this.globalStacks.has(gear))
        return 0;
      this.globalStacks.delete(gear);
      return 0;
    }
    if (this.globalStacks.get(gear) === next)
      return next;
    this.globalStacks.set(gear, next);
    return next;
  }
  revokeGlobal(gear) {
    noteMutation(gear.id, -1e6);
    if (!this.globalStacks.has(gear))
      return;
    this.globalStacks.delete(gear);
  }
  stacksOfEnemy(gear) {
    return this.enemyStacks.get(gear) ?? 0;
  }
  enemyMax(gear) {
    return gear.maxStacks + (this.enemyMaxIncrease.get(gear) ?? 0);
  }
  increaseMaxEnemy(gear, n, source) {
    noteMutation(gear.id, 2e6 + n);
    if (ctx.dryRun)
      return;
    let sources = this.enemyMaxSources.get(gear);
    if (!sources)
      this.enemyMaxSources.set(gear, sources = /* @__PURE__ */ new Set());
    if (sources.has(source))
      return;
    sources.add(source);
    this.enemyMaxIncrease.set(gear, (this.enemyMaxIncrease.get(gear) ?? 0) + n);
  }
  addStackEnemy(gear, n = 1) {
    noteMutation(gear.id, n);
    const next = Math.min(this.enemyMax(gear), this.stacksOfEnemy(gear) + n);
    if (!ctx.dryRun)
      recordApplied(gear, n);
    if (this.enemyStacks.get(gear) === next)
      return next;
    this.enemyStacks.set(gear, next);
    return next;
  }
  removeStackEnemy(gear, n = 1) {
    noteMutation(gear.id, -n);
    const next = Math.max(0, this.stacksOfEnemy(gear) - n);
    if (next === 0) {
      if (!this.enemyStacks.has(gear))
        return 0;
      this.enemyStacks.delete(gear);
      return 0;
    }
    if (this.enemyStacks.get(gear) === next)
      return next;
    this.enemyStacks.set(gear, next);
    return next;
  }
  setStacksEnemy(gear, n) {
    noteMutation(gear.id, 1e6 + n);
    const next = Math.max(0, Math.min(this.enemyMax(gear), n));
    if (!ctx.dryRun)
      recordApplied(gear, n - this.stacksOfEnemy(gear));
    if (next === 0) {
      if (!this.enemyStacks.has(gear))
        return 0;
      this.enemyStacks.delete(gear);
      return 0;
    }
    if (this.enemyStacks.get(gear) === next)
      return next;
    this.enemyStacks.set(gear, next);
    return next;
  }
  revokeEnemy(gear) {
    noteMutation(gear.id, -1e6);
    if (!this.enemyStacks.has(gear))
      return;
    this.enemyStacks.delete(gear);
  }
};
var ENEMY_RES = 0;
var ENEMY_DEF_LEVEL = 100;
var enemyDef = () => 792 + 8 * ENEMY_DEF_LEVEL;
var enemyRes = () => ENEMY_RES;
var FightSnapshot = class {
  members;
  global;
  enemy;
  offtune = 0;
  constructor(state) {
    const pool = () => ({ list: [], counts: [], hooks: [], globalHooks: [], at: /* @__PURE__ */ new Map(), dead: 0 });
    const member2 = () => ({ pool: pool(), globalHooks: /* @__PURE__ */ new Set(), forte: [0, 0, 0, 0, 0], concerto: 0 });
    this.members = state.slots.map(member2);
    this.global = pool();
    this.enemy = pool();
  }
  take(state) {
    state.slots.forEach((m, i) => m.snapshotInto(this.members[i]));
    state.globalStacks.snapshotInto(this.global);
    state.enemyStacks.snapshotInto(this.enemy);
    this.offtune = state.offtune;
  }
  restore(state) {
    undoDry();
    state.slots.forEach((m, i) => m.restore(this.members[i]));
    state.globalStacks.restore(this.global);
    state.enemyStacks.restore(this.enemy);
    state.offtune = this.offtune;
  }
};

// dist/src/engine/context.js
function setTracing(on) {
  ctx.tracing = on;
}
var currentAction = () => ctx.act;
var midActionGroup = () => ctx.insideGroup;
var triggeredAction = () => ctx.triggered;
var currentTeam = () => ctx.state;
var currentMember = () => ctx.slot;
function casting(cast) {
  return isCast(ctx.act, cast);
}
function typeOverride(type) {
  const a = ctx.act;
  if (type & TYPE2_BITS)
    ctx.overrideType2 = type;
  else
    ctx.overrideType1 = type;
  ctx.tagWord = tagWord(a.element, ctx.overrideType1 ?? a.type, ctx.overrideType2 ?? a.type2);
}
function isType(type) {
  const a = ctx.act;
  return (ctx.overrideType1 ?? a.type) === type || (ctx.overrideType2 ?? a.type2) === type;
}
function isCast(action, cast) {
  return action.cast === cast || action.cast2 === cast;
}
function applied(gear) {
  return ctx.appliedNow.get(gear) ?? 0;
}
function appliedByMe(gear) {
  return appliedByMember(gear, ctx.slot);
}
function appliedByMember(gear, member2) {
  return ctx.appliedBy.get(gear)?.get(member2.name) ?? 0;
}
function consumedByMe(gear) {
  return consumedByMember(gear, ctx.slot);
}
function consumedByMember(gear, member2) {
  return ctx.consumedBy.get(gear)?.get(member2.name) ?? 0;
}
function consumedAny() {
  let total = 0;
  for (const n of ctx.consumedNow.values())
    total += n;
  return total;
}
function frozenStacks() {
  return ctx.stacks >= 0 ? ctx.stacks : ctx.slot.stacksOf(ctx.buff);
}
function pushStat(stat, tag, value) {
  const slot = ctx.slot;
  if (tag === void 0 || (ctx.tagWord & tagBand(tag)) === tag) {
    slot.effective[stat] = slot.effective[stat] + value;
    if (stat === 18 && tag !== void 0 && (tag & TYPE2_BITS) !== 0) {
      slot.effective[TYPE2_AMP_INDEX] = slot.effective[TYPE2_AMP_INDEX] + value;
    }
    if (stat === 17 && tag === 4096) {
      slot.effective[BASIC_DMG_BONUS_INDEX] = slot.effective[BASIC_DMG_BONUS_INDEX] + value;
    }
  }
  if (!ctx.tracing)
    return;
  const key = tag === void 0 ? stat : scopedStat(tag, stat);
  slot.entries.push({
    stat: key,
    value,
    source: ctx.buff?.toString() ?? "",
    owner: (ctx.buff && ctx.state.sourceOf.get(ctx.buff)) ?? slot.name ?? null
  });
  slot.totals.set(key, (slot.totals.get(key) ?? 0) + value);
}
function addStat(stat, value, tag) {
  pushStat(stat, tag, value);
}
function addEnemyStat(stat, value, tag) {
  pushStat(stat, tag, value);
}
var ALL_ATTRIBUTES = [
  64,
  128,
  192,
  256,
  320,
  384,
  448
];
var ALL_TYPE1 = [
  4096,
  8192,
  12288,
  16384,
  20480,
  24576,
  28672,
  32768,
  36864,
  40960,
  49152,
  53248
];
var ALL_TYPE2 = [
  262144,
  524288,
  786432,
  1048576,
  1310720,
  1572864
];
function menuStats(gear) {
  const slot = new TeamMember("");
  const state = new State([]);
  const saved = { slot: ctx.slot, state: ctx.state, buff: ctx.buff, stacks: ctx.stacks, tagWord: ctx.tagWord, tracing: ctx.tracing };
  ctx.slot = slot;
  ctx.state = state;
  ctx.stacks = 1;
  ctx.tracing = true;
  const passes = ALL_TYPE1.length;
  for (const g of gear) {
    if (!g.constantStatsFn)
      continue;
    ctx.buff = g;
    for (let i = 0; i < passes; i++) {
      ctx.tagWord = (ALL_ATTRIBUTES[i] ?? 0) | ALL_TYPE1[i] | (ALL_TYPE2[i] ?? 0);
      g.constantStatsFn();
    }
  }
  Object.assign(ctx, saved);
  const seen = /* @__PURE__ */ new Set();
  return slot.entries.filter((e) => {
    const key = `${e.source}\0${e.stat}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function getStat(stat) {
  return ctx.slot.effective[stat];
}
function basicDmgBonus() {
  return ctx.slot.effective[BASIC_DMG_BONUS_INDEX];
}
function stacksOf(gear) {
  return ctx.slot.stacksOf(gear);
}
function isHeld(gear) {
  return ctx.slot.isHeld(gear);
}
function maxEnergy() {
  return ctx.slot.resonator?.maxEnergy ?? 0;
}
function forteGauge(i) {
  return {
    get: () => ctx.slot.forte[i],
    set: (value) => {
      noteMutation(-1 - i, value);
      return ctx.slot.forte[i] = value;
    },
    add: (delta) => {
      noteMutation(-1 - i, delta);
      return ctx.slot.forte[i] = ctx.slot.forte[i] + delta;
    }
  };
}
var { get: forte1, set: setForte1, add: addForte1 } = forteGauge(0);
var { get: forte2, set: setForte2, add: addForte2 } = forteGauge(1);
var { get: forte3, set: setForte3, add: addForte3 } = forteGauge(2);
var { get: forte4, set: setForte4, add: addForte4 } = forteGauge(3);
var { get: forte5, set: setForte5, add: addForte5 } = forteGauge(4);
function concerto() {
  return ctx.slot.concerto;
}
function setConcerto(value) {
  noteMutation(-10, value);
  return ctx.slot.concerto = value;
}
function attribute(gear) {
  const inherited = ctx.buff ? ctx.state.sourceOf.get(ctx.buff) : void 0;
  ctx.state.sourceOf.set(gear, inherited ?? ctx.slot.name);
}
function applyCurrent(buff, n = 1) {
  attribute(buff);
  return ctx.slot.addStack(buff, n);
}
function equip(gear, n = 1) {
  attribute(gear);
  const result = ctx.slot.addStack(gear, n);
  ctx.slot.equipped.add(gear);
  if (gear instanceof Mainslot)
    ctx.slot.mainslot = gear;
  const prevBuff = ctx.buff;
  ctx.buff = gear;
  try {
    gear.combatStartFn?.();
  } finally {
    ctx.buff = prevBuff;
  }
  return result;
}
function equipEnemy(gear, n = 1) {
  const prev = ctx.slot;
  ctx.slot = ctx.state.enemy;
  try {
    return equip(gear, n);
  } finally {
    ctx.slot = prev;
  }
}
function setStacksSelf(buff, n) {
  attribute(buff);
  return ctx.slot.setStacks(buff, n);
}
function removeStack(buff, n = 1) {
  return ctx.slot.removeStack(buff, n);
}
function revokeCurrent(buff) {
  ctx.slot.revoke(buff);
}
function currentGear() {
  return ctx.buff;
}
function stacksOfTeam(gear) {
  return ctx.state.stacksOfGlobal(gear);
}
function applyTeam(buff, n = 1) {
  attribute(buff);
  return ctx.state.addStackGlobal(buff, n);
}
function removeStackTeam(buff, n = 1) {
  return ctx.state.removeStackGlobal(buff, n);
}
function revokeTeam(buff) {
  ctx.state.revokeGlobal(buff);
}
function stacksOfEnemy(gear) {
  return ctx.state.stacksOfEnemy(gear);
}
function applyEnemy(debuff, n = 1) {
  attribute(debuff);
  return ctx.state.addStackEnemy(debuff, n);
}
function removeStackEnemy(debuff, n = 1) {
  return ctx.state.removeStackEnemy(debuff, n);
}
function consume(debuff, n = 1) {
  const before = ctx.state.stacksOfEnemy(debuff);
  const after = ctx.state.removeStackEnemy(debuff, n);
  if (!ctx.dryRun)
    recordConsumed(debuff, before - after);
  return after;
}
function revokeEnemy(debuff) {
  ctx.state.revokeEnemy(debuff);
}
function maxStackIncrease(debuff, n = 1) {
  ctx.state.increaseMaxEnemy(debuff, n, ctx.buff?.name ?? ctx.slot.name);
}
function addBuff(resonator, buff, n = 1) {
  attribute(buff);
  return ctx.state.memberOf(resonator).addStack(buff, n);
}
function revokeBuff(resonator, buff) {
  ctx.state.memberOf(resonator).revoke(buff);
}
function queueOutro(buff) {
  noteMutation(buff.id, 3e6);
  if (ctx.dryRun)
    return;
  attribute(buff);
  ctx.state.outroQueue.push(buff);
}
var queuedBy = () => {
  const gear = ctx.buff;
  if (!gear?.name)
    return null;
  return { name: gear.name, source: ctx.state.sourceOf.get(gear) ?? ctx.slot.name };
};
function queue(action) {
  noteMutation(action.id, 4e6);
  if (ctx.dryRun)
    return;
  pendingQueue.push({ action, slot: ctx.state.slots.indexOf(ctx.slot), by: queuedBy(), event: false });
}
function queueOnIntro(action) {
  noteMutation(action.id, 7e6);
  if (ctx.dryRun)
    return;
  ctx.state.introQueue.push({ action, slot: ctx.state.slots.indexOf(ctx.slot), by: queuedBy(), event: false });
}
function queueEvent(action) {
  noteMutation(action.id, 5e6);
  if (ctx.dryRun)
    return;
  pendingQueue.push({ action, slot: -1, by: queuedBy(), event: true });
}
function queueOn(resonator, action) {
  noteMutation(action.id, 6e6);
  if (ctx.dryRun)
    return;
  pendingQueue.push({ action, slot: ctx.state.slots.indexOf(ctx.state.memberOf(resonator)), by: queuedBy(), event: false });
}
function withTeam(state, fn) {
  const prevState = ctx.state, prevSlot = ctx.slot, prevBuff = ctx.buff, prevAction = ctx.act;
  ctx.state = state;
  ctx.slot = state.slot;
  try {
    fn();
  } finally {
    ctx.state = prevState;
    ctx.slot = prevSlot;
    ctx.buff = prevBuff;
    ctx.act = prevAction;
  }
}

// dist/src/engine/gear.js
var PHASE_DEBUFFS = 1;
var PHASE_BUFFS = 2;
var PHASE_APPLY = 4;
var PHASE_CONVERT = 8;
var PHASE_LATE = 16;
var PHASE_AFTER = 32;
var PHASE_CONST = 64;
var PHASE_COUNT = 7;
var nextGearId = 1;
var Gear = class {
  name;
  /** How many stacks of this can be held at once. Only a `Buff` ever declares one (see `BuffDef`)
   *  — every other Gear is a single equipped piece, so 1. The field lives here rather than on
   *  Buff because the engine's own stack machinery (`addStack`/`setStacks`/`enemyMax`) reads it
   *  off a plain Gear: `equip()` puts a Resonator/weapon/echo onto a slot through exactly the
   *  same path a buff goes through. */
  maxStacks = 1;
  /** See `GearDef.field` — the field this Gear's own presence stands for, or null. */
  field;
  combatStartFn;
  updateDebuffsFn;
  updateGlobalFn;
  updateBuffsFn;
  constantStatsFn;
  applyStatsFn;
  convertStatsFn;
  afterActionFn;
  lateConvertStatsFn;
  displayFn;
  /** Which of the six per-action phases this Gear has a hook for, one bit each (see `PHASE_*`),
   *  fixed here since the hooks themselves are — a `Pool` reads this one field to sort a
   *  held Gear into its phase lists, rather than `evaluate()` probing six optional properties on
   *  every held Gear every action. */
  hookMask;
  /** A small integer unique to this Gear — what a variant dry run hashes a mutation by, to tell
   *  whether it would have changed the fight (see `noteMutation()`). */
  id;
  /** The same six hooks by phase index (bit order of `PHASE_*`), for `runPhase()` to call one
   *  phase's hook without naming the field — only the phases set in `hookMask` are ever read. */
  hookFns;
  constructor(def2) {
    this.id = nextGearId++;
    this.name = def2.name ?? "";
    this.field = def2.field ?? null;
    this.combatStartFn = def2.combatStart;
    this.updateDebuffsFn = def2.updateDebuffs;
    this.updateGlobalFn = def2.updateGlobal;
    this.updateBuffsFn = def2.updateBuffs;
    this.constantStatsFn = def2.constantStats;
    this.applyStatsFn = def2.applyStats;
    this.convertStatsFn = def2.convertStats;
    this.afterActionFn = def2.afterAction;
    this.lateConvertStatsFn = def2.lateConvertStats;
    this.displayFn = def2.display;
    this.hookMask = (def2.updateDebuffs ? PHASE_DEBUFFS : 0) | (def2.updateBuffs ? PHASE_BUFFS : 0) | (def2.applyStats ? PHASE_APPLY : 0) | (def2.convertStats ? PHASE_CONVERT : 0) | (def2.lateConvertStats ? PHASE_LATE : 0) | (def2.afterAction ? PHASE_AFTER : 0) | (def2.constantStats ? PHASE_CONST : 0);
    this.hookFns = [def2.updateDebuffs, def2.updateBuffs, def2.applyStats, def2.convertStats, def2.lateConvertStats, def2.afterAction, def2.constantStats];
  }
  toString() {
    if (this.displayFn)
      return this.displayFn();
    return this.maxStacks > 1 ? `${this.name} x${frozenStacks()}` : this.name;
  }
};
var Buff = class extends Gear {
  constructor(def2) {
    super(def2);
    this.maxStacks = def2.maxStacks ?? 1;
  }
};
var Debuff = class extends Buff {
};
var Talent = class extends Gear {
};
var Inherent = class extends Gear {
};
var Sequence = class extends Gear {
};
var baseSequence = (r) => ({ [
  0
  /* Tier.Limited */
]: 0, [
  1
  /* Tier.Standard */
]: 2, [
  2
  /* Tier.Free */
]: 6 })[r.tier];
var ResonanceMode = class extends Gear {
};
var Sonata2pc = class extends Gear {
  size = 2;
};
var Sonata = class extends Gear {
  size = 5;
  sonata2pc;
  constructor(def2) {
    super(def2);
    this.sonata2pc = def2.sonata2pc;
  }
};
var Sonata3pc = class extends Gear {
  size = 3;
};
var Sonata1pc = class extends Gear {
  size = 1;
};
var Matrix = class extends Gear {
};
var EchoLoadout = class {
  mainslot;
  sonata;
  sets;
  constructor(mainslot, sonata, ...pc2) {
    this.mainslot = mainslot;
    this.sonata = sonata;
    this.sets = [sonata, ...pc2];
  }
  pieces() {
    return [this.mainslot, ...this.sets, ...this.sonata instanceof Sonata ? [this.sonata.sonata2pc] : []];
  }
};
var Loadout = class {
  resonator;
  talent;
  inherent1;
  inherent2;
  weapons;
  echoLoadouts;
  /** Every main-stat build this loadout is willing to run (see mainstats.ts's own
   *  `mainstatOptions()`) — a list for the same reason `weapons`/`echoLoadouts` are, the table
   *  runs one row per combination. A pure support names just the one. */
  mainstats;
  substat;
  /** This build's whole rotation, already compiled into the up-to-three action chains the
   *  scheduler schedules — start of combat, opener, and the Intro chain every visit after
   *  (rotation.ts). One field, not an opener/loop pair: the chains share a body, so splitting
   *  them across two lists only ever duplicated it. */
  rotation;
  /** This loadout's own resonance-chain nodes, S1 first — as many as it actually declares, which
   *  is six for anything a build is costed above S0 at (see `Tier`) and none for most
   *  limited kits. */
  sequences;
  mode;
  /** This kit's Matrix, if it has one — worn only when the table's Matrix Mode box is on, and
   *  only by loadouts that declare one (see `pieces()`). */
  matrix;
  constructor(def2) {
    this.resonator = def2.resonator;
    this.talent = def2.talent;
    this.inherent1 = def2.inherent1;
    this.inherent2 = def2.inherent2;
    this.weapons = def2.weapons;
    this.echoLoadouts = def2.echoLoadouts;
    this.mainstats = def2.mainstats;
    this.substat = def2.substat;
    this.rotation = def2.rotation;
    this.sequences = def2.sequences ?? [];
    this.mode = def2.mode;
    this.matrix = def2.matrix;
  }
  /** Every piece for one specific weapon/echo/main-stat/sequence-level combo, flattened into the
   *  plain array `equip()` actually walks — the order matches how each resonator file's own loadout
   *  comment already reads (resonator, talent, both inherents, weapon, echoes, mainstat/substat,
   *  sequences, mode). `sequenceLevel` is how many nodes are actually held, S1 up: 0 for a build at
   *  S0, 6 for the full chain — the comparison table runs one row per level so the gain from each
   *  can be read off (see index.ts's own combos). `matrix` is whether Matrix Mode is on — the
   *  piece only goes on when it is *and* this loadout declares one. */
  pieces(weapon, echo, mainstat, sequenceLevel, matrix2 = false) {
    return [
      this.resonator,
      this.talent,
      this.inherent1,
      this.inherent2,
      weapon,
      ...echo.pieces(),
      mainstat,
      this.substat,
      ...this.sequences.slice(0, sequenceLevel),
      this.mode,
      matrix2 ? this.matrix : void 0
    ].filter((g) => g != null);
  }
};
var Resonator = class extends Gear {
  element;
  weapon;
  maxEnergy;
  color;
  introFn;
  outroFn;
  tier;
  constructor(def2) {
    super({
      ...def2,
      // The four every resonator in the game starts with, applied here so no kit has to restate
      // them: 5% Crit. Rate, 150% Crit. DMG, 100% Energy Regen and a 100% Off-Tune Buildup Rate.
      // Off-tune is the one worth spelling out — the rate is a plain multiplier on what a cast
      // banks (see `evaluate()`), so 100 is the neutral baseline the way 100% ER is, and a kit
      // granting "+50% Buildup Rate" (Mornye's Syntony Field) adds 50 on top of it for x1.5.
      // A kit's own constantStats runs after, so its Base HP/ATK/DEF and anything else land on top.
      constantStats: () => {
        if (!def2.enemy) {
          addStat(9, 5);
          addStat(10, 150);
          addStat(11, 100);
          addStat(13, 100);
        }
        def2.constantStats?.();
      },
      combatStart: () => {
        ctx.slot.resonator = this;
        if (def2.enemy)
          ctx.slot.name = this.name;
        ctx.slot.realEnergy = this.maxEnergy;
        def2.combatStart?.();
      }
    });
    this.element = def2.element;
    this.weapon = def2.weapon;
    this.maxEnergy = def2.maxEnergy ?? 0;
    this.color = def2.color;
    this.introFn = def2.intro;
    this.outroFn = def2.outro;
    this.tier = def2.tier ?? 0;
  }
};
var Mainslot = class extends Gear {
  action;
  echoType;
  onfield;
  outro;
  cancel;
  constructor(def2) {
    super(def2);
    this.action = def2.action;
    this.echoType = def2.echoType;
    const a = def2.action;
    if (def2.echoType === 0) {
      this.onfield = this.cancel = this.outro = a.variant(a.name, { triggered: true });
      return;
    }
    this.onfield = a;
    this.outro = a.swap();
    this.cancel = a.dodgeCancel();
  }
};
var Weapon = class extends Gear {
  weaponType;
  standard;
  constructor(def2) {
    super(def2);
    this.weaponType = def2.weaponType;
    this.standard = def2.standard ?? false;
  }
};

// dist/src/engine/damage.js
var RESONATOR_LEVEL = 90;
var LEVEL_90_DOT = 3674;
var LEVEL_90_TUNE = 10027;
var mvPercent = (snapshot) => (snapshot.action.mv + snapshot.stats[
  15
  /* Stat.AddMv */
]) * (1 + snapshot.stats[
  16
  /* Stat.MulMv */
] / 100);
var notDotFor = (snapshot) => snapshot.action.scaling !== 3 ? 1 : 0;
function effectiveShred(snapshot) {
  const s = (k) => snapshot.stats[k] / 100;
  const notDot = notDotFor(snapshot);
  const base = snapshot.enemyDef;
  return 1 - (1 - notDot * s(
    21
    /* Stat.DefIgnoreNew */
  )) * Math.floor(base * (1 - s(
    35
    /* EnemyStat.DefReduce */
  ) - notDot * s(
    22
    /* Stat.DefIgnoreOld */
  ))) / base;
}
function effectiveRes(snapshot) {
  const s = (k) => snapshot.stats[k] / 100;
  return (snapshot.enemyRes / 100 - s(
    20
    /* Stat.ResIgnore */
  ) * notDotFor(snapshot) - s(
    34
    /* EnemyStat.ResReduce */
  )) * 100;
}
function resFactorOf(snapshot) {
  const finalRes = effectiveRes(snapshot) / 100;
  return finalRes < 0 ? 1 - finalRes / 2 : finalRes < 0.8 ? 1 - finalRes : 1 / (1 + 5 * finalRes);
}
function defFactorOf(snapshot) {
  const finalDef = (1 - effectiveShred(snapshot)) * snapshot.enemyDef;
  const ownDef = 800 + RESONATOR_LEVEL * 8;
  return ownDef / (ownDef + finalDef);
}
function damageFactors(snapshot) {
  const { action } = snapshot;
  const s = (k) => snapshot.stats[k] / 100;
  const { scaling } = action;
  if (scaling === null) {
    return {
      scaling: null,
      finalMv: 0,
      finalStat: 0,
      ampFactor: 1,
      bonusFactor: 1,
      tbbFactor: 1,
      resFactor: 1,
      defFactor: 1,
      dealtFactor: 1,
      critFactor: 1,
      critMult: 1,
      noCrit: 0,
      crit: 0,
      avg: 0
    };
  }
  if (scaling === 5) {
    return {
      scaling,
      finalMv: action.mv,
      finalStat: 100,
      ampFactor: 1,
      bonusFactor: 1,
      tbbFactor: 1,
      resFactor: 1,
      defFactor: 1,
      dealtFactor: 1,
      critFactor: 1,
      critMult: 1,
      noCrit: action.mv,
      crit: action.mv,
      avg: action.mv
    };
  }
  const notDot = scaling !== 3 ? 1 : 0;
  const notTune = scaling !== 4 ? 1 : 0;
  const finalStat = Math.floor(scaling === 0 ? snapshot.atk : scaling === 1 ? snapshot.hp : scaling === 2 ? snapshot.def : scaling === 3 ? LEVEL_90_DOT : scaling === 4 ? LEVEL_90_TUNE : NaN);
  const finalMv = mvPercent(snapshot) / 100;
  const ampFactor = 1 + (notDot ? snapshot.amp : snapshot.type2Amp) / 100 * notTune;
  const bonusFactor = 1 + snapshot.dmgBonus / 100 * notDot * notTune;
  const tbbFactor = 1 + snapshot.stats[
    12
    /* Stat.Tbb */
  ] / 100 * (1 - notTune);
  const resFactor = resFactorOf(snapshot);
  const defFactor = defFactorOf(snapshot);
  const dealtFactor = 1 + s(
    19
    /* Stat.TotalDmg */
  ) * notDot;
  const critMult = notDot * notTune ? s(
    10
    /* Stat.CritDmg */
  ) : 1;
  const cr = s(
    9
    /* Stat.CritRate */
  );
  const critFactor = cr >= 1 ? critMult : 1 - cr + critMult * cr;
  const noCrit = finalMv * finalStat * ampFactor * bonusFactor * tbbFactor * resFactor * defFactor * dealtFactor;
  return {
    scaling,
    finalMv,
    finalStat,
    ampFactor,
    bonusFactor,
    tbbFactor,
    resFactor,
    defFactor,
    dealtFactor,
    critFactor,
    critMult,
    noCrit,
    crit: noCrit * critMult,
    avg: noCrit * critFactor
  };
}
function damage(snapshot) {
  const { noCrit, crit, avg } = damageFactors(snapshot);
  return { noCrit, crit, avg };
}

// dist/src/engine/evaluate.js
function evaluate(state, action, triggered = false, triggeredBy = null) {
  const slot = state.slot;
  ctx.state = state;
  ctx.slot = slot;
  ctx.act = action;
  ctx.triggered = triggered;
  ctx.tagWord = tagWordOf(action);
  ctx.overrideType1 = null;
  ctx.overrideType2 = null;
  ctx.appliedNow = /* @__PURE__ */ new Map();
  ctx.appliedBy = /* @__PURE__ */ new Map();
  ctx.consumedNow = /* @__PURE__ */ new Map();
  ctx.consumedBy = /* @__PURE__ */ new Map();
  slot.effective = ZERO_STATS.slice();
  const forteBefore = ctx.tracing ? [...slot.forte] : EMPTY_FORTE;
  const energyBefore = slot.energy, concertoBefore = slot.concerto, offtuneBefore = state.offtune;
  if (ctx.tracing) {
    slot.entries = [];
    slot.totals = /* @__PURE__ */ new Map();
  }
  if (casting(
    6
    /* Cast.Intro */
  )) {
    for (const gear of state.outroQueue.splice(0))
      slot.addStack(gear, 1);
    pendingQueue.push(...state.introQueue.splice(0));
  }
  capture(slot, state);
  actionHook(action.updateDebuffsFn);
  runPhase(0, true);
  actionHook(action.updateGlobalFn);
  for (const s of state.slots) {
    for (const gear of s.globalHooks) {
      ctx.slot = s;
      ctx.buff = gear;
      ctx.stacks = -1;
      gear.updateGlobalFn();
    }
  }
  ctx.slot = slot;
  const globalHooks = state.globalStacks.globalHooks, enemyHooks = state.enemyStacks.globalHooks;
  for (let i = 0; i < globalHooks.length; i++) {
    ctx.buff = globalHooks[i];
    ctx.buff.updateGlobalFn();
  }
  for (let i = 0; i < enemyHooks.length; i++) {
    ctx.buff = enemyHooks[i];
    ctx.buff.updateGlobalFn();
  }
  ctx.buff = null;
  capture(slot, state);
  actionHook(action.updateBuffsFn);
  runPhase(1, true);
  capture(slot, state);
  const heldPools = ctx.tracing ? [slot.stacks, state.globalStacks, state.enemyStacks].map((pool) => pool.gears().map((g) => [g, pool.get(g) ?? 0])) : null;
  const pre = !ctx.tracing && slot.variants.length !== 0 ? slot.effective.slice() : null;
  ctx.guarded = pre !== null;
  const snapshots = pre !== null ? state.snapshots ??= [new FightSnapshot(state), new FightSnapshot(state), new FightSnapshot(state)] : null;
  if (snapshots !== null)
    snapshots[0].take(state);
  if (ctx.tracing)
    runPhase(6, true);
  else {
    if (slot.constBaseVersion !== ctx.constVersion) {
      slot.constBase.clear();
      for (const m of slot.variantBase)
        m.clear();
      slot.constBaseVersion = ctx.constVersion;
    }
    let base2 = slot.constBase.get(ctx.tagWord);
    if (base2 === void 0)
      slot.constBase.set(ctx.tagWord, base2 = constBaseOf(slot, null, null));
    const effective2 = slot.effective;
    for (let i = 0; i < effective2.length; i++)
      effective2[i] = effective2[i] + base2[i];
  }
  ctx.mutHash = 0;
  actionHook(action.applyStatsFn);
  runPhase(2, true);
  actionHook(action.convertStatsFn);
  runPhase(3, true);
  actionHook(action.lateConvertStatsFn);
  runPhase(4, true);
  let variantEff = null;
  if (pre !== null && snapshots !== null) {
    const primaryHash = ctx.mutHash, primaryEff = slot.effective;
    const [before, after] = snapshots;
    after.take(state);
    variantEff = [];
    ctx.dryRun = true;
    for (let v = 0; v < slot.variants.length; v++) {
      let vbase = slot.variantBase[v].get(ctx.tagWord);
      if (vbase === void 0)
        slot.variantBase[v].set(ctx.tagWord, vbase = constBaseOf(slot, slot.variantOf, slot.variants[v]));
      const eff = pre.slice();
      for (let i = 0; i < eff.length; i++)
        eff[i] = eff[i] + vbase[i];
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
      for (const s of RESOURCE_STATS)
        if (eff[s] !== primaryEff[s])
          unsafe = true;
      if (unsafe)
        slot.variantUnsafe[v] = true;
      variantEff.push(eff);
    }
    ctx.dryRun = false;
    after.restore(state);
    slot.effective = primaryEff;
  }
  let heldLocal = EMPTY_HELD, heldGlobal = EMPTY_HELD, heldEnemy = EMPTY_HELD;
  if (ctx.tracing) {
    const frozen = /* @__PURE__ */ new Map();
    for (let q = 0; q < 3; q++) {
      const list = capList[q], counts = capCounts[q], hooks = capHooks[q];
      for (let p = 0; p < PHASE_COUNT; p++)
        for (const k of hooks[p])
          frozen.set(list[k], counts[k]);
    }
    const describe = ([g, n]) => {
      ctx.buff = g;
      ctx.stacks = frozen.get(g) ?? n;
      return { name: g.toString(), source: state.sourceOf.get(g) ?? "" };
    };
    const named = (b) => b.name !== "";
    heldLocal = heldPools[0].filter(([g]) => !slot.equipped.has(g)).map(describe).filter(named);
    heldGlobal = heldPools[1].map(describe).filter(named);
    heldEnemy = heldPools[2].filter(([g]) => !state.enemy.equipped.has(g)).map(describe).filter(named);
  }
  ctx.stacks = -1;
  ctx.buff = null;
  let opensFields = EMPTY_FIELDS;
  if (ctx.tracing) {
    for (const [gear] of ctx.appliedNow) {
      if (!gear.field)
        continue;
      if (opensFields === EMPTY_FIELDS)
        opensFields = [];
      opensFields.push(gear.field);
    }
  }
  const effective = slot.effective;
  const stat = (k) => effective[k];
  const base = effective[
    0
    /* Stat.BaseAtk */
  ], baseHp = effective[
    1
    /* Stat.BaseHp */
  ], baseDef = effective[
    2
    /* Stat.BaseDef */
  ];
  const energyGain = (action.energy + effective[
    25
    /* Stat.AddEnergy */
  ]) * (1 + effective[
    14
    /* Stat.EnergyRegenMult */
  ] / 100);
  slot.energy = Math.max(0, slot.energy + energyGain);
  const outro = casting(
    7
    /* Cast.Outro */
  );
  const concertoSpent = outro ? slot.concerto + effective[
    26
    /* Stat.AddConcerto */
  ] : 0;
  const energyWiped = outro && state.outroDir > 0;
  if (outro) {
    if (energyWiped)
      slot.energy = 0;
    if (slot.concerto > 100)
      slot.concerto = 100;
  }
  slot.concerto = Math.max(0, slot.concerto + action.concerto + effective[
    26
    /* Stat.AddConcerto */
  ]);
  const built = action.offtune + effective[
    27
    /* Stat.AddOfftune */
  ];
  state.offtune += (built < 0 ? built : built * (effective[
    13
    /* Stat.OfftuneBuildup */
  ] / 100)) + effective[
    28
    /* Stat.DirectOfftune */
  ];
  const realEnergyBefore = slot.realEnergy;
  slot.realEnergy = capEnergy(slot, slot.realEnergy + energyGain);
  const shared = energyGain / 2;
  for (const other of state.slots) {
    if (other !== slot)
      other.realEnergy = capEnergy(other, other.realEnergy + shared);
  }
  if (action.resetEnergy)
    slot.realEnergy = 0;
  const forte = slot.forte;
  forte[0] += action.forte1 + effective[
    29
    /* Stat.AddForte1 */
  ];
  forte[1] += action.forte2 + effective[
    30
    /* Stat.AddForte2 */
  ];
  forte[2] += action.forte3 + effective[
    31
    /* Stat.AddForte3 */
  ];
  forte[3] += action.forte4 + effective[
    32
    /* Stat.AddForte4 */
  ];
  forte[4] += action.forte5 + effective[
    33
    /* Stat.AddForte5 */
  ];
  let variantAvg = null;
  const variantHash = [];
  if (variantEff !== null && snapshots !== null) {
    variantAvg = [];
    const banked = snapshots[2];
    banked.take(state);
    ctx.dryRun = true;
    for (let v = 0; v < variantEff.length; v++) {
      const eff = variantEff[v];
      slot.effective = eff;
      ctx.mutHash = 0;
      ctx.stacks = -1;
      actionHook(action.afterActionFn);
      runPhase(5, false);
      variantHash.push(ctx.mutHash);
      banked.restore(state);
      const b = eff[
        0
        /* Stat.BaseAtk */
      ], bh = eff[
        1
        /* Stat.BaseHp */
      ], bd = eff[
        2
        /* Stat.BaseDef */
      ];
      variantAvg.push(damage({
        action,
        stat: (k) => eff[k],
        stats: eff,
        atk: b + eff[
          6
          /* Stat.BonusAtk */
        ] / 100 * b + eff[
          3
          /* Stat.FlatAtk */
        ],
        hp: bh + eff[
          7
          /* Stat.BonusHp */
        ] / 100 * bh + eff[
          4
          /* Stat.FlatHp */
        ],
        def: bd + eff[
          8
          /* Stat.BonusDef */
        ] / 100 * bd + eff[
          5
          /* Stat.FlatDef */
        ],
        amp: eff[
          18
          /* Stat.Amp */
        ],
        type2Amp: eff[TYPE2_AMP_INDEX],
        dmgBonus: eff[
          17
          /* Stat.DmgBonus */
        ],
        enemyRes: enemyRes(),
        enemyDef: enemyDef()
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
  for (let v = 0; v < variantHash.length; v++)
    if (variantHash[v] !== ctx.mutHash)
      slot.variantUnsafe[v] = true;
  const snapshot = {
    action,
    type: ctx.overrideType1 ?? action.type,
    // the effective type — see ResolvedSnapshot.type
    member: slot.name,
    slot: action.slot ?? slot.name,
    stat,
    stats: effective,
    atk: base + effective[
      6
      /* Stat.BonusAtk */
    ] / 100 * base + effective[
      3
      /* Stat.FlatAtk */
    ],
    hp: baseHp + effective[
      7
      /* Stat.BonusHp */
    ] / 100 * baseHp + effective[
      4
      /* Stat.FlatHp */
    ],
    def: baseDef + effective[
      8
      /* Stat.BonusDef */
    ] / 100 * baseDef + effective[
      5
      /* Stat.FlatDef */
    ],
    amp: effective[
      18
      /* Stat.Amp */
    ],
    type2Amp: effective[TYPE2_AMP_INDEX],
    dmgBonus: effective[
      17
      /* Stat.DmgBonus */
    ],
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
    energy: slot.energy,
    concerto: slot.concerto,
    offtune: state.offtune,
    energyBefore,
    concertoBefore,
    offtuneBefore,
    concertoSpent,
    energyWiped,
    realEnergyBefore,
    heldLocal,
    heldGlobal,
    heldEnemy,
    opensFields,
    variantAvg
  };
  if (casting(
    7
    /* Cast.Outro */
  )) {
    const n = state.slots.length;
    state.active = (state.active + state.outroDir + n) % n;
  }
  return snapshot;
}
function run(state, rotation) {
  const out = [];
  const actions = [];
  const slots = [];
  const bys = [];
  const groups = [];
  const ends = [];
  const spills = [];
  for (const entry of rotation) {
    const group = entry.actions !== void 0 ? entry : null;
    const members = group ? group.actions : [entry];
    members.forEach((a, k) => {
      actions.push(a);
      slots.push(-1);
      bys.push(null);
      spills.push(null);
      groups.push(group);
      ends.push(group !== null && k === members.length - 1);
    });
  }
  ctx.insideGroup = false;
  let spillGroup = null;
  let i = 0, guard = 0;
  while (i < actions.length) {
    if (++guard > 1e4)
      throw new Error("action queue did not drain");
    const stepAction = actions[i], stepSlot = slots[i], stepBy = bys[i];
    const stepGroup = groups[i], stepEnd = ends[i], stepSpill = spills[i];
    i++;
    spillGroup = stepGroup ?? stepSpill;
    if (stepGroup)
      ctx.insideGroup = !stepEnd;
    const before = state.active;
    if (stepSlot >= 0)
      state.active = stepSlot;
    let action = stepAction;
    if (stepAction.resolveFn) {
      ctx.state = state;
      ctx.slot = state.slot;
      action = stepAction.resolveFn();
      if (!action)
        continue;
    }
    pendingQueue.length = 0;
    const triggered = stepSlot >= 0 || stepAction.triggered || action.triggered || isCast(
      action,
      7
      /* Cast.Outro */
    );
    const ms = state.slot.mainslot;
    const by = ms && action.triggered && (action === ms.onfield || action === ms.outro || action === ms.cancel) ? { name: ms.name, source: state.sourceOf.get(ms) ?? state.slot.name } : stepBy;
    const snapshot = evaluate(state, action, triggered, by);
    snapshot.group = stepGroup;
    snapshot.groupEnd = stepEnd;
    snapshot.groupSpill = stepSpill;
    out.push(snapshot);
    if (stepSlot >= 0 && state.active === stepSlot)
      state.active = before;
    if (pendingQueue.length) {
      const qa = [], qs = [], qb = [];
      for (const p of pendingQueue) {
        qa.push(p.action);
        qs.push(p.slot);
        qb.push(p.by);
      }
      actions.splice(i, 0, ...qa);
      slots.splice(i, 0, ...qs);
      bys.splice(i, 0, ...qb);
      groups.splice(i, 0, ...qa.map(() => null));
      ends.splice(i, 0, ...qa.map(() => false));
      spills.splice(i, 0, ...pendingQueue.map((p) => p.event ? null : spillGroup));
    }
  }
  return out;
}
var capList = [[], [], []];
var capCounts = [[], [], []];
var capHooks = [[], [], []];
function capture(slot, state) {
  let pool = slot.stacks;
  capList[0] = pool.list;
  capCounts[0] = pool.counts;
  capHooks[0] = pool.hooks;
  pool = state.globalStacks;
  capList[1] = pool.list;
  capCounts[1] = pool.counts;
  capHooks[1] = pool.hooks;
  pool = state.enemyStacks;
  capList[2] = pool.list;
  capCounts[2] = pool.counts;
  capHooks[2] = pool.hooks;
}
function constBaseOf(slot, from, to) {
  const live = slot.effective;
  slot.effective = ZERO_STATS.slice();
  for (let q = 0; q < 3; q++) {
    const list = capList[q], counts = capCounts[q], hooks = capHooks[q][6];
    for (let i = 0, m = hooks.length; i < m; i++) {
      const k = hooks[i];
      const gear = list[k] === from ? to : list[k];
      ctx.buff = gear;
      ctx.stacks = counts[k];
      gear.constantStatsFn();
    }
  }
  const base = slot.effective;
  slot.effective = live;
  return base;
}
function runPhase(p, withStacks) {
  for (let q = 0; q < 3; q++) {
    const list = capList[q], counts = capCounts[q], hooks = capHooks[q][p];
    for (let i = 0, m = hooks.length; i < m; i++) {
      const k = hooks[i];
      const gear = list[k];
      ctx.buff = gear;
      if (withStacks)
        ctx.stacks = counts[k];
      gear.hookFns[p]();
    }
  }
}
function actionHook(fn) {
  if (!fn)
    return;
  ctx.buff = ctx.act;
  ctx.stacks = 1;
  fn();
}

// dist/src/engine/rotation.js
var Action = class _Action extends Gear {
  element;
  type;
  type2;
  cast;
  cast2;
  active;
  node;
  scaling;
  mv;
  energy;
  concerto;
  offtune;
  slot;
  resetEnergy;
  forte1;
  forte2;
  forte3;
  forte4;
  forte5;
  resolveFn;
  triggered;
  /** What this was built from, kept so `variant()` can rebuild it with a change or two. */
  def;
  /** Lazily-filled cache for runtime.ts's `tagWordOf()` — this action's own element/type/type2, as the
   *  one word every scoped stat contribution tests against. Engine-owned; never set by a kit. */
  _tagWord;
  constructor(name, def2 = {}) {
    super({ ...def2, name });
    this.element = def2.element ?? null;
    this.type = def2.type ?? null;
    this.type2 = def2.type2 ?? null;
    this.cast = def2.cast ?? null;
    this.cast2 = def2.cast2 ?? null;
    this.active = def2.active ?? true;
    this.node = def2.node ?? null;
    this.scaling = def2.scaling ?? null;
    this.mv = def2.mv ?? 0;
    if (this.mv !== 0 && this.scaling === null)
      throw new Error(`${name}: an action with a motion value must declare its scaling`);
    this.energy = def2.energy ?? 0;
    this.concerto = def2.concerto ?? 0;
    this.offtune = def2.offtune ?? 0;
    this.slot = def2.slot ?? null;
    this.resetEnergy = def2.resetEnergy ?? false;
    this.forte1 = def2.forte1 ?? 0;
    this.forte2 = def2.forte2 ?? 0;
    this.forte3 = def2.forte3 ?? 0;
    this.forte4 = def2.forte4 ?? 0;
    this.forte5 = def2.forte5 ?? 0;
    this.resolveFn = def2.resolve;
    this.triggered = def2.triggered ?? false;
    this.def = def2;
  }
  /** The same cast again under `overrides` — every hook and number shared, but a new Action, so
   *  the two are told apart by identity wherever it matters (a Mainslot's off-field copy of its
   *  own hit, say). */
  variant(name, overrides) {
    return new _Action(name, { ...this.def, ...overrides });
  }
  /** This cast dash-cancelled the moment it is pressed, named "… (Cancel)" — its own effects (the
   *  hooks, the cast tags) with none of its hit: no motion value, element, types, scaling, or
   *  energy/concerto/off-tune/forte. Queues the DODGE that cancels it behind itself, so a
   *  rotation writes only the cancel. */
  dodgeCancel() {
    const d = this.def;
    return new _Action(`${this.name} (Cancelled)`, {
      cast: d.cast,
      cast2: d.cast2,
      active: d.active,
      combatStart: d.combatStart,
      updateDebuffs: d.updateDebuffs,
      updateGlobal: d.updateGlobal,
      // the dodge is queued ahead of the hook, so it resolves before anything the cancelled
      // press itself queues — the dash is what interrupts the cast, not something trailing it
      updateBuffs: () => {
        queue(DODGE);
        d.updateBuffs?.();
      },
      applyStats: d.applyStats,
      convertStats: d.convertStats,
      afterAction: d.afterAction,
      lateConvertStats: d.lateConvertStats,
      display: d.display
    });
  }
  /** The same cast made on the way out, named "… (Swap)" — identical in every field, but
   *  inactive (its owner is off field by the time it lands) and reported as triggered. */
  swap() {
    return this.variant(`${this.name} (Swap)`, { triggered: true, active: false });
  }
};
var ActionGroup = class extends Action {
  actions;
  constructor(name, actions) {
    super(name);
    this.actions = actions;
  }
};
var ActionField = class {
  name;
  constructor(name) {
    this.name = name;
  }
};
var START_1 = new Action("Start of Combat (1st)");
var START_2 = new Action("Start of Combat (2nd)");
var START_3 = new Action("Start of Combat (3rd)");
var STARTS = [START_1, START_2, START_3];
var startPosition = (action) => STARTS.indexOf(action);
var NOINTRO = new Action("No Intro");
var INTRO = new Action("Intro Placeholder", {
  resolve: () => {
    const resonator = currentMember().resonator;
    if (!resonator)
      throw new Error(`${currentMember().name} casts INTRO but has no Resonator equipped`);
    return resonator.introFn();
  }
});
var ECHO_ONFIELD = new Action("Echo Placeholder (on field)", {
  resolve: () => {
    const mainslot = currentMember().mainslot;
    if (!mainslot)
      throw new Error(`${currentMember().name} casts ECHO_ONFIELD but has no Mainslot equipped`);
    return mainslot.onfield;
  }
});
var ECHO_SWAP = new Action("Echo Placeholder (swap)", {
  resolve: () => {
    const mainslot = currentMember().mainslot;
    if (!mainslot)
      throw new Error(`${currentMember().name} casts ECHO_SWAP but has no Mainslot equipped`);
    return mainslot.outro;
  }
});
var ECHO_CANCEL = new Action("Echo Placeholder (cancel)", {
  resolve: () => {
    const mainslot = currentMember().mainslot;
    if (!mainslot)
      throw new Error(`${currentMember().name} casts ECHO_CANCEL but has no Mainslot equipped`);
    return mainslot.cancel;
  }
});
var DOUBLE_INTRO = new Action("Double Intro");
var OUTRO = new Action("Outro Placeholder");
var SWAP = new Action("Swap", { active: false, triggered: true });
var DODGE = new Action("Dodge", { triggered: true });
var JUMP = new Action("Jump", { triggered: true });
var Rotation = class {
  /** What each start-of-combat section holds, by the team position it is for (START_1/2/3) —
   *  body only, without the SWAP that closes it: the scheduler emits the scramble's own swaps
   *  itself. `null` at a position this rotation declares no section for, which is most of them. */
  startCombat = [null, null, null];
  opener = null;
  intro;
  /** The DOUBLE_INTRO section: `exit` is SWAP for the swap-back form (it ran into the INTRO
   *  marker) or OUTRO for the outro-back form. */
  doubleIntro = null;
  constructor(actions) {
    let phase = "none";
    const prefix = [], loop = [], dbl = [];
    let inStart = [];
    const starts = [null, null, null];
    const body = () => phase === "opener" ? prefix : phase === "intro" ? loop : phase === "double" ? dbl : null;
    let shared = false;
    let openerExit = null, introExit = null, doubleExit = null;
    for (const action of actions) {
      if (startPosition(action) >= 0) {
        const at = startPosition(action);
        if (starts[at])
          throw new Error(`rotation: only one ${action.name} section`);
        starts[at] = [];
        inStart.push(at);
        body()?.push(action);
      } else if (action === SWAP) {
        if (inStart.length) {
          inStart = [];
          body()?.push(action);
        } else if (phase === "double") {
          doubleExit = action;
          phase = "none";
        } else
          throw new Error("rotation: SWAP only closes a start-of-combat or DOUBLE_INTRO section");
      } else if (inStart.length) {
        for (const at of inStart)
          starts[at].push(action);
        body()?.push(action);
      } else if (action === NOINTRO) {
        if (openerExit || prefix.length || shared)
          throw new Error("rotation: only one NOINTRO chain");
        if (phase !== "none")
          throw new Error("rotation: NOINTRO opens a chain while one is still open");
        phase = "opener";
      } else if (action === DOUBLE_INTRO) {
        if (doubleExit || dbl.length)
          throw new Error("rotation: only one DOUBLE_INTRO section");
        if (phase !== "none")
          throw new Error("rotation: DOUBLE_INTRO opens a chain while one is still open");
        phase = "double";
      } else if (action === INTRO) {
        if (phase === "intro") {
          loop.push(action);
          continue;
        }
        if (introExit)
          throw new Error("rotation: only one INTRO chain");
        if (phase === "opener")
          shared = true;
        if (phase === "double")
          doubleExit = SWAP;
        phase = "intro";
      } else if (action === OUTRO) {
        inStart = [];
        if (phase === "opener") {
          openerExit = action;
          phase = "none";
        } else if (phase === "intro") {
          introExit = action;
          phase = "none";
        } else if (phase === "double") {
          doubleExit = action;
          phase = "none";
        } else
          throw new Error(`rotation: ${action.name} closes a chain that was never opened`);
      } else {
        const into = body();
        if (!into)
          throw new Error(`rotation: ${action.name} sits outside any action chain`);
        into.push(action);
      }
    }
    if (inStart.length)
      throw new Error(`rotation: the ${inStart.map((at) => STARTS[at].name).join(" / ")} section is never closed by a SWAP`);
    if (phase !== "none")
      throw new Error("rotation: a chain is left open with no outro to close it");
    if (!introExit)
      throw new Error("rotation: every rotation needs an INTRO chain closed by an outro");
    this.startCombat = starts.map((cast) => cast && cast.length ? cast : null);
    if (openerExit || shared) {
      this.opener = { entry: NOINTRO, body: shared ? [...prefix, ...loop] : prefix, exit: openerExit ?? introExit };
    } else if (prefix.length) {
      throw new Error("rotation: the NOINTRO chain is closed by neither an outro nor an INTRO");
    }
    if (doubleExit)
      this.doubleIntro = { entry: DOUBLE_INTRO, body: dbl, exit: doubleExit };
    this.intro = { entry: INTRO, body: loop, exit: introExit };
  }
};
function runRotations(state, rotations, sections) {
  rotations.forEach((r, i) => {
    if (!r.doubleIntro || r.doubleIntro.exit !== SWAP)
      return;
    const prev = (i + rotations.length - 1) % rotations.length;
    if (!rotations[prev].opener) {
      throw new Error(`${state.slots[prev].name} plays during ${state.slots[i].name}'s double Intro but declares no NOINTRO chain`);
    }
  });
  const last = state.slots.length - 1;
  const out = Array.from({ length: sections }, () => []);
  let section = 0;
  const visited = /* @__PURE__ */ new Set(), scrambled = /* @__PURE__ */ new Set();
  const runChain = (i, chain) => {
    state.active = i;
    const resonator = state.slots[i].resonator;
    if (!resonator)
      throw new Error(`${state.slots[i].name} outros but has no Resonator equipped`);
    const outro = resonator.outroFn();
    state.outroDir = chain.entry === DOUBLE_INTRO ? -1 : 1;
    const skipStart = !visited.has(i) && scrambled.has(i);
    visited.add(i);
    const casts = [];
    let inStart = [];
    for (const a of chain.body) {
      const at = startPosition(a);
      if (at >= 0) {
        inStart.push(at);
        continue;
      }
      if (a === SWAP && inStart.length) {
        inStart = [];
        continue;
      }
      if (inStart.length && inStart.includes(i) && skipStart)
        continue;
      casts.push(a);
    }
    const list = chain.entry === INTRO || chain.entry === DOUBLE_INTRO ? [INTRO, ...casts, outro] : [...casts, outro];
    const snaps = run(state, list);
    state.outroDir = 1;
    if (i !== last || chain.entry === DOUBLE_INTRO) {
      out[section].push(...snaps);
      return;
    }
    const cut = snaps.findIndex((s) => s.action === outro) + 1;
    out[section].push(...snaps.slice(0, cut));
    section++;
    if (section < sections)
      out[section].push(...snaps.slice(cut));
  };
  const starters = [];
  rotations.forEach((r, i) => {
    if (r.startCombat[i])
      starters.push(i);
  });
  for (let k = 0; k < starters.length; k++) {
    const i = starters[k];
    const next = starters[k + 1] ?? 0;
    state.active = i;
    const opening = rotations[i].startCombat[i];
    const chain = next === i ? opening : [...opening, SWAP];
    out[section].push(...run(state, chain));
    state.active = next;
    scrambled.add(i);
  }
  const opener = rotations[0].opener;
  if (!opener)
    throw new Error(`${state.slots[0].name} leads the team but declares no NOINTRO chain`);
  runChain(0, opener);
  const doubled = /* @__PURE__ */ new Set();
  const visit = (i) => {
    const nxt = (i + 1) % rotations.length;
    const d = rotations[nxt].doubleIntro;
    if (d && !doubled.has(nxt)) {
      doubled.add(nxt);
      if (d.exit === OUTRO) {
        runChain(nxt, d);
      } else {
        state.active = nxt;
        out[section].push(...run(state, [INTRO, ...d.body, SWAP]));
        state.active = i;
        runChain(i, rotations[i].opener);
        return;
      }
    }
    doubled.delete(i);
    runChain(i, rotations[i].intro);
  };
  let guard = 0;
  while (section < sections) {
    if (++guard > 100)
      throw new Error("rotation scheduler did not fill every section");
    visit(state.active);
  }
  return out;
}

// dist/src/shared/tunebreak.js
var ENEMY_MAX_OFFTUNE = 392e3;
var BASE_RESISTANCE = new Gear({
  name: "Base Resistance",
  constantStats: () => {
    for (const attribute2 of [
      64,
      128,
      192,
      256,
      320,
      384,
      448
      /* Attribute.Physical */
    ]) {
      addEnemyStat(34, -20, attribute2);
    }
  }
});
var TUNE_BREAK_COOLDOWN = new Debuff({
  name: "Tune Break Cooldown",
  maxStacks: 4,
  display: () => "Tune Break Cooldown",
  updateBuffs: () => {
    if (triggeredAction() || currentAction() === TUNE_BREAK || !currentAction().active)
      return;
    if (stacksOfEnemy(TUNE_BREAK_COOLDOWN) >= 4)
      revokeEnemy(TUNE_BREAK_COOLDOWN);
    else
      applyEnemy(TUNE_BREAK_COOLDOWN, 1);
  },
  // what evaluate() is about to bank of what this action *built*, negated — last of all, once
  // every AddOfftune source has landed. What a kit puts on the bar directly (DirectOfftune,
  // Denia's half-bar surge) is not a gain the cooldown holds off.
  lateConvertStats: () => {
    const built = currentAction().offtune + getStat(
      27
      /* Stat.AddOfftune */
    );
    if (built > 0)
      addStat(28, -built * getStat(
        13
        /* Stat.OfftuneBuildup */
      ) / 100);
  }
});
var TUNE_BREAK_ENEMY = new Resonator({
  name: "Tune Break",
  enemy: true,
  element: 448,
  weapon: 0,
  // deliberately paler than any resonator's hue: it marks a row as *not* somebody's damage
  color: "#c9d2de",
  intro: () => {
    throw new Error("the enemy casts no Intro");
  },
  outro: () => {
    throw new Error("the enemy casts no Outro");
  },
  combatStart: () => equip(BASE_RESISTANCE),
  // A break drops whatever the bar overshot by and starts the cooldown, so the break's own
  // `-ENEMY_MAX_OFFTUNE` DirectOfftune lands it on empty exactly — before the drain banks, the
  // same `>=` that queues a break below.
  updateDebuffs: () => {
    if (currentAction() !== TUNE_BREAK)
      return;
    const state = currentTeam();
    if (state.offtune >= ENEMY_MAX_OFFTUNE)
      state.offtune = ENEMY_MAX_OFFTUNE;
    applyEnemy(TUNE_BREAK_COOLDOWN, 1);
  },
  // the only phase that runs after evaluate() banks the action's own off-tune, so the only one that
  // sees the bar fill in time. Not `queue`: a break falls in behind everything else this action
  // spawned, and lands on whoever is on field rather than on whoever queued it.
  // Only a real on-field press can set one off: a queued follow-up (`triggeredAction()`) and an
  // inactive action both top the bar up without breaking it, and a break never sets off another.
  // The bar stays full either way, so the next action that *is* one fires it.
  afterAction: () => {
    if (triggeredAction() || currentAction() === TUNE_BREAK || !currentAction().active)
      return;
    if (midActionGroup())
      return;
    if (stacksOfEnemy(TUNE_RUPTURE_INTERFERED) > 0 || stacksOfEnemy(TUNE_HACK_INTERFERED) > 0)
      return;
    if (isCast(
      currentAction(),
      5
      /* Cast.Liberation */
    ) || isCast(
      currentAction(),
      6
      /* Cast.Intro */
    ))
      return;
    if (currentTeam().offtune >= ENEMY_MAX_OFFTUNE)
      queueEvent(TUNE_BREAK);
  }
});
var TUNE_BREAK = new Action("Tune Break", {
  element: 448,
  scaling: 4,
  cast: 9,
  type: 36864,
  mv: 1600,
  slot: TUNE_BREAK_ENEMY.name,
  // The whole bar, straight off it: `DirectOfftune` rather than a declared `offtune`, because a
  // drain is an amount the bar moves by, not something the team's Off-Tune Buildup Rate builds
  // (see evaluate.ts's own evaluate()). Sourced to the break itself, so the off-tune panel names it.
  applyStats: () => {
    addStat(28, -ENEMY_MAX_OFFTUNE);
  }
});
function interferedWindow(def2) {
  const self2 = new Debuff({
    ...def2,
    maxStacks: 11,
    display: () => def2.name ?? "",
    updateBuffs: () => {
      if (triggeredAction() || currentAction() === TUNE_BREAK || !currentAction().active)
        return;
      if (stacksOfEnemy(self2) > 10)
        revokeEnemy(self2);
      else
        applyEnemy(self2, 1);
    }
  });
  return self2;
}
var TUNE_RUPTURE_INTERFERED = interferedWindow({ name: "Tune Rupture - Interfered" });
var TUNE_STRAIN_INTERFERED = new Debuff({ name: "Tune Strain - Interfered", maxStacks: 1 });
var TUNE_HACK_INTERFERED = interferedWindow({ name: "Tune Hack - Interfered" });
function shifting(name, interfered) {
  const self2 = new Debuff({
    name,
    updateDebuffs: () => {
      if (currentAction() !== TUNE_BREAK)
        return;
      revokeEnemy(self2);
      applyEnemy(interfered, 1);
    }
  });
  return self2;
}
var TUNE_RUPTURE_SHIFTING = shifting("Tune Rupture - Shifting", TUNE_RUPTURE_INTERFERED);
var TUNE_STRAIN_SHIFTING = shifting("Tune Strain - Shifting", TUNE_STRAIN_INTERFERED);
var TUNE_HACK_SHIFTING = shifting("Tune Hack - Shifting", TUNE_HACK_INTERFERED);
var SHIFTINGS = [TUNE_RUPTURE_SHIFTING, TUNE_STRAIN_SHIFTING, TUNE_HACK_SHIFTING];
function applyShifting(shifting2) {
  for (const other of SHIFTINGS)
    if (other !== shifting2)
      revokeEnemy(other);
  applyEnemy(shifting2, 1);
}
var applyRupture = () => applyShifting(TUNE_RUPTURE_SHIFTING);
var applyStrain = () => applyShifting(TUNE_STRAIN_SHIFTING);
var applyHack = () => applyShifting(TUNE_HACK_SHIFTING);
var tuneRuptureResponse = (action) => {
  if (currentAction() === TUNE_BREAK && applied(TUNE_RUPTURE_INTERFERED))
    queue(action);
};
var tuneHackResponse = (action) => {
  if (currentAction() === TUNE_BREAK && applied(TUNE_HACK_INTERFERED))
    queue(action);
};
function tuneStrainBonus() {
  const interfered = stacksOfEnemy(TUNE_STRAIN_INTERFERED);
  if (interfered > 0)
    addStat(19, 0.12 * getStat(
      12
      /* Stat.Tbb */
    ) * interfered);
}

// dist/src/shared/status.js
var SHIELD = new Buff({
  name: "Shield",
  maxStacks: 9999,
  convertStats: () => revokeCurrent(SHIELD)
});
var HEALS = new Buff({
  name: "Healed",
  maxStacks: 9999,
  convertStats: () => revokeCurrent(HEALS)
});
var negativeStatusActions = (name, element, type2, mvs) => [null, ...mvs.map((mv, i) => new Action(`${name} - ${i + 1} Stack${i + 1 > 1 ? "s" : ""}`, {
  element,
  type: 32768,
  type2,
  scaling: 3,
  mv
}))];
var HAVOC_BANE = new Debuff({
  name: "Havoc Bane",
  maxStacks: 3,
  applyStats: () => {
    addEnemyStat(35, 2 * frozenStacks());
  }
});
var GLACIO_CHAFE_ACTIONS = negativeStatusActions("Glacio Chafe", 256, 1310720, [
  24.5,
  44.42,
  64.34,
  84.26,
  104.17,
  124.09,
  144.01,
  163.93,
  183.85,
  203.77,
  271.69,
  339.61,
  407.53,
  475.46,
  543.38,
  611.3
]);
var GLACIO_CHAFE = new Debuff({
  name: "Glacio Chafe",
  maxStacks: 10,
  applyStats: () => {
    const held = frozenStacks();
    for (let n = Math.max(1, held - applied(GLACIO_CHAFE) + 1); n <= held; n++) {
      queue(GLACIO_CHAFE_ACTIONS[n]);
    }
  }
});
var FUSION_BURST_ACTIONS = negativeStatusActions("Fusion Burst", 192, 1048576, [
  84,
  152.29,
  220.58,
  288.88,
  357.17,
  425.46,
  493.75,
  562.04,
  630.34,
  698.63,
  931.5,
  1164.38,
  1397.26,
  1630.13,
  1863.01,
  2095.88
]);
var FUSION_BURST = new Debuff({
  name: "Fusion Burst",
  maxStacks: 10,
  // the burst takes the stacks with it and whatever landed past the cap is lost, so the target
  // rebuilds from empty. Cap is the fight's, not the declared 10.
  updateBuffs: () => {
    if (frozenStacks() < currentTeam().enemyMax(FUSION_BURST))
      return;
    queue(FUSION_BURST_ACTIONS[frozenStacks()]);
    revokeEnemy(FUSION_BURST);
  }
});
var AERO_EROSION_ACTIONS = negativeStatusActions("Aero Erosion", 64, 786432, [
  45,
  112.5,
  225,
  337.5,
  450,
  562.5,
  675,
  787.5,
  900,
  1012.5,
  1125,
  1237.5,
  1350,
  1462.5,
  1575
]);
var AERO_EROSION = new Debuff({ name: "Aero Erosion", maxStacks: 3 });
var SPECTRO_FRAZZLE_ACTIONS = negativeStatusActions("Spectro Frazzle", 320, 524288, [
  30,
  54.39,
  78.78,
  103.17,
  127.56,
  151.95,
  176.34,
  200.73,
  225.12,
  249.51,
  332.68,
  415.85,
  499.02,
  582.19,
  665.36,
  748.53
]);
var SPECTRO_FRAZZLE = new Debuff({
  name: "Spectro Frazzle",
  maxStacks: 10
});
var ELECTRO_FLARE_DMG = negativeStatusActions("Electro Flare", 128, 1572864, [
  50,
  90.65,
  131.3,
  171.95,
  212.6,
  253.25,
  293.9,
  334.55,
  375.2,
  415.85,
  554.47,
  693.08,
  831.7,
  970.32,
  1108.93,
  1247.55
]);
var ELECTRO_RAGE_ACTIONS = negativeStatusActions("Electro Rage", 128, 1572864, [
  50,
  90.65,
  131.3,
  171.95,
  212.6,
  253.25,
  293.9,
  334.55,
  375.2,
  415.85,
  554.47,
  693.08,
  831.7,
  970.32,
  1108.93,
  1247.55
]);
var ELECTRO_RAGE = new Debuff({
  name: "Electro Rage",
  maxStacks: 10,
  convertStats: () => {
    if (currentAction() === ELECTRO_RAGE_ACTIONS[frozenStacks()])
      revokeEnemy(ELECTRO_RAGE);
  }
});
var ELECTRO_FLARE = new Debuff({
  name: "Electro Flare",
  maxStacks: 10
});
var NEGATIVE_STATUSES = [HAVOC_BANE, GLACIO_CHAFE, ELECTRO_FLARE, FUSION_BURST, AERO_EROSION, SPECTRO_FRAZZLE];
var inflictedNegativeStatus = () => NEGATIVE_STATUSES.some((d) => appliedByMe(d) > 0);
var inflictedNegativeStatusBy = (member2) => NEGATIVE_STATUSES.some((d) => appliedByMember(d, member2) > 0);

// dist/src/weapons/pistol.js
var THE_LAST_DANCE = new Weapon({
  weaponType: 2,
  name: "The Last Dance",
  constantStats: () => {
    addStat(0, 500);
    addStat(10, 72);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) || casting(
      5
      /* Cast.Liberation */
    ))
      applyCurrent(SILENT_EULOGY, 1);
  }
});
var SILENT_EULOGY = new Buff({
  name: "The Last Dance: Silent Eulogy",
  applyStats: () => addStat(
    17,
    48,
    12288
    /* Type1.Skill */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SILENT_EULOGY);
  }
});
var LUX_UMBRA = new Weapon({
  weaponType: 2,
  name: "Lux & Umbra",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(10, 48.6);
    addStat(6, 12);
  },
  applyStats: () => {
    if (isHeld(TO_FIRE_SHE_RETURNS_HEAVY) && isHeld(TO_FIRE_SHE_RETURNS_ECHO))
      addStat(21, 8);
  },
  updateBuffs: () => {
    const a = currentAction();
    if (isType(
      28672
      /* Type1.Echo */
    ))
      applyCurrent(TO_FIRE_SHE_RETURNS_HEAVY, 1);
    if (isType(
      8192
      /* Type1.Heavy */
    ))
      applyCurrent(TO_FIRE_SHE_RETURNS_ECHO, 1);
  }
});
var TO_FIRE_SHE_RETURNS_HEAVY = new Buff({
  name: "Lux & Umbra: To Fire She Returns (heavy)",
  applyStats: () => addStat(
    18,
    24,
    8192
    /* Type1.Heavy */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(TO_FIRE_SHE_RETURNS_HEAVY);
  }
});
var TO_FIRE_SHE_RETURNS_ECHO = new Buff({
  name: "Lux & Umbra: To Fire She Returns (echo)",
  applyStats: () => addStat(
    18,
    24,
    28672
    /* Type1.Echo */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(TO_FIRE_SHE_RETURNS_ECHO);
  }
});
var WOODLAND_ARIA = new Weapon({
  weaponType: 2,
  name: "Woodland Aria",
  constantStats: () => {
    addStat(0, 500);
    addStat(9, 36);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (appliedByMe(AERO_EROSION)) {
      applyCurrent(LINGERING_SUMMER_TUNE, 1);
      applyEnemy(LINGERING_SUMMER_SHRED, 1);
    }
  }
});
var LINGERING_SUMMER_TUNE = new Buff({
  name: "Woodland Aria: Lingering Summer Tune",
  applyStats: () => addStat(
    17,
    24,
    64
    /* Attribute.Aero */
  )
});
var LINGERING_SUMMER_SHRED = new Debuff({
  name: "Woodland Aria: Lingering Summer Tune",
  applyStats: () => addEnemyStat(
    34,
    10,
    64
    /* Attribute.Aero */
  )
});
var SPECTRUM_BLASTER = new Weapon({
  weaponType: 2,
  name: "Spectrum Blaster",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(6, 12);
  },
  updateBuffs: () => {
    const a = currentAction();
    if (casting(
      6
      /* Cast.Intro */
    ) || isType(
      4096
      /* Type1.Basic */
    ))
      applyCurrent(ATTENDANCE_EXEMPTION, 1);
    if ((casting(
      1
      /* Cast.Basic */
    ) || casting(
      2
      /* Cast.MidAir */
    )) && (appliedByMe(TUNE_RUPTURE_SHIFTING) || appliedByMe(TUNE_STRAIN_SHIFTING)))
      applyTeam(SPECTRUM_CHORUS, 1);
  }
});
var ATTENDANCE_EXEMPTION = new Buff({
  name: "Spectrum Blaster: Attendance Exemption Protocol",
  applyStats: () => addStat(
    17,
    36,
    4096
    /* Type1.Basic */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(ATTENDANCE_EXEMPTION);
  }
});
var SPECTRUM_CHORUS = new Buff({
  name: "Spectrum Blaster: Attendance Exemption Protocol (team)",
  maxStacks: 3,
  applyStats: () => addStat(17, 8 * frozenStacks())
});
var SKULL_THRASHER = new Weapon({
  weaponType: 2,
  name: "Skull Thrasher",
  constantStats: () => {
    addStat(0, 500);
    addStat(10, 72);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ))
      applyCurrent(WAKEFUL_LONER_INTRO, 1);
    if (appliedByMe(TUNE_HACK_SHIFTING)) {
      applyCurrent(WAKEFUL_LONER_HACK, 1);
      applyTeam(WAKEFUL_LONER_TEAM, 1);
    }
  }
});
var WAKEFUL_LONER_INTRO = new Buff({
  name: "Skull Thrasher: Wakeful Loner (intro)",
  applyStats: () => addStat(
    17,
    24,
    4096
    /* Type1.Basic */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(WAKEFUL_LONER_INTRO);
  }
});
var WAKEFUL_LONER_HACK = new Buff({
  name: "Skull Thrasher: Wakeful Loner (hack)",
  applyStats: () => addStat(
    17,
    12,
    4096
    /* Type1.Basic */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(WAKEFUL_LONER_HACK);
  }
});
var WAKEFUL_LONER_TEAM = new Buff({
  name: "Skull Thrasher: Wakeful Loner (team)",
  applyStats: () => addStat(6, 24)
});
var SPECTRAL_TRIGGER = new Weapon({
  weaponType: 2,
  name: "Spectral Trigger",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(10, 48.6);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (casting(
      4
      /* Cast.Skill */
    ))
      applyCurrent(SUNKEN_DREAM_STACKS, 1);
    if (appliedByMe(TUNE_HACK_SHIFTING))
      applyCurrent(SUNKEN_DREAM_HACK, 1);
  }
});
var SUNKEN_DREAM_STACKS = new Buff({
  name: "Spectral Trigger: Sunken Dream (spectro)",
  maxStacks: 2,
  applyStats: () => addStat(
    17,
    20 * frozenStacks(),
    320
    /* Attribute.Spectro */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SUNKEN_DREAM_STACKS);
  }
});
var SUNKEN_DREAM_HACK = new Buff({
  name: "Spectral Trigger: Sunken Dream (heavy)",
  applyStats: () => {
    addStat(
      18,
      30,
      8192
      /* Type1.Heavy */
    );
    addStat(
      21,
      10,
      8192
      /* Type1.Heavy */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SUNKEN_DREAM_HACK);
  }
});

// dist/src/echoes/rinascita.js
var ACTION_SENTRY_CONSTRUCT = new Action("Echo - Sentry Construct", {
  cast: 8,
  element: 256,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 5.62
});
var SENTRY_CONSTRUCT = new Mainslot({
  name: "Sentry Construct",
  action: ACTION_SENTRY_CONSTRUCT,
  echoType: 1,
  constantStats: () => {
    addStat(
      17,
      12,
      256
      /* Attribute.Glacio */
    );
    addStat(
      17,
      12,
      12288
      /* Type1.Skill */
    );
  }
});
var FROSTY_RESOLVE_2PC = new Sonata2pc({
  name: "Frosty Resolve 2pc",
  constantStats: () => addStat(
    17,
    12,
    12288
    /* Type1.Skill */
  )
});
var FROSTY_RESOLVE_GLACIO = new Buff({
  name: "Frosty Resolve 5pc: Glacio",
  applyStats: () => addStat(
    17,
    22.5,
    256
    /* Attribute.Glacio */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(FROSTY_RESOLVE_GLACIO);
  }
});
var FROSTY_RESOLVE_SKILL_DMG = new Buff({
  name: "Frosty Resolve 5pc: Resonance Skill",
  maxStacks: 2,
  applyStats: () => addStat(
    17,
    18 * frozenStacks(),
    12288
    /* Type1.Skill */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(FROSTY_RESOLVE_SKILL_DMG);
  }
});
var FROSTY_RESOLVE_5PC = new Sonata({
  name: "Frosty Resolve 5pc",
  sonata2pc: FROSTY_RESOLVE_2PC,
  updateBuffs: () => {
    if (casting(
      4
      /* Cast.Skill */
    ))
      applyCurrent(FROSTY_RESOLVE_GLACIO, 1);
    if (casting(
      5
      /* Cast.Liberation */
    ))
      applyCurrent(FROSTY_RESOLVE_SKILL_DMG, 1);
  }
});
var ACTION_NM_HERON = new Action("Echo - Nightmare: Impermanence Heron", {
  cast: 8,
  element: 384,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 5.6
});
var NM_HERON = new Mainslot({
  name: "Nightmare: Impermanence Heron",
  action: ACTION_NM_HERON,
  echoType: 1,
  constantStats: () => {
    addStat(
      17,
      12,
      384
      /* Attribute.Havoc */
    );
    addStat(
      17,
      12,
      8192
      /* Type1.Heavy */
    );
  }
});
var ACTION_LORELEI = new Action("Echo - Lorelei", {
  cast: 8,
  element: 384,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 5.62
});
var LORELEI = new Mainslot({
  name: "Lorelei",
  action: ACTION_LORELEI,
  echoType: 1,
  constantStats: () => {
    addStat(
      17,
      12,
      384
      /* Attribute.Havoc */
    );
    addStat(
      17,
      12,
      4096
      /* Type1.Basic */
    );
  }
});
var MIDNIGHT_VEIL_2PC = new Sonata2pc({
  name: "Midnight Veil 2pc",
  constantStats: () => addStat(
    17,
    10,
    384
    /* Attribute.Havoc */
  )
});
var ACTION_MIDNIGHT_VEIL_BURST = new Action("Outro - Midnight Veil", {
  element: 384,
  scaling: 0,
  type: 24576,
  mv: 480
});
var MIDNIGHT_VEIL_HANDOFF = new Buff({
  name: "Midnight Veil (outro)",
  applyStats: () => addStat(
    17,
    15,
    384
    /* Attribute.Havoc */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(MIDNIGHT_VEIL_HANDOFF);
  }
});
var MIDNIGHT_VEIL_5PC = new Sonata({
  name: "Midnight Veil 5pc",
  sonata2pc: MIDNIGHT_VEIL_2PC,
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Outro */
    )) {
      queue(ACTION_MIDNIGHT_VEIL_BURST);
      queueOutro(MIDNIGHT_VEIL_HANDOFF);
    }
  }
});
var ACTION_DRAGON_OF_DIRGE = new Action("Echo - Dragon of Dirge", {
  cast: 8,
  element: 192,
  scaling: 0,
  type: 28672,
  mv: 36.81 * 8,
  energy: 0.51 * 8
});
var DRAGON_OF_DIRGE = new Mainslot({
  name: "Dragon of Dirge",
  action: ACTION_DRAGON_OF_DIRGE,
  echoType: 1,
  constantStats: () => {
    addStat(
      17,
      12,
      192
      /* Attribute.Fusion */
    );
    addStat(
      17,
      12,
      4096
      /* Type1.Basic */
    );
  }
});
var TIDEBREAKING_2PC = new Sonata2pc({ name: "Tidebreaking Courage 2pc", constantStats: () => addStat(11, 10) });
var TIDEBREAKING_5PC = new Sonata({
  name: "Tidebreaking Courage 5pc",
  sonata2pc: TIDEBREAKING_2PC,
  constantStats: () => addStat(6, 15),
  convertStats: () => {
    if (getStat(
      11
      /* Stat.Er */
    ) >= 250)
      addStat(17, 30);
  }
});
var ACTION_NM_HECATE = new Action("Echo - Nightmare: Hecate", {
  cast: 8,
  element: 384,
  scaling: 0,
  type: 28672,
  mv: 457.17,
  energy: 3.15
});
var NM_HECATE = new Mainslot({
  name: "Nightmare: Hecate",
  action: ACTION_NM_HECATE,
  echoType: 1,
  constantStats: () => {
    addStat(
      17,
      12,
      384
      /* Attribute.Havoc */
    );
    addStat(
      17,
      20,
      28672
      /* Type1.Echo */
    );
  }
});
var ACTION_NM_LAMPY = new Action("Echo - Nightmare: Lampylumen Myriad", {
  cast: 8,
  element: 256,
  scaling: 0,
  type: 28672,
  mv: 273.6,
  energy: 3.8
});
var NM_LAMPY = new Mainslot({
  name: "Nightmare: Lampylumen Myriad",
  action: ACTION_NM_LAMPY,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      12,
      256
      /* Attribute.Glacio */
    );
    addStat(
      17,
      30,
      262144
      /* Type2.Coordinated */
    );
  }
});
var ACTION_HECATE = new Action("Echo - Hecate", {
  cast: 8,
  element: 384,
  scaling: 0,
  type: 28672,
  mv: 45.59 * 6,
  energy: 0.63 * 6
});
var HECATE = new Mainslot({
  name: "Hecate",
  action: ACTION_HECATE,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      40,
      262144
      /* Type2.Coordinated */
    );
  }
});
var EMPYREAN_ANTHEM_2PC = new Sonata2pc({ name: "Empyrean Anthem 2pc", constantStats: () => addStat(11, 10) });
var EMPYREAN_ANTHEM_5PC = new Sonata({
  name: "Empyrean Anthem 5pc",
  sonata2pc: EMPYREAN_ANTHEM_2PC,
  constantStats: () => addStat(
    17,
    80,
    262144
    /* Type2.Coordinated */
  ),
  updateBuffs: () => {
    if (isType(
      262144
      /* Type2.Coordinated */
    ))
      applyTeam(EMPYREAN_ANTHEM_TEAM, 1);
  }
});
var EMPYREAN_ANTHEM_TEAM = new Buff({
  name: "Empyrean Anthem (team)",
  applyStats: () => {
    if (currentAction().active)
      addStat(6, 20);
  }
});
var ACTION_NM_KELPIE = new Action("Echo - Nightmare: Kelpie", {
  cast: 8,
  element: 256,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 2.81
});
var ACTION_NM_KELPIE_OUTRO = new Action("Echo - Nightmare: Kelpie (outro)", {
  element: 64,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 2.81,
  active: false
});
var NM_KELPIE = new Mainslot({
  name: "Nightmare: Kelpie",
  action: ACTION_NM_KELPIE,
  echoType: 1,
  constantStats: () => {
    addStat(
      17,
      12,
      256
      /* Attribute.Glacio */
    );
    addStat(
      17,
      12,
      64
      /* Attribute.Aero */
    );
  },
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      queue(ACTION_NM_KELPIE_OUTRO);
  }
});
var GUSTS_OF_WELKIN_TEAM = new Buff({
  name: "Gusts of Welkin (team)",
  applyStats: () => addStat(
    17,
    15,
    64
    /* Attribute.Aero */
  )
});
var GUSTS_OF_WELKIN_SELF = new Buff({
  name: "Gusts of Welkin",
  applyStats: () => addStat(
    17,
    15,
    64
    /* Attribute.Aero */
  )
});
var GUSTS_OF_WELKIN_2PC = new Sonata2pc({ name: "Gusts of Welkin 2pc", constantStats: () => addStat(
  17,
  10,
  64
  /* Attribute.Aero */
) });
var GUSTS_OF_WELKIN_5PC = new Sonata({
  name: "Gusts of Welkin 5pc",
  sonata2pc: GUSTS_OF_WELKIN_2PC,
  updateBuffs: () => {
    if (appliedByMe(AERO_EROSION)) {
      applyTeam(GUSTS_OF_WELKIN_TEAM, 1);
      applyCurrent(GUSTS_OF_WELKIN_SELF, 1);
    }
  }
});
var ACTION_FLEURDELYS = new Action("Echo - Reminiscence: Fleurdelys", {
  cast: 8,
  element: 64,
  scaling: 0,
  type: 28672,
  mv: 27.36 * 8 + 136.8,
  energy: 0.38 * 8 + 1.9
});
var FLEURDELYS = new Mainslot({
  name: "Reminiscence: Fleurdelys",
  action: ACTION_FLEURDELYS,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      10,
      64
      /* Attribute.Aero */
    );
    if (currentMember().resonator?.name === "Aero Rover")
      addStat(
        17,
        10,
        64
        /* Attribute.Aero */
      );
  }
});
var WINDWARD_2PC = new Sonata2pc({ name: "Windward Pilgrimage 2pc", constantStats: () => addStat(
  17,
  10,
  64
  /* Attribute.Aero */
) });
var WINDWARD_5PC = new Sonata({
  name: "Windward Pilgrimage 5pc",
  sonata2pc: WINDWARD_2PC,
  updateBuffs: () => {
    if (stacksOfEnemy(AERO_EROSION) > 0)
      applyCurrent(WINDWARD_BUFF, 1);
  }
});
var WINDWARD_BUFF = new Buff({
  name: "Windward Pilgrimage",
  applyStats: () => {
    addStat(9, 10);
    addStat(
      17,
      30,
      64
      /* Attribute.Aero */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(WINDWARD_BUFF);
  }
});

// dist/src/shared/mainstats.js
var ELEMENTS = [
  9,
  10,
  11,
  12,
  13,
  14
];
var MAIN = {
  [
    0
    /* Mainstat.CR4 */
  ]: [9, 22],
  [
    1
    /* Mainstat.CD4 */
  ]: [10, 44],
  [
    2
    /* Mainstat.ATK4 */
  ]: [6, 33],
  [
    3
    /* Mainstat.HP4 */
  ]: [7, 33],
  [
    4
    /* Mainstat.DEF4 */
  ]: [8, 41.8],
  [
    5
    /* Mainstat.ER3 */
  ]: [11, 32],
  [
    6
    /* Mainstat.ATK3 */
  ]: [6, 30],
  [
    7
    /* Mainstat.HP3 */
  ]: [7, 30],
  [
    8
    /* Mainstat.DEF3 */
  ]: [8, 38],
  [
    9
    /* Mainstat.Glacio3 */
  ]: [
    17,
    30,
    256
    /* Attribute.Glacio */
  ],
  [
    10
    /* Mainstat.Fusion3 */
  ]: [
    17,
    30,
    192
    /* Attribute.Fusion */
  ],
  [
    11
    /* Mainstat.Electro3 */
  ]: [
    17,
    30,
    128
    /* Attribute.Electro */
  ],
  [
    12
    /* Mainstat.Aero3 */
  ]: [
    17,
    30,
    64
    /* Attribute.Aero */
  ],
  [
    13
    /* Mainstat.Spectro3 */
  ]: [
    17,
    30,
    320
    /* Attribute.Spectro */
  ],
  [
    14
    /* Mainstat.Havoc3 */
  ]: [
    17,
    30,
    384
    /* Attribute.Havoc */
  ],
  [
    15
    /* Mainstat.ATK1 */
  ]: [6, 18],
  [
    16
    /* Mainstat.HP1 */
  ]: [7, 22.8],
  [
    17
    /* Mainstat.DEF1 */
  ]: [8, 18]
};
var SECONDARY = { 4: [3, 150], 3: [3, 100], 1: [4, 2280] };
var costOf = (key) => key <= 4 ? 4 : key <= 14 ? 3 : 1;
var label = (key) => {
  const [stat, , tag] = MAIN[key];
  const text = tag ? TAG_NAME[tag] : STAT_NAME[stat].replace("%", "");
  const word = text.includes(" ") ? text.split(" ").map((part) => part[0]).join("") : text;
  return costOf(key) === 1 ? word.toLowerCase() : word;
};
var SLOTS = 5;
var COST_CAP = 12;
function mainstats(...slots) {
  slots = [...slots].sort((a, b) => costOf(b) - costOf(a));
  const spec = slots.map((key) => `${label(key)}${costOf(key)}`).join(" ");
  if (slots.length !== SLOTS)
    throw new Error(`mainstats(${spec}): ${slots.length} echoes, expected ${SLOTS}`);
  const cost = slots.reduce((n, key) => n + costOf(key), 0);
  if (cost > COST_CAP)
    throw new Error(`mainstats(${spec}): costs ${cost}, over the ${COST_CAP} cap`);
  const totals = /* @__PURE__ */ new Map();
  const bump = (entry) => {
    const [stat, value, tag] = entry;
    const key = tag ? scopedStat(tag, stat) : stat;
    const seen = totals.get(key);
    if (seen)
      seen.value += value;
    else
      totals.set(key, { stat, tag: tag ?? null, value });
  };
  for (const key of slots) {
    bump(MAIN[key]);
    bump(SECONDARY[costOf(key)]);
  }
  const entries = [...totals.values()];
  const layout = slots.map(costOf).join("");
  return new Buff({
    name: `${layout} ${slots.map(label).join(" ")}`,
    constantStats: () => {
      for (const { stat, tag, value } of entries)
        addStat(stat, value, tag ?? void 0);
    }
  });
}
var multisets = (keys, n) => n === 0 ? [[]] : keys.flatMap((key, i) => multisets(keys.slice(i), n - 1).map((rest) => [key, ...rest]));
function mainstatOptions(...options) {
  const c4 = options.filter((key) => costOf(key) === 4);
  const c3 = options.filter((key) => costOf(key) === 3);
  const c1 = options.filter((key) => costOf(key) === 1);
  const builds = [];
  for (const four of c4)
    for (const three of multisets(c3, 2))
      for (const one of multisets(c1, 2)) {
        builds.push(mainstats(four, ...three, ...one));
      }
  if (!c3.includes(
    5
    /* Mainstat.ER3 */
  )) {
    for (const four of multisets(c4, 2))
      for (const one of multisets(c1, 3))
        builds.push(mainstats(...four, ...one));
  }
  if (c1.includes(
    16
    /* Mainstat.HP1 */
  )) {
    for (const four of c4)
      for (const one of multisets(c1, 4))
        builds.push(mainstats(four, ...one));
  }
  return builds;
}
var ones = (n) => multisets([
  15,
  16
  /* Mainstat.HP1 */
], n);
var C3_KEYS = [
  null,
  5,
  6
  /* Mainstat.ATK3 */
];
var C4_KEYS = [
  0,
  1,
  2,
  3
  /* Mainstat.HP4 */
];
var elements = (spec) => spec.includes(null) ? ELEMENTS.map((e) => spec.map((key) => key ?? e)) : [spec];
var ALL_MAINSTATS = [];
var build = (...slots) => {
  ALL_MAINSTATS.push(mainstats(...slots));
};
for (const c4 of C4_KEYS) {
  for (const pair of multisets(C3_KEYS, 2)) {
    for (const c3 of elements(pair))
      for (const c1 of ones(2))
        build(c4, ...c3, ...c1);
  }
  for (const key of C3_KEYS) {
    for (const c3 of elements([key]))
      for (const c1 of ones(3))
        build(c4, ...c3, ...c1);
  }
}
for (const c4 of multisets(C4_KEYS, 2))
  for (const c1 of ones(3))
    build(...c4, ...c1);
for (const c4 of C4_KEYS)
  for (const c1 of ones(4))
    build(c4, ...c1);
for (const c1 of ones(SLOTS))
  build(...c1);
for (const c4 of [
  0,
  1,
  4
  /* Mainstat.DEF4 */
])
  build(
    c4,
    5,
    5,
    17,
    17
    /* Mainstat.DEF1 */
  );

// dist/src/shared/substats.js
var ROLL = {
  [
    9
    /* Stat.CritRate */
  ]: 7.5,
  [
    10
    /* Stat.CritDmg */
  ]: 15,
  [
    11
    /* Stat.Er */
  ]: 8.4,
  [
    6
    /* Stat.BonusAtk */
  ]: 7.9,
  [
    3
    /* Stat.FlatAtk */
  ]: 40,
  [
    7
    /* Stat.BonusHp */
  ]: 7.9,
  [
    4
    /* Stat.FlatHp */
  ]: 430,
  [
    8
    /* Stat.BonusDef */
  ]: 10,
  [
    5
    /* Stat.FlatDef */
  ]: 50,
  [
    17
    /* Stat.DmgBonus */
  ]: 7.9
};
var ROLLS_PER_BUILD = 25;
var TYPE_KEYS = {
  basic: 4096,
  heavy: 8192,
  skill: 12288,
  liberation: 16384
};
var TYPES = Object.keys(TYPE_KEYS);
var SCALER_STATS = { atk: [
  6,
  3
  /* Stat.FlatAtk */
], hp: [
  7,
  4
  /* Stat.FlatHp */
], def: [
  8,
  5
  /* Stat.FlatDef */
] };
var SCALERS = Object.keys(SCALER_STATS);
function substats(name, counts) {
  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  if (total !== ROLLS_PER_BUILD) {
    throw new Error(`substats("${name}"): ${total} rolls, a build has ${ROLLS_PER_BUILD}`);
  }
  const entries = Object.entries(counts).map(([key, n]) => {
    const [stat, tag] = splitStat(Number(key));
    const roll = ROLL[stat];
    if (roll === void 0)
      throw new Error(`substats("${name}"): nothing rolls "${key}"`);
    return { stat, tag, value: roll * n };
  });
  return new Buff({
    name,
    constantStats: () => {
      for (const { stat, tag, value } of entries)
        addStat(stat, value, tag ?? void 0);
    }
  });
}
function chem(scaler, type, { er = false } = {}) {
  if (!(scaler in SCALER_STATS))
    throw new Error(`chem(): nothing scales off "${scaler}"`);
  const counts = {
    [
      9
      /* Stat.CritRate */
    ]: er ? 2 : 5,
    [
      10
      /* Stat.CritDmg */
    ]: 5,
    [
      11
      /* Stat.Er */
    ]: er ? 5 : 2
  };
  for (const [key, [pct, flat]] of Object.entries(SCALER_STATS)) {
    counts[pct] = counts[flat] = key === scaler ? 2 : 1;
  }
  for (const [key, tag] of Object.entries(TYPE_KEYS)) {
    counts[scopedStat(
      tag,
      17
      /* Stat.DmgBonus */
    )] = key === type ? 2 : 1;
  }
  return substats(`Chem Substats -${er ? " ER" : ""} ${scaler} ${type}`, counts);
}
var ALL_SUBSTATS = [];
for (const scaler of SCALERS) {
  for (const type of TYPES) {
    ALL_SUBSTATS.push(chem(scaler, type));
    ALL_SUBSTATS.push(chem(scaler, type, { er: true }));
  }
}

// dist/src/weapons/standard.js
function ceaselessAria(name) {
  const buff = new Buff({
    name: `${name}: Ceaseless Aria R5`,
    maxStacks: 2,
    applyStats: () => {
      if (frozenStacks() === 1 && casting(
        4
        /* Cast.Skill */
      )) {
        applyCurrent(buff, 1);
        addStat(26, 16);
      } else if (frozenStacks() === 2 && casting(
        7
        /* Cast.Outro */
      ))
        removeStack(buff, 2);
    },
    display: () => `${name}: Ceaseless Aria R5${frozenStacks() === 1 ? "" : " (cooldown)"}`
  });
  return buff;
}
function concertoWeapon(name, weaponType) {
  const aria = ceaselessAria(name);
  return new Weapon({
    weaponType,
    standard: true,
    name: `${name} R5`,
    constantStats: () => {
      addStat(0, 337.5);
      addStat(11, 51.84);
    },
    updateBuffs: () => {
      if (casting(
        4
        /* Cast.Skill */
      ))
        applyCurrent(aria, 1);
    }
  });
}
var VARIATION = concertoWeapon(
  "Variation",
  4
  /* WeaponType.Rectifier */
);
var MARCATO = concertoWeapon(
  "Marcato",
  3
  /* WeaponType.Gauntlets */
);
var CADENZA = concertoWeapon(
  "Cadenza",
  2
  /* WeaponType.Pistols */
);
var OVERTURE = concertoWeapon(
  "Overture",
  0
  /* WeaponType.Sword */
);
var DISCORD = concertoWeapon(
  "Discord",
  1
  /* WeaponType.Broadblade */
);
var STATIC_MIST = new Weapon({
  weaponType: 2,
  standard: true,
  name: "Static Mist",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(11, 12.8);
  },
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      queueOutro(STATIC_MIST_HANDOFF);
  }
});
var STATIC_MIST_HANDOFF = new Buff({
  name: "Static Mist: Stormy Resolution",
  applyStats: () => addStat(6, 10),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(STATIC_MIST_HANDOFF);
  }
});
var EMERALD_OF_GENESIS = new Weapon({
  weaponType: 0,
  standard: true,
  name: "Emerald of Genesis",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(11, 12.8);
  },
  updateBuffs: () => {
    if (casting(
      4
      /* Cast.Skill */
    ))
      applyCurrent(EOG_STACKS, 1);
  }
});
var EOG_STACKS = new Buff({
  name: "Emerald of Genesis: Stormy Resolution",
  maxStacks: 2,
  applyStats: () => addStat(6, 6 * frozenStacks()),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(EOG_STACKS);
  }
});
var COSMIC_RIPPLES = new Weapon({
  weaponType: 4,
  standard: true,
  name: "Cosmic Ripples",
  constantStats: () => {
    addStat(0, 500);
    addStat(6, 54);
    addStat(11, 12.8);
  },
  updateBuffs: () => {
    if (isType(
      4096
      /* Type1.Basic */
    ))
      applyCurrent(COSMIC_RIPPLES_STACKS, 1);
  }
});
var COSMIC_RIPPLES_STACKS = new Buff({
  name: "Cosmic Ripples: Stormy Resolution",
  maxStacks: 5,
  applyStats: () => addStat(
    17,
    3.2 * frozenStacks(),
    4096
    /* Type1.Basic */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(COSMIC_RIPPLES_STACKS);
  }
});
var ABYSS_SURGES = new Weapon({
  weaponType: 3,
  standard: true,
  name: "Abyss Surges",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(6, 36.45);
    addStat(11, 12.8);
  },
  updateBuffs: () => {
    if (isType(
      12288
      /* Type1.Skill */
    ))
      applyCurrent(ABYSS_SKILL_HIT, 1);
    if (isType(
      4096
      /* Type1.Basic */
    ))
      applyCurrent(ABYSS_BASIC_HIT, 1);
  }
});
var ABYSS_SKILL_HIT = new Buff({
  name: "Abyss Surges: Stormy Resolution",
  applyStats: () => addStat(
    17,
    10,
    4096
    /* Type1.Basic */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(ABYSS_SKILL_HIT);
  }
});
var ABYSS_BASIC_HIT = new Buff({
  name: "Abyss Surges: Stormy Resolution",
  applyStats: () => addStat(
    17,
    10,
    12288
    /* Type1.Skill */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(ABYSS_BASIC_HIT);
  }
});
var LUSTROUS_RAZOR = new Weapon({
  weaponType: 1,
  standard: true,
  name: "Lustrous Razor",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(6, 36.45);
    addStat(11, 12.8);
  },
  updateBuffs: () => {
    if (casting(
      4
      /* Cast.Skill */
    ))
      applyCurrent(LUSTROUS_RAZOR_STACKS, 1);
  }
});
var LUSTROUS_RAZOR_STACKS = new Buff({
  name: "Lustrous Razor: Stormy Resolution",
  maxStacks: 3,
  applyStats: () => addStat(
    17,
    7 * frozenStacks(),
    16384
    /* Type1.Liberation */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(LUSTROUS_RAZOR_STACKS);
  }
});
var hitInterfered = () => currentAction().mv > 0 && stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0;
var NEW_STD_BRAUDBLADE = new Weapon({
  weaponType: 1,
  standard: true,
  name: "Radiance Cleaver",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(10, 48.6);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (hitInterfered())
      applyCurrent(EDGE_BREAKER_BUFF, 1);
  }
});
var EDGE_BREAKER_BUFF = new Buff({
  name: "Radiance Cleaver: Edge Breaker",
  applyStats: () => addStat(
    17,
    24,
    16384
    /* Type1.Liberation */
  )
});
var NEW_STD_GAUNTLET = new Weapon({
  weaponType: 3,
  standard: true,
  name: "Pulsation Bracer",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (hitInterfered())
      applyCurrent(BARRIER_BREACHER_STACKS, 1);
  }
});
var BARRIER_BREACHER_STACKS = new Buff({
  name: "Pulsation Bracer: Barrier Breacher",
  maxStacks: 4,
  applyStats: () => addStat(
    17,
    6 * frozenStacks(),
    4096
    /* Type1.Basic */
  )
});
var NEW_STD_SWORD = new Weapon({
  weaponType: 0,
  standard: true,
  name: "Laser Shearer",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(11, 38.88);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (hitInterfered())
      applyCurrent(SIGNAL_CATCHER_BUFF, 1);
  }
});
var SIGNAL_CATCHER_BUFF = new Buff({
  name: "Laser Shearer: Signal Catcher",
  applyStats: () => addStat(
    17,
    24,
    12288
    /* Type1.Skill */
  )
});
var BLOODPACTS_PLEDGE = new Weapon({
  weaponType: 0,
  standard: true,
  name: "Bloodpact's Pledge R5",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(11, 38.88);
  },
  updateBuffs: () => {
    if (applied(HEALS))
      applyCurrent(HARMONIOUS_VIBRANCY, 1);
  }
});
var HARMONIOUS_VIBRANCY = new Buff({
  name: "Bloodpact's Pledge R5: Harmonious Vibrancy",
  applyStats: () => addStat(
    17,
    26,
    12288
    /* Type1.Skill */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(HARMONIOUS_VIBRANCY);
  }
});
var BLOODPACT_AERO_AMP = new Buff({
  name: "Bloodpact's Pledge R5: Harmonious Vibrancy (team)",
  applyStats: () => {
    if (currentAction().active)
      addStat(
        18,
        26,
        64
        /* Attribute.Aero */
      );
  }
});
var NEW_STD_RECTIFIER = new Weapon({
  weaponType: 4,
  standard: true,
  name: "Boson Astrolabe",
  constantStats: () => {
    addStat(0, 525);
    addStat(11, 38.88);
    addStat(6, 12);
  },
  updateGlobal: () => {
    if (casting(
      9
      /* Cast.TuneBreak */
    ))
      applyCurrent(PATH_OBSERVER_BUFF, 1);
  }
});
var PATH_OBSERVER_BUFF = new Buff({
  name: "Boson Astrolabe: Path Observer",
  applyStats: () => {
    addStat(6, 12);
    addStat(
      17,
      12,
      4096
      /* Type1.Basic */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(PATH_OBSERVER_BUFF);
  }
});
var NEW_STD_PISTOL = new Weapon({
  weaponType: 2,
  standard: true,
  name: "Phasic Homogenizer",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(10, 48.6);
    addStat(6, 12);
  },
  updateGlobal: () => {
    if (casting(
      9
      /* Cast.TuneBreak */
    ))
      applyCurrent(INSIGHT_BEARER_BUFF, 1);
  }
});
var INSIGHT_BEARER_BUFF = new Buff({
  name: "Phasic Homogenizer: Insight Bearer",
  applyStats: () => addStat(17, 20),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(INSIGHT_BEARER_BUFF);
  }
});

// dist/src/shared/helpers.js
function lostOnSwap() {
  if (!currentAction().active)
    revokeCurrent(currentGear());
}
function handoffWindow(buff) {
  const mine = currentTeam().slot === currentMember();
  if (frozenStacks() < 2) {
    if (mine && casting(
      7
      /* Cast.Outro */
    ))
      applyCurrent(buff, 1);
    return;
  }
  if (!mine && !casting(
    6
    /* Cast.Intro */
  ))
    revokeCurrent(buff);
}
function handoff(name, applyStats) {
  const buff = new Buff({
    name,
    maxStacks: 2,
    applyStats,
    // the second stack is bookkeeping, not a doubled payout — no "x2" in the report
    display: () => name,
    updateGlobal: () => handoffWindow(buff)
  });
  return buff;
}
function coordinatedBuff(name, stacks, owner, tick, { enemy = false, hits = 1, every = 1, applyStats } = {}) {
  const fire = () => {
    if (!currentAction().active || triggeredAction() || casting(
      5
      /* Cast.Liberation */
    ))
      return;
    const summons = (frozenStacks() - 1) % every === 0 ? hits : 0;
    if (owner === null) {
      for (let k = 0; k < summons; k++)
        queue(tick);
      removeStack(buff, 1);
    } else {
      for (let k = 0; k < summons; k++)
        queueOn(owner(), tick);
      (enemy ? removeStackEnemy : removeStackTeam)(buff, 1);
    }
  };
  const buff = new Buff({
    name,
    maxStacks: stacks,
    applyStats,
    // the window *is* the field standing, so granting it is what the report files the summons
    // under — named off the tick's own declaration rather than asked for twice
    field: tick.field,
    // the count reads as the seconds the field has left, one qualifying press to the second —
    // `every` spaces the summons out, it doesn't shorten the stand — so Jué's fresh window says
    // (15s) and Rebecca's turret (14s), not a bare count that means nothing beside them
    display: () => `${name} (${frozenStacks()}s)`,
    ...owner === null ? { updateGlobal: fire } : { updateBuffs: fire }
  });
  return buff;
}
var matrix = (resonator, totalDmg, def2 = {}) => new Matrix({
  name: `${resonator}: Matrix`,
  constantStats: () => {
    if (totalDmg)
      addStat(19, totalDmg / 1.2);
  },
  ...def2
});

// dist/src/echoes/jinzhou.js
var ACTION_BELL_BORNE = new Action("Echo - Bell-Borne Geochelone", {
  cast: 8,
  element: 256,
  scaling: 2,
  type: 28672,
  mv: 145.92,
  energy: 4.55,
  updateBuffs: () => applyTeam(BELL_BORNE_SHIELD, 2)
});
var BELL_BORNE_GEOCHELONE = new Mainslot({
  name: "Bell-Borne Geochelone",
  action: ACTION_BELL_BORNE,
  echoType: 0
});
var BELL_BORNE_SHIELD = new Buff({
  name: "Bell-Borne Geochelone: Bell-Borne Shield",
  maxStacks: 2,
  // no "xN" suffix — the DMG Bonus is flat regardless of charge count
  display: () => BELL_BORNE_SHIELD.name,
  applyStats: () => addStat(17, 10),
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      removeStackTeam(BELL_BORNE_SHIELD, 1);
  }
});
var ACTION_HERON = new Action("Echo - Impermanence Heron", {
  cast: 8,
  element: 384,
  scaling: 0,
  type: 28672,
  mv: 310.56,
  energy: 14.85,
  // TODO check 10 er on hit
  updateBuffs: () => queueOutro(HERON_HANDOFF)
});
var HERON = new Mainslot({
  name: "Impermanence Heron",
  action: ACTION_HERON,
  echoType: 1
});
var HERON_HANDOFF = handoff("Impermanence Heron: Outro", () => addStat(17, 12));
var ACTION_STONEWALL_BRACER = new Action("Echo - Stonewall Bracer", {
  cast: 8,
  element: 448,
  scaling: 0,
  type: 28672,
  mv: 281.6,
  energy: 4.4,
  updateDebuffs: () => applyCurrent(SHIELD, 1)
});
var STONEWALL_BRACER = new Mainslot({
  name: "Stonewall Bracer",
  action: ACTION_STONEWALL_BRACER,
  echoType: 1
});
var MOONLIT_CLOUDS_2PC = new Sonata2pc({ name: "Moonlit Clouds 2pc", constantStats: () => addStat(11, 10) });
var MOONLIT_CLOUDS_5PC = new Sonata({
  name: "Moonlit Clouds 5pc",
  sonata2pc: MOONLIT_CLOUDS_2PC,
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      queueOutro(MOONLIT_CLOUDS_HANDOFF);
  }
});
var MOONLIT_CLOUDS_HANDOFF = handoff("Moonlit Clouds (outro)", () => addStat(6, 22.5));
var REJUV_2PC = new Sonata2pc({ name: "Rejuvenating Glow 2pc", constantStats: () => addStat(23, 10) });
var REJUV_5PC = new Sonata({
  name: "Rejuvenating Glow 5pc",
  sonata2pc: REJUV_2PC,
  updateBuffs: () => {
    if (applied(HEALS))
      applyTeam(REJUV_TEAM, 1);
  }
});
var REJUV_TEAM = new Buff({ name: "Rejuvenating Glow (team)", applyStats: () => addStat(6, 15) });
var MOLTEN_RIFT_2PC = new Sonata2pc({ name: "Molten Rift 2pc", constantStats: () => addStat(
  17,
  10,
  192
  /* Attribute.Fusion */
) });
var MOLTEN_RIFT_5PC = new Sonata({
  name: "Molten Rift 5pc",
  sonata2pc: MOLTEN_RIFT_2PC,
  updateBuffs: () => {
    if (casting(
      4
      /* Cast.Skill */
    ))
      applyCurrent(MOLTEN_RIFT_BUFF, 1);
  }
});
var MOLTEN_RIFT_BUFF = new Buff({
  name: "Molten Rift",
  applyStats: () => addStat(
    17,
    30,
    192
    /* Attribute.Fusion */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(MOLTEN_RIFT_BUFF);
  }
});
var ACTION_NM_INFERNO_RIDER = new Action("Echo - Nightmare: Inferno Rider", {
  cast: 8,
  element: 192,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 5.62
});
var NM_INFERNO_RIDER = new Mainslot({
  name: "Nightmare: Inferno Rider",
  action: ACTION_NM_INFERNO_RIDER,
  echoType: 1,
  constantStats: () => {
    addStat(
      17,
      12,
      192
      /* Attribute.Fusion */
    );
    addStat(
      17,
      12,
      12288
      /* Type1.Skill */
    );
  }
});
var ACTION_INFERNO_RIDER = new Action("Echo - Inferno Rider", {
  cast: 8,
  element: 192,
  scaling: 0,
  type: 28672,
  mv: 252.4 + 282.8 * 2,
  energy: 3.78 + 4.41 * 2,
  updateBuffs: () => applyCurrent(INFERNO_RIDER_WINDOW, 1)
});
var INFERNO_RIDER_WINDOW = new Buff({
  name: "Inferno Rider",
  applyStats: () => {
    addStat(
      17,
      12,
      192
      /* Attribute.Fusion */
    );
    addStat(
      17,
      12,
      4096
      /* Type1.Basic */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(INFERNO_RIDER_WINDOW);
  }
});
var INFERNO_RIDER = new Mainslot({
  name: "Inferno Rider",
  action: ACTION_INFERNO_RIDER,
  echoType: 1
});
var ACTION_NM_CROWNLESS = new Action("Echo - Nightmare: Crownless", {
  cast: 8,
  element: 384,
  scaling: 0,
  type: 28672,
  mv: 264.6,
  energy: 3.67
});
var NM_CROWNLESS = new Mainslot({
  name: "Nightmare: Crownless",
  action: ACTION_NM_CROWNLESS,
  echoType: 1,
  constantStats: () => {
    addStat(
      17,
      12,
      384
      /* Attribute.Havoc */
    );
    addStat(
      17,
      12,
      4096
      /* Type1.Basic */
    );
  }
});
var ACTION_CROWNLESS = new Action("Echo - Nightmare: Crownless", {
  cast: 8,
  element: 384,
  scaling: 0,
  type: 28672,
  mv: 134.08 * 2,
  energy: 2.09 * 2,
  updateBuffs: () => applyCurrent(CROWNLESS_WINDOW, 1)
});
var CROWNLESS_WINDOW = new Buff({
  name: "Crownless",
  applyStats: () => {
    addStat(
      17,
      12,
      384
      /* Attribute.Havoc */
    );
    addStat(
      17,
      12,
      12288
      /* Type1.Skill */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(CROWNLESS_WINDOW);
  }
});
var CROWNLESS = new Mainslot({
  name: "Crownless",
  action: ACTION_CROWNLESS,
  echoType: 1
});
var HAVOC_ECLIPSE_2PC = new Sonata2pc({ name: "Havoc Eclipse 2pc", constantStats: () => addStat(
  17,
  10,
  384
  /* Attribute.Havoc */
) });
var HAVOC_ECLIPSE_5PC = new Sonata({
  name: "Havoc Eclipse 5pc",
  sonata2pc: HAVOC_ECLIPSE_2PC,
  updateBuffs: () => {
    const a = currentAction();
    if (isType(
      4096
      /* Type1.Basic */
    ) || isType(
      8192
      /* Type1.Heavy */
    ))
      applyCurrent(HAVOC_ECLIPSE_STACKS, 1);
  }
});
var HAVOC_ECLIPSE_STACKS = new Buff({
  name: "Havoc Eclipse",
  maxStacks: 4,
  applyStats: () => addStat(
    17,
    7.5 * frozenStacks(),
    384
    /* Attribute.Havoc */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(HAVOC_ECLIPSE_STACKS);
  }
});
var ACTION_LAMPYLUMEN_MYRIAD = new Action("Echo - Lampylumen Myriad", {
  cast: 8,
  element: 256,
  scaling: 0,
  type: 28672,
  mv: 667.2,
  energy: 3.12 * 2 + 4.17,
  // 200.16%+200.16%+266.88%
  updateBuffs: () => applyCurrent(LAMPYLUMEN_MYRIAD_STACKS, 3)
});
var LAMPYLUMEN_MYRIAD_STACKS = new Buff({
  name: "Lampylumen Myriad",
  maxStacks: 3,
  applyStats: () => {
    addStat(
      17,
      4 * frozenStacks(),
      256
      /* Attribute.Glacio */
    );
    addStat(
      17,
      4 * frozenStacks(),
      12288
      /* Type1.Skill */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(LAMPYLUMEN_MYRIAD_STACKS);
  }
});
var LAMPYLUMEN_MYRIAD = new Mainslot({
  name: "Lampylumen Myriad",
  action: ACTION_LAMPYLUMEN_MYRIAD,
  echoType: 1
});
var FREEZING_FROST_2PC = new Sonata2pc({ name: "Freezing Frost 2pc", constantStats: () => addStat(
  17,
  10,
  256
  /* Attribute.Glacio */
) });
var FREEZING_FROST_5PC = new Sonata({
  name: "Freezing Frost 5pc",
  sonata2pc: FREEZING_FROST_2PC,
  updateBuffs: () => {
    const a = currentAction();
    if (isType(
      4096
      /* Type1.Basic */
    ) || isType(
      8192
      /* Type1.Heavy */
    ))
      applyCurrent(FREEZING_FROST_STACKS, 1);
  }
});
var FREEZING_FROST_STACKS = new Buff({
  name: "Freezing Frost",
  maxStacks: 3,
  applyStats: () => addStat(
    17,
    10 * frozenStacks(),
    256
    /* Attribute.Glacio */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(FREEZING_FROST_STACKS);
  }
});
var ACTION_NM_FEILIAN_BERINGAL = new Action("Echo - Nightmare: Feilian Beringal", {
  cast: 8,
  element: 64,
  scaling: 0,
  type: 28672,
  mv: 273.56,
  energy: 2.28 + 0.3 * 5
  // 164.16%+21.88%x5
});
var NM_FEILIAN_BERINGAL = new Mainslot({
  name: "Nightmare: Feilian Beringal",
  action: ACTION_NM_FEILIAN_BERINGAL,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      12,
      64
      /* Attribute.Aero */
    );
    addStat(
      17,
      12,
      8192
      /* Type1.Heavy */
    );
  }
});
var SIERRA_GALE_2PC = new Sonata2pc({ name: "Sierra Gale 2pc", constantStats: () => addStat(
  17,
  10,
  64
  /* Attribute.Aero */
) });
var SIERRA_GALE_5PC = new Sonata({
  name: "Sierra Gale 5pc",
  sonata2pc: SIERRA_GALE_2PC,
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ))
      applyCurrent(SIERRA_GALE_INTRO, 1);
  }
});
var SIERRA_GALE_INTRO = new Buff({
  name: "Sierra Gale",
  applyStats: () => addStat(
    17,
    30,
    64
    /* Attribute.Aero */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SIERRA_GALE_INTRO);
  }
});
var ACTION_JUE = new Action("Echo - Ju\xE9", {
  cast: 8,
  element: 320,
  scaling: 0,
  type: 28672,
  mv: 48.64 * 2 + 19.46 * 5,
  energy: 0.76 * 2 + 0.3 * 5,
  updateBuffs: () => applyCurrent(JUE_BLESSING, 15)
});
var JUE_FIELD = new ActionField("Ju\xE9: Blessing of Time");
var ACTION_JUE_TICK = new Action("Echo - Ju\xE9: Blessing of Time", {
  element: 320,
  scaling: 0,
  type: 12288,
  mv: 16,
  active: false,
  field: JUE_FIELD
});
var JUE_BLESSING = coordinatedBuff("Ju\xE9: Blessing of Time", 15, null, ACTION_JUE_TICK, {
  applyStats: () => addStat(
    17,
    16,
    12288
    /* Type1.Skill */
  )
});
var JUE = new Mainslot({
  name: "Ju\xE9",
  action: ACTION_JUE,
  echoType: 0
});
var CELESTIAL_LIGHT_2PC = new Sonata2pc({ name: "Celestial Light 2pc", constantStats: () => addStat(
  17,
  10,
  320
  /* Attribute.Spectro */
) });
var CELESTIAL_LIGHT_5PC = new Sonata({
  name: "Celestial Light 5pc",
  sonata2pc: CELESTIAL_LIGHT_2PC,
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ))
      applyCurrent(CELESTIAL_LIGHT_INTRO, 1);
  }
});
var CELESTIAL_LIGHT_INTRO = new Buff({
  name: "Celestial Light",
  applyStats: () => addStat(
    17,
    30,
    320
    /* Attribute.Spectro */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(CELESTIAL_LIGHT_INTRO);
  }
});
var ACTION_MECH_ABOMINATION = new Action("Echo - Mech Abomination", {
  cast: 8,
  element: 128,
  scaling: 0,
  type: 28672,
  mv: 48.64,
  energy: 0.76,
  updateBuffs: () => {
    applyCurrent(MECH_ABOMINATION_ATK, 1);
    queue(ACTION_MECH_WASTE);
  }
});
var ACTION_MECH_WASTE = new Action("Echo - Mech Abomination: Mech Waste", {
  cast: 8,
  element: 128,
  scaling: 0,
  type: 24576,
  mv: 480,
  energy: 1.52
});
var MECH_ABOMINATION_ATK = new Buff({
  name: "Mech Abomination",
  applyStats: () => addStat(6, 12),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(MECH_ABOMINATION_ATK);
  }
});
var MECH_ABOMINATION = new Mainslot({
  name: "Mech Abomination",
  action: ACTION_MECH_ABOMINATION,
  echoType: 1
});
var LINGERING_TUNES_2PC = new Sonata2pc({ name: "Lingering Tunes 2pc", constantStats: () => addStat(6, 10) });
var LINGERING_TUNES_5PC = new Sonata({
  name: "Lingering Tunes 5pc",
  sonata2pc: LINGERING_TUNES_2PC,
  constantStats: () => addStat(
    17,
    60,
    24576
    /* Type1.Outro */
  ),
  // the 1.5s cadence stands in for real on-field presses, so a queued follow-up, a status rung or
  // the shared Tune Break — active casts on the wearer's slot, but not them acting again — don't
  // advance it
  updateBuffs: () => {
    if (!triggeredAction() && currentAction().active)
      applyCurrent(LINGERING_TUNES_STACKS, 1);
  }
});
var LINGERING_TUNES_STACKS = new Buff({
  name: "Lingering Tunes",
  maxStacks: 8,
  applyStats: () => addStat(6, 5 * Math.floor(frozenStacks() / 2)),
  updateBuffs: () => lostOnSwap(),
  display: () => `Lingering Tunes x${Math.ceil(frozenStacks() / 2)}`
});
var ACTION_NM_MEPHIS = new Action("Echo - Nightmare: Thundering Mephis", {
  cast: 8,
  element: 128,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 5.62
});
var NM_MEPHIS = new Mainslot({
  name: "Nightmare: Thundering Mephis",
  action: ACTION_NM_MEPHIS,
  echoType: 1,
  constantStats: () => {
    addStat(
      17,
      12,
      128
      /* Attribute.Electro */
    );
    addStat(
      17,
      12,
      16384
      /* Type1.Liberation */
    );
  }
});
var ACTION_NM_TEMPEST_MEPHIS = new Action("Echo - Nightmare: Tempest Mephis", {
  cast: 8,
  element: 128,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 5.62
});
var NM_TEMPEST_MEPHIS = new Mainslot({
  name: "Nightmare: Tempest Mephis",
  action: ACTION_NM_TEMPEST_MEPHIS,
  echoType: 1,
  constantStats: () => {
    addStat(
      17,
      12,
      128
      /* Attribute.Electro */
    );
    addStat(
      17,
      12,
      12288
      /* Type1.Skill */
    );
  }
});
var VOID_THUNDER_2PC = new Sonata2pc({ name: "Void Thunder 2pc", constantStats: () => addStat(
  17,
  10,
  128
  /* Attribute.Electro */
) });
var VOID_THUNDER_STACKS = new Buff({
  name: "Void Thunder 5pc: Electro",
  maxStacks: 2,
  applyStats: () => addStat(
    17,
    15 * frozenStacks(),
    128
    /* Attribute.Electro */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(VOID_THUNDER_STACKS);
  }
});
var VOID_THUNDER_5PC = new Sonata({
  name: "Void Thunder 5pc",
  sonata2pc: VOID_THUNDER_2PC,
  updateBuffs: () => {
    if (casting(
      3
      /* Cast.Heavy */
    ) || casting(
      4
      /* Cast.Skill */
    ))
      applyCurrent(VOID_THUNDER_STACKS, 1);
  }
});
var ACTION_FALLACY = new Action("Echo - Fallacy of No Return", {
  cast: 8,
  element: 320,
  scaling: 1,
  type: 28672,
  mv: 15.85,
  energy: 3.04,
  updateBuffs: () => applyTeam(FALLACY_TEAM, 1)
});
var FALLACY_TEAM = new Buff({ name: "Fallacy of No Return (team)", applyStats: () => addStat(6, 10) });
var FALLACY = new Mainslot({
  name: "Fallacy of No Return",
  action: ACTION_FALLACY,
  echoType: 0,
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ))
      revokeTeam(FALLACY_TEAM);
  },
  applyStats: () => {
    if (stacksOfTeam(FALLACY_TEAM))
      addStat(11, 10);
  }
});

// dist/src/resonators/aero/ciaccona.js
function ciacconaAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA1 = ciacconaAction("Basic - Quadruple Time Steps 1", { node: 0, cast: 1, type: 4096, mv: 57.06, energy: 0.88, concerto: 2.8, offtune: 2800 });
var BA2 = ciacconaAction("Basic - Quadruple Time Steps 2", { node: 0, cast: 1, type: 4096, mv: 163.04, energy: 2.51, concerto: 8, offtune: 8e3 });
var BA3 = ciacconaAction("Basic - Quadruple Time Steps 3", { node: 0, cast: 1, type: 4096, mv: 132.08, energy: 2.04, concerto: 6.48, offtune: 6480 });
var EROSION = { updateDebuffs: () => applyEnemy(AERO_EROSION, 1) };
var BA4 = ciacconaAction("Basic - Quadruple Time Steps 4", {
  node: 0,
  cast: 1,
  type: 4096,
  mv: 244.56,
  energy: 3.76,
  concerto: 12,
  offtune: 12e3,
  forte1: 1,
  ...EROSION,
  updateBuffs: () => applyTeam(SOLO_CONCERT, 1)
});
var HA = ciacconaAction("Heavy - Attack", { node: 0, cast: 3, type: 8192, mv: 107.6, energy: 1.65, concerto: 5.28, offtune: 5280 });
var AimedShot = ciacconaAction("Heavy - Aimed Shot", { node: 0, cast: 3, type: 8192, mv: 32.61, energy: 0.5, concerto: 1.6, offtune: 1600 });
var ChargedShot = ciacconaAction("Heavy - Fully Charged Aimed Shot", { node: 0, cast: 3, type: 8192, mv: 73.37, energy: 1.13, concerto: 3.6, offtune: 3600 });
var MA1 = ciacconaAction("Mid-air - Attack 1", { node: 0, cast: 2, type: 4096, mv: 110.86, energy: 1.7, concerto: 5.44, offtune: 5440 });
var MA2 = ciacconaAction("Mid-air - Attack 2", { node: 0, cast: 2, type: 4096, mv: 97.84, energy: 1.52, concerto: 4.8, offtune: 4800 });
var DC = ciacconaAction("Dodge Counter - Quadruple Time Steps", { node: 0, cast: 0, type: 4096, mv: 228.68, energy: 2.04, concerto: 16.48, offtune: 6480 });
var Skill = ciacconaAction("Skill - Harmonic Allegro", { node: 1, cast: 4, type: 12288, mv: 161.56, energy: 9.6, concerto: 15, offtune: 5e3, ...EROSION });
var Downbeat = ciacconaAction("Forte Heavy - Quadruple Downbeat", { node: 2, cast: 3, type: 8192, mv: 628.13, energy: 14.97, concerto: 25, offtune: 9360, forte1: -3, ...EROSION });
var Liberation = ciacconaAction("Liberation - Singer's Triple Cadenza", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 1100.42,
  concerto: 20,
  offtune: 48e3,
  resetEnergy: true,
  updateDebuffs: () => applyCurrent(SHIELD, 1),
  // Interlude Tune
  updateBuffs: () => applyCurrent(RECITAL, 1)
});
var GreenTonic = ciacconaAction("Liberation - Symphonic Poem: Tonic (green)", {
  node: 3,
  type: 16384,
  mv: 122.4,
  concerto: 10,
  offtune: 43640,
  active: false,
  updateDebuffs: () => applyEnemy(AERO_EROSION, 20)
});
var Intro = ciacconaAction("Intro - Roaming with the Wind", { node: 4, cast: 6, type: 20480, mv: 189.11, energy: 10, concerto: 10, offtune: 9280, forte1: 1, ...EROSION });
var Outro = ciacconaAction("Outro - Windcalling Tune", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => {
    applyTeam(WINDCALLING_TUNE, 1);
    if (isHeld(RECITAL))
      queueOnIntro(GreenTonic);
  }
});
var SOLO_CONCERT = new Buff({
  name: "Ciaccona: Solo Concert",
  applyStats: () => addStat(
    17,
    24,
    64
    /* Attribute.Aero */
  )
});
var RECITAL = new Buff({
  name: "Ciaccona: Recital",
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ))
      revokeCurrent(RECITAL);
  }
  // TODO swap in cancels it
});
var CI_INHERENT_1 = new Inherent({ name: "Inherent: Interlude Tune" });
var CI_INHERENT_2 = new Inherent({
  name: "Inherent: Winds of Rinascita",
  applyStats: () => {
    if (currentAction() === Downbeat)
      addStat(17, 30);
  }
});
var WINDCALLING_TUNE = new Buff({
  name: "Ciaccona: Outro",
  applyStats: () => {
    addStat(
      18,
      100,
      786432
      /* Type2.AeroErosion */
    );
  }
});
var CIACCONA_RESONATOR = new Resonator({
  name: "Ciaccona",
  element: 64,
  weapon: 2,
  intro: () => Intro,
  outro: () => Outro,
  color: "#5ac46b",
  maxEnergy: 125,
  constantStats: () => {
    addStat(1, 12238);
    addStat(0, 375);
    addStat(2, 1198);
  }
});
var CIACCONA_TALENTS = new Talent({
  name: "Ciaccona: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(10, 16);
  }
});
var CI_ROTATION = new Rotation([
  NOINTRO,
  // jump
  MA1,
  MA2,
  BA4,
  MA1,
  MA2,
  BA4,
  MA1,
  MA2,
  BA4,
  Skill,
  Downbeat,
  Liberation,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  BA3,
  BA4,
  // jump
  MA1,
  MA2,
  BA4,
  Skill,
  Downbeat,
  Liberation,
  ECHO_SWAP,
  OUTRO
]);
var CIACCONA = new Loadout({
  resonator: CIACCONA_RESONATOR,
  talent: CIACCONA_TALENTS,
  inherent1: CI_INHERENT_1,
  inherent2: CI_INHERENT_2,
  weapons: [WOODLAND_ARIA, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: [
    new EchoLoadout(NM_KELPIE, GUSTS_OF_WELKIN_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    12,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: CI_ROTATION
});

// dist/src/weapons/gauntlet.js
var VERITYS_HANDLE = new Weapon({
  weaponType: 3,
  name: "Verity's Handle",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(10, 48.6);
    addStat(17, 12);
  },
  updateBuffs: () => {
    if (casting(
      5
      /* Cast.Liberation */
    ))
      applyCurrent(AD_VERITATEM, 1);
  }
});
var AD_VERITATEM = new Buff({
  name: "Verity's Handle: Ad Veritatem",
  applyStats: () => addStat(
    17,
    48,
    16384
    /* Type1.Liberation */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(AD_VERITATEM);
  }
});
var TRAGICOMEDY = new Weapon({
  weaponType: 3,
  name: "Tragicomedy",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (casting(
      1
      /* Cast.Basic */
    ) || casting(
      2
      /* Cast.MidAir */
    ) || casting(
      6
      /* Cast.Intro */
    ))
      applyCurrent(FOOLS_WARBLE, 1);
  }
});
var FOOLS_WARBLE = new Buff({
  name: "Tragicomedy: Fool's Warble",
  applyStats: () => addStat(
    17,
    48,
    8192
    /* Type1.Heavy */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(FOOLS_WARBLE);
  }
});
var SOLSWORN_CIPHERS = new Weapon({
  weaponType: 3,
  name: "Solsworn Ciphers",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(10, 48.6);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) || casting(
      8
      /* Cast.Echo */
    ))
      applyCurrent(SUNWARD_AMP, 1);
    if (isType(
      28672
      /* Type1.Echo */
    ))
      applyCurrent(SUNWARD_IGNORE, 1);
  }
});
var SUNWARD_AMP = new Buff({
  name: "Solsworn Ciphers: Sunward (echo amp)",
  applyStats: () => addStat(
    18,
    32,
    28672
    /* Type1.Echo */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SUNWARD_AMP);
  }
});
var SUNWARD_IGNORE = new Buff({
  name: "Solsworn Ciphers: Sunward (def ignore)",
  applyStats: () => addStat(
    21,
    10,
    64
    /* Attribute.Aero */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SUNWARD_IGNORE);
  }
});
var IUNO_SIG = new Weapon({
  weaponType: 3,
  name: "Moongazer's Sigil",
  constantStats: () => {
    addStat(0, 500);
    addStat(9, 36);
    addStat(6, 12);
    addStat(
      17,
      20,
      16384
      /* Type1.Liberation */
    );
  },
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ))
      setStacksSelf(MOONGAZER_STACKS, 5);
    else if (applied(SHIELD))
      applyCurrent(MOONGAZER_STACKS, applied(SHIELD));
  }
});
var MOONGAZER_STACKS = new Buff({
  name: "Moongazer's Sigil: Plenilune Radiance",
  maxStacks: 5,
  // scoped to liberation damage — most of Lunar Cycle qualifies, intro/outro/echo don't
  applyStats: () => addStat(
    21,
    7.2 * frozenStacks(),
    16384
    /* Type1.Liberation */
  )
});
var DAYBREAKERS_SPINE = new Weapon({
  weaponType: 3,
  name: "Daybreaker's Spine",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(6, 12);
  },
  updateBuffs: () => {
    const a = currentAction();
    if (isType(
      4096
      /* Type1.Basic */
    ))
      applyCurrent(SUTURING_DAYLINE_SPECTRO, 1);
    if (appliedByMe(TUNE_STRAIN_SHIFTING))
      applyCurrent(SUTURING_DAYLINE_STRAIN, 1);
  }
});
var SUTURING_DAYLINE_SPECTRO = new Buff({
  name: "Daybreaker's Spine: Suturing Dayline (spectro)",
  applyStats: () => addStat(
    17,
    20,
    320
    /* Attribute.Spectro */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SUTURING_DAYLINE_SPECTRO);
  }
});
var SUTURING_DAYLINE_STRAIN = new Buff({
  name: "Daybreaker's Spine: Suturing Dayline (strain)",
  applyStats: () => {
    addStat(
      18,
      20,
      4096
      /* Type1.Basic */
    );
    addStat(
      21,
      10,
      4096
      /* Type1.Basic */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SUTURING_DAYLINE_STRAIN);
  }
});

// dist/src/echoes/septimont.js
var DREAM_OF_THE_LOST_3PC = new Sonata3pc({
  name: "Dream of the Lost 3pc",
  applyStats: () => {
    if (maxEnergy() !== 0)
      return;
    addStat(9, 20);
    addStat(
      17,
      35,
      28672
      /* Type1.Echo */
    );
  }
});
var ACTION_FALSE_SOVEREIGN = new Action("Echo - False Sovereign", {
  cast: 8,
  element: 128,
  scaling: 0,
  type: 28672,
  mv: 221.4,
  energy: 3.04
});
var ACTION_FALSE_SOVEREIGN_INTRO = new Action("Echo - False Sovereign (Intro)", {
  element: 128,
  scaling: 0,
  type: 28672,
  mv: 405
});
var FALSE_SOVEREIGN = new Mainslot({
  name: "False Sovereign",
  action: ACTION_FALSE_SOVEREIGN,
  echoType: 1,
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ))
      queue(ACTION_FALSE_SOVEREIGN_INTRO);
  },
  constantStats: () => {
    addStat(
      17,
      12,
      128
      /* Attribute.Electro */
    );
    addStat(
      17,
      12,
      8192
      /* Type1.Heavy */
    );
  }
});
var CROWN_STACKS = new Buff({
  name: "Crown of Valor",
  maxStacks: 5,
  applyStats: () => {
    addStat(6, 6 * frozenStacks());
    addStat(10, 4 * frozenStacks());
  }
});
var COV_3PC = new Sonata3pc({
  name: "Crown of Valor 3pc",
  updateBuffs: () => {
    if (applied(SHIELD))
      applyCurrent(CROWN_STACKS, applied(SHIELD));
  }
});
var ACTION_MYA = new Action("Echo - Lady of the Sea", {
  cast: 8,
  element: 64,
  scaling: 0,
  type: 28672,
  mv: 300.96,
  energy: 4.18
});
var MYA = new Mainslot({
  name: "Lady of the Sea",
  action: ACTION_MYA,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      12,
      16384
      /* Type1.Liberation */
    );
    addStat(
      17,
      12,
      64
      /* Attribute.Aero */
    );
  }
});
var ACTION_LIONESS = new Action("Echo - Lioness of Glory", {
  cast: 8,
  element: 192,
  scaling: 0,
  type: 28672,
  mv: 273.6,
  energy: 3.8
});
var LIONESS_OF_GLORY = new Mainslot({
  name: "Lioness of Glory",
  action: ACTION_LIONESS,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      12,
      16384
      /* Type1.Liberation */
    );
    addStat(
      17,
      12,
      192
      /* Attribute.Fusion */
    );
  }
});
var CLAWPRINT_TEAM = new Buff({
  name: "Flaming Clawprint 5pc (team)",
  applyStats: () => addStat(
    17,
    15,
    192
    /* Attribute.Fusion */
  )
});
var CLAWPRINT_LIBERATION = new Buff({
  name: "Flaming Clawprint 5pc",
  applyStats: () => addStat(
    17,
    20,
    16384
    /* Type1.Liberation */
  )
});
var CLAWPRINT_2PC = new Sonata2pc({ name: "Flaming Clawprint 2pc", constantStats: () => addStat(
  17,
  10,
  192
  /* Attribute.Fusion */
) });
var CLAWPRINT_5PC = new Sonata({
  name: "Flaming Clawprint 5pc",
  sonata2pc: CLAWPRINT_2PC,
  updateBuffs: () => {
    if (casting(
      5
      /* Cast.Liberation */
    )) {
      applyTeam(CLAWPRINT_TEAM, 1);
      applyCurrent(CLAWPRINT_LIBERATION, 1);
    }
  }
});
var ACTION_CORROSAURUS = new Action("Echo - Corrosaurus", {
  cast: 8,
  element: 192,
  scaling: 0,
  type: 28672,
  mv: 273.6,
  energy: 3.8
});
var CORROSAURUS = new Mainslot({
  name: "Corrosaurus",
  action: ACTION_CORROSAURUS,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      12,
      192
      /* Attribute.Fusion */
    );
    addStat(
      17,
      20,
      28672
      /* Type1.Echo */
    );
  }
});
var FLAMEWING_SHADOW_HEAVY = new Buff({
  name: "Flamewing's Shadow 3pc (heavy)",
  applyStats: () => addStat(
    9,
    20,
    8192
    /* Type1.Heavy */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(FLAMEWING_SHADOW_HEAVY);
  }
});
var FLAMEWING_SHADOW_ECHO = new Buff({
  name: "Flamewing's Shadow 3pc (echo)",
  applyStats: () => addStat(
    9,
    20,
    28672
    /* Type1.Echo */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(FLAMEWING_SHADOW_ECHO);
  }
});
var FLAMEWING_SHADOW_3PC = new Sonata3pc({
  name: "Flamewing's Shadow 3pc",
  updateBuffs: () => {
    if (isType(
      28672
      /* Type1.Echo */
    ))
      applyCurrent(FLAMEWING_SHADOW_HEAVY, 1);
    if (isType(
      8192
      /* Type1.Heavy */
    ))
      applyCurrent(FLAMEWING_SHADOW_ECHO, 1);
  },
  applyStats: () => {
    if (stacksOf(FLAMEWING_SHADOW_HEAVY) && stacksOf(FLAMEWING_SHADOW_ECHO))
      addStat(
        17,
        16,
        192
        /* Attribute.Fusion */
      );
  }
});
var ACTION_FENRICO = new Action("Echo - Reminiscence: Fenrico", {
  cast: 8,
  element: 64,
  scaling: 0,
  type: 28672,
  mv: 273.6,
  energy: 3.8
});
var FENRICO = new Mainslot({
  name: "Reminiscence: Fenrico",
  action: ACTION_FENRICO,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      12,
      64
      /* Attribute.Aero */
    );
    addStat(
      17,
      12,
      8192
      /* Type1.Heavy */
    );
  }
});
var LAW_OF_HARMONY_SELF = new Buff({
  name: "Law of Harmony",
  applyStats: () => addStat(
    17,
    30,
    8192
    /* Type1.Heavy */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(LAW_OF_HARMONY_SELF);
  }
});
var LAW_OF_HARMONY_TEAM = new Buff({
  name: "Law of Harmony",
  maxStacks: 4,
  applyStats: () => {
    addStat(
      17,
      4 * stacksOfTeam(LAW_OF_HARMONY_TEAM),
      28672
      /* Type1.Echo */
    );
  }
});
var LAW_OF_HARMONY_3PC = new Sonata3pc({
  name: "Law of Harmony 3pc",
  updateBuffs: () => {
    if (casting(
      8
      /* Cast.Echo */
    )) {
      applyCurrent(LAW_OF_HARMONY_SELF, 1);
      applyTeam(LAW_OF_HARMONY_TEAM, 1);
    }
  }
});
var ACTION_THRENODIAN_LEVIATHAN = new Action("Echo - Reminiscence: Leviathan", {
  cast: 8,
  element: 384,
  scaling: 0,
  type: 28672,
  mv: 131.04 * 2,
  energy: 0.91 * 2,
  updateBuffs: () => queue(ACTION_CORE_OF_COLLAPSE)
});
var ACTION_CORE_OF_COLLAPSE = new Action("Echo - Core of Collapse", {
  element: 384,
  scaling: 0,
  type: 28672,
  mv: 24.57 * 8,
  applyStats: () => {
    if (stacksOfEnemy(HAVOC_BANE) > 0)
      addStat(19, 100);
  }
});
var THRENODIAN_LEVIATHAN = new Mainslot({
  name: "Reminiscence: Threnodian - Leviathan",
  action: ACTION_THRENODIAN_LEVIATHAN,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      12,
      384
      /* Attribute.Havoc */
    );
    addStat(
      17,
      12,
      16384
      /* Type1.Liberation */
    );
  }
});
var THREAD_OF_SEVERED_FATE_3PC = new Sonata3pc({
  name: "Thread of Severed Fate 3pc",
  updateGlobal: () => {
    if (appliedByMe(HAVOC_BANE))
      applyCurrent(THREAD_OF_SEVERED_FATE_BUFF, 1);
  }
});
var THREAD_OF_SEVERED_FATE_BUFF = new Buff({
  name: "Thread of Severed Fate",
  applyStats: () => {
    addStat(6, 20);
    addStat(
      17,
      30,
      16384
      /* Type1.Liberation */
    );
  }
});

// dist/src/resonators/aero/iuno.js
function iunoAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA12 = iunoAction("Basic - Moonring 1", { node: 0, cast: 1, type: 4096, mv: 87.68, energy: 1.23, concerto: 1.23, offtune: 3920, forte1: 5 });
var BA22 = iunoAction("Basic - Moonring 2", { node: 0, cast: 1, type: 4096, mv: 139.58, energy: 1.97, concerto: 1.97, offtune: 6242, forte1: 10 });
var BA32 = iunoAction("Basic - Moonring 3", { node: 0, cast: 1, type: 4096, mv: 266.61, energy: 3.73, concerto: 3.73, offtune: 11921, forte1: 20 });
var DC2 = iunoAction("Dodge Counter - Moonring", { node: 0, cast: 0, type: 4096, mv: 248.73, energy: 2, concerto: 13.97, offtune: 6321, forte1: 10 });
var BA123 = new ActionGroup("Basic - Moonring 123", [BA12, BA22, BA32]);
var MA12 = iunoAction("Basic - Moonbow 1", { node: 0, cast: 1, type: 16384, mv: 126.45, energy: 2.33, concerto: 2.65, offtune: 4240 });
var MA22 = iunoAction("Basic - Moonbow 2", { node: 0, cast: 1, type: 16384, mv: 167.01, energy: 3.27, concerto: 3.51, offtune: 5601 });
var MA3 = iunoAction("Basic - Moonbow 3", { node: 0, cast: 1, type: 16384, mv: 334.02, energy: 6, concerto: 7, offtune: 11200 });
var MDC = iunoAction("Dodge Counter - Moonbow", { node: 0, cast: 0, type: 16384, mv: 310.17, energy: 1.77, concerto: 13.51, offtune: 5601 });
var MA123 = new ActionGroup("Basic - Moonbow 123", [MA12, MA22, MA3]);
var Skill2 = iunoAction("Skill - Pulse of Origins", { node: 1, cast: 4, type: 12288, mv: 261.07, energy: 4.58, concerto: 6, offtune: 8086 });
var ESkill = iunoAction("Skill - Closing Refrain", { node: 1, cast: 4, type: 12288, mv: 426.46, energy: 8.15, concerto: 8, offtune: 13200, forte1: 25 });
var MSkill = iunoAction("Skill - Arc Beyond the Edge", { node: 1, cast: 4, type: 16384, mv: 439.58, energy: 9.36, concerto: 8, offtune: 10720 });
var Liberation2 = iunoAction("Liberation - Beneath Lunar Tides", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 1093.46,
  concerto: 20,
  offtune: 96e3,
  forte1: 60,
  resetEnergy: true
});
var Intro2 = iunoAction("Intro - Illuminated Manifestation", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 159.09,
  energy: 10,
  concerto: 10,
  offtune: 10400,
  forte1: 40
});
var Outro2 = iunoAction("Outro - From Gloom to Gleam", {
  cast: 7,
  type: 24576,
  mv: 100,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(IUNO_OUTRO)
});
var Jump = iunoAction("Heavy - Flux: Moonbow", { node: 2, cast: 3, type: 16384, mv: 250.51, energy: 3.5, concerto: 7, offtune: 11200 });
var FJump = iunoAction("Heavy - Flux: Moonring", { node: 2, cast: 3, type: 16384, mv: 316.72, energy: 4.44, concerto: 8.88, offtune: 14160 });
var FMA1 = iunoAction("Forte Basic - Enhanced Moonbow 1", { node: 2, cast: 1, type: 16384, mv: 205.97, energy: 2.33, concerto: 6.65, offtune: 4240, forte1: -10 });
var FMA2 = iunoAction("Forte Basic - Enhanced Moonbow 2", { node: 2, cast: 1, type: 16384, mv: 286.29, energy: 3.27, concerto: 9.51, offtune: 5601, forte1: -15 });
var FMA3 = iunoAction("Forte Basic - Enhanced Moonbow 3", { node: 2, cast: 1, type: 16384, mv: 532.82, energy: 6, concerto: 17, offtune: 11200, forte1: -25 });
var FMSkill = iunoAction("Forte Skill - Enhanced Arc Beyond the Edge", { node: 2, cast: 4, type: 16384, mv: 638.38, energy: 9.36, concerto: 18, offtune: 10720, forte1: -25 });
var FMA123 = new ActionGroup("Forte - Enhanced Moonbow 123", [FMA1, FMA2, FMA3]);
var FHA = iunoAction("Heavy - Absolute Fullness", {
  node: 2,
  cast: 3,
  type: 16384,
  mv: 159.05,
  energy: 5,
  offtune: 2400,
  updateBuffs: () => applyTeam(IUNO_DOMAIN, 1)
});
var IUNO_BLESSING = new Buff({
  name: "Iuno: Blessing of the Wan Light",
  maxStacks: 10,
  applyStats: () => addStat(18, 4 * frozenStacks()),
  updateBuffs: () => lostOnSwap()
});
var IUNO_DOMAIN = new Buff({
  name: "Iuno: Full Moon Domain",
  updateBuffs: () => {
    if (applied(SHIELD))
      applyCurrent(IUNO_BLESSING, applied(SHIELD));
  }
});
var IO_INHERENT_2 = new Inherent({
  name: "Inherent: Derivation",
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) || casting(
      5
      /* Cast.Liberation */
    ))
      applyCurrent(IUNO_BLESSING, 5);
  }
});
var IO_INHERENT_1 = new Inherent({ name: "Inherent: Waxing Ascent" });
var IUNO_OUTRO = new Buff({
  name: "Iuno: Outro",
  applyStats: () => addStat(
    18,
    50,
    8192
    /* Type1.Heavy */
  ),
  updateBuffs: () => {
    lostOnSwap();
  }
});
var SHIELDING = /* @__PURE__ */ new Set([
  BA12,
  BA22,
  BA32,
  DC2,
  MA12,
  MA22,
  MA3,
  MDC,
  Skill2,
  ESkill,
  MSkill,
  Liberation2,
  Intro2,
  Jump,
  FJump,
  FMA1,
  FMA2,
  FMA3,
  FMSkill,
  FHA
]);
var IUNO_RESONATOR = new Resonator({
  name: "Iuno",
  element: 64,
  weapon: 3,
  intro: () => Intro2,
  outro: () => Outro2,
  color: "#2dd4c0",
  maxEnergy: 125,
  // every cast of hers but the Outro shields
  updateDebuffs: () => {
    if (SHIELDING.has(currentAction()))
      applyCurrent(SHIELD, 1);
    if (currentAction().forte1 < 0 && forte1() > 100)
      setForte1(100);
    if (currentAction().forte1 > 0 && forte1() < 0)
      setForte1(0);
  },
  constantStats: () => {
    addStat(1, 10525);
    addStat(0, 450);
    addStat(2, 1124);
  }
});
var IUNO_TALENTS = new Talent({
  name: "Iuno: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var IO_ROTATION = new Rotation([
  INTRO,
  ESkill,
  ECHO_CANCEL,
  Liberation2,
  Jump,
  FMSkill,
  FMA123,
  FMSkill,
  FHA,
  OUTRO
]);
var IUNO = new Loadout({
  resonator: IUNO_RESONATOR,
  talent: IUNO_TALENTS,
  inherent1: IO_INHERENT_1,
  inherent2: IO_INHERENT_2,
  weapons: [IUNO_SIG, NEW_STD_GAUNTLET, MARCATO, ABYSS_SURGES, VERITYS_HANDLE],
  echoLoadouts: [
    new EchoLoadout(MYA, COV_3PC, SIERRA_GALE_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(HERON, COV_3PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(FALLACY, COV_3PC, REJUV_2PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    12,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: IO_ROTATION
});
var IO_ROTATION_MDPS = new Rotation([
  INTRO,
  Skill2,
  ESkill,
  // todo swap skill eskill
  Jump,
  //FMA1, 
  FMSkill,
  FMA123,
  Liberation2,
  FMA123,
  FMSkill,
  MA123,
  FHA,
  ECHO_SWAP,
  OUTRO
]);
var IUNO_MDPS = new Loadout({
  resonator: IUNO_RESONATOR,
  talent: IUNO_TALENTS,
  inherent1: IO_INHERENT_1,
  inherent2: IO_INHERENT_2,
  weapons: [IUNO_SIG, NEW_STD_GAUNTLET, ABYSS_SURGES, VERITYS_HANDLE],
  echoLoadouts: [
    new EchoLoadout(MYA, COV_3PC, SIERRA_GALE_2PC),
    new EchoLoadout(NM_KELPIE, WINDWARD_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    12,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: IO_ROTATION_MDPS
});

// dist/src/resonators/aero/jianxin.js
function jianxinAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA13 = jianxinAction("Basic - Fengyiquan 1", { node: 0, cast: 1, type: 4096, mv: 69.46, energy: 1.02, concerto: 3.28, offtune: 3280, forte1: 6 });
var BA23 = jianxinAction("Basic - Fengyiquan 2", { node: 0, cast: 1, type: 4096, mv: 133.18, energy: 1.97, concerto: 6.3, offtune: 6320, forte1: 10 });
var BA33 = jianxinAction("Basic - Fengyiquan 3", { node: 0, cast: 1, type: 4096, mv: 167, energy: 2.48, concerto: 7.92, offtune: 7920, forte1: 12 });
var BA42 = jianxinAction("Basic - Fengyiquan 4", { node: 0, cast: 1, type: 4096, mv: 113.4, energy: 1.68, concerto: 5.37, offtune: 5360, forte1: 12 });
var HA2 = jianxinAction("Heavy - Fengyiquan", { node: 0, cast: 3, type: 8192, mv: 126.07, energy: 1.87, concerto: 5.96, offtune: 6e3, forte1: 9 });
var MA = jianxinAction("Mid-air - Fengyiquan", { node: 0, cast: 2, type: 4096, mv: 123.27, energy: 0.52, concerto: 1, offtune: 4960, forte1: 6 });
var DC3 = jianxinAction("Dodge Counter - Fengyiquan", { node: 0, cast: 0, type: 4096, mv: 244.94, energy: 3.1, concerto: 16.68, offtune: 13143, forte1: 17 });
var ChiParry = jianxinAction("Skill - Calming Air: Chi Parry", { node: 1, cast: 4, type: 12288, mv: 258.73, energy: 4, concerto: 22, offtune: 12240, forte1: 15 + 25 });
var ChiCounter = jianxinAction("Skill - Calming Air: Chi Counter", { node: 1, cast: 4, type: 12288, mv: 334.6, energy: 4, concerto: 22, offtune: 5200, forte1: 15 + 25 });
var Liberation3 = jianxinAction("Liberation - Purification Force Field", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 636.2 + 29.83 * 15,
  concerto: 20,
  offtune: 48e3 + 3200 * 15,
  resetEnergy: true
});
var FHA2 = jianxinAction("Forte Heavy - Primordial Chi Spiral", {
  node: 2,
  cast: 3,
  forte1: -120,
  updateBuffs: () => {
    if (forte1() > 120)
      setForte1(120);
  }
});
var ChiStrike = jianxinAction("Heavy - Zhoutian: Chi Strike", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 24.86,
  energy: 0.3,
  offtune: 2e3
});
var MinorShock = jianxinAction("Heavy - Minor Zhoutian: Shock", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 139.17,
  energy: 2,
  concerto: 5,
  offtune: 3920
});
var InnerShock = jianxinAction("Heavy - Major Zhoutian (Inner): Shock", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 377.74,
  energy: 8,
  concerto: 18,
  offtune: 5120
});
var OuterShock = jianxinAction("Heavy - Major Zhoutian (Outer): Shock", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 516.91,
  energy: 15.61,
  concerto: 23,
  offtune: 7360,
  updateDebuffs: () => {
    applyCurrent(SHIELD, 1);
    applyCurrent(HEALS, 1);
  }
});
var PushingPunch = jianxinAction("Heavy - Pushing Punch", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 248.52,
  energy: 8,
  concerto: 10,
  offtune: 5280,
  updateDebuffs: () => {
    applyCurrent(SHIELD, 1);
    applyCurrent(HEALS, 1);
  }
});
var YieldingPull = jianxinAction("Heavy - Yielding Pull", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 218.7,
  energy: 3,
  concerto: 7,
  offtune: 7200,
  updateDebuffs: () => {
    applyCurrent(SHIELD, 1);
    applyCurrent(HEALS, 1);
  }
});
var ZHOUTIAN_1 = new ActionGroup("Heavy - Primordial Chi Spiral (Zhoutian 1)", [
  FHA2,
  PushingPunch
]);
var ZHOUTIAN_2 = new ActionGroup("Heavy - Primordial Chi Spiral (Zhoutian 2)", [
  FHA2,
  MinorShock,
  YieldingPull
  // missing chi strikes
]);
var ZHOUTIAN_3 = new ActionGroup("Heavy - Primordial Chi Spiral (Zhoutian 3)", [
  FHA2,
  MinorShock,
  InnerShock,
  YieldingPull
  // missing chi strikes
]);
var ZHOUTIAN_4 = new ActionGroup("Heavy - Primordial Chi Spiral (Zhoutian 4)", [
  FHA2,
  MinorShock,
  InnerShock,
  OuterShock
  // missing chi strikes
]);
var Intro3 = jianxinAction("Intro - Essence of Tao", { node: 4, cast: 6, type: 20480, mv: 33.8 * 3 + 67.6, energy: 10, concerto: 10, offtune: 2667 * 3 + 1600, forte1: 40 });
var Outro3 = jianxinAction("Outro - Transcendence", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(TRANSCENDENCE)
});
var TRANSCENDENCE = new Buff({
  name: "Jianxin: Outro",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(
    18,
    38,
    16384
    /* Type1.Liberation */
  )
});
var S1_BRANCHLET = new Buff({
  name: "Jianxin S1: Verdant Branchlet",
  applyStats: () => {
    if (casting(
      1
      /* Cast.Basic */
    ) || casting(
      2
      /* Cast.MidAir */
    ))
      addStat(29, currentAction().forte1);
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(S1_BRANCHLET);
  }
});
var S1 = new Sequence({
  name: "Jianxin S1: Verdant Branchlet",
  updateBuffs: () => {
    if (currentAction() === Intro3)
      applyCurrent(S1_BRANCHLET, 1);
  }
});
var S2 = new Sequence({ name: "Jianxin S2: Tao Seeker's Journey" });
var S3 = new Sequence({ name: "Jianxin S3: Principles of Wuwei" });
var S4_REFLECTION = new Buff({
  name: "Jianxin S4: Multitide Reflection",
  applyStats: () => {
    if (currentAction() === Liberation3)
      addStat(17, 80);
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(S4_REFLECTION);
  }
});
var S4 = new Sequence({
  name: "Jianxin S4",
  updateBuffs: () => {
    if (currentAction() === FHA2)
      applyCurrent(S4_REFLECTION, 1);
  }
});
var S5 = new Sequence({ name: "Jianxin S5" });
var SpecialChiCounter = jianxinAction("Skill - Special Chi Counter", {
  node: 1,
  cast: 4,
  type: 8192,
  mv: 556.67,
  energy: 4,
  concerto: 14,
  offtune: 5200,
  updateDebuffs: () => applyCurrent(SHIELD, 1)
});
var S6 = new Sequence({ name: "Jianxin S6" });
var JX_INHERENT_1 = new Inherent({
  name: "Inherent: Formless Release",
  applyStats: () => {
    if (currentAction() === Liberation3)
      addStat(17, 20);
  }
});
var JX_INHERENT_2 = new Inherent({ name: "Inherent: Reflection" });
var JIANXIN_TALENTS = new Talent({
  name: "Jianxin: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var JIANXIN_RESONATOR = new Resonator({
  name: "Jianxin",
  tier: 1,
  element: 64,
  weapon: 3,
  intro: () => Intro3,
  outro: () => Outro3,
  color: "#9fe0c8",
  maxEnergy: 150,
  constantStats: () => {
    addStat(1, 14112.5);
    addStat(0, 337.5);
    addStat(2, 1124.44);
  }
});
var JX_ROTATION = new Rotation([
  INTRO,
  ChiParry,
  ChiParry,
  Liberation3,
  FHA2,
  PushingPunch,
  ECHO_SWAP,
  OUTRO
]);
var JIANXIN = new Loadout({
  resonator: JIANXIN_RESONATOR,
  talent: JIANXIN_TALENTS,
  inherent1: JX_INHERENT_1,
  inherent2: JX_INHERENT_2,
  weapons: [MARCATO],
  echoLoadouts: [new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    12,
    6,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: JX_ROTATION,
  sequences: [S1, S2, S3, S4, S5, S6]
});

// dist/src/weapons/broadblade.js
var VERDANT_SUMMIT = new Weapon({
  weaponType: 1,
  name: "Verdant Summit",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(10, 48.6);
    addStat(17, 12);
  },
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) || casting(
      5
      /* Cast.Liberation */
    ))
      applyCurrent(SWORDSWORN_STACKS);
  }
});
var SWORDSWORN_STACKS = new Buff({
  name: "Verdant Summit: Swordsworn",
  maxStacks: 2,
  updateBuffs: () => {
    addStat(
      17,
      24 * frozenStacks(),
      8192
      /* Type1.Heavy */
    );
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SWORDSWORN_STACKS);
  }
});
var AGES_OF_HARVEST = new Weapon({
  weaponType: 1,
  name: "Ages of Harvest",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(10, 48.6);
    addStat(17, 12);
  },
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ))
      applyCurrent(AGELESS_MARKING);
    if (casting(
      4
      /* Cast.Skill */
    ))
      applyCurrent(ETHEREAL_ENDOWMENT);
  }
});
var AGELESS_MARKING = new Buff({
  name: "Ages of Harvest: Ageless Marking",
  applyStats: () => addStat(
    17,
    24,
    12288
    /* Type1.Skill */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(AGELESS_MARKING);
  }
});
var ETHEREAL_ENDOWMENT = new Buff({
  name: "Ages of Harvest: Ethereal Endowment",
  applyStats: () => addStat(
    17,
    24,
    12288
    /* Type1.Skill */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(ETHEREAL_ENDOWMENT);
  }
});
var THUNDERFLARE_DOMINION = new Weapon({
  weaponType: 1,
  name: "Thunderflare Dominion",
  constantStats: () => {
    addStat(0, 675);
    addStat(9, 12.15);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) || casting(
      4
      /* Cast.Skill */
    ))
      applyCurrent(THUNDERBLAZE_DMG);
    if (applied(SHIELD))
      applyCurrent(THUNDERBLAZE_DEF, applied(SHIELD));
  }
});
var THUNDERBLAZE_DMG = new Buff({
  name: "Thunderflare Dominion: Thunderblaze Eminence (heavy)",
  applyStats: () => addStat(
    17,
    20,
    8192
    /* Type1.Heavy */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(THUNDERBLAZE_DMG);
  }
});
var THUNDERBLAZE_DEF = new Buff({
  name: "Thunderflare Dominion: Thunderblaze Eminence (def ignore)",
  maxStacks: 5,
  updateBuffs: () => {
    addStat(
      21,
      7.2 * frozenStacks(),
      8192
      /* Type1.Heavy */
    );
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(THUNDERBLAZE_DEF);
  }
});
var WILDFIRE_LIB_DMG = new Buff({
  name: "Wildfire Mark: Blazing Starfire",
  applyStats: () => addStat(
    17,
    24,
    16384
    /* Type1.Liberation */
  ),
  updateBuffs: () => {
    if (isType(
      8192
      /* Type1.Heavy */
    ))
      applyTeam(WILDFIRE_TEAM, 1);
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(WILDFIRE_LIB_DMG);
  }
});
var WILDFIRE_TEAM = new Buff({
  name: "Wildfire Mark: Blazing Starfire (team)",
  applyStats: () => addStat(
    17,
    24,
    192
    /* Attribute.Fusion */
  )
});
var WILDFIRE_MARK = new Weapon({
  weaponType: 1,
  name: "Wildfire Mark",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(10, 48.6);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) || casting(
      5
      /* Cast.Liberation */
    )) {
      applyCurrent(WILDFIRE_LIB_DMG, 1);
    }
  }
});
var JINGRAN_SIG = new Weapon({
  weaponType: 1,
  name: "Thousandfold Deliverance",
  constantStats: () => {
    addStat(0, 413);
    addStat(7, 72.2);
    addStat(17, 12);
  },
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    )) {
      applyCurrent(NATURES_ORDER);
      applyCurrent(CRADLE_OF_LIFE);
    } else if (applied(SHIELD)) {
      applyCurrent(NATURES_ORDER, applied(SHIELD));
      applyCurrent(CRADLE_OF_LIFE, applied(SHIELD));
    }
  }
});
var NATURES_ORDER = new Buff({
  name: "Thousandfold Deliverance: Nature's Order",
  maxStacks: 6,
  // switching resonator ends it immediately, whoever wields the weapon — a genuine "lost on swap"
  updateBuffs: () => lostOnSwap(),
  applyStats: () => {
    addStat(10, 4 * frozenStacks());
    if (frozenStacks() >= 6)
      addStat(
        9,
        12,
        8192
        /* Type1.Heavy */
      );
  }
});
var CRADLE_OF_LIFE = new Buff({
  name: "Thousandfold Deliverance: Cradle of Life",
  maxStacks: 6,
  updateBuffs: () => {
    lostOnSwap();
    if (!casting(
      3
      /* Cast.Heavy */
    ))
      return;
    const spent = Math.min(frozenStacks(), 2);
    addStat(
      21,
      15 * spent,
      8192
      /* Type1.Heavy */
    );
    removeStack(CRADLE_OF_LIFE, spent);
  }
});
var STARFIELD_CALIBRATOR = new Weapon({
  weaponType: 1,
  name: "Starfield Calibrator",
  constantStats: () => {
    addStat(0, 412.5);
    addStat(11, 77.04);
    addStat(8, 16);
  },
  updateBuffs: () => {
    if (casting(
      4
      /* Cast.Skill */
    ))
      applyCurrent(DEFINITE_SOLUTION_CONCERTO, 1);
    if (applied(HEALS))
      applyTeam(DEFINITE_SOLUTION, 1);
  }
});
var DEFINITE_SOLUTION = new Buff({
  name: "Starfield Calibrator: Definite Solution (team)",
  applyStats: () => {
    if (currentAction().active)
      addStat(10, 20);
  }
});
var DEFINITE_SOLUTION_CONCERTO = new Buff({
  name: "Starfield Calibrator: Definite Solution",
  maxStacks: 2,
  applyStats: () => {
    if (frozenStacks() === 1 && casting(
      4
      /* Cast.Skill */
    )) {
      applyCurrent(DEFINITE_SOLUTION_CONCERTO, 1);
      addStat(26, 8);
    } else if (frozenStacks() === 2 && casting(
      7
      /* Cast.Outro */
    ))
      removeStack(DEFINITE_SOLUTION_CONCERTO, 2);
  },
  display: () => `Starfield Calibrator: Definite Solution${frozenStacks() === 1 ? "" : " (cooldown)"}`
});
var KUMOKIRI = new Weapon({
  weaponType: 1,
  name: "Kumokiri",
  constantStats: () => {
    addStat(0, 500);
    addStat(9, 36);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) || inflictedNegativeStatus())
      applyCurrent(THREAD_OF_FATE_STACKS, 1);
  }
});
var THREAD_OF_FATE_STACKS = new Buff({
  name: "Kumokiri: Thread of Fate",
  maxStacks: 3,
  // watched from updateGlobal so a teammate's own cast is seen — where `currentSlot` is this
  // buff's holder, so the actor is read off the team and the payout put on their slot by name
  updateGlobal() {
    const actor = currentTeam().slot;
    if (frozenStacks() >= 3 && actor.resonator && inflictedNegativeStatusBy(actor))
      addBuff(actor.resonator, THREAD_OF_FATE_BONUS, 1);
  },
  applyStats: () => addStat(
    17,
    8 * frozenStacks(),
    16384
    /* Type1.Liberation */
  )
});
var THREAD_OF_FATE_BONUS = new Buff({
  name: "Kumokiri: Thread of Fate (team)",
  applyStats: () => addStat(17, 24)
});

// dist/src/resonators/aero/jiyan.js
function jiyanAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA14 = jiyanAction("Basic - Lone Lance 1", { node: 0, cast: 1, type: 4096, mv: 73.16, energy: 0.92, concerto: 1.84, offtune: 2944 });
var BA24 = jiyanAction("Basic - Lone Lance 2", { node: 0, cast: 1, type: 4096, mv: 43.73, energy: 0.55, concerto: 1.1, offtune: 1760 });
var BA34 = jiyanAction("Basic - Lone Lance 3", { node: 0, cast: 1, type: 4096, mv: 36.38 * 5, energy: 2.25, concerto: 4.55, offtune: 7320 });
var BA43 = jiyanAction("Basic - Lone Lance 4", { node: 0, cast: 1, type: 4096, mv: 66.2 * 2, energy: 1.66, concerto: 3.32, offtune: 5328 });
var BA5 = jiyanAction("Basic - Lone Lance 5", { node: 0, cast: 1, type: 4096, mv: 23.6 * 7 + 153.45 * 2, energy: 5.87, concerto: 11.83, offtune: 19e3 });
var HA3 = jiyanAction("Heavy - Lone Lance", { node: 0, cast: 3, type: 8192, mv: 22.2 * 6, energy: 1.62, concerto: 3.3, offtune: 5364 });
var HA22 = jiyanAction("Heavy - Windborne Strike", { node: 0, cast: 3, type: 8192, mv: 105.96, energy: 1.33, concerto: 2.66, offtune: 4264 });
var HA32 = jiyanAction("Heavy - Abyssal Slash", { node: 0, cast: 3, type: 8192, mv: 81.71, energy: 1.02, concerto: 2.05, offtune: 3288 });
var MA4 = jiyanAction("Mid-air - Lone Lance", { node: 0, cast: 2, type: 4096, mv: 123.26, energy: 0.51, concerto: 1, offtune: 4960 });
var MA23 = jiyanAction("Mid-air - Lone Lance (Follow-Up)", { node: 0, cast: 2, type: 4096, mv: 155.66, energy: 1.95, concerto: 3.91, offtune: 6264 });
var MA32 = jiyanAction("Basic - Banner of Triumph", { node: 0, cast: 1, type: 4096, mv: 79.52, energy: 1, concerto: 2, offtune: 3200 });
var DC4 = jiyanAction("Dodge Counter - Lone Lance", { node: 0, cast: 0, type: 4096, mv: 125.84 * 2, energy: 3.16, concerto: 13.32, offtune: 5328 });
var WINDQUELLER = { applyStats: () => addStat(17, 20) };
var Skill3 = jiyanAction("Skill - Windqueller", { node: 1, cast: 4, type: 12288, mv: 106.36 * 4, energy: 9, concerto: 16, offtune: 6480, forte1: -30, ...WINDQUELLER });
var Skill22 = jiyanAction("Skill - Windqueller (Low Resolve)", { node: 1, cast: 4, type: 12288, mv: 106.36 * 4, energy: 9, concerto: 16, offtune: 6480 });
var USkill = jiyanAction("Skill - Windqueller (Qingloong)", { node: 1, cast: 4, type: 12288, mv: 106.36 * 4, energy: 9, concerto: 16, offtune: 6480, ...WINDQUELLER });
var Liberation4 = jiyanAction("Liberation - Emerald Storm: Prelude", {
  node: 3,
  cast: 5,
  concerto: 20,
  resetEnergy: true,
  updateBuffs: () => {
    if (forte1() >= 30)
      queue(Finale);
  }
});
var Finale = jiyanAction("Liberation - Emerald Storm: Finale", { node: 3, cast: 5, type: 8192, mv: 142.91 * 2 + 428.73, offtune: 107520, forte1: -30 });
var Lance1 = jiyanAction("Heavy - Lance of Qingloong 1", { node: 3, cast: 3, type: 8192, mv: 65.52 * 8, energy: 3.76, concerto: 7.6, offtune: 12272 });
var Lance2 = jiyanAction("Heavy - Lance of Qingloong 2", { node: 3, cast: 3, type: 8192, mv: 61.55 * 8, energy: 3.6, concerto: 7.2, offtune: 11528 });
var Lance3 = jiyanAction("Heavy - Lance of Qingloong 3", { node: 3, cast: 3, type: 8192, mv: 66.76 * 8, energy: 3.84, concerto: 7.76, offtune: 12504 });
var Intro4 = jiyanAction("Intro - Tactical Strike", { node: 4, cast: 6, type: 20480, mv: 198.81, energy: 10, concerto: 10, offtune: 7416, forte1: 30 });
var Outro4 = jiyanAction("Outro - Discipline", {
  cast: 7,
  concerto: -100,
  active: false,
  // queued twice so the adopter picks the buff up at both charges
  updateBuffs: () => {
    queueOutro(JIYAN_OUTRO);
    queueOutro(JIYAN_OUTRO);
  }
});
var DISCIPLINE_FIELD = new ActionField("Jiyan: Discipline");
var ACTION_OUTRO_COORD = jiyanAction("Outro - Discipline (Coordinated Lance)", { type: 24576, type2: 262144, mv: 313.4, active: false, field: DISCIPLINE_FIELD });
var HEAVENLY_BALANCE = new Buff({
  name: "Inherent: Heavenly Balance",
  applyStats: () => addStat(6, 10),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(HEAVENLY_BALANCE);
  }
});
var JY_INHERENT_1 = new Inherent({
  name: "Inherent: Heavenly Balance",
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ))
      applyCurrent(HEAVENLY_BALANCE, 1);
  }
});
var TEMPEST_TAMING = new Buff({
  name: "Inherent: Tempest Taming",
  applyStats: () => addStat(10, 12),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(TEMPEST_TAMING);
  }
});
var JY_INHERENT_2 = new Inherent({
  name: "Inherent: Tempest Taming",
  // a real on-field press: not a queued follow-up, a status rung or the shared Tune Break, all of
  // which are active casts on his slot but not him swinging again
  updateBuffs: () => {
    if (!triggeredAction() && currentAction().active)
      applyCurrent(TEMPEST_TAMING, 1);
  }
});
var JIYAN_OUTRO = new Buff({
  field: DISCIPLINE_FIELD,
  name: "Jiyan: Outro",
  maxStacks: 2,
  updateBuffs: () => {
    if (casting(
      3
      /* Cast.Heavy */
    )) {
      queueOn(JIYAN_RESONATOR, ACTION_OUTRO_COORD);
      removeStack(JIYAN_OUTRO, 1);
    }
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(JIYAN_OUTRO);
  }
});
var JIYAN_RESONATOR = new Resonator({
  name: "Jiyan",
  element: 64,
  weapon: 1,
  intro: () => Intro4,
  outro: () => Outro4,
  color: "#4fc98f",
  maxEnergy: 125,
  constantStats: () => {
    addStat(1, 10487.5);
    addStat(0, 437.5);
    addStat(2, 1185.55);
  }
});
var JIYAN_TALENTS = new Talent({
  name: "Jiyan: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var JY_ROTATION = new Rotation([
  INTRO,
  ECHO_CANCEL,
  Liberation4,
  Lance1,
  USkill,
  Lance1,
  Lance1,
  Lance1,
  // dodge cancels
  Lance1,
  Lance1,
  Lance1,
  Lance1,
  START_3,
  Skill22,
  SWAP,
  OUTRO
]);
var JIYAN = new Loadout({
  resonator: JIYAN_RESONATOR,
  matrix: matrix("Jiyan", 25),
  talent: JIYAN_TALENTS,
  inherent1: JY_INHERENT_1,
  inherent2: JY_INHERENT_2,
  weapons: [VERDANT_SUMMIT, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: [
    new EchoLoadout(NM_FEILIAN_BERINGAL, SIERRA_GALE_5PC),
    new EchoLoadout(NM_KELPIE, WINDWARD_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    12,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "heavy"),
  rotation: JY_ROTATION
});

// dist/src/weapons/sword.js
var BLAZING_BRILLIANCE = new Weapon({
  weaponType: 0,
  name: "Blazing Brilliance",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(10, 48.6);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (isType(
      12288
      /* Type1.Skill */
    ))
      applyCurrent(SEARING_FEATHER, 5);
  }
});
var SEARING_FEATHER = new Buff({
  name: "Blazing Brilliance: Crimson Phoenix",
  maxStacks: 14,
  // pays off current stacks before revoking — applyStats()'s frozenStacks() would already read 0 otherwise
  updateBuffs: () => {
    addStat(
      17,
      4 * frozenStacks(),
      12288
      /* Type1.Skill */
    );
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SEARING_FEATHER);
  }
});
var RED_SPRING = new Weapon({
  weaponType: 0,
  name: "Red Spring",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (isType(
      4096
      /* Type1.Basic */
    ))
      applyCurrent(RED_SPRING_BASIC);
    if (currentAction().concerto < 0)
      applyCurrent(RED_SPRING_CONSUME);
  }
});
var RED_SPRING_BASIC = new Buff({
  name: "Red Spring: Beyond the Cycle",
  maxStacks: 3,
  applyStats: () => {
    addStat(
      17,
      10 * frozenStacks(),
      4096
      /* Type1.Basic */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(RED_SPRING_BASIC);
  }
});
var RED_SPRING_CONSUME = new Buff({
  name: "Red Spring: Beyond the Cycle (consume)",
  updateBuffs: () => {
    lostOnSwap();
  },
  applyStats: () => {
    addStat(
      17,
      40,
      4096
      /* Type1.Basic */
    );
  }
});
var UNFLICKERING_VALOR = new Weapon({
  weaponType: 0,
  name: "Unflickering Valor",
  constantStats: () => {
    addStat(0, 413);
    addStat(11, 77.04);
    addStat(9, 8);
  },
  updateBuffs: () => {
    if (casting(
      5
      /* Cast.Liberation */
    ))
      applyCurrent(LAUGHTER_PREVAILS_LIB);
    if (isType(
      4096
      /* Type1.Basic */
    ))
      applyCurrent(LAUGHTER_PREVAILS_BASIC);
  }
});
var LAUGHTER_PREVAILS_LIB = new Buff({
  name: "Unflickering Valor: Laughter Prevails (lib)",
  applyStats: () => addStat(
    17,
    24,
    4096
    /* Type1.Basic */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(LAUGHTER_PREVAILS_LIB);
  }
});
var LAUGHTER_PREVAILS_BASIC = new Buff({
  name: "Unflickering Valor: Laughter Prevails (basic)",
  applyStats: () => addStat(
    17,
    24,
    4096
    /* Type1.Basic */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(LAUGHTER_PREVAILS_BASIC);
  }
});
var EMERALD_SENTENCE = new Weapon({
  weaponType: 0,
  name: "Emerald Sentence",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ))
      applyTeam(HEART_SETTLES_TEAM);
    if ((casting(
      6
      /* Cast.Intro */
    ) || casting(
      1
      /* Cast.Basic */
    ) || casting(
      2
      /* Cast.MidAir */
    )) && !stacksOf(BAMBOO_CLEAVER)) {
      applyCurrent(BAMBOO_CLEAVER);
    }
  }
});
var HEART_SETTLES_TEAM = new Buff({
  name: "Emerald Sentence: When A Heart Settles",
  applyStats: () => addStat(
    17,
    20,
    28672
    /* Type1.Echo */
  )
});
var BAMBOO_CLEAVER = new Buff({
  name: "Emerald Sentence: Bamboo Cleaver",
  maxStacks: 3,
  updateBuffs: () => {
    lostOnSwap();
    if (casting(
      8
      /* Cast.Echo */
    ))
      applyCurrent(BAMBOO_CLEAVER);
  },
  applyStats: () => {
    if (frozenStacks() >= 2)
      addStat(
        17,
        30 * (frozenStacks() - 1),
        8192
        /* Type1.Heavy */
      );
  }
});
var GLINT_OF_CLOUDS = new Weapon({
  weaponType: 0,
  name: "Glint of Clouds",
  constantStats: () => {
    addStat(0, 500);
    addStat(9, 36);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (appliedByMe(TUNE_STRAIN_SHIFTING))
      applyCurrent(EVILS_SCOURGE, 1);
  }
});
var EVILS_SCOURGE = new Buff({
  name: "Glint of Clouds: Evil's Scourge",
  maxStacks: 5,
  applyStats: () => {
    addStat(
      17,
      11.2 * frozenStacks(),
      64
      /* Attribute.Aero */
    );
    if (frozenStacks() >= 5)
      addStat(
        21,
        10,
        64
        /* Attribute.Aero */
      );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ) && frozenStacks() < 5)
      revokeCurrent(EVILS_SCOURGE);
  }
});
var FROSTBURN = new Weapon({
  weaponType: 0,
  name: "Frostburn",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(6, 12);
  },
  // `appliedByMe`: a "when *you* inflict" payout, so the two extra stacks Lucilla's Film Roll
  // adds to the wielder's own are hers and pay nothing here
  updateBuffs: () => {
    if (appliedByMe(GLACIO_CHAFE))
      applyCurrent(SELF_NO_MORE, 1);
  }
});
var SELF_NO_MORE = new Buff({
  name: "Frostburn: Self No More",
  applyStats: () => {
    addStat(
      18,
      28,
      256
      /* Attribute.Glacio */
    );
    addStat(
      21,
      10,
      16384
      /* Type1.Liberation */
    );
    if (currentAction().active)
      addStat(
        18,
        20,
        1310720
        /* Type2.GlacioChafe */
      );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SELF_NO_MORE);
  }
});
var AZURE_OATH = new Weapon({
  weaponType: 0,
  name: "Azure Oath",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(17, 12);
  },
  updateBuffs: () => {
    if (appliedByMe(HAVOC_BANE))
      applyCurrent(UNBENDING, 1);
  }
});
var UNBENDING = new Buff({
  name: "Azure Oath: Unbending",
  applyStats: () => {
    addStat(
      18,
      36,
      8192
      /* Type1.Heavy */
    );
    addStat(
      21,
      12,
      8192
      /* Type1.Heavy */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(UNBENDING);
  }
});
var EVERBRIGHT_POLESTAR = new Weapon({
  weaponType: 0,
  name: "Everbright Polestar",
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(17, 12);
  },
  updateBuffs: () => {
    if (appliedByMe(TUNE_RUPTURE_SHIFTING) || appliedByMe(FUSION_BURST))
      applyCurrent(STARCHASER, 1);
  }
});
var STARCHASER = new Buff({
  name: "Everbright Polestar: Starchaser",
  applyStats: () => {
    addStat(
      21,
      32,
      16384
      /* Type1.Liberation */
    );
    addStat(
      20,
      10,
      16384
      /* Type1.Liberation */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(STARCHASER);
  }
});

// dist/src/echoes/mengzhou.js
var ACTION_MYRIAD_SNARE = new Action("Echo - Myriad Snare", {
  cast: 8,
  element: 192,
  scaling: 1,
  type: 28672,
  mv: 17.23,
  energy: 3.8
});
var MYRIAD_SNARE = new Mainslot({
  name: "Myriad Snare",
  action: ACTION_MYRIAD_SNARE,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      12,
      192
      /* Attribute.Fusion */
    );
    addStat(
      17,
      12,
      8192
      /* Type1.Heavy */
    );
  }
});
var LAMP_STACKS = new Buff({
  name: "Lamp of Nether Road",
  maxStacks: 4,
  applyStats: () => {
    addStat(9, 5 * frozenStacks());
    if (frozenStacks() >= 4)
      addStat(
        17,
        15,
        192
        /* Attribute.Fusion */
      );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(LAMP_STACKS);
  }
});
var LAMP_2PC = new Sonata2pc({ name: "Lamp of Nether Road 2pc", constantStats: () => addStat(7, 10) });
var LAMP_5PC = new Sonata({
  name: "Lamp of Nether Road 5pc",
  sonata2pc: LAMP_2PC,
  updateBuffs: () => {
    if (applied(SHIELD))
      applyCurrent(LAMP_STACKS, applied(SHIELD));
  }
});
var ACTION_CALAMITY_EFFIGY = new Action("Echo - Calamity Effigy", {
  cast: 8,
  element: 64,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 5.62
});
var CALAMITY_EFFIGY_STRAIN = new Buff({
  name: "Calamity Effigy (strain)",
  applyStats: () => addStat(
    17,
    10,
    64
    /* Attribute.Aero */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(CALAMITY_EFFIGY_STRAIN);
  }
});
var CALAMITY_EFFIGY = new Mainslot({
  name: "Calamity Effigy",
  action: ACTION_CALAMITY_EFFIGY,
  echoType: 1,
  constantStats: () => addStat(
    17,
    10,
    64
    /* Attribute.Aero */
  ),
  updateBuffs: () => {
    if (appliedByMe(TUNE_STRAIN_SHIFTING))
      applyCurrent(CALAMITY_EFFIGY_STRAIN, 1);
  }
});
var HEART_OF_EVILS_PURGE_2PC = new Sonata2pc({ name: "Heart of Evil's Purge 2pc", constantStats: () => addStat(
  17,
  10,
  64
  /* Attribute.Aero */
) });
var HEART_OF_EVILS_PURGE_5PC = new Sonata({
  name: "Heart of Evil's Purge 5pc",
  sonata2pc: HEART_OF_EVILS_PURGE_2PC,
  updateBuffs: () => {
    if (appliedByMe(TUNE_STRAIN_SHIFTING))
      applyCurrent(HEART_OF_EVILS_PURGE_BUFF, 1);
  }
});
var HEART_OF_EVILS_PURGE_BUFF = new Buff({
  name: "Heart of Evil's Purge",
  applyStats: () => {
    addStat(10, 20);
    addStat(
      17,
      30,
      64
      /* Attribute.Aero */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(HEART_OF_EVILS_PURGE_BUFF);
  }
});
var ACTION_THOUSAND_PUPPET_PAVILION = new Action("Echo - Thousand-Puppet Pavilion", {
  cast: 8,
  element: 384,
  scaling: 0,
  type: 28672,
  mv: 109.44,
  energy: 1.52,
  updateBuffs: () => queue(ACTION_BLADE_OF_THOUSAND_MEMORIES)
});
var ACTION_BLADE_OF_THOUSAND_MEMORIES = new Action("Echo - Blade of Thousand Memories x4", {
  element: 384,
  scaling: 0,
  type: 28672,
  mv: 41.04 * 4,
  energy: 0.57 * 4
});
var THOUSAND_PUPPET_PAVILION = new Mainslot({
  name: "Thousand-Puppet Pavilion",
  action: ACTION_THOUSAND_PUPPET_PAVILION,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      12,
      384
      /* Attribute.Havoc */
    );
    addStat(
      17,
      12,
      8192
      /* Type1.Heavy */
    );
  }
});
var FEATHERED_TRACE_2PC = new Sonata2pc({ name: "Song of Feathered Trace 2pc", constantStats: () => addStat(11, 10) });
var FEATHERED_TRACE_5PC = new Sonata({
  name: "Song of Feathered Trace 5pc",
  sonata2pc: FEATHERED_TRACE_2PC,
  updateBuffs: () => {
    if (appliedByMe(HAVOC_BANE))
      applyCurrent(XUANLINGS_FEATHER, 1);
    if (appliedByMe(GLACIO_CHAFE))
      applyTeam(CHONGMINGS_FEATHER, 1);
  }
});
var XUANLINGS_FEATHER = new Buff({
  name: "Song of Feathered Trace: Xuanling's Feather",
  applyStats: () => {
    addStat(9, 20);
    addStat(
      17,
      35,
      8192
      /* Type1.Heavy */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(XUANLINGS_FEATHER);
  }
});
var CHONGMINGS_FEATHER = new Buff({
  name: "Song of Feathered Trace: Chongming's Feather",
  applyStats: () => addStat(6, 25)
});
var ACTION_FORBIDDEN_BASTION = new Action("Echo - Forbidden Bastion", {
  cast: 8,
  element: 256,
  scaling: 0,
  type: 28672,
  mv: 237.6,
  energy: 3.3
});
var FORBIDDEN_BASTION = new Mainslot({
  name: "Forbidden Bastion",
  action: ACTION_FORBIDDEN_BASTION,
  echoType: 0,
  constantStats: () => addStat(23, 10)
});

// dist/src/resonators/aero/qingxiao.js
function qxAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA15 = qxAction("Basic - Stringblade 1", { node: 0, cast: 1, type: 4096, mv: 60.26, energy: 1.1, concerto: 2.18, offtune: 3464, forte1: 9.74 });
var BA25 = qxAction("Basic - Stringblade 2", { node: 0, cast: 1, type: 4096, mv: 74.18, energy: 1.34, concerto: 2.68, offtune: 4264, forte2: 7.12 });
var BA35 = qxAction("Basic - Stringblade 3", { node: 0, cast: 1, type: 4096, mv: 97.44, energy: 1.76, concerto: 3.52, offtune: 5600, forte2: 9.36 });
var BA44 = qxAction("Basic - Stringblade 4", { node: 0, cast: 1, type: 4096, mv: 108.45, energy: 1.96, concerto: 3.92, offtune: 6234, forte1: 17.54 });
var MA13 = qxAction("Mid-air - Stringblade 1", { node: 0, cast: 2, type: 4096, mv: 90.48, energy: 1.63, concerto: 3.25, offtune: 5200, forte2: 8.71 });
var MA24 = qxAction("Mid-air - Stringblade 2", { node: 0, cast: 2, type: 4096, mv: 89.79, energy: 1.63, concerto: 3.24, offtune: 5160, forte2: 8.63 });
var MA33 = qxAction("Mid-air - Stringblade 3", { node: 0, cast: 2, type: 4096, mv: 139.21, energy: 2.5, concerto: 5, offtune: 8e3, forte2: 13.37 });
var Plunge = qxAction("Basic - Plunging Attack", { node: 0, cast: 1, type: 4096, mv: 86.29, energy: 1.55, concerto: 3.1, offtune: 4960 });
var DC5 = qxAction("Dodge Counter - Stringblade", { node: 0, cast: 0, type: 4096, mv: 180.92, energy: 3.28, concerto: 16.52, offtune: 10400, forte2: 26.04 });
var HA4 = qxAction("Heavy - Stringblade", {
  node: 0,
  cast: 3,
  type: 8192,
  mv: 438.41,
  energy: 5.31,
  concerto: 10.53,
  offtune: 16800,
  forte1: -100,
  forte2: -100,
  updateBuffs: () => {
    if (forte1() > 100)
      setForte1(100);
    if (forte2() > 100)
      setForte2(100);
  }
});
var Skill4 = qxAction("Skill - Severing Note: Judgement", { node: 1, cast: 4, type: 12288, mv: 139.18, energy: 2.51, concerto: 5, offtune: 8e3, forte1: 45 });
var Ascendant = qxAction("Skill - Severing Note: Ascendant", { node: 1, cast: 4, type: 12288, mv: 94.66, energy: 1.71, concerto: 3.4, offtune: 5440, forte2: 9.09 });
var FBA1 = qxAction("Basic - Ephemeral Transcendence 1", {
  node: 2,
  cast: 1,
  type: 4096,
  mv: 112.24,
  energy: 2.04,
  concerto: 4.05,
  offtune: 6450,
  forte1: 25.55,
  applyStats: () => {
    if (forte1() < 100)
      addStat(16, 100);
  }
});
var FBA2 = qxAction("Basic - Ephemeral Transcendence 2", {
  node: 2,
  cast: 1,
  type: 4096,
  mv: 115.55,
  energy: 2.1,
  concerto: 4.15,
  offtune: 6640,
  forte1: 26.35,
  applyStats: () => {
    if (forte1() < 100)
      addStat(16, 100);
  }
});
var FBA3 = qxAction("Basic - Ephemeral Transcendence 3", {
  node: 2,
  cast: 1,
  type: 4096,
  mv: 125.28,
  energy: 2.28,
  concerto: 4.51,
  offtune: 7200,
  forte1: 28.56,
  applyStats: () => {
    if (forte1() < 100)
      addStat(16, 100);
  }
});
var FBA4 = qxAction("Basic - Ephemeral Transcendence 4", {
  node: 2,
  cast: 1,
  type: 4096,
  mv: 180.96,
  energy: 3.27,
  concerto: 6.5,
  offtune: 10400,
  forte1: 41.2,
  applyStats: () => {
    if (forte1() < 100)
      addStat(16, 100);
  }
});
var FDC = qxAction("Dodge Counter - Ephemeral Transcendence", {
  node: 2,
  cast: 0,
  type: 4096,
  mv: 264.46,
  energy: 4.77,
  concerto: 19.5,
  offtune: 15200,
  forte1: 60.26,
  applyStats: () => {
    if (forte1() < 100)
      addStat(16, 100);
  }
});
var FHA3 = qxAction("Forte Heavy - Heaven's Reckoning", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 695.9,
  energy: 23,
  concerto: 25,
  offtune: 8e3,
  forte1: -100,
  updateBuffs: () => {
    if (forte1() > 100)
      setForte1(100);
    revokeCurrent(HEAVENS_CLARITY);
  }
});
var Liberation5 = qxAction("Liberation - Billows Beneath Heaven", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 1670.11,
  concerto: 20,
  offtune: 8e3,
  resetEnergy: true,
  updateBuffs: () => applyCurrent(HEAVENS_CLARITY, 1)
});
var Intro5 = qxAction("Intro - Tonality Shift", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 132.63,
  energy: 10,
  concerto: 10,
  offtune: 7626,
  forte2: 30,
  updateBuffs: () => applyCurrent(RESONANT_CHIME, 1)
});
var Outro5 = qxAction("Outro - Lingering Song", { cast: 7, type: 24576, mv: 800, concerto: -100, active: false });
var MINDLOCK = new Debuff({
  name: "Qingxiao: Mindlock",
  maxStacks: 15,
  applyStats: () => {
    if (!MINDLOCK_PAYS.has(currentAction()))
      return;
    const n = stacksOfEnemy(MINDLOCK);
    addStat(18, 2 * n + 5 * Math.min(n, 7));
  }
});
var MINDLOCK_PAYS = /* @__PURE__ */ new Set([HA4, FBA1, FBA2, FBA3, FBA4, FDC, FHA3, Liberation5]);
var GATHERED_MIND = new Buff({
  name: "Qingxiao: Gathered Mind",
  maxStacks: 15,
  updateDebuffs: () => {
    if (currentAction() !== TUNE_BREAK || stacksOfEnemy(TUNE_STRAIN_SHIFTING) <= 0)
      return;
    applyEnemy(TUNE_STRAIN_INTERFERED, 1);
    revokeTeam(GATHERED_MIND);
  }
});
var RESONANT_CHIME = new Buff({
  name: "Qingxiao: Resonant Chime",
  applyStats: () => {
    if (currentAction() === Skill4)
      addStat(29, 30);
  },
  convertStats: () => {
    if (currentAction() === Skill4)
      revokeCurrent(RESONANT_CHIME);
  }
});
var CLARITY_FORTE = /* @__PURE__ */ new Set([BA15, BA25, BA35, BA44, MA13, MA24, MA33, DC5, Ascendant]);
var HEAVENS_CLARITY = new Buff({
  name: "Qingxiao: Heaven's Clarity",
  updateDebuffs: () => {
    if (currentAction() === HA4)
      applyEnemy(MINDLOCK, 3);
  },
  updateBuffs: () => {
    if (currentAction() === HA4)
      applyCurrent(RECKONING_ENHANCED, 1);
  },
  applyStats: () => {
    const a = currentAction();
    if (CLARITY_FORTE.has(a)) {
      if (a.forte1 > 0)
        addStat(29, a.forte1);
      if (a.forte2 > 0)
        addStat(30, a.forte2);
    }
  }
});
var RECKONING_ENHANCED = new Buff({
  name: "Qingxiao: Heaven's Reckoning Enhancement",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => {
    if (currentAction() === FHA3) {
      addStat(16, 100);
      addStat(27, 152e3);
    }
  },
  convertStats: () => {
    if (currentAction() === FHA3)
      revokeCurrent(RECKONING_ENHANCED);
  }
});
var QX_INHERENT_1 = new Inherent({
  name: "Inherent: Sea of Thought, World of Dust",
  combatStart: () => {
    applyTeam(GATHERED_MIND, 1);
    applyEnemy(MINDLOCK, 1);
  }
});
var QX_INHERENT_2 = new Inherent({
  name: "Inherent: To Know, To Banish",
  // its own Mindlock, on top of the Forte Circuit's: one more per Tune Strain - Interfered the team
  // inflicts, since the target is Overlord/Calamity Class (assumed — this project's is a boss)
  updateGlobal: () => {
    const interfered = applied(TUNE_STRAIN_INTERFERED);
    if (interfered)
      applyEnemy(MINDLOCK, interfered);
  },
  applyStats: () => {
    if (!MINDLOCK_PAYS.has(currentAction()))
      return;
    const n = stacksOfEnemy(MINDLOCK);
    addStat(17, 2 * n + 5 * Math.min(n, 7));
  }
});
var QINGXIAO_TALENTS = new Talent({
  name: "Qingxiao: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(10, 16);
  }
});
var QINGXIAO_RESONATOR = new Resonator({
  name: "Qingxiao",
  element: 64,
  weapon: 0,
  intro: () => Intro5,
  outro: () => Outro5,
  color: "#6cc5b0",
  maxEnergy: 125,
  // Draw and Sunder: "while Qingxiao is in the team"; Heaven's Clarity and Formless Heart Sword
  // are up from the first action
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1);
    applyCurrent(HEAVENS_CLARITY, 1);
  },
  // every damaging cast of hers lays Tune Strain - Shifting (the echo is its own cast, not hers)
  updateDebuffs: () => {
    const a = currentAction();
    if (a.mv > 0 && a.cast !== 8)
      applyStrain();
  },
  // The Forte Circuit's own Mindlock line: +1 for every Tune Strain - Interfered the team inflicts.
  // To Know, To Banish adds its own on top (QX_INHERENT_2) and Heaven's Clarity its three, each
  // from the piece that grants them.
  updateGlobal: () => {
    const interfered = applied(TUNE_STRAIN_INTERFERED);
    if (interfered)
      applyEnemy(MINDLOCK, interfered);
  },
  lateConvertStats: () => tuneStrainBonus(),
  constantStats: () => {
    addStat(1, 10300);
    addStat(0, 462.5);
    addStat(2, 1112.22);
    addStat(12, 10);
  }
});
var FBA1234 = new ActionGroup("Forte - Ephemeral Transcendence 1234", [FBA1, FBA2, FBA3, FBA4]);
var MA1232 = new ActionGroup("Mid-air - Stringblade 123", [MA13, MA24, MA33]);
var QX_ROTATION = new Rotation([
  START_3,
  Liberation5,
  SWAP,
  INTRO,
  MA1232,
  BA35,
  BA44,
  Skill4,
  HA4,
  FBA1234,
  FHA3,
  Liberation5,
  ECHO_SWAP,
  OUTRO
]);
var QINGXIAO = new Loadout({
  resonator: QINGXIAO_RESONATOR,
  talent: QINGXIAO_TALENTS,
  inherent1: QX_INHERENT_1,
  inherent2: QX_INHERENT_2,
  weapons: [GLINT_OF_CLOUDS, EMERALD_OF_GENESIS, NEW_STD_SWORD, RED_SPRING],
  echoLoadouts: [
    new EchoLoadout(CALAMITY_EFFIGY, HEART_OF_EVILS_PURGE_5PC),
    new EchoLoadout(NM_KELPIE, WINDWARD_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    12,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "heavy"),
  rotation: QX_ROTATION
});

// dist/src/resonators/aero/qiuyuan.js
function qiuyuanAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA16 = qiuyuanAction("Basic - Inkwash 1", { node: 0, cast: 1, type: 4096, mv: 41.76, energy: 0.75, concerto: 2.4, offtune: 2400 });
var BA26 = qiuyuanAction("Basic - Inkwash 2", { node: 0, cast: 1, type: 4096, mv: 69.6, energy: 1.26, concerto: 4, offtune: 4e3 });
var BA36 = qiuyuanAction("Basic - Inkwash 3", { node: 0, cast: 1, type: 4096, mv: 164.25, energy: 2.98, concerto: 9.46, offtune: 9440, forte1: 100 });
var HA5 = qiuyuanAction("Heavy - Inkwash", { node: 0, cast: 3, type: 8192, mv: 165.61, energy: 2.09, concerto: 6.67, offtune: 6664 });
var EBA1 = qiuyuanAction("Basic - Thus Spoke the Blade: Inkwash 1", { node: 0, cast: 1, type: 8192, mv: 119.3, energy: 1.5, concerto: 4.8, offtune: 4800, forte1: 100 });
var EBA2 = qiuyuanAction("Basic - Thus Spoke the Blade: Inkwash 2", { node: 0, cast: 1, type: 8192, mv: 185.5, energy: 2.34, concerto: 7.47, offtune: 7464, forte1: 100 });
var EBA3 = qiuyuanAction("Basic - Thus Spoke the Blade: Inkwash 3", { node: 0, cast: 1, type: 8192, mv: 145.77, energy: 3.69, concerto: 7.07, offtune: 5862, forte1: 100 });
var EBA4 = qiuyuanAction("Basic - Thus Spoke the Blade: Inkwash 4", { node: 0, cast: 1, type: 8192, mv: 172.37, energy: 4.34, concerto: 8.33, offtune: 6936, forte1: 100 });
var Skill5 = qiuyuanAction("Skill - Through the Groves", { node: 1, cast: 4, type: 28672, mv: 215.52, energy: 15.09, concerto: 10, offtune: 8673 });
var Liberation6 = qiuyuanAction("Liberation - Sundering Strike", {
  node: 3,
  cast: 5,
  type: 28672,
  mv: 795.24,
  concerto: 20,
  offtune: 96e3,
  resetEnergy: true,
  updateBuffs: () => applyTeam(SUNDERING_STRIKE_CD, 1)
});
var Intro6 = qiuyuanAction("Intro - Attack the Must-Defend", {
  node: 4,
  cast: 6,
  type: 8192,
  mv: 238.62,
  energy: 10,
  concerto: 10,
  offtune: 9600,
  forte1: 400
});
var Outro6 = qiuyuanAction("Outro - Strike Before Ready", {
  cast: 7,
  type: 28672,
  mv: 100,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(QIUYUAN_OUTRO)
});
var FHA1 = qiuyuanAction("Forte Heavy - Thus Spoke the Blade: To Teach", { node: 2, cast: 3, cast2: 8, type: 8192, mv: 457.2, energy: 7.7, concerto: 14.75, offtune: 12265, forte1: -200 });
var FHA22 = qiuyuanAction("Forte Heavy - Thus Spoke the Blade: To Save", { node: 2, cast: 3, cast2: 8, type: 8192, mv: 209.67, energy: 3.54, concerto: 6.78, offtune: 5625, forte1: -200 });
var FHA32 = qiuyuanAction("Forte Heavy - Thus Spoke the Blade: To Sacrifice", { node: 2, cast: 3, cast2: 8, type: 8192, mv: 217.7, energy: 3.65, concerto: 7.01, offtune: 5840, forte1: -200 });
var FLOWING_PANACEA = new Buff({
  name: "Qiuyuan: Flowing Panacea",
  applyStats: () => addStat(6, 10),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(FLOWING_PANACEA);
  }
});
var BAMBOO_SHADE = new Buff({
  name: "Qiuyuan: Bamboo's Shade",
  applyStats: () => addStat(
    17,
    30,
    28672
    /* Type1.Echo */
  )
});
var QUIETUDE_WITHIN = new Buff({
  name: "Inherent: Quietude Within",
  updateBuffs: () => {
    lostOnSwap();
  },
  applyStats: () => {
    const a = currentAction();
    if (a === FHA1 || a === FHA22 || a === FHA32)
      addStat(19, 50);
    if (a === FHA32)
      addStat(26, 30);
  }
});
var SUNDERING_STRIKE_CD = new Buff({
  name: "Qiuyuan: Sundering Strike",
  applyStats: () => {
    if (currentAction().active)
      addStat(10, 30);
  }
});
var QIUYUAN_OUTRO = new Buff({
  name: "Qiuyuan: Outro",
  applyStats: () => addStat(
    18,
    50,
    28672
    /* Type1.Echo */
  ),
  updateBuffs: () => {
    lostOnSwap();
  }
});
var QY_INHERENT_2 = new Inherent({
  name: "Inherent: Drink Away Woes Age-Old",
  updateBuffs: () => {
    if (currentAction().forte1 > 0)
      applyCurrent(FLOWING_PANACEA, 1);
  }
});
var QY_INHERENT_1 = new Inherent({
  name: "Inherent: Quietude Within",
  updateBuffs: () => {
    const soliloquy = forte1() + currentAction().forte1;
    if (soliloquy >= 600)
      applyCurrent(QUIETUDE_WITHIN, 1);
  }
});
var QIUYUAN_RESONATOR = new Resonator({
  name: "Qiuyuan",
  element: 64,
  weapon: 0,
  intro: () => Intro6,
  outro: () => Outro6,
  color: "#4fae6b",
  maxEnergy: 125,
  updateBuffs: () => {
    const soliloquy = forte1() + currentAction().forte1;
    if (soliloquy >= 400)
      applyTeam(BAMBOO_SHADE, 1);
  },
  constantStats: () => {
    addStat(1, 12238);
    addStat(0, 375);
    addStat(2, 1198);
  }
});
var QIUYUAN_TALENTS = new Talent({
  name: "Qiuyuan: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var FHA123 = new ActionGroup("Forte - Thus Spoke the Blade: Heavy 123", [FHA1, FHA22, FHA32]);
var QY_ROTATION = new Rotation([
  START_3,
  Liberation6,
  SWAP,
  NOINTRO,
  HA5,
  EBA4,
  HA5,
  EBA4,
  ECHO_CANCEL,
  Liberation6,
  EBA1,
  EBA2,
  DODGE,
  EBA1,
  EBA2,
  FHA123,
  OUTRO,
  INTRO,
  EBA3,
  EBA4,
  Skill5,
  Liberation6,
  FHA123,
  ECHO_CANCEL,
  OUTRO
]);
var QIUYUAN = new Loadout({
  resonator: QIUYUAN_RESONATOR,
  talent: QIUYUAN_TALENTS,
  inherent1: QY_INHERENT_1,
  inherent2: QY_INHERENT_2,
  weapons: [EMERALD_SENTENCE, EMERALD_OF_GENESIS],
  echoLoadouts: [
    new EchoLoadout(FENRICO, LAW_OF_HARMONY_3PC, SIERRA_GALE_2PC),
    new EchoLoadout(HERON, LAW_OF_HARMONY_3PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, LAW_OF_HARMONY_3PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(FALLACY, LAW_OF_HARMONY_3PC, REJUV_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    12,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "heavy"),
  rotation: QY_ROTATION
});

// dist/src/resonators/aero/rover_aero.js
function roverAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA17 = roverAction("Basic - Wind Cutter 1", { node: 0, cast: 1, type: 4096, mv: 35.31, energy: 0.76, concerto: 2.41, offtune: 2408 });
var BA27 = roverAction("Basic - Wind Cutter 2", { node: 0, cast: 1, type: 4096, mv: 86.1, energy: 1.84, concerto: 5.88, offtune: 5872 });
var BA37 = roverAction("Basic - Wind Cutter 3", { node: 0, cast: 1, type: 4096, mv: 104.8, energy: 2.24, concerto: 7.15, offtune: 7144, forte1: 10 });
var BA45 = roverAction("Basic - Wind Cutter 4", { node: 0, cast: 1, type: 4096, mv: 76.72, energy: 1.64, concerto: 5.24, offtune: 5232, forte1: 10 });
var HA6 = roverAction("Heavy - Wind Cutter", { node: 0, cast: 3, type: 8192, mv: 53.73, energy: 1.17, concerto: 3.69, offtune: 3666 });
var RazorWind = roverAction("Heavy - Razor Wind", { node: 0, cast: 3, type: 8192, mv: 80.83, energy: 1.73, concerto: 5.53, offtune: 5513 });
var MA5 = roverAction("Mid-air - Wind Cutter", { node: 0, cast: 2, type: 4096, mv: 140.76, energy: 0.52, concerto: 9.6, offtune: 9600 });
var DC6 = roverAction("Dodge Counter - Wind Cutter", { node: 0, cast: 0, type: 4096, mv: 175.18, energy: 3.74, concerto: 21.95, offtune: 11944, forte1: 10 });
var Skill6 = roverAction("Skill - Awakening Gale", { node: 1, cast: 4, type: 12288, mv: 166.1, energy: 5, concerto: 10, offtune: 7553 });
var SkyfallSeverance = roverAction("Skill - Skyfall Severance", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 175.26,
  energy: 2.52,
  concerto: 5,
  offtune: 8001,
  updateDebuffs: () => {
    let removed = 0;
    for (const status of [SPECTRO_FRAZZLE, HAVOC_BANE, FUSION_BURST, GLACIO_CHAFE, ELECTRO_FLARE]) {
      removed += stacksOfEnemy(status);
      revokeEnemy(status);
    }
    if (removed > 0)
      applyEnemy(AERO_EROSION, removed);
  }
});
var Cloudburst1 = roverAction("Basic - Cloudburst Dance 1", { node: 2, cast: 1, type: 12288, mv: 128.8, energy: 0.92, concerto: 2.93, offtune: 2928, forte1: 25 });
var Cloudburst2 = roverAction("Basic - Cloudburst Dance 2", { node: 2, cast: 1, type: 12288, mv: 141.47, energy: 1.01, concerto: 3.22, offtune: 3216, forte1: 25 });
var UnboundFlow1 = roverAction("Forte Skill - Unbound Flow 1", { node: 2, cast: 4, type: 12288, mv: 171.5, energy: 10, concerto: 20, offtune: 29850, forte1: -60 });
var UnboundFlow2 = roverAction("Forte Skill - Unbound Flow 2", { node: 2, cast: 4, type: 12288, mv: 723.03, energy: 20, concerto: 20, offtune: 28288, forte1: -60 });
var Liberation7 = roverAction("Liberation - Omega Storm", { node: 3, cast: 5, type: 16384, mv: 536.79, concerto: 20, offtune: 48e3, resetEnergy: true });
var Intro7 = roverAction("Intro - Relentless Squall", { node: 4, cast: 6, type: 20480, mv: 198.82, energy: 10, concerto: 10, offtune: 11465, forte1: 20 });
var Outro7 = roverAction("Outro - Storm's Echo", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => applyTeam(AEOLIAN_REALM, 1)
});
var SAND_IN_THE_STORM = new Buff({
  name: "Inherent: Sand in the Storm",
  applyStats: () => addStat(6, 20),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SAND_IN_THE_STORM);
  }
});
var AR_INHERENT_1 = new Inherent({
  name: "Inherent: Sand in the Storm",
  updateBuffs: () => {
    if (currentAction() === Intro7)
      applyCurrent(SAND_IN_THE_STORM, 1);
  }
});
var AR_INHERENT_2 = new Inherent({
  name: "Inherent: Boundless Winds"
  // 20% healing mv
});
var AEOLIAN_REALM = new Buff({
  name: "Aero Rover: Aeolian Realm",
  updateDebuffs: () => {
    if (currentAction().mv > 0)
      maxStackIncrease(AERO_EROSION, 3);
  }
});
var S4_SKILL_BONUS = new Buff({
  name: "Aero Rover S4: Boundaries Shatter in an Instant",
  applyStats: () => addStat(
    17,
    15,
    12288
    /* Type1.Skill */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(S4_SKILL_BONUS);
  }
});
var AR_S1 = new Sequence({ name: "Aero Rover S1: Storm Subsides in the Void" });
var AR_S2 = new Sequence({ name: "Aero Rover S2: Glimmers Fade into the Dark" });
var AR_S3 = new Sequence({
  name: "Aero Rover S3: Illusions Collapse in a Grip",
  applyStats: () => addStat(
    17,
    15,
    64
    /* Attribute.Aero */
  )
});
var AR_S4 = new Sequence({
  name: "Aero Rover S4: Boundaries Shatter in an Instant",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Cloudburst1 || a === Cloudburst2)
      applyCurrent(S4_SKILL_BONUS, 1);
  }
});
var AR_S5 = new Sequence({
  name: "Aero Rover S5: Life and Death Intertwine",
  applyStats: () => {
    if (currentAction() === Liberation7)
      addStat(16, 20);
  }
});
var AR_S6 = new Sequence({
  name: "Aero Rover S6: All Crumble in the Wind",
  applyStats: () => {
    const a = currentAction();
    if (a === UnboundFlow1 || a === UnboundFlow2)
      addStat(16, 30);
  }
});
var ROVER_AERO_RESONATOR = new Resonator({
  name: "Aero Rover",
  element: 64,
  weapon: 0,
  intro: () => Intro7,
  outro: () => Outro7,
  color: "#6fd6b0",
  maxEnergy: 150,
  tier: 2,
  updateDebuffs: () => {
    const a = currentAction();
    if (a === Cloudburst1 || a === Cloudburst2 || a === UnboundFlow1 || a === UnboundFlow2 || a === Liberation7)
      applyCurrent(HEALS, 1);
  },
  // Bloodpact's Pledge names Unbound Flow outright, so that clause's team Aero Amplification is
  // triggered from here rather than from the weapon — see the weapon's own comment for why
  updateBuffs: () => {
    const a = currentAction();
    if ((a === UnboundFlow1 || a === UnboundFlow2) && isHeld(BLOODPACTS_PLEDGE))
      applyTeam(BLOODPACT_AERO_AMP, 1);
  },
  constantStats: () => {
    addStat(1, 10775);
    addStat(0, 438);
    addStat(2, 1137);
  }
});
var ROVER_AERO_TALENTS = new Talent({
  name: "Aero Rover: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(23, 12);
  }
});
var AR_ROTATION = new Rotation([
  NOINTRO,
  Skill6,
  Cloudburst1,
  Cloudburst2,
  MA5,
  BA45,
  ECHO_CANCEL,
  Liberation7,
  Skill6,
  Cloudburst1,
  Cloudburst2,
  MA5,
  BA45,
  UnboundFlow1,
  UnboundFlow2,
  OUTRO,
  INTRO,
  Cloudburst1,
  Cloudburst2,
  ECHO_CANCEL,
  Liberation7,
  Skill6,
  Cloudburst1,
  Cloudburst2,
  MA5,
  UnboundFlow1,
  UnboundFlow2,
  OUTRO
]);
var ROVER_AERO = new Loadout({
  resonator: ROVER_AERO_RESONATOR,
  talent: ROVER_AERO_TALENTS,
  inherent1: AR_INHERENT_1,
  inherent2: AR_INHERENT_2,
  weapons: [BLOODPACTS_PLEDGE],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, REJUV_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(FLEURDELYS, WINDWARD_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    12,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "skill"),
  rotation: AR_ROTATION,
  sequences: [AR_S1, AR_S2, AR_S3, AR_S4, AR_S5, AR_S6]
});

// dist/src/echoes/lahairoi.js
var ACTION_NAMELESS_EXPLORER = new Action("Echo - Nameless Explorer", {
  cast: 8,
  element: 64,
  scaling: 0,
  type: 28672,
  mv: 273.6,
  energy: 3.8
});
var NAMELESS_EXPLORER = new Mainslot({
  name: "Nameless Explorer",
  action: ACTION_NAMELESS_EXPLORER,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      12,
      64
      /* Attribute.Aero */
    );
    addStat(
      17,
      20,
      28672
      /* Type1.Echo */
    );
  }
});
var SOUND_OF_TRUE_NAME_2PC = new Sonata2pc({ name: "Sound of True Name 2pc", constantStats: () => addStat(
  17,
  10,
  64
  /* Attribute.Aero */
) });
var SOUND_OF_TRUE_NAME_BUFF = new Buff({
  name: "Sound of True Name 5pc",
  applyStats: () => {
    addStat(
      9,
      20,
      28672
      /* Type1.Echo */
    );
    addStat(
      17,
      15,
      64
      /* Attribute.Aero */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SOUND_OF_TRUE_NAME_BUFF);
  }
});
var SOUND_OF_TRUE_NAME_5PC = new Sonata({
  name: "Sound of True Name 5pc",
  sonata2pc: SOUND_OF_TRUE_NAME_2PC,
  updateBuffs: () => {
    if (isType(
      28672
      /* Type1.Echo */
    ))
      applyCurrent(SOUND_OF_TRUE_NAME_BUFF, 1);
  }
});
var ACTION_HYVATIA = new Action("Echo - Hyvatia", {
  cast: 8,
  element: 320,
  scaling: 0,
  type: 28672,
  mv: 27.36 * 10,
  updateBuffs: () => queueOutro(HYVATIA_HANDOFF)
});
var HYVATIA_HANDOFF = handoff("Hyvatia: Outro", () => addStat(17, 10));
var HYVATIA = new Mainslot({
  name: "Hyvatia",
  action: ACTION_HYVATIA,
  echoType: 0
});
var ACTION_REACTOR_HUSK = new Action("Echo - Reactor Husk", {
  cast: 8,
  element: 192,
  scaling: 0,
  type: 28672,
  mv: 351
});
var REACTOR_HUSK = new Mainslot({
  name: "Reactor Husk",
  action: ACTION_REACTOR_HUSK,
  echoType: 1,
  constantStats: () => addStat(11, 10)
});
var ACTION_SPACETREK = new Action("Echo - Spacetrek Explorer", {
  cast: 8,
  element: 192,
  scaling: 0,
  updateDebuffs: () => applyCurrent(SHIELD, 1)
});
var SPACETREK_EXPLORER = new Mainslot({
  name: "Spacetrek Explorer",
  action: ACTION_SPACETREK,
  echoType: 0
});
var ACTION_VOIDBORNE_CONSTRUCT = new Action("Echo - Reminiscence: Voidborne Construct", {
  cast: 8,
  element: 256,
  scaling: 0,
  type: 28672,
  mv: 21.88 * 5 + 164.16,
  energy: 0.12 * 5 + 1.36
});
var VOIDBORNE_CONSTRUCT = new Mainslot({
  name: "Reminiscence: Threnodian - Voidborne Construct",
  action: ACTION_VOIDBORNE_CONSTRUCT,
  echoType: 0,
  constantStats: () => {
    addStat(
      17,
      12,
      256
      /* Attribute.Glacio */
    );
    addStat(
      17,
      12,
      16384
      /* Type1.Liberation */
    );
  }
});
var ACTION_GLOMMOTH = new Action("Echo - Glommoth", {
  cast: 8,
  element: 256,
  scaling: 0,
  type: 28672,
  mv: 273.6,
  energy: 3.8,
  updateBuffs: () => queueOutro(GLOMMOTH_HANDOFF)
});
var GLOMMOTH_HANDOFF = handoff("Glommoth: Outro", () => addStat(
  17,
  12,
  256
  /* Attribute.Glacio */
));
var GLOMMOTH = new Mainslot({
  name: "Glommoth",
  action: ACTION_GLOMMOTH,
  echoType: 0
});
var QUIET_SNOWFALL_2PC = new Sonata2pc({ name: "Wishes of Quiet Snowfall 2pc", constantStats: () => addStat(
  17,
  10,
  256
  /* Attribute.Glacio */
) });
var QUIET_SNOWFALL_5PC = new Sonata({
  name: "Wishes of Quiet Snowfall 5pc",
  sonata2pc: QUIET_SNOWFALL_2PC,
  // `appliedByMe`: a "when *you* inflict" payout, so the two extra stacks Lucilla's Film Roll
  // adds to the wearer's own are hers and pay nothing here
  updateBuffs: () => {
    if (appliedByMe(GLACIO_CHAFE) && !isHeld(SNOWFALL_CRIT)) {
      applyCurrent(QUIET_SNOWFALL_GLACIO, 1);
      applyCurrent(SNOWFALL, 1);
    }
  }
});
var QUIET_SNOWFALL_GLACIO = new Buff({
  name: "Wishes of Quiet Snowfall (chafe)",
  applyStats: () => addStat(
    17,
    10,
    256
    /* Attribute.Glacio */
  )
});
var SNOWFALL = new Buff({
  name: "Wishes of Quiet Snowfall: Snowfall",
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Outro */
    )) {
      revokeCurrent(SNOWFALL);
      queueOutro(SNOWFALL_OUTRO);
    } else if (isType(
      16384
      /* Type1.Liberation */
    )) {
      revokeCurrent(SNOWFALL);
      applyCurrent(SNOWFALL_CRIT, 1);
    }
  }
});
var SNOWFALL_CRIT = new Buff({
  name: "Wishes of Quiet Snowfall (liberation)",
  applyStats: () => addStat(9, 25)
});
var SNOWFALL_OUTRO = handoff("Wishes of Quiet Snowfall (outro)", () => addStat(
  17,
  25,
  256
  /* Attribute.Glacio */
));
var NEONLIGHT_LEAP_2PC = new Sonata2pc({ name: "Pact of Neonlight Leap 2pc", constantStats: () => addStat(
  17,
  10,
  320
  /* Attribute.Spectro */
) });
var NEONLIGHT_LEAP_5PC = new Sonata({
  name: "Pact of Neonlight Leap 5pc",
  sonata2pc: NEONLIGHT_LEAP_2PC,
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      queueOutro(NEONLIGHT_LEAP_HANDOFF);
  }
});
var NEONLIGHT_LEAP_HANDOFF = new Buff({
  name: "Pact of Neonlight Leap (outro)",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(6, 15),
  // the TBB half is read late so every contribution has landed this action — the era's flat 10,
  // Reel of Spliced Memories' +20, and Denia's Etched Colors, which grants from its own
  // convertStats() and an ordinary convertStats() here would race
  lateConvertStats: () => {
    addStat(6, Math.min(15, 0.3 * getStat(
      12
      /* Stat.Tbb */
    )));
  }
});
var STARRY_RADIANCE_2PC = new Sonata2pc({ name: "Halo of Starry Radiance 2pc", constantStats: () => addStat(23, 10) });
var STARRY_RADIANCE_5PC = new Sonata({
  name: "Halo of Starry Radiance 5pc",
  sonata2pc: STARRY_RADIANCE_2PC,
  updateBuffs: () => {
    if (applied(HEALS))
      applyTeam(STARRY_RADIANCE_TEAM, 1);
  }
});
var STARRY_RADIANCE_TEAM = new Buff({
  name: "Halo of Starry Radiance (team)",
  convertStats: () => {
    addStat(6, Math.min(25, 0.2 * getStat(
      13
      /* Stat.OfftuneBuildup */
    )));
  }
});
var CHROMATIC_FOAM_2PC = new Sonata2pc({ name: "Chromatic Foam 2pc", constantStats: () => addStat(
  17,
  10,
  192
  /* Attribute.Fusion */
) });
var CHROMATIC_FOAM_5PC = new Sonata({
  name: "Chromatic Foam 5pc",
  sonata2pc: CHROMATIC_FOAM_2PC,
  updateBuffs: () => {
    if (appliedByMe(FUSION_BURST))
      applyCurrent(CHROMATIC_FOAM_BUFF, 1);
  }
});
var CHROMATIC_FOAM_BUFF = new Buff({
  name: "Chromatic Foam",
  applyStats: () => addStat(
    17,
    10,
    192
    /* Attribute.Fusion */
  ),
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      queueOutro(CHROMATIC_FOAM_HANDOFF);
  }
});
var CHROMATIC_FOAM_HANDOFF = new Buff({
  name: "Chromatic Foam (outro)",
  applyStats: () => addStat(
    17,
    25,
    192
    /* Attribute.Fusion */
  ),
  convertStats: () => lostOnSwap()
});
var TRAILBLAZING_STAR_2PC = new Sonata2pc({ name: "Trailblazing Star 2pc", constantStats: () => addStat(
  17,
  10,
  192
  /* Attribute.Fusion */
) });
var TRAILBLAZING_STAR_5PC = new Sonata({
  name: "Trailblazing Star 5pc",
  sonata2pc: TRAILBLAZING_STAR_2PC,
  updateBuffs: () => {
    if (appliedByMe(FUSION_BURST) || appliedByMe(TUNE_RUPTURE_SHIFTING))
      applyCurrent(TRAILBLAZING_STAR_BUFF, 1);
  }
});
var TRAILBLAZING_STAR_BUFF = new Buff({
  name: "Trailblazing Star",
  applyStats: () => {
    addStat(9, 20);
    addStat(
      17,
      20,
      192
      /* Attribute.Fusion */
    );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(TRAILBLAZING_STAR_BUFF);
  }
});
var GILDED_REVELATION_2PC = new Sonata2pc({ name: "Rite of Gilded Revelation 2pc", constantStats: () => addStat(
  17,
  10,
  320
  /* Attribute.Spectro */
) });
var GILDED_REVELATION_5PC = new Sonata({
  name: "Rite of Gilded Revelation 5pc",
  sonata2pc: GILDED_REVELATION_2PC,
  updateBuffs: () => {
    if (isType(
      4096
      /* Type1.Basic */
    ))
      applyCurrent(GILDED_REVELATION_STACKS, 1);
  }
});
var GILDED_REVELATION_STACKS = new Buff({
  name: "Rite of Gilded Revelation",
  maxStacks: 3,
  applyStats: () => {
    addStat(
      17,
      10 * frozenStacks(),
      320
      /* Attribute.Spectro */
    );
    if (frozenStacks() >= 3 && casting(
      5
      /* Cast.Liberation */
    ))
      addStat(
        17,
        40,
        4096
        /* Type1.Basic */
      );
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(GILDED_REVELATION_STACKS);
  }
});
var ACTION_NEBULOUS_CANNON = new Action("Echo - Twin Nova: Nebulous Cannon", {
  cast: 8,
  element: 320,
  scaling: 0,
  type: 28672,
  mv: 80.51 * 2,
  energy: 0.55 * 2
});
var NEBULOUS_CANNON = new Mainslot({
  name: "Twin Nova: Nebulous Cannon",
  action: ACTION_NEBULOUS_CANNON,
  echoType: 1,
  constantStats: () => {
    addStat(
      17,
      12,
      320
      /* Attribute.Spectro */
    );
    addStat(
      17,
      12,
      4096
      /* Type1.Basic */
    );
  }
});
var ACTION_TRICKSTER = new Action("Echo - Trickster", {
  cast: 8,
  element: 192,
  scaling: 0,
  type: 28672,
  mv: 273.6,
  energy: 3.8,
  updateBuffs: () => queueOutro(TRICKSTER_HANDOFF)
});
var TRICKSTER_HANDOFF = new Buff({
  name: "Trickster (outro)",
  applyStats: () => addStat(
    17,
    12,
    192
    /* Attribute.Fusion */
  ),
  convertStats: () => lostOnSwap()
});
var TRICKSTER = new Mainslot({
  name: "Reminiscence: Denia",
  action: ACTION_TRICKSTER,
  echoType: 0
});
var ACTION_VOIDWING_MOTH = new Action("Echo - Voidwing Moth", {
  cast: 8,
  element: 320,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 5.62,
  updateBuffs: () => queueOutro(VOIDWING_HANDOFF)
});
var VOIDWING_HANDOFF = handoff("Voidwing Moth: Outro", () => addStat(6, 12));
var VOIDWING_MOTH = new Mainslot({
  name: "Voidwing Moth",
  action: ACTION_VOIDWING_MOTH,
  echoType: 1
});
var REEL_2PC = new Sonata2pc({ name: "Reel of Spliced Memories 2pc", constantStats: () => addStat(6, 10) });
var REEL_5PC = new Sonata({
  name: "Reel of Spliced Memories 5pc",
  sonata2pc: REEL_2PC,
  updateBuffs: () => {
    if (appliedByMe(TUNE_RUPTURE_SHIFTING) || appliedByMe(TUNE_STRAIN_SHIFTING))
      applyTeam(REEL_TEAM, 1);
  }
});
var REEL_TEAM = new Buff({ name: "Reel of Spliced Memories (team)", applyStats: () => addStat(12, 20) });
var SHATTERED_DREAMS = new Buff({
  name: "Shadow of Shattered Dreams",
  applyStats: () => {
    addStat(
      17,
      35,
      4096
      /* Type1.Basic */
    );
    addStat(
      17,
      35,
      8192
      /* Type1.Heavy */
    );
  }
});
var SHATTERED_DREAMS_1PC = new Sonata1pc({
  name: "Shadow of Shattered Dreams 1pc",
  updateBuffs: () => {
    if (appliedByMe(TUNE_HACK_SHIFTING))
      applyCurrent(SHATTERED_DREAMS, 1);
  }
});
var ACTION_ADAM_SMASHER_LUCY = new Action("Echo - Adam Smasher", {
  cast: 8,
  element: 320,
  scaling: 0,
  type: 28672,
  mv: 273.6,
  energy: 3.8
});
var ADAM_SMASHER_LUCY = new Mainslot({
  name: "Reminiscence - Nightmare: Adam Smasher",
  action: ACTION_ADAM_SMASHER_LUCY,
  echoType: 0,
  constantStats: () => addStat(9, 15)
});
var ACTION_ADAM_SMASHER_REBECCA = new Action("Echo - Adam Smasher", {
  cast: 8,
  element: 128,
  scaling: 0,
  type: 28672,
  mv: 17.1 * 16,
  energy: 0.23 * 16
});
var ADAM_SMASHER_REBECCA = new Mainslot({
  name: "Reminiscence - Nightmare: Adam Smasher",
  action: ACTION_ADAM_SMASHER_REBECCA,
  echoType: 0,
  constantStats: () => addStat(9, 15)
});
var ACTION_SIGILLUM = new Action("Echo - Sigillum", {
  cast: 8,
  element: 192,
  scaling: 0,
  type: 28672,
  mv: 68.4 + 205.2,
  energy: 0.23 + 2.13
});
var SIGILLUM = new Mainslot({
  name: "Sigillum",
  action: ACTION_SIGILLUM,
  echoType: 0,
  constantStats: () => {
    if (currentMember().resonator?.name === "Aemeath")
      addStat(
        17,
        25,
        16384
        /* Type1.Liberation */
      );
  }
});

// dist/src/resonators/aero/sigrika.js
function sigrikaAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA18 = sigrikaAction("Basic - One, Two, Three 1", { node: 0, cast: 1, type: 4096, mv: 52.97, energy: 0.84, concerto: 1.67, offtune: 2664 });
var BA28 = sigrikaAction("Basic - One, Two, Three 2", { node: 0, cast: 1, type: 4096, mv: 100.68, energy: 1.6, concerto: 3.18, offtune: 5064 });
var BA38 = sigrikaAction("Basic - One, Two, Three 3", { node: 0, cast: 1, type: 4096, mv: 111.36, energy: 1.76, concerto: 3.5, offtune: 5600 });
var BA46 = sigrikaAction("Basic - One, Two, Three 4", {
  node: 0,
  cast: 1,
  type: 4096,
  mv: 206.79,
  energy: 3.27,
  concerto: 6.51,
  offtune: 10400,
  updateBuffs: () => applyCurrent(DECIPHER, 1)
});
var MA6 = sigrikaAction("Mid-air - One, Two, Three", { node: 0, cast: 2, type: 4096, mv: 104.78, energy: 1.55, concerto: 3.1, offtune: 4960 });
var MDC2 = sigrikaAction("Dodge Counter - One, Two, Three (Mid-Air)", { node: 0, cast: 0, type: 4096, mv: 206.17, energy: 3.05, concerto: 16.1, offtune: 9920 });
var DC7 = sigrikaAction("Dodge Counter - One, Two, Three", { node: 0, cast: 0, type: 4096, mv: 219.7, energy: 3.26, concerto: 16.5, offtune: 10026 });
var HA7 = sigrikaAction("Heavy - One, Two, Three", { node: 0, cast: 3, type: 8192, mv: 116.28, offtune: 5848, concerto: 3.66, energy: 1.84 });
var EBA = sigrikaAction("Basic - Elucidated", { node: 0, cast: 1, type: 28672, mv: 307.79, offtune: 8259, energy: 2.6, concerto: 5.19, forte1: 1 });
var EDC = sigrikaAction("Dodge Counter - Decipher", { node: 0, cast: 0, type: 28672, mv: 307.79, offtune: 8259, energy: 2.6, concerto: 15.19, forte1: 1 });
var Skill7 = sigrikaAction("Skill - BOOMY BOOM!", { node: 1, cast: 4, type: 12288, mv: 143.15, offtune: 7200, energy: 2.25, concerto: 4.5 });
var ESkill2 = sigrikaAction("Skill - BIG BOOMY BOOM!", { node: 1, cast: 4, type: 28672, mv: 288.09, offtune: 7729, energy: 2.45, concerto: 4.86, forte1: 1 });
var ESkill50 = sigrikaAction("Skill - Soliskin to the Aid", { node: 1, cast: 4, type: 28672, mv: 278.26, offtune: 7466, energy: 2.36, concerto: 4.68, forte1: 1 });
var RunicOutburst = sigrikaAction("Forte - Runic Outburst", { node: 2, type: 28672, mv: 117.67 + 205.92 + 264.75, energy: 10, concerto: 7, offtune: 24800, forte2: 50 });
var RunicChainWhip = sigrikaAction("Forte - Runic Chain Whip", { node: 2, type: 28672, mv: 397.58, energy: 10.01, concerto: 7.03, offtune: 24802, forte2: 50 });
var RunicSoliskin = sigrikaAction("Forte - Runic Soliskin", { node: 2, type: 28672, mv: 397.54, energy: 10, concerto: 7, offtune: 24800, forte2: 50 });
var SCHEMATA = { node: 2, cast: 3, type: 28672, mv: 132.51, energy: 3.34, concerto: 0.5, offtune: 2664, forte1: -2 };
var FHAoutburst = sigrikaAction("Forte Heavy - Schemata of Runes", { ...SCHEMATA, updateBuffs: () => queue(RunicOutburst) });
var FHAchainwhip = sigrikaAction("Forte Heavy - Schemata of Runes", { ...SCHEMATA, updateBuffs: () => queue(RunicChainWhip) });
var FHAsoliskin = sigrikaAction("Forte Heavy - Schemata of Runes", { ...SCHEMATA, updateBuffs: () => queue(RunicSoliskin) });
var FSkill = sigrikaAction("Forte Skill - Learn My True Name", { node: 2, cast: 4, type: 28672, mv: 1211.48, energy: 5.43, concerto: 30, offtune: 101336, forte2: -100 });
var Liberation8 = sigrikaAction("Liberation - Where Trust Leads Me!", {
  node: 3,
  cast: 5,
  type: 28672,
  mv: 861.43,
  concerto: 20,
  offtune: 50400,
  resetEnergy: true,
  updateBuffs: () => applyCurrent(DIVERGENT)
});
var Intro8 = sigrikaAction("Intro - Solsworn Etymology", { node: 4, cast: 6, type: 20480, mv: 163.42, energy: 10, concerto: 10, offtune: 7736 });
var Outro8 = sigrikaAction("Outro - In This Very Moment", { cast: 7, type: 24576, mv: 795, concerto: -100, active: false });
var BLESSING_OF_RUNES = new Buff({
  name: "Sigrika: Blessing of Runes",
  maxStacks: 6,
  applyStats: () => {
    const held = stacksOfTeam(BLESSING_OF_RUNES);
    if (held >= 6 && isHeld(SIGRIKA_RESONATOR)) {
      addStat(
        17,
        30,
        64
        /* Attribute.Aero */
      );
      addStat(
        17,
        30,
        28672
        /* Type1.Echo */
      );
    }
    if (currentAction().active) {
      addStat(
        17,
        3 * held,
        64
        /* Attribute.Aero */
      );
      addStat(
        17,
        3 * held,
        28672
        /* Type1.Echo */
      );
    }
  }
});
var SR_INHERENT_2 = new Inherent({
  name: "Inherent: True Names Aligned",
  updateGlobal: () => {
    if (casting(
      8
      /* Cast.Echo */
    ))
      applyTeam(BLESSING_OF_RUNES, 1);
  },
  convertStats: () => addStat(
    17,
    Math.min(50, 2 * Math.max(0, Math.floor(getStat(
      11
      /* Stat.Er */
    )) - 125)),
    28672
    /* Type1.Echo */
  )
});
var SR_INHERENT_1 = new Inherent({
  name: "Inherent: True Names Invoked",
  updateBuffs: () => {
    if (currentAction() === Intro8)
      applyCurrent(CONVERGENT, 1);
  }
});
function gainsRune() {
  const a = currentAction();
  return a === EBA || a === EDC || a === ESkill2 || a === ESkill50;
}
var DECIPHER = new Buff({
  name: "Sigrika: Decipher",
  updateBuffs: () => {
    lostOnSwap();
  },
  convertStats: () => {
    if (gainsRune())
      revokeCurrent(DECIPHER);
  }
});
var CONVERGENT = new Buff({
  name: "Sigrika: Convergent",
  convertStats: () => {
    if (gainsRune()) {
      addStat(29, 1);
      revokeCurrent(CONVERGENT);
    }
  }
});
var DIVERGENT = new Buff({
  name: "Sigrika: Divergent",
  convertStats: () => {
    if (gainsRune() && !isHeld(CONVERGENT)) {
      addStat(29, 1);
      revokeCurrent(DIVERGENT);
    }
  }
});
var INNATE_GIFT = new Buff({
  name: "Sigrika: Innate Gift?",
  maxStacks: 2,
  applyStats: () => {
    const a = currentAction();
    if (a === RunicChainWhip || a === RunicOutburst || a === RunicSoliskin || a === FSkill) {
      addStat(
        18,
        30 * frozenStacks(),
        28672
        /* Type1.Echo */
      );
      if (a === FSkill)
        revokeCurrent(INNATE_GIFT);
    }
  },
  updateBuffs: () => lostOnSwap()
});
var SOLISKIN_VITALITY = new Buff({
  name: "Sigrika: Soliskin Vitality",
  maxStacks: 60,
  updateBuffs: () => {
    const a = currentAction();
    if (a !== RunicOutburst && a !== RunicChainWhip && a !== RunicSoliskin)
      return;
    const held = frozenStacks();
    if (held >= 30) {
      applyCurrent(INNATE_GIFT, 1);
    }
  },
  applyStats: () => {
    const a = currentAction();
    if (a !== RunicOutburst && a !== RunicChainWhip && a !== RunicSoliskin)
      return;
    const held = frozenStacks();
    if (held >= 30) {
      addStat(16, 50);
    } else if (held > 0)
      addStat(18, 15 * Math.floor(held / 10));
  },
  convertStats: () => {
    const a = currentAction();
    if (a === RunicOutburst || a === RunicChainWhip || a === RunicSoliskin) {
      removeStack(SOLISKIN_VITALITY, Math.min(frozenStacks(), 30));
    }
  }
});
var SIGRIKA_RESONATOR = new Resonator({
  name: "Sigrika",
  element: 64,
  weapon: 3,
  intro: () => Intro8,
  outro: () => Outro8,
  color: "#7ee0c9",
  maxEnergy: 125,
  // Soliskin Vitality's own gain — any team member's Echo cast
  updateGlobal: () => {
    if (casting(
      8
      /* Cast.Echo */
    ))
      applyCurrent(SOLISKIN_VITALITY, 10);
  },
  constantStats: () => {
    addStat(1, 10775);
    addStat(0, 437.5);
    addStat(2, 1137);
  }
});
var SIGRIKA_TALENTS = new Talent({
  name: "Sigrika: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var BA234 = new ActionGroup("Basic - One, Two, Three 234", [BA28, BA38, BA46]);
var SR_ROTATION = new Rotation([
  INTRO,
  ECHO_ONFIELD,
  BA234,
  EBA,
  FHAchainwhip,
  Liberation8,
  BA234,
  EBA,
  FHAoutburst,
  FSkill,
  Skill7,
  BA38,
  BA46,
  EBA,
  OUTRO
]);
var SR_ROTATION_FAST = new Rotation([
  INTRO,
  ECHO_ONFIELD,
  BA234,
  EBA,
  FHAchainwhip,
  Liberation8,
  BA234,
  EBA,
  FHAoutburst,
  FSkill,
  OUTRO
]);
var SIGRIKA = new Loadout({
  resonator: SIGRIKA_RESONATOR,
  talent: SIGRIKA_TALENTS,
  inherent1: SR_INHERENT_1,
  inherent2: SR_INHERENT_2,
  weapons: [SOLSWORN_CIPHERS, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [new EchoLoadout(NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    12,
    5,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: SR_ROTATION
});
var SIGRIKA_FAST = new Loadout({
  resonator: SIGRIKA_RESONATOR,
  talent: SIGRIKA_TALENTS,
  inherent1: SR_INHERENT_1,
  inherent2: SR_INHERENT_2,
  weapons: [SOLSWORN_CIPHERS, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [new EchoLoadout(NAMELESS_EXPLORER, SOUND_OF_TRUE_NAME_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    12,
    5,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: SR_ROTATION_FAST
});

// dist/src/weapons/rectifier.js
var RIME_DRAPED_SPROUTS = new Weapon({
  weaponType: 4,
  name: "Rime-Draped Sprouts",
  updateBuffs: () => {
    if (casting(
      4
      /* Cast.Skill */
    ))
      applyCurrent(PANORAMA_STACKS, 1);
  },
  constantStats: () => {
    addStat(0, 500);
    addStat(10, 72);
    addStat(6, 12);
  }
});
var PANORAMA_STACKS = new Buff({
  name: "Rime-Draped Sprouts: Panorama",
  maxStacks: 3,
  applyStats: () => addStat(
    17,
    12 * frozenStacks(),
    4096
    /* Type1.Basic */
  ),
  // on outro: 3+ stacks convert into the permanent off-field version, short of 3 they're just lost
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Outro */
    )) {
      if (frozenStacks() >= 3)
        applyCurrent(PANORAMA_OFFIELD, 1);
      revokeCurrent(PANORAMA_STACKS);
    }
  }
});
var PANORAMA_OFFIELD = new Buff({
  name: "Rime-Draped Sprouts: Panorama (off field)",
  applyStats: () => {
    if (!currentAction().active) {
      addStat(
        17,
        52,
        4096
        /* Type1.Basic */
      );
    }
  }
});
var STRINGMASTER = new Weapon({
  weaponType: 4,
  name: "Stringmaster",
  updateBuffs: () => {
    if (isType(
      12288
      /* Type1.Skill */
    ))
      applyCurrent(STRINGMASTER_STACKS, 1);
  },
  constantStats: () => {
    addStat(0, 500);
    addStat(9, 36);
    addStat(17, 12);
  }
});
var STRINGMASTER_STACKS = new Buff({
  name: "Stringmaster: Electric Amplification",
  maxStacks: 2,
  applyStats: () => {
    if (!currentAction().active)
      addStat(6, 12);
    addStat(6, 12 * frozenStacks());
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(STRINGMASTER_STACKS);
  }
});
var WHISPERS_OF_SIRENS = new Weapon({
  weaponType: 4,
  name: "Whispers of Sirens",
  updateBuffs: () => {
    if ((casting(
      6
      /* Cast.Intro */
    ) || casting(
      1
      /* Cast.Basic */
    ) || casting(
      2
      /* Cast.MidAir */
    )) && !stacksOf(GENTLE_DREAM))
      applyCurrent(GENTLE_DREAM, 1);
  },
  constantStats: () => {
    addStat(0, 500);
    addStat(10, 72);
    addStat(6, 12);
  }
});
var GENTLE_DREAM = new Buff({
  name: "Whispers of Sirens: Gentle Dream",
  maxStacks: 3,
  updateBuffs: () => {
    lostOnSwap();
    if (casting(
      8
      /* Cast.Echo */
    ))
      applyCurrent(GENTLE_DREAM, 1);
  },
  applyStats: () => {
    const held = frozenStacks();
    if (held < 2)
      return;
    addStat(
      17,
      40,
      4096
      /* Type1.Basic */
    );
    if (held >= 3)
      addStat(
        20,
        12,
        384
        /* Attribute.Havoc */
      );
  }
});
var LETHEAN_ELEGY = new Weapon({
  weaponType: 4,
  name: "Lethean Elegy",
  updateBuffs: () => {
    if (isType(
      28672
      /* Type1.Echo */
    ))
      applyCurrent(UNDERWORLD_REQUIEM, 1);
  },
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(6, 12);
  }
});
var UNDERWORLD_REQUIEM = new Buff({
  name: "Lethean Elegy: Underworld Requiem",
  applyStats: () => {
    addStat(
      17,
      32,
      12288
      /* Type1.Skill */
    );
    addStat(
      18,
      32,
      28672
      /* Type1.Echo */
    );
    addStat(22, 8);
  }
});
var FREEZE_FRAME = new Weapon({
  weaponType: 4,
  name: "Freeze Frame",
  updateBuffs: () => {
    if (appliedByMe(GLACIO_CHAFE)) {
      applyCurrent(FREEZE_FRAME_SELF, 1);
      applyTeam(FREEZE_FRAME_TEAM, 1);
    }
  },
  constantStats: () => {
    addStat(0, 587.5);
    addStat(9, 24.3);
    addStat(6, 12);
  }
});
var FREEZE_FRAME_SELF = new Buff({
  name: "Freeze Frame: Light's Offering",
  applyStats: () => addStat(
    17,
    30,
    256
    /* Attribute.Glacio */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(FREEZE_FRAME_SELF);
  }
});
var FREEZE_FRAME_TEAM = new Buff({
  name: "Freeze Frame: Light's Offering (team)",
  applyStats: () => addStat(6, 24)
});
var SK_SIG = new Weapon({
  weaponType: 4,
  name: "Stellar Symphony",
  updateBuffs: () => {
    if (casting(
      5
      /* Cast.Liberation */
    ))
      applyCurrent(SK_SIG_CONCERTO, 1);
    if (casting(
      4
      /* Cast.Skill */
    ) && applied(HEALS)) {
      applyTeam(SK_SIG_TEAM, 1);
    }
  },
  constantStats: () => {
    addStat(0, 412.5);
    addStat(11, 77.04);
    addStat(7, 12);
  }
});
var SK_SIG_TEAM = new Buff({
  name: "Stellar Symphony: Astral Evolvement (team)",
  applyStats: () => addStat(6, 14)
});
var SK_SIG_CONCERTO = new Buff({
  name: "Stellar Symphony: Astral Evolvement",
  maxStacks: 2,
  applyStats: () => {
    if (frozenStacks() === 1 && casting(
      5
      /* Cast.Liberation */
    )) {
      applyCurrent(SK_SIG_CONCERTO, 1);
      addStat(26, 8);
    } else if (frozenStacks() === 2 && casting(
      7
      /* Cast.Outro */
    ))
      removeStack(SK_SIG_CONCERTO, 2);
  },
  display: () => `Stellar Symphony: Astral Evolvement${frozenStacks() === 1 ? "" : " (cooldown)"}`
});
var FORGED_DWARF_STAR = new Weapon({
  weaponType: 4,
  name: "Forged Dwarf Star",
  constantStats: () => {
    addStat(0, 500);
    addStat(9, 36);
    addStat(6, 12);
  },
  updateBuffs: () => {
    if (appliedByMe(FUSION_BURST) || appliedByMe(TUNE_STRAIN_SHIFTING))
      applyCurrent(DISSOLUTION_LIB, 1);
  }
});
var DISSOLUTION_LIB = new Buff({
  name: "Forged Dwarf Star: Dissolution",
  applyStats: () => addStat(
    17,
    36,
    16384
    /* Type1.Liberation */
  ),
  // the team half reacts to *anyone's* cast, so it watches from updateGlobal (runs every action
  // for a locally-held buff) rather than update (the wielder's own turns only)
  updateGlobal: () => {
    if (applied(FUSION_BURST) || applied(TUNE_STRAIN_SHIFTING))
      applyTeam(DISSOLUTION_TEAM, 1);
  }
});
var DISSOLUTION_TEAM = new Buff({
  name: "Forged Dwarf Star: Dissolution (team)",
  applyStats: () => addStat(6, 24)
});
var FIRSTLIGHTS_HERALD = new Weapon({
  weaponType: 4,
  name: "Firstlight's Herald",
  updateBuffs: () => {
    if (casting(
      5
      /* Cast.Liberation */
    ))
      applyCurrent(SPRING_WREATH_CONCERTO, 1);
    if (appliedByMe(GLACIO_CHAFE))
      applyCurrent(SNOW_TAINT, 1);
    if (applied(HEALS))
      applyCurrent(RIPPLES, 1);
    if (isHeld(SNOW_TAINT) && isHeld(RIPPLES))
      applyTeam(SPRING_WREATH_TEAM, 1);
  },
  constantStats: () => {
    addStat(0, 412.5);
    addStat(11, 77.04);
    addStat(7, 12);
  }
});
var SPRING_WREATH_CONCERTO = new Buff({
  name: "Firstlight's Herald: Spring Wreath",
  maxStacks: 2,
  applyStats: () => {
    if (frozenStacks() === 1 && casting(
      5
      /* Cast.Liberation */
    )) {
      applyCurrent(SPRING_WREATH_CONCERTO, 1);
      addStat(26, 8);
    } else if (frozenStacks() === 2 && casting(
      7
      /* Cast.Outro */
    ))
      removeStack(SPRING_WREATH_CONCERTO, 2);
  },
  display: () => `Firstlight's Herald: Spring Wreath${frozenStacks() === 1 ? "" : " (cooldown)"}`
});
var SNOW_TAINT = new Buff({ name: "Firstlight's Herald: Snow Taint" });
var RIPPLES = new Buff({ name: "Firstlight's Herald: Ripples" });
var SPRING_WREATH_TEAM = new Buff({
  name: "Firstlight's Herald: Spring Wreath (team)",
  applyStats: () => addStat(6, 20)
});

// dist/src/resonators/havoc/phrolova.js
function phroAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var BA19 = phroAction("Basic - Movement of Life and Death 1", { node: 0, cast: 1, type: 4096, mv: 106.9, offtune: 5376, energy: 1.68, concerto: 3.36 });
var BA29 = phroAction("Basic - Movement of Life and Death 2", { node: 0, cast: 1, type: 4096, mv: 95.43, offtune: 4800, energy: 1.5, concerto: 3 });
var BA39 = phroAction("Basic - Movement of Life and Death 3", { node: 0, cast: 1, type: 4096, mv: 196.14, offtune: 9864, energy: 3.12, concerto: 6.18, updateBuffs: () => gainNote(1) });
var Skill8 = phroAction("Skill - Whispers in a Fleeting Dream", { node: 1, cast: 4, type: 12288, mv: 211.94, offtune: 4264, energy: 13.34, concerto: 10, updateBuffs: () => gainNote(2) });
var FBA = phroAction("Basic - Movement of Fate and Finality", { node: 2, cast: 1, type: 12288, mv: 505.01, offtune: 10161, energy: 3.21, concerto: 10.02, updateBuffs: () => gainNote(1) });
var FSkill2 = phroAction("Skill - Murmurs in a Haunting Dream", { node: 2, cast: 4, type: 12288, mv: 464.07, offtune: 9338, energy: 2.95, concerto: 10, updateBuffs: () => gainNote(2) });
var ScarletCoda = phroAction("Heavy - Scarlet Coda", {
  node: 0,
  cast: 3,
  cast2: 8,
  type: 12288,
  mv: 660.16,
  offtune: 166144,
  energy: 6.93,
  concerto: 40
});
var Liberation9 = phroAction("Liberation - Waltz of Forsaken Depths", {
  node: 3,
  cast: 5,
  concerto: 20,
  updateBuffs: () => {
    applyCurrent(MAESTRO, 1);
    setStacksSelf(NOTES, stacksOf(NOTES) & ~(15 << 12) | 10 << 12);
  }
});
var Intro9 = phroAction("Intro - Suite of Quietus", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 201.52,
  offtune: 10137,
  energy: 10,
  concerto: 10
});
var EIntro = phroAction("Intro - Suite of Immortality", {
  node: 4,
  cast: 6,
  type: 12288,
  mv: 596.43,
  offtune: 9600,
  energy: 10,
  concerto: 10,
  // the Waltz ends here, and everything it was playing through goes with it: the unplayed notes,
  // the chances left, the front note's play count — the store keeps only its always-set bit
  updateBuffs: () => {
    revokeCurrent(MAESTRO);
    setStacksSelf(NOTES, stacksOf(NOTES) & 1 << 16);
  }
});
var Outro9 = phroAction("Outro - Unfinished Piece", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(PHROLOVA_OUTRO)
});
function hecateAction(id, mv, def2 = {}) {
  return new Action(id, { element: 384, scaling: 0, type: 28672, active: false, mv, ...def2 });
}
var NOTE = { updateBuffs: () => applyCurrent(AFTERSOUND, 1) };
var EBA_STRINGS = hecateAction("Enhanced - Hecate Strings", 347.93, NOTE);
var EBA_WINDS = hecateAction("Enhanced - Hecate Winds", 330.53, NOTE);
var EBA_CADENZA = hecateAction("Enhanced - Hecate Cadenza", 347.93, NOTE);
var HBA1 = hecateAction("Basic - Hecate 1", 27.84);
var HBA2 = hecateAction("Basic - Hecate 2", 27.84, { updateBuffs: () => drawNote(false, true) });
var NOTE_ACTIONS = [EBA_STRINGS, EBA_WINDS, EBA_CADENZA];
var SWAP_NOTES = NOTE_ACTIONS.map((a) => a.swap());
function gainNote(note) {
  if (!currentAction().mv)
    return;
  if (isHeld(ACCIDENTAL)) {
    note = 3;
    revokeCurrent(ACCIDENTAL);
  }
  const word = stacksOf(NOTES);
  for (let shift = 0; shift < 12; shift += 2) {
    if (word >> shift & 3)
      continue;
    setStacksSelf(NOTES, word | note << shift);
    return;
  }
  for (let shift = 0; shift < 12; shift += 2) {
    if ((word >> shift & 3) === 3)
      continue;
    const notes = word & 4095;
    setStacksSelf(NOTES, word & ~4095 | notes & (1 << shift) - 1 | notes >> shift + 2 << shift & 4095 | note << 10);
    return;
  }
}
function drawNote(charged, manual = false) {
  const her = currentTeam().memberOf(PHROLOVA_RESONATOR);
  if (!her.stacksOf(MAESTRO))
    return;
  let word = her.stacksOf(NOTES);
  const note = word & 3;
  if (!note)
    return;
  if (charged) {
    if (!(word >> 12 & 15))
      return;
    word -= 1 << 12;
  }
  const plays = (word >> 17 & 3) + 1;
  if (plays < (word >> 19 & 1 ? 2 : 3)) {
    word = word & ~(3 << 17) | plays << 17;
  } else {
    word = (word & ~4095 & ~(3 << 17) | (word & 4095) >> 2) ^ 1 << 19;
  }
  her.setStacks(NOTES, word);
  const played = her.isHeld(PH_S3) ? 3 : note;
  queueOn(PHROLOVA_RESONATOR, (manual ? SWAP_NOTES : NOTE_ACTIONS)[played - 1]);
}
var AFTERSOUND = new Buff({
  name: "Phrolova: Aftersound",
  maxStacks: 124,
  // first 24 stacks pay 2.5% Crit DMG each, every stack past that pays 1%, capped at 100% total
  applyStats: () => {
    const n = frozenStacks(), held = Math.min(n, 24), overflow = n - held;
    addStat(10, Math.min(100, held * 2.5 + overflow));
    if (currentAction() === ScarletCoda) {
      addStat(15, 82.55 * held);
    }
  }
});
var NOTES = new Buff({
  name: "Phrolova: Volatile Notes",
  maxStacks: 1048575,
  display: () => {
    let slots = "";
    for (let shift = 0; shift < 12; shift += 2)
      slots += "-SWC"[frozenStacks() >> shift & 3];
    return `Phrolova: Volatile Notes [${slots}]`;
  }
});
var MAESTRO = new Buff({
  name: "Phrolova: Maestro",
  applyStats: () => addStat(6, 120),
  // Any active Echo Skill cast (hers or a teammate's) spends a chance and plays a note.
  // updateGlobal() keeps the "current" pointers on her own slot, so drawNote() resolves against her.
  updateGlobal: () => {
    if (casting(
      8
      /* Cast.Echo */
    ) && currentAction().active)
      drawNote(true);
  }
});
var ACCIDENTAL = new Buff({
  name: "Inherent: Accidental"
});
var PH_INHERENT_1 = new Inherent({
  name: "Inherent: Accidental",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Intro9 || a === EIntro || casting(
      8
      /* Cast.Echo */
    ))
      applyCurrent(ACCIDENTAL, 1);
  }
});
var PH_INHERENT_2 = new Inherent({
  name: "Inherent: Octet",
  // Octet: 10 Aftersound the instant she's on the team, not tied to when she first acts — and
  // the note store itself, empty (its always-set bit alone; see NOTES)
  combatStart: () => {
    applyCurrent(AFTERSOUND, 10);
  }
});
var PHROLOVA_OUTRO = new Buff({
  name: "Phrolova: Outro",
  applyStats: () => {
    addStat(
      18,
      20,
      384
      /* Attribute.Havoc */
    );
    addStat(
      18,
      25,
      8192
      /* Type1.Heavy */
    );
  },
  // Also the two notes her Outro owes: this is adopted on the incoming resonator's own Intro, so
  // it is the thing that sees the Intro they play — and drawNote() puts them back on her slot.
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) && currentTeam().memberOf(PHROLOVA_RESONATOR).stacksOf(MAESTRO)) {
      drawNote(false);
      drawNote(false);
    }
    lostOnSwap();
  }
});
var Apparition = phroAction("Hecate - Apparition of Beyond", { type: 28672, mv: 216.42 });
var PH_S1 = new Sequence({
  name: "Phrolova S1: A Key to Netherworld's Secrets",
  combatStart: () => applyCurrent(NOTES, 3 | 3 << 2),
  applyStats: () => {
    const a = currentAction();
    if (a === FBA || a === FSkill2)
      addStat(16, 80);
  }
});
var PH_S2 = new Sequence({
  name: "Phrolova S2: A Rope Tied to a Life Beyond",
  updateBuffs: () => {
    if (currentAction() === ScarletCoda)
      applyCurrent(AFTERSOUND, 14);
  },
  applyStats: () => {
    if (currentAction() === ScarletCoda)
      addStat(16, 75);
  }
});
var PH_S3 = new Sequence({
  name: "Phrolova S3: A Dagger to Cut Clean Obsessions",
  applyStats: () => addStat(
    18,
    80,
    28672
    /* Type1.Echo */
  )
});
var PH_S4_TEAM = new Buff({
  name: "Phrolova S4: A Torch Illuminating the Path (team)",
  applyStats: () => addStat(17, 20)
});
var PH_S4 = new Sequence({
  name: "Phrolova S4: A Torch Illuminating the Path",
  updateBuffs: () => {
    if (casting(
      8
      /* Cast.Echo */
    ))
      applyTeam(PH_S4_TEAM, 1);
  }
});
var PH_S5 = new Sequence({ name: "Phrolova S5: A Forked Road in Fate's Heartland" });
var PH_S6 = new Sequence({
  name: "Phrolova S6: A Night to Depart From Eternal Rest",
  updateBuffs: () => {
    const a = currentAction();
    if (a === FBA || a === FSkill2)
      queue(Apparition);
    if (a === Apparition)
      applyCurrent(AFTERSOUND, 8);
  },
  applyStats: () => {
    const a = currentAction();
    if (a === EBA_STRINGS || a === EBA_WINDS || a === EBA_CADENZA)
      addStat(16, 24);
    if (stacksOf(MAESTRO)) {
      if (a.active)
        addStat(
          17,
          60,
          384
          /* Attribute.Havoc */
        );
      else
        addStat(19, 40);
    }
  }
});
var PHROLOVA_RESONATOR = new Resonator({
  name: "Phrolova",
  element: 384,
  weapon: 4,
  color: "#a62c57",
  // Maestro still open means Suite of Immortality (EIntro) instead of plain Intro
  intro: () => stacksOf(MAESTRO) ? EIntro : Intro9,
  outro: () => Outro9,
  maxEnergy: 0,
  combatStart: () => {
    applyCurrent(NOTES, 1 << 16);
  },
  // initialize notes state
  constantStats: () => {
    addStat(1, 10775);
    addStat(0, 437.5);
    addStat(2, 1137);
  }
});
var PHROLOVA_TALENTS = new Talent({
  name: "Phrolova: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var BA1232 = new ActionGroup("Basic - Movement of Life and Death 123", [BA19, BA29, BA39, DODGE]);
var PH_LOOP = new Rotation([
  NOINTRO,
  BA29,
  INTRO,
  BA39,
  ECHO_ONFIELD,
  FBA,
  Skill8,
  FBA,
  DODGE,
  BA1232,
  FBA,
  DODGE,
  ScarletCoda,
  Liberation9,
  HBA1,
  HBA2,
  OUTRO
]);
var PHROLOVA = new Loadout({
  resonator: PHROLOVA_RESONATOR,
  talent: PHROLOVA_TALENTS,
  inherent1: PH_INHERENT_1,
  inherent2: PH_INHERENT_2,
  weapons: [LETHEAN_ELEGY, COSMIC_RIPPLES, STRINGMASTER],
  echoLoadouts: [new EchoLoadout(NM_HECATE, DREAM_OF_THE_LOST_3PC, HAVOC_ECLIPSE_2PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    14,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "skill"),
  rotation: PH_LOOP,
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6]
});
var PH_LOOP_DUAL_DPS = new Rotation([
  NOINTRO,
  BA29,
  INTRO,
  BA39,
  ECHO_ONFIELD,
  FBA,
  Skill8,
  FBA,
  DODGE,
  BA1232,
  FBA,
  ScarletCoda,
  Liberation9,
  OUTRO
]);
var PHROLOVA_DUAL_DPS = new Loadout({
  resonator: PHROLOVA_RESONATOR,
  talent: PHROLOVA_TALENTS,
  inherent1: PH_INHERENT_1,
  inherent2: PH_INHERENT_2,
  weapons: [LETHEAN_ELEGY, COSMIC_RIPPLES, STRINGMASTER],
  echoLoadouts: [
    new EchoLoadout(NM_HECATE, DREAM_OF_THE_LOST_3PC, HAVOC_ECLIPSE_2PC),
    new EchoLoadout(HERON, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    14,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "skill"),
  rotation: PH_LOOP_DUAL_DPS,
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6]
});

// dist/src/resonators/electro/augusta.js
function augustaAction(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var BA110 = augustaAction("Basic - Hunter's Path 1", { node: 0, cast: 1, type: 4096, mv: 57.46, energy: 0.73, concerto: 1.45, offtune: 2312, forte1: 99, forte2: 74 });
var BA210 = augustaAction("Basic - Hunter's Path 2", { node: 0, cast: 1, type: 4096, mv: 134, energy: 1.7, concerto: 3.38, offtune: 5392, forte1: 230, forte2: 172 });
var BA310 = augustaAction("Basic - Hunter's Path 3", { node: 0, cast: 1, type: 4096, mv: 196.83, energy: 2.49, concerto: 4.95, offtune: 7920, forte1: 336, forte2: 252 });
var BA47 = augustaAction("Basic - Hunter's Path 4", { node: 0, cast: 1, type: 4096, mv: 193.89, energy: 2.46, concerto: 4.89, offtune: 7803, forte1: 333, forte2: 249 });
var MA7 = augustaAction("Mid-air - Hunter's Path", { node: 0, cast: 2, type: 4096, mv: 119.3, energy: 1.5, concerto: 2, offtune: 7200, forte1: 50, forte2: 154 });
var DC8 = augustaAction("Dodge Counter - Hunter's Path 2", { node: 0, cast: 0, type: 4096, mv: 134, energy: 1.7, concerto: 13.38, offtune: 5392, forte1: 230, forte2: 172 });
var MDC3 = augustaAction("Dodge Counter - Hunter's Path (Mid-Air)", { node: 0, cast: 0, type: 4096, mv: 119.3, energy: 1.5, concerto: 12, offtune: 7200, forte1: 50, forte2: 154 });
var HA8 = augustaAction("Heavy - Hunter's Path", { node: 0, cast: 3, type: 8192, mv: 139.17, energy: 1.77, concerto: 3.51, offtune: 5601, forte1: 342, forte2: 255 });
var FHA12 = augustaAction("Heavy - Thunderoar: Backstep", { node: 0, cast: 3, type: 8192, mv: 53.68, energy: 0.5, concerto: 1, offtune: 1600, forte1: -660, forte2: 50 });
var FHA23 = augustaAction("Heavy - Thunderoar: Spinslash", { node: 0, cast: 3, type: 8192, mv: 425.16, energy: 4.47, concerto: 8.91, offtune: 14256, forte2: 744 });
var FJump2 = augustaAction("Heavy - Thunderoar: Uppercut", { node: 0, cast: 3, type: 8192, mv: 357.86, energy: 3.76, concerto: 7.5, offtune: 12e3, forte1: -660, forte2: 382 });
var Skill9 = augustaAction("Skill - Warrior's Blade", { node: 1, cast: 4, type: 12288, mv: 656.1, energy: 9, concerto: 10, offtune: 4491, forte1: 660, forte2: 500 });
var FSkill1 = augustaAction("Forte Skill - Undying Sunlight: Strike", {
  node: 2,
  cast: 4,
  type: 12288,
  mv: 278.34,
  energy: 5,
  concerto: 7,
  offtune: 18200,
  forte2: -4e3,
  applyStats: () => {
    if (forte2() > 4e3)
      setForte2(4e3);
  }
});
var FSkill22 = augustaAction("Forte Skill - Undying Sunlight: Leap", { node: 2, cast: 4, type: 12288, mv: 278.35, energy: 5, concerto: 7, offtune: 11200 });
var FSkill3 = augustaAction("Forte Skill - Undying Sunlight: Plunge", {
  node: 2,
  cast: 4,
  type: 8192,
  mv: 865.83,
  energy: 11,
  concerto: 7,
  offtune: 24e3,
  updateBuffs: () => applyCurrent(MAJESTY, 1)
});
var Lib1 = augustaAction("Liberation - Sword of Eternal Oath", { node: 3, cast: 5, type: 8192, mv: 1099.48, energy: 4.74, concerto: 20, offtune: 29342, forte2: 2e3, resetEnergy: true });
var Lib2 = augustaAction("Liberation - Sublime is the Sun", {
  node: 3,
  cast: 5,
  updateBuffs: () => {
    queue(Lib2fua);
    queue(Lib3);
    applyTeam(RULERS_REALM, 1);
    revokeCurrent(MAJESTY);
  }
});
var Lib2fua = augustaAction("Liberation - Sublime is the Sun: Sunborne x9", { node: 3, cast: 5, type: 8192, mv: 1073.61, concerto: 18, offtune: 64800 });
var Lib3 = augustaAction("Liberation - Sublime is the Sun: Everbright Protector", {
  node: 3,
  cast: 5,
  type: 8192,
  mv: 1192.93,
  concerto: 10,
  offtune: 50400,
  updateBuffs: () => {
    if (currentTeam().slots.some((s) => s.resonator === PHROLOVA_RESONATOR))
      revokeBuff(PHROLOVA_RESONATOR, MAESTRO);
  }
});
var Intro10 = augustaAction("Intro - Stride of Goldenflare", { node: 4, cast: 6, type: 20480, mv: 198.82, energy: 10, concerto: 10, offtune: 9600, forte1: 660, forte2: 800 });
var Outro10 = augustaAction("Outro - Battlesong of the Unyielding", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(BATTLESONG)
});
var MAJESTY = new Buff({ name: "Augusta: Majesty", maxStacks: 2 });
var CROWN_OF_WILLS = new Buff({
  name: "Augusta: Crown of Wills",
  applyStats: () => addStat(
    17,
    15,
    128
    /* Attribute.Electro */
  ),
  convertStats: () => {
    const a = currentAction();
    if (a === Lib3) {
      revokeCurrent(CROWN_OF_WILLS);
    }
  }
});
var RULERS_REALM = new Buff({
  name: "Augusta: Ruler's Realm",
  updateDebuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) && !applied(SHIELD))
      applyCurrent(SHIELD, 1);
  }
});
var BATTLESONG = new Buff({
  name: "Augusta: Outro",
  updateBuffs: () => {
    lostOnSwap();
  },
  applyStats: () => addStat(18, 15)
});
var SHIELDS = new Map([
  [FSkill22, 2],
  [FSkill3, 2],
  [Lib1, 2],
  ...[BA110, BA210, BA310, BA47, MA7, DC8, MDC3, HA8, FHA12, FHA23, FJump2, Skill9, FSkill1, Lib2, Lib2fua, Lib3, Intro10].map((a) => [a, 1])
]);
var AG_INHERENT_1 = new Inherent({
  name: "Inherent: Glory's Favor",
  updateDebuffs: () => {
    const n = SHIELDS.get(currentAction());
    if (n)
      applyCurrent(SHIELD, n);
  }
});
var AG_INHERENT_2 = new Inherent({
  name: "Inherent: Blazing Valor",
  combatStart: () => {
    applyCurrent(MAJESTY, 1);
    applyCurrent(CROWN_OF_WILLS, 1);
  }
});
var AUGUSTA_RESONATOR = new Resonator({
  name: "Augusta",
  element: 128,
  weapon: 1,
  intro: () => Intro10,
  outro: () => Outro10,
  color: "#d7370f",
  maxEnergy: 125,
  // reacts to *any* team member's own Outro, not just her own — currentSlot is forced to her own
  // holder for this call, so the real actor's own held gear comes off currentTeam().slot instead
  updateGlobal: () => {
    if (casting(
      7
      /* Cast.Outro */
    ) && currentTeam().slot.isHeld(BATTLESONG)) {
      applyCurrent(MAJESTY, 1);
      applyCurrent(CROWN_OF_WILLS, 1);
    }
  },
  constantStats: () => {
    addStat(1, 10300);
    addStat(0, 463);
    addStat(2, 1112);
  }
});
var AUGUSTA_TALENTS = new Talent({
  name: "Augusta: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var AG_ROTATION = new Rotation([
  INTRO,
  FHA12,
  FHA23,
  Skill9,
  Lib1,
  FHA12,
  FHA23,
  FSkill1,
  FSkill22,
  FSkill3,
  Lib2,
  ECHO_SWAP,
  OUTRO
]);
var AUGUSTA = new Loadout({
  resonator: AUGUSTA_RESONATOR,
  talent: AUGUSTA_TALENTS,
  inherent1: AG_INHERENT_1,
  inherent2: AG_INHERENT_2,
  weapons: [THUNDERFLARE_DOMINION, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR, VERDANT_SUMMIT],
  echoLoadouts: [new EchoLoadout(FALSE_SOVEREIGN, COV_3PC, VOID_THUNDER_2PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    11,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "heavy"),
  rotation: AG_ROTATION
});

// dist/src/resonators/electro/buling.js
function bulingAction(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var BA111 = bulingAction("Basic - Hexagram Calls, Lightning Falls 1", { node: 0, cast: 1, type: 4096, mv: 41.46, offtune: 3336, energy: 1.06, concerto: 3.34 });
var BA211 = bulingAction("Basic - Hexagram Calls, Lightning Falls 2", { node: 0, cast: 1, type: 4096, mv: 66.9, offtune: 5384, energy: 1.7, concerto: 5.4, forte1: 1 });
var BA311 = bulingAction("Basic - Hexagram Calls, Lightning Falls 3", { node: 0, cast: 1, type: 4096, mv: 47.02, offtune: 3784, energy: 1.2, concerto: 3.8 });
var BA48 = bulingAction("Basic - Hexagram Calls, Lightning Falls 4", { node: 0, cast: 1, type: 4096, mv: 93.64, offtune: 7536, energy: 2.36, concerto: 7.54, forte1: 1 });
var MA8 = bulingAction("Mid-air - Hexagram Calls, Lightning Falls", { node: 0, cast: 2, type: 4096, mv: 73.96, offtune: 4960, energy: 1.24, concerto: 4.96, forte1: 1 });
var DC9 = bulingAction("Dodge Counter - Hexagram Calls, Lightning Falls 3", { node: 0, cast: 0, type: 4096, mv: 47.02, offtune: 3784, energy: 1.2, concerto: 13.8 });
var YANG = { updateBuffs: () => {
  applyCurrent(MINOR_YANG, 1);
  if (isHeld(MINOR_YIN)) {
    revokeCurrent(MINOR_YANG);
    revokeCurrent(MINOR_YIN);
    applyCurrent(YIN_YANG_BALANCE, 1);
  }
} };
var YIN = {
  updateDebuffs: () => applyCurrent(HEALS, 1),
  updateBuffs: () => {
    applyCurrent(MINOR_YIN, 1);
    if (isHeld(MINOR_YANG)) {
      revokeCurrent(MINOR_YANG);
      revokeCurrent(MINOR_YIN);
      applyCurrent(YIN_YANG_BALANCE, 1);
    }
  }
};
var HA_MOUNTAIN_OVER_THUNDER = bulingAction("Heavy - Mountain Over Thunder", { node: 0, cast: 3, type: 8192, mv: 178.93, offtune: 8e3, energy: 3, concerto: 15, forte1: -2, ...YANG });
var HA_THUNDER_OVER_MOUNTAIN = bulingAction("Heavy - Thunder Over Mountain", { node: 0, cast: 3, type: 8192, mv: 89.47, offtune: 8e3, energy: 3, concerto: 15, forte1: -2, ...YANG });
var HA_TWIN_MOUNTAINS = bulingAction("Heavy - Twin Mountains", { node: 0, cast: 3, concerto: 15, forte1: -2, ...YIN });
var HA_TWIN_THUNDERS = bulingAction("Heavy - Twin Thunders", { node: 0, cast: 3, concerto: 15, forte1: -2, ...YIN });
var Skill10 = bulingAction("Skill - In Shadow Thunder Stirs", { node: 1, cast: 4, type: 12288, mv: 116.8, offtune: 7832, energy: 15, concerto: 23, forte1: 1 });
var Liberation10 = bulingAction("Liberation - Flashing Thunder Spell - Harmony", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 536.79,
  offtune: 72e3,
  concerto: 20,
  resetEnergy: true,
  updateBuffs: () => {
    revokeTeam(THUNDER_SPELL);
    applyTeam(THUNDER_SPELL, 1);
    revokeCurrent(YIN_YANG_BALANCE);
  }
});
var ACTION_FIVE_THUNDERS_ARRAY = bulingAction("Liberation - Five Thunders Spell Array x12", {
  type: 16384,
  mv: 238.32,
  energy: 25,
  active: false,
  updateDebuffs: () => applyEnemy(ELECTRO_FLARE, 24)
});
var Intro11 = bulingAction("Intro - Summon and Smite", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 131.1,
  offtune: 8792,
  concerto: 10,
  updateDebuffs: () => applyEnemy(ELECTRO_FLARE, 4)
});
var Outro11 = bulingAction("Outro - Exorcism Spell", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => {
    queueOnIntro(ACTION_FIVE_THUNDERS_ARRAY);
    applyTeam(BULING_OUTRO, 1);
  }
});
var THUNDER_SPELL_STAGE = ["Primordial Qi", "Yin and Yang", "Heaven, Earth, Mind"];
var THUNDER_SPELL = new Buff({
  name: "Buling: Thunder Spell",
  maxStacks: 3,
  display: () => `Buling: Thunder Spell - ${THUNDER_SPELL_STAGE[stacksOfTeam(THUNDER_SPELL) - 1]}`,
  updateGlobal: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) && stacksOfTeam(THUNDER_SPELL) < 3)
      applyTeam(THUNDER_SPELL, 1);
  },
  applyStats: () => {
    if (!currentAction().active)
      return;
    const stage = stacksOfTeam(THUNDER_SPELL);
    if (stage === 2)
      addStat(
        17,
        10,
        12288
        /* Type1.Skill */
      );
    else if (stage >= 3) {
      const buling = currentTeam().slots.find((s) => s.resonator === BULING_RESONATOR);
      addStat(
        17,
        buling?.isHeld(BL_S6) ? 50 : 25,
        12288
        /* Type1.Skill */
      );
    }
  }
});
var MINOR_YANG = new Buff({ name: "Buling: Minor Yang" });
var MINOR_YIN = new Buff({ name: "Buling: Minor Yin" });
var YIN_YANG_BALANCE = new Buff({
  name: "Buling: Yin-Yang Balance"
});
var BULING_OUTRO = new Buff({
  name: "Buling: Outro",
  applyStats: () => addStat(18, 15)
});
var BL_INHERENT_1 = new Inherent({ name: "Inherent: Time Arrives, Evil Declines" });
var BL_INHERENT_2 = new Inherent({ name: "Inherent: Earthly Immortal is Here!" });
var BL_S1 = new Sequence({
  name: "Buling S1",
  applyStats: () => {
    if (currentAction() == Liberation10)
      addStat(9, 20);
  }
});
var BL_S2 = new Sequence({
  name: "Buling S2",
  applyStats: () => {
    if (isHeld(YIN_YANG_BALANCE))
      addStat(25, 25);
  }
});
var BL_S3 = new Sequence({ name: "Buling S3" });
var BL_S4 = new Sequence({
  name: "Buling S4",
  applyStats: () => addStat(23, 20)
});
var BL_S5 = new Sequence({ name: "Buling S5" });
var BL_S6 = new Sequence({ name: "Buling S6" });
var BULING_RESONATOR = new Resonator({
  name: "Buling",
  tier: 2,
  element: 128,
  weapon: 4,
  intro: () => Intro11,
  outro: () => Outro11,
  color: "#7a6ff0",
  maxEnergy: 150,
  constantStats: () => {
    addStat(1, 10625);
    addStat(0, 225);
    addStat(2, 1259);
  }
});
var BULING_TALENTS = new Talent({
  name: "Buling: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(23, 12);
  }
});
var BL_ROTATION = new Rotation([
  NOINTRO,
  INTRO,
  MA8,
  BA211,
  HA_THUNDER_OVER_MOUNTAIN,
  Skill10,
  BA48,
  HA_TWIN_THUNDERS,
  ECHO_CANCEL,
  Liberation10,
  OUTRO
]);
var BULING = new Loadout({
  resonator: BULING_RESONATOR,
  talent: BULING_TALENTS,
  inherent1: BL_INHERENT_1,
  inherent2: BL_INHERENT_2,
  weapons: [VARIATION],
  echoLoadouts: [new EchoLoadout(FALLACY, REJUV_5PC)],
  mainstats: [mainstats(
    1,
    5,
    5,
    15,
    15
    /* Mainstat.ATK1 */
  )],
  substat: chem("atk", "liberation", { er: true }),
  rotation: BL_ROTATION,
  sequences: [BL_S1, BL_S2, BL_S3, BL_S4, BL_S5, BL_S6]
});

// dist/src/resonators/spectro/lucy.js
function lucyAction(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA112 = lucyAction("Basic - Locked Thread 1", { node: 0, cast: 1, type: 4096, mv: 121.49, energy: 1.9, concerto: 6.17, offtune: 7520, forte1: 16 });
var BA212 = lucyAction("Basic - Locked Thread 2", { node: 0, cast: 1, type: 4096, mv: 60.76, energy: 0.96, concerto: 3.07, offtune: 3761, forte1: 12 });
var BA312 = lucyAction("Basic - Locked Thread 3", { node: 0, cast: 1, type: 4096, mv: 120.2, energy: 1.87, concerto: 6.06, offtune: 7440, forte1: 18 });
var BA49 = lucyAction("Basic - Locked Thread 4", { node: 0, cast: 1, type: 4096, mv: 155.09, energy: 2.4, concerto: 7.8, offtune: 9600, forte1: 26 });
var MA9 = lucyAction("Mid-air - Locked Thread", { node: 0, cast: 2, type: 4096, mv: 116.32, energy: 2.26, concerto: 5.86, offtune: 7200, forte1: 8 });
var DC10 = lucyAction("Dodge Counter - Locked Thread", { node: 0, cast: 0, type: 4096, mv: 197.73, energy: 3.83, concerto: 19.96, offtune: 12240, forte1: 12 });
var HA1 = lucyAction("Heavy - Locked Thread 1", { node: 0, cast: 3, type: 8192, mv: 73.67, energy: 1.43, concerto: 3.73, offtune: 4560, forte1: 10 });
var HA23 = lucyAction("Heavy - Locked Thread 2", { node: 0, cast: 3, type: 8192, mv: 284.32, energy: 5.51, concerto: 14.32, offtune: 17602, forte1: 20.02 });
var EBA12 = lucyAction("Basic - Thread Shredding 1", { node: 0, cast: 1, type: 8192, mv: 77.96, energy: 1.12, concerto: 4.48, offtune: 4480, forte2: 16.2 });
var EBA22 = lucyAction("Basic - Thread Shredding 2", { node: 0, cast: 1, type: 8192, mv: 111.35, energy: 1.6, concerto: 6.4, offtune: 6400, forte2: 29.55 });
var EBA32 = lucyAction("Basic - Thread Shredding 3", { node: 0, cast: 1, type: 8192, mv: 140.6, energy: 2.05, concerto: 8.1, offtune: 8080, forte2: 37.3 });
var EBA42 = lucyAction("Basic - Thread Shredding 4", { node: 0, cast: 1, type: 8192, mv: 125.3, energy: 1.8, concerto: 7.2, offtune: 7200, forte2: 33.25 });
var EMA = lucyAction("Mid-air - Algorithm Compaction", { node: 0, cast: 2, type: 4096, mv: 125.26, energy: 2.26, concerto: 5.86, offtune: 7200, forte2: 33.22 });
var EDC2 = lucyAction("Dodge Counter - Algorithm Compaction", { node: 0, cast: 0, type: 4096, mv: 194.85, energy: 3.5, concerto: 21.2, offtune: 11200, forte2: 29.55 });
var EHA = lucyAction("Heavy - Single Threading", { node: 0, cast: 3, type: 8192, mv: 116.95, energy: 1.7, concerto: 6.75, offtune: 6720, forte2: 31 });
var HACKS = { updateDebuffs: () => applyHack() };
var DualThreading = lucyAction("Heavy - Dual Threading", {
  node: 0,
  cast: 3,
  type: 8192,
  mv: 167.05,
  energy: 3,
  concerto: 8,
  offtune: 6720,
  forte2: -100,
  updateBuffs: () => {
    if (forte2() > 100)
      setForte2(100);
  }
});
var MultiThreading = lucyAction("Heavy - Multi-threading", { node: 0, cast: 3, type: 8192, mv: 238.6, energy: 3, concerto: 8, offtune: 10080, ...HACKS });
var Skill1 = lucyAction("Skill - Payload (Charge)", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 30.08,
  energy: 1.5,
  concerto: 2.4,
  offtune: 1512,
  forte1: 3.6,
  ...HACKS,
  updateBuffs: () => queue(Skill23)
  // hitting with the charge triggers the follow-up on its own
});
var Skill23 = lucyAction("Skill - Payload (Follow-Up)", { node: 1, cast: 4, type: 12288, mv: 70.17, energy: 3.5, concerto: 5.6, offtune: 3528, forte1: 8.4 });
var Skill32 = lucyAction("Skill - Pulse Interference", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 308.6,
  energy: 5,
  concerto: 8,
  offtune: 15520,
  forte1: 12,
  updateBuffs: () => applyCurrent(DIGITAL_HANDSHAKE, 1)
  // DIGITAL_HANDSHAKE grants no stat and nothing reads it
});
var Deadlock = lucyAction("Skill - Deadlock", {
  node: 1,
  cast: 4,
  type: 8192,
  mv: 258.47,
  energy: 10,
  concerto: 8,
  forte1: -100,
  ...HACKS,
  updateBuffs: () => {
    if (forte1() > 100)
      setForte1(100);
    if (!isHeld(ALGORITHM_COMPACTION)) {
      applyCurrent(ALGORITHM_COMPACTION, 1);
      applyCurrent(SQL, 1);
    }
  }
});
var OVERRIDE = {
  updateBuffs: () => {
    setForte1(0);
    applyEnemy(CYBERWARE_MALFUNCTION, 1);
    applyEnemy(BREACH_PROTOCOL, 1);
    queue(Ping);
    queue(SynapseBurnout);
    queue(CrippleMovement);
  }
};
var Lib = lucyAction("Liberation - Netrunner: Override", {
  node: 3,
  cast: 5,
  type: 8192,
  mv: 894.65,
  concerto: 20,
  offtune: 43200,
  resetEnergy: true,
  ...OVERRIDE
});
var ELib = lucyAction("Liberation - Old Net Deep Dive: Override", {
  node: 3,
  cast: 5,
  type: 8192,
  mv: 1789.29,
  concerto: 20,
  offtune: 86400,
  resetEnergy: true,
  ...OVERRIDE
});
var Ping = lucyAction("Liberation - Spoofing Program: Ping", { node: 3, type: 8192, mv: 79.53 });
var SynapseBurnout = lucyAction("Liberation - Spoofing Program: Synapse Burnout", { node: 3, type: 8192, mv: 79.53 });
var CrippleMovement = lucyAction("Liberation - Spoofing Program: Cripple Movement", {
  node: 3,
  type: 49152,
  scaling: 4,
  mv: 911.83
});
var Intro12 = lucyAction("Intro - Outdated Hallucination", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 138.28,
  energy: 10,
  concerto: 10,
  offtune: 8560,
  updateBuffs: () => applyCurrent(OUTDATED_HALLUCINATION, 1)
});
var Outro12 = lucyAction("Outro - Countermeasure Program", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => {
    queueOutro(COUNTERMEASURE_HANDOFF);
    applyTeam(COUNTERMEASURE_MARKER, 1);
  }
});
var DataCrash = lucyAction("Tune Hack Response - Data Crash", {
  node: 2,
  type: 49152,
  scaling: 4,
  mv: 1367.75
});
var ALGORITHM_COMPACTION = new Buff({
  name: "Lucy: Algorithm Compaction",
  applyStats: () => addStat(
    17,
    65,
    320
    /* Attribute.Spectro */
  ),
  convertStats: () => {
    if (currentAction() === Outro12)
      revokeCurrent(ALGORITHM_COMPACTION);
  }
});
var SQL = new Buff({
  name: "Lucy: SQL",
  applyStats: () => {
    if (currentAction() !== MultiThreading)
      return;
    addStat(16, isHeld(LC_S2) ? 560 : 270);
    addStat(25, 7);
    addStat(27, 57600);
  },
  convertStats: () => {
    if (currentAction() === MultiThreading)
      revokeCurrent(SQL);
  }
});
var OUTDATED_HALLUCINATION = new Buff({
  name: "Lucy: Outdated Hallucination",
  applyStats: () => {
    if (currentAction() === Skill32)
      addStat(29, 20.6);
  },
  convertStats: () => {
    if (currentAction() === Skill32)
      revokeCurrent(OUTDATED_HALLUCINATION);
  }
});
var DIGITAL_HANDSHAKE = new Buff({
  name: "Lucy: Digital Handshake",
  applyStats: () => {
    if (currentAction() === Outro12)
      addStat(29, 12);
  }
  // approximation
});
var CYBERWARE_MALFUNCTION = new Debuff({
  name: "Spoofing Program: Cyberware Malfunction",
  applyStats: () => addStat(19, 5)
});
var BREACH_PROTOCOL = new Debuff({
  name: "Spoofing Program: Breach Protocol",
  applyStats: () => addEnemyStat(35, 5)
});
var COUNTERMEASURE_HANDOFF = new Buff({
  name: "Lucy: Outro",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(
    18,
    25,
    4096
    /* Type1.Basic */
  )
});
var COUNTERMEASURE_MARKER = new Buff({
  name: "Lucy: Countermeasure Program",
  updateBuffs: () => {
    if (applied(TUNE_HACK_SHIFTING) && !isHeld(LUCY_RESONATOR)) {
      applyCurrent(COUNTERMEASURE_AMP, 1);
      revokeTeam(COUNTERMEASURE_MARKER);
    }
  }
});
var COUNTERMEASURE_AMP = new Buff({
  name: "Lucy: Countermeasure Program",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(18, 20)
});
var LC_S1_ATK = new Buff({
  name: "Lucy S1: The Moon, a Ticket, and a Dream",
  applyStats: () => addStat(6, 20),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(LC_S1_ATK);
  }
});
var LC_S1 = new Sequence({
  name: "Lucy S1: The Moon, a Ticket, and a Dream",
  updateBuffs: () => {
    if (currentAction() === Intro12)
      applyCurrent(LC_S1_ATK, 1);
  }
});
var S2Instance = lucyAction("Skill - Pulse Interference (S2 Additional)", {
  node: 1,
  type: 8192,
  mv: 450,
  updateDebuffs: () => {
    applyEnemy(CYBERWARE_MALFUNCTION, 1);
    applyEnemy(BREACH_PROTOCOL, 1);
  }
});
var LC_S2 = new Sequence({
  name: "Lucy S2: The Blackwall, the Past, the Escape",
  updateBuffs: () => {
    if (currentAction() === Skill32)
      queue(S2Instance);
  }
});
var LC_S3 = new Sequence({
  name: "Lucy S3: Cyberpunk",
  applyStats: () => {
    const a = currentAction();
    if (a === Lib || a === ELib) {
      addStat(16, 50);
      addStat(10, 100);
    }
    if (a === CrippleMovement || a === DataCrash)
      addStat(16, 65);
  }
});
var LC_S4_TEAM = new Buff({
  name: "Lucy S4: No Living Legends in Night City",
  applyStats: () => addStat(17, 20)
});
var LC_S4 = new Sequence({
  name: "Lucy S4: No Living Legends in Night City",
  updateGlobal: () => {
    if (applied(TUNE_HACK_SHIFTING))
      applyTeam(LC_S4_TEAM, 1);
  }
});
var LC_S5 = new Sequence({ name: "Lucy S5: A Broken Path to Hell" });
var LC_S6 = new Sequence({
  name: "Lucy S6: I Really Want to Stay At Your House",
  applyStats: () => {
    if (!stacksOfEnemy(TUNE_HACK_SHIFTING) && !stacksOfEnemy(TUNE_HACK_INTERFERED))
      return;
    addStat(
      19,
      40,
      8192
      /* Type1.Heavy */
    );
    addStat(
      19,
      60,
      49152
      /* Type1.Hack */
    );
  }
});
var LC_INHERENT_1 = new Inherent({ name: "Inherent: Ghost Cyberware" });
var LC_INHERENT_2 = new Inherent({ name: "Inherent: Function Cracking" });
var LUCY_TALENTS = new Talent({
  name: "Lucy: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var LUCY_RESONATOR = new Resonator({
  name: "Lucy",
  element: 320,
  weapon: 2,
  intro: () => Intro12,
  outro: () => Outro12,
  color: "#efe8de",
  maxEnergy: 125,
  updateGlobal: () => tuneHackResponse(DataCrash),
  constantStats: () => {
    addStat(1, 11025);
    addStat(0, 425);
    addStat(2, 1148.89);
    addStat(12, 10);
  }
});
var BA2342 = new ActionGroup("Basic - Locked Thread 234", [BA212, BA312, BA49]);
var EBA234 = new ActionGroup("Basic - Thread Shredding 234", [EBA22, EBA32, EBA42]);
var LC_ROTATION = new Rotation([
  START_3,
  Lib,
  SWAP,
  INTRO,
  BA2342,
  Skill1,
  Skill32,
  Deadlock,
  EBA234,
  DualThreading,
  MultiThreading,
  ECHO_CANCEL,
  ELib,
  OUTRO
]);
var LC_ECHOES = [
  new EchoLoadout(ADAM_SMASHER_LUCY, SHATTERED_DREAMS_1PC, NEONLIGHT_LEAP_2PC, CELESTIAL_LIGHT_2PC),
  new EchoLoadout(ADAM_SMASHER_LUCY, SHATTERED_DREAMS_1PC, LINGERING_TUNES_2PC, CELESTIAL_LIGHT_2PC),
  new EchoLoadout(ADAM_SMASHER_LUCY, SHATTERED_DREAMS_1PC, LINGERING_TUNES_2PC, REEL_2PC)
];
var NETWORK_BACKDOOR = new Buff({
  name: "Lucy: Network Backdoor",
  maxStacks: 2,
  applyStats: () => {
    const bonus = 10 * frozenStacks() + (frozenStacks() >= 2 ? 5 : 0);
    addStat(18, bonus);
    addStat(
      16,
      bonus,
      49152
      /* Type1.Hack */
    );
  }
});
var LUCY_MATRIX = matrix("Lucy", 0, {
  updateBuffs: () => {
    if (currentAction() === Lib)
      applyTeam(NETWORK_BACKDOOR, 1);
  }
});
var LUCY = new Loadout({
  resonator: LUCY_RESONATOR,
  matrix: LUCY_MATRIX,
  talent: LUCY_TALENTS,
  inherent1: LC_INHERENT_1,
  inherent2: LC_INHERENT_2,
  weapons: [SPECTRAL_TRIGGER, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: LC_ECHOES,
  sequences: [LC_S1, LC_S2, LC_S3, LC_S4, LC_S5, LC_S6],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    13,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "heavy"),
  rotation: LC_ROTATION
});

// dist/src/resonators/electro/rebecca.js
function rebeccaAction(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var HBA12 = rebeccaAction("Basic - Huntress 1", { node: 0, cast: 1, type: 4096, mv: 73.52, energy: 1.1, concerto: 2.18, offtune: 3480, forte1: 7.06 });
var HBA22 = rebeccaAction("Basic - Huntress 2", { node: 0, cast: 1, type: 4096, mv: 95.65, energy: 1.45, concerto: 2.85, offtune: 4530, forte1: 9.2 });
var HBA3 = rebeccaAction("Basic - Huntress 3", { node: 0, cast: 1, type: 4096, mv: 109.85, energy: 1.63, concerto: 3.25, offtune: 5200, forte1: 10.54 });
var HHA = rebeccaAction("Heavy - Huntress", { node: 0, cast: 3, type: 4096, mv: 33.8, energy: 0.5, concerto: 1, offtune: 1600, forte1: 3.58 });
var EatLead = rebeccaAction("Heavy - Eat Lead!: Huntress", { node: 0, cast: 3, type: 8192, mv: 121.68, energy: 1.8, concerto: 3.6, offtune: 5760, forte1: 11.68 });
var HMA = rebeccaAction("Mid-air - Huntress", { node: 0, cast: 2, type: 4096, mv: 136.04, energy: 2.02, concerto: 4.03, offtune: 6440, forte1: 13.05 });
var HTD = rebeccaAction("Basic - Tactical Dodge: Huntress", { node: 0, cast: 1, type: 4096, mv: 84.5, energy: 1.25, concerto: 2.5, offtune: 4e3, forte1: 8.95 });
var GBA1 = rebeccaAction("Basic - Guts 1", { node: 0, cast: 1, type: 4096, mv: 123.38, energy: 1.84, concerto: 3.66, offtune: 5840, forte1: 13.62 });
var GBA2 = rebeccaAction("Basic - Guts 2", { node: 0, cast: 1, type: 4096, mv: 84.5, energy: 1.25, concerto: 2.5, offtune: 4e3, forte1: 9.32 });
var GBA3 = rebeccaAction("Basic - Guts 3", { node: 0, cast: 1, type: 4096, mv: 225.11, energy: 3.34, concerto: 6.67, offtune: 10658, forte1: 24.84 });
var GHA = rebeccaAction("Heavy - Guts", { node: 0, cast: 3, type: 8192, mv: 202.79, energy: 3, concerto: 6, offtune: 9600, forte1: 19.45 });
var GMA = rebeccaAction("Mid-air - Guts", { node: 0, cast: 2, type: 4096, mv: 104.78, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 10.05 });
var GTD = rebeccaAction("Basic - Tactical Dodge: Guts", { node: 0, cast: 1, type: 4096, mv: 101.4, energy: 1.5, concerto: 3, offtune: 4800, forte1: 9.73 });
var TO_GUTS = { convertStats: () => {
  revokeCurrent(HUNTRESS);
  applyCurrent(GUTS, 1);
} };
var TO_HUNTRESS = { convertStats: () => {
  revokeCurrent(GUTS);
  applyCurrent(HUNTRESS, 1);
} };
var Skill11 = rebeccaAction("Skill - It's Big Boomin' Time!", { node: 1, cast: 4, type: 12288, mv: 236.6, energy: 3.52, concerto: 7, offtune: 11200, forte1: 22.72, ...TO_GUTS });
var ESkill3 = rebeccaAction("Skill - Come 'n' Get Me!", { node: 1, cast: 4, type: 12288, mv: 236.6, energy: 3.51, concerto: 7, offtune: 11200, forte1: 22.72, ...TO_HUNTRESS });
var SPEND_FERVOR = {
  updateDebuffs: () => applyHack(),
  updateBuffs: () => {
    if (forte1() > 120)
      setForte1(120);
  }
};
var FHAHunt = rebeccaAction("Forte Heavy - Rat-tat-tat!: Huntress", { node: 2, cast: 3, type: 4096, mv: 397.66, energy: 15, concerto: 20, offtune: 44320, forte1: -120, forte2: 40, ...SPEND_FERVOR });
var FHAGuts = rebeccaAction("Forte Heavy - Bang-bang-bang!: Guts", { node: 2, cast: 3, type: 4096, mv: 278.34, energy: 15, concerto: 20, offtune: 44320, forte1: -120, forte2: 40, ...SPEND_FERVOR });
var Lib12 = rebeccaAction("Liberation - Party 'til Dawn!", {
  node: 3,
  cast: 5,
  resetEnergy: true,
  forte3: 90,
  updateBuffs: () => {
    queueOnIntro(Boom);
  }
});
var Lib22 = rebeccaAction("Liberation - Mk. 31 HMG x5", {
  node: 3,
  type: 4096,
  cast: 5,
  mv: 24.3 * 5,
  concerto: 20 + 0.56 * 5,
  offtune: 1609 * 5,
  forte3: -10
});
var Lib32 = rebeccaAction("Liberation - Mk. 31 HMG 1st Enhancement x5", {
  node: 3,
  type: 4096,
  cast: 5,
  mv: 48.6 * 5,
  concerto: 1.12 * 5,
  offtune: 3218 * 5,
  forte3: -20
});
var Lib4 = rebeccaAction("Liberation - Mk. 31 HMG 2nd Enhancement x10", {
  node: 3,
  type: 4096,
  cast: 5,
  mv: 72.9 * 10,
  concerto: 1.67 * 10,
  offtune: 4826 * 10,
  forte3: -60
});
var Lib234 = new ActionGroup("Liberation - Mk. 31 HMG", [Lib22, Lib32, Lib4]);
var Boom = rebeccaAction("Liberation - BOOM! Fireworks!", {
  node: 3,
  type: 4096,
  cast: 5,
  mv: 636.2,
  energy: 20,
  concerto: 10,
  offtune: 31025,
  active: false,
  updateDebuffs: () => applyHack()
});
var Intro13 = rebeccaAction("Intro - Yo, It's Big Boomin' Time!", { node: 4, cast: 6, type: 20480, mv: 270.4, energy: 10, concerto: 10, offtune: 12800, updateDebuffs: () => applyHack(), ...TO_GUTS });
var EIntro2 = rebeccaAction("Intro - Hey, Leadhead, Come 'n' Get Me!", { node: 4, cast: 6, type: 20480, mv: 202.8, energy: 10, concerto: 10, offtune: 9600, updateDebuffs: () => applyHack(), ...TO_HUNTRESS });
var Outro13 = rebeccaAction("Outro - Preem Choom", {
  cast: 7,
  type: 24576,
  concerto: -100,
  active: false,
  updateBuffs: () => {
    const st = currentTeam();
    const next = st.slots[(st.active + st.outroDir + st.slots.length) % st.slots.length];
    if (next.resonator?.name === "Lucy")
      applyTeam(REBECCA_TURRET_LUCY, 4);
    else
      applyTeam(REBECCA_TURRET, 14);
    queueOutro(EDGERUNNER_BONDS);
    addStat(30, 120);
  }
});
var TURRET_FIELD = new ActionField("Rebecca: Outro Turret");
var TurretTick = rebeccaAction("Outro - Preem Choom: Turret", { type: 24576, mv: 2.5, active: false, field: TURRET_FIELD });
var TurretTickLucy = TurretTick.variant("Outro - Preem Choom: Turret (Enhanced)", {
  applyStats: () => addStat(16, 250)
});
var REBECCA_TURRET = coordinatedBuff("Rebecca: Outro Turret", 14, () => REBECCA_RESONATOR, TurretTick, { hits: 5 });
var REBECCA_TURRET_LUCY = coordinatedBuff("Rebecca: Outro Turret (Lucy)", 4, () => REBECCA_RESONATOR, TurretTickLucy, { hits: 5 });
var Meltdown = rebeccaAction("Tune Hack Response - Meltdown", {
  node: 2,
  type: 49152,
  scaling: 4,
  mv: 2358.89
});
var HUNTRESS = new Buff({ name: "Rebecca: Huntress", applyStats: () => addStat(10, 30) });
var GUTS = new Buff({ name: "Rebecca: Guts", applyStats: () => addStat(21, 15) });
var A_GIRL = new Buff({
  name: "Rebecca: A Girl Gets What She Wants!",
  applyStats: () => {
    if (forte2() >= 120 && (casting(
      4
      /* Cast.Skill */
    ) || casting(
      6
      /* Cast.Intro */
    ))) {
      addStat(30, -120);
    }
    const k = isHeld(RB_S4) ? 1.6 : 1;
    if (!isHeld(HUNTRESS))
      addStat(10, 30 * k);
    else if (k > 1)
      addStat(10, 30 * (k - 1));
    if (!isHeld(GUTS))
      addStat(21, 15 * k);
    else if (k > 1)
      addStat(21, 15 * (k - 1));
    if (casting(
      6
      /* Cast.Intro */
    ))
      addStat(29, 50);
    const a = currentAction();
    if (a.forte2 > 0)
      addStat(30, -a.forte2);
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(A_GIRL);
  }
});
var TAG_YOURE_IT = new Buff({
  name: "Inherent: Tag, You're It! (self)",
  maxStacks: 2,
  applyStats: () => addStat(6, 10 * frozenStacks()),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(TAG_YOURE_IT);
  }
});
var TAG_TBB = new Buff({
  name: "Inherent: Tag, You're It! (team)",
  applyStats: () => addStat(12, 30)
});
var LEFT_AN_OPENING = new Buff({
  name: "Inherent: Left an Opening! (team)",
  applyStats: () => addStat(6, 20)
});
var EDGERUNNER_BONDS = new Buff({
  name: "Rebecca: Outro - Edgerunner Bonds",
  updateBuffs: () => {
    lostOnSwap();
    if (isHeld(LUCY_RESONATOR))
      applyCurrent(OVERLIMIT, 70);
    else if (!triggeredAction())
      applyCurrent(OVERLIMIT, 5);
  },
  applyStats: () => {
    addStat(18, 15);
  }
});
var OVERLIMIT = new Buff({
  name: "Rebecca: Outro - Overlimit",
  maxStacks: 70,
  updateBuffs: () => lostOnSwap(),
  applyStats: () => {
    addStat(
      18,
      0.5 * frozenStacks(),
      8192
      /* Type1.Heavy */
    );
  }
});
var RB_S1 = new Sequence({
  name: "Rebecca S1: Try Not to Get in the Way!",
  applyStats: () => {
    const a = currentAction();
    if (a === HBA12 || a === HBA22 || a === HBA3 || a === HHA || a === HTD || a === GBA1 || a === GBA2 || a === GBA3 || a === GTD)
      addStat(16, 50);
  }
});
var OH_HEY_CHOOM_TEAM = new Buff({
  name: "Rebecca S2: Oh, Hey Choom! (team)",
  applyStats: () => addStat(17, 20)
});
var OH_HEY_CHOOM_HACK = new Buff({
  name: "Rebecca S2: Oh, Hey Choom! (Shifting)",
  applyStats: () => addStat(18, 15)
});
var RB_S2 = new Sequence({
  name: "Rebecca S2: Oh, Hey Choom!",
  updateGlobal: () => {
    const acting = currentTeam().slot.resonator;
    if (acting && applied(TUNE_HACK_SHIFTING))
      addBuff(acting, OH_HEY_CHOOM_HACK, 1);
  },
  updateBuffs: () => {
    const a = currentAction();
    if (a === Intro13 || a === EIntro2 || a === Lib12)
      applyTeam(OH_HEY_CHOOM_TEAM, 1);
  }
});
var RB_S3 = new Sequence({
  name: "Rebecca S3: Don't Sweat Your Six!",
  applyStats: () => {
    const a = currentAction();
    if (a === Lib22 || a === Lib32 || a === Lib4 || a === Boom)
      addStat(16, 60);
    if (casting(
      6
      /* Cast.Intro */
    ) && !isHeld(A_GIRL))
      addStat(30, 120);
  }
});
var RB_S4 = new Sequence({ name: "Rebecca S4: Got Ya Covered!" });
var DREAMIN_ON_THE_EDGE = new Buff({
  name: "Rebecca S5: Dreamin' on the Edge",
  applyStats: () => addStat(
    17,
    20,
    4096
    /* Type1.Basic */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(DREAMIN_ON_THE_EDGE);
  }
});
var RB_S5 = new Sequence({
  name: "Rebecca S5: Dreamin' on the Edge",
  updateBuffs: () => {
    if (currentAction().active && applied(TUNE_HACK_SHIFTING))
      applyCurrent(DREAMIN_ON_THE_EDGE, 1);
  }
});
var S6Hunt = rebeccaAction("Forte Heavy - Rat-tat-tat!: Huntress (S6 Strike)", { node: 2, type: 4096, mv: 900 });
var S6Guts = rebeccaAction("Forte Heavy - Bang-bang-bang!: Guts (S6 Strike)", { node: 2, type: 4096, mv: 900 });
var RB_S6 = new Sequence({
  name: "Rebecca S6: Maybe, Just Maybe...",
  applyStats: () => {
    const a = currentAction();
    if ((a === FHAHunt || a === FHAGuts) && !isHeld(A_GIRL))
      addStat(30, 20);
  },
  lateConvertStats: () => {
    addStat(
      17,
      0.4 * basicDmgBonus(),
      4096
      /* Type1.Basic */
    );
  },
  updateBuffs: () => {
    const a = currentAction();
    if (a === FHAHunt)
      queue(S6Hunt);
    if (a === FHAGuts)
      queue(S6Guts);
  }
});
var RB_INHERENT_1 = new Inherent({
  name: "Inherent: Tag, You're It!",
  // Watched from her own inherent rather than through a team-wide marker: the Tune Break Boost is
  // the *inflicter's*, so it has to land on whoever is actually acting — and updateGlobal's own
  // currentSlot is Rebecca (this gear's holder), not them, so it goes through the acting slot's
  // resonator instead of applySelf.
  updateGlobal: () => {
    const acting = currentTeam().slot.resonator;
    if (acting && applied(TUNE_HACK_SHIFTING))
      addBuff(acting, TAG_TBB, 1);
  },
  updateBuffs: () => {
    const a = currentAction();
    if (applied(A_GIRL) || a === FHAHunt || a === FHAGuts)
      applyCurrent(TAG_YOURE_IT, 1);
  }
});
var RB_INHERENT_2 = new Inherent({
  name: "Inherent: Left an Opening!",
  updateBuffs: () => {
    if (currentAction() === Lib12)
      applyTeam(LEFT_AN_OPENING, 1);
  }
});
var REBECCA_TALENTS = new Talent({
  name: "Rebecca: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var REBECCA_RESONATOR = new Resonator({
  name: "Rebecca",
  element: 128,
  weapon: 2,
  // whichever mode she is in decides which Intro she has; her loop always ends in Huntress
  intro: () => isHeld(GUTS) ? EIntro2 : Intro13,
  outro: () => Outro13,
  color: "#abebda",
  maxEnergy: 125,
  // she starts in Huntress with a full Hot Hand bar
  combatStart: () => {
    applyCurrent(HUNTRESS, 1);
    setForte2(120);
  },
  updateGlobal: () => tuneHackResponse(Meltdown),
  // at a full Hot Hand bar, a Resonance Skill or Intro Skill trades it for the 12s window
  updateBuffs: () => {
    if (forte2() >= 120 && (casting(
      4
      /* Cast.Skill */
    ) || casting(
      6
      /* Cast.Intro */
    ))) {
      applyCurrent(A_GIRL, 1);
    }
  },
  constantStats: () => {
    addStat(1, 11600);
    addStat(0, 400);
    addStat(2, 1173.33);
    addStat(12, 10);
  }
});
var RB_ROTATION = new Rotation([
  START_2,
  Skill11,
  SWAP,
  INTRO,
  JUMP,
  HMA,
  Skill11,
  GHA,
  FHAGuts,
  GHA,
  ECHO_CANCEL,
  Lib12,
  Lib234,
  OUTRO
]);
var RB_ECHOES = [
  new EchoLoadout(ADAM_SMASHER_REBECCA, SHATTERED_DREAMS_1PC, LINGERING_TUNES_2PC, VOID_THUNDER_2PC),
  new EchoLoadout(HYVATIA, NEONLIGHT_LEAP_5PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(STONEWALL_BRACER, MOONLIT_CLOUDS_5PC)
];
var REBECCA = new Loadout({
  resonator: REBECCA_RESONATOR,
  talent: REBECCA_TALENTS,
  inherent1: RB_INHERENT_1,
  inherent2: RB_INHERENT_2,
  sequences: [RB_S1, RB_S2, RB_S3, RB_S4, RB_S5, RB_S6],
  weapons: [SKULL_THRASHER, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: RB_ECHOES,
  mainstats: mainstatOptions(
    0,
    1,
    6,
    11,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: RB_ROTATION
});

// dist/src/resonators/electro/rover_electro.js
function roverAction2(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var BA113 = roverAction2("Basic - Deterrence 1", { node: 0, cast: 1, type: 4096, mv: 51.08, energy: 0.92, concerto: 3.31, offtune: 2936, forte1: 6.12 });
var BA213 = roverAction2("Basic - Deterrence 2", { node: 0, cast: 1, type: 4096, mv: 65, energy: 1.18, concerto: 4.22, offtune: 3737, forte1: 7.8 });
var BA313 = roverAction2("Basic - Deterrence 3", { node: 0, cast: 1, type: 4096, mv: 92.89, energy: 1.68, concerto: 6.02, offtune: 5341, forte1: 11.16 });
var BA410 = roverAction2("Basic - Deterrence 4", { node: 0, cast: 1, type: 4096, mv: 182.04, energy: 3.28, concerto: 11.78, offtune: 10465, forte1: 21.82 });
var Skill12 = roverAction2("Skill - Thunderclap", { node: 1, cast: 4, type: 12288, mv: 200.4, energy: 11.34, concerto: 9.8, offtune: 4268, forte1: 8.9 });
var Repel = roverAction2("Basic - Repel", { node: 1, cast: 1, type: 4096, mv: 140.29, energy: 2.53, concerto: 9.08, offtune: 8065, forte1: 16.8 });
var OVERSHOCK = {
  node: 2,
  cast: 4,
  type: 12288,
  mv: 1412.58,
  energy: 15.15,
  concerto: 18.33,
  offtune: 54645,
  forte1: -100,
  updateDebuffs: () => applyEnemy(ELECTRO_FLARE, 10)
};
var Overshock = roverAction2("Forte Skill - Overshock", {
  ...OVERSHOCK,
  updateBuffs: () => {
    if (forte1() >= 100)
      setForte1(100);
    applyTeam(OVERSHOCK_ATK, 1);
  }
});
var OvershockHold = roverAction2("Forte Skill - Overshock (Hold)", {
  ...OVERSHOCK,
  updateBuffs: () => {
    if (forte1() >= 100)
      setForte1(100);
    applyCurrent(APEX_RESONANCE, 1);
  }
});
var ThrumSpectro1 = roverAction2("Skill - Thrum: Spectro 1", { node: 2, cast: 4, type: 12288, element: 320, mv: 99.12, energy: 0.9, concerto: 3.23, offtune: 7160, forte2: 3.94 });
var ThrumSpectro2 = roverAction2("Skill - Thrum: Spectro 2", { node: 2, cast: 4, type: 12288, element: 320, mv: 163.53, energy: 1.83, concerto: 6.57, offtune: 14580, forte2: 8.03 });
var ThrumSpectro3 = roverAction2("Skill - Thrum: Spectro 3", { node: 2, cast: 4, type: 12288, element: 320, mv: 255.14, energy: 2.17, concerto: 7.77, offtune: 17254, forte2: 9.5 });
var ThrumHavoc1 = roverAction2("Skill - Thrum: Havoc 1", { node: 2, cast: 4, type: 12288, element: 384, mv: 149.76, energy: 2, concerto: 7.18, offtune: 15920, forte2: 8.78 });
var ThrumHavoc2 = roverAction2("Skill - Thrum: Havoc 2", { node: 2, cast: 4, type: 12288, element: 384, mv: 138.3, energy: 2.19, concerto: 7.86, offtune: 17380, forte2: 9.58 });
var ThrumHavoc3 = roverAction2("Skill - Thrum: Havoc 3", { node: 2, cast: 4, type: 12288, element: 384, mv: 208.38, energy: 2.9, concerto: 10.4, offtune: 23046, forte2: 12.7 });
var SilencingBlade = roverAction2("Skill - Thrum: Silencing Blade", { node: 2, cast: 4, type: 12288, element: 64, mv: 470.68, energy: 4.59, concerto: 16.48, offtune: 36568, forte2: 20.16 });
var ThrumAero = roverAction2("Skill - Thrum: Aero", { node: 2, cast: 4, type: 12288, element: 64, mv: 158.09, energy: 1.28, concerto: 4.59, offtune: 10200, forte2: 5.61 });
var ThrumMaHavoc1 = roverAction2("Skill - Thrum: Havoc Mid-air 1", { node: 2, cast: 4, type: 12288, element: 384, mv: 50.63, energy: 0.59, concerto: 2.1, offtune: 4660, forte2: 2.56 });
var ThrumMaHavoc2 = roverAction2("Skill - Thrum: Havoc Mid-air 2", { node: 2, cast: 4, type: 12288, element: 384, mv: 63.82, energy: 0.67, concerto: 2.41, offtune: 5340, forte2: 2.94 });
var ThrumMaHavoc3 = roverAction2("Skill - Thrum: Havoc Mid-air 3", { node: 2, cast: 4, type: 12288, element: 384, mv: 277.3, energy: 2.06, concerto: 7.37, offtune: 16348, forte2: 9 });
var ThrumMaAero1 = roverAction2("Skill - Thrum: Aero Mid-air 1", { node: 2, cast: 4, type: 12288, element: 64, mv: 84.61, energy: 0.81, concerto: 2.89, offtune: 6412, forte2: 3.53 });
var ThrumMaAero2 = roverAction2("Skill - Thrum: Aero Mid-air 2", { node: 2, cast: 4, type: 12288, element: 64, mv: 97.41, energy: 0.89, concerto: 3.19, offtune: 7072, forte2: 3.89 });
var ThrumMaAeroPlunge = roverAction2("Skill - Thrum: Aero Plunge", { node: 2, cast: 4, type: 12288, element: 64, mv: 282.48, energy: 2.08, concerto: 7.48, offtune: 16613, forte2: 9.14 });
var ThunderBane = roverAction2("Forte Skill - Thunder Bane", { node: 2, type: 12288, mv: 39.77 });
var THRUMS = [
  ThrumSpectro1,
  ThrumSpectro2,
  ThrumSpectro3,
  ThrumHavoc1,
  ThrumHavoc2,
  ThrumHavoc3,
  SilencingBlade,
  ThrumAero,
  ThrumMaHavoc1,
  ThrumMaHavoc2,
  ThrumMaHavoc3,
  ThrumMaAero1,
  ThrumMaAero2,
  ThrumMaAeroPlunge
];
var Liberation11 = roverAction2("Liberation - Ultimate Tactics", { node: 3, cast: 5, type: 16384, mv: 1192.86, concerto: 20, offtune: 57600, resetEnergy: true });
var Intro14 = roverAction2("Intro - Thunderous Fury", { node: 4, cast: 6, type: 20480, mv: 167.03, energy: 3, concerto: 20.8, offtune: 9600, forte1: 53 });
var Outro14 = roverAction2("Outro - Rumbling Thunders", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(ELECTRO_CORE)
});
var APEX_RESONANCE = new Buff({
  name: "Electro Rover: Apex Resonance",
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(APEX_RESONANCE);
  }
});
var OVERSHOCK_ATK = new Buff({
  name: "Electro Rover: Overshock ATK",
  applyStats: () => addStat(6, 10),
  convertStats: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) && isHeld(ROVER_ELECTRO_RESONATOR))
      revokeTeam(OVERSHOCK_ATK);
  }
});
var ER_INHERENT_1 = new Inherent({ name: "Inherent: Decipher" });
var REGRESSION = new Buff({
  name: "Inherent: Regression",
  applyStats: () => addStat(
    17,
    20,
    12288
    /* Type1.Skill */
  ),
  updateBuffs: () => {
    lostOnSwap();
  }
});
var ER_INHERENT_2 = new Inherent({
  name: "Inherent: Regression",
  updateBuffs: () => {
    if (currentAction() === OvershockHold)
      applyCurrent(REGRESSION, 1);
  }
});
var ELECTRO_CORE = new Buff({
  name: "Electro Rover: Electro Core",
  updateBuffs: () => {
    lostOnSwap();
    if (inflictedNegativeStatus()) {
      applyCurrent(ER_OUTRO, 1);
      revokeCurrent(ELECTRO_CORE);
    }
  }
});
var ER_OUTRO = new Buff({
  name: "Electro Rover: Outro",
  applyStats: () => addStat(18, 25),
  updateBuffs: () => {
    lostOnSwap();
  }
});
var ER_S1 = new Sequence({ name: "Electro Rover S1: Celestial Ingenuity" });
var ER_S2 = new Sequence({ name: "Electro Rover S2: Thousandfold Artifice" });
var ER_S3 = new Sequence({
  name: "Electro Rover S3: Alchemy of Wonders",
  applyStats: () => {
    const a = currentAction();
    if (a === Overshock || a === OvershockHold)
      addStat(16, 20);
  }
});
var ER_S4 = new Sequence({
  name: "Electro Rover S4: Earthquaking Rumble",
  applyStats: () => {
    if (currentAction() === Liberation11)
      addStat(16, 20);
  }
});
var ER_S5 = new Sequence({
  name: "Electro Rover S5: Principle of Change",
  applyStats: () => {
    if (isHeld(APEX_RESONANCE))
      addStat(10, 20);
  }
});
var ER_S6 = new Sequence({
  name: "Electro Rover S6: Mind's Depths in a Casket",
  applyStats: () => {
    const a = currentAction();
    if (a === ThunderBane || THRUMS.includes(a))
      addStat(16, 20);
  }
});
var ROVER_ELECTRO_RESONATOR = new Resonator({
  name: "Electro Rover",
  element: 128,
  weapon: 0,
  intro: () => Intro14,
  outro: () => Outro14,
  color: "#b98ce8",
  maxEnergy: 125,
  tier: 2,
  updateDebuffs: () => {
    const a = currentAction();
    if (a === ThrumMaAero1 || a === ThrumMaAero2)
      applyCurrent(HEALS, 1);
  },
  updateBuffs: () => {
    if (THRUMS.includes(currentAction()))
      queue(ThunderBane);
  },
  constantStats: () => {
    addStat(1, 10775);
    addStat(0, 438);
    addStat(2, 1137);
  }
});
var ROVER_ELECTRO_TALENTS = new Talent({
  name: "Electro Rover: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var BA1234 = new ActionGroup("Basic - Deterrence 1234", [BA113, BA213, BA313, BA410]);
var ER_ROTATION = new Rotation([
  INTRO,
  BA1234,
  Skill12,
  Repel,
  Overshock,
  Liberation11,
  ECHO_SWAP,
  OUTRO
]);
var ROVER_ELECTRO = new Loadout({
  resonator: ROVER_ELECTRO_RESONATOR,
  talent: ROVER_ELECTRO_TALENTS,
  inherent1: ER_INHERENT_1,
  inherent2: ER_INHERENT_2,
  weapons: [EMERALD_OF_GENESIS, BLAZING_BRILLIANCE, RED_SPRING],
  echoLoadouts: [new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    11,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "skill"),
  rotation: ER_ROTATION,
  sequences: [ER_S1, ER_S2, ER_S3, ER_S4, ER_S5, ER_S6]
});

// dist/src/resonators/electro/xiangli_yao.js
function xlyAction(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var BA114 = xlyAction("Basic - Probe 1", { node: 0, cast: 1, type: 4096, mv: 33.11 * 2, energy: 0.84, concerto: 1.68, offtune: 2664, forte1: 8 });
var BA214 = xlyAction("Basic - Probe 2", { node: 0, cast: 1, type: 4096, mv: 99.61, energy: 1.26, concerto: 2.51, offtune: 4008, forte1: 14 });
var BA314 = xlyAction("Basic - Probe 3", { node: 0, cast: 1, type: 4096, mv: 39.76 * 3, energy: 1.5, concerto: 3, offtune: 4800, forte1: 15 });
var BA411 = xlyAction("Basic - Probe 4", { node: 0, cast: 1, type: 4096, mv: 53.05 * 2 + 26.53, energy: 1.68, concerto: 3.35, offtune: 5338, forte1: 18 });
var BA52 = xlyAction("Basic - Probe 5", { node: 0, cast: 1, type: 4096, mv: 198.81, energy: 2.5, concerto: 5, offtune: 8e3, forte1: 20 });
var HA9 = xlyAction("Heavy - Probe", { node: 0, cast: 3, type: 8192, mv: 82.81 * 2, energy: 2.1, concerto: 4.18, offtune: 6664, forte1: 18 });
var MA10 = xlyAction("Mid-air - Probe", { node: 0, cast: 2, type: 4096, mv: 123.27, energy: 0.52, concerto: 1, offtune: 4960, forte1: 13 });
var DC11 = xlyAction("Dodge Counter - Probe", { node: 0, cast: 0, type: 4096, mv: 238.58, energy: 2.75, concerto: 12.5, offtune: 4e3, forte1: 26 });
var Skill13 = xlyAction("Skill - Deduction", { node: 1, cast: 4, type: 12288, mv: 198.81, energy: 6.25, concerto: 7, offtune: 4e3, forte1: 40 });
var FSkill4 = xlyAction("Forte Skill - Decipher", { node: 2, cast: 4, type: 16384, mv: 397.82, energy: 1.67, concerto: 7, offtune: 5336, forte1: -100 });
var Liberation12 = xlyAction("Liberation - Cogitation Model", { node: 3, cast: 5, type: 16384, mv: 1466.06, concerto: 20, offtune: 67200, resetEnergy: true });
var UBA1 = xlyAction("Basic - Pivot: Impale 1", { node: 3, cast: 1, type: 4096, mv: 119.67, energy: 1.31, concerto: 2.62, offtune: 4192, forte2: 1 });
var UBA2 = xlyAction("Basic - Pivot: Impale 2", { node: 3, cast: 1, type: 4096, mv: 60.92 * 4, energy: 2.68, concerto: 5.36, offtune: 8536, forte2: 2 });
var UBA3 = xlyAction("Basic - Pivot: Impale 3", { node: 3, cast: 1, type: 4096, mv: 133.25 * 2, energy: 2.92, concerto: 5.84, offtune: 9336, forte2: 2 });
var USkill2 = xlyAction("Skill - Divergence", { node: 3, cast: 4, type: 12288, mv: 49.59 * 3 + 173.55 * 2, energy: 9.94, concerto: 15, offtune: 9316, forte2: 2 });
var UDC = xlyAction("Dodge Counter - Unfathomed", { node: 3, cast: 0, type: 16384, mv: 38.83 * 2 + 310.58, energy: 4, concerto: 15, offtune: 8e3, forte2: 2 });
var UForte = xlyAction("Forte Skill - Law of Reigns", { node: 2, cast: 4, type: 16384, mv: 95.73 * 4 + 255.28, energy: 4.78, concerto: 10, offtune: 45600, forte2: -5 });
var FBA5 = xlyAction("Mid-air - Revamp", { node: 2, cast: 2, type: 16384, mv: 21.87 * 4 + 65.61 * 2, energy: 2.78, concerto: 5, offtune: 8800, forte2: 3 });
var Intro15 = xlyAction("Intro - Principle", { node: 4, cast: 6, type: 20480, mv: 99.41 * 2, energy: 10, concerto: 10, offtune: 11200 });
var Outro15 = xlyAction("Outro - Chain Rule", {
  cast: 7,
  concerto: -100,
  active: false,
  // queued three times so the adopter picks the buff up at all three charges
  updateBuffs: () => {
    queueOutro(XLY_OUTRO);
    queueOutro(XLY_OUTRO);
    queueOutro(XLY_OUTRO);
  }
});
var CHAIN_RULE_FIELD = new ActionField("Xiangli Yao: Chain Rule");
var ACTION_OUTRO_COORD2 = xlyAction("Outro - Chain Rule (Laser)", { type: 24576, mv: 237.63, active: false, field: CHAIN_RULE_FIELD });
var KNOWING = new Buff({
  name: "Inherent: Knowing",
  maxStacks: 4,
  applyStats: () => addStat(
    17,
    5 * frozenStacks(),
    128
    /* Attribute.Electro */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(KNOWING);
  }
});
var XLY_INHERENT_1 = new Inherent({
  name: "Inherent: Knowing",
  updateBuffs: () => {
    if (casting(
      4
      /* Cast.Skill */
    ))
      applyCurrent(KNOWING, 1);
  }
});
var XLY_INHERENT_2 = new Inherent({ name: "Inherent: Focus" });
var XLY_OUTRO = new Buff({
  field: CHAIN_RULE_FIELD,
  name: "Xiangli Yao: Outro",
  maxStacks: 3,
  updateBuffs: () => {
    if (casting(
      1
      /* Cast.Basic */
    ) || casting(
      2
      /* Cast.MidAir */
    )) {
      queueOn(XIANGLI_YAO_RESONATOR, ACTION_OUTRO_COORD2);
      removeStack(XLY_OUTRO, 1);
    }
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(XLY_OUTRO);
  }
});
var XIANGLI_YAO_RESONATOR = new Resonator({
  name: "Xiangli Yao",
  element: 128,
  weapon: 3,
  intro: () => Intro15,
  outro: () => Outro15,
  color: "#6b74e8",
  maxEnergy: 125,
  constantStats: () => {
    addStat(1, 10625);
    addStat(0, 425);
    addStat(2, 1222.22);
  }
});
var XLY_TALENTS = new Talent({
  name: "Xiangli Yao: Talents",
  constantStats: () => {
    addStat(10, 16);
    addStat(6, 12);
  }
});
var UBA123 = new ActionGroup("Basic - Pivot: Impale 123", [UBA1, UBA2, UBA3]);
var XLY_ROTATION = new Rotation([
  INTRO,
  Skill13,
  Skill13,
  // TODO swapped
  Liberation12,
  USkill2,
  FBA5,
  UForte,
  UBA123,
  UForte,
  USkill2,
  FBA5,
  UForte,
  ECHO_SWAP,
  OUTRO
]);
var XIANGLI_YAO = new Loadout({
  resonator: XIANGLI_YAO_RESONATOR,
  matrix: matrix("Xiangli Yao", 25),
  talent: XLY_TALENTS,
  inherent1: XLY_INHERENT_1,
  inherent2: XLY_INHERENT_2,
  weapons: [IUNO_SIG, NEW_STD_GAUNTLET, VERITYS_HANDLE, ABYSS_SURGES],
  echoLoadouts: [new EchoLoadout(NM_MEPHIS, VOID_THUNDER_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    11,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: XLY_ROTATION
});

// dist/src/resonators/electro/yinlin.js
function yinlinAction(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var BA115 = yinlinAction("Basic - Zapstring's Dance 1", { node: 0, cast: 1, type: 4096, mv: 28.81, energy: 0.6, concerto: 2, offtune: 3144, forte1: 1 });
var BA215 = yinlinAction("Basic - Zapstring's Dance 2", { node: 0, cast: 1, type: 4096, mv: 33.82 * 2, energy: 1.5, concerto: 5, offtune: 6152, forte1: 1 });
var BA315 = yinlinAction("Basic - Zapstring's Dance 3", { node: 0, cast: 1, type: 4096, mv: 13.99 * 7, energy: 2.45, concerto: 7, offtune: 7147, forte1: 3 });
var BA412 = yinlinAction("Basic - Zapstring's Dance 4", { node: 0, cast: 1, type: 4096, mv: 75.16, energy: 1.5, concerto: 6, offtune: 4976, forte1: 4 });
var HA10 = yinlinAction("Heavy - Zapstring's Dance", { node: 0, cast: 3, type: 8192, mv: 29.83 * 2, energy: 1.8, concerto: 4.5, offtune: 9392, forte1: 8 });
var MA11 = yinlinAction("Mid-air - Zapstring's Dance", { node: 0, cast: 2, type: 4096, mv: 123.27, energy: 0.51, concerto: 5, offtune: 4960, forte1: 2 });
var DC12 = yinlinAction("Dodge Counter - Zapstring's Dance", { node: 0, cast: 0, type: 4096, mv: 24.22 * 7, energy: 3.99, concerto: 17, offtune: 11746 });
var Skill14 = yinlinAction("Skill - Magnetic Roar", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 59.65 * 3,
  energy: 15,
  concerto: 10,
  offtune: 6666,
  forte1: 12,
  updateBuffs: () => setStacksSelf(EXECUTION_MODE, 4)
});
var Skill24 = yinlinAction("Skill - Lightning Execution", { node: 1, cast: 4, type: 12288, mv: 89.47 * 4, energy: 15, concerto: 15, offtune: 5328, forte1: 4 });
var ACTION_BLAST = yinlinAction("Skill - Electromagnetic Blast", { node: 1, type: 12288, mv: 19.89, concerto: 5 });
var Liberation13 = yinlinAction("Liberation - Thundering Wrath", { node: 3, cast: 5, type: 16384, mv: 116.56 * 7, concerto: 20, offtune: 36001, resetEnergy: true });
var FHA4 = yinlinAction("Forte Heavy - Chameleon Cipher", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 178.93 * 2,
  energy: 10,
  concerto: 20,
  offtune: 52e3,
  forte1: -40,
  updateBuffs: () => {
    if (stacksOfEnemy(SINNERS_MARK)) {
      revokeEnemy(SINNERS_MARK);
      applyEnemy(PUNISHMENT_MARK, 18);
    }
  }
});
var PUNISHMENT_FIELD = new ActionField("Yinlin: Punishment Mark");
var ACTION_JUDGMENT_STRIKE = yinlinAction("Forte - Judgment Strike", { node: 2, type: 12288, type2: 262144, mv: 78.64, active: false, field: PUNISHMENT_FIELD });
var Intro16 = yinlinAction("Intro - Raging Storm", { node: 4, cast: 6, type: 20480, mv: 14.32 * 10, energy: 10, concerto: 10, offtune: 9520, forte1: 12 });
var Outro16 = yinlinAction("Outro - Strategist", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(YINLIN_OUTRO)
});
var SINNERS_MARK = new Debuff({
  name: "Yinlin: Sinner's Mark",
  updateBuffs: () => {
    if (!currentAction().active && isHeld(YINLIN_RESONATOR))
      revokeEnemy(SINNERS_MARK);
  }
});
var PUNISHMENT_MARK = coordinatedBuff("Yinlin: Punishment Mark", 18, () => YINLIN_RESONATOR, ACTION_JUDGMENT_STRIKE, { enemy: true });
var EXECUTION_MODE = new Buff({
  name: "Yinlin: Execution Mode",
  maxStacks: 4,
  updateBuffs: () => {
    if ((casting(
      1
      /* Cast.Basic */
    ) || casting(
      2
      /* Cast.MidAir */
    ) || casting(
      0
      /* Cast.DodgeCounter */
    )) && stacksOfEnemy(SINNERS_MARK)) {
      queue(ACTION_BLAST);
      removeStack(EXECUTION_MODE, 1);
    }
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(EXECUTION_MODE);
  }
});
var PAIN_IMMERSION = new Buff({
  name: "Inherent: Pain Immersion",
  applyStats: () => addStat(9, 15),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(PAIN_IMMERSION);
  }
});
var YL_INHERENT_1 = new Inherent({
  name: "Inherent: Pain Immersion",
  updateBuffs: () => {
    if (currentAction() === Skill14)
      applyCurrent(PAIN_IMMERSION, 1);
  }
});
var DEADLY_FOCUS = new Buff({
  name: "Inherent: Deadly Focus",
  applyStats: () => addStat(6, 10),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(DEADLY_FOCUS);
  }
});
var YL_INHERENT_2 = new Inherent({
  name: "Inherent: Deadly Focus",
  updateBuffs: () => {
    if (currentAction() === Skill24 && stacksOfEnemy(SINNERS_MARK))
      applyCurrent(DEADLY_FOCUS, 1);
  },
  applyStats: () => {
    if (currentAction() === Skill24 && stacksOfEnemy(SINNERS_MARK))
      addStat(17, 10);
  }
});
var YINLIN_OUTRO = new Buff({
  name: "Yinlin: Outro",
  applyStats: () => {
    addStat(
      18,
      20,
      128
      /* Attribute.Electro */
    );
    addStat(
      18,
      25,
      16384
      /* Type1.Liberation */
    );
  },
  updateBuffs: () => {
    lostOnSwap();
  }
});
var YINLIN_RESONATOR = new Resonator({
  name: "Yinlin",
  element: 128,
  weapon: 4,
  intro: () => Intro16,
  outro: () => Outro16,
  color: "#a45ee8",
  maxEnergy: 125,
  updateBuffs: () => {
    if (casting(
      1
      /* Cast.Basic */
    ) || casting(
      2
      /* Cast.MidAir */
    ) || casting(
      0
      /* Cast.DodgeCounter */
    ) || casting(
      6
      /* Cast.Intro */
    ) || currentAction() === Liberation13) {
      applyEnemy(SINNERS_MARK, 1);
    }
  },
  constantStats: () => {
    addStat(1, 11e3);
    addStat(0, 400);
    addStat(2, 1283.33);
  }
});
var YINLIN_TALENTS = new Talent({
  name: "Yinlin: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var YL_ROTATION = new Rotation([
  INTRO,
  ECHO_CANCEL,
  Skill14,
  HA10,
  Liberation13,
  Skill24,
  FHA4,
  OUTRO
]);
var YINLIN_MATRIX_TEAM = new Buff({
  name: "Yinlin: Matrix (team)",
  applyStats: () => addStat(
    17,
    30,
    16384
    /* Type1.Liberation */
  )
});
var YINLIN_MATRIX = matrix("Yinlin", 20, {
  updateBuffs: () => {
    if (casting(
      5
      /* Cast.Liberation */
    ))
      applyTeam(YINLIN_MATRIX_TEAM);
  }
});
var YINLIN = new Loadout({
  resonator: YINLIN_RESONATOR,
  matrix: YINLIN_MATRIX,
  talent: YINLIN_TALENTS,
  inherent1: YL_INHERENT_1,
  inherent2: YL_INHERENT_2,
  weapons: [LETHEAN_ELEGY, COSMIC_RIPPLES, STRINGMASTER, NEW_STD_RECTIFIER],
  echoLoadouts: [
    new EchoLoadout(NM_TEMPEST_MEPHIS, EMPYREAN_ANTHEM_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    11,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "skill"),
  rotation: YL_ROTATION
});

// dist/src/resonators/fusion/aemeath.js
function aemeathAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var TO_MECH = { updateBuffs: () => applyCurrent(MECH_FORM, 1) };
var TO_AEMEATH = { updateBuffs: () => revokeCurrent(MECH_FORM) };
var DUO = { updateBuffs: () => applyCurrent(SERAPHIC_DUO, 1) };
var ABA1 = aemeathAction("Basic - Aemeath 1", { node: 0, cast: 1, type: 4096, mv: 46.35, energy: 0.84, concerto: 1.67, offtune: 2664, forte1: 3.29 });
var ABA2 = aemeathAction("Basic - Aemeath 2", { node: 0, cast: 1, type: 4096, mv: 69.46, energy: 1.26, concerto: 2.5, offtune: 3993, forte1: 6.44 });
var ABA3 = aemeathAction("Basic - Aemeath 3", { node: 0, cast: 1, type: 4096, mv: 93.15, energy: 1.69, concerto: 3.37, offtune: 5355, forte1: 16.66 });
var ABA4 = aemeathAction("Basic - Aemeath 4", { node: 0, cast: 1, type: 4096, mv: 134.59, energy: 2.47, concerto: 4.88, offtune: 7737, forte1: 23.31, ...DUO });
var AHA1 = aemeathAction("Heavy - Aemeath: Charged I", { node: 0, cast: 3, type: 16384, mv: 92.83, energy: 1.68, concerto: 3.34, offtune: 5337 });
var AHA2 = aemeathAction("Heavy - Aemeath: Charged II", { node: 0, cast: 3, type: 16384, mv: 232, energy: 4.18, concerto: 8.35, offtune: 13337 });
var AMA = aemeathAction("Mid-air - Aemeath", { node: 0, cast: 2, type: 4096, mv: 86.29, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 11.71 });
var ADC = aemeathAction("Dodge Counter - Aemeath", { node: 0, cast: 0, type: 4096, mv: 260.15, energy: 3.19, concerto: 16.37, offtune: 10155, forte1: 28.99 });
var MBA1 = aemeathAction("Basic - Mech 1", { node: 0, cast: 1, type: 4096, mv: 69.6, energy: 1.26, concerto: 2.52, offtune: 4002, forte1: 6.45 });
var MBA2 = aemeathAction("Basic - Mech 2", { node: 0, cast: 1, type: 4096, mv: 92.83, energy: 1.68, concerto: 3.34, offtune: 5337, forte1: 9.6 });
var MBA3 = aemeathAction("Basic - Mech 3", { node: 0, cast: 1, type: 4096, mv: 116.53, energy: 2.1, concerto: 4.19, offtune: 6702, forte1: 19.88 });
var MBA4 = aemeathAction("Basic - Mech 4", { node: 0, cast: 1, type: 4096, mv: 134.59, energy: 2.43, concerto: 4.85, offtune: 7737, forte1: 23.28, ...DUO });
var MHA1 = aemeathAction("Heavy - Mech: Charged I", { node: 0, cast: 3, type: 16384, mv: 92.83, energy: 1.67, concerto: 3.34, offtune: 5336 });
var MHA2 = aemeathAction("Heavy - Mech: Charged II", { node: 0, cast: 3, type: 16384, mv: 232, energy: 4.17, concerto: 8.34, offtune: 13336 });
var MDC4 = aemeathAction("Dodge Counter - Mech", { node: 0, cast: 0, type: 4096, mv: 283.49, energy: 3.6, concerto: 17.19, offtune: 11502, forte1: 32.2 });
var ArmamentMerge = aemeathAction("Skill - Sync Strike: Armament Merge", { node: 1, cast: 4, type: 12288, mv: 134.59, energy: 2.43, concerto: 4.85, offtune: 7737, forte1: 18.29, ...TO_MECH });
var CallOfDawn = aemeathAction("Skill - Sync Strike: Call of Dawn", { node: 1, cast: 4, type: 12288, mv: 163.27, energy: 2.96, concerto: 5.88, offtune: 9386, forte1: 22.18, ...TO_AEMEATH });
var DUET = { node: 2, cast: 4, type: 16384, forte1: -100, forte2: 1 };
var AmyFSkill = aemeathAction("Forte - Seraphic Duet: Overture", { ...DUET, mv: 357.95, energy: 5.05, concerto: 10.04, offtune: 16004, ...TO_MECH });
var MechFSkill = aemeathAction("Forte - Seraphic Duet: Encore", { ...DUET, mv: 357.9, energy: 5, concerto: 10, offtune: 16e3, ...TO_AEMEATH });
var isDuet = (a) => a === AmyFSkill || a === MechFSkill;
var Lib13 = aemeathAction("Liberation - Heavenfall Edict: Overdrive", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 1004.02,
  concerto: 20,
  offtune: 84e3,
  resetEnergy: true,
  forte1: 30,
  forte2: 1,
  updateBuffs: () => {
    applyCurrent(MECH_FORM, 1);
    applyCurrent(UNBOUND, 1);
    applyCurrent(STARDUST, 2);
  }
});
var Lib23 = aemeathAction("Liberation - Heavenfall Edict: Finale", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 1789.29,
  energy: 20,
  concerto: 20,
  offtune: 84e3,
  forte1: -200,
  forte2: -4,
  updateBuffs: () => {
    if (forte1() > 200)
      setForte1(200);
    if (forte2() > 4)
      setForte2(4);
    revokeCurrent(MECH_FORM);
  }
});
var INTRO_DEF = { node: 4, cast: 6, type: 20480, energy: 10, concerto: 10, forte1: 40, updateBuffs: () => applyCurrent(STARLUME, 1) };
var Intro17 = aemeathAction("Intro - Songs Across the Universe", { ...INTRO_DEF, mv: 134.58, offtune: 7737 });
var EIntro3 = aemeathAction("Intro - Debut of Meteoric Radiance", { ...INTRO_DEF, mv: 163.25, offtune: 9385 });
var Outro17 = aemeathAction("Outro - Silent Protection", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => {
    const buff = isHeld(MODE_BURST) ? SILENT_PROTECTION_BURST : SILENT_PROTECTION_RUPTURE;
    for (const m of currentTeam().slots) {
      if (!m.resonator || m.resonator === AEMEATH_RESONATOR)
        continue;
      revokeBuff(m.resonator, buff);
      addBuff(m.resonator, buff, 1);
    }
  }
});
var MECH_FORM = new Buff({ name: "Aemeath: Mech Form" });
var SERAPHIC_DUO = new Buff({
  name: "Aemeath: Seraphic Duo",
  updateBuffs: () => {
    if (currentAction() === Outro17)
      revokeCurrent(SERAPHIC_DUO);
  }
});
var STARLUME = new Buff({
  name: "Aemeath: Starlume Acceleration",
  applyStats: () => {
    if (currentAction() === Lib13)
      addStat(30, 1);
  },
  convertStats: () => {
    if (currentAction() === Lib13 || casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(STARLUME);
  }
});
var STARDUST = new Buff({
  name: "Aemeath: Stardust Resonance",
  maxStacks: 2,
  applyStats: () => {
    const a = currentAction();
    if (a === Volley)
      addStat(15, 109.35 * 5);
    if (a === DuetBurst)
      addStat(16, 200);
  },
  afterAction: () => {
    const a = currentAction();
    if (a === Volley || a === DuetBurst)
      removeStack(STARDUST, 1);
  }
});
var UNBOUND = new Buff({
  name: "Aemeath: Heavenfall Edict - Unbound",
  convertStats: () => {
    if (currentAction() === Lib23)
      revokeCurrent(UNBOUND);
  },
  afterAction: () => {
    if (forte2() >= 4)
      applyCurrent(INSTANT_RESPONSE, 1);
  }
});
var INSTANT_RESPONSE = new Buff({
  name: "Aemeath: Instant Response",
  applyStats: () => {
    const a = currentAction();
    if ((a === AHA2 || a === MHA2) && isHeld(UNBOUND))
      addStat(29, 200);
  },
  convertStats: () => {
    const a = currentAction();
    if (a === AHA2 || a === MHA2 || a === Lib23)
      revokeCurrent(INSTANT_RESPONSE);
  }
});
var AE_INHERENT_1 = new Inherent({
  name: "Inherent: Before All Sounds",
  applyStats: () => {
    if (isHeld(INSTANT_RESPONSE) && casting(
      3
      /* Cast.Heavy */
    ))
      addStat(18, 200);
  }
});
var AEMEATH_TALENTS = new Talent({
  name: "Aemeath: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var AEMEATH_RESONATOR = new Resonator({
  name: "Aemeath",
  element: 192,
  weapon: 0,
  intro: () => stacksOf(MECH_FORM) ? EIntro3 : Intro17,
  outro: () => Outro17,
  color: "#ff4680",
  maxEnergy: 125,
  constantStats: () => {
    addStat(1, 11025);
    addStat(0, 425);
    addStat(2, 1148.88);
    addStat(12, 10);
  },
  // the two gauge caps — the engine floors a gauge at 0 but leaves the ceiling to the kit
  afterAction: () => {
    if (forte1() > 200)
      setForte1(200);
    if (forte2() > 4)
      setForte2(4);
  }
});
var Starburst = aemeathAction("Tune Rupture Response - Starburst", {
  node: 2,
  type: 40960,
  mv: 596.43,
  scaling: 4
  /* Scaling.Tune */
});
var Volley = aemeathAction("Forte - Seraphic Duet: Tune Rupture", {
  node: 2,
  type: 40960,
  mv: 109.35 * 5,
  scaling: 4
  /* Scaling.Tune */
});
var RUPTUROUS_TRAIL = new Debuff({
  name: "Aemeath: Rupturous Trail",
  maxStacks: 30,
  applyStats: () => {
    if (currentAction() === Volley)
      addStat(16, 4 * frozenStacks());
  },
  convertStats: () => {
    if (currentAction() === Volley && stacksOf(STARDUST) !== 2)
      revokeEnemy(RUPTUROUS_TRAIL);
  }
});
var betweenTheStars = () => {
  const slots = frozenStacks();
  return (slots & 1) + (slots >> 1 & 1) + (slots >> 2 & 1);
};
var BETWEEN_THE_STARS_RUPTURE = new Buff({
  name: "Inherent: Between the Stars (rupture)",
  maxStacks: 1 + 2 + 4,
  display: () => `Inherent: Between the Stars (rupture) x${betweenTheStars()}`,
  applyStats: () => {
    addStat(10, 20 * betweenTheStars());
    if (betweenTheStars() >= 3 && currentAction() === Lib23)
      addStat(18, 25);
  }
});
var AE_INHERENT_2 = new Inherent({
  name: "Inherent: Between the Stars",
  updateGlobal: () => {
    const actor = currentTeam().slot;
    const slot = 1 << currentTeam().active;
    if (isHeld(MODE_BURST)) {
      if (!appliedByMember(FUSION_BURST, actor) || (stacksOf(BETWEEN_THE_STARS_BURST) & slot) !== 0)
        return;
      applyCurrent(BETWEEN_THE_STARS_BURST, slot);
      return;
    }
    if (!appliedByMember(TUNE_RUPTURE_SHIFTING, actor) && currentAction().type !== 40960)
      return;
    if ((stacksOf(BETWEEN_THE_STARS_RUPTURE) & slot) !== 0)
      return;
    applyCurrent(BETWEEN_THE_STARS_RUPTURE, slot);
  }
});
var SILENT_PROTECTION_RUPTURE = new Buff({
  name: "Aemeath: Outro",
  maxStacks: 2,
  display: () => frozenStacks() === 2 ? "Aemeath: Outro (rupture)" : "Aemeath: Outro",
  updateBuffs: () => {
    if (appliedByMember(TUNE_RUPTURE_SHIFTING, currentMember()))
      applyCurrent(SILENT_PROTECTION_RUPTURE, 1);
  },
  applyStats: () => addStat(18, frozenStacks() === 2 ? 20 : 10)
});
var inflicts = (a) => a === ABA3 || a === ABA4 || a === MBA3 || a === MBA4 || a === ArmamentMerge || a === CallOfDawn || a === Intro17 || a === EIntro3;
var MODE_RUPTURE = new ResonanceMode({
  name: "Resonance Mode - Tune Rupture",
  updateDebuffs: () => {
    if (inflicts(currentAction()))
      applyRupture();
  },
  updateGlobal: () => {
    tuneRuptureResponse(Starburst);
    const a = currentAction();
    if (a.type === 40960 && a !== Volley)
      applyEnemy(RUPTUROUS_TRAIL, 10);
  },
  updateBuffs: () => {
    if (isDuet(currentAction()))
      queue(Volley);
  }
});
var ABA234 = new ActionGroup("Basic - Aemeath 234", [ABA2, ABA3, ABA4]);
var MBA234 = new ActionGroup("Basic - Mech 234", [MBA2, MBA3, MBA4]);
var AE_ROTATION = new Rotation([
  INTRO,
  ABA3,
  ABA4,
  Lib13,
  MBA234,
  MechFSkill,
  ABA234,
  AmyFSkill,
  MHA2,
  ECHO_CANCEL,
  Lib23,
  OUTRO
]);
var AEMEATH_RUPTURE = new Loadout({
  resonator: AEMEATH_RESONATOR,
  talent: AEMEATH_TALENTS,
  inherent1: AE_INHERENT_1,
  inherent2: AE_INHERENT_2,
  weapons: [EVERBRIGHT_POLESTAR, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(SIGILLUM, TRAILBLAZING_STAR_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    10,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: AE_ROTATION,
  mode: MODE_RUPTURE
});
var DuetBurst = new Action("Forte - Seraphic Duet: Fusion Burst", {
  element: 192,
  type: 32768,
  type2: 1048576,
  scaling: 3,
  mv: 0,
  applyStats: () => addStat(15, FUSION_BURST_ACTIONS[currentTeam().enemyMax(FUSION_BURST)].mv)
});
var FUSION_TRAIL = new Debuff({
  name: "Aemeath: Fusion Trail",
  maxStacks: 30,
  applyStats: () => {
    if (currentAction() === DuetBurst)
      addStat(16, 10 * frozenStacks());
  },
  convertStats: () => {
    if (currentAction() === DuetBurst && stacksOf(STARDUST) !== 2)
      revokeEnemy(FUSION_TRAIL);
  }
});
var BETWEEN_THE_STARS_BURST = new Buff({
  name: "Inherent: Between the Stars (burst)",
  maxStacks: 1 + 2 + 4,
  display: () => `Inherent: Between the Stars (burst) x${Math.min(2, betweenTheStars())}`,
  applyStats: () => {
    const n = Math.min(2, betweenTheStars());
    addStat(10, 30 * n);
    if (n >= 2 && currentAction() === Lib23)
      addStat(18, 25);
  }
});
var SILENT_PROTECTION_BURST = new Buff({
  name: "Aemeath: Outro",
  maxStacks: 2,
  display: () => frozenStacks() === 2 ? "Aemeath: Outro (burst)" : "Aemeath: Outro",
  updateBuffs: () => {
    if (appliedByMember(FUSION_BURST, currentMember()))
      applyCurrent(SILENT_PROTECTION_BURST, 1);
  },
  applyStats: () => addStat(18, frozenStacks() === 2 ? 20 : 10)
});
var MODE_BURST = new ResonanceMode({
  name: "Resonance Mode - Fusion Burst",
  updateDebuffs: () => {
    if (inflicts(currentAction()))
      applyEnemy(FUSION_BURST, 1);
  },
  updateGlobal: () => {
    const team = currentTeam();
    if (stacksOfEnemy(FUSION_BURST) > 5) {
      queueOn(team.slot.resonator, FUSION_BURST_ACTIONS[team.enemyMax(FUSION_BURST)]);
      revokeEnemy(FUSION_BURST);
    }
    if (stacksOfEnemy(FUSION_BURST) === 0) {
      applyEnemy(FUSION_BURST, 1);
    }
    const landed = applied(FUSION_BURST);
    if (landed > 0)
      applyEnemy(FUSION_TRAIL, landed);
  },
  updateBuffs: () => {
    if (isDuet(currentAction()))
      queue(DuetBurst);
  }
});
var AEMEATH_BURST = new Loadout({
  resonator: AEMEATH_RESONATOR,
  talent: AEMEATH_TALENTS,
  inherent1: AE_INHERENT_1,
  inherent2: AE_INHERENT_2,
  weapons: [EVERBRIGHT_POLESTAR, EMERALD_OF_GENESIS],
  echoLoadouts: [
    new EchoLoadout(SIGILLUM, TRAILBLAZING_STAR_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    10,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: AE_ROTATION,
  mode: MODE_BURST
});

// dist/src/resonators/fusion/brant.js
function brantAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var Intro18 = brantAction("Intro - Applaud for Me!", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 253.49,
  offtune: 12e3,
  concerto: 10,
  forte1: 25,
  updateDebuffs: () => applyCurrent(HEALS, 1)
});
var Outro18 = brantAction("Outro - The Course is Set!", { cast: 7, concerto: -100, active: false, updateBuffs: () => queueOutro(BRANT_OUTRO) });
var Skill15 = brantAction("Skill - Anchors Aweigh!", { node: 1, cast: 4, type: 12288, mv: 333.92, offtune: 10160, energy: 7.18, concerto: 10, forte1: 15.76 });
var Liberation14 = brantAction("Liberation - To the Horizon", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 680.45,
  offtune: 48e3,
  concerto: 20,
  resetEnergy: true,
  // Aflame swaps his conversion up to its "My" Moment rate for as long as it lasts
  updateBuffs: () => {
    applyCurrent(AFLAME, 1);
    revokeCurrent(THEATRICAL_MOMENT);
    applyCurrent(MY_MOMENT, 1);
  }
});
var FSkill5 = brantAction("Forte Skill - Returned from Ashes", {
  node: 2,
  cast: 4,
  type: 4096,
  mv: 1888.71,
  offtune: 63200,
  energy: 30,
  concerto: 50,
  forte1: -100,
  updateDebuffs: () => applyCurrent(SHIELD, 1),
  updateBuffs: () => {
    if (forte1() >= 100)
      setForte1(100);
  }
});
var BA116 = brantAction("Basic - Captain's Rhapsody 1", { node: 0, cast: 1, type: 4096, mv: 50.53, energy: 0.75, concerto: 1.5, offtune: 2392, forte1: 2.6 });
var BA216 = brantAction("Basic - Captain's Rhapsody 2", { node: 0, cast: 1, type: 4096, mv: 101.4, energy: 1.5, concerto: 3, offtune: 4800, forte1: 5.24 });
var BA316 = brantAction("Basic - Captain's Rhapsody 3", { node: 0, cast: 1, type: 4096, mv: 132.34, energy: 1.97, concerto: 3.94, offtune: 6264, forte1: 6.82 });
var BA413 = brantAction("Basic - Captain's Rhapsody 4", { node: 0, cast: 1, type: 4096, mv: 140.12, energy: 2.12, concerto: 4.18, offtune: 6631, forte1: 7.24 });
var HA11 = brantAction("Heavy - Captain's Rhapsody", { node: 0, cast: 3, type: 8192, mv: 197.55, energy: 2.93, concerto: 5.85, offtune: 9352, forte1: 14.5 });
var HARiff = brantAction("Heavy - Rhapsodic Riff", { node: 0, cast: 3, type: 8192, mv: 168.99, energy: 2.5, concerto: 5, offtune: 8e3, forte1: 12.4 });
var DC13 = brantAction("Dodge Counter - Captain's Rhapsody", { node: 0, cast: 0, type: 4096, mv: 228.17, energy: 3.41, concerto: 16.77, offtune: 10800 });
var Plunge2 = brantAction("Basic - Plunging Attack", { node: 0, cast: 1, type: 4096, mv: 104.78, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 7.66 });
var MA14 = brantAction("Mid-air - Captain's Rhapsody 1", { node: 0, cast: 2, type: 4096, mv: 122.86, energy: 1.82, concerto: 3.64, offtune: 5816, forte1: 9.02 });
var MA1C = brantAction("Mid-air - Captain's Rhapsody 1 (Charged)", { node: 0, cast: 2, type: 4096, mv: 332.48, energy: 4.96, concerto: 9.85, offtune: 15736, forte1: 24.46 });
var MA25 = brantAction("Mid-air - Captain's Rhapsody 2", { node: 0, cast: 2, type: 4096, mv: 169.84, energy: 2.52, concerto: 5.04, offtune: 8040, forte1: 12.48 });
var MA2C = brantAction("Mid-air - Captain's Rhapsody 2 (Charged)", { node: 0, cast: 2, type: 4096, mv: 197.22, energy: 2.94, concerto: 5.88, offtune: 9336, forte1: 25.32 });
var MA34 = brantAction("Mid-air - Captain's Rhapsody 3", { node: 0, cast: 2, type: 4096, mv: 169.02, energy: 2.52, concerto: 5.04, offtune: 7998, forte1: 18.6 });
var MAFlip = brantAction("Mid-air - Captain's Rhapsody Flip", { node: 0, cast: 2, type: 4096, mv: 92.95, energy: 1.38, concerto: 2.75, offtune: 4400, forte1: 10.24 });
var MASlash = brantAction("Mid-air - Captain's Rhapsody 1 Slash", { node: 0, cast: 2, type: 4096, mv: 84.51, energy: 1.26, concerto: 2.52, offtune: 3999 });
var MA42 = brantAction("Mid-air - Captain's Rhapsody 4", { node: 0, cast: 2, type: 4096, mv: 253.85, energy: 3.78, concerto: 7.55, offtune: 12017, forte1: 18.7 });
var MA1F = MA14.variant(MA14.name, { updateBuffs: () => queue(MAFlip) });
var MA2F = MA25.variant(MA25.name, { updateBuffs: () => queue(MAFlip) });
var MA3F = MA34.variant(MA34.name, { updateBuffs: () => queue(MAFlip) });
var MA1CF = MA1C.variant(MA1C.name, { updateBuffs: () => queue(MAFlip) });
var MA2CF = MA2C.variant(MA2C.name, { updateBuffs: () => queue(MAFlip) });
var AFLAME = new Buff({
  name: "Brant: Aflame",
  applyStats: () => {
    const a = currentAction();
    if (a.node === 0 || a.node === 1)
      addStat(29, a.forte1);
  },
  // ...and hands the conversion back down as it goes. "My" Moment has already paid out this
  // action by now (the roster was frozen with it held), so this cast still gets the Aflame rate.
  convertStats: () => {
    if (!(casting(
      7
      /* Cast.Outro */
    ) || currentAction() === FSkill5))
      return;
    revokeCurrent(AFLAME);
    revokeCurrent(MY_MOMENT);
    applyCurrent(THEATRICAL_MOMENT, 1);
  }
});
var THEATRICAL_MOMENT = new Buff({
  name: "Brant: Theatrical Moment",
  convertStats: () => addStat(3, Math.min(1560, 12 * Math.max(0, getStat(
    11
    /* Stat.Er */
  ) - 150)))
});
var MY_MOMENT = new Buff({
  name: 'Brant: "My" Moment',
  convertStats: () => addStat(3, Math.min(2600, 20 * Math.max(0, getStat(
    11
    /* Stat.Er */
  ) - 150)))
});
var BRANT_OUTRO = new Buff({
  name: "Brant: Outro",
  applyStats: () => {
    addStat(
      18,
      20,
      192
      /* Attribute.Fusion */
    );
    addStat(
      18,
      25,
      12288
      /* Type1.Skill */
    );
  },
  updateBuffs: () => {
    lostOnSwap();
  }
});
var BR_TRIAL_INHERENT = new Inherent({
  name: "Inherent: Trial by Fire and Tide",
  constantStats: () => addStat(
    17,
    15,
    192
    /* Attribute.Fusion */
  )
});
var BR_VOYAGE_INHERENT = new Inherent({
  name: "Inherent: Voyager's Blaze",
  constantStats: () => addStat(23, 20)
});
var BY_CURRENTS = new Buff({
  name: "Brant S1: By Currents and Winds",
  maxStacks: 3,
  applyStats: () => addStat(17, 20 * frozenStacks()),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(BY_CURRENTS);
  }
});
var BR_S1 = new Sequence({
  name: "Brant S1: By Currents and Winds",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Intro18 || a === MAFlip)
      applyCurrent(BY_CURRENTS, 1);
  }
});
var CourseBlast = brantAction("Outro - The Course is Set! (S2 Blast)", { node: 0, type: 4096, mv: 440, active: false });
var COURSE_BLAST = new Buff({
  name: "Brant S2: The Course is Set! (Blast)",
  maxStacks: 2,
  updateBuffs: () => {
    lostOnSwap();
    if (!currentAction().active || triggeredAction() || !casting(
      4
      /* Cast.Skill */
    ))
      return;
    queueOn(BRANT_RESONATOR, CourseBlast);
    removeStack(COURSE_BLAST, 1);
  }
});
var BR_S2 = new Sequence({
  name: "Brant S2: For Smiles and Cheers",
  // +30% Crit Rate on the mid-air presses and Returned from Ashes itself; the blast rides the outro
  applyStats: () => {
    if (casting(
      2
      /* Cast.MidAir */
    ) || currentAction() === FSkill5)
      addStat(9, 30);
  },
  updateBuffs: () => {
    if (currentAction() === Outro18) {
      queueOutro(COURSE_BLAST);
      queueOutro(COURSE_BLAST);
    }
  }
});
var BR_S3 = new Sequence({
  name: "Brant S3: Through Storms I Sail",
  applyStats: () => {
    const a = currentAction();
    if (a === FSkill5 || a === AshesBlast)
      addStat(16, 42);
  }
});
var BR_S4 = new Sequence({
  name: "Brant S4: To Freedom I Sing",
  updateDebuffs: () => {
    if (currentAction() === FSkill5)
      applyCurrent(HEALS, 1);
  }
});
var ACTORS_STAGE = new Buff({
  name: "Brant S5: All the World's an Actor's Stage",
  applyStats: () => addStat(
    17,
    15,
    4096
    /* Type1.Basic */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(ACTORS_STAGE);
  }
});
var BR_S5 = new Sequence({
  name: "Brant S5: All the World's an Actor's Stage",
  updateBuffs: () => {
    if (isType(
      4096
      /* Type1.Basic */
    ))
      applyCurrent(ACTORS_STAGE, 1);
  }
});
var AshesBlast = brantAction("Forte - Returned from Ashes (S6 Blast)", { node: 2, type: 4096, mv: 1888.71 * 0.3 });
var BR_S6 = new Sequence({
  name: "Brant S6: All the World's a Captain's Carnevale",
  applyStats: () => {
    if (casting(
      2
      /* Cast.MidAir */
    ))
      addStat(16, 30);
  },
  updateBuffs: () => {
    if (currentAction() === FSkill5)
      queue(AshesBlast);
  }
});
var BRANT_RESONATOR = new Resonator({
  name: "Brant",
  element: 192,
  weapon: 0,
  intro: () => Intro18,
  outro: () => Outro18,
  color: "#d1257f",
  maxEnergy: 175,
  combatStart: () => applyCurrent(THEATRICAL_MOMENT, 1),
  constantStats: () => {
    addStat(1, 11675);
    addStat(0, 375);
    addStat(2, 1308);
  }
});
var BRANT_TALENTS = new Talent({
  name: "Brant: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var BR_ROTATION = new Rotation([
  INTRO,
  Liberation14,
  MA14,
  MA1CF,
  MA25,
  MA2CF,
  MA34,
  ECHO_CANCEL,
  MA3F,
  FSkill5,
  OUTRO
]);
var BRANT = new Loadout({
  resonator: BRANT_RESONATOR,
  matrix: matrix("Brant", 25),
  talent: BRANT_TALENTS,
  inherent1: BR_TRIAL_INHERENT,
  inherent2: BR_VOYAGE_INHERENT,
  sequences: [BR_S1, BR_S2, BR_S3, BR_S4, BR_S5, BR_S6],
  weapons: [UNFLICKERING_VALOR, EMERALD_OF_GENESIS, NEW_STD_SWORD, BLOODPACTS_PLEDGE],
  echoLoadouts: [
    new EchoLoadout(DRAGON_OF_DIRGE, TIDEBREAKING_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    5,
    10,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: BR_ROTATION
});
var BR_ROTATION_MDPS = new Rotation([
  DOUBLE_INTRO,
  MA2F,
  MA3F,
  SWAP,
  INTRO,
  FSkill5,
  Liberation14,
  MA14,
  MA1CF,
  MA25,
  MA2CF,
  MA34,
  ECHO_CANCEL,
  MA3F,
  FSkill5,
  OUTRO
]);
var BRANT_MDPS = new Loadout({
  resonator: BRANT_RESONATOR,
  matrix: matrix("Brant", 25),
  talent: BRANT_TALENTS,
  inherent1: BR_TRIAL_INHERENT,
  inherent2: BR_VOYAGE_INHERENT,
  sequences: [BR_S1, BR_S2, BR_S3, BR_S4, BR_S5, BR_S6],
  weapons: [UNFLICKERING_VALOR, EMERALD_OF_GENESIS, NEW_STD_SWORD, BLOODPACTS_PLEDGE],
  echoLoadouts: [
    new EchoLoadout(DRAGON_OF_DIRGE, TIDEBREAKING_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    5,
    10,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: BR_ROTATION_MDPS
});

// dist/src/resonators/fusion/changli.js
function changliAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA117 = changliAction("Basic - Blazing Enlightenment 1", { node: 0, cast: 1, type: 4096, mv: 58.98, offtune: 2792, energy: 0.88, concerto: 1.76 });
var BA217 = changliAction("Basic - Blazing Enlightenment 2", { node: 0, cast: 1, type: 4096, mv: 70.98, offtune: 3360, energy: 1.06, concerto: 2.1 });
var BA317 = changliAction("Basic - Blazing Enlightenment 3", { node: 0, cast: 1, type: 4096, mv: 109.35, offtune: 5178, energy: 1.62, concerto: 3.24 });
var BA414 = changliAction("Basic - Blazing Enlightenment 4", { node: 0, cast: 1, type: 4096, mv: 169.02, offtune: 8e3, energy: 2.51, concerto: 5.02 });
var DC14 = changliAction("Dodge Counter - Blazing Enlightenment 3", { node: 0, cast: 0, type: 4096, mv: 247.92, offtune: 9978, energy: 3.12, concerto: 16.24 });
var HA12 = changliAction("Heavy - Blazing Enlightenment", { node: 0, cast: 3, type: 8192, mv: 124.24, offtune: 5880, energy: 1.85, concerto: 3.69 });
var MA15 = changliAction("Mid-air - Blazing Enlightenment 1", { node: 0, cast: 2, type: 4096, mv: 61.35, offtune: 2904, energy: 0.91, concerto: 1.82 });
var MA26 = changliAction("Mid-air - Blazing Enlightenment 2", { node: 0, cast: 2, type: 4096, mv: 101.74, offtune: 4816, energy: 1.52, concerto: 3.02 });
var MA35 = changliAction("Mid-air - Blazing Enlightenment 3", { node: 0, cast: 2, type: 4096, mv: 132, offtune: 6249, energy: 1.98, concerto: 3.93 });
var MA43 = changliAction("Mid-air - Blazing Enlightenment 4", { node: 0, cast: 2, type: 4096, mv: 126.75, offtune: 6e3, energy: 1.89, concerto: 3.77 });
var MHA = changliAction("Heavy - Blazing Enlightenment (Mid-Air)", { node: 0, cast: 3, type: 8192, mv: 123.27, offtune: 4960, energy: 1.55, concerto: 1 });
var SBA = changliAction("Basic - True Sight: Conquest", { node: 1, cast: 1, type: 12288, mv: 294.73, offtune: 8985, energy: 4.04, concerto: 7, forte1: 1 });
var SMA = changliAction("Basic - True Sight: Charge", { node: 1, cast: 1, type: 12288, mv: 181.7, offtune: 4353, energy: 2.57, concerto: 6, forte1: 1 });
var Skill16 = changliAction("Skill - Tripartite Flames", { node: 1, cast: 4, type: 12288, mv: 409.4, offtune: 12480, energy: 8, concerto: 14 });
var FlamingSacrifice = changliAction("Forte Heavy - Flaming Sacrifice", { node: 2, cast: 3, type: 12288, mv: 654.1, offtune: 31141, energy: 6.61, concerto: 10, forte1: -4 });
var Liberation15 = changliAction("Liberation - Radiance of Fealty", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 1212.75,
  offtune: 100800,
  concerto: 20,
  forte1: 4,
  resetEnergy: true,
  updateBuffs: () => applyCurrent(FIERY_FEATHER, 1)
});
var Intro19 = changliAction("Intro - Obedience of Rules", { node: 4, cast: 6, type: 20480, mv: 148.34, offtune: 5971, energy: 10, concerto: 10 });
var Outro19 = changliAction("Outro - Strategy of Duality", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(CHANGLI_OUTRO)
});
var TRUE_SIGHT = new Buff({
  name: "Changli: True Sight"
});
var CH_INHERENT_1 = new Inherent({
  name: "Inherent: Secret Strategist",
  applyStats: () => {
    const a = currentAction();
    if (a === SBA || a === SMA)
      addStat(
        17,
        5 * forte1(),
        192
        /* Attribute.Fusion */
      );
  }
});
var CH_INHERENT_2 = new Inherent({
  name: "Inherent: Sweeping Force",
  applyStats: () => {
    const a = currentAction();
    if (a === FlamingSacrifice || a === Liberation15) {
      addStat(
        17,
        20,
        192
        /* Attribute.Fusion */
      );
      addStat(22, 15);
    }
  }
});
var FIERY_FEATHER = new Buff({
  name: "Changli: Fiery Feather",
  applyStats: () => {
    if (currentAction() === FlamingSacrifice)
      addStat(6, 25);
  },
  convertStats: () => {
    if (currentAction() === FlamingSacrifice)
      revokeCurrent(FIERY_FEATHER);
  }
});
var CHANGLI_OUTRO = new Buff({
  name: "Changli: Outro",
  applyStats: () => {
    addStat(
      18,
      20,
      192
      /* Attribute.Fusion */
    );
    addStat(
      18,
      25,
      16384
      /* Type1.Liberation */
    );
  },
  updateBuffs: () => {
    lostOnSwap();
  }
});
var tripartite = (a) => a === Skill16 || a === SBA || a === SMA;
var CH_S1 = new Sequence({
  name: "Changli S1: Hidden Thoughts",
  applyStats: () => {
    const a = currentAction();
    if (tripartite(a) || a === FlamingSacrifice)
      addStat(17, 10);
  }
});
var PURSUIT_OF_DESIRES = new Buff({
  name: "Changli S2: Pursuit of Desires",
  applyStats: () => addStat(9, 25),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(PURSUIT_OF_DESIRES);
  }
});
var CH_S2 = new Sequence({
  name: "Changli S2: Pursuit of Desires",
  updateBuffs: () => {
    const a = currentAction();
    if (a === SBA || a === SMA || a === Liberation15)
      applyCurrent(PURSUIT_OF_DESIRES, 1);
  }
});
var CH_S3 = new Sequence({
  name: "Changli S3: Learned Secrets",
  applyStats: () => {
    if (currentAction() === Liberation15)
      addStat(17, 80);
  }
});
var POLISHED_WORDS = new Buff({
  name: "Changli S4: Polished Words (team)",
  applyStats: () => addStat(6, 20)
});
var CH_S4 = new Sequence({
  name: "Changli S4: Polished Words",
  updateBuffs: () => {
    if (currentAction() === Intro19)
      applyTeam(POLISHED_WORDS, 1);
  }
});
var CH_S5 = new Sequence({
  name: "Changli S5: Sacrificed Gains",
  applyStats: () => {
    if (currentAction() === FlamingSacrifice) {
      addStat(16, 50);
      addStat(17, 50);
    }
  }
});
var CH_S6 = new Sequence({
  name: "Changli S6: Realized Plans",
  applyStats: () => {
    const a = currentAction();
    if (tripartite(a) || a === FlamingSacrifice || a === Liberation15)
      addStat(22, 40);
  }
});
var CHANGLI_RESONATOR = new Resonator({
  name: "Changli",
  element: 192,
  weapon: 0,
  intro: () => Intro19,
  outro: () => Outro19,
  color: "#f38b68",
  maxEnergy: 125,
  // her combo finishers/Skill/Intro arm True Sight; the two Sword-of-Fealty casts spend it
  updateBuffs: () => {
    const a = currentAction();
    if (a === BA414 || a === MA43 || a === Skill16 || a === Intro19)
      applyCurrent(TRUE_SIGHT, 1);
    if (a === SBA || a === SMA)
      revokeCurrent(TRUE_SIGHT);
  },
  constantStats: () => {
    addStat(1, 12762);
    addStat(0, 410);
    addStat(2, 1181);
  }
});
var CHANGLI_TALENTS = new Talent({
  name: "Changli: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var CH_ROTATION = new Rotation([
  START_3,
  Liberation15,
  FlamingSacrifice.swap(),
  SWAP,
  // TODO get cancels
  INTRO,
  SMA,
  Skill16,
  SBA,
  Skill16,
  SBA,
  BA117,
  BA217,
  BA317,
  BA414,
  DODGE,
  SBA,
  FlamingSacrifice,
  Liberation15,
  FlamingSacrifice,
  OUTRO
]);
var CHANGLI = new Loadout({
  resonator: CHANGLI_RESONATOR,
  matrix: matrix("Changli", 25),
  talent: CHANGLI_TALENTS,
  inherent1: CH_INHERENT_1,
  inherent2: CH_INHERENT_2,
  sequences: [CH_S1, CH_S2, CH_S3, CH_S4, CH_S5, CH_S6],
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(NM_INFERNO_RIDER, MOLTEN_RIFT_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    10,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "skill"),
  rotation: CH_ROTATION
});

// dist/src/resonators/fusion/denia.js
function deniaAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA118 = deniaAction("Basic - Stagecraft Form 1", { node: 0, cast: 1, type: 4096, mv: 32.69, energy: 0.69, concerto: 1.37, offtune: 2192, forte1: 4 });
var BA218 = deniaAction("Basic - Stagecraft Form 2", { node: 0, cast: 1, type: 4096, mv: 60.36, energy: 1.28, concerto: 2.54, offtune: 4048, forte1: 8 });
var BA318 = deniaAction("Basic - Stagecraft Form 3", { node: 0, cast: 1, type: 4096, mv: 76.47, energy: 1.62, concerto: 3.21, offtune: 5130, forte1: 9 });
var BA415 = deniaAction("Basic - Stagecraft Form 4", { node: 0, cast: 1, type: 4096, mv: 128, energy: 0.69, concerto: 5.37, offtune: 8584, forte1: 30 });
var HA13 = deniaAction("Heavy - Stagecraft Form", { node: 0, cast: 3, type: 8192, mv: 161.52, energy: 3.4, concerto: 6.78, offtune: 10832, forte1: 20 });
var MA16 = deniaAction("Mid-air - Stagecraft Form", { node: 0, cast: 2, type: 4096, mv: 73.97, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 10 });
var DC15 = deniaAction("Dodge Counter - Stagecraft Form 3", { node: 0, cast: 0, type: 4096, mv: 148.05, energy: 3.12, concerto: 16.21, offtune: 5130, forte1: 18 });
var UBA12 = deniaAction("Basic - Breakdown Form 1", { node: 0, cast: 1, type: 4096, mv: 36.51, energy: 0.77, concerto: 1.53, offtune: 2448, forte1: -18, forte2: 3 });
var UBA22 = deniaAction("Basic - Breakdown Form 2", { node: 0, cast: 1, type: 4096, mv: 93.79, energy: 1.99, concerto: 3.94, offtune: 6292, forte1: -46, forte2: 12 });
var UBA32 = deniaAction("Basic - Breakdown Form 3", { node: 0, cast: 1, type: 4096, mv: 62.39, energy: 1.31, concerto: 2.62, offtune: 4184, forte1: -30, forte2: 6 });
var UBA4 = deniaAction("Basic - Breakdown Form 4", { node: 0, cast: 1, type: 4096, mv: 118.46, energy: 2.49, concerto: 4.97, offtune: 7945, forte1: -58, forte2: 11 });
var UHA = deniaAction("Heavy - Breakdown Form", { node: 0, cast: 3, type: 8192, mv: 137.06, energy: 2.88, concerto: 5.75, offtune: 9192, forte1: -66, forte2: 13 });
var UMHA = deniaAction("Heavy - Breakdown Form (Mid-Air)", { node: 0, cast: 3, type: 8192, mv: 73.97, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: -37, forte2: 7 });
var UDC2 = deniaAction("Dodge Counter - Breakdown Form 3", { node: 0, cast: 0, type: 4096, mv: 62.39, energy: 1.31, concerto: 12.62, offtune: 4184, forte1: -30, forte2: 6 });
var UMDC = deniaAction("Dodge Counter - Breakdown Form 3 (Mid-Air)", { node: 0, cast: 0, type: 4096, mv: 62.39, energy: 1.31, concerto: 12.62, offtune: 4184, forte1: -30, forte2: 6 });
var Skill17 = deniaAction("Skill - Phantom Bubble", { node: 1, cast: 4, type: 12288, mv: 104.51, energy: 0.22, concerto: 24.4, offtune: 7008, forte1: 25 });
var Beckon = deniaAction("Skill - Beckon", { node: 1, cast: 4, type: 12288, mv: 103.7, energy: 2.21, concerto: 4.36, offtune: 6956, forte2: 13 });
var Banish1 = deniaAction("Skill - Banish 1", { node: 1, cast: 4, type: 12288, mv: 104.04, energy: 2.19, concerto: 4.38, offtune: 6978 });
var Banish2 = deniaAction("Skill - Banish 2", { node: 1, cast: 4, type: 16384, mv: 112.01, energy: 2.35, concerto: 14.7, offtune: 7512, forte2: 40 });
var Lib14 = deniaAction("Liberation - Final Act (Stagecraft)", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 397.62,
  concerto: 20,
  offtune: 48e3,
  resetEnergy: true,
  updateBuffs: () => {
    revokeCurrent(ENTROPY_STAGECRAFT);
    applyCurrent(ENTROPY_BREAKDOWN);
    applyCurrent(DARK_CORE, 1);
  }
});
var Lib24 = deniaAction("Liberation - Final Act (Breakdown)", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 795.24,
  energy: 30,
  concerto: 20,
  offtune: 52528,
  forte2: -100,
  forte1: -100,
  updateBuffs: () => {
    setForte1(100);
    if (forte2() > 100)
      setForte2(100);
    revokeCurrent(ENTROPY_BREAKDOWN);
    applyCurrent(ENTROPY_STAGECRAFT);
    applyCurrent(DARK_CORE, 1);
    revokeTeam(EROSION_FIELD);
    applyTeam(EROSION_FIELD, 35);
  }
});
var EROSION2 = new ActionField("Denia: Erosion Field");
var ErosionField = deniaAction("Forte - Erosion Field", {
  node: 2,
  type: 16384,
  mv: 136.33,
  active: false,
  field: EROSION2
});
var Intro20 = deniaAction("Intro - It's Been A While!", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 104.62,
  energy: 10,
  concerto: 10,
  offtune: 7016,
  forte1: 25,
  updateBuffs: () => applyCurrent(DARK_CORE)
});
var EIntro4 = deniaAction("Intro - Knock Knock", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 155.22,
  energy: 10.02,
  concerto: 10,
  offtune: 10410,
  forte1: 25,
  updateBuffs: () => {
    revokeCurrent(ENTROPY_STAGECRAFT);
    applyCurrent(ENTROPY_BREAKDOWN);
    applyCurrent(DARK_CORE, 1);
    applyCurrent(DARK_CORE);
  }
});
var Outro20 = deniaAction("Outro - Unfinished Lies", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => {
    if (isHeld(MODE_BURST2))
      applyTeam(UNFINISHED_LIES_BURST, 1);
    else
      queueOutro(UNFINISHED_LIES_STRAIN);
  }
});
var inflictsTwo = (a) => a === Intro20 || a === EIntro4 || a === Lib14 || a === Lib24 || a === ErosionField;
var inflictsOne = (a) => a === BA318 || a === BA415 || a === UBA32 || a === UBA4 || a === UDC2 || a === UMDC;
var MODE_BURST2 = new ResonanceMode({
  name: "Resonance Mode - Fusion Burst",
  updateDebuffs: () => {
    const a = currentAction();
    if (inflictsTwo(a))
      applyEnemy(FUSION_BURST, 2);
    else if (inflictsOne(a))
      applyEnemy(FUSION_BURST, 1);
  }
});
var MODE_STRAIN = new ResonanceMode({
  name: "Resonance Mode - Tune Strain",
  // Shattered Hours: "while Denia is in the team", whichever mode
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1);
    applyTeam(OFFTUNE_SURGE, 1);
  },
  updateDebuffs: () => {
    const a = currentAction();
    if (inflictsTwo(a) || inflictsOne(a))
      applyStrain();
  },
  lateConvertStats: () => tuneStrainBonus()
});
var OFFTUNE_SURGE = new Buff({
  name: "Resonance Mode - Tune Strain",
  applyStats: () => {
    if (applied(TUNE_STRAIN_SHIFTING))
      addStat(28, ENEMY_MAX_OFFTUNE / 2);
  },
  convertStats: () => {
    if (applied(TUNE_STRAIN_SHIFTING))
      revokeTeam(OFFTUNE_SURGE);
  }
});
var spendsVoid = (a) => a.forte1 < 0 && a.forte2 > 0;
var ENTROPY_BREAKDOWN = new Buff({
  name: "Entropy Shift: Breakdown Form",
  // the retag has to land in the first phase, before anything reads the type (see typeOverride)
  updateDebuffs: () => {
    if (spendsVoid(currentAction()) && forte1() > 0)
      typeOverride(
        16384
        /* Type1.Liberation */
      );
  },
  applyStats: () => {
    addStat(6, 30);
    const a = currentAction();
    if (!spendsVoid(a) || forte1() <= 0)
      return;
    addStat(16, 50);
    addStat(30, a.forte2);
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(ENTROPY_BREAKDOWN);
  }
});
var EROSION_FIELD = coordinatedBuff("Denia: Erosion Field", 35, () => DENIA_RESONATOR, ErosionField, { every: 5 });
var ENTROPY_STAGECRAFT = new Buff({
  name: "Entropy Shift: Stagecraft Form",
  applyStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      addStat(29, 20);
  }
});
var ETCHED_COLORS_BURST = new Buff({
  name: "Inherent: Etched Colors (burst)",
  applyStats: () => addStat(
    17,
    30,
    192
    /* Attribute.Fusion */
  )
});
var ETCHED_COLORS_STRAIN = new Buff({
  name: "Inherent: Etched Colors (strain)",
  convertStats: () => {
    addStat(12, 10 + Math.min(40, Math.max(0, 8 * (getStat(
      13
      /* Stat.OfftuneBuildup */
    ) - 100) / 10)));
  }
});
var DN_INHERENT_2 = new Inherent({
  name: "Inherent: Etched Colors",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Lib14 || a === EIntro4)
      applyTeam(isHeld(MODE_BURST2) ? ETCHED_COLORS_BURST : ETCHED_COLORS_STRAIN, 1);
  }
});
var DARK_CORE = new Buff({
  name: "Denia: Dark Core",
  maxStacks: 3,
  applyStats: () => {
    if (currentAction() === Banish2) {
      addStat(16, 150 * frozenStacks()), revokeCurrent(DARK_CORE);
    }
  }
});
var UNFINISHED_LIES_BURST = new Buff({
  name: "Denia: Outro (burst)",
  applyStats: () => {
    addStat(
      18,
      60,
      1048576
      /* Type2.FusionBurst */
    );
  }
});
var UNFINISHED_LIES_STRAIN = new Buff({
  name: "Denia: Outro (strain)",
  maxStacks: 2,
  display: () => frozenStacks() === 2 ? "Denia: Outro (shifting)" : "Denia: Outro (strain)",
  updateBuffs: () => {
    lostOnSwap();
    if (applied(TUNE_STRAIN_SHIFTING))
      applyCurrent(UNFINISHED_LIES_STRAIN, 1);
  },
  applyStats: () => addStat(18, frozenStacks() === 2 ? 40 : 15)
});
var DN_INHERENT_1 = new Inherent({
  name: "Inherent: Vestiges of Falsehood",
  combatStart: () => {
    applyCurrent(DARK_CORE, 2);
    setForte1(20);
  }
});
var DENIA_TALENTS = new Talent({
  name: "Denia: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(10, 16);
  }
});
var DENIA_RESONATOR = new Resonator({
  name: "Denia",
  element: 192,
  weapon: 4,
  // Final Act - Breakdown always closes her loop back in Stagecraft Form, so It's Been A While!
  // is the Intro she enters with; Knock Knock (the Breakdown-form one) is kept for completeness
  intro: () => stacksOf(ENTROPY_BREAKDOWN) ? EIntro4 : Intro20,
  outro: () => Outro20,
  color: "#c9557d",
  maxEnergy: 125,
  constantStats: () => {
    addStat(1, 11025);
    addStat(0, 425);
    addStat(2, 1148.89);
    addStat(12, 10);
  }
});
var UBA1234 = new ActionGroup("Basic - Breakdown Form 1234", [UBA12, UBA22, UBA32, UBA4]);
var UBA122 = new ActionGroup("Basic - Breakdown Form 12", [UBA12, UBA22]);
var USkill12 = new ActionGroup("Skill - Banish 12", [Banish1, Banish2]);
var DN_ROTATION_BURST = new Rotation([
  NOINTRO,
  BA415,
  Skill17,
  Lib14,
  UBA122,
  JUMP,
  UBA1234,
  USkill12,
  Lib24,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  BA415,
  Skill17,
  Lib14,
  UBA1234,
  USkill12,
  Lib24,
  ECHO_SWAP,
  OUTRO
]);
var DENIA_BURST = new Loadout({
  resonator: DENIA_RESONATOR,
  talent: DENIA_TALENTS,
  inherent1: DN_INHERENT_1,
  inherent2: DN_INHERENT_2,
  weapons: [FORGED_DWARF_STAR, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER],
  echoLoadouts: [
    new EchoLoadout(TRICKSTER, CHROMATIC_FOAM_5PC),
    new EchoLoadout(LIONESS_OF_GLORY, CLAWPRINT_5PC),
    new EchoLoadout(SIGILLUM, TRAILBLAZING_STAR_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    10,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: DN_ROTATION_BURST,
  mode: MODE_BURST2
});
var DN_ROTATION_STRAIN = new Rotation([
  NOINTRO,
  Skill17,
  Lib14,
  UBA122,
  DODGE,
  UBA122,
  JUMP,
  UBA122,
  USkill12,
  Lib24,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  BA415,
  Skill17,
  Lib14,
  UBA122,
  JUMP,
  UBA122,
  USkill12,
  Lib24,
  ECHO_SWAP,
  OUTRO
]);
var DENIA_STRAIN = new Loadout({
  resonator: DENIA_RESONATOR,
  talent: DENIA_TALENTS,
  inherent1: DN_INHERENT_1,
  inherent2: DN_INHERENT_2,
  weapons: [FORGED_DWARF_STAR, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER],
  echoLoadouts: [
    new EchoLoadout(VOIDWING_MOTH, REEL_5PC),
    new EchoLoadout(HYVATIA, NEONLIGHT_LEAP_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    10,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: DN_ROTATION_STRAIN,
  mode: MODE_STRAIN
});

// dist/src/resonators/fusion/encore.js
function encoreAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA119 = encoreAction("Basic - Wooly Attack 1", { node: 0, cast: 1, type: 4096, mv: 55.66, energy: 0.7, concerto: 1.4, offtune: 3360, forte1: 3 });
var BA219 = encoreAction("Basic - Wooly Attack 2", { node: 0, cast: 1, type: 4096, mv: 66.2, energy: 0.83, concerto: 1.66, offtune: 3996, forte1: 5 });
var BA319 = encoreAction("Basic - Wooly Attack 3", { node: 0, cast: 1, type: 4096, mv: 132.6, energy: 1.66, concerto: 3.32, offtune: 8004, forte1: 6 });
var BA416 = encoreAction("Basic - Wooly Attack 4", { node: 0, cast: 1, type: 4096, mv: 153.08, energy: 1.92, concerto: 3.84, offtune: 9240, forte1: 4 });
var WoolyStrike = encoreAction("Basic - Wooly Strike", { node: 0, cast: 1, type: 4096, mv: 238.57, energy: 3, concerto: 6, offtune: 14400, forte1: 25 });
var HA14 = encoreAction("Heavy - Wooly Attack", { node: 0, cast: 3, type: 8192, mv: 187.08, energy: 2.35, concerto: 4.7, offtune: 11292, forte1: 5 });
var MA17 = encoreAction("Mid-air - Wooly Attack", { node: 0, cast: 2, type: 4096, mv: 123.26, energy: 0.51, concerto: 1, offtune: 14400, forte1: 11 });
var DC16 = encoreAction("Dodge Counter - Wooly Attack", { node: 0, cast: 0, type: 4096, mv: 251.88, energy: 3.16, concerto: 13.32, offtune: 8004, forte1: 6 });
var Skill18 = encoreAction("Skill - Flaming Woolies", { node: 1, cast: 4, type: 12288, mv: 612.88, energy: 15.28, concerto: 15, offtune: 25600, forte1: 32 });
var Skill25 = encoreAction("Skill - Energetic Welcome", { node: 1, cast: 4, type: 12288, mv: 339.16, energy: 0.75, concerto: 6.51, offtune: 9072, forte1: 30 });
var SPEND_MAYHEM = { updateBuffs: () => {
  if (forte1() >= 100)
    setForte1(100);
} };
var CloudyFrenzy = encoreAction("Forte Heavy - Cloudy Frenzy", { node: 2, active: false, cast: 3, type: 16384, mv: 773.73, concerto: 10, offtune: 46709, forte1: -100, ...SPEND_MAYHEM });
var Liberation16 = encoreAction("Liberation - Cosmos Rave", { node: 3, cast: 5, concerto: 20, resetEnergy: true });
var UBA13 = encoreAction("Basic - Cosmos: Frolicking 1", { node: 3, cast: 1, type: 4096, mv: 180.36, energy: 1.32, concerto: 2.66, offtune: 6396, forte1: 8 });
var UBA23 = encoreAction("Basic - Cosmos: Frolicking 2", { node: 3, cast: 1, type: 4096, mv: 169.2, energy: 1.23, concerto: 2.49, offtune: 6e3, forte1: 12 });
var UBA33 = encoreAction("Basic - Cosmos: Frolicking 3", { node: 3, cast: 1, type: 4096, mv: 263.96, energy: 1.92, concerto: 3.88, offtune: 9360, forte1: 16 });
var UBA42 = encoreAction("Basic - Cosmos: Frolicking 4", { node: 3, cast: 1, type: 4096, mv: 582.03, energy: 4.29, concerto: 8.58, offtune: 20640, forte1: 27 });
var CosmosHeavy = encoreAction("Heavy - Cosmos: Heavy Attack", { node: 3, cast: 3, type: 8192, mv: 217.58, energy: 1.6, concerto: 3.21, offtune: 7716, forte1: 9 });
var USkill3 = encoreAction("Skill - Cosmos: Rampage", { node: 3, cast: 4, type: 12288, mv: 253.28, energy: 6.56, concerto: 8, offtune: 6168, forte1: 28 });
var CosmosDodgeCounter = encoreAction("Dodge Counter - Cosmos", { node: 3, cast: 0, type: 4096, mv: 263.96, energy: 1.92, concerto: 13.88, offtune: 9360, forte1: 16 });
var FHA5 = encoreAction("Forte Heavy - Cosmos Rupture", { node: 2, cast: 3, type: 16384, mv: 773.73, concerto: 10, offtune: 46709, forte1: -100, ...SPEND_MAYHEM });
var Intro21 = encoreAction("Intro - Woolies Helpers", { node: 4, cast: 6, type: 20480, mv: 198.81, energy: 10, concerto: 10, offtune: 15132, forte1: 40 });
var Outro21 = encoreAction("Outro - Thermal Field", { cast: 7, type: 24576, mv: 707.04, concerto: -100, active: false });
var WOOLIES_CHEER_DANCE = new Buff({
  name: "Inherent: Woolies Cheer Dance",
  applyStats: () => addStat(
    17,
    10,
    192
    /* Attribute.Fusion */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(WOOLIES_CHEER_DANCE);
  }
});
var EN_INHERENT_2 = new Inherent({
  name: "Inherent: Woolies Cheer Dance",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Skill18 || a === USkill3)
      applyCurrent(WOOLIES_CHEER_DANCE, 1);
  }
});
var ANGRY_COSMOS = new Buff({
  name: "Inherent: Angry Cosmos",
  applyStats: () => addStat(17, 10),
  convertStats: () => {
    if (currentAction() === FHA5)
      revokeCurrent(ANGRY_COSMOS);
  }
});
var EN_INHERENT_1 = new Inherent({
  name: "Inherent: Angry Cosmos",
  updateBuffs: () => {
    if (currentAction() === Liberation16)
      applyCurrent(ANGRY_COSMOS, 1);
  }
});
var S1_STACKS = new Buff({
  name: "Encore S1: Wooly's Fairy Tale",
  maxStacks: 4,
  applyStats: () => addStat(
    17,
    3 * frozenStacks(),
    192
    /* Attribute.Fusion */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(S1_STACKS);
  }
});
var S12 = new Sequence({
  name: "Encore S1",
  updateBuffs: () => {
    if (casting(
      1
      /* Cast.Basic */
    ) || casting(
      2
      /* Cast.MidAir */
    ))
      applyCurrent(S1_STACKS, 1);
  }
});
var S22 = new Sequence({
  name: "Encore S2",
  // note removed ba5 trigger to model 10s cooldown
  updateBuffs: () => {
    if (currentAction() === Skill25)
      addStat(25, 10);
  }
});
var S32 = new Sequence({
  name: "Encore S3",
  applyStats: () => {
    if (currentAction() === CloudyFrenzy || currentAction() === FHA5)
      addStat(16, 40);
  }
});
var S4_TEAM = new Buff({
  name: "Encore S4: Adventure? Let's go!",
  applyStats: () => addStat(
    17,
    20,
    192
    /* Attribute.Fusion */
  )
});
var S42 = new Sequence({
  name: "Encore S4",
  updateBuffs: () => {
    if (currentAction() === FHA5)
      applyTeam(S4_TEAM, 1);
  }
});
var S52 = new Sequence({
  name: "Encore S5",
  applyStats: () => addStat(
    17,
    35,
    12288
    /* Type1.Skill */
  )
});
var S6_LOST_LAMB = new Buff({
  name: "Encore S6: Lost Lamb",
  maxStacks: 5,
  applyStats: () => addStat(6, 5 * frozenStacks()),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(S6_LOST_LAMB);
  }
});
var S62 = new Sequence({
  name: "Encore S6",
  updateBuffs: () => {
    if (isHeld(WOOLIES_CHEER_DANCE))
      applyCurrent(S6_LOST_LAMB, 1);
  }
});
var ENCORE_RESONATOR = new Resonator({
  name: "Encore",
  tier: 1,
  element: 192,
  weapon: 4,
  intro: () => Intro21,
  outro: () => Outro21,
  color: "#e56b9a",
  maxEnergy: 125,
  constantStats: () => {
    addStat(1, 10512.5);
    addStat(0, 425);
    addStat(2, 1247);
  }
});
var ENCORE_TALENTS = new Talent({
  name: "Encore: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(
      17,
      12,
      192
      /* Attribute.Fusion */
    );
  }
});
var UBA12342 = new ActionGroup("Basic - Cosmos: Frolicking 1234", [UBA13, UBA23, UBA33, UBA42]);
var EN_ROTATION = new Rotation([
  INTRO,
  ECHO_ONFIELD,
  // would be swapped
  Skill18,
  // would be swapped
  Liberation16,
  USkill3,
  UBA12342,
  USkill3,
  UBA12342,
  USkill3,
  FHA5.swap(),
  OUTRO
]);
var ENCORE = new Loadout({
  resonator: ENCORE_RESONATOR,
  talent: ENCORE_TALENTS,
  inherent1: EN_INHERENT_1,
  inherent2: EN_INHERENT_2,
  weapons: [STRINGMASTER, COSMIC_RIPPLES, NEW_STD_RECTIFIER],
  echoLoadouts: [new EchoLoadout(INFERNO_RIDER, MOLTEN_RIFT_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    10,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: EN_ROTATION,
  sequences: [S12, S22, S32, S42, S52, S62]
});

// dist/src/resonators/fusion/galbrena.js
function galbrenaAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA120 = galbrenaAction("Basic - Slayer's Trigger 1", { node: 0, cast: 1, type: 8192, mv: 59.18, energy: 0.83, concerto: 1.16, offtune: 2646, forte1: 7.41 });
var BA220 = galbrenaAction("Basic - Slayer's Trigger 2", { node: 0, cast: 1, type: 8192, mv: 131.53, energy: 1.85, concerto: 2.59, offtune: 5880, forte1: 18.52 });
var BA320 = galbrenaAction("Basic - Slayer's Trigger 3", { node: 0, cast: 1, type: 8192, mv: 142.98, energy: 2, concerto: 2.8, offtune: 6394, forte1: 18.52 });
var BA417 = galbrenaAction("Basic - Slayer's Trigger 4", { node: 0, cast: 1, type: 28672, mv: 177.86, energy: 2.49, concerto: 3.48, offtune: 7952, forte1: 14.81 });
var DC17 = galbrenaAction("Dodge Counter - Blood for Blood", { node: 0, cast: 0, type: 8192, mv: 205.24, offtune: 6394, concerto: 12.8, energy: 2 });
var MA18 = galbrenaAction("Basic - Ashfall Barrage (Plunge)", { node: 0, cast: 1, type: 8192, mv: 143.15, energy: 2, concerto: 2.8, offtune: 6400 });
var MASustained = galbrenaAction("Basic - Ashfall Barrage (Sustained Fire)", { node: 0, cast: 1, type: 8192, mv: 26.84, energy: 0.38, concerto: 0.53, offtune: 1200 });
var HA15 = galbrenaAction("Heavy - Volley of Death 1", { node: 0, cast: 3, type: 8192, mv: 106.6, energy: 1.5, concerto: 2.1, offtune: 4766, forte1: 7.41 });
var HA24 = galbrenaAction("Heavy - Volley of Death 2", { node: 0, cast: 3, type: 8192, mv: 69.18, energy: 0.98, concerto: 1.36, offtune: 3094, forte1: 25.93 });
var HA33 = galbrenaAction("Heavy - Volley of Death 3", { node: 0, cast: 3, type: 28672, mv: 167.7, energy: 2.37, concerto: 3.29, offtune: 7499, forte1: 18.52 });
var DRIVE = { updateBuffs: () => applyCurrent(BURNING_DRIVE, 1) };
var Encroach = galbrenaAction("Skill - Encroach", { node: 1, cast: 4, type: 8192, mv: 35.78, concerto: 2.22, energy: 6.59, offtune: 5039, forte1: 18.52, ...DRIVE });
var AscentOfMalice = galbrenaAction("Skill - Ascent of Malice", {
  node: 1,
  cast: 4,
  type: 8192,
  mv: 103.14,
  energy: 14.76,
  concerto: 10,
  offtune: 5588,
  forte1: -100,
  forte2: 100,
  updateBuffs: () => {
    applyCurrent(BURNING_DRIVE, 1);
    applyCurrent(DEMON_HYPOSTASIS, 1);
    if (forte1() >= 100)
      setForte1(100);
    setForte2(0);
  }
});
var SeraphicExecution1 = galbrenaAction("Forte Basic - Seraphic Execution 1", { node: 2, cast: 1, type: 8192, mv: 58.99, energy: 1, concerto: 5.54, offtune: 2374, forte2: -4.88 });
var SeraphicExecution2 = galbrenaAction("Forte Basic - Seraphic Execution 2", { node: 2, cast: 1, type: 8192, mv: 139.19, energy: 2, concerto: 6.95, offtune: 5600, forte2: -9.76 });
var SeraphicExecution3 = galbrenaAction("Forte Basic - Seraphic Execution 3", { node: 2, cast: 1, type: 8192, mv: 243.17, energy: 3.34, concerto: 8.79, offtune: 9786, forte2: -18.29 });
var SeraphicExecution4 = galbrenaAction("Forte Basic - Seraphic Execution 4", { node: 2, cast: 1, type: 28672, mv: 181.47, energy: 2.56, concerto: 7.7, offtune: 7305, forte2: -13.41, ...DRIVE });
var SeraphicExecution5 = galbrenaAction("Forte Basic - Seraphic Execution 5", { node: 2, cast: 1, type: 28672, mv: 224.27, energy: 3.08, concerto: 8.46, offtune: 9025, forte2: -19.51 });
var FlamewingVerdict1 = galbrenaAction("Forte Heavy - Flamewing Verdict 1", { node: 2, cast: 3, type: 8192, mv: 118.44, energy: 1.74, concerto: 6.6, offtune: 4766, forte2: -9.76 });
var FlamewingVerdict2 = galbrenaAction("Forte Heavy - Flamewing Verdict 2", { node: 2, cast: 3, type: 8192, mv: 76.7, energy: 1.22, concerto: 5.86, offtune: 3086, forte2: -7.32 });
var FlamewingVerdict3 = galbrenaAction("Forte Heavy - Flamewing Verdict 3", { node: 2, cast: 3, type: 28672, mv: 176.84, energy: 2.49, concerto: 7.64, offtune: 7117, forte2: -14.63 });
var Ravage = galbrenaAction("Forte Skill - Ravage", {
  node: 2,
  cast: 4,
  type: 8192,
  mv: 35.78,
  energy: 6.59,
  concerto: 2.22,
  offtune: 5039,
  updateBuffs: () => {
    applyCurrent(BURNING_DRIVE, 1);
    setForte2(0);
  }
});
var Liberation17 = galbrenaAction("Liberation - Hellfire Absolution", {
  node: 3,
  cast: 5,
  type: 28672,
  mv: 1109.04,
  concerto: 20,
  offtune: 84003,
  resetEnergy: true,
  updateBuffs: () => applyCurrent(HELLFIRE_WINDOW, 1)
});
var Intro22 = galbrenaAction("Intro - Hellflare Overload", { node: 4, cast: 6, type: 20480, mv: 94.12, energy: 10, concerto: 10, offtune: 4208, forte1: 11.11, ...DRIVE });
var Outro22 = galbrenaAction("Outro - Ashen Pursuit", { cast: 7, type: 24576, mv: 795, offtune: 30326, concerto: -100, energy: 10.03, active: false });
var BURNING_DRIVE = new Buff({
  name: "Galbrena: Burning Drive",
  applyStats: () => addStat(6, 20),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(BURNING_DRIVE);
  }
});
var OATHBOUND_HUNT = new Buff({
  name: "Galbrena: Fated End",
  maxStacks: 4,
  applyStats: () => addStat(18, 5 * frozenStacks()),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(OATHBOUND_HUNT);
  }
});
var GB_INHERENT_1 = new Inherent({
  name: "Inherent: Oathbound Hunt",
  updateBuffs: () => {
    if (!casting(
      8
      /* Cast.Echo */
    ))
      applyCurrent(OATHBOUND_HUNT, 1);
  }
});
var GB_INHERENT_2 = new Inherent({ name: "Inherent: Sin Feaster" });
var DEMON_HYPOSTASIS = new Buff({
  name: "Galbrena: Demon Hypostasis",
  updateBuffs: () => {
    if (forte2() <= 0) {
      revokeCurrent(AFTERFLAME);
      revokeCurrent(DEMON_HYPOSTASIS);
    }
  }
});
var AFTERFLAME = new Buff({
  name: "Galbrena: Afterflame",
  maxStacks: 40,
  applyStats: () => {
    const a = currentAction();
    if (a === SeraphicExecution1 || a === SeraphicExecution2 || a === SeraphicExecution3 || a === SeraphicExecution4 || a === SeraphicExecution5 || a === FlamewingVerdict1 || a === FlamewingVerdict2 || a === FlamewingVerdict3 || a === Ravage)
      addStat(19, Math.min(60, 1.5 * frozenStacks()));
  }
});
var HELLFIRE_WINDOW = new Buff({
  name: "Galbrena: Hellfire Absolution",
  applyStats: () => {
    const a = currentAction();
    if (a === SeraphicExecution1 || a === SeraphicExecution2 || a === SeraphicExecution3 || a === SeraphicExecution4 || a === SeraphicExecution5 || a === FlamewingVerdict1 || a === FlamewingVerdict2 || a === FlamewingVerdict3)
      addStat(16, 85);
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(HELLFIRE_WINDOW);
  }
});
var GALBRENA_RESONATOR = new Resonator({
  name: "Galbrena",
  element: 192,
  weapon: 2,
  intro: () => Intro22,
  outro: () => Outro22,
  color: "#1e3a8a",
  maxEnergy: 125,
  // reacts to *any* team member's own Echo cast, not just her own — see AFTERFLAME's own comment
  updateGlobal: () => {
    if (casting(
      8
      /* Cast.Echo */
    ) && !isHeld(DEMON_HYPOSTASIS))
      applyCurrent(AFTERFLAME, 8);
  },
  constantStats: () => {
    addStat(1, 10300);
    addStat(0, 463);
    addStat(2, 1112);
  }
});
var GALBRENA_TALENTS = new Talent({
  name: "Galbrena: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(10, 16);
  }
});
var SeraphicExecution2345 = new ActionGroup("Forte Basic - Seraphic Execution 2345", [SeraphicExecution2, SeraphicExecution3, SeraphicExecution4, SeraphicExecution5]);
var SeraphicExecution345 = new ActionGroup("Forte Basic - Seraphic Execution 345", [SeraphicExecution3, SeraphicExecution4, SeraphicExecution5]);
var BA2343 = new ActionGroup("Basic - Slayer's Trigger 234", [BA220, BA320, BA417]);
var GB_ROTATION = new Rotation([
  INTRO,
  ECHO_CANCEL,
  HA24,
  HA33,
  BA320,
  BA417,
  Encroach,
  AscentOfMalice,
  Liberation17,
  SeraphicExecution2345,
  DODGE,
  SeraphicExecution345,
  DODGE,
  SeraphicExecution3,
  OUTRO
]);
var GB_WEAPONS = [LUX_UMBRA, NEW_STD_PISTOL, STATIC_MIST];
var GB_ECHOES = [new EchoLoadout(CORROSAURUS, FLAMEWING_SHADOW_3PC, CLAWPRINT_2PC)];
var GALBRENA = new Loadout({
  resonator: GALBRENA_RESONATOR,
  talent: GALBRENA_TALENTS,
  inherent1: GB_INHERENT_1,
  inherent2: GB_INHERENT_2,
  weapons: GB_WEAPONS,
  echoLoadouts: GB_ECHOES,
  mainstats: mainstatOptions(
    0,
    1,
    6,
    10,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "heavy"),
  rotation: GB_ROTATION
});

// dist/src/resonators/fusion/jingran.js
function jingranAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA121 = jingranAction("Basic - Devil's Bane 1", { node: 0, cast: 1, type: 4096, mv: 39.82, energy: 0.67, concerto: 1.34, offtune: 2136 });
var BA221 = jingranAction("Basic - Devil's Bane 2", { node: 0, cast: 1, type: 4096, mv: 99.47, energy: 1.68, concerto: 3.35, offtune: 5337 });
var BA321 = jingranAction("Basic - Devil's Bane 3", { node: 0, cast: 1, type: 8192, mv: 159.1, energy: 2.69, concerto: 5.36, offtune: 8537, forte1: 50 });
var BA418 = jingranAction("Basic - Devil's Bane 4", { node: 0, cast: 1, type: 8192, mv: 124.24, energy: 2.09, concerto: 4.18, offtune: 6666, forte1: 50 });
var MA19 = jingranAction("Mid-air - Edge of Life and Death", { node: 0, cast: 2, type: 4096, mv: 92.45, energy: 1.55, concerto: 3.1, offtune: 4960 });
var EBA13 = jingranAction("Basic - Drink Soul 1", { node: 0, cast: 1, type: 4096, mv: 44.74, energy: 0.75, concerto: 1.5, offtune: 2400 });
var EBA23 = jingranAction("Basic - Drink Soul 2", { node: 0, cast: 1, type: 4096, mv: 74.56, energy: 1.26, concerto: 2.5, offtune: 4e3 });
var EBA33 = jingranAction("Basic - Drink Soul 3", { node: 0, cast: 1, type: 8192, mv: 109.32, energy: 1.84, concerto: 3.68, offtune: 5864, forte1: 50 });
var EBA43 = jingranAction("Basic - Drink Soul 4", { node: 0, cast: 1, type: 8192, mv: 153.16, energy: 2.6, concerto: 5.16, offtune: 8218, forte1: 50 });
var DC18 = jingranAction("Dodge Counter - Light Watch", { node: 0, cast: 0, type: 8192, mv: 198.8, energy: 10, concerto: 6.68, offtune: 8e3, forte1: 100 });
var EDC3 = jingranAction("Dodge Counter - Nether Dive", { node: 0, cast: 0, type: 8192, mv: 248.57, energy: 4.19, concerto: 18.36, offtune: 13337, forte1: 100 });
var Skill19 = jingranAction("Skill - Scorching Yang", { node: 1, cast: 4, type: 12288, mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 5600 });
var Skill26 = jingranAction("Skill - Afterlife's Guide", { node: 1, cast: 4, type: 8192, mv: 258.47, energy: 3.35, concerto: 5, offtune: 10667, forte1: 100 });
var ESkill1 = jingranAction("Skill - Encroaching Yin", { node: 1, cast: 4, type: 12288, mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 5600 });
var ESkill22 = jingranAction("Skill - Netherworld Traverse", { node: 1, cast: 4, type: 8192, mv: 263.48, energy: 3.43, concerto: 5, offtune: 10936, forte1: 100 });
var Lib5 = jingranAction("Liberation - Burial of Thousand Souls", {
  node: 3,
  cast: 5,
  type: 8192,
  mv: 745.2,
  // 93.15% x 8
  offtune: 168e3,
  forte1: 200,
  forte2: 100,
  resetEnergy: true,
  concerto: 20
});
var ACTION_LIB_FUA = jingranAction("Liberation - Chimei Wangliang", { node: 3, type: 8192, mv: 83.51 });
var Intro23 = jingranAction("Intro - Question the Tombs", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 198.81,
  energy: 10,
  concerto: 10,
  offtune: 8e3,
  forte1: 100,
  updateBuffs: () => {
    const shroud = stacksOf(JINGRAN_GHOST_SHROUD);
    if (shroud) {
      revokeCurrent(JINGRAN_GHOST_SHROUD);
      applyCurrent(JINGRAN_FORTUNE, shroud);
    }
  }
});
var Outro23 = jingranAction("Outro - Rising Fortune and Ebbing Evil", {
  cast: 7,
  type: 24576,
  mv: 795,
  concerto: -100,
  active: false,
  updateBuffs: () => {
    revokeCurrent(JINGRAN_FORTUNE);
    setForte2(0);
  }
});
var BURNS_MINGFIRE = { updateBuffs: () => {
  if (forte2() > 0)
    applyCurrent(JINGRAN_FIRE_OF_LIFE, 1);
} };
var FHA6 = jingranAction("Forte Heavy - Stardome Meander", { node: 2, cast: 3, type: 8192, mv: 240.38, energy: 8.5, concerto: 13, offtune: 10400, forte1: -300, ...BURNS_MINGFIRE });
var EFHA = jingranAction("Forte Heavy - Soul Raid", { node: 2, cast: 3, type: 8192, mv: 234.29, energy: 8.53, concerto: 13, offtune: 10140, forte1: -300, ...BURNS_MINGFIRE });
function hp() {
  const base = getStat(
    1
    /* Stat.BaseHp */
  );
  return base + getStat(
    7
    /* Stat.BonusHp */
  ) / 100 * base + getStat(
    4
    /* Stat.FlatHp */
  );
}
function def() {
  const base = getStat(
    2
    /* Stat.BaseDef */
  );
  return base + getStat(
    8
    /* Stat.BonusDef */
  ) / 100 * base + getStat(
    5
    /* Stat.FlatDef */
  );
}
function hpSteps() {
  return Math.floor(Math.min(hp(), 5e4) / 1e3);
}
var JINGRAN_GHOST_SHROUD = new Buff({ name: "Jingran: Ghost Shroud", maxStacks: 50 });
var JINGRAN_EARTH_CHARM = new Buff({ name: "Jingran: Earth Charm" });
var JR_INHERENT_1 = new Inherent({
  name: "Inherent: Hark the Dust",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Intro23 || a === Skill19 || a === ESkill1)
      applyCurrent(JINGRAN_EARTH_CHARM, 1);
  }
});
var JINGRAN_FORTUNE = new Buff({
  name: "Jingran: Fortune in Disguise",
  maxStacks: 50,
  convertStats: () => {
    const steps = hpSteps();
    addStat(
      17,
      Math.min(2.5, 0.05 * steps) * frozenStacks(),
      192
      /* Attribute.Fusion */
    );
  }
});
var JINGRAN_FIXATION = new Buff({ name: "Jingran: Fixation" });
var JR_INHERENT_2 = new Inherent({
  name: "Inherent: Trace the Vestige",
  combatStart: () => {
    applyCurrent(JINGRAN_FIXATION, 1);
    applyCurrent(JINGRAN_GHOST_SHROUD, 25);
  },
  updateBuffs: () => {
    if (currentAction() === Outro23)
      applyCurrent(JINGRAN_FIXATION, 1);
  },
  // `currentSlot` is switched to Jingran's own slot for this call regardless of who's actually
  // acting, so `applySelf()`/`isHeld()` below always resolve against him specifically.
  updateGlobal: () => {
    const a = currentAction();
    if (currentTeam().slot.resonator === JINGRAN_RESONATOR || !applied(SHIELD))
      return;
    applyCurrent(JINGRAN_GHOST_SHROUD, 2 * applied(SHIELD));
    if (isHeld(JINGRAN_FIXATION)) {
      revokeCurrent(JINGRAN_FIXATION);
      applyCurrent(JINGRAN_GHOST_SHROUD, 15);
    }
  }
});
var JINGRAN_HP_TO_FUSION = new Buff({
  name: "Jingran: Nether to Light",
  convertStats: () => {
    addStat(5, -def());
    const steps = hpSteps();
    addStat(24, 6.2 * steps);
    addStat(
      17,
      1.5 * steps,
      192
      /* Attribute.Fusion */
    );
  }
});
var JINGRAN_HP_TO_ATK = new Buff({
  name: "Jingran: Yang Changes, Yin Unites",
  convertStats: () => {
    const steps = hpSteps();
    addStat(3, 36 * steps);
  }
});
function fireSteps() {
  return Math.max(0, Math.floor((Math.min(hp(), 5e4) - 25e3) / 1e3));
}
var JINGRAN_FIRE_OF_LIFE = new Buff({
  name: "Jingran: Fire of Life",
  convertStats: () => {
    const a = currentAction();
    const mingfire = forte2();
    queue(ACTION_LIB_FUA);
    addStat(30, -25);
    if (mingfire > 25)
      addStat(29, 200);
    addStat(15, (a === FHA6 ? 21.65 : 21.1) * fireSteps());
    revokeCurrent(JINGRAN_FIRE_OF_LIFE);
  }
});
var SHIELDS2 = /* @__PURE__ */ new Map([
  [BA121, 1],
  [BA221, 1],
  [BA321, 2],
  [BA418, 2],
  [MA19, 1],
  [EBA13, 1],
  [EBA23, 1],
  [EBA33, 2],
  [EBA43, 2],
  [DC18, 1],
  [EDC3, 1],
  [Skill19, 1],
  [ESkill1, 1],
  [Skill26, 3],
  [ESkill22, 3],
  [Lib5, 3],
  [Intro23, 1],
  [FHA6, 2],
  [EFHA, 2]
]);
var JINGRAN_RESONATOR = new Resonator({
  name: "Jingran",
  element: 192,
  weapon: 1,
  intro: () => Intro23,
  outro: () => Outro23,
  color: "#f2603c",
  maxEnergy: 125,
  // Nether to Light/Yang Changes, Yin Unites are Forte Circuit-scoped, not Inherent Skills —
  // self-applied here so they keep their own distinct source name.
  combatStart: () => {
    applyCurrent(JINGRAN_HP_TO_FUSION, 1);
    applyCurrent(JINGRAN_HP_TO_ATK, 1);
  },
  // every cast of his shields — two off the chain closers, both enhanced skills, the Liberation
  // and both Forte heavies, one off everything else
  updateDebuffs: () => {
    const n = SHIELDS2.get(currentAction());
    if (n)
      applyCurrent(SHIELD, n);
  },
  // base kit: +1 Ghost Shroud per shield whenever he gains one of his own
  updateBuffs: () => {
    if (applied(SHIELD))
      applyCurrent(JINGRAN_GHOST_SHROUD, applied(SHIELD));
  },
  constantStats: () => {
    addStat(1, 15375);
    addStat(0, 313);
  }
});
var JINGRAN_TALENTS = new Talent({
  name: "Jingran: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(7, 12);
  }
});
var EBA2342 = new ActionGroup("Basic - Drink Soul 234", [EBA23, EBA33, EBA43]);
var JR_ROTATION = new Rotation([
  INTRO,
  Lib5,
  FHA6,
  EBA2342,
  EFHA,
  Skill19,
  Skill26,
  FHA6,
  ESkill1,
  ESkill22,
  EFHA,
  ECHO_SWAP,
  OUTRO
]);
var JINGRAN = new Loadout({
  resonator: JINGRAN_RESONATOR,
  talent: JINGRAN_TALENTS,
  inherent1: JR_INHERENT_1,
  inherent2: JR_INHERENT_2,
  weapons: [JINGRAN_SIG, NEW_STD_BRAUDBLADE, THUNDERFLARE_DOMINION, LUSTROUS_RAZOR, VERDANT_SUMMIT],
  echoLoadouts: [
    new EchoLoadout(MYRIAD_SNARE, LAMP_5PC),
    new EchoLoadout(MYRIAD_SNARE, COV_3PC, LAMP_2PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    3,
    10,
    15,
    16
    /* Mainstat.HP1 */
  ),
  substat: chem("hp", "heavy"),
  rotation: JR_ROTATION
});

// dist/src/resonators/fusion/lupa.js
function lupaAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA122 = lupaAction("Basic - Flaming Star 1", { node: 0, cast: 1, type: 4096, mv: 90.08, energy: 1.34, concerto: 2.67, offtune: 4264, forte1: 7.5 });
var BA222 = lupaAction("Basic - Flaming Star 2", { node: 0, cast: 1, type: 4096, mv: 90.08, energy: 1.34, concerto: 2.67, offtune: 4264, forte1: 7.5 });
var BA322 = lupaAction("Basic - Flaming Star 3", { node: 0, cast: 1, type: 4096, mv: 157.68, energy: 2.37, concerto: 4.68, offtune: 7464, forte1: 12.5 });
var BA419 = lupaAction("Basic - Flaming Star 4", { node: 0, cast: 1, type: 4096, mv: 246.24, energy: 3.66, concerto: 7.3, offtune: 11656, forte1: 17.5 });
var EBA5 = lupaAction("Basic - Flaming Star: Starfall", { node: 0, cast: 1, type: 4096, mv: 168.66, energy: 2.51, concerto: 5.02, offtune: 7985, forte1: 5 });
var MA20 = lupaAction("Basic - Flaming Star: Plunge", { node: 0, cast: 1, type: 4096, mv: 104.79, energy: 1.56, concerto: 3.11, offtune: 4960, forte1: 5 });
var DC19 = lupaAction("Dodge Counter - Flaming Star", { node: 0, cast: 0, type: 4096, mv: 273.44, energy: 4.07, concerto: 18.13, offtune: 12944 });
var MA110 = lupaAction("Mid-air - Flaming Star 1", { node: 0, cast: 2, type: 4096, mv: 76.73, energy: 1.14, concerto: 2.27, offtune: 3632, forte1: 7 });
var MA27 = lupaAction("Mid-air - Flaming Star 2", { node: 0, cast: 2, type: 4096, mv: 154.47, energy: 2.31, concerto: 4.61, offtune: 7312, forte1: 13 });
var MA36 = lupaAction("Mid-air - Flaming Star 3", { node: 0, cast: 2, type: 4096, mv: 56.96, energy: 0.86, concerto: 1.7, offtune: 2696 });
var HA16 = lupaAction("Heavy - Flaming Star", { node: 0, cast: 3, type: 8192, mv: 112.72, energy: 1.68, concerto: 3.34, offtune: 5336 });
var EMA3 = lupaAction("Mid-air - Firestrike", { node: 0, cast: 2, type: 8192, mv: 56.96, energy: 0.86, concerto: 10, offtune: 2696, forte1: -50, forte2: 1 });
var EHA3 = lupaAction("Heavy - Wolf's Gnawing", { node: 0, cast: 3, type: 8192, mv: 112.22, energy: 1.66, concerto: 10, offtune: 5312, forte1: -50, forte2: 1 });
var EHA4 = lupaAction("Heavy - Wolf's Claw", { node: 0, cast: 3, type: 8192, mv: 240.5, energy: 3.58, concerto: 10, offtune: 11385, forte1: -50, forte2: 1 });
var Skill110 = lupaAction("Skill - Shewolf's Hunt", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 140.77,
  energy: 2.09,
  concerto: 4.17,
  offtune: 6664,
  forte1: 15,
  updateBuffs: () => applyEnemy(LUPA_MARK, 1)
});
var Skill27 = lupaAction("Skill - Feral Fang", { node: 1, cast: 4, type: 12288, mv: 313.61, energy: 13.67, offtune: 5328, forte1: 15 });
var USkill4 = lupaAction("Skill - Foebreaker", {
  node: 3,
  cast: 4,
  type: 12288,
  mv: 304.46,
  concerto: 20,
  offtune: 6448,
  forte1: -100,
  updateBuffs: () => applyCurrent(BURNING_MATCHPOINT, 1)
});
var Liberation18 = lupaAction("Liberation - Fire-Kissed Glory", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 820.44,
  concerto: 20,
  offtune: 48e3,
  forte1: 100,
  resetEnergy: true,
  updateBuffs: () => {
    applyTeam(PACK_HUNT, 1);
    setForte1(0);
    setForte2(0);
  }
});
var BACKUP = { updateBuffs: () => applyTeam(LUPA_BACKUP_READY, 1) };
var FSkill6 = lupaAction("Forte Skill - Dance With the Wolf", { node: 2, cast: 4, type: 16384, mv: 560.21, energy: 30, concerto: 15.02, offtune: 16016, forte2: -2, ...BACKUP });
var UFSkill = lupaAction("Forte Skill - Dance With the Wolf: Climax", { node: 2, cast: 4, type: 16384, mv: 756.26, energy: 30, concerto: 30, offtune: 54416, forte2: -2, ...BACKUP });
var fskillFUA = lupaAction("Forte Skill - Set the Arena Ablaze", { node: 2, type: 12288, mv: 211.75, offtune: 9600, active: false });
var Intro24 = lupaAction("Intro - Try Focusing, Eh?", { node: 4, cast: 6, type: 20480, mv: 198.4, energy: 10.02, concerto: 10, offtune: 9393 });
var EIntro5 = lupaAction("Intro - Nowhere to Run!", { node: 4, cast: 6, type: 16384, mv: 991.97, energy: 10, concerto: 10, offtune: 16e3 });
var Outro24 = lupaAction("Outro - Stand by Me, Warrior", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(LUPA_OUTRO)
});
var PACK_HUNT = new Buff({
  name: "Lupa: Pack Hunt",
  maxStacks: 3,
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Intro */
    ))
      applyTeam(PACK_HUNT, 1);
  },
  applyStats: () => {
    addStat(6, 6 * frozenStacks());
    addStat(
      17,
      10,
      192
      /* Attribute.Fusion */
    );
    const fusionCount = currentTeam().slots.filter(
      (s) => s.resonator?.element === 192
      /* Attribute.Fusion */
    ).length;
    if (fusionCount >= 3)
      addStat(
        17,
        10,
        192
        /* Attribute.Fusion */
      );
  }
});
var GLORY = new Buff({
  name: "Lupa: Glory",
  maxStacks: 3,
  applyStats: () => {
    addStat(
      20,
      3 * frozenStacks(),
      192
      /* Attribute.Fusion */
    );
    if (frozenStacks() >= 3)
      addStat(
        20,
        6,
        192
        /* Attribute.Fusion */
      );
  }
});
var LUPA_OUTRO = new Buff({
  name: "Lupa: Outro",
  applyStats: () => {
    addStat(
      18,
      20,
      192
      /* Attribute.Fusion */
    );
    addStat(
      18,
      25,
      4096
      /* Type1.Basic */
    );
  },
  updateBuffs: () => {
    lostOnSwap();
  }
});
var WILDFIRE_BANNER = new Buff({
  name: "Lupa: Wildfire Banner",
  applyStats: () => addStat(6, 12),
  convertStats: () => {
    if (currentAction() === fskillFUA)
      revokeCurrent(WILDFIRE_BANNER);
  }
});
var LP_INHERENT_1 = new Inherent({ name: "Inherent: Remember My Name" });
var LP_INHERENT_2 = new Inherent({
  name: "Inherent: Applause of Victory",
  updateBuffs: () => {
    if (currentAction() === Liberation18) {
      revokeTeam(GLORY);
      applyTeam(GLORY, currentTeam().slots.filter(
        (s) => s.resonator?.element === 192
        /* Attribute.Fusion */
      ).length);
    }
  }
});
var LUPA_MARK = new Debuff({
  name: "Lupa: Mark",
  applyStats: () => {
    if (currentAction() === Skill27)
      addStat(16, 50);
  },
  convertStats: () => {
    if (currentAction() === Skill27 || currentAction() === Liberation18)
      revokeEnemy(LUPA_MARK);
  }
});
var BURNING_MATCHPOINT = new Buff({
  name: "Lupa: Burning Matchpoint",
  applyStats: () => {
    const a = currentAction();
    if (isType(
      4096
      /* Type1.Basic */
    ))
      addStat(29, 5 * a.forte1);
  },
  convertStats: () => {
    if (currentAction() === FSkill6 || currentAction() === UFSkill)
      revokeCurrent(BURNING_MATCHPOINT);
  }
});
var LUPA_BACKUP_READY = new Buff({
  name: "Lupa: Set the Arena Ablaze",
  applyStats: () => {
    if (casting(
      5
      /* Cast.Liberation */
    ) && currentTeam().slot.resonator !== LUPA_RESONATOR) {
      queueOn(LUPA_RESONATOR, fskillFUA);
      revokeTeam(LUPA_BACKUP_READY);
    }
  }
});
var LUPA_RESONATOR = new Resonator({
  name: "Lupa",
  element: 192,
  weapon: 1,
  intro: () => {
    if (stacksOfTeam(PACK_HUNT) < 3)
      return Intro24;
    revokeTeam(PACK_HUNT);
    revokeTeam(GLORY);
    return EIntro5;
  },
  outro: () => Outro24,
  color: "#e8483a",
  maxEnergy: 125,
  // every cast that arms Set the Arena Ablaze
  updateBuffs: () => {
    const a = currentAction();
    if (a === Skill27 || a === EHA3 || a === EHA4 || a === EMA3 || a === Liberation18 || a === FSkill6 || a === UFSkill) {
      applyCurrent(WILDFIRE_BANNER, 1);
    }
  },
  constantStats: () => {
    addStat(1, 11912.5);
    addStat(0, 387.5);
    addStat(2, 1186);
  }
});
var LUPA_TALENTS = new Talent({
  name: "Lupa: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var LP_LOOP = new Rotation([
  NOINTRO,
  Skill110,
  INTRO,
  ECHO_CANCEL,
  Liberation18,
  USkill4,
  MA110,
  MA27,
  EMA3,
  EHA4,
  UFSkill,
  OUTRO
]);
var LUPA = new Loadout({
  resonator: LUPA_RESONATOR,
  talent: LUPA_TALENTS,
  inherent1: LP_INHERENT_1,
  inherent2: LP_INHERENT_2,
  weapons: [WILDFIRE_MARK, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: [
    new EchoLoadout(LIONESS_OF_GLORY, CLAWPRINT_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    10,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: LP_LOOP
});

// dist/src/resonators/fusion/mornye.js
function mornyeAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA124 = mornyeAction("Basic - Ground State Calibration 1", { node: 0, cast: 1, type: 4096, mv: 55.69, energy: 0.89, concerto: 2.8, offtune: 2800, forte1: 20 });
var BA223 = mornyeAction("Basic - Ground State Calibration 2", { node: 0, cast: 1, type: 4096, mv: 119.32, energy: 1.92, concerto: 6, offtune: 6e3, forte1: 43 });
var BA323 = mornyeAction("Basic - Ground State Calibration 3", { node: 0, cast: 1, type: 4096, mv: 103.4, energy: 1.67, concerto: 5.2, offtune: 5200, forte1: 37 });
var BA420 = mornyeAction("Basic - Ground State Calibration 4", { node: 0, cast: 1, type: 4096, mv: 135.2, energy: 2.13, concerto: 6.8, offtune: 6800, forte1: 100 });
var HA17 = mornyeAction("Heavy - Ground State Calibration", { node: 0, cast: 3, type: 8192, mv: 37, energy: 0.79, concerto: 2.5, offtune: 2480, forte1: 20 });
var MA21 = mornyeAction("Mid-air - Ground State Calibration", { node: 0, cast: 2, type: 4096, mv: 98.61, energy: 1.55, concerto: 4.96, offtune: 4960 });
var DC20 = mornyeAction("Dodge Counter - Ground State Calibration", { node: 0, cast: 0, type: 4096, mv: 162.23, energy: 2.55, concerto: 18.16, offtune: 8160, forte1: 20 });
var WBA1 = mornyeAction("Basic - Wide Field Observation 1", { node: 0, cast: 1, type: 4096, mv: 55.68, energy: 0.88, concerto: 1.4, offtune: 2800, forte2: 10 });
var WBA2 = mornyeAction("Basic - Wide Field Observation 2", { node: 0, cast: 1, type: 4096, mv: 103.4, energy: 1.64, concerto: 2.56, offtune: 5200, forte2: 12 });
var WBA3 = mornyeAction("Basic - Wide Field Observation 3", { node: 0, cast: 1, type: 4096, mv: 103.42, energy: 1.64, concerto: 2.56, offtune: 5200, forte2: 18 });
var WDC = mornyeAction("Dodge Counter - Wide Field Observation", { node: 0, cast: 0, type: 4096, mv: 103.4, energy: 1.64, concerto: 12.56, offtune: 5200, forte2: 12 });
var FIELD = { updateBuffs: () => queue(SyntonyFieldHit) };
var GeopotentialShift = mornyeAction("Forte Heavy - Geopotential Shift", { node: 2, cast: 3, type: 8192, mv: 143.16, energy: 3.01, concerto: 9.61, offtune: 9600, forte1: -100, ...FIELD });
var Inversion = mornyeAction("Forte Heavy - Inversion", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 258.46,
  energy: 3.25,
  concerto: 11.96,
  offtune: 10400,
  forte2: -100,
  updateBuffs: () => applyEnemy(OBSERVATION_MARKER, 1)
});
var SyntonyFieldHit = mornyeAction("Forte - Syntony Field", {
  node: 2,
  type: 16384,
  mv: 198.85,
  updateBuffs: () => applyTeam(SYNTONY_FIELD, 1)
});
var SKILL_HEAL = { updateDebuffs: () => applyCurrent(HEALS, 1) };
var Skill20 = mornyeAction("Skill - Expectation Error", { node: 1, cast: 4, ...SKILL_HEAL });
var OptimalSolution = mornyeAction("Skill - Optimal Solution", { node: 1, cast: 4, type: 12288, mv: 179.73, energy: 3.96, concerto: 9.04, offtune: 9040, forte1: 100 });
var DistributedArray = mornyeAction("Skill - Distributed Array", { node: 1, cast: 4, type: 12288, mv: 159.08, energy: 18.52, concerto: 10, offtune: 8e3, forte2: 60, ...SKILL_HEAL });
var Liberation19 = mornyeAction("Liberation - Critical Protocol", {
  node: 3,
  cast: 5,
  type: 16384,
  scaling: 2,
  mv: 522.33,
  concerto: 20,
  offtune: 72e3,
  resetEnergy: true,
  // trades the field up to its High stage (stack 2), if one is standing
  updateBuffs: () => {
    applyCurrent(CRITICAL_PROTOCOL, 1);
    if (stacksOfTeam(SYNTONY_FIELD))
      applyTeam(SYNTONY_FIELD, 1);
  }
});
var Intro25 = mornyeAction("Intro - Convergence", { node: 4, cast: 6, type: 20480, mv: 202.79, energy: 10, concerto: 10, offtune: 13600, ...FIELD });
var Outro25 = mornyeAction("Outro - Recursion", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => applyTeam(RECURSION)
});
var ParticleJet = mornyeAction("Tune Rupture Response - Particle Jet", {
  node: 2,
  type: 40960,
  mv: 298.22,
  scaling: 4
});
var SYNTONY_FIELD = new Buff({
  name: "Mornye: Syntony Field",
  maxStacks: 2,
  display: () => frozenStacks() === 2 ? "Mornye: High Syntony Field" : "Mornye: Syntony Field",
  applyStats: () => {
    addStat(13, 50);
    if (frozenStacks() === 2)
      addStat(8, 20);
  }
});
var RECURSION = new Buff({
  name: "Mornye: Outro",
  applyStats: () => addStat(18, 25)
});
var CRITICAL_PROTOCOL = new Buff({
  name: "Mornye: Critical Protocol",
  convertStats: () => {
    revokeCurrent(CRITICAL_PROTOCOL);
    addStat(9, Math.min(80, 0.5 * (getStat(
      11
      /* Stat.Er */
    ) - 100)));
    addStat(10, Math.min(160, 1 * (getStat(
      11
      /* Stat.Er */
    ) - 100)));
  }
});
var OBSERVATION_MARKER = new Debuff({
  name: "Mornye: Observation Marker",
  // cleared before it goes back on: the marker counts its own 8s off in its stacks (tunebreak.ts),
  // and unlike a Rupture/Hack Interfered it can be re-marked inside that window — a break that
  // leaves a Strain, or none at all, is held off by nothing — so a fresh one starts the count over
  // rather than pushing the old one along.
  updateGlobal: () => {
    if (currentAction() !== TUNE_BREAK)
      return;
    revokeEnemy(INTERFERED_MARKER);
    applyEnemy(INTERFERED_MARKER, 1);
  }
});
var INTERFERED_MARKER = interferedWindow({
  name: "Mornye: Interfered Marker",
  applyStats: () => {
    if (stacksOfEnemy(TUNE_RUPTURE_INTERFERED) > 0 || stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0)
      addStat(17, 40);
  }
});
var MO_INHERENT_1 = new Inherent({
  name: "Inherent: Blueprint",
  constantStats: () => addStat(11, 10),
  applyStats: () => {
    const a = currentAction();
    if (a === Intro25 || a === WBA3)
      addStat(26, 20);
  }
});
var MO_INHERENT_2 = new Inherent({ name: "Inherent: Boundedness" });
var MORNYE_TALENTS = new Talent({
  name: "Mornye: Talents",
  constantStats: () => {
    addStat(8, 15.2);
    addStat(23, 12);
  }
});
var MORNYE_RESONATOR = new Resonator({
  name: "Mornye",
  element: 192,
  weapon: 1,
  intro: () => Intro25,
  outro: () => Outro25,
  color: "#ecabe3",
  maxEnergy: 175,
  updateGlobal: () => tuneRuptureResponse(ParticleJet),
  combatStart: () => maxStackIncrease(TUNE_STRAIN_INTERFERED, 1),
  lateConvertStats: () => tuneStrainBonus(),
  constantStats: () => {
    addStat(1, 15375);
    addStat(0, 287.5);
    addStat(2, 1356.7);
    addStat(12, 10);
  }
});
var BA1233 = new ActionGroup("Basic - Ground State Calibration 123", [BA124, BA223, BA323]);
var WBA123 = new ActionGroup("Basic - Wide Field Observation 123", [WBA1, WBA2, WBA3]);
var SkillSwap = Skill20.swap();
var MO_ROTATION = new Rotation([
  START_2,
  START_3,
  SkillSwap,
  SWAP,
  NOINTRO,
  BA1233,
  GeopotentialShift,
  INTRO,
  Liberation19,
  WBA123,
  DistributedArray,
  Inversion,
  ECHO_SWAP,
  OUTRO
]);
var MO_ECHOES = [
  new EchoLoadout(REACTOR_HUSK, STARRY_RADIANCE_5PC),
  new EchoLoadout(SPACETREK_EXPLORER, STARRY_RADIANCE_5PC)
];
var MORNYE = new Loadout({
  resonator: MORNYE_RESONATOR,
  talent: MORNYE_TALENTS,
  inherent1: MO_INHERENT_1,
  inherent2: MO_INHERENT_2,
  weapons: [STARFIELD_CALIBRATOR, DISCORD],
  echoLoadouts: MO_ECHOES,
  mainstats: mainstatOptions(
    4,
    5,
    17
    /* Mainstat.DEF1 */
  ),
  substat: chem("def", "liberation"),
  rotation: MO_ROTATION
});

// dist/src/resonators/fusion/mortefi.js
function mortefiAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA125 = mortefiAction("Basic - Impromptu Show 1", { node: 0, cast: 1, type: 4096, mv: 48.3, energy: 0.86, concerto: 2.77, offtune: 2800, forte1: 5 });
var BA224 = mortefiAction("Basic - Impromptu Show 2", { node: 0, cast: 1, type: 4096, mv: 40.78 * 2, energy: 1.46, concerto: 4.68, offtune: 4720, forte1: 10 });
var BA324 = mortefiAction("Basic - Impromptu Show 3", { node: 0, cast: 1, type: 4096, mv: 107.3, energy: 1.92, concerto: 6.16, offtune: 6160, forte1: 10 });
var BA421 = mortefiAction("Basic - Impromptu Show 4", { node: 0, cast: 1, type: 4096, mv: 21.02 * 4 + 126.93, energy: 3.76, concerto: 12.09, offtune: 12080, forte1: 25 });
var HA18 = mortefiAction("Heavy - Impromptu Show", { node: 0, cast: 3, type: 8192, mv: 167.01, energy: 2.4, concerto: 7.68, offtune: 9600 });
var MA111 = mortefiAction("Mid-air - Impromptu Show 1", { node: 0, cast: 2, type: 4096, mv: 23.25, energy: 0.41, concerto: 1, offtune: 1360 });
var MA28 = mortefiAction("Mid-air - Impromptu Show 2", { node: 0, cast: 2, type: 4096, mv: 23.25, energy: 0.41, concerto: 1, offtune: 1360 });
var DC21 = mortefiAction("Dodge Counter - Impromptu Show", { node: 0, cast: 0, type: 4096, mv: 194.98, energy: 3.5, concerto: 16.4, offtune: 6400 });
var Skill21 = mortefiAction("Skill - Passionate Variation", { node: 1, cast: 4, type: 12288, mv: 208.76, energy: 10, concerto: 18, offtune: 7200, forte1: 40 });
var FSkill7 = mortefiAction("Forte Skill - Fury Fugue", { node: 2, cast: 4, type: 12288, mv: 326.05, energy: 10, concerto: 18, offtune: 8e3, forte1: -100 });
var Liberation20 = mortefiAction("Liberation - Violent Finale", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 159.05,
  concerto: 20,
  offtune: 96e3,
  resetEnergy: true,
  updateBuffs: () => {
    revokeCurrent(VIBRATO);
    applyTeam(BURNING_RHAPSODY, 28);
  }
});
var MARCATO_FIELD = new ActionField("Mortefi: Burning Rhapsody");
var ACTION_MARCATO = mortefiAction("Liberation - Marcato", {
  node: 3,
  type: 16384,
  type2: 262144,
  mv: 31.81,
  active: false,
  field: MARCATO_FIELD,
  updateBuffs: () => applyCurrent(VIBRATO, 1)
});
var ACTION_MARCATO_PAIRED = ACTION_MARCATO.variant("Liberation - Marcato", { updateBuffs: void 0 });
var ACTION_S5_MARCATO = mortefiAction("Liberation - Marcato (S5 Funerary Quartet)", {
  node: 3,
  type: 16384,
  type2: 262144,
  mv: 31.81 * 0.5,
  updateBuffs: () => applyCurrent(VIBRATO, 1)
});
var ACTION_S5_MARCATO_PAIRED = ACTION_S5_MARCATO.variant("Liberation - Marcato (S5 Funerary Quartet)", { updateBuffs: void 0 });
var Intro26 = mortefiAction("Intro - Dissonance", { node: 4, cast: 6, type: 20480, mv: 168.99, energy: 10, concerto: 10, offtune: 8e3 });
var Outro26 = mortefiAction("Outro - Rage Transposition", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(MORTEFI_OUTRO)
});
var BURNING_RHAPSODY = new Buff({
  name: "Mortefi: Burning Rhapsody",
  maxStacks: 48,
  field: MARCATO_FIELD,
  updateBuffs: () => {
    if (!currentAction().active || triggeredAction())
      return;
    if (casting(
      4
      /* Cast.Skill */
    )) {
      queueOn(MORTEFI_RESONATOR, ACTION_MARCATO);
      queueOn(MORTEFI_RESONATOR, ACTION_MARCATO_PAIRED);
      return;
    }
    const heavy = casting(
      3
      /* Cast.Heavy */
    );
    if (!heavy && !((casting(
      1
      /* Cast.Basic */
    ) || casting(
      2
      /* Cast.MidAir */
    )) && currentAction().mv > 0))
      return;
    const n = Math.min(3, stacksOfTeam(BURNING_RHAPSODY));
    for (let i = 0; i < n; i++) {
      queueOn(MORTEFI_RESONATOR, ACTION_MARCATO);
      if (heavy)
        queueOn(MORTEFI_RESONATOR, ACTION_MARCATO_PAIRED);
    }
    removeStackTeam(BURNING_RHAPSODY, n);
  }
});
var VIBRATO = new Buff({
  name: "Inherent: Rhythmic Vibrato",
  maxStacks: 50,
  // held by Mortefi alone, so any Coordinated-typed row on his slot is a Marcato
  applyStats: () => {
    if (isType(
      262144
      /* Type2.Coordinated */
    ))
      addStat(17, 1.5 * frozenStacks());
  }
});
var HARMONIC_CONTROL = new Buff({
  name: "Inherent: Harmonic Control",
  applyStats: () => {
    if (currentAction() === FSkill7)
      addStat(17, 25);
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(HARMONIC_CONTROL);
  }
});
var MO_INHERENT_12 = new Inherent({
  name: "Inherent: Harmonic Control",
  updateBuffs: () => {
    if (currentAction() === Skill21)
      applyCurrent(HARMONIC_CONTROL, 1);
  }
});
var MO_INHERENT_22 = new Inherent({ name: "Inherent: Rhythmic Vibrato" });
var MORTEFI_OUTRO = new Buff({
  name: "Mortefi: Outro",
  applyStats: () => addStat(
    18,
    38,
    8192
    /* Type1.Heavy */
  ),
  updateBuffs: () => {
    lostOnSwap();
  }
});
var S6_TEAM_ATK = new Buff({
  name: "Mortefi S6: Apoplectic Instrumental",
  applyStats: () => addStat(6, 20),
  convertStats: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) && isHeld(MORTEFI_RESONATOR))
      revokeTeam(S6_TEAM_ATK);
  }
});
var MORTEFI_S1 = new Sequence({ name: "Mortefi S1: Solitary Etude" });
var MORTEFI_S2 = new Sequence({
  name: "Mortefi S2: Hypocritical Hymn",
  updateBuffs: () => {
    if (casting(
      8
      /* Cast.Echo */
    ))
      addStat(25, 10);
  }
});
var MORTEFI_S3 = new Sequence({
  name: "Mortefi S3: Flaming Recitativo",
  applyStats: () => addStat(
    10,
    30,
    262144
    /* Type2.Coordinated */
  )
});
var MORTEFI_S4 = new Sequence({
  name: "Mortefi S4: Cathartic Waltz",
  updateBuffs: () => {
    if (currentAction() === Liberation20)
      applyTeam(BURNING_RHAPSODY, 20);
  }
});
var MORTEFI_S5 = new Sequence({
  name: "Mortefi S5: Funerary Quartet",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Skill21 || a === FSkill7) {
      queue(ACTION_S5_MARCATO);
      for (let i = 0; i < 3; i++)
        queue(ACTION_S5_MARCATO_PAIRED);
    }
  }
});
var MORTEFI_S6 = new Sequence({
  name: "Mortefi S6: Apoplectic Instrumental",
  updateBuffs: () => {
    if (currentAction() === Liberation20)
      applyTeam(S6_TEAM_ATK, 1);
  }
});
var MORTEFI_RESONATOR = new Resonator({
  name: "Mortefi",
  element: 192,
  weapon: 2,
  intro: () => Intro26,
  outro: () => Outro26,
  color: "#e8734f",
  maxEnergy: 125,
  tier: 2,
  constantStats: () => {
    addStat(1, 10025);
    addStat(0, 250);
    addStat(2, 1137);
  }
});
var MORTEFI_TALENTS = new Talent({
  name: "Mortefi: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(
      17,
      12,
      192
      /* Attribute.Fusion */
    );
  }
});
var BA12342 = new ActionGroup("Basic - Impromptu Show 1234", [BA125, BA224, BA324, BA421]);
var MO_ROTATION2 = new Rotation([
  INTRO,
  Skill21,
  BA12342,
  // TODO swap this
  BA12342,
  FSkill7,
  Liberation20,
  ECHO_SWAP,
  OUTRO
]);
var MORTEFI = new Loadout({
  resonator: MORTEFI_RESONATOR,
  talent: MORTEFI_TALENTS,
  inherent1: MO_INHERENT_12,
  inherent2: MO_INHERENT_22,
  weapons: [STATIC_MIST, CADENZA, NEW_STD_PISTOL, THE_LAST_DANCE],
  echoLoadouts: [
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(STONEWALL_BRACER, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(HECATE, EMPYREAN_ANTHEM_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    10,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: MO_ROTATION2,
  sequences: [MORTEFI_S1, MORTEFI_S2, MORTEFI_S3, MORTEFI_S4, MORTEFI_S5, MORTEFI_S6]
});

// dist/src/resonators/glacio/carlotta.js
function carlottaAction(id, def2) {
  return new Action(id, { element: 256, scaling: 0, ...def2 });
}
var BA126 = carlottaAction("Basic - Silent Execution 1", { node: 0, cast: 1, type: 4096, mv: 54.08, energy: 0.8, concerto: 1.6, offtune: 2560 });
var BA225 = carlottaAction("Basic - Silent Execution 2", { node: 0, cast: 1, type: 4096, mv: 131.83, energy: 1.96, concerto: 3.9, offtune: 6240, forte1: 3 });
var MA112 = carlottaAction("Mid-air - Silent Execution", { node: 0, cast: 2, type: 4096, mv: 104.78, energy: 3, concerto: 6, offtune: 9600 });
var MA29 = carlottaAction("Basic - Silent Execution: Customary Greetings", { node: 0, cast: 1, type: 4096, mv: 239.98, energy: 2.11, concerto: 4.2, offtune: 6720, forte1: 3 });
var DC22 = carlottaAction("Dodge Counter - Silent Execution", { node: 0, cast: 0, type: 4096, mv: 241.32, energy: 3.58, concerto: 17.15, offtune: 11425, forte2: 10, forte1: -1 });
var NM1 = carlottaAction("Basic - Silent Execution: Necessary Measures 1", { node: 0, cast: 1, type: 4096, mv: 65.91, energy: 0.98, concerto: 1.95, offtune: 3120, forte2: 10, forte1: -1 });
var NM2 = carlottaAction("Basic - Silent Execution: Necessary Measures 2", { node: 0, cast: 1, type: 4096, mv: 133.51, energy: 1.98, concerto: 3.96, offtune: 6320, forte2: 10, forte1: -1 });
var NM3 = carlottaAction("Basic - Silent Execution: Necessary Measures 3", { node: 0, cast: 1, type: 4096, mv: 233.25, energy: 3.47, concerto: 6.9, offtune: 11040, forte2: 10, forte1: -1 });
var HA19 = carlottaAction("Heavy - Silent Execution", { node: 0, cast: 3, type: 8192, mv: 152.12, energy: 2.26, concerto: 4.52, offtune: 7200, forte1: 3 });
var EHA2 = carlottaAction("Heavy - Silent Execution: Containment Tactics", {
  node: 0,
  cast: 3,
  type: 8192,
  mv: 228.18,
  energy: 2.26,
  concerto: 15,
  offtune: 7200,
  forte2: -120,
  updateBuffs: () => {
    if (forte2() > 120)
      setForte2(120);
  }
});
var Skill111 = carlottaAction("Skill - Art of Violence", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 288.22,
  energy: 2,
  concerto: 5,
  offtune: 6136,
  forte1: 3
});
var Skill28 = carlottaAction("Skill - Chromatic Splendor", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 563.64,
  energy: 3,
  concerto: 5,
  offtune: 12e3,
  // the crystal-to-Substance conversion
  updateBuffs: () => applyCurrent(CHROMATIC_SPLENDOR_SPEND, 1)
});
var FHA7 = carlottaAction("Forte Heavy - Imminent Oblivion", {
  node: 2,
  cast: 3,
  type: 12288,
  mv: 835.36,
  energy: 17,
  concerto: 15,
  offtune: 97361,
  forte2: -120,
  updateBuffs: () => {
    if (forte2() > 120)
      setForte2(120);
  }
});
var Lib15 = carlottaAction("Liberation - Era of New Wave", {
  node: 3,
  cast: 5,
  type: 12288,
  mv: 402.71,
  concerto: 20,
  offtune: 33600,
  resetEnergy: true,
  // reads Substance, opens Twilight Tango, zeroes the gauge
  updateBuffs: () => {
    applyEnemy(DECONSTRUCTION, 1);
    applyCurrent(TWILIGHT_TANGO, 1);
    if (forte2() >= 120)
      applyCurrent(FINAL_BOW, 1);
    setForte2(0);
  }
});
var DeathKnell = carlottaAction("Liberation - Death Knell", {
  node: 3,
  cast: 5,
  type: 12288,
  mv: 241.64,
  energy: 5,
  concerto: 7,
  offtune: 9600,
  forte3: 1
});
var FatalFinale = carlottaAction("Liberation - Fatal Finale", {
  node: 3,
  cast: 5,
  type: 12288,
  mv: 644.33,
  concerto: 10,
  offtune: 50400,
  forte3: -4
});
var Intro27 = carlottaAction("Intro - Wintertime Aria", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 298.23,
  energy: 10,
  concerto: 10,
  offtune: 9335,
  forte2: 30,
  forte1: 3
});
var Outro27 = carlottaAction("Outro - Closing Remark", { cast: 7, type: 24576, mv: 794.2, concerto: -100, active: false });
var DECONSTRUCTION = new Debuff({
  name: "Carlotta: Deconstruction",
  applyStats: () => {
    if (isHeld(CARLOTTA_RESONATOR))
      addStat(22, 18);
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ) && isHeld(CARLOTTA_RESONATOR))
      revokeEnemy(DECONSTRUCTION);
  }
});
var CL_INHERENT_1 = new Inherent({
  name: "Inherent: Flawless Purity"
  // interrupt immune
});
var CL_INHERENT_2 = new Inherent({
  name: "Inherent: Ars Gratia Artis",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Intro27 || a === Skill28 || a === DeathKnell || a === FHA7)
      applyEnemy(DECONSTRUCTION, 1);
  }
});
var CHROMATIC_SPLENDOR_SPEND = new Buff({
  name: "Carlotta: Chromatic Splendor",
  convertStats: () => {
    const crystals = forte1();
    addStat(29, -crystals);
    addStat(30, 10 * crystals);
    revokeCurrent(CHROMATIC_SPLENDOR_SPEND);
  }
});
var TWILIGHT_TANGO = new Buff({
  name: "Carlotta: Twilight Tango",
  convertStats: () => {
    if (currentAction() === FatalFinale)
      revokeCurrent(TWILIGHT_TANGO);
  }
});
var FINAL_BOW = new Buff({
  name: "Carlotta: Final Bow",
  applyStats: () => {
    const a = currentAction();
    if (a === Lib15 || a === DeathKnell || a === FatalFinale)
      addStat(16, 80);
  },
  convertStats: () => {
    if (!isHeld(TWILIGHT_TANGO) || !currentAction().active)
      revokeCurrent(FINAL_BOW);
  }
});
var CL_S1 = new Sequence({
  name: "Carlotta S1: Beauty Blazes Brightest Before It Fades",
  applyStats: () => {
    if (stacksOfEnemy(DECONSTRUCTION) > 0)
      addStat(9, 12.5);
  },
  convertStats: () => {
    if (currentAction() === Skill28)
      addStat(30, 30);
  }
});
var CL_S2 = new Sequence({
  name: "Carlotta S2: Fallen Petals Give Life to New Blooms",
  applyStats: () => {
    if (currentAction() === FatalFinale)
      addStat(16, 126);
  }
});
var Sparks = carlottaAction("Outro - Kaleidoscope Sparks", { type: 24576, mv: 1032.18, active: false });
var CL_S3 = new Sequence({
  name: "Carlotta S3: Adelante, Cortado, Spinning in Grace",
  applyStats: () => {
    const a = currentAction();
    if (a === Skill111 || a === Skill28)
      addStat(16, 93);
  },
  updateBuffs: () => {
    if (currentAction() === Outro27)
      queue(Sparks);
  }
});
var FINEST_WINE = new Buff({
  name: "Carlotta S4: Yesterday's Raindrops Make Finest Wine (team)",
  applyStats: () => addStat(
    17,
    25,
    12288
    /* Type1.Skill */
  )
});
var CL_S4 = new Sequence({
  name: "Carlotta S4: Yesterday's Raindrops Make Finest Wine",
  updateBuffs: () => {
    const a = currentAction();
    if (a === HA19 || a === EHA2 || a === FHA7)
      applyTeam(FINEST_WINE, 1);
  }
});
var CL_S5 = new Sequence({
  name: "Carlotta S5: Toast to Past, Today, and Every Day to Come",
  applyStats: () => {
    if (currentAction() === FHA7)
      addStat(16, 47);
  }
});
var CL_S6 = new Sequence({
  name: "Carlotta S6: As the Curtain Falls, I Remain What I Am",
  applyStats: () => {
    if (currentAction() === DeathKnell)
      addStat(16, 186.6);
  }
});
var CARLOTTA_RESONATOR = new Resonator({
  name: "Carlotta",
  element: 256,
  weapon: 2,
  intro: () => Intro27,
  outro: () => Outro27,
  color: "#8fb3d9",
  maxEnergy: 125,
  constantStats: () => {
    addStat(1, 12450);
    addStat(0, 463);
    addStat(2, 1198);
  }
});
var CARLOTTA_TALENTS = new Talent({
  name: "Carlotta: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var DeathKnellx4 = new ActionGroup("Liberation - Death Knell x4", [DeathKnell, DeathKnell, DeathKnell, DeathKnell]);
var Skill122 = new ActionGroup("Skill - Art of Violence + Chromatic Splendor", [Skill111, Skill28]);
var Skill12Swap = new ActionGroup("Skill - Art of Violence + Chromatic Splendor", [Skill111, Skill28.swap()]);
var CL_ROTATION = new Rotation([
  START_3,
  Skill12Swap,
  SWAP,
  INTRO,
  Skill122,
  MA112,
  FHA7,
  Lib15,
  DeathKnellx4,
  FatalFinale,
  Skill122,
  ECHO_SWAP,
  OUTRO
]);
var CARLOTTA = new Loadout({
  resonator: CARLOTTA_RESONATOR,
  matrix: matrix("Carlotta", 25),
  talent: CARLOTTA_TALENTS,
  inherent1: CL_INHERENT_1,
  inherent2: CL_INHERENT_2,
  sequences: [CL_S1, CL_S2, CL_S3, CL_S4, CL_S5, CL_S6],
  weapons: [THE_LAST_DANCE, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: [new EchoLoadout(SENTRY_CONSTRUCT, FROSTY_RESOLVE_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    9,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "skill"),
  rotation: CL_ROTATION
});

// dist/src/resonators/glacio/hiyuki.js
var GLACIO_BITE = new Debuff({ name: "Glacio Bite", maxStacks: 10 });
function hiyukiAction(id, def2) {
  return new Action(id, { element: 256, scaling: 0, ...def2 });
}
var CHAFE = { updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1) };
var FROSTBIND = {
  afterAction: () => {
    if (stacksOfEnemy(GLACIO_BITE) >= 10)
      consume(GLACIO_BITE, 10);
  }
};
var BA127 = hiyukiAction("Basic - Present Self 1", { node: 0, cast: 1, type: 4096, mv: 75.44, energy: 1.28, concerto: 2.44, offtune: 4336 });
var BA226 = hiyukiAction("Basic - Present Self 2", { node: 0, cast: 1, type: 4096, mv: 90.25, energy: 1.53, concerto: 2.92, offtune: 5188 });
var BA325 = hiyukiAction("Basic - Present Self 3", { node: 0, cast: 1, type: 4096, mv: 122.97, energy: 2.12, concerto: 3.99, offtune: 7070, forte1: 100, ...CHAFE });
var MA30 = hiyukiAction("Mid-air - Present Self", { node: 0, cast: 2, type: 4096, mv: 128.18, energy: 2.17, concerto: 4.15, offtune: 7368 });
var DC23 = hiyukiAction("Dodge Counter - Present Self 2", { node: 0, cast: 0, type: 4096, mv: 173.75, energy: 2.94, concerto: 15.62, offtune: 9988 });
var FrostSplinter = hiyukiAction("Heavy - Frost Splinter: Present Self", {
  node: 0,
  cast: 3,
  type: 16384,
  mv: 317.23,
  energy: 5.23,
  concerto: 9.99,
  offtune: 17728,
  forte1: -300,
  // the last arrow spends the whole bar — a clear, not a -300 delta: Inward Vision and Blade
  // Liberation each say they remove 300 too, and by then Dedication is already empty, so declared
  // deltas would drive the gauge hundreds negative (nothing in the engine floors one)
  updateBuffs: () => {
    if (forte1() > 300)
      setForte1(300);
  },
  ...CHAFE
});
var FBA12 = hiyukiAction("Basic - Foreclaimed Self 1", { node: 0, cast: 1, type: 16384, mv: 49.27, energy: 0.84, concerto: 1.6, offtune: 2832, forte2: 10 });
var FBA22 = hiyukiAction("Basic - Foreclaimed Self 2", { node: 0, cast: 1, type: 16384, mv: 80.04, energy: 1.36, concerto: 2.6, offtune: 4600, forte2: 15 });
var FBA32 = hiyukiAction("Basic - Foreclaimed Self 3", { node: 0, cast: 1, type: 16384, mv: 167.72, energy: 2.86, concerto: 5.45, offtune: 9640, forte2: 32, ...CHAFE });
var FBA42 = hiyukiAction("Basic - Foreclaimed Self 4", { node: 0, cast: 1, type: 16384, mv: 149.65, energy: 2.55, concerto: 4.85, offtune: 8600, forte2: 30, ...CHAFE });
var FBA52 = hiyukiAction("Basic - Foreclaimed Self 5", { node: 0, cast: 1, type: 16384, mv: 121.64, energy: 2.06, concerto: 3.94, offtune: 6993, forte2: 24, ...CHAFE });
var FDC2 = hiyukiAction("Dodge Counter - Foreclaimed Self 2", { node: 0, cast: 0, type: 16384, mv: 163.54, energy: 2.78, concerto: 15.3, offtune: 9400, forte2: 32 });
var FMA12 = hiyukiAction("Mid-air - Foreclaimed Self 1", { node: 0, cast: 2, type: 16384, mv: 96.09, energy: 1.63, concerto: 3.13, offtune: 5523, forte2: 19 });
var FMA22 = hiyukiAction("Mid-air - Foreclaimed Self 2", { node: 0, cast: 2, type: 16384, mv: 104.36, energy: 1.8, concerto: 3.4, offtune: 6e3, forte2: 20, ...CHAFE });
var FMA32 = hiyukiAction("Mid-air - Foreclaimed Self 3", { node: 0, cast: 2, type: 16384, mv: 111.6, energy: 1.89, concerto: 3.61, offtune: 6416, forte2: 22, ...CHAFE });
var UHA2 = hiyukiAction("Heavy - Foreclaimed Self", { node: 0, cast: 3, type: 16384, mv: 107.16, energy: 1.81, concerto: 3.47, offtune: 6160, forte2: 21 });
var FHA8 = hiyukiAction("Heavy - Bitterfrost: Foreclaimed Self", {
  node: 0,
  cast: 3,
  type: 16384,
  mv: 616.33,
  energy: 8,
  concerto: 10,
  offtune: 84e3,
  forte3: -3,
  updateBuffs: () => applyCurrent(SNOWFORGED_BLADE, 1),
  ...CHAFE
});
var Skill29 = hiyukiAction("Skill - Frostblight: Present Self", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 195.98,
  energy: 3.34,
  concerto: 6.37,
  offtune: 11264,
  updateBuffs: () => applyCurrent(FROSTBLIGHT_ENHANCED, 1)
});
var USkill1 = hiyukiAction("Skill - Frostblight: Jade Cleave", { node: 1, cast: 4, type: 12288, mv: 264.04, energy: 10, concerto: 3, offtune: 5312, forte2: 75 });
var USkill22 = hiyukiAction("Skill - Frostblight: Petalfall", { node: 1, cast: 4, type: 12288, mv: 320.1, energy: 10.3, concerto: 3.65, offtune: 6440, forte2: 75 });
var Lib16 = hiyukiAction("Liberation - Foreclaiming: Inward Vision", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 397.62,
  concerto: 20,
  offtune: 84e3,
  forte2: 50,
  updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 4),
  updateBuffs: () => {
    setForte1(0);
    setForte2(0);
    applyCurrent(FROSTHARDEN_IAI, 3);
  },
  ...FROSTBIND
});
var Lib2Tap = hiyukiAction("Liberation - Foreclaiming: Blade Liberation", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 994.05,
  concerto: 20,
  resetEnergy: true,
  // everything it ends the form by removing, once the cast has banked: Dedication, Frostheart, and
  // every Snowforged Blade the multiplier above just cashed
  afterAction: () => {
    setForte1(0);
    setForte2(0);
  }
});
var Lib2Hold = hiyukiAction("Liberation - Foreclaiming: Blade Liberation", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 994.05,
  concerto: 20,
  resetEnergy: true,
  // everything it ends the form by removing, once the cast has banked: Dedication, Frostheart, and
  // every Snowforged Blade the multiplier above just cashed
  afterAction: () => {
    setForte1(0);
    setForte2(0);
  }
});
var Iai = hiyukiAction("Forte Basic - Iai", {
  node: 2,
  cast: 1,
  type: 16384,
  mv: 473.06,
  energy: 1.88,
  concerto: 3.59,
  offtune: 6347,
  forte2: -100,
  ...FROSTBIND
});
var Intro28 = hiyukiAction("Intro - Frostedge", {
  node: 4,
  cast: 6,
  type: 16384,
  mv: 156.15,
  energy: 10,
  concerto: 10,
  offtune: 8976,
  forte1: 200,
  updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1),
  // Snowlight Blessing is a 20s team buff, so CLAUDE.md's own wording rule ends it here rather
  // than leaving it standing for the fight
  updateBuffs: () => revokeTeam(SNOWLIGHT_BLESSING)
});
var Outro28 = hiyukiAction("Outro - Snowlight Blessing", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => applyTeam(SNOWLIGHT_BLESSING, 1)
});
var FineSnowBite = new Action("Glacio Bite - Fine Snow", {
  element: 256,
  type: 32768,
  type2: 1310720,
  scaling: 3,
  mv: 102
});
var FROSTHARDEN_IAI = new Buff({
  name: "Hiyuki: Frostharden Iai",
  maxStacks: 3,
  // a point of Frostharden buys the 3 Chafe stacks and the Whiteout; all three phases read the
  // count untouched, and the spend itself lands last so none of them races it
  updateDebuffs: () => {
    if (currentAction() === Iai)
      applyEnemy(GLACIO_CHAFE, 3);
  },
  applyStats: () => {
    if (currentAction() === Iai)
      addStat(31, 1);
  },
  convertStats: () => {
    if (currentAction() === Iai)
      removeStack(FROSTHARDEN_IAI, 1);
  }
});
var SNOWFORGED_BLADE = new Buff({
  name: "Hiyuki: Snowforged Blade",
  maxStacks: 3,
  applyStats: () => {
    const a = currentAction();
    if (a === Lib2Hold || a === Lib2Tap && frozenStacks() >= 3) {
      addStat(15, 795.24 * frozenStacks());
      revokeCurrent(SNOWFORGED_BLADE);
    } else if (a === Lib2Tap) {
      addStat(15, 795.24);
      removeStack(SNOWFORGED_BLADE, 1);
    }
  }
});
var FROSTBLIGHT_ENHANCED = new Buff({
  name: "Hiyuki: Present Self",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => {
    if (currentAction() === BA325)
      addStat(29, 100);
  },
  convertStats: () => {
    if (currentAction() === BA325)
      revokeCurrent(FROSTBLIGHT_ENHANCED);
  }
});
var snowRust = () => {
  const slots = frozenStacks();
  return (slots & 1) + (slots >> 1 & 1) + (slots >> 2 & 1);
};
var SNOW_RUST = new Buff({
  name: "Hiyuki: Snow Rust",
  maxStacks: 1 + 2 + 4,
  display: () => `Hiyuki: Snow Rust x${snowRust()}`,
  // At 2 stacks, one fixed-multiplier Bite hit per stack of Chafe *she* applies, and only while
  // she is the one on field. Held locally, so it runs on the acting slot's own turn and no other;
  // `appliedByMe` is what makes the count hers alone, so a stack Lucilla's Film Roll adds to her
  // cast buys no extra hit.
  //
  // Counted in `updateBuffs`, a phase after the one every kit inflicts in, so that it sees the
  // whole cast however the stacks got there. In `updateDebuffs` it only ever saw what the *action*
  // itself had already declared: a sibling buff of hers inflicting in that same phase (Frostharden
  // Iai's 3, which is every Iai in the rotation) lands after her in the local roster, and she read
  // 0 and queued nothing. Frostburn and Quiet Snowfall read the same count a phase later for the
  // same reason. The conversion to Glacio Bite in between takes the stacks straight back off, but
  // `appliedByMe` is a record of what this action applied, not of what is still on the target.
  updateBuffs: () => {
    if (snowRust() < 2)
      return;
    for (let i = appliedByMe(GLACIO_CHAFE); i > 0; i--)
      queue(FineSnowBite);
  },
  applyStats: () => {
    if (currentAction().active) {
      addStat(10, 40);
      addStat(
        18,
        snowRust() >= 3 ? 60 : 30,
        1310720
        /* Type2.GlacioChafe */
      );
    }
  }
});
var SNOWLIGHT_BLESSING = new Buff({
  name: "Hiyuki: Outro",
  applyStats: () => {
    if (currentTeam().slot.resonator === HIYUKI_RESONATOR || stacksOfEnemy(GLACIO_BITE) === 0)
      return;
    addStat(
      18,
      20,
      256
      /* Attribute.Glacio */
    );
  }
});
var HY_INHERENT_1 = new Inherent({
  name: "Inherent: Fine Snow",
  updateGlobal: () => {
    const actor = currentTeam().slot;
    if (!appliedByMember(GLACIO_CHAFE, actor) && !appliedByMember(HAVOC_BANE, actor))
      return;
    const slot = 1 << currentTeam().active;
    if ((stacksOf(SNOW_RUST) & slot) !== 0)
      return;
    applyCurrent(SNOW_RUST, slot);
  }
});
var HY_INHERENT_2 = new Inherent({
  name: "Inherent: Ephemeral Realm",
  combatStart: () => applyCurrent(SNOWFORGED_BLADE, 1)
});
var HIYUKI_TALENTS = new Talent({
  name: "Hiyuki: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var HIYUKI_RESONATOR = new Resonator({
  name: "Hiyuki",
  element: 256,
  weapon: 0,
  intro: () => Intro28,
  outro: () => Outro28,
  color: "#fb6a6f",
  maxEnergy: 125,
  /* Everfrost Dominion's Glacio Bite, the one thing on her that is true of the whole team: while
   * she is in it, every stack of Glacio Chafe *anyone* inflicts is converted, and each converted
   * stack deals its damage at the target's own stack **limit** rather than at the rung it just
   * reached. On a bare team that is the 10-stack rung on every single application; with Chisa's
   * +3 to the cap it is the 13-stack rung instead, which is where her pairing comes from.
   *
   * From `updateGlobal` so it sees a teammate's cast as readily as her own, and because that phase
   * is past every `updateDebuffs` (where a kit inflicts, Lucilla's Film Roll included) and still
   * ahead of the roster the stat phases are captured from. That last part is what lets the plain
   * stacks be taken straight back off — which is both what the kit says and what keeps status.ts's
   * own ramping damage from firing for the very stacks this just converted.
   *
   * Glacio Bite DMG *is* Glacio Chafe DMG, so it fires status.ts's shared ladder rather than
   * carrying a copy of those motion values, and the limit it indexes is Glacio Chafe's — Bite
   * counts as Chafe for every cap a teammate raises.
   *
   * `queueOn` rather than `queue`: a resonator's own gear runs `updateGlobal` with the current
   * slot switched to *her*, so a plain queue would pin every hit to her and have it read her Fine
   * Snow and Frostburn amplification even on a stack Lucilla laid while on field. The hits belong
   * to whoever actually inflicted.
   *
   * "When Hiyuki joins the team, remove all stacks of Glacio Chafe from the targets" needs nothing
   * of its own: a fight starts with none on the target, and from the first one onward this is what
   * takes them off. */
  updateGlobal: () => {
    const inflicted = applied(GLACIO_CHAFE);
    if (inflicted === 0)
      return;
    revokeEnemy(GLACIO_CHAFE);
    applyEnemy(GLACIO_BITE, inflicted);
    const rung = GLACIO_CHAFE_ACTIONS[currentTeam().enemyMax(GLACIO_CHAFE)];
    const applier = currentTeam().slot.resonator;
    for (let i = 0; i < inflicted; i++)
      queueOn(applier, rung);
  },
  constantStats: () => {
    addStat(1, 10300);
    addStat(0, 462.5);
    addStat(2, 1112.22);
  },
  afterAction: () => {
    if (currentAction() != TUNE_BREAK)
      return;
    if (forte3() > 0 || forte2() > 0) {
      queue(FBA32);
    }
  }
});
var HY_ROTATION = new Rotation([
  INTRO,
  BA325,
  FrostSplinter,
  Lib16,
  UHA2,
  FBA22,
  FBA32,
  UHA2,
  FBA22,
  FBA32,
  USkill1,
  USkill22,
  DODGE,
  Iai,
  Iai,
  Iai,
  ECHO_CANCEL,
  FHA8,
  Lib2Hold,
  OUTRO
]);
var HY_ECHOES = [
  new EchoLoadout(VOIDBORNE_CONSTRUCT, QUIET_SNOWFALL_5PC)
];
var HIYUKI = new Loadout({
  resonator: HIYUKI_RESONATOR,
  talent: HIYUKI_TALENTS,
  inherent1: HY_INHERENT_1,
  inherent2: HY_INHERENT_2,
  weapons: [FROSTBURN, EMERALD_OF_GENESIS],
  echoLoadouts: HY_ECHOES,
  mainstats: mainstatOptions(
    0,
    1,
    6,
    9,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: HY_ROTATION
});

// dist/src/resonators/glacio/lucilla.js
function lucillaAction(id, def2) {
  return new Action(id, { element: 256, scaling: 0, ...def2 });
}
var CHAFES = { updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1) };
var Intro29 = lucillaAction("Intro - Clip It", { node: 4, cast: 6, type: 20480, mv: 97.42, energy: 11.75, concerto: 14.13, offtune: 5600, forte1: 100, ...CHAFES });
var Outro29 = lucillaAction("Outro - Montage", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => {
    if (isHeld(MODE_CHAFE))
      applyTeam(MONTAGE_CHAFE, 1);
    else
      queueOutro(MONTAGE_HANDOFF);
  }
});
var BA128 = lucillaAction("Basic - Snapshot 1", { node: 0, cast: 1, type: 4096, mv: 59.29, energy: 1.07, concerto: 1.71, offtune: 3408 });
var BA227 = lucillaAction("Basic - Snapshot 2", { node: 0, cast: 1, type: 4096, mv: 67.23, energy: 1.22, concerto: 1.94, offtune: 3865 });
var BA326 = lucillaAction("Basic - Snapshot 3 - Commendable", { node: 0, cast: 1, type: 4096, mv: 235.27, energy: 4.23, concerto: 6.77, offtune: 13524, forte1: 50 });
var MA31 = lucillaAction("Mid-air - Snapshot", { node: 0, cast: 2, type: 4096, mv: 86.29, energy: 1.55, concerto: 3.66, offtune: 4960 });
var DC24 = lucillaAction("Dodge Counter - Snapshot", { node: 0, cast: 0, type: 4096, mv: 150.73, energy: 2.71, concerto: 16.4, offtune: 8665 });
var PhantomFrame = lucillaAction("Skill - Phantom Frame", { node: 1, cast: 4, type: 12288, mv: 39.78, energy: 1.26, concerto: 2.07, offtune: 4002 });
var Compensate = lucillaAction("Skill - Compensate", { node: 1, cast: 4, type: 12288, mv: 249.07, energy: 9.31, concerto: 3.08, offtune: 4176, forte1: 25 });
var Spotlight = lucillaAction("Skill - Spotlight", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 548.98,
  energy: 27.9,
  concerto: 6.8,
  offtune: 9205,
  forte1: 50,
  updateDebuffs: () => {
    if (isHeld(MODE_CHAFE))
      applyEnemy(GLACIO_CHAFE, 1);
  },
  applyStats: () => {
    addStat(26, 20);
  }
});
var Liberation21 = lucillaAction("Liberation - Clear As Day", {
  node: 3,
  cast: 5,
  type: 28672,
  mv: 142.74,
  concerto: 20,
  offtune: 38400,
  updateBuffs: () => {
    applyCurrent(LIB_SELF_DMG, 1);
    if (isHeld(MODE_CHAFE))
      applyTeam(FILM_ROLL, 4);
    else
      applyTeam(ZOOM, 1);
  }
});
var UBA14 = lucillaAction("Basic - Tracing Forms 1", { node: 3, cast: 1, type: 4096, mv: 76.59, energy: 1.08, concerto: 2.07, offtune: 3425 });
var UBA24 = lucillaAction("Basic - Tracing Forms 2", { node: 3, cast: 1, type: 4096, mv: 149.42, energy: 12.09, concerto: 4.93, offtune: 6680 });
var UBA34 = lucillaAction("Basic - Tracing Forms 3", {
  node: 3,
  cast: 1,
  type: 4096,
  mv: 416.96,
  energy: 5.84,
  concerto: 11.2,
  offtune: 18640,
  updateBuffs: () => {
    const photos = Math.min(3, Math.floor(forte1() / 50));
    for (let i = 0; i < photos; i++)
      queue(isHeld(MODE_CHAFE) ? OblivionChafe : OblivionEcho);
    queue(LettingGo);
  }
});
var OblivionEcho = lucillaAction("Forte Echo - Oblivion", { node: 2, cast: 8, type: 28672, mv: 285.48, offtune: 9600, forte1: -50 });
var OblivionChafe = lucillaAction("Forte - Oblivion (Chafe)", { node: 2, type: 4096, mv: 285.48, offtune: 9600, forte1: -50, ...CHAFES });
var LettingGo = lucillaAction("Basic - Letting It Go", {
  node: 3,
  type: 28672,
  mv: 848.07,
  energy: 3.36,
  concerto: 7.88,
  offtune: 36514,
  applyStats: () => {
    addStat(26, 20);
  }
});
var MODE_ECHO = new ResonanceMode({ name: "Resonance Mode - Echo" });
var MODE_CHAFE = new ResonanceMode({
  name: "Resonance Mode - Glacio Chafe",
  // the retag has to land in the first phase, before anything reads the type (see typeOverride)
  updateDebuffs: () => {
    const a = currentAction();
    if (a === Liberation21 || a === LettingGo)
      typeOverride(
        4096
        /* Type1.Basic */
      );
  }
});
var SLOW_MOTION_TEAM = new Buff({
  name: "Inherent: Slow Motion",
  applyStats: () => addStat(
    17,
    25,
    28672
    /* Type1.Echo */
  )
});
var SLOW_MOTION_CHAFE = new Debuff({
  name: "Inherent: Slow Motion",
  applyStats: () => addEnemyStat(
    34,
    8,
    256
    /* Attribute.Glacio */
  )
});
var LC_INHERENT_12 = new Inherent({
  name: "Inherent: Slow Motion",
  updateBuffs: () => {
    if (currentAction() !== Spotlight)
      return;
    if (isHeld(MODE_ECHO))
      applyTeam(SLOW_MOTION_TEAM, 1);
    else if (isHeld(MODE_CHAFE))
      applyEnemy(SLOW_MOTION_CHAFE, 1);
  }
});
var ZOOM = new Buff({
  name: "Lucilla: Zoom",
  maxStacks: 4,
  applyStats: () => {
    if (currentAction().active)
      addStat(
        10,
        10 * frozenStacks(),
        28672
        /* Type1.Echo */
      );
  }
});
var FILM_ROLL = new Buff({
  name: "Lucilla: Film Roll",
  maxStacks: 10,
  updateDebuffs: () => {
    if (!currentAction().active || currentTeam().slot.resonator === LUCILLA_RESONATOR)
      return;
    if (!applied(GLACIO_CHAFE))
      return;
    removeStackTeam(FILM_ROLL, 1);
    applyEnemy(GLACIO_CHAFE, 2);
  }
});
var LC_INHERENT_22 = new Inherent({
  name: "Inherent: Remembrance",
  updateBuffs: () => {
    const a = currentAction();
    if (a === OblivionEcho)
      applyTeam(ZOOM, 1);
    if (a === OblivionChafe)
      applyTeam(FILM_ROLL, 2);
  }
});
var LIB_SELF_DMG = new Buff({
  name: "Lucilla: Clear As Day",
  applyStats: () => addStat(
    17,
    30,
    isHeld(MODE_CHAFE) ? 4096 : 28672
    /* Type1.Echo */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(LIB_SELF_DMG);
  }
});
var MONTAGE_HANDOFF = new Buff({
  name: "Lucilla: Outro (echo)",
  applyStats: () => addStat(
    18,
    50,
    28672
    /* Type1.Echo */
  ),
  updateBuffs: () => {
    lostOnSwap();
  }
});
var MONTAGE_CHAFE = new Buff({
  name: "Lucilla: Outro (chafe)",
  applyStats: () => addStat(
    18,
    60,
    1310720
    /* Type2.GlacioChafe */
  )
});
var LUCILLA_RESONATOR = new Resonator({
  name: "Lucilla",
  element: 256,
  weapon: 4,
  intro: () => Intro29,
  outro: () => Outro29,
  color: "#4f74c2",
  maxEnergy: 0,
  constantStats: () => {
    addStat(1, 12237.5);
    addStat(0, 375);
    addStat(2, 1197.8);
  }
});
var LUCILLA_TALENTS = new Talent({
  name: "Lucilla: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var UBA1232 = new ActionGroup("Basic - Tracing Forms 123", [UBA14, UBA24, UBA34]);
var LC_ROTATION2 = new Rotation([
  INTRO,
  PhantomFrame,
  Spotlight,
  ECHO_CANCEL,
  Liberation21,
  UBA1232,
  OUTRO
]);
var LC_ECHOES2 = [
  new EchoLoadout(BELL_BORNE_GEOCHELONE, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(HERON, DREAM_OF_THE_LOST_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(FALLACY, DREAM_OF_THE_LOST_3PC, REJUV_2PC),
  new EchoLoadout(BELL_BORNE_GEOCHELONE, LAW_OF_HARMONY_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(FALLACY, LAW_OF_HARMONY_3PC, REJUV_2PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC)
];
var LC_ECHOES_CHAFE = [
  new EchoLoadout(GLOMMOTH, DREAM_OF_THE_LOST_3PC, QUIET_SNOWFALL_2PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(GLOMMOTH, QUIET_SNOWFALL_5PC)
];
var LUCILLA = new Loadout({
  resonator: LUCILLA_RESONATOR,
  talent: LUCILLA_TALENTS,
  inherent1: LC_INHERENT_12,
  inherent2: LC_INHERENT_22,
  weapons: [FREEZE_FRAME, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER, LETHEAN_ELEGY],
  echoLoadouts: LC_ECHOES2,
  mainstats: mainstatOptions(
    0,
    1,
    6,
    9,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: LC_ROTATION2,
  mode: MODE_ECHO
});
var LUCILLA_CHAFE = new Loadout({
  resonator: LUCILLA_RESONATOR,
  talent: LUCILLA_TALENTS,
  inherent1: LC_INHERENT_12,
  inherent2: LC_INHERENT_22,
  weapons: [FREEZE_FRAME, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER],
  echoLoadouts: LC_ECHOES_CHAFE,
  mainstats: mainstatOptions(
    0,
    1,
    6,
    9,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: LC_ROTATION2,
  mode: MODE_CHAFE
});

// dist/src/resonators/glacio/sanhua.js
function sanhuaAction(id, def2) {
  return new Action(id, { element: 256, scaling: 0, ...def2 });
}
var Intro30 = sanhuaAction("Intro - Freezing Thorns", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 139.17,
  energy: 10,
  concerto: 10,
  offtune: 2800,
  updateBuffs: () => applyCurrent(THORN_BUFF, 1)
});
var Outro30 = sanhuaAction("Outro - Silversnow", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(SANHUA_OUTRO)
});
var Skill30 = sanhuaAction("Skill - Eternal Frost", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 359.85,
  offtune: 8e3,
  energy: 10,
  concerto: 15,
  updateBuffs: () => applyCurrent(PRISM_BUFF, 1)
});
var Liberation22 = sanhuaAction("Liberation - Glacial Gaze", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 809.48,
  offtune: 61440,
  energy: 10,
  concerto: 20,
  resetEnergy: true,
  updateBuffs: () => applyCurrent(GLACIER_BUFF, 1)
});
var BA129 = sanhuaAction("Basic - Frigid Light 1", { node: 0, cast: 1, type: 4096, mv: 48.71, energy: 0.87, concerto: 2, offtune: 2800 });
var BA228 = sanhuaAction("Basic - Frigid Light 2", { node: 0, cast: 1, type: 4096, mv: 73.76, energy: 1.32, concerto: 4, offtune: 4240 });
var BA327 = sanhuaAction("Basic - Frigid Light 3", { node: 0, cast: 1, type: 4096, mv: 86.32, energy: 1.52, concerto: 8, offtune: 4960 });
var BA422 = sanhuaAction("Basic - Frigid Light 4", { node: 0, cast: 1, type: 4096, mv: 79.34, energy: 1.42, concerto: 8, offtune: 4560 });
var BA53 = sanhuaAction("Basic - Frigid Light 5", { node: 0, cast: 1, type: 4096, mv: 233.81, energy: 4.2, concerto: 10, offtune: 13440 });
var HA20 = sanhuaAction("Heavy - Frigid Light", { node: 0, cast: 3, type: 8192, mv: 111.35, energy: 2, concerto: 8, offtune: 8e3 });
var MA37 = sanhuaAction("Mid-air - Frigid Light", { node: 0, cast: 2, type: 4096, mv: 86.29, energy: 0.51, concerto: 1, offtune: 9520 });
var FHA9 = sanhuaAction("Forte Heavy - Detonate", {
  node: 0,
  cast: 3,
  type: 8192,
  mv: 372.58,
  offtune: 14992,
  energy: 4.68,
  concerto: 15,
  // spends whichever Ice Creations are up and queues the matching burst(s)
  updateBuffs: () => {
    if (stacksOf(THORN_BUFF)) {
      queue(DETONATE_THORN);
      removeStack(THORN_BUFF, 1);
    }
    if (stacksOf(PRISM_BUFF)) {
      queue(DETONATE_PRISM);
      removeStack(PRISM_BUFF, 1);
    }
    const glaciers = stacksOf(GLACIER_BUFF);
    for (let i = 0; i < glaciers; i++)
      queue(DETONATE_GLACIER);
    if (glaciers)
      removeStack(GLACIER_BUFF, glaciers);
  }
});
var DETONATE_THORN = sanhuaAction("Forte - Ice Burst (Thorn)", { node: 0, type: 12288, mv: 59.65, energy: 2, concerto: 0 });
var DETONATE_PRISM = sanhuaAction("Forte - Ice Burst (Prism)", { node: 0, type: 12288, mv: 79.53, energy: 7, concerto: 15 });
var DETONATE_GLACIER = sanhuaAction("Forte - Ice Burst (Glacier)", { node: 0, type: 12288, mv: 139.17, energy: 7, concerto: 15 });
var CONDENSATION = new Buff({
  name: "Inherent: Condensation",
  applyStats: () => addStat(
    17,
    20,
    12288
    /* Type1.Skill */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(CONDENSATION);
  }
});
var SH_INHERENT_1 = new Inherent({
  name: "Inherent: Condensation",
  updateBuffs: () => {
    if (currentAction() === Intro30)
      applyCurrent(CONDENSATION, 1);
  }
});
var AVALANCHE = new Buff({
  name: "Inherent: Avalanche",
  applyStats: () => {
    const a = currentAction();
    if (a === DETONATE_THORN || a === DETONATE_PRISM || a === DETONATE_GLACIER)
      addStat(17, 20);
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(AVALANCHE);
  }
});
var SH_INHERENT_2 = new Inherent({
  name: "Inherent: Avalanche",
  updateBuffs: () => {
    if (currentAction() === BA53)
      applyCurrent(AVALANCHE, 1);
  }
});
var S1_CRIT = new Buff({
  name: "Sanhua S1: Solitude's Embrace",
  applyStats: () => addStat(9, 15),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(S1_CRIT);
  }
});
var S4_WINDOW = new Buff({
  name: "Sanhua S4: Blade Mastery",
  applyStats: () => {
    if (currentAction() === FHA9)
      addStat(17, 120);
  },
  convertStats: () => {
    if (currentAction() === FHA9 || casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(S4_WINDOW);
  }
});
var S6_ATK = new Buff({
  name: "Sanhua S6: Daybreak Radiance",
  maxStacks: 2,
  applyStats: () => {
    if (!isHeld(SANHUA_RESONATOR))
      addStat(6, 10 * frozenStacks());
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) && isHeld(SANHUA_RESONATOR))
      revokeTeam(S6_ATK);
  }
});
var THORN_BUFF = new Buff({
  name: "Sanhua: Ice Thorn",
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(THORN_BUFF);
  }
});
var PRISM_BUFF = new Buff({
  name: "Sanhua: Ice Prism",
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(PRISM_BUFF);
  }
});
var GLACIER_BUFF = new Buff({
  name: "Sanhua: Glacier",
  maxStacks: 2,
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(GLACIER_BUFF);
  }
});
var SANHUA_OUTRO = new Buff({
  name: "Sanhua: Outro",
  applyStats: () => addStat(
    18,
    38,
    4096
    /* Type1.Basic */
  ),
  updateBuffs: () => {
    lostOnSwap();
  }
});
var SANHUA_S1 = new Sequence({
  name: "Sanhua S1: Solitude's Embrace",
  updateBuffs: () => {
    if (currentAction() === BA53)
      applyCurrent(S1_CRIT, 1);
  }
});
var SANHUA_S2 = new Sequence({ name: "Sanhua S2: Snowy Clarity" });
var SANHUA_S3 = new Sequence({
  name: "Sanhua S3: Anomalous Vision",
  applyStats: () => addStat(17, 24.5)
});
var SANHUA_S4 = new Sequence({
  name: "Sanhua S4: Blade Mastery",
  updateBuffs: () => {
    if (currentAction() === Liberation22)
      applyCurrent(S4_WINDOW, 1);
  }
});
var SANHUA_S5 = new Sequence({
  name: "Sanhua S5: Unraveling Fate",
  applyStats: () => {
    const a = currentAction();
    if (a === DETONATE_THORN || a === DETONATE_PRISM || a === DETONATE_GLACIER)
      addStat(10, 100);
  },
  updateBuffs: () => {
    if (currentAction() === Liberation22)
      applyCurrent(GLACIER_BUFF, 1);
  }
});
var SANHUA_S6 = new Sequence({
  name: "Sanhua S6: Daybreak Radiance",
  updateBuffs: () => {
    if (currentAction() === DETONATE_PRISM || currentAction() === DETONATE_GLACIER)
      applyTeam(S6_ATK, 1);
  }
});
var SANHUA_RESONATOR = new Resonator({
  name: "Sanhua",
  element: 256,
  weapon: 0,
  intro: () => Intro30,
  outro: () => Outro30,
  color: "#5fc9e8",
  maxEnergy: 125,
  tier: 2,
  constantStats: () => {
    addStat(1, 10063);
    addStat(0, 275);
    addStat(2, 941);
  }
});
var SANHUA_TALENTS = new Talent({
  name: "Sanhua: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(
      17,
      12,
      256
      /* Attribute.Glacio */
    );
  }
});
var SH_ROTATION = new Rotation([
  NOINTRO,
  FHA9,
  INTRO,
  Skill30,
  Liberation22,
  FHA9,
  ECHO_SWAP,
  OUTRO
]);
var SANHUA = new Loadout({
  resonator: SANHUA_RESONATOR,
  talent: SANHUA_TALENTS,
  inherent1: SH_INHERENT_1,
  inherent2: SH_INHERENT_2,
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS, OVERTURE],
  echoLoadouts: [new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    9,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "skill"),
  rotation: SH_ROTATION,
  sequences: [SANHUA_S1, SANHUA_S2, SANHUA_S3, SANHUA_S4, SANHUA_S5, SANHUA_S6]
});

// dist/src/resonators/glacio/suisui.js
function suisuiAction(id, def2) {
  return new Action(id, { element: 256, scaling: 0, ...def2 });
}
var BA130 = suisuiAction("Basic - Zephyr Stance 1", { node: 0, cast: 1, type: 4096, mv: 63.15, energy: 1, concerto: 3.18, offtune: 3176, forte1: 24 });
var BA229 = suisuiAction("Basic - Zephyr Stance 2", { node: 0, cast: 1, type: 4096, mv: 122, energy: 1.92, concerto: 6.14, offtune: 6136, forte1: 46 });
var BA328 = suisuiAction("Basic - Zephyr Stance 3", { node: 0, cast: 1, type: 4096, mv: 139.34, energy: 2.2, concerto: 7.03, offtune: 7010, forte1: 53 });
var BA423 = suisuiAction("Basic - Zephyr Stance 4", { node: 0, cast: 1, type: 4096, mv: 159.08, energy: 2.5, concerto: 8, offtune: 8e3, forte1: 60 });
var MA38 = suisuiAction("Mid-air - Zephyr Stance", { node: 0, cast: 2, type: 4096, mv: 70.72, energy: 1.86, concerto: 5.93, offtune: 5928 });
var DC25 = suisuiAction("Dodge Counter - Zephyr Stance 3", { node: 0, cast: 0, type: 4096, mv: 170.67, energy: 2.7, concerto: 18.6, offtune: 8586, forte1: 30 });
var Skill31 = suisuiAction("Skill - Vernal Screen: Zephyr Stance", { node: 1, cast: 4, type: 12288, mv: 143.16, energy: 2.28, concerto: 7.2, offtune: 7200, forte1: 40 });
var ESkill4 = suisuiAction("Skill - Awakening Spring", {
  node: 1,
  cast: 4,
  type: 12288,
  scaling: 1,
  mv: 28.63,
  energy: 5,
  concerto: 9.6,
  offtune: 9600,
  updateDebuffs: () => {
    applyEnemy(GLACIO_CHAFE, 1);
    applyCurrent(HEALS, 1);
  },
  updateBuffs: () => {
    setForte1(0);
    setForte2(0);
  }
});
var FBA13 = suisuiAction("Basic - Drizzle Stance 1", { node: 2, cast: 1, type: 4096, mv: 78.28, energy: 1.24, concerto: 3.96, offtune: 3936, forte2: 84 });
var FBA23 = suisuiAction("Basic - Drizzle Stance 2", { node: 2, cast: 1, type: 4096, mv: 159.07, energy: 2.5, concerto: 8, offtune: 8e3, forte2: 170 });
var FBA33 = suisuiAction("Basic - Drizzle Stance 3", { node: 2, cast: 1, type: 4096, mv: 165.12, energy: 2.64, concerto: 8.4, offtune: 8304, forte2: 180 });
var FBA43 = suisuiAction("Basic - Drizzle Stance 4", {
  node: 2,
  cast: 1,
  type: 4096,
  mv: 159.05,
  energy: 2.5,
  concerto: 8,
  offtune: 8e3,
  forte2: 170,
  updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1)
});
var FHA10 = suisuiAction("Heavy - Drizzle Stance", { node: 2, cast: 3, type: 8192, mv: 238.59, energy: 3.78, concerto: 12, offtune: 12e3, forte2: 258 });
var FHA24 = suisuiAction("Basic - Illuminating Dew", { node: 2, cast: 1, type: 4096, mv: 104.98, energy: 2.75, concerto: 8.8, offtune: 8800 });
var FMA = suisuiAction("Basic - Swallow's Cut", { node: 2, cast: 1, type: 4096, mv: 107.65, energy: 2.82, concerto: 9.03, offtune: 9024 });
var FSkill8 = suisuiAction("Skill - Vernal Screen: Drizzle Stance", { node: 1, cast: 4, type: 12288, mv: 143.16, energy: 2.27, concerto: 7.2, offtune: 7200, forte2: 100 });
var Liberation23 = suisuiAction("Liberation - Song of Thoroughfare", {
  node: 3,
  cast: 5,
  concerto: 20,
  resetEnergy: true,
  updateBuffs: () => applyTeam(CEASELESS_LANDSCAPE, 1)
});
var Intro31 = suisuiAction("Intro - Tinkling Jade", {
  node: 4,
  cast: 6,
  type: 20480,
  scaling: 1,
  mv: 28.63,
  energy: 10,
  concerto: 19.6,
  offtune: 9600,
  updateDebuffs: () => {
    applyEnemy(GLACIO_CHAFE, 1);
    applyCurrent(HEALS, 1);
  },
  updateBuffs: () => {
    setForte1(0);
    setForte2(0);
  }
});
var Outro31 = suisuiAction("Outro - Rippling Waters", {
  cast: 7,
  concerto: -100,
  active: false,
  forte2: -600,
  updateBuffs: () => {
    if (forte2() > 600)
      setForte2(600);
    applyTeam(RIPPLING_WATERS, 1);
    applyTeam(ROAMING_TRANSCENDENT, 1);
    revokeTeam(TRANSCENDENT_DANCE);
    applyTeam(TRANSCENDENT_DANCE, 3);
  }
});
var LANDSCAPE_CAPS = [
  [
    SPECTRO_FRAZZLE,
    524288
    /* Type2.SpectroFrazzle */
  ],
  [
    FUSION_BURST,
    1048576
    /* Type2.FusionBurst */
  ],
  [
    GLACIO_CHAFE,
    1310720
    /* Type2.GlacioChafe */
  ],
  [
    AERO_EROSION,
    786432
    /* Type2.AeroErosion */
  ]
];
var CEASELESS_LANDSCAPE = new Buff({
  name: "Suisui: Ceaseless Landscape",
  updateGlobal: () => {
    for (const [status, tag] of LANDSCAPE_CAPS) {
      if (applied(status) || isType(tag))
        maxStackIncrease(status, 3);
    }
    if (applied(ELECTRO_FLARE) || isType(
      1572864
      /* Type2.ElectroFlare */
    )) {
      maxStackIncrease(ELECTRO_FLARE, 3);
      maxStackIncrease(ELECTRO_RAGE, 3);
    }
  },
  afterAction: () => {
    if (consumedByMe(HAVOC_BANE))
      applyCurrent(VOID_TIDE, 1);
  }
});
var VOID_TIDE = new Buff({
  name: "Suisui: Ceaseless Landscape (bane)",
  applyStats: () => {
    addStat(
      21,
      6,
      384
      /* Attribute.Havoc */
    );
    addStat(
      20,
      12,
      384
      /* Attribute.Havoc */
    );
  }
});
var RIPPLING_WATERS = new Buff({
  name: "Suisui: Outro",
  applyStats: () => addStat(18, 25)
});
var REFLECTING_SHADOWS = new Buff({ name: "Suisui: Reflecting Shadows" });
var ROAMING_TRANSCENDENT = new Buff({
  name: "Suisui: Roaming Transcendent",
  applyStats: () => {
    if (currentAction().active)
      addStat(17, 12);
  }
});
var TRANSCENDENT_DANCE = new Buff({
  name: "Suisui: Transcendent Dance",
  maxStacks: 3,
  afterAction: () => {
    if (currentTeam().slot.resonator === SUISUI_RESONATOR)
      return;
    const left = stacksOfTeam(TRANSCENDENT_DANCE), banked = concerto();
    const due = left === 3 ? banked >= 100 : left === 2 ? banked >= 50 && banked < 100 : banked >= 100;
    if (!due)
      return;
    if (left === 3)
      queueOutro(UNDULATING_MIST);
    applyEnemy(GLACIO_CHAFE, 1);
    applyCurrent(HEALS, 1);
    removeStackTeam(TRANSCENDENT_DANCE, 1);
  }
});
var UNDULATING_MIST = new Buff({
  name: "Suisui: Undulating Mist",
  maxStacks: 2,
  display: () => `Suisui: Undulating Mist${frozenStacks() >= 2 ? " (consumed)" : ""}`,
  updateBuffs: () => {
    if (!currentAction().active)
      revokeCurrent(UNDULATING_MIST);
  },
  applyStats: () => {
    if (frozenStacks() >= 2)
      addStat(6, 50);
  },
  afterAction: () => {
    if (consumedAny())
      applyCurrent(UNDULATING_MIST, 1);
  }
});
var SS_INHERENT_1 = new Inherent({
  name: "Inherent: Sky Over Water",
  applyStats: () => {
    if (currentAction() !== ESkill4 && currentAction() !== Intro31)
      return;
    addStat(26, 18);
    addStat(25, 13);
    addStat(9, 80);
    addStat(
      17,
      240,
      256
      /* Attribute.Glacio */
    );
    addStat(27, 72e3);
  }
});
var SS_INHERENT_2 = new Inherent({ name: "Inherent: Glimmering Gold" });
var SUISUI_TALENTS = new Talent({
  name: "Suisui: Talents",
  constantStats: () => {
    addStat(7, 12);
    addStat(23, 12);
  }
});
var SUISUI_RESONATOR = new Resonator({
  name: "Suisui",
  element: 256,
  weapon: 4,
  intro: () => Intro31,
  outro: () => Outro31,
  color: "#e8e6a6",
  maxEnergy: 175,
  constantStats: () => {
    addStat(1, 16712.5);
    addStat(0, 287.5);
    addStat(2, 1100);
  }
});
var FBA12342 = new ActionGroup("Basic - Drizzle Stance 1234", [FBA13, FBA23, FBA33, FBA43]);
var BA1235 = new ActionGroup("Basic - Zephyr Stance 123", [BA130, BA229, BA328]);
var SS_ROTATION = new Rotation([
  NOINTRO,
  BA1235,
  ESkill4,
  INTRO,
  FSkill8,
  FBA12342,
  ECHO_CANCEL,
  Liberation23,
  OUTRO
]);
var SUISUI = new Loadout({
  resonator: SUISUI_RESONATOR,
  talent: SUISUI_TALENTS,
  inherent1: SS_INHERENT_1,
  inherent2: SS_INHERENT_2,
  weapons: [FIRSTLIGHTS_HERALD, VARIATION],
  echoLoadouts: [
    new EchoLoadout(FORBIDDEN_BASTION, FEATHERED_TRACE_5PC)
  ],
  mainstats: [mainstats(
    3,
    5,
    5,
    16,
    16
    /* Mainstat.HP1 */
  )],
  substat: chem("hp", "skill", { er: true }),
  rotation: SS_ROTATION
});

// dist/src/resonators/glacio/zhezhi.js
function zhezhiAction(id, def2) {
  return new Action(id, { element: 256, scaling: 0, ...def2 });
}
var BA131 = zhezhiAction("Basic - Dimming Brush 1", { node: 0, cast: 1, type: 4096, mv: 83.52, energy: 1.5, concerto: 4.8, offtune: 4800, forte1: 10 });
var BA230 = zhezhiAction("Basic - Dimming Brush 2", { node: 0, cast: 1, type: 4096, mv: 102.75, energy: 1.85, concerto: 5.95, offtune: 5905, forte1: 15 });
var BA329 = zhezhiAction("Basic - Dimming Brush 3", { node: 0, cast: 1, type: 4096, mv: 133.61, energy: 2.4, concerto: 7.68, offtune: 7680, forte1: 25 });
var MA39 = zhezhiAction("Mid-air - Dimming Brush", { node: 0, cast: 2, type: 4096, mv: 229.53, energy: 3.4, concerto: 10.91, offtune: 10865, forte1: 10 });
var DC26 = zhezhiAction("Dodge Counter - Dimming Brush", { node: 0, cast: 0, type: 4096, mv: 145.35, energy: 2.15, concerto: 20, offtune: 6880, forte1: 15 });
var HA21 = zhezhiAction("Heavy - Dimming Brush", { node: 0, cast: 3, type: 8192, mv: 112.72, energy: 1.67, concerto: 5.34, offtune: 5336, forte1: 15 });
var Skill33 = zhezhiAction("Skill - Manifestation", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 295.26,
  energy: 7.92,
  concerto: 8,
  offtune: 4737,
  forte1: -60
});
var FHA11 = zhezhiAction("Forte Heavy - Conjuration", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 249.03,
  energy: 2.1,
  concerto: 6.69,
  offtune: 6681,
  forte1: -30
});
var FSkill9 = zhezhiAction("Skill - Stroke of Genius", {
  node: 2,
  cast: 4,
  type: 4096,
  mv: 298.22,
  energy: 7,
  concerto: 13,
  offtune: 7736,
  forte2: 1
});
var FSkill32 = zhezhiAction("Forte Skill - Creation's Zenith", {
  node: 2,
  cast: 4,
  type: 4096,
  mv: 357.87,
  energy: 7.02,
  concerto: 13,
  offtune: 10401,
  forte2: -2,
  updateBuffs: () => applyCurrent(IVORY_HERALD, 1)
});
var Liberation24 = zhezhiAction("Liberation - Living Canvas", {
  node: 3,
  cast: 5,
  concerto: 20,
  resetEnergy: true,
  updateBuffs: () => applyTeam(INKLIT_SPIRITS, 21)
});
var INKLIT_FIELD = new ActionField("Zhezhi: Inklit Spirits");
var ACTION_INKLIT = zhezhiAction("Liberation - Inklit Spirit", {
  node: 3,
  type: 4096,
  type2: 262144,
  mv: 65.21,
  offtune: 4572,
  active: false,
  field: INKLIT_FIELD
});
var Intro32 = zhezhiAction("Intro - Radiant Ruin", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 258.48,
  energy: 10.02,
  concerto: 10,
  offtune: 10401,
  forte1: 45
});
var Outro32 = zhezhiAction("Outro - Carve and Draw", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(ZHEZHI_OUTRO)
});
var INKLIT_SPIRITS = coordinatedBuff("Zhezhi: Inklit Spirits", 21, () => ZHEZHI_RESONATOR, ACTION_INKLIT);
var CALLIGRAPHERS_TOUCH = new Buff({
  name: "Inherent: Calligrapher's Touch",
  maxStacks: 3,
  applyStats: () => addStat(6, 6 * frozenStacks())
});
var ZZ_INHERENT_1 = new Inherent({
  name: "Inherent: Calligrapher's Touch",
  updateBuffs: () => {
    const a = currentAction();
    if (a === FSkill9 || a === FSkill32)
      applyCurrent(CALLIGRAPHERS_TOUCH, 1);
  }
});
var IVORY_HERALD = new Buff({
  name: "Zhezhi: Ivory Herald",
  applyStats: () => addStat(
    17,
    18,
    4096
    /* Type1.Basic */
  )
});
var ZHEZHI_OUTRO = new Buff({
  name: "Zhezhi: Outro",
  applyStats: () => {
    addStat(
      18,
      20,
      256
      /* Attribute.Glacio */
    );
    addStat(
      18,
      25,
      12288
      /* Type1.Skill */
    );
  },
  updateBuffs: () => {
    lostOnSwap();
  }
});
var ZZ_FLOURISH = new Buff({
  name: "Inherent: Flourish",
  applyStats: () => {
    addStat(25, 15);
    revokeCurrent(ZZ_FLOURISH);
  }
});
var ZZ_INHERENT_2 = new Inherent({
  name: "Inherent: Flourish",
  updateBuffs: () => {
    if (currentAction() === Outro32) {
      queueOutro(ZZ_FLOURISH);
    }
  }
});
var ZHEZHI_RESONATOR = new Resonator({
  name: "Zhezhi",
  element: 256,
  weapon: 4,
  intro: () => Intro32,
  outro: () => Outro32,
  color: "#8fd3e8",
  maxEnergy: 125,
  constantStats: () => {
    addStat(1, 12250);
    addStat(0, 375);
    addStat(2, 1198);
  }
});
var ZHEZHI_TALENTS = new Talent({
  name: "Zhezhi: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var BA1236 = new ActionGroup("Basic - Dimming Brush 123", [BA131, BA230, BA329]);
var ZZ_ROTATION = new Rotation([
  INTRO,
  ECHO_CANCEL,
  START_2,
  Liberation24,
  SWAP,
  BA1236,
  Skill33,
  FHA11,
  FSkill9,
  FSkill9,
  FSkill32,
  OUTRO
]);
var ZHEZHI_MATRIX_TEAM = new Buff({
  name: "Zhezhi: Matrix (team)",
  applyStats: () => addStat(
    17,
    30,
    12288
    /* Type1.Skill */
  )
});
var ZHEZHI_MATRIX = matrix("Zhezhi", 20, {
  updateBuffs: () => {
    if (casting(
      5
      /* Cast.Liberation */
    ))
      applyTeam(ZHEZHI_MATRIX_TEAM);
  }
});
var ZHEZHI = new Loadout({
  resonator: ZHEZHI_RESONATOR,
  matrix: ZHEZHI_MATRIX,
  talent: ZHEZHI_TALENTS,
  inherent1: ZZ_INHERENT_1,
  inherent2: ZZ_INHERENT_2,
  weapons: [RIME_DRAPED_SPROUTS, COSMIC_RIPPLES, VARIATION, NEW_STD_RECTIFIER, STRINGMASTER, LETHEAN_ELEGY, WHISPERS_OF_SIRENS],
  echoLoadouts: [
    new EchoLoadout(NM_LAMPY, EMPYREAN_ANTHEM_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    9,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: ZZ_ROTATION
});

// dist/src/resonators/havoc/camellya.js
function camellyaAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var BA132 = camellyaAction("Basic - Burgeoning 1", { node: 0, cast: 1, type: 4096, mv: 62.53, energy: 0.93, concerto: 1.85, offtune: 2960, forte1: -6.15 });
var BA231 = camellyaAction("Basic - Burgeoning 2", { node: 0, cast: 1, type: 4096, mv: 92.96, energy: 1.38, concerto: 2.76, offtune: 4400, forte1: -9.14 });
var BA330 = camellyaAction("Basic - Burgeoning 3", { node: 0, cast: 1, type: 4096, mv: 152.1, energy: 2.25, concerto: 4.5, offtune: 7200, forte1: -14.94 });
var BA424 = camellyaAction("Basic - Burgeoning 4 (Hold)", { node: 0, cast: 1, type: 4096, mv: 494, energy: 5.4, concerto: 10.8, offtune: 17280, forte1: -36 });
var BA54 = camellyaAction("Basic - Burgeoning 5", { node: 0, cast: 1, type: 4096, mv: 192.68, energy: 2.88, concerto: 5.72, offtune: 9120, forte1: -18.96 });
var MA40 = camellyaAction("Mid-air - Attack", { node: 0, cast: 2, type: 4096, mv: 131.22, energy: 1.66, concerto: 3.3, offtune: 5280, forte1: -10.96 });
var DC27 = camellyaAction("Dodge Counter - Burgeoning", { node: 0, cast: 0, type: 4096, mv: 298.2, energy: 2.25, concerto: 14.5, offtune: 7200, forte1: -24.9 });
var HA25 = camellyaAction("Heavy - Pruning", { node: 0, cast: 3, type: 4096, mv: 264.42, energy: 3.33, concerto: 6.66, offtune: 10641, forte1: -22.08 });
var CrimsonBlossom = camellyaAction("Skill - Crimson Blossom", {
  node: 1,
  cast: 4,
  type: 4096,
  mv: 227.24,
  concerto: 7,
  energy: 3.18,
  offtune: 10160,
  forte1: -21.1,
  // 113.62% x2
  updateBuffs: () => applyCurrent(BLOSSOM_MODE, 1)
});
var VW1 = camellyaAction("Basic - Vining Waltz 1", { node: 1, cast: 1, type: 4096, mv: 96.33, energy: 1.43, concerto: 2.85, offtune: 4560, forte1: -9.47 });
var VW2 = camellyaAction("Basic - Vining Waltz 2", { node: 1, cast: 1, type: 4096, mv: 91.26, energy: 1.36, concerto: 2.7, offtune: 4320, forte1: -8.98 });
var VW3 = camellyaAction("Basic - Vining Waltz 3", { node: 1, cast: 1, type: 4096, mv: 131.7, energy: 1.44, concerto: 2.88, offtune: 4608, forte1: -9.6 });
var BlazingWaltz = camellyaAction("Basic - Blazing Waltz", { node: 1, cast: 1, type: 4096, mv: 417.05, energy: 4.56, concerto: 9.12, offtune: 14592, forte1: -30.4 });
var VW4 = camellyaAction("Basic - Vining Waltz 4", { node: 1, cast: 1, type: 4096, mv: 202.77, energy: 3, concerto: 6, offtune: 9600, forte1: -19.92 });
var ViningRonde = camellyaAction("Basic - Vining Ronde", { node: 1, cast: 1, type: 4096, mv: 158.85, energy: 2.37, concerto: 4.71, offtune: 7521, forte1: -15.63 });
var Atonement = camellyaAction("Dodge Counter - Atonement", { node: 1, cast: 0, type: 4096, mv: 226.66, energy: 1.36, concerto: 12.7, offtune: 4320, forte1: -18.94 });
var FloralRavage = camellyaAction("Skill - Floral Ravage", { node: 1, cast: 4, type: 4096, mv: 263.05, concerto: 7, energy: 3.7, offtune: 11760, forte1: -24.45 });
var Ephemeral = camellyaAction("Forte Skill - Ephemeral", {
  node: 2,
  cast: 4,
  type: 4096,
  mv: 1262.45,
  forte1: 100,
  concerto: -70,
  energy: 12,
  offtune: 60800,
  updateBuffs: () => {
    setForte1(0);
    if (concerto() > 100)
      setConcerto(100);
    const buds = stacksOf(CRIMSON_BUD);
    revokeCurrent(BUDDING_MODE);
    applyCurrent(BUDDING_MODE, 1 + buds);
    revokeCurrent(CRIMSON_BUD);
  }
});
var Liberation25 = camellyaAction("Liberation - Fervor Efflorescent", { node: 3, cast: 5, type: 16384, mv: 1202.81, concerto: 20, offtune: 84e3, resetEnergy: true });
var Intro33 = camellyaAction("Intro - Everblooming", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 198.81,
  concerto: 10,
  forte1: 100,
  energy: 10,
  offtune: 9600,
  updateBuffs: () => setForte1(0)
});
var Outro33 = camellyaAction("Outro - Twining", { cast: 7, type: 24576, mv: 329.24, concerto: -100, active: false });
var BLOSSOM_MODE = new Buff({
  name: "Camellya: Blossom Mode",
  convertStats: () => {
    if (currentAction() === FloralRavage || currentAction() === ViningRonde)
      revokeCurrent(BLOSSOM_MODE);
  }
});
function inSweetDream(a) {
  return a === BA132 || a === BA231 || a === BA330 || a === BA424 || a === BA54 || a === VW1 || a === VW2 || a === VW3 || a === VW4 || a === BlazingWaltz || a === ViningRonde || a === Atonement || a === CrimsonBlossom || a === FloralRavage;
}
var BUDDING_MODE = new Buff({
  name: "Camellya: Sweet Dream",
  maxStacks: 11,
  applyStats: () => {
    if (inSweetDream(currentAction()))
      addStat(16, 45 + 5 * frozenStacks());
  },
  // two real end conditions: switched off field, and "all Crimson Pistils consumed" — checked
  // after applyStats() already paid out, excluding Ephemeral itself (whose own forte1 pre-clamp to 0
  // would otherwise be mistaken for "ran out" the instant Budding Mode opens)
  convertStats: () => {
    lostOnSwap();
    if (currentAction() !== Ephemeral && forte1() <= 0)
      revokeCurrent(BUDDING_MODE);
  },
  display: () => `Camellya: Sweet Dream +${frozenStacks() - 1} Buds`
});
var CRIMSON_BUD = new Buff({
  name: "Camellya: Crimson Bud",
  maxStacks: 10,
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(CRIMSON_BUD);
  }
});
var SEEDBED = new Inherent({
  name: "Inherent: Seedbed",
  constantStats: () => addStat(
    17,
    15,
    384
    /* Attribute.Havoc */
  )
});
var EPIPHYTE = new Inherent({
  name: "Inherent: Epiphyte",
  constantStats: () => addStat(
    17,
    15,
    4096
    /* Type1.Basic */
  )
});
var CONSUME_CRIMSON_PISTIL = new Buff({
  name: "Camellya: Consume Crimson Pistil",
  applyStats: () => {
    const a = currentAction();
    const before = forte1();
    const after = before + a.forte1;
    const buds = Math.floor((100 - Math.max(0, after)) / 10) - Math.floor((100 - before) / 10);
    if (buds > 0) {
      if (!isHeld(BUDDING_MODE))
        applyCurrent(CRIMSON_BUD, buds);
      addStat(26, 4 * buds);
    }
    addStat(14, isHeld(BUDDING_MODE) ? -100 : 150);
  },
  convertStats: () => revokeCurrent(CONSUME_CRIMSON_PISTIL)
});
var CAMELLYA_RESONATOR = new Resonator({
  name: "Camellya",
  element: 384,
  weapon: 0,
  intro: () => Intro33,
  outro: () => Outro33,
  color: "#e0507a",
  maxEnergy: 125,
  // any gauge-spending cast of hers is a Crimson Pistil consumption
  updateBuffs: () => {
    if (currentAction().forte1 < 0)
      applyCurrent(CONSUME_CRIMSON_PISTIL, 1);
  },
  constantStats: () => {
    addStat(1, 10325);
    addStat(0, 450);
    addStat(2, 1161);
  }
});
var CAMELLYA_TALENTS = new Talent({
  name: "Camellya: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(10, 16);
  }
});
var VW1234_16s = new ActionGroup("Basic - Vining Waltz 123H4", [VW1, VW2, VW3, BlazingWaltz.swap(), VW4.swap()]);
var BA12345 = new ActionGroup("Basic - Burgeoning 1234H5", [BA132, BA231, BA330, BA424, BA54]);
var CM_ROTATION = new Rotation([
  INTRO,
  CrimsonBlossom,
  BA12345,
  Liberation25,
  Ephemeral,
  VW1234_16s,
  FloralRavage,
  OUTRO
]);
var CAMELLYA = new Loadout({
  resonator: CAMELLYA_RESONATOR,
  matrix: matrix("Camellya", 25),
  talent: CAMELLYA_TALENTS,
  inherent1: SEEDBED,
  inherent2: EPIPHYTE,
  weapons: [RED_SPRING, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    14,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: CM_ROTATION
});
var VW1234 = new ActionGroup("Basic - Vining Waltz 123H4", [VW1, VW2, VW3, BlazingWaltz, VW4]);
var CM_ROTATION_DOUBLE = new Rotation([
  DOUBLE_INTRO,
  ECHO_ONFIELD,
  CrimsonBlossom,
  FloralRavage,
  HA25,
  BA424,
  BA54.swap(),
  SWAP,
  INTRO,
  Liberation25,
  Ephemeral,
  CrimsonBlossom,
  VW1234,
  FloralRavage,
  OUTRO
]);
var CAMELLYA_DOUBLE = new Loadout({
  resonator: CAMELLYA_RESONATOR,
  matrix: matrix("Camellya", 25),
  talent: CAMELLYA_TALENTS,
  inherent1: SEEDBED,
  inherent2: EPIPHYTE,
  weapons: [RED_SPRING, EMERALD_OF_GENESIS],
  echoLoadouts: [new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    14,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: CM_ROTATION_DOUBLE
});

// dist/src/resonators/havoc/cantarella.js
function cantaAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var BA133 = cantaAction("Basic - Illusion Collapse 1", { node: 0, cast: 1, type: 4096, mv: 79.53, energy: 1, concerto: 2, offtune: 3200 });
var BA232 = cantaAction("Basic - Illusion Collapse 2", { node: 0, cast: 1, type: 4096, mv: 145.76, energy: 1.84, concerto: 3.68, offtune: 5864 });
var BA331 = cantaAction("Basic - Illusion Collapse 3", { node: 0, cast: 1, type: 4096, mv: 145.14, energy: 1.84, concerto: 3.66, offtune: 5840, forte1: 1 });
var EHA5 = cantaAction("Heavy - Delusive Dive", {
  node: 0,
  cast: 3,
  type: 8192,
  mv: 106.1,
  energy: 1.68,
  concerto: 3.34,
  offtune: 5336,
  // 53.05%x2
  updateBuffs: () => applyCurrent(MIRAGE, 1)
});
var FBA14 = cantaAction("Forte Basic - Phantom Sting 1", { node: 2, cast: 1, type: 4096, mv: 105.99, energy: 1.35, concerto: 2.67, offtune: 4266, forte1: -1, forte2: 1 });
var FBA24 = cantaAction("Forte Basic - Phantom Sting 2", { node: 2, cast: 1, type: 4096, mv: 125.86, energy: 1.6, concerto: 3.18, offtune: 5064, forte1: -1, forte2: 1 });
var FBA34 = cantaAction("Forte Basic - Phantom Sting 3", { node: 2, cast: 1, type: 4096, type2: 262144, mv: 258.48, energy: 3.28, concerto: 6.52, offtune: 10400, forte1: -1, forte2: 1 });
var Skill34 = cantaAction("Skill - Graceful Step", { node: 1, cast: 4, type: 12288, mv: 147.2, energy: 1.56, concerto: 10, offtune: 4936, forte1: 1 });
var ESkill5 = cantaAction("Skill - Flickering Reverie", {
  node: 1,
  cast: 4,
  cast2: 8,
  type: 12288,
  mv: 196.23,
  energy: 1.65,
  concerto: 10,
  offtune: 5264,
  updateBuffs: () => applyCurrent(HAZY_DREAM, 1)
});
var FSkill10 = cantaAction("Forte Skill - Perception Drain", {
  node: 2,
  cast: 4,
  cast2: 8,
  type: 4096,
  mv: 1335.98,
  energy: 21.1,
  concerto: 12,
  offtune: 57864,
  forte2: -3,
  // 667.99%x2
  updateBuffs: () => setForte2(3)
});
var Liberation26 = cantaAction("Liberation - Beneath the Sea", {
  node: 3,
  cast: 5,
  cast2: 8,
  type: 4096,
  mv: 376,
  concerto: 20,
  offtune: 48e3,
  forte1: 3,
  resetEnergy: true,
  updateBuffs: () => applyTeam(DIFFUSION_WINDOW, 21)
});
var DIFFUSION_FIELD = new ActionField("Cantarella: Diffusion");
var ACTION_DIFFUSION = cantaAction("Liberation - Diffusion", { node: 3, type: 4096, type2: 262144, mv: 14.54, active: false, field: DIFFUSION_FIELD });
var Intro34 = cantaAction("Intro - Ripple", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 169,
  energy: 3.16,
  concerto: 10,
  offtune: 10120,
  forte1: 1,
  // 42.25%x4
  updateBuffs: () => applyCurrent(ABYSSAL_REBIRTH, 6)
});
var Outro34 = cantaAction("Outro - Gentle Tentacles", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(CANTARELLA_OUTRO)
});
var ESKILL_JOLT = new Action("Jolt", { node: 1, element: 384, scaling: 0, type: 4096, mv: 198.81 });
var DIFFUSION_WINDOW = coordinatedBuff("Cantarella: Diffusion", 21, () => CANTARELLA_RESONATOR, ACTION_DIFFUSION);
var POISON = new Buff({
  name: "Inherent: Poison",
  maxStacks: 2,
  applyStats: () => addStat(
    17,
    6 * frozenStacks(),
    384
    /* Attribute.Havoc */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(POISON);
  }
});
var ABYSSAL_REBIRTH = new Buff({
  name: "Cantarella: Abyssal Rebirth",
  maxStacks: 6,
  updateGlobal: () => {
    if (!casting(
      8
      /* Cast.Echo */
    ) || frozenStacks() <= 0)
      return;
    removeStack(ABYSSAL_REBIRTH, 1);
    if (currentTeam().slot === currentMember())
      addStat(26, 6);
    else
      setConcerto(concerto() + 6);
  }
});
var MIRAGE = new Buff({
  name: "Cantarella: Mirage",
  updateBuffs: () => {
    if (forte1() <= 0 || casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(MIRAGE);
  }
});
var HAZY_DREAM = new Buff({
  name: "Cantarella: Hazy Dream",
  updateBuffs: () => {
    const a = currentAction();
    if (a === ESkill5 || isType(
      262144
      /* Type2.Coordinated */
    ))
      return;
    revokeCurrent(HAZY_DREAM);
    queue(ESKILL_JOLT);
  }
});
var CANTARELLA_OUTRO = new Buff({
  name: "Cantarella: Outro",
  applyStats: () => {
    addStat(
      18,
      20,
      384
      /* Attribute.Havoc */
    );
    addStat(
      18,
      25,
      12288
      /* Type1.Skill */
    );
  },
  updateBuffs: () => {
    lostOnSwap();
  }
});
var CA_INHERENT_1 = new Inherent({
  name: 'Inherent: "Cure"',
  constantStats: () => {
    addStat(23, 20);
  }
});
var CA_INHERENT_2 = new Inherent({
  name: 'Inherent: "Poison"',
  updateBuffs: () => {
    if (casting(
      8
      /* Cast.Echo */
    ))
      applyCurrent(POISON, 1);
  }
});
var CANTARELLA_RESONATOR = new Resonator({
  name: "Cantarella",
  element: 384,
  weapon: 4,
  intro: () => Intro34,
  outro: () => Outro34,
  color: "#7c6fd6",
  maxEnergy: 125,
  updateDebuffs: () => {
    const a = currentAction();
    if (a === FBA14 || a === FBA24 || a === FBA34 || a === FSkill10)
      applyCurrent(HEALS, 1);
  },
  constantStats: () => {
    addStat(1, 11600);
    addStat(0, 400);
    addStat(2, 1100);
  }
});
var CANTARELLA_TALENTS = new Talent({
  name: "Cantarella: Talents",
  constantStats: () => {
    addStat(9, 8);
    addStat(6, 12);
  }
});
var FBA123 = new ActionGroup("Forte Basic - Phantom Sting 123", [FBA14, FBA24, FBA34]);
var CA_ROTATION = new Rotation([
  INTRO,
  BA331,
  Skill34,
  ECHO_CANCEL,
  Liberation26,
  EHA5,
  ESkill5,
  FBA123,
  FSkill10,
  OUTRO
]);
var CANTARELLA = new Loadout({
  resonator: CANTARELLA_RESONATOR,
  matrix: matrix("Cantarella", 25),
  talent: CANTARELLA_TALENTS,
  inherent1: CA_INHERENT_1,
  inherent2: CA_INHERENT_2,
  weapons: [WHISPERS_OF_SIRENS, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER, LETHEAN_ELEGY, RIME_DRAPED_SPROUTS],
  echoLoadouts: [
    new EchoLoadout(NM_HERON, MIDNIGHT_VEIL_5PC),
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(HECATE, EMPYREAN_ANTHEM_5PC),
    new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    14,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: CA_ROTATION
});

// dist/src/resonators/havoc/chisa.js
function chisaAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var Intro35 = chisaAction("Intro - Reverberance - Return", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 95.43,
  energy: 10,
  concerto: 10,
  offtune: 6400,
  forte1: 20,
  // Resonant Thread of Closure is a 20s team buff — CLAUDE.md's own rule for one that short is
  // "lost on the applier's next intro", not left permanent
  updateBuffs: () => revokeTeam(RESONANT_THREAD_OF_CLOSURE)
});
var Outro35 = chisaAction("Outro - Unraveling - Law Zero", {
  cast: 7,
  active: false,
  concerto: -100,
  updateBuffs: () => applyTeam(RESONANT_THREAD_OF_CLOSURE, 1)
});
var spendRing = () => ({ updateBuffs: () => applyCurrent(RING_CONSUMED, -currentAction().forte2) });
var MARK_SNARE = { updateDebuffs: () => applyEnemy(UNSEEN_SNARE, 1) };
var SNIP_HEAL = { updateDebuffs: () => applyCurrent(HEALS, 1) };
var BA134 = chisaAction("Basic - Reign of Silence 1", { node: 0, cast: 1, type: 4096, mv: 33.42, energy: 0.7, concerto: 1.4, offtune: 2240, forte1: 4 });
var BA233 = chisaAction("Basic - Reign of Silence 2", { node: 0, cast: 1, type: 4096, mv: 95.45, energy: 2, concerto: 4, offtune: 6400, forte1: 14 });
var DodgeCounterBA2 = chisaAction("Dodge Counter - Reign of Silence 2", { node: 0, cast: 0, type: 4096, mv: 238.59, energy: 5, concerto: 10, offtune: 11200, forte1: 23 });
var BA332 = chisaAction("Basic - Rending Lunge", { node: 0, cast: 1, type: 4096, mv: 151.1, energy: 3.19, concerto: 6.37, offtune: 10137, forte1: 20 });
var DeathSnip = chisaAction("Basic - Death Snip", { node: 0, cast: 1, type: 16384, mv: 149.06, energy: 2.09, concerto: 4.18, offtune: 6665, forte1: 18, ...SNIP_HEAL });
var DeathSnipSpread = chisaAction("Basic - Death Snip With Spread", { node: 0, cast: 1, type: 16384, mv: 196.84, energy: 2.76, concerto: 5.52, offtune: 8801, forte1: 27, ...SNIP_HEAL });
var ThreadWithdrawn = chisaAction("Basic - Thread Withdrawn", { node: 0, cast: 1, type: 4096, mv: 67.65, energy: 1.44, concerto: 2.85, offtune: 4538, forte1: 16 });
var ReignOfSilenceMidAir = chisaAction("Mid-air - Reign of Silence", { node: 0, cast: 2, type: 4096, mv: 73.96, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 9 });
var HA26 = chisaAction("Heavy - Reign of Silence", { node: 0, cast: 3, type: 8192, mv: 71.58, energy: 1.5, concerto: 3, offtune: 4800, forte1: 10 });
var SeveredFacet = chisaAction("Heavy - Severed Facet (Mid-Air)", { node: 0, cast: 3, type: 8192, mv: 89.48, energy: 1.88, concerto: 3.76, offtune: 6e3, forte1: 12 });
var HangingFinality = chisaAction("Basic - Hanging Finality", { node: 0, cast: 1, type: 4096, mv: 119.3, energy: 2.5, concerto: 5, offtune: 8e3, forte1: 16 });
var Skill35 = chisaAction("Skill - Eye of Unraveling", { node: 1, cast: 4, type: 12288, mv: 35.79, energy: 0.75, concerto: 1.5, offtune: 2400, forte1: 5, ...MARK_SNARE });
var SERRATED = {
  applyStats: () => {
    if (forte1() > 100)
      setForte1(100);
  },
  updateDebuffs: () => applyEnemy(UNSEEN_SNARE, 1)
};
var SerratedLoop = chisaAction("Skill - Serrated Loop", { node: 1, cast: 4, type: 12288, mv: 139.6, energy: 2.96, concerto: 5.92, offtune: 9360, forte1: -100, forte2: 100, ...SERRATED });
var SerratedLoopHalfHold = chisaAction("Skill - Serrated Loop (Half Hold)", { node: 1, cast: 4, type: 12288, mv: 199.28, energy: 4.24, concerto: 8.48, offtune: 13368, forte1: -100, forte2: 100, ...SERRATED });
var SerratedLoopHold = chisaAction("Skill - Serrated Loop (Hold)", { node: 1, cast: 4, type: 12288, mv: 258.96, energy: 5.52, concerto: 11.04, offtune: 17376, forte1: -100, forte2: 100, ...SERRATED });
var Liberation27 = chisaAction("Liberation - Moment of Nihility", {
  node: 3,
  cast: 5,
  type: 16384,
  resetEnergy: true,
  mv: 954.29,
  concerto: 20,
  offtune: 96e3,
  forte1: 40,
  updateDebuffs: () => applyCurrent(HEALS, 1),
  updateBuffs: () => applyCurrent(WOVEN_MYRIAD_CONVERGENCE, 1)
});
var Blitz1 = chisaAction("Forte - Sawring Blitz 1", { node: 2, type: 16384, mv: 68.94, energy: 1.02, concerto: 1.98, offtune: 3084, forte2: -18, ...spendRing() });
var Blitz2 = chisaAction("Forte - Sawring Blitz 2", { node: 2, type: 16384, mv: 85.12, energy: 1.2, concerto: 2.4, offtune: 3808, forte2: -22, ...spendRing() });
var Blitz2Discordance = chisaAction("Forte - Sawring Blitz 2 Discordance", { node: 2, type: 16384, mv: 10.74, energy: 0.15, concerto: 0.3, offtune: 480, forte2: -3, ...spendRing() });
var Blitz2Hold = chisaAction("Forte - Sawring Blitz 2 (Hold)", { node: 2, type: 16384, mv: 191.52, energy: 2.7, concerto: 5.4, offtune: 8568, forte2: -52, ...spendRing() });
var Blitz3 = chisaAction("Forte - Sawring Blitz 3", { node: 2, type: 16384, mv: 127.84, energy: 1.84, concerto: 3.6, offtune: 5720, forte2: -26, ...spendRing() });
var Blitz3Falltone = chisaAction("Forte - Sawring Blitz 3 Falltone", { node: 2, type: 16384, mv: 10.74, energy: 0.15, concerto: 0.3, offtune: 480, forte2: -3, ...spendRing() });
var Blitz3Hold = chisaAction("Forte - Sawring Blitz 3 (Hold)", { node: 2, type: 16384, mv: 223.72, energy: 3.22, concerto: 6.3, offtune: 10010, forte2: -50, ...spendRing() });
var Eradication = chisaAction("Forte - Sawring Eradication", {
  node: 2,
  type: 16384,
  mv: 257.67,
  energy: 22.4,
  concerto: 49.8,
  offtune: 7680,
  updateDebuffs: () => {
    applyCurrent(SHIELD, 1);
    setForte2(0);
  }
});
var WOVEN_MYRIAD_CONVERGENCE = new Buff({
  name: "Chisa: Woven Myriad - Convergence",
  applyStats: () => {
    if ([Blitz1, Blitz2, Blitz2Discordance, Blitz2Hold, Blitz3, Blitz3Falltone, Blitz3Hold, Eradication].includes(currentAction())) {
      addStat(16, 120);
    }
  },
  convertStats: () => {
    if (currentAction() === Eradication)
      revokeCurrent(WOVEN_MYRIAD_CONVERGENCE);
  }
});
var RING_CONSUMED = new Buff({
  name: "Chisa: Ring of Chainsaw Consumed",
  maxStacks: 100,
  applyStats: () => {
    if (currentAction() === Eradication)
      addStat(16, 2.59 * frozenStacks());
  },
  convertStats: () => {
    if (currentAction() === Eradication)
      revokeCurrent(RING_CONSUMED);
  }
});
var ALL_ENDS_HERE = new Buff({
  name: "Inherent: All Ends Here",
  applyStats: () => {
    addStat(
      17,
      20,
      384
      /* Attribute.Havoc */
    );
    addStat(23, 20);
  },
  convertStats: () => {
    if (currentAction() === Outro35)
      revokeCurrent(ALL_ENDS_HERE);
  }
});
var UNSEEN_SNARE = new Debuff({
  name: "Chisa: Unseen Snare",
  // The Bane is hers, not the swinging teammate's: applyEnemy() here inherits this marker's own
  // source (context.ts's `attribute()`), so an "on inflicting a Negative Status" passive worn by that
  // teammate — Kumokiri, Thread of Severed Fate — reads 0 for it and doesn't pay out. See
  // `appliedByMe()`, which is what every such passive checks.
  //
  // updateDebuffs, not updateGlobal, even though it fires off everyone's casts: this is an enemy-
  // pool Debuff, so its updateDebuffs already runs on every member's action, and that phase is
  // ahead of *all* updateGlobal. From updateGlobal the enemy pool goes last of the three, so the
  // Bane landed after every cross-slot watcher had already looked — including her own sonata (see
  // THREAD_OF_SEVERED_FATE_3PC), which could never see it.
  updateDebuffs: () => {
    if (currentAction().mv > 0)
      applyEnemy(HAVOC_BANE, 1);
  }
});
var NEGATIVE_STATUS_CAPS = [HAVOC_BANE, GLACIO_CHAFE, ELECTRO_FLARE, FUSION_BURST, AERO_EROSION, SPECTRO_FRAZZLE, ELECTRO_RAGE];
var RESONANT_THREAD_OF_CLOSURE = new Buff({
  name: "Chisa: Outro",
  updateGlobal: () => {
    if (currentAction().mv > 0)
      for (const d of NEGATIVE_STATUS_CAPS)
        maxStackIncrease(d, 3);
    if (inflictedNegativeStatus() || isType(
      32768
      /* Type1.Status */
    )) {
      applyCurrent(THREAD_OF_BANE, 1);
    }
  }
});
var THREAD_OF_BANE = new Buff({
  name: "Chisa: Thread of Bane",
  applyStats: () => {
    if (stacksOfEnemy(UNSEEN_SNARE) > 0)
      addStat(21, 18);
  }
});
var CS_INHERENT_1 = new Inherent({ name: "Inherent: Inescapable Fate" });
var CS_INHERENT_2 = new Inherent({
  name: "Inherent: All Ends Here",
  updateBuffs: () => {
    if (currentAction() === Intro35 || currentAction() === Liberation27)
      applyCurrent(ALL_ENDS_HERE, 1);
  }
});
var CHISA_TALENTS = new Talent({
  name: "Chisa: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var CHISA_RESONATOR = new Resonator({
  name: "Chisa",
  element: 384,
  weapon: 1,
  intro: () => Intro35,
  outro: () => Outro35,
  color: "#8a3b47",
  maxEnergy: 125,
  constantStats: () => {
    addStat(1, 10775);
    addStat(0, 437.5);
    addStat(2, 1136.6646);
  }
});
var CS_ROTATION = new Rotation([
  START_2,
  START_3,
  Skill35,
  SWAP,
  NOINTRO,
  Skill35,
  BA332,
  DeathSnipSpread,
  ThreadWithdrawn,
  Liberation27,
  SerratedLoop,
  Blitz2Hold,
  Blitz3Hold,
  Eradication,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  Skill35,
  BA332,
  DeathSnipSpread,
  Liberation27,
  SerratedLoop,
  Blitz2Hold,
  Blitz3Hold,
  Eradication,
  ECHO_SWAP,
  OUTRO
]);
var CS_ECHOES = [
  new EchoLoadout(THRENODIAN_LEVIATHAN, THREAD_OF_SEVERED_FATE_3PC, HAVOC_ECLIPSE_2PC),
  new EchoLoadout(FALLACY, THREAD_OF_SEVERED_FATE_3PC, REJUV_2PC),
  new EchoLoadout(HERON, THREAD_OF_SEVERED_FATE_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(BELL_BORNE_GEOCHELONE, THREAD_OF_SEVERED_FATE_3PC, MOONLIT_CLOUDS_2PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(BELL_BORNE_GEOCHELONE, REJUV_5PC),
  new EchoLoadout(FALLACY, REJUV_5PC)
];
var CHISA = new Loadout({
  resonator: CHISA_RESONATOR,
  talent: CHISA_TALENTS,
  inherent1: CS_INHERENT_1,
  inherent2: CS_INHERENT_2,
  weapons: [KUMOKIRI, LUSTROUS_RAZOR, NEW_STD_BRAUDBLADE, DISCORD, WILDFIRE_MARK],
  echoLoadouts: CS_ECHOES,
  mainstats: mainstatOptions(
    1,
    0,
    6,
    14,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: CS_ROTATION
});

// dist/src/resonators/havoc/danjin.js
function danjinAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var BA135 = danjinAction("Basic - Execution 1", { node: 0, cast: 1, type: 4096, mv: 57.26, energy: 0.9, concerto: 1.08, offtune: 1680 });
var BA235 = danjinAction("Basic - Execution 2", { node: 0, cast: 1, type: 4096, mv: 58.85, energy: 0.92, concerto: 1.11, offtune: 2960 });
var BA333 = danjinAction("Basic - Execution 3", { node: 0, cast: 1, type: 4096, mv: 79.53, energy: 1.25, concerto: 1.5, offtune: 3120 });
var MA41 = danjinAction("Mid-air - Execution", { node: 0, cast: 2, type: 4096, mv: 98.61, energy: 0.51, concerto: 1, offtune: 9600 });
var HA27 = danjinAction("Heavy - Execution", { node: 0, cast: 3, type: 8192, mv: 111.36, energy: 1.74, concerto: 2.1, offtune: 5358 });
var DC28 = danjinAction("Dodge Counter - Ruby Shades", { node: 0, cast: 0, type: 4096, mv: 190.86, energy: 3, concerto: 11.8, offtune: 4800 });
var CarmineGleam = danjinAction("Skill - Carmine Gleam", { node: 1, cast: 4, type: 12288, mv: 76.36, forte1: 10.5, energy: 1.2, offtune: 2960, concerto: 8 });
var CrimsonErosion1 = danjinAction("Skill - Crimson Erosion 1", { node: 1, cast: 4, type: 12288, mv: 128.84, forte1: 10.5, energy: 2.5, offtune: 4240, concerto: 8 });
var CrimsonErosion2 = danjinAction("Skill - Crimson Erosion 2", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 119.3,
  forte1: 10.5,
  energy: 2.5,
  offtune: 4e3,
  concerto: 8,
  // 59.65% x2
  updateBuffs: () => applyEnemy(INCINERATING_WILL, 1)
});
var SanguinePulse1 = danjinAction("Skill - Sanguine Pulse 1", { node: 1, cast: 4, type: 12288, mv: 112.14, forte1: 13.5, energy: 3, offtune: 3760, concerto: 8 });
var SanguinePulse2 = danjinAction("Skill - Sanguine Pulse 2", { node: 1, cast: 4, type: 12288, mv: 128.85, forte1: 13.5, energy: 3, offtune: 4230, concerto: 8 });
var SanguinePulse3 = danjinAction("Skill - Sanguine Pulse 3", { node: 1, cast: 4, type: 12288, mv: 193.26, forte1: 13.5, energy: 3.75, offtune: 6360, concerto: 8 });
var Chaoscleave = danjinAction("Forte Heavy - Chaoscleave", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 417.55,
  forte1: -60,
  energy: 14,
  concerto: 50,
  offtune: 11578,
  // 59.65% x7
  updateDebuffs: () => applyCurrent(HEALS, 1)
});
var Scatterbloom = danjinAction("Heavy - Scatterbloom", { node: 2, cast: 3, type: 8192, mv: 178.93, energy: 6, offtune: 5360 });
var FullChaoscleave = danjinAction("Forte Heavy - Chaoscleave (Full Energy)", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 1002.05,
  forte1: -120,
  energy: 14,
  concerto: 50,
  offtune: 11578,
  // 143.15% x7
  updateDebuffs: () => applyCurrent(HEALS, 1)
});
var FullScatterbloom = danjinAction("Heavy - Scatterbloom (Full Energy)", { node: 2, cast: 3, type: 8192, mv: 429.43, energy: 6, offtune: 5360 });
var Liberation28 = danjinAction("Liberation - Crimson Bloom", { node: 3, cast: 5, type: 16384, mv: 785.37, concerto: 20, offtune: 61440, resetEnergy: true });
var Intro36 = danjinAction("Intro - Vindication", { node: 4, cast: 6, type: 20480, mv: 198.84, energy: 10, concerto: 10, offtune: 12240 });
var Outro36 = danjinAction("Outro - Duality", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(DANJIN_OUTRO)
});
var INCINERATING_WILL = new Debuff({
  name: "Danjin: Incinerating Will",
  applyStats: () => {
    if (isHeld(DANJIN_RESONATOR))
      addStat(17, 20);
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ) && isHeld(DANJIN_RESONATOR))
      revokeEnemy(INCINERATING_WILL);
  }
});
var OVERFLOW = new Buff({
  name: "Inherent: Overflow",
  applyStats: () => addStat(
    17,
    30,
    8192
    /* Type1.Heavy */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(OVERFLOW);
  }
});
var DJ_INHERENT_OVERFLOW = new Inherent({
  name: "Inherent: Overflow",
  updateBuffs: () => {
    if (currentAction() === SanguinePulse3)
      applyCurrent(OVERFLOW, 1);
  }
});
var CRIMSON_LIGHT = new Buff({
  name: "Inherent: Crimson Light",
  applyStats: () => {
    if (currentAction() === CrimsonErosion1) {
      addStat(17, 20);
      addStat(29, CrimsonErosion1.forte1);
    }
  },
  updateBuffs: () => {
    if (currentAction() !== CrimsonErosion1)
      revokeCurrent(CRIMSON_LIGHT);
  }
});
var DJ_INHERENT_CRIMSON_LIGHT = new Inherent({
  name: "Inherent: Crimson Light",
  updateBuffs: () => {
    if (currentAction() === DC28)
      applyCurrent(CRIMSON_LIGHT, 1);
  }
});
var DANJIN_OUTRO = new Buff({
  name: "Danjin: Outro",
  applyStats: () => addStat(
    18,
    23,
    384
    /* Attribute.Havoc */
  ),
  updateBuffs: () => {
    lostOnSwap();
  }
});
var DANJIN_RESONATOR = new Resonator({
  name: "Danjin",
  element: 384,
  weapon: 0,
  intro: () => Intro36,
  outro: () => Outro36,
  color: "#a83250",
  maxEnergy: 100,
  tier: 2,
  constantStats: () => {
    addStat(1, 9438);
    addStat(0, 263);
    addStat(2, 1149);
  }
});
var DANJIN_TALENTS = new Talent({
  name: "Danjin: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(
      17,
      12,
      384
      /* Attribute.Havoc */
    );
  }
});
var DJ_S1_STACKS = new Buff({
  name: "Danjin S1: Crimson Heart of Justice",
  maxStacks: 6,
  applyStats: () => addStat(6, 5 * frozenStacks()),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(DJ_S1_STACKS);
  }
});
var DJ_S1 = new Sequence({
  name: "Danjin S1: Crimson Heart of Justice",
  updateBuffs: () => {
    if (stacksOfEnemy(INCINERATING_WILL))
      applyCurrent(DJ_S1_STACKS, 1);
  }
});
var DJ_S2 = new Sequence({
  name: "Danjin S2: Dusted Mirror",
  applyStats: () => {
    if (stacksOfEnemy(INCINERATING_WILL))
      addStat(17, 20);
  }
});
var DJ_S3 = new Sequence({
  name: "Danjin S3: Fleeting Blossom",
  applyStats: () => addStat(
    17,
    30,
    16384
    /* Type1.Liberation */
  )
});
var DJ_S4_ACTIVE = new Buff({
  name: "Danjin S4: Solitary Carnation",
  applyStats: () => addStat(9, 15)
});
var DJ_S4 = new Sequence({
  name: "Danjin S4: Solitary Carnation",
  updateBuffs: () => {
    const a = currentAction();
    if (forte1() > 60)
      applyCurrent(DJ_S4_ACTIVE, 1);
    else if (a !== Chaoscleave && a !== FullChaoscleave && a !== Scatterbloom && a !== FullScatterbloom)
      revokeCurrent(DJ_S4_ACTIVE);
  }
});
var DJ_S5 = new Sequence({
  name: "Danjin S5: Reigning Blade",
  applyStats: () => addStat(
    17,
    30,
    384
    /* Attribute.Havoc */
  )
});
var DJ_S6_TEAM = new Buff({
  name: "Danjin S6: Bloodied Jade (team)",
  applyStats: () => addStat(6, 20),
  convertStats: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) && isHeld(DANJIN_RESONATOR))
      revokeTeam(DJ_S6_TEAM);
  }
});
var DJ_S6 = new Sequence({
  name: "Danjin S6: Bloodied Jade",
  updateBuffs: () => {
    if (currentAction() === Chaoscleave || currentAction() === FullChaoscleave)
      applyTeam(DJ_S6_TEAM, 1);
  }
});
var DJ_ROTATION = new Rotation([
  START_3,
  Liberation28,
  SWAP,
  INTRO,
  CrimsonErosion1,
  CrimsonErosion2,
  Liberation28,
  CarmineGleam,
  BA235,
  BA333,
  SanguinePulse1,
  SanguinePulse2,
  SanguinePulse3,
  Chaoscleave,
  Scatterbloom,
  ECHO_SWAP,
  OUTRO
]);
var DANJIN = new Loadout({
  resonator: DANJIN_RESONATOR,
  talent: DANJIN_TALENTS,
  inherent1: DJ_INHERENT_OVERFLOW,
  inherent2: DJ_INHERENT_CRIMSON_LIGHT,
  weapons: [EMERALD_SENTENCE, EMERALD_OF_GENESIS, BLAZING_BRILLIANCE],
  echoLoadouts: [
    new EchoLoadout(NM_HERON, MIDNIGHT_VEIL_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(CROWNLESS, HAVOC_ECLIPSE_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    14,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "heavy"),
  rotation: DJ_ROTATION,
  sequences: [DJ_S1, DJ_S2, DJ_S3, DJ_S4, DJ_S5, DJ_S6]
});

// dist/src/resonators/havoc/roccia.js
function rocciaAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var BA136 = rocciaAction("Basic - Pero, Easy 1", { node: 0, cast: 1, type: 4096, mv: 73.18, energy: 1.09, concerto: 3.47, offtune: 3464, forte1: 19 });
var BA236 = rocciaAction("Basic - Pero, Easy 2", { node: 0, cast: 1, type: 4096, mv: 114.42, energy: 1.71, concerto: 5.43, offtune: 5418, forte1: 33 });
var BA334 = rocciaAction("Basic - Pero, Easy 3", { node: 0, cast: 1, type: 4096, mv: 169, energy: 2.5, concerto: 8, offtune: 8e3, forte1: 49 });
var BA425 = rocciaAction("Basic - Pero, Easy 4", { node: 0, cast: 1, type: 4096, mv: 208.38, energy: 3.1, concerto: 9.88, offtune: 9864, forte1: 100 });
var MA44 = rocciaAction("Mid-air - Pero, Easy", { node: 0, cast: 2, type: 4096, mv: 104.78, energy: 1.55, concerto: 4.96, offtune: 4960, forte1: 38 });
var DC29 = rocciaAction("Dodge Counter - Pero, Easy", { node: 0, cast: 0, type: 4096, mv: 206.7, offtune: 4986, concerto: 15.01, energy: 1.56 });
var HA28 = rocciaAction("Heavy - Pero, Easy", { node: 0, cast: 3, type: 8192, mv: 168.99, energy: 2.5, concerto: 8, offtune: 8e3, forte1: 100 });
var Skill36 = rocciaAction("Skill - Acrobatic Trick", { node: 1, cast: 4, type: 12288, mv: 491.76, energy: 14, concerto: 20, offtune: 10992, forte1: 100 });
var FBA15 = rocciaAction("Forte Basic - Real Fantasy 1", { node: 2, cast: 1, type: 8192, mv: 322.08, energy: 8, concerto: 10, offtune: 7200, forte1: -100 });
var FBA25 = rocciaAction("Forte Basic - Real Fantasy 2", { node: 2, cast: 1, type: 8192, mv: 339.97, energy: 8, concerto: 16, offtune: 7600, forte1: -100 });
var FBA35 = rocciaAction("Forte Basic - Real Fantasy 3", { node: 2, cast: 1, type: 8192, mv: 357.86, energy: 8, concerto: 25, offtune: 8e3, forte1: -100 });
var Liberation29 = rocciaAction("Liberation - Commedia Improvviso!", {
  node: 3,
  cast: 5,
  type: 8192,
  mv: 835.02,
  concerto: 20,
  offtune: 96e3,
  resetEnergy: true,
  updateBuffs: () => applyTeam(COMMEDIA_TEAM_ATK)
});
var Intro37 = rocciaAction("Intro - Pero, Help", { node: 4, cast: 6, type: 20480, mv: 168.99, energy: 10, concerto: 10, offtune: 10824, forte1: 100 });
var Outro37 = rocciaAction("Outro - Applause, Please!", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(APPLAUSE_HANDOFF)
});
var MAGIC_BOX = rocciaAction("Utility - Super Attractive Magic Box", {
  cast: 8,
  type: 53248,
  scaling: 5,
  mv: 100
});
var IMMERSIVE_PERFORMANCE = new Buff({
  name: "Inherent: Immersive Performance",
  applyStats: () => addStat(6, 20),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(IMMERSIVE_PERFORMANCE);
  }
});
var RC_INHERENT_1 = new Inherent({
  name: "Inherent: Immersive Performance",
  updateBuffs: () => {
    if (casting(
      4
      /* Cast.Skill */
    ) || casting(
      3
      /* Cast.Heavy */
    ))
      applyCurrent(IMMERSIVE_PERFORMANCE, 1);
  }
});
var COMMEDIA_TEAM_ATK = new Buff({
  name: "Roccia: Commedia Improvviso!",
  applyStats: () => addStat(3, 200)
});
var APPLAUSE_HANDOFF = new Buff({
  name: "Roccia: Outro",
  applyStats: () => {
    addStat(
      18,
      20,
      384
      /* Attribute.Havoc */
    );
    addStat(
      18,
      25,
      4096
      /* Type1.Basic */
    );
  },
  updateBuffs: () => {
    lostOnSwap();
  }
});
var RC_INHERENT_2 = new Inherent({
  name: "Inherent: Super Attractive Magic Box",
  updateGlobal: () => {
    const acting = currentTeam().slot;
    if (casting(
      6
      /* Cast.Intro */
    ) && acting.isHeld(APPLAUSE_HANDOFF))
      queueOn(acting.resonator, MAGIC_BOX);
  }
});
var ROCCIA_RESONATOR = new Resonator({
  name: "Roccia",
  element: 384,
  weapon: 3,
  intro: () => Intro37,
  outro: () => Outro37,
  color: "#9634b2",
  maxEnergy: 125,
  constantStats: () => {
    addStat(1, 12250);
    addStat(0, 375);
    addStat(2, 1198);
  }
});
var ROCCIA_TALENTS = new Talent({
  name: "Roccia: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(10, 16);
  }
});
var FBA1232 = new ActionGroup("Forte Basic - Real Fantasy 123", [FBA15, FBA25, FBA35]);
var RC_ROTATION = new Rotation([
  START_3,
  Liberation29,
  SWAP,
  INTRO,
  BA425,
  Liberation29,
  Skill36,
  FBA1232,
  ECHO_SWAP,
  OUTRO
]);
var ROCCIA_MATRIX_TEAM = new Buff({
  name: "Roccia: Matrix (team)",
  applyStats: () => addStat(
    17,
    20,
    384
    /* Attribute.Havoc */
  )
});
var ROCCIA_MATRIX = matrix("Roccia", 20, {
  updateBuffs: () => {
    if (casting(
      5
      /* Cast.Liberation */
    ))
      applyTeam(ROCCIA_MATRIX_TEAM);
  }
});
var ROCCIA = new Loadout({
  resonator: ROCCIA_RESONATOR,
  matrix: ROCCIA_MATRIX,
  talent: ROCCIA_TALENTS,
  inherent1: RC_INHERENT_1,
  inherent2: RC_INHERENT_2,
  weapons: [TRAGICOMEDY, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [
    new EchoLoadout(NM_HERON, MIDNIGHT_VEIL_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    14,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "heavy"),
  rotation: RC_ROTATION
});

// dist/src/resonators/havoc/rover_havoc.js
function roverAction3(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var BA137 = roverAction3("Basic - Tuneslayer 1", { node: 0, cast: 1, type: 4096, mv: 56.67, energy: 0.6, concerto: 0.74, offtune: 2400, forte1: 3 });
var BA237 = roverAction3("Basic - Tuneslayer 2", { node: 0, cast: 1, type: 4096, mv: 113.34, energy: 1.2, concerto: 1.48, offtune: 4800, forte1: 6 });
var BA335 = roverAction3("Basic - Tuneslayer 3", { node: 0, cast: 1, type: 4096, mv: 85, energy: 0.9, concerto: 1.11, offtune: 2800, forte1: 4 });
var BA426 = roverAction3("Basic - Tuneslayer 4", { node: 0, cast: 1, type: 4096, mv: 120.9, energy: 1.26, concerto: 1.56, offtune: 5121, forte1: 9 });
var BA55 = roverAction3("Basic - Tuneslayer 5", { node: 0, cast: 1, type: 4096, mv: 188.88, energy: 2, concerto: 2.48, offtune: 8e3, forte1: 10 });
var MA45 = roverAction3("Mid-air - Attack", { node: 0, cast: 2, type: 4096, mv: 117.1, energy: 0.41, concerto: 1, offtune: 9600, forte1: 9 });
var DC30 = roverAction3("Dodge Counter - Tuneslayer", { node: 0, cast: 0, type: 4096, mv: 179.43, energy: 1.9, concerto: 10.86, offtune: 4640 });
var HA29 = roverAction3("Heavy - Attack", { node: 0, cast: 3, type: 8192, mv: 95.43, energy: 0.96, concerto: 1.19, offtune: 5360 });
var Devastation = roverAction3("Forte Heavy - Devastation", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 228.14,
  energy: 1.7,
  offtune: 56320,
  forte1: -100,
  updateBuffs: () => applyCurrent(DARK_SURGE, 1)
});
var EBA14 = roverAction3("Basic - Umbra 1", { node: 2, cast: 1, type: 4096, mv: 56.37, energy: 0.42, concerto: 0.72, offtune: 1440 });
var EBA24 = roverAction3("Basic - Umbra 2", { node: 2, cast: 1, type: 4096, mv: 93.94, energy: 0.7, concerto: 1.2, offtune: 2560 });
var EBA34 = roverAction3("Basic - Umbra 3", { node: 2, cast: 1, type: 4096, mv: 155.67, energy: 1.16, concerto: 1.98, offtune: 4480 });
var EBA44 = roverAction3("Basic - Umbra 4", { node: 2, cast: 1, type: 4096, mv: 222.78, energy: 1.64, concerto: 2.83, offtune: 13280 });
var EBA52 = roverAction3("Basic - Umbra 5", {
  node: 2,
  cast: 1,
  type: 4096,
  mv: 228.15,
  energy: 1.7,
  concerto: 1.81,
  offtune: 56320,
  updateDebuffs: () => applyCurrent(HEALS, 1)
});
var EMA2 = roverAction3("Basic - Umbra Plunge", { node: 2, cast: 1, type: 4096, mv: 123.27, energy: 0.41, concerto: 1, offtune: 9600 });
var EDC4 = roverAction3("Dodge Counter - Umbra", { node: 2, cast: 0, type: 4096, mv: 316.71, energy: 2.36, concerto: 11.98, offtune: 4640 });
var EHA6 = roverAction3("Heavy - Umbra", { node: 2, cast: 3, type: 8192, mv: 128.83, energy: 0.96, concerto: 1.64, offtune: 6400 });
var EHA22 = roverAction3("Heavy - Umbra: Thwackblade", { node: 2, cast: 3, type: 8192, mv: 166.45, energy: 1.24, concerto: 2.12, offtune: 8704 });
var Skill37 = roverAction3("Skill - Wingblade", { node: 1, cast: 4, type: 12288, mv: 572.58, energy: 12, concerto: 15, offtune: 8640, forte1: 39 });
var ESkill6 = roverAction3("Skill - Umbra: Lifetaker", { node: 2, cast: 4, type: 12288, mv: 592.5, energy: 8, concerto: 15, offtune: 11664, forte1: 39 });
var Liberation30 = roverAction3("Liberation - Deadening Abyss", { node: 3, cast: 5, type: 16384, mv: 1520.9, concerto: 20, offtune: 53760, resetEnergy: true });
var Intro38 = roverAction3("Intro - Instant of Annihilation", { node: 4, cast: 6, type: 20480, forte1: 29, mv: 198.81, energy: 10, concerto: 10, offtune: 1867 });
var Outro38 = roverAction3("Outro - Soundweaver", { cast: 7, type: 24576, mv: 429.9, concerto: -100, active: false });
var DARK_SURGE = new Buff({
  name: "Havoc Rover: Dark Surge",
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(DARK_SURGE);
  }
});
var RH_INHERENT_1 = new Inherent({
  name: "Inherent: Metamorph",
  applyStats: () => {
    if (isHeld(DARK_SURGE))
      addStat(
        17,
        20,
        384
        /* Attribute.Havoc */
      );
  }
});
var RH_INHERENT_2 = new Inherent({
  name: "Inherent: Bleak Crescendo",
  applyStats: () => {
    if (isHeld(DARK_SURGE) && (casting(
      1
      /* Cast.Basic */
    ) || casting(
      2
      /* Cast.MidAir */
    ))) {
      addStat(25, 1);
    }
  }
});
var S4_RES_SHRED = new Debuff({
  name: "Havoc Rover S4: Annihilated Silence",
  applyStats: () => addEnemyStat(
    34,
    10,
    384
    /* Attribute.Havoc */
  ),
  convertStats: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) && isHeld(ROVER_HAVOC_RESONATOR))
      revokeEnemy(S4_RES_SHRED);
  }
});
var ROVER_HAVOC_RESONATOR = new Resonator({
  name: "Havoc Rover",
  element: 384,
  weapon: 0,
  intro: () => Intro38,
  outro: () => Outro38,
  color: "#7c6fd6",
  maxEnergy: 125,
  tier: 2,
  constantStats: () => {
    addStat(1, 10825);
    addStat(0, 413);
    addStat(2, 1259);
  }
});
var ROVER_TALENTS = new Talent({
  name: "Havoc Rover: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(
      17,
      12,
      384
      /* Attribute.Havoc */
    );
  }
});
var ROVER_S1 = new Sequence({
  name: "Havoc Rover S1: Cryptic Insight",
  applyStats: () => addStat(
    17,
    30,
    12288
    /* Type1.Skill */
  )
});
var ROVER_S2 = new Sequence({ name: "Havoc Rover S2: Waning Crescent" });
var ROVER_S3 = new Sequence({ name: "Havoc Rover S3: Surging Resonance" });
var ROVER_S4 = new Sequence({
  name: "Havoc Rover S4: Annihilated Silence",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Devastation || a === Liberation30)
      applyEnemy(S4_RES_SHRED, 1);
  }
});
var ROVER_S5 = new Sequence({
  name: "Havoc Rover S5: Aeon Symphony",
  applyStats: () => {
    if (currentAction() === EBA52)
      addStat(16, 50);
  }
});
var ROVER_S6 = new Sequence({
  name: "Havoc Rover S6: Ebbing Undercurrent",
  applyStats: () => {
    if (isHeld(DARK_SURGE))
      addStat(9, 25);
  }
});
var BA123452 = new ActionGroup("Basic - Tuneslayer 12345", [BA137, BA237, BA335, BA426, BA55]);
var EBA12345 = new ActionGroup("Forte Basic - Umbra 12345", [EBA14, EBA24, EBA34, EBA44, EBA52]);
var RH_ROTATION = new Rotation([
  INTRO,
  BA123452,
  Skill37,
  Devastation,
  ESkill6,
  EBA12345,
  START_3,
  START_2,
  Liberation30,
  SWAP,
  ECHO_SWAP,
  OUTRO
]);
var ROVER_HAVOC = new Loadout({
  resonator: ROVER_HAVOC_RESONATOR,
  talent: ROVER_TALENTS,
  inherent1: RH_INHERENT_1,
  inherent2: RH_INHERENT_2,
  weapons: [RED_SPRING, EMERALD_OF_GENESIS, BLAZING_BRILLIANCE],
  echoLoadouts: [new EchoLoadout(NM_CROWNLESS, HAVOC_ECLIPSE_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    14,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: RH_ROTATION,
  sequences: [ROVER_S1, ROVER_S2, ROVER_S3, ROVER_S4, ROVER_S5, ROVER_S6]
});

// dist/src/resonators/havoc/xuanling.js
function yangyangAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var FLOW = {
  updateDebuffs: () => {
    if (!isHeld(ONE_WITH_THE_WIND))
      return;
    applyEnemy(HAVOC_BANE, 6);
    revokeCurrent(ONE_WITH_THE_WIND);
  },
  updateBuffs: () => {
    if (forte1() < 0)
      setForte1(0);
    if (!isHeld(VOICE_UPON_VOICE))
      return;
    queue(ShadowOfXuanling);
    revokeCurrent(VOICE_UPON_VOICE);
  },
  afterAction: () => {
    if (forte1() < 0)
      setForte1(0);
    consume(HAVOC_BANE, 1);
  }
};
var BA_A1 = yangyangAction("Basic - Azure Sword Stance 1", { node: 0, cast: 1, type: 4096, mv: 47.72, energy: 0.75, concerto: 1.5, offtune: 2400, forte1: -12 });
var BA_A2 = yangyangAction("Basic - Azure Sword Stance 2", { node: 0, cast: 1, type: 4096, mv: 100.69, energy: 1.59, concerto: 3.18, offtune: 5065, forte1: -24 });
var BA_A3 = yangyangAction("Basic - Azure Sword Stance 3", { node: 0, cast: 1, type: 4096, mv: 100.69, energy: 1.59, concerto: 3.17, offtune: 5065, forte1: -26 });
var BA_A4 = yangyangAction("Basic - Azure Sword Stance 4", {
  node: 0,
  cast: 1,
  type: 4096,
  mv: 185.63,
  energy: 2.94,
  concerto: 5.85,
  offtune: 9337,
  forte1: -48,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, 1)
});
var MA_A = yangyangAction("Mid-air - Azure Sword Stance", { node: 0, cast: 2, type: 4096, mv: 98.61, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: -12 });
var DC_A = yangyangAction("Dodge Counter - Azure Sword Stance 2", { node: 0, cast: 0, type: 4096, mv: 196.13, energy: 3.09, concerto: 16.18, offtune: 9865, forte1: -24 });
var BA_F1 = yangyangAction("Basic - Feather Sword Stance 1", { node: 0, cast: 1, type: 4096, mv: 79.54, energy: 1.26, concerto: 2.5, offtune: 4e3, forte1: -12 });
var BA_F2 = yangyangAction("Basic - Feather Sword Stance 2", { node: 0, cast: 1, type: 4096, mv: 100.68, energy: 1.59, concerto: 3.18, offtune: 5064, forte1: -24 });
var BA_F3 = yangyangAction("Basic - Feather Sword Stance 3", { node: 0, cast: 1, type: 4096, mv: 74.29, energy: 1.19, concerto: 2.36, offtune: 3738, forte1: -26 });
var BA_F4 = yangyangAction("Basic - Feather Sword Stance 4", {
  node: 0,
  cast: 1,
  type: 4096,
  mv: 238.59,
  energy: 3.76,
  concerto: 7.5,
  offtune: 12e3,
  forte1: -48,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, 1)
});
var MA_F = yangyangAction("Mid-air - Feather Sword Stance", { node: 0, cast: 2, type: 4096, mv: 98.61, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: -12 });
var DC_F = yangyangAction("Dodge Counter - Feather Sword Stance 2", { node: 0, cast: 0, type: 4096, mv: 196.11, energy: 3.09, concerto: 16.18, offtune: 9864, forte1: -24 });
var SwitchAzure = yangyangAction("Skill - Sword Stance Switch: Azure", { node: 1, cast: 4, type: 8192, mv: 116.6, energy: 1.85, concerto: 3.67, offtune: 5865 });
var SwitchFeather = yangyangAction("Skill - Sword Stance Switch: Feather", { node: 1, cast: 4, type: 8192, mv: 100.68, energy: 1.59, concerto: 3.18, offtune: 5064 });
var FlowAzure = yangyangAction("Skill - Sword Stance Flow: Azure", {
  node: 2,
  cast: 4,
  type: 8192,
  mv: 116.6,
  energy: 11.61,
  concerto: 10.02,
  offtune: 5865,
  forte2: 1,
  forte1: 100,
  ...FLOW
});
var FlowFeather = yangyangAction("Skill - Sword Stance Flow: Feather", {
  node: 2,
  cast: 4,
  type: 8192,
  mv: 100.68,
  energy: 11.61,
  concerto: 10.02,
  offtune: 5064,
  forte2: 1,
  forte1: 100,
  ...FLOW
});
var HeavyAzure = yangyangAction("Forte Heavy - Azure Sword Stance", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 450.53,
  energy: 9.34,
  concerto: 15,
  offtune: 10666,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, 2),
  updateBuffs: () => applyCurrent(BATED_BREATH, 1),
  afterAction: () => setForte2(0)
});
var HeavyFeather = yangyangAction("Heavy - Feather Sword Stance", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 217.05,
  energy: 1.87,
  concerto: 4.67,
  offtune: 7465,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, 2),
  updateBuffs: () => applyCurrent(STREAMING_STORM, 1)
});
var FeatherFall = yangyangAction("Forte Mid-air - Feather Fall", {
  node: 2,
  cast: 2,
  type: 8192,
  mv: 110.97,
  energy: 1.26,
  concerto: 3.12,
  offtune: 4962,
  afterAction: () => setForte2(0)
});
var HiB1 = yangyangAction("Basic - Havoc in Bloom 1", { node: 2, cast: 1, type: 8192, mv: 119.37, energy: 1.35, concerto: 3.36, offtune: 5337 });
var HiB2 = yangyangAction("Basic - Havoc in Bloom 2", { node: 2, cast: 1, type: 8192, mv: 223.13, energy: 2.5, concerto: 6.26, offtune: 9977 });
var HiB3 = yangyangAction("Basic - Havoc in Bloom 3", { node: 2, cast: 1, type: 8192, mv: 399.59, energy: 2.67, concerto: 12.67, offtune: 10665 });
var Lib6 = yangyangAction("Liberation - Hush of a Thousand Voices", {
  node: 3,
  cast: 5,
  type: 8192,
  mv: 1988.1,
  concerto: 20,
  offtune: 136400,
  forte1: -100,
  forte2: 1,
  resetEnergy: true,
  // One Life, One Blade's own first line: the hit raises Havoc Bane to the target's limit, which
  // is the fight's rather than the declared 3 (Chisa's +3 to every Negative Status cap)
  updateDebuffs: () => applyEnemy(HAVOC_BANE, currentTeam().enemyMax(HAVOC_BANE)),
  updateBuffs: () => applyCurrent(VOICE_UPON_VOICE, 1),
  applyStats: () => {
    setForte1(100);
  }
});
var ShadowOfXuanling = yangyangAction("Liberation - Shadow of Xuanling", { node: 3, type: 8192, mv: 337.98 });
var Intro39 = yangyangAction("Intro - Skybound Feather", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 116.59,
  energy: 10,
  concerto: 10,
  offtune: 5864,
  forte2: 1,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, 1)
});
var Outro39 = yangyangAction("Outro - As the Wind Wills", {
  cast: 7,
  type: 24576,
  mv: 300,
  concerto: -100,
  active: false,
  updateBuffs: () => applyTeam(TONAL_SWITCH, 1)
});
var FEATHER_HEAVIES = [HeavyFeather, FeatherFall, HiB1, HiB2, HiB3];
var OATH_ACTIONS = /* @__PURE__ */ new Set([HeavyAzure, ...FEATHER_HEAVIES]);
var STORM_ACTIONS = new Set(FEATHER_HEAVIES);
var FEATHERED_OATH = new Buff({
  name: "Xuanling: Feathered Oath",
  maxStacks: 6,
  // Stage 3 is the cast the window lapses *on*, so it is dropped here, a phase ahead of any
  // applyStats — Stage 3 itself pays nothing. The grant runs earlier still (the Resonator's own
  // updateGlobal), so a Bane landing on this very cast re-arms it before this looks.
  updateBuffs: () => {
    if (currentAction() === HiB3 && !applied(HAVOC_BANE))
      revokeCurrent(FEATHERED_OATH);
  },
  applyStats: () => {
    if (OATH_ACTIONS.has(currentAction()))
      addStat(10, 25 * frozenStacks());
  },
  // the outro is the other end of it, and nothing it pays is in OATH_ACTIONS, so that one is an
  // ordinary pay-then-drop like every short window in this file
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(FEATHERED_OATH);
  }
});
var BATED_BREATH = new Buff({
  name: "Xuanling: Bated Breath",
  maxStacks: 2,
  display: () => `Xuanling: Bated Breath${frozenStacks() === 1 ? "" : " (cooldown)"}`,
  applyStats: () => {
    if (frozenStacks() === 1 && currentAction() === HeavyAzure)
      addStat(10, 160);
  },
  // "when Heavy Attack - Azure Sword Stance ends, Bated Breath is removed" — the window closes on
  // the very cast that opened it, so spending it is a step onto the cooldown stack, not a revoke
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(BATED_BREATH);
    else if (frozenStacks() === 1 && currentAction() === HeavyAzure)
      applyCurrent(BATED_BREATH, 1);
  }
});
var STREAMING_STORM = new Buff({
  name: "Xuanling: Streaming Storm",
  maxStacks: 2,
  display: () => `Xuanling: Streaming Storm${frozenStacks() === 1 ? "" : " (cooldown)"}`,
  applyStats: () => {
    if (frozenStacks() === 1 && STORM_ACTIONS.has(currentAction()))
      addStat(10, 160);
  },
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(STREAMING_STORM);
    else if (frozenStacks() === 1 && currentAction() === HiB3)
      applyCurrent(STREAMING_STORM, 1);
  }
});
var WINDBOUND = new Buff({ name: "Xuanling: Windbound", maxStacks: 6 });
var ONE_WITH_THE_WIND = new Buff({ name: "Xuanling: One with the Wind" });
var VOICE_UPON_VOICE = new Buff({
  name: "Xuanling: Voice upon Voice"
});
var TONAL_SWITCH = new Buff({
  name: "Xuanling: Tonal Switch",
  updateBuffs: () => {
    if (currentTeam().slot.resonator === XUANLING_RESONATOR)
      return;
    if (appliedByMe(HAVOC_BANE))
      applyCurrent(TONAL_SWITCH_AMP, 1);
  }
});
var TONAL_SWITCH_AMP = new Buff({
  name: "Xuanling: Outro",
  applyStats: () => addStat(
    18,
    20,
    384
    /* Attribute.Havoc */
  )
});
var XUANLING_INHERENT_1 = new Inherent({
  name: "Inherent: Unbroken Vow",
  applyStats: () => {
    const bane = stacksOfEnemy(HAVOC_BANE);
    if (bane === 0)
      return;
    addStat(18, bane <= 3 ? 10 * bane : 30 + (bane - 3) * 12);
  }
});
var XUANLING_INHERENT_2 = new Inherent({
  name: "Inherent: One Life, One Blade",
  updateGlobal: () => {
    if (!applied(HAVOC_BANE) || isHeld(ONE_WITH_THE_WIND))
      return;
    if (applyCurrent(WINDBOUND, 1) < 6)
      return;
    revokeCurrent(WINDBOUND);
    applyCurrent(ONE_WITH_THE_WIND, 1);
  }
});
var XUANLING_TALENTS = new Talent({
  name: "Xuanling: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var XUANLING_RESONATOR = new Resonator({
  name: "Xuanling",
  element: 384,
  weapon: 0,
  intro: () => Intro39,
  outro: () => Outro39,
  color: "#8e05c8",
  maxEnergy: 125,
  /* Feathered Oath is Forte Circuit machinery, which lives on the Resonator rather than a loadout
   * slot of its own. Same trigger as Windbound above and the same `updateGlobal` reason: it counts
   * Havoc Bane inflicted by anyone on the team, her own casts included. */
  updateGlobal: () => {
    if (applied(HAVOC_BANE))
      applyCurrent(FEATHERED_OATH, 1);
  },
  /* Melody starts a fight full, unlike every other gauge in this engine. */
  combatStart: () => setForte1(100),
  applyStats: () => {
    if (currentAction().node === 0 && forte1() > 0)
      addStat(14, 20);
  },
  constantStats: () => {
    addStat(1, 11025);
    addStat(0, 425);
    addStat(2, 1148.89);
  }
});
var BA_F1234 = new ActionGroup("Basic - Feather Sword Stance 1234", [BA_F1, BA_F2, BA_F3, BA_F4]);
var HiB123 = new ActionGroup("Forte Basic: Havoc in Bloom 123", [HiB1, HiB2, HiB3]);
var XUANLING_ROTATION = new Rotation([
  START_3,
  SwitchFeather,
  SWAP,
  // start in feather stance, so the first cast is a switch to Azure
  INTRO,
  BA_F1234,
  FlowAzure,
  HeavyAzure,
  Lib6,
  FlowFeather,
  HeavyFeather,
  FeatherFall,
  HiB123,
  ECHO_SWAP,
  OUTRO
]);
var XUANLING_ECHOES = [
  new EchoLoadout(THOUSAND_PUPPET_PAVILION, FEATHERED_TRACE_5PC)
];
var XUANLING = new Loadout({
  resonator: XUANLING_RESONATOR,
  talent: XUANLING_TALENTS,
  inherent1: XUANLING_INHERENT_1,
  inherent2: XUANLING_INHERENT_2,
  weapons: [AZURE_OATH, EMERALD_OF_GENESIS],
  echoLoadouts: XUANLING_ECHOES,
  mainstats: mainstatOptions(
    0,
    1,
    6,
    14,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "heavy"),
  rotation: XUANLING_ROTATION
});

// dist/src/resonators/spectro/jinhsi.js
function jinhsiAction(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA138 = jinhsiAction("Basic - Slash of Breaking Dawn 1", { node: 0, cast: 1, type: 4096, mv: 66.47, energy: 1.24, concerto: 2.48, offtune: 3960 });
var BA238 = jinhsiAction("Basic - Slash of Breaking Dawn 2", { node: 0, cast: 1, type: 4096, mv: 97.49, energy: 1.84, concerto: 3.65, offtune: 5810 });
var BA336 = jinhsiAction("Basic - Slash of Breaking Dawn 3", { node: 0, cast: 1, type: 4096, mv: 106.49, energy: 2, concerto: 3.99, offtune: 6349 });
var BA427 = jinhsiAction("Basic - Slash of Breaking Dawn 4", { node: 0, cast: 1, type: 4096, mv: 157.72, energy: 2.95, concerto: 5.89, offtune: 9400 });
var HA30 = jinhsiAction("Heavy - Slash of Breaking Dawn", { node: 0, cast: 3, type: 8192, mv: 238.6, energy: 4, concerto: 8, offtune: 12800 });
var MA46 = jinhsiAction("Mid-air - Slash of Breaking Dawn", { node: 0, cast: 2, type: 4096, mv: 123.28, energy: 0.54, concerto: 1, offtune: 4960 });
var DC31 = jinhsiAction("Dodge Counter - Slash of Breaking Dawn", { node: 0, cast: 0, type: 4096, mv: 146.78, energy: 2.78, concerto: 15.49, offtune: 8749 });
var Skill38 = jinhsiAction("Skill - Trailing Lights of Eons", { node: 1, cast: 4, type: 12288, mv: 155.68, energy: 2.21, concerto: 4.38, offtune: 6960 });
var ESkill7 = jinhsiAction("Skill - Overflowing Radiance", {
  node: 1,
  cast: 4,
  type: 12288,
  mv: 197.29,
  energy: 1.29,
  concerto: 4,
  offtune: 3974,
  updateBuffs: () => applyCurrent(INCARNATION, 1)
});
var IncBA1 = jinhsiAction("Basic - Incarnation 1", { node: 2, cast: 1, type: 12288, mv: 88.62, energy: 1.24, concerto: 1.24, offtune: 3960 });
var IncBA2 = jinhsiAction("Basic - Incarnation 2", { node: 2, cast: 1, type: 12288, mv: 129.95, energy: 1.83, concerto: 1.83, offtune: 5809 });
var IncBA3 = jinhsiAction("Basic - Incarnation 3", { node: 2, cast: 1, type: 12288, mv: 165.74, energy: 2.32, concerto: 2.32, offtune: 7409 });
var IncBA4 = jinhsiAction("Forte Basic - Incarnation 4", {
  node: 2,
  cast: 1,
  type: 12288,
  mv: 186.69,
  energy: 2.67,
  concerto: 2.67,
  offtune: 8348,
  updateBuffs: () => {
    revokeCurrent(INCARNATION);
    applyCurrent(ORDINATION_GLOW, 1);
  }
});
var IncHeavy = jinhsiAction("Heavy - Incarnation", { node: 2, cast: 3, type: 8192, mv: 159.06, energy: 2, concerto: 2, offtune: 6400 });
var IncDodge = jinhsiAction("Dodge Counter - Incarnation", { node: 2, cast: 0, type: 4096, mv: 219.44, concerto: 13.08, offtune: 9810 });
var CrescentDivinity = jinhsiAction("Skill - Crescent Divinity", { node: 2, cast: 4, type: 12288, mv: 503.8, energy: 3.19, concerto: 8, offtune: 10138 });
var SolarFlare = jinhsiAction("Forte Skill - Illuminous Epiphany: Solar Flare", {
  node: 2,
  cast: 4,
  type: 12288,
  mv: 119.34,
  energy: 1.98,
  concerto: 20,
  offtune: 14400,
  updateBuffs: () => {
    revokeCurrent(ORDINATION_GLOW);
    if (!isHeld(UNISON_COOLDOWN)) {
      applyCurrent(UNISON, 1);
      applyCurrent(UNISON_COOLDOWN, 1);
    }
    queue(StellaGlamor);
  }
});
var StellaGlamor = jinhsiAction("Forte - Illuminous Epiphany: Stella Glamor", { node: 2, type: 12288, mv: 347.92, energy: 5.67, offtune: 42002 });
var Liberation31 = jinhsiAction("Liberation - Purge of Light", { node: 3, cast: 5, type: 16384, mv: 1666.03, concerto: 20, offtune: 84e3, resetEnergy: true });
var Intro40 = jinhsiAction("Intro - Loong's Halo", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 159.05,
  energy: 10,
  concerto: 10,
  offtune: 8e3
});
var Outro40 = jinhsiAction("Outro - Temporal Bender", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => {
    if ((stacksOf(ERAS_IN_UNITY) & 3) < 2)
      applyCurrent(ERAS_IN_UNITY, 1);
  },
  // Unison pays for this one and is spent by it; the outro that has none is the one far enough
  // past the grant's own 25s limit for the next Illuminous Epiphany to hand another over.
  convertStats: () => {
    if (isHeld(UNISON))
      revokeCurrent(UNISON);
    else
      revokeCurrent(UNISON_COOLDOWN);
  }
});
var INCARNATION = new Buff({ name: "Jinhsi: Incarnation" });
var ORDINATION_GLOW = new Buff({ name: "Jinhsi: Ordination Glow" });
var UNISON = new Buff({
  name: "Jinhsi: Unison",
  applyStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      addStat(26, 100);
  }
});
var UNISON_COOLDOWN = new Buff({ name: "Jinhsi: Unison Cooldown" });
var ERAS_IN_UNITY = new Buff({
  name: "Jinhsi: Eras in Unity",
  maxStacks: 1073741823,
  display: () => (frozenStacks() & 3) === 2 ? "Eras in Unity (outro)" : "Eras in Unity",
  updateGlobal: () => {
    const a = currentAction();
    if (a.scaling === 3)
      return;
    let word = stacksOf(ERAS_IN_UNITY);
    if (a.active && !triggeredAction()) {
      for (let shift = 2; shift < 30; shift += 2) {
        if (word >> shift & 3)
          word -= 1 << shift;
      }
    }
    if (a.element && a.mv > 0) {
      const shift = 2 + 4 * ((a.element >> 6) - 1);
      if (!(word >> shift & 3)) {
        word |= ((word & 3) === 2 ? 1 : 3) << shift;
        applyCurrent(INCANDESCENCE, 1);
      }
      if (isType(
        262144
        /* Type2.Coordinated */
      ) && !(word >> shift + 2 & 3)) {
        word |= ((word & 3) === 2 ? 1 : 3) << shift + 2;
        applyCurrent(INCANDESCENCE, 2);
      }
    }
    setStacksSelf(ERAS_IN_UNITY, word);
  }
});
var INCANDESCENCE = new Buff({
  name: "Jinhsi: Incandescence",
  maxStacks: 50,
  applyStats: () => {
    if (currentAction() === StellaGlamor)
      addStat(15, 44.54 * frozenStacks());
  },
  convertStats: () => {
    if (currentAction() === StellaGlamor)
      revokeCurrent(INCANDESCENCE);
  }
});
var RADIANT_SURGE = new Inherent({
  name: "Inherent: Radiant Surge",
  constantStats: () => addStat(
    17,
    20,
    320
    /* Attribute.Spectro */
  )
});
var CONVERGED_FLASH = new Inherent({
  name: "Inherent: Converged Flash",
  applyStats: () => {
    if (currentAction() === Intro40)
      addStat(16, 50);
  }
});
var HERALD_OF_REVIVAL = new Buff({
  name: "Jinhsi S1: Herald of Revival",
  maxStacks: 4,
  applyStats: () => {
    const a = currentAction();
    if (a === SolarFlare || a === StellaGlamor)
      addStat(17, 20 * frozenStacks());
  },
  convertStats: () => {
    if (currentAction() === StellaGlamor)
      revokeCurrent(HERALD_OF_REVIVAL);
  }
});
var JX_S1 = new Sequence({
  name: "Jinhsi S1: Abyssal Ascension",
  updateBuffs: () => {
    const a = currentAction();
    if (a === IncBA1 || a === IncBA2 || a === IncBA3 || a === IncBA4 || a === CrescentDivinity) {
      applyCurrent(HERALD_OF_REVIVAL, 1);
    }
  }
});
var JX_S2 = new Sequence({
  name: "Jinhsi S2: Chronofrost Repose",
  combatStart: () => {
    applyCurrent(INCANDESCENCE, 50);
  }
});
var IMMORTALS_DESCENDANCY = new Buff({
  name: "Jinhsi S3: Immortal's Descendancy",
  maxStacks: 2,
  applyStats: () => addStat(6, 25 * frozenStacks())
});
var JX_S3 = new Sequence({
  name: "Jinhsi S3: Celestial Incarnate",
  updateBuffs: () => {
    if (currentAction() === Intro40)
      applyCurrent(IMMORTALS_DESCENDANCY, 1);
  }
});
var JX_S4_TEAM = new Buff({
  name: "Jinhsi S4: Benevolent Grace (team)",
  applyStats: () => addStat(17, 20)
});
var JX_S4 = new Sequence({
  name: "Jinhsi S4: Benevolent Grace",
  // Solar Flare is the press; Stella Glamor is the detonation behind it, not a second cast
  updateBuffs: () => {
    const a = currentAction();
    if (a === Liberation31 || a === SolarFlare)
      applyTeam(JX_S4_TEAM, 1);
  }
});
var JX_S5 = new Sequence({
  name: "Jinhsi S5: Frostfire Illumination",
  applyStats: () => {
    if (currentAction() === Liberation31)
      addStat(16, 120);
  }
});
var JX_S6 = new Sequence({
  name: "Jinhsi S6: Thawing Triumph",
  applyStats: () => {
    const a = currentAction();
    if (a === SolarFlare || a === StellaGlamor)
      addStat(16, 45);
  }
});
var JINHSI_TALENTS = new Talent({
  name: "Jinhsi: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var JINHSI_RESONATOR = new Resonator({
  name: "Jinhsi",
  element: 320,
  weapon: 1,
  intro: () => Intro40,
  outro: () => Outro40,
  color: "#f2c75c",
  maxEnergy: 150,
  // Eras in Unity is hers the moment she is on the team, well before her first turn
  combatStart: () => applyCurrent(ERAS_IN_UNITY, 1),
  constantStats: () => {
    addStat(1, 10825);
    addStat(0, 412.5);
    addStat(2, 1258.9);
  }
});
var IncBA123 = new ActionGroup("Basic - Incarnation 123", [IncBA1, IncBA2, IncBA3]);
var JX_ROTATION2 = new Rotation([
  START_3,
  Liberation31,
  SWAP,
  DOUBLE_INTRO,
  ESkill7,
  IncBA123,
  CrescentDivinity,
  IncBA4,
  SolarFlare,
  Skill38.swap(),
  OUTRO,
  INTRO,
  ECHO_ONFIELD,
  ESkill7,
  IncBA123,
  CrescentDivinity,
  IncBA4,
  SolarFlare,
  Liberation31,
  Skill38.swap(),
  OUTRO
]);
var JX_ECHOES = [
  new EchoLoadout(JUE, CELESTIAL_LIGHT_5PC)
];
var JINHSI = new Loadout({
  resonator: JINHSI_RESONATOR,
  talent: JINHSI_TALENTS,
  inherent1: RADIANT_SURGE,
  inherent2: CONVERGED_FLASH,
  weapons: [AGES_OF_HARVEST, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: JX_ECHOES,
  matrix: matrix("Jinhsi", 25),
  sequences: [JX_S1, JX_S2, JX_S3, JX_S4, JX_S5, JX_S6],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    13,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "skill"),
  rotation: JX_ROTATION2
});

// dist/src/resonators/spectro/luuk.js
function luukAction(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA139 = luukAction("Basic - Such is Light 1", { node: 0, cast: 1, type: 4096, mv: 81.12, energy: 1.2, concerto: 2.4, offtune: 3840, forte1: 12 });
var BA239 = luukAction("Basic - Such is Light 2", { node: 0, cast: 1, type: 4096, mv: 150.4, energy: 2.23, concerto: 4.45, offtune: 7120, forte1: 22.25 });
var BA337 = luukAction("Basic - Such is Light 3", { node: 0, cast: 1, type: 4096, mv: 150.6, energy: 2.4, concerto: 4.5, offtune: 7110, forte1: 22.5 });
var BA428 = luukAction("Basic - Such is Light 4", { node: 0, cast: 1, type: 4096, mv: 96.33, energy: 1.43, concerto: 2.85, offtune: 4560, forte1: 14.25 });
var HA31 = luukAction("Heavy - Such is Light", { node: 0, cast: 3, type: 8192, mv: 91.26, energy: 1.35, concerto: 2.7, offtune: 4320, forte1: 13.5 });
var DC32 = luukAction("Dodge Counter - Such is Light", { node: 0, cast: 0, type: 4096, mv: 251.8, energy: 2.24, concerto: 17.46, offtune: 7120, forte1: 11.13 });
var MA113 = luukAction("Mid-air - Such is Light 1", { node: 0, cast: 2, type: 4096, mv: 57.46, energy: 0.85, concerto: 1.7, offtune: 2720, forte1: 8.5 });
var MA210 = luukAction("Mid-air - Scythe: Dissection 2", { node: 0, cast: 2, type: 4096, mv: 94.09, energy: 1.4, concerto: 2.5, offtune: 4e3, forte1: 12.5 });
var MA310 = luukAction("Mid-air - Scythe: Dissection 3", { node: 0, cast: 2, type: 4096, mv: 143.1, energy: 2.73, concerto: 3.96, offtune: 6320, forte1: 19.76 });
var STRAIN = { updateDebuffs: () => applyStrain() };
var MA2R = luukAction("Mid-air - Scythe: Resection 2", { node: 0, cast: 2, type: 4096, mv: 100.84, energy: 1.5, concerto: 2.7, offtune: 4320, forte1: 13.5, ...STRAIN });
var MA3R = luukAction("Mid-air - Scythe: Resection 3", { node: 0, cast: 2, type: 4096, mv: 149.84, energy: 2.82, concerto: 4.16, offtune: 6640, forte1: 20.76, ...STRAIN });
var MA47 = luukAction("Mid-air - Such is Light 4", { node: 0, cast: 2, type: 4096, mv: 104.78, energy: 1.55, concerto: 1, offtune: 4960, forte1: 15.5 });
var MDC5 = luukAction("Dodge Counter - Such is Light (Mid-Air)", { node: 0, cast: 0, type: 4096, mv: 256.87, energy: 2.3, concerto: 17.6, offtune: 7360, forte1: 23 });
var Skill39 = luukAction("Skill - Golden Reflux", { node: 1, cast: 4, type: 12288, mv: 201.2, energy: 2.3, concerto: 4.6, offtune: 7360, forte1: 23, ...STRAIN });
var Ring = luukAction("Skill - Aureole of Execution: Ring", { node: 1, cast: 4, type: 4096, mv: 221.33, energy: 8, concerto: 10, offtune: 10400, forte1: 32.5, ...STRAIN });
var Breach = luukAction("Skill - Aureole of Execution: Breach", { node: 1, cast: 4, type: 4096, mv: 287.73, energy: 8.01, concerto: 10.02, offtune: 10320, forte1: 32.25, ...STRAIN });
var Glare = luukAction("Skill - Aureole of Execution: Glare", { node: 1, cast: 4, type: 4096, mv: 354.11, energy: 6, concerto: 10, offtune: 7840, forte1: 24.5, ...STRAIN });
var GoldenImpale = luukAction("Basic - Golden Impale", { node: 1, cast: 1, type: 4096, mv: 155.47, energy: 2.3, concerto: 4.6, offtune: 7360, forte1: 23 });
var IchorDeposit = luukAction("Skill - Ichor Deposit", { node: 1, type: 4096, mv: 153.45 });
var Gavel = luukAction("Basic - Gavel of Earthshaker", {
  node: 2,
  cast: 1,
  type: 4096,
  mv: 306.9,
  energy: 6,
  concerto: 10,
  offtune: 8080,
  forte1: 25.25,
  updateBuffs: () => queue(IchorDeposit)
});
var IchorBlade = luukAction("Forte - Ichor Blade", { node: 2, type: 4096, scaling: 5, mv: 10 * 33 });
var Liberation32 = luukAction("Liberation - Rewritten in Winter's Margins", {
  node: 3,
  cast: 5,
  type: 4096,
  mv: 994.09,
  concerto: 20,
  offtune: 67200,
  resetEnergy: true
});
var Intro41 = luukAction("Intro - Before Injection of Dawn", {
  node: 4,
  cast: 6,
  type: 20480,
  mv: 218.01,
  energy: 10.02,
  concerto: 10,
  offtune: 10320,
  forte1: 100,
  ...STRAIN
  // updateBuffs: () => applyCurrent(DAWNLIT_KEEP, 1),  // DAWNLIT_KEEP grants no stat and nothing reads it
});
var Outro41 = luukAction("Outro - Bow to the Last Light", {
  cast: 7,
  type: 24576,
  mv: 500,
  concerto: -100,
  active: false,
  updateBuffs: () => applyCurrent(GOLDEN_RULE)
});
var isAureole = (a) => a === Ring || a === Breach || a === Glare;
var AUREATE_JUDGE = new Buff({
  name: "Luuk: Aureate Judge",
  updateBuffs: () => {
    const a = currentAction();
    if (forte1() <= 0 && a !== Gavel && a !== IchorDeposit && a !== TUNE_BREAK)
      revokeCurrent(AUREATE_JUDGE);
  },
  applyStats: () => {
    const a = currentAction();
    if (a.forte1 > 0)
      addStat(29, -a.forte1);
    if (isAureole(a) || a === Gavel) {
      addStat(16, 110);
      addStat(27, 25200);
    }
    if (isAureole(a)) {
      if (forte1() > 300)
        setForte1(300);
      addStat(29, -100);
    }
    if (a === IchorDeposit)
      addStat(16, 110);
  }
});
var ENDNOTES = new Buff({
  name: "Luuk: Endnotes on the Endgame",
  maxStacks: 3,
  applyStats: () => {
    if (currentAction() === Liberation32)
      addStat(16, 25 * frozenStacks());
  },
  convertStats: () => {
    lostOnSwap();
    if (currentAction() === Liberation32)
      revokeCurrent(ENDNOTES);
  }
});
var GOLDEN_RULE = new Buff({
  name: "Luuk: Golden Rule",
  applyStats: () => {
    if (casting(
      6
      /* Cast.Intro */
    )) {
      addStat(29, 200);
      addStat(26, 12);
    }
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Intro */
    ))
      revokeCurrent(GOLDEN_RULE);
  }
});
var UNCAUSED_DIAGNOSIS_ATK = new Buff({
  name: "Inherent: Uncaused Diagnosis",
  applyStats: () => addStat(6, 25)
});
var DAWNLIT_KEEP = new Buff({ name: "Luuk: Dawnlit Keep", maxStacks: 1 });
var LK_INHERENT_1 = new Inherent({ name: "Inherent: Pulses Under the Snow" });
var LK_INHERENT_2 = new Inherent({
  name: "Inherent: Uncaused Diagnosis",
  updateGlobal: () => {
    const a = currentAction();
    if (applied(TUNE_STRAIN_SHIFTING) || a === TUNE_BREAK)
      applyCurrent(UNCAUSED_DIAGNOSIS_ATK, 1);
  },
  // late, like every Tune Break Boost read — a team's own Tbb can arrive from another gear's
  // convertStats (Denia's Etched Colors), which an ordinary convertStats here would race
  lateConvertStats: () => {
    if (stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0)
      addStat(18, Math.min(30, 5 * Math.floor(getStat(
        12
        /* Stat.Tbb */
      ) / 10)));
  }
});
var LUUK_TALENTS = new Talent({
  name: "Luuk: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var LUUK_RESONATOR = new Resonator({
  name: "Luuk",
  element: 320,
  weapon: 3,
  intro: () => Intro41,
  outro: () => Outro41,
  color: "#ddb246",
  maxEnergy: 125,
  // his kit raises the target's Tune Strain - Interfered limit by 1 on top of the base 1; Golden
  // Rule is armed from the start so his first Intro is brought in the same way every later one is
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1);
    applyCurrent(GOLDEN_RULE, 1);
  },
  lateConvertStats: () => tuneStrainBonus(),
  updateBuffs: () => {
    if (forte1() >= 300)
      applyCurrent(AUREATE_JUDGE, 1);
    if (isAureole(currentAction()))
      applyCurrent(ENDNOTES, 1);
  },
  constantStats: () => {
    addStat(1, 10300);
    addStat(0, 462.5);
    addStat(2, 1112.2);
    addStat(12, 10);
  }
});
var MA1233 = new ActionGroup("Mid-air - Scythe: Dissection 123", [MA113, MA210, MA310]);
var LK_ROTATION = new Rotation([
  START_3,
  Skill39,
  Liberation32,
  SWAP,
  INTRO,
  MA210,
  MA310,
  Ring,
  GoldenImpale.dodgeCancel(),
  MA1233,
  Breach,
  GoldenImpale.dodgeCancel(),
  MA1233,
  Glare,
  Gavel,
  Liberation32,
  ECHO_SWAP,
  OUTRO
]);
var LK_ECHOES = [
  new EchoLoadout(NEBULOUS_CANNON, GILDED_REVELATION_5PC)
];
var LUUK = new Loadout({
  resonator: LUUK_RESONATOR,
  talent: LUUK_TALENTS,
  inherent1: LK_INHERENT_1,
  inherent2: LK_INHERENT_2,
  weapons: [DAYBREAKERS_SPINE, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: LK_ECHOES,
  mainstats: mainstatOptions(
    0,
    1,
    6,
    13,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: LK_ROTATION
});

// dist/src/resonators/spectro/lynae.js
function lynaeAction(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA140 = lynaeAction("Basic - Chroma Drift 1", { node: 0, cast: 1, type: 4096, mv: 86.19, energy: 1.28, concerto: 4.59, offtune: 4080, forte1: 12 });
var BA240 = lynaeAction("Basic - Chroma Drift 2", { node: 0, cast: 1, type: 4096, mv: 157.17, energy: 2.34, concerto: 8.37, offtune: 7440, forte1: 21 });
var BA338 = lynaeAction("Basic - Chroma Drift 3", { node: 0, cast: 1, type: 4096, mv: 123.37, energy: 1.83, concerto: 6.57, offtune: 5840, forte1: 17 });
var DC33 = lynaeAction("Dodge Counter - Chroma Drift", { node: 0, cast: 0, type: 4096, mv: 239.97, energy: 2.05, concerto: 17.38, offtune: 6560, forte1: 19 });
var MA48 = lynaeAction("Mid-air - Chroma Drift", { node: 0, cast: 2, type: 4096, mv: 143.65, energy: 2.14, concerto: 7.66, offtune: 6800, forte1: 20 });
var SparkCollision = lynaeAction("Basic - Spark Collision Lv. 3", { node: 0, cast: 1, type: 4096, mv: 555.56, energy: 8.22, concerto: 29.6, offtune: 26300, forte1: -120, forte2: 120 });
var KBA1 = lynaeAction("Basic - Kaleidoscopic Parade 1", { node: 0, cast: 1, type: 4096, mv: 82.81, energy: 1.23, concerto: 4.41, offtune: 3920 });
var KBA2 = lynaeAction("Basic - Kaleidoscopic Parade 2", { node: 0, cast: 1, type: 4096, mv: 77.74, energy: 1.16, concerto: 4.14, offtune: 3680 });
var KBA3 = lynaeAction("Basic - Kaleidoscopic Parade 3", { node: 0, cast: 1, type: 4096, mv: 113.25, energy: 1.68, concerto: 6.03, offtune: 5361 });
var KBA4 = lynaeAction("Basic - Kaleidoscopic Parade 4", { node: 0, cast: 1, type: 4096, mv: 148.74, energy: 2.2, concerto: 7.94, offtune: 7040 });
var KBA5 = lynaeAction("Basic - Kaleidoscopic Parade 5", { node: 0, cast: 1, type: 4096, mv: 251.81, energy: 3.76, concerto: 13.45, offtune: 11924 });
var KHeavy = lynaeAction("Heavy - Kaleidoscopic Parade (Ground)", { node: 0, cast: 3, type: 4096, mv: 123.41, energy: 2.94, concerto: 6.58, offtune: 5845 });
var GraffitiBlast = lynaeAction("Heavy - Kaleidoscopic Parade: Graffiti Blast", { node: 0, cast: 3, type: 4096, mv: 104.78, energy: 1.55, concerto: 5.58, offtune: 4960 });
var PolychromeLeap1 = lynaeAction("Forte Basic - Polychrome Leap 1", { node: 2, cast: 1, type: 4096, mv: 101.4, energy: 2.25, concerto: 5.4, offtune: 4800, forte2: -40, forte3: 1 });
var PolychromeLeap2 = lynaeAction("Forte Basic - Polychrome Leap 2", { node: 2, cast: 1, type: 4096, mv: 101.4, energy: 2.28, concerto: 5.4, offtune: 4800, forte2: -40, forte3: 1 });
var PolychromeLeap3 = lynaeAction("Forte Basic - Polychrome Leap 3", { node: 2, cast: 1, type: 4096, mv: 104.8, energy: 2.4, concerto: 5.6, offtune: 4960, forte2: -40, forte3: 1 });
var IridescentSplash = lynaeAction("Forte Basic - Iridescent Splash", { node: 2, cast: 1, type: 4096, mv: 304.18, energy: 8.13, concerto: 7.65, offtune: 6800, forte3: -3 });
var VisualImpact = lynaeAction("Forte Basic - Visual Impact", {
  node: 2,
  cast: 1,
  type: 4096,
  mv: 1216.72,
  energy: 14.05,
  concerto: 14.58,
  offtune: 60960,
  forte3: -3,
  updateBuffs: () => applyTeam(SPECTRAL_ANALYSIS_TBB, 1)
});
var Skill40 = lynaeAction("Skill - Lynae-Style Palettes", { node: 1, cast: 4, type: 12288, mv: 278.63, energy: 8.75, concerto: 9.83, offtune: 8722, forte1: 25 });
var AdditiveColor = lynaeAction("Skill - Additive Color", { node: 1, cast: 4, type: 12288, mv: 232.62, energy: 6.92, concerto: 8.2, offtune: 7280 });
var Liberation33 = lynaeAction("Liberation - Prismatic Overblast", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 874.8,
  concerto: 20,
  offtune: 48e3,
  resetEnergy: true,
  updateBuffs: () => applyTeam(PRISMATIC_OVERBLAST, 1)
});
var VividTomorrow = lynaeAction("Basic - To a Vivid Tomorrow!", { node: 0, cast: 1, type: 4096, mv: 201.06, energy: 5.46, concerto: 19.42, offtune: 17128 });
var Intro42 = lynaeAction("Intro - Time to Show Some Colors!", { node: 4, cast: 6, type: 20480, mv: 224.8, energy: 13.4, concerto: 22, offtune: 10640, forte1: 100 });
var Outro42 = lynaeAction("Outro - Let's Hit the Road!", {
  cast: 7,
  type: 24576,
  mv: 100,
  concerto: -100,
  active: false,
  updateBuffs: () => queueOutro(LYNAE_OUTRO)
});
var SpectralAnalysis = lynaeAction("Tune Rupture Response - Spectral Analysis", {
  node: 2,
  type: 40960,
  mv: 1880.75,
  scaling: 4
  /* Scaling.Tune */
});
var inflictsFlux = (a) => a === PolychromeLeap1 || a === PolychromeLeap2 || a === PolychromeLeap3 || a === IridescentSplash || a === VisualImpact || a === Intro42;
var MODE_RUPTURE2 = new ResonanceMode({
  name: "Resonance Mode - Tune Rupture",
  updateDebuffs: () => {
    if (inflictsFlux(currentAction()))
      applyRupture();
  },
  updateGlobal: () => tuneRuptureResponse(SpectralAnalysis)
});
var MODE_STRAIN2 = new ResonanceMode({
  name: "Resonance Mode - Tune Strain",
  // her kit raises the target's Tune Strain - Interfered limit by 1 on top of the base 1
  updateDebuffs: () => {
    if (inflictsFlux(currentAction()))
      applyStrain();
  },
  combatStart: () => maxStackIncrease(TUNE_STRAIN_INTERFERED, 1),
  lateConvertStats: () => tuneStrainBonus()
});
var PRISMATIC_OVERBLAST = new Buff({
  name: "Lynae: Prismatic Overblast",
  applyStats: () => {
    addStat(17, 24);
  }
});
var ADAPTIVE_OPTICS = new Buff({
  name: "Inherent: Adaptive Optics",
  applyStats: () => addStat(
    17,
    25,
    320
    /* Attribute.Spectro */
  ),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(ADAPTIVE_OPTICS);
  }
});
var LYNAE_OUTRO = new Buff({
  name: "Lynae: Let's Hit the Road!",
  applyStats: () => {
    addStat(18, 15);
    addStat(
      18,
      25,
      16384
      /* Type1.Liberation */
    );
  },
  convertStats: () => {
    lostOnSwap();
  }
});
var SPECTRAL_ANALYSIS_TBB = new Buff({
  name: "Lynae: Visual Impact",
  applyStats: () => addStat(12, 40)
});
var LY_INHERENT_1 = new Inherent({ name: "Inherent: Colors Never Fade!" });
var LY_INHERENT_2 = new Inherent({
  name: 'Inherent: "Adaptive Optics: Everyday Applications"',
  updateBuffs: () => {
    if (currentAction() === Intro42)
      applyCurrent(ADAPTIVE_OPTICS, 1);
  }
});
var LYNAE_TALENTS = new Talent({
  name: "Lynae: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var LYNAE_RESONATOR = new Resonator({
  name: "Lynae",
  element: 320,
  weapon: 2,
  intro: () => Intro42,
  outro: () => Outro42,
  color: "#eae477",
  maxEnergy: 125,
  constantStats: () => {
    addStat(1, 12237.5);
    addStat(0, 375);
    addStat(2, 1197.8);
    addStat(12, 10);
  }
});
var PolychromeLeap123 = new ActionGroup("Forte - Polychrome Leap 123", [PolychromeLeap1, PolychromeLeap2, PolychromeLeap3]);
var LY_ROTATION = new Rotation([
  INTRO,
  Liberation33,
  Skill40,
  SparkCollision,
  PolychromeLeap123,
  VisualImpact,
  ECHO_SWAP,
  OUTRO
]);
var LY_ECHOES = [
  new EchoLoadout(VOIDWING_MOTH, REEL_5PC),
  new EchoLoadout(HYVATIA, NEONLIGHT_LEAP_5PC),
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(STONEWALL_BRACER, MOONLIT_CLOUDS_5PC)
];
var build2 = (mode) => new Loadout({
  resonator: LYNAE_RESONATOR,
  talent: LYNAE_TALENTS,
  inherent1: LY_INHERENT_1,
  inherent2: LY_INHERENT_2,
  weapons: [SPECTRUM_BLASTER, NEW_STD_PISTOL, STATIC_MIST],
  echoLoadouts: LY_ECHOES,
  mainstats: mainstatOptions(
    0,
    1,
    6,
    13,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "basic"),
  rotation: LY_ROTATION,
  mode
});
var LYNAE_RUPTURE = build2(MODE_RUPTURE2);
var LYNAE_STRAIN = build2(MODE_STRAIN2);

// dist/src/resonators/spectro/rover_spectro.js
function roverAction4(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA141 = roverAction4("Basic - Vibration Manifestation 1", { node: 0, cast: 1, type: 4096, mv: 59.15, energy: 0.5, concerto: 2, offtune: 2800, forte1: 3 });
var BA241 = roverAction4("Basic - Vibration Manifestation 2", { node: 0, cast: 1, type: 4096, mv: 76.05, energy: 1, concerto: 4, offtune: 3600, forte1: 5 });
var BA339 = roverAction4("Basic - Vibration Manifestation 3", { node: 0, cast: 1, type: 4096, mv: 76.05, energy: 1.5, concerto: 4, offtune: 3600, forte1: 5 });
var BA429 = roverAction4("Basic - Vibration Manifestation 4", { node: 0, cast: 1, type: 4096, mv: 130.13, energy: 2, concerto: 6, offtune: 6160, forte1: 7 });
var MA49 = roverAction4("Mid-air - Attack", { node: 0, cast: 2, type: 4096, mv: 104.78, energy: 0.51, concerto: 1, offtune: 4960 });
var DC34 = roverAction4("Dodge Counter - Vibration Manifestation", { node: 0, cast: 0, type: 4096, mv: 195.34, energy: 2.62, concerto: 13.6, offtune: 3600 });
var HA110 = roverAction4("Heavy - Attack", { node: 0, cast: 3, type: 8192, mv: 96.35, energy: 1.4, concerto: 4.55, offtune: 22800, forte1: 5 });
var HA210 = roverAction4("Heavy - Resonance", { node: 0, cast: 3, type: 8192, mv: 76.05, energy: 1.12, concerto: 3.6, offtune: 3600 });
var HA34 = roverAction4("Heavy - Aftertune", { node: 0, cast: 3, type: 8192, mv: 126.75, energy: 1.87, concerto: 6, offtune: 6e3, forte1: 45 });
var Skill41 = roverAction4("Skill - Resonating Slashes", { node: 1, cast: 4, type: 12288, mv: 236.19, energy: 10, concerto: 10, offtune: 4800 });
var FSkill12 = roverAction4("Forte Skill - Resonating Spin", {
  node: 2,
  cast: 4,
  type: 12288,
  mv: 258.16,
  energy: 10,
  concerto: 20,
  offtune: 21840,
  forte1: -50,
  updateDebuffs: () => {
    applyEnemy(SPECTRO_FRAZZLE, 2);
    queue(ResonatingWhirl);
  }
});
var ResonatingWhirl = roverAction4("Forte Skill - Resonating Whirl", { node: 2, type: 12288, mv: 39.77, energy: 2 });
var FBA6 = roverAction4("Basic - Resonating Echoes", { node: 2, cast: 1, type: 12288, mv: 238.58, energy: 2.5, concerto: 8, offtune: 7200 });
var Liberation34 = roverAction4("Liberation - Echoing Orchestra", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 874.77,
  concerto: 20,
  offtune: 61441,
  resetEnergy: true,
  updateDebuffs: () => {
    applyCurrent(HEALS, 1);
    applyEnemy(SPECTRO_FRAZZLE, 6);
  }
});
var Intro43 = roverAction4("Intro - Waveshock", { node: 4, cast: 6, type: 20480, mv: 168.99, energy: 10, concerto: 10, offtune: 4880, forte1: 50 });
var Outro43 = roverAction4("Outro - Instant", { cast: 7, concerto: -100, active: false });
var SPR_INHERENT_1 = new Inherent({
  name: "Inherent: Reticence",
  applyStats: () => {
    if (currentAction() === FBA6)
      addStat(17, 60);
  }
  // TODO unsure if dmg bonus
});
var SILENT_LISTENER = new Buff({
  name: "Inherent: Silent Listener",
  applyStats: () => addStat(6, 15),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(SILENT_LISTENER);
  }
});
var SPR_INHERENT_2 = new Inherent({
  name: "Inherent: Silent Listener",
  updateBuffs: () => {
    if (currentAction() === HA210)
      applyCurrent(SILENT_LISTENER, 1);
  }
});
var S1_CRIT2 = new Buff({
  name: "Spectro Rover S1: Odyssey of Beginnings",
  applyStats: () => addStat(9, 15),
  convertStats: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      revokeCurrent(S1_CRIT2);
  }
});
var S6_RES_SHRED = new Debuff({
  name: "Spectro Rover S6: Echoes of Wanderlust",
  applyStats: () => addEnemyStat(
    34,
    10,
    320
    /* Attribute.Spectro */
  ),
  convertStats: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) && isHeld(ROVER_SPECTRO_RESONATOR))
      revokeEnemy(S6_RES_SHRED);
  }
});
var SPR_S1 = new Sequence({
  name: "Spectro Rover S1: Odyssey of Beginnings",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Skill41 || a === FSkill12)
      applyCurrent(S1_CRIT2, 1);
  }
});
var SPR_S2 = new Sequence({
  name: "Spectro Rover S2: Microcosmic Murmurs",
  applyStats: () => addStat(
    17,
    20,
    320
    /* Attribute.Spectro */
  )
});
var SPR_S3 = new Sequence({
  name: "Spectro Rover S3: Visages of Dust",
  applyStats: () => addStat(11, 20)
});
var SPR_S4 = new Sequence({ name: "Spectro Rover S4: Resonating Lamella" });
var SPR_S5 = new Sequence({
  name: "Spectro Rover S5: Temporal Virtuoso",
  applyStats: () => addStat(
    17,
    40,
    16384
    /* Type1.Liberation */
  )
});
var SPR_S6 = new Sequence({
  name: "Spectro Rover S6: Echoes of Wanderlust",
  updateBuffs: () => {
    const a = currentAction();
    if (a === Skill41 || a === FSkill12)
      applyEnemy(S6_RES_SHRED, 1);
  }
});
var ROVER_SPECTRO_RESONATOR = new Resonator({
  name: "Spectro Rover",
  element: 320,
  weapon: 0,
  intro: () => Intro43,
  outro: () => Outro43,
  color: "#e8d98f",
  maxEnergy: 125,
  tier: 2,
  constantStats: () => {
    addStat(1, 11400);
    addStat(0, 375);
    addStat(2, 1369);
  }
});
var ROVER_SPECTRO_TALENTS = new Talent({
  name: "Spectro Rover: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(
      17,
      12,
      320
      /* Attribute.Spectro */
    );
  }
});
var SPR_ROTATION = new Rotation([
  INTRO,
  HA110,
  HA210,
  HA34,
  FSkill12,
  FBA6,
  HA110,
  HA210,
  HA34,
  FSkill12,
  Liberation34,
  ECHO_SWAP,
  OUTRO
]);
var ROVER_SPECTRO = new Loadout({
  resonator: ROVER_SPECTRO_RESONATOR,
  talent: ROVER_SPECTRO_TALENTS,
  inherent1: SPR_INHERENT_1,
  inherent2: SPR_INHERENT_2,
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    13,
    15
    /* Mainstat.ATK1 */
  ),
  substat: chem("atk", "liberation"),
  rotation: SPR_ROTATION,
  sequences: [SPR_S1, SPR_S2, SPR_S3, SPR_S4, SPR_S5, SPR_S6]
});

// dist/src/resonators/spectro/shorekeeper.js
function skAction(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA142 = skAction("Basic - Origin Calculus 1", { node: 0, cast: 1, type: 4096, mv: 31.78, energy: 0.5, concerto: 1.6, offtune: 2664, forte1: 1 });
var BA242 = skAction("Basic - Origin Calculus 2", { node: 0, cast: 1, type: 4096, mv: 47.72, energy: 0.76, concerto: 2.4, offtune: 4e3, forte1: 1 });
var BA340 = skAction("Basic - Origin Calculus 3", { node: 0, cast: 1, type: 4096, mv: 69.96, energy: 1.11, concerto: 3.54, offtune: 5865, forte1: 2 });
var MA50 = skAction("Mid-air - Origin Calculus", { node: 0, cast: 2, type: 4096, mv: 73.96, energy: 1.55, concerto: 5, offtune: 4960, forte1: 1 });
var Skill42 = skAction("Skill - Chaos Theory", { node: 1, cast: 4, type: 12288, mv: 156.55, energy: 10, concerto: 30, offtune: 5250 });
var FHA13 = skAction("Forte Heavy - Illation", { node: 2, cast: 3, type: 8192, mv: 281.3, energy: 4.95, concerto: 11, offtune: 6360, forte1: -5 });
var Liberation35 = skAction("Liberation - End Loop", {
  node: 3,
  cast: 5,
  concerto: 20,
  resetEnergy: true,
  // "Generate the Outer Stellarealm": a cast puts up a *new* realm rather than stepping the one
  // already standing, so whatever stage is up is replaced by Outer — which is what puts the realm
  // S1 carried through Discernment back at the bottom.
  updateBuffs: () => {
    revokeTeam(SK_REALM);
    applyTeam(SK_REALM, 1);
  }
});
var Intro44 = skAction("Intro - Enlightenment", { node: 4, cast: 6, type: 12288, mv: 226.5, energy: 10, concerto: 20, offtune: 11395 });
var EIntro6 = skAction("Intro - Discernment", {
  node: 4,
  cast: 6,
  type: 16384,
  scaling: 1,
  mv: 58.92,
  energy: 10.02,
  concerto: 20,
  offtune: 73242,
  applyStats: () => {
    addStat(9, 100);
  },
  updateBuffs: () => {
    if (isHeld(SK_S1))
      return;
    revokeTeam(SK_REALM);
    const rover = currentTeam().slots.find((s) => s.resonator?.name.includes("Rover"))?.resonator;
    if (rover)
      revokeBuff(rover, SK_ROVER_GRAVITATION);
  }
});
var Outro44 = skAction("Outro - Binary Butterfly", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => applyTeam(SK_OUTRO, 1)
});
var REALM_STAGE = ["Outer", "Inner", "Supernal"];
var SK_REALM = new Buff({
  name: "Shorekeeper: Stellarealm",
  maxStacks: 3,
  display: () => `Shorekeeper: ${REALM_STAGE[stacksOfTeam(SK_REALM) - 1]} Stellarealm`,
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Outro */
    ))
      applyTeam(SK_REALM, 1);
  },
  applyStats: () => {
    const stage = stacksOfTeam(SK_REALM);
    if (stage < 2)
      return;
    addStat(9, 12.5);
    if (stage >= 3)
      addStat(10, 25);
  }
});
var SK_OUTRO = new Buff({
  name: "Shorekeeper: Outro",
  applyStats: () => addStat(18, 15)
});
var SK_ROVER_GRAVITATION = new Buff({
  name: "Inherent: Self Gravitation",
  applyStats: () => {
    if (stacksOfTeam(SK_REALM))
      addStat(11, 10);
  }
});
var SK_INHERENT_2 = new Inherent({
  name: "Inherent: Self Gravitation",
  applyStats: () => {
    if (stacksOfTeam(SK_REALM))
      addStat(11, 10);
  },
  updateGlobal: () => {
    if (!stacksOfTeam(SK_REALM))
      return;
    const rover = currentTeam().slots.find((s) => s.resonator?.name.includes("Rover"))?.resonator;
    if (rover)
      addBuff(rover, SK_ROVER_GRAVITATION);
  }
});
var SK_INHERENT_1 = new Inherent({ name: "Inherent: Life Entwined" });
var SK_S1 = new Sequence({ name: "Shorekeeper S1: Unspoken Conjecture" });
var SK_S2_TEAM = new Buff({
  name: "Shorekeeper S2: Night's Gift and Refusal",
  applyStats: () => addStat(6, 40)
});
var SK_S2 = new Sequence({
  name: "Shorekeeper S2: Night's Gift and Refusal",
  updateGlobal: () => {
    if (stacksOfTeam(SK_REALM))
      applyTeam(SK_S2_TEAM, 1);
    else
      revokeTeam(SK_S2_TEAM);
  }
});
var SK_S3 = new Sequence({
  name: "Shorekeeper S3: Infinity Awaits Me",
  applyStats: () => {
    if (currentAction() === Liberation35)
      addStat(26, 20);
  }
});
var SK_S4 = new Sequence({
  name: "Shorekeeper S4: Overflowing Quietude",
  applyStats: () => {
    if (currentAction() === Skill42)
      addStat(23, 70);
  }
});
var SK_S5 = new Sequence({ name: "Shorekeeper S5: Echoes in Silence" });
var SK_S6 = new Sequence({
  name: "Shorekeeper S6: To the New World",
  applyStats: () => {
    if (currentAction() === EIntro6) {
      addStat(16, 42);
      addStat(10, 500);
    }
  }
});
var SHOREKEEPER_RESONATOR = new Resonator({
  name: "Shorekeeper",
  element: 320,
  weapon: 4,
  color: "#728cf3",
  maxEnergy: 175,
  // reads SK_REALM's own live stack count, already stepped by the preceding outro
  intro: () => stacksOfTeam(SK_REALM) >= 3 ? EIntro6 : Intro44,
  outro: () => Outro44,
  updateDebuffs: () => {
    const a = currentAction();
    if (a === Skill42 || a === Liberation35 || a === Intro44 || a === EIntro6)
      applyCurrent(HEALS, 1);
  },
  constantStats: () => {
    addStat(1, 16712.5);
    addStat(0, 287.5);
    addStat(2, 1100);
  }
});
var SHOREKEEPER_TALENTS = new Talent({
  name: "Shorekeeper: Talents",
  constantStats: () => {
    addStat(7, 12);
    addStat(23, 12);
  }
});
var BA1237 = new ActionGroup("Basic - Origin Calculus 123", [BA142, BA242, BA340]);
var SK_LOOP = new Rotation([
  START_3,
  Skill42,
  ECHO_CANCEL,
  Liberation35,
  SWAP,
  NOINTRO,
  BA1237,
  JUMP,
  MA50,
  FHA13,
  Skill42,
  BA242,
  BA340,
  DODGE,
  BA142,
  BA242,
  FHA13,
  ECHO_CANCEL,
  Liberation35,
  OUTRO,
  INTRO,
  BA1237,
  JUMP,
  MA50,
  FHA13,
  START_2,
  Skill42,
  SWAP,
  ECHO_CANCEL,
  Liberation35,
  OUTRO
]);
var SHOREKEEPER = new Loadout({
  resonator: SHOREKEEPER_RESONATOR,
  talent: SHOREKEEPER_TALENTS,
  inherent1: SK_INHERENT_1,
  inherent2: SK_INHERENT_2,
  weapons: [SK_SIG, VARIATION],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(SPACETREK_EXPLORER, STARRY_RADIANCE_5PC)
  ],
  sequences: [SK_S1, SK_S2, SK_S3, SK_S4, SK_S5, SK_S6],
  mainstats: [mainstats(
    3,
    5,
    5,
    16,
    16
    /* Mainstat.HP1 */
  )],
  substat: chem("hp", "liberation"),
  rotation: SK_LOOP
});

// dist/src/resonators/spectro/verina.js
function verinaAction(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA143 = verinaAction("Basic - Cultivation 1", { node: 0, cast: 1, type: 4096, mv: 37.86, energy: 0.95, concerto: 3.04, offtune: 7600 });
var BA243 = verinaAction("Basic - Cultivation 2", { node: 0, cast: 1, type: 4096, mv: 51.16, energy: 1.28, concerto: 4.11, offtune: 10200 });
var BA341 = verinaAction("Basic - Cultivation 3", { node: 0, cast: 1, type: 4096, mv: 51.16, energy: 1.28, concerto: 4.11, offtune: 10200 });
var BA430 = verinaAction("Basic - Cultivation 4", { node: 0, cast: 1, type: 4096, mv: 67.32, energy: 1.69, concerto: 5.41, offtune: 13600 });
var BA56 = verinaAction("Basic - Cultivation 5", { node: 0, cast: 1, type: 4096, mv: 71.62, energy: 1.8, concerto: 5.76, offtune: 14400, forte1: 1 });
var HA35 = verinaAction("Heavy - Cultivation", { node: 0, cast: 3, type: 8192, mv: 99.41, energy: 2.5, concerto: 8, offtune: 2e4 });
var MA114 = verinaAction("Mid-air - Cultivation 1", { node: 0, cast: 2, type: 4096, mv: 56.37, energy: 1.41, concerto: 4.53, offtune: 11340 });
var MA211 = verinaAction("Mid-air - Cultivation 2", { node: 0, cast: 2, type: 4096, mv: 53.19, energy: 1.33, concerto: 4.28, offtune: 10700 });
var MA311 = verinaAction("Mid-air - Cultivation 3", { node: 0, cast: 2, type: 4096, mv: 76.26, energy: 1.89, concerto: 6.12, offtune: 15342 });
var MHA3 = verinaAction("Heavy - Cultivation (Mid-air)", { node: 0, cast: 3, type: 8192, mv: 61.64, energy: 0.51, concerto: 1, offtune: 12400 });
var DC35 = verinaAction("Dodge Counter - Cultivation", { node: 0, cast: 0, type: 4096, mv: 129.23, energy: 3.25, concerto: 15.6, offtune: 14e3 });
var Skill43 = verinaAction("Skill - Botany Experiment", { node: 1, cast: 4, type: 12288, mv: 178.95, energy: 15, concerto: 30, offtune: 26600, forte1: 1 });
var STARFLOWER_CONCERTO = { updateDebuffs: () => {
  addStat(26, 12);
  applyCurrent(HEALS, 1);
} };
var StarflowerHeavy = verinaAction("Forte Heavy - Starflower Blooms", { node: 2, cast: 3, type: 8192, mv: 162.37, energy: 2.91, concerto: 4.66, offtune: 14600, forte1: -1, ...STARFLOWER_CONCERTO });
var ForteMidair1 = verinaAction("Forte Mid-air - Starflower Blooms 1", { node: 2, cast: 2, type: 4096, mv: 67.64, energy: 1.41, concerto: 4.53, offtune: 11340, forte1: -1, ...STARFLOWER_CONCERTO });
var ForteMidair2 = verinaAction("Forte Mid-air - Starflower Blooms 2", { node: 2, cast: 2, type: 4096, mv: 63.82, energy: 1.33, concerto: 4.28, offtune: 10700, forte1: -1, ...STARFLOWER_CONCERTO });
var ForteMidair3 = verinaAction("Forte Mid-air - Starflower Blooms 3", { node: 2, cast: 2, type: 4096, mv: 30.5 * 3, energy: 1.89, concerto: 6.12, offtune: 15342, forte1: -1, ...STARFLOWER_CONCERTO });
var Liberation36 = verinaAction("Liberation - Arboreal Flourish", {
  node: 3,
  cast: 5,
  type: 16384,
  mv: 198.81,
  concerto: 20,
  resetEnergy: true,
  updateBuffs: () => applyEnemy(PHOTOSYNTHESIS_MARK, 12)
});
var PHOTOSYNTHESIS_FIELD = new ActionField("Verina: Photosynthesis Mark");
var PhotosynthesisTick = verinaAction("Liberation - Photosynthesis Mark", {
  node: 3,
  type: 4096,
  type2: 262144,
  mv: 9.95,
  active: false,
  field: PHOTOSYNTHESIS_FIELD
});
var S6Tick = PhotosynthesisTick.variant("Liberation - Photosynthesis Mark", { field: null });
var Intro45 = verinaAction("Intro - Verdant Growth", { node: 4, cast: 6, type: 20480, mv: 99.41, energy: 10, concerto: 10, offtune: 11230, forte1: 1 });
var Outro45 = verinaAction("Outro - Blossom", {
  cast: 7,
  concerto: -100,
  active: false,
  updateBuffs: () => applyTeam(VERINA_OUTRO, 1)
});
var GIFT_OF_NATURE = new Buff({
  name: "Inherent: Gift of Nature",
  applyStats: () => addStat(6, 20),
  // granted from VERINA_RESONATOR's own updateBuffs() below since a global buff's own updateBuffs() can't fire before
  // it's held once, and the Resonator itself is always self-held from team setup
  convertStats: () => {
    if (casting(
      6
      /* Cast.Intro */
    ) && isHeld(VERINA_RESONATOR))
      revokeTeam(GIFT_OF_NATURE);
  }
});
var VR_INHERENT_1 = new Inherent({
  name: "Inherent: Gift of Nature",
  updateBuffs: () => {
    const a = currentAction();
    if (a === StarflowerHeavy || a === ForteMidair1 || a === Liberation36 || a === Outro45)
      applyTeam(GIFT_OF_NATURE, 1);
  }
});
var VR_INHERENT_2 = new Inherent({ name: "Inherent: Grace of Life" });
var VERINA_OUTRO = new Buff({
  name: "Verina: Blossom",
  applyStats: () => addStat(18, 15)
});
var PHOTOSYNTHESIS_MARK = coordinatedBuff("Verina: Photosynthesis Mark", 12, () => VERINA_RESONATOR, PhotosynthesisTick, { enemy: true });
var VERINA_S2 = new Sequence({
  name: "Verina S2: Sprouting Reflections",
  applyStats: () => {
    if (currentAction() === Skill43) {
      addStat(29, 1);
      addStat(26, 10);
    }
  }
});
var VERINA_S4 = new Sequence({
  name: "Verina S4: Blossoming Embrace",
  updateBuffs: () => {
    const a = currentAction();
    if (a === StarflowerHeavy || a === ForteMidair1 || a === Liberation36 || a === Outro45)
      applyTeam(S4_TEAM2, 1);
  }
});
var S4_TEAM2 = new Buff({
  name: "Verina S4: Blossoming Embrace",
  applyStats: () => addStat(
    17,
    15,
    320
    /* Attribute.Spectro */
  )
});
var VERINA_S6 = new Sequence({
  name: "Verina S6: Joyous Harvest",
  // the DMG boost lands on every Mid-air stage; the Coordinated Attack triggers once per combo
  applyStats: () => {
    const a = currentAction();
    if (a === StarflowerHeavy || a === ForteMidair1 || a === ForteMidair2 || a === ForteMidair3) {
      addStat(17, 20);
      queue(S6Tick);
    }
  }
});
var VERINA_S1 = new Sequence({ name: "Verina S1: Moment of Emergence" });
var VERINA_S3 = new Sequence({ name: "Verina S3: The Choice to Flourish" });
var VERINA_S5 = new Sequence({ name: "Verina S5: Miraculous Blooms" });
var VERINA_RESONATOR = new Resonator({
  name: "Verina",
  element: 320,
  weapon: 4,
  intro: () => Intro45,
  outro: () => Outro45,
  color: "#8fe08f",
  maxEnergy: 175,
  // her own real 175%, not the generic 125% default — matches Shorekeeper's own
  tier: 1,
  updateDebuffs: () => {
    const a = currentAction();
    if (a === StarflowerHeavy || a === ForteMidair1 || a === ForteMidair2 || a === ForteMidair3 || a === Liberation36 || a === PhotosynthesisTick || a === S6Tick || a === Outro45)
      applyCurrent(HEALS, 1);
  },
  constantStats: () => {
    addStat(1, 14238);
    addStat(0, 338);
    addStat(2, 1100);
  }
});
var VERINA_TALENTS = new Talent({
  name: "Verina: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(23, 12);
  }
});
var VR_LOOP = new Rotation([
  NOINTRO,
  Skill43,
  Liberation36,
  JUMP,
  ForteMidair1,
  ForteMidair2,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  Skill43,
  Liberation36,
  JUMP,
  ForteMidair1,
  ECHO_SWAP,
  OUTRO
]);
var VERINA = new Loadout({
  resonator: VERINA_RESONATOR,
  talent: VERINA_TALENTS,
  inherent1: VR_INHERENT_1,
  inherent2: VR_INHERENT_2,
  weapons: [VARIATION],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(SPACETREK_EXPLORER, STARRY_RADIANCE_5PC)
  ],
  mainstats: [mainstats(
    2,
    5,
    5,
    15,
    15
    /* Mainstat.ATK1 */
  )],
  substat: chem("atk", "liberation"),
  rotation: VR_LOOP,
  sequences: [VERINA_S1, VERINA_S2, VERINA_S3, VERINA_S4, VERINA_S5, VERINA_S6]
});

// dist/src/engine/teams.js
var TEAMS = [
  // jingran: fusion heavy shielder
  [[SHOREKEEPER, LUPA, VERINA, MORNYE], [IUNO, MORTEFI, BRANT, LUPA, LYNAE_RUPTURE, REBECCA], [JINGRAN]],
  // qingxiao: aero heavy/basic/liberation on tune strain
  [[MORNYE, SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA], [DENIA_STRAIN, LYNAE_STRAIN, ROVER_AERO, CIACCONA, SANHUA, MORTEFI, REBECCA, JIANXIN], [QINGXIAO]],
  // xuanling: havoc heavy attack on Havoc Bane — Chisa's +3 to every Negative Status cap is what
  // takes Unbroken Vow off its 3-stack 30% tier onto the 4-6 stack 36% one
  [[SUISUI, VERINA, SHOREKEEPER, MORNYE, CHISA], [CHISA, MORTEFI, REBECCA, LYNAE_RUPTURE, IUNO, PHROLOVA_DUAL_DPS, ROVER_ELECTRO], [XUANLING]],
  // hiyuki: glacio chafe/bite — every stack the team lands calculates at the target's own limit,
  // which is why Chisa (+3 to it) and Lucilla's Chafe build stand behind her
  [[SUISUI, VERINA, SHOREKEEPER, MORNYE, CHISA], [LUCILLA_CHAFE, CHISA, LYNAE_RUPTURE, JIANXIN, ROVER_ELECTRO], [HIYUKI]],
  // lucy: spectro heavy on tune hack, with rebecca feeding her the outro
  [[VERINA, MORNYE, SHOREKEEPER], [REBECCA, REBECCA], [LUCY]],
  // sigrika: aero + echo
  [[SHOREKEEPER, ROVER_AERO, CIACCONA, QIUYUAN, VERINA, MORNYE], [QIUYUAN, LUCILLA, CANTARELLA, ROVER_AERO, CIACCONA, LYNAE_RUPTURE], [SIGRIKA]],
  // luuk: spectro basic, tune strain
  [[SHOREKEEPER, VERINA, MORNYE], [LYNAE_STRAIN, SANHUA, DENIA_STRAIN, ROVER_SPECTRO], [LUUK]],
  // aemeath: fusion liberation on tune rupture — Mornye and Lynae answer the break beside her
  [[SHOREKEEPER, VERINA, MORNYE, LUPA], [LYNAE_RUPTURE, LUPA, CHANGLI, JIANXIN], [AEMEATH_RUPTURE]],
  // monofus needs mornye or lupa
  [[MORNYE, LUPA], [BRANT, BRANT], [AEMEATH_RUPTURE]],
  // denia burst mode with real rupture teammates
  [[DENIA_BURST, DENIA_BURST], [LYNAE_RUPTURE, LYNAE_RUPTURE], [AEMEATH_RUPTURE]],
  [[MORNYE, MORNYE], [DENIA_BURST, DENIA_BURST], [AEMEATH_RUPTURE]],
  // aemeath: fusion liberation on fusion burst — Denia's Burst mode feeds the stacks and amplifies
  [[SHOREKEEPER, VERINA, MORNYE, LUPA, DENIA_BURST, CHISA, SUISUI], [DENIA_BURST, LUPA, JIANXIN, ROVER_ELECTRO], [AEMEATH_BURST]],
  // monofus needs lupa or denia
  [[LUPA, DENIA_BURST], [CHANGLI, BRANT], [AEMEATH_BURST]],
  // lynae rupture only with denia burst 3rd slot
  [[DENIA_BURST, DENIA_BURST], [LYNAE_RUPTURE, LYNAE_RUPTURE], [AEMEATH_BURST]],
  // galbrena: fusion echo
  [[SHOREKEEPER, VERINA, LUPA, QIUYUAN, MORNYE, DENIA_BURST], [QIUYUAN, LUCILLA], [GALBRENA]],
  // galbrena: fusion heavy
  [[SHOREKEEPER, VERINA, LUPA, MORNYE, DENIA_BURST], [BRANT, MORTEFI, IUNO, LUPA, LYNAE_RUPTURE, REBECCA], [GALBRENA]],
  // iuno mdps: aero + echo
  [[SHOREKEEPER, ROVER_AERO, CIACCONA, VERINA, MORNYE], [ROVER_AERO, CIACCONA, LYNAE_RUPTURE, JIANXIN], [IUNO_MDPS]],
  // augusta: electro heavy shielder
  [[SHOREKEEPER, VERINA, MORNYE], [IUNO, MORTEFI, LYNAE_RUPTURE, REBECCA], [AUGUSTA]],
  // phrolova: havoc, echo, skill
  // phrolova -> subdps -> subdps
  [[PHROLOVA], [QIUYUAN, LUCILLA, LYNAE_RUPTURE, ROCCIA, DANJIN], [DANJIN, LUCILLA, CANTARELLA, LYNAE_RUPTURE]],
  // phrolova -> support -> subdps
  [[PHROLOVA], [SHOREKEEPER, VERINA, BULING, MORNYE, SUISUI], [QIUYUAN, DANJIN, LUCILLA, CANTARELLA, LYNAE_RUPTURE]],
  // phrolova -> driver -> support
  [[PHROLOVA], [QIUYUAN, ROCCIA, DANJIN, ROVER_HAVOC], [SHOREKEEPER, VERINA, SUISUI]],
  // phrolova -> subdps -> dual dps
  [[PHROLOVA_DUAL_DPS, PHROLOVA_DUAL_DPS], [QIUYUAN, LUCILLA], [SIGRIKA_FAST]],
  [[PHROLOVA_DUAL_DPS, PHROLOVA_DUAL_DPS], [LUCILLA, LUCILLA], [HIYUKI]],
  [[SUISUI, SUISUI], [PHROLOVA_DUAL_DPS, PHROLOVA_DUAL_DPS], [HIYUKI]],
  // brant: fusion basic
  [[MORNYE, DENIA_BURST, VERINA, SHOREKEEPER], [SANHUA, LUPA, DENIA_BURST], [BRANT_MDPS]],
  [[LUPA, LUPA], [BRANT], [CHANGLI, ENCORE]],
  // changli: fusion skill+liberation
  [[LUPA, MORNYE, SHOREKEEPER, DENIA_BURST, VERINA], [DENIA_BURST, LYNAE_RUPTURE, LUPA], [CHANGLI]],
  // jinhsi: spectro skill
  [[SHOREKEEPER, VERINA, MORNYE, BULING], [ZHEZHI, CANTARELLA, LYNAE_RUPTURE, REBECCA], [JINHSI]],
  // carlotta: glacio skill
  [[SHOREKEEPER, BULING, VERINA, MORNYE, SUISUI], [ZHEZHI, BRANT, LYNAE_RUPTURE, REBECCA, LUCILLA_CHAFE], [CARLOTTA]],
  // camellya: havoc basic
  [[SHOREKEEPER, VERINA], [SANHUA, SANHUA], [CAMELLYA_DOUBLE]],
  [[SHOREKEEPER, VERINA, MORNYE], [ROCCIA, SANHUA, LYNAE_RUPTURE, REBECCA], [CAMELLYA]],
  // xiangli yao: electro liberation
  [[SHOREKEEPER, VERINA, MORNYE], [YINLIN, LYNAE_RUPTURE, JIANXIN], [XIANGLI_YAO]],
  // jiyan: aero heavy
  [[SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA, MORNYE], [MORTEFI, IUNO, CIACCONA, LYNAE_RUPTURE, REBECCA], [JIYAN]],
  // encore: fusion basic
  [[SHOREKEEPER, VERINA, DENIA_BURST, LUPA], [LUPA, SANHUA, DENIA_BURST], [ENCORE]],
  [[LUPA, LUPA], [ENCORE], [CHANGLI, BRANT]],
  // havoc rover: havoc, mixed
  [[SHOREKEEPER, VERINA, MORNYE], [ROCCIA, DANJIN, SANHUA, LYNAE_RUPTURE, CANTARELLA], [ROVER_HAVOC]]
];
var ALL_TEAMS = TEAMS.flatMap((slots) => {
  const singletons = slots.map((s, i) => s.length === 1 ? i : -1).filter((i) => i !== -1);
  const [dpsIndex] = singletons;
  if (dpsIndex === void 0 || singletons.length > 1) {
    const names = slots.map((s) => s.map((l) => l.resonator.name).join("/")).join(", ");
    throw new Error(singletons.length > 1 ? `the team [${names}] has ${singletons.length} one-loadout slots, so more than one resonator is eligible to be its main DPS \u2014 name each fixed support twice to rule it out` : `the team [${names}] has no one-loadout slot naming its main DPS`);
  }
  const [a, b, c] = slots.map((s) => [...new Set(s)]);
  return a.flatMap((x) => b.flatMap((y) => c.map((z) => ({ loadouts: [x, y, z], dpsIndex })))).filter((team) => new Set(team.loadouts.map((l) => l.resonator)).size === team.loadouts.length);
});
var teamKey = (index) => `t${index}`;
var teamAt = (key) => /^t\d+$/.test(key) ? ALL_TEAMS[Number(key.slice(1))] : void 0;

// dist/src/solver.js
var member = (loadout, mainDps = false) => ({ name: loadout.resonator.name, color: loadout.resonator.color, loadout, mainDps });
var defaultFilters = () => ({
  mdpsSequences: false,
  supportSequences: false,
  mdpsWeapons: false,
  supportWeapons: false,
  mdpsEchoes: false,
  supportEchoes: false,
  mdpsMainstats: false,
  supportMainstats: false,
  allowR1Mdps: true,
  allowR1Supports: true,
  matrix: false
});
var bestKey = (teamKey2, members, filters) => {
  const f = { ...filters, matrix: filters.matrix && members.some((m) => m.loadout.matrix) };
  return `${teamKey2}|${Object.values(f).join(",")}`;
};
var picksKey = (teamKey2, members, filters) => {
  const matrix2 = filters.matrix && members.some((m) => m.loadout.matrix);
  return `${teamKey2}|${filters.allowR1Mdps},${filters.allowR1Supports},${filters.mdpsWeapons},${filters.supportWeapons},${matrix2}`;
};
var comboOf = (l, p) => {
  const matrix2 = p.matrix && l.matrix ? l.matrix : null;
  return {
    weapon: l.weapons[p.weapon],
    echo: l.echoLoadouts[p.echo],
    mainstat: l.mainstats[p.mainstat],
    sequence: p.sequence,
    matrix: matrix2,
    key: `${p.weapon}.${p.echo}.${p.mainstat}.s${p.sequence}${matrix2 ? ".m" : ""}`
  };
};
function sequenceLevels(m, filters) {
  const l = m.loadout;
  const max = l.sequences.length;
  if (!max)
    return [0];
  const base = Math.min(baseSequence(l.resonator), max);
  return (m.mainDps ? filters.mdpsSequences : filters.supportSequences) ? Array.from({ length: max - base + 1 }, (_, i) => base + i) : [base];
}
function eligibleWeapons(m, filters) {
  const l = m.loadout;
  const allowR1 = m.mainDps ? filters.allowR1Mdps : filters.allowR1Supports;
  const eligible = l.weapons.map((_, i) => i).filter((i) => allowR1 || l.weapons[i].standard);
  return (m.mainDps ? filters.mdpsWeapons : filters.supportWeapons) ? eligible : eligible.slice(0, 1);
}
var trialCache = /* @__PURE__ */ new Map();
var scoreCache = /* @__PURE__ */ new Map();
var trialKey = (teamKey2, combo) => `${teamKey2}-${combo.map((c) => c.key).join("-")}`;
function trialRun(teamKey2, members, picks) {
  const combo = members.map((m, i) => comboOf(m.loadout, picks[i]));
  const key = trialKey(teamKey2, combo);
  let hit = trialCache.get(key);
  if (!hit)
    trialCache.set(key, hit = runTeam(teamKey2, members, combo));
  return hit;
}
function scoreMainstats(teamKey2, members, picks, who) {
  const combo = members.map((m, i) => comboOf(m.loadout, picks[i]));
  const key = `${trialKey(teamKey2, combo)}|${who.join(",")}`;
  let out = scoreCache.get(key);
  if (!out)
    scoreCache.set(key, out = scoreMainstatsRun(teamKey2, members, picks, who, combo));
  return out;
}
function scoreMainstatsRun(teamKey2, members, picks, who, combo) {
  const alts = members.map((m, i) => who.includes(i) ? m.loadout.mainstats.map((_, k) => k).filter((k) => k !== picks[i].mainstat) : null);
  const run2 = runTeam(teamKey2, members, combo, false, alts.map((a, i) => a && a.map((k) => members[i].loadout.mainstats[k])));
  trialCache.set(trialKey(teamKey2, combo), run2);
  const out = /* @__PURE__ */ new Map();
  for (const i of who) {
    const scores = [];
    scores[picks[i].mainstat] = run2;
    alts[i].forEach((k, v) => {
      const trial = picks.map((p, j) => j === i ? { ...p, mainstat: k } : p);
      const variant = run2.variantRuns[i][v];
      if (variant.unsafe) {
        scores[k] = trialRun(teamKey2, members, trial);
        return;
      }
      const c = members.map((m, j) => comboOf(m.loadout, trial[j]));
      const scored = {
        state: run2.state,
        teamKey: teamKey2,
        members,
        combo: c,
        rotationLines: null,
        variantRuns: [],
        total: variant.total,
        bySlot: variant.bySlot,
        sectionTotals: variant.sectionTotals,
        sectionBySlot: variant.sectionBySlot
      };
      trialCache.set(trialKey(teamKey2, c), scored);
      scores[k] = scored;
    });
    out.set(i, scores);
  }
  return out;
}
function bestMainstats(teamKey2, members, picks, who) {
  const scores = scoreMainstats(teamKey2, members, picks, who);
  return picks.map((p, i) => {
    if (!who.includes(i))
      return p;
    let index = p.mainstat, best = -Infinity;
    scores.get(i).forEach((run2, k) => {
      const damage2 = run2.bySlot.get(members[i].name) ?? 0;
      if (damage2 > best) {
        best = damage2;
        index = k;
      }
    });
    return index === p.mainstat ? p : { ...p, mainstat: index };
  });
}
function bestMainstatFor(teamKey2, members, picks, i) {
  const scores = scoreMainstats(teamKey2, members, picks, [i]).get(i);
  let winner = picks[i].mainstat;
  let best = -Infinity;
  let total = 0;
  scores.forEach((run2, m) => {
    const damage2 = run2.bySlot.get(members[i].name) ?? 0;
    if (damage2 > best) {
      best = damage2;
      winner = m;
      total = run2.total;
    }
  });
  return { mainstat: winner, total };
}
function optimizeTeam(teamKey2, members, filters) {
  const picks = members.map((m) => ({
    weapon: eligibleWeapons(m, filters)[0] ?? 0,
    echo: 0,
    mainstat: 0,
    // the level a closed box would show — the search never varies it, the row set does
    sequence: sequenceLevels(m, filters)[0],
    matrix: filters.matrix
  }));
  const run2 = () => trialRun(teamKey2, members, picks);
  const sweepMainstats = () => {
    const next = bestMainstats(teamKey2, members, picks, members.map((_, i) => i));
    const changed = next.some((p, i) => p.mainstat !== picks[i].mainstat);
    next.forEach((p, i) => {
      picks[i] = p;
    });
    return changed;
  };
  const sweepAcross = (axis, options) => {
    let changed = false;
    let best = run2().total;
    for (let i = 0; i < members.length; i++) {
      const home = picks[i];
      let winner = home;
      for (const option of options(members[i])) {
        if (option === home[axis])
          continue;
        const rerolled = bestMainstatFor(teamKey2, members, picks.map((p, j) => j === i ? { ...home, [axis]: option } : p), i);
        picks[i] = { ...home, [axis]: option, mainstat: rerolled.mainstat };
        if (rerolled.total > best) {
          best = rerolled.total;
          winner = picks[i];
          changed = true;
        }
      }
      picks[i] = winner;
    }
    return changed;
  };
  sweepMainstats();
  for (let round = 0; round < 3; round++) {
    const weapons = sweepAcross("weapon", (m) => eligibleWeapons(m, filters));
    const echoes = sweepAcross("echo", (m) => m.loadout.echoLoadouts.map((_, i) => i));
    if (!weapons && !echoes)
      break;
    if (!sweepMainstats())
      break;
  }
  return picks;
}
var toLine = (snap) => ({ id: snap.action.name, isChain: false, parts: [], snap, mv: mvPercent(snap), avg: damage(snap).avg });
function toLines(snaps) {
  const lines = [];
  for (let i = 0; i < snaps.length; ) {
    const head = snaps[i];
    if (!head.group) {
      lines.push(toLine(head));
      i++;
      continue;
    }
    const parts = [];
    const members = [], extras = [];
    let mv = 0, avg = 0, j = i, ended = false;
    for (; j < snaps.length; j++) {
      const snap = snaps[j];
      const member2 = !ended && snap.group === head.group;
      if (!member2 && snap.groupSpill !== head.group)
        break;
      const dmg = damage(snap);
      parts.push({ snap, dmg });
      if (member2) {
        members.push(snap);
        mv += mvPercent(snap);
        avg += dmg.avg;
        if (snap.groupEnd)
          ended = true;
      } else
        extras.push(snap);
    }
    lines.push({
      id: head.group.name,
      isChain: true,
      parts,
      members,
      snap: members[members.length - 1],
      mv,
      avg
    });
    for (const snap of extras)
      lines.push({ ...toLine(snap), spill: true });
    i = j;
  }
  return collapseRepeats(lines);
}
function collapseRepeats(lines) {
  const out = [];
  for (let i = 0; i < lines.length; ) {
    const head = lines[i];
    const snap = head.snap;
    let j = i + 1;
    if (!head.isChain && snap.triggered && !snap.action.field) {
      while (j < lines.length) {
        const next = lines[j];
        if (next.isChain || !next.snap.triggered || !!next.spill !== !!head.spill)
          break;
        if (next.snap.action.name !== snap.action.name || next.snap.slot !== snap.slot)
          break;
        j++;
      }
    }
    if (j - i < 2) {
      out.push(head);
      i++;
      continue;
    }
    const run2 = lines.slice(i, j);
    out.push({
      id: `${snap.action.name} x${run2.length}`,
      isChain: true,
      parts: run2.map((l) => ({ snap: l.snap, dmg: { avg: l.avg } })),
      members: run2.map((l) => l.snap),
      snap: run2[run2.length - 1].snap,
      mv: run2.reduce((n, l) => n + l.mv, 0),
      avg: run2.reduce((n, l) => n + l.avg, 0),
      spill: head.spill
    });
    i = j;
  }
  return out;
}
var nextFieldKey = 0;
function collapseFields(sections) {
  const lines = sections.flat();
  const hitsIn = (l) => l.members?.length ? l.members : [l.snap];
  const fields = /* @__PURE__ */ new Map();
  lines.forEach((l, i2) => {
    const field = l.snap.action.field;
    if (!field || !hitsIn(l).every((h) => h.action.field === field))
      return;
    const at = fields.get(field);
    if (at)
      at.push(i2);
    else
      fields.set(field, [i2]);
  });
  if (!fields.size)
    return sections;
  const keyOf = /* @__PURE__ */ new Map();
  const after = /* @__PURE__ */ new Map(), before = /* @__PURE__ */ new Map();
  for (const [field, at] of fields) {
    const opens = lines.flatMap((l, i2) => l.snap.opensFields.includes(field) ? [i2] : []);
    const groups = /* @__PURE__ */ new Map();
    for (const i2 of at) {
      let open = -1;
      for (const o of opens) {
        if (o > i2)
          break;
        open = o;
      }
      (groups.get(open) ?? groups.set(open, []).get(open)).push(i2);
    }
    for (const [open, hits] of groups) {
      const key = `f${nextFieldKey++}`;
      for (const i2 of hits)
        keyOf.set(i2, key);
      const parts = hits.flatMap((i2) => {
        const l = lines[i2];
        return l.members?.length ? l.parts : [{ snap: l.snap, dmg: { avg: l.avg } }];
      });
      const one = parts[0].snap.action.name;
      const summary = {
        id: parts.every((p) => p.snap.action.name === one) ? `${one} x${parts.length}` : `${field.name} x${parts.length}`,
        isChain: true,
        aggregate: true,
        fieldKey: key,
        parts,
        members: parts.map((p) => p.snap),
        snap: parts[parts.length - 1].snap,
        mv: hits.reduce((sum, i2) => sum + lines[i2].mv, 0),
        avg: hits.reduce((sum, i2) => sum + lines[i2].avg, 0)
      };
      const map = open >= 0 ? after : before;
      (map.get(open >= 0 ? open : hits[0]) ?? map.set(open >= 0 ? open : hits[0], []).get(open >= 0 ? open : hits[0])).push(summary);
    }
  }
  const out = sections.map(() => []);
  let i = 0;
  sections.forEach((section, sec) => {
    for (const l of section) {
      for (const summary of before.get(i) ?? [])
        out[sec].push(summary);
      const key = keyOf.get(i);
      out[sec].push(key === void 0 ? l : { ...l, fieldKey: key });
      for (const summary of after.get(i) ?? [])
        out[sec].push(summary);
      i++;
    }
  });
  return out;
}
function sumSection(lines, avgOf) {
  const bySlot = /* @__PURE__ */ new Map();
  let total = 0;
  for (const line of lines) {
    if (line.mv === 0)
      continue;
    const slot = line.snap.slot;
    const avg = avgOf(line);
    bySlot.set(slot, (bySlot.get(slot) ?? 0) + avg);
    total += avg;
  }
  return { total, bySlot };
}
function sumRun(rotationLines, avgOf) {
  let total = 0;
  const bySlot = /* @__PURE__ */ new Map();
  const sectionTotals = [];
  const sectionBySlot = [];
  for (const lines of rotationLines) {
    const section = sumSection(lines, avgOf);
    sectionTotals.push(section.total);
    sectionBySlot.push(section.bySlot);
    total += section.total / rotationLines.length;
    for (const [slot, v] of section.bySlot)
      bySlot.set(slot, (bySlot.get(slot) ?? 0) + v / rotationLines.length);
  }
  return { total, bySlot, sectionTotals, sectionBySlot };
}
function runTeam(teamKey2, members, combo, trace = false, variants = null) {
  setTracing(trace);
  try {
    return runTeamInner(teamKey2, members, combo, trace, variants);
  } finally {
    setTracing(false);
  }
}
function runTeamInner(teamKey2, members, combo, trace, variants) {
  const state = new State(members.map((m) => m.name));
  members.forEach((m, i) => {
    state.active = i;
    withTeam(state, () => {
      for (const g of m.loadout.pieces(combo[i].weapon, combo[i].echo, combo[i].mainstat, combo[i].sequence, combo[i].matrix !== null))
        equip(g, 1);
    });
    const alts = variants?.[i];
    if (alts?.length) {
      const slot = state.slots[i];
      slot.variantOf = combo[i].mainstat;
      slot.variants = alts;
      slot.variantBase = alts.map(() => /* @__PURE__ */ new Map());
      slot.variantUnsafe = alts.map(() => false);
    }
  });
  state.active = 0;
  withTeam(state, () => equipEnemy(TUNE_BREAK_ENEMY));
  const rotationLines = runRotations(state, members.map((m) => m.loadout.rotation), 4).map(toLines);
  const { total, bySlot, sectionTotals, sectionBySlot } = sumRun(rotationLines, (line) => line.avg);
  const variantAvgOf = (snap, avg, m, v) => snap.member === m.name && snap.variantAvg !== null ? snap.variantAvg[v] : avg;
  const variantRuns = members.map((m, i) => (variants?.[i] ?? []).map((_, v) => ({
    ...sumRun(rotationLines, (line) => {
      if (!line.isChain)
        return variantAvgOf(line.snap, line.avg, m, v);
      const hits = new Set(line.members ?? []);
      let avg = line.avg;
      for (const p of line.parts)
        if (hits.has(p.snap))
          avg += variantAvgOf(p.snap, p.dmg.avg, m, v) - p.dmg.avg;
      return avg;
    }),
    unsafe: state.slots[i].variantUnsafe[v]
  })));
  return { state, teamKey: teamKey2, members, combo, rotationLines: trace ? collapseFields(rotationLines) : null, total, bySlot, sectionTotals, sectionBySlot, variantRuns };
}
var scoreOf = (run2) => ({ total: run2.total, bySlot: [...run2.bySlot], sectionTotals: run2.sectionTotals, sectionBySlot: run2.sectionBySlot.map((by) => [...by]) });
var runFromScore = (teamKey2, members, combo, score) => ({
  state: null,
  teamKey: teamKey2,
  members,
  combo,
  rotationLines: null,
  variantRuns: [],
  total: score.total,
  bySlot: new Map(score.bySlot),
  sectionTotals: score.sectionTotals,
  sectionBySlot: score.sectionBySlot.map((by) => new Map(by))
});
var teamFromKey = (key) => {
  const team = teamAt(key);
  if (!team)
    throw new Error(`no team is named ${key}`);
  return team.loadouts.map((l, i) => member(l, i === team.dpsIndex));
};
function cartesian(lists) {
  return lists.reduce((acc, list) => acc.flatMap((picked) => list.map((item) => [...picked, item])), [[]]);
}
var MAINSTAT_ROWS = 9;
function buildsOf(m, home, f) {
  const l = m.loadout;
  const mdps = m.mainDps;
  const weapons = (mdps ? f.mdpsWeapons : f.supportWeapons) ? eligibleWeapons(m, f) : [home.weapon];
  const echoes = (mdps ? f.mdpsEchoes : f.supportEchoes) ? l.echoLoadouts.map((_, i) => i) : [home.echo];
  const sequences = sequenceLevels(m, f);
  const picks = [];
  for (const weapon of weapons)
    for (const echo of echoes)
      for (const sequence of sequences) {
        picks.push({ ...home, weapon, echo, sequence });
      }
  return picks;
}
function rowPicks(teamKey2, members, best, filters) {
  const boxOpen = (i) => members[i].mainDps ? filters.mdpsMainstats : filters.supportMainstats;
  const open = members.map((_, i) => i).filter(boxOpen);
  const closed = members.map((_, i) => i).filter((i) => !boxOpen(i));
  const settle = (picks) => {
    if (!closed.length)
      return picks;
    let out = picks;
    for (let round = 0; round < 3; round++) {
      const next = bestMainstats(teamKey2, members, out, closed);
      const changed = next.some((p, i) => p.mainstat !== out[i].mainstat);
      out = next;
      if (!changed)
        break;
    }
    return out;
  };
  const closedEchoes = members.map((m, i) => (m.mainDps ? filters.mdpsEchoes : filters.supportEchoes) ? -1 : i).filter((i) => i >= 0);
  const pinEchoes = (picks) => {
    let out = picks;
    for (const i of closedEchoes) {
      if (members[i].loadout.echoLoadouts.length < 2)
        continue;
      const home = out[i];
      let winner = home;
      let bestTotal = bestMainstatFor(teamKey2, members, out, i).total;
      members[i].loadout.echoLoadouts.forEach((_, echo) => {
        if (echo === home.echo)
          return;
        const trial = out.map((p, j) => j === i ? { ...home, echo } : p);
        const rerolled = bestMainstatFor(teamKey2, members, trial, i);
        if (rerolled.total > bestTotal) {
          bestTotal = rerolled.total;
          winner = { ...home, echo, mainstat: rerolled.mainstat };
        }
      });
      out = out.map((p, j) => j === i ? winner : p);
    }
    return out;
  };
  const builds = cartesian(members.map((m, i) => buildsOf(m, best[i], filters)));
  const seen = /* @__PURE__ */ new Map();
  for (const picks of builds) {
    const key = picks.map((p) => `${p.weapon}.${p.echo}.s${p.sequence}`).join("-");
    if (!seen.has(key))
      seen.set(key, picks);
  }
  const rows = [];
  for (const build3 of seen.values()) {
    const settled = settle(pinEchoes(build3));
    if (!open.length) {
      rows.push(settled);
      continue;
    }
    const scores = scoreMainstats(teamKey2, members, settled, open);
    const top = /* @__PURE__ */ new Map();
    for (const i of open) {
      const ranked = [];
      scores.get(i).forEach((run2, k) => ranked.push({ mainstat: k, damage: run2.bySlot.get(members[i].name) ?? 0 }));
      ranked.sort((a, b) => b.damage - a.damage);
      top.set(i, ranked.slice(0, MAINSTAT_ROWS).map((r) => r.mainstat));
    }
    for (const mainstats2 of cartesian(members.map((_, i) => top.get(i) ?? [settled[i].mainstat]))) {
      rows.push(settled.map((p, i) => ({ ...p, mainstat: mainstats2[i] })));
    }
  }
  return rows;
}
function solveTeam(teamKey2, members, filters, known = null) {
  trialCache = /* @__PURE__ */ new Map();
  scoreCache = /* @__PURE__ */ new Map();
  const picks = known ?? optimizeTeam(teamKey2, members, filters);
  const rows = rowPicks(teamKey2, members, picks, filters);
  const scores = rows.map((row) => {
    const combo = members.map((m, i) => comboOf(m.loadout, row[i]));
    return scoreOf(trialCache.get(trialKey(teamKey2, combo)) ?? runTeam(teamKey2, members, combo));
  });
  trialCache = /* @__PURE__ */ new Map();
  scoreCache = /* @__PURE__ */ new Map();
  return { picks, rows, scores };
}
if (typeof document === "undefined" && typeof self !== "undefined") {
  const ctx2 = self;
  ctx2.onmessage = ({ data }) => {
    const solved = solveTeam(data.teamKey, teamFromKey(data.teamKey), data.filters, data.picks);
    ctx2.postMessage({ id: data.id, ...solved });
  };
}

export {
  tagKind,
  TAG_NAME,
  scopedStat,
  splitStat,
  CAST_NAME,
  NODE_NAME,
  SCALING_NAME,
  isPercent,
  statLabel,
  RESOURCE_NAME,
  isCast,
  menuStats,
  baseSequence,
  mvPercent,
  effectiveShred,
  effectiveRes,
  damageFactors,
  SWAP,
  DODGE,
  JUMP,
  BASE_RESISTANCE,
  TUNE_BREAK_ENEMY,
  ALL_TEAMS,
  teamKey,
  member,
  defaultFilters,
  bestKey,
  picksKey,
  comboOf,
  sequenceLevels,
  eligibleWeapons,
  optimizeTeam,
  collapseFields,
  runTeam,
  runFromScore,
  teamFromKey,
  MAINSTAT_ROWS,
  solveTeam
};
