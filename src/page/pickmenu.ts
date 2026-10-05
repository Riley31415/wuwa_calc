/** The detail page's pick menus: an Equipment cell lists what its compare would offer, and taking one
 *  opens that compare (or shuts it, for the cost's own default) and swaps to its row. */
import { comboOf, compares, echoPicks, gateOf, loadoutName, mainstatRanking, scopedOpen, sequenceLevels, weaponBase } from "../solve/solver.js";
import type { Axis, Filters, Gate, Member, Pick } from "../solve/solver.js";
import type { TeamRun } from "../solve/teamrun.js";
import { Tier } from "../engine/stats.js";
import { filters, results, routeTeam, picksOfKey, prospectiveRows, snapshotFilters, admitTeam, admitBuild, pruneGearFilters, solvedRows, ROW_CAP } from "./model.js";
import type { TeamRow } from "./model.js";
import { dropPanel, holdPanels, subsLabel } from "./panels.js";
import type { PickKind } from "./panels.js";
import { showMenu, rowCapWarning, teamFigure, personalFigure, pctTrunc } from "./table.js";
import type { MenuItem } from "./table.js";

/** One line of a menu: `pick` is the member's pick with it taken, `is` whether a row's pick wears
 *  it, `axis` the compare that lists it, `free` what of the member's pick re-picks at its best. A main
 *  stat carries the `run` that ranked it. */
interface Choice { label: string; axis: Axis; pick: Pick; is: (p: Pick) => boolean; free: (keyof Pick)[]; current: boolean; run?: TeamRun }

/** What a row is matched on — the Matrix is the filters', the same on every row. */
const FIELDS = ["weapon", "echo", "mainstat", "sequence", "refine", "highSubs"] as const;

const picksOf = (run: TeamRun): Pick[] => picksOfKey(`${run.teamKey}-${run.combo.map((c) => c.key).join("-")}`)!;

/** One try at a pick: `setUp` puts its filters in place (false where they can't stand), and `choose`
 *  names the row it lands on among the team's rows under them, if any. */
export interface Attempt { setUp: () => boolean; choose: (rows: TeamRow[]) => TeamRow | null }

/** Set by index.ts: solve the team under each try's filters in turn and open the first row one names. */
let switchTo: (teamKey: string, attempts: Attempt[], undo: () => void) => Promise<void> = async () => {};
export const onSwitch = (fn: typeof switchTo): void => {
  switchTo = fn;
};
/** Set by index.ts: solve the team under `f` out of sight, for an open menu's Compare figures. */
let solveQuiet: (teamKey: string, f: Filters) => Promise<void> = async () => {};
export const onSolve = (fn: typeof solveQuiet): void => {
  solveQuiet = fn;
};

/** Member `i`'s menu for one cell, every option its compare lists, the one worn included. */
function choices(run: TeamRun, i: number, kind: PickKind): Choice[] {
  const m = run.members[i]!, l = m.loadout;
  const cur = picksOf(run)[i]!;
  const choice = (label: string, axis: Axis, pick: Pick, is: (p: Pick) => boolean, free: (keyof Pick)[]): Choice =>
    ({ label, axis, pick, is, free, current: is(cur) });
  // anything but the echoes themselves re-picks them, and anything but a main stat re-rolls it
  const regear: (keyof Pick)[] = ["echo", "mainstat"];
  if (kind === "sequences") {
    return sequenceLevels(m, { ...filters, sequences: [...filters.sequences, m.name] })
      .map((n) => choice(loadoutName(l, n), "sequences", { ...cur, sequence: n }, (p) => p.sequence === n, regear));
  }
  if (kind === "weapons") {
    const ranks = l.refinements[cur.weapon]!;
    return [
      ...l.weapons.map((w, k) => choice(weaponBase(w), "weapons", { ...cur, weapon: k, refine: Math.min(cur.refine, l.refinements[k]!.length - 1) },
        (p) => p.weapon === k, regear)),
      // the worn weapon's other ranks, by their own names ("Discord R2")
      ...(ranks.length > 1 ? ranks.map((w, r) => choice(w.name, "refines", { ...cur, refine: r },
        (p) => p.weapon === cur.weapon && p.refine === r, regear)) : []),
    ];
  }
  if (kind === "sonata" || kind === "mainslot") {
    const setsOf = (e: number): string => l.echoLoadouts[e]!.sets.map((g) => g.name).join(" + ");
    const slotOf = (e: number): string => l.echoLoadouts[e]!.mainslot.name;
    const [labelOf, otherOf] = kind === "sonata" ? [setsOf, slotOf] : [slotOf, setsOf];
    const echoes = echoPicks(m, run.members);
    return [...new Set(echoes.map(labelOf))].map((label) => {
      // the half not picked is held where this option comes with it, else re-picked at its best
      const wearing = echoes.filter((e) => labelOf(e) === label);
      const held = wearing.find((e) => otherOf(e) === otherOf(cur.echo));
      return choice(label, "echoes", { ...cur, echo: held ?? wearing[0]! }, (p) => labelOf(p.echo) === label,
        held === undefined ? regear : ["mainstat"]);
    });
  }
  if (kind === "mainstats") {
    return mainstatRanking(run.teamKey, run.members, picksOf(run), i).map(({ mainstat: k, run: ranked }) =>
      ({ ...choice(l.mainstats[k]!.name, "mainstats", { ...cur, mainstat: k }, (p) => p.mainstat === k, []), run: ranked }));
  }
  return [false, true].map((h) => choice(subsLabel(comboOf(l, { ...cur, highSubs: h })), "substats", { ...cur, highSubs: h },
    (p) => p.highSubs === h, regear));
}

/** Whether a cell has anything to swap to — main stats by their list alone, ranking them being a run. */
export function canPick(run: TeamRun, i: number, kind: PickKind): boolean {
  if (kind === "mainstats") return run.members[i]!.loadout.mainstats.length > 1;
  return choices(run, i, kind).length > 1;
}

/** The row a pick lands on: one wearing it where any does, then the fewest other changes from
 *  `cur` (bar what the pick re-picks), then the best of those as the table ranks them. */
function closest(rows: TeamRow[], cur: Pick[], i: number, c: Choice): TeamRow | null {
  let best: TeamRow | null = null;
  let score: number[] = [];
  for (const row of rows) {
    const picks = picksOfKey(row.key)!;
    const off = picks.reduce((n, p, j) => n + FIELDS.filter((f) => (j === i
      ? !c.free.includes(f) && p[f] !== c.pick[f] : p[f] !== cur[j]![f])).length, 0);
    const s = [Number(!c.is(picks[i]!)), off, -teamFigure(results.get(row.key)!)];
    const at = s.findIndex((v, k) => v !== score[k]);
    if (!best || (at >= 0 && s[at]! < score[at]!)) {
      best = row;
      score = s;
    }
  }
  return best;
}

/** The filters with `m`'s compare on `axis` open where nothing on `gate` already opens it. */
function opened(m: Member, axis: Axis, gate: Gate, from: Filters = filters): Filters {
  const f = structuredClone(from);
  if (compares(m, f, axis, gate)) return f;
  // a rank opens on this weapon alone, as the table's own weapon cell offers it
  if (axis === "refines") f.scoped.push({ resonator: m.name, on: "weapon", value: weaponBase(gate.weapon), axis: "refines" });
  else f[axis].push(m.name);
  return f;
}

/** Shut `m`'s compare on `axis` wherever it opens on `gate`: their own (a weapon compare taking the
 *  ranks with it, as the table's does) and any scoped to this pick. */
function shutCompare(m: Member, axis: Axis, gate: Gate): void {
  for (const a of axis === "weapons" ? ["weapons", "refines"] as const : [axis]) filters[a] = filters[a].filter((n) => n !== m.name);
  filters.scoped = filters.scoped.filter((s) => s.resonator !== m.name || s.axis !== axis || !scopedOpen(m, { ...filters, scoped: [s] }, axis, gate));
  pruneGearFilters();
}

/** Take a menu line. Its compare shut first: where the table lands on the pick without it, the pick is
 *  the cost's own default and the compare goes. Else it opens where nothing on this row already does. */
function take(run: TeamRun, i: number, c: Choice): void {
  const m = run.members[i]!;
  const cur = picksOf(run);
  const gate = gateOf(m.loadout, c.pick);
  const undo = snapshotFilters();
  // the team and the build as guessed kept on the table, and what that costs it in rows
  const admit = (): number => {
    admitTeam(run.teamKey);
    admitBuild(run.members, cur.map((p, j) => comboOf(run.members[j]!.loadout, j === i ? c.pick : p)));
    return prospectiveRows();
  };
  const shut: Attempt = {
    setUp: () => {
      undo();
      shutCompare(m, c.axis, gate);
      return admit() <= ROW_CAP;
    },
    choose: (rows) => {
      const row = closest(rows, cur, i, c);
      return row && c.is(picksOfKey(row.key)![i]!) ? row : null;
    },
  };
  const open: Attempt = {
    setUp: () => {
      undo();
      Object.assign(filters, opened(m, c.axis, gate));
      const total = admit();
      rowCapWarning(total > ROW_CAP ? total : null);
      return total <= ROW_CAP;
    },
    choose: (rows) => closest(rows, cur, i, c),
  };
  void switchTo(run.teamKey, [shut, open], undo);
}

/** What a dropdown box copies off the cell it hangs from, so each reads as one more cell of it. */
const LOOK = ["font-family", "font-size", "font-weight", "font-variant-numeric", "line-height", "letter-spacing", "text-transform",
  "text-align", "white-space", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-top-style", "border-top-color"];

/** Each option's Compare figure as the table reads it: its member's own DPR on the row it lands on, over
 *  the axis's baseline (table.ts's `bestOf`), the weakest option standing in where that is off the list. */
function ratios(m: Member, owns: [Choice, number][]): [Choice, number][] {
  const l = m.loadout, axis = owns[0]?.[0].axis;
  const low = Math.min(...owns.map(([c]) => c.pick.sequence));
  // weapons read with their ranks beside them measure against a standard weapon at R1
  const ranked = owns.some(([c]) => c.axis === "refines");
  const keep = axis === "weapons" ? (c: Choice) => l.weapons[c.pick.weapon]!.tier !== Tier.Limited && (!ranked || c.pick.refine === 0)
    : axis === "refines" ? (c: Choice) => c.pick.refine === 0
    : axis === "sequences" ? (c: Choice) => c.pick.sequence === low
    : axis === "substats" ? (c: Choice) => !c.pick.highSubs
    : () => true;
  const pool = owns.filter(([c]) => keep(c)).map(([, v]) => v);
  const base = pool.length ? Math.max(...pool) : Math.min(...owns.map(([, v]) => v));
  return base > 0 ? owns.map(([c, v]) => [c, v / base]) : [];
}

/** Write each option's Compare figure, and the cell's own, in grey at its right edge — filled in as each
 *  compare's rows come in, solved out of sight where they aren't yet. */
async function showRatios(run: TeamRun, i: number, list: Choice[], boxes: Map<Choice, HTMLElement>, cell: HTMLElement): Promise<void> {
  const m = run.members[i]!;
  const cur = picksOf(run);
  const gate = gateOf(m.loadout, cur[i]!);
  const axes = [...new Set(list.map((c) => c.axis))];
  // a weapon's ranks read as the table reads them with both compares open: one figure, against the
  // standard weapon, rather than a rank compare of their own against R1
  const groups = axes.includes("refines") ? [axes] : axes.map((a) => [a]);
  for (const group of groups) {
    const axis = group[0]!;
    const own = list.filter((c) => group.includes(c.axis));
    let owns: [Choice, number][];
    if (axis === "mainstats") owns = own.map((c) => [c, personalFigure(c.run!, m.name)]);
    else {
      const f = group.reduce((at, a) => opened(m, a, gate, at), filters);
      await solveQuiet(run.teamKey, f);
      const rows = solvedRows(run.teamKey, f);
      owns = own.flatMap((c): [Choice, number][] => {
        const row = closest(rows, cur, i, c);
        return row && c.is(picksOfKey(row.key)![i]!) ? [[c, personalFigure(results.get(row.key)!, m.name)]] : [];
      });
    }
    if (!cell.classList.contains("picking")) return;
    for (const [c, ratio] of ratios(m, owns)) {
      // the cell reads the first compare its menu lists (a weapon's, not its rank's)
      const box = c.current ? (c.axis === axes[0] ? cell : undefined) : boxes.get(c);
      if (!box) continue;
      const tag = box.appendChild(document.createElement("span"));
      tag.className = "pickpct";
      tag.textContent = pctTrunc(ratio);
    }
  }
}

/** Cut every box of the dropdown to `cell`'s own size and look: its type and padding, its colour, and
 *  the ground it stands on, which for most cells is the table's own behind them. */
function dressAs(menu: HTMLElement, cell: HTMLElement): void {
  const cs = getComputedStyle(cell);
  let ground = "";
  for (let at: Element | null = cell; at && !ground; at = at.parentElement) {
    const bg = getComputedStyle(at).backgroundColor;
    if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") ground = bg;
  }
  const look = LOOK.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";");
  const r = cell.getBoundingClientRect();
  menu.classList.add("pickdrop");
  menu.style.left = `${r.left}px`;
  menu.style.width = `${r.width}px`;
  for (const box of menu.querySelectorAll<HTMLElement>(".ctxitem")) {
    box.style.cssText += `;${look};color:${cs.color};background-color:${ground};box-shadow:${cs.boxShadow}`;
    // a label the cell's width cuts short (a whole sonata combination) is read in full on hover
    if (box.scrollWidth > box.clientWidth) box.title = box.textContent ?? "";
  }
}

/** A dropdown hung from the cell, listing everything but the pick the cell already shows; the hover
 *  panels stand down while it is open. */
const openPickMenu = (e: MouseEvent): void => {
  const el = (e.target as Element).closest<HTMLElement>(".rtable.loadout .c[data-pick]");
  const key = el ? routeTeam() : null;
  const run = key ? results.get(key) : undefined;
  if (!el || !run) return;
  e.preventDefault();
  // the press that took this cell's own menu down (`showMenu`'s outside click) opens nothing
  if (reopened === el) return;
  openCell = el;
  const i = Number(el.dataset.slot);
  const list = choices(run, i, el.dataset.pick as PickKind);
  const offered = list.filter((c) => !c.current);
  const items = offered.map((c): MenuItem => ({ label: c.label, run: () => take(run, i, c) }));
  const r = el.getBoundingClientRect();
  dropPanel();
  holdPanels(true);
  // one box laid over everything, as the log's own picks are: on the cell, then on the option under
  // the pointer, and back on the cell once the pointer leaves the options
  const box = document.body.appendChild(document.createElement("div"));
  box.className = "pickbox";
  const frame = (at: Element): void => {
    const b = at.getBoundingClientRect();
    box.style.cssText = `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px`;
  };
  frame(el);
  el.classList.add("picking");
  // a pixel up, so the first option's white edge lands on the cell's own (index.css `.pickdrop`)
  const menu = showMenu(r.left, r.bottom - 1, items, () => {
    holdPanels(false);
    box.remove();
    el.classList.remove("picking");
    openCell = null;
    el.querySelector(".pickpct")?.remove();
  });
  dressAs(menu, el);
  const boxes = new Map(offered.map((c, n): [Choice, HTMLElement] => [c, menu.querySelectorAll<HTMLElement>(".ctxitem")[n]!]));
  void showRatios(run, i, list, boxes, el);
  menu.addEventListener("mouseover", (ev) => frame((ev.target as Element).closest(".ctxitem") ?? el));
  menu.addEventListener("mouseleave", () => frame(el));
};
/** The cell whose menu is open, and the one a press has just landed on again — read off ahead of
 *  `showMenu`'s own outside click, which takes the menu down before the press reaches the cell. */
let openCell: HTMLElement | null = null;
let reopened: HTMLElement | null = null;
for (const type of ["click", "contextmenu"]) {
  addEventListener(type, (e) => {
    reopened = openCell?.contains(e.target as Node) ? openCell : null;
  }, true);
}
document.addEventListener("click", openPickMenu);
document.addEventListener("contextmenu", openPickMenu);
