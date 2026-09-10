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
  wrote: 0,
  recording: false,
  readPhase: 0,
  readStamp: 0,
  constVersion: 0,
  overrideType1: null,
  overrideType2: null,
  actionStamp: 0,
  tracing: false,
  insideGroup: false
};
var tagWord = (element, type, type2) => (element ?? 0) | (type ?? 0) | (type2 ?? 0);
var tagWordOf = (action) => {
  let word = action._tagWord;
  if (word === void 0)
    action._tagWord = word = tagWord(action.element, action.type1, action.type2);
  return word;
};
var dryLog = [];
function undoDry() {
  if (dryLog.length === 0)
    return;
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
var replay = { index: [], value: [], length: 0 };
var recordWrite = (index, value) => {
  const n = replay.length++;
  replay.index[n] = index;
  replay.value[n] = value;
};
var READ_APPLY = 1;
var READ_CONVERT = 2;
var READ_AFTER = 4;
var reads = { stamp: new Int32Array(64), phases: new Int32Array(64) };
var recordRead = (index) => {
  if (reads.stamp[index] !== ctx.readStamp) {
    reads.stamp[index] = ctx.readStamp;
    reads.phases[index] = ctx.readPhase;
  } else
    reads.phases[index] = reads.phases[index] | ctx.readPhase;
};
var readAny = (indices, phases) => {
  for (let d = 0; d < indices.length; d++) {
    const i = indices[d];
    if (reads.stamp[i] === ctx.readStamp && (reads.phases[i] & phases) !== 0)
      return true;
  }
  return false;
};
var noteMutation = (id, n) => {
  ctx.mutHash = Math.imul(ctx.mutHash ^ id, 2654435761) + n | 0;
};
var RESOURCE_STATS = [
  26,
  27,
  28,
  29,
  13,
  14,
  30,
  31,
  32,
  33,
  34
];
var GrantRecord = class {
  stamp = new Int32Array(2048);
  now = new Float64Array(2048);
  byStamp = new Int32Array(2048 * MEMBERS);
  by = new Float64Array(2048 * MEMBERS);
  /** Every Gear recorded this action, for a reader that walks them (`consumedAny()`, the fields a
   *  cast opened). */
  gears = [];
  gearsLen = 0;
  gearsStamp = -1;
  grow(id) {
    let n = this.stamp.length;
    while (id >= n)
      n *= 2;
    const copy = (a, size) => {
      const b = new a.constructor(size);
      b.set(a);
      return b;
    };
    this.stamp = copy(this.stamp, n);
    this.now = copy(this.now, n);
    this.byStamp = copy(this.byStamp, n * MEMBERS);
    this.by = copy(this.by, n * MEMBERS);
  }
  /** Record `n` of `gear`, credited to member `who` (-1 for nobody). */
  add(gear, n, who) {
    const id = gear.id, stamp = ctx.actionStamp;
    if (id >= this.stamp.length)
      this.grow(id);
    if (this.gearsStamp !== stamp) {
      this.gearsStamp = stamp;
      this.gearsLen = 0;
    }
    if (this.stamp[id] !== stamp) {
      this.stamp[id] = stamp;
      this.now[id] = n;
      this.gears[this.gearsLen++] = gear;
    } else
      this.now[id] = this.now[id] + n;
    if (who < 0)
      return;
    const k = id * MEMBERS + who;
    if (this.byStamp[k] !== stamp) {
      this.byStamp[k] = stamp;
      this.by[k] = n;
    } else
      this.by[k] = this.by[k] + n;
  }
  get(gear) {
    const id = gear.id;
    return id < this.stamp.length && this.stamp[id] === ctx.actionStamp ? this.now[id] : 0;
  }
  getBy(gear, who) {
    const k = gear.id * MEMBERS + who;
    return k < this.byStamp.length && this.byStamp[k] === ctx.actionStamp ? this.by[k] : 0;
  }
  /** The Gear recorded this action, in order — `length` of them, the array reused. */
  list() {
    return { gears: this.gears, length: this.gearsStamp === ctx.actionStamp ? this.gearsLen : 0 };
  }
};
var MEMBERS = 4;
var applied = new GrantRecord();
var consumed = new GrantRecord();
var recordApplied = (gear, n) => {
  if (n <= 0)
    return;
  applied.add(gear, n, ctx.state.sourceIndexOf(gear));
};
var recordConsumed = (gear, n) => {
  if (n <= 0)
    return;
  consumed.add(gear, n, ctx.slot.index);
};
var pendingQueue = [];

// dist/src/engine/stats.js
var STAT_COUNT = 36 + 1;
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
    /* Stat.DamageTaken */
  ]: "Damage Taken",
  [
    21
    /* Stat.ResIgnore */
  ]: "Res Ignore",
  [
    22
    /* Stat.DefIgnoreNew */
  ]: "Def Ignore (new)",
  [
    23
    /* Stat.DefIgnoreOld */
  ]: "Def Ignore (old)",
  [
    24
    /* Stat.HealingBonus */
  ]: "Healing Bonus",
  [
    25
    /* Stat.HealingReceived */
  ]: "Healing Received",
  [
    26
    /* Stat.AddEnergy */
  ]: "Energy",
  [
    27
    /* Stat.AddConcerto */
  ]: "Concerto",
  [
    28
    /* Stat.AddOfftune */
  ]: "Offtune",
  [
    29
    /* Stat.DirectOfftune */
  ]: "DirectOfftune",
  [
    30
    /* Stat.AddForte1 */
  ]: "Forte1",
  [
    31
    /* Stat.AddForte2 */
  ]: "Forte2",
  [
    32
    /* Stat.AddForte3 */
  ]: "Forte3",
  [
    33
    /* Stat.AddForte4 */
  ]: "Forte4",
  [
    34
    /* Stat.AddForte5 */
  ]: "Forte5",
  [
    35
    /* EnemyStat.ResReduce */
  ]: "Res Reduce",
  [
    36
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
    /* Cast.Heavy */
  ]: "Heavy",
  [
    3
    /* Cast.Skill */
  ]: "Skill",
  [
    4
    /* Cast.Liberation */
  ]: "Liberation",
  [
    5
    /* Cast.Intro */
  ]: "Intro",
  [
    6
    /* Cast.Outro */
  ]: "Outro",
  [
    7
    /* Cast.Echo */
  ]: "Echo",
  [
    8
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
  25,
  35,
  36
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
var TYPE2_CRIT_RATE_INDEX = STAT_COUNT + 2;
var TYPE2_CRIT_DMG_INDEX = STAT_COUNT + 3;
var ZERO_STATS = new Array(STAT_COUNT + 4).fill(0);
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
  /** Position on the team — the enemy is last (`MEMBERS - 1`). What the grant records credit by. */
  index = 0;
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
  variantAt = /* @__PURE__ */ new Map();
  /** Set per variant when its dry re-run would have changed the fight — a mutation the real build
   *  didn't make, or a resource stat that banks differently — so its scores can't be trusted and
   *  the solver runs it for real instead. */
  variantUnsafe = [];
  /** Scratch for a varied action, reused rather than allocated per action: the stats as the phases
   *  before the constant base left them, and each variant's own working copy. */
  pre = ZERO_STATS.slice();
  post2 = ZERO_STATS.slice();
  post4 = ZERO_STATS.slice();
  variantEff = [];
  /** Per variant, whether the action being evaluated re-ran its conversions dry (see `evaluate()`). */
  variantDry = [];
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
  /** Who is really on field for the action being evaluated: `active` as the scheduler set it,
   *  before `run()` swings `active` onto a queued follow-up's own slot. What `isActive()` reads. */
  onField = 0;
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
    this.slots = names.map((n, i) => {
      const m = new TeamMember(n);
      m.index = i;
      return m;
    });
    this.enemy.index = names.length;
    if (names.length >= MEMBERS)
      throw new Error("state.ts: more members than the grant records index");
  }
  /** Whose kit `gear` came from, as a member index (`TeamMember.index`) — -1 when unattributed. */
  sourceIndexOf(gear) {
    const name = this.sourceOf.get(gear);
    if (name === void 0)
      return -1;
    if (name === this.enemy.name)
      return this.enemy.index;
    for (let i = 0; i < this.slots.length; i++)
      if (this.slots[i].name === name)
        return i;
    return -1;
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
    const slots = state.slots;
    for (let i = 0; i < slots.length; i++)
      slots[i].snapshotInto(this.members[i]);
    state.globalStacks.snapshotInto(this.global);
    state.enemyStacks.snapshotInto(this.enemy);
    this.offtune = state.offtune;
  }
  restore(state) {
    undoDry();
    const slots = state.slots;
    for (let i = 0; i < slots.length; i++)
      slots[i].restore(this.members[i]);
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
function runningAction(action) {
  const a = ctx.act;
  return a === action || a.cancelOf === action;
}
function isActive() {
  return ctx.state.slot === ctx.state.slots[ctx.state.onField] && !ctx.act.swapOut;
}
function typeOverride(type) {
  const a = ctx.act;
  if (type & TYPE2_BITS)
    ctx.overrideType2 = type;
  else
    ctx.overrideType1 = type;
  ctx.tagWord = tagWord(a.element, ctx.overrideType1 ?? a.type1, ctx.overrideType2 ?? a.type2);
}
var onCast = (...casts) => () => casts.some((c) => casting(c));
var onType = (...types) => () => types.some((t) => isType(t));
var onInflict = (...gears) => () => gears.some((g) => appliedByMe(g) > 0);
var onApplied = (...gears) => () => gears.some((g) => applied2(g) > 0);
var either = (...triggers) => () => triggers.some((t) => t());
var both = (...triggers) => () => triggers.every((t) => t());
function isType(type) {
  const a = ctx.act;
  return (ctx.overrideType1 ?? a.type1) === type || (ctx.overrideType2 ?? a.type2) === type;
}
function isCast(action, cast) {
  return action.cast === cast || action.cast2 === cast;
}
function applied2(gear) {
  return applied.get(gear);
}
function appliedByMe(gear) {
  return appliedByMember(gear, ctx.slot);
}
function appliedByMember(gear, member2) {
  return applied.getBy(gear, member2.index);
}
function consumedByMe(gear) {
  return consumedByMember(gear, ctx.slot);
}
function consumedByMember(gear, member2) {
  return consumed.getBy(gear, member2.index);
}
function consumedAny() {
  let total = 0;
  const { gears, length } = consumed.list();
  for (let i = 0; i < length; i++)
    total += consumed.get(gears[i]);
  return total;
}
function frozenStacks() {
  return ctx.stacks >= 0 ? ctx.stacks : ctx.slot.stacksOf(ctx.buff);
}
function write(effective, index, value) {
  effective[index] = effective[index] + value;
  ctx.wrote++;
  if (ctx.recording)
    recordWrite(index, value);
}
function pushStat(stat, tag, value) {
  const slot = ctx.slot;
  if (tag === void 0 || (ctx.tagWord & tagBand(tag)) === tag) {
    write(slot.effective, stat, value);
    if (tag !== void 0 && (tag & TYPE2_BITS) !== 0) {
      if (stat === 18)
        write(slot.effective, TYPE2_AMP_INDEX, value);
      else if (stat === 9)
        write(slot.effective, TYPE2_CRIT_RATE_INDEX, value);
      else if (stat === 10)
        write(slot.effective, TYPE2_CRIT_DMG_INDEX, value);
    }
    if (stat === 17 && tag === 4096)
      write(slot.effective, BASIC_DMG_BONUS_INDEX, value);
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
  if (ctx.recording)
    recordRead(stat);
  return ctx.slot.effective[stat];
}
function basicDmgBonus() {
  if (ctx.recording)
    recordRead(BASIC_DMG_BONUS_INDEX);
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
      return ctx.slot.forte[i] = Math.max(delta > 0 ? 0 : -Infinity, ctx.slot.forte[i]) + delta;
    }
  };
}
var { get: forte1, set: setForte1, add: addForte1 } = forteGauge(0);
var { get: forte2, set: setForte2, add: addForte2 } = forteGauge(1);
var { get: forte3, set: setForte3, add: addForte3 } = forteGauge(2);
var { get: forte4, set: setForte4, add: addForte4 } = forteGauge(3);
var { get: forte5, set: setForte5, add: addForte5 } = forteGauge(4);
function enemyGauge(i) {
  return {
    get: () => ctx.state.enemy.forte[i],
    set: (value) => {
      noteMutation(-6 - i, value);
      return ctx.state.enemy.forte[i] = value;
    },
    add: (delta) => {
      noteMutation(-6 - i, delta);
      return ctx.state.enemy.forte[i] = ctx.state.enemy.forte[i] + delta;
    }
  };
}
var { get: enemyForte1, set: setEnemyForte1, add: addEnemyForte1 } = enemyGauge(0);
var { get: enemyForte2, set: setEnemyForte2, add: addEnemyForte2 } = enemyGauge(1);
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
function asSource(gear, fn) {
  const prev = ctx.buff, prevStacks = ctx.stacks;
  ctx.buff = gear;
  ctx.stacks = -1;
  try {
    return fn();
  } finally {
    ctx.buff = prev;
    ctx.stacks = prevStacks;
  }
}
function asActor(fn) {
  const prev = ctx.slot;
  ctx.slot = ctx.state.slot;
  try {
    return fn();
  } finally {
    ctx.slot = prev;
  }
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
function applyOthers(buff, n = 1) {
  attribute(buff);
  for (const s of ctx.state.slots)
    if (s !== ctx.slot)
      s.addStack(buff, n);
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
  hookMask = 0;
  /** A small integer unique to this Gear — what a variant dry run hashes a mutation by, to tell
   *  whether it would have changed the fight (see `noteMutation()`). */
  id;
  /** The same six hooks by phase index (bit order of `PHASE_*`), for `runPhase()` to call one
   *  phase's hook without naming the field — only the phases set in `hookMask` are ever read. */
  hookFns = [];
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
    this.decl = { stats: def2.stats ?? [], grants: def2.grants ?? [] };
    if (def2.stats?.length && !(this instanceof Buff)) {
      const lines = def2.stats, own = def2.constantStats;
      this.constantStatsFn = () => {
        for (const line of lines)
          addStat(line[0], line[1], line[2]);
        own?.();
      };
    }
    if (def2.grants?.length) {
      const grants = def2.grants, own = def2.updateBuffs;
      this.updateBuffsFn = () => {
        own?.();
        for (const g of grants) {
          if (!g.on())
            continue;
          const n = typeof g.stacks === "function" ? g.stacks() : g.stacks ?? 1;
          if (n <= 0)
            continue;
          const buff = typeof g.buff === "function" ? g.buff() : g.buff ?? this;
          if (g.to === 1)
            applyTeam(buff, n);
          else if (g.to === 2)
            applyEnemy(buff, n);
          else if (g.to === 3)
            queueOutro(buff);
          else
            applyCurrent(buff, n);
        }
      };
    }
    this.wire();
  }
  /** What the data half of this Gear's def declared — kept for the engine to introspect. */
  decl;
  /** `hookMask`/`hookFns` off whatever hooks stand now — called once every compiled hook is in place. */
  wire() {
    this.hookMask = (this.updateDebuffsFn ? PHASE_DEBUFFS : 0) | (this.updateBuffsFn ? PHASE_BUFFS : 0) | (this.applyStatsFn ? PHASE_APPLY : 0) | (this.convertStatsFn ? PHASE_CONVERT : 0) | (this.lateConvertStatsFn ? PHASE_LATE : 0) | (this.afterActionFn ? PHASE_AFTER : 0) | (this.constantStatsFn ? PHASE_CONST : 0);
    this.hookFns = [this.updateDebuffsFn, this.updateBuffsFn, this.applyStatsFn, this.convertStatsFn, this.lateConvertStatsFn, this.afterActionFn, this.constantStatsFn];
  }
  /** "Name xN" for anything that stacks — by its own declared cap, or in fact: a debuff declared at 1
   *  can be standing at 2 or 3 once a kit's `maxStackIncrease()` raised the target's own ceiling
   *  (Tune Strain - Interfered under its responders), and that count is what the reader wants. */
  toString() {
    if (this.displayFn)
      return this.displayFn();
    const n = frozenStacks();
    return this.maxStacks > 1 || n > 1 ? `${this.name} x${n}` : this.name;
  }
};
var Buff = class extends Gear {
  constructor(def2) {
    super(def2);
    this.maxStacks = def2.maxStacks ?? 1;
    if (def2.stats?.length) {
      const lines = def2.stats, when = def2.when, perStack = def2.perStack;
      const pay = () => {
        if (when && !when())
          return;
        const n = perStack ? frozenStacks() : 1;
        for (const line of lines)
          addStat(line[0], perStack ? line[1] * n : line[1], line[2]);
      };
      if (def2.early) {
        const own = this.updateBuffsFn;
        this.updateBuffsFn = () => {
          pay();
          own?.();
        };
      } else {
        const own = def2.applyStats;
        this.applyStatsFn = () => {
          pay();
          own?.();
        };
      }
    }
    if (def2.until === 0) {
      const own = def2.convertStats;
      this.convertStatsFn = () => {
        own?.();
        if (casting(
          6
          /* Cast.Outro */
        ))
          revokeCurrent(this);
      };
    } else if (def2.until === 1) {
      const own = this.updateBuffsFn;
      this.updateBuffsFn = () => {
        if (currentAction().swapOut)
          revokeCurrent(this);
        own?.();
      };
    } else if (def2.until === 2) {
      const own = def2.convertStats;
      this.convertStatsFn = () => {
        own?.();
        if (currentAction().swapOut)
          revokeCurrent(this);
      };
    }
    this.wire();
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
]: 0, [
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
  /** The rank of each listed weapon this build runs by default — the first of its `refinements`
   *  entry: R1 for a whole list, the one rank given for a single weapon. */
  weapons;
  /** Per listed weapon, every rank a Refines compare may run it at (`LoadoutDef.weapons`). */
  refinements;
  echoLoadouts;
  /** Every main-stat build this loadout is willing to run (see mainstats.ts's own
   *  `mainstatOptions()`) — a list for the same reason `weapons`/`echoLoadouts` are, the table
   *  runs one row per combination. A pure support names just the one. */
  mainstats;
  substat;
  highSubstat;
  /** This build's whole rotation, already compiled into the up-to-three action chains the
   *  scheduler schedules — start of combat, opener, and the Intro chain every visit after
   *  (rotation.ts). One field, not an opener/loop pair: the chains share a body, so splitting
   *  them across two lists only ever duplicated it. Every distinct one this build declares, for
   *  whoever has to check them all (teams.ts's playability pass); `rotationAt()` picks per level. */
  rotations;
  /** The lowest chain level this build declares a rotation for: below it there is none, so a
   *  build at a lower level has no rows (solver.ts's `sequenceLevels()`). */
  minSequence;
  rotationByLevel;
  /** This loadout's own resonance-chain nodes, S1 first — as many as it actually declares, which
   *  is six for anything a build is costed above S0 at (see `Tier`) and none for most
   *  limited kits. */
  sequences;
  mode;
  constructor(def2) {
    this.resonator = def2.resonator;
    this.refinements = def2.weapons.map((w) => Array.isArray(w) ? w : [w]);
    this.weapons = this.refinements.map((w) => w[0]);
    this.echoLoadouts = def2.echoLoadouts;
    this.mainstats = def2.mainstats;
    this.substat = def2.substat;
    this.highSubstat = def2.highSubstat;
    const declared = "intro" in def2.rotation ? { 0: def2.rotation } : def2.rotation;
    this.rotationByLevel = [];
    for (let n = 0; n <= 6; n++)
      this.rotationByLevel[n] = declared[n] ?? this.rotationByLevel[n - 1] ?? null;
    this.minSequence = this.rotationByLevel.findIndex(Boolean);
    if (this.minSequence < 0)
      throw new Error(`${def2.resonator.name}: a loadout's rotation map declares no rotation`);
    this.rotations = [...new Set(this.rotationByLevel.filter((r) => r !== null))];
    this.sequences = def2.sequences ?? [];
    this.mode = def2.mode;
  }
  /** The rotation a build at `sequenceLevel` runs: the one declared for that level, else the
   *  nearest declared below it. */
  rotationAt(sequenceLevel) {
    const r = this.rotationByLevel[Math.min(6, sequenceLevel)];
    if (!r)
      throw new Error(`${this.resonator.name} declares no rotation below S${this.minSequence}`);
    return r;
  }
  /** Every piece for one specific weapon/echo/main-stat/sequence-level combo, flattened into the
   *  plain array `equip()` actually walks — the order matches how each resonator file's own loadout
   *  comment already reads (resonator, talent, both inherents, weapon, echoes, mainstat/substat,
   *  sequences, mode). `sequenceLevel` is how many nodes are actually held, S1 up: 0 for a build at
   *  S0, 6 for the full chain — the comparison table runs one row per level so the gain from each
   *  can be read off (see index.ts's own combos). `matrix` is whether Matrix Mode is on — the
   *  piece only goes on when it is *and* this resonator has one. `highSubs` swaps the substat
   *  piece for the high-investment one (that role's own box). */
  pieces(weapon, echo, mainstat, sequenceLevel, matrix2 = false, highSubs2 = false) {
    const r = this.resonator;
    return [
      r,
      r.talent,
      r.inherent1,
      r.inherent2,
      weapon,
      ...echo.pieces(),
      mainstat,
      highSubs2 ? this.highSubstat : this.substat,
      ...this.sequences.slice(0, sequenceLevel),
      this.mode,
      matrix2 ? r.matrix : void 0
    ].filter((g) => g != null);
  }
};
var Resonator = class extends Gear {
  element;
  weapon;
  /** Undefined only on the enemy dummy — see `ResonatorDef`. */
  talent;
  inherent1;
  inherent2;
  /** This kit's Matrix, if it has one — worn only when the table's Matrix Mode box is on
   *  (`Loadout.pieces()`), and the resonator's own the way their Talents are. */
  matrix;
  maxEnergy;
  /** `maxForte1`-`maxForte5` as one array, indexed the way `TeamMember.forte` is. */
  maxForte;
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
    if (!def2.enemy && (!def2.talent || !def2.inherent1 || !def2.inherent2)) {
      throw new Error(`${def2.name}: a resonator names its Talents and both Inherent Skills`);
    }
    this.talent = def2.talent;
    this.matrix = def2.matrix;
    this.inherent1 = def2.inherent1;
    this.inherent2 = def2.inherent2;
    this.maxEnergy = def2.maxEnergy ?? 0;
    this.maxForte = [def2.maxForte1 ?? 0, def2.maxForte2 ?? 0, def2.maxForte3 ?? 0, def2.maxForte4 ?? 0, def2.maxForte5 ?? 0];
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
function refinements(build3) {
  return [0, 1, 2, 3, 4].map((r) => {
    const w = build3(r, ` R${r + 1}`);
    w.refinement = r + 1;
    return w;
  });
}
var Weapon = class extends Gear {
  weaponType;
  tier;
  /** Which rank this instance is, 1-5 — stamped by `refinements()`. */
  refinement = 1;
  constructor(def2) {
    super(def2);
    this.weaponType = def2.weaponType;
    this.tier = def2.tier ?? 0;
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
var shredOf = (stats, notDot, base) => 1 - (1 - notDot * stats[
  22
  /* Stat.DefIgnoreNew */
] / 100) * Math.floor(base * (1 - stats[
  36
  /* EnemyStat.DefReduce */
] / 100 - notDot * stats[
  23
  /* Stat.DefIgnoreOld */
] / 100)) / base;
var resOf = (stats, notDot, enemyRes2) => (enemyRes2 / 100 - stats[
  21
  /* Stat.ResIgnore */
] / 100 * notDot - stats[
  35
  /* EnemyStat.ResReduce */
] / 100) * 100;
var resFactorFrom = (finalRes) => finalRes < 0 ? 1 - finalRes / 2 : finalRes < 0.8 ? 1 - finalRes : 1 / (1 + 5 * finalRes);
var OWN_DEF = 800 + RESONATOR_LEVEL * 8;
var defFactorFrom = (finalDef) => OWN_DEF / (OWN_DEF + finalDef);
function effectiveShred(snapshot) {
  return shredOf(snapshot.stats, notDotFor(snapshot), snapshot.enemyDef);
}
function effectiveRes(snapshot) {
  return resOf(snapshot.stats, notDotFor(snapshot), snapshot.enemyRes);
}
function resFactorOf(snapshot) {
  return resFactorFrom(effectiveRes(snapshot) / 100);
}
function defFactorOf(snapshot) {
  return defFactorFrom((1 - effectiveShred(snapshot)) * snapshot.enemyDef);
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
      takenFactor: 1,
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
      takenFactor: 1,
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
  const takenFactor = 1 + s(
    20
    /* Stat.DamageTaken */
  ) * notDot;
  const special = !(notDot * notTune);
  const critMult = special ? snapshot.type2CritDmg ? snapshot.type2CritDmg / 100 : 1 : s(
    10
    /* Stat.CritDmg */
  );
  const cr = special ? snapshot.type2CritRate / 100 : s(
    9
    /* Stat.CritRate */
  );
  const critFactor = cr >= 1 ? critMult : 1 - cr + critMult * cr;
  const noCrit = finalMv * finalStat * ampFactor * bonusFactor * tbbFactor * resFactor * defFactor * dealtFactor * takenFactor;
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
    takenFactor,
    critFactor,
    critMult,
    noCrit,
    crit: noCrit * critMult,
    avg: noCrit * critFactor
  };
}
function damageAvgOf(action, stats, atk, hp2, def2, amp, type2Amp, dmgBonus, type2CritRate, type2CritDmg, enemyRes2, enemyDef2) {
  const { scaling } = action;
  if (scaling === null)
    return 0;
  if (scaling === 5)
    return action.mv;
  const notDot = scaling !== 3 ? 1 : 0;
  const notTune = scaling !== 4 ? 1 : 0;
  const finalStat = Math.floor(scaling === 0 ? atk : scaling === 1 ? hp2 : scaling === 2 ? def2 : scaling === 3 ? LEVEL_90_DOT : scaling === 4 ? LEVEL_90_TUNE : NaN);
  const finalMv = (action.mv + stats[
    15
    /* Stat.AddMv */
  ]) * (1 + stats[
    16
    /* Stat.MulMv */
  ] / 100) / 100;
  const ampFactor = 1 + (notDot ? amp : type2Amp) / 100 * notTune;
  const bonusFactor = 1 + dmgBonus / 100 * notDot * notTune;
  const tbbFactor = 1 + stats[
    12
    /* Stat.Tbb */
  ] / 100 * (1 - notTune);
  const resFactor = resFactorFrom(resOf(stats, notDot, enemyRes2) / 100);
  const defFactor = defFactorFrom((1 - shredOf(stats, notDot, enemyDef2)) * enemyDef2);
  const dealtFactor = 1 + stats[
    19
    /* Stat.TotalDmg */
  ] / 100 * notDot;
  const takenFactor = 1 + stats[
    20
    /* Stat.DamageTaken */
  ] / 100 * notDot;
  const special = !(notDot * notTune);
  const critMult = special ? type2CritDmg ? type2CritDmg / 100 : 1 : stats[
    10
    /* Stat.CritDmg */
  ] / 100;
  const cr = special ? type2CritRate / 100 : stats[
    9
    /* Stat.CritRate */
  ] / 100;
  const critFactor = cr >= 1 ? critMult : 1 - cr + critMult * cr;
  const noCrit = finalMv * finalStat * ampFactor * bonusFactor * tbbFactor * resFactor * defFactor * dealtFactor * takenFactor;
  return noCrit * critFactor;
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
  ctx.actionStamp++;
  if (ctx.tracing)
    slot.effective = ZERO_STATS.slice();
  else
    slot.effective.fill(0);
  ctx.wrote = 0;
  const forteBefore = ctx.tracing ? [...slot.forte] : EMPTY_FORTE;
  const energyBefore = slot.energy, concertoBefore = slot.concerto, offtuneBefore = state.offtune;
  if (ctx.tracing) {
    slot.entries = [];
    slot.totals = /* @__PURE__ */ new Map();
  }
  if (casting(
    5
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
  let pre = null;
  if (!ctx.tracing && slot.variants.length !== 0) {
    if (ctx.wrote === 0)
      pre = ZERO_STATS;
    else {
      pre = slot.pre;
      for (let i = 0; i < pre.length; i++)
        pre[i] = slot.effective[i];
    }
  }
  ctx.guarded = pre !== null;
  const snapshots = pre !== null ? state.snapshots ??= [new FightSnapshot(state), new FightSnapshot(state), new FightSnapshot(state), new FightSnapshot(state)] : null;
  if (snapshots !== null)
    snapshots[0].take(state);
  if (ctx.tracing)
    runPhase(6, true);
  else {
    if (slot.constBaseVersion !== ctx.constVersion) {
      slot.constBase.clear();
      slot.variantAt.clear();
      slot.constBaseVersion = ctx.constVersion;
    }
    let base2 = slot.constBase.get(ctx.tagWord);
    if (base2 === void 0)
      slot.constBase.set(ctx.tagWord, base2 = constBaseOf(slot, null, null));
    const effective2 = slot.effective;
    if (ctx.wrote === 0)
      for (let i = 0; i < effective2.length; i++)
        effective2[i] = base2[i];
    else
      for (let i = 0; i < effective2.length; i++)
        effective2[i] = effective2[i] + base2[i];
  }
  ctx.mutHash = 0;
  ctx.recording = pre !== null;
  ctx.readStamp++;
  ctx.readPhase = READ_APPLY;
  replay.length = 0;
  actionHook(action.applyStatsFn);
  runPhase(2, true);
  const replay2 = replay.length, applyMoved = ctx.mutHash !== 0;
  if (pre !== null) {
    const post2 = slot.post2;
    for (let i = 0; i < post2.length; i++)
      post2[i] = slot.effective[i];
  }
  ctx.readPhase = READ_CONVERT;
  actionHook(action.convertStatsFn);
  runPhase(3, true);
  actionHook(action.lateConvertStatsFn);
  runPhase(4, true);
  ctx.recording = false;
  let variantEff = null;
  let variantAt = null;
  let anyDry = false;
  if (pre !== null && snapshots !== null) {
    variantEff = [];
    const primaryHash = ctx.mutHash, primaryEff = slot.effective;
    const [before, after] = snapshots;
    let at = slot.variantAt.get(ctx.tagWord);
    if (at === void 0) {
      const base2 = slot.constBase.get(ctx.tagWord);
      at = { bases: [], diffs: [] };
      for (let v = 0; v < slot.variants.length; v++) {
        const vbase = constBaseOf(slot, slot.variantOf, slot.variants[v]), diff = [];
        for (let i = 0; i < vbase.length; i++)
          if (vbase[i] !== base2[i])
            diff.push(i);
        at.bases.push(vbase);
        at.diffs.push(diff);
      }
      slot.variantAt.set(ctx.tagWord, at);
    }
    variantAt = at;
    for (let v = 0; v < slot.variants.length; v++) {
      const eff = slot.variantEff[v] ??= ZERO_STATS.slice();
      variantEff.push(eff);
      const diff = at.diffs[v], vbase = at.bases[v];
      slot.variantDry[v] = readAny(diff, READ_APPLY | READ_CONVERT);
      if (!slot.variantDry[v])
        continue;
      if (!anyDry) {
        anyDry = true;
        after.take(state);
        ctx.dryRun = true;
      }
      const replayable = !applyMoved && !readAny(diff, READ_APPLY);
      if (replayable)
        sparseRow(diff, vbase, eff, slot.post2, pre, 0, replay2);
      else
        for (let i = 0; i < eff.length; i++)
          eff[i] = pre[i] + vbase[i];
      slot.effective = eff;
      before.restore(state);
      ctx.mutHash = 0;
      if (!replayable) {
        actionHook(action.applyStatsFn);
        runPhase(2, true);
      }
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
    }
    if (anyDry) {
      ctx.dryRun = false;
      after.restore(state);
      slot.effective = primaryEff;
    }
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
    const { gears, length } = applied.list();
    for (let i = 0; i < length; i++) {
      const gear = gears[i];
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
    26
    /* Stat.AddEnergy */
  ]) * (1 + effective[
    14
    /* Stat.EnergyRegenMult */
  ] / 100);
  slot.energy = Math.max(0, slot.energy + energyGain);
  const outro = casting(
    6
    /* Cast.Outro */
  );
  const energyWiped = outro && state.outroDir > 0;
  if (outro && energyWiped)
    slot.energy = 0;
  const spend = action.concerto < 0 ? -action.concerto : 0;
  const concertoShort = spend > 0 && slot.concerto < spend;
  if ((spend > 0 || outro) && slot.concerto > 100)
    slot.concerto = 100;
  slot.concerto = Math.max(0, slot.concerto + action.concerto + effective[
    27
    /* Stat.AddConcerto */
  ]);
  const built = action.offtune + effective[
    28
    /* Stat.AddOfftune */
  ];
  state.offtune += (built < 0 ? built : built * (effective[
    13
    /* Stat.OfftuneBuildup */
  ] / 100)) + effective[
    29
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
  const forte = slot.forte, forteShort = [false, false, false, false, false];
  for (let i = 0; i < 5; i++) {
    const cap = slot.resonator?.maxForte[i] ?? 0;
    const delta = action.forteDeltas[i] + effective[ADD_FORTE[i]];
    if (action.resetForte[i])
      forte[i] = 0;
    if (cap > 0 && delta < 0 && forte[i] > cap)
      forte[i] = cap;
    if (delta > 0 && forte[i] < 0)
      forte[i] = 0;
    forte[i] = forte[i] + delta;
    if (forte[i] < 0)
      forteShort[i] = true;
  }
  const avgOf = (eff) => {
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
    return damageAvgOf(action, eff, b + eff[
      6
      /* Stat.BonusAtk */
    ] / 100 * b + eff[
      3
      /* Stat.FlatAtk */
    ], bh + eff[
      7
      /* Stat.BonusHp */
    ] / 100 * bh + eff[
      4
      /* Stat.FlatHp */
    ], bd + eff[
      8
      /* Stat.BonusDef */
    ] / 100 * bd + eff[
      5
      /* Stat.FlatDef */
    ], eff[
      18
      /* Stat.Amp */
    ], eff[TYPE2_AMP_INDEX], eff[
      17
      /* Stat.DmgBonus */
    ], eff[TYPE2_CRIT_RATE_INDEX], eff[TYPE2_CRIT_DMG_INDEX], enemyRes(), enemyDef());
  };
  let variantAvg = null;
  if (variantEff !== null && snapshots !== null) {
    const [, , banked, done] = snapshots;
    const replay4 = replay.length;
    const post4 = slot.post4;
    for (let i = 0; i < post4.length; i++)
      post4[i] = effective[i];
    banked.take(state);
    ctx.mutHash = 0;
    ctx.recording = true;
    ctx.readPhase = READ_AFTER;
    actionHook(action.afterActionFn);
    runPhase(5, false);
    ctx.recording = false;
    ctx.buff = null;
    const primaryHash = ctx.mutHash;
    variantAvg = [];
    let anyDone = false;
    for (let v = 0; v < variantEff.length; v++) {
      const eff = variantEff[v];
      const diff = variantAt.diffs[v], vbase = variantAt.bases[v];
      const dry = slot.variantDry[v];
      if (!dry && !readAny(diff, READ_AFTER)) {
        sparseRow(diff, vbase, eff, effective, pre, 0, replay.length);
        if (resourceMoved(diff, eff, effective))
          slot.variantUnsafe[v] = true;
      } else {
        if (!dry) {
          sparseRow(diff, vbase, eff, post4, pre, 0, replay4);
          if (resourceMoved(diff, eff, post4))
            slot.variantUnsafe[v] = true;
        }
        if (!anyDone) {
          anyDone = true;
          done.take(state);
          ctx.dryRun = true;
        }
        slot.effective = eff;
        banked.restore(state);
        ctx.mutHash = 0;
        ctx.stacks = -1;
        actionHook(action.afterActionFn);
        runPhase(5, false);
        if (ctx.mutHash !== primaryHash)
          slot.variantUnsafe[v] = true;
      }
      variantAvg.push(avgOf(eff));
    }
    if (anyDone) {
      ctx.dryRun = false;
      done.restore(state);
      ctx.buff = null;
      slot.effective = effective;
    }
    ctx.guarded = false;
  } else {
    ctx.mutHash = 0;
    actionHook(action.afterActionFn);
    runPhase(5, false);
    ctx.buff = null;
  }
  const atk = base + effective[
    6
    /* Stat.BonusAtk */
  ] / 100 * base + effective[
    3
    /* Stat.FlatAtk */
  ];
  const hp2 = baseHp + effective[
    7
    /* Stat.BonusHp */
  ] / 100 * baseHp + effective[
    4
    /* Stat.FlatHp */
  ];
  const def2 = baseDef + effective[
    8
    /* Stat.BonusDef */
  ] / 100 * baseDef + effective[
    5
    /* Stat.FlatDef */
  ];
  const mv = (action.mv + effective[
    15
    /* Stat.AddMv */
  ]) * (1 + effective[
    16
    /* Stat.MulMv */
  ] / 100);
  const avg = damageAvgOf(action, effective, atk, hp2, def2, effective[
    18
    /* Stat.Amp */
  ], effective[TYPE2_AMP_INDEX], effective[
    17
    /* Stat.DmgBonus */
  ], effective[TYPE2_CRIT_RATE_INDEX], effective[TYPE2_CRIT_DMG_INDEX], enemyRes(), enemyDef());
  const result = {
    action,
    member: slot.name,
    slot: action.slot ?? slot.name,
    triggered,
    triggeredBy,
    group: null,
    groupEnd: false,
    groupSpill: null,
    queued: false,
    mv,
    avg,
    variantAvg
  };
  const snapshot = !ctx.tracing ? null : {
    ...result,
    type: ctx.overrideType1 ?? action.type1,
    // the effective type — see ResolvedSnapshot.type
    stat,
    stats: effective,
    atk,
    hp: hp2,
    def: def2,
    amp: effective[
      18
      /* Stat.Amp */
    ],
    type2Amp: effective[TYPE2_AMP_INDEX],
    type2CritRate: effective[TYPE2_CRIT_RATE_INDEX],
    type2CritDmg: effective[TYPE2_CRIT_DMG_INDEX],
    dmgBonus: effective[
      17
      /* Stat.DmgBonus */
    ],
    enemyRes: enemyRes(),
    enemyDef: enemyDef(),
    entries: slot.entries,
    forte: [...slot.forte],
    forteBefore,
    maxForte: slot.resonator?.maxForte ?? EMPTY_FORTE,
    energy: slot.energy,
    concerto: slot.concerto,
    offtune: state.offtune,
    energyBefore,
    concertoBefore,
    offtuneBefore,
    concertoShort,
    forteShort,
    energyWiped,
    realEnergyBefore,
    heldLocal,
    heldGlobal,
    heldEnemy,
    opensFields
  };
  if (casting(
    6
    /* Cast.Outro */
  )) {
    const n = state.slots.length;
    state.active = (state.active + state.outroDir + n) % n;
  }
  return snapshot ?? result;
}
function run(state, rotation) {
  const out = [];
  const steps = [];
  for (const entry of rotation) {
    const group = entry.actions !== void 0 ? entry : null;
    const members = group ? group.actions : [entry];
    members.forEach((a, k) => steps.push({ action: a, slot: -1, by: null, group, end: group !== null && k === members.length - 1, spill: null, queued: false }));
  }
  ctx.insideGroup = false;
  let spillGroup = null;
  let i = 0, guard = 0;
  while (i < steps.length) {
    if (++guard > 1e4)
      throw new Error("action queue did not drain");
    const step = steps[i++];
    spillGroup = step.group ?? step.spill;
    if (step.group)
      ctx.insideGroup = !step.end;
    const before = state.active;
    state.onField = before;
    if (step.slot >= 0)
      state.active = step.slot;
    let action = step.action;
    if (step.action.resolveFn) {
      ctx.state = state;
      ctx.slot = state.slot;
      action = step.action.resolveFn();
      if (!action)
        continue;
    }
    pendingQueue.length = 0;
    const triggered = step.slot >= 0 || step.action.triggered || action.triggered || isCast(
      action,
      6
      /* Cast.Outro */
    );
    const ms = state.slot.mainslot;
    const by = ms && action.triggered && (action === ms.onfield || action === ms.outro || action === ms.cancel) ? { name: ms.name, source: state.sourceOf.get(ms) ?? state.slot.name } : step.by;
    const result = evaluate(state, action, triggered, by);
    result.group = step.group;
    result.groupEnd = step.end;
    result.groupSpill = step.spill;
    result.queued = step.queued;
    out.push(result);
    if (step.slot >= 0 && state.active === step.slot)
      state.active = before;
    if (pendingQueue.length) {
      const queued = [];
      for (const p of pendingQueue)
        queued.push({ action: p.action, slot: p.slot, by: p.by, group: null, end: false, spill: p.event ? null : spillGroup, queued: true });
      steps.splice(i, 0, ...queued);
    }
  }
  return out;
}
function sparseRow(diff, vbase, eff, from, pre, k0, k1) {
  for (let i = 0; i < eff.length; i++)
    eff[i] = from[i];
  const index = replay.index, value = replay.value;
  for (let d = 0; d < diff.length; d++) {
    const i = diff[d];
    let x = pre[i] + vbase[i];
    for (let k = k0; k < k1; k++)
      if (index[k] === i)
        x = x + value[k];
    eff[i] = x;
  }
}
function resourceMoved(diff, eff, from) {
  for (let d = 0; d < diff.length; d++) {
    const i = diff[d];
    if (RESOURCE_MASK[i] && eff[i] !== from[i])
      return true;
  }
  return false;
}
var RESOURCE_MASK = ZERO_STATS.map(() => false);
for (const s of RESOURCE_STATS)
  RESOURCE_MASK[s] = true;
var ADD_FORTE = [
  30,
  31,
  32,
  33,
  34
  /* Stat.AddForte5 */
];
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
  type1;
  type2;
  cast;
  cast2;
  swapOut;
  node;
  scaling;
  mv;
  energy;
  concerto;
  offtune;
  slot;
  resetEnergy;
  forte1;
  /** forte1-5 as one array, for evaluate()'s banking loop. */
  forteDeltas;
  forte2;
  forte3;
  forte4;
  forte5;
  /** `resetForte1`-`resetForte5` as one array, indexed the way `TeamMember.forte` is. */
  resetForte;
  resolveFn;
  triggered;
  cutscene;
  /** What this was built from, kept so `variant()` can rebuild it with a change or two. */
  def;
  /** The cast this is the dash- or jump-cancelled form of; null on every ordinary one. A cancel is
   *  a fresh Action carrying the original's hooks and cast tags, so a bare `===` against the cast a
   *  kit named would miss it — context.ts's own `runningAction()` is what reads this. Engine-owned:
   *  set by `cancelled()` below, never by a kit. */
  cancelOf = null;
  /** Lazily-filled cache for runtime.ts's `tagWordOf()` — this action's own element/type/type2, as the
   *  one word every scoped stat contribution tests against. Engine-owned; never set by a kit. */
  _tagWord;
  constructor(name, def2 = {}) {
    super({ ...def2, name });
    this.element = def2.element ?? null;
    this.type1 = def2.type ?? null;
    this.type2 = def2.type2 ?? null;
    this.cast = def2.cast ?? null;
    this.cast2 = def2.cast2 ?? null;
    this.swapOut = def2.swapOut ?? false;
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
    this.forteDeltas = [this.forte1, this.forte2, this.forte3, this.forte4, this.forte5];
    this.resetForte = [!!def2.resetForte1, !!def2.resetForte2, !!def2.resetForte3, !!def2.resetForte4, !!def2.resetForte5];
    this.resolveFn = def2.resolve;
    this.triggered = def2.triggered ?? false;
    this.cutscene = def2.cutscene ?? false;
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
    return this.cancelled(DODGE);
  }
  /** The same, cancelled by a jump rather than a dash — the JUMP marker in the DODGE's place. */
  jumpCancel() {
    return this.cancelled(JUMP);
  }
  /** Both of the above: the cast's own effects with none of its hit, pointed back at the cast it
   *  cancels so `runningAction()` still reads the two as one. */
  cancelled(marker) {
    const d = this.def;
    const out = new _Action(`${this.name} (Cancelled)`, {
      cast: d.cast,
      swapOut: d.swapOut,
      combatStart: d.combatStart,
      updateDebuffs: d.updateDebuffs,
      updateGlobal: d.updateGlobal,
      // the marker is queued ahead of the hook, so it resolves before anything the cancelled
      // press itself queues — the dash is what interrupts the cast, not something trailing it
      updateBuffs: () => {
        queue(marker);
        d.updateBuffs?.();
      },
      applyStats: d.applyStats,
      convertStats: d.convertStats,
      afterAction: d.afterAction,
      lateConvertStats: d.lateConvertStats,
      display: d.display
    });
    out.cancelOf = this;
    return out;
  }
  /** The follow-up hit of a multi-hit coordinated attack — the same hit under the same name,
   *  but inside the lead's ICD, so it carries none of the lead's grants (no `updateBuffs`). */
  paired() {
    return this.variant(this.name, { updateBuffs: void 0 });
  }
  /** The same cast made on the way out, named "… (Swap)" — identical in every field, but
   *  a swap-out (its owner is leaving the field as it lands) and reported as triggered. */
  swap() {
    return this.variant(`${this.name} (Swap)`, { triggered: true, swapOut: true });
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
var introAt = (n) => new Action(`Intro Placeholder (${["1st", "2nd", "3rd"][n]})`, {
  resolve: () => {
    const resonator = currentMember().resonator;
    if (!resonator)
      throw new Error(`${currentMember().name} casts an Intro but has no Resonator equipped`);
    return resonator.introFn();
  }
});
var INTRO_1 = introAt(0);
var INTRO_2 = introAt(1);
var INTRO_3 = introAt(2);
var INTROS = [INTRO_1, INTRO_2, INTRO_3];
var introPosition = (action) => INTROS.indexOf(action);
var NOINTRO_1 = new Action("No Intro (1st)");
var NOINTRO_2 = new Action("No Intro (2nd)");
var NOINTRO_3 = new Action("No Intro (3rd)");
var NOINTROS = [NOINTRO_1, NOINTRO_2, NOINTRO_3];
var nointroPosition = (action) => NOINTROS.indexOf(action);
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
var FIRST_INTRO = new Action("First Intro");
var NOINTRO_FIRST = new Action("First No Intro");
var OUTRO = new Action("Outro Placeholder", {
  // resolved when the row is reached, not when the visit opens: a kit whose outro has a Unison
  // form (shared/unison.ts's `unisonOutro`) only holds Unison once the visit's own Liberation has
  // granted it, so the pick has to wait for the swap itself
  resolve: () => {
    const resonator = currentMember().resonator;
    if (!resonator)
      throw new Error(`${currentMember().name} outros but has no Resonator equipped`);
    return resonator.outroFn();
  }
});
var SWAP = new Action("Swap", { swapOut: true, triggered: true });
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
  /** The FIRST_INTRO chain, played in place of `intro` on this resonator's first arrival. */
  firstIntro = null;
  /** The NOINTRO_FIRST chain, played in place of `opener` on that same first arrival. */
  firstOpener = null;
  /** The INTRO_1/2/3 chains, each played in place of `intro` while this resonator stands in that
   *  position, and the NOINTRO_1/2/3 chains likewise in place of `opener`. */
  intros = [null, null, null];
  openers = [null, null, null];
  constructor(actions) {
    let phase = "none";
    const prefix = [], loop = [], dbl = [], first = [], firstPre = [];
    const loops = [[], [], []], prefixes = [[], [], []];
    let inStart = [];
    const starts = [null, null, null];
    const body = () => phase === "opener" ? prefix : phase === "intro" ? loop : phase === "double" ? dbl : phase === "first" ? first : phase === "firstOpener" ? firstPre : phase.startsWith("intro@") ? loops[Number(phase.slice(6))] : phase.startsWith("opener@") ? prefixes[Number(phase.slice(7))] : null;
    let shared = false;
    let sharedDouble = false;
    let openerExit = null, introExit = null, doubleExit = null;
    let firstExit = null, firstOpenerExit = null;
    const introExits = [null, null, null], openerExits = [null, null, null];
    const sharedInto = [null, null, null];
    const close = (action) => {
      if (phase === "opener") {
        openerExit = action;
        phase = "none";
      } else if (phase === "intro") {
        introExit = action;
        phase = "none";
      } else if (phase === "double") {
        doubleExit = action;
        phase = "none";
      } else if (phase === "first") {
        firstExit = action;
        phase = "none";
      } else if (phase === "firstOpener") {
        firstOpenerExit = action;
        phase = "none";
      } else if (phase.startsWith("intro@")) {
        introExits[Number(phase.slice(6))] = action;
        phase = "none";
      } else if (phase.startsWith("opener@")) {
        openerExits[Number(phase.slice(7))] = action;
        phase = "none";
      } else
        throw new Error(`rotation: ${action.name} closes a chain that was never opened`);
    };
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
        } else
          close(action);
      } else if (inStart.length) {
        for (const at of inStart)
          starts[at].push(action);
        body()?.push(action);
      } else if (action === NOINTRO) {
        if (openerExit || prefix.length || shared || sharedDouble)
          throw new Error("rotation: only one NOINTRO chain");
        if (phase !== "none")
          throw new Error("rotation: NOINTRO opens a chain while one is still open");
        phase = "opener";
      } else if (action === DOUBLE_INTRO) {
        if (doubleExit || dbl.length)
          throw new Error("rotation: only one DOUBLE_INTRO section");
        if (phase === "opener")
          sharedDouble = true;
        else if (phase !== "none")
          throw new Error("rotation: DOUBLE_INTRO opens a chain while one is still open");
        phase = "double";
      } else if (action === FIRST_INTRO) {
        if (firstExit || first.length)
          throw new Error("rotation: only one FIRST_INTRO chain");
        if (phase !== "none")
          throw new Error("rotation: FIRST_INTRO opens a chain while one is still open");
        phase = "first";
      } else if (action === NOINTRO_FIRST) {
        if (firstOpenerExit || firstPre.length)
          throw new Error("rotation: only one NOINTRO_FIRST chain");
        if (phase !== "none")
          throw new Error("rotation: NOINTRO_FIRST opens a chain while one is still open");
        phase = "firstOpener";
      } else if (nointroPosition(action) >= 0) {
        const n = nointroPosition(action);
        if (openerExits[n] || prefixes[n].length || sharedInto[n] !== null)
          throw new Error(`rotation: only one ${action.name} chain`);
        if (phase !== "none")
          throw new Error(`rotation: ${action.name} opens a chain while one is still open`);
        phase = `opener@${n}`;
      } else if (introPosition(action) >= 0) {
        const n = introPosition(action);
        if (phase === `intro@${n}`) {
          loops[n].push(action);
          continue;
        }
        if (introExits[n] || loops[n].length)
          throw new Error(`rotation: only one ${action.name} chain`);
        if (phase === `opener@${n}`)
          sharedInto[n] = n;
        else if (phase !== "none")
          throw new Error(`rotation: ${action.name} opens a chain while one is still open`);
        phase = `intro@${n}`;
      } else if (action === INTRO) {
        if (phase === "intro") {
          loop.push(action);
          continue;
        }
        if (phase.startsWith("intro@")) {
          loops[Number(phase.slice(6))].push(action);
          continue;
        }
        if (introExit)
          throw new Error("rotation: only one INTRO chain");
        if (phase === "opener")
          shared = true;
        if (phase.startsWith("opener@"))
          sharedInto[Number(phase.slice(7))] = "main";
        if (phase === "double")
          doubleExit = SWAP;
        phase = "intro";
      } else if (action === OUTRO) {
        inStart = [];
        close(action);
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
    const stand = introExits.findIndex(Boolean);
    if (!introExit && stand < 0)
      throw new Error("rotation: every rotation needs an INTRO chain closed by an outro");
    if (!introExit) {
      introExit = introExits[stand];
      loop.push(...loops[stand]);
    }
    this.startCombat = starts.map((cast) => cast && cast.length ? cast : null);
    if (sharedDouble) {
      if (doubleExit !== OUTRO)
        throw new Error("rotation: a NOINTRO chain shared with a DOUBLE_INTRO section needs that section closed by an OUTRO, not run into INTRO");
      this.opener = { entry: NOINTRO, body: [...prefix, ...dbl], exit: doubleExit };
    } else if (openerExit || shared) {
      this.opener = { entry: NOINTRO, body: shared ? [...prefix, ...loop] : prefix, exit: openerExit ?? introExit };
    } else if (prefix.length) {
      throw new Error("rotation: the NOINTRO chain is closed by neither an outro nor an INTRO");
    }
    if (doubleExit)
      this.doubleIntro = { entry: DOUBLE_INTRO, body: dbl, exit: doubleExit };
    if (firstExit)
      this.firstIntro = { entry: INTRO, body: first, exit: firstExit };
    if (firstOpenerExit)
      this.firstOpener = { entry: NOINTRO, body: firstPre, exit: firstOpenerExit };
    this.intro = { entry: INTRO, body: loop, exit: introExit };
    for (const n of [0, 1, 2]) {
      const exit = introExits[n];
      if (exit)
        this.intros[n] = { entry: INTRO, body: loops[n], exit };
      const into = sharedInto[n];
      if (openerExits[n])
        this.openers[n] = { entry: NOINTRO, body: prefixes[n], exit: openerExits[n] };
      else if (into === "main")
        this.openers[n] = { entry: NOINTRO, body: [...prefixes[n], ...loop], exit: introExit };
      else if (into !== null) {
        if (!exit)
          throw new Error(`rotation: the ${NOINTROS[n].name} chain runs into ${INTROS[n].name}, which is never closed`);
        this.openers[n] = { entry: NOINTRO, body: [...prefixes[n], ...loops[n]], exit };
      } else if (prefixes[n].length)
        throw new Error(`rotation: the ${NOINTROS[n].name} chain is closed by neither an outro nor an Intro`);
    }
  }
};
function teamPlayable(rotations, names) {
  const openerChain = (i) => rotations[i].openers[i] ?? rotations[i].opener ?? rotations[i].firstOpener;
  if (!openerChain(0))
    return `${names[0]} leads the team but declares no NOINTRO chain`;
  for (let i = 0; i < rotations.length; i++) {
    const r = rotations[i], nxt = (i + 1) % rotations.length;
    if ([r.intros[i] ?? r.intro, r.firstIntro, r.firstOpener, openerChain(i)].some((c) => c?.exit === SWAP) && !openerChain(nxt)) {
      return `${names[nxt]} follows ${names[i]}'s swap-out but declares no NOINTRO chain`;
    }
    const d = r.doubleIntro;
    if (!d)
      continue;
    const prev = (i + rotations.length - 1) % rotations.length;
    if (d.exit === SWAP && !openerChain(prev))
      return `${names[prev]} plays during ${names[i]}'s double Intro but declares no NOINTRO chain`;
    if (d.exit === SWAP && rotations[0].doubleIntro)
      return `${names[i]}: a swap-form double Intro can't play in a team whose leader has a double Intro`;
    if (d.exit === OUTRO && i === 1 && !rotations[0].doubleIntro && rotations[2]?.doubleIntro?.exit !== OUTRO) {
      return `${names[i]}'s double Intro has nobody to hand back to: ${names[0]} has already played, and ${names[2]} declares no double Intro to pair with`;
    }
  }
  return null;
}
function runRotations(state, rotations, sections) {
  const why = teamPlayable(rotations, state.slots.map((s) => s.name));
  if (why)
    throw new Error(why);
  const visited = /* @__PURE__ */ new Set(), scrambled = /* @__PURE__ */ new Set();
  const openerChain = (i) => {
    const r = rotations[i];
    const main = r.openers[i] ?? r.opener;
    return !visited.has(i) && r.firstOpener ? r.firstOpener : main ?? r.firstOpener;
  };
  const last = state.slots.length - 1;
  const out = Array.from({ length: sections }, () => []);
  let section = 0;
  let closing = false;
  let awaiting = 0, closePending = false;
  const doubled = /* @__PURE__ */ new Set(), mained = /* @__PURE__ */ new Set();
  let cycleStart = 0;
  const place = (snaps) => {
    if (section >= sections)
      return;
    if (!closing) {
      out[section].push(...snaps);
      return;
    }
    let cut = 0;
    if (snaps.length && isCast(
      snaps[0].action,
      5
      /* Cast.Intro */
    )) {
      cut = 1;
      while (cut < snaps.length && snaps[cut].queued)
        cut++;
    }
    out[section].push(...snaps.slice(0, cut));
    section++;
    closing = false;
    if (section < sections)
      out[section].push(...snaps.slice(cut));
  };
  const introChain = (i) => {
    const r = rotations[i];
    const main = r.intros[i] ?? r.intro;
    return !visited.has(i) && r.firstIntro ? r.firstIntro : main;
  };
  let swapped = false;
  const arrival = (i) => {
    if (!swapped)
      return introChain(i);
    swapped = false;
    const c = openerChain(i);
    if (!c)
      throw new Error(`${state.slots[i].name} is swapped into but declares no NOINTRO chain`);
    return c;
  };
  const runChain = (i, chain) => {
    state.active = i;
    if (!state.slots[i].resonator)
      throw new Error(`${state.slots[i].name} outros but has no Resonator equipped`);
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
    if (chain.entry !== DOUBLE_INTRO) {
      if (!mained.size)
        cycleStart = i;
      mained.add(i);
    }
    const exit = chain.exit === SWAP ? SWAP : OUTRO;
    const list = chain.entry === INTRO || chain.entry === DOUBLE_INTRO ? [INTRO, ...casts, exit] : [...casts, exit];
    const snaps = run(state, list);
    state.outroDir = 1;
    swapped = chain.exit === SWAP;
    if (swapped)
      state.active = (i + 1) % rotations.length;
    place(snaps);
    if (i === last && chain.entry !== DOUBLE_INTRO) {
      if (awaiting)
        closePending = true;
      else
        closing = true;
    }
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
  const opener = openerChain(0);
  runChain(0, opener);
  let handedBack = null;
  const visit = (i) => {
    const from = handedBack;
    handedBack = null;
    const nxt = (i + 1) % rotations.length;
    if (mained.has(i)) {
      if (i !== cycleStart || mained.size < rotations.length) {
        state.active = nxt;
        return;
      }
      mained.clear();
    }
    let giver = from ?? (i + rotations.length - 1) % rotations.length;
    const preVisitDue = (at) => !mained.has(at) && !doubled.has(at) && rotations[at].doubleIntro?.exit === OUTRO;
    const paired = !!mained.size && preVisitDue(i) && preVisitDue(nxt);
    const d = mained.size && !mained.has(nxt) && !paired ? rotations[nxt].doubleIntro : void 0;
    if (d && !doubled.has(nxt)) {
      doubled.add(nxt);
      if (d.exit === OUTRO) {
        runChain(nxt, d);
        giver = nxt;
      } else {
        state.active = nxt;
        place(run(state, [INTRO, ...d.body, SWAP]));
        state.active = i;
        runChain(i, openerChain(i));
        return;
      }
    }
    const own = mained.size ? rotations[i].doubleIntro : void 0;
    let waited = false;
    if (own && own.exit === OUTRO && !doubled.has(i)) {
      doubled.add(i);
      runChain(i, own);
      handedBack = i;
      state.active = paired ? nxt : giver;
      mained.delete(i);
      awaiting++;
      waited = true;
      while (state.active !== i && !mained.has(i) && section < sections)
        visit(state.active);
      awaiting--;
      if (mained.has(i)) {
        closeIfPending();
        return;
      }
    }
    doubled.delete(i);
    runChain(i, arrival(i));
    if (waited)
      closeIfPending();
  };
  function closeIfPending() {
    if (awaiting || !closePending)
      return;
    closePending = false;
    closing = true;
  }
  if (rotations[0].doubleIntro) {
    let first = true, trips = 0;
    while (section < sections) {
      if (++trips > 100)
        throw new Error("rotation scheduler did not fill every section");
      for (let i = first ? 1 : 0; i < rotations.length && section < sections; i++) {
        const d = rotations[i].doubleIntro;
        if (d)
          runChain(i, d);
      }
      first = false;
      for (let i = 0; i < rotations.length && section < sections; i++)
        runChain(i, arrival(i));
    }
    return out;
  }
  let guard = 0;
  while (section < sections) {
    if (++guard > 100)
      throw new Error("rotation scheduler did not fill every section");
    visit(state.active);
  }
  return out;
}

// dist/src/shared/tunebreak.js
var ENEMY_MAX_OFFTUNE = 384e3;
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
      addEnemyStat(35, -20, attribute2);
    }
  }
});
var TUNE_BREAK_COOLDOWN = new Debuff({
  name: "Tune Break Cooldown",
  maxStacks: 4,
  display: () => "Tune Break Cooldown",
  updateBuffs: () => {
    if (triggeredAction() || runningAction(TUNE_BREAK) || !isActive())
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
      28
      /* Stat.AddOfftune */
    );
    if (built > 0)
      addStat(29, -built * getStat(
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
    if (!runningAction(TUNE_BREAK))
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
    if (triggeredAction() || runningAction(TUNE_BREAK) || !isActive())
      return;
    if (midActionGroup())
      return;
    if (stacksOfEnemy(TUNE_RUPTURE_INTERFERED) > 0 || stacksOfEnemy(TUNE_HACK_INTERFERED) > 0)
      return;
    if (isCast(
      currentAction(),
      4
      /* Cast.Liberation */
    ) || isCast(
      currentAction(),
      5
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
  cast: 8,
  cutscene: true,
  type: 36864,
  mv: 1600,
  slot: TUNE_BREAK_ENEMY.name,
  // The whole bar, straight off it: `DirectOfftune` rather than a declared `offtune`, because a
  // drain is an amount the bar moves by, not something the team's Off-Tune Buildup Rate builds
  // (see evaluate.ts's own evaluate()). Sourced to the break itself, so the off-tune panel names it.
  applyStats: () => {
    addStat(29, -ENEMY_MAX_OFFTUNE);
  }
});
function interferedWindow(def2) {
  const self2 = new Debuff({
    ...def2,
    maxStacks: 11,
    display: () => def2.name ?? "",
    updateBuffs: () => {
      if (triggeredAction() || runningAction(TUNE_BREAK) || !isActive())
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
var TUNE_STRAIN_INTERFERED = new Debuff({
  name: "Tune Strain - Interfered",
  maxStacks: 1,
  // the Strain payout, to a slot that responds to it: every point of its own Tune Break Boost is
  // +0.12% total damage a stack. Late, by when every Tbb source has landed.
  lateConvertStats: () => {
    if (isHeld(TUNE_STRAIN_RESPONDER))
      addStat(19, 0.12 * getStat(
        12
        /* Stat.Tbb */
      ) * frozenStacks());
  }
});
var TUNE_STRAIN_RESPONDER = new Buff({});
var TUNE_HACK_INTERFERED = interferedWindow({ name: "Tune Hack - Interfered" });
function shifting(name, interfered) {
  const self2 = new Debuff({
    name,
    updateDebuffs: () => {
      if (!runningAction(TUNE_BREAK))
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
  if (runningAction(TUNE_BREAK) && applied2(TUNE_RUPTURE_INTERFERED))
    queue(action);
};
var tuneHackResponse = (action) => {
  if (runningAction(TUNE_BREAK) && applied2(TUNE_HACK_INTERFERED))
    queue(action);
};

// dist/src/teamrun.js
var hitsOf = (line) => line.members?.length ? line.members : [line.snap];
var toLine = (snap, spill = false) => ({ id: snap.action.name, isChain: false, parts: [], snap, mv: snap.mv, avg: snap.avg, spill });
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
      const dmg = { avg: snap.avg };
      parts.push({ snap, dmg });
      if (member2) {
        members.push(snap);
        mv += snap.mv;
        avg += dmg.avg;
        if (snap.groupEnd)
          ended = true;
      } else
        extras.push(snap);
    }
    lines.push({ id: head.group.name, isChain: true, parts, members, snap: members[members.length - 1], mv, avg });
    for (const snap of extras)
      lines.push(toLine(snap, true));
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
  const fields = /* @__PURE__ */ new Map();
  lines.forEach((l, i2) => {
    const field = l.snap.action.field;
    if (!field || !hitsOf(l).every((h) => h.action.field === field))
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
  const file = (map, at, summary) => {
    const list = map.get(at);
    if (list)
      list.push(summary);
    else
      map.set(at, [summary]);
  };
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
      const list = groups.get(open);
      if (list)
        list.push(i2);
      else
        groups.set(open, [i2]);
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
      if (open >= 0)
        file(after, open, summary);
      else
        file(before, hits[0], summary);
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
function variantSums(rotationLines, members, variants, state) {
  const counts = members.map((_, i) => variants?.[i]?.length ?? 0);
  if (!counts.some(Boolean))
    return members.map(() => []);
  const n = rotationLines.length;
  const nameIndex = new Map(members.map((m, i) => [m.name, i]));
  const acc = counts.map((c) => Array.from({ length: c }, () => ({ total: 0, bySlot: /* @__PURE__ */ new Map(), sectionTotals: [], sectionBySlot: [] })));
  const avgs = counts.map((c) => new Array(c).fill(0));
  const slotIndex = /* @__PURE__ */ new Map();
  const indexOf = (slot) => {
    let i = slotIndex.get(slot);
    if (i === void 0)
      slotIndex.set(slot, i = slotIndex.size);
    return i;
  };
  for (const lines of rotationLines) {
    const secTotal = counts.map((c) => new Array(c).fill(0));
    const secBySlot = counts.map((c) => Array.from({ length: c }, () => []));
    const secOrder = [], seen = /* @__PURE__ */ new Set();
    for (const line of lines) {
      if (line.mv === 0)
        continue;
      for (let i = 0; i < counts.length; i++)
        for (let v = 0; v < counts[i]; v++)
          avgs[i][v] = line.avg;
      if (!line.isChain) {
        const snap = line.snap;
        const i = nameIndex.get(snap.member);
        if (i !== void 0 && snap.variantAvg !== null)
          for (let v = 0; v < counts[i]; v++)
            avgs[i][v] = snap.variantAvg[v];
      } else {
        const hits = new Set(line.members ?? []);
        for (const p of line.parts) {
          if (!hits.has(p.snap))
            continue;
          const i = nameIndex.get(p.snap.member);
          if (i === void 0 || p.snap.variantAvg === null)
            continue;
          for (let v = 0; v < counts[i]; v++)
            avgs[i][v] = avgs[i][v] + (p.snap.variantAvg[v] - p.dmg.avg);
        }
      }
      const slot = line.snap.slot, k = indexOf(slot);
      if (!seen.has(k)) {
        seen.add(k);
        secOrder.push(slot);
      }
      for (let i = 0; i < counts.length; i++) {
        for (let v = 0; v < counts[i]; v++) {
          const avg = avgs[i][v];
          const by = secBySlot[i][v];
          by[k] = (by[k] ?? 0) + avg;
          secTotal[i][v] = secTotal[i][v] + avg;
        }
      }
    }
    for (let i = 0; i < counts.length; i++) {
      for (let v = 0; v < counts[i]; v++) {
        const a = acc[i][v];
        a.sectionTotals.push(secTotal[i][v]);
        const by = /* @__PURE__ */ new Map();
        for (const slot of secOrder)
          by.set(slot, secBySlot[i][v][slotIndex.get(slot)]);
        a.sectionBySlot.push(by);
        a.total += secTotal[i][v] / n;
        for (const [slot, x] of by)
          a.bySlot.set(slot, (a.bySlot.get(slot) ?? 0) + x / n);
      }
    }
  }
  return acc.map((list, i) => list.map((a, v) => ({ ...a, unsafe: state.slots[i].variantUnsafe[v] })));
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
    const c = combo[i];
    withTeam(state, () => {
      for (const g of m.loadout.pieces(c.weapon, c.echo, c.mainstat, c.sequence, c.matrix !== null, c.highSubs))
        equip(g, 1);
    });
    const alts = variants?.[i];
    if (alts?.length) {
      const slot = state.slots[i];
      slot.variantOf = c.mainstat;
      slot.variants = alts;
      slot.variantAt = /* @__PURE__ */ new Map();
      slot.variantUnsafe = alts.map(() => false);
    }
  });
  state.active = 0;
  withTeam(state, () => equipEnemy(TUNE_BREAK_ENEMY));
  const rotationLines = runRotations(state, members.map((m, i) => m.loadout.rotationAt(combo[i].sequence)), 4).map(toLines);
  const { total, bySlot, sectionTotals, sectionBySlot } = sumRun(rotationLines, (line) => line.avg);
  const variantRuns = variantSums(rotationLines, members, variants, state);
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

// dist/src/shared/helpers.js
function lostOnSwap() {
  if (currentAction().swapOut)
    revokeCurrent(currentGear());
}
function handoffWindow(buff) {
  const mine = currentTeam().slot === currentMember();
  if (frozenStacks() < 2) {
    if (mine && casting(
      6
      /* Cast.Outro */
    ))
      applyCurrent(buff, 1);
    return;
  }
  if (!mine && !casting(
    5
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
function oneSecondPassed() {
  return isActive() && !triggeredAction() && !currentAction().cutscene;
}
function coordinatedBuff(name, stacks, owner, tick, { enemy = false, hits = 1, every = 1, applyStats } = {}) {
  const fire = () => {
    if (!oneSecondPassed())
      return;
    const spent = stacks - frozenStacks() + 1;
    const summons = Math.floor(spent / every) > Math.floor((spent - 1) / every) ? hits : 0;
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
  name: `${resonator}: Matrix Buff`,
  constantStats: () => {
    if (totalDmg)
      addStat(19, totalDmg / 1.2);
  },
  ...def2
});

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
var negativeStatusRung = (ladder, held) => held < 1 ? null : ladder[Math.min(held, ladder.length - 1)];
var HAVOC_BANE = new Debuff({
  name: "Havoc Bane",
  maxStacks: 3,
  applyStats: () => {
    addEnemyStat(36, 2 * frozenStacks());
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
    for (let n = Math.max(1, held - applied2(GLACIO_CHAFE) + 1); n <= held; n++) {
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
  // A kit's own Fusion Burst DMG instance carries no motion value of its own (Aemeath's Seraphic
  // Duet): what it is worth is the cap rung — a Fusion Burst only ever calculates at the cap,
  // unlike Electro Flare's ticks at the current count (below) — and the kit's own percentage
  // multiplies that. Added from here, sourced to the rung itself ("Fusion Burst - 10 Stacks"),
  // which is where the number comes from; the cap is the fight's (Chisa raises it), not the
  // declared 10.
  applyStats: () => {
    if (!isType(
      1048576
      /* Type2.FusionBurst */
    ) || currentAction().mv !== 0)
      return;
    const rung = FUSION_BURST_ACTIONS[currentTeam().enemyMax(FUSION_BURST)];
    if (rung)
      asSource(rung, () => addStat(15, rung.mv));
  },
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
var AERO_EROSION = new Debuff({
  name: "Aero Erosion",
  maxStacks: 3,
  display: () => `Aero Erosion x${frozenStacks()} (tick in ${(6 - enemyForte2()) / 2}s)`,
  updateBuffs: () => {
    const rung = negativeStatusRung(AERO_EROSION_ACTIONS, stacksOfEnemy(AERO_EROSION));
    if (!rung || !oneSecondPassed() || addEnemyForte2(2) < 6)
      return;
    addEnemyForte2(-6);
    queueOnApplier(AERO_EROSION, rung);
  }
});
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
var ELECTRO_RAGE = new Debuff({ name: "Electro Rage", maxStacks: 10 });
var FLEETING_THUNDER = new Debuff({ name: "Hsin: Fleeting Thunder" });
var ELECTRO_FLARE = new Debuff({
  name: "Electro Flare",
  maxStacks: 10,
  display: () => `Electro Flare x${frozenStacks()} (tick in ${5 - enemyForte1()}s)`,
  // A kit's own Electro Flare DMG instance carries no motion value of its own (Hsin's Heart of
  // Thunder hits): what it is worth is the cap rung — a kit's own instance calculates at the cap,
  // unlike the status's own ticks below, which fire at the count they find — and the kit's own
  // percentage multiplies that. Added from here, sourced to the rung itself ("Electro Flare - 10
  // Stacks"), which is where the number comes from; the cap is the fight's, not the declared 10.
  applyStats: () => {
    if (!isType(
      1572864
      /* Type2.ElectroFlare */
    ) || currentAction().mv !== 0)
      return;
    const rung = negativeStatusRung(ELECTRO_FLARE_DMG, currentTeam().enemyMax(ELECTRO_FLARE));
    if (rung)
      asSource(rung, () => addStat(15, rung.mv));
  },
  updateBuffs: () => {
    const held = stacksOfEnemy(ELECTRO_FLARE);
    const rung = negativeStatusRung(ELECTRO_FLARE_DMG, held);
    if (!rung || !oneSecondPassed() || addEnemyForte1(1) < 5)
      return;
    setEnemyForte1(0);
    queueOnApplier(ELECTRO_FLARE, rung);
    const rage = negativeStatusRung(ELECTRO_RAGE_ACTIONS, stacksOfEnemy(ELECTRO_RAGE));
    if (rage) {
      queueOnApplier(ELECTRO_FLARE, rage);
      revokeEnemy(ELECTRO_RAGE);
    }
    if (!stacksOfEnemy(FLEETING_THUNDER))
      removeStackEnemy(ELECTRO_FLARE, held - Math.floor(held / 2));
  }
});
function inflictElectroFlare(n) {
  const before = stacksOfEnemy(ELECTRO_FLARE);
  const over = n - (applyEnemy(ELECTRO_FLARE, n) - before);
  if (over > 0)
    applyEnemy(ELECTRO_RAGE, over);
}
var NEGATIVE_STATUSES = [HAVOC_BANE, GLACIO_CHAFE, ELECTRO_FLARE, FUSION_BURST, AERO_EROSION, SPECTRO_FRAZZLE];
function queueOnApplier(status, rung) {
  const source = currentTeam().sourceOf.get(status);
  const applier = currentTeam().slots.find((s) => s.name === source)?.resonator;
  if (applier)
    queueOn(applier, rung);
  else
    queue(rung);
}
var inflictedNegativeStatus = () => NEGATIVE_STATUSES.some((d) => appliedByMe(d) > 0);
var anyNegativeStatusInflicted = () => NEGATIVE_STATUSES.some((d) => applied2(d) > 0);
var hasNegativeStatus = () => NEGATIVE_STATUSES.some((d) => stacksOfEnemy(d) > 0);
var inflictedNegativeStatusBy = (member2) => NEGATIVE_STATUSES.some((d) => appliedByMember(d, member2) > 0);

// dist/src/shared/unison.js
var UNISON = new Buff({
  name: "Unison",
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    )) {
      revokeCurrent(UNISON);
      queueOutro(UNISON_INTRO);
    }
  }
});
var unisonOutro = (outro) => outro.variant(`${outro.name} (Unison)`, { concerto: 0 });
var gainedUnison = () => applied2(UNISON) > 0;
var UNISON_INTRO = new Buff({
  //name: "Unison Intro",
  convertStats: () => {
    if (casting(
      5
      /* Cast.Intro */
    ))
      revokeCurrent(UNISON_INTRO);
  }
});
function unisonIntro() {
  return isHeld(UNISON_INTRO) || currentTeam().outroQueue.includes(UNISON_INTRO);
}
var UNISON_RESPONSE = new Buff({
  //name: "Unison Response",
  convertStats: () => {
    if (casting(
      5
      /* Cast.Intro */
    ))
      revokeCurrent(UNISON_RESPONSE);
  }
});
function respondToUnison() {
  if (isHeld(UNISON_INTRO))
    applyCurrent(UNISON_RESPONSE, 1);
}
var unisonResponse = () => applied2(UNISON_RESPONSE) > 0;
var consumedConcerto = () => currentAction().concerto + getStat(
  27
  /* Stat.AddConcerto */
) < 0 && !casting(
  6
  /* Cast.Outro */
);
var UNISON_BOON = new Buff({
  name: "Unison Boon",
  maxStacks: 4,
  applyStats: () => {
    if (isHeld(UNISON_RESPONDER))
      addStat(18, (stacksOfTeam(NINE_SHADOWS) ? 4.5 : 3) * frozenStacks());
  }
});
var NINE_SHADOWS = new Buff({ name: "Suoming S6: Nine Shadows at Her Side" });
var UNISON_RESPONDER = new Buff({});

// dist/src/weapons/sword.js
var BLAZING_BRILLIANCE = refinements((r, rank) => {
  const SEARING_FEATHER = new Buff({
    name: `Blazing Brilliance: Crimson Phoenix${rank}`,
    maxStacks: 14,
    stats: [[
      17,
      [4, 5, 6, 7, 8][r],
      12288
      /* Type1.Skill */
    ]],
    perStack: true,
    early: true,
    until: 0
  });
  return new Weapon({
    weaponType: 0,
    name: `Blazing Brilliance${rank}`,
    stats: [[0, 587.5], [10, 48.6], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onType(
      12288
      /* Type1.Skill */
    ), buff: SEARING_FEATHER, stacks: 5 }]
  });
});
var RED_SPRING = refinements((r, rank) => {
  const RED_SPRING_BASIC = new Buff({
    name: `Red Spring: Beyond the Cycle${rank}`,
    maxStacks: 3,
    stats: [[
      17,
      [10, 12.5, 15, 17.5, 20][r],
      4096
      /* Type1.Basic */
    ]],
    perStack: true,
    until: 0
  });
  const RED_SPRING_CONSUME = new Buff({
    name: `Red Spring: Beyond the Cycle${rank}`,
    maxStacks: 10,
    // the stacks are its 10s, not a multiplied payout — one spent per engine second, gone at zero
    display: () => `Red Spring: Beyond the Cycle${rank} (${frozenStacks()}s)`,
    updateBuffs: () => {
      if (oneSecondPassed())
        removeStack(RED_SPRING_CONSUME, 1);
    },
    stats: [[
      17,
      [40, 50, 60, 70, 80][r],
      4096
      /* Type1.Basic */
    ]],
    until: 0
  });
  return new Weapon({
    weaponType: 0,
    name: `Red Spring${rank}`,
    stats: [[0, 587.5], [9, 24.3], [6, [12, 15, 18, 21, 24][r]]],
    grants: [
      { on: onType(
        4096
        /* Type1.Basic */
      ), buff: RED_SPRING_BASIC },
      { on: consumedConcerto, buff: RED_SPRING_CONSUME, stacks: 10 }
    ]
  });
});
var UNFLICKERING_VALOR = refinements((r, rank) => {
  const LAUGHTER_PREVAILS_LIB = new Buff({
    name: `Unflickering Valor: Laughter Prevails (lib)${rank}`,
    stats: [[
      17,
      [24, 30, 36, 42, 48][r],
      4096
      /* Type1.Basic */
    ]],
    until: 0
  });
  const LAUGHTER_PREVAILS_BASIC = new Buff({
    name: `Unflickering Valor: Laughter Prevails (basic)${rank}`,
    stats: [[
      17,
      [24, 30, 36, 42, 48][r],
      4096
      /* Type1.Basic */
    ]],
    until: 0
  });
  return new Weapon({
    weaponType: 0,
    name: `Unflickering Valor${rank}`,
    stats: [[0, 413], [11, 77.04], [9, [8, 10, 12, 14, 16][r]]],
    grants: [
      { on: onCast(
        4
        /* Cast.Liberation */
      ), buff: LAUGHTER_PREVAILS_LIB },
      { on: onType(
        4096
        /* Type1.Basic */
      ), buff: LAUGHTER_PREVAILS_BASIC }
    ]
  });
});
var EMERALD_SENTENCE = refinements((r, rank) => {
  const HEART_SETTLES_TEAM = new Buff({
    name: `Emerald Sentence: When A Heart Settles${rank}`,
    stats: [[
      17,
      [20, 25, 30, 35, 40][r],
      28672
      /* Type1.Echo */
    ]]
  });
  const BAMBOO_READY = new Buff({
    until: 1
    /* LifeTime.Swap */
  });
  const BAMBOO_CLEAVER = new Buff({
    name: `Emerald Sentence: Bamboo Cleaver${rank}`,
    maxStacks: 2,
    until: 1,
    stats: [[
      17,
      [30, 37.5, 45, 52.5, 60][r],
      8192
      /* Type1.Heavy */
    ]],
    perStack: true
  });
  return new Weapon({
    weaponType: 0,
    name: `Emerald Sentence${rank}`,
    stats: [[0, 587.5], [9, 24.3], [6, [12, 15, 18, 21, 24][r]]],
    grants: [
      {
        on: onCast(
          5
          /* Cast.Intro */
        ),
        buff: HEART_SETTLES_TEAM,
        to: 1
        /* BuffTarget.Team */
      },
      { on: () => casting(
        5
        /* Cast.Intro */
      ) || casting(
        1
        /* Cast.Basic */
      ), buff: BAMBOO_READY },
      { on: () => casting(
        7
        /* Cast.Echo */
      ) && isHeld(BAMBOO_READY), buff: BAMBOO_CLEAVER }
    ]
  });
});
var GLINT_OF_CLOUDS = refinements((r, rank) => {
  const EVILS_SCOURGE = new Buff({
    name: `Glint of Clouds: Evil's Scourge${rank}`,
    maxStacks: 5,
    stats: [[
      17,
      [11.2, 14, 16.8, 19.6, 22.4][r],
      64
      /* Attribute.Aero */
    ]],
    perStack: true,
    applyStats: () => {
      if (frozenStacks() >= 5)
        addStat(
          22,
          [10, 12.5, 15, 17.5, 20][r],
          64
          /* Attribute.Aero */
        );
    },
    convertStats: () => {
      if (casting(
        6
        /* Cast.Outro */
      ) && frozenStacks() < 5)
        revokeCurrent(EVILS_SCOURGE);
    }
  });
  return new Weapon({
    weaponType: 0,
    name: `Glint of Clouds${rank}`,
    stats: [[0, 500], [9, 36], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onInflict(TUNE_STRAIN_SHIFTING), buff: EVILS_SCOURGE }]
  });
});
var FROSTBURN = refinements((r, rank) => {
  const SELF_NO_MORE = new Buff({
    name: `Frostburn: Self No More${rank}`,
    until: 0,
    stats: [[
      18,
      [28, 35, 42, 49, 56][r],
      256
      /* Attribute.Glacio */
    ], [
      22,
      [10, 12.5, 15, 17.5, 20][r],
      16384
      /* Type1.Liberation */
    ]],
    applyStats: () => {
      if (isActive())
        addStat(
          18,
          [20, 25, 30, 35, 40][r],
          1310720
          /* Type2.GlacioChafe */
        );
    }
  });
  return new Weapon({
    weaponType: 0,
    name: `Frostburn${rank}`,
    stats: [[0, 587.5], [9, 24.3], [6, [12, 15, 18, 21, 24][r]]],
    // `onInflict`: a "when *you* inflict" payout, so the two extra stacks Lucilla's Film Roll
    // adds to the wielder's own are hers and pay nothing here
    grants: [{ on: onInflict(GLACIO_CHAFE), buff: SELF_NO_MORE }]
  });
});
var AZURE_OATH = refinements((r, rank) => {
  const UNBENDING = new Buff({
    name: `Azure Oath: Unbending${rank}`,
    until: 0,
    stats: [[
      18,
      [36, 45, 54, 63, 72][r],
      8192
      /* Type1.Heavy */
    ], [
      22,
      [12, 15, 18, 21, 24][r],
      8192
      /* Type1.Heavy */
    ]]
  });
  return new Weapon({
    weaponType: 0,
    name: `Azure Oath${rank}`,
    stats: [[0, 587.5], [9, 24.3], [17, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onInflict(HAVOC_BANE), buff: UNBENDING }]
  });
});
var EVERBRIGHT_POLESTAR = refinements((r, rank) => {
  const STARCHASER = new Buff({
    name: `Everbright Polestar: Starchaser${rank}`,
    until: 0,
    stats: [[
      22,
      [32, 40, 48, 56, 64][r],
      16384
      /* Type1.Liberation */
    ]],
    applyStats: () => {
      if (currentAction().type1 === 16384)
        addStat(
          21,
          [10, 15, 20, 25, 30][r],
          192
          /* Attribute.Fusion */
        );
    }
  });
  return new Weapon({
    weaponType: 0,
    name: `Everbright Polestar${rank}`,
    stats: [[0, 587.5], [9, 24.3], [17, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onInflict(TUNE_RUPTURE_SHIFTING, FUSION_BURST), buff: STARCHASER }]
  });
});
var DEFIERS_THORN = refinements((r, rank) => {
  const FREE_KNIGHTS_TARANTELLA = new Buff({
    name: `Defier's Thorn: A Free Knight's Tarantella${rank}`,
    until: 0,
    stats: [[23, [8, 10, 12, 14, 16][r]]],
    applyStats: () => {
      if (stacksOfEnemy(AERO_EROSION) > 0)
        addStat(18, [20, 25, 30, 35, 40][r]);
    }
  });
  return new Weapon({
    weaponType: 0,
    name: `Defier's Thorn${rank}`,
    // the 12% is A Free Knight's Tarantella's own flat half
    stats: [[0, 413], [7, 72.2], [7, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: either(onCast(
      5
      /* Cast.Intro */
    ), onType(
      4096
      /* Type1.Basic */
    )), buff: FREE_KNIGHTS_TARANTELLA }]
  });
});
var UNSPOKEN_RUE = refinements((r, rank) => {
  const LOCKED_THUNDER = new Buff({
    name: `Unspoken Rue: Locked Thunder, Trapped Rain${rank}`,
    stats: [[
      17,
      [30, 37.5, 45, 52.5, 60][r],
      128
      /* Attribute.Electro */
    ]]
  });
  const BINDING_MIND = new Buff({
    name: `Unspoken Rue: Binding Mind${rank}`,
    stats: [[
      17,
      [24, 30, 36, 42, 48][r],
      128
      /* Attribute.Electro */
    ]]
  });
  const YEARNING_MIND = new Buff({
    name: `Unspoken Rue: Yearning Mind${rank}`,
    until: 1,
    stats: [[
      17,
      [40, 50, 60, 70, 80][r],
      128
      /* Attribute.Electro */
    ]]
  });
  return new Weapon({
    weaponType: 0,
    name: `Unspoken Rue${rank}`,
    stats: [[0, 587.5], [9, 24.3], [6, [12, 15, 18, 21, 24][r]]],
    updateBuffs: () => {
      if (gainedUnison()) {
        applyCurrent(LOCKED_THUNDER, 1);
        applyTeam(BINDING_MIND, 1);
        revokeCurrent(YEARNING_MIND);
      }
      if (consumedConcerto()) {
        applyCurrent(YEARNING_MIND, 1);
        revokeTeam(BINDING_MIND);
      }
    }
  });
});

// dist/src/weapons/standard.js
function concertoWeapon(name, weaponType, tier = 2) {
  return refinements((r, rank) => {
    const aria = new Buff({
      name: `${name}: Ceaseless Aria${rank}`,
      maxStacks: 2,
      applyStats: () => {
        if (frozenStacks() === 1 && casting(
          3
          /* Cast.Skill */
        )) {
          applyCurrent(aria, 1);
          addStat(27, [8, 10, 12, 14, 16][r]);
        } else if (frozenStacks() === 2 && casting(
          6
          /* Cast.Outro */
        ))
          removeStack(aria, 2);
      },
      display: () => `${name}: Ceaseless Aria${rank}${frozenStacks() === 1 ? "" : " (cooldown)"}`
    });
    return new Weapon({
      weaponType,
      tier,
      name: `${name}${rank}`,
      stats: [[0, 337.5], [11, 51.84]],
      grants: [{ on: onCast(
        3
        /* Cast.Skill */
      ), buff: aria }]
    });
  });
}
var VARIATION = concertoWeapon(
  "Variation",
  4,
  1
  /* Tier.Standard */
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
var STATIC_MIST = refinements((r, rank) => {
  const STATIC_MIST_HANDOFF = new Buff({
    name: `Static Mist: Stormy Resolution${rank}`,
    stats: [[6, [10, 12.5, 15, 17.5, 20][r]]],
    until: 0
  });
  return new Weapon({
    weaponType: 2,
    tier: 1,
    name: `Static Mist${rank}`,
    stats: [[0, 587.5], [9, 24.3], [11, [12.8, 16, 19.2, 22.4, 25.6][r]]],
    grants: [{
      on: onCast(
        6
        /* Cast.Outro */
      ),
      buff: STATIC_MIST_HANDOFF,
      to: 3
      /* BuffTarget.Next */
    }]
  });
});
var EMERALD_OF_GENESIS = refinements((r, rank) => {
  const EOG_STACKS = new Buff({
    name: `Emerald of Genesis: Stormy Resolution${rank}`,
    maxStacks: 2,
    stats: [[6, [6, 7.5, 9, 10.5, 12][r]]],
    perStack: true,
    until: 0
  });
  return new Weapon({
    weaponType: 0,
    tier: 1,
    name: `Emerald of Genesis${rank}`,
    stats: [[0, 587.5], [9, 24.3], [11, [12.8, 16, 19.2, 22.4, 25.6][r]]],
    grants: [{ on: onCast(
      3
      /* Cast.Skill */
    ), buff: EOG_STACKS }]
  });
});
var COSMIC_RIPPLES = refinements((r, rank) => {
  const COSMIC_RIPPLES_STACKS = new Buff({
    name: `Cosmic Ripples: Stormy Resolution${rank}`,
    maxStacks: 5,
    stats: [[
      17,
      [3.2, 4, 4.8, 5.6, 6.4][r],
      4096
      /* Type1.Basic */
    ]],
    perStack: true,
    until: 0
  });
  return new Weapon({
    weaponType: 4,
    tier: 1,
    name: `Cosmic Ripples${rank}`,
    stats: [[0, 500], [6, 54], [11, [12.8, 16, 19.2, 22.4, 25.6][r]]],
    grants: [{ on: onType(
      4096
      /* Type1.Basic */
    ), buff: COSMIC_RIPPLES_STACKS }]
  });
});
var ABYSS_SURGES = refinements((r, rank) => {
  const ABYSS_SKILL_HIT = new Buff({
    name: `Abyss Surges: Stormy Resolution${rank}`,
    stats: [[
      17,
      [10, 12.5, 15, 17.5, 20][r],
      4096
      /* Type1.Basic */
    ]],
    until: 0
  });
  const ABYSS_BASIC_HIT = new Buff({
    name: `Abyss Surges: Stormy Resolution${rank}`,
    stats: [[
      17,
      [10, 12.5, 15, 17.5, 20][r],
      12288
      /* Type1.Skill */
    ]],
    until: 0
  });
  return new Weapon({
    weaponType: 3,
    tier: 1,
    name: `Abyss Surges${rank}`,
    stats: [[0, 587.5], [6, 36.45], [11, [12.8, 16, 19.2, 22.4, 25.6][r]]],
    grants: [
      { on: onType(
        12288
        /* Type1.Skill */
      ), buff: ABYSS_SKILL_HIT },
      { on: onType(
        4096
        /* Type1.Basic */
      ), buff: ABYSS_BASIC_HIT }
    ]
  });
});
var LUSTROUS_RAZOR = refinements((r, rank) => {
  const LUSTROUS_RAZOR_STACKS = new Buff({
    name: `Lustrous Razor: Stormy Resolution${rank}`,
    maxStacks: 3,
    stats: [[
      17,
      [7, 8.75, 10.5, 12.25, 14][r],
      16384
      /* Type1.Liberation */
    ]],
    perStack: true,
    until: 0
  });
  return new Weapon({
    weaponType: 1,
    tier: 1,
    name: `Lustrous Razor${rank}`,
    stats: [[0, 587.5], [6, 36.45], [11, [12.8, 16, 19.2, 22.4, 25.6][r]]],
    grants: [{ on: onCast(
      3
      /* Cast.Skill */
    ), buff: LUSTROUS_RAZOR_STACKS }]
  });
});
var hitInterfered = () => currentAction().mv > 0 && stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0;
var NEW_STD_BRAUDBLADE = refinements((r, rank) => {
  const EDGE_BREAKER_BUFF = new Buff({
    name: `Radiance Cleaver: Edge Breaker${rank}`,
    stats: [[
      17,
      [24, 27, 30, 33, 36][r],
      16384
      /* Type1.Liberation */
    ]]
  });
  return new Weapon({
    weaponType: 1,
    tier: 1,
    name: `Radiance Cleaver${rank}`,
    stats: [[0, 587.5], [10, 48.6], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: hitInterfered, buff: EDGE_BREAKER_BUFF }]
  });
});
var NEW_STD_GAUNTLET = refinements((r, rank) => {
  const BARRIER_BREACHER_STACKS = new Buff({
    name: `Pulsation Bracer: Barrier Breacher${rank}`,
    maxStacks: 4,
    stats: [[
      17,
      [6, 6.7, 7.5, 8.2, 9][r],
      4096
      /* Type1.Basic */
    ]],
    perStack: true
  });
  return new Weapon({
    weaponType: 3,
    tier: 1,
    name: `Pulsation Bracer${rank}`,
    stats: [[0, 587.5], [9, 24.3], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: hitInterfered, buff: BARRIER_BREACHER_STACKS }]
  });
});
var NEW_STD_SWORD = refinements((r, rank) => {
  const SIGNAL_CATCHER_BUFF = new Buff({
    name: `Laser Shearer: Signal Catcher${rank}`,
    stats: [[
      17,
      [24, 27, 30, 33, 36][r],
      12288
      /* Type1.Skill */
    ]]
  });
  return new Weapon({
    weaponType: 0,
    tier: 1,
    name: `Laser Shearer${rank}`,
    stats: [[0, 587.5], [11, 38.88], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: hitInterfered, buff: SIGNAL_CATCHER_BUFF }]
  });
});
var BLOODPACTS_PLEDGE = refinements((r, rank) => {
  const HARMONIOUS_VIBRANCY = new Buff({
    name: `Bloodpact's Pledge: Harmonious Vibrancy${rank}`,
    stats: [[
      17,
      [10, 14, 18, 22, 26][r],
      12288
      /* Type1.Skill */
    ]],
    until: 0
  });
  return new Weapon({
    weaponType: 0,
    tier: 2,
    name: `Bloodpact's Pledge${rank}`,
    stats: [[0, 587.5], [11, 38.88]],
    grants: [{ on: onApplied(HEALS), buff: HARMONIOUS_VIBRANCY }]
  });
});
var BLOODPACT_AERO_AMP = [10, 14, 18, 22, 26].map((amp, r) => new Buff({
  name: `Bloodpact's Pledge: Harmonious Vibrancy R${r + 1}`,
  stats: [[
    18,
    amp,
    64
    /* Attribute.Aero */
  ]],
  when: isActive
}));
var NEW_STD_RECTIFIER = refinements((r, rank) => {
  const PATH_OBSERVER_BUFF = new Buff({
    name: `Boson Astrolabe: Path Observer${rank}`,
    until: 0,
    stats: [[6, [12, 13.5, 15, 16.5, 18][r]], [
      17,
      [12, 13.5, 15, 16.5, 18][r],
      4096
      /* Type1.Basic */
    ]]
  });
  return new Weapon({
    weaponType: 4,
    tier: 1,
    name: `Boson Astrolabe${rank}`,
    stats: [[0, 525], [11, 38.88], [6, [12, 15, 18, 21, 24][r]]],
    updateGlobal: () => {
      if (casting(
        8
        /* Cast.TuneBreak */
      ))
        applyCurrent(PATH_OBSERVER_BUFF, 1);
    }
  });
});
var NEW_STD_PISTOL = refinements((r, rank) => {
  const INSIGHT_BEARER_BUFF = new Buff({
    name: `Phasic Homogenizer: Insight Bearer${rank}`,
    until: 0,
    stats: [[17, [20, 22.5, 25, 27.5, 30][r]]]
  });
  return new Weapon({
    weaponType: 2,
    tier: 1,
    name: `Phasic Homogenizer${rank}`,
    stats: [[0, 587.5], [10, 48.6], [6, [12, 15, 18, 21, 24][r]]],
    updateGlobal: () => {
      if (casting(
        8
        /* Cast.TuneBreak */
      ))
        applyCurrent(INSIGHT_BEARER_BUFF, 1);
    }
  });
});

// dist/src/echoes/rinascita.js
var ACTION_SENTRY_CONSTRUCT = new Action("Echo - Sentry Construct", {
  cast: 7,
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
  stats: [[
    17,
    12,
    256
    /* Attribute.Glacio */
  ], [
    17,
    12,
    12288
    /* Type1.Skill */
  ]]
});
var FROSTY_RESOLVE_2PC = new Sonata2pc({ name: "Frosty Resolve 2pc", stats: [[
  17,
  12,
  12288
  /* Type1.Skill */
]] });
var FROSTY_RESOLVE_GLACIO = new Buff({
  name: "Frosty Resolve 5pc: Glacio",
  stats: [[
    17,
    22.5,
    256
    /* Attribute.Glacio */
  ]],
  until: 0
});
var FROSTY_RESOLVE_SKILL_DMG = new Buff({
  name: "Frosty Resolve 5pc: Resonance Skill",
  maxStacks: 2,
  stats: [[
    17,
    18,
    12288
    /* Type1.Skill */
  ]],
  perStack: true,
  until: 0
});
var FROSTY_RESOLVE_5PC = new Sonata({
  name: "Frosty Resolve 5pc",
  sonata2pc: FROSTY_RESOLVE_2PC,
  grants: [
    { on: onCast(
      3
      /* Cast.Skill */
    ), buff: FROSTY_RESOLVE_GLACIO },
    { on: onCast(
      4
      /* Cast.Liberation */
    ), buff: FROSTY_RESOLVE_SKILL_DMG }
  ]
});
var ACTION_NM_HERON = new Action("Echo - Nightmare: Impermanence Heron", {
  cast: 7,
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
  stats: [[
    17,
    12,
    384
    /* Attribute.Havoc */
  ], [
    17,
    12,
    8192
    /* Type1.Heavy */
  ]]
});
var ACTION_LORELEI = new Action("Echo - Lorelei", {
  cast: 7,
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
  stats: [[
    17,
    12,
    384
    /* Attribute.Havoc */
  ], [
    17,
    12,
    4096
    /* Type1.Basic */
  ]]
});
var MIDNIGHT_VEIL_2PC = new Sonata2pc({ name: "Midnight Veil 2pc", stats: [[
  17,
  10,
  384
  /* Attribute.Havoc */
]] });
var ACTION_MIDNIGHT_VEIL_BURST = new Action("Outro - Midnight Veil", {
  element: 384,
  scaling: 0,
  type: 24576,
  mv: 480
});
var MIDNIGHT_VEIL_HANDOFF = new Buff({
  name: "Midnight Veil 5pc (outro)",
  stats: [[
    17,
    15,
    384
    /* Attribute.Havoc */
  ]],
  until: 0
});
var MIDNIGHT_VEIL_5PC = new Sonata({
  name: "Midnight Veil 5pc",
  sonata2pc: MIDNIGHT_VEIL_2PC,
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Outro */
    )) {
      queue(ACTION_MIDNIGHT_VEIL_BURST);
      queueOutro(MIDNIGHT_VEIL_HANDOFF);
    }
  }
});
var ACTION_DRAGON_OF_DIRGE = new Action("Echo - Dragon of Dirge", {
  cast: 7,
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
  stats: [[
    17,
    12,
    192
    /* Attribute.Fusion */
  ], [
    17,
    12,
    4096
    /* Type1.Basic */
  ]]
});
var TIDEBREAKING_2PC = new Sonata2pc({ name: "Tidebreaking Courage 2pc", stats: [[11, 10]] });
var TIDEBREAKING_5PC = new Sonata({
  name: "Tidebreaking Courage 5pc",
  sonata2pc: TIDEBREAKING_2PC,
  stats: [[6, 15]],
  convertStats: () => {
    if (getStat(
      11
      /* Stat.Er */
    ) >= 250)
      addStat(17, 30);
  }
});
var ACTION_NM_HECATE = new Action("Echo - Nightmare: Hecate", {
  cast: 7,
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
  stats: [[
    17,
    12,
    384
    /* Attribute.Havoc */
  ], [
    17,
    20,
    28672
    /* Type1.Echo */
  ]]
});
var ACTION_NM_LAMPY = new Action("Echo - Nightmare: Lampylumen Myriad", {
  cast: 7,
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
  stats: [[
    17,
    12,
    256
    /* Attribute.Glacio */
  ], [
    17,
    30,
    262144
    /* Type2.Coordinated */
  ]]
});
var ACTION_HECATE = new Action("Echo - Hecate", {
  cast: 7,
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
  stats: [[
    17,
    40,
    262144
    /* Type2.Coordinated */
  ]]
});
var EMPYREAN_ANTHEM_2PC = new Sonata2pc({ name: "Empyrean Anthem 2pc", stats: [[11, 10]] });
var EMPYREAN_ANTHEM_5PC = new Sonata({
  name: "Empyrean Anthem 5pc",
  sonata2pc: EMPYREAN_ANTHEM_2PC,
  stats: [[
    17,
    80,
    262144
    /* Type2.Coordinated */
  ]],
  grants: [{
    on: onType(
      262144
      /* Type2.Coordinated */
    ),
    buff: () => EMPYREAN_ANTHEM_TEAM,
    to: 1
    /* BuffTarget.Team */
  }]
});
var EMPYREAN_ANTHEM_TEAM = new Buff({
  name: "Empyrean Anthem 5pc",
  stats: [[6, 20]],
  when: isActive
});
var ACTION_NM_KELPIE = new Action("Echo - Nightmare: Kelpie", {
  cast: 7,
  element: 256,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 2.81
});
var ACTION_NM_KELPIE_OUTRO = new Action("Echo - Nightmare: Kelpie Outro", {
  element: 64,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 2.81
});
var NM_KELPIE = new Mainslot({
  name: "Nightmare: Kelpie",
  action: ACTION_NM_KELPIE,
  echoType: 1,
  stats: [[
    17,
    12,
    256
    /* Attribute.Glacio */
  ], [
    17,
    12,
    64
    /* Attribute.Aero */
  ]],
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      queue(ACTION_NM_KELPIE_OUTRO);
  }
});
var GUSTS_OF_WELKIN_TEAM = new Buff({
  name: "Gusts of Welkin 5pc",
  stats: [[
    17,
    15,
    64
    /* Attribute.Aero */
  ]]
});
var GUSTS_OF_WELKIN_SELF = new Buff({
  name: "Gusts of Welkin 5pc",
  stats: [[
    17,
    15,
    64
    /* Attribute.Aero */
  ]]
});
var GUSTS_OF_WELKIN_2PC = new Sonata2pc({ name: "Gusts of Welkin 2pc", stats: [[
  17,
  10,
  64
  /* Attribute.Aero */
]] });
var GUSTS_OF_WELKIN_5PC = new Sonata({
  name: "Gusts of Welkin 5pc",
  sonata2pc: GUSTS_OF_WELKIN_2PC,
  grants: [
    {
      on: onInflict(AERO_EROSION),
      buff: GUSTS_OF_WELKIN_TEAM,
      to: 1
      /* BuffTarget.Team */
    },
    { on: onInflict(AERO_EROSION), buff: GUSTS_OF_WELKIN_SELF }
  ]
});
var ACTION_FLEURDELYS = new Action("Echo - Reminiscence: Fleurdelys", {
  cast: 7,
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
    const worn = currentMember().resonator?.name;
    if (worn === "Aero Rover" || worn === "Cartethyia")
      addStat(
        17,
        10,
        64
        /* Attribute.Aero */
      );
  }
});
var WINDWARD_2PC = new Sonata2pc({ name: "Windward Pilgrimage 2pc", stats: [[
  17,
  10,
  64
  /* Attribute.Aero */
]] });
var WINDWARD_5PC = new Sonata({
  name: "Windward Pilgrimage 5pc",
  sonata2pc: WINDWARD_2PC,
  grants: [{ on: () => stacksOfEnemy(AERO_EROSION) > 0, buff: () => WINDWARD_BUFF }]
});
var WINDWARD_BUFF = new Buff({
  name: "Windward Pilgrimage 5pc",
  stats: [[9, 10], [
    17,
    30,
    64
    /* Attribute.Aero */
  ]],
  until: 0
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
  for (const four of multisets(c4, 2))
    for (const one of multisets(c1, 3))
      builds.push(mainstats(...four, ...one));
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
var LINES = /* @__PURE__ */ new WeakMap();
var substatLines = (piece) => LINES.get(piece) ?? [];
var linesOf = (counts, value) => [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([s, n]) => ({ text: `${ROLL[s].label} ${value(s)}${ROLL[s].percent ? "%" : ""}`, rolls: n }));
var Substat;
(function(Substat2) {
  Substat2[Substat2["CritRate"] = 0] = "CritRate";
  Substat2[Substat2["CritDmg"] = 1] = "CritDmg";
  Substat2[Substat2["Er"] = 2] = "Er";
  Substat2[Substat2["AtkPct"] = 3] = "AtkPct";
  Substat2[Substat2["FlatAtk"] = 4] = "FlatAtk";
  Substat2[Substat2["HpPct"] = 5] = "HpPct";
  Substat2[Substat2["FlatHp"] = 6] = "FlatHp";
  Substat2[Substat2["DefPct"] = 7] = "DefPct";
  Substat2[Substat2["FlatDef"] = 8] = "FlatDef";
  Substat2[Substat2["Basic"] = 9] = "Basic";
  Substat2[Substat2["Heavy"] = 10] = "Heavy";
  Substat2[Substat2["Skill"] = 11] = "Skill";
  Substat2[Substat2["Liberation"] = 12] = "Liberation";
})(Substat || (Substat = {}));
var ROLL = {
  [Substat.CritRate]: { stat: 9, value: 7.5, label: "Crit Rate", percent: true },
  [Substat.CritDmg]: { stat: 10, value: 15, label: "Crit Dmg", percent: true },
  [Substat.Er]: { stat: 11, value: 8.4, label: "ER", percent: true },
  [Substat.AtkPct]: { stat: 6, value: 7.9, label: "ATK", percent: true },
  [Substat.FlatAtk]: { stat: 3, value: 40, label: "ATK", percent: false },
  [Substat.HpPct]: { stat: 7, value: 7.9, label: "HP", percent: true },
  [Substat.FlatHp]: { stat: 4, value: 430, label: "HP", percent: false },
  [Substat.DefPct]: { stat: 8, value: 10, label: "DEF", percent: true },
  [Substat.FlatDef]: { stat: 5, value: 50, label: "DEF", percent: false },
  [Substat.Basic]: { stat: 17, tag: 4096, value: 7.9, label: "Basic", percent: true },
  [Substat.Heavy]: { stat: 17, tag: 8192, value: 7.9, label: "Heavy", percent: true },
  [Substat.Skill]: { stat: 17, tag: 12288, value: 7.9, label: "Skill", percent: true },
  [Substat.Liberation]: { stat: 17, tag: 16384, value: 7.9, label: "Liberation", percent: true }
};
var HIGH = {
  [Substat.CritRate]: 8.7,
  [Substat.CritDmg]: 17.4,
  [Substat.Er]: 10,
  [Substat.AtkPct]: 9.4,
  [Substat.FlatAtk]: 50,
  [Substat.HpPct]: 9.4,
  [Substat.FlatHp]: 470,
  [Substat.DefPct]: 11.8,
  [Substat.FlatDef]: 60,
  [Substat.Basic]: 9.4,
  [Substat.Heavy]: 9.4,
  [Substat.Skill]: 9.4,
  [Substat.Liberation]: 9.4
};
function substats(sub1, sub2, sub3, er = false) {
  const leaned = [sub1, sub2, sub3];
  if (new Set(leaned).size !== 3 || leaned.some((s) => s <= Substat.Er)) {
    throw new Error(`substats(${leaned.join(", ")}): three distinct stats, none of crit/ER`);
  }
  const dropped = leaned.includes(Substat.FlatDef) ? Substat.FlatHp : Substat.FlatDef;
  const counts = /* @__PURE__ */ new Map([
    [Substat.CritRate, er ? 2 : 5],
    [Substat.CritDmg, 5],
    [Substat.Er, er ? 5 : 3]
  ]);
  for (const s of leaned)
    counts.set(s, 2);
  for (let s = Substat.AtkPct; s <= Substat.Liberation; s++)
    if (!counts.has(s) && (er || s !== dropped))
      counts.set(s, 1);
  const named = [...new Set(leaned.map((s) => ROLL[s].label)), ...er ? ["ER"] : []];
  const piece = new Buff({
    name: `ChemX32 - ${named.join(" ")}`,
    constantStats: () => {
      for (const [s, n] of counts)
        addStat(ROLL[s].stat, ROLL[s].value * n, ROLL[s].tag);
    }
  });
  LINES.set(piece, linesOf(counts, (s) => ROLL[s].value));
  return piece;
}
function highSubs(sub1, sub2, sub3, sub4) {
  const counts = /* @__PURE__ */ new Map([[Substat.CritRate, 5], [Substat.CritDmg, 5]]);
  const leaned = [sub1, sub2, sub3, sub4];
  if (new Set(leaned).size < (sub2 === sub4 ? 3 : 4))
    throw new Error(`highSubs(): a stat repeats only as sub2 and sub4`);
  const filler = leaned.some((s) => s === Substat.DefPct || s === Substat.FlatDef) ? Substat.FlatHp : Substat.FlatDef;
  for (const [s, n] of [[sub1, 5], [sub2, 3], [sub3, 3], [sub4, 2], [filler, 2]]) {
    if (s <= Substat.CritDmg)
      throw new Error(`highSubs(): crit is already five rolls each`);
    counts.set(s, (counts.get(s) ?? 0) + n);
  }
  for (const [s, n] of counts)
    if (n > 5)
      throw new Error(`highSubs(): ${ROLL[s].label} rolls ${n} times, a build has five echoes`);
  const scaler = Math.max(...[Substat.AtkPct, Substat.FlatAtk, Substat.HpPct, Substat.FlatHp, Substat.DefPct, Substat.FlatDef].map((s) => counts.get(s) ?? 0));
  for (const s of [Substat.Basic, Substat.Heavy, Substat.Skill, Substat.Liberation]) {
    if ((counts.get(s) ?? 0) >= 5 && scaler < 2)
      throw new Error(`highSubs(): five ${ROLL[s].label} rolls need the scaler rolled first`);
  }
  const named = [...new Set(leaned.filter((s) => s !== Substat.Er || counts.get(s) > 3).map((s) => ROLL[s].label))];
  const piece = new Buff({
    name: `High Invest - ${named.join(" ")}`,
    constantStats: () => {
      for (const [s, n] of counts)
        addStat(ROLL[s].stat, HIGH[s] * n, ROLL[s].tag);
    }
  });
  LINES.set(piece, linesOf(counts, (s) => HIGH[s]));
  return piece;
}

// dist/src/resonators/aero/cartethyia.js
function cartethyiaAction(id, def2) {
  return new Action(id, { element: 64, scaling: 1, ...def2 });
}
var erosion = (n) => ({ updateDebuffs: () => applyEnemy(AERO_EROSION, n) });
var EROSION_BURST = {
  updateBuffs: () => {
    const rung = negativeStatusRung(AERO_EROSION_ACTIONS, stacksOfEnemy(AERO_EROSION));
    if (!rung)
      return;
    queue(rung);
    removeStackEnemy(AERO_EROSION, 1);
  }
};
var BA1 = cartethyiaAction("Basic - Sword to Carve My Forms 1", { node: 0, cast: 1, type: 4096, mv: 4.78, energy: 0.7, concerto: 0.98, offtune: 2240 });
var BA2 = cartethyiaAction("Basic - Sword to Carve My Forms 2", { node: 0, cast: 1, type: 4096, mv: 13.13, energy: 1.93, concerto: 2.7, offtune: 6146 });
var BA3 = cartethyiaAction("Basic - Sword to Carve My Forms 3", { node: 0, cast: 1, type: 4096, mv: 17.12, energy: 2.52, concerto: 3.52, offtune: 8016 });
var BA4 = cartethyiaAction("Basic - Sword to Carve My Forms 4", {
  node: 0,
  cast: 1,
  type: 4096,
  mv: 15.1,
  energy: 2.22,
  concerto: 3.11,
  offtune: 7073,
  ...erosion(1),
  updateBuffs: () => applyCurrent(SWORD_OF_DIVINITY, 1)
});
var DC = cartethyiaAction("Dodge Counter - Sword to Carve My Forms", { node: 0, cast: 0, type: 4096, mv: 27.4, energy: 2.52, concerto: 5.64, offtune: 8016 });
var HA = cartethyiaAction("Heavy - Sword to Carve My Forms", {
  node: 0,
  cast: 2,
  type: 4096,
  mv: 12.48,
  energy: 2.51,
  concerto: 3.52,
  offtune: 8002,
  updateBuffs: () => applyCurrent(SWORD_OF_DISCORD, 1)
});
var BA234 = new ActionGroup("Basic - Sword to Carve My Forms 234", [BA2, BA3, BA4]);
var RECALL = {
  updateBuffs: () => {
    if (isHeld(SWORD_OF_VIRTUE)) {
      revokeCurrent(SWORD_OF_VIRTUE);
      applyCurrent(HEART_OF_VIRTUE, 1);
    }
    if (isHeld(SWORD_OF_DIVINITY)) {
      revokeCurrent(SWORD_OF_DIVINITY);
      applyCurrent(MANDATE_OF_DIVINITY, 1);
    }
    if (isHeld(SWORD_OF_DISCORD)) {
      revokeCurrent(SWORD_OF_DISCORD);
      applyCurrent(POWER_OF_DISCORD, 1);
    }
  }
};
var PLUNGE = { node: 0, cast: 1, type: 4096, type2: 786432, offtune: 4248, ...RECALL };
var Plunge = cartethyiaAction("Mid-air - Plunging Attack", { ...PLUNGE, mv: 5.65, energy: 1.33, concerto: 1.86 });
var Plunge1 = cartethyiaAction("Mid-air - Plunging Attack (1 Sword Shadow)", { ...PLUNGE, mv: 5.65, energy: 1.33, concerto: 1.86 });
var Plunge2 = cartethyiaAction("Mid-air - Plunging Attack (2 Sword Shadows)", { ...PLUNGE, mv: 9.9, energy: 1.35, concerto: 1.86 });
var Plunge3 = cartethyiaAction("Mid-air - Plunging Attack (3 Sword Shadows)", { ...PLUNGE, mv: 33.87, energy: 1.35, concerto: 1.86 });
var Skill = cartethyiaAction("Skill - Sword to Bear Their Names", {
  node: 1,
  cast: 3,
  type: 4096,
  mv: 29.53,
  energy: 16.28,
  concerto: 10,
  offtune: 7200,
  ...erosion(2),
  updateBuffs: () => applyCurrent(SWORD_OF_VIRTUE, 1)
});
var Intro = cartethyiaAction("Intro - Sword to Mark Tide's Trace", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 12.48,
  energy: 10.01,
  concerto: 10,
  offtune: 7008,
  ...erosion(2),
  updateBuffs: () => {
    revokeTeam(WINDS_DIVINE_BLESSING);
    applyCurrent(SWORD_OF_DISCORD, 1);
  }
});
var FBA1 = cartethyiaAction("Basic - Tempest 1", { node: 2, cast: 1, type: 4096, mv: 6.49, energy: 0.75, concerto: 1.05, offtune: 2400, forte1: 4 });
var FBA2 = cartethyiaAction("Basic - Tempest 2", { node: 2, cast: 1, type: 4096, mv: 9.09, energy: 1.94, concerto: 2.69, offtune: 6099, forte1: 14 });
var FBA3 = cartethyiaAction("Basic - Tempest 3", { node: 2, cast: 1, type: 4096, mv: 10.65, energy: 2.25, concerto: 3.15, offtune: 7200, forte1: 14 });
var FBA4 = cartethyiaAction("Basic - Tempest 4", { node: 2, cast: 1, type: 4096, mv: 13.7, energy: 2.25, concerto: 3.15, offtune: 7200, forte1: 10 });
var FBA5 = cartethyiaAction("Basic - Tempest 5", { node: 2, cast: 1, type: 4096, mv: 36, energy: 1.99, concerto: 2.78, offtune: 6337, forte1: 20, ...EROSION_BURST });
var FDC = cartethyiaAction("Dodge Counter - Tempest", { node: 2, cast: 0, type: 4096, mv: 15.99, energy: 2.25, concerto: 3.15, offtune: 7200, forte1: 14 });
var UpwardCut = cartethyiaAction("Basic - Tempest Upward Cut", { node: 2, cast: 1, type: 4096, mv: 9.08, energy: 1.52, concerto: 2.12, offtune: 4840, forte1: 8 });
var FMA1 = cartethyiaAction("Mid-air - Tempest 1", { node: 2, cast: 1, type: 4096, mv: 9.06, energy: 2, concerto: 2.81, offtune: 6385, forte1: 6 });
var FMA2 = cartethyiaAction("Mid-air - Tempest 2", { node: 2, cast: 1, type: 4096, mv: 29.55, energy: 2.07, concerto: 2.88, offtune: 6576, forte1: 15, ...EROSION_BURST });
var FMA3 = cartethyiaAction("Mid-air - Tempest 3", { node: 2, cast: 1, type: 4096, mv: 2.2, energy: 0.48, concerto: 0.67, offtune: 1528, forte1: 10 });
var FHA = cartethyiaAction("Heavy - Tempest", { node: 2, cast: 2, type: 4096, mv: 14.25, energy: 1.76, concerto: 2.46, offtune: 5617, forte1: 8 });
var FEHA = cartethyiaAction("Heavy - Tempest (Enhanced)", { node: 2, cast: 2, type: 4096, mv: 19.45, energy: 2.4, concerto: 3.38, offtune: 7665, forte1: 24 });
var FSkill1 = cartethyiaAction("Skill - Sword to Answer Waves' Call", { node: 2, cast: 3, type: 12288, mv: 24.8, energy: 2.33, concerto: 10, offtune: 7340, forte1: 8 });
var FSkill2 = cartethyiaAction("Skill - May Tempest Break the Tides", { node: 2, cast: 3, type: 12288, mv: 24.81, energy: 8.82, concerto: 10, offtune: 7339, forte1: 28, ...EROSION_BURST });
var FIntro = cartethyiaAction("Intro - Sword to Call for Freedom", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 14.25,
  energy: 1.76,
  concerto: 10,
  offtune: 5617,
  updateBuffs: () => revokeTeam(WINDS_DIVINE_BLESSING)
});
var FBA345 = new ActionGroup("Basic - Tempest 345", [FBA3, FBA4, FBA5]);
var FBA12345 = new ActionGroup("Basic - Tempest 12345", [FBA1, FBA2, FBA3, FBA4, FBA5]);
var Liberation = cartethyiaAction("Liberation - A Knight's Heartfelt Prayers", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 0,
  concerto: 20,
  resetEnergy: true,
  updateBuffs: () => applyCurrent(MANIFEST, 1)
});
var Lib2 = cartethyiaAction("Liberation - Blade of Howling Squall", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 91.84,
  concerto: 20,
  offtune: 168e3,
  forte1: -120,
  // S6 stops the strip but not the payout: the amplification still reads what the target holds
  applyStats: () => addStat(18, 20 * Math.min(5, stacksOfEnemy(AERO_EROSION))),
  updateBuffs: () => {
    revokeCurrent(MANIFEST);
    revokeCurrent(HEART_OF_VIRTUE);
    revokeCurrent(MANDATE_OF_DIVINITY);
    revokeCurrent(POWER_OF_DISCORD);
  },
  afterAction: () => {
    if (isHeld(CT_S6))
      applyEnemy(AERO_EROSION, currentTeam().enemyMax(AERO_EROSION));
    else
      revokeEnemy(AERO_EROSION);
  }
});
var Outro = cartethyiaAction("Outro - Wind's Divine Blessing", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => applyTeam(WINDS_DIVINE_BLESSING, 1)
});
var SWORD_OF_DIVINITY = new Buff({ name: "Cartethyia: Sword of Divinity's Shadow" });
var SWORD_OF_DISCORD = new Buff({ name: "Cartethyia: Sword of Discord's Shadow" });
var SWORD_OF_VIRTUE = new Buff({ name: "Cartethyia: Sword of Virtue's Shadow" });
var MANIFEST = new Buff({ name: "Cartethyia: Manifest" });
var HEART_OF_VIRTUE = new Buff({ name: "Cartethyia: Heart of Virtue" });
var MANDATE_OF_DIVINITY = new Buff({
  name: "Cartethyia: Mandate of Divinity",
  stats: [[
    18,
    50,
    786432
    /* Type2.AeroErosion */
  ]],
  updateBuffs: () => {
    if (oneSecondPassed() && stacksOfEnemy(AERO_EROSION) > 0)
      addEnemyForte2(2);
  }
});
var POWER_OF_DISCORD = new Buff({ name: "Cartethyia: Power of Discord" });
var TRUEST_WISHES = new Buff({
  name: "Inherent: A Heart's Truest Wishes",
  applyStats: () => {
    addStat(25, 20);
    if (casting(
      4
      /* Cast.Liberation */
    ) && currentMember().resonator?.name === "Aero Rover")
      addStat(30, 25);
  }
});
var CT_INHERENT_1 = new Inherent({
  name: "Inherent: A Heart's Truest Wishes",
  updateGlobal: () => applyOthers(TRUEST_WISHES, 1)
});
var CT_INHERENT_2 = new Inherent({
  name: "Inherent: Wind's Indelible Imprint",
  applyStats: () => {
    const held = stacksOfEnemy(AERO_EROSION);
    if (held < 1)
      return;
    addStat(18, 30 + 10 * Math.min(3, Math.max(0, held - 3)));
  }
});
var WINDS_DIVINE_BLESSING = new Buff({
  name: "Cartethyia: Outro",
  applyStats: () => {
    if (!isActive() || isHeld(CARTETHYIA_RESONATOR) || !hasNegativeStatus())
      return;
    addStat(
      18,
      17.5,
      64
      /* Attribute.Aero */
    );
  }
});
var CROWN_OF_FATE = new Buff({
  name: "Cartethyia S1: Crown Destined by Fate",
  maxStacks: 4,
  applyStats: () => addStat(10, 25 * stacksOf(CROWN_OF_FATE))
});
var CT_S1 = new Sequence({
  name: "Cartethyia S1: Crown Destined by Fate",
  // afterAction is the one phase that sees Conviction as the cast actually left it
  afterAction: () => {
    if (runningAction(Lib2)) {
      revokeCurrent(CROWN_OF_FATE);
      return;
    }
    const rungs = Math.min(4, Math.floor(forte1() / 30));
    if (rungs > stacksOf(CROWN_OF_FATE))
      setStacksSelf(CROWN_OF_FATE, rungs);
  }
});
var BROKEN_BLADE = new Buff({
  name: "Cartethyia S2: Blade Broken by Tempest",
  updateDebuffs: () => {
    if (currentAction().mv > 0)
      applyEnemy(AERO_EROSION, 3);
  },
  updateBuffs: () => {
    if (currentAction().mv <= 0)
      return;
    const rung = negativeStatusRung(AERO_EROSION_ACTIONS, stacksOfEnemy(AERO_EROSION));
    if (rung)
      queue(rung);
    revokeCurrent(BROKEN_BLADE);
  }
});
var CT_S2 = new Sequence({
  name: "Cartethyia S2: Blade Broken by Tempest",
  updateBuffs: () => {
    if (!runningAction(Liberation))
      return;
    maxStackIncrease(AERO_EROSION, 3);
    applyCurrent(BROKEN_BLADE, 1);
  },
  applyStats: () => {
    const a = currentAction();
    if (a.node === 2)
      return;
    if (runningAction(Plunge) || runningAction(Plunge1) || runningAction(Plunge2) || runningAction(Plunge3))
      addStat(16, 200);
    else if (casting(
      1
      /* Cast.Basic */
    ) || casting(
      2
      /* Cast.Heavy */
    ) || casting(
      0
      /* Cast.DodgeCounter */
    ) || casting(
      5
      /* Cast.Intro */
    ))
      addStat(16, 50);
  }
});
var CT_S3 = new Sequence({
  name: "Cartethyia S3: Prisoner Hanged in the Tower",
  updateDebuffs: () => {
    if (runningAction(FBA5) || runningAction(FMA2) || runningAction(FEHA) || runningAction(FSkill2))
      applyEnemy(AERO_EROSION, 2);
  },
  applyStats: () => {
    if (runningAction(Lib2))
      addStat(16, 100);
  }
});
var SACRIFICE = new Buff({
  name: "Cartethyia S4: Sacrifice Made for Salvation",
  stats: [[17, 20]]
});
var CT_S4 = new Sequence({
  name: "Cartethyia S4: Sacrifice Made for Salvation",
  // from updateGlobal "me" is the holder, so the acting slot has to be named (status.ts)
  updateGlobal: () => {
    if (inflictedNegativeStatusBy(currentTeam().slot))
      applyTeam(SACRIFICE, 1);
  }
});
var CT_S5 = new Sequence({ name: "Cartethyia S5: Hope Reshaped in Storms" });
var CT_S6 = new Sequence({
  name: "Cartethyia S6: Freedom Found in Storm's Wake",
  updateGlobal: () => {
    if (!appliedByMember(AERO_EROSION, currentTeam().slot))
      return;
    if (stacksOfEnemy(AERO_EROSION) < currentTeam().enemyMax(AERO_EROSION))
      return;
    const rung = negativeStatusRung(AERO_EROSION_ACTIONS, stacksOfEnemy(AERO_EROSION));
    if (rung)
      queue(rung);
  },
  applyStats: () => {
    if (isHeld(MANIFEST))
      addStat(18, 40);
  }
});
var CARTETHYIA_TALENTS = new Talent({
  name: "Cartethyia: Talents",
  stats: [[9, 8], [7, 12]]
});
var CARTETHYIA_RESONATOR = new Resonator({
  name: "Cartethyia",
  talent: CARTETHYIA_TALENTS,
  inherent1: CT_INHERENT_1,
  inherent2: CT_INHERENT_2,
  tier: 0,
  element: 64,
  weapon: 0,
  intro: () => isHeld(MANIFEST) ? FIntro : Intro,
  outro: () => Outro,
  color: "#1d3fff",
  maxEnergy: 125,
  maxForte1: 120,
  constantStats: () => {
    addStat(1, 14800);
    addStat(0, 312.5);
    addStat(2, 611.11);
  }
});
var CT_ROTATION = new Rotation([
  INTRO,
  BA234,
  Skill,
  Plunge3,
  Liberation,
  FSkill1,
  FSkill2,
  FBA345,
  FBA12345,
  Lib2,
  ECHO_SWAP,
  OUTRO
]);
var CARTETHYIA = new Loadout({
  resonator: CARTETHYIA_RESONATOR,
  sequences: [CT_S1, CT_S2, CT_S3, CT_S4, CT_S5, CT_S6],
  weapons: [DEFIERS_THORN, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [new EchoLoadout(FLEURDELYS, WINDWARD_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    3,
    12,
    16
    /* Mainstat.HP1 */
  ),
  substat: substats(Substat.HpPct, Substat.Basic, Substat.FlatHp),
  highSubstat: highSubs(Substat.HpPct, Substat.FlatHp, Substat.Basic, Substat.Er),
  rotation: CT_ROTATION
});

// dist/src/weapons/pistol.js
var THE_LAST_DANCE = refinements((r, rank) => {
  const SILENT_EULOGY = new Buff({
    name: `The Last Dance: Silent Eulogy${rank}`,
    stats: [[
      17,
      [48, 60, 72, 84, 96][r],
      12288
      /* Type1.Skill */
    ]],
    until: 0
  });
  return new Weapon({
    weaponType: 2,
    name: `The Last Dance${rank}`,
    stats: [[0, 500], [10, 72], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onCast(
      5,
      4
      /* Cast.Liberation */
    ), buff: SILENT_EULOGY }]
  });
});
var LUX_UMBRA = refinements((r, rank) => {
  const TO_FIRE_SHE_RETURNS_HEAVY = new Buff({
    name: `Lux & Umbra: To Fire She Returns (heavy)${rank}`,
    stats: [[
      18,
      [24, 30, 36, 42, 48][r],
      8192
      /* Type1.Heavy */
    ]],
    until: 0
  });
  const TO_FIRE_SHE_RETURNS_ECHO = new Buff({
    name: `Lux & Umbra: To Fire She Returns (echo)${rank}`,
    stats: [[
      18,
      [24, 30, 36, 42, 48][r],
      28672
      /* Type1.Echo */
    ]],
    until: 0
  });
  return new Weapon({
    weaponType: 2,
    name: `Lux & Umbra${rank}`,
    stats: [[0, 587.5], [10, 48.6], [6, [12, 15, 18, 21, 24][r]]],
    applyStats: () => {
      if (isHeld(TO_FIRE_SHE_RETURNS_HEAVY) && isHeld(TO_FIRE_SHE_RETURNS_ECHO))
        addStat(22, [8, 10, 12, 14, 16][r]);
    },
    grants: [
      { on: onType(
        28672
        /* Type1.Echo */
      ), buff: TO_FIRE_SHE_RETURNS_HEAVY },
      { on: onType(
        8192
        /* Type1.Heavy */
      ), buff: TO_FIRE_SHE_RETURNS_ECHO }
    ]
  });
});
var WOODLAND_ARIA = refinements((r, rank) => {
  const LINGERING_SUMMER_TUNE = new Buff({
    name: `Woodland Aria: Lingering Summer Tune${rank}`,
    stats: [[
      17,
      [24, 30, 36, 42, 48][r],
      64
      /* Attribute.Aero */
    ]]
  });
  const LINGERING_SUMMER_SHRED = new Debuff({
    name: `Woodland Aria: Lingering Summer Tune${rank}`,
    stats: [[
      35,
      [10, 11.5, 13, 14.5, 16][r],
      64
      /* Attribute.Aero */
    ]]
  });
  return new Weapon({
    weaponType: 2,
    name: `Woodland Aria${rank}`,
    stats: [[0, 500], [9, 36], [6, [12, 15, 18, 21, 24][r]]],
    grants: [
      { on: onInflict(AERO_EROSION), buff: LINGERING_SUMMER_TUNE },
      {
        on: onInflict(AERO_EROSION),
        buff: LINGERING_SUMMER_SHRED,
        to: 2
        /* BuffTarget.Enemy */
      }
    ]
  });
});
var SPECTRUM_BLASTER = refinements((r, rank) => {
  const ATTENDANCE_EXEMPTION = new Buff({
    name: `Spectrum Blaster: Attendance Exemption Protocol${rank}`,
    stats: [[
      17,
      [36, 45, 54, 63, 72][r],
      4096
      /* Type1.Basic */
    ]],
    until: 0
  });
  const SPECTRUM_CHORUS = new Buff({
    name: `Spectrum Blaster: Attendance Exemption Protocol${rank}`,
    maxStacks: 3,
    stats: [[17, [8, 10, 12, 14, 16][r]]],
    perStack: true
  });
  return new Weapon({
    weaponType: 2,
    name: `Spectrum Blaster${rank}`,
    stats: [[0, 587.5], [9, 24.3], [6, [12, 15, 18, 21, 24][r]]],
    grants: [
      { on: either(onCast(
        5
        /* Cast.Intro */
      ), onType(
        4096
        /* Type1.Basic */
      )), buff: ATTENDANCE_EXEMPTION },
      {
        on: both(onCast(
          1
          /* Cast.Basic */
        ), onInflict(TUNE_RUPTURE_SHIFTING, TUNE_STRAIN_SHIFTING)),
        buff: SPECTRUM_CHORUS,
        to: 1
        /* BuffTarget.Team */
      }
    ]
  });
});
var SKULL_THRASHER = refinements((r, rank) => {
  const WAKEFUL_LONER_INTRO = new Buff({
    name: `Skull Thrasher: Wakeful Loner (intro)${rank}`,
    stats: [[
      17,
      [24, 30, 36, 42, 48][r],
      4096
      /* Type1.Basic */
    ]],
    until: 0
  });
  const WAKEFUL_LONER_HACK = new Buff({
    name: `Skull Thrasher: Wakeful Loner (hack)${rank}`,
    stats: [[
      17,
      [12, 15, 18, 21, 24][r],
      4096
      /* Type1.Basic */
    ]],
    until: 0
  });
  const WAKEFUL_LONER_TEAM = new Buff({
    name: `Skull Thrasher: Wakeful Loner${rank}`,
    stats: [[6, [24, 30, 36, 42, 48][r]]]
  });
  return new Weapon({
    weaponType: 2,
    name: `Skull Thrasher${rank}`,
    stats: [[0, 500], [10, 72], [6, [12, 15, 18, 21, 24][r]]],
    grants: [
      { on: onCast(
        5
        /* Cast.Intro */
      ), buff: WAKEFUL_LONER_INTRO },
      { on: onInflict(TUNE_HACK_SHIFTING), buff: WAKEFUL_LONER_HACK },
      {
        on: onInflict(TUNE_HACK_SHIFTING),
        buff: WAKEFUL_LONER_TEAM,
        to: 1
        /* BuffTarget.Team */
      }
    ]
  });
});
var SPECTRAL_TRIGGER = refinements((r, rank) => {
  const SUNKEN_DREAM_STACKS = new Buff({
    name: `Spectral Trigger: Sunken Dream (spectro)${rank}`,
    maxStacks: 2,
    stats: [[
      17,
      [20, 25, 30, 35, 40][r],
      320
      /* Attribute.Spectro */
    ]],
    perStack: true,
    until: 0
  });
  const SUNKEN_DREAM_HACK = new Buff({
    name: `Spectral Trigger: Sunken Dream (heavy)${rank}`,
    until: 0,
    stats: [[
      18,
      [30, 37.5, 45, 52.5, 60][r],
      8192
      /* Type1.Heavy */
    ], [
      22,
      [10, 12.5, 15, 17.5, 20][r],
      8192
      /* Type1.Heavy */
    ]]
  });
  return new Weapon({
    weaponType: 2,
    name: `Spectral Trigger${rank}`,
    stats: [[0, 587.5], [10, 48.6], [6, [12, 15, 18, 21, 24][r]]],
    grants: [
      { on: onCast(
        3
        /* Cast.Skill */
      ), buff: SUNKEN_DREAM_STACKS },
      { on: onInflict(TUNE_HACK_SHIFTING), buff: SUNKEN_DREAM_HACK }
    ]
  });
});

// dist/src/echoes/jinzhou.js
var ACTION_BELL_BORNE = new Action("Echo - Bell-Borne Geochelone", {
  cast: 7,
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
  stats: [[17, 10]],
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      removeStackTeam(BELL_BORNE_SHIELD, 1);
  }
});
var ACTION_HERON = new Action("Echo - Impermanence Heron", {
  cast: 7,
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
  cast: 7,
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
var MOONLIT_CLOUDS_2PC = new Sonata2pc({ name: "Moonlit Clouds 2pc", stats: [[11, 10]] });
var MOONLIT_CLOUDS_5PC = new Sonata({
  name: "Moonlit Clouds 5pc",
  sonata2pc: MOONLIT_CLOUDS_2PC,
  grants: [{
    on: onCast(
      6
      /* Cast.Outro */
    ),
    buff: () => MOONLIT_CLOUDS_HANDOFF,
    to: 3
    /* BuffTarget.Next */
  }]
});
var MOONLIT_CLOUDS_HANDOFF = handoff("Moonlit Clouds 5pc (outro)", () => addStat(6, 22.5));
var REJUV_2PC = new Sonata2pc({ name: "Rejuvenating Glow 2pc", stats: [[24, 10]] });
var REJUV_5PC = new Sonata({
  name: "Rejuvenating Glow 5pc",
  sonata2pc: REJUV_2PC,
  grants: [{
    on: onApplied(HEALS),
    buff: () => REJUV_TEAM,
    to: 1
    /* BuffTarget.Team */
  }]
});
var REJUV_TEAM = new Buff({ name: "Rejuvenating Glow 5pc", stats: [[6, 15]] });
var MOLTEN_RIFT_2PC = new Sonata2pc({ name: "Molten Rift 2pc", stats: [[
  17,
  10,
  192
  /* Attribute.Fusion */
]] });
var MOLTEN_RIFT_5PC = new Sonata({
  name: "Molten Rift 5pc",
  sonata2pc: MOLTEN_RIFT_2PC,
  grants: [{ on: onCast(
    3
    /* Cast.Skill */
  ), buff: () => MOLTEN_RIFT_BUFF }]
});
var MOLTEN_RIFT_BUFF = new Buff({
  name: "Molten Rift 5pc",
  stats: [[
    17,
    30,
    192
    /* Attribute.Fusion */
  ]],
  until: 0
});
var ACTION_NM_INFERNO_RIDER = new Action("Echo - Nightmare: Inferno Rider", {
  cast: 7,
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
  stats: [[
    17,
    12,
    192
    /* Attribute.Fusion */
  ], [
    17,
    12,
    12288
    /* Type1.Skill */
  ]]
});
var ACTION_INFERNO_RIDER = new Action("Echo - Inferno Rider", {
  cast: 7,
  element: 192,
  scaling: 0,
  type: 28672,
  mv: 252.4 + 282.8 * 2,
  energy: 3.78 + 4.41 * 2,
  updateBuffs: () => applyCurrent(INFERNO_RIDER_WINDOW, 1)
});
var INFERNO_RIDER_WINDOW = new Buff({
  name: "Inferno Rider",
  stats: [[
    17,
    12,
    192
    /* Attribute.Fusion */
  ], [
    17,
    12,
    4096
    /* Type1.Basic */
  ]],
  until: 0
});
var INFERNO_RIDER = new Mainslot({
  name: "Inferno Rider",
  action: ACTION_INFERNO_RIDER,
  echoType: 1
});
var ACTION_NM_CROWNLESS = new Action("Echo - Nightmare: Crownless", {
  cast: 7,
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
  stats: [[
    17,
    12,
    384
    /* Attribute.Havoc */
  ], [
    17,
    12,
    4096
    /* Type1.Basic */
  ]]
});
var ACTION_CROWNLESS = new Action("Echo - Nightmare: Crownless", {
  cast: 7,
  element: 384,
  scaling: 0,
  type: 28672,
  mv: 134.08 * 2,
  energy: 2.09 * 2,
  updateBuffs: () => applyCurrent(CROWNLESS_WINDOW, 1)
});
var CROWNLESS_WINDOW = new Buff({
  name: "Crownless",
  stats: [[
    17,
    12,
    384
    /* Attribute.Havoc */
  ], [
    17,
    12,
    12288
    /* Type1.Skill */
  ]],
  until: 0
});
var CROWNLESS = new Mainslot({
  name: "Crownless",
  action: ACTION_CROWNLESS,
  echoType: 1
});
var HAVOC_ECLIPSE_2PC = new Sonata2pc({ name: "Havoc Eclipse 2pc", stats: [[
  17,
  10,
  384
  /* Attribute.Havoc */
]] });
var HAVOC_ECLIPSE_5PC = new Sonata({
  name: "Havoc Eclipse 5pc",
  sonata2pc: HAVOC_ECLIPSE_2PC,
  grants: [{ on: onType(
    4096,
    8192
    /* Type1.Heavy */
  ), buff: () => HAVOC_ECLIPSE_STACKS }]
});
var HAVOC_ECLIPSE_STACKS = new Buff({
  name: "Havoc Eclipse 5pc",
  maxStacks: 4,
  stats: [[
    17,
    7.5,
    384
    /* Attribute.Havoc */
  ]],
  perStack: true,
  until: 0
});
var ACTION_LAMPYLUMEN_MYRIAD = new Action("Echo - Lampylumen Myriad", {
  cast: 7,
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
  stats: [[
    17,
    4,
    256
    /* Attribute.Glacio */
  ], [
    17,
    4,
    12288
    /* Type1.Skill */
  ]],
  perStack: true,
  until: 0
});
var LAMPYLUMEN_MYRIAD = new Mainslot({
  name: "Lampylumen Myriad",
  action: ACTION_LAMPYLUMEN_MYRIAD,
  echoType: 1
});
var FREEZING_FROST_2PC = new Sonata2pc({ name: "Freezing Frost 2pc", stats: [[
  17,
  10,
  256
  /* Attribute.Glacio */
]] });
var FREEZING_FROST_5PC = new Sonata({
  name: "Freezing Frost 5pc",
  sonata2pc: FREEZING_FROST_2PC,
  grants: [{ on: onType(
    4096,
    8192
    /* Type1.Heavy */
  ), buff: () => FREEZING_FROST_STACKS }]
});
var FREEZING_FROST_STACKS = new Buff({
  name: "Freezing Frost 5pc",
  maxStacks: 3,
  stats: [[
    17,
    10,
    256
    /* Attribute.Glacio */
  ]],
  perStack: true,
  until: 0
});
var ACTION_NM_FEILIAN_BERINGAL = new Action("Echo - Nightmare: Feilian Beringal", {
  cast: 7,
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
  stats: [[
    17,
    12,
    64
    /* Attribute.Aero */
  ], [
    17,
    12,
    8192
    /* Type1.Heavy */
  ]]
});
var SIERRA_GALE_2PC = new Sonata2pc({ name: "Sierra Gale 2pc", stats: [[
  17,
  10,
  64
  /* Attribute.Aero */
]] });
var SIERRA_GALE_5PC = new Sonata({
  name: "Sierra Gale 5pc",
  sonata2pc: SIERRA_GALE_2PC,
  grants: [{ on: onCast(
    5
    /* Cast.Intro */
  ), buff: () => SIERRA_GALE_INTRO }]
});
var SIERRA_GALE_INTRO = new Buff({
  name: "Sierra Gale 5pc",
  stats: [[
    17,
    30,
    64
    /* Attribute.Aero */
  ]],
  until: 0
});
var ACTION_JUE = new Action("Echo - Ju\xE9", {
  cast: 7,
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
var CELESTIAL_LIGHT_2PC = new Sonata2pc({ name: "Celestial Light 2pc", stats: [[
  17,
  10,
  320
  /* Attribute.Spectro */
]] });
var CELESTIAL_LIGHT_5PC = new Sonata({
  name: "Celestial Light 5pc",
  sonata2pc: CELESTIAL_LIGHT_2PC,
  grants: [{ on: onCast(
    5
    /* Cast.Intro */
  ), buff: () => CELESTIAL_LIGHT_INTRO }]
});
var CELESTIAL_LIGHT_INTRO = new Buff({
  name: "Celestial Light 5pc",
  stats: [[
    17,
    30,
    320
    /* Attribute.Spectro */
  ]],
  until: 0
});
var ACTION_MECH_ABOMINATION = new Action("Echo - Mech Abomination", {
  cast: 7,
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
  cast: 7,
  element: 128,
  scaling: 0,
  type: 24576,
  mv: 480,
  energy: 1.52
});
var MECH_ABOMINATION_ATK = new Buff({
  name: "Mech Abomination",
  stats: [[6, 12]],
  until: 0
});
var MECH_ABOMINATION = new Mainslot({
  name: "Mech Abomination",
  action: ACTION_MECH_ABOMINATION,
  echoType: 1
});
var LINGERING_TUNES_2PC = new Sonata2pc({ name: "Lingering Tunes 2pc", stats: [[6, 10]] });
var LINGERING_TUNES_5PC = new Sonata({
  name: "Lingering Tunes 5pc",
  sonata2pc: LINGERING_TUNES_2PC,
  stats: [[
    17,
    60,
    24576
    /* Type1.Outro */
  ]],
  // the 1.5s cadence stands in for real on-field presses, so a queued follow-up, a status rung or
  // the shared Tune Break — active casts on the wearer's slot, but not them acting again — don't
  // advance it
  grants: [{ on: () => !triggeredAction() && isActive(), buff: () => LINGERING_TUNES_STACKS }]
});
var LINGERING_TUNES_STACKS = new Buff({
  name: "Lingering Tunes 5pc",
  maxStacks: 8,
  applyStats: () => addStat(6, 5 * Math.floor(frozenStacks() / 2)),
  updateBuffs: () => lostOnSwap(),
  display: () => `Lingering Tunes x${Math.ceil(frozenStacks() / 2)}`
});
var ACTION_NM_MEPHIS = new Action("Echo - Nightmare: Thundering Mephis", {
  cast: 7,
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
  stats: [[
    17,
    12,
    128
    /* Attribute.Electro */
  ], [
    17,
    12,
    16384
    /* Type1.Liberation */
  ]]
});
var ACTION_NM_TEMPEST_MEPHIS = new Action("Echo - Nightmare: Tempest Mephis", {
  cast: 7,
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
  stats: [[
    17,
    12,
    128
    /* Attribute.Electro */
  ], [
    17,
    12,
    12288
    /* Type1.Skill */
  ]]
});
var VOID_THUNDER_2PC = new Sonata2pc({ name: "Void Thunder 2pc", stats: [[
  17,
  10,
  128
  /* Attribute.Electro */
]] });
var VOID_THUNDER_STACKS = new Buff({
  name: "Void Thunder 5pc: Electro",
  maxStacks: 2,
  stats: [[
    17,
    15,
    128
    /* Attribute.Electro */
  ]],
  perStack: true,
  until: 0
});
var VOID_THUNDER_5PC = new Sonata({
  name: "Void Thunder 5pc",
  sonata2pc: VOID_THUNDER_2PC,
  grants: [{ on: onCast(
    2,
    3
    /* Cast.Skill */
  ), buff: VOID_THUNDER_STACKS }]
});
var ACTION_FALLACY = new Action("Echo - Fallacy of No Return", {
  cast: 7,
  element: 320,
  scaling: 1,
  type: 28672,
  mv: 15.85,
  energy: 3.04,
  updateBuffs: () => applyTeam(FALLACY_TEAM, 1)
});
var FALLACY_TEAM = new Buff({ name: "Fallacy of No Return", stats: [[6, 10]] });
var FALLACY = new Mainslot({
  name: "Fallacy of No Return",
  action: ACTION_FALLACY,
  echoType: 0,
  updateBuffs: () => {
    if (casting(
      5
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
var BA12 = ciacconaAction("Basic - Quadruple Time Steps 1", { node: 0, cast: 1, type: 4096, mv: 57.06, energy: 0.88, concerto: 2.8, offtune: 2800 });
var BA22 = ciacconaAction("Basic - Quadruple Time Steps 2", { node: 0, cast: 1, type: 4096, mv: 163.04, energy: 2.51, concerto: 8, offtune: 8e3 });
var BA32 = ciacconaAction("Basic - Quadruple Time Steps 3", { node: 0, cast: 1, type: 4096, mv: 132.08, energy: 2.04, concerto: 6.48, offtune: 6480 });
var EROSION = { updateDebuffs: () => applyEnemy(AERO_EROSION, 1) };
var BA42 = ciacconaAction("Basic - Quadruple Time Steps 4", {
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
var SoloConcertS6 = ciacconaAction("Basic - Solo Concert (S6)", { node: 0, type: 16384, mv: 220 });
var HA2 = ciacconaAction("Heavy - Attack", { node: 0, cast: 2, type: 8192, mv: 107.6, energy: 1.65, concerto: 5.28, offtune: 5280 });
var AimedShot = ciacconaAction("Heavy - Aimed Shot", { node: 0, cast: 2, type: 8192, mv: 32.61, energy: 0.5, concerto: 1.6, offtune: 1600 });
var ChargedShot = ciacconaAction("Heavy - Fully Charged Aimed Shot", { node: 0, cast: 2, type: 8192, mv: 73.37, energy: 1.13, concerto: 3.6, offtune: 3600 });
var MA1 = ciacconaAction("Mid-air - Attack 1", { node: 0, cast: 1, type: 4096, mv: 110.86, energy: 1.7, concerto: 5.44, offtune: 5440 });
var MA2 = ciacconaAction("Mid-air - Attack 2", { node: 0, cast: 1, type: 4096, mv: 97.84, energy: 1.52, concerto: 4.8, offtune: 4800 });
var DC2 = ciacconaAction("Dodge Counter - Quadruple Time Steps", { node: 0, cast: 0, type: 4096, mv: 228.68, energy: 2.04, concerto: 16.48, offtune: 6480 });
var Skill2 = ciacconaAction("Skill - Harmonic Allegro", { node: 1, cast: 3, type: 12288, mv: 161.56, energy: 9.6, concerto: 15, offtune: 5e3, ...EROSION });
var Downbeat = ciacconaAction("Forte Heavy - Quadruple Downbeat", { node: 2, cast: 2, type: 8192, mv: 628.13, energy: 14.97, concerto: 25, offtune: 9360, forte1: -3, ...EROSION });
var Liberation2 = ciacconaAction("Liberation - Singer's Triple Cadenza", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 1100.42,
  concerto: 20,
  offtune: 48e3,
  resetEnergy: true,
  updateDebuffs: () => applyCurrent(SHIELD, 1),
  // Interlude Tune
  updateBuffs: () => {
    revokeTeam(RECITAL);
    applyTeam(RECITAL, 33);
  }
});
var RECITAL_FIELD = new ActionField("Ciaccona: Recital");
var GreenTonic = ciacconaAction("Liberation - Symphonic Poem: Tonic (green)", {
  node: 3,
  type: 16384,
  mv: 6.12,
  offtune: 2182,
  field: RECITAL_FIELD,
  ...EROSION
});
var Intro2 = ciacconaAction("Intro - Roaming with the Wind", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 189.11,
  energy: 10,
  concerto: 10,
  offtune: 9280,
  forte1: 1,
  ...EROSION,
  updateBuffs: () => revokeTeam(RECITAL)
  // switching back in exits Recital
});
var Outro2 = ciacconaAction("Outro - Windcalling Tune", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => applyTeam(WINDCALLING_TUNE, 1)
});
var SOLO_CONCERT = new Buff({
  name: "Ciaccona: Solo Concert",
  stats: [[
    17,
    24,
    64
    /* Attribute.Aero */
  ]]
});
var RECITAL = coordinatedBuff("Ciaccona: Recital", 33, () => CIACCONA_RESONATOR, GreenTonic, {
  every: 1.65,
  // S2: +40% Aero DMG Bonus to the team for as long as the Cadenza plays — read off her own slot,
  // since the node is her local gear and this buff pays whoever acts
  applyStats: () => {
    if (currentTeam().slots.find((m) => m.resonator === CIACCONA_RESONATOR)?.isHeld(CI_S2)) {
      asSource(CI_S2, () => addStat(
        17,
        40,
        64
        /* Attribute.Aero */
      ));
    }
  }
});
var CI_INHERENT_1 = new Inherent({ name: "Inherent: Interlude Tune" });
var CI_INHERENT_2 = new Inherent({
  name: "Inherent: Winds of Rinascita",
  applyStats: () => {
    if (runningAction(Downbeat))
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
var CIACCONA_TALENTS = new Talent({
  name: "Ciaccona: Talents",
  stats: [[6, 12], [10, 16]]
});
var CIACCONA_RESONATOR = new Resonator({
  name: "Ciaccona",
  talent: CIACCONA_TALENTS,
  inherent1: CI_INHERENT_1,
  inherent2: CI_INHERENT_2,
  element: 64,
  weapon: 2,
  intro: () => Intro2,
  outro: () => Outro2,
  color: "#5ac46b",
  maxEnergy: 125,
  maxForte1: 3,
  constantStats: () => {
    addStat(1, 12238);
    addStat(0, 375);
    addStat(2, 1198);
  }
});
var MA12 = new ActionGroup("Mid-air - Attack 12", [MA1, MA2]);
var BA34 = new ActionGroup("Basic - Quadruple Time Steps 34", [BA32, BA42]);
var CI_ROTATION = new Rotation([
  NOINTRO,
  JUMP,
  MA12,
  BA42,
  JUMP,
  MA12,
  BA42,
  JUMP,
  MA12,
  BA42,
  Skill2,
  Downbeat,
  Liberation2,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  BA34,
  JUMP,
  MA12,
  BA42,
  Skill2,
  Downbeat,
  Liberation2,
  ECHO_SWAP,
  OUTRO
]);
var CI_ROTATION_S3 = new Rotation([
  NOINTRO,
  JUMP,
  MA12,
  BA42,
  JUMP,
  MA12,
  BA42,
  Skill2,
  Downbeat,
  Liberation2,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  BA34,
  JUMP,
  Skill2,
  Downbeat,
  Liberation2,
  Skill2,
  ECHO_SWAP,
  OUTRO
]);
var WHERE_WIND_SINGS = new Buff({
  name: "Ciaccona S1: Where Wind Sings",
  stats: [[6, 35]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(WHERE_WIND_SINGS);
  }
});
var CI_S1 = new Sequence({
  name: "Ciaccona S1: Where Wind Sings",
  updateBuffs: () => {
    if (casting(
      1
      /* Cast.Basic */
    ))
      applyCurrent(WHERE_WIND_SINGS, 1);
  }
});
var CI_S2 = new Sequence({ name: "Ciaccona S2: Song of the Four Seasons" });
var CI_S3 = new Sequence({
  name: "Ciaccona S3: Starlit Improv",
  applyStats: () => {
    if (runningAction(BA42))
      addStat(30, 1);
  }
});
var CI_S4 = new Sequence({
  name: "Ciaccona S4: Toccata and Fugue",
  applyStats: () => {
    if (runningAction(Downbeat))
      addStat(23, 45);
    addStat(
      23,
      45,
      16384
      /* Type1.Liberation */
    );
  }
});
var CI_S5 = new Sequence({
  name: "Ciaccona S5: Eternal Idyll to Lasting Summer",
  stats: [[
    17,
    40,
    16384
    /* Type1.Liberation */
  ]]
});
var CI_S6 = new Sequence({
  name: "Ciaccona S6: Unending Cadence",
  updateBuffs: () => {
    if (runningAction(BA42))
      queue(SoloConcertS6);
  }
});
var CI_SEQUENCES = [CI_S1, CI_S2, CI_S3, CI_S4, CI_S5, CI_S6];
var CIACCONA = new Loadout({
  resonator: CIACCONA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Liberation, Substat.Er),
  rotation: { 0: CI_ROTATION, 3: CI_ROTATION_S3 },
  sequences: CI_SEQUENCES
});

// dist/src/weapons/gauntlet.js
var VERITYS_HANDLE = refinements((r, rank) => {
  const AD_VERITATEM = new Buff({
    name: `Verity's Handle: Ad Veritatem${rank}`,
    stats: [[
      17,
      [48, 60, 72, 84, 96][r],
      16384
      /* Type1.Liberation */
    ]],
    until: 0
  });
  return new Weapon({
    weaponType: 3,
    name: `Verity's Handle${rank}`,
    stats: [[0, 587.5], [10, 48.6], [17, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onCast(
      4
      /* Cast.Liberation */
    ), buff: AD_VERITATEM }]
  });
});
var TRAGICOMEDY = refinements((r, rank) => {
  const FOOLS_WARBLE = new Buff({
    name: `Tragicomedy: Fool's Warble${rank}`,
    stats: [[
      17,
      [48, 60, 72, 84, 96][r],
      8192
      /* Type1.Heavy */
    ]],
    until: 0
  });
  return new Weapon({
    weaponType: 3,
    name: `Tragicomedy${rank}`,
    stats: [[0, 587.5], [9, 24.3], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onCast(
      1,
      5
      /* Cast.Intro */
    ), buff: FOOLS_WARBLE }]
  });
});
var SOLSWORN_CIPHERS = refinements((r, rank) => {
  const SUNWARD_AMP = new Buff({
    name: `Solsworn Ciphers: Sunward (echo amp)${rank}`,
    stats: [[
      18,
      [32, 40, 48, 56, 64][r],
      28672
      /* Type1.Echo */
    ]],
    until: 0
  });
  const SUNWARD_IGNORE = new Buff({
    name: `Solsworn Ciphers: Sunward (def ignore)${rank}`,
    stats: [[
      22,
      [10, 12.5, 15, 17.5, 20][r],
      64
      /* Attribute.Aero */
    ]],
    until: 0
  });
  return new Weapon({
    weaponType: 3,
    name: `Solsworn Ciphers${rank}`,
    stats: [[0, 587.5], [10, 48.6], [6, [12, 15, 18, 21, 24][r]]],
    grants: [
      { on: onCast(
        5,
        7
        /* Cast.Echo */
      ), buff: SUNWARD_AMP },
      { on: onType(
        28672
        /* Type1.Echo */
      ), buff: SUNWARD_IGNORE }
    ]
  });
});
var IUNO_SIG = refinements((r, rank) => {
  const MOONGAZER_STACKS = new Buff({
    name: `Moongazer's Sigil: Plenilune Radiance${rank}`,
    maxStacks: 5,
    // scoped to liberation damage — most of Lunar Cycle qualifies, intro/outro/echo don't
    stats: [[
      22,
      [7.2, 8.4, 9.6, 10.8, 12][r],
      16384
      /* Type1.Liberation */
    ]],
    perStack: true
  });
  return new Weapon({
    weaponType: 3,
    name: `Moongazer's Sigil${rank}`,
    stats: [
      [0, 500],
      [9, 36],
      [6, [12, 15, 18, 21, 24][r]],
      [
        17,
        [20, 25, 30, 35, 40][r],
        16384
        /* Type1.Liberation */
      ]
    ],
    updateBuffs: () => {
      if (casting(
        5
        /* Cast.Intro */
      ))
        setStacksSelf(MOONGAZER_STACKS, 5);
      else if (applied2(SHIELD))
        applyCurrent(MOONGAZER_STACKS, applied2(SHIELD));
    }
  });
});
var DAYBREAKERS_SPINE = refinements((r, rank) => {
  const SUTURING_DAYLINE_SPECTRO = new Buff({
    name: `Daybreaker's Spine: Suturing Dayline (spectro)${rank}`,
    stats: [[
      17,
      [20, 25, 30, 35, 40][r],
      320
      /* Attribute.Spectro */
    ]],
    until: 0
  });
  const SUTURING_DAYLINE_STRAIN = new Buff({
    name: `Daybreaker's Spine: Suturing Dayline (strain)${rank}`,
    until: 0,
    stats: [[
      18,
      [20, 25, 30, 35, 40][r],
      4096
      /* Type1.Basic */
    ], [
      22,
      [10, 12.5, 15, 17.5, 20][r],
      4096
      /* Type1.Basic */
    ]]
  });
  return new Weapon({
    weaponType: 3,
    name: `Daybreaker's Spine${rank}`,
    stats: [[0, 587.5], [9, 24.3], [6, [12, 15, 18, 21, 24][r]]],
    grants: [
      { on: onType(
        4096
        /* Type1.Basic */
      ), buff: SUTURING_DAYLINE_SPECTRO },
      { on: onInflict(TUNE_STRAIN_SHIFTING), buff: SUTURING_DAYLINE_STRAIN }
    ]
  });
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
  cast: 7,
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
      5
      /* Cast.Intro */
    ))
      queue(ACTION_FALSE_SOVEREIGN_INTRO);
  },
  stats: [[
    17,
    12,
    128
    /* Attribute.Electro */
  ], [
    17,
    12,
    8192
    /* Type1.Heavy */
  ]]
});
var CROWN_STACKS = new Buff({
  name: "Crown of Valor",
  maxStacks: 5,
  stats: [[6, 6], [10, 4]],
  perStack: true
});
var COV_3PC = new Sonata3pc({
  name: "Crown of Valor 3pc",
  grants: [{ on: onApplied(SHIELD), buff: CROWN_STACKS, stacks: () => applied2(SHIELD) }]
});
var ACTION_MYA = new Action("Echo - Lady of the Sea", {
  cast: 7,
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
  stats: [[
    17,
    12,
    16384
    /* Type1.Liberation */
  ], [
    17,
    12,
    64
    /* Attribute.Aero */
  ]]
});
var ACTION_LIONESS = new Action("Echo - Lioness of Glory", {
  cast: 7,
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
  stats: [[
    17,
    12,
    16384
    /* Type1.Liberation */
  ], [
    17,
    12,
    192
    /* Attribute.Fusion */
  ]]
});
var CLAWPRINT_TEAM = new Buff({ name: "Flaming Clawprint 5pc", stats: [[
  17,
  15,
  192
  /* Attribute.Fusion */
]] });
var CLAWPRINT_LIBERATION = new Buff({ name: "Flaming Clawprint 5pc", stats: [[
  17,
  20,
  16384
  /* Type1.Liberation */
]] });
var CLAWPRINT_2PC = new Sonata2pc({ name: "Flaming Clawprint 2pc", stats: [[
  17,
  10,
  192
  /* Attribute.Fusion */
]] });
var CLAWPRINT_5PC = new Sonata({
  name: "Flaming Clawprint 5pc",
  sonata2pc: CLAWPRINT_2PC,
  grants: [
    {
      on: onCast(
        4
        /* Cast.Liberation */
      ),
      buff: CLAWPRINT_TEAM,
      to: 1
      /* BuffTarget.Team */
    },
    { on: onCast(
      4
      /* Cast.Liberation */
    ), buff: CLAWPRINT_LIBERATION }
  ]
});
var ACTION_CORROSAURUS = new Action("Echo - Corrosaurus", {
  cast: 7,
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
  stats: [[
    17,
    12,
    192
    /* Attribute.Fusion */
  ], [
    17,
    20,
    28672
    /* Type1.Echo */
  ]]
});
var FLAMEWING_SHADOW_HEAVY = new Buff({
  name: "Flamewing's Shadow 3pc (heavy)",
  stats: [[
    9,
    20,
    8192
    /* Type1.Heavy */
  ]],
  until: 0
});
var FLAMEWING_SHADOW_ECHO = new Buff({
  name: "Flamewing's Shadow 3pc (echo)",
  stats: [[
    9,
    20,
    28672
    /* Type1.Echo */
  ]],
  until: 0
});
var FLAMEWING_SHADOW_3PC = new Sonata3pc({
  name: "Flamewing's Shadow 3pc",
  grants: [
    { on: onType(
      28672
      /* Type1.Echo */
    ), buff: FLAMEWING_SHADOW_HEAVY },
    { on: onType(
      8192
      /* Type1.Heavy */
    ), buff: FLAMEWING_SHADOW_ECHO }
  ],
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
  cast: 7,
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
  stats: [[
    17,
    12,
    64
    /* Attribute.Aero */
  ], [
    17,
    12,
    8192
    /* Type1.Heavy */
  ]]
});
var LAW_OF_HARMONY_SELF = new Buff({
  name: "Law of Harmony",
  stats: [[
    17,
    30,
    8192
    /* Type1.Heavy */
  ]],
  until: 0
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
  grants: [
    { on: onCast(
      7
      /* Cast.Echo */
    ), buff: LAW_OF_HARMONY_SELF },
    {
      on: onCast(
        7
        /* Cast.Echo */
      ),
      buff: LAW_OF_HARMONY_TEAM,
      to: 1
      /* BuffTarget.Team */
    }
  ]
});
var ACTION_THRENODIAN_LEVIATHAN = new Action("Echo - Reminiscence: Leviathan", {
  cast: 7,
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
      addStat(20, 100);
  }
});
var THRENODIAN_LEVIATHAN = new Mainslot({
  name: "Reminiscence: Threnodian - Leviathan",
  action: ACTION_THRENODIAN_LEVIATHAN,
  echoType: 0,
  stats: [[
    17,
    12,
    384
    /* Attribute.Havoc */
  ], [
    17,
    12,
    16384
    /* Type1.Liberation */
  ]]
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
  stats: [[6, 20], [
    17,
    30,
    16384
    /* Type1.Liberation */
  ]]
});

// dist/src/resonators/aero/iuno.js
function iunoAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA13 = iunoAction("Basic - Moonring 1", { node: 0, cast: 1, type: 4096, mv: 87.68, energy: 1.23, concerto: 1.23, offtune: 3920, forte1: 5 });
var BA23 = iunoAction("Basic - Moonring 2", { node: 0, cast: 1, type: 4096, mv: 139.58, energy: 1.97, concerto: 1.97, offtune: 6242, forte1: 10 });
var BA33 = iunoAction("Basic - Moonring 3", { node: 0, cast: 1, type: 4096, mv: 266.61, energy: 3.73, concerto: 3.73, offtune: 11921, forte1: 20 });
var DC3 = iunoAction("Dodge Counter - Moonring", { node: 0, cast: 0, type: 4096, mv: 248.73, energy: 2, concerto: 13.97, offtune: 6321, forte1: 10 });
var BA123 = new ActionGroup("Basic - Moonring 123", [BA13, BA23, BA33]);
var MA13 = iunoAction("Basic - Moonbow 1", { node: 0, cast: 1, type: 16384, mv: 126.45, energy: 2.33, concerto: 2.65, offtune: 4240 });
var MA22 = iunoAction("Basic - Moonbow 2", { node: 0, cast: 1, type: 16384, mv: 167.01, energy: 3.27, concerto: 3.51, offtune: 5601 });
var MA3 = iunoAction("Basic - Moonbow 3", { node: 0, cast: 1, type: 16384, mv: 334.02, energy: 6, concerto: 7, offtune: 11200 });
var MDC = iunoAction("Dodge Counter - Moonbow", { node: 0, cast: 0, type: 16384, mv: 310.17, energy: 1.77, concerto: 13.51, offtune: 5601 });
var MA123 = new ActionGroup("Basic - Moonbow 123", [MA13, MA22, MA3]);
var Skill3 = iunoAction("Skill - Pulse of Origins", { node: 1, cast: 3, type: 12288, mv: 261.07, energy: 4.58, concerto: 6, offtune: 8086 });
var ESkill = iunoAction("Skill - Closing Refrain", { node: 1, cast: 3, type: 12288, mv: 426.46, energy: 8.15, concerto: 8, offtune: 13200, forte1: 25 });
var MSkill = iunoAction("Skill - Arc Beyond the Edge", { node: 1, cast: 3, type: 16384, mv: 439.58, energy: 9.36, concerto: 8, offtune: 10720 });
var Liberation3 = iunoAction("Liberation - Beneath Lunar Tides", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 1093.46,
  concerto: 20,
  offtune: 96e3,
  forte1: 60,
  resetEnergy: true
});
var Intro3 = iunoAction("Intro - Illuminated Manifestation", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 159.09,
  energy: 10,
  concerto: 10,
  offtune: 10400,
  forte1: 40
});
var Outro3 = iunoAction("Outro - From Gloom to Gleam", {
  cast: 6,
  type: 24576,
  mv: 100,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(IUNO_OUTRO)
});
var JumpHeavy = iunoAction("Heavy - Flux: Moonbow", { node: 2, cast: 2, type: 16384, mv: 250.51, energy: 3.5, concerto: 7, offtune: 11200 });
var FJump = iunoAction("Heavy - Flux: Moonring", { node: 2, cast: 2, type: 16384, mv: 316.72, energy: 4.44, concerto: 8.88, offtune: 14160 });
var FMA12 = iunoAction("Forte Basic - Enhanced Moonbow 1", { node: 2, cast: 1, type: 16384, mv: 205.97, energy: 2.33, concerto: 6.65, offtune: 4240, forte1: -10 });
var FMA22 = iunoAction("Forte Basic - Enhanced Moonbow 2", { node: 2, cast: 1, type: 16384, mv: 286.29, energy: 3.27, concerto: 9.51, offtune: 5601, forte1: -15 });
var FMA32 = iunoAction("Forte Basic - Enhanced Moonbow 3", { node: 2, cast: 1, type: 16384, mv: 532.82, energy: 6, concerto: 17, offtune: 11200, forte1: -25 });
var FMSkill = iunoAction("Forte Skill - Enhanced Arc Beyond the Edge", { node: 2, cast: 3, type: 16384, mv: 638.38, energy: 9.36, concerto: 18, offtune: 10720, forte1: -25 });
var FMA123 = new ActionGroup("Forte - Enhanced Moonbow 123", [FMA12, FMA22, FMA32]);
var FHA2 = iunoAction("Heavy - Absolute Fullness", {
  node: 2,
  cast: 2,
  type: 16384,
  mv: 159.05,
  energy: 5,
  offtune: 2400,
  updateBuffs: () => applyTeam(IUNO_DOMAIN, 1)
});
var IUNO_BLESSING = new Buff({
  name: "Iuno: Blessing of the Wan Light",
  maxStacks: 10,
  applyStats: () => {
    addStat(18, 4 * frozenStacks());
    if (frozenStacks() >= 10 && currentTeam().slots.find((m) => m.resonator === IUNO_RESONATOR)?.isHeld(IO_S2)) {
      asSource(IO_S2, () => addStat(18, 40));
    }
  },
  updateBuffs: () => lostOnSwap()
});
var IUNO_DOMAIN = new Buff({
  name: "Iuno: Full Moon Domain",
  updateBuffs: () => {
    if (applied2(SHIELD))
      applyCurrent(IUNO_BLESSING, applied2(SHIELD));
  }
  // S1's own point of Energy a second is paid by that node (it reads this domain instead)
});
var IO_INHERENT_2 = new Inherent({
  name: "Inherent: Derivation",
  updateBuffs: () => {
    if (casting(
      5
      /* Cast.Intro */
    ) || casting(
      4
      /* Cast.Liberation */
    ))
      applyCurrent(IUNO_BLESSING, 5);
  }
});
var IO_INHERENT_1 = new Inherent({ name: "Inherent: Waxing Ascent" });
var IUNO_OUTRO = new Buff({
  name: "Iuno: Outro",
  stats: [[
    18,
    50,
    8192
    /* Type1.Heavy */
  ]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var LUNAR_CYCLE = /* @__PURE__ */ new Set([JumpHeavy, FJump, MA13, MA22, MA3, MDC, MSkill, FMA12, FMA22, FMA32, FMSkill, FHA2]);
var MOONBOW = /* @__PURE__ */ new Set([MA13, MA22, MA3, MDC, MSkill, FMA12, FMA22, FMA32, FMSkill]);
var SHIELDING = /* @__PURE__ */ new Set([
  BA13,
  BA23,
  BA33,
  DC3,
  MA13,
  MA22,
  MA3,
  MDC,
  Skill3,
  ESkill,
  MSkill,
  Liberation3,
  Intro3,
  JumpHeavy,
  FJump,
  FMA12,
  FMA22,
  FMA32,
  FMSkill,
  FHA2
]);
var IUNO_TALENTS = new Talent({
  name: "Iuno: Talents",
  stats: [[9, 8], [6, 12]]
});
var IUNO_RESONATOR = new Resonator({
  name: "Iuno",
  talent: IUNO_TALENTS,
  inherent1: IO_INHERENT_1,
  inherent2: IO_INHERENT_2,
  element: 64,
  weapon: 3,
  intro: () => Intro3,
  outro: () => Outro3,
  color: "#2dd4c0",
  maxEnergy: 125,
  maxForte1: 100,
  // every cast of hers but the Outro shields
  updateDebuffs: () => {
    if (SHIELDING.has(currentAction()))
      applyCurrent(SHIELD, 1);
  },
  constantStats: () => {
    addStat(1, 10525);
    addStat(0, 450);
    addStat(2, 1124);
  }
});
var IO_S1 = new Sequence({
  name: "Iuno S1: Wax or Wane, All Gild the Bough",
  applyStats: () => {
    if (LUNAR_CYCLE.has(currentAction()))
      addStat(6, 40);
    if (stacksOfTeam(IUNO_DOMAIN) > 0 && oneSecondPassed())
      addStat(26, 1);
  }
});
var IO_S2 = new Sequence({ name: "Iuno S2: Day or Night, Let This Be Eternal" });
var IO_S3 = new Sequence({
  name: "Iuno S3: I Drink Deep of Their Forgetting",
  applyStats: () => {
    if (MOONBOW.has(currentAction()))
      addStat(18, 65);
  }
});
var IO_S4 = new Sequence({
  name: "Iuno S4: Rainy Season Dwell in My Eyes",
  updateBuffs: () => {
    if (runningAction(FHA2))
      applyOthers(IUNO_BLESSING, 1);
  }
});
var IO_S5 = new Sequence({
  name: "Iuno S5: A Thousand Futile Glimpses",
  stats: [[
    17,
    20,
    16384
    /* Type1.Liberation */
  ]]
});
var IO_S6 = new Sequence({
  name: "Iuno S6: I Am the Constant in the Chaos",
  applyStats: () => {
    if (runningAction(FHA2)) {
      addStat(15, 1600);
      addStat(30, 100);
    }
  }
});
var IO_SEQUENCES = [IO_S1, IO_S2, IO_S3, IO_S4, IO_S5, IO_S6];
var IO_ROTATION = new Rotation([
  INTRO,
  ECHO_CANCEL,
  Liberation3,
  JumpHeavy,
  FMSkill,
  FMA123,
  FMSkill,
  FHA2,
  OUTRO
]);
var IO_ROTATION_MDPS = new Rotation([
  INTRO,
  ESkill,
  // todo swap skill
  JumpHeavy,
  FMSkill,
  FMA123,
  Liberation3,
  FMA123,
  FMSkill,
  MA123,
  FHA2,
  ECHO_SWAP,
  OUTRO
]);
var IO_ROTATION_MDPS_S6 = new Rotation([
  INTRO,
  Liberation3,
  JumpHeavy,
  FMSkill,
  FMA123,
  FMSkill,
  FHA2,
  FMSkill,
  FMA123,
  FMSkill,
  ECHO_SWAP,
  OUTRO
]);
var IUNO = new Loadout({
  resonator: IUNO_RESONATOR,
  weapons: [IUNO_SIG, NEW_STD_GAUNTLET, MARCATO, ABYSS_SURGES, VERITYS_HANDLE],
  echoLoadouts: [
    new EchoLoadout(MYA, COV_3PC, SIERRA_GALE_2PC),
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    new EchoLoadout(FALLACY, REJUV_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    12,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.Er, Substat.FlatAtk),
  rotation: IO_ROTATION,
  sequences: IO_SEQUENCES
});
var IUNO_MDPS = new Loadout({
  resonator: IUNO_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Er),
  rotation: { 0: IO_ROTATION_MDPS, 6: IO_ROTATION_MDPS_S6 },
  sequences: IO_SEQUENCES
});

// dist/src/resonators/aero/jianxin.js
function jianxinAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA14 = jianxinAction("Basic - Fengyiquan 1", { node: 0, cast: 1, type: 4096, mv: 69.46, energy: 1.02, concerto: 3.28, offtune: 3280, forte1: 6 });
var BA24 = jianxinAction("Basic - Fengyiquan 2", { node: 0, cast: 1, type: 4096, mv: 133.18, energy: 1.97, concerto: 6.3, offtune: 6320, forte1: 10 });
var BA35 = jianxinAction("Basic - Fengyiquan 3", { node: 0, cast: 1, type: 4096, mv: 167, energy: 2.48, concerto: 7.92, offtune: 7920, forte1: 12 });
var BA43 = jianxinAction("Basic - Fengyiquan 4", { node: 0, cast: 1, type: 4096, mv: 113.4, energy: 1.68, concerto: 5.37, offtune: 5360, forte1: 12 });
var HA3 = jianxinAction("Heavy - Fengyiquan", { node: 0, cast: 2, type: 8192, mv: 126.07, energy: 1.87, concerto: 5.96, offtune: 6e3, forte1: 9 });
var MA = jianxinAction("Mid-air - Fengyiquan", { node: 0, cast: 1, type: 4096, mv: 123.27, energy: 0.52, concerto: 1, offtune: 4960, forte1: 6 });
var DC4 = jianxinAction("Dodge Counter - Fengyiquan", { node: 0, cast: 0, type: 4096, mv: 244.94, energy: 3.1, concerto: 16.68, offtune: 13143, forte1: 17 });
var BA1234 = new ActionGroup("Basic - Fengyiquan 1234", [BA14, BA24, BA35, BA43]);
var ChiParry = jianxinAction("Skill - Calming Air: Chi Parry", { node: 1, cast: 3, type: 12288, mv: 258.73, energy: 4, concerto: 22, offtune: 12240, forte1: 15 + 25 });
var ChiCounter = jianxinAction("Skill - Calming Air: Chi Counter", { node: 1, cast: 3, type: 12288, mv: 334.6, energy: 4, concerto: 22, offtune: 5200, forte1: 15 + 25 });
var Liberation4 = jianxinAction("Liberation - Purification Force Field", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 636.2 + 29.83 * 15,
  concerto: 20,
  offtune: 48e3 + 3200 * 15,
  resetEnergy: true
});
var FHA3 = jianxinAction("Forte Heavy - Primordial Chi Spiral", {
  node: 2,
  cast: 2,
  forte1: -120
});
var ChiStrike = jianxinAction("Forte Heavy - Zhoutian: Chi Strike", {
  node: 2,
  cast: 2,
  type: 8192,
  mv: 24.86,
  energy: 0.3,
  offtune: 2e3
});
var MinorShock = jianxinAction("Forte Heavy - Minor Zhoutian: Shock", {
  node: 2,
  cast: 2,
  type: 8192,
  mv: 139.17,
  energy: 2,
  concerto: 5,
  offtune: 3920
});
var InnerShock = jianxinAction("Forte Heavy - Major Zhoutian (Inner): Shock", {
  node: 2,
  cast: 2,
  type: 8192,
  mv: 377.74,
  energy: 8,
  concerto: 18,
  offtune: 5120
});
var OuterShock = jianxinAction("Forte Heavy - Major Zhoutian (Outer): Shock", {
  node: 2,
  cast: 2,
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
var PushingPunch = jianxinAction("Forte Heavy - Pushing Punch", {
  node: 2,
  cast: 2,
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
var YieldingPull = jianxinAction("Forte Heavy - Yielding Pull", {
  node: 2,
  cast: 2,
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
var ZHOUTIAN_1 = new ActionGroup("Forte Heavy - Primordial Chi Spiral (Zhoutian 1)", [
  FHA3,
  PushingPunch
]);
var ZHOUTIAN_2 = new ActionGroup("Forte Heavy - Primordial Chi Spiral (Zhoutian 2)", [
  FHA3,
  MinorShock,
  YieldingPull
  // missing chi strikes
]);
var ZHOUTIAN_3 = new ActionGroup("Forte Heavy - Primordial Chi Spiral (Zhoutian 3)", [
  FHA3,
  MinorShock,
  InnerShock,
  YieldingPull
  // missing chi strikes
]);
var ZHOUTIAN_4 = new ActionGroup("Forte Heavy - Primordial Chi Spiral (Zhoutian 4)", [
  FHA3,
  MinorShock,
  InnerShock,
  OuterShock
  // missing chi strikes
]);
var Intro4 = jianxinAction("Intro - Essence of Tao", { node: 4, cast: 5, type: 20480, mv: 33.8 * 3 + 67.6, energy: 10, concerto: 10, offtune: 2667 * 3 + 1600, forte1: 40 });
var Outro4 = jianxinAction("Outro - Transcendence", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(TRANSCENDENCE)
});
var TRANSCENDENCE = new Buff({
  name: "Jianxin: Outro",
  updateBuffs: () => lostOnSwap(),
  stats: [[
    18,
    38,
    16384
    /* Type1.Liberation */
  ]]
});
var S1_BRANCHLET = new Buff({
  name: "Jianxin S1: Verdant Branchlet",
  applyStats: () => {
    if (casting(
      1
      /* Cast.Basic */
    ))
      addStat(30, currentAction().forte1);
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(S1_BRANCHLET);
  }
});
var S1 = new Sequence({
  name: "Jianxin S1: Verdant Branchlet",
  updateBuffs: () => {
    if (runningAction(Intro4))
      applyCurrent(S1_BRANCHLET, 1);
  }
});
var S2 = new Sequence({ name: "Jianxin S2: Tao Seeker's Journey" });
var S3 = new Sequence({ name: "Jianxin S3: Principles of Wuwei" });
var S4_REFLECTION = new Buff({
  name: "Jianxin S4: Multitide Reflection",
  applyStats: () => {
    if (runningAction(Liberation4))
      addStat(17, 80);
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(S4_REFLECTION);
  }
});
var S4 = new Sequence({
  name: "Jianxin S4",
  updateBuffs: () => {
    if (runningAction(FHA3))
      applyCurrent(S4_REFLECTION, 1);
  }
});
var S5 = new Sequence({ name: "Jianxin S5" });
var SpecialChiCounter = jianxinAction("Skill - Special Chi Counter", {
  node: 1,
  cast: 3,
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
    if (runningAction(Liberation4))
      addStat(17, 20);
  }
});
var JX_INHERENT_2 = new Inherent({ name: "Inherent: Reflection" });
var JIANXIN_TALENTS = new Talent({
  name: "Jianxin: Talents",
  stats: [[6, 12], [9, 8]]
});
var JIANXIN_RESONATOR = new Resonator({
  name: "Jianxin",
  talent: JIANXIN_TALENTS,
  inherent1: JX_INHERENT_1,
  inherent2: JX_INHERENT_2,
  tier: 1,
  element: 64,
  weapon: 3,
  intro: () => Intro4,
  outro: () => Outro4,
  color: "#9fe0c8",
  maxEnergy: 150,
  maxForte1: 120,
  constantStats: () => {
    addStat(1, 14112.5);
    addStat(0, 337.5);
    addStat(2, 1124.44);
  }
});
var JX_ROTATION = new Rotation([
  INTRO,
  BA1234,
  ChiParry,
  Liberation4,
  ZHOUTIAN_1,
  ECHO_SWAP,
  OUTRO
]);
var JX_ROTATION_S2 = new Rotation([
  INTRO,
  ChiParry,
  ChiParry,
  Liberation4,
  ZHOUTIAN_1,
  ECHO_SWAP,
  OUTRO
]);
var JIANXIN = new Loadout({
  resonator: JIANXIN_RESONATOR,
  weapons: [MARCATO[4]],
  // the craftable at its real R5, the one rank she is ever run at
  echoLoadouts: [new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    12,
    6,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Liberation, Substat.Er),
  rotation: { 0: JX_ROTATION, 2: JX_ROTATION_S2 },
  sequences: [S1, S2, S3, S4, S5, S6]
});

// dist/src/weapons/broadblade.js
var VERDANT_SUMMIT = refinements((r, rank) => {
  const SWORDSWORN_STACKS = new Buff({
    name: `Verdant Summit: Swordsworn${rank}`,
    maxStacks: 2,
    stats: [[
      17,
      [24, 30, 36, 42, 48][r],
      8192
      /* Type1.Heavy */
    ]],
    perStack: true,
    early: true,
    until: 0
  });
  return new Weapon({
    weaponType: 1,
    name: `Verdant Summit${rank}`,
    stats: [[0, 587.5], [10, 48.6], [17, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onCast(
      5,
      4
      /* Cast.Liberation */
    ), buff: SWORDSWORN_STACKS }]
  });
});
var AGES_OF_HARVEST = refinements((r, rank) => {
  const AGELESS_MARKING = new Buff({
    name: `Ages of Harvest: Ageless Marking${rank}`,
    stats: [[
      17,
      [24, 30, 36, 42, 48][r],
      12288
      /* Type1.Skill */
    ]],
    until: 0
  });
  const ETHEREAL_ENDOWMENT = new Buff({
    name: `Ages of Harvest: Ethereal Endowment${rank}`,
    stats: [[
      17,
      [24, 30, 36, 42, 48][r],
      12288
      /* Type1.Skill */
    ]],
    until: 0
  });
  return new Weapon({
    weaponType: 1,
    name: `Ages of Harvest${rank}`,
    stats: [[0, 587.5], [10, 48.6], [17, [12, 15, 18, 21, 24][r]]],
    grants: [
      { on: onCast(
        5
        /* Cast.Intro */
      ), buff: AGELESS_MARKING },
      { on: onCast(
        3
        /* Cast.Skill */
      ), buff: ETHEREAL_ENDOWMENT }
    ]
  });
});
var THUNDERFLARE_DOMINION = refinements((r, rank) => {
  const THUNDERBLAZE_DMG = new Buff({
    name: `Thunderflare Dominion: Thunderblaze Eminence (heavy)${rank}`,
    stats: [[
      17,
      [20, 25, 30, 35, 40][r],
      8192
      /* Type1.Heavy */
    ]],
    until: 0
  });
  const THUNDERBLAZE_DEF = new Buff({
    name: `Thunderflare Dominion: Thunderblaze Eminence (def ignore)${rank}`,
    maxStacks: 5,
    stats: [[
      22,
      [7.2, 8.4, 9.6, 10.8, 12][r],
      8192
      /* Type1.Heavy */
    ]],
    perStack: true,
    early: true,
    until: 0
  });
  return new Weapon({
    weaponType: 1,
    name: `Thunderflare Dominion${rank}`,
    stats: [[0, 675], [9, 12.15], [6, [12, 15, 18, 21, 24][r]]],
    grants: [
      { on: onCast(
        5,
        3
        /* Cast.Skill */
      ), buff: THUNDERBLAZE_DMG },
      { on: onApplied(SHIELD), buff: THUNDERBLAZE_DEF, stacks: () => applied2(SHIELD) }
    ]
  });
});
var WILDFIRE_MARK = refinements((r, rank) => {
  const WILDFIRE_TEAM = new Buff({
    name: `Wildfire Mark: Blazing Starfire${rank}`,
    stats: [[
      17,
      [24, 30, 36, 42, 48][r],
      192
      /* Attribute.Fusion */
    ]]
  });
  const WILDFIRE_LIB_DMG = new Buff({
    name: `Wildfire Mark: Blazing Starfire${rank}`,
    stats: [[
      17,
      [24, 30, 36, 42, 48][r],
      16384
      /* Type1.Liberation */
    ]],
    until: 0,
    grants: [{
      on: onType(
        8192
        /* Type1.Heavy */
      ),
      buff: WILDFIRE_TEAM,
      to: 1
      /* BuffTarget.Team */
    }]
  });
  return new Weapon({
    weaponType: 1,
    name: `Wildfire Mark${rank}`,
    stats: [[0, 587.5], [10, 48.6], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onCast(
      5,
      4
      /* Cast.Liberation */
    ), buff: WILDFIRE_LIB_DMG }]
  });
});
var JINGRAN_SIG = refinements((r, rank) => {
  const NATURES_ORDER = new Buff({
    name: `Thousandfold Deliverance: Nature's Order${rank}`,
    maxStacks: 6,
    until: 1,
    stats: [[10, [4, 5, 6, 7, 8][r]]],
    perStack: true,
    applyStats: () => {
      if (frozenStacks() >= 6)
        addStat(
          9,
          [12, 15, 18, 21, 24][r],
          8192
          /* Type1.Heavy */
        );
    }
  });
  const CRADLE_OF_LIFE = new Buff({
    name: `Thousandfold Deliverance: Cradle of Life${rank}`,
    maxStacks: 6,
    until: 1,
    updateBuffs: () => {
      if (!casting(
        2
        /* Cast.Heavy */
      ))
        return;
      const spent = Math.min(frozenStacks(), 2);
      addStat(
        22,
        [15, 17.5, 20, 22.5, 25][r] * spent,
        8192
        /* Type1.Heavy */
      );
      removeStack(CRADLE_OF_LIFE, spent);
    }
  });
  return new Weapon({
    weaponType: 1,
    name: `Thousandfold Deliverance${rank}`,
    stats: [[0, 413], [7, 72.2], [17, [12, 15, 18, 21, 24][r]]],
    updateBuffs: () => {
      if (casting(
        5
        /* Cast.Intro */
      )) {
        applyCurrent(NATURES_ORDER);
        applyCurrent(CRADLE_OF_LIFE);
      } else if (applied2(SHIELD)) {
        applyCurrent(NATURES_ORDER, applied2(SHIELD));
        applyCurrent(CRADLE_OF_LIFE, applied2(SHIELD));
      }
    }
  });
});
var STARFIELD_CALIBRATOR = refinements((r, rank) => {
  const DEFINITE_SOLUTION = new Buff({
    name: `Starfield Calibrator: Definite Solution${rank}`,
    stats: [[10, [20, 25, 30, 35, 40][r]]],
    when: isActive
  });
  const DEFINITE_SOLUTION_CONCERTO = new Buff({
    name: `Starfield Calibrator: Definite Solution${rank}`,
    maxStacks: 2,
    applyStats: () => {
      if (frozenStacks() === 1 && casting(
        3
        /* Cast.Skill */
      )) {
        applyCurrent(DEFINITE_SOLUTION_CONCERTO, 1);
        addStat(27, [8, 10, 12, 14, 16][r]);
      } else if (frozenStacks() === 2 && casting(
        6
        /* Cast.Outro */
      ))
        removeStack(DEFINITE_SOLUTION_CONCERTO, 2);
    },
    display: () => `Starfield Calibrator: Definite Solution${rank}${frozenStacks() === 1 ? "" : " (cooldown)"}`
  });
  return new Weapon({
    weaponType: 1,
    name: `Starfield Calibrator${rank}`,
    stats: [[0, 412.5], [11, 77.04], [8, [16, 20, 24, 28, 32][r]]],
    grants: [
      { on: onCast(
        3
        /* Cast.Skill */
      ), buff: DEFINITE_SOLUTION_CONCERTO },
      {
        on: onApplied(HEALS),
        buff: DEFINITE_SOLUTION,
        to: 1
        /* BuffTarget.Team */
      }
    ]
  });
});
var KUMOKIRI = refinements((r, rank) => {
  const THREAD_OF_FATE_BONUS = new Buff({
    name: `Kumokiri: Thread of Fate${rank}`,
    stats: [[17, [24, 30, 36, 42, 48][r]]]
  });
  const THREAD_OF_FATE_STACKS = new Buff({
    name: `Kumokiri: Thread of Fate${rank}`,
    maxStacks: 3,
    stats: [[
      17,
      [8, 10, 12, 14, 16][r],
      16384
      /* Type1.Liberation */
    ]],
    perStack: true,
    // watched from updateGlobal so a teammate's own cast is seen — where `currentSlot` is this
    // buff's holder, so the actor is read off the team and the payout put on their slot by name
    updateGlobal() {
      const actor = currentTeam().slot;
      if (frozenStacks() >= 3 && actor.resonator && inflictedNegativeStatusBy(actor))
        addBuff(actor.resonator, THREAD_OF_FATE_BONUS, 1);
    }
  });
  return new Weapon({
    weaponType: 1,
    name: `Kumokiri${rank}`,
    stats: [[0, 500], [9, 36], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: either(onCast(
      5
      /* Cast.Intro */
    ), inflictedNegativeStatus), buff: THREAD_OF_FATE_STACKS }]
  });
});

// dist/src/resonators/aero/jiyan.js
function jiyanAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA15 = jiyanAction("Basic - Lone Lance 1", { node: 0, cast: 1, type: 4096, mv: 73.16, energy: 0.92, concerto: 1.84, offtune: 2944 });
var BA25 = jiyanAction("Basic - Lone Lance 2", { node: 0, cast: 1, type: 4096, mv: 43.73, energy: 0.55, concerto: 1.1, offtune: 1760 });
var BA36 = jiyanAction("Basic - Lone Lance 3", { node: 0, cast: 1, type: 4096, mv: 36.38 * 5, energy: 2.25, concerto: 4.55, offtune: 7320 });
var BA44 = jiyanAction("Basic - Lone Lance 4", { node: 0, cast: 1, type: 4096, mv: 66.2 * 2, energy: 1.66, concerto: 3.32, offtune: 5328 });
var BA5 = jiyanAction("Basic - Lone Lance 5", { node: 0, cast: 1, type: 4096, mv: 23.6 * 7 + 153.45 * 2, energy: 5.87, concerto: 11.83, offtune: 19e3 });
var HA4 = jiyanAction("Heavy - Lone Lance", { node: 0, cast: 2, type: 8192, mv: 22.2 * 6, energy: 1.62, concerto: 3.3, offtune: 5364 });
var HA22 = jiyanAction("Heavy - Windborne Strike", { node: 0, cast: 2, type: 8192, mv: 105.96, energy: 1.33, concerto: 2.66, offtune: 4264 });
var HA32 = jiyanAction("Heavy - Abyssal Slash", { node: 0, cast: 2, type: 8192, mv: 81.71, energy: 1.02, concerto: 2.05, offtune: 3288 });
var MA4 = jiyanAction("Mid-air - Lone Lance", { node: 0, cast: 1, type: 4096, mv: 123.26, energy: 0.51, concerto: 1, offtune: 4960 });
var MA23 = jiyanAction("Mid-air - Lone Lance (Follow-Up)", { node: 0, cast: 1, type: 4096, mv: 155.66, energy: 1.95, concerto: 3.91, offtune: 6264 });
var MA32 = jiyanAction("Basic - Banner of Triumph", { node: 0, cast: 1, type: 4096, mv: 79.52, energy: 1, concerto: 2, offtune: 3200 });
var DC5 = jiyanAction("Dodge Counter - Lone Lance", { node: 0, cast: 0, type: 4096, mv: 125.84 * 2, energy: 3.16, concerto: 13.32, offtune: 5328 });
var WINDQUELLER = { applyStats: () => addStat(17, 20) };
var Skill4 = jiyanAction("Skill - Windqueller", { node: 1, cast: 3, type: 12288, mv: 106.36 * 4, energy: 9, concerto: 16, offtune: 6480, forte1: -30, ...WINDQUELLER });
var SkillLowResolve = jiyanAction("Skill - Windqueller (Low Resolve)", { node: 1, cast: 3, type: 12288, mv: 106.36 * 4, energy: 9, concerto: 16, offtune: 6480 });
var USkill = jiyanAction("Skill - Windqueller (Qingloong)", { node: 1, cast: 3, type: 12288, mv: 106.36 * 4, energy: 9, concerto: 16, offtune: 6480, ...WINDQUELLER });
var Liberation5 = jiyanAction("Liberation - Emerald Storm: Prelude", {
  node: 3,
  cast: 4,
  cutscene: true,
  concerto: 20,
  resetEnergy: true,
  updateBuffs: () => {
    if (forte1() >= 30)
      queue(Finale);
  }
});
var Finale = jiyanAction("Liberation - Emerald Storm: Finale", { node: 3, cast: 4, cutscene: true, type: 8192, mv: 142.91 * 2 + 428.73, offtune: 107520, forte1: -30 });
var Lance1 = jiyanAction("Heavy - Lance of Qingloong 1", { node: 3, cast: 2, type: 8192, mv: 65.52 * 8, energy: 3.76, concerto: 7.6, offtune: 12272 });
var Lance2 = jiyanAction("Heavy - Lance of Qingloong 2", { node: 3, cast: 2, type: 8192, mv: 61.55 * 8, energy: 3.6, concerto: 7.2, offtune: 11528 });
var Lance3 = jiyanAction("Heavy - Lance of Qingloong 3", { node: 3, cast: 2, type: 8192, mv: 66.76 * 8, energy: 3.84, concerto: 7.76, offtune: 12504 });
var Intro5 = jiyanAction("Intro - Tactical Strike", { node: 4, cast: 5, type: 20480, mv: 198.81, energy: 10, concerto: 10, offtune: 7416, forte1: 30 });
var Outro5 = jiyanAction("Outro - Discipline", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  // queued twice so the adopter picks the buff up at both charges
  updateBuffs: () => {
    queueOutro(JIYAN_OUTRO);
    queueOutro(JIYAN_OUTRO);
  }
});
var DISCIPLINE_FIELD = new ActionField("Jiyan: Discipline");
var ACTION_OUTRO_COORD = jiyanAction("Outro - Discipline (Coordinated Lance)", { type: 24576, type2: 262144, mv: 313.4, field: DISCIPLINE_FIELD });
var HEAVENLY_BALANCE = new Buff({
  name: "Inherent: Heavenly Balance",
  stats: [[6, 10]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(HEAVENLY_BALANCE);
  }
});
var JY_INHERENT_1 = new Inherent({
  name: "Inherent: Heavenly Balance",
  updateBuffs: () => {
    if (casting(
      5
      /* Cast.Intro */
    ))
      applyCurrent(HEAVENLY_BALANCE, 1);
  }
});
var TEMPEST_TAMING = new Buff({
  name: "Inherent: Tempest Taming",
  stats: [[10, 12]],
  convertStats: () => {
    if (casting(
      6
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
    if (!triggeredAction() && isActive())
      applyCurrent(TEMPEST_TAMING, 1);
  }
});
var JIYAN_OUTRO = new Buff({
  field: DISCIPLINE_FIELD,
  name: "Jiyan: Outro",
  maxStacks: 2,
  updateBuffs: () => {
    if (casting(
      2
      /* Cast.Heavy */
    )) {
      queueOn(JIYAN_RESONATOR, ACTION_OUTRO_COORD);
      removeStack(JIYAN_OUTRO, 1);
    }
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(JIYAN_OUTRO);
  }
});
var JIYAN_TALENTS = new Talent({
  name: "Jiyan: Talents",
  stats: [[9, 8], [6, 12]]
});
var JIYAN_RESONATOR = new Resonator({
  name: "Jiyan",
  matrix: matrix("Jiyan", 25),
  talent: JIYAN_TALENTS,
  inherent1: JY_INHERENT_1,
  inherent2: JY_INHERENT_2,
  element: 64,
  weapon: 1,
  intro: () => Intro5,
  outro: () => Outro5,
  color: "#4fc98f",
  maxEnergy: 125,
  maxForte1: 60,
  constantStats: () => {
    addStat(1, 10487.5);
    addStat(0, 437.5);
    addStat(2, 1185.55);
  }
});
var JY_S1 = new Sequence({
  name: "Jiyan S1: Benevolence",
  applyStats: () => {
    if (runningAction(Skill4))
      addStat(30, 15);
  }
});
var VERSATILITY = new Buff({
  name: "Jiyan S2: Versatility",
  stats: [[6, 28]],
  until: 2
});
var JY_S2 = new Sequence({
  name: "Jiyan S2: Versatility",
  applyStats: () => {
    if (runningAction(Intro5))
      addStat(30, 30);
  },
  updateBuffs: () => {
    if (runningAction(Intro5))
      applyCurrent(VERSATILITY, 1);
  }
});
var SPECTATION = new Buff({
  name: "Jiyan S3: Spectation",
  stats: [[9, 16], [10, 32]],
  until: 2
});
var JY_S3 = new Sequence({
  name: "Jiyan S3: Spectation",
  updateBuffs: () => {
    if (runningAction(Skill4) || runningAction(SkillLowResolve) || runningAction(USkill) || runningAction(Liberation5) || runningAction(Finale) || runningAction(Intro5))
      applyCurrent(SPECTATION, 1);
  }
});
var PRUDENCE = new Buff({
  name: "Jiyan S4: Prudence",
  stats: [[
    17,
    25,
    8192
    /* Type1.Heavy */
  ]]
});
var JY_S4 = new Sequence({
  name: "Jiyan S4: Prudence",
  updateBuffs: () => {
    if (runningAction(Liberation5) || runningAction(Finale))
      applyTeam(PRUDENCE, 1);
  }
});
var RESOLUTION = new Buff({
  name: "Jiyan S5: Resolution",
  maxStacks: 15,
  stats: [[6, 3]],
  perStack: true,
  until: 2
});
var JY_S5 = new Sequence({
  name: "Jiyan S5: Resolution",
  applyStats: () => {
    if (runningAction(ACTION_OUTRO_COORD))
      addStat(16, 120);
  },
  updateBuffs: () => {
    if (runningAction(Intro5))
      applyCurrent(RESOLUTION, 15);
    else if (!triggeredAction() && isActive())
      applyCurrent(RESOLUTION, 1);
  }
});
var MOMENTUM = new Buff({
  name: "Jiyan S6: Momentum",
  maxStacks: 2,
  applyStats: () => {
    if (runningAction(Finale))
      addStat(16, 120 * frozenStacks());
  },
  convertStats: () => {
    if (runningAction(Finale))
      revokeCurrent(MOMENTUM);
  }
});
var JY_S6 = new Sequence({
  name: "Jiyan S6: Fortitude",
  updateBuffs: () => {
    if (casting(
      2
      /* Cast.Heavy */
    ) || runningAction(Intro5) || runningAction(Skill4) || runningAction(SkillLowResolve) || runningAction(USkill))
      applyCurrent(MOMENTUM, 1);
  }
});
var JY_SEQUENCES = [JY_S1, JY_S2, JY_S3, JY_S4, JY_S5, JY_S6];
var JY_ROTATION = new Rotation([
  START_3,
  SkillLowResolve.swap(),
  SWAP,
  INTRO,
  ECHO_CANCEL,
  Liberation5,
  Lance1,
  USkill,
  Lance1,
  DODGE,
  Lance1,
  DODGE,
  Lance1,
  DODGE,
  Lance1,
  DODGE,
  Lance1,
  DODGE,
  Lance1,
  DODGE,
  SkillLowResolve.swap(),
  OUTRO
]);
var JIYAN = new Loadout({
  resonator: JIYAN_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Er),
  rotation: JY_ROTATION,
  sequences: JY_SEQUENCES
});

// dist/src/echoes/mengzhou.js
var ACTION_MYRIAD_SNARE = new Action("Echo - Myriad Snare", {
  cast: 7,
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
  stats: [[
    17,
    12,
    192
    /* Attribute.Fusion */
  ], [
    17,
    12,
    8192
    /* Type1.Heavy */
  ]]
});
var LAMP_STACKS = new Buff({
  name: "Lamp of Nether Road 5pc",
  maxStacks: 4,
  stats: [[9, 5]],
  perStack: true,
  until: 0,
  applyStats: () => {
    if (frozenStacks() >= 4)
      addStat(
        17,
        15,
        192
        /* Attribute.Fusion */
      );
  }
});
var LAMP_2PC = new Sonata2pc({ name: "Lamp of Nether Road 2pc", stats: [[7, 10]] });
var LAMP_5PC = new Sonata({
  name: "Lamp of Nether Road 5pc",
  sonata2pc: LAMP_2PC,
  grants: [{ on: onApplied(SHIELD), buff: LAMP_STACKS, stacks: () => applied2(SHIELD) }]
});
var ACTION_CALAMITY_EFFIGY = new Action("Echo - Calamity Effigy", {
  cast: 7,
  element: 64,
  scaling: 0,
  type: 28672,
  mv: 405,
  energy: 5.62
});
var CALAMITY_EFFIGY_STRAIN = new Buff({
  name: "Calamity Effigy (strain)",
  stats: [[
    17,
    10,
    64
    /* Attribute.Aero */
  ]],
  until: 0
});
var CALAMITY_EFFIGY = new Mainslot({
  name: "Calamity Effigy",
  action: ACTION_CALAMITY_EFFIGY,
  echoType: 1,
  stats: [[
    17,
    10,
    64
    /* Attribute.Aero */
  ]],
  grants: [{ on: onInflict(TUNE_STRAIN_SHIFTING), buff: CALAMITY_EFFIGY_STRAIN }]
});
var HEART_OF_EVILS_PURGE_2PC = new Sonata2pc({ name: "Heart of Evil's Purge 2pc", stats: [[
  17,
  10,
  64
  /* Attribute.Aero */
]] });
var HEART_OF_EVILS_PURGE_5PC = new Sonata({
  name: "Heart of Evil's Purge 5pc",
  sonata2pc: HEART_OF_EVILS_PURGE_2PC,
  grants: [{ on: onInflict(TUNE_STRAIN_SHIFTING), buff: () => HEART_OF_EVILS_PURGE_BUFF }]
});
var HEART_OF_EVILS_PURGE_BUFF = new Buff({
  name: "Heart of Evil's Purge 5pc",
  stats: [[10, 20], [
    17,
    30,
    64
    /* Attribute.Aero */
  ]],
  until: 0
});
var ACTION_THOUSAND_PUPPET_PAVILION = new Action("Echo - Thousand-Puppet Pavilion", {
  cast: 7,
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
  stats: [[
    17,
    12,
    384
    /* Attribute.Havoc */
  ], [
    17,
    12,
    8192
    /* Type1.Heavy */
  ]]
});
var FEATHERED_TRACE_2PC = new Sonata2pc({ name: "Song of Feathered Trace 2pc", stats: [[11, 10]] });
var FEATHERED_TRACE_5PC = new Sonata({
  name: "Song of Feathered Trace 5pc",
  sonata2pc: FEATHERED_TRACE_2PC,
  grants: [
    { on: onInflict(HAVOC_BANE), buff: () => XUANLINGS_FEATHER },
    {
      on: onInflict(GLACIO_CHAFE),
      buff: () => CHONGMINGS_FEATHER,
      to: 1
      /* BuffTarget.Team */
    }
  ]
});
var XUANLINGS_FEATHER = new Buff({
  name: "Song of Feathered Trace 5pc: Xuanling's Feather",
  stats: [[9, 20], [
    17,
    35,
    8192
    /* Type1.Heavy */
  ]],
  until: 0
});
var CHONGMINGS_FEATHER = new Buff({
  name: "Song of Feathered Trace 5pc: Chongming's Feather",
  stats: [[6, 25]]
});
var ACTION_FORBIDDEN_BASTION = new Action("Echo - Forbidden Bastion", {
  cast: 7,
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
  stats: [[24, 10]]
});
var STAY_TUNED_BUFF = new Buff({
  name: "Stay tuned 4c",
  stats: [[
    17,
    10,
    128
    /* Attribute.Electro */
  ]]
});
var ACTION_STAY_TUNED = new Action("Echo - Stay tuned", {
  cast: 7,
  element: 128,
  scaling: 0,
  type: 28672,
  mv: 27.36 * 4 + 164.16,
  energy: 0.38 * 4 + 2.28,
  applyStats: () => {
    if (currentMember().resonator?.name !== "Hsin")
      return;
    addStat(15, 13.68 * 5 + 232.56 - (27.36 * 4 + 164.16));
    addStat(26, 0.19 * 5 + 3.23 - (0.38 * 4 + 2.28));
  }
});
var STAY_TUNED = new Mainslot({
  name: "Stay tuned 4c",
  action: ACTION_STAY_TUNED,
  echoType: 0,
  stats: [[
    17,
    10,
    128
    /* Attribute.Electro */
  ]],
  grants: [{ on: either(onInflict(ELECTRO_FLARE), gainedUnison, unisonResponse), buff: STAY_TUNED_BUFF }]
});
var ACTION_SOUL_OF_DESPAIR = new Action("Echo - Soul of Despair", {
  cast: 7,
  element: 128,
  scaling: 0,
  type: 28672,
  mv: 91.18 * 3,
  energy: 1.26 * 3,
  updateBuffs: () => queueOutro(SOUL_OF_DESPAIR_HANDOFF)
});
var SOUL_OF_DESPAIR = new Mainslot({
  name: "Soul of Despair",
  action: ACTION_SOUL_OF_DESPAIR,
  echoType: 0
});
var SOUL_OF_DESPAIR_HANDOFF = handoff("Soul of Despair: Outro", () => addStat(
  17,
  12,
  128
  /* Attribute.Electro */
));
var SWORN_VIGIL_2PC = new Sonata2pc({ name: "Heart of Sworn Vigil 2pc", stats: [[
  17,
  10,
  128
  /* Attribute.Electro */
]] });
var SWORN_VIGIL_5PC = new Sonata({
  name: "Heart of Sworn Vigil 5pc",
  sonata2pc: SWORN_VIGIL_2PC,
  grants: [{ on: either(onInflict(ELECTRO_FLARE), gainedUnison, unisonResponse), buff: () => SWORN_VIGIL_BUFF }]
});
var SWORN_VIGIL_BUFF = new Buff({
  name: "Heart of Sworn Vigil 5pc",
  stats: [[9, 15], [
    17,
    22.5,
    128
    /* Attribute.Electro */
  ]]
});
var ELECTRIC_REFLECTION_2PC = new Sonata2pc({ name: "Flash of Electric Reflection 2pc", stats: [[
  17,
  10,
  128
  /* Attribute.Electro */
]] });
var ELECTRIC_REFLECTION_5PC = new Sonata({
  name: "Flash of Electric Reflection 5pc",
  sonata2pc: ELECTRIC_REFLECTION_2PC,
  grants: [{ on: onInflict(ELECTRO_FLARE), buff: () => ELECTRIC_REFLECTION_BUFF }]
});
var ELECTRIC_REFLECTION_BUFF = new Buff({
  name: "Flash of Electric Reflection 5pc",
  stats: [[
    17,
    10,
    128
    /* Attribute.Electro */
  ]],
  until: 0,
  grants: [{
    on: onCast(
      6
      /* Cast.Outro */
    ),
    buff: () => ELECTRIC_REFLECTION_HANDOFF,
    to: 3
    /* BuffTarget.Next */
  }]
});
var ELECTRIC_REFLECTION_HANDOFF = handoff("Flash of Electric Reflection 5pc (outro)", () => addStat(
  17,
  25,
  128
  /* Attribute.Electro */
));
var ACTION_FORMLESS_DEMON = new Action("Echo - Formless Demon", {
  cast: 7,
  element: 192,
  scaling: 0,
  type: 28672,
  mv: 273.6,
  energy: 3.8
});
var FORMLESS_DEMON = new Mainslot({
  name: "Formless Demon",
  action: ACTION_FORMLESS_DEMON,
  echoType: 0,
  stats: [[11, 10]]
});
var TINGED_YEARNING_2PC = new Sonata2pc({ name: "Flower of Tinged Yearning 2pc", stats: [[24, 10]] });
var TINGED_YEARNING_5PC = new Sonata({
  name: "Flower of Tinged Yearning 5pc",
  sonata2pc: TINGED_YEARNING_2PC,
  grants: [{
    on: onApplied(HEALS),
    buff: () => TINGED_YEARNING_TEAM,
    to: 1
    /* BuffTarget.Team */
  }]
});
var TINGED_YEARNING_TEAM = new Buff({
  name: "Flower of Tinged Yearning 5pc",
  stats: [[6, 10]],
  grants: [{ on: either(gainedUnison, unisonResponse), buff: () => TINGED_YEARNING_UNISON }]
});
var TINGED_YEARNING_UNISON = new Buff({
  name: "Flower of Tinged Yearning 5pc (unison)",
  stats: [[6, 15]]
});

// dist/src/resonators/aero/qingxiao.js
function qxAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA16 = qxAction("Basic - Stringblade 1", { node: 0, cast: 1, type: 4096, mv: 60.26, energy: 1.1, concerto: 2.18, offtune: 3464, forte1: 9.74 });
var BA26 = qxAction("Basic - Stringblade 2", { node: 0, cast: 1, type: 4096, mv: 74.18, energy: 1.34, concerto: 2.68, offtune: 4264, forte2: 7.12 });
var BA37 = qxAction("Basic - Stringblade 3", { node: 0, cast: 1, type: 4096, mv: 97.44, energy: 1.76, concerto: 3.52, offtune: 5600, forte2: 9.36 });
var BA45 = qxAction("Basic - Stringblade 4", { node: 0, cast: 1, type: 4096, mv: 108.45, energy: 1.96, concerto: 3.92, offtune: 6234, forte1: 17.54 });
var MA14 = qxAction("Mid-air - Stringblade 1", { node: 0, cast: 1, type: 4096, mv: 90.48, energy: 1.63, concerto: 3.25, offtune: 5200, forte2: 8.71 });
var MA24 = qxAction("Mid-air - Stringblade 2", { node: 0, cast: 1, type: 4096, mv: 89.79, energy: 1.63, concerto: 3.24, offtune: 5160, forte2: 8.63 });
var MA33 = qxAction("Mid-air - Stringblade 3", { node: 0, cast: 1, type: 4096, mv: 139.21, energy: 2.5, concerto: 5, offtune: 8e3, forte2: 13.37 });
var Plunge4 = qxAction("Basic - Plunging Attack", { node: 0, cast: 1, type: 4096, mv: 86.29, energy: 1.55, concerto: 3.1, offtune: 4960 });
var DC6 = qxAction("Dodge Counter - Stringblade", { node: 0, cast: 0, type: 4096, mv: 180.92, energy: 3.28, concerto: 16.52, offtune: 10400, forte2: 26.04 });
var HA5 = qxAction("Heavy - Stringblade", {
  node: 0,
  cast: 2,
  type: 8192,
  mv: 438.41,
  energy: 5.31,
  concerto: 10.53,
  offtune: 16800,
  forte1: -100,
  forte2: -100
});
var Skill5 = qxAction("Skill - Severing Note: Judgement", { node: 1, cast: 3, type: 12288, mv: 139.18, energy: 2.51, concerto: 5, offtune: 8e3, forte1: 45 });
var Ascendant = qxAction("Skill - Severing Note: Ascendant", { node: 1, cast: 3, type: 12288, mv: 94.66, energy: 1.71, concerto: 3.4, offtune: 5440, forte2: 9.09 });
var FBA12 = qxAction("Basic - Ephemeral Transcendence 1", {
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
var FBA22 = qxAction("Basic - Ephemeral Transcendence 2", {
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
var FBA32 = qxAction("Basic - Ephemeral Transcendence 3", {
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
var FBA42 = qxAction("Basic - Ephemeral Transcendence 4", {
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
var FDC2 = qxAction("Dodge Counter - Ephemeral Transcendence", {
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
var FHA4 = qxAction("Forte Heavy - Heaven's Reckoning", {
  node: 2,
  cast: 2,
  type: 8192,
  mv: 695.9,
  energy: 23,
  concerto: 25,
  offtune: 8e3,
  forte1: -100,
  updateBuffs: () => revokeCurrent(HEAVENS_CLARITY)
});
var Liberation6 = qxAction("Liberation - Billows Beneath Heaven", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 1670.11,
  concerto: 20,
  offtune: 8e3,
  resetEnergy: true,
  updateBuffs: () => applyCurrent(HEAVENS_CLARITY, 1)
});
var Intro6 = qxAction("Intro - Tonality Shift", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 132.63,
  energy: 10,
  concerto: 10,
  offtune: 7626,
  forte2: 30,
  updateBuffs: () => applyCurrent(RESONANT_CHIME, 1)
});
var JuquePerdition = qxAction("Basic - Juque Perdition (S1)", {
  node: 0,
  type: 4096,
  mv: 400,
  applyStats: () => addStat(20, 4 * stacksOf(EXORCISING_SEAL)),
  convertStats: () => revokeCurrent(EXORCISING_SEAL)
});
var Outro6 = qxAction("Outro - Lingering Song", { cast: 6, type: 24576, mv: 800, concerto: -100, swapOut: true });
var MINDLOCK = new Debuff({
  name: "Qingxiao: Mindlock",
  maxStacks: 15,
  applyStats: () => {
    if (!mindlockPays())
      return;
    const n = stacksOfEnemy(MINDLOCK);
    addStat(18, 2 * n + 5 * Math.min(n, 7));
  }
});
var MINDLOCK_PAYS = /* @__PURE__ */ new Set([HA5, FBA12, FBA22, FBA32, FBA42, FDC2, FHA4, Liberation6]);
var mindlockPays = () => MINDLOCK_PAYS.has(currentAction()) || runningAction(JuquePerdition) && isHeld(QX_S6);
var GATHERED_MIND = new Buff({
  name: "Qingxiao: Gathered Mind",
  maxStacks: 15,
  updateDebuffs: () => {
    if (!runningAction(TUNE_BREAK) || stacksOfEnemy(TUNE_STRAIN_SHIFTING) <= 0)
      return;
    applyEnemy(TUNE_STRAIN_INTERFERED, currentTeam().slots.find((m) => m.resonator === QINGXIAO_RESONATOR)?.isHeld(QX_S3) ? 2 : 1);
    revokeTeam(GATHERED_MIND);
  }
});
var RESONANT_CHIME = new Buff({
  name: "Qingxiao: Resonant Chime",
  applyStats: () => {
    if (runningAction(Skill5))
      addStat(30, 30);
  },
  convertStats: () => {
    if (runningAction(Skill5))
      revokeCurrent(RESONANT_CHIME);
  }
});
var CLARITY_FORTE = /* @__PURE__ */ new Set([BA16, BA26, BA37, BA45, MA14, MA24, MA33, DC6, Ascendant]);
var HEAVENS_CLARITY = new Buff({
  name: "Qingxiao: Heaven's Clarity",
  updateDebuffs: () => {
    if (runningAction(HA5))
      applyEnemy(MINDLOCK, 3);
  },
  updateBuffs: () => {
    if (runningAction(HA5))
      applyCurrent(RECKONING_ENHANCED, 1);
  },
  applyStats: () => {
    const a = currentAction();
    if (CLARITY_FORTE.has(a)) {
      if (a.forte1 > 0)
        addStat(30, a.forte1);
      if (a.forte2 > 0)
        addStat(31, a.forte2);
    }
  }
});
var RECKONING_ENHANCED = new Buff({
  name: "Qingxiao: Heaven's Reckoning Enhancement",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => {
    if (runningAction(FHA4)) {
      addStat(16, 100);
      addStat(28, 152e3);
    }
  },
  convertStats: () => {
    if (runningAction(FHA4))
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
    const interfered = applied2(TUNE_STRAIN_INTERFERED);
    if (interfered)
      applyEnemy(MINDLOCK, interfered);
  },
  applyStats: () => {
    if (!mindlockPays())
      return;
    const n = stacksOfEnemy(MINDLOCK);
    addStat(17, 2 * n + 5 * Math.min(n, 7));
  }
});
var QINGXIAO_TALENTS = new Talent({
  name: "Qingxiao: Talents",
  stats: [[6, 12], [10, 16]]
});
var QINGXIAO_RESONATOR = new Resonator({
  name: "Qingxiao",
  talent: QINGXIAO_TALENTS,
  inherent1: QX_INHERENT_1,
  inherent2: QX_INHERENT_2,
  element: 64,
  weapon: 0,
  intro: () => Intro6,
  outro: () => Outro6,
  color: "#6cc5b0",
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 100,
  // Draw and Sunder: "while Qingxiao is in the team"; Heaven's Clarity and Formless Heart Sword
  // are up from the first action
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1);
    applyCurrent(TUNE_STRAIN_RESPONDER, 1);
    applyCurrent(HEAVENS_CLARITY, 1);
  },
  // every damaging cast of hers lays Tune Strain - Shifting (the echo is its own cast, not hers)
  updateDebuffs: () => {
    const a = currentAction();
    if (a.mv > 0 && a.cast !== null && a.cast !== 7)
      applyStrain();
  },
  // The Forte Circuit's own Mindlock line: +1 for every Tune Strain - Interfered the team inflicts.
  // To Know, To Banish adds its own on top (QX_INHERENT_2) and Heaven's Clarity its three, each
  // from the piece that grants them.
  updateGlobal: () => {
    const interfered = applied2(TUNE_STRAIN_INTERFERED);
    if (interfered)
      applyEnemy(MINDLOCK, interfered);
  },
  constantStats: () => {
    addStat(1, 10300);
    addStat(0, 462.5);
    addStat(2, 1112.22);
    addStat(12, 10);
  }
});
var EXORCISING_SEAL = new Buff({ name: "Qingxiao S1: Exorcising Seal", maxStacks: 25 });
var SEAL_SPENDERS = /* @__PURE__ */ new Set([BA16, BA26, BA37, BA45, MA14, MA24, MA33, FBA12, FBA22, FBA32, FBA42]);
var QX_S1 = new Sequence({
  name: "Qingxiao S1: Like Clouds That Meet and Drift Apart",
  stats: [[9, 16]],
  combatStart: () => applyCurrent(EXORCISING_SEAL, 25),
  updateBuffs: () => {
    if (SEAL_SPENDERS.has(currentAction()) && stacksOf(EXORCISING_SEAL) > 0)
      queue(JuquePerdition);
  }
});
var QX_S2 = new Sequence({
  name: "Qingxiao S2: Like Petals That Fall Without a Sound",
  combatStart: () => maxStackIncrease(MINDLOCK, 10),
  updateDebuffs: () => {
    if (runningAction(HA5) && isHeld(HEAVENS_CLARITY))
      applyEnemy(MINDLOCK, 3);
  },
  applyStats: () => {
    if (runningAction(HA5))
      addStat(16, 40);
  }
});
var WORLD_IN_CHORUS = new Buff({
  name: "Qingxiao S3: World in Chorus",
  maxStacks: 25,
  applyStats: () => {
    if (runningAction(FHA4))
      addStat(16, 3 * frozenStacks());
  },
  convertStats: () => {
    if (runningAction(FHA4))
      revokeCurrent(WORLD_IN_CHORUS);
  }
});
var QX_S3 = new Sequence({
  name: "Qingxiao S3: Dreams Fade, Sword Abides",
  applyStats: () => {
    if (runningAction(Liberation6))
      addStat(10, 100);
  },
  updateBuffs: () => {
    if (runningAction(HA5))
      applyCurrent(WORLD_IN_CHORUS, stacksOfEnemy(MINDLOCK));
  }
});
var SIDE_BY_SIDE = new Buff({
  name: "Qingxiao S4: Wherever the Road Leads, Side by Side",
  stats: [[6, 20]],
  until: 2
});
var QX_S4 = new Sequence({
  name: "Qingxiao S4: Wherever the Road Leads, Side by Side",
  // from updateGlobal "me" is the holder, so the acting slot has to be named (status.ts)
  updateGlobal: () => {
    const acting = currentTeam().slot;
    if (acting.resonator && appliedByMember(TUNE_STRAIN_SHIFTING, acting))
      addBuff(acting.resonator, SIDE_BY_SIDE, 1);
  }
});
var QX_S5 = new Sequence({
  name: "Qingxiao S5: Cold Steel That Longs to Warm the Snow",
  applyStats: () => {
    if (runningAction(Skill5))
      addStat(16, 100);
  }
});
var QX_S6 = new Sequence({
  name: "Qingxiao S6: Cleanse This Tarnished Age, Till All Runs Clear",
  updateBuffs: () => {
    if (runningAction(HA5))
      applyCurrent(EXORCISING_SEAL, stacksOfEnemy(MINDLOCK));
  },
  applyStats: () => {
    if (runningAction(HA5) || runningAction(FHA4) || runningAction(Liberation6) || runningAction(JuquePerdition))
      addStat(20, 40);
  },
  lateConvertStats: () => addStat(19, 0.2 * 0.12 * getStat(
    12
    /* Stat.Tbb */
  ) * stacksOfEnemy(TUNE_STRAIN_INTERFERED))
});
var QX_SEQUENCES = [QX_S1, QX_S2, QX_S3, QX_S4, QX_S5, QX_S6];
var FBA1234 = new ActionGroup("Forte - Ephemeral Transcendence 1234", [FBA12, FBA22, FBA32, FBA42]);
var MA1232 = new ActionGroup("Mid-air - Stringblade 123", [MA14, MA24, MA33]);
var BA342 = new ActionGroup("Basic - Stringblade 34", [BA37, BA45]);
var QX_ROTATION = new Rotation([
  START_3,
  Liberation6,
  SWAP,
  INTRO,
  MA1232,
  BA342,
  Skill5,
  HA5,
  FBA1234,
  FHA4,
  Liberation6,
  ECHO_SWAP,
  OUTRO
]);
var QINGXIAO = new Loadout({
  resonator: QINGXIAO_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Liberation, Substat.Er),
  rotation: QX_ROTATION,
  sequences: QX_SEQUENCES
});

// dist/src/resonators/aero/qiuyuan.js
function qiuyuanAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA17 = qiuyuanAction("Basic - Inkwash 1", { node: 0, cast: 1, type: 4096, mv: 41.76, energy: 0.75, concerto: 2.4, offtune: 2400 });
var BA27 = qiuyuanAction("Basic - Inkwash 2", { node: 0, cast: 1, type: 4096, mv: 69.6, energy: 1.26, concerto: 4, offtune: 4e3 });
var BA38 = qiuyuanAction("Basic - Inkwash 3", { node: 0, cast: 1, type: 4096, mv: 164.25, energy: 2.98, concerto: 9.46, offtune: 9440, forte1: 100 });
var HA6 = qiuyuanAction("Heavy - Inkwash", { node: 0, cast: 2, type: 8192, mv: 165.61, energy: 2.09, concerto: 6.67, offtune: 6664 });
var EBA1 = qiuyuanAction("Basic - Thus Spoke the Blade: Inkwash 1", { node: 0, cast: 1, type: 8192, mv: 119.3, energy: 1.5, concerto: 4.8, offtune: 4800, forte1: 100 });
var EBA2 = qiuyuanAction("Basic - Thus Spoke the Blade: Inkwash 2", { node: 0, cast: 1, type: 8192, mv: 185.5, energy: 2.34, concerto: 7.47, offtune: 7464, forte1: 100 });
var EBA3 = qiuyuanAction("Basic - Thus Spoke the Blade: Inkwash 3", { node: 0, cast: 1, type: 8192, mv: 145.77, energy: 3.69, concerto: 7.07, offtune: 5862, forte1: 100 });
var EBA4 = qiuyuanAction("Basic - Thus Spoke the Blade: Inkwash 4", { node: 0, cast: 1, type: 8192, mv: 172.37, energy: 4.34, concerto: 8.33, offtune: 6936, forte1: 100 });
var Skill6 = qiuyuanAction("Skill - Through the Groves", { node: 1, cast: 3, type: 28672, mv: 215.52, energy: 15.09, concerto: 10, offtune: 8673 });
var Liberation7 = qiuyuanAction("Liberation - Sundering Strike", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 28672,
  mv: 795.24,
  concerto: 20,
  offtune: 96e3,
  resetEnergy: true,
  updateBuffs: () => applyTeam(SUNDERING_STRIKE_CD, 1)
});
var Intro7 = qiuyuanAction("Intro - Attack the Must-Defend", {
  node: 4,
  cast: 5,
  type: 8192,
  mv: 238.62,
  energy: 10,
  concerto: 10,
  offtune: 9600,
  forte1: 400
});
var Outro7 = qiuyuanAction("Outro - Strike Before Ready", {
  cast: 6,
  type: 28672,
  mv: 100,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(QIUYUAN_OUTRO)
});
var StrawCape = qiuyuanAction("Skill - Straw Cape in Drizzly Rain (S3)", {
  node: 1,
  cast: 3,
  type: 28672,
  mv: 500,
  energy: 15.38,
  concerto: -60,
  offtune: 4273,
  forte1: 400,
  updateBuffs: () => {
    revokeCurrent(QUIETUDE_WITHIN);
    applyCurrent(STRAW_CAPE, 1);
  }
});
var OutroS3 = qiuyuanAction("Outro - Sheath Fallen, New Shoots Revealed (S3)", {
  cast: 6,
  type: 28672,
  mv: 500,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => {
    queueOutro(QIUYUAN_OUTRO);
    revokeCurrent(STRAW_CAPE);
  }
});
var InksplashExit = qiuyuanAction("Forte - Inksplash of Mind (S6)", { node: 2, type: 28672, mv: 600 });
var FHA1 = qiuyuanAction("Forte Heavy - Thus Spoke the Blade: To Teach", { node: 2, cast: 2, cast2: 7, type: 8192, mv: 457.2, energy: 7.7, concerto: 14.75, offtune: 12265, forte1: -200 });
var FHA22 = qiuyuanAction("Forte Heavy - Thus Spoke the Blade: To Save", { node: 2, cast: 2, cast2: 7, type: 8192, mv: 209.67, energy: 3.54, concerto: 6.78, offtune: 5625, forte1: -200 });
var FHA32 = qiuyuanAction("Forte Heavy - Thus Spoke the Blade: To Sacrifice", { node: 2, cast: 2, cast2: 7, type: 8192, mv: 217.7, energy: 3.65, concerto: 7.01, offtune: 5840, forte1: -200 });
var FLOWING_PANACEA = new Buff({
  name: "Qiuyuan: Flowing Panacea",
  stats: [[6, 10]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(FLOWING_PANACEA);
  }
});
var BAMBOO_SHADE = new Buff({
  name: "Qiuyuan: Bamboo's Shade",
  applyStats: () => {
    addStat(
      17,
      30,
      28672
      /* Type1.Echo */
    );
    if (currentTeam().slots.find((m) => m.resonator === QIUYUAN_RESONATOR)?.isHeld(QY_S2)) {
      asSource(QY_S2, () => addStat(
        18,
        30,
        28672
        /* Type1.Echo */
      ));
    }
  }
});
var QUIETUDE_WITHIN = new Buff({
  name: "Inherent: Quietude Within",
  maxStacks: 2,
  updateBuffs: () => {
    lostOnSwap();
  },
  applyStats: () => {
    if (runningAction(FHA1) || runningAction(FHA22) || runningAction(FHA32))
      addStat(19, 50);
    if (runningAction(FHA32))
      addStat(27, 30);
  },
  convertStats: () => {
    if (runningAction(FHA1) && frozenStacks() >= 2)
      revokeCurrent(QUIETUDE_WITHIN);
  }
});
var SUNDERING_STRIKE_CD = new Buff({
  name: "Qiuyuan: Sundering Strike",
  applyStats: () => {
    if (isActive())
      addStat(10, 30);
  }
});
var QIUYUAN_OUTRO = new Buff({
  name: "Qiuyuan: Outro",
  stats: [[
    18,
    50,
    28672
    /* Type1.Echo */
  ]],
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
    if (forte1() < 600 && soliloquy >= 600 && !isHeld(STRAW_CAPE))
      applyCurrent(QUIETUDE_WITHIN, 1);
  }
});
var QIUYUAN_TALENTS = new Talent({
  name: "Qiuyuan: Talents",
  stats: [[9, 8], [6, 12]]
});
var QIUYUAN_RESONATOR = new Resonator({
  name: "Qiuyuan",
  talent: QIUYUAN_TALENTS,
  inherent1: QY_INHERENT_1,
  inherent2: QY_INHERENT_2,
  element: 64,
  weapon: 0,
  intro: () => Intro7,
  outro: () => isHeld(STRAW_CAPE) ? OutroS3 : Outro7,
  color: "#4fae6b",
  maxEnergy: 125,
  maxForte1: 600,
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
var QY_S1 = new Sequence({ name: "Qiuyuan S1: Sword Sheathed, Mind Unclouded", stats: [[9, 20]] });
var QY_S2 = new Sequence({ name: "Qiuyuan S2: O Blade, I, Who Teach No More" });
var STRAW_CAPE = new Buff({
  name: "Qiuyuan S3: Straw Cape in Drizzly Rain",
  applyStats: () => {
    if (runningAction(FHA1) || runningAction(FHA22) || runningAction(FHA32)) {
      addStat(15, 600);
      addStat(27, 30);
    }
  }
});
var QY_S3 = new Sequence({
  name: "Qiuyuan S3: O Blade, I, Who Save No More",
  applyStats: () => {
    if (runningAction(Liberation7))
      addStat(15, 500);
  }
});
var QY_S4 = new Sequence({ name: "Qiuyuan S4: O Blade, I, Who Sacrifice No More", stats: [[6, 20]] });
var QY_S5 = new Sequence({ name: "Qiuyuan S5: O Blade, I, Who Await to be Wielded", stats: [[22, 15]] });
var THUS_I_SPOKE = new Buff({
  name: "Qiuyuan S6: Thus I Heard, Thus I Saw, Thus I Spoke",
  stats: [[10, 100]],
  until: 1
});
var QY_S6 = new Sequence({
  name: "Qiuyuan S6: Thus I Heard, Thus I Saw, Thus I Spoke",
  updateBuffs: () => {
    if (runningAction(FHA32) && isActive())
      queue(InksplashExit);
    if (runningAction(StrawCape))
      applyCurrent(THUS_I_SPOKE, 1);
  }
});
var QY_SEQUENCES = [QY_S1, QY_S2, QY_S3, QY_S4, QY_S5, QY_S6];
var FHA123 = new ActionGroup("Forte - Thus Spoke the Blade: Heavy 123", [FHA1, FHA22, FHA32]);
var EBA12 = new ActionGroup("Basic - Thus Spoke the Blade: Inkwash 12", [EBA1, EBA2]);
var EBA34 = new ActionGroup("Basic - Thus Spoke the Blade: Inkwash 34", [EBA3, EBA4]);
var QY_ROTATION = new Rotation([
  NOINTRO,
  HA6,
  EBA4,
  HA6,
  EBA4,
  ECHO_CANCEL,
  Liberation7,
  EBA12,
  DODGE,
  EBA12,
  FHA123,
  OUTRO,
  INTRO_2,
  EBA34,
  ECHO_CANCEL,
  Liberation7,
  Skill6,
  FHA123,
  OUTRO,
  START_3,
  Liberation7,
  SWAP,
  INTRO_3,
  EBA34,
  ECHO_CANCEL,
  Skill6,
  FHA123,
  Liberation7,
  OUTRO
]);
var QY_ROTATION_MDPS = new Rotation([
  START_3,
  Liberation7,
  SWAP,
  INTRO_2,
  EBA34,
  ECHO_CANCEL,
  Liberation7,
  Skill6,
  FHA123,
  HA6,
  EBA4,
  HA6,
  EBA4,
  EBA12,
  DODGE,
  EBA12,
  FHA123,
  OUTRO,
  INTRO_3,
  EBA34,
  ECHO_CANCEL,
  Skill6,
  FHA123,
  HA6,
  EBA4,
  HA6,
  EBA4,
  EBA12,
  DODGE,
  EBA12,
  FHA123,
  Liberation7,
  OUTRO
]);
var QY_ROTATION_MDPS_S3 = new Rotation([
  START_3,
  Liberation7,
  SWAP,
  INTRO_2,
  EBA34,
  ECHO_CANCEL,
  Liberation7,
  Skill6,
  FHA123,
  StrawCape,
  EBA34,
  FHA123,
  OUTRO,
  INTRO_3,
  EBA34,
  ECHO_CANCEL,
  Skill6,
  FHA123,
  StrawCape,
  EBA34,
  FHA123,
  Liberation7,
  OUTRO
]);
var QIUYUAN = new Loadout({
  resonator: QIUYUAN_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.Er, Substat.FlatAtk),
  rotation: QY_ROTATION,
  sequences: QY_SEQUENCES
});
var QIUYUAN_MDPS = new Loadout({
  resonator: QIUYUAN_RESONATOR,
  weapons: [EMERALD_SENTENCE, EMERALD_OF_GENESIS],
  echoLoadouts: [
    new EchoLoadout(FENRICO, LAW_OF_HARMONY_3PC, SIERRA_GALE_2PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    12,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.Er, Substat.FlatAtk),
  rotation: { 0: QY_ROTATION_MDPS, 3: QY_ROTATION_MDPS_S3 },
  sequences: QY_SEQUENCES
});

// dist/src/resonators/aero/rover_aero.js
function roverAction(id, def2) {
  return new Action(id, { element: 64, scaling: 0, ...def2 });
}
var BA18 = roverAction("Basic - Wind Cutter 1", { node: 0, cast: 1, type: 4096, mv: 35.31, energy: 0.76, concerto: 2.41, offtune: 2408 });
var BA28 = roverAction("Basic - Wind Cutter 2", { node: 0, cast: 1, type: 4096, mv: 86.1, energy: 1.84, concerto: 5.88, offtune: 5872 });
var BA39 = roverAction("Basic - Wind Cutter 3", { node: 0, cast: 1, type: 4096, mv: 104.8, energy: 2.24, concerto: 7.15, offtune: 7144, forte1: 10 });
var BA46 = roverAction("Basic - Wind Cutter 4", { node: 0, cast: 1, type: 4096, mv: 76.72, energy: 1.64, concerto: 5.24, offtune: 5232, forte1: 10 });
var HA7 = roverAction("Heavy - Wind Cutter", { node: 0, cast: 2, type: 8192, mv: 53.73, energy: 1.17, concerto: 3.69, offtune: 3666 });
var RazorWind = roverAction("Heavy - Razor Wind", { node: 0, cast: 2, type: 8192, mv: 80.83, energy: 1.73, concerto: 5.53, offtune: 5513 });
var MA5 = roverAction("Mid-air - Wind Cutter", { node: 0, cast: 1, type: 4096, mv: 140.76, energy: 0.52, concerto: 9.6, offtune: 9600 });
var DC7 = roverAction("Dodge Counter - Wind Cutter", { node: 0, cast: 0, type: 4096, mv: 175.18, energy: 3.74, concerto: 21.95, offtune: 11944, forte1: 10 });
var Skill7 = roverAction("Skill - Awakening Gale", { node: 1, cast: 3, type: 12288, mv: 166.1, energy: 5, concerto: 10, offtune: 7553 });
var SkyfallSeverance = roverAction("Skill - Skyfall Severance", {
  node: 1,
  cast: 3,
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
var UnboundFlow1 = roverAction("Forte Skill - Unbound Flow 1", { node: 2, cast: 3, type: 12288, mv: 171.5, energy: 10, concerto: 20, offtune: 29850, forte1: -60 });
var UnboundFlow2 = roverAction("Forte Skill - Unbound Flow 2", { node: 2, cast: 3, type: 12288, mv: 723.03, energy: 20, concerto: 20, offtune: 28288, forte1: -60 });
var Liberation8 = roverAction("Liberation - Omega Storm", { node: 3, cast: 4, cutscene: true, type: 16384, mv: 536.79, concerto: 20, offtune: 48e3, resetEnergy: true });
var Intro8 = roverAction("Intro - Relentless Squall", { node: 4, cast: 5, type: 20480, mv: 198.82, energy: 10, concerto: 10, offtune: 11465, forte1: 20 });
var Outro8 = roverAction("Outro - Storm's Echo", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => applyTeam(AEOLIAN_REALM, 1)
});
var SAND_IN_THE_STORM = new Buff({
  name: "Inherent: Sand in the Storm",
  stats: [[6, 20]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(SAND_IN_THE_STORM);
  }
});
var AR_INHERENT_1 = new Inherent({
  name: "Inherent: Sand in the Storm",
  updateBuffs: () => {
    if (runningAction(Intro8))
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
  stats: [[
    17,
    15,
    12288
    /* Type1.Skill */
  ]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(S4_SKILL_BONUS);
  }
});
var AR_S1 = new Sequence({ name: "Aero Rover S1: Storm Subsides in the Void" });
var AR_S2 = new Sequence({ name: "Aero Rover S2: Glimmers Fade into the Dark" });
var AR_S3 = new Sequence({
  name: "Aero Rover S3: Illusions Collapse in a Grip",
  stats: [[
    17,
    15,
    64
    /* Attribute.Aero */
  ]]
});
var AR_S4 = new Sequence({
  name: "Aero Rover S4: Boundaries Shatter in an Instant",
  updateBuffs: () => {
    if (runningAction(Cloudburst1) || runningAction(Cloudburst2))
      applyCurrent(S4_SKILL_BONUS, 1);
  }
});
var AR_S5 = new Sequence({
  name: "Aero Rover S5: Life and Death Intertwine",
  applyStats: () => {
    if (runningAction(Liberation8))
      addStat(16, 20);
  }
});
var AR_S6 = new Sequence({
  name: "Aero Rover S6: All Crumble in the Wind",
  applyStats: () => {
    if (runningAction(UnboundFlow1) || runningAction(UnboundFlow2))
      addStat(16, 30);
  }
});
var ROVER_AERO_TALENTS = new Talent({
  name: "Aero Rover: Talents",
  stats: [[6, 12], [24, 12]]
});
var ROVER_AERO_RESONATOR = new Resonator({
  name: "Aero Rover",
  talent: ROVER_AERO_TALENTS,
  inherent1: AR_INHERENT_1,
  inherent2: AR_INHERENT_2,
  element: 64,
  weapon: 0,
  intro: () => Intro8,
  outro: () => Outro8,
  color: "#6fd6b0",
  maxEnergy: 150,
  maxForte1: 120,
  tier: 2,
  updateDebuffs: () => {
    if (runningAction(Cloudburst1) || runningAction(Cloudburst2) || runningAction(UnboundFlow1) || runningAction(UnboundFlow2) || runningAction(Liberation8))
      applyCurrent(HEALS, 1);
  },
  // Bloodpact's Pledge names Unbound Flow outright, so that clause's team Aero Amplification is
  // triggered from here rather than from the weapon — see the weapon's own comment for why
  updateBuffs: () => {
    const rank = BLOODPACTS_PLEDGE.findIndex((w) => isHeld(w));
    if ((runningAction(UnboundFlow1) || runningAction(UnboundFlow2)) && rank >= 0)
      applyTeam(BLOODPACT_AERO_AMP[rank], 1);
  },
  constantStats: () => {
    addStat(1, 10775);
    addStat(0, 438);
    addStat(2, 1137);
  }
});
var AR_ROTATION = new Rotation([
  NOINTRO,
  Skill7,
  INTRO,
  SkyfallSeverance,
  Cloudburst1,
  Cloudburst2,
  MA5,
  BA46,
  ECHO_CANCEL,
  Liberation8,
  Skill7,
  Cloudburst1,
  Cloudburst2,
  MA5,
  BA46,
  UnboundFlow1,
  UnboundFlow2.swap(),
  OUTRO
]);
var ROVER_AERO = new Loadout({
  resonator: ROVER_AERO_RESONATOR,
  weapons: [BLOODPACTS_PLEDGE[4]],
  // the craftable at its real R5, the one rank they are ever run at
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
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Skill, Substat.Er, Substat.FlatAtk),
  rotation: AR_ROTATION,
  sequences: [AR_S1, AR_S2, AR_S3, AR_S4, AR_S5, AR_S6]
});

// dist/src/echoes/lahairoi.js
var ACTION_NAMELESS_EXPLORER = new Action("Echo - Nameless Explorer", {
  cast: 7,
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
  stats: [[
    17,
    12,
    64
    /* Attribute.Aero */
  ], [
    17,
    20,
    28672
    /* Type1.Echo */
  ]]
});
var SOUND_OF_TRUE_NAME_2PC = new Sonata2pc({ name: "Sound of True Name 2pc", stats: [[
  17,
  10,
  64
  /* Attribute.Aero */
]] });
var SOUND_OF_TRUE_NAME_BUFF = new Buff({
  name: "Sound of True Name 5pc",
  stats: [[
    9,
    20,
    28672
    /* Type1.Echo */
  ], [
    17,
    15,
    64
    /* Attribute.Aero */
  ]],
  until: 0
});
var SOUND_OF_TRUE_NAME_5PC = new Sonata({
  name: "Sound of True Name 5pc",
  sonata2pc: SOUND_OF_TRUE_NAME_2PC,
  grants: [{ on: onType(
    28672
    /* Type1.Echo */
  ), buff: SOUND_OF_TRUE_NAME_BUFF }]
});
var ACTION_HYVATIA = new Action("Echo - Hyvatia", {
  cast: 7,
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
  cast: 7,
  element: 192,
  scaling: 0,
  type: 28672,
  mv: 351
});
var REACTOR_HUSK = new Mainslot({
  name: "Reactor Husk",
  action: ACTION_REACTOR_HUSK,
  echoType: 1,
  stats: [[11, 10]]
});
var ACTION_SPACETREK = new Action("Echo - Spacetrek Explorer", {
  cast: 7,
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
  cast: 7,
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
  stats: [[
    17,
    12,
    256
    /* Attribute.Glacio */
  ], [
    17,
    12,
    16384
    /* Type1.Liberation */
  ]]
});
var ACTION_GLOMMOTH = new Action("Echo - Glommoth", {
  cast: 7,
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
var QUIET_SNOWFALL_2PC = new Sonata2pc({ name: "Wishes of Quiet Snowfall 2pc", stats: [[
  17,
  10,
  256
  /* Attribute.Glacio */
]] });
var QUIET_SNOWFALL_5PC = new Sonata({
  name: "Wishes of Quiet Snowfall 5pc",
  sonata2pc: QUIET_SNOWFALL_2PC,
  grants: [
    { on: () => appliedByMe(GLACIO_CHAFE) > 0 && !isHeld(SNOWFALL_CRIT), buff: () => QUIET_SNOWFALL_GLACIO },
    { on: () => appliedByMe(GLACIO_CHAFE) > 0 && !isHeld(SNOWFALL_CRIT), buff: () => SNOWFALL }
  ]
});
var QUIET_SNOWFALL_GLACIO = new Buff({
  name: "Wishes of Quiet Snowfall 5pc (chafe)",
  stats: [[
    17,
    10,
    256
    /* Attribute.Glacio */
  ]]
});
var SNOWFALL = new Buff({
  name: "Wishes of Quiet Snowfall 5pc: Snowfall",
  updateBuffs: () => {
    if (casting(
      6
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
  name: "Wishes of Quiet Snowfall 5pc (liberation)",
  stats: [[9, 25]]
});
var SNOWFALL_OUTRO = handoff("Wishes of Quiet Snowfall 5pc (outro)", () => addStat(
  17,
  25,
  256
  /* Attribute.Glacio */
));
var NEONLIGHT_LEAP_2PC = new Sonata2pc({ name: "Pact of Neonlight Leap 2pc", stats: [[
  17,
  10,
  320
  /* Attribute.Spectro */
]] });
var NEONLIGHT_LEAP_5PC = new Sonata({
  name: "Pact of Neonlight Leap 5pc",
  sonata2pc: NEONLIGHT_LEAP_2PC,
  grants: [{
    on: onCast(
      6
      /* Cast.Outro */
    ),
    buff: () => NEONLIGHT_LEAP_HANDOFF,
    to: 3
    /* BuffTarget.Next */
  }]
});
var NEONLIGHT_LEAP_HANDOFF = new Buff({
  name: "Pact of Neonlight Leap 5pc (outro)",
  until: 1,
  stats: [[6, 15]],
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
var STARRY_RADIANCE_2PC = new Sonata2pc({ name: "Halo of Starry Radiance 2pc", stats: [[24, 10]] });
var STARRY_RADIANCE_5PC = new Sonata({
  name: "Halo of Starry Radiance 5pc",
  sonata2pc: STARRY_RADIANCE_2PC,
  grants: [{
    on: onApplied(HEALS),
    buff: () => STARRY_RADIANCE_TEAM,
    to: 1
    /* BuffTarget.Team */
  }]
});
var STARRY_RADIANCE_TEAM = new Buff({
  name: "Halo of Starry Radiance 5pc",
  convertStats: () => {
    addStat(6, Math.min(25, 0.2 * getStat(
      13
      /* Stat.OfftuneBuildup */
    )));
  }
});
var CHROMATIC_FOAM_2PC = new Sonata2pc({ name: "Chromatic Foam 2pc", stats: [[
  17,
  10,
  192
  /* Attribute.Fusion */
]] });
var CHROMATIC_FOAM_5PC = new Sonata({
  name: "Chromatic Foam 5pc",
  sonata2pc: CHROMATIC_FOAM_2PC,
  grants: [{ on: onInflict(FUSION_BURST), buff: () => CHROMATIC_FOAM_BUFF }]
});
var CHROMATIC_FOAM_BUFF = new Buff({
  name: "Chromatic Foam 5pc",
  stats: [[
    17,
    10,
    192
    /* Attribute.Fusion */
  ]],
  grants: [{
    on: onCast(
      6
      /* Cast.Outro */
    ),
    buff: () => CHROMATIC_FOAM_HANDOFF,
    to: 3
    /* BuffTarget.Next */
  }]
});
var CHROMATIC_FOAM_HANDOFF = new Buff({
  name: "Chromatic Foam 5pc (outro)",
  stats: [[
    17,
    25,
    192
    /* Attribute.Fusion */
  ]],
  until: 2
});
var TRAILBLAZING_STAR_2PC = new Sonata2pc({ name: "Trailblazing Star 2pc", stats: [[
  17,
  10,
  192
  /* Attribute.Fusion */
]] });
var TRAILBLAZING_STAR_5PC = new Sonata({
  name: "Trailblazing Star 5pc",
  sonata2pc: TRAILBLAZING_STAR_2PC,
  grants: [{ on: onInflict(FUSION_BURST, TUNE_RUPTURE_SHIFTING), buff: () => TRAILBLAZING_STAR_BUFF }]
});
var TRAILBLAZING_STAR_BUFF = new Buff({
  name: "Trailblazing Star 5pc",
  stats: [[9, 20], [
    17,
    20,
    192
    /* Attribute.Fusion */
  ]],
  until: 0
});
var GILDED_REVELATION_2PC = new Sonata2pc({ name: "Rite of Gilded Revelation 2pc", stats: [[
  17,
  10,
  320
  /* Attribute.Spectro */
]] });
var GILDED_REVELATION_5PC = new Sonata({
  name: "Rite of Gilded Revelation 5pc",
  sonata2pc: GILDED_REVELATION_2PC,
  grants: [{ on: onType(
    4096
    /* Type1.Basic */
  ), buff: () => GILDED_REVELATION_STACKS }]
});
var GILDED_REVELATION_STACKS = new Buff({
  name: "Rite of Gilded Revelation 5pc",
  maxStacks: 3,
  stats: [[
    17,
    10,
    320
    /* Attribute.Spectro */
  ]],
  perStack: true,
  until: 0,
  applyStats: () => {
    if (frozenStacks() >= 3 && casting(
      4
      /* Cast.Liberation */
    ))
      addStat(
        17,
        40,
        4096
        /* Type1.Basic */
      );
  }
});
var ACTION_NEBULOUS_CANNON = new Action("Echo - Twin Nova: Nebulous Cannon", {
  cast: 7,
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
  stats: [[
    17,
    12,
    320
    /* Attribute.Spectro */
  ], [
    17,
    12,
    4096
    /* Type1.Basic */
  ]]
});
var ACTION_TRICKSTER = new Action("Echo - Trickster", {
  cast: 7,
  element: 192,
  scaling: 0,
  type: 28672,
  mv: 273.6,
  energy: 3.8,
  updateBuffs: () => queueOutro(TRICKSTER_HANDOFF)
});
var TRICKSTER_HANDOFF = new Buff({
  name: "Trickster: Outro",
  stats: [[
    17,
    12,
    192
    /* Attribute.Fusion */
  ]],
  until: 2
});
var TRICKSTER = new Mainslot({
  name: "Reminiscence: Denia",
  action: ACTION_TRICKSTER,
  echoType: 0
});
var ACTION_VOIDWING_MOTH = new Action("Echo - Voidwing Moth", {
  cast: 7,
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
var REEL_2PC = new Sonata2pc({ name: "Reel of Spliced Memories 2pc", stats: [[6, 10]] });
var REEL_5PC = new Sonata({
  name: "Reel of Spliced Memories 5pc",
  sonata2pc: REEL_2PC,
  grants: [{
    on: onInflict(TUNE_RUPTURE_SHIFTING, TUNE_STRAIN_SHIFTING),
    buff: () => REEL_TEAM,
    to: 1
    /* BuffTarget.Team */
  }]
});
var REEL_TEAM = new Buff({ name: "Reel of Spliced Memories 5pc", stats: [[12, 20]] });
var SHATTERED_DREAMS = new Buff({
  name: "Shadow of Shattered Dreams",
  stats: [[
    17,
    35,
    4096
    /* Type1.Basic */
  ], [
    17,
    35,
    8192
    /* Type1.Heavy */
  ]]
});
var SHATTERED_DREAMS_1PC = new Sonata1pc({
  name: "Shadow of Shattered Dreams 1pc",
  grants: [{ on: onInflict(TUNE_HACK_SHIFTING), buff: SHATTERED_DREAMS }]
});
var ACTION_ADAM_SMASHER_LUCY = new Action("Echo - Adam Smasher", {
  cast: 7,
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
  stats: [[9, 15]]
});
var ACTION_ADAM_SMASHER_REBECCA = new Action("Echo - Adam Smasher", {
  cast: 7,
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
  stats: [[9, 15]]
});
var ACTION_SIGILLUM = new Action("Echo - Sigillum", {
  cast: 7,
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
var RUNE_TRUST = { updateBuffs: () => gainRune(1) };
var RUNE_ANSWER = { updateBuffs: () => gainRune(2) };
var BA19 = sigrikaAction("Basic - One, Two, Three 1", { node: 0, cast: 1, type: 4096, mv: 52.97, energy: 0.84, concerto: 1.67, offtune: 2664 });
var BA29 = sigrikaAction("Basic - One, Two, Three 2", { node: 0, cast: 1, type: 4096, mv: 100.68, energy: 1.6, concerto: 3.18, offtune: 5064 });
var BA310 = sigrikaAction("Basic - One, Two, Three 3", { node: 0, cast: 1, type: 4096, mv: 111.36, energy: 1.76, concerto: 3.5, offtune: 5600 });
var BA47 = sigrikaAction("Basic - One, Two, Three 4", {
  node: 0,
  cast: 1,
  type: 4096,
  mv: 206.79,
  energy: 3.27,
  concerto: 6.51,
  offtune: 10400,
  updateBuffs: () => applyCurrent(DECIPHER, 1)
});
var MA6 = sigrikaAction("Mid-air - One, Two, Three", { node: 0, cast: 1, type: 4096, mv: 104.78, energy: 1.55, concerto: 3.1, offtune: 4960 });
var MDC2 = sigrikaAction("Dodge Counter - One, Two, Three (Mid-Air)", { node: 0, cast: 0, type: 4096, mv: 206.17, energy: 3.05, concerto: 16.1, offtune: 9920 });
var DC8 = sigrikaAction("Dodge Counter - One, Two, Three", { node: 0, cast: 0, type: 4096, mv: 219.7, energy: 3.26, concerto: 16.5, offtune: 10026 });
var HA8 = sigrikaAction("Heavy - One, Two, Three", { node: 0, cast: 2, type: 8192, mv: 116.28, offtune: 5848, concerto: 3.66, energy: 1.84 });
var EBA = sigrikaAction("Basic - Elucidated", { node: 0, cast: 1, type: 28672, mv: 307.79, offtune: 8259, energy: 2.6, concerto: 5.19, ...RUNE_TRUST });
var EDC = sigrikaAction("Dodge Counter - Decipher", { node: 0, cast: 0, type: 28672, mv: 307.79, offtune: 8259, energy: 2.6, concerto: 15.19, ...RUNE_TRUST });
var Skill8 = sigrikaAction("Skill - BOOMY BOOM!", { node: 1, cast: 3, type: 12288, mv: 143.15, offtune: 7200, energy: 2.25, concerto: 4.5 });
var ESkill2 = sigrikaAction("Skill - BIG BOOMY BOOM!", { node: 1, cast: 3, type: 28672, mv: 288.09, offtune: 7729, energy: 2.45, concerto: 4.86, ...RUNE_ANSWER });
var ESkill50 = sigrikaAction("Skill - Soliskin to the Aid", { node: 1, cast: 3, type: 28672, mv: 278.26, offtune: 7466, energy: 2.36, concerto: 4.68, ...RUNE_ANSWER });
var RunicOutburst = sigrikaAction("Forte - Runic Outburst", { node: 2, type: 28672, mv: 117.67 + 205.92 + 264.75, energy: 10, concerto: 7, offtune: 24800 });
var RunicChainWhip = sigrikaAction("Forte - Runic Chain Whip", { node: 2, type: 28672, mv: 397.58, energy: 10.01, concerto: 7.03, offtune: 24802 });
var RunicSoliskin = sigrikaAction("Forte - Runic Soliskin", { node: 2, type: 28672, mv: 397.54, energy: 10, concerto: 7, offtune: 24800 });
var FHA5 = sigrikaAction("Forte Heavy - Schemata of Runes", {
  node: 2,
  cast: 2,
  type: 28672,
  mv: 132.51,
  energy: 3.34,
  concerto: 0.5,
  offtune: 2664,
  forte1: -2,
  forte2: 50,
  updateBuffs: spendRunes
});
var FSkill = sigrikaAction("Forte Skill - Learn My True Name", {
  node: 2,
  cast: 3,
  type: 28672,
  mv: 1211.48,
  energy: 5.43,
  concerto: 30,
  offtune: 101336,
  forte2: -100
});
var Liberation9 = sigrikaAction("Liberation - Where Trust Leads Me!", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 28672,
  mv: 861.43,
  concerto: 20,
  offtune: 50400,
  resetEnergy: true,
  updateBuffs: () => applyCurrent(DIVERGENT)
});
var Intro9 = sigrikaAction("Intro - Solsworn Etymology", { node: 4, cast: 5, type: 20480, mv: 163.42, energy: 10, concerto: 10, offtune: 7736 });
var Outro9 = sigrikaAction("Outro - In This Very Moment", { cast: 6, type: 24576, mv: 795, concerto: -100, swapOut: true });
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
    if (isActive()) {
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
      7
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
    if (runningAction(Intro9))
      applyCurrent(CONVERGENT, 1);
  }
});
function gainsRune() {
  return runningAction(EBA) || runningAction(EDC) || runningAction(ESkill2) || runningAction(ESkill50);
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
var CONVERGENT = new Buff({ name: "Sigrika: Convergent" });
var DIVERGENT = new Buff({ name: "Sigrika: Divergent" });
var RUNES = new Buff({
  name: "Sigrika: Runes",
  maxStacks: 511,
  display: () => {
    let slots = "";
    for (let shift = 0; shift < 8; shift += 2)
      slots += "-TA"[frozenStacks() >> shift & 3];
    return `Sigrika: Runes [${slots}]`;
  }
});
function gainRune(kind) {
  if (!currentAction().mv)
    return;
  let extra = 0;
  if (forte2() < 100) {
    if (isHeld(CONVERGENT)) {
      extra = kind;
      revokeCurrent(CONVERGENT);
    } else if (isHeld(DIVERGENT)) {
      extra = 3 - kind;
      revokeCurrent(DIVERGENT);
    }
  }
  pushRune(kind);
  if (extra)
    pushRune(extra);
}
function pushRune(kind) {
  const cap = forte2() >= 50 ? 4 : 2;
  const word = stacksOf(RUNES);
  let runes = word & 255, n = 0;
  while (n < 4 && runes >> 2 * n & 3)
    n++;
  if (n >= cap) {
    runes >>= 2;
    n--;
  } else
    addStat(30, 1);
  setStacksSelf(RUNES, word & ~255 | runes | kind << 2 * n);
}
function spendRunes() {
  const word = stacksOf(RUNES), a = word & 3, b = word >> 2 & 3;
  setStacksSelf(RUNES, word & ~255 | (word & 255) >> 4);
  if (!a || !b)
    return;
  queue(a !== b ? RunicOutburst : a === 1 ? RunicChainWhip : RunicSoliskin);
}
var INNATE_GIFT = new Buff({
  name: "Sigrika: Innate Gift?",
  maxStacks: 4,
  applyStats: () => {
    if (runningAction(RunicChainWhip) || runningAction(RunicOutburst) || runningAction(RunicSoliskin) || runningAction(FSkill)) {
      const n = frozenStacks();
      addStat(
        18,
        30 * n,
        28672
        /* Type1.Echo */
      );
      if (isHeld(SR_S6)) {
        asSource(SR_S6, () => {
          addStat(18, Math.min(60, 15 * n));
          addStat(22, Math.min(30, 7.5 * n));
        });
      }
      if (runningAction(FSkill) && !isHeld(SR_S3))
        revokeCurrent(INNATE_GIFT);
    }
  },
  updateBuffs: () => {
    if (!isHeld(SR_S3))
      lostOnSwap();
  }
});
var SOLISKIN_VITALITY = new Buff({
  name: "Sigrika: Soliskin Vitality",
  maxStacks: 60,
  updateBuffs: () => {
    if (!runningAction(RunicOutburst) && !runningAction(RunicChainWhip) && !runningAction(RunicSoliskin))
      return;
    const held = frozenStacks();
    if (held >= 30 && (isHeld(SR_S3) || stacksOf(INNATE_GIFT) < 2))
      applyCurrent(INNATE_GIFT, 1);
  },
  applyStats: () => {
    if (!runningAction(RunicOutburst) && !runningAction(RunicChainWhip) && !runningAction(RunicSoliskin))
      return;
    const held = frozenStacks();
    if (held >= 30) {
      addStat(16, 50);
    } else if (held > 0)
      addStat(18, 15 * Math.floor(held / 10));
  },
  convertStats: () => {
    if (runningAction(RunicOutburst) || runningAction(RunicChainWhip) || runningAction(RunicSoliskin)) {
      removeStack(SOLISKIN_VITALITY, Math.min(frozenStacks(), 30));
    }
  }
});
var SIGRIKA_TALENTS = new Talent({
  name: "Sigrika: Talents",
  stats: [[9, 8], [6, 12]]
});
var SIGRIKA_RESONATOR = new Resonator({
  name: "Sigrika",
  talent: SIGRIKA_TALENTS,
  inherent1: SR_INHERENT_1,
  inherent2: SR_INHERENT_2,
  element: 64,
  weapon: 3,
  intro: () => Intro9,
  outro: () => Outro9,
  color: "#7ee0c9",
  maxEnergy: 125,
  maxForte1: 4,
  maxForte2: 100,
  // the Rune store, empty (its always-set bit alone; see RUNES)
  combatStart: () => applyCurrent(RUNES, 1 << 8),
  // Soliskin Vitality's own gain — any team member's Echo cast
  updateGlobal: () => {
    if (casting(
      7
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
var SR_S1 = new Sequence({
  name: "Sigrika S1: The Gleam Meant for Radiance",
  applyStats: () => {
    if (runningAction(EBA) || runningAction(EDC) || runningAction(ESkill2) || runningAction(ESkill50))
      addStat(16, 70);
  }
});
var SR_S2 = new Sequence({
  name: "Sigrika S2: The Bitterness Steeped in Hope",
  combatStart: () => applyCurrent(DIVERGENT, 1),
  applyStats: () => {
    if (runningAction(FSkill))
      addStat(16, 120);
  }
});
var SR_S3 = new Sequence({ name: "Sigrika S3: I Flee, Yet I Seek" });
var I_LOSE_YET_I_GAIN = new Buff({ name: "Sigrika S4: I Lose, Yet I Gain", stats: [[6, 20]] });
var SR_S4 = new Sequence({
  name: "Sigrika S4: I Lose, Yet I Gain",
  updateGlobal: () => {
    if (casting(
      7
      /* Cast.Echo */
    ))
      applyTeam(I_LOSE_YET_I_GAIN, 1);
  }
});
var SR_S5 = new Sequence({
  name: "Sigrika S5: Until Submerged by the Dark",
  applyStats: () => {
    if (runningAction(Liberation9))
      addStat(16, 30);
  }
});
var SR_S6 = new Sequence({ name: "Sigrika S6: True Names Resurfaced, Rising in Light", stats: [[20, 30]] });
var SR_SEQUENCES = [SR_S1, SR_S2, SR_S3, SR_S4, SR_S5, SR_S6];
var BA2342 = new ActionGroup("Basic - One, Two, Three 234", [BA29, BA310, BA47]);
var BA343 = new ActionGroup("Basic - One, Two, Three 34", [BA310, BA47]);
var SR_ROTATION = new Rotation([
  INTRO,
  ECHO_ONFIELD,
  BA2342,
  EBA,
  FHA5,
  Liberation9,
  BA2342,
  EBA,
  FHA5,
  FSkill,
  Skill8,
  BA343,
  EBA,
  OUTRO
]);
var SR_ROTATION_FAST = new Rotation([
  INTRO,
  ECHO_ONFIELD,
  BA2342,
  EBA,
  FHA5,
  Liberation9,
  BA2342,
  EBA,
  FHA5,
  FSkill,
  OUTRO
]);
var SIGRIKA = new Loadout({
  resonator: SIGRIKA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.Er, Substat.FlatAtk, Substat.AtkPct, Substat.FlatAtk),
  rotation: SR_ROTATION,
  sequences: SR_SEQUENCES
});
var SIGRIKA_FAST = new Loadout({
  resonator: SIGRIKA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.Er, Substat.FlatAtk, Substat.AtkPct, Substat.FlatAtk),
  rotation: SR_ROTATION_FAST,
  sequences: SR_SEQUENCES
});

// dist/src/weapons/rectifier.js
var RIME_DRAPED_SPROUTS = refinements((r, rank) => {
  const PANORAMA_OFFIELD = new Buff({
    name: `Rime-Draped Sprouts: Panorama (off field)${rank}`,
    stats: [[
      17,
      [52, 65, 78, 91, 104][r],
      4096
      /* Type1.Basic */
    ]],
    when: () => !isActive()
  });
  const PANORAMA_STACKS = new Buff({
    name: `Rime-Draped Sprouts: Panorama${rank}`,
    maxStacks: 3,
    stats: [[
      17,
      [12, 15, 18, 21, 24][r],
      4096
      /* Type1.Basic */
    ]],
    perStack: true,
    // on outro: 3+ stacks convert into the permanent off-field version, short of 3 they're just lost
    updateBuffs: () => {
      if (casting(
        6
        /* Cast.Outro */
      )) {
        if (frozenStacks() >= 3)
          applyCurrent(PANORAMA_OFFIELD, 1);
        revokeCurrent(PANORAMA_STACKS);
      }
    }
  });
  return new Weapon({
    weaponType: 4,
    name: `Rime-Draped Sprouts${rank}`,
    stats: [[0, 500], [10, 72], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onCast(
      3
      /* Cast.Skill */
    ), buff: PANORAMA_STACKS }]
  });
});
var STRINGMASTER = refinements((r, rank) => {
  const STRINGMASTER_STACKS = new Buff({
    name: `Stringmaster: Electric Amplification${rank}`,
    maxStacks: 2,
    until: 0,
    applyStats: () => {
      if (!isActive())
        addStat(6, [12, 15, 18, 21, 24][r]);
      addStat(6, [12, 15, 18, 21, 24][r] * frozenStacks());
    }
  });
  return new Weapon({
    weaponType: 4,
    name: `Stringmaster${rank}`,
    stats: [[0, 500], [9, 36], [17, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onType(
      12288
      /* Type1.Skill */
    ), buff: STRINGMASTER_STACKS }]
  });
});
var WHISPERS_OF_SIRENS = refinements((r, rank) => {
  const GENTLE_DREAM = new Buff({
    name: `Whispers of Sirens: Gentle Dream${rank}`,
    maxStacks: 3,
    until: 1,
    grants: [{ on: onCast(
      7
      /* Cast.Echo */
    ) }],
    applyStats: () => {
      const held = frozenStacks();
      if (held < 2)
        return;
      addStat(
        17,
        [40, 50, 60, 70, 80][r],
        4096
        /* Type1.Basic */
      );
      if (held >= 3)
        addStat(
          21,
          [12, 15, 18, 21, 24][r],
          384
          /* Attribute.Havoc */
        );
    }
  });
  return new Weapon({
    weaponType: 4,
    name: `Whispers of Sirens${rank}`,
    stats: [[0, 500], [10, 72], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: () => (casting(
      5
      /* Cast.Intro */
    ) || casting(
      1
      /* Cast.Basic */
    )) && !stacksOf(GENTLE_DREAM), buff: GENTLE_DREAM }]
  });
});
var LETHEAN_ELEGY = refinements((r, rank) => {
  const UNDERWORLD_REQUIEM = new Buff({
    name: `Lethean Elegy: Underworld Requiem${rank}`,
    stats: [
      [
        17,
        [32, 40, 48, 56, 64][r],
        12288
        /* Type1.Skill */
      ],
      [
        18,
        [32, 40, 48, 56, 64][r],
        28672
        /* Type1.Echo */
      ],
      [23, [8, 10, 12, 14, 16][r]]
    ]
  });
  return new Weapon({
    weaponType: 4,
    name: `Lethean Elegy${rank}`,
    stats: [[0, 587.5], [9, 24.3], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onType(
      28672
      /* Type1.Echo */
    ), buff: UNDERWORLD_REQUIEM }]
  });
});
var FREEZE_FRAME = refinements((r, rank) => {
  const FREEZE_FRAME_SELF = new Buff({
    name: `Freeze Frame: Light's Offering${rank}`,
    stats: [[
      17,
      [30, 37.5, 45, 52.5, 60][r],
      256
      /* Attribute.Glacio */
    ]],
    until: 0
  });
  const FREEZE_FRAME_TEAM = new Buff({
    name: `Freeze Frame: Light's Offering${rank}`,
    stats: [[6, [24, 30, 36, 42, 48][r]]]
  });
  return new Weapon({
    weaponType: 4,
    name: `Freeze Frame${rank}`,
    stats: [[0, 587.5], [9, 24.3], [6, [12, 15, 18, 21, 24][r]]],
    grants: [
      { on: onInflict(GLACIO_CHAFE), buff: FREEZE_FRAME_SELF },
      {
        on: onInflict(GLACIO_CHAFE),
        buff: FREEZE_FRAME_TEAM,
        to: 1
        /* BuffTarget.Team */
      }
    ]
  });
});
var SK_SIG = refinements((r, rank) => {
  const SK_SIG_TEAM = new Buff({
    name: `Stellar Symphony: Astral Evolvement${rank}`,
    stats: [[6, [14, 17.5, 21, 24.5, 28][r]]]
  });
  const SK_SIG_CONCERTO = new Buff({
    name: `Stellar Symphony: Astral Evolvement${rank}`,
    maxStacks: 2,
    applyStats: () => {
      if (frozenStacks() === 1 && casting(
        4
        /* Cast.Liberation */
      )) {
        applyCurrent(SK_SIG_CONCERTO, 1);
        addStat(27, [8, 10, 12, 14, 16][r]);
      } else if (frozenStacks() === 2 && casting(
        6
        /* Cast.Outro */
      ))
        removeStack(SK_SIG_CONCERTO, 2);
    },
    display: () => `Stellar Symphony: Astral Evolvement${rank}${frozenStacks() === 1 ? "" : " (cooldown)"}`
  });
  return new Weapon({
    weaponType: 4,
    name: `Stellar Symphony${rank}`,
    stats: [[0, 412.5], [11, 77.04], [7, [12, 15, 18, 21, 24][r]]],
    grants: [
      { on: onCast(
        4
        /* Cast.Liberation */
      ), buff: SK_SIG_CONCERTO },
      {
        on: both(onCast(
          3
          /* Cast.Skill */
        ), onApplied(HEALS)),
        buff: SK_SIG_TEAM,
        to: 1
        /* BuffTarget.Team */
      }
    ]
  });
});
var FORGED_DWARF_STAR = refinements((r, rank) => {
  const DISSOLUTION_TEAM = new Buff({
    name: `Forged Dwarf Star: Dissolution${rank}`,
    stats: [[6, [24, 30, 36, 42, 48][r]]]
  });
  const DISSOLUTION_LIB = new Buff({
    name: `Forged Dwarf Star: Dissolution${rank}`,
    stats: [[
      17,
      [36, 45, 54, 63, 72][r],
      16384
      /* Type1.Liberation */
    ]],
    // the team half reacts to *anyone's* cast, so it watches from updateGlobal (runs every action
    // for a locally-held buff) rather than update (the wielder's own turns only)
    updateGlobal: () => {
      if (applied2(FUSION_BURST) || applied2(TUNE_STRAIN_SHIFTING))
        applyTeam(DISSOLUTION_TEAM, 1);
    }
  });
  return new Weapon({
    weaponType: 4,
    name: `Forged Dwarf Star${rank}`,
    stats: [[0, 500], [9, 36], [6, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: onInflict(FUSION_BURST, TUNE_STRAIN_SHIFTING), buff: DISSOLUTION_LIB }]
  });
});
var FIRSTLIGHTS_HERALD = refinements((r, rank) => {
  const SPRING_WREATH_CONCERTO = new Buff({
    name: `Firstlight's Herald: Spring Wreath${rank}`,
    maxStacks: 2,
    applyStats: () => {
      if (frozenStacks() === 1 && casting(
        4
        /* Cast.Liberation */
      )) {
        applyCurrent(SPRING_WREATH_CONCERTO, 1);
        addStat(27, [8, 10, 12, 14, 16][r]);
      } else if (frozenStacks() === 2 && casting(
        6
        /* Cast.Outro */
      ))
        removeStack(SPRING_WREATH_CONCERTO, 2);
    },
    display: () => `Firstlight's Herald: Spring Wreath${rank}${frozenStacks() === 1 ? "" : " (cooldown)"}`
  });
  const SNOW_TAINT = new Buff({ name: `Firstlight's Herald: Snow Taint${rank}` });
  const RIPPLES = new Buff({ name: `Firstlight's Herald: Ripples${rank}` });
  const SPRING_WREATH_TEAM = new Buff({
    name: `Firstlight's Herald: Spring Wreath${rank}`,
    stats: [[6, [20, 25, 30, 35, 40][r]]]
  });
  return new Weapon({
    weaponType: 4,
    name: `Firstlight's Herald${rank}`,
    stats: [[0, 412.5], [11, 77.04], [7, [12, 15, 18, 21, 24][r]]],
    grants: [
      { on: onCast(
        4
        /* Cast.Liberation */
      ), buff: SPRING_WREATH_CONCERTO },
      { on: onInflict(GLACIO_CHAFE), buff: SNOW_TAINT },
      { on: onApplied(HEALS), buff: RIPPLES },
      {
        on: () => isHeld(SNOW_TAINT) && isHeld(RIPPLES),
        buff: SPRING_WREATH_TEAM,
        to: 1
        /* BuffTarget.Team */
      }
    ]
  });
});
var BLOOMING_JADEHAVEN = refinements((r, rank) => {
  const HUNDREDFOLD_ARTIFICE = new Buff({
    name: `Blooming Jadehaven: Hundredfold Artifice${rank}`,
    stats: [[
      18,
      [36, 45, 54, 63, 72][r],
      12288
      /* Type1.Skill */
    ]],
    applyStats: () => {
      if (currentAction().type1 === 12288)
        addStat(
          21,
          [10, 15, 20, 25, 30][r],
          128
          /* Attribute.Electro */
        );
      if (isActive())
        addStat(
          18,
          [30, 37.5, 45, 52.5, 60][r],
          1572864
          /* Type2.ElectroFlare */
        );
    }
  });
  return new Weapon({
    weaponType: 4,
    name: `Blooming Jadehaven${rank}`,
    stats: [[0, 587.5], [9, 24.3], [17, [12, 15, 18, 21, 24][r]]],
    grants: [{ on: either(onInflict(ELECTRO_FLARE), unisonResponse), buff: HUNDREDFOLD_ARTIFICE }]
  });
});

// dist/src/resonators/havoc/phrolova.js
function phroAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var BA110 = phroAction("Basic - Movement of Life and Death 1", { node: 0, cast: 1, type: 4096, mv: 106.9, offtune: 5376, energy: 1.68, concerto: 3.36 });
var BA210 = phroAction("Basic - Movement of Life and Death 2", { node: 0, cast: 1, type: 4096, mv: 95.43, offtune: 4800, energy: 1.5, concerto: 3 });
var BA311 = phroAction("Basic - Movement of Life and Death 3", { forte1: 1, node: 0, cast: 1, type: 4096, mv: 196.14, offtune: 9864, energy: 3.12, concerto: 6.18, updateBuffs: () => gainNote(1) });
var Skill9 = phroAction("Skill - Whispers in a Fleeting Dream", { forte1: 1, node: 1, cast: 3, type: 12288, mv: 211.94, offtune: 4264, energy: 13.34, concerto: 10, updateBuffs: () => gainNote(2) });
var FBA = phroAction("Forte Basic - Movement of Fate and Finality", { forte1: 1, node: 2, cast: 1, type: 12288, mv: 505.01, offtune: 10161, energy: 3.21, concerto: 10.02, updateBuffs: () => gainNote(1) });
var FSkill3 = phroAction("Forte Skill - Murmurs in a Haunting Dream", { forte1: 1, node: 2, cast: 3, type: 12288, mv: 464.07, offtune: 9338, energy: 2.95, concerto: 10, updateBuffs: () => gainNote(2) });
var ScarletCoda = phroAction("Forte Heavy - Scarlet Coda", {
  node: 0,
  cast: 2,
  cast2: 7,
  type: 12288,
  forte1: -6,
  mv: 660.16,
  offtune: 166144,
  energy: 6.93,
  concerto: 40
});
var Liberation10 = phroAction("Liberation - Waltz of Forsaken Depths", {
  node: 3,
  cast: 4,
  cutscene: true,
  concerto: 20,
  resetForte1: true,
  updateBuffs: () => {
    applyCurrent(MAESTRO, 1);
    setStacksSelf(NOTES, stacksOf(NOTES) & ~(15 << 12) | 10 << 12);
  }
});
var Intro10 = phroAction("Intro - Suite of Quietus", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 201.52,
  offtune: 10137,
  energy: 10,
  concerto: 10
});
var EIntro = phroAction("Intro - Suite of Immortality", {
  node: 4,
  cast: 5,
  type: 12288,
  mv: 596.43,
  offtune: 9600,
  energy: 10,
  concerto: 10,
  resetForte1: true,
  // the Waltz ends here, and everything it was playing through goes with it: the unplayed notes,
  // the chances left, the front note's play count — the store keeps only its always-set bit
  updateBuffs: () => {
    revokeCurrent(MAESTRO);
    setStacksSelf(NOTES, stacksOf(NOTES) & 1 << 16);
  }
});
var Outro10 = phroAction("Outro - Unfinished Piece", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(PHROLOVA_OUTRO)
});
function hecateAction(id, mv, def2 = {}) {
  return new Action(id, { element: 384, scaling: 0, type: 28672, mv, ...def2 });
}
var NOTE = { updateBuffs: () => applyCurrent(AFTERSOUND, 1) };
var EBA_STRINGS = hecateAction("Enhanced - Hecate Strings", 347.93, NOTE);
var EBA_WINDS = hecateAction("Enhanced - Hecate Winds", 330.53, NOTE);
var EBA_CADENZA = hecateAction("Enhanced - Hecate Cadenza", 347.93, NOTE);
var HBA1 = hecateAction("Basic - Hecate 1", 27.84);
var HBA2 = hecateAction("Basic - Hecate 2", 27.84, { updateBuffs: () => drawNote(false, true) });
var NOTE_ACTIONS = [EBA_STRINGS, EBA_WINDS, EBA_CADENZA];
var SWAP_NOTES = NOTE_ACTIONS.map((a) => a.swap());
var HECATE_ACTIONS = /* @__PURE__ */ new Set([...NOTE_ACTIONS, ...SWAP_NOTES, HBA1, HBA2]);
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
    if (runningAction(ScarletCoda)) {
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
  stats: [[6, 120]],
  // Any active Echo Skill cast (hers or a teammate's) spends a chance and plays a note.
  // updateGlobal() keeps the "current" pointers on her own slot, so drawNote() resolves against her.
  updateGlobal: () => {
    if (casting(
      7
      /* Cast.Echo */
    ) && isActive())
      drawNote(true);
  }
});
var ACCIDENTAL = new Buff({
  name: "Inherent: Accidental"
});
var PH_INHERENT_1 = new Inherent({
  name: "Inherent: Accidental",
  updateBuffs: () => {
    if (runningAction(Intro10) || runningAction(EIntro) || casting(
      7
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
  stats: [[
    18,
    20,
    384
    /* Attribute.Havoc */
  ], [
    18,
    25,
    8192
    /* Type1.Heavy */
  ]],
  // Also the two notes her Outro owes: this is adopted on the incoming resonator's own Intro, so
  // it is the thing that sees the Intro they play — and drawNote() puts them back on her slot.
  updateBuffs: () => {
    if (casting(
      5
      /* Cast.Intro */
    ) && currentTeam().memberOf(PHROLOVA_RESONATOR).stacksOf(MAESTRO)) {
      drawNote(false);
      drawNote(false);
    }
    lostOnSwap();
  }
});
var Apparition = phroAction("Hecate - Apparition of Beyond", { type: 28672, mv: 216.42 });
HECATE_ACTIONS.add(Apparition);
var PH_S1 = new Sequence({
  name: "Phrolova S1: A Key to Netherworld's Secrets",
  combatStart: () => applyCurrent(NOTES, 3 | 3 << 2),
  applyStats: () => {
    if (runningAction(FBA) || runningAction(FSkill3))
      addStat(16, 80);
  }
});
var PH_S2 = new Sequence({
  name: "Phrolova S2: A Rope Tied to a Life Beyond",
  updateBuffs: () => {
    if (runningAction(ScarletCoda))
      applyCurrent(AFTERSOUND, 14);
  },
  applyStats: () => {
    if (runningAction(ScarletCoda))
      addStat(16, 75);
  }
});
var PH_S3 = new Sequence({
  name: "Phrolova S3: A Dagger to Cut Clean Obsessions",
  stats: [[
    18,
    80,
    28672
    /* Type1.Echo */
  ]]
});
var PH_S4_TEAM = new Buff({
  name: "Phrolova S4: A Torch Illuminating the Path",
  stats: [[17, 20]]
});
var PH_S4 = new Sequence({
  name: "Phrolova S4: A Torch Illuminating the Path",
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Echo */
    ))
      applyTeam(PH_S4_TEAM, 1);
  }
});
var PH_S5 = new Sequence({ name: "Phrolova S5: A Forked Road in Fate's Heartland" });
var PH_S6 = new Sequence({
  name: "Phrolova S6: A Night to Depart From Eternal Rest",
  updateBuffs: () => {
    if (runningAction(FBA) || runningAction(FSkill3))
      queue(Apparition);
    if (runningAction(Apparition))
      applyCurrent(AFTERSOUND, 8);
  },
  applyStats: () => {
    if (runningAction(EBA_STRINGS) || runningAction(EBA_WINDS) || runningAction(EBA_CADENZA))
      addStat(16, 24);
    if (stacksOf(MAESTRO)) {
      if (isActive())
        addStat(
          17,
          60,
          384
          /* Attribute.Havoc */
        );
      else
        addStat(20, 40);
    }
  }
});
var PHROLOVA_TALENTS = new Talent({
  name: "Phrolova: Talents",
  stats: [[9, 8], [6, 12]]
});
var PHROLOVA_RESONATOR = new Resonator({
  name: "Phrolova",
  talent: PHROLOVA_TALENTS,
  inherent1: PH_INHERENT_1,
  inherent2: PH_INHERENT_2,
  element: 384,
  weapon: 4,
  color: "#a62c57",
  // Maestro still open means Suite of Immortality (EIntro) instead of plain Intro
  intro: () => stacksOf(MAESTRO) ? EIntro : Intro10,
  outro: () => Outro10,
  maxEnergy: 0,
  maxForte1: 6,
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
var BA1232 = new ActionGroup("Basic - Movement of Life and Death 123", [BA110, BA210, BA311]);
var BA123idash = new ActionGroup("Basic - Movement of Life and Death 123 (Cancelled)", [BA110, BA210, BA311.dodgeCancel()]);
var HBA12 = new ActionGroup("Basic - Hecate 12", [HBA1, HBA2]);
var BA232 = new ActionGroup("Basic - Movement of Life and Death 23", [BA210, BA311]);
var PH_LOOP = new Rotation([
  NOINTRO,
  BA210,
  INTRO,
  BA311,
  ECHO_ONFIELD,
  FBA,
  Skill9,
  FBA,
  DODGE,
  BA1232,
  DODGE,
  FBA,
  DODGE,
  ScarletCoda,
  Liberation10,
  HBA12,
  OUTRO
]);
var PH_LOOP_S2 = new Rotation([
  NOINTRO,
  BA232,
  ECHO_ONFIELD,
  FBA,
  Skill9,
  FBA,
  ScarletCoda,
  Liberation10,
  OUTRO,
  INTRO,
  BA311,
  ECHO_ONFIELD,
  FBA,
  Skill9,
  FBA,
  DODGE,
  BA123idash,
  FBA,
  DODGE,
  BA123idash,
  FBA,
  DODGE,
  ScarletCoda,
  Liberation10,
  OUTRO
]);
var PHROLOVA = new Loadout({
  resonator: PHROLOVA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Skill),
  rotation: { 0: PH_LOOP, 2: PH_LOOP_S2 },
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6]
});
var PH_LOOP_DUAL_DPS = new Rotation([
  NOINTRO,
  BA210,
  INTRO,
  BA311,
  ECHO_ONFIELD,
  FBA,
  Skill9,
  FBA,
  DODGE,
  BA1232,
  DODGE,
  FBA,
  ScarletCoda,
  Liberation10,
  OUTRO
]);
var PH_LOOP_DUAL_DPS_S2 = new Rotation([
  NOINTRO,
  BA232,
  ECHO_ONFIELD,
  FBA,
  Skill9,
  FBA,
  ScarletCoda,
  Liberation10,
  OUTRO,
  INTRO,
  BA311,
  ECHO_ONFIELD,
  FBA,
  Skill9,
  FBA,
  DODGE,
  BA1232,
  DODGE,
  FBA,
  ScarletCoda,
  Liberation10,
  OUTRO
]);
var PHROLOVA_DUAL_DPS = new Loadout({
  resonator: PHROLOVA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Skill),
  rotation: { 0: PH_LOOP_DUAL_DPS, 2: PH_LOOP_DUAL_DPS_S2 },
  sequences: [PH_S1, PH_S2, PH_S3, PH_S4, PH_S5, PH_S6]
});

// dist/src/resonators/electro/augusta.js
function augustaAction(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var BA111 = augustaAction("Basic - Hunter's Path 1", { node: 0, cast: 1, type: 4096, mv: 57.46, energy: 0.73, concerto: 1.45, offtune: 2312, forte1: 99, forte2: 74 });
var BA211 = augustaAction("Basic - Hunter's Path 2", { node: 0, cast: 1, type: 4096, mv: 134, energy: 1.7, concerto: 3.38, offtune: 5392, forte1: 230, forte2: 172 });
var BA312 = augustaAction("Basic - Hunter's Path 3", { node: 0, cast: 1, type: 4096, mv: 196.83, energy: 2.49, concerto: 4.95, offtune: 7920, forte1: 336, forte2: 252 });
var BA48 = augustaAction("Basic - Hunter's Path 4", { node: 0, cast: 1, type: 4096, mv: 193.89, energy: 2.46, concerto: 4.89, offtune: 7803, forte1: 333, forte2: 249 });
var MA7 = augustaAction("Mid-air - Hunter's Path", { node: 0, cast: 1, type: 4096, mv: 119.3, energy: 1.5, concerto: 2, offtune: 7200, forte1: 50, forte2: 154 });
var DC9 = augustaAction("Dodge Counter - Hunter's Path 2", { node: 0, cast: 0, type: 4096, mv: 134, energy: 1.7, concerto: 13.38, offtune: 5392, forte1: 230, forte2: 172 });
var MDC3 = augustaAction("Dodge Counter - Hunter's Path (Mid-Air)", { node: 0, cast: 0, type: 4096, mv: 119.3, energy: 1.5, concerto: 12, offtune: 7200, forte1: 50, forte2: 154 });
var HA9 = augustaAction("Heavy - Hunter's Path", { node: 0, cast: 2, type: 8192, mv: 139.17, energy: 1.77, concerto: 3.51, offtune: 5601, forte1: 342, forte2: 255 });
var FHA12 = augustaAction("Heavy - Thunderoar: Backstep", { node: 0, cast: 2, type: 8192, mv: 53.68, energy: 0.5, concerto: 1, offtune: 1600, forte1: -660, forte2: 50 });
var FHA23 = augustaAction("Heavy - Thunderoar: Spinslash", { node: 0, cast: 2, type: 8192, mv: 425.16, energy: 4.47, concerto: 8.91, offtune: 14256, forte2: 744 });
var FJump2 = augustaAction("Heavy - Thunderoar: Uppercut", { node: 0, cast: 2, type: 8192, mv: 357.86, energy: 3.76, concerto: 7.5, offtune: 12e3, forte1: -660, forte2: 382 });
var Skill10 = augustaAction("Skill - Warrior's Blade", { node: 1, cast: 3, type: 12288, mv: 656.1, energy: 9, concerto: 10, offtune: 4491, forte1: 660, forte2: 500 });
var FSkill12 = augustaAction("Forte Skill - Undying Sunlight: Strike", {
  node: 2,
  cast: 3,
  type: 12288,
  mv: 278.34,
  energy: 5,
  concerto: 7,
  offtune: 18200,
  forte2: -4e3
});
var FSkill22 = augustaAction("Forte Skill - Undying Sunlight: Leap", { node: 2, cast: 3, type: 12288, mv: 278.35, energy: 5, concerto: 7, offtune: 11200 });
var FSkill32 = augustaAction("Forte Skill - Undying Sunlight: Plunge", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 865.83,
  energy: 11,
  concerto: 7,
  offtune: 24e3,
  forte3: 1
});
var Lib1 = augustaAction("Liberation - Sword of Eternal Oath", { node: 3, cast: 4, cutscene: true, type: 8192, mv: 1099.48, energy: 4.74, concerto: 20, offtune: 29342, forte2: 2e3, resetEnergy: true });
var Lib22 = augustaAction("Liberation - Sublime is the Sun", {
  node: 3,
  cast: 4,
  cutscene: true,
  forte3: -2,
  updateBuffs: () => {
    queue(Lib2fua);
    queue(Lib3);
    applyTeam(RULERS_REALM, 1);
  }
});
var Lib2fua = augustaAction("Liberation - Sublime is the Sun: Sunborne x9", { node: 3, cast: 4, cutscene: true, type: 8192, mv: 1073.61, concerto: 18, offtune: 64800 });
var Lib3 = augustaAction("Liberation - Sublime is the Sun: Everbright Protector", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 8192,
  mv: 1192.93,
  concerto: 10,
  offtune: 50400,
  updateBuffs: () => {
    if (currentTeam().slots.some((s) => s.resonator === PHROLOVA_RESONATOR))
      revokeBuff(PHROLOVA_RESONATOR, MAESTRO);
  }
});
var ThunderRage = augustaAction("Heavy - Thunder Rage (S6)", { node: 2, type: 8192, mv: 200 });
var Intro11 = augustaAction("Intro - Stride of Goldenflare", { node: 4, cast: 5, type: 20480, mv: 198.82, energy: 10, concerto: 10, offtune: 9600, forte1: 660, forte2: 800 });
var Outro11 = augustaAction("Outro - Battlesong of the Unyielding", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(BATTLESONG)
});
var CROWN_OF_WILLS = new Buff({
  name: "Augusta: Crown of Wills",
  maxStacks: 4,
  stats: [[
    17,
    15,
    128
    /* Attribute.Electro */
  ]],
  perStack: true,
  applyStats: () => {
    const n = frozenStacks();
    if (isHeld(AG_S1))
      asSource(AG_S1, () => addStat(10, 15 * n));
    if (isHeld(AG_S2))
      asSource(AG_S2, () => addStat(9, 20 * n));
  },
  convertStats: () => {
    if (runningAction(Lib3))
      revokeCurrent(CROWN_OF_WILLS);
  }
});
function gainCrown(n) {
  const room = (isHeld(AG_S6) ? 4 : isHeld(AG_S1) ? 2 : 1) - stacksOf(CROWN_OF_WILLS);
  if (room > 0)
    applyCurrent(CROWN_OF_WILLS, Math.min(n, room));
}
var RULERS_REALM = new Buff({
  name: "Augusta: Ruler's Realm",
  updateDebuffs: () => {
    if (casting(
      5
      /* Cast.Intro */
    ) && !applied2(SHIELD))
      applyCurrent(SHIELD, 1);
  }
});
var BATTLESONG = new Buff({
  name: "Augusta: Outro",
  updateBuffs: () => {
    lostOnSwap();
  },
  stats: [[18, 15]]
});
var SHIELDS = new Map([
  [FSkill22, 2],
  [FSkill32, 2],
  [Lib1, 2],
  ...[BA111, BA211, BA312, BA48, MA7, DC9, MDC3, HA9, FHA12, FHA23, FJump2, Skill10, FSkill12, Lib22, Lib2fua, Lib3, Intro11].map((a) => [a, 1])
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
    addForte3(1);
    gainCrown(4);
  }
});
var AUGUSTA_TALENTS = new Talent({
  name: "Augusta: Talents",
  stats: [[9, 8], [6, 12]]
});
var AUGUSTA_RESONATOR = new Resonator({
  name: "Augusta",
  talent: AUGUSTA_TALENTS,
  inherent1: AG_INHERENT_1,
  inherent2: AG_INHERENT_2,
  element: 128,
  weapon: 1,
  intro: () => Intro11,
  outro: () => Outro11,
  color: "#e8734f",
  maxEnergy: 125,
  maxForte1: 660,
  maxForte2: 4e3,
  maxForte3: 2,
  // reacts to *any* team member's own Outro, not just her own — currentSlot is forced to her own
  // holder for this call, so the real actor's own held gear comes off currentTeam().slot instead
  updateGlobal: () => {
    if (casting(
      6
      /* Cast.Outro */
    ) && currentTeam().slot.isHeld(BATTLESONG)) {
      addForte3(1);
      gainCrown(1);
    }
  },
  constantStats: () => {
    addStat(1, 10300);
    addStat(0, 463);
    addStat(2, 1112);
  }
});
var AG_S1 = new Sequence({
  name: "Augusta S1: Stained in Scorched Earth",
  updateBuffs: () => {
    if (runningAction(Intro11))
      gainCrown(1);
  }
});
var AG_S2 = new Sequence({
  name: "Augusta S2: Cleansed in Crimson War",
  lateConvertStats: () => addStat(10, Math.min(100, Math.max(0, (getStat(
    9
    /* Stat.CritRate */
  ) - 100) * 2)))
});
var AG_S3_HITS = /* @__PURE__ */ new Set([FHA12, FHA23, FJump2, FSkill32, Lib2fua, Lib3]);
var AG_S3 = new Sequence({
  name: "Augusta S3: Forged in Rot and Ruin",
  applyStats: () => {
    if (AG_S3_HITS.has(currentAction()))
      addStat(16, 25);
  }
});
var STRIDE_OF_GOLDENFLARE = new Buff({ name: "Augusta S4: Ascent in Sun and Glory", stats: [[6, 20]] });
var AG_S4 = new Sequence({
  name: "Augusta S4: Ascent in Sun and Glory",
  updateBuffs: () => {
    if (runningAction(Intro11))
      applyTeam(STRIDE_OF_GOLDENFLARE, 1);
  }
});
var AG_S5 = new Sequence({ name: "Augusta S5: Unshaken in Wrathful Tides" });
var AG_S6 = new Sequence({
  name: "Augusta S6: Engraved in Radiant Light",
  updateBuffs: () => {
    if (!runningAction(FHA23) && !runningAction(FJump2))
      return;
    gainCrown(2);
    queue(ThunderRage);
  },
  lateConvertStats: () => addStat(10, Math.min(50, Math.max(0, (getStat(
    9
    /* Stat.CritRate */
  ) - 150) * 2)))
});
var AG_SEQUENCES = [AG_S1, AG_S2, AG_S3, AG_S4, AG_S5, AG_S6];
var AG_ROTATION = new Rotation([
  INTRO,
  FHA12,
  FHA23,
  Skill10,
  FHA12,
  FHA23,
  HA9,
  Lib1,
  HA9,
  FSkill12,
  FSkill22,
  FSkill32,
  Lib22,
  FJump2,
  OUTRO
]);
var AUGUSTA = new Loadout({
  resonator: AUGUSTA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Er),
  rotation: AG_ROTATION,
  sequences: AG_SEQUENCES
});

// dist/src/resonators/electro/buling.js
function bulingAction(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var MOUNTAIN = { updateBuffs: () => gainTrigram(1) };
var THUNDER = { updateBuffs: () => gainTrigram(2) };
var BA112 = bulingAction("Basic - Hexagram Calls, Lightning Falls 1", { node: 0, cast: 1, type: 4096, mv: 41.46, offtune: 3336, energy: 1.06, concerto: 3.34 });
var BA212 = bulingAction("Basic - Hexagram Calls, Lightning Falls 2", { node: 0, cast: 1, type: 4096, mv: 66.9, offtune: 5384, energy: 1.7, concerto: 5.4, ...MOUNTAIN });
var BA313 = bulingAction("Basic - Hexagram Calls, Lightning Falls 3", { node: 0, cast: 1, type: 4096, mv: 47.02, offtune: 3784, energy: 1.2, concerto: 3.8 });
var BA49 = bulingAction("Basic - Hexagram Calls, Lightning Falls 4", { node: 0, cast: 1, type: 4096, mv: 93.64, offtune: 7536, energy: 2.36, concerto: 7.54, ...THUNDER });
var MA8 = bulingAction("Mid-air - Hexagram Calls, Lightning Falls", { node: 0, cast: 1, type: 4096, mv: 73.96, offtune: 4960, energy: 1.24, concerto: 4.96, ...THUNDER });
var DC10 = bulingAction("Dodge Counter - Hexagram Calls, Lightning Falls 3", { node: 0, cast: 0, type: 4096, mv: 47.02, offtune: 3784, energy: 1.2, concerto: 13.8 });
var YANG = { updateBuffs: () => {
  spendTrigrams();
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
    spendTrigrams();
    applyCurrent(MINOR_YIN, 1);
    if (isHeld(MINOR_YANG)) {
      revokeCurrent(MINOR_YANG);
      revokeCurrent(MINOR_YIN);
      applyCurrent(YIN_YANG_BALANCE, 1);
    }
  }
};
var HA_MOUNTAIN_OVER_THUNDER = bulingAction("Heavy - Mountain Over Thunder", { node: 0, cast: 2, type: 8192, mv: 178.93, offtune: 8e3, energy: 3, concerto: 15, forte1: -2, ...YANG });
var HA_THUNDER_OVER_MOUNTAIN = bulingAction("Heavy - Thunder Over Mountain", { node: 0, cast: 2, type: 8192, mv: 89.47, offtune: 8e3, energy: 3, concerto: 15, forte1: -2, ...YANG });
var HA_TWIN_MOUNTAINS = bulingAction("Heavy - Twin Mountains", { node: 0, cast: 2, concerto: 15, forte1: -2, ...YIN });
var HA_TWIN_THUNDERS = bulingAction("Heavy - Twin Thunders", { node: 0, cast: 2, concerto: 15, forte1: -2, ...YIN });
var GhostGateOmen = bulingAction("Heavy - Ghost Gate Omen", {
  node: 0,
  cast: 2,
  resetForte1: true,
  updateBuffs: () => setStacksSelf(TRIGRAMS, 1 << 8)
});
var HA10 = new Action("Heavy - Trigram", {
  resolve: () => {
    const word = stacksOf(TRIGRAMS), a = word & 3, b = word >> 2 & 3;
    if (!a || !b)
      return GhostGateOmen;
    if (a === b)
      return a === 1 ? HA_TWIN_MOUNTAINS : HA_TWIN_THUNDERS;
    return a === 1 ? HA_MOUNTAIN_OVER_THUNDER : HA_THUNDER_OVER_MOUNTAIN;
  }
});
var Skill11 = bulingAction("Skill - In Shadow Thunder Stirs", { node: 1, cast: 3, type: 12288, mv: 116.8, offtune: 7832, energy: 15, concerto: 23, ...THUNDER });
var Harmony = bulingAction("Liberation - Flashing Thunder Spell - Harmony", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 536.79,
  offtune: 72e3,
  concerto: 20,
  resetEnergy: true,
  updateBuffs: () => {
    revokeTeam(THUNDER_SPELL);
    applyTeam(THUNDER_SPELL, 1);
    revokeCurrent(YIN_YANG_BALANCE);
    revokeTeam(FIVE_THUNDERS_ARRAY);
    applyTeam(FIVE_THUNDERS_ARRAY, 24);
  }
});
var FlashingThunderSpell = bulingAction("Liberation - Flashing Thunder Spell", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 357.86,
  offtune: 36e3,
  concerto: 20,
  resetEnergy: true
});
var Liberation11 = new Action("Liberation - Flashing Thunder Spell (either)", {
  resolve: () => isHeld(YIN_YANG_BALANCE) ? Harmony : FlashingThunderSpell
});
var FIVE_THUNDERS = new ActionField("Buling: Five Thunders Spell Array");
var ArrayTick = bulingAction("Liberation - Five Thunders Spell Array", {
  type: 16384,
  mv: 19.89,
  energy: 2.08,
  field: FIVE_THUNDERS,
  updateDebuffs: () => inflictElectroFlare(2)
});
var Intro12 = bulingAction("Intro - Summon and Smite", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 131.1,
  offtune: 8792,
  concerto: 10,
  updateDebuffs: () => inflictElectroFlare(4)
});
var Outro12 = bulingAction("Outro - Exorcism Spell", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => applyTeam(BULING_OUTRO, 1)
});
var THUNDER_SPELL_STAGE = ["Primordial Qi", "Yin and Yang", "Heaven, Earth, Mind"];
var THUNDER_SPELL = new Buff({
  name: "Buling: Thunder Spell",
  maxStacks: 3,
  display: () => `Buling: Thunder Spell - ${THUNDER_SPELL_STAGE[stacksOfTeam(THUNDER_SPELL) - 1]}`,
  // stands only while the Array does: gone on the first action after its last pull
  updateGlobal: () => {
    if (!stacksOfTeam(FIVE_THUNDERS_ARRAY)) {
      revokeTeam(THUNDER_SPELL);
      return;
    }
    if (casting(
      5
      /* Cast.Intro */
    ) && stacksOfTeam(THUNDER_SPELL) < 3)
      applyTeam(THUNDER_SPELL, 1);
  },
  applyStats: () => {
    if (!isActive())
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
var FIVE_THUNDERS_ARRAY = coordinatedBuff("Buling: Five Thunders Spell Array", 24, () => BULING_RESONATOR, ArrayTick, { every: 2 });
var MINOR_YANG = new Buff({ name: "Buling: Minor Yang" });
var MINOR_YIN = new Buff({ name: "Buling: Minor Yin" });
var YIN_YANG_BALANCE = new Buff({ name: "Buling: Yin-Yang Balance" });
var TRIGRAMS = new Buff({
  name: "Buling: Trigrams",
  maxStacks: 511,
  display: () => {
    let slots = "";
    for (let shift = 0; shift < 8; shift += 2)
      slots += "-MT"[frozenStacks() >> shift & 3];
    return `Buling: Trigrams [${slots}]`;
  }
});
function gainTrigram(kind) {
  if (!currentAction().mv)
    return;
  const word = stacksOf(TRIGRAMS);
  let trigrams = word & 255, n = 0;
  while (n < 4 && trigrams >> 2 * n & 3)
    n++;
  if (n === 4) {
    trigrams >>= 2;
    n = 3;
  } else
    addStat(30, 1);
  setStacksSelf(TRIGRAMS, word & ~255 | trigrams | kind << 2 * n);
}
function spendTrigrams() {
  const word = stacksOf(TRIGRAMS);
  setStacksSelf(TRIGRAMS, word & ~255 | (word & 255) >> 4);
}
var BULING_OUTRO = new Buff({
  name: "Buling: Outro",
  stats: [[18, 15]]
});
var BL_INHERENT_1 = new Inherent({ name: "Inherent: Time Arrives, Evil Declines" });
var BL_INHERENT_2 = new Inherent({ name: "Inherent: Earthly Immortal is Here!" });
var BL_S1 = new Sequence({
  name: "Buling S1",
  applyStats: () => {
    if (runningAction(Harmony))
      addStat(9, 20);
  }
});
var BL_S2 = new Sequence({
  name: "Buling S2",
  applyStats: () => {
    if (isHeld(YIN_YANG_BALANCE))
      addStat(26, 25);
  }
});
var BL_S3 = new Sequence({ name: "Buling S3" });
var BL_S4 = new Sequence({
  name: "Buling S4",
  stats: [[24, 20]]
});
var BL_S5 = new Sequence({
  name: "Buling S5",
  updateDebuffs: () => {
    if (runningAction(Harmony))
      inflictElectroFlare(6);
  }
});
var BL_S6 = new Sequence({ name: "Buling S6" });
var BULING_TALENTS = new Talent({
  name: "Buling: Talents",
  stats: [[6, 12], [24, 12]]
});
var BULING_RESONATOR = new Resonator({
  name: "Buling",
  talent: BULING_TALENTS,
  inherent1: BL_INHERENT_1,
  inherent2: BL_INHERENT_2,
  tier: 2,
  element: 128,
  weapon: 4,
  intro: () => Intro12,
  outro: () => Outro12,
  color: "#7a6ff0",
  maxEnergy: 150,
  maxForte1: 4,
  // the Trigram store, empty (its always-set bit alone; see TRIGRAMS)
  combatStart: () => applyCurrent(TRIGRAMS, 1 << 8),
  constantStats: () => {
    addStat(1, 10625);
    addStat(0, 225);
    addStat(2, 1259);
  }
});
var BL_ROTATION = new Rotation([
  NOINTRO,
  INTRO,
  JUMP,
  MA8,
  BA212,
  HA10,
  Skill11,
  BA49,
  HA10,
  ECHO_CANCEL,
  Liberation11,
  OUTRO
]);
var BULING = new Loadout({
  resonator: BULING_RESONATOR,
  weapons: [VARIATION],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC)
  ],
  mainstats: [mainstats(
    1,
    5,
    5,
    15,
    15
    /* Mainstat.ATK1 */
  )],
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, true),
  highSubstat: highSubs(Substat.Er, Substat.Liberation, Substat.AtkPct, Substat.Liberation),
  rotation: BL_ROTATION,
  sequences: [BL_S1, BL_S2, BL_S3, BL_S4, BL_S5, BL_S6]
});

// dist/src/resonators/electro/hsin.js
function hsinAction(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var flareHit = (name, mul, def2 = {}) => new Action(name, {
  element: 128,
  type: 32768,
  type2: 1572864,
  scaling: 3,
  mv: 0,
  applyStats: () => addStat(16, mul()),
  ...def2
});
var BA113 = hsinAction("Basic - Answering Form 1", { node: 0, cast: 1, type: 4096, mv: 69.6, energy: 1.8, concerto: 2, offtune: 4e3, forte1: 7.08 });
var BA213 = hsinAction("Basic - Answering Form 2", { node: 0, cast: 1, type: 4096, mv: 151.44, energy: 3.95, concerto: 4.37, offtune: 8706, forte1: 15.4 });
var BA314 = hsinAction("Basic - Answering Form 3", { node: 0, cast: 1, type: 4096, mv: 157.54, energy: 4.11, concerto: 2.4, offtune: 4800, forte1: 8.51 });
var BA410 = hsinAction("Basic - Answering Form 4", { node: 0, cast: 1, type: 4096, mv: 198.59, energy: 5.15, concerto: 7.85, offtune: 15673, forte1: 27.7 });
var HA11 = hsinAction("Heavy - Answering Form", { node: 0, cast: 2, type: 8192, mv: 102.76, energy: 2.7, concerto: 3, offtune: 5906, forte1: 10.46 });
var MA9 = hsinAction("Mid-air - Answering Form", { node: 0, cast: 1, type: 4096, mv: 22.44, energy: 0.59, concerto: 0.65, offtune: 2080, forte1: 2.28 });
var ReignHold = hsinAction("Heavy - Answering Form: Reign at Ease (Mid-Air)", { node: 0, cast: 2, type: 8192, mv: 696, energy: 18, concerto: 20, offtune: 4e4, forte1: 76.5 });
var ReignPlunge = hsinAction("Mid-air - Answering Form: Reign at Ease", { node: 0, cast: 1, type: 4096, mv: 22.44, energy: 0.59, concerto: 0.65, offtune: 2080, forte1: 2.28 });
var DC11 = hsinAction("Dodge Counter - Answering Form", { node: 0, cast: 0, type: 4096, mv: 224.9, energy: 5.84, concerto: 16.48, offtune: 12930, forte1: 22.86 });
var Skill12 = hsinAction("Skill - Answering Form", { node: 1, cast: 3, type: 12288, mv: 167.06, energy: 4.35, concerto: 2.4, offtune: 9600, forte1: 8.52 });
var REALM = {
  node: 2,
  cast: 2,
  type: 12288,
  energy: 7.77,
  concerto: 8.64,
  forte1: -100,
  updateBuffs: () => applyCurrent(FORMSHIFT_UNLOCKED, 1)
};
var RealmWanderer = hsinAction("Forte Heavy - Answering Form: Realm Wanderer", { ...REALM, mv: 570.62, offtune: 17177 });
var RealmProtector = hsinAction("Forte Heavy - Answering Form: Realm Protector", { ...REALM, mv: 1241.45, offtune: 25819 });
var collapseHeartlock = () => {
  if (isHeld(HEARTLOCK)) {
    revokeCurrent(HEARTLOCK);
    queue(Heartlock);
  }
};
var COLLAPSE = { updateBuffs: collapseHeartlock };
var IBA1 = hsinAction("Basic - Illumining Form 1", { node: 0, cast: 1, type: 4096, mv: 62.75, energy: 1.64, concerto: 1.83, offtune: 3609, forte2: 28.55, updateBuffs: () => applyCurrent(HEARTLOCK, 1) });
var IBA2 = hsinAction("Basic - Illumining Form 2", { node: 0, cast: 1, type: 4096, mv: 69.6, energy: 1.8, concerto: 2, offtune: 4e3, forte2: 31.66, ...COLLAPSE });
var IBA3 = hsinAction("Basic - Illumining Form 3", { node: 0, cast: 1, type: 4096, mv: 182.1, energy: 4.76, concerto: 5.3, offtune: 10470, forte2: 82.8 });
var Heartlock = hsinAction("Basic - Illumining Form: Modular Heartlock", { node: 0, type: 4096, mv: 41.84, energy: 1.1, concerto: 1.22, offtune: 2406, forte2: 19.04 });
var IHA = hsinAction("Heavy - Illumining Form", { node: 0, cast: 2, type: 8192, mv: 107.86, energy: 2.8, concerto: 3.1, offtune: 6200, forte2: 31.66, ...COLLAPSE });
var UpwardCut2 = hsinAction("Basic - Illumining Form: Upward Cut", { node: 0, cast: 1, type: 4096, mv: 87.57, energy: 2.27, concerto: 2.53, offtune: 5035, forte2: 39.84 });
var IMA = hsinAction("Mid-air - Illumining Form", { node: 0, cast: 1, type: 4096, mv: 22.45, energy: 0.59, concerto: 0.65, offtune: 2080, forte2: 10.22 });
var IDC = hsinAction("Dodge Counter - Illumining Form", { node: 0, cast: 0, type: 4096, mv: 191.36, energy: 4.96, concerto: 15.5, offtune: 11e3, forte2: 73.98, ...COLLAPSE });
var ThunderHit = flareHit("Skill - Illumining Form: Heart of Thunder", () => (isHeld(HS_S1) ? 52 : 40) - 100, { convertStats: () => removeStackTeam(HEART_OF_THUNDER, 1) });
var ISkill = hsinAction("Skill - Illumining Form", {
  node: 1,
  cast: 3,
  type: 12288,
  mv: 222.69,
  energy: 5.79,
  concerto: 6.4,
  offtune: 12800,
  forte2: 114.49,
  updateBuffs: () => {
    collapseHeartlock();
    for (let left = stacksOfTeam(HEART_OF_THUNDER); left > 0; left--)
      queue(ThunderHit);
  }
});
var pillarFlare = () => {
  if (!isHeld(MODE_FLARE) || !stacksOf(PILLAR_CHARGES))
    return;
  inflictElectroFlare(1);
  removeStack(PILLAR_CHARGES, 1);
};
var PILLAR_FLARE = { updateDebuffs: pillarFlare };
var PillarsAligned = hsinAction("Skill - Illumining Form: Pillars Aligned", {
  node: 2,
  cutscene: true,
  cast: 3,
  type: 12288,
  mv: 897.17,
  energy: 8.37,
  concerto: 13.17,
  offtune: 16268,
  applyStats: () => {
    setForte2(300);
  },
  updateDebuffs: () => {
    if (isHeld(MODE_FLARE))
      inflictElectroFlare(5);
    pillarFlare();
  },
  updateBuffs: () => applyCurrent(MECHANISM_DOMINION, 1)
});
var FBA13 = hsinAction("Basic - Illumining Form: Pillars Aligned 1", { node: 2, cast: 1, type: 4096, mv: 86.58, energy: 2.25, concerto: 2.49, offtune: 4977, forte2: -59.16, ...PILLAR_FLARE });
var FBA23 = hsinAction("Basic - Illumining Form: Pillars Aligned 2", { node: 2, cast: 1, type: 4096, mv: 114.69, energy: 2.97, concerto: 3.3, offtune: 6594, forte2: -78.36, ...PILLAR_FLARE });
var FBA33 = hsinAction("Basic - Illumining Form: Pillars Aligned 3", { cutscene: true, node: 2, cast: 1, type: 4096, mv: 106.75, energy: 2.8, concerto: 3.1, offtune: 6140, forte2: -72.95, ...PILLAR_FLARE });
var FBA43 = hsinAction("Basic - Illumining Form: Pillars Aligned 4", { node: 2, cast: 1, type: 4096, mv: 166.38, energy: 4.38, concerto: 4.8, offtune: 9560, forte2: -113.68, ...PILLAR_FLARE });
var FADC = hsinAction("Dodge Counter - Illumining Form: Pillars Aligned", { node: 2, cast: 0, type: 4096, mv: 114.69, energy: 2.97, concerto: 13.3, offtune: 6594, ...PILLAR_FLARE });
var FBA12342 = new ActionGroup("Basic - Illumining Form: Pillars Aligned 1234", [FBA13, FBA23, FBA33, FBA43]);
var FBA123 = new ActionGroup("Basic - Illumining Form: Pillars Aligned 123", [FBA13, FBA23, FBA33]);
var FBA122 = new ActionGroup("Basic - Illumining Form: Pillars Aligned 12", [FBA13, FBA23]);
var BA12342 = new ActionGroup("Basic - Answering Form 1234", [BA113, BA213, BA314, BA410]);
var HORIZONS = {
  node: 2,
  cast: 2,
  type: 12288,
  energy: 8.73,
  cutscene: true,
  updateBuffs: () => {
    revokeCurrent(MECHANISM_DOMINION);
    applyCurrent(PILLARS_UNLOCKED, 1);
  }
};
var Beholding = hsinAction("Forte Heavy - Illumining Form: Beholding All Horizons", { ...HORIZONS, mv: 410.78 });
var FHA6 = hsinAction("Forte Heavy - Illumining Form: Stilling All Horizons", {
  ...HORIZONS,
  mv: 1081.69,
  offtune: 20160,
  updateDebuffs: () => {
    if (isHeld(MODE_FLARE))
      inflictElectroFlare(5);
  }
});
var Lib12 = hsinAction("Liberation - Formshift", {
  node: 3,
  cast: 4,
  cutscene: true,
  concerto: 20,
  resetForte2: true,
  // Flare mode: the Heart Manifest it opens pins the target's Flare at the cap, and forces it up
  // there the moment it starts — so her own 5 Flare all overflow into Electro Rage and bank as
  // Heart of Thunder through Forms Turn, Heart Abides (MODE_FLARE): 6 Flare, Formshift, 13 Flare
  // and +5 Heart. Filled here, ahead of the inflict, since the Manifest itself only goes up in
  // updateBuffs below.
  updateDebuffs: () => {
    if (!isHeld(MODE_FLARE))
      return;
    const room = currentTeam().enemyMax(ELECTRO_FLARE) - stacksOfEnemy(ELECTRO_FLARE);
    if (room > 0)
      applyEnemy(ELECTRO_FLARE, room);
    inflictElectroFlare(5);
  },
  updateBuffs: () => {
    if (isHeld(MODE_UNISON))
      applyCurrent(UNISON, 1);
    revokeCurrent(FORMSHIFT_UNLOCKED);
    applyCurrent(ILLUMINING_FORM, 1);
    applyCurrent(HEART_MANIFEST, 1);
    revokeTeam(EDICT);
    applyTeam(EDICT, 21);
    if (isHeld(MODE_FLARE)) {
      applyCurrent(HEARTLOCK_PRIMED, 1);
      setStacksSelf(PILLAR_CHARGES, 5);
    }
  }
});
var Lib23 = hsinAction("Liberation - Pillars Across Heaven", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 12288,
  mv: 2012.67,
  concerto: 20,
  offtune: 115200,
  resetEnergy: true,
  updateBuffs: () => {
    revokeCurrent(PILLARS_UNLOCKED);
    revokeCurrent(ILLUMINING_FORM);
    revokeCurrent(HEART_MANIFEST);
    revokeTeam(THUNDERGLOW);
    revokeCurrent(PILLAR_CHARGES);
    revokeEnemy(FLEETING_THUNDER);
    applyCurrent(NIGHTGLOW, 1);
  }
});
var SANCTUM = new ActionField("Hsin: Manifold Sanctum");
var SoaringPillar = hsinAction("Liberation - Soaring Pillar", {
  type: 16384,
  type2: 262144,
  mv: 11.37,
  field: SANCTUM
});
var MANIFOLD = {
  updateDebuffs: respondToUnison,
  // a response banks Source Intent for a later Intro; an Intro that is no response spent it
  updateBuffs: () => {
    if (unisonResponse())
      applyCurrent(SOURCE_INTENT, 1);
    else
      revokeCurrent(SOURCE_INTENT);
  }
};
var UIntro = hsinAction("Intro - Answering Form", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 10.28 * 2 + 20.55 * 4,
  energy: 10,
  concerto: 3 + 10,
  offtune: 591 * 2 + 1181 * 4,
  forte1: 60 + 8.38
});
var ManifoldAnswering = hsinAction("Intro - Answering Form: Manifold Unison", {
  node: 4,
  cast: 5,
  type: 12288,
  mv: 60.59 * 2 + 121.18 * 4,
  energy: 10,
  concerto: 3 + 10,
  offtune: 591 * 2 + 1181 * 4,
  forte1: 60 + 8.38,
  ...MANIFOLD
});
var UIIntro = hsinAction("Intro - Illumining Form", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 56.59 * 4 + 5.66 + 11.32 * 2 + 14.15 * 2,
  energy: 10,
  concerto: 1.63 * 4 + 0.17 + 0.33 * 2 + 0.41 * 2 + 10,
  offtune: 3253 * 4 + 326 + 651 * 2 + 814 * 2,
  forte2: 300,
  // lands straight in Mechanism Dominion at 300 Illumining Heart
  updateBuffs: () => applyCurrent(MECHANISM_DOMINION, 1)
});
var ManifoldIllumining = hsinAction("Intro - Illumining Form: Manifold Unison", {
  node: 4,
  cast: 5,
  type: 12288,
  mv: 157.22 * 4 + 15.73 + 31.45 * 2 + 39.31 * 2,
  energy: 15,
  concerto: 2.63 * 4 + 0.27 + 0.53 * 2 + 0.66 * 2 + 10,
  offtune: 3253 * 4 + 326 + 651 * 2 + 814 * 2,
  forte2: 300,
  updateDebuffs: MANIFOLD.updateDebuffs,
  updateBuffs: () => {
    MANIFOLD.updateBuffs();
    applyCurrent(MECHANISM_DOMINION, 1);
  }
});
var Intro13 = hsinAction("Intro - Answering Form", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 157.54,
  energy: 10,
  concerto: 14.55,
  offtune: 9057,
  forte1: 60 + 14.97,
  updateDebuffs: () => {
    if (isHeld(MODE_FLARE))
      inflictElectroFlare(1);
  }
});
var IIntro = hsinAction("Intro - Illumining Form", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 228.4,
  energy: 10,
  concerto: 16.58,
  offtune: 13134,
  forte2: 51.96,
  updateDebuffs: () => {
    if (isHeld(MODE_FLARE))
      inflictElectroFlare(1);
  }
});
var Outro13 = hsinAction("Outro - Herself a Thousand Lanterns", {
  cast: 6,
  type: 24576,
  mv: 100,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => {
    if (!isHeld(NIGHTGLOW))
      return;
    revokeCurrent(NIGHTGLOW);
    if (isHeld(MODE_FLARE)) {
      applyTeam(OUTRO_FLARE, 1);
    }
    if (isHeld(MODE_UNISON)) {
      applyTeam(OUTRO_UNISON, 1);
    }
  }
});
var OutroUnison = unisonOutro(Outro13);
var NIGHTGLOW = new Buff({ name: "Hsin: Nightglow" });
var OUTRO_FLARE = new Buff({
  name: "Hsin: Outro",
  applyStats: () => {
    if (isActive() && !isHeld(HSIN_RESONATOR))
      addStat(
        18,
        20,
        128
        /* Attribute.Electro */
      );
  }
});
var SHARED_LIGHT = new Buff({ name: "Hsin: Shared Light" });
var OUTRO_UNISON = new Buff({
  name: "Hsin: Outro",
  applyStats: () => {
    if (isHeld(SHARED_LIGHT))
      addStat(18, 20);
  }
});
var MODE_FLARE = new ResonanceMode({
  name: "Resonance Mode - Electro Flare",
  // Forms Turn, Heart Abides, Flare mode: every Electro Rage the team inflicts is hers, and comes
  // off the target — watched from her own slot on every action, so a teammate's overflow lands on her
  updateGlobal: () => {
    if (!isHeld(MODE_FLARE))
      return;
    const rage = applied2(ELECTRO_RAGE);
    if (rage > 0)
      applyTeam(HEART_OF_THUNDER, rage);
    if (stacksOfEnemy(ELECTRO_RAGE) > 0)
      consume(ELECTRO_RAGE, stacksOfEnemy(ELECTRO_RAGE));
  }
});
var MODE_UNISON = new ResonanceMode({
  name: "Resonance Mode - Unison",
  combatStart: () => applyCurrent(UNISON_RESPONDER, 1),
  updateBuffs: () => {
    if (unisonResponse() && !isHeld(HS_BOON_RESPONSE)) {
      applyTeam(UNISON_BOON, 1);
      applyCurrent(HS_BOON_RESPONSE, 1);
    }
  },
  updateGlobal: () => {
    const actor = currentTeam().slot;
    if (actor.resonator && !actor.isHeld(HSIN_RESONATOR) && actor.isHeld(UNISON))
      addBuff(actor.resonator, SHARED_LIGHT, 1);
  }
});
var SOURCE_INTENT = new Buff({ name: "Hsin: Source Intent" });
var HS_BOON_RESPONSE = new Buff({ name: "Hsin: Unison Boon (response)" });
var HS_BOON_GLEANING = new Buff({ name: "Hsin: Unison Boon (Gleaning Simple Joys)" });
var ILLUMINING_FORM = new Buff({ name: "Hsin: Illumining Form" });
var FORMSHIFT_UNLOCKED = new Buff({ name: "Hsin: Formshift Unlocked" });
var PILLARS_UNLOCKED = new Buff({ name: "Hsin: Pillars Across Heaven Unlocked" });
var HEART_MANIFEST = new Buff({ name: "Hsin: Heart Manifest" });
var DOMINION_GATED = [IBA1, IBA2, IBA3, Heartlock, IHA, UpwardCut2, IMA, IDC, ISkill];
var MECHANISM_DOMINION = new Buff({
  name: "Hsin: Mechanism Dominion",
  applyStats: () => {
    const a = currentAction();
    if (DOMINION_GATED.includes(a))
      addStat(31, -a.forte2);
  }
});
var HEARTLOCK = new Buff({ name: "Hsin: Modular Heartlock" });
var HEARTLOCK_PRIMED = new Buff({
  name: "Hsin: Modular Heartlock (Primed)",
  applyStats: () => {
    if (runningAction(Heartlock))
      addStat(31, 150);
  },
  convertStats: () => {
    if (runningAction(Heartlock))
      revokeCurrent(HEARTLOCK_PRIMED);
  }
});
var EDICT = coordinatedBuff("Hsin: Edict", 21, () => HSIN_RESONATOR, SoaringPillar);
var PILLAR_CHARGES = new Buff({ name: "Hsin: Pillars Aligned Flare Charges", maxStacks: 5 });
var HEART_OF_THUNDER = new Buff({ name: "Hsin: Heart of Thunder", maxStacks: 100 });
var THUNDERGLOW = new Buff({ name: "Hsin: Thunderglow", maxStacks: 10 });
var tidesPayers = () => {
  const slots = frozenStacks();
  return (slots & 1) + (slots >> 1 & 1) + (slots >> 2 & 1);
};
var TIDES_UNISON = new Buff({
  name: "Inherent: Tides of Succession (Manifold Unison)",
  updateBuffs: () => lostOnSwap(),
  stats: [[
    17,
    40,
    128
    /* Attribute.Electro */
  ]]
});
var TIDES_OF_SUCCESSION = new Buff({
  name: "Inherent: Tides of Succession",
  maxStacks: 1 + 2 + 4,
  display: () => `Inherent: Tides of Succession x${Math.min(2, tidesPayers())}`,
  applyStats: () => addStat(
    17,
    25 * Math.min(2, tidesPayers()),
    128
    /* Attribute.Electro */
  )
});
var THUNDEROUS_BOND = new Buff({
  name: "Inherent: Tides of Succession (Electro Rover)",
  stats: [[
    17,
    20,
    128
    /* Attribute.Electro */
  ]]
});
var HS_INHERENT_1 = new Inherent({
  name: "Inherent: Tides of Succession",
  updateBuffs: () => {
    if (isHeld(MODE_UNISON) && (runningAction(ManifoldAnswering) || runningAction(ManifoldIllumining)))
      applyCurrent(TIDES_UNISON, 1);
  },
  updateGlobal: () => {
    if (!isHeld(MODE_FLARE))
      return;
    const actor = currentTeam().slot;
    const slot = 1 << currentTeam().active;
    if (appliedByMember(ELECTRO_FLARE, actor) && (stacksOf(TIDES_OF_SUCCESSION) & slot) === 0) {
      applyCurrent(TIDES_OF_SUCCESSION, slot);
    }
    if (casting(
      5
      /* Cast.Intro */
    ) && actor.resonator?.name === "Electro Rover") {
      applyCurrent(THUNDEROUS_BOND, 1);
      addBuff(actor.resonator, THUNDEROUS_BOND, 1);
    }
  }
});
var HS_INHERENT_2 = new Inherent({
  name: "Inherent: Gleaning Simple Joys",
  updateGlobal: () => {
    const actor = currentTeam().slot;
    if (isHeld(MODE_UNISON)) {
      if (appliedByMember(UNISON_RESPONSE, actor) && !isHeld(HS_BOON_GLEANING)) {
        applyTeam(UNISON_BOON, 1);
        applyCurrent(HS_BOON_GLEANING, 1);
      }
      return;
    }
    if (!isHeld(MODE_FLARE))
      return;
    if (isHeld(HEART_MANIFEST)) {
      if (stacksOfEnemy(ELECTRO_FLARE) === 0)
        inflictElectroFlare(1);
      if (stacksOfTeam(THUNDERGLOW) >= 10)
        applyEnemy(FLEETING_THUNDER, 1);
    } else {
      const inflicted = actor.isHeld(HSIN_RESONATOR) ? 0 : appliedByMember(ELECTRO_FLARE, actor);
      if (inflicted > 0)
        applyTeam(THUNDERGLOW, inflicted);
      return;
    }
    if (!stacksOfEnemy(FLEETING_THUNDER))
      return;
    const cap = Math.min(16, currentTeam().enemyMax(ELECTRO_FLARE));
    if (stacksOfEnemy(ELECTRO_FLARE) < cap)
      applyEnemy(ELECTRO_FLARE, cap - stacksOfEnemy(ELECTRO_FLARE));
  }
});
var HS_S1 = new Sequence({
  name: "Hsin S1: A Boat to Cross the Rising Tide",
  combatStart: () => {
    applyTeam(HEART_OF_THUNDER, 50);
  },
  applyStats: () => {
    if (runningAction(ManifoldAnswering) || runningAction(ManifoldIllumining))
      addStat(16, 15 + 10 * Math.min(4, stacksOfTeam(UNISON_BOON)));
  }
});
var HS_S2 = new Sequence({
  name: "Hsin S2: To Wake Is to Wonder What I Am",
  combatStart: () => {
    addForte1(100);
  },
  applyStats: () => {
    if (runningAction(RealmWanderer) || runningAction(RealmProtector) || runningAction(Beholding) || runningAction(FHA6))
      addStat(16, 60);
  }
});
var PillarsFlare = flareHit("Liberation - Pillars Across Heaven: Electro Flare", () => 1400);
var HS_S3 = new Sequence({
  name: "Hsin S3: A Dream of Return Among the Hills",
  updateBuffs: () => {
    if (runningAction(Lib23) && isHeld(MODE_FLARE) && stacksOfEnemy(ELECTRO_FLARE) > 0)
      queue(PillarsFlare);
  },
  applyStats: () => {
    if (!runningAction(Lib23))
      return;
    addStat(16, 70);
    if (isHeld(MODE_UNISON))
      addStat(10, 20 + 15 * Math.min(4, stacksOfTeam(UNISON_BOON)));
  }
});
var RIVER_OF_LANTERNS = new Buff({
  name: "Hsin S4: A River of Lanterns, a River of Wishes",
  stats: [[17, 20]]
});
var HS_S4 = new Sequence({
  name: "Hsin S4: A River of Lanterns, a River of Wishes",
  // from updateGlobal "me" is the holder, so the acting slot has to be named (status.ts)
  updateGlobal: () => {
    const actor = currentTeam().slot;
    if (appliedByMember(ELECTRO_FLARE, actor) || appliedByMember(ELECTRO_RAGE, actor) || appliedByMember(UNISON, actor) || appliedByMember(UNISON_RESPONSE, actor))
      applyTeam(RIVER_OF_LANTERNS, 1);
  }
});
var HS_S5 = new Sequence({ name: "Hsin S5: Forms Turn as the Heart Wills" });
var HS_BOON_S6 = new Buff({ name: "Hsin: Unison Boon (S6)" });
var HS_S6 = new Sequence({
  name: "Hsin S6: The Moon Owes Its Light to the Living",
  updateGlobal: () => {
    if (!isHeld(MODE_UNISON) || isHeld(HS_BOON_S6))
      return;
    if (appliedByMember(UNISON_RESPONSE, currentTeam().slot)) {
      applyTeam(UNISON_BOON, 1);
      applyCurrent(HS_BOON_S6, 1);
    }
  },
  applyStats: () => {
    addStat(
      20,
      40,
      12288
      /* Type1.Skill */
    );
    addStat(
      22,
      20,
      12288
      /* Type1.Skill */
    );
    if (isHeld(MODE_FLARE)) {
      addStat(
        9,
        80,
        1572864
        /* Type2.ElectroFlare */
      );
      addStat(
        10,
        230,
        1572864
        /* Type2.ElectroFlare */
      );
    }
  }
});
var HS_SEQUENCES = [HS_S1, HS_S2, HS_S3, HS_S4, HS_S5, HS_S6];
var HSIN_TALENTS = new Talent({
  name: "Hsin: Talents",
  stats: [[9, 8], [6, 12]]
});
var HSIN_RESONATOR = new Resonator({
  name: "Hsin",
  talent: HSIN_TALENTS,
  inherent1: HS_INHERENT_1,
  inherent2: HS_INHERENT_2,
  tier: 0,
  element: 128,
  weapon: 4,
  // Unison mode: the Manifold form on a Unison Response, or on a held Source Intent
  intro: () => {
    if (!isHeld(MODE_UNISON))
      return isHeld(ILLUMINING_FORM) ? IIntro : Intro13;
    const manifold = unisonIntro() || isHeld(SOURCE_INTENT);
    return isHeld(ILLUMINING_FORM) ? manifold ? ManifoldIllumining : UIIntro : manifold ? ManifoldAnswering : UIntro;
  },
  outro: () => isHeld(UNISON) ? OutroUnison : Outro13,
  color: "#f1a49b",
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 300,
  constantStats: () => {
    addStat(1, 10300);
    addStat(0, 462.5);
    addStat(2, 1112.22);
  }
});
var IBA12 = new ActionGroup("Basic - Illumining Form 12", [IBA1, IBA2]);
var BA344 = new ActionGroup("Basic - Answering Form 34", [BA314, BA410]);
var HS_ROTATION_FLARE = new Rotation([
  INTRO,
  BA410,
  Skill12,
  ECHO_ONFIELD,
  RealmProtector,
  Lib12,
  ISkill,
  IBA12,
  PillarsAligned,
  FBA123,
  DODGE,
  FBA122,
  FHA6,
  Lib23,
  OUTRO
]);
var HS_ROTATION_UNISON = new Rotation([
  NOINTRO,
  JUMP,
  ReignHold,
  ReignPlunge,
  Skill12,
  BA410,
  RealmProtector,
  Lib12,
  OUTRO,
  DOUBLE_INTRO,
  BA344,
  Skill12,
  RealmProtector,
  Lib12,
  OUTRO,
  INTRO,
  ECHO_ONFIELD,
  FBA123,
  DODGE,
  FBA122,
  FHA6,
  Lib23,
  OUTRO
]);
var HSIN_FLARE = new Loadout({
  resonator: HSIN_RESONATOR,
  weapons: [BLOOMING_JADEHAVEN, COSMIC_RIPPLES, STRINGMASTER, LETHEAN_ELEGY, FREEZE_FRAME],
  echoLoadouts: [new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    11,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Skill, Substat.Er, Substat.FlatAtk),
  rotation: HS_ROTATION_FLARE,
  mode: MODE_FLARE,
  sequences: HS_SEQUENCES
});
var HSIN_UNISON = new Loadout({
  resonator: HSIN_RESONATOR,
  weapons: [BLOOMING_JADEHAVEN, COSMIC_RIPPLES, STRINGMASTER, LETHEAN_ELEGY, FREEZE_FRAME],
  echoLoadouts: [new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    11,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Skill, Substat.Er, Substat.FlatAtk),
  rotation: HS_ROTATION_UNISON,
  mode: MODE_UNISON,
  sequences: HS_SEQUENCES
});

// dist/src/resonators/spectro/lucy.js
function lucyAction(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA114 = lucyAction("Basic - Locked Thread 1", { node: 0, cast: 1, type: 4096, mv: 121.49, energy: 1.9, concerto: 6.17, offtune: 7520, forte1: 16 });
var BA214 = lucyAction("Basic - Locked Thread 2", { node: 0, cast: 1, type: 4096, mv: 60.76, energy: 0.96, concerto: 3.07, offtune: 3761, forte1: 12 });
var BA315 = lucyAction("Basic - Locked Thread 3", { node: 0, cast: 1, type: 4096, mv: 120.2, energy: 1.87, concerto: 6.06, offtune: 7440, forte1: 18 });
var BA411 = lucyAction("Basic - Locked Thread 4", { node: 0, cast: 1, type: 4096, mv: 155.09, energy: 2.4, concerto: 7.8, offtune: 9600, forte1: 26 });
var MA10 = lucyAction("Mid-air - Locked Thread", { node: 0, cast: 1, type: 4096, mv: 116.32, energy: 2.26, concerto: 5.86, offtune: 7200, forte1: 8 });
var DC12 = lucyAction("Dodge Counter - Locked Thread", { node: 0, cast: 0, type: 4096, mv: 197.73, energy: 3.83, concerto: 19.96, offtune: 12240, forte1: 12 });
var HA1 = lucyAction("Heavy - Locked Thread 1", { node: 0, cast: 2, type: 8192, mv: 73.67, energy: 1.43, concerto: 3.73, offtune: 4560, forte1: 10 });
var HA23 = lucyAction("Heavy - Locked Thread 2", { node: 0, cast: 2, type: 8192, mv: 284.32, energy: 5.51, concerto: 14.32, offtune: 17602, forte1: 20.02 });
var EBA13 = lucyAction("Basic - Thread Shredding 1", { node: 0, cast: 1, type: 8192, mv: 77.96, energy: 1.12, concerto: 4.48, offtune: 4480, forte2: 16.2 });
var EBA22 = lucyAction("Basic - Thread Shredding 2", { node: 0, cast: 1, type: 8192, mv: 111.35, energy: 1.6, concerto: 6.4, offtune: 6400, forte2: 29.55 });
var EBA32 = lucyAction("Basic - Thread Shredding 3", { node: 0, cast: 1, type: 8192, mv: 140.6, energy: 2.05, concerto: 8.1, offtune: 8080, forte2: 37.3 });
var EBA42 = lucyAction("Basic - Thread Shredding 4", { node: 0, cast: 1, type: 8192, mv: 125.3, energy: 1.8, concerto: 7.2, offtune: 7200, forte2: 33.25 });
var EMA = lucyAction("Mid-air - Algorithm Compaction", { node: 0, cast: 1, type: 4096, mv: 125.26, energy: 2.26, concerto: 5.86, offtune: 7200, forte2: 33.22 });
var EDC2 = lucyAction("Dodge Counter - Algorithm Compaction", { node: 0, cast: 0, type: 4096, mv: 194.85, energy: 3.5, concerto: 21.2, offtune: 11200, forte2: 29.55 });
var EHA = lucyAction("Heavy - Single Threading", { node: 0, cast: 2, type: 8192, mv: 116.95, energy: 1.7, concerto: 6.75, offtune: 6720, forte2: 31 });
var HACKS = { updateDebuffs: () => applyHack() };
var DualThreading = lucyAction("Heavy - Dual Threading", {
  node: 0,
  cast: 2,
  type: 8192,
  mv: 167.05,
  energy: 3,
  concerto: 8,
  offtune: 6720,
  forte2: -100
});
var MultiThreading = lucyAction("Heavy - Multi-threading", { node: 0, cast: 2, type: 8192, mv: 238.6, energy: 3, concerto: 8, offtune: 10080, ...HACKS });
var Skill1 = lucyAction("Skill - Payload (Charge)", {
  node: 1,
  cast: 3,
  type: 12288,
  mv: 30.08,
  energy: 1.5,
  concerto: 2.4,
  offtune: 1512,
  forte1: 3.6,
  ...HACKS,
  updateBuffs: () => queue(Skill22)
  // hitting with the charge triggers the follow-up on its own
});
var Skill22 = lucyAction("Skill - Payload (Follow-Up)", { node: 1, cast: 3, type: 12288, mv: 70.17, energy: 3.5, concerto: 5.6, offtune: 3528, forte1: 8.4 });
var Skill32 = lucyAction("Skill - Pulse Interference", {
  node: 1,
  cast: 3,
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
  cast: 3,
  type: 8192,
  mv: 258.47,
  energy: 10,
  concerto: 8,
  forte1: -100,
  ...HACKS,
  updateBuffs: () => {
    if (!isHeld(ALGORITHM_COMPACTION)) {
      applyCurrent(ALGORITHM_COMPACTION, 1);
      applyCurrent(SQL, 1);
    }
  }
});
var OVERRIDE = {
  resetForte1: true,
  updateBuffs: () => {
    applyEnemy(CYBERWARE_MALFUNCTION, 1);
    applyEnemy(BREACH_PROTOCOL, 1);
    queue(Ping);
    queue(SynapseBurnout);
    queue(CrippleMovement);
  }
};
var Lib = lucyAction("Liberation - Netrunner: Override", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 8192,
  mv: 894.65,
  concerto: 20,
  offtune: 43200,
  resetEnergy: true,
  ...OVERRIDE
});
var ELib = lucyAction("Liberation - Old Net Deep Dive: Override", {
  node: 3,
  cast: 4,
  cutscene: true,
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
var Intro14 = lucyAction("Intro - Outdated Hallucination", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 138.28,
  energy: 10,
  concerto: 10,
  offtune: 8560,
  updateBuffs: () => applyCurrent(OUTDATED_HALLUCINATION, 1)
});
var Outro14 = lucyAction("Outro - Countermeasure Program", {
  cast: 6,
  concerto: -100,
  swapOut: true,
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
  stats: [[
    17,
    65,
    320
    /* Attribute.Spectro */
  ]],
  convertStats: () => {
    if (runningAction(Outro14))
      revokeCurrent(ALGORITHM_COMPACTION);
  }
});
var SQL = new Buff({
  name: "Lucy: SQL",
  applyStats: () => {
    if (!runningAction(MultiThreading))
      return;
    addStat(16, isHeld(LC_S2) ? 560 : 270);
    addStat(26, 7);
    addStat(28, 57600);
  },
  convertStats: () => {
    if (runningAction(MultiThreading))
      revokeCurrent(SQL);
  }
});
var OUTDATED_HALLUCINATION = new Buff({
  name: "Lucy: Outdated Hallucination",
  applyStats: () => {
    if (runningAction(Skill32))
      addStat(30, 20.6);
  },
  convertStats: () => {
    if (runningAction(Skill32))
      revokeCurrent(OUTDATED_HALLUCINATION);
  }
});
var DIGITAL_HANDSHAKE = new Buff({
  name: "Lucy: Digital Handshake",
  applyStats: () => {
    if (runningAction(Outro14))
      addStat(30, 12);
  }
  // approximation
});
var CYBERWARE_MALFUNCTION = new Debuff({
  name: "Spoofing Program: Cyberware Malfunction",
  stats: [[20, 5]]
});
var BREACH_PROTOCOL = new Debuff({
  name: "Spoofing Program: Breach Protocol",
  applyStats: () => addEnemyStat(36, 5)
});
var COUNTERMEASURE_HANDOFF = new Buff({
  name: "Lucy: Outro",
  updateBuffs: () => lostOnSwap(),
  stats: [[
    18,
    25,
    4096
    /* Type1.Basic */
  ]]
});
var COUNTERMEASURE_MARKER = new Buff({
  name: "Lucy: Countermeasure Program",
  updateBuffs: () => {
    if (applied2(TUNE_HACK_SHIFTING) && !isHeld(LUCY_RESONATOR)) {
      applyCurrent(COUNTERMEASURE_AMP, 1);
      revokeTeam(COUNTERMEASURE_MARKER);
    }
  }
});
var COUNTERMEASURE_AMP = new Buff({
  name: "Lucy: Countermeasure Program",
  updateBuffs: () => lostOnSwap(),
  stats: [[18, 20]]
});
var LC_S1_ATK = new Buff({
  name: "Lucy S1: The Moon, a Ticket, and a Dream",
  stats: [[6, 20]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(LC_S1_ATK);
  }
});
var LC_S1 = new Sequence({
  name: "Lucy S1: The Moon, a Ticket, and a Dream",
  updateBuffs: () => {
    if (runningAction(Intro14))
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
    if (runningAction(Skill32))
      queue(S2Instance);
  }
});
var LC_S3 = new Sequence({
  name: "Lucy S3: Cyberpunk",
  applyStats: () => {
    if (runningAction(Lib) || runningAction(ELib)) {
      addStat(16, 50);
      addStat(10, 100);
    }
    if (runningAction(CrippleMovement) || runningAction(DataCrash))
      addStat(16, 65);
  }
});
var LC_S4_TEAM = new Buff({
  name: "Lucy S4: No Living Legends in Night City",
  stats: [[17, 20]]
});
var LC_S4 = new Sequence({
  name: "Lucy S4: No Living Legends in Night City",
  updateGlobal: () => {
    if (applied2(TUNE_HACK_SHIFTING))
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
      20,
      40,
      8192
      /* Type1.Heavy */
    );
    addStat(
      20,
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
  stats: [[6, 12], [9, 8]]
});
var LUCY_MATRIX = matrix("Lucy", 0, {
  updateBuffs: () => {
    if (runningAction(Lib))
      applyTeam(NETWORK_BACKDOOR, 1);
  }
});
var LUCY_RESONATOR = new Resonator({
  name: "Lucy",
  matrix: LUCY_MATRIX,
  talent: LUCY_TALENTS,
  inherent1: LC_INHERENT_1,
  inherent2: LC_INHERENT_2,
  element: 320,
  weapon: 2,
  intro: () => Intro14,
  outro: () => Outro14,
  color: "#efe8de",
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 100,
  updateGlobal: () => tuneHackResponse(DataCrash),
  constantStats: () => {
    addStat(1, 11025);
    addStat(0, 425);
    addStat(2, 1148.89);
    addStat(12, 10);
  }
});
var BA2343 = new ActionGroup("Basic - Locked Thread 234", [BA214, BA315, BA411]);
var EBA234 = new ActionGroup("Basic - Thread Shredding 234", [EBA22, EBA32, EBA42]);
var LC_ROTATION = new Rotation([
  START_3,
  Lib,
  SWAP,
  INTRO,
  BA2343,
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
var LUCY = new Loadout({
  resonator: LUCY_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Er),
  rotation: LC_ROTATION
});

// dist/src/resonators/electro/rebecca.js
function rebeccaAction(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var HBA13 = rebeccaAction("Basic - Huntress 1", { node: 0, cast: 1, type: 4096, mv: 73.52, energy: 1.1, concerto: 2.18, offtune: 3480, forte1: 7.06 });
var HBA22 = rebeccaAction("Basic - Huntress 2", { node: 0, cast: 1, type: 4096, mv: 95.65, energy: 1.45, concerto: 2.85, offtune: 4530, forte1: 9.2 });
var HBA3 = rebeccaAction("Basic - Huntress 3", { node: 0, cast: 1, type: 4096, mv: 109.85, energy: 1.63, concerto: 3.25, offtune: 5200, forte1: 10.54 });
var HHA = rebeccaAction("Heavy - Huntress", { node: 0, cast: 2, type: 4096, mv: 33.8, energy: 0.5, concerto: 1, offtune: 1600, forte1: 3.58 });
var EatLead = rebeccaAction("Heavy - Eat Lead!: Huntress", { node: 0, cast: 2, type: 8192, mv: 121.68, energy: 1.8, concerto: 3.6, offtune: 5760, forte1: 11.68 });
var HMA = rebeccaAction("Mid-air - Huntress", { node: 0, cast: 1, type: 4096, mv: 136.04, energy: 2.02, concerto: 4.03, offtune: 6440, forte1: 13.05 });
var HTD = rebeccaAction("Basic - Tactical Dodge: Huntress", { node: 0, cast: 1, type: 4096, mv: 84.5, energy: 1.25, concerto: 2.5, offtune: 4e3, forte1: 8.95 });
var CominInHot = rebeccaAction("Basic - Comin' in Hot!: Huntress", {
  node: 0,
  cast: 1
  /* Cast.Basic */
});
var GBA1 = rebeccaAction("Basic - Guts 1", { node: 0, cast: 1, type: 4096, mv: 123.38, energy: 1.84, concerto: 3.66, offtune: 5840, forte1: 13.62 });
var GBA2 = rebeccaAction("Basic - Guts 2", { node: 0, cast: 1, type: 4096, mv: 84.5, energy: 1.25, concerto: 2.5, offtune: 4e3, forte1: 9.32 });
var GBA3 = rebeccaAction("Basic - Guts 3", { node: 0, cast: 1, type: 4096, mv: 225.11, energy: 3.34, concerto: 6.67, offtune: 10658, forte1: 24.84 });
var GHA = rebeccaAction("Heavy - Guts", { node: 0, cast: 2, type: 8192, mv: 202.79, energy: 3, concerto: 6, offtune: 9600, forte1: 19.45 });
var GMA = rebeccaAction("Mid-air - Guts", { node: 0, cast: 1, type: 4096, mv: 104.78, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 10.05 });
var GTD = rebeccaAction("Basic - Tactical Dodge: Guts", { node: 0, cast: 1, type: 4096, mv: 101.4, energy: 1.5, concerto: 3, offtune: 4800, forte1: 9.73 });
var TO_GUTS = { convertStats: () => {
  revokeCurrent(HUNTRESS);
  applyCurrent(GUTS, 1);
} };
var TO_HUNTRESS = { convertStats: () => {
  revokeCurrent(GUTS);
  applyCurrent(HUNTRESS, 1);
} };
var Skill13 = rebeccaAction("Skill - It's Big Boomin' Time!", { node: 1, cast: 3, type: 12288, mv: 236.6, energy: 3.52, concerto: 7, offtune: 11200, forte1: 22.72, ...TO_GUTS });
var ESkill3 = rebeccaAction("Skill - Come 'n' Get Me!", { node: 1, cast: 3, type: 12288, mv: 236.6, energy: 3.51, concerto: 7, offtune: 11200, forte1: 22.72, ...TO_HUNTRESS });
var SPEND_FERVOR = { updateDebuffs: () => applyHack() };
var FHAHunt = rebeccaAction("Forte Heavy - Rat-tat-tat!: Huntress", { node: 2, cast: 2, type: 4096, mv: 397.66, energy: 15, concerto: 20, offtune: 44320, forte1: -120, forte2: 40, ...SPEND_FERVOR });
var FHAGuts = rebeccaAction("Forte Heavy - Bang-bang-bang!: Guts", { node: 2, cast: 2, type: 4096, mv: 278.34, energy: 15, concerto: 20, offtune: 44320, forte1: -120, forte2: 40, ...SPEND_FERVOR });
var Lib13 = rebeccaAction("Liberation - Party 'til Dawn!", {
  node: 3,
  cast: 4,
  cutscene: true,
  resetEnergy: true,
  forte3: 90,
  updateBuffs: () => {
    queueOnIntro(Boom);
  }
});
var Lib24 = rebeccaAction("Liberation - Mk. 31 HMG x5", {
  node: 3,
  type: 4096,
  cast: 4,
  cutscene: true,
  mv: 24.3 * 5,
  concerto: 20 + 0.56 * 5,
  offtune: 1609 * 5,
  forte3: -10
});
var Lib32 = rebeccaAction("Liberation - Mk. 31 HMG 1st Enhancement x5", {
  node: 3,
  type: 4096,
  cast: 4,
  cutscene: true,
  mv: 48.6 * 5,
  concerto: 1.12 * 5,
  offtune: 3218 * 5,
  forte3: -20
});
var Lib4 = rebeccaAction("Liberation - Mk. 31 HMG 2nd Enhancement x10", {
  node: 3,
  type: 4096,
  cast: 4,
  cutscene: true,
  mv: 72.9 * 10,
  concerto: 1.67 * 10,
  offtune: 4826 * 10,
  forte3: -60
});
var Lib234 = new ActionGroup("Liberation - Mk. 31 HMG", [Lib24, Lib32, Lib4]);
var Boom = rebeccaAction("Liberation - BOOM! Fireworks!", {
  node: 3,
  type: 4096,
  cast: 4,
  cutscene: true,
  mv: 636.2,
  energy: 20,
  concerto: 10,
  offtune: 31025,
  updateDebuffs: () => applyHack()
});
var Intro15 = rebeccaAction("Intro - Yo, It's Big Boomin' Time!", { node: 4, cast: 5, type: 20480, mv: 270.4, energy: 10, concerto: 10, offtune: 12800, updateDebuffs: () => applyHack(), ...TO_GUTS });
var EIntro2 = rebeccaAction("Intro - Hey, Leadhead, Come 'n' Get Me!", { node: 4, cast: 5, type: 20480, mv: 202.8, energy: 10, concerto: 10, offtune: 9600, updateDebuffs: () => applyHack(), ...TO_HUNTRESS });
var Outro15 = rebeccaAction("Outro - Preem Choom", {
  cast: 6,
  type: 24576,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => {
    const st = currentTeam();
    const next = st.slots[(st.active + st.outroDir + st.slots.length) % st.slots.length];
    if (next.resonator?.name === "Lucy")
      applyTeam(REBECCA_TURRET_LUCY, 4);
    else
      applyTeam(REBECCA_TURRET, 14);
    queueOutro(EDGERUNNER_BONDS);
    addStat(31, 120);
  }
});
var TURRET_FIELD = new ActionField("Rebecca: Outro Turret");
var TurretTick = rebeccaAction("Outro - Preem Choom: Turret", { type: 24576, mv: 2.5, field: TURRET_FIELD });
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
var GUTS = new Buff({ name: "Rebecca: Guts", applyStats: () => addStat(22, 15) });
var A_GIRL = new Buff({
  name: "Rebecca: A Girl Gets What She Wants!",
  applyStats: () => {
    if (forte2() >= 120 && (casting(
      3
      /* Cast.Skill */
    ) || casting(
      5
      /* Cast.Intro */
    ))) {
      addStat(31, -120);
      if (casting(
        5
        /* Cast.Intro */
      ))
        addStat(30, 50);
    }
    const k = isHeld(RB_S4) ? 1.6 : 1;
    if (!isHeld(HUNTRESS))
      addStat(10, 30 * k);
    else if (k > 1)
      addStat(10, 30 * (k - 1));
    if (!isHeld(GUTS))
      addStat(22, 15 * k);
    else if (k > 1)
      addStat(22, 15 * (k - 1));
    const a = currentAction();
    if (a.forte2 > 0)
      addStat(31, -a.forte2);
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(A_GIRL);
  }
});
var TAG_YOURE_IT = new Buff({
  name: "Inherent: Tag, You're It! (self)",
  maxStacks: 2,
  stats: [[6, 10]],
  perStack: true,
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(TAG_YOURE_IT);
  }
});
var TAG_TBB = new Buff({
  name: "Inherent: Tag, You're It!",
  stats: [[12, 30]]
});
var LEFT_AN_OPENING = new Buff({
  name: "Inherent: Left an Opening!",
  stats: [[6, 20]]
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
    if (runningAction(HBA13) || runningAction(HBA22) || runningAction(HBA3) || runningAction(HHA) || runningAction(HTD) || runningAction(GBA1) || runningAction(GBA2) || runningAction(GBA3) || runningAction(GTD))
      addStat(16, 50);
  }
});
var OH_HEY_CHOOM_TEAM = new Buff({
  name: "Rebecca S2: Oh, Hey Choom!",
  stats: [[17, 20]]
});
var OH_HEY_CHOOM_HACK = new Buff({
  name: "Rebecca S2: Oh, Hey Choom!",
  stats: [[18, 15]]
});
var RB_S2 = new Sequence({
  name: "Rebecca S2: Oh, Hey Choom!",
  updateGlobal: () => {
    const acting = currentTeam().slot.resonator;
    if (acting && applied2(TUNE_HACK_SHIFTING))
      addBuff(acting, OH_HEY_CHOOM_HACK, 1);
  },
  updateBuffs: () => {
    if (runningAction(Intro15) || runningAction(EIntro2) || runningAction(Lib13))
      applyTeam(OH_HEY_CHOOM_TEAM, 1);
  }
});
var RB_S3 = new Sequence({
  name: "Rebecca S3: Don't Sweat Your Six!",
  applyStats: () => {
    if (runningAction(Lib24) || runningAction(Lib32) || runningAction(Lib4) || runningAction(Boom))
      addStat(16, 60);
    if (casting(
      5
      /* Cast.Intro */
    ) && !isHeld(A_GIRL))
      addStat(31, 120);
  }
});
var RB_S4 = new Sequence({ name: "Rebecca S4: Got Ya Covered!" });
var DREAMIN_ON_THE_EDGE = new Buff({
  name: "Rebecca S5: Dreamin' on the Edge",
  stats: [[
    17,
    20,
    4096
    /* Type1.Basic */
  ]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(DREAMIN_ON_THE_EDGE);
  }
});
var RB_S5 = new Sequence({
  name: "Rebecca S5: Dreamin' on the Edge",
  updateBuffs: () => {
    if (isActive() && applied2(TUNE_HACK_SHIFTING))
      applyCurrent(DREAMIN_ON_THE_EDGE, 1);
  }
});
var S6Hunt = rebeccaAction("Forte Heavy - Rat-tat-tat!: Huntress (S6 Strike)", { node: 2, type: 4096, mv: 900 });
var S6Guts = rebeccaAction("Forte Heavy - Bang-bang-bang!: Guts (S6 Strike)", { node: 2, type: 4096, mv: 900 });
var RB_S6 = new Sequence({
  name: "Rebecca S6: Maybe, Just Maybe...",
  applyStats: () => {
    if ((runningAction(FHAHunt) || runningAction(FHAGuts)) && !isHeld(A_GIRL))
      addStat(31, 20);
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
    if (runningAction(FHAHunt))
      queue(S6Hunt);
    if (runningAction(FHAGuts))
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
    if (acting && applied2(TUNE_HACK_SHIFTING))
      addBuff(acting, TAG_TBB, 1);
  },
  updateBuffs: () => {
    if (applied2(A_GIRL) || runningAction(FHAHunt) || runningAction(FHAGuts))
      applyCurrent(TAG_YOURE_IT, 1);
  }
});
var RB_INHERENT_2 = new Inherent({
  name: "Inherent: Left an Opening!",
  updateBuffs: () => {
    if (runningAction(Lib13))
      applyTeam(LEFT_AN_OPENING, 1);
  }
});
var REBECCA_TALENTS = new Talent({
  name: "Rebecca: Talents",
  stats: [[6, 12], [9, 8]]
});
var REBECCA_RESONATOR = new Resonator({
  name: "Rebecca",
  talent: REBECCA_TALENTS,
  inherent1: RB_INHERENT_1,
  inherent2: RB_INHERENT_2,
  element: 128,
  weapon: 2,
  // whichever mode she is in decides which Intro she has; her loop always ends in Huntress
  intro: () => isHeld(GUTS) ? EIntro2 : Intro15,
  outro: () => Outro15,
  color: "#abebda",
  maxEnergy: 125,
  maxForte1: 120,
  maxForte2: 120,
  maxForte3: 90,
  // she starts in Huntress with a full Hot Hand bar
  combatStart: () => {
    applyCurrent(HUNTRESS, 1);
    setForte2(120);
  },
  updateGlobal: () => tuneHackResponse(Meltdown),
  // at a full Hot Hand bar, a Resonance Skill or Intro Skill trades it for the 12s window
  updateBuffs: () => {
    if (forte2() >= 120 && (casting(
      3
      /* Cast.Skill */
    ) || casting(
      5
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
  FIRST_INTRO,
  GBA1,
  DODGE,
  GTD,
  GBA1,
  GHA,
  GHA,
  FHAGuts,
  GHA,
  ECHO_CANCEL,
  Lib13,
  Lib234,
  OUTRO,
  INTRO,
  HMA,
  Skill13,
  DODGE,
  GHA,
  FHAGuts,
  GHA,
  ECHO_CANCEL,
  Lib13,
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Basic, Substat.Er),
  rotation: RB_ROTATION
});

// dist/src/resonators/electro/rover_electro.js
function roverAction2(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var BA115 = roverAction2("Basic - Deterrence 1", { node: 0, cutscene: true, cast: 1, type: 4096, mv: 51.08, energy: 0.92, concerto: 3.31, offtune: 2936, forte1: 6.12 });
var BA215 = roverAction2("Basic - Deterrence 2", { node: 0, cast: 1, type: 4096, mv: 65, energy: 1.18, concerto: 4.22, offtune: 3737, forte1: 7.8 });
var BA316 = roverAction2("Basic - Deterrence 3", { node: 0, cast: 1, type: 4096, mv: 92.89, energy: 1.68, concerto: 6.02, offtune: 5341, forte1: 11.16 });
var BA412 = roverAction2("Basic - Deterrence 4", { node: 0, cast: 1, type: 4096, mv: 182.04, energy: 3.28, concerto: 11.78, offtune: 10465, forte1: 21.82 });
var Skill14 = roverAction2("Skill - Thunderclap", { node: 1, cast: 3, type: 12288, mv: 200.4, energy: 11.34, concerto: 9.8, offtune: 4268, forte1: 8.9 });
var Repel = roverAction2("Basic - Repel", { node: 1, cast: 1, type: 4096, mv: 140.29, energy: 2.53, concerto: 9.08, offtune: 8065, forte1: 16.8 });
var OVERSHOCK = {
  node: 2,
  cast: 3,
  type: 12288,
  mv: 1412.58,
  energy: 15.15,
  concerto: 18.33,
  offtune: 54645,
  forte1: -120,
  updateDebuffs: () => inflictElectroFlare(10)
};
var Overshock = roverAction2("Forte Skill - Overshock", {
  ...OVERSHOCK,
  updateBuffs: () => applyTeam(OVERSHOCK_ATK, 1),
  cutscene: true
});
var OvershockHold = roverAction2("Forte Skill - Overshock (Hold)", {
  ...OVERSHOCK,
  concerto: 18.33 - 60,
  forte2: 100,
  resetForte2: true,
  updateBuffs: () => applyCurrent(APEX_RESONANCE, 1)
});
var ThrumSpectro1 = roverAction2("Skill - Thrum: Spectro 1", { node: 2, cast: 3, type: 12288, element: 320, mv: 99.12, energy: 0.9, concerto: 3.23, offtune: 7160, forte2: 3.94 });
var ThrumSpectro2 = roverAction2("Skill - Thrum: Spectro 2", { node: 2, cast: 3, type: 12288, element: 320, mv: 163.53, energy: 1.83, concerto: 6.57, offtune: 14580, forte2: 8.03 });
var ThrumSpectro3 = roverAction2("Skill - Thrum: Spectro 3", { node: 2, cast: 3, type: 12288, element: 320, mv: 255.14, energy: 2.17, concerto: 7.77, offtune: 17254, forte2: 9.5 });
var ThrumHavoc1 = roverAction2("Skill - Thrum: Havoc 1", { node: 2, cast: 3, type: 12288, element: 384, mv: 149.76, energy: 2, concerto: 7.18, offtune: 15920, forte2: 8.78 });
var ThrumHavoc2 = roverAction2("Skill - Thrum: Havoc 2", { node: 2, cast: 3, type: 12288, element: 384, mv: 138.3, energy: 2.19, concerto: 7.86, offtune: 17380, forte2: 9.58 });
var ThrumHavoc3 = roverAction2("Skill - Thrum: Havoc 3", { node: 2, cast: 3, type: 12288, element: 384, mv: 208.38, energy: 2.9, concerto: 10.4, offtune: 23046, forte2: 12.7 });
var SilencingBlade = roverAction2("Skill - Thrum: Silencing Blade", { node: 2, cast: 3, type: 12288, element: 64, mv: 470.68, energy: 4.59, concerto: 16.48, offtune: 36568, forte2: 20.16 });
var ThrumAero = roverAction2("Skill - Thrum: Aero", { node: 2, cast: 3, type: 12288, element: 64, mv: 158.09, energy: 1.28, concerto: 4.59, offtune: 10200, forte2: 5.61 });
var ThrumMaHavoc1 = roverAction2("Skill - Thrum: Havoc Mid-air 1", { node: 2, cast: 3, type: 12288, element: 384, mv: 50.63, energy: 0.59, concerto: 2.1, offtune: 4660, forte2: 2.56 });
var ThrumMaHavoc2 = roverAction2("Skill - Thrum: Havoc Mid-air 2", { node: 2, cast: 3, type: 12288, element: 384, mv: 63.82, energy: 0.67, concerto: 2.41, offtune: 5340, forte2: 2.94 });
var ThrumMaHavoc3 = roverAction2("Skill - Thrum: Havoc Mid-air 3", { node: 2, cast: 3, type: 12288, element: 384, mv: 277.3, energy: 2.06, concerto: 7.37, offtune: 16348, forte2: 9 });
var ThrumMaAero1 = roverAction2("Skill - Thrum: Aero Mid-air 1", { node: 2, cast: 3, type: 12288, element: 64, mv: 84.61, energy: 0.81, concerto: 2.89, offtune: 6412, forte2: 3.53 });
var ThrumMaAero2 = roverAction2("Skill - Thrum: Aero Mid-air 2", { node: 2, cast: 3, type: 12288, element: 64, mv: 97.41, energy: 0.89, concerto: 3.19, offtune: 7072, forte2: 3.89 });
var ThrumMaAeroPlunge = roverAction2("Skill - Thrum: Aero Plunge", { node: 2, cast: 3, type: 12288, element: 64, mv: 282.48, energy: 2.08, concerto: 7.48, offtune: 16613, forte2: 9.14 });
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
var Liberation12 = roverAction2("Liberation - Ultimate Tactics", { node: 3, cast: 4, cutscene: true, type: 16384, mv: 1192.86, concerto: 20, offtune: 57600, resetEnergy: true });
var Intro16 = roverAction2("Intro - Thunderous Fury", { node: 4, cast: 5, type: 20480, mv: 167.03, energy: 3, concerto: 20.8, offtune: 9600, forte1: 53 });
var Outro16 = roverAction2("Outro - Rumbling Thunders", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  resetForte2: true,
  updateBuffs: () => queueOutro(ELECTRO_CORE)
});
var APEX_RESONANCE = new Buff({
  name: "Electro Rover: Apex Resonance",
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(APEX_RESONANCE);
  }
});
var OVERSHOCK_ATK = new Buff({
  name: "Electro Rover: Overshock ATK",
  stats: [[6, 10]],
  convertStats: () => {
    if (casting(
      5
      /* Cast.Intro */
    ) && isHeld(ROVER_ELECTRO_RESONATOR))
      revokeTeam(OVERSHOCK_ATK);
  }
});
var ER_INHERENT_1 = new Inherent({ name: "Inherent: Decipher" });
var REGRESSION = new Buff({
  name: "Inherent: Regression",
  stats: [[
    17,
    20,
    12288
    /* Type1.Skill */
  ]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var ER_INHERENT_2 = new Inherent({
  name: "Inherent: Regression",
  updateBuffs: () => {
    if (runningAction(OvershockHold))
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
  stats: [[18, 25]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var ER_S1 = new Sequence({ name: "Electro Rover S1: Celestial Ingenuity" });
var ER_S2 = new Sequence({
  name: "Electro Rover S2: Thousandfold Artifice",
  updateDebuffs: () => {
    if (runningAction(Liberation12))
      inflictElectroFlare(5);
  }
});
var ER_S3 = new Sequence({
  name: "Electro Rover S3: Alchemy of Wonders",
  applyStats: () => {
    if (runningAction(Overshock) || runningAction(OvershockHold))
      addStat(16, 20);
  }
});
var ER_S4 = new Sequence({
  name: "Electro Rover S4: Earthquaking Rumble",
  applyStats: () => {
    if (runningAction(Liberation12))
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
    if (runningAction(ThunderBane) || THRUMS.includes(a))
      addStat(16, 20);
  }
});
var ROVER_ELECTRO_TALENTS = new Talent({
  name: "Electro Rover: Talents",
  stats: [[6, 12], [9, 8]]
});
var ROVER_ELECTRO_RESONATOR = new Resonator({
  name: "Electro Rover",
  talent: ROVER_ELECTRO_TALENTS,
  inherent1: ER_INHERENT_1,
  inherent2: ER_INHERENT_2,
  element: 128,
  weapon: 0,
  intro: () => Intro16,
  outro: () => Outro16,
  color: "#b98ce8",
  maxEnergy: 125,
  maxForte1: 120,
  maxForte2: 100,
  tier: 2,
  updateDebuffs: () => {
    if (runningAction(ThrumMaAero1) || runningAction(ThrumMaAero2))
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
var BA12343 = new ActionGroup("Basic - Deterrence 1234", [BA115, BA215, BA316, BA412]);
var ER_ROTATION = new Rotation([
  INTRO,
  BA12343,
  Skill14,
  Repel,
  Overshock,
  Liberation12,
  ECHO_SWAP,
  OUTRO
]);
var THRUM_SPECTRO = new ActionGroup("Skill - Thrum: Spectro 123", [
  ThrumSpectro1,
  ThrumSpectro2,
  ThrumSpectro3
]);
var THRUM_HAVOC = new ActionGroup("Skill - Thrum: Havoc 123", [
  ThrumHavoc1,
  ThrumHavoc2,
  ThrumHavoc3
]);
var ER_ROTATION_MDPS = new Rotation([
  INTRO,
  BA12343,
  Skill14,
  Repel,
  OvershockHold,
  Liberation12,
  THRUM_SPECTRO,
  THRUM_HAVOC,
  SilencingBlade,
  THRUM_SPECTRO,
  THRUM_HAVOC,
  SilencingBlade,
  ECHO_SWAP,
  OUTRO
]);
var ROVER_ELECTRO = new Loadout({
  resonator: ROVER_ELECTRO_RESONATOR,
  weapons: [EMERALD_OF_GENESIS, BLAZING_BRILLIANCE, RED_SPRING, UNSPOKEN_RUE],
  echoLoadouts: [
    new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
    //new EchoLoadout(STAY_TUNED, ELECTRIC_REFLECTION_5PC),
    new EchoLoadout(SOUL_OF_DESPAIR, ELECTRIC_REFLECTION_5PC),
    new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)
    //new EchoLoadout(SOUL_OF_DESPAIR, SWORN_VIGIL_5PC),
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    11,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Skill, Substat.Er),
  rotation: ER_ROTATION,
  sequences: [
    ER_S1,
    ER_S2,
    ER_S3,
    ER_S4,
    ER_S5,
    ER_S6
  ]
});
var ROVER_ELECTRO_MDPS = new Loadout({
  resonator: ROVER_ELECTRO_RESONATOR,
  weapons: [BLAZING_BRILLIANCE, EMERALD_OF_GENESIS, RED_SPRING, UNSPOKEN_RUE],
  echoLoadouts: [
    new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)
  ],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    11,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Er),
  rotation: ER_ROTATION_MDPS,
  sequences: [ER_S1, ER_S2, ER_S3, ER_S4, ER_S5, ER_S6]
});

// dist/src/resonators/electro/suoming.js
function suomingAction(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var BA116 = suomingAction("Basic - Furled Canopy 1", { node: 0, cast: 1, type: 4096, mv: 31.55, energy: 1.91, concerto: 1.79, offtune: 3174, forte1: 120 });
var BA216 = suomingAction("Basic - Furled Canopy 2", { node: 0, cast: 1, type: 4096, mv: 15.73 * 2 + 31.46, energy: 0.95 * 2 + 1.9, concerto: 0.89 * 2 + 1.78, offtune: 1583 * 2 + 3165, forte1: 40 * 2 + 80 });
var BA317 = suomingAction("Basic - Furled Canopy 3", { node: 0, cast: 1, type: 4096, mv: 22.01 * 3 + 44.02, energy: 1.33 * 3 + 2.66, concerto: 1.25 * 3 + 2.5, offtune: 2214 * 3 + 4428, forte1: 36 * 3 + 72 });
var MA11 = suomingAction("Mid-air - Furled Canopy", { node: 0, cast: 1, type: 4096, mv: 84.2, energy: 5.09, concerto: 4.77, offtune: 8470 });
var DC13 = suomingAction("Dodge Counter - Furled Canopy", { node: 0, cast: 0, type: 4096, mv: 27.66 * 2 + 55.32, energy: 1.67 * 2 + 3.34, concerto: 1.57 * 2 + 3.13 + 10, offtune: 2783 * 2 + 5565, forte1: 160 });
var UBA1 = suomingAction("Basic - Unfurled Canopy 1", { node: 0, cast: 1, type: 4096, mv: 65.42 + 32.71 * 2, energy: 1.58 + 0.79 * 2, concerto: 2 + 1 * 2, offtune: 3949 + 1975 * 2, forte1: 60 + 30 * 2 });
var UBA2 = suomingAction("Basic - Unfurled Canopy 2", { node: 0, cast: 1, type: 4096, mv: 114.4 + 38.14 * 3, energy: 2.77 + 0.93 * 3, concerto: 2 + 0.67 * 3, offtune: 5705 + 1902 * 3, forte1: 80 + 27 * 3 });
var UBA3 = suomingAction("Basic - Unfurled Canopy 3", { node: 0, cast: 1, type: 4096, mv: 58.64 * 4, energy: 1.42 * 4, concerto: 3.75 * 4, offtune: 3540 * 4, forte1: 45 * 4 });
var UBA4 = suomingAction("Basic - Unfurled Canopy 4", { node: 0, cast: 1, type: 4096, mv: 107.25 * 2 + 143, energy: 2.59 * 2 + 3.46, concerto: 4.5 * 2 + 6, offtune: 6474 * 2 + 8632, forte1: 54 * 2 + 72 });
var UHA1 = suomingAction("Heavy - Unfurled Canopy: Whirling Thunder 1", { node: 0, cast: 2, type: 4096, mv: 73.32 * 3 + 36.66 * 2, energy: 1.77 * 3 + 0.89 * 2, concerto: 3.75 * 3 + 1.88 * 2, offtune: 4425 * 3 + 2213 * 2, forte1: 45 * 3 + 23 * 2 });
var UHA2 = suomingAction("Heavy - Unfurled Canopy: Whirling Thunder 2", { node: 0, cast: 2, type: 4096, mv: 56.69 * 5, energy: 1.37 * 5, concerto: 3 * 5, offtune: 3422 * 5, forte1: 36 * 5 });
var UDC = suomingAction("Dodge Counter - Unfurled Canopy", { node: 0, cast: 0, type: 4096, mv: 174.04 + 58.02 * 3, energy: 4.21 + 1.41 * 3, concerto: 3.94 + 1.32 * 3 + 10, offtune: 7004 + 2335 * 3, forte1: 80 + 27 * 3 });
var RiftCleaver = suomingAction("Skill - Furled Canopy: Rift Cleaver", {
  node: 1,
  cast: 3,
  type: 12288,
  mv: 106.61,
  energy: 3.68,
  concerto: 3.45,
  offtune: 6128,
  updateBuffs: () => {
    if (!isHeld(UNISON))
      return;
    addStat(27, -20);
    setForte1(0);
    revokeCurrent(UNISON);
    if (!isHeld(ALIGNED_SEALS))
      applyCurrent(SEAL_MASTER, 1);
  }
});
var CrimsonGleamParry = suomingAction("Skill - Unfurled Canopy: Crimson Gleam", { node: 1, cast: 3, type: 12288, mv: 47.25 + 23.63 * 2 + 63, energy: 1.63 + 0.82 * 2 + 2.18, concerto: 1.53 + 0.77 * 2 + 2.04, offtune: 2717 + 1359 * 2 + 3622 });
var Liberation13 = suomingAction("Liberation - Umbral Canopy: Miasma Lock", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 69.59 * 7 + 208.76,
  concerto: 20,
  offtune: 8400 * 7 + 25200,
  forte1: 200,
  resetEnergy: true,
  updateBuffs: () => {
    applyCurrent(UNISON, 1);
  }
});
var BLIGHT_RAIN_FIELD = new ActionField("Suoming: Blight Rain, Miasmic Thunder");
var ThunderCrest = suomingAction("Liberation - Blight Rain, Miasmic Thunder", {
  type: 16384,
  type2: 262144,
  mv: 59.65,
  field: BLIGHT_RAIN_FIELD
});
var INTRO_FURLED = { node: 4, cast: 5, resetForte1: true, type: 4096, mv: 110.89 * 2 + 36.97 * 4, energy: 3 * 2 + 1 * 4, concerto: 1.5 * 2 + 0.5 * 4 + 10, offtune: 5578 * 2 + 1860 * 4 };
var IntroFlashRift = suomingAction("Intro - Furled Canopy: Flash Rift", {
  ...INTRO_FURLED,
  updateBuffs: () => applyCurrent(DEEP_MIND, 1)
});
var IntroSealedDelusion = suomingAction("Intro - Furled Canopy: Sealed Delusion (Unison)", {
  ...INTRO_FURLED,
  updateDebuffs: respondToUnison,
  updateBuffs: () => applyCurrent(DEEP_MIND, 1)
});
var INTRO_UNFURLED = { node: 4, cast: 5, type: 4096, mv: 131.43 * 3 + 65.72 * 2, energy: 2.5 * 3 + 1.25 * 2, concerto: 10, offtune: 4407 * 3 + 2204 * 2, forte1: 200 };
var IntroThunderRending = suomingAction("Intro - Unfurled Canopy: Thunder Rending", INTRO_UNFURLED);
var IntroWhirlingThunder = suomingAction("Intro - Unfurled Canopy: Whirling Thunder (Unison)", { ...INTRO_UNFURLED, updateDebuffs: respondToUnison });
var INTROS2 = [IntroFlashRift, IntroThunderRending, IntroSealedDelusion, IntroWhirlingThunder];
var SealedDelusion = suomingAction("Forte Skill - Furled Canopy: Sealed Delusion", {
  node: 2,
  cast: 3,
  type: 4096,
  mv: 62.78 * 2 + 31.39 * 4,
  energy: 2.17 * 2 + 1.09 * 4,
  concerto: 2.03 * 2 + 1.02 * 4,
  offtune: 3609 * 2 + 1805 * 4,
  // only fires at a full 800 Delusion — maxForte1 (800) clamps an overrun back to the cap before
  // this lands exactly on 0, same as Engraved Heart's own -800
  forte1: -800,
  updateBuffs: () => applyCurrent(DEEP_MIND, 1)
});
var UnforsakenMind = suomingAction("Skill - Unfurled Canopy: Unforsaken Mind", { node: 2, cast: 3, type: 4096, mv: 152.67, offtune: 8776 });
var EngravedHeart = suomingAction("Forte Basic - Umbral Canopy: Engraved Heart", {
  node: 2,
  cast: 1,
  type: 4096,
  mv: 1939.29,
  energy: 20.49,
  concerto: 25,
  offtune: 26016,
  forte1: -800,
  updateBuffs: () => revokeCurrent(DEEP_MIND)
});
var Outro17 = suomingAction("Outro - Canopy Rumble", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => {
    queueOutro(CANOPY_RUMBLE);
    if (isHeld(UNISON)) {
      applyCurrent(ALIGNED_SEALS, 1);
      revokeCurrent(SEAL_MASTER);
      applyTeam(BLIGHT_RAIN, 8);
    }
    if (isHeld(ALIGNED_SEALS))
      queueOutro(ALIGNED_SEALS_HANDOFF);
  }
});
var OutroUnison2 = unisonOutro(Outro17);
var DEEP_MIND = new Buff({ name: "Suoming: Deep Mind" });
var RAIN_SOAKED_COVENANT = new Buff({
  name: "Suoming: Rain-Soaked Covenant",
  updateBuffs: () => lostOnSwap(),
  stats: [[
    17,
    50,
    128
    /* Attribute.Electro */
  ]]
});
var RAIN_SOAKED_INHERENT = new Inherent({
  name: "Inherent: Rain-Soaked Covenant",
  updateBuffs: () => {
    if (INTROS2.includes(currentAction()))
      applyCurrent(RAIN_SOAKED_COVENANT, 1);
  },
  applyStats: () => {
    if (runningAction(IntroSealedDelusion) || runningAction(IntroWhirlingThunder))
      addStat(27, 10);
  }
});
var SEAL_MASTER = new Buff({
  name: "Suoming: Seal Master",
  updateBuffs: () => {
    lostOnSwap();
    if (isHeld(UNISON) && casting(
      4
      /* Cast.Liberation */
    ))
      revokeCurrent(SEAL_MASTER);
  },
  applyStats: () => {
    if (runningAction(UBA1) || runningAction(UBA2) || runningAction(UBA3) || runningAction(UBA4) || runningAction(UHA1) || runningAction(UHA2))
      addStat(16, 40);
    addStat(10, 80);
  }
});
var ALIGNED_SEALS = new Buff({ name: "Suoming: Aligned Seals" });
var SUNKEN_SEAL = new Inherent({ name: "Inherent: Sunken Seal, Forged Lock" });
var CANOPY_RUMBLE = new Buff({
  name: "Suoming: Outro",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => {
    addStat(
      18,
      20,
      128
      /* Attribute.Electro */
    );
    if (stacksOfTeam(UNISON_BOON))
      addStat(
        18,
        25,
        12288
        /* Type1.Skill */
      );
  }
});
var ALIGNED_SEALS_HANDOFF = new Buff({
  name: "Suoming: Outro (aligned)",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(
    17,
    30 + Math.min(40, 20 * stacksOfTeam(UNISON_BOON)),
    128
    /* Attribute.Electro */
  )
});
var BLIGHT_RAIN = coordinatedBuff("Suoming: Blight Rain, Miasmic Thunder", 8, () => SUOMING_RESONATOR, ThunderCrest, { every: 4 / 3 });
var BOON_RESPONSE = new Buff({ name: "Suoming: Unison Boon (response)" });
var SM_S1 = new Sequence({
  name: "Suoming S1: Into the Blight Rain",
  applyStats: () => {
    if (INTROS2.includes(currentAction()))
      addStat(16, 60);
  }
});
var BREAKING_THUNDER_HANDOFF = new Buff({
  name: "Suoming S2: Outro",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => addStat(10, 10 + Math.min(24, 6 * stacksOfTeam(UNISON_BOON)))
});
var SM_S2 = new Sequence({
  name: "Suoming S2: Breaking Thunder, Slaying Evil",
  stats: [[10, 40]],
  updateBuffs: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      queueOutro(BREAKING_THUNDER_HANDOFF);
  }
});
var LONE_CANOPY = new Buff({
  name: "Suoming S3: Lone Canopy, Solitary Road",
  stats: [[
    18,
    30,
    4096
    /* Type1.Basic */
  ]]
});
var SM_S3 = new Sequence({
  name: "Suoming S3: Lone Canopy, Solitary Road",
  updateBuffs: () => {
    if ((runningAction(IntroFlashRift) || runningAction(IntroThunderRending)) && !isHeld(BOON_RESPONSE)) {
      applyTeam(UNISON_BOON, 1);
      applyCurrent(BOON_RESPONSE, 1);
    }
    if (casting(
      4
      /* Cast.Liberation */
    ))
      applyCurrent(LONE_CANOPY, 1);
  }
});
var SM_S4 = new Sequence({
  name: "Suoming S4: Covenant Borne Upon the Heart",
  stats: [[6, 20]]
});
var SM_S5 = new Sequence({
  name: "Suoming S5: Seal Deep, Never Forgotten",
  applyStats: () => {
    if (runningAction(Liberation13))
      addStat(16, 40);
  }
});
var SM_S6 = new Sequence({
  name: "Suoming S6: Nine Shadows at Her Side",
  combatStart: () => applyTeam(NINE_SHADOWS, 1),
  applyStats: () => {
    if (runningAction(EngravedHeart))
      addStat(16, 50);
    if (isHeld(SEAL_MASTER))
      addStat(10, 80);
  }
});
var SM_SEQUENCES = [SM_S1, SM_S2, SM_S3, SM_S4, SM_S5, SM_S6];
var SUOMING_TALENTS = new Talent({
  name: "Suoming: Talents",
  stats: [[6, 12], [9, 8]]
});
var SUOMING_RESONATOR = new Resonator({
  name: "Suoming",
  talent: SUOMING_TALENTS,
  inherent1: RAIN_SOAKED_INHERENT,
  inherent2: SUNKEN_SEAL,
  element: 128,
  weapon: 0,
  // which state she is in, and whether the outro she answers was a Unison one — read off the
  // queue, since the handoff is adopted only once the Intro row itself is evaluated
  intro: () => isHeld(DEEP_MIND) ? unisonIntro() ? IntroWhirlingThunder : IntroThunderRending : unisonIntro() ? IntroSealedDelusion : IntroFlashRift,
  outro: () => isHeld(UNISON) ? OutroUnison2 : Outro17,
  color: "#ea5d64",
  maxEnergy: 125,
  maxForte1: 800,
  // Unison Response: the team's Unison Boon, one stack from her, refreshed after the first
  updateBuffs: () => {
    if (unisonResponse() && !isHeld(BOON_RESPONSE)) {
      applyTeam(UNISON_BOON, 1);
      applyCurrent(BOON_RESPONSE, 1);
    }
  },
  // she can trigger Unison Response, so Unison Boon pays her (shared/unison.ts)
  combatStart: () => applyCurrent(UNISON_RESPONDER, 1),
  constantStats: () => {
    addStat(1, 10300);
    addStat(0, 462.5);
    addStat(2, 1148.89);
  }
});
var UBA234 = new ActionGroup("Basic - Unfurled Canopy 234", [UBA2, UBA3, UBA4]);
var UBA34 = new ActionGroup("Basic - Unfurled Canopy 34", [UBA3, UBA4]);
var UBA12 = new ActionGroup("Basic - Unfurled Canopy 12", [UBA1, UBA2]);
var UBA1234 = new ActionGroup("Basic - Unfurled Canopy 1234", [UBA1, UBA2, UBA3, UBA4]);
var BA1233 = new ActionGroup("Basic - Furled Canopy 123", [BA116, BA216, BA317]);
var SM_ROTATION = new Rotation([
  NOINTRO,
  BA1233,
  BA1233,
  SealedDelusion,
  DOUBLE_INTRO,
  Liberation13,
  OUTRO,
  INTRO,
  UHA2,
  UBA12,
  UnforsakenMind,
  EngravedHeart,
  ECHO_SWAP,
  OUTRO
]);
var SM_ROTATION_MDPS = new Rotation([
  INTRO,
  Liberation13,
  RiftCleaver,
  UBA34,
  DODGE,
  UBA1234,
  DODGE,
  UBA12,
  UnforsakenMind,
  EngravedHeart,
  ECHO_SWAP,
  OUTRO
]);
var SM_ECHOES = [
  new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)
  //new EchoLoadout(SOUL_OF_DESPAIR, SWORN_VIGIL_5PC),
];
var SUOMING = new Loadout({
  resonator: SUOMING_RESONATOR,
  weapons: [UNSPOKEN_RUE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: SM_ECHOES,
  mainstats: mainstatOptions(
    0,
    1,
    6,
    11,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Basic, Substat.Er, Substat.FlatAtk),
  sequences: SM_SEQUENCES,
  rotation: SM_ROTATION
});
var SUOMING_MDPS = new Loadout({
  resonator: SUOMING_RESONATOR,
  weapons: [UNSPOKEN_RUE, EMERALD_OF_GENESIS, RED_SPRING],
  echoLoadouts: [new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    11,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Er),
  sequences: SM_SEQUENCES,
  rotation: SM_ROTATION_MDPS
});

// dist/src/resonators/electro/xiangli_yao.js
function xlyAction(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var BA117 = xlyAction("Basic - Probe 1", { node: 0, cast: 1, type: 4096, mv: 33.11 * 2, energy: 0.84, concerto: 1.68, offtune: 2664, forte1: 8 });
var BA217 = xlyAction("Basic - Probe 2", { node: 0, cast: 1, type: 4096, mv: 99.61, energy: 1.26, concerto: 2.51, offtune: 4008, forte1: 14 });
var BA318 = xlyAction("Basic - Probe 3", { node: 0, cast: 1, type: 4096, mv: 39.76 * 3, energy: 1.5, concerto: 3, offtune: 4800, forte1: 15 });
var BA413 = xlyAction("Basic - Probe 4", { node: 0, cast: 1, type: 4096, mv: 53.05 * 2 + 26.53, energy: 1.68, concerto: 3.35, offtune: 5338, forte1: 18 });
var BA52 = xlyAction("Basic - Probe 5", { node: 0, cast: 1, type: 4096, mv: 198.81, energy: 2.5, concerto: 5, offtune: 8e3, forte1: 20 });
var HA12 = xlyAction("Heavy - Probe", { node: 0, cast: 2, type: 8192, mv: 82.81 * 2, energy: 2.1, concerto: 4.18, offtune: 6664, forte1: 18 });
var MA15 = xlyAction("Mid-air - Probe", { node: 0, cast: 1, type: 4096, mv: 123.27, energy: 0.52, concerto: 1, offtune: 4960, forte1: 13 });
var DC14 = xlyAction("Dodge Counter - Probe", { node: 0, cast: 0, type: 4096, mv: 238.58, energy: 2.75, concerto: 12.5, offtune: 4e3, forte1: 26 });
var Skill15 = xlyAction("Skill - Deduction", { node: 1, cast: 3, type: 12288, mv: 198.81, energy: 6.25, concerto: 7, offtune: 4e3, forte1: 40 });
var FSkill4 = xlyAction("Forte Skill - Decipher", { node: 2, cast: 3, type: 16384, mv: 397.82, energy: 1.67, concerto: 7, offtune: 5336, forte1: -100 });
var Liberation14 = xlyAction("Liberation - Cogitation Model", { node: 3, cast: 4, cutscene: true, type: 16384, mv: 1466.06, concerto: 20, offtune: 67200, resetEnergy: true });
var UBA13 = xlyAction("Basic - Pivot: Impale 1", { node: 3, cast: 1, type: 4096, mv: 119.67, energy: 1.31, concerto: 2.62, offtune: 4192, forte2: 1 });
var UBA22 = xlyAction("Basic - Pivot: Impale 2", { node: 3, cast: 1, type: 4096, mv: 60.92 * 4, energy: 2.68, concerto: 5.36, offtune: 8536, forte2: 2 });
var UBA32 = xlyAction("Basic - Pivot: Impale 3", { node: 3, cast: 1, type: 4096, mv: 133.25 * 2, energy: 2.92, concerto: 5.84, offtune: 9336, forte2: 2 });
var USkill2 = xlyAction("Skill - Divergence", { node: 3, cast: 3, type: 12288, mv: 49.59 * 3 + 173.55 * 2, energy: 9.94, concerto: 15, offtune: 9316, forte2: 2 });
var UDC2 = xlyAction("Dodge Counter - Unfathomed", { node: 3, cast: 0, type: 16384, mv: 38.83 * 2 + 310.58, energy: 4, concerto: 15, offtune: 8e3, forte2: 2 });
var UForte = xlyAction("Forte Skill - Law of Reigns", { node: 2, cast: 3, type: 16384, mv: 95.73 * 4 + 255.28, energy: 4.78, concerto: 10, offtune: 45600, forte2: -5 });
var FBA6 = xlyAction("Mid-air - Revamp", { node: 2, cast: 1, type: 16384, mv: 21.87 * 4 + 65.61 * 2, energy: 2.78, concerto: 5, offtune: 8800, forte2: 3 });
var ConvolutionMatrices = xlyAction("Forte Skill - Convolution Matrices (S1)", { node: 2, type: 16384, mv: 51.06 * 6 });
var Intro17 = xlyAction("Intro - Principle", { node: 4, cast: 5, type: 20480, mv: 99.41 * 2, energy: 10, concerto: 10, offtune: 11200 });
var Outro18 = xlyAction("Outro - Chain Rule", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  // queued three times so the adopter picks the buff up at all three charges
  updateBuffs: () => {
    queueOutro(XLY_OUTRO);
    queueOutro(XLY_OUTRO);
    queueOutro(XLY_OUTRO);
  }
});
var CHAIN_RULE_FIELD = new ActionField("Xiangli Yao: Chain Rule");
var ACTION_OUTRO_COORD2 = xlyAction("Outro - Chain Rule (Laser)", { type: 24576, mv: 237.63, field: CHAIN_RULE_FIELD });
var KNOWING = new Buff({
  name: "Inherent: Knowing",
  maxStacks: 4,
  stats: [[
    17,
    5,
    128
    /* Attribute.Electro */
  ]],
  perStack: true,
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(KNOWING);
  }
});
var XLY_INHERENT_1 = new Inherent({
  name: "Inherent: Knowing",
  updateBuffs: () => {
    if (casting(
      3
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
    )) {
      queueOn(XIANGLI_YAO_RESONATOR, ACTION_OUTRO_COORD2);
      removeStack(XLY_OUTRO, 1);
    }
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(XLY_OUTRO);
  }
});
var XLY_TALENTS = new Talent({
  name: "Xiangli Yao: Talents",
  stats: [[10, 16], [6, 12]]
});
var XIANGLI_YAO_RESONATOR = new Resonator({
  name: "Xiangli Yao",
  matrix: matrix("Xiangli Yao", 25),
  talent: XLY_TALENTS,
  inherent1: XLY_INHERENT_1,
  inherent2: XLY_INHERENT_2,
  element: 128,
  weapon: 3,
  intro: () => Intro17,
  outro: () => Outro18,
  color: "#6b74e8",
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 5,
  constantStats: () => {
    addStat(1, 10625);
    addStat(0, 425);
    addStat(2, 1222.22);
  }
});
var XLY_S1 = new Sequence({
  name: "Xiangli Yao S1: Prodigy of Prot\xE9g\xE9s",
  updateBuffs: () => {
    if (runningAction(UForte))
      queue(ConvolutionMatrices);
  }
});
var TRACES_OF_PREDECESSORS = new Buff({
  name: "Xiangli Yao S2: Traces of Predecessors",
  stats: [[10, 30]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(TRACES_OF_PREDECESSORS);
  }
});
var XLY_S2 = new Sequence({
  name: "Xiangli Yao S2: Traces of Predecessors",
  updateBuffs: () => {
    if (casting(
      3
      /* Cast.Skill */
    ) || runningAction(Liberation14))
      applyCurrent(TRACES_OF_PREDECESSORS, 1);
  }
});
var RUINS_OF_ANCIENT = new Buff({
  name: "Xiangli Yao S3: Ruins of Ancient",
  maxStacks: 5,
  applyStats: () => {
    if (RUINS_PAYS.has(currentAction()))
      addStat(17, 63);
  },
  convertStats: () => {
    if (RUINS_PAYS.has(currentAction()))
      removeStack(RUINS_OF_ANCIENT, 1);
  }
});
var RUINS_PAYS = /* @__PURE__ */ new Set([FSkill4, Skill15, USkill2, UForte]);
var XLY_S3 = new Sequence({
  name: "Xiangli Yao S3: Ruins of Ancient",
  updateBuffs: () => {
    if (runningAction(Liberation14))
      applyCurrent(RUINS_OF_ANCIENT, 5);
  }
});
var VESSEL_OF_REBIRTH = new Buff({
  name: "Xiangli Yao S4: Vessel of Rebirth",
  stats: [[
    17,
    25,
    16384
    /* Type1.Liberation */
  ]]
});
var XLY_S4 = new Sequence({
  name: "Xiangli Yao S4: Vessel of Rebirth",
  updateBuffs: () => {
    if (runningAction(Liberation14))
      applyTeam(VESSEL_OF_REBIRTH, 1);
  }
});
var XLY_S5 = new Sequence({
  name: "Xiangli Yao S5: End of Stars",
  applyStats: () => {
    if (runningAction(ACTION_OUTRO_COORD2))
      addStat(16, 222);
    if (runningAction(Liberation14))
      addStat(16, 100);
  }
});
var XLY_S6 = new Sequence({
  name: "Xiangli Yao S6: Solace of the Ordinary",
  applyStats: () => {
    if (runningAction(UForte) || runningAction(ConvolutionMatrices))
      addStat(16, 76);
  }
});
var XLY_SEQUENCES = [XLY_S1, XLY_S2, XLY_S3, XLY_S4, XLY_S5, XLY_S6];
var UBA123 = new ActionGroup("Basic - Pivot: Impale 123", [UBA13, UBA22, UBA32]);
var XLY_ROTATION = new Rotation([
  INTRO,
  Skill15,
  Skill15,
  // TODO swapped
  Liberation14,
  USkill2,
  FBA6,
  UForte,
  UBA123,
  UForte,
  USkill2,
  FBA6,
  UForte,
  ECHO_SWAP,
  OUTRO
]);
var XIANGLI_YAO = new Loadout({
  resonator: XIANGLI_YAO_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Er),
  rotation: XLY_ROTATION,
  sequences: XLY_SEQUENCES
});

// dist/src/resonators/electro/yinlin.js
function yinlinAction(id, def2) {
  return new Action(id, { element: 128, scaling: 0, ...def2 });
}
var BA118 = yinlinAction("Basic - Zapstring's Dance 1", { node: 0, cast: 1, type: 4096, mv: 28.81, energy: 0.6, concerto: 2, offtune: 3144, forte1: 2.5 });
var BA218 = yinlinAction("Basic - Zapstring's Dance 2", { node: 0, cast: 1, type: 4096, mv: 33.82 * 2, energy: 1.5, concerto: 5, offtune: 6152, forte1: 2.5 });
var BA319 = yinlinAction("Basic - Zapstring's Dance 3", { node: 0, cast: 1, type: 4096, mv: 13.99 * 7, energy: 2.45, concerto: 7, offtune: 7147, forte1: 7.5 });
var BA414 = yinlinAction("Basic - Zapstring's Dance 4", { node: 0, cast: 1, type: 4096, mv: 75.16, energy: 1.5, concerto: 6, offtune: 4976, forte1: 10 });
var HA13 = yinlinAction("Heavy - Zapstring's Dance", { node: 0, cast: 2, type: 8192, mv: 29.83 * 2, energy: 1.8, concerto: 4.5, offtune: 9392, forte1: 20 });
var MA16 = yinlinAction("Mid-air - Zapstring's Dance", { node: 0, cast: 1, type: 4096, mv: 123.27, energy: 0.51, concerto: 5, offtune: 4960, forte1: 5 });
var DC15 = yinlinAction("Dodge Counter - Zapstring's Dance", { node: 0, cast: 0, type: 4096, mv: 24.22 * 7, energy: 3.99, concerto: 17, offtune: 11746 });
var Skill16 = yinlinAction("Skill - Magnetic Roar", {
  node: 1,
  cast: 3,
  type: 12288,
  mv: 59.65 * 3,
  energy: 15,
  concerto: 10,
  offtune: 6666,
  forte1: 30,
  updateBuffs: () => setStacksSelf(EXECUTION_MODE, 4)
});
var Skill23 = yinlinAction("Skill - Lightning Execution", { node: 1, cast: 3, type: 12288, mv: 89.47 * 4, energy: 15, concerto: 15, offtune: 5328, forte1: 10 });
var ACTION_BLAST = yinlinAction("Skill - Electromagnetic Blast", { node: 1, type: 12288, mv: 19.89, concerto: 5, forte1: 5 });
var Liberation15 = yinlinAction("Liberation - Thundering Wrath", { node: 3, cast: 4, cutscene: true, type: 16384, mv: 116.56 * 7, concerto: 20, offtune: 36001, resetEnergy: true });
var FHA7 = yinlinAction("Forte Heavy - Chameleon Cipher", {
  node: 2,
  cast: 2,
  type: 8192,
  mv: 178.93 * 2,
  energy: 10,
  concerto: 20,
  offtune: 52e3,
  forte1: -100,
  updateBuffs: () => {
    if (stacksOfEnemy(SINNERS_MARK)) {
      revokeEnemy(SINNERS_MARK);
      applyEnemy(PUNISHMENT_MARK, 18);
    }
  }
});
var PUNISHMENT_FIELD = new ActionField("Yinlin: Punishment Mark");
var ACTION_JUDGMENT_STRIKE = yinlinAction("Forte - Judgment Strike", { node: 2, type: 12288, type2: 262144, mv: 78.64, field: PUNISHMENT_FIELD });
var FuriousThunder = yinlinAction("Skill - Furious Thunder (S6)", { node: 1, type: 12288, mv: 419.59 });
var Intro18 = yinlinAction("Intro - Raging Storm", { node: 4, cast: 5, type: 20480, mv: 14.32 * 10, energy: 10, concerto: 10, offtune: 9520, forte1: 30 });
var Outro19 = yinlinAction("Outro - Strategist", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(YINLIN_OUTRO)
});
var SINNERS_MARK = new Debuff({
  name: "Yinlin: Sinner's Mark",
  updateBuffs: () => {
    if (currentAction().swapOut && isHeld(YINLIN_RESONATOR))
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
      0
      /* Cast.DodgeCounter */
    )) && stacksOfEnemy(SINNERS_MARK)) {
      queue(ACTION_BLAST);
      removeStack(EXECUTION_MODE, 1);
    }
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(EXECUTION_MODE);
  }
});
var PAIN_IMMERSION = new Buff({
  name: "Inherent: Pain Immersion",
  stats: [[9, 15]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(PAIN_IMMERSION);
  }
});
var YL_INHERENT_1 = new Inherent({
  name: "Inherent: Pain Immersion",
  updateBuffs: () => {
    if (runningAction(Skill16))
      applyCurrent(PAIN_IMMERSION, 1);
  }
});
var DEADLY_FOCUS = new Buff({
  name: "Inherent: Deadly Focus",
  stats: [[6, 10]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(DEADLY_FOCUS);
  }
});
var YL_INHERENT_2 = new Inherent({
  name: "Inherent: Deadly Focus",
  updateBuffs: () => {
    if (runningAction(Skill23) && stacksOfEnemy(SINNERS_MARK))
      applyCurrent(DEADLY_FOCUS, 1);
  },
  applyStats: () => {
    if (runningAction(Skill23) && stacksOfEnemy(SINNERS_MARK))
      addStat(17, 10);
  }
});
var YINLIN_OUTRO = new Buff({
  name: "Yinlin: Outro",
  stats: [[
    18,
    20,
    128
    /* Attribute.Electro */
  ], [
    18,
    25,
    16384
    /* Type1.Liberation */
  ]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var YINLIN_TALENTS = new Talent({
  name: "Yinlin: Talents",
  stats: [[9, 8], [6, 12]]
});
var YINLIN_MATRIX = matrix("Yinlin", 20, {
  updateBuffs: () => {
    if (casting(
      4
      /* Cast.Liberation */
    ))
      applyTeam(YINLIN_MATRIX_TEAM);
  }
});
var YINLIN_RESONATOR = new Resonator({
  name: "Yinlin",
  matrix: YINLIN_MATRIX,
  talent: YINLIN_TALENTS,
  inherent1: YL_INHERENT_1,
  inherent2: YL_INHERENT_2,
  element: 128,
  weapon: 4,
  intro: () => Intro18,
  outro: () => Outro19,
  color: "#a45ee8",
  maxEnergy: 125,
  maxForte1: 100,
  updateBuffs: () => {
    if (casting(
      1
      /* Cast.Basic */
    ) || casting(
      0
      /* Cast.DodgeCounter */
    ) || casting(
      5
      /* Cast.Intro */
    ) || runningAction(Liberation15)) {
      applyEnemy(SINNERS_MARK, 1);
    }
  },
  constantStats: () => {
    addStat(1, 11e3);
    addStat(0, 400);
    addStat(2, 1283.33);
  }
});
var YL_S1 = new Sequence({
  name: "Yinlin S1: Morality's Crossroads",
  applyStats: () => {
    if (runningAction(Skill16) || runningAction(Skill23))
      addStat(17, 70);
  }
});
var YL_S2 = new Sequence({
  name: "Yinlin S2: Ensnarled by Rapport",
  applyStats: () => {
    if (!runningAction(ACTION_BLAST))
      return;
    addStat(26, 5);
    addStat(30, 5);
  }
});
var YL_S3 = new Sequence({
  name: "Yinlin S3: Unyielding Verdict",
  applyStats: () => {
    if (runningAction(ACTION_JUDGMENT_STRIKE))
      addStat(16, 55);
  }
});
var STEADFAST_CONVICTION = new Buff({ name: "Yinlin S4: Steadfast Conviction", stats: [[6, 20]] });
var YL_S4 = new Sequence({
  name: "Yinlin S4: Steadfast Conviction",
  updateBuffs: () => {
    if (runningAction(ACTION_JUDGMENT_STRIKE))
      applyTeam(STEADFAST_CONVICTION, 1);
  }
});
var YL_S5 = new Sequence({
  name: "Yinlin S5: Resounding Will",
  applyStats: () => {
    if (!runningAction(Liberation15))
      return;
    if (stacksOfEnemy(SINNERS_MARK) || stacksOfEnemy(PUNISHMENT_MARK))
      addStat(17, 100);
  }
});
var PURSUIT_OF_JUSTICE = new Buff({
  name: "Yinlin S6: Pursuit of Justice",
  maxStacks: 4,
  updateBuffs: () => {
    if (!casting(
      1
      /* Cast.Basic */
    ) || frozenStacks() <= 0)
      return;
    removeStack(PURSUIT_OF_JUSTICE, 1);
    queue(FuriousThunder);
  }
});
var YL_S6 = new Sequence({
  name: "Yinlin S6: Pursuit of Justice",
  updateBuffs: () => {
    if (runningAction(Liberation15))
      applyCurrent(PURSUIT_OF_JUSTICE, 4);
  }
});
var YL_SEQUENCES = [YL_S1, YL_S2, YL_S3, YL_S4, YL_S5, YL_S6];
var BA12344 = new ActionGroup("Basic - Zapstring's Dance 1234", [BA118, BA218, BA319, BA414]);
var YL_ROTATION = new Rotation([
  INTRO,
  Skill16,
  Liberation15,
  BA12344,
  Skill23,
  FHA7,
  ECHO_SWAP,
  OUTRO
]);
var YINLIN_MATRIX_TEAM = new Buff({
  name: "Yinlin: Matrix Buff",
  stats: [[
    17,
    30,
    16384
    /* Type1.Liberation */
  ]]
});
var YINLIN = new Loadout({
  resonator: YINLIN_RESONATOR,
  weapons: [STRINGMASTER, COSMIC_RIPPLES, LETHEAN_ELEGY, NEW_STD_RECTIFIER],
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
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Skill, Substat.Er, Substat.FlatAtk),
  rotation: YL_ROTATION,
  sequences: YL_SEQUENCES
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
var AHA1 = aemeathAction("Heavy - Aemeath: Charged I", { node: 0, cast: 2, type: 16384, mv: 92.83, energy: 1.68, concerto: 3.34, offtune: 5337 });
var AHA2 = aemeathAction("Heavy - Aemeath: Charged II", { node: 0, cast: 2, type: 16384, mv: 232, energy: 4.18, concerto: 8.35, offtune: 13337 });
var AMA = aemeathAction("Mid-air - Aemeath", { node: 0, cast: 1, type: 4096, mv: 86.29, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 11.71 });
var ADC = aemeathAction("Dodge Counter - Aemeath", { node: 0, cast: 0, type: 4096, mv: 260.15, energy: 3.19, concerto: 16.37, offtune: 10155, forte1: 28.99 });
var MBA1 = aemeathAction("Basic - Mech 1", { node: 0, cast: 1, type: 4096, mv: 69.6, energy: 1.26, concerto: 2.52, offtune: 4002, forte1: 6.45 });
var MBA2 = aemeathAction("Basic - Mech 2", { node: 0, cast: 1, type: 4096, mv: 92.83, energy: 1.68, concerto: 3.34, offtune: 5337, forte1: 9.6 });
var MBA3 = aemeathAction("Basic - Mech 3", { node: 0, cast: 1, type: 4096, mv: 116.53, energy: 2.1, concerto: 4.19, offtune: 6702, forte1: 19.88 });
var MBA4 = aemeathAction("Basic - Mech 4", { node: 0, cast: 1, type: 4096, mv: 134.59, energy: 2.43, concerto: 4.85, offtune: 7737, forte1: 23.28, ...DUO });
var MHA1 = aemeathAction("Heavy - Mech: Charged I", { node: 0, cast: 2, type: 16384, mv: 92.83, energy: 1.67, concerto: 3.34, offtune: 5336 });
var MHA2 = aemeathAction("Heavy - Mech: Charged II", { node: 0, cast: 2, type: 16384, mv: 232, energy: 4.17, concerto: 8.34, offtune: 13336 });
var MDC4 = aemeathAction("Dodge Counter - Mech", { node: 0, cast: 0, type: 4096, mv: 283.49, energy: 3.6, concerto: 17.19, offtune: 11502, forte1: 32.2 });
var ArmamentMerge = aemeathAction("Skill - Sync Strike: Armament Merge", { node: 1, cast: 3, type: 12288, mv: 134.59, energy: 2.43, concerto: 4.85, offtune: 7737, forte1: 18.29, ...TO_MECH });
var CallOfDawn = aemeathAction("Skill - Sync Strike: Call of Dawn", { node: 1, cast: 3, type: 12288, mv: 163.27, energy: 2.96, concerto: 5.88, offtune: 9386, forte1: 22.18, ...TO_AEMEATH });
var DUET = { node: 2, cast: 3, type: 16384, forte1: -100, forte2: 1 };
var AmyFSkill = aemeathAction("Forte - Seraphic Duet: Overture", { ...DUET, mv: 357.95, energy: 5.05, concerto: 10.04, offtune: 16004, ...TO_MECH });
var MechFSkill = aemeathAction("Forte - Seraphic Duet: Encore", { ...DUET, mv: 357.9, energy: 5, concerto: 10, offtune: 16e3, ...TO_AEMEATH });
var isDuet = () => runningAction(AmyFSkill) || runningAction(MechFSkill);
var Lib14 = aemeathAction("Liberation - Heavenfall Edict: Overdrive", {
  node: 3,
  cast: 4,
  cutscene: true,
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
var Lib25 = aemeathAction("Liberation - Heavenfall Edict: Finale", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 1789.29,
  energy: 20,
  concerto: 20,
  offtune: 84e3,
  forte1: -200,
  forte2: -4,
  updateBuffs: () => revokeCurrent(MECH_FORM)
});
var INTRO_DEF = { node: 4, cast: 5, type: 20480, energy: 10, concerto: 10, forte1: 40, updateBuffs: () => applyCurrent(STARLUME, 1) };
var Intro19 = aemeathAction("Intro - Songs Across the Universe", { ...INTRO_DEF, mv: 134.58, offtune: 7737 });
var EIntro3 = aemeathAction("Intro - Debut of Meteoric Radiance", { ...INTRO_DEF, mv: 163.25, offtune: 9385 });
var Outro20 = aemeathAction("Outro - Silent Protection", {
  cast: 6,
  concerto: -100,
  swapOut: true,
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
    if (runningAction(Outro20))
      revokeCurrent(SERAPHIC_DUO);
  }
});
var STARLUME = new Buff({
  name: "Aemeath: Starlume Acceleration",
  applyStats: () => {
    if (runningAction(Lib14))
      addStat(31, 1);
  },
  convertStats: () => {
    if (runningAction(Lib14) || casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(STARLUME);
  }
});
var STARDUST = new Buff({
  name: "Aemeath: Stardust Resonance",
  maxStacks: 2,
  applyStats: () => {
    if (runningAction(Volley))
      addStat(15, 109.35 * 5);
    if (!runningAction(DuetBurst))
      return;
    addStat(16, 200);
    if (isHeld(AE_S2))
      asSource(AE_S2, () => addStat(16, 200));
  },
  afterAction: () => {
    if (runningAction(Volley) || runningAction(DuetBurst))
      removeStack(STARDUST, 1);
  }
});
var UNBOUND = new Buff({
  name: "Aemeath: Heavenfall Edict - Unbound",
  convertStats: () => {
    if (runningAction(Lib25))
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
    if ((runningAction(AHA2) || runningAction(MHA2)) && isHeld(UNBOUND))
      addStat(30, 200);
  },
  convertStats: () => {
    if (runningAction(AHA2) || runningAction(MHA2) || runningAction(Lib25))
      revokeCurrent(INSTANT_RESPONSE);
  }
});
var AE_INHERENT_1 = new Inherent({
  name: "Inherent: Before All Sounds",
  // Brilliance (S1) inherits every Instant Response effect, this one included
  applyStats: () => {
    if ((isHeld(INSTANT_RESPONSE) || isHeld(BRILLIANCE)) && casting(
      2
      /* Cast.Heavy */
    ))
      addStat(18, 200);
  }
});
var AEMEATH_TALENTS = new Talent({
  name: "Aemeath: Talents",
  stats: [[6, 12], [9, 8]]
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
    if (!appliedByMember(TUNE_RUPTURE_SHIFTING, actor) && currentAction().type1 !== 40960)
      return;
    if ((stacksOf(BETWEEN_THE_STARS_RUPTURE) & slot) !== 0)
      return;
    applyCurrent(BETWEEN_THE_STARS_RUPTURE, slot);
  }
});
var AEMEATH_RESONATOR = new Resonator({
  name: "Aemeath",
  talent: AEMEATH_TALENTS,
  inherent1: AE_INHERENT_1,
  inherent2: AE_INHERENT_2,
  element: 192,
  weapon: 0,
  intro: () => stacksOf(MECH_FORM) ? EIntro3 : Intro19,
  outro: () => Outro20,
  color: "#ff4680",
  maxEnergy: 125,
  maxForte1: 200,
  maxForte2: 4,
  constantStats: () => {
    addStat(1, 11025);
    addStat(0, 425);
    addStat(2, 1148.88);
    addStat(12, 10);
  }
});
var BRILLIANCE = new Buff({
  name: "Aemeath S1: Instant Response - Brilliance",
  applyStats: () => {
    if ((runningAction(AHA2) || runningAction(MHA2)) && !isHeld(UNBOUND))
      addStat(30, 100);
  },
  convertStats: () => {
    if (runningAction(AHA2) || runningAction(MHA2) || runningAction(Lib25))
      revokeCurrent(BRILLIANCE);
  }
});
var AE_S1 = new Sequence({
  name: "Aemeath S1: Gilded Glimmer of the First Dawn",
  combatStart: () => applyCurrent(BRILLIANCE, 1),
  applyStats: () => {
    if ((isHeld(INSTANT_RESPONSE) || isHeld(BRILLIANCE)) && casting(
      2
      /* Cast.Heavy */
    ))
      addStat(10, 300);
  }
});
var AE_S2 = new Sequence({
  name: "Aemeath S2: Downy Notes of Snowfluff",
  applyStats: () => {
    if (isDuet())
      addStat(16, 100);
    if (runningAction(Volley))
      addStat(16, isHeld(STARDUST) ? 70 : 40);
  }
});
var AE_S3 = new Sequence({
  name: "Aemeath S3: Fervor Sightly Burns Bright as New",
  applyStats: () => {
    if (runningAction(Lib25))
      addStat(16, 100);
    if (runningAction(Lib14))
      addStat(16, 40);
  }
});
var ETHEREAL_WALTZ = new Buff({
  name: "Aemeath S4: Ethereal Waltz on Binary Tides",
  stats: [[17, 20]]
});
var AE_S4 = new Sequence({
  name: "Aemeath S4: Ethereal Waltz on Binary Tides",
  updateBuffs: () => {
    if (runningAction(Intro19) || runningAction(EIntro3) || runningAction(ArmamentMerge) || runningAction(CallOfDawn) || isDuet())
      applyTeam(ETHEREAL_WALTZ, 1);
  }
});
var AE_S5 = new Sequence({ name: "Aemeath S5: Voyage to the Astral Shore" });
var AE_S6 = new Sequence({
  name: "Aemeath S6: A Zephyr-Kissed Journey to You",
  // her Resonance Mode isn't equipped yet at combatStart, so both standing lines are asserted from
  // updateGlobal instead — the first action of the fight, whoever casts it, and `maxStackIncrease`
  // takes one raise a source however often it is called
  updateGlobal: () => {
    if (!isHeld(MODE_BURST)) {
      maxStackIncrease(RUPTUROUS_TRAIL, 30);
      return;
    }
    maxStackIncrease(FUSION_TRAIL, 30);
    asActor(() => {
      addStat(
        9,
        80,
        1048576
        /* Type2.FusionBurst */
      );
      addStat(
        10,
        275,
        1048576
        /* Type2.FusionBurst */
      );
    });
  },
  // the Duet's own 10 stacks, laid from here rather than from the Trail: an empty Trail is not held
  // and would run no hook of its own, which is exactly when the first Duet of a visit lands
  updateDebuffs: () => {
    if (!isDuet())
      return;
    applyEnemy(isHeld(MODE_BURST) ? FUSION_TRAIL : RUPTUROUS_TRAIL, 10);
  },
  applyStats: () => {
    addStat(
      20,
      40,
      16384
      /* Type1.Liberation */
    );
    if (runningAction(Volley) || runningAction(Starburst))
      addStat(19, 140);
  }
});
var AE_SEQUENCES = [AE_S1, AE_S2, AE_S3, AE_S4, AE_S5, AE_S6];
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
    if (runningAction(Volley))
      addStat(16, 4 * frozenStacks());
  },
  convertStats: () => {
    if (runningAction(Volley) && stacksOf(STARDUST) !== 2)
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
  // S3 replaces the tiering outright: a flat 60% off the first inflict, and Finale amplified with it
  applyStats: () => {
    const tiers = betweenTheStars();
    if (isHeld(AE_S3))
      asSource(AE_S3, () => addStat(10, 60));
    else
      addStat(10, 20 * tiers);
    if (!runningAction(Lib25))
      return;
    if (tiers >= 3)
      addStat(18, 25);
    else if (isHeld(AE_S3))
      asSource(AE_S3, () => addStat(18, 25));
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
var inflicts = () => runningAction(ABA3) || runningAction(ABA4) || runningAction(MBA3) || runningAction(MBA4) || runningAction(ArmamentMerge) || runningAction(CallOfDawn) || runningAction(Intro19) || runningAction(EIntro3) || isHeld(AE_S3) && isHeld(INSTANT_RESPONSE) && casting(
  2
  /* Cast.Heavy */
);
var MODE_RUPTURE = new ResonanceMode({
  name: "Resonance Mode - Tune Rupture",
  updateDebuffs: () => {
    if (inflicts())
      applyRupture();
  },
  updateGlobal: () => {
    tuneRuptureResponse(Starburst);
    const a = currentAction();
    if (a.type1 === 40960 && !runningAction(Volley))
      applyEnemy(RUPTUROUS_TRAIL, isHeld(AE_S6) ? 20 : 10);
  },
  updateBuffs: () => {
    if (isDuet())
      queue(Volley);
  }
});
var ABA234 = new ActionGroup("Basic - Aemeath 234", [ABA2, ABA3, ABA4]);
var MBA234 = new ActionGroup("Basic - Mech 234", [MBA2, MBA3, MBA4]);
var ABA34 = new ActionGroup("Basic - Aemeath 34", [ABA3, ABA4]);
var AE_ROTATION = new Rotation([
  INTRO,
  ABA34,
  Lib14,
  MBA234,
  MechFSkill,
  ABA234,
  AmyFSkill,
  MHA2,
  ECHO_CANCEL,
  Lib25,
  OUTRO
]);
var AE_ROTATION_S1 = new Rotation([
  START_1,
  START_2,
  START_3,
  AHA2,
  SWAP,
  INTRO,
  ABA34,
  Lib14,
  MBA234,
  MechFSkill,
  ABA234,
  AmyFSkill,
  MHA2,
  ECHO_CANCEL,
  Lib25,
  OUTRO
]);
var AEMEATH_RUPTURE = new Loadout({
  resonator: AEMEATH_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Er),
  rotation: { 0: AE_ROTATION, 1: AE_ROTATION_S1 },
  sequences: AE_SEQUENCES,
  mode: MODE_RUPTURE
});
var DuetBurst = new Action("Forte - Seraphic Duet: Fusion Burst", {
  element: 192,
  type: 32768,
  type2: 1048576,
  scaling: 3,
  mv: 0
});
var FUSION_TRAIL = new Debuff({
  name: "Aemeath: Fusion Trail",
  maxStacks: 30,
  applyStats: () => {
    if (!runningAction(DuetBurst))
      return;
    const trail = frozenStacks();
    addStat(16, 10 * trail);
    if (isHeld(AE_S2))
      asSource(AE_S2, () => addStat(16, 5 * trail));
  },
  convertStats: () => {
    if (runningAction(DuetBurst) && stacksOf(STARDUST) !== 2)
      revokeEnemy(FUSION_TRAIL);
  }
});
var BETWEEN_THE_STARS_BURST = new Buff({
  name: "Inherent: Between the Stars (burst)",
  maxStacks: 1 + 2 + 4,
  display: () => `Inherent: Between the Stars (burst) x${Math.min(2, betweenTheStars())}`,
  applyStats: () => {
    const n = Math.min(2, betweenTheStars());
    if (isHeld(AE_S3))
      asSource(AE_S3, () => addStat(10, 60));
    else
      addStat(10, 30 * n);
    if (!runningAction(Lib25))
      return;
    if (n >= 2)
      addStat(18, 25);
    else if (isHeld(AE_S3))
      asSource(AE_S3, () => addStat(18, 25));
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
    if (inflicts())
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
    const landed = applied2(FUSION_BURST);
    if (landed > 0)
      applyEnemy(FUSION_TRAIL, isHeld(AE_S6) ? landed * 2 : landed);
  },
  updateBuffs: () => {
    if (isDuet())
      queue(DuetBurst);
  }
});
var AEMEATH_BURST = new Loadout({
  resonator: AEMEATH_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Er),
  rotation: { 0: AE_ROTATION, 1: AE_ROTATION_S1 },
  sequences: AE_SEQUENCES,
  mode: MODE_BURST
});

// dist/src/resonators/fusion/brant.js
function brantAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var Intro20 = brantAction("Intro - Applaud for Me!", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 253.49,
  offtune: 12e3,
  concerto: 10,
  forte1: 25,
  updateDebuffs: () => applyCurrent(HEALS, 1)
});
var Outro21 = brantAction("Outro - The Course is Set!", { cast: 6, concerto: -100, swapOut: true, updateBuffs: () => queueOutro(BRANT_OUTRO) });
var Skill17 = brantAction("Skill - Anchors Aweigh!", { node: 1, cast: 3, type: 12288, mv: 333.92, offtune: 10160, energy: 7.18, concerto: 10, forte1: 15.76 });
var Liberation16 = brantAction("Liberation - To the Horizon", {
  node: 3,
  cast: 4,
  cutscene: true,
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
  cast: 3,
  type: 4096,
  mv: 1888.71,
  offtune: 63200,
  energy: 30,
  concerto: 50,
  forte1: -100,
  updateDebuffs: () => applyCurrent(SHIELD, 1)
});
var BA119 = brantAction("Basic - Captain's Rhapsody 1", { node: 0, cast: 1, type: 4096, mv: 50.53, energy: 0.75, concerto: 1.5, offtune: 2392, forte1: 2.6 });
var BA219 = brantAction("Basic - Captain's Rhapsody 2", { node: 0, cast: 1, type: 4096, mv: 101.4, energy: 1.5, concerto: 3, offtune: 4800, forte1: 5.24 });
var BA320 = brantAction("Basic - Captain's Rhapsody 3", { node: 0, cast: 1, type: 4096, mv: 132.34, energy: 1.97, concerto: 3.94, offtune: 6264, forte1: 6.82 });
var BA415 = brantAction("Basic - Captain's Rhapsody 4", { node: 0, cast: 1, type: 4096, mv: 140.12, energy: 2.12, concerto: 4.18, offtune: 6631, forte1: 7.24 });
var HA14 = brantAction("Heavy - Captain's Rhapsody", { node: 0, cast: 2, type: 8192, mv: 197.55, energy: 2.93, concerto: 5.85, offtune: 9352, forte1: 14.5 });
var HARiff = brantAction("Heavy - Rhapsodic Riff", { node: 0, cast: 2, type: 8192, mv: 168.99, energy: 2.5, concerto: 5, offtune: 8e3, forte1: 12.4 });
var DC16 = brantAction("Dodge Counter - Captain's Rhapsody", { node: 0, cast: 0, type: 4096, mv: 228.17, energy: 3.41, concerto: 16.77, offtune: 10800 });
var Plunge5 = brantAction("Basic - Plunging Attack", { node: 0, cast: 1, type: 4096, mv: 104.78, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 7.66 });
var MA17 = brantAction("Mid-air - Captain's Rhapsody 1", { node: 0, cast: 1, type: 4096, mv: 122.86, energy: 1.82, concerto: 3.64, offtune: 5816, forte1: 9.02 });
var MA1C = brantAction("Mid-air - Captain's Rhapsody 1 (Charged)", { node: 0, cast: 1, type: 4096, mv: 332.48, energy: 4.96, concerto: 9.85, offtune: 15736, forte1: 24.46 });
var MA25 = brantAction("Mid-air - Captain's Rhapsody 2", { node: 0, cast: 1, type: 4096, mv: 169.84, energy: 2.52, concerto: 5.04, offtune: 8040, forte1: 12.48 });
var MA2C = brantAction("Mid-air - Captain's Rhapsody 2 (Charged)", { node: 0, cast: 1, type: 4096, mv: 197.22, energy: 2.94, concerto: 5.88, offtune: 9336, forte1: 25.32 });
var MA34 = brantAction("Mid-air - Captain's Rhapsody 3", { node: 0, cast: 1, type: 4096, mv: 169.02, energy: 2.52, concerto: 5.04, offtune: 7998, forte1: 18.6 });
var MAFlip = brantAction("Mid-air - Captain's Rhapsody Flip", { node: 0, cast: 1, type: 4096, mv: 92.95, energy: 1.38, concerto: 2.75, offtune: 4400, forte1: 10.24 });
var MASlash = brantAction("Mid-air - Captain's Rhapsody 1 Slash", { node: 0, cast: 1, type: 4096, mv: 84.51, energy: 1.26, concerto: 2.52, offtune: 3999 });
var MA42 = brantAction("Mid-air - Captain's Rhapsody 4", { node: 0, cast: 1, type: 4096, mv: 253.85, energy: 3.78, concerto: 7.55, offtune: 12017, forte1: 18.7 });
var MA1F = MA17.variant(MA17.name, { updateBuffs: () => queue(MAFlip) });
var MA2F = MA25.variant(MA25.name, { updateBuffs: () => queue(MAFlip) });
var MA3F = MA34.variant(MA34.name, { updateBuffs: () => queue(MAFlip) });
var MA1CF = MA1C.variant(MA1C.name, { updateBuffs: () => queue(MAFlip) });
var MA2CF = MA2C.variant(MA2C.name, { updateBuffs: () => queue(MAFlip) });
var midAir = () => runningAction(MA17) || runningAction(MA1C) || runningAction(MA25) || runningAction(MA2C) || runningAction(MA34) || runningAction(MAFlip) || runningAction(MASlash) || runningAction(MA42) || runningAction(MA1F) || runningAction(MA2F) || runningAction(MA3F) || runningAction(MA1CF) || runningAction(MA2CF);
var AFLAME = new Buff({
  name: "Brant: Aflame",
  applyStats: () => {
    const a = currentAction();
    if (a.node === 0 || a.node === 1)
      addStat(30, a.forte1);
  },
  // ...and hands the conversion back down as it goes. "My" Moment has already paid out this
  // action by now (the roster was frozen with it held), so this cast still gets the Aflame rate.
  convertStats: () => {
    if (!(casting(
      6
      /* Cast.Outro */
    ) || runningAction(FSkill5)))
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
  stats: [[
    18,
    20,
    192
    /* Attribute.Fusion */
  ], [
    18,
    25,
    12288
    /* Type1.Skill */
  ]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var BR_TRIAL_INHERENT = new Inherent({
  name: "Inherent: Trial by Fire and Tide",
  stats: [[
    17,
    15,
    192
    /* Attribute.Fusion */
  ]]
});
var BR_VOYAGE_INHERENT = new Inherent({
  name: "Inherent: Voyager's Blaze",
  stats: [[24, 20]]
});
var BY_CURRENTS = new Buff({
  name: "Brant S1: By Currents and Winds",
  maxStacks: 3,
  stats: [[17, 20]],
  perStack: true,
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(BY_CURRENTS);
  }
});
var BR_S1 = new Sequence({
  name: "Brant S1: By Currents and Winds",
  updateBuffs: () => {
    if (runningAction(Intro20) || runningAction(MAFlip))
      applyCurrent(BY_CURRENTS, 1);
  }
});
var CourseBlast = brantAction("Outro - The Course is Set! (S2 Blast)", { node: 0, type: 4096, mv: 440 });
var COURSE_BLAST = new Buff({
  name: "Brant S2: The Course is Set! (Blast)",
  maxStacks: 2,
  updateBuffs: () => {
    lostOnSwap();
    if (!oneSecondPassed() || !casting(
      3
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
    if (midAir() || runningAction(FSkill5))
      addStat(9, 30);
  },
  updateBuffs: () => {
    if (runningAction(Outro21)) {
      queueOutro(COURSE_BLAST);
      queueOutro(COURSE_BLAST);
    }
  }
});
var BR_S3 = new Sequence({
  name: "Brant S3: Through Storms I Sail",
  applyStats: () => {
    if (runningAction(FSkill5) || runningAction(AshesBlast))
      addStat(16, 42);
  }
});
var BR_S4 = new Sequence({
  name: "Brant S4: To Freedom I Sing",
  updateDebuffs: () => {
    if (runningAction(FSkill5))
      applyCurrent(HEALS, 1);
  }
});
var ACTORS_STAGE = new Buff({
  name: "Brant S5: All the World's an Actor's Stage",
  stats: [[
    17,
    15,
    4096
    /* Type1.Basic */
  ]],
  convertStats: () => {
    if (casting(
      6
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
    if (midAir())
      addStat(16, 30);
  },
  updateBuffs: () => {
    if (runningAction(FSkill5))
      queue(AshesBlast);
  }
});
var BRANT_TALENTS = new Talent({
  name: "Brant: Talents",
  stats: [[9, 8], [6, 12]]
});
var BRANT_RESONATOR = new Resonator({
  name: "Brant",
  matrix: matrix("Brant", 25),
  talent: BRANT_TALENTS,
  inherent1: BR_TRIAL_INHERENT,
  inherent2: BR_VOYAGE_INHERENT,
  element: 192,
  weapon: 0,
  intro: () => Intro20,
  outro: () => Outro21,
  color: "#d1257f",
  maxEnergy: 175,
  maxForte1: 100,
  combatStart: () => applyCurrent(THEATRICAL_MOMENT, 1),
  constantStats: () => {
    addStat(1, 11675);
    addStat(0, 375);
    addStat(2, 1308);
  }
});
var BR_ROTATION = new Rotation([
  INTRO,
  Liberation16,
  MA17,
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
  sequences: [BR_S1, BR_S2, BR_S3, BR_S4, BR_S5, BR_S6],
  weapons: [UNFLICKERING_VALOR, EMERALD_OF_GENESIS, NEW_STD_SWORD, BLOODPACTS_PLEDGE[4]],
  // the craftable at its real R5
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.Er, Substat.Basic, Substat.AtkPct, Substat.Basic),
  rotation: BR_ROTATION
});
var BR_ROTATION_MDPS = new Rotation([
  DOUBLE_INTRO,
  MA2F,
  MA3F,
  SWAP,
  INTRO,
  FSkill5,
  Liberation16,
  MA17,
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
  sequences: [BR_S1, BR_S2, BR_S3, BR_S4, BR_S5, BR_S6],
  weapons: [UNFLICKERING_VALOR, EMERALD_OF_GENESIS, NEW_STD_SWORD, BLOODPACTS_PLEDGE[4]],
  // the craftable at its real R5
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.Er, Substat.Basic, Substat.AtkPct, Substat.Basic),
  rotation: BR_ROTATION_MDPS
});

// dist/src/resonators/fusion/changli.js
function changliAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA120 = changliAction("Basic - Blazing Enlightenment 1", { node: 0, cast: 1, type: 4096, mv: 58.98, offtune: 2792, energy: 0.88, concerto: 1.76 });
var BA220 = changliAction("Basic - Blazing Enlightenment 2", { node: 0, cast: 1, type: 4096, mv: 70.98, offtune: 3360, energy: 1.06, concerto: 2.1 });
var BA321 = changliAction("Basic - Blazing Enlightenment 3", { node: 0, cast: 1, type: 4096, mv: 109.35, offtune: 5178, energy: 1.62, concerto: 3.24 });
var BA416 = changliAction("Basic - Blazing Enlightenment 4", { node: 0, cast: 1, type: 4096, mv: 169.02, offtune: 8e3, energy: 2.51, concerto: 5.02 });
var DC17 = changliAction("Dodge Counter - Blazing Enlightenment 3", { node: 0, cast: 0, type: 4096, mv: 247.92, offtune: 9978, energy: 3.12, concerto: 16.24 });
var HA15 = changliAction("Heavy - Blazing Enlightenment", { node: 0, cast: 2, type: 8192, mv: 124.24, offtune: 5880, energy: 1.85, concerto: 3.69 });
var MA18 = changliAction("Mid-air - Blazing Enlightenment 1", { node: 0, cast: 1, type: 4096, mv: 61.35, offtune: 2904, energy: 0.91, concerto: 1.82 });
var MA26 = changliAction("Mid-air - Blazing Enlightenment 2", { node: 0, cast: 1, type: 4096, mv: 101.74, offtune: 4816, energy: 1.52, concerto: 3.02 });
var MA35 = changliAction("Mid-air - Blazing Enlightenment 3", { node: 0, cast: 1, type: 4096, mv: 132, offtune: 6249, energy: 1.98, concerto: 3.93 });
var MA43 = changliAction("Mid-air - Blazing Enlightenment 4", { node: 0, cast: 1, type: 4096, mv: 126.75, offtune: 6e3, energy: 1.89, concerto: 3.77 });
var MHA = changliAction("Heavy - Blazing Enlightenment (Mid-Air)", { node: 0, cast: 2, type: 8192, mv: 123.27, offtune: 4960, energy: 1.55, concerto: 1 });
var SBA = changliAction("Basic - True Sight: Conquest", { node: 1, cast: 1, type: 12288, mv: 294.73, offtune: 8985, energy: 4.04, concerto: 7, forte1: 1 });
var SMA = changliAction("Basic - True Sight: Charge", { node: 1, cast: 1, type: 12288, mv: 181.7, offtune: 4353, energy: 2.57, concerto: 6, forte1: 1 });
var Skill18 = changliAction("Skill - Tripartite Flames", { node: 1, cast: 3, type: 12288, mv: 409.4, offtune: 12480, energy: 8, concerto: 14 });
var FlamingSacrifice = changliAction("Forte Heavy - Flaming Sacrifice", { node: 2, cast: 2, type: 12288, mv: 654.1, offtune: 31141, energy: 6.61, concerto: 10, forte1: -4 });
var Liberation17 = changliAction("Liberation - Radiance of Fealty", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 1212.75,
  offtune: 100800,
  concerto: 20,
  forte1: 4,
  resetEnergy: true,
  updateBuffs: () => applyCurrent(FIERY_FEATHER, 1)
});
var Intro21 = changliAction("Intro - Obedience of Rules", { node: 4, cast: 5, type: 20480, mv: 148.34, offtune: 5971, energy: 10, concerto: 10 });
var Outro22 = changliAction("Outro - Strategy of Duality", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(CHANGLI_OUTRO)
});
var TRUE_SIGHT = new Buff({
  name: "Changli: True Sight"
});
var CH_INHERENT_1 = new Inherent({
  name: "Inherent: Secret Strategist",
  applyStats: () => {
    if (runningAction(SBA) || runningAction(SMA))
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
    if (runningAction(FlamingSacrifice) || runningAction(Liberation17)) {
      addStat(
        17,
        20,
        192
        /* Attribute.Fusion */
      );
      addStat(23, 15);
    }
  }
});
var FIERY_FEATHER = new Buff({
  name: "Changli: Fiery Feather",
  applyStats: () => {
    if (runningAction(FlamingSacrifice))
      addStat(6, 25);
  },
  convertStats: () => {
    if (runningAction(FlamingSacrifice))
      revokeCurrent(FIERY_FEATHER);
  }
});
var CHANGLI_OUTRO = new Buff({
  name: "Changli: Outro",
  stats: [[
    18,
    20,
    192
    /* Attribute.Fusion */
  ], [
    18,
    25,
    16384
    /* Type1.Liberation */
  ]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var tripartite = () => runningAction(Skill18) || runningAction(SBA) || runningAction(SMA);
var CH_S1 = new Sequence({
  name: "Changli S1: Hidden Thoughts",
  applyStats: () => {
    if (tripartite() || runningAction(FlamingSacrifice))
      addStat(17, 10);
  }
});
var PURSUIT_OF_DESIRES = new Buff({
  name: "Changli S2: Pursuit of Desires",
  stats: [[9, 25]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(PURSUIT_OF_DESIRES);
  }
});
var CH_S2 = new Sequence({
  name: "Changli S2: Pursuit of Desires",
  updateBuffs: () => {
    if (runningAction(SBA) || runningAction(SMA) || runningAction(Liberation17))
      applyCurrent(PURSUIT_OF_DESIRES, 1);
  }
});
var CH_S3 = new Sequence({
  name: "Changli S3: Learned Secrets",
  applyStats: () => {
    if (runningAction(Liberation17))
      addStat(17, 80);
  }
});
var POLISHED_WORDS = new Buff({
  name: "Changli S4: Polished Words",
  stats: [[6, 20]]
});
var CH_S4 = new Sequence({
  name: "Changli S4: Polished Words",
  updateBuffs: () => {
    if (runningAction(Intro21))
      applyTeam(POLISHED_WORDS, 1);
  }
});
var CH_S5 = new Sequence({
  name: "Changli S5: Sacrificed Gains",
  applyStats: () => {
    if (runningAction(FlamingSacrifice)) {
      addStat(16, 50);
      addStat(17, 50);
    }
  }
});
var CH_S6 = new Sequence({
  name: "Changli S6: Realized Plans",
  applyStats: () => {
    if (tripartite() || runningAction(FlamingSacrifice) || runningAction(Liberation17))
      addStat(23, 40);
  }
});
var CHANGLI_TALENTS = new Talent({
  name: "Changli: Talents",
  stats: [[9, 8], [6, 12]]
});
var CHANGLI_RESONATOR = new Resonator({
  name: "Changli",
  matrix: matrix("Changli", 25),
  talent: CHANGLI_TALENTS,
  inherent1: CH_INHERENT_1,
  inherent2: CH_INHERENT_2,
  element: 192,
  weapon: 0,
  intro: () => Intro21,
  outro: () => Outro22,
  color: "#f38b68",
  maxEnergy: 125,
  maxForte1: 4,
  // her combo finishers/Skill/Intro arm True Sight; the two Sword-of-Fealty casts spend it
  updateBuffs: () => {
    if (runningAction(BA416) || runningAction(MA43) || runningAction(Skill18) || runningAction(Intro21))
      applyCurrent(TRUE_SIGHT, 1);
    if (runningAction(SBA) || runningAction(SMA))
      revokeCurrent(TRUE_SIGHT);
  },
  constantStats: () => {
    addStat(1, 12762);
    addStat(0, 410);
    addStat(2, 1181);
  }
});
var BA12345 = new ActionGroup("Basic - Blazing Enlightenment 1234", [BA120, BA220, BA321, BA416]);
var CH_ROTATION = new Rotation([
  START_3,
  Liberation17,
  FlamingSacrifice.swap(),
  SWAP,
  // TODO get cancels
  INTRO,
  SMA,
  Skill18,
  SBA,
  Skill18,
  SBA,
  BA12345,
  DODGE,
  SBA,
  FlamingSacrifice,
  Liberation17,
  FlamingSacrifice,
  OUTRO
]);
var CHANGLI = new Loadout({
  resonator: CHANGLI_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Er),
  rotation: CH_ROTATION
});

// dist/src/resonators/fusion/denia.js
function deniaAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA121 = deniaAction("Basic - Stagecraft Form 1", { node: 0, cast: 1, type: 4096, mv: 32.69, energy: 0.69, concerto: 1.37, offtune: 2192, forte1: 4 });
var BA221 = deniaAction("Basic - Stagecraft Form 2", { node: 0, cast: 1, type: 4096, mv: 60.36, energy: 1.28, concerto: 2.54, offtune: 4048, forte1: 8 });
var BA322 = deniaAction("Basic - Stagecraft Form 3", { node: 0, cast: 1, type: 4096, mv: 76.47, energy: 1.62, concerto: 3.21, offtune: 5130, forte1: 9 });
var BA417 = deniaAction("Basic - Stagecraft Form 4", { cutscene: true, node: 0, cast: 1, type: 4096, mv: 128, energy: 0.69, concerto: 5.37, offtune: 8584, forte1: 30 });
var HA16 = deniaAction("Heavy - Stagecraft Form", { node: 0, cast: 2, type: 8192, mv: 161.52, energy: 3.4, concerto: 6.78, offtune: 10832, forte1: 20 });
var MA19 = deniaAction("Mid-air - Stagecraft Form", { node: 0, cast: 1, type: 4096, mv: 73.97, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 10 });
var DC18 = deniaAction("Dodge Counter - Stagecraft Form 3", { node: 0, cast: 0, type: 4096, mv: 148.05, energy: 3.12, concerto: 16.21, offtune: 5130, forte1: 18 });
var UBA14 = deniaAction("Basic - Breakdown Form 1", { node: 0, cast: 1, type: 4096, mv: 36.51, energy: 0.77, concerto: 1.53, offtune: 2448, forte1: -18, forte2: 3 });
var UBA23 = deniaAction("Basic - Breakdown Form 2", { node: 0, cast: 1, type: 4096, mv: 93.79, energy: 1.99, concerto: 3.94, offtune: 6292, forte1: -46, forte2: 12 });
var UBA33 = deniaAction("Basic - Breakdown Form 3", { node: 0, cast: 1, type: 4096, mv: 62.39, energy: 1.31, concerto: 2.62, offtune: 4184, forte1: -30, forte2: 6 });
var UBA42 = deniaAction("Basic - Breakdown Form 4", { node: 0, cast: 1, type: 4096, mv: 118.46, energy: 2.49, concerto: 4.97, offtune: 7945, forte1: -58, forte2: 11 });
var UHA = deniaAction("Heavy - Breakdown Form", { node: 0, cast: 2, type: 8192, mv: 137.06, energy: 2.88, concerto: 5.75, offtune: 9192, forte1: -66, forte2: 13 });
var UMHA = deniaAction("Heavy - Breakdown Form (Mid-Air)", { node: 0, cast: 2, type: 8192, mv: 73.97, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: -37, forte2: 7 });
var UDC3 = deniaAction("Dodge Counter - Breakdown Form 3", { node: 0, cast: 0, type: 4096, mv: 62.39, energy: 1.31, concerto: 12.62, offtune: 4184, forte1: -30, forte2: 6 });
var UMDC = deniaAction("Dodge Counter - Breakdown Form 3 (Mid-Air)", { node: 0, cast: 0, type: 4096, mv: 62.39, energy: 1.31, concerto: 12.62, offtune: 4184, forte1: -30, forte2: 6 });
var Skill19 = deniaAction("Skill - Phantom Bubble", { cutscene: true, node: 1, cast: 3, type: 12288, mv: 104.51, energy: 0.22, concerto: 24.4, offtune: 7008, forte1: 25 });
var Beckon = deniaAction("Skill - Beckon", { cutscene: true, node: 1, cast: 3, type: 12288, mv: 103.7, energy: 2.21, concerto: 4.36, offtune: 6956, forte2: 13 });
var Banish1 = deniaAction("Skill - Banish 1", { cutscene: true, node: 1, cast: 3, type: 12288, mv: 104.04, energy: 2.19, concerto: 4.38, offtune: 6978 });
var Banish2 = deniaAction("Skill - Banish 2", { cutscene: true, node: 1, cast: 3, type: 16384, mv: 112.01, energy: 2.35, concerto: 14.7, offtune: 7512, forte2: 40 });
var Lib15 = deniaAction("Liberation - Final Act (Stagecraft)", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 397.62,
  concerto: 20,
  offtune: 48e3,
  resetEnergy: true,
  updateBuffs: () => {
    revokeCurrent(ENTROPY_STAGECRAFT);
    applyCurrent(ENTROPY_BREAKDOWN);
  }
});
var Lib26 = deniaAction("Liberation - Final Act (Breakdown)", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 795.24,
  energy: 30,
  concerto: 20,
  offtune: 52528,
  resetForte1: true,
  forte2: -100,
  updateBuffs: () => {
    revokeCurrent(ENTROPY_BREAKDOWN);
    applyCurrent(ENTROPY_STAGECRAFT);
    const field = isHeld(DN_S4) ? EROSION_FIELD_S4 : EROSION_FIELD;
    revokeTeam(field);
    applyTeam(field, isHeld(DN_S4) ? 30 : 35);
  }
});
var EROSION2 = new ActionField("Denia: Erosion Field");
var ErosionField = deniaAction("Forte - Erosion Field", {
  node: 2,
  type: 16384,
  mv: 136.33,
  field: EROSION2
});
var Intro22 = deniaAction("Intro - It's Been A While!", {
  node: 4,
  cast: 5,
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
  cast: 5,
  type: 20480,
  mv: 155.22,
  energy: 10.02,
  concerto: 10,
  offtune: 10410,
  forte1: 25,
  updateBuffs: () => {
    revokeCurrent(ENTROPY_STAGECRAFT);
    applyCurrent(ENTROPY_BREAKDOWN);
    applyCurrent(DARK_CORE);
  }
});
var Outro23 = deniaAction("Outro - Unfinished Lies", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => {
    if (isHeld(MODE_BURST2))
      applyTeam(UNFINISHED_LIES_BURST, 1);
    else
      queueOutro(UNFINISHED_LIES_STRAIN);
  }
});
var inflictsTwo = () => runningAction(Intro22) || runningAction(EIntro4) || runningAction(Lib15) || runningAction(Lib26) || runningAction(ErosionField);
var inflictsOne = () => runningAction(BA322) || runningAction(BA417) || runningAction(UBA33) || runningAction(UBA42) || runningAction(UDC3) || runningAction(UMDC);
var MODE_BURST2 = new ResonanceMode({
  name: "Resonance Mode - Fusion Burst",
  updateDebuffs: () => {
    if (inflictsTwo())
      applyEnemy(FUSION_BURST, 2);
    else if (inflictsOne())
      applyEnemy(FUSION_BURST, 1);
  }
});
var MODE_STRAIN = new ResonanceMode({
  name: "Resonance Mode - Tune Strain",
  // Shattered Hours: "while Denia is in the team", whichever mode
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1);
    applyCurrent(TUNE_STRAIN_RESPONDER, 1);
    applyTeam(OFFTUNE_SURGE, 1);
  },
  updateDebuffs: () => {
    if (inflictsTwo() || inflictsOne())
      applyStrain();
  }
});
var OFFTUNE_SURGE = new Buff({
  name: "Resonance Mode - Tune Strain",
  // S2 takes the same one-shot to the whole bar
  applyStats: () => {
    if (!applied2(TUNE_STRAIN_SHIFTING))
      return;
    addStat(29, ENEMY_MAX_OFFTUNE / 2);
    if (isHeld(DN_S2))
      asSource(DN_S2, () => addStat(29, ENEMY_MAX_OFFTUNE / 2));
  },
  convertStats: () => {
    if (applied2(TUNE_STRAIN_SHIFTING))
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
    if (isHeld(DN_S3) && runningAction(Lib26))
      asSource(DN_S3, () => addStat(27, 30));
    const a = currentAction();
    if (!spendsVoid(a) || forte1() <= 0)
      return;
    addStat(16, 50);
    addStat(31, a.forte2);
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(ENTROPY_BREAKDOWN);
  }
});
var EROSION_FIELD = coordinatedBuff("Denia: Erosion Field", 35, () => DENIA_RESONATOR, ErosionField, { every: 5 });
var EROSION_FIELD_S4 = coordinatedBuff("Denia: Erosion Field", 30, () => DENIA_RESONATOR, ErosionField, { every: 3 });
var ENTROPY_STAGECRAFT = new Buff({
  name: "Entropy Shift: Stagecraft Form",
  // S3 takes its regen to 4 Void Particle a second, so the same off-field window banks four times as much
  // the shift's own Dark Core keeps coming while she is off field too: one across that window at
  // the kit's 12s, three at S3's 6s
  updateBuffs: () => {
    if (!casting(
      6
      /* Cast.Outro */
    ))
      return;
    applyCurrent(DARK_CORE, isHeld(DN_S3) ? 4 : 2);
  },
  applyStats: () => {
    if (!casting(
      6
      /* Cast.Outro */
    ))
      return;
    addStat(30, 20);
    if (isHeld(DN_S3))
      asSource(DN_S3, () => addStat(30, 60));
  }
});
var ETCHED_COLORS_BURST = new Buff({
  name: "Inherent: Etched Colors (burst)",
  stats: [[
    17,
    30,
    192
    /* Attribute.Fusion */
  ]]
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
    if (runningAction(Lib15) || runningAction(EIntro4))
      applyTeam(isHeld(MODE_BURST2) ? ETCHED_COLORS_BURST : ETCHED_COLORS_STRAIN, 1);
  }
});
var DARK_CORE = new Buff({
  name: "Denia: Dark Core",
  maxStacks: 5,
  // declared at S3's own five and held down to three without it — a local buff's cap can't be
  // raised the way an enemy debuff's can (context.ts's own maxStackIncrease)
  updateBuffs: () => {
    const over = stacksOf(DARK_CORE) - (isHeld(DN_S3) ? 5 : 3);
    if (over > 0)
      removeStack(DARK_CORE, over);
  },
  applyStats: () => {
    if (runningAction(Banish2)) {
      addStat(16, 150 * frozenStacks()), revokeCurrent(DARK_CORE);
    }
  }
});
var UNFINISHED_LIES_BURST = new Buff({
  name: "Denia: Outro (burst)",
  stats: [[
    18,
    60,
    1048576
    /* Type2.FusionBurst */
  ]]
});
var UNFINISHED_LIES_STRAIN = new Buff({
  name: "Denia: Outro (strain)",
  maxStacks: 2,
  display: () => frozenStacks() === 2 ? "Denia: Outro (shifting)" : "Denia: Outro (strain)",
  updateBuffs: () => {
    lostOnSwap();
    if (applied2(TUNE_STRAIN_SHIFTING))
      applyCurrent(UNFINISHED_LIES_STRAIN, 1);
  },
  applyStats: () => addStat(18, frozenStacks() === 2 ? 40 : 15)
});
var DN_S1 = new Sequence({
  name: "Denia S1: Silent Glows in a Dimlit Dream",
  stats: [[10, 30]],
  combatStart: () => applyCurrent(ENTROPY_STAGECRAFT, 1)
});
var TIDES_BURST = new Buff({
  name: "Denia S2: Tossed in the Tides of Reality",
  stats: [[
    17,
    50,
    192
    /* Attribute.Fusion */
  ]],
  until: 2
});
var DEGENERATE_VOIDMATTER = new Buff({
  name: "Denia S2: Degenerate Voidmatter",
  maxStacks: 10,
  stats: [[
    21,
    1,
    192
    /* Attribute.Fusion */
  ]],
  perStack: true,
  until: 0
});
var TIDES_STRAIN = new Buff({
  name: "Denia S2: Tossed in the Tides of Reality",
  stats: [[12, 20]],
  until: 2
});
var DN_S2 = new Sequence({
  name: "Denia S2: Tossed in the Tides of Reality",
  // from updateGlobal "me" is Denia, so the acting slot has to be named (status.ts)
  updateGlobal: () => {
    const acting = currentTeam().slot;
    if (!isHeld(MODE_BURST2)) {
      if (acting.resonator && appliedByMember(TUNE_STRAIN_SHIFTING, acting))
        addBuff(acting.resonator, TIDES_STRAIN, 1);
      return;
    }
    if (acting.resonator && appliedByMember(FUSION_BURST, acting))
      addBuff(acting.resonator, TIDES_BURST, 1);
    if (isType(
      1048576
      /* Type2.FusionBurst */
    ))
      applyCurrent(DEGENERATE_VOIDMATTER, 1);
  },
  applyStats: () => {
    if (runningAction(Banish1) || runningAction(Banish2))
      addStat(16, 40);
  }
});
var DN_S3 = new Sequence({
  name: "Denia S3: Through Dark and Wind, the Erlking Follows",
  combatStart: () => {
    applyCurrent(DARK_CORE, 5);
    setForte1(100);
  },
  // the retag has to land in the first phase, before anything reads the type (see typeOverride)
  updateDebuffs: () => {
    if ((runningAction(BA417) || runningAction(Skill19)) && stacksOf(DARK_CORE) >= 5)
      typeOverride(
        16384
        /* Type1.Liberation */
      );
  },
  applyStats: () => {
    if (runningAction(Lib26)) {
      addStat(16, 80);
      addStat(27, 30);
    }
    if ((runningAction(BA417) || runningAction(Skill19)) && stacksOf(DARK_CORE) >= 5) {
      addStat(15, 1200);
      revokeCurrent(DARK_CORE);
    }
  }
});
var DN_S4 = new Sequence({ name: "Denia S4: From the Far Beyond, to the Far Beyond" });
var DN_S5 = new Sequence({
  name: "Denia S5: If Lies Patch Up a Heart",
  applyStats: () => {
    if (runningAction(Lib15))
      addStat(17, 100);
  }
});
var erosionStanding = () => stacksOfTeam(EROSION_FIELD) > 0 || stacksOfTeam(EROSION_FIELD_S4) > 0;
var DN_S6 = new Sequence({
  name: "Denia S6: May You Find Your Sun in the Silence",
  // +60% ATK and +60% Fusion DMG Bonus for as long as either Entropy Shift stands — both are hers,
  // and this hook runs on her turns alone, which is what "while in Entropy Shift states" asks
  applyStats: () => {
    if (isHeld(MODE_BURST2) && isType(
      1048576
      /* Type2.FusionBurst */
    ) && erosionStanding())
      addStat(16, 200);
    if (!isHeld(ENTROPY_BREAKDOWN) && !isHeld(ENTROPY_STAGECRAFT))
      return;
    addStat(6, 60);
    addStat(
      17,
      60,
      192
      /* Attribute.Fusion */
    );
  },
  updateBuffs: () => {
    if (!isHeld(MODE_BURST2) || !runningAction(ErosionField))
      return;
    queue(FUSION_BURST_ACTIONS[currentTeam().enemyMax(FUSION_BURST)]);
  },
  updateGlobal: () => {
    if (isHeld(MODE_BURST2) || currentAction().type1 !== 36864)
      return;
    if (stacksOfEnemy(TUNE_STRAIN_SHIFTING) > 0)
      applyEnemy(TUNE_STRAIN_INTERFERED, 1);
  }
});
var DN_SEQUENCES = [DN_S1, DN_S2, DN_S3, DN_S4, DN_S5, DN_S6];
var DN_INHERENT_1 = new Inherent({
  name: "Inherent: Vestiges of Falsehood",
  combatStart: () => {
    applyCurrent(DARK_CORE, 2);
    setForte1(20);
  }
});
var DENIA_TALENTS = new Talent({
  name: "Denia: Talents",
  stats: [[6, 12], [10, 16]]
});
var DENIA_RESONATOR = new Resonator({
  name: "Denia",
  talent: DENIA_TALENTS,
  inherent1: DN_INHERENT_1,
  inherent2: DN_INHERENT_2,
  element: 192,
  weapon: 4,
  // Final Act - Breakdown always closes her loop back in Stagecraft Form, so It's Been A While!
  // is the Intro she enters with; Knock Knock (the Breakdown-form one) is kept for completeness
  intro: () => stacksOf(ENTROPY_BREAKDOWN) ? EIntro4 : Intro22,
  outro: () => Outro23,
  color: "#ecabe3",
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 100,
  constantStats: () => {
    addStat(1, 11025);
    addStat(0, 425);
    addStat(2, 1148.89);
    addStat(12, 10);
  }
});
var UBA12342 = new ActionGroup("Basic - Breakdown Form 1234", [UBA14, UBA23, UBA33, UBA42]);
var UBA122 = new ActionGroup("Basic - Breakdown Form 12", [UBA14, UBA23]);
var USkill12 = new ActionGroup("Skill - Banish 12", [Banish1, Banish2]);
var DN_ROTATION_BURST = new Rotation([
  NOINTRO,
  BA417,
  Skill19,
  Lib15,
  UBA122,
  JUMP,
  UBA12342,
  USkill12,
  Lib26,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  BA417,
  Skill19,
  Lib15,
  UBA12342,
  USkill12,
  Lib26,
  ECHO_SWAP,
  OUTRO
]);
var DN_ROTATION_BURST_S3 = new Rotation([
  NOINTRO,
  INTRO,
  Lib15,
  UBA12342,
  Lib26,
  ECHO_SWAP,
  OUTRO
]);
var DENIA_BURST = new Loadout({
  resonator: DENIA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.Er, Substat.FlatAtk),
  rotation: { 0: DN_ROTATION_BURST, 3: DN_ROTATION_BURST_S3 },
  sequences: DN_SEQUENCES,
  mode: MODE_BURST2
});
var DN_ROTATION_STRAIN = new Rotation([
  NOINTRO,
  Skill19,
  Lib15,
  UBA122,
  DODGE,
  UBA122,
  JUMP,
  UBA122,
  USkill12,
  Lib26,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  BA417,
  Skill19,
  Lib15,
  UBA122,
  JUMP,
  UBA122,
  USkill12,
  Lib26,
  ECHO_SWAP,
  OUTRO
]);
var DN_ROTATION_STRAIN_S3 = new Rotation([
  NOINTRO,
  INTRO,
  Lib15,
  UBA122,
  JUMP,
  UBA122,
  USkill12,
  Lib26,
  ECHO_SWAP,
  OUTRO
]);
var DENIA_STRAIN = new Loadout({
  resonator: DENIA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.Er, Substat.FlatAtk),
  rotation: { 0: DN_ROTATION_STRAIN, 3: DN_ROTATION_STRAIN_S3 },
  sequences: DN_SEQUENCES,
  mode: MODE_STRAIN
});

// dist/src/resonators/fusion/encore.js
function encoreAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA122 = encoreAction("Basic - Wooly Attack 1", { node: 0, cast: 1, type: 4096, mv: 55.66, energy: 0.7, concerto: 1.4, offtune: 3360, forte1: 3 });
var BA222 = encoreAction("Basic - Wooly Attack 2", { node: 0, cast: 1, type: 4096, mv: 66.2, energy: 0.83, concerto: 1.66, offtune: 3996, forte1: 5 });
var BA323 = encoreAction("Basic - Wooly Attack 3", { node: 0, cast: 1, type: 4096, mv: 132.6, energy: 1.66, concerto: 3.32, offtune: 8004, forte1: 6 });
var BA418 = encoreAction("Basic - Wooly Attack 4", { node: 0, cast: 1, type: 4096, mv: 153.08, energy: 1.92, concerto: 3.84, offtune: 9240, forte1: 4 });
var WoolyStrike = encoreAction("Basic - Wooly Strike", { node: 0, cast: 1, type: 4096, mv: 238.57, energy: 3, concerto: 6, offtune: 14400, forte1: 25 });
var HA17 = encoreAction("Heavy - Wooly Attack", { node: 0, cast: 2, type: 8192, mv: 187.08, energy: 2.35, concerto: 4.7, offtune: 11292, forte1: 5 });
var MA20 = encoreAction("Mid-air - Wooly Attack", { node: 0, cast: 1, type: 4096, mv: 123.26, energy: 0.51, concerto: 1, offtune: 14400, forte1: 11 });
var DC19 = encoreAction("Dodge Counter - Wooly Attack", { node: 0, cast: 0, type: 4096, mv: 251.88, energy: 3.16, concerto: 13.32, offtune: 8004, forte1: 6 });
var Skill110 = encoreAction("Skill - Flaming Woolies", { node: 1, cast: 3, type: 12288, mv: 612.88, energy: 15.28, concerto: 15, offtune: 25600, forte1: 32 });
var Skill24 = encoreAction("Skill - Energetic Welcome", { node: 1, cast: 3, type: 12288, mv: 339.16, energy: 0.75, concerto: 6.51, offtune: 9072, forte1: 30 });
var SPEND_MAYHEM = { forte1: -100 };
var CloudyFrenzy = encoreAction("Forte Heavy - Cloudy Frenzy", { node: 2, cast: 2, type: 16384, mv: 773.73, concerto: 10, offtune: 46709, ...SPEND_MAYHEM });
var Liberation18 = encoreAction("Liberation - Cosmos Rave", { node: 3, cast: 4, cutscene: true, concerto: 20, resetEnergy: true });
var UBA15 = encoreAction("Basic - Cosmos: Frolicking 1", { node: 3, cast: 1, type: 4096, mv: 180.36, energy: 1.32, concerto: 2.66, offtune: 6396, forte1: 8 });
var UBA24 = encoreAction("Basic - Cosmos: Frolicking 2", { node: 3, cast: 1, type: 4096, mv: 169.2, energy: 1.23, concerto: 2.49, offtune: 6e3, forte1: 12 });
var UBA35 = encoreAction("Basic - Cosmos: Frolicking 3", { node: 3, cast: 1, type: 4096, mv: 263.96, energy: 1.92, concerto: 3.88, offtune: 9360, forte1: 16 });
var UBA43 = encoreAction("Basic - Cosmos: Frolicking 4", { node: 3, cast: 1, type: 4096, mv: 582.03, energy: 4.29, concerto: 8.58, offtune: 20640, forte1: 27 });
var CosmosHeavy = encoreAction("Heavy - Cosmos: Heavy Attack", { node: 3, cast: 2, type: 8192, mv: 217.58, energy: 1.6, concerto: 3.21, offtune: 7716, forte1: 9 });
var USkill3 = encoreAction("Skill - Cosmos: Rampage", { node: 3, cast: 3, type: 12288, mv: 253.28, energy: 6.56, concerto: 8, offtune: 6168, forte1: 28 });
var CosmosDodgeCounter = encoreAction("Dodge Counter - Cosmos", { node: 3, cast: 0, type: 4096, mv: 263.96, energy: 1.92, concerto: 13.88, offtune: 9360, forte1: 16 });
var FHA8 = encoreAction("Forte Heavy - Cosmos Rupture", { node: 2, cast: 2, type: 16384, mv: 773.73, concerto: 10, offtune: 46709, ...SPEND_MAYHEM });
var Intro23 = encoreAction("Intro - Woolies Helpers", { node: 4, cast: 5, type: 20480, mv: 198.81, energy: 10, concerto: 10, offtune: 15132, forte1: 40 });
var Outro24 = encoreAction("Outro - Thermal Field", { cast: 6, type: 24576, mv: 707.04, concerto: -100, swapOut: true });
var WOOLIES_CHEER_DANCE = new Buff({
  name: "Inherent: Woolies Cheer Dance",
  stats: [[
    17,
    10,
    192
    /* Attribute.Fusion */
  ]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(WOOLIES_CHEER_DANCE);
  }
});
var EN_INHERENT_2 = new Inherent({
  name: "Inherent: Woolies Cheer Dance",
  updateBuffs: () => {
    if (runningAction(Skill110) || runningAction(USkill3))
      applyCurrent(WOOLIES_CHEER_DANCE, 1);
  }
});
var ANGRY_COSMOS = new Buff({
  name: "Inherent: Angry Cosmos",
  stats: [[17, 10]],
  convertStats: () => {
    if (runningAction(FHA8))
      revokeCurrent(ANGRY_COSMOS);
  }
});
var EN_INHERENT_1 = new Inherent({
  name: "Inherent: Angry Cosmos",
  updateBuffs: () => {
    if (runningAction(Liberation18))
      applyCurrent(ANGRY_COSMOS, 1);
  }
});
var S1_STACKS = new Buff({
  name: "Encore S1: Wooly's Fairy Tale",
  maxStacks: 4,
  stats: [[
    17,
    3,
    192
    /* Attribute.Fusion */
  ]],
  perStack: true,
  convertStats: () => {
    if (casting(
      6
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
    ))
      applyCurrent(S1_STACKS, 1);
  }
});
var S22 = new Sequence({
  name: "Encore S2",
  // note removed ba5 trigger to model 10s cooldown
  updateBuffs: () => {
    if (runningAction(Skill24))
      addStat(26, 10);
  }
});
var S32 = new Sequence({
  name: "Encore S3",
  applyStats: () => {
    if (runningAction(CloudyFrenzy) || runningAction(FHA8))
      addStat(16, 40);
  }
});
var S4_TEAM = new Buff({
  name: "Encore S4: Adventure? Let's go!",
  stats: [[
    17,
    20,
    192
    /* Attribute.Fusion */
  ]]
});
var S42 = new Sequence({
  name: "Encore S4",
  updateBuffs: () => {
    if (runningAction(FHA8))
      applyTeam(S4_TEAM, 1);
  }
});
var S52 = new Sequence({
  name: "Encore S5",
  stats: [[
    17,
    35,
    12288
    /* Type1.Skill */
  ]]
});
var S6_LOST_LAMB = new Buff({
  name: "Encore S6: Lost Lamb",
  maxStacks: 5,
  stats: [[6, 5]],
  perStack: true,
  convertStats: () => {
    if (casting(
      6
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
var ENCORE_TALENTS = new Talent({
  name: "Encore: Talents",
  stats: [[6, 12], [
    17,
    12,
    192
    /* Attribute.Fusion */
  ]]
});
var ENCORE_RESONATOR = new Resonator({
  name: "Encore",
  talent: ENCORE_TALENTS,
  inherent1: EN_INHERENT_1,
  inherent2: EN_INHERENT_2,
  tier: 1,
  element: 192,
  weapon: 4,
  intro: () => Intro23,
  outro: () => Outro24,
  color: "#e56b9a",
  maxEnergy: 125,
  maxForte1: 100,
  constantStats: () => {
    addStat(1, 10512.5);
    addStat(0, 425);
    addStat(2, 1247);
  }
});
var UBA12343 = new ActionGroup("Basic - Cosmos: Frolicking 1234", [UBA15, UBA24, UBA35, UBA43]);
var EN_ROTATION = new Rotation([
  INTRO,
  ECHO_ONFIELD,
  // would be swapped
  Skill110,
  // would be swapped
  Liberation18,
  USkill3,
  UBA12343,
  USkill3,
  UBA12343,
  USkill3,
  FHA8.swap(),
  OUTRO
]);
var ENCORE = new Loadout({
  resonator: ENCORE_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Basic, Substat.Er),
  rotation: EN_ROTATION,
  sequences: [S12, S22, S32, S42, S52, S62]
});

// dist/src/resonators/fusion/galbrena.js
function galbrenaAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA124 = galbrenaAction("Basic - Slayer's Trigger 1", { node: 0, cast: 1, type: 8192, mv: 59.18, energy: 0.83, concerto: 1.16, offtune: 2646, forte1: 7.41 });
var BA223 = galbrenaAction("Basic - Slayer's Trigger 2", { node: 0, cast: 1, type: 8192, mv: 131.53, energy: 1.85, concerto: 2.59, offtune: 5880, forte1: 18.52 });
var BA324 = galbrenaAction("Basic - Slayer's Trigger 3", { node: 0, cast: 1, type: 8192, mv: 142.98, energy: 2, concerto: 2.8, offtune: 6394, forte1: 18.52 });
var BA419 = galbrenaAction("Basic - Slayer's Trigger 4", { node: 0, cast: 1, type: 28672, mv: 177.86, energy: 2.49, concerto: 3.48, offtune: 7952, forte1: 14.81 });
var DC20 = galbrenaAction("Dodge Counter - Blood for Blood", { node: 0, cast: 0, type: 8192, mv: 205.24, offtune: 6394, concerto: 12.8, energy: 2 });
var MA21 = galbrenaAction("Basic - Ashfall Barrage (Plunge)", { node: 0, cast: 1, type: 8192, mv: 143.15, energy: 2, concerto: 2.8, offtune: 6400 });
var MASustained = galbrenaAction("Basic - Ashfall Barrage (Sustained Fire)", { node: 0, cast: 1, type: 8192, mv: 26.84, energy: 0.38, concerto: 0.53, offtune: 1200 });
var HA18 = galbrenaAction("Heavy - Volley of Death 1", { node: 0, cast: 2, type: 8192, mv: 106.6, energy: 1.5, concerto: 2.1, offtune: 4766, forte1: 7.41 });
var HA24 = galbrenaAction("Heavy - Volley of Death 2", { node: 0, cast: 2, type: 8192, mv: 69.18, energy: 0.98, concerto: 1.36, offtune: 3094, forte1: 25.93 });
var HA33 = galbrenaAction("Heavy - Volley of Death 3", { node: 0, cast: 2, type: 28672, mv: 167.7, energy: 2.37, concerto: 3.29, offtune: 7499, forte1: 18.52 });
var DRIVE = { updateBuffs: () => applyCurrent(BURNING_DRIVE, 1) };
var Encroach = galbrenaAction("Skill - Encroach", { node: 1, cast: 3, type: 8192, mv: 35.78, concerto: 2.22, energy: 6.59, offtune: 5039, forte1: 18.52, ...DRIVE });
var AscentOfMalice = galbrenaAction("Skill - Ascent of Malice", {
  node: 1,
  cast: 3,
  type: 8192,
  mv: 103.14,
  energy: 14.76,
  concerto: 10,
  offtune: 5588,
  forte1: -100,
  forte2: 100,
  // the conversion is a top-off, not a top-up: Purging Flame is emptied ahead of the +100 above,
  // so it lands on exactly 100 from wherever the enhanced chain left it
  resetForte2: true,
  updateBuffs: () => {
    applyCurrent(BURNING_DRIVE, 1);
    applyCurrent(DEMON_HYPOSTASIS, 1);
  }
});
var SeraphicExecution1 = galbrenaAction("Forte Basic - Seraphic Execution 1", { node: 2, cast: 1, type: 8192, mv: 58.99, energy: 1, concerto: 5.54, offtune: 2374, forte2: -4.88 });
var SeraphicExecution2 = galbrenaAction("Forte Basic - Seraphic Execution 2", { node: 2, cast: 1, type: 8192, mv: 139.19, energy: 2, concerto: 6.95, offtune: 5600, forte2: -9.76 });
var SeraphicExecution3 = galbrenaAction("Forte Basic - Seraphic Execution 3", { node: 2, cast: 1, type: 8192, mv: 243.17, energy: 3.34, concerto: 8.79, offtune: 9786, forte2: -18.29 });
var SeraphicExecution4 = galbrenaAction("Forte Basic - Seraphic Execution 4", { node: 2, cast: 1, type: 28672, mv: 181.47, energy: 2.56, concerto: 7.7, offtune: 7305, forte2: -13.41, ...DRIVE });
var SeraphicExecution5 = galbrenaAction("Forte Basic - Seraphic Execution 5", { node: 2, cast: 1, type: 28672, mv: 224.27, energy: 3.08, concerto: 8.46, offtune: 9025, forte2: -19.51 });
var FlamewingVerdict1 = galbrenaAction("Forte Heavy - Flamewing Verdict 1", { node: 2, cast: 2, type: 8192, mv: 118.44, energy: 1.74, concerto: 6.6, offtune: 4766, forte2: -9.76 });
var FlamewingVerdict2 = galbrenaAction("Forte Heavy - Flamewing Verdict 2", { node: 2, cast: 2, type: 8192, mv: 76.7, energy: 1.22, concerto: 5.86, offtune: 3086, forte2: -7.32 });
var FlamewingVerdict3 = galbrenaAction("Forte Heavy - Flamewing Verdict 3", { node: 2, cast: 2, type: 28672, mv: 176.84, energy: 2.49, concerto: 7.64, offtune: 7117, forte2: -14.63 });
var Ravage = galbrenaAction("Forte Skill - Ravage", {
  node: 2,
  cast: 3,
  type: 8192,
  mv: 35.78,
  energy: 6.59,
  concerto: 2.22,
  offtune: 5039,
  resetForte2: true,
  updateBuffs: () => applyCurrent(BURNING_DRIVE, 1)
});
var Liberation19 = galbrenaAction("Liberation - Hellfire Absolution", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 28672,
  mv: 1109.04,
  concerto: 20,
  offtune: 84003,
  resetEnergy: true,
  updateBuffs: () => applyCurrent(HELLFIRE_WINDOW, 1)
});
var Intro24 = galbrenaAction("Intro - Hellflare Overload", { node: 4, cast: 5, type: 20480, mv: 94.12, energy: 10, concerto: 10, offtune: 4208, forte1: 11.11, ...DRIVE });
var Outro25 = galbrenaAction("Outro - Ashen Pursuit", { cast: 6, type: 24576, mv: 795, offtune: 30326, concerto: -100, energy: 10.03, swapOut: true });
var BURNING_DRIVE = new Buff({
  name: "Galbrena: Burning Drive",
  // S2: 350% more of the bonus, so 20% becomes 90%
  applyStats: () => {
    addStat(6, 20);
    if (isHeld(GB_S2))
      asSource(GB_S2, () => addStat(6, 70));
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(BURNING_DRIVE);
  }
});
var OATHBOUND_HUNT = new Buff({
  name: "Galbrena: Fated End",
  maxStacks: 4,
  stats: [[18, 5]],
  perStack: true,
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(OATHBOUND_HUNT);
  }
});
var GB_INHERENT_1 = new Inherent({
  name: "Inherent: Oathbound Hunt",
  updateBuffs: () => {
    if (!casting(
      7
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
    if (runningAction(SeraphicExecution1) || runningAction(SeraphicExecution2) || runningAction(SeraphicExecution3) || runningAction(SeraphicExecution4) || runningAction(SeraphicExecution5) || runningAction(FlamewingVerdict1) || runningAction(FlamewingVerdict2) || runningAction(FlamewingVerdict3) || runningAction(Ravage)) {
      addStat(19, Math.min(60, 1.5 * frozenStacks()));
      const flame = frozenStacks();
      if (isHeld(GB_S1))
        asSource(GB_S1, () => addStat(10, Math.min(80, 2 * flame)));
      if (isHeld(GB_S6))
        asSource(GB_S6, () => addStat(
          18,
          Math.min(35, 0.875 * flame),
          192
          /* Attribute.Fusion */
        ));
    }
  }
});
var HELLFIRE_WINDOW = new Buff({
  name: "Galbrena: Hellfire Absolution",
  applyStats: () => {
    if (runningAction(SeraphicExecution1) || runningAction(SeraphicExecution2) || runningAction(SeraphicExecution3) || runningAction(SeraphicExecution4) || runningAction(SeraphicExecution5) || runningAction(FlamewingVerdict1) || runningAction(FlamewingVerdict2) || runningAction(FlamewingVerdict3))
      addStat(16, 85);
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(HELLFIRE_WINDOW);
  }
});
var GB_S1 = new Sequence({ name: "Galbrena S1: Heart of Defiance Ever Ablaze" });
var GB_S2 = new Sequence({ name: "Galbrena S2: Hellbound Dive of Fire and Abyss" });
var GB_S3 = new Sequence({
  name: "Galbrena S3: Hunter's Blood Oath Rekindled",
  applyStats: () => {
    if (runningAction(Liberation19))
      addStat(16, 130);
  }
});
var CARRY_FORTH = new Buff({
  name: "Galbrena S4: Carry Forth This Fading Spark",
  stats: [[17, 20]]
});
var GB_S4 = new Sequence({
  name: "Galbrena S4: Carry Forth This Fading Spark",
  updateGlobal: () => {
    if (casting(
      7
      /* Cast.Echo */
    ))
      applyTeam(CARRY_FORTH, 1);
  }
});
var GB_S5 = new Sequence({
  name: "Galbrena S5: Though Light Fades, Torment Consumes",
  applyStats: () => {
    if (runningAction(Encroach) || runningAction(AscentOfMalice) || runningAction(Ravage))
      addStat(16, 150);
  }
});
var GB_S6 = new Sequence({
  name: "Galbrena S6: I Remain Who I am, Eternal My Flame",
  applyStats: () => {
    if (runningAction(SeraphicExecution1) || runningAction(SeraphicExecution2) || runningAction(SeraphicExecution3) || runningAction(SeraphicExecution4) || runningAction(SeraphicExecution5) || runningAction(FlamewingVerdict1) || runningAction(FlamewingVerdict2) || runningAction(FlamewingVerdict3)) {
      addStat(16, isHeld(HELLFIRE_WINDOW) ? 60 * 1.85 : 60);
    }
  }
});
var GB_SEQUENCES = [GB_S1, GB_S2, GB_S3, GB_S4, GB_S5, GB_S6];
var GALBRENA_TALENTS = new Talent({
  name: "Galbrena: Talents",
  stats: [[6, 12], [10, 16]]
});
var GALBRENA_RESONATOR = new Resonator({
  name: "Galbrena",
  talent: GALBRENA_TALENTS,
  inherent1: GB_INHERENT_1,
  inherent2: GB_INHERENT_2,
  element: 192,
  weapon: 2,
  intro: () => Intro24,
  outro: () => Outro25,
  color: "#3454ac",
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 100,
  // reacts to *any* team member's own Echo cast, not just her own — see AFTERFLAME's own comment
  updateGlobal: () => {
    if (casting(
      7
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
var SeraphicExecution2345 = new ActionGroup("Forte Basic - Seraphic Execution 2345", [SeraphicExecution2, SeraphicExecution3, SeraphicExecution4, SeraphicExecution5]);
var SeraphicExecution345 = new ActionGroup("Forte Basic - Seraphic Execution 345", [SeraphicExecution3, SeraphicExecution4, SeraphicExecution5]);
var BA2344 = new ActionGroup("Basic - Slayer's Trigger 234", [BA223, BA324, BA419]);
var BA345 = new ActionGroup("Basic - Slayer's Trigger 34", [BA324, BA419]);
var GB_ROTATION = new Rotation([
  INTRO,
  ECHO_CANCEL,
  HA24,
  HA33,
  BA345,
  Encroach,
  AscentOfMalice,
  Liberation19,
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
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Heavy, Substat.Er),
  rotation: { 0: GB_ROTATION },
  sequences: GB_SEQUENCES
});

// dist/src/resonators/fusion/jingran.js
function jingranAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA125 = jingranAction("Basic - Devil's Bane 1", { node: 0, cast: 1, type: 4096, mv: 39.82, energy: 0.67, concerto: 1.34, offtune: 2136 });
var BA224 = jingranAction("Basic - Devil's Bane 2", { node: 0, cast: 1, type: 4096, mv: 99.47, energy: 1.68, concerto: 3.35, offtune: 5337 });
var BA325 = jingranAction("Basic - Devil's Bane 3", { node: 0, cast: 1, type: 8192, mv: 159.1, energy: 2.69, concerto: 5.36, offtune: 8537, forte1: 50 });
var BA420 = jingranAction("Basic - Devil's Bane 4", { node: 0, cast: 1, type: 8192, mv: 124.24, energy: 2.09, concerto: 4.18, offtune: 6666, forte1: 50 });
var MA27 = jingranAction("Mid-air - Edge of Life and Death", { node: 0, cast: 1, type: 4096, mv: 92.45, energy: 1.55, concerto: 3.1, offtune: 4960 });
var EBA14 = jingranAction("Basic - Drink Soul 1", { node: 0, cast: 1, type: 4096, mv: 44.74, energy: 0.75, concerto: 1.5, offtune: 2400 });
var EBA23 = jingranAction("Basic - Drink Soul 2", { node: 0, cast: 1, type: 4096, mv: 74.56, energy: 1.26, concerto: 2.5, offtune: 4e3 });
var EBA33 = jingranAction("Basic - Drink Soul 3", { node: 0, cast: 1, type: 8192, mv: 109.32, energy: 1.84, concerto: 3.68, offtune: 5864, forte1: 50 });
var EBA43 = jingranAction("Basic - Drink Soul 4", { node: 0, cast: 1, type: 8192, mv: 153.16, energy: 2.6, concerto: 5.16, offtune: 8218, forte1: 50 });
var DC21 = jingranAction("Dodge Counter - Light Watch", { node: 0, cast: 0, type: 8192, mv: 198.8, energy: 10, concerto: 6.68, offtune: 8e3, forte1: 100 });
var EDC3 = jingranAction("Dodge Counter - Nether Dive", { node: 0, cast: 0, type: 8192, mv: 248.57, energy: 4.19, concerto: 18.36, offtune: 13337, forte1: 100 });
var Skill111 = jingranAction("Skill - Scorching Yang", { node: 1, cast: 3, type: 12288, mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 5600 });
var Skill25 = jingranAction("Skill - Afterlife's Guide", { node: 1, cast: 3, type: 8192, mv: 258.47, energy: 3.35, concerto: 5, offtune: 10667, forte1: 100 });
var ESkill1 = jingranAction("Skill - Encroaching Yin", { node: 1, cast: 3, type: 12288, mv: 164.04, energy: 1.75, concerto: 3.5, offtune: 5600 });
var ESkill22 = jingranAction("Skill - Netherworld Traverse", { node: 1, cast: 3, type: 8192, mv: 263.48, energy: 3.43, concerto: 5, offtune: 10936, forte1: 100 });
var Lib5 = jingranAction("Liberation - Burial of Thousand Souls", {
  node: 3,
  cast: 4,
  cutscene: true,
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
var Intro25 = jingranAction("Intro - Question the Tombs", {
  node: 4,
  cast: 5,
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
var Outro26 = jingranAction("Outro - Rising Fortune and Ebbing Evil", {
  cast: 6,
  type: 24576,
  mv: 795,
  concerto: -100,
  swapOut: true,
  resetForte2: true,
  updateBuffs: () => revokeCurrent(JINGRAN_FORTUNE)
});
var BURNS_MINGFIRE = { updateBuffs: () => {
  if (forte2() > 0)
    applyCurrent(JINGRAN_FIRE_OF_LIFE, 1);
} };
var FHA9 = jingranAction("Forte Heavy - Stardome Meander", { node: 2, cast: 2, type: 8192, mv: 240.38, energy: 8.5, concerto: 13, offtune: 10400, forte1: -300, ...BURNS_MINGFIRE });
var EFHA = jingranAction("Forte Heavy - Soul Raid", { node: 2, cast: 2, type: 8192, mv: 234.29, energy: 8.53, concerto: 13, offtune: 10140, forte1: -300, ...BURNS_MINGFIRE });
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
    if (runningAction(Intro25) || runningAction(Skill111) || runningAction(ESkill1))
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
    if (runningAction(Outro26))
      applyCurrent(JINGRAN_FIXATION, 1);
  },
  // `currentSlot` is switched to Jingran's own slot for this call regardless of who's actually
  // acting, so `applySelf()`/`isHeld()` below always resolve against him specifically.
  updateGlobal: () => {
    if (currentTeam().slot.resonator === JINGRAN_RESONATOR || !applied2(SHIELD))
      return;
    applyCurrent(JINGRAN_GHOST_SHROUD, 2 * applied2(SHIELD));
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
    addStat(25, 6.2 * steps);
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
  // S3 replaces it with Yin-Yang Everflow's own 50 a step (capped 2500) while that window stands
  convertStats: () => {
    const steps = hpSteps();
    addStat(3, 36 * steps);
    if (isHeld(JR_EVERFLOW))
      asSource(JR_S3, () => addStat(3, 14 * steps));
  }
});
function fireSteps() {
  return Math.max(0, Math.floor((Math.min(hp(), 5e4) - 25e3) / 1e3));
}
var JINGRAN_FIRE_OF_LIFE = new Buff({
  name: "Jingran: Fire of Life",
  convertStats: () => {
    const mingfire = forte2();
    queue(ACTION_LIB_FUA);
    addStat(31, -25);
    if (mingfire > 25)
      addStat(30, 200);
    addStat(15, (runningAction(FHA9) ? 21.65 : 21.1) * fireSteps());
    revokeCurrent(JINGRAN_FIRE_OF_LIFE);
  }
});
var JR_S1 = new Sequence({
  name: "Jingran S1: Yin and Yang in Harmony, the Ultimate Law of Being",
  applyStats: () => {
    if (runningAction(Skill111) || runningAction(Skill25) || runningAction(ESkill1) || runningAction(ESkill22))
      addStat(16, 80);
  }
});
var NETHERWORLDS_BOON = new Buff({
  name: "Jingran S2: Netherworld's Boon",
  applyStats: () => {
    if (!runningAction(FHA9) && !runningAction(EFHA))
      return;
    addStat(18, 180);
    addStat(26, 31.25);
  },
  convertStats: () => {
    if (runningAction(FHA9) || runningAction(EFHA))
      revokeCurrent(NETHERWORLDS_BOON);
  }
});
var JR_S2 = new Sequence({
  name: "Jingran S2: A Solitary Lantern, Across Lands Shade-Trodden",
  combatStart: () => {
    addForte1(300);
    applyCurrent(NETHERWORLDS_BOON, 1);
  },
  applyStats: () => {
    if (runningAction(FHA9) || runningAction(EFHA))
      addStat(16, 46);
  }
});
var JR_EVERFLOW = new Buff({
  name: "Jingran S3: Yin-Yang Everflow",
  until: 0
});
var JR_S3 = new Sequence({
  name: "Jingran S3: World's Course Shifts, Each to Their Rightful Paths",
  updateBuffs: () => {
    if (runningAction(FHA9) || runningAction(EFHA))
      applyCurrent(JINGRAN_GHOST_SHROUD, 5);
    if (runningAction(Lib5))
      applyCurrent(JR_EVERFLOW, 1);
  }
});
var WHERE_REALITY_MEETS = new Buff({
  name: "Jingran S4: Where Reality Meets Illusion, Where Living Meet Dead",
  stats: [[17, 20]]
});
var JR_S4 = new Sequence({
  name: "Jingran S4: Where Reality Meets Illusion, Where Living Meet Dead",
  updateGlobal: () => {
    if (applied2(SHIELD))
      applyTeam(WHERE_REALITY_MEETS, 1);
  }
});
var JR_S5 = new Sequence({ name: "Jingran S5: Ends Return to Beginnings, Truth of Life Laid Bare" });
var PARADE_FIELD = new ActionField("Jingran: Parade of Thousand Souls");
var ACTION_PARADE_FUA = ACTION_LIB_FUA.variant("Liberation - Chimei Wangliang", { field: PARADE_FIELD });
var JR_PARADE = new Buff({
  name: "Jingran S6: Parade of Thousand Souls",
  maxStacks: 8,
  field: PARADE_FIELD,
  // it ends with Yinghuo, which nothing here marks — its own 15s is his visit either way, so the
  // window is what carries it rather than a poke at the Mingfire gauge, which is a different thing
  until: 0,
  updateBuffs: () => {
    const a = currentAction();
    if (runningAction(Lib5) || runningAction(ACTION_LIB_FUA) || runningAction(ACTION_PARADE_FUA) || a.mv <= 0)
      return;
    removeStack(JR_PARADE, 1);
    queue(ACTION_PARADE_FUA);
  }
});
var JR_S6 = new Sequence({
  name: "Jingran S6: As Favors and Feuds Fade, New Stories Await",
  updateBuffs: () => {
    if (runningAction(Lib5))
      applyCurrent(JR_PARADE, 8);
  },
  applyStats: () => {
    addStat(
      20,
      40,
      8192
      /* Type1.Heavy */
    );
    if (runningAction(ACTION_LIB_FUA) || runningAction(ACTION_PARADE_FUA))
      addStat(16, 80);
  }
});
var JR_SEQUENCES = [JR_S1, JR_S2, JR_S3, JR_S4, JR_S5, JR_S6];
var SHIELDS2 = /* @__PURE__ */ new Map([
  [BA125, 1],
  [BA224, 1],
  [BA325, 2],
  [BA420, 2],
  [MA27, 1],
  [EBA14, 1],
  [EBA23, 1],
  [EBA33, 2],
  [EBA43, 2],
  [DC21, 1],
  [EDC3, 1],
  [Skill111, 1],
  [ESkill1, 1],
  [Skill25, 2],
  [ESkill22, 2],
  [Lib5, 1],
  [Intro25, 1],
  [FHA9, 1],
  [EFHA, 1]
]);
var JINGRAN_TALENTS = new Talent({
  name: "Jingran: Talents",
  stats: [[9, 8], [7, 12]]
});
var JINGRAN_RESONATOR = new Resonator({
  name: "Jingran",
  talent: JINGRAN_TALENTS,
  inherent1: JR_INHERENT_1,
  inherent2: JR_INHERENT_2,
  element: 192,
  weapon: 1,
  intro: () => Intro25,
  outro: () => Outro26,
  color: "#f2c13c",
  maxEnergy: 125,
  maxForte1: 300,
  maxForte2: 100,
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
    if (applied2(SHIELD))
      applyCurrent(JINGRAN_GHOST_SHROUD, applied2(SHIELD));
  },
  constantStats: () => {
    addStat(1, 15375);
    addStat(0, 313);
  }
});
var EBA2342 = new ActionGroup("Basic - Drink Soul 234", [EBA23, EBA33, EBA43]);
var BA2345 = new ActionGroup("Basic - Devil's Bane 234", [BA224, BA325, BA420]);
var JR_ROTATION = new Rotation([
  INTRO,
  BA224,
  Lib5,
  FHA9,
  EBA2342,
  EFHA,
  Skill111,
  Skill25,
  FHA9,
  ESkill1,
  ESkill22,
  EFHA,
  ECHO_SWAP,
  OUTRO
]);
var JINGRAN = new Loadout({
  resonator: JINGRAN_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.HpPct, Substat.Heavy),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.Er, Substat.HpPct),
  rotation: { 0: JR_ROTATION },
  sequences: JR_SEQUENCES
});

// dist/src/resonators/fusion/lupa.js
function lupaAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA126 = lupaAction("Basic - Flaming Star 1", { node: 0, cast: 1, type: 4096, mv: 90.08, energy: 1.34, concerto: 2.67, offtune: 4264, forte1: 7.5 });
var BA225 = lupaAction("Basic - Flaming Star 2", { node: 0, cast: 1, type: 4096, mv: 90.08, energy: 1.34, concerto: 2.67, offtune: 4264, forte1: 7.5 });
var BA326 = lupaAction("Basic - Flaming Star 3", { node: 0, cast: 1, type: 4096, mv: 157.68, energy: 2.37, concerto: 4.68, offtune: 7464, forte1: 12.5 });
var BA421 = lupaAction("Basic - Flaming Star 4", { node: 0, cast: 1, type: 4096, mv: 246.24, energy: 3.66, concerto: 7.3, offtune: 11656, forte1: 17.5 });
var EBA5 = lupaAction("Basic - Flaming Star: Starfall", { node: 0, cast: 1, type: 4096, mv: 168.66, energy: 2.51, concerto: 5.02, offtune: 7985, forte1: 5 });
var MA28 = lupaAction("Basic - Flaming Star: Plunge", { node: 0, cast: 1, type: 4096, mv: 104.79, energy: 1.56, concerto: 3.11, offtune: 4960, forte1: 5 });
var DC22 = lupaAction("Dodge Counter - Flaming Star", { node: 0, cast: 0, type: 4096, mv: 273.44, energy: 4.07, concerto: 18.13, offtune: 12944 });
var MA110 = lupaAction("Mid-air - Flaming Star 1", { node: 0, cast: 1, type: 4096, mv: 76.73, energy: 1.14, concerto: 2.27, offtune: 3632, forte1: 7 });
var MA29 = lupaAction("Mid-air - Flaming Star 2", { node: 0, cast: 1, type: 4096, mv: 154.47, energy: 2.31, concerto: 4.61, offtune: 7312, forte1: 13 });
var MA36 = lupaAction("Mid-air - Flaming Star 3", { node: 0, cast: 1, type: 4096, mv: 56.96, energy: 0.86, concerto: 1.7, offtune: 2696 });
var HA19 = lupaAction("Heavy - Flaming Star", { node: 0, cast: 2, type: 8192, mv: 112.72, energy: 1.68, concerto: 3.34, offtune: 5336 });
var EMA3 = lupaAction("Mid-air - Firestrike", { node: 0, cast: 1, type: 8192, mv: 56.96, energy: 0.86, concerto: 10, offtune: 2696, forte1: -50, forte2: 1 });
var EHA3 = lupaAction("Heavy - Wolf's Gnawing", { node: 0, cast: 2, type: 8192, mv: 112.22, energy: 1.66, concerto: 10, offtune: 5312, forte1: -50, forte2: 1 });
var EHA4 = lupaAction("Heavy - Wolf's Claw", { node: 0, cast: 2, type: 8192, mv: 240.5, energy: 3.58, concerto: 10, offtune: 11385, forte1: -50, forte2: 1 });
var Skill112 = lupaAction("Skill - Shewolf's Hunt", {
  node: 1,
  cast: 3,
  type: 12288,
  mv: 140.77,
  energy: 2.09,
  concerto: 4.17,
  offtune: 6664,
  forte1: 15,
  updateBuffs: () => applyEnemy(LUPA_MARK, 1)
});
var Skill26 = lupaAction("Skill - Feral Fang", { node: 1, cast: 3, type: 12288, mv: 313.61, energy: 13.67, offtune: 5328, forte1: 15 });
var USkill4 = lupaAction("Skill - Foebreaker", {
  node: 3,
  cast: 3,
  type: 12288,
  mv: 304.46,
  concerto: 20,
  offtune: 6448,
  forte1: -100,
  updateBuffs: () => applyCurrent(BURNING_MATCHPOINT, 1)
});
var Liberation20 = lupaAction("Liberation - Fire-Kissed Glory", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 820.44,
  concerto: 20,
  offtune: 48e3,
  forte1: 100,
  resetEnergy: true,
  // "Restores 100 points of Wolflame" is a hard top-off, not additive on top of whatever was
  // already held, and every point of Wolfaith goes: both reset ahead of the declared +100
  resetForte1: true,
  resetForte2: true,
  // a fresh window at its own one stack (6% ATK): the Liberation *grants* Pack Hunt, and the
  // Intros that enhanced the last one don't carry into it
  updateBuffs: () => {
    revokeTeam(PACK_HUNT);
    applyTeam(PACK_HUNT, 1);
  }
});
var BACKUP = { updateBuffs: () => applyTeam(LUPA_BACKUP_READY, 1) };
var FSkill6 = lupaAction("Forte Skill - Dance With the Wolf", { node: 2, cast: 3, type: 16384, mv: 560.21, energy: 30, concerto: 15.02, offtune: 16016, forte2: -2, ...BACKUP });
var UFSkill = lupaAction("Forte Skill - Dance With the Wolf: Climax", { node: 2, cast: 3, type: 16384, mv: 756.26, energy: 30, concerto: 30, offtune: 54416, forte2: -2, ...BACKUP });
var fskillFUA = lupaAction("Forte Skill - Set the Arena Ablaze", { node: 2, type: 12288, mv: 211.75, offtune: 9600 });
var Intro26 = lupaAction("Intro - Try Focusing, Eh?", { node: 4, cast: 5, type: 20480, mv: 198.4, energy: 10.02, concerto: 10, offtune: 9393 });
var EIntro5 = lupaAction("Intro - Nowhere to Run!", { node: 4, cast: 5, type: 16384, mv: 991.97, energy: 10, concerto: 10, offtune: 16e3 });
var Outro27 = lupaAction("Outro - Stand by Me, Warrior", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(LUPA_OUTRO)
});
var PACK_HUNT = new Buff({
  name: "Lupa: Pack Hunt",
  maxStacks: 3,
  updateBuffs: () => {
    if (casting(
      5
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
    else if (lupaHolds(LP_S3))
      asSource(LP_S3, () => addStat(
        17,
        10,
        192
        /* Attribute.Fusion */
      ));
  }
});
var lupaHolds = (node) => currentTeam().slots.find((m) => m.resonator === LUPA_RESONATOR)?.isHeld(node) ?? false;
var GLORY = new Buff({
  name: "Lupa: Glory",
  maxStacks: 3,
  // the count is who it is scaled by, not a stack of anything: it reads as the Fusion members
  display: () => `Lupa: Glory (${frozenStacks()} Fusion)`,
  applyStats: () => {
    if (lupaHolds(LP_S3)) {
      asSource(LP_S3, () => addStat(
        21,
        15,
        192
        /* Attribute.Fusion */
      ));
      return;
    }
    addStat(
      21,
      3 * frozenStacks(),
      192
      /* Attribute.Fusion */
    );
    if (frozenStacks() >= 3)
      addStat(
        21,
        6,
        192
        /* Attribute.Fusion */
      );
  }
});
var LUPA_OUTRO = new Buff({
  name: "Lupa: Outro",
  stats: [[
    18,
    20,
    192
    /* Attribute.Fusion */
  ], [
    18,
    25,
    4096
    /* Type1.Basic */
  ]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var WILDFIRE_BANNER = new Buff({
  name: "Lupa: Wildfire Banner",
  stats: [[6, 12]],
  convertStats: () => {
    if (runningAction(fskillFUA))
      revokeCurrent(WILDFIRE_BANNER);
  }
});
var LP_INHERENT_1 = new Inherent({ name: "Inherent: Remember My Name" });
var LP_INHERENT_2 = new Inherent({
  name: "Inherent: Applause of Victory",
  updateBuffs: () => {
    if (runningAction(Liberation20)) {
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
    if (runningAction(Skill26))
      addStat(16, 50);
  },
  convertStats: () => {
    if (runningAction(Skill26) || runningAction(Liberation20))
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
      addStat(30, 5 * a.forte1);
  },
  convertStats: () => {
    if (runningAction(FSkill6) || runningAction(UFSkill))
      revokeCurrent(BURNING_MATCHPOINT);
  }
});
var LUPA_BACKUP_READY = new Buff({
  name: "Lupa: Set the Arena Ablaze",
  applyStats: () => {
    if (casting(
      4
      /* Cast.Liberation */
    ) && currentTeam().slot.resonator !== LUPA_RESONATOR) {
      queueOn(LUPA_RESONATOR, fskillFUA);
      revokeTeam(LUPA_BACKUP_READY);
    }
  }
});
var NAMELESS_ONE = new Buff({
  name: "Lupa S1: Behold the Nameless One",
  stats: [[9, 20]],
  until: 0
});
var LP_S1 = new Sequence({
  name: "Lupa S1: Behold the Nameless One",
  updateBuffs: () => {
    if (runningAction(Liberation20))
      applyCurrent(NAMELESS_ONE, 1);
  },
  applyStats: () => {
    if (runningAction(Liberation20))
      addStat(27, 10);
  }
});
var HER_HUNTING_FIELD = new Buff({
  name: "Lupa S2: Every Ground, Her Hunting Field",
  maxStacks: 2,
  stats: [[
    17,
    20,
    192
    /* Attribute.Fusion */
  ]],
  perStack: true
});
var LP_S2 = new Sequence({
  name: "Lupa S2: Every Ground, Her Hunting Field",
  updateBuffs: () => {
    if (runningAction(Liberation20) || runningAction(EHA3) || runningAction(EHA4) || runningAction(EMA3))
      applyTeam(HER_HUNTING_FIELD, 1);
  }
});
var LP_S3 = new Sequence({
  name: "Lupa S3: Wolflame Howls in Her Wake",
  applyStats: () => {
    if (runningAction(EIntro5))
      addStat(16, 100);
  }
});
var LP_S4 = new Sequence({
  name: "Lupa S4: High and Aflame Is Her Banner",
  applyStats: () => {
    if (runningAction(UFSkill))
      addStat(16, 125);
  }
});
var THUNDEROUS_TRIUMPH = new Buff({
  name: "Lupa S5: Embrace the Thunderous Triumph",
  stats: [[
    17,
    15,
    16384
    /* Type1.Liberation */
  ]],
  until: 0
});
var LP_S5 = new Sequence({
  name: "Lupa S5: Embrace the Thunderous Triumph",
  updateBuffs: () => {
    if (runningAction(Intro26) || runningAction(EIntro5))
      applyCurrent(THUNDEROUS_TRIUMPH, 1);
  }
});
var LP_S6 = new Sequence({
  name: "Lupa S6: To the Brightest Flaming Star",
  applyStats: () => {
    if (runningAction(UFSkill) || runningAction(Liberation20) || runningAction(EIntro5))
      addStat(23, 30);
    if (runningAction(Skill26))
      addStat(30, 100);
  }
});
var LP_SEQUENCES = [LP_S1, LP_S2, LP_S3, LP_S4, LP_S5, LP_S6];
var LUPA_TALENTS = new Talent({
  name: "Lupa: Talents",
  stats: [[9, 8], [6, 12]]
});
var LUPA_RESONATOR = new Resonator({
  name: "Lupa",
  talent: LUPA_TALENTS,
  inherent1: LP_INHERENT_1,
  inherent2: LP_INHERENT_2,
  element: 192,
  weapon: 1,
  intro: () => {
    if (stacksOfTeam(PACK_HUNT) < 3)
      return Intro26;
    if (!isHeld(LP_S6)) {
      revokeTeam(PACK_HUNT);
      revokeTeam(GLORY);
    }
    return EIntro5;
  },
  outro: () => Outro27,
  color: "#e8483a",
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 2,
  // every cast that arms Set the Arena Ablaze
  updateBuffs: () => {
    if (runningAction(Skill26) || runningAction(EHA3) || runningAction(EHA4) || runningAction(EMA3) || runningAction(Liberation20) || runningAction(FSkill6) || runningAction(UFSkill)) {
      applyCurrent(WILDFIRE_BANNER, 1);
    }
  },
  constantStats: () => {
    addStat(1, 11912.5);
    addStat(0, 387.5);
    addStat(2, 1186);
  }
});
var MA122 = new ActionGroup("Mid-air - Flaming Star 12", [MA110, MA29]);
var LP_LOOP = new Rotation([
  NOINTRO,
  Skill112,
  INTRO,
  ECHO_CANCEL,
  Liberation20,
  USkill4,
  MA122,
  EMA3,
  EHA4,
  UFSkill,
  OUTRO
]);
var LUPA = new Loadout({
  resonator: LUPA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.Er, Substat.FlatAtk),
  rotation: { 0: LP_LOOP },
  sequences: LP_SEQUENCES
});

// dist/src/resonators/fusion/mornye.js
function mornyeAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA127 = mornyeAction("Basic - Ground State Calibration 1", { node: 0, cast: 1, type: 4096, mv: 55.69, energy: 0.89, concerto: 2.8, offtune: 2800, forte1: 20 });
var BA226 = mornyeAction("Basic - Ground State Calibration 2", { node: 0, cast: 1, type: 4096, mv: 119.32, energy: 1.92, concerto: 6, offtune: 6e3, forte1: 43 });
var BA327 = mornyeAction("Basic - Ground State Calibration 3", { node: 0, cast: 1, type: 4096, mv: 103.4, energy: 1.67, concerto: 5.2, offtune: 5200, forte1: 37 });
var BA422 = mornyeAction("Basic - Ground State Calibration 4", { node: 0, cast: 1, type: 4096, mv: 135.2, energy: 2.13, concerto: 6.8, offtune: 6800, forte1: 100 });
var HA20 = mornyeAction("Heavy - Ground State Calibration", { node: 0, cast: 2, type: 8192, mv: 37, energy: 0.79, concerto: 2.5, offtune: 2480, forte1: 20 });
var MA30 = mornyeAction("Mid-air - Ground State Calibration", { node: 0, cast: 1, type: 4096, mv: 98.61, energy: 1.55, concerto: 4.96, offtune: 4960 });
var DC23 = mornyeAction("Dodge Counter - Ground State Calibration", { node: 0, cast: 0, type: 4096, mv: 162.23, energy: 2.55, concerto: 18.16, offtune: 8160, forte1: 20 });
var WBA1 = mornyeAction("Basic - Wide Field Observation 1", { node: 0, cast: 1, type: 4096, mv: 55.68, energy: 0.88, concerto: 1.4, offtune: 2800, forte2: 10 });
var WBA2 = mornyeAction("Basic - Wide Field Observation 2", { node: 0, cast: 1, type: 4096, mv: 103.4, energy: 1.64, concerto: 2.56, offtune: 5200, forte2: 12 });
var WBA3 = mornyeAction("Basic - Wide Field Observation 3", { node: 0, cast: 1, type: 4096, mv: 103.42, energy: 1.64, concerto: 2.56, offtune: 5200, forte2: 18 });
var WDC = mornyeAction("Dodge Counter - Wide Field Observation", { node: 0, cast: 0, type: 4096, mv: 103.4, energy: 1.64, concerto: 12.56, offtune: 5200, forte2: 12 });
var FIELD = { updateBuffs: () => queue(SyntonyFieldHit) };
var GeopotentialShift = mornyeAction("Forte Heavy - Geopotential Shift", { node: 2, cast: 2, type: 8192, mv: 143.16, energy: 3.01, concerto: 9.61, offtune: 9600, forte1: -100, ...FIELD });
var Inversion = mornyeAction("Forte Heavy - Inversion", {
  node: 2,
  cast: 2,
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
var Skill20 = mornyeAction("Skill - Expectation Error", { node: 1, cast: 3, ...SKILL_HEAL });
var OptimalSolution = mornyeAction("Skill - Optimal Solution", { node: 1, cast: 3, type: 12288, mv: 179.73, energy: 3.96, concerto: 9.04, offtune: 9040, forte1: 100 });
var DistributedArray = mornyeAction("Skill - Distributed Array", { node: 1, cast: 3, type: 12288, mv: 159.08, energy: 18.52, concerto: 10, offtune: 8e3, forte2: 60, ...SKILL_HEAL });
var Liberation21 = mornyeAction("Liberation - Critical Protocol", {
  node: 3,
  cast: 4,
  cutscene: true,
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
var Intro27 = mornyeAction("Intro - Convergence", { node: 4, cast: 5, type: 20480, mv: 202.79, energy: 10, concerto: 10, offtune: 13600, ...FIELD });
var Outro28 = mornyeAction("Outro - Recursion", {
  cast: 6,
  concerto: -100,
  swapOut: true,
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
    if (currentTeam().slots.find((m) => m.resonator === MORNYE_RESONATOR)?.isHeld(MO_S2)) {
      asSource(MO_S2, () => addStat(13, 20));
    }
  }
});
var RECURSION = new Buff({
  name: "Mornye: Outro",
  stats: [[18, 25]]
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
    if (!runningAction(TUNE_BREAK))
      return;
    revokeEnemy(INTERFERED_MARKER);
    applyEnemy(INTERFERED_MARKER, 1);
  }
});
var INTERFERED_MARKER = new Debuff({
  name: "Mornye: Interfered Marker",
  maxStacks: 26,
  display: () => "Mornye: Interfered Marker",
  updateBuffs: () => {
    if (triggeredAction() || runningAction(TUNE_BREAK) || !isActive())
      return;
    const s1 = currentTeam().slots.find((m) => m.resonator === MORNYE_RESONATOR)?.isHeld(MO_S1);
    if (stacksOfEnemy(INTERFERED_MARKER) > (s1 ? 25 : 10))
      revokeEnemy(INTERFERED_MARKER);
    else
      applyEnemy(INTERFERED_MARKER, 1);
  },
  // pays out on whoever's active; both sequences are her own local gear, so they are read off her
  // own slot specifically, found by resonator identity
  applyStats: () => {
    const her = currentTeam().slots.find((m) => m.resonator === MORNYE_RESONATOR);
    const interfered = stacksOfEnemy(TUNE_RUPTURE_INTERFERED) > 0 || stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0;
    if (interfered)
      addStat(17, 40);
    else if (her?.isHeld(MO_S1))
      asSource(MO_S1, () => addStat(17, 40));
    if (her?.isHeld(MO_S2))
      asSource(MO_S2, () => addStat(10, 32));
  }
});
var MO_S1 = new Sequence({
  name: "Mornye S1: The Silent Observer",
  updateBuffs: () => {
    if (!runningAction(Inversion))
      return;
    revokeEnemy(INTERFERED_MARKER);
    applyEnemy(INTERFERED_MARKER, 1);
  }
});
var MO_S2 = new Sequence({ name: "Mornye S2: Morning Star of Entropy" });
var MO_S3 = new Sequence({
  name: "Mornye S3: Blueprint of Recursion",
  applyStats: () => {
    if (runningAction(DistributedArray)) {
      addStat(27, 25);
      addStat(31, 100);
    }
  }
});
var MO_S4 = new Sequence({ name: "Mornye S4: Latent Variables of the Cosmos" });
var MO_S5 = new Sequence({
  name: "Mornye S5: Time Dilation Effect",
  applyStats: () => {
    if (runningAction(Liberation21))
      addStat(16, 40);
    if (runningAction(ParticleJet))
      addStat(16, 160);
  }
});
var MO_S6 = new Sequence({
  name: "Mornye S6: To the Far Shores of the Stars",
  applyStats: () => {
    if (runningAction(Liberation21))
      addStat(17, 400);
  }
});
var MO_SEQUENCES = [MO_S1, MO_S2, MO_S3, MO_S4, MO_S5, MO_S6];
var MO_INHERENT_1 = new Inherent({
  name: "Inherent: Blueprint",
  stats: [[11, 10]],
  applyStats: () => {
    if (runningAction(Intro27) || runningAction(WBA3))
      addStat(27, 20);
  }
});
var MO_INHERENT_2 = new Inherent({ name: "Inherent: Boundedness" });
var MORNYE_TALENTS = new Talent({
  name: "Mornye: Talents",
  stats: [[8, 15.2], [24, 12]]
});
var MORNYE_RESONATOR = new Resonator({
  name: "Mornye",
  talent: MORNYE_TALENTS,
  inherent1: MO_INHERENT_1,
  inherent2: MO_INHERENT_2,
  element: 192,
  weapon: 1,
  intro: () => Intro27,
  outro: () => Outro28,
  color: "#d2d4ff",
  maxEnergy: 175,
  maxForte1: 100,
  maxForte2: 100,
  updateGlobal: () => tuneRuptureResponse(ParticleJet),
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1);
    applyCurrent(TUNE_STRAIN_RESPONDER, 1);
  },
  constantStats: () => {
    addStat(1, 15375);
    addStat(0, 287.5);
    addStat(2, 1356.7);
    addStat(12, 10);
  }
});
var BA1235 = new ActionGroup("Basic - Ground State Calibration 123", [BA127, BA226, BA327]);
var WBA123 = new ActionGroup("Basic - Wide Field Observation 123", [WBA1, WBA2, WBA3]);
var SkillSwap = Skill20.swap();
var MO_ROTATION = new Rotation([
  START_2,
  START_3,
  SkillSwap,
  SWAP,
  NOINTRO,
  BA1235,
  GeopotentialShift,
  INTRO,
  WBA123,
  DistributedArray,
  Inversion,
  Liberation21,
  ECHO_SWAP,
  OUTRO
]);
var MO_ROTATION_S3 = new Rotation([
  START_2,
  START_3,
  SkillSwap,
  SWAP,
  NOINTRO,
  BA1235,
  GeopotentialShift,
  WBA1,
  WBA2,
  INTRO,
  DistributedArray,
  Inversion,
  Liberation21,
  ECHO_SWAP,
  OUTRO
]);
var MO_ECHOES = [
  new EchoLoadout(REACTOR_HUSK, STARRY_RADIANCE_5PC),
  new EchoLoadout(SPACETREK_EXPLORER, STARRY_RADIANCE_5PC)
];
var MORNYE = new Loadout({
  resonator: MORNYE_RESONATOR,
  weapons: [STARFIELD_CALIBRATOR, DISCORD],
  echoLoadouts: MO_ECHOES,
  mainstats: mainstatOptions(
    4,
    5,
    17
    /* Mainstat.DEF1 */
  ),
  substat: substats(Substat.DefPct, Substat.Liberation, Substat.FlatDef, true),
  highSubstat: highSubs(Substat.Er, Substat.Liberation, Substat.DefPct, Substat.Liberation),
  rotation: { 0: MO_ROTATION, 3: MO_ROTATION_S3 },
  sequences: MO_SEQUENCES
});

// dist/src/resonators/fusion/mortefi.js
function mortefiAction(id, def2) {
  return new Action(id, { element: 192, scaling: 0, ...def2 });
}
var BA128 = mortefiAction("Basic - Impromptu Show 1", { node: 0, cast: 1, type: 4096, mv: 48.3, energy: 0.86, concerto: 2.77, offtune: 2800, forte1: 5 });
var BA227 = mortefiAction("Basic - Impromptu Show 2", { node: 0, cast: 1, type: 4096, mv: 40.78 * 2, energy: 1.46, concerto: 4.68, offtune: 4720, forte1: 10 });
var BA328 = mortefiAction("Basic - Impromptu Show 3", { node: 0, cast: 1, type: 4096, mv: 107.3, energy: 1.92, concerto: 6.16, offtune: 6160, forte1: 10 });
var BA423 = mortefiAction("Basic - Impromptu Show 4", { node: 0, cast: 1, type: 4096, mv: 21.02 * 4 + 126.93, energy: 3.76, concerto: 12.09, offtune: 12080, forte1: 25 });
var HA21 = mortefiAction("Heavy - Impromptu Show", { node: 0, cast: 2, type: 8192, mv: 167.01, energy: 2.4, concerto: 7.68, offtune: 9600 });
var MA111 = mortefiAction("Mid-air - Impromptu Show 1", { node: 0, cast: 1, type: 4096, mv: 23.25, energy: 0.41, concerto: 1, offtune: 1360 });
var MA210 = mortefiAction("Mid-air - Impromptu Show 2", { node: 0, cast: 1, type: 4096, mv: 23.25, energy: 0.41, concerto: 1, offtune: 1360 });
var DC24 = mortefiAction("Dodge Counter - Impromptu Show", { node: 0, cast: 0, type: 4096, mv: 194.98, energy: 3.5, concerto: 16.4, offtune: 6400 });
var Skill21 = mortefiAction("Skill - Passionate Variation", { node: 1, cast: 3, type: 12288, mv: 208.76, energy: 10, concerto: 18, offtune: 7200, forte1: 40 });
var FSkill7 = mortefiAction("Forte Skill - Fury Fugue", { node: 2, cast: 3, type: 12288, mv: 326.05, energy: 10, concerto: 18, offtune: 8e3, forte1: -100 });
var Liberation22 = mortefiAction("Liberation - Violent Finale", {
  node: 3,
  cast: 4,
  cutscene: true,
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
  field: MARCATO_FIELD,
  updateBuffs: () => applyCurrent(VIBRATO, 1)
});
var ACTION_MARCATO_PAIRED = ACTION_MARCATO.paired();
var ACTION_S5_MARCATO = mortefiAction("Liberation - Marcato (S5 Funerary Quartet)", {
  node: 3,
  type: 16384,
  type2: 262144,
  mv: 31.81,
  updateBuffs: () => applyCurrent(VIBRATO, 1),
  applyStats: () => addStat(17, -50)
});
var Intro28 = mortefiAction("Intro - Dissonance", { node: 4, cast: 5, type: 20480, mv: 168.99, energy: 10, concerto: 10, offtune: 8e3 });
var Outro29 = mortefiAction("Outro - Rage Transposition", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(MORTEFI_OUTRO)
});
var BURNING_RHAPSODY = new Buff({
  name: "Mortefi: Burning Rhapsody",
  maxStacks: 48,
  field: MARCATO_FIELD,
  updateBuffs: () => {
    if (!oneSecondPassed())
      return;
    if (casting(
      3
      /* Cast.Skill */
    )) {
      queueOn(MORTEFI_RESONATOR, ACTION_MARCATO);
      queueOn(MORTEFI_RESONATOR, ACTION_MARCATO_PAIRED);
      return;
    }
    const heavy = casting(
      2
      /* Cast.Heavy */
    );
    if (!heavy && !(casting(
      1
      /* Cast.Basic */
    ) && currentAction().mv > 0))
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
    if (runningAction(FSkill7))
      addStat(17, 25);
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(HARMONIC_CONTROL);
  }
});
var MO_INHERENT_12 = new Inherent({
  name: "Inherent: Harmonic Control",
  updateBuffs: () => {
    if (runningAction(Skill21))
      applyCurrent(HARMONIC_CONTROL, 1);
  }
});
var MO_INHERENT_22 = new Inherent({ name: "Inherent: Rhythmic Vibrato" });
var MORTEFI_OUTRO = new Buff({
  name: "Mortefi: Outro",
  stats: [[
    18,
    38,
    8192
    /* Type1.Heavy */
  ]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var S6_TEAM_ATK = new Buff({
  name: "Mortefi S6: Apoplectic Instrumental",
  stats: [[6, 20]],
  convertStats: () => {
    if (casting(
      5
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
      7
      /* Cast.Echo */
    ))
      addStat(26, 10);
  }
});
var MORTEFI_S3 = new Sequence({
  name: "Mortefi S3: Flaming Recitativo",
  stats: [[
    10,
    30,
    262144
    /* Type2.Coordinated */
  ]]
});
var MORTEFI_S4 = new Sequence({
  name: "Mortefi S4: Cathartic Waltz",
  updateBuffs: () => {
    if (runningAction(Liberation22))
      applyTeam(BURNING_RHAPSODY, 20);
  }
});
var MORTEFI_S5 = new Sequence({
  name: "Mortefi S5: Funerary Quartet",
  updateBuffs: () => {
    if (runningAction(Skill21) || runningAction(FSkill7))
      for (let i = 0; i < 4; i++)
        queue(ACTION_S5_MARCATO);
  }
});
var MORTEFI_S6 = new Sequence({
  name: "Mortefi S6: Apoplectic Instrumental",
  updateBuffs: () => {
    if (runningAction(Liberation22))
      applyTeam(S6_TEAM_ATK, 1);
  }
});
var MORTEFI_TALENTS = new Talent({
  name: "Mortefi: Talents",
  stats: [[6, 12], [
    17,
    12,
    192
    /* Attribute.Fusion */
  ]]
});
var MORTEFI_RESONATOR = new Resonator({
  name: "Mortefi",
  talent: MORTEFI_TALENTS,
  inherent1: MO_INHERENT_12,
  inherent2: MO_INHERENT_22,
  element: 192,
  weapon: 2,
  intro: () => Intro28,
  outro: () => Outro29,
  color: "#d7370f",
  maxEnergy: 125,
  maxForte1: 100,
  tier: 2,
  constantStats: () => {
    addStat(1, 10025);
    addStat(0, 250);
    addStat(2, 1137);
  }
});
var BA12346 = new ActionGroup("Basic - Impromptu Show 1234", [BA128, BA227, BA328, BA423]);
var BA1236 = new ActionGroup("Basic - Impromptu Show 123", [BA128, BA227, BA328]);
var MO_ROTATION2 = new Rotation([
  INTRO,
  Skill21,
  BA12346,
  BA1236,
  FSkill7,
  Liberation22,
  ECHO_SWAP,
  OUTRO
]);
var MORTEFI = new Loadout({
  resonator: MORTEFI_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.Er, Substat.FlatAtk),
  rotation: MO_ROTATION2,
  sequences: [MORTEFI_S1, MORTEFI_S2, MORTEFI_S3, MORTEFI_S4, MORTEFI_S5, MORTEFI_S6]
});

// dist/src/resonators/glacio/carlotta.js
function carlottaAction(id, def2) {
  return new Action(id, { element: 256, scaling: 0, ...def2 });
}
var BA129 = carlottaAction("Basic - Silent Execution 1", { node: 0, cast: 1, type: 4096, mv: 54.08, energy: 0.8, concerto: 1.6, offtune: 2560 });
var BA228 = carlottaAction("Basic - Silent Execution 2", { node: 0, cast: 1, type: 4096, mv: 131.83, energy: 1.96, concerto: 3.9, offtune: 6240, forte1: 3 });
var MA112 = carlottaAction("Mid-air - Silent Execution", { node: 0, cast: 1, type: 4096, mv: 104.78, energy: 3, concerto: 6, offtune: 9600 });
var MA211 = carlottaAction("Basic - Silent Execution: Customary Greetings", { node: 0, cast: 1, type: 4096, mv: 239.98, energy: 2.11, concerto: 4.2, offtune: 6720, forte1: 3 });
var DC25 = carlottaAction("Dodge Counter - Silent Execution", { node: 0, cast: 0, type: 4096, mv: 241.32, energy: 3.58, concerto: 17.15, offtune: 11425, forte2: 10, forte1: -1 });
var NM1 = carlottaAction("Basic - Silent Execution: Necessary Measures 1", { node: 0, cast: 1, type: 4096, mv: 65.91, energy: 0.98, concerto: 1.95, offtune: 3120, forte2: 10, forte1: -1 });
var NM2 = carlottaAction("Basic - Silent Execution: Necessary Measures 2", { node: 0, cast: 1, type: 4096, mv: 133.51, energy: 1.98, concerto: 3.96, offtune: 6320, forte2: 10, forte1: -1 });
var NM3 = carlottaAction("Basic - Silent Execution: Necessary Measures 3", { node: 0, cast: 1, type: 4096, mv: 233.25, energy: 3.47, concerto: 6.9, offtune: 11040, forte2: 10, forte1: -1 });
var HA25 = carlottaAction("Heavy - Silent Execution", { node: 0, cast: 2, type: 8192, mv: 152.12, energy: 2.26, concerto: 4.52, offtune: 7200, forte1: 3 });
var EHA2 = carlottaAction("Heavy - Silent Execution: Containment Tactics", {
  node: 0,
  cast: 2,
  type: 8192,
  mv: 228.18,
  energy: 2.26,
  concerto: 15,
  offtune: 7200,
  forte2: -120
});
var Skill113 = carlottaAction("Skill - Art of Violence", {
  node: 1,
  cast: 3,
  type: 12288,
  mv: 288.22,
  energy: 2,
  concerto: 5,
  offtune: 6136,
  forte1: 3
});
var Skill27 = carlottaAction("Skill - Chromatic Splendor", {
  node: 1,
  cast: 3,
  type: 12288,
  mv: 563.64,
  energy: 3,
  concerto: 5,
  offtune: 12e3,
  // the crystal-to-Substance conversion
  convertStats: () => {
    const crystals = Math.min(6, forte1());
    addStat(30, -crystals);
    addStat(31, 10 * crystals);
  }
});
var FHA10 = carlottaAction("Forte Heavy - Imminent Oblivion", {
  node: 2,
  cast: 2,
  type: 12288,
  mv: 835.36,
  energy: 17,
  concerto: 15,
  offtune: 97361,
  forte2: -120
});
var Lib16 = carlottaAction("Liberation - Era of New Wave", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 12288,
  mv: 402.71,
  concerto: 20,
  offtune: 33600,
  resetEnergy: true,
  resetForte2: true,
  // Twilight Tango removes all Substance on opening
  updateBuffs: () => {
    applyEnemy(DECONSTRUCTION, 1);
    applyCurrent(TWILIGHT_TANGO, 1);
  }
});
var DeathKnell = carlottaAction("Liberation - Death Knell", {
  node: 3,
  cast: 4,
  type: 12288,
  mv: 241.64,
  energy: 5,
  concerto: 7,
  offtune: 9600,
  forte3: 1
});
var FatalFinale = carlottaAction("Liberation - Fatal Finale", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 12288,
  mv: 644.33,
  concerto: 10,
  offtune: 50400,
  forte3: -4
});
var Intro29 = carlottaAction("Intro - Wintertime Aria", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 298.23,
  energy: 10,
  concerto: 10,
  offtune: 9335,
  forte2: 30,
  forte1: 3
});
var Outro30 = carlottaAction("Outro - Closing Remark", { cast: 6, type: 24576, mv: 794.2, concerto: -100, swapOut: true });
var DECONSTRUCTION = new Debuff({
  name: "Carlotta: Deconstruction",
  applyStats: () => {
    if (isHeld(CARLOTTA_RESONATOR))
      addStat(23, 18);
  },
  convertStats: () => {
    if (casting(
      6
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
    if (runningAction(Intro29) || runningAction(Skill27) || runningAction(DeathKnell) || runningAction(FHA10))
      applyEnemy(DECONSTRUCTION, 1);
  }
});
var TWILIGHT_TANGO = new Buff({
  name: "Carlotta: Twilight Tango",
  convertStats: () => {
    if (runningAction(FatalFinale))
      revokeCurrent(TWILIGHT_TANGO);
  }
});
var FINAL_BOW = new Buff({
  name: "Carlotta: Final Bow",
  applyStats: () => {
    if (runningAction(Lib16) || runningAction(DeathKnell) || runningAction(FatalFinale))
      addStat(16, 80);
  },
  convertStats: () => {
    if (isHeld(TWILIGHT_TANGO) && currentAction().swapOut)
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
    if (runningAction(Skill27))
      addStat(31, 30);
  }
});
var CL_S2 = new Sequence({
  name: "Carlotta S2: Fallen Petals Give Life to New Blooms",
  applyStats: () => {
    if (runningAction(FatalFinale))
      addStat(16, 126);
  }
});
var Sparks = carlottaAction("Outro - Kaleidoscope Sparks", { type: 24576, mv: 1032.18 });
var CL_S3 = new Sequence({
  name: "Carlotta S3: Adelante, Cortado, Spinning in Grace",
  applyStats: () => {
    if (runningAction(Skill113) || runningAction(Skill27))
      addStat(16, 93);
  },
  updateBuffs: () => {
    if (runningAction(Outro30))
      queue(Sparks);
  }
});
var FINEST_WINE = new Buff({
  name: "Carlotta S4: Yesterday's Raindrops Make Finest Wine",
  stats: [[
    17,
    25,
    12288
    /* Type1.Skill */
  ]]
});
var CL_S4 = new Sequence({
  name: "Carlotta S4: Yesterday's Raindrops Make Finest Wine",
  updateBuffs: () => {
    if (runningAction(HA25) || runningAction(EHA2) || runningAction(FHA10))
      applyTeam(FINEST_WINE, 1);
  }
});
var CL_S5 = new Sequence({
  name: "Carlotta S5: Toast to Past, Today, and Every Day to Come",
  applyStats: () => {
    if (runningAction(FHA10))
      addStat(16, 47);
  }
});
var CL_S6 = new Sequence({
  name: "Carlotta S6: As the Curtain Falls, I Remain What I Am",
  applyStats: () => {
    if (runningAction(DeathKnell))
      addStat(16, 186.6);
  }
});
var CARLOTTA_TALENTS = new Talent({
  name: "Carlotta: Talents",
  stats: [[9, 8], [6, 12]]
});
var CARLOTTA_RESONATOR = new Resonator({
  name: "Carlotta",
  matrix: matrix("Carlotta", 25),
  talent: CARLOTTA_TALENTS,
  inherent1: CL_INHERENT_1,
  inherent2: CL_INHERENT_2,
  element: 256,
  weapon: 2,
  intro: () => Intro29,
  outro: () => Outro30,
  color: "#8fb3d9",
  maxEnergy: 125,
  maxForte1: 6,
  maxForte2: 120,
  maxForte3: 4,
  // Final Bow is a state entered on the gauge filling, so it is read off the gauge as each
  // action leaves it — the only phase that sees Chromatic Splendor's own conversion banked
  afterAction: () => {
    if (forte2() >= 120)
      applyCurrent(FINAL_BOW, 1);
  },
  constantStats: () => {
    addStat(1, 12450);
    addStat(0, 463);
    addStat(2, 1198);
  }
});
var DeathKnellx4 = new ActionGroup("Liberation - Death Knell x4", [DeathKnell, DeathKnell, DeathKnell, DeathKnell]);
var Skill122 = new ActionGroup("Skill - Art of Violence + Chromatic Splendor", [Skill113, Skill27]);
var Skill12Swap = new ActionGroup("Skill - Art of Violence + Chromatic Splendor", [Skill113, Skill27.swap()]);
var NM123 = new ActionGroup("Silent Execution: Necessary Measures 123", [NM1, NM2, NM3]);
var CL_ROTATION = new Rotation([
  START_2,
  HA25,
  NM123,
  SWAP,
  START_3,
  Skill12Swap,
  SWAP,
  INTRO,
  Skill122,
  MA112,
  FHA10,
  Lib16,
  DeathKnellx4,
  FatalFinale,
  Skill122,
  ECHO_SWAP,
  OUTRO
]);
var CARLOTTA = new Loadout({
  resonator: CARLOTTA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Er),
  rotation: CL_ROTATION
});

// dist/src/resonators/glacio/hiyuki.js
var GLACIO_BITE_FIELD = new ActionField("Hiyuki: Glacio Bite");
var FINE_SNOW = new ActionField("Hiyuki: Fine Snow");
var BITE_RUNGS = GLACIO_CHAFE_ACTIONS.map((a) => a?.variant(a.name, { field: GLACIO_BITE_FIELD }) ?? null);
var GLACIO_BITE_WINDOW = new Buff({ field: GLACIO_BITE_FIELD });
var FINE_SNOW_WINDOW = new Buff({ field: FINE_SNOW });
var GLACIO_BITE = new Debuff({ name: "Glacio Bite", maxStacks: 10 });
function hiyukiAction(id, def2) {
  return new Action(id, { element: 256, scaling: 0, ...def2 });
}
var CHAFE = { updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1) };
var FROSTBIND = {
  updateBuffs: () => {
    if (stacksOfEnemy(GLACIO_BITE) >= 10)
      consume(GLACIO_BITE, 10);
  }
};
var BA130 = hiyukiAction("Basic - Present Self 1", { node: 0, cast: 1, type: 4096, mv: 75.44, energy: 1.28, concerto: 2.44, offtune: 4336 });
var BA229 = hiyukiAction("Basic - Present Self 2", { node: 0, cast: 1, type: 4096, mv: 90.25, energy: 1.53, concerto: 2.92, offtune: 5188 });
var BA329 = hiyukiAction("Basic - Present Self 3", { node: 0, cast: 1, type: 4096, mv: 122.97, energy: 2.12, concerto: 3.99, offtune: 7070, forte1: 100, ...CHAFE });
var MA31 = hiyukiAction("Mid-air - Present Self", { node: 0, cast: 1, type: 4096, mv: 128.18, energy: 2.17, concerto: 4.15, offtune: 7368 });
var DC26 = hiyukiAction("Dodge Counter - Present Self 2", { node: 0, cast: 0, type: 4096, mv: 173.75, energy: 2.94, concerto: 15.62, offtune: 9988 });
var FrostSplinter = hiyukiAction("Heavy - Frost Splinter: Present Self", {
  node: 0,
  cast: 2,
  type: 16384,
  mv: 317.23,
  energy: 5.23,
  concerto: 9.99,
  offtune: 17728,
  // only fires at 300 Dedication, and the last arrow spends the whole bar: maxForte1 (300 below)
  // clamps an overrun back to the cap before this lands exactly on 0
  forte1: -300,
  ...CHAFE
});
var FBA14 = hiyukiAction("Basic - Foreclaimed Self 1", { node: 0, cast: 1, type: 16384, mv: 49.27, energy: 0.84, concerto: 1.6, offtune: 2832, forte2: 10 });
var FBA24 = hiyukiAction("Basic - Foreclaimed Self 2", { node: 0, cast: 1, type: 16384, mv: 80.04, energy: 1.36, concerto: 2.6, offtune: 4600, forte2: 15 });
var FBA34 = hiyukiAction("Basic - Foreclaimed Self 3", { node: 0, cast: 1, type: 16384, mv: 167.72, energy: 2.86, concerto: 5.45, offtune: 9640, forte2: 32, ...CHAFE });
var FBA44 = hiyukiAction("Basic - Foreclaimed Self 4", { node: 0, cast: 1, type: 16384, mv: 149.65, energy: 2.55, concerto: 4.85, offtune: 8600, forte2: 30, ...CHAFE });
var FBA52 = hiyukiAction("Basic - Foreclaimed Self 5", { node: 0, cast: 1, type: 16384, mv: 121.64, energy: 2.06, concerto: 3.94, offtune: 6993, forte2: 24, ...CHAFE });
var FDC3 = hiyukiAction("Dodge Counter - Foreclaimed Self 2", { node: 0, cast: 0, type: 16384, mv: 163.54, energy: 2.78, concerto: 15.3, offtune: 9400, forte2: 32 });
var FMA13 = hiyukiAction("Mid-air - Foreclaimed Self 1", { node: 0, cast: 1, type: 16384, mv: 96.09, energy: 1.63, concerto: 3.13, offtune: 5523, forte2: 19 });
var FMA23 = hiyukiAction("Mid-air - Foreclaimed Self 2", { node: 0, cast: 1, type: 16384, mv: 104.36, energy: 1.8, concerto: 3.4, offtune: 6e3, forte2: 20, ...CHAFE });
var FMA33 = hiyukiAction("Mid-air - Foreclaimed Self 3", { node: 0, cast: 1, type: 16384, mv: 111.6, energy: 1.89, concerto: 3.61, offtune: 6416, forte2: 22, ...CHAFE });
var UHA3 = hiyukiAction("Heavy - Foreclaimed Self", { node: 0, cast: 2, type: 16384, mv: 107.16, energy: 1.81, concerto: 3.47, offtune: 6160, forte2: 21 });
var FHA11 = hiyukiAction("Heavy - Bitterfrost: Foreclaimed Self", {
  node: 0,
  cast: 2,
  type: 16384,
  mv: 616.33,
  energy: 8,
  concerto: 10,
  offtune: 84e3,
  forte3: -3,
  updateBuffs: () => applyCurrent(SNOWFORGED_BLADE, 1),
  ...CHAFE
});
var Skill28 = hiyukiAction("Skill - Frostblight: Present Self", {
  node: 1,
  cast: 3,
  type: 12288,
  mv: 195.98,
  energy: 3.34,
  concerto: 6.37,
  offtune: 11264,
  updateBuffs: () => applyCurrent(FROSTBLIGHT_ENHANCED, 1)
});
var USkill1 = hiyukiAction("Skill - Frostblight: Jade Cleave", { node: 1, cast: 3, type: 12288, mv: 264.04, energy: 10, concerto: 3, offtune: 5312, forte2: 75 });
var USkill22 = hiyukiAction("Skill - Frostblight: Petalfall", { node: 1, cast: 3, type: 12288, mv: 320.1, energy: 10.3, concerto: 3.65, offtune: 6440, forte2: 75 });
var Lib17 = hiyukiAction("Liberation - Foreclaiming: Inward Vision", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 397.62,
  concerto: 20,
  offtune: 84e3,
  forte2: 50,
  resetForte1: true,
  resetForte2: true,
  updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 4),
  // its own three points, then Frostbind's spend — the same phase, so spread by hand rather than
  // through `...FROSTBIND`
  updateBuffs: () => {
    applyCurrent(FROSTHARDEN_IAI, 3);
    FROSTBIND.updateBuffs();
  }
});
var Lib2Tap = hiyukiAction("Liberation - Foreclaiming: Blade Liberation", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 994.05,
  concerto: 20,
  resetEnergy: true,
  // everything it ends the form by removing: Dedication, Frostheart, and every Snowforged Blade
  // the multiplier above just cashed
  resetForte1: true,
  resetForte2: true
});
var Lib2Hold = hiyukiAction("Liberation - Foreclaiming: Blade Liberation", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 994.05,
  concerto: 20,
  resetEnergy: true,
  // everything it ends the form by removing: Dedication, Frostheart, and every Snowforged Blade
  // the multiplier above just cashed
  resetForte1: true,
  resetForte2: true
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
var Intro30 = hiyukiAction("Intro - Frostedge", {
  node: 4,
  cast: 5,
  type: 16384,
  mv: 156.15,
  energy: 10,
  concerto: 10,
  offtune: 8976,
  forte1: 200,
  updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1),
  // Snowlight Blessing is a 20s team buff, so CLAUDE.md's own wording rule ends it here rather
  // than leaving it standing for the fight; the two windows above open on the same cast
  updateBuffs: () => {
    revokeTeam(SNOWLIGHT_BLESSING);
    applyCurrent(GLACIO_BITE_WINDOW, 1);
    applyCurrent(FINE_SNOW_WINDOW, 1);
  }
});
var Outro31 = hiyukiAction("Outro - Snowlight Blessing", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => applyTeam(SNOWLIGHT_BLESSING, 1)
});
var FineSnowBite = new Action("Glacio Bite - Fine Snow", {
  element: 256,
  type: 32768,
  type2: 1310720,
  scaling: 3,
  mv: 102,
  field: FINE_SNOW
});
var FROSTHARDEN_IAI = new Buff({
  name: "Hiyuki: Frostharden Iai",
  maxStacks: 3,
  // a point of Frostharden buys the 3 Chafe stacks and the Whiteout; all three phases read the
  // count untouched, and the spend itself lands last so none of them races it
  updateDebuffs: () => {
    if (runningAction(Iai))
      applyEnemy(GLACIO_CHAFE, 3);
  },
  applyStats: () => {
    if (runningAction(Iai))
      addStat(32, 1);
  },
  convertStats: () => {
    if (runningAction(Iai))
      removeStack(FROSTHARDEN_IAI, 1);
  }
});
var SNOWFORGED_BLADE = new Buff({
  name: "Hiyuki: Snowforged Blade",
  maxStacks: 3,
  applyStats: () => {
    if (runningAction(Lib2Hold) || runningAction(Lib2Tap) && frozenStacks() >= 3) {
      addStat(15, 795.24 * frozenStacks());
      revokeCurrent(SNOWFORGED_BLADE);
    } else if (runningAction(Lib2Tap)) {
      addStat(15, 795.24);
      removeStack(SNOWFORGED_BLADE, 1);
    }
  }
});
var FROSTBLIGHT_ENHANCED = new Buff({
  name: "Hiyuki: Present Self",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => {
    if (runningAction(BA329))
      addStat(30, 100);
  },
  convertStats: () => {
    if (runningAction(BA329))
      revokeCurrent(FROSTBLIGHT_ENHANCED);
  }
});
var snowRust = () => {
  const slots = frozenStacks();
  return Math.min(3, (slots & 1) + (slots >> 1 & 1) + (slots >> 2 & 1) + (slots >> 3 & 1));
};
var SNOW_RUST = new Buff({
  name: "Hiyuki: Snow Rust",
  maxStacks: 1 + 2 + 4 + 8,
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
    for (let i = isHeld(HY_S6) ? applied2(GLACIO_CHAFE) : appliedByMe(GLACIO_CHAFE); i > 0; i--)
      queue(FineSnowBite);
  },
  applyStats: () => {
    if (!isActive())
      return;
    addStat(10, 40);
    addStat(
      18,
      snowRust() >= 3 ? 60 : 30,
      1310720
      /* Type2.GlacioChafe */
    );
    if (isHeld(HY_S6) && snowRust() >= 2)
      asSource(HY_S6, () => addStat(10, 40));
    if (isHeld(HY_S6) && snowRust() >= 3)
      asSource(HY_S6, () => addStat(
        20,
        25,
        1310720
        /* Type2.GlacioChafe */
      ));
    if (isHeld(HY_S3) && runningAction(FineSnowBite))
      asSource(HY_S3, () => addStat(16, 488));
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
  stats: [[6, 12], [9, 8]]
});
var HIYUKI_RESONATOR = new Resonator({
  name: "Hiyuki",
  talent: HIYUKI_TALENTS,
  inherent1: HY_INHERENT_1,
  inherent2: HY_INHERENT_2,
  element: 256,
  weapon: 0,
  intro: () => Intro30,
  outro: () => Outro31,
  color: "#fb6a6f",
  maxEnergy: 125,
  maxForte1: 300,
  maxForte2: 300,
  maxForte3: 3,
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
    const inflicted = applied2(GLACIO_CHAFE);
    if (inflicted === 0)
      return;
    revokeEnemy(GLACIO_CHAFE);
    applyEnemy(GLACIO_BITE, inflicted);
    const cap = currentTeam().enemyMax(GLACIO_CHAFE);
    const hers = currentTeam().slots[currentTeam().onField] === currentMember();
    const rung = hers ? BITE_RUNGS[cap] : GLACIO_CHAFE_ACTIONS[cap];
    const applier = currentTeam().slot.resonator;
    for (let i = 0; i < inflicted; i++)
      queueOn(applier, rung);
  },
  constantStats: () => {
    addStat(1, 10300);
    addStat(0, 462.5);
    addStat(2, 1112.22);
  },
  // the Stage 3 a Tune Break of hers rolls into — `queueEvent`, not `queue`, so it lands as a
  // press of her own rather than a follow-up pinned to the break (evaluate.ts's own `triggered`)
  afterAction: () => {
    if (currentAction() !== TUNE_BREAK)
      return;
    if (forte3() > 0 || forte2() > 0)
      queueEvent(FBA34);
  }
});
var FORECLAIMED_HITS = /* @__PURE__ */ new Set([FBA14, FBA24, FBA34, FBA44, FBA52, UHA3, FMA13, FMA23, FMA33, FDC3]);
var SPRINGLESS = new Buff({
  name: "Hiyuki S1: Springless",
  updateDebuffs: () => {
    if (runningAction(FBA14) || runningAction(FBA24))
      applyEnemy(GLACIO_CHAFE, 1);
  },
  convertStats: () => {
    if (runningAction(FBA24))
      revokeCurrent(SPRINGLESS);
  }
});
var HY_S1 = new Sequence({
  name: "Hiyuki S1: Springless",
  applyStats: () => {
    if (FORECLAIMED_HITS.has(currentAction()))
      addStat(16, 120);
  },
  updateBuffs: () => {
    if (runningAction(Lib17))
      applyCurrent(SPRINGLESS, 1);
  }
});
var FROSTHEART_SURGE = new Buff({
  name: "Hiyuki S2: To Burn Cold in Silence",
  maxStacks: 2,
  applyStats: () => {
    if (runningAction(USkill1) || runningAction(USkill22))
      addStat(31, 50);
  },
  convertStats: () => {
    if (runningAction(USkill1) || runningAction(USkill22))
      removeStack(FROSTHEART_SURGE, 1);
  }
});
var HY_S2 = new Sequence({
  name: "Hiyuki S2: To Burn Cold in Silence",
  combatStart: () => {
    applyCurrent(SNOWFORGED_BLADE, 3);
    applyCurrent(FROSTHEART_SURGE, 2);
  },
  applyStats: () => {
    if (runningAction(Iai))
      addStat(16, 125);
  }
});
var HY_S3 = new Sequence({
  name: "Hiyuki S3: No Self, No Bound",
  combatStart: () => applyCurrent(SNOW_RUST, 8),
  applyStats: () => {
    if (runningAction(FrostSplinter) || runningAction(FHA11))
      addStat(16, 160);
  }
});
var LIKE_REEDS_ON_TIDES = new Buff({ name: "Hiyuki S4: Like Reeds on Tides", stats: [[17, 20]] });
var HY_S4 = new Sequence({
  name: "Hiyuki S4: Like Reeds on Tides",
  updateBuffs: () => {
    if (runningAction(Skill28) || runningAction(USkill1) || runningAction(USkill22)) {
      applyTeam(LIKE_REEDS_ON_TIDES, 1);
      applyCurrent(HEALS, 1);
    }
  }
});
var HY_S5 = new Sequence({
  name: "Hiyuki S5: Vessel of Thousand Wishes",
  applyStats: () => {
    if (runningAction(Skill28) || runningAction(USkill1) || runningAction(USkill22))
      addStat(16, 80);
  }
});
var HY_S6 = new Sequence({
  name: "Hiyuki S6: Into a Night Without End",
  applyStats: () => {
    if (runningAction(Lib17) || runningAction(Lib2Tap) || runningAction(Lib2Hold))
      addStat(10, 500);
  }
});
var HY_SEQUENCES = [HY_S1, HY_S2, HY_S3, HY_S4, HY_S5, HY_S6];
var FBA232 = new ActionGroup("Basic - Foreclaimed Self 23", [FBA24, FBA34]);
var BA1237 = new ActionGroup("Basic - Present Self 123", [BA130, BA229, BA329]);
var HY_ROTATION = new Rotation([
  NOINTRO,
  BA1237,
  Skill28,
  INTRO,
  BA329,
  FrostSplinter,
  Lib17,
  UHA3,
  FBA232,
  UHA3,
  FBA232,
  DODGE,
  Iai,
  JUMP,
  USkill22,
  DODGE,
  Iai,
  JUMP,
  USkill22,
  DODGE,
  Iai,
  ECHO_CANCEL,
  FHA11,
  Lib2Hold,
  OUTRO
]);
var HY_ROTATION_S2 = new Rotation([
  NOINTRO,
  BA1237,
  Skill28,
  INTRO,
  BA329,
  FrostSplinter,
  Lib17,
  UHA3,
  FBA232,
  UHA3,
  FBA232,
  DODGE,
  Iai,
  JUMP,
  USkill22,
  DODGE,
  Iai,
  JUMP,
  USkill22,
  DODGE,
  Iai,
  ECHO_CANCEL,
  FHA11,
  Lib2Hold,
  OUTRO,
  FIRST_INTRO,
  BA329,
  FrostSplinter,
  Lib17,
  UHA3,
  FBA232,
  UHA3,
  FBA232,
  DODGE,
  Iai,
  JUMP,
  USkill22,
  DODGE,
  Iai,
  JUMP,
  USkill22,
  DODGE,
  Iai,
  Iai,
  ECHO_CANCEL,
  FHA11,
  Lib2Hold,
  OUTRO,
  // the same visit with her leading, where there is no Intro to arrive on
  NOINTRO_FIRST,
  BA1237,
  Skill28,
  BA329,
  FrostSplinter,
  Lib17,
  UHA3,
  FBA232,
  UHA3,
  FBA232,
  DODGE,
  Iai,
  JUMP,
  USkill22,
  DODGE,
  Iai,
  JUMP,
  USkill22,
  DODGE,
  Iai,
  Iai,
  ECHO_CANCEL,
  FHA11,
  Lib2Hold,
  OUTRO
]);
var HY_ECHOES = [
  new EchoLoadout(VOIDBORNE_CONSTRUCT, QUIET_SNOWFALL_5PC)
];
var HIYUKI = new Loadout({
  resonator: HIYUKI_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk, Substat.Er),
  rotation: { 0: HY_ROTATION, 2: HY_ROTATION_S2 },
  sequences: HY_SEQUENCES
});

// dist/src/resonators/glacio/lucilla.js
function lucillaAction(id, def2) {
  return new Action(id, { element: 256, scaling: 0, ...def2 });
}
var CHAFES = { updateDebuffs: () => applyEnemy(GLACIO_CHAFE, 1) };
var Intro31 = lucillaAction("Intro - Clip It", { node: 4, cast: 5, type: 20480, mv: 97.42, energy: 11.75, concerto: 14.13, offtune: 5600, forte1: 100, ...CHAFES });
var Outro32 = lucillaAction("Outro - Montage", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => {
    if (isHeld(MODE_CHAFE))
      applyTeam(MONTAGE_CHAFE, 1);
    else
      queueOutro(MONTAGE_HANDOFF);
  }
});
var BA131 = lucillaAction("Basic - Snapshot 1", { node: 0, cast: 1, type: 4096, mv: 59.29, energy: 1.07, concerto: 1.71, offtune: 3408 });
var BA230 = lucillaAction("Basic - Snapshot 2", { node: 0, cast: 1, type: 4096, mv: 67.23, energy: 1.22, concerto: 1.94, offtune: 3865 });
var BA330 = lucillaAction("Basic - Snapshot 3 - Commendable", { node: 0, cast: 1, type: 4096, mv: 235.27, energy: 4.23, concerto: 6.77, offtune: 13524, forte1: 50 });
var MA37 = lucillaAction("Mid-air - Snapshot", { node: 0, cast: 1, type: 4096, mv: 86.29, energy: 1.55, concerto: 3.66, offtune: 4960 });
var DC27 = lucillaAction("Dodge Counter - Snapshot", { node: 0, cast: 0, type: 4096, mv: 150.73, energy: 2.71, concerto: 16.4, offtune: 8665 });
var PhantomFrame = lucillaAction("Skill - Phantom Frame", { node: 1, cast: 3, type: 12288, mv: 39.78, energy: 1.26, concerto: 2.07, offtune: 4002 });
var Compensate = lucillaAction("Skill - Compensate", { node: 1, cast: 3, type: 12288, mv: 249.07, energy: 9.31, concerto: 3.08, offtune: 4176, forte1: 25 });
var Spotlight = lucillaAction("Skill - Spotlight", {
  node: 1,
  cast: 3,
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
    addStat(27, 20);
  }
});
var Liberation23 = lucillaAction("Liberation - Clear As Day", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 28672,
  mv: 142.74,
  concerto: 20,
  offtune: 38400,
  forte1: -150,
  applyStats: () => {
    addStat(30, 150);
  },
  updateBuffs: () => {
    applyCurrent(LIB_SELF_DMG, 1);
    if (isHeld(MODE_CHAFE))
      applyTeam(FILM_ROLL, 4);
    else
      applyTeam(ZOOM, 1);
  }
});
var UBA16 = lucillaAction("Basic - Tracing Forms 1", { node: 3, cast: 1, type: 4096, mv: 76.59, energy: 1.08, concerto: 2.07, offtune: 3425 });
var UBA25 = lucillaAction("Basic - Tracing Forms 2", { node: 3, cast: 1, type: 4096, mv: 149.42, energy: 12.09, concerto: 4.93, offtune: 6680 });
var UBA36 = lucillaAction("Basic - Tracing Forms 3", {
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
  }
});
var OblivionEcho = lucillaAction("Forte Echo - Oblivion", { node: 2, cast: 7, type: 28672, mv: 285.48, offtune: 9600, forte1: -50 });
var OblivionChafe = lucillaAction("Forte - Oblivion (Chafe)", { node: 2, type: 4096, mv: 285.48, offtune: 9600, forte1: -50, ...CHAFES });
var LettingGo = lucillaAction("Basic - Letting It Go", {
  node: 3,
  type: 28672,
  mv: 848.07,
  energy: 3.36,
  concerto: 7.88,
  offtune: 36514,
  applyStats: () => {
    addStat(27, 20);
  }
});
var MODE_ECHO = new ResonanceMode({ name: "Resonance Mode - Echo" });
var MODE_CHAFE = new ResonanceMode({
  name: "Resonance Mode - Glacio Chafe",
  // the retag has to land in the first phase, before anything reads the type (see typeOverride)
  updateDebuffs: () => {
    if (runningAction(Liberation23) || runningAction(LettingGo))
      typeOverride(
        4096
        /* Type1.Basic */
      );
  }
});
var SLOW_MOTION_TEAM = new Buff({
  name: "Inherent: Slow Motion",
  stats: [[
    17,
    25,
    28672
    /* Type1.Echo */
  ]]
});
var SLOW_MOTION_CHAFE = new Debuff({
  name: "Inherent: Slow Motion",
  applyStats: () => addEnemyStat(
    35,
    8,
    256
    /* Attribute.Glacio */
  )
});
var LC_INHERENT_12 = new Inherent({
  name: "Inherent: Slow Motion",
  updateBuffs: () => {
    if (!runningAction(Spotlight))
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
    if (isActive())
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
    if (!isActive() || currentTeam().slot.resonator === LUCILLA_RESONATOR)
      return;
    if (!applied2(GLACIO_CHAFE))
      return;
    removeStackTeam(FILM_ROLL, 1);
    applyEnemy(GLACIO_CHAFE, 2);
  }
});
var LC_INHERENT_22 = new Inherent({
  name: "Inherent: Remembrance",
  updateBuffs: () => {
    if (runningAction(OblivionEcho))
      applyTeam(ZOOM, 1);
    if (runningAction(OblivionChafe))
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
      6
      /* Cast.Outro */
    ))
      revokeCurrent(LIB_SELF_DMG);
  }
});
var MONTAGE_HANDOFF = new Buff({
  name: "Lucilla: Outro (echo)",
  stats: [[
    18,
    50,
    28672
    /* Type1.Echo */
  ]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var MONTAGE_CHAFE = new Buff({
  name: "Lucilla: Outro (chafe)",
  stats: [[
    18,
    60,
    1310720
    /* Type2.GlacioChafe */
  ]]
});
var LUCILLA_TALENTS = new Talent({
  name: "Lucilla: Talents",
  constantStats: () => {
    addStat(6, 12);
    addStat(9, 8);
  }
});
var LUCILLA_RESONATOR = new Resonator({
  name: "Lucilla",
  talent: LUCILLA_TALENTS,
  inherent1: LC_INHERENT_12,
  inherent2: LC_INHERENT_22,
  element: 256,
  weapon: 4,
  intro: () => Intro31,
  outro: () => Outro32,
  color: "#4f74c2",
  maxEnergy: 0,
  maxForte1: 150,
  constantStats: () => {
    addStat(1, 12237.5);
    addStat(0, 375);
    addStat(2, 1197.8);
  }
});
var UBA1232 = new ActionGroup("Basic - Tracing Forms 123", [UBA16, UBA25, UBA36]);
var LC_ROTATION2 = new Rotation([
  INTRO,
  PhantomFrame,
  Spotlight,
  Liberation23,
  UBA1232,
  LettingGo,
  ECHO_SWAP,
  OUTRO,
  START_3,
  PhantomFrame,
  Spotlight,
  SWAP,
  INTRO_3,
  ECHO_CANCEL,
  Liberation23,
  UBA1232,
  LettingGo,
  PhantomFrame,
  Spotlight,
  OUTRO
]);
var DISTANT_NOON = new Buff({
  name: "Lucilla S1: Distant Noon",
  stats: [[9, 20]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(DISTANT_NOON);
  }
});
var LC_S12 = new Sequence({
  name: "Lucilla S1: Distant Noon",
  updateBuffs: () => {
    if (runningAction(Spotlight))
      applyCurrent(DISTANT_NOON, 1);
  }
});
var SLUMBERING_CHAFE = new Buff({
  name: "Lucilla S2: Slumbering Moonlight (chafe)",
  stats: [[
    18,
    80,
    1310720
    /* Type2.GlacioChafe */
  ]]
});
var SLUMBERING_ECHO = new Buff({
  name: "Lucilla S2: Slumbering Moonlight (echo)",
  stats: [[
    17,
    40,
    28672
    /* Type1.Echo */
  ]]
});
var LC_S22 = new Sequence({
  name: "Lucilla S2: Slumbering Moonlight",
  updateBuffs: () => {
    if (!runningAction(Liberation23))
      return;
    applyTeam(isHeld(MODE_CHAFE) ? SLUMBERING_CHAFE : SLUMBERING_ECHO, 1);
  }
});
var LC_S32 = new Sequence({
  name: "Lucilla S3: Days Fade Unheard",
  applyStats: () => {
    if (runningAction(LettingGo))
      addStat(16, 100);
  }
});
var PAST_FADES = new Buff({
  name: "Lucilla S4: The Past Fades Into Silence",
  maxStacks: 3,
  stats: [[6, 10]],
  perStack: true,
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(PAST_FADES);
  }
});
var LC_S42 = new Sequence({
  name: "Lucilla S4: The Past Fades Into Silence",
  updateBuffs: () => {
    if (runningAction(OblivionEcho) || runningAction(OblivionChafe))
      applyCurrent(PAST_FADES, 1);
  }
});
var LC_S52 = new Sequence({
  name: "Lucilla S5: Time is Like a Stream",
  applyStats: () => {
    if (runningAction(OblivionEcho) || runningAction(OblivionChafe))
      addStat(16, 50);
  }
});
var REMEMBRANCE_S6 = new Buff({
  name: "Lucilla S6: Remembrance",
  maxStacks: 3,
  applyStats: () => {
    if (runningAction(LettingGo))
      addStat(17, 200 * frozenStacks());
  },
  convertStats: () => {
    if (runningAction(LettingGo))
      revokeCurrent(REMEMBRANCE_S6);
  }
});
var LC_S62 = new Sequence({
  name: "Lucilla S6: Gazing In the Mist of Time",
  updateBuffs: () => {
    if (runningAction(OblivionEcho) || runningAction(OblivionChafe))
      applyCurrent(REMEMBRANCE_S6, 1);
  }
});
var LC_SEQUENCES = [LC_S12, LC_S22, LC_S32, LC_S42, LC_S52, LC_S62];
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Basic),
  rotation: LC_ROTATION2,
  sequences: LC_SEQUENCES,
  mode: MODE_ECHO
});
var LUCILLA_CHAFE = new Loadout({
  resonator: LUCILLA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Basic),
  rotation: LC_ROTATION2,
  sequences: LC_SEQUENCES,
  mode: MODE_CHAFE
});

// dist/src/resonators/glacio/sanhua.js
function sanhuaAction(id, def2) {
  return new Action(id, { element: 256, scaling: 0, ...def2 });
}
var Intro32 = sanhuaAction("Intro - Freezing Thorns", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 139.17,
  energy: 10,
  concerto: 10,
  offtune: 2800,
  updateBuffs: () => applyCurrent(THORN_BUFF, 1)
});
var Outro33 = sanhuaAction("Outro - Silversnow", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(SANHUA_OUTRO)
});
var Skill29 = sanhuaAction("Skill - Eternal Frost", {
  node: 1,
  cast: 3,
  type: 12288,
  mv: 359.85,
  offtune: 8e3,
  energy: 10,
  concerto: 15,
  updateBuffs: () => applyCurrent(PRISM_BUFF, 1)
});
var Liberation24 = sanhuaAction("Liberation - Glacial Gaze", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 809.48,
  offtune: 61440,
  energy: 10,
  concerto: 20,
  resetEnergy: true,
  updateBuffs: () => applyCurrent(GLACIER_BUFF, 1)
});
var BA132 = sanhuaAction("Basic - Frigid Light 1", { node: 0, cast: 1, type: 4096, mv: 48.71, energy: 0.87, concerto: 2, offtune: 2800 });
var BA231 = sanhuaAction("Basic - Frigid Light 2", { node: 0, cast: 1, type: 4096, mv: 73.76, energy: 1.32, concerto: 4, offtune: 4240 });
var BA331 = sanhuaAction("Basic - Frigid Light 3", { node: 0, cast: 1, type: 4096, mv: 86.32, energy: 1.52, concerto: 8, offtune: 4960 });
var BA424 = sanhuaAction("Basic - Frigid Light 4", { node: 0, cast: 1, type: 4096, mv: 79.34, energy: 1.42, concerto: 8, offtune: 4560 });
var BA53 = sanhuaAction("Basic - Frigid Light 5", { node: 0, cast: 1, type: 4096, mv: 233.81, energy: 4.2, concerto: 10, offtune: 13440 });
var HA26 = sanhuaAction("Heavy - Frigid Light", { node: 0, cast: 2, type: 8192, mv: 111.35, energy: 2, concerto: 8, offtune: 8e3 });
var MA38 = sanhuaAction("Mid-air - Frigid Light", { node: 0, cast: 1, type: 4096, mv: 86.29, energy: 0.51, concerto: 1, offtune: 9520 });
var FHA13 = sanhuaAction("Forte Heavy - Detonate", {
  node: 0,
  cast: 2,
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
  stats: [[
    17,
    20,
    12288
    /* Type1.Skill */
  ]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(CONDENSATION);
  }
});
var SH_INHERENT_1 = new Inherent({
  name: "Inherent: Condensation",
  updateBuffs: () => {
    if (runningAction(Intro32))
      applyCurrent(CONDENSATION, 1);
  }
});
var AVALANCHE = new Buff({
  name: "Inherent: Avalanche",
  applyStats: () => {
    if (runningAction(DETONATE_THORN) || runningAction(DETONATE_PRISM) || runningAction(DETONATE_GLACIER))
      addStat(17, 20);
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(AVALANCHE);
  }
});
var SH_INHERENT_2 = new Inherent({
  name: "Inherent: Avalanche",
  updateBuffs: () => {
    if (runningAction(BA53))
      applyCurrent(AVALANCHE, 1);
  }
});
var S1_CRIT = new Buff({
  name: "Sanhua S1: Solitude's Embrace",
  stats: [[9, 15]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(S1_CRIT);
  }
});
var S4_WINDOW = new Buff({
  name: "Sanhua S4: Blade Mastery",
  applyStats: () => {
    if (runningAction(FHA13))
      addStat(17, 120);
  },
  convertStats: () => {
    if (runningAction(FHA13) || casting(
      6
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
      5
      /* Cast.Intro */
    ) && isHeld(SANHUA_RESONATOR))
      revokeTeam(S6_ATK);
  }
});
var THORN_BUFF = new Buff({
  name: "Sanhua: Ice Thorn",
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(THORN_BUFF);
  }
});
var PRISM_BUFF = new Buff({
  name: "Sanhua: Ice Prism",
  convertStats: () => {
    if (casting(
      6
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
      6
      /* Cast.Outro */
    ))
      revokeCurrent(GLACIER_BUFF);
  }
});
var SANHUA_OUTRO = new Buff({
  name: "Sanhua: Outro",
  stats: [[
    18,
    38,
    4096
    /* Type1.Basic */
  ]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var SANHUA_S1 = new Sequence({
  name: "Sanhua S1: Solitude's Embrace",
  updateBuffs: () => {
    if (runningAction(BA53))
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
    if (runningAction(Liberation24))
      applyCurrent(S4_WINDOW, 1);
  }
});
var SANHUA_S5 = new Sequence({
  name: "Sanhua S5: Unraveling Fate",
  applyStats: () => {
    if (runningAction(DETONATE_THORN) || runningAction(DETONATE_PRISM) || runningAction(DETONATE_GLACIER))
      addStat(10, 100);
  },
  updateBuffs: () => {
    if (runningAction(Liberation24))
      applyCurrent(GLACIER_BUFF, 1);
  }
});
var SANHUA_S6 = new Sequence({
  name: "Sanhua S6: Daybreak Radiance",
  updateBuffs: () => {
    if (runningAction(DETONATE_PRISM) || runningAction(DETONATE_GLACIER))
      applyTeam(S6_ATK, 1);
  }
});
var SANHUA_TALENTS = new Talent({
  name: "Sanhua: Talents",
  stats: [[6, 12], [
    17,
    12,
    256
    /* Attribute.Glacio */
  ]]
});
var SANHUA_RESONATOR = new Resonator({
  name: "Sanhua",
  talent: SANHUA_TALENTS,
  inherent1: SH_INHERENT_1,
  inherent2: SH_INHERENT_2,
  element: 256,
  weapon: 0,
  intro: () => Intro32,
  outro: () => Outro33,
  color: "#5fc9e8",
  maxEnergy: 125,
  tier: 2,
  constantStats: () => {
    addStat(1, 10063);
    addStat(0, 275);
    addStat(2, 941);
  }
});
var SH_ROTATION_S5 = new Rotation([
  NOINTRO,
  FHA13,
  INTRO,
  Skill29,
  Liberation24,
  FHA13,
  ECHO_SWAP,
  OUTRO
]);
var SH_ROTATION = new Rotation([
  NOINTRO,
  FHA13,
  Skill29,
  FHA13,
  Liberation24,
  FHA13,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  FHA13,
  Skill29,
  Liberation24,
  FHA13,
  ECHO_SWAP,
  OUTRO
]);
var SANHUA = new Loadout({
  resonator: SANHUA_RESONATOR,
  weapons: [EMERALD_OF_GENESIS, BLAZING_BRILLIANCE, OVERTURE],
  echoLoadouts: [new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC)],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    9,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Skill, Substat.Er),
  rotation: { 0: SH_ROTATION, 5: SH_ROTATION_S5 },
  sequences: [SANHUA_S1, SANHUA_S2, SANHUA_S3, SANHUA_S4, SANHUA_S5, SANHUA_S6]
});

// dist/src/resonators/glacio/suisui.js
function suisuiAction(id, def2) {
  return new Action(id, { element: 256, scaling: 0, ...def2 });
}
var BA133 = suisuiAction("Basic - Zephyr Stance 1", { node: 0, cast: 1, type: 4096, mv: 63.15, energy: 1, concerto: 3.18, offtune: 3176, forte1: 24 });
var BA233 = suisuiAction("Basic - Zephyr Stance 2", { node: 0, cast: 1, type: 4096, mv: 122, energy: 1.92, concerto: 6.14, offtune: 6136, forte1: 46 });
var BA332 = suisuiAction("Basic - Zephyr Stance 3", { node: 0, cast: 1, type: 4096, mv: 139.34, energy: 2.2, concerto: 7.03, offtune: 7010, forte1: 53 });
var BA425 = suisuiAction("Basic - Zephyr Stance 4", { node: 0, cast: 1, type: 4096, mv: 159.08, energy: 2.5, concerto: 8, offtune: 8e3, forte1: 60 });
var MA39 = suisuiAction("Mid-air - Zephyr Stance", { node: 0, cast: 1, type: 4096, mv: 70.72, energy: 1.86, concerto: 5.93, offtune: 5928 });
var DC28 = suisuiAction("Dodge Counter - Zephyr Stance 3", { node: 0, cast: 0, type: 4096, mv: 170.67, energy: 2.7, concerto: 18.6, offtune: 8586, forte1: 30 });
var Skill30 = suisuiAction("Skill - Vernal Screen: Zephyr Stance", { node: 1, cast: 3, type: 12288, mv: 143.16, energy: 2.28, concerto: 7.2, offtune: 7200, forte1: 40 });
var ESkill4 = suisuiAction("Skill - Awakening Spring", {
  node: 1,
  cast: 3,
  type: 12288,
  scaling: 1,
  mv: 28.63,
  energy: 5,
  concerto: 9.6,
  offtune: 9600,
  forte1: -120,
  resetForte2: true,
  updateDebuffs: () => {
    applyEnemy(GLACIO_CHAFE, 1);
    applyCurrent(HEALS, 1);
  }
});
var FBA15 = suisuiAction("Basic - Drizzle Stance 1", { node: 2, cast: 1, type: 4096, mv: 78.28, energy: 1.24, concerto: 3.96, offtune: 3936, forte2: 84 });
var FBA25 = suisuiAction("Basic - Drizzle Stance 2", { node: 2, cast: 1, type: 4096, mv: 159.07, energy: 2.5, concerto: 8, offtune: 8e3, forte2: 170 });
var FBA35 = suisuiAction("Basic - Drizzle Stance 3", { node: 2, cast: 1, type: 4096, mv: 165.12, energy: 2.64, concerto: 8.4, offtune: 8304, forte2: 180 });
var FBA45 = suisuiAction("Basic - Drizzle Stance 4", {
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
var FHA14 = suisuiAction("Heavy - Drizzle Stance", { node: 2, cast: 2, type: 8192, mv: 238.59, energy: 3.78, concerto: 12, offtune: 12e3, forte2: 258 });
var FHA24 = suisuiAction("Basic - Illuminating Dew", { node: 2, cast: 1, type: 4096, mv: 104.98, energy: 2.75, concerto: 8.8, offtune: 8800 });
var FMA = suisuiAction("Basic - Swallow's Cut", { node: 2, cast: 1, type: 4096, mv: 107.65, energy: 2.82, concerto: 9.03, offtune: 9024 });
var FSkill8 = suisuiAction("Skill - Vernal Screen: Drizzle Stance", { node: 1, cast: 3, type: 12288, mv: 143.16, energy: 2.27, concerto: 7.2, offtune: 7200, forte2: 100 });
var Liberation25 = suisuiAction("Liberation - Song of Thoroughfare", {
  node: 3,
  cast: 4,
  cutscene: true,
  concerto: 20,
  resetEnergy: true,
  updateBuffs: () => applyTeam(CEASELESS_LANDSCAPE, 1)
});
var Intro33 = suisuiAction("Intro - Tinkling Jade", {
  node: 4,
  cast: 5,
  type: 20480,
  scaling: 1,
  mv: 28.63,
  energy: 10,
  concerto: 19.6,
  offtune: 9600,
  resetForte1: true,
  resetForte2: true,
  updateDebuffs: () => {
    applyEnemy(GLACIO_CHAFE, 1);
    applyCurrent(HEALS, 1);
  }
});
var Outro34 = suisuiAction("Outro - Rippling Waters", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  resetForte2: true,
  updateBuffs: () => {
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
      if (applied2(status) || isType(tag))
        maxStackIncrease(status, 3);
    }
    if (applied2(ELECTRO_FLARE) || isType(
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
      22,
      6,
      384
      /* Attribute.Havoc */
    );
    addStat(
      21,
      12,
      384
      /* Attribute.Havoc */
    );
  }
});
var RIPPLING_WATERS = new Buff({
  name: "Suisui: Outro",
  stats: [[18, 25]]
});
var REFLECTING_SHADOWS = new Buff({ name: "Suisui: Reflecting Shadows" });
var ROAMING_TRANSCENDENT = new Buff({
  name: "Suisui: Roaming Transcendent",
  applyStats: () => {
    if (isActive())
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
function mistEarned() {
  const me = currentTeam().slot;
  return consumedAny() > 0 || stacksOfTeam(MOUNTAINS_WASHED) > 0 && (inflictedNegativeStatusBy(me) || NEGATIVE_STATUS_TAGS.some(isType));
}
var UNDULATING_MIST = new Buff({
  name: "Suisui: Undulating Mist",
  maxStacks: 2,
  display: () => `Suisui: Undulating Mist${frozenStacks() >= 2 ? " (consumed)" : ""}`,
  updateBuffs: () => {
    lostOnSwap();
    if (mistEarned())
      applyCurrent(UNDULATING_MIST, 1);
  },
  applyStats: () => {
    if (frozenStacks() >= 2)
      addStat(6, 50);
  },
  afterAction: () => {
    if (mistEarned())
      applyCurrent(UNDULATING_MIST, 1);
  }
});
var TAGGED_STATUSES = [...LANDSCAPE_CAPS, [
  ELECTRO_FLARE,
  1572864
  /* Type2.ElectroFlare */
]];
var NEGATIVE_STATUS_TAGS = TAGGED_STATUSES.map(([, tag]) => tag);
var MOUNTAINS_WASHED = new Buff({ name: "Suisui S1: Mountains Washed Into Paintings" });
var SS_S1 = new Sequence({
  name: "Suisui S1: Mountains Washed Into Paintings",
  combatStart: () => applyTeam(MOUNTAINS_WASHED, 1)
});
var CLOUDS_POUR = new Buff({
  name: "Suisui S2: Clouds Pour Like Molten Gold",
  stats: [[10, 50]]
});
var CLOUDS_POUR_WATCH = new Buff({
  name: "Suisui S2: Clouds Pour Like Molten Gold (watch)",
  updateGlobal: () => {
    if (!stacksOfTeam(CEASELESS_LANDSCAPE))
      return;
    const actor = currentTeam().slot;
    if (actor.resonator && TAGGED_STATUSES.some(([status, tag]) => appliedByMember(status, actor) || isType(tag)))
      addBuff(actor.resonator, CLOUDS_POUR, 1);
  },
  afterAction: () => {
    if (stacksOfTeam(CEASELESS_LANDSCAPE) && consumedByMe(HAVOC_BANE))
      applyCurrent(CLOUDS_POUR, 1);
  }
});
var SS_S2 = new Sequence({
  name: "Suisui S2: Clouds Pour Like Molten Gold",
  combatStart: () => applyTeam(CLOUDS_POUR_WATCH, 1)
});
var KINGFISHER = new Buff({
  name: "Suisui S3: Kingfisher",
  updateBuffs: () => lostOnSwap(),
  applyStats: () => {
    if (runningAction(FBA45)) {
      addStat(27, 20);
      addStat(31, 350);
    }
  },
  convertStats: () => {
    if (runningAction(FBA45))
      revokeCurrent(KINGFISHER);
  }
});
var SS_S3 = new Sequence({
  name: "Suisui S3: Sparse Curtains Invite Evening Glow",
  updateBuffs: () => {
    if (runningAction(FSkill8))
      applyCurrent(KINGFISHER, 1);
  }
});
var SS_S4 = new Sequence({ name: "Suisui S4: Autumn Mountains in Choir Sing" });
var SS_S5 = new Sequence({
  name: "Suisui S5: I Long To Ride The Eastern Wind",
  applyStats: () => {
    if (runningAction(FBA15) || runningAction(FBA25) || runningAction(FBA35) || runningAction(FBA45) || runningAction(FHA14))
      addStat(16, 100);
  }
});
var SS_S6 = new Sequence({
  name: "Suisui S6: Staying True To This Splendid Realm",
  applyStats: () => {
    if (runningAction(Intro33) || runningAction(ESkill4))
      addStat(10, 500);
  }
});
var SS_SEQUENCES = [SS_S1, SS_S2, SS_S3, SS_S4, SS_S5, SS_S6];
var SS_INHERENT_1 = new Inherent({
  name: "Inherent: Sky Over Water",
  applyStats: () => {
    if (!runningAction(ESkill4) && !runningAction(Intro33))
      return;
    addStat(27, 18);
    addStat(26, 13);
    addStat(9, 80);
    addStat(
      17,
      240,
      256
      /* Attribute.Glacio */
    );
    addStat(28, 72e3);
  }
});
var SS_INHERENT_2 = new Inherent({ name: "Inherent: Glimmering Gold" });
var SUISUI_TALENTS = new Talent({
  name: "Suisui: Talents",
  constantStats: () => {
    addStat(7, 12);
    addStat(24, 12);
  }
});
var SUISUI_RESONATOR = new Resonator({
  name: "Suisui",
  talent: SUISUI_TALENTS,
  inherent1: SS_INHERENT_1,
  inherent2: SS_INHERENT_2,
  element: 256,
  weapon: 4,
  intro: () => Intro33,
  outro: () => Outro34,
  color: "#e8e6a6",
  maxEnergy: 175,
  maxForte1: 120,
  maxForte2: 600,
  constantStats: () => {
    addStat(1, 16712.5);
    addStat(0, 287.5);
    addStat(2, 1100);
  }
});
var FBA12343 = new ActionGroup("Basic - Drizzle Stance 1234", [FBA15, FBA25, FBA35, FBA45]);
var BA1238 = new ActionGroup("Basic - Zephyr Stance 123", [BA133, BA233, BA332]);
var SS_ROTATION = new Rotation([
  NOINTRO,
  BA1238,
  ESkill4,
  INTRO,
  FSkill8,
  FBA12343,
  ECHO_CANCEL,
  Liberation25,
  OUTRO
]);
var SS_ROTATION_S3 = new Rotation([
  NOINTRO,
  BA1238,
  ESkill4,
  INTRO,
  FSkill8,
  FBA45,
  ECHO_CANCEL,
  Liberation25,
  OUTRO
]);
var SUISUI = new Loadout({
  resonator: SUISUI_RESONATOR,
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
  substat: substats(Substat.HpPct, Substat.Skill, Substat.FlatHp, true),
  highSubstat: highSubs(Substat.Er, Substat.HpPct, Substat.FlatHp, Substat.HpPct),
  rotation: { 0: SS_ROTATION, 3: SS_ROTATION_S3 },
  sequences: SS_SEQUENCES
});

// dist/src/resonators/glacio/zhezhi.js
function zhezhiAction(id, def2) {
  return new Action(id, { element: 256, scaling: 0, ...def2 });
}
var BA134 = zhezhiAction("Basic - Dimming Brush 1", { node: 0, cast: 1, type: 4096, mv: 83.52, energy: 1.5, concerto: 4.8, offtune: 4800, forte1: 10 });
var BA235 = zhezhiAction("Basic - Dimming Brush 2", { node: 0, cast: 1, type: 4096, mv: 102.75, energy: 1.85, concerto: 5.95, offtune: 5905, forte1: 15 });
var BA333 = zhezhiAction("Basic - Dimming Brush 3", { node: 0, cast: 1, type: 4096, mv: 133.61, energy: 2.4, concerto: 7.68, offtune: 7680, forte1: 25 });
var MA40 = zhezhiAction("Mid-air - Dimming Brush", { node: 0, cast: 1, type: 4096, mv: 229.53, energy: 3.4, concerto: 10.91, offtune: 10865, forte1: 25 });
var DC29 = zhezhiAction("Dodge Counter - Dimming Brush", { node: 0, cast: 0, type: 4096, mv: 145.35, energy: 2.15, concerto: 20, offtune: 6880, forte1: 15 });
var HA27 = zhezhiAction("Heavy - Dimming Brush", { node: 0, cast: 2, type: 8192, mv: 112.72, energy: 1.67, concerto: 5.34, offtune: 5336, forte1: 15 });
var Skill31 = zhezhiAction("Skill - Manifestation", {
  node: 1,
  cast: 3,
  type: 12288,
  mv: 295.26,
  energy: 7.92,
  concerto: 8,
  offtune: 4737,
  forte1: -60
});
var FHA15 = zhezhiAction("Forte Heavy - Conjuration", {
  node: 2,
  cast: 2,
  type: 8192,
  mv: 249.03,
  energy: 2.1,
  concerto: 6.69,
  offtune: 6681,
  forte1: -30
});
var FSkill9 = zhezhiAction("Skill - Stroke of Genius", {
  node: 2,
  cast: 3,
  type: 4096,
  mv: 298.22,
  energy: 7,
  concerto: 13,
  offtune: 7736,
  forte2: 1
});
var FSkill33 = zhezhiAction("Forte Skill - Creation's Zenith", {
  node: 2,
  cast: 3,
  type: 4096,
  mv: 357.87,
  energy: 7.02,
  concerto: 13,
  offtune: 10401,
  forte2: -2,
  updateBuffs: () => applyCurrent(IVORY_HERALD, 1)
});
var Liberation26 = zhezhiAction("Liberation - Living Canvas", {
  node: 3,
  cast: 4,
  cutscene: true,
  concerto: 20,
  resetEnergy: true,
  updateBuffs: () => applyTeam(INKLIT_SPIRITS, isHeld(ZZ_S2) ? 27 : 21)
});
var INKLIT_FIELD = new ActionField("Zhezhi: Inklit Spirits");
var ACTION_INKLIT = zhezhiAction("Liberation - Inklit Spirit", {
  node: 3,
  type: 4096,
  type2: 262144,
  mv: 65.21,
  offtune: 4572,
  field: INKLIT_FIELD
});
var ACTION_INKLIT_S5 = zhezhiAction("Liberation - Inklit Spirit (S5)", {
  node: 3,
  type: 4096,
  type2: 262144,
  mv: 91.3,
  field: INKLIT_FIELD
});
var ACTION_HERALD_S6 = zhezhiAction("Skill - Ivory Herald (S6)", {
  node: 2,
  type: 4096,
  mv: 357.86
});
var Intro34 = zhezhiAction("Intro - Radiant Ruin", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 258.48,
  energy: 10.02,
  concerto: 10,
  offtune: 10401,
  forte1: 45
});
var Outro35 = zhezhiAction("Outro - Carve and Draw", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(ZHEZHI_OUTRO)
});
var INKLIT_SPIRITS = coordinatedBuff("Zhezhi: Inklit Spirits", 27, () => ZHEZHI_RESONATOR, ACTION_INKLIT);
var CALLIGRAPHERS_TOUCH = new Buff({
  name: "Inherent: Calligrapher's Touch",
  maxStacks: 3,
  stats: [[6, 6]],
  perStack: true
});
var ZZ_INHERENT_1 = new Inherent({
  name: "Inherent: Calligrapher's Touch",
  updateBuffs: () => {
    if (runningAction(FSkill9) || runningAction(FSkill33))
      applyCurrent(CALLIGRAPHERS_TOUCH, 1);
  }
});
var IVORY_HERALD = new Buff({
  name: "Zhezhi: Ivory Herald",
  stats: [[
    17,
    18,
    4096
    /* Type1.Basic */
  ]]
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
    addStat(26, 15);
    revokeCurrent(ZZ_FLOURISH);
  }
});
var ZZ_INHERENT_2 = new Inherent({
  name: "Inherent: Flourish",
  updateBuffs: () => {
    if (runningAction(Outro35)) {
      queueOutro(ZZ_FLOURISH);
    }
  }
});
var ZHEZHI_TALENTS = new Talent({
  name: "Zhezhi: Talents",
  stats: [[9, 8], [6, 12]]
});
var ZHEZHI_MATRIX = matrix("Zhezhi", 20, {
  updateBuffs: () => {
    if (casting(
      4
      /* Cast.Liberation */
    ))
      applyTeam(ZHEZHI_MATRIX_TEAM);
  }
});
var ZHEZHI_RESONATOR = new Resonator({
  name: "Zhezhi",
  matrix: ZHEZHI_MATRIX,
  talent: ZHEZHI_TALENTS,
  inherent1: ZZ_INHERENT_1,
  inherent2: ZZ_INHERENT_2,
  element: 256,
  weapon: 4,
  intro: () => Intro34,
  outro: () => Outro35,
  color: "#8fd3e8",
  maxEnergy: 125,
  maxForte1: 90,
  maxForte2: 2,
  constantStats: () => {
    addStat(1, 12250);
    addStat(0, 375);
    addStat(2, 1198);
  }
});
var BA1239 = new ActionGroup("Basic - Dimming Brush 123", [BA134, BA235, BA333]);
var ZZ_ROTATION = new Rotation([
  START_3,
  Liberation26,
  SWAP,
  NOINTRO,
  BA1239,
  INTRO,
  BA1239,
  Liberation26,
  Skill31,
  FHA15,
  FSkill9,
  FSkill9,
  FSkill33,
  ECHO_SWAP,
  OUTRO
]);
var BRUSHWORKS_FINISH = new Buff({
  name: "Zhezhi S1: Brushwork's Finish",
  stats: [[9, 10]]
});
var ZZ_S1 = new Sequence({
  name: "Zhezhi S1: Brushwork's Finish",
  applyStats: () => {
    if (runningAction(FSkill33))
      addStat(26, 15);
  },
  updateBuffs: () => {
    if (runningAction(FSkill33))
      applyCurrent(BRUSHWORKS_FINISH, 1);
  }
});
var ZZ_S2 = new Sequence({ name: "Zhezhi S2: Vivid Strokes" });
var REFLECTIONS_GRACE = new Buff({
  name: "Zhezhi S3: Reflection's Grace",
  maxStacks: 3,
  stats: [[6, 15]],
  perStack: true
});
var ZZ_S3 = new Sequence({
  name: "Zhezhi S3: Reflection's Grace",
  updateBuffs: () => {
    if (runningAction(Skill31) || runningAction(FSkill9) || runningAction(FSkill33))
      applyCurrent(REFLECTIONS_GRACE, 1);
  }
});
var HUES_SPECTRUM = new Buff({
  name: "Zhezhi S4: Hue's Spectrum",
  stats: [[6, 20]]
});
var ZZ_S4 = new Sequence({
  name: "Zhezhi S4: Hue's Spectrum",
  updateBuffs: () => {
    if (runningAction(Liberation26))
      applyTeam(HUES_SPECTRUM, 1);
  }
});
var ZZ_S5 = new Sequence({
  name: "Zhezhi S5: Composition's Clue",
  updateBuffs: () => {
    if (runningAction(ACTION_INKLIT) && stacksOfTeam(INKLIT_SPIRITS) % 3 === 0)
      queue(ACTION_INKLIT_S5);
  }
});
var ZZ_S6 = new Sequence({
  name: "Zhezhi S6: Infinite Legacy",
  updateBuffs: () => {
    if (runningAction(FSkill9) || runningAction(FSkill33))
      queue(ACTION_HERALD_S6);
  }
});
var ZZ_SEQUENCES = [ZZ_S1, ZZ_S2, ZZ_S3, ZZ_S4, ZZ_S5, ZZ_S6];
var ZHEZHI_MATRIX_TEAM = new Buff({
  name: "Zhezhi: Matrix Buff",
  stats: [[
    17,
    30,
    12288
    /* Type1.Skill */
  ]]
});
var ZHEZHI = new Loadout({
  resonator: ZHEZHI_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Basic, Substat.Er, Substat.FlatAtk),
  rotation: ZZ_ROTATION,
  sequences: ZZ_SEQUENCES
});

// dist/src/resonators/havoc/camellya.js
function camellyaAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var BA135 = camellyaAction("Basic - Burgeoning 1", { node: 0, cast: 1, type: 4096, mv: 62.53, energy: 0.93, concerto: 1.85, offtune: 2960, forte1: -6.15 });
var BA236 = camellyaAction("Basic - Burgeoning 2", { node: 0, cast: 1, type: 4096, mv: 92.96, energy: 1.38, concerto: 2.76, offtune: 4400, forte1: -9.14 });
var BA334 = camellyaAction("Basic - Burgeoning 3", { node: 0, cast: 1, type: 4096, mv: 152.1, energy: 2.25, concerto: 4.5, offtune: 7200, forte1: -14.94 });
var BA426 = camellyaAction("Basic - Burgeoning 4 (Hold)", { node: 0, cast: 1, type: 4096, mv: 494, energy: 5.4, concerto: 10.8, offtune: 17280, forte1: -36 });
var BA54 = camellyaAction("Basic - Burgeoning 5", { node: 0, cast: 1, type: 4096, mv: 192.68, energy: 2.88, concerto: 5.72, offtune: 9120, forte1: -18.96 });
var MA41 = camellyaAction("Mid-air - Attack", { node: 0, cast: 1, type: 4096, mv: 131.22, energy: 1.66, concerto: 3.3, offtune: 5280, forte1: -10.96 });
var DC30 = camellyaAction("Dodge Counter - Burgeoning", { node: 0, cast: 0, type: 4096, mv: 298.2, energy: 2.25, concerto: 14.5, offtune: 7200, forte1: -24.9 });
var HA28 = camellyaAction("Heavy - Pruning", { node: 0, cast: 2, type: 4096, mv: 264.42, energy: 3.33, concerto: 6.66, offtune: 10641, forte1: -22.08 });
var CrimsonBlossom = camellyaAction("Skill - Crimson Blossom", {
  node: 1,
  cast: 3,
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
var FloralRavage = camellyaAction("Skill - Floral Ravage", { node: 1, cast: 3, type: 4096, mv: 263.05, concerto: 7, energy: 3.7, offtune: 11760, forte1: -24.45 });
var Ephemeral = camellyaAction("Forte Skill - Ephemeral", {
  node: 2,
  cast: 3,
  type: 4096,
  mv: 1262.45,
  forte1: 100,
  resetForte1: true,
  concerto: -100,
  energy: 12,
  offtune: 60800,
  applyStats: () => addStat(27, 30),
  updateBuffs: () => {
    const buds = stacksOf(CRIMSON_BUD);
    revokeCurrent(BUDDING_MODE);
    applyCurrent(BUDDING_MODE, 1 + buds);
    revokeCurrent(CRIMSON_BUD);
  }
});
var Perennial = camellyaAction("Forte Skill - Perennial (S6)", {
  node: 2,
  cast: 3,
  type: 4096,
  mv: 1262.45,
  forte1: 50,
  concerto: -100,
  applyStats: () => addStat(27, 50),
  updateBuffs: () => {
    revokeCurrent(BUDDING_MODE);
    applyCurrent(BUDDING_MODE, 11);
    revokeCurrent(CRIMSON_BUD);
  }
});
var Liberation27 = camellyaAction("Liberation - Fervor Efflorescent", { node: 3, cast: 4, cutscene: true, type: 16384, mv: 1202.81, concerto: 20, offtune: 84e3, resetEnergy: true });
var Intro35 = camellyaAction("Intro - Everblooming", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 198.81,
  concerto: 10,
  forte1: 100,
  resetForte1: true,
  energy: 10,
  offtune: 9600
});
var Outro36 = camellyaAction("Outro - Twining", { cast: 6, type: 24576, mv: 329.24, concerto: -100, swapOut: true });
var BLOSSOM_MODE = new Buff({
  name: "Camellya: Blossom Mode",
  convertStats: () => {
    if (runningAction(FloralRavage) || runningAction(ViningRonde))
      revokeCurrent(BLOSSOM_MODE);
  }
});
function inSweetDream() {
  return runningAction(BA135) || runningAction(BA236) || runningAction(BA334) || runningAction(BA426) || runningAction(BA54) || runningAction(VW1) || runningAction(VW2) || runningAction(VW3) || runningAction(VW4) || runningAction(BlazingWaltz) || runningAction(ViningRonde) || runningAction(Atonement) || runningAction(CrimsonBlossom) || runningAction(FloralRavage);
}
var BUDDING_MODE = new Buff({
  name: "Camellya: Sweet Dream",
  maxStacks: 11,
  // S6 lifts the flat 50 to 200 (Perennial's 11 stacks land on the 250 cap); S3 is +58% ATK while held
  applyStats: () => {
    if (isHeld(CM_S3))
      asSource(CM_S3, () => addStat(6, 58));
    if (!inSweetDream())
      return;
    addStat(16, 45 + 5 * frozenStacks());
    if (isHeld(CM_S6))
      asSource(CM_S6, () => addStat(16, 150));
  },
  // two real end conditions: switched off field, and "all Crimson Pistils consumed" — checked
  // after applyStats() already paid out, with this action's own drain (not banked yet) counted in,
  // excluding the two casts that open it (their own pre-clamp to 0 would read as "ran out")
  convertStats: () => {
    lostOnSwap();
    const a = currentAction();
    if (!runningAction(Ephemeral) && !runningAction(Perennial) && forte1() + a.forte1 <= 0)
      revokeCurrent(BUDDING_MODE);
  },
  display: () => `Camellya: Sweet Dream +${frozenStacks() - 1} Buds`
});
var CRIMSON_BUD = new Buff({
  name: "Camellya: Crimson Bud",
  maxStacks: 10,
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(CRIMSON_BUD);
  }
});
var SEEDBED = new Inherent({
  name: "Inherent: Seedbed",
  stats: [[
    17,
    15,
    384
    /* Attribute.Havoc */
  ]]
});
var EPIPHYTE = new Inherent({
  name: "Inherent: Epiphyte",
  stats: [[
    17,
    15,
    4096
    /* Type1.Basic */
  ]]
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
      for (let i = 0; i < buds; i++) {
        addStat(27, 4);
      }
    }
    addStat(14, isHeld(BUDDING_MODE) ? -100 : 150);
  },
  convertStats: () => revokeCurrent(CONSUME_CRIMSON_PISTIL)
});
var CAMELLYA_TALENTS = new Talent({
  name: "Camellya: Talents",
  stats: [[6, 12], [10, 16]]
});
var CAMELLYA_RESONATOR = new Resonator({
  name: "Camellya",
  matrix: matrix("Camellya", 25),
  talent: CAMELLYA_TALENTS,
  inherent1: SEEDBED,
  inherent2: EPIPHYTE,
  element: 384,
  weapon: 0,
  intro: () => Intro35,
  outro: () => Outro36,
  color: "#891c2b",
  maxEnergy: 125,
  maxForte1: 100,
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
var SOMEWHERE_NO_ONE_TRAVELLED = new Buff({
  name: "Camellya S1: Somewhere No One Travelled",
  stats: [[10, 28]],
  until: 0
});
var CM_S1 = new Sequence({
  name: "Camellya S1: Somewhere No One Travelled",
  updateBuffs: () => {
    if (runningAction(Intro35))
      applyCurrent(SOMEWHERE_NO_ONE_TRAVELLED, 1);
  }
});
var CM_S2 = new Sequence({
  name: "Camellya S2: Calling Upon the Silent Rose",
  applyStats: () => {
    if (runningAction(Ephemeral) || runningAction(Perennial))
      addStat(16, 120);
  }
});
var CM_S3 = new Sequence({
  name: "Camellya S3: A Bud Adorned by Thorns",
  applyStats: () => {
    if (runningAction(Liberation27))
      addStat(16, 50);
  }
});
var ROOTS_SET_DEEP = new Buff({
  name: "Camellya S4: Roots Set Deep In Eternity",
  stats: [[
    17,
    25,
    4096
    /* Type1.Basic */
  ]]
});
var CM_S4 = new Sequence({
  name: "Camellya S4: Roots Set Deep In Eternity",
  updateBuffs: () => {
    if (runningAction(Intro35))
      applyTeam(ROOTS_SET_DEEP, 1);
  }
});
var CM_S5 = new Sequence({
  name: "Camellya S5: Infinity Held in Your Palm",
  applyStats: () => {
    if (runningAction(Intro35))
      addStat(16, 303);
    if (runningAction(Outro36))
      addStat(16, 68);
  }
});
var CM_S6 = new Sequence({ name: "Camellya S6: Bloom For You Thousand Times Over" });
var CM_SEQUENCES = [CM_S1, CM_S2, CM_S3, CM_S4, CM_S5, CM_S6];
var VW1234 = new ActionGroup("Basic - Vining Waltz 123H4", [VW1, VW2, VW3, BlazingWaltz, VW4]);
var BA123452 = new ActionGroup("Basic - Burgeoning 1234H5", [BA135, BA236, BA334, BA426, BA54]);
var CM_ROTATION_DOUBLE = new Rotation([
  DOUBLE_INTRO,
  CrimsonBlossom,
  ECHO_CANCEL,
  HA28,
  BA426.swap(),
  SWAP,
  INTRO,
  Liberation27,
  Ephemeral,
  CrimsonBlossom,
  VW1234,
  FloralRavage,
  OUTRO
]);
var CM_ROTATION_DOUBLE_S6 = new Rotation([
  DOUBLE_INTRO,
  CrimsonBlossom,
  ECHO_CANCEL,
  HA28,
  BA426,
  FloralRavage.swap(),
  SWAP,
  INTRO,
  Liberation27,
  Ephemeral,
  CrimsonBlossom,
  VW1234,
  FloralRavage,
  Perennial,
  SWAP
]);
var CAMELLYA_DOUBLE = new Loadout({
  resonator: CAMELLYA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Er),
  rotation: { 0: CM_ROTATION_DOUBLE, 6: CM_ROTATION_DOUBLE_S6 },
  sequences: CM_SEQUENCES
});

// dist/src/resonators/havoc/cantarella.js
function cantaAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var BA136 = cantaAction("Basic - Illusion Collapse 1", { node: 0, cast: 1, type: 4096, mv: 79.53, energy: 1, concerto: 2, offtune: 3200 });
var BA237 = cantaAction("Basic - Illusion Collapse 2", { node: 0, cast: 1, type: 4096, mv: 145.76, energy: 1.84, concerto: 3.68, offtune: 5864 });
var BA335 = cantaAction("Basic - Illusion Collapse 3", { node: 0, cast: 1, type: 4096, mv: 145.14, energy: 1.84, concerto: 3.66, offtune: 5840, forte1: 1 });
var EHA5 = cantaAction("Heavy - Delusive Dive", {
  node: 0,
  cast: 2,
  type: 8192,
  mv: 106.1,
  energy: 1.68,
  concerto: 3.34,
  offtune: 5336,
  // 53.05%x2
  updateBuffs: () => applyCurrent(MIRAGE, 1)
});
var FBA16 = cantaAction("Forte Basic - Phantom Sting 1", { node: 2, cast: 1, type: 4096, mv: 105.99, energy: 1.35, concerto: 2.67, offtune: 4266, forte1: -1, forte2: 1 });
var FBA26 = cantaAction("Forte Basic - Phantom Sting 2", { node: 2, cast: 1, type: 4096, mv: 125.86, energy: 1.6, concerto: 3.18, offtune: 5064, forte1: -1, forte2: 1 });
var FBA36 = cantaAction("Forte Basic - Phantom Sting 3", {
  node: 2,
  cast: 1,
  type: 4096,
  mv: 258.48,
  energy: 3.28,
  concerto: 6.52,
  offtune: 10400,
  forte1: -1,
  forte2: 1,
  updateBuffs: () => dreamweavers(StingDreamweaver)
});
var Skill33 = cantaAction("Skill - Graceful Step", { node: 1, cast: 3, type: 12288, mv: 147.2, energy: 1.56, concerto: 10, offtune: 4936, forte1: 1 });
var ESkill5 = cantaAction("Skill - Flickering Reverie", {
  node: 1,
  cast: 3,
  cast2: 7,
  type: 12288,
  mv: 196.23,
  energy: 1.65,
  concerto: 10,
  offtune: 5264,
  updateBuffs: () => applyEnemy(HAZY_DREAM, 1)
});
var FSkill10 = cantaAction("Forte Skill - Perception Drain", {
  node: 2,
  cast: 3,
  cast2: 7,
  type: 4096,
  mv: 1335.98,
  energy: 21.1,
  concerto: 12,
  offtune: 57864,
  forte2: -3,
  // 667.99%x2
  updateBuffs: () => applyEnemy(HAZY_DREAM, 1)
});
var Liberation28 = cantaAction("Liberation - Beneath the Sea", {
  node: 3,
  cast: 4,
  cutscene: true,
  cast2: 7,
  type: 4096,
  mv: 376,
  concerto: 20,
  offtune: 48e3,
  forte1: 3,
  resetEnergy: true,
  updateBuffs: () => applyTeam(DIFFUSION_WINDOW, isHeld(CA_S5) ? 26 : 21)
  // S5: five more Dreamweavers
});
var DIFFUSION_FIELD = new ActionField("Cantarella: Diffusion");
var ACTION_DIFFUSION = cantaAction("Liberation - Diffusion", { node: 3, type: 4096, type2: 262144, mv: 14.54, field: DIFFUSION_FIELD });
var DREAMWEAVER = { type: 4096, type2: 262144, mv: 14.54 };
var IntroDreamweaver = cantaAction("Intro - Dreamweaver", { node: 3, ...DREAMWEAVER });
var StingDreamweaver = cantaAction("Basic - Dreamweaver", { node: 3, ...DREAMWEAVER });
function dreamweavers(tick) {
  for (let i = 0; i < 3; i++)
    queue(tick);
}
var Intro36 = cantaAction("Intro - Ripple", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 169,
  energy: 3.16,
  concerto: 10,
  offtune: 10120,
  forte1: 1,
  // 42.25%x4
  updateBuffs: () => applyCurrent(ABYSSAL_REBIRTH, 6)
});
var EIntro6 = cantaAction("Intro - Tidal Surge", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 169,
  energy: 3.16,
  concerto: 10,
  offtune: 10640,
  forte1: 1,
  // 16.90%x3+118.30%
  updateBuffs: () => {
    applyCurrent(ABYSSAL_REBIRTH, 6);
    dreamweavers(IntroDreamweaver);
  }
});
var Outro37 = cantaAction("Outro - Gentle Tentacles", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(CANTARELLA_OUTRO)
});
var ESKILL_JOLT = new Action("Jolt", { node: 1, element: 384, scaling: 0, type: 4096, mv: 198.81 });
var DIFFUSION_WINDOW = coordinatedBuff("Cantarella: Diffusion", 26, () => CANTARELLA_RESONATOR, ACTION_DIFFUSION);
var POISON = new Buff({
  name: "Inherent: Poison",
  maxStacks: 2,
  stats: [[
    17,
    6,
    384
    /* Attribute.Havoc */
  ]],
  perStack: true,
  convertStats: () => {
    if (casting(
      6
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
      7
      /* Cast.Echo */
    ) || frozenStacks() <= 0)
      return;
    removeStack(ABYSSAL_REBIRTH, 1);
    if (currentTeam().slot === currentMember())
      addStat(27, 6);
    else
      setConcerto(concerto() + 6);
  }
});
var MIRAGE = new Buff({
  name: "Cantarella: Mirage",
  applyStats: () => {
    if (isHeld(CA_S4))
      asSource(CA_S4, () => addStat(24, 25));
  },
  updateBuffs: () => {
    if (forte1() <= 0 || casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(MIRAGE);
  }
});
var HAZY_DREAM = new Debuff({
  name: "Cantarella: Hazy Dream",
  updateGlobal: () => {
    const a = currentAction();
    if (stacksOfEnemy(HAZY_DREAM) <= 0 || !a.mv)
      return;
    if (runningAction(ESKILL_JOLT) || a.field || isType(
      262144
      /* Type2.Coordinated */
    ) || isType(
      53248
      /* Type1.Utility */
    ))
      return;
    if (HECATE_ACTIONS.has(a))
      return;
    revokeEnemy(HAZY_DREAM);
    if (currentTeam().slot.resonator === CANTARELLA_RESONATOR)
      queue(ESKILL_JOLT);
  }
});
var CANTARELLA_OUTRO = new Buff({
  name: "Cantarella: Outro",
  stats: [[
    18,
    20,
    384
    /* Attribute.Havoc */
  ], [
    18,
    25,
    12288
    /* Type1.Skill */
  ]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var CA_INHERENT_1 = new Inherent({
  name: 'Inherent: "Cure"',
  constantStats: () => {
    addStat(24, 20);
  }
});
var CA_INHERENT_2 = new Inherent({
  name: 'Inherent: "Poison"',
  updateBuffs: () => {
    if (casting(
      7
      /* Cast.Echo */
    ))
      applyCurrent(POISON, 1);
  }
});
var CANTARELLA_TALENTS = new Talent({
  name: "Cantarella: Talents",
  stats: [[9, 8], [6, 12]]
});
var CANTARELLA_RESONATOR = new Resonator({
  name: "Cantarella",
  matrix: matrix("Cantarella", 25),
  talent: CANTARELLA_TALENTS,
  inherent1: CA_INHERENT_1,
  inherent2: CA_INHERENT_2,
  element: 384,
  weapon: 4,
  intro: () => isHeld(MIRAGE) ? EIntro6 : Intro36,
  outro: () => Outro37,
  color: "#896fd6",
  maxEnergy: 125,
  maxForte1: 15,
  maxForte2: 3,
  updateDebuffs: () => {
    if (runningAction(FBA16) || runningAction(FBA26) || runningAction(FBA36) || runningAction(FSkill10))
      applyCurrent(HEALS, 1);
  },
  constantStats: () => {
    addStat(1, 11600);
    addStat(0, 400);
    addStat(2, 1100);
  }
});
var CA_S1 = new Sequence({
  name: "Cantarella S1: Embrace the Endless Waves",
  applyStats: () => {
    if (runningAction(Skill33) || runningAction(ESkill5) || runningAction(FSkill10)) {
      addStat(30, 1);
      addStat(16, 50);
    }
  }
});
var CA_S2 = new Sequence({
  name: "Cantarella S2: Surrender to the Illusive Reverie",
  updateBuffs: () => {
    if (runningAction(Liberation28))
      applyEnemy(HAZY_DREAM, 1);
  },
  applyStats: () => {
    if (runningAction(ESKILL_JOLT))
      addStat(16, 245);
  }
});
var CA_S3 = new Sequence({
  name: "Cantarella S3: Gaze into the Abyss",
  applyStats: () => {
    if (runningAction(Liberation28))
      addStat(16, 370);
  },
  updateBuffs: () => {
    if (runningAction(Liberation28))
      applyCurrent(MIRAGE, 1);
  }
});
var CA_S4 = new Sequence({ name: "Cantarella S4: Behold Your Own Soul" });
var CA_S5 = new Sequence({ name: "Cantarella S5: Rest in Your Reflection" });
var FALL_DEEPER = new Buff({
  name: "Cantarella S6: Fall, Fall... and Fall Deeper into the Dream",
  stats: [[23, 30]],
  until: 0
});
var CA_S6 = new Sequence({
  name: "Cantarella S6: Fall, Fall... and Fall Deeper into the Dream",
  applyStats: () => {
    if (runningAction(FBA16) || runningAction(FBA26) || runningAction(FBA36))
      addStat(16, 80);
  },
  updateBuffs: () => {
    if (runningAction(Liberation28))
      applyCurrent(FALL_DEEPER, 1);
  }
});
var CA_SEQUENCES = [CA_S1, CA_S2, CA_S3, CA_S4, CA_S5, CA_S6];
var FBA1232 = new ActionGroup("Forte Basic - Phantom Sting 123", [FBA16, FBA26, FBA36]);
var CA_ROTATION = new Rotation([
  INTRO,
  BA335,
  Skill33,
  ECHO_CANCEL,
  Liberation28,
  EHA5,
  FBA16,
  ESkill5,
  FBA16,
  FBA26,
  FSkill10,
  OUTRO
]);
var CA_ROTATION_MDPS = new Rotation([
  INTRO,
  BA335,
  Skill33,
  ECHO_ONFIELD,
  Liberation28,
  EHA5,
  ESkill5,
  FBA1232,
  FSkill10,
  ECHO_ONFIELD,
  FBA1232,
  OUTRO
]);
var CANTARELLA = new Loadout({
  resonator: CANTARELLA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Basic),
  rotation: CA_ROTATION,
  sequences: CA_SEQUENCES
});
var CANTARELLA_MDPS = new Loadout({
  resonator: CANTARELLA_RESONATOR,
  weapons: [WHISPERS_OF_SIRENS, COSMIC_RIPPLES, NEW_STD_RECTIFIER, STRINGMASTER, LETHEAN_ELEGY, RIME_DRAPED_SPROUTS],
  echoLoadouts: [
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Basic),
  rotation: CA_ROTATION_MDPS,
  sequences: CA_SEQUENCES
});

// dist/src/resonators/havoc/chisa.js
function chisaAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var Intro37 = chisaAction("Intro - Reverberance - Return", {
  node: 4,
  cast: 5,
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
var Outro38 = chisaAction("Outro - Unraveling - Law Zero", {
  cast: 6,
  swapOut: true,
  concerto: -100,
  updateBuffs: () => applyTeam(RESONANT_THREAD_OF_CLOSURE, 1)
});
var spendRing = () => ({ updateBuffs: () => applyCurrent(RING_CONSUMED, -currentAction().forte2) });
var MARK_SNARE = { updateDebuffs: () => applyEnemy(UNSEEN_SNARE, 1) };
var SNIP_HEAL = { updateDebuffs: () => applyCurrent(HEALS, 1) };
var BA137 = chisaAction("Basic - Reign of Silence 1", { node: 0, cast: 1, type: 4096, mv: 33.42, energy: 0.7, concerto: 1.4, offtune: 2240, forte1: 4 });
var BA238 = chisaAction("Basic - Reign of Silence 2", { node: 0, cast: 1, type: 4096, mv: 95.45, energy: 2, concerto: 4, offtune: 6400, forte1: 14 });
var DodgeCounterBA2 = chisaAction("Dodge Counter - Reign of Silence 2", { node: 0, cast: 0, type: 4096, mv: 238.59, energy: 5, concerto: 10, offtune: 11200, forte1: 23 });
var BA336 = chisaAction("Basic - Rending Lunge", { node: 0, cast: 1, type: 4096, mv: 151.1, energy: 3.19, concerto: 6.37, offtune: 10137, forte1: 20 });
var DeathSnip = chisaAction("Basic - Death Snip", { node: 0, cast: 1, type: 16384, mv: 149.06, energy: 2.09, concerto: 4.18, offtune: 6665, forte1: 18, ...SNIP_HEAL });
var DeathSnipSpread = chisaAction("Basic - Death Snip With Spread", { node: 0, cast: 1, type: 16384, mv: 196.84, energy: 2.76, concerto: 5.52, offtune: 8801, forte1: 27, ...SNIP_HEAL });
var ThreadWithdrawn = chisaAction("Basic - Thread Withdrawn", { node: 0, cast: 1, type: 4096, mv: 67.65, energy: 1.44, concerto: 2.85, offtune: 4538, forte1: 16 });
var ReignOfSilenceMidAir = chisaAction("Mid-air - Reign of Silence", { node: 0, cast: 1, type: 4096, mv: 73.96, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: 9 });
var HA29 = chisaAction("Heavy - Reign of Silence", { node: 0, cast: 2, type: 8192, mv: 71.58, energy: 1.5, concerto: 3, offtune: 4800, forte1: 10 });
var SeveredFacet = chisaAction("Heavy - Severed Facet (Mid-Air)", { node: 0, cast: 2, type: 8192, mv: 89.48, energy: 1.88, concerto: 3.76, offtune: 6e3, forte1: 12 });
var HangingFinality = chisaAction("Basic - Hanging Finality", { node: 0, cast: 1, type: 4096, mv: 119.3, energy: 2.5, concerto: 5, offtune: 8e3, forte1: 16 });
var Skill34 = chisaAction("Skill - Eye of Unraveling", { node: 1, cast: 3, type: 12288, mv: 35.79, energy: 0.75, concerto: 1.5, offtune: 2400, forte1: 5, ...MARK_SNARE });
var SERRATED = { updateDebuffs: () => applyEnemy(UNSEEN_SNARE, 1) };
var SerratedLoop = chisaAction("Skill - Serrated Loop", { node: 1, cast: 3, type: 12288, mv: 139.6, energy: 2.96, concerto: 5.92, offtune: 9360, forte1: -100, forte2: 100, ...SERRATED });
var SerratedLoopHalfHold = chisaAction("Skill - Serrated Loop (Half Hold)", { node: 1, cast: 3, type: 12288, mv: 199.28, energy: 4.24, concerto: 8.48, offtune: 13368, forte1: -100, forte2: 100, ...SERRATED });
var SerratedLoopHold = chisaAction("Skill - Serrated Loop (Hold)", { node: 1, cast: 3, type: 12288, mv: 258.96, energy: 5.52, concerto: 11.04, offtune: 17376, forte1: -100, forte2: 100, ...SERRATED });
var Liberation29 = chisaAction("Liberation - Moment of Nihility", {
  node: 3,
  cast: 4,
  cutscene: true,
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
  resetForte2: true,
  updateDebuffs: () => applyCurrent(SHIELD, 1)
});
var WOVEN_MYRIAD_CONVERGENCE = new Buff({
  name: "Chisa: Woven Myriad - Convergence",
  applyStats: () => {
    if ([Blitz1, Blitz2, Blitz2Discordance, Blitz2Hold, Blitz3, Blitz3Falltone, Blitz3Hold, Eradication].includes(currentAction())) {
      addStat(16, 120);
    }
  },
  convertStats: () => {
    if (runningAction(Eradication))
      revokeCurrent(WOVEN_MYRIAD_CONVERGENCE);
  }
});
var RING_CONSUMED = new Buff({
  name: "Chisa: Ring of Chainsaw Consumed",
  maxStacks: 100,
  applyStats: () => {
    if (runningAction(Eradication))
      addStat(16, 2.59 * frozenStacks());
  },
  convertStats: () => {
    if (runningAction(Eradication))
      revokeCurrent(RING_CONSUMED);
  }
});
var ALL_ENDS_HERE = new Buff({
  name: "Inherent: All Ends Here",
  stats: [[
    17,
    20,
    384
    /* Attribute.Havoc */
  ], [24, 20]],
  convertStats: () => {
    if (runningAction(Outro38))
      revokeCurrent(ALL_ENDS_HERE);
  }
});
var UNSEEN_SNARE = new Debuff({
  name: "Chisa: Unseen Snare",
  display: () => `Chisa: Unseen Snare${stacksOfEnemy(SNARE_FINALITY) ? " - Finality" : ""}`,
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
      addStat(22, 18);
    if (stacksOfTeam(WEB_OF_BONDS))
      addStat(17, 50);
  }
});
var DESOLATE_CORRIDORS = new Buff({
  name: "Chisa S1: Wandering Through the Desolate Corridors",
  stats: [[6, 30]],
  convertStats: () => {
    if (runningAction(Outro38))
      revokeCurrent(DESOLATE_CORRIDORS);
  }
});
var SnareStrike = chisaAction("Basic - Unseen Snare (S1)", { type: 4096, scaling: 5, mv: 61803 });
var SNARE_STRUCK = new Buff({});
var CS_S1 = new Sequence({
  name: "Chisa S1: Wandering Through the Desolate Corridors",
  updateBuffs: () => {
    if (!appliedByMe(UNSEEN_SNARE))
      return;
    applyCurrent(DESOLATE_CORRIDORS, 1);
    if (!isHeld(SNARE_STRUCK)) {
      applyCurrent(SNARE_STRUCK, 1);
      queue(SnareStrike);
    }
  }
});
var WEB_OF_BONDS = new Buff({ name: "Chisa S2: Into the Web of Endless Bonds" });
var CS_S2 = new Sequence({
  name: "Chisa S2: Into the Web of Endless Bonds",
  combatStart: () => applyTeam(WEB_OF_BONDS, 1),
  stats: [[
    21,
    10,
    384
    /* Attribute.Havoc */
  ]]
});
var CS_S3 = new Sequence({
  name: "Chisa S3: Across the Confusion of the Long Night",
  applyStats: () => {
    const a = currentAction();
    if ([Blitz1, Blitz2, Blitz2Discordance, Blitz2Hold, Blitz3, Blitz3Falltone, Blitz3Hold, Eradication].includes(a))
      addStat(16, 120);
  }
});
var CS_S4 = new Sequence({ name: "Chisa S4: Severing the Endless Cycle of Tragic Fate" });
var CS_S5 = new Sequence({
  name: "Chisa S5: Thousands of Lights to Guide the Way Home",
  applyStats: () => {
    if (runningAction(Liberation29))
      addStat(17, 100);
  }
});
var SNARE_FINALITY = new Debuff({
  name: "Chisa S6: Unseen Snare - Finality",
  applyStats: () => {
    for (const tag of [
      524288,
      1048576,
      1310720,
      786432,
      1572864
      /* Type2.ElectroFlare */
    ])
      addStat(18, 30, tag);
    if (isHeld(CHISA_RESONATOR))
      addStat(20, 40);
  }
});
var CS_S6 = new Sequence({
  name: "Chisa S6: Thus, Hope is Rekindled with the Rising Dawn",
  updateDebuffs: () => {
    if (stacksOfEnemy(UNSEEN_SNARE) && !stacksOfEnemy(SNARE_FINALITY))
      applyEnemy(SNARE_FINALITY, 1);
  }
});
var CS_SEQUENCES = [CS_S1, CS_S2, CS_S3, CS_S4, CS_S5, CS_S6];
var CS_INHERENT_1 = new Inherent({ name: "Inherent: Inescapable Fate" });
var CS_INHERENT_2 = new Inherent({
  name: "Inherent: All Ends Here",
  updateBuffs: () => {
    if (runningAction(Intro37) || runningAction(Liberation29))
      applyCurrent(ALL_ENDS_HERE, 1);
  }
});
var CHISA_TALENTS = new Talent({
  name: "Chisa: Talents",
  stats: [[6, 12], [9, 8]]
});
var CHISA_RESONATOR = new Resonator({
  name: "Chisa",
  talent: CHISA_TALENTS,
  inherent1: CS_INHERENT_1,
  inherent2: CS_INHERENT_2,
  element: 384,
  weapon: 1,
  intro: () => Intro37,
  outro: () => Outro38,
  color: "#8a3b47",
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 100,
  constantStats: () => {
    addStat(1, 10775);
    addStat(0, 437.5);
    addStat(2, 1136.6646);
  }
});
var CS_ROTATION = new Rotation([
  START_2,
  START_3,
  Skill34,
  SWAP,
  NOINTRO,
  Skill34,
  BA336,
  DeathSnipSpread,
  ThreadWithdrawn,
  Liberation29,
  SerratedLoop,
  Blitz2Hold,
  Blitz3Hold,
  Eradication,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  Skill34,
  BA336,
  DeathSnipSpread,
  Liberation29,
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
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Liberation, Substat.Er, Substat.FlatAtk),
  rotation: CS_ROTATION,
  sequences: CS_SEQUENCES
});

// dist/src/resonators/havoc/danjin.js
function danjinAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var BA138 = danjinAction("Basic - Execution 1", { node: 0, cast: 1, type: 4096, mv: 57.26, energy: 0.9, concerto: 1.08, offtune: 1680 });
var BA239 = danjinAction("Basic - Execution 2", { node: 0, cast: 1, type: 4096, mv: 58.85, energy: 0.92, concerto: 1.11, offtune: 2960 });
var BA337 = danjinAction("Basic - Execution 3", { node: 0, cast: 1, type: 4096, mv: 79.53, energy: 1.25, concerto: 1.5, offtune: 3120 });
var MA44 = danjinAction("Mid-air - Execution", { node: 0, cast: 1, type: 4096, mv: 98.61, energy: 0.51, concerto: 1, offtune: 9600 });
var HA30 = danjinAction("Heavy - Execution", { node: 0, cast: 2, type: 8192, mv: 111.36, energy: 1.74, concerto: 2.1, offtune: 5358 });
var DC31 = danjinAction("Dodge Counter - Ruby Shades", { node: 0, cast: 0, type: 4096, mv: 190.86, energy: 3, concerto: 11.8, offtune: 4800 });
var CarmineGleam = danjinAction("Skill - Carmine Gleam", { node: 1, cast: 3, type: 12288, mv: 76.36, forte1: 10.5, energy: 1.2, offtune: 2960, concerto: 8 });
var CrimsonErosion1 = danjinAction("Skill - Crimson Erosion 1", { node: 1, cast: 3, type: 12288, mv: 128.84, forte1: 10.5, energy: 2.5, offtune: 4240, concerto: 8 });
var CrimsonErosion2 = danjinAction("Skill - Crimson Erosion 2", {
  node: 1,
  cast: 3,
  type: 12288,
  mv: 119.3,
  forte1: 10.5,
  energy: 2.5,
  offtune: 4e3,
  concerto: 8,
  // 59.65% x2
  updateBuffs: () => applyEnemy(INCINERATING_WILL, 1)
});
var SanguinePulse1 = danjinAction("Skill - Sanguine Pulse 1", { node: 1, cast: 3, type: 12288, mv: 112.14, forte1: 13.5, energy: 3, offtune: 3760, concerto: 8 });
var SanguinePulse2 = danjinAction("Skill - Sanguine Pulse 2", { node: 1, cast: 3, type: 12288, mv: 128.85, forte1: 13.5, energy: 3, offtune: 4230, concerto: 8 });
var SanguinePulse3 = danjinAction("Skill - Sanguine Pulse 3", { node: 1, cast: 3, type: 12288, mv: 193.26, forte1: 13.5, energy: 3.75, offtune: 6360, concerto: 8 });
var Chaoscleave = danjinAction("Forte Heavy - Chaoscleave", {
  node: 2,
  cast: 2,
  type: 8192,
  mv: 417.55,
  forte1: -60,
  energy: 14,
  concerto: 50,
  offtune: 11578,
  // 59.65% x7
  updateDebuffs: () => applyCurrent(HEALS, 1)
});
var Scatterbloom = danjinAction("Heavy - Scatterbloom", { node: 2, cast: 2, type: 8192, mv: 178.93, energy: 6, offtune: 5360 });
var FullChaoscleave = danjinAction("Forte Heavy - Chaoscleave (Full Energy)", {
  node: 2,
  cast: 2,
  type: 8192,
  mv: 1002.05,
  forte1: -120,
  energy: 14,
  concerto: 50,
  offtune: 11578,
  // 143.15% x7
  updateDebuffs: () => applyCurrent(HEALS, 1)
});
var FullScatterbloom = danjinAction("Heavy - Scatterbloom (Full Energy)", { node: 2, cast: 2, type: 8192, mv: 429.43, energy: 6, offtune: 5360 });
var Liberation30 = danjinAction("Liberation - Crimson Bloom", { node: 3, cast: 4, cutscene: true, type: 16384, mv: 785.37, concerto: 20, offtune: 61440, resetEnergy: true });
var Intro38 = danjinAction("Intro - Vindication", { node: 4, cast: 5, type: 20480, mv: 198.84, energy: 10, concerto: 10, offtune: 12240 });
var Outro39 = danjinAction("Outro - Duality", {
  cast: 6,
  concerto: -100,
  swapOut: true,
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
      6
      /* Cast.Outro */
    ) && isHeld(DANJIN_RESONATOR))
      revokeEnemy(INCINERATING_WILL);
  }
});
var OVERFLOW = new Buff({
  name: "Inherent: Overflow",
  stats: [[
    17,
    30,
    8192
    /* Type1.Heavy */
  ]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(OVERFLOW);
  }
});
var DJ_INHERENT_OVERFLOW = new Inherent({
  name: "Inherent: Overflow",
  updateBuffs: () => {
    if (runningAction(SanguinePulse3))
      applyCurrent(OVERFLOW, 1);
  }
});
var CRIMSON_LIGHT = new Buff({
  name: "Inherent: Crimson Light",
  applyStats: () => {
    if (runningAction(CrimsonErosion1)) {
      addStat(17, 20);
      addStat(30, CrimsonErosion1.forte1);
    }
  },
  updateBuffs: () => {
    if (!runningAction(CrimsonErosion1))
      revokeCurrent(CRIMSON_LIGHT);
  }
});
var DJ_INHERENT_CRIMSON_LIGHT = new Inherent({
  name: "Inherent: Crimson Light",
  updateBuffs: () => {
    if (runningAction(DC31))
      applyCurrent(CRIMSON_LIGHT, 1);
  }
});
var DANJIN_OUTRO = new Buff({
  name: "Danjin: Outro",
  stats: [[
    18,
    23,
    384
    /* Attribute.Havoc */
  ]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var DANJIN_TALENTS = new Talent({
  name: "Danjin: Talents",
  stats: [[6, 12], [
    17,
    12,
    384
    /* Attribute.Havoc */
  ]]
});
var DANJIN_RESONATOR = new Resonator({
  name: "Danjin",
  talent: DANJIN_TALENTS,
  inherent1: DJ_INHERENT_OVERFLOW,
  inherent2: DJ_INHERENT_CRIMSON_LIGHT,
  element: 384,
  weapon: 0,
  intro: () => Intro38,
  outro: () => Outro39,
  color: "#a83250",
  maxEnergy: 100,
  maxForte1: 120,
  tier: 2,
  constantStats: () => {
    addStat(1, 9438);
    addStat(0, 263);
    addStat(2, 1149);
  }
});
var DJ_S1_STACKS = new Buff({
  name: "Danjin S1: Crimson Heart of Justice",
  maxStacks: 6,
  stats: [[6, 5]],
  perStack: true,
  convertStats: () => {
    if (casting(
      6
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
  stats: [[
    17,
    30,
    16384
    /* Type1.Liberation */
  ]]
});
var DJ_S4_ACTIVE = new Buff({
  name: "Danjin S4: Solitary Carnation",
  stats: [[9, 15]]
});
var DJ_S4 = new Sequence({
  name: "Danjin S4: Solitary Carnation",
  updateBuffs: () => {
    if (forte1() > 60)
      applyCurrent(DJ_S4_ACTIVE, 1);
    else if (!runningAction(Chaoscleave) && !runningAction(FullChaoscleave) && !runningAction(Scatterbloom) && !runningAction(FullScatterbloom))
      revokeCurrent(DJ_S4_ACTIVE);
  }
});
var DJ_S5 = new Sequence({
  name: "Danjin S5: Reigning Blade",
  stats: [[
    17,
    30,
    384
    /* Attribute.Havoc */
  ]]
});
var DJ_S6_TEAM = new Buff({
  name: "Danjin S6: Bloodied Jade",
  stats: [[6, 20]],
  convertStats: () => {
    if (casting(
      5
      /* Cast.Intro */
    ) && isHeld(DANJIN_RESONATOR))
      revokeTeam(DJ_S6_TEAM);
  }
});
var DJ_S6 = new Sequence({
  name: "Danjin S6: Bloodied Jade",
  updateBuffs: () => {
    if (runningAction(Chaoscleave) || runningAction(FullChaoscleave))
      applyTeam(DJ_S6_TEAM, 1);
  }
});
var BA2310 = new ActionGroup("Basic - Execution 23", [BA239, BA337]);
var DJ_ROTATION = new Rotation([
  START_3,
  Liberation30,
  SWAP,
  INTRO,
  CrimsonErosion1,
  CrimsonErosion2,
  Liberation30,
  CarmineGleam,
  BA2310,
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
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Liberation, Substat.Er),
  rotation: DJ_ROTATION,
  sequences: [DJ_S1, DJ_S2, DJ_S3, DJ_S4, DJ_S5, DJ_S6]
});

// dist/src/resonators/havoc/roccia.js
function rocciaAction(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var BA139 = rocciaAction("Basic - Pero, Easy 1", { node: 0, cast: 1, type: 4096, mv: 73.18, energy: 1.09, concerto: 3.47, offtune: 3464, forte1: 19 });
var BA240 = rocciaAction("Basic - Pero, Easy 2", { node: 0, cast: 1, type: 4096, mv: 114.42, energy: 1.71, concerto: 5.43, offtune: 5418, forte1: 33 });
var BA338 = rocciaAction("Basic - Pero, Easy 3", { node: 0, cast: 1, type: 4096, mv: 169, energy: 2.5, concerto: 8, offtune: 8e3, forte1: 49 });
var BA427 = rocciaAction("Basic - Pero, Easy 4", { node: 0, cast: 1, type: 4096, mv: 208.38, energy: 3.1, concerto: 9.88, offtune: 9864, forte1: 100 });
var MA45 = rocciaAction("Mid-air - Pero, Easy", { node: 0, cast: 1, type: 4096, mv: 104.78, energy: 1.55, concerto: 4.96, offtune: 4960, forte1: 38 });
var DC32 = rocciaAction("Dodge Counter - Pero, Easy", { node: 0, cast: 0, type: 4096, mv: 206.7, offtune: 4986, concerto: 15.01, energy: 1.56 });
var HA31 = rocciaAction("Heavy - Pero, Easy", { node: 0, cast: 2, type: 8192, mv: 168.99, energy: 2.5, concerto: 8, offtune: 8e3, forte1: 100 });
var Skill35 = rocciaAction("Skill - Acrobatic Trick", { node: 1, cast: 3, type: 12288, mv: 491.76, energy: 14, concerto: 20, offtune: 10992, forte1: 100 });
var FBA17 = rocciaAction("Forte Basic - Real Fantasy 1", { node: 2, cast: 1, type: 8192, mv: 322.08, energy: 8, concerto: 10, offtune: 7200, forte1: -100 });
var FBA27 = rocciaAction("Forte Basic - Real Fantasy 2", { node: 2, cast: 1, type: 8192, mv: 339.97, energy: 8, concerto: 16, offtune: 7600, forte1: -100 });
var FBA37 = rocciaAction("Forte Basic - Real Fantasy 3", { node: 2, cast: 1, type: 8192, mv: 357.86, energy: 8, concerto: 25, offtune: 8e3, forte1: -100 });
var RealityRecreation = rocciaAction("Basic - Reality Recreation (S6)", { node: 2, cast: 1, type: 8192, mv: 357.86, energy: 1.2, offtune: 8e3 });
var Liberation31 = rocciaAction("Liberation - Commedia Improvviso!", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 8192,
  mv: 835.02,
  concerto: 20,
  offtune: 96e3,
  resetEnergy: true,
  updateBuffs: () => applyTeam(COMMEDIA_TEAM_ATK)
});
var Intro39 = rocciaAction("Intro - Pero, Help", { node: 4, cast: 5, type: 20480, mv: 168.99, energy: 10, concerto: 10, offtune: 10824, forte1: 100 });
var Outro40 = rocciaAction("Outro - Applause, Please!", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(APPLAUSE_HANDOFF)
});
var MAGIC_BOX = rocciaAction("Utility - Super Attractive Magic Box", {
  cast: 7,
  type: 53248,
  scaling: 5,
  mv: 100
});
var IMMERSIVE_PERFORMANCE = new Buff({
  name: "Inherent: Immersive Performance",
  stats: [[6, 20]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(IMMERSIVE_PERFORMANCE);
  }
});
var RC_INHERENT_1 = new Inherent({
  name: "Inherent: Immersive Performance",
  updateBuffs: () => {
    if (casting(
      3
      /* Cast.Skill */
    ) || casting(
      2
      /* Cast.Heavy */
    ))
      applyCurrent(IMMERSIVE_PERFORMANCE, 1);
  }
});
var COMMEDIA_TEAM_ATK = new Buff({
  name: "Roccia: Commedia Improvviso!",
  stats: [[3, 200]]
});
var APPLAUSE_HANDOFF = new Buff({
  name: "Roccia: Outro",
  stats: [[
    18,
    20,
    384
    /* Attribute.Havoc */
  ], [
    18,
    25,
    4096
    /* Type1.Basic */
  ]],
  updateBuffs: () => {
    lostOnSwap();
  }
});
var RC_INHERENT_2 = new Inherent({
  name: "Inherent: Super Attractive Magic Box",
  updateGlobal: () => {
    const acting = currentTeam().slot;
    if (casting(
      5
      /* Cast.Intro */
    ) && acting.isHeld(APPLAUSE_HANDOFF))
      queueOn(acting.resonator, MAGIC_BOX);
  }
});
var ROCCIA_TALENTS = new Talent({
  name: "Roccia: Talents",
  stats: [[6, 12], [10, 16]]
});
var ROCCIA_MATRIX = matrix("Roccia", 20, {
  updateBuffs: () => {
    if (casting(
      4
      /* Cast.Liberation */
    ))
      applyTeam(ROCCIA_MATRIX_TEAM);
  }
});
var ROCCIA_RESONATOR = new Resonator({
  name: "Roccia",
  matrix: ROCCIA_MATRIX,
  talent: ROCCIA_TALENTS,
  inherent1: RC_INHERENT_1,
  inherent2: RC_INHERENT_2,
  element: 384,
  weapon: 3,
  intro: () => Intro39,
  outro: () => Outro40,
  color: "#9634b2",
  maxEnergy: 125,
  maxForte1: 300,
  constantStats: () => {
    addStat(1, 12250);
    addStat(0, 375);
    addStat(2, 1198);
  }
});
function realFantasy() {
  return runningAction(FBA17) || runningAction(FBA27) || runningAction(FBA37);
}
var RC_S1 = new Sequence({
  name: "Roccia S1: When Shadows Engulf the Hull",
  applyStats: () => {
    if (runningAction(Skill35)) {
      addStat(30, 100);
      addStat(27, 10);
    }
  }
});
var LUCEANITE_GLEAMS = new Buff({
  name: "Roccia S2: When the Luceanite Gleams",
  maxStacks: 3,
  applyStats: () => {
    const n = frozenStacks();
    addStat(
      17,
      10 * n + (n >= 3 ? 10 : 0),
      384
      /* Attribute.Havoc */
    );
  }
});
var RC_S2 = new Sequence({
  name: "Roccia S2: When the Luceanite Gleams",
  updateBuffs: () => {
    if (realFantasy())
      applyTeam(LUCEANITE_GLEAMS, 1);
  }
});
var HEART_SEES = new Buff({
  name: "Roccia S3: When the Heart Sees and Hands Feel",
  stats: [[9, 10], [10, 30]],
  until: 0
});
var RC_S3 = new Sequence({
  name: "Roccia S3: When the Heart Sees and Hands Feel",
  updateBuffs: () => {
    if (runningAction(Intro39))
      applyCurrent(HEART_SEES, 1);
  }
});
var WONDERS_GATHER = new Buff({
  name: "Roccia S4: When Wonders Gather in the Box",
  applyStats: () => {
    if (realFantasy() || runningAction(RealityRecreation))
      addStat(16, 60);
  },
  until: 0
});
var RC_S4 = new Sequence({
  name: "Roccia S4: When Wonders Gather in the Box",
  updateBuffs: () => {
    if (runningAction(Skill35))
      applyCurrent(WONDERS_GATHER, 1);
  }
});
var RC_S5 = new Sequence({
  name: "Roccia S5: When Dreams Are Reborn on Stage",
  applyStats: () => {
    if (runningAction(Liberation31))
      addStat(16, 20);
    if (runningAction(HA31))
      addStat(16, 80);
  }
});
var GOLDEN_WINGS = new Buff({
  name: "Roccia S6: When the Golden Wings Fly",
  applyStats: () => {
    if (realFantasy())
      addStat(23, 60);
  },
  until: 0
});
var RC_S6 = new Sequence({
  name: "Roccia S6: When the Golden Wings Fly",
  updateBuffs: () => {
    if (runningAction(Liberation31))
      applyCurrent(GOLDEN_WINGS, 1);
  }
});
var RC_SEQUENCES = [RC_S1, RC_S2, RC_S3, RC_S4, RC_S5, RC_S6];
var BA12310 = new ActionGroup("Basic - Pero, Easy 123", [BA139, BA240, BA338]);
var BA12347 = new ActionGroup("Basic - Pero, Easy 1234", [BA139, BA240, BA338, BA427]);
var FBA1233 = new ActionGroup("Forte Basic - Real Fantasy 123", [FBA17, FBA27, FBA37]);
var RC_ROTATION = new Rotation([
  START_3,
  Liberation31,
  SWAP,
  NOINTRO,
  BA12347,
  Liberation31,
  Skill35,
  DODGE,
  FBA1233,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  BA427,
  Liberation31,
  Skill35,
  DODGE,
  FBA1233,
  ECHO_SWAP,
  OUTRO
]);
var RC_ROTATION_S1 = new Rotation([
  START_3,
  Liberation31,
  SWAP,
  NOINTRO,
  BA12310,
  Skill35,
  DODGE,
  FBA1233,
  Liberation31,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  Skill35,
  DODGE,
  FBA1233,
  Liberation31,
  ECHO_SWAP,
  OUTRO
]);
var RC_ROTATION_MDPS = new Rotation([
  INTRO,
  BA427,
  Liberation31,
  Skill35,
  DODGE,
  FBA1233,
  ECHO_ONFIELD,
  BA12347,
  ECHO_ONFIELD,
  Skill35,
  DODGE,
  FBA1233,
  OUTRO
]);
var RC_ROTATION_S6_MDPS = new Rotation([
  INTRO,
  BA427,
  Liberation31,
  Skill35,
  DODGE,
  FBA1233,
  RealityRecreation,
  RealityRecreation,
  RealityRecreation,
  RealityRecreation,
  RealityRecreation,
  RealityRecreation,
  RealityRecreation,
  RealityRecreation,
  RealityRecreation.swap(),
  OUTRO
]);
var ROCCIA_MATRIX_TEAM = new Buff({
  name: "Roccia: Matrix Buff",
  stats: [[
    17,
    20,
    384
    /* Attribute.Havoc */
  ]]
});
var ROCCIA = new Loadout({
  resonator: ROCCIA_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.Er, Substat.FlatAtk),
  rotation: { 0: RC_ROTATION, 1: RC_ROTATION_S1 },
  sequences: RC_SEQUENCES
});
var ROCCIA_MDPS = new Loadout({
  resonator: ROCCIA_RESONATOR,
  weapons: [TRAGICOMEDY, NEW_STD_GAUNTLET, ABYSS_SURGES],
  echoLoadouts: [
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
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.Er, Substat.FlatAtk),
  rotation: { 0: RC_ROTATION_MDPS, 6: RC_ROTATION_S6_MDPS },
  sequences: RC_SEQUENCES
});

// dist/src/resonators/havoc/rover_havoc.js
function roverAction3(id, def2) {
  return new Action(id, { element: 384, scaling: 0, ...def2 });
}
var BA140 = roverAction3("Basic - Tuneslayer 1", { node: 0, cast: 1, type: 4096, mv: 56.67, energy: 0.6, concerto: 0.74, offtune: 2400, forte1: 3 });
var BA241 = roverAction3("Basic - Tuneslayer 2", { node: 0, cast: 1, type: 4096, mv: 113.34, energy: 1.2, concerto: 1.48, offtune: 4800, forte1: 6 });
var BA339 = roverAction3("Basic - Tuneslayer 3", { node: 0, cast: 1, type: 4096, mv: 85, energy: 0.9, concerto: 1.11, offtune: 2800, forte1: 4 });
var BA428 = roverAction3("Basic - Tuneslayer 4", { node: 0, cast: 1, type: 4096, mv: 120.9, energy: 1.26, concerto: 1.56, offtune: 5121, forte1: 9 });
var BA55 = roverAction3("Basic - Tuneslayer 5", { node: 0, cast: 1, type: 4096, mv: 188.88, energy: 2, concerto: 2.48, offtune: 8e3, forte1: 10 });
var MA46 = roverAction3("Mid-air - Attack", { node: 0, cast: 1, type: 4096, mv: 117.1, energy: 0.41, concerto: 1, offtune: 9600, forte1: 9 });
var DC33 = roverAction3("Dodge Counter - Tuneslayer", { node: 0, cast: 0, type: 4096, mv: 179.43, energy: 1.9, concerto: 10.86, offtune: 4640 });
var HA34 = roverAction3("Heavy - Attack", { node: 0, cast: 2, type: 8192, mv: 95.43, energy: 0.96, concerto: 1.19, offtune: 5360 });
var Devastation = roverAction3("Forte Heavy - Devastation", {
  node: 2,
  cast: 2,
  type: 8192,
  mv: 228.14,
  energy: 1.7,
  offtune: 56320,
  forte1: -100,
  updateBuffs: () => applyCurrent(DARK_SURGE, 1)
});
var EBA15 = roverAction3("Basic - Umbra 1", { node: 2, cast: 1, type: 4096, mv: 56.37, energy: 0.42, concerto: 0.72, offtune: 1440 });
var EBA24 = roverAction3("Basic - Umbra 2", { node: 2, cast: 1, type: 4096, mv: 93.94, energy: 0.7, concerto: 1.2, offtune: 2560 });
var EBA35 = roverAction3("Basic - Umbra 3", { node: 2, cast: 1, type: 4096, mv: 155.67, energy: 1.16, concerto: 1.98, offtune: 4480 });
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
var EHA6 = roverAction3("Heavy - Umbra", { node: 2, cast: 2, type: 8192, mv: 128.83, energy: 0.96, concerto: 1.64, offtune: 6400 });
var EHA22 = roverAction3("Heavy - Umbra: Thwackblade", { node: 2, cast: 2, type: 8192, mv: 166.45, energy: 1.24, concerto: 2.12, offtune: 8704 });
var Skill36 = roverAction3("Skill - Wingblade", { node: 1, cast: 3, type: 12288, mv: 572.58, energy: 12, concerto: 15, offtune: 8640, forte1: 39 });
var ESkill6 = roverAction3("Skill - Umbra: Lifetaker", { node: 2, cast: 3, type: 12288, mv: 592.5, energy: 8, concerto: 15, offtune: 11664, forte1: 39 });
var Liberation32 = roverAction3("Liberation - Deadening Abyss", { node: 3, cast: 4, cutscene: true, type: 16384, mv: 1520.9, concerto: 20, offtune: 53760, resetEnergy: true });
var Intro40 = roverAction3("Intro - Instant of Annihilation", { node: 4, cast: 5, type: 20480, forte1: 29, mv: 198.81, energy: 10, concerto: 10, offtune: 1867 });
var Outro41 = roverAction3("Outro - Soundweaver", { cast: 6, type: 24576, mv: 429.9, concerto: -100, swapOut: true });
var DARK_SURGE = new Buff({
  name: "Havoc Rover: Dark Surge",
  updateBuffs: () => {
    if (casting(
      6
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
    if (isHeld(DARK_SURGE) && casting(
      1
      /* Cast.Basic */
    )) {
      addStat(26, 1);
    }
  }
});
var S4_RES_SHRED = new Debuff({
  name: "Havoc Rover S4: Annihilated Silence",
  applyStats: () => addEnemyStat(
    35,
    10,
    384
    /* Attribute.Havoc */
  ),
  convertStats: () => {
    if (casting(
      5
      /* Cast.Intro */
    ) && isHeld(ROVER_HAVOC_RESONATOR))
      revokeEnemy(S4_RES_SHRED);
  }
});
var ROVER_TALENTS = new Talent({
  name: "Havoc Rover: Talents",
  stats: [[6, 12], [
    17,
    12,
    384
    /* Attribute.Havoc */
  ]]
});
var ROVER_HAVOC_RESONATOR = new Resonator({
  name: "Havoc Rover",
  talent: ROVER_TALENTS,
  inherent1: RH_INHERENT_1,
  inherent2: RH_INHERENT_2,
  element: 384,
  weapon: 0,
  intro: () => Intro40,
  outro: () => Outro41,
  color: "#823ac6",
  maxEnergy: 125,
  maxForte1: 100,
  tier: 2,
  constantStats: () => {
    addStat(1, 10825);
    addStat(0, 413);
    addStat(2, 1259);
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
    if (runningAction(Devastation) || runningAction(Liberation32))
      applyEnemy(S4_RES_SHRED, 1);
  }
});
var ROVER_S5 = new Sequence({
  name: "Havoc Rover S5: Aeon Symphony",
  applyStats: () => {
    if (runningAction(EBA52))
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
var BA123453 = new ActionGroup("Basic - Tuneslayer 12345", [BA140, BA241, BA339, BA428, BA55]);
var EBA12345 = new ActionGroup("Forte Basic - Umbra 12345", [EBA15, EBA24, EBA35, EBA44, EBA52]);
var RH_ROTATION = new Rotation([
  START_3,
  START_2,
  Liberation32,
  ECHO_SWAP,
  SWAP,
  INTRO,
  BA123453,
  Skill36,
  Devastation,
  ESkill6,
  EBA12345,
  EBA12345,
  EBA15,
  Liberation32,
  Skill36,
  ECHO_SWAP,
  OUTRO
]);
var ROVER_HAVOC = new Loadout({
  resonator: ROVER_HAVOC_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Basic, Substat.Er),
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
    if (!isHeld(VOICE_UPON_VOICE))
      return;
    queue(ShadowOfXuanling);
    revokeCurrent(VOICE_UPON_VOICE);
  },
  afterAction: () => {
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
  updateDebuffs: () => applyEnemy(HAVOC_BANE, isHeld(XL_S3) ? 2 : 1)
});
var MA_A = yangyangAction("Mid-air - Azure Sword Stance", { node: 0, cast: 1, type: 4096, mv: 98.61, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: -12 });
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
  updateDebuffs: () => applyEnemy(HAVOC_BANE, isHeld(XL_S3) ? 2 : 1)
});
var MA_F = yangyangAction("Mid-air - Feather Sword Stance", { node: 0, cast: 1, type: 4096, mv: 98.61, energy: 1.55, concerto: 3.1, offtune: 4960, forte1: -12 });
var DC_F = yangyangAction("Dodge Counter - Feather Sword Stance 2", { node: 0, cast: 0, type: 4096, mv: 196.11, energy: 3.09, concerto: 16.18, offtune: 9864, forte1: -24 });
var SwitchAzure = yangyangAction("Skill - Sword Stance Switch: Azure", { node: 1, cast: 3, type: 8192, mv: 116.6, energy: 1.85, concerto: 3.67, offtune: 5865 });
var SwitchFeather = yangyangAction("Skill - Sword Stance Switch: Feather", { node: 1, cast: 3, type: 8192, mv: 100.68, energy: 1.59, concerto: 3.18, offtune: 5064 });
var FlowAzure = yangyangAction("Skill - Sword Stance Flow: Azure", {
  node: 2,
  cast: 3,
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
  cast: 3,
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
  cast: 2,
  type: 8192,
  mv: 450.53,
  energy: 9.34,
  concerto: 15,
  offtune: 10666,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, isHeld(XL_S3) ? 3 : 2),
  updateBuffs: () => applyCurrent(BATED_BREATH, 1),
  // only opens at 2 Azure Plume, and spends it outright: maxForte2 (2 below) clamps an overrun
  // back to the cap before this lands exactly on 0
  forte2: -2
});
var HeavyFeather = yangyangAction("Heavy - Feather Sword Stance", {
  node: 2,
  cast: 2,
  type: 8192,
  mv: 217.05,
  energy: 1.87,
  concerto: 4.67,
  offtune: 7465,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, isHeld(XL_S3) ? 3 : 2),
  updateBuffs: () => applyCurrent(STREAMING_STORM, 1)
});
var FeatherFall = yangyangAction("Forte Mid-air - Feather Fall", {
  node: 2,
  cast: 1,
  type: 8192,
  mv: 110.97,
  energy: 1.26,
  concerto: 3.12,
  offtune: 4962,
  // Feather Sword Stance itself spends none — this auto-cast follow-up is what actually spends
  // the 2 Azure Plume that opened it
  forte2: -2
});
var HiB1 = yangyangAction("Basic - Havoc in Bloom 1", { node: 2, cast: 1, type: 8192, mv: 119.37, energy: 1.35, concerto: 3.36, offtune: 5337 });
var HiB2 = yangyangAction("Basic - Havoc in Bloom 2", { node: 2, cast: 1, type: 8192, mv: 223.13, energy: 2.5, concerto: 6.26, offtune: 9977 });
var HiB3 = yangyangAction("Basic - Havoc in Bloom 3", { node: 2, cast: 1, type: 8192, mv: 399.59, energy: 2.67, concerto: 12.67, offtune: 10665 });
var Lib6 = yangyangAction("Liberation - Hush of a Thousand Voices", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 8192,
  mv: 1988.1,
  concerto: 20,
  offtune: 136400,
  resetForte1: true,
  forte2: 1,
  resetEnergy: true,
  // One Life, One Blade's own first line: the hit raises Havoc Bane to the target's limit, which
  // is the fight's rather than the declared 3 (Chisa's +3 to every Negative Status cap)
  updateDebuffs: () => applyEnemy(HAVOC_BANE, currentTeam().enemyMax(HAVOC_BANE)),
  updateBuffs: () => applyCurrent(VOICE_UPON_VOICE, 1)
});
var ShadowOfXuanling = yangyangAction("Liberation - Shadow of Xuanling", { node: 3, type: 8192, mv: 337.98 });
var ShadowUnfaltering = yangyangAction("Skill - Shadow of Xuanling: Unfaltering (S1)", { node: 2, type: 8192, mv: 337.98 });
var ShadowStrungNotes = yangyangAction("Basic - Shadow of Xuanling: Strung Notes (S2)", { node: 0, type: 8192, mv: 337.98 });
var ShadowWitheredWood = yangyangAction("Skill - Shadow of Xuanling: Still as Withered Wood (S6)", { node: 2, type: 8192, mv: 337.98 });
var Intro41 = yangyangAction("Intro - Skybound Feather", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 116.59,
  energy: 10,
  concerto: 10,
  offtune: 5864,
  forte2: 1,
  updateDebuffs: () => applyEnemy(HAVOC_BANE, 1)
});
var Outro42 = yangyangAction("Outro - As the Wind Wills", {
  cast: 6,
  type: 24576,
  mv: 300,
  concerto: -100,
  swapOut: true,
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
    if (runningAction(HiB3) && !applied2(HAVOC_BANE))
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
      6
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
    if (frozenStacks() === 1 && runningAction(HeavyAzure))
      addStat(10, 160);
  },
  // "when Heavy Attack - Azure Sword Stance ends, Bated Breath is removed" — the window closes on
  // the very cast that opened it, so spending it is a step onto the cooldown stack, not a revoke
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(BATED_BREATH);
    else if (frozenStacks() === 1 && runningAction(HeavyAzure))
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
      6
      /* Cast.Outro */
    ))
      revokeCurrent(STREAMING_STORM);
    else if (frozenStacks() === 1 && runningAction(HiB3))
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
  stats: [[
    18,
    20,
    384
    /* Attribute.Havoc */
  ]]
});
var isFlow = () => runningAction(FlowAzure) || runningAction(FlowFeather);
var XL_S1 = new Sequence({
  name: "Xuanling S1: At the Wind's Breath, the Blossoms Wake",
  updateBuffs: () => {
    if (isFlow())
      queue(ShadowUnfaltering);
  }
});
var STRUNG_NOTES = new Buff({
  name: "Xuanling S2: Strung Notes",
  updateBuffs: () => {
    if (!casting(
      1
      /* Cast.Basic */
    ) || currentAction().node !== 0)
      return;
    revokeCurrent(STRUNG_NOTES);
    queue(ShadowStrungNotes);
  }
});
var XL_S2 = new Sequence({
  name: "Xuanling S2: River Carries Her Song Away",
  combatStart: () => {
    applyCurrent(STRUNG_NOTES, 1);
    setForte2(2);
  },
  applyStats: () => {
    if (OATH_ACTIONS.has(currentAction()))
      addStat(17, 100);
  }
});
var XL_S3 = new Sequence({
  name: "Xuanling S3: My Grief Follows You into the Clouds",
  updateDebuffs: () => {
    if (runningAction(Intro41) || isFlow())
      maxStackIncrease(HAVOC_BANE, 3);
  },
  applyStats: () => {
    if (runningAction(Lib6))
      addStat(18, 175);
  }
});
var A_LETTER_AND_MY_LONGING = new Buff({
  name: "Xuanling S4: Across the Miles, a Letter and My Longing",
  stats: [[6, 20]]
});
var XL_S4 = new Sequence({
  name: "Xuanling S4: Across the Miles, a Letter and My Longing",
  updateBuffs: () => {
    if (runningAction(Intro41) || runningAction(SwitchAzure) || runningAction(SwitchFeather) || isFlow())
      applyTeam(A_LETTER_AND_MY_LONGING, 1);
  }
});
var XL_S5 = new Sequence({ name: "Xuanling S5: Take Wing. Take Wing." });
var VOICE_FLUX = new Buff({
  name: "Xuanling S6: Voice Flux",
  stats: [[
    20,
    40,
    8192
    /* Type1.Heavy */
  ]]
});
var WITHERED_WOOD = new Buff({
  name: "Xuanling S6: Still as Withered Wood",
  maxStacks: 5,
  updateGlobal: () => {
    if (!isActive() || runningAction(ShadowWitheredWood) || !anyNegativeStatusInflicted())
      return;
    removeStack(WITHERED_WOOD, 1);
    queueOn(XUANLING_RESONATOR, ShadowWitheredWood);
  },
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(WITHERED_WOOD);
  }
});
var WITHERED_WOOD_CD = new Buff({
  name: "Xuanling S6: Still as Withered Wood (cooldown)",
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(WITHERED_WOOD_CD);
  }
});
var XL_S6 = new Sequence({
  name: "Xuanling S6: Let the Azure Keep Its Light",
  updateBuffs: () => {
    if (applied2(HAVOC_BANE))
      applyCurrent(VOICE_FLUX, 1);
    if (isFlow() && !isHeld(WITHERED_WOOD_CD)) {
      applyCurrent(WITHERED_WOOD, 5);
      applyCurrent(WITHERED_WOOD_CD, 1);
    }
  },
  applyStats: () => {
    if (runningAction(ShadowWitheredWood))
      addStat(9, 100);
  }
});
var XL_SEQUENCES = [XL_S1, XL_S2, XL_S3, XL_S4, XL_S5, XL_S6];
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
    if (!applied2(HAVOC_BANE) || isHeld(ONE_WITH_THE_WIND))
      return;
    if (applyCurrent(WINDBOUND, 1) < 6)
      return;
    revokeCurrent(WINDBOUND);
    applyCurrent(ONE_WITH_THE_WIND, 1);
  }
});
var XUANLING_TALENTS = new Talent({
  name: "Xuanling: Talents",
  stats: [[6, 12], [9, 8]]
});
var XUANLING_RESONATOR = new Resonator({
  name: "Xuanling",
  talent: XUANLING_TALENTS,
  inherent1: XUANLING_INHERENT_1,
  inherent2: XUANLING_INHERENT_2,
  element: 384,
  weapon: 0,
  intro: () => Intro41,
  outro: () => Outro42,
  color: "#4f29e6",
  maxEnergy: 125,
  maxForte1: 100,
  maxForte2: 2,
  /* Feathered Oath is Forte Circuit machinery, which lives on the Resonator rather than a loadout
   * slot of its own. Same trigger as Windbound above and the same `updateGlobal` reason: it counts
   * Havoc Bane inflicted by anyone on the team, her own casts included. */
  updateGlobal: () => {
    if (applied2(HAVOC_BANE))
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
  ECHO_ONFIELD,
  HeavyAzure,
  Lib6,
  FlowFeather,
  HeavyFeather,
  FeatherFall,
  HiB123,
  OUTRO
]);
var XUANLING_ROTATION_2F = new Rotation([
  INTRO,
  FlowFeather,
  ECHO_ONFIELD,
  HeavyFeather,
  FeatherFall,
  HiB123,
  SwitchAzure,
  Lib6,
  FlowFeather,
  HeavyFeather,
  FeatherFall,
  HiB123,
  OUTRO
]);
var XUANLING_ROTATION_S1 = new Rotation([
  START_3,
  HeavyAzure,
  SwitchFeather,
  SWAP,
  // start in feather stance, so the first cast is a switch to Azure
  INTRO,
  BA_F1234,
  FlowAzure,
  ECHO_ONFIELD,
  HeavyAzure,
  Lib6,
  FlowFeather,
  HeavyFeather,
  FeatherFall,
  HiB123,
  OUTRO
]);
var XUANLING_ROTATION_2F_S1 = new Rotation([
  START_3,
  HeavyAzure,
  SWAP,
  INTRO,
  FlowFeather,
  ECHO_ONFIELD,
  HeavyFeather,
  FeatherFall,
  HiB123,
  SwitchAzure,
  Lib6,
  FlowFeather,
  HeavyFeather,
  FeatherFall,
  HiB123,
  OUTRO
]);
var XUANLING_ECHOES = [
  new EchoLoadout(THOUSAND_PUPPET_PAVILION, FEATHERED_TRACE_5PC)
];
var XUANLING = new Loadout({
  resonator: XUANLING_RESONATOR,
  weapons: [AZURE_OATH, EMERALD_OF_GENESIS, EMERALD_SENTENCE],
  echoLoadouts: XUANLING_ECHOES,
  mainstats: mainstatOptions(
    0,
    1,
    6,
    14,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Er),
  rotation: { 0: XUANLING_ROTATION, 1: XUANLING_ROTATION_S1 },
  sequences: XL_SEQUENCES
});
var XUANLING_2F = new Loadout({
  resonator: XUANLING_RESONATOR,
  weapons: [AZURE_OATH, EMERALD_OF_GENESIS, EMERALD_SENTENCE],
  echoLoadouts: XUANLING_ECHOES,
  mainstats: mainstatOptions(
    0,
    1,
    6,
    14,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Heavy, Substat.FlatAtk, Substat.Er),
  rotation: { 0: XUANLING_ROTATION_2F, 1: XUANLING_ROTATION_2F_S1 },
  sequences: XL_SEQUENCES
});

// dist/src/resonators/spectro/jinhsi.js
function jinhsiAction(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA141 = jinhsiAction("Basic - Slash of Breaking Dawn 1", { node: 0, cast: 1, type: 4096, mv: 66.47, energy: 1.24, concerto: 2.48, offtune: 3960 });
var BA242 = jinhsiAction("Basic - Slash of Breaking Dawn 2", { node: 0, cast: 1, type: 4096, mv: 97.49, energy: 1.84, concerto: 3.65, offtune: 5810 });
var BA340 = jinhsiAction("Basic - Slash of Breaking Dawn 3", { node: 0, cast: 1, type: 4096, mv: 106.49, energy: 2, concerto: 3.99, offtune: 6349 });
var BA429 = jinhsiAction("Basic - Slash of Breaking Dawn 4", { node: 0, cast: 1, type: 4096, mv: 157.72, energy: 2.95, concerto: 5.89, offtune: 9400 });
var HA35 = jinhsiAction("Heavy - Slash of Breaking Dawn", { node: 0, cast: 2, type: 8192, mv: 238.6, energy: 4, concerto: 8, offtune: 12800 });
var MA47 = jinhsiAction("Mid-air - Slash of Breaking Dawn", { node: 0, cast: 1, type: 4096, mv: 123.28, energy: 0.54, concerto: 1, offtune: 4960 });
var DC34 = jinhsiAction("Dodge Counter - Slash of Breaking Dawn", { node: 0, cast: 0, type: 4096, mv: 146.78, energy: 2.78, concerto: 15.49, offtune: 8749 });
var Skill37 = jinhsiAction("Skill - Trailing Lights of Eons", { node: 1, cast: 3, type: 12288, mv: 155.68, energy: 2.21, concerto: 4.38, offtune: 6960 });
var Skill210 = jinhsiAction("Skill - Overflowing Radiance", {
  node: 1,
  cast: 3,
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
var IncBA4 = jinhsiAction("Basic - Incarnation 4", {
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
var IncHeavy = jinhsiAction("Heavy - Incarnation", { node: 2, cast: 2, type: 8192, mv: 159.06, energy: 2, concerto: 2, offtune: 6400 });
var IncDodge = jinhsiAction("Dodge Counter - Incarnation", { node: 2, cast: 0, type: 4096, mv: 219.44, concerto: 13.08, offtune: 9810 });
var Skill38 = jinhsiAction("Skill - Crescent Divinity", { node: 2, cast: 3, type: 12288, mv: 503.8, energy: 3.19, concerto: 8, offtune: 10138 });
var Skill42 = jinhsiAction("Forte Skill - Illuminous Epiphany: Solar Flare", {
  node: 2,
  cast: 3,
  cutscene: true,
  type: 12288,
  mv: 119.34,
  energy: 1.98,
  concerto: 20,
  offtune: 14400,
  updateBuffs: () => {
    revokeCurrent(ORDINATION_GLOW);
    if (!isHeld(JX_UNISON_SPENT)) {
      applyCurrent(UNISON, 1);
      applyCurrent(JX_UNISON_SPENT, 1);
    }
    queue(StellaGlamor);
  }
});
var StellaGlamor = jinhsiAction("Forte Skill - Illuminous Epiphany: Stella Glamor", { node: 2, type: 12288, mv: 347.92, energy: 5.67, offtune: 42002 });
var Liberation33 = jinhsiAction("Liberation - Purge of Light", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 1666.03,
  concerto: 20,
  offtune: 84e3,
  resetEnergy: true,
  // the once-a-rotation cast, so it is what re-arms the Unison grant (see JX_UNISON_SPENT)
  updateBuffs: () => revokeCurrent(JX_UNISON_SPENT)
});
var Intro42 = jinhsiAction("Intro - Loong's Halo", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 159.05,
  energy: 10,
  concerto: 10,
  offtune: 8e3
});
var Outro43 = jinhsiAction("Outro - Temporal Bender", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => {
    if ((stacksOf(ERAS_IN_UNITY) & 3) < 2)
      applyCurrent(ERAS_IN_UNITY, 1);
  }
});
var OutroUnison3 = unisonOutro(Outro43);
var INCARNATION = new Buff({ name: "Jinhsi: Incarnation" });
var ORDINATION_GLOW = new Buff({ name: "Jinhsi: Ordination Glow" });
var JX_UNISON_SPENT = new Buff({ name: "Jinhsi: Illuminous Epiphany (Unison spent)" });
var ERAS_IN_UNITY = new Buff({
  name: "Jinhsi: Eras in Unity",
  maxStacks: 67108863,
  display: () => (frozenStacks() & 3) === 2 ? "Eras in Unity (Outro)" : "Eras in Unity",
  updateGlobal: () => {
    const a = currentAction();
    if (a.scaling === 3)
      return;
    let word = stacksOf(ERAS_IN_UNITY);
    if (oneSecondPassed()) {
      for (let shift = 2; shift < 26; shift += 2) {
        if (word >> shift & 3)
          word -= 1 << shift;
      }
    }
    if (a.element && a.element !== 448 && a.mv > 0) {
      const shift = 2 + 4 * ((a.element >> 6) - 1);
      if (!(word >> shift & 3)) {
        word |= ((word & 3) === 2 ? 1 : 3) << shift;
        applyTeam(INCANDESCENCE, 1);
      }
      if (isType(
        262144
        /* Type2.Coordinated */
      ) && !(word >> shift + 2 & 3)) {
        word |= ((word & 3) === 2 ? 1 : 3) << shift + 2;
        applyTeam(INCANDESCENCE, 2);
      }
    }
    setStacksSelf(ERAS_IN_UNITY, word);
  }
});
var INCANDESCENCE = new Buff({
  name: "Jinhsi: Incandescence",
  maxStacks: 50,
  applyStats: () => {
    if (runningAction(StellaGlamor))
      addStat(15, 44.54 * frozenStacks());
  },
  convertStats: () => {
    if (runningAction(StellaGlamor))
      revokeTeam(INCANDESCENCE);
  }
});
var RADIANT_SURGE = new Inherent({
  name: "Inherent: Radiant Surge",
  stats: [[
    17,
    20,
    320
    /* Attribute.Spectro */
  ]]
});
var CONVERGED_FLASH = new Inherent({
  name: "Inherent: Converged Flash",
  applyStats: () => {
    if (runningAction(Intro42))
      addStat(16, 50);
  }
});
var HERALD_OF_REVIVAL = new Buff({
  name: "Jinhsi S1: Herald of Revival",
  maxStacks: 4,
  applyStats: () => {
    if (runningAction(Skill42) || runningAction(StellaGlamor))
      addStat(17, 20 * frozenStacks());
  },
  convertStats: () => {
    if (runningAction(StellaGlamor))
      revokeCurrent(HERALD_OF_REVIVAL);
  }
});
var JX_S1 = new Sequence({
  name: "Jinhsi S1: Abyssal Ascension",
  updateBuffs: () => {
    if (runningAction(IncBA1) || runningAction(IncBA2) || runningAction(IncBA3) || runningAction(IncBA4) || runningAction(Skill38)) {
      applyCurrent(HERALD_OF_REVIVAL, 1);
    }
  }
});
var JX_S2 = new Sequence({
  name: "Jinhsi S2: Chronofrost Repose",
  combatStart: () => {
    applyTeam(INCANDESCENCE, 50);
  }
});
var IMMORTALS_DESCENDANCY = new Buff({
  name: "Jinhsi S3: Immortal's Descendancy",
  maxStacks: 2,
  stats: [[6, 25]],
  perStack: true
});
var JX_S3 = new Sequence({
  name: "Jinhsi S3: Celestial Incarnate",
  updateBuffs: () => {
    if (runningAction(Intro42))
      applyCurrent(IMMORTALS_DESCENDANCY, 1);
  }
});
var JX_S4_TEAM = new Buff({
  name: "Jinhsi S4: Benevolent Grace",
  stats: [[17, 20]]
});
var JX_S4 = new Sequence({
  name: "Jinhsi S4: Benevolent Grace",
  // Solar Flare is the press; Stella Glamor is the detonation behind it, not a second cast
  updateBuffs: () => {
    if (runningAction(Liberation33) || runningAction(Skill42))
      applyTeam(JX_S4_TEAM, 1);
  }
});
var JX_S5 = new Sequence({
  name: "Jinhsi S5: Frostfire Illumination",
  applyStats: () => {
    if (runningAction(Liberation33))
      addStat(16, 120);
  }
});
var JX_S6 = new Sequence({
  name: "Jinhsi S6: Thawing Triumph",
  applyStats: () => {
    if (runningAction(Skill42) || runningAction(StellaGlamor))
      addStat(16, 45);
  }
});
var JINHSI_TALENTS = new Talent({
  name: "Jinhsi: Talents",
  stats: [[6, 12], [9, 8]]
});
var JINHSI_RESONATOR = new Resonator({
  name: "Jinhsi",
  matrix: matrix("Jinhsi", 25),
  talent: JINHSI_TALENTS,
  inherent1: RADIANT_SURGE,
  inherent2: CONVERGED_FLASH,
  element: 320,
  weapon: 1,
  intro: () => Intro42,
  outro: () => isHeld(UNISON) ? OutroUnison3 : Outro43,
  color: "#c2ecfb",
  maxEnergy: 150,
  // Eras in Unity is hers the moment she is on the team, well before her first turn
  combatStart: () => applyCurrent(ERAS_IN_UNITY, 1),
  constantStats: () => {
    addStat(1, 10825);
    addStat(0, 412.5);
    addStat(2, 1258.9);
  }
});
var BA12348 = new ActionGroup("Basic - Slash of Breaking Dawn 1234", [BA141, BA242, BA340, BA429]);
var IncBA12 = new ActionGroup("Basic - Incarnation 12", [IncBA1, IncBA2]);
var IncBA34 = new ActionGroup("Basic - Incarnation 34", [IncBA3, IncBA4]);
var JX_ROTATION2 = new Rotation([
  START_3,
  Liberation33,
  SWAP,
  NOINTRO,
  BA12348,
  Skill210.dodgeCancel(),
  ECHO_ONFIELD,
  IncBA1,
  IncBA2.jumpCancel(),
  IncBA3.jumpCancel(),
  IncBA4,
  Skill42,
  OUTRO,
  DOUBLE_INTRO,
  Skill210.dodgeCancel(),
  IncBA12,
  Skill38,
  IncBA34,
  ECHO_ONFIELD,
  Skill42,
  OUTRO,
  INTRO,
  Skill210.dodgeCancel(),
  IncBA12,
  Skill38,
  IncBA34,
  Skill42,
  Liberation33,
  OUTRO
]);
var JX_ROTATION_SUPPORT = new Rotation([
  START_3,
  Liberation33,
  SWAP,
  NOINTRO,
  BA12348,
  Skill210.dodgeCancel(),
  ECHO_ONFIELD,
  IncBA1,
  IncBA2.jumpCancel(),
  IncBA3.jumpCancel(),
  IncBA4,
  Skill42,
  Liberation33,
  OUTRO,
  INTRO,
  Skill210.dodgeCancel(),
  ECHO_ONFIELD,
  IncBA12,
  Skill38,
  IncBA34,
  Skill42,
  Liberation33,
  OUTRO
]);
var JX_ECHOES = [
  new EchoLoadout(JUE, CELESTIAL_LIGHT_5PC),
  new EchoLoadout(STAY_TUNED, SWORN_VIGIL_5PC)
];
var JINHSI = new Loadout({
  resonator: JINHSI_RESONATOR,
  weapons: [AGES_OF_HARVEST, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: JX_ECHOES,
  sequences: [JX_S1, JX_S2, JX_S3, JX_S4, JX_S5, JX_S6],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    13,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Er),
  rotation: JX_ROTATION2
});
var JINHSI_SUPPORT = new Loadout({
  resonator: JINHSI_RESONATOR,
  weapons: [AGES_OF_HARVEST, NEW_STD_BRAUDBLADE, LUSTROUS_RAZOR],
  echoLoadouts: JX_ECHOES,
  sequences: [JX_S1, JX_S2, JX_S3, JX_S4, JX_S5, JX_S6],
  mainstats: mainstatOptions(
    0,
    1,
    6,
    13,
    15
    /* Mainstat.ATK1 */
  ),
  substat: substats(Substat.AtkPct, Substat.Skill, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Skill, Substat.FlatAtk, Substat.Er),
  rotation: JX_ROTATION_SUPPORT
});

// dist/src/resonators/spectro/luuk.js
function luukAction(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA142 = luukAction("Basic - Such is Light 1", { node: 0, cast: 1, type: 4096, mv: 81.12, energy: 1.2, concerto: 2.4, offtune: 3840, forte1: 12 });
var BA243 = luukAction("Basic - Such is Light 2", { node: 0, cast: 1, type: 4096, mv: 150.4, energy: 2.23, concerto: 4.45, offtune: 7120, forte1: 22.25 });
var BA341 = luukAction("Basic - Such is Light 3", { node: 0, cast: 1, type: 4096, mv: 150.6, energy: 2.4, concerto: 4.5, offtune: 7110, forte1: 22.5 });
var BA430 = luukAction("Basic - Such is Light 4", { node: 0, cast: 1, type: 4096, mv: 96.33, energy: 1.43, concerto: 2.85, offtune: 4560, forte1: 14.25 });
var HA36 = luukAction("Heavy - Such is Light", { node: 0, cast: 2, type: 8192, mv: 91.26, energy: 1.35, concerto: 2.7, offtune: 4320, forte1: 13.5 });
var DC35 = luukAction("Dodge Counter - Such is Light", { node: 0, cast: 0, type: 4096, mv: 251.8, energy: 2.24, concerto: 17.46, offtune: 7120, forte1: 11.13 });
var MA113 = luukAction("Mid-air - Such is Light 1", { node: 0, cast: 1, type: 4096, mv: 57.46, energy: 0.85, concerto: 1.7, offtune: 2720, forte1: 8.5 });
var MA212 = luukAction("Mid-air - Scythe: Dissection 2", { node: 0, cast: 1, type: 4096, mv: 94.09, energy: 1.4, concerto: 2.5, offtune: 4e3, forte1: 12.5 });
var MA310 = luukAction("Mid-air - Scythe: Dissection 3", { node: 0, cast: 1, type: 4096, mv: 143.1, energy: 2.73, concerto: 3.96, offtune: 6320, forte1: 19.76 });
var STRAIN = { updateDebuffs: () => applyStrain() };
var MA2R = luukAction("Mid-air - Scythe: Resection 2", { node: 0, cast: 1, type: 4096, mv: 100.84, energy: 1.5, concerto: 2.7, offtune: 4320, forte1: 13.5, ...STRAIN });
var MA3R = luukAction("Mid-air - Scythe: Resection 3", { node: 0, cast: 1, type: 4096, mv: 149.84, energy: 2.82, concerto: 4.16, offtune: 6640, forte1: 20.76, ...STRAIN });
var MA48 = luukAction("Mid-air - Such is Light 4", { node: 0, cast: 1, type: 4096, mv: 104.78, energy: 1.55, concerto: 1, offtune: 4960, forte1: 15.5 });
var MDC5 = luukAction("Dodge Counter - Such is Light (Mid-Air)", { node: 0, cast: 0, type: 4096, mv: 256.87, energy: 2.3, concerto: 17.6, offtune: 7360, forte1: 23 });
var Skill39 = luukAction("Skill - Golden Reflux", { node: 1, cast: 3, type: 12288, mv: 201.2, energy: 2.3, concerto: 4.6, offtune: 7360, forte1: 23, ...STRAIN });
var Ring = luukAction("Skill - Aureole of Execution: Ring", { node: 1, cast: 3, type: 4096, mv: 221.33, energy: 8, concerto: 10, offtune: 10400, forte1: 32.5, ...STRAIN });
var Breach = luukAction("Skill - Aureole of Execution: Breach", { node: 1, cast: 3, type: 4096, mv: 287.73, energy: 8.01, concerto: 10.02, offtune: 10320, forte1: 32.25, ...STRAIN });
var Glare = luukAction("Skill - Aureole of Execution: Glare", { node: 1, cast: 3, type: 4096, mv: 354.11, energy: 6, concerto: 10, offtune: 7840, forte1: 24.5, ...STRAIN });
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
var Liberation34 = luukAction("Liberation - Rewritten in Winter's Margins", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 4096,
  mv: 994.09,
  concerto: 20,
  offtune: 67200,
  resetEnergy: true
});
var Intro43 = luukAction("Intro - Before Injection of Dawn", {
  node: 4,
  cast: 5,
  type: 20480,
  mv: 218.01,
  energy: 10.02,
  concerto: 10,
  offtune: 10320,
  forte1: 100,
  ...STRAIN
  // updateBuffs: () => applyCurrent(DAWNLIT_KEEP, 1),  // DAWNLIT_KEEP grants no stat and nothing reads it
});
var Outro44 = luukAction("Outro - Bow to the Last Light", {
  cast: 6,
  type: 24576,
  mv: 500,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => applyCurrent(GOLDEN_RULE)
});
var isAureole = () => runningAction(Ring) || runningAction(Breach) || runningAction(Glare);
var AUREATE_JUDGE = new Buff({
  name: "Luuk: Aureate Judge",
  updateBuffs: () => {
    const a = currentAction();
    if (forte1() <= 0 && !runningAction(Gavel) && !runningAction(IchorDeposit) && !runningAction(TUNE_BREAK))
      revokeCurrent(AUREATE_JUDGE);
  },
  applyStats: () => {
    const a = currentAction();
    if (a.forte1 > 0)
      addStat(30, -a.forte1);
    if (isAureole() || runningAction(Gavel)) {
      addStat(16, 110);
      addStat(28, 25200);
    }
    if (isAureole()) {
      addStat(30, -100);
    }
    if (runningAction(IchorDeposit))
      addStat(16, 110);
  }
});
var ENDNOTES = new Buff({
  name: "Luuk: Endnotes on the Endgame",
  maxStacks: 3,
  applyStats: () => {
    if (runningAction(Liberation34))
      addStat(16, 25 * frozenStacks());
  },
  convertStats: () => {
    lostOnSwap();
    if (runningAction(Liberation34))
      revokeCurrent(ENDNOTES);
  }
});
var GOLDEN_RULE = new Buff({
  name: "Luuk: Golden Rule",
  applyStats: () => {
    if (casting(
      5
      /* Cast.Intro */
    )) {
      addStat(30, 200);
      addStat(27, 12);
    }
  },
  convertStats: () => {
    if (casting(
      5
      /* Cast.Intro */
    ))
      revokeCurrent(GOLDEN_RULE);
  }
});
var UNCAUSED_DIAGNOSIS_ATK = new Buff({
  name: "Inherent: Uncaused Diagnosis",
  stats: [[6, 25]]
});
var DAWNLIT_KEEP = new Buff({ name: "Luuk: Dawnlit Keep", maxStacks: 1 });
var LK_INHERENT_1 = new Inherent({ name: "Inherent: Pulses Under the Snow" });
var LK_INHERENT_2 = new Inherent({
  name: "Inherent: Uncaused Diagnosis",
  updateGlobal: () => {
    if (applied2(TUNE_STRAIN_SHIFTING) || runningAction(TUNE_BREAK))
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
  stats: [[6, 12], [9, 8]]
});
var LUUK_RESONATOR = new Resonator({
  name: "Luuk Herssen",
  talent: LUUK_TALENTS,
  inherent1: LK_INHERENT_1,
  inherent2: LK_INHERENT_2,
  element: 320,
  weapon: 3,
  intro: () => Intro43,
  outro: () => Outro44,
  color: "#ddb246",
  maxEnergy: 125,
  maxForte1: 300,
  // his kit raises the target's Tune Strain - Interfered limit by 1 on top of the base 1; Golden
  // Rule is armed from the start so his first Intro is brought in the same way every later one is
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1);
    applyCurrent(TUNE_STRAIN_RESPONDER, 1);
    applyCurrent(GOLDEN_RULE, 1);
  },
  updateBuffs: () => {
    if (forte1() >= 300)
      applyCurrent(AUREATE_JUDGE, 1);
    if (isAureole())
      applyCurrent(ENDNOTES, 1);
  },
  constantStats: () => {
    addStat(1, 10300);
    addStat(0, 462.5);
    addStat(2, 1112.2);
    addStat(12, 10);
  }
});
var midAir2 = () => runningAction(MA113) || runningAction(MA212) || runningAction(MA310) || runningAction(MA2R) || runningAction(MA3R) || runningAction(MA48) || runningAction(Gavel);
var LK_S1 = new Sequence({
  name: "Luuk S1: Gold Kindled in Ash",
  applyStats: () => {
    if (midAir2())
      addStat(17, 150);
  }
});
var LK_S2 = new Sequence({
  name: "Luuk S2: Avalanche Roaring in Eyes",
  applyStats: () => {
    if (runningAction(Liberation34))
      addStat(16, 60);
  },
  lateConvertStats: () => {
    if (stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0)
      addStat(18, Math.min(30, 5 * Math.floor(getStat(
        12
        /* Stat.Tbb */
      ) / 10)));
  }
});
var LK_S3 = new Sequence({
  name: "Luuk S3: Spine Tempered by Golden Rain",
  applyStats: () => {
    if (!isHeld(AUREATE_JUDGE))
      return;
    if (isAureole() || runningAction(Gavel) || runningAction(IchorDeposit))
      addStat(16, 136);
  }
});
var PULSE_UNDER_RIME = new Buff({ name: "Luuk S4: Pulse Thrumming Under Rime", stats: [[17, 20]] });
var LK_S4 = new Sequence({
  name: "Luuk S4: Pulse Thrumming Under Rime",
  updateGlobal: () => {
    if (runningAction(TUNE_BREAK))
      applyTeam(PULSE_UNDER_RIME, 1);
  }
});
var LK_S5 = new Sequence({
  name: "Luuk S5: Through the Stillness of Snowstorm",
  applyStats: () => {
    if (runningAction(Intro43) || runningAction(Outro44))
      addStat(17, 80);
    if (runningAction(Skill39))
      addStat(16, 50);
  }
});
var DAWN_UNFURLING = new Buff({
  name: "Luuk S6: Dawn Unfurling over Frostlands",
  applyStats: () => {
    if (isAureole() || runningAction(IchorDeposit) || runningAction(Gavel))
      addStat(20, 30);
  }
});
var LK_S6 = new Sequence({
  name: "Luuk S6: Dawn Unfurling over Frostlands",
  combatStart: () => maxStackIncrease(TUNE_STRAIN_INTERFERED, 2),
  updateGlobal: () => {
    if (runningAction(TUNE_BREAK))
      applyCurrent(DAWN_UNFURLING, 1);
  },
  updateDebuffs: () => {
    if (currentAction().mv > 0 && stacksOfEnemy(TUNE_STRAIN_INTERFERED) > 0)
      applyEnemy(TUNE_STRAIN_INTERFERED, 2);
  },
  applyStats: () => {
    if (runningAction(Liberation34))
      addStat(17, Math.min(120, 40 * stacksOf(ENDNOTES)));
  }
});
var LK_SEQUENCES = [LK_S1, LK_S2, LK_S3, LK_S4, LK_S5, LK_S6];
var MA1233 = new ActionGroup("Mid-air - Scythe: Dissection 123", [MA113, MA212, MA310]);
var MA232 = new ActionGroup("Mid-air - Scythe: Dissection 23", [MA212, MA310]);
var LK_ROTATION = new Rotation([
  START_3,
  Skill39,
  Liberation34,
  SWAP,
  INTRO,
  MA232,
  Ring,
  GoldenImpale,
  // TODO add dodge/jumps
  MA1233,
  Breach,
  GoldenImpale,
  MA1233,
  Glare,
  Gavel,
  Liberation34,
  ECHO_SWAP,
  OUTRO
]);
var LK_ECHOES = [
  new EchoLoadout(NEBULOUS_CANNON, GILDED_REVELATION_5PC)
];
var LUUK = new Loadout({
  resonator: LUUK_RESONATOR,
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.Basic, Substat.FlatAtk, Substat.Er),
  rotation: LK_ROTATION,
  sequences: LK_SEQUENCES
});

// dist/src/resonators/spectro/lynae.js
function lynaeAction(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA143 = lynaeAction("Basic - Chroma Drift 1", { node: 0, cast: 1, type: 4096, mv: 86.19, energy: 1.28, concerto: 4.59, offtune: 4080, forte1: 12 });
var BA244 = lynaeAction("Basic - Chroma Drift 2", { node: 0, cast: 1, type: 4096, mv: 157.17, energy: 2.34, concerto: 8.37, offtune: 7440, forte1: 21 });
var BA346 = lynaeAction("Basic - Chroma Drift 3", { node: 0, cast: 1, type: 4096, mv: 123.37, energy: 1.83, concerto: 6.57, offtune: 5840, forte1: 17 });
var DC36 = lynaeAction("Dodge Counter - Chroma Drift", { node: 0, cast: 0, type: 4096, mv: 239.97, energy: 2.05, concerto: 17.38, offtune: 6560, forte1: 19 });
var MA49 = lynaeAction("Mid-air - Chroma Drift", { node: 0, cast: 1, type: 4096, mv: 143.65, energy: 2.14, concerto: 7.66, offtune: 6800, forte1: 20 });
var SparkCollision = lynaeAction("Basic - Spark Collision Lv. 3", { node: 0, cast: 1, type: 4096, mv: 555.56, energy: 8.22, concerto: 29.6, offtune: 26300, forte1: -120, forte2: 120 });
var KBA1 = lynaeAction("Basic - Kaleidoscopic Parade 1", { node: 0, cast: 1, type: 4096, mv: 82.81, energy: 1.23, concerto: 4.41, offtune: 3920 });
var KBA2 = lynaeAction("Basic - Kaleidoscopic Parade 2", { node: 0, cast: 1, type: 4096, mv: 77.74, energy: 1.16, concerto: 4.14, offtune: 3680 });
var KBA3 = lynaeAction("Basic - Kaleidoscopic Parade 3", { node: 0, cast: 1, type: 4096, mv: 113.25, energy: 1.68, concerto: 6.03, offtune: 5361 });
var KBA4 = lynaeAction("Basic - Kaleidoscopic Parade 4", { node: 0, cast: 1, type: 4096, mv: 148.74, energy: 2.2, concerto: 7.94, offtune: 7040 });
var KBA5 = lynaeAction("Basic - Kaleidoscopic Parade 5", { node: 0, cast: 1, type: 4096, mv: 251.81, energy: 3.76, concerto: 13.45, offtune: 11924 });
var KHeavy = lynaeAction("Heavy - Kaleidoscopic Parade (Ground)", { node: 0, cast: 2, type: 4096, mv: 123.41, energy: 2.94, concerto: 6.58, offtune: 5845 });
var GraffitiBlast = lynaeAction("Heavy - Kaleidoscopic Parade: Graffiti Blast", { node: 0, cast: 2, type: 4096, mv: 104.78, energy: 1.55, concerto: 5.58, offtune: 4960 });
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
var Skill40 = lynaeAction("Skill - Lynae-Style Palettes", { node: 1, cast: 3, type: 12288, mv: 278.63, energy: 8.75, concerto: 9.83, offtune: 8722, forte1: 25 });
var AdditiveColor = lynaeAction("Skill - Additive Color", { node: 1, cast: 3, type: 12288, mv: 232.62, energy: 6.92, concerto: 8.2, offtune: 7280 });
var Liberation35 = lynaeAction("Liberation - Prismatic Overblast", {
  node: 3,
  cast: 4,
  cutscene: true,
  type: 16384,
  mv: 874.8,
  concerto: 20,
  offtune: 48e3,
  resetEnergy: true,
  updateBuffs: () => applyTeam(PRISMATIC_OVERBLAST, 1)
});
var VividTomorrow = lynaeAction("Basic - To a Vivid Tomorrow!", { node: 0, cast: 1, type: 4096, mv: 201.06, energy: 5.46, concerto: 19.42, offtune: 17128 });
var Intro44 = lynaeAction("Intro - Time to Show Some Colors!", { node: 4, cast: 5, type: 20480, mv: 224.8, energy: 13.4, concerto: 22, offtune: 10640, forte1: 100 });
var Outro45 = lynaeAction("Outro - Let's Hit the Road!", {
  cast: 6,
  type: 24576,
  mv: 100,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => queueOutro(LYNAE_OUTRO)
});
var SpectralAnalysis = lynaeAction("Tune Rupture Response - Spectral Analysis", {
  node: 2,
  type: 40960,
  mv: 1880.75,
  scaling: 4
  /* Scaling.Tune */
});
var inflictsFlux = () => runningAction(PolychromeLeap1) || runningAction(PolychromeLeap2) || runningAction(PolychromeLeap3) || runningAction(IridescentSplash) || runningAction(VisualImpact) || runningAction(Intro44);
var MODE_RUPTURE2 = new ResonanceMode({
  name: "Resonance Mode - Tune Rupture",
  updateDebuffs: () => {
    if (inflictsFlux())
      applyRupture();
  },
  updateGlobal: () => tuneRuptureResponse(SpectralAnalysis)
});
var MODE_STRAIN2 = new ResonanceMode({
  name: "Resonance Mode - Tune Strain",
  // her kit raises the target's Tune Strain - Interfered limit by 1 on top of the base 1
  updateDebuffs: () => {
    if (inflictsFlux())
      applyStrain();
  },
  combatStart: () => {
    maxStackIncrease(TUNE_STRAIN_INTERFERED, 1);
    applyCurrent(TUNE_STRAIN_RESPONDER, 1);
  }
});
var PRISMATIC_OVERBLAST = new Buff({
  name: "Lynae: Prismatic Overblast",
  stats: [[17, 24]]
});
var ADAPTIVE_OPTICS = new Buff({
  name: "Inherent: Adaptive Optics",
  stats: [[
    17,
    25,
    320
    /* Attribute.Spectro */
  ]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(ADAPTIVE_OPTICS);
  }
});
var LYNAE_OUTRO = new Buff({
  name: "Lynae: Let's Hit the Road!",
  stats: [[18, 15], [
    18,
    25,
    16384
    /* Type1.Liberation */
  ]],
  // S2 hands the same resonator 25% more, read off her own slot: this buff is the recipient's
  applyStats: () => {
    if (currentTeam().slots.find((m) => m.resonator === LYNAE_RESONATOR)?.isHeld(LY_S2)) {
      asSource(LY_S2, () => addStat(18, 25));
    }
  },
  convertStats: () => {
    lostOnSwap();
  }
});
var SPECTRAL_ANALYSIS_TBB = new Buff({
  name: "Lynae: Visual Impact",
  stats: [[12, 40]]
});
var LY_INHERENT_1 = new Inherent({ name: "Inherent: Colors Never Fade!" });
var LY_INHERENT_2 = new Inherent({
  name: 'Inherent: "Adaptive Optics: Everyday Applications"',
  updateBuffs: () => {
    if (runningAction(Intro44))
      applyCurrent(ADAPTIVE_OPTICS, 1);
  }
});
var LYNAE_TALENTS = new Talent({
  name: "Lynae: Talents",
  stats: [[6, 12], [9, 8]]
});
var LYNAE_RESONATOR = new Resonator({
  name: "Lynae",
  talent: LYNAE_TALENTS,
  inherent1: LY_INHERENT_1,
  inherent2: LY_INHERENT_2,
  element: 320,
  weapon: 2,
  intro: () => Intro44,
  outro: () => Outro45,
  color: "#eae477",
  maxEnergy: 125,
  maxForte1: 120,
  maxForte2: 120,
  maxForte3: 3,
  constantStats: () => {
    addStat(1, 12237.5);
    addStat(0, 375);
    addStat(2, 1197.8);
    addStat(12, 10);
  }
});
var LY_S1 = new Sequence({
  name: "Lynae S1: Days to be Painted Like a Canvas",
  applyStats: () => {
    if (runningAction(PolychromeLeap1) || runningAction(PolychromeLeap2) || runningAction(PolychromeLeap3))
      addStat(16, 120);
  }
});
var LY_S2 = new Sequence({
  name: "Lynae S2: Into Lights' Vanishing Point",
  stats: [[18, 25]]
});
var LY_S3 = new Sequence({
  name: "Lynae S3: For One Brilliant Moment",
  applyStats: () => {
    if (runningAction(VisualImpact) || runningAction(IridescentSplash))
      addStat(16, 90);
  }
});
var LY_S4 = new Sequence({ name: "Lynae S4: Shadows of a Wind Racer", stats: [[6, 20]] });
var LY_S5 = new Sequence({
  name: "Lynae S5: Visions of a Future Unbound",
  applyStats: () => {
    if (runningAction(Liberation35))
      addStat(16, 70);
  }
});
var COLOR_OF_SOUL = new Buff({
  name: "Lynae S6: Color of Soul",
  maxStacks: 3,
  applyStats: () => {
    if (runningAction(IridescentSplash) || runningAction(VisualImpact))
      addStat(20, 30 * frozenStacks());
  },
  convertStats: () => {
    if (runningAction(IridescentSplash) || runningAction(VisualImpact))
      revokeCurrent(COLOR_OF_SOUL);
  }
});
var LY_S6 = new Sequence({
  name: "Lynae S6: Painted in My True Color",
  updateBuffs: () => {
    if (runningAction(GraffitiBlast) || runningAction(KHeavy))
      applyCurrent(COLOR_OF_SOUL, 1);
  }
});
var LY_SEQUENCES = [LY_S1, LY_S2, LY_S3, LY_S4, LY_S5, LY_S6];
var PolychromeLeap123 = new ActionGroup("Forte - Polychrome Leap 123", [PolychromeLeap1, PolychromeLeap2, PolychromeLeap3]);
var LY_ROTATION = new Rotation([
  INTRO,
  Liberation35,
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
  substat: substats(Substat.AtkPct, Substat.Basic, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Basic, Substat.Er),
  rotation: { 0: LY_ROTATION },
  sequences: LY_SEQUENCES,
  mode
});
var LYNAE_RUPTURE = build2(MODE_RUPTURE2);
var LYNAE_STRAIN = build2(MODE_STRAIN2);

// dist/src/resonators/spectro/rover_spectro.js
function roverAction4(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA144 = roverAction4("Basic - Vibration Manifestation 1", { node: 0, cast: 1, type: 4096, mv: 59.15, energy: 0.5, concerto: 2, offtune: 2800, forte1: 3 });
var BA245 = roverAction4("Basic - Vibration Manifestation 2", { node: 0, cast: 1, type: 4096, mv: 76.05, energy: 1, concerto: 4, offtune: 3600, forte1: 5 });
var BA347 = roverAction4("Basic - Vibration Manifestation 3", { node: 0, cast: 1, type: 4096, mv: 76.05, energy: 1.5, concerto: 4, offtune: 3600, forte1: 5 });
var BA431 = roverAction4("Basic - Vibration Manifestation 4", { node: 0, cast: 1, type: 4096, mv: 130.13, energy: 2, concerto: 6, offtune: 6160, forte1: 7 });
var MA50 = roverAction4("Mid-air - Attack", { node: 0, cast: 1, type: 4096, mv: 104.78, energy: 0.51, concerto: 1, offtune: 4960 });
var DC37 = roverAction4("Dodge Counter - Vibration Manifestation", { node: 0, cast: 0, type: 4096, mv: 195.34, energy: 2.62, concerto: 13.6, offtune: 3600 });
var HA110 = roverAction4("Heavy - Attack", { node: 0, cast: 2, type: 8192, mv: 96.35, energy: 1.4, concerto: 4.55, offtune: 22800, forte1: 5 });
var HA210 = roverAction4("Heavy - Resonance", { node: 0, cast: 2, type: 8192, mv: 76.05, energy: 1.12, concerto: 3.6, offtune: 3600 });
var HA37 = roverAction4("Heavy - Aftertune", { node: 0, cast: 2, type: 8192, mv: 126.75, energy: 1.87, concerto: 6, offtune: 6e3, forte1: 45 });
var Skill41 = roverAction4("Skill - Resonating Slashes", { node: 1, cast: 3, type: 12288, mv: 236.19, energy: 10, concerto: 10, offtune: 4800 });
var FSkill13 = roverAction4("Forte Skill - Resonating Spin", {
  node: 2,
  cast: 3,
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
var FBA7 = roverAction4("Basic - Resonating Echoes", { node: 2, cast: 1, type: 12288, mv: 238.58, energy: 2.5, concerto: 8, offtune: 7200 });
var Liberation36 = roverAction4("Liberation - Echoing Orchestra", {
  node: 3,
  cast: 4,
  cutscene: true,
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
var Intro45 = roverAction4("Intro - Waveshock", { node: 4, cast: 5, type: 20480, mv: 168.99, energy: 10, concerto: 10, offtune: 4880, forte1: 50 });
var Outro46 = roverAction4("Outro - Instant", { cast: 6, concerto: -100, swapOut: true });
var SPR_INHERENT_1 = new Inherent({
  name: "Inherent: Reticence",
  applyStats: () => {
    if (runningAction(FBA7))
      addStat(17, 60);
  }
  // TODO unsure if dmg bonus
});
var SILENT_LISTENER = new Buff({
  name: "Inherent: Silent Listener",
  stats: [[6, 15]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(SILENT_LISTENER);
  }
});
var SPR_INHERENT_2 = new Inherent({
  name: "Inherent: Silent Listener",
  updateBuffs: () => {
    if (runningAction(HA210))
      applyCurrent(SILENT_LISTENER, 1);
  }
});
var S1_CRIT2 = new Buff({
  name: "Spectro Rover S1: Odyssey of Beginnings",
  stats: [[9, 15]],
  convertStats: () => {
    if (casting(
      6
      /* Cast.Outro */
    ))
      revokeCurrent(S1_CRIT2);
  }
});
var S6_RES_SHRED = new Debuff({
  name: "Spectro Rover S6: Echoes of Wanderlust",
  applyStats: () => addEnemyStat(
    35,
    10,
    320
    /* Attribute.Spectro */
  ),
  convertStats: () => {
    if (casting(
      5
      /* Cast.Intro */
    ) && isHeld(ROVER_SPECTRO_RESONATOR))
      revokeEnemy(S6_RES_SHRED);
  }
});
var SPR_S1 = new Sequence({
  name: "Spectro Rover S1: Odyssey of Beginnings",
  updateBuffs: () => {
    if (runningAction(Skill41) || runningAction(FSkill13))
      applyCurrent(S1_CRIT2, 1);
  }
});
var SPR_S2 = new Sequence({
  name: "Spectro Rover S2: Microcosmic Murmurs",
  stats: [[
    17,
    20,
    320
    /* Attribute.Spectro */
  ]]
});
var SPR_S3 = new Sequence({
  name: "Spectro Rover S3: Visages of Dust",
  stats: [[11, 20]]
});
var SPR_S4 = new Sequence({ name: "Spectro Rover S4: Resonating Lamella" });
var SPR_S5 = new Sequence({
  name: "Spectro Rover S5: Temporal Virtuoso",
  stats: [[
    17,
    40,
    16384
    /* Type1.Liberation */
  ]]
});
var SPR_S6 = new Sequence({
  name: "Spectro Rover S6: Echoes of Wanderlust",
  updateBuffs: () => {
    if (runningAction(Skill41) || runningAction(FSkill13))
      applyEnemy(S6_RES_SHRED, 1);
  }
});
var ROVER_SPECTRO_TALENTS = new Talent({
  name: "Spectro Rover: Talents",
  stats: [[6, 12], [
    17,
    12,
    320
    /* Attribute.Spectro */
  ]]
});
var ROVER_SPECTRO_RESONATOR = new Resonator({
  name: "Spectro Rover",
  talent: ROVER_SPECTRO_TALENTS,
  inherent1: SPR_INHERENT_1,
  inherent2: SPR_INHERENT_2,
  element: 320,
  weapon: 0,
  intro: () => Intro45,
  outro: () => Outro46,
  color: "#e8d98f",
  maxEnergy: 125,
  maxForte1: 100,
  tier: 2,
  constantStats: () => {
    addStat(1, 11400);
    addStat(0, 375);
    addStat(2, 1369);
  }
});
var SPR_ROTATION = new Rotation([
  INTRO,
  HA110,
  HA210,
  HA37,
  FSkill13,
  FBA7,
  HA110,
  HA210,
  HA37,
  FSkill13,
  Liberation36,
  ECHO_SWAP,
  OUTRO
]);
var ROVER_SPECTRO = new Loadout({
  resonator: ROVER_SPECTRO_RESONATOR,
  weapons: [EMERALD_OF_GENESIS, BLAZING_BRILLIANCE, RED_SPRING],
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
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.AtkPct, Substat.FlatAtk, Substat.Liberation, Substat.Er),
  rotation: SPR_ROTATION,
  sequences: [SPR_S1, SPR_S2, SPR_S3, SPR_S4, SPR_S5, SPR_S6]
});

// dist/src/resonators/spectro/shorekeeper.js
function skAction(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA145 = skAction("Basic - Origin Calculus 1", { node: 0, cast: 1, type: 4096, mv: 31.78, energy: 0.5, concerto: 1.6, offtune: 2664, forte1: 1 });
var BA246 = skAction("Basic - Origin Calculus 2", { node: 0, cast: 1, type: 4096, mv: 47.72, energy: 0.76, concerto: 2.4, offtune: 4e3, forte1: 1 });
var BA348 = skAction("Basic - Origin Calculus 3", { node: 0, cast: 1, type: 4096, mv: 69.96, energy: 1.11, concerto: 3.54, offtune: 5865, forte1: 2 });
var MA51 = skAction("Mid-air - Origin Calculus", { node: 0, cast: 1, type: 4096, mv: 73.96, energy: 1.55, concerto: 5, offtune: 4960, forte1: 1 });
var Skill43 = skAction("Skill - Chaos Theory", { node: 1, cast: 3, cutscene: true, type: 12288, mv: 156.55, energy: 10, concerto: 30, offtune: 5250 });
var FHA16 = skAction("Forte Heavy - Illation", { node: 2, cast: 2, cutscene: true, type: 8192, mv: 281.3, energy: 4.95, concerto: 11, offtune: 6360, forte1: -5 });
var Liberation37 = skAction("Liberation - End Loop", {
  node: 3,
  cast: 4,
  cutscene: true,
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
var Intro46 = skAction("Intro - Enlightenment", { node: 4, cast: 5, type: 12288, mv: 226.5, energy: 10, concerto: 20, offtune: 11395 });
var EIntro7 = skAction("Intro - Discernment", {
  node: 4,
  cast: 5,
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
var Outro47 = skAction("Outro - Binary Butterfly", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => applyTeam(SK_OUTRO, 1)
});
var REALM_STAGE = ["Outer", "Inner", "Supernal"];
var SK_REALM = new Buff({
  name: "Shorekeeper: Stellarealm",
  maxStacks: 3,
  display: () => `Shorekeeper: ${REALM_STAGE[stacksOfTeam(SK_REALM) - 1]} Stellarealm`,
  updateBuffs: () => {
    if (casting(
      6
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
  stats: [[18, 15]]
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
  stats: [[6, 40]]
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
    if (runningAction(Liberation37))
      addStat(27, 20);
  }
});
var SK_S4 = new Sequence({
  name: "Shorekeeper S4: Overflowing Quietude",
  applyStats: () => {
    if (runningAction(Skill43))
      addStat(24, 70);
  }
});
var SK_S5 = new Sequence({ name: "Shorekeeper S5: Echoes in Silence" });
var SK_S6 = new Sequence({
  name: "Shorekeeper S6: To the New World",
  applyStats: () => {
    if (runningAction(EIntro7)) {
      addStat(16, 42);
      addStat(10, 500);
    }
  }
});
var SHOREKEEPER_TALENTS = new Talent({
  name: "Shorekeeper: Talents",
  constantStats: () => {
    addStat(7, 12);
    addStat(24, 12);
  }
});
var SHOREKEEPER_RESONATOR = new Resonator({
  name: "Shorekeeper",
  talent: SHOREKEEPER_TALENTS,
  inherent1: SK_INHERENT_1,
  inherent2: SK_INHERENT_2,
  element: 320,
  weapon: 4,
  color: "#728cf3",
  maxEnergy: 175,
  maxForte1: 5,
  // reads SK_REALM's own live stack count, already stepped by the preceding outro
  intro: () => stacksOfTeam(SK_REALM) >= 3 ? EIntro7 : Intro46,
  outro: () => Outro47,
  updateDebuffs: () => {
    if (runningAction(Skill43) || runningAction(Liberation37) || runningAction(Intro46) || runningAction(EIntro7))
      applyCurrent(HEALS, 1);
  },
  constantStats: () => {
    addStat(1, 16712.5);
    addStat(0, 287.5);
    addStat(2, 1100);
  }
});
var BA12311 = new ActionGroup("Basic - Origin Calculus 123", [BA145, BA246, BA348]);
var BA2311 = new ActionGroup("Basic - Origin Calculus 23", [BA246, BA348]);
var BA1210 = new ActionGroup("Basic - Origin Calculus 12", [BA145, BA246]);
var SK_LOOP = new Rotation([
  START_3,
  Skill43,
  Liberation37,
  ECHO_SWAP,
  SWAP,
  NOINTRO,
  BA12311,
  JUMP,
  MA51,
  FHA16,
  Skill43,
  BA2311,
  DODGE,
  BA1210,
  FHA16,
  Liberation37,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  BA12311,
  JUMP,
  MA51,
  FHA16,
  START_2,
  Skill43,
  SWAP,
  Liberation37,
  ECHO_SWAP,
  OUTRO
]);
var SK_LOOP_S3 = new Rotation([
  START_3,
  Skill43,
  Liberation37,
  ECHO_SWAP,
  SWAP,
  NOINTRO,
  BA12311,
  JUMP,
  MA51,
  FHA16,
  Skill43,
  Liberation37,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  BA145,
  START_2,
  Skill43,
  SWAP,
  Liberation37,
  ECHO_SWAP,
  OUTRO
]);
var SHOREKEEPER = new Loadout({
  resonator: SHOREKEEPER_RESONATOR,
  weapons: [SK_SIG, VARIATION],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(SPACETREK_EXPLORER, STARRY_RADIANCE_5PC)
    //new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC),
    //new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
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
  substat: substats(Substat.HpPct, Substat.Liberation, Substat.FlatHp, true),
  highSubstat: highSubs(Substat.Er, Substat.Liberation, Substat.HpPct, Substat.Liberation),
  rotation: { 0: SK_LOOP, 3: SK_LOOP_S3 }
});

// dist/src/resonators/spectro/verina.js
function verinaAction(id, def2) {
  return new Action(id, { element: 320, scaling: 0, ...def2 });
}
var BA146 = verinaAction("Basic - Cultivation 1", { node: 0, cast: 1, type: 4096, mv: 37.86, energy: 0.95, concerto: 3.04, offtune: 7600 });
var BA247 = verinaAction("Basic - Cultivation 2", { node: 0, cast: 1, type: 4096, mv: 51.16, energy: 1.28, concerto: 4.11, offtune: 10200 });
var BA349 = verinaAction("Basic - Cultivation 3", { node: 0, cast: 1, type: 4096, mv: 51.16, energy: 1.28, concerto: 4.11, offtune: 10200 });
var BA432 = verinaAction("Basic - Cultivation 4", { node: 0, cast: 1, type: 4096, mv: 67.32, energy: 1.69, concerto: 5.41, offtune: 13600 });
var BA56 = verinaAction("Basic - Cultivation 5", { node: 0, cast: 1, type: 4096, mv: 71.62, energy: 1.8, concerto: 5.76, offtune: 14400, forte1: 1 });
var HA38 = verinaAction("Heavy - Cultivation", { node: 0, cast: 2, type: 8192, mv: 99.41, energy: 2.5, concerto: 8, offtune: 2e4 });
var MA114 = verinaAction("Mid-air - Cultivation 1", { node: 0, cast: 1, type: 4096, mv: 56.37, energy: 1.41, concerto: 4.53, offtune: 11340 });
var MA213 = verinaAction("Mid-air - Cultivation 2", { node: 0, cast: 1, type: 4096, mv: 53.19, energy: 1.33, concerto: 4.28, offtune: 10700 });
var MA311 = verinaAction("Mid-air - Cultivation 3", { node: 0, cast: 1, type: 4096, mv: 76.26, energy: 1.89, concerto: 6.12, offtune: 15342 });
var MHA3 = verinaAction("Heavy - Cultivation (Mid-air)", { node: 0, cast: 2, type: 8192, mv: 61.64, energy: 0.51, concerto: 1, offtune: 12400 });
var DC38 = verinaAction("Dodge Counter - Cultivation", { node: 0, cast: 0, type: 4096, mv: 129.23, energy: 3.25, concerto: 15.6, offtune: 14e3 });
var Skill44 = verinaAction("Skill - Botany Experiment", { node: 1, cast: 3, type: 12288, mv: 178.95, energy: 15, concerto: 30, offtune: 26600, forte1: 1 });
var STARFLOWER_CONCERTO = { updateDebuffs: () => {
  addStat(27, 12);
  applyCurrent(HEALS, 1);
} };
var StarflowerHeavy = verinaAction("Forte Heavy - Starflower Blooms", { node: 2, cast: 2, type: 8192, mv: 162.37, energy: 2.91, concerto: 4.66, offtune: 14600, forte1: -1, ...STARFLOWER_CONCERTO });
var ForteMidair1 = verinaAction("Forte Mid-air - Starflower Blooms 1", { node: 2, cast: 1, type: 4096, mv: 67.64, energy: 1.41, concerto: 4.53, offtune: 11340, forte1: -1, ...STARFLOWER_CONCERTO });
var ForteMidair2 = verinaAction("Forte Mid-air - Starflower Blooms 2", { node: 2, cast: 1, type: 4096, mv: 63.82, energy: 1.33, concerto: 4.28, offtune: 10700, forte1: -1, ...STARFLOWER_CONCERTO });
var ForteMidair3 = verinaAction("Forte Mid-air - Starflower Blooms 3", { node: 2, cast: 1, type: 4096, mv: 30.5 * 3, energy: 1.89, concerto: 6.12, offtune: 15342, forte1: -1, ...STARFLOWER_CONCERTO });
var Liberation38 = verinaAction("Liberation - Arboreal Flourish", {
  node: 3,
  cast: 4,
  cutscene: true,
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
  field: PHOTOSYNTHESIS_FIELD
});
var S6Tick = PhotosynthesisTick.variant("Liberation - Photosynthesis Mark", { field: null });
var Intro47 = verinaAction("Intro - Verdant Growth", { node: 4, cast: 5, type: 20480, mv: 99.41, energy: 10, concerto: 10, offtune: 11230, forte1: 1 });
var Outro48 = verinaAction("Outro - Blossom", {
  cast: 6,
  concerto: -100,
  swapOut: true,
  updateBuffs: () => applyTeam(VERINA_OUTRO, 1)
});
var GIFT_OF_NATURE = new Buff({
  name: "Inherent: Gift of Nature",
  stats: [[6, 20]],
  // granted from VERINA_RESONATOR's own updateBuffs() below since a global buff's own updateBuffs() can't fire before
  // it's held once, and the Resonator itself is always self-held from team setup
  convertStats: () => {
    if (casting(
      5
      /* Cast.Intro */
    ) && isHeld(VERINA_RESONATOR))
      revokeTeam(GIFT_OF_NATURE);
  }
});
var VR_INHERENT_1 = new Inherent({
  name: "Inherent: Gift of Nature",
  updateBuffs: () => {
    if (runningAction(StarflowerHeavy) || runningAction(ForteMidair1) || runningAction(Liberation38) || runningAction(Outro48))
      applyTeam(GIFT_OF_NATURE, 1);
  }
});
var VR_INHERENT_2 = new Inherent({ name: "Inherent: Grace of Life" });
var VERINA_OUTRO = new Buff({
  name: "Verina: Blossom",
  stats: [[18, 15]]
});
var PHOTOSYNTHESIS_MARK = coordinatedBuff("Verina: Photosynthesis Mark", 12, () => VERINA_RESONATOR, PhotosynthesisTick, { enemy: true });
var VERINA_S2 = new Sequence({
  name: "Verina S2: Sprouting Reflections",
  applyStats: () => {
    if (runningAction(Skill44)) {
      addStat(30, 1);
      addStat(27, 10);
    }
  }
});
var VERINA_S4 = new Sequence({
  name: "Verina S4: Blossoming Embrace",
  updateBuffs: () => {
    if (runningAction(StarflowerHeavy) || runningAction(ForteMidair1) || runningAction(Liberation38) || runningAction(Outro48))
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
    if (runningAction(StarflowerHeavy) || runningAction(ForteMidair1) || runningAction(ForteMidair2) || runningAction(ForteMidair3)) {
      addStat(17, 20);
      queue(S6Tick);
    }
  }
});
var VERINA_S1 = new Sequence({ name: "Verina S1: Moment of Emergence" });
var VERINA_S3 = new Sequence({ name: "Verina S3: The Choice to Flourish" });
var VERINA_S5 = new Sequence({ name: "Verina S5: Miraculous Blooms" });
var VERINA_TALENTS = new Talent({
  name: "Verina: Talents",
  stats: [[6, 12], [24, 12]]
});
var VERINA_RESONATOR = new Resonator({
  name: "Verina",
  talent: VERINA_TALENTS,
  inherent1: VR_INHERENT_1,
  inherent2: VR_INHERENT_2,
  element: 320,
  weapon: 4,
  intro: () => Intro47,
  outro: () => Outro48,
  color: "#cfee7a",
  maxEnergy: 175,
  // her own real 175%, not the generic 125% default — matches Shorekeeper's own
  maxForte1: 4,
  tier: 1,
  updateDebuffs: () => {
    if (runningAction(StarflowerHeavy) || runningAction(ForteMidair1) || runningAction(ForteMidair2) || runningAction(ForteMidair3) || runningAction(Liberation38) || runningAction(PhotosynthesisTick) || runningAction(S6Tick) || runningAction(Outro48))
      applyCurrent(HEALS, 1);
  },
  constantStats: () => {
    addStat(1, 14238);
    addStat(0, 338);
    addStat(2, 1100);
  }
});
var BA3452 = new ActionGroup("Basic - Cultivation 345", [BA349, BA432, BA56]);
var VR_LOOP = new Rotation([
  NOINTRO,
  BA3452,
  Liberation38,
  Skill44,
  JUMP,
  ForteMidair1,
  ForteMidair2,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  Liberation38,
  Skill44,
  JUMP,
  ForteMidair1,
  ForteMidair2,
  ECHO_SWAP,
  OUTRO
]);
var VR_S2 = new Rotation([
  NOINTRO,
  Liberation38,
  Skill44,
  JUMP,
  ForteMidair1,
  ForteMidair2,
  ECHO_SWAP,
  OUTRO,
  INTRO,
  Liberation38,
  Skill44,
  JUMP,
  ForteMidair1,
  ECHO_SWAP,
  OUTRO
]);
var VERINA = new Loadout({
  resonator: VERINA_RESONATOR,
  weapons: [VARIATION],
  echoLoadouts: [
    new EchoLoadout(FALLACY, REJUV_5PC),
    new EchoLoadout(SPACETREK_EXPLORER, STARRY_RADIANCE_5PC)
    //new EchoLoadout(BELL_BORNE_GEOCHELONE, MOONLIT_CLOUDS_5PC),
    //new EchoLoadout(HERON, MOONLIT_CLOUDS_5PC),
  ],
  mainstats: [mainstats(
    2,
    5,
    5,
    15,
    15
    /* Mainstat.ATK1 */
  )],
  substat: substats(Substat.AtkPct, Substat.Liberation, Substat.FlatAtk),
  highSubstat: highSubs(Substat.Er, Substat.Basic, Substat.AtkPct, Substat.Basic),
  rotation: { 0: VR_LOOP, 2: VR_S2 },
  sequences: [VERINA_S1, VERINA_S2, VERINA_S3, VERINA_S4, VERINA_S5, VERINA_S6]
});

// dist/src/teams.js
var TEAMS = [
  // suoming mdps, electro basic unison
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [SANHUA, LYNAE_RUPTURE, REBECCA, JINHSI_SUPPORT], [SUOMING_MDPS]],
  // dual dps long rot
  // [[SHOREKEEPER, VERINA, BULING, MORNYE, SUISUI], [SUOMING_MDPS], [JINHSI]],
  // hsin, Unison mode: Suoming or Jinhsi behind her hands over the Unison her Intro answers
  [[SHOREKEEPER, VERINA, BULING, MORNYE, SUISUI], [SUOMING, SUOMING], [HSIN_UNISON]],
  //[[HSIN_UNISON], [JINHSI_SUPPORT, JINHSI_SUPPORT], [SUOMING, SUOMING], ],
  [[SUOMING, SUOMING], [HSIN_UNISON], [JINHSI_SUPPORT, JINHSI_SUPPORT]],
  [[PHROLOVA_DUAL_DPS], [SUOMING, SUOMING], [HSIN_UNISON]],
  //[[JINHSI_SUPPORT, JINHSI_SUPPORT], [SUOMING, SUOMING], [HSIN_UNISON], ],
  // jinhsi: spectro skill
  [[SHOREKEEPER, VERINA, MORNYE, BULING, ZHEZHI, SUISUI], [ZHEZHI, YINLIN, CANTARELLA, LYNAE_RUPTURE, REBECCA, SUOMING, HSIN_UNISON], [JINHSI]],
  // both worse with jinhsi first
  // [[SHOREKEEPER, VERINA, MORNYE, BULING, ZHEZHI, SUISUI], [JINHSI], [SUOMING, HSIN_UNISON]],
  // hsin (Electro Flare mode): electro skill flare
  [[SUISUI, BULING, CHISA, SHOREKEEPER, MORNYE], [CHISA, ROVER_ELECTRO, LYNAE_RUPTURE, REBECCA], [HSIN_FLARE]],
  // electro rover mdps: Apex Resonance, the Thrum of All Sounds chains
  [[BULING, CHISA, SHOREKEEPER, VERINA, MORNYE, SUISUI], [LYNAE_RUPTURE, REBECCA], [ROVER_ELECTRO_MDPS]],
  // jingran: fusion heavy shielder
  [[SHOREKEEPER, LUPA, VERINA, MORNYE], [IUNO, MORTEFI, BRANT, LUPA, LYNAE_RUPTURE, REBECCA], [JINGRAN]],
  // qingxiao: aero heavy/basic/liberation on tune strain
  [[MORNYE, SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA], [DENIA_STRAIN, LYNAE_STRAIN, ROVER_AERO, CIACCONA, SANHUA, MORTEFI, REBECCA, JIANXIN], [QINGXIAO]],
  // xuanling: havoc heavy attack on Havoc Bane — Chisa's +3 to every Negative Status cap is what
  // takes Unbroken Vow off its 3-stack 30% tier onto the 4-6 stack 36% one
  [[SUISUI, MORNYE, CHISA, VERINA, SHOREKEEPER], [MORTEFI, REBECCA, LYNAE_RUPTURE, IUNO, PHROLOVA_DUAL_DPS, ROVER_ELECTRO], [XUANLING]],
  // faster supports = 2F rot with chisa
  [[VERINA, SHOREKEEPER], [CHISA, CHISA], [XUANLING_2F]],
  [[SUISUI, MORNYE], [CHISA, CHISA], [XUANLING]],
  // hiyuki: glacio chafe/bite — every stack the team lands calculates at the target's own limit,
  // which is why Chisa (+3 to it) and Lucilla's Chafe build stand behind her
  [[SUISUI, VERINA, SHOREKEEPER, MORNYE, CHISA], [LUCILLA_CHAFE, CHISA, LYNAE_RUPTURE, JIANXIN, ROVER_ELECTRO, ZHEZHI], [HIYUKI]],
  [[HIYUKI], [LUCILLA_CHAFE, LUCILLA_CHAFE], [LYNAE_RUPTURE, JIANXIN, ROVER_ELECTRO, ZHEZHI]],
  [[PHROLOVA_DUAL_DPS], [LUCILLA, LUCILLA], [HIYUKI]],
  [[SUISUI, SUISUI], [PHROLOVA_DUAL_DPS], [HIYUKI]],
  [[SUISUI, SUISUI], [CARLOTTA], [HIYUKI]],
  [[HIYUKI], [CARLOTTA], [LUCILLA_CHAFE, LUCILLA_CHAFE]],
  // lucy: spectro heavy on tune hack, with rebecca feeding her the outro
  [[VERINA, MORNYE, SHOREKEEPER], [REBECCA, REBECCA], [LUCY]],
  // sigrika: aero + echo
  [[SHOREKEEPER, CIACCONA, VERINA, MORNYE], [QIUYUAN, LUCILLA, CANTARELLA, ROVER_AERO, CIACCONA, LYNAE_RUPTURE], [SIGRIKA]],
  [[QIUYUAN, ROVER_AERO], [QIUYUAN, LUCILLA], [SIGRIKA_FAST]],
  [[PHROLOVA_DUAL_DPS], [QIUYUAN, LUCILLA], [SIGRIKA_FAST]],
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
  // qiuyuan: aero heavy echo
  [[SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA, MORNYE], [MORTEFI, IUNO, CIACCONA, LYNAE_RUPTURE, REBECCA, ROVER_AERO], [QIUYUAN_MDPS]],
  [[SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA, MORNYE], [PHROLOVA_DUAL_DPS, LUCILLA], [QIUYUAN_MDPS]],
  // galbrena: fusion echo
  [[SHOREKEEPER, VERINA, LUPA, QIUYUAN, MORNYE, DENIA_BURST], [QIUYUAN, LUCILLA], [GALBRENA]],
  [[PHROLOVA_DUAL_DPS], [QIUYUAN, LUCILLA], [GALBRENA]],
  // galbrena: fusion heavy
  [[SHOREKEEPER, VERINA, LUPA, MORNYE, DENIA_BURST], [BRANT, MORTEFI, IUNO, LUPA, LYNAE_RUPTURE, REBECCA], [GALBRENA]],
  // iuno mdps: aero + echo
  [[SHOREKEEPER, ROVER_AERO, CIACCONA, VERINA, MORNYE], [ROVER_AERO, CIACCONA, LYNAE_RUPTURE, JIANXIN], [IUNO_MDPS]],
  // augusta: electro heavy shielder
  [[SHOREKEEPER, VERINA, MORNYE], [IUNO, MORTEFI, LYNAE_RUPTURE, REBECCA], [AUGUSTA]],
  // add phrolo subdps?
  // phrolova: havoc, echo, skill
  // phrolova -> subdps -> subdps
  [[PHROLOVA], [QIUYUAN, LUCILLA, LYNAE_RUPTURE, ROCCIA, DANJIN], [DANJIN, LUCILLA, CANTARELLA, LYNAE_RUPTURE]],
  [[PHROLOVA], [JINHSI_SUPPORT, JINHSI_SUPPORT], [CANTARELLA, CANTARELLA]],
  // phrolova -> support -> subdps
  [[PHROLOVA], [SHOREKEEPER, VERINA, BULING, MORNYE, SUISUI], [QIUYUAN, DANJIN, LUCILLA, CANTARELLA, LYNAE_RUPTURE]],
  // phrolova -> driver -> support
  [[PHROLOVA], [QIUYUAN, ROCCIA, DANJIN, ROVER_HAVOC], [SHOREKEEPER, VERINA, SUISUI]],
  // cartethyia: aero HP-scaling basic attack on Aero Erosion — Aero Rover and Chisa both raise the
  // status's own cap, which is what her Erosion ticks and her Blade's amplification both read
  [[SUISUI, CHISA, SHOREKEEPER, MORNYE, CIACCONA, CHISA], [ROVER_AERO, CHISA], [CARTETHYIA]],
  [[SUISUI, CHISA, ROVER_AERO, CIACCONA], [SANHUA, SANHUA], [CARTETHYIA]],
  // brant: fusion basic
  [[MORNYE, DENIA_BURST, VERINA, SHOREKEEPER], [SANHUA, LUPA, DENIA_BURST], [BRANT_MDPS]],
  [[LUPA, LUPA], [BRANT], [CHANGLI]],
  [[LUPA, LUPA], [BRANT], [ENCORE]],
  // cantarella: havoc basic, echo
  [[SHOREKEEPER, VERINA, MORNYE], [SANHUA, ROCCIA, LYNAE_RUPTURE, REBECCA], [CANTARELLA_MDPS]],
  // carlotta: glacio skill
  [[SHOREKEEPER, BULING, VERINA, MORNYE, SUISUI], [BRANT, LYNAE_RUPTURE, REBECCA, LUCILLA_CHAFE], [CARLOTTA]],
  [[SHOREKEEPER, BULING, VERINA, MORNYE, SUISUI, JINHSI_SUPPORT], [ZHEZHI, CANTARELLA], [CARLOTTA]],
  // roccia: havoc heavy
  [[SHOREKEEPER, VERINA, MORNYE], [MORTEFI, IUNO, LYNAE_RUPTURE, REBECCA], [ROCCIA_MDPS]],
  [[SHOREKEEPER, VERINA, MORNYE], [PHROLOVA_DUAL_DPS], [ROCCIA_MDPS]],
  // camellya: havoc basic
  [[SHOREKEEPER, VERINA], [SANHUA, ROCCIA], [CAMELLYA_DOUBLE]],
  // xiangli yao: electro liberation
  [[SHOREKEEPER, VERINA, MORNYE], [YINLIN, LYNAE_RUPTURE, JIANXIN], [XIANGLI_YAO]],
  // changli: fusion skill+liberation
  [[LUPA, MORNYE, SHOREKEEPER, DENIA_BURST, VERINA], [DENIA_BURST, LYNAE_RUPTURE, LUPA], [CHANGLI]],
  // jiyan: aero heavy
  [[SHOREKEEPER, VERINA, ROVER_AERO, CIACCONA, MORNYE], [MORTEFI, IUNO, CIACCONA, LYNAE_RUPTURE, REBECCA, PHROLOVA_DUAL_DPS, ROVER_AERO], [JIYAN]]
  // encore: fusion basic
  //[[SHOREKEEPER, VERINA, DENIA_BURST, LUPA], [LUPA, SANHUA, DENIA_BURST], [ENCORE]],
  //[[LUPA, LUPA], [ENCORE], [CHANGLI, BRANT]],
  // havoc rover: havoc, mixed
  //[[SHOREKEEPER, VERINA, MORNYE], [ROCCIA, DANJIN, SANHUA, LYNAE_RUPTURE, CANTARELLA], [ROVER_HAVOC]],
];
var UNPLAYABLE_TEAMS = [];
var ALL_TEAMS = TEAMS.flatMap((slots) => {
  const mdps = slots.map((s) => s.length === 1);
  if (!mdps.some(Boolean)) {
    const names = slots.map((s) => s.map((l) => l.resonator.name).join("/")).join(", ");
    throw new Error(`the team [${names}] has no one-loadout slot naming its main DPS`);
  }
  const [a, b, c] = slots.map((s) => [...new Set(s)]);
  return a.flatMap((x) => b.flatMap((y) => c.map((z) => ({ loadouts: [x, y, z], mdps })))).filter((team) => new Set(team.loadouts.map((l) => l.resonator)).size === team.loadouts.length).filter((team) => {
    const names = team.loadouts.map((l) => l.resonator.name);
    const [x, y, z] = team.loadouts.map((l) => l.rotations);
    let why = null;
    for (const rx of x)
      for (const ry of y)
        for (const rz of z)
          why ??= teamPlayable([rx, ry, rz], names);
    if (why)
      UNPLAYABLE_TEAMS.push({ names, why });
    return why === null;
  });
});
if (UNPLAYABLE_TEAMS.length) {
  throw new Error(`teams.ts lists ${UNPLAYABLE_TEAMS.length} team(s) the scheduler can't play:
` + UNPLAYABLE_TEAMS.map((t) => `  ${t.names.join(" / ")} \u2014 ${t.why}`).join("\n"));
}
var teamKey = (index) => `t${index}`;
var teamAt = (key) => /^t\d+$/.test(key) ? ALL_TEAMS[Number(key.slice(1))] : void 0;

// dist/src/solver.js
var member = (loadout, mainDps = false) => ({ name: loadout.resonator.name, color: loadout.resonator.color, loadout, mainDps });
var AXES = ["weapons", "echoes", "mainstats", "sequences", "refines", "substats"];
var scopedKey = (s) => `${s.resonator}~${s.on}~${s.value}~${s.axis}`;
var weaponBase = (w) => w.name.replace(/ R\d$/, "");
var gateOf = (l, p) => ({ weapon: l.refinements[p.weapon][p.refine], sequence: p.sequence, echo: l.echoLoadouts[p.echo] });
function scopedOpen(m, f, axis, gate) {
  const l = m.loadout;
  return f.scoped.some((s) => s.resonator === l.resonator.name && s.axis === axis && (s.on === "sequence" ? +s.value === gate.sequence : s.on === "refine" ? gate.weapon.refinement === +s.value : s.on === "weapon" ? weaponBase(gate.weapon) === s.value : s.on === "weaponRank" ? gate.weapon.name === s.value : echoLabel(l, gate.echo) === s.value));
}
var axisUsed = (m, f, axis) => axisOpen(m, f, axis) || f.scoped.some((s) => s.resonator === m.loadout.resonator.name && s.axis === axis);
var compares = (m, f, axis, gate) => axisOpen(m, f, axis) || scopedOpen(m, f, axis, gate);
function echoLines(l, echo) {
  const showMainslot = l.echoLoadouts.some((e) => e.sonata === echo.sonata && e.mainslot !== echo.mainslot);
  const lines = echo.sets.map((g) => g.name);
  if (showMainslot)
    lines.push(echo.mainslot.name);
  return lines;
}
var echoLabel = (l, echo) => echoLines(l, echo).join(" + ");
var defaultFilters = () => ({
  matrix: false,
  cost: "s0r1",
  weapons: [],
  echoes: [],
  mainstats: [],
  substats: [],
  sequences: [],
  refines: [],
  scoped: []
});
var axisOpen = (m, filters, axis) => filters[axis].includes(m.loadout.resonator.name);
var filterSignature = (f) => [f.matrix, f.cost, ...AXES.map((a) => [...f[a]].sort().join("+")), f.scoped.map(scopedKey).sort().join("+")].join(",");
var bestKey = (teamKey2, members, filters) => {
  const matrix2 = filters.matrix && members.some((m) => m.loadout.resonator.matrix);
  const scoped = (m) => {
    const own = filters.scoped.filter((s) => s.resonator === m.loadout.resonator.name).map((s) => `${s.on}~${s.value}~${s.axis}`).sort();
    return own.length ? `:${own.join(";")}` : "";
  };
  return `${teamKey2}|${matrix2}|${filters.cost}|${members.map((m) => AXES.map((a) => axisOpen(m, filters, a) ? "1" : "0").join("") + scoped(m)).join(",")}`;
};
var picksKey = (teamKey2, members, filters) => {
  const matrix2 = filters.matrix && members.some((m) => m.loadout.resonator.matrix);
  return `${teamKey2}|${matrix2}|${filters.cost}|${members.map((m) => axisOpen(m, filters, "weapons") ? "1" : "0").join("")}`;
};
var comboOf = (l, p) => {
  const matrix2 = p.matrix && l.resonator.matrix ? l.resonator.matrix : null;
  return {
    weapon: l.refinements[p.weapon][p.refine],
    echo: l.echoLoadouts[p.echo],
    mainstat: l.mainstats[p.mainstat],
    sequence: p.sequence,
    matrix: matrix2,
    highSubs: p.highSubs,
    key: `${p.weapon}.${p.echo}.${p.mainstat}.s${p.sequence}.r${p.refine}${matrix2 ? ".m" : ""}${p.highSubs ? ".h" : ""}`
  };
};
var costGrant = (cost, holds) => {
  const [, sequence, rank, mdps] = /^s(\d)r(\d)(mdps)?$/.exec(cost);
  return mdps && !holds ? { sequence: 0, refine: 0 } : { sequence: +sequence, refine: Math.max(0, +rank - 1) };
};
var grantToOne = (cost) => cost.endsWith("mdps");
function costLevel(m, cost, holds) {
  const l = m.loadout;
  const max = l.sequences.length;
  if (!max)
    return l.minSequence ? null : 0;
  const at = Math.min(Math.max(Math.min(baseSequence(l.resonator), max), costGrant(cost, holds).sequence), max);
  return at < l.minSequence ? null : at;
}
var costRefine = (m, weapon, cost, holds) => Math.min(costGrant(cost, holds).refine, m.loadout.refinements[weapon].length - 1);
function topRank(m, filters, weapon) {
  if (m.loadout.refinements[weapon].length < 2 || !m.loadout.sequences.length)
    return null;
  if (!axisOpen(m, filters, "sequences") || axisUsed(m, filters, "refines"))
    return null;
  return m.loadout.refinements[weapon].length - 1;
}
function refineLevels(m, filters, p) {
  const ranks = m.loadout.refinements[p.weapon];
  if (compares(m, filters, "refines", gateOf(m.loadout, p)))
    return ranks.map((_, i) => i);
  const home = axisOpen(m, filters, "sequences") ? 0 : Math.min(p.refine, ranks.length - 1);
  const extra = p.sequence === m.loadout.sequences.length ? topRank(m, filters, p.weapon) : null;
  return extra === null ? [home] : [home, extra];
}
function sequenceLevels(m, filters, holds = true) {
  const l = m.loadout;
  const max = l.sequences.length;
  if (!axisOpen(m, filters, "sequences") || !max) {
    const at = costLevel(m, filters.cost, holds);
    return at === null ? [] : [at];
  }
  const base = Math.min(baseSequence(l.resonator), max);
  const from = Math.max(l.minSequence, l.resonator.tier === 2 ? 0 : base);
  return Array.from({ length: max - from + 1 }, (_, i) => from + i);
}
var hasBuild = (m, filters) => eligibleWeapons(m, filters).length > 0 && sequenceLevels(m, filters, !grantToOne(filters.cost)).length > 0;
var isSignature = (l, i) => l.weapons[i].tier === 0;
var standardWeapon = (l) => Math.max(0, l.weapons.findIndex(
  (w) => w.tier !== 0
  /* Tier.Limited */
));
function weaponOptions(m, filters, sig) {
  const l = m.loadout;
  if (axisOpen(m, filters, "weapons"))
    return l.weapons.map((_, i) => i);
  return [sig ? 0 : standardWeapon(l)];
}
var sigForAll = (cost) => cost !== "s0r0" && cost !== "s0r1mdps";
var sigAllowed = (i, holder, cost) => sigForAll(cost) || cost === "s0r1mdps" && i === holder;
var sigHolder = (members, picks) => {
  const i = picks.findIndex((p, k) => isSignature(members[k].loadout, p.weapon));
  return i < 0 ? null : i;
};
function eligibleWeapons(m, filters) {
  return weaponOptions(m, filters, sigForAll(filters.cost));
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
function rankedMainstats(scores, m) {
  const ranked = [];
  scores.forEach((run2, k) => ranked.push({ mainstat: k, damage: run2.bySlot.get(m.name) ?? 0, total: run2.total }));
  return ranked.sort((a, b) => b.damage - a.damage);
}
function bestMainstats(teamKey2, members, picks, who) {
  const scores = scoreMainstats(teamKey2, members, picks, who);
  return picks.map((p, i) => {
    if (!who.includes(i))
      return p;
    const index = rankedMainstats(scores.get(i), members[i])[0]?.mainstat ?? p.mainstat;
    return index === p.mainstat ? p : { ...p, mainstat: index };
  });
}
function bestMainstatFor(teamKey2, members, picks, i) {
  const best = rankedMainstats(scoreMainstats(teamKey2, members, picks, [i]).get(i), members[i])[0];
  return best ? { mainstat: best.mainstat, total: best.total } : { mainstat: picks[i].mainstat, total: 0 };
}
function optimizeTeam(teamKey2, members, filters) {
  const sig = sigForAll(filters.cost);
  const holds = !grantToOne(filters.cost);
  const picks = members.map((m) => {
    const weapon = weaponOptions(m, filters, sig)[0] ?? 0;
    return {
      weapon,
      echo: 0,
      mainstat: 0,
      sequence: sequenceLevels(m, filters, holds)[0],
      refine: costRefine(m, weapon, filters.cost, holds),
      matrix: filters.matrix,
      highSubs: false
    };
  });
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
        const at = axis === "weapon" ? { ...home, weapon: option, refine: Math.min(home.refine, members[i].loadout.refinements[option].length - 1) } : { ...home, echo: option };
        const rerolled = bestMainstatFor(teamKey2, members, picks.map((p, j) => j === i ? at : p), i);
        picks[i] = { ...at, mainstat: rerolled.mainstat };
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
  const converge = (weapons) => {
    for (let round = 0; round < 8; round++) {
      const w = weapons && sweepAcross("weapon", (m) => weaponOptions(m, filters, sig));
      const e = sweepAcross("echo", (m) => m.loadout.echoLoadouts.map((_, i) => i));
      if (!w && !e)
        break;
      sweepMainstats();
    }
  };
  sweepMainstats();
  converge(true);
  if (filters.cost === "s0r1mdps") {
    let best = run2().total, winner = null;
    members.forEach((m, i) => {
      if (!isSignature(m.loadout, 0))
        return;
      const trial = picks.map((p, j) => j === i ? { ...p, weapon: 0, refine: Math.min(p.refine, m.loadout.refinements[0].length - 1) } : p);
      const rerolled = bestMainstatFor(teamKey2, members, trial, i);
      if (rerolled.total > best) {
        best = rerolled.total;
        winner = trial.map((p, j) => j === i ? { ...p, mainstat: rerolled.mainstat } : p);
      }
    });
    if (winner) {
      winner.forEach((p, i) => {
        picks[i] = p;
      });
      sweepMainstats();
      converge(false);
    }
  }
  if (grantToOne(filters.cost)) {
    let best = run2().total, winner = null;
    members.forEach((m, i) => {
      const home = picks[i];
      const level = costLevel(m, filters.cost, true);
      const lifted = {
        ...home,
        sequence: level === null ? home.sequence : Math.max(level, home.sequence),
        refine: costRefine(m, home.weapon, filters.cost, true)
      };
      if (lifted.sequence === home.sequence && lifted.refine === home.refine)
        return;
      const trial = picks.map((p, j) => j === i ? lifted : p);
      const rerolled = bestMainstatFor(teamKey2, members, trial, i);
      if (rerolled.total > best) {
        best = rerolled.total;
        winner = trial.map((p, j) => j === i ? { ...lifted, mainstat: rerolled.mainstat } : p);
      }
    });
    if (winner) {
      winner.forEach((p, i) => {
        picks[i] = p;
      });
      sweepMainstats();
      converge(true);
    }
  }
  return picks;
}
var teamFromKey = (key) => {
  const team = teamAt(key);
  if (!team)
    throw new Error(`no team is named ${key}`);
  return team.loadouts.map((l, i) => member(l, team.mdps[i]));
};
function cartesian(lists) {
  return lists.reduce((acc, list) => acc.flatMap((picked) => list.map((item) => [...picked, item])), [[]]);
}
var MAINSTAT_ROWS = 9;
function buildsOf(m, home, f, sig) {
  const l = m.loadout;
  const weapons = axisOpen(m, f, "weapons") ? weaponOptions(m, f, sig) : [home.weapon];
  const subs = axisOpen(m, f, "substats") ? [false, true] : [home.highSubs];
  const sequences = axisOpen(m, f, "sequences") ? sequenceLevels(m, f) : [home.sequence];
  const picks = [];
  for (const weapon of weapons)
    for (const sequence of sequences) {
      const at = { ...home, weapon, sequence, refine: Math.min(home.refine, l.refinements[weapon].length - 1) };
      const echoes = compares(m, f, "echoes", gateOf(l, at)) ? l.echoLoadouts.map((_, i) => i) : [home.echo];
      for (const refine of refineLevels(m, f, at))
        for (const echo of echoes)
          for (const highSubs2 of subs) {
            picks.push({ ...at, refine, echo, highSubs: highSubs2 });
          }
    }
  return picks;
}
function rowPicks(teamKey2, members, best, filters, onProgress) {
  const hidden = [];
  const mainstatsOpen = (picks) => members.map((_, i) => i).filter((i) => compares(members[i], filters, "mainstats", gateOf(members[i].loadout, picks[i])));
  const settle = (picks) => {
    const open = mainstatsOpen(picks);
    const closed = members.map((_, i) => i).filter((i) => !open.includes(i));
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
  const compared = members.some((m) => AXES.some((a) => axisUsed(m, filters, a)));
  const pinEchoes = (picks) => {
    let out = picks;
    const closedEchoes = members.map((_, i) => i).filter((i) => !compares(members[i], filters, "echoes", gateOf(members[i].loadout, picks[i])));
    const reroll = (trial, i) => {
      if (!compared) {
        const one = bestMainstatFor(teamKey2, members, trial, i);
        return { picks: trial.map((p, j) => j === i ? { ...p, mainstat: one.mainstat } : p), total: one.total };
      }
      const rolled = bestMainstats(teamKey2, members, trial, members.map((_, k) => k).filter((k) => !mainstatsOpen(trial).includes(k)));
      return { picks: rolled, total: trialRun(teamKey2, members, rolled).total };
    };
    for (const i of closedEchoes) {
      if (members[i].loadout.echoLoadouts.length < 2)
        continue;
      const home = out[i];
      const incumbent = reroll(out, i);
      let winner = home;
      let bestTotal = incumbent.total;
      members[i].loadout.echoLoadouts.forEach((_, echo) => {
        if (echo === home.echo)
          return;
        const trial = reroll(out.map((p, j) => j === i ? { ...home, echo } : p), i);
        hidden.push(trial.picks);
        if (trial.total > bestTotal) {
          bestTotal = trial.total;
          winner = trial.picks[i];
        }
      });
      hidden.push(incumbent.picks);
      out = out.map((p, j) => j === i ? winner : p);
    }
    return out;
  };
  const holder = sigHolder(members, best);
  const builds = cartesian(members.map((m, i) => buildsOf(m, best[i], filters, sigAllowed(i, holder, filters.cost))));
  const seen = /* @__PURE__ */ new Map();
  for (const picks of builds) {
    const key = picks.map((p) => `${p.weapon}.${p.echo}.s${p.sequence}.r${p.refine}${p.highSubs ? ".h" : ""}`).join("-");
    if (!seen.has(key))
      seen.set(key, picks);
  }
  const isBest = (build3) => build3.every((p, i) => {
    const b = best[i];
    return p.weapon === b.weapon && p.echo === b.echo && p.sequence === b.sequence && p.refine === b.refine && p.highSubs === b.highSubs;
  });
  const rows = [];
  let built = 0;
  for (const build3 of seen.values()) {
    onProgress?.(built++ / seen.size);
    const settled = settle(!compared && isBest(build3) ? build3 : pinEchoes(build3));
    const open = mainstatsOpen(settled);
    if (!open.length) {
      rows.push(settled);
      continue;
    }
    const scores = scoreMainstats(teamKey2, members, settled, open);
    const top = /* @__PURE__ */ new Map();
    for (const i of open) {
      top.set(i, rankedMainstats(scores.get(i), members[i]).slice(0, MAINSTAT_ROWS).map((r) => r.mainstat));
    }
    for (const mainstats2 of cartesian(members.map((_, i) => top.get(i) ?? [settled[i].mainstat]))) {
      rows.push(settled.map((p, i) => ({ ...p, mainstat: mainstats2[i] })));
    }
  }
  return { rows, hidden };
}
function solveTeam(teamKey2, members, filters, known = null, onProgress) {
  trialCache = /* @__PURE__ */ new Map();
  scoreCache = /* @__PURE__ */ new Map();
  const picks = known ?? optimizeTeam(teamKey2, members, filters);
  const { rows, hidden } = rowPicks(teamKey2, members, picks, filters, (s) => onProgress?.(s / 2));
  const score = (row) => {
    const combo = members.map((m, i) => comboOf(m.loadout, row[i]));
    return scoreOf(trialCache.get(trialKey(teamKey2, combo)) ?? runTeam(teamKey2, members, combo));
  };
  const scores = rows.map((row, i) => {
    onProgress?.(0.5 + i / 2 / rows.length);
    return score(row);
  });
  const hiddenScores = hidden.map(score);
  trialCache = /* @__PURE__ */ new Map();
  scoreCache = /* @__PURE__ */ new Map();
  return { picks, rows, scores, hidden, hiddenScores };
}
var isProgress = (m) => "share" in m;
if (typeof document === "undefined" && typeof self !== "undefined") {
  const ctx2 = self;
  ctx2.onmessage = ({ data }) => {
    let sent = 0;
    const solved = solveTeam(data.teamKey, teamFromKey(data.teamKey), data.filters, data.picks, (share) => {
      if (share - sent < 0.01)
        return;
      sent = share;
      ctx2.postMessage({ id: data.id, share });
    });
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
  hitsOf,
  runTeam,
  runFromScore,
  substatLines,
  ALL_TEAMS,
  teamKey,
  teamAt,
  member,
  AXES,
  scopedKey,
  weaponBase,
  gateOf,
  scopedOpen,
  axisUsed,
  compares,
  echoLines,
  echoLabel,
  defaultFilters,
  axisOpen,
  filterSignature,
  bestKey,
  picksKey,
  comboOf,
  grantToOne,
  topRank,
  refineLevels,
  sequenceLevels,
  hasBuild,
  isSignature,
  standardWeapon,
  weaponOptions,
  sigForAll,
  sigAllowed,
  sigHolder,
  eligibleWeapons,
  optimizeTeam,
  teamFromKey,
  MAINSTAT_ROWS,
  solveTeam,
  isProgress
};
