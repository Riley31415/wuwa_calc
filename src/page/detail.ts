/**
 * The detail page: the DPR and energy tables, the action log grid, and the log's draggable
 * column order (kept in localStorage) with its pointer handlers.
 */
import { Stat, SCALING_NAME } from "../engine/stats.js";
import type { Gear } from "../engine/gear.js";
import { menuStats } from "../engine/context.js";
import { TUNE_BREAK_ENEMY } from "../shared/tunebreak.js";
import type { ChainGroup, ResolvedSnapshot } from "../engine/evaluate.js";
import { columnOf, gaugeSuffix, fmt, PAD_DIGITS_COLUMNS, GROUPED_COLUMNS, OFFTUNE_RATE, ENERGY_RATE } from "../display.js";
import type { Report, Column, ReportRow, ReportPart, TraceEntry } from "../display.js";
import type { TeamRun } from "../teamrun.js";
import { hitsOf } from "../teamrun.js";
import { results, detailFor, FALLBACK_HUE } from "./model.js";
import { esc, lazyPop, rect, zoom, clearPops, panelRow, popover, infoPopover, buffsPopover, equippedGear, gearPopover, dprTable } from "./panels.js";
import { rememberTableScroll } from "./table.js";

const app = document.getElementById("app")!;
const topbar = document.getElementById("topbar")!;

/* ------------------------------------------------------------------------------ action log */

const BUFF_UNDERLINE_COLUMNS = new Set(["mv", "energy", "concerto", "offtune"]);
const RUNNING_COLUMNS = new Set(["concerto", "energy", "offtune"]);
const isRunning = (key: string): boolean => RUNNING_COLUMNS.has(key) || key.startsWith("gauge:");

/** A grid track: the column's character width times --cw, plus the cell padding. */
const colWidth = (c: Column): string => `calc(var(--cw) * ${c.width} + var(--cpad))`;

function cell(col: Column, { cls = [], html = "", pop = "", style = "" }: { cls?: string[]; html?: string; pop?: string; style?: string } = {}): string {
  const classes = ["c", col.align === "left" ? "" : "num", ...cls].filter(Boolean).join(" ");
  return `<span class="${classes}"${style ? ` style="${style}"` : ""}${pop}>${html}</span>`;
}

/** One row of the log. A running column is blank where the row left it exactly as it came in
 *  (`before:`), unless something fed it; `buffed` underlines a cell a buff actually moved, or a
 *  counter whose before + moved ≠ after (set outright: an outro's wipe, a clamped gauge). */
function stepRow(
  columns: Column[], row: ReportRow | ReportPart, slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>,
  { part = false, caret = true }: { part?: boolean; caret?: boolean } = {},
): string {
  return columns.map((col) => {
    const v = row.raw[col.key];
    const sources = row.sources[col.key];
    if (isRunning(col.key)) {
      if ("line" in row && row.line.aggregate) return cell(col);
      const before = Number(row.raw[`before:${col.key}`]) || 0;
      const fed = (sources ?? []).some((r) => r.section !== OFFTUNE_RATE && r.section !== ENERGY_RATE);
      if (!fed && Math.abs((Number(v) || 0) - before) < 1e-9) return cell(col);
    }
    const cls: string[] = [];
    if (col.key === "action") cls.push(part ? "name" : "action");
    if (col.key === "avg") cls.push("avg");
    if (col.key === "member") cls.push("member");
    if (BUFF_UNDERLINE_COLUMNS.has(col.key) && row.buffed.has(col.key)) cls.push("buffed");
    if (isRunning(col.key) && typeof v === "number"
      && Math.abs((Number(row.raw[`before:${col.key}`]) || 0) + (Number(row.raw[`moved:${col.key}`]) || 0) - v) > 1e-9) {
      cls.push("buffed");
    }
    if (col.key === "concerto" && Number(row.raw["short:concerto"])) cls.push("underspent");
    if (col.key.startsWith("gauge:") && Number(row.raw[`short:${col.key}`])) cls.push("negative");

    const text = esc(fmt(v, col.digits ?? 0, PAD_DIGITS_COLUMNS.has(col.key), GROUPED_COLUMNS.has(col.key)))
      + (col.percent && typeof v === "number" ? "%" : "") + gaugeSuffix(row.raw, col.key);
    let html = sources && text ? `<span class="has">${text}</span>` : text;
    if (col.key === "action" && caret && !part && "parts" in row && row.parts.length) {
      html = `${html}<span class="caret">▸</span>`;
    }
    const suffix = col.key === "mv" && row.scaling !== null ? ` ${SCALING_NAME[row.scaling]}` : "";
    let pop = "";
    if (col.key === "action") {
      // a group's name is its expand control, no panel
      const group = "parts" in row && row.parts.length > 0;
      pop = group ? "" : infoPopover(row.info, slotHue);
    } else if (col.key === "member") {
      const snap = "line" in row ? row.line.snap : row.snap;
      const gear = gearByMember.get(snap.member) ?? [];
      pop = buffsPopover(snap.member, gear, snap.heldLocal, snap.heldGlobal, snap.heldEnemy, slotHue);
    } else if (text) {
      // a running counter's panel foots to what this action moved it by, not the balance
      pop = popover(col, sources, row.raw[`moved:${col.key}`] ?? v, slotHue, suffix);
    }

    const mem = slotHue.get(String(v)) ?? FALLBACK_HUE;
    const style = col.key === "member" ? `--mem:${mem};color:${mem}`
      : col.key === "avg" ? `--mem:${slotHue.get(String(row.raw["member"] ?? "")) ?? FALLBACK_HUE}` : "";
    return cell(col, { cls, html, pop, style });
  }).join("");
}

/** An opened group's rows, each in its *own* member's hue (a follow-up can land on anybody). */
function partRows(
  columns: Column[], parts: ReportPart[], slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>,
  fieldOf: Map<ResolvedSnapshot, number>,
): string {
  return parts.map((p) => {
    const hue = slotHue.get(String(p.raw.member)) ?? FALLBACK_HUE;
    const field = fieldOf.get(p.snap);
    const mark = field === undefined ? "" : ` data-fh="${field}"`;
    return `<div class="r${p.short ? " short" : ""}" style="--m:${hue}"${mark}>`
      + `${stepRow(columns, p, slotHue, gearByMember, { part: true })}</div>`;
  }).join("");
}

/** The whole team's rotation as one grid. A group's block holds its parts (shown open) and its
 *  spill follow-ups (shown closed); a field's summons swap with its summary row by a stylesheet
 *  keyed on the summary's checkbox, since they are scattered through the section. */
function rotationTable(report: Report, slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>, starts: Map<number, number>): string {
  const columns = report.columns;
  const cols = columns.map(colWidth).join(" ");
  const head = columns.map((c) => cell(c, { html: esc(c.label) })).join("");

  const fieldIds = new Map<string, number>();
  const fieldId = (key: string): number => {
    const seen = fieldIds.get(key);
    if (seen !== undefined) return seen;
    fieldIds.set(key, fieldIds.size);
    return fieldIds.size - 1;
  };
  const fieldOf = new Map<ResolvedSnapshot, number>();
  for (const row of report.rows) {
    const line = row.line;
    if (line.fieldKey === undefined || line.aggregate) continue;
    const id = fieldId(line.fieldKey);
    for (const snap of hitsOf(line)) fieldOf.set(snap, id);
  }

  const out: string[] = [];
  let spilling = false;
  const closeBlock = () => { if (spilling) { out.push("</div></div>"); spilling = false; } };
  report.rows.forEach((row, i) => {
    const loop = starts.get(i);
    if (loop !== undefined) { closeBlock(); out.push(`<div class="loopline"><span>loop ${loop}</span></div>`); }
    const snap = row.line.snap;
    const hue = slotHue.get(snap.member) ?? FALLBACK_HUE;
    const style = ` style="--m:${hue}"`;
    const cells = stepRow(columns, row, slotHue, gearByMember);
    const shortCls = row.short ? " short" : "";
    const key = row.line.fieldKey;
    const mark = key === undefined || row.line.aggregate ? "" : ` data-fh="${fieldId(key)}"`;
    if (row.line.aggregate) {
      closeBlock();
      const id = `fg${fieldId(key!)}`;
      out.push(`<div class="step chain"${style}>`
        + `<input class="tgl" type="checkbox" id="${id}">`
        + `<label class="r${shortCls}" for="${id}">${cells}</label>`
        + `</div>`);
      return;
    }
    if (row.line.spill && spilling) {
      if (row.parts.length) {
        const id = `x${i}`;
        out.push(`<div class="chain"${style}${mark}>`
          + `<input class="tgl" type="checkbox" id="${id}">`
          + `<label class="r${shortCls}" for="${id}">${cells}</label>`
          + `<div class="parts">${partRows(columns, row.parts, slotHue, gearByMember, fieldOf)}</div>`
          + `</div>`);
        return;
      }
      out.push(`<div class="r${shortCls}"${style}${mark}>`
        + `${stepRow(columns, row, slotHue, gearByMember, { caret: false })}</div>`);
      return;
    }
    closeBlock();
    if (!row.parts.length) {
      out.push(`<div class="step"${style}${mark}><div class="r${shortCls}">${cells}</div></div>`);
      return;
    }
    const id = `x${i}`;
    out.push(`<div class="step chain"${style}${mark}>`
      + `<input class="tgl" type="checkbox" id="${id}">`
      + `<label class="r${shortCls}" for="${id}">${cells}</label>`
      + `<div class="parts">${partRows(columns, row.parts, slotHue, gearByMember, fieldOf)}</div>`
      + `<div class="spill">`);
    spilling = true;
  });
  closeBlock();

  const fieldRules = [...fieldIds.values()].map((n) => `.grid:has(#fg${n}:checked) .step[data-fh="${n}"]{display:block}`
    + `.grid:has(#fg${n}:checked) .r[data-fh="${n}"]{display:grid}`).join("");
  const totalRow = columns.map((c) => cell(c)).join("");

  return `<div class="gridwrap">${fieldRules ? `<style>${fieldRules}</style>` : ""}<div class="grid" style="--cols:${cols}">
    <div class="r head">${head}</div>
    ${out.join("")}
    <div class="r totalrow">${totalRow}</div>
  </div></div>`;
}

/* ---------------------------------------------------------------------------------- energy */

/** Indices in `flat[from, to)` where `member` casts a `resetEnergy` action. */
function resetIndices(flat: ChainGroup[], from: number, to: number, member: string): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) {
    const snap = flat[i]!.snap;
    if (snap.member === member && snap.action.resetEnergy) out.push(i);
  }
  return out;
}

/**
 * The constant ER a member needs for the bar to be full at `resetIdx`. The engine banks RealEnergy
 * at a flat rate, so `realEnergyBefore` is what the window generated at 100%; each of the member's
 * own gains scales with their ER at the time (constant + buff), a teammate's share with the constant
 * alone. Solve `before * C/100 + sum(own gain * buff)/100 = maxEnergy` for C. 0 for a costless
 * Liberation, null where nothing was banked.
 */
function erRequirement(flat: ChainGroup[], resetIdx: number, member: string, maxEnergy: number, constant: number): number | null {
  if (!maxEnergy) return 0;
  const before = flat[resetIdx]!.snap.realEnergyBefore;
  if (before <= 0) return null;
  let buffed = 0;
  walk: for (let i = resetIdx - 1; i >= 0; i--) {
    const line = flat[i]!;
    if (line.aggregate) continue;
    const snaps = hitsOf(line);
    for (let k = snaps.length - 1; k >= 0; k--) {
      const s = snaps[k]!;
      if (s.member !== member) continue;
      if (s.action.resetEnergy) break walk;
      if (s.energyWiped) continue;
      const gain = (s.action.energy + s.stat(Stat.AddEnergy)) * (1 + s.stat(Stat.EnergyRegenMult) / 100);
      buffed += gain * (s.stat(Stat.Er) - constant);
    }
  }
  return (maxEnergy * 100 - buffed) / before;
}

/** Between the member's last two Liberations, or `fallback` (the last loop) with no such interval. */
function energySpan(flat: ChainGroup[], member: string, fallback: [number, number]): [number, number] {
  const casts = resetIndices(flat, 0, flat.length, member);
  return casts.length < 2 ? fallback : [casts[casts.length - 2]! + 1, casts[casts.length - 1]!];
}

/** What the member's own casts banked over their span — RealEnergy also carries half of everyone
 *  else's gains, so this reads the casts, not the counter. An outro's declared energy never banks. */
function energyGenerated(flat: ChainGroup[], member: string, fallback: [number, number]): number {
  const [from, to] = energySpan(flat, member, fallback);
  let total = 0;
  for (let i = from; i < to; i++) {
    const line = flat[i]!;
    if (line.aggregate) continue;
    for (const snap of hitsOf(line)) {
      if (snap.member !== member || snap.energyWiped) continue;
      total += (snap.action.energy + snap.stat(Stat.AddEnergy)) * (1 + snap.stat(Stat.EnergyRegenMult) / 100);
    }
  }
  return total;
}

/** What that member put *on* the target's off-tune bar over `span` — the engine's own sum (the
 *  action's own amount plus AddOfftune, taken at their Buildup rate, plus anything a kit lands on
 *  the bar directly — see evaluate.ts), in the log's own units. Off-tune is the enemy's one shared
 *  gauge, so this is their share of the building rather than a gauge of their own.
 *
 *  Drains are left out: the Tune Break takes the whole bar and a full bar cancels whatever would
 *  overflow, both as negative `DirectOfftune` (tunebreak.ts), and neither is buildup this
 *  resonator generated — this is how fast they fill the bar, which is what a loop's figure is
 *  read for. */
function offtuneBuilt(flat: ChainGroup[], member: string, [from, to]: [number, number]): number {
  let total = 0;
  for (let i = from; i < to; i++) {
    const line = flat[i]!;
    if (line.aggregate) continue;
    for (const snap of hitsOf(line)) {
      if (snap.member !== member) continue;
      const built = snap.action.offtune + snap.stat(Stat.AddOfftune);
      const direct = snap.stat(Stat.DirectOfftune);
      if (built > 0) total += built * (snap.stat(Stat.OfftuneBuildup) / 100);
      if (direct > 0) total += direct;
    }
  }
  return total / 10000;
}

/** What the rest of the team put into one of those figures, summed per source off the rows' own
 *  panels — a rate (a percentage, not an amount) is taken once rather than added up. */
function teamSources(flat: ChainGroup[], rows: ReportRow[], member: string, [from, to]: [number, number], field: "energy" | "offtune"): TraceEntry[] {
  const rate = field === "energy" ? ENERGY_RATE : OFFTUNE_RATE;
  const by = new Map<string, TraceEntry>();
  for (let i = from; i < to; i++) {
    const line = flat[i]!;
    const snap = line.snap;
    if (line.aggregate || snap.member !== member || (field === "energy" && snap.energyWiped)) continue;
    for (const r of rows[i]?.sources[field] ?? []) {
      if (!r.owner || r.owner === member) continue;
      const key = `${r.source} ${r.section ?? ""}`;
      const seen = by.get(key);
      if (seen) {
        if (!r.mult && r.section !== rate) {
          seen.value += r.value;
          seen.count = (seen.count ?? 1) + (r.count ?? 1);
        }
      }
      else by.set(key, { ...r });
    }
  }
  return [...by.values()];
}

function teamSourcePopover(sources: TraceEntry[], slotHue: Map<string, string>): string {
  const head = sources.length ? "Team sources" : "No team sources";
  return lazyPop(`<span class="pop stat"><table>`
    + `<tr class="sec"><td colspan="2">${head}</td></tr>`
    + `${sources.map((r) => panelRow(r, slotHue)).join("")}</table></span>`);
}

/** Energy Requirements: per member, the constant ER needed for the Liberation each section holds
 *  (the opener's *last*; the fight's very first is free and reads `—`), red where the build's own
 *  constant ER falls short, then their own Energy Gen. */
function energyTable(run: TeamRun, lines: ChainGroup[][], report: Report, slotHue: Map<string, string>): string {
  const erCol = columnOf(report, "er");
  const flat = lines.flat();
  const offsets = [0];
  for (const sec of lines) offsets.push(offsets[offsets.length - 1]! + sec.length);

  const head = `<div class="rtrow rthead">`
    + `<div class="c"></div>`
    + `<div class="c num">Opener</div>`
    + `<div class="c num">Loop 1</div><div class="c num">Loop 2</div><div class="c num">Loop 3</div>`
    + `<div class="c num">Energy Gen</div>`
    + `<div class="c num">Offtune Buildup</div>`
    + `</div>`;

  const rows = run.members.map((m, idx) => {
    const maxEnergy = m.loadout.resonator.maxEnergy;
    const combo = run.combo[idx]!;
    const constantSources = menuStats(m.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs))
      .filter((e) => e.stat === Stat.Er);
    const constant = constantSources.reduce((n, e) => n + e.value, 0);
    const free = resetIndices(flat, 0, flat.length, m.name)[0] ?? null;
    const cell = (resetIdx: number | null): string => {
      const snap = resetIdx == null || resetIdx === free ? null : flat[resetIdx]!.snap;
      const req = snap == null ? null : erRequirement(flat, resetIdx!, m.name, maxEnergy, constant);
      const missing = req == null ? 0 : Math.max(0, req - constant);
      const text = req == null ? "—" : `${fmt(req, 1)}%`;
      const sources = constantSources.map((e): TraceEntry => ({ source: e.source, value: e.value, percent: true, digits: 1, owner: e.owner || m.name }));
      const hover = snap && erCol ? popover({ ...erCol, full: "Base Energy Regen" }, sources, constant, slotHue) : "";
      return `<div class="c num${missing > 0 ? " er-under" : ""}${hover ? " has" : ""}"${hover}>${text}</div>`;
    };

    const opener = resetIndices(flat, offsets[0]!, offsets[1]!, m.name);
    const lastLoop: [number, number] = [offsets[3]!, offsets[4]!];
    const gen = energyGenerated(flat, m.name, lastLoop);
    const team = teamSourcePopover(teamSources(flat, report.rows, m.name, energySpan(flat, m.name, lastLoop), "energy"), slotHue);
    // off-tune reads the last loop outright: it is the enemy's shared gauge, with no per-member
    // cast to span from the way energy's own reset does
    const offtune = offtuneBuilt(flat, m.name, lastLoop);
    const offtuneTeam = teamSourcePopover(teamSources(flat, report.rows, m.name, lastLoop, "offtune"), slotHue);
    const cells = cell(opener[opener.length - 1] ?? null)
      + [1, 2, 3].map((i) => cell(resetIndices(flat, offsets[i]!, offsets[i + 1]!, m.name)[0] ?? null)).join("")
      + `<div class="c num has"${team}>${fmt(gen, 2, true)}</div>`
      + `<div class="c num has"${offtuneTeam}>${fmt(offtune, 2, true)}</div>`;
    return `<div class="rtrow">`
      + `<div class="c name"${gearPopover(m, run.combo[idx]!)} style="--mem:${m.color}">${esc(m.name)}</div>`
      + cells
      + `</div>`;
  }).join("");

  return `<div class="rtable energy">${head}${rows}</div>`;
}

/* ------------------------------------------------------------------------------------ page */

function page(run: TeamRun): string {
  const { report } = detailFor(run);
  const lines = run.rotationLines!;
  const { members } = run;
  const slotHue = new Map([...members.map((m): [string, string] => [m.name, m.color]), [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]]);
  const gearByMember = new Map(members.map((m, i): [string, Gear[]] => [m.name, equippedGear(m, run.combo[i]!).map(([, g]) => g)]));
  // where Loop 1-3 begin in the log, by loop number
  const starts = new Map<number, number>();
  lines.reduce((n, sec, k) => { if (k) starts.set(n, k); return n + sec.length; }, 0);

  return `<main>
  <div class="rtables">
    <div class="rtable-block">
      <h2 class="summary-label">damage per rotation</h2>
      ${dprTable(run, lines)}
    </div>
    <div class="rtable-block">
      <h2 class="summary-label">energy requirements</h2>
      ${energyTable(run, lines, report, slotHue)}
    </div>
  </div>
  <h2 class="summary-label">action log</h2>
  ${rotationTable(report, slotHue, gearByMember, starts)}
</main>`;
}

export function errorPage(err: unknown): string {
  const hint = location.protocol === "file:"
    ? `This page was opened straight off disk. Browsers refuse to load ES modules or
       <code>fetch()</code> data over <code>file://</code>, so it has to be served — run
       <code>python -m http.server 8000</code> in this directory and open
       <code>http://localhost:8000/</code>.`
    : `The engine threw while running the team. The stack below points at the file to look at.`;
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  return `<div class="error">
  <h2>Could not run the team</h2>
  <p>${hint}</p>
  <pre>${esc(message)}</pre>
</div>`;
}

export function renderDetail(key: string): void {
  rememberTableScroll();
  topbar.hidden = false;
  clearPops();
  const run = results.get(key)!;
  app.innerHTML = page(run);
  app.className = "";
  wireColumnDrag(app, detailFor(run).report.columns);
}

/* ------------------------------------------------------------------------- column order */

/** The log's columns are dragged by their headings; the order is kept in localStorage. Nothing is
 *  re-rendered to reorder: a generated stylesheet hands each cell position a grid `order`. */
const COLUMN_ORDER_KEY = "wuwa.logColumns";

const savedOrder = (): string[] => {
  try { return JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY) ?? "[]") as string[]; }
  catch { return []; }
};

/** The saved order for the columns it names; the rest slot in beside their natural neighbour. */
function orderedKeys(columns: Column[]): string[] {
  const out = savedOrder().filter((k) => columns.some((c) => c.key === k));
  columns.forEach((c, i) => {
    if (out.includes(c.key)) return;
    const prev = columns.slice(0, i).reverse().find((p) => out.includes(p.key));
    out.splice(prev ? out.indexOf(prev.key) + 1 : 0, 0, c.key);
  });
  return out;
}

let logColumns: Column[] = [];
let logOrder: string[] = [];
let logStyle: HTMLStyleElement | null = null;

function applyColumnOrder(root: HTMLElement): void {
  const grid = root.querySelector<HTMLElement>(".gridwrap .grid");
  if (!grid || !logColumns.length) return;
  const at = new Map(logOrder.map((k, i) => [k, i]));
  const visual = [...logColumns].sort((a, b) => at.get(a.key)! - at.get(b.key)!);
  grid.style.setProperty("--cols", visual.map(colWidth).join(" "));
  const rules = logColumns.map((c, i) => `.grid .r>.c:nth-child(${i + 1}){order:${at.get(c.key)}}`);
  if (!logStyle) logStyle = document.head.appendChild(document.createElement("style"));
  logStyle.textContent = rules.join("");
}

interface ColumnDrag {
  key: string;
  /** Its `nth-child` position, which never moves. */
  nth: number;
  order: string[];
  width: Map<string, number>;
  home: number;
  span: number;
  startX: number;
  /** Where it lands if dropped now — an index into `order` with itself taken out. */
  at: number;
}

function offsetsOf(order: string[], width: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  let x = 0;
  for (const key of order) { out.set(key, x); x += width.get(key) ?? 0; }
  return out;
}

/** One box laid over the grid spanning a whole column — the cells can't carry an outline (dimmed
 *  rows fade it, row borders cut it). */
function columnBox(grid: HTMLElement, left: number, width: number): HTMLElement {
  const box = grid.appendChild(document.createElement("div"));
  box.className = "colbox";
  box.style.left = `${left}px`;
  box.style.width = `${width}px`;
  return box;
}

/** The column a heading click singled out — a reading marker, not saved. */
let selected: string | null = null;
let selBox: HTMLElement | null = null;

function trackBox(grid: HTMLElement, key: string): { left: number; width: number } | null {
  const cell = grid.querySelector<HTMLElement>(`:scope > .r.head > .c[data-col="${CSS.escape(key)}"]`);
  if (!cell) return null;
  const g = rect(grid);
  const c = rect(cell);
  return { left: c.left - g.left, width: c.width };
}

function paintSelection(root: HTMLElement): void {
  selBox?.remove();
  selBox = null;
  if (!selected) return;
  const grid = root.querySelector<HTMLElement>(".gridwrap .grid");
  const track = grid && trackBox(grid, selected);
  if (grid && track) selBox = columnBox(grid, track.left, track.width);
}

/** The drag's stylesheet goes up once; only its transform declarations are touched after. Setting
 *  a declaration on one rule invalidates only that column — rewriting the sheet, or a `--dx`
 *  custom property on the grid, re-styled every node under it each frame. */
let dragStyle: HTMLStyleElement | null = null;
let liftRule: CSSStyleRule | null = null;
let liftBox: HTMLElement | null = null;
const slideRules = new Map<string, CSSStyleRule>();

/** Slides are eased here frame by frame: a CSS transition on twenty-odd uncomposited cells per
 *  column took a drag from 17ms to 39ms a frame. */
const slideNow = new Map<string, number>();
const slideTo = new Map<string, number>();
let slideRaf = 0;

function stepSlides(): void {
  slideRaf = 0;
  let moving = false;
  for (const [key, rule] of slideRules) {
    const to = slideTo.get(key) ?? 0;
    const at = slideNow.get(key) ?? 0;
    if (at === to) continue;
    const next = Math.abs(to - at) < 0.5 ? to : at + (to - at) * 0.3;
    slideNow.set(key, next);
    rule.style.transform = `translateX(${next}px)`;
    if (next !== to) moving = true;
  }
  if (moving) slideRaf = requestAnimationFrame(stepSlides);
}

function openDrag(grid: HTMLElement, d: ColumnDrag): void {
  const nth = (key: string): number => logColumns.findIndex((c) => c.key === key) + 1;
  const others = d.order.filter((k) => k !== d.key);
  // the lifted column is raised on an opaque surface (`var(--m, var(--surface))`, never a
  // `transparent` fallback, which left the head/total rows translucent)
  const rules = [
    `.grid .r>.c:nth-child(${d.nth}){transform:translateX(0px);transition:none;z-index:6;`
      + "background-color:color-mix(in srgb, var(--m, var(--surface)) 4%, var(--surface))}",
    `.grid .r>.c.member:nth-child(${d.nth})`
      + "{background-color:color-mix(in srgb, var(--mem, var(--surface)) 10%, var(--surface))}",
    `.grid .r.head>.c:nth-child(${d.nth}),.grid .r.totalrow>.c:nth-child(${d.nth})`
      + "{background-color:var(--surface-3)}",
  ];
  const slideAt = rules.length;
  for (const key of others) rules.push(`.grid .r>.c:nth-child(${nth(key)}){transform:translateX(0px)}`);

  if (!dragStyle) dragStyle = document.head.appendChild(document.createElement("style"));
  dragStyle.textContent = rules.join("");
  const sheet = dragStyle.sheet;
  liftRule = (sheet?.cssRules[0] as CSSStyleRule | undefined) ?? null;
  slideRules.clear();
  slideNow.clear();
  slideTo.clear();
  others.forEach((key, i) => {
    const rule = sheet?.cssRules[slideAt + i] as CSSStyleRule | undefined;
    if (rule) slideRules.set(key, rule);
  });

  const track = trackBox(grid, d.key);
  liftBox = columnBox(grid, track?.left ?? d.home, track?.width ?? d.width.get(d.key)!);
  liftBox.style.transition = "none";
  if (selBox && selected === d.key) selBox.style.display = "none";
}

/** Aim every other column at where the drop would now put it — only when the landing place changes. */
function slideDrag(d: ColumnDrag): void {
  const from = offsetsOf(d.order, d.width);
  const rest = d.order.filter((k) => k !== d.key);
  rest.splice(d.at, 0, d.key);
  const to = offsetsOf(rest, d.width);
  for (const key of slideRules.keys()) slideTo.set(key, to.get(key)! - from.get(key)!);
  if (!slideRaf) slideRaf = requestAnimationFrame(stepSlides);
  if (selBox && selected && selected !== d.key) {
    selBox.style.transform = `translateX(${to.get(selected)! - from.get(selected)!}px)`;
  }
}

function closeDrag(): void {
  if (slideRaf) cancelAnimationFrame(slideRaf);
  slideRaf = 0;
  dragStyle?.remove();
  dragStyle = null;
  liftRule = null;
  liftBox?.remove();
  liftBox = null;
  slideRules.clear();
}

/** Pick a column up by its heading and slide it within the table's edges; a press that never
 *  moves is a click and singles the column out instead. */
function wireColumnDrag(root: HTMLElement, columns: Column[]): void {
  logColumns = columns;
  logOrder = orderedKeys(columns);
  closeDrag();
  selected = null;
  selBox = null;
  applyColumnOrder(root);

  const head = root.querySelector<HTMLElement>(".gridwrap .grid > .r.head");
  if (!head) return;
  const cells = [...head.querySelectorAll<HTMLElement>(":scope > .c")];
  cells.forEach((el, i) => { el.dataset.col = columns[i]!.key; });

  let drag: ColumnDrag | null = null;
  let lifted = false;
  let settling = false;
  const LIFT_AT = 3;

  head.addEventListener("pointerdown", (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>(".c[data-col]");
    if (e.button !== 0 || drag || settling || !cell) return;
    e.preventDefault();
    cell.setPointerCapture(e.pointerId);
    const width = new Map(cells.map((c) => [c.dataset.col!, rect(c).width]));
    const key = cell.dataset.col!;
    const offsets = offsetsOf(logOrder, width);
    drag = {
      key,
      nth: cells.indexOf(cell) + 1,
      order: logOrder,
      width,
      home: offsets.get(key)!,
      span: [...width.values()].reduce((n, w) => n + w, 0),
      startX: e.clientX / zoom(),
      at: logOrder.indexOf(key),
    };
    lifted = false;
  });

  head.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!lifted) {
      if (Math.abs(e.clientX / zoom() - drag.startX) < LIFT_AT) return;
      lifted = true;
      document.body.classList.add("coldrag");
      openDrag(head.parentElement as HTMLElement, drag);
    }
    const w = drag.width.get(drag.key)!;
    const dx = Math.min(drag.span - w - drag.home, Math.max(-drag.home, e.clientX / zoom() - drag.startX));
    // it trades places with a neighbour once it has slid halfway across that neighbour's width
    const { width, key } = drag;
    const rest = drag.order.filter((k) => k !== key);
    const edge = drag.home + dx;
    let at = drag.at;
    let slot = rest.slice(0, at).reduce((n, k) => n + width.get(k)!, 0);
    for (;;) {
      const after = rest[at];
      if (after !== undefined && edge - slot > width.get(after)! / 2) {
        slot += width.get(after)!;
        at++;
        continue;
      }
      const before = rest[at - 1];
      if (before !== undefined && slot - edge > width.get(before)! / 2) {
        slot -= width.get(before)!;
        at--;
        continue;
      }
      break;
    }
    if (at !== drag.at) { drag.at = at; slideDrag(drag); }
    if (liftRule) liftRule.style.transform = `translateX(${dx}px)`;
    if (liftBox) liftBox.style.transform = `translateX(${dx}px)`;
  });

  const drop = (): void => {
    if (!drag) return;
    const d = drag;
    drag = null;
    document.body.classList.remove("coldrag");
    const next = d.order.filter((k) => k !== d.key);
    next.splice(d.at, 0, d.key);
    logOrder = next;
    try { localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(next)); } catch { /* no storage */ }
    // let it slide the last of the way into its gap before the real order takes over
    const rest = offsetsOf(next, d.width).get(d.key)! - offsetsOf(d.order, d.width).get(d.key)!;
    settling = true;
    if (liftRule) {
      liftRule.style.transition = "transform .16s ease";
      liftRule.style.transform = `translateX(${rest}px)`;
    }
    if (liftBox) {
      liftBox.style.transition = "";
      liftBox.style.transform = `translateX(${rest}px)`;
    }
    setTimeout(() => {
      settling = false;
      closeDrag();
      applyColumnOrder(root);
      paintSelection(root);
    }, 170);
  };

  head.addEventListener("pointerup", () => {
    if (!drag) return;
    if (lifted) { drop(); return; }
    selected = selected === drag.key ? null : drag.key;
    drag = null;
    paintSelection(root);
  });

  head.addEventListener("pointercancel", () => {
    if (lifted) drop();
    else drag = null;
  });
}
