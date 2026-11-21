import {
  TWO_VIGOR,
  clearBuilds,
  dprOf,
  drawPage,
  esc,
  openHelp,
  pageOf,
  wireHelp
} from "./chunk-EPD3HQ3L.js";
import {
  FALLBACK_HUE,
  MATRIX_RESONATORS,
  RESONATOR_HUE,
  TEAMS,
  applyHash,
  bestPicks,
  costBox,
  ensureBestPicks,
  filters,
  fmt,
  loadSolves,
  matrixBox,
  overlay,
  overlayPhase,
  paint,
  saveSolves,
  showError,
  syncHash
} from "./chunk-RUPMSA6L.js";
import {
  bestKey,
  defaultFilters,
  hasBuild
} from "./chunk-4CKV7HFV.js";

// dist/src/page/tierlist.js
var app = document.getElementById("app");
var dpsMode = false;
var cutStep = () => dpsMode ? 1e3 : 1e5;
var BLOCKS = ["Main DPS", "Sub DPS", "Support"];
var TIERS = [
  { name: "T0", color: "#e5484d" },
  { name: "T1", color: "#f0883e" },
  { name: "T2", color: "#f0b444" },
  { name: "T3", color: "#45d6a4" },
  { name: "T4", color: "#5b9cff" }
];
var cuts = [];
var tierOf = (dpr) => {
  const at = cuts.findIndex((from) => dpr >= from);
  return at < 0 ? TIERS.length - 1 : at;
};
function cutsOf(entries) {
  const dprs = entries.map((e) => e.dpr).sort((a, b) => b - a);
  const out = [];
  for (let t = 1; t < TIERS.length; t++) {
    const share = dprs.length * t / TIERS.length;
    const at = Math.min(dprs.length - 1, Math.max(1, Math.round(share)));
    const step = cutStep();
    const mid = Math.sqrt(dprs[at - 1] * dprs[at]) / step;
    const off = (cut2) => Math.abs(dprs.filter((d) => d >= cut2).length - share);
    const [down, up] = [Math.floor(mid) * step, Math.ceil(mid) * step];
    let cut = off(up) <= off(down) ? up : down;
    if (out.length && cut >= out[out.length - 1])
      cut = out[out.length - 1] - step;
    out.push(cut);
  }
  return out;
}
var blocks = [];
var tierFilters = () => ({ ...defaultFilters(), cost: filters.cost, matrix: [...filters.matrix] });
var plainFilters = () => ({ ...defaultFilters(), cost: filters.cost });
function blocksOf(f) {
  const best = BLOCKS.map(() => /* @__PURE__ */ new Map());
  for (const [teamKey, members] of Object.entries(TEAMS)) {
    if (!members.every((m) => hasBuild(m, f)))
      continue;
    const score = bestPicks.get(bestKey(teamKey, members, f))?.scores[0];
    if (!score)
      continue;
    const dpr = dpsMode ? score.total : dprOf(score.sectionTotals);
    for (const m of members) {
      const block = best[m.mainDps ? 0 : TWO_VIGOR.has(m.name) ? 2 : 1];
      if ((block.get(m.name)?.dpr ?? -1) < dpr)
        block.set(m.name, { name: m.name, dpr, teamKey });
    }
  }
  return best.map((block) => [...block.values()].sort((a, b) => b.dpr - a.dpr || a.name.localeCompare(b.name)));
}
function compute() {
  cuts = cutsOf(blocksOf(plainFilters()).flat());
  blocks = blocksOf(tierFilters());
}
function render() {
  const cell = (e, i, band) => {
    const gap = i ? `<div class="c tiergap${band}"></div>` : "";
    const start = band;
    if (!e)
      return `${gap}<div class="sec"><div class="c${start}"></div><div class="c${band}"></div></div>`;
    const href = pageOf(e.teamKey);
    const hue = RESONATOR_HUE.get(e.name) ?? FALLBACK_HUE;
    const figure = href ? `<a href="${esc(href)}">${fmt(e.dpr)}</a>` : fmt(e.dpr);
    return `${gap}<div class="sec"><div class="c name res${start}" style="--mem:${hue};color:${hue}"><span class="res-label">${esc(e.name)}</span></div><div class="c num total${band}">${figure}</div></div>`;
  };
  const body = TIERS.map((tier, t) => {
    const inTier = blocks.map((b) => b.filter((e) => tierOf(e.dpr) === t));
    const height = Math.max(...inTier.map((b) => b.length));
    if (!height)
      return "";
    return Array.from({ length: height }, (_, k) => {
      const band = k === 0 && t > 0 ? " bandstart" : "";
      const label = k === 0 ? `<div class="c tier${band}" style="--tier:${tier.color};grid-row:span ${height}">${tier.name}</div><div class="c tiergap${band}" style="grid-row:span ${height}"></div>` : "";
      return `<div class="trow">${label}${inTier.map((b, i) => cell(b[k], i, band)).join("")}</div>`;
    }).join("");
  }).join("");
  const head = `<div class="c"></div><div class="c tiergap"></div>` + BLOCKS.map((title, i) => `${i ? `<div class="c tiergap"></div>` : ""}<div class="c">${title}</div><div class="c num modehead" title="Click to switch between Best Team DPR and Best Team DPS">Best Team ${dpsMode ? "DPS" : "DPR"}</div>`).join("");
  const boxes = matrixBox(filters.matrix.length > 0, openHelp.has("matrix")) + costBox(filters.cost, openHelp.has("cost"));
  drawPage(app, boxes, "", BLOCKS.length * 3 + 1, head, body);
}
wireHelp(app, render);
app.addEventListener("click", (e) => {
  if (!e.target.closest(".modehead"))
    return;
  dpsMode = !dpsMode;
  compute();
  render();
});
app.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "cost")
    filters.cost = el.value;
  else if (el.id === "matrixToggle")
    filters.matrix = el.checked ? [...MATRIX_RESONATORS] : [];
  else
    return;
  syncHash(null);
  clearBuilds();
  load().catch(showError);
});
var generation = 0;
async function load() {
  const gen = ++generation;
  for (const f of filters.matrix.length ? [plainFilters(), tierFilters()] : [plainFilters()]) {
    const teams = Object.entries(TEAMS).filter(([, members]) => members.every((m) => hasBuild(m, f)));
    await ensureBestPicks(teams, f, () => gen !== generation);
    if (gen !== generation)
      return;
  }
  saveSolves();
  await paint();
  compute();
  render();
  overlay.hidden = true;
}
async function boot() {
  overlayPhase("Initializing\u2026", true);
  applyHash();
  syncHash(null);
  addEventListener("hashchange", () => location.reload());
  await loadSolves();
  await load();
}
boot().catch(showError);
