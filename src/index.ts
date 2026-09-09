/**
 * The page's entry point: boot, routing, the loading overlay, and the solve/run passes a filter
 * change drives. What lives where:
 *   page/model.ts   teams, filters, which rows exist, caches, saved solves, the URL hash
 *   page/panels.ts  hover-panel markup and wiring
 *   page/table.ts   the comparison page and its handlers
 *   page/detail.ts  the detail page, action log and column drag
 *   solver.ts       the build search (also the Worker entry); teamrun.ts the engine run it scores
 */
import { fmt } from "./display.js";
import { eligibleWeapons, solveTeam, bestKey, picksKey } from "./solver.js";
import type { Member, Solved, SolveRequest, SolveResponse } from "./solver.js";
import { runTeam } from "./teamrun.js";
import {
  TEAMS, filters, results, bestPicks, picksCache, storeSolved, teamWanted, teamRows, estimatedRowCount, rowFromKey,
  setVisibleRows, visibleRows, discardRestoredSolves, loadShipped, loadSolves, saveSolves, solveFits,
  hashParams, applyHash, syncHash, routeTeam,
} from "./page/model.js";
import type { TeamRow } from "./page/model.js";
import { wireSourcePanels } from "./page/panels.js";
import { renderComparison, onRefresh } from "./page/table.js";
import { renderDetail, errorPage } from "./page/detail.js";

const app = document.getElementById("app")!;
const backLink = document.getElementById("backLink")!;

/* ---------------------------------------------------------------------------------- overlay */

const overlay = document.getElementById("loading")!;
const overlayStatus = overlay.querySelector<HTMLElement>(".status-text")!;
const overlayCount = overlay.querySelector<HTMLElement>(".progress-count")!;
const overlayFill = overlay.querySelector<HTMLElement>(".progress-fill")!;

/** Two frames, not one: the first rAF callback runs before the frame is committed. */
const paint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
/** A phase with real work behind it (`now`) puts the overlay up at once; a render-only change
 *  waits 100ms so a quick redraw doesn't flash it. */
let overlayTimer: ReturnType<typeof setTimeout> | undefined;
function overlayPhase(text: string, now = false): void {
  overlayStatus.textContent = text;
  if (!overlay.hidden) return;
  if (now) { clearTimeout(overlayTimer); overlayTimer = undefined; overlay.hidden = false; return; }
  if (overlayTimer === undefined) overlayTimer = setTimeout(() => { overlayTimer = undefined; overlay.hidden = false; }, 100);
}
function overlayHide(): void {
  clearTimeout(overlayTimer);
  overlayTimer = undefined;
  overlay.hidden = true;
}

/** The bar only ever moves forward within one refresh: its two phases count in different units
 *  (estimated rows, then actual rows), so a phase-2 total that comes in under phase 1's estimate
 *  must not pull it back. */
let barAt = 0;
function barReset(): void { barAt = 0; overlayFill.style.width = "0%"; overlayCount.textContent = ""; }
function barProgress(done: number, total: number): void {
  barAt = Math.max(barAt, total ? done / total : 1);
  overlayFill.style.width = `${barAt * 100}%`;
  overlayCount.textContent = `${fmt(done)} / ${fmt(total)}`;
}

/** The one yield the main-thread paths need for the bar to move; throttled to ~50ms of work. */
let lastPaint = performance.now();
async function breathe(): Promise<void> {
  if (performance.now() - lastPaint <= 50) return;
  await paint();
  lastPaint = performance.now();
}

/* ------------------------------------------------------------------------------ the passes */

/** Run every row the filters opened that hasn't been run — the bar measures the whole table. */
async function runMissing(rows: TeamRow[]): Promise<void> {
  const missing = rows.filter((row) => !results.has(row.key));
  if (!missing.length) return;
  overlayPhase("Running Rotations…", true);
  const cached = rows.length - missing.length;
  barProgress(cached, rows.length);
  for (let i = 0; i < missing.length; i++) {
    const row = missing[i]!;
    results.set(row.key, runTeam(row.teamKey, row.members, row.combo));
    barProgress(cached + i + 1, rows.length);
    await breathe();
  }
  await paint();
}

/** One team per message; workers are kept for the session (each parses the whole engine graph). */
const WORKER_LIMIT = 8;
let pool: Worker[] | null = null;
let poolTried = false;

function workerPool(): Worker[] | null {
  if (poolTried) return pool;
  poolTried = true;
  const want = Math.max(1, Math.min(WORKER_LIMIT, (navigator.hardwareConcurrency || 4) - 1));
  try {
    // a query string nothing has cached: the published site caches for ten minutes, and a worker
    // on last build's engine solves with last build's kits
    pool = Array.from({ length: want }, () =>
      new Worker(new URL(`./solver.js?v=${Date.now()}`, import.meta.url), { type: "module" }));
  } catch (err) {
    console.warn("Workers unavailable, optimizing on the main thread instead:", err);
    pool = null;
  }
  return pool;
}

/** Hand `teams` across the pool, one in flight per worker. A worker that throws or answers with a
 *  solve that doesn't fit this build is redone on this thread, so the table is always complete. */
function solveOnWorkers(
  workers: Worker[], teams: [string, Member[]][], onDone: (members: Member[]) => void,
): Promise<void> {
  return new Promise((resolve) => {
    let next = 0, live = 0, id = 0;
    const pump = (w: Worker): void => {
      if (next >= teams.length) {
        if (--live === 0) resolve();
        return;
      }
      const [key, members] = teams[next++]!;
      const known = picksCache.get(picksKey(key, members, filters)) ?? null;
      const finish = (solved: Solved): void => {
        storeSolved(key, solved);
        onDone(members);
        pump(w);
      };
      w.onmessage = ({ data }: MessageEvent<SolveResponse>) => {
        const solved: Solved = { picks: data.picks, rows: data.rows, scores: data.scores, hidden: data.hidden ?? [], hiddenScores: data.hiddenScores ?? [] };
        if (solveFits(bestKey(key, members, filters), solved)) { finish(solved); return; }
        console.warn(`worker's solve for ${key} does not fit this build; solving it here`);
        finish(solveTeam(key, members, filters, known));
      };
      w.onerror = (e) => {
        console.warn(`worker failed on ${key}, solving it here:`, e.message);
        e.preventDefault();
        finish(solveTeam(key, members, filters, known));
      };
      const request: SolveRequest = { id: id++, teamKey: key, filters, picks: known };
      w.postMessage(request);
    };
    for (const w of workers.slice(0, teams.length)) { live++; pump(w); }
    if (live === 0) resolve();
  });
}

/** Solve every team in play whose answer isn't in hand. The bar reads in rows (`estimatedRowCount`),
 *  so it shares one total with `runMissing()`. @returns whether anything was solved. */
async function ensureBestPicks(inPlay: [string, Member[]][], rowsTotal: number): Promise<boolean> {
  await loadShipped(filters);
  const teams = inPlay.filter(([key, members]) => !bestPicks.has(bestKey(key, members, filters)));
  if (!teams.length) return false;

  overlayPhase("Running Calculations...", true);
  const rowsOf = (members: Member[]): number => (members.every((m) => eligibleWeapons(m, filters).length) ? estimatedRowCount(members) : 0);
  let rowsDone = inPlay.filter(([key, members]) => bestPicks.has(bestKey(key, members, filters))).reduce((sum, [, members]) => sum + rowsOf(members), 0);
  const progress = (): void => barProgress(rowsDone, rowsTotal);
  progress();

  // a role with no weapon it may hold has no build, and its teams drop out; the heaviest teams
  // (most rows to open) go first so the pool's tail isn't one worker on a 5x team
  const solvable = teams.filter(([, members]) => members.every((m) => eligibleWeapons(m, filters).length))
    .map((t) => [t, rowsOf(t[1])] as const).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const pool = workerPool();
  if (pool) await solveOnWorkers(pool, solvable, (members) => { rowsDone += rowsOf(members); progress(); });
  else {
    for (const [key, members] of solvable) {
      storeSolved(key, solveTeam(key, members, filters, picksCache.get(picksKey(key, members, filters)) ?? null));
      rowsDone += rowsOf(members);
      progress();
      await breathe();
    }
  }
  await paint();
  return true;
}

/** Whether the table's rows have been asked for yet — a `#team=` cold load never asks. */
let tableRequested = false;

const route = (): void => {
  const key = routeTeam();
  if (key) { renderDetail(key); return; }
  if (!tableRequested) { void refresh(); return; }
  renderComparison();
};

/**
 * Re-expand every team under the current filters, solve and run whatever that opened, redraw.
 * The bar's total is fixed before either phase runs (`estimatedRowCount` needs no solve). A
 * change that opened nothing new still redraws under the overlay — building the markup isn't free.
 */
async function refresh(): Promise<void> {
  tableRequested = true;
  barReset();
  try {
    const inPlay = Object.entries(TEAMS).filter(([, members]) => teamWanted(members));
    // workers come up while the empty table draws, but only if there is something to solve
    if (inPlay.some(([key, members]) => !bestPicks.has(bestKey(key, members, filters)))) workerPool();
    if (!visibleRows.length) route();

    const solvableInPlay = inPlay.filter(([, members]) => members.every((m) => eligibleWeapons(m, filters).length));
    const rowsTotal = solvableInPlay.reduce((sum, [, members]) => sum + estimatedRowCount(members), 0);

    await ensureBestPicks(inPlay, rowsTotal);
    saveSolves();
    const rows = teamRows();
    const cached = rows.filter((row) => results.has(row.key));
    const missing = cached.length !== rows.length;
    if (!missing && cached.length) {
      overlayPhase("Rendering Table...");
      barProgress(rows.length, rows.length);
      await paint();
      setVisibleRows(cached);
      route();
    } else if (!missing) {
      setVisibleRows([]);
      route();
    }
    await runMissing(rows);
    if (missing) {
      overlayPhase("Rendering Table…");
      await paint();
      setVisibleRows(rows);
      route();
    }
  } catch (err) {
    // a restored solve that no longer fits is retried once without any (the usual published-site break)
    if (discardRestoredSolves()) {
      console.warn("restored solves failed to load; solving the roster here instead", err);
      setVisibleRows([]);
      await refresh();
      return;
    }
    console.error(err);
    app.innerHTML = errorPage(err);
    app.className = "";
  }
  overlayHide();
}

/** A `#team=` load served off its key alone: one traced run, no table build. */
async function bootDetail(): Promise<boolean> {
  const key = hashParams().get("team");
  if (!key || results.has(key)) return false;
  const row = rowFromKey(key);
  if (!row) return false;
  overlayPhase("Running Rotation…", true);
  await paint();
  results.set(key, runTeam(row.teamKey, row.members, row.combo, true));
  renderDetail(key);
  overlayHide();
  return true;
}

async function boot(): Promise<void> {
  onRefresh(refresh);
  applyHash();
  await loadSolves();
  const detail = await bootDetail().catch((err: unknown) => {
    if (!discardRestoredSolves()) throw err;
    console.warn("restored solves failed to load; solving the roster here instead", err);
    return false;
  });
  if (!detail) await refresh();
  syncHash();

  // only a real navigation gets here — `syncHash()` writes fire nothing
  addEventListener("hashchange", () => {
    if (applyHash()) { void refresh(); return; }
    const key = hashParams().get("team");
    if (key && !results.has(key) && rowFromKey(key)) { void bootDetail(); return; }
    route();
  });
  wireSourcePanels(app);
  document.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>(".gotodetail");
    if (el?.dataset.team) { syncHash(el.dataset.team, true); route(); }
  });
  backLink.addEventListener("click", (e) => {
    e.preventDefault();
    // pop the entry the detail view pushed rather than laying another beside it, so this link and
    // the browser's own Back button leave the history in the same place
    if ((history.state as { detail?: boolean } | null)?.detail) { history.back(); return; }
    syncHash(null);
    route();
  });
}

boot().catch((err: unknown) => {
  console.error(err);
  app.innerHTML = errorPage(err);
  app.className = "";
  const box = overlay.querySelector<HTMLElement>(".loading-error");
  if (box) {
    box.hidden = false;
    box.textContent += `${box.textContent ? "\n\n" : ""}${err instanceof Error ? err.stack ?? err.message : String(err)}`;
    overlay.hidden = false;
  }
});
