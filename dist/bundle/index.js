import {
  ALL_TEAMS,
  AXES,
  ActionTag,
  BASE_RESISTANCE,
  CAST_NAME,
  CONCERTO_UNIT,
  ENEMY_MAX_OFFTUNE,
  ENERGY_UNIT,
  ER_TOLERANCE,
  INTERCHANGEABLE,
  LEVEL_90_DOT,
  LEVEL_90_TUNE,
  MAINSTAT_ROWS,
  MV_UNIT,
  NODE_NAME,
  OWN_DEF,
  PRIMARY_TEAM,
  RESONATOR_LEVEL,
  RESOURCE_NAME,
  SCALING_NAME,
  Sonata,
  TAG_NAME,
  TUNE_BREAK_ENEMY,
  axisOpen,
  axisUsed,
  baseSequence,
  bestKey,
  comboOf,
  compares,
  damageFactors,
  defFactorOf,
  defaultFilters,
  echoLabel,
  echoLines,
  effectiveRes,
  effectiveShred,
  eligibleWeapons,
  erRollsFor,
  filterSignature,
  hasBuild,
  hitsOf,
  isPercent,
  isProgress,
  litStats,
  loadoutName,
  mainstatSlotBuffs,
  member,
  menuStats,
  mvPercent,
  picksKey,
  refineLevels,
  runFromScore,
  runTeam,
  scopedKey,
  scopedStat,
  sequenceLevels,
  solveTeam,
  splitStat,
  statDisplayScale,
  statLabel,
  substatRollBuffs,
  tagKind,
  teamAt,
  teamKey,
  weaponBase
} from "./chunk-HJY354XL.js";

// dist/src/display.js
var shown = (s, i) => s.shownAfter?.[i] ?? [s.energy, s.concerto, s.offtune, ...s.forte][i];
var shownBefore = (s, i) => s.shownBefore?.[i] ?? [s.energyBefore, s.concertoBefore, s.offtuneBefore, ...s.forteBefore][i];
var formatters = /* @__PURE__ */ new Map();
var fmt = (v, digits = 0, pad = false, group = true) => {
  if (typeof v !== "number")
    return String(v ?? "");
  const scale = 10 ** digits;
  const key = `${digits}${pad ? "p" : ""}${group ? "g" : ""}`;
  let f = formatters.get(key);
  if (!f)
    formatters.set(key, f = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: pad ? digits : 0, useGrouping: group }));
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
  const sec = String(Math.floor(cs / 100) % 60).padStart(2, "0");
  return `${Math.floor(cs / 6e3)}:${sec}.${String(cs % 100).padStart(2, "0")}`;
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
  ...[action.lastBullet?.element ?? null, action.lastBullet?.type ?? null, action.lastBullet?.subtype ?? null].filter((tag) => tag !== null).map((tag) => scopedStat(tag, stat))
]);
var sub = (action) => action.lastBullet?.subtype ?? null;
var special = (action) => action.scaling === 3 || action.scaling === 4 || action.scaling === 5;
var fixed = (action) => action.scaling === 5;
var SCALERS = {
  [
    0
    /* Scaling.Atk */
  ]: { key: "atk", word: "ATK", stats: [
    0,
    6,
    3
    /* Stat.FlatAtk */
  ] },
  [
    1
    /* Scaling.Hp */
  ]: { key: "hp", word: "HP", stats: [
    1,
    7,
    4
    /* Stat.FlatHp */
  ] },
  [
    2
    /* Scaling.Def */
  ]: { key: "def", word: "DEF", stats: [
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
    15,
    16
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
    17
    /* Stat.DmgBonus */
  ),
  amp: (a) => a.scaling === 4 || fixed(a) ? [] : a.scaling !== 3 ? keysFor(
    a,
    18
    /* Stat.Amp */
  ) : !sub(a) ? [] : [scopedStat(
    sub(a),
    18
    /* Stat.Amp */
  )],
  dealt: (a) => fixed(a) ? [] : a.scaling !== 3 ? keysFor(
    a,
    19,
    20
    /* Stat.DamageTaken */
  ) : !sub(a) ? [] : [scopedStat(
    sub(a),
    19
    /* Stat.TotalDmg */
  ), scopedStat(
    sub(a),
    20
    /* Stat.DamageTaken */
  )],
  effDef: (a) => fixed(a) ? [] : a.scaling === 3 ? keysFor(
    a,
    36
    /* EnemyStat.DefReduce */
  ) : keysFor(
    a,
    22,
    23,
    36
    /* EnemyStat.DefReduce */
  ),
  effRes: (a) => a.scaling === 3 ? keysFor(
    a,
    35
    /* EnemyStat.ResReduce */
  ) : fixed(a) ? [] : keysFor(
    a,
    21,
    35
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
    22
    /* Stat.DefIgnoreNew */
  ]: "DEF Ignore (new)",
  [
    23
    /* Stat.DefIgnoreOld */
  ]: "DEF Ignore (old)",
  [
    36
    /* EnemyStat.DefReduce */
  ]: "DEF Reduce",
  [
    21
    /* Stat.ResIgnore */
  ]: "RES Ignore",
  [
    35
    /* EnemyStat.ResReduce */
  ]: "RES Reduce",
  [
    19
    /* Stat.TotalDmg */
  ]: "Total Damage",
  [
    20
    /* Stat.DamageTaken */
  ]: "Damage Taken"
};
var actionInfo = (action, type, source) => {
  const info = [];
  const push = (label, value) => {
    if (value)
      info.push({ label, value });
  };
  push("Node", action.node === null ? null : NODE_NAME[action.node]);
  push("Cast", action.cast === null ? null : CAST_NAME[action.cast]);
  push("Subcast", action.subcast === null ? null : CAST_NAME[action.subcast]);
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
  while (press.cancelOf ?? press.formOf)
    press = press.cancelOf ?? press.formOf;
  push("Hit Frames", press.bullets.length ? press.bullets.map((h) => h.hitFrame).join(", ") : null);
  push("Commit Frames", press.bullets.some((h) => h.commitFrame !== h.hitFrame) ? press.bullets.map((h) => h.commitFrame).join(", ") : null);
  push("Animation Frames", String(press.animFrames));
  push("High Priority Frames", press.prioFrames ? String(press.prioFrames) : null);
  push("Outro Buff Frames", press.qteFrames ? String(press.qteFrames) : null);
  push("Time Stop Frames", press.timestop ? String(press.timestop) : null);
  push("Motion Stop Frames", press.motionStop ? String(press.motionStop) : null);
  if (source)
    info.push({ label: "Source", value: source.name, source: source.source });
  return info;
};
var STAT_SOURCE = {
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
  ]: "dot constant",
  [
    4
    /* Scaling.Tune */
  ]: "tune constant"
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
var ENERGY_RATE = "Regen Multiplier";
var MV_MULTIPLIER = "MV Multiplier";
var tagOf = (snap) => snap.tag === ActionTag.Field ? "" : snap.tag;
function ownShares(snap, total, cast) {
  const hit = total - cast;
  if (cast && hit) {
    return [
      { source: snap.action.name, value: cast, owner: snap.member },
      { source: snap.action.name, value: hit, owner: snap.member }
    ];
  }
  return total ? [{ source: snap.action.name, value: total, owner: snap.member }] : [];
}
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
    // the column is the pair's combined lift, since Total Damage and Damage Taken multiply; a dot
    // reads only its status-scoped halves, the way `amp` above does
    dealt: fixed(snap.action) ? null : snap.action.scaling === 3 ? ((1 + snap.subtypeTotalDmg / 100) * (1 + snap.subtypeDamageTaken / 100) - 1) * 100 : ((1 + snap.stat(
      19
      /* Stat.TotalDmg */
    ) / 100) * (1 + snap.stat(
      20
      /* Stat.DamageTaken */
    ) / 100) - 1) * 100,
    effDef: fixed(snap.action) ? null : effectiveShred(snap) * 100,
    effRes: fixed(snap.action) ? null : effectiveRes(snap),
    energy: shown(snap, 0) / RESOURCE_SCALE.energy,
    concerto: shown(snap, 1) / RESOURCE_SCALE.concerto,
    offtune: shown(snap, 2) / RESOURCE_SCALE.offtune,
    // off-tune is the enemy's one shared bar, so its ceiling is the same on every row
    "max:offtune": ENEMY_MAX_OFFTUNE / RESOURCE_SCALE.offtune,
    // what each held coming in — the running-column blanking reads these (page/detail.ts stepRow)
    "before:energy": shownBefore(snap, 0) / RESOURCE_SCALE.energy,
    "before:concerto": shownBefore(snap, 1) / RESOURCE_SCALE.concerto,
    "before:offtune": shownBefore(snap, 2) / RESOURCE_SCALE.offtune,
    avg: dealsDamage ? avg : null
  };
  FORTE_GAUGES.forEach((key, i) => {
    const unit2 = snap.forteScale[i];
    raw[`gauge:${RESOURCE_NAME[key]}`] = shown(snap, 3 + i) * unit2;
    raw[`before:gauge:${RESOURCE_NAME[key]}`] = shownBefore(snap, 3 + i) * unit2;
    if (snap.maxForte[i])
      raw[`max:gauge:${RESOURCE_NAME[key]}`] = snap.maxForte[i] * unit2;
  });
  raw["short:energy"] = snap.castUnmet?.[0] ? 1 : 0;
  raw["short:concerto"] = snap.castUnmet?.[1] ? 1 : 0;
  FORTE_GAUGES.forEach((key, i) => {
    raw[`short:gauge:${RESOURCE_NAME[key]}`] = snap.castUnmet?.[2 + i] ? 1 : 0;
  });
  const sources = {};
  for (const [key, feeds] of Object.entries(FEEDS))
    sources[key] = tracing(snap, feeds(snap.action));
  if (constant)
    raw["empty:scaler"] = constant.label;
  sources.effRes = (sources.effRes ?? []).map((r) => ({ ...r, value: -r.value }));
  if (!fixed(snap.action)) {
    const dot = snap.action.scaling === 3;
    const pct = (v) => `${fmt(v, 2)}%`;
    const ignoreNew = dot ? 0 : snap.stat(
      22
      /* Stat.DefIgnoreNew */
    ), ignoreOld = dot ? 0 : snap.stat(
      23
      /* Stat.DefIgnoreOld */
    );
    const reduce = snap.stat(
      36
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
  const RESOURCE_STAT = {
    energy: [
      26
      /* Stat.AddEnergy */
    ],
    concerto: [
      27
      /* Stat.AddConcerto */
    ],
    offtune: [
      28
      /* Stat.AddOfftune */
    ]
  };
  const CAST_SHARE = { energy: snap.action.castEnergy, concerto: snap.action.castConcerto, offtune: snap.action.castOfftune };
  const castAdded = (i) => (snap.castAdds ?? []).filter((c) => c.gains[i] !== 0).map((c) => ({ source: c.source, value: c.gains[i], owner: c.owner ?? void 0, label: "on cast" }));
  const CAST_ADD = { energy: 0, concerto: 1, offtune: -1 };
  for (const key of ["energy", "concerto", "offtune"]) {
    const traced = [
      ...RESOURCE_STAT[key].flatMap((st) => tracing(snap, keysFor(snap.action, st), false)),
      ...CAST_ADD[key] < 0 ? [] : castAdded(CAST_ADD[key])
    ].map((r) => ({ ...r, value: r.value / RESOURCE_SCALE[key] }));
    const own = ownShares(snap, snap.action[key] / RESOURCE_SCALE[key], CAST_SHARE[key] / RESOURCE_SCALE[key]);
    const rows = [...own, ...traced];
    const folded = [...own, ...foldDuplicates(traced)];
    if (folded.length)
      sources[key] = folded;
    if (traced.length)
      buffed.add(key);
    raw[`moved:${key}`] = rows.reduce((n, r) => n + r.value, 0);
  }
  const rate = tracing(snap, keysFor(
    snap.action,
    14
    /* Stat.EnergyRegenMult */
  ));
  if (rate.length) {
    sources.energy = [...sources.energy ?? [], ...rate.map((r) => ({ ...r, section: ENERGY_RATE }))];
    raw["moved:energy"] = (Number(raw["moved:energy"]) || 0) * (1 + snap.stat(
      14
      /* Stat.EnergyRegenMult */
    ) / 100);
  }
  const buildingOfftune = snap.action.offtune + tracing(snap, keysFor(
    snap.action,
    28
    /* Stat.AddOfftune */
  )).reduce((n, r) => n + r.value, 0);
  if (buildingOfftune > 0) {
    const rate2 = tracing(snap, keysFor(
      snap.action,
      13
      /* Stat.OfftuneBuildup */
    ));
    if (rate2.length)
      sources.offtune = [...sources.offtune ?? [], ...rate2.map((r) => ({ ...r, section: OFFTUNE_RATE }))];
  }
  const direct = tracing(snap, keysFor(
    snap.action,
    29
    /* Stat.DirectOfftune */
  ));
  raw["moved:offtune"] = ((buildingOfftune < 0 ? buildingOfftune : buildingOfftune * (snap.stat(
    13
    /* Stat.OfftuneBuildup */
  ) / 100)) + direct.reduce((n, r) => n + r.value, 0)) / RESOURCE_SCALE.offtune;
  if (direct.length) {
    sources.offtune = [...sources.offtune ?? [], ...direct.map((r) => ({
      ...r,
      value: r.value / RESOURCE_SCALE.offtune,
      section: "Direct Offtune"
    }))];
    buffed.add("offtune");
  }
  const FORTE_FIELD = ["forte1", "forte2", "forte3", "forte4", "forte5"];
  const FORTE_STAT = [
    30,
    31,
    32,
    33,
    34
    /* Stat.AddForte5 */
  ];
  FORTE_GAUGES.forEach((key, i) => {
    const unit2 = snap.forteScale[i];
    const declared = snap.action[FORTE_FIELD[i]] * unit2;
    const traced = [...tracing(snap, keysFor(snap.action, FORTE_STAT[i])), ...castAdded(2 + i)].map((r) => ({ ...r, value: r.value * unit2 }));
    const rows = [];
    if (snap.action.resetForte[i]) {
      rows.push({ source: snap.action.name, value: 0, text: "Reset", owner: snap.member });
    }
    rows.push(...ownShares(snap, declared, snap.action.castForte[i] * unit2));
    rows.push(...traced);
    if (rows.length)
      sources[`gauge:${RESOURCE_NAME[key]}`] = rows;
    raw[`moved:gauge:${RESOURCE_NAME[key]}`] = rows.reduce((n, r) => n + r.value, 0);
    if (snap.action.resetForte[i])
      raw[`clear:gauge:${RESOURCE_NAME[key]}`] = 1;
  });
  if (!raw.mv)
    delete sources.mv;
  else {
    const isFactor = (r) => r.stat !== void 0 && splitStat(r.stat)[0] === 16;
    const parts = sources.mv ?? [];
    if (parts.length)
      buffed.add("mv");
    sources.mv = [
      ...snap.action.mv ? [{ source: snap.action.name, label: "Base MV", value: snap.action.mv / MV_UNIT, percent: true, owner: snap.member }] : [],
      ...parts.filter((r) => !isFactor(r)),
      ...parts.filter(isFactor).map((r) => ({ ...r, section: MV_MULTIPLIER }))
    ];
  }
  if (sources.dealt?.length) {
    const half = (stat) => sources.dealt.filter((r) => r.stat !== void 0 && splitStat(r.stat)[0] === stat).reduce((n, r) => n + r.value, 0);
    const total = half(
      19
      /* Stat.TotalDmg */
    ), taken = half(
      20
      /* Stat.DamageTaken */
    );
    if (total && taken) {
      sources.dealt = [...sources.dealt, ...[[19, total], [20, taken]].map(([stat, value]) => ({
        source: "",
        label: "Total",
        value,
        section: SECTION_OF[stat],
        percent: true,
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
        { source: "", label: "Relative", value: (snap[scaler.key] / base - 1) * 100, section: final, percent: true, digits: 2, summary: true }
      ];
    }
  }
  if (members.length > 1) {
    const per = members.map((m) => rowValues(m, { mv: mvPercent(m), avg: 0 }));
    for (const key of ["short:energy", "short:concerto", ...FORTE_GAUGES.map((k) => `short:gauge:${RESOURCE_NAME[k]}`)]) {
      raw[key] = per.some((p) => Number(p.raw[key])) ? 1 : 0;
    }
    for (const key of COMBINED_COLUMNS) {
      if (sources[key] === void 0 && key === "mv")
        continue;
      const last = per.length - 1;
      const rows = foldDuplicates(per.flatMap((p, k) => (p.sources[key] ?? []).filter((r) => r.section !== OFFTUNE_RATE && r.section !== ENERGY_RATE || k === last)));
      if (rows.length)
        sources[key] = rows;
      else
        delete sources[key];
      if (per.some((p) => p.buffed.has(key)))
        buffed.add(key);
      const moved = `moved:${key}`;
      if (per.some((p) => p.raw[moved] !== void 0)) {
        raw[moved] = per.reduce((n, p) => n + (Number(p.raw[moved]) || 0), 0);
      }
    }
    FORTE_GAUGES.forEach((key, i) => {
      raw[`before:gauge:${RESOURCE_NAME[key]}`] = shownBefore(members[0], 3 + i) * members[0].forteScale[i];
    });
    raw["before:energy"] = shownBefore(members[0], 0) / RESOURCE_SCALE.energy;
    raw["before:concerto"] = shownBefore(members[0], 1) / RESOURCE_SCALE.concerto;
    raw["before:offtune"] = shownBefore(members[0], 2) / RESOURCE_SCALE.offtune;
  }
  const floor4 = (v) => Math.floor(v * 1e4) / 1e4;
  const dealers = (members.length ? members : [snap]).filter((m) => mvPercent(m) !== 0);
  const fs = (dealers.length ? dealers : [snap]).map(damageFactors);
  const f = fs[fs.length - 1];
  const factor = (source, label, pick, mult, round = (v) => v) => {
    const vs = fs.map((x) => round(pick(x)));
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const row = { source, label, value: vs[vs.length - 1], ...mult ? { mult: true } : {} };
    return lo === hi ? row : { ...row, text: `${mult ? "\xD7" : ""}${fmtExact(lo)}\u2013${fmtExact(hi)}` };
  };
  const any = (pick) => fs.some(pick);
  if (dealsDamage)
    sources.avg = [
      factor(f.scaling === null ? "" : STAT_SOURCE[f.scaling] ?? SCALING_NAME[f.scaling], "Final Stat", (x) => x.finalStat, false),
      { source: snap.action.name, label: "Motion Value", value: floor4(fs.reduce((n, x) => n + x.finalMv, 0)), mult: true },
      factor("buffs", "Damage Bonus", (x) => x.bonusFactor, true),
      factor("buffs", "Amplification", (x) => x.ampFactor, true),
      ...any(
        (x) => x.scaling === 4
        /* Scaling.Tune */
      ) ? [factor("buffs", "Tune Break Boost", (x) => x.tbbFactor, true)] : [],
      ...any((x) => x.dealtFactor > 1) ? [factor("buffs", "Total Damage", (x) => x.dealtFactor, true)] : [],
      ...any((x) => x.takenFactor > 1) ? [factor("enemy", "Damage Taken", (x) => x.takenFactor, true)] : [],
      factor("enemy", "Res Factor", (x) => x.resFactor, true),
      factor("enemy", "Def Factor", (x) => x.defFactor, true, floor4),
      factor("crit", "Average Crit", (x) => x.critFactor, true, floor4)
    ];
  if (!(members.length ? members : [snap]).some((m) => m.action.bullets.length)) {
    for (const key of STAT_COLUMNS) {
      raw[key] = null;
      delete sources[key];
      buffed.delete(key);
    }
    delete raw["empty:scaler"];
  }
  return { raw, sources, buffed };
}
function buildReport(lines) {
  const columns = [
    { key: "member", label: "member", align: "left" },
    { key: "action", label: "action", align: "left" },
    // the clock as the row's own press ends, counting up from 0:00.00 (`clockAt`)
    { key: "time", label: "time", noTotal: true, full: "Time" },
    { key: "avg", label: "avg dmg", full: "Final Damage" },
    { key: "mv", label: "mv%", digits: 2, percent: true, full: "Motion Value" },
    // whichever stat the action scales off, blank where it scales off a constant
    { key: "scaler", label: "scaler", noTotal: true },
    { key: "dmgBonus", label: "dmg%", digits: 1, percent: true, full: "Dmg Bonus" },
    { key: "amp", label: "amp%", digits: 1, percent: true, full: "Amplification" },
    { key: "cr", label: "cr%", digits: 1, percent: true, full: "Crit Rate" },
    { key: "cd", label: "cd%", digits: 1, percent: true, full: "Crit Dmg" },
    // both halves carry their own section heading, so `full` is only the empty-panel one
    // its panel ends on the defense factor's formula and results rather than a Total
    { key: "effDef", label: "shred%", digits: 1, percent: true, noTotal: true, full: "DEF Ignore", fullEmpty: "DEF Shred" },
    { key: "effRes", label: "res%", digits: 1, percent: true, full: "Enemy RES" },
    { key: "dealt", label: "vuln%", digits: 1, percent: true, full: "Vulnerability" },
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
  const isShort = (snap) => snap.triggered && snap.action.cast !== 8;
  const isShortLine = (line) => line.members?.length ? line.members.every(isShort) : isShort(line.snap);
  const endOf = (s) => s.triggered && s.hitAt !== void 0 ? s.hitAt : s.frame + s.frames + (s.swapFrames ?? 0);
  const partOf = (snap, avg, shown3) => {
    const part = rowValues(snap, { mv: mvPercent(snap), avg });
    part.raw.action = snap.action.name;
    if (tagOf(snap))
      part.raw["tag:action"] = tagOf(snap);
    const end = endOf(snap);
    part.raw.time = clockAt(end);
    part.raw["end:time"] = end;
    return {
      ...part,
      info: actionInfo(snap.action, snap.type, snap.source),
      type: snap.type,
      scaling: snap.action.scaling,
      isShown: snap === shown3,
      snap,
      short: isShort(snap)
    };
  };
  const rows = lines.map((line) => {
    const snap = line.snap;
    const { raw, sources, buffed } = rowValues(snap, { mv: line.mv, avg: line.avg }, line.members ?? []);
    raw.action = line.id;
    if (tagOf(snap))
      raw["tag:action"] = tagOf(snap);
    const end = Math.max(...(line.members?.length ? line.members : [snap]).map(endOf));
    raw.time = clockAt(end);
    raw["end:time"] = end;
    return {
      line,
      raw,
      sources,
      buffed,
      // `snap.type`, not `action.type`: the type it was actually evaluated as (typeOverride)
      info: actionInfo(snap.action, snap.type, snap.source),
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
    return typeof v === "number" ? fmt(v, digitsOf(r.raw, c), PAD_DIGITS_COLUMNS.has(c.key), GROUPED_COLUMNS.has(c.key)) + (c.percent ? "%" : "") + gaugeSuffix(r.raw, c.key) : String(v ?? "");
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
var MATRIX_RESONATORS = new Set(ALL_TEAMS.flatMap((t) => t.loadouts).filter((l) => l.resonator.matrix).map((l) => l.resonator.name));
var resonatorFilters = /* @__PURE__ */ new Map();
var weaponFilters = /* @__PURE__ */ new Map();
var echoFilters = /* @__PURE__ */ new Map();
var sequenceFilters = /* @__PURE__ */ new Map();
var refineFilters = /* @__PURE__ */ new Map();
var OPTION_FILTER_MAPS = {
  weapon: weaponFilters,
  echo: echoFilters,
  sequence: sequenceFilters,
  refine: refineFilters
};
var filters = defaultFilters();
var gearCache = null;
function offeredGear(kind, f = filters) {
  const sig = filterSignature(f);
  if (gearCache?.sig !== sig) {
    const offered = { weapon: /* @__PURE__ */ new Set(), echo: /* @__PURE__ */ new Set() };
    for (const members of Object.values(TEAMS)) {
      for (const m of members) {
        if (axisOpen(m, f, "weapons"))
          for (const i of eligibleWeapons(m, f)) {
            offered.weapon.add(weaponBase(m.loadout.weapons[i]));
            for (const w of m.loadout.refinements[i])
              offered.weapon.add(w.name);
          }
        if (axisOpen(m, f, "echoes"))
          for (const e of m.loadout.echoLoadouts)
            offered.echo.add(echoLabel(m.loadout, e));
      }
    }
    gearCache = { sig, offered };
  }
  return gearCache.offered[kind];
}
function pruneGearFilters() {
  for (const kind of ["weapon", "echo"]) {
    const offered = offeredGear(kind);
    for (const key of [...OPTION_FILTER_MAPS[kind].keys()])
      if (!offered.has(key))
        OPTION_FILTER_MAPS[kind].delete(key);
  }
  for (const key of [...sequenceFilters.keys()]) {
    const owner = tagOwner(key);
    if (!Object.values(TEAMS).some((ms) => ms.some((m) => m.name === owner && sequenceTagsOf(m).includes(key)))) {
      sequenceFilters.delete(key);
    }
  }
}
function comparable(name, axis) {
  for (const members of Object.values(TEAMS)) {
    for (const m of members) {
      if (m.name !== name)
        continue;
      const l = m.loadout;
      const n = axis === "weapons" ? l.weapons.length : axis === "echoes" ? l.echoLoadouts.length : axis === "mainstats" ? l.mainstats.length : axis === "substats" ? 2 : axis === "refines" ? Math.max(...l.refinements.map((r) => r.length)) : l.sequences.length ? l.sequences.length - Math.max(l.minSequence, l.resonator.tier === 2 ? 0 : Math.min(baseSequence(l.resonator), l.sequences.length)) + 1 : 1;
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
var tagOwner = (tag) => tag.replace(/ S\d+(R\d+)?$| R\d+$/, "");
function tagsHold(map, names, fielded) {
  const wanted = /* @__PURE__ */ new Map();
  for (const [name, mode] of map) {
    if (mode === "exclude") {
      if (names.includes(name))
        return false;
      continue;
    }
    const who = tagOwner(name);
    if (!fielded.includes(who))
      continue;
    wanted.set(who, [...wanted.get(who) ?? [], name]);
  }
  return [...wanted.values()].every((group) => group.some((name) => names.includes(name)));
}
var poolAdded = [];
var poolNeeds = /* @__PURE__ */ new Map();
var poolAlone = /* @__PURE__ */ new Set();
var poolKey = null;
function leaderNeeds() {
  const added2 = [...resonatorFilters].filter(([, mode]) => mode === "include").map(([name]) => name);
  const key = added2.join("\0");
  if (key === poolKey)
    return poolNeeds;
  [poolKey, poolAdded, poolNeeds] = [key, added2, /* @__PURE__ */ new Map()];
  poolAlone = new Set(added2);
  for (const ms of Object.values(TEAMS)) {
    const here = added2.filter((o) => ms.some((x) => x.name === o));
    if (here.length > 1)
      for (const o of here)
        poolAlone.delete(o);
    const whole = ms.every((x) => added2.includes(x.name));
    for (const m of ms) {
      if (!MDPS_NAMES.has(m.name) || !added2.includes(m.name))
        continue;
      const held = m.mainDps || whole ? added2.filter((o) => o !== m.name && ms.some((x) => x.name === o)).length : 0;
      poolNeeds.set(m.name, Math.max(poolNeeds.get(m.name) ?? 0, held));
    }
  }
  return poolNeeds;
}
function teamWanted(key, members) {
  const has = (name) => members.some((m) => m.name === name);
  if (!PRIMARY_TEAMS.has(key) && !members.some((m) => INTERCHANGEABLE.has(m.loadout) && resonatorFilters.get(m.name) === "include") && !members.every((m) => INTERCHANGEABLE.has(m.loadout) || resonatorFilters.get(m.name) === "include"))
    return false;
  for (const [name, mode] of resonatorFilters)
    if (mode === "exclude" && has(name))
      return false;
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
function sequenceTagsOf(m, f = filters) {
  return sequenceLevels(m, f).map((level) => sequenceTagAt(m, level, f) ?? "");
}
var refineTag = (m, combo) => `${m.name} R${combo.weapon.refinement}`;
function rowWanted(row) {
  const fielded = row.members.map((m) => m.name);
  return namesHold(weaponFilters, row.combo.flatMap((c) => [c.weapon.name, weaponBase(c.weapon)])) && namesHold(echoFilters, row.combo.map((c, i) => echoLabel(row.members[i].loadout, c.echo))) && tagsHold(sequenceFilters, row.combo.flatMap((c, i) => sequenceTag(row.members[i], c) ?? []), fielded) && tagsHold(refineFilters, row.combo.map((c, i) => refineTag(row.members[i], c)), fielded);
}
function expandTeam(teamKey2, members) {
  const solved = bestPicks.get(bestKey(teamKey2, members, filters));
  if (!solved || !teamWanted(teamKey2, members))
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
  return [...rows.values()].filter(rowWanted);
}
var teamRows = () => Object.entries(TEAMS).flatMap(([key, members]) => expandTeam(key, members));
function axisWays(lists, map, cap = Infinity, tagged = false) {
  const excluded = [...map].filter(([, mode]) => mode === "exclude").map(([n]) => n);
  const sizes = (drop) => lists.map((l) => l === null ? 1 : l.filter((n) => !drop.includes(n)).length);
  const product = (drop) => sizes(drop).reduce((p, n) => p * Math.min(cap, n), 1);
  const untestable = lists.includes(null) || sizes(excluded).some((n) => n > cap);
  const included = untestable ? [] : [...map].filter(([, mode]) => mode === "include").map(([n]) => n);
  const groups = /* @__PURE__ */ new Map();
  for (const name of included) {
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
  return axisWays(members.map((m) => axisOpen(m, f, "weapons") ? eligibleWeapons(m, f).map((i) => m.loadout.weapons[i].name) : null), weaponFilters) * axisWays(members.map((m) => axisOpen(m, f, "echoes") ? m.loadout.echoLoadouts.map((e) => echoLabel(m.loadout, e)) : null), echoFilters) * members.reduce((n, m) => n * (axisOpen(m, f, "mainstats") ? Math.min(MAINSTAT_ROWS, m.loadout.mainstats.length) : 1), 1) * axisWays(members.map((m) => sequenceTagsOf(m, f)), sequenceFilters, Infinity, true) * members.reduce((n, m) => n * (axisOpen(m, f, "substats") ? 2 : 1), 1) * members.reduce((n, m) => n * (axisUsed(m, f, "refines") ? Math.max(...eligibleWeapons(m, f).map((i) => m.loadout.refinements[i].length)) : 1), 1) * members.reduce((n, m) => n * (!axisOpen(m, f, "echoes") && axisUsed(m, f, "echoes") ? m.loadout.echoLoadouts.length : 1) * (!axisOpen(m, f, "mainstats") && axisUsed(m, f, "mainstats") ? Math.min(MAINSTAT_ROWS, m.loadout.mainstats.length) : 1), 1);
}
function prospectiveRows(f = filters) {
  return Object.entries(TEAMS).filter(([key, members]) => teamWanted(key, members)).reduce((sum, [, members]) => sum + estimatedRowCount(members, f), 0);
}
function rowFromKey(key) {
  const [teamKey2, ...comboKeys] = key.split("-");
  if (!teamKey2)
    return null;
  const members = TEAMS[teamKey2];
  if (!members || comboKeys.length !== members.length)
    return null;
  const combo = [];
  for (let i = 0; i < members.length; i++) {
    const parsed = /^(\d+)\.(\d+)\.(\d+)\.s(\d+)\.r(\d+)(\.m)?(\.h)?$/.exec(comboKeys[i]);
    if (!parsed)
      return null;
    const l = members[i].loadout;
    const pick = { weapon: +parsed[1], echo: +parsed[2], mainstat: +parsed[3], sequence: +parsed[4], refine: +parsed[5], matrix: !!parsed[6], highSubs: !!parsed[7] };
    if (!l.refinements[pick.weapon]?.[pick.refine] || !l.echoLoadouts[pick.echo] || !l.mainstats[pick.mainstat] || pick.matrix && !l.resonator.matrix)
      return null;
    combo.push(comboOf(l, pick));
  }
  return { key, teamKey: teamKey2, members, combo };
}
function detailFor(run) {
  if (run.detail)
    return run.detail;
  if (!run.rotationLines) {
    const traced = runTeam(run.teamKey, run.members, run.combo, true);
    run.rotationLines = traced.rotationLines;
    run.state = traced.state;
  }
  run.detail = { report: buildReport(run.rotationLines.flat()) };
  return run.detail;
}
var SOLVES_KEY = "wuwa.solves.v1";
var buildStamp = null;
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
  return picks.length === team.loadouts.length && picks.every((p, i) => {
    const l = team.loadouts[i];
    return p.weapon < l.weapons.length && p.refine < (l.refinements[p.weapon]?.length ?? 0) && p.echo < l.echoLoadouts.length && p.mainstat < l.mainstats.length;
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
      for (const weapon of weapons) {
        for (const refine of refineLevels(m, f, { ...solved.picks[i], weapon, sequence }))
          pairs.add(`${sequence}.${refine}`);
      }
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
    for (const [k, v] of saved.solves)
      if (solveFits(k, v)) {
        bestPicks.set(k, v);
        restoredSolves = true;
      }
    for (const [k, v] of saved.picks)
      if (picksFit(k, v)) {
        picksCache.set(k, v);
        restoredSolves = true;
      }
  };
  try {
    const live = await fetch("/__livereload", { cache: "no-store" }).catch(() => null);
    if (live?.ok)
      buildStamp = `dev:${await live.text()}`;
    else {
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
      picks: [...picksCache]
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
  s6r5: "s6r5"
};
var FILTER_GROUPS = [
  { include: "r", exclude: "x", map: resonatorFilters },
  { include: "wr", exclude: "wx", map: weaponFilters },
  { include: "er", exclude: "ex", map: echoFilters },
  { include: "sr", exclude: "sx", map: sequenceFilters },
  { include: "fr", exclude: "fx", map: refineFilters }
];
function applyHash() {
  const params = hashParams();
  let changed = false;
  {
    const legacy = (params.get("f") ?? "").split(",").filter(Boolean);
    const next = params.has("mx") ? (params.get("mx") ?? "").split(",").filter(Boolean).map((n) => RESONATOR_NAME_BY_COMPACT.get(n) ?? n) : legacy.includes("x") || legacy.includes("matrix") ? [...MATRIX_RESONATORS] : [];
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
    const cur = filters.scoped.map(scopedKey);
    if (next.length !== cur.length || next.some((s) => !cur.includes(scopedKey(s)))) {
      filters.scoped = next;
      changed = true;
    }
  }
  const named = (v, mode, resonators) => (v ?? "").split(",").filter(Boolean).map((name) => [resonators ? RESONATOR_NAME_BY_COMPACT.get(name) ?? name : name, mode]);
  for (const { include, exclude, map } of FILTER_GROUPS) {
    const resonators = map === resonatorFilters;
    const next = new Map([...named(params.get(exclude), "exclude", resonators), ...named(params.get(include), "include", resonators)]);
    if (next.size !== map.size || [...next].some(([n, m]) => map.get(n) !== m)) {
      map.clear();
      for (const [name, mode] of next)
        map.set(name, mode);
      changed = true;
    }
  }
  return changed;
}
var TAG_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function teamTag(key) {
  const [teamKey2, ...comboKeys] = key.split("-");
  const team = /^t(\d+)$/.exec(teamKey2 ?? "");
  if (!team || +team[1] > 16383)
    return key;
  let bits = BigInt(+team[1]), width = 14n;
  for (const combo of comboKeys) {
    const p = /^(\d+)\.(\d+)\.(\d+)\.s(\d+)\.r(\d+)(\.m)?(\.h)?$/.exec(combo);
    if (!p)
      return key;
    const [weapon, echo, mainstat, sequence, refine] = p.slice(1, 6).map(Number);
    if (weapon > 7 || echo > 7 || mainstat > 63 || sequence > 7 || refine > 7)
      return key;
    const packed = weapon | echo << 3 | mainstat << 6 | sequence << 12 | refine << 15 | (p[6] ? 1 << 18 : 0) | (p[7] ? 1 << 19 : 0);
    bits |= BigInt(packed) << width;
    width += 20n;
  }
  const base = BigInt(TAG_DIGITS.length);
  let tag = "";
  do {
    tag = TAG_DIGITS[Number(bits % base)] + tag;
    bits /= base;
  } while (bits > 0n);
  return tag;
}
function hashTeam() {
  const tag = hashParams().get("team");
  if (!tag || !/^[0-9a-zA-Z]+$/.test(tag))
    return tag;
  let bits = 0n;
  for (const c of tag)
    bits = bits * BigInt(TAG_DIGITS.length) + BigInt(TAG_DIGITS.indexOf(c));
  const teamKey2 = `t${Number(bits & 0x3fffn)}`;
  const members = TEAMS[teamKey2];
  if (!members)
    return tag;
  bits >>= 14n;
  const combos = members.map(() => {
    const packed = Number(bits & 0xfffffn);
    bits >>= 20n;
    return `${packed & 7}.${packed >> 3 & 7}.${packed >> 6 & 63}.s${packed >> 12 & 7}.r${packed >> 15 & 7}` + (packed & 1 << 18 ? ".m" : "") + (packed & 1 << 19 ? ".h" : "");
  });
  return [teamKey2, ...combos].join("-");
}
function syncHash(team = hashTeam(), push = false) {
  const named = (map, mode) => [...map].filter(([, m]) => m === mode).map(([name]) => encodeURIComponent(map === resonatorFilters ? name.replace(/ /g, "") : name)).join(",");
  const compact = (n) => encodeURIComponent(n.replace(/ /g, ""));
  const parts = filters.matrix.length ? [`mx=${filters.matrix.map(compact).join(",")}`] : [];
  if (filters.cost !== "s0r1")
    parts.push(`tc=${COST_CODE[filters.cost]}`);
  for (const axis of AXES) {
    if (filters[axis].length)
      parts.push(`${COMPARE_PARAM[axis]}=${filters[axis].map((n) => encodeURIComponent(n.replace(/ /g, ""))).join(",")}`);
  }
  if (filters.scoped.length)
    parts.push(`${SCOPED_PARAM}=${filters.scoped.map((s) => encodeURIComponent(scopedKey(s))).join(",")}`);
  for (const { include, exclude, map } of FILTER_GROUPS) {
    if (named(map, "include"))
      parts.push(`${include}=${named(map, "include")}`);
    if (named(map, "exclude"))
      parts.push(`${exclude}=${named(map, "exclude")}`);
  }
  if (team)
    parts.push(`team=${teamTag(team)}`);
  const next = parts.length ? `#${parts.join("&")}` : "";
  if (next === location.hash)
    return;
  const url = `${location.pathname}${location.search}${next}`;
  if (push)
    history.pushState({ detail: true }, "", url);
  else
    history.replaceState(history.state, "", url);
}
var routeTeam = () => {
  const key = hashTeam();
  return key && results.has(key) ? key : null;
};

// dist/src/page/panels.js
var esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var coarse = matchMedia("(pointer: coarse)").matches;
var CLICK = coarse ? "Tap" : "Click";
var CLICKING = coarse ? "tapping" : "clicking";
var lazyPop = (html) => html ? ` data-pop='${html.replace(/&/g, "&amp;").replace(/'/g, "&#39;")}'` : "";
var deferredPop = (kind, key) => ` data-pop-kind="${kind}" data-pop-key="${esc(key)}"`;
function buildPop(kind, key) {
  if (kind === "dpr") {
    const run = results.get(key);
    return run ? `<span class="pop dpr">${dprTable(run)}</span>` : "";
  }
  return "";
}
var zoom = () => {
  const w = document.body.clientWidth;
  return w ? document.body.getBoundingClientRect().width / w : 1;
};
var rect = (el) => {
  const r = el.getBoundingClientRect(), z = zoom();
  return z === 1 ? r : new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z);
};
var clearPops = () => {
  document.body.querySelectorAll(":scope > .pop").forEach((el) => el.remove());
};
var unit = (r) => r.percent ?? (r.stat !== void 0 ? isPercent(r.stat) : false) ? "%" : "";
var SECTION_ORDER = ["base", "bonus", "flat", "final"];
var SECTION_RANK = (key) => {
  if (key === null)
    return -1;
  const word = key.split(" ")[0].toLowerCase();
  const i = SECTION_ORDER.indexOf(word);
  return i === -1 ? SECTION_ORDER.length + 1 : i;
};
var panelRow = (r, slotHue, { noSource = false } = {}) => {
  const own = r.owner !== void 0 ? slotHue.get(r.owner ?? "") ?? TUNE_BREAK_ENEMY.color : null;
  const label = r.label ?? (r.stat !== void 0 ? statLabel(r.stat) : "");
  const source = (r.count ?? 1) > 1 ? `${r.source} x${r.count}` : r.source;
  const show = (v) => r.digits === void 0 ? fmtExact(v) : fmt(v, r.digits, true);
  const value = `<td class="v">${r.text !== void 0 ? esc(r.text) : r.mult ? `&times;${show(r.value)}` : `${show(r.value)}${unit(r)}`}</td>`;
  if (r.summary)
    return `<tr class="sum${r.joined ? " joined" : ""}"><td class="k">${esc(label)}</td>${value}</tr>`;
  return noSource ? `<tr><td class="k">${esc(label)}</td>${value}</tr>` : `<tr><td class="s"${own ? ` style="--own:${own}"` : ""}>${esc(source || label)}</td>${value}</tr>`;
};
function popover(col, rows, total, slotHue, suffix = "", empty = "") {
  if (!rows)
    return "";
  const noSource = col.key === "avg";
  const row = (r) => panelRow(r, slotHue, { noSource });
  const before = rows.filter((r) => r.place === "beforeTotal");
  const after = rows.filter((r) => r.place === "afterTotal");
  const listed = rows.filter((r) => !r.place);
  const bySection = /* @__PURE__ */ new Map();
  for (const r of listed) {
    const key = r.section ?? null;
    if (!bySection.has(key))
      bySection.set(key, []);
    bySection.get(key).push(r);
  }
  const sections = [...bySection].map(([key, group]) => ({ key, rows: group })).sort((a, b) => SECTION_RANK(a.key) - SECTION_RANK(b.key));
  const body = sections.map(({ key, rows: group }) => `<tr class="sec"><td colspan="2">${esc(key ?? col.full ?? col.label)}</td></tr>` + group.map(row).join("")).join("");
  const titled = sections.length ? body : `<tr class="sec${empty ? " plain" : ""}"><td colspan="2">${esc(empty || (col.fullEmpty ?? col.full ?? col.label))}</td></tr>`;
  const sum = col.noTotal ? "" : `<tr class="sum"><td class="k">Total</td><td class="v">${fmtExact(total)}${col.percent ? "%" : ""}${esc(suffix)}</td></tr>`;
  return lazyPop(`<span class="pop stat${col.key === "avg" ? " damage" : ""}"><table>${titled}${before.map(row).join("")}${sum}${after.map(row).join("")}</table></span>`);
}
function infoPopover(info, slotHue) {
  if (!info?.length)
    return "";
  const rows = info.map((e) => {
    if (e.source !== void 0) {
      const hue = slotHue.get(e.source) ?? TUNE_BREAK_ENEMY.color;
      return `<tr><td class="k">${esc(e.label)}</td><td class="v s" style="--own:${hue}">${esc(e.value)}</td></tr>`;
    }
    return `<tr><td class="k">${esc(e.label)}</td><td class="v">${esc(e.value)}</td></tr>`;
  }).join("");
  return lazyPop(`<span class="pop info"><table>${rows}</table></span>`);
}
function framesPopover(snaps) {
  const line = (k, v, cls = "") => `<tr${cls}><td class="k">${esc(k)}</td><td class="v">${v}</td></tr>`;
  const rows = [];
  let total = 0, banks = 0;
  for (const s of snaps) {
    if (!s.active)
      continue;
    const press = s.hitAt !== void 0 ? s.action.castPart() : s.action;
    const hold = s.tag === ActionTag.HoldCancel && s.holdPaid >= 0;
    const cost = hold ? press.holdCost(s.action.letGo(s.holdPaid)) : press.cost(s.tag);
    total += cost.total - s.timestopBanked;
    const insta = s.tag === ActionTag.InstaCancel || s.tag === ActionTag.InstaDodge || s.tag === ActionTag.InstaJump || s.tag === ActionTag.InstaSwap;
    const fast = s.tag === ActionTag.MashCancel;
    const cut = s.tag === ActionTag.Cancel || s.tag === ActionTag.MashCancel || s.tag === ActionTag.HoldCancel || s.tag === ActionTag.DodgeCancel || s.tag === ActionTag.JumpCancel || s.tag === ActionTag.SwapCancel || s.tag === ActionTag.HitCancel || s.tag === ActionTag.DodgeOnHit || s.tag === ActionTag.JumpOnHit;
    if (hold) {
      const own = Math.min(Math.max(s.holdPaid, s.action.prioFrames), cost.action);
      if (own)
        rows.push(line(`${s.action.name} (c)`, own));
      if (cost.action > own)
        rows.push(line("Hold Input", cost.action - own));
    } else if (!insta)
      rows.push(line(`${s.action.name}${cut ? " (c)" : ""}`, cost.action));
    if (cost.timestop)
      rows.push(line("Timestop", -cost.timestop));
    if (cost.global)
      rows.push(line(insta ? "Input Delay" : fast ? "Mash delay" : "Cancel Timing", cost.global));
    if (s.timestopBanked)
      rows.push(line("Banked Timestop", -s.timestopBanked));
    if (s.swapFrames)
      rows.push(line("Swap Delay", s.swapFrames));
    total += s.swapFrames ?? 0;
    banks += Math.max(0, s.action.timestop - cost.timestop);
  }
  return lazyPop(`<span class="pop frames"><table><tr class="sec"><td colspan="2">Active Frames</td></tr>` + rows.join("") + line("Total", total, ' class="sum"') + (banks ? line("Timestop Banked", banks) : "") + `</table></span>`);
}
var GEAR_SECTION_ENABLED = false;
function buffsPopover(member2, gear, local, global, enemy, slotHue) {
  const showGear = GEAR_SECTION_ENABLED && gear.length > 0;
  if (!showGear && !local.length && !global.length && !enemy.length) {
    return lazyPop(`<span class="pop buffs"><table><tr class="sec"><td>No buffs</td></tr></table></span>`);
  }
  const order = [...slotHue.keys()];
  const rank = (b) => {
    const i = order.indexOf(b.source);
    return i === -1 ? order.length : i;
  };
  const sorted = (buffs) => [...buffs].sort((a, b) => rank(a) - rank(b) || a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
  const left = (frames) => frames > 0 ? ` <span class="left">(${Math.round(frames / 6) / 10}s)</span>` : "";
  const row = (name, hue, frames = 0) => `<tr><td class="s" style="--own:${hue}">${esc(name)}${left(frames)}</td></tr>`;
  const own = slotHue.get(member2) ?? FALLBACK_HUE;
  const gearSection = showGear ? `<tr class="sec"><td>Gear</td></tr>` + gear.map((g) => row(g.name, own)).join("") : "";
  const section = (heading, buffs) => buffs.length ? `<tr class="sec"><td>${esc(heading)}</td></tr>` + sorted(buffs).map((b) => row(b.name, slotHue.get(b.source) ?? TUNE_BREAK_ENEMY.color, b.left)).join("") : "";
  const columns = [
    gearSection + section("Local buffs", local),
    section("Global buffs", global),
    section("Enemy debuffs", enemy)
  ].filter(Boolean).map((rows) => `<table>${rows}</table>`).join("");
  return lazyPop(`<span class="pop buffs"><div class="cols">${columns}</div></span>`);
}
function eachHit(lines, slot, fn) {
  const mine = (snap) => slot === null || snap.slot === slot;
  for (const line of lines) {
    if (line.aggregate)
      continue;
    if (!line.isChain) {
      if (mine(line.snap))
        fn(line.snap, line.avg);
      continue;
    }
    const members = new Set(line.members ?? []);
    for (const p of line.parts)
      if (members.has(p.snap) && mine(p.snap))
        fn(p.snap, p.dmg.avg);
  }
}
function equippedGear(member2, combo, erRolls = 1) {
  const l = member2.loadout;
  const r = l.resonator;
  return [
    ...r.inherent1 ? [["Inherent", r.inherent1]] : [],
    ...r.inherent2 ? [["Inherent", r.inherent2]] : [],
    ["Weapon", combo.weapon],
    ["Mainslot", combo.echo.mainslot],
    ...combo.echo.sets.map((g, i) => [i === 0 ? "Sonata" : "", g]),
    ["Mainstats", combo.mainstat],
    ["Substats", l.spread(combo.highSubs, erRolls)]
  ];
}
var ATTRIBUTE_SCOPES = [
  64,
  128,
  192,
  256,
  320,
  384,
  448
];
var CORE_TYPE_SCOPES = [
  4096,
  8192,
  12288,
  16384
  /* Type.Liberation */
];
var OTHER_SCOPES = [
  20480,
  24576,
  28672,
  32768,
  36864,
  40960,
  49152,
  53248,
  262144,
  524288,
  786432,
  1048576,
  1310720,
  1572864
];
function menuStatRows(member2, combo, erRolls) {
  const l = member2.loadout;
  const entries = menuStats(l.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs, erRolls));
  const totals = /* @__PURE__ */ new Map();
  for (const e of entries)
    totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.value);
  const get = (key) => totals.get(key) ?? 0;
  const fold = (base, bonus, flat) => get(base) * (1 + get(bonus) / 100) + get(flat);
  const rows = [];
  const push = (label, value, percent) => {
    if (!value)
      return;
    rows.push({ label, value: `${fmt(value, percent ? 1 : 0, percent)}${percent ? "%" : ""}` });
  };
  const pushBest = (scopes) => {
    let bestTag = null, bestValue = 0;
    for (const tag of scopes) {
      const v = get(scopedStat(
        tag,
        17
        /* Stat.DmgBonus */
      ));
      if (v > bestValue) {
        bestValue = v;
        bestTag = tag;
      }
    }
    if (bestTag !== null)
      push(statLabel(scopedStat(
        bestTag,
        17
        /* Stat.DmgBonus */
      )), bestValue, true);
  };
  push("HP", fold(
    1,
    7,
    4
    /* Stat.FlatHp */
  ), false);
  push("ATK", fold(
    0,
    6,
    3
    /* Stat.FlatAtk */
  ), false);
  push("DEF", fold(
    2,
    8,
    5
    /* Stat.FlatDef */
  ), false);
  push(statLabel(
    11
    /* Stat.Er */
  ), get(
    11
    /* Stat.Er */
  ), true);
  push(statLabel(
    9
    /* Stat.CritRate */
  ), get(
    9
    /* Stat.CritRate */
  ), true);
  push(statLabel(
    10
    /* Stat.CritDmg */
  ), get(
    10
    /* Stat.CritDmg */
  ), true);
  push(statLabel(
    12
    /* Stat.Tbb */
  ), get(
    12
    /* Stat.Tbb */
  ), false);
  pushBest(ATTRIBUTE_SCOPES);
  pushBest(CORE_TYPE_SCOPES);
  pushBest(OTHER_SCOPES);
  return rows;
}
var subsLabel = (combo) => combo.highSubs ? "High Invest" : "ChemX32";
function declaredRows(buffs, owner, fold, lit = []) {
  const rowsOf = (b) => b.decl.stats.map((line) => {
    const [stat, value, tag] = line;
    return { stat: tag === void 0 ? stat : scopedStat(tag, stat), value, source: b.name, owner, gear: b };
  });
  if (!fold)
    return buffs.flatMap(rowsOf);
  const by = /* @__PURE__ */ new Map();
  for (const b of buffs) {
    const rows = rowsOf(b);
    const key = `${b.name} ${rows.map((e) => e.stat).join(",")}`;
    const seen = by.get(key);
    if (seen)
      seen.n++;
    else
      by.set(key, { rows, n: 1 });
  }
  return [...by.values()].flatMap(({ rows, n }) => rows.map((e) => ({
    ...e,
    value: e.value * n,
    source: `${e.source} x${n}`,
    dim: n === 1 && !lit.includes(e.stat)
  })));
}
function buffStats(run, keep) {
  const grantedBy = run.state?.grantedBy;
  if (!grantedBy || !run.rotationLines)
    return [];
  const rootOf = (g) => grantedBy.get(g) ?? g;
  const peak = /* @__PURE__ */ new Map();
  for (const section of run.rotationLines) {
    for (const line of section) {
      for (const snap of hitsOf(line)) {
        for (const e of snap.entries) {
          if (!e.gear || e.value === 0 || !keep(rootOf(e.gear), e, snap.slot))
            continue;
          let byStat = peak.get(e.gear);
          if (!byStat)
            peak.set(e.gear, byStat = /* @__PURE__ */ new Map());
          if (e.value > (byStat.get(e.stat)?.value ?? 0))
            byStat.set(e.stat, e);
        }
      }
    }
  }
  return [...peak.values()].flatMap((byStat) => [...byStat.values()]);
}
var lineKey = (e) => `${e.gear?.id} ${e.stat} ${e.value}`;
var constantKeys = (stats) => new Set(stats.map(lineKey));
var statRow = (e, owner, slotHue, noStat = false) => {
  const percent = isPercent(e.stat);
  const stat = splitStat(e.stat)[0];
  const resource = stat === 26 || stat === 27;
  return `<tr class="stat${e.dim ? " one" : ""}"><td class="s" style="--own:${slotHue.get(owner) ?? FALLBACK_HUE}">${esc(e.source)}</td>` + (noStat ? "" : `<td class="k">${esc(statLabel(e.stat))}</td>`) + `<td class="v">${fmt(e.value / statDisplayScale(stat), percent ? 1 : resource ? 2 : 0)}${percent ? "%" : ""}</td></tr>`;
};
function piecePopover(run, pieces, owner, slotHue) {
  const own = new Set(pieces);
  const stats = menuStats(pieces);
  const constant = constantKeys(stats);
  const grantedOn = run.state?.grantedOn;
  const grantedBy = run.state?.grantedBy;
  const order = new Map(pieces.map((g, i) => [g, i]));
  const rank = (e) => order.get((e.gear ? grantedBy?.get(e.gear) : void 0) ?? e.gear) ?? 0;
  const mine = (e, slot) => (grantedOn?.get(e.gear) ?? slot) === owner;
  const buffs = buffStats(run, (root, e, slot) => own.has(root) && !constant.has(lineKey(e)) && mine(e, slot));
  return statsPanel(stats, buffs.sort((a, b) => rank(a) - rank(b)), owner, slotHue);
}
function resonatorPopover(run, kit, equipped, owner, slotHue) {
  const stats = menuStats([...kit]);
  const constant = constantKeys(stats);
  const forte = (e) => e.stat >= 30 && e.stat <= 34;
  const mine = (root, e) => e.owner === owner && (kit.has(root) || !equipped.has(root)) && !constant.has(lineKey(e)) && !forte(e);
  return statsPanel(stats, buffStats(run, mine), owner, slotHue);
}
function statsPanel(stats, buffs, owner, slotHue, heading = "Stats", noStat = false) {
  const row = (e) => statRow(e, owner, slotHue, noStat);
  const cols = noStat ? 2 : 3;
  if (!stats.length && !buffs.length)
    return "";
  return lazyPop(`<span class="pop gear"><table>` + (stats.length ? `<tr class="sec"><td colspan="${cols}">${esc(heading)}</td></tr>${stats.map(row).join("")}` : "") + (buffs.length ? `<tr class="sec"><td colspan="${cols}">Buffs</td></tr>${buffs.map(row).join("")}` : "") + `</table></span>`);
}
function loadoutTable(run, needs) {
  const erRolls = erRollsFor(run.teamKey, run.members, run.combo);
  const builds = run.members.map((m, i) => ({ member: m, combo: run.combo[i], erRolls: erRolls[i] }));
  const slotHue = new Map([
    ...run.members.map((m) => [m.name, m.color]),
    [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]
  ]);
  const kitOf = ({ member: member2, combo }) => {
    const r = member2.loadout.resonator;
    return new Set([r, r.talent, r.inherent1, r.inherent2, combo.matrix].filter((g) => g != null));
  };
  const equipped = new Set(builds.flatMap(({ member: member2, combo, erRolls: n }) => member2.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs, n)));
  const head = `<div class="rtrow rthead"><div class="c lbl">Resonator</div>` + builds.map((b) => {
    const hover = resonatorPopover(run, kitOf(b), equipped, b.member.name, slotHue);
    return `<div class="c mem${hover ? " has" : ""}"${hover} style="--mem:${b.member.color}">${esc(b.member.name)}</div>`;
  }).join("") + `</div>`;
  const row = (label, cells) => `<div class="rtrow"><div class="c lbl">${esc(label)}</div>${cells.join("")}</div>`;
  const gearCell = (owner, g, pieces) => {
    if (!g)
      return `<div class="c"></div>`;
    const hover = piecePopover(run, pieces ?? [g], owner, slotHue);
    return `<div class="c${hover ? " has" : ""}"${hover}>${esc(g.name)}</div>`;
  };
  const rows = [];
  rows.push(row("Weapon", builds.map((b) => gearCell(b.member.name, b.combo.weapon))));
  rows.push(row("Mainslot", builds.map((b) => gearCell(b.member.name, b.combo.echo.mainslot))));
  const sonataOf = builds.map(({ combo }) => combo.echo.sets);
  const sonatas = Math.max(...sonataOf.map((list) => list.length));
  for (let i = 0; i < sonatas; i++) {
    rows.push(row(i === 0 ? "Sonata" : "", builds.map((b, k) => {
      const set = sonataOf[k][i] ?? null;
      return gearCell(b.member.name, set, set instanceof Sonata ? [set, set.sonata2pc] : void 0);
    })));
  }
  const spreadCell = (piece, owner, stats, heading, noStat = false) => {
    const hover = statsPanel(stats, [], owner, slotHue, heading, noStat);
    return `<div class="c has"${hover}>${esc(piece.name)}</div>`;
  };
  rows.push(row("Mainstats", builds.map((b) => spreadCell(b.combo.mainstat, b.member.name, declaredRows(mainstatSlotBuffs(b.combo.mainstat), b.member.name, false), "Mainstats & Secondary Stats"))));
  rows.push(row("Substats", builds.map((b) => {
    const l = b.member.loadout;
    const piece = l.spread(b.combo.highSubs, b.erRolls);
    const rolls = substatRollBuffs(piece);
    const lit = litStats(l.resonator.maxEnergy);
    return spreadCell(piece, b.member.name, declaredRows(rolls, b.member.name, true, lit), `Substats (${rolls.length} lines)`, true);
  })));
  if (builds.some((b) => b.combo.sequence > 0)) {
    rows.push(row("Sequences", builds.map((b) => {
      if (!b.combo.sequence)
        return `<div class="c"></div>`;
      const held = b.member.loadout.sequences.slice(0, b.combo.sequence);
      const hover = piecePopover(run, held, b.member.name, slotHue);
      return `<div class="c${hover ? " has" : ""}"${hover}>${held.map((_, i) => `S${i + 1}`).join(", ")}</div>`;
    })));
  }
  if (builds.some((b) => b.member.loadout.mode)) {
    rows.push(row("Mode", builds.map((b) => gearCell(b.member.name, b.member.loadout.mode ?? null))));
  }
  rows.push(row("Menu Stats", builds.map((b) => {
    const req = needs?.get(b.member.name);
    const stats = menuStatRows(b.member, b.combo, b.erRolls).map((r) => {
      const need = req?.get(r.label);
      const label = need ? `${esc(r.label)} ${need}` : esc(r.label);
      return `<tr><td class="k">${label}</td><td class="v">${esc(r.value)}</td></tr>`;
    }).join("");
    return `<div class="c menustats"><table>${stats}</table></div>`;
  })));
  return `<div class="rtable loadout" style="--cols:${builds.length}">${head}${rows.join("")}</div>`;
}
function dprTable(run, lines) {
  const grand = run.fightTotal;
  const flat = lines?.flat();
  const whole = run.sectionTotals.length;
  const slots = [...run.members.map((m) => m.name), TUNE_BREAK_ENEMY.name];
  const slotHue = new Map([
    ...run.members.map((m) => [m.name, m.color]),
    [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]
  ]);
  const sections = ["Opener", ...Array.from({ length: whole - 1 }, (_, i) => `Loop ${i + 1}`), "4 Rots"];
  const ownTotal = (slot) => run.fightBySlot.get(slot) ?? 0;
  const selected2 = flat ? `${TEAM_ROW}|${whole}` : "";
  if (lines)
    distCells = new Map([
      ...slots.flatMap((slot) => [...lines.slice(0, whole), lines.flat()].map((sec, i) => [
        `${slot}|${i}`,
        distCell(sec, slot, sections[i] ?? "", slotHue.get(slot) ?? TUNE_BREAK_ENEMY.color)
      ])),
      // the team's own row reads the rotation itself rather than one slot's share of it: one section
      // for each loop column, the whole fight in order for the Total
      ...[...lines.slice(0, whole).map((sec) => [sec]), lines].map((secs, i) => [`${TEAM_ROW}|${i}`, teamCell(secs, sections[i] ?? "", slotHue)])
    ]);
  const head = `<div class="rtrow rthead"><div class="c"></div>` + sections.slice(0, whole).map((n) => `<div class="c num">${n}</div>`).join("") + `<div class="c num tot">Total</div></div>`;
  const valueCell = (sec, value, key, cls = "") => sec ? `<div class="c num dist-cell${cls}${key === selected2 ? " sel" : ""}" data-dist="${key}">${fmt(value)}</div>` : `<div class="c num${cls}">${fmt(value)}</div>`;
  const rowLabel = (slot, mem) => `<div class="c name"${mem}${lines ? ` data-dist-row="${esc(slot)}"` : ""}>${esc(slot)}</div>`;
  const dataRow = (slot, color) => {
    const own = ownTotal(slot);
    return `<div class="rtrow">` + rowLabel(slot, ` style="--mem:${color}"`) + run.sectionBySlot.map((by, i) => valueCell(lines?.[i], by.get(slot) ?? 0, `${slot}|${i}`)).join("") + valueCell(flat, own, `${slot}|${whole}`, " tot") + `</div>`;
  };
  const memberRows = run.members.map((m) => dataRow(m.name, m.color)).join("");
  const tuneBreakRow = dataRow(TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color);
  const totalRow = `<div class="rtrow total">` + rowLabel(TEAM_ROW, "") + run.sectionTotals.map((v, i) => valueCell(lines?.[i], v, `${TEAM_ROW}|${i}`)).join("") + valueCell(flat, grand, `${TEAM_ROW}|${whole}`, " tot") + `</div>`;
  const distRow = lines ? distributionRow(selected2) : "";
  const rowsCss = lines ? `;grid-template-rows:repeat(${run.members.length + 3}, max-content) 1fr` : "";
  return `<div class="rtable dpr" data-total-col="${whole}" style="--secs:${whole + 1}${rowsCss}">${head}${memberRows}${tuneBreakRow}${totalRow}${distRow}</div>`;
}
var driver = null;
var drivePanel = (cell2, html) => driver?.show(cell2, html);
var dropPanel = () => driver?.hide();
var holdPanels = (on) => driver?.hold(on);
function wireSourcePanels(root) {
  const GAP = 4, EDGE = 6;
  let open = null;
  let openHome = null;
  let pinned = false;
  clearPops();
  const built = /* @__PURE__ */ new WeakMap();
  const close = () => {
    open?.remove();
    open = null;
    openHome = null;
    pinned = false;
  };
  const place2 = (cell2, pop) => {
    if (pop.parentElement !== document.body)
      document.body.appendChild(pop);
    pop.style.visibility = "hidden";
    pop.style.display = "block";
    const c = rect(cell2);
    const p = rect(pop);
    const winW = innerWidth / zoom(), winH = innerHeight / zoom();
    const onTable = !!cell2.closest(".tcwrap");
    const natural = !onTable && cell2.classList.contains("num") ? c.right - p.width : c.left;
    const wrap = onTable ? null : cell2.closest(".gridwrap");
    const tableLeft = wrap ? rect(wrap).left : EDGE;
    const minLeft = Math.max(EDGE, tableLeft);
    const left = Math.max(minLeft, Math.min(natural, winW - p.width - EDGE));
    const above = c.top - p.height - GAP;
    const below = c.bottom + GAP;
    const fitsBelow = below + p.height <= winH - EDGE;
    const top = fitsBelow ? below : Math.max(EDGE, above);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.visibility = "";
    open = pop;
    openHome = cell2;
  };
  const homeIn = (target, cell2) => {
    for (let el = target; el && el !== cell2; el = el.parentElement) {
      const data = el.dataset;
      if (built.has(el) || data?.pop !== void 0 || data?.popKind !== void 0)
        return el;
    }
    return cell2;
  };
  const panelIn = (target) => {
    const cell2 = target?.closest?.(".c") ?? null;
    if (!cell2)
      return { cell: null, pop: null };
    const home = homeIn(target, cell2);
    if (open && openHome === home)
      return { cell: home, pop: open };
    const kept = built.get(home);
    if (kept)
      return { cell: home, pop: kept };
    const data = home.dataset;
    const markup = data?.pop ?? (data?.popKind ? buildPop(data.popKind, data.popKey ?? "") : void 0);
    if (!markup)
      return { cell: home, pop: null };
    const box = document.createElement("div");
    box.innerHTML = markup;
    home.removeAttribute("data-pop");
    const pop = box.firstElementChild;
    if (pop)
      built.set(home, pop);
    return { cell: home, pop };
  };
  let driven = false;
  let held = false;
  driver = {
    show: (cell2, html) => {
      close();
      driven = true;
      const box = document.createElement("div");
      box.innerHTML = html;
      const pop = box.firstElementChild;
      if (pop)
        place2(cell2, pop);
    },
    hide: () => {
      driven = false;
      close();
    },
    hold: (on) => {
      held = on;
      if (on)
        close();
    }
  };
  const clickOpen = (cell2) => !!cell2.closest(".grid") || cell2.classList.contains("teamdpr");
  document.addEventListener("mouseover", (e) => {
    if (driven || held || pinned)
      return;
    if (open && open.contains(e.target))
      return;
    const hovered2 = e.target?.closest?.(".c") ?? null;
    if (hovered2 && clickOpen(hovered2)) {
      if (openHome !== hovered2)
        close();
      return;
    }
    const { cell: cell2, pop } = panelIn(e.target);
    if (pop === open)
      return;
    close();
    if (pop)
      place2(cell2, pop);
  });
  document.addEventListener("mouseout", (e) => {
    if (driven || held || pinned)
      return;
    const to = e.relatedTarget;
    if (to && (root.contains(to) || open && open.contains(to)))
      return;
    close();
  });
  addEventListener("click", (e) => {
    if (held)
      return;
    if (driven) {
      driven = false;
      close();
      return;
    }
    if (pinned) {
      if (open?.contains(e.target))
        return;
      const onHome = !!openHome?.contains(e.target);
      close();
      if (onHome)
        return;
    }
    const { cell: cell2, pop } = panelIn(e.target);
    if (!cell2)
      return;
    const onCaret = !!e.target?.closest?.(".caret");
    if (clickOpen(cell2) && !onCaret && pop) {
      e.preventDefault();
      const same = openHome === cell2;
      close();
      if (!same) {
        place2(cell2, pop);
        pinned = true;
      }
      return;
    }
    if (cell2.querySelector(":scope > .caret"))
      close();
  });
  addEventListener("scroll", () => {
    if (!driven)
      close();
  }, true);
  addEventListener("resize", () => {
    if (!driven)
      close();
  });
}
var TEAM_ROW = "Team Total";
function sliceColor(base, i, n) {
  const [h, sat, l] = toHsl(base);
  const lift = i === 0 ? 0 : i % 2 ? 8 : -8;
  return `hsl(${((h + i * 360 / n) % 360).toFixed(1)} ${sat.toFixed(1)}% ${Math.min(92, Math.max(22, l + lift)).toFixed(1)}%)`;
}
function toHsl(hex) {
  const word = parseInt(hex.slice(1), 16);
  const r = (word >> 16 & 255) / 255, g = (word >> 8 & 255) / 255, b = (word & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), spread = max - min;
  const l = (max + min) / 2;
  if (!spread)
    return [0, 0, l * 100];
  const h = max === r ? (g - b) / spread + (g < b ? 6 : 0) : max === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  return [h * 60, spread / (1 - Math.abs(2 * l - 1)) * 100, l * 100];
}
var typeLabel = (type, subtype) => [subtype, type].filter((t) => t !== null).map((t) => TAG_NAME[t]).join(" ") || "Untyped";
function distCell(lines, slot, section, hue) {
  const types = /* @__PURE__ */ new Map();
  const nodes = /* @__PURE__ */ new Map();
  let total = 0;
  let nodeless = 0;
  eachHit(lines, slot, (snap, avg) => {
    total += avg;
    const subtype = snap.action.lastBullet?.subtype ?? null;
    const type = snap.type === 32768 && subtype !== null ? null : snap.type;
    const key = (type ?? 0) | (subtype ?? 0);
    const slice = types.get(key);
    if (slice)
      slice.value += avg;
    else
      types.set(key, { label: typeLabel(type, subtype), value: avg, color: "" });
    const node = snap.action.node;
    if (node === null) {
      nodeless += avg;
      return;
    }
    const cur = nodes.get(node);
    if (cur)
      cur.value += avg;
    else
      nodes.set(node, { label: NODE_NAME[node], value: avg, color: "" });
  });
  const ranked = (by) => {
    const out = [...by.values()].filter((v) => v.value > 0).sort((a, b) => b.value - a.value);
    for (const [i, slice] of out.entries())
      slice.color = sliceColor(hue, i, out.length);
    return out;
  };
  const gap = nodeless > 0 ? [{ label: "None", value: nodeless, color: null }] : [];
  return { kind: "slices", slot, section, types: ranked(types), nodes: [...ranked(nodes), ...gap], total };
}
function pieSvg(slices, total) {
  const font = 20, glyph = font * 0.515, mono = font * 0.6;
  const rail = Math.ceil(Math.max(11 * glyph, 8 * mono));
  const r = 120, lead = 28, lh = Math.round(font * 1.06), pitch = lh + 4;
  const width = 2 * (rail + r + lead + 19);
  const height = Math.max(2 * r + 34, Math.round(width * 0.6));
  const cx = width / 2;
  const cy = height / 2;
  const f = (n) => n.toFixed(2);
  const pct = (s) => `(${fmt(s.value / total * 100, 1)}%)`;
  const wrapAt = 11;
  const linesOf = (label) => {
    const words = label.split(" ");
    if (label.length <= wrapAt || words.length < 2)
      return [label];
    let best = [label], widest = Infinity;
    for (let i = 1; i < words.length; i++) {
      const pair = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
      const longest = Math.max(...pair.map((t) => t.length));
      if (longest < widest) {
        widest = longest;
        best = pair;
      }
    }
    return best;
  };
  const angle = (turn2) => (1 / 8 - 0.25 - turn2) * Math.PI * 2;
  let turn = 0;
  const arcs = slices.map((s) => {
    const from = turn;
    const share = s.value / total;
    turn += share;
    const a = angle(from + share / 2);
    return { s, from, share, a, ox: Math.cos(a) * 7, oy: Math.sin(a) * 7, side: Math.cos(a) >= 0 ? 1 : -1, y: 0 };
  });
  const linesFor = (s) => [...linesOf(s.label), pct(s)];
  const boxH = (l) => linesFor(l.s).length * lh;
  const point = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  for (const side of [1, -1]) {
    const column = arcs.filter((l) => l.side === side).sort((a, b) => Math.sin(a.a) - Math.sin(b.a));
    let ceiling = 10;
    for (const l of column) {
      const half = boxH(l) / 2;
      l.y = Math.max(cy + (r + lead - 10) * Math.sin(l.a), ceiling + half);
      ceiling = l.y + half + (pitch - lh);
    }
    let floor = height - 10;
    for (const l of [...column].reverse()) {
      const half = boxH(l) / 2;
      l.y = Math.min(l.y, floor - half);
      floor = l.y - half - (pitch - lh);
    }
  }
  const wedge = ({ s, from, share }) => {
    if (s.color === null)
      return "";
    const paint2 = ` fill="${s.color}" stroke="${s.color}"`;
    if (share > 0.999)
      return `<circle class="wedge" cx="${cx}" cy="${f(cy)}" r="${r}"${paint2}/>`;
    const [x0, y0] = point(angle(from), r);
    const [x1, y1] = point(angle(from + share), r);
    return `<path class="wedge" d="M${cx},${f(cy)} L${f(x0)},${f(y0)} A${r},${r} 0 ${share > 0.5 ? 1 : 0},0 ${f(x1)},${f(y1)} Z"${paint2}/>`;
  };
  const leader = ({ s, a, side, y, ox, oy }) => {
    const [px2, py2] = point(a, r);
    const [bx, by] = point(a, r + lead - 14);
    const out = cx + side * (r + lead);
    const tail = `${f(out - side * 30)},${f(y)} ${f(out)},${f(y)}`;
    const curve = (dx, dy) => `M${f(px2 + dx)},${f(py2 + dy)} C${f(bx + dx)},${f(by + dy)} ${tail}`;
    return `<path class="leader" d="${curve(0, 0)}" style="--d-out:path('${curve(ox, oy)}')" fill="none" stroke="${s.color ?? "var(--faint)"}" stroke-width="2" stroke-linecap="round"/>`;
  };
  const groups = arcs.map((arc) => `<g class="slice" style="--ox:${f(arc.ox)}px;--oy:${f(arc.oy)}px">${wedge(arc)}${leader(arc)}</g>`).join("");
  const labels = arcs.map(({ s, side, y }) => {
    const at = cx + side * (r + lead);
    const x = f(at + side * 7);
    const lines = linesFor(s);
    const last = lines.length - 1;
    const top = y - last * lh / 2;
    return `<text text-anchor="${side > 0 ? "start" : "end"}" dominant-baseline="middle">` + lines.map((t, i) => `<tspan class="${i === last ? "pc" : "nm"}" x="${x}" y="${f(top + i * lh)}">${esc(t)}</tspan>`).join("") + `</text>`;
  }).join("");
  return `<svg class="pie" viewBox="0 0 ${width} ${f(height)}" font-size="${font}" role="img">${groups}${labels}</svg>`;
}
var pieFigure = (heading, slices, total) => `<figure class="piefig"><figcaption>${esc(heading)}</figcaption><div class="chartwrap">${pieSvg(slices, total)}</div></figure>`;
function teamCell(sections, section, slotHue) {
  const bars = [];
  const acts = [];
  const by = /* @__PURE__ */ new Map();
  let total = 0;
  sections.forEach((lines) => {
    eachHit(lines, null, (snap, avg) => {
      if (avg <= 0)
        return;
      total += avg;
      const color = slotHue.get(snap.slot) ?? TUNE_BREAK_ENEMY.color;
      let act = snap.action;
      while (act.cancelOf ?? act.formOf)
        act = act.cancelOf ?? act.formOf;
      const key = `${snap.slot} ${act.name}`;
      let at = by.get(key);
      if (at === void 0) {
        at = acts.push({ name: act.name, color, dmg: 0, casts: 0 }) - 1;
        by.set(key, at);
      }
      acts[at].dmg += avg;
      acts[at].casts++;
      bars.push({ dmg: avg, color, act: at });
    });
  });
  const roster = [...slotHue].map(([name, color]) => ({ name, color }));
  return { kind: "team", section, total, bars, roster, acts };
}
function barChart(bars) {
  const width = 480, height = 210, left = 2, right = 2, top = 10, foot = 12;
  const plotW = width - left - right, plotH = height - top - foot;
  const f = (n) => n.toFixed(2);
  const peak = Math.max(...bars.map((b) => b.dmg));
  const weights = bars.map((b) => 0.15 + Math.sqrt(b.dmg / peak));
  const unit2 = plotW / weights.reduce((a, w) => a + w, 0);
  let x = left;
  const rects = bars.map((b, i) => {
    const h = b.dmg / peak * plotH, slot = weights[i] * unit2;
    const rect2 = `<rect data-act="${b.act}" x="${f(x)}" y="${f(top + plotH - h)}" width="${f(Math.max(slot * 0.9, 0.6))}" height="${f(h)}" fill="${b.color}"/>`;
    x += slot;
    return rect2;
  }).join("");
  return `<svg class="bars" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"><line class="axis" vector-effect="non-scaling-stroke" x1="${left}" y1="${top + plotH}" x2="${width - right}" y2="${top + plotH}"/>` + rects + `</svg>`;
}
var barKey = (roster) => `<ul class="barkey" style="--keys:${roster.length}">${roster.map((c) => `<li><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</li>`).join("")}</ul>`;
function distBody(cell2) {
  if (!cell2 || cell2.total <= 0)
    return `<div class="pies"><p class="nodist">No damage in this section.</p></div>`;
  const section = cell2.section ? ` (${cell2.section})` : "";
  if (cell2.kind === "team") {
    shownChart = cell2;
    return `<div class="teampanes"><figure class="piefig"><figcaption>Damage Over Time${section}</figcaption><div class="chartwrap">${barChart(cell2.bars)}</div>${barKey(cell2.roster)}</figure></div>`;
  }
  return `<div class="pies">${pieFigure(`${cell2.slot} Damage Distribution${section}`, cell2.types, cell2.total)}${pieFigure(`${cell2.slot} Node Priority${section}`, cell2.nodes, cell2.total)}</div>`;
}
var shownChart = null;
var distCells = /* @__PURE__ */ new Map();
var distributionRow = (selected2) => `<div class="rtrow dist"><div class="c distbody">${distBody(distCells.get(selected2))}</div></div>`;
var barPop = null;
function showBarPop(act, total, x, y) {
  if (!barPop) {
    barPop = document.createElement("div");
    barPop.className = "barpop";
    document.body.append(barPop);
  }
  barPop.style.setProperty("--own", act.color);
  barPop.innerHTML = `<span class="nm">${esc(act.name)}${act.casts > 1 ? ` x${act.casts}` : ""}</span><span class="v">${fmt(act.dmg)}</span><span class="pct">${fmt(act.dmg / total * 100, 1)}%</span>`;
  barPop.hidden = false;
  const { width, height } = barPop.getBoundingClientRect();
  barPop.style.left = `${x - width < 0 ? x : x - width}px`;
  barPop.style.top = `${y - height}px`;
}
function wireBarHover(body) {
  let lit = -1;
  const light = (act) => {
    if (act === lit)
      return;
    lit = act;
    for (const r of body.querySelectorAll("svg.bars rect[data-act]"))
      r.classList.toggle("lit", Number(r.dataset.act) === act);
  };
  body.addEventListener("mousemove", (e) => {
    const svg = e.target.closest("svg.bars");
    const bars = svg ? [...svg.querySelectorAll("rect[data-act]")] : [];
    if (!svg || !shownChart || !bars.length) {
      light(-1);
      if (barPop)
        barPop.hidden = true;
      return;
    }
    const box = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
    const at = (e.clientX - box.left) / box.width * view.width;
    let i = 0;
    while (i + 1 < bars.length && bars[i + 1].x.baseVal.value <= at)
      i++;
    const act = Number(bars[i].dataset.act);
    light(act);
    showBarPop(shownChart.acts[act], shownChart.total, e.clientX, e.clientY);
  });
  body.addEventListener("mouseleave", () => {
    light(-1);
    if (barPop)
      barPop.hidden = true;
  });
}
function wireDistribution(root) {
  const table = root.querySelector(".rtable.dpr");
  const body = root.querySelector(".c.distbody");
  if (!table || !body)
    return;
  table.addEventListener("click", (e) => {
    const hit = e.target?.closest(".c[data-dist], .c[data-dist-row]");
    if (!hit)
      return;
    const key = hit.dataset.dist ?? `${hit.dataset.distRow}|${table.dataset.totalCol}`;
    const cell2 = table.querySelector(`.c[data-dist="${key}"]`);
    for (const c of table.querySelectorAll(".c[data-dist]"))
      c.classList.toggle("sel", c === cell2);
    body.innerHTML = distBody(distCells.get(key));
  });
  wireBarHover(body);
}

// dist/src/page/filterbar.js
var app = document.getElementById("app");
var searchText = "";
var searchAt = -1;
function focusSearch() {
  const search = document.querySelector("#optionSearch");
  if (!search)
    return;
  search.focus({ preventScroll: true });
  search.setSelectionRange(search.value.length, search.value.length);
}
function clearSearch() {
  searchText = "";
  searchAt = -1;
  const input = document.querySelector("#optionSearch");
  if (input)
    input.value = "";
  const box = document.getElementById("searchResults");
  if (box)
    box.innerHTML = "";
}
function searchCandidates() {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const add = (kind, value, rest = {}) => {
    if (value && !seen.has(`${kind}|${value}`)) {
      seen.add(`${kind}|${value}`);
      out.push({ kind, value, ...rest });
    }
  };
  for (const members of Object.values(TEAMS)) {
    for (const m of members) {
      add("resonator", m.name);
      if (axisOpen(m, filters, "weapons")) {
        for (const i of eligibleWeapons(m, filters)) {
          add("weapon", weaponBase(m.loadout.weapons[i]));
          if (axisUsed(m, filters, "refines"))
            for (const w of m.loadout.refinements[i])
              add("weapon", w.name);
        }
      }
      if (axisUsed(m, filters, "refines"))
        for (const i of eligibleWeapons(m, filters))
          for (const w of m.loadout.refinements[i])
            add("refine", `${m.name} R${w.refinement}`);
      if (axisOpen(m, filters, "echoes"))
        for (const e of m.loadout.echoLoadouts)
          add("echo", echoLabel(m.loadout, e));
      for (const tag of sequenceTagsOf(m, filters))
        if (tag)
          add("sequence", tag);
    }
  }
  for (const [name, mode] of resonatorFilters) {
    if (mode !== "include")
      continue;
    for (const axis of AXES) {
      if (axis === "refines" || filters[axis].includes(name) || !comparable(name, axis))
        continue;
      add("compare", `${name} ${AXIS_LABEL[axis]}`, { axis, resonator: name });
    }
    if (MATRIX_RESONATORS.has(name) && !filters.matrix.includes(name))
      add("matrix", `${name} Matrix`, { resonator: name });
  }
  return out;
}
function searchRank(value, text) {
  const name = value.toLowerCase();
  const at = name.indexOf(text);
  if (at !== -1)
    return [0, 0, at];
  let hit = 0, i = -1, from = -1, to = -1;
  for (const ch of text) {
    const found = name.indexOf(ch, i + 1);
    if (found < 0)
      continue;
    [i, to, hit] = [found, found, hit + 1];
    if (from < 0)
      from = found;
  }
  return hit < 2 ? null : [1, text.length - hit, to - from];
}
function searchHits() {
  const text = searchText.trim().toLowerCase();
  if (!text)
    return [];
  return searchCandidates().map((c) => ({ ...c, rank: searchRank(c.value, text) })).filter((c) => c.rank !== null).sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2] || a.value.localeCompare(b.value)).slice(0, 10);
}
function cycleSearch(step) {
  const n = searchHits().length;
  if (!n)
    return;
  searchAt = (searchAt + 1 + step + n + 1) % (n + 1) - 1;
  drawSearch();
  document.querySelector(".sresult.sel")?.scrollIntoView({ block: "nearest" });
}
var searchChoice = () => searchHits()[searchAt < 0 ? 0 : searchAt];
function drawSearch() {
  const box = document.getElementById("searchResults");
  if (box)
    box.innerHTML = searchResults();
}
function searchResults() {
  if (!searchText.trim())
    return "";
  const KIND_LABEL = {
    resonator: "Resonator",
    weapon: "Weapon",
    echo: "Echo",
    sequence: "Sequence",
    refine: "Refine",
    compare: "Compare",
    matrix: "Matrix"
  };
  const hits = searchHits();
  if (!hits.length)
    return `<div class="sresult none">no matches</div>`;
  return hits.map(({ kind, value, axis, resonator }, i) => {
    const hue = (kind === "resonator" ? RESONATOR_HUE.get(value) : kind === "compare" || kind === "matrix" ? RESONATOR_HUE.get(resonator ?? "") : kind === "sequence" ? RESONATOR_HUE.get(tagOwner(value)) : void 0) ?? TUNE_BREAK_ENEMY.color;
    return `<button type="button" class="sresult${i === searchAt ? " sel" : ""}" data-kind="${kind}" data-value="${esc(value)}"` + (axis ? ` data-axis="${axis}"` : "") + (resonator ? ` data-resonator="${esc(resonator)}"` : "") + ` style="--mem:${hue}" title="${kind === "compare" ? `Compare ${esc(resonator ?? "")}'s ${esc(AXIS_LABEL[axis].toLowerCase())}` : kind === "matrix" ? `Run ${esc(resonator ?? "")}'s Matrix in every team they field` : `Add ${esc(value)} to the filters`}. The chip it makes is where it comes back off."><span class="sact inc"><span class="sname">${esc(value)}<span class="skind">${KIND_LABEL[kind]}</span></span></span></button>`;
  }).join("");
}
var COST_HELP = [
  "s0r0 all - Limited resonators are S0 and use the best standard or 4* weapon available at R1. Rover and 4* resonators are S6.",
  "s0r1 mdps +r0 supports - Each team gets a single signature weapon at R1, on whichever of its main DPS gives the best DPR increase \u2014 never a support. Dual DPS teams still only get one signature weapon.",
  "s0r1 all - All limited resonators get their best signature weapon, while Rover and 4* supports may still use standard or 4* weapons.",
  "s2r1 / s3r1 / s6r1 mdps +r1 supports - One main DPS per team runs that many sequence nodes, whichever gives the best DPR increase \u2014 never a support. Everyone else stays S0 on their own signature at R1.",
  "s6r5 all - Every resonator is S6 with their best weapon at R5."
];
var MATRIX_HELP = "Enables matrix exclusive buffs for older characters, scaled down to a neutral environment. Lucy also activates 1 stack of her boss kill inherent.";
var README = [
  "All beta calculations are subject to change!",
  `<span class="readme-warn">DPR comparisons do not account for rotation time!</span>`,
  "If you find any bug or issue ping me on discord @rileyy._.",
  "Enemy lv100, 20% res, Resonator lv 90, Nodes lv10"
];
var openHelp = /* @__PURE__ */ new Set(["readme"]);
function comparisonFilters() {
  const costBox = () => {
    const open = openHelp.has("cost");
    const option = (value, label) => `<option value="${value}"${filters.cost === value ? " selected" : ""}>${label}</option>`;
    return `<div class="tcopt${open ? " open" : ""}"><div class="tcopt-head"><button type="button" class="tcopt-name" data-help="cost" aria-expanded="${open}">Team Cost<span class="arrow">\u203A</span></button><select id="cost" class="tcselect" aria-label="Team Cost" title="Team Cost">` + option("s0r0", "s0r0 all") + option("s0r1mdps", "s0r1 mdps +r0 supports") + option("s0r1", "s0r1 all") + option("s2r1mdps", "s2r1 mdps +r1 supports") + option("s3r1mdps", "s3r1 mdps +r1 supports") + option("s6r1mdps", "s6r1 mdps +r1 supports") + option("s6r5", "s6r5 all") + `</select></div><div class="tcopt-desc"${open ? "" : " hidden"}><ul>${COST_HELP.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div></div>`;
  };
  const note = (id, label, lines, extra = "") => {
    const open = openHelp.has(id);
    return `<div class="tcopt note${open ? " open" : ""}" data-note="${id}"><div class="tcopt-head"><button type="button" class="tcopt-name" data-help="${id}" aria-expanded="${open}">${esc(label)}<span class="arrow">\u203A</span></button></div><div class="tcopt-desc"${open ? "" : " hidden"}><ul>${lines.map((l) => `<li>${l}</li>`).join("")}${extra}</ul></div></div>`;
  };
  return `<div class="tcfilters">
    <div class="tcfilter-row note">
      ${note("readme", "README", README, `<li><button type="button" class="tutstart">How do I use this website? ${CLICK} here.</button></li>`)}
      ${costBox()}
      <div class="tcsearchrow">
        <div class="tcsearch">
          <input id="optionSearch" type="search" placeholder="Add resonator or comparison..."
            autocomplete="off" spellcheck="false" value="${esc(searchText)}">
          <div class="tcsearch-results" id="searchResults">${searchResults()}</div>
        </div>
        ${resonatorChips()}
      </div>
    </div>
  </div>`;
}
var AXIS_LABEL = {
  weapons: "Weapons",
  echoes: "Sonatas",
  mainstats: "Mainstats",
  substats: "Substat Investment",
  sequences: "Sequences",
  refines: "Weapon Refines"
};
var scopedLabel = (s) => s.on === "sequence" ? `${s.resonator} S${s.value}` : s.on === "refine" ? `${s.resonator} R${s.value}` : s.value;
function resonatorChips() {
  const inc = [], exc = [];
  const bucket = (mode) => mode === "include" ? inc : exc;
  const MODE_TITLE = { include: "these", exclude: "none of these" };
  for (const [name, mode] of resonatorFilters) {
    bucket(mode).push(`<button type="button" class="rchip" data-resonator="${esc(name)}" style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}" title="${esc(name)} \u2014 teams fielding ${MODE_TITLE[mode]}. ${CLICK} to remove.">${esc(name)}</button>`);
  }
  for (const [kind, map] of Object.entries(OPTION_FILTER_MAPS)) {
    for (const [name, mode] of map) {
      const hue = kind === "sequence" || kind === "refine" ? RESONATOR_HUE.get(tagOwner(name)) : void 0;
      bucket(mode).push(`<button type="button" class="rchip" data-kind="${kind}" data-value="${esc(name)}"` + (hue ? ` style="--mem:${hue}"` : "") + ` title="${esc(name)} \u2014 rows using ${MODE_TITLE[mode]}. ${CLICK} to remove.">${esc(name)}</button>`);
    }
  }
  for (const s of filters.scoped) {
    inc.push(`<button type="button" class="rchip" data-scoped="${esc(scopedKey(s))}" style="--mem:${RESONATOR_HUE.get(s.resonator) ?? TUNE_BREAK_ENEMY.color}" title="Comparing ${esc(scopedLabel(s))}'s ${AXIS_LABEL[s.axis].toLowerCase()}. ${CLICK} to remove.">${esc(scopedLabel(s))} ${AXIS_LABEL[s.axis]}</button>`);
  }
  for (const name of filters.matrix) {
    inc.push(`<button type="button" class="rchip" data-matrix="${esc(name)}" style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}" title="${esc(name)} runs their Matrix in every team. ${esc(MATRIX_HELP)} ${CLICK} to remove.">${esc(name)} Matrix</button>`);
  }
  for (const axis of AXES) {
    for (const name of filters[axis]) {
      inc.push(`<button type="button" class="rchip" data-axis="${axis}" data-resonator="${esc(name)}" style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}" title="Comparing ${esc(name)}'s ${AXIS_LABEL[axis].toLowerCase()}. ${CLICK} to remove.">${esc(name)} ${AXIS_LABEL[axis]}</button>`);
    }
  }
  const section = (label, chips2) => chips2.length ? `<div class="chipsec"><span class="chiplabel">${label}</span><div class="chiprow">${chips2.join("")}</div></div>` : "";
  const chips = section("Shown", inc) + section("Hidden", exc);
  return chips ? `<div class="tcchips">${chips}<button type="button" class="clearall"><span>Clear Filters</span></button></div>` : "";
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".tcopt-name");
  const id = btn?.dataset.help;
  if (!btn || !id)
    return;
  const box = btn.closest(".tcopt");
  const open = !openHelp.has(id);
  if (open)
    openHelp.add(id);
  else
    openHelp.delete(id);
  box.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", String(open));
  box.querySelector(".tcopt-desc").hidden = !open;
});
document.addEventListener("input", (e) => {
  const input = e.target;
  if (input.id !== "optionSearch")
    return;
  searchText = input.value;
  searchAt = -1;
  drawSearch();
});
document.addEventListener("focusin", (e) => {
  if (!e.target.closest?.(".tcsearch"))
    return;
  const box = document.getElementById("searchResults");
  if (box)
    box.hidden = false;
});
var pressing = false;
document.addEventListener("pointerdown", () => {
  pressing = true;
}, true);
document.addEventListener("pointerup", () => {
  pressing = false;
}, true);
document.addEventListener("click", (e) => {
  if (e.target.closest?.(".tcsearch"))
    return;
  const box = document.getElementById("searchResults");
  if (box)
    box.hidden = true;
}, true);
app.addEventListener("scroll", (e) => {
  if (!e.target.classList?.contains("tcside"))
    return;
  const box = document.getElementById("searchResults");
  if (box)
    box.hidden = true;
}, true);
document.addEventListener("focusout", (e) => {
  if (!e.target.closest?.(".tcsearch"))
    return;
  if (e.relatedTarget?.closest?.(".tcsearch"))
    return;
  if (pressing)
    return;
  const box = document.getElementById("searchResults");
  if (box)
    box.hidden = true;
});

// dist/src/page/table.js
var app2 = document.getElementById("app");
var topbar = document.getElementById("topbar");
var refresh = async () => {
};
var onRefresh = (fn) => {
  refresh = fn;
};
var lastPoint = [0, 0];
addEventListener("pointerdown", (e) => {
  lastPoint = [e.clientX, e.clientY];
}, true);
addEventListener("keydown", () => {
  const r = document.activeElement?.getBoundingClientRect();
  if (r && (r.width || r.height))
    lastPoint = [r.left, r.bottom];
}, true);
function rowCapWarning(total) {
  document.querySelector(".rowcap")?.remove();
  if (total === null)
    return;
  const pop = document.createElement("div");
  pop.className = "ctxmenu rowcap";
  pop.textContent = `That would open ${fmt(total)} rows, which is over the ${fmt(ROW_CAP)} cap. Try using less comparisons, removing a resonator, or hiding resonators.`;
  document.body.appendChild(pop);
  const [x, y] = lastPoint;
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(6, Math.min(x, innerWidth - r.width - 6))}px`;
  pop.style.top = `${Math.max(6, Math.min(y, innerHeight - r.height - 6))}px`;
  const close = () => {
    pop.remove();
    removeEventListener("click", close, true);
    removeEventListener("keydown", close, true);
    removeEventListener("scroll", close, true);
  };
  setTimeout(() => {
    addEventListener("click", close, true);
    addEventListener("keydown", close, true);
    addEventListener("scroll", close, true);
  });
}
function withRowCap(change) {
  const undo = change();
  const total = prospectiveRows();
  if (total > ROW_CAP) {
    undo();
    rowCapWarning(total);
    focusAfterDraw = void 0;
    return;
  }
  rowCapWarning(null);
  syncHash();
  void refresh();
}
function setMatrix(name) {
  withRowCap(() => {
    const before = [...filters.matrix];
    const at = filters.matrix.indexOf(name);
    if (at < 0)
      filters.matrix.push(name);
    else
      filters.matrix.splice(at, 1);
    return () => {
      filters.matrix = before;
    };
  });
}
function setFilter(map, name, mode) {
  withRowCap(() => {
    const was = map.get(name);
    if (was === mode)
      map.delete(name);
    else
      map.set(name, mode);
    return () => {
      if (was === void 0)
        map.delete(name);
      else
        map.set(name, was);
    };
  });
}
function setCompare(name, axis) {
  withRowCap(() => {
    const on = !filters[axis].includes(name);
    const paired = axis === "refines" && on ? ["weapons"] : axis === "weapons" && !on ? ["refines"] : [];
    const before = /* @__PURE__ */ new Map();
    for (const a of [axis, ...paired]) {
      before.set(a, [...filters[a]]);
      const at = filters[a].indexOf(name);
      if (on && at < 0)
        filters[a].push(name);
      if (!on && at >= 0)
        filters[a].splice(at, 1);
    }
    const kept = Object.values(OPTION_FILTER_MAPS).map((map) => [...map]);
    pruneGearFilters();
    return () => {
      for (const [a, list] of before)
        filters[a] = list;
      Object.values(OPTION_FILTER_MAPS).forEach((map, i) => {
        map.clear();
        for (const [n, mode] of kept[i])
          map.set(n, mode);
      });
    };
  });
}
function setScoped(s) {
  withRowCap(() => {
    const key = scopedKey(s);
    const at = filters.scoped.findIndex((x) => scopedKey(x) === key);
    if (at >= 0)
      filters.scoped.splice(at, 1);
    else
      filters.scoped.push(s);
    return () => {
      if (at >= 0)
        filters.scoped.splice(at, 0, s);
      else
        filters.scoped.pop();
    };
  });
}
var MENU_AXES = ["weapons", "sequences", "echoes", "mainstats"];
function scopedItems(resonator, on, value) {
  const ranks = () => Object.values(TEAMS).some((members) => members.some((m) => m.name === resonator && m.loadout.refinements.some((r) => r.length > 1 && weaponBase(r[0]) === value)));
  const axes = on === "echo" ? ["mainstats"] : on === "weapon" ? ["refines", "echoes", "mainstats"] : ["echoes", "mainstats"];
  const s = (axis) => ({ resonator, on, value, axis });
  const set = (axis) => filters.scoped.some((x) => scopedKey(x) === scopedKey(s(axis)));
  return axes.filter((axis) => axis === "refines" ? ranks() && (set(axis) || !filters.refines.includes(resonator)) : comparable(resonator, axis)).map((axis) => ({
    axis,
    label: `${set(axis) ? "Stop comparing" : "Compare"} ${scopedLabel(s(axis))} ${AXIS_LABEL[axis].toLowerCase()}`,
    run: () => setScoped(s(axis))
  }));
}
function showMenu(x, y, items) {
  document.querySelector(".ctxmenu")?.remove();
  const menu = document.createElement("div");
  menu.className = "ctxmenu";
  menu.innerHTML = items.map((it, i) => `<button type="button" class="ctxitem" data-i="${i}">${esc(it.label)}</button>`).join("");
  document.body.appendChild(menu);
  menu.style.left = `${Math.max(6, Math.min(x, innerWidth - menu.getBoundingClientRect().width - 6))}px`;
  menu.style.top = `${y}px`;
  const close = () => {
    menu.remove();
    removeEventListener("click", onOutside, true);
    removeEventListener("contextmenu", onOutside, true);
    removeEventListener("keydown", onKey, true);
    removeEventListener("scroll", close, true);
  };
  const onItem = (e) => {
    const item = e.target.closest(".ctxitem");
    if (!item || !menu.contains(item))
      return;
    e.stopPropagation();
    e.preventDefault();
    const it = items[Number(item.dataset.i)];
    const run = e.type === "contextmenu" ? it.alt : it.run;
    if (!run)
      return;
    close();
    run();
  };
  menu.addEventListener("click", onItem);
  menu.addEventListener("contextmenu", onItem);
  const onOutside = (e) => {
    if (!e.target.closest(".ctxmenu"))
      close();
  };
  const onKey = (e) => {
    if (e.key === "Escape")
      close();
  };
  menu.addEventListener("closemenu", close);
  setTimeout(() => {
    addEventListener("click", onOutside, true);
    addEventListener("contextmenu", onOutside, true);
    addEventListener("keydown", onKey, true);
    addEventListener("scroll", close, true);
  });
}
function memberLabel(m, combo) {
  return [m.mainDps ? loadoutName(m.loadout) : m.name, combo.matrix ? "(Matrix)" : "", `${seqToken(m, combo)}${rankToken(m, combo)}`].filter(Boolean).join(" ");
}
var seqToken = (m, combo) => combo.sequence > 0 || axisOpen(m, filters, "sequences") ? `S${combo.sequence}` : "";
var rankToken = (m, combo) => axisUsed(m, filters, "weapons") ? "" : compares(m, filters, "refines", combo) || combo.weapon.refinement > 1 || combo.weapon.tier === 0 ? `R${combo.weapon.refinement}` : "R0";
function optionCell(kind, value, color, lines = [value], resonator = "") {
  const style = `--mem:${color}`;
  if (!value)
    return `<div class="c option" style="${style}"></div>`;
  return `<div class="c option" data-kind="${kind}" data-value="${esc(value)}"${resonator ? ` data-resonator="${esc(resonator)}"` : ""} style="${style}">${lines.map(esc).join("<br>")}</div>`;
}
var hueShown = true;
var personalOpen = [false, false, false];
var cmpDrawn = /* @__PURE__ */ new Set();
var teamMode = "dpr";
var TEAM_HEAD = { dpr: "Team Avg DPR", dps: "Team DPS" };
var wholeDamage = (run) => run.sectionTotals.reduce((a, b) => a + b, 0);
var teamFigure = (run) => Math.floor(wholeDamage(run) / (teamMode === "dpr" ? Math.max(1, run.sectionTotals.length) : run.seconds));
var personalFigure = (run, name) => Math.floor(run.sectionBySlot.reduce((a, by) => a + (by.get(name) ?? 0), 0) / Math.max(1, run.sectionTotals.length));
var loopTime = (run) => `${(run.sectionSeconds[run.sectionSeconds.length - 1] ?? 0).toFixed(1)}s`;
var teamText = (run) => fmt(teamFigure(run)) + (teamMode === "dpr" ? loopTime(run) : "");
var teamHtml = (run) => fmt(teamFigure(run)) + (teamMode === "dpr" ? `<sub class="looptime">${loopTime(run)}</sub>` : "");
var pctTrunc = (ratio) => `${fmt(Math.trunc(ratio * 1e3) / 10, 1, true)}%`;
var tableView = null;
function comparisonTable(rows) {
  const seq = (run) => run.combo.reduce((n, c) => n + c.sequence, 0);
  const rank = (run) => run.combo.reduce((n, c) => n + c.weapon.refinement, 0);
  const LEVELS = [
    (c) => c.highSubs ? "h" : "",
    (_, p) => p[3],
    (_, p) => p[0],
    (_, p) => p[4],
    (_, p) => p[1]
  ];
  const keyed = rows.map((row) => {
    const run = results.get(row.key);
    const parts = run.combo.map((c) => c.key.split("."));
    const keys = [run.teamKey];
    for (const level of LEVELS)
      keys.push(`${keys[keys.length - 1]}|${run.combo.map((c, i) => level(c, parts[i])).join("-")}`);
    return { pair: [row.key, run], run, keys };
  });
  const groupBest = /* @__PURE__ */ new Map();
  for (const { run, keys } of keyed)
    for (const k of keys) {
      const held = groupBest.get(k);
      if (!held || teamFigure(run) > teamFigure(held))
        groupBest.set(k, run);
    }
  const sorted = keyed.sort((a, b) => {
    for (let i = 0; i < a.keys.length; i++) {
      const [ka, kb] = [a.keys[i], b.keys[i]];
      if (ka === kb)
        continue;
      const [ra, rb] = [groupBest.get(ka), groupBest.get(kb)];
      return teamFigure(rb) - teamFigure(ra) || seq(rb) - seq(ra) || rank(rb) - rank(ra) || (ka < kb ? -1 : 1);
    }
    return teamFigure(b.run) - teamFigure(a.run) || seq(b.run) - seq(a.run) || rank(b.run) - rank(a.run);
  }).map((k) => k.pair);
  const GEAR_AXES = ["weapons", "echoes", "mainstats", "substats"];
  const CMP_AXES = [...GEAR_AXES, "sequences", "refines"];
  const shows = (m, axis) => axisUsed(m, filters, axis);
  const showsRow = (m, axis, combo) => compares(m, filters, axis, combo);
  const AXIS_HEAD = { weapons: "Weapon", echoes: "Echo Set", mainstats: "Mainstats", substats: "Substats" };
  const gearKey = (c, axis) => {
    const [w, e, , seq2, ref, ...rest] = c.key.split(".");
    const anyRank = axis === "weapons" || axis === "refines";
    return [axis === "weapons" ? "*" : w, axis === "echoes" ? "*" : e, "*", axis === "sequences" ? "*" : seq2, anyRank ? "*" : ref, rest.includes("m"), axis === "substats" || axis === null ? "*" : rest.includes("h")].join("|");
  };
  const twinKey = (run, pos, axis) => `${run.teamKey}|${pos}|${axis}|${run.combo.map((c, k) => gearKey(c, k === pos ? axis : null)).join("-")}`;
  const openAt = { weapons: [false, false, false], echoes: [false, false, false], mainstats: [false, false, false], substats: [false, false, false], sequences: [false, false, false], refines: [false, false, false] };
  for (const row of rows) {
    row.members.forEach((m, pos) => {
      for (const axis of CMP_AXES)
        if (shows(m, axis))
          openAt[axis][pos] = true;
    });
  }
  const optionOf = (axis, m, c) => axis === "weapons" ? c.weapon.name : axis === "echoes" ? echoLabel(m.loadout, c.echo) : axis === "mainstats" ? c.mainstat.name : axis === "substats" ? subsLabel(c) : axis === "sequences" ? String(c.sequence) : String(c.weapon.refinement);
  const seenAt = /* @__PURE__ */ new Map();
  for (const row of rows) {
    row.members.forEach((m, pos) => {
      for (const axis of CMP_AXES) {
        if (!shows(m, axis))
          continue;
        const key = `${axis}|${pos}|${m.name}`;
        let seen = seenAt.get(key);
        if (!seen)
          seenAt.set(key, seen = /* @__PURE__ */ new Set());
        seen.add(optionOf(axis, m, row.combo[pos]));
      }
    });
  }
  const soloWeapon = [false, false, false];
  for (const axis of CMP_AXES) {
    openAt[axis].forEach((open, pos) => {
      if (!open)
        return;
      const choices = [...seenAt].some(([key, seen]) => key.startsWith(`${axis}|${pos}|`) && seen.size > 1);
      if (choices)
        return;
      if (axis === "weapons")
        soloWeapon[pos] = true;
      else
        openAt[axis][pos] = false;
    });
  }
  const cmpAt = (axis, i) => !openAt[axis][i] ? false : axis === "weapons" ? !soloWeapon[i] : axis === "refines" ? !cmpAt("weapons", i) : true;
  const onScreen = new Set(rows.map((r) => r.key));
  const teamsOnScreen = new Set(rows.map((r) => r.teamKey));
  const openAxes = CMP_AXES.filter((axis) => openAt[axis].some((_, pos) => cmpAt(axis, pos)));
  const offeredAt = /* @__PURE__ */ new Map();
  for (const row of rows) {
    row.members.forEach((m, pos) => {
      for (const axis of openAxes) {
        if (!cmpAt(axis, pos))
          continue;
        const key = `${axis}|${pos}|${row.teamKey}`;
        let seen = offeredAt.get(key);
        if (!seen)
          offeredAt.set(key, seen = /* @__PURE__ */ new Set());
        seen.add(optionOf(axis, m, row.combo[pos]));
      }
    });
  }
  const twins = /* @__PURE__ */ new Map();
  for (const [key, run] of results) {
    if (!openAxes.length || !teamsOnScreen.has(run.teamKey))
      continue;
    run.members.forEach((m, pos) => {
      for (const axis of openAxes) {
        if (!cmpAt(axis, pos))
          continue;
        const twin = twinKey(run, pos, axis);
        const list = twins.get(twin) ?? [];
        const offered = offeredAt.get(`${axis}|${pos}|${run.teamKey}`)?.has(optionOf(axis, m, run.combo[pos])) ?? false;
        list.push({ combo: run.combo[pos], dpr: personalFigure(run, m.name), shown: onScreen.has(key), offered });
        twins.set(twin, list);
      }
    });
  }
  const bestOf = (pool2, run, pos, axis) => {
    let base = -Infinity;
    for (const t of pool2) {
      if (axis === "weapons") {
        if (t.combo.weapon.tier === 0)
          continue;
        if (axisUsed(run.members[pos], filters, "refines") && t.combo.key.split(".")[4] !== "r0")
          continue;
      }
      if (axis === "refines" && t.combo.key.split(".")[4] !== "r0")
        continue;
      if (axis === "substats" && t.combo.highSubs)
        continue;
      if (axis === "sequences" && (t.combo.sequence !== sequenceLevels(run.members[pos], filters)[0] || !axisUsed(run.members[pos], filters, "refines") && t.combo.key.split(".")[4] !== "r0"))
        continue;
      if (t.dpr > base)
        base = t.dpr;
    }
    return base;
  };
  const gearRatio = (run, pos, axis) => {
    const dpr = personalFigure(run, run.members[pos].name);
    const all = twins.get(twinKey(run, pos, axis)) ?? [];
    const shown2 = all.filter((t) => t.shown);
    const offered = all.filter((t) => t.offered);
    for (const pool2 of [shown2, offered]) {
      const base = bestOf(pool2, run, pos, axis);
      if (base > 0)
        return dpr / base;
    }
    const left = shown2.length ? shown2 : offered;
    if (!left.length)
      return null;
    const low = Math.min(...left.map((t) => t.dpr));
    return low > 0 ? dpr / low : null;
  };
  const gearCompare = (run, pos, axis) => {
    const ratio = gearRatio(run, pos, axis);
    return ratio == null ? "" : pctTrunc(ratio);
  };
  for (let i = 0; i < personalOpen.length; i++)
    for (const axis of CMP_AXES) {
      const key = `${axis}|${i}`;
      if (!openAt[axis][i])
        cmpDrawn.delete(key);
      else if (!cmpDrawn.has(key)) {
        cmpDrawn.add(key);
        personalOpen[i] = true;
      }
    }
  const dprAt = (i) => !!personalOpen[i];
  const rowHtml = (key, run, rank2) => {
    const grand = teamFigure(run);
    const memberNames = run.members.map((m) => m.name).join("|");
    const memberCell = (m, combo, i) => {
      const seqTag = sequenceTag(m, combo);
      const refTag = axisUsed(m, filters, "refines") && !openAt.weapons[i] ? refineTag(m, combo) : null;
      const name = `<div class="c name res" data-resonator="${esc(m.name)}"` + (seqTag ? ` data-sequence="${esc(seqTag)}" data-seq-gate="${combo.sequence}"` : "") + (refTag ? ` data-refine="${esc(refTag)}" data-ref-gate="${combo.weapon.refinement}"` : "") + ` style="--mem:${m.color};color:${m.color}"><span class="res-label">${esc(memberLabel(m, combo))}</span></div>`;
      const dpr = dprAt(i) ? `<div class="c num slotdpr" style="--mem:${m.color}">${fmt(personalFigure(run, m.name))}</div>` : "";
      const seqCmp = cmpAt("sequences", i) ? `<div class="c num slotcompare" style="--mem:${m.color}">${axisOpen(m, filters, "sequences") ? gearCompare(run, i, "sequences") : ""}</div>` : "";
      const refCmp = cmpAt("refines", i) ? `<div class="c num slotcompare" style="--mem:${m.color}">${compares(m, filters, "refines", combo) ? gearCompare(run, i, "refines") : ""}</div>` : "";
      const gear = GEAR_AXES.map((axis) => {
        if (!openAt[axis][i])
          return "";
        const open = showsRow(m, axis, combo);
        const cell2 = axis === "weapons" ? optionCell("weapon", open ? combo.weapon.name : "", m.color, [combo.weapon.name], m.name) : axis === "echoes" ? optionCell("echo", open ? echoLabel(m.loadout, combo.echo) : "", m.color, open ? echoLines(m.loadout, combo.echo) : [], m.name) : `<div class="c option"${open ? ` data-stat="${axis}" data-resonator="${esc(m.name)}"` : ""} style="--mem:${m.color}">${open ? esc(axis === "mainstats" ? combo.mainstat.name : subsLabel(combo)) : ""}</div>`;
        return cell2 + (cmpAt(axis, i) ? `<div class="c num slotcompare" style="--mem:${m.color}">${open ? gearCompare(run, i, axis) : ""}</div>` : "");
      }).join("");
      return name + seqCmp + refCmp + gear + dpr;
    };
    const memberCells = run.members.map((m, i) => memberCell(m, run.combo[i], i)).join("");
    return `<div class="trow${rank2.pinned ? " isbaseline" : ""}" style="--hue:${rank2.hue}" data-team="${esc(key)}" data-team-key="${esc(run.teamKey)}" data-members="${esc(memberNames)}" data-total="${grand}">` + memberCells + `<div class="c num total teamdpr" title="${CLICK} to view the team's damage breakdown"${deferredPop("dpr", key)}>${teamHtml(run)}</div><div class="c num total baseline" data-team="${esc(key)}" title="${CLICK} to measure every team against this one">${rank2.pct}</div><div class="c gotodetail" data-team="${esc(key)}">view rotation<span class="arrow">\u203A</span></div></div>`;
  };
  const memberHead = (n, i) => `<div class="c slothead${dprAt(i) ? " open" : ""}" data-slot="${i}" title="${CLICK} to ${dprAt(i) ? "hide" : "show"} this slot's Personal DPR">Slot ${n}<span class="arrow">\u203A</span></div>` + (cmpAt("sequences", i) ? `<div class="c num">Compare</div>` : "") + (cmpAt("refines", i) ? `<div class="c num">Compare</div>` : "") + GEAR_AXES.map((axis) => openAt[axis][i] ? `<div class="c">${AXIS_HEAD[axis]}</div>${cmpAt(axis, i) ? `<div class="c num">Compare</div>` : ""}` : "").join("") + (dprAt(i) ? `<div class="c num">Personal</div>` : "");
  const head = `<div class="trow thead">` + memberHead(3, 0) + memberHead(2, 1) + memberHead(1, 2) + `<div class="c num dprhead" title="${CLICK} to switch between DPR and DPS">${TEAM_HEAD[teamMode]}</div><div class="c num huehead" title="${CLICK} to colour the column by rank">Compare</div><div class="c"></div></div>`;
  const posCols = (i) => `max-content${cmpAt("sequences", i) ? " max-content" : ""}${cmpAt("refines", i) ? " max-content" : ""}${GEAR_AXES.map((axis) => openAt[axis][i] ? ` max-content${cmpAt(axis, i) ? " max-content" : ""}` : "").join("")}${dprAt(i) ? " max-content" : ""}`;
  const gridStyle = `grid-template-columns:${posCols(0)} ${posCols(1)} ${posCols(2)} max-content max-content max-content`;
  const rowLines = (run) => Math.max(1, ...run.members.map((m, i) => openAt.echoes[i] && axisOpen(m, filters, "echoes") ? echoLines(m.loadout, run.combo[i].echo).length : 1));
  const lines = sorted.map(([, run]) => rowLines(run));
  const extra = [0];
  for (const n of lines)
    extra.push(extra[extra.length - 1] + n - 1);
  const ranks = rankAll(sorted);
  const widest = (a, b) => b.length > a.length ? b : a;
  const blank = () => ["", "", ""];
  const wide = {
    name: blank(),
    dpr: blank(),
    seqcmp: blank(),
    refcmp: blank(),
    total: "",
    pct: "",
    gear: { weapons: blank(), echoes: blank(), mainstats: blank(), substats: blank() },
    cmp: { weapons: blank(), echoes: blank(), mainstats: blank(), substats: blank() }
  };
  sorted.forEach(([, run], i) => {
    run.members.forEach((m, pos) => {
      const combo = run.combo[pos];
      wide.name[pos] = widest(wide.name[pos], memberLabel(m, combo));
      wide.dpr[pos] = widest(wide.dpr[pos], fmt(personalFigure(run, m.name)));
      if (axisOpen(m, filters, "sequences"))
        wide.seqcmp[pos] = widest(wide.seqcmp[pos], gearCompare(run, pos, "sequences"));
      if (compares(m, filters, "refines", combo))
        wide.refcmp[pos] = widest(wide.refcmp[pos], gearCompare(run, pos, "refines"));
      for (const axis of GEAR_AXES) {
        if (!showsRow(m, axis, combo))
          continue;
        const text = axis === "weapons" ? [combo.weapon.name] : axis === "echoes" ? echoLines(m.loadout, combo.echo) : axis === "mainstats" ? [combo.mainstat.name] : [subsLabel(combo)];
        for (const line of text)
          wide.gear[axis][pos] = widest(wide.gear[axis][pos], line);
        wide.cmp[axis][pos] = widest(wide.cmp[axis][pos], gearCompare(run, pos, axis));
      }
    });
    wide.total = widest(wide.total, teamText(run));
    wide.pct = widest(wide.pct, ranks[i].pct);
  });
  const ghostPos = (i) => `<div class="c name res"><span class="res-label">${esc(wide.name[i])}</span></div>` + (cmpAt("sequences", i) ? `<div class="c num slotcompare">${esc(wide.seqcmp[i])}</div>` : "") + (cmpAt("refines", i) ? `<div class="c num slotcompare">${esc(wide.refcmp[i])}</div>` : "") + GEAR_AXES.map((axis) => openAt[axis][i] ? `<div class="c option">${esc(wide.gear[axis][i])}</div>${cmpAt(axis, i) ? `<div class="c num slotcompare">${esc(wide.cmp[axis][i])}</div>` : ""}` : "").join("") + (dprAt(i) ? `<div class="c num slotdpr">${esc(wide.dpr[i])}</div>` : "");
  const ghost = () => `<div class="trow tghost" aria-hidden="true">` + ghostPos(0) + ghostPos(1) + ghostPos(2) + `<div class="c num total">${esc(widest(wide.total, TEAM_HEAD[teamMode]))}</div><div class="c num total baseline">${esc(wide.pct)}</div><div class="c gotodetail">view rotation<span class="arrow">\u203A</span></div></div>`;
  tableView = { sorted, ranks, head, ghost, rowHtml, lines, extra };
  return `<main><div class="tclayout"><aside class="tcside">${comparisonFilters()}</aside><div class="tcbody"><h2 class="summary-label" id="teamCount">${fmt(sorted.length)} teams<span class="hint">${CLICK} on a Resonator to filter and compare sequences, weapons, echoes</span></h2><div class="tcwrap"><div class="tgrid${hueShown ? " hued" : ""}" style="${gridStyle}">${head}${ghost()}</div></div></div></div></main>`;
}
var rowHeight = 30;
var lineHeight = 17;
var measured = false;
var OVERSCAN = 40;
var drawnFrom = -1;
var drawnTo = -1;
var baselineTeam = null;
var BEST_HUE = 0;
var BASELINE_HUE = 120;
var WORST_HUE = 280;
function setBaseline(team) {
  baselineTeam = baselineTeam === team ? null : team;
  if (tableView) {
    tableView.ranks = rankAll(tableView.sorted);
    drawWindow(true);
  }
}
function rankAll(sorted) {
  const totals = sorted.map(([, run]) => teamFigure(run));
  const pinned = baselineTeam == null ? -1 : sorted.findIndex(([key]) => key === baselineTeam);
  const base = pinned >= 0 ? totals[pinned] : Math.min(...totals);
  const maxRatio = Math.max(...totals.map((t) => base ? t / base : 1), 1);
  const minRatio = Math.min(...totals.map((t) => base ? t / base : 1), 1);
  return totals.map((t, i) => {
    const ratio = base ? t / base : 1;
    const away = ratio >= 1 ? maxRatio > 1 ? (ratio - 1) / (maxRatio - 1) : 0 : minRatio < 1 ? (1 - ratio) / (1 - minRatio) : 0;
    const hue = ratio >= 1 ? BASELINE_HUE - away * (BASELINE_HUE - BEST_HUE) : BASELINE_HUE + away * (WORST_HUE - BASELINE_HUE);
    return { hue, pct: pctTrunc(ratio), pinned: i === pinned };
  });
}
function drawWindow(force = false, scrollTop) {
  const view = tableView;
  const main = app2.querySelector("main");
  const grid = main?.querySelector(".tgrid");
  if (!view || !main || !grid)
    return;
  const n = view.sorted.length;
  const top = scrollTop ?? main.scrollTop;
  const headCell = grid.querySelector(".thead .c");
  const headH = headCell ? rect(headCell).height : 0;
  const rowsTop = rect(grid).top - rect(main).top + main.scrollTop + headH;
  const rowTop = (i) => i * rowHeight + view.extra[i] * lineHeight;
  const rowAt = (y) => {
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (rowTop(mid + 1) <= y)
        lo = mid + 1;
      else
        hi = mid;
    }
    return lo;
  };
  const seenFrom = Math.max(0, rowAt(top - rowsTop));
  const seenTo = Math.min(n, rowAt(top + main.clientHeight - rowsTop) + 1);
  const inside = seenFrom >= drawnFrom + (drawnFrom > 0 ? OVERSCAN / 2 : 0) && seenTo <= drawnTo - (drawnTo < n ? OVERSCAN / 2 : 0);
  if (!force && inside)
    return;
  const from = Math.max(0, seenFrom - OVERSCAN), to = Math.min(n, seenTo + OVERSCAN);
  const spacer = (a, b) => b > a ? `<div class="vspace" style="height:${rowTop(b) - rowTop(a)}px"></div>` : "";
  let body = "";
  for (let i = from; i < to; i++) {
    const [key, run] = view.sorted[i];
    body += view.rowHtml(key, run, view.ranks[i]);
  }
  grid.innerHTML = view.head + view.ghost() + spacer(0, from) + body + spacer(to, n);
  drawnFrom = from;
  drawnTo = to;
  if (!measured && to - from >= 2) {
    measured = true;
    const cells = [...grid.querySelectorAll(".trow:not(.thead) > .c.teamdpr")];
    const heights = cells.slice(0, -1).map((c, j) => [rect(cells[j + 1]).top - rect(c).top, view.lines[from + j]]);
    const single = heights.find(([, k]) => k === 1), stacked = heights.find(([, k]) => k > 1);
    const base = single ? single[0] : stacked ? stacked[0] - lineHeight * (stacked[1] - 1) : rowHeight;
    const perLine = stacked ? (stacked[0] - base) / (stacked[1] - 1) : lineHeight;
    if (Math.abs(base - rowHeight) > 0.25 || Math.abs(perLine - lineHeight) > 0.25) {
      rowHeight = base;
      lineHeight = perLine;
      drawWindow(true, scrollTop);
    }
  }
}
var sideFit = new ResizeObserver((entries) => {
  for (const e of entries) {
    const el = e.target;
    el.style.marginBottom = el.closest(".tclayout")?.classList.contains("stack") ? "" : `-${el.offsetHeight}px`;
  }
});
function fitSide() {
  const layout = app2.querySelector(".tclayout");
  const side = app2.querySelector(".tcside");
  const head = app2.querySelector(".tgrid .trow.thead");
  const first = head?.firstElementChild, last = head?.lastElementChild;
  const main = app2.querySelector("main");
  if (!layout || !side || !first || !last || !main)
    return;
  layout.classList.remove("stack");
  main.classList.remove("stack");
  const table = rect(last).right - rect(first).left;
  let room = layout.clientWidth;
  const beside = room - table - (parseFloat(getComputedStyle(layout).columnGap) || 0);
  const stacked = !(getComputedStyle(layout).flexDirection === "row" && beside >= 370);
  if (!stacked)
    room = beside;
  else {
    layout.classList.add("stack");
    main.classList.add("stack");
    const cs = getComputedStyle(main);
    room = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    side.style.width = `${Math.min(room, table)}px`;
    side.style.marginInline = table < room ? "auto" : "0";
  }
  side.style.maxHeight = stacked ? "" : `${main.clientHeight}px`;
  if (!stacked) {
    side.style.width = "";
    side.style.marginInline = "";
  }
  side.style.marginBottom = stacked ? "" : `-${side.offsetHeight}px`;
  const label = app2.querySelector(".tcbody > .summary-label");
  if (label)
    main.style.setProperty("--headtop", `${label.offsetHeight}px`);
  sideFit.disconnect();
  sideFit.observe(side);
}
function rowElementAt(i) {
  const sorted = tableView?.sorted;
  if (!sorted?.length)
    return null;
  const key = sorted[Math.min(i, sorted.length - 1)][0];
  return [...app2.querySelectorAll(".tgrid .trow[data-team]")].find((el) => el.dataset.team === key) ?? null;
}
var tableScrollTop = 0;
var rememberTableScroll = () => {
  if (app2.querySelector(".tgrid"))
    tableScrollTop = app2.querySelector("main")?.scrollTop ?? 0;
};
var openingFocus = !matchMedia("(pointer: coarse)").matches;
for (const type of ["pointerdown", "keydown", "wheel"]) {
  addEventListener(type, () => {
    openingFocus = false;
  }, { capture: true, once: true });
}
function renderComparison() {
  topbar.hidden = true;
  clearPops();
  const scrollTop = app2.querySelector(".tgrid") ? app2.querySelector("main")?.scrollTop ?? 0 : tableScrollTop;
  app2.innerHTML = comparisonTable(visibleRows);
  app2.className = "";
  measured = false;
  drawnFrom = drawnTo = -1;
  fitSide();
  drawWindow(true, scrollTop);
  const main = app2.querySelector("main");
  main.scrollTop = scrollTop;
  if (openingFocus)
    focusAfterDraw ??= null;
  const back = focusAfterDraw;
  focusAfterDraw = void 0;
  if (back !== void 0) {
    const chip = back === null ? void 0 : [...app2.querySelectorAll(".tcchips .rchip, .tcchips .clearall")].find((el) => chipSig(el) === back);
    if (chip)
      chip.focus({ preventScroll: true });
    else
      focusSearch();
  }
  let queued2 = false;
  main.addEventListener("scroll", () => {
    if (queued2)
      return;
    queued2 = true;
    requestAnimationFrame(() => {
      queued2 = false;
      drawWindow();
    });
  }, { passive: true });
}
addEventListener("resize", () => {
  fitSide();
  drawWindow(true);
});
document.addEventListener("click", (e) => {
  const el = e.target.closest(".c.baseline");
  if (el?.dataset.team)
    setBaseline(el.dataset.team);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".c.huehead"))
    return;
  hueShown = !hueShown;
  document.querySelector(".tgrid")?.classList.toggle("hued", hueShown);
});
document.addEventListener("click", (e) => {
  const slot = e.target.closest(".c.slothead")?.dataset.slot;
  if (slot === void 0)
    return;
  personalOpen[Number(slot)] = !personalOpen[Number(slot)];
  renderComparison();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".c.dprhead"))
    return;
  teamMode = teamMode === "dpr" ? "dps" : "dpr";
  renderComparison();
});
document.addEventListener("change", (e) => {
  const select = e.target;
  if (select.id !== "cost")
    return;
  withRowCap(() => {
    const was = filters.cost;
    filters.cost = select.value;
    return () => {
      filters.cost = was;
      select.value = was;
    };
  });
});
var openNameMenu = (el, x, y) => {
  const resonator = el.dataset.resonator ?? "";
  const compareItem = (axis) => ({
    label: `${filters[axis].includes(resonator) ? "Stop comparing" : "Compare"} ${resonator} ${AXIS_LABEL[axis].toLowerCase()}`,
    run: () => setCompare(resonator, axis)
  });
  const scopedBlock = (tag, on, gate, map) => tag ? [
    { label: `Show only ${tag} teams`, run: () => setFilter(map, tag, "include"), alt: () => setFilter(map, tag, "exclude") },
    { label: `Hide ${tag} teams`, run: () => setFilter(map, tag, "exclude") },
    ...scopedItems(resonator, on, gate).sort((a, b) => AXES.indexOf(a.axis) - AXES.indexOf(b.axis))
  ] : [];
  const items = [
    // nothing to offer once they are already the ones shown — the bubble is where that comes back off
    ...resonatorFilters.get(resonator) === "include" ? [] : [{
      label: `Show ${resonator} teams`,
      run: () => setFilter(resonatorFilters, resonator, "include"),
      alt: () => setFilter(resonatorFilters, resonator, "exclude")
    }],
    { label: `Hide ${resonator} teams`, run: () => setFilter(resonatorFilters, resonator, "exclude") },
    // every axis this resonator has more than one option on, the substat spread last of all —
    // it is the one that says how the whole build is invested rather than which pick it wears.
    // A kit with no chain nodes yet says so where its sequence compare would sit, and the line
    // does nothing when pressed.
    // refines are not among them: they belong to the Weapon column, and are opened from a weapon
    // cell once that column is up (`openOptionMenu`)
    ...MENU_AXES.flatMap((axis) => comparable(resonator, axis) ? [compareItem(axis)] : axis === "sequences" ? [{ label: "Sequences Not Implemented!", run: () => {
    } }] : []),
    ...comparable(resonator, "substats") ? [compareItem("substats")] : [],
    ...scopedBlock(el.dataset.sequence, "sequence", el.dataset.seqGate ?? "", sequenceFilters),
    ...scopedBlock(el.dataset.refine, "refine", el.dataset.refGate ?? "", refineFilters),
    // last of all, and only for a kit that has a Matrix at all
    ...MATRIX_RESONATORS.has(resonator) ? [{
      label: `${filters.matrix.includes(resonator) ? "Disable" : "Enable"} ${resonator} matrix buffs`,
      run: () => setMatrix(resonator)
    }] : []
  ];
  showMenu(x, y, items);
};
var openNameMenuAt = (e) => {
  const el = e.target.closest(".c.name.res");
  if (!el?.dataset.resonator)
    return;
  e.preventDefault();
  openNameMenu(el, e.clientX, e.clientY);
};
document.addEventListener("click", openNameMenuAt);
document.addEventListener("contextmenu", openNameMenuAt);
var optionPick = (e) => {
  const el = e.target.closest(".c.option");
  const kind = el?.dataset.kind;
  const value = el?.dataset.value;
  return kind && value ? [OPTION_FILTER_MAPS[kind], value] : void 0;
};
var openOptionMenu = (e) => {
  const pick = optionPick(e);
  if (!pick)
    return;
  e.preventDefault();
  const [x, y] = [e.clientX, e.clientY];
  const [map, key] = pick;
  const el = e.target.closest(".c.option");
  const kind = el.dataset.kind;
  const resonator = el.dataset.resonator ?? "";
  const base = kind === "weapon" ? key.replace(/ R\d$/, "") : key;
  const ranked = kind === "weapon" && (filters.refines.includes(resonator) || filters.scoped.some((s) => s.resonator === resonator && s.axis === "refines"));
  const axis = kind === "weapon" ? "weapons" : "echoes";
  const word = kind === "weapon" ? "weapons" : "sonatas";
  const items = [
    // the pick's own filters lead, so "Show only" is the top line whatever else the cell offers
    { label: `Show only ${base}`, run: () => setFilter(map, base, "include"), alt: () => setFilter(map, base, "exclude") },
    { label: `Hide ${base}`, run: () => setFilter(map, base, "exclude") },
    ...ranked ? [
      { label: `Show only ${key}`, run: () => setFilter(map, key, "include"), alt: () => setFilter(map, key, "exclude") },
      { label: `Hide ${key}`, run: () => setFilter(map, key, "exclude") }
    ] : [],
    ...resonator && kind === "weapon" ? scopedItems(resonator, "weapon", base) : [],
    ...resonator && ranked ? scopedItems(resonator, "weaponRank", key) : [],
    ...resonator && kind === "echo" ? scopedItems(resonator, "echo", key) : [],
    // ...and last, the compares that opened this column, offered back as a way to close it
    ...filters[axis].includes(resonator) ? [{ label: `Stop comparing ${word}`, run: () => setCompare(resonator, axis) }] : [],
    // the rank rides in this same cell, so this is where the whole rank axis is opened and closed
    ...kind === "weapon" && comparable(resonator, "refines") ? [{
      label: `${filters.refines.includes(resonator) ? "Stop comparing" : "Compare"} ${AXIS_LABEL.refines.toLowerCase()}`,
      run: () => setCompare(resonator, "refines")
    }] : [],
    ...filters.scoped.filter((s) => s.resonator === resonator && s.axis === axis).map((s) => ({ label: `Stop comparing ${scopedLabel(s)} ${word}`, run: () => setScoped(s) }))
  ];
  showMenu(x, y, items);
};
document.addEventListener("click", openOptionMenu);
document.addEventListener("contextmenu", openOptionMenu);
var openStatMenu = (e) => {
  const el = e.target.closest(".c.option[data-stat]");
  if (!el)
    return;
  e.preventDefault();
  const [x, y] = [e.clientX, e.clientY];
  const axis = el.dataset.stat;
  const resonator = el.dataset.resonator ?? "";
  const word = axis === "mainstats" ? "mainstats" : "substats";
  const items = [
    ...filters[axis].includes(resonator) ? [{ label: `Stop comparing ${word}`, run: () => setCompare(resonator, axis) }] : [],
    ...filters.scoped.filter((s) => s.resonator === resonator && s.axis === axis).map((s) => ({ label: `Stop comparing ${scopedLabel(s)} ${word}`, run: () => setScoped(s) })),
    ...axis === "substats" && comparable(resonator, "mainstats") ? [{
      label: `${filters.mainstats.includes(resonator) ? "Stop comparing" : "Compare"} ${resonator} mainstats`,
      run: () => setCompare(resonator, "mainstats")
    }] : []
  ];
  showMenu(x, y, items);
};
document.addEventListener("click", openStatMenu);
document.addEventListener("contextmenu", openStatMenu);
var applySearchHit = (hit) => {
  if (hit.kind === "compare") {
    if (hit.resonator && hit.axis)
      setCompare(hit.resonator, hit.axis);
    return;
  }
  if (hit.kind === "matrix") {
    if (hit.resonator)
      setMatrix(hit.resonator);
    return;
  }
  setFilter(hit.kind === "resonator" ? resonatorFilters : OPTION_FILTER_MAPS[hit.kind], hit.value, "include");
};
var searchPick = (e) => {
  const el = e.target.closest(".sresult");
  const kind = el?.dataset.kind;
  const value = el?.dataset.value;
  if (!kind || !value)
    return void 0;
  return { kind, value, axis: el.dataset.axis, resonator: el.dataset.resonator };
};
var takeSearchHit = (hit) => {
  const coarse2 = matchMedia("(pointer: coarse)").matches;
  clearSearch();
  if (!coarse2)
    focusAfterDraw = null;
  applySearchHit(hit);
  if (coarse2)
    document.querySelector("#optionSearch")?.blur();
  else
    focusSearch();
};
var addSearchHit = (e) => {
  const hit = searchPick(e);
  if (!hit)
    return;
  e.preventDefault();
  takeSearchHit(hit);
};
document.addEventListener("click", addSearchHit);
document.addEventListener("contextmenu", addSearchHit);
document.addEventListener("mousedown", (e) => {
  if (e.target.closest?.(".rchip"))
    e.preventDefault();
});
var removeChip = (e) => {
  const chip = e.target.closest(".rchip");
  if (!chip)
    return;
  e.preventDefault();
  const axis = chip.dataset.axis;
  if (axis) {
    setCompare(chip.dataset.resonator ?? "", axis);
    return;
  }
  const matrix = chip.dataset.matrix;
  if (matrix) {
    setMatrix(matrix);
    return;
  }
  const scoped = chip.dataset.scoped;
  if (scoped) {
    const s = filters.scoped.find((x) => scopedKey(x) === scoped);
    if (s)
      setScoped(s);
    return;
  }
  const name = chip.dataset.resonator;
  const kind = chip.dataset.kind;
  const map = name ? resonatorFilters : kind ? OPTION_FILTER_MAPS[kind] : void 0;
  const key = name ?? chip.dataset.value;
  const was = map && key ? map.get(key) : void 0;
  if (!map || !key || was === void 0)
    return;
  withRowCap(() => {
    map.delete(key);
    return () => map.set(key, was);
  });
};
document.addEventListener("click", removeChip);
document.addEventListener("contextmenu", removeChip);
document.addEventListener("click", (e) => {
  if (!e.target.closest(".clearall"))
    return;
  if (!matchMedia("(pointer: coarse)").matches)
    focusAfterDraw = null;
  withRowCap(() => {
    const maps = [resonatorFilters, ...Object.values(OPTION_FILTER_MAPS)];
    const kept = maps.map((map) => [...map]);
    const compares2 = AXES.map((axis) => [...filters[axis]]);
    const scoped = [...filters.scoped];
    const matrix = [...filters.matrix];
    for (const map of maps)
      map.clear();
    for (const axis of AXES)
      filters[axis] = [];
    filters.scoped = [];
    filters.matrix = [];
    return () => {
      maps.forEach((map, i) => {
        for (const [n, mode] of kept[i])
          map.set(n, mode);
      });
      AXES.forEach((axis, i) => {
        filters[axis] = compares2[i];
      });
      filters.scoped = scoped;
      filters.matrix = matrix;
    };
  });
});
var chipSig = (el) => el.classList.contains("clearall") ? "clearall" : [el.dataset.axis, el.dataset.scoped, el.dataset.matrix, el.dataset.kind, el.dataset.resonator, el.dataset.value].join("\0");
var focusAfterDraw;
var tabRing = () => {
  const search = document.querySelector("#optionSearch");
  return search ? [search, ...document.querySelectorAll(".tcchips .rchip, .tcchips .clearall")] : [];
};
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab")
    return;
  const el = e.target;
  if (el?.id === "optionSearch" && searchHits().length)
    return;
  const ring = tabRing();
  const at = el ? ring.indexOf(el) : -1;
  if (!ring.length || at < 0 && el !== document.body)
    return;
  e.preventDefault();
  ring[at < 0 ? e.shiftKey ? ring.length - 1 : 0 : (at + (e.shiftKey ? -1 : 1) + ring.length) % ring.length].focus();
});
document.addEventListener("keydown", (e) => {
  const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
  if (!step || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)
    return;
  const ring = tabRing();
  if (!ring.length)
    return;
  const el = e.target;
  const at = el ? ring.indexOf(el) : -1;
  if (at === 0) {
    const vertical = e.key === "ArrowUp" || e.key === "ArrowDown";
    if (vertical && searchHits().length) {
      e.preventDefault();
      cycleSearch(step);
      return;
    }
    if (!vertical && el.value)
      return;
  }
  if (at < 0 && (el?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName ?? "")))
    return;
  e.preventDefault();
  ring[at < 0 ? Math.min(1, ring.length - 1) : Math.min(Math.max(at + step, 0), ring.length - 1)].focus();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== "Backspace" || e.ctrlKey || e.metaKey || e.altKey)
    return;
  const chip = e.target.closest(".rchip");
  if (!chip)
    return;
  e.preventDefault();
  const ring = tabRing();
  const next = ring[ring.indexOf(chip) + 1];
  focusAfterDraw = next?.classList.contains("rchip") ? chipSig(next) : null;
  chip.click();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey)
    return;
  const el = e.target;
  if (el && (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(el.tagName) || el.isContentEditable))
    return;
  const search = document.querySelector("#optionSearch");
  if (!search)
    return;
  e.preventDefault();
  focusSearch();
});
document.addEventListener("keydown", (e) => {
  if (e.target.id !== "optionSearch")
    return;
  if (e.key === "Tab" && searchHits().length) {
    e.preventDefault();
    cycleSearch(e.shiftKey ? -1 : 1);
    return;
  }
  if (e.key !== "Enter")
    return;
  const hit = searchChoice();
  if (!hit)
    return;
  e.preventDefault();
  takeSearchHit(hit);
});

// dist/src/page/detail.js
var app3 = document.getElementById("app");
var topbar2 = document.getElementById("topbar");
var BUFF_UNDERLINE_COLUMNS = /* @__PURE__ */ new Set(["mv", "energy", "concerto", "offtune"]);
var RUNNING_COLUMNS = /* @__PURE__ */ new Set(["concerto", "energy", "offtune"]);
var isRunning = (key) => RUNNING_COLUMNS.has(key) || key.startsWith("gauge:");
var colWidth = (c) => `calc(var(--cw) * ${c.width} + var(--cpad))`;
function cell(col, { cls = [], html = "", pop = "", style = "", attr = "" } = {}) {
  const classes = ["c", col.align === "left" ? "" : "num", ...cls].filter(Boolean).join(" ");
  return `<span class="${classes}"${style ? ` style="${style}"` : ""}${attr}${pop}>${html}</span>`;
}
var TAG_KIND = {
  [ActionTag.InstaCancel]: "insta",
  [ActionTag.InstaDodge]: "insta",
  [ActionTag.InstaJump]: "insta",
  [ActionTag.InstaSwap]: "insta",
  [ActionTag.SwapCancel]: "swap",
  [ActionTag.MashCancel]: "easy",
  [ActionTag.HoldCancel]: "easy",
  [ActionTag.Field]: "field",
  [ActionTag.DodgeCancel]: "dash",
  [ActionTag.JumpCancel]: "jump",
  [ActionTag.Cancel]: "cancel",
  [ActionTag.HitCancel]: "hit",
  [ActionTag.DodgeOnHit]: "hit",
  [ActionTag.JumpOnHit]: "hit"
};
var TAG_NOTE = {
  [ActionTag.InstaCancel]: "After casting, input the next action instantly",
  [ActionTag.InstaDodge]: "After casting, dodge instantly",
  [ActionTag.InstaJump]: "After casting, jump instantly",
  [ActionTag.InstaSwap]: "After casting, swap instantly",
  [ActionTag.Cancel]: "After the final hit, input the next action",
  [ActionTag.DodgeCancel]: "After the final hit, dodge",
  [ActionTag.JumpCancel]: "After the final hit, jump",
  [ActionTag.SwapCancel]: "After the final hit, swap",
  [ActionTag.MashCancel]: "After casting, mash the next input to cancel on the final hit",
  [ActionTag.HoldCancel]: "After casting, hold the next input to cancel upon receiving forte",
  [ActionTag.HitCancel]: "After the first hit, input the next action",
  [ActionTag.DodgeOnHit]: "After the first hit, dodge",
  [ActionTag.JumpOnHit]: "After the first hit, jump"
};
function stepRow(columns, row, slotHue, gearByMember, { part = false, caret = true } = {}) {
  return columns.map((col) => {
    const v = row.raw[col.key];
    const sources = row.sources[col.key];
    let attr = "";
    if (isRunning(col.key)) {
      if ("line" in row && row.line.aggregate)
        return cell(col);
      const cast = ("line" in row ? row.line.snap : row.snap).action.cast;
      const spend = col.key === "offtune" ? cast === 8 : col.key === "concerto" && cast === 6;
      const before = Number(row.raw[`before:${col.key}`]) || 0;
      if (!spend)
        attr = ` data-val="${Number(v) || 0}" data-before="${before}"`;
      const fed = (sources ?? []).some((r) => r.section !== OFFTUNE_RATE && r.section !== ENERGY_RATE);
      if (!fed && Math.abs((Number(v) || 0) - before) < 1e-9)
        return cell(col, { attr });
    }
    const cls = [];
    if (col.key === "action")
      cls.push(part ? "name" : "action");
    if (col.key === "avg")
      cls.push("avg");
    if (col.key === "member")
      cls.push("member");
    if (BUFF_UNDERLINE_COLUMNS.has(col.key) && row.buffed.has(col.key))
      cls.push("buffed");
    if (col.key.startsWith("gauge:") && Number(row.raw[`clear:${col.key}`]))
      cls.push("buffed");
    if ((col.key === "concerto" || col.key === "energy") && Number(row.raw[`short:${col.key}`]))
      cls.push("underspent");
    if (col.key.startsWith("gauge:") && Number(row.raw[`short:${col.key}`]))
      cls.push("negative");
    const text = esc(fmt(v, digitsOf(row.raw, col), PAD_DIGITS_COLUMNS.has(col.key), GROUPED_COLUMNS.has(col.key))) + (col.percent && typeof v === "number" ? "%" : "") + gaugeSuffix(row.raw, col.key);
    let html = sources && text ? `<span class="has">${text}</span>` : text;
    if (col.key === "action" && caret && !part && "parts" in row && row.parts.length) {
      html = `${html}<span class="caret">\u25B8</span>`;
    }
    const tag = col.key === "action" ? String(row.raw["tag:action"] ?? "") : "";
    if (tag) {
      const kind = TAG_KIND[tag] ?? "cancel", note = TAG_NOTE[tag];
      const tagPop = note ? lazyPop(`<span class="pop note">${esc(note)}</span>`) : "";
      html = `<span class="ctag ctag-${kind}"${tagPop}>${esc(tag.toUpperCase())}</span>${html}`;
    }
    const suffix = col.key === "mv" && row.scaling !== null ? ` ${SCALING_NAME[row.scaling]}` : "";
    let pop = "";
    if (col.key === "action") {
      const group = "parts" in row && row.parts.length > 0;
      pop = group ? "" : infoPopover(row.info, slotHue);
    } else if (col.key === "time") {
      const snaps = "line" in row ? row.line.members?.length ? row.line.members : [row.line.snap] : [row.snap];
      pop = framesPopover(snaps);
    } else if (col.key === "member") {
      const snap = "line" in row ? row.line.snap : row.snap;
      const gear = gearByMember.get(snap.member) ?? [];
      pop = buffsPopover(snap.member, gear, snap.heldLocal, snap.heldGlobal, snap.heldEnemy, slotHue);
    } else if (text) {
      pop = popover(col, sources, row.raw[`moved:${col.key}`] ?? v, slotHue, suffix, String(row.raw[`empty:${col.key}`] ?? ""));
    }
    const mem = col.key === "member" ? rowHue("line" in row ? row.line.snap : row.snap, slotHue) : slotHue.get(String(v)) ?? FALLBACK_HUE;
    const style = col.key === "member" ? `--mem:${mem};color:${mem}` : col.key === "avg" ? `--mem:${slotHue.get(String(row.raw["member"] ?? "")) ?? FALLBACK_HUE}` : "";
    if (col.key === "avg" && typeof v === "number")
      attr = ` data-avg="${v}"`;
    if (col.key === "time") {
      const snaps = "line" in row ? row.line.members?.length ? row.line.members : [row.line.snap] : [row.snap];
      const frames = snaps.reduce((n, s) => n + (s.active ? s.frames : 0) + (s.swapFrames ?? 0), 0);
      attr = ` data-frames="${frames}"`;
    }
    return cell(col, { cls, html, pop, style, attr });
  }).join("");
}
var rowHue = (snap, slotHue) => snap.slot === TUNE_BREAK_ENEMY.name ? TUNE_BREAK_ENEMY.color : slotHue.get(snap.member) ?? FALLBACK_HUE;
function partRows(columns, parts, slotHue, gearByMember, fieldOf) {
  return parts.map((p) => {
    const hue = rowHue(p.snap, slotHue);
    const field = fieldOf.get(p.snap);
    const mark2 = field === void 0 ? "" : ` data-fh="${field}"`;
    return `<div class="r${p.short ? " short" : ""}" style="--m:${hue}"${mark2}>${stepRow(columns, p, slotHue, gearByMember, { part: true })}</div>`;
  }).join("");
}
function rotationTable(report, slotHue, gearByMember, starts) {
  const columns = report.columns;
  const cols = columns.map(colWidth).join(" ");
  const head = columns.map((c) => cell(c, { html: esc(c.label) })).join("");
  const fieldIds = /* @__PURE__ */ new Map();
  const fieldId = (key) => {
    const seen = fieldIds.get(key);
    if (seen !== void 0)
      return seen;
    fieldIds.set(key, fieldIds.size);
    return fieldIds.size - 1;
  };
  const fieldOf = /* @__PURE__ */ new Map();
  for (const row of report.rows) {
    const line = row.line;
    if (line.fieldKey === void 0 || line.aggregate)
      continue;
    const id = fieldId(line.fieldKey);
    for (const snap of hitsOf(line))
      fieldOf.set(snap, id);
  }
  const out = [];
  let spilling = false;
  const closeBlock = () => {
    if (spilling) {
      out.push("</div></div>");
      spilling = false;
    }
  };
  report.rows.forEach((row, i) => {
    const loop = starts.get(i);
    if (loop !== void 0) {
      closeBlock();
      out.push(`<div class="loopline"><span>loop ${loop}</span></div>`);
    }
    const snap = row.line.snap;
    const hue = rowHue(snap, slotHue);
    const style = ` style="--m:${hue}"`;
    const cells = stepRow(columns, row, slotHue, gearByMember);
    const shortCls = row.short ? " short" : "";
    const key = row.line.fieldKey;
    const mark2 = key === void 0 || row.line.aggregate ? "" : ` data-fh="${fieldId(key)}"`;
    if (row.line.aggregate) {
      closeBlock();
      const id2 = `fg${fieldId(key)}`;
      out.push(`<div class="step chain"${style}><input class="tgl" type="checkbox" id="${id2}"><label class="r${shortCls}" for="${id2}">${cells}</label></div>`);
      return;
    }
    if (row.line.spill && spilling) {
      if (row.parts.length) {
        const id2 = `x${i}`;
        out.push(`<div class="chain"${style}${mark2}><input class="tgl" type="checkbox" id="${id2}"><label class="r${shortCls}" for="${id2}">${cells}</label><div class="parts">${partRows(columns, row.parts, slotHue, gearByMember, fieldOf)}</div></div>`);
        return;
      }
      out.push(`<div class="r${shortCls}"${style}${mark2}>${stepRow(columns, row, slotHue, gearByMember, { caret: false })}</div>`);
      return;
    }
    closeBlock();
    if (!row.parts.length) {
      out.push(`<div class="step"${style}${mark2}><div class="r${shortCls}">${cells}</div></div>`);
      return;
    }
    const id = `x${i}`;
    out.push(`<div class="step chain"${style}${mark2}><input class="tgl" type="checkbox" id="${id}"><label class="r${shortCls}" for="${id}">${cells}</label><div class="parts">${partRows(columns, row.parts, slotHue, gearByMember, fieldOf)}</div><div class="spill">`);
    spilling = true;
  });
  closeBlock();
  const fieldRules = [...fieldIds.values()].map((n) => `.grid:has(#fg${n}:checked) .step[data-fh="${n}"]{display:block}.grid:has(#fg${n}:checked) .r[data-fh="${n}"]{display:grid}`).join("");
  const totalRow = columns.map((c) => cell(c)).join("");
  return `<div class="gridwrap">${fieldRules ? `<style>${fieldRules}</style>` : ""}<div class="grid" style="--cols:${cols}">
    <div class="r head">${head}</div>
    ${out.join("")}
    <div class="r totalrow">${totalRow}</div>
  </div></div>`;
}
function resetIndices(flat, from, to, member2) {
  const out = [];
  for (let i = from; i < to; i++) {
    const snap = flat[i].snap;
    if (snap.member === member2 && snap.action.resetEnergy)
      out.push(i);
  }
  return out;
}
function erRequirement(flat, resetIdx, member2, maxEnergy, constant) {
  if (!maxEnergy)
    return 0;
  const before = flat[resetIdx].snap.realEnergyBefore;
  if (before <= 0)
    return null;
  let buffed = 0;
  walk: for (let i = resetIdx - 1; i >= 0; i--) {
    const line = flat[i];
    if (line.aggregate)
      continue;
    const snaps = hitsOf(line);
    for (let k = snaps.length - 1; k >= 0; k--) {
      const s = snaps[k];
      if (s.member !== member2)
        continue;
      if (s.action.resetEnergy)
        break walk;
      if (s.endsLoop)
        continue;
      const gain = (s.action.energy + s.stat(
        26
        /* Stat.AddEnergy */
      ) + (s.castGain?.[0] ?? 0)) * (1 + s.stat(
        14
        /* Stat.EnergyRegenMult */
      ) / 100);
      buffed += gain * (s.stat(
        11
        /* Stat.Er */
      ) - constant);
    }
  }
  return (maxEnergy * 100 - buffed) / before;
}
function energyRequirements(run, lines) {
  const flat = lines.flat();
  const erOf = erRollsFor(run.teamKey, run.members, run.combo);
  const cells = /* @__PURE__ */ new Map();
  run.members.forEach((m, idx) => {
    const own = /* @__PURE__ */ new Map();
    cells.set(m.name, own);
    const maxEnergy = m.loadout.resonator.maxEnergy;
    const combo = run.combo[idx];
    const constantSources = menuStats(m.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs, erOf[idx])).filter(
      (e) => e.stat === 11
      /* Stat.Er */
    );
    const constant = constantSources.reduce((n, e) => n + e.value, 0);
    const casts = resetIndices(flat, 0, flat.length, m.name).slice(1);
    const asked = casts.map((i) => erRequirement(flat, i, m.name, maxEnergy, constant)).filter((v) => v != null);
    const bar = asked.length ? Math.max(...asked) : null;
    const name = m.loadout.resonator.name;
    const line = (what, need, held) => {
      const met = need <= held + ER_TOLERANCE;
      return { met, html: `<div>${what}: <span class="${met ? "need-met" : "need-miss"}">${fmt(need, 1, true)}%</span> (${met ? "Met" : "Not Met"})</div>` };
    };
    const tag = (need, met, lines2) => {
      const tip = lazyPop(`<span class="pop tip">${lines2.join("")}</span>`);
      return `<span class="erneed has"${tip}>> <span class="erreq ${met ? "er-met" : "er-under"}">${fmt(need, 1, true)}%</span></span>`;
    };
    const minEr = m.loadout.minEr;
    if (bar != null || minEr) {
      const lines2 = [];
      if (bar != null)
        lines2.push(line("Energy Regen requirement", bar, constant));
      if (minEr)
        lines2.push(line("Energy Regen requirement for kit", minEr, constant));
      const need = Math.max(bar ?? 0, minEr);
      own.set(statLabel(
        11
        /* Stat.Er */
      ), tag(need, need <= constant + ER_TOLERANCE, lines2.map((l) => l.html)));
    }
    const minCr = m.loadout.minCritRate;
    if (minCr) {
      const cr = menuStats(m.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs, erOf[idx])).reduce((n, e) => n + (e.stat === 9 ? e.value : 0), 0);
      const kit = line("Kit Crit Rate Requirement", minCr, cr);
      own.set(statLabel(
        9
        /* Stat.CritRate */
      ), tag(minCr, kit.met, [kit.html]));
    }
  });
  return cells;
}
function page(run) {
  const { report } = detailFor(run);
  const lines = run.rotationLines;
  const { members } = run;
  const slotHue = new Map([...members.map((m) => [m.name, m.color]), [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]]);
  const erRolls = erRollsFor(run.teamKey, run.members, run.combo);
  const gearByMember = new Map(members.map((m, i) => [m.name, equippedGear(m, run.combo[i], erRolls[i]).map(([, g]) => g)]));
  const starts = /* @__PURE__ */ new Map();
  lines.reduce((n, sec, k) => {
    if (k)
      starts.set(n, k);
    return n + sec.length;
  }, 0);
  return `<main>
  <div class="rtables">
    <div class="rtable-block">
      <h2 class="summary-label">Equipment</h2>
      ${loadoutTable(run, energyRequirements(run, lines))}
    </div>
    <div class="rstack">
      <div class="rtable-block">
        <h2 class="summary-label">Damage Contribution</h2>
        ${dprTable(run, lines)}
      </div>
    </div>
  </div>
  <div class="rotation-block">
    <h2 class="summary-label">Rotation</h2>
    ${rotationTable(report, slotHue, gearByMember, starts)}
  </div>
</main>`;
}
function renderDetail(key) {
  rememberTableScroll();
  topbar2.hidden = false;
  clearPops();
  const run = results.get(key);
  app3.innerHTML = page(run);
  app3.className = "";
  wireColumnDrag(app3, detailFor(run).report.columns);
  wireCellSelect(app3);
  wireDistribution(app3);
}
var COLUMN_ORDER_KEY = "wuwa.logColumns";
var savedOrder = () => {
  try {
    return JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY) ?? "[]");
  } catch {
    return [];
  }
};
function orderedKeys(columns) {
  const out = savedOrder().filter((k) => columns.some((c) => c.key === k));
  columns.forEach((c, i) => {
    if (out.includes(c.key))
      return;
    const prev = columns.slice(0, i).reverse().find((p) => out.includes(p.key));
    out.splice(prev ? out.indexOf(prev.key) + 1 : 0, 0, c.key);
  });
  return out;
}
var logColumns = [];
var logOrder = [];
var logStyle = null;
function applyColumnOrder(root) {
  const grid = root.querySelector(".gridwrap .grid");
  if (!grid || !logColumns.length)
    return;
  const at = new Map(logOrder.map((k, i) => [k, i]));
  const visual = [...logColumns].sort((a, b) => at.get(a.key) - at.get(b.key));
  grid.style.setProperty("--cols", visual.map(colWidth).join(" "));
  const rules = logColumns.map((c, i) => `.grid .r>.c:nth-child(${i + 1}){order:${at.get(c.key)}}`);
  if (!logStyle)
    logStyle = document.head.appendChild(document.createElement("style"));
  logStyle.textContent = rules.join("");
}
function offsetsOf(order, width) {
  const out = /* @__PURE__ */ new Map();
  let x = 0;
  for (const key of order) {
    out.set(key, x);
    x += width.get(key) ?? 0;
  }
  return out;
}
function columnBox(grid, left, width) {
  const box = grid.appendChild(document.createElement("div"));
  box.className = "colbox";
  box.style.left = `${left}px`;
  box.style.width = `${width}px`;
  return box;
}
var selected = null;
var selBox = null;
function trackBox(grid, key) {
  const cell2 = grid.querySelector(`:scope > .r.head > .c[data-col="${CSS.escape(key)}"]`);
  if (!cell2)
    return null;
  const g = rect(grid);
  const c = rect(cell2);
  return { left: c.left - g.left, width: c.width };
}
function paintSelection(root) {
  selBox?.remove();
  selBox = null;
  if (!selected)
    return;
  clearBlock();
  const grid = root.querySelector(".gridwrap .grid");
  const track = grid && trackBox(grid, selected);
  if (grid && track)
    selBox = columnBox(grid, track.left, track.width);
}
function cellBox(grid) {
  const box = grid.appendChild(document.createElement("div"));
  box.className = "cellbox";
  return box;
}
function doubled(row, held) {
  const chain = row.parentElement;
  const tgl = chain?.classList.contains("chain") ? chain.querySelector(":scope > .tgl") : null;
  if (!tgl?.checked)
    return false;
  const field = tgl.id.startsWith("fg") ? tgl.id.slice(2) : "";
  const opened = field ? chain.closest(".grid").querySelectorAll(`.r[data-fh="${field}"], [data-fh="${field}"] .r`) : chain.querySelectorAll(":scope > .parts .r");
  return [...opened].some((r) => held.has(r));
}
function blockPanel(sel) {
  let dmg = 0, dmgCells = 0;
  let frames = 0, timeCells = 0;
  let gained = 0, tuneCells = 0, tuneDigits = 2;
  let energy = 0, energyCells = 0, energyDigits = 2;
  const held = new Set(sel.rows.slice(sel.r0, sel.r1 + 1));
  const rows = blockCells(sel);
  for (let i = 0; i < rows.length; i++) {
    if (doubled(sel.rows[sel.r0 + i], held))
      continue;
    for (const c of rows[i]) {
      if (c.dataset.avg !== void 0) {
        dmg += Number(c.dataset.avg) || 0;
        dmgCells++;
        continue;
      }
      if (c.dataset.frames !== void 0) {
        frames += Number(c.dataset.frames) || 0;
        timeCells++;
        continue;
      }
      if (c.dataset.val === void 0)
        continue;
      const col = logColumns[[...c.parentElement.children].indexOf(c)];
      if (col.key === "energy") {
        energy += (Number(c.dataset.val) || 0) - (Number(c.dataset.before) || 0);
        energyDigits = col.digits ?? 2;
        energyCells++;
        continue;
      }
      if (col.key !== "offtune")
        continue;
      gained += (Number(c.dataset.val) || 0) - (Number(c.dataset.before) || 0);
      tuneDigits = col.digits ?? 2;
      tuneCells++;
    }
  }
  const lines = dmgCells > 1 ? [["Total Dmg", fmt(dmg, 0)]] : [];
  if (timeCells > 1)
    lines.push(["Total Time", `${(frames / 60).toFixed(2)}s`]);
  if (energyCells)
    lines.push(["Total Energy", fmt(energy, energyDigits, true, false)]);
  if (tuneCells)
    lines.push(["Total Offtune", fmt(gained, tuneDigits, true, false)]);
  if (!lines.length)
    return "";
  return `<span class="pop stat"><table>` + lines.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join("") + `</table></span>`;
}
var cellSel = null;
var cellSelBox = null;
var holding = false;
var px = 0;
var py = 0;
var pressScale = 1;
function clearBlock() {
  cellSel = null;
  cellSelBox?.remove();
  cellSelBox = null;
}
function rowSpan(sel, i, gridTop) {
  const seen = sel.span[i];
  if (seen)
    return seen;
  const r = rect(sel.rows[i]);
  const at = [r.top - gridTop, r.bottom - gridTop];
  sel.span[i] = at;
  return at;
}
function aimBlock(sel, row, col, gridTop) {
  sel.fr = row;
  sel.r0 = Math.min(sel.ar, row);
  sel.r1 = Math.max(sel.ar, row);
  sel.c0 = Math.min(sel.ac, col);
  sel.c1 = Math.max(sel.ac, col);
  const top = rowSpan(sel, sel.r0, gridTop)[0];
  const left = sel.cols[sel.c0].left;
  const box = cellSelBox ?? (cellSelBox = cellBox(sel.grid));
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${sel.cols[sel.c1].right - left}px`;
  box.style.height = `${rowSpan(sel, sel.r1, gridTop)[1] - top}px`;
}
function blockCells(sel) {
  const out = [];
  for (let r = sel.r0; r <= sel.r1; r++) {
    const cells = sel.rows[r].children;
    out.push(sel.cols.slice(sel.c0, sel.c1 + 1).map((c) => cells[c.nth]));
  }
  return out;
}
function trackBlock() {
  const sel = cellSel;
  if (!sel)
    return;
  const g = rect(sel.grid);
  const y = py - g.top;
  let row = Math.min(Math.max(sel.fr, 0), sel.rows.length - 1);
  while (row < sel.rows.length - 1 && y > rowSpan(sel, row, g.top)[1])
    row++;
  while (row > 0 && y < rowSpan(sel, row, g.top)[0])
    row--;
  const x = px - g.left;
  let col = 0;
  while (col < sel.cols.length - 1 && x >= sel.cols[col + 1].left)
    col++;
  aimBlock(sel, row, col, g.top);
  const html = sel.r0 === sel.r1 ? "" : blockPanel(sel);
  if (!html) {
    dropPanel();
    return;
  }
  drivePanel(sel.rows[row].children[sel.cols[col].nth], html);
}
var trackRaf = 0;
function queueTrack() {
  if (trackRaf)
    return;
  trackRaf = requestAnimationFrame(() => {
    trackRaf = 0;
    trackBlock();
  });
}
function flushTrack() {
  if (!trackRaf)
    return;
  cancelAnimationFrame(trackRaf);
  trackRaf = 0;
  trackBlock();
}
addEventListener("scroll", () => {
  if (holding)
    queueTrack();
}, true);
addEventListener("click", (e) => {
  const target = e.target;
  if (target?.closest?.(".gridwrap .grid .chain > label.r") && !target.closest(".c.action"))
    e.preventDefault();
}, true);
addEventListener("keydown", (e) => {
  if (!cellSel || e.key !== "c" || !(e.ctrlKey || e.metaKey) || e.altKey)
    return;
  const loose = getSelection();
  if (loose && !loose.isCollapsed)
    return;
  e.preventDefault();
  const text = blockCells(cellSel).map((row) => row.map((c) => (c.textContent ?? "").replace("\u25B8", "").trim()).join("	")).join("\n");
  navigator.clipboard?.writeText(text).catch(() => {
  });
});
function wireCellSelect(root) {
  clearBlock();
  holding = false;
  const grid = root.querySelector(".gridwrap .grid");
  if (!grid)
    return;
  let arming = null;
  const HELD_AT = 250, MOVED_AT = 3;
  const swallowClick = (keepDefault) => {
    const swallow = (e) => {
      if (!keepDefault)
        e.preventDefault();
      e.stopPropagation();
    };
    addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener("click", swallow, true), 0);
  };
  const end = () => {
    flushTrack();
    if (arming) {
      clearTimeout(arming.timer);
      arming = null;
      holdPanels(false);
      swallowClick(true);
      return;
    }
    if (!holding)
      return;
    holding = false;
    holdPanels(false);
    const sel = cellSel;
    if (sel.r0 === sel.r1 && sel.c0 === sel.c1) {
      dropPanel();
      return;
    }
    swallowClick(false);
  };
  grid.addEventListener("pointerdown", (e) => {
    const cell2 = e.target.closest(".r:not(.head) > .c");
    if (e.button !== 0 || holding || arming || !cell2)
      return;
    if (e.target.closest(".ctag"))
      return;
    const g = rect(grid);
    const cols = [...grid.querySelectorAll(":scope > .r.head > .c[data-col]")].map((h, nth) => {
      const r = rect(h);
      return { key: h.dataset.col, nth, left: r.left - g.left, right: r.right - g.left };
    }).sort((a, b) => a.left - b.left);
    const row = cell2.closest(".r");
    const rows = [...grid.querySelectorAll(".r")].filter((r) => !r.classList.contains("head") && r.offsetParent);
    const ar = rows.indexOf(row);
    const ac = cols.findIndex((c) => c.nth === [...row.children].indexOf(cell2));
    if (ar < 0 || ac < 0)
      return;
    e.preventDefault();
    cell2.setPointerCapture(e.pointerId);
    dropPanel();
    holdPanels(true);
    selected = null;
    selBox?.remove();
    selBox = null;
    pressScale = zoom();
    px = e.clientX / pressScale;
    py = e.clientY / pressScale;
    const begin = () => {
      arming = null;
      holding = true;
      cellSel = { grid, rows, span: [], cols, ar, ac, fr: ar, r0: ar, r1: ar, c0: ac, c1: ac };
      aimBlock(cellSel, ar, ac, rect(grid).top);
    };
    if (!cellSel) {
      begin();
      return;
    }
    clearBlock();
    arming = { begin, timer: setTimeout(begin, HELD_AT), x: px, y: py };
  });
  grid.addEventListener("pointermove", (e) => {
    if (!holding && !arming)
      return;
    px = e.clientX / pressScale;
    py = e.clientY / pressScale;
    if (arming) {
      if (Math.abs(px - arming.x) < MOVED_AT && Math.abs(py - arming.y) < MOVED_AT)
        return;
      clearTimeout(arming.timer);
      arming.begin();
    }
    queueTrack();
  });
  grid.addEventListener("pointerup", end);
  grid.addEventListener("pointercancel", end);
}
var dragStyle = null;
var liftRule = null;
var liftBox = null;
var slideRules = /* @__PURE__ */ new Map();
var slideNow = /* @__PURE__ */ new Map();
var slideTo = /* @__PURE__ */ new Map();
var slideRaf = 0;
function stepSlides() {
  slideRaf = 0;
  let moving = false;
  for (const [key, rule] of slideRules) {
    const to = slideTo.get(key) ?? 0;
    const at = slideNow.get(key) ?? 0;
    if (at === to)
      continue;
    const next = Math.abs(to - at) < 0.5 ? to : at + (to - at) * 0.3;
    slideNow.set(key, next);
    rule.style.transform = `translateX(${next}px)`;
    if (next !== to)
      moving = true;
  }
  if (moving)
    slideRaf = requestAnimationFrame(stepSlides);
}
function openDrag(grid, d) {
  const nth = (key) => logColumns.findIndex((c) => c.key === key) + 1;
  const others = d.order.filter((k) => k !== d.key);
  const rules = [
    `.grid .r>.c:nth-child(${d.nth}){transform:translateX(0px);transition:none;z-index:6;background-color:color-mix(in srgb, var(--m, var(--surface)) 4%, var(--surface))}`,
    `.grid .r>.c.member:nth-child(${d.nth}){background-color:color-mix(in srgb, var(--mem, var(--surface)) 10%, var(--surface))}`,
    `.grid .r.head>.c:nth-child(${d.nth}),.grid .r.totalrow>.c:nth-child(${d.nth}){background-color:var(--surface-3)}`
  ];
  const slideAt = rules.length;
  for (const key of others)
    rules.push(`.grid .r>.c:nth-child(${nth(key)}){transform:translateX(0px)}`);
  if (!dragStyle)
    dragStyle = document.head.appendChild(document.createElement("style"));
  dragStyle.textContent = rules.join("");
  const sheet = dragStyle.sheet;
  liftRule = sheet?.cssRules[0] ?? null;
  slideRules.clear();
  slideNow.clear();
  slideTo.clear();
  others.forEach((key, i) => {
    const rule = sheet?.cssRules[slideAt + i];
    if (rule)
      slideRules.set(key, rule);
  });
  clearBlock();
  const track = trackBox(grid, d.key);
  liftBox = columnBox(grid, track?.left ?? d.home, track?.width ?? d.width.get(d.key));
  liftBox.style.transition = "none";
  if (selBox && selected === d.key)
    selBox.style.display = "none";
}
function slideDrag(d) {
  const from = offsetsOf(d.order, d.width);
  const rest = d.order.filter((k) => k !== d.key);
  rest.splice(d.at, 0, d.key);
  const to = offsetsOf(rest, d.width);
  for (const key of slideRules.keys())
    slideTo.set(key, to.get(key) - from.get(key));
  if (!slideRaf)
    slideRaf = requestAnimationFrame(stepSlides);
  if (selBox && selected && selected !== d.key) {
    selBox.style.transform = `translateX(${to.get(selected) - from.get(selected)}px)`;
  }
}
function closeDrag() {
  if (slideRaf)
    cancelAnimationFrame(slideRaf);
  slideRaf = 0;
  dragStyle?.remove();
  dragStyle = null;
  liftRule = null;
  liftBox?.remove();
  liftBox = null;
  slideRules.clear();
}
function wireColumnDrag(root, columns) {
  logColumns = columns;
  logOrder = orderedKeys(columns);
  closeDrag();
  selected = null;
  selBox = null;
  applyColumnOrder(root);
  const head = root.querySelector(".gridwrap .grid > .r.head");
  if (!head)
    return;
  const cells = [...head.querySelectorAll(":scope > .c")];
  cells.forEach((el, i) => {
    el.dataset.col = columns[i].key;
  });
  let drag = null;
  let lifted = false;
  let settling = false;
  let moveX = 0;
  let moveRaf = 0;
  const LIFT_AT = 3;
  head.addEventListener("pointerdown", (e) => {
    const cell2 = e.target.closest(".c[data-col]");
    if (e.button !== 0 || drag || settling || !cell2)
      return;
    e.preventDefault();
    cell2.setPointerCapture(e.pointerId);
    const width = new Map(cells.map((c) => [c.dataset.col, rect(c).width]));
    const key = cell2.dataset.col;
    const offsets = offsetsOf(logOrder, width);
    const scale = zoom();
    drag = {
      key,
      nth: cells.indexOf(cell2) + 1,
      order: logOrder,
      width,
      home: offsets.get(key),
      span: [...width.values()].reduce((n, w) => n + w, 0),
      startX: e.clientX / scale,
      scale,
      at: logOrder.indexOf(key)
    };
    lifted = false;
  });
  const aimDrag = () => {
    moveRaf = 0;
    if (!drag)
      return;
    const w = drag.width.get(drag.key);
    const dx = Math.min(drag.span - w - drag.home, Math.max(-drag.home, moveX - drag.startX));
    const { width, key } = drag;
    const rest = drag.order.filter((k) => k !== key);
    const edge = drag.home + dx;
    let at = drag.at;
    let slot = rest.slice(0, at).reduce((n, k) => n + width.get(k), 0);
    for (; ; ) {
      const after = rest[at];
      if (after !== void 0 && edge - slot > width.get(after) / 2) {
        slot += width.get(after);
        at++;
        continue;
      }
      const before = rest[at - 1];
      if (before !== void 0 && slot - edge > width.get(before) / 2) {
        slot -= width.get(before);
        at--;
        continue;
      }
      break;
    }
    if (at !== drag.at) {
      drag.at = at;
      slideDrag(drag);
    }
    if (liftRule)
      liftRule.style.transform = `translateX(${dx}px)`;
    if (liftBox)
      liftBox.style.transform = `translateX(${dx}px)`;
  };
  head.addEventListener("pointermove", (e) => {
    if (!drag)
      return;
    moveX = e.clientX / drag.scale;
    if (!lifted) {
      if (Math.abs(moveX - drag.startX) < LIFT_AT)
        return;
      lifted = true;
      document.body.classList.add("coldrag");
      openDrag(head.parentElement, drag);
    }
    if (!moveRaf)
      moveRaf = requestAnimationFrame(aimDrag);
  });
  const drop = () => {
    if (!drag)
      return;
    if (moveRaf) {
      cancelAnimationFrame(moveRaf);
      aimDrag();
    }
    const d = drag;
    drag = null;
    document.body.classList.remove("coldrag");
    const next = d.order.filter((k) => k !== d.key);
    next.splice(d.at, 0, d.key);
    logOrder = next;
    try {
      localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(next));
    } catch {
    }
    const rest = offsetsOf(next, d.width).get(d.key) - offsetsOf(d.order, d.width).get(d.key);
    settling = true;
    if (liftRule) {
      liftRule.style.transition = "transform .16s ease";
      liftRule.style.transform = `translateX(${rest}px)`;
    }
    if (liftBox) {
      liftBox.style.transition = "";
      liftBox.style.transform = `translateX(${rest}px)`;
    }
    setTimeout(() => {
      settling = false;
      closeDrag();
      applyColumnOrder(root);
      paintSelection(root);
    }, 170);
  };
  head.addEventListener("pointerup", () => {
    if (!drag)
      return;
    if (lifted) {
      drop();
      return;
    }
    selected = selected === drag.key ? null : drag.key;
    drag = null;
    paintSelection(root);
  });
  head.addEventListener("pointercancel", () => {
    if (lifted)
      drop();
    else
      drag = null;
  });
}

// dist/src/page/tutorial.js
var DONE_KEY = "wuwa.tutorialDone";
var STAGE_KEY = "wuwa.tutorialStage";
var done = false;
function dismissed() {
  if (done)
    return true;
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}
var TEXT = [
  "Start Tutorial",
  "Switch between DPS and DPR mode",
  `Try ${CLICKING} on a resonator to show only their teams`,
  `${CLICK} that resonator again and compare their weapons`,
  "Search to add another resonator or comparison",
  `Try ${CLICKING} a filter bubble to remove it`,
  "Try viewing a team's rotation and loadout",
  "Hover over equipment to see its stats and buffs",
  `${CLICK} on a member's damage number to see their damage distribution and node leveling priority`,
  `${CLICK} on the team total for a loop to see its damage over time`,
  "Scroll down to read the rotation, buffs, and stats"
];
var DETAIL_STAGE = 7;
var HEAD = 14;
var shownNow = () => [...resonatorFilters].filter(([, mode]) => mode === "include").map(([name]) => name);
var comparedNow = () => [...filters.scoped.map(scopedKey), ...AXES.flatMap((axis) => filters[axis].map((name) => `${axis}|${name}`))];
var shownBefore2 = /* @__PURE__ */ new Set();
var comparedBefore = /* @__PURE__ */ new Set();
function baseline() {
  shownBefore2 = new Set(shownNow());
  comparedBefore = new Set(comparedNow());
}
function added(now, before) {
  for (const key of before)
    if (!now.includes(key))
      before.delete(key);
  return now.some((key) => !before.has(key));
}
var showing = () => added(shownNow(), shownBefore2);
var comparing = () => added(comparedNow(), comparedBefore);
var atBasePage = () => AXES.every((axis) => filters[axis].length === 0) && !filters.scoped.length && !filters.matrix.length && [resonatorFilters, weaponFilters, echoFilters, sequenceFilters, refineFilters].every((m) => m.size === 0);
var firstChip = () => document.querySelector(".tcchips .rchip");
function substatsCell() {
  const row = [...document.querySelectorAll(".rtable.loadout .rtrow")].find((r) => r.querySelector(".c.lbl")?.textContent === "Substats");
  const cells = [...row?.children ?? []].filter((c) => !c.classList.contains("lbl"));
  return cells[2] ?? cells[cells.length - 1] ?? null;
}
function totalCell() {
  const rows = [...document.querySelectorAll(".rtable.dpr .rtrow:not(.rthead):not(.total)")];
  return (rows[2] ?? rows[rows.length - 1])?.querySelector(".c.tot[data-dist]") ?? null;
}
var loopCell = () => document.querySelector(`.rtable.dpr .rtrow.total [data-dist$="|3"]`);
function actionRow(n) {
  const rows = [...document.querySelectorAll(".rotation-block .grid .r")].filter((r) => !r.classList.contains("head") && !r.classList.contains("totalrow") && !r.closest(".parts") && !r.closest(".spill"));
  const row = rows[n] ?? rows[rows.length - 1];
  return row?.querySelector(".c.action") ?? row ?? null;
}
function scrolledFar() {
  const main = document.querySelector("main");
  const log = document.querySelector(".rotation-block .gridwrap");
  if (!main || !log)
    return false;
  const mainR = rect(main);
  return rect(log).top <= mainR.top + mainR.height * 0.3;
}
function restoreStage() {
  try {
    const n = Number(localStorage.getItem(STAGE_KEY));
    return Number.isInteger(n) && n >= 0 && n < TEXT.length ? n : 0;
  } catch {
    return 0;
  }
}
function setStage(n) {
  stage = n;
  try {
    localStorage.setItem(STAGE_KEY, String(n));
  } catch {
  }
}
var stage = restoreStage();
var started = false;
var layer = null;
var overlay = document.getElementById("loading");
var sawDps = false;
function settle() {
  if (stage === 1 && teamMode === "dps")
    sawDps = true;
  else if (stage === 1 && sawDps) {
    setStage(2);
    baseline();
  }
  if (stage === 2 && showing())
    setStage(3);
  else if (stage === 3 && !showing())
    setStage(2);
  if (stage === 3 && comparing())
    setStage(4);
  if (stage === 5 && !firstChip())
    setStage(4);
}
function build() {
  const el = document.createElement("div");
  el.className = "tut";
  el.innerHTML = `<svg class="tut-arrow" aria-hidden="true"><defs><marker id="tutHead" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="12" refX="0" refY="6" orient="auto"><path d="M0,0 L14,6 L0,12 Z"></path></marker></defs><path class="tut-path" marker-end="url(#tutHead)" d=""></path></svg><div class="tut-box" role="dialog" aria-label="Tutorial"><p></p><button type="button" class="tut-begin">${TEXT[0]}<span class="arrow">\u203A</span></button><div class="tut-buttons"><button type="button" class="tut-skip">Skip Tutorial</button></div></div>`;
  el.querySelector(".tut-begin").addEventListener("click", () => {
    sawDps = false;
    setStage(1);
    place();
  });
  el.querySelector(".tut-skip").addEventListener("click", () => {
    done = true;
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
    }
    hideTutorial();
  });
  return el;
}
function mark(anchor) {
  for (const el of document.querySelectorAll(".tut-target"))
    el.classList.remove("tut-target");
  anchor?.classList.add("tut-target");
}
function placeDetail(box, path, mainR) {
  const width = Math.max(240, Math.min(330, mainR.width - 24));
  box.style.width = `${width}px`;
  box.style.left = `${mainR.left + (mainR.width - width) / 2}px`;
  box.style.top = `8px`;
  const anchor = stage === DETAIL_STAGE ? substatsCell() : stage === DETAIL_STAGE + 1 ? totalCell() : stage === DETAIL_STAGE + 2 ? loopCell() : actionRow(19);
  mark(anchor);
  const anchorR = anchor ? rect(anchor) : null;
  if (!anchorR) {
    path.setAttribute("d", "");
    return;
  }
  const boxR = rect(box);
  const [bx, by] = [boxR.left + boxR.width / 2, boxR.bottom];
  const side = anchorR.left > mainR.right - 16 ? 1 : anchorR.right < mainR.left + 16 ? -1 : 0;
  if (side) {
    const tx2 = side > 0 ? mainR.right - 4 : mainR.left + 4;
    const ty2 = Math.min(Math.max(anchorR.top + anchorR.height / 2, by + 40), mainR.bottom - 20);
    const end = tx2 - side * HEAD;
    path.setAttribute("d", `M ${bx} ${by} C ${bx} ${by + 60}, ${end - side * 60} ${ty2}, ${end} ${ty2}`);
    return;
  }
  if (stage === DETAIL_STAGE + 1 || stage === DETAIL_STAGE + 2) {
    const tx2 = anchorR.left - 4, ty2 = anchorR.top + anchorR.height / 2;
    path.setAttribute("d", `M ${bx} ${by} C ${bx} ${by + 60}, ${tx2 - HEAD - 60} ${ty2}, ${tx2 - HEAD} ${ty2}`);
    return;
  }
  const tx = anchorR.left + anchorR.width / 2;
  const ty = Math.min(anchorR.top - 4, mainR.bottom - 4);
  const bend = Math.max(12, Math.min(70, (ty - HEAD - by) * 0.5));
  path.setAttribute("d", `M ${bx} ${by} C ${bx} ${by + bend}, ${tx} ${ty - HEAD - bend}, ${tx} ${ty - HEAD}`);
}
function place() {
  if (!layer || layer.hidden)
    return;
  settle();
  const box = layer.querySelector(".tut-box");
  const path = layer.querySelector(".tut-path");
  const main = document.querySelector("main");
  if (!main)
    return;
  const text = layer.querySelector("p");
  text.textContent = TEXT[stage];
  text.hidden = stage === 0;
  layer.querySelector(".tut-begin").hidden = stage !== 0;
  if (stage >= DETAIL_STAGE) {
    placeDetail(box, path, rect(main));
    return;
  }
  const layout = document.querySelector(".tclayout");
  const table = document.querySelector(".tcbody");
  const filterbar = document.querySelector(".tcfilters");
  const search = document.querySelector(".tcsearch");
  if (!layout || !table || !filterbar || !search)
    return;
  const stacked = layout.classList.contains("stack");
  const items = [...document.querySelector(".ctxmenu:not(.rowcap)")?.querySelectorAll(".ctxitem") ?? []];
  const compares2 = items.filter((item) => item.textContent?.startsWith("Compare"));
  const line = stage === 2 ? items[0] : compares2.find((item) => item.textContent?.includes("weapon")) ?? compares2[0];
  const headCell = document.querySelector(".tgrid .trow.thead .c");
  const below = headCell ? rect(headCell).bottom : rect(main).top;
  const already = new Set(shownNow());
  let first;
  let fresh;
  for (const row of document.querySelectorAll(".tgrid .trow[data-team]")) {
    const cells = [...row.querySelectorAll(".c.name.res")];
    const cell2 = cells[2] ?? cells[cells.length - 1];
    if (!cell2 || rect(cell2).top < below - 1)
      continue;
    first ??= cell2;
    const spare = already.has(cell2.dataset.resonator ?? "") ? cells.find((c) => !already.has(c.dataset.resonator ?? "")) : cell2;
    if (!spare)
      continue;
    fresh = spare;
    break;
  }
  const column = (stage === 2 ? fresh : void 0) ?? first;
  const chips = [...document.querySelectorAll(".tcchips .rchip")];
  const anchor = stage === 0 ? null : stage === 1 ? document.querySelector(".tgrid .c.dprhead") : stage === 4 ? search : stage === 5 ? stacked ? chips[chips.length - 1] : chips[0] : stage === 6 ? rowElementAt(0)?.querySelector(".gotodetail") : line ?? column;
  mark(anchor);
  const anchorR = anchor ? rect(anchor) : null;
  const mainR = rect(main), layoutR = rect(layout), tableR = rect(table), filterR = rect(filterbar);
  const aside = stage > 3 || stacked;
  const [from, to] = aside ? [filterR.left, filterR.right] : [layoutR.left, tableR.left];
  box.style.width = stage === 0 ? "max-content" : `${Math.max(240, Math.min(330, to - from - 40))}px`;
  const { width, height: boxH } = rect(box);
  const ideal = stage === 0 && !aside ? to - width - 20 : (from + to - width) / 2;
  const middle = Math.min(Math.max(ideal, mainR.left + 12), mainR.right - width - 12);
  box.style.left = `${stacked && stage === 6 ? mainR.left + 12 : middle}px`;
  const list = document.getElementById("searchResults");
  const listR = list?.childElementCount ? rect(list) : null;
  const under = stage === 4 && listR ? Math.max(filterR.bottom, listR.bottom) : filterR.bottom;
  const top = aside ? under + 16 : mainR.top + mainR.height * 0.2;
  const clear = stacked && stage < 4 && anchorR ? Math.min(top, anchorR.top - boxH - 40) : top;
  box.style.top = `${Math.min(Math.max(clear, mainR.top + 12), mainR.bottom - boxH - 12)}px`;
  if (!anchorR || anchorR.top > mainR.bottom || anchorR.bottom < mainR.top || anchorR.right < mainR.left || anchorR.left > mainR.right && stage !== 6) {
    path.setAttribute("d", "");
    return;
  }
  const boxR = rect(box);
  const by = boxR.top + boxR.height / 2;
  const bow = Math.min(100, boxR.left - mainR.left - 8);
  if (stage === 6 && !stacked) {
    const [tx2, ty2] = [anchorR.left + anchorR.width / 2, anchorR.bottom + 4];
    path.setAttribute("d", `M ${boxR.left} ${by} C ${boxR.left - bow} ${by}, ${tx2} ${ty2 + HEAD + 90}, ${tx2} ${ty2 + HEAD}`);
    return;
  }
  if (stage === 6 && stacked && anchorR.right <= mainR.right) {
    const [tx2, ty2] = [anchorR.left + anchorR.width / 2, anchorR.top - 4];
    path.setAttribute("d", `M ${boxR.right} ${by} C ${boxR.right + 40} ${by}, ${tx2} ${ty2 - HEAD - 40}, ${tx2} ${ty2 - HEAD}`);
    return;
  }
  if (stage === 6 && anchorR.right > mainR.right) {
    const [tx2, ty2] = [mainR.right - 14, anchorR.top + anchorR.height / 2];
    path.setAttribute("d", `M ${boxR.right} ${by} C ${boxR.right + 30} ${by}, ${tx2 - HEAD - 30} ${ty2}, ${tx2 - HEAD} ${ty2}`);
    return;
  }
  if (stage === 1 && !stacked) {
    const cx = boxR.left + boxR.width / 2;
    const [ax, ay] = [anchorR.left + anchorR.width / 2, anchorR.top - 4];
    const peak = Math.max(mainR.top + 8, ay - HEAD - 60);
    path.setAttribute("d", `M ${cx} ${boxR.top} C ${cx} ${peak}, ${ax} ${peak}, ${ax} ${ay - HEAD}`);
    return;
  }
  const [tx, ty] = [anchorR.left - 4, anchorR.top + anchorR.height / 2];
  if (stage === 4 || stage === 5) {
    const bx2 = boxR.left;
    if (!stacked) {
      path.setAttribute("d", tx - HEAD - bow >= mainR.left ? `M ${bx2} ${by} C ${bx2 - bow} ${by}, ${tx - HEAD - bow} ${ty}, ${tx - HEAD} ${ty}` : `M ${bx2} ${by} C ${bx2 - bow} ${by}, ${anchorR.left + anchorR.width / 2} ${ty + HEAD + 70}, ${anchorR.left + anchorR.width / 2} ${ty + HEAD}`);
      return;
    }
    const cx = boxR.left + boxR.width / 2;
    const [ax, ay] = [anchorR.left + anchorR.width / 2, anchorR.bottom + 4];
    const bend = Math.max(12, Math.min(70, (boxR.top - ay - HEAD) * 0.5));
    path.setAttribute("d", `M ${cx} ${boxR.top} C ${cx} ${boxR.top - bend}, ${ax} ${ay + HEAD + bend}, ${ax} ${ay + HEAD}`);
    return;
  }
  if (stacked && stage < 4) {
    const bx2 = boxR.left + boxR.width / 2;
    const [cx, cy] = [anchorR.left + anchorR.width / 2, anchorR.top - 4];
    const bend = Math.max(12, Math.min(70, (cy - HEAD - boxR.bottom) * 0.5));
    path.setAttribute("d", `M ${bx2} ${boxR.bottom} C ${bx2} ${boxR.bottom + bend}, ${cx} ${cy - HEAD - bend}, ${cx} ${cy - HEAD}`);
    return;
  }
  const bx = boxR.right, dx = tx - bx;
  if (dx >= 80) {
    path.setAttribute("d", `M ${bx} ${by} C ${bx + dx * 0.5} ${by}, ${tx - HEAD - dx * 0.5} ${ty}, ${tx - HEAD} ${ty}`);
    return;
  }
  if (ty > by) {
    path.setAttribute("d", `M ${bx} ${by} C ${bx + 70} ${by}, ${tx} ${ty - HEAD - 70}, ${tx} ${ty - HEAD}`);
    return;
  }
  const [ex, ey] = [tx - HEAD * 0.7, ty + HEAD * 0.7];
  path.setAttribute("d", `M ${bx} ${by} C ${bx + (ex - bx) * 0.9} ${by}, ${ex - 45} ${ey + 45}, ${ex} ${ey}`);
}
function maybeShowTutorial(force = false) {
  if (!overlay?.hidden)
    return;
  if (dismissed())
    return;
  if (!force && !started && stage === 0 && !atBasePage()) {
    hideTutorial();
    return;
  }
  const ready = stage >= DETAIL_STAGE ? document.querySelector(".rtable.loadout") : document.querySelector(".tgrid .trow[data-team]");
  if (!ready) {
    hideTutorial();
    return;
  }
  if (!layer) {
    layer = build();
    document.body.appendChild(layer);
    baseline();
  }
  layer.hidden = false;
  started = true;
  place();
}
function hideTutorial() {
  if (layer)
    layer.hidden = true;
  mark(null);
}
var typing;
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden || stage !== 4 || typing !== void 0)
    return;
  if (!e.target.closest?.("#optionSearch"))
    return;
  const input = document.querySelector("#optionSearch");
  const cells = [...rowElementAt(0)?.querySelectorAll(".c.name.res") ?? []];
  const top = (cells[2] ?? cells[cells.length - 1])?.dataset.resonator;
  const shown2 = [top, ...[...document.querySelectorAll(".c.name.res")].map((c) => c.dataset.resonator)];
  const onScreen = new Set(visibleRows.flatMap((row) => row.members.map((m) => m.name)));
  const unseen = Object.values(TEAMS).flat().map((m) => m.name).find((n) => !onScreen.has(n) && !resonatorFilters.has(n));
  const name = unseen ?? shown2.find((n) => n && !resonatorFilters.has(n)) ?? top;
  if (!input || input.value || !name)
    return;
  const text = name;
  let at = 0;
  const key = () => {
    input.value = text.slice(0, ++at);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    typing = at < text.length ? setTimeout(key, 50) : void 0;
  };
  typing = setTimeout(key, 50);
}, true);
function searchUsed() {
  if (!layer || layer.hidden || stage !== 4)
    return;
  setStage(5);
  place();
}
document.addEventListener("click", (e) => {
  if (e.target.closest?.(".sresult[data-value]"))
    searchUsed();
}, true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "optionSearch" && searchChoice())
    searchUsed();
}, true);
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden || stage !== 5)
    return;
  if (!e.target.closest?.(".tcchips .rchip, .tcchips .clearall"))
    return;
  setStage(6);
  place();
}, true);
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden || stage !== 6)
    return;
  if (!e.target.closest?.(".gotodetail"))
    return;
  setStage(DETAIL_STAGE);
}, true);
var hoverTimer;
var hovered = (e) => e.target.closest?.(".rtable.loadout .c.has");
document.addEventListener("pointerover", (e) => {
  if (!layer || layer.hidden || stage !== DETAIL_STAGE || !hovered(e))
    return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    setStage(DETAIL_STAGE + 1);
    place();
  }, 1e3);
}, true);
document.addEventListener("pointerout", (e) => {
  const from = hovered(e);
  if (!from || e.relatedTarget instanceof Element && e.relatedTarget.closest(".rtable.loadout .c.has") === from)
    return;
  clearTimeout(hoverTimer);
}, true);
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden)
    return;
  const cell2 = e.target.closest?.(".dist-cell, [data-dist-row]");
  if (!cell2)
    return;
  if (stage === DETAIL_STAGE + 1)
    setStage(DETAIL_STAGE + 2);
  else if (stage === DETAIL_STAGE + 2 && cell2.closest(".rtrow.total"))
    setStage(DETAIL_STAGE + 3);
  else
    return;
  place();
}, true);
function finish() {
  done = true;
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
  }
  hideTutorial();
}
document.addEventListener("click", (e) => {
  if (!e.target.closest?.(".tutstart"))
    return;
  try {
    localStorage.removeItem(DONE_KEY);
  } catch {
  }
  done = false;
  sawDps = false;
  setStage(1);
  baseline();
  maybeShowTutorial(true);
}, true);
if (overlay) {
  new MutationObserver(() => {
    if (overlay.hidden)
      maybeShowTutorial();
    else
      hideTutorial();
  }).observe(overlay, { attributes: true, attributeFilter: ["hidden"] });
}
new MutationObserver(() => {
  if (layer && !layer.hidden)
    place();
}).observe(document.body, { childList: true });
var queued = false;
addEventListener("scroll", () => {
  if (!layer || layer.hidden || queued)
    return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (stage === DETAIL_STAGE + 3 && scrolledFar()) {
      finish();
      return;
    }
    place();
    requestAnimationFrame(place);
  });
}, true);
var remeasure = () => {
  if (layer && !layer.hidden)
    requestAnimationFrame(place);
};
document.addEventListener("input", remeasure, true);
document.addEventListener("click", remeasure, true);
document.addEventListener("focusout", remeasure, true);
addEventListener("resize", () => {
  if (!layer || layer.hidden)
    return;
  place();
  requestAnimationFrame(place);
});

// dist/src/index.js
var app4 = document.getElementById("app");
var backLink = document.getElementById("backLink");
var overlay2 = document.getElementById("loading");
var overlayStatus = overlay2.querySelector(".status-text");
var overlayCount = overlay2.querySelector(".progress-count");
var overlayFill = overlay2.querySelector(".progress-fill");
var paint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
var overlayTimer;
function overlayPhase(text, now = false) {
  overlayStatus.textContent = text;
  if (!overlay2.hidden)
    return;
  if (now) {
    clearTimeout(overlayTimer);
    overlayTimer = void 0;
    overlay2.hidden = false;
    return;
  }
  if (overlayTimer === void 0)
    overlayTimer = setTimeout(() => {
      overlayTimer = void 0;
      overlay2.hidden = false;
    }, 100);
}
var OVERLAY_ROWS = 200;
async function overlayNow(text, rows = Infinity) {
  overlayPhase(text, rows >= OVERLAY_ROWS);
  await paint();
}
function overlayHide() {
  clearTimeout(overlayTimer);
  overlayTimer = void 0;
  overlay2.hidden = true;
}
function showError(err) {
  console.error(err);
  const box = overlay2.querySelector(".loading-error");
  if (!box)
    return;
  box.hidden = false;
  box.textContent += `${box.textContent ? "\n\n" : ""}${err instanceof Error ? err.stack ?? err.message : String(err)}`;
  clearTimeout(overlayTimer);
  overlayTimer = void 0;
  overlay2.hidden = false;
}
function barReset() {
  overlayFill.style.width = "0%";
  overlayCount.textContent = "";
}
function barProgress(done2, total) {
  overlayFill.style.width = `${total ? done2 / total * 100 : 100}%`;
  overlayCount.textContent = `${fmt(done2)} / ${fmt(total)}`;
}
var lastPaint = performance.now();
async function breathe() {
  if (performance.now() - lastPaint <= 50)
    return;
  await paint();
  lastPaint = performance.now();
}
async function runMissing(rows, stale) {
  const missing = rows.filter((row) => !results.has(row.key));
  if (!missing.length)
    return;
  overlayPhase("Running Rotations\u2026", true);
  const cached = rows.length - missing.length;
  barProgress(cached, rows.length);
  for (let i = 0; i < missing.length; i++) {
    if (stale())
      return;
    const row = missing[i];
    results.set(row.key, runTeam(row.teamKey, row.members, row.combo));
    barProgress(cached + i + 1, rows.length);
    await breathe();
  }
  await paint();
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
      settle2(w, job, solved);
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
    settle2(w, job, solveTeam(job.key, job.members, job.f, job.known));
  };
}
function settle2(w, job, solved) {
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
  let done2 = 0;
  const progress = () => {
    if (!stale())
      barProgress(done2, total);
  };
  progress();
  const counted = /* @__PURE__ */ new Map();
  const share = (members, part) => {
    const at = Math.min(rowsOf(members), Math.round(rowsOf(members) * part));
    const was = counted.get(members) ?? 0;
    if (at <= was)
      return;
    counted.set(members, at);
    done2 += at - was;
    progress();
  };
  workerPool();
  await solveAll(solvable, f, share);
  if (stale())
    return false;
  await paint();
  return true;
}
var generation = 0;
var tableRequested = false;
var route = () => {
  const key = routeTeam();
  if (key) {
    renderDetail(key);
    maybeShowTutorial();
    return;
  }
  if (!tableRequested) {
    void refresh2();
    return;
  }
  renderComparison();
  maybeShowTutorial();
};
async function refresh2() {
  tableRequested = true;
  const gen = ++generation;
  const stale = () => gen !== generation;
  cancelQueued();
  const f = structuredClone(filters);
  barReset();
  try {
    const inPlay = Object.entries(TEAMS).filter(([key, members]) => teamWanted(key, members));
    if (inPlay.some(([key, members]) => !bestPicks.has(bestKey(key, members, f))))
      workerPool();
    if (!visibleRows.length)
      route();
    await ensureBestPicks(inPlay, f, stale);
    if (stale())
      return;
    saveSolves();
    const rows = teamRows();
    const cached = rows.filter((row) => results.has(row.key));
    const missing = cached.length !== rows.length;
    if (!missing && cached.length) {
      await overlayNow("Rendering Table...", rows.length);
      if (stale())
        return;
      barProgress(rows.length, rows.length);
      setVisibleRows(cached);
      route();
    } else if (!missing) {
      setVisibleRows([]);
      route();
    }
    await runMissing(rows, stale);
    if (stale())
      return;
    if (missing) {
      await overlayNow("Rendering Table\u2026", rows.length);
      if (stale())
        return;
      setVisibleRows(rows);
      route();
    }
  } catch (err) {
    if (stale())
      return;
    if (discardRestoredSolves()) {
      console.warn("restored solves failed to load; solving the roster here instead", err);
      setVisibleRows([]);
      await refresh2();
      return;
    }
    showError(err);
    return;
  }
  overlayHide();
  maybeShowTutorial();
}
async function bootDetail() {
  const key = hashTeam();
  if (!key || results.has(key))
    return false;
  const row = rowFromKey(key);
  if (!row)
    return false;
  overlayPhase("Running Rotation\u2026", true);
  await paint();
  results.set(key, runTeam(row.teamKey, row.members, row.combo, true));
  renderDetail(key);
  overlayHide();
  return true;
}
async function boot() {
  onRefresh(refresh2);
  applyHash();
  await loadSolves();
  const detail = await bootDetail().catch((err) => {
    if (!discardRestoredSolves())
      throw err;
    console.warn("restored solves failed to load; solving the roster here instead", err);
    return false;
  });
  if (!detail)
    await refresh2();
  syncHash();
  const idle = globalThis.requestIdleCallback ?? ((fn) => setTimeout(fn, 500));
  idle(() => {
    workerPool();
  });
  addEventListener("hashchange", () => {
    if (applyHash()) {
      void refresh2();
      return;
    }
    const key = hashTeam();
    if (key && !results.has(key) && rowFromKey(key)) {
      void bootDetail();
      return;
    }
    route();
  });
  wireSourcePanels(app4);
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".gotodetail");
    if (el?.dataset.team) {
      syncHash(el.dataset.team, true);
      route();
    }
  });
  backLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (history.state?.detail) {
      history.back();
      return;
    }
    syncHash(null);
    route();
  });
}
boot().catch(showError);
