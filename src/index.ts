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
import type { Member, Solved, SolveRequest, SolveResponse, SolveProgress, Filters, Pick } from "./solver.js";
import { runTeam } from "./teamrun.js";
import {
  TEAMS, filters, results, bestPicks, picksCache, storeSolved, teamWanted, teamRows, estimatedRowCount, rowFromKey,
  setVisibleRows, visibleRows, discardRestoredSolves, loadShipped, loadSolves, saveSolves, solveFits,
  applyHash, syncHash, routeTeam, hashTeam,
} from "./page/model.js";
import type { TeamRow } from "./page/model.js";
import { wireSourcePanels } from "./page/panels.js";
import { renderComparison, onRefresh } from "./page/table.js";
import { renderDetail } from "./page/detail.js";
import { maybeShowTutorial } from "./page/tutorial.js";

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

/** Anything that goes wrong lands in the one box on the loading screen — the same box the boot
 *  handlers in index.html write to, and the overlay comes back up around it. The page underneath
 *  is left as it was: a second copy of the error drawn behind the blur said nothing the box in
 *  front of it did not. */
function showError(err: unknown): void {
  console.error(err);
  const box = overlay.querySelector<HTMLElement>(".loading-error");
  if (!box) return;
  box.hidden = false;
  box.textContent += `${box.textContent ? "\n\n" : ""}${err instanceof Error ? err.stack ?? err.message : String(err)}`;
  clearTimeout(overlayTimer);
  overlayTimer = undefined;
  overlay.hidden = false;
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

/** Run every row the filters opened that hasn't been run — the bar measures the whole table.
 *  Stops where a newer pass has started; what it ran is kept. */
async function runMissing(rows: TeamRow[], stale: () => boolean): Promise<void> {
  const missing = rows.filter((row) => !results.has(row.key));
  if (!missing.length) return;
  overlayPhase("Running Rotations…", true);
  const cached = rows.length - missing.length;
  barProgress(cached, rows.length);
  for (let i = 0; i < missing.length; i++) {
    if (stale()) return;
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

/** A team to solve: what it was asked under — the filters of the pass that wanted it, not whatever
 *  they are by the time it comes back — and who is waiting on the answer. */
interface Job {
  id: number; key: string; members: Member[]; f: Filters; known: Pick[] | null;
  onShare: (share: number) => void; done: () => void;
}
/** Teams not yet handed out, and the one each worker is on. A new pass drops the first
 *  (`cancelQueued()`); a team already out finishes and is kept for whichever pass asks for it. */
const queue: Job[] = [];
const busy = new Map<Worker, Job>();
/** Every team being solved, by `bestKey()`: a pass wanting one already out waits on that answer. */
const inFlight = new Map<string, Promise<void>>();
let jobId = 0;

/** Drop the pool for the rest of the session: its workers are on a build this page isn't, and every
 *  team they answer would only be thrown away and redone here. A rebuild is what puts them there —
 *  the page's bundle is fetched when it loads and the worker's when the pool first comes up, so an
 *  edit landing between the two leaves the workers a build ahead. Hot reload is about to replace
 *  the page anyway; until it does, this keeps the roster on one engine instead of round-tripping
 *  every team through a worker whose answer can't be used. The teams they were on go back in line. */
function dropWorkers(): void {
  for (const w of pool ?? []) w.terminate();
  pool = null;
  queue.unshift(...busy.values());
  busy.clear();
  void drainHere();
}

function workerPool(): Worker[] | null {
  if (poolTried) return pool;
  poolTried = true;
  const want = Math.max(1, Math.min(WORKER_LIMIT, (navigator.hardwareConcurrency || 4) - 1));
  try {
    // a query string nothing has cached: the published site caches for ten minutes, and a worker
    // on last build's engine solves with last build's kits
    pool = Array.from({ length: want }, () =>
      new Worker(new URL(`./solver.js?v=${Date.now()}`, import.meta.url), { type: "module" }));
    for (const w of pool) listen(w);
  } catch (err) {
    console.warn("Workers unavailable, optimizing on the main thread instead:", err);
    pool = null;
  }
  return pool;
}

/** A worker's answers, routed by request id to the team it is on. One that throws or answers with
 *  a solve that doesn't fit this build is redone on this thread, so the table is always complete. */
function listen(w: Worker): void {
  w.onmessage = ({ data }: MessageEvent<SolveResponse | SolveProgress>) => {
    const job = busy.get(w);
    if (!job || data.id !== job.id) return;
    if (isProgress(data)) {
      job.onShare(data.share);
      return;
    }
    const solved: Solved = { picks: data.picks, rows: data.rows, scores: data.scores, hidden: data.hidden ?? [], hiddenScores: data.hiddenScores ?? [] };
    if (solveFits(bestKey(job.key, job.members, job.f), solved)) {
      settle(w, job, solved);
      return;
    }
    console.warn(`the workers are on a different build than this page (first seen on ${job.key});`
      + ` solving the rest here. Reload once the rebuild has landed.`);
    dropWorkers();
  };
  w.onerror = (e) => {
    const job = busy.get(w);
    e.preventDefault();
    if (!job) return;
    console.warn(`worker failed on ${job.key}, solving it here:`, e.message);
    settle(w, job, solveTeam(job.key, job.members, job.f, job.known));
  };
}

function settle(w: Worker, job: Job, solved: Solved): void {
  storeSolved(job.key, solved, job.f);
  busy.delete(w);
  job.done();
  handOut(w);
}

function handOut(w: Worker): void {
  const job = queue.shift();
  if (!job) return;
  busy.set(w, job);
  const request: SolveRequest = { id: job.id, teamKey: job.key, filters: job.f, picks: job.known };
  w.postMessage(request);
}

/** With no pool, the line is solved here, one team at a time, yielding so the bar still moves. */
let draining = false;
async function drainHere(): Promise<void> {
  if (draining) return;
  draining = true;
  for (let job = queue.shift(); job; job = queue.shift()) {
    storeSolved(job.key, solveTeam(job.key, job.members, job.f, job.known, job.onShare), job.f);
    job.done();
    await breathe();
  }
  draining = false;
}

/** A new pass has started: the old one's teams still in line are dropped, unsolved. */
function cancelQueued(): void {
  for (const job of queue.splice(0)) job.done();
}

/** Solve `teams` under `f` — on the pool when there is one — waiting on any already out. */
function solveAll(teams: [string, Member[]][], f: Filters, share: (members: Member[], part: number) => void): Promise<void> {
  const waits = teams.map(([key, members]) => {
    const bk = bestKey(key, members, f);
    const out = inFlight.get(bk);
    if (out) return out.then(() => share(members, 1));
    const solved = new Promise<void>((resolve) => queue.push({
      id: jobId++, key, members, f, known: picksCache.get(picksKey(key, members, f)) ?? null,
      onShare: (part) => share(members, part),
      done: () => {
        inFlight.delete(bk);
        share(members, 1);
        resolve();
      },
    }));
    inFlight.set(bk, solved);
    return solved;
  });
  if (pool) {
    for (const w of pool) if (!busy.has(w)) handOut(w);
  } else void drainHere();
  return Promise.all(waits).then(() => undefined);
}

/** Solve every team in play whose answer isn't in hand — the bar counts the rows this phase is
 *  opening, the same unit `runMissing()` then counts. Stops where a newer pass has started.
 *  @returns whether anything was solved. */
async function ensureBestPicks(inPlay: [string, Member[]][], f: Filters, stale: () => boolean): Promise<boolean> {
  await loadShipped(f);
  if (stale()) return false;
  const teams = inPlay.filter(([key, members]) => !bestPicks.has(bestKey(key, members, f)));
  if (!teams.length) return false;

  // a role with no weapon it may hold, or no chain level its rotation covers, has no build, and
  // its teams drop out; the heaviest teams (most rows to open) go first so the pool's tail isn't
  // one worker on a 5x team
  const rowsOf = (members: Member[]): number => (members.every((m) => hasBuild(m, f)) ? estimatedRowCount(members, f) : 0);
  const solvable = teams.filter(([, members]) => members.every((m) => hasBuild(m, f)))
    .map((t) => [t, rowsOf(t[1])] as const).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  if (!solvable.length) return false;

  // the rows these teams are about to open, not the teams themselves: one team with every axis
  // compared is a thousand rows of work and "0 / 1" says nothing about it. A team's own share
  // lands when its solve comes back, so the bar steps by whatever that team was worth.
  const total = solvable.reduce((n, [, members]) => n + rowsOf(members), 0);
  await overlayNow("Running Calculations...");
  if (stale()) return false;
  let done = 0;
  // the bar is the newest pass's alone: an older one's teams finishing behind it move nothing
  const progress = (): void => {
    if (!stale()) barProgress(done, total);
  };
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

  workerPool();
  await solveAll(solvable, f, share);
  if (stale()) return false;
  await paint();
  return true;
}

/** Which `refresh()` pass is the live one: an older pass checks it after every wait and stops. */
let generation = 0;
/** Whether the table's rows have been asked for yet — a `#team=` cold load never asks. */
let tableRequested = false;

const route = (): void => {
  const key = routeTeam();
  if (key) {
    renderDetail(key);
    // the tutorial's later stages belong to this page; the earlier ones take themselves down for it
    maybeShowTutorial();
    return;
  }
  if (!tableRequested) { void refresh(); return; }
  renderComparison();
  // measured off the table it points at, so it goes up once that table is on screen
  maybeShowTutorial();
};

/**
 * Re-expand every team under the current filters, solve and run whatever that opened, redraw. A
 * change that opened nothing new still redraws under the overlay — building the markup isn't free,
 * and every phase here blocks the thread, so the overlay is painted before each one starts.
 */
async function refresh(): Promise<void> {
  tableRequested = true;
  // a search made while one is still running takes over: the old pass's teams still in line are
  // dropped, and it stops at its next step — anything it already solved or ran is kept
  const gen = ++generation;
  const stale = (): boolean => gen !== generation;
  cancelQueued();
  const f = structuredClone(filters);
  barReset();
  try {
    const inPlay = Object.entries(TEAMS).filter(([key, members]) => teamWanted(key, members));
    // workers come up while the empty table draws, but only if there is something to solve
    if (inPlay.some(([key, members]) => !bestPicks.has(bestKey(key, members, f)))) workerPool();
    if (!visibleRows.length) route();

    await ensureBestPicks(inPlay, f, stale);
    if (stale()) return;
    saveSolves();
    const rows = teamRows();
    const cached = rows.filter((row) => results.has(row.key));
    const missing = cached.length !== rows.length;
    if (!missing && cached.length) {
      await overlayNow("Rendering Table...", rows.length);
      if (stale()) return;
      barProgress(rows.length, rows.length);
      setVisibleRows(cached);
      route();
    } else if (!missing) {
      setVisibleRows([]);
      route();
    }
    await runMissing(rows, stale);
    if (stale()) return;
    if (missing) {
      await overlayNow("Rendering Table…", rows.length);
      if (stale()) return;
      setVisibleRows(rows);
      route();
    }
  } catch (err) {
    if (stale()) return;
    // a restored solve that no longer fits is retried once without any (the usual published-site break)
    if (discardRestoredSolves()) {
      console.warn("restored solves failed to load; solving the roster here instead", err);
      setVisibleRows([]);
      await refresh();
      return;
    }
    showError(err);
    return;
  }
  overlayHide();
  // the run is what it was waiting on: the table it points into is drawn and the overlay is down
  maybeShowTutorial();
}

/** A `#team=` load served off its key alone: one traced run, no table build. */
async function bootDetail(): Promise<boolean> {
  const key = hashTeam();
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
    const key = hashTeam();
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

boot().catch(showError);
