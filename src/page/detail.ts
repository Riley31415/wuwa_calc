/**
 * The detail page: the DPR and energy tables, the action log grid, and the log's draggable
 * column order (kept in localStorage) with its pointer handlers.
 */
import { Stat, Cast, SCALING_NAME, ActionTag, statLabel, ENERGY_UNIT, CONCERTO_UNIT, Resource, RESOURCE_NAME } from "../engine/stats.js";
import type { Gear } from "../engine/gear.js";
import { menuStats } from "../engine/context.js";
import { TUNE_BREAK_ENEMY, ENEMY_MAX_OFFTUNE } from "../resonators/tunebreak.js";
import type { ChainGroup, ResolvedSnapshot } from "../engine/evaluate.js";
import { buildReport, fmt, fmtPct, fmtPctCell, digitsOf, PAD_DIGITS_COLUMNS, GROUPED_COLUMNS, RATE_SECTIONS } from "./display.js";
import type { Report, Column, ReportRow, ReportPart } from "./display.js";
import type { TeamRun } from "../solve/teamrun.js";
import { hitsOf, erRollsFor } from "../solve/teamrun.js";
import { ER_TOLERANCE } from "../echoes/substats.js";
import { results, detailFor, FALLBACK_HUE } from "./model.js";
import { bannerUrl } from "./banners.js";
import { esc, lazyPop, rect, zoom, clearPops, popover, hitsPopover, infoPopover, buffsPopover, framesPopover, equippedGear, dprTable, loadoutTable, distributionTable, substatValueTable, wireDistribution, drivePanel, dropPanel, holdPanels, panelOpenOn, copyBlock } from "./panels.js";
import { HOLD, watchTouch, swallowClick, grabDot, makeDot } from "./cellpick.js";
import { rememberTableScroll } from "./table.js";
import { canPick } from "./pickmenu.js";
import { substatGains, cachedGains } from "./substatvalue.js";
import { showError } from "./loading.js";

const app = document.getElementById("app")!;

/* ------------------------------------------------------------------------------ action log */

const BUFF_UNDERLINE_COLUMNS = new Set(["mv", "energy", "concerto", "offtune"]);
const RUNNING_COLUMNS = new Set(["concerto", "energy", "offtune"]);
const isRunning = (key: string): boolean => RUNNING_COLUMNS.has(key) || key.startsWith("gauge:");

/** A grid track: the column's character width times --cw, plus the cell padding. */
const colWidth = (c: Column): string => {
  const num = c.align === "left" ? 0 : 1, p = c.pad ?? { cw: 0, cpad: 0, npad: 0 };
  return `calc(var(--cw) * ${(c.width ?? 0) + p.cw} + var(--cpad) * ${1 + p.cpad} + var(--npad) * ${num + p.npad})`;
};

function cell(col: Column, { cls = [], html = "", pop = "", style = "", attr = "" }: { cls?: string[]; html?: string; pop?: string; style?: string; attr?: string } = {}): string {
  const classes = ["c", col.align === "left" ? "" : "num", ...cls].filter(Boolean).join(" ");
  return `<span class="${classes}"${style ? ` style="${style}"` : ""}${attr}${pop}>${html}</span>`;
}

/** Which colour a cut's tag box wears (index.css `.ctag-*`). */
const TAG_KIND: Partial<Record<ActionTag, string>> = {
  [ActionTag.InstaCancel]: "insta", [ActionTag.InstaDodge]: "insta", [ActionTag.InstaJump]: "insta", [ActionTag.InstaSwap]: "insta",
  [ActionTag.SwapCancel]: "swap", [ActionTag.MashSwap]: "swap", [ActionTag.MashCancel]: "easy", [ActionTag.HoldCancel]: "easy", [ActionTag.OffField]: "field",
  [ActionTag.DodgeCancel]: "dash", [ActionTag.JumpCancel]: "jump", [ActionTag.Cancel]: "cancel", [ActionTag.HitCancel]: "hit", [ActionTag.DodgeOnHit]: "hit", [ActionTag.JumpOnHit]: "hit",
  [ActionTag.TimedCancel]: "timed",
};

/** How each cut is played, for its tag box's panel. */
const TAG_NOTE: Partial<Record<ActionTag, string>> = {
  [ActionTag.InstaCancel]: "After casting, input the next action instantly",
  [ActionTag.InstaDodge]: "After casting, dodge instantly",
  [ActionTag.InstaJump]: "After casting, jump instantly",
  [ActionTag.InstaSwap]: "After casting, swap instantly",
  [ActionTag.Cancel]: "After the final hit, input the next action to cancel endlag",
  [ActionTag.DodgeCancel]: "After the final hit, dodge to cancel endlag",
  [ActionTag.JumpCancel]: "After the final hit, jump to cancel endlag",
  [ActionTag.SwapCancel]: "After the final hit, swap to cancel endlag",
  [ActionTag.MashSwap]: "After casting, mash swap to swap out the moment it allows",
  [ActionTag.MashCancel]: "After casting, mash the next input to cancel when available",
  [ActionTag.HoldCancel]: "After casting, hold the next input to cancel when available",
  [ActionTag.HitCancel]: "After the first hit, input the next action",
  [ActionTag.DodgeOnHit]: "After the first hit, dodge",
  [ActionTag.JumpOnHit]: "After the first hit, jump",
  [ActionTag.TimedCancel]: "Input the next action on the frame shown",
};

/** One row of the log. A running column is blank where the row left it exactly as it came in
 *  (`before:`), unless something fed it; `buffed` underlines a cell a buff actually moved, or a
 *  counter whose before + moved ≠ after (set outright: an outro's wipe, a clamped gauge). */
function stepRow(
  columns: Column[], row: ReportRow | ReportPart, slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>,
  { part = false, caret = true, bars = null }: { part?: boolean; caret?: boolean; bars?: Bars | null } = {},
): string {
  const snap = "line" in row ? row.line.snap : row.snap;
  const aggregate = "line" in row && !!row.line.aggregate;
  return columns.map((col) => {
    if (!bars || aggregate || !(col.key === FORTE_KEY || RUNNING_COLUMNS.has(col.key))) {
      return cell(col, cellParts(col, row, slotHue, gearByMember, part, caret));
    }
    // the resource view: each running figure over a bar of its own, filled to the gauge's cap
    if (col.key !== FORTE_KEY) {
      const p = cellParts(col, row, slotHue, gearByMember, part, caret);
      const cap = col.key === "energy" ? bars.energyCap.get(snap.member) ?? 0 : col.key === "concerto" ? CONCERTO_CAP : OFFTUNE_CAP;
      return cell(col, { cls: ["barcell"], attr: p.attr, pop: p.pop, html: barHtml([{ color: BAR_COLOR[col.key]!, fill: Number(row.raw[col.key]) / cap, text: p.html, cls: p.cls }]) });
    }
    // ...and the forte column: the member's own gauges sharing its width evenly, each in their colour
    const hue = slotHue.get(snap.member) ?? FALLBACK_HUE;
    const gauges = bars.forte.get(snap.member) ?? [];
    return cell(col, { cls: ["barcell"], html: barHtml(gauges.map(({ key, cap }) => {
      const name = key.slice("gauge:".length);
      const p = cellParts({ ...bars.gauge, key, label: name, full: name }, row, slotHue, gearByMember, part, caret);
      return { color: hue, fill: Number(row.raw[key]) / cap, text: p.html, cls: p.cls, pop: p.pop };
    })) });
  }).join("");
}

/** One column's cell content: its figure, classes, panel and data. A running column is blank where
 *  the row left it as it came in. */
function cellParts(
  col: Column, row: ReportRow | ReportPart, slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>, part: boolean, caret: boolean,
): { cls: string[]; html: string; pop: string; style: string; attr: string } {
  {
    const v = row.raw[col.key];
    const sources = row.sources[col.key];
    // a resource cell carries its balance and the one the row was entered on, blank or not, for
    // the block a press runs down the column to read the gain over (`blockPanel`) — except where
    // the balance is the row's own spend rather than a step in the run: an Outro spends concerto,
    // the Tune Break takes the whole off-tune bar, and a block read across either would say so
    let attr = "";
    if (isRunning(col.key)) {
      if ("line" in row && row.line.aggregate) return { cls: [], html: "", pop: "", style: "", attr: "" };
      const act = ("line" in row ? row.line.snap : row.snap).action, cast = act.cast;
      // a Tune Break's response casts as one too, but only the break drains the bar
      const spend = col.key === "offtune" ? cast === Cast.TuneBreak && act.castOfftune < 0
        : col.key === "energy" ? act.castEnergy < 0
        : col.key === "concerto" && cast === Cast.Outro;
      const before = Number(row.raw[`before:${col.key}`]) || 0;
      if (!spend) attr = ` data-val="${Number(v) || 0}" data-before="${before}"`;
      // energy's block total reads what each row's own press generated, unbuffed: no ER, nothing shared
      if (!spend && col.key === "energy") attr += ` data-gen="${Number(row.raw["gen:energy"]) || 0}"`;
      const fed = (sources ?? []).some((r) => !RATE_SECTIONS.has(r.section ?? ""));
      const moved = (raw: typeof row.raw): boolean => Math.abs((Number(raw[col.key]) || 0) - (Number(raw[`before:${col.key}`]) || 0)) >= 1e-9;
      // a group shows a gauge only where one of its own presses moved it: off-tune and shared energy
      // also move between them, off another member's hits
      const blank = "parts" in row && row.parts.length
        ? !row.parts.some((p) => moved(p.raw) || (p.sources[col.key] ?? []).some((r) => !RATE_SECTIONS.has(r.section ?? "")))
        : !fed && !moved(row.raw);
      if (blank) return { cls: [], html: "", pop: "", style: "", attr };
    }
    const cls: string[] = [];
    if (col.key === "action") cls.push(part ? "name" : "action");
    if (col.key === "avg") cls.push("avg");
    if (col.key === "member") cls.push("member");
    if (BUFF_UNDERLINE_COLUMNS.has(col.key) && row.buffed.has(col.key)) cls.push("buffed");
    // a gauge this cast wipes before its own delta lands — the panel carries the CLEAR row that
    // says so (display.ts), and the underline is what points at it
    if (col.key.startsWith("gauge:") && Number(row.raw[`clear:${col.key}`])) cls.push("buffed");
    // every bar alike: outside the cast's condition, or left below empty
    if (isRunning(col.key) && Number(row.raw[`short:${col.key}`])) cls.push("negative");
    // a press cast without a buff its condition names
    if (col.key === "action" && row.raw["short:buff"]) cls.push("negative");

    const text = (col.percent && typeof v === "number" ? `${fmtPctCell(v, col.key, PAD_DIGITS_COLUMNS.has(col.key))}%`
      : esc(fmt(v, digitsOf(row.raw, col), PAD_DIGITS_COLUMNS.has(col.key), GROUPED_COLUMNS.has(col.key))));
    let html = sources && text ? `<span class="has">${text}</span>` : text;
    if (col.key === "action" && caret && !part && "parts" in row && row.parts.length) {
      html = `${html}<span class="caret">▸</span>`;
    }
    const tag = col.key === "action" ? String(row.raw["tag:action"] ?? "") : "";
    // the tag's own box, coloured by what cut the press — an insta anything red (insta swap too), a
    // swap form yellow, a mash or hold cancel green, then a dash, a jump, and a plain cancel — or gray
    // for a press beside the fight
    if (tag) {
      const own = tag.startsWith("cancel @ ") ? ActionTag.TimedCancel : tag as ActionTag;
      const kind = TAG_KIND[own] ?? "cancel", note = TAG_NOTE[own];
      const tagPop = note ? lazyPop(`<span class="pop note">${esc(note)}</span>`) : "";
      html = `<span class="ctag ctag-${kind}"${tagPop}>${esc(tag.toUpperCase())}</span>${html}`;
    }
    const suffix = col.key === "mv" && row.scaling !== null ? ` ${SCALING_NAME[row.scaling]}` : "";
    let pop = "";
    if (col.key === "action") {
      // a group's name is its expand control, no panel
      const group = "parts" in row && row.parts.length > 0;
      pop = group ? "" : infoPopover(row.info, slotHue);
    } else if (col.key === "time") {
      const snaps = "line" in row ? (row.line.members?.length ? row.line.members : [row.line.snap]) : [row.snap];
      pop = framesPopover(snaps);
    } else if (col.key === "member") {
      const snap = "line" in row ? row.line.snap : row.snap;
      const gear = gearByMember.get(snap.member) ?? [];
      pop = buffsPopover(snap.member, gear, snap.heldLocal, snap.heldGlobal, snap.heldEnemy, slotHue);
    } else if (col.key === "avg") {
      pop = text ? hitsPopover(row.hits) : "";
    } else if (text) {
      // a running counter's panel foots to what this action moved it by, not the balance
      pop = popover(col, sources, row.raw[`moved:${col.key}`] ?? v, slotHue, suffix, String(row.raw[`empty:${col.key}`] ?? ""));
    }

    // the name wears the row's hue: the enemy's gray on a Tune Break, though it names who was on field
    const mem = col.key === "member" ? rowHue("line" in row ? row.line.snap : row.snap, slotHue) : slotHue.get(String(v)) ?? FALLBACK_HUE;
    const style = col.key === "member" ? `--mem:${mem};color:${mem}`
      : col.key === "avg" ? `--mem:${slotHue.get(String(row.raw["member"] ?? "")) ?? FALLBACK_HUE}` : "";
    // the figure itself, unformatted, for the run a press down the column adds up (`blockPanel`)
    if (col.key === "avg" && typeof v === "number") attr = ` data-avg="${v}"`;
    // ...and the frames the row's presses took, for the time a block of them spent
    if (col.key === "time") {
      const snaps = "line" in row ? (row.line.members?.length ? row.line.members : [row.line.snap]) : [row.snap];
      // time off the field isn't the fight's: a press made by someone not on field adds none of its
      // own frames, though the swap frames a handoff row carries are the fight's all the same
      const frames = snaps.reduce((n, s) => n + (s.active ? s.frames : 0) + (s.swapFrames ?? 0), 0);
      attr = ` data-frames="${frames}"`;
    }
    return { cls, html, pop, style, attr };
  }
}

/* ------------------------------------------------------------------------------ resource bars */

/** The resource view's single forte column, standing in for every gauge column. */
const FORTE_KEY = "forte";
const GAUGE_KEYS = [Resource.Forte1, Resource.Forte2, Resource.Forte3, Resource.Forte4, Resource.Forte5].map((r) => `gauge:${RESOURCE_NAME[r]}`);
const BAR_COLOR: Record<string, string> = { concerto: "#ffffff", energy: "#f5c542", offtune: "#c4c7cc" };
const CONCERTO_CAP = 10000 / CONCERTO_UNIT, OFFTUNE_CAP = ENEMY_MAX_OFFTUNE / 10000;

/** What the bars need: each member's energy cap, the forte gauges they use with each one's cap,
 *  and a gauge column to format any of the five by. */
interface Bars {
  energyCap: Map<string, number>;
  forte: Map<string, { key: string; cap: number }[]>;
  gauge: Column;
}

/** Every gauge each member uses in the report — capped, or ever off zero — with its cap; an
 *  uncapped gauge fills to the most it held. */
function forteUse(report: Report): Map<string, { key: string; cap: number }[]> {
  const seen = new Map<string, { caps: number[]; peak: number[] }>();
  const read = (snap: ResolvedSnapshot, raw: Report["rows"][number]["raw"]): void => {
    const m = seen.get(snap.member) ?? { caps: [0, 0, 0, 0, 0], peak: [0, 0, 0, 0, 0] };
    seen.set(snap.member, m);
    GAUGE_KEYS.forEach((key, i) => {
      if (snap.maxForte[i]) m.caps[i] = snap.maxForte[i]! * snap.forteScale[i]!;
      m.peak[i] = Math.max(m.peak[i]!, Math.abs(Number(raw[key]) || 0));
    });
  };
  for (const row of report.rows) {
    if (row.line.aggregate) continue;
    read(row.line.snap, row.raw);
    for (const p of row.parts) read(p.snap, p.raw);
  }
  const out = new Map<string, { key: string; cap: number }[]>();
  for (const [member, { caps, peak }] of seen) {
    const used = GAUGE_KEYS.flatMap((key, i) => (caps[i] || peak[i]! > 1e-9 ? [{ key, cap: caps[i] || peak[i]! }] : []));
    if (used.length) out.set(member, used);
  }
  return out;
}

/** Bars side by side, each filled to its share of its cap, its figure over it in its own colour. */
const barHtml = (bars: { color: string; fill: number; text: string; cls: string[]; pop?: string }[]): string =>
  `<span class="rbars">${bars.map((b) => `<span class="rbar${b.text ? "" : " empty"}" style="--bar:${b.color};--fill:${Math.max(0, Math.min(1, b.fill || 0))}"${b.pop ?? ""}>`
    + `<span class="rfill"></span><span class="rtext${b.cls.length ? ` ${b.cls.join(" ")}` : ""}">${b.text}</span></span>`).join("")}</span>`;

/** The hue a log row wears: its member's, but the enemy's gray on a Tune Break — nobody's damage,
 *  though it still names whoever was on field. */
const rowHue = (snap: ResolvedSnapshot, slotHue: Map<string, string>): string =>
  snap.slot === TUNE_BREAK_ENEMY.name ? TUNE_BREAK_ENEMY.color : slotHue.get(snap.member) ?? FALLBACK_HUE;

/** An opened group's rows, each in its *own* member's hue (a follow-up can land on anybody). */
function partRows(
  columns: Column[], parts: ReportPart[], slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>,
  fieldOf: Map<ResolvedSnapshot, number>, bars: Bars | null,
): string {
  return parts.map((p) => {
    const hue = rowHue(p.snap, slotHue);
    const field = fieldOf.get(p.snap);
    const mark = field === undefined ? "" : ` data-fh="${field}"`;
    return `<div class="r${p.short ? " short" : ""}" style="--m:${hue}"${mark}>`
      + `${stepRow(columns, p, slotHue, gearByMember, { part: true, bars })}</div>`;
  }).join("");
}

/** Where a loop begins: a short row of the table's own columns, LOOP n centred in the action one. Not selectable (`.loop`). */
const loopBar = (columns: Column[], n: number): string =>
  `<div class="step loopbar" aria-hidden="true"><div class="r short loop">`
  + columns.map((c) => cell(c, { cls: c.key === "action" ? ["action"] : [], html: c.key === "action" ? `LOOP ${n}` : "" })).join("")
  + `</div></div>`;

/** The whole team's rotation as one grid. A group's block holds its parts (shown open) and its
 *  spill follow-ups (shown closed); a field's summons swap with its summary row by a stylesheet
 *  keyed on the summary's checkbox, since they are scattered through the section. */
function rotationTable(report: Report, slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>, starts: Map<number, number>, bars: Bars | null): string {
  const columns = report.columns;
  const cols = columns.map(colWidth).join(" ");
  // the resources' headings sit centred over their bars
  const head = columns.map((c) => cell(c, { html: esc(c.label), cls: RESOURCE_COLUMN(c.key) || c.key === FORTE_KEY ? ["rhead"] : [] })).join("");

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
    if (loop !== undefined) { closeBlock(); out.push(loopBar(columns, loop)); }
    const snap = row.line.snap;
    const hue = rowHue(snap, slotHue);
    const style = ` style="--m:${hue}"`;
    const cells = stepRow(columns, row, slotHue, gearByMember, { bars });
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
          + `<div class="parts">${partRows(columns, row.parts, slotHue, gearByMember, fieldOf, bars)}</div>`
          + `</div>`);
        return;
      }
      out.push(`<div class="r${shortCls}"${style}${mark}>`
        + `${stepRow(columns, row, slotHue, gearByMember, { caret: false, bars })}</div>`);
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
      + `<div class="parts">${partRows(columns, row.parts, slotHue, gearByMember, fieldOf, bars)}</div>`
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

/**
 * What each member's Liberations asked of their constant ER — the most any one of them wanted, which
 * the Energy Regen menu stat carries in its own label. Its colour says whether what the build wears
 * covers it.
 */
function energyRequirements(run: TeamRun): Map<string, Map<string, string>> {
  const { needs } = detailFor(run);
  const erOf = erRollsFor(run.teamKey, run.members, run.combo);

  const cells = new Map<string, Map<string, string>>();
  run.members.forEach((m, idx) => {
    const own = new Map<string, string>();
    cells.set(m.name, own);
    const combo = run.combo[idx]!;
    const { bar, minEr, constant, gen } = needs.get(m.name)!;
    // One hover row per line — its label, its figure in a right-aligned column, then any note — a
    // requirement's figure green where the build's character screen covers it and red where it
    // falls short; the label carries the higher of them.
    const row = (what: string, figure: string, note = ""): string =>
      `<tr><td class="k">${esc(what)}</td><td class="v">${figure}</td><td class="n">${note}</td></tr>`;
    const line = (what: string, need: number, held: number): { html: string; met: boolean } => {
      const met = need <= held + ER_TOLERANCE;
      return { met, html: row(what, `<span class="${met ? "need-met" : "need-miss"}">${fmtPct(need)}%</span>`, met ? "(Met)" : "(Not Met)") };
    };
    const tag = (need: number, met: boolean, lines: string[]): string => {
      const tip = lazyPop(`<span class="pop tip"><table>${lines.join("")}</table></span>`);
      return `<span class="erneed has"${tip}>> <span class="erreq ${met ? "er-met" : "er-under"}">${fmtPct(need)}%</span></span>`;
    };
    if (bar != null || minEr) {
      const lines: { html: string; met: boolean }[] = [];
      if (minEr) lines.push(line("Energy Regen requirement for kit", minEr, constant));
      if (bar != null) lines.push(line("Energy Regen requirement", bar, constant));
      // what went into the spend that asked it, before any ER: their own gen (flat gains in), then
      // each ally's half
      if (bar != null && gen) {
        const pt = (v: number): string => fmt(v / ENERGY_UNIT, 2, true);
        const gained = (text: string, v: number) => ({ met: true, html: row(text, pt(v)) });
        lines.push(
          gained(`${m.name} energy gen`, gen.hit + gen.flat),
          ...gen.shared.map(([ally, v]) => gained(`${ally} energy shared`, v)),
          gained("Total energy gen", gen.hit + gen.flat + gen.shared.reduce((n, [, v]) => n + v, 0)),
        );
      }
      const need = Math.max(bar ?? 0, minEr);
      own.set(statLabel(Stat.ER), tag(need, need <= constant + ER_TOLERANCE, lines.map((l) => l.html)));
    }
    // and the kit's own Crit Rate minimum, against what the character screen shows
    const minCr = m.loadout.minCritRate;
    if (minCr) {
      const cr = menuStats(m.loadout.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence, combo.matrix !== null, combo.highSubs, erOf[idx]!))
        .reduce((n, e) => n + (e.stat === Stat.CritRate ? e.value : 0), 0);
      const kit = line("Kit Crit Rate Requirement", minCr, cr);
      own.set(statLabel(Stat.CritRate), tag(minCr, kit.met, [kit.html]));
    }
  });

  return cells;
}

/* ------------------------------------------------------------------------------------ page */

/** Loop 1 alone, its clock from its first press. A field opened in the opener is left out with all
 *  its hits; one opened in Loop 1 keeps every hit, those landing in later loops included. */
const loopReports = new WeakMap<TeamRun, Report>();
function loopReport(run: TeamRun): Report {
  const seen = loopReports.get(run);
  if (seen) return seen;
  const [, loop = [], ...later] = run.rotationLines!;
  const opened = new Set(loop.filter((l) => l.aggregate).map((l) => l.fieldKey));
  const lines = [
    ...loop.filter((l) => l.aggregate || l.fieldKey === undefined || opened.has(l.fieldKey)),
    ...later.flat().filter((l) => !l.aggregate && l.fieldKey !== undefined && opened.has(l.fieldKey)),
  ];
  const first = loop.find((l) => !l.aggregate);
  const origin = first ? Math.min(...(first.members?.length ? first.members : [first.snap]).map((s) => s.frame)) : 0;
  const report = buildReport(lines, origin);
  loopReports.set(run, report);
  return report;
}

/** The report the log is showing: the whole fight, or Loop 1 alone (its tabs). */
// Loop 1 alone keeps the full fight's columns, so the two views are one width
const shownReport = (run: TeamRun): Report => (rotView === "loop" ? { ...loopReport(run), columns: detailFor(run).report.columns } : detailFor(run).report);

function page(run: TeamRun): string {
  const report = shownReport(run);
  const lines = run.rotationLines!;
  const { members } = run;
  const slotHue = new Map([...members.map((m): [string, string] => [m.name, m.color]), [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]]);
  const erRolls = erRollsFor(run.teamKey, run.members, run.combo);
  const gearByMember = new Map(members.map((m, i): [string, Gear[]] => [m.name, equippedGear(m, run.combo[i]!, erRolls[i]!).map(([, g]) => g)]));
  // where each loop begins in the log, by loop number; the loop view has none
  const starts = new Map<number, number>();
  if (rotView === "full") lines.reduce((n, sec, k) => { if (k) starts.set(n, k); return n + sec.length; }, 0);

  const panes: Record<Tab, string> = {
    team: loadoutTable(run, energyRequirements(run), (slot, kind) => canPick(run, slot, kind)),
    contribution: dprTable(run, lines),
    distribution: distributionTable(run, lines),
    substats: substatValueTable(run, cachedGains(run) ?? null),
  };
  const tabs = TABS.map(([key, label]) =>
    `<button type="button" class="rtab${key === tab ? " on" : ""}" data-tab="${key}">${label}</button>`).join("");
  return `<main>
  <div class="rtables">
    <div class="rtabs" role="tablist">${tabs}</div>
    <div class="rpanes">${TABS.map(([key]) => `<div class="rpane${key === tab ? " on" : ""}" data-pane="${key}">${panes[key]}</div>`).join("")}</div>
  </div>
  <div class="rotation-block">
    <div class="logbar">
      <div class="rtabs" role="tablist">${([["full", "Full Rotation"], ["loop", "Loop Rotation"]] as const).map(([key, label]) =>
        `<button type="button" class="rtab${key === rotView ? " on" : ""}" data-rot="${key}">${label}</button>`).join("")}</div>
      <div class="rtabs" role="tablist">${([["resources", "Resources"], ["stats", "Stats"]] as const).map(([key, label]) =>
        `<button type="button" class="rtab${key === logView ? " on" : ""}" data-log="${key}">${label}</button>`).join("")}</div>
    </div>
    ${rotationTable({ ...report, columns: shownColumns(run) }, slotHue, gearByMember, starts, logView === "resources" ? barsOf(run, report) : null)}
  </div>
</main>`;
}


/** The tables' tabs; every pane is drawn, stacked in one cell so the box keeps the biggest one's size. */
type Tab = "team" | "contribution" | "distribution" | "substats";
const TABS: [Tab, string][] = [["team", "Team & Gear"], ["distribution", "Node Priority"], ["substats", "Substat Value"], ["contribution", "Contribution"]];
/** The three tab choices, kept in localStorage across loads; one not recognised falls back. */
const VIEW_KEY = "wuwa.teamViews";
const savedViews = ((): { tab?: string; log?: string; rot?: string } => {
  try { return JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}") as { tab?: string; log?: string; rot?: string }; }
  catch { return {}; }
})();
const saveViews = (): void => {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify({ tab, log: logView, rot: rotView })); } catch { /* no storage */ }
};
let tab: Tab = TABS.find(([k]) => k === savedViews.tab)?.[0] ?? "team";

/** The log shows its resource bars by default, or the damage stats in their place (its tabs). */
let logView: "resources" | "stats" = savedViews.log === "stats" ? "stats" : "resources";
/** ...over the whole fight, or Loop 1 alone. */
let rotView: "full" | "loop" = savedViews.rot === "loop" ? "loop" : "full";
const STAT_COLUMNS = new Set(["mv", "scaler", "dmgBonus", "amp", "cr", "cd", "effDef", "effRes", "dealt"]);
const RESOURCE_COLUMN = (key: string): boolean => key === "concerto" || key === "energy" || key === "offtune" || key.startsWith("gauge:");
/** The log's columns for the view: the stats, or the resources with every forte gauge folded into
 *  one column as wide as the most gauges a member uses, which each member's bars share evenly. */
function shownColumns(run: TeamRun): Column[] {
  const report = shownReport(run), full = detailFor(run).report;
  const own = viewColumns(report, full, logView), other = viewColumns(report, full, logView === "stats" ? "resources" : "stats");
  // the narrower view's action column takes up the difference, so both tabs are one width
  const sum = (cs: Column[]) => ({ cw: cs.reduce((n, c) => n + (c.width ?? 0), 0), cpad: cs.length, npad: cs.filter((c) => c.align !== "left").length });
  const a = sum(own), b = sum(other);
  const pad = { cw: b.cw - a.cw, cpad: b.cpad - a.cpad, npad: b.npad - a.npad };
  const css = getComputedStyle(document.documentElement), v = (k: string) => parseFloat(css.getPropertyValue(k)) || 0;
  const px = pad.cw * v("--cw") + pad.cpad * v("--cpad") + pad.npad * v("--npad");
  return px > 0 ? own.map((c) => (c.key === "action" ? { ...c, pad } : c)) : own;
}
// `full` sizes the forte column, so Loop 1 alone and the full fight match
function viewColumns(report: Report, full: Report, view: "resources" | "stats"): Column[] {
  if (view === "stats") return report.columns.filter((c) => !RESOURCE_COLUMN(c.key));
  const gauges = report.columns.filter((c) => c.key.startsWith("gauge:"));
  const slots = Math.max(0, ...[...forteUse(full).values()].map((g) => g.length));
  const width = Math.max(...gauges.map((c) => c.width ?? 0), 6);
  // never under a slot and a half wide, the same as the columns beside it, however few gauges it holds
  const cells = Math.max(slots, 1.5);
  const forte: Column = { ...gauges[0]!, key: FORTE_KEY, label: "forte", full: "Forte", width: width * cells + (cells - 1) };
  // concerto, energy and off-tune each a forte slot and a half wide, and forte right after concerto
  // (where the fight banked no concerto, forte keeps the gauges' own place)
  const after = report.columns.some((c) => c.key === "concerto") ? "concerto" : gauges[0]?.key;
  return report.columns.flatMap((c) => [
    ...(STAT_COLUMNS.has(c.key) || c.key.startsWith("gauge:") ? [] : RUNNING_COLUMNS.has(c.key) ? [{ ...c, width: width * 1.5 + 0.5 }] : [c]),
    ...(c.key === after && slots ? [forte] : []),
  ]);
}
/** The bars' caps off the run's own resonators. */
function barsOf(run: TeamRun, report: Report): Bars | null {
  const gauge = report.columns.find((c) => c.key.startsWith("gauge:")) ?? { key: GAUGE_KEYS[0]!, label: "", digits: 2 };
  return {
    energyCap: new Map(run.members.map((m) => [m.name, (m.loadout.resonator.maxEnergy ?? 0) / ENERGY_UNIT])),
    forte: forteUse(report),
    gauge,
  };
}
let shownKey = "";

/** The page's backdrop: the banner art of the member dealing the most damage who has one, fixed
 *  and blurred under the tables; none of them having art leaves the plain background. */
function setBackdrop(run: TeamRun): void {
  const best = run.members.filter((m) => bannerUrl(m.loadout.resonator))
    .sort((a, b) => (run.bySlot.get(b.name) ?? 0) - (run.bySlot.get(a.name) ?? 0))[0];
  let el = document.querySelector<HTMLElement>("body > .backdrop");
  document.body.classList.toggle("backdropped", !!best);
  if (!best) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.body.appendChild(document.createElement("div"));
    el.className = "backdrop";
  }
  el.style.backgroundImage = `url('${bannerUrl(best.loadout.resonator)}')`;
}

export function renderDetail(key: string): void {
  shownKey = key;
  rememberTableScroll();
  clearPops();
  const run = results.get(key)!;
  setBackdrop(run);
  app.innerHTML = page(run);
  app.className = "";
  wireColumnDrag(app, shownColumns(run));
  wireCellSelect(app);
  wireDistribution(app);
  wireBlockSelect(app.querySelector<HTMLElement>(".rtable.distpies"), distCopy);
  wireBlockSelect(app.querySelector<HTMLElement>(".rtable.dpr"), (sel) =>
    sel.cells.slice(sel.r0, sel.r1 + 1).map((row) => row.slice(sel.c0, sel.c1 + 1).map((c) => (c.textContent ?? "").trim())));
  // Node Priority's and Substat Value's label column as wide as Team & Gear's, before the pies fit to their cells
  const lbl = app.querySelector<HTMLElement>(".rtable.loadout .c.lbl");
  if (lbl) app.querySelector<HTMLElement>(".rpanes")?.style.setProperty("--lblw", `${lbl.getBoundingClientRect().width / zoom()}px`);
  // ...and every column exactly Team & Gear's, off its cells at full precision, so switching tabs never
  // shifts one by a fraction
  const heads = [...app.querySelectorAll<HTMLElement>(".rpanes .rtable.loadout > .rtrow:first-child > .c")];
  if (heads.length) {
    const cols = heads.map((c) => `${c.getBoundingClientRect().width / zoom()}px`).join(" ");
    app.querySelectorAll<HTMLElement>(".rpanes .rtable:not(.loadout)").forEach((t) => {
      if (t.querySelector(":scope > .rtrow:first-child")?.children.length === heads.length) t.style.gridTemplateColumns = cols;
    });
  }
  fitPies(app);
  if (tab === "substats") fillSubstats();
}

/** Substat Value's runs, made the first time its tab opens on a team, then drawn into it. */
function fillSubstats(): void {
  const key = shownKey, run = results.get(key);
  if (!run || cachedGains(run)) return;
  void substatGains(run, () => shownKey !== key || results.get(key) !== run).then((gains) => {
    const pane = app.querySelector<HTMLElement>('.rpane[data-pane="substats"]');
    if (gains && pane && shownKey === key && results.get(key) === run) pane.innerHTML = substatValueTable(run, gains);
  }).catch(showError);
}

/** A pie's frame keeps room round it for any label: cut it to what its own labels reach, then draw
 *  every pie at the one scale that fits the most cramped of them in its cell (Team & Gear sets the
 *  cells' size), no bigger than 0.6. */
function fitPies(root: HTMLElement): void {
  const pies = [...root.querySelectorAll<SVGSVGElement>(".rtable.distpies svg.pie")].map((svg) => {
    const vb = svg.viewBox.baseVal, b = svg.getBBox();
    // a hovered wedge slides 7 out, which the vertical pad leaves room for
    const left = Math.max(vb.x, b.x - 6), right = Math.min(vb.x + vb.width, b.x + b.width + 6);
    const top = Math.max(vb.y, b.y - 9), bottom = Math.min(vb.y + vb.height, b.y + b.height + 9);
    svg.setAttribute("viewBox", `${left} ${top} ${right - left} ${bottom - top}`);
    const wrap = svg.parentElement as HTMLElement, cell = wrap.parentElement!;
    return { wrap, w: right - left, h: bottom - top, room: [cell.clientWidth - 8, cell.clientHeight - 8] as const };
  });
  const scale = Math.min(0.6, ...pies.map((p) => Math.min(p.room[0] / p.w, p.room[1] / p.h)));
  for (const p of pies) {
    p.wrap.style.width = `${Math.floor(p.w * scale)}px`;
    p.wrap.style.height = `${Math.floor(p.h * scale)}px`;
  }
}

// a tab shows its pane in place; nothing is redrawn
app.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(".rtab[data-tab]");
  if (!btn) return;
  tab = btn.dataset.tab as Tab;
  saveViews();
  dropPanel();
  clearTableSel();
  for (const el of app.querySelectorAll<HTMLElement>(".rtab[data-tab], .rpane")) el.classList.toggle("on", (el.dataset.tab ?? el.dataset.pane) === tab);
  if (tab === "substats") fillSubstats();
});

/* ------------------------------------------------------------------- table blocks */

/** A block of Contribution's or Distribution's cells: `ar`/`ac` where the press landed, `r0`..`c1`
 *  the corners in order, `copy` what Ctrl+C makes of it. Taking it puts down the log's block, and
 *  the log's takes it. */
interface TableSel {
  table: HTMLElement; cells: HTMLElement[][]; ar: number; ac: number; r0: number; r1: number; c0: number; c1: number;
  box: HTMLElement; copy: (sel: TableSel) => string[][];
}
let tableSel: TableSel | null = null;

function clearTableSel(): void {
  tableSel?.box.remove();
  tableSel = null;
}

/** Where `cell` sits in the table's rows and columns, or null for anything else. */
function cellAt(cells: HTMLElement[][], cell: Element | null): [number, number] | null {
  for (let r = 0; r < cells.length; r++) {
    const c = cells[r]!.indexOf(cell as HTMLElement);
    if (c >= 0) return [r, c];
  }
  return null;
}

function aimTableSel(r: number, c: number): void {
  const sel = tableSel;
  if (!sel) return;
  sel.r0 = Math.min(sel.ar, r);
  sel.r1 = Math.max(sel.ar, r);
  sel.c0 = Math.min(sel.ac, c);
  sel.c1 = Math.max(sel.ac, c);
  const t = rect(sel.table), a = rect(sel.cells[sel.r0]![sel.c0]!), b = rect(sel.cells[sel.r1]![sel.c1]!);
  Object.assign(sel.box.style, { left: `${a.left - t.left}px`, top: `${a.top - t.top}px`, width: `${b.right - a.left}px`, height: `${b.bottom - a.top}px` });
}

/** A press and drag picks a block of the table's cells, a tap one cell on a finger. Contribution's
 *  chart row is no cell of the grid. */
function wireBlockSelect(table: HTMLElement | null, copy: (sel: TableSel) => string[][]): void {
  clearTableSel();
  if (!table) return;
  const cells = [...table.querySelectorAll<HTMLElement>(":scope > .rtrow:not(.dist)")].map((r) => [...r.children] as HTMLElement[]);
  let dragging = false;
  const start = (r: number, c: number): void => {
    dropPanel();
    clearBlock();
    clearTableSel();
    const box = table.appendChild(document.createElement("div"));
    box.className = "cellbox";
    tableSel = { table, cells, ar: r, ac: c, r0: r, r1: r, c0: c, c1: c, box, copy };
    aimTableSel(r, c);
  };
  table.addEventListener("pointerdown", (e) => {
    const at = cellAt(cells, (e.target as Element).closest(".c"));
    if (e.button !== 0 || !at) return;
    if (e.pointerType === "touch") {
      watchTouch(e, cells[at[0]]![at[1]]!, () => start(...at), () => start(...at));
      return;
    }
    e.preventDefault();
    table.setPointerCapture(e.pointerId);
    start(...at);
    dragging = true;
  });
  table.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const at = cellAt(cells, document.elementFromPoint(e.clientX, e.clientY)?.closest(".c") ?? null);
    if (at) aimTableSel(...at);
  });
  const end = (): void => { dragging = false; };
  table.addEventListener("pointerup", end);
  table.addEventListener("pointercancel", end);
}

// a press anywhere off the table puts its block down
addEventListener("pointerdown", (e) => {
  if (tableSel && !tableSel.table.contains(e.target as Node)) clearTableSel();
}, true);

/** Distribution's block as text rows: a member's column is two (each slice's name, then its share),
 *  a pie row as many lines as its longest pie, the label and the name on its first. */
function distCopy(sel: TableSel): string[][] {
  const out: string[][] = [];
  for (let r = sel.r0; r <= sel.r1; r++) {
    const row = sel.cells[r]!.slice(sel.c0, sel.c1 + 1);
    const slices = row.map((c) => (c.dataset.slices ? JSON.parse(c.dataset.slices) as [string, string][] : null));
    const n = Math.max(1, ...slices.map((s) => s?.length ?? 0));
    for (let i = 0; i < n; i++) {
      out.push(row.flatMap((c, k) => {
        const text = i ? "" : (c.textContent ?? "").trim();
        if (sel.c0 + k === 0) return [text];
        const s = slices[k];
        return s ? (s[i] ?? ["", ""]) : [text, ""];
      }));
    }
  }
  return out;
}

addEventListener("keydown", (e) => {
  if (!tableSel || e.key !== "c" || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const loose = getSelection();
  if (loose && !loose.isCollapsed) return;
  e.preventDefault();
  copyBlock(tableSel.copy(tableSel));
});

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
 *  time: the avg cells' total, the time its rows spent, and — off-tune being the one bar the whole team fills — what the
 *  block gained of it: each row's balance less the one it was entered on, added up, so the run
 *  reads from the balance standing before the block (0 at the top of the run) and the Tune Break
 *  that takes the whole bar drops out rather than reading as a loss across it. Energy generated
 *  adds up each row's own press's raw energy: no ER, multiplier or shared gain. A member's own concerto and forte are left to their columns; nothing else
 *  in the block earns a line,
 *  and a block with no line at all has no panel. An opened group's own row is left out where the
 *  block holds the rows it opened onto (`doubled`). */
function blockPanel(sel: CellSel): string {
  let dmg = 0, dmgCells = 0;
  let frames = 0, timeCells = 0;
  let gained = 0, tuneCells = 0, tuneDigits = 2;
  let energy = 0, energyCells = 0, energyDigits = 2;
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
      if (c.dataset.frames !== undefined) {
        frames += Number(c.dataset.frames) || 0;
        timeCells++;
        continue;
      }
      if (c.dataset.val === undefined) continue;
      const col = logColumns[[...c.parentElement!.children].indexOf(c)]!;
      // energy: each row's own unbuffed generation (`gen:energy`), its Liberation's spend left out
      if (col.key === "energy") {
        energy += Number(c.dataset.gen) || 0;
        energyDigits = col.digits ?? 2;
        energyCells++;
        continue;
      }
      if (col.key !== "offtune") continue;
      gained += (Number(c.dataset.val) || 0) - (Number(c.dataset.before) || 0);
      tuneDigits = col.digits ?? 2;
      tuneCells++;
    }
  }
  const lines: [string, string][] = dmgCells > 1 ? [["Total Dmg", fmt(dmg, 0)]] : [];
  if (timeCells > 1) lines.push(["Total Time", `${(frames / 60).toFixed(2)}s`]);
  if (energyCells) lines.push(["Total Energy", fmt(energy, energyDigits, true, false)]);
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
  /** Picked by a finger, which gives it the dot (`grabCellDot`). */
  touch: boolean;
  /** While the dot is dragged, the edges it sits on. */
  dot?: [number, number];
  /** The forte bar the press landed on: a block of that one cell is that bar alone. */
  bar?: HTMLElement;
}
/** Where a press landed: the rows and columns it found and its own cell among them. */
type CellAt = Pick<CellSel, "rows" | "cols" | "ar" | "ac">;

/** The block of cells a press ran over — a reading marker like the singled-out column, and the
 *  same one: taking either takes the other off. */
let cellSel: CellSel | null = null;
let cellSelBox: HTMLElement | null = null;
let cellSelDot: HTMLElement | null = null;
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
  cellSelDot?.remove();
  cellSelDot = null;
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
  // one forte bar picked out of its cell: the box covers that bar's own share, gap halves included
  const bar = barOf(sel);
  const g = bar ? rect(sel.grid) : null, b = bar ? rect(bar) : null;
  box.style.left = `${b ? b.left - g!.left - 3 : left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${b ? b.width + 6 : sel.cols[sel.c1]!.right - left}px`;
  box.style.height = `${rowSpan(sel, sel.r1, gridTop)[1] - top}px`;
  paintCellDot(sel, gridTop);
}

/* Edges for the dot, inside the grid: row edge `r` is row `r`'s top, column edge `c` column `c`'s left,
   the last of each the far side. */
const edgeTop = (sel: CellSel, r: number, gridTop: number): number =>
  (r < sel.rows.length ? rowSpan(sel, r, gridTop)[0] : rowSpan(sel, sel.rows.length - 1, gridTop)[1]);
const edgeLeft = (sel: CellSel, c: number): number =>
  (c < sel.cols.length ? sel.cols[c]!.left : sel.cols[sel.cols.length - 1]!.right);

/** A finger's block wears its dot on the corner being dragged, the bottom-right at rest. */
function paintCellDot(sel: CellSel, gridTop: number): void {
  if (!sel.touch) return;
  const dot = cellSelDot ?? (cellSelDot = makeDot(sel.grid, grabCellDot));
  const [r, c] = sel.dot ?? [sel.r1 + 1, sel.c1 + 1];
  dot.style.left = `${edgeLeft(sel, c)}px`;
  dot.style.top = `${edgeTop(sel, r, gridTop)}px`;
}

/** The edges nearest page point `x`/`y`, walked from the last row reached as `trackBlock` walks. */
function edgeAt(sel: CellSel, x: number, y: number): [number, number] {
  const g = rect(sel.grid);
  const at = y - g.top, n = sel.rows.length;
  let r = Math.min(Math.max(sel.fr, 0), n);
  while (r < n && edgeTop(sel, r + 1, g.top) <= at) r++;
  while (r > 0 && edgeTop(sel, r, g.top) > at) r--;
  if (r < n && edgeTop(sel, r + 1, g.top) - at < at - edgeTop(sel, r, g.top)) r++;
  sel.fr = Math.min(r, n - 1);
  let c = 0;
  for (let k = 1; k <= sel.cols.length; k++) if (Math.abs(edgeLeft(sel, k) - (x - g.left)) < Math.abs(edgeLeft(sel, c) - (x - g.left))) c = k;
  return [r, c];
}

/** The dot pressed: the block's far corner follows the finger. */
function grabCellDot(e: PointerEvent): void {
  const sel = cellSel;
  if (!sel) return;
  dropPanel();
  // groups may have opened since: the block's rows are found again by element
  const rows = [...sel.grid.querySelectorAll<HTMLElement>(".r:not(.head)")].filter((r) => r.offsetParent);
  const r0 = rows.indexOf(sel.rows[sel.r0]!), r1 = rows.indexOf(sel.rows[sel.r1]!);
  if (r0 < 0 || r1 < 0) {
    clearBlock();
    return;
  }
  Object.assign(sel, { rows, span: [], r0, r1, fr: r1 });
  grabDot(e, {
    grid: sel.grid,
    corners: () => [[sel.r0, sel.c0], [sel.r1 + 1, sel.c1 + 1]],
    edgeAt: (x, y) => edgeAt(sel, x, y),
    edgePoint: (r, c) => {
      const g = rect(sel.grid);
      return [g.left + edgeLeft(sel, c), g.top + edgeTop(sel, r, g.top)];
    },
    limits: () => [[0, 0], [sel.rows.length, sel.cols.length]],
    aim: (from, to) => {
      sel.dot = to;
      sel.ar = Math.min(from[0], to[0]);
      sel.ac = Math.min(from[1], to[1]);
      aimBlock(sel, Math.max(from[0], to[0]) - 1, Math.max(from[1], to[1]) - 1, rect(sel.grid).top);
      sel.fr = to[0];
    },
    done: () => {
      sel.dot = undefined;
      const gridTop = rect(sel.grid).top;
      paintCellDot(sel, gridTop);
      // the sum rides the block's bottom-right cell
      const html = sel.r0 === sel.r1 ? "" : blockPanel(sel);
      if (html) drivePanel(sel.rows[sel.r1]!.children[sel.cols[sel.c1]!.nth]!, html);
    },
  });
}

/** The forte bar a block of one cell stands for, if the press picked one out. */
const barOf = (sel: CellSel): HTMLElement | undefined =>
  (sel.bar && sel.r0 === sel.r1 && sel.c0 === sel.c1 && sel.r0 === sel.ar && sel.c0 === sel.ac ? sel.bar : undefined);

/** The block's own cells, a row of them at a time — a picked-out forte bar alone. */
function blockCells(sel: CellSel): HTMLElement[][] {
  const bar = barOf(sel);
  if (bar) return [[bar]];
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
  // a loop bar cannot end a block: the pointer over one reads as the row before it going down, after it going up
  if (sel.rows[row]!.classList.contains("loop")) row = Math.min(Math.max(row + (row > sel.ar ? -1 : 1), 0), sel.rows.length - 1);
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

/** A group's row is the label for its toggle, so a click anywhere along it would open the group:
 *  only its name does, and a click on a figure is left to that cell's panel alone. Capture, and on
 *  the window, so it still stands under `swallowClick`'s own stopPropagation. */
addEventListener("click", (e) => {
  const target = e.target as Element | null;
  if (target?.closest?.(".gridwrap .grid .chain > label.r") && !target.closest(".c.action")) e.preventDefault();
}, true);

/** A group's toggle keeps focus only when Tab walked to it: one a click focused would light its
 *  ring (`.tgl:focus-visible`) on the next key pressed — a Ctrl+C or a screenshot's shortcut. */
let tabbed = false;
addEventListener("keydown", (e) => {
  if (e.key === "Tab") tabbed = true;
}, true);
addEventListener("pointerdown", () => {
  tabbed = false;
}, true);
addEventListener("focusin", (e) => {
  const t = e.target as Element | null;
  if (!tabbed && t instanceof HTMLInputElement && t.matches(".gridwrap .tgl")) t.blur();
}, true);

/** A cell's text as copied: a cut's tag, drawn ahead of the action's name, follows it. */
function copyText(c: HTMLElement): string {
  const tag = c.querySelector(".ctag");
  const name = [...c.childNodes].filter((n) => n !== tag).map((n) => n.textContent ?? "").join("").replace(/[▸▾]/g, "").trim();
  return tag ? `${name} ${(tag.textContent ?? "").trim()}` : name;
}

/** Ctrl+C takes a copy of the block, a row to a line and a tab between columns — the figures as the
 *  table sets them, so what lands in a spreadsheet reads the way the log does. The block's column
 *  headings lead it as its first line. */
addEventListener("keydown", (e) => {
  if (!cellSel || e.key !== "c" || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const loose = getSelection();
  if (loose && !loose.isCollapsed) return;
  e.preventDefault();
  const sel = cellSel, head = sel.grid.querySelector<HTMLElement>(":scope > .r.head")!.children;
  const heads = barOf(sel) ? [head[sel.cols[sel.c0]!.nth] as HTMLElement] : sel.cols.slice(sel.c0, sel.c1 + 1).map((c) => head[c.nth] as HTMLElement);
  const rows = blockCells(sel).filter((row) => !row[0]?.parentElement?.classList.contains("loop")).map((row) => row.map(copyText));
  copyBlock([heads.map(copyText), ...rows]);
});

/** Pick a block of log cells with the table's gestures (cellpick.ts): a click or tap opens the cell's
 *  panel, a hold or drag is a block, whose sum (`blockPanel`) stands once the press lets go. */
function wireCellSelect(root: HTMLElement): void {
  clearBlock();
  holding = false;
  const grid = root.querySelector<HTMLElement>(".gridwrap .grid");
  if (!grid) return;
  /** When the mouse's press went down: a click or a hold. */
  let pressedAt = 0;
  /** The press went down on the cell whose panel stood: its click only closes it. */
  let closing = false;

  /** The log's rows and columns as a press finds them (a group may have opened), and its cell among them. */
  const measure = (cell: HTMLElement): CellAt | null => {
    const g = rect(grid);
    const cols = [...grid.querySelectorAll<HTMLElement>(":scope > .r.head > .c[data-col]")]
      .map((h, nth) => {
        const r = rect(h);
        return { key: h.dataset.col!, nth, left: r.left - g.left, right: r.right - g.left };
      })
      .sort((a, b) => a.left - b.left);
    const row = cell.closest<HTMLElement>(".r")!;
    // the heading is never in a block: a copy writes the headings on top itself
    const rows = [...grid.querySelectorAll<HTMLElement>(".r:not(.head)")].filter((r) => r.offsetParent);
    const ar = rows.indexOf(row);
    const ac = cols.findIndex((c) => c.nth === [...row.children].indexOf(cell));
    return ar < 0 || ac < 0 ? null : { rows, cols, ar, ac };
  };

  /** Pick the one cell `at` names, putting down any block or singled-out column. */
  const pick = (at: CellAt, touch: boolean, bar?: HTMLElement): void => {
    dropPanel();
    clearTableSel();
    selected = null;
    selBox?.remove();
    selBox = null;
    clearBlock();
    cellSel = { grid, ...at, span: [], fr: at.ar, r0: at.ar, r1: at.ar, c0: at.ac, c1: at.ac, touch, bar };
    aimBlock(cellSel, at.ar, at.ac, rect(grid).top);
  };

  const end = (): void => {
    flushTrack();
    if (!holding) return;
    holding = false;
    holdPanels(false);
    const sel = cellSel!;
    const one = sel.r0 === sel.r1 && sel.c0 === sel.c1;
    // a quick press that stayed on its cell was a click: it opens the cell's panel
    if (one && performance.now() - pressedAt < HOLD) {
      dropPanel();
      if (closing) swallowClick();
      return;
    }
    // a hold or a drag: its click would open a panel over the sum, or the group it set out from
    if (one) dropPanel();
    swallowClick();
  };

  grid.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement;
    const cell = target.closest<HTMLElement>(".r:not(.head):not(.loop) > .c");
    // a cut's tag box is a panel of its own, not the start of a block: left uncaptured, its click
    // lands on the tag rather than the cell
    // the ▾ is left uncaptured too, so its click reaches its label and closes the group
    if (e.button !== 0 || holding || !cell || target.closest(".ctag, .celldot, .uncaret")) return;
    const at = measure(cell);
    if (!at) return;
    // a forte cell holding two or more bars picks the one under the pointer
    const bar = cell.querySelectorAll(".rbar").length > 1 ? target.closest<HTMLElement>(".rbar:not(.empty)") ?? undefined : undefined;
    closing = panelOpenOn(cell);
    if (e.pointerType === "touch") {
      const tap = (): void => {
        pick(at, true, bar);
        // a tap's click comes after the finger lifts, so it is waited for as a long press's is
        if (closing) swallowClick(600);
      };
      watchTouch(e, cell, tap, () => pick(at, true, bar));
      return;
    }
    e.preventDefault();
    cell.setPointerCapture(e.pointerId);
    holdPanels(true);
    pressScale = zoom();
    px = e.clientX / pressScale;
    py = e.clientY / pressScale;
    pressedAt = performance.now();
    pick(at, false, bar);
    holding = true;
  });

  /** An open group's first row on screen, chain or field alike: a field's hits are scattered, so
   *  its rows are found by mark, and only those not inside a closed group count. */
  const firstRow = (tgl: HTMLInputElement): HTMLElement | undefined => {
    const rows = tgl.id.startsWith("fg")
      ? [...grid.querySelectorAll<HTMLElement>(`[data-fh="${tgl.id.slice(2)}"]`)].map((el) => el.matches(".r") ? el : el.querySelector<HTMLElement>(".r"))
      : [...tgl.parentElement!.querySelectorAll<HTMLElement>(":scope > .parts > .r")];
    return rows.find((r): r is HTMLElement => !!r?.offsetParent);
  };

  // every open group's first row on screen carries the ▾ that closes it, over the name cell's right side;
  // opening a group selects that row's name, closing it selects the group's own again
  grid.addEventListener("change", (e) => {
    const tgl = e.target as HTMLInputElement;
    if (!tgl.matches(".tgl")) return;
    grid.querySelectorAll(".uncaret").forEach((u) => u.remove());
    for (const open of grid.querySelectorAll<HTMLInputElement>(".tgl:checked")) {
      firstRow(open)?.querySelector(".c.action, .c.name")
        ?.insertAdjacentHTML("beforeend", `<label class="caret uncaret" for="${open.id}">▾</label>`);
    }
    const cell = tgl.checked
      ? grid.querySelector<HTMLElement>(`.uncaret[for="${tgl.id}"]`)?.parentElement ?? null
      : grid.querySelector<HTMLElement>(`label.r[for="${tgl.id}"] > .c.action`);
    const at = cell && measure(cell);
    if (at) pick(at, false);
  });

  grid.addEventListener("pointermove", (e) => {
    if (!holding || e.pointerType === "touch") return;
    px = e.clientX / pressScale;
    py = e.clientY / pressScale;
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
    // the columns this view hides keep their saved places; the shown ones fill their own slots in order
    const full = savedOrder(), shown = new Set(next);
    let j = 0;
    const merged = full.filter((k) => shown.has(k)).length === next.length ? full.map((k) => (shown.has(k) ? next[j++]! : k)) : [...next, ...full.filter((k) => !shown.has(k))];
    try { localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(merged)); } catch { /* no storage */ }
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

// the log's tabs, Full / Loop Rotation and Resources / Stats: the page drawn again with the other rows or columns
app.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(".rtab[data-log], .rtab[data-rot]");
  if (!btn || !shownKey) return;
  const log = btn.dataset.log as typeof logView | undefined, rot = btn.dataset.rot as typeof rotView | undefined;
  if ((log ?? logView) === logView && (rot ?? rotView) === rotView) return;
  logView = log ?? logView;
  rotView = rot ?? rotView;
  saveViews();
  // the page scrolls inside <main>, which the redraw replaces: carry its place across
  const y = app.querySelector("main")?.scrollTop ?? 0, x = app.querySelector("main")?.scrollLeft ?? 0;
  renderDetail(shownKey);
  app.querySelector("main")?.scrollTo(x, y);
});
