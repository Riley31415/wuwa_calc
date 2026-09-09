/**
 * Hover panels: the markup every popover is built from (stat traces, action info, held buffs,
 * damage breakdowns, loadouts, the DPR table) and `wireSourcePanels`, which opens them.
 */
import { Stat, Attribute, Type1, Type2, scopedStat, isPercent, statLabel, TAG_NAME, NODE_NAME } from "../engine/stats.js";
import type { Gear } from "../engine/gear.js";
import { menuStats } from "../engine/context.js";
import { substatLines } from "../shared/substats.js";
import type { Action } from "../engine/rotation.js";
import { TUNE_BREAK_ENEMY } from "../shared/tunebreak.js";
import type { HeldBuff } from "../engine/state.js";
import type { ChainGroup, ResolvedSnapshot } from "../engine/evaluate.js";
import { fmt } from "../display.js";
import type { Column, TraceEntry, InfoEntry } from "../display.js";
import type { Member, Combo } from "../solver.js";
import type { TeamRun } from "../teamrun.js";
import { results, FALLBACK_HUE } from "./model.js";

export const esc = (s: unknown): string => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A panel parked as its cell's `data-pop` attribute — a string the parser scans but never builds;
 *  `wireSourcePanels` parses it on first hover. Single-quoted so the markup's own `"` stay raw. */
export const lazyPop = (html: string): string => (html
  ? ` data-pop='${html.replace(/&/g, "&amp;").replace(/'/g, "&#39;")}'` : "");

/** A panel not even *built* until first hover — `buildPop()` gets the kind and key then. */
export const deferredPop = (kind: string, key: string): string => ` data-pop-kind="${kind}" data-pop-key="${esc(key)}"`;

function buildPop(kind: string, key: string): string {
  if (kind === "dpr") {
    const run = results.get(key);
    return run ? `<span class="pop dpr">${dprTable(run)}</span>` : "";
  }
  return "";
}

/** How many viewport px one page px is: under a `zoom` on `html`, rects are viewport px while
 *  clientWidth/scrollTop/style px are page px. Measured, so a zoom put back needs no change here. */
export const zoom = (): number => {
  const w = document.body.clientWidth;
  return w ? document.body.getBoundingClientRect().width / w : 1;
};
/** `getBoundingClientRect()` in page px. */
export const rect = (el: Element): DOMRect => {
  const r = el.getBoundingClientRect(), z = zoom();
  return z === 1 ? r : new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z);
};

/** Open panels are parked in <body> and outlive the page they belong to. */
export const clearPops = (): void => { document.body.querySelectorAll(":scope > .pop").forEach((el) => el.remove()); };

const unit = (r: TraceEntry): string => ((r.percent ?? (r.stat !== undefined ? isPercent(r.stat) : false)) ? "%" : "");

const SECTION_ORDER = ["base", "bonus", "flat", "final"];
const SECTION_RANK = (key: string | null): number => {
  if (key === null) return -1;
  const word = key.split(" ")[0]!.toLowerCase();
  const i = SECTION_ORDER.indexOf(word);
  return i === -1 ? SECTION_ORDER.length + 1 : i;
};

export const panelRow = (r: TraceEntry, slotHue: Map<string, string>, { noSource = false }: { noSource?: boolean } = {}): string => {
  const own = r.owner !== undefined ? (slotHue.get(r.owner ?? "") ?? TUNE_BREAK_ENEMY.color) : null;
  const label = r.label ?? (r.stat !== undefined ? statLabel(r.stat) : "");
  const source = (r.count ?? 1) > 1 ? `${r.source} x${r.count}` : r.source;
  const value = `<td class="v">${r.mult ? `&times;${fmt(r.value, r.digits ?? 4)}` : `${fmt(r.value, r.digits ?? 4)}${unit(r)}`}</td>`;
  if (r.summary) return `<tr class="sum"><td class="k">${esc(label)}</td>${value}</tr>`;
  return noSource
    ? `<tr><td class="k">${esc(label)}</td>${value}</tr>`
    : `<tr><td class="s"${own ? ` style="--own:${own}"` : ""}>${esc(source || label)}</td>${value}</tr>`;
};

/** A stat column's panel: rows grouped by section, then the Total. An empty list is still a panel;
 *  only `undefined` (never traced) has none. */
export function popover(col: Column, rows: TraceEntry[] | undefined, total: number | string | null | undefined, slotHue: Map<string, string>, suffix = ""): string {
  if (!rows) return "";
  const noSource = col.key === "avg";
  const row = (r: TraceEntry) => panelRow(r, slotHue, { noSource });

  const before = rows.filter((r) => r.place === "beforeTotal");
  const after = rows.filter((r) => r.place === "afterTotal");
  const listed = rows.filter((r) => !r.place);

  const bySection = new Map<string | null, TraceEntry[]>();
  for (const r of listed) {
    const key = r.section ?? null;
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push(r);
  }
  const sections = [...bySection]
    .map(([key, group]) => ({ key, rows: group }))
    .sort((a, b) => SECTION_RANK(a.key) - SECTION_RANK(b.key));

  const body = sections.map(({ key, rows: group }) =>
    `<tr class="sec"><td colspan="2">${esc(key ?? col.full ?? col.label)}</td></tr>`
    + group.map(row).join("")).join("");
  const titled = sections.length ? body
    : `<tr class="sec"><td colspan="2">${esc(col.fullEmpty ?? col.full ?? col.label)}</td></tr>`;
  const sum = col.noTotal ? "" : `<tr class="sum"><td class="k">Total</td>`
    + `<td class="v">${fmt(total, col.digits ?? 0)}${col.percent ? "%" : ""}${esc(suffix)}</td></tr>`;
  return lazyPop(`<span class="pop stat${col.key === "avg" ? " damage" : ""}"><table>${titled}`
    + `${before.map(row).join("")}${sum}${after.map(row).join("")}</table></span>`);
}

export function infoPopover(info: InfoEntry[] | undefined, slotHue: Map<string, string>): string {
  if (!info?.length) return "";
  const rows = info.map((e) => {
    if (e.source !== undefined) {
      const hue = slotHue.get(e.source) ?? TUNE_BREAK_ENEMY.color;
      return `<tr><td class="s" colspan="2" style="--own:${hue}">${esc(e.label)}</td></tr>`;
    }
    return `<tr><td class="k">${esc(e.label)}</td><td class="v">${esc(e.value)}</td></tr>`;
  }).join("");
  return lazyPop(`<span class="pop info"><table>${rows}</table></span>`);
}

/** Kill switch for the Gear section of the buffs popover — code kept for a one-line flip back. */
const GEAR_SECTION_ENABLED = false;

/** The resonator-name hover in the action log: every buff held once the action resolved, in
 *  local/global/enemy columns, coloured by the kit that granted it (`State.sourceOf`). */
export function buffsPopover(member: string, gear: Gear[], local: HeldBuff[], global: HeldBuff[], enemy: HeldBuff[], slotHue: Map<string, string>): string {
  const showGear = GEAR_SECTION_ENABLED && gear.length > 0;
  if (!showGear && !local.length && !global.length && !enemy.length) {
    return lazyPop(`<span class="pop buffs"><table><tr class="sec"><td>No buffs</td></tr></table></span>`);
  }
  const order = [...slotHue.keys()];
  const rank = (b: HeldBuff) => { const i = order.indexOf(b.source); return i === -1 ? order.length : i; };
  const sorted = (buffs: HeldBuff[]) => [...buffs]
    .sort((a, b) => rank(a) - rank(b) || a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
  const row = (name: string, hue: string) => `<tr><td class="s" style="--own:${hue}">${esc(name)}</td></tr>`;
  const own = slotHue.get(member) ?? FALLBACK_HUE;
  const gearSection = showGear
    ? `<tr class="sec"><td>Gear</td></tr>` + gear.map((g) => row(g.name, own)).join("")
    : "";
  const section = (heading: string, buffs: HeldBuff[]) => (buffs.length
    ? `<tr class="sec"><td>${esc(heading)}</td></tr>`
      + sorted(buffs).map((b) => row(b.name, slotHue.get(b.source) ?? TUNE_BREAK_ENEMY.color)).join("")
    : "");
  const columns = [
    gearSection + section("Local buffs", local),
    section("Global buffs", global),
    section("Enemy debuffs", enemy),
  ].filter(Boolean).map((rows) => `<table>${rows}</table>`).join("");
  return lazyPop(`<span class="pop buffs"><div class="cols">${columns}</div></span>`);
}

/* ------------------------------------------------------------------------ damage breakdown */

/** Every real hit on `slot`: a folded row is walked through its members (its own snapshot is only
 *  the last cast), spill follow-ups are lines of their own, an `aggregate` summary is skipped. */
function eachHit(lines: ChainGroup[], slot: string, fn: (snap: ResolvedSnapshot, avg: number) => void): void {
  for (const line of lines) {
    if (line.aggregate) continue;
    if (!line.isChain) { if (line.snap.slot === slot) fn(line.snap, line.avg); continue; }
    const members = new Set(line.members ?? []);
    for (const p of line.parts) if (members.has(p.snap) && p.snap.slot === slot) fn(p.snap, p.dmg.avg);
  }
}

function sumByTag(lines: ChainGroup[], slot: string, keyOf: (a: Action) => number | null): Map<number, number> {
  const by = new Map<number, number>();
  eachHit(lines, slot, (snap, avg) => {
    const key = keyOf(snap.action);
    if (key != null) by.set(key, (by.get(key) ?? 0) + avg);
  });
  return by;
}

function breakdownSection(heading: string, by: Map<number, number>, total: number, label: (k: number) => string): string {
  if (!by.size) return "";
  const rows = [...by].sort((a, b) => b[1] - a[1]);
  const body = rows.map(([k, v]) => {
    const pct = total ? Math.round((v / total) * 100) : 0;
    return `<tr><td class="k">${esc(label(k))}</td><td class="v">${fmt(v)} <span class="pct">(${pct}%)</span></td></tr>`;
  }).join("");
  return `<tr class="sec"><td colspan="2">${esc(heading)}</td></tr>${body}`;
}

/** The seven action names that contributed most, with cast counts. */
function actionSection(lines: ChainGroup[], slot: string, total: number): string {
  const by = new Map<string, { dmg: number; n: number }>();
  eachHit(lines, slot, (snap, avg) => {
    const cur = by.get(snap.action.name) ?? { dmg: 0, n: 0 };
    cur.dmg += avg; cur.n++;
    by.set(snap.action.name, cur);
  });
  if (!by.size) return "";
  const rows = [...by].sort((a, b) => b[1].dmg - a[1].dmg).slice(0, 7).map(([name, v]) => {
    const pct = total ? Math.round((v.dmg / total) * 100) : 0;
    return `<tr><td class="k">${esc(name)} x${v.n}</td>`
      + `<td class="v">${fmt(v.dmg)} <span class="pct">(${pct}%)</span></td></tr>`;
  }).join("");
  return `<tr class="sec"><td colspan="2">Actions</td></tr>${rows}`;
}

function damagePopover(lines: ChainGroup[], slot: string, total: number, grandTotal: number): string {
  const tagName = (k: number) => TAG_NAME[k as keyof typeof TAG_NAME];
  const body = breakdownSection("Node", sumByTag(lines, slot, (a) => a.node), total, (k) => NODE_NAME[k as keyof typeof NODE_NAME])
    + breakdownSection("Type 1", sumByTag(lines, slot, (a) => a.type1), total, tagName)
    + breakdownSection("Type 2", sumByTag(lines, slot, (a) => a.type2), total, tagName);
  const pct = grandTotal ? Math.round((total / grandTotal) * 100) : 0;
  return lazyPop(`<span class="pop breakdown"><table>${body}`
    + `<tr class="sum"><td class="k">Total</td><td class="v">${fmt(total)} <span class="pct">(${pct}% of team)</span></td></tr>`
    + `</table><table class="acts">${actionSection(lines, slot, total)}</table></span>`);
}

/* ---------------------------------------------------------------------------------- loadout */

/** A member's equipped gear for one combo, labelled by slot — inherents, weapon, mainslot, sets,
 *  mainstat, substats. Matrix is left out: it is a table-wide box, not a build pick. */
export function equippedGear(member: Member, combo: Combo): [string, Gear][] {
  const l = member.loadout;
  const r = l.resonator;
  return [...(r.inherent1 ? [["Inherent", r.inherent1] as [string, Gear]] : []),
    ...(r.inherent2 ? [["Inherent", r.inherent2] as [string, Gear]] : []),
    ["Weapon", combo.weapon], ["Mainslot", combo.echo.mainslot],
    ...combo.echo.sets.map((g, i): [string, Gear] => [i === 0 ? "Sonata" : "", g]),
    ["Mainstats", combo.mainstat], ["Substats", combo.highSubs ? l.highSubstat : l.substat]];
}

/** The loadout hover's rows: mode, gear (inherents dropped — fixed per resonator), held chain nodes. */
function gearRows(member: Member, combo: Combo): string {
  const core = equippedGear(member, combo).slice(2);
  const mode = member.loadout.mode;
  return (mode ? `<tr class="gear"><td class="k">Mode</td><td class="v">${esc(mode.name)}</td></tr>` : "")
    + core
      .map(([label, g]) => `<tr class="gear"><td class="k">${esc(label)}</td><td class="v">${esc(g.name)}</td></tr>`)
      .join("")
    + (member.loadout.sequences.length
      ? `<tr class="gear"><td class="k">Sequences</td><td class="v">${combo.sequence ? Array.from({ length: combo.sequence }, (_, i) => `S${i + 1}`).join(", ") : "S0"}</td></tr>`
      : "");
}

/** Dmg Bonus scope buckets for the menu stats — each keeps only its biggest line. */
const ATTRIBUTE_SCOPES = [
  Attribute.Aero, Attribute.Electro, Attribute.Fusion, Attribute.Glacio,
  Attribute.Spectro, Attribute.Havoc, Attribute.Physical,
];
const CORE_TYPE1_SCOPES = [Type1.Basic, Type1.Heavy, Type1.Skill, Type1.Liberation];
const OTHER_SCOPES = [
  Type1.Intro, Type1.Outro, Type1.Echo, Type1.Status, Type1.Break, Type1.Rupture,
  Type1.Hack, Type1.Utility,
  Type2.Coordinated, Type2.SpectroFrazzle, Type2.AeroErosion, Type2.FusionBurst,
  Type2.GlacioChafe, Type2.ElectroFlare,
];

/** The build's constant stats as the game's character screen shows them (`menuStats()`), zeros dropped. */
function menuStatRows(member: Member, combo: Combo): { label: string; value: string }[] {
  const l = member.loadout;
  const entries = menuStats(l.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs));
  const totals = new Map<number, number>();
  for (const e of entries) totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.value);
  const get = (key: number) => totals.get(key) ?? 0;
  const fold = (base: Stat, bonus: Stat, flat: Stat) => get(base) * (1 + get(bonus) / 100) + get(flat);

  const rows: { label: string; value: string }[] = [];
  const push = (label: string, value: number, percent: boolean) => {
    if (!value) return;
    rows.push({ label, value: `${fmt(value, percent ? 1 : 0, percent)}${percent ? "%" : ""}` });
  };
  const pushBest = (scopes: (Attribute | Type1 | Type2)[]) => {
    let bestTag: Attribute | Type1 | Type2 | null = null, bestValue = 0;
    for (const tag of scopes) {
      const v = get(scopedStat(tag, Stat.DmgBonus));
      if (v > bestValue) { bestValue = v; bestTag = tag; }
    }
    if (bestTag !== null) push(statLabel(scopedStat(bestTag, Stat.DmgBonus)), bestValue, true);
  };

  push("HP", fold(Stat.BaseHp, Stat.BonusHp, Stat.FlatHp), false);
  push("ATK", fold(Stat.BaseAtk, Stat.BonusAtk, Stat.FlatAtk), false);
  push("DEF", fold(Stat.BaseDef, Stat.BonusDef, Stat.FlatDef), false);
  push(statLabel(Stat.Er), get(Stat.Er), true);
  push(statLabel(Stat.CritRate), get(Stat.CritRate), true);
  push(statLabel(Stat.CritDmg), get(Stat.CritDmg), true);
  // Tune Break Boost is a count of points, not a percentage
  push(statLabel(Stat.Tbb), get(Stat.Tbb), false);
  pushBest(ATTRIBUTE_SCOPES);
  pushBest(CORE_TYPE1_SCOPES);
  pushBest(OTHER_SCOPES);
  return rows;
}

export const subsLabel = (combo: Combo): string => (combo.highSubs ? "High Invest" : "ChemX32");

/** The loadout hover: gear and menu stats in one column, the substat rolls beside them. */
export function gearPopover(member: Member, combo: Combo): string {
  const stats = menuStatRows(member, combo)
    .map((r) => `<tr class="stat"><td class="k">${esc(r.label)}</td><td class="v">${esc(r.value)}</td></tr>`)
    .join("");
  const lines = substatLines(combo.highSubs ? member.loadout.highSubstat : member.loadout.substat);
  const rolls = lines.map((l) => `<tr class="stat${l.rolls === 1 ? " one" : ""}"><td class="k">${esc(l.text)}</td><td class="v n">${l.rolls}</td></tr>`).join("")
    + `<tr class="sum"><td class="k">Total</td><td class="v n">${lines.reduce((n, l) => n + l.rolls, 0)}</td></tr>`;
  return lazyPop(`<span class="pop gear"><div class="cols">`
    + `<table><tr class="sec"><td colspan="2">Loadout</td></tr>${gearRows(member, combo)}`
    + `<tr class="sec"><td colspan="2">Menu Stats</td></tr>${stats}</table>`
    + `<table><tr class="sec"><td colspan="2">Substats</td></tr>${rolls}</table>`
    + `</div></span>`);
}

/* -------------------------------------------------------------------------------- DPR table */

/** Damage per rotation: a row per member, Tune Break and Total, over the four sections the run
 *  keeps. With `lines` (the detail page) each cell hovers its breakdown and each name its loadout;
 *  the comparison table's Total DPR hover passes none (no hover inside a hover). */
export function dprTable(run: TeamRun, lines?: ChainGroup[][]): string {
  const grand = run.sectionTotals.reduce((a, b) => a + b, 0);
  const flat = lines?.flat();

  const head = `<div class="rtrow rthead">`
    + `<div class="c"></div>`
    + `<div class="c num">Opener</div><div class="c num">Loop 1</div>`
    + `<div class="c num">Loop 2</div><div class="c num">Loop 3</div>`
    + `<div class="c num">Total</div>`
    + `</div>`;

  const valueCell = (sec: ChainGroup[] | undefined, slot: string, value: number, total: number): string =>
    (sec
      ? `<div class="c num has"${damagePopover(sec, slot, value, total)}>${fmt(value)}</div>`
      : `<div class="c num">${fmt(value)}</div>`);

  const dataRow = (slot: string, color: string, hover: string): string => {
    const own = run.sectionBySlot.reduce((a, by) => a + (by.get(slot) ?? 0), 0);
    return `<div class="rtrow">`
      + `<div class="c name${hover ? " has" : ""}"${hover} style="--mem:${color}">${esc(slot)}</div>`
      + run.sectionBySlot.map((by, i) => valueCell(lines?.[i], slot, by.get(slot) ?? 0, run.sectionTotals[i]!)).join("")
      + valueCell(flat, slot, own, grand)
      + `</div>`;
  };

  const memberRows = run.members
    .map((m, i) => dataRow(m.name, m.color, lines ? gearPopover(m, run.combo[i]!) : ""))
    .join("");
  const tuneBreakRow = dataRow(TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color, "");
  const plainCell = (value: number): string => `<div class="c num">${fmt(value)}</div>`;
  const totalRow = `<div class="rtrow total">`
    + `<div class="c name">Total</div>`
    + run.sectionTotals.map((v) => plainCell(v)).join("")
    + plainCell(grand)
    + `</div>`;

  return `<div class="rtable dpr">${head}${memberRows}${tuneBreakRow}${totalRow}</div>`;
}

/* ----------------------------------------------------------------------------- wiring */

/**
 * Open a cell's panel on hover. A closed panel is detached and kept in `built` (only the open one
 * is ever in the document — hundreds of parked panels were re-styled on every pass). Action names
 * and the Team Avg DPR cell open on click instead; the DPR one stays pinned until a click elsewhere.
 */
export function wireSourcePanels(root: HTMLElement): void {
  const GAP = 4, EDGE = 6;
  let open: HTMLElement | null = null;
  let openHome: Element | null = null;
  let pinned = false;

  clearPops();
  const built = new WeakMap<Element, HTMLElement>();

  const close = (): void => {
    open?.remove();
    open = null;
    openHome = null;
    pinned = false;
  };

  const place = (cell: Element, pop: HTMLElement): void => {
    if (pop.parentElement !== document.body) document.body.appendChild(pop);
    pop.style.visibility = "hidden";
    pop.style.display = "block";
    const c = rect(cell);
    const p = rect(pop);
    const winW = innerWidth / zoom(), winH = innerHeight / zoom();
    // comparison table: off the cell's left edge, viewport-bounded. Detail page: numeric columns
    // hang off the right edge, text columns the left, clamped to the table's own left edge.
    const onTable = !!cell.closest(".tcwrap");
    const natural = !onTable && cell.classList.contains("num") ? c.right - p.width : c.left;
    const wrap = onTable ? null : cell.closest(".gridwrap");
    const tableLeft = wrap ? rect(wrap).left : EDGE;
    const minLeft = Math.max(EDGE, tableLeft);
    const left = Math.max(minLeft, Math.min(natural, winW - p.width - EDGE));
    const above = c.top - p.height - GAP;
    const below = c.bottom + GAP;
    const fitsBelow = below + p.height <= winH - EDGE;
    const top = fitsBelow ? below : Math.max(EDGE, above);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.visibility = "";
    open = pop;
    openHome = cell;
  };

  const panelIn = (target: EventTarget | null): { cell: Element | null; pop: HTMLElement | null } => {
    const cell = (target as Element | null)?.closest?.(".c") ?? null;
    if (!cell) return { cell: null, pop: null };
    if (open && openHome === cell) return { cell, pop: open };
    const kept = built.get(cell);
    if (kept) return { cell, pop: kept };
    const data = (cell as HTMLElement).dataset;
    const markup = data?.pop ?? (data?.popKind ? buildPop(data.popKind, data.popKey ?? "") : undefined);
    if (!markup) return { cell, pop: null };
    const box = document.createElement("div");
    box.innerHTML = markup;
    cell.removeAttribute("data-pop");
    const pop = box.firstElementChild as HTMLElement | null;
    if (pop) built.set(cell, pop);
    return { cell, pop };
  };

  const isAction = (cell: Element): boolean => (!!cell.closest(".grid")
    && (cell.classList.contains("action") || cell.classList.contains("name")))
    || cell.classList.contains("teamdpr");

  document.addEventListener("mouseover", (e) => {
    if (pinned) return;
    if (open && open.contains(e.target as Node)) return;
    const hovered = (e.target as Element | null)?.closest?.(".c") ?? null;
    if (hovered && isAction(hovered)) { if (openHome !== hovered) close(); return; }
    const { cell, pop } = panelIn(e.target);
    if (pop === open) return;
    close();
    if (pop) place(cell!, pop);
  });

  document.addEventListener("mouseout", (e) => {
    if (pinned) return;
    const to = e.relatedTarget as Node | null;
    if (to && (root.contains(to) || (open && open.contains(to)))) return;
    close();
  });

  addEventListener("click", (e) => {
    if (pinned) {
      if (open?.contains(e.target as Node)) return;
      const onHome = !!openHome?.contains(e.target as Node);
      close();
      if (onHome) return;
    }
    const { cell, pop } = panelIn(e.target);
    if (!cell) return;
    const onCaret = !!(e.target as Element | null)?.closest?.(".caret");
    // a group's name has no panel, so its click falls through to the row's label and expands it
    if (isAction(cell) && !onCaret && pop) {
      e.preventDefault();
      const same = openHome === cell;
      close();
      if (!same) { place(cell, pop); pinned = cell.classList.contains("teamdpr"); }
      return;
    }
    if (cell.querySelector(":scope > .caret")) close();
  });

  addEventListener("scroll", close, true);
  addEventListener("resize", close);
}
