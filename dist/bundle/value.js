import {
  TWO_VIGOR,
  clearBuilds,
  dprOf,
  drawPage,
  esc,
  isRover,
  labelIn,
  openHelp,
  pageOf,
  setBuildFilters,
  wireHelp
} from "./chunk-EPD3HQ3L.js";
import {
  FALLBACK_HUE,
  MATRIX_RESONATORS,
  RESONATOR_HUE,
  TEAMS,
  applyHash,
  bestPicks,
  costBox,
  ensureBestPicks,
  filters,
  fmt,
  loadSolves,
  overlay,
  overlayPhase,
  paint,
  saveSolves,
  showError,
  syncCost
} from "./chunk-RUPMSA6L.js";
import {
  bestKey,
  defaultFilters,
  hasBuild
} from "./chunk-4CKV7HFV.js";

// dist/src/solve/packing.js
var TIE = 0.5;
var EPS = 1e-9;
function simplex(weight, rowsOf, coefOf, rhs, scale) {
  const m = rhs.length;
  const k = weight.length;
  const width = k + m + 1;
  const t = new Float64Array((m + 1) * width);
  for (let j = 0; j < k; j++) {
    const rows2 = rowsOf[j];
    const coef = coefOf[j];
    for (let e = 0; e < rows2.length; e++)
      t[rows2[e] * width + j] = coef[e];
    t[m * width + j] = -weight[j] / scale;
  }
  const basis = new Int32Array(m);
  const live = new Int32Array(width);
  for (let i = 0; i < m; i++) {
    t[i * width + k + i] = 1;
    t[i * width + width - 1] = rhs[i];
    basis[i] = k + i;
  }
  let stalled = 0;
  for (; ; ) {
    let enter = -1;
    let most = -EPS;
    for (let j = 0; j < k + m; j++) {
      const c = t[m * width + j];
      if (c >= -EPS)
        continue;
      if (stalled > 40) {
        enter = j;
        break;
      }
      if (c < most) {
        most = c;
        enter = j;
      }
    }
    if (enter < 0)
      break;
    let leave = -1;
    let ratio = Infinity;
    for (let i = 0; i < m; i++) {
      const a = t[i * width + enter];
      if (a <= EPS)
        continue;
      const r = t[i * width + width - 1] / a;
      if (r < ratio - 1e-12 || r < ratio + 1e-12 && basis[i] < basis[leave]) {
        ratio = r;
        leave = i;
      }
    }
    if (leave < 0)
      throw new Error("packing LP is unbounded");
    stalled = ratio < 1e-12 ? stalled + 1 : 0;
    const p = t[leave * width + enter];
    let nz = 0;
    for (let c = 0; c < width; c++) {
      const v = t[leave * width + c];
      if (v === 0)
        continue;
      t[leave * width + c] = v / p;
      live[nz++] = c;
    }
    for (let i = 0; i <= m; i++) {
      if (i === leave)
        continue;
      const f = t[i * width + enter];
      if (f === 0)
        continue;
      for (let q = 0; q < nz; q++) {
        const c = live[q];
        t[i * width + c] = t[i * width + c] - f * t[leave * width + c];
      }
    }
    basis[leave] = enter;
  }
  const x = new Float64Array(k);
  for (let i = 0; i < m; i++)
    if (basis[i] < k)
      x[basis[i]] = t[i * width + width - 1];
  const y = new Float64Array(m);
  for (let i = 0; i < m; i++)
    y[i] = t[m * width + k + i] * scale;
  const cost = new Float64Array(k);
  for (let j = 0; j < k; j++)
    cost[j] = t[m * width + j] * scale;
  return { value: t[m * width + width - 1] * scale, x, y, cost };
}
var Packer = class {
  teams;
  groupOf;
  capacity;
  /** Per team, the distinct groups it draws on and how many vigor it takes from each. */
  groups;
  counts;
  /** Per group, the teams drawing on it. */
  lookup;
  scale;
  used;
  dead;
  /** Who the account does not own. */
  base;
  banned;
  /** `seed`'s scratch: the teams it has taken so far. */
  inSeed;
  byWeight;
  lps = 0;
  /** The first LP of the last unrestricted solve: its objective and duals, per group and per team. */
  rootValue = 0;
  rootPrice;
  rootUpper;
  best = 0;
  bestSet = [];
  /** Every packing an earlier solve ended on: the removals' answers resemble one another, so each
   *  starts from the best of them that still stands. */
  known = [];
  ceiling = Infinity;
  picked = [];
  constructor(teams, groupOf, capacity, owned2) {
    this.teams = teams;
    this.groupOf = groupOf;
    this.capacity = capacity;
    this.groups = teams.map((team) => [...new Set(team.members.map((v) => groupOf[v]))]);
    this.counts = teams.map((team, i) => this.groups[i].map((g) => team.members.filter((v) => groupOf[v] === g).length));
    this.lookup = capacity.map(() => []);
    this.groups.forEach((groups, i) => {
      for (const g of groups)
        this.lookup[g].push(i);
    });
    this.scale = Math.max(1, ...teams.map((team) => team.weight));
    this.used = new Int32Array(capacity.length);
    this.dead = new Uint8Array(groupOf.length);
    this.base = Uint8Array.from(owned2, (o) => o ? 0 : 1);
    this.banned = new Uint8Array(teams.length);
    this.inSeed = new Uint8Array(teams.length);
    this.byWeight = teams.map((_, i) => i).sort((a, b) => teams[b].weight - teams[a].weight);
    this.rootPrice = new Float64Array(capacity.length);
    this.rootUpper = new Float64Array(teams.length);
  }
  /** Whether team `i` can still be added: not barred, nobody dead, every group has vigor for it. */
  live(i, used = this.used) {
    if (this.banned[i])
      return false;
    for (const v of this.teams[i].members)
      if (this.dead[v])
        return false;
    const groups = this.groups[i];
    const counts = this.counts[i];
    for (let k = 0; k < groups.length; k++)
      if (used[groups[k]] + counts[k] > this.capacity[groups[k]])
        return false;
    return true;
  }
  take(i, sign) {
    const groups = this.groups[i];
    const counts = this.counts[i];
    for (let k = 0; k < groups.length; k++)
      this.used[groups[k]] = this.used[groups[k]] + sign * counts[k];
  }
  /** A packing greedily built from `start`'s teams (each still standing) then the heaviest that fit. */
  seed(start) {
    const used = new Int32Array(this.used);
    const set = [];
    let weight = 0;
    const take = (i) => {
      if (this.inSeed[i] || !this.live(i, used))
        return;
      const groups = this.groups[i];
      const counts = this.counts[i];
      for (let k = 0; k < groups.length; k++)
        used[groups[k]] = used[groups[k]] + counts[k];
      this.inSeed[i] = 1;
      set.push(i);
      weight += this.teams[i].weight;
    };
    for (const i of start)
      take(i);
    for (const i of this.byWeight)
      take(i);
    for (const i of set)
      this.inSeed[i] = 0;
    return { weight, set };
  }
  /**
   * `seed`, then bettered by moves that bring one team in, keep what still fits beside it, and refill —
   * until none gains. A move worth making draws on vigor the packing leaves unspent, so only teams
   * touching such a group are tried. The search proves far faster from a packing that is already best.
   */
  improve(start) {
    let cur = this.seed(start);
    for (let gained = true; gained; ) {
      gained = false;
      const used = new Int32Array(this.used);
      for (const i of cur.set)
        this.groups[i].forEach((g, k) => used[g] = used[g] + this.counts[i][k]);
      for (const t of this.byWeight) {
        if (cur.set.includes(t) || !this.live(t) || !this.groups[t].some((g) => used[g] < this.capacity[g]))
          continue;
        const next = this.seed([t, ...cur.set]);
        if (next.weight <= cur.weight)
          continue;
        cur = next;
        gained = true;
        break;
      }
    }
    return cur;
  }
  /** The dual bound over the teams still standing, from `price` (any feasible dual will do). */
  priced(price) {
    let bound = 0;
    for (let g = 0; g < this.capacity.length; g++) {
      if (this.lookup[g].some((i) => this.live(i)))
        bound += this.capacity[g] * price[g];
    }
    for (let i = 0; i < this.teams.length; i++)
      if (this.live(i))
        bound += this.rootUpper[i];
    return bound;
  }
  /** What forcing team `i` in costs the bound `price` gives, at least. */
  reduced(i, price) {
    const groups = this.groups[i];
    const counts = this.counts[i];
    let cost = this.rootUpper[i] - this.teams[i].weight;
    for (let k = 0; k < groups.length; k++)
      cost += counts[k] * price[groups[k]];
    return cost;
  }
  /** The root prices with `add`'s own group raised until every team it opens is priced in. */
  raised(add) {
    const price = Float64Array.from(this.rootPrice);
    const g = this.groupOf[add];
    let more = 0;
    for (const i of this.lookup[g]) {
      if (!this.live(i) || !this.teams[i].members.includes(add))
        continue;
      const own = this.counts[i][this.groups[i].indexOf(g)];
      more = Math.max(more, -this.reduced(i, price) / own);
    }
    price[g] = price[g] + more;
    return price;
  }
  /**
   * The best packing of the account with `remove` taken out and `add` brought in (-1 for neither),
   * started from `floorSet` (teams already in hand, topped up greedily) and stopped the moment it
   * reaches `ceiling` or the dual cap. With neither it is the account itself, and sets the prices.
   */
  solve(remove, add, floorSet, ceiling) {
    this.used.fill(0);
    this.dead.set(this.base);
    if (remove >= 0)
      this.dead[remove] = 1;
    if (add >= 0)
      this.dead[add] = 0;
    const asked = remove >= 0 || add >= 0;
    const seeded = asked ? this.improve([floorSet, ...this.known].map((set) => this.seed(set)).reduce((a, b) => b.weight > a.weight ? b : a).set) : this.seed(floorSet);
    this.best = seeded.weight;
    this.bestSet = seeded.set;
    if (add >= 0 && !this.lookup[this.groupOf[add]].some((i) => this.teams[i].members.includes(add) && this.live(i)))
      return seeded;
    const price = add >= 0 ? this.raised(add) : this.rootPrice;
    const cap = asked ? this.priced(price) : Infinity;
    this.ceiling = Math.min(ceiling, cap);
    const barred = [];
    if (asked && this.best < this.ceiling - TIE) {
      for (let i = 0; i < this.teams.length; i++) {
        if (!this.live(i) || cap - this.reduced(i, price) > this.best + TIE)
          continue;
        this.banned[i] = 1;
        barred.push(i);
      }
    }
    if (this.best < this.ceiling - TIE)
      this.branch(0, !asked);
    for (const i of barred)
      this.banned[i] = 0;
    this.known.push(this.bestSet);
    return { weight: this.best, set: this.bestSet };
  }
  done() {
    return this.best >= this.ceiling - TIE;
  }
  /** A team that could be taken twice by the vigor left: its LP column needs an x <= 1 row. */
  repeatable(i) {
    const groups = this.groups[i];
    const counts = this.counts[i];
    for (let k = 0; k < groups.length; k++) {
      if (this.capacity[groups[k]] - this.used[groups[k]] < 2 * counts[k])
        return false;
    }
    return true;
  }
  branch(weight, root) {
    if (this.done())
      return;
    const cols = [];
    for (let i = 0; i < this.teams.length; i++)
      if (this.live(i))
        cols.push(i);
    const rowOf = new Int32Array(this.capacity.length).fill(-1);
    const rhs = [];
    for (const i of cols) {
      for (const g of this.groups[i]) {
        if (rowOf[g] >= 0)
          continue;
        rowOf[g] = rhs.length;
        rhs.push(this.capacity[g] - this.used[g]);
      }
    }
    const rowsOf = [];
    const coefOf = [];
    const upperRow = [];
    for (const i of cols) {
      const rows2 = this.groups[i].map((g) => rowOf[g]);
      const coef = [...this.counts[i]];
      if (this.repeatable(i)) {
        upperRow.push(rhs.length);
        rows2.push(rhs.length);
        coef.push(1);
        rhs.push(1);
      } else
        upperRow.push(-1);
      rowsOf.push(rows2);
      coefOf.push(coef);
    }
    if (!cols.length) {
      this.record(weight, this.picked);
      return;
    }
    const lp = simplex(cols.map((i) => this.teams[i].weight), rowsOf, coefOf, rhs, this.scale);
    this.lps++;
    if (root) {
      this.rootValue = lp.value;
      this.rootPrice.fill(0);
      this.rootUpper.fill(0);
      rowOf.forEach((r, g) => {
        if (r >= 0)
          this.rootPrice[g] = lp.y[r];
      });
      cols.forEach((i, j) => {
        if (upperRow[j] >= 0)
          this.rootUpper[i] = lp.y[upperRow[j]];
      });
    }
    if (weight + lp.value <= this.best + TIE)
      return;
    const barred = [];
    for (let j = 0; j < cols.length; j++) {
      if (weight + lp.value - lp.cost[j] > this.best + TIE)
        continue;
      this.banned[cols[j]] = 1;
      barred.push(cols[j]);
    }
    this.descend(weight, cols, lp);
    for (const i of barred)
      this.banned[i] = 0;
  }
  descend(weight, cols, lp) {
    let pick = -1;
    let most = 0;
    for (let j = 0; j < cols.length; j++) {
      const x = lp.x[j];
      if (x > 1e-6 && x < 1 - 1e-6 && x > most) {
        most = x;
        pick = j;
      }
    }
    if (pick < 0) {
      const set = [...this.picked];
      let w = weight;
      cols.forEach((i2, j) => {
        if (lp.x[j] > 0.5) {
          set.push(i2);
          w += this.teams[i2].weight;
        }
      });
      this.record(w, set);
      return;
    }
    const i = cols[pick];
    this.take(i, 1);
    this.picked.push(i);
    this.branch(weight + this.teams[i].weight, false);
    this.picked.pop();
    this.take(i, -1);
    if (this.done())
      return;
    this.banned[i] = 1;
    this.branch(weight, false);
    this.banned[i] = 0;
  }
  record(weight, set) {
    if (weight <= this.best)
      return;
    this.best = weight;
    this.bestSet = [...set];
  }
};
function accountGains(teams, groupOf, capacity, owned2) {
  const packer = new Packer(teams, groupOf, capacity, owned2);
  const root = packer.solve(-1, -1, [], Infinity);
  const gains = new Array(groupOf.length).fill(0);
  const via = new Array(groupOf.length).fill(-1);
  const stands = (set, v) => set.filter((i) => teams[i].members.includes(v)).sort((a, b) => teams[b].weight - teams[a].weight)[0] ?? -1;
  const fielded = new Set(root.set.flatMap((i) => teams[i].members));
  for (let v = 0; v < groupOf.length; v++) {
    if (owned2[v]) {
      if (!fielded.has(v))
        continue;
      const rest = root.set.filter((i) => !teams[i].members.includes(v));
      gains[v] = root.weight - packer.solve(v, -1, rest, root.weight).weight;
      via[v] = stands(root.set, v);
      continue;
    }
    const added = packer.solve(-1, v, root.set, Infinity);
    gains[v] = added.weight - root.weight;
    via[v] = gains[v] > 0 ? stands(added.set, v) : -1;
  }
  return { total: root.weight, chosen: root.set, gains, via, lps: packer.lps };
}

// dist/src/page/value.js
var app = document.getElementById("app");
var DEFAULT_OWNED = () => /* @__PURE__ */ new Set([...world.free, "Verina"]);
var OWNED_KEY = "wuwa.owned.v1";
function valueFilters() {
  return { ...defaultFilters(), cost: filters.cost, matrix: [...MATRIX_RESONATORS] };
}
var MATRIX_ROUNDS = [
  { hp: 5612519, last: 6173771, perPoint: 1200 },
  { hp: 9541515, last: 12756094, perPoint: 1056 },
  { hp: 19388952, last: 31503760, perPoint: 963 }
];
var MATRIX_DAMAGE = 4 * 1.2;
function matrixScore(damage) {
  let points = 0;
  for (let round = 0; damage > 0; round++) {
    const { hp, last, perPoint } = MATRIX_ROUNDS[Math.min(round, MATRIX_ROUNDS.length - 1)];
    for (let boss = 0; boss < 5 && damage > 0; boss++) {
      const full = boss === 4 ? last : hp;
      const dealt = Math.min(damage, full);
      points += dealt / perPoint;
      damage -= dealt;
      if (dealt === full && boss === 4)
        points += 1e3;
    }
  }
  return Math.floor(points);
}
var world;
var owned = /* @__PURE__ */ new Set();
var rows = [];
var total = 0;
var scoreMode = true;
var scoreOf = (dpr) => matrixScore(dpr * MATRIX_DAMAGE);
var shownGain = (r) => !scoreMode ? r.gain : r.owned ? scoreOf(total) - scoreOf(total - r.gain) : scoreOf(total + r.gain) - scoreOf(total);
function prepare(teams) {
  const f = valueFilters();
  const names = [...new Set(teams.flatMap(([, members]) => members.map((m) => m.name)))].sort();
  const id = new Map(names.map((name, i) => [name, i]));
  const rover = names.findIndex(isRover);
  const free = new Set(teams.flatMap(([, members]) => members.filter(
    (m) => m.loadout.resonator.tier === 2 || m.loadout.resonator.tier === 3 || m.loadout.resonator.tier === 4
    /* Tier.FreeS0 */
  ).map((m) => m.name)));
  const best = /* @__PURE__ */ new Map();
  for (const [teamKey, members] of teams) {
    const score = bestPicks.get(bestKey(teamKey, members, f))?.scores[0];
    if (!score)
      continue;
    const ids = members.map((m) => id.get(m.name)).sort((a, b) => a - b);
    const set = ids.join(",");
    const weight = dprOf(score.sectionTotals);
    if ((best.get(set)?.team.weight ?? -1) < weight)
      best.set(set, { team: { members: ids, weight }, teamKey });
  }
  const kept = [...best.values()];
  world = {
    names,
    free: names.filter((name) => free.has(name)),
    groupOf: names.map((name, i) => isRover(name) ? rover : i),
    capacity: names.map((name) => TWO_VIGOR.has(name) ? 2 : 1),
    packTeams: kept.map((k) => k.team),
    teamKeys: kept.map((k) => k.teamKey),
    strongest: names.map((_, v) => kept.reduce((top, k, i) => k.team.members.includes(v) && (top < 0 || k.team.weight > kept[top].team.weight) ? i : top, -1))
  };
  try {
    const saved = JSON.parse(localStorage.getItem(OWNED_KEY) ?? "null");
    owned = saved ? new Set(saved.filter((name) => id.has(name))) : DEFAULT_OWNED();
  } catch {
    owned = DEFAULT_OWNED();
  }
}
function saveOwned() {
  try {
    localStorage.setItem(OWNED_KEY, JSON.stringify([...owned]));
  } catch {
  }
}
function compute() {
  const result = accountGains(world.packTeams, world.groupOf, world.capacity, world.names.map((name) => owned.has(name)));
  total = result.total;
  rows = world.names.map((name, v) => {
    const via = result.via[v];
    return {
      name,
      label: labelIn(world.teamKeys[via >= 0 ? via : world.strongest[v]], name, via >= 0),
      owned: owned.has(name),
      gain: result.gains[v],
      href: result.gains[v] > 0 && via >= 0 ? pageOf(world.teamKeys[via]) : null
    };
  }).sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name));
}
function render() {
  const cell = (r, side) => {
    const start = side ? " blockstart" : "";
    if (!r)
      return `<div class="sec"><div class="c${start}"></div><div class="c"></div><div class="c"></div></div>`;
    const gain = shownGain(r);
    const hue = RESONATOR_HUE.get(r.name) ?? FALLBACK_HUE;
    const figure = r.href ? `<a href="${esc(r.href)}">${fmt(gain)}</a>` : fmt(gain);
    return `<div class="sec"><label class="c check${start}"><input type="checkbox" data-name="${esc(r.name)}" aria-label="Owned: ${esc(r.name)}"${r.owned ? " checked" : ""}></label><div class="c name res" style="--mem:${hue};color:${hue}"><span class="res-label">${esc(r.label)}</span></div><div class="c num total">${figure}</div></div>`;
  };
  const sides = [rows.filter((r) => !r.owned), rows.filter((r) => r.owned)].map((side) => side.sort((a, b) => shownGain(b) - shownGain(a) || a.name.localeCompare(b.name)));
  const body = Array.from({ length: Math.max(...sides.map((side) => side.length)) }, (_, k) => `<div class="trow">${sides.map((side, i) => cell(side[k], i)).join("")}</div>`).join("");
  const head = sides.map((_, i) => `<div class="c${i ? " blockstart" : ""}">${i ? "Owned" : "Unowned"}</div><div class="c">Resonator</div><div class="c num modehead" title="Click to switch between Neutral Matrix Score and Account DPR">${scoreMode ? "Neutral Score" : "Account DPR"} ${i ? "Gained" : "Gain"}</div>`).join("");
  const heading = `<button type="button" class="resetlink">Reset Account</button><span class="hint">${scoreMode ? `Neutral Matrix Score: ${fmt(scoreOf(total))}` : `Account DPR: ${fmt(total)}`}</span>`;
  drawPage(app, costBox(filters.cost, openHelp.has("cost")), heading, 6, head, body);
}
wireHelp(app, render);
app.addEventListener("click", (e) => {
  if (!e.target.closest(".modehead"))
    return;
  scoreMode = !scoreMode;
  render();
});
app.addEventListener("click", (e) => {
  if (!e.target.closest(".resetlink"))
    return;
  owned = DEFAULT_OWNED();
  try {
    localStorage.removeItem(OWNED_KEY);
  } catch {
  }
  compute();
  render();
});
app.addEventListener("change", (e) => {
  const select = e.target;
  if (select.id !== "cost")
    return;
  filters.cost = select.value;
  syncCost();
  clearBuilds();
  load().catch(showError);
});
app.addEventListener("change", (e) => {
  const box = e.target.closest("input[data-name]");
  if (!box)
    return;
  if (box.checked)
    owned.add(box.dataset.name);
  else
    owned.delete(box.dataset.name);
  saveOwned();
  compute();
  render();
});
var generation = 0;
async function load() {
  const gen = ++generation;
  const f = valueFilters();
  const teams = Object.entries(TEAMS).filter(([, members]) => members.every((m) => hasBuild(m, f)));
  await ensureBestPicks(teams, f, () => gen !== generation);
  if (gen !== generation)
    return;
  saveSolves();
  overlayPhase("Computing Values...", true);
  await paint();
  if (gen !== generation)
    return;
  prepare(teams);
  compute();
  render();
  overlay.hidden = true;
}
async function boot() {
  overlayPhase("Initializing\u2026", true);
  applyHash();
  filters.matrix = [];
  setBuildFilters(valueFilters);
  syncCost();
  addEventListener("hashchange", () => location.reload());
  await loadSolves();
  await load();
}
boot().catch(showError);
