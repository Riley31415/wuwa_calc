/**
 * What the roster pages (value.ts, tierlist.ts) share: vigor, a team's figure, its solved build and
 * page, a resonator's label in it, and the page around their tables — the README beside a heading
 * and one grid.
 */
import { solvedRows, pageUrl, memberLabel, filters } from "./model.js";
import type { TeamRow } from "./model.js";
import type { Filters } from "../solve/solver.js";
import { README } from "./readme.js";

/** The resonators that may stand in two teams (2 vigor); everyone else has 1. */
export const TWO_VIGOR = new Set(["Shorekeeper", "Mornye", "Suisui", "Lily", "Verina", "Buling"]);
/** The four Rover forms share one vigor, so an account fields one of them. */
export const isRover = (name: string): boolean => name.endsWith(" Rover");

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Team Avg DPR, the figure the main table ranks by. */
export const dprOf = (sectionTotals: number[]): number =>
  Math.floor(sectionTotals.reduce((a, b) => a + b, 0) / Math.max(1, sectionTotals.length));

/** A team at its solved build under the page's filters, as the table runs it — dropped whenever the
 *  filters move (`clearBuilds`). */
const builds = new Map<string, TeamRow | null>();
export const clearBuilds = (): void => builds.clear();
/** The filters a team's build is solved under: the page's own unless it scores with others (value.ts's
 *  every-Matrix filters, whose team links carry the Matrix in the team code rather than `mx=`). */
let buildFilters = (): Filters => filters;
export const setBuildFilters = (f: () => Filters): void => { buildFilters = f; builds.clear(); };
export function buildOf(teamKey: string): TeamRow | null {
  if (!builds.has(teamKey)) builds.set(teamKey, solvedRows(teamKey, buildFilters())[0] ?? null);
  return builds.get(teamKey)!;
}

/** A team's own page, at its solved build. */
export function pageOf(teamKey: string): string | null {
  const row = buildOf(teamKey);
  return row ? pageUrl(row.key) : null;
}

/** `name` as the table writes them in `teamKey`'s build — chain level, rank, Matrix, and its mode
 *  where `showMode` — or bare where the team doesn't field them. */
export function labelIn(teamKey: string, name: string, showMode: boolean): string {
  const row = buildOf(teamKey);
  const at = row ? row.members.findIndex((m) => m.name === name) : -1;
  return row && at >= 0 ? memberLabel(row.members[at]!, row.combo[at]!, false, showMode) : name;
}

/** Which aside boxes show their description; survives redraws. The README starts open, as the main page's does. */
export const openHelp = new Set<string>(["readme"]);

/** The page: the README aside with `boxes` under it, `heading`'s markup over the table, and a grid of
 *  `columns` tracks with `head` as its heading row and `body` its rows. Keeps the scroll where it was. */
export function drawPage(app: HTMLElement, boxes: string, heading: string, columns: number, head: string, body: string): void {
  const scroll = app.querySelector("main")?.scrollTop ?? 0;
  const open = openHelp.has("readme");
  const readme = `<div class="tcopt note${open ? " open" : ""}" data-note="readme"><div class="tcopt-head">`
    + `<button type="button" class="tcopt-name" data-help="readme" aria-expanded="${open}">README<span class="arrow">›</span></button></div>`
    + `<div class="tcopt-desc"${open ? "" : " hidden"}><ul>${README.map((l) => `<li>${l}</li>`).join("")}</ul></div></div>`;
  app.innerHTML = `<main><div class="tclayout">`
    + `<aside class="tcside"><div class="tcfilters"><div class="tcfilter-row note">${readme}${boxes}</div></div></aside>`
    + `<div class="tcbody">`
    + `<h2 class="summary-label" id="teamCount">${heading}</h2>`
    + `<div class="tcwrap"><div class="tgrid" style="grid-template-columns:repeat(${columns}, max-content)">`
    + `<div class="trow thead">${head}</div>${body}</div></div></div></div></main>`;
  const main = app.querySelector<HTMLElement>("main")!;
  const label = app.querySelector<HTMLElement>(".tcbody > .summary-label")!;
  main.style.setProperty("--headtop", `${label.offsetHeight}px`);
  main.scrollTop = scroll;
}

/** Every aside box's name opening and closing its description, redrawing the page with `redraw`. */
export function wireHelp(app: HTMLElement, redraw: () => void): void {
  app.addEventListener("click", (e) => {
    const id = (e.target as Element).closest<HTMLElement>(".tcopt-name[data-help]")?.dataset.help;
    if (!id) return;
    if (!openHelp.delete(id)) openHelp.add(id);
    redraw();
  });
}
