/**
 * Turns evaluated lines into the report the detail page renders: columns, per-row formatted
 * values, and the hover-trace panel data behind each cell. Columns nobody moved are dropped.
 */
import {
  Stat, EnemyStat, Resource, Scaling,
  scopedStat, splitStat, statLabel, tagKind,
  TAG_NAME, CAST_NAME, NODE_NAME, SCALING_NAME, RESOURCE_NAME,
  ActionTag, Cast,
  statDisplayScale, ENERGY_UNIT, CONCERTO_UNIT, MV_UNIT,
} from "../engine/stats.js";
import type { Type, Subtype, StatKey, Tag } from "../engine/stats.js";
import { effectiveShred, defFactorOf, OWN_DEF, effectiveRes, damageFactors, RESONATOR_LEVEL, LEVEL_90_DOT, LEVEL_90_TUNE } from "../engine/damage.js";
import type { DamageFactors } from "../engine/damage.js";
import { BASE_RESISTANCE, ENEMY_MAX_OFFTUNE } from "../shared/tunebreak.js";
import type { Action, Bullet } from "../engine/rotation.js";
import type { ChainGroup, ResolvedSnapshot } from "../engine/evaluate.js";
import type { HeldBuff, StatEntry } from "../engine/state.js";

/** The gauges a row shows — energy, concerto, off-tune, forte 1-5 — once every hit of it is in and
 *  nothing cast after it is (evaluate.ts's `settleGauges()`); as the row left them otherwise. */
const shown = (s: ResolvedSnapshot, i: number): number => s.shownAfter?.[i] ?? [s.energy, s.concerto, s.offtune, ...s.forte][i]!;
const shownBefore = (s: ResolvedSnapshot, i: number): number =>
  s.shownBefore?.[i] ?? [s.energyBefore, s.concertoBefore, s.offtuneBefore, ...s.forteBefore][i]!;

/** One line in a source-trace panel. */
export interface TraceEntry {
  source: string;
  stat?: StatKey;
  value: number;
  section?: string | null;
  percent?: boolean;
  mult?: boolean;
  place?: "beforeTotal" | "afterTotal";
  /** A summary row carrying on from the one above it, no rule between them. */
  joined?: boolean;
  label?: string;
  /** Fixed decimals for this row. Omitted, the panel prints every place the value has — a hover
   *  is where the exact figure belongs; only a derived ratio wants a length of its own. */
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

/**
 * Every figure on the page is cut at its digit count, never rounded up: the game floors what it
 * shows and a cell that reads 963 off 962.5 is claiming half a point the build does not have.
 * The scaled value is cleaned of binary noise before the cut — 2.67 x 100 is 266.99999999999997
 * in a double, and truncating that raw would print 2.66.
 */
export const fmt = (v: number | string | null | undefined, digits = 0, pad = false, group = true): string => {
  if (typeof v !== "number") return String(v ?? "");
  const scale = 10 ** digits;
  const key = `${digits}${pad ? "p" : ""}${group ? "g" : ""}`;
  let f = formatters.get(key);
  if (!f) formatters.set(key, f = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: pad ? digits : 0, useGrouping: group }));
  const cut = Math.trunc(Number((v * scale).toFixed(6))) / scale;
  // a truncated -0.4 is -0, which Intl prints with the sign still on it
  const memo = `${key}|${cut === 0 ? 0 : cut}`;
  let out = formatted.get(memo);
  if (out === undefined) {
    if (formatted.size > 50_000) formatted.clear();
    formatted.set(memo, (out = f.format(cut === 0 ? 0 : cut)));
  }
  return out;
};
/** What `fmt` has printed, by format and value — Intl's own formatting is the slow part. */
const formatted = new Map<string, string>();

/** A hover is where the exact figure belongs, so a panel prints every decimal a value has rather
 *  than a budgeted few — cut off at ten places, which is binary noise (0.30000000000000004) and
 *  nothing a kit ever authored. */
const exact = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });
export const fmtExact = (v: number | string | null | undefined): string =>
  (typeof v === "number" ? exact.format(v) : String(v ?? ""));

const FORTE_GAUGES = [Resource.Forte1, Resource.Forte2, Resource.Forte3, Resource.Forte4, Resource.Forte5];

/** A fight frame as the Time column reads it: the time since the fight began (m:ss.cc, truncated). */
export const clockAt = (frame: number): string => {
  // hundredths of a second, truncated rather than rounded
  const cs = Math.floor((frame * 100) / 60);
  const sec = String(Math.floor(cs / 100) % 60).padStart(2, "0");
  return `${Math.floor(cs / 6000)}:${sec}.${String(cs % 100).padStart(2, "0")}`;
};

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
    ...[action.lastDamage?.element ?? null, action.lastDamage?.type ?? null, action.lastDamage?.subtype ?? null].filter((tag) => tag !== null)
      .map((tag) => scopedStat(tag!, stat)),
  ]);

/** The subtype a row's stats were read under: its last damaging hit's. */
const sub = (action: Action): Subtype | null => action.lastDamage?.subtype ?? null;
const special = (action: Action): boolean =>
  action.scaling === Scaling.Dot || action.scaling === Scaling.Tune || action.scaling === Scaling.Fixed;
const fixed = (action: Action): boolean => action.scaling === Scaling.Fixed;

/** The stat the SCALER column reads for an action — its scaling's own. Dot/Tune scale off a
 *  constant instead (`CONSTANT_SCALERS`), and Fixed off nothing at all. */
const SCALERS: Partial<Record<Scaling, { key: "atk" | "hp" | "def"; word: string; stats: [Stat, Stat, Stat] }>> = {
  [Scaling.Atk]: { key: "atk", word: "ATK", stats: [Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk] },
  [Scaling.Hp]: { key: "hp", word: "HP", stats: [Stat.BaseHp, Stat.BonusHp, Stat.FlatHp] },
  [Scaling.Def]: { key: "def", word: "DEF", stats: [Stat.BaseDef, Stat.BonusDef, Stat.FlatDef] },
};

const scalerOf = (action: Action) => (action.scaling === null ? undefined : SCALERS[action.scaling]);

/** What a dot/tune hit reads in place of a stat: the level-90 figure damage.ts multiplies by, and
 *  the one line its SCALER panel says instead of a source trace — there is nothing to trace, the
 *  number is the resonator's level and nothing else. */
const CONSTANT_SCALERS: Partial<Record<Scaling, { value: number; label: string }>> = {
  [Scaling.Dot]: { value: LEVEL_90_DOT, label: `Negative Status constant at resonator level ${RESONATOR_LEVEL}` },
  [Scaling.Tune]: { value: LEVEL_90_TUNE, label: `Tune Break constant at resonator level ${RESONATOR_LEVEL}` },
};
const constantScalerOf = (action: Action) => (action.scaling === null ? undefined : CONSTANT_SCALERS[action.scaling]);

/** Which stats feed a column (damage.ts's `damageFactors`): dot/tune read no damage bonus and crit
 *  only off their Negative Status's scoped crit; tune reads no amp, a dot only its status-scoped
 *  amp and neither Damage Dealt nor penetration; fixed reads nothing. */
const FEEDS: Record<string, (action: Action) => StatKey[]> = {
  scaler: (a) => { const s = scalerOf(a); return s ? keysFor(a, ...s.stats) : []; },
  mv: (a) => keysFor(a, Stat.AddMv, Stat.MulMv),
  cr: (a) => (fixed(a) ? [] : !special(a) ? keysFor(a, Stat.CritRate) : !sub(a) ? [] : [scopedStat(sub(a)!, Stat.CritRate)]),
  cd: (a) => (fixed(a) ? [] : !special(a) ? keysFor(a, Stat.CritDmg) : !sub(a) ? [] : [scopedStat(sub(a)!, Stat.CritDmg)]),
  dmgBonus: (a) => (special(a) ? [] : keysFor(a, Stat.DmgBonus)),
  amp: (a) => (a.scaling === Scaling.Tune || fixed(a) ? []
    : a.scaling !== Scaling.Dot ? keysFor(a, Stat.Amp)
    : !sub(a) ? [] : [scopedStat(sub(a)!, Stat.Amp)]),
  dealt: (a) => (fixed(a) ? []
    : a.scaling !== Scaling.Dot ? keysFor(a, Stat.TotalDmg, Stat.DamageTaken)
    : !sub(a) ? [] : [scopedStat(sub(a)!, Stat.TotalDmg), scopedStat(sub(a)!, Stat.DamageTaken)]),
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

/** One line of the hover on an action's name. `source` marks a row whose value is a *name* (what
 *  queued this), coloured by the kit it came from. */
export interface InfoEntry { label: string; value: string; source?: string }

const actionInfo = (snap: ResolvedSnapshot): InfoEntry[] => {
  const { action, type, source } = snap;
  const info: InfoEntry[] = [];
  const push = (label: string, value: string | null) => { if (value) info.push({ label, value }); };
  push("Node", action.node === null ? null : NODE_NAME[action.node]);
  push("Cast", action.cast === null ? null : CAST_NAME[action.cast]);
  push("Subcast", action.subcast === null ? null : CAST_NAME[action.subcast]);
  // every attribute/type/subtype its hits dealt as, and the type its last hit was assigned
  const kinds = (of: (h: Bullet) => Tag | null, also: Tag | null = null): string | null => {
    const seen = new Set<Tag>(action.bullets.map(of).filter((v): v is Tag => v !== null));
    if (also !== null) seen.add(also);
    return seen.size ? [...seen].map((v) => TAG_NAME[v]).join(", ") : null;
  };
  push("Attribute", kinds((h) => h.element));
  push("Scaling", action.scaling === null ? null : SCALING_NAME[action.scaling]);
  push("Type", kinds((h) => h.type, type));
  push("Subtype", kinds((h) => h.subtype));
  // the frames are the whole press's, however it was cut or swapped out of
  let press = action;
  while (press.cancelOf ?? press.formOf) press = (press.cancelOf ?? press.formOf)!;
  push("Animation", `${press.animFrames}f`);
  push("Cast Priority", press.castPriority === null ? null : String(press.castPriority));
  // its own windows only: the cast priority holding until the first is the row above
  push("Anim Priority", press.animPriority.length ? press.animPriority.map(([f, t]) => `${f}f: ${t}`).join(", ") : null);
  push("No Swap", press.noSwapFrames ? `${press.noSwapFrames}f` : null);
  push("Outro Buff", press.qteFrames ? `${press.qteFrames}f` : null);
  push("Time Stop", press.timestop ? `${press.timestopFrom}f-${press.timestopFrom + press.timestop}f` : null);
  push("Motion Stop", press.motionStop ? `${press.motionStopFrom}f-${press.motionStopFrom + press.motionStop}f` : null);
  push("Bullets", press.bullets.length ? press.bullets.map((h) => `${h.hitFrame}f`).join(", ") : null);
  // a bullet committing ahead of its hit
  push("Commits", press.bullets.some((h) => h.commitFrame !== h.hitFrame) ? press.bullets.map((h) => `${h.commitFrame}f`).join(", ") : null);
  // the cast's condition, each bar in its own units, then the buffs it needs or can't be under
  const bars = ["Energy", "Concerto", ...FORTE_GAUGES.map((_, i) => `Forte ${i + 1}`)];
  const scale = [1 / ENERGY_UNIT, 1 / CONCERTO_UNIT, ...snap.forteScale];
  bars.forEach((bar, k) => {
    const min = press.castMin?.[k] ?? -Infinity, max = press.castMax?.[k] ?? Infinity;
    if (min !== -Infinity) push(`Min ${bar}`, fmtExact(min * scale[k]!));
    if (max !== Infinity) push(`Max ${bar}`, fmtExact(max * scale[k]!));
  });
  const conds = [...(press.requireBuffs ?? []).map((g) => ["Require Buff", g] as const), ...(press.forbidBuffs ?? []).map((g) => ["Forbid Buff", g] as const)];
  conds.forEach(([label, g], i) => info.push({ label, value: g.name, source: snap.buffSources?.[i] ?? snap.member }));
  // what queued it — a buff, a piece of gear, the cast it followed — in its owner's colour
  if (source) info.push({ label: "Source", value: source.name, source: source.source });
  return info;
};

const STAT_SOURCE: Partial<Record<Scaling, string>> = {
  [Scaling.Atk]: "ATK", [Scaling.Hp]: "HP", [Scaling.Def]: "DEF",
  [Scaling.Dot]: "dot constant", [Scaling.Tune]: "tune constant",
};

/** Sort rank: unscoped first, then element-, type-, subtype-scoped. */
function tagRank(key: StatKey): number {
  const tag = splitStat(key)[1];
  return tag === null ? 0 : tagKind(tag);
}

/** Every entry that fed `stats`, summed per source (`merge: false` keeps each grant its own row —
 *  the resource panels, where the count matters), sorted broadest scope first. */
/** Each row's trace entries by stat, as positions into `entries` — so a column reads only its own
 *  stats' entries rather than scanning them all, in the same order the full scan visits them. */
const entryIndex = new WeakMap<StatEntry[], Map<StatKey, number[]>>();
function entriesOf(entries: StatEntry[], stats: StatKey[]): number[] {
  let index = entryIndex.get(entries);
  if (!index) {
    index = new Map();
    for (let i = 0; i < entries.length; i++) {
      const at = index.get(entries[i]!.stat);
      if (at) at.push(i);
      else index.set(entries[i]!.stat, [i]);
    }
    entryIndex.set(entries, index);
  }
  const out: number[] = [];
  for (const stat of new Set(stats)) {
    const at = index.get(stat);
    if (at) for (const i of at) out.push(i);
  }
  return out.sort((a, b) => a - b);
}

function tracing(snapshot: ResolvedSnapshot, stats: StatKey[], merge = true): TraceEntry[] {
  const by = new Map<string, TraceEntry>();
  const rows: TraceEntry[] = [];
  const entries = snapshot.entries;
  for (const i of entriesOf(entries, stats)) {
    const e = entries[i]!;
    const key = `${e.source} ${e.stat}`;
    const seen = merge ? by.get(key) : undefined;
    if (seen) seen.value += e.value / statDisplayScale(splitStat(e.stat)[0]);
    else {
      const [stat, tag] = splitStat(e.stat);
      // the enemy's own 20% is held as RES Reduce (tunebreak.ts) but reads as a baseline
      const base = e.source === BASE_RESISTANCE.name;
      const row = {
        source: e.source ?? "", stat: e.stat, value: e.value / statDisplayScale(stat),
        section: base ? "Base RES" : SECTION_OF[stat] ?? (tag === null ? null : statLabel(e.stat)),
        owner: e.owner ?? null,
      };
      by.set(key, row);
      rows.push(row);
    }
  }
  return rows.sort((a, b) => tagRank(a.stat ?? 0) - tagRank(b.stat ?? 0));
}

/** A gauge cell's "/cap" — `maxForteN` where the Resonator declares one, and the enemy's own
 *  off-tune ceiling. The cap prints at its own decimals rather than the column's, so a bar capped
 *  at 100 stays `/100` beside a value printed to two places and off-tune keeps its tenth. */
export const gaugeSuffix = (raw: RawRow, key: string): string => {
  const cap = raw[`max:${key}`];
  return typeof cap === "number" ? `/${fmt(cap, decimalsOf(cap), false, false)}` : "";
};

/** Off-tune's raw unit runs finer than the game's displayed points — display-only /10000. */
const RESOURCE_SCALE = { energy: ENERGY_UNIT, concerto: CONCERTO_UNIT, offtune: 10000 } as const;

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
/** Energy's Energy Regen section, below its Total: what the press's own energy was scaled by. */
export const ENERGY_REGEN = "Energy Regen";
/** The MV panel's multiplying half (Stat.MulMv), kept out of the summing section. */
export const MV_MULTIPLIER = "MV Multiplier";

/** The tag box a row wears — none for OFF_FIELD, which the row's dimming already says. */
const tagOf = (snap: ResolvedSnapshot): string => (snap.tag === ActionTag.OffField ? "" : snap.tag);

/** The action's own gain as panel rows: one where it all comes from the cast or all from the hit,
 *  and the same action twice — its cast's share, then its hit's — where it has both. */
function ownShares(snap: ResolvedSnapshot, cast: number, hit: number): TraceEntry[] {
  if (cast && hit) {
    return [
      { source: snap.action.name, value: cast, owner: snap.member },
      { source: snap.action.name, value: hit, owner: snap.member },
    ];
  }
  return cast + hit ? [{ source: snap.action.name, value: cast + hit, owner: snap.member }] : [];
}
/** The bullets a row's press lands: all of them, but a hold or mash cancel's not committed by the
 *  frame it let go (`holdCut`), which never land. */
export const landedBullets = (s: ResolvedSnapshot): readonly Bullet[] =>
  s.holdCut < 0 ? s.action.bullets : s.action.bullets.filter((b) => b.commitFrame <= s.holdCut);
/** What a press's landed bullets bank of `key` between them — its hits' own share, the cast's aside. */
const hitsBank = (s: ResolvedSnapshot, key: "energy" | "concerto" | "offtune" | "mv" | "forte1" | "forte2" | "forte3" | "forte4" | "forte5"): number =>
  landedBullets(s).reduce((n, b) => n + b[key], 0);
/** `mvPercent` over the bullets the press landed: where a hold cut every one, it dealt nothing. */
const landedMv = (s: ResolvedSnapshot): number => {
  const base = hitsBank(s, "mv");
  return base || !s.action.mv ? (base + s.stats[Stat.AddMv]!) * (1 + s.stats[Stat.MulMv]! / 100) : 0;
};

/** The columns a row shows its press's stats in — blank on a press with no bullets. */
const STAT_COLUMNS = ["scaler", "mv", "dmgBonus", "amp", "cr", "cd", "dealt", "effDef", "effRes", "avg"] as const;

function rowValues(
  snap: ResolvedSnapshot,
  { mv, avg }: { mv: number; avg: number },
  members: ResolvedSnapshot[] = [],
): RowValues {
  // no motion value = not a damage cast: mv/avg blank rather than "0"
  const dealsDamage = mv !== 0;
  const scaler = scalerOf(snap.action);
  const constant = constantScalerOf(snap.action);
  const buffed = new Set<string>();
  const raw: RawRow = {
    member: snap.member,
    // the stat this action scales off; a dot/tune hit reads its own constant instead, and a fixed
    // hit reads nothing, so its cell is blank
    scaler: scaler ? snap[scaler.key] : constant?.value ?? null,
    // a fixed hit's motion value *is* its damage rather than a multiplier, so no mv cell either
    mv: dealsDamage && !fixed(snap.action) ? mv / MV_UNIT : null,
    // what a dot/tune/fixed hit doesn't read is blank, matching `FEEDS`
    dmgBonus: special(snap.action) ? null : snap.dmgBonus,
    amp: fixed(snap.action) ? null : snap.action.scaling === Scaling.Tune ? null
      : snap.action.scaling === Scaling.Dot ? snap.subtypeAmp : snap.amp,
    cr: fixed(snap.action) ? null : special(snap.action) ? snap.subtypeCritRate : snap.stat(Stat.CritRate),
    cd: fixed(snap.action) ? null : special(snap.action) ? snap.subtypeCritDmg : snap.stat(Stat.CritDmg),
    // the column is the pair's combined lift, since Total Damage and Damage Taken multiply; a dot
    // reads only its status-scoped halves, the way `amp` above does
    dealt: fixed(snap.action) ? null
      : snap.action.scaling === Scaling.Dot ? ((1 + snap.subtypeTotalDmg / 100) * (1 + snap.subtypeDamageTaken / 100) - 1) * 100
      : ((1 + snap.stat(Stat.TotalDmg) / 100) * (1 + snap.stat(Stat.DamageTaken) / 100) - 1) * 100,
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
    avg: dealsDamage ? avg : null,
  };
  FORTE_GAUGES.forEach((key, i) => {
    // a gauge reads in its resonator's own units (`forteScale`)
    const unit = snap.forteScale[i]!;
    raw[`gauge:${RESOURCE_NAME[key]}`] = shown(snap, 3 + i) * unit;
    raw[`before:gauge:${RESOURCE_NAME[key]}`] = shownBefore(snap, 3 + i) * unit;
    if (snap.maxForte[i]) raw[`max:gauge:${RESOURCE_NAME[key]}`] = snap.maxForte[i]! * unit;
  });
  // red flags for the action table: a bar the cast found outside its own condition
  raw["short:energy"] = snap.castUnmet?.[0] ? 1 : 0;
  raw["short:concerto"] = snap.castUnmet?.[1] ? 1 : 0;
  // ...or a gauge spent below empty
  FORTE_GAUGES.forEach((key, i) => { raw[`short:gauge:${RESOURCE_NAME[key]}`] = snap.castUnmet?.[2 + i] || shown(snap, 3 + i) < 0 ? 1 : 0; });
  // ...and a buff it needed and didn't find, or found and couldn't have, by name
  const buffs = [...(snap.buffUnmet ?? []).map((b) => b.name), ...(snap.buffForbidden ?? []).map((b) => `not ${b.name}`)];
  raw["short:buff"] = buffs.length ? buffs.join(", ") : 0;

  // a panel with a heading and Total 0 is an answer; only blank cells drop theirs
  const sources: Sources = {};
  for (const [key, feeds] of Object.entries(FEEDS)) sources[key] = tracing(snap, feeds(snap.action));
  // nothing feeds a constant scaler (`FEEDS`), so its panel is the heading alone — and the heading
  // says which constant it is rather than the column's own name
  if (constant) raw["empty:scaler"] = constant.label;
  // res shows what's *left*, so every feeding row is negated to add up to it
  sources.effRes = (sources.effRes ?? []).map((r) => ({ ...r, value: -r.value }));
  // the defense factor's own formula with this row's figures in (a zero term left out), then what it comes to
  if (!fixed(snap.action)) {
    const dot = snap.action.scaling === Scaling.Dot;
    const pct = (v: number): string => `${fmt(v, 2)}%`;
    const ignoreNew = dot ? 0 : snap.stat(Stat.DefIgnoreNew), ignoreOld = dot ? 0 : snap.stat(Stat.DefIgnoreOld);
    const reduce = snap.stat(EnemyStat.DefReduce);
    const base = fmt(snap.enemyDef, 0, false, false);
    const inner = [reduce, ignoreOld].filter((v) => v !== 0).map((v) => ` − ${pct(v)}`).join("");
    const floored = inner ? `floor(${base} × (1${inner}))` : base;
    const own = fmt(OWN_DEF, 0, false, false);
    const formula = `${own} / (${own} + ${floored}${ignoreNew ? ` × (1 − ${pct(ignoreNew)})` : ""})`;
    sources.effDef = [
      ...(sources.effDef ?? []),
      // the formula reads across the whole row, so it rides in the label with the value cell left empty
      { source: "", label: `Formula: ${formula}`, value: 0, text: "", summary: true, place: "afterTotal" },
      { source: "", label: "Defense Factor", value: defFactorOf(snap), digits: 4, summary: true, place: "afterTotal", joined: true },
      { source: "", label: "Effective Defense Shred", value: effectiveShred(snap) * 100, percent: true, digits: 2, summary: true, place: "afterTotal", joined: true },
    ];
  }

  // running totals: the panel shows what moved the counter *this* action, footed to `moved:`
  const CAST_SHARE = { energy: snap.action.castEnergy, concerto: snap.action.castConcerto, offtune: snap.action.castOfftune } as const;
  // what hooks added to the press (`addGain()`), gauge by gauge: energy, concerto, forte 1-5,
  // off-tune, direct off-tune
  const added = (i: number): TraceEntry[] => (snap.adds ?? [])
    .filter((c) => c.gains[i] !== 0)
    .map((c) => ({ source: c.source, value: c.gains[i]!, owner: c.owner ?? undefined, ...(c.onCast ? { label: "on cast" } : {}) }));
  const ADDED = { energy: 0, concerto: 1, offtune: 7 } as const;
  for (const key of ["energy", "concerto", "offtune"] as const) {
    const traced = added(ADDED[key]).map((r) => ({ ...r, value: r.value / RESOURCE_SCALE[key] }));
    const own = ownShares(snap, CAST_SHARE[key] / RESOURCE_SCALE[key], hitsBank(snap, key) / RESOURCE_SCALE[key]);
    const rows: TraceEntry[] = [...own, ...traced];
    // the action's own shares stay two rows, however alike they read; the buffs fold
    const folded = [...own, ...foldDuplicates(traced)];
    if (folded.length) sources[key] = folded;
    if (traced.length) buffed.add(key);
    raw[`moved:${key}`] = rows.reduce((n, r) => n + r.value, 0);
  }
  // energy banks `hits x (1 + Energy Regen Multiplier) + cast + added` (evaluate.ts)
  const hitEnergy = hitsBank(snap, "energy");
  const rate = hitEnergy > 0 ? tracing(snap, keysFor(snap.action, Stat.EnergyRegenMult)) : [];
  if (rate.length) {
    sources.energy = [...(sources.energy ?? []), ...rate.map((r) => ({ ...r, section: ENERGY_RATE }))];
    raw["moved:energy"] = (Number(raw["moved:energy"]) || 0)
      + hitEnergy / RESOURCE_SCALE.energy * snap.stat(Stat.EnergyRegenMult) / 100;
  }
  // ...and below the Total, the Energy Regen the hits' own energy was scaled by: each source on its
  // own row, unmerged, so a kit's conditional bonus reads apart from its base 100%, then their sum
  if (hitEnergy > 0) {
    const regen = tracing(snap, keysFor(snap.action, Stat.ER), false)
      .map((r) => ({ ...r, percent: true, section: ENERGY_REGEN, place: "afterTotal" as const }));
    if (regen.length) {
      sources.energy = [...(sources.energy ?? []), ...regen, {
        source: "", label: "Total", value: regen.reduce((n, r) => n + r.value, 0), percent: true, summary: true,
        section: ENERGY_REGEN, place: "afterTotal",
      }];
    }
  }
  // off-tune: built amount x its multiplier x Buildup Rate, then the cast's own and direct off-tune
  // on top (a drain skips both)
  const declaredOfftune = hitsBank(snap, "offtune") + added(7).reduce((n, r) => n + r.value, 0);
  const buildingOfftune = declaredOfftune < 0 ? declaredOfftune : declaredOfftune * (1 + snap.stat(Stat.OfftuneMult) / 100);
  if (buildingOfftune > 0) {
    const mult = tracing(snap, keysFor(snap.action, Stat.OfftuneMult));
    if (mult.length) sources.offtune = [...(sources.offtune ?? []), ...mult.map((r) => ({ ...r, section: ENERGY_RATE }))];
    const rate = tracing(snap, keysFor(snap.action, Stat.OfftuneBuildup));
    if (rate.length) sources.offtune = [...(sources.offtune ?? []), ...rate.map((r) => ({ ...r, section: OFFTUNE_RATE }))];
  }
  const direct = added(8);
  raw["moved:offtune"] = ((buildingOfftune < 0
    ? buildingOfftune
    : buildingOfftune * (snap.stat(Stat.OfftuneBuildup) / 100))
    + snap.action.castOfftune + direct.reduce((n, r) => n + r.value, 0)) / RESOURCE_SCALE.offtune;
  if (direct.length) {
    sources.offtune = [...(sources.offtune ?? []), ...direct.map((r) => ({
      ...r, value: r.value / RESOURCE_SCALE.offtune, section: "Direct Offtune",
    }))];
    buffed.add("offtune");
  }
  // forte: the action's declared delta plus whatever a hook added (`addGain()`)
  const FORTE_FIELD = ["forte1", "forte2", "forte3", "forte4", "forte5"] as const;
  FORTE_GAUGES.forEach((key, i) => {
    const unit = snap.forteScale[i]!;
    const traced = added(2 + i).map((r) => ({ ...r, value: r.value * unit }));
    const rows: TraceEntry[] = [];
    // a cast that wipes the bar first: its own row says so rather than carrying a figure, since
    // what it takes off is whatever happened to be there
    if (snap.action.resetForte[i]) {
      rows.push({ source: snap.action.name, value: 0, text: "Reset", owner: snap.member });
    }
    // the same two decimals the gauge's own column prints, so a fractional gain reads as one
    rows.push(...ownShares(snap, snap.action.castForte[i]! * unit, hitsBank(snap, FORTE_FIELD[i]!) * unit));
    rows.push(...traced);
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
    const base = hitsBank(snap, "mv");
    sources.mv = [
      ...(base ? [{ source: snap.action.name, label: "Base MV", value: base / MV_UNIT, percent: true, owner: snap.member }] : []),
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
          source: "", label: "Total", value, section: SECTION_OF[stat], percent: true, summary: true,
        }))];
    }
  }

  // scaler: a Total per section, then a "Final X" section with the stat itself and how far the
  // build lifts it over base — the fold is the engine's (damage.ts's `foldStat`), read back off
  // the figure it already produced rather than worked out a second time here
  const tracedScaler = sources.scaler;
  if (scaler && tracedScaler) {
    const [baseStat, bonusStat, flatStat] = scaler.stats;
    const sum = (stat: Stat) => tracedScaler
      .filter((r) => r.stat !== undefined && splitStat(r.stat)[0] === stat)
      .reduce((n, r) => n + r.value, 0);
    // the fold floors the base before taking the percentage, so the lift is measured off that
    const base = Math.floor(sum(baseStat));
    if (base) {
      const subtotal = (stat: Stat, percent: boolean): TraceEntry[] => (
        tracedScaler.some((r) => r.stat !== undefined && splitStat(r.stat)[0] === stat)
          ? [{ source: "", label: "Total", value: sum(stat), section: SECTION_OF[stat], percent, summary: true }]
          : []);
      const final = `Final ${scaler.word}`;
      sources.scaler = [
        ...tracedScaler,
        ...subtotal(baseStat, false), ...subtotal(bonusStat, true), ...subtotal(flatStat, false),
        { source: "", label: "Total", value: snap[scaler.key], section: final, summary: true },
        { source: "", label: "Relative", value: (snap[scaler.key] / base - 1) * 100, section: final, percent: true, digits: 2, summary: true },
      ];
    }
  }

  // a group row: stat columns are the last member's; the accumulating columns are rebuilt across
  // every member, panels laid end to end and folded
  if (members.length > 1) {
    const per = members.map((m) => rowValues(m, { mv: landedMv(m), avg: 0 }));
    for (const key of ["short:energy", "short:concerto", ...FORTE_GAUGES.map((k) => `short:gauge:${RESOURCE_NAME[k]}`)]) {
      raw[key] = per.some((p) => Number(p.raw[key])) ? 1 : 0;
    }
    raw["short:buff"] = per.map((p) => p.raw["short:buff"]).filter(Boolean).join(", ") || 0;
    for (const key of COMBINED_COLUMNS) {
      if (sources[key] === undefined && key === "mv") continue;
      const last = per.length - 1;
      const kept = per.flatMap((p, k) => (p.sources[key] ?? [])
        .filter((r) => (r.section !== OFFTUNE_RATE && r.section !== ENERGY_RATE && r.section !== ENERGY_REGEN) || k === last));
      // the Energy Regen section stands as the last member's, never folded: a kit's base and its own
      // bonus share a source
      const rows = [...foldDuplicates(kept.filter((r) => r.section !== ENERGY_REGEN)), ...kept.filter((r) => r.section === ENERGY_REGEN)];
      if (rows.length) sources[key] = rows; else delete sources[key];
      if (per.some((p) => p.buffed.has(key))) buffed.add(key);
      const moved = `moved:${key}`;
      if (per.some((p) => p.raw[moved] !== undefined)) {
        raw[moved] = per.reduce((n, p) => n + (Number(p.raw[moved]) || 0), 0);
      }
    }
    FORTE_GAUGES.forEach((key, i) => {
      raw[`before:gauge:${RESOURCE_NAME[key]}`] = shownBefore(members[0]!, 3 + i) * members[0]!.forteScale[i]!;
    });
    raw["before:energy"] = shownBefore(members[0]!, 0) / RESOURCE_SCALE.energy;
    raw["before:concerto"] = shownBefore(members[0]!, 1) / RESOURCE_SCALE.concerto;
    raw["before:offtune"] = shownBefore(members[0]!, 2) / RESOURCE_SCALE.offtune;
  }

  // a group's damage is its members': the motion value their sum, every other factor the one they
  // shared, or the range across them where they differed
  const floor4 = (v: number): number => Math.floor(v * 10000) / 10000;
  const dealers = (members.length ? members : [snap]).filter((m) => landedMv(m) !== 0);
  const fs = (dealers.length ? dealers : [snap]).map(damageFactors);
  const f = fs[fs.length - 1]!;
  const factor = (source: string, label: string, pick: (x: DamageFactors) => number, mult: boolean, round = (v: number): number => v): TraceEntry => {
    const vs = fs.map((x) => round(pick(x)));
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const row: TraceEntry = { source, label, value: vs[vs.length - 1]!, ...(mult ? { mult: true } : {}) };
    return lo === hi ? row : { ...row, text: `${mult ? "×" : ""}${fmtExact(lo)}–${fmtExact(hi)}` };
  };
  const any = (pick: (x: DamageFactors) => boolean): boolean => fs.some(pick);
  if (dealsDamage) sources.avg = [
    factor(f.scaling === null ? "" : STAT_SOURCE[f.scaling] ?? SCALING_NAME[f.scaling], "Final Stat", (x) => x.finalStat, false),
    { source: snap.action.name, label: "Motion Value", value: floor4(fs.reduce((n, x) => n + x.finalMv, 0)), mult: true },
    factor("buffs", "Damage Bonus", (x) => x.bonusFactor, true),
    factor("buffs", "Amplification", (x) => x.ampFactor, true),
    ...(any((x) => x.scaling === Scaling.Tune) ? [factor("buffs", "Tune Break Boost", (x) => x.tbbFactor, true)] : []),
    ...(any((x) => x.dealtFactor > 1) ? [factor("buffs", "Total Damage", (x) => x.dealtFactor, true)] : []),
    ...(any((x) => x.takenFactor > 1) ? [factor("enemy", "Damage Taken", (x) => x.takenFactor, true)] : []),
    factor("enemy", "Res Factor", (x) => x.resFactor, true),
    factor("enemy", "Def Factor", (x) => x.defFactor, true, floor4),
    factor("crit", "Average Crit", (x) => x.critFactor, true, floor4),
  ];

  // a press with no bullets deals as nothing, so it shows no stats — only the gauges its cast moved
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
  type: Type | null;
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
      key: `gauge:${RESOURCE_NAME[key]}`, label: RESOURCE_NAME[key], digits: 2, hideIfZero: true,
      full: RESOURCE_NAME[key],
    })),
  ];

  // a short row is one the engine queued rather than a rotation beat — the Tune Break itself excepted
  // (the cast that drains the bar), a press of the fight's own; a folded row is short only if every member is
  const isShort = (snap: ResolvedSnapshot) => snap.triggered && !(snap.action.cast === Cast.TuneBreak && snap.action.castOfftune < 0);
  const isShortLine = (line: ChainGroup) => (line.members?.length ? line.members.every(isShort) : isShort(line.snap));

  // a press ends where its animation ran out, or was cut or swapped out of (the swap delay a swap out
  // charges it included); an Outro where its animation does; a triggered one, a field's, where its last hit landed
  const endOf = (s: ResolvedSnapshot): number => (s.action.cast === Cast.Outro ? s.frame + s.action.animFrames
    : s.triggered && s.hitAt !== undefined ? s.hitAt : s.frame + s.frames + (s.swapFrames ?? 0));
  const partOf = (snap: ResolvedSnapshot, avg: number, shown: ResolvedSnapshot): ReportPart => {
    const part = rowValues(snap, { mv: landedMv(snap), avg });
    part.raw.action = snap.action.name;
    if (tagOf(snap)) part.raw["tag:action"] = tagOf(snap);
    const end = endOf(snap);
    part.raw.time = clockAt(end);
    part.raw["end:time"] = end;
    return {
      ...part,
      info: actionInfo(snap),
      type: snap.type, scaling: snap.action.scaling, isShown: snap === shown, snap, short: isShort(snap),
    };
  };

  const rows: ReportRow[] = lines.map((line) => {
    const snap = line.snap;
    const { raw, sources, buffed } = rowValues(snap, { mv: line.mv, avg: line.avg }, line.members ?? []);
    raw.action = line.id;
    // a group is cut where its last press is
    if (tagOf(snap)) raw["tag:action"] = tagOf(snap);
    // a group or a field's run ends when its last press does, whatever snap the row reads
    const end = Math.max(...(line.members?.length ? line.members : [snap]).map(endOf));
    raw.time = clockAt(end);
    raw["end:time"] = end;
    return {
      line, raw, sources, buffed,
      // `snap.type`, not `action.type`: the type it was actually evaluated as (typeOverride)
      info: actionInfo(snap),
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
  // a cancel tag rides in the name cell, boxed, beside the name: 10px letters (about 0.82 of a
  // name character) plus its 16px of padding, border and margin (about 2 characters)
  const tagLen = (r: { raw: RawRow }, c: Column): number => (c.key === "action" && r.raw["tag:action"] ? Math.ceil(String(r.raw["tag:action"]).length * 0.82 + 2.6) : 0);
  const sized: Column[] = used.map((c) => {
    const lens = [c.label.length];
    for (const r of rows) {
      lens.push(shown(r, c).length + tagLen(r, c));
      // a part's name is indented in the grid (index.css `.parts .name`), so it needs the room
      for (const p of r.parts) lens.push(shown(p, c).length + (c.key === "action" ? 3 : 0) + tagLen(p, c));
    }
    return { ...c, width: Math.max(...lens) + 1 };
  });

  // a field summary restates hits already counted on their own rows (`aggregate`)
  return {
    columns: sized, rows,
    total: rows.reduce((n, r) => n + (r.line.aggregate ? 0 : Number(r.raw.avg) || 0), 0),
  };
}
