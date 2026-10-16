/** The cell-block gestures both grids share: a finger's tap / long press / scroll (`watchTouch`),
 *  and the dot a finger's block wears to reshape it (`grabDot`). */
import { zoom } from "./panels.js";

/** How long (ms) a press is held before it is a hold rather than a click or a tap. */
export const HOLD = 500;

/** A touch long press raises `contextmenu`, which would open a cell's menu: on touch, a tap opens them. */
let touching = false;
addEventListener("pointerdown", (e) => {
  touching = e.pointerType === "touch";
}, true);
addEventListener("contextmenu", (e) => {
  if (!touching) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);

/** Keep the click a press is about to end on from reaching the page; `wait` (ms) for a tap's late click. */
export function swallowClick(wait = 0): void {
  const swallow = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
  };
  addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => removeEventListener("click", swallow, true), wait);
}

/** A finger down, not yet read; `w`/`h` its cell's size, as far as it may move and still be a press. */
let watch: {
  event: PointerEvent; x: number; y: number; w: number; h: number;
  tap: () => void; long: () => void;
  timer: ReturnType<typeof setTimeout>;
  fired: boolean; scrolled: boolean;
} | null = null;

/** `tap` where the finger lifts without the page scrolling, `long` where it is still down `HOLD` later
 *  and within a cell's size of where it landed — anything further is a scroll, and picks nothing. */
export function watchTouch(e: PointerEvent, cell: Element | null, tap: () => void, long: () => void = () => {}): void {
  // the grid nearest the finger reads it first; a page-wide listener after it stands aside
  if (watch?.event === e) return;
  if (watch) clearTimeout(watch.timer);
  const r = cell?.getBoundingClientRect();
  const w = {
    event: e, x: e.clientX, y: e.clientY, w: r?.width ?? 0, h: r?.height ?? 0, tap, long, fired: false, scrolled: false,
    timer: setTimeout(() => {
      if (watch !== w) return;
      w.fired = true;
      if (cell) w.long();
    }, HOLD),
  };
  watch = w;
}
// a scroll cancels the pointer, but the touch still reports where the finger is
addEventListener("pointercancel", (e) => {
  if (watch && e.pointerType === "touch") watch.scrolled = true;
}, true);
addEventListener("touchmove", (e) => {
  const t = e.touches[0];
  if (!watch || watch.fired || !t) return;
  if (Math.abs(t.clientX - watch.x) <= watch.w && Math.abs(t.clientY - watch.y) <= watch.h) return;
  clearTimeout(watch.timer);
  watch = null;
}, { passive: true, capture: true });
addEventListener("touchend", () => {
  const w = watch;
  if (!w) return;
  watch = null;
  clearTimeout(w.timer);
  // a long press already picked its cell; the click its release raises would open a menu over it
  if (w.fired) swallowClick(600);
  else if (!w.scrolled) w.tap();
}, true);

/** The nearest scrolling box above `el` along one axis — the page itself where none is. */
function scrollerOf(el: Element, axis: "x" | "y"): Element {
  for (let at: Element | null = el.parentElement; at; at = at.parentElement) {
    const s = getComputedStyle(at);
    const flow = axis === "x" ? s.overflowX : s.overflowY;
    const room = axis === "x" ? at.scrollWidth > at.clientWidth : at.scrollHeight > at.clientHeight;
    if (room && (flow === "auto" || flow === "scroll")) return at;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** A grid's block for the dot, in edges: row edge `r` is row `r`'s top, column edge `c` column `c`'s left. */
export interface DotGrid {
  grid: Element;
  /** The block's own corners as edges: top-left, then bottom-right. */
  corners(): [[number, number], [number, number]];
  edgeAt(x: number, y: number): [number, number];
  /** Redraw the block between `from` and `to` (an empty one where they share an edge), the dot on `to`. */
  aim(from: [number, number], to: [number, number]): void;
  /** The drag let go: `empty` where the block came to nothing, which takes it off. */
  done(empty: boolean): void;
}

/** How near an edge of the screen (px) the dot starts the page scrolling, and its fastest step. */
const EDGE = 48, STEP = 18;

/** Drag the dot: the block's top-left stays, the other corner follows the finger edge to edge, and
 *  the page scrolls only while the finger is near the screen's edge. */
export function grabDot(e: PointerEvent, host: DotGrid): void {
  e.preventDefault();
  e.stopPropagation();
  (e.target as Element).setPointerCapture?.(e.pointerId);
  const [from] = host.corners();
  let cx = e.clientX, cy = e.clientY;
  let to = host.corners()[1];
  const sx = scrollerOf(host.grid, "x"), sy = scrollerOf(host.grid, "y");
  const aim = (): void => {
    const z = zoom();
    to = host.edgeAt(cx / z, cy / z);
    host.aim(from, to);
  };
  let raf = 0;
  const roll = (): void => {
    raf = 0;
    const speed = (near: number): number => (near < EDGE ? Math.ceil(STEP * (1 - Math.max(0, near) / EDGE)) : 0);
    const dx = speed(innerWidth - cx) - speed(cx), dy = speed(innerHeight - cy) - speed(cy);
    if (!dx && !dy) return;
    sx.scrollLeft += dx;
    sy.scrollTop += dy;
    aim();
    raf = requestAnimationFrame(roll);
  };
  const move = (m: PointerEvent): void => {
    if (m.pointerId !== e.pointerId) return;
    [cx, cy] = [m.clientX, m.clientY];
    aim();
    if (!raf) raf = requestAnimationFrame(roll);
  };
  const up = (u: PointerEvent): void => {
    if (u.pointerId !== e.pointerId) return;
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    removeEventListener("pointercancel", up);
    if (raf) cancelAnimationFrame(raf);
    swallowClick(600);
    host.done(to[0] === from[0] || to[1] === from[1]);
  };
  addEventListener("pointermove", move);
  addEventListener("pointerup", up);
  addEventListener("pointercancel", up);
}

/** The dot itself, `touch-action: none` so a press on it is never the page scrolling. */
export function makeDot(parent: Element, grab: (e: PointerEvent) => void): HTMLElement {
  const dot = parent.appendChild(document.createElement("div"));
  dot.className = "celldot";
  dot.addEventListener("pointerdown", grab);
  return dot;
}
