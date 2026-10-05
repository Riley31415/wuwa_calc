/**
 * The substat tuning simulator — internal testing only. Tunes echoes for a 43311 setup one roll at
 * a time until a goal stands, counting the tuners it took: the damage a target build deals, with
 * some of its stats' own sums met besides.
 */
import { Substat, rollSpread, rollAt } from "../src/shared/substats.js";
import { SUBSTATS, DMG_SUBSTATS, totalsOf } from "./target.js";
import type { Line, Target } from "./target.js";

/** A build: lines per substat, at most five of one (five echoes) and twenty-five in all. */
export type Build = Map<Substat, number>;

/** A goal written as line counts: ER's own two lines stand where the goal's "2" falls, and every
 *  other digit takes the next stat down `priority` — "554421" over CR, CD, ATK%, Flat, Heavy, Lib is
 *  5 CR, 5 CD, 4 ATK%, 4 Flat, 2 ER, 1 Heavy. */
export function buildOf(digits: string, priority: readonly Substat[]): Build {
  const at = digits.indexOf("2");
  if (at < 0) throw new Error(`${digits}: no 2 to put ER's lines at`);
  const rest = [...digits.slice(0, at) + digits.slice(at + 1)];
  if (rest.length > priority.length) throw new Error(`${digits}: ${rest.length} stats past ER, the priority names ${priority.length}`);
  const build: Build = new Map(rest.map((d, i) => [priority[i]!, +d]));
  build.set(Substat.Er, 2);
  const total = [...build.values()].reduce((a, b) => a + b, 0);
  if ([...build.values()].some((n) => n > 5) || total > 25) throw new Error(`${digits}: five echoes carry five of a stat and 25 lines`);
  return build;
}

/** The percentile that lands one value above ChemX32's median on every spread at once — the
 *  middle of the band where every spread agrees. */
export function tierUpPercentile(): number {
  let lo = 0, hi = 1;
  for (const s of SUBSTATS) {
    const { values, weights } = rollSpread(s);
    const total = weights.reduce((a, b) => a + b, 0);
    const at = values.indexOf(rollAt(s, 0.5));
    const upTo = (i: number) => weights.slice(0, i + 1).reduce((a, b) => a + b, 0) / total;
    lo = Math.max(lo, upTo(at));
    hi = Math.min(hi, upTo(at + 1));
  }
  if (lo >= hi) throw new Error("no one percentile lands one tier above the median on every spread");
  return (lo + hi) / 2;
}

/** A build's lines, every one at percentile `p`. */
export const linesOf = (build: Build, p: number): Line[] =>
  [...build].flatMap(([s, n]) => Array.from({ length: n }, (): Line => [s, rollAt(s, p)]));

/** What the tuning chases: `progress` in line-equivalents, capped wherever the goal is already met
 *  so overshooting one part buys nothing, and `done` once every part is met. */
export interface Objective {
  name: string;
  progress(t: Float64Array): number;
  /** Where the setup stands now: the steering reads what a stat would pay from here on (see
   *  `pricing`), so the tuner calls this whenever its setup changes. */
  rebase?(t: Float64Array): void;
  /** `progress` of `t` with `v` more of stat `s`, for many stats and values off the one `t` — priced
   *  off `t`'s own figures (see `pricing`), and with `optimistic` a bound over it that never reads
   *  the real damage. */
  near(t: Float64Array, optimistic?: boolean): (s: Substat, v: number) => number;
  done(t: Float64Array): boolean;
}

/** A stat a goal can ask a sum of: one substat, ATK% and Flat ATK together, or every dmg% line. */
export type Bucket = Substat | "atk" | "dmg";

/** What each substat adds to a bucket's sum, the sum `build` asks for at percentile `p`, and what
 *  one line of it is worth. ATK counts in ATK%, Flat over base ATK. Dmg% counts in lines of the
 *  best type, each type weighted by what one line of it adds to `build` with its dmg% lines out. */
function bucketOf(bucket: Bucket, target: Target, build: Build, p: number): { coef: Float64Array; need: number; unit: number } {
  const coef = new Float64Array(SUBSTATS.length);
  let unit: number;
  if (bucket === "atk") {
    coef[Substat.AtkPct] = 1;
    coef[Substat.FlatAtk] = 100 / target.baseAtk;
    unit = rollAt(Substat.AtkPct, p);
  } else if (bucket === "dmg") {
    const without = totalsOf(linesOf(new Map([...build].filter(([s]) => !DMG_SUBSTATS.includes(s))), p));
    const bare = target.damageAt(without);
    const worth = DMG_SUBSTATS.map((s) => {
      const t = without.slice();
      t[s] = t[s]! + rollAt(s, p);
      return target.damageAt(t) - bare;
    });
    const best = Math.max(...worth);
    DMG_SUBSTATS.forEach((s, i) => {
      coef[s] = worth[i]! / best / rollAt(s, p);
    });
    unit = 1;
  } else {
    coef[bucket] = 1;
    unit = rollAt(bucket, p);
  }
  const need = [...build].reduce((n, [s, k]) => n + coef[s]! * k * rollAt(s, p), 0);
  return { coef, need, unit };
}

/**
 * A setup's damage as the climb reads it, every line priced by what it's worth to a finished build
 * (`anchor`'s totals): each stat's damage with every other stat at the anchor's, off a curve per
 * stat, her crit cap included. Priced on the setup as it stands, Crit DMG is worth little while
 * Crit Rate is still short, and gets put off. Held under the real damage, so a setup the pricing
 * calls done but isn't can't stall the climb.
 */
function pricing(target: Target, anchor: Float64Array): {
  rebase: (t: Float64Array) => void;
  value: (t: Float64Array) => number;
  near: (t: Float64Array, optimistic: boolean) => (s: Substat, v: number) => number;
} {
  const at0 = target.damageAt(anchor);
  const tops = SUBSTATS.map((s) => Math.max(...rollSpread(s).values));
  const spans = tops.map((top) => 5 * top);
  const curves = SUBSTATS.map((s) => {
    const at = anchor.slice();
    return Float64Array.from({ length: 65 }, (_, k) => {
      at[s] = spans[s]! * k / 64;
      return target.damageAt(at) - at0;
    });
  });
  // what a stat would pay from where the setup stands on to its best: past `x0`, the least concave
  // curve over its own. A stat that only pays past a threshold (an inherent waking at 125% ER, a set
  // bonus at 250%) is worth, a line short of it, its share of what it pays once there — seen a line
  // at a time it is worth nothing until it is past, and a run that doesn't gather enough of it by
  // chance never starts on it — and once a run is past it, what each line truly adds
  const lifts = curves.map((c) => new Float64Array(c.length));
  const rebase = (t: Float64Array): void => {
    curves.forEach((c, s) => {
      const lift = lifts[s]!;
      lift.fill(0);
      const f = Math.min(64, t[s]! / spans[s]! * 64), from = Math.min(63, Math.floor(f));
      // the hull's points: the setup's own, then every grid point past it
      const xs = [f], ys = [c[from]! + (c[from + 1]! - c[from]!) * (f - from)];
      for (let k = from + 1; k < c.length; k++) {
        xs.push(k);
        ys.push(c[k]!);
      }
      const keep: number[] = [];
      for (let k = 0; k < xs.length; k++) {
        // drop the last point while it sits on or under the line from the one before it to this one
        while (keep.length >= 2) {
          const a = keep[keep.length - 2]!, b = keep[keep.length - 1]!;
          if ((ys[b]! - ys[a]!) * (xs[k]! - xs[a]!) > (ys[k]! - ys[a]!) * (xs[b]! - xs[a]!)) break;
          keep.pop();
        }
        keep.push(k);
      }
      for (let j = 0; j + 1 < keep.length; j++) {
        const a = keep[j]!, b = keep[j + 1]!;
        for (let k = a; k <= b; k++) {
          if (k === 0) continue;
          lift[xs[k]!] = ys[a]! + (ys[b]! - ys[a]!) * (xs[k]! - xs[a]!) / (xs[b]! - xs[a]!) - ys[k]!;
        }
      }
    });
  };
  rebase(new Float64Array(SUBSTATS.length));
  const read = (c: Float64Array, s: number, x: number): number => {
    const f = Math.min(64, x / spans[s]! * 64), k = Math.min(63, Math.floor(f));
    return c[k]! + (c[k + 1]! - c[k]!) * (f - k);
  };
  /** What the hull lifts stat `s` at `x` over its own curve. */
  const lift = (s: number, x: number): number => read(lifts[s]!, s, x);
  const hull = (s: number, x: number): number => read(curves[s]!, s, x) + lift(s, x);
  const separate = (t: Float64Array): number => {
    let d = at0;
    for (let s = 0; s < t.length; s++) d += hull(s, t[s]!);
    return d;
  };
  const uplift = (t: Float64Array): number => {
    let d = 0;
    for (let s = 0; s < t.length; s++) d += lift(s, t[s]!);
    return d;
  };
  return {
    rebase,
    // the real damage carries the same lift, so the cap it puts on the curves keeps the stats'
    // interplay without taking back what the hull gives a stat short of its threshold
    value: (t) => Math.min(separate(t), target.damageAt(t) + uplift(t)),
    // one stat moved off `t`: the curves move on that stat alone, and the real damage runs along a
    // line out to the stat's top roll — every term of it is linear in one stat but crit rate, whose
    // cap bends it, so that one is fought out exactly
    near: (t, optimistic) => {
      const base = separate(t), up = optimistic ? 0 : uplift(t), real = optimistic ? Infinity : target.damageAt(t);
      const slopes = new Float64Array(SUBSTATS.length).fill(NaN);
      const at = t.slice();
      return (s, v) => {
        const d = base - hull(s, t[s]!) + hull(s, t[s]! + v);
        if (optimistic) return d;
        const moved = up - lift(s, t[s]!) + lift(s, t[s]! + v);
        at[s] = t[s]! + v;
        if (s === Substat.CritRate) {
          const r = target.damageAt(at);
          at[s] = t[s]!;
          return Math.min(d, r + moved);
        }
        let k = slopes[s]!;
        if (k !== k) {
          at[s] = t[s]! + tops[s]!;
          k = slopes[s] = (target.damageAt(at) - real) / tops[s]!;
        }
        at[s] = t[s]!;
        return Math.min(d, real + k * v + moved);
      };
    },
  };
}

/**
 * A goal of `name`: the target build's damage at percentile `p`, with the build's own sums of the
 * `mins` buckets filled at that quality besides — the rest of its lines only count through the
 * damage. Every line of the setup counts, goal stat or not.
 *
 * The climb is steered by `guides` (the mins and any more): each guide's sum counts towards
 * progress in lines of `p` quality up to the build's own, whether the goal needs it or not, and the
 * damage counts as the build's lines past the guides, shared out evenly over the climb from no
 * substats to the target. A guide the goal doesn't need only steers — a run stops the moment the
 * mins and the damage stand, so it never costs more than the goal with that guide as a min.
 */
export function goalOf(name: string, target: Target, build: Build, p: number, mins: readonly Bucket[], guides: readonly Bucket[] = mins): Objective {
  const want = target.damageAt(totalsOf(linesOf(build, p)));
  const held = [...new Set([...mins, ...guides])]
    .map((b) => ({ ...bucketOf(b, target, build, p), required: mins.includes(b) }))
    .filter((b) => b.need > 0);
  const covered = (s: Substat): boolean => held.some((b) => b.coef[s]! > 0);
  const lines = [...build].reduce((n, [s, k]) => n + (covered(s) ? 0 : k), 0);
  const have = (b: (typeof held)[number], t: Float64Array): number => {
    let n = 0;
    for (let s = 0; s < t.length; s++) n += b.coef[s]! * t[s]!;
    return n;
  };
  const { rebase, value, near } = pricing(target, totalsOf(linesOf(build, p)));
  const zero = value(new Float64Array(SUBSTATS.length));
  // with every goal line in a bucket there is no damage share to count
  const share = (d: number): number => (lines ? (Math.min(d, want) - zero) / (want - zero) * lines : 0);
  return {
    name,
    rebase,
    progress: (t) => {
      let n = share(value(t));
      for (const b of held) n += Math.min(have(b, t), b.need) / b.unit;
      return n;
    },
    near: (t, optimistic = false) => {
      const at = near(t, optimistic), haves = held.map((b) => have(b, t));
      return (s, v) => {
        let n = share(at(s, v));
        for (let i = 0; i < held.length; i++) n += Math.min(haves[i]! + held[i]!.coef[s]! * v, held[i]!.need) / held[i]!.unit;
        return n;
      };
    },
    done: (t) => held.every((b) => !b.required || have(b, t) >= b.need - 1e-9) && target.damageAt(t) >= want,
  };
}

/**
 * No goal to reach: the member's damage as high as a budget takes it, with their ER requirement
 * (`Target.erNeed`) met — `done` never stands. Steered as `goalOf` steers, every line priced against
 * the finished build `anchor` (its line counts at median rolls): the damage counts in lines of the
 * anchor's average worth past ER, and ER counts `erWeight` lines a median ER line up to the
 * requirement and `erBonus` lines more for meeting it — a setup that ends short of it is no build at
 * all, so the last point of ER is worth far more than its share.
 */
export function maxOf(name: string, target: Target, anchor: Build, erWeight: number, erBonus: number, erFloor = 0): Objective {
  // the ER steered for: the requirement, or more where a floor asks it (the requirement itself stays the test)
  const need = Math.max(target.erNeed, erFloor);
  const at = totalsOf(linesOf(anchor, 0.5));
  const { rebase, value, near } = pricing(target, at);
  const zero = value(new Float64Array(SUBSTATS.length));
  const lines = [...anchor].reduce((n, [s, k]) => n + (s === Substat.Er ? 0 : k), 0);
  const per = (value(at) - zero) / lines, erUnit = rollAt(Substat.Er, 0.5);
  const score = (d: number, er: number): number => (d - zero) / per + erWeight * Math.min(er, need) / erUnit
    + (er >= need - 1e-9 ? erBonus : 0);
  return {
    name,
    rebase,
    progress: (t) => score(value(t), t[Substat.Er]!),
    near: (t, optimistic = false) => {
      const moved = near(t, optimistic), er = t[Substat.Er]!;
      return (s, v) => score(moved(s, v), s === Substat.Er ? er + v : er);
    },
    done: () => false,
  };
}

/** A seeded uniform [0, 1) — mulberry32, so a run can be replayed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Each substat's values and the chance of each — what a line draws from. */
const SPREADS = SUBSTATS.map((s) => {
  const { values, weights } = rollSpread(s);
  const total = weights.reduce((a, b) => a + b, 0);
  return { values, chances: weights.map((w) => w / total) };
});

/** `mask` is the substats the echo carries, a bit apiece. */
interface Echo { id: number; cost: number; lines: Line[]; mask: number; totals: Float64Array }

/** What one finished tuning run took. */
export interface Tuned {
  rolls: number;
  spent: number;
  refund: number;
  /** Tuners spent less what trashing the leftovers handed back. */
  net: number;
  /** Echoes rolled on at all, and how many of them were trashed at the end. */
  echoes: number;
  trashed: number;
  /** The finished setup's substat totals, indexed by `Substat`. */
  subs: number[];
  /** The finished setup's lines, echo by echo. */
  lines: Line[];
}

/** The setup's costs, slot by slot. */
const SLOTS = [4, 3, 3, 1, 1];

/** How the next roll is picked (see `tuner`). */
export type Strategy = "greedy" | "prune" | "index" | "index-all";

/** A new line for an echo carrying `mask` (`n` lines): any substat it lacks, each as likely as the
 *  next, its value off Kuro's weights. */
function drawLine(mask: number, n: number, draw: () => number): [Substat, number] {
  let k = Math.floor(draw() * (SUBSTATS.length - n)), s = 0;
  for (; ; s++) {
    if (mask & (1 << s)) continue;
    if (k-- === 0) break;
  }
  const { values, chances } = SPREADS[s]!;
  let r = draw();
  for (let i = 0; i < values.length; i++) {
    if ((r -= chances[i]!) < 0) return [s, values[i]!];
  }
  return [s, values[values.length - 1]!];
}

/**
 * Tune until `goal` stands, yielding after every roll. Each roll goes to one echo, a fresh one or
 * one already rolled on but short of five lines, standing in for the weakest echo of its cost in
 * the setup (the one whose loss costs the least progress, an empty slot first) where it isn't in the
 * setup itself; it moves in once it beats that echo. At the end every echo outside the setup is
 * trashed for 3 tuners a line. How the echo is picked:
 *
 * - `greedy`: the setup's weakest echo picks the cost, and the echo of that cost whose next line is
 *   expected to leave the setup furthest along is rolled.
 * - `prune`: `greedy`, trashing an echo out of the setup once even its best possible lines couldn't
 *   beat the echo it stands in for, or a fresh one scores higher.
 * - `index`: `prune`'s candidates, rolled by what finishing the echo is expected to add to the setup
 *   (nothing where it comes out worse — it just isn't worn) per roll it has left.
 * - `index-all`: `index` over every cost, not only the weakest echo's.
 */
export function* tuner(goal: Objective, random: () => number, strategy: Strategy = "greedy", budget = Infinity,
  log?: (line: string) => void): Generator<void, Tuned> {
  // an echo out of the setup that can never be rolled or move in again keeps only its lines, and is
  // trashed for them there and then — the tuners it hands back are `purse`'s to spend
  const owned: Echo[] = [];
  let deadEchoes = 0, deadLines = 0, purse = budget;
  const bury = (e: Echo): void => {
    owned.splice(owned.indexOf(e), 1);
    deadEchoes++;
    deadLines += e.lines.length;
    purse += 3 * e.lines.length;
  };
  const setup: (Echo | null)[] = SLOTS.map(() => null);
  const totals = (): Float64Array => {
    const t = new Float64Array(SUBSTATS.length);
    for (const e of setup) {
      if (!e) continue;
      for (let s = 0; s < t.length; s++) t[s] = t[s]! + e.totals[s]!;
    }
    return t;
  };
  /** `t` with `e` taken out and `put` (if any) in its place. */
  const swap = (t: Float64Array, e: Echo | null, put: Echo | null = null): Float64Array => {
    const out = t.slice();
    for (let s = 0; s < t.length; s++) out[s] = out[s]! - (e?.totals[s] ?? 0) + (put?.totals[s] ?? 0);
    return out;
  };
  /** What one more line on the echo in `placed` is expected to leave the setup at, `mask` (`n`
   *  lines) what it carries; `floor` counts any outcome under it as `floor` instead. */
  const nextLine = (mask: number, n: number, placed: Float64Array, floor = -Infinity): number => {
    const at = goal.near(placed);
    let expect = 0;
    for (let s = 0; s < placed.length; s++) {
      if (mask & (1 << s)) continue;
      const { values, chances } = SPREADS[s]!;
      for (let i = 0; i < values.length; i++) expect += Math.max(floor, at(s, values[i]!)) * chances[i]!;
    }
    return expect / (SUBSTATS.length - n);
  };
  /** The most the echo in `placed` could leave the setup at, every line it has left at its best. */
  const ceiling = (e: Echo, placed: Float64Array): number => {
    let mask = e.mask, best = goal.progress(placed);
    for (let n = e.lines.length; n < 5; n++) {
      // a bound: the real damage is left out, which only ever reads higher
      const near = goal.near(placed, true);
      let top = -Infinity, at = 0, by = 0;
      for (let s = 0; s < placed.length; s++) {
        if (mask & (1 << s)) continue;
        const { values } = SPREADS[s]!;
        const p = near(s, values[values.length - 1]!);
        if (p > top) {
          top = p;
          at = s;
          by = values[values.length - 1]!;
        }
      }
      placed[at] = placed[at]! + by;
      mask |= 1 << at;
      best = top;
    }
    return best;
  };
  /**
   * What finishing the echo in `placed` is expected to add over `now`, per roll it has left: every
   * way its remaining lines can land, weighted by its chance — which substats (any set of the ones
   * it lacks as likely as the next) and at what values (Kuro's weights). Exact for the last line;
   * past that each line is priced on its own against `placed` and the lines' gains are summed, on a
   * grid of 64 steps.
   */
  // `worth`'s scratch, kept across calls: each open substat's gain per value, which substats gain
  // anything and their best, the grid, and how far up each row of it is filled
  const gains = new Float64Array(SUBSTATS.length * 8);
  const useful = new Int32Array(SUBSTATS.length);
  const tops = new Float64Array(SUBSTATS.length);
  const bins = new Int32Array(8);
  const width = 65;
  const ways = new Float64Array(6 * width);
  const reach = new Int32Array(6);
  const choose = (n: number, k: number): number => {
    let c = 1;
    for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1);
    return c;
  };
  const worth = (e: Echo, placed: Float64Array, now: number): number => {
    const left = 5 - e.lines.length;
    if (left === 1) return nextLine(e.mask, e.lines.length, placed, now) - now;
    const base = goal.progress(placed);
    // each open substat's gains, and how many open substats gain nothing at all
    let idle = 0, open = 0, count = 0;
    const near = goal.near(placed);
    for (let s = 0; s < placed.length; s++) {
      if (e.mask & (1 << s)) continue;
      open++;
      const { values } = SPREADS[s]!;
      let top = 0;
      for (let i = 0; i < values.length; i++) {
        const g = near(s, values[i]!) - base;
        gains[s * 8 + i] = g;
        if (g > top) top = g;
      }
      if (top > 0) {
        useful[count] = s;
        tops[count++] = top;
      } else idle++;
    }
    const best = tops.subarray(0, count).sort();
    let most = 0;
    for (let k = Math.max(0, count - left); k < count; k++) most += best[k]!;
    if (most <= 0) return Math.max(0, base - now) / left;
    const step = most / (width - 1);
    // ways[j * width + b]: j of the substats seen so far drawn, their gains summing to b steps
    ways.fill(0, 0, (left + 1) * width);
    reach.fill(-1, 0, left + 1);
    ways[0] = 1;
    reach[0] = 0;
    for (let u = 0; u < count; u++) {
      const s = useful[u]!;
      const { values, chances } = SPREADS[s]!;
      let far = 0;
      for (let i = 0; i < values.length; i++) {
        bins[i] = Math.round(gains[s * 8 + i]! / step);
        if (bins[i]! > far) far = bins[i]!;
      }
      for (let j = Math.min(left, u + 1); j >= 1; j--) {
        const from = (j - 1) * width, to = j * width, upTo = reach[j - 1]!;
        for (let b = 0; b <= upTo; b++) {
          const w = ways[from + b]!;
          if (!w) continue;
          for (let i = 0; i < values.length; i++) {
            const at = to + Math.min(width - 1, b + bins[i]!);
            ways[at] = ways[at]! + w * chances[i]!;
          }
        }
        if (upTo >= 0) reach[j] = Math.max(reach[j]!, Math.min(width - 1, upTo + far));
      }
    }
    // the lines not drawn from the substats that gain are drawn from the idle ones
    let expect = 0;
    for (let j = 0; j <= left; j++) {
      const rest = choose(idle, left - j);
      if (!rest) continue;
      for (let b = 0; b <= reach[j]!; b++) expect += ways[j * width + b]! * rest * Math.max(0, base + b * step - now);
    }
    return expect / choose(open, left) / left;
  };

  // every score is read off the setup, so each is kept until the setup changes (`version`): the
  // weakest slot of each cost, a fresh echo's score per cost, and each echo's own until it's rolled
  let rolls = 0, echoes = 0, version = 0, seen = -1;
  let t = totals(), now = 0;
  let weakest = new Map<number, number>(), costs: number[] = [];
  const fresh = new Map<number, number>();
  const scored = new Map<Echo, number>();
  const score = (e: Echo): number => {
    const placed = setup.includes(e) ? t.slice() : swap(t, setup[weakest.get(e.cost)!]!, e);
    if (strategy === "greedy" || strategy === "prune") return nextLine(e.mask, e.lines.length, placed) - now;
    return worth(e, placed, now);
  };
  for (;;) {
    if (seen !== version) {
      t = totals();
      if (goal.done(t)) break;
      goal.rebase?.(t);
      now = goal.progress(t);
      weakest = new Map();
      const loss = setup.map((e) => (e ? now - goal.progress(swap(t, e)) : -1));
      setup.forEach((e, i) => {
        const w = weakest.get(SLOTS[i]!);
        const was = w === undefined ? null : setup[w]!;
        const fewer = loss[i] === loss[w ?? -1] && e && e.lines.length < (was?.lines.length ?? 0);
        if (w === undefined || loss[i]! < loss[w]! || fewer) weakest.set(SLOTS[i]!, i);
      });
      costs = [...weakest.keys()];
      if (strategy !== "index-all") {
        const all = [...weakest.values()].reduce((a, b) => (loss[b]! < loss[a]! ? b : a));
        costs = [SLOTS[all]!];
      }
      fresh.clear();
      for (const cost of costs) fresh.set(cost, score({ id: -1, cost, lines: [], mask: 0, totals: new Float64Array(SUBSTATS.length) }));
      scored.clear();
      seen = version;
    }
    let pick: Echo | null = null, pickCost = 0, gain = -Infinity;
    const consider = (e: Echo | null, cost: number, g: number): void => {
      // ties go to the echo rolled on earliest, a fresh one (null) last
      if (g > gain + 1e-12 || (g >= gain - 1e-12 && e !== null && (pick === null || e.id < pick.id))) {
        gain = g;
        pick = e;
        pickCost = cost;
      }
    };
    for (const e of [...owned]) {
      if (!costs.includes(e.cost) || e.lines.length >= 5) continue;
      let g = scored.get(e);
      if (g === undefined) {
        const out = !setup.includes(e);
        // past greedy, an echo out of the setup is trashed once it can't beat the echo it stands
        // in for even at its best, or a fresh one would do better
        if (out && strategy !== "greedy" && ceiling(e, swap(t, setup[weakest.get(e.cost)!]!, e)) <= now + 1e-12) {
          bury(e);
          continue;
        }
        g = score(e);
        if (out && strategy !== "greedy" && g < fresh.get(e.cost)! - 1e-12) {
          bury(e);
          continue;
        }
        scored.set(e, g);
      }
      consider(e, e.cost, g);
    }
    for (const [cost, g] of fresh) consider(null, cost, g);
    // out of tuners: every echo out of the setup goes for its refund, and the run ends where that
    // still can't pay for a roll
    if (purse < 10) {
      for (const x of owned.filter((x) => !setup.includes(x))) bury(x);
      if (purse < 10) break;
      // the pick may have been one of them
      continue;
    }
    let e = pick as Echo | null;
    if (!e) {
      e = { id: echoes++, cost: pickCost, lines: [], mask: 0, totals: new Float64Array(SUBSTATS.length) };
      owned.push(e);
    }
    const [s, v] = drawLine(e.mask, e.lines.length, random);
    e.lines.push([s, v]);
    e.mask |= 1 << s;
    e.totals[s] = e.totals[s]! + v;
    rolls++;
    purse -= 10;
    scored.delete(e);
    const slot = weakest.get(e.cost)!;
    const inSetup = setup.includes(e);
    let moved = false;
    if (inSetup) version++;
    else if (!setup[slot] || goal.progress(swap(t, setup[slot]!, e)) > now) {
      const out = setup[slot];
      setup[slot] = e;
      moved = true;
      version++;
      if (out && out.lines.length === 5) bury(out);
    } else if (e.lines.length === 5) bury(e);
    log?.(`#${rolls} slot ${slot} (${e.cost}c) echo ${e.id}${inSetup ? " [in setup]" : ""} gain ${gain.toFixed(3)} `
      + `+${rollSpread(s).label} ${v} -> [${e.lines.map(([x, y]) => `${rollSpread(x).label} ${y}`).join(", ")}]`
      + `${moved ? " MOVED IN" : ""}; progress ${goal.progress(totals()).toFixed(2)}`);
    yield;
  }
  const left = owned.filter((e) => !setup.includes(e));
  const spent = rolls * 10, refund = 3 * (deadLines + left.reduce((n, e) => n + e.lines.length, 0));
  return {
    rolls, spent, refund, net: spent - refund, echoes, trashed: deadEchoes + left.length,
    subs: Array.from(totals()), lines: setup.flatMap((e) => e?.lines ?? []),
  };
}

/** Tuning runs advanced side by side, one roll each per round, run `i` seeded off `seed` and `i`. */
export class Batch {
  /** Every run still going has made this many rolls. */
  round = 0;
  /** The runs finished since the last `take()`. */
  private done: Tuned[] = [];
  private live: Generator<void, Tuned>[];

  constructor(goal: Objective, strategy: Strategy, seed: number, from: number, count: number, budget = Infinity) {
    this.live = Array.from({ length: count }, (_, i) => tuner(goal, rng(seed * 1000003 + from + i), strategy, budget));
  }

  get running(): number {
    return this.live.length;
  }

  /** `n` more rounds, or until every run is done. */
  step(n: number): void {
    for (let k = 0; k < n && this.live.length; k++) {
      const next: Generator<void, Tuned>[] = [];
      for (const g of this.live) {
        const step = g.next();
        if (step.done) this.done.push(step.value);
        else next.push(g);
      }
      this.live = next;
      // a run that finished this round made no roll in it
      if (next.length) this.round++;
    }
  }

  take(): Tuned[] {
    return this.done.splice(0);
  }
}

/** Each figure's median over every run. */
export type Median = Omit<Tuned, "rolls" | "lines">;
type Figure = Exclude<keyof Median, "subs">;

/**
 * The medians of `runs` runs, `done` the finished ones and the rest still going after at least
 * `round` rolls — or null while the median net could still move: a run still going after R rolls
 * ends above 7R net (10 a roll, at most 3 of it refunded), so once the middle finished run's net is
 * under that, nothing still going can come in below it. Tuners spent settle with it. Echoes,
 * trashed and refund are their middle finished run's figure with the runs still going counted
 * above it — they grow with rolls, though not strictly. `subs` is the finished runs' average setup,
 * so it leans to the luckier half.
 */
export function mediansOf(done: readonly Tuned[], runs: number, round: number, running: number): Median | null {
  const mid = Math.floor(runs / 2);
  if (done.length <= mid) return null;
  const at = (k: Figure): number => done.map((r) => r[k]).sort((a, b) => a - b)[mid]!;
  if (running && at("net") > 7 * round) return null;
  const subs = SUBSTATS.map((s) => done.reduce((n, r) => n + r.subs[s]!, 0) / done.length);
  return { spent: at("spent"), refund: at("refund"), net: at("net"), echoes: at("echoes"), trashed: at("trashed"), subs };
}
