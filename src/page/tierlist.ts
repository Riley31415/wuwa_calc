/**
 * The Tier List page (tierlist.html): every resonator at the best team DPR they reach, in three
 * blocks — Main DPS (the team's main DPS), Sub DPS (not its main DPS, 1 vigor) and Support (not its
 * main DPS, 2 vigor), at the link's Team Cost and with Matrix Buffs on or off as the link says.
 * Rows are banded into tiers of roughly equal size, cut per Team Cost on the solves without Matrix.
 * Clicking a Best Team DPR heading switches to Best Team DPS (plain DPS), ranked and tiered on that.
 */
import { fmt } from "./display.js";
import { defaultFilters, hasBuild, bestKey } from "../solve/solver.js";
import type { Filters, TeamCost } from "../solve/solver.js";
import { TEAMS, RESONATOR_HUE, FALLBACK_HUE, bestPicks, loadSolves, saveSolves, filters, MATRIX_RESONATORS, applyHash, syncHash } from "./model.js";
import { costBox, matrixBox } from "./options.js";
import { paint } from "./pool.js";
import { overlay, overlayPhase, showError, ensureBestPicks } from "./loading.js";
import { TWO_VIGOR, esc, dprOf, pageOf, drawPage, wireHelp, openHelp, clearBuilds } from "./roster.js";

const app = document.getElementById("app")!;

/** A resonator's best team in one block: its figure (DPR, or DPS in DPS mode) and the team, for the label and the link. */
interface Entry { name: string; dpr: number; teamKey: string }
/** What the table ranks by: Best Team DPR (the default) or Best Team DPS — a heading's click flips it. */
let dpsMode = false;
/** The step every tier cut lands on: 100k DPR, or 1k DPS. */
const cutStep = (): number => (dpsMode ? 1_000 : 100_000);
const BLOCKS = ["Main DPS", "Sub DPS", "Support"] as const;
/** The tiers, best first. Where each starts is worked out per Team Cost (`cutsOf`). */
const TIERS = [
  { name: "T0", color: "#e5484d" },
  { name: "T1", color: "#f0883e" },
  { name: "T2", color: "#f0b444" },
  { name: "T3", color: "#45d6a4" },
  { name: "T4", color: "#5b9cff" },
];
/** The lowest figure each tier but the last takes, best first: always a multiple of `cutStep()`. */
let cuts: number[] = [];
const tierOf = (dpr: number): number => {
  const at = cuts.findIndex((from) => dpr >= from);
  return at < 0 ? TIERS.length - 1 : at;
};

/**
 * Cut points splitting `entries` into tiers of roughly equal size: each falls at its share of the
 * ranking, halfway in log between the last entry above it and the first below, then moved to the
 * multiple of 100k DPR either side of that whose count above comes nearer the even share — a
 * threshold, so a team's three members (who share a DPR) never split.
 */
function cutsOf(entries: Entry[]): number[] {
  const dprs = entries.map((e) => e.dpr).sort((a, b) => b - a);
  const out: number[] = [];
  for (let t = 1; t < TIERS.length; t++) {
    const share = (dprs.length * t) / TIERS.length;
    const at = Math.min(dprs.length - 1, Math.max(1, Math.round(share)));
    const step = cutStep();
    const mid = Math.sqrt(dprs[at - 1]! * dprs[at]!) / step;
    const off = (cut: number): number => Math.abs(dprs.filter((d) => d >= cut).length - share);
    const [down, up] = [Math.floor(mid) * step, Math.ceil(mid) * step];
    let cut = off(up) <= off(down) ? up : down;
    // two cuts rounding to one leave a tier empty: each sits at least a step under the last
    if (out.length && cut >= out[out.length - 1]!) cut = out[out.length - 1]! - step;
    out.push(cut);
  }
  return out;
}
let blocks: Entry[][] = [];

/** The page's filter state: the reader's Team Cost, and every Matrix or none. */
const tierFilters = (): Filters => ({ ...defaultFilters(), cost: filters.cost, matrix: [...filters.matrix] });
/** The same with no Matrix: what the tiers are cut on. */
const plainFilters = (): Filters => ({ ...defaultFilters(), cost: filters.cost });

/** Each block's resonators at their best team under `f`, best first. */
function blocksOf(f: Filters): Entry[][] {
  const best = BLOCKS.map(() => new Map<string, Entry>());
  for (const [teamKey, members] of Object.entries(TEAMS)) {
    if (!members.every((m) => hasBuild(m, f))) continue;
    const score = bestPicks.get(bestKey(teamKey, members, f))?.scores[0];
    if (!score) continue;
    const dpr = dpsMode ? score.total : dprOf(score.sectionTotals);
    for (const m of members) {
      const block = best[m.mainDps ? 0 : TWO_VIGOR.has(m.name) ? 2 : 1]!;
      if ((block.get(m.name)?.dpr ?? -1) < dpr) block.set(m.name, { name: m.name, dpr, teamKey });
    }
  }
  return best.map((block) => [...block.values()].sort((a, b) => b.dpr - a.dpr || a.name.localeCompare(b.name)));
}

/** The table under the page's filters, tiered by the cuts its Team Cost gives without Matrix Buffs —
 *  the same cuts either way, so turning the Matrix on shows who it lifts a tier. */
function compute(): void {
  cuts = cutsOf(blocksOf(plainFilters()).flat());
  blocks = blocksOf(tierFilters());
}

function render(): void {
  const cell = (e: Entry | undefined, i: number, band: string): string => {
    // a sliver of gap opens each block after the first, outside its hover group
    const gap = i ? `<div class="c tiergap${band}"></div>` : "";
    const start = band;
    if (!e) return `${gap}<div class="sec"><div class="c${start}"></div><div class="c${band}"></div></div>`;
    const href = pageOf(e.teamKey);
    const hue = RESONATOR_HUE.get(e.name) ?? FALLBACK_HUE;
    const figure = href ? `<a href="${esc(href)}">${fmt(e.dpr)}</a>` : fmt(e.dpr);
    // each block of a row its own box-less group, so a hover lights that block alone (index.css `.sec`)
    return `${gap}<div class="sec"><div class="c name res${start}" style="--mem:${hue};color:${hue}"><span class="res-label">${esc(e.name)}</span></div>`
      + `<div class="c num total${band}">${figure}</div></div>`;
  };
  // a band of rows per tier, as tall as its longest block, its name standing down the first column
  const body = TIERS.map((tier, t) => {
    const inTier = blocks.map((b) => b.filter((e) => tierOf(e.dpr) === t));
    const height = Math.max(...inTier.map((b) => b.length));
    if (!height) return "";
    return Array.from({ length: height }, (_, k) => {
      const band = k === 0 && t > 0 ? " bandstart" : "";
      // the tier's name, and a sliver of gap between it and the blocks, both standing down the band
      const label = k === 0 ? `<div class="c tier${band}" style="--tier:${tier.color};grid-row:span ${height}">${tier.name}</div>`
        + `<div class="c tiergap${band}" style="grid-row:span ${height}"></div>` : "";
      return `<div class="trow">${label}${inTier.map((b, i) => cell(b[k], i, band)).join("")}</div>`;
    }).join("");
  }).join("");
  const head = `<div class="c"></div><div class="c tiergap"></div>` + BLOCKS.map((title, i) => `${i ? `<div class="c tiergap"></div>` : ""}<div class="c">${title}</div><div class="c num modehead" title="Click to switch between Best Team DPR and Best Team DPS">Best Team ${dpsMode ? "DPS" : "DPR"}</div>`).join("");
  const boxes = matrixBox(filters.matrix.length > 0, openHelp.has("matrix")) + costBox(filters.cost, openHelp.has("cost"));
  drawPage(app, boxes, "", BLOCKS.length * 3 + 1, head, body);
}

wireHelp(app, render);

app.addEventListener("click", (e) => {
  if (!(e.target as Element).closest(".modehead")) return;
  dpsMode = !dpsMode;
  compute();
  render();
});

// both options live in the link, as the main page's do (`tc=`, `mx=`)
app.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.id === "cost") filters.cost = el.value as TeamCost;
  else if (el.id === "matrixToggle") filters.matrix = (el as HTMLInputElement).checked ? [...MATRIX_RESONATORS] : [];
  else return;
  syncHash(null);
  clearBuilds();
  load().catch(showError);
});

/** Which `load()` is the live one: an option changed while the last is still solving takes over. */
let generation = 0;

/** Solve whatever the filters need that isn't in hand, then rank and draw. */
async function load(): Promise<void> {
  const gen = ++generation;
  // the plain solves as well as the page's own: the tiers are cut on those
  for (const f of filters.matrix.length ? [plainFilters(), tierFilters()] : [plainFilters()]) {
    const teams = Object.entries(TEAMS).filter(([, members]) => members.every((m) => hasBuild(m, f)));
    await ensureBestPicks(teams, f, () => gen !== generation);
    if (gen !== generation) return;
  }
  saveSolves();
  await paint();
  compute();
  render();
  overlay.hidden = true;
}

async function boot(): Promise<void> {
  overlayPhase("Initializing…", true);
  // the options from the link as the main page reads them (`tc=`, `mx=`; s0r1 and no Matrix without
  // them), written back as they read; the team pages its links open run the same
  applyHash();
  syncHash(null);
  // a link typed in over the page is a page of its own
  addEventListener("hashchange", () => location.reload());
  await loadSolves();
  await load();
}

boot().catch(showError);
