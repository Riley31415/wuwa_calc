/**
 * The account packing behind the Value page: pick teams out of what an account owns so the sum of
 * their weights is as large as it goes, no resonator's vigor overspent, and what each resonator is
 * worth to that sum — for one owned, what the account loses without them; for one not, what it
 * gains with them. DOM-free, no engine.
 *
 * A vigor group is the unit that is spent: usually one resonator with 1 vigor, but a resonator
 * with 2 may stand in two teams, and several resonators (the Rover forms) may share one group.
 * A team takes one vigor from the group of each member; a team is used at most once.
 *
 * Exact. A branch-and-bound whose bound is the LP relaxation (one row per group, one column per
 * team), which for packing is near-integral, so the tree stays tiny. Two things keep 49 questions
 * cheap: an owned resonator off the optimal packing is worth nothing and is never searched, and
 * the owned account's LP prices cap every question without a second LP (dropping a resonator keeps
 * them feasible; adding one needs only its own price raised) and fix away every team whose reduced
 * cost exceeds the gap.
 */

export interface PackTeam {
  /** Resonator ids; a team that names two of one group spends two of its vigor. */
  members: readonly number[];
  /** Whole numbers: the search prunes on the integrality of totals. */
  weight: number;
}

export interface AccountGains {
  /** The best total over what the account owns. */
  total: number;
  /** Indices into the input of the teams that reach it. */
  chosen: number[];
  /** Per resonator: owned, what `total` loses without them (0 off the packing); not, what it gains with them. */
  gains: number[];
  /** Per resonator: the index of the team they stand in — the one the account fields them in, or the one that earns what adding them gains (the higher DPR one of two) — else -1. */
  via: number[];
  /** LP solves spent, for measuring. */
  lps: number;
}

/** A total can only improve by a whole number, so a bound within this of the incumbent is a tie. */
const TIE = 0.5;
const EPS = 1e-9;

interface Lp {
  value: number;
  x: Float64Array;
  /** Dual price per row, in the weights' own units. */
  y: Float64Array;
  /** Per column, what forcing it into the packing costs the bound at least (0 for one in the basis). */
  cost: Float64Array;
}

/** max w.x over columns, each row `r` summing coef * x to at most `rhs[r]`, x >= 0. */
function simplex(weight: number[], rowsOf: number[][], coefOf: number[][], rhs: number[], scale: number): Lp {
  const m = rhs.length;
  const k = weight.length;
  const width = k + m + 1;
  const t = new Float64Array((m + 1) * width);
  for (let j = 0; j < k; j++) {
    const rows = rowsOf[j]!;
    const coef = coefOf[j]!;
    for (let e = 0; e < rows.length; e++) t[rows[e]! * width + j] = coef[e]!;
    t[m * width + j] = -weight[j]! / scale;
  }
  const basis = new Int32Array(m);
  const live = new Int32Array(width);
  for (let i = 0; i < m; i++) {
    t[i * width + k + i] = 1;
    t[i * width + width - 1] = rhs[i]!;
    basis[i] = k + i;
  }
  let stalled = 0;
  for (;;) {
    // Dantzig's rule, falling back to Bland's once degenerate pivots pile up (packing is very degenerate)
    let enter = -1;
    let most = -EPS;
    for (let j = 0; j < k + m; j++) {
      const c = t[m * width + j]!;
      if (c >= -EPS) continue;
      if (stalled > 40) {
        enter = j;
        break;
      }
      if (c < most) {
        most = c;
        enter = j;
      }
    }
    if (enter < 0) break;
    let leave = -1;
    let ratio = Infinity;
    for (let i = 0; i < m; i++) {
      const a = t[i * width + enter]!;
      if (a <= EPS) continue;
      const r = t[i * width + width - 1]! / a;
      if (r < ratio - 1e-12 || (r < ratio + 1e-12 && basis[i]! < basis[leave]!)) {
        ratio = r;
        leave = i;
      }
    }
    if (leave < 0) throw new Error("packing LP is unbounded");
    stalled = ratio < 1e-12 ? stalled + 1 : 0;
    // the pivot row stays sparse in a packing LP: eliminate along its nonzeros alone
    const p = t[leave * width + enter]!;
    let nz = 0;
    for (let c = 0; c < width; c++) {
      const v = t[leave * width + c]!;
      if (v === 0) continue;
      t[leave * width + c] = v / p;
      live[nz++] = c;
    }
    for (let i = 0; i <= m; i++) {
      if (i === leave) continue;
      const f = t[i * width + enter]!;
      if (f === 0) continue;
      for (let q = 0; q < nz; q++) {
        const c = live[q]!;
        t[i * width + c] = t[i * width + c]! - f * t[leave * width + c]!;
      }
    }
    basis[leave] = enter;
  }
  const x = new Float64Array(k);
  for (let i = 0; i < m; i++) if (basis[i]! < k) x[basis[i]!] = t[i * width + width - 1]!;
  const y = new Float64Array(m);
  for (let i = 0; i < m; i++) y[i] = t[m * width + k + i]! * scale;
  const cost = new Float64Array(k);
  for (let j = 0; j < k; j++) cost[j] = t[m * width + j]! * scale;
  return { value: t[m * width + width - 1]! * scale, x, y, cost };
}

/** The packing search over one account; `solve` can be asked again with a resonator left out or added. */
class Packer {
  /** Per team, the distinct groups it draws on and how many vigor it takes from each. */
  readonly groups: number[][];
  readonly counts: number[][];
  /** Per group, the teams drawing on it. */
  readonly lookup: number[][];
  readonly scale: number;
  readonly used: Int32Array;
  readonly dead: Uint8Array;
  /** Who the account does not own. */
  readonly base: Uint8Array;
  readonly banned: Uint8Array;
  /** `seed`'s scratch: the teams it has taken so far. */
  private readonly inSeed: Uint8Array;
  readonly byWeight: number[];
  lps = 0;
  /** The first LP of the last unrestricted solve: its objective and duals, per group and per team. */
  rootValue = 0;
  rootPrice: Float64Array;
  rootUpper: Float64Array;

  private best = 0;
  private bestSet: number[] = [];
  /** Every packing an earlier solve ended on: the removals' answers resemble one another, so each
   *  starts from the best of them that still stands. */
  private readonly known: number[][] = [];
  private ceiling = Infinity;
  private readonly picked: number[] = [];

  constructor(readonly teams: PackTeam[], readonly groupOf: readonly number[], readonly capacity: readonly number[], owned: readonly boolean[]) {
    this.groups = teams.map((team) => [...new Set(team.members.map((v) => groupOf[v]!))]);
    this.counts = teams.map((team, i) => this.groups[i]!.map((g) => team.members.filter((v) => groupOf[v] === g).length));
    this.lookup = capacity.map(() => []);
    this.groups.forEach((groups, i) => {
      for (const g of groups) this.lookup[g]!.push(i);
    });
    this.scale = Math.max(1, ...teams.map((team) => team.weight));
    this.used = new Int32Array(capacity.length);
    this.dead = new Uint8Array(groupOf.length);
    this.base = Uint8Array.from(owned, (o) => (o ? 0 : 1));
    this.banned = new Uint8Array(teams.length);
    this.inSeed = new Uint8Array(teams.length);
    this.byWeight = teams.map((_, i) => i).sort((a, b) => teams[b]!.weight - teams[a]!.weight);
    this.rootPrice = new Float64Array(capacity.length);
    this.rootUpper = new Float64Array(teams.length);
  }

  /** Whether team `i` can still be added: not barred, nobody dead, every group has vigor for it. */
  private live(i: number, used: Int32Array = this.used): boolean {
    if (this.banned[i]) return false;
    for (const v of this.teams[i]!.members) if (this.dead[v]) return false;
    const groups = this.groups[i]!;
    const counts = this.counts[i]!;
    for (let k = 0; k < groups.length; k++) if (used[groups[k]!]! + counts[k]! > this.capacity[groups[k]!]!) return false;
    return true;
  }

  private take(i: number, sign: number): void {
    const groups = this.groups[i]!;
    const counts = this.counts[i]!;
    for (let k = 0; k < groups.length; k++) this.used[groups[k]!] = this.used[groups[k]!]! + sign * counts[k]!;
  }

  /** A packing greedily built from `start`'s teams (each still standing) then the heaviest that fit. */
  private seed(start: number[]): { weight: number; set: number[] } {
    const used = new Int32Array(this.used);
    const set: number[] = [];
    let weight = 0;
    const take = (i: number): void => {
      if (this.inSeed[i] || !this.live(i, used)) return;
      const groups = this.groups[i]!;
      const counts = this.counts[i]!;
      for (let k = 0; k < groups.length; k++) used[groups[k]!] = used[groups[k]!]! + counts[k]!;
      this.inSeed[i] = 1;
      set.push(i);
      weight += this.teams[i]!.weight;
    };
    for (const i of start) take(i);
    for (const i of this.byWeight) take(i);
    for (const i of set) this.inSeed[i] = 0;
    return { weight, set };
  }

  /**
   * `seed`, then bettered by moves that bring one team in, keep what still fits beside it, and refill —
   * until none gains. A move worth making draws on vigor the packing leaves unspent, so only teams
   * touching such a group are tried. The search proves far faster from a packing that is already best.
   */
  private improve(start: number[]): { weight: number; set: number[] } {
    let cur = this.seed(start);
    for (let gained = true; gained;) {
      gained = false;
      const used = new Int32Array(this.used);
      for (const i of cur.set) this.groups[i]!.forEach((g, k) => (used[g] = used[g]! + this.counts[i]![k]!));
      for (const t of this.byWeight) {
        if (cur.set.includes(t) || !this.live(t) || !this.groups[t]!.some((g) => used[g]! < this.capacity[g]!)) continue;
        const next = this.seed([t, ...cur.set]);
        if (next.weight <= cur.weight) continue;
        cur = next;
        gained = true;
        break;
      }
    }
    return cur;
  }

  /** The dual bound over the teams still standing, from `price` (any feasible dual will do). */
  private priced(price: Float64Array): number {
    let bound = 0;
    for (let g = 0; g < this.capacity.length; g++) {
      if (this.lookup[g]!.some((i) => this.live(i))) bound += this.capacity[g]! * price[g]!;
    }
    for (let i = 0; i < this.teams.length; i++) if (this.live(i)) bound += this.rootUpper[i]!;
    return bound;
  }

  /** What forcing team `i` in costs the bound `price` gives, at least. */
  private reduced(i: number, price: Float64Array): number {
    const groups = this.groups[i]!;
    const counts = this.counts[i]!;
    let cost = this.rootUpper[i]! - this.teams[i]!.weight;
    for (let k = 0; k < groups.length; k++) cost += counts[k]! * price[groups[k]!]!;
    return cost;
  }

  /** The root prices with `add`'s own group raised until every team it opens is priced in. */
  private raised(add: number): Float64Array {
    const price = Float64Array.from(this.rootPrice);
    const g = this.groupOf[add]!;
    let more = 0;
    for (const i of this.lookup[g]!) {
      if (!this.live(i) || !this.teams[i]!.members.includes(add)) continue;
      const own = this.counts[i]![this.groups[i]!.indexOf(g)]!;
      more = Math.max(more, -this.reduced(i, price) / own);
    }
    price[g] = price[g]! + more;
    return price;
  }

  /**
   * The best packing of the account with `remove` taken out and `add` brought in (-1 for neither),
   * started from `floorSet` (teams already in hand, topped up greedily) and stopped the moment it
   * reaches `ceiling` or the dual cap. With neither it is the account itself, and sets the prices.
   */
  solve(remove: number, add: number, floorSet: number[], ceiling: number): { weight: number; set: number[] } {
    this.used.fill(0);
    this.dead.set(this.base);
    if (remove >= 0) this.dead[remove] = 1;
    if (add >= 0) this.dead[add] = 0;
    const asked = remove >= 0 || add >= 0;
    const seeded = asked
      ? this.improve([floorSet, ...this.known].map((set) => this.seed(set)).reduce((a, b) => (b.weight > a.weight ? b : a)).set)
      : this.seed(floorSet);
    this.best = seeded.weight;
    this.bestSet = seeded.set;
    // someone added who opens no team changes nothing
    if (add >= 0 && !this.lookup[this.groupOf[add]!]!.some((i) => this.teams[i]!.members.includes(add) && this.live(i))) return seeded;
    // the prices stay feasible with teams dropped, and with one more resonator once its own is raised
    const price = add >= 0 ? this.raised(add) : this.rootPrice;
    const cap = asked ? this.priced(price) : Infinity;
    this.ceiling = Math.min(ceiling, cap);
    const barred: number[] = [];
    if (asked && this.best < this.ceiling - TIE) {
      // the same prices price every team: one that costs more than the gap can't be in a better packing
      for (let i = 0; i < this.teams.length; i++) {
        if (!this.live(i) || cap - this.reduced(i, price) > this.best + TIE) continue;
        this.banned[i] = 1;
        barred.push(i);
      }
    }
    if (this.best < this.ceiling - TIE) this.branch(0, !asked);
    for (const i of barred) this.banned[i] = 0;
    this.known.push(this.bestSet);
    return { weight: this.best, set: this.bestSet };
  }

  private done(): boolean {
    return this.best >= this.ceiling - TIE;
  }

  /** A team that could be taken twice by the vigor left: its LP column needs an x <= 1 row. */
  private repeatable(i: number): boolean {
    const groups = this.groups[i]!;
    const counts = this.counts[i]!;
    for (let k = 0; k < groups.length; k++) {
      if (this.capacity[groups[k]!]! - this.used[groups[k]!]! < 2 * counts[k]!) return false;
    }
    return true;
  }

  private branch(weight: number, root: boolean): void {
    if (this.done()) return;
    const cols: number[] = [];
    for (let i = 0; i < this.teams.length; i++) if (this.live(i)) cols.push(i);
    const rowOf = new Int32Array(this.capacity.length).fill(-1);
    const rhs: number[] = [];
    for (const i of cols) {
      for (const g of this.groups[i]!) {
        if (rowOf[g]! >= 0) continue;
        rowOf[g] = rhs.length;
        rhs.push(this.capacity[g]! - this.used[g]!);
      }
    }
    const rowsOf: number[][] = [];
    const coefOf: number[][] = [];
    const upperRow: number[] = [];
    for (const i of cols) {
      const rows = this.groups[i]!.map((g) => rowOf[g]!);
      const coef = [...this.counts[i]!];
      if (this.repeatable(i)) {
        upperRow.push(rhs.length);
        rows.push(rhs.length);
        coef.push(1);
        rhs.push(1);
      } else upperRow.push(-1);
      rowsOf.push(rows);
      coefOf.push(coef);
    }
    if (!cols.length) {
      this.record(weight, this.picked);
      return;
    }
    const lp = simplex(cols.map((i) => this.teams[i]!.weight), rowsOf, coefOf, rhs, this.scale);
    this.lps++;
    if (root) {
      this.rootValue = lp.value;
      this.rootPrice.fill(0);
      this.rootUpper.fill(0);
      rowOf.forEach((r, g) => {
        if (r >= 0) this.rootPrice[g] = lp.y[r]!;
      });
      cols.forEach((i, j) => {
        if (upperRow[j]! >= 0) this.rootUpper[i] = lp.y[upperRow[j]!]!;
      });
    }
    if (weight + lp.value <= this.best + TIE) return;
    // a column costing more than the gap is out for this whole subtree: the LP value doesn't move
    const barred: number[] = [];
    for (let j = 0; j < cols.length; j++) {
      if (weight + lp.value - lp.cost[j]! > this.best + TIE) continue;
      this.banned[cols[j]!] = 1;
      barred.push(cols[j]!);
    }
    this.descend(weight, cols, lp);
    for (const i of barred) this.banned[i] = 0;
  }

  private descend(weight: number, cols: number[], lp: Lp): void {
    // branch on the largest fractional column; an integral one is the node's own optimum
    let pick = -1;
    let most = 0;
    for (let j = 0; j < cols.length; j++) {
      const x = lp.x[j]!;
      if (x > 1e-6 && x < 1 - 1e-6 && x > most) {
        most = x;
        pick = j;
      }
    }
    if (pick < 0) {
      const set = [...this.picked];
      let w = weight;
      cols.forEach((i, j) => {
        if (lp.x[j]! > 0.5) {
          set.push(i);
          w += this.teams[i]!.weight;
        }
      });
      this.record(w, set);
      return;
    }
    const i = cols[pick]!;
    this.take(i, 1);
    this.picked.push(i);
    this.branch(weight + this.teams[i]!.weight, false);
    this.picked.pop();
    this.take(i, -1);
    if (this.done()) return;
    this.banned[i] = 1;
    this.branch(weight, false);
    this.banned[i] = 0;
  }

  private record(weight: number, set: number[]): void {
    if (weight <= this.best) return;
    this.best = weight;
    this.bestSet = [...set];
  }
}

/**
 * The best total over what `owned` holds of `teams`, and what each resonator (0..groupOf.length-1)
 * is worth to it. `groupOf` names the vigor group of each resonator and `capacity` how many teams
 * a group may stand in.
 */
export function accountGains(teams: PackTeam[], groupOf: readonly number[], capacity: readonly number[], owned: readonly boolean[]): AccountGains {
  const packer = new Packer(teams, groupOf, capacity, owned);
  const root = packer.solve(-1, -1, [], Infinity);
  const gains = new Array<number>(groupOf.length).fill(0);
  const via = new Array<number>(groupOf.length).fill(-1);
  const stands = (set: number[], v: number): number =>
    set.filter((i) => teams[i]!.members.includes(v)).sort((a, b) => teams[b]!.weight - teams[a]!.weight)[0] ?? -1;
  const fielded = new Set(root.set.flatMap((i) => teams[i]!.members));
  for (let v = 0; v < groupOf.length; v++) {
    if (owned[v]) {
      if (!fielded.has(v)) continue;
      // every team they stand in is dropped; the rest of the packing is the starting point
      const rest = root.set.filter((i) => !teams[i]!.members.includes(v));
      gains[v] = root.weight - packer.solve(v, -1, rest, root.weight).weight;
      via[v] = stands(root.set, v);
      continue;
    }
    const added = packer.solve(-1, v, root.set, Infinity);
    gains[v] = added.weight - root.weight;
    via[v] = gains[v]! > 0 ? stands(added.set, v) : -1;
  }
  return { total: root.weight, chosen: root.set, gains, via, lps: packer.lps };
}
