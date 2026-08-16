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
  Stat, Resource, Scaling,
  scopedStat, TAGS_MATCHED, splitStat, statLabel,
} from "./stats.js";
import { mvPercent, effectiveDef, effectiveRes, damageFactors } from "./damage.js";
import type { DamageConfig } from "./damage.js";
import type { ChainGroup } from "./kit.js";
import type { ResolvedSnapshot, StatEntry } from "./state.js";

/** One line in a source-trace panel — what fed a value, and how to read it. */
export interface TraceEntry {
  source: string;
  stat?: string;
  value: number;
  section?: string | null;
  percent?: boolean;
  mult?: boolean;
  place?: "beforeTotal" | "afterTotal";
  label?: string;
}

/** The raw (already-formatted-ready) values for one row, keyed by column. */
export type RawRow = Record<string, number | string | null | undefined>;

/** The hover-trace panels for one row, keyed by column. */
export type Sources = Record<string, TraceEntry[]>;

/**
 * Which stats feed a column, so a value can be traced back to what produced it. A function
 * where the answer depends on the action: the damage bonus a hit receives is the generic one
 * plus the ones scoped to its own element, type and scaling.
 */
const FEEDS: Record<string, () => string[]> = {
  atk: () => [Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk],
  hp: () => [Stat.BaseHp, Stat.BonusHp, Stat.FlatHp],
  mv: () => [Stat.AddMv, Stat.MulMv, Stat.SpecialMv],
  cr: () => [Stat.CritRate],
  cd: () => [Stat.CritDmg],
  dmgBonus: () => [Stat.DmgBonus],
  amp: () => [Stat.Amp],
  dealt: () => [Stat.DmgDealt],
  // what is being done to the enemy rather than to the resonator
  effDef: () => [Stat.DefIgnore, Stat.DefShred, Stat.DefReduce],
  effRes: () => [Stat.ResIgnore, Stat.ResShred],
};

/**
 * Every key a stat can arrive under for this action: the stat itself, plus the same stat scoped
 * to the action's element and damage type. Any stat can be scoped, so this applies to all of
 * them rather than only to damage bonus and amplification.
 */
const keysFor = (stat: string, action: Record<string, unknown>): string[] => [
  stat,
  ...TAGS_MATCHED.map((k) => action[k]).filter((v): v is string => Boolean(v))
    .map((tag) => scopedStat(tag, stat)),
];

/**
 * Which heading a traced row files under, for the panels that separate them. `atk` and `hp` are
 * a fold rather than a sum — `base x (1 + bonus%) + flat` — so grouping the three apart is what
 * makes the arithmetic legible instead of a column of numbers that do not add up to the total.
 */
const SECTION_OF: Record<string, string> = {
  [Stat.BaseAtk]: "Base ATK", [Stat.BonusAtk]: "Bonus ATK", [Stat.FlatAtk]: "Flat ATK",
  [Stat.BaseHp]: "Base HP", [Stat.BonusHp]: "Bonus HP", [Stat.FlatHp]: "Flat HP",
};

/**
 * What an action is, for the hover on its own name: the stat it scales off, its element, its
 * damage type. Each is just the engine's own token, uppercased — no abbreviating, so LIBERATION
 * reads as LIBERATION rather than a shortened stand-in for it. Some actions carry no element
 * (an outro, say), so blanks are dropped.
 */
const actionInfo = (action: { scaling?: string | null; element?: string | null; type?: string | null }): string[] =>
  [action.scaling ?? Scaling.Atk, action.element, action.type]
    .filter((v): v is string => Boolean(v)).map((t) => t.toUpperCase());

/** What the motion value is multiplying, named for the damage panel. */
const STAT_SOURCE: Record<string, string> = {
  [Scaling.Atk]: "ATK", [Scaling.Hp]: "HP", [Scaling.Def]: "DEF",
  [Scaling.Dot]: "dot constant", [Scaling.Tune]: "tune constant",
};

/** Every entry that fed `stats`, summed per source and kept in contribution order. */
function tracing(snapshot: ResolvedSnapshot, stats: string[]): TraceEntry[] {
  const wanted = new Set(stats);
  const by = new Map<string, TraceEntry>();
  for (const e of snapshot.entries) {
    if (!wanted.has(e.stat)) continue;
    const key = `${e.source} ${e.stat}`;
    const seen = by.get(key);
    if (seen) seen.value += e.value;
    else {
      by.set(key, {
        source: e.source ?? "", stat: e.stat, value: e.value,
        section: SECTION_OF[splitStat(e.stat)[0]] ?? null,
      });
    }
  }
  return [...by.values()];
}

const num = (v: number | null | undefined, digits = 0): string =>
  v == null ? "" : v.toLocaleString("en-US", { maximumFractionDigits: digits });

/**
 * The resource columns, and which bar each reads. Energy and concerto belong to the resonator;
 * off-tune is one bar the whole team fills, so its trace comes off the team's log. The column
 * key and the counter key are the same string, which is also the field an action declares.
 */
const RESOURCES: Array<{ key: string; team: boolean }> = [
  { key: Resource.Energy, team: false },
  { key: Resource.Concerto, team: false },
  { key: Resource.Offtune, team: true },
];

/**
 * Where a resource stands after one action, as rows.
 *
 * Unlike a stat, a counter is a **running total** carried across the whole rotation rather than
 * rebuilt each action — so the interesting question is not what sums to the displayed number but
 * what this cast changed. The panel opens with what was already banked and then lists each thing
 * that moved it, which is the same shape as every other panel even though the arithmetic differs.
 */
function resourceTrace(
  snap: ResolvedSnapshot, { key, team }: { key: string; team: boolean }, total: number,
): TraceEntry[] {
  const log = (team ? snap.teamCounterLog : snap.counterLog) ?? [];

  // merge repeats: one source may move a counter several times in a cast
  const by = new Map<string, number>();
  for (const e of log) {
    if (e.counter !== key) continue;
    by.set(e.source ?? "", (by.get(e.source ?? "") ?? 0) + e.delta);
  }

  const moved = [...by].map(([source, value]) => ({ source, value }));
  const rows: TraceEntry[] = [];
  // What the rotation had already banked. Shown even when nothing moved, so the number in the
  // column is always accounted for rather than appearing from nowhere on a row that spent nothing.
  const carried = total - moved.reduce((n, m) => n + m.value, 0);
  if (Math.abs(carried) > 1e-9) rows.push({ source: "carried in", value: carried });
  rows.push(...moved.filter((m) => Math.abs(m.value) > 1e-9));

  // A liberation declares -125 energy and an outro -100 concerto, but neither moves the running
  // total: they consume whatever is banked, which no running total can express. The declared cost
  // is real and worth showing, so it sits below the total rather than pretending to sum into it.
  const declared = (snap.action as unknown as Record<string, number>)[key] ?? 0;
  if (declared < 0 && !moved.some((m) => m.value < 0)) {
    rows.push({ source: "declared cost", label: "spends the bar",
      value: declared, place: "afterTotal" });
  }
  return rows;
}

/** The four generic forte gauges, shown under their own names rather than a kit's word. */
const FORTE_GAUGES = [Resource.Forte1, Resource.Forte2, Resource.Forte3, Resource.Forte4];

/** How the terminal marks a chain's member, and what it calls the bottom row — both occupy the
 *  action column, so both have to fit inside its measured width. */
const PART_PREFIX = "  · ";
const TOTAL_LABEL = "team total";

/** One evaluated row's formatted values plus its hover-trace panels. */
export interface RowValues {
  raw: RawRow;
  sources: Sources;
}

/**
 * The values and the source trace for one evaluated action.
 *
 * A chain's members go through this exactly as a lone action does, so a part carries the same
 * stats, resources and hover traces as any other row — the only thing a chain changes is that
 * its own row reports the whole chain's motion value and summed damage.
 */
function rowValues(
  snap: ResolvedSnapshot,
  { mv, avg, config }: { mv: number; avg: number; config: DamageConfig | null },
): RowValues {
  const raw: RawRow = {
    atk: snap.atk,
    hp: snap.hp,
    mv,
    dmgBonus: snap.dmgBonus,
    amp: snap.amp,
    cr: snap.stat(Stat.CritRate),
    cd: snap.stat(Stat.CritDmg),
    dealt: snap.stat(Stat.DmgDealt),
    // what the hit actually meets: the enemy's defence as a fraction of its base, and the
    // resistance left after ignore and shred — both read straight off the resolved snapshot's
    // own enemyDef/enemyRes now, so unlike the rest of this panel they don't need `config`.
    effDef: effectiveDef(snap) * 100,
    effRes: effectiveRes(snap),
    energy: snap.counters[Resource.Energy] ?? 0,
    concerto: snap.counters[Resource.Concerto] ?? 0,
    offtune: snap.teamCounters[Resource.Offtune] ?? 0,
    avg,
  };
  for (const key of FORTE_GAUGES) raw[`gauge:${key}`] = snap.counters[key] ?? 0;

  // where each value came from, for the hover panels
  const sources: Sources = {};
  for (const res of RESOURCES) {
    const traced = resourceTrace(snap, res, Number(raw[res.key]) || 0);
    if (traced.length) sources[res.key] = traced;
  }
  for (const [key, feeds] of Object.entries(FEEDS)) {
    const traced = tracing(snap, feeds().flatMap((s) => keysFor(s, snap.action as unknown as Record<string, unknown>)));
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
    const isFactor = (r: TraceEntry) => [Stat.MulMv, Stat.SpecialMv].includes(splitStat(r.stat ?? "")[0] as Stat);
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
    ["atk", [Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk], "attack"],
    ["hp", [Stat.BaseHp, Stat.BonusHp, Stat.FlatHp], "HP"],
  ] as const) {
    const traced = sources[key];
    if (!traced) continue;
    const sum = (stat: string) => traced
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
    const f = damageFactors(snap, config);
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
      { source: STAT_SOURCE[f.scaling] ?? f.scaling, label: "Final Stat", value: f.finalStat },
      { source: snap.action.id, label: "Motion Value", value: f.finalMv, mult: true },
      { source: "buffs", label: "Amplification", value: f.ampFactor, mult: true },
      { source: "buffs", label: "Damage Bonus", value: f.bonusFactor, mult: true },
      // Only tune scaling receives it, and only tune scaling should have to read a row about it.
      ...(f.scaling === Scaling.Tune
        ? [{ source: "buffs", label: "Tune Break Boost", value: f.tbbFactor, mult: true }]
        : []),
      { source: "enemy", label: "Res Factor", value: f.resFactor, mult: true },
      { source: "enemy", label: "Def Factor", value: f.defFactor, mult: true },
      { source: "buffs", label: "Damage Dealt", value: f.dealtFactor, mult: true },
      { source: "crit", label: "Average Crit", value: f.critFactor, mult: true },
    ];
  }

  return { raw, sources };
}

/** A rendered column heading — width/measurement is filled in once every row is known. */
export interface Column {
  key: string;
  label: string;
  align?: "left";
  digits?: number;
  percent?: boolean;
  hideIfZero?: boolean;
  width?: number;
}

/** One rendered row — a lone action, or a chain's collapsed total plus its own parts. */
export interface ReportRow {
  line: ChainGroup;
  raw: RawRow;
  sources: Sources;
  info: string[];
  scaling: string;
  short: boolean;
  parts: ReportPart[];
}

/** One member of a chain, shown indented under its own row. */
export interface ReportPart extends RowValues {
  type: string;
  scaling: string;
  isShown: boolean;
  short: boolean;
}

export interface Report {
  columns: Column[];
  rows: ReportRow[];
  total: number;
}

/**
 * @param lines    from collapseChains(): [{ id, isChain, parts, snap, mv, avg, ... }]
 * @param options  { strip: RegExp to trim from action names }
 *
 * The forte gauges are shown under their generic names. A resonator's own word for one — Qi,
 * Mingfire, Empirical Data — only means anything next to that resonator, and this table holds
 * a whole team, where the same column would have to answer to three different names.
 */
export function buildReport(
  lines: ChainGroup[],
  { strip = null, config = null }: { strip?: RegExp | null; config?: DamageConfig | null } = {},
): Report {
  // No column declares a width: every one is measured from what this report actually holds,
  // further down. `align: "left"` is what separates the text columns from the numeric ones —
  // it decides both the padding side and, in the web view, which per-character unit sizes them.
  const columns: Column[] = [
    { key: "action", label: "action", align: "left" },

    { key: "avg", label: "avg dmg" },
    // `percent` marks a column whose value is a ratio in percent units rather than a flat
    // amount. atk and hp are not: they are totals in whole points, even though percent stats
    // fed them.
    { key: "mv", label: "mv%", digits: 2, percent: true },
    { key: "atk", label: "atk" },
    { key: "hp", label: "hp" },
    { key: "dmgBonus", label: "dmg%", digits: 1, percent: true },
    { key: "amp", label: "amp%", digits: 1, percent: true },
    { key: "cr", label: "cr%", digits: 1, percent: true },
    { key: "cd", label: "cd%", digits: 1, percent: true },
    { key: "dealt", label: "dealt%", digits: 1, percent: true },
    { key: "effDef", label: "def%", digits: 1, percent: true },
    { key: "effRes", label: "res%", digits: 1, percent: true },

    { key: "energy", label: "energy", digits: 1, hideIfZero: true },
    { key: "concerto", label: "concerto", digits: 1, hideIfZero: true },
    { key: "offtune", label: "offtune", digits: 2, hideIfZero: true },
    ...FORTE_GAUGES.map((key) => ({ key: `gauge:${key}`, label: key, hideIfZero: true })),
  ];

  const name = (id: string) => (strip ? id.replace(strip, "") : id);

  // A row earns the table's shorter treatment when it is not really a rotation beat of its
  // own: a follow-up the engine queued rather than something a rotation author placed (an
  // outro-triggered intro included, now that outros trigger them directly). A zero-damage hit
  // is still a real placed action (a healing-only Heavy Attack, say) — full weight, not dimmed.
  const isShort = (snap: ResolvedSnapshot) => snap.triggered;

  const rows: ReportRow[] = lines.map((line) => {
    const { raw, sources } = rowValues(
      line.snap as ResolvedSnapshot, { mv: line.mv, avg: line.avg, config },
    );
    raw.action = name(line.id);

    return {
      line,
      raw,
      sources,
      // what the action *is*, for the hover on its name. A chain takes it from the part whose
      // stats it is reporting, the same part every other value on the row comes from.
      info: actionInfo(line.snap.action),
      // what the motion value is multiplying, so the mv panel can name its own unit
      scaling: line.snap.action.scaling ?? Scaling.Atk,
      short: isShort(line.snap as ResolvedSnapshot),
      parts: line.isChain
        ? line.parts.map((p): ReportPart => {
            const part = rowValues(
              p.snap as ResolvedSnapshot, { mv: mvPercent(p.snap), avg: p.dmg.avg, config },
            ) as ReportPart;
            part.raw.action = name(p.snap.action.id);
            (part as unknown as { info: string[] }).info = actionInfo(p.snap.action);
            part.type = p.snap.action.type ?? "";
            part.scaling = p.snap.action.scaling ?? Scaling.Atk;
            part.isShown = p.snap === line.snap;
            part.short = isShort(p.snap as ResolvedSnapshot);
            return part;
          })
        : [],
    };
  });

  // drop resource columns nobody moved — a chain's parts count, since a gauge may move on a
  // member without showing on the row that reports the hardest-hitting one
  const moved = (r: { raw: RawRow }, key: string) => Math.abs(Number(r.raw[key]) || 0) > 1e-9;
  const used = columns.filter((c) => !c.hideIfZero
    || rows.some((r) => moved(r, c.key) || r.parts.some((p) => moved(p, c.key))));

  // Every column is sized to what this report actually holds rather than to the widest value it
  // could theoretically hold: its own heading, its rows, and a chain's parts — which the terminal
  // indents, so that prefix counts. One spare character keeps neighbours from touching.
  //
  // The declared widths above are only starting points; a report of nothing but aero basics gets
  // a narrow tags column, and one that never breaks 1,000% motion value gets a narrow mv column.
  const shown = (r: { raw: RawRow }, c: Column): string => {
    const v = r.raw[c.key];
    return typeof v === "number"
      ? num(v, c.digits ?? 0) + (c.percent ? "%" : "")
      : String(v ?? "");
  };
  const sized: Column[] = used.map((c) => {
    const lens = [c.label.length, ...(c.key === "action" ? [TOTAL_LABEL.length] : [])];
    for (const r of rows) {
      lens.push(shown(r, c).length);
      for (const p of r.parts) {
        lens.push(shown(p, c).length + (c.key === "action" ? PART_PREFIX.length : 0));
      }
    }
    return { ...c, width: Math.max(...lens) + 1 };
  });

  return { columns: sized, rows, total: rows.reduce((n, r) => n + (Number(r.raw.avg) || 0), 0) };
}

/**
 * What each resonator contributed to a combined report, read back off the rows rather than
 * tracked alongside them — every snapshot already knows which slot cast it.
 */
export function totalsBySlot(report: Report): Map<string, number> {
  const by = new Map<string, number>();
  for (const row of report.rows) {
    const name = (row.line.snap as ResolvedSnapshot).slot;
    by.set(name, (by.get(name) ?? 0) + (Number(row.raw.avg) || 0));
  }
  return by;
}

export function renderReport(report: Report, { showParts = true }: { showParts?: boolean } = {}): string {
  const { columns, rows, total } = report;
  const cell = (col: Column, value: unknown): string => {
    const text = typeof value === "number" ? num(value, col.digits ?? 0) : String(value ?? "");
    return col.align === "left" ? text.padEnd(col.width ?? 0) : text.padStart(col.width ?? 0);
  };

  const out: string[] = [];
  out.push(columns.map((c) => cell(c, c.label)).join(""));
  const width = columns.reduce((n, c) => n + (c.width ?? 0), 0);
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
export function explain(snapshot: { entries: StatEntry[] }): Array<{ label: string; value: number }> {
  const by = new Map<string, number>();
  for (const e of snapshot.entries) {
    const k = `${e.source} → ${e.stat}`;
    by.set(k, (by.get(k) ?? 0) + e.value);
  }
  return [...by].map(([label, value]) => ({ label, value }));
}
