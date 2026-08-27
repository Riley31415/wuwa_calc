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
 *
 * What lives where, since the build search no longer lives here: this file owns the `TEAMS` table
 * (expanded from teams.ts), the filter state, the routing and every last piece of rendering. The search itself and the engine
 * run that scores it are solver.ts, which is DOM-free precisely so a pool of Workers can run it —
 * that pass is ~97% of a cold load and every team in it is independent, so it goes wide (see
 * `ensureBestPicks()`, and solver.ts's own worker entry at the foot of it). Only the handful of
 * rows the table actually shows are run back here, because a `TeamRun` carries a whole `State` for
 * the detail page and none of that can cross a postMessage.
 */
import { Gear, Action, Stat, Attribute, Type1, Type2, scopedStat, menuStats } from "./engine/kit.js";
import { TUNE_BREAK_SLOT, TUNE_BREAK_HUE } from "./shared/tunebreak.js";
import type { ChainGroup, HeldBuff, ResolvedSnapshot, Loadout, EchoLoadout } from "./engine/kit.js";
import { buildReport, columnSources, columnOf } from "./engine/display.js";
import type { Report, Column, ReportRow, ReportPart, TraceEntry, InfoEntry } from "./engine/display.js";
import { Scaling, isPercent, statLabel, SCALING_NAME, TAG_NAME, NODE_NAME } from "./engine/stats.js";
import { member, comboOf, runTeam, eligibleWeapons, sequenceLevels, solveTeam, MAINSTAT_ROWS } from "./engine/solver.js";
import type { Member, Combo, Pick, Filters, TeamRun, Solved, SolveRequest, SolveResponse } from "./engine/solver.js";
import { loadoutName, LOADOUTS, ALL_TEAMS } from "./engine/teams.js";


/* ------------------------------------------------------------------------------------ teams */

/** Every team the page compares (teams.ts), keyed by its members' loadout names (`FROLO.QY.CANTA`)
 *  — a plain identifier with no dash, since a row's key is this plus its per-member combo keys
 *  (`expandTeam()`), and a team key never carries a dash of its own. */
const TEAMS: Record<string, Member[]> = Object.fromEntries(ALL_TEAMS.map(({ loadouts, dpsIndex }) => [
  loadouts.map(loadoutName).join("."),
  loadouts.map((l, i) => member(l, i === dpsIndex)),
]));

/** Which way a resonator has been filtered: `include` keeps only the teams that field them,
 *  `exclude` drops every team that does. */
type ResonatorFilter = "include" | "exclude";

/** Resonators filtered by name, set from their own name cell in the comparison table — left click
 *  to require one, right click to bar one (see the handlers in `boot()`) — and cleared again by
 *  clicking that name's own chip above the table (`resonatorChips()`). Like the filter boxes,
 *  this decides which rows are built rather than hiding rows afterwards, so a narrowed table
 *  never optimizes and runs teams nobody asked to see. Module-level so it survives a re-render.
 *
 *  Verina, both Rovers, Danjin, Encore and Jiyan start barred: legal slots on much of the table, so their
 *  rows multiply it while rarely being the pick anyone is comparing. Their chips bring them back. */
const resonatorFilters = new Map<string, ResonatorFilter>(
  [].map((name) => [name, "exclude"]),
);

/** Same idea as `resonatorFilters`, but by the weapon/echo/mainstat pick a row actually runs — set
 *  from that pick's own column in the comparison table rather than the member's name cell (see
 *  `optionCell()`/the handlers in `boot()`). These only ever hold anything while that axis's own
 *  Show ... Options box is open, since a closed axis has no column to click; unchecking a box
 *  clears its own map outright (see the `change` handler) rather than leaving a filter behind that
 *  can no longer be seen or cleared by clicking. */
const weaponFilters = new Map<string, ResonatorFilter>();
const echoFilters = new Map<string, ResonatorFilter>();
const mainstatFilters = new Map<string, ResonatorFilter>();
/** ...and by the chain length a row runs a resonator at ("Phrolova S5"), which is the one of these
 *  set from the *name* cell rather than a column of its own — sequences open rows, not a column
 *  (see `comparisonTable()`), so their name cell is the only thing on screen carrying the level.
 *  Only ever holds a level of 1 or more, and only for a resonator whose chain is a build choice:
 *  a `standardCharacter` only ever runs at full and S0 is just the resonator, so both go through
 *  `resonatorFilters` instead (see `sequenceTag()`). */
const sequenceFilters = new Map<string, ResonatorFilter>();

/** Every option-pick filter map, keyed by the `data-kind` its own column/chip carries — what the
 *  generic click handlers in `boot()` key off rather than one handler per axis. */
const OPTION_FILTER_MAPS = {
  weapon: weaponFilters, echo: echoFilters, mainstat: mainstatFilters, sequence: sequenceFilters,
} as const;
type OptionKind = keyof typeof OPTION_FILTER_MAPS;

const filters: Filters = {
  mdpsSequences: false, supportSequences: false,
  mdpsWeapons: false, supportWeapons: false,
  mdpsEchoes: false, supportEchoes: false,
  mdpsMainstats: false, supportMainstats: false,
  allowR1Mdps: true, allowR1Supports: true,
};

/** The whole table's own row-count ceiling: with weapon/echo/mainstat now crossed in full rather
 *  than varied one at a time (see `expandTeam()`'s own doc comment), a couple of boxes checked
 *  together on the wrong team can reach into the hundreds of thousands of rows — more than the
 *  page could solve, run or render in any reasonable time. Every filter change is costed against
 *  it first (`withRowCap()`, off `prospectiveRows()` — no solve needed to know), and one that
 *  would cross it is put straight back and warned about (`rowCapWarning()`) rather than letting
 *  the page try and hang. A `#`-link's own filters are the one way in that isn't costed: it names
 *  a state to restore, not a change to approve. */
const ROW_CAP = 1_000;

/** Show/clear the row-cap warning banner (`comparisonFilters()`'s own `#rowCapWarning`) directly,
 *  with no re-render: a refused checkbox change touches no state `refresh()` would need to redraw
 *  anything for, so the banner is the only thing on screen that has to move. */
function rowCapWarning(total: number | null): void {
  const el = document.getElementById("rowCapWarning");
  if (!el) return;
  el.hidden = total === null;
  if (total !== null) el.textContent = `That would open ${fmt(total)} rows — over the ${fmt(ROW_CAP)} cap. Pick fewer options to compare at once, or narrow the resonator filters first.`;
}

const bestPicks = new Map<string, Solved>();
// ...under the whole filter state, not just the R1 allowances: a solve now carries every row the
// table will open for that team, each re-rolled onto its own best main stats (solver.ts's own
// `rowPicks()`), and which rows those are is exactly what the option boxes decide.
const bestKey = (teamKey: string): string =>
  `${teamKey}|${Object.values(filters).join(",")}`;

/** File one solved team's own answer away — whether it was solved in a worker or on this thread,
 *  it's the same plain indices either way (see solver.ts's own `SolveResponse`). */
function storeSolved(teamKey: string, solved: Solved): void {
  bestPicks.set(bestKey(teamKey), solved);
}

/** One team, run under one specific combo for every member — the comparison table's own row unit
 *  (see the "one row per combo" spec). `key` stays plain alphanumerics/dots/dashes so it drops
 *  straight into `location.hash` with no encoding. */
interface TeamRow { key: string; teamKey: string; members: Member[]; combo: Combo[]; }

/**
 * One team's own rows: every combo the currently open weapon/echo/mainstat boxes reach, crossed in
 * full — a member with more than one open axis gets the full cross of those, and members are
 * crossed against each other the same way, not "one member varies while the rest sits at its best
 * pick" any more. A closed axis still just shows that member's own best pick — `optimizeTeam()`'s
 * own search already covers every echo/mainstat regardless of what the boxes say, and every weapon
 * a role may hold once its own box is open — so nothing here loses the "best build" baseline; only
 * the *open* axes stop being pinned to one row apiece and become every option, on every member, all
 * crossed together. A team whose own best picks were never found (its weapon list is empty under
 * the current R1 rule) has no rows at all.
 *
 * This can get big fast — a team with two damage dealers each on 51 weapons and 9 main stats fully
 * crossed is 51 × 9 × 51 × 9 ≈ 211,000 rows — which is exactly why every filter change is refused
 * before it lands if it would push the *whole table's* row count past `ROW_CAP` (see
 * `withRowCap()`), rather than silently trying to run it.
 */
/** Whether a team survives the resonator filters: it must field every included name — requiring
 *  two asks for teams that play both together, not teams that play either — and none of the
 *  excluded ones. Nothing filtered lets every team through. */
const teamWanted = (members: Member[]): boolean =>
  [...resonatorFilters].every(([name, mode]) =>
    members.some((m) => m.name === name) === (mode === "include"));

/** What a member's own echo pick reads as — shared between the comparison table's own Echo column
 *  and the option filters that key off it, so a click and its own filter target the same string.
 *  The mainslot only joins the label when this loadout has another echo option sharing the same
 *  sonata but a different mainslot (see CLAUDE.md's own note on the wording of echo comparisons) —
 *  otherwise the sonata alone already tells every option apart. */
function echoLabel(l: Loadout, echo: EchoLoadout): string {
  const showMainslot = l.echoLoadouts.some((e) => e.sonata === echo.sonata && e.mainslot !== echo.mainslot);
  return [echo.sonata, showMainslot ? echo.mainslot : null]
    .filter((g): g is Gear => g != null).map((g) => g.name).filter(Boolean).join(" + ");
}

/** What a row filters as at one member position when their chain length is a build choice being
 *  shown — "Phrolova S5" — and nothing at all otherwise. S0 is the resonator with no chain, and a
 *  `standardCharacter`'s comes with the character rather than being compared, so both of those are
 *  the plain resonator filter's business; so is any position whose own Sequences box is shut, since
 *  then every row runs the one level and a filter on it would say nothing. */
function sequenceTagAt(m: Member, sequence: number, f: Filters = filters): string | null {
  const open = f[m.mainDps ? "mdpsSequences" : "supportSequences"];
  if (!open || m.loadout.resonator.standardCharacter || sequence < 1) return null;
  return `${m.name} S${sequence}`;
}
const sequenceTag = (m: Member, combo: Combo): string | null => sequenceTagAt(m, combo.sequence);

/** Whether a row survives the weapon/echo/mainstat option filters — same shape as `teamWanted()`,
 *  but per row rather than per team composition: the pick these key off only exists once a row's
 *  own combo is known. */
function rowWanted(row: TeamRow): boolean {
  const named = (map: Map<string, ResonatorFilter>, names: string[]): boolean =>
    [...map].every(([name, mode]) => names.includes(name) === (mode === "include"));
  return named(weaponFilters, row.combo.map((c) => c.weapon.name))
    && named(echoFilters, row.combo.map((c, i) => echoLabel(row.members[i]!.loadout, c.echo)))
    && named(mainstatFilters, row.combo.map((c) => c.mainstat.name))
    && named(sequenceFilters, row.combo.flatMap((c, i) => sequenceTag(row.members[i]!, c) ?? []));
}

/**
 * One team's own rows: every combo its solve opened for it (solver.ts's own `rowPicks()`), turned
 * into real gear and filtered down to what the resonator/weapon/echo/mainstat filters still want.
 *
 * Every open weapon/echo/mainstat box is crossed in full there — a member with more than one open
 * axis gets the full cross of those, and members are crossed against each other the same way,
 * rather than "one member varies while the rest sits at its best". A closed axis contributes the
 * one pick that team's search settled on, and a main-stat axis that is closed is re-rolled per row
 * so a worse weapon is judged wearing the rolls it actually wants, not the winner's.
 */
function expandTeam(teamKey: string, members: Member[]): TeamRow[] {
  const solved = bestPicks.get(bestKey(teamKey));
  if (!solved || !teamWanted(members)) return [];

  // keyed, since a sequence variation can reproduce a combo the cross already made, and two rows
  // whose own axes differ only where a closed one sits can settle onto the same main stats
  const rows = new Map<string, TeamRow>();
  for (const picks of solved.rows) {
    const combo = picks.map((p: Pick, i: number) => comboOf(members[i]!.loadout, p));
    const key = `${teamKey}-${combo.map((c: Combo) => c.key).join("-")}`;
    if (!rows.has(key)) rows.set(key, { key, teamKey, members, combo });
  }

  return [...rows.values()].filter(rowWanted);
}

/** Every row the table should show right now, across every team. */
const teamRows = (): TeamRow[] => Object.entries(TEAMS).flatMap(([key, members]) => expandTeam(key, members));

/**
 * How many ways one axis can be filled across a team, under that axis's own option filters — the
 * per-member candidate *names* in, the number of surviving whole-team combinations out. `null` for
 * a member whose box is closed: that's one pick, and which one isn't known until the team is
 * solved, so no name-level filter can be applied to it.
 *
 * Excludes are per member and exact — a barred name is simply not a candidate. An include is a
 * whole-row condition (the name must appear on *someone*), so it's counted by inclusion-exclusion
 * over the included names. Both are dropped, and the plain product taken instead, wherever a name
 * can't be tested — a closed box's unknown pick, or a list longer than `cap` where which entries
 * survive isn't known until each build is scored (main stats, see solver.ts's own `rowPicks()`).
 * Dropping them can only overcount, which is the safe direction for a cap.
 */
function axisWays(
  lists: (string[] | null)[], map: Map<string, ResonatorFilter>, cap = Infinity,
): number {
  const excluded = [...map].filter(([, mode]) => mode === "exclude").map(([n]) => n);
  const sizes = (drop: string[]): number[] =>
    lists.map((l) => (l === null ? 1 : l.filter((n) => !drop.includes(n)).length));
  const product = (drop: string[]): number =>
    sizes(drop).reduce((p, n) => p * Math.min(cap, n), 1);

  const untestable = lists.includes(null) || sizes(excluded).some((n) => n > cap);
  const included = untestable ? [] : [...map].filter(([, mode]) => mode === "include").map(([n]) => n);
  let total = 0;
  for (let mask = 0; mask < (1 << included.length); mask++) {
    const banned = included.filter((_, k) => mask & (1 << k));
    total += (banned.length % 2 ? -1 : 1) * product([...excluded, ...banned]);
  }
  return total;
}

/** How many rows `expandTeam()` will end up building for this team, without solving it first — the
 *  full team-wide cross of every open axis's own candidates, filtered by that axis's own option
 *  filters (see `axisWays()`/`rowWanted()`), plus the sequence variations' own row apiece
 *  (additive, since those aren't crossed in — see `expandTeam()`). Needs no solved build to know,
 *  since every count here is a candidate *count*, not which index is "best" — lets the progress
 *  bar's true total, and the row-cap check in `boot()`, both be known before a single team is
 *  solved, under a hypothetical filter state as easily as the real one (`f` defaults to it but a
 *  caller can pass one that hasn't been committed yet — see `ROW_CAP`). */
function estimatedRowCount(members: Member[], f: Filters = filters): number {
  const openFor = (m: Member, mdpsKey: keyof Filters, supportKey: keyof Filters): boolean =>
    f[m.mainDps ? mdpsKey : supportKey];
  const crossed =
    axisWays(members.map((m) => (openFor(m, "mdpsWeapons", "supportWeapons")
      ? eligibleWeapons(m, f).map((i) => m.loadout.weapons[i]!.name) : null)), weaponFilters)
    * axisWays(members.map((m) => (openFor(m, "mdpsEchoes", "supportEchoes")
      ? m.loadout.echoLoadouts.map((e) => echoLabel(m.loadout, e)) : null)), echoFilters)
    // an open box shows the best few rolls for each build, not the whole list (solver.ts's own
    // `rowPicks()`) — the count has to match, since this is what the row cap is checked against
    * axisWays(members.map((m) => (openFor(m, "mdpsMainstats", "supportMainstats")
      ? m.loadout.mainstats.map((g) => g.name) : null)), mainstatFilters, MAINSTAT_ROWS);
  // The sequence filter isn't an axis of the cross — a level opens a row of its own instead (see
  // `expandTeam()`) — so it's counted here, row by row: the cross runs every member at the level a
  // closed box would show (S0 for anyone whose chain is a choice), which carries no tag at all, and
  // each extra row carries the one tag of the member whose level it moved.
  const wantsTags = (tags: string[]): boolean =>
    [...sequenceFilters].every(([name, mode]) => tags.includes(name) === (mode === "include"));
  const sequenceExtra = members.reduce((sum, m) => sum + sequenceLevels(m, f).slice(1)
    .filter((level) => wantsTags([sequenceTagAt(m, level, f)].filter((t): t is string => t !== null)))
    .length, 0);
  return (wantsTags([]) ? crossed : 0) + sequenceExtra;
}

/** The whole table's own prospective row count, under whatever filter state is live right now (or
 *  a tentative `f` that hasn't been committed) — every team the resonator filters still want, each
 *  costed by `estimatedRowCount()`. What `ROW_CAP` is checked against. */
function prospectiveRows(f: Filters = filters): number {
  return Object.entries(TEAMS)
    .filter(([, members]) => teamWanted(members))
    .reduce((sum, [, members]) => sum + estimatedRowCount(members, f), 0);
}

/**
 * Commit one filter change, or refuse it because of the table it would open.
 *
 * Every way to change a filter goes through here — an option box, a resonator name, a gear pick,
 * a chip being cleared — because every one of them can raise the row count as easily as lower it:
 * a box opens an axis, but so does *closing* one that was holding gear filters (they're cleared
 * with it), and clearing an include widens the table by exactly as much as setting it narrowed it.
 * Costed with no solve behind it, so a refusal is instant (see `estimatedRowCount()`).
 *
 * `change` mutates the live filter state and hands back the thunk that puts it back, which is what
 * runs on a refusal — the state and the table are then exactly as they were.
 */
function withRowCap(change: () => () => void): void {
  const undo = change();
  const total = prospectiveRows();
  if (total > ROW_CAP) {
    undo();
    rowCapWarning(total);
    return;
  }
  rowCapWarning(null);
  syncHash();
  void refresh();
}

/**
 * Rebuild one row straight from its own key, with no optimizer pass behind it. `expandTeam()`
 * names a row after its team plus every member's own gear indices (see `comboOf()`), and those
 * indices are the whole of what running it takes — so a `#team=...` link can open its detail page
 * without the table's own "optimize every team, then run every row that opened" pass, which is
 * answering a question a direct link never asked. A team key is a plain identifier with no dash
 * in it, so splitting on dashes separates it from the per-member combo keys cleanly.
 *
 * `null` if the key names a team, member count or gear index that isn't there any more, so a
 * stale bookmark falls back to the table instead of throwing.
 */
function rowFromKey(key: string): TeamRow | null {
  const [teamKey, ...comboKeys] = key.split("-");
  if (!teamKey) return null;
  const members = TEAMS[teamKey];
  if (!members || comboKeys.length !== members.length) return null;

  const combo: Combo[] = [];
  for (let i = 0; i < members.length; i++) {
    const parsed = /^(\d+)\.(\d+)\.(\d+)\.s(\d+)$/.exec(comboKeys[i]!);
    if (!parsed) return null;
    const l = members[i]!.loadout;
    const pick: Pick = { weapon: +parsed[1]!, echo: +parsed[2]!, mainstat: +parsed[3]!, sequence: +parsed[4]! };
    if (!l.weapons[pick.weapon] || !l.echoLoadouts[pick.echo] || !l.mainstats[pick.mainstat]) return null;
    combo.push(comboOf(l, pick));
  }
  return { key, teamKey, members, combo };
}

/** Every resonator's own colour, by name — read off the loadout registry so a chip can be painted
 *  for anyone on the roster, not just whoever a currently-visible team happens to field. */
const RESONATOR_HUE = new Map(
  Object.values(LOADOUTS).map((l) => [l.resonator.name, l.resonator.color] as const),
);

const FALLBACK_HUE = "#ff0000";

/** Kill switch for the resonator popover's "Gear" section — off for now, kept as a single flag
 *  rather than ripping the section's own code out, so turning it back on later is a one-line
 *  flip (see `buffsPopover`'s own use of this). */
const GEAR_SECTION_ENABLED = false;

/* ------------------------------------------------------------------ the engine */

/** The detail page's own rich report, built only the first time a team is actually opened and
 *  cached on `run` so revisiting it is free.
 *
 *  The comparison table's own pass runs untraced and keeps no lines (see `TeamRun.rotationLines`),
 *  which is what makes thousands of combos affordable — so opening one re-runs that single team
 *  with tracing on to get them back. One team run costs a couple of milliseconds against the
 *  thousands the table already did, and it is deterministic: same loadouts, same rotations, same
 *  numbers. */
function detailFor(run: TeamRun): { report: Report } {
  if (run.detail) return run.detail;
  const lines = run.rotationLines
    ?? runTeam(run.teamKey, run.members, run.combo, true).rotationLines!;
  run.rotationLines = lines;
  run.detail = { report: buildReport(lines.flat()) };
  return run.detail;
}

/* --------------------------------------------------------------------- helpers */

const esc = (s: unknown): string => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** @param group  thousands separators — off for the action table's own rows, whose columns sit
 *  tight against one another (see display.ts's own `num`, which sizes them). */
const fmt = (v: number | string | null | undefined, digits = 0, pad = false, group = true): string =>
  typeof v === "number"
    ? v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: pad ? digits : 0, useGrouping: group })
    : String(v ?? "");

// Columns that always show their own full digit count in the action table rather than trimming
// trailing zeros the way the rest do — the running resources at their own precision (2/2/4), mv,
// and every stat column from dmg% through shred. Mirrors display.ts's own set of the same name.
const PAD_DIGITS_COLUMNS = new Set([
  "energy", "concerto", "offtune",
  "mv", "dmgBonus", "amp", "cr", "cd", "dealt", "effDef",
]);

// The one column that keeps its thousands separators — the figure the whole row is for, and the
// only one long enough to need them. See display.ts's own set of the same name.
const GROUPED_COLUMNS = new Set(["avg"]);

// mv and the three running resources get a dotted underline when a stat buff actually moved them
// this action, not just carried/declared their own usual trace (see ReportRow.buffed).
const BUFF_UNDERLINE_COLUMNS = new Set(["mv", "energy", "concerto", "offtune"]);

/** One grid track. Columns carry a character `width` (the report also prints to a terminal), so
 *  a track is that count scaled by the CSS --cw, plus the cell's own padding — and, on the two
 *  outermost columns, the extra `--lead` index.css pads them by, so the widened cell doesn't
 *  simply eat into the characters it was sized for. */
const colWidth = (c: Column, i: number, last: number): string => {
  const base = `var(--cw) * ${c.width} + var(--cpad)`;
  return i === 0 || i === last ? `calc(${base} + var(--lead))` : `calc(${base})`;
};

function cell(columns: Column[], index: number, { cls = [], html = "", style = "" }: { cls?: string[]; html?: string; style?: string }): string {
  const classes = ["c", columns[index]!.align === "left" ? "" : "num", ...cls].filter(Boolean).join(" ");
  return `<span class="${classes}"${style ? ` style="${style}"` : ""}>${html}</span>`;
}

/** A hover panel, parked in a `<template>` rather than built into the page.
 *
 *  One detail page carries ~5,900 of these between them, and a comparison row's own Total DPR
 *  panel is a whole nested table — together tens of thousands of nodes that exist only for the
 *  handful a person ever hovers. `display: none` still costs: the nodes are parsed, styled and
 *  kept alive, and every hover-driven restyle while scrolling walks past them. A template's
 *  content is a separate inert fragment: not rendered, not styled, not laid out, not matched by
 *  selectors. `wireSourcePanels` swaps one in for the real thing the first time its cell is
 *  hovered, so only panels somebody actually opens ever reach the document. */
const lazyPop = (html: string): string => (html ? `<template class="pop-src">${html}</template>` : "");

/** Every source that fed one value, revealed on hover. */
const unit = (r: TraceEntry): string => ((r.percent ?? (r.stat !== undefined ? isPercent(r.stat) : false)) ? "%" : "");

const SECTION_ORDER = ["base", "bonus", "flat"];
const SECTION_RANK = (key: string | null): number => {
  if (key === null) return -1;
  const word = key.split(" ")[0]!.toLowerCase();
  const i = SECTION_ORDER.indexOf(word);
  return i === -1 ? SECTION_ORDER.length + 1 : i;
};

const panelRow = (r: TraceEntry, slotHue: Map<string, string>, { noSource = false }: { noSource?: boolean } = {}): string => {
  const own = r.owner !== undefined ? (slotHue.get(r.owner ?? "") ?? TUNE_BREAK_HUE) : null;
  const label = r.label ?? (r.stat !== undefined ? statLabel(r.stat) : "");
  const value = `<td class="v">${r.mult ? `&times;${fmt(r.value, r.digits ?? 4)}` : `${fmt(r.value, r.digits ?? 4)}${unit(r)}`}</td>`;
  // Two columns, never three. The damage panel has no source of its own, so its left column is the
  // label ("Motion Value"); every other panel dropped the stat column it used to carry — the
  // heading over the group names the stat now (see `popover()`), and repeating it down every row
  // was the same word twenty times. A row with no source of its own falls back to that label,
  // which is the whole of what the atk panel's own "Relative" row is.
  // A summary row (display.ts's own `Relative`) is not a contribution, so it reads as the panel's
  // Total does — the same rule above it and the same weight, its label in the left column.
  if (r.summary) return `<tr class="sum"><td class="k">${esc(label)}</td>${value}</tr>`;
  return noSource
    ? `<tr><td class="k">${esc(label)}</td>${value}</tr>`
    : `<tr><td class="s"${own ? ` style="--own:${own}"` : ""}>${esc(r.source || label)}</td>${value}</tr>`;
};

function popover(col: Column, rows: TraceEntry[] | undefined, total: number | string | null | undefined, slotHue: Map<string, string>, suffix = ""): string {
  // An empty list is still a panel — a heading and the value itself, which is what a column
  // nothing is feeding (0% amplification, an unbuffed crit rate) has to say. Only a column that
  // was never traced at all (`undefined`) has no panel; see display.ts's own `rowValues()`.
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

  // A group is its heading and its rows, and nothing else: no subtotal under any of them. An
  // unsectioned group heads with the column's own written-out name (display.ts's `Column.full`),
  // a sectioned one with its own — the same small caps either way.
  const body = sections.map(({ key, rows: group }) =>
    `<tr class="sec"><td colspan="2">${esc(key ?? col.full ?? col.label)}</td></tr>`
    + group.map(row).join("")).join("");
  // A panel whose every row sits below the total (an unshredded resistance, whose only row is the
  // factor itself) still opens with the column's own name — the heading is what says which column
  // is being explained, and it can't come from a group that isn't there.
  const titled = sections.length ? body : `<tr class="sec"><td colspan="2">${esc(col.full ?? col.label)}</td></tr>`;

  // the damage panel's own figures read left-aligned (see index.css) — every row of it is a
  // multiplier rather than an amount, and flush-right pushes the `x` signs apart
  // a column that owns no total of its own (display.ts's own `Column.noTotal`) ends on its last
  // section instead — see there for why off-tune is one
  const sum = `<tr class="sum"><td class="k">Total</td>`
    + `<td class="v">${fmt(total, col.digits ?? 0)}${col.percent ? "%" : ""}${esc(suffix)}</td></tr>`;
  return lazyPop(`<span class="pop${col.key === "avg" ? " damage" : ""}"><table>${titled}`
    + `${before.map(row).join("")}${sum}${after.map(row).join("")}</table></span>`);
}

function infoPopover(info: InfoEntry[] | undefined, slotHue: Map<string, string>): string {
  if (!info?.length) return "";
  const rows = info.map((e) => {
    // a `source` row is a name, not a field: it takes the `.s` cell across both columns, the same
    // full-strength colour-barred column every stat panel and the resonator popover put their own
    // sources in (see `buffsPopover`), so "what triggered this" reads the way every other
    // attributed name on the page does
    if (e.source !== undefined) {
      const hue = slotHue.get(e.source) ?? TUNE_BREAK_HUE;
      return `<tr><td class="s" colspan="2" style="--own:${hue}">${esc(e.label)}</td></tr>`;
    }
    return `<tr><td class="k">${esc(e.label)}</td><td class="v">${esc(e.value)}</td></tr>`;
  }).join("");
  return lazyPop(`<span class="pop info"><table>${rows}</table></span>`);
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
      + sorted(buffs).map((b) => row(b.name, slotHue.get(b.source) ?? TUNE_BREAK_HUE)).join("")
    : "");
  return lazyPop(`<span class="pop buffs"><table>`
    + `${gearSection}${section("Local buffs", local)}${section("Global buffs", global)}${section("Enemy debuffs", enemy)}</table></span>`);
}

/* -------------------------------------------------------------- comparison table */

/** Sum one slot's own damage, grouped by whatever tag `keyOf` reads off each hit's own action —
 *  `slot: null` includes every slot instead (the DPR table's own Total row, which has no one
 *  member to filter to). Every line here is a single action (this engine has no chain concept —
 *  see kit.ts's own `ChainGroup`), so it reads `line.snap` directly rather than iterating `parts`.
 *
 *  A folded ActionGroup row is the one line that is more than one cast, so it is read through its
 *  own members rather than off the row: the row's action is only the group's *last* cast, and
 *  filing three basics' worth of damage under whatever that one happened to be would misreport the
 *  split the moment a group mixes types. Its follow-ups are lines of their own (`spill`) and are
 *  counted there, so only the members are walked here. */
function sumByTag(
  lines: ChainGroup[], slot: string, keyOf: (a: Action) => number | null,
): Map<number, number> {
  const by = new Map<number, number>();
  const add = (snap: ResolvedSnapshot, avg: number) => {
    if (snap.slot !== slot) return;
    const key = keyOf(snap.action);
    if (key == null) return;
    by.set(key, (by.get(key) ?? 0) + avg);
  };
  for (const line of lines) {
    if (!line.isChain) { add(line.snap, line.avg); continue; }
    const members = new Set(line.members ?? []);
    for (const p of line.parts) if (members.has(p.snap)) add(p.snap, p.dmg.avg);
  }
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

/** The seven action names that contributed most to one damage value, each with how many casts of it
 *  landed in the span — the same folded-group rule as `sumByTag()`: a group's members are its real
 *  casts, so they are what gets counted, not the row's own last action. */
function actionSection(lines: ChainGroup[], slot: string, total: number): string {
  const by = new Map<string, { dmg: number; n: number }>();
  const add = (snap: ResolvedSnapshot, avg: number) => {
    if (snap.slot !== slot) return;
    const cur = by.get(snap.action.name) ?? { dmg: 0, n: 0 };
    cur.dmg += avg; cur.n++;
    by.set(snap.action.name, cur);
  };
  for (const line of lines) {
    if (!line.isChain) { add(line.snap, line.avg); continue; }
    // `members`, not "the parts that belong to an ActionGroup": a folded run of one repeated
    // follow-up is a group too and its members carry no ActionGroup at all, so testing for one
    // dropped every Glacio Chafe rung and every Fine Snow off this list entirely. The row's own
    // name never appears here either way — a group is named for the run, not for a cast.
    const members = new Set(line.members ?? []);
    for (const p of line.parts) if (members.has(p.snap)) add(p.snap, p.dmg.avg);
  }
  if (!by.size) return "";
  const rows = [...by].sort((a, b) => b[1].dmg - a[1].dmg).slice(0, 7).map(([name, v]) => {
    const pct = total ? Math.round((v.dmg / total) * 100) : 0;
    return `<tr><td class="k">${esc(name)} x${v.n}</td>`
      + `<td class="v">${fmt(v.dmg)} <span class="pct">(${pct}%)</span></td></tr>`;
  }).join("");
  return `<tr class="sec"><td colspan="2">Actions</td></tr>${rows}`;
}

/** Node/Type/Type2 breakdown for one damage value — `slot: null` for a row with no one member to
 *  filter to (a Tune Break or Total row). */
function damagePopover(
  lines: ChainGroup[], slot: string, total: number, grandTotal: number,
): string {
  const tagName = (k: number) => TAG_NAME[k as keyof typeof TAG_NAME];
  const body = breakdownSection("Node", sumByTag(lines, slot, (a) => a.node), total, (k) => NODE_NAME[k as keyof typeof NODE_NAME])
    + breakdownSection("Type", sumByTag(lines, slot, (a) => a.type), total, tagName)
    + breakdownSection("Type 2", sumByTag(lines, slot, (a) => a.type2), total, tagName);
  const pct = grandTotal ? Math.round((total / grandTotal) * 100) : 0;
  // the Actions list is a table of its own so an action name — far longer than any tag above it —
  // sizes only its own label column and leaves the tag sections' widths alone
  return lazyPop(`<span class="pop breakdown"><table>${body}`
    + `<tr class="sum"><td class="k">Total</td><td class="v">${fmt(total)} <span class="pct">(${pct}% of team)</span></td></tr>`
    + `</table><table class="acts">${actionSection(lines, slot, total)}</table></span>`);
}

/** A member's own equipped gear for the one weapon/echo combo this row actually ran: both
 *  Inherent Skills, that combo's own weapon and mainslot echo/sonata/2pc, mainstat/substat rolls
 *  — everything but the resonator itself and its talents buff, which aren't "equipped gear" in
 *  the sense either popover below is showing. Shared so the comparison table's own gear popover
 *  and the rotation table's resonator popover (its own "Gear" section) read off the same list.
 *  Fixed order, one entry per `GEAR_LABELS` slot below. */
function equippedGear(member: Member, combo: Combo): Gear[] {
  const l = member.loadout;
  return [l.inherent1, l.inherent2, combo.weapon, combo.echo.mainslot, combo.echo.sonata, combo.echo.sonata2pc, combo.mainstat, l.substat];
}
const GEAR_LABELS = ["Inherent", "Inherent", "Weapon", "Mainslot", "Sonata", "2pc", "Mainstats", "Substats"];

/** What a loadout hover actually lists. Both Inherent Skills are dropped: they are fixed for a
 *  resonator, identical on every row they could ever appear on, so they say nothing about the
 *  build being hovered — unlike the weapon/echo/main-stat picks, which are the whole point of the
 *  panel. Index-matched against `GEAR_LABELS`, so the labels are sliced the same way. */
const HOVER_GEAR_FROM = 2;

/** The resonance chain nodes this row actually holds — S1 up to whatever level its own combo
 *  runs at (see `sequenceLevels()`), each named "<name> S<N>: <title>", listed in their own
 *  section below. */
function equippedSequences(member: Member, combo: Combo): Gear[] {
  return member.loadout.sequences.slice(0, combo.sequence);
}

/** Every piece of gear a member's loadout equips, each labelled by slot, with any sequence nodes
 *  listed the same way — full name, no splitting — after the core six, under a single "Sequences"
 *  label shared by the whole group: it sits in the first sequence row's own `.k` cell (S1's), and
 *  every row after it (S2-S6) leaves `.k` blank, same shape the core six's own label column
 *  already uses. `.k`/`.v` reused wholesale from the stat-trace panels (see index.css's own note
 *  by `.pop .gear`) — the label column's gray already matches those, and the browser's own table
 *  layout sizes both columns to their own longest cell with no extra CSS. Every row carries
 *  `.gear`, which is what left-aligns the name column: these are names, not numbers, and the
 *  panel is a plain list of names with no numeric column beside it. */
function gearRows(member: Member, combo: Combo): string {
  const core = equippedGear(member, combo).slice(HOVER_GEAR_FROM);
  const sequences = equippedSequences(member, combo);
  // A kit with a resonance mode runs one loadout per mode (Lucilla's Echo and Glacio Chafe builds
  // are two `Loadout`s, see lucilla.ts), so which one a row is on is a real build fact and belongs
  // here. Kept out of `equippedGear()` because that list is paired index-for-index with
  // `GEAR_LABELS`, and most kits have no mode at all.
  const mode = member.loadout.mode;
  return core
    .map((g, i) => `<tr class="gear"><td class="k">${esc(GEAR_LABELS[i + HOVER_GEAR_FROM] ?? "")}</td><td class="v">${esc(g.name)}</td></tr>`)
    .join("")
    + (mode ? `<tr class="gear"><td class="k">Mode</td><td class="v">${esc(mode.name)}</td></tr>` : "")
    + sequences
      .map((g, i) => `<tr class="gear"><td class="k">${i === 0 ? "Sequences" : ""}</td><td class="v">${esc(g.name)}</td></tr>`)
      .join("");
}

/** The scope buckets a menu-stat Dmg Bonus line reads from — an attribute's own (Havoc Dmg
 *  Bonus, ...), the four core actions' (Basic/Heavy/Skill/Liberation), then everything else a
 *  piece of gear can scope to (Intro/Outro/Echo/Coordinated/...). Each bucket keeps only its own
 *  biggest line: a build only ever wants one number to read per bucket, not every scope it
 *  happens to touch. */
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

/** A loadout's own constant/unconditional stats — the "menu stats" the game's own character
 *  screen shows, read off nothing but its equipped gear (kit.ts's own `menuStats()`, the full
 *  piece list including the resonator/talent/inherents that `equippedGear()` above deliberately
 *  drops). HP/ATK/DEF fold base/bonus/flat the same way the resonator's own totals do; Dmg Bonus
 *  collapses down to each scope bucket's single biggest line (see the three arrays above) instead
 *  of listing every scope a piece of gear happens to touch. Zeros dropped throughout — Off-Tune
 *  Buildup Rate, the one baseline every resonator carries, is left out entirely: never worth a
 *  line here. */
function menuStatRows(member: Member, combo: Combo): { label: string; value: string }[] {
  const l = member.loadout;
  const entries = menuStats(l.pieces(combo.weapon, combo.echo, combo.mainstat, combo.sequence));
  const totals = new Map<number, number>();
  for (const e of entries) totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.value);
  const get = (key: number) => totals.get(key) ?? 0;
  const fold = (base: Stat, bonus: Stat, flat: Stat) => get(base) * (1 + get(bonus) / 100) + get(flat);

  const rows: { label: string; value: string }[] = [];
  const push = (label: string, value: number, percent: boolean) => {
    if (!value) return;
    rows.push({ label, value: `${fmt(value, percent ? 1 : 0)}${percent ? "%" : ""}` });
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
  // Tune Break Boost is a count of points, not a ratio — every point is worth +0.12% total damage
  // per Interfered stack (tunebreak.ts's own tuneStrainBonus), so a "%" on it reads as the wrong unit
  push(statLabel(Stat.Tbb), get(Stat.Tbb), false);
  pushBest(ATTRIBUTE_SCOPES);
  pushBest(CORE_TYPE1_SCOPES);
  pushBest(OTHER_SCOPES);
  return rows;
}

/** The loadout on its own — the only hover a member's own name cell carries, on both the
 *  comparison table and the detail page's two rotation tables. Its own gear list first, then a
 *  "menu stats" reading of the same build below it (see `.pop .gear + tr:not(.gear)` in
 *  index.css for the divider between the two). */
function gearPopover(member: Member, combo: Combo): string {
  const stats = menuStatRows(member, combo)
    .map((r) => `<tr class="stat"><td class="k">${esc(r.label)}</td><td class="v">${esc(r.value)}</td></tr>`)
    .join("");
  return lazyPop(`<span class="pop gear"><table>${gearRows(member, combo)}${stats}</table></span>`);
}

/** What a member's own name cell reads as: the resonator, then their sequence level and weapon
 *  rank as one token (`S0R1`) — this project never implements S1-S6, so that's S6 for a
 *  `standardCharacter` whose loadout equips its own nodes and S0 for everyone else, and R1 when
 *  this row's weapon is a signature/limited one rather than a standard (see kit.ts's own
 *  `Weapon.standard`). Always shown, weapon options box or no: the weapon/echo/mainstat picks
 *  themselves live in their own columns now (see `optionCell()`), not appended here, so there's
 *  nothing left for the rank marker to be redundant with. */
function memberLabel(m: Member, combo: Combo): string {
  const l = m.loadout;
  const mdps = m.mainDps;
  // A standard character's own sequence comes with the character, so it's always worth naming; a
  // limited one's is a build choice, which only exists at all while that role's Sequences box is
  // open — and once it is, this is the one thing telling that member's own seven rows apart (see
  // `sequenceLevels()`).
  const seq = l.resonator.standardCharacter || (mdps ? filters.mdpsSequences : filters.supportSequences)
    ? `S${combo.sequence}`
    : "";
  // Which way the weapon went is worth saying either way — a signature is the build's own biggest
  // single lever, so "R0" reading "no signature" is worth as much as "R1" reading it has one.
  const rank = combo.weapon.standard ? "R0" : "R1";
  return [l.resonator.name, `${seq}${rank}`].filter(Boolean).join(" ");
}

/** One member's own weapon/echo/mainstat pick, rendered as its own column cell to the right of
 *  their name — only at a member position that axis is actually open at (see `comparisonTable()`'s
 *  own `weaponOpenAt`/`echoOpenAt`/`mainstatOpenAt`), but populated only while it's open for *this
 *  member's own* role, same as the label used to gate it. `color` wears the same `--mem` wash as
 *  their own name cell (index.css's own `.trow .c.option`), so the pick reads as "this row's
 *  member" at a glance the same way the name column does. Clickable exactly like a resonator's own
 *  name cell: left click requires this pick, right click bars it (see the handlers in `boot()`),
 *  and `data-kind`/`data-value` are what those key off — `kind` picks the filter map, `value` is
 *  the same string the cell displays, so a click always filters on what's on screen. */
function optionCell(kind: OptionKind, value: string, color: string): string {
  const style = `--mem:${color}`;
  if (!value) return `<div class="c" style="${style}"></div>`;
  return `<div class="c option" data-kind="${kind}" data-value="${esc(value)}" style="${style}">${esc(value)}</div>`;
}

/** The filter checkboxes above the comparison table, one row per role: MDPS on top, supports
 *  below, each row the same four axes plus that role's own R1 allowance.
 *
 *  Sequences: with no sequence system for limited resonators (this project never implements
 *  S1-S6 for them — every such build is sequence 0) and a `standardCharacter`'s own S1-S6
 *  unconditionally equipped whatever these say, both boxes are kept for parity with the old
 *  page's own dropdown but hide nothing today. They're scoped to non-standard resonators on
 *  purpose: a standard character being S6 isn't a build choice anyone makes.
 *
 *  Weapons/Echoes/Mainstats: unchecked, that role's own members each run their loadout's own
 *  first-listed pick on that axis and nothing else is even simulated; checked, the axis opens to
 *  every pick the loadout offers and the newly reachable rows are run right then (see
 *  `Filters`/`refresh()`). Allow R1 restricts that role to `standard` weapons only
 *  (weapons/standard.ts, every generation — see kit.ts's own `Weapon.standard`) when unchecked,
 *  on the assumption a signature is only ever owned at R1.
 *
 *  Every id here is a `Filters` key, which is what the change handler in `boot()` keys off to
 *  update it — no id-to-field mapping table in between. The sequence pair opens no new rows the
 *  way the other three axes do (it drops whole teams instead, see `sequenceLevels()`), but it does
 *  change what every member cell is called, so it belongs to the same state and the same redraw. */
function comparisonFilters(): string {
  const filter = (id: keyof Filters, label: string) =>
    `<label>${esc(label)}<input type="checkbox" id="${id}"${filters[id] ? " checked" : ""}></label>`;
  return `<div class="tcfilters">
    <div class="tcfilter-row">
      ${filter("allowR1Mdps", "Allow R1 Main DPS")}
      ${filter("mdpsWeapons", "Show Main DPS Weapon Options")}
      ${filter("mdpsEchoes", "Show Main DPS Echo Options")}
      ${filter("mdpsMainstats", "Show Main DPS Mainstat Options")}
      ${filter("mdpsSequences", "Allow Main DPS Sequences")}
    </div>
    <div class="tcfilter-row">
      ${filter("allowR1Supports", "Allow R1 Supports")}
      ${filter("supportWeapons", "Show Support Weapon Options")}
      ${filter("supportEchoes", "Show Support Echo Options")}
      ${filter("supportMainstats", "Show Support Mainstat Options")}
      ${filter("supportSequences", "Allow Support Sequences")}
    </div>
    <div class="tcwarning" id="rowCapWarning" hidden></div>
    ${resonatorChips()}
  </div>`;
}

/** Every filter currently set — resonators plus weapon/echo/mainstat picks — one chip apiece under
 *  the filter boxes: the name, and a box saying which way it's filtered — a green tick for "every
 *  row must use them", a red cross for "no row may". Clicking one clears it (see `boot()`), which
 *  is the only way out other than clicking the same cell again the same way it was set.
 *
 *  A `<button>`, not a div: it's a real control, so it gets keyboard focus and Enter/Space for
 *  free. Nothing renders at all when no filter is set, rather than an empty row holding open the
 *  gap `.tcfilters` puts between its rows. */
function resonatorChips(): string {
  const nameChips = [...resonatorFilters].map(([name, mode]) => {
    const included = mode === "include";
    // The pill wears that resonator's own hue the way their name cell in the table does; the
    // tick/cross inside it stays green/red whoever the chip is for, since that's the half that
    // says which way the filter runs (see index.css's own `.rchip`).
    return `<button type="button" class="rchip ${included ? "inc" : "exc"}" data-resonator="${esc(name)}"`
      + ` style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_HUE}"`
      + ` title="${esc(name)} — ${included ? "only teams fielding them" : "no team fielding them"}. Click to clear.">`
      + `${esc(name)}<span class="box">${included ? "✓" : "✕"}</span></button>`;
  }).join("");
  // no hue of their own — these key off a pick, not a member, so there's no colour to wear. The
  // exception is a sequence chip, which is a resonator and a level ("Phrolova S5"): it's set from
  // that member's own name cell, so it wears their hue the way the cell and its name chip do.
  const pickChips = (Object.entries(OPTION_FILTER_MAPS) as [OptionKind, Map<string, ResonatorFilter>][])
    .flatMap(([kind, map]) => [...map].map(([name, mode]) => {
      const included = mode === "include";
      const hue = kind === "sequence" ? RESONATOR_HUE.get(name.replace(/ S\d+$/, "")) : undefined;
      return `<button type="button" class="rchip ${included ? "inc" : "exc"}" data-kind="${kind}" data-value="${esc(name)}"`
        + (hue ? ` style="--mem:${hue}"` : "")
        + ` title="${esc(name)} — ${included ? "only rows using them" : "no row using them"}. Click to clear.">`
        + `${esc(name)}<span class="box">${included ? "✓" : "✕"}</span></button>`;
    })).join("");
  const chips = nameChips + pickChips;
  return chips ? `<div class="tcchips">${chips}</div>` : "";
}

/** Every row the current filters opened, sorted by team damage — each one's own run read out of
 *  the `results` cache, which `refresh()` has already filled for exactly this row set. */
function comparisonTable(rows: TeamRow[]): string {
  const sorted = rows.map((row) => [row.key, results.get(row.key)!] as const)
    .sort((a, b) => b[1].total - a[1].total);

  // Whether each axis has a column at member position 0/1/2 — read off the rows actually on
  // screen rather than the boxes alone, since which position is MDPS varies team to team
  // (teams.ts's own `dpsIndex`). A position only earns a Weapon column, say, if some visible row
  // actually has an MDPS there with "Show MDPS Weapon Options" checked, or a support there with
  // its own box checked — not just because the box is checked somewhere else in the table. A
  // position with neither never gets the column at all, rather than a permanently-empty one.
  // Sequences aren't here: they open new rows (`sequenceLevels()`), not a column, per CLAUDE.md's
  // own note.
  const weaponOpenAt = [false, false, false];
  const echoOpenAt = [false, false, false];
  const mainstatOpenAt = [false, false, false];
  for (const row of rows) {
    row.members.forEach((m, i) => {
      const mdps = m.mainDps;
      if (mdps ? filters.mdpsWeapons : filters.supportWeapons) weaponOpenAt[i] = true;
      if (mdps ? filters.mdpsEchoes : filters.supportEchoes) echoOpenAt[i] = true;
      if (mdps ? filters.mdpsMainstats : filters.supportMainstats) mainstatOpenAt[i] = true;
    });
  }

  const body = sorted.map(([key, run]) => {
    const grand = run.total;
    const memberNames = run.members.map((m) => m.name).join("|");

    // Left click requires this resonator, right click bars them — see the handlers in boot() and
    // `resonatorFilters`. Nothing is drawn in the cell either way; the chips above the table are
    // where a set filter shows. `data-resonator` stays the resonator's own full name, since that's
    // what the filter keys off; only the visible label is the build line. With Sequences open, a
    // row running a chain that was actually chosen carries `data-sequence` too ("Phrolova S5"), and
    // the handlers prefer it: at that point the rows differ by level, so the name alone would
    // filter to something the click didn't point at (see `sequenceTagAt()`).
    // The hover is the loadout alone — every per-member damage breakdown that used to live here
    // is now one row of the DPR table the Total cell opens, which says the same thing about all
    // three members at once instead of one panel apiece.
    const memberCell = (m: Member, combo: Combo, i: number) => {
      const mdps = m.mainDps;
      const tag = sequenceTag(m, combo);
      const name = `<div class="c name res has" data-resonator="${esc(m.name)}"`
        + (tag ? ` data-sequence="${esc(tag)}"` : "")
        + ` style="--mem:${m.color};color:${m.color}">`
        + `<span class="res-label">${esc(memberLabel(m, combo))}</span>`
        + gearPopover(m, combo)
        + `</div>`;
      // populated only while this axis is open for *this member's own* role — the same gate the
      // label used to apply — even though the column itself exists as soon as this position needs
      // it for anyone (see `weaponOpenAt` above)
      const weapon = weaponOpenAt[i] ? optionCell("weapon", (mdps ? filters.mdpsWeapons : filters.supportWeapons) ? combo.weapon.name : "", m.color) : "";
      const echo = echoOpenAt[i] ? optionCell("echo", (mdps ? filters.mdpsEchoes : filters.supportEchoes) ? echoLabel(m.loadout, combo.echo) : "", m.color) : "";
      const mainstat = mainstatOpenAt[i] ? optionCell("mainstat", (mdps ? filters.mdpsMainstats : filters.supportMainstats) ? combo.mainstat.name : "", m.color) : "";
      return name + weapon + echo + mainstat;
    };
    const memberCells = run.members.map((m, i) => memberCell(m, run.combo[i]!, i)).join("");

    return `<div class="trow" data-team="${esc(key)}" data-team-key="${esc(run.teamKey)}"`
      + ` data-members="${esc(memberNames)}" data-total="${grand}">`
      + memberCells
      + `<div class="c num total teamdpr gotodetail" data-team="${esc(key)}">${fmt(grand)}<span class="arrow">›</span>`
      + lazyPop(`<span class="pop dpr">${dprTable(run)}</span>`) + `</div>`
      // both the hue (`--hue`, on the row) and the percentage itself are written by
      // rankRows() — they're relative to whichever team is currently the baseline, which this
      // render doesn't know. Clicking the cell makes that row the baseline (see `setBaseline()`).
      + `<div class="c num total baseline" data-team="${esc(key)}" title="Click to measure every team against this one"></div>`
      + `</div>`;
  }).join("");

  const memberHead = (n: number, i: number) => `<div class="c">Slot ${n}</div>`
    + (weaponOpenAt[i] ? `<div class="c">Weapon ${n}</div>` : "")
    + (echoOpenAt[i] ? `<div class="c">Echo Set ${n}</div>` : "")
    + (mainstatOpenAt[i] ? `<div class="c">Mainstats ${n}</div>` : "");
  const head = `<div class="trow thead">`
    + memberHead(1, 0) + memberHead(2, 1) + memberHead(3, 2)
    + `<div class="c num">Avg Team DPR</div>`
    + `<div class="c num">% of Baseline</div>`
    + `</div>`;

  // one grid track per column actually rendered above, position by position — a member's name
  // plus however many of the three option columns that position earned, then Total and Baseline%.
  // Computed here rather than left to a fixed rule in index.css, since both the column count and
  // which position has which now depend on which axes are open and who's actually standing where
  // (see index.css's own `.tgrid` for the no-options-open default this overrides).
  const posCols = (i: number) => `max-content${weaponOpenAt[i] ? " max-content" : ""}${echoOpenAt[i] ? " max-content" : ""}${mainstatOpenAt[i] ? " max-content" : ""}`;
  const gridStyle = `grid-template-columns:${posCols(0)} ${posCols(1)} ${posCols(2)} max-content max-content`;

  // the count itself is written by `rankRows()`, which is what actually knows how many
  // rows survive the resonator checkboxes — it runs immediately after every render
  return `<main>${comparisonFilters()}<h2 class="summary-label" id="teamCount"></h2><div class="tcwrap"><div class="tgrid" style="${gridStyle}">${head}${body}</div></div></main>`;
}

/** No filtering left at the DOM level — every axis, the resonator checkboxes included, decides
 *  which rows *exist* rather than which are hidden, so nothing off-screen is ever optimized, run
 *  or rendered. What's left is the two things that can only be known once the rows are on the
 *  page and is the same either way: how many there are, and how they rank against each other. */
function rankRows(): void {
  const rows = [...document.querySelectorAll<HTMLElement>(".trow:not(.thead)")];
  const label = document.getElementById("teamCount");
  if (label) label.textContent = `${fmt(rows.length)} teams`;
  rankVisible(rows);
}

/** Which team every other row is measured against, by its own `data-team` key — null for the
 *  default, the weakest team currently on screen. Set by clicking a `% of Baseline` cell, and kept
 *  across re-renders (filters, sorting) so a chosen baseline survives them; a baseline whose row
 *  is filtered away falls back to the default until it comes back. */
let baselineTeam: string | null = null;

/** The one ramp the `% of Baseline` column is painted on, as HSL hues: the strongest team, the
 *  baseline every row is measured from, and the weakest. Monotonic on purpose — red through
 *  orange and yellow to green at the baseline, then teal, blue and purple below it — so the column
 *  reads as a single gradient with the baseline inside it rather than as two scales meeting at an
 *  edge, and the hottest teams actually land on red. */
const BEST_HUE = 0, BASELINE_HUE = 120, WORST_HUE = 280;

export function setBaseline(team: string | null): void {
  // clicking the row that's already the baseline puts it back to the weakest visible team
  baselineTeam = baselineTeam === team ? null : team;
  rankRows();
}

/** The baseline column, measured against whichever team is the baseline — by default the weakest
 *  *currently on screen* rather than the weakest ever built, so filtering the table down re-bases
 *  it and the comparison is always between the rows actually being looked at; click a cell to pin
 *  one instead (`setBaseline()`). The percentage is that ratio outright, so the baseline row reads
 *  100.00%.
 *
 *  Colour is one continuous hue ramp across the whole table, written here as `--hue` rather than
 *  derived in CSS, because a single monotonic scale is the only way it reads smoothly: lime at the
 *  strongest team, through green at the baseline, into teal, blue and finally purple at the
 *  weakest. Anything built from separate above/below scales meets at the baseline as a hard edge.
 *
 *  Both halves spread the ratio itself, straight: a team's colour is how far along the visible
 *  spread it actually sits, so the warm end is reached as fast as the damage gets there. (A log
 *  spread evens the steps out when one runaway team stretches the table, but it also drags every
 *  middling row toward the baseline's colour, which is the opposite of what the column is for.) */
function rankVisible(rows: HTMLElement[]): void {
  const totals = rows.map((row) => Number(row.dataset.total));
  const pinned = baselineTeam == null ? -1 : rows.findIndex((row) => row.dataset.team === baselineTeam);
  const base = pinned >= 0 ? totals[pinned]! : Math.min(...totals);
  const maxRatio = Math.max(...totals.map((t) => (base ? t / base : 1)), 1);
  const minRatio = Math.min(...totals.map((t) => (base ? t / base : 1)), 1);
  rows.forEach((row, i) => {
    const ratio = base ? totals[i]! / base : 1;
    // how far this row sits from the baseline, 0 there and 1 at whichever end it's on
    const away = ratio >= 1
      ? (maxRatio > 1 ? (ratio - 1) / (maxRatio - 1) : 0)
      : (minRatio < 1 ? (1 - ratio) / (1 - minRatio) : 0);
    // BASELINE_HUE either way, so the two halves meet there rather than butting into each other
    row.style.setProperty("--hue", String(ratio >= 1
      ? BASELINE_HUE - away * (BASELINE_HUE - BEST_HUE)
      : BASELINE_HUE + away * (WORST_HUE - BASELINE_HUE)));
    // only a row actually clicked is marked as the baseline — it takes its colour from the ramp
    // like every other row, and the class is just the outline that says which one is pinned
    row.classList.toggle("isbaseline", pinned >= 0 && i === pinned);
    const cell = row.querySelector<HTMLElement>(".c.baseline");
    if (cell) cell.textContent = `${fmt(ratio * 100, 2, true)}%`;
  });
}

/* --------------------------------------------------------------------- table */

/** The running-total columns — concerto, energy, off-tune and the five forte gauges. A cell in one
 *  of these is blank when the row didn't move it: the value is what's banked, and repeating the
 *  same number down twenty rows hides the handful that actually changed it. Each compares against
 *  the value its own cast walked in holding (`before:` — display.ts's own rowValues, off the
 *  snapshot), not against a neighbouring row: a teammate's turn in between doesn't make a member's
 *  own bar "changed", a folded group answers for the whole group rather than its last cast, and a
 *  row with no previous row of its own — an opened group's members, a member's first cast — reads
 *  the same way every other row does instead of falling back to a bare 0. */
const RUNNING_COLUMNS = new Set(["concerto", "energy", "offtune"]);
const isRunning = (key: string): boolean => RUNNING_COLUMNS.has(key) || key.startsWith("gauge:");

function stepRow(
  columns: Column[], row: ReportRow | ReportPart, slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>,
  { part = false }: { part?: boolean } = {},
): string {
  return columns.map((col, i) => {
    const v = row.raw[col.key];
    // a running total this row left exactly where its own last row had it — nothing to say. With
    // no such row (a member's first, or the table's first for off-tune) the comparison is against
    // 0: every gauge, energy, concerto and the bar all start there, so a 0 on a first row is just
    // as unmoved as a repeated value further down — a column another member's kit put in the
    // table shouldn't print a bare 0 on this member's intro.
    if (isRunning(col.key)) {
      const before = Number(row.raw[`before:${col.key}`]) || 0;
      if (Math.abs((Number(v) || 0) - before) < 1e-9) return cell(columns, i, { cls: [], html: "", style: "" });
    }
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

    const text = esc(fmt(v, col.digits ?? 0, PAD_DIGITS_COLUMNS.has(col.key), GROUPED_COLUMNS.has(col.key)))
      + (col.percent && typeof v === "number" ? "%" : "");
    // the help cursor goes on exactly the cells that open a panel below — an empty cell doesn't
    let html = sources && text ? `<span class="has">${text}</span>` : text;
    if (col.key === "action" && !part && "parts" in row && row.parts.length) {
      html = `${html}<span class="caret">▸</span>`;
    }
    const suffix = col.key === "mv" && row.scaling !== null
      ? ` ${SCALING_NAME[row.scaling]}` : "";
    if (col.key === "action") {
      html += infoPopover("info" in row ? row.info : undefined, slotHue);
    } else if (col.key === "member") {
      // an opened group's own parts carry their own snapshot, so each reads the buffs that cast
      // was actually held under rather than inheriting the row's (see display.ts's ReportPart)
      const snap = "line" in row ? (row.line.snap as ResolvedSnapshot) : row.snap;
      const gear = gearByMember.get(snap.member) ?? [];
      html += buffsPopover(snap.member, gear, snap.heldLocal, snap.heldGlobal, snap.heldEnemy, slotHue);
    } else if (text) {
      // `text`: an empty cell gets no panel — hovering nothing and being told about it is worse
      // than the blank the row means by it. `moved:`: a running counter's panel foots to what this
      // action moved it by rather than to the balance in the cell (display.ts's own rowValues()).
      html += popover(col, sources, row.raw[`moved:${col.key}`] ?? v, slotHue, suffix);
    }

    const mem = slotHue.get(String(v)) ?? FALLBACK_HUE;
    const style = col.key === "member" ? `--mem:${mem};color:${mem}` : "";

    return cell(columns, i, { cls, html, style });
  }).join("");
}

/** An opened group's own rows. Each carries its *own* member's hue rather than inheriting the
 *  group's: the members are all one resonator, but the follow-ups queued between them need not be
 *  — a Tune Break banks under its own slot, and `queueOn` can land a hit on anybody. */
function partRows(columns: Column[], parts: ReportPart[], slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>): string {
  return parts.map((p) => {
    const hue = slotHue.get(String(p.raw.member)) ?? FALLBACK_HUE;
    return `<div class="r${p.short ? " short" : ""}" style="--m:${hue}">`
      + `${stepRow(columns, p, slotHue, gearByMember, { part: true })}</div>`;
  }).join("");
}

/** The whole team's rotation as one table, in the order they act. A row's own wash is whoever
 *  acted's colour, always — an echo-cast row (the rotation marker standing in for whichever
 *  mainslot echo is equipped, see kit.ts's own `run()`) still belongs to whoever's turn it was
 *  and is still shown at full strength here; only its dimmed/short treatment marks it as not a
 *  kit's own button press (`triggered`, from `run()`). */
function rotationTable(report: Report, slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>): string {
  const columns = report.columns;
  const cols = columns.map((c, i) => colWidth(c, i, columns.length - 1)).join(" ");

  const head = columns
    .map((c, i) => cell(columns, i, { html: esc(c.label) }))
    .join("");

  // A group's block holds three things after its own row: the members and their follow-ups in the
  // order they resolved (`.parts`, shown once it is opened), and the follow-ups alone (`.spill`,
  // shown while it is closed). A spill row arrives as an ordinary row of the report, straight after
  // the group it belongs to, and is appended into the block still open rather than closing it.
  const out: string[] = [];
  let spilling = false;
  const closeBlock = () => { if (spilling) { out.push("</div></div>"); spilling = false; } };
  report.rows.forEach((row, i) => {
    const snap = row.line.snap;
    const hue = slotHue.get(snap.member) ?? FALLBACK_HUE;
    const style = ` style="--m:${hue}"`;
    const cells = stepRow(columns, row, slotHue, gearByMember);
    const shortCls = row.short ? " short" : "";
    // its own hue, not the block's: a follow-up can land on a slot of its own (a Tune Break's)
    if (row.line.spill && spilling) { out.push(`<div class="r${shortCls}"${style}>${cells}</div>`); return; }
    closeBlock();
    if (!row.parts.length) {
      out.push(`<div class="step"${style}><div class="r${shortCls}">${cells}</div></div>`);
      return;
    }
    const id = `x${i}`;
    out.push(`<div class="step chain"${style}>`
      + `<input class="tgl" type="checkbox" id="${id}">`
      + `<label class="r${shortCls}" for="${id}">${cells}</label>`
      + `<div class="parts">${partRows(columns, row.parts, slotHue, gearByMember)}</div>`
      + `<div class="spill">`);
    spilling = true;
  });
  closeBlock();
  const steps = out.join("");

  const totalRow = columns.map((c, i) => cell(columns, i, {
    html: "",
  })).join("");

  return `<div class="gridwrap"><div class="grid" style="--cols:${cols}">
    <div class="r head">${head}</div>
    ${steps}
    <div class="r totalrow">${totalRow}</div>
  </div></div>`;
}

/* ----------------------------------------------------------------- page pieces */

/** Damage per rotation: one row per member, then Tune Break and a Total row (plain name — neither is a
 *  real loadout). Opener/Loop 1-3 read each section's own per-slot sum and Total (2min) their sum
 *  over the whole rotation. Every figure comes off `run` — the four sections the
 *  solver already keeps (`sectionBySlot`/`sectionTotals`) — so no report, and no traced re-run,
 *  is needed to draw one.
 *
 *  `lines` is the detail page's own extra: with them, each damage value carries its own
 *  Node/Type/Type2/Actions breakdown (`damagePopover()`) and each member name their loadout. The
 *  comparison table's own Total DPR hover is this whole table, so it passes none — a panel
 *  nested inside a panel has no hover of its own to open on. */
function dprTable(run: TeamRun, lines?: ChainGroup[][]): string {
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
      ? `<div class="c num has">${fmt(value)}${damagePopover(sec, slot, value, total)}</div>`
      : `<div class="c num">${fmt(value)}</div>`);

  const dataRow = (slot: string, color: string, hover: string): string => {
    const own = run.sectionBySlot.reduce((a, by) => a + (by.get(slot) ?? 0), 0);
    return `<div class="rtrow">`
      + `<div class="c name${hover ? " has" : ""}" style="--mem:${color}">${esc(slot)}${hover}</div>`
      + run.sectionBySlot.map((by, i) => valueCell(lines?.[i], slot, by.get(slot) ?? 0, run.sectionTotals[i]!)).join("")
      + valueCell(flat, slot, own, grand)
      + `</div>`;
  };

  const memberRows = run.members
    .map((m, i) => dataRow(m.name, m.color, lines ? gearPopover(m, run.combo[i]!) : ""))
    .join("");
  // The Tune Break row gets its own hue and the same bar/wash as a real member — it isn't a
  // loadout, so it has no gear hover, but it is a damage source and reads as one.
  const tuneBreakRow = dataRow(TUNE_BREAK_SLOT, TUNE_BREAK_HUE, "");
  // no hover: a whole team's damage split by node is three kits' worth of buckets stacked on top
  // of each other, which answers nothing the member rows above it don't already
  const plainCell = (value: number): string => `<div class="c num">${fmt(value)}</div>`;
  const totalRow = `<div class="rtrow total">`
    + `<div class="c name">Total</div>`
    + run.sectionTotals.map((v) => plainCell(v)).join("")
    + plainCell(grand)
    + `</div>`;

  return `<div class="rtable dpr">${head}${memberRows}${tuneBreakRow}${totalRow}</div>`;
}

/** Every index at which `member` casts a `resetEnergy`-marked action within `flat[from, to)`, in
 *  order — empty if they never cast one in that span (see kit.ts's own `ActionDef.resetEnergy`).
 *  A loop reads the first, the opener the last: see `energyTable()`. */
function resetIndices(flat: ChainGroup[], from: number, to: number, member: string): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) {
    const snap = flat[i]!.snap as ResolvedSnapshot;
    if (snap.member === member && snap.action.resetEnergy) out.push(i);
  }
  return out;
}

/** How much more ER (as a % of the 100% baseline every declared energy figure already assumes)
 *  this member would need for their build to actually have Resonance Liberation up by that loop's
 *  own first cast — maxEnergy ÷ RealEnergy right before it, see kit.ts's own realEnergyBefore.
 *
 *  A Liberation that costs no Resonance Energy at all (`maxEnergy: 0` — Phrolova and Lucilla) has
 *  nothing to bank, so it is up regardless of the build: that's a requirement of 0, a real answer,
 *  not the absent one a `—` reads as. Null is kept for the case that genuinely has no answer —
 *  a cast that comes in on an empty RealEnergy counter. */
function erRequirementValue(maxEnergy: number, before: number | null): number | null {
  if (!maxEnergy) return 0;
  if (before == null || before <= 0) return null;
  return (maxEnergy / before) * 100;
}

/** Whether `member`'s own real ER stat ever fell short of `requirement` on one of *their own*
 *  actions since their last RealEnergy reset (a teammate's action in between doesn't count — it
 *  only ever moves RealEnergy via the flat team-share, never this member's own ER) — walking
 *  backward from `targetIdx` (this loop's own reset cast, included) and stopping at the previous
 *  occurrence of member's own `resetEnergy` cast (excluded — that one belongs to the prior window). */
function erFallsShort(flat: ChainGroup[], targetIdx: number, member: string, requirement: number): boolean {
  for (let i = targetIdx; i >= 0; i--) {
    const snap = flat[i]!.snap as ResolvedSnapshot;
    if (snap.member !== member) continue;
    if (i !== targetIdx && snap.action.resetEnergy) break;
    if (snap.stat(Stat.Er) < requirement) return true;
  }
  return false;
}

/** Energy Requirements: one row per member (same gear-loadout hover as the DPR table above), one
 *  column per section. A section the member casts no Liberation in reads `—`, and so does the one
 *  holding their first: a fight starts on a full bar (RealEnergy, see kit.ts), so that cast is
 *  free and there is no requirement to state. The opener's own column is therefore about its
 *  *last* Liberation — only a second one in the same opener has anything to bank for. A cell gets
 *  a red underline when the member's own ER stat dipped below the shown requirement on any of
 *  their own actions since their last reset — see `erFallsShort()`.
 *
 *  Each cell hovers the ER its requirement is measured against: the same `er` panel the action
 *  table carries, from the same column definition and the same sources (`columnSources()`), as it
 *  stood on the Liberation that cell is about. A cell with no such cast reads as a plain dash. */
function energyTable(run: TeamRun, lines: ChainGroup[][], report: Report, slotHue: Map<string, string>): string {
  const erCol = columnOf(report, "er");
  const flat = lines.flat();
  // cumulative start index of each of the 4 sections within `flat` — offsets[i] is where section
  // i begins, so section i's own lines span flat[offsets[i], offsets[i + 1])
  const offsets = [0];
  for (const sec of lines) offsets.push(offsets[offsets.length - 1]! + sec.length);

  const head = `<div class="rtrow rthead">`
    + `<div class="c"></div>`
    + `<div class="c num">Opener</div>`
    + `<div class="c num">Loop 1</div><div class="c num">Loop 2</div><div class="c num">Loop 3</div>`
    + `</div>`;

  const rows = run.members.map((m, idx) => {
    const maxEnergy = run.state.slots.find((s) => s.name === m.name)?.resonator?.maxEnergy ?? 0;
    // The fight's very first Liberation rides in on the bar every resonator starts full (kit.ts's
    // own realEnergy), so it asks for no ER at all — it's dropped from the table the same way a
    // section with no Liberation in it is, rather than reading as a requirement of 0%.
    const free = resetIndices(flat, 0, flat.length, m.name)[0] ?? null;
    const cell = (resetIdx: number | null): string => {
      const snap = resetIdx == null || resetIdx === free ? null : (flat[resetIdx]!.snap as ResolvedSnapshot);
      const req = snap == null ? null : erRequirementValue(maxEnergy, snap.realEnergyBefore);
      const warn = req != null && erFallsShort(flat, resetIdx!, m.name, req);
      const text = req == null ? "—" : `${fmt(req, 1)}%`;
      const hover = snap && erCol ? popover(erCol, columnSources(snap, "er"), snap.stat(Stat.Er), slotHue) : "";
      return `<div class="c num${warn ? " er-under" : ""}${hover ? " has" : ""}">${text}${hover}</div>`;
    };

    // the opener's last cast is the one with something to bank for — an earlier one in the same
    // opener spent a bar that this one has to rebuild
    const opener = resetIndices(flat, offsets[0]!, offsets[1]!, m.name);
    const cells = cell(opener[opener.length - 1] ?? null)
      + [1, 2, 3].map((i) => cell(resetIndices(flat, offsets[i]!, offsets[i + 1]!, m.name)[0] ?? null)).join("");
    return `<div class="rtrow">`
      + `<div class="c name" style="--mem:${m.color}">${esc(m.name)}${gearPopover(m, run.combo[idx]!)}</div>`
      + cells
      + `</div>`;
  }).join("");

  return `<div class="rtable energy">${head}${rows}</div>`;
}

function page(run: TeamRun): string {
  const { report } = detailFor(run);
  // detailFor() has just guaranteed these exist (re-running the team traced if need be)
  const lines = run.rotationLines!;
  const { members } = run;
  const slotHue = new Map([...members.map((m): [string, string] => [m.name, m.color]), [TUNE_BREAK_SLOT, TUNE_BREAK_HUE]]);
  const gearByMember = new Map(members.map((m, i): [string, Gear[]] => [m.name, equippedGear(m, run.combo[i]!)]));

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
  ${rotationTable(report, slotHue, gearByMember)}
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

  document.body.querySelectorAll(":scope > .pop").forEach((el) => el.remove());

  const close = (): void => {
    if (open) {
      open.style.display = "";
      if (openHome && open.parentElement !== openHome) openHome.appendChild(open);
    }
    open = null;
    openHome = null;
  };

  const place = (cell: Element, pop: HTMLElement): void => {
    if (pop.parentElement !== document.body) document.body.appendChild(pop);
    pop.style.visibility = "hidden";
    pop.style.display = "block";
    const c = cell.getBoundingClientRect();
    const p = pop.getBoundingClientRect();

    // Every panel is anchored by its own left edge to the cell's, so it opens rightward into the
    // page. `.num` cells used to anchor their right edge to the cell's instead — lining the panel
    // up under a right-aligned number — but these panels are wide (a loadout's gear names) and
    // that threw them leftward off the columns they belong to, and off the page entirely on the
    // leftmost ones. Growing rightward from a fixed left edge keeps them over the table.
    const natural = c.left;
    // Clamped to the table's own box, not just the viewport — `EDGE` alone let a panel opened on
    // a narrow leftmost column (the member column) bleed out past the table's own left edge and
    // into the page's margin, since a viewport-relative clamp has no idea where the table itself
    // starts.
    const tableLeft = (cell.closest(".gridwrap, .tcwrap")?.getBoundingClientRect().left ?? EDGE);
    const minLeft = Math.max(EDGE, tableLeft);
    const left = Math.max(minLeft, Math.min(natural, innerWidth - p.width - EDGE));
    // The resonator column opens *upward* by default — its rows are read down a column, and a
    // panel hanging below the hovered name covers the very next cast, so mousing down the list
    // means fighting the panel. Every other column opens downward, where the value being
    // explained sits above its own explanation. Either way the other side is taken when the
    // preferred one has no room, and a panel that fits neither is clamped to the top edge.
    const above = c.top - p.height - GAP;
    const below = c.bottom + GAP;
    const fitsAbove = above >= EDGE;
    const fitsBelow = below + p.height <= innerHeight - EDGE;
    const top = cell.classList.contains("member")
      ? (fitsAbove ? above : fitsBelow ? below : Math.max(EDGE, above))
      : (fitsBelow ? below : Math.max(EDGE, above));

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
    // first hover on this cell: swap its parked template for the real panel, once (see `lazyPop`)
    const src = cell.querySelector<HTMLTemplateElement>(":scope > template.pop-src");
    if (src) { cell.appendChild(src.content.cloneNode(true)); src.remove(); }
    return { cell, pop: cell.querySelector<HTMLElement>(":scope > .pop") };
  };

  document.addEventListener("mouseover", (e) => {
    if (open && open.contains(e.target as Node)) return;
    const { cell, pop } = panelIn(e.target);
    if (pop === open) return;
    close();
    if (pop) place(cell!, pop);
  });

  document.addEventListener("mouseout", (e) => {
    const to = e.relatedTarget as Node | null;
    if (to && (root.contains(to) || (open && open.contains(to)))) return;
    close();
  });

  // A caret click expands or collapses rows underneath the panel, which leaves it floating over
  // whatever has moved into that spot — drop it and let the next mouseover re-place it. Nothing
  // else here is click-driven any more: a panel is purely a hover now, never pinned open.
  addEventListener("click", (e) => {
    const { cell } = panelIn(e.target);
    if (cell?.querySelector(":scope > .caret")) close();
  });

  addEventListener("scroll", close, true);
  addEventListener("resize", close);
}

/* ----------------------------------------------------------------------- mount */

const app = document.getElementById("app")!;
const backLink = document.getElementById("backLink")!;

/** Every combo ever run this session, keyed by its own `TeamRow.key` — the cache the whole lazy
 *  scheme rests on. A row is simulated the first time some checkbox opens it and never again, and
 *  a detail-page hash stays valid for as long as the page lives even after its own row has been
 *  filtered back out of the table. */
const results = new Map<string, TeamRun>();

/** The rows the current filters open, i.e. exactly what the comparison table renders. */
let visibleRows: TeamRow[] = [];

/* --------------------------------------------------------------- state in the URL */

/**
 * The whole page state lives in the hash, so a refresh — or the dev server's own hot reload —
 * comes back to the same table: every filter box, every checked resonator, and whichever detail
 * page was open. It's a query string once the leading `#` is off, so `URLSearchParams` reads it.
 *
 * `f` lists the filter keys that are *on*, by name rather than as a bit per box, so an old link
 * survives a `Filters` key being added, removed or reordered: an unrecognised name is ignored and
 * a missing one simply reads as off. Present-but-empty (`f=`) is every box unchecked, which is a
 * different thing from absent — absent means the URL carries no state at all and the defaults
 * stand, which is what makes an old bare `#team=...` link still work.
 */
const hashParams = (): URLSearchParams => new URLSearchParams(location.hash.replace(/^#/, ""));

const FILTER_KEYS = Object.keys(filters) as (keyof Filters)[];

/** Every filter map the hash round-trips, each under its own pair of one/two-letter query keys —
 *  `r`/`x` stayed bare for resonators since those predate the other axes; `wr`/`wx`, `er`/`ex`,
 *  `mr`/`mx`, `sr`/`sx` for weapon/echo/mainstat/sequence so none of the eight collide. */
const FILTER_GROUPS: { include: string; exclude: string; map: Map<string, ResonatorFilter> }[] = [
  { include: "r", exclude: "x", map: resonatorFilters },
  { include: "wr", exclude: "wx", map: weaponFilters },
  { include: "er", exclude: "ex", map: echoFilters },
  { include: "mr", exclude: "mx", map: mainstatFilters },
  { include: "sr", exclude: "sx", map: sequenceFilters },
];

/** Pull the hash's own state into `filters` and every filter map, and say whether either actually
 *  moved — both decide which rows *exist* (see `expandTeam()`/`teamWanted()`/`rowWanted()`), so a
 *  caller that gets `true` owes a full `refresh()` rather than just a re-route. */
function applyHash(): boolean {
  const params = hashParams();
  let changed = false;

  const f = params.get("f");
  if (f !== null) {
    const on = new Set(f.split(",").filter(Boolean));
    for (const key of FILTER_KEYS) {
      if (filters[key] === on.has(key)) continue;
      filters[key] = on.has(key);
      changed = true;
    }
  }

  // `f` is written on every sync, so its presence is what marks a URL as one this page wrote —
  // which makes a missing `r`/`x` (etc.) there mean "nothing filtered" rather than "say nothing
  // about it". Without it (an old bare `#team=...` link) the defaults stand, Verina's bar included.
  if (params.has("f")) {
    const named = (v: string | null, mode: ResonatorFilter): [string, ResonatorFilter][] =>
      (v ?? "").split(",").filter(Boolean).map((name) => [name, mode]);
    for (const { include, exclude, map } of FILTER_GROUPS) {
      const next = new Map([...named(params.get(exclude), "exclude"), ...named(params.get(include), "include")]);
      if (next.size !== map.size || [...next].some(([n, m]) => map.get(n) !== m)) {
        map.clear();
        for (const [name, mode] of next) map.set(name, mode);
        changed = true;
      }
    }
  }
  return changed;
}

/** Write the current state back into the URL. `team` defaults to whatever detail route is already
 *  open, so flipping a filter keeps the page you're on; pass a key to navigate to one, `null` to
 *  leave for the table. Filtered names need encoding — a resonator's carries spaces ("Aero Rover"),
 *  a weapon/mainstat's likely does too — since filter keys are identifiers and a row key is plain
 *  by construction (see `TeamRow`).
 *
 *  `replaceState`, not an assignment to `location.hash`: the page holds one history entry and
 *  keeps rewriting it, so ticking six boxes doesn't bury the page the user arrived from under six
 *  Back presses. It also fires no `hashchange` at all, which is why every caller here routes for
 *  itself — see the handler in `boot()`, which now only ever sees a real navigation. */
function syncHash(team: string | null = hashParams().get("team")): void {
  const named = (map: Map<string, ResonatorFilter>, mode: ResonatorFilter): string => [...map]
    .filter(([, m]) => m === mode).map(([name]) => encodeURIComponent(name)).join(",");
  const parts = [`f=${FILTER_KEYS.filter((k) => filters[k]).join(",")}`];
  for (const { include, exclude, map } of FILTER_GROUPS) {
    if (named(map, "include")) parts.push(`${include}=${named(map, "include")}`);
    if (named(map, "exclude")) parts.push(`${exclude}=${named(map, "exclude")}`);
  }
  if (team) parts.push(`team=${team}`);
  const next = `#${parts.join("&")}`;
  if (next === location.hash) return;
  history.replaceState(null, "", next);
}

/** `TEAMS` only names team compositions, not the individual combo rows the table actually renders
 *  (a row's own combo indices aren't known until `expandTeam()` runs), so a route is valid iff
 *  `results` has actually run it. */
const routeTeam = (): string | null => {
  const key = hashParams().get("team");
  return key && results.has(key) ? key : null;
};

function renderComparison(): void {
  backLink.hidden = true;
  app.innerHTML = comparisonTable(visibleRows);
  app.className = "";
  rankRows();
}

function renderDetail(key: string): void {
  backLink.hidden = false;
  app.innerHTML = page(results.get(key)!);
  app.className = "";
}

/** Whether the comparison table's own rows have been asked for yet. A `#team=...` cold load never
 *  asks (see `bootDetail()`), so the first trip to the table — the back link, or a hashchange off
 *  the detail route — is what triggers the build. Set the moment `refresh()` commits rather than
 *  when it finishes, so the `route()` inside it doesn't re-enter. */
let tableRequested = false;

const route = (): void => {
  const key = routeTeam();
  if (key) { renderDetail(key); return; }
  if (!tableRequested) { void refresh(); return; }
  renderComparison();
};

/** Wait for the browser to actually paint.
 *
 *  Two frames, not one: inside a `requestAnimationFrame` callback the frame is still being built,
 *  so resolving there would hand the thread straight back to a blocking team run and the width
 *  set a moment ago would never reach the screen. The second callback only fires once the first
 *  frame has been committed. A bare `setTimeout` can't promise that. */
const paint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** Extra time for the fill's own CSS transition (`.15s`, see index.css) to actually finish sliding
 *  to a width just set, past what `paint()`'s two frames (~33ms) cover — without it, a phase label
 *  claiming the bar is done can go up while the bar is still visibly catching up to it. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 150));

/** The loading overlay (index.html's own `#loading`) and the three things inside it this file
 *  writes to. It floats over `#app` and blurs it rather than replacing it, so the table's own
 *  filters and header stay on screen — and stay legible — for the whole run. */
const overlay = document.getElementById("loading")!;
const overlayStatus = overlay.querySelector<HTMLElement>(".status-text")!;
const overlayCount = overlay.querySelector<HTMLElement>(".progress-count")!;
const overlayFill = overlay.querySelector<HTMLElement>(".progress-fill")!;

/** Put the overlay up (or move it to a new phase) and show one line of status under the bar's own
 *  progress. `paint()`ing after is the caller's job — a phase label that never reaches the screen
 *  before the blocking work starts is the same as not setting it. */
function overlayPhase(text: string, count = ""): void {
  overlayStatus.textContent = text;
  overlayCount.textContent = count;
  overlay.hidden = false;
}

/**
 * Run every row the filters have opened that hasn't been run before, and nothing else — the whole
 * point of keying rows by combo index (see `Filters`). A first load with every Show ... Options
 * box unchecked is one row per team; ticking a box runs only the rows that box newly reached,
 * since everything else is already in `results`.
 *
 * `runTeam()` is synchronous and blocks the main thread for its whole run, so the progress bar can
 * only move if this loop yields a frame — without that, every width assignment would be collapsed
 * into one repaint after the last row finished, which is the same as having no bar at all. The
 * yield is throttled to roughly every 50ms of wall-clock work rather than one per row: a row costs
 * a couple of milliseconds (`runTeam()` computes only the comparison table's own cheap numbers —
 * see its own comment), so yielding unconditionally would let paint()'s own two-frame wait
 * (~33ms) dominate the whole loop.
 */
async function runMissing(rows: TeamRow[], workTotal: number, teamsOffset: number): Promise<void> {
  const missing = rows.filter((row) => !results.has(row.key));
  if (!missing.length) return;

  // "Initializing…" is what's on screen at parse time (see index.html); swap to the real status
  // text only once team runs are actually about to start, not a moment before.
  overlayPhase("Running Rotations…");

  // The bar measures the whole table, not just the part of it being run: rows already cached from
  // an earlier filter state start it partly filled rather than counting up to a total that turns
  // out to be smaller than the table it lands on. Only the missing rows are actually run.
  //
  // The bar's own width is scaled against `workTotal` — the echo-optimizing phase's teams plus
  // this phase's rows, fixed before either phase started (see `refresh()`) — continuing on from
  // `teamsOffset` rather than restarting at 0%, so it never resets partway through a load.
  const cached = rows.length - missing.length;
  const progress = (done: number): void => {
    overlayFill.style.width = `${((teamsOffset + done) / workTotal) * 100}%`;
    overlayCount.textContent = `${fmt(done)} / ${fmt(rows.length)}`;
  };

  progress(cached);
  let lastPaint = performance.now();
  for (let i = 0; i < missing.length; i++) {
    const row = missing[i]!;
    results.set(row.key, runTeam(row.teamKey, row.members, row.combo));
    progress(cached + i + 1);
    if (performance.now() - lastPaint > 50) {
      await paint();
      lastPaint = performance.now();
    }
  }
  await paint();
  await settle();
}

/** The one yield the main-thread fallback needs: `solveTeam()` blocks for a whole team, so the
 *  progress bar can only move if this lets go between them. Throttled, since a team is ~25ms and
 *  `paint()`'s own two-frame wait is ~33ms — yielding after every one would double the run. */
let lastPaint = performance.now();
async function breathe(): Promise<void> {
  if (performance.now() - lastPaint <= 50) return;
  await paint();
  lastPaint = performance.now();
}

/* ------------------------------------------------------------------- the worker pool */

/**
 * The build search runs off the main thread, one team per message.
 *
 * Teams are the natural unit: each is a completely independent search over its own three loadouts
 * (see solver.ts), nothing is shared but the immutable loadout definitions every worker imports
 * its own copy of, and one team is ~25ms of work — big enough that the message round trip
 * disappears, small enough that the pool stays evenly fed to the end.
 *
 * Workers are created once and kept for the session: spinning one up means fetching and parsing
 * the whole engine module graph, which costs more than most single filter flips would save.
 */
const WORKER_LIMIT = 8;

/** `null` once construction has failed — no Workers here (an old browser, a `file://` page, a
 *  Content-Security-Policy that forbids them), so `ensureBestPicks()` solves on this thread
 *  instead. Never a silent difference in results: both paths call the same `solveTeam()`. */
let pool: Worker[] | null = null;
let poolTried = false;

function workerPool(): Worker[] | null {
  if (poolTried) return pool;
  poolTried = true;
  // one per core, less the one this thread is using, capped — past a handful the run is bounded by
  // how fast the main thread can hand out work and file away the answers, not by the search
  const want = Math.max(1, Math.min(WORKER_LIMIT, (navigator.hardwareConcurrency || 4) - 1));
  try {
    pool = Array.from({ length: want }, () =>
      new Worker(new URL("./engine/solver.js", import.meta.url), { type: "module" }));
  } catch (err) {
    console.warn("Workers unavailable, optimizing on the main thread instead:", err);
    pool = null;
  }
  return pool;
}

/**
 * Hand `teams` out across the pool, at most one team in flight per worker, and file each answer
 * away as it lands. Resolves once every team has come back.
 *
 * A worker that throws is not fatal: that team is solved on this thread instead, so the table is
 * always complete. `onmessage`/`onerror` are re-pointed per task rather than accumulating
 * listeners, since a worker only ever has one task at a time.
 */
function solveOnWorkers(
  workers: Worker[], teams: [string, Member[]][], onDone: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    let next = 0, live = 0, id = 0;
    const pump = (w: Worker): void => {
      if (next >= teams.length) {
        if (--live === 0) resolve();
        return;
      }
      const [key, members] = teams[next++]!;
      const finish = (solved: Solved): void => {
        storeSolved(key, solved);
        onDone();
        pump(w);
      };
      w.onmessage = ({ data }: MessageEvent<SolveResponse>) => finish({ picks: data.picks, rows: data.rows });
      w.onerror = (e) => {
        console.warn(`worker failed on ${key}, solving it here:`, e.message);
        e.preventDefault();
        finish(solveTeam(key, members, filters));
      };
      const request: SolveRequest = {
        id: id++, teamKey: key, loadouts: members.map((m) => loadoutName(m.loadout)),
        dpsIndex: members.findIndex((m) => m.mainDps), filters,
      };
      w.postMessage(request);
    };
    // one task per worker to start; each completion pulls the next, so a slow team can't leave the
    // rest of the pool idle waiting on a fixed-size slice
    for (const w of workers.slice(0, teams.length)) { live++; pump(w); }
    if (live === 0) resolve();
  });
}

/** Find every team's own best build for the R1 allowances currently set, unless that's already
 *  been done — the phase that has to finish before a row set even exists, since a closed axis
 *  collapses to a member's own best pick. Cached per team, so this only runs on a cold load or
 *  after an R1 box changes which weapons a role may hold.
 *
 *  `inPlay` and `workTotal` come from `refresh()`, which already knows both the team count and the
 *  eventual row count (`estimatedRowCount()`) before either phase starts — so this phase's own
 *  share of the bar is fixed from the first frame instead of being scaled against just the teams,
 *  which would make the bar jump once `runMissing()` starts measuring against the real row count. */
async function ensureBestPicks(inPlay: [string, Member[]][], workTotal: number): Promise<void> {
  // `bestKey()` folds in the whole filter state, so flipping any option box is a re-solve: a
  // solve carries the team's own row set with it, each row on the main stats that build wants
  // (solver.ts's own `rowPicks()`), and which rows exist is precisely what the boxes decide.
  const teams = inPlay.filter(([key]) => !bestPicks.has(bestKey(key)));
  if (!teams.length) return;

  overlayPhase("Optimizing Echoes...");
  // teams already optimized under an earlier filter state start this partly filled rather than
  // counting up to a total smaller than the table it lands on
  let done = inPlay.length - teams.length;
  const progress = (): void => {
    overlayFill.style.width = `${(done / workTotal) * 100}%`;
    overlayCount.textContent = `${fmt(done)} / ${fmt(inPlay.length)}`;
  };
  progress();

  // a role with no weapon it may hold has no build at all, and its teams drop out of the table
  const solvable = teams.filter(([, members]) => members.every((m) => eligibleWeapons(m, filters).length));
  done += teams.length - solvable.length;

  const pool = workerPool();
  if (pool) await solveOnWorkers(pool, solvable, () => { done++; progress(); });
  else {
    for (const [key, members] of solvable) {
      storeSolved(key, solveTeam(key, members, filters));
      done++;
      progress();
      // no worker to hand this to, so the bar can only move if this thread lets go between teams
      await breathe();
    }
  }
  await paint();
}

/**
 * Re-expand every team under the current filters, run whatever that newly opened, and redraw.
 *
 * Three phases, each one visible: the rows already cached are drawn first (nothing at all on a
 * cold load — an empty table, which is the point: filters and header on screen immediately), then
 * the missing rows run under the progress bar, then the full table is built. That last phase gets
 * its own status line because it isn't free — building thousands of rows of markup blocks the
 * thread for a noticeable beat after the bar has already filled, which otherwise reads as a hang.
 *
 * That first draw is only free of cost when it's actually empty. Narrowing a filter (unticking a
 * Show ... Options box) can shrink `rows` to something wholly cached — no team to optimize, no row
 * to run — but building the resulting markup is exactly as expensive as it would be otherwise, so
 * it still needs the overlay up over it.
 *
 * The bar itself spans both phases as one fixed total, computed here before either runs:
 * `inPlay.length` teams to optimize, plus `estimatedRowCount()`'s row total for each — the latter
 * needs no solved build to know (see there), so the eventual row count is already correct on the
 * very first frame instead of only becoming known once `ensureBestPicks()` finishes. Without this,
 * reloading with options selected would fill the bar to a plain team count first, then reset and
 * refill against the larger, real row total once `runMissing()` took over.
 */
async function refresh(): Promise<void> {
  tableRequested = true; // committed, so route()'s own lazy build below doesn't re-enter
  try {
    // kicked off before the first render, not after: each worker fetches and parses its own copy of
    // the engine module graph on the way up, and that overlaps with drawing the empty table
    workerPool();
    if (!visibleRows.length) route(); // cold load: the empty table under the overlay, filters and all

    const inPlay = Object.entries(TEAMS).filter(([, members]) => teamWanted(members));
    const solvableInPlay = inPlay.filter(([, members]) => members.every((m) => eligibleWeapons(m, filters).length));
    const rowsTotal = solvableInPlay.reduce((sum, [, members]) => sum + estimatedRowCount(members), 0);
    const workTotal = inPlay.length + rowsTotal || 1; // guard: no team survives the resonator filters

    await ensureBestPicks(inPlay, workTotal);
    const rows = teamRows();
    const cached = rows.filter((row) => results.has(row.key));
    if (cached.length) {
      // credited here rather than left for `runMissing()`: when this filter change added no new
      // rows, that call is a no-op and never touches the bar at all, leaving it at whatever
      // `ensureBestPicks()` last set — visibly short of full behind a label that says "done". Only
      // settling when this draw is the last one: otherwise `runMissing()` picks the bar straight
      // back up a moment later, and the extra wait would just slow down every ordinary filter flip.
      overlayPhase("Rendering Table…");
      overlayFill.style.width = `${((inPlay.length + cached.length) / workTotal) * 100}%`;
      overlayCount.textContent = `${fmt(cached.length)} / ${fmt(rows.length)}`;
      await paint();
      if (cached.length === rows.length) await settle();
    }
    visibleRows = cached;
    route();
    await runMissing(rows, workTotal, inPlay.length);
    // nothing was missing — the draw above was already the whole table, so don't build it twice
    if (cached.length !== rows.length) {
      overlayPhase("Rendering Table…");
      await paint();
      visibleRows = rows;
      route();
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = errorPage(err);
    app.className = "";
  }
  overlay.hidden = true;
}

/**
 * A `#team=...` load, served without touching the rest of the table: the row is rebuilt from its
 * own key (`rowFromKey()`) and run on its own, so a direct link — or a hot reload sitting on one —
 * costs a single team run rather than optimizing every team and running every row they open.
 *
 * Run traced from the start, since `detailFor()` needs the resolved lines anyway and would
 * otherwise re-run the same team a second time to get them.
 *
 * `false` if there's no detail route to serve, or the key is stale — the caller then builds the
 * table as usual and `route()` lands on it.
 */
async function bootDetail(): Promise<boolean> {
  const key = hashParams().get("team");
  if (!key || results.has(key)) return false;
  const row = rowFromKey(key);
  if (!row) return false;

  overlayPhase("Running Rotation…");
  await paint();
  results.set(key, runTeam(row.teamKey, row.members, row.combo, true));
  renderDetail(key);
  overlay.hidden = true;
  return true;
}

async function boot(): Promise<void> {
  // before the first run, not after: the filters decide which rows even exist, so a reloaded URL
  // has to be read while there is still nothing built
  applyHash();
  if (!await bootDetail()) await refresh();
  // and back out again, so a bare URL (or an old `#team=...` link) picks up the defaults it ran under
  syncHash();

  // Only a real navigation gets here — a hand-edited URL, or a Back press onto a hash left in the
  // history from before. `syncHash()` writes fire nothing (see there). Filters that moved need the
  // whole row set re-expanded; anything else is just a different detail route.
  addEventListener("hashchange", () => {
    if (applyHash()) { void refresh(); return; }
    // a detail route this session hasn't run — a URL pasted into an already-open tab — is worth
    // the one team run `bootDetail()` does, the same as it would be on a cold load, rather than
    // the whole table build `route()` would otherwise fall through to
    const key = hashParams().get("team");
    if (key && !results.has(key) && rowFromKey(key)) { void bootDetail(); return; }
    route();
  });
  wireSourcePanels(app);
  // routed by hand: `syncHash()` only rewrites the URL, it never navigates
  document.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>(".gotodetail");
    if (el?.dataset.team) { syncHash(el.dataset.team); route(); }
  });
  // clicking a `% of Baseline` cell measures every other team against that one
  document.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>(".c.baseline");
    if (el?.dataset.team) setBaseline(el.dataset.team);
  });
  // Every filter checkbox but Sequences is a `Filters` key (see `comparisonFilters()`): flip it,
  // then re-expand — which axes are open changes which rows exist, not just which are visible.
  // Unchecking a weapon/echo/mainstat box drops its own column, so any filter set by clicking a
  // cell in it would otherwise be left behind with no cell left to clear it from — cleared here
  // instead, the moment the column that could set it disappears.
  const AXIS_MAP: Partial<Record<keyof Filters, Map<string, ResonatorFilter>>> = {
    mdpsSequences: sequenceFilters, supportSequences: sequenceFilters,
    mdpsWeapons: weaponFilters, supportWeapons: weaponFilters,
    mdpsEchoes: echoFilters, supportEchoes: echoFilters,
    mdpsMainstats: mainstatFilters, supportMainstats: mainstatFilters,
  };
  document.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    const key = input.id as keyof Filters;
    if (!(key in filters)) return;

    // Both directions are costed, not just the box being checked: unchecking one clears that
    // axis's own gear filters with it, and a table that was only inside the cap because those
    // filters were narrowing it grows the moment they go (see `withRowCap()`).
    withRowCap(() => {
      const was = filters[key];
      const map = AXIS_MAP[key];
      const kept = map ? [...map] : null;
      filters[key] = input.checked;
      if (!input.checked) map?.clear();
      return () => {
        filters[key] = was;
        input.checked = was;   // the box itself, or it reads as set while nothing behind it is
        if (map && kept) { map.clear(); for (const [n, mode] of kept) map.set(n, mode); }
      };
    });
  });
  // A resonator's own name, anywhere in the comparison table: left click requires them, right
  // click bars them, and either one clicked again clears it. The filter is by name, so it applies
  // everywhere that name appears rather than only to the row clicked.
  const resonatorName = (e: Event): [Map<string, ResonatorFilter>, string] | undefined => {
    const el = (e.target as Element).closest<HTMLElement>(".c.name.res");
    const sequence = el?.dataset.sequence;
    if (sequence) return [sequenceFilters, sequence];
    return el?.dataset.resonator ? [resonatorFilters, el.dataset.resonator] : undefined;
  };
  document.addEventListener("click", (e) => {
    const target = resonatorName(e);
    if (target) setFilter(...target, "include");
  });
  document.addEventListener("contextmenu", (e) => {
    const target = resonatorName(e);
    if (!target) return;
    e.preventDefault(); // the browser menu would bury the table under itself otherwise
    setFilter(...target, "exclude");
  });
  // A weapon/echo/mainstat pick's own cell, anywhere in the table: same left click/right click
  // pair as a resonator's name, just keyed by `data-kind`/`data-value` instead of `data-resonator`
  // so one pair of handlers covers all three axes (see `optionCell()`).
  const optionPick = (e: Event): [Map<string, ResonatorFilter>, string] | undefined => {
    const el = (e.target as Element).closest<HTMLElement>(".c.option");
    const kind = el?.dataset.kind as OptionKind | undefined;
    const value = el?.dataset.value;
    return kind && value ? [OPTION_FILTER_MAPS[kind], value] : undefined;
  };
  document.addEventListener("click", (e) => {
    const pick = optionPick(e);
    if (pick) setFilter(...pick, "include");
  });
  document.addEventListener("contextmenu", (e) => {
    const pick = optionPick(e);
    if (!pick) return;
    e.preventDefault();
    setFilter(...pick, "exclude");
  });
  // A chip above the table: clicking it clears that filter, whichever way it was set — a resonator
  // one by its own `data-resonator`, a pick one by `data-kind`/`data-value` (see `resonatorChips()`).
  document.addEventListener("click", (e) => {
    const chip = (e.target as Element).closest<HTMLElement>(".rchip");
    if (!chip) return;
    const name = chip.dataset.resonator;
    const kind = chip.dataset.kind as OptionKind | undefined;
    const map = name ? resonatorFilters : kind ? OPTION_FILTER_MAPS[kind] : undefined;
    const key = name ?? chip.dataset.value;
    const was = map && key ? map.get(key) : undefined;
    if (!map || !key || was === undefined) return;
    withRowCap(() => {
      map.delete(key);
      return () => map.set(key, was);
    });
  });
}

/** Set one filter, or clear it if that's already the way it's set — so the same click that set it
 *  undoes it, and the chip above the table is the other way out. Shared by resonator names and
 *  weapon/echo/mainstat picks alike; only the map differs. Costed either way (`withRowCap()`):
 *  clearing one widens the table by exactly what setting it narrowed, and a filter is the usual
 *  way *back* under the cap, so it can as easily be the way over it. */
function setFilter(map: Map<string, ResonatorFilter>, name: string, mode: ResonatorFilter): void {
  withRowCap(() => {
    const was = map.get(name);
    if (was === mode) map.delete(name); else map.set(name, mode);
    return () => { if (was === undefined) map.delete(name); else map.set(name, was); };
  });
}

// back to the table, keeping the filters that got you to this page in the URL
backLink.addEventListener("click", (e) => { e.preventDefault(); syncHash(null); route(); });

// async now (it yields a frame between teams so the progress bar can move), so anything thrown
// after its own try/catch — wiring up the page, the first render — would otherwise surface as an
// unhandled rejection in the console and a blank page with no explanation
boot().catch((err: unknown) => {
  console.error(err);
  app.innerHTML = errorPage(err);
  app.className = "";
});
