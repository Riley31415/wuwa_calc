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

/** One hue per slot, so a member's card, heading and total all read as the same thing. */
const ACCENTS = ["#5b9cff", "#a98bff", "#f0b444"];

/** How many leading columns stay put while the table scrolls sideways: `#` and `action`. */
const STICK = 2;

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

  return { state, report: buildReport(lines) };
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
const colWidth = (c) => `calc(var(--cw) * ${c.width} + var(--cpad))`;

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
const unit = (r) => ((r.percent ?? isPercent(r.stat)) ? "%" : "");

function popover(col, rows, total) {
  if (!rows?.length) return "";
  const body = rows.map((r) =>
    `<tr><td class="s">${esc(r.source)}</td><td class="k">${esc(statLabel(r.stat))}</td>`
    + `<td class="v">${fmt(r.value, 4)}${unit(r)}</td></tr>`).join("");
  return `<span class="pop"><h5>${esc(col.label)}</h5><table>${body}`
    + `<tr class="sum"><td colspan="2">total</td>`
    + `<td class="v">${fmt(total, col.digits ?? 0)}${col.percent ? "%" : ""}</td>`
    + `</tr></table></span>`;
}

/* --------------------------------------------------------------------- table */

function stepRow(columns, row) {
  return columns.map((col, i) => {
    const v = row.raw[col.key];
    const sources = row.sources[col.key];
    const cls = [];
    if (col.key === "action") cls.push("action");
    if (col.key === "field" && v === "--") cls.push("off");
    if (col.key === "avg") cls.push("avg");

    const text = esc(fmt(v, col.digits ?? 0));
    let html = sources ? `<span class="has">${text}</span>` : text;
    // a chain gets a caret, since its row is the thing you click to see the parts
    if (col.key === "action" && row.parts.length) html = `<span class="caret">▸</span>${html}`;
    html += popover(col, sources, v);

    return cell(columns, i, { cls, html });
  }).join("");
}

/** A chain's members, one row each: what it is, its own motion value and its own damage. */
function partRows(columns, parts) {
  return parts.map((p) => {
    const cells = columns.map((col, i) => {
      const cls = [];
      let html = "";
      if (col.key === "action") {
        cls.push("name");
        if (p.isShown) cls.push("best");
        html = `${esc(p.id)}<span class="tag">${esc(p.type)}</span>`;
      } else if (col.key === "mv") {
        html = fmt(p.mv, 2);
      } else if (col.key === "avg") {
        html = fmt(p.avg);
      }
      return cell(columns, i, { cls, html });
    }).join("");
    return `<div class="r">${cells}</div>`;
  }).join("");
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
  const cols = columns.map(colWidth).join(" ");

  const head = columns
    .map((c, i) => cell(columns, i, { html: esc(c.label) }))
    .join("");

  const steps = report.rows.map((row, i) => {
    const hue = slotHue.get(row.line.snap.slot) ?? ACCENTS[0];
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
    html: i === 1 ? "team total" : c.key === "avg" ? fmt(report.total) : "",
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
    `level <b>${level}</b>`,
    `enemy <b>${enemyLevel}</b>`,
    `<b>${res}%</b> res`,
    `<b>${report.rows.length}</b> steps`,
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
  // one hue per resonator, shared by their summary card and their rows in the table
  const slotHue = new Map([...totals.keys()]
    .map((name, i) => [name, ACCENTS[i % ACCENTS.length]]));

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

  const close = () => {
    if (open) open.style.display = "";
    open = null;
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

  root.addEventListener("mouseover", (e) => {
    const cell = e.target.closest?.(".c");
    const pop = cell?.querySelector(":scope > .pop");
    if (pop === open) return;
    close();
    if (pop) place(cell, pop);
  });

  // leaving the table entirely, and any scroll — a fixed panel does not follow its cell
  root.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget || !root.contains(e.relatedTarget)) close();
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
