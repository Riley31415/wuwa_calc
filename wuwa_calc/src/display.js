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
  MV, MV_BASE, DMG_BONUS, dmgBonusFor, FORTE1, FORTE2, FORTE3, FORTE4,
} from "./stats.js";

/**
 * Which stats feed a column, so a value can be traced back to what produced it. A function
 * where the answer depends on the action: the damage bonus a hit receives is the generic one
 * plus the ones scoped to its own element, type and scaling.
 */
const FEEDS = {
  atk: () => [BASE_ATK, BONUS_ATK, FLAT_ATK],
  hp: () => [BASE_HP, BONUS_HP, FLAT_HP],
  mv: () => [MV, MV_BASE],
  cr: () => [CRIT_RATE],
  cd: () => [CRIT_DMG],
  dmgBonus: (action) => [
    DMG_BONUS,
    ...[action.element, action.type, action.scaling].filter(Boolean).map(dmgBonusFor),
  ],
};

/** Every entry that fed `stats`, summed per source and kept in contribution order. */
function tracing(snapshot, stats) {
  const wanted = new Set(stats);
  const by = new Map();
  for (const e of snapshot.entries) {
    if (!wanted.has(e.stat)) continue;
    const key = `${e.source}\u0000${e.stat}`;
    const seen = by.get(key);
    if (seen) seen.value += e.value;
    else by.set(key, { source: e.source, stat: e.stat, value: e.value });
  }
  return [...by.values()];
}

const num = (v, digits = 0) =>
  v == null ? "" : v.toLocaleString("en-US", { maximumFractionDigits: digits });

/** The four generic forte gauges, shown under their own names rather than a kit's word. */
const FORTE_GAUGES = [FORTE1, FORTE2, FORTE3, FORTE4];

/**
 * @param lines    from collapseChains(): [{ id, isChain, parts, snap, mv, avg, ... }]
 * @param options  { strip: RegExp to trim from action names }
 *
 * The forte gauges are shown under their generic names. A resonator's own word for one — Qi,
 * Mingfire, Empirical Data — only means anything next to that resonator, and this table holds
 * a whole team, where the same column would have to answer to three different names.
 */
export function buildReport(lines, { strip = null } = {}) {
  const columns = [
    { key: "i", label: "#", width: 3, align: "left" },
    { key: "action", label: "action", width: 24, align: "left" },
    { key: "field", label: "field", width: 6, align: "left" },

    // `percent` marks a column whose value is a ratio in percent units rather than a flat
    // amount. atk and hp are not: they are totals in whole points, even though percent stats
    // fed them.
    { key: "atk", label: "atk", width: 8 },
    { key: "hp", label: "hp", width: 8 },
    { key: "mv", label: "mv%", width: 9, digits: 1, percent: true },
    { key: "dmgBonus", label: "dmg+%", width: 8, digits: 1, percent: true },
    { key: "cr", label: "cr%", width: 7, digits: 1, percent: true },
    { key: "cd", label: "cd%", width: 7, digits: 1, percent: true },

    { key: "energy", label: "energy", width: 9, digits: 1, hideIfZero: true },
    { key: "concerto", label: "concerto", width: 10, digits: 1, hideIfZero: true },
    { key: "offtune", label: "offtune", width: 9, digits: 2, hideIfZero: true },
    ...FORTE_GAUGES.map((key) => ({
      key: `gauge:${key}`, label: key, width: 9, hideIfZero: true,
    })),

    { key: "avg", label: "avg dmg", width: 12 },
  ];

  const rows = lines.map((line, i) => {
    const { snap } = line;
    const label = (strip ? line.id.replace(strip, "") : line.id)
      + (line.isChain ? ` (x${line.parts.length})` : "");
    const raw = {
      i,
      action: label,
      field: snap.onField ? "on" : "--",
      atk: snap.atk,
      hp: snap.hp,
      mv: line.mv,
      dmgBonus: snap.dmgBonus,
      cr: snap.stat(CRIT_RATE),
      cd: snap.stat(CRIT_DMG),
      energy: snap.counters[ENERGY] ?? 0,
      concerto: snap.counters[CONCERTO] ?? 0,
      offtune: snap.teamCounters[OFFTUNE] ?? 0,
      avg: line.avg,
    };
    for (const key of FORTE_GAUGES) raw[`gauge:${key}`] = snap.counters[key] ?? 0;

    // where each value came from, for the hover panels
    const sources = {};
    for (const [key, feeds] of Object.entries(FEEDS)) {
      const rows = tracing(snap, feeds(snap.action));
      if (rows.length) sources[key] = rows;
    }
    // The action's own motion value is not a stat anything contributed, so it has no entry to
    // trace — but it is the number every multiplier in the list is multiplying, and the row
    // reads as nonsense without it. `percent` because a motion value is written in percent
    // units like the multipliers are, and nothing else can infer that from a made-up name.
    if (raw.mv) {
      sources.mv = [
        { source: snap.action.id, stat: "Base Motion Value", value: snap.action.mv,
          percent: true },
        ...(sources.mv ?? []),
      ];
    }

    return {
      line,
      raw,
      sources,
      parts: line.isChain
        ? line.parts.map((p) => ({
            id: strip ? p.snap.action.id.replace(strip, "") : p.snap.action.id,
            type: p.snap.action.type ?? "",
            mv: p.snap.action.mv,
            avg: p.dmg.avg,
            isShown: p.snap === line.snap,
          }))
        : [],
    };
  });

  // drop resource columns nobody moved
  const used = columns.filter((c) =>
    !c.hideIfZero || rows.some((r) => Math.abs(r.raw[c.key] ?? 0) > 1e-9));

  return { columns: used, rows, total: rows.reduce((n, r) => n + r.raw.avg, 0) };
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
    if (showParts && row.parts.length) {
      for (const p of row.parts) {
        out.push(`     · ${p.id.padEnd(20)}${p.type.padEnd(9)}`
          + `${num(p.mv, 2).padStart(9)}%${num(p.avg).padStart(12)}`
          + (p.isShown ? "   <- stats shown" : ""));
      }
    }
  }

  out.push("-".repeat(width));
  out.push("total".padEnd(columns.reduce((n, c) => n + c.width, 0) - 12)
    + num(total).padStart(12));
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
