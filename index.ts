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
import { Gear, Stat, Attribute, Type1, Type2, scopedStat, menuStats, baseSequence } from "./src/kit.js";
import { Action } from "./src/rotation.js";
import { TUNE_BREAK_ENEMY } from "./src/shared/tunebreak.js";
import type { ChainGroup, HeldBuff, ResolvedSnapshot, Loadout, EchoLoadout } from "./src/kit.js";
import { buildReport, columnSources, columnOf, OFFTUNE_RATE, ENERGY_RATE } from "./src/display.js";
import type { Report, Column, ReportRow, ReportPart, TraceEntry, InfoEntry } from "./src/display.js";
import { Scaling, isPercent, statLabel, SCALING_NAME, TAG_NAME, NODE_NAME } from "./src/stats.js";
import { member, comboOf, runTeam, runFromScore, eligibleWeapons, sequenceLevels, solveTeam, MAINSTAT_ROWS } from "./src/solver.js";
import type { Member, Combo, Pick, Filters, TeamRun, Solved, SolveRequest, SolveResponse } from "./src/solver.js";
import { teamKey, ALL_TEAMS } from "./src/teams.js";


/* ------------------------------------------------------------------------------------ teams */

/** Every team the page compares (teams.ts), keyed by the name that team answers to — its own slot
 *  in `ALL_TEAMS` (teams.ts's own `teamKey()`), which is also what a worker is handed to rebuild
 *  it. A plain identifier with no dash, since a row's key is this plus its per-member combo keys
 *  (`expandTeam()`), and a team key never carries a dash of its own. */
const TEAMS: Record<string, Member[]> = Object.fromEntries(ALL_TEAMS.map(({ loadouts, dpsIndex }, i) => [
  teamKey(i),
  loadouts.map((l, j) => member(l, j === dpsIndex)),
]));

/** Which way a resonator has been filtered: `include` keeps only the teams that field them,
 *  `exclude` drops every team that does. */
type ResonatorFilter = "include" | "exclude";

/** Resonators filtered by name, set from their own name cell in the comparison table — left click
 *  to require one, right click to bar one (see the handlers in `boot()`) — and cleared again by
 *  either click on a name that already carries one, or by that name's own chip above the table
 *  (`resonatorChips()`). Like the filter boxes,
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
 *  Only ever holds a level above that resonator's own baseline, and only where the chain is a
 *  build choice at all: the baseline itself is just the resonator, and a `Tier.Free` one only ever
 *  runs at full, so both go through `resonatorFilters` instead (see `sequenceTag()`). */
const sequenceFilters = new Map<string, ResonatorFilter>();

/** Every option-pick filter map, keyed by the `data-kind` its own column/chip carries — what the
 *  generic click handlers in `boot()` key off rather than one handler per axis. */
const OPTION_FILTER_MAPS = {
  weapon: weaponFilters, echo: echoFilters, mainstat: mainstatFilters, sequence: sequenceFilters,
} as const;
type OptionKind = keyof typeof OPTION_FILTER_MAPS;

/** What the search bar under the filter boxes currently holds — module-level so a redraw (every
 *  filter change rebuilds the whole `<main>`) puts the text back in the fresh input. */
let searchText = "";
type SearchKind = "resonator" | OptionKind;

const filters: Filters = {
  mdpsSequences: false, supportSequences: false,
  mdpsWeapons: false, supportWeapons: false,
  mdpsEchoes: false, supportEchoes: false,
  mdpsMainstats: false, supportMainstats: false,
  allowR1Mdps: true, allowR1Supports: true,
  matrix: false,
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

/** Put the caret back in the search bar, at the end of whatever it holds. Called after every
 *  redraw — each one rebuilds the input, so typing, clicking a result and typing again never needs
 *  a mouse — and after a search result whose filter change was *refused*, which redraws nothing
 *  and would otherwise leave focus on the result button, the next keystroke going nowhere and the
 *  bar reading as though it had closed itself. */
function focusSearch(): void {
  const search = document.querySelector<HTMLInputElement>("#optionSearch");
  if (!search) return;
  search.focus({ preventScroll: true });
  search.setSelectionRange(search.value.length, search.value.length);
}

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
// ...except Matrix Mode, for a team nobody's Matrix reaches: its solve is the same either way,
// so it keeps the key it had with the box off rather than being solved twice.
const bestKey = (teamKey: string): string => {
  const f = { ...filters, matrix: filters.matrix && !!TEAMS[teamKey]?.some((m) => m.loadout.matrix) };
  return `${teamKey}|${Object.values(f).join(",")}`;
};

/** Every team's own best build, under only the flags the *search* reads: the two R1 allowances
 *  and the weapon boxes (which weapons may be searched — `eligibleWeapons()`) and Matrix Mode.
 *  The echo and main-stat boxes change which rows a solve opens, never which build wins (both
 *  axes are searched in full regardless), and the sequence boxes only add un-searched rows — so a
 *  flip of any of those hands the worker the build it already found and it redoes the rows alone
 *  (solver.ts's own `solveTeam()`), which is most of a solve skipped. */
const picksCache = new Map<string, Pick[]>();
const picksKey = (teamKey: string): string => {
  const matrix = filters.matrix && !!TEAMS[teamKey]?.some((m) => m.loadout.matrix);
  return `${teamKey}|${filters.allowR1Mdps},${filters.allowR1Supports},${filters.mdpsWeapons},${filters.supportWeapons},${matrix}`;
};

/** File one solved team's own answer away — whether it was solved in a worker or on this thread,
 *  it's the same plain indices either way (see solver.ts's own `SolveResponse`). */
function storeSolved(teamKey: string, solved: Solved): void {
  bestPicks.set(bestKey(teamKey), solved);
  picksCache.set(picksKey(teamKey), solved.picks);
  solvesDirty = true;
}

/* --------------------------------------------------- solves kept across reloads */

/**
 * Everything solved this session is kept in `localStorage`, and put back on the next load — so a
 * reload lands on the table with no search at all, and the cold load's whole solve phase is paid
 * once per build rather than once per visit. Plain indices and figures (`Solved`), so the whole
 * roster is a few hundred KB.
 *
 * Keyed on the build: serve.py's own `/__livereload` reports a checksum of every watched source
 * file, so an edit to any kit — anything that could move a number — reads as a different build and
 * the saved solves are simply ignored. No stamp (another host, or no server) means no cache
 * either way: there is nothing safe to key it on. Over quota, the save is dropped and the next
 * load solves again; nothing here is ever the only copy of anything.
 */
const SOLVES_KEY = "wuwa.solves.v1";
let buildStamp: string | null = null;
let solvesDirty = false;

async function loadSolves(): Promise<void> {
  try {
    const res = await fetch("/__livereload", { cache: "no-store" });
    if (!res.ok) return;
    buildStamp = await res.text();
    const raw = localStorage.getItem(SOLVES_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { stamp: string; solves: [string, Solved][]; picks: [string, Pick[]][] };
    if (saved.stamp !== buildStamp) return;
    for (const [k, v] of saved.solves) bestPicks.set(k, v);
    for (const [k, v] of saved.picks) picksCache.set(k, v);
  } catch { /* no server stamp, no storage, or a stale shape — nothing to restore */ }
}

function saveSolves(): void {
  if (buildStamp === null || !solvesDirty) return;
  solvesDirty = false;
  try {
    localStorage.setItem(SOLVES_KEY, JSON.stringify({ stamp: buildStamp, solves: [...bestPicks], picks: [...picksCache] }));
  } catch { /* over quota — solved again next load */ }
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
 *  shown — "Phrolova S5" — and nothing at all otherwise. A resonator's own baseline level
 *  (`baseSequence()`) is what every row already runs, so that one is the plain resonator filter's
 *  business; so is any position whose own Sequences box is shut, since then every row runs the one
 *  level and a filter on it would say nothing. */
function sequenceTagAt(m: Member, sequence: number, f: Filters = filters): string | null {
  const open = f[m.mainDps ? "mdpsSequences" : "supportSequences"];
  if (!open || sequence <= baseSequence(m.loadout.resonator)) return null;
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
  solved.rows.forEach((picks, r) => {
    const combo = picks.map((p: Pick, i: number) => comboOf(members[i]!.loadout, p));
    const key = `${teamKey}-${combo.map((c: Combo) => c.key).join("-")}`;
    if (rows.has(key)) return;
    rows.set(key, { key, teamKey, members, combo });
    // the search scored this row already (solver.ts's own `Solved.scores`), so it's filed as run
    // here rather than being run again by `runMissing()`
    const score = solved.scores[r];
    if (score && !results.has(key)) results.set(key, runFromScore(teamKey, members, combo, score));
  });

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
  // closed box would show (their own baseline), which carries no tag at all, and
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
    const parsed = /^(\d+)\.(\d+)\.(\d+)\.s(\d+)(\.m)?$/.exec(comboKeys[i]!);
    if (!parsed) return null;
    const l = members[i]!.loadout;
    const pick: Pick = { weapon: +parsed[1]!, echo: +parsed[2]!, mainstat: +parsed[3]!, sequence: +parsed[4]!, matrix: !!parsed[5] };
    if (!l.weapons[pick.weapon] || !l.echoLoadouts[pick.echo] || !l.mainstats[pick.mainstat] || (pick.matrix && !l.matrix)) return null;
    combo.push(comboOf(l, pick));
  }
  return { key, teamKey, members, combo };
}

/** Every resonator's own colour, by name — read off every team's own loadouts so a chip can be
 *  painted for anyone the table can field, not just whoever a currently-visible team does. */
const RESONATOR_HUE = new Map(
  ALL_TEAMS.flatMap((t) => t.loadouts).map((l) => [l.resonator.name, l.resonator.color] as const),
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

/** One formatter per (digits, pad, group) shape, made on first use: `toLocaleString` builds a
 *  fresh Intl.NumberFormat on every call (~22µs), and a table draw makes ~30 calls per row —
 *  it was half of every redraw. A kept instance formats in under 1µs. */
const formatters = new Map<string, Intl.NumberFormat>();

/** @param group  thousands separators — off for the action table's own rows, whose columns sit
 *  tight against one another (see display.ts's own `num`, which sizes them). */
const fmt = (v: number | string | null | undefined, digits = 0, pad = false, group = true): string => {
  if (typeof v !== "number") return String(v ?? "");
  const key = `${digits}${pad ? "p" : ""}${group ? "g" : ""}`;
  let f = formatters.get(key);
  if (!f) formatters.set(key, f = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: pad ? digits : 0, useGrouping: group }));
  return f.format(v);
};

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
 *  a track is that count scaled by the CSS --cw, plus the cell's own padding. The same wherever
 *  the column sits: the two outermost used to take the table's own run-out (`--lead`) into their
 *  tracks as well, so a column changed width just by being dragged to or from an end. The run-out
 *  is the row's own padding now (index.css's `.r`), outside every track. */
const colWidth = (c: Column): string => `calc(var(--cw) * ${c.width} + var(--cpad))`;

function cell(columns: Column[], index: number, { cls = [], html = "", pop = "", style = "" }: { cls?: string[]; html?: string; pop?: string; style?: string }): string {
  const classes = ["c", columns[index]!.align === "left" ? "" : "num", ...cls].filter(Boolean).join(" ");
  return `<span class="${classes}"${style ? ` style="${style}"` : ""}${pop}>${html}</span>`;
}

/** A hover panel, parked as its cell's own `data-pop` attribute rather than built into the page.
 *  Emitted as an attribute, so it goes inside a cell's start tag, not between its tags.
 *
 *  One detail page carries thousands of these, and a comparison row's Total DPR panel is a whole
 *  nested table: 1.8MB of the action log's 2MB of markup is panels, nearly none of which anyone
 *  ever opens. As `<template>`s they were at least inert — not rendered, not styled — but the
 *  browser still had to parse every one of them into a fragment of real nodes, which cost about
 *  40ms of the ~45ms it took to put a detail page up. An attribute is just a string hanging off
 *  the cell: scanned by the parser, never built. `wireSourcePanels` parses one, once, the first
 *  time its own cell is hovered, so only panels somebody actually opens are ever built at all.
 *
 *  Single-quoted, and `<`/`>` left alone: all three are legal inside an attribute value, and the
 *  panel markup is full of double quotes of its own — delimiting with `"` would turn every one of
 *  them into `&quot;` and put a megabyte back that the parser then has to decode again. */
const lazyPop = (html: string): string => (html
  ? ` data-pop='${html.replace(/&/g, "&amp;").replace(/'/g, "&#39;")}'` : "");

/** A hover panel that isn't even *built* until its cell is first hovered — the attributes a cell
 *  carries instead of parked markup. `lazyPop` defers the parse; this defers the string too,
 *  which for the comparison table was the bulk of a draw (a `menuStats()` pass per member and
 *  two dozen formatted figures per row, for panels almost none of which are ever opened).
 *  `wireSourcePanels` hands the kind and key to `buildPop()` on first hover. */
const deferredPop = (kind: string, key: string): string => ` data-pop-kind="${kind}" data-pop-key="${esc(key)}"`;

/** The comparison table's own deferred panels, by kind: a row's Total DPR breakdown, and a member's
 *  loadout — both read straight out of `results` by the row key the cell carries. */
function buildPop(kind: string, key: string): string {
  if (kind === "dpr") {
    const run = results.get(key);
    return run ? `<span class="pop dpr">${dprTable(run)}</span>` : "";
  }
  if (kind === "gear") {
    const at = key.lastIndexOf("|");
    const run = results.get(key.slice(0, at));
    const src = Number(key.slice(at + 1));
    return run ? gearPopoverHtml(run.members[src]!, run.combo[src]!) : "";
  }
  return "";
}

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
  const own = r.owner !== undefined ? (slotHue.get(r.owner ?? "") ?? TUNE_BREAK_ENEMY.color) : null;
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
  // `stat`: one of the figure panels, whose headings read flush right over the column of numbers
  // they head (index.css) — unlike the resonator's own buff list or an action's fields
  return lazyPop(`<span class="pop stat${col.key === "avg" ? " damage" : ""}"><table>${titled}`
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
      const hue = slotHue.get(e.source) ?? TUNE_BREAK_ENEMY.color;
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
  // Nothing held still opens a panel saying so — hovering a name and getting no panel at all reads
  // as a broken hover rather than as an answer.
  if (!showGear && !local.length && !global.length && !enemy.length) {
    return lazyPop(`<span class="pop buffs"><table><tr class="sec"><td>No buffs</td></tr></table></span>`);
  }
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
      + sorted(buffs).map((b) => row(b.name, slotHue.get(b.source) ?? TUNE_BREAK_ENEMY.color)).join("")
    : "");
  // Three columns side by side rather than one stacked list: local, global and enemy are separate
  // scopes, not a sequence, and stacked they made a member holding a dozen buffs a page-tall panel.
  // Gear stays above the local buffs — it is this member's own, the same scope that column holds.
  const columns = [
    gearSection + section("Local buffs", local),
    section("Global buffs", global),
    section("Enemy debuffs", enemy),
  ].filter(Boolean).map((rows) => `<table>${rows}</table>`).join("");
  return lazyPop(`<span class="pop buffs"><div class="cols">${columns}</div></span>`);
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
    // a field window's summary restates hits that are lines of their own (kit.ts's `aggregate`)
    if (line.aggregate) continue;
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
    if (line.aggregate) continue; // see sumByTag
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
  return [l.inherent1, l.inherent2, combo.weapon, combo.echo.mainslot, combo.echo.sonata, combo.echo.sonata2pc, combo.mainstat, l.substat,
    ...(combo.matrix ? [combo.matrix] : [])];
}
const GEAR_LABELS = ["Inherent", "Inherent", "Weapon", "Mainslot", "Sonata", "2pc", "Mainstats", "Substats", "Matrix"];

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
function gearPopoverHtml(member: Member, combo: Combo): string {
  const stats = menuStatRows(member, combo)
    .map((r) => `<tr class="stat"><td class="k">${esc(r.label)}</td><td class="v">${esc(r.value)}</td></tr>`)
    .join("");
  return `<span class="pop gear"><table>${gearRows(member, combo)}${stats}</table></span>`;
}
const gearPopover = (member: Member, combo: Combo): string => lazyPop(gearPopoverHtml(member, combo));

/** What a member's own name cell reads as: the resonator, then their sequence level and weapon
 *  rank as one token (`S0R1`) — the level this row actually runs at (see `sequenceLevels()`), and
 *  R1 when this row's weapon is a signature/limited one rather than a standard (see kit.ts's own
 *  `Weapon.standard`). Always shown, weapon options box or no: the weapon/echo/mainstat picks
 *  themselves live in their own columns now (see `optionCell()`), not appended here, so there's
 *  nothing left for the rank marker to be redundant with. */
function memberLabel(m: Member, combo: Combo): string {
  const l = m.loadout;
  const mdps = m.mainDps;
  // A chain that comes with the character rather than being pulled for is always worth naming (a
  // free resonator's S6, a standard 5-star's S2); a limited one's S0 says nothing until that
  // role's Sequences box is open — and once it is, this is the one thing telling that member's
  // own rows apart (see `sequenceLevels()`).
  const seq = baseSequence(l.resonator) > 0 || (mdps ? filters.mdpsSequences : filters.supportSequences)
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

/** Every name the search bar can offer: resonators always, plus each gear axis's own picks — but
 *  only from members whose role has that axis's "Show ... Options" box checked, so the search can
 *  only set a filter a table cell could also set (and a chip can clear). The strings are exactly
 *  what the filter maps key on: weapon/mainstat names, `echoLabel()`, `sequenceTagAt()` tags. */
function searchCandidates(): { kind: SearchKind; value: string }[] {
  const seen = new Set<string>();
  const out: { kind: SearchKind; value: string }[] = [];
  const add = (kind: SearchKind, value: string): void => {
    if (value && !seen.has(`${kind}|${value}`)) { seen.add(`${kind}|${value}`); out.push({ kind, value }); }
  };
  for (const members of Object.values(TEAMS)) {
    for (const m of members) {
      add("resonator", m.name);
      const open = (mdps: keyof Filters, support: keyof Filters): boolean => filters[m.mainDps ? mdps : support];
      if (open("mdpsWeapons", "supportWeapons")) for (const i of eligibleWeapons(m, filters)) add("weapon", m.loadout.weapons[i]!.name);
      if (open("mdpsEchoes", "supportEchoes")) for (const e of m.loadout.echoLoadouts) add("echo", echoLabel(m.loadout, e));
      if (open("mdpsMainstats", "supportMainstats")) for (const g of m.loadout.mainstats) add("mainstat", g.name);
      // a closed Sequences box collapses sequenceLevels() to the baseline alone, so this adds nothing then
      for (const level of sequenceLevels(m, filters).slice(1)) {
        const tag = sequenceTagAt(m, level);
        if (tag) add("sequence", tag);
      }
    }
  }
  return out;
}

/** The top 5 candidates containing the typed text, earliest match first — each one a row that
 *  filters exactly like the table cell it stands for: left click requires it, right click bars it
 *  (see the handlers in `boot()`). Empty markup while nothing is typed. */
function searchResults(): string {
  const text = searchText.trim().toLowerCase();
  if (!text) return "";
  const KIND_LABEL: Record<SearchKind, string> = {
    resonator: "Resonator", weapon: "Weapon", echo: "Echo", mainstat: "Mainstat", sequence: "Sequence",
  };
  const hits = searchCandidates()
    .map((c) => ({ ...c, at: c.value.toLowerCase().indexOf(text) }))
    .filter((c) => c.at !== -1)
    .sort((a, b) => a.at - b.at || a.value.localeCompare(b.value))
    .slice(0, 5);
  if (!hits.length) return `<div class="sresult none">no matches</div>`;
  return hits.map(({ kind, value }) => {
    const hue = kind === "resonator" ? RESONATOR_HUE.get(value)
      : kind === "sequence" ? RESONATOR_HUE.get(value.replace(/ S\d+$/, "")) : undefined;
    return `<button type="button" class="sresult" data-kind="${kind}" data-value="${esc(value)}"`
      + (hue ? ` style="--mem:${hue}"` : "")
      + ` title="${esc(value)} — left click: only rows using them; right click: no row using them; either click again to clear.">`
      + `${esc(value)}<span class="skind">${KIND_LABEL[kind]}</span></button>`;
  }).join("");
}

/** The filter checkboxes above the comparison table, one row per role: MDPS on top, supports
 *  below, each row the same four axes plus that role's own R1 allowance.
 *
 *  Sequences: unchecked, that role's own members each run their resonator's baseline chain level
 *  and nothing else — S0 for a limited 5-star, S2 for a standard one, S6 for a 4-star or Rover
 *  (see stats.ts's own `Tier`). Checked, every level from that baseline up to S6 opens a row of
 *  its own. A `Tier.Free` resonator is already at the top, so the box never adds a row for them.
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
    <div class="tcfilter-row">
      ${filter("matrix", "Enable Matrix Buffs")}
    </div>
    ${resonatorChips()}
    <div class="tcsearch">
      <input id="optionSearch" type="search" placeholder="Search resonators, weapons, echoes…"
        autocomplete="off" spellcheck="false" value="${esc(searchText)}">
      <div class="tcsearch-results" id="searchResults">${searchResults()}</div>
    </div>
    <div class="tcwarning" id="rowCapWarning" hidden></div>
  </div>`;
}

/** Every filter currently set — resonators plus weapon/echo/mainstat picks — one chip apiece
 *  between the filter boxes and the search bar: the name, and a box saying which way it's filtered
 *  — a green tick for "every row must use them", a red cross for "no row may". Clicking one clears
 *  it (see `boot()`), as does either click on that name or pick anywhere else it appears
 *  (`setFilter()`). Above the search bar rather than under it, which is where they read from: the
 *  results list drops under the input and floats (index.css), so chips below it were chips an open
 *  list covered — and a press meant for one landed on a result row instead.
 *
 *  A `<button>`, not a div: it's a real control, so it gets keyboard focus and Enter/Space for
 *  free. Nothing renders at all when no filter is set, rather than an empty row holding open the
 *  gap `.tcfilters` puts between its rows — which is what keeps the search bar still as filters
 *  come and go, rather than stepping down a row's worth the moment the first chip appears. */
function resonatorChips(): string {
  const nameChips = [...resonatorFilters].map(([name, mode]) => {
    const included = mode === "include";
    // The pill wears that resonator's own hue the way their name cell in the table does; the
    // tick/cross inside it stays green/red whoever the chip is for, since that's the half that
    // says which way the filter runs (see index.css's own `.rchip`).
    return `<button type="button" class="rchip ${included ? "inc" : "exc"}" data-resonator="${esc(name)}"`
      + ` style="--mem:${RESONATOR_HUE.get(name) ?? TUNE_BREAK_ENEMY.color}"`
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

/** Which member positions have their own DPR column open, by column position — 0 is the leftmost
 *  (Slot 3), 2 the rightmost (Slot 1). Toggled by clicking that position's Slot heading. Purely a
 *  display column: it opens no rows, so nothing is re-solved and nothing is costed against
 *  `ROW_CAP` — the table is just redrawn. Module-level so it survives a re-render. */
const dprOpenAt = [false, false, false];

/** Which member stands at each column of a row, left to right, as indices into `members`. The
 *  columns are numbered right to left — Slot 1 is the rightmost — and the row is rotated so that
 *  Slot 1 is the team's own main DPS, the one `teams.ts` named with its single-loadout slot
 *  (`dpsIndex`), not whoever happened to out-damage them on this combo. A rotation, not a sort:
 *  members are a cycle (each one's Outro hands to the next one's Intro), so shifting the whole
 *  ring leaves the real intro/outro order intact and only changes where it is cut. */
function displayOrder(members: Member[]): number[] {
  // the main DPS ends up last, so the cut is immediately after them (-1 can't happen — teams.ts
  // throws on a team with no MDPS slot — and would leave the play order as it stands anyway)
  const cut = (members.findIndex((m) => m.mainDps) + 1) % members.length;
  return members.map((_, i) => (cut + i) % members.length);
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
  // read in each row's own display order (`displayOrder()`), so a column is opened by whoever
  // actually stands there once the row has been rotated
  for (const row of rows) {
    displayOrder(row.members).forEach((src, pos) => {
      const mdps = row.members[src]!.mainDps;
      if (mdps ? filters.mdpsWeapons : filters.supportWeapons) weaponOpenAt[pos] = true;
      if (mdps ? filters.mdpsEchoes : filters.supportEchoes) echoOpenAt[pos] = true;
      if (mdps ? filters.mdpsMainstats : filters.supportMainstats) mainstatOpenAt[pos] = true;
    });
  }

  const rowHtml = (key: string, run: TeamRun, rank: RowRank): string => {
    const grand = run.total;
    const order = displayOrder(run.members);
    const memberNames = order.map((src) => run.members[src]!.name).join("|");

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
    const memberCell = (m: Member, combo: Combo, i: number, src: number) => {
      const mdps = m.mainDps;
      const tag = sequenceTag(m, combo);
      // the loadout hover is built on first hover (see `deferredPop`), keyed by row and member
      const name = `<div class="c name res has" data-resonator="${esc(m.name)}"`
        + (tag ? ` data-sequence="${esc(tag)}"` : "")
        + deferredPop("gear", `${key}|${src}`)
        + ` style="--mem:${m.color};color:${m.color}">`
        + `<span class="res-label">${esc(memberLabel(m, combo))}</span>`
        + `</div>`;
      // populated only while this axis is open for *this member's own* role — the same gate the
      // label used to apply — even though the column itself exists as soon as this position needs
      // it for anyone (see `weaponOpenAt` above)
      const weapon = weaponOpenAt[i] ? optionCell("weapon", (mdps ? filters.mdpsWeapons : filters.supportWeapons) ? combo.weapon.name : "", m.color) : "";
      const echo = echoOpenAt[i] ? optionCell("echo", (mdps ? filters.mdpsEchoes : filters.supportEchoes) ? echoLabel(m.loadout, combo.echo) : "", m.color) : "";
      const mainstat = mainstatOpenAt[i] ? optionCell("mainstat", (mdps ? filters.mdpsMainstats : filters.supportMainstats) ? combo.mainstat.name : "", m.color) : "";
      // this member's own share of the row's Avg Team DPR — the same mean `run.total` is, so the
      // three read against each other and against the Total column directly
      const dpr = dprOpenAt[i]
        ? `<div class="c num slotdpr" style="--mem:${m.color}">${fmt(run.bySlot.get(m.name) ?? 0)}</div>`
        : "";
      return name + weapon + echo + mainstat + dpr;
    };
    const memberCells = order.map((src, pos) => memberCell(run.members[src]!, run.combo[src]!, pos, src)).join("");

    // the hue (`--hue`) and the baseline percentage are relative to whichever team is currently
    // the baseline — ranked in data by `rankAll()` before any row is drawn (see `setBaseline()`)
    return `<div class="trow${rank.pinned ? " isbaseline" : ""}" style="--hue:${rank.hue}" data-team="${esc(key)}" data-team-key="${esc(run.teamKey)}"`
      + ` data-members="${esc(memberNames)}" data-total="${grand}">`
      + memberCells
      + `<div class="c num total teamdpr gotodetail" data-team="${esc(key)}"`
      + deferredPop("dpr", key)
      + `>${fmt(grand)}<span class="arrow">›</span></div>`
      // clicking the cell makes that row the baseline (see `setBaseline()`)
      + `<div class="c num total baseline" data-team="${esc(key)}" title="Click to measure every team against this one">${rank.pct}</div>`
      + `</div>`;
  };

  const memberHead = (n: number, i: number) => `<div class="c slothead${dprOpenAt[i] ? " open" : ""}" data-pos="${i}" title="Click to show this slot's own DPR">Slot ${n}<span class="arrow">›</span></div>`
    + (weaponOpenAt[i] ? `<div class="c">Weapon ${n}</div>` : "")
    + (echoOpenAt[i] ? `<div class="c">Echo Set ${n}</div>` : "")
    + (mainstatOpenAt[i] ? `<div class="c">Mainstats ${n}</div>` : "")
    + (dprOpenAt[i] ? `<div class="c num">DPR ${n}</div>` : "");
  const head = `<div class="trow thead">`
    + memberHead(3, 0) + memberHead(2, 1) + memberHead(1, 2)
    + `<div class="c num">Team DPR</div>`
    + `<div class="c num">% of Baseline</div>`
    + `</div>`;

  // one grid track per column actually rendered above, position by position — a member's name
  // plus however many of the three option columns that position earned, then Total and Baseline%.
  // Computed here rather than left to a fixed rule in index.css, since both the column count and
  // which position has which now depend on which axes are open and who's actually standing where
  // (see index.css's own `.tgrid` for the no-options-open default this overrides).
  const posCols = (i: number) => `max-content${weaponOpenAt[i] ? " max-content" : ""}${echoOpenAt[i] ? " max-content" : ""}${mainstatOpenAt[i] ? " max-content" : ""}${dprOpenAt[i] ? " max-content" : ""}`;
  const gridStyle = `grid-template-columns:${posCols(0)} ${posCols(1)} ${posCols(2)} max-content max-content`;

  // the rows themselves are drawn by `drawWindow()`, only ever the stretch near the scroll
  // position — this is the shell around them, head included
  tableView = { sorted, ranks: rankAll(sorted), head, rowHtml };
  return `<main>${comparisonFilters()}<h2 class="summary-label" id="teamCount">${fmt(sorted.length)} teams</h2><div class="tcwrap"><div class="tgrid" style="${gridStyle}">${head}</div></div></main>`;
}

/** What the comparison table draws from once `comparisonTable()` has sorted and ranked it: every
 *  row in order, each one's own rank colouring, and the per-row markup. Only the rows near the
 *  scroll position are ever in the document (see `drawWindow()`): a thousand rows built into
 *  markup, parsed and laid out was the largest fixed cost of every redraw, for rows nobody could
 *  see, and a window of ~100 costs the same whatever the table's size. */
interface TableView {
  sorted: (readonly [string, TeamRun])[];
  ranks: RowRank[];
  head: string;
  rowHtml: (key: string, run: TeamRun, rank: RowRank) => string;
}
/** One row's place on the `% of Baseline` ramp: its hue, its percentage, and whether it is the
 *  pinned baseline itself. */
interface RowRank { hue: number; pct: string; pinned: boolean }
let tableView: TableView | null = null;
/** One row's pitch, measured off the first window drawn (every row is one line tall, so the
 *  spacers standing in for the rows outside the window can be sized without drawing them).
 *  Re-measured on every render, since the row's font or padding could change with the page. */
let rowHeight = 30;
let measured = false;
/** Rows drawn past either edge of the viewport, so an ordinary scroll lands on rows already there
 *  and only a long one waits on a redraw — which is one frame anyway. */
const OVERSCAN = 40;
let drawnFrom = -1, drawnTo = -1;

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
  // re-ranked in place: the rows, their order and the shell around them are all as they were
  if (tableView) { tableView.ranks = rankAll(tableView.sorted); drawWindow(true); }
}

/** The baseline column, measured against whichever team is the baseline — by default the weakest
 *  *currently on screen* rather than the weakest ever built, so filtering the table down re-bases
 *  it and the comparison is always between the rows actually being looked at; click a cell to pin
 *  one instead (`setBaseline()`). The percentage is that ratio outright, so the baseline row reads
 *  100.00%.
 *
 *  Colour is one continuous hue ramp across the whole table, written as `--hue` on the row rather
 *  than derived in CSS, because a single monotonic scale is the only way it reads smoothly: lime
 *  at the strongest team, through green at the baseline, into teal, blue and finally purple at the
 *  weakest. Anything built from separate above/below scales meets at the baseline as a hard edge.
 *
 *  Both halves spread the ratio itself, straight: a team's colour is how far along the visible
 *  spread it actually sits, so the warm end is reached as fast as the damage gets there. (A log
 *  spread evens the steps out when one runaway team stretches the table, but it also drags every
 *  middling row toward the baseline's colour, which is the opposite of what the column is for.)
 *
 *  Ranked over the sorted rows as data, not over the DOM: only a window of the rows is ever in
 *  the document, and every row's colour depends on the whole table's spread. */
function rankAll(sorted: TableView["sorted"]): RowRank[] {
  const totals = sorted.map(([, run]) => run.total);
  const pinned = baselineTeam == null ? -1 : sorted.findIndex(([key]) => key === baselineTeam);
  const base = pinned >= 0 ? totals[pinned]! : Math.min(...totals);
  const maxRatio = Math.max(...totals.map((t) => (base ? t / base : 1)), 1);
  const minRatio = Math.min(...totals.map((t) => (base ? t / base : 1)), 1);
  return totals.map((t, i) => {
    const ratio = base ? t / base : 1;
    // how far this row sits from the baseline, 0 there and 1 at whichever end it's on
    const away = ratio >= 1
      ? (maxRatio > 1 ? (ratio - 1) / (maxRatio - 1) : 0)
      : (minRatio < 1 ? (1 - ratio) / (1 - minRatio) : 0);
    // BASELINE_HUE either way, so the two halves meet there rather than butting into each other
    const hue = ratio >= 1
      ? BASELINE_HUE - away * (BASELINE_HUE - BEST_HUE)
      : BASELINE_HUE + away * (WORST_HUE - BASELINE_HUE);
    // only a row actually clicked is marked as the baseline — it takes its colour from the ramp
    // like every other row, and the class is just the outline that says which one is pinned
    return { hue, pct: `${fmt(ratio * 100, 2, true)}%`, pinned: i === pinned };
  });
}

/**
 * Draw the rows around the scroll position into the table's grid — the head, a spacer standing in
 * for every row above the window, the window's own rows, and a spacer for every row below — and
 * nothing else. Called on every scroll of the table's `<main>` (see `renderComparison()`), where
 * it redraws only once the viewport has eaten into the overscan on either side, so a short scroll
 * costs nothing and a long one costs one draw of ~100 rows.
 *
 * `scrollTop` is where the table is *about* to be, when a render is restoring a position the new
 * grid can't hold yet (it is head-high until the spacers go in) — the window is drawn for that
 * position first, and the scroll set after.
 */
function drawWindow(force = false, scrollTop?: number): void {
  const view = tableView;
  const main = app.querySelector("main");
  const grid = main?.querySelector<HTMLElement>(".tgrid");
  if (!view || !main || !grid) return;
  const n = view.sorted.length;
  const top = scrollTop ?? main.scrollTop;
  // where the first row sits in the scroll content: the grid's own offset plus the sticky head
  const headH = grid.querySelector(".thead .c")?.getBoundingClientRect().height ?? 0;
  const rowsTop = grid.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop + headH;
  const seenFrom = Math.max(0, Math.floor((top - rowsTop) / rowHeight));
  const seenTo = Math.min(n, Math.ceil((top + main.clientHeight - rowsTop) / rowHeight));
  const inside = seenFrom >= drawnFrom + (drawnFrom > 0 ? OVERSCAN / 2 : 0)
    && seenTo <= drawnTo - (drawnTo < n ? OVERSCAN / 2 : 0);
  if (!force && inside) return;
  const from = Math.max(0, seenFrom - OVERSCAN), to = Math.min(n, seenTo + OVERSCAN);

  const spacer = (rows: number): string => (rows > 0 ? `<div class="vspace" style="height:${rows * rowHeight}px"></div>` : "");
  let body = "";
  for (let i = from; i < to; i++) {
    const [key, run] = view.sorted[i]!;
    body += view.rowHtml(key, run, view.ranks[i]!);
  }
  grid.innerHTML = view.head + spacer(from) + body + spacer(n - to);
  drawnFrom = from; drawnTo = to;

  // the real pitch, off the rows just drawn — and the spacers redone once if the guess was off
  if (!measured && to - from >= 2) {
    measured = true;
    const cells = grid.querySelectorAll<HTMLElement>(".trow:not(.thead) > .c.teamdpr");
    const first = cells[0]!.getBoundingClientRect().top, last = cells[cells.length - 1]!.getBoundingClientRect().top;
    const pitch = (last - first) / (cells.length - 1);
    if (Math.abs(pitch - rowHeight) > 0.25) { rowHeight = pitch; drawWindow(true, scrollTop); }
  }
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
  { part = false, caret = true }: { part?: boolean; caret?: boolean } = {},
): string {
  return columns.map((col, i) => {
    const v = row.raw[col.key];
    // a running total this row left exactly where its own last row had it — nothing to say. With
    // no such row (a member's first, or the table's first for off-tune) the comparison is against
    // 0: every gauge, energy, concerto and the bar all start there, so a 0 on a first row is just
    // as unmoved as a repeated value further down — a column another member's kit put in the
    // table shouldn't print a bare 0 on this member's intro. Unless something *fed* the column
    // this row — a declared gain and a spend that cancelled, a gauge clamped back to where it was —
    // in which case the value stands so the panel explaining it can be opened. Off-tune's own
    // Buildup Rate section doesn't count: the rate is a multiplier on the column, not a feed.
    const sources = row.sources[col.key];
    if (isRunning(col.key)) {
      const before = Number(row.raw[`before:${col.key}`]) || 0;
      const fed = (sources ?? []).some((r) => r.section !== OFFTUNE_RATE && r.section !== ENERGY_RATE);
      if (!fed && Math.abs((Number(v) || 0) - before) < 1e-9) return cell(columns, i, { cls: [], html: "", style: "" });
    }
    const cls: string[] = [];
    if (col.key === "action") cls.push(part ? "name" : "action");
    if (col.key === "avg") cls.push("avg");
    if (col.key === "member") cls.push("member");
    // a genuine stat buff moved this cell's own value, not just its usual carried/declared trace
    // (see display.ts's own ReportRow.buffed) — mv, and the three running resources
    if (BUFF_UNDERLINE_COLUMNS.has(col.key) && row.buffed.has(col.key)) cls.push("buffed");
    // an outro fired with less than a full 100-point bar to spend, counting whatever concerto
    // landed on it that same action (Jinhsi's Unison hands over the 100 its outro costs, and is
    // not short) — never true off a non-outro row, concertoSpent only ever moves on one
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
    if (col.key === "action" && caret && !part && "parts" in row && row.parts.length) {
      html = `${html}<span class="caret">▸</span>`;
    }
    const suffix = col.key === "mv" && row.scaling !== null
      ? ` ${SCALING_NAME[row.scaling]}` : "";
    let pop = "";
    if (col.key === "action") {
      // a group's own name is its expand control and nothing else — the panel would describe only
      // the one cast the row happens to carry, and clicking is how the group opens
      const group = "parts" in row && row.parts.length > 0;
      pop = group ? "" : infoPopover("info" in row ? row.info : undefined, slotHue);
    } else if (col.key === "member") {
      // an opened group's own parts carry their own snapshot, so each reads the buffs that cast
      // was actually held under rather than inheriting the row's (see display.ts's ReportPart)
      const snap = "line" in row ? (row.line.snap as ResolvedSnapshot) : row.snap;
      const gear = gearByMember.get(snap.member) ?? [];
      pop = buffsPopover(snap.member, gear, snap.heldLocal, snap.heldGlobal, snap.heldEnemy, slotHue);
    } else if (text) {
      // `text`: an empty cell gets no panel — hovering nothing and being told about it is worse
      // than the blank the row means by it. `moved:`: a running counter's panel foots to what this
      // action moved it by rather than to the balance in the cell (display.ts's own rowValues()).
      pop = popover(col, sources, row.raw[`moved:${col.key}`] ?? v, slotHue, suffix);
    }

    const mem = slotHue.get(String(v)) ?? FALLBACK_HUE;
    const style = col.key === "member" ? `--mem:${mem};color:${mem}` : "";

    return cell(columns, i, { cls, html, pop, style });
  }).join("");
}

/** An opened group's own rows. Each carries its *own* member's hue rather than inheriting the
 *  group's: the members are all one resonator, but the follow-ups queued between them need not be
 *  — a Tune Break banks under its own slot, and `queueOn` can land a hit on anybody. */
function partRows(
  columns: Column[], parts: ReportPart[], slotHue: Map<string, string>, gearByMember: Map<string, Gear[]>,
  fieldOf: Map<ResolvedSnapshot, number>,
): string {
  return parts.map((p) => {
    const hue = slotHue.get(String(p.raw.member)) ?? FALLBACK_HUE;
    // a summon that fired inside this group is still its field's to show: opening the group is
    // not opening the field, so it stays hidden here until that row is opened too
    const field = fieldOf.get(p.snap);
    const mark = field === undefined ? "" : ` data-fh="${field}"`;
    return `<div class="r${p.short ? " short" : ""}" style="--m:${hue}"${mark}>`
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
  const cols = columns.map(colWidth).join(" ");

  const head = columns
    .map((c, i) => cell(columns, i, { html: esc(c.label) }))
    .join("");

  // A group's block holds three things after its own row: the members and their follow-ups in the
  // order they resolved (`.parts`, shown once it is opened), and the follow-ups alone (`.spill`,
  // shown while it is closed). A spill row arrives as an ordinary row of the report, straight after
  // the group it belongs to, and is appended into the block still open rather than closing it.
  // A field window's own toggle: the summary row and the hits it stands for are nowhere near each
  // other in the table (the hits are scattered through the section, some nested in another group's
  // spill), so the swap is a stylesheet keyed on the window's own checkbox rather than the sibling
  // selectors an ActionGroup's block uses — see `.grid:has()` below.
  const fieldIds = new Map<string, number>();
  const fieldId = (key: string): number => {
    const seen = fieldIds.get(key);
    if (seen !== undefined) return seen;
    fieldIds.set(key, fieldIds.size);
    return fieldIds.size - 1;
  };

  // every summon by snapshot, so a copy of one appearing inside an opened group (`.parts`) is
  // tagged with its own field exactly as its own row is
  const fieldOf = new Map<ResolvedSnapshot, number>();
  for (const row of report.rows) {
    const line = row.line;
    if (line.fieldKey === undefined || line.aggregate) continue;
    const id = fieldId(line.fieldKey);
    for (const snap of (line.members?.length ? line.members : [line.snap]) as ResolvedSnapshot[]) {
      fieldOf.set(snap, id);
    }
  }

  const out: string[] = [];
  let spilling = false;
  const closeBlock = () => { if (spilling) { out.push("</div></div>"); spilling = false; } };
  report.rows.forEach((row, i) => {
    const snap = row.line.snap;
    const hue = slotHue.get(snap.member) ?? FALLBACK_HUE;
    const style = ` style="--m:${hue}"`;
    const cells = stepRow(columns, row, slotHue, gearByMember);
    const shortCls = row.short ? " short" : "";
    // a summon stands in its own place, hidden while its field reads as one row; the field's own
    // row is the toggle for them, and stays put whether it is open or closed
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
    // its own hue, not the block's: a follow-up can land on a slot of its own (a Tune Break's)
    if (row.line.spill && spilling) {
      // a folded spill row (two identical follow-ups read as one while the group is closed) is a
      // chain of its own, caret and all: opened, its hits show right here inside the block
      if (row.parts.length) {
        const id = `x${i}`;
        out.push(`<div class="chain"${style}${mark}>`
          + `<input class="tgl" type="checkbox" id="${id}">`
          + `<label class="r${shortCls}" for="${id}">${cells}</label>`
          + `<div class="parts">${partRows(columns, row.parts, slotHue, gearByMember, fieldOf)}</div>`
          + `</div>`);
        return;
      }
      // a lone spill row has no toggle, so it is rendered without the caret that would promise one
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
  const steps = out.join("");

  // One rule per field: opened, its own summons come back where they fired (`.r` and `.step` are
  // a grid and a block, so each gets its own display back by name). The field's own row stays —
  // it reads and closes exactly as an ActionGroup's does, and it is the only thing there is to
  // click to close it again.
  const fieldRules = [...fieldIds.values()].map((n) => `.grid:has(#fg${n}:checked) .step[data-fh="${n}"]{display:block}`
    + `.grid:has(#fg${n}:checked) .r[data-fh="${n}"]{display:grid}`).join("");

  const totalRow = columns.map((c, i) => cell(columns, i, {
    html: "",
  })).join("");

  return `<div class="gridwrap">${fieldRules ? `<style>${fieldRules}</style>` : ""}<div class="grid" style="--cols:${cols}">
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
  // The Tune Break row gets its own hue and the same bar/wash as a real member — it isn't a
  // loadout, so it has no gear hover, but it is a damage source and reads as one. Named off the
  // enemy resonator itself, not the run's fight: a table row keeps no fight (`TeamRun.state`).
  const tuneBreakRow = dataRow(TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color, "");
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

/** What a member's own actions banked between their last two Liberations — the energy that went
 *  into the last one, counting only what they generated themselves. RealEnergy also carries half
 *  of every *other* member's gain (kit.ts's own evaluate()), and that share is not theirs, so this
 *  reads each of their own casts instead of the counter. Null until they have cast two: one
 *  Liberation bounds no interval. An outro contributes nothing — the bar is thrown away there
 *  rather than moved (`energyWiped`), so what it declares never banks.
 *
 *  Every snapshot in the span, not one per line: a folded group's own casts each declare energy
 *  (`ChainGroup.members`), and a spill line is a line of its own. */
function energyGenerated(flat: ChainGroup[], member: string): number | null {
  const casts = resetIndices(flat, 0, flat.length, member);
  if (casts.length < 2) return null;
  let total = 0;
  for (let i = casts[casts.length - 2]! + 1; i < casts[casts.length - 1]!; i++) {
    const line = flat[i]!;
    if (line.aggregate) continue; // its hits bank on their own rows — see sumByTag
    for (const snap of (line.members?.length ? line.members : [line.snap]) as ResolvedSnapshot[]) {
      if (snap.member !== member || snap.energyWiped) continue;
      // the same gain evaluate() banks: declared plus AddEnergy, scaled by the regen multiplier
      total += (snap.action.energy + snap.stat(Stat.AddEnergy)) * (1 + snap.stat(Stat.EnergyRegenMult) / 100);
    }
  }
  return total;
}

/**
 * What the *rest of the team* put into one member's Energy Gen: every energy source over the same
 * span `energyGenerated()` sums, minus their own — the buffs somebody else's kit had standing on
 * them while they banked it. Summed per source, since one buff feeds a dozen casts of theirs.
 *
 * `rows` is the report's own, which runs in step with `flat` (both come off the same lines), so a
 * line's traced energy sources are `rows[i].sources.energy` — already recombined across a folded
 * group's members (display.ts's rowValues), which is why this reads lines rather than snapshots.
 */
function teamEnergySources(flat: ChainGroup[], rows: ReportRow[], member: string): TraceEntry[] {
  const casts = resetIndices(flat, 0, flat.length, member);
  if (casts.length < 2) return [];
  const by = new Map<string, TraceEntry>();
  for (let i = casts[casts.length - 2]! + 1; i < casts[casts.length - 1]!; i++) {
    const line = flat[i]!;
    const snap = line.snap as ResolvedSnapshot;
    // the same three exclusions the figure itself makes: a field's summary row restates hits that
    // are rows of their own, somebody else's cast banks onto their own bar, and an outro throws
    // the bar away rather than moving it
    if (line.aggregate || snap.member !== member || snap.energyWiped) continue;
    for (const r of rows[i]?.sources.energy ?? []) {
      if (!r.owner || r.owner === member) continue;
      const key = `${r.source} ${r.section ?? ""}`;
      const seen = by.get(key);
      // a rate is the multiplier every cast in the span went through, not something to add up
      if (seen) { if (!r.mult && r.section !== ENERGY_RATE) seen.value += r.value; }
      else by.set(key, { ...r });
    }
  }
  return [...by.values()];
}

/** ...and that as a panel on the Energy Gen figure. A member the team fed nothing says so, rather
 *  than opening an empty box. */
function teamEnergyPopover(sources: TraceEntry[], slotHue: Map<string, string>): string {
  const head = sources.length ? "Team sources" : "No team sources";
  return lazyPop(`<span class="pop stat"><table>`
    + `<tr class="sec"><td colspan="2">${head}</td></tr>`
    + `${sources.map((r) => panelRow(r, slotHue)).join("")}</table></span>`);
}

/** Energy Requirements: one row per member (same gear-loadout hover as the DPR table above), one
 *  column per section, and their own Energy Gen last. A section the member casts no Liberation in reads `—`, and so does the one
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
    + `<div class="c num">Energy Gen</div>`
    + `</div>`;

  const rows = run.members.map((m, idx) => {
    const maxEnergy = m.loadout.resonator.maxEnergy;
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
      return `<div class="c num${warn ? " er-under" : ""}${hover ? " has" : ""}"${hover}>${text}</div>`;
    };

    // the opener's last cast is the one with something to bank for — an earlier one in the same
    // opener spent a bar that this one has to rebuild
    const opener = resetIndices(flat, offsets[0]!, offsets[1]!, m.name);
    // its own hover is not a stat panel — the figure is a sum over a span, not one action's — but
    // what the *team* put into it, which is the part of it that isn't this member's own doing
    const gen = energyGenerated(flat, m.name);
    const team = gen == null ? "" : teamEnergyPopover(teamEnergySources(flat, report.rows, m.name), slotHue);
    const cells = cell(opener[opener.length - 1] ?? null)
      + [1, 2, 3].map((i) => cell(resetIndices(flat, offsets[i]!, offsets[i + 1]!, m.name)[0] ?? null)).join("")
      + `<div class="c num${team ? " has" : ""}"${team}>${gen == null ? "—" : fmt(gen, 2, true)}</div>`;
    return `<div class="rtrow">`
      + `<div class="c name"${gearPopover(m, run.combo[idx]!)} style="--mem:${m.color}">${esc(m.name)}</div>`
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
  const slotHue = new Map([...members.map((m): [string, string] => [m.name, m.color]), [TUNE_BREAK_ENEMY.name, TUNE_BREAK_ENEMY.color]]);
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

  /** The panel each cell has had built for it, held out of the document while it is closed.
   *
   *  `lazyPop` only ever deferred the cost: a template swapped for a real panel stayed a real
   *  panel for the life of the page, so a reading session that swept the pointer over a few
   *  hundred cells left a few hundred panels — thousands of nodes — behind it, every one of
   *  them still styled and re-invalidated on each pass even though `display: none` keeps them
   *  off the screen. A detached node costs none of that, so a closed panel is taken back out
   *  and kept here, and only the open one is ever in the document. */
  const built = new WeakMap<Element, HTMLElement>();

  const close = (): void => {
    open?.remove();
    open = null;
    openHome = null;
  };

  const place = (cell: Element, pop: HTMLElement): void => {
    if (pop.parentElement !== document.body) document.body.appendChild(pop);
    pop.style.visibility = "hidden";
    pop.style.display = "block";
    const c = cell.getBoundingClientRect();
    const p = pop.getBoundingClientRect();

    // A numeric column's panel hangs off its cell's *right* edge, under the right-aligned figure
    // it explains; the two text columns (member, action) open rightward off their left edge, the
    // way their own text reads. Either way the clamp below keeps a wide panel on the table.
    const natural = cell.classList.contains("num") ? c.right - p.width : c.left;
    // Clamped to the table's own box, not just the viewport — `EDGE` alone let a panel opened on
    // a narrow leftmost column (the member column) bleed out past the table's own left edge and
    // into the page's margin, since a viewport-relative clamp has no idea where the table itself
    // starts.
    const tableLeft = (cell.closest(".gridwrap, .tcwrap")?.getBoundingClientRect().left ?? EDGE);
    const minLeft = Math.max(EDGE, tableLeft);
    const left = Math.max(minLeft, Math.min(natural, innerWidth - p.width - EDGE));
    // Every column opens downward, where the value being explained sits above its own
    // explanation — the resonator column included, which used to prefer upward. Above is taken
    // only when there is no room below, and a panel that fits neither is clamped to the top edge.
    const above = c.top - p.height - GAP;
    const below = c.bottom + GAP;
    const fitsBelow = below + p.height <= innerHeight - EDGE;
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
    // first hover on this cell: parse the markup parked on it, once (see `lazyPop`), and drop the
    // attribute — the panel itself is what's kept from here on
    // ...or, for a cell carrying only a kind and key, build the markup itself now (`deferredPop`)
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

  /** An action name in the log, which opens on a click of its own rather than on hover — the one
   *  column whose panel is read rather than glanced at, and the one whose rows move under the
   *  pointer as groups open. `name` is what the column is called on an opened group's own parts. */
  const isAction = (cell: Element): boolean => !!cell.closest(".grid")
    && (cell.classList.contains("action") || cell.classList.contains("name"));

  document.addEventListener("mouseover", (e) => {
    if (open && open.contains(e.target as Node)) return;
    const hovered = (e.target as Element | null)?.closest?.(".c") ?? null;
    // hovering an action name opens nothing, and hovering *away* from one closes whatever its own
    // click opened — bar the pointer simply moving about inside that same cell
    if (hovered && isAction(hovered)) { if (openHome !== hovered) close(); return; }
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
  // whatever has moved into that spot — drop it and let the next mouseover re-place it. An action
  // name is the one panel a click *opens*: clicking the name itself toggles it (and is kept off
  // the row's own label, so it doesn't also open the group), while the caret beside it still
  // belongs to the row and expands it as before.
  addEventListener("click", (e) => {
    const { cell, pop } = panelIn(e.target);
    if (!cell) return;
    const onCaret = !!(e.target as Element | null)?.closest?.(".caret");
    // `pop`: a group's name has none (see stepRow), so its click falls through to the row's own
    // label and expands it, which is the whole of what clicking a group does
    if (isAction(cell) && !onCaret && pop) {
      e.preventDefault();
      const same = openHome === cell;
      close();
      if (!same) place(cell, pop);
      return;
    }
    if (cell.querySelector(":scope > .caret")) close();
  });

  addEventListener("scroll", close, true);
  addEventListener("resize", close);
}

/* ------------------------------------------------- action log: column order */

/** The action log's columns are dragged by their own headings, and the order is kept in
 *  `localStorage` so it survives a reload — stored as the visual key order of whatever columns
 *  were on screen when it was last dragged.
 *
 *  Nothing is re-rendered to reorder them: the cells stay in the report's own order and a
 *  generated stylesheet hands each position a grid `order`, so a drop keeps every opened chain
 *  and the scroll position exactly where they were. */
const COLUMN_ORDER_KEY = "wuwa.logColumns";

const savedOrder = (): string[] => {
  try { return JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY) ?? "[]") as string[]; }
  catch { return []; }
};

/** This report's column keys in visual order: the saved order for the ones it names, then every
 *  other column back beside its natural neighbour rather than pushed to the end — a forte gauge
 *  only some teams move isn't in the saved list at all when it was saved off a team without it. */
function orderedKeys(columns: Column[]): string[] {
  const out = savedOrder().filter((k) => columns.some((c) => c.key === k));
  columns.forEach((c, i) => {
    if (out.includes(c.key)) return;
    const prev = columns.slice(0, i).reverse().find((p) => out.includes(p.key));
    out.splice(prev ? out.indexOf(prev.key) + 1 : 0, 0, c.key);
  });
  return out;
}

/** The action log currently on screen: its columns in DOM order (the report's own), and their
 *  keys in the visual order the generated stylesheet below puts them in. */
let logColumns: Column[] = [];
let logOrder: string[] = [];
let logStyle: HTMLStyleElement | null = null;

/** Write the current order into the grid: an `order` per column position, and the track list
 *  re-laid in visual order. Nothing about a column's own width or padding depends on where it
 *  sits, so there is nothing else to move. */
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

/** One column mid-drag: everything the pointer maths needs, measured off the heading row the
 *  moment it was picked up. A width is a grid track's, so it answers for every row at once. */
interface ColumnDrag {
  key: string;
  /** Its `nth-child` position, which never moves — the cells stay in the report's own order. */
  nth: number;
  /** The visual order it was lifted out of, and the track width of each key in it. */
  order: string[];
  width: Map<string, number>;
  /** Its own left offset in that order, the table's full width, and the pointer x it started at. */
  home: number;
  span: number;
  startX: number;
  /** Where it lands if dropped now — an index into `order` with the lifted column taken out. */
  at: number;
}

/** Each key's left offset in a given order, so a column's slide is the difference between the
 *  offset it has now and the one the drop would give it. */
function offsetsOf(order: string[], width: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  let x = 0;
  for (const key of order) { out.set(key, x); x += width.get(key) ?? 0; }
  return out;
}

/** The white box drawn around one whole column, spanning the table from its heading down to its
 *  total row — one element laid over the grid rather than an outline on each of the column's own
 *  cells.
 *
 *  The cells cannot carry it. A row the engine only triggered is dimmed whole (`.r.short`), and
 *  `opacity` fades a cell's box-shadow along with its text, so the outline came out pale on
 *  every such row; and the 1px rule between rows (`.step`'s border-top) crosses the column's two
 *  sides, cutting them into segments all the way down. One box over the top answers to neither. */
function columnBox(grid: HTMLElement, left: number, width: number): HTMLElement {
  const box = grid.appendChild(document.createElement("div"));
  box.className = "colbox";
  box.style.left = `${left}px`;
  box.style.width = `${width}px`;
  return box;
}

/** The column a click on its heading has singled out, if any: the same box a dragged column
 *  wears, without lifting it. Clicking another moves it, clicking the same one again clears it.
 *  A marker for reading by, so it is not saved and does not outlive the page it was set on. */
let selected: string | null = null;
let selBox: HTMLElement | null = null;

/** Where one column's track sits inside the grid, in the grid's own coordinates — read off the
 *  heading, so it accounts for the row's own padding and for wherever the column has been put. */
function trackBox(grid: HTMLElement, key: string): { left: number; width: number } | null {
  const cell = grid.querySelector<HTMLElement>(`:scope > .r.head > .c[data-col="${CSS.escape(key)}"]`);
  if (!cell) return null;
  const g = grid.getBoundingClientRect();
  const c = cell.getBoundingClientRect();
  return { left: c.left - g.left, width: c.width };
}

/** Draw the box where the selected column currently sits, or take it away. */
function paintSelection(root: HTMLElement): void {
  selBox?.remove();
  selBox = null;
  if (!selected) return;
  const grid = root.querySelector<HTMLElement>(".gridwrap .grid");
  const track = grid && trackBox(grid, selected);
  if (grid && track) selBox = columnBox(grid, track.left, track.width);
}

/** The stylesheet a drag runs on. It goes up once, when the column is picked up, and from then
 *  on only the transform declarations in it are touched (`liftRule`, `slideRules`) — its text is
 *  never rewritten.
 *
 *  Both of those decide how a drag feels on a table this size. The lifted column used to follow
 *  a `--dx` custom property set on the grid: custom properties inherit, so each of the ten
 *  thousand nodes under it — every cell, and every cell's own parked hover panel — was
 *  re-styled on each of the sixty frames a second a drag spends moving. And every change of
 *  landing place used to rewrite this sheet's text, which re-matches every rule in it against
 *  the whole table. A declaration set on one rule that is already there invalidates only what
 *  that rule's own selector matches: the one column it names. */
let dragStyle: HTMLStyleElement | null = null;
let liftRule: CSSStyleRule | null = null;
let liftBox: HTMLElement | null = null;
/** The rule that slides each column that is not the one being dragged, by its key. */
const slideRules = new Map<string, CSSStyleRule>();

/** Where each of those columns is right now, and where it is heading: the slide is eased here,
 *  frame by frame, rather than left to a CSS transition on the cells.
 *
 *  A transition is the obvious way to do it and is what this did first, but a table this size
 *  cannot afford one. A column is twenty-odd separate cells and none of them can be composited —
 *  `will-change: transform` and `contain: paint` were both tried and both made it worse — so
 *  every frame of every slide was a main-thread restyle and repaint of each cell, and three or
 *  four columns sliding at once took a drag from 17ms a frame to 39ms. Easing here costs one
 *  declaration per column that actually moved this frame; a column already at its target costs
 *  nothing at all, which is nearly all of them nearly all of the time. */
const slideNow = new Map<string, number>();
const slideTo = new Map<string, number>();
let slideRaf = 0;

/** Carry every column that isn't there yet a fraction of the way to its target. ~0.3 a frame
 *  lands within half a pixel in about ten, the same ballpark as the .16s the transition took. */
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

/** Put the sheet up: the lifted column outlined and raised, and a transform rule standing by for
 *  every other column. */
function openDrag(grid: HTMLElement, d: ColumnDrag): void {
  const nth = (key: string): number => logColumns.findIndex((c) => c.key === key) + 1;
  const others = d.order.filter((k) => k !== d.key);

  // Lifted out of the table: raised over its neighbours on an opaque surface of its own — the
  // cells are transparent normally, and a column sliding underneath would otherwise read
  // straight through it — outlined down both sides, and capped by the heading and total rows.
  // `transition: none` while it is down, so it tracks the pointer rather than lagging behind it;
  // dropping it is what lets it slide the last of the way into its slot on release.
  // The background is the one the cell already has, only painted on the cell instead of showing
  // through it from the row behind — a lifted column must not read through to whatever slides
  // under it, and must not change colour on the way up either. `var(--m, var(--surface))` rather
  // than a `transparent` fallback: mixing with `transparent` leaves the result part-transparent,
  // which is how the heading and total rows used to go translucent the moment a column was
  // picked up. They set no `--m` of their own, so they get their own surface below.
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

  // no transition while it is down: the box tracks the pointer, like the column under it
  const track = trackBox(grid, d.key);
  liftBox = columnBox(grid, track?.left ?? d.home, track?.width ?? d.width.get(d.key)!);
  liftBox.style.transition = "none";
  // the dragged column's own box does the drawing if it was also the selected one
  if (selBox && selected === d.key) selBox.style.display = "none";
}

/** Aim every other column at the place the drop would now give it — called only when the landing
 *  place actually changes, not on every pointer move. `stepSlides` walks them there. */
function slideDrag(d: ColumnDrag): void {
  const from = offsetsOf(d.order, d.width);
  const rest = d.order.filter((k) => k !== d.key);
  rest.splice(d.at, 0, d.key);
  const to = offsetsOf(rest, d.width);
  for (const key of slideRules.keys()) slideTo.set(key, to.get(key)! - from.get(key)!);
  if (!slideRaf) slideRaf = requestAnimationFrame(stepSlides);

  // a selected column that is not the one being dragged slides with the rest of them — one
  // element, so this one can stay a CSS transition (see `.colbox`)
  if (selBox && selected && selected !== d.key) {
    selBox.style.transform = `translateX(${to.get(selected)! - from.get(selected)!}px)`;
  }
}

/** Take the sheet back down, and with it everything the drag was painting. */
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

/** Pick a column up by its heading and slide it, within the table's own two edges, to a new
 *  place — the rest of the table opening the gap it would land in as it goes. */
function wireColumnDrag(root: HTMLElement, columns: Column[]): void {
  logColumns = columns;
  logOrder = orderedKeys(columns);
  closeDrag();
  selected = null;
  selBox = null;
  applyColumnOrder(root);

  const head = root.querySelector<HTMLElement>(".gridwrap .grid > .r.head");
  if (!head) return;
  // the headings are rendered in the report's own order, so the nth cell is the nth column
  const cells = [...head.querySelectorAll<HTMLElement>(":scope > .c")];
  cells.forEach((el, i) => { el.dataset.col = columns[i]!.key; });

  // A press arms a drag but does not start one: the column is only picked up once the pointer
  // has actually travelled, so a press that goes nowhere reads as a click on the heading and
  // singles the column out instead.
  let drag: ColumnDrag | null = null;
  let lifted = false;
  let settling = false;
  const LIFT_AT = 3;

  head.addEventListener("pointerdown", (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>(".c[data-col]");
    if (e.button !== 0 || drag || settling || !cell) return;
    e.preventDefault();
    cell.setPointerCapture(e.pointerId);

    const width = new Map(cells.map((c) => [c.dataset.col!, c.getBoundingClientRect().width]));
    const key = cell.dataset.col!;
    const offsets = offsetsOf(logOrder, width);
    drag = {
      key,
      nth: cells.indexOf(cell) + 1,
      order: logOrder,
      width,
      home: offsets.get(key)!,
      span: [...width.values()].reduce((n, w) => n + w, 0),
      startX: e.clientX,
      at: logOrder.indexOf(key),
    };
    lifted = false;
  });

  head.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!lifted) {
      if (Math.abs(e.clientX - drag.startX) < LIFT_AT) return;
      lifted = true;
      document.body.classList.add("coldrag");
      openDrag(head.parentElement as HTMLElement, drag);
    }
    const w = drag.width.get(drag.key)!;
    // clamped to the table's own two edges: a column slides inside it, never out of it
    const dx = Math.min(drag.span - w - drag.home, Math.max(-drag.home, e.clientX - drag.startX));

    // It trades places with a neighbour only once it has slid at least halfway across that
    // neighbour's own width — measured against where the columns are actually sitting, which is
    // the order it would drop into right now. So a wide column need only be pushed a little way
    // into a narrow one, and a narrow one has to travel most of the way across a wide one, which
    // is what "halfway in" looks like from either side. The two tests share their boundary
    // exactly, so a pointer position reads the same whichever direction it arrived from, and the
    // loop walks a fast drag through as many columns as it crossed.
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

    // Let it slide the last of the way into the gap being held open for it before the real
    // column order takes over — dropped halfway between two slots it would otherwise jump.
    const rest = offsetsOf(next, d.width).get(d.key)! - offsetsOf(d.order, d.width).get(d.key)!;
    // dropping `transition: none` hands it back the .16s slide every other column is using
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
      // the columns have moved under it, so the selected one's box is redrawn where it now is
      paintSelection(root);
    }, 170);
  };

  head.addEventListener("pointerup", () => {
    if (!drag) return;
    if (lifted) { drop(); return; }
    // never moved: a click. It singles this column out, or gives up the one it already had.
    selected = selected === drag.key ? null : drag.key;
    drag = null;
    paintSelection(root);
  });

  head.addEventListener("pointercancel", () => {
    if (lifted) drop();
    else drag = null;
  });
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
  // Whatever panel was open when the page was left is parked in <body> (see `place()`), and it
  // outlives the DOM it belongs to — a fixed, z-index 200 sheet floating over the new page and
  // eating its pointer events until the next mouseover happens to close it.
  document.body.querySelectorAll(":scope > .pop").forEach((el) => el.remove());
  // the position is kept across a redraw (a DPR column, a baseline click) rather than reset to
  // the top: the window is drawn for it first, since the fresh grid can't be scrolled there yet
  const scrollTop = app.querySelector("main")?.scrollTop ?? 0;
  app.innerHTML = comparisonTable(visibleRows);
  app.className = "";
  measured = false;
  drawnFrom = drawnTo = -1;
  drawWindow(true, scrollTop);
  const main = app.querySelector("main")!;
  main.scrollTop = scrollTop;
  // the search bar is live from the first paint — and stays live across every redraw (each one
  // rebuilds the input), so typing, clicking a result and typing again never needs a mouse
  focusSearch();
  let queued = false;
  main.addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; drawWindow(); });
  }, { passive: true });
}

function renderDetail(key: string): void {
  backLink.hidden = false;
  document.body.querySelectorAll(":scope > .pop").forEach((el) => el.remove());
  const run = results.get(key)!;
  app.innerHTML = page(run);
  app.className = "";
  // the report is cached on the run (detailFor), so this is just reading back what page() drew
  wireColumnDrag(app, detailFor(run).report.columns);
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
      new Worker(new URL("./src/solver.js", import.meta.url), { type: "module" }));
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
      const known = picksCache.get(picksKey(key)) ?? null;
      const finish = (solved: Solved): void => {
        storeSolved(key, solved);
        onDone();
        pump(w);
      };
      w.onmessage = ({ data }: MessageEvent<SolveResponse>) => finish({ picks: data.picks, rows: data.rows, scores: data.scores });
      w.onerror = (e) => {
        console.warn(`worker failed on ${key}, solving it here:`, e.message);
        e.preventDefault();
        finish(solveTeam(key, members, filters, known));
      };
      const request: SolveRequest = { id: id++, teamKey: key, filters, picks: known };
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
/** @returns whether anything was actually solved — false when every team's answer was in hand. */
async function ensureBestPicks(inPlay: [string, Member[]][], workTotal: number): Promise<boolean> {
  // `bestKey()` folds in the whole filter state, so flipping any option box is a re-solve: a
  // solve carries the team's own row set with it, each row on the main stats that build wants
  // (solver.ts's own `rowPicks()`), and which rows exist is precisely what the boxes decide.
  const teams = inPlay.filter(([key]) => !bestPicks.has(bestKey(key)));
  if (!teams.length) return false;

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
      storeSolved(key, solveTeam(key, members, filters, picksCache.get(picksKey(key)) ?? null));
      done++;
      progress();
      // no worker to hand this to, so the bar can only move if this thread lets go between teams
      await breathe();
    }
  }
  await paint();
  return true;
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
    const inPlay = Object.entries(TEAMS).filter(([, members]) => teamWanted(members));
    // kicked off before the first render, not after: each worker fetches and parses its own copy of
    // the engine module graph on the way up, and that overlaps with drawing the empty table. Only
    // when there is something to solve, though — a reload with every team's solve kept
    // (`loadSolves()`) needs no worker, and eight of them each fetching the whole module graph
    // was the largest thing such a reload did.
    if (inPlay.some(([key]) => !bestPicks.has(bestKey(key)))) workerPool();
    if (!visibleRows.length) route(); // cold load: the empty table under the overlay, filters and all

    const solvableInPlay = inPlay.filter(([, members]) => members.every((m) => eligibleWeapons(m, filters).length));
    const rowsTotal = solvableInPlay.reduce((sum, [, members]) => sum + estimatedRowCount(members), 0);
    const workTotal = inPlay.length + rowsTotal || 1; // guard: no team survives the resonator filters

    const solved = await ensureBestPicks(inPlay, workTotal);
    saveSolves();
    const rows = teamRows();
    const cached = rows.filter((row) => results.has(row.key));
    const missing = cached.length !== rows.length;
    if (!missing && cached.length) {
      // This filter change added no new rows, so this draw is the whole table. The bar is
      // credited here rather than left for `runMissing()`, which is a no-op and never touches it —
      // it would be left wherever `ensureBestPicks()` put it, visibly short of full behind a
      // label that says "done" — and settled, since nothing picks it back up afterwards. A bar
      // that never moved (nothing solved: a reload, a flip onto rows already run) has nothing to
      // settle, and waiting on it would be most of what such a load costs.
      overlayPhase("Rendering Table…");
      overlayFill.style.width = `${((inPlay.length + cached.length) / workTotal) * 100}%`;
      overlayCount.textContent = `${fmt(cached.length)} / ${fmt(rows.length)}`;
      await paint();
      if (solved) await settle();
      visibleRows = cached;
      route();
    } else if (!missing) {
      // the change left no rows at all (filters that no team satisfies together): still redraw,
      // or the table and the chip for the filter just set stay stale on screen
      visibleRows = [];
      route();
    }
    // Rows still to run are drawn once, after: the cached subset used to be drawn first, under the
    // overlay, and thrown away moments later — a whole table build that nobody could read through
    // the blur. Whatever was on screen simply stays there until the full table replaces it.
    await runMissing(rows, workTotal, inPlay.length);
    if (missing) {
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
  await loadSolves();
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
  // clicking a Slot heading opens or closes that position's own DPR column — a column of figures
  // the runs already hold, so it redraws the table and nothing else (see `dprOpenAt`)
  document.addEventListener("click", (e) => {
    const pos = (e.target as Element).closest<HTMLElement>(".c.slothead")?.dataset.pos;
    if (pos === undefined) return;
    dprOpenAt[Number(pos)] = !dprOpenAt[Number(pos)];
    renderComparison();
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
  // click bars them, and either click on a name already filtered clears it (`setFilter()`). The
  // filter is by name, so it applies everywhere that name appears rather than only to the row
  // clicked.
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
  // A search result: the same left click/right click pair as the cell it stands for, keyed by the
  // same `data-kind`/`data-value` (the "no matches" row carries neither, so it falls through).
  const searchPick = (e: Event): [Map<string, ResonatorFilter>, string] | undefined => {
    const el = (e.target as Element).closest<HTMLElement>(".sresult");
    const kind = el?.dataset.kind as SearchKind | undefined;
    const value = el?.dataset.value;
    if (!kind || !value) return undefined;
    return [kind === "resonator" ? resonatorFilters : OPTION_FILTER_MAPS[kind], value];
  };
  document.addEventListener("click", (e) => {
    const pick = searchPick(e);
    if (!pick) return;
    setFilter(...pick, "include");
    focusSearch();
  });
  document.addEventListener("contextmenu", (e) => {
    const pick = searchPick(e);
    if (!pick) return;
    e.preventDefault();
    setFilter(...pick, "exclude");
    focusSearch();
  });
  // A chip is a real <button>, so pressing one takes focus off the search bar — which drops its
  // accent border until the redraw behind the click hands focus back (`renderComparison()`), a
  // visible grey blink across a solve. The press does its work through the click handler below
  // either way, so refusing it the focus costs nothing.
  document.addEventListener("mousedown", (e) => {
    if ((e.target as Element).closest?.(".rchip")) e.preventDefault();
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

/** Set one filter, or clear it if this name already carries one — *whichever way* that one was
 *  set. "Already filtered" is the state a click toggles, not "already filtered this exact way": a
 *  left click on a barred resonator used to promote them to a required include, which is never
 *  what clicking the name you just barred means (and, being an include, it silently ANDed with
 *  every other include and emptied the table instead of bringing them back). Flipping a filter the
 *  other way round is two clicks now — clear it, then set the direction you want.
 *
 *  Shared by resonator names and weapon/echo/mainstat picks alike; only the map differs. Costed
 *  either way (`withRowCap()`): clearing one widens the table by exactly what setting it narrowed,
 *  and a filter is the usual way *back* under the cap, so it can as easily be the way over it. */
function setFilter(map: Map<string, ResonatorFilter>, name: string, mode: ResonatorFilter): void {
  withRowCap(() => {
    const was = map.get(name);
    if (was !== undefined) map.delete(name); else map.set(name, mode);
    return () => { if (was === undefined) map.delete(name); else map.set(name, was); };
  });
}

// The search bar under the boxes: typing redraws only its own results list in place — no table
// work until a result is actually clicked. Wired here rather than in boot(), whose handlers only
// land after the initial solve — the bar is focused from the first paint, so typing has to work
// that early too.
document.addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id !== "optionSearch") return;
  searchText = input.value;
  const box = document.getElementById("searchResults");
  if (box) box.innerHTML = searchResults();
});
// Clicking or tabbing out of the search hides its results; back in brings them back — the list
// floats (index.css), so neither move shifts the chips or the table. A focus move that stays
// inside `.tcsearch` is spared — hiding on the way to a result button would fire before its click,
// landing it on a hidden control. The buttons are focusable, so leaving from one hides the list
// the same as leaving from the input.
document.addEventListener("focusin", (e) => {
  if (!(e.target as Element).closest?.(".tcsearch")) return;
  const box = document.getElementById("searchResults");
  if (box) box.hidden = false;
});

/** Whether a pointer press is in flight. Load-bearing: pressing a result moves focus on its
 *  *mousedown*, and not every browser focuses a button doing so — where it doesn't, `relatedTarget`
 *  is null and the focusout below would hide the list out from under the press, so the release
 *  never lands on the row that was pressed and the filter is never set.
 *
 *  So a press closes nothing. The click handler below does it, once the event has been delivered
 *  to whatever was actually pressed. */
let pressing = false;
document.addEventListener("pointerdown", () => { pressing = true; }, true);
document.addEventListener("pointerup", () => { pressing = false; }, true);
document.addEventListener("click", (e) => {
  if ((e.target as Element).closest?.(".tcsearch")) return;
  const box = document.getElementById("searchResults");
  if (box) box.hidden = true;
}, true);
document.addEventListener("focusout", (e) => {
  if (!(e.target as Element).closest?.(".tcsearch")) return;
  if ((e.relatedTarget as Element | null)?.closest?.(".tcsearch")) return;
  // the keyboard path only — a pointer press leaves the list alone and lets the click above close
  // it (see `pressing`)
  if (pressing) return;
  const box = document.getElementById("searchResults");
  if (box) box.hidden = true;
});

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
