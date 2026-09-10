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
import { hasBuild, solveTeam, bestKey, picksKey, isProgress } from "./solver.js";
import type { Member, Solved, SolveRequest, SolveResponse, SolveProgress } from "./solver.js";
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
/** Put a phase up and let the browser actually draw it: `overlayPhase()` only sets the flag, and a
 *  phase that blocks the thread on the next line never gives the 100ms timer a frame to fire in —
 *  which is why a long render used to run behind a page that simply froze. `rows` is how much work
 *  is coming: a redraw small enough to be over before the overlay would have shown keeps the
 *  delayed form and doesn't flash. */
const OVERLAY_ROWS = 200;
async function overlayNow(text: string, rows = Infinity): Promise<void> {
  overlayPhase(text, rows >= OVERLAY_ROWS);
  await paint();
}
function overlayHide(): void {
  clearTimeout(overlayTimer);
  overlayTimer = undefined;
  overlay.hidden = true;
}

/** The bar counts teams while they solve and rows while they run — two phases, two units, so it
 *  fills once per phase rather than carrying a ratio across the change. */
function barReset(): void { overlayFill.style.width = "0%"; overlayCount.textContent = ""; }
function barProgress(done: number, total: number): void {
  overlayFill.style.width = `${total ? (done / total) * 100 : 100}%`;
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
  workers: Worker[], teams: [string, Member[]][],
  onDone: (members: Member[]) => void, onShare?: (members: Member[], share: number) => void,
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
      w.onmessage = ({ data }: MessageEvent<SolveResponse | SolveProgress>) => {
        if (isProgress(data)) { onShare?.(members, data.share); return; }
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

/** Solve every team in play whose answer isn't in hand — the bar counts the rows this phase is
 *  opening, the same unit `runMissing()` then counts. @returns whether anything was solved. */
async function ensureBestPicks(inPlay: [string, Member[]][]): Promise<boolean> {
  await loadShipped(filters);
  const teams = inPlay.filter(([key, members]) => !bestPicks.has(bestKey(key, members, filters)));
  if (!teams.length) return false;

  // a role with no weapon it may hold, or no chain level its rotation covers, has no build, and
  // its teams drop out; the heaviest teams (most rows to open) go first so the pool's tail isn't
  // one worker on a 5x team
  const rowsOf = (members: Member[]): number => (members.every((m) => hasBuild(m, filters)) ? estimatedRowCount(members) : 0);
  const solvable = teams.filter(([, members]) => members.every((m) => hasBuild(m, filters)))
    .map((t) => [t, rowsOf(t[1])] as const).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  if (!solvable.length) return false;

  // the rows these teams are about to open, not the teams themselves: one team with every axis
  // compared is a thousand rows of work and "0 / 1" says nothing about it. A team's own share
  // lands when its solve comes back, so the bar steps by whatever that team was worth.
  const total = solvable.reduce((n, [, members]) => n + rowsOf(members), 0);
  await overlayNow("Running Calculations...");
  let done = 0;
  const progress = (): void => barProgress(done, total);
  progress();

  // A team's own share of the bar, filled in as its solve reports how far in it is — one team with
  // every axis compared is the whole phase, and without this the bar sits at zero for all of it.
  // Counted per team so a report can only ever move that team's own part forward.
  const counted = new Map<Member[], number>();
  const share = (members: Member[], part: number): void => {
    const at = Math.min(rowsOf(members), Math.round(rowsOf(members) * part));
    const was = counted.get(members) ?? 0;
    if (at <= was) return;
    counted.set(members, at);
    done += at - was;
    progress();
  };

  const pool = workerPool();
  if (pool) await solveOnWorkers(pool, solvable, (members) => share(members, 1), share);
  else {
    for (const [key, members] of solvable) {
      const known = picksCache.get(picksKey(key, members, filters)) ?? null;
      storeSolved(key, solveTeam(key, members, filters, known, (part) => share(members, part)));
      share(members, 1);
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
 * Re-expand every team under the current filters, solve and run whatever that opened, redraw. A
 * change that opened nothing new still redraws under the overlay — building the markup isn't free,
 * and every phase here blocks the thread, so the overlay is painted before each one starts.
 */
async function refresh(): Promise<void> {
  tableRequested = true;
  barReset();
  try {
    const inPlay = Object.entries(TEAMS).filter(([, members]) => teamWanted(members));
    // workers come up while the empty table draws, but only if there is something to solve
    if (inPlay.some(([key, members]) => !bestPicks.has(bestKey(key, members, filters)))) workerPool();
    if (!visibleRows.length) route();

    await ensureBestPicks(inPlay);
    saveSolves();
    const rows = teamRows();
    const cached = rows.filter((row) => results.has(row.key));
    const missing = cached.length !== rows.length;
    if (!missing && cached.length) {
      await overlayNow("Rendering Table...", rows.length);
      barProgress(rows.length, rows.length);
      setVisibleRows(cached);
      route();
    } else if (!missing) {
      setVisibleRows([]);
      route();
    }
    await runMissing(rows);
    if (missing) {
      await overlayNow("Rendering Table…", rows.length);
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
  // the pool the first compare would otherwise wait on, brought up once the table is on screen
  // (a roster served whole from the shipped solves never asks for it during boot)
  const idle = globalThis.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 500));
  idle(() => { workerPool(); });

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
