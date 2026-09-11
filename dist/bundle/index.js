import {
  ALL_TEAMS,
  AXES,
  BASE_RESISTANCE,
  CAST_NAME,
  DODGE,
  JUMP,
  MAINSTAT_ROWS,
  NODE_NAME,
  RESOURCE_NAME,
  SCALING_NAME,
  SWAP,
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
  defaultFilters,
  echoLabel,
  echoLines,
  effectiveRes,
  effectiveShred,
  eligibleWeapons,
  filterSignature,
  hasBuild,
  hitsOf,
  isPercent,
  isProgress,
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
  statLabel,
  substatRollBuffs,
  tagKind,
  teamAt,
  teamKey,
  topRank,
  weaponBase
} from "./chunk-TLZ7XPCH.js";

// dist/src/display.js
var formatters = /* @__PURE__ */ new Map();
var fmt = (v, digits = 0, pad = false, group = true) => {
  if (typeof v !== "number")
    return String(v ?? "");
  const key = `${digits}${pad ? "p" : ""}${group ? "g" : ""}`;
  let f = formatters.get(key);
  if (!f)
    formatters.set(key, f = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: pad ? digits : 0, useGrouping: group }));
  return f.format(v);
};
var FORTE_GAUGES = [
  3,
  4,
  5,
  6,
  7
  /* Resource.Forte5 */
];
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
  ...[action.element, action.type1, action.type2].filter((tag) => tag !== null).map((tag) => scopedStat(tag, stat))
]);
var special = (action) => action.scaling === 3 || action.scaling === 4 || action.scaling === 5;
var fixed = (action) => action.scaling === 5;
var FEEDS = {
  atk: (a) => keysFor(
    a,
    0,
    6,
    3
    /* Stat.FlatAtk */
  ),
  hp: (a) => keysFor(
    a,
    1,
    7,
    4
    /* Stat.FlatHp */
  ),
  def: (a) => keysFor(
    a,
    2,
    8,
    5
    /* Stat.FlatDef */
  ),
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
  ) : a.type2 === null ? [] : [scopedStat(
    a.type2,
    9
    /* Stat.CritRate */
  )],
  cd: (a) => fixed(a) ? [] : !special(a) ? keysFor(
    a,
    10
    /* Stat.CritDmg */
  ) : a.type2 === null ? [] : [scopedStat(
    a.type2,
    10
    /* Stat.CritDmg */
  )],
  er: (a) => keysFor(
    a,
    11
    /* Stat.Er */
  ),
  dmgBonus: (a) => special(a) ? [] : keysFor(
    a,
    17
    /* Stat.DmgBonus */
  ),
  amp: (a) => a.scaling === 4 || fixed(a) ? [] : a.scaling !== 3 ? keysFor(
    a,
    18
    /* Stat.Amp */
  ) : a.type2 === null ? [] : [scopedStat(
    a.type2,
    18
    /* Stat.Amp */
  )],
  dealt: (a) => a.scaling === 3 || fixed(a) ? [] : keysFor(
    a,
    19,
    20
    /* Stat.DamageTaken */
  ),
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
var actionInfo = (action, type, triggered, triggeredBy) => {
  const info = [];
  const push = (label, value) => {
    if (value)
      info.push({ label, value });
  };
  push("Node", action.node === null ? null : NODE_NAME[action.node]);
  push("Cast", action.cast === null ? null : CAST_NAME[action.cast]);
  push("Cast 2", action.cast2 === null ? null : CAST_NAME[action.cast2]);
  push("Attribute", action.element === null ? null : TAG_NAME[action.element]);
  push("Scaling", action.scaling === null ? null : SCALING_NAME[action.scaling]);
  push("Type", type === null ? null : TAG_NAME[type]);
  push("Type 2", action.type2 === null ? null : TAG_NAME[action.type2]);
  push("Cutscene", String(action.cutscene));
  push("Swap out", String(action.swapOut));
  push("Triggered", String(triggered));
  if (triggeredBy)
    info.push({ label: triggeredBy.name, value: "", source: triggeredBy.source });
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
function tracing(snapshot, stats, merge = true) {
  const wanted = new Set(stats);
  const by = /* @__PURE__ */ new Map();
  const rows = [];
  for (const e of snapshot.entries) {
    if (!wanted.has(e.stat))
      continue;
    const key = `${e.source} ${e.stat}`;
    const seen = merge ? by.get(key) : void 0;
    if (seen)
      seen.value += e.value;
    else {
      const [stat, tag] = splitStat(e.stat);
      const base = e.source === BASE_RESISTANCE.name;
      const row = {
        source: e.source ?? "",
        stat: e.stat,
        value: e.value,
        section: base ? "Base RES" : SECTION_OF[stat] ?? (tag === null ? null : statLabel(e.stat)),
        owner: e.owner ?? null
      };
      by.set(key, row);
      rows.push(row);
    }
  }
  return rows.sort((a, b) => tagRank(a.stat ?? 0) - tagRank(b.stat ?? 0));
}
var columnOf = (report, key) => report.columns.find((c) => c.key === key);
var gaugeSuffix = (raw, key) => {
  const cap = raw[`max:${key}`];
  return typeof cap === "number" ? `/${fmt(cap, 0, false, false)}` : "";
};
var RESOURCE_SCALE = { energy: 1, concerto: 1, offtune: 1e4 };
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
function rowValues(snap, { mv, avg }, members = []) {
  const dealsDamage = mv !== 0;
  const filler = snap.action === SWAP || snap.action === DODGE || snap.action === JUMP;
  const buffed = /* @__PURE__ */ new Set();
  const raw = {
    member: snap.member,
    atk: snap.atk,
    hp: snap.hp,
    def: snap.def,
    mv: dealsDamage ? mv : null,
    // what a dot/tune/fixed hit doesn't read is blank, matching `FEEDS`
    dmgBonus: filler || special(snap.action) ? null : snap.dmgBonus,
    amp: filler || fixed(snap.action) ? null : snap.action.scaling === 4 ? null : snap.action.scaling === 3 ? snap.type2Amp : snap.amp,
    cr: filler || fixed(snap.action) ? null : special(snap.action) ? snap.type2CritRate : snap.stat(
      9
      /* Stat.CritRate */
    ),
    cd: filler || fixed(snap.action) ? null : special(snap.action) ? snap.type2CritDmg : snap.stat(
      10
      /* Stat.CritDmg */
    ),
    // the column is the pair's combined lift, since Total Damage and Damage Taken multiply
    dealt: filler || snap.action.scaling === 3 || fixed(snap.action) ? null : ((1 + snap.stat(
      19
      /* Stat.TotalDmg */
    ) / 100) * (1 + snap.stat(
      20
      /* Stat.DamageTaken */
    ) / 100) - 1) * 100,
    effDef: filler || fixed(snap.action) ? null : effectiveShred(snap) * 100,
    effRes: filler || fixed(snap.action) ? null : effectiveRes(snap),
    er: snap.stat(
      11
      /* Stat.Er */
    ),
    energy: snap.energy / RESOURCE_SCALE.energy,
    concerto: snap.concerto / RESOURCE_SCALE.concerto,
    offtune: snap.offtune / RESOURCE_SCALE.offtune,
    // what each held coming in — the running-column blanking reads these (page/detail.ts stepRow)
    "before:energy": snap.energyBefore / RESOURCE_SCALE.energy,
    "before:concerto": snap.concertoBefore / RESOURCE_SCALE.concerto,
    "before:offtune": snap.offtuneBefore / RESOURCE_SCALE.offtune,
    avg: dealsDamage ? avg : null
  };
  FORTE_GAUGES.forEach((key, i) => {
    raw[`gauge:${RESOURCE_NAME[key]}`] = snap.forte[i];
    raw[`before:gauge:${RESOURCE_NAME[key]}`] = snap.forteBefore[i];
    if (snap.maxForte[i])
      raw[`max:gauge:${RESOURCE_NAME[key]}`] = snap.maxForte[i];
  });
  raw["short:concerto"] = snap.concertoShort ? 1 : 0;
  FORTE_GAUGES.forEach((key, i) => {
    raw[`short:gauge:${RESOURCE_NAME[key]}`] = snap.forteShort[i] ? 1 : 0;
  });
  const sources = {};
  for (const [key, feeds] of Object.entries(FEEDS))
    sources[key] = tracing(snap, feeds(snap.action));
  sources.effRes = (sources.effRes ?? []).map((r) => ({ ...r, value: -r.value }));
  const RESOURCE_STAT = { energy: [
    26
    /* Stat.AddEnergy */
  ], concerto: [
    27
    /* Stat.AddConcerto */
  ], offtune: [
    28
    /* Stat.AddOfftune */
  ] };
  const RESOURCE_DIGITS = { energy: 2, concerto: 2, offtune: 4 };
  for (const key of ["energy", "concerto", "offtune"]) {
    const wiped = key === "energy" && snap.energyWiped;
    const declared = wiped ? 0 : snap.action[key] / RESOURCE_SCALE[key];
    const traced = wiped ? [] : RESOURCE_STAT[key].flatMap((st) => tracing(snap, keysFor(snap.action, st), false)).map((r) => ({ ...r, value: r.value / RESOURCE_SCALE[key] }));
    const rows = [];
    const digits = RESOURCE_DIGITS[key];
    if (declared)
      rows.push({ source: snap.action.name, value: declared, digits, owner: snap.member });
    rows.push(...traced.map((r) => ({ ...r, digits })));
    const folded = foldDuplicates(rows);
    if (folded.length || wiped)
      sources[key] = folded;
    if (traced.length)
      buffed.add(key);
    raw[`moved:${key}`] = rows.reduce((n, r) => n + r.value, 0);
  }
  if (!snap.energyWiped) {
    const rate = tracing(snap, keysFor(
      snap.action,
      14
      /* Stat.EnergyRegenMult */
    ));
    if (rate.length) {
      sources.energy = [...sources.energy ?? [], ...rate.map((r) => ({ ...r, section: ENERGY_RATE, digits: 2 }))];
      raw["moved:energy"] = (Number(raw["moved:energy"]) || 0) * (1 + snap.stat(
        14
        /* Stat.EnergyRegenMult */
      ) / 100);
    }
  }
  const buildingOfftune = snap.action.offtune + tracing(snap, keysFor(
    snap.action,
    28
    /* Stat.AddOfftune */
  )).reduce((n, r) => n + r.value, 0);
  if (buildingOfftune > 0) {
    const rate = tracing(snap, keysFor(
      snap.action,
      13
      /* Stat.OfftuneBuildup */
    ));
    if (rate.length)
      sources.offtune = [...sources.offtune ?? [], ...rate.map((r) => ({ ...r, section: OFFTUNE_RATE, digits: 2 }))];
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
      digits: RESOURCE_DIGITS.offtune,
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
    const declared = snap.action[FORTE_FIELD[i]];
    const traced = tracing(snap, keysFor(snap.action, FORTE_STAT[i]));
    const rows = [];
    if (snap.action.resetForte[i]) {
      rows.push({ source: snap.action.name, value: 0, text: "RESET", digits: 0, owner: snap.member });
    }
    if (declared)
      rows.push({ source: snap.action.name, value: declared, digits: 2, owner: snap.member });
    rows.push(...traced.map((r) => ({ ...r, digits: 2 })));
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
      ...snap.action.mv ? [{ source: snap.action.name, label: "Base MV", value: snap.action.mv, percent: true, owner: snap.member }] : [],
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
        digits: 1,
        summary: true
      }))];
    }
  }
  for (const [key, word, [baseStat, bonusStat, flatStat]] of [
    ["atk", "ATK", [
      0,
      6,
      3
      /* Stat.FlatAtk */
    ]],
    ["hp", "HP", [
      1,
      7,
      4
      /* Stat.FlatHp */
    ]],
    ["def", "DEF", [
      2,
      8,
      5
      /* Stat.FlatDef */
    ]]
  ]) {
    const traced = sources[key];
    if (!traced)
      continue;
    const sum = (stat) => traced.filter((r) => r.stat !== void 0 && splitStat(r.stat)[0] === stat).reduce((n, r) => n + r.value, 0);
    const base = sum(baseStat);
    if (!base)
      continue;
    const subtotal = (stat, percent) => traced.some((r) => r.stat !== void 0 && splitStat(r.stat)[0] === stat) ? [{ source: "", label: "Total", value: sum(stat), section: SECTION_OF[stat], percent, digits: percent ? 2 : 0, summary: true }] : [];
    const final = `Final ${word}`;
    sources[key] = [
      ...traced,
      ...subtotal(baseStat, false),
      ...subtotal(bonusStat, true),
      ...subtotal(flatStat, false),
      { source: "", label: "Total", value: snap[key], section: final, digits: 0, summary: true },
      {
        source: "",
        label: "Relative",
        value: (sum(flatStat) + sum(bonusStat) / 100 * base) / base * 100,
        section: final,
        percent: true,
        digits: 2,
        summary: true
      }
    ];
  }
  if (members.length > 1) {
    const per = members.map((m) => rowValues(m, { mv: mvPercent(m), avg: 0 }));
    for (const key of ["short:concerto", ...FORTE_GAUGES.map((k) => `short:gauge:${RESOURCE_NAME[k]}`)]) {
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
      raw[`before:gauge:${RESOURCE_NAME[key]}`] = members[0].forteBefore[i];
    });
    raw["before:energy"] = members[0].energyBefore / RESOURCE_SCALE.energy;
    raw["before:concerto"] = members[0].concertoBefore / RESOURCE_SCALE.concerto;
    raw["before:offtune"] = members[0].offtuneBefore / RESOURCE_SCALE.offtune;
  }
  const f = damageFactors(snap);
  if (dealsDamage)
    sources.avg = [
      { source: f.scaling === null ? "" : STAT_SOURCE[f.scaling] ?? SCALING_NAME[f.scaling], label: "Final Stat", value: f.finalStat },
      { source: snap.action.name, label: "Motion Value", value: f.finalMv, mult: true },
      { source: "buffs", label: "Damage Bonus", value: f.bonusFactor, mult: true },
      { source: "buffs", label: "Amplification", value: f.ampFactor, mult: true },
      ...f.scaling === 4 ? [{ source: "buffs", label: "Tune Break Boost", value: f.tbbFactor, mult: true }] : [],
      ...f.dealtFactor > 1 ? [{ source: "buffs", label: "Total Damage", value: f.dealtFactor, mult: true }] : [],
      ...f.takenFactor > 1 ? [{ source: "enemy", label: "Damage Taken", value: f.takenFactor, mult: true }] : [],
      { source: "enemy", label: "Res Factor", value: f.resFactor, mult: true },
      { source: "enemy", label: "Def Factor", value: f.defFactor, mult: true },
      { source: "crit", label: "Average Crit", value: f.critFactor, mult: true }
    ];
  return { raw, sources, buffed };
}
function buildReport(lines) {
  const columns = [
    { key: "member", label: "member", align: "left" },
    { key: "action", label: "action", align: "left" },
    { key: "avg", label: "avg dmg", full: "Final Damage" },
    { key: "mv", label: "mv%", digits: 2, percent: true, full: "Motion Value" },
    { key: "atk", label: "atk", noTotal: true },
    { key: "dmgBonus", label: "dmg%", digits: 1, percent: true, full: "Dmg Bonus" },
    { key: "amp", label: "amp%", digits: 1, percent: true, full: "Amplification" },
    { key: "cr", label: "cr%", digits: 1, percent: true, full: "Crit Rate" },
    { key: "cd", label: "cd%", digits: 1, percent: true, full: "Crit Dmg" },
    // both halves carry their own section heading, so `full` is only the empty-panel one
    { key: "effDef", label: "ignore%", digits: 1, percent: true, full: "DEF Ignore", fullEmpty: "DEF Shred" },
    { key: "effRes", label: "res%", digits: 1, percent: true, full: "Enemy RES" },
    { key: "dealt", label: "vuln%", digits: 1, percent: true, full: "Vulnerability" },
    { key: "er", label: "er%", digits: 1, percent: true, full: "Energy Regen" },
    { key: "hp", label: "hp", noTotal: true },
    { key: "def", label: "def", noTotal: true },
    // digits match nanoka's precision; offtune is /10000 (RESOURCE_SCALE)
    { key: "concerto", label: "concerto", digits: 2, hideIfZero: true, full: "Concerto" },
    { key: "energy", label: "energy", digits: 2, hideIfZero: true, full: "Energy" },
    { key: "offtune", label: "offtune", digits: 4, hideIfZero: true, full: "OffTune" },
    // two decimals, the same as concerto and energy: a gauge is fed in fractions of a point
    ...FORTE_GAUGES.map((key) => ({
      key: `gauge:${RESOURCE_NAME[key]}`,
      label: RESOURCE_NAME[key],
      digits: 2,
      hideIfZero: true,
      full: RESOURCE_NAME[key]
    }))
  ];
  const isShort = (snap) => snap.triggered;
  const isShortLine = (line) => line.members?.length ? line.members.every(isShort) : isShort(line.snap);
  const partOf = (snap, avg, shown2) => {
    const part = rowValues(snap, { mv: mvPercent(snap), avg });
    part.raw.action = snap.action.name;
    return {
      ...part,
      info: actionInfo(snap.action, snap.type, snap.triggered, snap.triggeredBy),
      type: snap.type,
      scaling: snap.action.scaling,
      isShown: snap === shown2,
      snap,
      short: isShort(snap)
    };
  };
  const rows = lines.map((line) => {
    const snap = line.snap;
    const { raw, sources, buffed } = rowValues(snap, { mv: line.mv, avg: line.avg }, line.members ?? []);
    raw.action = line.id;
    return {
      line,
      raw,
      sources,
      buffed,
      // `snap.type`, not `action.type`: the type it was actually evaluated as (typeOverride)
      info: actionInfo(snap.action, snap.type, snap.triggered, snap.triggeredBy),
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
  const shown = (r, c) => {
    const v = r.raw[c.key];
    return typeof v === "number" ? fmt(v, digitsOf(r.raw, c), PAD_DIGITS_COLUMNS.has(c.key), GROUPED_COLUMNS.has(c.key)) + (c.percent ? "%" : "") + gaugeSuffix(r.raw, c.key) : String(v ?? "");
  };
  const sized = used.map((c) => {
    const lens = [c.label.length];
    for (const r of rows) {
      lens.push(shown(r, c).length);
      for (const p of r.parts)
        lens.push(shown(p, c).length + (c.key === "action" ? 3 : 0));
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
function storeSolved(teamKey2, solved) {
  bestPicks.set(bestKey(teamKey2, TEAMS[teamKey2], filters), solved);
  picksCache.set(picksKey(teamKey2, TEAMS[teamKey2], filters), solved.picks);
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
var poolKey = "\0";
function leaderNeeds() {
  const added = [...resonatorFilters].filter(([, mode]) => mode === "include").map(([name]) => name);
  const key = added.join("\0");
  if (key === poolKey)
    return poolNeeds;
  [poolKey, poolAdded, poolNeeds] = [key, added, /* @__PURE__ */ new Map()];
  for (const ms of Object.values(TEAMS)) {
    for (const m of ms) {
      if (!MDPS_NAMES.has(m.name) || !added.includes(m.name))
        continue;
      const held = added.filter((o) => o !== m.name && ms.some((x) => x.name === o)).length;
      poolNeeds.set(m.name, Math.max(poolNeeds.get(m.name) ?? 0, held));
    }
  }
  return poolNeeds;
}
function teamWanted(members) {
  const has = (name) => members.some((m) => m.name === name);
  for (const [name, mode] of resonatorFilters)
    if (mode === "exclude" && has(name))
      return false;
  const needs = leaderNeeds();
  if (!needs.size)
    return poolAdded.every(has);
  for (const m of members) {
    const need = needs.get(m.name);
    if (need !== void 0 && poolAdded.filter((o) => o !== m.name && has(o)).length >= need)
      return true;
  }
  return false;
}
function sequenceTagAt(m, sequence, rank = 1, f = filters) {
  if (!axisOpen(m, f, "sequences"))
    return null;
  return `${m.name} S${sequence}${rank > 1 ? `R${rank}` : ""}`;
}
var sequenceTag = (m, combo) => {
  const weapon = m.loadout.refinements.findIndex((ranks) => ranks.includes(combo.weapon));
  const extra = weapon < 0 ? null : topRank(m, filters, weapon);
  const rank = extra !== null && combo.weapon.refinement === extra + 1 ? combo.weapon.refinement : 1;
  return sequenceTagAt(m, combo.sequence, rank);
};
function sequenceTagsOf(m, f = filters) {
  const tags = sequenceLevels(m, f).map((level) => sequenceTagAt(m, level, 1, f) ?? "");
  const extra = new Set(eligibleWeapons(m, f).map((w) => topRank(m, f, w)).filter((r) => r !== null));
  for (const rank of [...extra].sort((a, b) => a - b)) {
    tags.push(sequenceTagAt(m, m.loadout.sequences.length, rank + 1, f));
  }
  return tags;
}
var refineTag = (m, combo) => `${m.name} R${combo.weapon.refinement}`;
function rowWanted(row) {
  const fielded = row.members.map((m) => m.name);
  return namesHold(weaponFilters, row.combo.flatMap((c) => [c.weapon.name, weaponBase(c.weapon)])) && namesHold(echoFilters, row.combo.map((c, i) => echoLabel(row.members[i].loadout, c.echo))) && tagsHold(sequenceFilters, row.combo.flatMap((c, i) => sequenceTag(row.members[i], c) ?? []), fielded) && tagsHold(refineFilters, row.combo.map((c, i) => refineTag(row.members[i], c)), fielded);
}
function expandTeam(teamKey2, members) {
  const solved = bestPicks.get(bestKey(teamKey2, members, filters));
  if (!solved || !teamWanted(members))
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
  return Object.entries(TEAMS).filter(([, members]) => teamWanted(members)).reduce((sum, [, members]) => sum + estimatedRowCount(members, f), 0);
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
      const res = await fetch(`./tests/solves/${file}`, { cache: "no-store" });
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
      const idx = await fetch("./tests/solves/index.json", { cache: "no-store" });
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
  s1r1mdps: "s1m",
  s2r1mdps: "s2m",
  s3r1mdps: "s3m",
  s6r1mdps: "s6m",
  s6r5mdps: "s6r5m",
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
function syncHash(team = hashParams().get("team"), push = false) {
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
    parts.push(`team=${team}`);
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
  const key = hashParams().get("team");
  return key && results.has(key) ? key : null;
};

// dist/src/page/panels.js
var esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  const value = `<td class="v">${r.text !== void 0 ? esc(r.text) : r.mult ? `&times;${fmt(r.value, r.digits ?? 4)}` : `${fmt(r.value, r.digits ?? 4)}${unit(r)}`}</td>`;
  if (r.summary)
    return `<tr class="sum"><td class="k">${esc(label)}</td>${value}</tr>`;
  return noSource ? `<tr><td class="k">${esc(label)}</td>${value}</tr>` : `<tr><td class="s"${own ? ` style="--own:${own}"` : ""}>${esc(source || label)}</td>${value}</tr>`;
};
function popover(col, rows, total, slotHue, suffix = "") {
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
  const titled = sections.length ? body : `<tr class="sec"><td colspan="2">${esc(col.fullEmpty ?? col.full ?? col.label)}</td></tr>`;
  const sum = col.noTotal ? "" : `<tr class="sum"><td class="k">Total</td><td class="v">${fmt(total, col.digits ?? 0)}${col.percent ? "%" : ""}${esc(suffix)}</td></tr>`;
  return lazyPop(`<span class="pop stat${col.key === "avg" ? " damage" : ""}"><table>${titled}${before.map(row).join("")}${sum}${after.map(row).join("")}</table></span>`);
}
function infoPopover(info, slotHue) {
  if (!info?.length)
    return "";
  const rows = info.map((e) => {
    if (e.source !== void 0) {
      const hue = slotHue.get(e.source) ?? TUNE_BREAK_ENEMY.color;
      return `<tr><td class="s" colspan="2" style="--own:${hue}">${esc(e.label)}</td></tr>`;
    }
    return `<tr><td class="k">${esc(e.label)}</td><td class="v">${esc(e.value)}</td></tr>`;
  }).join("");
  return lazyPop(`<span class="pop info"><table>${rows}</table></span>`);
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
  const row = (name, hue) => `<tr><td class="s" style="--own:${hue}">${esc(name)}</td></tr>`;
  const own = slotHue.get(member2) ?? FALLBACK_HUE;
  const gearSection = showGear ? `<tr class="sec"><td>Gear</td></tr>` + gear.map((g) => row(g.name, own)).join("") : "";
  const section = (heading, buffs) => buffs.length ? `<tr class="sec"><td>${esc(heading)}</td></tr>` + sorted(buffs).map((b) => row(b.name, slotHue.get(b.source) ?? TUNE_BREAK_ENEMY.color)).join("") : "";
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
function sumByTag(lines, slot, keyOf) {
  const by = /* @__PURE__ */ new Map();
  eachHit(lines, slot, (snap, avg) => {
    const key = keyOf(snap.action);
    if (key != null)
      by.set(key, (by.get(key) ?? 0) + avg);
  });
  return by;
}
function breakdownSection(heading, by, total, label) {
  if (!by.size)
    return "";
  const rows = [...by].sort((a, b) => b[1] - a[1]);
  const body = rows.map(([k, v]) => {
    const pct = total ? Math.round(v / total * 100) : 0;
    return `<tr><td class="k">${esc(label(k))}</td><td class="v">${fmt(v)} <span class="pct">(${pct}%)</span></td></tr>`;
  }).join("");
  return `<tr class="sec"><td colspan="2">${esc(heading)}</td></tr>${body}`;
}
function teamActionPopover(lines, total, slotHue) {
  const by = /* @__PURE__ */ new Map();
  eachHit(lines, null, (snap, avg) => {
    let act = snap.action;
    while (act.cancelOf ?? act.formOf)
      act = act.cancelOf ?? act.formOf;
    const key = `${snap.slot} ${act.name}`;
    const cur = by.get(key) ?? { dmg: 0, n: 0, slot: snap.slot, name: act.name };
    cur.dmg += avg;
    cur.n++;
    by.set(key, cur);
  });
  if (!by.size)
    return "";
  const rows = [...by.values()].sort((a, b) => b.dmg - a.dmg).slice(0, 10).map((v) => {
    const pct = total ? Math.round(v.dmg / total * 100) : 0;
    const hue = slotHue.get(v.slot) ?? TUNE_BREAK_ENEMY.color;
    return `<tr><td class="s" style="--own:${hue}">${esc(v.name)}${v.n > 1 ? ` x${v.n}` : ""}</td><td class="v">${fmt(v.dmg)} <span class="pct">(${pct}%)</span></td></tr>`;
  }).join("");
  return lazyPop(`<span class="pop breakdown"><table><tr class="sec"><td colspan="2">Top Actions</td></tr>${rows}</table></span>`);
}
function damagePopover(lines, slot, total, grandTotal) {
  const tagName = (k) => TAG_NAME[k];
  const body = breakdownSection("Node", sumByTag(lines, slot, (a) => a.node), total, (k) => NODE_NAME[k]) + breakdownSection("Type 1", sumByTag(lines, slot, (a) => a.type1), total, tagName) + breakdownSection("Type 2", sumByTag(lines, slot, (a) => a.type2), total, tagName);
  const pct = grandTotal ? Math.round(total / grandTotal * 100) : 0;
  return lazyPop(`<span class="pop breakdown"><table>${body}<tr class="sum"><td class="k">Total</td><td class="v">${fmt(total)} <span class="pct">(${pct}% of team)</span></td></tr></table></span>`);
}
function equippedGear(member2, combo) {
  const l = member2.loadout;
  const r = l.resonator;
  return [
    ...r.inherent1 ? [["Inherent", r.inherent1]] : [],
    ...r.inherent2 ? [["Inherent", r.inherent2]] : [],
    ["Weapon", combo.weapon],
    ["Mainslot", combo.echo.mainslot],
    ...combo.echo.sets.map((g, i) => [i === 0 ? "Sonata" : "", g]),
    ["Mainstats", combo.mainstat],
    ["Substats", combo.highSubs ? l.highSubstat : l.substat]
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
var CORE_TYPE1_SCOPES = [
  4096,
  8192,
  12288,
  16384
  /* Type1.Liberation */
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
function menuStatRows(member2, combo) {
  const l = member2.loadout;
  const entries = menuStats(l.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs));
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
  pushBest(CORE_TYPE1_SCOPES);
  pushBest(OTHER_SCOPES);
  return rows;
}
var subsLabel = (combo) => combo.highSubs ? "High Invest" : "ChemX32";
function declaredRows(buffs, owner, fold) {
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
  return [...by.values()].flatMap(({ rows, n }) => rows.map((e) => ({ ...e, value: e.value * n, source: n > 1 ? `${e.source} x${n}` : e.source, dim: n === 1 })));
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
var statRow = (e, owner, slotHue, noStat = false) => (
  // the cell's own member, not the entry's `owner`: every panel here is one member's piece and is
  // filtered to what that member put up, while `owner` is `State.sourceOf` — one entry per Gear, so
  // a sonata two of them wear reads as whoever equipped it last
  `<tr class="stat${e.dim ? " one" : ""}"><td class="s" style="--own:${slotHue.get(owner) ?? FALLBACK_HUE}">${esc(e.source)}</td>` + (noStat ? "" : `<td class="k">${esc(statLabel(e.stat))}</td>`) + `<td class="v">${fmt(e.value, isPercent(e.stat) ? 1 : 0)}${isPercent(e.stat) ? "%" : ""}</td></tr>`
);
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
function loadoutTable(run) {
  const builds = run.members.map((m, i) => ({ member: m, combo: run.combo[i] }));
  const slotHue = new Map([
    ...run.members.map((m) => [m.name, m.color]),
    [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]
  ]);
  const kitOf = ({ member: member2, combo }) => {
    const r = member2.loadout.resonator;
    return new Set([r, r.talent, r.inherent1, r.inherent2, combo.matrix].filter((g) => g != null));
  };
  const equipped = new Set(builds.flatMap(({ member: member2, combo }) => member2.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs)));
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
  const sonataOf = builds.map(({ combo }) => {
    const echo = combo.echo;
    return [...echo.sets, ...echo.sonata instanceof Sonata ? [echo.sonata.sonata2pc] : []];
  });
  const sonatas = Math.max(...sonataOf.map((list) => list.length));
  for (let i = 0; i < sonatas; i++) {
    rows.push(row(i === 0 ? "Sonata" : "", builds.map((b, k) => gearCell(b.member.name, sonataOf[k][i] ?? null))));
  }
  const spreadCell = (piece, owner, stats, heading, noStat = false) => {
    const hover = statsPanel(stats, [], owner, slotHue, heading, noStat);
    return `<div class="c has"${hover}>${esc(piece.name)}</div>`;
  };
  rows.push(row("Mainstats", builds.map((b) => spreadCell(b.combo.mainstat, b.member.name, declaredRows(mainstatSlotBuffs(b.combo.mainstat), b.member.name, false), "Mainstats & Secondary Stats"))));
  rows.push(row("Substats", builds.map((b) => {
    const piece = b.combo.highSubs ? b.member.loadout.highSubstat : b.member.loadout.substat;
    const rolls = substatRollBuffs(piece);
    return spreadCell(piece, b.member.name, declaredRows(rolls, b.member.name, true), `Substats (${rolls.length} lines)`, true);
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
    const stats = menuStatRows(b.member, b.combo).map((r) => `<tr><td class="k">${esc(r.label)}</td><td class="v">${esc(r.value)}</td></tr>`).join("");
    return `<div class="c menustats"><table>${stats}</table></div>`;
  })));
  return `<div class="rtable loadout" style="--cols:${builds.length}">${head}${rows.join("")}</div>`;
}
function dprTable(run, lines) {
  const grand = run.sectionTotals.reduce((a, b) => a + b, 0);
  const flat = lines?.flat();
  const head = `<div class="rtrow rthead"><div class="c"></div><div class="c num">Opener</div><div class="c num">Loop 1</div><div class="c num">Loop 2</div><div class="c num">Loop 3</div><div class="c num">Total</div></div>`;
  const valueCell = (sec, slot, value, total) => sec ? `<div class="c num has"${damagePopover(sec, slot, value, total)}>${fmt(value)}</div>` : `<div class="c num">${fmt(value)}</div>`;
  const dataRow = (slot, color) => {
    const own = run.sectionBySlot.reduce((a, by) => a + (by.get(slot) ?? 0), 0);
    return `<div class="rtrow"><div class="c name" style="--mem:${color}">${esc(slot)}</div>` + run.sectionBySlot.map((by, i) => valueCell(lines?.[i], slot, by.get(slot) ?? 0, run.sectionTotals[i])).join("") + valueCell(flat, slot, own, grand) + `</div>`;
  };
  const memberRows = run.members.map((m) => dataRow(m.name, m.color)).join("");
  const tuneBreakRow = dataRow(TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color);
  const slotHue = new Map([
    ...run.members.map((m) => [m.name, m.color]),
    [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]
  ]);
  const totalCell = (sec, value) => {
    const hover = sec ? teamActionPopover(sec, value, slotHue) : "";
    return `<div class="c num${hover ? " has" : ""}"${hover}>${fmt(value)}</div>`;
  };
  const totalRow = `<div class="rtrow total"><div class="c name">Total</div>` + run.sectionTotals.map((v, i) => totalCell(lines?.[i], v)).join("") + totalCell(flat, grand) + `</div>`;
  return `<div class="rtable dpr">${head}${memberRows}${tuneBreakRow}${totalRow}</div>`;
}
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
  const place = (cell2, pop) => {
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
  const panelIn = (target) => {
    const cell2 = target?.closest?.(".c") ?? null;
    if (!cell2)
      return { cell: null, pop: null };
    if (open && openHome === cell2)
      return { cell: cell2, pop: open };
    const kept = built.get(cell2);
    if (kept)
      return { cell: cell2, pop: kept };
    const data = cell2.dataset;
    const markup = data?.pop ?? (data?.popKind ? buildPop(data.popKind, data.popKey ?? "") : void 0);
    if (!markup)
      return { cell: cell2, pop: null };
    const box = document.createElement("div");
    box.innerHTML = markup;
    cell2.removeAttribute("data-pop");
    const pop = box.firstElementChild;
    if (pop)
      built.set(cell2, pop);
    return { cell: cell2, pop };
  };
  const isAction = (cell2) => !!cell2.closest(".grid") && (cell2.classList.contains("action") || cell2.classList.contains("name")) || cell2.classList.contains("teamdpr");
  document.addEventListener("mouseover", (e) => {
    if (pinned)
      return;
    if (open && open.contains(e.target))
      return;
    const hovered = e.target?.closest?.(".c") ?? null;
    if (hovered && isAction(hovered)) {
      if (openHome !== hovered)
        close();
      return;
    }
    const { cell: cell2, pop } = panelIn(e.target);
    if (pop === open)
      return;
    close();
    if (pop)
      place(cell2, pop);
  });
  document.addEventListener("mouseout", (e) => {
    if (pinned)
      return;
    const to = e.relatedTarget;
    if (to && (root.contains(to) || open && open.contains(to)))
      return;
    close();
  });
  addEventListener("click", (e) => {
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
    if (isAction(cell2) && !onCaret && pop) {
      e.preventDefault();
      const same = openHome === cell2;
      close();
      if (!same) {
        place(cell2, pop);
        pinned = cell2.classList.contains("teamdpr");
      }
      return;
    }
    if (cell2.querySelector(":scope > .caret"))
      close();
  });
  addEventListener("scroll", close, true);
  addEventListener("resize", close);
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
  searchAt = searchAt < 0 ? step > 0 ? 0 : n - 1 : (searchAt + step + n) % n;
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
  "Full S0R0 - Limited resonators are S0 and use the best standard or 4* weapon available at R1. Rover and 4* resonators are S6.",
  "S0R1 mdps - Each team gets a single signature weapon at R1 that gives the best DPR increase, in most cases the team's main DPS. Dual DPS teams still only get one signature weapon.",
  "S0R1 all - All limited resonators get their best signature weapon, while Rover and 4* supports may still use standard or 4* weapons.",
  "S1R1 / S2R1 / S3R1 / S6R1 mdps - One resonator per team runs that many sequence nodes, whichever gives the best DPR increase, in most cases the team's main DPS. Everyone else stays S0R1.",
  "S6R5 mdps - That one resonator is S6 and runs their weapon at R5; everyone else is still S0R1.",
  "Full S6R5 - Every resonator is S6 with their best weapon at R5."
];
var MATRIX_HELP = "Enables matrix exclusive buffs for older characters, scaled down to a neutral environment. Lucy also activates 1 stack of her boss kill inherent.";
var STANDARDS = [
  "Rotations are 123, 1323, or 12323 for double intro and unison (jinhsi, brant, hsin, etc).",
  "A resonator may use their liberation at the start of the fight for free damage or buffs.",
  "Each rotation is achievable in 25-28 seconds, and we assume 4 rotations in 2 minutes.",
  "Combat is performed against a single level 100 boss with 20% resistance to all attributes.",
  "Resonators and weapons are level 90, with all skill nodes at level 10."
];
var README = [
  "All beta calculations are subject to change!",
  "If you find an issue in rotations, buffs, stats, builds, or abnormal damage ping me on discord @rileyy._."
];
var openHelp = /* @__PURE__ */ new Set(["readme"]);
function comparisonFilters() {
  const costBox = () => {
    const open = openHelp.has("cost");
    const option = (value, label) => `<option value="${value}"${filters.cost === value ? " selected" : ""}>${label}</option>`;
    return `<div class="tcopt${open ? " open" : ""}"><div class="tcopt-head"><button type="button" class="tcopt-name" data-help="cost" aria-expanded="${open}">Team Cost<span class="arrow">\u203A</span></button><select id="cost" class="tcselect" aria-label="Team Cost" title="Team Cost">` + option("s0r0", "Full S0R0") + option("s0r1mdps", "S0R1 mdps only") + option("s0r1", "Full S0R1") + option("s1r1mdps", "S1R1 mdps") + option("s2r1mdps", "S2R1 mdps") + option("s3r1mdps", "S3R1 mdps") + option("s6r1mdps", "S6R1 mdps") + option("s6r5mdps", "S6R5 mdps") + option("s6r5", "Full S6R5") + `</select></div><div class="tcopt-desc"${open ? "" : " hidden"}><ul>${COST_HELP.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div></div>`;
  };
  const note = (id, label, lines) => {
    const open = openHelp.has(id);
    return `<div class="tcopt note${open ? " open" : ""}"><div class="tcopt-head"><button type="button" class="tcopt-name" data-help="${id}" aria-expanded="${open}">${esc(label)}<span class="arrow">\u203A</span></button></div><div class="tcopt-desc"${open ? "" : " hidden"}><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div></div>`;
  };
  return `<div class="tcfilters">
    <div class="tcfilter-row note">
      ${note("readme", "README", README)}
      ${note("standards", "Standards and Assumptions", STANDARDS)}
      ${costBox()}
      <div class="tcsearchrow">
        <div class="tcsearch">
          <input id="optionSearch" type="search" placeholder="Add resonators..."
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
    bucket(mode).push(`<button type="button" class="rchip" data-resonator="${esc(name)}" style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}" title="${esc(name)} \u2014 teams fielding ${MODE_TITLE[mode]}. Click to remove.">${esc(name)}</button>`);
  }
  for (const [kind, map] of Object.entries(OPTION_FILTER_MAPS)) {
    for (const [name, mode] of map) {
      const hue = kind === "sequence" || kind === "refine" ? RESONATOR_HUE.get(tagOwner(name)) : void 0;
      bucket(mode).push(`<button type="button" class="rchip" data-kind="${kind}" data-value="${esc(name)}"` + (hue ? ` style="--mem:${hue}"` : "") + ` title="${esc(name)} \u2014 rows using ${MODE_TITLE[mode]}. Click to remove.">${esc(name)}</button>`);
    }
  }
  for (const s of filters.scoped) {
    inc.push(`<button type="button" class="rchip" data-scoped="${esc(scopedKey(s))}" style="--mem:${RESONATOR_HUE.get(s.resonator) ?? TUNE_BREAK_ENEMY.color}" title="Comparing ${esc(scopedLabel(s))}'s ${AXIS_LABEL[s.axis].toLowerCase()}. Click to remove.">${esc(scopedLabel(s))} ${AXIS_LABEL[s.axis]}</button>`);
  }
  for (const name of filters.matrix) {
    inc.push(`<button type="button" class="rchip" data-matrix="${esc(name)}" style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}" title="${esc(name)} runs their Matrix in every team. ${esc(MATRIX_HELP)} Click to remove.">${esc(name)} Matrix</button>`);
  }
  for (const axis of AXES) {
    for (const name of filters[axis]) {
      inc.push(`<button type="button" class="rchip" data-axis="${axis}" data-resonator="${esc(name)}" style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}" title="Comparing ${esc(name)}'s ${AXIS_LABEL[axis].toLowerCase()}. Click to remove.">${esc(name)} ${AXIS_LABEL[axis]}</button>`);
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
function placeInView(el, x, y) {
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.max(6, Math.min(x, innerWidth - r.width - 6))}px`;
  el.style.top = `${Math.max(6, Math.min(y, innerHeight - r.height - 6))}px`;
}
function rowCapWarning(total) {
  document.querySelector(".rowcap")?.remove();
  if (total === null)
    return;
  const pop = document.createElement("div");
  pop.className = "ctxmenu rowcap";
  pop.textContent = `That would open ${fmt(total)} rows, which is over the ${fmt(ROW_CAP)} cap. Try using less comparisons, removing a resonator, or hiding resonators.`;
  document.body.appendChild(pop);
  placeInView(pop, ...lastPoint);
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
  placeInView(menu, x, y);
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
  return [m.loadout.resonator.name, combo.matrix ? "(Matrix)" : "", `${seqToken(m, combo)}${rankToken(m, combo)}`].filter(Boolean).join(" ");
}
var seqToken = (m, combo) => combo.sequence > 0 || axisOpen(m, filters, "sequences") ? `S${combo.sequence}` : "";
var rankToken = (m, combo) => axisUsed(m, filters, "weapons") ? "" : compares(m, filters, "refines", combo) || combo.weapon.refinement > 1 || combo.weapon.tier === 0 || combo.weapon.tier === 2 && m.loadout.resonator.tier !== 0 ? `R${combo.weapon.refinement}` : "R0";
function optionCell(kind, value, color, lines = [value], resonator = "") {
  const style = `--mem:${color}`;
  if (!value)
    return `<div class="c option" style="${style}"></div>`;
  return `<div class="c option" data-kind="${kind}" data-value="${esc(value)}"${resonator ? ` data-resonator="${esc(resonator)}"` : ""} style="${style}">${lines.map(esc).join("<br>")}</div>`;
}
var hueShown = true;
var dprExact = { personal: true, team: true };
var dprFmt = (v, exact) => {
  if (exact)
    return fmt(v);
  if (v >= 1e6)
    return `${fmt(Math.floor(v / 1e3) / 1e3, 3, true, false)}M`;
  if (v < 1e3)
    return fmt(Math.floor(v), 0, false, false);
  const decimals = v >= 1e5 ? 0 : v >= 1e4 ? 1 : 2;
  const step = 10 ** (3 - decimals);
  return `${fmt(Math.floor(v / step) / 10 ** decimals, decimals, true, false)}K`;
};
var pctTrunc = (ratio) => `${fmt(Math.trunc(ratio * 1e3) / 10, 1, true)}%`;
var tableView = null;
function comparisonTable(rows) {
  const seq = (run) => run.combo.reduce((n, c) => n + c.sequence, 0);
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
      if (!held || run.total > held.total)
        groupBest.set(k, run);
    }
  const sorted = keyed.sort((a, b) => {
    for (let i = 0; i < a.keys.length; i++) {
      const [ka, kb] = [a.keys[i], b.keys[i]];
      if (ka === kb)
        continue;
      const [ra, rb] = [groupBest.get(ka), groupBest.get(kb)];
      return rb.total - ra.total || seq(rb) - seq(ra) || (ka < kb ? -1 : 1);
    }
    return b.run.total - a.run.total || seq(b.run) - seq(a.run);
  }).map((k) => k.pair);
  const GEAR_AXES = ["weapons", "echoes", "mainstats", "substats"];
  const CMP_AXES = [...GEAR_AXES, "sequences", "refines"];
  const shows = (m, axis) => axisUsed(m, filters, axis);
  const showsRow = (m, axis, combo) => compares(m, filters, axis, combo);
  const AXIS_HEAD = { weapons: "Weapon", echoes: "Echo Set", mainstats: "Mainstats", substats: "Substats" };
  const gearKey = (c, axis, ranked = true) => {
    const [w, e, , seq2, ref, ...rest] = c.key.split(".");
    const anyRank = axis === "weapons" || axis === "refines" || axis === "sequences" && !ranked;
    return [axis === "weapons" ? "*" : w, axis === "echoes" ? "*" : e, "*", axis === "sequences" ? "*" : seq2, anyRank ? "*" : ref, rest.includes("m"), axis === "substats" || axis === null ? "*" : rest.includes("h")].join("|");
  };
  const twinKey = (run, pos, axis) => `${run.teamKey}|${pos}|${axis}|${run.combo.map((c, k) => gearKey(c, k === pos ? axis : null, axisUsed(run.members[pos], filters, "refines"))).join("-")}`;
  const openAt = { weapons: [false, false, false], echoes: [false, false, false], mainstats: [false, false, false], substats: [false, false, false], sequences: [false, false, false], refines: [false, false, false] };
  for (const row of rows) {
    row.members.forEach((m, pos) => {
      for (const axis of CMP_AXES)
        if (shows(m, axis))
          openAt[axis][pos] = true;
    });
  }
  const onScreen = new Set(rows.map((r) => r.key));
  const teamsOnScreen = new Set(rows.map((r) => r.teamKey));
  const openAxes = CMP_AXES.filter((axis) => openAt[axis].some(Boolean));
  const twins = /* @__PURE__ */ new Map();
  for (const [key, run] of results) {
    if (!openAxes.length || !teamsOnScreen.has(run.teamKey))
      continue;
    run.members.forEach((m, pos) => {
      for (const axis of openAxes) {
        if (!openAt[axis][pos])
          continue;
        const twin = twinKey(run, pos, axis);
        const list = twins.get(twin) ?? [];
        list.push({ combo: run.combo[pos], dpr: run.bySlot.get(m.name) ?? 0, shown: onScreen.has(key) });
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
        if (t.combo.key.split(".")[4] !== "r0")
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
    const dpr = run.bySlot.get(run.members[pos].name) ?? 0;
    const all = twins.get(twinKey(run, pos, axis)) ?? [];
    const shown = all.filter((t) => t.shown);
    for (const pool2 of [shown, all]) {
      const base = bestOf(pool2, run, pos, axis);
      if (base > 0)
        return dpr / base;
    }
    return null;
  };
  const gearCompare = (run, pos, axis) => {
    const ratio = gearRatio(run, pos, axis);
    return ratio == null ? "" : pctTrunc(ratio);
  };
  const seqCmpAt = (i) => !!openAt.sequences[i];
  const refCmpAt = (i) => !!openAt.refines[i] && !openAt.weapons[i];
  const dprAt = (i) => CMP_AXES.some((axis) => openAt[axis][i]);
  const rowHtml = (key, run, rank) => {
    const grand = run.total;
    const memberNames = run.members.map((m) => m.name).join("|");
    const memberCell = (m, combo, i) => {
      const seqTag = sequenceTag(m, combo);
      const refTag = axisUsed(m, filters, "refines") && !openAt.weapons[i] ? refineTag(m, combo) : null;
      const name = `<div class="c name res" data-resonator="${esc(m.name)}"` + (seqTag ? ` data-sequence="${esc(seqTag)}" data-seq-gate="${combo.sequence}"` : "") + (refTag ? ` data-refine="${esc(refTag)}" data-ref-gate="${combo.weapon.refinement}"` : "") + ` style="--mem:${m.color};color:${m.color}"><span class="res-label">${esc(memberLabel(m, combo))}</span></div>`;
      const dpr = dprAt(i) ? `<div class="c num slotdpr" style="--mem:${m.color}">${dprFmt(run.bySlot.get(m.name) ?? 0, dprExact.personal)}</div>` : "";
      const seqCmp = seqCmpAt(i) ? `<div class="c num slotcompare" style="--mem:${m.color}">${axisOpen(m, filters, "sequences") ? gearCompare(run, i, "sequences") : ""}</div>` : "";
      const refCmp = refCmpAt(i) ? `<div class="c num slotcompare" style="--mem:${m.color}">${compares(m, filters, "refines", combo) ? gearCompare(run, i, "refines") : ""}</div>` : "";
      const gear = GEAR_AXES.map((axis) => {
        if (!openAt[axis][i])
          return "";
        const open = showsRow(m, axis, combo);
        const cell2 = axis === "weapons" ? optionCell("weapon", open ? combo.weapon.name : "", m.color, [combo.weapon.name], m.name) : axis === "echoes" ? optionCell("echo", open ? echoLabel(m.loadout, combo.echo) : "", m.color, open ? echoLines(m.loadout, combo.echo) : [], m.name) : `<div class="c option"${open ? ` data-stat="${axis}" data-resonator="${esc(m.name)}"` : ""} style="--mem:${m.color}">${open ? esc(axis === "mainstats" ? combo.mainstat.name : subsLabel(combo)) : ""}</div>`;
        return cell2 + `<div class="c num slotcompare" style="--mem:${m.color}">${open ? gearCompare(run, i, axis) : ""}</div>`;
      }).join("");
      return name + seqCmp + refCmp + gear + dpr;
    };
    const memberCells = run.members.map((m, i) => memberCell(m, run.combo[i], i)).join("");
    return `<div class="trow${rank.pinned ? " isbaseline" : ""}" style="--hue:${rank.hue}" data-team="${esc(key)}" data-team-key="${esc(run.teamKey)}" data-members="${esc(memberNames)}" data-total="${grand}">` + memberCells + `<div class="c num total teamdpr" title="Click to view the team's damage breakdown"${deferredPop("dpr", key)}>${dprFmt(grand, dprExact.team)}</div><div class="c num total baseline" data-team="${esc(key)}" title="Click to measure every team against this one">${rank.pct}</div><div class="c gotodetail" data-team="${esc(key)}">view rotation<span class="arrow">\u203A</span></div></div>`;
  };
  const memberHead = (n, i) => `<div class="c slothead">Slot ${n}</div>` + (seqCmpAt(i) ? `<div class="c num">Compare</div>` : "") + (refCmpAt(i) ? `<div class="c num">Compare</div>` : "") + GEAR_AXES.map((axis) => openAt[axis][i] ? `<div class="c">${AXIS_HEAD[axis]}</div><div class="c num">Compare</div>` : "").join("") + (dprAt(i) ? `<div class="c num dprhead" data-dpr="personal" title="Click to switch between abbreviated and exact figures">Personal</div>` : "");
  const head = `<div class="trow thead">` + memberHead(3, 0) + memberHead(2, 1) + memberHead(1, 2) + `<div class="c num dprhead" data-dpr="team" title="Click to switch between abbreviated and exact figures">Team Avg DPR</div><div class="c num huehead" title="Click to colour the column by rank">Compare</div><div class="c"></div></div>`;
  const posCols = (i) => `max-content${seqCmpAt(i) ? " max-content" : ""}${refCmpAt(i) ? " max-content" : ""}${GEAR_AXES.map((axis) => openAt[axis][i] ? " max-content max-content" : "").join("")}${dprAt(i) ? " max-content" : ""}`;
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
    dprAbbr: blank(),
    seqcmp: blank(),
    refcmp: blank(),
    total: "",
    totalAbbr: "",
    pct: "",
    gear: { weapons: blank(), echoes: blank(), mainstats: blank(), substats: blank() },
    cmp: { weapons: blank(), echoes: blank(), mainstats: blank(), substats: blank() }
  };
  sorted.forEach(([, run], i) => {
    run.members.forEach((m, pos) => {
      const combo = run.combo[pos];
      wide.name[pos] = widest(wide.name[pos], memberLabel(m, combo));
      wide.dpr[pos] = widest(wide.dpr[pos], dprFmt(run.bySlot.get(m.name) ?? 0, true));
      wide.dprAbbr[pos] = widest(wide.dprAbbr[pos], dprFmt(run.bySlot.get(m.name) ?? 0, false));
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
    wide.total = widest(wide.total, dprFmt(run.total, true));
    wide.totalAbbr = widest(wide.totalAbbr, dprFmt(run.total, false));
    wide.pct = widest(wide.pct, ranks[i].pct);
  });
  const ghostPos = (i, dpr) => `<div class="c name res"><span class="res-label">${esc(wide.name[i])}</span></div>` + (seqCmpAt(i) ? `<div class="c num slotcompare">${esc(wide.seqcmp[i])}</div>` : "") + (refCmpAt(i) ? `<div class="c num slotcompare">${esc(wide.refcmp[i])}</div>` : "") + GEAR_AXES.map((axis) => openAt[axis][i] ? `<div class="c option">${esc(wide.gear[axis][i])}</div><div class="c num slotcompare">${esc(wide.cmp[axis][i])}</div>` : "").join("") + (dprAt(i) ? `<div class="c num slotdpr">${esc(dpr[i])}</div>` : "");
  const ghostFor = (dpr, total) => `<div class="trow tghost" aria-hidden="true">` + ghostPos(0, dpr) + ghostPos(1, dpr) + ghostPos(2, dpr) + `<div class="c num total">${esc(total)}</div><div class="c num total baseline">${esc(wide.pct)}</div><div class="c gotodetail">view rotation<span class="arrow">\u203A</span></div></div>`;
  const ghost = (personalExact, teamExact) => ghostFor(personalExact ? wide.dpr : wide.dprAbbr, teamExact ? wide.total : wide.totalAbbr);
  tableView = { sorted, ranks, head, ghost, rowHtml, lines, extra };
  return `<main><div class="tclayout"><aside class="tcside">${comparisonFilters()}</aside><div class="tcbody"><h2 class="summary-label" id="teamCount">${fmt(sorted.length)} teams<span class="hint">Click on a Resonator to filter and compare sequences, weapons, echoes</span></h2><div class="tcwrap"><div class="tgrid${hueShown ? " hued" : ""}${dprExact.personal ? " personalexact" : ""}${dprExact.team ? " teamexact" : ""}" style="${gridStyle}">${head}${ghost(dprExact.personal, dprExact.team)}</div></div></div></div></main>`;
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
  const totals = sorted.map(([, run]) => run.total);
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
  grid.innerHTML = view.head + view.ghost(dprExact.personal, dprExact.team) + spacer(0, from) + body + spacer(to, n);
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
    side.style.width = `${room}px`;
  }
  side.style.maxHeight = stacked ? "" : `${main.clientHeight}px`;
  if (!stacked)
    side.style.width = "";
  side.style.marginBottom = stacked ? "" : `-${side.offsetHeight}px`;
  sideFit.disconnect();
  sideFit.observe(side);
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
  let queued = false;
  main.addEventListener("scroll", () => {
    if (queued)
      return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
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
  const column = e.target.closest(".c.dprhead")?.dataset.dpr;
  if (!column)
    return;
  dprExact[column] = !dprExact[column];
  document.querySelector(".tgrid")?.classList.toggle(`${column}exact`, dprExact[column]);
  drawWindow(true);
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
var hoverTimer;
var hoverAt = [0, 0];
document.addEventListener("mousemove", (e) => {
  hoverAt = [e.clientX, e.clientY];
});
document.addEventListener("mouseover", (e) => {
  const el = e.target.closest(".c.name.res");
  if (!el?.dataset.resonator || el.contains(e.relatedTarget))
    return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (document.querySelector(".ctxmenu") || !el.matches(":hover"))
      return;
    openNameMenu(el, hoverAt[0], hoverAt[1]);
  }, 1e3);
});
document.addEventListener("mouseout", (e) => {
  const el = e.target.closest(".c.name.res");
  if (el && !el.contains(e.relatedTarget))
    clearTimeout(hoverTimer);
});
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
    // the compares that opened this column lead, offered back as a way to close it — the same
    // shape a main-stat or substat cell's own menu has (`openStatMenu`)
    ...filters[axis].includes(resonator) ? [{ label: `Stop comparing ${word}`, run: () => setCompare(resonator, axis) }] : [],
    // the rank rides in this same cell, so this is where the whole rank axis is opened and closed
    ...kind === "weapon" && comparable(resonator, "refines") ? [{
      label: `${filters.refines.includes(resonator) ? "Stop comparing" : "Compare"} ${AXIS_LABEL.refines.toLowerCase()}`,
      run: () => setCompare(resonator, "refines")
    }] : [],
    ...filters.scoped.filter((s) => s.resonator === resonator && s.axis === axis).map((s) => ({ label: `Stop comparing ${scopedLabel(s)} ${word}`, run: () => setScoped(s) })),
    { label: `Show only ${base}`, run: () => setFilter(map, base, "include"), alt: () => setFilter(map, base, "exclude") },
    { label: `Hide ${base}`, run: () => setFilter(map, base, "exclude") },
    ...ranked ? [
      { label: `Show only ${key}`, run: () => setFilter(map, key, "include"), alt: () => setFilter(map, key, "exclude") },
      { label: `Hide ${key}`, run: () => setFilter(map, key, "exclude") }
    ] : [],
    ...resonator && kind === "weapon" ? scopedItems(resonator, "weapon", base) : [],
    ...resonator && ranked ? scopedItems(resonator, "weaponRank", key) : [],
    ...resonator && kind === "echo" ? scopedItems(resonator, "echo", key) : []
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
var addSearchHit = (e) => {
  const hit = searchPick(e);
  if (!hit)
    return;
  e.preventDefault();
  clearSearch();
  focusAfterDraw = null;
  applySearchHit(hit);
  focusSearch();
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
  clearSearch();
  focusAfterDraw = null;
  applySearchHit(hit);
  focusSearch();
});

// dist/src/page/detail.js
var app3 = document.getElementById("app");
var topbar2 = document.getElementById("topbar");
var BUFF_UNDERLINE_COLUMNS = /* @__PURE__ */ new Set(["mv", "energy", "concerto", "offtune"]);
var RUNNING_COLUMNS = /* @__PURE__ */ new Set(["concerto", "energy", "offtune"]);
var isRunning = (key) => RUNNING_COLUMNS.has(key) || key.startsWith("gauge:");
var colWidth = (c) => `calc(var(--cw) * ${c.width} + var(--cpad))`;
function cell(col, { cls = [], html = "", pop = "", style = "" } = {}) {
  const classes = ["c", col.align === "left" ? "" : "num", ...cls].filter(Boolean).join(" ");
  return `<span class="${classes}"${style ? ` style="${style}"` : ""}${pop}>${html}</span>`;
}
function stepRow(columns, row, slotHue, gearByMember, { part = false, caret = true } = {}) {
  return columns.map((col) => {
    const v = row.raw[col.key];
    const sources = row.sources[col.key];
    if (isRunning(col.key)) {
      if ("line" in row && row.line.aggregate)
        return cell(col);
      const before = Number(row.raw[`before:${col.key}`]) || 0;
      const fed = (sources ?? []).some((r) => r.section !== OFFTUNE_RATE && r.section !== ENERGY_RATE);
      if (!fed && Math.abs((Number(v) || 0) - before) < 1e-9)
        return cell(col);
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
    if (col.key === "concerto" && Number(row.raw["short:concerto"]))
      cls.push("underspent");
    if (col.key.startsWith("gauge:") && Number(row.raw[`short:${col.key}`]))
      cls.push("negative");
    const text = esc(fmt(v, digitsOf(row.raw, col), PAD_DIGITS_COLUMNS.has(col.key), GROUPED_COLUMNS.has(col.key))) + (col.percent && typeof v === "number" ? "%" : "") + gaugeSuffix(row.raw, col.key);
    let html = sources && text ? `<span class="has">${text}</span>` : text;
    if (col.key === "action" && caret && !part && "parts" in row && row.parts.length) {
      html = `${html}<span class="caret">\u25B8</span>`;
    }
    const suffix = col.key === "mv" && row.scaling !== null ? ` ${SCALING_NAME[row.scaling]}` : "";
    let pop = "";
    if (col.key === "action") {
      const group = "parts" in row && row.parts.length > 0;
      pop = group ? "" : infoPopover(row.info, slotHue);
    } else if (col.key === "member") {
      const snap = "line" in row ? row.line.snap : row.snap;
      const gear = gearByMember.get(snap.member) ?? [];
      pop = buffsPopover(snap.member, gear, snap.heldLocal, snap.heldGlobal, snap.heldEnemy, slotHue);
    } else if (text) {
      pop = popover(col, sources, row.raw[`moved:${col.key}`] ?? v, slotHue, suffix);
    }
    const mem = slotHue.get(String(v)) ?? FALLBACK_HUE;
    const style = col.key === "member" ? `--mem:${mem};color:${mem}` : col.key === "avg" ? `--mem:${slotHue.get(String(row.raw["member"] ?? "")) ?? FALLBACK_HUE}` : "";
    return cell(col, { cls, html, pop, style });
  }).join("");
}
function partRows(columns, parts, slotHue, gearByMember, fieldOf) {
  return parts.map((p) => {
    const hue = slotHue.get(String(p.raw.member)) ?? FALLBACK_HUE;
    const field = fieldOf.get(p.snap);
    const mark = field === void 0 ? "" : ` data-fh="${field}"`;
    return `<div class="r${p.short ? " short" : ""}" style="--m:${hue}"${mark}>${stepRow(columns, p, slotHue, gearByMember, { part: true })}</div>`;
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
    const hue = slotHue.get(snap.member) ?? FALLBACK_HUE;
    const style = ` style="--m:${hue}"`;
    const cells = stepRow(columns, row, slotHue, gearByMember);
    const shortCls = row.short ? " short" : "";
    const key = row.line.fieldKey;
    const mark = key === void 0 || row.line.aggregate ? "" : ` data-fh="${fieldId(key)}"`;
    if (row.line.aggregate) {
      closeBlock();
      const id2 = `fg${fieldId(key)}`;
      out.push(`<div class="step chain"${style}><input class="tgl" type="checkbox" id="${id2}"><label class="r${shortCls}" for="${id2}">${cells}</label></div>`);
      return;
    }
    if (row.line.spill && spilling) {
      if (row.parts.length) {
        const id2 = `x${i}`;
        out.push(`<div class="chain"${style}${mark}><input class="tgl" type="checkbox" id="${id2}"><label class="r${shortCls}" for="${id2}">${cells}</label><div class="parts">${partRows(columns, row.parts, slotHue, gearByMember, fieldOf)}</div></div>`);
        return;
      }
      out.push(`<div class="r${shortCls}"${style}${mark}>${stepRow(columns, row, slotHue, gearByMember, { caret: false })}</div>`);
      return;
    }
    closeBlock();
    if (!row.parts.length) {
      out.push(`<div class="step"${style}${mark}><div class="r${shortCls}">${cells}</div></div>`);
      return;
    }
    const id = `x${i}`;
    out.push(`<div class="step chain"${style}${mark}><input class="tgl" type="checkbox" id="${id}"><label class="r${shortCls}" for="${id}">${cells}</label><div class="parts">${partRows(columns, row.parts, slotHue, gearByMember, fieldOf)}</div><div class="spill">`);
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
      if (s.energyWiped)
        continue;
      const gain = (s.action.energy + s.stat(
        26
        /* Stat.AddEnergy */
      )) * (1 + s.stat(
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
function energySpan(flat, member2, fallback) {
  const casts = resetIndices(flat, 0, flat.length, member2);
  return casts.length < 2 ? fallback : [casts[casts.length - 2] + 1, casts[casts.length - 1]];
}
function energyGenerated(flat, member2, fallback) {
  const [from, to] = energySpan(flat, member2, fallback);
  let total = 0;
  for (let i = from; i < to; i++) {
    const line = flat[i];
    if (line.aggregate)
      continue;
    for (const snap of hitsOf(line)) {
      if (snap.member !== member2 || snap.energyWiped)
        continue;
      total += (snap.action.energy + snap.stat(
        26
        /* Stat.AddEnergy */
      )) * (1 + snap.stat(
        14
        /* Stat.EnergyRegenMult */
      ) / 100);
    }
  }
  return total;
}
function offtuneBuilt(flat, member2, [from, to]) {
  let total = 0;
  for (let i = from; i < to; i++) {
    const line = flat[i];
    if (line.aggregate)
      continue;
    for (const snap of hitsOf(line)) {
      if (snap.member !== member2)
        continue;
      const built = snap.action.offtune + snap.stat(
        28
        /* Stat.AddOfftune */
      );
      const direct = snap.stat(
        29
        /* Stat.DirectOfftune */
      );
      if (built > 0)
        total += built * (snap.stat(
          13
          /* Stat.OfftuneBuildup */
        ) / 100);
      if (direct > 0)
        total += direct;
    }
  }
  return total / 1e4;
}
function teamSources(flat, rows, member2, [from, to], field) {
  const rate = field === "energy" ? ENERGY_RATE : OFFTUNE_RATE;
  const by = /* @__PURE__ */ new Map();
  for (let i = from; i < to; i++) {
    const line = flat[i];
    const snap = line.snap;
    if (line.aggregate || snap.member !== member2 || field === "energy" && snap.energyWiped)
      continue;
    for (const r of rows[i]?.sources[field] ?? []) {
      if (!r.owner || r.owner === member2)
        continue;
      const key = `${r.source} ${r.section ?? ""}`;
      const seen = by.get(key);
      if (seen) {
        if (!r.mult && r.section !== rate) {
          seen.value += r.value;
          seen.count = (seen.count ?? 1) + (r.count ?? 1);
        }
      } else
        by.set(key, { ...r });
    }
  }
  return [...by.values()];
}
function teamSourcePopover(sources, slotHue) {
  if (!sources.length)
    return "";
  return lazyPop(`<span class="pop stat"><table><tr class="sec"><td colspan="2">Team sources</td></tr>${sources.map((r) => panelRow(r, slotHue)).join("")}</table></span>`);
}
function energyTable(run, lines, report, slotHue) {
  const erCol = columnOf(report, "er");
  const flat = lines.flat();
  const offsets = [0];
  for (const sec of lines)
    offsets.push(offsets[offsets.length - 1] + sec.length);
  const head = `<div class="rtrow rthead"><div class="c"></div><div class="c num">Opener</div><div class="c num">Loop 1</div><div class="c num">Loop 2</div><div class="c num">Loop 3</div><div class="c num">Energy Gen</div><div class="c num">Offtune Gen</div></div>`;
  const rows = run.members.map((m, idx) => {
    const maxEnergy = m.loadout.resonator.maxEnergy;
    const combo = run.combo[idx];
    const constantSources = menuStats(m.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs)).filter(
      (e) => e.stat === 11
      /* Stat.Er */
    );
    const constant = constantSources.reduce((n, e) => n + e.value, 0);
    const free = resetIndices(flat, 0, flat.length, m.name)[0] ?? null;
    const cell2 = (resetIdx) => {
      const snap = resetIdx == null || resetIdx === free ? null : flat[resetIdx].snap;
      const req = snap == null ? null : erRequirement(flat, resetIdx, m.name, maxEnergy, constant);
      const missing = req == null ? 0 : Math.max(0, req - constant);
      const text = req == null ? "\u2014" : `${fmt(req, 1)}%`;
      return `<div class="c num${missing > 0 ? " er-under" : ""}">${text}</div>`;
    };
    const erSources = constantSources.map((e) => ({ source: e.source, value: e.value, percent: true, digits: 1, owner: e.owner || m.name }));
    const erHover = erCol ? popover({ ...erCol, full: "Base Energy Regen" }, erSources, constant, slotHue) : "";
    const opener = resetIndices(flat, offsets[0], offsets[1], m.name);
    const lastLoop = [offsets[3], offsets[4]];
    const gen = energyGenerated(flat, m.name, lastLoop);
    const team = teamSourcePopover(teamSources(flat, report.rows, m.name, energySpan(flat, m.name, lastLoop), "energy"), slotHue);
    const offtune = offtuneBuilt(flat, m.name, lastLoop);
    const offtuneTeam = teamSourcePopover(teamSources(flat, report.rows, m.name, lastLoop, "offtune"), slotHue);
    const genCell = (value, hover) => `<div class="c num${hover ? " teamfed has" : ""}"${hover}>${fmt(value, 2, true)}</div>`;
    const cells = cell2(opener[opener.length - 1] ?? null) + [1, 2, 3].map((i) => cell2(resetIndices(flat, offsets[i], offsets[i + 1], m.name)[0] ?? null)).join("") + genCell(gen, team) + genCell(offtune, offtuneTeam);
    return `<div class="rtrow"><div class="c name${erHover ? " has" : ""}"${erHover} style="--mem:${m.color}">${esc(m.name)}</div>` + cells + `</div>`;
  }).join("");
  return `<div class="rtable energy">${head}${rows}</div>`;
}
function page(run) {
  const { report } = detailFor(run);
  const lines = run.rotationLines;
  const { members } = run;
  const slotHue = new Map([...members.map((m) => [m.name, m.color]), [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]]);
  const gearByMember = new Map(members.map((m, i) => [m.name, equippedGear(m, run.combo[i]).map(([, g]) => g)]));
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
      ${loadoutTable(run)}
    </div>
    <div class="rstack">
      <div class="rtable-block">
        <h2 class="summary-label">Damage Distribution</h2>
        ${dprTable(run, lines)}
      </div>
      <div class="rtable-block">
        <h2 class="summary-label">Energy Requirements</h2>
        ${energyTable(run, lines, report, slotHue)}
      </div>
    </div>
  </div>
  <h2 class="summary-label">Rotation</h2>
  ${rotationTable(report, slotHue, gearByMember, starts)}
</main>`;
}
function errorPage(err) {
  const hint = location.protocol === "file:" ? `This page was opened straight off disk. Browsers refuse to load ES modules or
       <code>fetch()</code> data over <code>file://</code>, so it has to be served \u2014 run
       <code>python -m http.server 8000</code> in this directory and open
       <code>http://localhost:8000/</code>.` : `The engine threw while running the team. The stack below points at the file to look at.`;
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  return `<div class="error">
  <h2>Could not run the team</h2>
  <p>${hint}</p>
  <pre>${esc(message)}</pre>
</div>`;
}
function renderDetail(key) {
  rememberTableScroll();
  topbar2.hidden = false;
  clearPops();
  const run = results.get(key);
  app3.innerHTML = page(run);
  app3.className = "";
  wireColumnDrag(app3, detailFor(run).report.columns);
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
  const grid = root.querySelector(".gridwrap .grid");
  const track = grid && trackBox(grid, selected);
  if (grid && track)
    selBox = columnBox(grid, track.left, track.width);
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
    drag = {
      key,
      nth: cells.indexOf(cell2) + 1,
      order: logOrder,
      width,
      home: offsets.get(key),
      span: [...width.values()].reduce((n, w) => n + w, 0),
      startX: e.clientX / zoom(),
      at: logOrder.indexOf(key)
    };
    lifted = false;
  });
  head.addEventListener("pointermove", (e) => {
    if (!drag)
      return;
    if (!lifted) {
      if (Math.abs(e.clientX / zoom() - drag.startX) < LIFT_AT)
        return;
      lifted = true;
      document.body.classList.add("coldrag");
      openDrag(head.parentElement, drag);
    }
    const w = drag.width.get(drag.key);
    const dx = Math.min(drag.span - w - drag.home, Math.max(-drag.home, e.clientX / zoom() - drag.startX));
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
  });
  const drop = () => {
    if (!drag)
      return;
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

// dist/src/index.js
var app4 = document.getElementById("app");
var backLink = document.getElementById("backLink");
var overlay = document.getElementById("loading");
var overlayStatus = overlay.querySelector(".status-text");
var overlayCount = overlay.querySelector(".progress-count");
var overlayFill = overlay.querySelector(".progress-fill");
var paint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
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
var OVERLAY_ROWS = 200;
async function overlayNow(text, rows = Infinity) {
  overlayPhase(text, rows >= OVERLAY_ROWS);
  await paint();
}
function overlayHide() {
  clearTimeout(overlayTimer);
  overlayTimer = void 0;
  overlay.hidden = true;
}
function barReset() {
  overlayFill.style.width = "0%";
  overlayCount.textContent = "";
}
function barProgress(done, total) {
  overlayFill.style.width = `${total ? done / total * 100 : 100}%`;
  overlayCount.textContent = `${fmt(done)} / ${fmt(total)}`;
}
var lastPaint = performance.now();
async function breathe() {
  if (performance.now() - lastPaint <= 50)
    return;
  await paint();
  lastPaint = performance.now();
}
async function runMissing(rows) {
  const missing = rows.filter((row) => !results.has(row.key));
  if (!missing.length)
    return;
  overlayPhase("Running Rotations\u2026", true);
  const cached = rows.length - missing.length;
  barProgress(cached, rows.length);
  for (let i = 0; i < missing.length; i++) {
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
function workerPool() {
  if (poolTried)
    return pool;
  poolTried = true;
  const want = Math.max(1, Math.min(WORKER_LIMIT, (navigator.hardwareConcurrency || 4) - 1));
  try {
    pool = Array.from({ length: want }, () => new Worker(new URL(`./solver.js?v=${Date.now()}`, import.meta.url), { type: "module" }));
  } catch (err) {
    console.warn("Workers unavailable, optimizing on the main thread instead:", err);
    pool = null;
  }
  return pool;
}
function solveOnWorkers(workers, teams, onDone, onShare) {
  return new Promise((resolve) => {
    let next = 0, live = 0, id = 0;
    const pump = (w) => {
      if (next >= teams.length) {
        if (--live === 0)
          resolve();
        return;
      }
      const [key, members] = teams[next++];
      const known = picksCache.get(picksKey(key, members, filters)) ?? null;
      const finish = (solved) => {
        storeSolved(key, solved);
        onDone(members);
        pump(w);
      };
      w.onmessage = ({ data }) => {
        if (isProgress(data)) {
          onShare?.(members, data.share);
          return;
        }
        const solved = { picks: data.picks, rows: data.rows, scores: data.scores, hidden: data.hidden ?? [], hiddenScores: data.hiddenScores ?? [] };
        if (solveFits(bestKey(key, members, filters), solved)) {
          finish(solved);
          return;
        }
        console.warn(`worker's solve for ${key} does not fit this build; solving it here`);
        finish(solveTeam(key, members, filters, known));
      };
      w.onerror = (e) => {
        console.warn(`worker failed on ${key}, solving it here:`, e.message);
        e.preventDefault();
        finish(solveTeam(key, members, filters, known));
      };
      const request = { id: id++, teamKey: key, filters, picks: known };
      w.postMessage(request);
    };
    for (const w of workers.slice(0, teams.length)) {
      live++;
      pump(w);
    }
    if (live === 0)
      resolve();
  });
}
async function ensureBestPicks(inPlay) {
  await loadShipped(filters);
  const teams = inPlay.filter(([key, members]) => !bestPicks.has(bestKey(key, members, filters)));
  if (!teams.length)
    return false;
  const rowsOf = (members) => members.every((m) => hasBuild(m, filters)) ? estimatedRowCount(members) : 0;
  const solvable = teams.filter(([, members]) => members.every((m) => hasBuild(m, filters))).map((t) => [t, rowsOf(t[1])]).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  if (!solvable.length)
    return false;
  const total = solvable.reduce((n, [, members]) => n + rowsOf(members), 0);
  await overlayNow("Running Calculations...");
  let done = 0;
  const progress = () => barProgress(done, total);
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
  const pool2 = workerPool();
  if (pool2)
    await solveOnWorkers(pool2, solvable, (members) => share(members, 1), share);
  else {
    for (const [key, members] of solvable) {
      const known = picksCache.get(picksKey(key, members, filters)) ?? null;
      storeSolved(key, solveTeam(key, members, filters, known, (part) => share(members, part)));
      share(members, 1);
      await breathe();
    }
  }
  await paint();
  return true;
}
var tableRequested = false;
var route = () => {
  const key = routeTeam();
  if (key) {
    renderDetail(key);
    return;
  }
  if (!tableRequested) {
    void refresh2();
    return;
  }
  renderComparison();
};
async function refresh2() {
  tableRequested = true;
  barReset();
  try {
    const inPlay = Object.entries(TEAMS).filter(([, members]) => teamWanted(members));
    if (inPlay.some(([key, members]) => !bestPicks.has(bestKey(key, members, filters))))
      workerPool();
    if (!visibleRows.length)
      route();
    await ensureBestPicks(inPlay);
    saveSolves();
    const rows = teamRows();
    const cached = rows.filter((row) => results.has(row.key));
    const missing = cached.length !== rows.length;
    if (!missing && cached.length) {
      await overlayNow("Rendering Table...", rows.length);
      barProgress(rows.length, rows.length);
      setVisibleRows(cached);
      route();
    } else if (!missing) {
      setVisibleRows([]);
      route();
    }
    await runMissing(rows);
    if (missing) {
      await overlayNow("Rendering Table\u2026", rows.length);
      setVisibleRows(rows);
      route();
    }
  } catch (err) {
    if (discardRestoredSolves()) {
      console.warn("restored solves failed to load; solving the roster here instead", err);
      setVisibleRows([]);
      await refresh2();
      return;
    }
    console.error(err);
    app4.innerHTML = errorPage(err);
    app4.className = "";
  }
  overlayHide();
}
async function bootDetail() {
  const key = hashParams().get("team");
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
    const key = hashParams().get("team");
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
boot().catch((err) => {
  console.error(err);
  app4.innerHTML = errorPage(err);
  app4.className = "";
  const box = overlay.querySelector(".loading-error");
  if (box) {
    box.hidden = false;
    box.textContent += `${box.textContent ? "\n\n" : ""}${err instanceof Error ? err.stack ?? err.message : String(err)}`;
    overlay.hidden = false;
  }
});
