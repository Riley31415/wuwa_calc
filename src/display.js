/**
 * Display interface: turns evaluated rows into a table of actions with the stats and
 * resources snapshotted at each one.
 *
 * `buildReport` returns structured data — columns and rows of already-formatted values —
 * so the same thing can back a terminal dump or a web view. `renderReport` is only the
 * terminal spelling of it.
 *
 * Columns that are zero the whole way down are dropped, so a resonator that never touches
 * forte3 does not get a column of noughts.
 */
import {
  CRIT_RATE, CRIT_DMG, ENERGY, CONCERTO, OFFTUNE,
  BASE_ATK, BONUS_ATK, FLAT_ATK, BASE_HP, BONUS_HP, FLAT_HP,
  ADD_MV, MUL_MV, SPECIAL_MV, DMG_BONUS, AMP, FORTE1, FORTE2, FORTE3, FORTE4,
  SCALE_TUNE,
  DEF_IGNORE, DEF_SHRED, DEF_REDUCE, RES_IGNORE, RES_SHRED,
  scopedStat, TAGS_MATCHED, SCALE_ATK, splitStat, statLabel,
} from "./stats.js";
import { mvPercent, effectiveDef, effectiveRes, damageFactors } from "./damage.js";

/**
 * Which stats feed a column, so a value can be traced back to what produced it. A function
 * where the answer depends on the action: the damage bonus a hit receives is the generic one
 * plus the ones scoped to its own element, type and scaling.
 */
const FEEDS = {
  atk: () => [BASE_ATK, BONUS_ATK, FLAT_ATK],
  hp: () => [BASE_HP, BONUS_HP, FLAT_HP],
  mv: () => [ADD_MV, MUL_MV, SPECIAL_MV],
  cr: () => [CRIT_RATE],
  cd: () => [CRIT_DMG],
  dmgBonus: () => [DMG_BONUS],
  amp: () => [AMP],
  // what is being done to the enemy rather than to the resonator
  effDef: () => [DEF_IGNORE, DEF_SHRED, DEF_REDUCE],
  effRes: () => [RES_IGNORE, RES_SHRED],
};

/**
 * Every key a stat can arrive under for this action: the stat itself, plus the same stat scoped
 * to the action's element and damage type. Any stat can be scoped, so this applies to all of
 * them rather than only to damage bonus and amplification.
 */
const keysFor = (stat, action) => [
  stat,
  ...TAGS_MATCHED.map((k) => action[k]).filter(Boolean).map((tag) => scopedStat(tag, stat)),
];

/**
 * Which heading a traced row files under, for the panels that separate them. `atk` and `hp` are
 * a fold rather than a sum — `base x (1 + bonus%) + flat` — so grouping the three apart is what
 * makes the arithmetic legible instead of a column of numbers that do not add up to the total.
 */
const SECTION_OF = {
  [BASE_ATK]: "Base ATK", [BONUS_ATK]: "Bonus ATK", [FLAT_ATK]: "Flat ATK",
  [BASE_HP]: "Base HP", [BONUS_HP]: "Bonus HP", [FLAT_HP]: "Flat HP",
};

/**
 * What an action is, for the hover on its own name: the stat it scales off, its element, its
 * damage type. Each is just the engine's own token, uppercased — no abbreviating, so LIBERATION
 * reads as LIBERATION rather than a shortened stand-in for it. Some actions carry no element
 * (an outro, say), so blanks are dropped.
 */
const actionInfo = (action) =>
  [action.scaling ?? SCALE_ATK, action.element, action.type].filter(Boolean).map((t) => t.toUpperCase());

/** What the motion value is multiplying, named for the damage panel. */
const STAT_SOURCE = { atk: "ATK", hp: "HP", def: "DEF", dot: "dot constant", tune: "tune constant" };

/** Every entry that fed `stats`, summed per source and kept in contribution order. */
function tracing(snapshot, stats) {
  const wanted = new Set(stats);
  const by = new Map();
  for (const e of snapshot.entries) {
    if (!wanted.has(e.stat)) continue;
    const key = `${e.source}\u0000${e.stat}`;
    const seen = by.get(key);
    if (seen) seen.value += e.value;
    else {
      by.set(key, {
        source: e.source, stat: e.stat, value: e.value,
        section: SECTION_OF[splitStat(e.stat)[0]] ?? null,
      });
    }
  }
  return [...by.values()];
}

const num = (v, digits = 0) =>
  v == null ? "" : v.toLocaleString("en-US", { maximumFractionDigits: digits });

/**
 * The resource columns, and which bar each reads. Energy and concerto belong to the resonator;
 * off-tune is one bar the whole team fills, so its trace comes off the team's log. The column
 * key and the counter key are the same string, which is also the field an action declares.
 */
const RESOURCES = [
  { key: ENERGY, team: false },
  { key: CONCERTO, team: false },
  { key: OFFTUNE, team: true },
];

/**
 * Where a resource stands after one action, as rows.
 *
 * Unlike a stat, a counter is a **running total** carried across the whole rotation rather than
 * rebuilt each action — so the interesting question is not what sums to the displayed number but
 * what this cast changed. The panel opens with what was already banked and then lists each thing
 * that moved it, which is the same shape as every other panel even though the arithmetic differs.
 */
function resourceTrace(snap, { key, team }, total) {
  const log = (team ? snap.teamCounterLog : snap.counterLog) ?? [];

  // merge repeats: one source may move a counter several times in a cast
  const by = new Map();
  for (const e of log) {
    if (e.counter !== key) continue;
    by.set(e.source, (by.get(e.source) ?? 0) + e.delta);
  }

  const moved = [...by].map(([source, value]) => ({ source, value }));
  const rows = [];
  // What the rotation had already banked. Shown even when nothing moved, so the number in the
  // column is always accounted for rather than appearing from nowhere on a row that spent nothing.
  const carried = total - moved.reduce((n, m) => n + m.value, 0);
  if (Math.abs(carried) > 1e-9) rows.push({ source: "carried in", value: carried });
  rows.push(...moved.filter((m) => Math.abs(m.value) > 1e-9));

  // A liberation declares -125 energy and an outro -100 concerto, but neither moves the running
  // total: they consume whatever is banked, which no running total can express. The declared cost
  // is real and worth showing, so it sits below the total rather than pretending to sum into it.
  const declared = snap.action[key] ?? 0;
  if (declared < 0 && !moved.some((m) => m.value < 0)) {
    rows.push({ source: "declared cost", label: "spends the bar",
      value: declared, place: "afterTotal" });
  }
  return rows;
}

/** The four generic forte gauges, shown under their own names rather than a kit's word. */
const FORTE_GAUGES = [FORTE1, FORTE2, FORTE3, FORTE4];

/** How the terminal marks a chain's member, and what it calls the bottom row — both occupy the
 *  action column, so both have to fit inside its measured width. */
const PART_PREFIX = "  · ";
const TOTAL_LABEL = "team total";

/**
 * The values and the source trace for one evaluated action.
 *
 * A chain's members go through this exactly as a lone action does, so a part carries the same
 * stats, resources and hover traces as any other row — the only thing a chain changes is that
 * its own row reports the whole chain's motion value and summed damage.
 */
function rowValues(snap, { mv, avg, config, levels }) {
  const raw = {
    atk: snap.atk,
    hp: snap.hp,
    mv,
    dmgBonus: snap.dmgBonus,
    amp: snap.amp,
    cr: snap.stat(CRIT_RATE),
    cd: snap.stat(CRIT_DMG),
    // what the hit actually meets: the enemy's defence as a fraction of its base, and the
    // resistance left after ignore and shred. Both need the fight's config, not just the buffs.
    effDef: config ? effectiveDef(snap, config) * 100 : null,
    effRes: config ? effectiveRes(snap, config) : null,
    energy: snap.counters[ENERGY] ?? 0,
    concerto: snap.counters[CONCERTO] ?? 0,
    offtune: snap.teamCounters[OFFTUNE] ?? 0,
    avg,
  };
  for (const key of FORTE_GAUGES) raw[`gauge:${key}`] = snap.counters[key] ?? 0;

  // where each value came from, for the hover panels
  const sources = {};
  for (const res of RESOURCES) {
    const traced = resourceTrace(snap, res, raw[res.key]);
    if (traced.length) sources[res.key] = traced;
  }
  for (const [key, feeds] of Object.entries(FEEDS)) {
    const traced = tracing(snap, feeds().flatMap((s) => keysFor(s, snap.action)));
    if (traced.length) sources[key] = traced;
  }
  // The action's own motion value is not a stat anything contributed, so it has no entry to
  // trace — but it is the number every multiplier in the list is multiplying, and the row
  // reads as nonsense without it. `percent` because a motion value is written in percent
  // units like the multipliers are, and nothing else can infer that from a made-up name.
  if (raw.mv) {
    // The three parts do not all sum: `(base + added) x (1 + bonus) x (1 + special)`. The two
    // multiplying halves are shown as the factors they are and sorted after the adding ones, so
    // the panel reads in the order the formula applies and its rows reach the total it prints.
    const isFactor = (r) => [MUL_MV, SPECIAL_MV].includes(splitStat(r.stat ?? "")[0]);
    const parts = (sources.mv ?? []).map((r) => (isFactor(r)
      ? { ...r, mult: true, value: 1 + r.value / 100 }
      : r));
    sources.mv = [
      { source: snap.action.id, stat: "Base MV", value: snap.action.mv, percent: true },
      ...parts.filter((r) => !r.mult),
      ...parts.filter((r) => r.mult),
    ];
  }

  // How much the build lifts the bare base stat: (flat + bonus% x base) / base, which is the
  // same as (total - base) / base. It is the one number that says whether a piece of gear is
  // worth more than another, and it cannot be read off the three sections separately.
  for (const [key, [baseStat, bonusStat, flatStat], noun] of [
    ["atk", [BASE_ATK, BONUS_ATK, FLAT_ATK], "attack"],
    ["hp", [BASE_HP, BONUS_HP, FLAT_HP], "HP"],
  ]) {
    const traced = sources[key];
    if (!traced) continue;
    const sum = (stat) => traced
      .filter((r) => r.stat && splitStat(r.stat)[0] === stat)
      .reduce((n, r) => n + r.value, 0);
    const base = sum(baseStat);
    if (!base) continue;
    sources[key] = [...traced, {
      source: `Relative ${noun} increase`,
      value: ((sum(flatStat) + (sum(bonusStat) / 100) * base) / base) * 100,
      percent: true, place: "beforeTotal",
    }];
  }

  // The enemy-side panels end with the multiplier the formula actually applies, which is the
  // thing the ignore/shred rows above it are working towards — a res of 20% is a x0.8, and the
  // relationship is not linear once resistance goes negative or past 80%.
  if (config) {
    const f = damageFactors(snap, config, levels);
    // Always present, even with nothing shredding: the factor is the point of these panels, and
    // an unshredded 20% resistance still costs a fifth of the hit. `afterTotal` puts it below
    // the total, since it is what the total becomes rather than another thing summed into it.
    sources.effRes = [...(sources.effRes ?? []),
      { source: "resistance factor", value: f.resFactor, mult: true, place: "afterTotal" }];
    sources.effDef = [...(sources.effDef ?? []),
      { source: "defense factor", value: f.defFactor, mult: true, place: "afterTotal" }];

    // Every term of the damage product. The stat leads rather than the motion value: it is the
    // amount being multiplied and everything below it is a multiplier on that amount, so reading
    // top to bottom follows the arithmetic instead of opening with a factor of nothing.
    sources.avg = [
      { source: STAT_SOURCE[f.scaling] ?? f.scaling, label: "final stat", value: f.finalStat },
      { source: snap.action.id, label: "motion value", value: f.finalMv, mult: true },
      { source: "buffs", label: "amplification", value: f.ampFactor, mult: true },
      { source: "buffs", label: "damage bonus", value: f.bonusFactor, mult: true },
      // Only tune scaling receives it, and only tune scaling should have to read a row about it.
      ...(f.scaling === SCALE_TUNE
        ? [{ source: "buffs", label: "tune break boost", value: f.tbbFactor, mult: true }]
        : []),
      { source: "enemy", label: "res factor", value: f.resFactor, mult: true },
      { source: "enemy", label: "def factor", value: f.defFactor, mult: true },
      { source: "buffs", label: "damage dealt", value: f.dealtFactor, mult: true },
      { source: "crit", label: "average crit", value: f.critFactor, mult: true },
    ];
  }

  return { raw, sources };
}

/**
 * @param lines    from collapseChains(): [{ id, isChain, parts, snap, mv, avg, ... }]
 * @param options  { strip: RegExp to trim from action names }
 *
 * The forte gauges are shown under their generic names. A resonator's own word for one — Qi,
 * Mingfire, Empirical Data — only means anything next to that resonator, and this table holds
 * a whole team, where the same column would have to answer to three different names.
 */
export function buildReport(lines, { strip = null, config = null, levels = null } = {}) {
  // No column declares a width: every one is measured from what this report actually holds,
  // further down. `align: "left"` is what separates the text columns from the numeric ones —
  // it decides both the padding side and, in the web view, which per-character unit sizes them.
  const columns = [
    { key: "action", label: "action", align: "left" },

    // `percent` marks a column whose value is a ratio in percent units rather than a flat
    // amount. atk and hp are not: they are totals in whole points, even though percent stats
    // fed them.
    { key: "mv", label: "mv%", digits: 2, percent: true },
    { key: "avg", label: "avg dmg" },
    { key: "atk", label: "atk" },
    { key: "hp", label: "hp" },
    { key: "dmgBonus", label: "dmg%", digits: 1, percent: true },
    { key: "amp", label: "amp%", digits: 1, percent: true },
    { key: "cr", label: "cr%", digits: 1, percent: true },
    { key: "cd", label: "cd%", digits: 1, percent: true },
    { key: "effDef", label: "def%", digits: 1, percent: true },
    { key: "effRes", label: "res%", digits: 1, percent: true },

    { key: "energy", label: "energy", digits: 1, hideIfZero: true },
    { key: "concerto", label: "concerto", digits: 1, hideIfZero: true },
    { key: "offtune", label: "offtune", digits: 2, hideIfZero: true },
    ...FORTE_GAUGES.map((key) => ({ key: `gauge:${key}`, label: key, hideIfZero: true })),
  ];

  const name = (id) => (strip ? id.replace(strip, "") : id);

  const rows = lines.map((line) => {
    const { raw, sources } = rowValues(line.snap, { mv: line.mv, avg: line.avg, config, levels });
    raw.action = name(line.id);

    return {
      line,
      raw,
      sources,
      // what the action *is*, for the hover on its name. A chain takes it from the part whose
      // stats it is reporting, the same part every other value on the row comes from.
      info: actionInfo(line.snap.action),
      // what the motion value is multiplying, so the mv panel can name its own unit
      scaling: line.snap.action.scaling ?? SCALE_ATK,
      parts: line.isChain
        ? line.parts.map((p) => {
            const part = rowValues(p.snap, { mv: mvPercent(p.snap), avg: p.dmg.avg, config, levels });
            part.raw.action = name(p.snap.action.id);
            part.info = actionInfo(p.snap.action);
            part.type = p.snap.action.type ?? "";
            part.scaling = p.snap.action.scaling ?? SCALE_ATK;
            part.isShown = p.snap === line.snap;
            return part;
          })
        : [],
    };
  });

  // drop resource columns nobody moved — a chain's parts count, since a gauge may move on a
  // member without showing on the row that reports the hardest-hitting one
  const moved = (r, key) => Math.abs(r.raw[key] ?? 0) > 1e-9;
  const used = columns.filter((c) => !c.hideIfZero
    || rows.some((r) => moved(r, c.key) || r.parts.some((p) => moved(p, c.key))));

  // Every column is sized to what this report actually holds rather than to the widest value it
  // could theoretically hold: its own heading, its rows, and a chain's parts — which the terminal
  // indents, so that prefix counts. One spare character keeps neighbours from touching.
  //
  // The declared widths above are only starting points; a report of nothing but aero basics gets
  // a narrow tags column, and one that never breaks 1,000% motion value gets a narrow mv column.
  const shown = (r, c) => {
    const v = r.raw[c.key];
    return typeof v === "number"
      ? num(v, c.digits ?? 0) + (c.percent ? "%" : "")
      : String(v ?? "");
  };
  const sized = used.map((c) => {
    const lens = [c.label.length, ...(c.key === "action" ? [TOTAL_LABEL.length] : [])];
    for (const r of rows) {
      lens.push(shown(r, c).length);
      for (const p of r.parts) {
        lens.push(shown(p, c).length + (c.key === "action" ? PART_PREFIX.length : 0));
      }
    }
    return { ...c, width: Math.max(...lens) + 1 };
  });

  return { columns: sized, rows, total: rows.reduce((n, r) => n + r.raw.avg, 0) };
}

/**
 * What each resonator contributed to a combined report, read back off the rows rather than
 * tracked alongside them — every snapshot already knows which slot cast it.
 */
export function totalsBySlot(report) {
  const by = new Map();
  for (const row of report.rows) {
    const name = row.line.snap.slot;
    by.set(name, (by.get(name) ?? 0) + row.raw.avg);
  }
  return by;
}

export function renderReport(report, { showParts = true } = {}) {
  const { columns, rows, total } = report;
  const cell = (col, value) => {
    const text = typeof value === "number" ? num(value, col.digits ?? 0) : String(value ?? "");
    return col.align === "left" ? text.padEnd(col.width) : text.padStart(col.width);
  };

  const out = [];
  out.push(columns.map((c) => cell(c, c.label)).join(""));
  const width = columns.reduce((n, c) => n + c.width, 0);
  out.push("-".repeat(width));

  for (const row of rows) {
    out.push(columns.map((c) => cell(c, row.raw[c.key])).join(""));
    // a part is a full row like any other, only indented and marked with its damage type
    if (showParts && row.parts.length) {
      for (const p of row.parts) {
        out.push(columns.map((c) => (c.key === "action"
          ? cell(c, `${PART_PREFIX}${p.raw.action}`)
          : cell(c, p.raw[c.key]))).join("")
          + (p.isShown ? `  <- stats shown on the chain (${p.type})` : `  ${p.type}`));
      }
    }
  }

  out.push("-".repeat(width));
  // the total belongs under the damage column wherever that column happens to sit
  out.push(columns.map((c, i) => cell(c, i === 0 ? "total" : c.key === "avg" ? total : "")).join(""));
  return out.join("\n");
}

/** Every buff contribution behind one row, summed per source and stat. */
export function explain(snapshot) {
  const by = new Map();
  for (const e of snapshot.entries) {
    const k = `${e.source} → ${e.stat}`;
    by.set(k, (by.get(k) ?? 0) + e.value);
  }
  return [...by].map(([label, value]) => ({ label, value }));
}
