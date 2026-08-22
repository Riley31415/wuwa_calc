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
  Stat, Resource, Scaling, Cast,
  scopedStat, TAGS_MATCHED, splitStat, statLabel,
  ELEMENTS, TYPE1S, TYPE2S,
} from "./stats.js";
import { mvPercent, effectiveDef, effectiveRes, damageFactors } from "./damage.js";
import { AddEnergy, AddConcerto, AddOfftune, AddForte1, AddForte2, AddForte3, AddForte4, AddForte5 } from "./kit.js";
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
  /** How many decimals this row's own value reads to, when the panel's default (4) is more
   *  precision than the figure deserves. */
  digits?: number;
  /** Which team member granted this — the hover panel's colour bar. See `Buff.owner`. */
  owner?: string | null;
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
  mv: () => [Stat.AddMv, Stat.MulMv],
  cr: () => [Stat.CritRate],
  cd: () => [Stat.CritDmg],
  er: () => [Stat.Er],
  dmgBonus: () => [Stat.DmgBonus],
  amp: () => [Stat.Amp],
  dealt: () => [Stat.TotalDmg],
  // what is being done to the enemy rather than to the resonator
  effDef: () => [Stat.DefIgnore, Stat.DefShred, Stat.DefReduce],
  effRes: () => [Stat.ResIgnore, Stat.ResShred],
  // energy/concerto/offtune are NOT built off this — they're running totals, not a per-action
  // sum, so rowValues() builds their own panel by hand further down, off RESOURCE_STAT instead.
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

/** Every declared-amount field an action can carry, same shape as `shields`/`chafe` — a plain
 *  number a kit reads back off the action itself. Named here once so `actionInfo` below doesn't
 *  hand-list them twice. */
const AMOUNT_FIELDS = ["shields", "bane", "chafe", "flare", "burst", "erosion", "frazzle", "hack", "rupture", "strain"] as const;
const AMOUNT_LABELS: Record<(typeof AMOUNT_FIELDS)[number], string> = {
  shields: "Shields", bane: "Bane", chafe: "Chafe", flare: "Flare", burst: "Burst",
  erosion: "Erosion", frazzle: "Frazzle", hack: "Hack", rupture: "Rupture", strain: "Strain",
};

/** One line of the hover on an action's own name — what field it is, and its value. */
export interface InfoEntry { label: string; value: string; }

/**
 * What an action is, for the hover on its own name — every field it actually carries, not just
 * scaling/element/type: its cast(s), which kit branch it's from, and every declared amount
 * (shields, chafe, ...) it's non-zero for, plus Heals when it does. Values read exactly as the
 * engine spells them — no uppercasing, no abbreviating, so Liberation reads as Liberation rather
 * than a shortened or shouted stand-in for it. Fields that are absent/zero/false are dropped, so
 * an action with nothing unusual about it still reads as a short, plain line.
 */
const actionInfo = (action: {
  scaling?: string | null; element?: string | null; type?: string | null; type2?: string | null;
  cast?: string | null; cast2?: string | null; node?: string | null; active?: boolean; heals?: boolean;
} & Partial<Record<(typeof AMOUNT_FIELDS)[number], number>>): InfoEntry[] => {
  const info: InfoEntry[] = [];
  const push = (label: string, value: string | null | undefined) => { if (value) info.push({ label, value }); };
  // Order runs widest to narrowest: which forte branch the cast lives on, what button pressed it,
  // then what it hits as — and only then the amounts it happens to carry.
  push("Node", action.node);
  push("Cast", action.cast);
  push("Cast 2", action.cast2);
  push("Element", action.element);
  push("Scaling", action.scaling ?? Scaling.Atk);
  push("Type", action.type);
  push("Type 2", action.type2);
  for (const key of AMOUNT_FIELDS) {
    const v = action[key];
    if (v) push(AMOUNT_LABELS[key], String(v));
  }
  if (action.heals) push("Heals", "Yes");
  if (action.active === false) push("Active", "No");
  return info;
};

/** What the motion value is multiplying, named for the damage panel. */
const STAT_SOURCE: Record<string, string> = {
  [Scaling.Atk]: "ATK", [Scaling.Hp]: "HP", [Scaling.Def]: "DEF",
  [Scaling.Dot]: "dot constant", [Scaling.Tune]: "tune constant",
};

/** A row's own scope, broadest first: unscoped ("general") entries before ones scoped to the
 *  action's element, then its own damage type, then its second damage type — the same order a
 *  kit's own conditionals read broadest-to-narrowest in. `atk`/`hp` don't use this: their own
 *  panels group by section (base/bonus/flat) instead, see `popover()` in index.ts. */
function tagRank(stat: string): number {
  const tag = splitStat(stat)[1];
  if (tag == null) return 0;
  if ((ELEMENTS as string[]).includes(tag)) return 1;
  if ((TYPE1S as string[]).includes(tag)) return 2;
  if ((TYPE2S as string[]).includes(tag)) return 3;
  return 4;
}

/** Every entry that fed `stats`, summed per source and sorted broadest-scope-first (see
 *  `tagRank`) — a stable sort, so same-scope rows keep the order the buffs contributed them. */
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
        section: SECTION_OF[splitStat(e.stat)[0]] ?? null, owner: e.owner ?? null,
      });
    }
  }
  return [...by.values()].sort((a, b) => tagRank(a.stat ?? "") - tagRank(b.stat ?? ""));
}

const num = (v: number | null | undefined, digits = 0, pad = false): string =>
  v == null ? "" : v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: pad ? digits : 0 });

// energy/concerto/offtune always show their own column's full digit count (2/2/4) rather than
// trimming trailing zeros the way every other column does — matches index.ts's own PAD_DIGITS_COLUMNS.
const PAD_DIGITS_COLUMNS = new Set(["energy", "concerto", "offtune"]);

/** The five generic forte gauges, shown under their own names rather than a kit's word — real
 *  numbers on the TeamMember itself (kit.ts's own forte1()-forte5()), not stats, so they carry
 *  no per-entry trace the way FEEDS-driven columns do; the popover just names whose gauge it is. */
const FORTE_GAUGES = [Resource.Forte1, Resource.Forte2, Resource.Forte3, Resource.Forte4, Resource.Forte5];

/** Off-tune's own raw unit (Weakness Break DMG straight off nanoka's table) runs finer than the
 *  game's own displayed off-tune points, so it alone gets a display-only /10000 — purely a
 *  display scale, nothing upstream (kit.ts, a kit's own numbers) uses it. Energy/concerto are
 *  already stored at nanoka's own scale directly, same as the forte gauges: a kit's own
 *  forte1()-forte5() are already whole numbers in the units a kit itself defines (Jingran's Qi
 *  tops out at 300, not 30000), so both show as-is. */
const RESOURCE_SCALE = { energy: 1, concerto: 1, offtune: 10000 } as const;

/** How the terminal marks a chain's member, and what it calls the bottom row — both occupy the
 *  action column, so both have to fit inside its measured width. */
const PART_PREFIX = "  · ";
const TOTAL_LABEL = "team total";

/** One evaluated row's formatted values plus its hover-trace panels. */
export interface RowValues {
  raw: RawRow;
  sources: Sources;
  /** Which columns a stat buff actually moved this action, not just carried or declared — see
   *  `rowValues()`'s own comment on why `sources[key]` alone can't tell the two apart. */
  buffed: Set<string>;
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
  { mv, avg }: { mv: number; avg: number },
): RowValues {
  // An action with no motion value deals no damage by definition — an outro handing off a buff,
  // a liberation that only opens a field. Printing "0%" and "0" down those two columns is noise
  // that reads like a result; blank says "this cast was never about damage". Every other column
  // still pays out, because the stat line at that moment is exactly what the row is there for.
  const dealsDamage = mv !== 0;
  // Which columns a stat buff actually moved, not just carried/declared — mv (below) always adds
  // a "Base MV" row of its own regardless, and energy/concerto/offtune always carry the action's
  // own declared row, so `sources[key]` being non-empty alone can't tell "a buff touched this"
  // apart from "this column just has its own ordinary trace". index.ts's own action table reads
  // this to underline a cell only when something actually buffed it.
  const buffed = new Set<string>();
  const raw: RawRow = {
    member: snap.member,
    atk: snap.atk,
    hp: snap.hp,
    mv: dealsDamage ? mv : null,
    dmgBonus: snap.dmgBonus,
    amp: snap.amp,
    cr: snap.stat(Stat.CritRate),
    cd: snap.stat(Stat.CritDmg),
    dealt: snap.stat(Stat.TotalDmg),
    // what the hit actually meets: the enemy's defence as a fraction of its base, and the
    // resistance left after ignore and shred — both read straight off the resolved snapshot's
    // own enemyDef/enemyRes.
    effDef: effectiveDef(snap) * 100,
    effRes: effectiveRes(snap),
    er: snap.stat(Stat.Er),
    // real running totals — kit.ts's own evaluate() banks these every action, off however much
    // AddEnergy/AddConcerto/AddOfftune this action's own held Gear contributed. Energy/concerto
    // are already stored at nanoka's own scale; only off-tune's own raw unit runs finer than the
    // game's own displayed off-tune bar (/10000), purely a display scale — RESOURCE_SCALE below
    // is the single place that ratio lives.
    energy: snap.energy / RESOURCE_SCALE.energy,
    concerto: snap.concerto / RESOURCE_SCALE.concerto,
    offtune: snap.offtune / RESOURCE_SCALE.offtune,
    avg: dealsDamage ? avg : null,
  };
  // real numbers straight off the TeamMember, not stats.
  FORTE_GAUGES.forEach((key, i) => { raw[`gauge:${key}`] = snap.forte[i]!; });
  // Auxiliary, not a shown column — index.ts's own action table reads these to flag the concerto
  // cell red when an outro fired without a full 100-point bar banked (never true off an outro
  // row: concertoSpent only moves on one, see kit.ts's own evaluate()).
  raw.concertoSpent = snap.concertoSpent;
  raw.isOutro = snap.action.cast === Cast.Outro ? 1 : 0;

  // where each value came from, for the hover panels
  const sources: Sources = {};
  for (const [key, feeds] of Object.entries(FEEDS)) {
    if (key === "energy" || key === "concerto" || key === "offtune") continue; // built separately below
    const traced = tracing(snap, feeds().flatMap((s) => keysFor(s, snap.action as unknown as Record<string, unknown>)));
    if (traced.length) sources[key] = traced;
  }
  // energy/concerto/offtune are running totals, not a sum of this action's own entries — the
  // panel opens with what was already banked, then the resonator's own declared baseline for
  // this cast (if any — same "Base MV" treatment as the mv panel below), then whatever a buff
  // itself added. Scaled the same as the column itself, so the panel's own rows still sum to
  // the number shown outside it.
  const RESOURCE_STAT = { energy: AddEnergy, concerto: AddConcerto, offtune: AddOfftune } as const;
  // matches each column's own digits (see the `columns` array below) — a /100 value never needs
  // more than 2 decimal places, a /10000 one (offtune) never needs more than 4.
  const RESOURCE_DIGITS = { energy: 2, concerto: 2, offtune: 4 } as const;
  // What an outro zeroes energy/concerto back out by — folded straight into the action's own
  // declared contribution below, so an outro shows as a real "Outro: <name> -8,956" row landing
  // on 0, not the total just silently becoming 0 with nothing in the trace to explain it. Off-tune
  // is the enemy's, not the resonator's, so an outro never touches it.
  const RESOURCE_SPENT = { energy: snap.energySpent, concerto: snap.concertoSpent, offtune: 0 } as const;
  for (const key of ["energy", "concerto", "offtune"] as const) {
    const declared = (snap.action[key] - RESOURCE_SPENT[key]) / RESOURCE_SCALE[key];
    const traced = tracing(snap, keysFor(RESOURCE_STAT[key], snap.action as unknown as Record<string, unknown>))
      .map((r) => ({ ...r, value: r.value / RESOURCE_SCALE[key] }));
    const total = Number(raw[key]) || 0;
    const carried = total - declared - traced.reduce((n, r) => n + r.value, 0);
    const rows: TraceEntry[] = [];
    const digits = RESOURCE_DIGITS[key];
    if (Math.abs(carried) > 1e-9) rows.push({ source: "Held", value: carried, digits });
    if (declared) rows.push({ source: snap.action.id, value: declared, digits, owner: snap.member });
    rows.push(...traced.map((r) => ({ ...r, digits })));
    if (rows.length) sources[key] = rows;
    if (traced.length) buffed.add(key);
  }
  // Forte: held-before, this action's own declared delta, and whatever AddForte1-5 a held buff
  // contributed (Jingran's Fire of Life refunding Qi) — same shape as energy/concerto just above.
  const FORTE_FIELD = ["forte1", "forte2", "forte3", "forte4", "forte5"] as const;
  const FORTE_STAT = [AddForte1, AddForte2, AddForte3, AddForte4, AddForte5] as const;
  FORTE_GAUGES.forEach((key, i) => {
    const declared = snap.action[FORTE_FIELD[i]!];
    const traced = tracing(snap, keysFor(FORTE_STAT[i]!, snap.action as unknown as Record<string, unknown>));
    const total = snap.forte[i]!;
    const carried = total - declared - traced.reduce((n, r) => n + r.value, 0);
    const rows: TraceEntry[] = [];
    if (Math.abs(carried) > 1e-9) rows.push({ source: "Held", value: carried, digits: 0 });
    if (declared) rows.push({ source: snap.action.id, value: declared, digits: 0, owner: snap.member });
    rows.push(...traced.map((r) => ({ ...r, digits: 0 })));
    if (rows.length) sources[`gauge:${key}`] = rows;
  });
  // The action's own motion value is not a stat anything contributed, so it has no entry to
  // trace — but it is the number every multiplier in the list is multiplying, and the row
  // reads as nonsense without it. `percent` because a motion value is written in percent
  // units like the multipliers are, and nothing else can infer that from a made-up name.
  // `owner: snap.member` — this is the acting resonator's own declared value, not a buff's
  // contribution, but it still deserves the same colour bar every other row in the panel gets.
  if (raw.mv) {
    // The three parts do not all sum: `(base + added) x (1 + bonus) x (1 + special)`. The two
    // multiplying halves are sorted after the adding ones so the panel reads in the order the
    // formula applies and its rows reach the total it prints — but each row still shows its own
    // raw percent (e.g. "80%"), not the `x1.8` factor it becomes in the formula: `mult: true` is
    // for the overall damage-factors panel further down, where the value shown really is the
    // final applied multiplier; here it would just restate the same 80% in a less readable form.
    const isFactor = (r: TraceEntry) => [Stat.MulMv].includes(splitStat(r.stat ?? "")[0] as Stat);
    const parts = sources.mv ?? [];
    if (parts.length) buffed.add("mv");
    sources.mv = [
      { source: snap.action.id, stat: "Base MV", value: snap.action.mv, percent: true, owner: snap.member },
      ...parts.filter((r) => !isFactor(r)),
      ...parts.filter((r) => isFactor(r)),
    ];
  }

  // How much the build lifts the bare base stat: (flat + bonus% x base) / base, which is the
  // same as (total - base) / base. It is the one number that says whether a piece of gear is
  // worth more than another, and it cannot be read off the three sections separately.
  for (const [key, [baseStat, bonusStat, flatStat]] of [
    ["atk", [Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk]],
    ["hp", [Stat.BaseHp, Stat.BonusHp, Stat.FlatHp]],
  ] as const) {
    const traced = sources[key];
    if (!traced) continue;
    const sum = (stat: string) => traced
      .filter((r) => r.stat && splitStat(r.stat)[0] === stat)
      .reduce((n, r) => n + r.value, 0);
    const base = sum(baseStat);
    if (!base) continue;
    sources[key] = [...traced, {
      source: "", label: "Relative",
      value: ((sum(flatStat) + (sum(bonusStat) / 100) * base) / base) * 100,
      percent: true, place: "afterTotal", digits: 2,
    }];
  }

  // The enemy-side panels end with the multiplier the formula actually applies, which is the
  // thing the ignore/shred rows above it are working towards — a res of 20% is a x0.8, and the
  // relationship is not linear once resistance goes negative or past 80%.
  const f = damageFactors(snap);
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
  // Skipped entirely on a no-motion-value cast: with the column itself blank (see `dealsDamage`
  // above), a hover panel breaking down a product that was never computed would be a panel
  // explaining nothing.
  if (dealsDamage) sources.avg = [
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

  return { raw, sources, buffed };
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
  buffed: Set<string>;
  info: InfoEntry[];
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
  { strip = null }: { strip?: RegExp | null } = {},
): Report {
  // No column declares a width: every one is measured from what this report actually holds,
  // further down. `align: "left"` is what separates the text columns from the numeric ones —
  // it decides both the padding side and, in the web view, which per-character unit sizes them.
  const columns: Column[] = [
    { key: "member", label: "member", align: "left" },
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
    { key: "er", label: "er%", digits: 1, percent: true },

    // digits matches nanoka's own table precision: energy/concerto never need more than 2 decimal
    // places, offtune's own /10000 scale-down (RESOURCE_SCALE above) never needs more than 4 —
    // always padded to that many (PAD_DIGITS_COLUMNS above), not just capped. The forte gauges
    // aren't scaled at all, so they stay whole numbers.
    { key: "concerto", label: "concerto", digits: 2, hideIfZero: true },
    { key: "energy", label: "energy", digits: 2, hideIfZero: true },
    { key: "offtune", label: "offtune", digits: 4, hideIfZero: true },
    ...FORTE_GAUGES.map((key) => ({ key: `gauge:${key}`, label: key, hideIfZero: true })),
  ];

  const name = (id: string) => (strip ? id.replace(strip, "") : id);

  // A row earns the table's shorter treatment when it is not really a rotation beat of its
  // own: a follow-up the engine queued rather than something a rotation author placed (an
  // outro-triggered intro included, now that outros trigger them directly). A zero-damage hit
  // is still a real placed action (a healing-only Heavy Attack, say) — full weight, not dimmed.
  const isShort = (snap: ResolvedSnapshot) => snap.triggered;

  const rows: ReportRow[] = lines.map((line) => {
    const { raw, sources, buffed } = rowValues(
      line.snap as ResolvedSnapshot, { mv: line.mv, avg: line.avg },
    );
    raw.action = name(line.id);

    return {
      line,
      raw,
      sources,
      buffed,
      // what the action *is*, for the hover on its name. A chain takes it from the part whose
      // stats it is reporting, the same part every other value on the row comes from.
      info: actionInfo(line.snap.action),
      // what the motion value is multiplying, so the mv panel can name its own unit
      scaling: line.snap.action.scaling ?? Scaling.Atk,
      short: isShort(line.snap as ResolvedSnapshot),
      parts: line.isChain
        ? line.parts.map((p): ReportPart => {
            const part = rowValues(
              p.snap as ResolvedSnapshot, { mv: mvPercent(p.snap), avg: p.dmg.avg },
            ) as ReportPart;
            part.raw.action = name(p.snap.action.id);
            (part as unknown as { info: InfoEntry[] }).info = actionInfo(p.snap.action);
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
      ? num(v, c.digits ?? 0, PAD_DIGITS_COLUMNS.has(c.key)) + (c.percent ? "%" : "")
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
    const text = typeof value === "number"
      ? num(value, col.digits ?? 0, PAD_DIGITS_COLUMNS.has(col.key))
      : String(value ?? "");
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
