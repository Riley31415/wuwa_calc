import {
  ALL_TEAMS,
  AXES,
  BASE_RESISTANCE,
  CAST_NAME,
  CONCERTO_UNIT,
  ENERGY_UNIT,
  INPUT_NAME,
  INTERCHANGEABLE,
  LEVEL_90_DOT,
  LEVEL_90_TUNE,
  MV_UNIT,
  Mainslot,
  NODE_NAME,
  OWN_DEF,
  POSITION_NAME,
  PRIMARY_TEAM,
  RESONATOR_LEVEL,
  RESOURCE_NAME,
  Resonator,
  SCALING_NAME,
  Sonata,
  Sonata1pc,
  Sonata2pc,
  Sonata3pc,
  TAG_NAME,
  TUNE_BREAK,
  TUNE_BREAK_ENEMY,
  Transition,
  Weapon,
  axisOpen,
  axisUsed,
  baseSequence,
  bestKey,
  comboOf,
  compares,
  costBuild,
  costRefine,
  damageFactors,
  defFactorOf,
  defaultFilters,
  echoLabel,
  echoPicks,
  effectiveRes,
  effectiveShred,
  eligibleWeapons,
  erRollsFor,
  filterSignature,
  grantHolders,
  grantToOne,
  hasBuild,
  hitDamage,
  isProgress,
  isSignature,
  loadoutName,
  member,
  menuStats,
  picksKey,
  rankValue,
  refineLevels,
  runFromScore,
  runTeam,
  scopedKey,
  scopedStat,
  sequenceLevels,
  shownExtraLevels,
  shownRanks,
  shownWeapons,
  solveTeam,
  splitStat,
  standardWeapon,
  statDisplayScale,
  statLabel,
  tagKind,
  teamAt,
  teamKey,
  weaponBase
} from "./chunk-UAEIIFKI.js";

// dist/src/page/display.js
var shown = (s, i) => s.shownAfter?.[i] ?? [s.energy, s.concerto, s.offtune, ...s.forte][i];
var shownBefore = (s, i) => s.shownBefore?.[i] ?? [s.energyBefore, s.concertoBefore, s.offtuneBefore, ...s.forteBefore][i];
var formatters = /* @__PURE__ */ new Map();
var fmt = (v, digits2 = 0, pad = false, group = true) => {
  if (typeof v !== "number")
    return String(v ?? "");
  const scale = 10 ** digits2;
  const key = `${digits2}${pad ? "p" : ""}${group ? "g" : ""}`;
  let f = formatters.get(key);
  if (!f)
    formatters.set(key, f = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits2, minimumFractionDigits: pad ? digits2 : 0, useGrouping: group }));
  const cut = Math.trunc(Number((v * scale).toFixed(6))) / scale;
  const memo = `${key}|${cut === 0 ? 0 : cut}`;
  let out = formatted.get(memo);
  if (out === void 0) {
    if (formatted.size > 5e4)
      formatted.clear();
    formatted.set(memo, out = f.format(cut === 0 ? 0 : cut));
  }
  return out;
};
var fmtPct = (v, pad = false) => typeof v === "number" ? fmt(Math.round(v * 100) / 100, 2, pad) : fmt(v);
var fmtPctCell = (v, key, pad = false) => {
  if (key === "mv")
    return fmtPct(v, pad);
  const tenths = Math.floor(Number((Math.abs(v) * 10).toFixed(6)) + 0.1);
  return fmt(Math.sign(v) * tenths / 10, 1, pad);
};
var formatted = /* @__PURE__ */ new Map();
var exact = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });
var fmtExact = (v) => typeof v === "number" ? exact.format(v) : String(v ?? "");
var FORTE_GAUGES = [
  3,
  4,
  5,
  6,
  7
  /* Resource.Forte5 */
];
var clockAt = (frame) => {
  const cs = Math.floor(frame * 100 / 60);
  const min = Math.floor(cs / 6e3), sec = Math.floor(cs / 100) % 60, frac = String(cs % 100).padStart(2, "0");
  return min ? `${min}:${String(sec).padStart(2, "0")}.${frac}s` : `${sec}.${frac}s`;
};
var PAD_DIGITS_COLUMNS = /* @__PURE__ */ new Set([
  "energy",
  "concerto",
  "offtune",
  "mv",
  "dmgBonus",
  "amp",
  "cr",
  "cd",
  "dealt",
  "effDef",
  ...FORTE_GAUGES.map((key) => `gauge:${RESOURCE_NAME[key]}`)
]);
var GROUPED_COLUMNS = /* @__PURE__ */ new Set(["avg"]);
var decimalsOf = (v) => {
  const text = Math.abs(v).toFixed(2);
  return text.endsWith("00") ? 0 : text.endsWith("0") ? 1 : 2;
};
var digitsOf = (raw, col) => {
  const own = raw[`digits:${col.key}`];
  return typeof own === "number" ? own : col.digits ?? 0;
};
var keysFor = (action, ...stats) => stats.flatMap((stat) => [
  stat,
  ...[action.lastDamage?.element ?? null, action.lastDamage?.type ?? null, action.lastDamage?.subtype ?? null].filter((tag) => tag !== null).map((tag) => scopedStat(tag, stat))
]);
var sub = (action) => action.lastDamage?.subtype ?? null;
var special = (action) => action.scaling === 3 || action.scaling === 4 || action.scaling === 5;
var fixed = (action) => action.scaling === 5;
var SCALERS = {
  [
    0
    /* Scaling.Atk */
  ]: { key: "atk", word: "ATK", full: "Attack", stats: [
    0,
    6,
    3
    /* Stat.FlatAtk */
  ] },
  [
    1
    /* Scaling.Hp */
  ]: { key: "hp", word: "HP", full: "HP", stats: [
    1,
    7,
    4
    /* Stat.FlatHp */
  ] },
  [
    2
    /* Scaling.Def */
  ]: { key: "def", word: "DEF", full: "Defense", stats: [
    2,
    8,
    5
    /* Stat.FlatDef */
  ] }
};
var scalerOf = (action) => action.scaling === null ? void 0 : SCALERS[action.scaling];
var CONSTANT_SCALERS = {
  [
    3
    /* Scaling.Dot */
  ]: { value: LEVEL_90_DOT, label: `Negative Status constant at resonator level ${RESONATOR_LEVEL}` },
  [
    4
    /* Scaling.Tune */
  ]: { value: LEVEL_90_TUNE, label: `Tune Break constant at resonator level ${RESONATOR_LEVEL}` }
};
var constantScalerOf = (action) => action.scaling === null ? void 0 : CONSTANT_SCALERS[action.scaling];
var FEEDS = {
  scaler: (a) => {
    const s = scalerOf(a);
    return s ? keysFor(a, ...s.stats) : [];
  },
  mv: (a) => keysFor(
    a,
    16,
    17
    /* Stat.MulMv */
  ),
  cr: (a) => fixed(a) ? [] : !special(a) ? keysFor(
    a,
    9
    /* Stat.CritRate */
  ) : !sub(a) ? [] : [scopedStat(
    sub(a),
    9
    /* Stat.CritRate */
  )],
  cd: (a) => fixed(a) ? [] : !special(a) ? keysFor(
    a,
    10
    /* Stat.CritDmg */
  ) : !sub(a) ? [] : [scopedStat(
    sub(a),
    10
    /* Stat.CritDmg */
  )],
  dmgBonus: (a) => special(a) ? [] : keysFor(
    a,
    18
    /* Stat.DmgBonus */
  ),
  amp: (a) => a.scaling === 4 || fixed(a) ? [] : a.scaling !== 3 ? keysFor(
    a,
    19
    /* Stat.Amp */
  ) : !sub(a) ? [] : [scopedStat(
    sub(a),
    19
    /* Stat.Amp */
  )],
  dealt: (a) => fixed(a) ? [] : a.scaling === 4 ? keysFor(
    a,
    20,
    21,
    12
    /* Stat.TBB */
  ) : a.scaling !== 3 ? keysFor(
    a,
    20,
    21
    /* Stat.DamageTaken */
  ) : !sub(a) ? [] : [scopedStat(
    sub(a),
    20
    /* Stat.TotalDmg */
  ), scopedStat(
    sub(a),
    21
    /* Stat.DamageTaken */
  )],
  effDef: (a) => fixed(a) ? [] : a.scaling === 3 ? keysFor(
    a,
    28
    /* EnemyStat.DefReduce */
  ) : keysFor(
    a,
    23,
    24,
    28
    /* EnemyStat.DefReduce */
  ),
  effRes: (a) => a.scaling === 3 ? keysFor(
    a,
    27
    /* EnemyStat.ResReduce */
  ) : fixed(a) ? [] : keysFor(
    a,
    22,
    27
    /* EnemyStat.ResReduce */
  )
  // energy/concerto/offtune are running totals — `rowValues()` builds their panels by hand
};
var SECTION_OF = {
  [
    0
    /* Stat.BaseAtk */
  ]: "Base ATK",
  [
    6
    /* Stat.BonusAtk */
  ]: "Bonus ATK",
  [
    3
    /* Stat.FlatAtk */
  ]: "Flat ATK",
  [
    1
    /* Stat.BaseHp */
  ]: "Base HP",
  [
    7
    /* Stat.BonusHp */
  ]: "Bonus HP",
  [
    4
    /* Stat.FlatHp */
  ]: "Flat HP",
  [
    2
    /* Stat.BaseDef */
  ]: "Base DEF",
  [
    8
    /* Stat.BonusDef */
  ]: "Bonus DEF",
  [
    5
    /* Stat.FlatDef */
  ]: "Flat DEF",
  [
    23
    /* Stat.DefIgnoreNew */
  ]: "DEF Ignore (new)",
  [
    24
    /* Stat.DefIgnoreOld */
  ]: "DEF Ignore (old)",
  [
    28
    /* EnemyStat.DefReduce */
  ]: "DEF Reduce",
  [
    22
    /* Stat.ResIgnore */
  ]: "RES Ignore",
  [
    27
    /* EnemyStat.ResReduce */
  ]: "RES Reduce",
  [
    20
    /* Stat.TotalDmg */
  ]: "Total Damage",
  [
    21
    /* Stat.DamageTaken */
  ]: "Damage Taken",
  [
    12
    /* Stat.TBB */
  ]: "Tune Break Boost"
};
var actionInfo = (snap) => {
  const { action, type, source } = snap;
  const info = [];
  const push = (label, value) => {
    if (value)
      info.push({ label, value });
  };
  push("Node", action.node === null ? null : NODE_NAME[action.node]);
  push("Cast", action.cast === 11 ? null : CAST_NAME[action.cast]);
  push("Subcast", action.subcast === 11 ? null : CAST_NAME[action.subcast]);
  const kinds = (of, also = null) => {
    const seen = new Set(action.bullets.map(of).filter((v) => v !== null));
    if (also !== null)
      seen.add(also);
    return seen.size ? [...seen].map((v) => TAG_NAME[v]).join(", ") : null;
  };
  push("Attribute", kinds((h) => h.element));
  push("Scaling", action.scaling === null ? null : SCALING_NAME[action.scaling]);
  push("Type", kinds((h) => h.type, type));
  push("Subtype", kinds((h) => h.subtype));
  let press = action;
  while ((press.cancelOf ?? press.formOf) && (press.cancelOf ?? press.formOf) !== TUNE_BREAK)
    press = press.cancelOf ?? press.formOf;
  push("Input", press.input === 14 ? null : INPUT_NAME[press.input]);
  push("End Position", press.endPosition === null ? null : POSITION_NAME[press.endPosition]);
  push("Animation", `${press.animFrames}f`);
  push("Cast Priority", press.castPriority === null ? null : String(press.castPriority));
  push("Anim Priority", press.animPriority.length ? press.animPriority.map(([f, t]) => `${f}f: ${t}`).join(", ") : null);
  push("No Swap", press.noSwapFrames ? `${press.noSwapFrames}f` : null);
  push("Outro Buff", press.qteFrames ? `${press.qteFrames}f` : null);
  push("Time Stop", press.timestop ? `${press.timestopFrom}f-${press.timestopFrom + press.timestop}f` : null);
  push("Motion Stop", press.motionStop ? `${press.motionStopFrom}f-${press.motionStopFrom + press.motionStop}f` : null);
  push("Bullets", press.bullets.length ? press.bullets.map((h) => `${h.hitFrame}f`).join(", ") : null);
  push("Commits", press.bullets.some((h) => h.commitFrame !== h.hitFrame) ? press.bullets.map((h) => `${h.commitFrame}f`).join(", ") : null);
  push("Valid", snap.invalid ? "no" : null);
  if (source)
    info.push({ label: "Source", value: source.name, source: source.source });
  return info;
};
function tagRank(key) {
  const tag = splitStat(key)[1];
  return tag === null ? 0 : tagKind(tag);
}
var entryIndex = /* @__PURE__ */ new WeakMap();
function entriesOf(entries, stats) {
  let index = entryIndex.get(entries);
  if (!index) {
    index = /* @__PURE__ */ new Map();
    for (let i = 0; i < entries.length; i++) {
      const at = index.get(entries[i].stat);
      if (at)
        at.push(i);
      else
        index.set(entries[i].stat, [i]);
    }
    entryIndex.set(entries, index);
  }
  const out = [];
  for (const stat of new Set(stats)) {
    const at = index.get(stat);
    if (at)
      for (const i of at)
        out.push(i);
  }
  return out.sort((a, b) => a - b);
}
function tracing(snapshot, stats, merge = true) {
  const by = /* @__PURE__ */ new Map();
  const rows = [];
  const entries = snapshot.entries;
  for (const i of entriesOf(entries, stats)) {
    const e = entries[i];
    const key = `${e.source} ${e.stat}`;
    const seen = merge ? by.get(key) : void 0;
    if (seen)
      seen.value += e.value / statDisplayScale(splitStat(e.stat)[0]);
    else {
      const [stat, tag] = splitStat(e.stat);
      const base = e.source === BASE_RESISTANCE.name;
      const row = {
        source: e.source ?? "",
        stat: e.stat,
        value: e.value / statDisplayScale(stat),
        section: base ? "Base RES" : SECTION_OF[stat] ?? (tag === null ? null : statLabel(e.stat)),
        owner: e.owner ?? null
      };
      by.set(key, row);
      rows.push(row);
    }
  }
  return rows.sort((a, b) => tagRank(a.stat ?? 0) - tagRank(b.stat ?? 0));
}
var gaugeSuffix = (raw, key) => {
  const cap = raw[`max:${key}`];
  return typeof cap === "number" ? `/${fmt(cap, decimalsOf(cap), false, false)}` : "";
};
var RESOURCE_SCALE = { energy: ENERGY_UNIT, concerto: CONCERTO_UNIT, offtune: 1e4 };
var COMBINED_COLUMNS = [
  "mv",
  "energy",
  "concerto",
  "offtune",
  ...FORTE_GAUGES.map((key) => `gauge:${RESOURCE_NAME[key]}`)
];
var wentThrough = (row) => row.mult === true || row.section === MV_MULTIPLIER;
function foldDuplicates(rows) {
  const out = [];
  const at = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = [row.source, row.section ?? "", row.label ?? "", row.stat ?? "", row.owner ?? "", row.place ?? "", row.mult ? 1 : 0].join("|");
    const seen = at.get(key);
    if (!seen) {
      const copy = { ...row };
      at.set(key, { row: copy, n: row.count ?? 1 });
      out.push(copy);
      continue;
    }
    seen.n += row.count ?? 1;
    if (wentThrough(row))
      continue;
    seen.row.value += row.value;
    seen.row.count = seen.n;
  }
  return out;
}
var OFFTUNE_RATE = "Buildup Rate";
var OFFTUNE_MULT = "Offtune Multiplier";
var HIT_ENERGY_MULT = "Hit Energy Multiplier";
var CAST_ENERGY = "Cast Energy";
var HIT_ENERGY = "Energy";
var BETWEEN = "Between Actions";
var RATE_SECTIONS = /* @__PURE__ */ new Set([OFFTUNE_RATE, OFFTUNE_MULT, HIT_ENERGY_MULT]);
var ENERGY_REGEN = "Energy Regen";
var MV_MULTIPLIER = "MV Multiplier";
var tagOf = (snap) => snap.action.offField ? "" : snap.tag === Transition.TimedCancel ? `cancel @ ${snap.action.timedAt}f` : snap.tag;
function ownShares(snap, cast, hit) {
  if (cast && hit) {
    return [
      { source: snap.action.name, value: cast, owner: snap.member },
      { source: snap.action.name, value: hit, owner: snap.member }
    ];
  }
  return cast + hit ? [{ source: snap.action.name, value: cast + hit, owner: snap.member }] : [];
}
var landedBullets = (s) => s.holdCut < 0 ? s.action.bullets : s.action.bullets.filter((b) => b.commitFrame <= s.holdCut);
var hitsBank = (s, key) => landedBullets(s).reduce((n, b) => n + b[key], 0);
var landedMv = (s) => {
  const base = hitsBank(s, "mv");
  return base || !s.action.mv ? (base + s.stats[
    16
    /* Stat.AddMv */
  ]) * (1 + s.stats[
    17
    /* Stat.MulMv */
  ] / 100) : 0;
};
var STAT_COLUMNS = ["scaler", "mv", "dmgBonus", "amp", "cr", "cd", "dealt", "effDef", "effRes", "avg"];
function rowValues(snap, { mv, avg }, members = []) {
  const dealsDamage = mv !== 0;
  const scaler = scalerOf(snap.action);
  const constant = constantScalerOf(snap.action);
  const buffed = /* @__PURE__ */ new Set();
  const raw = {
    member: snap.member,
    // the stat this action scales off; a dot/tune hit reads its own constant instead, and a fixed
    // hit reads nothing, so its cell is blank
    scaler: scaler ? snap[scaler.key] : constant?.value ?? null,
    // a fixed hit's motion value *is* its damage rather than a multiplier, so no mv cell either
    mv: dealsDamage && !fixed(snap.action) ? mv / MV_UNIT : null,
    // what a dot/tune/fixed hit doesn't read is blank, matching `FEEDS`
    dmgBonus: special(snap.action) ? null : snap.dmgBonus,
    amp: fixed(snap.action) ? null : snap.action.scaling === 4 ? null : snap.action.scaling === 3 ? snap.subtypeAmp : snap.amp,
    cr: fixed(snap.action) ? null : special(snap.action) ? snap.subtypeCritRate : snap.stat(
      9
      /* Stat.CritRate */
    ),
    cd: fixed(snap.action) ? null : special(snap.action) ? snap.subtypeCritDmg : snap.stat(
      10
      /* Stat.CritDmg */
    ),
    // the column is the pair's combined lift, since Total Damage and Damage Taken multiply — and a
    // tune hit's Tune Break Boost with them; a dot reads only its status-scoped halves, as `amp` does
    dealt: fixed(snap.action) ? null : snap.action.scaling === 3 ? ((1 + snap.subtypeTotalDmg / 100) * (1 + snap.subtypeDamageTaken / 100) - 1) * 100 : ((1 + snap.stat(
      20
      /* Stat.TotalDmg */
    ) / 100) * (1 + snap.stat(
      21
      /* Stat.DamageTaken */
    ) / 100) * (snap.action.scaling === 4 ? 1 + snap.stat(
      12
      /* Stat.TBB */
    ) / 100 : 1) - 1) * 100,
    effDef: fixed(snap.action) ? null : effectiveShred(snap) * 100,
    effRes: fixed(snap.action) ? null : effectiveRes(snap),
    energy: shown(snap, 0) / RESOURCE_SCALE.energy,
    concerto: shown(snap, 1) / RESOURCE_SCALE.concerto,
    offtune: shown(snap, 2) / RESOURCE_SCALE.offtune,
    // what each held coming in — the running-column blanking reads these (page/detail.ts stepRow)
    "before:energy": shownBefore(snap, 0) / RESOURCE_SCALE.energy,
    "before:concerto": shownBefore(snap, 1) / RESOURCE_SCALE.concerto,
    "before:offtune": shownBefore(snap, 2) / RESOURCE_SCALE.offtune,
    avg: dealsDamage ? avg : null
  };
  FORTE_GAUGES.forEach((key, i) => {
    const unit = snap.forteScale[i];
    raw[`gauge:${RESOURCE_NAME[key]}`] = shown(snap, 3 + i) * unit;
    raw[`before:gauge:${RESOURCE_NAME[key]}`] = shownBefore(snap, 3 + i) * unit;
    if (snap.maxForte[i])
      raw[`max:gauge:${RESOURCE_NAME[key]}`] = snap.maxForte[i] * unit;
  });
  const low = (i) => snap.shownShort?.[i] ?? shown(snap, i) < 0;
  raw["short:energy"] = low(0) ? 1 : 0;
  raw["short:concerto"] = low(1) ? 1 : 0;
  raw["short:offtune"] = low(2) ? 1 : 0;
  FORTE_GAUGES.forEach((key, i) => {
    raw[`short:gauge:${RESOURCE_NAME[key]}`] = low(3 + i) ? 1 : 0;
  });
  raw["short:buff"] = snap.invalid ? "not valid" : 0;
  const sources = {};
  for (const [key, feeds] of Object.entries(FEEDS))
    sources[key] = tracing(snap, feeds(snap.action));
  if (constant)
    raw["empty:scaler"] = constant.label;
  sources.effRes = (sources.effRes ?? []).map((r) => ({ ...r, value: -r.value }));
  if (!fixed(snap.action)) {
    const dot = snap.action.scaling === 3;
    const pct = (v) => `${fmtPct(v)}%`;
    const ignoreNew = dot ? 0 : snap.stat(
      23
      /* Stat.DefIgnoreNew */
    ), ignoreOld = dot ? 0 : snap.stat(
      24
      /* Stat.DefIgnoreOld */
    );
    const reduce = snap.stat(
      28
      /* EnemyStat.DefReduce */
    );
    const base = fmt(snap.enemyDef, 0, false, false);
    const inner = [reduce, ignoreOld].filter((v) => v !== 0).map((v) => ` \u2212 ${pct(v)}`).join("");
    const floored = inner ? `floor(${base} \xD7 (1${inner}))` : base;
    const own = fmt(OWN_DEF, 0, false, false);
    const formula = `${own} / (${own} + ${floored}${ignoreNew ? ` \xD7 (1 \u2212 ${pct(ignoreNew)})` : ""})`;
    sources.effDef = [
      ...sources.effDef ?? [],
      // the formula reads across the whole row, so it rides in the label with the value cell left empty
      { source: "", label: `Formula: ${formula}`, value: 0, text: "", summary: true, place: "afterTotal" },
      { source: "", label: "Defense Factor", value: defFactorOf(snap), digits: 4, summary: true, place: "afterTotal", joined: true },
      { source: "", label: "Effective Defense Shred", value: effectiveShred(snap) * 100, percent: true, digits: 2, summary: true, place: "afterTotal", joined: true }
    ];
  }
  const CAST_SHARE = { energy: snap.action.castEnergy, concerto: snap.action.castConcerto, offtune: snap.action.castOfftune };
  const added = (i) => (snap.adds ?? []).filter((c) => c.gains[i] !== 0).map((c) => ({
    source: c.source,
    value: c.gains[i],
    owner: c.owner ?? void 0,
    // what moved the bar since this member's last row, carried here
    ...c.background ? { label: c.label ?? "between actions", section: BETWEEN } : c.onCast ? { label: "on cast" } : {}
  }));
  const ADDED = { energy: 0, concerto: 1, offtune: 7 };
  for (const key of ["energy", "concerto", "offtune"]) {
    let traced = added(ADDED[key]).map((r) => ({ ...r, value: r.value / RESOURCE_SCALE[key] }));
    const cast = CAST_SHARE[key] / RESOURCE_SCALE[key], hit = hitsBank(snap, key) / RESOURCE_SCALE[key];
    let own = ownShares(snap, cast, hit);
    if (key === "energy") {
      const at = (section) => (r) => ({ ...r, section });
      const onCast = (r) => r.label === "on cast";
      own = [
        ...cast ? [{ source: snap.action.name, value: cast, owner: snap.member, section: CAST_ENERGY }] : [],
        ...hit ? [{ source: snap.action.name, value: hit, owner: snap.member, section: HIT_ENERGY }] : []
      ];
      const between = (r) => r.section === BETWEEN;
      traced = [...traced.filter(onCast).map(at(CAST_ENERGY)), ...traced.filter((r) => !onCast(r) && !between(r)).map(at(HIT_ENERGY)), ...traced.filter(between)];
    }
    const rows = [...own, ...traced];
    const folded = [...own, ...foldDuplicates(traced)];
    if (folded.length)
      sources[key] = folded;
    if (traced.length)
      buffed.add(key);
    raw[`moved:${key}`] = rows.reduce((n, r) => n + r.value, 0);
  }
  raw["gen:energy"] = (hitsBank(snap, "energy") + Math.max(0, snap.action.castEnergy)) / RESOURCE_SCALE.energy;
  const hitEnergy = hitsBank(snap, "energy");
  if (hitEnergy > 0) {
    const scaled = hitEnergy / RESOURCE_SCALE.energy * (1 + snap.stat(
      14
      /* Stat.HitEnergyMult */
    ) / 100);
    const rate = tracing(snap, keysFor(
      snap.action,
      14
      /* Stat.HitEnergyMult */
    ));
    sources.energy = [...sources.energy ?? [], ...rate.map((r) => ({ ...r, section: HIT_ENERGY_MULT }))];
    raw["moved:energy"] = (Number(raw["moved:energy"]) || 0) - hitEnergy / RESOURCE_SCALE.energy + scaled;
    const shared = { source: "", label: "Energy Shared", value: scaled / 2, summary: true, joined: true, place: "afterTotal" };
    const regen = tracing(snap, keysFor(
      snap.action,
      11
      /* Stat.ER */
    ), false).map((r) => ({ ...r, percent: true, section: ENERGY_REGEN, place: "afterTotal" }));
    sources.energy = [...sources.energy, shared, ...regen];
    if (regen.length) {
      sources.energy.push({
        source: "",
        label: "Total",
        value: regen.reduce((n, r) => n + r.value, 0),
        percent: true,
        summary: true,
        section: ENERGY_REGEN,
        place: "afterTotal"
      });
    }
  }
  const declaredOfftune = hitsBank(snap, "offtune") + added(7).reduce((n, r) => n + r.value, 0);
  const buildingOfftune = declaredOfftune < 0 ? declaredOfftune : declaredOfftune * (1 + snap.stat(
    15
    /* Stat.OfftuneMult */
  ) / 100);
  if (buildingOfftune > 0) {
    const mult = tracing(snap, keysFor(
      snap.action,
      15
      /* Stat.OfftuneMult */
    ));
    if (mult.length)
      sources.offtune = [...sources.offtune ?? [], ...mult.map((r) => ({ ...r, section: OFFTUNE_MULT }))];
    const rate = tracing(snap, keysFor(
      snap.action,
      13
      /* Stat.OfftuneBuildup */
    ));
    if (rate.length)
      sources.offtune = [...sources.offtune ?? [], ...rate.map((r) => ({ ...r, section: OFFTUNE_RATE }))];
  }
  const direct = added(8);
  raw["moved:offtune"] = ((buildingOfftune < 0 ? buildingOfftune : buildingOfftune * (snap.stat(
    13
    /* Stat.OfftuneBuildup */
  ) / 100)) + snap.action.castOfftune + direct.reduce((n, r) => n + r.value, 0)) / RESOURCE_SCALE.offtune;
  if (direct.length) {
    sources.offtune = [...sources.offtune ?? [], ...direct.map((r) => ({
      ...r,
      value: r.value / RESOURCE_SCALE.offtune,
      section: "Direct Offtune"
    }))];
    buffed.add("offtune");
  }
  const FORTE_FIELD = ["forte1", "forte2", "forte3", "forte4", "forte5"];
  FORTE_GAUGES.forEach((key, i) => {
    const unit = snap.forteScale[i];
    const traced = added(2 + i).map((r) => ({ ...r, value: r.value * unit }));
    const rows = [];
    if (snap.action.resetForte[i]) {
      rows.push({ source: snap.action.name, value: 0, text: "Reset", owner: snap.member });
    }
    rows.push(...ownShares(snap, snap.action.castForte[i] * unit, hitsBank(snap, FORTE_FIELD[i]) * unit));
    rows.push(...foldDuplicates(traced).map(({ count: _, ...r }) => r));
    if (rows.length)
      sources[`gauge:${RESOURCE_NAME[key]}`] = rows;
    raw[`moved:gauge:${RESOURCE_NAME[key]}`] = rows.reduce((n, r) => n + r.value, 0);
    if (snap.action.resetForte[i])
      raw[`clear:gauge:${RESOURCE_NAME[key]}`] = 1;
  });
  if (!raw.mv)
    delete sources.mv;
  else {
    const isFactor = (r) => r.stat !== void 0 && splitStat(r.stat)[0] === 17;
    const parts = sources.mv ?? [];
    if (parts.length)
      buffed.add("mv");
    const base = hitsBank(snap, "mv");
    sources.mv = [
      ...base ? [{ source: snap.action.name, label: "Base MV", value: base / MV_UNIT, percent: true, owner: snap.member }] : [],
      ...parts.filter((r) => !isFactor(r)),
      ...parts.filter(isFactor).map((r) => ({ ...r, section: MV_MULTIPLIER }))
    ];
  }
  if (sources.dealt?.length) {
    const half = (stat) => sources.dealt.filter((r) => r.stat !== void 0 && splitStat(r.stat)[0] === stat).reduce((n, r) => n + r.value, 0);
    const parts = [
      20,
      21,
      12
      /* Stat.TBB */
    ].map((stat) => [stat, half(stat)]).filter(([, value]) => value);
    if (parts.length > 1 || parts.some(
      ([stat]) => stat === 12
      /* Stat.TBB */
    )) {
      sources.dealt = [...sources.dealt, ...parts.map(([stat, value]) => ({
        source: "",
        label: "Total",
        value,
        section: SECTION_OF[stat],
        percent: stat !== 12,
        summary: true
      }))];
    }
  }
  const tracedScaler = sources.scaler;
  if (scaler && tracedScaler) {
    const [baseStat, bonusStat, flatStat] = scaler.stats;
    const sum = (stat) => tracedScaler.filter((r) => r.stat !== void 0 && splitStat(r.stat)[0] === stat).reduce((n, r) => n + r.value, 0);
    const base = Math.floor(sum(baseStat));
    if (base) {
      const subtotal = (stat, percent) => tracedScaler.some((r) => r.stat !== void 0 && splitStat(r.stat)[0] === stat) ? [{ source: "", label: "Total", value: sum(stat), section: SECTION_OF[stat], percent, summary: true }] : [];
      const final = `Final ${scaler.word}`;
      sources.scaler = [
        ...tracedScaler,
        ...subtotal(baseStat, false),
        ...subtotal(bonusStat, true),
        ...subtotal(flatStat, false),
        { source: "", label: "Total", value: snap[scaler.key], section: final, summary: true },
        // the stat as the damage formula takes it, floored
        { source: "", label: `${scaler.full} Multiplier`, value: damageFactors(snap).finalStat, mult: true, section: final, summary: true, joined: true },
        { source: "", label: `Effective ${scaler.word} Bonus`, value: (snap[scaler.key] / base - 1) * 100, section: final, percent: true, digits: 2, summary: true }
      ];
    }
  }
  if (dealsDamage && !fixed(snap.action)) {
    const f = damageFactors(snap);
    const below = (key, label, value, mult = true) => {
      if (!sources[key])
        return;
      sources[key] = [...sources[key], { source: "", label, value, digits: 4, summary: true, joined: true, place: "afterTotal", ...mult ? { mult: true } : {} }];
    };
    below("dmgBonus", "Damage Bonus Multiplier", f.bonusFactor);
    below("amp", "Amplification Multiplier", f.ampFactor);
    if (f.dealtFactor !== 1)
      below("dealt", "Total Damage Multiplier", f.dealtFactor);
    if (f.takenFactor !== 1)
      below("dealt", "Damage Taken Multiplier", f.takenFactor);
    if (snap.action.scaling === 4)
      below("dealt", "Tune Break Boost Multiplier", f.tbbFactor);
    below("effRes", "Resistance Factor", f.resFactor, false);
    below("cr", "Average Crit Multiplier", f.critFactor);
    below("cd", "Average Crit Multiplier", f.critFactor);
  }
  if (members.length > 1) {
    const per = members.map((m) => rowValues(m, { mv: landedMv(m), avg: 0 }));
    for (const key of ["short:energy", "short:concerto", "short:offtune", ...FORTE_GAUGES.map((k) => `short:gauge:${RESOURCE_NAME[k]}`)]) {
      raw[key] = per.some((p) => Number(p.raw[key])) ? 1 : 0;
    }
    raw["short:buff"] = per.map((p) => p.raw["short:buff"]).filter(Boolean).join(", ") || 0;
    for (const key of COMBINED_COLUMNS) {
      if (sources[key] === void 0 && key === "mv")
        continue;
      const rated = per.map((p) => (p.sources[key] ?? []).some((r) => r.section === ENERGY_REGEN || RATE_SECTIONS.has(r.section ?? "")));
      const last = rated.lastIndexOf(true) < 0 ? per.length - 1 : rated.lastIndexOf(true);
      const kept = per.flatMap((p, k) => (p.sources[key] ?? []).filter((r) => r.section !== ENERGY_REGEN && !RATE_SECTIONS.has(r.section ?? "") || k === last));
      const rows = [...foldDuplicates(kept.filter((r) => r.section !== ENERGY_REGEN)), ...kept.filter((r) => r.section === ENERGY_REGEN)];
      if (rows.length)
        sources[key] = rows;
      else
        delete sources[key];
      if (per.some((p) => p.buffed.has(key)))
        buffed.add(key);
      const moved = `moved:${key}`;
      if (per.some((p) => p.raw[moved] !== void 0))
        raw[moved] = per.reduce((n, p) => n + (Number(p.raw[moved]) || 0), 0);
    }
    raw["gen:energy"] = per.reduce((n, p, k) => n + (members[k].member === snap.member ? Number(p.raw["gen:energy"]) || 0 : 0), 0);
    FORTE_GAUGES.forEach((key, i) => {
      raw[`before:gauge:${RESOURCE_NAME[key]}`] = shownBefore(members[0], 3 + i) * members[0].forteScale[i];
    });
    raw["before:energy"] = shownBefore(members[0], 0) / RESOURCE_SCALE.energy;
    raw["before:concerto"] = shownBefore(members[0], 1) / RESOURCE_SCALE.concerto;
    raw["before:offtune"] = shownBefore(members[0], 2) / RESOURCE_SCALE.offtune;
    const own = members.filter((m) => m.member === snap.member), end = own[own.length - 1] ?? snap;
    raw.energy = shown(end, 0) / RESOURCE_SCALE.energy;
    raw.concerto = shown(end, 1) / RESOURCE_SCALE.concerto;
    raw.offtune = shown(end, 2) / RESOURCE_SCALE.offtune;
    FORTE_GAUGES.forEach((key, i) => {
      raw[`gauge:${RESOURCE_NAME[key]}`] = shown(end, 3 + i) * end.forteScale[i];
    });
  }
  const hits = dealsDamage ? (members.length ? members : [snap]).flatMap((m) => (m.hitLog ?? (landedMv(m) ? [hitDamage(m)] : [])).map((h, k) => ({ ...h, n: k + 1 }))) : [];
  if (dealsDamage)
    sources.avg = [];
  if (!(members.length ? members : [snap]).some((m) => m.action.bullets.length)) {
    for (const key of STAT_COLUMNS) {
      raw[key] = null;
      delete sources[key];
      buffed.delete(key);
    }
    delete raw["empty:scaler"];
  }
  return { raw, sources, buffed, hits };
}
function buildReport(lines, origin = 0) {
  const columns = [
    { key: "member", label: "member", align: "left" },
    { key: "action", label: "action", align: "left" },
    // the clock as the row's own press ends, counting up from 0.00s (`clockAt`)
    { key: "time", label: "time", noTotal: true, full: "Time" },
    { key: "avg", label: "avg dmg", full: "Final Damage" },
    { key: "mv", label: "mv%", digits: 2, percent: true, full: "Motion Value" },
    // whichever stat the action scales off, blank where it scales off a constant
    { key: "scaler", label: "scaler", noTotal: true },
    { key: "dmgBonus", label: "dmg%", digits: 2, percent: true, full: "Dmg Bonus" },
    { key: "amp", label: "amp%", digits: 2, percent: true, full: "Amplification" },
    { key: "cr", label: "cr%", digits: 2, percent: true, full: "Crit Rate" },
    { key: "cd", label: "cd%", digits: 2, percent: true, full: "Crit Dmg" },
    // both halves carry their own section heading, so `full` is only the empty-panel one
    // its panel ends on the defense factor's formula and results rather than a Total
    { key: "effDef", label: "shred%", digits: 2, percent: true, noTotal: true, full: "DEF Ignore", fullEmpty: "DEF Shred" },
    { key: "effRes", label: "res%", digits: 2, percent: true, full: "Enemy RES" },
    { key: "dealt", label: "vuln%", digits: 2, percent: true, full: "Vulnerability" },
    // digits match nanoka's precision; offtune is /10000 (RESOURCE_SCALE) and reads to two like
    // the rest — its own panel is where the finer figures are, printed in full
    { key: "concerto", label: "concerto", digits: 2, hideIfZero: true, full: "Concerto" },
    { key: "energy", label: "energy", digits: 2, hideIfZero: true, full: "Energy" },
    { key: "offtune", label: "offtune", digits: 2, hideIfZero: true, full: "OffTune" },
    // two decimals, the same as concerto and energy: a gauge is fed in fractions of a point
    ...FORTE_GAUGES.map((key) => ({
      key: `gauge:${RESOURCE_NAME[key]}`,
      label: RESOURCE_NAME[key],
      digits: 2,
      hideIfZero: true,
      full: RESOURCE_NAME[key]
    }))
  ];
  const isShort = (snap) => snap.triggered && !(snap.action.cast === 8 && snap.action.castOfftune < 0);
  const isShortLine = (line) => line.members?.length ? line.members.every(isShort) : isShort(line.snap);
  const endOf = (s) => s.action.cast === 6 ? s.frame + s.action.animFrames : s.triggered && s.hitAt !== void 0 ? s.hitAt : s.frame + s.frames + (s.swapFrames ?? 0);
  const partOf = (snap, avg, shown3) => {
    const part = rowValues(snap, { mv: landedMv(snap), avg });
    part.raw.action = snap.action.name;
    if (tagOf(snap))
      part.raw["tag:action"] = tagOf(snap);
    const end = endOf(snap);
    part.raw.time = clockAt(end - origin);
    part.raw["end:time"] = end;
    return {
      ...part,
      info: actionInfo(snap),
      type: snap.type,
      scaling: snap.action.scaling,
      isShown: snap === shown3,
      snap,
      short: isShort(snap)
    };
  };
  const rows = lines.map((line) => {
    const snap = line.snap;
    const { raw, sources, buffed, hits } = rowValues(snap, { mv: line.mv, avg: line.avg }, line.members ?? []);
    raw.action = line.id;
    if (tagOf(snap))
      raw["tag:action"] = tagOf(snap);
    const members = line.members?.length ? line.members : [snap];
    const pressed = members.filter((m) => !isShort(m));
    const end = pressed.length ? endOf(pressed[pressed.length - 1]) : Math.max(...members.map(endOf));
    raw.time = clockAt(end - origin);
    raw["end:time"] = end;
    const own = (line.members ?? []).filter((m) => m.member === snap.member);
    return {
      line,
      raw,
      sources,
      buffed,
      hits,
      // `snap.type`, not `action.type`: the type it was actually evaluated as (typeOverride)
      info: actionInfo(snap),
      scaling: snap.action.scaling,
      short: isShortLine(line),
      parts: line.isChain ? line.parts.map((p) => partOf(p.snap, p.dmg.avg, snap)) : []
    };
  });
  for (const key of FORTE_GAUGES.map((k) => `gauge:${RESOURCE_NAME[k]}`)) {
    const per = /* @__PURE__ */ new Map();
    const note = (r) => {
      const v = r.raw[key];
      if (typeof v !== "number")
        return;
      const member2 = String(r.raw.member ?? "");
      per.set(member2, Math.max(per.get(member2) ?? 0, decimalsOf(v)));
    };
    for (const r of rows) {
      note(r);
      r.parts.forEach(note);
    }
    const stamp = (r) => {
      r.raw[`digits:${key}`] = per.get(String(r.raw.member ?? "")) ?? 0;
    };
    for (const r of rows) {
      stamp(r);
      r.parts.forEach(stamp);
    }
  }
  const moved = (r, key) => Math.abs(Number(r.raw[key]) || 0) > 1e-9;
  const used = columns.filter((c) => !c.hideIfZero || rows.some((r) => moved(r, c.key) || r.parts.some((p) => moved(p, c.key))));
  const shown2 = (r, c) => {
    const v = r.raw[c.key];
    return typeof v === "number" ? (c.percent ? `${fmtPctCell(v, c.key, PAD_DIGITS_COLUMNS.has(c.key))}%` : fmt(v, digitsOf(r.raw, c), PAD_DIGITS_COLUMNS.has(c.key), GROUPED_COLUMNS.has(c.key))) + gaugeSuffix(r.raw, c.key) : String(v ?? "");
  };
  const tagLen = (r, c) => c.key === "action" && r.raw["tag:action"] ? Math.ceil(String(r.raw["tag:action"]).length * 0.82 + 2.6) : 0;
  const sized = used.map((c) => {
    const lens = [c.label.length];
    for (const r of rows) {
      lens.push(shown2(r, c).length + tagLen(r, c));
      for (const p of r.parts)
        lens.push(shown2(p, c).length + (c.key === "action" ? 3 : 0) + tagLen(p, c));
    }
    return { ...c, width: Math.max(...lens) + 1 };
  });
  return {
    columns: sized,
    rows,
    total: rows.reduce((n, r) => n + (r.line.aggregate ? 0 : Number(r.raw.avg) || 0), 0)
  };
}

// dist/src/page/teamcode.js
var TAG_DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var ELEMENTS = 6n;
var SERIALS = 21n;
var LOADOUTS = 4n;
var SEQUENCES = 7n;
var WEAPON_TYPES = 5n;
var WEAPON_SERIALS = 16n;
var WEAPON_DIGITS = 4n;
var REFINES = 5n;
var LOADOUT_SPAN = ELEMENTS * SERIALS * LOADOUTS;
var WEAPON_SPAN = WEAPON_TYPES * WEAPON_SERIALS * WEAPON_DIGITS;
var MEMBER_SPAN = LOADOUT_SPAN * SEQUENCES * WEAPON_SPAN * REFINES;
var TEAM_SPAN = MEMBER_SPAN ** 3n * 16n;
var TEAM_BITS = 72n;
var SETS = 64n;
var MAINSLOT_SERIES = [[6e6, 512], [390077e3, 64], [39008e4, 64]];
var MAINSLOTS = BigInt(MAINSLOT_SERIES.reduce((n, [, size]) => n + size, 0));
var SONATA_SPAN = SETS + SETS ** 2n + SETS ** 3n;
var COSTS = [{ from: 0, n: 5 }, { from: 5, n: 10 }, { from: 15, n: 3 }];
var LAYOUTS = [[1, 2, 2], [2, 0, 3], [1, 0, 4]];
var choose = (n, k) => {
  let r = 1;
  for (let i = 1; i <= k; i++)
    r = r * (n - k + i) / i;
  return k > n ? 0 : Math.round(r);
};
var multisets = (c, k) => choose(COSTS[c].n + k - 1, k);
var LAYOUT_SPANS = LAYOUTS.map((l) => l.reduce((n, k, c) => n * multisets(c, k), 1));
var MAINSTAT_SPAN = BigInt(LAYOUT_SPANS.reduce((a, b) => a + b, 0));
var GEAR_SPAN = MAINSLOTS * SONATA_SPAN * MAINSTAT_SPAN;
var CHUNK_SPAN = GEAR_SPAN * 3n;
var LENGTHS = [0, 1, 2, 3].map((k) => {
  let d = 0;
  while (64n ** BigInt(d) < CHUNK_SPAN ** BigInt(k))
    d++;
  return Number(TEAM_BITS / 6n) + d;
});
var digits = (n, count) => {
  let out = "";
  for (let i = 0; i < count; i++) {
    out = TAG_DIGITS[Number(n & 63n)] + out;
    n >>= 6n;
  }
  return out;
};
var fits = (what, v, lo, hi) => {
  if (!Number.isInteger(v) || v < lo || v > hi)
    throw new Error(`team code: ${what} ${v} is outside ${lo}-${hi}`);
  return BigInt(v - lo);
};
var rankOf = (vs) => vs.reduce((r, v, i) => r + choose(v + i, i + 1), 0);
var unrank = (r, k) => {
  const out = [];
  for (let i = k - 1; i >= 0; i--) {
    let w = i;
    while (choose(w + 1, i + 1) <= r)
      w++;
    r -= choose(w, i + 1);
    out.unshift(w - i);
  }
  return out;
};
function gearOf(echo, build) {
  const id = echo.mainslot.id;
  let mainslot = 0n, series = 0;
  for (; series < MAINSLOT_SERIES.length; series++) {
    const [base, size] = MAINSLOT_SERIES[series];
    if (id >= base && id < base + size)
      break;
    mainslot += BigInt(size);
  }
  if (series === MAINSLOT_SERIES.length)
    throw new Error(`team code: ${echo.mainslot.name}'s id ${id} is in no echo series`);
  mainslot += BigInt(id - MAINSLOT_SERIES[series][0]);
  const [a, b, c] = echo.sets.map((s) => fits(`${s.name}'s set`, s.id, 1, 64));
  const sonata = c !== void 0 ? SETS + SETS ** 2n + (a * SETS + b) * SETS + c : b !== void 0 ? SETS + a * SETS + b : a;
  const byCost = COSTS.map((cost) => build.slots.filter((s) => s >= cost.from && s < cost.from + cost.n).map((s) => s - cost.from).sort((x, y) => x - y));
  const layout = LAYOUTS.findIndex((l) => l.every((k, i) => k === byCost[i].length));
  if (layout < 0)
    throw new Error(`team code: ${build.name} is no 43311, 44111 or 41111 build`);
  const inLayout = byCost.reduce((r, vs, i) => r * multisets(i, vs.length) + rankOf(vs), 0);
  const mainstat = LAYOUT_SPANS.slice(0, layout).reduce((a2, b2) => a2 + b2, 0) + inLayout;
  return (mainslot * SONATA_SPAN + sonata) * MAINSTAT_SPAN + BigInt(mainstat);
}
function readGear(g) {
  let mainstat = Number(g % MAINSTAT_SPAN);
  g /= MAINSTAT_SPAN;
  let sonata = g % SONATA_SPAN;
  let mainslot = Number(g / SONATA_SPAN), series = 0;
  while (mainslot >= MAINSLOT_SERIES[series][1])
    mainslot -= MAINSLOT_SERIES[series++][1];
  mainslot += MAINSLOT_SERIES[series][0];
  let sets;
  if (sonata < SETS)
    sets = [sonata];
  else if (sonata < SETS + SETS ** 2n) {
    sonata -= SETS;
    sets = [sonata / SETS, sonata % SETS];
  } else {
    sonata -= SETS + SETS ** 2n;
    sets = [sonata / SETS ** 2n, sonata / SETS % SETS, sonata % SETS];
  }
  let layout = 0;
  while (mainstat >= LAYOUT_SPANS[layout])
    mainstat -= LAYOUT_SPANS[layout++];
  const mainstats = [];
  for (let i = COSTS.length - 1; i >= 0; i--) {
    const k = LAYOUTS[layout][i], span = multisets(i, k);
    mainstats.unshift(...unrank(mainstat % span, k).map((v) => v + COSTS[i].from));
    mainstat = Math.floor(mainstat / span);
  }
  return { mainslot, sets: sets.map((s) => Number(s) + 1), mainstats };
}
function teamCode(members, matrix) {
  if (members.length !== 3)
    throw new Error(`team code: ${members.length} members, expected 3`);
  let team = 0n, flags = matrix ? 1n : 0n;
  members.forEach(({ loadout, sequence, weapon, highSubs }, i) => {
    const r = loadout.resonator.id, w = weapon.id;
    const element = fits(`${loadout.resonator.name}'s element`, Math.floor(r / 100) % 10, 1, 6);
    const serial = fits(`${loadout.resonator.name}'s serial`, r % 100, 1, 21);
    const place = fits(`loadout ${loadout.id}'s place`, loadout.id - r * 10, 1, 4);
    const slot = (element * SERIALS + serial) * LOADOUTS + place;
    const type = fits(`${weapon.name}'s type`, Math.floor(w / 1e4) % 10, 1, 5);
    const wSerial = fits(`${weapon.name}'s serial`, Math.floor(w / 10) % 100, 1, 16);
    const digit = fits(`${weapon.name}'s last digit`, w % 10, 4, 7);
    const wSlot = (type * WEAPON_SERIALS + wSerial) * WEAPON_DIGITS + digit;
    const member2 = ((slot * SEQUENCES + fits("sequence", sequence, 0, 6)) * WEAPON_SPAN + wSlot) * REFINES + fits(`${weapon.name}'s rank`, weapon.refinement, 1, 5);
    team = team * MEMBER_SPAN + member2;
    if (highSubs)
      flags |= 2n << BigInt(i);
  });
  const chunks = members.flatMap(({ gear: gear2 }, slot) => gear2 ? [gearOf(gear2.echo, gear2.mainstat) * 3n + BigInt(slot)] : []);
  const gear = chunks.reduceRight((rest, chunk) => rest * CHUNK_SPAN + chunk, 0n);
  return digits(team * 16n + flags, Number(TEAM_BITS / 6n)) + digits(gear, LENGTHS[chunks.length] - Number(TEAM_BITS / 6n));
}
function readTeamCode(text) {
  const teamDigits = Number(TEAM_BITS / 6n), valid = /^[A-Za-z0-9_-]*$/;
  if (text.length < teamDigits || !valid.test(text.slice(0, teamDigits)))
    return null;
  const found = LENGTHS.indexOf(text.length);
  const chunks = found < 0 || !valid.test(text.slice(teamDigits)) ? 0 : found;
  const read = (part) => [...part].reduce((n, c) => n << 6n | BigInt(TAG_DIGITS.indexOf(c)), 0n);
  let team = read(text.slice(0, teamDigits)), rest = chunks ? read(text.slice(teamDigits)) : 0n;
  if (team >= TEAM_SPAN)
    return null;
  const flags = team % 16n;
  team /= 16n;
  const members = [];
  for (let i = 2; i >= 0; i--) {
    let m = team % MEMBER_SPAN;
    team /= MEMBER_SPAN;
    const refinement = Number(m % REFINES) + 1;
    m /= REFINES;
    const wSlot = m % WEAPON_SPAN;
    m /= WEAPON_SPAN;
    const sequence = Number(m % SEQUENCES);
    const slot = m / SEQUENCES;
    const place = Number(slot % LOADOUTS) + 1, rSlot = slot / LOADOUTS;
    const resonator = 1e3 + Number(rSlot / SERIALS + 1n) * 100 + Number(rSlot % SERIALS + 1n);
    const weapon = 21e6 + Number(wSlot / (WEAPON_SERIALS * WEAPON_DIGITS) + 1n) * 1e4 + Number(wSlot / WEAPON_DIGITS % WEAPON_SERIALS + 1n) * 10 + Number(wSlot % WEAPON_DIGITS + 4n);
    members.unshift({ resonator, loadout: place, sequence, weapon, refinement, highSubs: (flags & 2n << BigInt(i)) !== 0n, gear: null });
  }
  const gear = [null, null, null];
  for (let k = 0; k < chunks; k++) {
    const chunk = rest % CHUNK_SPAN;
    rest /= CHUNK_SPAN;
    const slot = Number(chunk % 3n);
    if (gear[slot])
      return { members, matrix: (flags & 1n) !== 0n };
    gear[slot] = readGear(chunk / 3n);
  }
  if (rest !== 0n)
    return { members, matrix: (flags & 1n) !== 0n };
  for (let i = 0; i < 3; i++)
    members[i].gear = gear[i];
  return { members, matrix: (flags & 1n) !== 0n };
}

// dist/src/page/model.js
var TEAMS = Object.fromEntries(ALL_TEAMS.map(({ loadouts, mdps }, i) => [
  teamKey(i),
  loadouts.map((l, j) => member(l, mdps[j]))
]));
var PRIMARY_TEAMS = new Set(PRIMARY_TEAM.flatMap((primary, i) => primary ? [teamKey(i)] : []));
var MDPS_NAMES = /* @__PURE__ */ new Set();
for (const members of Object.values(TEAMS))
  for (const m of members)
    if (m.mainDps)
      MDPS_NAMES.add(m.name);
var RESONATOR_NAME_BY_COMPACT = /* @__PURE__ */ new Map();
for (const members of Object.values(TEAMS)) {
  for (const m of members) {
    for (const form of [m.name, `${m.name} (mdps)`, `${m.name} (support)`]) {
      RESONATOR_NAME_BY_COMPACT.set(form.replace(/ /g, ""), m.name);
    }
  }
}
var RESONATOR_HUE = new Map(ALL_TEAMS.flatMap((t) => t.loadouts).map((l) => [l.resonator.name, l.resonator.color]));
var FALLBACK_HUE = "#ff0000";
var SIGNATURE_HUE = /* @__PURE__ */ new Map([["Blazing Brilliance", "#f38b68"], ["Verity's Handle", "#6b74e8"]]);
for (const pass of [true, false]) {
  for (const l of ALL_TEAMS.flatMap((t) => t.loadouts)) {
    for (const w of pass ? l.weapons.slice(0, 1) : l.weapons) {
      if (w.tier === 0 && !SIGNATURE_HUE.has(weaponBase(w)))
        SIGNATURE_HUE.set(weaponBase(w), l.resonator.color);
    }
  }
}
function weaponHue(w) {
  if (w.tier === 0)
    return SIGNATURE_HUE.get(weaponBase(w)) ?? FALLBACK_HUE;
  const atk = w.decl.stats.find(
    (line) => line[0] === 0
    /* Stat.BaseAtk */
  )?.[1] ?? 0;
  return atk >= 500 ? "#ffffff" : "#b07cff";
}
var MATRIX_RESONATORS = new Set(ALL_TEAMS.flatMap((t) => t.loadouts).filter((l) => l.resonator.matrix).map((l) => l.resonator.name));
var resonatorFilters = /* @__PURE__ */ new Map();
var echoFilters = /* @__PURE__ */ new Map();
var OPTION_FILTER_MAPS = { echo: echoFilters };
var filters = defaultFilters();
var pinnedRows = /* @__PURE__ */ new Set();
var gearCache = null;
function offeredGear(kind, f = filters) {
  const sig = filterSignature(f);
  if (gearCache?.sig !== sig) {
    const offered = { echo: /* @__PURE__ */ new Set() };
    for (const members of Object.values(TEAMS)) {
      for (const m of members) {
        if (axisOpen(m, f, "echoes"))
          for (const e of echoPicks(m, members))
            offered.echo.add(echoLabel(m.loadout, m.loadout.echoLoadouts[e]));
      }
    }
    gearCache = { sig, offered };
  }
  return gearCache.offered[kind];
}
function pruneGearFilters() {
  for (const kind of ["echo"]) {
    const offered = offeredGear(kind);
    for (const key of [...OPTION_FILTER_MAPS[kind].keys()])
      if (!offered.has(key))
        OPTION_FILTER_MAPS[kind].delete(key);
  }
}
function settleLevels() {
  const reach = /* @__PURE__ */ new Map();
  for (const ms of Object.values(TEAMS))
    for (const m of ms) {
      if (!reach.has(m.name))
        reach.set(m.name, /* @__PURE__ */ new Set());
      for (const n of memberLevels(m))
        reach.get(m.name).add(n);
    }
  for (const name of new Set([...resonatorFilters.keys()].map(tagOwner))) {
    const levels = [...reach.get(name) ?? []].sort((a, b) => a - b);
    const keys = [...resonatorFilters].filter(([key]) => tagOwner(key) === name);
    for (const [key] of keys)
      if (!levels.includes(parseTag(key).sequence))
        resonatorFilters.delete(key);
    if (!keys.some(([, mode]) => mode === "include") || included(name) || !levels.length)
      continue;
    const m = memberNamed(name);
    const tag = m ? buildTag(m, filters.cost, false) ?? buildTag(m, filters.cost, true) : null;
    resonatorFilters.set(tag ?? joinTag(name, levels[0], ""), "include");
  }
}
function comparable(name, axis) {
  for (const members of Object.values(TEAMS)) {
    for (const m of members) {
      if (m.name !== name)
        continue;
      const l = m.loadout;
      const n = axis === "weapons" ? l.weapons.length : axis === "echoes" ? echoPicks(m, members).length : axis === "mainstats" ? l.mainstats.length : axis === "substats" ? 2 : axis === "refines" ? Math.max(...l.refinements.map((r) => r.length)) : l.sequences.length ? l.sequences.length - Math.max(l.minSequence, l.resonator.tier === 1 ? 0 : Math.min(baseSequence(l.resonator), l.sequences.length)) + 1 : 1;
      if (n > 1)
        return true;
    }
  }
  return false;
}
var ROW_CAP = 3e3;
var bestPicks = /* @__PURE__ */ new Map();
var picksCache = /* @__PURE__ */ new Map();
var results = /* @__PURE__ */ new Map();
function storeSolved(teamKey2, solved, f = filters) {
  bestPicks.set(bestKey(teamKey2, TEAMS[teamKey2], f), solved);
  picksCache.set(picksKey(teamKey2, TEAMS[teamKey2], f), solved.picks);
  solvesDirty = true;
}
var visibleRows = [];
var setVisibleRows = (rows) => {
  visibleRows = rows;
};
var namesHold = (map, names) => [...map].every(([name, mode]) => names.includes(name) === (mode === "include"));
var NAMES_LONGEST = [...RESONATOR_HUE.keys()].sort((a, b) => b.length - a.length);
var tagOwner = (tag) => NAMES_LONGEST.find((n) => tag === n || tag.startsWith(`${n} `)) ?? tag;
function parseTag(tag) {
  const owner = tagOwner(tag);
  const [, seq, joined, sig, named2] = /^(?: S(\d))?(?:(R\d)| (R\d)| (.+ R\d))?$/.exec(tag.slice(owner.length)) ?? [];
  return { owner, sequence: +(seq ?? 0), part: joined ?? sig ?? named2 ?? "" };
}
var memberNamed = (name) => {
  for (const ms of Object.values(TEAMS))
    for (const m of ms)
      if (m.name === name)
        return m;
  return void 0;
};
var signatureOf = (m) => isSignature(m.loadout, 0) ? weaponBase(m.loadout.weapons[0]) : null;
function weaponPart(m, weapon, cost = filters.cost) {
  const l = m.loadout, base = weaponBase(weapon), std = standardWeapon(l);
  if (base === signatureOf(m))
    return `R${weapon.refinement}`;
  if (base === weaponBase(l.weapons[std]) && [true, false].some((h) => l.refinements[std][costRefine(m, std, cost, h)].name === weapon.name))
    return "";
  return `${base} R${weapon.refinement}`;
}
var joinTag = (name, sequence, part) => name + (sequence ? ` S${sequence}` : "") + (!part ? "" : /^R\d$/.test(part) && sequence ? part : ` ${part}`);
var memberTag = (m, combo, cost = filters.cost) => joinTag(m.name, combo.sequence, weaponPart(m, combo.weapon, cost));
function buildTag(m, cost, holds) {
  const b = costBuild(m, cost, holds);
  return b ? joinTag(m.name, b.sequence, weaponPart(m, m.loadout.refinements[b.weapon][b.refine], cost)) : null;
}
var costTag = (m) => buildTag(m, filters.cost, false) ?? buildTag(m, filters.cost, true) ?? m.name;
function tagWeapon(m, part, cost) {
  const l = m.loadout, all = l.refinements.flat();
  if (!part) {
    const std = standardWeapon(l);
    return l.refinements[std][costRefine(m, std, cost, false)];
  }
  if (/^R\d$/.test(part))
    return signatureOf(m) ? l.refinements[0].find((w) => `R${w.refinement}` === part) : void 0;
  return all.find((w) => `${weaponBase(w)} R${w.refinement}` === part);
}
var memberLevels = (m, f = filters) => [...new Set(grantToOne(f.cost) ? sequenceLevels(m, f, m.mainDps) : sequenceLevels(m, f, true))].sort((a, b) => a - b);
var included = (name) => [...resonatorFilters].some(([key, mode]) => mode === "include" && tagOwner(key) === name);
function tagHolds(tag, m, combo, f = filters) {
  const tiers = [true, false].map((h) => buildTag(m, f.cost, h));
  if (tiers.includes(tag) && tiers.includes(memberTag(m, combo, f.cost)))
    return true;
  if (shownRanks(m, f).some(([w, r, s]) => s === combo.sequence && m.loadout.refinements[w]?.[r]?.name === combo.weapon.name))
    return true;
  const t = parseTag(tag);
  if (t.sequence !== combo.sequence && !axisOpen(m, f, "sequences"))
    return false;
  if (axisOpen(m, f, "weapons"))
    return true;
  const part = weaponPart(m, combo.weapon, f.cost), unranked = (p) => p.replace(/ ?R\d$/, "");
  return part === t.part || axisUsed(m, f, "refines") && unranked(part) === unranked(t.part);
}
function carryTags(from, to) {
  const roles = (name, cost) => {
    const f = { ...filters, cost }, hold = /* @__PURE__ */ new Set(), rest = /* @__PURE__ */ new Set();
    for (const ms of Object.values(TEAMS)) {
      const i = ms.findIndex((m) => m.name === name);
      if (i < 0 || !ms.every((m) => hasBuild(m, f)))
        continue;
      const holders = grantHolders(ms, f);
      const h = holders.includes(i) ? buildTag(ms[i], cost, true) : null;
      const r = holders.length === 1 && holders[0] === i ? null : buildTag(ms[i], cost, false);
      if (h)
        hold.add(h);
      if (r)
        rest.add(r);
    }
    return { hold, rest };
  };
  const reach = (name, cost) => {
    const f = { ...filters, cost }, out = /* @__PURE__ */ new Set();
    for (const ms of Object.values(TEAMS))
      for (const m of ms)
        if (m.name === name)
          for (const n of memberLevels(m, f))
            out.add(n);
    return out;
  };
  for (const name of new Set([...resonatorFilters.keys()].map(tagOwner))) {
    const was = roles(name, from), now = roles(name, to), m = memberNamed(name);
    for (const [tag, mode] of [...resonatorFilters].filter(([key]) => tagOwner(key) === name)) {
      const out = /* @__PURE__ */ new Set();
      if (was.hold.has(tag))
        for (const t of now.hold)
          out.add(t);
      if (was.rest.has(tag))
        for (const t of now.rest)
          out.add(t);
      if (!was.hold.has(tag) && !was.rest.has(tag)) {
        const t = parseTag(tag), w = m ? tagWeapon(m, t.part, from) : void 0;
        const b = m && !reach(name, to).has(t.sequence) ? costBuild(m, to, false) ?? costBuild(m, to, true) : null;
        out.add(m && w ? joinTag(name, b?.sequence ?? t.sequence, weaponPart(m, w, to)) : tag);
      } else if (!out.size)
        for (const t of [...now.rest, ...now.hold])
          out.add(t);
      resonatorFilters.delete(tag);
      for (const t of out)
        if (!resonatorFilters.has(t))
          resonatorFilters.set(t, mode);
    }
  }
}
var tagShows = /* @__PURE__ */ new Set();
var isTagShow = (s) => tagShows.has(scopedKey(s));
function syncTagShows() {
  const want = /* @__PURE__ */ new Map();
  for (const [tag, mode] of resonatorFilters) {
    const t = parseTag(tag), m = memberNamed(t.owner);
    if (mode !== "include" || !t.part || !m || [true, false].some((h) => buildTag(m, filters.cost, h) === tag))
      continue;
    const w = tagWeapon(m, t.part, filters.cost);
    if (!w)
      continue;
    const s = { resonator: t.owner, on: "rank", value: rankValue(w.name, t.sequence), axis: "refines" };
    want.set(scopedKey(s), s);
  }
  filters.scoped = filters.scoped.filter((s) => !tagShows.has(scopedKey(s)) || want.has(scopedKey(s)));
  for (const key of [...tagShows])
    if (!want.has(key))
      tagShows.delete(key);
  for (const [key, s] of want) {
    if (filters.scoped.some((x) => scopedKey(x) === key))
      continue;
    filters.scoped.push(s);
    tagShows.add(key);
  }
}
function tagsHold(row) {
  const wanted = /* @__PURE__ */ new Map();
  for (const [tag, mode] of resonatorFilters) {
    const at = row.members.findIndex((m) => m.name === tagOwner(tag));
    if (mode === "exclude") {
      if (at >= 0 && memberTag(row.members[at], row.combo[at]) === tag)
        return false;
      continue;
    }
    if (at >= 0)
      wanted.set(at, [...wanted.get(at) ?? [], tag]);
  }
  return [...wanted].every(([at, tags]) => tags.some((tag) => tagHolds(tag, row.members[at], row.combo[at])));
}
var poolAdded = [];
var poolNeeds = /* @__PURE__ */ new Map();
var poolAlone = /* @__PURE__ */ new Set();
var poolKey = null;
function leaderNeeds() {
  const added = [...new Set([...resonatorFilters].filter(([, mode]) => mode === "include").map(([key2]) => tagOwner(key2)))];
  const key = added.join("\0");
  if (key === poolKey)
    return poolNeeds;
  [poolKey, poolAdded, poolNeeds] = [key, added, /* @__PURE__ */ new Map()];
  poolAlone = new Set(added);
  for (const ms of Object.values(TEAMS)) {
    const here = added.filter((o) => ms.some((x) => x.name === o));
    if (here.length > 1)
      for (const o of here)
        poolAlone.delete(o);
    const whole = ms.every((x) => added.includes(x.name));
    for (const m of ms) {
      if (!MDPS_NAMES.has(m.name) || !added.includes(m.name))
        continue;
      const held = m.mainDps || whole ? added.filter((o) => o !== m.name && ms.some((x) => x.name === o)).length : 0;
      poolNeeds.set(m.name, Math.max(poolNeeds.get(m.name) ?? 0, held));
    }
  }
  return poolNeeds;
}
function teamWanted(key, members) {
  const has = (name) => members.some((m) => m.name === name);
  if (!PRIMARY_TEAMS.has(key) && !members.some((m) => INTERCHANGEABLE.has(m.loadout) && included(m.name)) && !members.every((m) => INTERCHANGEABLE.has(m.loadout) || included(m.name)))
    return false;
  for (const m of members) {
    const keys = [...resonatorFilters].filter(([key2]) => tagOwner(key2) === m.name);
    if (!keys.length)
      continue;
    const open = axisOpen(m, filters, "sequences") || axisOpen(m, filters, "weapons") || axisUsed(m, filters, "refines") || shownRanks(m, filters).length > 0;
    const builds = [true, false].map((h) => buildTag(m, filters.cost, h)).filter((t) => t !== null);
    if (!open && builds.length && builds.every((t) => resonatorFilters.get(t) === "exclude"))
      return false;
    const levels = memberLevels(m);
    if (!filters.sequences.includes(m.name) && keys.some(([, mode]) => mode === "include") && !keys.some(([key2, mode]) => mode === "include" && levels.includes(parseTag(key2).sequence)))
      return false;
  }
  const needs = leaderNeeds();
  if (poolAdded.length > 1 && poolAdded.some((o) => poolAlone.has(o) && has(o)))
    return true;
  if (!needs.size)
    return poolAdded.every(has);
  for (const m of members) {
    const need = needs.get(m.name);
    if (need === void 0)
      continue;
    const others = poolAdded.filter((o) => o !== m.name && has(o)).length;
    const wants = m.mainDps || poolAdded.length < 2 ? need : Math.max(need, 1);
    if (others >= wants)
      return true;
  }
  return false;
}
function sequenceTagAt(m, sequence, f = filters) {
  if (!axisOpen(m, f, "sequences"))
    return null;
  return `${m.name} S${sequence}`;
}
var sequenceTag = (m, combo) => sequenceTagAt(m, combo.sequence);
var refineTag = (m, combo) => `${m.name} R${combo.weapon.refinement}`;
function rowWanted(row) {
  return namesHold(echoFilters, row.combo.map((c, i) => echoLabel(row.members[i].loadout, c.echo))) && tagsHold(row);
}
function admitBuild(members, combo) {
  const fielded = members.map((m) => m.name);
  const fit = (map, names, tagged) => {
    for (const [name, mode] of [...map]) {
      if (names.includes(name) === (mode === "include"))
        continue;
      const own = tagged && mode === "include" ? names.find((n) => tagOwner(n) === tagOwner(name)) : void 0;
      if (own)
        map.set(own, "include");
      else if (!tagged || mode === "exclude" || fielded.includes(tagOwner(name)))
        map.delete(name);
    }
  };
  fit(echoFilters, combo.map((c, i) => echoLabel(members[i].loadout, c.echo)), false);
  fit(resonatorFilters, combo.map((c, i) => memberTag(members[i], c)), true);
}
function admitTeam(teamKey2) {
  const members = TEAMS[teamKey2];
  for (const [key, mode] of [...resonatorFilters]) {
    if (mode === "exclude" && members.some((m) => m.name === tagOwner(key)))
      resonatorFilters.delete(key);
  }
  const holders = grantHolders(members, filters);
  for (const [i, m] of members.entries()) {
    if (teamWanted(teamKey2, members))
      return;
    const tag = buildTag(m, filters.cost, holders.includes(i)) ?? buildTag(m, filters.cost, false);
    if (tag)
      resonatorFilters.set(tag, "include");
  }
}
function snapshotFilters() {
  const kept = structuredClone(filters);
  const maps = [resonatorFilters, ...Object.values(OPTION_FILTER_MAPS)].map((map) => [map, [...map]]);
  return () => {
    Object.assign(filters, kept);
    for (const [map, entries] of maps) {
      map.clear();
      for (const [name, mode] of entries)
        map.set(name, mode);
    }
  };
}
function expandTeam(teamKey2, members, all = false, f = filters) {
  const solved = bestPicks.get(bestKey(teamKey2, members, f));
  if (!solved || !all && !teamWanted(teamKey2, members))
    return [];
  const rows = /* @__PURE__ */ new Map();
  const file = (picks, score, list) => {
    const combo = picks.map((p, i) => comboOf(members[i].loadout, p));
    const key = `${teamKey2}-${combo.map((c) => c.key).join("-")}`;
    if (list && !rows.has(key))
      rows.set(key, { key, teamKey: teamKey2, members, combo });
    if (score && !results.has(key))
      results.set(key, runFromScore(teamKey2, members, combo, score));
  };
  solved.rows.forEach((picks, r) => file(picks, solved.scores[r], true));
  (solved.hidden ?? []).forEach((picks, r) => file(picks, solved.hiddenScores?.[r], false));
  return all ? [...rows.values()] : [...rows.values()].filter(rowWanted);
}
function teamRows() {
  const rows = Object.entries(TEAMS).flatMap(([key, members]) => expandTeam(key, members));
  const listed = new Set(rows.map((row) => row.key));
  for (const key of pinnedRows) {
    const row = listed.has(key) ? null : rowFromKey(key);
    if (row)
      rows.push(row);
  }
  return rows;
}
var solvedRows = (teamKey2, f = filters) => expandTeam(teamKey2, TEAMS[teamKey2], true, f);
function axisWays(lists, map, cap = Infinity, tagged = false) {
  const excluded = [...map].filter(([, mode]) => mode === "exclude").map(([n]) => n);
  const sizes = (drop) => lists.map((l) => l === null ? 1 : l.filter((n) => !drop.includes(n)).length);
  const product = (drop) => sizes(drop).reduce((p, n) => p * Math.min(cap, n), 1);
  const untestable = lists.includes(null) || sizes(excluded).some((n) => n > cap);
  const included2 = untestable ? [] : [...map].filter(([, mode]) => mode === "include").map(([n]) => n);
  const groups = /* @__PURE__ */ new Map();
  for (const name of included2) {
    const key = tagged ? tagOwner(name) : name;
    groups.set(key, [...groups.get(key) ?? [], name]);
  }
  const wanted = [...groups.values()].filter((group) => !tagged || lists.some((l) => l?.some((n) => tagOwner(n) === tagOwner(group[0]))));
  let total = 0;
  for (let mask = 0; mask < 1 << wanted.length; mask++) {
    const chosen = wanted.filter((_, k) => mask & 1 << k);
    total += (chosen.length % 2 ? -1 : 1) * product([...excluded, ...chosen.flat()]);
  }
  return total;
}
function estimatedRowCount(members, f = filters) {
  return axisWays(members.map((m) => axisOpen(m, f, "weapons") ? eligibleWeapons(m, f).map((i) => m.loadout.weapons[i].name) : null), /* @__PURE__ */ new Map()) * axisWays(members.map((m) => axisOpen(m, f, "echoes") ? echoPicks(m, members).map((e) => echoLabel(m.loadout, m.loadout.echoLoadouts[e])) : null), echoFilters) * members.reduce((n, m) => n * (axisOpen(m, f, "mainstats") ? m.loadout.mainstats.length : 1), 1) * members.reduce((n, m) => n * Math.max(1, memberLevels(m, f).length), 1) * members.reduce((n, m) => n * (axisOpen(m, f, "substats") ? 2 : 1), 1) * members.reduce((n, m) => n * (axisUsed(m, f, "refines") ? Math.max(...eligibleWeapons(m, f).map((i) => m.loadout.refinements[i].length)) : 1 + shownRanks(m, f).length), 1) * members.reduce((n, m) => n * (!axisOpen(m, f, "echoes") && axisUsed(m, f, "echoes") ? echoPicks(m, members).length : 1) * (!axisOpen(m, f, "mainstats") && axisUsed(m, f, "mainstats") ? m.loadout.mainstats.length : 1), 1);
}
function prospectiveRows(f = filters) {
  return Object.entries(TEAMS).filter(([key, members]) => teamWanted(key, members)).reduce((sum, [, members]) => sum + estimatedRowCount(members, f), pinnedRows.size);
}
var COMBO_KEY = /^(\d+)\.(\d+)\.(\d+)\.s(\d+)\.r(\d+)(\.m)?(\.h)?$/;
function picksOfKey(key) {
  const picks = [];
  for (const k of key.split("-").slice(1)) {
    const p = COMBO_KEY.exec(k);
    if (!p)
      return null;
    picks.push({ weapon: +p[1], echo: +p[2], mainstat: +p[3], sequence: +p[4], refine: +p[5], matrix: !!p[6], highSubs: !!p[7] });
  }
  return picks;
}
function rowFromKey(key) {
  const teamKey2 = key.split("-")[0];
  const members = teamKey2 ? TEAMS[teamKey2] : void 0;
  const picks = picksOfKey(key);
  if (!teamKey2 || !members || !picks || picks.length !== members.length)
    return null;
  const combo = [];
  for (let i = 0; i < members.length; i++) {
    const l = members[i].loadout;
    const pick = picks[i];
    if (!l.refinements[pick.weapon]?.[pick.refine] || !echoPicks(members[i], members).includes(pick.echo) || !l.mainstats[pick.mainstat] || !l.fits(pick.echo, pick.mainstat) || pick.matrix && !l.resonator.matrix || pick.sequence < l.minSequence)
      return null;
    combo.push(comboOf(l, pick));
  }
  return { key, teamKey: teamKey2, members, combo };
}
function detailFor(run) {
  if (run.detail)
    return run.detail;
  if (!run.rotationLines || !run.state) {
    const traced = runTeam(run.teamKey, run.members, run.combo, true);
    run.rotationLines = traced.rotationLines;
    run.state = traced.state;
  }
  run.detail = { report: buildReport(run.rotationLines.flat()), needs: energyNeeds(run) };
  return run.detail;
}
function energyNeeds(run) {
  const erOf = erRollsFor(run.teamKey, run.members, run.combo);
  return new Map(run.members.map((m, idx) => {
    const combo = run.combo[idx];
    const constant = menuStats(m.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs, erOf[idx])).reduce((n, e) => n + (e.stat === 11 ? e.value : 0), 0);
    const slot = run.state.slots[idx];
    const worst = m.loadout.resonator.maxEnergy ? slot.erWorst : 0;
    const parts = worst > 0 ? slot.erParts[slot.erWants.indexOf(worst)] : void 0;
    const gen = parts ? {
      hit: parts.hit,
      flat: parts.flat,
      spend: parts.spend,
      shared: run.state.slots.filter((s) => s !== slot).map((s) => [s.name, parts.got[s.index] ?? 0])
    } : null;
    return [m.name, { bar: worst > 0 ? worst : null, minEr: m.loadout.minEr, constant, gen }];
  }));
}
function memberLabel(m, combo, inCell, showMode = m.mainDps) {
  return [showMode ? loadoutName(m.loadout) : m.name, `${seqToken(m, combo)}${rankToken(m, combo, inCell)}`].filter(Boolean).join(" ");
}
var seqToken = (m, combo) => combo.sequence > 0 || axisOpen(m, filters, "sequences") ? `S${combo.sequence}` : "";
var rankToken = (m, combo, inCell) => inCell ? "" : compares(m, filters, "refines", combo) || combo.weapon.tier === 0 || shownRanks(m, filters).some(([w, , s]) => weaponBase(m.loadout.weapons[w]) === weaponBase(combo.weapon) && s === combo.sequence) ? `R${combo.weapon.refinement}` : "";
var SOLVES_KEY = "wuwa.solves.v1";
var buildStamp = null;
var kitStamps = null;
var solvesDirty = false;
var shippedStates = null;
var shippedFetched = /* @__PURE__ */ new Set();
var shippedFiles = /* @__PURE__ */ new Set();
var shippedKeys = /* @__PURE__ */ new Set();
var restoredSolves = false;
function discardRestoredSolves() {
  if (!restoredSolves)
    return false;
  restoredSolves = false;
  bestPicks.clear();
  picksCache.clear();
  results.clear();
  shippedKeys.clear();
  shippedStates = null;
  shippedFiles.clear();
  shippedFetched.clear();
  try {
    localStorage.removeItem(SOLVES_KEY);
  } catch {
  }
  return true;
}
function filtersOfKey(key, members) {
  const [, cost, bits] = key.split("|");
  const f = defaultFilters();
  f.cost = cost;
  (bits ?? "").split(",").forEach((entry, i) => {
    const m = members[i];
    if (!m)
      return;
    const [head, scoped] = entry.split(":");
    const b = head.startsWith("m") ? head.slice(1) : head;
    if (head.startsWith("m"))
      f.matrix.push(m.loadout.resonator.name);
    AXES.forEach((a, k) => {
      if (b[k] === "1")
        f[a].push(m.loadout.resonator.name);
    });
    for (const s of (scoped ?? "").split(";").filter(Boolean)) {
      const [on, value, axis] = s.split("~");
      f.scoped.push({ resonator: m.loadout.resonator.name, on, value, axis });
    }
  });
  return f;
}
function picksFit(key, picks) {
  const team = teamAt(key.split("|")[0]);
  if (!team)
    return false;
  const roster = team.loadouts.map((l) => l.resonator);
  return picks.length === team.loadouts.length && picks.every((p, i) => {
    const l = team.loadouts[i];
    return p.weapon < l.weapons.length && p.refine < (l.refinements[p.weapon]?.length ?? 0) && !!l.echoLoadouts[p.echo]?.fits(roster) && p.mainstat < l.mainstats.length && l.fits(p.echo, p.mainstat) && p.sequence >= l.minSequence;
  });
}
function solveFits(key, solved, f) {
  const team = teamAt(key.split("|")[0]);
  if (!team)
    return false;
  const members = team.loadouts.map((l, i) => member(l, team.mdps[i]));
  f ??= filtersOfKey(key, members);
  if (!picksFit(key, solved.picks) || !solved.rows.every((r) => picksFit(key, r)) || !(solved.hidden ?? []).every((r) => picksFit(key, r)))
    return false;
  const names = /* @__PURE__ */ new Set([...members.map((m) => m.name), TUNE_BREAK_ENEMY.name]);
  const dps = members.filter((m) => m.mainDps).map((m) => m.name);
  if (!solved.scores.every((s) => s.bySlot.every(([n]) => names.has(n)) && dps.every((d) => s.bySlot.some(([n]) => n === d))))
    return false;
  const expected = members.reduce((n, m, i) => {
    const pairs = /* @__PURE__ */ new Set();
    const weapons = axisOpen(m, f, "weapons") ? eligibleWeapons(m, f) : [solved.picks[i].weapon];
    const levels = axisOpen(m, f, "sequences") ? sequenceLevels(m, f) : [solved.picks[i].sequence];
    for (const sequence of levels)
      for (const weapon of [...weapons, ...shownWeapons(m, f, weapons)]) {
        for (const refine of refineLevels(m, f, { ...solved.picks[i], weapon, sequence }, weapons.includes(weapon)))
          pairs.add(`${sequence}.${refine}`);
      }
    if (!axisOpen(m, f, "sequences"))
      for (const [, refine, sequence] of shownExtraLevels(m, f, solved.picks[i].sequence))
        pairs.add(`${sequence}.${refine}`);
    return n * pairs.size;
  }, 1);
  const patterns = new Set(solved.rows.map((r) => r.map((p) => `${p.sequence}.${p.refine}`).join(".")));
  return patterns.size === expected;
}
async function loadShipped(f) {
  const sig = filterSignature(f);
  if (!shippedStates || shippedFetched.has(sig))
    return;
  shippedFetched.add(sig);
  const entry = shippedStates[sig];
  if (!entry)
    return;
  for (const file of typeof entry === "string" ? [entry] : entry) {
    if (shippedFiles.has(file))
      continue;
    shippedFiles.add(file);
    try {
      const res = await fetch(`./dist/solves/${file}`, { cache: "no-store" });
      if (!res.ok)
        continue;
      const saved = await res.json();
      for (const [k, v] of saved.solves)
        if (!bestPicks.has(k) && solveFits(k, v)) {
          bestPicks.set(k, v);
          shippedKeys.add(k);
          restoredSolves = true;
        }
      for (const [k, v] of saved.picks)
        if (!picksCache.has(k) && picksFit(k, v)) {
          picksCache.set(k, v);
          restoredSolves = true;
        }
    } catch {
    }
  }
}
async function loadSolves() {
  const restore = (saved) => {
    if (saved.stamp !== buildStamp)
      return;
    const kitsSame = (key) => !kitStamps || !!teamAt(key.split("|")[0])?.loadouts.every((l) => saved.kits?.[l.resonator.name] === kitStamps[l.resonator.name]);
    for (const [k, v] of saved.solves)
      if (kitsSame(k) && solveFits(k, v)) {
        bestPicks.set(k, v);
        restoredSolves = true;
      }
    for (const [k, v] of saved.picks)
      if (kitsSame(k) && picksFit(k, v)) {
        picksCache.set(k, v);
        restoredSolves = true;
      }
  };
  try {
    const live = await fetch("/__solvestamp", { cache: "no-store" }).catch(() => null);
    if (live?.ok) {
      const dev = await live.json();
      buildStamp = `dev:${dev.global}`;
      kitStamps = dev.kits;
    } else {
      const idx = await fetch("./dist/solves/index.json", { cache: "no-store" });
      if (!idx.ok)
        return;
      const meta = await idx.json();
      buildStamp = meta.stamp;
      shippedStates = meta.states;
      await loadShipped(filters);
    }
    const raw = localStorage.getItem(SOLVES_KEY);
    if (raw)
      restore(JSON.parse(raw));
  } catch {
  }
}
function saveSolves() {
  if (buildStamp === null || !solvesDirty)
    return;
  solvesDirty = false;
  try {
    const save = {
      stamp: buildStamp,
      solves: [...bestPicks].filter(([k]) => !shippedKeys.has(k)),
      picks: [...picksCache],
      ...kitStamps ? { kits: kitStamps } : {}
    };
    localStorage.setItem(SOLVES_KEY, JSON.stringify(save));
  } catch {
  }
}
var hashParams = () => new URLSearchParams(location.hash.replace(/^#/, ""));
var COMPARE_PARAM = { weapons: "cw", echoes: "ce", mainstats: "cm", substats: "cb", sequences: "cq", refines: "cr" };
var SCOPED_PARAM = "cs";
var COST_CODE = {
  s0r0: "r0",
  s0r1mdps: "r1m",
  s0r1: "r1",
  s2r1mdps: "s2m",
  s3r1mdps: "s3m",
  s6r1mdps: "s6m",
  s6r1mdps_s2r1: "s6ms2",
  s6r5mdps: "s6r5m",
  s6r5: "s6r5"
};
var FILTER_GROUPS = [
  { include: "r", exclude: "x", map: resonatorFilters },
  { include: "er", exclude: "ex", map: echoFilters }
];
var compactTag = (tag) => {
  const owner = tagOwner(tag);
  return owner.replace(/ /g, "") + tag.slice(owner.length).replace(/^ /, "");
};
var COMPACT_LONGEST = [...RESONATOR_NAME_BY_COMPACT.keys()].sort((a, b) => b.length - a.length);
function applyHash() {
  const params = hashParams();
  let changed = false;
  {
    const legacy2 = (params.get("f") ?? "").split(",").filter(Boolean);
    const next = params.get("mx") || legacy2.includes("x") || legacy2.includes("matrix") ? [...MATRIX_RESONATORS] : [];
    const cur = filters.matrix;
    if (next.length !== cur.length || next.some((n) => !cur.includes(n))) {
      filters.matrix = next;
      changed = true;
    }
  }
  const code = params.get("tc");
  const cost = Object.keys(COST_CODE).find((c) => COST_CODE[c] === code) ?? "s0r1";
  if (filters.cost !== cost) {
    filters.cost = cost;
    changed = true;
  }
  for (const axis of AXES) {
    const next = (params.get(COMPARE_PARAM[axis]) ?? "").split(",").filter(Boolean).map((n) => RESONATOR_NAME_BY_COMPACT.get(n) ?? n);
    const cur = filters[axis];
    if (next.length !== cur.length || next.some((n) => !cur.includes(n))) {
      filters[axis] = next;
      changed = true;
    }
  }
  {
    const next = (params.get(SCOPED_PARAM) ?? "").split(",").filter(Boolean).map((e) => {
      const [resonator, on, value, axis] = decodeURIComponent(e).split("~");
      return { resonator, on, value, axis };
    });
    const cur = filters.scoped.filter((s) => !isTagShow(s)).map(scopedKey);
    if (next.length !== cur.length || next.some((s) => !cur.includes(scopedKey(s)))) {
      filters.scoped = next;
      changed = true;
    }
  }
  const resonatorKey = (v) => {
    const compact = COMPACT_LONGEST.find((c) => v.startsWith(c)) ?? v;
    const rest = v.slice(compact.length).trim();
    return `${RESONATOR_NAME_BY_COMPACT.get(compact) ?? compact}${rest ? ` ${rest}` : ""}`;
  };
  const weaponKey = (v) => {
    const owner = tagOwner(v), m = memberNamed(owner);
    const [, seq, name] = /^(?: S(\d))? (.+)$/.exec(v.slice(owner.length)) ?? [];
    const w = m && name ? m.loadout.refinements.flat().find((x) => x.name === name || weaponBase(x) === name) : void 0;
    return m && w ? joinTag(owner, +(seq ?? 0), weaponPart(m, w, filters.cost)) : null;
  };
  const named2 = (v, mode, resonators) => (v ?? "").split(",").filter(Boolean).map((name) => [resonators ? resonatorKey(name) : name, mode]);
  const legacy = (v, mode) => (v ?? "").split(",").filter(Boolean).flatMap((name) => {
    const tag = weaponKey(name);
    return tag ? [[tag, mode]] : [];
  });
  for (const { include, exclude, map } of FILTER_GROUPS) {
    const resonators = map === resonatorFilters;
    const read = (key, old) => [params.get(key), resonators ? params.get(old) : null].filter(Boolean).join(",") || null;
    const next = new Map([
      ...named2(read(exclude, "sx"), "exclude", resonators),
      ...named2(read(include, "sr"), "include", resonators),
      ...resonators ? [...legacy(params.get("wx"), "exclude"), ...legacy(params.get("wr"), "include")] : []
    ]);
    if (next.size !== map.size || [...next].some(([n, m]) => map.get(n) !== m)) {
      map.clear();
      for (const [name, mode] of next)
        map.set(name, mode);
      changed = true;
    }
  }
  if (changed)
    syncTagShows();
  {
    const next = (params.get("pin") ?? "").split(",").filter(Boolean).map(keyOfTag).filter((key) => rowFromKey(key));
    if (next.length !== pinnedRows.size || next.some((key) => !pinnedRows.has(key))) {
      pinnedRows.clear();
      for (const key of next)
        pinnedRows.add(key);
      changed = true;
    }
  }
  return changed;
}
var gearShut = (f) => ({
  ...f,
  echoes: [],
  mainstats: [],
  scoped: f.scoped.filter((s) => s.axis !== "echoes" && s.axis !== "mainstats")
});
function optimalGear(teamKey2, picks, f = filters) {
  const solved = bestPicks.get(bestKey(teamKey2, TEAMS[teamKey2], gearShut(picks.some((p) => p.matrix) ? withMatrix(f) : f)));
  const same = (a, b) => a.weapon === b.weapon && a.refine === b.refine && a.sequence === b.sequence && a.highSubs === b.highSubs && a.matrix === b.matrix;
  return solved?.rows.find((row) => row.every((p, i) => same(p, picks[i]))) ?? null;
}
var withMatrix = (f) => f.matrix.length ? f : { ...f, matrix: [...MATRIX_RESONATORS] };
var tagFilters = (tag, f = filters) => readTeamCode(tag)?.matrix ? withMatrix(f) : f;
var TEAM_BY_LOADOUTS = new Map(ALL_TEAMS.map((t, i) => [t.loadouts.map((l) => l.id).join("."), teamKey(i)]));
function teamTag(key, full = false) {
  const team = teamAt(key.split("-")[0] ?? "");
  const picks = picksOfKey(key);
  if (!team || !picks || picks.length !== team.loadouts.length)
    return key;
  const optimal = full ? null : optimalGear(key.split("-")[0], picks);
  try {
    return teamCode(team.loadouts.map((l, i) => {
      const p = picks[i], best = optimal?.[i];
      return {
        loadout: l,
        sequence: p.sequence,
        weapon: l.refinements[p.weapon][p.refine],
        highSubs: p.highSubs,
        gear: best && best.echo === p.echo && best.mainstat === p.mainstat ? null : { echo: l.echoLoadouts[p.echo], mainstat: l.mainstats[p.mainstat] }
      };
    }), picks.some((p) => p.matrix));
  } catch {
    return key;
  }
}
function hashTeam() {
  const tag = hashParams().get("t") ?? hashParams().get("team");
  return tag ? keyOfTag(tag) : tag;
}
var knownTeam = () => {
  const key = hashTeam();
  return key && rowFromKey(key) ? key : null;
};
function tagTeam(tag) {
  const read = readTeamCode(tag);
  return read ? TEAM_BY_LOADOUTS.get(read.members.map((m) => m.resonator * 10 + m.loadout).join(".")) ?? null : null;
}
function keyOfTag(tag) {
  const read = readTeamCode(tag);
  const teamKey2 = tagTeam(tag);
  if (!read || !teamKey2)
    return tag;
  const members = TEAMS[teamKey2];
  const picks = [];
  for (const [i, m] of read.members.entries()) {
    const l = members[i].loadout;
    const weapon = l.refinements.findIndex((ranks) => ranks[0].id === m.weapon);
    const refine = weapon < 0 ? -1 : l.refinements[weapon].findIndex((w) => w.refinement === m.refinement);
    if (refine < 0)
      return tag;
    const g = m.gear;
    const sorted = (xs) => [...xs].sort((x, y) => x - y).join(",");
    picks.push({
      weapon,
      refine,
      sequence: m.sequence,
      highSubs: m.highSubs,
      matrix: read.matrix && !!l.resonator.matrix,
      echo: g ? l.echoLoadouts.findIndex((e) => e.mainslot.id === g.mainslot && e.sets.map((x) => x.id).join(",") === g.sets.join(",")) : -1,
      mainstat: g ? l.mainstats.findIndex((b) => sorted(b.slots) === sorted(g.mainstats)) : -1
    });
  }
  if (picks.some((p) => p.echo < 0 || p.mainstat < 0)) {
    const optimal = optimalGear(teamKey2, picks);
    if (!optimal)
      return tag;
    picks.forEach((p, i) => {
      if (p.echo >= 0 && p.mainstat >= 0)
        return;
      p.echo = optimal[i].echo;
      p.mainstat = optimal[i].mainstat;
    });
  }
  return [teamKey2, ...picks.map((p, i) => comboOf(members[i].loadout, p).key)].join("-");
}
function syncHash(team = knownTeam()) {
  const next = hashOf(team);
  if (next === location.hash)
    return;
  history.replaceState(history.state, "", `${location.pathname}${location.search}${next}`);
}
function reopenDetail(team) {
  history.replaceState(history.state, "", `${location.pathname}${location.search}${hashOf(team)}`);
}
function syncCost() {
  const hash = filters.cost === "s0r1" ? "" : `#tc=${COST_CODE[filters.cost]}`;
  if (hash !== location.hash)
    history.replaceState(history.state, "", `${location.pathname}${location.search}${hash}`);
}
var pageUrl = (team) => `${team ? "./team" : "./"}${hashOf(team)}`;
function hashOf(team) {
  const named2 = (map, mode) => [...map].filter(([, m]) => m === mode).map(([name]) => encodeURIComponent(map === resonatorFilters ? compactTag(name) : name)).join(",");
  const parts = [];
  for (const { include, exclude, map } of FILTER_GROUPS) {
    if (named2(map, "include"))
      parts.push(`${include}=${named2(map, "include")}`);
    if (named2(map, "exclude"))
      parts.push(`${exclude}=${named2(map, "exclude")}`);
  }
  if (filters.matrix.length)
    parts.push("mx=true");
  if (filters.cost !== "s0r1")
    parts.push(`tc=${COST_CODE[filters.cost]}`);
  for (const axis of AXES) {
    if (filters[axis].length)
      parts.push(`${COMPARE_PARAM[axis]}=${filters[axis].map((n) => encodeURIComponent(n.replace(/ /g, ""))).join(",")}`);
  }
  const scoped = filters.scoped.filter((s) => !isTagShow(s));
  if (scoped.length)
    parts.push(`${SCOPED_PARAM}=${scoped.map((s) => encodeURIComponent(scopedKey(s))).join(",")}`);
  if (team)
    parts.push(`t=${teamTag(team)}`);
  if (pinnedRows.size)
    parts.push(`pin=${[...pinnedRows].map((key) => teamTag(key, true)).join(",")}`);
  return parts.length ? `#${parts.join("&")}` : "";
}
var routeTeam = () => {
  const key = hashTeam();
  return key && results.has(key) ? key : null;
};

// dist/src/page/pool.js
var paint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
var lastPaint = performance.now();
async function breathe() {
  if (performance.now() - lastPaint <= 50)
    return;
  await paint();
  lastPaint = performance.now();
}
var WORKER_LIMIT = 8;
var pool = null;
var poolTried = false;
var queue = [];
var busy = /* @__PURE__ */ new Map();
var inFlight = /* @__PURE__ */ new Map();
var jobId = 0;
function dropWorkers() {
  for (const w of pool ?? [])
    w.terminate();
  pool = null;
  queue.unshift(...busy.values());
  busy.clear();
  void drainHere();
}
function workerPool() {
  if (poolTried)
    return pool;
  poolTried = true;
  const want = Math.max(1, Math.min(WORKER_LIMIT, (navigator.hardwareConcurrency || 4) - 1));
  try {
    pool = Array.from({ length: want }, () => new Worker(new URL(`./solver.js?v=${Date.now()}`, import.meta.url), { type: "module" }));
    for (const w of pool)
      listen(w);
  } catch (err) {
    console.warn("Workers unavailable, optimizing on the main thread instead:", err);
    pool = null;
  }
  return pool;
}
function listen(w) {
  w.onmessage = ({ data }) => {
    const job = busy.get(w);
    if (!job || data.id !== job.id)
      return;
    if (isProgress(data)) {
      job.onShare(data.share);
      return;
    }
    const solved = { picks: data.picks, rows: data.rows, scores: data.scores, hidden: data.hidden ?? [], hiddenScores: data.hiddenScores ?? [] };
    if (solveFits(bestKey(job.key, job.members, job.f), solved)) {
      settle(w, job, solved);
      return;
    }
    console.warn(`the workers are on a different build than this page (first seen on ${job.key}); solving the rest here. Reload once the rebuild has landed.`);
    dropWorkers();
  };
  w.onerror = (e) => {
    const job = busy.get(w);
    e.preventDefault();
    if (!job)
      return;
    console.warn(`worker failed on ${job.key}, solving it here:`, e.message);
    settle(w, job, solveTeam(job.key, job.members, job.f, job.known));
  };
}
function settle(w, job, solved) {
  storeSolved(job.key, solved, job.f);
  busy.delete(w);
  job.done();
  handOut(w);
}
function handOut(w) {
  const job = queue.shift();
  if (!job)
    return;
  busy.set(w, job);
  const request = { id: job.id, teamKey: job.key, filters: job.f, picks: job.known };
  w.postMessage(request);
}
var draining = false;
async function drainHere() {
  if (draining)
    return;
  draining = true;
  for (let job = queue.shift(); job; job = queue.shift()) {
    storeSolved(job.key, solveTeam(job.key, job.members, job.f, job.known, job.onShare), job.f);
    job.done();
    await breathe();
  }
  draining = false;
}
function cancelQueued() {
  for (const job of queue.splice(0))
    job.done();
}
function solveAll(teams, f, share) {
  const waits = teams.map(([key, members]) => {
    const bk = bestKey(key, members, f);
    const out = inFlight.get(bk);
    if (out)
      return out.then(() => share(members, 1));
    const solved = new Promise((resolve) => queue.push({
      id: jobId++,
      key,
      members,
      f,
      known: picksCache.get(picksKey(key, members, f)) ?? null,
      onShare: (part) => share(members, part),
      done: () => {
        inFlight.delete(bk);
        share(members, 1);
        resolve();
      }
    }));
    inFlight.set(bk, solved);
    return solved;
  });
  if (pool) {
    for (const w of pool)
      if (!busy.has(w))
        handOut(w);
  } else
    void drainHere();
  return Promise.all(waits).then(() => void 0);
}

// dist/src/page/icons.js
var UNKNOWN = "./images/unknown.webp";
var dirOf = (g) => g instanceof Resonator ? "resonators" : g instanceof Weapon ? "weapons" : g instanceof Mainslot ? "echoes" : g instanceof Sonata || g instanceof Sonata1pc || g instanceof Sonata2pc || g instanceof Sonata3pc ? "sonatas" : null;
var iconOf = (g) => imageOf(g, "icon");
function imageOf(g, cls) {
  const dir = g ? dirOf(g) : null;
  if (!dir)
    return "";
  const src = g.id ? `./images/${dir}/${g.id}.webp` : UNKNOWN;
  return `<img class="${cls}" src="${src}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${UNKNOWN}'">`;
}
var named = null;
function gearNamed() {
  if (named)
    return named;
  named = /* @__PURE__ */ new Map();
  const add = (g, name = g?.name) => {
    if (g && name && !named.has(name))
      named.set(name, g);
  };
  for (const { loadouts } of ALL_TEAMS)
    for (const l of loadouts) {
      add(l.resonator);
      for (const w of l.refinements.flat()) {
        add(w);
        add(w, w.name.replace(/ R\d$/, ""));
      }
      for (const e of l.echoLoadouts) {
        add(e.mainslot);
        for (const g of e.sets)
          add(g);
      }
    }
  return named;
}
var iconNamed = (name, cls = "icon") => imageOf(gearNamed().get(name), cls);
function portraitNamed(name, cls) {
  const id = gearNamed().get(name)?.id;
  if (!id)
    return imageOf(void 0, cls);
  return `<img class="${cls}" src="./images/resonators/80/${id}.webp" srcset="./images/resonators/80/${id}.webp 1x, ./images/resonators/160/${id}.webp 2x" width="80" height="80" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.srcset='';this.src='${UNKNOWN}'">`;
}
var ICON_SLOT = `<span class="icon"></span>`;
function weaponIconByName(tag) {
  const bare = tag.replace(/ R\d$/, "");
  let best, len = 0;
  for (const [name, g] of gearNamed()) {
    if (g instanceof Weapon && name.length > len && (bare === name || bare.endsWith(` ${name}`))) {
      best = g;
      len = name.length;
    }
  }
  return iconOf(best);
}
var echoLabelHtml = (label, esc2) => label.split(" + ").map((part) => iconNamed(part) + esc2(part)).join(" + ");

// dist/src/page/options.js
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var COST_HELP = [
  "s0r0 all - Limited resonators are S0 and use the best standard or 4* weapon available at R1. Rover and 4* resonators are S6.",
  "s0r1 mdps +r0 supports - Each team gets a single signature weapon at R1, on whichever of its main DPS gives the best DPR increase \u2014 never a support. Dual DPS teams still only get one signature weapon.",
  "s0r1 all - All limited resonators get their best signature weapon, while Rover and 4* supports may still use standard or 4* weapons.",
  "s2r1 / s3r1 / s6r1 mdps +r1 supports - One main DPS per team runs that many sequence nodes, whichever gives the best DPR increase \u2014 never a support. Everyone else stays S0 on their own signature at R1.",
  "s6r1 mdps +s2r1 supports - As above at S6, with everyone else at S2 on their own signature at R1.",
  "s6r5 mdps +s0r1 supports - One main DPS per team is S6 with their signature at R5, whichever gives the best DPR increase \u2014 never a support. Everyone else stays S0 on their own signature at R1.",
  "s6r5 all - Every resonator is S6 with their best weapon at R5."
];
var COST_LABEL = [
  ["s0r0", "s0r0 all"],
  ["s0r1mdps", "s0r1 mdps +r0 supports"],
  ["s0r1", "s0r1 all"],
  ["s2r1mdps", "s2r1 mdps +r1 supports"],
  ["s3r1mdps", "s3r1 mdps +r1 supports"],
  ["s6r1mdps", "s6r1 mdps +r1 supports"],
  ["s6r1mdps_s2r1", "s6r1 mdps +s2r1 supports"],
  ["s6r5mdps", "s6r5 mdps +s0r1 supports"],
  ["s6r5", "s6r5 all"]
];
function costBox(cost, open) {
  return `<div class="tcopt${open ? " open" : ""}"><div class="tcopt-head"><button type="button" class="tcopt-name" data-help="cost" aria-expanded="${open}">Team Cost<span class="arrow">\u203A</span></button><select id="cost" class="tcselect" aria-label="Team Cost" title="Team Cost">` + COST_LABEL.map(([value, label]) => `<option value="${value}"${cost === value ? " selected" : ""}>${label}</option>`).join("") + `</select></div><div class="tcopt-desc"${open ? "" : " hidden"}><ul>${COST_HELP.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div></div>`;
}
function matrixBox(on, open) {
  return `<div class="tcopt${open ? " open" : ""}"><div class="tcopt-head"><button type="button" class="tcopt-name" data-help="matrix" aria-expanded="${open}">Matrix Buffs<span class="arrow">\u203A</span></button><input type="checkbox" id="matrixToggle" aria-label="Matrix Buffs" title="Matrix Buffs"${on ? " checked" : ""}></div><div class="tcopt-desc"${open ? "" : " hidden"}><ul><li>Enables Endstate Matrix exclusive resonator buffs</li><li>Neutral Matrix Score is calculated ignoring elements and using only a 20% general damage enhancement.</li></ul></div></div>`;
}

// dist/src/page/loading.js
var overlay = document.getElementById("loading");
var overlayStatus = overlay.querySelector(".status-text");
var overlayCount = overlay.querySelector(".progress-count");
var overlayFill = overlay.querySelector(".progress-fill");
var overlayTimer;
function overlayPhase(text, now = false) {
  overlayStatus.textContent = text;
  if (!overlay.hidden)
    return;
  if (now) {
    clearTimeout(overlayTimer);
    overlayTimer = void 0;
    overlay.hidden = false;
    return;
  }
  if (overlayTimer === void 0)
    overlayTimer = setTimeout(() => {
      overlayTimer = void 0;
      overlay.hidden = false;
    }, 100);
}
var OVERLAY_ROWS = 1e3;
async function overlayNow(text, rows = Infinity) {
  overlayPhase(text, rows >= OVERLAY_ROWS);
  await paint();
}
function overlayHide() {
  clearTimeout(overlayTimer);
  overlayTimer = void 0;
  overlay.hidden = true;
}
function showError(err) {
  console.error(err);
  const box = overlay.querySelector(".loading-error");
  if (!box)
    return;
  box.hidden = false;
  box.textContent += `${box.textContent ? "\n\n" : ""}${err instanceof Error ? err.stack ?? err.message : String(err)}`;
  clearTimeout(overlayTimer);
  overlayTimer = void 0;
  overlay.hidden = false;
}
function barReset() {
  overlayFill.style.width = "0%";
  overlayCount.textContent = "";
}
function barProgress(done, total) {
  overlayFill.style.width = `${total ? done / total * 100 : 100}%`;
  overlayCount.textContent = `${fmt(done)} / ${fmt(total)}`;
}
async function ensureBestPicks(inPlay, f, stale) {
  await loadShipped(f);
  if (stale())
    return false;
  const teams = inPlay.filter(([key, members]) => !bestPicks.has(bestKey(key, members, f)));
  if (!teams.length)
    return false;
  const rowsOf = (members) => members.every((m) => hasBuild(m, f)) ? estimatedRowCount(members, f) : 0;
  const solvable = teams.filter(([, members]) => members.every((m) => hasBuild(m, f))).map((t) => [t, rowsOf(t[1])]).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  if (!solvable.length)
    return false;
  const total = solvable.reduce((n, [, members]) => n + rowsOf(members), 0);
  await overlayNow("Running Calculations...");
  if (stale())
    return false;
  let done = 0;
  const progress = () => {
    if (!stale())
      barProgress(done, total);
  };
  progress();
  const counted = /* @__PURE__ */ new Map();
  const share = (members, part) => {
    const at = Math.min(rowsOf(members), Math.round(rowsOf(members) * part));
    const was = counted.get(members) ?? 0;
    if (at <= was)
      return;
    counted.set(members, at);
    done += at - was;
    progress();
  };
  workerPool();
  await solveAll(solvable, f, share);
  if (stale())
    return false;
  await paint();
  return true;
}
async function solveQuiet(teamKey2, f) {
  const members = TEAMS[teamKey2];
  await loadShipped(f);
  if (bestPicks.has(bestKey(teamKey2, members, f)) || !members.every((m) => hasBuild(m, f)))
    return;
  workerPool();
  await solveAll([[teamKey2, members]], f, () => {
  });
  saveSolves();
}

// dist/src/page/readme.js
var README = [
  `<span class="readme-beta">Beta calculations are subject to change!</span>`,
  `<span class="readme-warn">DPR comparisons do not account for rotation time!</span>`,
  `Feedback: join <a href="https://discord.gg/fracturedshores" target="_blank" rel="noopener">discord.gg/fracturedshores</a>, ping @rileyy._.`,
  `Frame data sourced from <a href="https://wuwalab.com/" target="_blank" rel="noopener">wuwalab.com</a>`,
  "Enemy lv 100, 20% resistance, Resonator lv 90, Nodes lv 10"
];

export {
  fmt,
  fmtPct,
  fmtPctCell,
  fmtExact,
  PAD_DIGITS_COLUMNS,
  GROUPED_COLUMNS,
  digitsOf,
  RATE_SECTIONS,
  buildReport,
  TEAMS,
  RESONATOR_HUE,
  FALLBACK_HUE,
  weaponHue,
  MATRIX_RESONATORS,
  resonatorFilters,
  OPTION_FILTER_MAPS,
  filters,
  pinnedRows,
  pruneGearFilters,
  settleLevels,
  comparable,
  ROW_CAP,
  bestPicks,
  results,
  visibleRows,
  setVisibleRows,
  tagOwner,
  parseTag,
  weaponPart,
  joinTag,
  memberTag,
  costTag,
  memberLevels,
  included,
  carryTags,
  isTagShow,
  syncTagShows,
  teamWanted,
  sequenceTag,
  refineTag,
  admitBuild,
  admitTeam,
  snapshotFilters,
  teamRows,
  solvedRows,
  prospectiveRows,
  picksOfKey,
  rowFromKey,
  detailFor,
  memberLabel,
  discardRestoredSolves,
  loadSolves,
  saveSolves,
  hashParams,
  applyHash,
  gearShut,
  tagFilters,
  hashTeam,
  tagTeam,
  syncHash,
  reopenDetail,
  syncCost,
  pageUrl,
  routeTeam,
  paint,
  breathe,
  workerPool,
  cancelQueued,
  iconOf,
  iconNamed,
  portraitNamed,
  ICON_SLOT,
  weaponIconByName,
  echoLabelHtml,
  README,
  costBox,
  matrixBox,
  overlay,
  overlayPhase,
  overlayNow,
  overlayHide,
  showError,
  barReset,
  barProgress,
  ensureBestPicks,
  solveQuiet
};
