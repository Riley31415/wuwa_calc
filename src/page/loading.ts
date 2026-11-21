/**
 * What both pages that solve share: the loading overlay and its bar, the pass that solves the teams
 * a page needs, and the one-team solve a pick menu asks for out of sight.
 */
import { fmt } from "./display.js";
import { hasBuild, bestKey } from "../solve/solver.js";
import type { Member, Filters } from "../solve/solver.js";
import { TEAMS, bestPicks, loadShipped, saveSolves, estimatedRowCount } from "./model.js";
import { paint, workerPool, solveAll } from "./pool.js";

/* ---------------------------------------------------------------------------------- overlay */

export const overlay = document.getElementById("loading")!;
const overlayStatus = overlay.querySelector<HTMLElement>(".status-text")!;
const overlayCount = overlay.querySelector<HTMLElement>(".progress-count")!;
const overlayFill = overlay.querySelector<HTMLElement>(".progress-fill")!;

/** A phase with real work behind it (`now`) puts the overlay up at once; a render-only change
 *  waits 100ms so a quick redraw doesn't flash it. */
let overlayTimer: ReturnType<typeof setTimeout> | undefined;
export function overlayPhase(text: string, now = false): void {
  overlayStatus.textContent = text;
  if (!overlay.hidden) return;
  if (now) { clearTimeout(overlayTimer); overlayTimer = undefined; overlay.hidden = false; return; }
  if (overlayTimer === undefined) overlayTimer = setTimeout(() => { overlayTimer = undefined; overlay.hidden = false; }, 100);
}
/** Put a phase up and let the browser actually draw it: `overlayPhase()` only sets the flag, and a
 *  phase that blocks the thread on the next line never gives the 100ms timer a frame to fire in —
 *  which is why a long render used to run behind a page that simply froze. `rows` is how much work
 *  is coming: a redraw small enough to be over before the overlay would have shown keeps the
 *  delayed form and doesn't flash — a render ran ~60ms at 700 rows (Oct 2026), so ~1000 is 100ms. */
const OVERLAY_ROWS = 1_000;
export async function overlayNow(text: string, rows = Infinity): Promise<void> {
  overlayPhase(text, rows >= OVERLAY_ROWS);
  await paint();
}
export function overlayHide(): void {
  clearTimeout(overlayTimer);
  overlayTimer = undefined;
  overlay.hidden = true;
}

/** Anything that goes wrong lands in the one box on the loading screen — the same box the boot
 *  handlers in index.html write to, and the overlay comes back up around it. The page underneath
 *  is left as it was: a second copy of the error drawn behind the blur said nothing the box in
 *  front of it did not. */
export function showError(err: unknown): void {
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
export function barReset(): void { overlayFill.style.width = "0%"; overlayCount.textContent = ""; }
export function barProgress(done: number, total: number): void {
  overlayFill.style.width = `${total ? (done / total) * 100 : 100}%`;
  overlayCount.textContent = `${fmt(done)} / ${fmt(total)}`;
}

/** Solve every team in play whose answer isn't in hand — the bar counts the rows this phase is
 *  opening, the same unit `runMissing()` then counts. Stops where a newer pass has started.
 *  @returns whether anything was solved. */
export async function ensureBestPicks(inPlay: [string, Member[]][], f: Filters, stale: () => boolean): Promise<boolean> {
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

/** One team solved under `f` with no overlay and no redraw — what an open pick menu reads its Compare
 *  figures off (pickmenu.ts). */
export async function solveQuiet(teamKey: string, f: Filters): Promise<void> {
  const members = TEAMS[teamKey]!;
  await loadShipped(f);
  if (bestPicks.has(bestKey(teamKey, members, f)) || !members.every((m) => hasBuild(m, f))) return;
  workerPool();
  await solveAll([[teamKey, members]], f, () => {});
  saveSolves();
}

