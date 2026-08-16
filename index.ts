/**
 * The whole website: loads the engine out of src/, runs the team, renders the page.
 *
 * Nothing is pre-generated. This imports the real ES modules and computes everything in the
 * browser, so editing a resonator file and refreshing is the whole loop. Browsers block module
 * imports and fetch() on file:// URLs, so the page has to be served — `python -m http.server`
 * from this directory is enough.
 */
import { collapseChains } from "./src/kit.js";
import { State, Enemy } from "./src/state.js";
import type { Loadout, RotationEntry, ResolvedSnapshot } from "./src/state.js";
import { damage } from "./src/damage.js";
import { buildReport, totalsBySlot } from "./src/display.js";
import type { Report, Column, ReportRow, ReportPart, TraceEntry } from "./src/display.js";
import { isPercent, statLabel, ELEMENTS } from "./src/stats.js";
import { AUTO_TUNE_BREAK, MISC, attributeMisc } from "./src/shared/tunebreak.js";

import * as SK from "./src/resonators/shorekeeper.js";
import * as IO from "./src/resonators/iuno.js";
import * as JR from "./src/resonators/jingran.js";
import * as LP from "./src/resonators/lupa.js";
import * as QY from "./src/resonators/qiuyuan.js";
import * as CT from "./src/resonators/cantarella.js";
import * as PH from "./src/resonators/phrolova.js";
import * as BT from "./src/resonators/brant.js";
import * as SH from "./src/resonators/sanhua.js";
import * as BU from "./src/resonators/buling.js";
import * as LC from "./src/resonators/lucilla.js";

interface Member {
  name: string;
  /** This member's own color — each resonator file exports its own `COLOR`, so a build's team
   *  entry just carries it through rather than looking it up by name. */
  color: string;
  loadout: Loadout;
  opener: RotationEntry[];
  loop: RotationEntry[];
}

/**
 * The teams the switch at the top of the page picks between, each a member list in the order
 * they act. Only the lead changes across the first two — Iuno and Jingran are common to both,
 * so switching is really just swapping who is standing in the first slot.
 */
// A member without its own opener (not the team's lead) doesn't have one written yet — stand in
// with their loop rotation for now, so they still get a real turn during the opener phase.
const noOpener = (loadout: Loadout, loop: RotationEntry[]): { opener: RotationEntry[]; loop: RotationEntry[]; loadout: Loadout } =>
  ({ opener: loop, loop, loadout });

const TEAMS: Record<string, Member[]> = {
  skIunoJingran: [
    { name: "Shorekeeper", color: SK.COLOR, loadout: SK.LOADOUT, opener: SK.OPENER, loop: SK.LOOP },
    { name: "Iuno", color: IO.COLOR, ...noOpener(IO.LOADOUT, IO.ROTATION) },
    { name: "Jingran", color: JR.COLOR, ...noOpener(JR.LOADOUT, JR.ROTATION) },
  ],
  lupaIunoJingran: [
    { name: "Lupa", color: LP.COLOR, loadout: LP.LOADOUT, opener: LP.OPENER, loop: LP.LOOP },
    { name: "Iuno", color: IO.COLOR, ...noOpener(IO.LOADOUT, IO.ROTATION) },
    { name: "Jingran", color: JR.COLOR, ...noOpener(JR.LOADOUT_CRCD, JR.ROTATION) },
  ],
  froloQyCanta: [
    { name: "Phrolova", color: PH.COLOR, loadout: PH.LOADOUT, opener: PH.OPENER, loop: PH.LOOP },
    { name: "Qiuyuan", color: QY.COLOR, ...noOpener(QY.LOADOUT, QY.ROTATION) },
    { name: "Cantarella", color: CT.COLOR, ...noOpener(CT.LOADOUT, CT.ROTATION) },
  ],
  froloQyCantaS6R5: [
    { name: "Phrolova", color: PH.COLOR, loadout: PH.LOADOUT_S6R5, opener: PH.OPENER_S6R5, loop: PH.LOOP_S6R5 },
    { name: "Qiuyuan", color: QY.COLOR, ...noOpener(QY.LOADOUT, QY.ROTATION) },
    { name: "Cantarella", color: CT.COLOR, ...noOpener(CT.LOADOUT, CT.ROTATION) },
  ],
  froloSkCanta: [
    { name: "Phrolova", color: PH.COLOR, loadout: PH.LOADOUT, opener: PH.OPENER, loop: PH.LOOP },
    { name: "Shorekeeper", color: SK.COLOR, ...noOpener(SK.LOADOUT, SK.LOOP) },
    { name: "Cantarella", color: CT.COLOR, ...noOpener(CT.LOADOUT, CT.ROTATION) },
  ],
  froloSkCantaS6R5: [
    { name: "Phrolova", color: PH.COLOR, loadout: PH.LOADOUT_S6R5, opener: PH.OPENER_S6R5, loop: PH.LOOP_S6R5 },
    { name: "Shorekeeper", color: SK.COLOR, ...noOpener(SK.LOADOUT, SK.LOOP) },
    { name: "Cantarella", color: CT.COLOR, ...noOpener(CT.LOADOUT, CT.ROTATION) },
  ],
  lupaBrantJingran: [
    { name: "Lupa", color: LP.COLOR, loadout: LP.LOADOUT, opener: LP.OPENER, loop: LP.LOOP },
    { name: "Brant", color: BT.COLOR, ...noOpener(BT.LOADOUT, BT.ROTATION_1_ANCHOR) },
    { name: "Jingran", color: JR.COLOR, ...noOpener(JR.LOADOUT_CRCD, JR.ROTATION) },
  ],
  skSanhuaBrant: [
    { name: "Shorekeeper", color: SK.COLOR, loadout: SK.LOADOUT, opener: SK.OPENER, loop: SK.LOOP },
    { name: "Sanhua", color: SH.COLOR, ...noOpener(SH.LOADOUT, SH.ROTATION) },
    { name: "Brant", color: BT.COLOR, ...noOpener(BT.LOADOUT, BT.ROTATION_1_ANCHOR) },
  ],
  froloBulingCanta: [
    { name: "Phrolova", color: PH.COLOR, loadout: PH.LOADOUT, opener: PH.OPENER, loop: PH.LOOP },
    { name: "Buling", color: BU.COLOR, ...noOpener(BU.LOADOUT, BU.ROTATION) },
    { name: "Cantarella", color: CT.COLOR, ...noOpener(CT.LOADOUT, CT.ROTATION) },
  ],
  froloBulingCantaS6R5: [
    { name: "Phrolova", color: PH.COLOR, loadout: PH.LOADOUT_S6R5, opener: PH.OPENER_S6R5, loop: PH.LOOP_S6R5 },
    { name: "Buling", color: BU.COLOR, ...noOpener(BU.LOADOUT, BU.ROTATION) },
    { name: "Cantarella", color: CT.COLOR, ...noOpener(CT.LOADOUT, CT.ROTATION) },
  ],
  froloLucillaCanta: [
    { name: "Phrolova", color: PH.COLOR, loadout: PH.LOADOUT, opener: PH.OPENER, loop: PH.LOOP },
    { name: "Lucilla", color: LC.COLOR, ...noOpener(LC.LOADOUT, LC.ROTATION) },
    { name: "Cantarella", color: CT.COLOR, ...noOpener(CT.LOADOUT, CT.ROTATION) },
  ],
  froloLucillaCantaS6R5: [
    { name: "Phrolova", color: PH.COLOR, loadout: PH.LOADOUT_S6R5, opener: PH.OPENER_S6R5, loop: PH.LOOP_S6R5 },
    { name: "Lucilla", color: LC.COLOR, ...noOpener(LC.LOADOUT, LC.ROTATION) },
    { name: "Cantarella", color: CT.COLOR, ...noOpener(CT.LOADOUT, CT.ROTATION) },
  ],
  froloSkLucilla: [
    { name: "Phrolova", color: PH.COLOR, loadout: PH.LOADOUT, opener: PH.OPENER, loop: PH.LOOP },
    { name: "Shorekeeper", color: SK.COLOR, ...noOpener(SK.LOADOUT, SK.LOOP) },
    { name: "Lucilla", color: LC.COLOR, ...noOpener(LC.LOADOUT, LC.ROTATION) },
  ],
  froloSkLucillaS6R5: [
    { name: "Phrolova", color: PH.COLOR, loadout: PH.LOADOUT_S6R5, opener: PH.OPENER_S6R5, loop: PH.LOOP_S6R5 },
    { name: "Shorekeeper", color: SK.COLOR, ...noOpener(SK.LOADOUT, SK.LOOP) },
    { name: "Lucilla", color: LC.COLOR, ...noOpener(LC.LOADOUT, LC.ROTATION) },
  ],
  froloQyLucilla: [
    { name: "Phrolova", color: PH.COLOR, loadout: PH.LOADOUT, opener: PH.OPENER, loop: PH.LOOP },
    { name: "Qiuyuan", color: QY.COLOR, ...noOpener(QY.LOADOUT, QY.ROTATION) },
    { name: "Lucilla", color: LC.COLOR, ...noOpener(LC.LOADOUT, LC.ROTATION) },
  ],
  froloQyLucillaS6R5: [
    { name: "Phrolova", color: PH.COLOR, loadout: PH.LOADOUT_S6R5, opener: PH.OPENER_S6R5, loop: PH.LOOP_S6R5 },
    { name: "Qiuyuan", color: QY.COLOR, ...noOpener(QY.LOADOUT, QY.ROTATION) },
    { name: "Lucilla", color: LC.COLOR, ...noOpener(LC.LOADOUT, LC.ROTATION) },
  ],
};
const DEFAULT_TEAM = "skIunoJingran";

/** Off-tune's own fourth "member" — not a real resonator, so it has no `COLOR` export to carry
 *  through the way a team's own members do. */
const MISC_HUE = "#8a94a3";
const FALLBACK_HUE = "#5b9cff";

/** How many leading columns stay put while the table scrolls sideways: `member` and `action`. */
const STICK = 2;

/* ------------------------------------------------------------------ the engine */

// level 100 enemy, level 90 resonators, a flat 20% base resistance, 39.2% max off-tune — every
// fight this calculator runs uses the same standing numbers.
const ENEMY_LEVEL = 100, RESONATOR_LEVEL = 90, DEFAULT_RES = 20, MAX_OFFTUNE = 39.2;

async function runTeam(members: Member[]): Promise<{
  state: State; report: Report; openerReport: Report; loopReport: Report; members: Member[];
}> {
  // the same flat resistance seeded onto every element, until a fight wants them to differ
  const enemy = new Enemy({
    level: ENEMY_LEVEL,
    baseRes: Object.fromEntries(ELEMENTS.map((e) => [e, DEFAULT_RES])),
    maxOfftune: MAX_OFFTUNE,
  });
  const state = new State({
    team: members.map((m) => m.name),
    level: RESONATOR_LEVEL,
    enemy,
    // the engine's own standing rules, ahead of anything a build equips
    buffs: [AUTO_TUNE_BREAK],
  });
  state.startFight(Object.fromEntries(members.map((m) => [m.name, m.loadout])));

  // Every member's opener runs first, in team order, then every member's loop — matching how a
  // real run actually goes: the whole team gets set up before anyone starts repeating.
  const runPart = (rotation: RotationEntry[]) => {
    if (!rotation.length) return [];
    const rows = state.run(rotation)
      .map((s) => ({ snap: attributeMisc(s), dmg: damage(s, state.config) }));
    return collapseChains(rows);
  };
  const openerLines = members.flatMap((m) => runPart(m.opener));
  const loopLines = members.flatMap((m) => runPart(m.loop));

  return {
    state,
    report: buildReport([...openerLines, ...loopLines], { config: state.config }),
    // separate reports just for the two totals rows — the opener and loop are each their own
    // "one rotation each" figure, not halves of a single total
    openerReport: buildReport(openerLines, { config: state.config }),
    loopReport: buildReport(loopLines, { config: state.config }),
    members,
  };
}

/* --------------------------------------------------------------------- helpers */

const esc = (s: unknown): string => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmt = (v: number | string | null | undefined, digits = 0): string =>
  typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: digits })
                        : String(v ?? "");

/**
 * One table cell. Columns carry a character `width` (the report also prints to a terminal), so
 * a sticky column's offset is the character widths to its left, scaled by the CSS --cw.
 */
const colWidth = (c: Column, i: number): string => {
  // Two fonts, two per-character widths. The numeric columns are monospace, where --cw is exact;
  // the action column is set in the proportional UI font, whose average character is a good deal
  // narrower — sizing it with --cw is what left a gap in front of the first number.
  const per = c.align === "left" ? "var(--cwt)" : "var(--cw)";
  const base = `${per} * ${c.width} + var(--cpad)`;
  // The first column carries an extra lead-in so the action name is not flush against the
  // table edge. It has to be in the track width as well as the cell padding, or the grid
  // and the sticky offsets stop agreeing on where the column ends.
  return i === 0 ? `calc(${base} + var(--lead))` : `calc(${base})`;
};

function cell(columns: Column[], index: number, { cls = [], html = "", style = "" }: { cls?: string[]; html?: string; style?: string }): string {
  const col = columns[index]!;
  const stick = index < STICK;
  // A sticky column's offset is everything to its left, which has to be summed in the same two
  // units colWidth() lays those tracks out in — plus the lead-in they carry, or the frozen
  // columns drift against the rest of the row as it scrolls.
  const before = columns.slice(0, index);
  const span = (want: boolean) => before.filter((c) => (c.align === "left") === want)
    .reduce((n, c) => n + (c.width ?? 0), 0);
  const left = `calc(var(--cwt) * ${span(true)} + var(--cw) * ${span(false)}`
    + ` + var(--cpad) * ${before.length}`
    + `${before.length ? " + var(--lead)" : ""})`;
  const classes = [
    "c",
    col.align === "left" ? "" : "num",
    ...cls,
    stick ? "stick" : "",
    stick && index === STICK - 1 ? "seam" : "",
  ].filter(Boolean).join(" ");
  const styleAttr = [stick ? `left:${left}` : "", style].filter(Boolean).join(";");
  return `<span class="${classes}"${styleAttr ? ` style="${styleAttr}"` : ""}>${html}</span>`;
}

/**
 * Every source that fed one value, revealed on hover.
 *
 * A row is marked with a % when its own stat is a ratio, which is decided per row rather than
 * per column: attack is fed by base attack in points and by attack bonus in percent, and 12
 * points of attack and 12% of it are not remotely the same claim. The total takes the
 * column's own unit — attack totals a flat number however much of it arrived as a percentage.
 */
const unit = (r: TraceEntry): string => ((r.percent ?? (r.stat ? isPercent(r.stat) : false)) ? "%" : "");

/** How a scaling reads in the motion-value panel's total: `738.33% ATK`. */
const SCALING_LABEL: Record<string, string> = { atk: "ATK", hp: "HP", def: "DEF", dot: "Dot", tune: "Tune" };

/** Headings run in the order the fold applies them: `base x (1 + bonus%) + flat`. */
const SECTION_ORDER = ["base", "bonus", "flat"];
const SECTION_RANK = (key: string | null): number =>
  (key === null ? -1 : (SECTION_ORDER.indexOf(key) + 1 || SECTION_ORDER.length + 1));

/**
 * One row of a panel. A row either names a stat — and takes that stat's own unit — or carries
 * its own `label`, which is how the formula terms and the derived factors get in. `mult` marks
 * a value that is a multiplier rather than an amount, so it reads `x1.24` and not `1.24`.
 */
const panelRow = (r: TraceEntry, slotHue: Map<string, string>, { noSource = false }: { noSource?: boolean } = {}): string => {
  // the same left bar the member column carries, colored by whoever granted this row rather
  // than whoever's turn it is — a global buff still bars in its original owner's colour.
  // `owner` is only ever set on rows traced back from an actual StatEntry — a derived row built
  // by hand here in display.ts (the Relative row, a factor row, ...) leaves it undefined, which
  // is how those opt out of the bar rather than all landing on the ownerless MISC_HUE.
  const own = r.owner !== undefined ? (slotHue.get(r.owner ?? "") ?? MISC_HUE) : null;
  return `<tr>${noSource ? "" : `<td class="s"${own ? ` style="--own:${own}"` : ""}>${esc(r.source)}</td>`}`
  + `<td class="k">${esc(r.label ?? (r.stat ? statLabel(r.stat) : ""))}</td>`
  + `<td class="v">${r.mult ? `&times;${fmt(r.value, r.digits ?? 4)}` : `${fmt(r.value, r.digits ?? 4)}${unit(r)}`}</td>`
  + `</tr>`;
};

/**
 * `suffix` is appended after the total's own value — the motion value names what it scales off.
 *
 * Rows carrying a `section` are grouped under a heading with their own subtotal, which is what
 * makes an attack panel legible: base, bonus and flat do not sum to the total, they fold into
 * it as `base x (1 + bonus%) + flat`, and separating them shows that rather than hiding it.
 */
function popover(col: Column, rows: TraceEntry[] | undefined, total: number | string | null | undefined, slotHue: Map<string, string>, suffix = ""): string {
  if (!rows?.length) return "";

  // The avg column's own panel is a flat list of formula terms whose labels already say what
  // they are ("Motion Value", "Damage Bonus", ...) — a source column would only repeat that,
  // so it drops the column entirely rather than leave it echoing the label next to it.
  const noSource = col.key === "avg";
  const row = (r: TraceEntry) => panelRow(r, slotHue, { noSource });

  // A row may sit outside the sections entirely: just above the total (a derived figure the
  // sections lead to) or just below it (what the total then becomes).
  const before = rows.filter((r) => r.place === "beforeTotal");
  const after = rows.filter((r) => r.place === "afterTotal");
  const listed = rows.filter((r) => !r.place);

  // Gather every row of a section together rather than by run: the traced rows arrive in the
  // order the buffs contributed them, so base/bonus/flat interleave by source and grouping
  // consecutive ones would split each heading into several fragments with partial subtotals.
  const bySection = new Map<string | null, TraceEntry[]>();
  for (const r of listed) {
    const key = r.section ?? null;
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push(r);
  }
  const sections = [...bySection]
    .map(([key, group]) => ({ key, rows: group }))
    .sort((a, b) => SECTION_RANK(a.key) - SECTION_RANK(b.key));

  const body = sections.map(({ key, rows: group }) => {
    const head = key ? `<tr class="sec"><td colspan="3">${esc(key)}</td></tr>` : "";
    // The heading right above already says which group this is ("BASE", "BONUS", "FLAT"), so
    // the subtotal only has to say "Total" — in the label column, lining it up with every other
    // row's own label rather than restating the stat name across both columns.
    const sub = key
      ? `<tr class="sub">${noSource ? "" : `<td class="s"></td>`}<td class="k">Total</td>`
        + `<td class="v">`
        + `${fmt(group.reduce((n, r) => n + r.value, 0), 4)}${unit(group[0]!)}</td></tr>`
      : "";
    return head + group.map(row).join("") + sub;
  }).join("");

  return `<span class="pop"><table>${body}${before.map(row).join("")}`
    + `<tr class="sum">${noSource ? "" : `<td class="s"></td>`}<td class="k">Total</td>`
    + `<td class="v">${fmt(total, col.digits ?? 0)}${col.percent ? "%" : ""}${esc(suffix)}</td>`
    + `</tr>${after.map(row).join("")}</table></span>`;
}

/** The hover on an action's own name: what it scales off, its element, its damage type — one
 *  word a row, in the same `<span class="pop"><table>` shell every other panel uses (see
 *  `popover()` above), just without a total to sum to. */
function infoPopover(info: string[] | undefined): string {
  if (!info?.length) return "";
  const rows = info.map((t) => `<tr><td colspan="3">${esc(t)}</td></tr>`).join("");
  return `<span class="pop info"><table>${rows}</table></span>`;
}

/* --------------------------------------------------------------------- table */

/**
 * One row of the table. A chain's members go through this too, so a part carries the same
 * values and the same hover traces as a lone action does — `part` only changes how the action
 * cell reads: indented and tagged with its damage type, rather than carrying the expand caret.
 */
function stepRow(columns: Column[], row: ReportRow | ReportPart, slotHue: Map<string, string>, { part = false }: { part?: boolean } = {}): string {
  return columns.map((col, i) => {
    const v = row.raw[col.key];
    const sources = row.sources[col.key];
    const cls: string[] = [];
    if (col.key === "action") {
      cls.push(part ? "name" : "action");
    }
    if (col.key === "avg") cls.push("avg");
    if (col.key === "member") cls.push("member");

    // a ratio column carries its unit on the value, so a row reads as the game writes it
    const text = esc(fmt(v, col.digits ?? 0)) + (col.percent && typeof v === "number" ? "%" : "");
    // The dotted underline (`.has`) means "this cell has extra info on hover" — informative on
    // a value cell, where it is sometimes true. Every action name carries a popover, so the
    // same treatment there is never informative and reads as a stray line under every row.
    let html = sources ? `<span class="has">${text}</span>` : text;
    // a chain gets a caret, since its row is the thing you click to see the parts — only a full
    // ReportRow (never a chain's own part) carries a `parts` list to expand
    if (col.key === "action" && !part && "parts" in row && row.parts.length) {
      html = `${html}<span class="caret">▸</span>`;
    }
    // only the motion value names its unit: it is the one number multiplying a stat
    const suffix = col.key === "mv" && row.scaling
      ? ` ${SCALING_LABEL[row.scaling] ?? row.scaling}` : "";
    html += col.key === "action" ? infoPopover("info" in row ? row.info : undefined) : popover(col, sources, v, slotHue, suffix);

    // the member column carries its own full-strength color, independent of the row's own
    // (much fainter) action-based tint — so who acted still reads clearly on a white/green row
    // The member column is its own colour system end to end — text, left bar and background
    // wash all come from the member, never from the action the rest of the row is tinted by.
    const mem = slotHue.get(String(v)) ?? FALLBACK_HUE;
    const style = col.key === "member" ? `--mem:${mem};color:${mem}` : "";

    return cell(columns, i, { cls, html, style });
  }).join("");
}

/** A chain's members, one full row each. */
function partRows(columns: Column[], parts: ReportPart[], slotHue: Map<string, string>): string {
  return parts
    .map((p) => `<div class="r${p.short ? " short" : ""}">${stepRow(columns, p, slotHue, { part: true })}</div>`)
    .join("");
}

/**
 * The whole team's rotation as one table, in the order they act.
 *
 * A chain's parts are collapsed behind its own row — a hidden checkbox and a label, so clicking
 * anywhere on the row opens it and no script is needed to keep that state. Each row is tinted by
 * its own action's color (white/green for generic gear, otherwise whoever's kit it belongs to)
 * — a much fainter wash than before (see the CSS), since the member column now carries the
 * full-strength "whose turn" color instead.
 */
function rotationTable(report: Report, slotHue: Map<string, string>): string {
  const columns = report.columns;
  const cols = columns.map((c, i) => colWidth(c, i)).join(" ");

  const head = columns
    .map((c, i) => cell(columns, i, { html: esc(c.label) }))
    .join("");

  const steps = report.rows.map((row, i) => {
    const hue = (row.line.snap as ResolvedSnapshot).action.color || FALLBACK_HUE;
    const style = ` style="--m:${hue}"`;
    const cells = stepRow(columns, row, slotHue);
    const shortCls = row.short ? " short" : "";
    if (!row.parts.length) {
      return `<div class="step"${style}><div class="r${shortCls}">${cells}</div></div>`;
    }
    const id = `x${i}`;
    return `<div class="step chain"${style}>`
      + `<input class="tgl" type="checkbox" id="${id}">`
      + `<label class="r${shortCls}" for="${id}">${cells}</label>`
      + `<div class="parts">${partRows(columns, row.parts, slotHue)}</div>`
      + `</div>`;
  }).join("");

  const totalRow = columns.map((c, i) => cell(columns, i, {
    html: i === 0 ? "team total" : c.key === "avg" ? fmt(report.total) : "",
  })).join("");

  return `<div class="gridwrap"><div class="grid" style="--cols:${cols}">
    <div class="r head">${head}</div>
    ${steps}
    <div class="r totalrow">${totalRow}</div>
  </div></div>`;
}

/* ----------------------------------------------------------------- page pieces */

/** Buffs granted, adopted, lost, published to the outro queue. Each line already names the
 *  action that caused it, so it reads as a trace rather than a list of resonators. */
function eventLog(log: string[]): string {
  if (!log.length) return "";
  return `<div class="eventlog"><h2>Event log</h2>`
    + `<ol>${log.map((l) => `<li>${esc(l)}</li>`).join("")}</ol></div>`;
}

function chips(state: State, report: Report): string {
  const { level } = state.config;
  const { level: enemyLevel, baseRes } = state.enemy;
  // every element still seeded the same flat value today (see runTeam) — show that one number,
  // or "mixed" once something actually gives the enemy asymmetric resistances
  const resValues = new Set(ELEMENTS.map((e) => baseRes[e] ?? 0));
  const res = resValues.size === 1 ? `${[...resValues][0]}%` : "mixed";

  return [
    `resonator lv<b>${level}</b>`,
    `enemy lv<b>${enemyLevel}</b>`,
    `<b>${res}</b> res`,
    `<b>${report.rows.length}</b> actions`,
  ].map((c) => `<span class="chip">${c}</span>`).join("");
}

/** The five totals — one card a member, one grand total. Sits below the table now, so it reads
 *  as a summary of what was just scrolled through rather than a header claiming the answer
 *  before the rotation that produced it. */
function summaryCards(label: string, report: Report, slotHue: Map<string, string>): string {
  const totals = totalsBySlot(report);
  const cards = [...totals].map(([name, total]) =>
    `<div class="card" style="--m:${slotHue.get(name)}">
      <span class="k">${esc(name)}</span>
      <span class="v">${fmt(total)}</span>
      <span class="sub">${Math.round((total / report.total) * 100)}% of the ${label} total</span>
    </div>`).join("");

  return `<h2 class="summary-label">${esc(label)} totals</h2>
  <div class="summary">
    ${cards}
    <div class="card grand">
      <span class="k">${label} total</span>
      <span class="v">${fmt(report.total)}</span>
      <span class="sub">average damage, one rotation each</span>
    </div>
  </div>`;
}

function page({ state, report, openerReport, loopReport, members }: {
  state: State; report: Report; openerReport: Report; loopReport: Report; members: Member[];
}): string {
  // one member's own color each, plus Misc's fixed one — keyed by slot name for the summary
  // cards and the rotation table's own "member" column (the row-wide tint uses the action's
  // own color instead, read straight off each row).
  const slotHue = new Map([...members.map((m): [string, string] => [m.name, m.color]), [MISC, MISC_HUE]]);

  return `<main>
  ${rotationTable(report, slotHue)}
  ${summaryCards("opener", openerReport, slotHue)}
  ${summaryCards("loop", loopReport, slotHue)}
  ${eventLog(state.log)}
</main>`;
}

function errorPage(err: unknown): string {
  const looksLikeFileUrl = location.protocol === "file:";
  const hint = looksLikeFileUrl
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

/* ------------------------------------------------------------- source panels */

/**
 * Show the panel listing every buff that fed a value, when its cell is hovered.
 *
 * The panel is `position: fixed` (see index.css for why it has to be), so the only thing left
 * is to give it coordinates: under its cell, right edges aligned, flipped above instead when
 * there is no room below and pulled back inside the window when there is none to the side.
 *
 * One column is sticky (`.c.stick`, the action column — see index.css), and a sticky element
 * sets its own `z-index` so it can paint over the rest of its own row scrolling underneath it.
 * That gives it a stacking context of its own, which traps any `z-index` a descendant sets
 * too: a panel living inside it never actually competes at `z-index: 200` against the *rest of
 * the page* — only against its sticky ancestor's other content, at whatever level *that*
 * ancestor got. A later row's own sticky cell — same z-index, later in DOM order — ends up
 * painted on top of an earlier row's "open" panel despite its higher number. `place()` below
 * moves the panel to be a direct child of `<body>` while it is shown, which escapes the trap
 * entirely: from the root stacking context, its own z-index finally means what it says.
 */
function wireSourcePanels(root: HTMLElement): void {
  const GAP = 4, EDGE = 6;
  let open: HTMLElement | null = null;
  /** Where an open panel actually lives — its cell, before `place()` moves it to `<body>`. Put
   *  back there on close, so the plain in-cell lookup works again for its next hover. */
  let openHome: Element | null = null;
  /** While pinned, hovering elsewhere leaves the panel alone; only a click outside closes it. */
  let pinned = false;

  // A panel from a previous render may still be sitting directly in <body> if the team was
  // switched away while it was open — the cell it was moved out of no longer exists to reclaim
  // it, and this function's own `open`/`openHome` are fresh on every call, so nothing else would.
  document.body.querySelectorAll(":scope > .pop").forEach((el) => el.remove());

  const close = (): void => {
    if (open) {
      open.style.display = "";
      open.classList.remove("pinned");
      if (openHome && open.parentElement !== openHome) openHome.appendChild(open);
    }
    open = null;
    openHome = null;
    pinned = false;
  };

  const place = (cell: Element, pop: HTMLElement): void => {
    if (pop.parentElement !== document.body) document.body.appendChild(pop);
    // measure it where it will be shown, but before it can be seen
    pop.style.visibility = "hidden";
    pop.style.display = "block";
    const c = cell.getBoundingClientRect();
    const p = pop.getBoundingClientRect();

    const left = Math.max(EDGE, Math.min(c.right - p.width, innerWidth - p.width - EDGE));
    const below = c.bottom + GAP;
    const top = below + p.height > innerHeight - EDGE
      ? Math.max(EDGE, c.top - p.height - GAP)
      : below;

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.visibility = "";
    open = pop;
    openHome = cell;
  };

  const panelIn = (target: EventTarget | null): { cell: Element | null; pop: HTMLElement | null } => {
    const cell = (target as Element | null)?.closest?.(".c") ?? null;
    if (!cell) return { cell: null, pop: null };
    // The open panel may already have been moved out to <body> by `place()`, so it is no
    // longer reachable as a child of its own cell — check the remembered home first. A cell
    // whose panel has never opened still finds it the plain way.
    const pop = (open && openHome === cell) ? open : cell.querySelector<HTMLElement>(":scope > .pop");
    return { cell, pop };
  };

  // Listens on the document rather than just the table: an open panel now lives in <body> once
  // shown (see above), somewhere the table's own listeners would never see it hovered.
  document.addEventListener("mouseover", (e) => {
    if (pinned) return;
    if (open && open.contains(e.target as Node)) return;   // hovering the open panel itself
    const { cell, pop } = panelIn(e.target);
    if (pop === open) return;
    close();
    if (pop) place(cell!, pop);
  });

  // leaving the table entirely, and any scroll — a fixed panel does not follow its cell
  document.addEventListener("mouseout", (e) => {
    if (pinned) return;
    const to = e.relatedTarget as Node | null;
    if (to && (root.contains(to) || (open && open.contains(to)))) return;
    close();
  });

  /**
   * Click a cell to pin its panel open, so it can be read at leisure or its numbers selected.
   * Clicking the same cell again unpins; clicking anywhere outside the open panel closes it.
   *
   * Chain rows are `<label>`s wrapping a checkbox, so a click on the *cell* would also toggle
   * the expander — `preventDefault` there keeps pinning from doing both. A click already inside
   * an open panel does not reach this far: an open panel lives in `<body>` (see `place()`), well
   * outside any `<label>`, so the guard below is only for reading/selecting it, not for that.
   */
  addEventListener("click", (e) => {
    if (open && open.contains(e.target as Node)) { e.preventDefault(); return; }

    const { cell, pop } = panelIn(e.target);
    // A chain's own action cell carries the expand caret. Clicking it is how the row opens its
    // parts — that has to win over pinning the element/type/scaling popover sitting on the same
    // name, so this falls through to the label's own default behaviour instead of stealing the
    // click the way every other popover-bearing cell does.
    if (cell?.querySelector(":scope > .caret")) { close(); return; }
    if (!pop || !root.contains(cell)) { close(); return; }

    e.preventDefault();
    if (pinned && pop === open) { close(); return; }

    if (pop !== open) { close(); place(cell!, pop); }
    pinned = true;
    pop.classList.add("pinned");
  });

  addEventListener("scroll", close, true);
  addEventListener("resize", close);
}

/* ----------------------------------------------------------------------- mount */

const app = document.getElementById("app")!;
const switchBar = document.getElementById("teamSwitch")!;
const teamButtons = [...switchBar.querySelectorAll<HTMLElement>(".teambtn")];
const headerChips = document.getElementById("headerChips")!;

/**
 * Run one team and mount it. `token` guards against two switches racing: if the button is
 * pressed again before this one's fetch/compute finishes, its result is thrown away instead of
 * clobbering whatever the newer click already showed — the only way that could happen here,
 * since `runTeam` itself is a pure function of which team it was asked for.
 */
let renderToken = 0;

async function renderTeam(key: string): Promise<void> {
  const token = ++renderToken;
  for (const b of teamButtons) {
    b.classList.toggle("active", b.dataset.team === key);
    (b as HTMLButtonElement).disabled = true;
  }
  app.innerHTML = `<div class="spinner"></div><p>running the rotation…</p>`;
  app.className = "loading";

  try {
    const result = await runTeam(TEAMS[key]!);
    if (token !== renderToken) return;
    app.innerHTML = page(result);
    headerChips.innerHTML = chips(result.state, result.report);
    app.className = "";
    wireSourcePanels(app);
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    app.innerHTML = errorPage(err);
    app.className = "";
  } finally {
    if (token === renderToken) for (const b of teamButtons) (b as HTMLButtonElement).disabled = false;
  }
}

for (const b of teamButtons) {
  b.addEventListener("click", () => renderTeam(b.dataset.team!));
}

renderTeam(DEFAULT_TEAM);
