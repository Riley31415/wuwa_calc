/**
 * The whole website, restored to the old rich comparison-table UI (see git history at
 * `40ee581:index.ts` for the original, ~30-team version this is rebuilt from) but wired to the
 * new engine and scoped to the two ported teams: Qiuyuan/Cantarella/Phrolova, and the shield
 * team Shorekeeper/Iuno/Jingran.
 *
 * display.ts is unmodified — kit.ts now exports `ResolvedSnapshot`/`StatEntry`/`ChainGroup` so
 * `buildReport()` compiles and runs against this engine exactly as it did the old one (see
 * kit.ts's own header on those types and on `addStat()`'s automatic source/owner tagging).
 *
 * Two things the old page had that this one doesn't, because the new engine doesn't track them
 * yet: a resource/counter system (Energy, Concerto, Off-tune, the forte gauges all read 0 here,
 * so `buildReport()`'s own "drop an all-zero column" rule hides them), and a buff event log
 * (`state.log` doesn't exist on the new `State`, so the detail page has no Event Log section).
 * There's also no weapon optimizer — each member runs their own file's hardcoded loadout, not
 * whichever weapon scores highest.
 */
import { State, run, withTeam, equip, Resonator, Gear, Action } from "./src/kit.js";
import type { ChainGroup, HeldBuff, ResolvedSnapshot } from "./src/kit.js";
import { damage, mvPercent, effectiveDef, effectiveRes, damageFactors } from "./src/damage.js";
import { buildReport, totalsBySlot, explain } from "./src/display.js";
import type { Report, Column, ReportRow, ReportPart, TraceEntry, InfoEntry } from "./src/display.js";
import { isPercent, statLabel } from "./src/stats.js";

import { QIUYUAN, QY_LOADOUT, QY_ROTATION } from "./src/resonators/qiuyuan.js";
import { CANTARELLA, CA_LOADOUT, CA_ROTATION } from "./src/resonators/cantarella.js";
import { PHROLOVA, PH_LOADOUT, PH_OPENER, PH_LOOP } from "./src/resonators/phrolova.js";
import { SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP } from "./src/resonators/shorekeeper.js";
import { IUNO, IO_LOADOUT, IO_ROTATION } from "./src/resonators/iuno.js";
import { JINGRAN, JR_LOADOUT, JR_ROTATION } from "./src/resonators/jingran.js";
import { ZHEZHI, ZZ_LOADOUT, ZZ_ROTATION } from "./src/resonators/zhezhi.js";
import { CARLOTTA, CL_LOADOUT, CL_ROTATION } from "./src/resonators/carlotta.js";

/* ------------------------------------------------------------------------------------ teams */

interface Member {
  name: string;
  color: string;
  loadout: Gear[];
  opener: Action[];
  loop: Action[];
}

/** name/color both come straight off the resonator's own field — nothing here retypes them. */
const member = (resonator: Resonator, loadout: Gear[], opener: Action[], loop: Action[]): Member =>
  ({ name: resonator.name, color: resonator.color, loadout, opener, loop });

/** Only the two ported teams — the old page's team switcher compared ~30 of these; with two,
 *  the landing page is a short ranking rather than the full catalog. */
const TEAMS: Record<string, Member[]> = {
  froloQyCanta: [
    member(PHROLOVA, PH_LOADOUT, PH_OPENER, PH_LOOP),
    member(QIUYUAN, QY_LOADOUT, QY_ROTATION, QY_ROTATION),
    member(CANTARELLA, CA_LOADOUT, CA_ROTATION, CA_ROTATION),
  ],
  skIunoJingran: [
    member(SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP),
    member(IUNO, IO_LOADOUT, IO_ROTATION, IO_ROTATION),
    member(JINGRAN, JR_LOADOUT, JR_ROTATION, JR_ROTATION),
  ],
  skZzCarlotta: [
    member(SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP),
    member(ZHEZHI, ZZ_LOADOUT, ZZ_ROTATION, ZZ_ROTATION),
    member(CARLOTTA, CL_LOADOUT, CL_ROTATION, CL_ROTATION),
  ],
};

const MISC = "Misc";
const MISC_HUE = "#8a94a3";
const FALLBACK_HUE = "#5b9cff";

/** Kill switch for the resonator popover's "Gear" section — off for now, kept as a single flag
 *  rather than ripping the section's own code out, so turning it back on later is a one-line
 *  flip (see `buffsPopover`'s own use of this). */
const GEAR_SECTION_ENABLED = false;

/** How many leading columns stay put while the table scrolls sideways: `member` and `action`. */
const STICK = 2;

/* ------------------------------------------------------------------ the engine */

interface TeamRun {
  state: State;
  report: Report;
  openerReport: Report;
  loopReport: Report;
  /** The loop's own evaluated lines — what the comparison table's own damage-breakdown popovers
   *  read (grouped by tag rather than laid out as report columns). */
  loopLines: ChainGroup[];
  members: Member[];
  total: number;
  bySlot: Map<string, number>;
}

const toLine = (snap: ResolvedSnapshot): ChainGroup =>
  ({ id: snap.action.id, isChain: false, parts: [], snap, mv: mvPercent(snap), avg: damage(snap).avg });

function runTeam(members: Member[]): TeamRun {
  const state = new State(members.map((m) => m.name));
  members.forEach((m, i) => {
    state.active = i;
    withTeam(state, () => { for (const g of m.loadout) equip(g, 1); });
  });
  state.active = 0;

  // Every member's opener runs first, in team order, then every member's loop — matching how a
  // real run actually goes: the whole team gets set up before anyone starts repeating.
  const runPart = (rotation: Action[]): ChainGroup[] =>
    rotation.length ? run(state, rotation).map(toLine) : [];
  const openerLines = members.flatMap((m) => runPart(m.opener));
  const loopLines = members.flatMap((m) => runPart(m.loop));

  const openerReport = buildReport(openerLines);
  const loopReport = buildReport(loopLines);

  return {
    state,
    report: buildReport([...openerLines, ...loopLines]),
    openerReport, loopReport, loopLines, members,
    // the comparison row and its hover breakdown both read the loop — the steady-state figure
    // every build in this project is judged by, same convention src/test_team.ts uses
    total: loopReport.total,
    bySlot: totalsBySlot(loopReport),
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
  const base = `var(--cw) * ${c.width} + var(--cpad)`;
  return i === 0 ? `calc(${base} + var(--lead))` : `calc(${base})`;
};

function cell(columns: Column[], index: number, { cls = [], html = "", style = "" }: { cls?: string[]; html?: string; style?: string }): string {
  const col = columns[index]!;
  const stick = index < STICK;
  const before = columns.slice(0, index);
  // one per-character metric for every column (see index.css's own --cw), so this offset is
  // computed exactly the way the grid tracks colWidth() emits are
  const span = before.reduce((n, c) => n + (c.width ?? 0), 0);
  const left = `calc(var(--cw) * ${span}`
    + ` + var(--cpad) * ${before.length}`
    + `${before.length ? " + var(--lead)" : ""})`;
  const classes = [
    "c",
    col.align === "left" ? "" : "num",
    ...cls,
    stick ? "stick" : "",
  ].filter(Boolean).join(" ");
  const styleAttr = [stick ? `left:${left}` : "", style].filter(Boolean).join(";");
  return `<span class="${classes}"${styleAttr ? ` style="${styleAttr}"` : ""}>${html}</span>`;
}

/** Every source that fed one value, revealed on hover. */
const unit = (r: TraceEntry): string => ((r.percent ?? (r.stat ? isPercent(r.stat) : false)) ? "%" : "");

const SCALING_LABEL: Record<string, string> = { atk: "ATK", hp: "HP", def: "DEF", dot: "Dot", tune: "Tune" };

const SECTION_ORDER = ["base", "bonus", "flat"];
const SECTION_RANK = (key: string | null): number => {
  if (key === null) return -1;
  const word = key.split(" ")[0]!.toLowerCase();
  const i = SECTION_ORDER.indexOf(word);
  return i === -1 ? SECTION_ORDER.length + 1 : i;
};

const panelRow = (r: TraceEntry, slotHue: Map<string, string>, { noSource = false }: { noSource?: boolean } = {}): string => {
  const own = r.owner !== undefined ? (slotHue.get(r.owner ?? "") ?? MISC_HUE) : null;
  return `<tr>${noSource ? "" : `<td class="s"${own ? ` style="--own:${own}"` : ""}>${esc(r.source)}</td>`}`
  + `<td class="k">${esc(r.label ?? (r.stat ? statLabel(r.stat) : ""))}</td>`
  + `<td class="v">${r.mult ? `&times;${fmt(r.value, r.digits ?? 4)}` : `${fmt(r.value, r.digits ?? 4)}${unit(r)}`}</td>`
  + `</tr>`;
};

function popover(col: Column, rows: TraceEntry[] | undefined, total: number | string | null | undefined, slotHue: Map<string, string>, suffix = ""): string {
  if (!rows?.length) return "";
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

  const body = sections.map(({ key, rows: group }) => {
    const head = key ? `<tr class="sec"><td colspan="3">${esc(key)}</td></tr>` : "";
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

function infoPopover(info: InfoEntry[] | undefined): string {
  if (!info?.length) return "";
  const rows = info.map((e) => `<tr><td class="k">${esc(e.label)}</td><td class="v">${esc(e.value)}</td></tr>`).join("");
  return `<span class="pop info"><table>${rows}</table></span>`;
}

/** The hover on a resonator's own name, in the rotation table: every buff actually held once
 *  this action resolved — local (this member's own), global (team-wide), and enemy (debuffs on
 *  the target) kept in their own sections, since that's a real distinction (kit.ts's own
 *  `heldLocal`/`heldGlobal`/`heldEnemy`), not just a formatting choice. Buffs only: equipped gear
 *  is filtered out engine-side (see kit.ts's own `TeamMember.equipped`) and named by the loadout
 *  popover instead.
 *
 *  Sorted and coloured by source — whose kit each buff came from, tracked by the engine as it's
 *  granted (`State.sourceOf`) rather than guessed from the buff's own name, so a buff one kit
 *  puts up on another member (or on the enemy) still groups under the kit that granted it. Team
 *  order first (the order `slotHue` lists them, which is the order they act), then alphabetical
 *  within a source.
 *
 *  Gear gets its own section above all three — equipped gear has no "source" the way a buff does
 *  (it isn't granted by anything, it's just worn), so every row there is coloured this member's
 *  own hue rather than looked up per row. */
function buffsPopover(member: string, gear: Gear[], local: HeldBuff[], global: HeldBuff[], enemy: HeldBuff[], slotHue: Map<string, string>): string {
  // Gear section disabled for now (its own code below kept, not deleted) — flip GEAR_SECTION_ENABLED
  // back on when it's ready to ship again.
  const showGear = GEAR_SECTION_ENABLED && gear.length > 0;
  if (!showGear && !local.length && !global.length && !enemy.length) return "";
  const order = [...slotHue.keys()];
  const rank = (b: HeldBuff) => { const i = order.indexOf(b.source); return i === -1 ? order.length : i; };
  const sorted = (buffs: HeldBuff[]) => [...buffs]
    .sort((a, b) => rank(a) - rank(b) || a.source.localeCompare(b.source) || a.name.localeCompare(b.name));

  // the name goes in the `.s` cell — the same left-aligned, full-strength, colour-barred column
  // every stat panel puts its own source in, rather than the right-aligned `.v` value column
  const row = (name: string, hue: string) => `<tr><td class="s" style="--own:${hue}">${esc(name)}</td></tr>`;
  const own = slotHue.get(member) ?? FALLBACK_HUE;
  const gearSection = showGear
    ? `<tr class="sec"><td>Gear</td></tr>` + gear.map((g) => row(g.name, own)).join("")
    : "";
  const section = (heading: string, buffs: HeldBuff[]) => (buffs.length
    ? `<tr class="sec"><td>${esc(heading)}</td></tr>`
      + sorted(buffs).map((b) => row(b.name, slotHue.get(b.source) ?? MISC_HUE)).join("")
    : "");
  return `<span class="pop buffs"><table>`
    + `${gearSection}${section("Local buffs", local)}${section("Global buffs", global)}${section("Enemy debuffs", enemy)}</table></span>`;
}

/* -------------------------------------------------------------- comparison table */

/** Sum one slot's own loop damage, grouped by whatever tag `keyOf` reads off each hit's own
 *  action. Every line here is a single action (this engine has no chain concept — see kit.ts's
 *  own `ChainGroup`), so it reads `line.snap` directly rather than iterating `parts`. */
function sumByTag(lines: ChainGroup[], slot: string, keyOf: (a: Action) => string | null): Map<string, number> {
  const by = new Map<string, number>();
  for (const line of lines) {
    const snap = line.snap;
    if (snap.slot !== slot) continue;
    const key = keyOf(snap.action);
    if (key == null) continue;
    by.set(key, (by.get(key) ?? 0) + line.avg);
  }
  return by;
}

function breakdownSection(heading: string, by: Map<string, number>, total: number): string {
  if (!by.size) return "";
  const rows = [...by].sort((a, b) => b[1] - a[1]);
  const label = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
  const body = rows.map(([k, v]) => {
    const pct = total ? Math.round((v / total) * 100) : 0;
    return `<tr><td class="k">${esc(label(k))}</td><td class="v">${fmt(v)} <span class="pct">(${pct}%)</span></td></tr>`;
  }).join("");
  return `<tr class="sec"><td colspan="2">${esc(heading)}</td></tr>${body}`;
}

function damagePopover(lines: ChainGroup[], slot: string, total: number, grandTotal: number): string {
  const body = breakdownSection("Node", sumByTag(lines, slot, (a) => a.node), total)
    + breakdownSection("Type", sumByTag(lines, slot, (a) => a.type), total)
    + breakdownSection("Type 2", sumByTag(lines, slot, (a) => a.type2), total);
  const pct = grandTotal ? Math.round((total / grandTotal) * 100) : 0;
  return `<span class="pop breakdown"><table>${body}`
    + `<tr class="sum"><td class="k">Total</td><td class="v">${fmt(total)} <span class="pct">(${pct}% of team)</span></td></tr>`
    + `</table></span>`;
}

/** A member's own equipped gear: weapon, mainslot echo, sonata pieces, mainstat/substat rolls —
 *  everything but the resonator itself and its talents buff, which aren't "equipped gear" in the
 *  sense either popover below is showing. Shared so the comparison table's own gear popover and
 *  the rotation table's resonator popover (its own "Gear" section) read off the same list. */
function equippedGear(member: Member): Gear[] {
  return member.loadout.filter((g) => !(g instanceof Resonator) && g.name !== `${member.name}: Talents`);
}

// every loadout array is built in this exact order (see any resonator file's own LOADOUT
// export) — equippedGear() strips the leading Resonator/Talents pair, leaving these six in
// the order they were declared, so a plain positional label is all this needs
const GEAR_LABELS = ["Weapon", "Mainslot", "Sonata", "2pc", "Mainstats", "Substats"];

/** The hover on a member's own name, in the comparison table: every piece of gear their loadout
 *  equips, each labelled by slot. `.k`/`.v` reused wholesale from the stat-trace panels (see
 *  index.css's own note by `.pop.gear`) — the label column's gray already matches those, and the
 *  browser's own table layout sizes both columns to their own longest cell with no extra CSS. */
function gearPopover(member: Member): string {
  const body = equippedGear(member)
    .map((g, i) => `<tr><td class="k">${esc(GEAR_LABELS[i] ?? "")}</td><td class="v">${esc(g.name)}</td></tr>`)
    .join("");
  return `<span class="pop gear"><table>${body}</table></span>`;
}

/** The two filter dropdowns above the comparison table. With one team and no sequence system
 *  (this project never implements S1-S6 — every build is sequence 0), the sequence filter is
 *  kept for visual parity with the old page but is always a no-op: every row is S0. */
function comparisonFilters(results: Map<string, TeamRun>): string {
  const names = new Set<string>();
  for (const run of results.values()) for (const m of run.members) names.add(m.name);
  const resonatorOptions = [`<option value="">All resonators</option>`]
    .concat([...names].sort().map((n) => `<option value="${esc(n)}">${esc(n)}</option>`)).join("");
  const seqOptions = [0, 1, 2, 3, 4, 5, 6]
    .map((n) => `<option value="${n}"${n === 0 ? " selected" : ""}>S${n}</option>`).join("");

  return `<div class="tcfilters">
    <label>Resonator <select id="resonatorFilter">${resonatorOptions}</select></label>
    <label>Max sequence <select id="seqFilter">${seqOptions}</select></label>
  </div>`;
}

function comparisonTable(results: Map<string, TeamRun>): string {
  const sorted = [...results].sort((a, b) => b[1].total - a[1].total);
  const rows = sorted.map(([key, run]) => {
    const grand = run.total;
    const memberNames = run.members.map((m) => m.name).join("|");

    const memberCell = (m: Member) =>
      `<div class="c name" style="--mem:${m.color};color:${m.color}">${esc(m.name)}${gearPopover(m)}</div>`;
    const dmgCell = (slot: string) => {
      const total = run.bySlot.get(slot) ?? 0;
      return `<div class="c num has">${fmt(total)}${damagePopover(run.loopLines, slot, total, grand)}</div>`;
    };

    return `<div class="trow" data-team="${esc(key)}" data-members="${esc(memberNames)}" data-maxseq="0">`
      + run.members.map(memberCell).join("")
      + run.members.map((m) => dmgCell(m.name)).join("")
      + dmgCell(MISC)
      + `<div class="c num total gotodetail" data-team="${esc(key)}">${fmt(grand)}<span class="arrow">›</span></div>`
      + `</div>`;
  }).join("");

  const head = `<div class="trow thead">`
    + `<div class="c">Member 1</div><div class="c">Member 2</div><div class="c">Member 3</div>`
    + `<div class="c num">Dmg 1</div><div class="c num">Dmg 2</div><div class="c num">Dmg 3</div>`
    + `<div class="c num">Misc</div><div class="c num">Total (loop)</div>`
    + `</div>`;

  return `<main>${comparisonFilters(results)}<div class="tcwrap"><div class="tgrid">${head}${rows}</div></div></main>`;
}

function applyFilters(): void {
  const resonatorSel = document.getElementById("resonatorFilter") as HTMLSelectElement | null;
  const seqSel = document.getElementById("seqFilter") as HTMLSelectElement | null;
  if (!resonatorSel || !seqSel) return;
  const resonator = resonatorSel.value;
  const maxSeq = Number(seqSel.value);
  for (const row of document.querySelectorAll<HTMLElement>(".trow:not(.thead)")) {
    const members = (row.dataset.members ?? "").split("|");
    const rowMaxSeq = Number(row.dataset.maxseq ?? "0");
    row.hidden = (resonator !== "" && !members.includes(resonator)) || rowMaxSeq > maxSeq;
  }
}

/* --------------------------------------------------------------------- table */

function stepRow(
  columns: Column[], row: ReportRow | ReportPart, slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>,
  { part = false }: { part?: boolean } = {},
): string {
  return columns.map((col, i) => {
    const v = row.raw[col.key];
    const sources = row.sources[col.key];
    const cls: string[] = [];
    if (col.key === "action") cls.push(part ? "name" : "action");
    if (col.key === "avg") cls.push("avg");
    if (col.key === "member") cls.push("member");

    const text = esc(fmt(v, col.digits ?? 0)) + (col.percent && typeof v === "number" ? "%" : "");
    let html = sources ? `<span class="has">${text}</span>` : text;
    if (col.key === "action" && !part && "parts" in row && row.parts.length) {
      html = `${html}<span class="caret">▸</span>`;
    }
    const suffix = col.key === "mv" && row.scaling
      ? ` ${SCALING_LABEL[row.scaling] ?? row.scaling}` : "";
    if (col.key === "action") {
      html += infoPopover("info" in row ? row.info : undefined);
    } else if (col.key === "member" && "line" in row) {
      const gear = gearByMember.get(row.line.snap.member) ?? [];
      html += buffsPopover(row.line.snap.member, gear, row.line.snap.heldLocal, row.line.snap.heldGlobal, row.line.snap.heldEnemy, slotHue);
    } else {
      html += popover(col, sources, v, slotHue, suffix);
    }

    const mem = slotHue.get(String(v)) ?? FALLBACK_HUE;
    const style = col.key === "member" ? `--mem:${mem};color:${mem}` : "";

    return cell(columns, i, { cls, html, style });
  }).join("");
}

function partRows(columns: Column[], parts: ReportPart[], slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>): string {
  return parts
    .map((p) => `<div class="r${p.short ? " short" : ""}">${stepRow(columns, p, slotHue, gearByMember, { part: true })}</div>`)
    .join("");
}

/** The whole team's rotation as one table, in the order they act. A row's own wash is whoever
 *  acted's colour, always — an echo-cast row (the rotation marker standing in for whichever
 *  mainslot echo is equipped, see kit.ts's own `run()`) still belongs to whoever's turn it was
 *  and is still shown at full strength here; only its dimmed/short treatment marks it as not a
 *  kit's own button press (`triggered`, from `run()`). */
function rotationTable(report: Report, slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>): string {
  const columns = report.columns;
  const cols = columns.map((c, i) => colWidth(c, i)).join(" ");

  const head = columns
    .map((c, i) => cell(columns, i, { html: esc(c.label) }))
    .join("");

  const steps = report.rows.map((row, i) => {
    const snap = row.line.snap;
    const hue = slotHue.get(snap.member) ?? FALLBACK_HUE;
    const style = ` style="--m:${hue}"`;
    const cells = stepRow(columns, row, slotHue, gearByMember);
    const shortCls = row.short ? " short" : "";
    if (!row.parts.length) {
      return `<div class="step"${style}><div class="r${shortCls}">${cells}</div></div>`;
    }
    const id = `x${i}`;
    return `<div class="step chain"${style}>`
      + `<input class="tgl" type="checkbox" id="${id}">`
      + `<label class="r${shortCls}" for="${id}">${cells}</label>`
      + `<div class="parts">${partRows(columns, row.parts, slotHue, gearByMember)}</div>`
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

function page({ report, openerReport, loopReport, members }: {
  state: State; report: Report; openerReport: Report; loopReport: Report; members: Member[];
}): string {
  const slotHue = new Map([...members.map((m): [string, string] => [m.name, m.color]), [MISC, MISC_HUE]]);
  const gearByMember = new Map(members.map((m): [string, Gear[]] => [m.name, equippedGear(m)]));

  return `<main>
  ${rotationTable(report, slotHue, gearByMember)}
  ${summaryCards("opener", openerReport, slotHue)}
  ${summaryCards("loop", loopReport, slotHue)}
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

/** Show the panel listing every buff that fed a value, when its cell is hovered. Pure DOM
 *  wiring — no engine dependency, so this is unchanged from the old page. */
function wireSourcePanels(root: HTMLElement): void {
  const GAP = 4, EDGE = 6;
  let open: HTMLElement | null = null;
  let openHome: Element | null = null;
  let pinned = false;

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
    pop.style.visibility = "hidden";
    pop.style.display = "block";
    const c = cell.getBoundingClientRect();
    const p = pop.getBoundingClientRect();

    // A right-aligned (`.num`) cell's own text sits flush against its right edge, so anchoring
    // the panel's right edge there lines it up under what you're actually pointing at. A
    // left-aligned cell (action, member, team name) is the opposite — its text starts at the
    // cell's own left edge, often well short of the cell's right edge once a column is wide
    // (action's own track is sized for its longest name, not this one) — anchoring off the right
    // edge there floated the panel away from the text itself. Anchor off whichever edge the text
    // actually sits on.
    const rightAligned = cell.classList.contains("num");
    const natural = rightAligned ? c.right - p.width : c.left;
    // Clamped to the table's own box, not just the viewport — `EDGE` alone let a panel opened on
    // a narrow leftmost column (the member column) bleed out past the table's own left edge and
    // into the page's margin, since a viewport-relative clamp has no idea where the table itself
    // starts.
    const tableLeft = (cell.closest(".gridwrap, .tcwrap")?.getBoundingClientRect().left ?? EDGE);
    const minLeft = Math.max(EDGE, tableLeft);
    const left = Math.max(minLeft, Math.min(natural, innerWidth - p.width - EDGE));
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
    const pop = (open && openHome === cell) ? open : cell.querySelector<HTMLElement>(":scope > .pop");
    return { cell, pop };
  };

  document.addEventListener("mouseover", (e) => {
    if (pinned) return;
    if (open && open.contains(e.target as Node)) return;
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
    if (open && open.contains(e.target as Node)) { e.preventDefault(); return; }

    const { cell, pop } = panelIn(e.target);
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
const backLink = document.getElementById("backLink")!;

const routeTeam = (): string | null => {
  const m = /^#team=(.+)$/.exec(location.hash);
  return m && TEAMS[m[1]!] ? m[1]! : null;
};

function renderComparison(results: Map<string, TeamRun>): void {
  backLink.hidden = true;
  app.innerHTML = comparisonTable(results);
  app.className = "";
  applyFilters();
}

function renderDetail(key: string, results: Map<string, TeamRun>): void {
  backLink.hidden = false;
  app.innerHTML = page(results.get(key)!);
  app.className = "";
}

/** Wait for the browser to actually paint.
 *
 *  Two frames, not one: inside a `requestAnimationFrame` callback the frame is still being built,
 *  so resolving there would hand the thread straight back to a blocking team run and the width
 *  set a moment ago would never reach the screen. The second callback only fires once the first
 *  frame has been committed. A bare `setTimeout` can't promise that. */
const paint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** Every team runs once, up front. `runTeam()` is synchronous and blocks the main thread for its
 *  whole run, so the progress bar can only move if this loop yields a frame between teams —
 *  without that, every width assignment would be collapsed into one repaint after the last team
 *  finished, which is the same as having no bar at all. The markup it drives is in index.html,
 *  already on screen before this module even parsed; this fills it in rather than replacing it. */
async function boot(): Promise<void> {
  const teams = Object.entries(TEAMS);
  const status = document.querySelector<HTMLElement>(".status-text");
  const fill = document.querySelector<HTMLElement>(".progress-fill");
  const count = document.querySelector<HTMLElement>(".progress-count");
  const progress = (done: number): void => {
    if (fill) fill.style.width = `${(done / teams.length) * 100}%`;
    if (count) count.textContent = `${done} / ${teams.length}`;
  };

  const results = new Map<string, TeamRun>();
  try {
    progress(0);
    // "Initializing…" is what's on screen at parse time (see index.html); swap to the real
    // status text only once team runs are actually about to start, not a moment before.
    if (status) status.textContent = "running every team's rotation…";
    for (let i = 0; i < teams.length; i++) {
      const [key, members] = teams[i]!;
      await paint(); // the bar as it stands has to land before this team seizes the thread
      results.set(key, runTeam(members));
      progress(i + 1);
    }
    await paint(); // and the finished bar before the table replaces the whole loading screen
  } catch (err) {
    console.error(err);
    app.innerHTML = errorPage(err);
    app.className = "";
    return;
  }

  const route = (): void => {
    const key = routeTeam();
    if (key) renderDetail(key, results);
    else renderComparison(results);
  };
  addEventListener("hashchange", route);
  route();

  wireSourcePanels(app);
  document.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>(".gotodetail");
    if (el?.dataset.team) location.hash = `team=${el.dataset.team}`;
  });
  document.addEventListener("change", (e) => {
    const id = (e.target as HTMLElement).id;
    if (id === "resonatorFilter" || id === "seqFilter") applyFilters();
  });
}

backLink.addEventListener("click", (e) => { e.preventDefault(); location.hash = ""; });

// async now (it yields a frame between teams so the progress bar can move), so anything thrown
// after its own try/catch — wiring up the page, the first render — would otherwise surface as an
// unhandled rejection in the console and a blank page with no explanation
boot().catch((err: unknown) => {
  console.error(err);
  app.innerHTML = errorPage(err);
  app.className = "";
});
