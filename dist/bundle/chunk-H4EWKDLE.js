// dist/src/engine/wasm.js
async function load() {
  const url = new URL("../engine.wasm", import.meta.url);
  let module;
  if (typeof process !== "undefined" && process.versions?.node) {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { existsSync } = await import("node:fs");
    const deeper = new URL("../../engine.wasm", import.meta.url);
    const path = existsSync(fileURLToPath(url)) ? url : deeper;
    module = await WebAssembly.instantiate(await readFile(fileURLToPath(path)), {});
  } else {
    module = await WebAssembly.instantiateStreaming(fetch(url), {});
  }
  return module.instance.exports;
}
var engine = await load();
var encoder = new TextEncoder();
var decoder = new TextDecoder();
function call(request) {
  const bytes = encoder.encode(JSON.stringify(request));
  const p = engine.alloc(bytes.length);
  new Uint8Array(engine.memory.buffer, p, bytes.length).set(bytes);
  engine.call(p, bytes.length);
  engine.dealloc(p, bytes.length);
  const reply = JSON.parse(decoder.decode(new Uint8Array(engine.memory.buffer, engine.reply_ptr(), engine.reply_len())));
  if (reply && typeof reply === "object" && "error" in reply)
    throw new Error(`engine: ${reply.error}`);
  return reply;
}

// dist/src/mirror/gear.js
var Gear = class {
  id;
  name;
  kind;
  hidden;
  maxStacks;
  /** Its constant stat lines (a piece's `stats` and `constantStats`), in the order they add. */
  lines;
  /** What the TS def declared: its stat lines (the loadout hovers read these). */
  decl;
  constructor(j) {
    this.id = j.id;
    this.name = j.name;
    this.kind = j.kind;
    this.hidden = j.hidden;
    this.maxStacks = j.maxStacks;
    this.lines = j.lines;
    this.decl = { stats: j.lines };
  }
  toString() {
    return this.name;
  }
};
var Buff = class extends Gear {
};
var Weapon = class extends Gear {
  weaponType;
  tier;
  refinement;
  constructor(j) {
    super(j);
    this.weaponType = j.weapon.weaponType;
    this.tier = j.weapon.tier;
    this.refinement = j.weapon.refinement;
  }
};
var Sonata = class extends Gear {
  sonata2pcId;
  constructor(j) {
    super(j);
    this.sonata2pcId = j.sonata2pc;
  }
  get sonata2pc() {
    return gearById(this.sonata2pcId);
  }
};
var Mainslot = class extends Gear {
};
var Matrix = class extends Gear {
};
var Sequence = class extends Gear {
};
var ResonanceMode = class extends Gear {
};
var Resonator = class extends Gear {
  element;
  color;
  tier;
  weapon;
  maxEnergy;
  maxForte;
  ids;
  constructor(j) {
    super(j);
    const r = j.resonator;
    this.element = r.element;
    this.color = r.color;
    this.tier = r.tier;
    this.weapon = r.weapon;
    this.maxEnergy = r.maxEnergy;
    this.maxForte = r.maxForte;
    this.ids = { talent: r.talent, inherent1: r.inherent1, inherent2: r.inherent2, matrix: r.matrix };
  }
  get talent() {
    return this.ids.talent === null ? void 0 : gearById(this.ids.talent);
  }
  get inherent1() {
    return this.ids.inherent1 === null ? void 0 : gearById(this.ids.inherent1);
  }
  get inherent2() {
    return this.ids.inherent2 === null ? void 0 : gearById(this.ids.inherent2);
  }
  get matrix() {
    return this.ids.matrix === null ? void 0 : gearById(this.ids.matrix);
  }
};
var GEARS = /* @__PURE__ */ new Map();
var BREAKDOWNS = /* @__PURE__ */ new Map();
function addGear(j) {
  const seen = GEARS.get(j.id);
  if (seen)
    return seen;
  const make = () => {
    switch (j.kind) {
      case "Weapon":
        return new Weapon(j);
      case "Sonata":
        return new Sonata(j);
      case "Mainslot":
        return new Mainslot(j);
      case "Matrix":
        return new Matrix(j);
      case "Sequence":
        return new Sequence(j);
      case "ResonanceMode":
        return new ResonanceMode(j);
      case "Resonator":
        return new Resonator(j);
      case "Buff":
      case "Debuff":
        return new Buff(j);
      default:
        return new Gear(j);
    }
  };
  const g = make();
  GEARS.set(j.id, g);
  if (j.breakdown) {
    BREAKDOWNS.set(j.id, j.breakdown.map(([name, stats], k) => new Buff({ id: -1 - k, name, kind: "Buff", hidden: false, maxStacks: 1, lines: stats })));
  }
  return g;
}
function gearById(id) {
  const g = GEARS.get(id);
  if (!g)
    throw new Error(`no Gear #${id} mirrored`);
  return g;
}
var breakdownOf = (piece) => BREAKDOWNS.get(piece.id) ?? [];
var baseSequence = (r) => ({ [
  0
  /* Tier.Limited */
]: 0, [
  1
  /* Tier.Standard */
]: 0, [
  2
  /* Tier.Free */
]: 6, [
  3
  /* Tier.FreeS2 */
]: 2 })[r.tier];
var EchoLoadout = class {
  mainslot;
  sonata;
  sets;
  constructor(j) {
    this.mainslot = gearById(j.mainslot);
    this.sonata = gearById(j.sonata);
    this.sets = j.sets.map(gearById);
  }
  pieces() {
    return [this.mainslot, ...this.sets, ...this.sonata instanceof Sonata ? [this.sonata.sonata2pc] : []];
  }
};
var ErSpread = class {
  tiers;
  noEr;
  constructor(j) {
    this.tiers = j.tiers.map(([rolls, piece]) => ({ rolls, piece: gearById(piece) }));
    this.noEr = j.noEr === null ? null : gearById(j.noEr);
  }
  at(rolls) {
    return (this.tiers.find((t) => t.rolls >= rolls) ?? this.tiers[this.tiers.length - 1]).piece;
  }
};
var Loadout = class {
  /** The TS export this loadout was (`SHOREKEEPER`): what the roster and the engine name it by. */
  export;
  resonator;
  weapons;
  refinements;
  echoLoadouts;
  mainstats;
  substat;
  highSubstat;
  sequences;
  minSequence;
  mode;
  constructor(j) {
    this.export = j.export;
    this.resonator = gearById(j.resonator);
    this.refinements = j.refinements.map((w) => w.map((g) => gearById(g)));
    this.weapons = this.refinements.map((w) => w[0]);
    this.echoLoadouts = j.echoLoadouts.map((e) => new EchoLoadout(e));
    this.mainstats = j.mainstats.map((g) => gearById(g));
    this.substat = new ErSpread(j.substat);
    this.highSubstat = new ErSpread(j.highSubstat);
    this.sequences = j.sequences.map(gearById);
    this.minSequence = j.minSequence;
    this.mode = j.mode === null ? void 0 : gearById(j.mode);
  }
  /** The substat piece this build wears at `erRolls` ER rolls. */
  spread(highSubs, erRolls) {
    if (!highSubs)
      return this.substat.at(erRolls);
    return this.resonator.maxEnergy ? this.highSubstat.at(erRolls) : this.highSubstat.noEr ?? this.highSubstat.at(0);
  }
  /** Every piece one combo equips, in equip order. */
  pieces(weapon, echo, mainstat, sequenceLevel, matrix = false, highSubs = false, erRolls = 1) {
    const r = this.resonator;
    return [
      r,
      r.talent,
      r.inherent1,
      r.inherent2,
      weapon,
      ...echo.pieces(),
      mainstat,
      this.spread(highSubs, erRolls),
      ...this.sequences.slice(0, sequenceLevel),
      this.mode,
      matrix ? r.matrix : void 0
    ].filter((g) => g != null);
  }
};
var META = call({ op: "meta" });
for (const j of META.gears)
  addGear(j);
var LOADOUTS = Object.fromEntries(META.loadouts.map((j) => [j.export, new Loadout(j)]));
var ENEMY = gearById(META.enemy);
var BASE_RESISTANCE_GEAR = gearById(META.baseResistance);
var PENDING = META.pending;

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
  ]: "Offtune Buildup",
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
var TYPE_BITS = 63 << 12;
var SUBTYPE_BITS = 63 << 18;
var TAG_BITS = ATTRIBUTE_BITS | TYPE_BITS | SUBTYPE_BITS;
if (STAT_COUNT > STAT_BITS + 1)
  throw new Error("stats.ts: more stats than fit in the six-bit stat field");
var tagKind = (tag) => tag & SUBTYPE_BITS ? 3 : tag & TYPE_BITS ? 2 : 1;
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
    /* Type.Basic */
  ]: "Basic",
  [
    8192
    /* Type.Heavy */
  ]: "Heavy",
  [
    12288
    /* Type.Skill */
  ]: "Skill",
  [
    16384
    /* Type.Liberation */
  ]: "Liberation",
  [
    20480
    /* Type.Intro */
  ]: "Intro",
  [
    24576
    /* Type.Outro */
  ]: "Outro",
  [
    28672
    /* Type.Echo */
  ]: "Echo",
  [
    32768
    /* Type.Status */
  ]: "Status",
  [
    36864
    /* Type.Break */
  ]: "Tune Break",
  [
    40960
    /* Type.Rupture */
  ]: "Tune Rupture",
  [
    49152
    /* Type.Hack */
  ]: "Tune Hack",
  [
    53248
    /* Type.Utility */
  ]: "Utility",
  [
    262144
    /* Subtype.Coordinated */
  ]: "Coordinated",
  [
    524288
    /* Subtype.SpectroFrazzle */
  ]: "Spectro Frazzle",
  [
    786432
    /* Subtype.AeroErosion */
  ]: "Aero Erosion",
  [
    1048576
    /* Subtype.FusionBurst */
  ]: "Fusion Burst",
  [
    1310720
    /* Subtype.GlacioChafe */
  ]: "Glacio Chafe",
  [
    1572864
    /* Subtype.ElectroFlare */
  ]: "Electro Flare"
};
var scopedStat = (tag, stat) => stat | tag;
var splitStat = (key) => [key & STAT_BITS, key & TAG_BITS || null];
var INSTA_DELAY = 6;
var EASY_DELAY = 6;
var CANCEL_DELAY = 12;
var ActionTag;
(function(ActionTag2) {
  ActionTag2["Default"] = "";
  ActionTag2["Field"] = "field";
  ActionTag2["Cancel"] = "cancel";
  ActionTag2["EasyCancel"] = "easy cancel";
  ActionTag2["DodgeCancel"] = "dodge cancel";
  ActionTag2["JumpCancel"] = "jump cancel";
  ActionTag2["SwapCancel"] = "swap cancel";
  ActionTag2["InstaCancel"] = "instant cancel";
  ActionTag2["InstaDodge"] = "instant dodge";
  ActionTag2["InstaJump"] = "instant jump";
  ActionTag2["InstaSwap"] = "instant swap";
  ActionTag2["HitCancel"] = "cancel on hit";
  ActionTag2["DodgeOnHit"] = "dodge on hit";
  ActionTag2["JumpOnHit"] = "jump on hit";
})(ActionTag || (ActionTag = {}));
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

// dist/src/mirror/rotation.js
var ACTIONS = /* @__PURE__ */ new Map();
var FIELDS = /* @__PURE__ */ new Map();
var Action = class {
  id;
  gear;
  name;
  cast;
  subcast;
  node;
  scaling;
  mv;
  energy;
  concerto;
  offtune;
  castEnergy;
  castConcerto;
  castForte;
  forte1;
  forte2;
  forte3;
  forte4;
  forte5;
  resetForte;
  resetEnergy;
  bullets;
  animFrames;
  prioFrames;
  qteFrames;
  timestop;
  motionStop;
  tag;
  half;
  hitsAtCast;
  onHitAt;
  field;
  links;
  constructor(j) {
    this.id = j.id;
    this.gear = j.gear;
    this.name = j.name;
    this.cast = j.cast;
    this.subcast = j.subcast;
    this.node = j.node;
    this.scaling = j.scaling;
    this.mv = j.mv;
    this.energy = j.energy;
    this.concerto = j.concerto;
    this.offtune = j.offtune;
    this.castEnergy = j.castEnergy;
    this.castConcerto = j.castConcerto;
    this.castForte = j.castForte;
    [this.forte1, this.forte2, this.forte3, this.forte4, this.forte5] = j.forte;
    this.resetForte = j.resetForte;
    this.resetEnergy = j.resetEnergy;
    this.bullets = j.bullets.map((b) => ({
      hitFrame: b.hitFrame,
      commitFrame: b.commitFrame,
      mv: b.mv,
      energy: b.energy,
      concerto: b.concerto,
      offtune: b.offtune,
      forte1: b.forte[0],
      forte2: b.forte[1],
      forte3: b.forte[2],
      forte4: b.forte[3],
      forte5: b.forte[4],
      element: b.element,
      type: b.type,
      subtype: b.subtype
    }));
    this.animFrames = j.animFrames;
    this.prioFrames = j.prioFrames;
    this.qteFrames = j.qteFrames;
    this.timestop = j.timestop;
    this.motionStop = j.motionStop;
    this.tag = j.tag;
    this.half = j.half;
    this.hitsAtCast = j.hitsAtCast;
    this.onHitAt = j.onHitAt;
    this.field = j.field === null ? null : FIELDS.get(j.field) ?? (FIELDS.set(j.field, { name: j.field }), FIELDS.get(j.field));
    this.links = { cancelOf: j.cancelOf, formOf: j.formOf, castPart: j.castPart };
  }
  get lastBullet() {
    return this.bullets[this.bullets.length - 1] ?? null;
  }
  get cancelOf() {
    return this.links.cancelOf === null ? null : actionById(this.links.cancelOf);
  }
  get formOf() {
    return this.links.formOf === null ? null : actionById(this.links.formOf);
  }
  /** Where a cancel cuts this press: its last bullet committed, and never inside its priority. */
  get cutFrame() {
    let at = this.prioFrames;
    for (const b of this.bullets)
      at = Math.max(at, b.commitFrame);
    return at;
  }
  /** The cast of a press whose hits were queued. */
  castPart() {
    return this.links.castPart === null ? this : actionById(this.links.castPart);
  }
  /** rotation.ts's cancelCost: what the clock charged this press cut short by `cut`. */
  cost(cut) {
    const full = this.animFrames;
    const tag = cut ?? this.tag;
    const insta = tag === ActionTag.InstaCancel || tag === ActionTag.InstaDodge || tag === ActionTag.InstaJump || tag === ActionTag.InstaSwap;
    const whole = this.half === "cast" ? this.formOf ?? this : this;
    const action = tag === ActionTag.Default ? full : tag === ActionTag.Field || insta ? 0 : Math.min(whole.onHitAt ?? whole.cutFrame, full);
    const timestop = Math.min(this.timestop, action);
    const global = tag === ActionTag.InstaSwap || tag === ActionTag.SwapCancel ? 0 : insta ? INSTA_DELAY : tag === ActionTag.EasyCancel ? EASY_DELAY : tag === ActionTag.Cancel || tag === ActionTag.DodgeCancel || tag === ActionTag.JumpCancel || tag === ActionTag.HitCancel || tag === ActionTag.DodgeOnHit || tag === ActionTag.JumpOnHit ? CANCEL_DELAY : 0;
    return { action, timestop, global, total: action - timestop + global };
  }
};
function addAction(j) {
  let a = ACTIONS.get(j.id);
  if (!a)
    ACTIONS.set(j.id, a = new Action(j));
  return a;
}
function actionById(id) {
  const a = ACTIONS.get(id);
  if (!a)
    throw new Error(`no Action #${id} mirrored`);
  return a;
}
var teamPlayable = (loadouts) => call({ op: "teamPlayable", members: loadouts.map((l) => l.export) });

// dist/src/mirror/damage.js
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
var resOf = (stats, notDot, enemyRes) => (enemyRes / 100 - stats[
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
      noCrit: Math.floor(action.mv),
      crit: Math.floor(action.mv),
      avg: Math.floor(action.mv)
    };
  }
  const notDot = scaling !== 3 ? 1 : 0;
  const notTune = scaling !== 4 ? 1 : 0;
  const finalStat = Math.floor(scaling === 0 ? snapshot.atk : scaling === 1 ? snapshot.hp : scaling === 2 ? snapshot.def : scaling === 3 ? LEVEL_90_DOT : scaling === 4 ? LEVEL_90_TUNE : NaN);
  const finalMv = mvPercent(snapshot) / 100;
  const ampFactor = 1 + (notDot ? snapshot.amp : snapshot.subtypeAmp) / 100 * notTune;
  const bonusFactor = 1 + snapshot.dmgBonus / 100 * notDot * notTune;
  const tbbFactor = 1 + snapshot.stats[
    12
    /* Stat.Tbb */
  ] / 100 * (1 - notTune);
  const resFactor = resFactorOf(snapshot);
  const defFactor = defFactorOf(snapshot);
  const dealtFactor = 1 + (notDot ? s(
    19
    /* Stat.TotalDmg */
  ) : snapshot.subtypeTotalDmg / 100);
  const takenFactor = 1 + (notDot ? s(
    20
    /* Stat.DamageTaken */
  ) : snapshot.subtypeDamageTaken / 100);
  const special = !(notDot * notTune);
  const critMult = special ? snapshot.subtypeCritDmg ? snapshot.subtypeCritDmg / 100 : 1 : s(
    10
    /* Stat.CritDmg */
  );
  const cr = special ? snapshot.subtypeCritRate / 100 : s(
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
    noCrit: Math.floor(noCrit),
    crit: Math.floor(noCrit * critMult),
    avg: Math.floor(noCrit * critFactor)
  };
}
var foldStat = (stats, base, bonus, flat) => {
  const b = Math.floor(stats[base]);
  return b + Math.floor(b * stats[bonus] / 100) + stats[flat];
};

// dist/src/mirror/teamrun.js
var hitsOf = (line) => line.members?.length ? line.members : [line.snap];
var pickOf = (c) => {
  const [w, e, m, s, r, ...rest] = c.key.split(".");
  return { weapon: +w, echo: +e, mainstat: +m, sequence: +s.slice(1), refine: +r.slice(1), matrix: rest.includes("m"), highSubs: rest.includes("h") };
};
var slots = (s) => new Map(s);
var variantOf = (v) => ({
  total: v.total,
  bySlot: slots(v.bySlot),
  sectionTotals: v.sectionTotals,
  sectionBySlot: v.sectionBySlot.map(slots),
  fightTotal: v.fightTotal,
  fightBySlot: slots(v.fightBySlot),
  seconds: v.seconds,
  unsafe: v.unsafe
});
function snapshotOf(r, fields) {
  const t = r.trace;
  const stats = t.stats;
  const snap = {
    action: actionById(r.action),
    member: r.member,
    slot: r.slot,
    triggered: r.triggered,
    source: r.source,
    queued: r.queued,
    variantAvg: r.variantAvg,
    mv: r.mv,
    avg: r.avg,
    starts: r.starts,
    ends: r.ends,
    castGain: t.castGain,
    stat: (k) => stats[k],
    stats,
    atk: foldStat(
      stats,
      0,
      6,
      3
      /* Stat.FlatAtk */
    ),
    hp: foldStat(
      stats,
      1,
      7,
      4
      /* Stat.FlatHp */
    ),
    def: foldStat(
      stats,
      2,
      8,
      5
      /* Stat.FlatDef */
    ),
    amp: stats[
      18
      /* Stat.Amp */
    ],
    dmgBonus: stats[
      17
      /* Stat.DmgBonus */
    ],
    subtypeAmp: stats[37],
    subtypeCritRate: stats[39],
    subtypeCritDmg: stats[40],
    subtypeTotalDmg: stats[41],
    subtypeDamageTaken: stats[42],
    enemyRes: 0,
    enemyDef: 792 + 8 * 100,
    entries: t.entries.map(([stat, value, source, owner, gear]) => ({ stat, value, source, owner, gear: gear === null ? null : gearById(gear) })),
    castAdds: t.castAdds,
    type: t.type,
    forte: t.forte,
    forteBefore: t.forteBefore,
    maxForte: t.maxForte,
    energy: t.energy,
    concerto: t.concerto,
    offtune: t.offtune,
    energyBefore: t.energyBefore,
    concertoBefore: t.concertoBefore,
    offtuneBefore: t.offtuneBefore,
    concertoShort: t.concertoShort,
    forteShort: t.forteShort,
    energyWiped: t.energyWiped,
    realEnergyBefore: t.realEnergyBefore,
    frame: t.frame,
    frames: t.frames,
    tag: t.tag,
    active: t.active,
    timestopBanked: t.timestopBanked,
    heldLocal: t.heldLocal,
    heldGlobal: t.heldGlobal,
    heldEnemy: t.heldEnemy,
    opensFields: t.opensFields.map((f) => fields.get(f) ?? (fields.set(f, { name: f }), fields.get(f)))
  };
  if (r.hitAt !== null)
    snap.hitAt = r.hitAt;
  if (r.swapFrames !== null)
    snap.swapFrames = r.swapFrames;
  return snap;
}
function linesOf(tr) {
  for (const g of tr.gears)
    addGear(g);
  for (const a of tr.actions)
    addAction(a);
  const fields = /* @__PURE__ */ new Map();
  for (const a of tr.actions) {
    const field = actionById(a.id).field;
    if (field)
      fields.set(field.name, field);
  }
  const snaps = /* @__PURE__ */ new Map();
  const snap = (i) => {
    let s = snaps.get(i);
    if (!s)
      snaps.set(i, s = snapshotOf(tr.rows[i], fields));
    return s;
  };
  const lines = tr.lines.map((sec) => sec.map((l) => {
    const line = {
      id: l.id,
      isChain: l.isChain,
      snap: snap(l.snap),
      mv: l.mv,
      avg: l.avg,
      parts: l.parts.map((p) => ({ snap: snap(p), dmg: { avg: snap(p).avg } })),
      spill: l.spill
    };
    if (l.members.length)
      line.members = l.members.map(snap);
    if (l.aggregate)
      line.aggregate = true;
    if (l.fieldKey !== null)
      line.fieldKey = l.fieldKey;
    return line;
  }));
  const state = {
    grantedBy: new Map(tr.grantedBy.map(([k, v]) => [gearById(k), gearById(v)])),
    grantedOn: new Map(tr.grantedOn.map(([k, v]) => [gearById(k), v]))
  };
  return { lines, state };
}
function runTeam(teamKey2, members, combo, trace = false, variants = null) {
  const reply = call({
    op: "runTeam",
    team: teamKey2,
    members: members.map((m) => m.loadout.export),
    combo: combo.map(pickOf),
    trace,
    variants: variants && variants.map((alts) => alts && alts.map(pickOf))
  });
  const traced = reply.traced ? linesOf(reply.traced) : null;
  return {
    state: traced ? traced.state : null,
    teamKey: teamKey2,
    members,
    combo,
    rotationLines: traced ? traced.lines : null,
    total: reply.total,
    bySlot: slots(reply.bySlot),
    sectionTotals: reply.sectionTotals,
    sectionBySlot: reply.sectionBySlot.map(slots),
    fightTotal: reply.fightTotal,
    fightBySlot: slots(reply.fightBySlot),
    seconds: reply.seconds,
    sectionSeconds: reply.sectionSeconds,
    variantRuns: reply.variantRuns.map((vs) => vs.map(variantOf))
  };
}
function erRollsFor(teamKey2, members, combo) {
  return call({ op: "erRollsFor", team: teamKey2, members: members.map((m) => m.loadout.export), combo: combo.map(pickOf) });
}
var scoreOf = (run) => ({
  total: run.total,
  bySlot: [...run.bySlot],
  sectionTotals: run.sectionTotals,
  sectionBySlot: run.sectionBySlot.map((by) => [...by]),
  fightTotal: run.fightTotal,
  fightBySlot: [...run.fightBySlot],
  seconds: run.seconds,
  sectionSeconds: run.sectionSeconds
});
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
  sectionBySlot: score.sectionBySlot.map((by) => new Map(by)),
  fightTotal: score.fightTotal ?? score.total * 120 / 26,
  fightBySlot: new Map(score.fightBySlot ?? score.bySlot.map(([slot, v]) => [slot, v * 120 / 26])),
  seconds: score.seconds ?? score.sectionTotals.reduce((a, b) => a + b, 0) * 26 / Math.max(1, score.total),
  sectionSeconds: score.sectionSeconds ?? score.sectionTotals.map(() => (score.seconds ?? 0) / Math.max(1, score.sectionTotals.length))
});

// dist/src/teams.js
var CARTETHYIA = LOADOUTS["CARTETHYIA"];
var CAMELLYA_123_ALWAYS = LOADOUTS["CAMELLYA_123_ALWAYS_OUTRO"];
var CAMELLYA_DOUBLE_123S6 = LOADOUTS["CAMELLYA_DOUBLE_123S6"];
var CAMELLYA_DOUBLE_ALWAYS = LOADOUTS["CAMELLYA_DOUBLE_ALWAYS"];
var CIACCONA = LOADOUTS["CIACCONA"];
var IUNO = LOADOUTS["IUNO"];
var IUNO_MDPS = LOADOUTS["IUNO_MDPS"];
var JIANXIN = LOADOUTS["JIANXIN"];
var JIYAN = LOADOUTS["JIYAN"];
var QINGXIAO = LOADOUTS["QINGXIAO"];
var QIUYUAN = LOADOUTS["QIUYUAN"];
var QIUYUAN_MDPS = LOADOUTS["QIUYUAN_MDPS"];
var ROVER_AERO = LOADOUTS["ROVER_AERO"];
var SIGRIKA_EXTEND = LOADOUTS["SIGRIKA"];
var SIGRIKA_FAST = LOADOUTS["SIGRIKA_FAST"];
var AUGUSTA = LOADOUTS["AUGUSTA"];
var BULING = LOADOUTS["BULING"];
var HSIN_FLARE = LOADOUTS["HSIN_FLARE"];
var HSIN_UNISON = LOADOUTS["HSIN_UNISON"];
var REBECCA = LOADOUTS["REBECCA"];
var ROVER_ELECTRO = LOADOUTS["ROVER_ELECTRO"];
var ROVER_ELECTRO_MDPS = LOADOUTS["ROVER_ELECTRO_MDPS"];
var SUOMING = LOADOUTS["SUOMING"];
var SUOMING_MDPS = LOADOUTS["SUOMING_MDPS"];
var SUOMING_MDPS_DOUBLE = LOADOUTS["SUOMING_MDPS_DOUBLE"];
var XIANGLI_YAO = LOADOUTS["XIANGLI_YAO"];
var YINLIN = LOADOUTS["YINLIN"];
var AEMEATH_BURST = LOADOUTS["AEMEATH_BURST"];
var AEMEATH_RUPTURE = LOADOUTS["AEMEATH_RUPTURE"];
var BRANT = LOADOUTS["BRANT"];
var BRANT_MDPS = LOADOUTS["BRANT_MDPS"];
var CHANGLI = LOADOUTS["CHANGLI"];
var DENIA_BURST = LOADOUTS["DENIA_BURST"];
var DENIA_STRAIN = LOADOUTS["DENIA_STRAIN"];
var ENCORE = LOADOUTS["ENCORE"];
var GALBRENA = LOADOUTS["GALBRENA"];
var JINGRAN = LOADOUTS["JINGRAN"];
var LUPA = LOADOUTS["LUPA"];
var MORNYE = LOADOUTS["MORNYE"];
var MORTEFI = LOADOUTS["MORTEFI"];
var CARLOTTA = LOADOUTS["CARLOTTA"];
var HIYUKI = LOADOUTS["HIYUKI"];
var LUCILLA = LOADOUTS["LUCILLA"];
var LUCILLA_CHAFE = LOADOUTS["LUCILLA_CHAFE"];
var SANHUA = LOADOUTS["SANHUA"];
var SUISUI = LOADOUTS["SUISUI"];
var ZHEZHI = LOADOUTS["ZHEZHI"];
var CANTARELLA = LOADOUTS["CANTARELLA"];
var CANTARELLA_MDPS = LOADOUTS["CANTARELLA_MDPS"];
var CHISA = LOADOUTS["CHISA"];
var DANJIN = LOADOUTS["DANJIN"];
var PHRO_12s = LOADOUTS["PHRO_12s"];
var PHRO_10s = LOADOUTS["PHRO_10s"];
var ROCCIA = LOADOUTS["ROCCIA"];
var ROCCIA_MDPS = LOADOUTS["ROCCIA_MDPS"];
var ROVER_HAVOC = LOADOUTS["ROVER_HAVOC"];
var XUANLING = LOADOUTS["XUANLING"];
var JINHSI = LOADOUTS["JINHSI"];
var JINHSI_SUPPORT = LOADOUTS["JINHSI_SUPPORT"];
var LUCY = LOADOUTS["LUCY"];
var LUUK = LOADOUTS["LUUK"];
var LUUK_16s = LOADOUTS["LUUK_16s"];
var LYNAE_RUPTURE = LOADOUTS["LYNAE_RUPTURE"];
var LYNAE_STRAIN = LOADOUTS["LYNAE_STRAIN"];
var PHOEBE_ABSOLUTION = LOADOUTS["PHOEBE_ABSOLUTION"];
var PHOEBE_CONFESSION = LOADOUTS["PHOEBE_CONFESSION"];
var ROVER_SPECTRO = LOADOUTS["ROVER_SPECTRO"];
var SHOREKEEPER = LOADOUTS["SHOREKEEPER"];
var VERINA = LOADOUTS["VERINA"];
var ZANI = LOADOUTS["ZANI"];
var INTERCHANGEABLE = /* @__PURE__ */ new Set([SHOREKEEPER, MORNYE, SUISUI, BULING, VERINA]);
var TEAMS = [
  // suoming mdps, electro basic unison
  [[SHOREKEEPER], [JINHSI_SUPPORT], SUOMING_MDPS],
  [[SHOREKEEPER, VERINA, MORNYE], [SANHUA], SUOMING_MDPS_DOUBLE],
  [[SHOREKEEPER, VERINA, MORNYE], [SANHUA], SUOMING_MDPS],
  [[SHOREKEEPER, VERINA, MORNYE], [JINHSI_SUPPORT], SUOMING_MDPS],
  [[MORNYE, SHOREKEEPER, VERINA], [LYNAE_RUPTURE, REBECCA], SUOMING_MDPS],
  // hsin, Unison mode: Suoming or Jinhsi behind her hands over the Unison her Intro answers
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [SUOMING], HSIN_UNISON],
  [[BULING], [SUOMING], HSIN_UNISON],
  [[SUOMING], HSIN_UNISON, [JINHSI_SUPPORT]],
  // hsin (Electro Flare mode): electro skill flare
  [[SUISUI, CHISA, SHOREKEEPER, MORNYE, VERINA], [ROVER_ELECTRO, CHISA], HSIN_FLARE],
  [[BULING], [CHISA, ROVER_ELECTRO], HSIN_FLARE],
  [[SUISUI], [BULING], HSIN_FLARE],
  [[SUISUI, MORNYE, SHOREKEEPER, VERINA], [LYNAE_RUPTURE, REBECCA], HSIN_FLARE],
  [[BULING], [LYNAE_RUPTURE, REBECCA], HSIN_FLARE],
  // jinhsi: spectro skill
  [[SHOREKEEPER, MORNYE, SUISUI, VERINA, BULING], [ZHEZHI, CANTARELLA, SUOMING, YINLIN], JINHSI],
  [[SHOREKEEPER, MORNYE, SUISUI, VERINA, BULING], JINHSI, [HSIN_UNISON]],
  [[MORNYE], [LYNAE_RUPTURE], JINHSI],
  [[MORNYE], [REBECCA], JINHSI],
  // electro rover mdps: Apex Resonance, the Thrum of All Sounds chains
  [[MORNYE, SHOREKEEPER, CHISA, BULING, VERINA, SUISUI], [LYNAE_RUPTURE], ROVER_ELECTRO_MDPS],
  [[MORNYE], [REBECCA], ROVER_ELECTRO_MDPS],
  // jingran: fusion heavy shielder
  [[LUPA], [MORTEFI, BRANT], JINGRAN],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI, LUPA], [IUNO, MORTEFI], JINGRAN],
  [[MORNYE, SHOREKEEPER, VERINA, SUISUI, LUPA], [LUPA, REBECCA], JINGRAN],
  [[MORNYE], [LYNAE_RUPTURE], JINGRAN],
  // qingxiao: aero heavy/basic/liberation on tune strain
  [[MORNYE, SHOREKEEPER, VERINA, CIACCONA], [DENIA_STRAIN, LYNAE_STRAIN, CIACCONA, SANHUA, MORTEFI, REBECCA, JIANXIN], QINGXIAO],
  // xuanling: havoc heavy attack on Havoc Bane — Chisa's +3 to every Negative Status cap is what
  // takes Unbroken Vow off its 3-stack 30% tier onto the 4-6 stack 36% one
  [[SUISUI, CHISA, VERINA, SHOREKEEPER], [MORTEFI, REBECCA, IUNO, PHRO_10s, CHISA], XUANLING],
  // lucy: spectro heavy on tune hack, with rebecca feeding her the outro
  [[MORNYE, SHOREKEEPER, VERINA], [REBECCA, LYNAE_RUPTURE, MORTEFI], LUCY],
  // hiyuki: glacio chafe/bite — every stack the team lands calculates at the target's own limit,
  // which is why Chisa (+3 to it) and Lucilla's Chafe build stand behind her
  [[SUISUI], PHRO_10s, HIYUKI],
  [[SUISUI], CARLOTTA, HIYUKI],
  [PHRO_10s, [LUCILLA], HIYUKI],
  [HIYUKI, CARLOTTA, [LUCILLA_CHAFE]],
  [[SUISUI, CHISA, MORNYE, VERINA, SHOREKEEPER], [LUCILLA_CHAFE, LYNAE_RUPTURE, CHISA, JIANXIN, ROVER_ELECTRO], HIYUKI],
  // sigrika: aero + echo
  [[QIUYUAN], [LUCILLA], SIGRIKA_FAST],
  [[PHRO_10s], [QIUYUAN, LUCILLA], SIGRIKA_FAST],
  [[QIUYUAN], SIGRIKA_EXTEND, [IUNO]],
  [[MORNYE], [LYNAE_RUPTURE], SIGRIKA_FAST],
  [[CIACCONA], [QIUYUAN, LUCILLA], SIGRIKA_FAST],
  [[SHOREKEEPER, VERINA], [LUCILLA, CANTARELLA, ROVER_AERO], SIGRIKA_FAST],
  [[SHOREKEEPER, VERINA], [QIUYUAN, CIACCONA], SIGRIKA_EXTEND],
  // luuk: spectro basic, tune strain
  [[VERINA], [LYNAE_STRAIN], LUUK_16s],
  [[MORNYE, SHOREKEEPER, VERINA], [SANHUA, DENIA_STRAIN], LUUK_16s],
  [[MORNYE, SHOREKEEPER], [LYNAE_STRAIN], LUUK],
  // aemeath: fusion liberation on tune rupture — Mornye and Lynae answer the break beside her
  [[MORNYE, SHOREKEEPER, VERINA], [LYNAE_RUPTURE, CHANGLI, LUPA], AEMEATH_RUPTURE],
  [[MORNYE], [JIANXIN, DENIA_BURST], AEMEATH_RUPTURE],
  [[LUPA], [LYNAE_RUPTURE, CHANGLI, JIANXIN, BRANT], AEMEATH_RUPTURE],
  [[DENIA_BURST], [LYNAE_RUPTURE], AEMEATH_RUPTURE],
  // aemeath: fusion liberation on fusion burst — Denia's Burst mode feeds the stacks and amplifies
  [[SUISUI, CHISA], [DENIA_BURST], AEMEATH_BURST],
  [[DENIA_BURST], [LYNAE_RUPTURE, CHANGLI, LUPA], AEMEATH_BURST],
  [[LUPA], [CHANGLI, BRANT], AEMEATH_BURST],
  [[SUISUI, SHOREKEEPER, VERINA, DENIA_BURST, CHISA, MORNYE], [DENIA_BURST], AEMEATH_BURST],
  [[SUISUI, SHOREKEEPER, VERINA, LUPA, DENIA_BURST, CHISA], [LUPA, JIANXIN, ROVER_ELECTRO], AEMEATH_BURST],
  // qiuyuan: aero heavy echo
  [[SHOREKEEPER, VERINA, CIACCONA, MORNYE, SUISUI], [MORTEFI, IUNO, CIACCONA, LUCILLA], QIUYUAN_MDPS],
  [[MORNYE, SHOREKEEPER, VERINA, CIACCONA, SUISUI], [REBECCA, LYNAE_RUPTURE], QIUYUAN_MDPS],
  [[SHOREKEEPER, VERINA], PHRO_10s, QIUYUAN_MDPS],
  // galbrena: fusion echo and heavy
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI, LUPA], [BRANT, MORTEFI, IUNO, QIUYUAN, LUCILLA], GALBRENA],
  [[MORNYE, SHOREKEEPER, VERINA, SUISUI, DENIA_BURST], [LUPA], GALBRENA],
  [[MORNYE, SHOREKEEPER, VERINA, SUISUI, DENIA_BURST], [REBECCA], GALBRENA],
  [[MORNYE], [LYNAE_RUPTURE], GALBRENA],
  // iuno mdps: aero + echo
  [[CIACCONA], [JIANXIN], IUNO_MDPS],
  [[SHOREKEEPER, CIACCONA, VERINA, MORNYE, SUISUI], [CIACCONA, JIANXIN], IUNO_MDPS],
  [[MORNYE, SHOREKEEPER, CIACCONA, VERINA, SUISUI], [LYNAE_RUPTURE], IUNO_MDPS],
  // augusta: electro heavy shielder
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [IUNO, MORTEFI], AUGUSTA],
  [[MORNYE, SHOREKEEPER, VERINA, SUISUI], [REBECCA], AUGUSTA],
  [[MORNYE], [LYNAE_RUPTURE], AUGUSTA],
  // phrolova: havoc, echo, skill
  [PHRO_10s, [JINHSI_SUPPORT], [CANTARELLA]],
  [PHRO_10s, [QIUYUAN, LUCILLA, DANJIN], [LYNAE_RUPTURE, QIUYUAN, LUCILLA]],
  [PHRO_10s, [LYNAE_RUPTURE, DANJIN], [LUCILLA, QIUYUAN, CANTARELLA]],
  [PHRO_12s, [QIUYUAN, ROCCIA], [QIUYUAN, CANTARELLA]],
  [PHRO_12s, [SHOREKEEPER, BULING, MORNYE, SUISUI, VERINA], [QIUYUAN, DANJIN, LUCILLA, CANTARELLA, ROCCIA]],
  [PHRO_12s, [QIUYUAN, ROCCIA, DANJIN], [SHOREKEEPER, SUISUI, MORNYE, VERINA]],
  [PHRO_12s, [MORNYE], [LYNAE_RUPTURE]],
  // cartethyia: aero HP-scaling basic attack on Aero Erosion — Aero Rover and Chisa both raise the
  // status's own cap, which is what her Erosion ticks and her Blade's amplification both read
  [[CHISA, ROVER_AERO, CIACCONA], [SANHUA, ROVER_AERO], CARTETHYIA],
  [[ROVER_AERO, SUISUI, CHISA, CIACCONA, SHOREKEEPER, MORNYE], [SANHUA, ROVER_AERO, CHISA], CARTETHYIA],
  // zani: spectro frazzle heavy
  [[SHOREKEEPER, SUISUI, VERINA, MORNYE, ROVER_SPECTRO, CHISA], [PHOEBE_CONFESSION], ZANI],
  // phoebe - spectro frazzle heavy
  [[SHOREKEEPER, CHISA, SUISUI, VERINA, MORNYE], [ROVER_SPECTRO], PHOEBE_ABSOLUTION],
  [[ROVER_SPECTRO], [LYNAE_RUPTURE, MORTEFI, REBECCA], PHOEBE_ABSOLUTION],
  // brant: fusion basic
  [[SHOREKEEPER, DENIA_BURST, MORNYE, VERINA, SUISUI], [SANHUA, DENIA_BURST], BRANT_MDPS],
  [[MORNYE, SHOREKEEPER, DENIA_BURST, VERINA, SUISUI], [LUPA], BRANT_MDPS],
  [[LUPA], BRANT, CHANGLI],
  [[LUPA], BRANT, ENCORE],
  // cantarella: havoc basic, echo
  [[SHOREKEEPER], [SANHUA, ROCCIA], CANTARELLA_MDPS],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [SANHUA, ROCCIA], CANTARELLA_MDPS],
  [[MORNYE], [REBECCA], CANTARELLA_MDPS],
  [[MORNYE], [LYNAE_RUPTURE], CANTARELLA_MDPS],
  // carlotta: glacio skill
  [[SHOREKEEPER, BULING, VERINA, MORNYE, SUISUI], [BRANT, ZHEZHI, LUCILLA_CHAFE], CARLOTTA],
  [[MORNYE], [REBECCA], CARLOTTA],
  [[MORNYE], [LYNAE_RUPTURE], CARLOTTA],
  // roccia: havoc heavy
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [MORTEFI, IUNO], ROCCIA_MDPS],
  [[MORNYE, SHOREKEEPER, VERINA, SUISUI], [REBECCA], ROCCIA_MDPS],
  [[MORNYE], [LYNAE_RUPTURE], ROCCIA_MDPS],
  // camellya: havoc basic
  [[VERINA], [SANHUA], CAMELLYA_DOUBLE_ALWAYS],
  [[SHOREKEEPER], [SANHUA], CAMELLYA_DOUBLE_123S6],
  [[VERINA], [ROCCIA], CAMELLYA_DOUBLE_123S6],
  [[SHOREKEEPER], [ROCCIA], CAMELLYA_123_ALWAYS],
  [[MORNYE], [LYNAE_RUPTURE], CAMELLYA_123_ALWAYS],
  // xiangli yao: electro liberation
  [[SHOREKEEPER], [YINLIN], XIANGLI_YAO],
  [[SHOREKEEPER, VERINA, MORNYE, SUISUI], [YINLIN, JIANXIN], XIANGLI_YAO],
  [[MORNYE, SHOREKEEPER, VERINA, SUISUI], [LYNAE_RUPTURE], XIANGLI_YAO],
  // changli: fusion skill+liberation
  [[DENIA_BURST], [LUPA], CHANGLI],
  //[[MORNYE, LUPA, SHOREKEEPER, DENIA_BURST, VERINA, SUISUI], [LUPA], CHANGLI],
  //[[MORNYE, LUPA, SHOREKEEPER, DENIA_BURST, VERINA, SUISUI], [LYNAE_RUPTURE], CHANGLI],
  // jiyan: aero heavy
  [[CIACCONA], [IUNO], JIYAN],
  [[SHOREKEEPER, VERINA, CIACCONA, MORNYE, SUISUI], [MORTEFI, IUNO, CIACCONA, PHRO_10s], JIYAN],
  [[MORNYE, SHOREKEEPER, VERINA, CIACCONA, SUISUI], [REBECCA], JIYAN],
  [[MORNYE], [LYNAE_RUPTURE], JIYAN]
  // encore: fusion basic
  //[[SHOREKEEPER, VERINA, DENIA_BURST, LUPA], [LUPA, SANHUA, DENIA_BURST], ENCORE],
  //[[LUPA], ENCORE, [CHANGLI, BRANT]],
  // havoc rover: havoc, mixed
  //[[SHOREKEEPER, VERINA, MORNYE], [ROCCIA, DANJIN, SANHUA, LYNAE_RUPTURE, CANTARELLA], ROVER_HAVOC],
];
var UNPLAYABLE_TEAMS = [];
var LOADOUT_ID = /* @__PURE__ */ new Map();
var idOf = (l) => {
  const seen = LOADOUT_ID.get(l);
  if (seen !== void 0)
    return seen;
  LOADOUT_ID.set(l, LOADOUT_ID.size);
  return LOADOUT_ID.size - 1;
};
var EXPANDED = TEAMS.flatMap((slots2, from) => {
  const mdps = slots2.map((s) => !Array.isArray(s));
  const [a, b, c] = slots2.map((s) => (Array.isArray(s) ? [...new Set(s)] : [s]).filter((l) => l !== void 0));
  if (!mdps.some(Boolean)) {
    const names = [a, b, c].map((s) => s.map((l) => l.resonator.name).join("/")).join(", ");
    throw new Error(`the team [${names}] has no bare loadout naming its main DPS`);
  }
  return a.flatMap((x, i) => b.flatMap((y, j) => c.map((z, k) => ({
    loadouts: [x, y, z],
    mdps,
    from,
    lead: [[x, i], [y, j], [z, k]].find(([l]) => INTERCHANGEABLE.has(l))?.[1] ?? -1
  })))).filter((team) => new Set(team.loadouts.map((l) => l.resonator)).size === team.loadouts.length).filter((team) => {
    const names = team.loadouts.map((l) => l.resonator.name);
    const why = teamPlayable(team.loadouts);
    if (why)
      UNPLAYABLE_TEAMS.push({ names, why });
    return why === null;
  });
});
var skeleton = ({ loadouts, mdps }) => loadouts.map((l, i) => INTERCHANGEABLE.has(l) ? "*" : `${idOf(l)}${mdps[i] ? "m" : ""}`).join(".");
var FOLDED = /* @__PURE__ */ new Map();
var ALL_TEAMS = [...EXPANDED.reduce((by, team) => {
  const key = `${team.loadouts.map(idOf).join(".")}|${team.mdps.map(Number).join("")}`;
  const seen = by.get(key);
  if (!seen) {
    by.set(key, team);
    return by;
  }
  seen.lead = Math.min(seen.lead, team.lead);
  if (seen.from !== team.from)
    FOLDED.set(`${team.from}|${skeleton(team)}`, `${seen.from}|${skeleton(team)}`);
  return by;
}, /* @__PURE__ */ new Map()).values()];
if (UNPLAYABLE_TEAMS.length) {
  throw new Error(`teams.ts lists ${UNPLAYABLE_TEAMS.length} team(s) the scheduler can't play:
` + UNPLAYABLE_TEAMS.map((t) => `  ${t.names.join(" / ")} \u2014 ${t.why}`).join("\n"));
}
var SUPPORT_GROUP = ALL_TEAMS.map((team) => {
  let key = `${team.from}|${skeleton(team)}`;
  while (FOLDED.has(key))
    key = FOLDED.get(key);
  return key;
});
var PRIMARY_TEAM = ALL_TEAMS.map(() => false);
{
  const best = /* @__PURE__ */ new Map();
  ALL_TEAMS.forEach((team, i) => {
    const held = best.get(SUPPORT_GROUP[i]);
    if (!held || team.lead < held.lead)
      best.set(SUPPORT_GROUP[i], { lead: team.lead, index: i });
  });
  for (const { index } of best.values())
    PRIMARY_TEAM[index] = true;
}
var teamKey = (index) => `t${index}`;
var teamAt = (key) => /^t\d+$/.test(key) ? ALL_TEAMS[Number(key.slice(1))] : void 0;

// dist/src/solver.js
var loadoutName = (l) => l.mode ? `${l.resonator.name} (${l.mode.name.split(" ").pop()})` : l.resonator.name;
var member = (loadout, mainDps = false) => ({ name: loadout.resonator.name, color: loadout.resonator.color, loadout, mainDps });
var AXES = ["weapons", "echoes", "mainstats", "sequences", "refines", "substats"];
var TEAM_COSTS = [
  "s0r0",
  "s0r1mdps",
  "s0r1",
  "s2r1mdps",
  "s3r1mdps",
  "s6r1mdps",
  "s6r5"
];
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
  matrix: [],
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
var matrixOn = (m, filters) => m.loadout.resonator.matrix != null && filters.matrix.includes(m.loadout.resonator.name);
var filterSignature = (f) => [[...f.matrix].sort().join("+"), f.cost, ...AXES.map((a) => [...f[a]].sort().join("+")), f.scoped.map(scopedKey).sort().join("+")].join(",");
var bestKey = (teamKey2, members, filters) => {
  const scoped = (m) => {
    const own = filters.scoped.filter((s) => s.resonator === m.loadout.resonator.name).map((s) => `${s.on}~${s.value}~${s.axis}`).sort();
    return own.length ? `:${own.join(";")}` : "";
  };
  const one = (m) => (matrixOn(m, filters) ? "m" : "") + AXES.map((a) => axisOpen(m, filters, a) ? "1" : "0").join("") + scoped(m);
  return `${teamKey2}|${filters.cost}|${members.map(one).join(",")}`;
};
var picksKey = (teamKey2, members, filters) => `${teamKey2}|${filters.cost}|${members.map((m) => (matrixOn(m, filters) ? "m" : "") + (axisOpen(m, filters, "weapons") ? "1" : "0")).join("")}`;
var comboOf = (l, p) => {
  const matrix = p.matrix && l.resonator.matrix ? l.resonator.matrix : null;
  return {
    weapon: l.refinements[p.weapon][p.refine],
    echo: l.echoLoadouts[p.echo],
    mainstat: l.mainstats[p.mainstat],
    sequence: p.sequence,
    matrix,
    highSubs: p.highSubs,
    key: `${p.weapon}.${p.echo}.${p.mainstat}.s${p.sequence}.r${p.refine}${matrix ? ".m" : ""}${p.highSubs ? ".h" : ""}`,
    build: `${p.weapon}.${p.echo}.s${p.sequence}.r${p.refine}${matrix ? ".m" : ""}${p.highSubs ? ".h" : ""}`
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
function refineLevels(m, filters, p) {
  const ranks = m.loadout.refinements[p.weapon];
  if (compares(m, filters, "refines", gateOf(m.loadout, p)))
    return ranks.map((_, i) => i);
  return [axisOpen(m, filters, "sequences") ? 0 : Math.min(p.refine, ranks.length - 1)];
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
  const run = runTeam(teamKey2, members, combo, false, alts.map((a, i) => a && a.map((k) => comboOf(members[i].loadout, { ...picks[i], mainstat: k }))));
  trialCache.set(trialKey(teamKey2, combo), run);
  const out = /* @__PURE__ */ new Map();
  for (const i of who) {
    const scores = [];
    scores[picks[i].mainstat] = run;
    alts[i].forEach((k, v) => {
      const trial = picks.map((p, j) => j === i ? { ...p, mainstat: k } : p);
      const variant = run.variantRuns[i][v];
      if (variant.unsafe) {
        scores[k] = trialRun(teamKey2, members, trial);
        return;
      }
      const c = members.map((m, j) => comboOf(m.loadout, trial[j]));
      const scored = {
        state: run.state,
        teamKey: teamKey2,
        members,
        combo: c,
        rotationLines: null,
        variantRuns: [],
        total: variant.total,
        bySlot: variant.bySlot,
        sectionTotals: variant.sectionTotals,
        sectionBySlot: variant.sectionBySlot,
        fightTotal: variant.fightTotal,
        fightBySlot: variant.fightBySlot,
        seconds: variant.seconds,
        sectionSeconds: run.sectionSeconds
      };
      trialCache.set(trialKey(teamKey2, c), scored);
      scores[k] = scored;
    });
    out.set(i, scores);
  }
  return out;
}
function rankedMainstats(scores, m, fills) {
  const ranked = [];
  scores.forEach((run, k) => ranked.push({ mainstat: k, damage: run.bySlot.get(m.name) ?? 0, total: run.total }));
  ranked.sort((a, b) => b.total - a.total);
  const fit = ranked.filter((r) => fills(r.mainstat));
  return fit.length ? fit : ranked;
}
var mainstatFills = (teamKey2, members, picks, i) => (mainstat) => {
  const l = members[i].loadout;
  const combo = picks.map((p, j) => comboOf(members[j].loadout, j === i ? { ...p, mainstat } : p));
  return erRollsFor(teamKey2, members, combo)[i] <= l.substat.tiers[l.substat.tiers.length - 1].rolls;
};
function bestMainstats(teamKey2, members, picks, who) {
  const scores = scoreMainstats(teamKey2, members, picks, who);
  return picks.map((p, i) => {
    if (!who.includes(i))
      return p;
    const index = rankedMainstats(scores.get(i), members[i], mainstatFills(teamKey2, members, picks, i))[0]?.mainstat ?? p.mainstat;
    return index === p.mainstat ? p : { ...p, mainstat: index };
  });
}
function bestMainstatFor(teamKey2, members, picks, i) {
  const best = rankedMainstats(scoreMainstats(teamKey2, members, picks, [i]).get(i), members[i], mainstatFills(teamKey2, members, picks, i))[0];
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
      matrix: matrixOn(m, filters),
      highSubs: false
    };
  });
  const run = () => trialRun(teamKey2, members, picks);
  const canFill = (i, at) => {
    const l = members[i].loadout;
    const combo = picks.map((p, j) => comboOf(members[j].loadout, j === i ? at : p));
    return erRollsFor(teamKey2, members, combo)[i] <= l.substat.tiers[l.substat.tiers.length - 1].rolls;
  };
  members.forEach((m, i) => {
    if (canFill(i, picks[i]))
      return;
    const fix = m.loadout.echoLoadouts.findIndex((_, e) => canFill(i, { ...picks[i], echo: e }));
    if (fix >= 0)
      picks[i] = { ...picks[i], echo: fix };
  });
  const fillsAll = (trial) => {
    const rolls = erRollsFor(teamKey2, members, trial.map((p, j) => comboOf(members[j].loadout, p)));
    return rolls.every((r, j) => r <= members[j].loadout.substat.tiers[members[j].loadout.substat.tiers.length - 1].rolls);
  };
  const moved = (from, i, axis, option) => from.map((p, j) => {
    if (j !== i)
      return p;
    if (axis === "echo")
      return { ...p, echo: option };
    return { ...p, weapon: option, refine: Math.min(p.refine, members[i].loadout.refinements[option].length - 1) };
  });
  const optionsOf = (axis, i) => axis === "weapon" ? weaponOptions(members[i], filters, sig) : members[i].loadout.echoLoadouts.map((_, e) => e);
  const sweepMainstats = () => {
    const next = bestMainstats(teamKey2, members, picks, members.map((_, i) => i));
    const changed = next.some((p, i) => p.mainstat !== picks[i].mainstat);
    next.forEach((p, i) => {
      picks[i] = p;
    });
    return changed;
  };
  const everyone = members.map((_, k) => k);
  const rolled = (trial) => {
    const out = bestMainstats(teamKey2, members, trial, everyone);
    return { picks: out, total: trialRun(teamKey2, members, out).total };
  };
  const sweepAcross = (axis, options) => {
    let changed = false;
    let best = run().total;
    const gated = fillsAll(picks);
    for (let i = 0; i < members.length; i++) {
      let winner = null;
      for (const option of options(members[i])) {
        if (option === picks[i][axis])
          continue;
        const trial = rolled(moved(picks, i, axis, option));
        if (trial.total > best && (!gated || fillsAll(trial.picks))) {
          best = trial.total;
          winner = trial.picks;
          changed = true;
        }
      }
      if (winner)
        winner.forEach((p, k) => {
          picks[k] = p;
        });
    }
    return changed;
  };
  const sweepSettled = (axes) => {
    let best = run().total;
    let winner = null;
    const take = (trial, total) => {
      if (total <= best || !fillsAll(trial))
        return;
      best = total;
      winner = trial;
    };
    for (const axisI of axes) {
      for (const axisJ of axes) {
        for (let i = 0; i < members.length; i++) {
          for (let j = 0; j < members.length; j++) {
            if (i === j || axisI === axisJ && j < i)
              continue;
            for (const oi of optionsOf(axisI, i)) {
              for (const oj of optionsOf(axisJ, j)) {
                if (oi === picks[i][axisI] && oj === picks[j][axisJ])
                  continue;
                const trial = moved(moved(picks, i, axisI, oi), j, axisJ, oj);
                take(trial, trialRun(teamKey2, members, trial).total);
              }
            }
          }
        }
      }
    }
    if (!winner)
      return false;
    winner.forEach((p, i) => {
      picks[i] = p;
    });
    return true;
  };
  const converge = (weapons) => {
    const axes = weapons ? ["weapon", "echo"] : ["echo"];
    let bestTotal = fillsAll(picks) ? run().total : -Infinity;
    let bestPicks = picks.map((p) => ({ ...p }));
    for (let round = 0; round < 8; round++) {
      const w = weapons && sweepAcross("weapon", (m) => weaponOptions(m, filters, sig));
      const e = sweepAcross("echo", (m) => m.loadout.echoLoadouts.map((_, i) => i));
      if (!w && !e && !sweepSettled(axes))
        break;
      sweepMainstats();
      const total = run().total;
      if (total > bestTotal && fillsAll(picks)) {
        bestTotal = total;
        bestPicks = picks.map((p) => ({ ...p }));
      }
    }
    if (run().total < bestTotal)
      bestPicks.forEach((p, i) => {
        picks[i] = p;
      });
  };
  sweepMainstats();
  converge(true);
  if (filters.cost === "s0r1mdps") {
    let best = run().total, winner = null;
    members.forEach((m, i) => {
      if (!m.mainDps || !isSignature(m.loadout, 0))
        return;
      const trial = picks.map((p, j) => j === i ? { ...p, weapon: 0, refine: Math.min(p.refine, m.loadout.refinements[0].length - 1) } : p);
      const rerolled = bestMainstatFor(teamKey2, members, trial, i);
      if (!canFill(i, { ...trial[i], mainstat: rerolled.mainstat }))
        return;
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
    let best = run().total, winner = null;
    members.forEach((m, i) => {
      if (!m.mainDps)
        return;
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
  for (let pass = 0; pass < members.length; pass++) {
    let moved2 = false;
    members.forEach((m, i) => {
      if (canFill(i, picks[i]))
        return;
      let winner = null, best = -Infinity;
      m.loadout.echoLoadouts.forEach((_, echo) => {
        m.loadout.mainstats.forEach((_2, mainstat) => {
          const at = { ...picks[i], echo, mainstat };
          if (!canFill(i, at))
            return;
          const total = trialRun(teamKey2, members, picks.map((p, j) => j === i ? at : p)).total;
          if (total <= best)
            return;
          best = total;
          winner = at;
        });
      });
      if (!winner)
        return;
      picks[i] = winner;
      moved2 = true;
    });
    if (!moved2)
      break;
  }
  for (let i = 0; i < members.length; i++) {
    if (canFill(i, picks[i]))
      continue;
    const l = members[i].loadout;
    const rolls = erRollsFor(teamKey2, members, picks.map((p, j) => comboOf(members[j].loadout, p)))[i];
    const built = members.map((m, j) => `${m.name} s${picks[j].sequence}r${picks[j].refine + 1} ${m.loadout.refinements[picks[j].weapon][picks[j].refine].name.replace(/ R\d$/, "")}`).join(", ");
    throw new Error(`${members[i].name} on ${teamKey2} (${built}) cannot fill their Energy bar: ${rolls} ER rolls wanted, ${l.substat.tiers[l.substat.tiers.length - 1].rolls} is all a spread carries, and no ER 3-cost main stat is on their list`);
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
          for (const highSubs of subs) {
            picks.push({ ...at, refine, echo, highSubs });
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
  const homeCombo = members.map((m, i) => comboOf(m.loadout, best[i]));
  const builds = cartesian(members.map((m, i) => buildsOf(m, best[i], filters, sigAllowed(i, holder, filters.cost))));
  const seen = /* @__PURE__ */ new Map();
  for (const picks of builds) {
    const key = picks.map((p) => `${p.weapon}.${p.echo}.s${p.sequence}.r${p.refine}${p.highSubs ? ".h" : ""}`).join("-");
    if (!seen.has(key))
      seen.set(key, picks);
  }
  const isBest = (build) => build.every((p, i) => {
    const b = best[i];
    return p.weapon === b.weapon && p.echo === b.echo && p.sequence === b.sequence && p.refine === b.refine && p.highSubs === b.highSubs;
  });
  const rows = [];
  const baselines = /* @__PURE__ */ new Set();
  let built = 0;
  for (const build of seen.values()) {
    onProgress?.(built++ / seen.size);
    const settled = settle(!compared && isBest(build) ? build : pinEchoes(build));
    const twinOf = (i, change) => {
      const twin = settled.map((q, j) => j === i ? { ...q, ...change } : q);
      const key = twin.map((q) => `${q.weapon}.${q.echo}.s${q.sequence}.r${q.refine}${q.highSubs ? ".h" : ""}`).join("-");
      if (baselines.has(key))
        return;
      baselines.add(key);
      hidden.push(settle(twin));
    };
    members.forEach((m, i) => {
      const p = settled[i];
      const ranked = axisUsed(m, filters, "refines");
      if (axisOpen(m, filters, "sequences") && p.sequence !== sequenceLevels(m, filters)[0])
        twinOf(i, { sequence: sequenceLevels(m, filters)[0] });
      if (ranked && p.refine !== 0)
        twinOf(i, { refine: 0 });
      if (axisOpen(m, filters, "weapons") && m.loadout.weapons[p.weapon].tier === 0) {
        for (const w of eligibleWeapons(m, filters)) {
          if (m.loadout.weapons[w].tier === 0)
            continue;
          twinOf(i, { weapon: w, refine: ranked ? 0 : Math.min(p.refine, m.loadout.refinements[w].length - 1) });
        }
      }
      if (axisOpen(m, filters, "substats") && p.highSubs)
        twinOf(i, { highSubs: false });
    });
    const open = mainstatsOpen(settled);
    if (!open.length) {
      rows.push(settled);
      continue;
    }
    const scores = scoreMainstats(teamKey2, members, settled, open);
    const top = /* @__PURE__ */ new Map();
    for (const i of open) {
      top.set(i, rankedMainstats(scores.get(i), members[i], () => true).slice(0, MAINSTAT_ROWS).map((r) => r.mainstat));
    }
    for (const mainstats of cartesian(members.map((_, i) => top.get(i) ?? [settled[i].mainstat]))) {
      rows.push(settled.map((p, i) => ({ ...p, mainstat: mainstats[i] })));
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
  const ctx = self;
  ctx.onmessage = ({ data }) => {
    let sent = 0;
    const solved = solveTeam(data.teamKey, teamFromKey(data.teamKey), data.filters, data.picks, (share) => {
      if (share - sent < 0.01)
        return;
      sent = share;
      ctx.postMessage({ id: data.id, share });
    });
    ctx.postMessage({ id: data.id, ...solved });
  };
}

export {
  tagKind,
  TAG_NAME,
  scopedStat,
  splitStat,
  ActionTag,
  CAST_NAME,
  NODE_NAME,
  SCALING_NAME,
  isPercent,
  statLabel,
  RESOURCE_NAME,
  RESONATOR_LEVEL,
  LEVEL_90_DOT,
  LEVEL_90_TUNE,
  mvPercent,
  effectiveShred,
  effectiveRes,
  damageFactors,
  Sonata,
  breakdownOf,
  baseSequence,
  ENEMY,
  BASE_RESISTANCE_GEAR,
  hitsOf,
  runTeam,
  erRollsFor,
  runFromScore,
  INTERCHANGEABLE,
  ALL_TEAMS,
  PRIMARY_TEAM,
  teamKey,
  teamAt,
  loadoutName,
  member,
  AXES,
  TEAM_COSTS,
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
  matrixOn,
  filterSignature,
  bestKey,
  picksKey,
  comboOf,
  grantToOne,
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
