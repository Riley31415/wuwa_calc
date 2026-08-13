/**
 * The whole website: loads the engine out of src/, runs the team, renders the page.
 *
 * Nothing is pre-generated. This imports the real ES modules and computes everything in the
 * browser, so editing a resonator file and refreshing is the whole loop. Browsers block module
 * imports and fetch() on file:// URLs, so the page has to be served — `python -m http.server`
 * from this directory is enough.
 */
import { State } from "./src/state.js";
import { damage } from "./src/damage.js";
import { collapseChains } from "./src/chain.js";
import { buildReport, totalsBySlot } from "./src/display.js";
import { isPercent, statLabel } from "./src/stats.js";
import "./src/shared.js";

import * as SK from "./src/resonators/shorekeeper.js";
import * as IO from "./src/resonators/iuno.js";
import * as JR from "./src/resonators/jingran.js";

/** Who is on the team, in the order they act. */
const MEMBERS = [
  { name: "Shorekeeper", loadout: SK.LOADOUT, rotation: SK.ROTATION },
  { name: "Iuno", loadout: IO.LOADOUT, rotation: IO.ROTATION },
  { name: "Jingran", loadout: JR.LOADOUT, rotation: JR.ROTATION },
];

/**
 * One hue per resonator, shared by their summary card, their heading and every row of their
 * rotation. Keyed by name rather than by slot order so a member keeps their colour wherever
 * they sit in the team; anything unlisted falls back to the neutral accent.
 */
const HUES = {
  Shorekeeper: "#8fb3d9",   // grayish light blue
  Iuno:        "#2dd4c0",   // turquoise
  Jingran:     "#f2603c",   // orangeish red
};
const FALLBACK_HUE = "#5b9cff";
const hueOf = (name) => HUES[name] ?? FALLBACK_HUE;

/** How many leading columns stay put while the table scrolls sideways: just `action`. */
const STICK = 1;

/* ------------------------------------------------------------------ the engine */

async function loadData(name) {
  const res = await fetch(`./data/${name}`);
  if (!res.ok) throw new Error(`fetch ./data/${name} failed — ${res.status} ${res.statusText}`);
  return res.json();
}

async function runTeam() {
  const cfg = (await loadData("config.json")).constants;
  const levels = await loadData("levels.json");

  const state = new State({
    team: MEMBERS.map((m) => m.name),
    level: cfg.resonatorLevel,
    enemyLevel: cfg.enemyLevel,
    res: cfg.defaultRes * 100,
  });
  state.config.maxOfftune = cfg.maxOfftune;
  state.startFight(Object.fromEntries(MEMBERS.map((m) => [m.name, m.loadout])));

  // One table for the whole team, in the order they act. Nothing is stripped from the action
  // names: with three rotations in one table the source prefix is what tells them apart.
  const lines = MEMBERS.flatMap((m) => {
    const rows = state.run(m.rotation)
      .map((s) => ({ snap: s, dmg: damage(s, state.config, levels) }));
    return collapseChains(rows);
  });

  return { state, report: buildReport(lines, { config: state.config, levels }) };
}

/* --------------------------------------------------------------------- helpers */

const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmt = (v, digits = 0) =>
  typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: digits })
                        : String(v ?? "");

/**
 * One table cell. Columns carry a character `width` (the report also prints to a terminal), so
 * a sticky column's offset is the character widths to its left, scaled by the CSS --cw.
 */
const colWidth = (c, i) => (i === 0
  // The first column carries an extra lead-in so the action name is not flush against the
  // table edge. It has to be in the track width as well as the cell padding, or the grid
  // and the sticky offsets stop agreeing on where the column ends.
  ? `calc(var(--cw) * ${c.width} + var(--cpad) + var(--lead))`
  : `calc(var(--cw) * ${c.width} + var(--cpad))`);

function cell(columns, index, { cls = [], html = "" }) {
  const col = columns[index];
  const stick = index < STICK;
  const before = columns.slice(0, index);
  const left = `calc(var(--cw) * ${before.reduce((n, c) => n + c.width, 0)}`
    + ` + var(--cpad) * ${before.length})`;
  const classes = [
    "c",
    col.align === "left" ? "" : "num",
    ...cls,
    stick ? "stick" : "",
    stick && index === STICK - 1 ? "seam" : "",
  ].filter(Boolean).join(" ");
  const style = stick ? ` style="left:${left}"` : "";
  return `<span class="${classes}"${style}>${html}</span>`;
}

/**
 * Every source that fed one value, revealed on hover.
 *
 * A row is marked with a % when its own stat is a ratio, which is decided per row rather than
 * per column: attack is fed by base attack in points and by attack bonus in percent, and 12
 * points of attack and 12% of it are not remotely the same claim. The total takes the
 * column's own unit — attack totals a flat number however much of it arrived as a percentage.
 */
const unit = (r) => ((r.percent ?? (r.stat ? isPercent(r.stat) : false)) ? "%" : "");

/** How a scaling reads in the motion-value panel's total: `738.33% ATK`. */
const SCALING_LABEL = { atk: "ATK", hp: "HP", def: "DEF", dot: "Dot", tune: "Tune" };

/** Headings run in the order the fold applies them: `base x (1 + bonus%) + flat`. */
const SECTION_ORDER = ["base", "bonus", "flat"];
const SECTION_RANK = (key) =>
  (key === null ? -1 : (SECTION_ORDER.indexOf(key) + 1 || SECTION_ORDER.length + 1));

/**
 * One row of a panel. A row either names a stat — and takes that stat's own unit — or carries
 * its own `label`, which is how the formula terms and the derived factors get in. `mult` marks
 * a value that is a multiplier rather than an amount, so it reads `x1.24` and not `1.24`.
 */
const panelRow = (r) =>
  `<tr><td class="s">${esc(r.source)}</td>`
  + `<td class="k">${esc(r.label ?? (r.stat ? statLabel(r.stat) : ""))}</td>`
  + `<td class="v">${r.mult ? `&times;${fmt(r.value, 4)}` : `${fmt(r.value, 4)}${unit(r)}`}</td>`
  + `</tr>`;

/**
 * `suffix` is appended after the total's own value — the motion value names what it scales off.
 *
 * Rows carrying a `section` are grouped under a heading with their own subtotal, which is what
 * makes an attack panel legible: base, bonus and flat do not sum to the total, they fold into
 * it as `base x (1 + bonus%) + flat`, and separating them shows that rather than hiding it.
 */
function popover(col, rows, total, suffix = "") {
  if (!rows?.length) return "";

  // A row may sit outside the sections entirely: just above the total (a derived figure the
  // sections lead to) or just below it (what the total then becomes).
  const before = rows.filter((r) => r.place === "beforeTotal");
  const after = rows.filter((r) => r.place === "afterTotal");
  const listed = rows.filter((r) => !r.place);

  // Gather every row of a section together rather than by run: the traced rows arrive in the
  // order the buffs contributed them, so base/bonus/flat interleave by source and grouping
  // consecutive ones would split each heading into several fragments with partial subtotals.
  const bySection = new Map();
  for (const r of listed) {
    const key = r.section ?? null;
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(r);
  }
  const sections = [...bySection]
    .map(([key, group]) => ({ key, rows: group }))
    .sort((a, b) => SECTION_RANK(a.key) - SECTION_RANK(b.key));

  const body = sections.map(({ key, rows: group }) => {
    const head = key ? `<tr class="sec"><td colspan="3">${esc(key)}</td></tr>` : "";
    const sub = key
      ? `<tr class="sub"><td class="s" colspan="2">`
        + `total ${esc(key)} ${esc(col.noun ?? col.label)}</td><td class="v">`
        + `${fmt(group.reduce((n, r) => n + r.value, 0), 4)}${unit(group[0])}</td></tr>`
      : "";
    return head + group.map(panelRow).join("") + sub;
  }).join("");

  return `<span class="pop"><table>${body}${before.map(panelRow).join("")}`
    + `<tr class="sum"><td colspan="2">total</td>`
    + `<td class="v">${fmt(total, col.digits ?? 0)}${col.percent ? "%" : ""}${esc(suffix)}</td>`
    + `</tr>${after.map(panelRow).join("")}</table></span>`;
}

/* --------------------------------------------------------------------- table */

/**
 * One row of the table. A chain's members go through this too, so a part carries the same
 * values and the same hover traces as a lone action does — `part` only changes how the action
 * cell reads: indented and tagged with its damage type, rather than carrying the expand caret.
 */
function stepRow(columns, row, { part = false } = {}) {
  return columns.map((col, i) => {
    const v = row.raw[col.key];
    const sources = row.sources[col.key];
    const cls = [];
    if (col.key === "action") {
      cls.push(part ? "name" : "action");
      if (part && row.isShown) cls.push("best");
    }
    if (col.key === "avg") cls.push("avg");

    // a ratio column carries its unit on the value, so a row reads as the game writes it
    const text = esc(fmt(v, col.digits ?? 0)) + (col.percent && typeof v === "number" ? "%" : "");
    let html = sources ? `<span class="has">${text}</span>` : text;
    if (col.key === "action") {
      if (part) html += `<span class="tag">${esc(row.type)}</span>`;
      // a chain gets a caret, since its row is the thing you click to see the parts
      else if (row.parts.length) html = `<span class="caret">▸</span>${html}`;
    }
    // only the motion value names its unit: it is the one number multiplying a stat
    const suffix = col.key === "mv" && row.scaling
      ? ` ${SCALING_LABEL[row.scaling] ?? row.scaling}` : "";
    html += popover(col, sources, v, suffix);

    return cell(columns, i, { cls, html });
  }).join("");
}

/** A chain's members, one full row each. */
function partRows(columns, parts) {
  return parts
    .map((p) => `<div class="r">${stepRow(columns, p, { part: true })}</div>`)
    .join("");
}

/**
 * The whole team's rotation as one table, in the order they act.
 *
 * A chain's parts are collapsed behind its own row — a hidden checkbox and a label, so clicking
 * anywhere on the row opens it and no script is needed to keep that state. Each row is tinted
 * by whose rotation it belongs to, which is what separating the tables used to do.
 */
function rotationTable(report, slotHue) {
  const columns = report.columns;
  const cols = columns.map((c, i) => colWidth(c, i)).join(" ");

  const head = columns
    .map((c, i) => cell(columns, i, { html: esc(c.label) }))
    .join("");

  const steps = report.rows.map((row, i) => {
    const hue = slotHue.get(row.line.snap.slot) ?? FALLBACK_HUE;
    const style = ` style="--m:${hue}"`;
    const cells = stepRow(columns, row);
    if (!row.parts.length) {
      return `<div class="step"${style}><div class="r">${cells}</div></div>`;
    }
    const id = `x${i}`;
    return `<div class="step chain"${style}>`
      + `<input class="tgl" type="checkbox" id="${id}">`
      + `<label class="r" for="${id}">${cells}</label>`
      + `<div class="parts">${partRows(columns, row.parts)}</div>`
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
function eventLog(log) {
  if (!log.length) return "";
  return `<div class="eventlog"><h2>Event log</h2>`
    + `<ol>${log.map((l) => `<li>${esc(l)}</li>`).join("")}</ol></div>`;
}

function header(state, report, totals, slotHue) {
  const { level, enemyLevel, res } = state.config;

  const chips = [
    `resonator lv<b>${level}</b>`,
    `enemy lv<b>${enemyLevel}</b>`,
    `<b>${res}%</b> res`,
    `<b>${report.rows.length}</b> actions`,
  ].map((c) => `<span class="chip">${c}</span>`).join("");

  const cards = [...totals].map(([name, total]) =>
    `<div class="card" style="--m:${slotHue.get(name)}">
      <span class="k">${esc(name)}</span>
      <span class="v">${fmt(total)}</span>
      <span class="sub">${Math.round((total / report.total) * 100)}% of the team</span>
    </div>`).join("");

  return `<header class="top">
  <div class="titlerow">
    <h1>${[...totals.keys()].map(esc).join(" → ")}</h1>
    <div class="chips">${chips}</div>
  </div>
  <div class="summary">
    ${cards}
    <div class="card grand">
      <span class="k">team total</span>
      <span class="v">${fmt(report.total)}</span>
      <span class="sub">average damage, one rotation each</span>
    </div>
  </div>
</header>`;
}

function page({ state, report }) {
  const totals = totalsBySlot(report);
  const slotHue = new Map([...totals.keys()].map((name) => [name, hueOf(name)]));

  return `${header(state, report, totals, slotHue)}
<main>
  ${rotationTable(report, slotHue)}
  ${eventLog(state.log)}
</main>`;
}

function errorPage(err) {
  const looksLikeFileUrl = location.protocol === "file:";
  const hint = looksLikeFileUrl
    ? `This page was opened straight off disk. Browsers refuse to load ES modules or
       <code>fetch()</code> data over <code>file://</code>, so it has to be served — run
       <code>python -m http.server 8000</code> in this directory and open
       <code>http://localhost:8000/</code>.`
    : `The engine threw while running the team. The stack below points at the file to look at.`;

  return `<div class="error">
  <h2>Could not run the team</h2>
  <p>${hint}</p>
  <pre>${esc(err?.stack || err)}</pre>
</div>`;
}

/* ------------------------------------------------------------- source panels */

/**
 * Show the panel listing every buff that fed a value, when its cell is hovered.
 *
 * The panel is `position: fixed` (see index.css for why it has to be), so the only thing left
 * is to give it coordinates: under its cell, right edges aligned, flipped above instead when
 * there is no room below and pulled back inside the window when there is none to the side.
 */
function wireSourcePanels(root) {
  const GAP = 4, EDGE = 6;
  let open = null;
  /** While pinned, hovering elsewhere leaves the panel alone; only a click outside closes it. */
  let pinned = false;

  const close = () => {
    if (open) {
      open.style.display = "";
      open.classList.remove("pinned");
    }
    open = null;
    pinned = false;
  };

  const place = (cell, pop) => {
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
  };

  const panelIn = (target) => {
    const cell = target?.closest?.(".c");
    return { cell, pop: cell?.querySelector(":scope > .pop") ?? null };
  };

  root.addEventListener("mouseover", (e) => {
    if (pinned) return;
    const { cell, pop } = panelIn(e.target);
    if (pop === open) return;
    close();
    if (pop) place(cell, pop);
  });

  // leaving the table entirely, and any scroll — a fixed panel does not follow its cell
  root.addEventListener("mouseout", (e) => {
    if (pinned) return;
    if (!e.relatedTarget || !root.contains(e.relatedTarget)) close();
  });

  /**
   * Click a cell to pin its panel open, so it can be read at leisure or its numbers selected.
   * Clicking the same cell again unpins; clicking anywhere outside the open panel closes it.
   *
   * Chain rows are `<label>`s wrapping a checkbox, so a click inside one would also toggle the
   * expander — `preventDefault` on a cell that owns a panel keeps pinning from doing both.
   */
  addEventListener("click", (e) => {
    // Clicks inside an open panel are for reading it, not for the row underneath — the panel
    // lives inside the chain row's <label>, so without this they would toggle the expander.
    if (open && open.contains(e.target)) { e.preventDefault(); return; }

    const { cell, pop } = panelIn(e.target);
    if (!pop || !root.contains(cell)) { close(); return; }

    e.preventDefault();
    if (pinned && pop === open) { close(); return; }

    if (pop !== open) { close(); place(cell, pop); }
    pinned = true;
    pop.classList.add("pinned");
  });

  addEventListener("scroll", close, true);
  addEventListener("resize", close);
}

/* ----------------------------------------------------------------------- mount */

const app = document.getElementById("app");

try {
  app.innerHTML = page(await runTeam());
  app.className = "";
  wireSourcePanels(app);
} catch (err) {
  console.error(err);
  app.innerHTML = errorPage(err);
  app.className = "";
}
