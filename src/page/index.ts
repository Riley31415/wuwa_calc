/**
 * The comparison page's entry point: boot, routing, and the solve/run passes a filter change
 * drives. What lives where:
 *   page/model.ts    teams, filters, which rows exist, caches, saved solves, the URL hash
 *   page/loading.ts  the loading overlay and the pass that solves the teams a page needs
 *   page/panels.ts   hover-panel markup and wiring
 *   page/table.ts    the comparison page and its handlers
 *   page/team.ts     the team page (team.html), the detail view of one team
 *   solve/solver.ts  the build search (also the Worker entry); solve/teamrun.ts the engine run it scores
 */
import { bestKey } from "../solve/solver.js";
import { paint, breathe, workerPool, cancelQueued } from "./pool.js";
import { runTeam } from "../solve/teamrun.js";
import {
  TEAMS, filters, results, bestPicks, teamWanted, teamRows,
  setVisibleRows, visibleRows, discardRestoredSolves, loadSolves, saveSolves,
  applyHash, syncHash, hashParams, pageUrl,
} from "./model.js";
import type { TeamRow } from "./model.js";
import { wireSourcePanels } from "./panels.js";
import { renderComparison, onRefresh } from "./table.js";
import { maybeShowTutorial } from "./tutorial.js";
import { overlayPhase, overlayNow, overlayHide, showError, barReset, barProgress, ensureBestPicks } from "./loading.js";

const app = document.getElementById("app")!;

/** A link written for the team's old home on this page (`#team=code`, or `#t=code`) goes to its own
 *  page, with the filters it carried. True where it did, and the rest of the load has no business here. */
function leaveForTeam(): boolean {
  const params = hashParams();
  if (!params.get("t") && !params.get("team")) return false;
  location.replace(`./team${location.hash.replace(/(^#|&)team=/, "$1t=")}`);
  return true;
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

/** Which `refresh()` pass is the live one: an older pass checks it after every wait and stops. */
let generation = 0;

const route = (): void => {
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

async function boot(): Promise<void> {
  if (leaveForTeam()) return;
  // listening from the first moment: a link typed in over a table still loading is no less a team's
  addEventListener("hashchange", leaveForTeam);
  onRefresh(refresh);
  applyHash();
  await loadSolves();
  await refresh();
  syncHash(null);
  // the pool the first compare would otherwise wait on, brought up once the table is on screen
  // (a roster served whole from the shipped solves never asks for it during boot)
  const idle = globalThis.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 500));
  idle(() => { workerPool(); });

  // only a real navigation gets here — `syncHash()` writes fire nothing
  addEventListener("hashchange", () => {
    if (applyHash()) {
      void refresh();
      return;
    }
    // a hash that moved nothing is written back as it reads
    syncHash();
    route();
  });
  wireSourcePanels(app);
  // a team's rotation is a page of its own, opened with the filters the table is on
  document.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>(".gotodetail");
    if (el?.dataset.team) location.assign(pageUrl(el.dataset.team));
  });
}

boot().catch(showError);
