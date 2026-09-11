/**
 * Turns evaluated lines into the report the detail page renders: columns, per-row formatted
 * values, and the hover-trace panel data behind each cell. Columns nobody moved are dropped.
 */
import {
  Stat, EnemyStat, Resource, Scaling,
  scopedStat, splitStat, statLabel, tagKind,
  TAG_NAME, CAST_NAME, NODE_NAME, SCALING_NAME, RESOURCE_NAME,
} from "./engine/stats.js";
import type { Type1, StatKey } from "./engine/stats.js";
import { SWAP, DODGE, JUMP } from "./engine/rotation.js";
import { mvPercent, effectiveShred, effectiveRes, damageFactors } from "./engine/damage.js";
import { BASE_RESISTANCE } from "./shared/tunebreak.js";
import type { Action } from "./engine/rotation.js";
import type { ChainGroup, ResolvedSnapshot } from "./engine/evaluate.js";
import type { HeldBuff } from "./engine/state.js";

/** One line in a source-trace panel. */
export interface TraceEntry {
  source: string;
  stat?: StatKey;
  value: number;
  section?: string | null;
  percent?: boolean;
  mult?: boolean;
  place?: "beforeTotal" | "afterTotal";
  label?: string;
  /** Decimals for this row when the panel's default (4) is too many. */
  digits?: number;
  /** Which team member granted this — the panel's colour bar (`Buff.owner`). */
  owner?: string | null;
  /** A total rather than a contribution: rendered like the panel's own Total row. */
  summary?: boolean;
  /** Identical contributions folded into this row (`foldDuplicates`) — the `xN` after the name. */
  count?: number;
  /** Printed in the value column in place of the number — for a row that reports something other
   *  than an amount (a gauge this cast wipes, whose own figure is "whatever was there"). */
  text?: string;
}

export type RawRow = Record<string, number | string | null | undefined>;
export type Sources = Record<string, TraceEntry[]>;

/** One formatter per (digits, pad, group): `toLocaleString` builds a fresh Intl.NumberFormat per
 *  call (~22µs) and a table draw makes ~30 calls a row. */
const formatters = new Map<string, Intl.NumberFormat>();
export const fmt = (v: number | string | null | undefined, digits = 0, pad = false, group = true): string => {
  if (typeof v !== "number") return String(v ?? "");
  const key = `${digits}${pad ? "p" : ""}${group ? "g" : ""}`;
  let f = formatters.get(key);
  if (!f) formatters.set(key, f = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: pad ? digits : 0, useGrouping: group }));
  return f.format(v);
};

const FORTE_GAUGES = [Resource.Forte1, Resource.Forte2, Resource.Forte3, Resource.Forte4, Resource.Forte5];

/** Columns that always print their full digit count rather than trimming trailing zeros — the
 *  forte gauges among them, so a gauge's column reads down a single line of decimal points
 *  instead of every cell trimming to its own length. */
export const PAD_DIGITS_COLUMNS = new Set(["energy", "concerto", "offtune", "mv", "dmgBonus", "amp", "cr", "cd", "dealt", "effDef",
  ...FORTE_GAUGES.map((key) => `gauge:${RESOURCE_NAME[key]}`)]);
/** The one column that keeps thousands separators. */
export const GROUPED_COLUMNS = new Set(["avg"]);

/** How many decimals a value needs, two at most — 4 is none, 4.5 is one, 4.52 is two. */
const decimalsOf = (v: number): number => {
  const text = Math.abs(v).toFixed(2);
  return text.endsWith("00") ? 0 : text.endsWith("0") ? 1 : 2;
};

/** How many decimals this cell prints: the count `buildReport` stamped for that resonator where it
 *  stamped one (the forte gauges), else the column's own. */
export const digitsOf = (raw: RawRow, col: Column): number => {
  const own = raw[`digits:${col.key}`];
  return typeof own === "number" ? own : (col.digits ?? 0);
};

/** A stat plus the same stat scoped to the action's element and damage types. */
const keysFor = (action: Action, ...stats: (Stat | EnemyStat)[]): StatKey[] =>
  stats.flatMap((stat) => [
    stat,
    ...[action.element, action.type1, action.type2].filter((tag) => tag !== null)
      .map((tag) => scopedStat(tag!, stat)),
  ]);

const special = (action: Action): boolean =>
  action.scaling === Scaling.Dot || action.scaling === Scaling.Tune || action.scaling === Scaling.Fixed;
const fixed = (action: Action): boolean => action.scaling === Scaling.Fixed;

/** Which stats feed a column (damage.ts's `damageFactors`): dot/tune read no damage bonus and crit
 *  only off their Negative Status's scoped crit; tune reads no amp, a dot only its status-scoped
 *  amp and neither Damage Dealt nor penetration; fixed reads nothing. */
const FEEDS: Record<string, (action: Action) => StatKey[]> = {
  atk: (a) => keysFor(a, Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk),
  hp: (a) => keysFor(a, Stat.BaseHp, Stat.BonusHp, Stat.FlatHp),
  def: (a) => keysFor(a, Stat.BaseDef, Stat.BonusDef, Stat.FlatDef),
  mv: (a) => keysFor(a, Stat.AddMv, Stat.MulMv),
  cr: (a) => (fixed(a) ? [] : !special(a) ? keysFor(a, Stat.CritRate) : a.type2 === null ? [] : [scopedStat(a.type2, Stat.CritRate)]),
  cd: (a) => (fixed(a) ? [] : !special(a) ? keysFor(a, Stat.CritDmg) : a.type2 === null ? [] : [scopedStat(a.type2, Stat.CritDmg)]),
  er: (a) => keysFor(a, Stat.Er),
  dmgBonus: (a) => (special(a) ? [] : keysFor(a, Stat.DmgBonus)),
  amp: (a) => (a.scaling === Scaling.Tune || fixed(a) ? []
    : a.scaling !== Scaling.Dot ? keysFor(a, Stat.Amp)
    : a.type2 === null ? [] : [scopedStat(a.type2, Stat.Amp)]),
  dealt: (a) => (a.scaling === Scaling.Dot || fixed(a) ? [] : keysFor(a, Stat.TotalDmg, Stat.DamageTaken)),
  effDef: (a) => (fixed(a) ? []
    : a.scaling === Scaling.Dot ? keysFor(a, EnemyStat.DefReduce)
    : keysFor(a, Stat.DefIgnoreNew, Stat.DefIgnoreOld, EnemyStat.DefReduce)),
  effRes: (a) => (a.scaling === Scaling.Dot ? keysFor(a, EnemyStat.ResReduce)
    : fixed(a) ? []
    : keysFor(a, Stat.ResIgnore, EnemyStat.ResReduce)),
  // energy/concerto/offtune are running totals — `rowValues()` builds their panels by hand
};

/** Panel section per stat: atk/hp/def fold `base x (1 + bonus%) + flat`, and the two DEF ignores
 *  stack differently from the enemy's own reduce, so each gets its own heading. */
const SECTION_OF: Partial<Record<Stat | EnemyStat, string>> = {
  [Stat.BaseAtk]: "Base ATK", [Stat.BonusAtk]: "Bonus ATK", [Stat.FlatAtk]: "Flat ATK",
  [Stat.BaseHp]: "Base HP", [Stat.BonusHp]: "Bonus HP", [Stat.FlatHp]: "Flat HP",
  [Stat.BaseDef]: "Base DEF", [Stat.BonusDef]: "Bonus DEF", [Stat.FlatDef]: "Flat DEF",
  [Stat.DefIgnoreNew]: "DEF Ignore (new)", [Stat.DefIgnoreOld]: "DEF Ignore (old)",
  [EnemyStat.DefReduce]: "DEF Reduce",
  [Stat.ResIgnore]: "RES Ignore", [EnemyStat.ResReduce]: "RES Reduce",
  [Stat.TotalDmg]: "Total Damage", [Stat.DamageTaken]: "Damage Taken",
};

/** One line of the hover on an action's name. `source` marks a row that is a *name* (what
 *  triggered this), coloured by the kit it came from. */
export interface InfoEntry { label: string; value: string; source?: string }

const actionInfo = (
  action: Action, type: Type1 | null, triggered: boolean, triggeredBy: HeldBuff | null,
): InfoEntry[] => {
  const info: InfoEntry[] = [];
  const push = (label: string, value: string | null) => { if (value) info.push({ label, value }); };
  push("Node", action.node === null ? null : NODE_NAME[action.node]);
  push("Cast", action.cast === null ? null : CAST_NAME[action.cast]);
  push("Cast 2", action.cast2 === null ? null : CAST_NAME[action.cast2]);
  push("Attribute", action.element === null ? null : TAG_NAME[action.element]);
  push("Scaling", action.scaling === null ? null : SCALING_NAME[action.scaling]);
  push("Type", type === null ? null : TAG_NAME[type]);
  push("Type 2", action.type2 === null ? null : TAG_NAME[action.type2]);
  push("Cutscene", String(action.cutscene));
  push("Swap out", String(action.swapOut));
  // the raw engine flag: a Tune Break is triggered with nobody to credit
  push("Triggered", String(triggered));
  if (triggeredBy) info.push({ label: triggeredBy.name, value: "", source: triggeredBy.source });
  return info;
};

const STAT_SOURCE: Partial<Record<Scaling, string>> = {
  [Scaling.Atk]: "ATK", [Scaling.Hp]: "HP", [Scaling.Def]: "DEF",
  [Scaling.Dot]: "dot constant", [Scaling.Tune]: "tune constant",
};

/** Sort rank: unscoped first, then element-, type-, type2-scoped. */
function tagRank(key: StatKey): number {
  const tag = splitStat(key)[1];
  return tag === null ? 0 : tagKind(tag);
}

/** Every entry that fed `stats`, summed per source (`merge: false` keeps each grant its own row —
 *  the resource panels, where the count matters), sorted broadest scope first. */
function tracing(snapshot: ResolvedSnapshot, stats: StatKey[], merge = true): TraceEntry[] {
  const wanted = new Set(stats);
  const by = new Map<string, TraceEntry>();
  const rows: TraceEntry[] = [];
  for (const e of snapshot.entries) {
    if (!wanted.has(e.stat)) continue;
    const key = `${e.source} ${e.stat}`;
    const seen = merge ? by.get(key) : undefined;
    if (seen) seen.value += e.value;
    else {
      const [stat, tag] = splitStat(e.stat);
      // the enemy's own 20% is held as RES Reduce (tunebreak.ts) but reads as a baseline
      const base = e.source === BASE_RESISTANCE.name;
      const row = {
        source: e.source ?? "", stat: e.stat, value: e.value,
        section: base ? "Base RES" : SECTION_OF[stat] ?? (tag === null ? null : statLabel(e.stat)),
        owner: e.owner ?? null,
      };
      by.set(key, row);
      rows.push(row);
    }
  }
  return rows.sort((a, b) => tagRank(a.stat ?? 0) - tagRank(b.stat ?? 0));
}

export const columnOf = (report: Report, key: string): Column | undefined => report.columns.find((c) => c.key === key);

/** A gauge cell's "/cap" — `maxForteN` where the Resonator declares one. */
export const gaugeSuffix = (raw: RawRow, key: string): string => {
  const cap = raw[`max:${key}`];
  return typeof cap === "number" ? `/${fmt(cap, 0, false, false)}` : "";
};

/** Off-tune's raw unit runs finer than the game's displayed points — display-only /10000. */
const RESOURCE_SCALE = { energy: 1, concerto: 1, offtune: 10000 } as const;

export interface RowValues {
  raw: RawRow;
  sources: Sources;
  /** Columns a stat buff actually moved this action (not just carried its own declared trace). */
  buffed: Set<string>;
}

/** Columns a group row recombines across its members; everything else is the last member's. */
const COMBINED_COLUMNS = ["mv", "energy", "concerto", "offtune",
  ...FORTE_GAUGES.map((key) => `gauge:${RESOURCE_NAME[key]}`)];

const wentThrough = (row: TraceEntry): boolean => row.mult === true || row.section === MV_MULTIPLIER;

/** Rows identical in all but amount fold into one `Name xN` summing them; a multiplier folds the
 *  other way (kept once, value unchanged). */
function foldDuplicates(rows: TraceEntry[]): TraceEntry[] {
  const out: TraceEntry[] = [];
  const at = new Map<string, { row: TraceEntry; n: number }>();
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
    if (wentThrough(row)) continue;
    seen.row.value += row.value;
    seen.row.count = seen.n;
  }
  return out;
}

/** Off-tune's buildup-rate section and energy's regen-multiplier section: stats, not banked
 *  amounts, so a group row takes them from its last member only. */
export const OFFTUNE_RATE = "Buildup Rate";
export const ENERGY_RATE = "Regen Multiplier";
/** The MV panel's multiplying half (Stat.MulMv), kept out of the summing section. */
export const MV_MULTIPLIER = "MV Multiplier";

function rowValues(
  snap: ResolvedSnapshot,
  { mv, avg }: { mv: number; avg: number },
  members: ResolvedSnapshot[] = [],
): RowValues {
  // no motion value = not a damage cast: mv/avg blank rather than "0"
  const dealsDamage = mv !== 0;
  // Swap/Dodge/Jump are nobody's hit: only atk/hp/def/er stand
  const filler = snap.action === SWAP || snap.action === DODGE || snap.action === JUMP;
  const buffed = new Set<string>();
  const raw: RawRow = {
    member: snap.member,
    atk: snap.atk,
    hp: snap.hp,
    def: snap.def,
    mv: dealsDamage ? mv : null,
    // what a dot/tune/fixed hit doesn't read is blank, matching `FEEDS`
    dmgBonus: filler || special(snap.action) ? null : snap.dmgBonus,
    amp: filler || fixed(snap.action) ? null : snap.action.scaling === Scaling.Tune ? null
      : snap.action.scaling === Scaling.Dot ? snap.type2Amp : snap.amp,
    cr: filler || fixed(snap.action) ? null : special(snap.action) ? snap.type2CritRate : snap.stat(Stat.CritRate),
    cd: filler || fixed(snap.action) ? null : special(snap.action) ? snap.type2CritDmg : snap.stat(Stat.CritDmg),
    // the column is the pair's combined lift, since Total Damage and Damage Taken multiply
    dealt: filler || snap.action.scaling === Scaling.Dot || fixed(snap.action) ? null
      : ((1 + snap.stat(Stat.TotalDmg) / 100) * (1 + snap.stat(Stat.DamageTaken) / 100) - 1) * 100,
    effDef: filler || fixed(snap.action) ? null : effectiveShred(snap) * 100,
    effRes: filler || fixed(snap.action) ? null : effectiveRes(snap),
    er: snap.stat(Stat.Er),
    energy: snap.energy / RESOURCE_SCALE.energy,
    concerto: snap.concerto / RESOURCE_SCALE.concerto,
    offtune: snap.offtune / RESOURCE_SCALE.offtune,
    // what each held coming in — the running-column blanking reads these (page/detail.ts stepRow)
    "before:energy": snap.energyBefore / RESOURCE_SCALE.energy,
    "before:concerto": snap.concertoBefore / RESOURCE_SCALE.concerto,
    "before:offtune": snap.offtuneBefore / RESOURCE_SCALE.offtune,
    avg: dealsDamage ? avg : null,
  };
  FORTE_GAUGES.forEach((key, i) => {
    raw[`gauge:${RESOURCE_NAME[key]}`] = snap.forte[i]!;
    raw[`before:gauge:${RESOURCE_NAME[key]}`] = snap.forteBefore[i]!;
    if (snap.maxForte[i]) raw[`max:gauge:${RESOURCE_NAME[key]}`] = snap.maxForte[i];
  });
  // red flags for the action table: concerto spent short, a gauge left below 0 / refilled early
  raw["short:concerto"] = snap.concertoShort ? 1 : 0;
  FORTE_GAUGES.forEach((key, i) => { raw[`short:gauge:${RESOURCE_NAME[key]}`] = snap.forteShort[i] ? 1 : 0; });

  // a panel with a heading and Total 0 is an answer; only blank cells drop theirs
  const sources: Sources = {};
  for (const [key, feeds] of Object.entries(FEEDS)) sources[key] = tracing(snap, feeds(snap.action));
  // res shows what's *left*, so every feeding row is negated to add up to it
  sources.effRes = (sources.effRes ?? []).map((r) => ({ ...r, value: -r.value }));

  // running totals: the panel shows what moved the counter *this* action, footed to `moved:`
  const RESOURCE_STAT = { energy: [Stat.AddEnergy], concerto: [Stat.AddConcerto], offtune: [Stat.AddOfftune] } as const;
  const RESOURCE_DIGITS = { energy: 2, concerto: 2, offtune: 4 } as const;
  for (const key of ["energy", "concerto", "offtune"] as const) {
    // an outro wipes energy outright, so nothing contributed to what the cell reads
    const wiped = key === "energy" && snap.energyWiped;
    const declared = wiped ? 0 : snap.action[key] / RESOURCE_SCALE[key];
    const traced = wiped ? [] : RESOURCE_STAT[key]
      .flatMap((st) => tracing(snap, keysFor(snap.action, st), false))
      .map((r) => ({ ...r, value: r.value / RESOURCE_SCALE[key] }));
    const rows: TraceEntry[] = [];
    const digits = RESOURCE_DIGITS[key];
    if (declared) rows.push({ source: snap.action.name, value: declared, digits, owner: snap.member });
    rows.push(...traced.map((r) => ({ ...r, digits })));
    const folded = foldDuplicates(rows);
    if (folded.length || wiped) sources[key] = folded;
    if (traced.length) buffed.add(key);
    raw[`moved:${key}`] = rows.reduce((n, r) => n + r.value, 0);
  }
  // energy banks `(declared + AddEnergy) x (1 + Energy Regen Multiplier)` (evaluate.ts)
  if (!snap.energyWiped) {
    const rate = tracing(snap, keysFor(snap.action, Stat.EnergyRegenMult));
    if (rate.length) {
      sources.energy = [...(sources.energy ?? []), ...rate.map((r) => ({ ...r, section: ENERGY_RATE, digits: 2 }))];
      raw["moved:energy"] = (Number(raw["moved:energy"]) || 0) * (1 + snap.stat(Stat.EnergyRegenMult) / 100);
    }
  }
  // off-tune: built amount x Buildup Rate, then DirectOfftune on top (a drain skips the rate)
  const buildingOfftune = snap.action.offtune
    + tracing(snap, keysFor(snap.action, Stat.AddOfftune)).reduce((n, r) => n + r.value, 0);
  if (buildingOfftune > 0) {
    const rate = tracing(snap, keysFor(snap.action, Stat.OfftuneBuildup));
    if (rate.length) sources.offtune = [...(sources.offtune ?? []), ...rate.map((r) => ({ ...r, section: OFFTUNE_RATE, digits: 2 }))];
  }
  const direct = tracing(snap, keysFor(snap.action, Stat.DirectOfftune));
  raw["moved:offtune"] = ((buildingOfftune < 0
    ? buildingOfftune
    : buildingOfftune * (snap.stat(Stat.OfftuneBuildup) / 100))
    + direct.reduce((n, r) => n + r.value, 0)) / RESOURCE_SCALE.offtune;
  if (direct.length) {
    sources.offtune = [...(sources.offtune ?? []), ...direct.map((r) => ({
      ...r, value: r.value / RESOURCE_SCALE.offtune, digits: RESOURCE_DIGITS.offtune, section: "Direct Offtune",
    }))];
    buffed.add("offtune");
  }
  // forte: the action's declared delta plus any AddForteN a held buff contributed
  const FORTE_FIELD = ["forte1", "forte2", "forte3", "forte4", "forte5"] as const;
  const FORTE_STAT = [Stat.AddForte1, Stat.AddForte2, Stat.AddForte3, Stat.AddForte4, Stat.AddForte5] as const;
  FORTE_GAUGES.forEach((key, i) => {
    const declared = snap.action[FORTE_FIELD[i]!];
    const traced = tracing(snap, keysFor(snap.action, FORTE_STAT[i]!));
    const rows: TraceEntry[] = [];
    // a cast that wipes the bar first: its own row says so rather than carrying a figure, since
    // what it takes off is whatever happened to be there
    if (snap.action.resetForte[i]) {
      rows.push({ source: snap.action.name, value: 0, text: "CLEAR", digits: 0, owner: snap.member });
    }
    // the same two decimals the gauge's own column prints, so a fractional gain reads as one
    if (declared) rows.push({ source: snap.action.name, value: declared, digits: 2, owner: snap.member });
    rows.push(...traced.map((r) => ({ ...r, digits: 2 })));
    if (rows.length) sources[`gauge:${RESOURCE_NAME[key]}`] = rows;
    raw[`moved:gauge:${RESOURCE_NAME[key]}`] = rows.reduce((n, r) => n + r.value, 0);
    if (snap.action.resetForte[i]) raw[`clear:gauge:${RESOURCE_NAME[key]}`] = 1;
  });
  // mv: `(base + added) x (1 + MulMv)` — the multiplying rows get their own section
  if (!raw.mv) delete sources.mv;
  else {
    const isFactor = (r: TraceEntry) => r.stat !== undefined && splitStat(r.stat)[0] === Stat.MulMv;
    const parts = sources.mv ?? [];
    if (parts.length) buffed.add("mv");
    sources.mv = [
      ...(snap.action.mv ? [{ source: snap.action.name, label: "Base MV", value: snap.action.mv, percent: true, owner: snap.member }] : []),
      ...parts.filter((r) => !isFactor(r)),
      ...parts.filter(isFactor).map((r) => ({ ...r, section: MV_MULTIPLIER })),
    ];
  }

  // vuln: the two halves multiply rather than summing, so each gets its own Total and the
  // column's own (`raw.dealt`) is their product
  if (sources.dealt?.length) {
    const half = (stat: Stat) => sources.dealt!
      .filter((r) => r.stat !== undefined && splitStat(r.stat)[0] === stat)
      .reduce((n, r) => n + r.value, 0);
    const total = half(Stat.TotalDmg), taken = half(Stat.DamageTaken);
    if (total && taken) {
      sources.dealt = [...sources.dealt, ...([[Stat.TotalDmg, total], [Stat.DamageTaken, taken]] as const)
        .map(([stat, value]) => ({
          source: "", label: "Total", value, section: SECTION_OF[stat], percent: true, digits: 1, summary: true,
        }))];
    }
  }

  // atk/hp/def: a Total per section, then a "Final X" section with the stat and how far the build
  // lifts it over base — `(flat + bonus% x base) / base`
  for (const [key, word, [baseStat, bonusStat, flatStat]] of [
    ["atk", "ATK", [Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk]],
    ["hp", "HP", [Stat.BaseHp, Stat.BonusHp, Stat.FlatHp]],
    ["def", "DEF", [Stat.BaseDef, Stat.BonusDef, Stat.FlatDef]],
  ] as const) {
    const traced = sources[key];
    if (!traced) continue;
    const sum = (stat: Stat) => traced
      .filter((r) => r.stat !== undefined && splitStat(r.stat)[0] === stat)
      .reduce((n, r) => n + r.value, 0);
    const base = sum(baseStat);
    if (!base) continue;
    const subtotal = (stat: Stat, percent: boolean): TraceEntry[] => (
      traced.some((r) => r.stat !== undefined && splitStat(r.stat)[0] === stat)
        ? [{ source: "", label: "Total", value: sum(stat), section: SECTION_OF[stat], percent, digits: percent ? 2 : 0, summary: true }]
        : []);
    const final = `Final ${word}`;
    sources[key] = [
      ...traced,
      ...subtotal(baseStat, false), ...subtotal(bonusStat, true), ...subtotal(flatStat, false),
      { source: "", label: "Total", value: snap[key], section: final, digits: 0, summary: true },
      {
        source: "", label: "Relative",
        value: ((sum(flatStat) + (sum(bonusStat) / 100) * base) / base) * 100,
        section: final, percent: true, digits: 2, summary: true,
      },
    ];
  }

  // a group row: stat columns are the last member's; the accumulating columns are rebuilt across
  // every member, panels laid end to end and folded
  if (members.length > 1) {
    const per = members.map((m) => rowValues(m, { mv: mvPercent(m), avg: 0 }));
    for (const key of ["short:concerto", ...FORTE_GAUGES.map((k) => `short:gauge:${RESOURCE_NAME[k]}`)]) {
      raw[key] = per.some((p) => Number(p.raw[key])) ? 1 : 0;
    }
    for (const key of COMBINED_COLUMNS) {
      if (sources[key] === undefined && key === "mv") continue;
      const last = per.length - 1;
      const rows = foldDuplicates(per.flatMap((p, k) => (p.sources[key] ?? [])
        .filter((r) => (r.section !== OFFTUNE_RATE && r.section !== ENERGY_RATE) || k === last)));
      if (rows.length) sources[key] = rows; else delete sources[key];
      if (per.some((p) => p.buffed.has(key))) buffed.add(key);
      const moved = `moved:${key}`;
      if (per.some((p) => p.raw[moved] !== undefined)) {
        raw[moved] = per.reduce((n, p) => n + (Number(p.raw[moved]) || 0), 0);
      }
    }
    FORTE_GAUGES.forEach((key, i) => {
      raw[`before:gauge:${RESOURCE_NAME[key]}`] = members[0]!.forteBefore[i]!;
    });
    raw["before:energy"] = members[0]!.energyBefore / RESOURCE_SCALE.energy;
    raw["before:concerto"] = members[0]!.concertoBefore / RESOURCE_SCALE.concerto;
    raw["before:offtune"] = members[0]!.offtuneBefore / RESOURCE_SCALE.offtune;
  }

  const f = damageFactors(snap);
  if (dealsDamage) sources.avg = [
    { source: f.scaling === null ? "" : STAT_SOURCE[f.scaling] ?? SCALING_NAME[f.scaling], label: "Final Stat", value: f.finalStat },
    { source: snap.action.name, label: "Motion Value", value: f.finalMv, mult: true },
    { source: "buffs", label: "Damage Bonus", value: f.bonusFactor, mult: true },
    { source: "buffs", label: "Amplification", value: f.ampFactor, mult: true },
    ...(f.scaling === Scaling.Tune
      ? [{ source: "buffs", label: "Tune Break Boost", value: f.tbbFactor, mult: true }]
      : []),
    ...(f.dealtFactor > 1
      ? [{ source: "buffs", label: "Total Damage", value: f.dealtFactor, mult: true }]
      : []),
    ...(f.takenFactor > 1
      ? [{ source: "enemy", label: "Damage Taken", value: f.takenFactor, mult: true }]
      : []),
    { source: "enemy", label: "Res Factor", value: f.resFactor, mult: true },
    { source: "enemy", label: "Def Factor", value: f.defFactor, mult: true },
    { source: "crit", label: "Average Crit", value: f.critFactor, mult: true },
  ];

  return { raw, sources, buffed };
}

export interface Column {
  key: string;
  label: string;
  /** The heading its panel opens with — `label` is abbreviated to fit the grid. */
  full?: string;
  /** What `full` reads as when nothing feeds the column (the ignore column with no penetration). */
  fullEmpty?: string;
  /** No Total row of its own — atk/hp/def end on their Final section. */
  noTotal?: boolean;
  align?: "left";
  digits?: number;
  percent?: boolean;
  hideIfZero?: boolean;
  /** Character width, measured from what the report holds; page/detail.ts sizes grid tracks off it. */
  width?: number;
}

export interface ReportRow {
  line: ChainGroup;
  raw: RawRow;
  sources: Sources;
  buffed: Set<string>;
  info: InfoEntry[];
  scaling: Scaling | null;
  short: boolean;
  parts: ReportPart[];
}

/** One member of a chain, shown indented under its own row. */
export interface ReportPart extends RowValues {
  info: InfoEntry[];
  type: Type1 | null;
  scaling: Scaling | null;
  isShown: boolean;
  short: boolean;
  /** Its own cast — a queued follow-up can land on anybody, so its held buffs are its own. */
  snap: ResolvedSnapshot;
}

export interface Report {
  columns: Column[];
  rows: ReportRow[];
  total: number;
}

/** The forte gauges are shown under their generic names: the table holds a whole team. */
export function buildReport(lines: ChainGroup[]): Report {
  const columns: Column[] = [
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
      key: `gauge:${RESOURCE_NAME[key]}`, label: RESOURCE_NAME[key], digits: 2, hideIfZero: true,
      full: RESOURCE_NAME[key],
    })),
  ];

  // a short row is one the engine queued rather than a rotation beat; a folded row is short only
  // if every member is
  const isShort = (snap: ResolvedSnapshot) => snap.triggered;
  const isShortLine = (line: ChainGroup) => (line.members?.length ? line.members.every(isShort) : isShort(line.snap));

  const partOf = (snap: ResolvedSnapshot, avg: number, shown: ResolvedSnapshot): ReportPart => {
    const part = rowValues(snap, { mv: mvPercent(snap), avg });
    part.raw.action = snap.action.name;
    return {
      ...part,
      info: actionInfo(snap.action, snap.type, snap.triggered, snap.triggeredBy),
      type: snap.type, scaling: snap.action.scaling, isShown: snap === shown, snap, short: isShort(snap),
    };
  };

  const rows: ReportRow[] = lines.map((line) => {
    const snap = line.snap;
    const { raw, sources, buffed } = rowValues(snap, { mv: line.mv, avg: line.avg }, line.members ?? []);
    raw.action = line.id;
    return {
      line, raw, sources, buffed,
      // `snap.type`, not `action.type`: the type it was actually evaluated as (typeOverride)
      info: actionInfo(snap.action, snap.type, snap.triggered, snap.triggeredBy),
      scaling: snap.action.scaling,
      short: isShortLine(line),
      parts: line.isChain ? line.parts.map((p) => partOf(p.snap, p.dmg.avg, snap)) : [],
    };
  });

  // A forte gauge's decimals are that resonator's own, not the column's: one kit's bar moves in
  // whole points and another's in hundredths, and a single count for the column would print
  // `4.00/5` down a bar that never leaves whole numbers. Every row of one member shares a count, so
  // their own cells still line up; the stamp is what `digitsOf` reads back.
  for (const key of FORTE_GAUGES.map((k) => `gauge:${RESOURCE_NAME[k]}`)) {
    const per = new Map<string, number>();
    const note = (r: { raw: RawRow }) => {
      const v = r.raw[key];
      if (typeof v !== "number") return;
      const member = String(r.raw.member ?? "");
      per.set(member, Math.max(per.get(member) ?? 0, decimalsOf(v)));
    };
    for (const r of rows) { note(r); r.parts.forEach(note); }
    const stamp = (r: { raw: RawRow }) => { r.raw[`digits:${key}`] = per.get(String(r.raw.member ?? "")) ?? 0; };
    for (const r of rows) { stamp(r); r.parts.forEach(stamp); }
  }

  // drop resource columns nobody moved — a chain's parts count
  const moved = (r: { raw: RawRow }, key: string) => Math.abs(Number(r.raw[key]) || 0) > 1e-9;
  const used = columns.filter((c) => !c.hideIfZero
    || rows.some((r) => moved(r, c.key) || r.parts.some((p) => moved(p, c.key))));

  // every column sized to what this report holds, plus one spare character
  const shown = (r: { raw: RawRow }, c: Column): string => {
    const v = r.raw[c.key];
    return typeof v === "number"
      ? fmt(v, digitsOf(r.raw, c), PAD_DIGITS_COLUMNS.has(c.key), GROUPED_COLUMNS.has(c.key)) + (c.percent ? "%" : "") + gaugeSuffix(r.raw, c.key)
      : String(v ?? "");
  };
  const sized: Column[] = used.map((c) => {
    const lens = [c.label.length];
    for (const r of rows) {
      lens.push(shown(r, c).length);
      // a part's name is indented in the grid (index.css `.parts .name`), so it needs the room
      for (const p of r.parts) lens.push(shown(p, c).length + (c.key === "action" ? 3 : 0));
    }
    return { ...c, width: Math.max(...lens) + 1 };
  });

  // a field summary restates hits already counted on their own rows (`aggregate`)
  return {
    columns: sized, rows,
    total: rows.reduce((n, r) => n + (r.line.aggregate ? 0 : Number(r.raw.avg) || 0), 0),
  };
}
