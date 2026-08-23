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
import { State, run, withTeam, equip, Resonator, Gear, Action, Loadout } from "./src/kit.js";
import type { ChainGroup, HeldBuff, ResolvedSnapshot } from "./src/kit.js";
import { damage, mvPercent, effectiveDef, effectiveRes, damageFactors } from "./src/damage.js";
import { buildReport, totalsBySlot, explain } from "./src/display.js";
import type { Report, Column, ReportRow, ReportPart, TraceEntry, InfoEntry } from "./src/display.js";
import { isPercent, statLabel } from "./src/stats.js";

import { QIUYUAN, QY_LOADOUT, QY_LOADOUT_MOONLIT, QY_ROTATION } from "./src/resonators/qiuyuan.js";
import { CANTARELLA, CA_LOADOUT, CA_ROTATION } from "./src/resonators/cantarella.js";
import { PHROLOVA, PH_LOADOUT, PH_OPENER, PH_LOOP } from "./src/resonators/phrolova.js";
import { SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP } from "./src/resonators/shorekeeper.js";
import { IUNO, IO_LOADOUT, IO_ROTATION } from "./src/resonators/iuno.js";
import { JINGRAN, JR_LOADOUT, JR_ROTATION } from "./src/resonators/jingran.js";
import { ZHEZHI, ZZ_LOADOUT_MOONLIT, ZZ_ROTATION } from "./src/resonators/zhezhi.js";
import { CARLOTTA, CL_LOADOUT, CL_ROTATION } from "./src/resonators/carlotta.js";
import { SIGRIKA, SR_LOADOUT, SR_ROTATION } from "./src/resonators/sigrika.js";
import { VERINA, VR_LOADOUT, VR_OPENER, VR_LOOP } from "./src/resonators/verina.js";
import { SANHUA, SH_LOADOUT, SH_ROTATION } from "./src/resonators/sanhua.js";
import { ROVER_HAVOC, RH_LOADOUT, RH_ROTATION } from "./src/resonators/rover_havoc.js";
import { ROCCIA, RC_LOADOUT, RC_LOADOUT_MOONLIT, RC_ROTATION } from "./src/resonators/roccia.js";
import { AUGUSTA, AG_LOADOUT, AG_ROTATION } from "./src/resonators/augusta.js";
import { LUPA, LP_LOADOUT, LP_OPENER, LP_LOOP } from "./src/resonators/lupa.js";
import { GALBRENA, GB_LOADOUT, GB_ROTATION, GB_ROTATION_ECHO_FOCUS } from "./src/resonators/galbrena.js";
import { BRANT, BR_LOADOUT, BR_ROTATION } from "./src/resonators/brant.js";
import { ENCORE, EN_LOADOUT, EN_ROTATION } from "./src/resonators/encore.js";
import { CHANGLI, CH_LOADOUT, CH_ROTATION } from "./src/resonators/changli.js";
import { DANJIN, DJ_LOADOUT, DJ_ROTATION } from "./src/resonators/danjin.js";
import { CAMELLYA, CM_LOADOUT, CM_ROTATION } from "./src/resonators/camellya.js";
import { MORTEFI, MO_LOADOUT, MO_ROTATION } from "./src/resonators/mortefi.js";
import { BULING, BL_LOADOUT, BL_OPENER, BL_ROTATION } from "./src/resonators/buling.js";
import { LUCILLA, LC_LOADOUT, LC_ROTATION } from "./src/resonators/lucilla.js";

/* ------------------------------------------------------------------------------------ teams */

interface Member {
  name: string;
  color: string;
  loadout: Loadout;
  opener: Action[];
  loop: Action[];
}

/** name/color both come straight off the resonator's own field — nothing here retypes them. */
const member = (resonator: Resonator, loadout: Loadout, opener: Action[], loop: Action[]): Member =>
  ({ name: resonator.name, color: resonator.color, loadout, opener, loop });

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
    member(ZHEZHI, ZZ_LOADOUT_MOONLIT, ZZ_ROTATION, ZZ_ROTATION),
    member(CARLOTTA, CL_LOADOUT, CL_ROTATION, CL_ROTATION),
  ],
  skQiuyuanSigrika: [
    member(SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP),
    member(QIUYUAN, QY_LOADOUT_MOONLIT, QY_ROTATION, QY_ROTATION),
    member(SIGRIKA, SR_LOADOUT, SR_ROTATION, SR_ROTATION),
  ],
  verinaSanhuaRover: [
    member(VERINA, VR_LOADOUT, VR_OPENER, VR_LOOP),
    member(SANHUA, SH_LOADOUT, SH_ROTATION, SH_ROTATION),
    member(ROVER_HAVOC, RH_LOADOUT, RH_ROTATION, RH_ROTATION),
  ],
  froloSkCanta: [
    member(PHROLOVA, PH_LOADOUT, PH_OPENER, PH_LOOP),
    // she's never the team's own lead here, so SK_LOOP covers both slots (see any non-leading
    // member's own rotation file for the same reasoning)
    member(SHOREKEEPER, SK_LOADOUT, SK_LOOP, SK_LOOP),
    member(CANTARELLA, CA_LOADOUT, CA_ROTATION, CA_ROTATION),
  ],
  froloRocciaCanta: [
    member(PHROLOVA, PH_LOADOUT, PH_OPENER, PH_LOOP),
    member(ROCCIA, RC_LOADOUT, RC_ROTATION, RC_ROTATION),
    member(CANTARELLA, CA_LOADOUT, CA_ROTATION, CA_ROTATION),
  ],
  skIunoAugusta: [
    member(SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP),
    member(IUNO, IO_LOADOUT, IO_ROTATION, IO_ROTATION),
    member(AUGUSTA, AG_LOADOUT, AG_ROTATION, AG_ROTATION),
  ],
  skQyGalbrena: [
    member(SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP),
    member(QIUYUAN, QY_LOADOUT_MOONLIT, QY_ROTATION, QY_ROTATION),
    member(GALBRENA, GB_LOADOUT, GB_ROTATION_ECHO_FOCUS, GB_ROTATION_ECHO_FOCUS),
  ],
  skLupaEncore: [
    member(SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP),
    // she's in the 2nd slot here, not leading, so LP_LOOP (which opens on her own Intro) covers
    // both — same shape as any other non-leading member's own opener
    member(LUPA, LP_LOADOUT, LP_LOOP, LP_LOOP),
    member(ENCORE, EN_LOADOUT, EN_ROTATION, EN_ROTATION),
  ],
  lupaBrantGalbrena: [
    // she leads here, so LP_OPENER (no Intro — she's already on field at combat start) covers
    // the opener, same shape as any other leading member's own opener
    member(LUPA, LP_LOADOUT, LP_OPENER, LP_LOOP),
    member(BRANT, BR_LOADOUT, BR_ROTATION, BR_ROTATION),
    member(GALBRENA, GB_LOADOUT, GB_ROTATION, GB_ROTATION),
  ],
  lupaBrantChangli: [
    member(LUPA, LP_LOADOUT, LP_OPENER, LP_LOOP),
    member(BRANT, BR_LOADOUT, BR_ROTATION, BR_ROTATION),
    member(CHANGLI, CH_LOADOUT, CH_ROTATION, CH_ROTATION),
  ],
  froloDanjinCanta: [
    member(PHROLOVA, PH_LOADOUT, PH_OPENER, PH_LOOP),
    member(DANJIN, DJ_LOADOUT, DJ_ROTATION, DJ_ROTATION),
    member(CANTARELLA, CA_LOADOUT, CA_ROTATION, CA_ROTATION),
  ],
  skRocciaCamellya: [
    member(SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP),
    member(ROCCIA, RC_LOADOUT_MOONLIT, RC_ROTATION, RC_ROTATION),
    member(CAMELLYA, CM_LOADOUT, CM_ROTATION, CM_ROTATION),
  ],
  skSanhuaCamellya: [
    member(SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP),
    member(SANHUA, SH_LOADOUT, SH_ROTATION, SH_ROTATION),
    member(CAMELLYA, CM_LOADOUT, CM_ROTATION, CM_ROTATION),
  ],
  lupaMortefiJingran: [
    member(LUPA, LP_LOADOUT, LP_OPENER, LP_LOOP),
    member(MORTEFI, MO_LOADOUT, MO_ROTATION, MO_ROTATION),
    member(JINGRAN, JR_LOADOUT, JR_ROTATION, JR_ROTATION),
  ],
  skMortefiAugusta: [
    member(SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP),
    member(MORTEFI, MO_LOADOUT, MO_ROTATION, MO_ROTATION),
    member(AUGUSTA, AG_LOADOUT, AG_ROTATION, AG_ROTATION),
  ],
  froloBulingCanta: [
    member(PHROLOVA, PH_LOADOUT, PH_OPENER, PH_LOOP),
    member(BULING, BL_LOADOUT, BL_ROTATION, BL_ROTATION),
    member(CANTARELLA, CA_LOADOUT, CA_ROTATION, CA_ROTATION),
  ],
  bulingZzCarlotta: [
    // she leads here, so BL_OPENER (no Intro — she's already on field at combat start) covers
    // the opener, same shape as any other leading member's own opener
    member(BULING, BL_LOADOUT, BL_OPENER, BL_ROTATION),
    member(ZHEZHI, ZZ_LOADOUT_MOONLIT, ZZ_ROTATION, ZZ_ROTATION),
    member(CARLOTTA, CL_LOADOUT, CL_ROTATION, CL_ROTATION),
  ],
  froloQyLucillaEcho: [
    member(PHROLOVA, PH_LOADOUT, PH_OPENER, PH_LOOP),
    member(QIUYUAN, QY_LOADOUT, QY_ROTATION, QY_ROTATION),
    member(LUCILLA, LC_LOADOUT, LC_ROTATION, LC_ROTATION),
  ],
  skLucillaSigrika: [
    member(SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP),
    member(LUCILLA, LC_LOADOUT, LC_ROTATION, LC_ROTATION),
    member(SIGRIKA, SR_LOADOUT, SR_ROTATION, SR_ROTATION),
  ],
  skLucillaGalbrena: [
    member(SHOREKEEPER, SK_LOADOUT, SK_OPENER, SK_LOOP),
    member(LUCILLA, LC_LOADOUT, LC_ROTATION, LC_ROTATION),
    // the echo-focus variant, same as skQyGalbrena — the one that actually casts Echo Skills for
    // Shorekeeper/Lucilla's own Echo Skill DMG buffs to land on
    member(GALBRENA, GB_LOADOUT, GB_ROTATION_ECHO_FOCUS, GB_ROTATION_ECHO_FOCUS),
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
  members: Member[];
  /** The 4 sections' own raw lines, in order [opener, loop 1, loop 2, loop 3] — what the
   *  comparison table's own damage-breakdown hover reads (concatenated + divided by 4 there, see
   *  `damagePopover`'s own divisor), and what `detailFor()` below builds the full report from
   *  without re-simulating anything. */
  rotationLines: ChainGroup[][];
  /** The comparison table's own figures: the plain mean across all 4 sections' own grand total /
   *  per-member total, each section weighted equally — see `runTeam()`'s own comment. */
  total: number;
  bySlot: Map<string, number>;
  /** The detail page's own rich report — every row's hover-trace panel data (`buildReport()`, see
   *  display.ts's own rowValues()/tracing()) — built once, the first time this team is actually
   *  opened, and cached here so revisiting it costs nothing. See `detailFor()`. */
  detail?: { report: Report; rotationReports: Report[] };
}

const toLine = (snap: ResolvedSnapshot): ChainGroup =>
  ({ id: snap.action.id, isChain: false, parts: [], snap, mv: mvPercent(snap), avg: damage(snap).avg });

/** One section's own grand total and per-member sum, read straight off its resolved lines — the
 *  same "no motion value means no damage" rule `display.ts`'s own rowValues() applies (`line.mv`
 *  is already `mvPercent(snap)`, from `toLine()` above), just without building a whole report to
 *  get there. */
function sumSection(lines: ChainGroup[]): { total: number; bySlot: Map<string, number> } {
  const bySlot = new Map<string, number>();
  let total = 0;
  for (const line of lines) {
    if (line.mv === 0) continue;
    const slot = (line.snap as ResolvedSnapshot).member;
    bySlot.set(slot, (bySlot.get(slot) ?? 0) + line.avg);
    total += line.avg;
  }
  return { total, bySlot };
}

function runTeam(members: Member[]): TeamRun {
  const state = new State(members.map((m) => m.name));
  members.forEach((m, i) => {
    state.active = i;
    withTeam(state, () => { for (const g of m.loadout.pieces()) equip(g, 1); });
  });
  state.active = 0;

  // Every member's opener runs first, in team order, then every member's loop, three times over
  // — matching how a real run actually goes: the whole team gets set up before anyone starts
  // repeating, and a loop-only buff/gauge that hasn't settled by the first pass (still ramping
  // up, or handed off from the opener) gets the two more passes it needs to reach steady state.
  const runPart = (rotation: Action[]): ChainGroup[] =>
    rotation.length ? run(state, rotation).map(toLine) : [];
  const rotationLines = [
    members.flatMap((m) => runPart(m.opener)),
    members.flatMap((m) => runPart(m.loop)),
    members.flatMap((m) => runPart(m.loop)),
    members.flatMap((m) => runPart(m.loop)),
  ];

  // The comparison table (not the detail page's own action table) only ever needs a grand total
  // and a per-member sum — the plain mean across these four sections rather than any one of them
  // alone, the opener counting exactly as much as a single loop pass. Read straight off the
  // resolved lines rather than through buildReport(), which also builds every row's own hover-
  // trace panel data purely for the detail page — the bulk of a team run's own cost, for data
  // this table never reads. See `detailFor()` below for where that actually gets built.
  let total = 0;
  const bySlot = new Map<string, number>();
  for (const lines of rotationLines) {
    const section = sumSection(lines);
    total += section.total / rotationLines.length;
    for (const [slot, v] of section.bySlot) bySlot.set(slot, (bySlot.get(slot) ?? 0) + v / rotationLines.length);
  }

  return { state, members, rotationLines, total, bySlot };
}

/** The detail page's own rich report, built only the first time a team is actually opened and
 *  cached on `run` so revisiting it is free — no re-simulation, just `buildReport()` over the
 *  lines `runTeam()` already resolved. */
function detailFor(run: TeamRun): { report: Report; rotationReports: Report[] } {
  if (run.detail) return run.detail;
  const rotationReports = run.rotationLines.map((lines) => buildReport(lines));
  const report = buildReport(run.rotationLines.flat());
  run.detail = { report, rotationReports };
  return run.detail;
}

/* --------------------------------------------------------------------- helpers */

const esc = (s: unknown): string => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmt = (v: number | string | null | undefined, digits = 0, pad = false): string =>
  typeof v === "number"
    ? v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: pad ? digits : 0 })
    : String(v ?? "");

// energy/concerto/offtune always show their own column's full digit count in the action table
// (2/2/4) rather than trimming trailing zeros the way every other column does.
const PAD_DIGITS_COLUMNS = new Set(["energy", "concerto", "offtune"]);

// mv and the three running resources get a dotted underline when a stat buff actually moved them
// this action, not just carried/declared their own usual trace (see ReportRow.buffed).
const BUFF_UNDERLINE_COLUMNS = new Set(["mv", "energy", "concerto", "offtune"]);

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

/** Sum one slot's own damage, grouped by whatever tag `keyOf` reads off each hit's own action.
 *  Every line here is a single action (this engine has no chain concept — see kit.ts's own
 *  `ChainGroup`), so it reads `line.snap` directly rather than iterating `parts`. `divisor`
 *  scales every bucket down after summing — the comparison table's own hover passes `lines`
 *  concatenated across all 4 sections (opener + 3 loops) and divides by 4, so each bucket reads
 *  as the same per-section average `total`/`grandTotal` already are, not a 4-section sum. */
function sumByTag(
  lines: ChainGroup[], slot: string, keyOf: (a: Action) => string | null, divisor = 1,
): Map<string, number> {
  const by = new Map<string, number>();
  for (const line of lines) {
    const snap = line.snap;
    if (snap.slot !== slot) continue;
    const key = keyOf(snap.action);
    if (key == null) continue;
    by.set(key, (by.get(key) ?? 0) + line.avg);
  }
  if (divisor !== 1) for (const [k, v] of by) by.set(k, v / divisor);
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

function damagePopover(
  lines: ChainGroup[], slot: string, total: number, grandTotal: number, divisor = 1,
): string {
  const body = breakdownSection("Node", sumByTag(lines, slot, (a) => a.node, divisor), total)
    + breakdownSection("Type", sumByTag(lines, slot, (a) => a.type, divisor), total)
    + breakdownSection("Type 2", sumByTag(lines, slot, (a) => a.type2, divisor), total);
  const pct = grandTotal ? Math.round((total / grandTotal) * 100) : 0;
  return `<span class="pop breakdown"><table>${body}`
    + `<tr class="sum"><td class="k">Total</td><td class="v">${fmt(total)} <span class="pct">(${pct}% of team)</span></td></tr>`
    + `</table></span>`;
}

/** A member's own equipped gear: both Inherent Skills, weapon, mainslot echo, sonata pieces,
 *  mainstat/substat rolls — everything but the resonator itself and its talents buff, which
 *  aren't "equipped gear" in the sense either popover below is showing. Shared so the comparison
 *  table's own gear popover and the rotation table's resonator popover (its own "Gear" section)
 *  read off the same list. Fixed order, one entry per `GEAR_LABELS` slot below — reads the
 *  Loadout's own named fields directly rather than filtering a flat array by position/name. */
function equippedGear(member: Member): Gear[] {
  const l = member.loadout;
  return [l.inherent1, l.inherent2, l.weapon, l.mainslot, l.sonata, l.sonata2pc, l.mainstat, l.substat];
}
const GEAR_LABELS = ["Inherent", "Inherent", "Weapon", "Mainslot", "Sonata", "2pc", "Mainstats", "Substats"];

/** A standardCharacter's own resonance chain nodes (see kit.ts's own doc comment on the flag) —
 *  up to six, named "<name> S<N>: <title>", listed in their own section below. */
function equippedSequences(member: Member): Gear[] {
  const l = member.loadout;
  return [l.sequence1, l.sequence2, l.sequence3, l.sequence4, l.sequence5, l.sequence6].filter((g): g is Gear => g != null);
}

/** The hover on a member's own name, in the comparison table: every piece of gear their loadout
 *  equips, each labelled by slot, with any sequence nodes listed the same way — full name, no
 *  splitting — after the core six, under a single "Sequences" label shared by the whole group:
 *  it sits in the first sequence row's own `.k` cell (S1's), and every row after it (S2-S6)
 *  leaves `.k` blank, same shape the core six's own label column already uses. `.k`/`.v` reused
 *  wholesale from the stat-trace panels (see index.css's own note by `.pop.gear`) — the label
 *  column's gray already matches those, and the browser's own table layout sizes both columns to
 *  their own longest cell with no extra CSS. */
function gearPopover(member: Member): string {
  const core = equippedGear(member);
  const sequences = equippedSequences(member);
  const body = core
    .map((g, i) => `<tr><td class="k">${esc(GEAR_LABELS[i] ?? "")}</td><td class="v">${esc(g.name)}</td></tr>`)
    .join("")
    + sequences
      .map((g, i) => `<tr><td class="k">${i === 0 ? "Sequences" : ""}</td><td class="v">${esc(g.name)}</td></tr>`)
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
      return `<div class="c num has">${fmt(total)}${damagePopover(run.rotationLines.flat(), slot, total, grand, 4)}</div>`;
    };

    return `<div class="trow" data-team="${esc(key)}" data-members="${esc(memberNames)}" data-maxseq="0">`
      + run.members.map(memberCell).join("")
      + `<div class="c num total gotodetail" data-team="${esc(key)}">${fmt(grand)}<span class="arrow">›</span></div>`
      + run.members.map((m) => dmgCell(m.name)).join("")
      + dmgCell(MISC)
      + `</div>`;
  }).join("");

  const head = `<div class="trow thead">`
    + `<div class="c">Member 1</div><div class="c">Member 2</div><div class="c">Member 3</div>`
    + `<div class="c num">Avg Total DPR</div>`
    + `<div class="c num">Avg DPR 1</div><div class="c num">Avg DPR 2</div><div class="c num">Avg DPR 3</div>`
    + `<div class="c num">Avg DPR Misc</div>`
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
    // a genuine stat buff moved this cell's own value, not just its usual carried/declared trace
    // (see display.ts's own ReportRow.buffed) — mv, and the three running resources
    if (BUFF_UNDERLINE_COLUMNS.has(col.key) && row.buffed.has(col.key)) cls.push("buffed");
    // an outro fired without a full 100-point concerto bar banked — never true off a non-outro
    // row, concertoSpent only ever moves on one (see display.ts's own rowValues())
    if (col.key === "concerto" && Number(row.raw.isOutro) && Number(row.raw.concertoSpent) < 100) {
      cls.push("underspent");
    }
    // a forte gauge that's gone negative — kit.ts's own forte gauges have no floor, so a kit
    // whose declared spend outruns what's actually held really can dip below 0 (see e.g.
    // Galbrena's own Purging Flame)
    if (col.key.startsWith("gauge:") && typeof v === "number" && v < 0) cls.push("negative");

    const text = esc(fmt(v, col.digits ?? 0, PAD_DIGITS_COLUMNS.has(col.key)))
      + (col.percent && typeof v === "number" ? "%" : "");
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

function page(run: TeamRun): string {
  const { report, rotationReports } = detailFor(run);
  const { members } = run;
  const slotHue = new Map([...members.map((m): [string, string] => [m.name, m.color]), [MISC, MISC_HUE]]);
  const gearByMember = new Map(members.map((m): [string, Gear[]] => [m.name, equippedGear(m)]));

  return `<main>
  ${rotationTable(report, slotHue, gearByMember)}
  ${summaryCards("opener", rotationReports[0]!, slotHue)}
  ${summaryCards("loop 1", rotationReports[1]!, slotHue)}
  ${summaryCards("loop 2", rotationReports[2]!, slotHue)}
  ${summaryCards("loop 3", rotationReports[3]!, slotHue)}
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
 *  already on screen before this module even parsed; this fills it in rather than replacing it.
 *
 *  The yield itself is throttled to roughly every 50ms of wall-clock work, not one per team —
 *  `runTeam()` now only computes the comparison table's own cheap numbers (see its own comment),
 *  a couple milliseconds a team, so yielding unconditionally would mean paint()'s own two-frame
 *  wait (~33ms) dominates the whole loop once there are hundreds of teams instead of a dozen. */
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
    let lastPaint = performance.now();
    for (let i = 0; i < teams.length; i++) {
      const [key, members] = teams[i]!;
      results.set(key, runTeam(members));
      progress(i + 1);
      const now = performance.now();
      if (now - lastPaint > 50) {
        await paint();
        lastPaint = performance.now();
      }
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
