/**
 * The detail page: the DPR and energy tables, the action log grid, and the log's draggable
 * column order (kept in localStorage) with its pointer handlers.
 */
import { Stat, Cast, SCALING_NAME } from "../engine/stats.js";
import type { Gear } from "../engine/gear.js";
import { menuStats } from "../engine/context.js";
import { TUNE_BREAK_ENEMY } from "../shared/tunebreak.js";
import type { ChainGroup, ResolvedSnapshot } from "../engine/evaluate.js";
import { columnOf, gaugeSuffix, fmt, digitsOf, PAD_DIGITS_COLUMNS, GROUPED_COLUMNS, OFFTUNE_RATE, ENERGY_RATE } from "../display.js";
import type { Report, Column, ReportRow, ReportPart, TraceEntry } from "../display.js";
import type { TeamRun } from "../teamrun.js";
import { hitsOf, erRollsFor } from "../teamrun.js";
import { ER_TOLERANCE } from "../shared/substats.js";
import { results, detailFor, FALLBACK_HUE } from "./model.js";
import { esc, lazyPop, rect, zoom, clearPops, panelRow, popover, infoPopover, buffsPopover, equippedGear, dprTable, loadoutTable, wireDistribution, drivePanel, dropPanel, holdPanels } from "./panels.js";
import { rememberTableScroll } from "./table.js";

const app = document.getElementById("app")!;
const topbar = document.getElementById("topbar")!;

/* ------------------------------------------------------------------------------ action log */

const BUFF_UNDERLINE_COLUMNS = new Set(["mv", "energy", "concerto", "offtune"]);
const RUNNING_COLUMNS = new Set(["concerto", "energy", "offtune"]);
const isRunning = (key: string): boolean => RUNNING_COLUMNS.has(key) || key.startsWith("gauge:");

/** A grid track: the column's character width times --cw, plus the cell padding. */
const colWidth = (c: Column): string => `calc(var(--cw) * ${c.width} + var(--cpad))`;

function cell(col: Column, { cls = [], html = "", pop = "", style = "", attr = "" }: { cls?: string[]; html?: string; pop?: string; style?: string; attr?: string } = {}): string {
  const classes = ["c", col.align === "left" ? "" : "num", ...cls].filter(Boolean).join(" ");
  return `<span class="${classes}"${style ? ` style="${style}"` : ""}${attr}${pop}>${html}</span>`;
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
    // a resource cell carries its balance and the one the row was entered on, blank or not, for
    // the block a press runs down the column to read the gain over (`blockPanel`) — except where
    // the balance is the row's own spend rather than a step in the run: an Outro wipes concerto
    // and energy, the Tune Break takes the whole off-tune bar, and a block read across either
    // would say so
    let attr = "";
    if (isRunning(col.key)) {
      if ("line" in row && row.line.aggregate) return cell(col);
      const cast = ("line" in row ? row.line.snap : row.snap).action.cast;
      const spend = col.key === "offtune" ? cast === Cast.TuneBreak
        : (col.key === "concerto" || col.key === "energy") && cast === Cast.Outro;
      const before = Number(row.raw[`before:${col.key}`]) || 0;
      if (!spend) attr = ` data-val="${Number(v) || 0}" data-before="${before}"`;
      const fed = (sources ?? []).some((r) => r.section !== OFFTUNE_RATE && r.section !== ENERGY_RATE);
      if (!fed && Math.abs((Number(v) || 0) - before) < 1e-9) return cell(col, { attr });
    }
    const cls: string[] = [];
    if (col.key === "action") cls.push(part ? "name" : "action");
    if (col.key === "avg") cls.push("avg");
    if (col.key === "member") cls.push("member");
    if (BUFF_UNDERLINE_COLUMNS.has(col.key) && row.buffed.has(col.key)) cls.push("buffed");
    // a gauge this cast wipes before its own delta lands — the panel carries the CLEAR row that
    // says so (display.ts), and the underline is what points at it
    if (col.key.startsWith("gauge:") && Number(row.raw[`clear:${col.key}`])) cls.push("buffed");
    if (col.key === "concerto" && Number(row.raw["short:concerto"])) cls.push("underspent");
    if (col.key.startsWith("gauge:") && Number(row.raw[`short:${col.key}`])) cls.push("negative");

    const text = esc(fmt(v, digitsOf(row.raw, col), PAD_DIGITS_COLUMNS.has(col.key), GROUPED_COLUMNS.has(col.key)))
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
    // the figure itself, unformatted, for the run a press down the column adds up (`blockPanel`)
    if (col.key === "avg" && typeof v === "number") attr = ` data-avg="${v}"`;
    return cell(col, { cls, html, pop, style, attr });
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

/**
 * What each member's Liberations asked of their constant ER — the most any one of them wanted, which
 * the Energy Regen menu stat carries in its own label. Its colour says whether what the build wears
 * covers it.
 */
function energyRequirements(run: TeamRun, lines: ChainGroup[][]): Map<string, string> {
  const flat = lines.flat();
  const erOf = erRollsFor(run.teamKey, run.members, run.combo);

  const cells = new Map<string, string>();
  run.members.forEach((m, idx) => {
    const maxEnergy = m.loadout.resonator.maxEnergy;
    const combo = run.combo[idx]!;
    const constantSources = menuStats(m.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs, erOf[idx]!))
      .filter((e) => e.stat === Stat.Er);
    const constant = constantSources.reduce((n, e) => n + e.value, 0);

    // the fight's very first Liberation runs on the bar `combatStart` hands over, so it asks nothing
    const casts = resetIndices(flat, 0, flat.length, m.name).slice(1);
    const asked = casts.map((i) => erRequirement(flat, i, m.name, maxEnergy, constant)).filter((v): v is number => v != null);
    const req = asked.length ? Math.max(...asked) : null;
    // met or missed, said in colour: green where the build's own constant ER covers the figure,
    // red where it falls short even of the slack the run is granted (`ER_TOLERANCE`) — the page
    // would otherwise call a build short that the engine just let cast. Amber between the two:
    // the bar fills on slack rather than on ER, and without the tolerance this build would have
    // been pushed up a roll.
    const met = req == null ? ""
      : req > constant + ER_TOLERANCE ? " er-under"
      : req > constant ? " er-slack"
      : " er-met";
    // only the figure itself is coloured — "(need" and the bracket stay the label's own tone
    if (req != null) {
      // what the figure is, for anyone reading the row for the first time, and the colour said in
      // words: the build's own ER covers it, misses it by no more than the run's slack, or misses
      const verdict = met === " er-met" ? "Met" : met === " er-slack" ? "Barely Not Met" : "Not Met";
      const tip = lazyPop(`<span class="pop tip">Unbuffed Energy Regen Requirement (${verdict})</span>`);
      cells.set(m.name, `<span class="erneed has"${tip}>`
        + `> <span class="erreq${met}">${fmt(req, 1)}%</span></span>`);
    }
  });

  return cells;
}

/* ------------------------------------------------------------------------------------ page */

function page(run: TeamRun): string {
  const { report } = detailFor(run);
  const lines = run.rotationLines!;
  const { members } = run;
  const slotHue = new Map([...members.map((m): [string, string] => [m.name, m.color]), [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]]);
  const erRolls = erRollsFor(run.teamKey, run.members, run.combo);
  const gearByMember = new Map(members.map((m, i): [string, Gear[]] => [m.name, equippedGear(m, run.combo[i]!, erRolls[i]!).map(([, g]) => g)]));
  // where Loop 1-3 begin in the log, by loop number
  const starts = new Map<number, number>();
  lines.reduce((n, sec, k) => { if (k) starts.set(n, k); return n + sec.length; }, 0);

  return `<main>
  <div class="rtables">
    <div class="rtable-block">
      <h2 class="summary-label">Equipment</h2>
      ${loadoutTable(run, energyRequirements(run, lines))}
    </div>
    <div class="rstack">
      <div class="rtable-block">
        <h2 class="summary-label">Damage Contribution</h2>
        ${dprTable(run, lines)}
      </div>
    </div>
  </div>
  <div class="rotation-block">
    <h2 class="summary-label">Rotation</h2>
    ${rotationTable(report, slotHue, gearByMember, starts)}
  </div>
</main>`;
}


export function renderDetail(key: string): void {
  rememberTableScroll();
  topbar.hidden = false;
  clearPops();
  const run = results.get(key)!;
  app.innerHTML = page(run);
  app.className = "";
  wireColumnDrag(app, detailFor(run).report.columns);
  wireCellSelect(app);
  wireDistribution(app);
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
  /** The page's own zoom as the press found it. Measuring it again on every report read the
   *  table's layout back a move at a time, right after a move had written the rule that re-styles
   *  every cell in the column — the two together are what made a quick drag crawl. */
  scale: number;
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
  clearBlock();
  const grid = root.querySelector<HTMLElement>(".gridwrap .grid");
  const track = grid && trackBox(grid, selected);
  if (grid && track) selBox = columnBox(grid, track.left, track.width);
}

/* ----------------------------------------------------------------------------- cell block */

/** One box laid over the grid spanning a block of cells — the cells cannot carry an outline
 *  themselves, for the reasons `columnBox` gives. It is moved and resized rather than redrawn as
 *  the block grows: taking a child out of the grid and putting another back in invalidated the
 *  whole table on every pointer move. */
function cellBox(grid: HTMLElement): HTMLElement {
  const box = grid.appendChild(document.createElement("div"));
  box.className = "cellbox";
  return box;
}

/** Whether an opened group's own row only says over again what rows the block already holds say:
 *  its figures are the sum of theirs, so counting both counts the group twice. A closed group
 *  stands in for the rows it hides and is counted as itself. */
function doubled(row: HTMLElement, held: Set<HTMLElement>): boolean {
  const chain = row.parentElement;
  const tgl = chain?.classList.contains("chain")
    ? chain.querySelector<HTMLInputElement>(":scope > .tgl")
    : null;
  if (!tgl?.checked) return false;
  // a field summary opens onto its summons, scattered through the table; every other group opens
  // onto the parts kept under it
  const field = tgl.id.startsWith("fg") ? tgl.id.slice(2) : "";
  const opened = field
    ? chain!.closest(".grid")!.querySelectorAll<HTMLElement>(`.r[data-fh="${field}"], [data-fh="${field}"] .r`)
    : chain!.querySelectorAll<HTMLElement>(":scope > .parts .r");
  return [...opened].some((r) => held.has(r));
}

/** What the held block is worth, in place of the cell panel a column carries the rest of the
 *  time: the avg cells' total, and — off-tune being the one bar the whole team fills — what the
 *  block gained of it: each row's balance less the one it was entered on, added up, so the run
 *  reads from the balance standing before the block (0 at the top of the run) and the Tune Break
 *  that takes the whole bar drops out rather than reading as a loss across it. A member's own
 *  concerto, energy and forte are left to their columns; nothing else in the block earns a line,
 *  and a block with no line at all has no panel. An opened group's own row is left out where the
 *  block holds the rows it opened onto (`doubled`). */
function blockPanel(sel: CellSel): string {
  let dmg = 0, dmgCells = 0;
  let gained = 0, tuneCells = 0, tuneDigits = 2;
  const held = new Set(sel.rows.slice(sel.r0, sel.r1 + 1));
  const rows = blockCells(sel);
  for (let i = 0; i < rows.length; i++) {
    if (doubled(sel.rows[sel.r0 + i]!, held)) continue;
    for (const c of rows[i]!) {
      if (c.dataset.avg !== undefined) {
        dmg += Number(c.dataset.avg) || 0;
        dmgCells++;
        continue;
      }
      if (c.dataset.val === undefined) continue;
      const col = logColumns[[...c.parentElement!.children].indexOf(c)]!;
      if (col.key !== "offtune") continue;
      gained += (Number(c.dataset.val) || 0) - (Number(c.dataset.before) || 0);
      tuneDigits = col.digits ?? 2;
      tuneCells++;
    }
  }
  const lines: [string, string][] = dmgCells > 1 ? [["Total Dmg", fmt(dmg, 0)]] : [];
  if (tuneCells) lines.push(["Total Offtune", fmt(gained, tuneDigits, true, false)]);
  if (!lines.length) return "";
  return `<span class="pop stat"><table>`
    + lines.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join("")
    + `</table></span>`;
}

/** The block a press picked out: what it can reach, read once at the press, and the two corners it
 *  spans — `ar`/`ac` where the press landed and stays, `fr` the row the pointer has taken the other
 *  one to. `r0`..`c1` are the two corners put in order. */
interface CellSel {
  grid: HTMLElement;
  rows: HTMLElement[];
  /** Each row's top and bottom inside the grid, filled in as the drag first reaches it. Nothing
   *  reflows the table under a held press, so a row measured once is measured for good — and the
   *  measuring is what costs: a row far enough off screen is laid out only when something asks it
   *  for its box (`content-visibility`), and a quick drag sweeps a hundred of them. */
  span: ([number, number] | undefined)[];
  /** Every column in the order it is shown, each with its own edges *inside* the grid — which a
   *  scroll moves the grid by and leaves these alone — and the place its cell sits in a row. */
  cols: { key: string; nth: number; left: number; right: number }[];
  ar: number;
  ac: number;
  fr: number;
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

/** The block of cells a press ran over — a reading marker like the singled-out column, and the
 *  same one: taking either takes the other off. */
let cellSel: CellSel | null = null;
let cellSelBox: HTMLElement | null = null;
/** Whether a press is down on the log, where its pointer last was in page px, and the page's own
 *  zoom as the press found it — read again on every report, it costs a look at the table's layout
 *  for each one, which is what a pointer handler must do least of. */
let holding = false;
let px = 0;
let py = 0;
let pressScale = 1;

function clearBlock(): void {
  cellSel = null;
  cellSelBox?.remove();
  cellSelBox = null;
}

/** Where row `i` sits inside the grid, measured on the first ask and kept after (`span`). */
function rowSpan(sel: CellSel, i: number, gridTop: number): [number, number] {
  const seen = sel.span[i];
  if (seen) return seen;
  const r = rect(sel.rows[i]!);
  const at: [number, number] = [r.top - gridTop, r.bottom - gridTop];
  sel.span[i] = at;
  return at;
}

/** Take the block from the press's own corner out to `row`/`col` and redraw it. */
function aimBlock(sel: CellSel, row: number, col: number, gridTop: number): void {
  sel.fr = row;
  sel.r0 = Math.min(sel.ar, row);
  sel.r1 = Math.max(sel.ar, row);
  sel.c0 = Math.min(sel.ac, col);
  sel.c1 = Math.max(sel.ac, col);
  const top = rowSpan(sel, sel.r0, gridTop)[0];
  const left = sel.cols[sel.c0]!.left;
  const box = cellSelBox ?? (cellSelBox = cellBox(sel.grid));
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${sel.cols[sel.c1]!.right - left}px`;
  box.style.height = `${rowSpan(sel, sel.r1, gridTop)[1] - top}px`;
}

/** The block's own cells, a row of them at a time. */
function blockCells(sel: CellSel): HTMLElement[][] {
  const out: HTMLElement[][] = [];
  for (let r = sel.r0; r <= sel.r1; r++) {
    const cells = sel.rows[r]!.children;
    out.push(sel.cols.slice(sel.c0, sel.c1 + 1).map((c) => cells[c.nth] as HTMLElement));
  }
  return out;
}

/**
 * Aim the block at wherever the pointer now is. Called on a move and on a scroll alike: a scroll
 * under a held press slides the rows past a pointer that has not moved at all, which grows the
 * block exactly as reaching further down the table with the pointer would.
 *
 * The row is walked from the one the pointer was over last — rows run down the table in order, and
 * neither a move nor a scroll shifts it by more than a few — rather than measured up front, since
 * the whole table would then have to be laid out before the first move.
 */
function trackBlock(): void {
  const sel = cellSel;
  if (!sel) return;
  const g = rect(sel.grid);
  const y = py - g.top;
  let row = Math.min(Math.max(sel.fr, 0), sel.rows.length - 1);
  while (row < sel.rows.length - 1 && y > rowSpan(sel, row, g.top)[1]) row++;
  while (row > 0 && y < rowSpan(sel, row, g.top)[0]) row--;
  const x = px - g.left;
  let col = 0;
  while (col < sel.cols.length - 1 && x >= sel.cols[col + 1]!.left) col++;
  aimBlock(sel, row, col, g.top);

  // the panel rides the cell under the pointer; a block with nothing to say is the outline alone
  const html = sel.r0 === sel.r1 ? "" : blockPanel(sel);
  if (!html) {
    dropPanel();
    return;
  }
  drivePanel(sel.rows[row]!.children[sel.cols[col]!.nth]!, html);
}

/** The block is re-aimed a frame at a time. A mouse reports itself far oftener than the screen is
 *  drawn, and each aim reads the table's own layout back, which is the one thing a pointer handler
 *  must not do more than it has to. */
let trackRaf = 0;
function queueTrack(): void {
  if (trackRaf) return;
  trackRaf = requestAnimationFrame(() => {
    trackRaf = 0;
    trackBlock();
  });
}

/** Aim it now, rather than a frame from now — for the last aim of a press, whose frame would land
 *  after everything the release goes on to do. */
function flushTrack(): void {
  if (!trackRaf) return;
  cancelAnimationFrame(trackRaf);
  trackRaf = 0;
  trackBlock();
}

// a scroll under a held press is a reach down the table; the panels' own scroll handler leaves a
// driven panel alone, so the sum rides it out as well
addEventListener("scroll", () => {
  if (holding) queueTrack();
}, true);

/** Ctrl+C takes a copy of the block, a row to a line and a tab between columns — the figures as the
 *  table sets them, so what lands in a spreadsheet reads the way the log does. */
addEventListener("keydown", (e) => {
  if (!cellSel || e.key !== "c" || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const loose = getSelection();
  if (loose && !loose.isCollapsed) return;
  e.preventDefault();
  const text = blockCells(cellSel)
    .map((row) => row.map((c) => (c.textContent ?? "").replace("▸", "").trim()).join("\t")).join("\n");
  navigator.clipboard?.writeText(text).catch(() => { /* nowhere to put it */ });
});

/**
 * Press and drag over the log to pick out a block of cells: any rectangle, any columns. The block
 * wears the same white outline a singled-out column does, and stands from the press until the next
 * block or until a heading singles a column out instead — the two are the one marker, so starting
 * a block takes a singled-out column off outright.
 *
 * No panel opens while the press is down. A block reaching more than one avg cell, or more than
 * one of a member's resource cells, says what they come to (`blockPanel`), left up to be read once
 * the pointer comes up; any other block is the outline alone, and Ctrl+C is what reads it.
 *
 * A block already up is taken off by a plain click anywhere in the log, which does nothing else:
 * the cell it lands on is picked up only by a press that is held or dragged (`arming`), so the
 * click that clears the table does not open a panel or lay a new block down in the same stroke.
 *
 * Rows are re-read on every press rather than kept, since a group opening or a field summary
 * swapping changes which cells are on screen, and only those are picked up or added in.
 */
function wireCellSelect(root: HTMLElement): void {
  clearBlock();
  holding = false;
  const grid = root.querySelector<HTMLElement>(".gridwrap .grid");
  if (!grid) return;

  /** A press made while a block already stood, waiting to find out which it is: held or dragged it
   *  picks its own cell up, let go of it was the click that took the old block off and no more. */
  let arming: { begin: () => void; timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;
  const HELD_AT = 250, MOVED_AT = 3;

  /** Keep the click the press is about to end on from opening the cell's own panel: a reach across
   *  the table, and the press that takes a block off, are presses on the log rather than clicks on
   *  the one cell they happen to have landed on. `keepDefault` leaves the row itself to do what
   *  the click would have done anyway — a group under the press still opens or closes, which the
   *  reader taking a block off has no reason to be denied. A reach across the table is denied it:
   *  the group it set out from would open out from under the block just drawn. */
  const swallowClick = (keepDefault: boolean): void => {
    const swallow = (e: Event): void => {
      if (!keepDefault) e.preventDefault();
      e.stopPropagation();
    };
    addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener("click", swallow, true), 0);
  };

  const end = (): void => {
    flushTrack();
    if (arming) {
      clearTimeout(arming.timer);
      arming = null;
      holdPanels(false);
      swallowClick(true);
      return;
    }
    if (!holding) return;
    holding = false;
    holdPanels(false);
    const sel = cellSel!;
    if (sel.r0 === sel.r1 && sel.c0 === sel.c1) {
      dropPanel();
      return;
    }
    swallowClick(false);
  };

  grid.addEventListener("pointerdown", (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>(".r:not(.head) > .c");
    if (e.button !== 0 || holding || arming || !cell) return;
    const g = rect(grid);
    const cols = [...grid.querySelectorAll<HTMLElement>(":scope > .r.head > .c[data-col]")]
      .map((h, nth) => {
        const r = rect(h);
        return { key: h.dataset.col!, nth, left: r.left - g.left, right: r.right - g.left };
      })
      .sort((a, b) => a.left - b.left);
    const row = cell.closest<HTMLElement>(".r")!;
    const rows = [...grid.querySelectorAll<HTMLElement>(".r")]
      .filter((r) => !r.classList.contains("head") && r.offsetParent);
    const ar = rows.indexOf(row);
    const ac = cols.findIndex((c) => c.nth === [...row.children].indexOf(cell));
    if (ar < 0 || ac < 0) return;

    e.preventDefault();
    cell.setPointerCapture(e.pointerId);
    dropPanel();
    holdPanels(true);
    // the block and a singled-out column are the one marker: taking this one takes that one off
    selected = null;
    selBox?.remove();
    selBox = null;
    pressScale = zoom();
    px = e.clientX / pressScale;
    py = e.clientY / pressScale;

    const begin = (): void => {
      arming = null;
      holding = true;
      cellSel = { grid, rows, span: [], cols, ar, ac, fr: ar, r0: ar, r1: ar, c0: ac, c1: ac };
      aimBlock(cellSel, ar, ac, rect(grid).top);
    };
    // a block already up is put down by this press before anything else, and the press has to
    // stay down to pick a new one up in its place — a plain click on the log is how the reader
    // takes a block off, and it would be no use if it laid another straight back down
    if (!cellSel) {
      begin();
      return;
    }
    clearBlock();
    arming = { begin, timer: setTimeout(begin, HELD_AT), x: px, y: py };
  });

  grid.addEventListener("pointermove", (e) => {
    if (!holding && !arming) return;
    px = e.clientX / pressScale;
    py = e.clientY / pressScale;
    if (arming) {
      // a drag is as good as a hold: it is plainly a reach across the table, not a click
      if (Math.abs(px - arming.x) < MOVED_AT && Math.abs(py - arming.y) < MOVED_AT) return;
      clearTimeout(arming.timer);
      arming.begin();
    }
    queueTrack();
  });

  grid.addEventListener("pointerup", end);
  grid.addEventListener("pointercancel", end);
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

  // the columns are about to slide out from under any block drawn over them
  clearBlock();
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
  /** Where the pointer last was in page px, and the frame waiting to put the column there. */
  let moveX = 0;
  let moveRaf = 0;
  const LIFT_AT = 3;

  head.addEventListener("pointerdown", (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>(".c[data-col]");
    if (e.button !== 0 || drag || settling || !cell) return;
    e.preventDefault();
    cell.setPointerCapture(e.pointerId);
    const width = new Map(cells.map((c) => [c.dataset.col!, rect(c).width]));
    const key = cell.dataset.col!;
    const offsets = offsetsOf(logOrder, width);
    const scale = zoom();
    drag = {
      key,
      nth: cells.indexOf(cell) + 1,
      order: logOrder,
      width,
      home: offsets.get(key)!,
      span: [...width.values()].reduce((n, w) => n + w, 0),
      startX: e.clientX / scale,
      scale,
      at: logOrder.indexOf(key),
    };
    lifted = false;
  });

  /** Put the lifted column where the pointer now has it, and work out which gap it would drop
   *  into — a frame at a time, since each aim re-styles every cell in the column and a mouse
   *  reports itself far oftener than the screen is drawn. */
  const aimDrag = (): void => {
    moveRaf = 0;
    if (!drag) return;
    const w = drag.width.get(drag.key)!;
    const dx = Math.min(drag.span - w - drag.home, Math.max(-drag.home, moveX - drag.startX));
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
    if (at !== drag.at) {
      drag.at = at;
      slideDrag(drag);
    }
    if (liftRule) liftRule.style.transform = `translateX(${dx}px)`;
    if (liftBox) liftBox.style.transform = `translateX(${dx}px)`;
  };

  head.addEventListener("pointermove", (e) => {
    if (!drag) return;
    moveX = e.clientX / drag.scale;
    if (!lifted) {
      if (Math.abs(moveX - drag.startX) < LIFT_AT) return;
      lifted = true;
      document.body.classList.add("coldrag");
      openDrag(head.parentElement as HTMLElement, drag);
    }
    if (!moveRaf) moveRaf = requestAnimationFrame(aimDrag);
  });

  const drop = (): void => {
    if (!drag) return;
    // the last aim of the drag, now rather than a frame from now: the gap it lands in is read off
    // it, and the frame it was waiting for would come after the drop had already chosen one
    if (moveRaf) {
      cancelAnimationFrame(moveRaf);
      aimDrag();
    }
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
