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
  Stat, EnemyStat, Resource, Scaling, Cast,
  scopedStat, splitStat, statLabel, tagKind,
  TAG_NAME, CAST_NAME, NODE_NAME, SCALING_NAME, RESOURCE_NAME,
} from "./stats.js";
import type { Type1, StatKey } from "./stats.js";
import { isCast } from "./kit.js";
import { mvPercent, effectiveShred, effectiveRes, damageFactors } from "./damage.js";
import type { Action, ChainGroup } from "./kit.js";
import type { ResolvedSnapshot, StatEntry } from "./kit.js";

/** One line in a source-trace panel — what fed a value, and how to read it. */
export interface TraceEntry {
  source: string;
  stat?: StatKey;
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
  /** Read this row as a total rather than a contribution: same rule above it, same weight, and its
   *  label in the left column instead of indented in among the sources. */
  summary?: boolean;
}

/** The raw (already-formatted-ready) values for one row, keyed by column. */
export type RawRow = Record<string, number | string | null | undefined>;

/** The hover-trace panels for one row, keyed by column. */
export type Sources = Record<string, TraceEntry[]>;

/**
 * Every key a stat can arrive under for this action: the stat itself, plus the same stat scoped
 * to the action's element and damage type. Any stat can be scoped, so this applies to all of
 * them rather than only to damage bonus and amplification.
 */
const keysFor = (action: Action, ...stats: (Stat | EnemyStat)[]): StatKey[] =>
  stats.flatMap((stat) => [
    stat,
    ...[action.element, action.type, action.type2].filter((tag) => tag !== null)
      .map((tag) => scopedStat(tag!, stat)),
  ]);

/**
 * Which stats feed a column, so a value can be traced back to what produced it. A function
 * where the answer depends on the action: the damage bonus a hit receives is the generic one
 * plus the ones scoped to its own element, type and scaling.
 *
 * Dot and tune hits read a good deal less than an ordinary one does (damage.ts's own
 * `damageFactors`), and a column they never read traces nothing — see `rowValues()`, which
 * blanks the cell itself over the same three cases:
 *   - neither reads damage bonus or crit at all;
 *   - tune reads no amplification, and a dot reads only the part scoped to the Negative Status
 *     it is — never plain or element-scoped, so its own trace is that one scoped key;
 *   - a dot reads neither Damage Dealt nor either penetration, which leaves the enemy's own DEF
 *     Reduce and RES Reduce as the whole of what moves the shred and res columns.
 */
const FEEDS: Record<string, (action: Action) => StatKey[]> = {
  atk: (a) => keysFor(a, Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk),
  hp: (a) => keysFor(a, Stat.BaseHp, Stat.BonusHp, Stat.FlatHp),
  def: (a) => keysFor(a, Stat.BaseDef, Stat.BonusDef, Stat.FlatDef),
  mv: (a) => keysFor(a, Stat.AddMv, Stat.MulMv),
  cr: (a) => (special(a) ? [] : keysFor(a, Stat.CritRate)),
  cd: (a) => (special(a) ? [] : keysFor(a, Stat.CritDmg)),
  er: (a) => keysFor(a, Stat.Er),
  dmgBonus: (a) => (special(a) ? [] : keysFor(a, Stat.DmgBonus)),
  amp: (a) => (a.scaling === Scaling.Tune ? []
    : a.scaling !== Scaling.Dot ? keysFor(a, Stat.Amp)
    : a.type2 === null ? [] : [scopedStat(a.type2, Stat.Amp)]),
  dealt: (a) => (a.scaling === Scaling.Dot ? [] : keysFor(a, Stat.TotalDmg)),
  // what is being done to the enemy rather than to the resonator
  effDef: (a) => (a.scaling === Scaling.Dot ? keysFor(a, EnemyStat.DefReduce)
    : keysFor(a, Stat.DefIgnoreNew, Stat.DefIgnoreOld, EnemyStat.DefReduce)),
  effRes: (a) => (a.scaling === Scaling.Dot ? keysFor(a, EnemyStat.ResShred)
    : keysFor(a, Stat.ResIgnore, EnemyStat.ResShred)),
  // energy/concerto/offtune are NOT built off this — they're running totals, not a per-action
  // sum, so rowValues() builds their own panel by hand further down, off RESOURCE_STAT instead.
};

/** The two scalings that read a stripped-down formula — see `FEEDS` above and `rowValues()`. */
const special = (action: Action): boolean =>
  action.scaling === Scaling.Dot || action.scaling === Scaling.Tune;

/**
 * Which heading a traced row files under, for the panels that separate them. `atk`/`hp`/`def` are
 * a fold rather than a sum — `base x (1 + bonus%) + flat` — so grouping the three apart is what
 * makes the arithmetic legible instead of a column of numbers that do not add up to the total.
 */
const SECTION_OF: Partial<Record<Stat | EnemyStat, string>> = {
  [Stat.BaseAtk]: "Base ATK", [Stat.BonusAtk]: "Bonus ATK", [Stat.FlatAtk]: "Flat ATK",
  [Stat.BaseHp]: "Base HP", [Stat.BonusHp]: "Bonus HP", [Stat.FlatHp]: "Flat HP",
  [Stat.BaseDef]: "Base DEF", [Stat.BonusDef]: "Bonus DEF", [Stat.FlatDef]: "Flat DEF",
  // the shred and res panels, split the same way: the attacker's own two penetrations answer to
  // different rules from the enemy's own debuff (only the debuff survives a dot, and the two DEF
  // ignores don't even stack the same way), so a panel that ran them together as one list of
  // percentages read as if they did.
  [Stat.DefIgnoreNew]: "DEF Ignore (new)", [Stat.DefIgnoreOld]: "DEF Ignore (old)",
  [EnemyStat.DefReduce]: "DEF Reduce",
  [Stat.ResIgnore]: "RES Ignore", [EnemyStat.ResShred]: "RES Reduce",
};

/** One line of the hover on an action's own name — what field it is, and its value. */
export interface InfoEntry { label: string; value: string; }

/**
 * What an action is, for the hover on its own name — every field it actually carries, not just
 * scaling/element/type: its cast(s). Values read exactly as the
 * engine spells them — no uppercasing, no abbreviating, so Liberation reads as Liberation rather
 * than a shortened or shouted stand-in for it. Fields that are absent/zero/false are dropped, so
 * an action with nothing unusual about it still reads as a short, plain line.
 */
const actionInfo = (action: Action, type: Type1 | null): InfoEntry[] => {
  const info: InfoEntry[] = [];
  const push = (label: string, value: string | null) => { if (value) info.push({ label, value }); };
  // Order runs widest to narrowest: which forte branch the cast lives on, what button pressed it,
  // then what it hits as — and only then the amounts it happens to carry.
  push("Node", action.node === null ? null : NODE_NAME[action.node]);
  push("Cast", action.cast === null ? null : CAST_NAME[action.cast]);
  push("Cast 2", action.cast2 === null ? null : CAST_NAME[action.cast2]);
  push("Attribute", action.element === null ? null : TAG_NAME[action.element]);
  push("Scaling", action.scaling === null ? null : SCALING_NAME[action.scaling]);
  push("Type", type === null ? null : TAG_NAME[type]);
  push("Type 2", action.type2 === null ? null : TAG_NAME[action.type2]);
  push("Active", String(action.active));
  return info;
};

/** What the motion value is multiplying, named for the damage panel. */
const STAT_SOURCE: Partial<Record<Scaling, string>> = {
  [Scaling.Atk]: "ATK", [Scaling.Hp]: "HP", [Scaling.Def]: "DEF",
  [Scaling.Dot]: "dot constant", [Scaling.Tune]: "tune constant",
};

/** A row's own scope, broadest first: unscoped ("general") entries before ones scoped to the
 *  action's element, then its own damage type, then its second damage type — the same order a
 *  kit's own conditionals read broadest-to-narrowest in. `atk`/`hp` don't use this: their own
 *  panels group by section (base/bonus/flat) instead, see `popover()` in index.ts. */
function tagRank(key: StatKey): number {
  const tag = splitStat(key)[1];
  return tag === null ? 0 : tagKind(tag);
}

/** Every entry that fed `stats`, summed per source and sorted broadest-scope-first (see
 *  `tagRank`) — a stable sort, so same-scope rows keep the order the buffs contributed them. */
function tracing(snapshot: ResolvedSnapshot, stats: StatKey[]): TraceEntry[] {
  const wanted = new Set(stats);
  const by = new Map<string, TraceEntry>();
  for (const e of snapshot.entries) {
    if (!wanted.has(e.stat)) continue;
    const key = `${e.source} ${e.stat}`;
    const seen = by.get(key);
    if (seen) seen.value += e.value;
    else {
      // A scoped contribution heads its own section, named as it reads ("Fusion Dmg Bonus"):
      // the panels dropped their stat column, so the heading is what tells a Fusion-only bonus
      // apart from a Basic-only one. The base/bonus/flat fold keeps its own grouping instead —
      // a scoped ATK% is still bonus ATK, and splitting it out would break the arithmetic.
      const [stat, tag] = splitStat(e.stat);
      by.set(key, {
        source: e.source ?? "", stat: e.stat, value: e.value,
        section: SECTION_OF[stat] ?? (tag === null ? null : statLabel(e.stat)),
        owner: e.owner ?? null,
      });
    }
  }
  return [...by.values()].sort((a, b) => tagRank(a.stat ?? 0) - tagRank(b.stat ?? 0));
}

/** The very rows one column's own hover panel carries, for a single action — so a table outside
 *  the report can show a panel identical to the one in it (the ER Requirements grid, whose cells
 *  hover the `er` breakdown as it stood on the Liberation they're about). Reads the same `FEEDS`
 *  entry the report itself does, so the two can't drift. */
export function columnSources(snapshot: ResolvedSnapshot, key: string): TraceEntry[] {
  const feeds = FEEDS[key];
  return feeds ? tracing(snapshot, feeds(snapshot.action)) : [];
}

/** One column's own definition, by key — for the same reason: a panel built outside the report
 *  still formats its total the way that column would. */
export const columnOf = (report: Report, key: string): Column | undefined => report.columns.find((c) => c.key === key);

// no thousands separator: the action table's columns sit tight against one another, where a comma
// reads as one more delimiter rather than as part of the figure. Matches index.ts's own web grid.
const num = (v: number | null | undefined, digits = 0, pad = false): string =>
  v == null ? "" : v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: pad ? digits : 0, useGrouping: false });

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
  // What a dot or tune hit doesn't read, it doesn't get a cell for: damage bonus and crit on
  // either, amplification on tune, and Damage Dealt on a dot — each gated out of the formula
  // outright (damage.ts's own `damageFactors`), so printing the build's own figure there says a
  // number was in play when nothing of the sort happened. Blank is the honest answer, the same
  // one a no-motion-value cast gets down the mv and damage columns. A dot's amplification is the
  // exception that isn't quite blank: it reads the part scoped to the Negative Status it is, and
  // nothing else, so the cell shows that part alone. `FEEDS` above gates the hovers to match.
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
    def: snap.def,
    mv: dealsDamage ? mv : null,
    dmgBonus: special(snap.action) ? null : snap.dmgBonus,
    amp: snap.action.scaling === Scaling.Tune ? null
      : snap.action.scaling === Scaling.Dot ? snap.type2Amp : snap.amp,
    cr: special(snap.action) ? null : snap.stat(Stat.CritRate),
    cd: special(snap.action) ? null : snap.stat(Stat.CritDmg),
    dealt: snap.action.scaling === Scaling.Dot ? null : snap.stat(Stat.TotalDmg),
    // what the hit actually meets: how much of the enemy's defence is stripped away by ignore
    // and reduce (0% = untouched), and the resistance left after ignore and shred — both read
    // straight off the resolved snapshot's own enemyDef/enemyRes.
    effDef: effectiveShred(snap) * 100,
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
  FORTE_GAUGES.forEach((key, i) => { raw[`gauge:${RESOURCE_NAME[key]}`] = snap.forte[i]!; });
  // Auxiliary, not a shown column — index.ts's own action table reads these to flag the concerto
  // cell red when an outro fired without a full 100-point bar banked (never true off an outro
  // row: concertoSpent only moves on one, see kit.ts's own evaluate()).
  raw.concertoSpent = snap.concertoSpent;
  raw.isOutro = isCast(snap.action, Cast.Outro) ? 1 : 0;

  // where each value came from, for the hover panels
  const sources: Sources = {};
  // Assigned even when nothing fed the column: a panel of a heading and a Total of 0 is an answer
  // — "no buff is touching your amplification" — where no panel at all reads as the hover being
  // broken. Columns whose cell is blank are the exception, and each drops its own below.
  for (const [key, feeds] of Object.entries(FEEDS)) {
    if (key === "energy" || key === "concerto" || key === "offtune") continue; // built separately below
    sources[key] = tracing(snap, feeds(snap.action));
  }
  // energy/concerto/offtune are running totals, so the panel shows what moved them *this* action —
  // the resonator's own declared baseline for this cast, then whatever a buff itself added — not
  // the balance carried in. Scaled the same as the column itself.
  // off-tune's other half — DirectOfftune, what a kit puts on the bar rather than builds — is not
  // here: it reads below the buildup rate that never touched it, so it's appended past this loop.
  const RESOURCE_STAT = {
    energy: [Stat.AddEnergy], concerto: [Stat.AddConcerto], offtune: [Stat.AddOfftune],
  } as const;
  // matches each column's own digits (see the `columns` array below) — a /100 value never needs
  // more than 2 decimal places, a /10000 one (offtune) never needs more than 4.
  const RESOURCE_DIGITS = { energy: 2, concerto: 2, offtune: 4 } as const;
  // An outro zeroes energy and concerto outright (kit.ts's own evaluate()), so those two cells
  // read 0 with no panel at all: whatever the cast itself banked is wiped in the same breath, and
  // a list of contributions beside a hard 0 explains nothing. Off-tune is the enemy's bar and
  // carries over, so it keeps its trace on an outro like on any other row.
  const zeroed = isCast(snap.action, Cast.Outro);
  for (const key of ["energy", "concerto", "offtune"] as const) {
    if (zeroed && key !== "offtune") continue;
    const declared = snap.action[key] / RESOURCE_SCALE[key];
    const traced = RESOURCE_STAT[key]
      .flatMap((st) => tracing(snap, keysFor(snap.action, st)))
      .map((r) => ({ ...r, value: r.value / RESOURCE_SCALE[key] }));
    const rows: TraceEntry[] = [];
    const digits = RESOURCE_DIGITS[key];
    if (declared) rows.push({ source: snap.action.name, value: declared, digits, owner: snap.member });
    rows.push(...traced.map((r) => ({ ...r, digits })));
    if (rows.length) sources[key] = rows;
    if (traced.length) buffed.add(key);
    // What the panel's own Total reads: what *this* action moved the counter by, not the balance
    // it left behind — the column already prints the running figure, and a panel of one action's
    // contributions footed with a carried-over total adds up to nothing anyone can follow.
    // Off-tune's is not this sum (the buildup rate scales part of it); it's overwritten below.
    raw[`moved:${key}`] = rows.reduce((n, r) => n + r.value, 0);
  }
  // Off-tune alone is scaled on the way in: what an action and its AddOfftune buffs *build* is
  // multiplied by Off-Tune Buildup Rate before it banks (kit.ts's own evaluate()), so the panel
  // names the rate's own sources — the 100 every resonator starts with, plus whatever a kit stacks
  // on top — in a section of their own, whose Total is the multiplier those rows went through (a
  // DirectOfftune row below it is the exception: it skips the rate). Shown only when
  // the rate actually applied, so a drain — a Tune Break's own negative — reports none.
  const buildingOfftune = snap.action.offtune
    + tracing(snap, keysFor(snap.action, Stat.AddOfftune)).reduce((n, r) => n + r.value, 0);
  if (buildingOfftune > 0) {
    const rate = tracing(snap, keysFor(snap.action, Stat.OfftuneBuildup));
    if (rate.length) {
      sources.offtune = [...(sources.offtune ?? []),
        ...rate.map((r) => ({ ...r, section: "Buildup Rate", digits: 2 }))];
      // 100 is the neutral baseline, so anything else is a kit really moving what this cast banked
      if (rate.reduce((n, r) => n + r.value, 0) !== 100) buffed.add("offtune");
    }
  }
  // ...and last, under the rate that never touched it: what a kit put on the bar directly (Denia's
  // half-bar surge, the drain a Tune Break takes back off). Its own section, so the panel reads in
  // the order the bar moves — build, scale, then this.
  const direct = tracing(snap, keysFor(snap.action, Stat.DirectOfftune));
  // ...which is also what the panel's Total foots to: the same arithmetic evaluate() banks (kit.ts)
  // — what was built, scaled by the rate that applied to it, plus whatever landed on the bar direct.
  raw["moved:offtune"] = ((buildingOfftune < 0
    ? buildingOfftune
    : buildingOfftune * (snap.stat(Stat.OfftuneBuildup) / 100))
    + direct.reduce((n, r) => n + r.value, 0)) / RESOURCE_SCALE.offtune;
  if (direct.length) {
    sources.offtune = [...(sources.offtune ?? []), ...direct.map((r) => ({
      ...r, value: r.value / RESOURCE_SCALE.offtune, digits: RESOURCE_DIGITS.offtune,
      section: "Direct Offtune",
    }))];
    buffed.add("offtune");
  }
  // Forte: this action's own declared delta and whatever AddForte1-5 a held buff contributed
  // (Jingran's Fire of Life refunding Qi) — same shape as energy/concerto just above.
  const FORTE_FIELD = ["forte1", "forte2", "forte3", "forte4", "forte5"] as const;
  const FORTE_STAT = [Stat.AddForte1, Stat.AddForte2, Stat.AddForte3, Stat.AddForte4, Stat.AddForte5] as const;
  FORTE_GAUGES.forEach((key, i) => {
    const declared = snap.action[FORTE_FIELD[i]!];
    const traced = tracing(snap, keysFor(snap.action, FORTE_STAT[i]!));
    const rows: TraceEntry[] = [];
    if (declared) rows.push({ source: snap.action.name, value: declared, digits: 0, owner: snap.member });
    rows.push(...traced.map((r) => ({ ...r, digits: 0 })));
    if (rows.length) sources[`gauge:${RESOURCE_NAME[key]}`] = rows;
    raw[`moved:gauge:${RESOURCE_NAME[key]}`] = rows.reduce((n, r) => n + r.value, 0);
  });
  // The action's own motion value is not a stat anything contributed, so it has no entry to
  // trace — but it is the number every multiplier in the list is multiplying, and the row
  // reads as nonsense without it. `percent` because a motion value is written in percent
  // units like the multipliers are, and nothing else can infer that from a made-up name.
  // `owner: snap.member` — this is the acting resonator's own declared value, not a buff's
  // contribution, but it still deserves the same colour bar every other row in the panel gets.
  if (!raw.mv) delete sources.mv; // a no-motion-value cast prints a blank cell; nothing to explain
  else {
    // The three parts do not all sum: `(base + added) x (1 + bonus) x (1 + special)`. The two
    // multiplying halves are sorted after the adding ones so the panel reads in the order the
    // formula applies and its rows reach the total it prints — but each row still shows its own
    // raw percent (e.g. "80%"), not the `x1.8` factor it becomes in the formula: `mult: true` is
    // for the overall damage-factors panel further down, where the value shown really is the
    // final applied multiplier; here it would just restate the same 80% in a less readable form.
    const isFactor = (r: TraceEntry) => r.stat !== undefined && splitStat(r.stat)[0] === Stat.MulMv;
    const parts = sources.mv ?? [];
    if (parts.length) buffed.add("mv");
    sources.mv = [
      { source: snap.action.name, label: "Base MV", value: snap.action.mv, percent: true, owner: snap.member },
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
    ["def", [Stat.BaseDef, Stat.BonusDef, Stat.FlatDef]],
  ] as const) {
    const traced = sources[key];
    if (!traced) continue;
    const sum = (stat: Stat) => traced
      .filter((r) => r.stat !== undefined && splitStat(r.stat)[0] === stat)
      .reduce((n, r) => n + r.value, 0);
    const base = sum(baseStat);
    if (!base) continue;
    // `beforeTotal` puts it under the last of the three sections and above the panel's own Total —
    // where the flat group's subtotal used to sit, and the only line any of the three now ends on.
    sources[key] = [...traced, {
      source: "", label: "Relative",
      value: ((sum(flatStat) + (sum(bonusStat) / 100) * base) / base) * 100,
      percent: true, place: "beforeTotal", digits: 2, summary: true,
    }];
  }

  const f = damageFactors(snap);

  // Every term of the damage product. The stat leads rather than the motion value: it is the
  // amount being multiplied and everything below it is a multiplier on that amount, so reading
  // top to bottom follows the arithmetic instead of opening with a factor of nothing.
  // Skipped entirely on a no-motion-value cast: with the column itself blank (see `dealsDamage`
  // above), a hover panel breaking down a product that was never computed would be a panel
  // explaining nothing.
  if (dealsDamage) sources.avg = [
    { source: f.scaling === null ? "" : STAT_SOURCE[f.scaling] ?? SCALING_NAME[f.scaling], label: "Final Stat", value: f.finalStat },
    { source: snap.action.name, label: "Motion Value", value: f.finalMv, mult: true },
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
  /** The column's own name written out, for the heading its hover panel opens with — the table's
   *  own `label` is abbreviated down to the width the grid can spare ("dmg%", "cr%"), which reads
   *  as a column header but not as a title. Panels whose rows carry sections of their own (atk/
   *  hp/def, base/bonus/flat) never show it: they are already labelled, group by group. */
  full?: string;
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
  scaling: Scaling | null;
  short: boolean;
  parts: ReportPart[];
}

/** One member of a chain, shown indented under its own row. */
export interface ReportPart extends RowValues {
  type: Type1 | null;
  scaling: Scaling | null;
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
    { key: "dealt", label: "vuln%", digits: 1, percent: true, full: "Damage Dealt" },
    { key: "er", label: "er%", digits: 1, percent: true, full: "Energy Regen" },
    { key: "hp", label: "hp" },
    { key: "def", label: "def" },
    { key: "effDef", label: "shred", digits: 1, percent: true, full: "Enemy DEF" },
    { key: "effRes", label: "res", digits: 1, percent: true, full: "Enemy RES" },

    // digits matches nanoka's own table precision: energy/concerto never need more than 2 decimal
    // places, offtune's own /10000 scale-down (RESOURCE_SCALE above) never needs more than 4 —
    // always padded to that many (PAD_DIGITS_COLUMNS above), not just capped. The forte gauges
    // aren't scaled at all, so they stay whole numbers.
    { key: "concerto", label: "concerto", digits: 2, hideIfZero: true, full: "Concerto" },
    { key: "energy", label: "energy", digits: 2, hideIfZero: true, full: "Energy" },
    { key: "offtune", label: "offtune", digits: 4, hideIfZero: true, full: "OffTune" },
    ...FORTE_GAUGES.map((key) => ({
      key: `gauge:${RESOURCE_NAME[key]}`, label: RESOURCE_NAME[key], hideIfZero: true,
      full: RESOURCE_NAME[key],
    })),
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
      // `snap.type`, not `action.type`: the type it was actually evaluated as (kit.ts's typeOverride)
      info: actionInfo(line.snap.action, (line.snap as ResolvedSnapshot).type),
      // what the motion value is multiplying, so the mv panel can name its own unit
      scaling: line.snap.action.scaling,
      short: isShort(line.snap as ResolvedSnapshot),
      parts: line.isChain
        ? line.parts.map((p): ReportPart => {
            const part = rowValues(
              p.snap as ResolvedSnapshot, { mv: mvPercent(p.snap), avg: p.dmg.avg },
            ) as ReportPart;
            part.raw.action = name(p.snap.action.name);
            (part as unknown as { info: InfoEntry[] }).info = actionInfo(p.snap.action, (p.snap as ResolvedSnapshot).type);
            part.type = (p.snap as ResolvedSnapshot).type;
            part.scaling = p.snap.action.scaling;
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
  const typeName = (type: Type1 | null): string => (type === null ? "" : TAG_NAME[type]);
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
          + (p.isShown ? `  <- stats shown on the chain (${typeName(p.type)})` : `  ${typeName(p.type)}`));
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
    const k = `${e.source} → ${statLabel(e.stat)}`;
    by.set(k, (by.get(k) ?? 0) + e.value);
  }
  return [...by].map(([label, value]) => ({ label, value }));
}
