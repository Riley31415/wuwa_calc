/**
 * The substat tuning simulator's scoring side — internal testing only, never imported by the page,
 * the solver or precompute. One team at one solve, one member's own damage scored for any set of
 * rolled substat lines, everything else about the team held where the solve put it.
 */
import type { Loadout } from "../src/engine/gear.js";
import { runRotations } from "../src/engine/rotation.js";
import { State } from "../src/engine/state.js";
import type { ResolvedSnapshot } from "../src/engine/evaluate.js";
import { withTeam, equip, equipEnemy, setTracing } from "../src/engine/context.js";
import { damageFactors } from "../src/engine/damage.js";
import { Stat, Scaling } from "../src/engine/stats.js";
import { TUNE_BREAK_ENEMY } from "../src/shared/tunebreak.js";
import { ALL_TEAMS, teamKey } from "../src/resonators/teams.js";
import { teamFromKey, optimizeTeam, defaultFilters, comboOf } from "../src/solve/solver.js";
import type { Member, Combo, Pick, TeamCost } from "../src/solve/solver.js";
import { runTeam } from "../src/solve/teamrun.js";
import { Substat, ErSpread, rollSpread, rolledPiece } from "../src/shared/substats.js";

/** One substat line as it rolled. */
export type Line = readonly [Substat, number];

/** Every substat, in enum order. */
export const SUBSTATS: Substat[] = Array.from({ length: Substat.Liberation + 1 }, (_, s) => s);

/** The four typed dmg bonus substats. */
export const DMG_SUBSTATS = [Substat.Basic, Substat.Heavy, Substat.Skill, Substat.Liberation];

/** Lines summed per substat, indexed by `Substat`. */
export function totalsOf(lines: readonly Line[]): Float64Array {
  const t = new Float64Array(SUBSTATS.length);
  for (const [s, v] of lines) t[s] = t[s]! + v;
  return t;
}

/** The substat pairs each scaling stat folds from: its percent line and its flat line. */
const FOLDS = [
  { base: Stat.BaseAtk, pct: Stat.BonusAtk, flat: Stat.FlatAtk, subPct: Substat.AtkPct, subFlat: Substat.FlatAtk },
  { base: Stat.BaseHp, pct: Stat.BonusHp, flat: Stat.FlatHp, subPct: Substat.HpPct, subFlat: Substat.FlatHp },
  { base: Stat.BaseDef, pct: Stat.BonusDef, flat: Stat.FlatDef, subPct: Substat.DefPct, subFlat: Substat.FlatDef },
];

/** One hit as a traced fight resolved it: what the formula reads off it (see `Target`). */
interface Row {
  name: string;
  /** Which of ATK/HP/DEF it scales on, -1 for a hit no stat moves (Tune, dot, fixed). */
  fold: number;
  base: number;
  /** percent, flat, dmg bonus, crit rate, crit dmg, and the product of everything else */
  x: number[];
  typed: number;
  avg: number;
}

/** One traced hit as the formula reads it. */
function rowOf(s: ResolvedSnapshot): Row {
  const scaling = s.action.scaling;
  const fold = scaling === Scaling.Atk ? 0 : scaling === Scaling.Hp ? 1 : scaling === Scaling.Def ? 2 : -1;
  if (fold < 0) return { name: s.action.name, fold, base: 0, x: [0, 0, 0, 0, 0, 0], typed: -1, avg: s.avg };
  const d = damageFactors(s);
  const { base, pct, flat } = FOLDS[fold]!;
  return {
    name: s.action.name, fold, base: Math.floor(s.stats[base]!),
    x: [s.stats[pct]!, s.stats[flat]!, s.dmgBonus, s.stats[Stat.CritRate]!, s.stats[Stat.CritDmg]!,
      d.finalMv * d.ampFactor * d.tbbFactor * d.resFactor * d.defFactor * d.dealtFactor * d.takenFactor],
    typed: DMG_SUBSTATS.find((t) => rollSpread(t).tag === s.type) ?? -1, avg: s.avg,
  };
}

/** What moved `row` off `base` past `own`, what the lines that moved add to its figures themselves:
 *  each of `Row.x`'s figures, the last (and a hit no stat moves, its damage) as a share. */
function residual(row: Row, base: Row, own: number[]): number[] {
  if (row.fold < 0) return [0, 0, 0, 0, 0, row.avg / base.avg - 1];
  return [...own.map((v, j) => row.x[j]! - base.x[j]! - v), row.x[5]! / base.x[5]! - 1];
}

/** A dimension a kit's conversions can read: one substat, or a scaling stat's percent and flat
 *  lines together as the flat amount they come to — what an HP conversion reads is the HP, however
 *  HP% and flat HP make it up. */
interface Axis {
  label: string;
  /** Where a build's substat totals sit on it. */
  at(t: ArrayLike<number>): number;
  /** How far it reaches: every line it takes, five times, at its top roll. */
  span: number;
  /** Points its curves are read at, `span` apart end to end — fine enough to draw the steps kits
   *  read their stats in (1000 HP a step, a set's bonus switching on at 250% ER) rather than smear
   *  them over the gap between two points. */
  grid: number;
  /** `ref` moved to `c` on it. */
  lines(ref: readonly Line[], c: number): Line[];
  /** What `ref` moved to `c` adds to a hit's own figures (`Row.x`'s first five), conversions aside. */
  own(row: Row, c: number): number[];
}

/**
 * One member of one team, scored on their own damage: the team on `picks` (a solve's), that member's
 * substat spread replaced by whatever lines they are scored on.
 *
 * `score` fights the whole team. `damage` is the same fight folded into one formula: a traced run
 * wearing `ref` gives every hit's resolved stats, everything substats cannot move is multiplied
 * into one constant per hit, and hits that read the same stats are summed into one term — so a
 * build is priced off its substat totals alone. A kit that reads its own stats back (ER into ATK,
 * HP into damage) moves a hit's figures past what the lines add themselves: two probe fights per
 * axis (an `Axis`: a substat, or ATK/HP/DEF as their lines come to) find every such dimension, and
 * those are fought along their whole span so the formula reads what they pay out off a curve per
 * hit and figure, thresholds, steps and caps included. Axes are taken to convert apart from one
 * another; `check` measures how far off that leaves it, and the per-hit damage floor is the one
 * other thing lost.
 */
export class Target {
  readonly key: string;
  readonly members: Member[];
  readonly combo: Combo[];
  readonly slot: number;
  /** Base ATK, weapon included — what an ATK% line multiplies. */
  readonly baseAtk: number;
  /** The ER the member's Liberation needs all told, and what of it substats have to carry on top of
   *  the rest of their gear — the kit's own minimum (`Loadout.minEr`) where that is the higher. */
  readonly erWant: number;
  readonly erNeed: number;
  /** The formula's terms, one per distinct set of stats the hits read: `k` everything substats
   *  can't move, `fold` which of ATK/HP/DEF it scales on, then that stat's floored base, percent and
   *  flat, its dmg bonus, crit rate and crit dmg as `ref` left them, and the typed dmg substat that
   *  reaches it (-1 for none). */
  private readonly k: Float64Array;
  private readonly fold: Int8Array;
  private readonly base: Float64Array;
  private readonly pct: Float64Array;
  private readonly flat: Float64Array;
  private readonly bonus: Float64Array;
  private readonly cr: Float64Array;
  private readonly cd: Float64Array;
  private readonly typed: Int8Array;
  /** The dimensions conversions read, and which of them any do. */
  private readonly axes: Axis[];
  private readonly used: number[];
  /** What conversions add to a term's figures, past each line's own: term `i`'s run from
   *  `convFrom[i]` to `convFrom[i + 1]`, each the axis read, the figure it moves (`Row.x`'s order,
   *  the last as a share of the term's `k`), its curve (the axis's `grid` points from `convAt`) and
   *  that curve at `ref`. */
  private readonly convFrom: Int32Array;
  private readonly convAxis: Int8Array;
  private readonly convAt: Int32Array;
  private readonly convFigure: Int8Array;
  private readonly convCurve: Float64Array;
  private readonly convRef: Float64Array;
  private readonly picks: Pick[];
  /** Damage from hits no substat moves (Tune, dot, fixed), and what conversions add to it per axis
   *  (a curve over the axis's `grid` points, or null). */
  private readonly fixed: number;
  private readonly fixedCurves: (Float64Array | null)[];
  private readonly ref: Float64Array;
  /** Engine damage over the formula's at `ref`: the run's DPR scaling, and its floors. */
  private readonly scale: number;

  /** `who` on team `key` (`teamKey`) wearing `picks`; `ref` is the build the formula is folded at. */
  constructor(key: string, who: string, picks: readonly Pick[], ref: readonly Line[]) {
    this.key = key;
    this.members = teamFromKey(key);
    this.slot = this.members.findIndex((m) => m.name === who);
    if (this.slot < 0) throw new Error(`${who} is not on ${key}`);
    this.picks = picks.slice();
    this.combo = picks.map((p, i) => comboOf(this.members[i]!.loadout, p));

    const bare = runTeam(key, this.wearing([]), this.combo).state!.slots[this.slot]!;
    this.erWant = Math.max(bare.erWorst, this.members[this.slot]!.loadout.minEr);
    this.erNeed = Math.max(0, this.erWant - bare.constEr);
    this.ref = totalsOf(ref);

    const traced = this.trace(ref);
    const hits = traced.map(rowOf);
    const top = (s: Substat): number => Math.max(...rollSpread(s).values);
    const without = (lines: readonly Line[], ...gone: Substat[]): Line[] => lines.filter(([s]) => !gone.includes(s));
    this.axes = [
      ...[Substat.CritRate, Substat.CritDmg, Substat.Er, ...DMG_SUBSTATS].map((s): Axis => ({
        label: rollSpread(s).label, at: (t) => t[s]!, span: 5 * top(s), grid: 129,
        lines: (lines, c) => [...without(lines, s), ...(c > 0 ? [[s, c] as Line] : [])],
        own: (row, c) => {
          const d = c - this.ref[s]!;
          return [0, 0, s === row.typed ? d : 0, s === Substat.CritRate ? d : 0, s === Substat.CritDmg ? d : 0];
        },
      })),
      ...FOLDS.map(({ base, subPct, subFlat }, f): Axis => {
        // percent lines count as what they come to off the base, and a point on it is made of flat
        // lines alone
        const b = traced.length ? Math.floor(traced[0]!.stats[base]!) : 0;
        return {
          label: ["ATK", "HP", "DEF"][f]!, at: (t) => b * t[subPct]! / 100 + t[subFlat]!, span: 5 * (b * top(subPct) / 100 + top(subFlat)), grid: 129,
          lines: (lines, c) => [...without(lines, subPct, subFlat), ...(c > 0 ? [[subFlat, c] as Line] : [])],
          own: (row, c) => (row.fold === f ? [-this.ref[subPct]!, c - this.ref[subFlat]!, 0, 0, 0] : [0, 0, 0, 0, 0]),
        };
      }),
    ];

    // two probes an axis, none of it and a top line more than the reference: a figure that moved
    // past what the lines add themselves is a conversion (one probe alone misses one the reference
    // holds at its cap), and a converting axis is fought along its whole span
    const curves: number[][][][] = hits.map(() => []);
    this.axes.forEach((axis, a) => {
      const moved = (c: number): boolean => this.traceAt(axis, ref, c, hits)
        .some((row, h) => residual(row, hits[h]!, axis.own(row, c)).some((r) => Math.abs(r) > 1e-7));
      if (!moved(axis.at(this.ref) + axis.span / 5) && !moved(0)) return;
      for (let g = 0; g < axis.grid; g++) {
        const c = axis.span * g / (axis.grid - 1);
        this.traceAt(axis, ref, c, hits).forEach((row, h) => {
          (curves[h]![a] ??= Array.from({ length: axis.grid }, () => []))[g] = residual(row, hits[h]!, axis.own(row, c));
        });
      }
    });

    // hits that read the same figures, and convert the same, are one term
    const terms = new Map<string, { k: number; row: Row; conv: number[][][] }>();
    let fixed = 0, baseAtk = 0;
    const fixedCurves: (Float64Array | null)[] = this.axes.map(() => null);
    hits.forEach((row, h) => {
      const conv = curves[h]!;
      if (row.fold < 0) {
        fixed += row.avg;
        conv.forEach((grid, a) => {
          const sum = (fixedCurves[a] ??= new Float64Array(this.axes[a]!.grid));
          grid.forEach((r, g) => {
            sum[g] = sum[g]! + row.avg * r[5]!;
          });
        });
        return;
      }
      baseAtk = row.fold === 0 ? row.base : baseAtk;
      const key = JSON.stringify([row.fold, row.base, ...row.x.slice(0, 5), row.typed, conv.map((grid) => grid.map((r) => r.map((v) => +v.toPrecision(9))))]);
      const term = terms.get(key);
      if (term) term.k += row.x[5]!;
      else terms.set(key, { k: row.x[5]!, row, conv });
    });
    const all = [...terms.values()];
    this.k = Float64Array.from(all, (t) => t.k);
    this.fold = Int8Array.from(all, (t) => t.row.fold);
    this.base = Float64Array.from(all, (t) => t.row.base);
    this.pct = Float64Array.from(all, (t) => t.row.x[0]!);
    this.flat = Float64Array.from(all, (t) => t.row.x[1]!);
    this.bonus = Float64Array.from(all, (t) => t.row.x[2]!);
    this.cr = Float64Array.from(all, (t) => t.row.x[3]!);
    this.cd = Float64Array.from(all, (t) => t.row.x[4]!);
    this.typed = Int8Array.from(all, (t) => t.row.typed);
    const from: number[] = [], axis: number[] = [], figure: number[] = [], curveAt: number[] = [], curve: number[] = [], atRef: number[] = [];
    all.forEach((t) => {
      from.push(axis.length);
      t.conv.forEach((grid, a) => {
        for (let j = 0; j < 6; j++) {
          const c = grid.map((r) => r[j]!);
          if (!c.some((v) => Math.abs(v) > 1e-9)) continue;
          axis.push(a);
          figure.push(j);
          curveAt.push(curve.length);
          curve.push(...c);
          atRef.push(this.read(c, a, this.axes[a]!.at(this.ref)));
        }
      });
    });
    from.push(axis.length);
    this.convFrom = Int32Array.from(from);
    this.convAxis = Int8Array.from(axis);
    this.convAt = Int32Array.from(curveAt);
    this.convFigure = Int8Array.from(figure);
    this.convCurve = Float64Array.from(curve);
    this.convRef = Float64Array.from(atRef);
    this.fixed = fixed;
    this.fixedCurves = fixedCurves;
    this.used = this.axes.map((_, a) => a).filter((a) => axis.includes(a) || fixedCurves[a]);
    this.baseAtk = baseAtk;
    this.scale = 1;
    this.scale = this.score(ref) / this.damageAt(this.ref);
  }

  /** The dimensions the kit reads back past the lines they are, by name. */
  get converting(): string[] {
    return this.used.map((a) => this.axes[a]!.label);
  }

  /** A curve over axis `a`'s grid, at `c` on it. */
  private read(curve: ArrayLike<number>, a: number, c: number, from = 0): number {
    const n = this.axes[a]!.grid;
    const f = Math.min(n - 1, Math.max(0, c / this.axes[a]!.span * (n - 1))), g = Math.min(n - 2, Math.floor(f));
    return curve[from + g]! + (curve[from + g + 1]! - curve[from + g]!) * (f - g);
  }

  /** The member's hits wearing `ref` moved to `c` on `axis`, lined up hit for hit with `hits` — a
   *  fight whose hits fall otherwise can't be read against it. */
  private traceAt(axis: Axis, ref: readonly Line[], c: number, hits: readonly Row[]): Row[] {
    const rows = this.trace(axis.lines(ref, c)).map(rowOf);
    if (rows.length !== hits.length || rows.some((r, h) => r.name !== hits[h]!.name)) {
      throw new Error(`${this.members[this.slot]!.name}: ${axis.label} at ${c} changes the fight's hits, which the formula can't fold`);
    }
    return rows;
  }

  /** `who` on the team of `names` (any order), solved under `cost` with their own main stat pinned to
   *  `mainstat`, a name off their loadout's list. */
  static solved(names: string[], who: string, mainstat: string, ref: readonly Line[], cost: TeamCost = "s0r1"): Target {
    const index = ALL_TEAMS.findIndex((t) => t.loadouts.length === names.length
      && names.every((n) => t.loadouts.some((l) => l.resonator.name === n)));
    if (index < 0) throw new Error(`no team of ${names.join(" / ")}`);
    const key = teamKey(index);
    const members = teamFromKey(key);
    const slot = members.findIndex((m) => m.name === who);
    if (slot < 0) throw new Error(`${who} is not on ${names.join(" / ")}`);
    const picks = optimizeTeam(key, members, { ...defaultFilters(), cost });
    const at = members[slot]!.loadout.mainstats.findIndex((x) => x.name === mainstat);
    if (at < 0) throw new Error(`${who} has no main stat named ${mainstat}`);
    picks[slot] = { ...picks[slot]!, mainstat: at };
    return new Target(key, who, picks, ref);
  }

  /** The member's damage on their own ChemX32 spread, at the ER tier the run settles on. */
  chem(): number {
    return runTeam(this.key, this.members, this.combo).bySlot.get(this.members[this.slot]!.name) ?? 0;
  }

  /** How many terms the formula came to. */
  get terms(): number {
    return this.k.length;
  }

  /** The member wearing exactly `lines`, fought out in full. */
  score(lines: readonly Line[]): number {
    const members = this.wearing(lines);
    return runTeam(this.key, members, this.combo).bySlot.get(members[this.slot]!.name) ?? 0;
  }

  /** The member's damage wearing `lines`, off the formula. */
  damage(lines: readonly Line[]): number {
    return this.damageAt(totalsOf(lines));
  }

  /** The member's damage at these substat totals (indexed by `Substat`), off the formula. */
  damageAt(totals: ArrayLike<number>): number {
    const ref = this.ref;
    const dCr = totals[Substat.CritRate]! - ref[Substat.CritRate]!;
    const dCd = totals[Substat.CritDmg]! - ref[Substat.CritDmg]!;
    // where the build sits on every axis a conversion reads
    const at = this.used.length ? this.axes.map((axis, a) => (this.used.includes(a) ? axis.at(totals) : 0)) : null;
    const conv = [0, 0, 0, 0, 0, 0];
    let sum = 0;
    for (let i = 0; i < this.k.length; i++) {
      conv.fill(0);
      for (let e = this.convFrom[i]!; e < this.convFrom[i + 1]!; e++) {
        const a = this.convAxis[e]!, j = this.convFigure[e]!;
        conv[j] = conv[j]! + this.read(this.convCurve, a, at![a]!, this.convAt[e]!) - this.convRef[e]!;
      }
      const { subPct, subFlat } = FOLDS[this.fold[i]!]!;
      const b = this.base[i]!;
      // the engine's own fold: floor(base) + floor(base x percent) + flat, floored again as it's read
      const stat = Math.floor(b + Math.floor(b * (this.pct[i]! + totals[subPct]! - ref[subPct]! + conv[0]!) / 100)
        + this.flat[i]! + totals[subFlat]! - ref[subFlat]! + conv[1]!);
      const t = this.typed[i]!;
      const bonus = 1 + (this.bonus[i]! + (t < 0 ? 0 : totals[t]! - ref[t]!) + conv[2]!) / 100;
      const cr = (this.cr[i]! + dCr + conv[3]!) / 100, cd = (this.cd[i]! + dCd + conv[4]!) / 100;
      sum += this.k[i]! * (1 + conv[5]!) * stat * bonus * (cr >= 1 ? cd : 1 - cr + cd * cr);
    }
    let fixed = this.fixed;
    for (const a of this.used) {
      const c = this.fixedCurves[a];
      if (c) fixed += this.read(c, a, at![a]!) - this.read(c, a, this.axes[a]!.at(ref));
    }
    return this.scale * (fixed + sum);
  }

  /** The largest relative gap between `damage` and a full fight over `builds`. */
  check(builds: readonly (readonly Line[])[]): number {
    return Math.max(...builds.map((b) => Math.abs(this.damage(b) / this.score(b) - 1)));
  }

  /** The team with the member's substat spread swapped for `lines`. A fresh loadout per call: the
   *  run's ER caches key on the loadout and the combo, and the combo is the same whatever the lines. */
  private wearing(lines: readonly Line[]): Member[] {
    const m = this.members[this.slot]!;
    const ers = lines.filter(([s]) => s === Substat.Er).length;
    const spread = new ErSpread([], [{ rolls: ers, piece: rolledPiece("Tuned", lines) }]);
    const loadout: Loadout = Object.assign(Object.create(m.loadout) as Loadout, { substat: spread });
    return this.members.map((x, i) => (i === this.slot ? { ...x, loadout } : x));
  }

  /** The member's damaging hits in one traced fight wearing `lines` — the fight `runTeam` scores,
   *  cut where it cuts it. */
  private trace(lines: readonly Line[]): ResolvedSnapshot[] {
    const members = this.wearing(lines);
    setTracing(true);
    try {
      for (let replay = false; ; replay = true) {
        const state = new State(members.map((m) => m.name));
        members.forEach((m, i) => {
          state.active = i;
          const c = this.combo[i]!;
          withTeam(state, () => {
            for (const g of m.loadout.pieces(c.weapon, c.echo, c.mainstat, c.sequence, c.matrix !== null, c.highSubs, 0)) equip(g, 1);
          });
        });
        state.active = 0;
        withTeam(state, () => equipEnemy(TUNE_BREAK_ENEMY));
        const { sections, end, blind } = runRotations(state, members.map((m, i) => m.loadout.rotationAt(this.combo[i]!.sequence)), 4);
        // a handoff that went blind is played again, every visit's successor known by now
        if (blind && !replay) continue;
        const name = members[this.slot]!.name;
        // by the row a hit is credited to, as `bySlot` sums it: the Tune Break lands as whoever is on field
        return (sections.flat() as ResolvedSnapshot[]).filter((s) => s.slot === name && s.avg !== 0 && s.starts <= end);
      }
    } finally {
      setTracing(false);
    }
  }
}
