/**
 * The page's state, with no DOM in it: the teams, the filter maps, which rows exist under them,
 * the solve/run caches, the solves kept across reloads, and the URL hash the state round-trips
 * through. Everything that draws (table.ts, detail.ts) reads from here; index.ts drives it.
 */
import { Tier } from "../engine/stats.js";
import { baseSequence } from "../engine/gear.js";
import { TUNE_BREAK_ENEMY } from "../shared/tunebreak.js";
import { buildReport } from "../display.js";
import type { Report } from "../display.js";
import { member, comboOf, eligibleWeapons, refineLevels, sequenceLevels, topRank, scopedKey, axisUsed, weaponBase, echoLabel, MAINSTAT_ROWS, defaultFilters, bestKey, picksKey, axisOpen, filterSignature, AXES } from "../solver.js";
import type { Member, Combo, Pick, Filters, Solved, SolveSave, Axis, TeamCost, ScopedCompare } from "../solver.js";
import { runTeam, runFromScore } from "../teamrun.js";
import type { TeamRun } from "../teamrun.js";
import { teamKey, teamAt, ALL_TEAMS } from "../teams.js";

/* ------------------------------------------------------------------------------------ teams */

/** Every team, keyed by its `ALL_TEAMS` slot (`teamKey()`) — what a worker is handed to rebuild it. */
export const TEAMS: Record<string, Member[]> = Object.fromEntries(ALL_TEAMS.map(({ loadouts, mdps }, i) => [
  teamKey(i),
  loadouts.map((l, j) => member(l, mdps[j]!)),
]));

export type ResonatorFilter = "include" | "exclude";
// no main stats: a roll reaches nobody but its wearer, so it is read off the table, never filtered
export type GearKind = "weapon" | "echo";
/** Every resonator who leads some team — what decides whether picking them widens the pool or
 *  narrows it (see `teamWanted()`). */
const MDPS_NAMES = new Set<string>();
for (const members of Object.values(TEAMS)) for (const m of members) if (m.mainDps) MDPS_NAMES.add(m.name);

/** Spaceless hash forms back to the plain name — the role-tagged forms an older link may carry
 *  (`ElectroRover(mdps)`) land on the same name, since a filter is by resonator now, not by role. */
const RESONATOR_NAME_BY_COMPACT = new Map<string, string>();
for (const members of Object.values(TEAMS)) {
  for (const m of members) {
    for (const form of [m.name, `${m.name} (mdps)`, `${m.name} (support)`]) {
      RESONATOR_NAME_BY_COMPACT.set(form.replace(/ /g, ""), m.name);
    }
  }
}

/** Every resonator's colour by name, for chips of anyone the table can field. */
export const RESONATOR_HUE = new Map(
  ALL_TEAMS.flatMap((t) => t.loadouts).map((l) => [l.resonator.name, l.resonator.color] as const),
);
export const FALLBACK_HUE = "#ff0000";

/** Everyone whose kit carries a Matrix — the only names the Matrix filter offers, and what a
 *  legacy `f=x` link (Matrix Mode, when it was one box for the whole table) reads as. */
export const MATRIX_RESONATORS = new Set(
  ALL_TEAMS.flatMap((t) => t.loadouts).filter((l) => l.resonator.matrix).map((l) => l.resonator.name),
);

/* ---------------------------------------------------------------------------------- filters */

/** Resonators required/barred by name+role key. Decides which rows are *built*, not hidden. */
export const resonatorFilters = new Map<string, ResonatorFilter>();
/** The same by the pick a row runs — only ever set while that axis has a column on screen. */
export const weaponFilters = new Map<string, ResonatorFilter>();
export const echoFilters = new Map<string, ResonatorFilter>();
/** By chain level ("Phrolova S5") and weapon rank ("Hsin R3") — set from the S/R cells. */
export const sequenceFilters = new Map<string, ResonatorFilter>();
export const refineFilters = new Map<string, ResonatorFilter>();

export const OPTION_FILTER_MAPS = {
  weapon: weaponFilters, echo: echoFilters, sequence: sequenceFilters, refine: refineFilters,
} as const;
export type OptionKind = keyof typeof OPTION_FILTER_MAPS;

export const filters: Filters = defaultFilters();

/** Every gear pick some member comparing that axis can run — cached per filter signature. */
let gearCache: { sig: string; offered: Record<GearKind, Set<string>> } | null = null;
export function offeredGear(kind: GearKind, f: Filters = filters): Set<string> {
  const sig = filterSignature(f);
  if (gearCache?.sig !== sig) {
    const offered: Record<GearKind, Set<string>> = { weapon: new Set(), echo: new Set() };
    for (const members of Object.values(TEAMS)) {
      for (const m of members) {
        if (axisOpen(m, f, "weapons")) for (const i of eligibleWeapons(m, f)) { offered.weapon.add(weaponBase(m.loadout.weapons[i]!)); for (const w of m.loadout.refinements[i]!) offered.weapon.add(w.name); }
        if (axisOpen(m, f, "echoes")) for (const e of m.loadout.echoLoadouts) offered.echo.add(echoLabel(m.loadout, e));
      }
    }
    gearCache = { sig, offered };
  }
  return gearCache.offered[kind];
}

/** Drop every gear filter no open compare offers any more, so no chip is stranded. */
export function pruneGearFilters(): void {
  for (const kind of ["weapon", "echo"] as const) {
    const offered = offeredGear(kind);
    for (const key of [...OPTION_FILTER_MAPS[kind].keys()]) if (!offered.has(key)) OPTION_FILTER_MAPS[kind].delete(key);
  }
  for (const key of [...sequenceFilters.keys()]) {
    const owner = tagOwner(key);
    if (!Object.values(TEAMS).some((ms) => ms.some((m) => m.name === owner && sequenceTagsOf(m).includes(key)))) {
      sequenceFilters.delete(key);
    }
  }
}

/** Whether a resonator has more than one option on an axis anywhere in the roster. */
export function comparable(name: string, axis: Axis): boolean {
  for (const members of Object.values(TEAMS)) {
    for (const m of members) {
      if (m.name !== name) continue;
      const l = m.loadout;
      const n = axis === "weapons" ? l.weapons.length : axis === "echoes" ? l.echoLoadouts.length
        : axis === "mainstats" ? l.mainstats.length : axis === "substats" ? 2
        : axis === "refines" ? Math.max(...l.refinements.map((r) => r.length))
        : (l.sequences.length ? l.sequences.length - Math.max(l.minSequence, l.resonator.tier === Tier.Free ? 0 : Math.min(baseSequence(l.resonator), l.sequences.length)) + 1 : 1);
      if (n > 1) return true;
    }
  }
  return false;
}

/** Whole-table row ceiling: every filter change is costed against it before it lands (`prospectiveRows`). */
export const ROW_CAP = 3_000;

/* ------------------------------------------------------------------------------------- rows */

/** Every solved team by `bestKey()`; `picksCache` each team's best build by `picksKey()`, so most
 *  box flips redo the rows alone. */
export const bestPicks = new Map<string, Solved>();
export const picksCache = new Map<string, Pick[]>();
/** Every combo run this session by `TeamRow.key` — a row is simulated once and never again. */
export const results = new Map<string, TeamRun>();

export function storeSolved(teamKey: string, solved: Solved): void {
  bestPicks.set(bestKey(teamKey, TEAMS[teamKey]!, filters), solved);
  picksCache.set(picksKey(teamKey, TEAMS[teamKey]!, filters), solved.picks);
  solvesDirty = true;
}

/** One team under one combo per member — the table's row unit. `key` is hash-safe by construction. */
export interface TeamRow { key: string; teamKey: string; members: Member[]; combo: Combo[]; }

/** The rows the current filters open — exactly what the table renders. */
export let visibleRows: TeamRow[] = [];
export const setVisibleRows = (rows: TeamRow[]): void => { visibleRows = rows; };

const namesHold = (map: Map<string, ResonatorFilter>, names: string[]): boolean =>
  [...map].every(([name, mode]) => names.includes(name) === (mode === "include"));

/** Whose tag this is: "Lupa S3", "Lupa S6R5" and "Hsin R3" all belong to their resonator. */
export const tagOwner = (tag: string): string => tag.replace(/ S\d+(R\d+)?$| R\d+$/, "");

/** `namesHold` for the level and rank tags, where two includes naming the same resonator mean
 *  *either*: a member runs one chain level and one refinement at a time, so "Lupa S0" and "Lupa S3"
 *  set together can never both be true and would leave the table empty. Includes are grouped by
 *  whose tag they are and ORed inside a group; across resonators they still stack, so Lupa S0 with
 *  Galbrena S6 is a row where both hold.
 *
 *  A group says which of that resonator's levels to keep, not that they have to be on the team at
 *  all: `fielded` is who this row plays, and a group naming somebody it hasn't got stands aside.
 *  Adding Luuk and Qingxiao and then Qingxiao S1 leaves every Luuk team where it was, and narrows
 *  the Qingxiao ones. Excludes are absolute either way — a level not on the row cannot be on it. */
function tagsHold(map: Map<string, ResonatorFilter>, names: string[], fielded: string[]): boolean {
  const wanted = new Map<string, string[]>();
  for (const [name, mode] of map) {
    if (mode === "exclude") {
      if (names.includes(name)) return false;
      continue;
    }
    const who = tagOwner(name);
    if (!fielded.includes(who)) continue;
    wanted.set(who, [...(wanted.get(who) ?? []), name]);
  }
  return [...wanted.values()].every((group) => group.some((name) => names.includes(name)));
}

/** The pool as each added leader answers for it: the others added, and how many of them the best
 *  team fielding that leader manages to hold at once. Memoised on the pool itself, since it reads
 *  the whole roster and the pool changes far more rarely than this is asked. */
let poolAdded: string[] = [];
let poolNeeds = new Map<string, number>();
let poolKey = " ";
function leaderNeeds(): Map<string, number> {
  const added = [...resonatorFilters].filter(([, mode]) => mode === "include").map(([name]) => name);
  const key = added.join(" ");
  if (key === poolKey) return poolNeeds;
  [poolKey, poolAdded, poolNeeds] = [key, added, new Map()];
  for (const ms of Object.values(TEAMS)) {
    for (const m of ms) {
      if (!MDPS_NAMES.has(m.name) || !added.includes(m.name)) continue;
      const held = added.filter((o) => o !== m.name && ms.some((x) => x.name === o)).length;
      poolNeeds.set(m.name, Math.max(poolNeeds.get(m.name) ?? 0, held));
    }
  }
  return poolNeeds;
}

/**
 * Which teams the resonator pool opens. Each added resonator who leads somewhere (`MDPS_NAMES`)
 * brings in every team fielding them — the ones they only support included, so adding Phrolova
 * reaches the Xuanling teams she plays behind — and answers for those alone, by how well the pool
 * can be satisfied on a team of theirs at all, which is the count their best one manages:
 *
 * - can their best team field two of the others added? then only their teams fielding two survive;
 * - one? then their teams fielding at least one — any one, so two of the pool who never share a
 *   team with each other both still open rows beside them;
 * - none? then all of their teams stand, so a second leader added alongside the first never costs
 *   the first any rows.
 *
 * Their sets are ORed, and anyone hidden strikes out every team they appear on. With none of them
 * added there is nothing to lead the narrowing, so it falls back to the whole roster narrowed by
 * everyone added: a lone support reads as "every team fielding them".
 */
export function teamWanted(members: Member[]): boolean {
  const has = (name: string): boolean => members.some((m) => m.name === name);
  for (const [name, mode] of resonatorFilters) if (mode === "exclude" && has(name)) return false;
  const needs = leaderNeeds();
  if (!needs.size) return poolAdded.every(has);
  for (const m of members) {
    const need = needs.get(m.name);
    if (need !== undefined && poolAdded.filter((o) => o !== m.name && has(o)).length >= need) return true;
  }
  return false;
}

/** "Phrolova S5" wherever the level is a build choice the rows differ on — every level the open
 *  compare put on screen, the baseline included, so "Phrolova S0" filters like any other. The top
 *  level's max-rank row is a level of its own, "Phrolova S6R5" (solver.ts's `topRank()`), so it
 *  filters apart from the S6 it stands beside. Null with the compare closed, where there is only
 *  the one level and a filter would say nothing. */
export function sequenceTagAt(m: Member, sequence: number, rank = 1, f: Filters = filters): string | null {
  if (!axisOpen(m, f, "sequences")) return null;
  return `${m.name} S${sequence}${rank > 1 ? `R${rank}` : ""}`;
}
export const sequenceTag = (m: Member, combo: Combo): string | null => {
  // the suffix belongs to the extra row alone, not to any row that happens to run above R1 — a
  // cost handing out R5, or a weapon listed at one pinned rank, says nothing about the level
  const weapon = m.loadout.refinements.findIndex((ranks) => ranks.includes(combo.weapon));
  const extra = weapon < 0 ? null : topRank(m, filters, weapon);
  const rank = extra !== null && combo.weapon.refinement === extra + 1 ? combo.weapon.refinement : 1;
  return sequenceTagAt(m, combo.sequence, rank);
};

/** Every sequence tag a member's rows can carry, in row order — one per level the box shows, plus
 *  the top level's max-rank row. One empty string with the box shut, where no row is tagged. */
export function sequenceTagsOf(m: Member, f: Filters = filters): string[] {
  const tags = sequenceLevels(m, f).map((level) => sequenceTagAt(m, level, 1, f) ?? "");
  const extra = new Set(eligibleWeapons(m, f).map((w) => topRank(m, f, w)).filter((r) => r !== null));
  for (const rank of [...extra].sort((a, b) => a - b)) {
    tags.push(sequenceTagAt(m, m.loadout.sequences.length, rank + 1, f)!);
  }
  return tags;
}
export const refineTag = (m: Member, combo: Combo): string => `${m.name} R${combo.weapon.refinement}`;

function rowWanted(row: TeamRow): boolean {
  const fielded = row.members.map((m) => m.name);
  return namesHold(weaponFilters, row.combo.flatMap((c) => [c.weapon.name, weaponBase(c.weapon)]))
    && namesHold(echoFilters, row.combo.map((c, i) => echoLabel(row.members[i]!.loadout, c.echo)))
    && tagsHold(sequenceFilters, row.combo.flatMap((c, i) => sequenceTag(row.members[i]!, c) ?? []), fielded)
    && tagsHold(refineFilters, row.combo.map((c, i) => refineTag(row.members[i]!, c)), fielded);
}

/** One team's rows: every combo its solve opened (solver.ts `rowPicks()`) as real gear, filed as
 *  already run off the solve's scores, filtered to what the option filters want. */
function expandTeam(teamKey: string, members: Member[]): TeamRow[] {
  const solved = bestPicks.get(bestKey(teamKey, members, filters));
  if (!solved || !teamWanted(members)) return [];
  const rows = new Map<string, TeamRow>();
  const file = (picks: Pick[], score: Solved["scores"][number] | undefined, list: boolean): void => {
    const combo = picks.map((p, i) => comboOf(members[i]!.loadout, p));
    const key = `${teamKey}-${combo.map((c) => c.key).join("-")}`;
    if (list && !rows.has(key)) rows.set(key, { key, teamKey, members, combo });
    if (score && !results.has(key)) results.set(key, runFromScore(teamKey, members, combo, score));
  };
  solved.rows.forEach((picks, r) => file(picks, solved.scores[r], true));
  // hidden rows are filed as run for the gear compares, never listed
  (solved.hidden ?? []).forEach((picks, r) => file(picks, solved.hiddenScores?.[r], false));
  return [...rows.values()].filter(rowWanted);
}

export const teamRows = (): TeamRow[] => Object.entries(TEAMS).flatMap(([key, members]) => expandTeam(key, members));

/** Ways one axis can be filled across a team under its option filters. `null` = a closed box (one
 *  unknown pick). Excludes are exact per member; includes are counted by inclusion-exclusion;
 *  both are dropped (overcounting, the safe way) wherever a name can't be tested. */
function axisWays(lists: (string[] | null)[], map: Map<string, ResonatorFilter>, cap = Infinity, tagged = false): number {
  const excluded = [...map].filter(([, mode]) => mode === "exclude").map(([n]) => n);
  const sizes = (drop: string[]): number[] =>
    lists.map((l) => (l === null ? 1 : l.filter((n) => !drop.includes(n)).length));
  const product = (drop: string[]): number =>
    sizes(drop).reduce((p, n) => p * Math.min(cap, n), 1);

  const untestable = lists.includes(null) || sizes(excluded).some((n) => n > cap);
  const included = untestable ? [] : [...map].filter(([, mode]) => mode === "include").map(([n]) => n);
  // what has to hold at once: one name each normally, but for the level and rank tags one
  // *resonator* each, whose own names are an either-or (`tagsHold`) and so fall together
  const groups = new Map<string, string[]>();
  for (const name of included) {
    const key = tagged ? tagOwner(name) : name;
    groups.set(key, [...(groups.get(key) ?? []), name]);
  }
  // a level/rank group narrows only the teams fielding that resonator (`tagsHold`); one naming
  // somebody this team hasn't got stands aside rather than ruling the team out
  const wanted = [...groups.values()].filter((group) => !tagged
    || lists.some((l) => l?.some((n) => tagOwner(n) === tagOwner(group[0]!))));
  let total = 0;
  for (let mask = 0; mask < (1 << wanted.length); mask++) {
    const chosen = wanted.filter((_, k) => mask & (1 << k));
    total += (chosen.length % 2 ? -1 : 1) * product([...excluded, ...chosen.flat()]);
  }
  return total;
}

/** How many rows a team will open, known before it is solved — candidate counts only. Reads high, never low. */
export function estimatedRowCount(members: Member[], f: Filters = filters): number {
  return axisWays(members.map((m) => (axisOpen(m, f, "weapons")
      ? eligibleWeapons(m, f).map((i) => m.loadout.weapons[i]!.name) : null)), weaponFilters)
    * axisWays(members.map((m) => (axisOpen(m, f, "echoes")
      ? m.loadout.echoLoadouts.map((e) => echoLabel(m.loadout, e)) : null)), echoFilters)
    // an open box shows the build's own best few rolls, not the whole list (solver.ts's own
    // `rowPicks()`), and no filter narrows them
    * members.reduce((n, m) => n * (axisOpen(m, f, "mainstats") ? Math.min(MAINSTAT_ROWS, m.loadout.mainstats.length) : 1), 1)
    // a closed sequence box's level is known (the baseline, untagged), so the real list goes in
    * axisWays(members.map((m) => sequenceTagsOf(m, f)), sequenceFilters, Infinity, true)
    * members.reduce((n, m) => n * (axisOpen(m, f, "substats") ? 2 : 1), 1)
    * members.reduce((n, m) => n * (axisUsed(m, f, "refines")
      ? Math.max(...eligibleWeapons(m, f).map((i) => m.loadout.refinements[i]!.length))
      : 1), 1)
    // a scoped sonata/main-stat compare is costed as if it opened every row
    * members.reduce((n, m) => n
      * (!axisOpen(m, f, "echoes") && axisUsed(m, f, "echoes") ? m.loadout.echoLoadouts.length : 1)
      * (!axisOpen(m, f, "mainstats") && axisUsed(m, f, "mainstats") ? Math.min(MAINSTAT_ROWS, m.loadout.mainstats.length) : 1), 1);
}

export function prospectiveRows(f: Filters = filters): number {
  return Object.entries(TEAMS)
    .filter(([, members]) => teamWanted(members))
    .reduce((sum, [, members]) => sum + estimatedRowCount(members, f), 0);
}

/** A row straight from its key (team + per-member combo keys), for a `#team=` link with no table
 *  build. `null` for a stale key. */
export function rowFromKey(key: string): TeamRow | null {
  const [teamKey, ...comboKeys] = key.split("-");
  if (!teamKey) return null;
  const members = TEAMS[teamKey];
  if (!members || comboKeys.length !== members.length) return null;
  const combo: Combo[] = [];
  for (let i = 0; i < members.length; i++) {
    const parsed = /^(\d+)\.(\d+)\.(\d+)\.s(\d+)\.r(\d+)(\.m)?(\.h)?$/.exec(comboKeys[i]!);
    if (!parsed) return null;
    const l = members[i]!.loadout;
    const pick: Pick = { weapon: +parsed[1]!, echo: +parsed[2]!, mainstat: +parsed[3]!, sequence: +parsed[4]!, refine: +parsed[5]!, matrix: !!parsed[6], highSubs: !!parsed[7] };
    if (!l.refinements[pick.weapon]?.[pick.refine] || !l.echoLoadouts[pick.echo] || !l.mainstats[pick.mainstat] || (pick.matrix && !l.resonator.matrix)) return null;
    combo.push(comboOf(l, pick));
  }
  return { key, teamKey, members, combo };
}

/** The detail page's report, built on first open: the table's pass is untraced and keeps no lines,
 *  so the one team opened is re-run traced (deterministic, a few ms). The whole re-run is kept,
 *  its `state` included — the trace-only maps the hovers read (`State.grantedBy`) belong to the
 *  run that produced these lines, and the untraced pass's own state has none of them. */
export function detailFor(run: TeamRun): { report: Report } {
  if (run.detail) return run.detail;
  if (!run.rotationLines) {
    const traced = runTeam(run.teamKey, run.members, run.combo, true);
    run.rotationLines = traced.rotationLines;
    run.state = traced.state;
  }
  run.detail = { report: buildReport(run.rotationLines!.flat()) };
  return run.detail;
}

/* --------------------------------------------------------------- solves kept across reloads */

/** Solves are kept in localStorage keyed on the build: under dev.py the build is `/__livereload`'s
 *  checksum of every watched source (a kit edit changes it, and reloads the page); on a static
 *  host it is the shipped `tests/solves/index.json` stamp (a hash of the bundle), whose files are loaded
 *  first and localStorage restored on top. Over quota, the save drops. */
const SOLVES_KEY = "wuwa.solves.v1";
let buildStamp: string | null = null;
let solvesDirty = false;
/** Shipped states as filter signature -> the files holding its keys, and what has been pulled in.
 *  More than one file when a state shares keys with another (precompute.ts solves each key once). */
let shippedStates: Record<string, string | string[]> | null = null;
const shippedFetched = new Set<string>();
const shippedFiles = new Set<string>();
/** Keys that came from shipped files — never re-saved to localStorage (tens of MB). */
const shippedKeys = new Set<string>();
let restoredSolves = false;

/** Throw away every solve not computed this session, for a restored solve that blew up past the
 *  checks. `false` if nothing was restored — the error was ours. */
export function discardRestoredSolves(): boolean {
  if (!restoredSolves) return false;
  restoredSolves = false;
  bestPicks.clear(); picksCache.clear(); results.clear();
  shippedKeys.clear(); shippedStates = null; shippedFiles.clear(); shippedFetched.clear();
  try { localStorage.removeItem(SOLVES_KEY); } catch { /* no storage */ }
  return true;
}

/** The filter state a `bestKey()` was made under, read back off the key. */
function filtersOfKey(key: string, members: Member[]): Filters {
  const [, cost, bits] = key.split("|");
  const f = defaultFilters();
  f.cost = cost as TeamCost;
  (bits ?? "").split(",").forEach((entry, i) => {
    const m = members[i];
    if (!m) return;
    const [head, scoped] = entry.split(":");
    // the member's own Matrix bit leads their entry, the six axis bits follow
    const b = head!.startsWith("m") ? head!.slice(1) : head!;
    if (head!.startsWith("m")) f.matrix.push(m.loadout.resonator.name);
    AXES.forEach((a, k) => { if (b[k] === "1") f[a].push(m.loadout.resonator.name); });
    for (const s of (scoped ?? "").split(";").filter(Boolean)) {
      const [on, value, axis] = s.split("~") as [ScopedCompare["on"], string, ScopedCompare["axis"]];
      f.scoped.push({ resonator: m.loadout.resonator.name, on, value, axis });
    }
  });
  return f;
}

function picksFit(key: string, picks: Pick[]): boolean {
  const team = teamAt(key.split("|")[0]!);
  if (!team) return false;
  return picks.length === team.loadouts.length && picks.every((p, i) => {
    const l = team.loadouts[i]!;
    return p.weapon < l.weapons.length && p.refine < (l.refinements[p.weapon]?.length ?? 0) && p.echo < l.echoLoadouts.length && p.mainstat < l.mainstats.length;
  });
}

/** Does a solve made by other code (shipped, localStorage, a stale worker) fit this build: every
 *  pick indexes inside its loadout, every score names this team, and the rows carry exactly the
 *  sequence x rank cross `sequenceLevels()`/`refineLevels()` open now. */
export function solveFits(key: string, solved: Solved, f?: Filters): boolean {
  const team = teamAt(key.split("|")[0]!);
  if (!team) return false;
  const members = team.loadouts.map((l, i) => member(l, team.mdps[i]!));
  f ??= filtersOfKey(key, members);
  if (!picksFit(key, solved.picks) || !solved.rows.every((r) => picksFit(key, r)) || !(solved.hidden ?? []).every((r) => picksFit(key, r))) return false;
  const names = new Set([...members.map((m) => m.name), TUNE_BREAK_ENEMY.name]);
  const dps = members.filter((m) => m.mainDps).map((m) => m.name);
  if (!solved.scores.every((s) => s.bySlot.every(([n]) => names.has(n)) && dps.every((d) => s.bySlot.some(([n]) => n === d)))) return false;
  const expected = members.reduce((n, m, i) => {
    const pairs = new Set<string>();
    const weapons = axisOpen(m, f, "weapons") ? eligibleWeapons(m, f) : [solved.picks[i]!.weapon];
    const levels = axisOpen(m, f, "sequences") ? sequenceLevels(m, f) : [solved.picks[i]!.sequence];
    for (const sequence of levels) for (const weapon of weapons) {
      for (const refine of refineLevels(m, f, { ...solved.picks[i]!, weapon, sequence })) pairs.add(`${sequence}.${refine}`);
    }
    return n * pairs.size;
  }, 1);
  const patterns = new Set(solved.rows.map((r) => r.map((p) => `${p.sequence}.${p.refine}`).join(".")));
  return patterns.size === expected;
}

/** Pull in the shipped solves for one filter state, once — every file its keys were written to, and
 *  each file only the first time any state names it. Never overwrites a live solve. Each entry is
 *  checked against the filters its own key was made under, since a shared file carries another
 *  state's keys too (`solveFits` reads them back off the key). */
export async function loadShipped(f: Filters): Promise<void> {
  const sig = filterSignature(f);
  if (!shippedStates || shippedFetched.has(sig)) return;
  shippedFetched.add(sig);
  const entry = shippedStates[sig];
  if (!entry) return;
  for (const file of typeof entry === "string" ? [entry] : entry) {
    if (shippedFiles.has(file)) continue;
    shippedFiles.add(file);
    try {
      const res = await fetch(`./tests/solves/${file}`, { cache: "no-store" });
      if (!res.ok) continue;
      const saved = (await res.json()) as { solves: [string, Solved][]; picks: [string, Pick[]][] };
      for (const [k, v] of saved.solves) if (!bestPicks.has(k) && solveFits(k, v)) { bestPicks.set(k, v); shippedKeys.add(k); restoredSolves = true; }
      for (const [k, v] of saved.picks) if (!picksCache.has(k) && picksFit(k, v)) { picksCache.set(k, v); restoredSolves = true; }
    } catch { /* missing or stale — that state solves here */ }
  }
}

export async function loadSolves(): Promise<void> {
  const restore = (saved: SolveSave): void => {
    if (saved.stamp !== buildStamp) return;
    for (const [k, v] of saved.solves) if (solveFits(k, v)) { bestPicks.set(k, v); restoredSolves = true; }
    for (const [k, v] of saved.picks) if (picksFit(k, v)) { picksCache.set(k, v); restoredSolves = true; }
  };
  try {
    const live = await fetch("/__livereload", { cache: "no-store" }).catch(() => null);
    if (live?.ok) buildStamp = `dev:${await live.text()}`;
    else {
      const idx = await fetch("./tests/solves/index.json", { cache: "no-store" });
      if (!idx.ok) return;
      const meta = (await idx.json()) as { stamp: string; states: Record<string, string | string[]> };
      buildStamp = meta.stamp;
      shippedStates = meta.states;
      await loadShipped(filters);
    }
    const raw = localStorage.getItem(SOLVES_KEY);
    if (raw) restore(JSON.parse(raw) as SolveSave);
  } catch { /* no stamp, no storage, or a stale shape */ }
}

export function saveSolves(): void {
  if (buildStamp === null || !solvesDirty) return;
  solvesDirty = false;
  try {
    const save: SolveSave = {
      stamp: buildStamp,
      solves: [...bestPicks].filter(([k]) => !shippedKeys.has(k)),
      picks: [...picksCache],
    };
    localStorage.setItem(SOLVES_KEY, JSON.stringify(save));
  } catch { /* over quota — solved again next load */ }
}

/* --------------------------------------------------------------------------- state in the URL */

/** The whole page state lives in the hash as a query string: `mx=` the Matrix list, `tc=` cost, `cw=`...
 *  compares, `cs=` scoped compares, `r`/`x` + `wr`/`wx`... include/exclude lists, `team=`. Absent
 *  params read as defaults so an old bare `#team=` link still works. */
export const hashParams = (): URLSearchParams => new URLSearchParams(location.hash.replace(/^#/, ""));

const COMPARE_PARAM: Record<Axis, string> = { weapons: "cw", echoes: "ce", mainstats: "cm", substats: "cb", sequences: "cq", refines: "cr" };
const SCOPED_PARAM = "cs";
const COST_CODE: Record<TeamCost, string> = {
  s0r0: "r0", s0r1mdps: "r1m", s0r1: "r1",
  s1r1mdps: "s1m", s2r1mdps: "s2m", s3r1mdps: "s3m", s6r1mdps: "s6m", s6r5mdps: "s6r5m", s6r5: "s6r5",
};

const FILTER_GROUPS: { include: string; exclude: string; map: Map<string, ResonatorFilter> }[] = [
  { include: "r", exclude: "x", map: resonatorFilters },
  { include: "wr", exclude: "wx", map: weaponFilters },
  { include: "er", exclude: "ex", map: echoFilters },
  { include: "sr", exclude: "sx", map: sequenceFilters },
  { include: "fr", exclude: "fx", map: refineFilters },
];

/** Pull the hash into `filters` and the maps; `true` if anything moved (the caller owes a `refresh()`). */
export function applyHash(): boolean {
  const params = hashParams();
  let changed = false;

  {
    // `mx` names the resonators running their Matrix. An older link carries `f=x` instead — the
    // one box that turned it on table-wide — which reads as every kit that has one.
    const legacy = (params.get("f") ?? "").split(",").filter(Boolean);
    const next = params.has("mx")
      ? (params.get("mx") ?? "").split(",").filter(Boolean).map((n) => RESONATOR_NAME_BY_COMPACT.get(n) ?? n)
      : legacy.includes("x") || legacy.includes("matrix") ? [...MATRIX_RESONATORS] : [];
    const cur = filters.matrix;
    if (next.length !== cur.length || next.some((n) => !cur.includes(n))) { filters.matrix = next; changed = true; }
  }
  const code = params.get("tc");
  const cost = (Object.keys(COST_CODE) as TeamCost[]).find((c) => COST_CODE[c] === code) ?? "s0r1";
  if (filters.cost !== cost) { filters.cost = cost; changed = true; }
  for (const axis of AXES) {
    const next = (params.get(COMPARE_PARAM[axis]) ?? "").split(",").filter(Boolean)
      .map((n) => RESONATOR_NAME_BY_COMPACT.get(n) ?? n);
    const cur = filters[axis];
    if (next.length !== cur.length || next.some((n) => !cur.includes(n))) { filters[axis] = next; changed = true; }
  }
  {
    const next = (params.get(SCOPED_PARAM) ?? "").split(",").filter(Boolean).map((e): ScopedCompare => {
      const [resonator, on, value, axis] = decodeURIComponent(e).split("~") as [string, ScopedCompare["on"], string, ScopedCompare["axis"]];
      return { resonator, on, value, axis };
    });
    const cur = filters.scoped.map(scopedKey);
    if (next.length !== cur.length || next.some((s) => !cur.includes(scopedKey(s)))) { filters.scoped = next; changed = true; }
  }
  const named = (v: string | null, mode: ResonatorFilter, resonators: boolean): [string, ResonatorFilter][] =>
    (v ?? "").split(",").filter(Boolean).map((name) => [resonators ? RESONATOR_NAME_BY_COMPACT.get(name) ?? name : name, mode]);
  for (const { include, exclude, map } of FILTER_GROUPS) {
    const resonators = map === resonatorFilters;
    const next = new Map([...named(params.get(exclude), "exclude", resonators), ...named(params.get(include), "include", resonators)]);
    if (next.size !== map.size || [...next].some(([n, m]) => map.get(n) !== m)) {
      map.clear();
      for (const [name, mode] of next) map.set(name, mode);
      changed = true;
    }
  }
  return changed;
}

/** Write the state back into the URL. `replaceState` by default, so a filter flip never fires
 *  `hashchange` and never buries the page under Back entries — every caller routes for itself.
 *  `push` is for opening a detail view, which is a navigation of its own: it goes on the history
 *  stack so the browser's own Back button comes back out of it (index.ts's `hashchange`). */
export function syncHash(team: string | null = hashParams().get("team"), push = false): void {
  const named = (map: Map<string, ResonatorFilter>, mode: ResonatorFilter): string => [...map]
    // a resonator's spaces are dropped (`ElectroRover`); gear names keep theirs
    .filter(([, m]) => m === mode).map(([name]) => encodeURIComponent(map === resonatorFilters ? name.replace(/ /g, "") : name)).join(",");
  const compact = (n: string): string => encodeURIComponent(n.replace(/ /g, ""));
  const parts = filters.matrix.length ? [`mx=${filters.matrix.map(compact).join(",")}`] : [];
  if (filters.cost !== "s0r1") parts.push(`tc=${COST_CODE[filters.cost]}`);
  for (const axis of AXES) {
    if (filters[axis].length) parts.push(`${COMPARE_PARAM[axis]}=${filters[axis].map((n) => encodeURIComponent(n.replace(/ /g, ""))).join(",")}`);
  }
  if (filters.scoped.length) parts.push(`${SCOPED_PARAM}=${filters.scoped.map((s) => encodeURIComponent(scopedKey(s))).join(",")}`);
  for (const { include, exclude, map } of FILTER_GROUPS) {
    if (named(map, "include")) parts.push(`${include}=${named(map, "include")}`);
    if (named(map, "exclude")) parts.push(`${exclude}=${named(map, "exclude")}`);
  }
  if (team) parts.push(`team=${team}`);
  const next = parts.length ? `#${parts.join("&")}` : "";
  if (next === location.hash) return;
  const url = `${location.pathname}${location.search}${next}`;
  // the marker rides along on a replace, so a filter flip inside a detail view keeps it
  if (push) history.pushState({ detail: true }, "", url);
  else history.replaceState(history.state, "", url);
}

/** A detail route is valid iff `results` has actually run it. */
export const routeTeam = (): string | null => {
  const key = hashParams().get("team");
  return key && results.has(key) ? key : null;
};
