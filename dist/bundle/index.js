import {
  ALL_TEAMS,
  BASE_RESISTANCE,
  CAST_NAME,
  DODGE,
  JUMP,
  MAINSTAT_ROWS,
  NODE_NAME,
  RESOURCE_NAME,
  SCALING_NAME,
  SWAP,
  TAG_NAME,
  TUNE_BREAK_ENEMY,
  baseSequence,
  bestKey,
  comboOf,
  damageFactors,
  defaultFilters,
  effectiveRes,
  effectiveShred,
  eligibleWeapons,
  isCast,
  isPercent,
  member,
  menuStats,
  mvPercent,
  picksKey,
  runFromScore,
  runTeam,
  scopedStat,
  sequenceLevels,
  solveTeam,
  splitStat,
  statLabel,
  tagKind,
  teamKey
} from "./chunk-4BVDWXFI.js";

// dist/src/display.js
var keysFor = (action, ...stats) => stats.flatMap((stat) => [
  stat,
  ...[action.element, action.type, action.type2].filter((tag) => tag !== null).map((tag) => scopedStat(tag, stat))
]);
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
  cr: (a) => special(a) ? [] : keysFor(
    a,
    9
    /* Stat.CritRate */
  ),
  cd: (a) => special(a) ? [] : keysFor(
    a,
    10
    /* Stat.CritDmg */
  ),
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
    19
    /* Stat.TotalDmg */
  ),
  // what is being done to the enemy rather than to the resonator
  effDef: (a) => fixed(a) ? [] : a.scaling === 3 ? keysFor(
    a,
    35
    /* EnemyStat.DefReduce */
  ) : keysFor(
    a,
    21,
    22,
    35
    /* EnemyStat.DefReduce */
  ),
  effRes: (a) => a.scaling === 3 ? keysFor(
    a,
    34
    /* EnemyStat.ResReduce */
  ) : fixed(a) ? [] : keysFor(
    a,
    20,
    34
    /* EnemyStat.ResReduce */
  )
  // energy/concerto/offtune are NOT built off this — they're running totals, not a per-action
  // sum, so rowValues() builds their own panel by hand further down, off RESOURCE_STAT instead.
};
var special = (action) => action.scaling === 3 || action.scaling === 4 || action.scaling === 5;
var fixed = (action) => action.scaling === 5;
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
  // the ignore and res panels, split the same way: the attacker's own two penetrations answer to
  // different rules from the enemy's own debuff (only the debuff survives a dot, and the two DEF
  // ignores don't even stack the same way), so a panel that ran them together as one list of
  // percentages read as if they did.
  [
    21
    /* Stat.DefIgnoreNew */
  ]: "DEF Ignore (new)",
  [
    22
    /* Stat.DefIgnoreOld */
  ]: "DEF Ignore (old)",
  [
    35
    /* EnemyStat.DefReduce */
  ]: "DEF Reduce",
  [
    20
    /* Stat.ResIgnore */
  ]: "RES Ignore",
  [
    34
    /* EnemyStat.ResReduce */
  ]: "RES Reduce"
};
var actionInfo = (action, type, triggered = false, triggeredBy = null) => {
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
  push("Active", String(action.active));
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
function tracing(snapshot, stats) {
  const wanted = new Set(stats);
  const by = /* @__PURE__ */ new Map();
  for (const e of snapshot.entries) {
    if (!wanted.has(e.stat))
      continue;
    const key = `${e.source} ${e.stat}`;
    const seen = by.get(key);
    if (seen)
      seen.value += e.value;
    else {
      const [stat, tag] = splitStat(e.stat);
      const base = e.source === BASE_RESISTANCE.name;
      by.set(key, {
        source: e.source ?? "",
        stat: e.stat,
        value: e.value,
        section: base ? "Base RES" : SECTION_OF[stat] ?? (tag === null ? null : statLabel(e.stat)),
        owner: e.owner ?? null
      });
    }
  }
  return [...by.values()].sort((a, b) => tagRank(a.stat ?? 0) - tagRank(b.stat ?? 0));
}
function columnSources(snapshot, key) {
  const feeds = FEEDS[key];
  return feeds ? tracing(snapshot, feeds(snapshot.action)) : [];
}
var columnOf = (report, key) => report.columns.find((c) => c.key === key);
var num = (v, digits = 0, pad = false, group = false) => v == null ? "" : v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: pad ? digits : 0, useGrouping: group });
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
  "effDef"
]);
var GROUPED_COLUMNS = /* @__PURE__ */ new Set(["avg"]);
var FORTE_GAUGES = [
  3,
  4,
  5,
  6,
  7
  /* Resource.Forte5 */
];
var RESOURCE_SCALE = { energy: 1, concerto: 1, offtune: 1e4 };
var PART_PREFIX = "  \xB7 ";
var TOTAL_LABEL = "team total";
var COMBINED_COLUMNS = [
  "mv",
  "energy",
  "concerto",
  "offtune",
  ...FORTE_GAUGES.map((key) => `gauge:${RESOURCE_NAME[key]}`)
];
function foldDuplicates(rows) {
  const out = [];
  const at = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = `${row.source}\0${row.section ?? ""}\0${row.label ?? ""}\0${row.stat ?? ""}\0${row.owner ?? ""}\0${row.place ?? ""}\0${row.mult ? 1 : 0}`;
    const seen = at.get(key);
    if (!seen) {
      const copy = { ...row };
      at.set(key, { row: copy, n: 1 });
      out.push(copy);
      continue;
    }
    seen.n++;
    if (!row.mult)
      seen.row.value += row.value;
    seen.row.source = `${row.source} x${seen.n}`;
  }
  return out;
}
var OFFTUNE_RATE = "Buildup Rate";
var ENERGY_RATE = "Regen Multiplier";
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
    dmgBonus: filler || special(snap.action) ? null : snap.dmgBonus,
    amp: filler || fixed(snap.action) ? null : snap.action.scaling === 4 ? null : snap.action.scaling === 3 ? snap.type2Amp : snap.amp,
    cr: filler || special(snap.action) ? null : snap.stat(
      9
      /* Stat.CritRate */
    ),
    cd: filler || special(snap.action) ? null : snap.stat(
      10
      /* Stat.CritDmg */
    ),
    dealt: filler || snap.action.scaling === 3 || fixed(snap.action) ? null : snap.stat(
      19
      /* Stat.TotalDmg */
    ),
    // what the hit actually meets: how much of the enemy's defence is stripped away by ignore
    // and reduce (0% = untouched), and the resistance left after ignore and shred — both read
    // straight off the resolved snapshot's own enemyDef/enemyRes.
    effDef: filler || fixed(snap.action) ? null : effectiveShred(snap) * 100,
    effRes: filler || fixed(snap.action) ? null : effectiveRes(snap),
    er: snap.stat(
      11
      /* Stat.Er */
    ),
    // real running totals — evaluate.ts's own evaluate() banks these every action, off however much
    // AddEnergy/AddConcerto/AddOfftune this action's own held Gear contributed. Energy/concerto
    // are already stored at nanoka's own scale; only off-tune's own raw unit runs finer than the
    // game's own displayed off-tune bar (/10000), purely a display scale — RESOURCE_SCALE below
    // is the single place that ratio lives.
    energy: snap.energy / RESOURCE_SCALE.energy,
    concerto: snap.concerto / RESOURCE_SCALE.concerto,
    offtune: snap.offtune / RESOURCE_SCALE.offtune,
    // what each held coming in, same scale — the running-column blanking reads these rather than
    // the previous row, so an opened group's own members blank like any other row (see stepRow)
    "before:energy": snap.energyBefore / RESOURCE_SCALE.energy,
    "before:concerto": snap.concertoBefore / RESOURCE_SCALE.concerto,
    "before:offtune": snap.offtuneBefore / RESOURCE_SCALE.offtune,
    avg: dealsDamage ? avg : null
  };
  FORTE_GAUGES.forEach((key, i) => {
    raw[`gauge:${RESOURCE_NAME[key]}`] = snap.forte[i];
    raw[`before:gauge:${RESOURCE_NAME[key]}`] = snap.forteBefore[i];
  });
  raw.concertoSpent = snap.concertoSpent;
  raw.isOutro = isCast(
    snap.action,
    7
    /* Cast.Outro */
  ) ? 1 : 0;
  const sources = {};
  for (const [key, feeds] of Object.entries(FEEDS)) {
    if (key === "energy" || key === "concerto" || key === "offtune")
      continue;
    sources[key] = tracing(snap, feeds(snap.action));
  }
  sources.effRes = (sources.effRes ?? []).map((r) => ({ ...r, value: -r.value }));
  const RESOURCE_STAT = {
    energy: [
      25
      /* Stat.AddEnergy */
    ],
    concerto: [
      26
      /* Stat.AddConcerto */
    ],
    offtune: [
      27
      /* Stat.AddOfftune */
    ]
  };
  const RESOURCE_DIGITS = { energy: 2, concerto: 2, offtune: 4 };
  for (const key of ["energy", "concerto", "offtune"]) {
    const wiped = key === "energy" && snap.energyWiped;
    const declared = wiped ? 0 : snap.action[key] / RESOURCE_SCALE[key];
    const traced = wiped ? [] : RESOURCE_STAT[key].flatMap((st) => tracing(snap, keysFor(snap.action, st))).map((r) => ({ ...r, value: r.value / RESOURCE_SCALE[key] }));
    const rows = [];
    const digits = RESOURCE_DIGITS[key];
    if (declared)
      rows.push({ source: snap.action.name, value: declared, digits, owner: snap.member });
    rows.push(...traced.map((r) => ({ ...r, digits })));
    if (rows.length || wiped)
      sources[key] = rows;
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
    27
    /* Stat.AddOfftune */
  )).reduce((n, r) => n + r.value, 0);
  if (buildingOfftune > 0) {
    const rate = tracing(snap, keysFor(
      snap.action,
      13
      /* Stat.OfftuneBuildup */
    ));
    if (rate.length) {
      sources.offtune = [
        ...sources.offtune ?? [],
        ...rate.map((r) => ({ ...r, section: OFFTUNE_RATE, digits: 2 }))
      ];
    }
  }
  const direct = tracing(snap, keysFor(
    snap.action,
    28
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
    29,
    30,
    31,
    32,
    33
    /* Stat.AddForte5 */
  ];
  FORTE_GAUGES.forEach((key, i) => {
    const declared = snap.action[FORTE_FIELD[i]];
    const traced = tracing(snap, keysFor(snap.action, FORTE_STAT[i]));
    const rows = [];
    if (declared)
      rows.push({ source: snap.action.name, value: declared, digits: 0, owner: snap.member });
    rows.push(...traced.map((r) => ({ ...r, digits: 0 })));
    if (rows.length)
      sources[`gauge:${RESOURCE_NAME[key]}`] = rows;
    raw[`moved:gauge:${RESOURCE_NAME[key]}`] = rows.reduce((n, r) => n + r.value, 0);
  });
  if (!raw.mv)
    delete sources.mv;
  else {
    const isFactor = (r) => r.stat !== void 0 && splitStat(r.stat)[0] === 16;
    const parts = sources.mv ?? [];
    if (parts.length)
      buffed.add("mv");
    sources.mv = [
      { source: snap.action.name, label: "Base MV", value: snap.action.mv, percent: true, owner: snap.member },
      ...parts.filter((r) => !isFactor(r)),
      ...parts.filter((r) => isFactor(r))
    ];
  }
  for (const [key, [baseStat, bonusStat, flatStat]] of [
    ["atk", [
      0,
      6,
      3
      /* Stat.FlatAtk */
    ]],
    ["hp", [
      1,
      7,
      4
      /* Stat.FlatHp */
    ]],
    ["def", [
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
    sources[key] = [...traced, {
      source: "",
      label: "Relative",
      value: (sum(flatStat) + sum(bonusStat) / 100 * base) / base * 100,
      percent: true,
      place: "beforeTotal",
      digits: 2,
      summary: true
    }];
  }
  if (members.length > 1) {
    const per = members.map((m) => rowValues(m, { mv: mvPercent(m), avg: 0 }));
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
      // Only tune scaling receives it, and only tune scaling should have to read a row about it.
      ...f.scaling === 4 ? [{ source: "buffs", label: "Tune Break Boost", value: f.tbbFactor, mult: true }] : [],
      ...f.dealtFactor > 1 ? [{ source: "buffs", label: "Total Damage", value: f.dealtFactor, mult: true }] : [],
      { source: "enemy", label: "Res Factor", value: f.resFactor, mult: true },
      { source: "enemy", label: "Def Factor", value: f.defFactor, mult: true },
      { source: "crit", label: "Average Crit", value: f.critFactor, mult: true }
    ];
  return { raw, sources, buffed };
}
function buildReport(lines, { strip = null } = {}) {
  const columns = [
    { key: "member", label: "member", align: "left" },
    { key: "action", label: "action", align: "left" },
    { key: "avg", label: "avg dmg", full: "Final Damage" },
    // `percent` marks a column whose value is a ratio in percent units rather than a flat
    // amount. atk/hp/def are not: they are totals in whole points, even though percent stats
    // fed them — and `def` is the resonator's own, not `effDef`'s enemy-side multiplier.
    { key: "mv", label: "mv%", digits: 2, percent: true, full: "Motion Value" },
    { key: "atk", label: "atk" },
    { key: "dmgBonus", label: "dmg%", digits: 1, percent: true, full: "Dmg Bonus" },
    { key: "amp", label: "amp%", digits: 1, percent: true, full: "Amplification" },
    { key: "cr", label: "cr%", digits: 1, percent: true, full: "Crit Rate" },
    { key: "cd", label: "cd%", digits: 1, percent: true, full: "Crit Dmg" },
    { key: "dealt", label: "vuln%", digits: 1, percent: true, full: "Total Damage" },
    // what the hit meets on the enemy's side, kept next to the multipliers it competes with
    // rather than out past the resonator's own hp/def
    // `full` is the heading its panel opens with when nothing fed the column at all — the
    // attacker's own penetration is what that answers for, not the enemy's own DEF
    { key: "effDef", label: "ignore%", digits: 1, percent: true, full: "DEF Ignore", fullEmpty: "DEF Shred" },
    { key: "effRes", label: "res%", digits: 1, percent: true, full: "Enemy RES" },
    { key: "er", label: "er%", digits: 1, percent: true, full: "Energy Regen" },
    { key: "hp", label: "hp" },
    { key: "def", label: "def" },
    // digits matches nanoka's own table precision: energy/concerto never need more than 2 decimal
    // places, offtune's own /10000 scale-down (RESOURCE_SCALE above) never needs more than 4 —
    // always padded to that many (PAD_DIGITS_COLUMNS above), not just capped. The forte gauges
    // aren't scaled at all, so they stay whole numbers.
    { key: "concerto", label: "concerto", digits: 2, hideIfZero: true, full: "Concerto" },
    { key: "energy", label: "energy", digits: 2, hideIfZero: true, full: "Energy" },
    { key: "offtune", label: "offtune", digits: 4, hideIfZero: true, full: "OffTune" },
    ...FORTE_GAUGES.map((key) => ({
      key: `gauge:${RESOURCE_NAME[key]}`,
      label: RESOURCE_NAME[key],
      hideIfZero: true,
      full: RESOURCE_NAME[key]
    }))
  ];
  const name = (id) => strip ? id.replace(strip, "") : id;
  const isShort = (snap) => snap.triggered;
  const isShortLine = (line) => line.members?.length ? line.members.every(isShort) : isShort(line.snap);
  const rows = lines.map((line) => {
    const { raw, sources, buffed } = rowValues(line.snap, { mv: line.mv, avg: line.avg }, line.members ?? []);
    raw.action = name(line.id);
    return {
      line,
      raw,
      sources,
      buffed,
      // what the action *is*, for the hover on its name. A chain takes it from the part whose
      // stats it is reporting, the same part every other value on the row comes from.
      // `snap.type`, not `action.type`: the type it was actually evaluated as (evaluate.ts's typeOverride)
      info: actionInfo(line.snap.action, line.snap.type, line.snap.triggered, line.snap.triggeredBy),
      // what the motion value is multiplying, so the mv panel can name its own unit
      scaling: line.snap.action.scaling,
      short: isShortLine(line),
      parts: line.isChain ? line.parts.map((p) => {
        const part = rowValues(p.snap, { mv: mvPercent(p.snap), avg: p.dmg.avg });
        part.raw.action = name(p.snap.action.name);
        part.info = actionInfo(p.snap.action, p.snap.type, p.snap.triggered, p.snap.triggeredBy);
        part.type = p.snap.type;
        part.scaling = p.snap.action.scaling;
        part.isShown = p.snap === line.snap;
        part.snap = p.snap;
        part.short = isShort(p.snap);
        return part;
      }) : []
    };
  });
  const moved = (r, key) => Math.abs(Number(r.raw[key]) || 0) > 1e-9;
  const used = columns.filter((c) => !c.hideIfZero || rows.some((r) => moved(r, c.key) || r.parts.some((p) => moved(p, c.key))));
  const shown = (r, c) => {
    const v = r.raw[c.key];
    return typeof v === "number" ? num(v, c.digits ?? 0, PAD_DIGITS_COLUMNS.has(c.key), GROUPED_COLUMNS.has(c.key)) + (c.percent ? "%" : "") : String(v ?? "");
  };
  const sized = used.map((c) => {
    const lens = [c.label.length, ...c.key === "action" ? [TOTAL_LABEL.length] : []];
    for (const r of rows) {
      lens.push(shown(r, c).length);
      for (const p of r.parts) {
        lens.push(shown(p, c).length + (c.key === "action" ? PART_PREFIX.length : 0));
      }
    }
    return { ...c, width: Math.max(...lens) + 1 };
  });
  return {
    columns: sized,
    rows,
    total: rows.reduce((n, r) => n + (r.line.aggregate ? 0 : Number(r.raw.avg) || 0), 0)
  };
}

// dist/src/index.js
var TEAMS = Object.fromEntries(ALL_TEAMS.map(({ loadouts, dpsIndex }, i) => [
  teamKey(i),
  loadouts.map((l, j) => member(l, j === dpsIndex))
]));
var resonatorFilters = new Map([].map((name) => [name, "exclude"]));
var weaponFilters = /* @__PURE__ */ new Map();
var echoFilters = /* @__PURE__ */ new Map();
var mainstatFilters = /* @__PURE__ */ new Map();
var sequenceFilters = /* @__PURE__ */ new Map();
var OPTION_FILTER_MAPS = {
  weapon: weaponFilters,
  echo: echoFilters,
  mainstat: mainstatFilters,
  sequence: sequenceFilters
};
var searchText = "";
var filters = defaultFilters();
var ROW_CAP = 1e3;
function focusSearch() {
  const search = document.querySelector("#optionSearch");
  if (!search)
    return;
  search.focus({ preventScroll: true });
  search.setSelectionRange(search.value.length, search.value.length);
}
function clearSearch() {
  searchText = "";
  const input = document.querySelector("#optionSearch");
  if (input)
    input.value = "";
  const box = document.getElementById("searchResults");
  if (box)
    box.innerHTML = "";
}
function rowCapWarning(total) {
  const el = document.getElementById("rowCapWarning");
  if (!el)
    return;
  el.hidden = total === null;
  if (total !== null)
    el.textContent = `That would open ${fmt(total)} rows, which is over the ${fmt(ROW_CAP)} cap. Try clicking a specific resonator to apply a filter.`;
}
var bestPicks = /* @__PURE__ */ new Map();
var picksCache = /* @__PURE__ */ new Map();
function storeSolved(teamKey2, solved) {
  bestPicks.set(bestKey(teamKey2, TEAMS[teamKey2], filters), solved);
  picksCache.set(picksKey(teamKey2, TEAMS[teamKey2], filters), solved.picks);
  solvesDirty = true;
}
var SOLVES_KEY = "wuwa.solves.v1";
var buildStamp = null;
var solvesDirty = false;
var shippedStates = null;
var shippedFetched = /* @__PURE__ */ new Set();
var shippedKeys = /* @__PURE__ */ new Set();
var filterSignature = (f) => Object.values(f).join(",");
async function loadShipped(f) {
  const sig = filterSignature(f);
  if (!shippedStates || shippedFetched.has(sig))
    return;
  shippedFetched.add(sig);
  const file = shippedStates[sig];
  if (!file)
    return;
  try {
    const res = await fetch(`./solves/${file}`, { cache: "no-store" });
    if (!res.ok)
      return;
    const saved = await res.json();
    for (const [k, v] of saved.solves)
      if (!bestPicks.has(k)) {
        bestPicks.set(k, v);
        shippedKeys.add(k);
      }
    for (const [k, v] of saved.picks)
      if (!picksCache.has(k))
        picksCache.set(k, v);
  } catch {
  }
}
async function loadSolves() {
  const restore = (saved) => {
    if (saved.stamp !== buildStamp)
      return;
    for (const [k, v] of saved.solves)
      bestPicks.set(k, v);
    for (const [k, v] of saved.picks)
      picksCache.set(k, v);
  };
  try {
    const live = await fetch("/__livereload", { cache: "no-store" }).catch(() => null);
    if (live?.ok)
      buildStamp = await live.text();
    else {
      const idx = await fetch("./solves/index.json", { cache: "no-store" });
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
var teamWanted = (members) => [...resonatorFilters].every(([name, mode]) => members.some((m) => m.name === name) === (mode === "include"));
function echoLines(l, echo) {
  const showMainslot = l.echoLoadouts.some((e) => e.sonata === echo.sonata && e.mainslot !== echo.mainslot);
  const lines = echo.sets.map((g) => g.name);
  if (showMainslot)
    lines[0] = `${lines[0]} (${echo.mainslot.name})`;
  return lines;
}
var echoLabel = (l, echo) => echoLines(l, echo).join(" + ");
function sequenceTagAt(m, sequence, f = filters) {
  const open = f[m.mainDps ? "mdpsSequences" : "supportSequences"];
  if (!open || sequence <= baseSequence(m.loadout.resonator))
    return null;
  return `${m.name} S${sequence}`;
}
var sequenceTag = (m, combo) => sequenceTagAt(m, combo.sequence);
function rowWanted(row) {
  const named = (map, names) => [...map].every(([name, mode]) => names.includes(name) === (mode === "include"));
  return named(weaponFilters, row.combo.map((c) => c.weapon.name)) && named(echoFilters, row.combo.map((c, i) => echoLabel(row.members[i].loadout, c.echo))) && named(mainstatFilters, row.combo.map((c) => c.mainstat.name)) && named(sequenceFilters, row.combo.flatMap((c, i) => sequenceTag(row.members[i], c) ?? []));
}
function expandTeam(teamKey2, members) {
  const solved = bestPicks.get(bestKey(teamKey2, members, filters));
  if (!solved || !teamWanted(members))
    return [];
  const rows = /* @__PURE__ */ new Map();
  solved.rows.forEach((picks, r) => {
    const combo = picks.map((p, i) => comboOf(members[i].loadout, p));
    const key = `${teamKey2}-${combo.map((c) => c.key).join("-")}`;
    if (rows.has(key))
      return;
    rows.set(key, { key, teamKey: teamKey2, members, combo });
    const score = solved.scores[r];
    if (score && !results.has(key))
      results.set(key, runFromScore(teamKey2, members, combo, score));
  });
  return [...rows.values()].filter(rowWanted);
}
var teamRows = () => Object.entries(TEAMS).flatMap(([key, members]) => expandTeam(key, members));
function axisWays(lists, map, cap = Infinity) {
  const excluded = [...map].filter(([, mode]) => mode === "exclude").map(([n]) => n);
  const sizes = (drop) => lists.map((l) => l === null ? 1 : l.filter((n) => !drop.includes(n)).length);
  const product = (drop) => sizes(drop).reduce((p, n) => p * Math.min(cap, n), 1);
  const untestable = lists.includes(null) || sizes(excluded).some((n) => n > cap);
  const included = untestable ? [] : [...map].filter(([, mode]) => mode === "include").map(([n]) => n);
  let total = 0;
  for (let mask = 0; mask < 1 << included.length; mask++) {
    const banned = included.filter((_, k) => mask & 1 << k);
    total += (banned.length % 2 ? -1 : 1) * product([...excluded, ...banned]);
  }
  return total;
}
function estimatedRowCount(members, f = filters) {
  const openFor = (m, mdpsKey, supportKey) => f[m.mainDps ? mdpsKey : supportKey];
  return axisWays(members.map((m) => openFor(m, "mdpsWeapons", "supportWeapons") ? eligibleWeapons(m, f).map((i) => m.loadout.weapons[i].name) : null), weaponFilters) * axisWays(members.map((m) => openFor(m, "mdpsEchoes", "supportEchoes") ? m.loadout.echoLoadouts.map((e) => echoLabel(m.loadout, e)) : null), echoFilters) * axisWays(members.map((m) => openFor(m, "mdpsMainstats", "supportMainstats") ? m.loadout.mainstats.map((g) => g.name) : null), mainstatFilters, MAINSTAT_ROWS) * axisWays(members.map((m) => sequenceLevels(m, f).map((level) => sequenceTagAt(m, level, f) ?? "")), sequenceFilters);
}
function prospectiveRows(f = filters) {
  return Object.entries(TEAMS).filter(([, members]) => teamWanted(members)).reduce((sum, [, members]) => sum + estimatedRowCount(members, f), 0);
}
function withRowCap(change) {
  const undo = change();
  const total = prospectiveRows();
  if (total > ROW_CAP) {
    undo();
    rowCapWarning(total);
    return;
  }
  rowCapWarning(null);
  syncHash();
  void refresh();
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
    const parsed = /^(\d+)\.(\d+)\.(\d+)\.s(\d+)(\.m)?$/.exec(comboKeys[i]);
    if (!parsed)
      return null;
    const l = members[i].loadout;
    const pick = { weapon: +parsed[1], echo: +parsed[2], mainstat: +parsed[3], sequence: +parsed[4], matrix: !!parsed[5] };
    if (!l.weapons[pick.weapon] || !l.echoLoadouts[pick.echo] || !l.mainstats[pick.mainstat] || pick.matrix && !l.matrix)
      return null;
    combo.push(comboOf(l, pick));
  }
  return { key, teamKey: teamKey2, members, combo };
}
var RESONATOR_HUE = new Map(ALL_TEAMS.flatMap((t) => t.loadouts).map((l) => [l.resonator.name, l.resonator.color]));
var FALLBACK_HUE = "#ff0000";
var GEAR_SECTION_ENABLED = false;
function detailFor(run) {
  if (run.detail)
    return run.detail;
  const lines = run.rotationLines ?? runTeam(run.teamKey, run.members, run.combo, true).rotationLines;
  run.rotationLines = lines;
  run.detail = { report: buildReport(lines.flat()) };
  return run.detail;
}
var esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
var PAD_DIGITS_COLUMNS2 = /* @__PURE__ */ new Set([
  "energy",
  "concerto",
  "offtune",
  "mv",
  "dmgBonus",
  "amp",
  "cr",
  "cd",
  "dealt",
  "effDef"
]);
var GROUPED_COLUMNS2 = /* @__PURE__ */ new Set(["avg"]);
var BUFF_UNDERLINE_COLUMNS = /* @__PURE__ */ new Set(["mv", "energy", "concerto", "offtune"]);
var colWidth = (c) => `calc(var(--cw) * ${c.width} + var(--cpad))`;
function cell(columns, index, { cls = [], html = "", pop = "", style = "" }) {
  const classes = ["c", columns[index].align === "left" ? "" : "num", ...cls].filter(Boolean).join(" ");
  return `<span class="${classes}"${style ? ` style="${style}"` : ""}${pop}>${html}</span>`;
}
var lazyPop = (html) => html ? ` data-pop='${html.replace(/&/g, "&amp;").replace(/'/g, "&#39;")}'` : "";
var deferredPop = (kind, key) => ` data-pop-kind="${kind}" data-pop-key="${esc(key)}"`;
function buildPop(kind, key) {
  if (kind === "dpr") {
    const run = results.get(key);
    return run ? `<span class="pop dpr">${dprTable(run)}</span>` : "";
  }
  if (kind === "gear") {
    const at = key.lastIndexOf("|");
    const run = results.get(key.slice(0, at));
    const src = Number(key.slice(at + 1));
    return run ? gearPopoverHtml(run.members[src], run.combo[src]) : "";
  }
  return "";
}
var unit = (r) => r.percent ?? (r.stat !== void 0 ? isPercent(r.stat) : false) ? "%" : "";
var SECTION_ORDER = ["base", "bonus", "flat"];
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
  const value = `<td class="v">${r.mult ? `&times;${fmt(r.value, r.digits ?? 4)}` : `${fmt(r.value, r.digits ?? 4)}${unit(r)}`}</td>`;
  if (r.summary)
    return `<tr class="sum"><td class="k">${esc(label)}</td>${value}</tr>`;
  return noSource ? `<tr><td class="k">${esc(label)}</td>${value}</tr>` : `<tr><td class="s"${own ? ` style="--own:${own}"` : ""}>${esc(r.source || label)}</td>${value}</tr>`;
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
  const sum = `<tr class="sum"><td class="k">Total</td><td class="v">${fmt(total, col.digits ?? 0)}${col.percent ? "%" : ""}${esc(suffix)}</td></tr>`;
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
function sumByTag(lines, slot, keyOf) {
  const by = /* @__PURE__ */ new Map();
  const add = (snap, avg) => {
    if (snap.slot !== slot)
      return;
    const key = keyOf(snap.action);
    if (key == null)
      return;
    by.set(key, (by.get(key) ?? 0) + avg);
  };
  for (const line of lines) {
    if (line.aggregate)
      continue;
    if (!line.isChain) {
      add(line.snap, line.avg);
      continue;
    }
    const members = new Set(line.members ?? []);
    for (const p of line.parts)
      if (members.has(p.snap))
        add(p.snap, p.dmg.avg);
  }
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
function actionSection(lines, slot, total) {
  const by = /* @__PURE__ */ new Map();
  const add = (snap, avg) => {
    if (snap.slot !== slot)
      return;
    const cur = by.get(snap.action.name) ?? { dmg: 0, n: 0 };
    cur.dmg += avg;
    cur.n++;
    by.set(snap.action.name, cur);
  };
  for (const line of lines) {
    if (line.aggregate)
      continue;
    if (!line.isChain) {
      add(line.snap, line.avg);
      continue;
    }
    const members = new Set(line.members ?? []);
    for (const p of line.parts)
      if (members.has(p.snap))
        add(p.snap, p.dmg.avg);
  }
  if (!by.size)
    return "";
  const rows = [...by].sort((a, b) => b[1].dmg - a[1].dmg).slice(0, 7).map(([name, v]) => {
    const pct = total ? Math.round(v.dmg / total * 100) : 0;
    return `<tr><td class="k">${esc(name)} x${v.n}</td><td class="v">${fmt(v.dmg)} <span class="pct">(${pct}%)</span></td></tr>`;
  }).join("");
  return `<tr class="sec"><td colspan="2">Actions</td></tr>${rows}`;
}
function damagePopover(lines, slot, total, grandTotal) {
  const tagName = (k) => TAG_NAME[k];
  const body = breakdownSection("Node", sumByTag(lines, slot, (a) => a.node), total, (k) => NODE_NAME[k]) + breakdownSection("Type", sumByTag(lines, slot, (a) => a.type), total, tagName) + breakdownSection("Type 2", sumByTag(lines, slot, (a) => a.type2), total, tagName);
  const pct = grandTotal ? Math.round(total / grandTotal * 100) : 0;
  return lazyPop(`<span class="pop breakdown"><table>${body}<tr class="sum"><td class="k">Total</td><td class="v">${fmt(total)} <span class="pct">(${pct}% of team)</span></td></tr></table><table class="acts">${actionSection(lines, slot, total)}</table></span>`);
}
function equippedGear(member2, combo) {
  const l = member2.loadout;
  return [
    ["Inherent", l.inherent1],
    ["Inherent", l.inherent2],
    ["Weapon", combo.weapon],
    ["Mainslot", combo.echo.mainslot],
    ...combo.echo.sets.map((g, i) => [i === 0 ? "Sonata" : "", g]),
    ["Mainstats", combo.mainstat],
    ["Substats", l.substat]
  ];
}
var HOVER_GEAR_FROM = 2;
function equippedSequences(member2, combo) {
  return member2.loadout.sequences.slice(0, combo.sequence);
}
function gearRows(member2, combo) {
  const core = equippedGear(member2, combo).slice(HOVER_GEAR_FROM);
  const sequences = equippedSequences(member2, combo);
  const mode = member2.loadout.mode;
  return core.map(([label, g]) => `<tr class="gear"><td class="k">${esc(label)}</td><td class="v">${esc(g.name)}</td></tr>`).join("") + (mode ? `<tr class="gear"><td class="k">Mode</td><td class="v">${esc(mode.name)}</td></tr>` : "") + sequences.map((g, i) => `<tr class="gear"><td class="k">${i === 0 ? "Sequences" : ""}</td><td class="v">${esc(g.name)}</td></tr>`).join("");
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
  const entries = menuStats(l.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence));
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
function gearPopoverHtml(member2, combo) {
  const stats = menuStatRows(member2, combo).map((r) => `<tr class="stat"><td class="k">${esc(r.label)}</td><td class="v">${esc(r.value)}</td></tr>`).join("");
  return `<span class="pop gear"><table>${gearRows(member2, combo)}${stats}</table></span>`;
}
var gearPopover = (member2, combo) => lazyPop(gearPopoverHtml(member2, combo));
function memberLabel(m, combo) {
  const l = m.loadout;
  const mdps = m.mainDps;
  const seq = baseSequence(l.resonator) > 0 || (mdps ? filters.mdpsSequences : filters.supportSequences) ? `S${combo.sequence}` : "";
  const rank = combo.weapon.tier === 2 && l.resonator.tier !== 0 ? "R5" : combo.weapon.tier === 0 ? "R1" : "R0";
  return [l.resonator.name, `${seq}${rank}`].filter(Boolean).join(" ");
}
function optionCell(kind, value, color, lines = [value]) {
  const style = `--mem:${color}`;
  if (!value)
    return `<div class="c" style="${style}"></div>`;
  return `<div class="c option" data-kind="${kind}" data-value="${esc(value)}" style="${style}">${lines.map(esc).join("<br>")}</div>`;
}
function searchCandidates() {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const add = (kind, value) => {
    if (value && !seen.has(`${kind}|${value}`)) {
      seen.add(`${kind}|${value}`);
      out.push({ kind, value });
    }
  };
  for (const members of Object.values(TEAMS)) {
    for (const m of members) {
      add("resonator", m.name);
      const open = (mdps, support) => filters[m.mainDps ? mdps : support];
      if (open("mdpsWeapons", "supportWeapons"))
        for (const i of eligibleWeapons(m, filters))
          add("weapon", m.loadout.weapons[i].name);
      if (open("mdpsEchoes", "supportEchoes"))
        for (const e of m.loadout.echoLoadouts)
          add("echo", echoLabel(m.loadout, e));
      if (open("mdpsMainstats", "supportMainstats"))
        for (const g of m.loadout.mainstats)
          add("mainstat", g.name);
      for (const level of sequenceLevels(m, filters).slice(1)) {
        const tag = sequenceTagAt(m, level);
        if (tag)
          add("sequence", tag);
      }
    }
  }
  return out;
}
function searchHits() {
  const text = searchText.trim().toLowerCase();
  if (!text)
    return [];
  return searchCandidates().map((c) => ({ ...c, at: c.value.toLowerCase().indexOf(text) })).filter((c) => c.at !== -1).sort((a, b) => a.at - b.at || a.value.localeCompare(b.value)).slice(0, 5);
}
function searchResults() {
  if (!searchText.trim())
    return "";
  const KIND_LABEL = {
    resonator: "Resonator",
    weapon: "Weapon",
    echo: "Echo",
    mainstat: "Mainstat",
    sequence: "Sequence"
  };
  const hits = searchHits();
  if (!hits.length)
    return `<div class="sresult none">no matches</div>`;
  return hits.map(({ kind, value }) => {
    const hue = kind === "resonator" ? RESONATOR_HUE.get(value) : kind === "sequence" ? RESONATOR_HUE.get(value.replace(/ S\d+$/, "")) : void 0;
    return `<button type="button" class="sresult" data-kind="${kind}" data-value="${esc(value)}"` + (hue ? ` style="--mem:${hue}"` : "") + ` title="${esc(value)} \u2014 left click: only rows using them; right click: no row using them; either click again to clear.">${esc(value)}<span class="skind">${KIND_LABEL[kind]}</span></button>`;
  }).join("");
}
var ROLE_HELP = (role) => ({
  weapons: `Compare weapon options for ${role}`,
  echoes: `Compare sonata and mainslot options for ${role}`,
  mainstats: `Compare echo mainstat combos for ${role}`,
  r1: `Allow ${role} to use signature weapons`,
  sequences: `Show ${role} sequences S1-S6 for 5 star standard and limited`
});
var MDPS_HELP = ROLE_HELP("main DPS");
var SUPPORT_HELP = ROLE_HELP("supports");
var FILTER_HELP = {
  allowR1Mdps: MDPS_HELP.r1,
  mdpsWeapons: MDPS_HELP.weapons,
  mdpsEchoes: MDPS_HELP.echoes,
  mdpsMainstats: MDPS_HELP.mainstats,
  mdpsSequences: MDPS_HELP.sequences,
  allowR1Supports: SUPPORT_HELP.r1,
  supportWeapons: SUPPORT_HELP.weapons,
  supportEchoes: SUPPORT_HELP.echoes,
  supportMainstats: SUPPORT_HELP.mainstats,
  supportSequences: SUPPORT_HELP.sequences,
  matrix: "Enables matrix exclusive buffs for older characters, scaled down to a neutral environment. Lucy also activates 1 stack of her boss kill inherent."
};
var STANDARDS = [
  "Rotations are 123, or 1323 for resonators that need double intro (jinhsi, brant, etc).",
  "In some cases, a character may use their liberation at the start of the fight for free damage.",
  "Each rotation is achievable in 25-27 seconds, and we assume 4 rotations in 2 minutes.",
  "Combat is performed against a single level 100 boss with 20% resistance to all attributes.",
  "Resonators and weapons are level 90, with all skill nodes at level 10.",
  "Standard characters are S0, four star resonators and rover are S6 by default.",
  "Standard 5 star weapons are R1 and four star weapons are R5 by default.",
  "The simulation uses estimated, not frame exact buff uptimes in some cases to simplify calculations.",
  "This is to enable large scale automatic team calculations. It will never effect DPR by more than 1-2%.",
  "If you find an issue in buff timing, stats, builds, etc ping me on discord."
];
var openHelp = /* @__PURE__ */ new Set();
function comparisonFilters() {
  const filter = (id, label) => {
    const open = openHelp.has(id);
    return `<div class="tcopt${open ? " open" : ""}"><div class="tcopt-head"><button type="button" class="tcopt-name" data-help="${id}" aria-expanded="${open}">${esc(label)}<span class="arrow">\u203A</span></button><input type="checkbox" id="${id}" aria-label="${esc(label)}" title="${esc(label)}"${filters[id] ? " checked" : ""}></div><div class="tcopt-desc"${open ? "" : " hidden"}>${esc(FILTER_HELP[id])}</div></div>`;
  };
  const standards = () => {
    const open = openHelp.has("standards");
    return `<div class="tcopt note${open ? " open" : ""}"><div class="tcopt-head"><button type="button" class="tcopt-name" data-help="standards" aria-expanded="${open}">Standards and Assumptions<span class="arrow">\u203A</span></button></div><div class="tcopt-desc"${open ? "" : " hidden"}><ul>${STANDARDS.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div></div>`;
  };
  return `<div class="tcfilters">
    <div class="tcfilter-row note">
      ${standards()}
      <div class="tcsearchrow">
        <div class="tcsearch">
          <input id="optionSearch" type="search" placeholder="Filter resonators..."
            autocomplete="off" spellcheck="false" value="${esc(searchText)}">
          <div class="tcsearch-results" id="searchResults">${searchResults()}</div>
        </div>
        ${resonatorChips()}
      </div>
    </div>
    <div class="tcfilter-row">
      ${filter("allowR1Mdps", "Allow R1 Main DPS")}
      ${filter("mdpsWeapons", "Show Main DPS Weapon Options")}
      ${filter("mdpsEchoes", "Show Main DPS Echo Options")}
      ${filter("mdpsMainstats", "Show Main DPS Mainstat Options")}
      ${filter("mdpsSequences", "Allow Main DPS Sequences")}
      ${filter("matrix", "Enable Matrix Buffs")}
    </div>
    <div class="tcfilter-row">
      ${filter("allowR1Supports", "Allow R1 Supports")}
      ${filter("supportWeapons", "Show Support Weapon Options")}
      ${filter("supportEchoes", "Show Support Echo Options")}
      ${filter("supportMainstats", "Show Support Mainstat Options")}
      ${filter("supportSequences", "Allow Support Sequences")}
    </div>
    <div class="tcwarning" id="rowCapWarning" hidden></div>
  </div>`;
}
function resonatorChips() {
  const nameChips = [...resonatorFilters].map(([name, mode]) => {
    const included = mode === "include";
    return `<button type="button" class="rchip ${included ? "inc" : "exc"}" data-resonator="${esc(name)}" style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}" title="${esc(name)} \u2014 ${included ? "only teams fielding them" : "no team fielding them"}. Click to clear.">${esc(name)}<span class="box">${included ? "\u2713" : "\u2715"}</span></button>`;
  }).join("");
  const pickChips = Object.entries(OPTION_FILTER_MAPS).flatMap(([kind, map]) => [...map].map(([name, mode]) => {
    const included = mode === "include";
    const hue = kind === "sequence" ? RESONATOR_HUE.get(name.replace(/ S\d+$/, "")) : void 0;
    return `<button type="button" class="rchip ${included ? "inc" : "exc"}" data-kind="${kind}" data-value="${esc(name)}"` + (hue ? ` style="--mem:${hue}"` : "") + ` title="${esc(name)} \u2014 ${included ? "only rows using them" : "no row using them"}. Click to clear.">${esc(name)}<span class="box">${included ? "\u2713" : "\u2715"}</span></button>`;
  })).join("");
  const chips = nameChips + pickChips;
  return chips ? `<div class="tcchips">${chips}</div>` : "";
}
var dprOpenAt = [false, false, false];
var sortAscending = false;
function comparisonTable(rows) {
  const sorted = rows.map((row) => [row.key, results.get(row.key)]).sort((a, b) => sortAscending ? a[1].total - b[1].total : b[1].total - a[1].total);
  const weaponOpenAt = [false, false, false];
  const echoOpenAt = [false, false, false];
  const mainstatOpenAt = [false, false, false];
  for (const row of rows) {
    row.members.forEach((m, pos) => {
      const mdps = m.mainDps;
      if (mdps ? filters.mdpsWeapons : filters.supportWeapons)
        weaponOpenAt[pos] = true;
      if (mdps ? filters.mdpsEchoes : filters.supportEchoes)
        echoOpenAt[pos] = true;
      if (mdps ? filters.mdpsMainstats : filters.supportMainstats)
        mainstatOpenAt[pos] = true;
    });
  }
  const rowHtml = (key, run, rank) => {
    const grand = run.total;
    const memberNames = run.members.map((m) => m.name).join("|");
    const memberCell = (m, combo, i) => {
      const mdps = m.mainDps;
      const tag = sequenceTag(m, combo);
      const name = `<div class="c name res has" data-resonator="${esc(m.name)}"` + (tag ? ` data-sequence="${esc(tag)}"` : "") + deferredPop("gear", `${key}|${i}`) + ` style="--mem:${m.color};color:${m.color}"><span class="res-label">${esc(memberLabel(m, combo))}</span></div>`;
      const weapon = weaponOpenAt[i] ? optionCell("weapon", (mdps ? filters.mdpsWeapons : filters.supportWeapons) ? combo.weapon.name : "", m.color) : "";
      const showEcho = mdps ? filters.mdpsEchoes : filters.supportEchoes;
      const echo = echoOpenAt[i] ? optionCell("echo", showEcho ? echoLabel(m.loadout, combo.echo) : "", m.color, showEcho ? echoLines(m.loadout, combo.echo) : []) : "";
      const mainstat = mainstatOpenAt[i] ? optionCell("mainstat", (mdps ? filters.mdpsMainstats : filters.supportMainstats) ? combo.mainstat.name : "", m.color) : "";
      const dpr = dprOpenAt[i] ? `<div class="c num slotdpr" style="--mem:${m.color}">${fmt(run.bySlot.get(m.name) ?? 0)}</div>` : "";
      return name + weapon + echo + mainstat + dpr;
    };
    const memberCells = run.members.map((m, i) => memberCell(m, run.combo[i], i)).join("");
    return `<div class="trow${rank.pinned ? " isbaseline" : ""}" style="--hue:${rank.hue}" data-team="${esc(key)}" data-team-key="${esc(run.teamKey)}" data-members="${esc(memberNames)}" data-total="${grand}">` + memberCells + `<div class="c num total teamdpr gotodetail" data-team="${esc(key)}"` + deferredPop("dpr", key) + `>${fmt(grand)}<span class="arrow">\u203A</span></div><div class="c num total baseline" data-team="${esc(key)}" title="Click to measure every team against this one">${rank.pct}</div></div>`;
  };
  const memberHead = (n, i) => `<div class="c slothead${dprOpenAt[i] ? " open" : ""}" data-pos="${i}" title="Click to show this slot's own DPR">Slot ${n}<span class="arrow">\u203A</span></div>` + (weaponOpenAt[i] ? `<div class="c">Weapon ${n}</div>` : "") + (echoOpenAt[i] ? `<div class="c">Echo Set ${n}</div>` : "") + (mainstatOpenAt[i] ? `<div class="c">Mainstats ${n}</div>` : "") + (dprOpenAt[i] ? `<div class="c num">DPR ${n}</div>` : "");
  const head = `<div class="trow thead">` + memberHead(3, 0) + memberHead(2, 1) + memberHead(1, 2) + `<div class="c num sorthead${sortAscending ? " asc" : ""}" title="Click to flip the sort">Team DPR<span class="arrow">\u203A</span></div><div class="c num">% of Baseline</div></div>`;
  const posCols = (i) => `max-content${weaponOpenAt[i] ? " max-content" : ""}${echoOpenAt[i] ? " max-content" : ""}${mainstatOpenAt[i] ? " max-content" : ""}${dprOpenAt[i] ? " max-content" : ""}`;
  const gridStyle = `grid-template-columns:${posCols(0)} ${posCols(1)} ${posCols(2)} max-content max-content`;
  const rowLines = (run) => Math.max(1, ...run.members.map((m, i) => echoOpenAt[i] && (m.mainDps ? filters.mdpsEchoes : filters.supportEchoes) ? run.combo[i].echo.sets.length : 1));
  const lines = sorted.map(([, run]) => rowLines(run));
  const extra = [0];
  for (const n of lines)
    extra.push(extra[extra.length - 1] + n - 1);
  const ranks = rankAll(sorted);
  const widest = (a, b) => b.length > a.length ? b : a;
  const wide = {
    name: ["", "", ""],
    weapon: ["", "", ""],
    echo: ["", "", ""],
    mainstat: ["", "", ""],
    dpr: ["", "", ""],
    total: "",
    pct: ""
  };
  sorted.forEach(([, run], i) => {
    run.members.forEach((m, pos) => {
      const combo = run.combo[pos];
      const mdps = m.mainDps;
      wide.name[pos] = widest(wide.name[pos], memberLabel(m, combo));
      if (mdps ? filters.mdpsWeapons : filters.supportWeapons)
        wide.weapon[pos] = widest(wide.weapon[pos], combo.weapon.name);
      if (mdps ? filters.mdpsEchoes : filters.supportEchoes) {
        for (const line of echoLines(m.loadout, combo.echo))
          wide.echo[pos] = widest(wide.echo[pos], line);
      }
      if (mdps ? filters.mdpsMainstats : filters.supportMainstats)
        wide.mainstat[pos] = widest(wide.mainstat[pos], combo.mainstat.name);
      wide.dpr[pos] = widest(wide.dpr[pos], fmt(run.bySlot.get(m.name) ?? 0));
    });
    wide.total = widest(wide.total, fmt(run.total));
    wide.pct = widest(wide.pct, ranks[i].pct);
  });
  const ghostPos = (i) => `<div class="c name res"><span class="res-label">${esc(wide.name[i])}</span></div>` + (weaponOpenAt[i] ? `<div class="c option">${esc(wide.weapon[i])}</div>` : "") + (echoOpenAt[i] ? `<div class="c option">${esc(wide.echo[i])}</div>` : "") + (mainstatOpenAt[i] ? `<div class="c option">${esc(wide.mainstat[i])}</div>` : "") + (dprOpenAt[i] ? `<div class="c num slotdpr">${esc(wide.dpr[i])}</div>` : "");
  const ghost = `<div class="trow tghost" aria-hidden="true">` + ghostPos(0) + ghostPos(1) + ghostPos(2) + `<div class="c num total gotodetail">${esc(wide.total)}<span class="arrow">\u203A</span></div><div class="c num total baseline">${esc(wide.pct)}</div></div>`;
  tableView = { sorted, ranks, head, ghost, rowHtml, lines, extra };
  return `<main><div class="tclayout"><aside class="tcside">${comparisonFilters()}</aside><div class="tcbody"><h2 class="summary-label" id="teamCount">${fmt(sorted.length)} teams</h2><div class="tcwrap"><div class="tgrid" style="${gridStyle}">${head}${ghost}</div></div></div></div></main>`;
}
var tableView = null;
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
    return { hue, pct: `${fmt(ratio * 100, 2, true)}%`, pinned: i === pinned };
  });
}
function drawWindow(force = false, scrollTop) {
  const view = tableView;
  const main = app.querySelector("main");
  const grid = main?.querySelector(".tgrid");
  if (!view || !main || !grid)
    return;
  const n = view.sorted.length;
  const top = scrollTop ?? main.scrollTop;
  const headH = grid.querySelector(".thead .c")?.getBoundingClientRect().height ?? 0;
  const rowsTop = grid.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop + headH;
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
  grid.innerHTML = view.head + view.ghost + spacer(0, from) + body + spacer(to, n);
  drawnFrom = from;
  drawnTo = to;
  if (!measured && to - from >= 2) {
    measured = true;
    const cells = [...grid.querySelectorAll(".trow:not(.thead) > .c.teamdpr")];
    const heights = cells.slice(0, -1).map((c, j) => [cells[j + 1].getBoundingClientRect().top - c.getBoundingClientRect().top, view.lines[from + j]]);
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
var RUNNING_COLUMNS = /* @__PURE__ */ new Set(["concerto", "energy", "offtune"]);
var isRunning = (key) => RUNNING_COLUMNS.has(key) || key.startsWith("gauge:");
function stepRow(columns, row, slotHue, gearByMember, { part = false, caret = true } = {}) {
  return columns.map((col, i) => {
    const v = row.raw[col.key];
    const sources = row.sources[col.key];
    if (isRunning(col.key)) {
      const before = Number(row.raw[`before:${col.key}`]) || 0;
      const fed = (sources ?? []).some((r) => r.section !== OFFTUNE_RATE && r.section !== ENERGY_RATE);
      if (!fed && Math.abs((Number(v) || 0) - before) < 1e-9)
        return cell(columns, i, { cls: [], html: "", style: "" });
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
    if (isRunning(col.key) && typeof v === "number" && Math.abs((Number(row.raw[`before:${col.key}`]) || 0) + (Number(row.raw[`moved:${col.key}`]) || 0) - v) > 1e-9) {
      cls.push("buffed");
    }
    if (col.key === "concerto" && Number(row.raw.isOutro) && Number(row.raw.concertoSpent) < 100) {
      cls.push("underspent");
    }
    if (col.key.startsWith("gauge:") && typeof v === "number" && v < 0)
      cls.push("negative");
    const text = esc(fmt(v, col.digits ?? 0, PAD_DIGITS_COLUMNS2.has(col.key), GROUPED_COLUMNS2.has(col.key))) + (col.percent && typeof v === "number" ? "%" : "");
    let html = sources && text ? `<span class="has">${text}</span>` : text;
    if (col.key === "action" && caret && !part && "parts" in row && row.parts.length) {
      html = `${html}<span class="caret">\u25B8</span>`;
    }
    const suffix = col.key === "mv" && row.scaling !== null ? ` ${SCALING_NAME[row.scaling]}` : "";
    let pop = "";
    if (col.key === "action") {
      const group = "parts" in row && row.parts.length > 0;
      pop = group ? "" : infoPopover("info" in row ? row.info : void 0, slotHue);
    } else if (col.key === "member") {
      const snap = "line" in row ? row.line.snap : row.snap;
      const gear = gearByMember.get(snap.member) ?? [];
      pop = buffsPopover(snap.member, gear, snap.heldLocal, snap.heldGlobal, snap.heldEnemy, slotHue);
    } else if (text) {
      pop = popover(col, sources, row.raw[`moved:${col.key}`] ?? v, slotHue, suffix);
    }
    const mem = slotHue.get(String(v)) ?? FALLBACK_HUE;
    const style = col.key === "member" ? `--mem:${mem};color:${mem}` : "";
    return cell(columns, i, { cls, html, pop, style });
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
function rotationTable(report, slotHue, gearByMember) {
  const columns = report.columns;
  const cols = columns.map(colWidth).join(" ");
  const head = columns.map((c, i) => cell(columns, i, { html: esc(c.label) })).join("");
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
    for (const snap of line.members?.length ? line.members : [line.snap]) {
      fieldOf.set(snap, id);
    }
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
  const steps = out.join("");
  const fieldRules = [...fieldIds.values()].map((n) => `.grid:has(#fg${n}:checked) .step[data-fh="${n}"]{display:block}.grid:has(#fg${n}:checked) .r[data-fh="${n}"]{display:grid}`).join("");
  const totalRow = columns.map((c, i) => cell(columns, i, {
    html: ""
  })).join("");
  return `<div class="gridwrap">${fieldRules ? `<style>${fieldRules}</style>` : ""}<div class="grid" style="--cols:${cols}">
    <div class="r head">${head}</div>
    ${steps}
    <div class="r totalrow">${totalRow}</div>
  </div></div>`;
}
function dprTable(run, lines) {
  const grand = run.sectionTotals.reduce((a, b) => a + b, 0);
  const flat = lines?.flat();
  const head = `<div class="rtrow rthead"><div class="c">${lines ? "" : "Click to view details"}</div><div class="c num">Opener</div><div class="c num">Loop 1</div><div class="c num">Loop 2</div><div class="c num">Loop 3</div><div class="c num">Total</div></div>`;
  const valueCell = (sec, slot, value, total) => sec ? `<div class="c num has"${damagePopover(sec, slot, value, total)}>${fmt(value)}</div>` : `<div class="c num">${fmt(value)}</div>`;
  const dataRow = (slot, color, hover) => {
    const own = run.sectionBySlot.reduce((a, by) => a + (by.get(slot) ?? 0), 0);
    return `<div class="rtrow"><div class="c name${hover ? " has" : ""}"${hover} style="--mem:${color}">${esc(slot)}</div>` + run.sectionBySlot.map((by, i) => valueCell(lines?.[i], slot, by.get(slot) ?? 0, run.sectionTotals[i])).join("") + valueCell(flat, slot, own, grand) + `</div>`;
  };
  const memberRows = run.members.map((m, i) => dataRow(m.name, m.color, lines ? gearPopover(m, run.combo[i]) : "")).join("");
  const tuneBreakRow = dataRow(TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color, "");
  const plainCell = (value) => `<div class="c num">${fmt(value)}</div>`;
  const totalRow = `<div class="rtrow total"><div class="c name">Total</div>` + run.sectionTotals.map((v) => plainCell(v)).join("") + plainCell(grand) + `</div>`;
  return `<div class="rtable dpr">${head}${memberRows}${tuneBreakRow}${totalRow}</div>`;
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
function erRequirementValue(maxEnergy, before) {
  if (!maxEnergy)
    return 0;
  if (before == null || before <= 0)
    return null;
  return maxEnergy / before * 100;
}
function erFallsShort(flat, targetIdx, member2, requirement) {
  for (let i = targetIdx; i >= 0; i--) {
    const snap = flat[i].snap;
    if (snap.member !== member2)
      continue;
    if (i !== targetIdx && snap.action.resetEnergy)
      break;
    if (snap.stat(
      11
      /* Stat.Er */
    ) < requirement)
      return true;
  }
  return false;
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
    for (const snap of line.members?.length ? line.members : [line.snap]) {
      if (snap.member !== member2 || snap.energyWiped)
        continue;
      total += (snap.action.energy + snap.stat(
        25
        /* Stat.AddEnergy */
      )) * (1 + snap.stat(
        14
        /* Stat.EnergyRegenMult */
      ) / 100);
    }
  }
  return total;
}
function teamEnergySources(flat, rows, member2, fallback) {
  const [from, to] = energySpan(flat, member2, fallback);
  const by = /* @__PURE__ */ new Map();
  for (let i = from; i < to; i++) {
    const line = flat[i];
    const snap = line.snap;
    if (line.aggregate || snap.member !== member2 || snap.energyWiped)
      continue;
    for (const r of rows[i]?.sources.energy ?? []) {
      if (!r.owner || r.owner === member2)
        continue;
      const key = `${r.source}\0${r.section ?? ""}`;
      const seen = by.get(key);
      if (seen) {
        if (!r.mult && r.section !== ENERGY_RATE)
          seen.value += r.value;
      } else
        by.set(key, { ...r });
    }
  }
  return [...by.values()];
}
function teamEnergyPopover(sources, slotHue) {
  const head = sources.length ? "Team sources" : "No team sources";
  return lazyPop(`<span class="pop stat"><table><tr class="sec"><td colspan="2">${head}</td></tr>${sources.map((r) => panelRow(r, slotHue)).join("")}</table></span>`);
}
function energyTable(run, lines, report, slotHue) {
  const erCol = columnOf(report, "er");
  const flat = lines.flat();
  const offsets = [0];
  for (const sec of lines)
    offsets.push(offsets[offsets.length - 1] + sec.length);
  const head = `<div class="rtrow rthead"><div class="c"></div><div class="c num">Opener</div><div class="c num">Loop 1</div><div class="c num">Loop 2</div><div class="c num">Loop 3</div><div class="c num">Energy Gen</div></div>`;
  const rows = run.members.map((m, idx) => {
    const maxEnergy = m.loadout.resonator.maxEnergy;
    const free = resetIndices(flat, 0, flat.length, m.name)[0] ?? null;
    const cell2 = (resetIdx) => {
      const snap = resetIdx == null || resetIdx === free ? null : flat[resetIdx].snap;
      const req = snap == null ? null : erRequirementValue(maxEnergy, snap.realEnergyBefore);
      const warn = req != null && erFallsShort(flat, resetIdx, m.name, req);
      const text = req == null ? "\u2014" : `${fmt(req, 1)}%`;
      const hover = snap && erCol ? popover(erCol, columnSources(snap, "er"), snap.stat(
        11
        /* Stat.Er */
      ), slotHue) : "";
      return `<div class="c num${warn ? " er-under" : ""}${hover ? " has" : ""}"${hover}>${text}</div>`;
    };
    const opener = resetIndices(flat, offsets[0], offsets[1], m.name);
    const lastLoop = [offsets[3], offsets[4]];
    const gen = energyGenerated(flat, m.name, lastLoop);
    const team = teamEnergyPopover(teamEnergySources(flat, report.rows, m.name, lastLoop), slotHue);
    const cells = cell2(opener[opener.length - 1] ?? null) + [1, 2, 3].map((i) => cell2(resetIndices(flat, offsets[i], offsets[i + 1], m.name)[0] ?? null)).join("") + `<div class="c num has"${team}>${fmt(gen, 2, true)}</div>`;
    return `<div class="rtrow"><div class="c name"${gearPopover(m, run.combo[idx])} style="--mem:${m.color}">${esc(m.name)}</div>` + cells + `</div>`;
  }).join("");
  return `<div class="rtable energy">${head}${rows}</div>`;
}
function page(run) {
  const { report } = detailFor(run);
  const lines = run.rotationLines;
  const { members } = run;
  const slotHue = new Map([...members.map((m) => [m.name, m.color]), [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]]);
  const gearByMember = new Map(members.map((m, i) => [m.name, equippedGear(m, run.combo[i]).map(([, g]) => g)]));
  return `<main>
  <div class="rtables">
    <div class="rtable-block">
      <h2 class="summary-label">damage per rotation</h2>
      ${dprTable(run, lines)}
    </div>
    <div class="rtable-block">
      <h2 class="summary-label">energy requirements</h2>
      ${energyTable(run, lines, report, slotHue)}
    </div>
  </div>
  <h2 class="summary-label">action log</h2>
  ${rotationTable(report, slotHue, gearByMember)}
</main>`;
}
function errorPage(err) {
  const looksLikeFileUrl = location.protocol === "file:";
  const hint = looksLikeFileUrl ? `This page was opened straight off disk. Browsers refuse to load ES modules or
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
function wireSourcePanels(root) {
  const GAP = 4, EDGE = 6;
  let open = null;
  let openHome = null;
  document.body.querySelectorAll(":scope > .pop").forEach((el) => el.remove());
  const built = /* @__PURE__ */ new WeakMap();
  const close = () => {
    open?.remove();
    open = null;
    openHome = null;
  };
  const place = (cell2, pop) => {
    if (pop.parentElement !== document.body)
      document.body.appendChild(pop);
    pop.style.visibility = "hidden";
    pop.style.display = "block";
    const c = cell2.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const onTable = !!cell2.closest(".tcwrap");
    const natural = !onTable && cell2.classList.contains("num") ? c.right - p.width : c.left;
    const tableLeft = onTable ? EDGE : cell2.closest(".gridwrap")?.getBoundingClientRect().left ?? EDGE;
    const minLeft = Math.max(EDGE, tableLeft);
    const left = Math.max(minLeft, Math.min(natural, innerWidth - p.width - EDGE));
    const above = c.top - p.height - GAP;
    const below = c.bottom + GAP;
    const fitsBelow = below + p.height <= innerHeight - EDGE;
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
  const isAction = (cell2) => !!cell2.closest(".grid") && (cell2.classList.contains("action") || cell2.classList.contains("name"));
  document.addEventListener("mouseover", (e) => {
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
    const to = e.relatedTarget;
    if (to && (root.contains(to) || open && open.contains(to)))
      return;
    close();
  });
  addEventListener("click", (e) => {
    const { cell: cell2, pop } = panelIn(e.target);
    if (!cell2)
      return;
    const onCaret = !!e.target?.closest?.(".caret");
    if (isAction(cell2) && !onCaret && pop) {
      e.preventDefault();
      const same = openHome === cell2;
      close();
      if (!same)
        place(cell2, pop);
      return;
    }
    if (cell2.querySelector(":scope > .caret"))
      close();
  });
  addEventListener("scroll", close, true);
  addEventListener("resize", close);
  addEventListener("resize", () => {
    fitSide();
    drawWindow(true);
  });
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
  const g = grid.getBoundingClientRect();
  const c = cell2.getBoundingClientRect();
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
    const width = new Map(cells.map((c) => [c.dataset.col, c.getBoundingClientRect().width]));
    const key = cell2.dataset.col;
    const offsets = offsetsOf(logOrder, width);
    drag = {
      key,
      nth: cells.indexOf(cell2) + 1,
      order: logOrder,
      width,
      home: offsets.get(key),
      span: [...width.values()].reduce((n, w) => n + w, 0),
      startX: e.clientX,
      at: logOrder.indexOf(key)
    };
    lifted = false;
  });
  head.addEventListener("pointermove", (e) => {
    if (!drag)
      return;
    if (!lifted) {
      if (Math.abs(e.clientX - drag.startX) < LIFT_AT)
        return;
      lifted = true;
      document.body.classList.add("coldrag");
      openDrag(head.parentElement, drag);
    }
    const w = drag.width.get(drag.key);
    const dx = Math.min(drag.span - w - drag.home, Math.max(-drag.home, e.clientX - drag.startX));
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
var app = document.getElementById("app");
var backLink = document.getElementById("backLink");
var topbar = document.getElementById("topbar");
var results = /* @__PURE__ */ new Map();
var visibleRows = [];
var hashParams = () => new URLSearchParams(location.hash.replace(/^#/, ""));
var FILTER_KEYS = Object.keys(filters);
var FILTER_GROUPS = [
  { include: "r", exclude: "x", map: resonatorFilters },
  { include: "wr", exclude: "wx", map: weaponFilters },
  { include: "er", exclude: "ex", map: echoFilters },
  { include: "mr", exclude: "mx", map: mainstatFilters },
  { include: "sr", exclude: "sx", map: sequenceFilters }
];
function applyHash() {
  const params = hashParams();
  let changed = false;
  const f = params.get("f");
  if (f !== null) {
    const on = new Set(f.split(",").filter(Boolean));
    for (const key of FILTER_KEYS) {
      if (filters[key] === on.has(key))
        continue;
      filters[key] = on.has(key);
      changed = true;
    }
  }
  if (params.has("f")) {
    const named = (v, mode) => (v ?? "").split(",").filter(Boolean).map((name) => [name, mode]);
    for (const { include, exclude, map } of FILTER_GROUPS) {
      const next = new Map([...named(params.get(exclude), "exclude"), ...named(params.get(include), "include")]);
      if (next.size !== map.size || [...next].some(([n, m]) => map.get(n) !== m)) {
        map.clear();
        for (const [name, mode] of next)
          map.set(name, mode);
        changed = true;
      }
    }
  }
  return changed;
}
function syncHash(team = hashParams().get("team")) {
  const named = (map, mode) => [...map].filter(([, m]) => m === mode).map(([name]) => encodeURIComponent(name)).join(",");
  const parts = [`f=${FILTER_KEYS.filter((k) => filters[k]).join(",")}`];
  for (const { include, exclude, map } of FILTER_GROUPS) {
    if (named(map, "include"))
      parts.push(`${include}=${named(map, "include")}`);
    if (named(map, "exclude"))
      parts.push(`${exclude}=${named(map, "exclude")}`);
  }
  if (team)
    parts.push(`team=${team}`);
  const next = `#${parts.join("&")}`;
  if (next === location.hash)
    return;
  history.replaceState(null, "", next);
}
var routeTeam = () => {
  const key = hashParams().get("team");
  return key && results.has(key) ? key : null;
};
function fitSide() {
  const layout = app.querySelector(".tclayout");
  const grid = app.querySelector(".tgrid");
  const side = app.querySelector(".tcside");
  if (!layout || !grid || !side)
    return;
  layout.classList.remove("stack");
  if (getComputedStyle(layout).flexDirection !== "row")
    return;
  const gap = parseFloat(getComputedStyle(layout).columnGap) || 0;
  if (grid.scrollWidth + side.offsetWidth + gap > layout.clientWidth)
    layout.classList.add("stack");
}
function renderComparison() {
  topbar.hidden = true;
  document.body.querySelectorAll(":scope > .pop").forEach((el) => el.remove());
  const scrollTop = app.querySelector("main")?.scrollTop ?? 0;
  app.innerHTML = comparisonTable(visibleRows);
  app.className = "";
  measured = false;
  drawnFrom = drawnTo = -1;
  fitSide();
  drawWindow(true, scrollTop);
  const main = app.querySelector("main");
  main.scrollTop = scrollTop;
  focusSearch();
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
function renderDetail(key) {
  topbar.hidden = false;
  document.body.querySelectorAll(":scope > .pop").forEach((el) => el.remove());
  const run = results.get(key);
  app.innerHTML = page(run);
  app.className = "";
  wireColumnDrag(app, detailFor(run).report.columns);
}
var tableRequested = false;
var route = () => {
  const key = routeTeam();
  if (key) {
    renderDetail(key);
    return;
  }
  if (!tableRequested) {
    void refresh();
    return;
  }
  renderComparison();
};
var paint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
var settle = () => new Promise((resolve) => setTimeout(resolve, 150));
var overlay = document.getElementById("loading");
var overlayStatus = overlay.querySelector(".status-text");
var overlayCount = overlay.querySelector(".progress-count");
var overlayFill = overlay.querySelector(".progress-fill");
function overlayPhase(text, count = "") {
  overlayStatus.textContent = text;
  overlayCount.textContent = count;
  overlay.hidden = false;
}
async function runMissing(rows, workTotal, teamsOffset) {
  const missing = rows.filter((row) => !results.has(row.key));
  if (!missing.length)
    return;
  overlayPhase("Running Rotations\u2026");
  const cached = rows.length - missing.length;
  const progress = (done) => {
    overlayFill.style.width = `${(teamsOffset + done) / workTotal * 100}%`;
    overlayCount.textContent = `${fmt(done)} / ${fmt(rows.length)}`;
  };
  progress(cached);
  let lastPaint2 = performance.now();
  for (let i = 0; i < missing.length; i++) {
    const row = missing[i];
    results.set(row.key, runTeam(row.teamKey, row.members, row.combo));
    progress(cached + i + 1);
    if (performance.now() - lastPaint2 > 50) {
      await paint();
      lastPaint2 = performance.now();
    }
  }
  await paint();
  await settle();
}
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
function workerPool() {
  if (poolTried)
    return pool;
  poolTried = true;
  const want = Math.max(1, Math.min(WORKER_LIMIT, (navigator.hardwareConcurrency || 4) - 1));
  try {
    pool = Array.from({ length: want }, () => new Worker(new URL("./solver.js", import.meta.url), { type: "module" }));
  } catch (err) {
    console.warn("Workers unavailable, optimizing on the main thread instead:", err);
    pool = null;
  }
  return pool;
}
function solveOnWorkers(workers, teams, onDone) {
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
        onDone();
        pump(w);
      };
      w.onmessage = ({ data }) => finish({ picks: data.picks, rows: data.rows, scores: data.scores });
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
async function ensureBestPicks(inPlay, workTotal) {
  await loadShipped(filters);
  const teams = inPlay.filter(([key, members]) => !bestPicks.has(bestKey(key, members, filters)));
  if (!teams.length)
    return false;
  overlayPhase("Optimizing Echoes...");
  let done = inPlay.length - teams.length;
  const progress = () => {
    overlayFill.style.width = `${done / workTotal * 100}%`;
    overlayCount.textContent = `${fmt(done)} / ${fmt(inPlay.length)}`;
  };
  progress();
  const solvable = teams.filter(([, members]) => members.every((m) => eligibleWeapons(m, filters).length));
  done += teams.length - solvable.length;
  const pool2 = workerPool();
  if (pool2)
    await solveOnWorkers(pool2, solvable, () => {
      done++;
      progress();
    });
  else {
    for (const [key, members] of solvable) {
      storeSolved(key, solveTeam(key, members, filters, picksCache.get(picksKey(key, members, filters)) ?? null));
      done++;
      progress();
      await breathe();
    }
  }
  await paint();
  return true;
}
async function refresh() {
  tableRequested = true;
  try {
    const inPlay = Object.entries(TEAMS).filter(([, members]) => teamWanted(members));
    if (inPlay.some(([key, members]) => !bestPicks.has(bestKey(key, members, filters))))
      workerPool();
    if (!visibleRows.length)
      route();
    const solvableInPlay = inPlay.filter(([, members]) => members.every((m) => eligibleWeapons(m, filters).length));
    const rowsTotal = solvableInPlay.reduce((sum, [, members]) => sum + estimatedRowCount(members), 0);
    const workTotal = inPlay.length + rowsTotal || 1;
    const solved = await ensureBestPicks(inPlay, workTotal);
    saveSolves();
    const rows = teamRows();
    const cached = rows.filter((row) => results.has(row.key));
    const missing = cached.length !== rows.length;
    if (!missing && cached.length) {
      overlayPhase("Rendering Table\u2026");
      overlayFill.style.width = `${(inPlay.length + cached.length) / workTotal * 100}%`;
      overlayCount.textContent = `${fmt(cached.length)} / ${fmt(rows.length)}`;
      await paint();
      if (solved)
        await settle();
      visibleRows = cached;
      route();
    } else if (!missing) {
      visibleRows = [];
      route();
    }
    await runMissing(rows, workTotal, inPlay.length);
    if (missing) {
      overlayPhase("Rendering Table\u2026");
      await paint();
      visibleRows = rows;
      route();
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = errorPage(err);
    app.className = "";
  }
  overlay.hidden = true;
}
async function bootDetail() {
  const key = hashParams().get("team");
  if (!key || results.has(key))
    return false;
  const row = rowFromKey(key);
  if (!row)
    return false;
  overlayPhase("Running Rotation\u2026");
  await paint();
  results.set(key, runTeam(row.teamKey, row.members, row.combo, true));
  renderDetail(key);
  overlay.hidden = true;
  return true;
}
async function boot() {
  applyHash();
  await loadSolves();
  if (!await bootDetail())
    await refresh();
  syncHash();
  addEventListener("hashchange", () => {
    if (applyHash()) {
      void refresh();
      return;
    }
    const key = hashParams().get("team");
    if (key && !results.has(key) && rowFromKey(key)) {
      void bootDetail();
      return;
    }
    route();
  });
  wireSourcePanels(app);
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".gotodetail");
    if (el?.dataset.team) {
      syncHash(el.dataset.team);
      route();
    }
  });
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".c.baseline");
    if (el?.dataset.team)
      setBaseline(el.dataset.team);
  });
  document.addEventListener("click", (e) => {
    const pos = e.target.closest(".c.slothead")?.dataset.pos;
    if (pos === void 0)
      return;
    dprOpenAt[Number(pos)] = !dprOpenAt[Number(pos)];
    renderComparison();
  });
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
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".c.sorthead"))
      return;
    sortAscending = !sortAscending;
    renderComparison();
  });
  const AXIS_MAP = {
    mdpsSequences: sequenceFilters,
    supportSequences: sequenceFilters,
    mdpsWeapons: weaponFilters,
    supportWeapons: weaponFilters,
    mdpsEchoes: echoFilters,
    supportEchoes: echoFilters,
    mdpsMainstats: mainstatFilters,
    supportMainstats: mainstatFilters
  };
  document.addEventListener("change", (e) => {
    const input = e.target;
    const key = input.id;
    if (!(key in filters))
      return;
    withRowCap(() => {
      const was = filters[key];
      const map = AXIS_MAP[key];
      const kept = map ? [...map] : null;
      filters[key] = input.checked;
      if (!input.checked)
        map?.clear();
      return () => {
        filters[key] = was;
        input.checked = was;
        if (map && kept) {
          map.clear();
          for (const [n, mode] of kept)
            map.set(n, mode);
        }
      };
    });
  });
  const resonatorName = (e) => {
    const el = e.target.closest(".c.name.res");
    const sequence = el?.dataset.sequence;
    if (sequence)
      return [sequenceFilters, sequence];
    return el?.dataset.resonator ? [resonatorFilters, el.dataset.resonator] : void 0;
  };
  document.addEventListener("click", (e) => {
    const target = resonatorName(e);
    if (target)
      setFilter(...target, "include");
  });
  document.addEventListener("contextmenu", (e) => {
    const target = resonatorName(e);
    if (!target)
      return;
    e.preventDefault();
    setFilter(...target, "exclude");
  });
  const optionPick = (e) => {
    const el = e.target.closest(".c.option");
    const kind = el?.dataset.kind;
    const value = el?.dataset.value;
    return kind && value ? [OPTION_FILTER_MAPS[kind], value] : void 0;
  };
  document.addEventListener("click", (e) => {
    const pick = optionPick(e);
    if (pick)
      setFilter(...pick, "include");
  });
  document.addEventListener("contextmenu", (e) => {
    const pick = optionPick(e);
    if (!pick)
      return;
    e.preventDefault();
    setFilter(...pick, "exclude");
  });
  const searchPick = (e) => {
    const el = e.target.closest(".sresult");
    const kind = el?.dataset.kind;
    const value = el?.dataset.value;
    if (!kind || !value)
      return void 0;
    return [kind === "resonator" ? resonatorFilters : OPTION_FILTER_MAPS[kind], value];
  };
  document.addEventListener("click", (e) => {
    const pick = searchPick(e);
    if (!pick)
      return;
    clearSearch();
    setFilter(...pick, "include");
    focusSearch();
  });
  document.addEventListener("contextmenu", (e) => {
    const pick = searchPick(e);
    if (!pick)
      return;
    e.preventDefault();
    clearSearch();
    setFilter(...pick, "exclude");
    focusSearch();
  });
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest?.(".rchip"))
      e.preventDefault();
  });
  document.addEventListener("click", (e) => {
    const chip = e.target.closest(".rchip");
    if (!chip)
      return;
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
  });
}
function setFilter(map, name, mode) {
  withRowCap(() => {
    const was = map.get(name);
    if (was !== void 0)
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
document.addEventListener("input", (e) => {
  const input = e.target;
  if (input.id !== "optionSearch")
    return;
  searchText = input.value;
  const box = document.getElementById("searchResults");
  if (box)
    box.innerHTML = searchResults();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.target.id !== "optionSearch")
    return;
  const first = searchHits()[0];
  if (!first)
    return;
  e.preventDefault();
  clearSearch();
  setFilter(first.kind === "resonator" ? resonatorFilters : OPTION_FILTER_MAPS[first.kind], first.value, "include");
  focusSearch();
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
backLink.addEventListener("click", (e) => {
  e.preventDefault();
  syncHash(null);
  route();
});
boot().catch((err) => {
  console.error(err);
  app.innerHTML = errorPage(err);
  app.className = "";
});
export {
  setBaseline
};
