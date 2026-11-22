import {
  maybeShowTutorial,
  onRefresh,
  renderComparison,
  wireSourcePanels
} from "./chunk-NCL6WAZD.js";
import {
  TEAMS,
  applyHash,
  barProgress,
  barReset,
  bestPicks,
  breathe,
  cancelQueued,
  discardRestoredSolves,
  ensureBestPicks,
  filters,
  hashParams,
  loadSolves,
  overlayHide,
  overlayNow,
  overlayPhase,
  pageUrl,
  paint,
  results,
  saveSolves,
  setVisibleRows,
  showError,
  syncHash,
  teamRows,
  teamWanted,
  visibleRows,
  workerPool
} from "./chunk-DU4TDG6K.js";
import {
  bestKey,
  runTeam
} from "./chunk-RLABIZFI.js";

// dist/src/page/index.js
var app = document.getElementById("app");
function leaveForTeam() {
  const params = hashParams();
  if (!params.get("t") && !params.get("team"))
    return false;
  location.replace(`./team${location.hash.replace(/(^#|&)team=/, "$1t=")}`);
  return true;
}
async function runMissing(rows, stale) {
  const missing = rows.filter((row) => !results.has(row.key));
  if (!missing.length)
    return;
  overlayPhase("Running Rotations\u2026", true);
  const cached = rows.length - missing.length;
  barProgress(cached, rows.length);
  for (let i = 0; i < missing.length; i++) {
    if (stale())
      return;
    const row = missing[i];
    results.set(row.key, runTeam(row.teamKey, row.members, row.combo));
    barProgress(cached + i + 1, rows.length);
    await breathe();
  }
  await paint();
}
var generation = 0;
var route = () => {
  renderComparison();
  maybeShowTutorial();
};
async function refresh() {
  const gen = ++generation;
  const stale = () => gen !== generation;
  cancelQueued();
  const f = structuredClone(filters);
  barReset();
  try {
    const inPlay = Object.entries(TEAMS).filter(([key, members]) => teamWanted(key, members));
    if (inPlay.some(([key, members]) => !bestPicks.has(bestKey(key, members, f))))
      workerPool();
    if (!visibleRows.length)
      route();
    await ensureBestPicks(inPlay, f, stale);
    if (stale())
      return;
    saveSolves();
    const rows = teamRows();
    const cached = rows.filter((row) => results.has(row.key));
    const missing = cached.length !== rows.length;
    if (!missing && cached.length) {
      await overlayNow("Rendering Table...", rows.length);
      if (stale())
        return;
      barProgress(rows.length, rows.length);
      setVisibleRows(cached);
      route();
    } else if (!missing) {
      setVisibleRows([]);
      route();
    }
    await runMissing(rows, stale);
    if (stale())
      return;
    if (missing) {
      await overlayNow("Rendering Table\u2026", rows.length);
      if (stale())
        return;
      setVisibleRows(rows);
      route();
    }
  } catch (err) {
    if (stale())
      return;
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
  maybeShowTutorial();
}
async function boot() {
  if (leaveForTeam())
    return;
  addEventListener("hashchange", leaveForTeam);
  onRefresh(refresh);
  applyHash();
  await loadSolves();
  await refresh();
  syncHash(null);
  const idle = globalThis.requestIdleCallback ?? ((fn) => setTimeout(fn, 500));
  idle(() => {
    workerPool();
  });
  addEventListener("hashchange", () => {
    if (applyHash()) {
      void refresh();
      return;
    }
    syncHash();
    route();
  });
  wireSourcePanels(app);
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".gotodetail");
    if (el?.dataset.team)
      location.assign(pageUrl(el.dataset.team));
  });
}
boot().catch(showError);
