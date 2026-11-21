/**
 * The solver pool both pages draw on: workers kept for the session, one team per message, and the
 * main-thread fallback when workers are unavailable. index.ts and value.ts own what a solve is for.
 */
import { solveTeam, bestKey, picksKey, isProgress } from "../solve/solver.js";
import type { Member, Solved, SolveRequest, SolveResponse, SolveProgress, Filters, Pick } from "../solve/solver.js";
import { picksCache, storeSolved, solveFits } from "./model.js";

/** Two frames, not one: the first rAF callback runs before the frame is committed. */
export const paint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** The one yield the main-thread paths need for the bar to move; throttled to ~50ms of work. */
let lastPaint = performance.now();
export async function breathe(): Promise<void> {
  if (performance.now() - lastPaint <= 50) return;
  await paint();
  lastPaint = performance.now();
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

export function workerPool(): Worker[] | null {
  if (poolTried) return pool;
  poolTried = true;
  const want = Math.max(1, Math.min(WORKER_LIMIT, (navigator.hardwareConcurrency || 4) - 1));
  try {
    // ./solver.js is the bundled sibling; the query string dodges the site's ten-minute cache, so
    // no worker solves on last build's kits
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
export function cancelQueued(): void {
  for (const job of queue.splice(0)) job.done();
}

/** Solve `teams` under `f` — on the pool when there is one — waiting on any already out. */
export function solveAll(teams: [string, Member[]][], f: Filters, share: (members: Member[], part: number) => void): Promise<void> {
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
