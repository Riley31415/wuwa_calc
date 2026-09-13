/**
 * The first-run tutorial, five stages of it, each moved on by the reader doing what it asks:
 *
 *   1  show one resonator's teams      2  run a comparison on them
 *   3  add a filter from the search    4  take a filter back off
 *   5  open a team's rotation, which is the last of it
 *
 * The first two stand beside the table and point into the first row's third member — into the line
 * of the menu that does the thing, whenever one is open over it. The rest stand under the filters
 * and point into the search bar, the first filter bubble, and the first row's rotation link.
 *
 * Two of them stand on a filter rather than on a press, and step back when it is taken off again
 * (`settle()`): a reader who removes the resonator they showed is back at stage one, and one who
 * clears every bubble is back at the search. Everything is fixed to the viewport and measured once
 * per draw, so scrolling the table underneath leaves the card and its arrow where they are rather
 * than dragging them off the top of the page.
 *
 * It is shown to everyone who has not clicked "Don't show again" — there is no other flag, so a
 * reader who has never seen it and one who dismissed an earlier visit are told apart by that click
 * alone, dev.py included. The README's own line is the way back into it once it has been put away.
 */
import { AXES, scopedKey } from "../solver.js";
import { searchChoice } from "./filterbar.js";
import { filters, resonatorFilters } from "./model.js";
import { rect, CLICKING, CLICK } from "./panels.js";
import { rowElementAt } from "./table.js";

const DONE_KEY = "wuwa.tutorialDone";
const STAGE_KEY = "wuwa.tutorialStage";

/** Dismissed within this load, by either line — the stored flag is what carries a dismissal across
 *  loads, and this is what holds it inside one, a local host's always-show included. */
let done = false;

/** A browser with no storage to read has nothing saying it was dismissed, so it is shown there. */
function dismissed(): boolean {
  if (done) return true;
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

const TEXT = [
  `Try ${CLICKING} on a resonator to show only their teams`,
  `${CLICK} that resonator again and compare their weapons`,
  "Search to add another resonator or comparison",
  `Try ${CLICKING} a filter bubble to remove it`,
  "Try viewing a team's rotation and loadout",
  "Hover over equipment to see its stats and buffs",
  `${CLICK} on a member's damage number to see their damage distribution and node leveling priority`,
  `${CLICK} on the team total for a loop to see the damage over time graph and strongest actions`,
  "Scroll down to read the rotation, buffs, and stats",
];
/** The stage the rotation page's own begin at: below this the card belongs to the comparison
 *  table, at or above it to the rotation page, and it waits out of sight on the other one. */
const DETAIL_STAGE = 5;
/** The head's own length: the line stops this far short of what it points at, so the head's back
 *  edge is where the line ends and its tip is what lands on the target. */
const HEAD = 14;

/** Every resonator being shown and every comparison open, as the flat keys the first two stages
 *  watch for something new. */
const shownNow = (): string[] =>
  [...resonatorFilters].filter(([, mode]) => mode === "include").map(([name]) => name);
const comparedNow = (): string[] =>
  [...filters.scoped.map(scopedKey), ...AXES.flatMap((axis) => filters[axis].map((name) => `${axis}|${name}`))];

/** What was already on the page when the tutorial started. Those two stages ask the reader to show
 *  a resonator and to run a comparison, so a page that arrives with both must not pass them on
 *  sight: only a filter that was not there at the start counts. Restarting takes the mark again,
 *  which is what makes the pair ask for a fresh one every time through. */
let shownBefore = new Set<string>();
let comparedBefore = new Set<string>();
function baseline(): void {
  shownBefore = new Set(shownNow());
  comparedBefore = new Set(comparedNow());
}
/** ...and a filter taken back off drops out of that mark, so putting the same one on again counts
 *  as adding it rather than as something that was always there. */
function added(now: string[], before: Set<string>): boolean {
  for (const key of before) if (!now.includes(key)) before.delete(key);
  return now.some((key) => !before.has(key));
}
const showing = (): boolean => added(shownNow(), shownBefore);
const comparing = (): boolean => added(comparedNow(), comparedBefore);
const firstChip = (): HTMLElement | null => document.querySelector(".tcchips .rchip");

/** The third member's substats in the Equipment table, and their Total in the damage one — what
 *  the rotation page's two stages point at. */
function substatsCell(): HTMLElement | null {
  const row = [...document.querySelectorAll<HTMLElement>(".rtable.loadout .rtrow")]
    .find((r) => r.querySelector(".c.lbl")?.textContent === "Substats");
  const cells = [...row?.children ?? []].filter((c) => !c.classList.contains("lbl"));
  return (cells[2] ?? cells[cells.length - 1] ?? null) as HTMLElement | null;
}
function totalCell(): HTMLElement | null {
  const rows = [...document.querySelectorAll<HTMLElement>(".rtable.dpr .rtrow:not(.rthead):not(.total)")];
  return (rows[2] ?? rows[rows.length - 1])?.querySelector<HTMLElement>(`[data-dist$="|4"]`) ?? null;
}
/** The team's own row at Loop 3 — section three of the four the columns run through. */
const loopCell = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(`.rtable.dpr .rtrow.total [data-dist$="|3"]`);
/** The `n`th line of the action log, counting the rotation's own steps alone: a chain's parts and
 *  its spill follow-ups are rows inside one of those rather than lines of their own. */
function actionRow(n: number): HTMLElement | null {
  const rows = [...document.querySelectorAll<HTMLElement>(".rotation-block .grid .r")]
    .filter((r) => !r.classList.contains("head") && !r.classList.contains("totalrow")
      && !r.closest(".parts") && !r.closest(".spill"));
  const row = rows[n] ?? rows[rows.length - 1];
  // the line's own Action cell, not the whole line: the arrow stands in that column rather than
  // wherever down the middle of the screen the card happens to be
  return row?.querySelector<HTMLElement>(".c.action") ?? row ?? null;
}
/** ...and how far down it the last stage asks the reader to go: the log's own top, seven tenths of
 *  the way up the screen — three tenths down from the top of it. */
function scrolledFar(): boolean {
  const main = document.querySelector("main");
  const log = document.querySelector(".rotation-block .gridwrap");
  if (!main || !log) return false;
  const mainR = rect(main);
  return rect(log).top <= mainR.top + mainR.height * 0.3;
}

/** How far in the reader is, kept across reloads: a refresh in the middle of the tutorial picks it
 *  up where it was rather than starting over. A stage belonging to the other page simply waits
 *  there (`maybeShowTutorial`), and the two that stand on a filter settle against what the restored
 *  filters actually show (`settle`). */
function restoreStage(): number {
  try {
    const n = Number(localStorage.getItem(STAGE_KEY));
    return Number.isInteger(n) && n >= 0 && n < TEXT.length ? n : 0;
  } catch {
    return 0;
  }
}
function setStage(n: number): void {
  stage = n;
  try {
    localStorage.setItem(STAGE_KEY, String(n));
  } catch { /* no storage — it starts over next load, which is the best this can do */ }
}

let stage = restoreStage();
let layer: HTMLElement | null = null;
const overlay = document.getElementById("loading");

/** Settle the stage against what the page is actually showing. Two of them are held up by a filter
 *  rather than by a press, so they are reached the moment it is set and given up the moment it is
 *  taken off — the reader is never asked to compare a resonator they have since stopped showing. */
function settle(): void {
  if (stage === 0 && showing()) setStage(1);
  else if (stage === 1 && !showing()) setStage(0);
  if (stage === 1 && comparing()) setStage(2);
  if (stage === 3 && !firstChip()) setStage(2);
}

function build(): HTMLElement {
  const el = document.createElement("div");
  el.className = "tut";
  el.innerHTML = `<svg class="tut-arrow" aria-hidden="true">`
    // `userSpaceOnUse`, so the head stays 14px whatever the line's width, and `refX="0"` puts its
    // back edge where the line ends rather than straddling the point with its middle
    + `<defs><marker id="tutHead" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="12"`
    + ` refX="0" refY="6" orient="auto"><path d="M0,0 L14,6 L0,12 Z"></path></marker></defs>`
    + `<path class="tut-path" marker-end="url(#tutHead)" d=""></path></svg>`
    + `<div class="tut-box" role="dialog" aria-label="Tutorial">`
    + `<p></p>`
    + `<div class="tut-buttons"><button type="button" class="tut-skip">Don't show again</button></div>`
    + `</div>`;
  el.querySelector(".tut-skip")!.addEventListener("click", () => {
    done = true;
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch { /* no storage — it comes back next load, which is the best this can do */ }
    hideTutorial();
  });
  return el;
}

/** The thin dotted ring on whatever the arrow is pointing at (index.css's own `.tut-target`) — the
 *  cell, bubble, search bar or menu line the card is asking for, marked wherever it stands. */
function mark(anchor: Element | null | undefined): void {
  for (const el of document.querySelectorAll(".tut-target")) el.classList.remove("tut-target");
  anchor?.classList.add("tut-target");
}

/** On the rotation page the card stands at the top middle of the screen — over the page's own
 *  header a little, which is the one thing above the tables it points into. Everything it points at
 *  is below it, so every arrow leaves the same edge, the bottom. */
function placeDetail(box: HTMLElement, path: SVGPathElement, mainR: DOMRect): void {
  const width = Math.max(240, Math.min(330, mainR.width - 24));
  box.style.width = `${width}px`;
  box.style.left = `${mainR.left + (mainR.width - width) / 2}px`;
  box.style.top = `8px`;

  const anchor = stage === DETAIL_STAGE ? substatsCell()
    : stage === DETAIL_STAGE + 1 ? totalCell()
    : stage === DETAIL_STAGE + 2 ? loopCell()
    : actionRow(19);
  mark(anchor);
  const anchorR = anchor ? rect(anchor) : null;
  if (!anchorR) {
    path.setAttribute("d", "");
    return;
  }
  const boxR = rect(box);
  const [bx, by] = [boxR.left + boxR.width / 2, boxR.bottom];

  // A table wider or longer than the screen carries the cell off the side or the bottom of it — a
  // narrow window, or a log ten actions down, which is the whole point of the stage that asks for a
  // scroll. The arrow runs to the edge it went out by and points the way it lies, and the scroll
  // brings the cell itself back under the head.
  const side = anchorR.left > mainR.right - 16 ? 1 : anchorR.right < mainR.left + 16 ? -1 : 0;
  if (side) {
    const tx = side > 0 ? mainR.right - 4 : mainR.left + 4;
    const ty = Math.min(Math.max(anchorR.top + anchorR.height / 2, by + 40), mainR.bottom - 20);
    const end = tx - side * HEAD;
    path.setAttribute("d", `M ${bx} ${by} C ${bx} ${by + 60}, ${end - side * 60} ${ty}, ${end} ${ty}`);
    return;
  }
  // the damage table's own two stages come in level, at the cell's left edge, where the rest drop
  // onto the top of what they point at
  if (stage === DETAIL_STAGE + 1 || stage === DETAIL_STAGE + 2) {
    const tx = anchorR.left - 4, ty = anchorR.top + anchorR.height / 2;
    path.setAttribute("d", `M ${bx} ${by} C ${bx} ${by + 60}, ${tx - HEAD - 60} ${ty}, ${tx - HEAD} ${ty}`);
    return;
  }
  // straight down the cell's own column into its top edge, or as far as the screen goes
  const tx = anchorR.left + anchorR.width / 2;
  const ty = Math.min(anchorR.top - 4, mainR.bottom - 4);
  const bend = Math.max(12, Math.min(70, (ty - HEAD - by) * 0.5));
  path.setAttribute("d", `M ${bx} ${by} C ${bx} ${by + bend}, ${tx} ${ty - HEAD - bend}, ${tx} ${ty - HEAD}`);
}

/** Put this stage's card where it belongs and draw its arrow into whatever it points at. */
function place(): void {
  // hidden as well as absent: every deferred caller below queues a frame while the card is still
  // up, and a dismissal landing in between would otherwise have that frame mark a ring back onto
  // the page the card has just left (the captured `remeasure` runs ahead of the skip button's own
  // handler on the very click that puts it away)
  if (!layer || layer.hidden) return;
  settle();
  const box = layer.querySelector<HTMLElement>(".tut-box")!;
  const path = layer.querySelector<SVGPathElement>(".tut-path")!;
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return;
  layer.querySelector("p")!.textContent = TEXT[stage]!;
  if (stage >= DETAIL_STAGE) {
    placeDetail(box, path, rect(main));
    return;
  }
  const layout = document.querySelector<HTMLElement>(".tclayout");
  const table = document.querySelector<HTMLElement>(".tcbody");
  const filterbar = document.querySelector<HTMLElement>(".tcfilters");
  const search = document.querySelector<HTMLElement>(".tcsearch");
  if (!layout || !table || !filterbar || !search) return;

  // What the card points into, stage by stage. The first two take the line of the menu that does
  // what they are asking for whenever one is open — the menu stands over the row anyway — and the
  // third member's own column the rest of the time: the first row of it while the table is at the
  // top, and whichever row has scrolled up to the header once it is not, so the arrow always has a
  // cell on screen to land on. A row is `display: contents` (index.css) and so has no box of its
  // own: the cells inside it are what carry the geometry.
  const stacked = layout.classList.contains("stack");
  const items = [...document.querySelector(".ctxmenu:not(.rowcap)")?.querySelectorAll<HTMLElement>(".ctxitem") ?? []];
  const compares = items.filter((item) => item.textContent?.startsWith("Compare"));
  const line = stage === 0 ? items[0]
    : compares.find((item) => item.textContent?.includes("weapon")) ?? compares[0];
  const headCell = document.querySelector(".tgrid .trow.thead .c");
  const below = headCell ? rect(headCell).bottom : rect(main).top;
  // Down the third member's column from the top of the window: the first cell standing clear of the
  // pinned header, and — for the stage asking for a resonator to be shown — the first of those whose
  // resonator is not showing already, since pointing at one the reader has shown asks for nothing.
  const already = new Set(shownNow());
  let first: HTMLElement | undefined;
  let fresh: HTMLElement | undefined;
  for (const row of document.querySelectorAll(".tgrid .trow[data-team]")) {
    const cells = [...row.querySelectorAll<HTMLElement>(".c.name.res")];
    const cell = cells[2] ?? cells[cells.length - 1];
    if (!cell || rect(cell).top < below - 1) continue;
    first ??= cell;
    // the third member of every row is the same resonator once that resonator is what the table is
    // filtered to, so a row with nobody fresh in that column is asked for its other two
    const spare = already.has(cell.dataset.resonator ?? "") ? cells.find((c) => !already.has(c.dataset.resonator ?? "")) : cell;
    if (!spare) continue;
    fresh = spare;
    break;
  }
  const column = (stage === 0 ? fresh : undefined) ?? first;
  // the bubbles wrap into rows of their own on a narrow window, where the card stands under them
  // and the last one is the one nearest it
  const chips = [...document.querySelectorAll<HTMLElement>(".tcchips .rchip")];
  const anchor = stage === 2 ? search
    : stage === 3 ? (stacked ? chips[chips.length - 1] : chips[0])
    : stage === 4 ? rowElementAt(0)?.querySelector(".gotodetail")
    : line ?? column;
  mark(anchor);
  const anchorR = anchor ? rect(anchor) : null;

  // What the card centres between: the filters, for every stage past the second and for those two
  // as well once the window is too narrow to stand them beside the table (`fitSide()`'s `stack`);
  // else the empty band the table is centred against (index.css's own `.tclayout::before`).
  const mainR = rect(main), layoutR = rect(layout), tableR = rect(table), filterR = rect(filterbar);
  const aside = stage > 1 || stacked;
  const [from, to] = aside ? [filterR.left, filterR.right] : [layoutR.left, tableR.left];
  const width = Math.max(240, Math.min(330, to - from - 40));
  box.style.width = `${width}px`;
  const boxH = rect(box).height;
  // centred in whichever it is, but never off the side of the screen: a window with the aside
  // still beside the table and barely any band left keeps the card in view over the table's own
  // left edge rather than half of it hanging off the page
  // ...except the last stage on a stacked layout, which stands at the page's left edge: it points
  // into a cell out at the far right of the table, and the room it leaves beside itself is the room
  // its arrow has to run in
  const middle = Math.min(Math.max((from + to - width) / 2, mainR.left + 12), mainR.right - width - 12);
  box.style.left = `${stacked && stage === 4 ? mainR.left + 12 : middle}px`;
  // hard under the filters wherever it stands over the page, and a fifth of the way down the screen
  // where it stands beside the table instead
  // ...and below the search bar's own list while that is open, which the filters' own bottom edge
  // knows nothing about: the list floats over the page rather than standing in it
  const list = document.getElementById("searchResults");
  const listR = list?.childElementCount ? rect(list) : null;
  const under = stage === 2 && listR ? Math.max(filterR.bottom, listR.bottom) : filterR.bottom;
  const top = aside ? under + 16 : mainR.top + mainR.height * 0.2;
  // Stacked, the filters end barely a row above the table, so a card standing under them covers the
  // very cell it points into. It is lifted whatever that takes — over the bottom of the filters
  // rather than over the table — since a cell the card hides is a cell nobody can be shown.
  const clear = stacked && stage < 2 && anchorR ? Math.min(top, anchorR.top - boxH - 40) : top;
  box.style.top = `${Math.min(Math.max(clear, mainR.top + 12), mainR.bottom - boxH - 12)}px`;

  // Nothing to draw with no anchor at all, or with a redraw catching it scrolled off the table.
  // Sideways too — except the rotation link, which a narrow window carries off the right of the
  // scrollport on every row and which is pointed at as far as the screen goes instead (below).
  if (!anchorR || anchorR.top > mainR.bottom || anchorR.bottom < mainR.top
    || anchorR.right < mainR.left || (anchorR.left > mainR.right && stage !== 4)) {
    path.setAttribute("d", "");
    return;
  }
  // every stage leaves the card for a point a couple of pixels clear of its anchor's own edge
  const boxR = rect(box);
  const by = boxR.top + boxR.height / 2;
  // the stages standing under the filters go out of the left edge and bow further left, which keeps
  // them clear of the search bar and the bubbles over the card
  const bow = Math.min(100, boxR.left - mainR.left - 8);
  if (stage === 4 && !stacked) {
    // around the table and up into the bottom edge of the rotation link
    const [tx, ty] = [anchorR.left + anchorR.width / 2, anchorR.bottom + 4];
    path.setAttribute("d", `M ${boxR.left} ${by} C ${boxR.left - bow} ${by}, ${tx} ${ty + HEAD + 90}, ${tx} ${ty + HEAD}`);
    return;
  }
  if (stage === 4 && stacked && anchorR.right <= mainR.right) {
    // Thin view with the link in sight: out of the card's side and down into the cell's top edge,
    // which is the edge facing a card that stands above the table rather than beside it.
    const [tx, ty] = [anchorR.left + anchorR.width / 2, anchorR.top - 4];
    path.setAttribute("d", `M ${boxR.right} ${by} C ${boxR.right + 40} ${by}, ${tx} ${ty - HEAD - 40}, ${tx} ${ty - HEAD}`);
    return;
  }
  if (stage === 4 && anchorR.right > mainR.right) {
    // The link is off the side of the scrollport — a narrow window, where the table's last columns
    // are a sideways scroll away. The arrow runs along its row as far as the screen goes and points
    // the way it lies, since a point nobody can see is no use to aim at; scrolling the table across
    // brings the cell itself into view and the arrow onto it (the scroll handler below).
    const [tx, ty] = [mainR.right - 14, anchorR.top + anchorR.height / 2];
    path.setAttribute("d", `M ${boxR.right} ${by} C ${boxR.right + 30} ${by}, ${tx - HEAD - 30} ${ty}, ${tx - HEAD} ${ty}`);
    return;
  }
  const [tx, ty] = [anchorR.left - 4, anchorR.top + anchorR.height / 2];
  if (stage === 2 || stage === 3) {
    const bx = boxR.left;
    if (!stacked) {
      // back into the left edge of the search bar or the bubble, bowing left out of the card to
      // stay clear of them — or, with no room left of that edge to come in from, up from underneath
      path.setAttribute("d", tx - HEAD - bow >= mainR.left
        ? `M ${bx} ${by} C ${bx - bow} ${by}, ${tx - HEAD - bow} ${ty}, ${tx - HEAD} ${ty}`
        : `M ${bx} ${by} C ${bx - bow} ${by}, ${anchorR.left + anchorR.width / 2} ${ty + HEAD + 70}, ${anchorR.left + anchorR.width / 2} ${ty + HEAD}`);
      return;
    }
    // Stacked, the filters span the page and the card stands square underneath them: the arrow
    // leaves the top of it and rises into the bottom edge of the bar or the bubble above.
    const cx = boxR.left + boxR.width / 2;
    const [ax, ay] = [anchorR.left + anchorR.width / 2, anchorR.bottom + 4];
    const bend = Math.max(12, Math.min(70, (boxR.top - ay - HEAD) * 0.5));
    path.setAttribute("d", `M ${cx} ${boxR.top} C ${cx} ${boxR.top - bend}, ${ax} ${ay + HEAD + bend}, ${ax} ${ay + HEAD}`);
    return;
  }
  if (stacked && stage < 2) {
    // Straight down out of the bottom of the card into the top edge of the cell: stacked, the card
    // stands over the table with nothing beside it to go around.
    const bx = boxR.left + boxR.width / 2;
    const [cx, cy] = [anchorR.left + anchorR.width / 2, anchorR.top - 4];
    // the bend is half the drop, so a card sitting a row above the cell leans over to it rather
    // than wringing itself out through two full-sized controls it has no room for
    const bend = Math.max(12, Math.min(70, (cy - HEAD - boxR.bottom) * 0.5));
    path.setAttribute("d", `M ${bx} ${boxR.bottom} C ${bx} ${boxR.bottom + bend}, ${cx} ${cy - HEAD - bend}, ${cx} ${cy - HEAD}`);
    return;
  }
  // With room to the right of the card the arrow leaves and arrives level, a flat S into the row.
  const bx = boxR.right, dx = tx - bx;
  if (dx >= 80) {
    path.setAttribute("d", `M ${bx} ${by} C ${bx + dx * 0.5} ${by}, ${tx - HEAD - dx * 0.5} ${ty}, ${tx - HEAD} ${ty}`);
    return;
  }
  // The row is behind the card or barely past it. Below it — the card standing over the table on a
  // stacked layout — the arrow sweeps around and drops onto the point from above.
  if (ty > by) {
    path.setAttribute("d", `M ${bx} ${by} C ${bx + 70} ${by}, ${tx} ${ty - HEAD - 70}, ${tx} ${ty - HEAD}`);
    return;
  }
  // Above it, the arrow rises and comes into the row's left edge on the diagonal, backed off along
  // that diagonal so the head's tip is what lands on the point. Neither control reaches past the
  // point it is heading for, which is what used to leave the line overshooting the row with the
  // head sitting on top of its own tail.
  const [ex, ey] = [tx - HEAD * 0.7, ty + HEAD * 0.7];
  path.setAttribute("d", `M ${bx} ${by} C ${bx + (ex - bx) * 0.9} ${by}, ${ex - 45} ${ey + 45}, ${ex} ${ey}`);
}

/** Put the tutorial up over a drawn comparison table, unless it has been dismissed. Never while a
 *  run is going: the overlay stands over the table, and the rows the card points into are not drawn
 *  until the end of it — so it waits on both, the overlay being down and a row being there. */
export function maybeShowTutorial(): void {
  if (!overlay?.hidden) return;
  if (dismissed()) return;
  // each stage belongs to one page, and waits out of sight while the reader is on the other
  const ready = stage >= DETAIL_STAGE
    ? document.querySelector(".rtable.loadout")
    : document.querySelector(".tgrid .trow[data-team]");
  if (!ready) {
    hideTutorial();
    return;
  }
  if (!layer) {
    layer = build();
    document.body.appendChild(layer);
    // whatever the restored filters already show is what the first two stages measure against
    baseline();
  }
  layer.hidden = false;
  place();
}

export function hideTutorial(): void {
  if (layer) layer.hidden = true;
  mark(null);
}

// A press on the search bar at the stage that asks for one types the start of a name into it — the
// top-right member of the table, three letters at a tenth of a second each, so the list has
// something to offer and the reader has something to take.
let typing: ReturnType<typeof setTimeout> | undefined;
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden || stage !== 2 || typing !== undefined) return;
  if (!(e.target as Element).closest?.("#optionSearch")) return;
  const input = document.querySelector<HTMLInputElement>("#optionSearch");
  const cells = [...rowElementAt(0)?.querySelectorAll<HTMLElement>(".c.name.res") ?? []];
  const name = (cells[2] ?? cells[cells.length - 1])?.dataset.resonator;
  if (!input || input.value || !name) return;
  const text = name.slice(0, 3);
  let at = 0;
  const key = (): void => {
    input.value = text.slice(0, ++at);
    // the bar's own handler is what draws the list, and it listens for this
    input.dispatchEvent(new Event("input", { bubbles: true }));
    typing = at < text.length ? setTimeout(key, 100) : undefined;
  };
  typing = setTimeout(key, 100);
}, true);

// A chip off the search bar is what the third stage asks for, taken by press or by Enter.
function searchUsed(): void {
  if (!layer || layer.hidden || stage !== 2) return;
  setStage(3);
  place();
}
document.addEventListener("click", (e) => {
  if ((e.target as Element).closest?.(".sresult[data-value]")) searchUsed();
}, true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.target as HTMLElement).id === "optionSearch" && searchChoice()) searchUsed();
}, true);

// A press on a bubble is what takes it off, which is the fourth stage's own ask. Captured, and the
// stage moves on here rather than in `settle()`: taking the last bubble off would otherwise read as
// there being none to take off, and send the reader back to the search they had already used.
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden || stage !== 3) return;
  if (!(e.target as Element).closest?.(".tcchips .rchip, .tcchips .clearall")) return;
  setStage(4);
  place();
}, true);

// ...and the rotation link hands the tutorial over to the page it opens. Placed by the render that
// follows rather than here: the table is still the page on screen at the moment of the press.
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden || stage !== 4) return;
  if (!(e.target as Element).closest?.(".gotodetail")) return;
  setStage(DETAIL_STAGE);
}, true);

// Two seconds over a piece of equipment is the first rotation-page stage's own ask. The timer is
// per cell: crossing into a second piece starts it again, and leaving the table drops it.
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
const hovered = (e: Event): Element | null | undefined => (e.target as Element).closest?.(".rtable.loadout .c.has");
document.addEventListener("pointerover", (e) => {
  if (!layer || layer.hidden || stage !== DETAIL_STAGE || !hovered(e)) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    setStage(DETAIL_STAGE + 1);
    place();
  }, 1000);
}, true);
document.addEventListener("pointerout", (e) => {
  const from = hovered(e);
  // a move onto a child of the same cell is not a move off it
  if (!from || (e as PointerEvent).relatedTarget instanceof Element
    && ((e as PointerEvent).relatedTarget as Element).closest(".rtable.loadout .c.has") === from) return;
  clearTimeout(hoverTimer);
}, true);

// ...then any figure that opens the breakdown — a member's, and after it the team's own row.
document.addEventListener("click", (e) => {
  if (!layer || layer.hidden) return;
  const cell = (e.target as Element).closest?.(".dist-cell, [data-dist-row]");
  if (!cell) return;
  if (stage === DETAIL_STAGE + 1) setStage(DETAIL_STAGE + 2);
  else if (stage === DETAIL_STAGE + 2 && cell.closest(".rtrow.total")) setStage(DETAIL_STAGE + 3);
  else return;
  place();
}, true);

/** The last stage is over once the log has been scrolled up the screen, and the tutorial with it. */
function finish(): void {
  done = true;
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch { /* no storage — it comes back next load, which is the best this can do */ }
  hideTutorial();
}

// The README's own way back in. Nothing to do while the tutorial is already up — a press then would
// only send the reader back to a stage one they are standing in the middle of.
document.addEventListener("click", (e) => {
  if (!(e.target as Element).closest?.(".tutstart")) return;
  if (layer && !layer.hidden) return;
  try {
    localStorage.removeItem(DONE_KEY);
  } catch { /* no storage — nothing was keeping it away to begin with */ }
  done = false;
  setStage(0);
  baseline();
  maybeShowTutorial();
}, true);

// Every run puts the overlay back up, and the card goes away under it rather than sitting blurred
// behind a loading screen — it comes back once the run that took it down has drawn its table.
if (overlay) {
  new MutationObserver(() => {
    if (overlay.hidden) maybeShowTutorial();
    else hideTutorial();
  }).observe(overlay, { attributes: true, attributeFilter: ["hidden"] });
}

// A menu opening or closing is what moves the first two stages' arrows between the row and the line
// standing over it, and anything else parked in the body can move what a card points at as much as
// a scroll does. Neither redraws the table, so watching that body is the only way to hear about it.
new MutationObserver(() => {
  if (layer && !layer.hidden) place();
}).observe(document.body, { childList: true });

// The last stage points into a cell a narrow scrollport carries off the side of the screen, so
// there alone the arrow follows the table as it is scrolled across rather than being measured once.
// The card is fixed to the screen, but what it points at rides on a page that scrolls under it, so
// every arrow is re-measured as that happens — a frame at a time, and captured, since a scroll on
// the scrollport inside never reaches the window on its own.
let queued = false;
addEventListener("scroll", () => {
  if (!layer || layer.hidden || queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    // ...and the last stage is asking for that scroll: it is over once the log has come up the screen
    if (stage === DETAIL_STAGE + 3 && scrolledFar()) {
      finish();
      return;
    }
    place();
    // The table redraws its own scroll window from a callback queued after this one (this listener
    // is captured, so it runs first), which replaces the very rows just measured and marked. A
    // second pass on the next frame lands on whatever that redraw put there.
    requestAnimationFrame(place);
  });
}, true);

// The search bar's list opens and closes under the card without the page being redrawn at all, and
// a press can move as much as a scroll does — so the card is measured again after either, on the
// frame that follows whatever they changed.
const remeasure = (): void => {
  if (layer && !layer.hidden) requestAnimationFrame(place);
};
document.addEventListener("input", remeasure, true);
document.addEventListener("click", remeasure, true);
document.addEventListener("focusout", remeasure, true);

addEventListener("resize", () => {
  if (!layer || layer.hidden) return;
  place();
  // ...and again a frame later: the table measures its own tracks on a resize (`fitSide()`,
  // `drawWindow()`), so the column an arrow is pointing at can still be moving when this runs
  requestAnimationFrame(place);
});
