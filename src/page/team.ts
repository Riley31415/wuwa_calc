/**
 * The team page (team.html): one team's rotation and loadout, named by the `t=` code in the hash
 * beside the filters it was opened under. A page with no team, or one this roster doesn't have,
 * goes to the comparison page.
 */
import { runTeam } from "../solve/teamrun.js";
import {
  TEAMS, filters, results, discardRestoredSolves, loadSolves, saveSolves, applyHash, syncHash, hashTeam, pageUrl,
  rowFromKey, solvedRows, admitBuild, reopenDetail, tagTeam, gearShut,
} from "./model.js";
import { wireSourcePanels } from "./panels.js";
import { renderDetail } from "./detail.js";
import { onSwitch, onSolve } from "./pickmenu.js";
import type { Attempt } from "./pickmenu.js";
import { maybeShowTutorial } from "./tutorial.js";
import { paint, workerPool, cancelQueued } from "./pool.js";
import { overlayPhase, overlayNow, overlayHide, showError, barReset, ensureBestPicks, solveQuiet } from "./loading.js";

const app = document.getElementById("app")!;
const backLink = document.getElementById("backLink")!;

/** Where the reader came from, when it was a page of this site: Back goes there rather than to a table they didn't ask for. */
const came = (() => {
  const from = document.referrer ? new URL(document.referrer) : null;
  if (!from || from.origin !== location.origin) return null;
  return /\/value(\.html)?$/.test(from.pathname) ? "value" : /\/team(\.html)?$/.test(from.pathname) ? null : "table";
})();
/** Whether a pick here moved the filters, which the table the reader came from then has to catch up to. */
let moved = false;

const show = (key: string): void => {
  renderDetail(key);
  // the tutorial's later stages belong to this page; the earlier ones take themselves down for it
  maybeShowTutorial();
};

/** Which `switchTo()` pass is the live one: an older pass checks it after every wait and stops. */
let generation = 0;

/** A pick (pickmenu.ts): solve the one team under each try's filters in turn and open the first row
 *  one names. `undo` puts the filters back if none. */
async function switchTo(teamKey: string, attempts: Attempt[], undo: () => void): Promise<void> {
  const gen = ++generation;
  const stale = (): boolean => gen !== generation;
  cancelQueued();
  barReset();
  try {
    for (const attempt of attempts) {
      if (!attempt.setUp()) continue;
      moved = true;
      await ensureBestPicks([[teamKey, TEAMS[teamKey]!]], structuredClone(filters), stale);
      if (stale()) return;
      saveSolves();
      const row = attempt.choose(solvedRows(teamKey));
      if (!row) continue;
      // a teammate re-picked past the guess the pick was costed on can still trip a filter
      admitBuild(row.members, row.combo);
      await overlayNow("Running Rotation…", 1);
      if (stale()) return;
      reopenDetail(row.key);
      show(row.key);
      overlayHide();
      return;
    }
  } catch (err) {
    if (!stale()) showError(err);
    return;
  }
  undo();
  overlayHide();
}

/** The hash's team, run and drawn. A team code leaving gear to the solver reads back once that one
 *  team is solved with its gear compares shut. False where the hash names no team this roster has. */
async function bootDetail(): Promise<boolean> {
  let key = hashTeam();
  const pending = key && !rowFromKey(key) ? tagTeam(key) : null;
  if (pending) {
    overlayPhase("Solving Team…", true);
    await paint();
    await solveQuiet(pending, gearShut(filters));
    key = hashTeam();
  }
  const row = key ? rowFromKey(key) : null;
  if (!key || !row) return false;
  overlayPhase("Running Rotation…", true);
  await paint();
  results.set(key, runTeam(row.teamKey, row.members, row.combo, true));
  renderDetail(key);
  overlayHide();
  maybeShowTutorial();
  return true;
}

async function boot(): Promise<void> {
  onSwitch(switchTo);
  onSolve(solveQuiet);
  applyHash();
  await loadSolves();
  let shown = await bootDetail().catch((err: unknown) => {
    if (!discardRestoredSolves()) throw err;
    console.warn("restored solves failed to load; solving the roster here instead", err);
    return null;
  });
  // a restored solve that no longer fit is retried once without any
  if (shown === null) shown = await bootDetail();
  if (!shown) {
    location.replace("./");
    return;
  }
  // the code as it reads, a gear part that didn't read gone
  syncHash();
  const idle = globalThis.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 500));
  idle(() => { workerPool(); });

  // only a real navigation gets here — `syncHash()` writes fire nothing: another team's link was typed in
  addEventListener("hashchange", () => location.reload());
  wireSourcePanels(app);
  backLink.addEventListener("click", (e) => {
    e.preventDefault();
    // the page it came from is still there to go back to, unless a pick moved the filters it was on
    if (came === "value" || (came === "table" && !moved)) {
      history.back();
      return;
    }
    location.assign(pageUrl(null));
  });
}

boot().catch(showError);
