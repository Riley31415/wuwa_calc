/**
 * The comparison page: the filter aside (boxes, chips, search), the table itself drawn as a
 * scroll window over the sorted rows, and every click/change handler for it.
 */
import { Tier } from "../engine/stats.js";
import { baseSequence } from "../engine/gear.js";
import { fmt } from "../display.js";
import { sequenceLevels, scopedKey, axisUsed, compares, weaponBase, echoLines, echoLabel, axisOpen, standardWeapon, AXES } from "../solver.js";
import type { Member, Combo, Axis, TeamCost, ScopedCompare } from "../solver.js";
import type { TeamRun } from "../teamrun.js";
import {
  TEAMS, filters, results, visibleRows, ROW_CAP,
  resonatorFilters, sequenceFilters, refineFilters, weaponFilters, OPTION_FILTER_MAPS,
  pruneGearFilters, comparable, prospectiveRows, sequenceTag, refineTag, syncHash,
} from "./model.js";
import type { ResonatorFilter, OptionKind, TeamRow } from "./model.js";
import type { SearchKind } from "./filterbar.js";
import { esc, deferredPop, rect, clearPops, subsLabel } from "./panels.js";

const app = document.getElementById("app")!;
const topbar = document.getElementById("topbar")!;

import { focusSearch, clearSearch, searchHits, searchChoice, cycleSearch, comparisonFilters, AXIS_LABEL, scopedLabel } from "./filterbar.js";

/** Set by index.ts: the re-expand-and-redraw every committed filter change ends in. */
let refresh: () => Promise<void> = async () => {};
export const onRefresh = (fn: () => Promise<void>): void => { refresh = fn; };

/* --------------------------------------------------------------------------- filter changes */

/** Where the reader's last input landed, which is where a refusal has to answer them — the pointer
 *  for a click, the near corner of whatever is focused for a key. Captured, so it is read before
 *  the handler that goes on to make the change. */
let lastPoint: [number, number] = [0, 0];
addEventListener("pointerdown", (e) => { lastPoint = [e.clientX, e.clientY]; }, true);
addEventListener("keydown", () => {
  const r = (document.activeElement as HTMLElement | null)?.getBoundingClientRect();
  if (r && (r.width || r.height)) lastPoint = [r.left, r.bottom];
}, true);

/** Put a popup at a point, kept whole inside the viewport — a menu, or the notice below. */
function placeInView(el: HTMLElement, x: number, y: number): void {
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.max(6, Math.min(x, innerWidth - r.width - 6))}px`;
  el.style.top = `${Math.max(6, Math.min(y, innerHeight - r.height - 6))}px`;
}

/** The refusal a change over `ROW_CAP` gets, popped where the reader asked for it rather than in
 *  the filter bar they may not be looking at. Takes itself down on the next click, key or scroll,
 *  the way a menu does. */
function rowCapWarning(total: number | null): void {
  document.querySelector(".rowcap")?.remove();
  if (total === null) return;
  const pop = document.createElement("div");
  pop.className = "ctxmenu rowcap";
  pop.textContent = `That would open ${fmt(total)} rows, which is over the ${fmt(ROW_CAP)} cap.`
    + ` Try using less comparisons, removing a resonator, or hiding resonators.`;
  document.body.appendChild(pop);
  placeInView(pop, ...lastPoint);
  const close = (): void => {
    pop.remove();
    removeEventListener("click", close, true);
    removeEventListener("keydown", close, true);
    removeEventListener("scroll", close, true);
  };
  // deferred, or the click that asked for the change would take it down in the same tick
  setTimeout(() => {
    addEventListener("click", close, true);
    addEventListener("keydown", close, true);
    addEventListener("scroll", close, true);
  });
}

/** Commit one filter change or refuse it: `change` mutates the state and returns its undo, which
 *  runs when the prospective row count would cross `ROW_CAP`. Every way to change a filter goes
 *  through here — clearing a filter can widen the table as much as setting one narrowed it. */
function withRowCap(change: () => () => void): void {
  const undo = change();
  const total = prospectiveRows();
  if (total > ROW_CAP) {
    undo();
    rowCapWarning(total);
    focusAfterDraw = undefined;
    return;
  }
  rowCapWarning(null);
  syncHash();
  void refresh();
}

/** Toggle one filter: same mode clears it, a different mode switches it. */
function setFilter(map: Map<string, ResonatorFilter>, name: string, mode: ResonatorFilter): void {
  withRowCap(() => {
    const was = map.get(name);
    if (was === mode) map.delete(name); else map.set(name, mode);
    return () => { if (was === undefined) map.delete(name); else map.set(name, was); };
  });
}

/** Whether this resonator's rows read "R0" — the weapon they wear with the Weapon column closed
 *  being a standard, or a craftable on a limited resonator (see `rankToken`). A rank number says
 *  nothing on one of those and would read as a signature's, so their refines and weapons compares
 *  are opened and closed together: the Weapon column is where the name and rank stand side by
 *  side. One already reading R1-R5 needs no such pairing, and does not get one — its rank is on
 *  screen either way, so a refines compare of its own opens on its own.
 *
 *  The weapon asked about is the one the cost mode hands them, not any they list: under `s0r1`
 *  that is the signature at the head of the list, otherwise the best standard. `s0r1mdps` gives it
 *  to one member per team only, so it reads as the standard here — the pairing is a convenience
 *  where the rank is ambiguous, and the members who read R0 are the ones it is for. */
const rankless = (name: string): boolean =>
  Object.values(TEAMS).some((members) => members.some((m) => {
    if (m.name !== name) return false;
    const w = m.loadout.weapons[filters.cost === "s0r1" ? 0 : standardWeapon(m.loadout)]!;
    return w.tier !== Tier.Limited && !(w.tier === Tier.Free && m.loadout.resonator.tier !== Tier.Limited);
  }));

/** Toggle a resonator's compare on an axis; turning one off drops gear filters only it could have
 *  set. Refines and weapons move together where a rank alone would be ambiguous (`rankless`). */
function setCompare(name: string, axis: Axis): void {
  withRowCap(() => {
    const on = !filters[axis].includes(name);
    const paired: Axis[] = !rankless(name) ? []
      : axis === "refines" && on ? ["weapons"]
      : axis === "weapons" && !on ? ["refines"] : [];
    const before = new Map<Axis, string[]>();
    for (const a of [axis, ...paired]) {
      before.set(a, [...filters[a]]);
      const at = filters[a].indexOf(name);
      if (on && at < 0) filters[a].push(name);
      if (!on && at >= 0) filters[a].splice(at, 1);
    }
    const kept = (Object.values(OPTION_FILTER_MAPS) as Map<string, ResonatorFilter>[]).map((map) => [...map]);
    if (!on) pruneGearFilters();
    return () => {
      for (const [a, list] of before) filters[a] = list;
      (Object.values(OPTION_FILTER_MAPS) as Map<string, ResonatorFilter>[]).forEach((map, i) => {
        map.clear();
        for (const [n, mode] of kept[i]!) map.set(n, mode);
      });
    };
  });
}

function setScoped(s: ScopedCompare): void {
  withRowCap(() => {
    const key = scopedKey(s);
    const at = filters.scoped.findIndex((x) => scopedKey(x) === key);
    if (at >= 0) filters.scoped.splice(at, 1); else filters.scoped.push(s);
    // a rank scoped to one pick needs the Weapon column for the same reason the whole axis does
    const weapons = at < 0 && s.axis === "refines" && rankless(s.resonator) && !filters.weapons.includes(s.resonator);
    if (weapons) filters.weapons.push(s.resonator);
    return () => {
      if (at >= 0) filters.scoped.splice(at, 0, s); else filters.scoped.pop();
      if (weapons) filters.weapons.splice(filters.weapons.indexOf(s.resonator), 1);
    };
  });
}

interface MenuItem { label: string; run: () => void }

/** The scoped compares a pick can open: refines only where a rank list has >1 entry, sonatas and
 *  main stats where the resonator has options; an echo opens main stats alone. */
function scopedItems(resonator: string, on: ScopedCompare["on"], value: string): (MenuItem & { axis: ScopedCompare["axis"] })[] {
  const ranks = (): boolean => Object.values(TEAMS).some((members) => members.some((m) => m.name === resonator
    && m.loadout.refinements.some((r) => r.length > 1 && (on !== "weapon" || weaponBase(r[0]!) === value))));
  const axes: ScopedCompare["axis"][] = on === "echo" ? ["mainstats"]
    : on === "refine" || on === "weaponRank" ? ["echoes", "mainstats"] : ["refines", "echoes", "mainstats"];
  const s = (axis: ScopedCompare["axis"]): ScopedCompare => ({ resonator, on, value, axis });
  const set = (axis: ScopedCompare["axis"]): boolean => filters.scoped.some((x) => scopedKey(x) === scopedKey(s(axis)));
  // the resonator's own refines compare already runs every rank on every weapon, so a rank scoped
  // to one pick has nothing left to add — offered only while it is the one already set, so it can
  // still be turned back off from here
  return axes.filter((axis) => (axis === "refines"
    ? ranks() && (set(axis) || !filters.refines.includes(resonator))
    : comparable(resonator, axis))).map((axis) => ({
    axis,
    label: `${set(axis) ? "Stop comparing" : "Compare"} ${scopedLabel(s(axis))} ${AXIS_LABEL[axis].toLowerCase()}`,
    run: () => setScoped(s(axis)),
  }));
}

const closeMenu = (): void => { document.querySelector(".ctxmenu")?.dispatchEvent(new Event("closemenu")); };

/** When the last double press filed its filter — the hover-to-open menu sits out the second after. */
let lastQuickInclude = 0;
const quickInclude = (run: () => void): void => {
  closeMenu();
  lastQuickInclude = Date.now();
  run();
};

/** The menu at the pointer; any other click, a scroll or Escape takes it down. */
function showMenu(x: number, y: number, items: MenuItem[]): void {
  menuOrigin = null;
  document.querySelector(".ctxmenu")?.remove();
  const menu = document.createElement("div");
  menu.className = "ctxmenu";
  menu.innerHTML = items.map((it, i) => `<button type="button" class="ctxitem" data-i="${i}">${esc(it.label)}</button>`).join("");
  document.body.appendChild(menu);
  placeInView(menu, x, y);
  const close = (): void => {
    menu.remove();
    removeEventListener("click", onClick, true);
    removeEventListener("contextmenu", onClick, true);
    removeEventListener("keydown", onKey, true);
    removeEventListener("scroll", close, true);
  };
  const onClick = (e: Event): void => {
    const item = (e.target as Element).closest<HTMLElement>(".ctxitem");
    if (item && menu.contains(item)) { e.stopPropagation(); e.preventDefault(); close(); items[Number(item.dataset.i)]!.run(); return; }
    close();
  };
  const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") close(); };
  menu.addEventListener("closemenu", close);
  // deferred, or the contextmenu that opened it would close it in the same tick
  setTimeout(() => {
    addEventListener("click", onClick, true);
    addEventListener("contextmenu", onClick, true);
    addEventListener("keydown", onKey, true);
    addEventListener("scroll", close, true);
  });
}

/* ------------------------------------------------------------------------------ the table */

/** A member's name cell: the resonator, then `S?R?` — the name cell's menu offers the level and
 *  rank as filter lines of its own (`openNameMenu`). */
function memberLabel(m: Member, combo: Combo): string {
  return [m.loadout.resonator.name, `${seqToken(m, combo)}${rankToken(m, combo)}`].filter(Boolean).join(" ");
}
/** A chain that comes with the character is always named; any level is once the chain is compared. */
const seqToken = (m: Member, combo: Combo): string =>
  baseSequence(m.loadout.resonator) > 0 || axisOpen(m, filters, "sequences") ? `S${combo.sequence}` : "";
/** "" while a Weapon column carries the rank. A signature, a free weapon on a free resonator, or
 *  any weapon while refines are compared reads its rank; a craftable on a limited resonator is
 *  the "no signature" build and reads R0. */
const rankToken = (m: Member, combo: Combo): string =>
  axisUsed(m, filters, "weapons") ? ""
  : compares(m, filters, "refines", combo) || combo.weapon.tier === Tier.Limited
    || (combo.weapon.tier === Tier.Free && m.loadout.resonator.tier !== Tier.Limited) ? `R${combo.weapon.refinement}`
  : "R0";

/** A gear pick cell; `data-kind`/`data-value` are what the click handlers filter on. Empty when
 *  the axis is open at this position but not for this member. */
function optionCell(kind: OptionKind, value: string, color: string, lines: string[] = [value], resonator = ""): string {
  const style = `--mem:${color}`;
  if (!value) return `<div class="c option" style="${style}"></div>`;
  return `<div class="c option" data-kind="${kind}" data-value="${esc(value)}"${resonator ? ` data-resonator="${esc(resonator)}"` : ""} style="${style}">${lines.map(esc).join("<br>")}</div>`;
}

let hueShown = true;

interface TableView {
  sorted: (readonly [string, TeamRun])[];
  ranks: RowRank[];
  head: string;
  ghost: string;
  rowHtml: (key: string, run: TeamRun, rank: RowRank) => string;
  /** Lines per row (echo cells stack a line per set) and the running extra-line count above each. */
  lines: number[];
  extra: number[];
}
interface RowRank { hue: number; pct: string; pinned: boolean }
let tableView: TableView | null = null;

/** The whole page's markup: the aside and the table shell. Rows are drawn by `drawWindow()`. */
function comparisonTable(rows: TeamRow[]): string {
  const seq = (run: TeamRun): number => run.combo.reduce((n, c) => n + c.sequence, 0);
  // Main stats and substats reach nobody but the member wearing them (solver.ts's own
  // `rowPicks()`), so rows differing only on those are one build in different rolls and belong
  // together, and they nest outside in, each level's key extending the one before it: the team,
  // then what the whole build is invested in — the substat spread, then the chain level — then the
  // gear it wears, the weapon, the rank it is at, and the sonata inside that. The main-stat rolls
  // are what is left inside the innermost group, ordered on their own totals. Every group stands
  // where its own best row would have stood, ties falling back to the deeper chain exactly as two
  // tied rows did before, so Team DPR runs down within a group rather than down the whole column.
  // (A combo's key is `weapon.echo.mainstat.sN.rN[.m][.h]` — see solver.ts's own `comboOf()`;
  // Matrix is the table's own box, the same on every row, so it never tells two groups apart.)
  const LEVELS: ((c: Combo, p: string[]) => string)[] = [
    (c) => (c.highSubs ? "h" : ""),
    (_, p) => p[3]!,
    (_, p) => p[0]!,
    (_, p) => p[4]!,
    (_, p) => p[1]!,
  ];
  const keyed = rows.map((row) => {
    const run = results.get(row.key)!;
    const parts = run.combo.map((c) => c.key.split("."));
    const keys = [run.teamKey];
    for (const level of LEVELS) keys.push(`${keys[keys.length - 1]}|${run.combo.map((c, i) => level(c, parts[i]!)).join("-")}`);
    return { pair: [row.key, run] as const, run, keys };
  });
  const groupBest = new Map<string, TeamRun>();
  for (const { run, keys } of keyed) for (const k of keys) {
    const held = groupBest.get(k);
    if (!held || run.total > held.total) groupBest.set(k, run);
  }
  const sorted = keyed.sort((a, b) => {
    for (let i = 0; i < a.keys.length; i++) {
      const [ka, kb] = [a.keys[i]!, b.keys[i]!];
      if (ka === kb) continue;
      const [ra, rb] = [groupBest.get(ka)!, groupBest.get(kb)!];
      return rb.total - ra.total || seq(rb) - seq(ra) || (ka < kb ? -1 : 1);
    }
    return b.run.total - a.run.total || seq(b.run) - seq(a.run);
  }).map((k) => k.pair);

  // column order, left to right: the substat spread is the whole build's investment, so it stands
  // first, ahead of every pick it applies to
  const GEAR_AXES = ["substats", "weapons", "echoes", "mainstats"] as const;
  type GearAxis = typeof GEAR_AXES[number];
  type CmpAxis = GearAxis | "sequences" | "refines";
  const CMP_AXES: readonly CmpAxis[] = [...GEAR_AXES, "sequences", "refines"];
  const shows = (m: Member, axis: CmpAxis): boolean => axisUsed(m, filters, axis);
  const showsRow = (m: Member, axis: CmpAxis, combo: Combo): boolean => compares(m, filters, axis, combo);
  const AXIS_HEAD: Record<GearAxis, string> = { weapons: "Weapon", echoes: "Echo Set", mainstats: "Mainstats", substats: "Substats" };

  // Gear compares: a row measures against its "twins" — same gear everywhere but main stats
  // (free for everyone) and, on the compared member, the one axis. Teammates' sonatas are held
  // (they can buff the member); the solver's hidden rows supply baselines the table never shows.
  const gearKey = (c: Combo, axis: CmpAxis | null): string => {
    const [w, e, , seq, ref, ...rest] = c.key.split(".");
    return [axis === "weapons" ? "*" : w, axis === "echoes" ? "*" : e, "*", axis === "sequences" ? "*" : seq, axis === "weapons" || axis === "refines" ? "*" : ref, rest.includes("m"), axis === "substats" || axis === null ? "*" : rest.includes("h")].join("|");
  };
  const twinKey = (run: TeamRun, pos: number, axis: CmpAxis): string =>
    `${run.teamKey}|${pos}|${axis}|${run.combo.map((c, k) => gearKey(c, k === pos ? axis : null)).join("-")}`;
  // which axes have a column at each position, off the rows on screen
  const openAt: Record<CmpAxis, boolean[]> = { weapons: [false, false, false], echoes: [false, false, false], mainstats: [false, false, false], substats: [false, false, false], sequences: [false, false, false], refines: [false, false, false] };
  for (const row of rows) {
    row.members.forEach((m, pos) => {
      for (const axis of CMP_AXES) if (shows(m, axis)) openAt[axis][pos] = true;
    });
  }
  // indexed only for the axes and positions with a Compare on screen, over the teams on screen —
  // `results` holds every run of the session, and the default table has no compare at all
  const onScreen = new Set(rows.map((r) => r.key));
  const teamsOnScreen = new Set(rows.map((r) => r.teamKey));
  const openAxes = CMP_AXES.filter((axis) => openAt[axis].some(Boolean));
  const twins = new Map<string, { combo: Combo; dpr: number; shown: boolean }[]>();
  for (const [key, run] of results) {
    if (!openAxes.length || !teamsOnScreen.has(run.teamKey)) continue;
    run.members.forEach((m, pos) => {
      for (const axis of openAxes) {
        if (!openAt[axis][pos]) continue;
        const twin = twinKey(run, pos, axis);
        const list = twins.get(twin) ?? [];
        list.push({ combo: run.combo[pos]!, dpr: run.bySlot.get(m.name) ?? 0, shown: onScreen.has(key) });
        twins.set(twin, list);
      }
    });
  }
  // the baseline: the best twin wearing the axis's own baseline (a non-limited weapon at R1, any
  // sonata/main stat, the default subs, the lowest chain level), on-screen twins preferred
  const bestOf = (pool: { combo: Combo; dpr: number }[], run: TeamRun, pos: number, axis: CmpAxis): number => {
    let base = -Infinity;
    for (const t of pool) {
      if (axis === "weapons") {
        if (t.combo.weapon.tier === Tier.Limited) continue;
        if (compares(run.members[pos]!, filters, "refines", run.combo[pos]!) && t.combo.key.split(".")[4] !== "r0") continue;
      }
      if (axis === "refines" && t.combo.key.split(".")[4] !== "r0") continue;
      if (axis === "substats" && t.combo.highSubs) continue;
      if (axis === "sequences" && t.combo.sequence !== sequenceLevels(run.members[pos]!, filters)[0]) continue;
      if (t.dpr > base) base = t.dpr;
    }
    return base;
  };
  const gearRatio = (run: TeamRun, pos: number, axis: CmpAxis): number | null => {
    const dpr = run.bySlot.get(run.members[pos]!.name) ?? 0;
    const all = twins.get(twinKey(run, pos, axis)) ?? [];
    const shown = all.filter((t) => t.shown);
    for (const pool of [shown, all]) {
      const base = bestOf(pool, run, pos, axis);
      if (base > 0) return dpr / base;
    }
    return null;
  };
  const gearCompare = (run: TeamRun, pos: number, axis: CmpAxis): string => {
    const ratio = gearRatio(run, pos, axis);
    return ratio == null ? "" : `${fmt(ratio * 100, 1, true)}%`;
  };

  const seqCmpAt = (i: number): boolean => !!openAt.sequences[i];
  // the Weapon column's own Compare already measures against R1, so the refine one stands down
  const refCmpAt = (i: number): boolean => !!openAt.refines[i] && !openAt.weapons[i];
  // ...and the Personal column, wherever this position compares anything at all: it is what every
  // Compare beside it is a share of, so it earns its place exactly when they do
  const dprAt = (i: number): boolean => CMP_AXES.some((axis) => openAt[axis][i]);
  const rowHtml = (key: string, run: TeamRun, rank: RowRank): string => {
    const grand = run.total;
    const memberNames = run.members.map((m) => m.name).join("|");
    const memberCell = (m: Member, combo: Combo, i: number) => {
      // the level and rank ride on the name cell as filter tags wherever the rows differ on them;
      // with a Weapon column open the rank is that cell's business
      const seqTag = sequenceTag(m, combo);
      const refTag = axisUsed(m, filters, "refines") && !openAt.weapons[i] ? refineTag(m, combo) : null;
      const name = `<div class="c name res" data-resonator="${esc(m.name)}"`
        + (seqTag ? ` data-sequence="${esc(seqTag)}" data-seq-gate="${combo.sequence}"` : "")
        + (refTag ? ` data-refine="${esc(refTag)}" data-ref-gate="${combo.weapon.refinement}"` : "")
        + ` style="--mem:${m.color};color:${m.color}">`
        + `<span class="res-label">${esc(memberLabel(m, combo))}</span>`
        + `</div>`;
      const dpr = dprAt(i) ? `<div class="c num slotdpr" style="--mem:${m.color}">${fmt(run.bySlot.get(m.name) ?? 0)}</div>` : "";
      const seqCmp = seqCmpAt(i) ? `<div class="c num slotcompare" style="--mem:${m.color}">${axisOpen(m, filters, "sequences") ? gearCompare(run, i, "sequences") : ""}</div>` : "";
      const refCmp = refCmpAt(i) ? `<div class="c num slotcompare" style="--mem:${m.color}">${compares(m, filters, "refines", combo) ? gearCompare(run, i, "refines") : ""}</div>` : "";
      const gear = GEAR_AXES.map((axis) => {
        if (!openAt[axis][i]) return "";
        const open = showsRow(m, axis, combo);
        const cell = axis === "weapons" ? optionCell("weapon", open ? combo.weapon.name : "", m.color, [combo.weapon.name], m.name)
          : axis === "echoes" ? optionCell("echo", open ? echoLabel(m.loadout, combo.echo) : "", m.color, open ? echoLines(m.loadout, combo.echo) : [], m.name)
          // Neither a main-stat roll nor a substat spread is ever filtered on — they reach nobody
          // but their own wearer, so "every team using this roll" says nothing. Their cells carry
          // the axis instead, and their menu only turns the compare that opened the column back
          // off (`openStatMenu`).
          : `<div class="c option"${open ? ` data-stat="${axis}" data-resonator="${esc(m.name)}"` : ""} style="--mem:${m.color}">`
            + `${open ? esc(axis === "mainstats" ? combo.mainstat.name : subsLabel(combo)) : ""}</div>`;
        return cell + `<div class="c num slotcompare" style="--mem:${m.color}">${open ? gearCompare(run, i, axis) : ""}</div>`;
      }).join("");
      return name + seqCmp + refCmp + gear + dpr;
    };
    const memberCells = run.members.map((m, i) => memberCell(m, run.combo[i]!, i)).join("");
    return `<div class="trow${rank.pinned ? " isbaseline" : ""}" style="--hue:${rank.hue}" data-team="${esc(key)}" data-team-key="${esc(run.teamKey)}"`
      + ` data-members="${esc(memberNames)}" data-total="${grand}">`
      + memberCells
      + `<div class="c num total teamdpr" title="Click to view the team's damage breakdown"${deferredPop("dpr", key)}>${fmt(grand)}</div>`
      + `<div class="c num total baseline" data-team="${esc(key)}" title="Click to measure every team against this one">${rank.pct}</div>`
      + `<div class="c gotodetail" data-team="${esc(key)}">view rotation<span class="arrow">›</span></div>`
      + `</div>`;
  };

  const memberHead = (n: number, i: number) => `<div class="c slothead">Slot ${n}</div>`
    + (seqCmpAt(i) ? `<div class="c num">Compare</div>` : "")
    + (refCmpAt(i) ? `<div class="c num">Compare</div>` : "")
    + GEAR_AXES.map((axis) => (openAt[axis][i] ? `<div class="c">${AXIS_HEAD[axis]}</div><div class="c num">Compare</div>` : "")).join("")
    + (dprAt(i) ? `<div class="c num">Avg Personal</div>` : "");
  const head = `<div class="trow thead">`
    + memberHead(3, 0) + memberHead(2, 1) + memberHead(1, 2)
    + `<div class="c num">Avg Team DPR</div>`
    + `<div class="c num huehead" title="Click to colour the column by rank">Compare</div>`
    + `<div class="c"></div>`
    + `</div>`;

  // one grid track per column rendered above, position by position
  const posCols = (i: number) => `max-content${seqCmpAt(i) ? " max-content" : ""}${refCmpAt(i) ? " max-content" : ""}${GEAR_AXES.map((axis) => (openAt[axis][i] ? " max-content max-content" : "")).join("")}${dprAt(i) ? " max-content" : ""}`;
  const gridStyle = `grid-template-columns:${posCols(0)} ${posCols(1)} ${posCols(2)} max-content max-content max-content`;

  const rowLines = (run: TeamRun): number => Math.max(1, ...run.members.map((m, i) =>
    (openAt.echoes[i] && axisOpen(m, filters, "echoes")) ? echoLines(m.loadout, run.combo[i]!.echo).length : 1));
  const lines = sorted.map(([, run]) => rowLines(run));
  const extra: number[] = [0];
  for (const n of lines) extra.push(extra[extra.length - 1]! + n - 1);
  const ranks = rankAll(sorted);

  // the widest cell per column over *every* row (the tracks are max-content, and a long name
  // scrolling into the window would otherwise widen the table under the reader) — --mono, so the
  // longest string is the widest
  const widest = (a: string, b: string): string => (b.length > a.length ? b : a);
  const blank = (): string[] => ["", "", ""];
  const wide = {
    name: blank(), dpr: blank(), seqcmp: blank(), refcmp: blank(), total: "", pct: "",
    gear: { weapons: blank(), echoes: blank(), mainstats: blank(), substats: blank() } as Record<GearAxis, string[]>,
    cmp: { weapons: blank(), echoes: blank(), mainstats: blank(), substats: blank() } as Record<GearAxis, string[]>,
  };
  sorted.forEach(([, run], i) => {
    run.members.forEach((m, pos) => {
      const combo = run.combo[pos]!;
      wide.name[pos] = widest(wide.name[pos]!, memberLabel(m, combo));
      wide.dpr[pos] = widest(wide.dpr[pos]!, fmt(run.bySlot.get(m.name) ?? 0));
      if (axisOpen(m, filters, "sequences")) wide.seqcmp[pos] = widest(wide.seqcmp[pos]!, gearCompare(run, pos, "sequences"));
      if (compares(m, filters, "refines", combo)) wide.refcmp[pos] = widest(wide.refcmp[pos]!, gearCompare(run, pos, "refines"));
      for (const axis of GEAR_AXES) {
        if (!showsRow(m, axis, combo)) continue;
        const text = axis === "weapons" ? [combo.weapon.name] : axis === "echoes" ? echoLines(m.loadout, combo.echo)
          : axis === "mainstats" ? [combo.mainstat.name] : [subsLabel(combo)];
        for (const line of text) wide.gear[axis][pos] = widest(wide.gear[axis][pos]!, line);
        wide.cmp[axis][pos] = widest(wide.cmp[axis][pos]!, gearCompare(run, pos, axis));
      }
    });
    wide.total = widest(wide.total, fmt(run.total));
    wide.pct = widest(wide.pct, ranks[i]!.pct);
  });
  // a zero-height ghost row (index.css `.tghost`) sizing every track to its final width
  const ghostPos = (i: number) =>
    `<div class="c name res"><span class="res-label">${esc(wide.name[i]!)}</span></div>`
    + (seqCmpAt(i) ? `<div class="c num slotcompare">${esc(wide.seqcmp[i]!)}</div>` : "")
    + (refCmpAt(i) ? `<div class="c num slotcompare">${esc(wide.refcmp[i]!)}</div>` : "")
    + GEAR_AXES.map((axis) => (openAt[axis][i]
      ? `<div class="c option">${esc(wide.gear[axis][i]!)}</div><div class="c num slotcompare">${esc(wide.cmp[axis][i]!)}</div>` : "")).join("")
    + (dprAt(i) ? `<div class="c num slotdpr">${esc(wide.dpr[i]!)}</div>` : "");
  // no `.teamdpr` on the ghost's Total cell: `drawWindow()` measures the row pitch off it
  const ghost = `<div class="trow tghost" aria-hidden="true">`
    + ghostPos(0) + ghostPos(1) + ghostPos(2)
    + `<div class="c num total">${esc(wide.total)}</div>`
    + `<div class="c num total baseline">${esc(wide.pct)}</div>`
    + `<div class="c gotodetail">view rotation<span class="arrow">›</span></div>`
    + `</div>`;
  tableView = { sorted, ranks, head, ghost, rowHtml, lines, extra };
  return `<main><div class="tclayout">`
    + `<aside class="tcside">${comparisonFilters()}</aside>`
    + `<div class="tcbody">`
    + `<h2 class="summary-label" id="teamCount">${fmt(sorted.length)} teams`
    + `<span class="hint">Click on a Resonator to filter and compare sequences, weapons, echoes</span></h2>`
    + `<div class="tcwrap"><div class="tgrid${hueShown ? " hued" : ""}" style="${gridStyle}">${head}${ghost}</div></div>`
    + `</div></div></main>`;
}

/* ------------------------------------------------------------------------ scroll window */

let rowHeight = 30;
let lineHeight = 17;
let measured = false;
const OVERSCAN = 40;
let drawnFrom = -1, drawnTo = -1;

/** The team every row is measured against — null for the weakest on screen. Survives redraws. */
let baselineTeam: string | null = null;
/** One monotonic hue ramp: red at the best, green at the baseline, purple at the worst. */
const BEST_HUE = 0, BASELINE_HUE = 120, WORST_HUE = 280;

function setBaseline(team: string | null): void {
  baselineTeam = baselineTeam === team ? null : team;
  if (tableView) { tableView.ranks = rankAll(tableView.sorted); drawWindow(true); }
}

/** Ranked over the sorted rows as data (only a window is in the DOM); the ratio spreads straight. */
function rankAll(sorted: TableView["sorted"]): RowRank[] {
  const totals = sorted.map(([, run]) => run.total);
  const pinned = baselineTeam == null ? -1 : sorted.findIndex(([key]) => key === baselineTeam);
  const base = pinned >= 0 ? totals[pinned]! : Math.min(...totals);
  const maxRatio = Math.max(...totals.map((t) => (base ? t / base : 1)), 1);
  const minRatio = Math.min(...totals.map((t) => (base ? t / base : 1)), 1);
  return totals.map((t, i) => {
    const ratio = base ? t / base : 1;
    const away = ratio >= 1
      ? (maxRatio > 1 ? (ratio - 1) / (maxRatio - 1) : 0)
      : (minRatio < 1 ? (1 - ratio) / (1 - minRatio) : 0);
    const hue = ratio >= 1
      ? BASELINE_HUE - away * (BASELINE_HUE - BEST_HUE)
      : BASELINE_HUE + away * (WORST_HUE - BASELINE_HUE);
    return { hue, pct: `${fmt(ratio * 100, 1, true)}%`, pinned: i === pinned };
  });
}

/** Draw the rows around the scroll position: head, a spacer, ~100 rows, a spacer. Redraws only
 *  once the viewport eats into the overscan. `scrollTop`: the position a render is about to restore. */
export function drawWindow(force = false, scrollTop?: number): void {
  const view = tableView;
  const main = app.querySelector("main");
  const grid = main?.querySelector<HTMLElement>(".tgrid");
  if (!view || !main || !grid) return;
  const n = view.sorted.length;
  const top = scrollTop ?? main.scrollTop;
  const headCell = grid.querySelector(".thead .c");
  const headH = headCell ? rect(headCell).height : 0;
  const rowsTop = rect(grid).top - rect(main).top + main.scrollTop + headH;
  const rowTop = (i: number): number => i * rowHeight + view.extra[i]! * lineHeight;
  const rowAt = (y: number): number => {
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (rowTop(mid + 1) <= y) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const seenFrom = Math.max(0, rowAt(top - rowsTop));
  const seenTo = Math.min(n, rowAt(top + main.clientHeight - rowsTop) + 1);
  const inside = seenFrom >= drawnFrom + (drawnFrom > 0 ? OVERSCAN / 2 : 0)
    && seenTo <= drawnTo - (drawnTo < n ? OVERSCAN / 2 : 0);
  if (!force && inside) return;
  const from = Math.max(0, seenFrom - OVERSCAN), to = Math.min(n, seenTo + OVERSCAN);

  const spacer = (a: number, b: number): string => (b > a ? `<div class="vspace" style="height:${rowTop(b) - rowTop(a)}px"></div>` : "");
  let body = "";
  for (let i = from; i < to; i++) {
    const [key, run] = view.sorted[i]!;
    body += view.rowHtml(key, run, view.ranks[i]!);
  }
  grid.innerHTML = view.head + view.ghost + spacer(0, from) + body + spacer(to, n);
  drawnFrom = from; drawnTo = to;

  // measure the real pitch off the rows just drawn, and redo the spacers once if the guess was off
  if (!measured && to - from >= 2) {
    measured = true;
    const cells = [...grid.querySelectorAll<HTMLElement>(".trow:not(.thead) > .c.teamdpr")];
    const heights = cells.slice(0, -1).map((c, j): [number, number] =>
      [rect(cells[j + 1]!).top - rect(c).top, view.lines[from + j]!]);
    const single = heights.find(([, k]) => k === 1), stacked = heights.find(([, k]) => k > 1);
    const base = single ? single[0] : stacked ? stacked[0] - lineHeight * (stacked[1] - 1) : rowHeight;
    const perLine = stacked ? (stacked[0] - base) / (stacked[1] - 1) : lineHeight;
    if (Math.abs(base - rowHeight) > 0.25 || Math.abs(perLine - lineHeight) > 0.25) {
      rowHeight = base; lineHeight = perLine;
      drawWindow(true, scrollTop);
    }
  }
}

/** Beside the table the aside must not set the page's height: its own height is taken back off
 *  as a negative bottom margin, so the table alone decides. */
const sideFit = new ResizeObserver((entries) => {
  for (const e of entries) {
    const el = e.target as HTMLElement;
    el.style.marginBottom = el.closest(".tclayout")?.classList.contains("stack") ? "" : `-${el.offsetHeight}px`;
  }
});

/** Beside the table while it leaves ≥370px (one column of boxes plus scrollbar), else stacked
 *  above it. Measured, since the table's width depends on which columns are open. */
export function fitSide(): void {
  const layout = app.querySelector<HTMLElement>(".tclayout");
  const side = app.querySelector<HTMLElement>(".tcside");
  const head = app.querySelector<HTMLElement>(".tgrid .trow.thead");
  const first = head?.firstElementChild, last = head?.lastElementChild;
  const main = app.querySelector<HTMLElement>("main");
  if (!layout || !side || !first || !last || !main) return;
  layout.classList.remove("stack");
  main.classList.remove("stack");
  // off the header's outer cells, not `scrollWidth`, which would chase the aside's own width
  const table = rect(last).right - rect(first).left;
  let room = layout.clientWidth;
  const beside = room - table - (parseFloat(getComputedStyle(layout).columnGap) || 0);
  const stacked = !(getComputedStyle(layout).flexDirection === "row" && beside >= 370);
  if (!stacked) room = beside;
  else {
    layout.classList.add("stack");
    main.classList.add("stack");
    const cs = getComputedStyle(main);
    room = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    side.style.width = `${room}px`;
  }
  side.style.maxHeight = stacked ? "" : `${main.clientHeight}px`;
  if (!stacked) side.style.width = "";
  side.style.marginBottom = stacked ? "" : `-${side.offsetHeight}px`;
  sideFit.disconnect();
  sideFit.observe(side);
}

/** Where the table was scrolled to when a detail page replaced it. */
export let tableScrollTop = 0;
export const rememberTableScroll = (): void => {
  if (app.querySelector(".tgrid")) tableScrollTop = app.querySelector("main")?.scrollTop ?? 0;
};

/** Whether the caret still belongs to the search bar by default. The load draws the table two or
 *  three times as it solves, and it is the last of those that has to end with the bar focused, so
 *  this stays on until the reader does something rather than counting draws. Their first event
 *  closes it out, and from then on a redraw leaves the focus wherever it is. Never on a touch
 *  screen: there focusing the bar throws the on-screen keyboard up over the page. */
let openingFocus = !matchMedia("(pointer: coarse)").matches;
for (const type of ["pointerdown", "keydown", "wheel"]) {
  addEventListener(type, () => { openingFocus = false; }, { capture: true, once: true });
}

export function renderComparison(): void {
  topbar.hidden = true;
  clearPops();
  const scrollTop = app.querySelector(".tgrid") ? (app.querySelector("main")?.scrollTop ?? 0) : tableScrollTop;
  app.innerHTML = comparisonTable(visibleRows);
  app.className = "";
  measured = false;
  drawnFrom = drawnTo = -1;
  fitSide();
  drawWindow(true, scrollTop);
  const main = app.querySelector("main")!;
  main.scrollTop = scrollTop;
  // the page opens with the caret in the search bar, so a filter is one word away (`openingFocus`)
  if (openingFocus) focusAfterDraw ??= null;
  // whichever bubble Enter stepped back to, if it is still there — the search bar otherwise, and
  // nothing at all where the redraw came from somewhere with no claim on the focus
  const back = focusAfterDraw;
  focusAfterDraw = undefined;
  if (back !== undefined) {
    const chip = back === null ? undefined
      : [...app.querySelectorAll<HTMLElement>(".tcchips .rchip, .tcchips .clearall")].find((el) => chipSig(el) === back);
    if (chip) chip.focus({ preventScroll: true }); else focusSearch();
  }
  let queued = false;
  main.addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; drawWindow(); });
  }, { passive: true });
}

/* ------------------------------------------------------------------------------- handlers */

addEventListener("resize", () => { fitSide(); drawWindow(true); });

document.addEventListener("click", (e) => {
  const el = (e.target as Element).closest<HTMLElement>(".c.baseline");
  if (el?.dataset.team) setBaseline(el.dataset.team);
});
document.addEventListener("click", (e) => {
  if (!(e.target as Element).closest(".c.huehead")) return;
  hueShown = !hueShown;
  document.querySelector(".tgrid")?.classList.toggle("hued", hueShown);
});
document.addEventListener("change", (e) => {
  const select = e.target as HTMLSelectElement;
  if (select.id !== "cost") return;
  withRowCap(() => {
    const was = filters.cost;
    filters.cost = select.value as TeamCost;
    return () => { filters.cost = was; select.value = was; };
  });
});
document.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id !== "matrix") return;
  withRowCap(() => {
    const was = filters.matrix;
    filters.matrix = input.checked;
    return () => { filters.matrix = was; input.checked = was; };
  });
});

/** What the open menu was opened on, null for one that files nothing (`showMenu` clears it, each
 *  opener sets it after). Every menu opens at the pointer, so the second press of a double lands
 *  on the menu rather than on the cell — this is how it still reads as the cell's. */
let menuOrigin: { map: Map<string, ResonatorFilter>; value: string; named: boolean } | null = null;

/** What a press is on: the cell under it, or the open menu's own origin where that menu is now
 *  covering the cell. `named` is the resonator cells alone — what the right button files. */
const pressTarget = (e: Event, named: boolean): { map: Map<string, ResonatorFilter>; value: string } | undefined => {
  const name = (e.target as Element).closest<HTMLElement>(".c.name.res")?.dataset.resonator;
  if (name) return { map: resonatorFilters, value: name };
  const pick = named ? undefined : optionPick(e);
  // the weapon at any rank: the rank is a line of the cell's menu, not what a double press files
  if (pick) return { map: pick[0], value: pick[0] === weaponFilters ? pick[1].replace(/ R\d$/, "") : pick[1] };
  if (!(e.target as Element).closest(".ctxmenu") || !menuOrigin || (named && !menuOrigin.named)) return undefined;
  return { map: menuOrigin.map, value: menuOrigin.value };
};

/** A double press of either button, counted here rather than left to `dblclick` — that fires only
 *  for the primary button, and only after the menu the first press opened has already taken the
 *  second one. The same target, twice inside the interval a double press is. */
let lastPress = { key: "", at: 0 };
const doublePress = (key: string): boolean => {
  const now = Date.now();
  const again = key === lastPress.key && now - lastPress.at < 400;
  lastPress = { key: again ? "" : key, at: now };
  return again;
};

/** Both buttons' doubles, ahead of everything so the second press beats the menu's own dismissal
 *  (registered on the window later, from inside `showMenu`) and whichever item it is sitting on.
 *  This is what lets every menu open on the first press with no wait at all. */
for (const [type, mode, named] of [["click", "include", false], ["contextmenu", "exclude", true]] as const) {
  addEventListener(type, (e) => {
    const target = pressTarget(e, named);
    if (!target || !doublePress(`${type}|${target.map === resonatorFilters ? "res" : "gear"}|${target.value}`)) return;
    e.preventDefault();
    e.stopPropagation();
    quickInclude(() => setFilter(target.map, target.value, mode));
  }, true);
}
/** The cell reads "Suoming S6R1": the resonator, then the level and rank as their own lines
 *  wherever the rows differ on them, each also opening the compares scoped to it. */
const openNameMenu = (el: HTMLElement, x: number, y: number): void => {
  const resonator = el.dataset.resonator ?? "";
  const key = resonator;
  const compareItem = (axis: Axis): MenuItem => ({
    label: `${filters[axis].includes(resonator) ? "Stop comparing" : "Compare"} ${resonator} ${AXIS_LABEL[axis].toLowerCase()}`,
    run: () => setCompare(resonator, axis),
  });
  const tagged = (tag: string | undefined, map: Map<string, ResonatorFilter>): MenuItem[] => (tag ? [
    { label: `Show only ${tag} teams`, run: () => setFilter(map, tag, "include") },
    { label: `Hide ${tag} teams`, run: () => setFilter(map, tag, "exclude") },
  ] : []);
  // the compares the level and rank open, each filed under the axis it is a narrower form of, so
  // "Compare Qingxiao R5 sonatas" reads directly below "Compare Qingxiao sonatas"
  const scoped = [
    ...(el.dataset.sequence ? scopedItems(resonator, "sequence", el.dataset.seqGate ?? "") : []),
    ...(el.dataset.refine ? scopedItems(resonator, "refine", el.dataset.refGate ?? "") : []),
  ];
  const filed = new Set<Axis>();
  const axisBlock = (axis: Axis): MenuItem[] => {
    filed.add(axis);
    return [compareItem(axis), ...scoped.filter((x) => x.axis === axis)];
  };
  const items: MenuItem[] = [
    { label: `Show ${key} teams`, run: () => setFilter(resonatorFilters, key, "include") },
    { label: `Hide ${key} teams`, run: () => setFilter(resonatorFilters, key, "exclude") },
    ...tagged(el.dataset.sequence, sequenceFilters),
    ...tagged(el.dataset.refine, refineFilters),
    // every axis this resonator has more than one option on, the substat spread last of all —
    // it is the one that says how the whole build is invested rather than which pick it wears
    ...AXES.filter((axis) => axis !== "substats" && comparable(resonator, axis)).flatMap(axisBlock),
    ...(comparable(resonator, "substats") ? axisBlock("substats") : []),
    // a scoped compare whose own axis has no whole-resonator line to sit under still needs one
    ...scoped.filter((x) => !filed.has(x.axis)),
  ];
  showMenu(x, y, items);
  menuOrigin = { map: resonatorFilters, value: resonator, named: true };
};
const openNameMenuAt = (e: MouseEvent): void => {
  const el = (e.target as Element).closest<HTMLElement>(".c.name.res");
  if (!el?.dataset.resonator) return;
  e.preventDefault();
  openNameMenu(el, e.clientX, e.clientY);
};
document.addEventListener("click", openNameMenuAt);
document.addEventListener("contextmenu", openNameMenuAt);
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let hoverAt: [number, number] = [0, 0];
document.addEventListener("mousemove", (e) => { hoverAt = [e.clientX, e.clientY]; });
document.addEventListener("mouseover", (e) => {
  const el = (e.target as Element).closest<HTMLElement>(".c.name.res");
  if (!el?.dataset.resonator || el.contains(e.relatedTarget as Node | null)) return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (document.querySelector(".ctxmenu") || !el.matches(":hover") || Date.now() - lastQuickInclude < 1500) return;
    openNameMenu(el, hoverAt[0], hoverAt[1]);
  }, 1000);
});
document.addEventListener("mouseout", (e) => {
  const el = (e.target as Element).closest<HTMLElement>(".c.name.res");
  if (el && !el.contains(e.relatedTarget as Node | null)) clearTimeout(hoverTimer);
});

// a gear pick cell, keyed by `data-kind`/`data-value` so one pair of handlers covers every axis
const optionPick = (e: Event): [Map<string, ResonatorFilter>, string] | undefined => {
  const el = (e.target as Element).closest<HTMLElement>(".c.option");
  const kind = el?.dataset.kind as OptionKind | undefined;
  const value = el?.dataset.value;
  return kind && value ? [OPTION_FILTER_MAPS[kind], value] : undefined;
};
/** A weapon cell reads "Verdant Summit R3": the weapon and, while ranks are what the rows differ
 *  by, the weapon at that rank each get their own lines. */
const openOptionMenu = (e: MouseEvent): void => {
  const pick = optionPick(e);
  if (!pick) return;
  e.preventDefault();
  const [x, y] = [e.clientX, e.clientY];
  const [map, key] = pick;
  const el = (e.target as Element).closest<HTMLElement>(".c.option")!;
  const kind = el.dataset.kind as OptionKind;
  const resonator = el.dataset.resonator ?? "";
  const base = kind === "weapon" ? key.replace(/ R\d$/, "") : key;
  const ranked = kind === "weapon" && (filters.refines.includes(resonator)
    || filters.scoped.some((s) => s.resonator === resonator && s.axis === "refines"));
  const axis = kind === "weapon" ? "weapons" : "echoes";
  const word = kind === "weapon" ? "weapons" : "sonatas";
  const items: MenuItem[] = [
    // the compares that opened this column lead, offered back as a way to close it — the same
    // shape a main-stat or substat cell's own menu has (`openStatMenu`)
    ...(filters[axis].includes(resonator) ? [{ label: `Stop comparing ${word}`, run: () => setCompare(resonator, axis) }] : []),
    // the rank rides in this same cell while refines are compared, so it is closed from here too
    ...(kind === "weapon" && filters.refines.includes(resonator)
      ? [{ label: `Stop comparing ${AXIS_LABEL.refines.toLowerCase()}`, run: () => setCompare(resonator, "refines") }] : []),
    ...filters.scoped.filter((s) => s.resonator === resonator && s.axis === axis)
      .map((s) => ({ label: `Stop comparing ${scopedLabel(s)} ${word}`, run: () => setScoped(s) })),
    { label: `Show only ${base}`, run: () => setFilter(map, base, "include") },
    { label: `Hide ${base}`, run: () => setFilter(map, base, "exclude") },
    ...(ranked ? [
      { label: `Show only ${key}`, run: () => setFilter(map, key, "include") },
      { label: `Hide ${key}`, run: () => setFilter(map, key, "exclude") },
    ] : []),
    ...(resonator && kind === "weapon" ? scopedItems(resonator, "weapon", base) : []),
    ...(resonator && ranked ? scopedItems(resonator, "weaponRank", key) : []),
    ...(resonator && kind === "echo" ? scopedItems(resonator, "echo", key) : []),
  ];
  showMenu(x, y, items);
  menuOrigin = { map, value: base, named: false };
};
document.addEventListener("click", openOptionMenu);
document.addEventListener("contextmenu", openOptionMenu);

/** A main-stat or substat cell: nothing filters on either (see the cells themselves), so the menu
 *  is the compares that opened the column — the resonator's own and any scoped to one of their
 *  picks — offered back as a way to close it. The substat cell also offers their main stats, the
 *  column right after it. */
const openStatMenu = (e: MouseEvent): void => {
  const el = (e.target as Element).closest<HTMLElement>(".c.option[data-stat]");
  if (!el) return;
  e.preventDefault();
  const [x, y] = [e.clientX, e.clientY];
  const axis = el.dataset.stat as "mainstats" | "substats";
  const resonator = el.dataset.resonator ?? "";
  const word = axis === "mainstats" ? "mainstats" : "substats";
  const items: MenuItem[] = [
    ...(filters[axis].includes(resonator)
      ? [{ label: `Stop comparing ${word}`, run: () => setCompare(resonator, axis) }] : []),
    ...filters.scoped.filter((s) => s.resonator === resonator && s.axis === axis)
      .map((s) => ({ label: `Stop comparing ${scopedLabel(s)} ${word}`, run: () => setScoped(s) })),
    ...(axis === "substats" && comparable(resonator, "mainstats") ? [{
      label: `${filters.mainstats.includes(resonator) ? "Stop comparing" : "Compare"} ${resonator} mainstats`,
      run: () => setCompare(resonator, "mainstats"),
    }] : []),
  ];
  showMenu(x, y, items);
};
document.addEventListener("click", openStatMenu);
document.addEventListener("contextmenu", openStatMenu);

// a search result: either button adds it to the pool — a chip is where it comes back off
const searchPick = (e: Event): [Map<string, ResonatorFilter>, string] | undefined => {
  const el = (e.target as Element).closest<HTMLElement>(".sresult");
  const kind = el?.dataset.kind as SearchKind | undefined;
  const value = el?.dataset.value;
  if (!kind || !value) return undefined;
  return [kind === "resonator" ? resonatorFilters : OPTION_FILTER_MAPS[kind], value];
};
const addSearchHit = (e: Event): void => {
  const pick = searchPick(e);
  if (!pick) return;
  e.preventDefault();
  clearSearch();
  focusAfterDraw = null;
  setFilter(...pick, "include");
  focusSearch();
};
document.addEventListener("click", addSearchHit);
document.addEventListener("contextmenu", addSearchHit);

// a chip press must not take focus off the search bar (a grey blink across a solve)
document.addEventListener("mousedown", (e) => {
  if ((e.target as Element).closest?.(".rchip")) e.preventDefault();
});
const removeChip = (e: Event): void => {
  const chip = (e.target as Element).closest<HTMLElement>(".rchip");
  if (!chip) return;
  e.preventDefault();
  const axis = chip.dataset.axis as Axis | undefined;
  if (axis) { setCompare(chip.dataset.resonator ?? "", axis); return; }
  const scoped = chip.dataset.scoped;
  if (scoped) { const s = filters.scoped.find((x) => scopedKey(x) === scoped); if (s) setScoped(s); return; }
  const name = chip.dataset.resonator;
  const kind = chip.dataset.kind as OptionKind | undefined;
  const map = name ? resonatorFilters : kind ? OPTION_FILTER_MAPS[kind] : undefined;
  const key = name ?? chip.dataset.value;
  const was = map && key ? map.get(key) : undefined;
  if (!map || !key || was === undefined) return;
  withRowCap(() => {
    map.delete(key);
    return () => map.set(key, was);
  });
};
document.addEventListener("click", removeChip);
document.addEventListener("contextmenu", removeChip);
document.addEventListener("click", (e) => {
  if (!(e.target as Element).closest(".clearall")) return;
  withRowCap(() => {
    const maps = [resonatorFilters, ...(Object.values(OPTION_FILTER_MAPS) as Map<string, ResonatorFilter>[])];
    const kept = maps.map((map) => [...map]);
    const compares = AXES.map((axis) => [...filters[axis]]);
    const scoped = [...filters.scoped];
    for (const map of maps) map.clear();
    for (const axis of AXES) filters[axis] = [];
    filters.scoped = [];
    return () => {
      maps.forEach((map, i) => { for (const [n, mode] of kept[i]!) map.set(n, mode); });
      AXES.forEach((axis, i) => { filters[axis] = compares[i]!; });
      filters.scoped = scoped;
    };
  });
});

/** A bubble's identity across the redraw its own removal starts — its dataset is what makes one,
 *  and Clear Filters has none of its own. */
const chipSig = (el: HTMLElement): string => (el.classList.contains("clearall") ? "clearall"
  : [el.dataset.axis, el.dataset.scoped, el.dataset.kind, el.dataset.resonator, el.dataset.value].join(" "));
/** Where to put the focus once the next redraw is done (`renderComparison`): a bubble by its own
 *  `chipSig`, null for the search bar, undefined to leave the focus wherever it already is. Only
 *  the bar's own flows book one — a checkbox toggled or a filter set from a table menu redraws
 *  without the caret jumping into the bar behind it. */
let focusAfterDraw: string | null | undefined;

/** The filter bar's own Tab ring: the search bar, then every bubble it has set, then Clear
 *  Filters, and round again. */
const tabRing = (): HTMLElement[] => {
  const search = document.querySelector<HTMLElement>("#optionSearch");
  return search ? [search, ...document.querySelectorAll<HTMLElement>(".tcchips .rchip, .tcchips .clearall")] : [];
};
// Tab walks that ring — from the bar with nothing to walk in it (the hits come first, see below),
// from a bubble, or with nothing focused at all, which lands on the search bar. From anywhere else
// it is left alone: a checkbox or the cost select keeps its own Tab, so the keyboard is never
// trapped in the bar. A ring of just the bar still swallows the press rather than letting it walk
// out of the page — there is nowhere else in the bar to be.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  const el = e.target as HTMLElement | null;
  if (el?.id === "optionSearch" && searchHits().length) return;
  const ring = tabRing();
  const at = el ? ring.indexOf(el) : -1;
  if (!ring.length || (at < 0 && el !== document.body)) return;
  e.preventDefault();
  ring[at < 0 ? (e.shiftKey ? ring.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + ring.length) % ring.length]!.focus();
});

// Enter or Backspace on a bubble takes it off and steps back to the one before it, or to the
// search bar where it was the first — so a run of them clears without reaching for the mouse.
// Both ask for the click themselves rather than leaving Enter to the button's own activation:
// that lands a tick later, and the booking of where the focus goes next raced the redraw.
document.addEventListener("keydown", (e) => {
  if ((e.key !== "Enter" && e.key !== "Backspace") || e.ctrlKey || e.metaKey || e.altKey) return;
  const chip = (e.target as Element).closest<HTMLElement>(".rchip");
  if (!chip) return;
  e.preventDefault();
  const ring = tabRing();
  const prev = ring[ring.indexOf(chip) - 1];
  focusAfterDraw = prev && prev.id !== "optionSearch" ? chipSig(prev) : null;
  chip.click();
});

// Enter anywhere else on the page puts the caret in the search bar, so a filter is always one
// keystroke away. Only from something that does nothing with Enter itself: a control that has its
// own meaning for it (a field, a menu item, a link) keeps it.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey) return;
  const el = e.target as HTMLElement | null;
  if (el && (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(el.tagName) || el.isContentEditable)) return;
  const search = document.querySelector<HTMLInputElement>("#optionSearch");
  if (!search) return;
  e.preventDefault();
  focusSearch();
});

// In the search bar: Tab walks the hits (Shift+Tab back), Enter takes whichever it stopped on —
// the first while it has not been pressed. Tab is taken over outright, so the focus never leaves
// the bar mid-search; Escape or a click away is how the list is left.
document.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).id !== "optionSearch") return;
  if (e.key === "Tab" && searchHits().length) {
    e.preventDefault();
    cycleSearch(e.shiftKey ? -1 : 1);
    return;
  }
  if (e.key !== "Enter") return;
  const hit = searchChoice();
  if (!hit) return;
  e.preventDefault();
  clearSearch();
  focusAfterDraw = null;
  setFilter(hit.kind === "resonator" ? resonatorFilters : OPTION_FILTER_MAPS[hit.kind], hit.value, "include");
  focusSearch();
});
