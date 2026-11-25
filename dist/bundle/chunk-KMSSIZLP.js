import {
  README,
  filters,
  memberLabel,
  pageUrl,
  solvedRows
} from "./chunk-OXAR545D.js";

// dist/src/page/roster.js
var TWO_VIGOR = /* @__PURE__ */ new Set(["Shorekeeper", "Mornye", "Suisui", "Lily", "Verina", "Buling", "Baizhi"]);
var isRover = (name) => name.endsWith(" Rover");
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var dprOf = (sectionTotals) => Math.floor(sectionTotals.reduce((a, b) => a + b, 0) / Math.max(1, sectionTotals.length));
var builds = /* @__PURE__ */ new Map();
var clearBuilds = () => builds.clear();
var buildFilters = () => filters;
var setBuildFilters = (f) => {
  buildFilters = f;
  builds.clear();
};
function buildOf(teamKey) {
  if (!builds.has(teamKey))
    builds.set(teamKey, solvedRows(teamKey, buildFilters())[0] ?? null);
  return builds.get(teamKey);
}
function pageOf(teamKey) {
  const row = buildOf(teamKey);
  return row ? pageUrl(row.key) : null;
}
function labelIn(teamKey, name, showMode) {
  const row = buildOf(teamKey);
  const at = row ? row.members.findIndex((m) => m.name === name) : -1;
  return row && at >= 0 ? memberLabel(row.members[at], row.combo[at], false, showMode) : name;
}
var openHelp = /* @__PURE__ */ new Set(["readme"]);
function drawPage(app, boxes, heading, columns, head, body) {
  const scroll = app.querySelector("main")?.scrollTop ?? 0;
  const open = openHelp.has("readme");
  const readme = `<div class="tcopt note${open ? " open" : ""}" data-note="readme"><div class="tcopt-head"><button type="button" class="tcopt-name" data-help="readme" aria-expanded="${open}">README<span class="arrow">\u203A</span></button></div><div class="tcopt-desc"${open ? "" : " hidden"}><ul>${README.map((l) => `<li>${l}</li>`).join("")}</ul></div></div>`;
  app.innerHTML = `<main><div class="tclayout"><aside class="tcside"><div class="tcfilters"><div class="tcfilter-row note">${readme}${boxes}</div></div></aside><div class="tcbody"><h2 class="summary-label" id="teamCount">${heading}</h2><div class="tcwrap"><div class="tgrid" style="grid-template-columns:repeat(${columns}, max-content)"><div class="trow thead">${head}</div>${body}</div></div></div></div></main>`;
  const main = app.querySelector("main");
  const label = app.querySelector(".tcbody > .summary-label");
  main.style.setProperty("--headtop", `${label.offsetHeight}px`);
  main.scrollTop = scroll;
}
function wireHelp(app, redraw) {
  app.addEventListener("click", (e) => {
    const id = e.target.closest(".tcopt-name[data-help]")?.dataset.help;
    if (!id)
      return;
    if (!openHelp.delete(id))
      openHelp.add(id);
    redraw();
  });
}

export {
  TWO_VIGOR,
  isRover,
  esc,
  dprOf,
  clearBuilds,
  setBuildFilters,
  buildOf,
  pageOf,
  labelIn,
  openHelp,
  drawPage,
  wireHelp
};
