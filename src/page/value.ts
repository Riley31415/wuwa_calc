/**
 * The Value page: what each resonator is worth to the account the reader owns. Every team's Avg DPR
 * is read off the solves at the link's Team Cost with every Matrix on (solved here, on the shared
 * pool, where they aren't), and solve/packing.ts packs the best account out of what is owned.
 */
import { fmt } from "./display.js";
import { defaultFilters, hasBuild, bestKey } from "../solve/solver.js";
import type { Member, Filters } from "../solve/solver.js";
import { TEAMS, RESONATOR_HUE, FALLBACK_HUE, bestPicks, loadSolves, saveSolves, filters, MATRIX_RESONATORS, applyHash, syncCost } from "./model.js";
import type { TeamCost } from "../solve/solver.js";
import { costBox } from "./options.js";
import { Tier } from "../engine/stats.js";
import { paint } from "./pool.js";
import { overlay, overlayPhase, showError, ensureBestPicks } from "./loading.js";
import { accountGains } from "../solve/packing.js";
import type { PackTeam } from "../solve/packing.js";
import { TWO_VIGOR, isRover, esc, dprOf, pageOf, labelIn, drawPage, wireHelp, openHelp, clearBuilds, setBuildFilters } from "./roster.js";

const app = document.getElementById("app")!;

/** What "reset" owns: the free resonators — the Rovers, the 4* and Jianxin — and Verina. */
const DEFAULT_OWNED = (): Set<string> => new Set([...world.free, "Verina"]);
const OWNED_KEY = "wuwa.owned.v1";

/** The page's filter state: the reader's Team Cost with every Matrix on. */
function valueFilters(): Filters {
  return { ...defaultFilters(), cost: filters.cost, matrix: [...MATRIX_RESONATORS] };
}

/** Neutral Matrix rounds: four bosses at one HP, a fifth with more (worth 1000 points the moment it
 *  falls), and the HP a point costs. Round 3 repeats for good; its fifth boss is off the screenshot the
 *  numbers came from, so it is extrapolated — the fifth's HP over the others' grew 1.1 -> 1.337 from
 *  round 1 to 2, and is taken to grow by that same factor again (1.6248). */
const MATRIX_ROUNDS = [
  { hp: 5_612_519, last: 6_173_771, perPoint: 1200 },
  { hp: 9_541_515, last: 12_756_094, perPoint: 1056 },
  { hp: 19_388_952, last: 31_503_760, perPoint: 963 },
];

/** What one rotation of the account becomes in a Matrix run: four rotations, under the default
 *  Matrix token's 1.2x. */
const MATRIX_DAMAGE = 4 * 1.2;

/** The score `damage` reaches: one pool of damage through the bosses in order, what a kill leaves
 *  over carrying to the next, the boss it runs out on scoring what it took, floored once at the end. */
function matrixScore(damage: number): number {
  let points = 0;
  for (let round = 0; damage > 0; round++) {
    const { hp, last, perPoint } = MATRIX_ROUNDS[Math.min(round, MATRIX_ROUNDS.length - 1)]!;
    for (let boss = 0; boss < 5 && damage > 0; boss++) {
      const full = boss === 4 ? last : hp;
      const dealt = Math.min(damage, full);
      points += dealt / perPoint;
      damage -= dealt;
      if (dealt === full && boss === 4) points += 1000;
    }
  }
  return Math.floor(points);
}

/** What the packing is given, once: the best line of each distinct set of resonators. */
interface World {
  names: string[];
  /** Who an account starts with: `Tier.Free`, `Tier.FreeS2` and `Tier.FreeS0`. */
  free: string[];
  groupOf: number[];
  capacity: number[];
  packTeams: PackTeam[];
  /** The `ALL_TEAMS` key behind each packing team, for its team page. */
  teamKeys: string[];
  /** Per resonator, the packing team that does most with them. */
  strongest: number[];
}
let world: World;
let owned = new Set<string>();
interface Row { name: string; label: string; owned: boolean; gain: number; href: string | null }
let rows: Row[] = [];
let total = 0;
/** What the table reads: Neutral Matrix Score (the default) or Account DPR — its heading's click flips it. */
let scoreMode = true;

/** The Neutral Matrix Score an account of `dpr` reaches. */
const scoreOf = (dpr: number): number => matrixScore(dpr * MATRIX_DAMAGE);
/** A row's gain as the table reads it: the DPR the account gains or loses with them, or the score —
 *  the score only climbs with damage, so the best account for DPR is the best for score too. */
const shownGain = (r: Row): number => (!scoreMode ? r.gain
  : r.owned ? scoreOf(total) - scoreOf(total - r.gain) : scoreOf(total + r.gain) - scoreOf(total));

function prepare(teams: [string, Member[]][]): void {
  const f = valueFilters();
  const names = [...new Set(teams.flatMap(([, members]) => members.map((m) => m.name)))].sort();
  const id = new Map(names.map((name, i) => [name, i]));
  const rover = names.findIndex(isRover);
  const free = new Set(teams.flatMap(([, members]) => members
    .filter((m) => m.loadout.resonator.tier === Tier.Free || m.loadout.resonator.tier === Tier.FreeS2 || m.loadout.resonator.tier === Tier.FreeS0).map((m) => m.name)));
  const best = new Map<string, { team: PackTeam; teamKey: string }>();
  for (const [teamKey, members] of teams) {
    const score = bestPicks.get(bestKey(teamKey, members, f))?.scores[0];
    if (!score) continue;
    const ids = members.map((m) => id.get(m.name)!).sort((a, b) => a - b);
    const set = ids.join(",");
    const weight = dprOf(score.sectionTotals);
    if ((best.get(set)?.team.weight ?? -1) < weight) best.set(set, { team: { members: ids, weight }, teamKey });
  }
  const kept = [...best.values()];
  world = {
    names,
    free: names.filter((name) => free.has(name)),
    groupOf: names.map((name, i) => (isRover(name) ? rover : i)),
    capacity: names.map((name) => (TWO_VIGOR.has(name) ? 2 : 1)),
    packTeams: kept.map((k) => k.team),
    teamKeys: kept.map((k) => k.teamKey),
    strongest: names.map((_, v) => kept.reduce((top, k, i) => (k.team.members.includes(v)
      && (top < 0 || k.team.weight > kept[top]!.team.weight) ? i : top), -1)),
  };
  try {
    const saved = JSON.parse(localStorage.getItem(OWNED_KEY) ?? "null") as string[] | null;
    owned = saved ? new Set(saved.filter((name) => id.has(name))) : DEFAULT_OWNED();
  } catch {
    owned = DEFAULT_OWNED();
  }
}

function saveOwned(): void {
  try {
    localStorage.setItem(OWNED_KEY, JSON.stringify([...owned]));
  } catch { /* private window or no storage: the choice lasts until the page closes */ }
}

function compute(): void {
  const result = accountGains(world.packTeams, world.groupOf, world.capacity, world.names.map((name) => owned.has(name)));
  total = result.total;
  // a resonator is written in the team they stand in, with its mode; else in the team that does most with them
  rows = world.names.map((name, v) => {
    const via = result.via[v]!;
    return {
      name,
      label: labelIn(world.teamKeys[via >= 0 ? via : world.strongest[v]!]!, name, via >= 0),
      owned: owned.has(name),
      gain: result.gains[v]!,
      href: result.gains[v]! > 0 && via >= 0 ? pageOf(world.teamKeys[via]!) : null,
    };
  }).sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name));
}

function render(): void {
  const cell = (r: Row | undefined, side: number): string => {
    const start = side ? " blockstart" : "";
    if (!r) return `<div class="sec"><div class="c${start}"></div><div class="c"></div><div class="c"></div></div>`;
    const gain = shownGain(r);
    const figure = r.href ? `<a href="${esc(r.href)}">${fmt(gain)}</a>` : fmt(gain);
    // each half of a row its own box-less group, so a hover lights that half alone (index.css `.sec`)
    return `<div class="sec"><label class="c check${start}"><input type="checkbox" data-name="${esc(r.name)}" aria-label="Owned: ${esc(r.name)}"${r.owned ? " checked" : ""}></label>`
      + `<div class="c name res" style="--mem:${RESONATOR_HUE.get(r.name) ?? FALLBACK_HUE}"><span class="res-label">${esc(r.label)}</span></div>`
      + `<div class="c num total">${figure}</div></div>`;
  };
  // the unowned in the three columns on the left, the owned in the three on the right
  const sides = [rows.filter((r) => !r.owned), rows.filter((r) => r.owned)]
    .map((side) => side.sort((a, b) => shownGain(b) - shownGain(a) || a.name.localeCompare(b.name)));
  const body = Array.from({ length: Math.max(...sides.map((side) => side.length)) }, (_, k) =>
    `<div class="trow">${sides.map((side, i) => cell(side[k], i)).join("")}</div>`).join("");
  // the unowned side reads what owning them gains, the owned side what they have gained the account
  const head = sides.map((_, i) => `<div class="c${i ? " blockstart" : ""}">${i ? "Owned" : "Unowned"}</div><div class="c">Resonator</div>`
    + `<div class="c num modehead" title="Click to switch between Neutral Matrix Score and Account DPR">${scoreMode ? "Neutral Score" : "Account DPR"} ${i ? "Gained" : "Gain"}</div>`).join("");
  const heading = `<button type="button" class="resetlink">Reset Account</button>`
    + `<span class="hint">${scoreMode ? `Neutral Matrix Score: ${fmt(scoreOf(total))}` : `Account DPR: ${fmt(total)}`}</span>`;
  drawPage(app, costBox(filters.cost, openHelp.has("cost")), heading, 6, head, body);
}

wireHelp(app, render);

app.addEventListener("click", (e) => {
  if (!(e.target as Element).closest(".modehead")) return;
  scoreMode = !scoreMode;
  render();
});

app.addEventListener("click", (e) => {
  if (!(e.target as Element).closest(".resetlink")) return;
  owned = DEFAULT_OWNED();
  try {
    localStorage.removeItem(OWNED_KEY);
  } catch { /* nothing was kept */ }
  compute();
  render();
});

// the Team Cost is the reader's on every page: kept, and the roster solved again under it
app.addEventListener("change", (e) => {
  const select = e.target as HTMLSelectElement;
  if (select.id !== "cost") return;
  filters.cost = select.value as TeamCost;
  syncCost();
  clearBuilds();
  load().catch(showError);
});

app.addEventListener("change", (e) => {
  const box = (e.target as Element).closest<HTMLInputElement>("input[data-name]");
  if (!box) return;
  if (box.checked) owned.add(box.dataset.name!);
  else owned.delete(box.dataset.name!);
  saveOwned();
  compute();
  render();
});

/** Which `load()` is the live one: a cost picked while the last is still solving takes over. */
let generation = 0;

/** Solve whatever the filters need that isn't in hand, then pack and draw. */
async function load(): Promise<void> {
  const gen = ++generation;
  const f = valueFilters();
  const teams = Object.entries(TEAMS).filter(([, members]) => members.every((m) => hasBuild(m, f)));
  await ensureBestPicks(teams, f, () => gen !== generation);
  if (gen !== generation) return;
  saveSolves();
  overlayPhase("Computing Values...", true);
  await paint();
  if (gen !== generation) return;
  prepare(teams);
  compute();
  render();
  overlay.hidden = true;
}

async function boot(): Promise<void> {
  overlayPhase("Initializing…", true);
  // the cost from the link as the main page reads it (`tc=`, s0r1 without one); `mx=` is ignored �
  // the scoring runs every Matrix itself (valueFilters), and each team link carries it in its team code
  applyHash();
  filters.matrix = [];
  setBuildFilters(valueFilters);
  syncCost();
  // a link typed in over the page is a page of its own
  addEventListener("hashchange", () => location.reload());
  await loadSolves();
  await load();
}

boot().catch(showError);
