/**
 * The build search: the filter/pick vocabulary the page and precompute share, `optimizeTeam`,
 * the row set a solve opens, and `solveTeam`. DOM-free so a pool of Workers can run it — this file
 * is also the worker's own entry point (see the foot). The engine run it scores with is teamrun.ts.
 */
import { Buff, Loadout, EchoLoadout, Weapon, baseSequence } from "../engine/gear.js";
import { Tier } from "../engine/stats.js";
import type { Matrix } from "../engine/gear.js";
import { runTeam, scoreOf, erRollsFor, shortOf, deriveRun } from "./teamrun.js";
import type { TeamRun, RowScore } from "./teamrun.js";
import { teamAt } from "../resonators/teams.js";
import { critLineOf, Mainstat } from "../shared/mainstats.js";

export interface Member {
  name: string;
  color: string;
  loadout: Loadout;
  /** This team's main DPS — per team (teams.ts's `TeamEntry.mdps`), never stamped on the shared Loadout. */
  mainDps: boolean;
}

/** The resonator's name, the chain `level` where one is given, then the last word of a Resonance Mode
 *  ("Lynae S0 (Rupture)") — display only; filters still key on the plain name. */
export const loadoutName = (l: Loadout, level?: number): string =>
  `${l.resonator.name}${level === undefined ? "" : ` S${level}`}${l.mode ? ` (${l.mode.name.split(" ").pop()})` : ""}`;

export const member = (loadout: Loadout, mainDps = false): Member =>
  ({ name: loadout.resonator.name, color: loadout.resonator.color, loadout, mainDps });

/** `matrix` is the piece worn: the loadout's Matrix while that resonator's own Matrix filter is
 *  on (`matrixOn`), else null. */
/** `build` is `key` without the main stat: what an ER requirement is guessed by (teamrun.ts).
 *  `group` is `build` with the echo pick's group (`echoGroup()`): the builds one run scores together. */
export interface Combo { weapon: Weapon; echo: EchoLoadout; mainstat: Buff; sequence: number; matrix: Matrix | null; highSubs: boolean; key: string; build: string; group: string; }

/** The axes a resonator's rows can be opened up on. */
export type Axis = "weapons" | "echoes" | "mainstats" | "substats" | "sequences" | "refines";
// the order every compare list is written and read in, and the order the table's own menus offer
// them — the substat spread last, being the one axis that is a whole build's investment rather
// than a pick (the columns order it their own way, see table.ts's own `GEAR_AXES`)
export const AXES: Axis[] = ["weapons", "echoes", "mainstats", "sequences", "refines", "substats"];

/** Team Cost: no signatures (`s0r0`), one R1 signature to whichever main DPS gains most
 *  (`s0r1mdps`), or every limited resonator on theirs (every other mode). The `sN`/`rN` in the
 *  name is the chain level and weapon rank on top of that — one main DPS's alone where the name
 *  carries `mdps` (never a support's, however much the team would gain), everyone's where it
 *  doesn't; a trailing `_sNrN` is what everyone else gets (S0R1 without one). Rovers and 4* are
 *  S6 on standard/4* weapons throughout. */
export const TEAM_COSTS = ["s0r0", "s0r1mdps", "s0r1",
  "s2r1mdps", "s3r1mdps", "s6r1mdps", "s6r1mdps_s2r1", "s6r5mdps", "s6r5"] as const;
export type TeamCost = typeof TEAM_COSTS[number];

export interface Filters {
  /** The resonators running their own Matrix, by name. A full replacement of that member's build
   *  wherever they are fielded — not an axis: it opens no column and adds no row, the team simply
   *  runs with the Matrix on. Only a kit that has one can be named (see `matrixOn`). */
  matrix: string[];
  cost: TeamCost;
  /** Per axis, the resonators (by name) whose rows compare it; everyone else runs their best pick. */
  weapons: string[]; echoes: string[]; mainstats: string[]; substats: string[]; sequences: string[]; refines: string[];
  scoped: ScopedCompare[];
}

/** An axis compared on one pick of a resonator's alone: `on` gates it, `value` is the pick as its
 *  cell reads (a level or rank number, a weapon name with or without rank, an `echoLabel()`). */
export interface ScopedCompare { resonator: string; on: "sequence" | "refine" | "weapon" | "weaponRank" | "echo"; value: string; axis: "refines" | "echoes" | "mainstats" }
export const scopedKey = (s: ScopedCompare): string => `${s.resonator}~${s.on}~${s.value}~${s.axis}`;

export const weaponBase = (w: Weapon): string => w.name.replace(/ R\d$/, "");

export interface Gate { weapon: Weapon; sequence: number; echo: EchoLoadout }
// the rank the pick actually runs, not the loadout's default: a compare scoped to a weapon at one
// rank ("Blooming Jadehaven R5") has nothing to match otherwise
export const gateOf = (l: Loadout, p: Pick): Gate => ({ weapon: l.refinements[p.weapon]![p.refine]!, sequence: p.sequence, echo: l.echoLoadouts[p.echo]! });

export function scopedOpen(m: Member, f: Filters, axis: Axis, gate: Gate): boolean {
  const l = m.loadout;
  return f.scoped.some((s) => s.resonator === l.resonator.name && s.axis === axis && (
    s.on === "sequence" ? +s.value === gate.sequence
    : s.on === "refine" ? gate.weapon.refinement === +s.value
    : s.on === "weapon" ? weaponBase(gate.weapon) === s.value
    : s.on === "weaponRank" ? gate.weapon.name === s.value
    : echoLabel(l, gate.echo) === s.value));
}
/** Whether `axis` is compared on any of this member's rows (a column exists). */
export const axisUsed = (m: Member, f: Filters, axis: Axis): boolean =>
  axisOpen(m, f, axis) || f.scoped.some((s) => s.resonator === m.loadout.resonator.name && s.axis === axis);
/** Whether `axis` is compared on this member's row wearing `gate`. */
export const compares = (m: Member, f: Filters, axis: Axis, gate: Gate): boolean =>
  axisOpen(m, f, axis) || scopedOpen(m, f, axis, gate);

/** An echo pick's lines: its set names, plus the mainslot only where another option shares the
 *  sonata with a different mainslot. */
export function echoLines(l: Loadout, echo: EchoLoadout): string[] {
  const showMainslot = l.echoLoadouts.some((e) => e.sonata === echo.sonata && e.mainslot !== echo.mainslot);
  const lines = echo.sets.map((g) => g.name);
  if (showMainslot) lines.push(echo.mainslot.name);
  return lines;
}
export const echoLabel = (l: Loadout, echo: EchoLoadout): string => echoLines(l, echo).join(" + ");
/** Member `m`'s echo picks (indices) that `members`, its team, meets the prerequisite of. */
export function echoPicks(m: Member, members: Member[]): number[] {
  const team = members.map((t) => t.loadout.resonator);
  return m.loadout.echoLoadouts.flatMap((e, i) => (e.fits(team) ? [i] : []));
}

/** The page's opening state and what precompute.ts solves under — one definition so shipped keys match. */
export const defaultFilters = (): Filters => ({
  matrix: [], cost: "s0r1", weapons: [], echoes: [], mainstats: [], substats: [], sequences: [], refines: [], scoped: [],
});

export const axisOpen = (m: Member, filters: Filters, axis: Axis): boolean =>
  filters[axis].includes(m.loadout.resonator.name);

/** Whether this member wears their Matrix: named in the filter, and a kit that actually has one —
 *  a name left over from a link or a roster change simply doesn't apply. */
export const matrixOn = (m: Member, filters: Filters): boolean =>
  m.loadout.resonator.matrix != null && filters.matrix.includes(m.loadout.resonator.name);

export const filterSignature = (f: Filters): string =>
  [[...f.matrix].sort().join("+"), f.cost, ...AXES.map((a) => [...f[a]].sort().join("+")), f.scoped.map(scopedKey).sort().join("+")].join(",");

/** A solve's cache key: the team under everything that changes its row set — cost, and each
 *  member's Matrix bit, six axis bits and scoped compares. */
export const bestKey = (teamKey: string, members: Member[], filters: Filters): string => {
  const scoped = (m: Member): string => {
    const own = filters.scoped.filter((s) => s.resonator === m.loadout.resonator.name).map((s) => `${s.on}~${s.value}~${s.axis}`).sort();
    return own.length ? `:${own.join(";")}` : "";
  };
  const one = (m: Member): string =>
    (matrixOn(m, filters) ? "m" : "") + AXES.map((a) => (axisOpen(m, filters, a) ? "1" : "0")).join("") + scoped(m);
  return `${teamKey}|${filters.cost}|${members.map(one).join(",")}`;
};

/** The best build's key: only what the *search* reads (weapons compared, each member's Matrix,
 *  cost) — every other axis changes which rows open, never which build wins. */
export const picksKey = (teamKey: string, members: Member[], filters: Filters): string =>
  `${teamKey}|${filters.cost}|${members.map((m) => (matrixOn(m, filters) ? "m" : "") + (axisOpen(m, filters, "weapons") ? "1" : "0")).join("")}`;

/** Indices into a loadout's gear lists plus chain level, rank (into `Loadout.refinements[weapon]`),
 *  matrix and substat spread. Only weapon/echo/mainstat are ever searched. */
export interface Pick { weapon: number; echo: number; mainstat: number; sequence: number; refine: number; matrix: boolean; highSubs: boolean; }

export const comboOf = (l: Loadout, p: Pick): Combo => {
  const matrix = p.matrix && l.resonator.matrix ? l.resonator.matrix : null;
  return {
    weapon: l.refinements[p.weapon]![p.refine]!, echo: l.echoLoadouts[p.echo]!, mainstat: l.mainstats[p.mainstat]!,
    sequence: p.sequence, matrix, highSubs: p.highSubs,
    key: `${p.weapon}.${p.echo}.${p.mainstat}.s${p.sequence}.r${p.refine}${matrix ? ".m" : ""}${p.highSubs ? ".h" : ""}`,
    build: `${p.weapon}.${p.echo}.s${p.sequence}.r${p.refine}${matrix ? ".m" : ""}${p.highSubs ? ".h" : ""}`,
    group: `${p.weapon}.e${echoGroup(l, p.echo)}.s${p.sequence}.r${p.refine}${matrix ? ".m" : ""}${p.highSubs ? ".h" : ""}`,
  };
};

/** Per loadout, each echo pick's group: the first pick wearing the same gear but for constant-stat
 *  pieces in the same places (a set's 2pc), which one run scores as variants, as it does main stats. */
const ECHO_GROUPS = new WeakMap<Loadout, number[]>();
function echoGroup(l: Loadout, echo: number): number {
  let groups = ECHO_GROUPS.get(l);
  if (!groups) {
    const shapes = l.echoLoadouts.map((e) => e.pieces().map((g) => (g.constantOnly ? "*" : g.id)).join(","));
    ECHO_GROUPS.set(l, (groups = shapes.map((s) => shapes.indexOf(s))));
  }
  return groups[echo]!;
}

/** What a cost hands out on top of its signatures, read straight off the mode's name: the chain
 *  level, and the weapon rank as an index into a `Loadout.refinements` list. `holds` is whether
 *  this member is the one getting it — an `mdps` mode lifts exactly one, whichever the team gains
 *  most from (`optimizeTeam` hands it out the way it hands out the one signature). */
const costGrant = (cost: TeamCost, holds: boolean): { sequence: number; refine: number } => {
  const [, sequence, rank, mdps, rest = "0", restRank = "1"] = /^s(\d)r(\d)(mdps)?(?:_s(\d)r(\d))?$/.exec(cost)!;
  return mdps && !holds ? { sequence: +rest, refine: Math.max(0, +restRank - 1) } : { sequence: +sequence!, refine: Math.max(0, +rank! - 1) };
};

/** Whether the grant goes to one member the search picks rather than to the whole team. */
export const grantToOne = (cost: TeamCost): boolean => cost.includes("mdps");

/** The level a member runs with their Sequences box shut: their own baseline, lifted by the cost's
 *  grant where they hold it. Null where the build declares no rotation that low (`minSequence`).
 *  Read the same whether or not the box is open — the search settles who holds the grant, and
 *  `picksKey()` does not carry the chain boxes, so opening one must not move it. */
function costLevel(m: Member, cost: TeamCost, holds: boolean): number | null {
  const l = m.loadout;
  const max = l.sequences.length;
  if (!max) return l.minSequence ? null : 0;
  const at = Math.min(Math.max(Math.min(baseSequence(l.resonator), max), costGrant(cost, holds).sequence), max);
  return at < l.minSequence ? null : at;
}

/** The rank index a lifted member runs `weapon` at: the cost's, capped by the ranks that weapon
 *  actually lists (a loadout may pin one rank rather than the whole five). */
const costRefine = (m: Member, weapon: number, cost: TeamCost, holds: boolean): number =>
  Math.min(costGrant(cost, holds).refine, m.loadout.refinements[weapon]!.length - 1);

/** Ranks a row at `p` runs its weapon at: every listed rank while refines are compared there, else
 *  the build's own. An open Sequences box runs its whole ladder at R1 whatever the cost hands out,
 *  so the levels read against each other. */
export function refineLevels(m: Member, filters: Filters, p: Pick): number[] {
  const ranks = m.loadout.refinements[p.weapon]!;
  if (compares(m, filters, "refines", gateOf(m.loadout, p))) return ranks.map((_, i) => i);
  return [axisOpen(m, filters, "sequences") ? 0 : Math.min(p.refine, ranks.length - 1)];
}

/** Chain levels a member's rows cover, baseline first. Never searched — a node is strictly more kit —
 *  so an open box is a row per level from the baseline up; a `Tier.Free` resonator opens from S0.
 *  The cost's own level lifts the *closed* box alone (an open one still opens from the resonator's
 *  baseline, or the compare beside it would have nothing to measure against).
 *  Empty where the build declares no rotation at any level in reach (`Loadout.minSequence`): a
 *  closed box below it has no row, and its teams drop out (`hasBuild()`). */
export function sequenceLevels(m: Member, filters: Filters, holds = true): number[] {
  const l = m.loadout;
  const max = l.sequences.length;
  if (!axisOpen(m, filters, "sequences") || !max) {
    const at = costLevel(m, filters.cost, holds);
    return at === null ? [] : [at];
  }
  const base = Math.min(baseSequence(l.resonator), max);
  const from = Math.max(l.minSequence, l.resonator.tier === Tier.Free ? 0 : base);
  return Array.from({ length: max - from + 1 }, (_, i) => from + i);
}

/** Whether a member has any build under these filters: a weapon it may hold and a chain level
 *  its rotation covers. A team with a member that has none is not shown. */
export const hasBuild = (m: Member, filters: Filters): boolean =>
  eligibleWeapons(m, filters).length > 0 && sequenceLevels(m, filters, !grantToOne(filters.cost)).length > 0;

export const isSignature = (l: Loadout, i: number): boolean => l.weapons[i]!.tier === Tier.Limited;
/** A loadout lists its best signature first and its best standard right after (CLAUDE.md). */
export const standardWeapon = (l: Loadout): number => Math.max(0, l.weapons.findIndex((w) => w.tier !== Tier.Limited));

/** Every weapon while comparing; otherwise the one the cost allows (`sig`: may wear a signature). */
export function weaponOptions(m: Member, filters: Filters, sig: boolean): number[] {
  const l = m.loadout;
  if (axisOpen(m, filters, "weapons")) return l.weapons.map((_, i) => i);
  return [sig ? 0 : standardWeapon(l)];
}

/** Whether every limited resonator wears their signature: `s0r0` gives nobody one and `s0r1mdps`
 *  hands out exactly one, so only those two search on standards. */
export const sigForAll = (cost: TeamCost): boolean => cost !== "s0r0" && cost !== "s0r1mdps";

export const sigAllowed = (i: number, holder: number | null, cost: TeamCost): boolean =>
  sigForAll(cost) || (cost === "s0r1mdps" && i === holder);

/** Which member of a build wears a signature — the `s0r1mdps` holder, read off the build. */
export const sigHolder = (members: Member[], picks: Pick[]): number | null => {
  const i = picks.findIndex((p, k) => isSignature(members[k]!.loadout, p.weapon));
  return i < 0 ? null : i;
};

/** `weaponOptions()` with no holder to hand — what the page offers and estimates rows from. */
export function eligibleWeapons(m: Member, filters: Filters): number[] {
  return weaponOptions(m, filters, sigForAll(filters.cost));
}

/* ------------------------------------------------------------------------- the search */

/** Trial runs memoized per team: the sweeps re-score the same combos over and over. A combo's run
 *  is the same under every filter state, so the last team's are kept for its next solve (precompute
 *  solves each team's cost states back to back), without the fights they were read off. */
let trialCache = new Map<string, TeamRun>();
let cachedTeam: string | null = null;
/** Runs that carried every member's whole group of builds as variants, by group (`Combo.group`s): any
 *  other main stats or echo picks in it read off one of them (`deriveRun`) rather than fight again. */
let bases = new Map<string, TeamRun[]>();
const groupKey = (teamKey: string, combo: Combo[]): string => `${teamKey}-${combo.map((c) => c.group).join("-")}`;
/** `combo` off a base run of its group, where one stands for it. */
function derived(teamKey: string, members: Member[], combo: Combo[], variants: (Combo[] | null)[] | null): TeamRun | null {
  for (const from of bases.get(groupKey(teamKey, combo)) ?? []) {
    const run = deriveRun(teamKey, members, combo, from, variants);
    if (run) return run;
  }
  return null;
}
/** Every build of member `m`'s group at `p` but `p`'s own: each echo pick of its group (`echoGroup()`)
 *  with each main stat. */
function groupAlts(m: Member, p: Pick, members: Member[]): Combo[] {
  const l = m.loadout, group = echoGroup(l, p.echo), out: Combo[] = [];
  for (const echo of echoPicks(m, members)) {
    if (echoGroup(l, echo) !== group) continue;
    for (let k = 0; k < l.mainstats.length; k++) if (echo !== p.echo || k !== p.mainstat) out.push(comboOf(l, { ...p, echo, mainstat: k }));
  }
  return out;
}
/** A real run of `combo` with everyone's group as variants, kept as a base: a piece moving the
 *  substat tier can't be read off the group's first run, but the next one on this tier can. */
function baseRun(teamKey: string, members: Member[], picks: Pick[], combo: Combo[]): TeamRun {
  const run = runTeam(teamKey, members, combo, false, members.map((m, i) => groupAlts(m, picks[i]!, members)));
  const at = groupKey(teamKey, combo);
  bases.set(at, [...(bases.get(at) ?? []), run]);
  return run;
}
/** `scoreMainstats()` answers, keyed the same plus which members were scored. */
let scoreCache = new Map<string, Map<number, TeamRun[]>>();

const trialKey = (teamKey: string, combo: Combo[]): string => `${teamKey}-${combo.map((c) => c.key).join("-")}`;

function trialRun(teamKey: string, members: Member[], picks: Pick[]): TeamRun {
  const combo = members.map((m, i) => comboOf(m.loadout, picks[i]!));
  const key = trialKey(teamKey, combo);
  let hit = trialCache.get(key);
  if (!hit) {
    hit = derived(teamKey, members, combo, null) ?? baseRun(teamKey, members, picks, combo);
    // the fight itself is runTeam's alone, and the cache keeps a team's runs across its states
    hit.state = null;
    trialCache.set(key, hit);
  }
  return hit;
}

/**
 * Every main stat of each member in `who` scored in one run: the build as picked runs for real and
 * the other main stats ride along as engine variants (a main stat only feeds its wearer). A variant
 * the engine can't vouch for (`unsafe`) is scored with a real run instead.
 * @returns per member in `who`, a `TeamRun` per main-stat index
 */
function scoreMainstats(teamKey: string, members: Member[], picks: Pick[], who: number[], prune = true): Map<number, TeamRun[]> {
  const combo = members.map((m, i) => comboOf(m.loadout, picks[i]!));
  const key = `${trialKey(teamKey, combo)}|${who.join(",")}|${prune ? "p" : ""}`;
  let out = scoreCache.get(key);
  if (!out) scoreCache.set(key, out = scoreMainstatsRun(teamKey, members, picks, who, combo, prune));
  return out;
}

/** @param prune  leave unscored the builds a cheaper one proves can't win (see `pruneMainstats`) —
 *  off where every row is shown. */
function scoreMainstatsRun(teamKey: string, members: Member[], picks: Pick[], who: number[], combo: Combo[], prune: boolean): Map<number, TeamRun[]> {
  const alts = members.map((m, i) => (who.includes(i)
    ? m.loadout.mainstats.map((_, k) => k).filter((k) => k !== picks[i]!.mainstat) : null));
  const variants = alts.map((a, i) => a && a.map((k) => comboOf(members[i]!.loadout, { ...picks[i]!, mainstat: k })));
  let run = derived(teamKey, members, combo, variants);
  // where a variant stands among what the run carried: the main stats asked for, or the whole group
  let carried = variants;
  if (!run) {
    // the whole group carried, where that records the very hits these variants would (a member with
    // variants or none alike): a base for the group, its main stats here read off it as they stand
    const group = members.map((m, i) => groupAlts(m, picks[i]!, members));
    const covers = members.every((_, i) => !!variants[i]?.length === (group[i]!.length > 0));
    if (covers) carried = group;
    run = runTeam(teamKey, members, combo, false, carried);
    // every member's whole list carried: a base for any main stats on this build
    if (covers || members.every((m, i) => m.loadout.mainstats.length < 2 || who.includes(i))) {
      const at = groupKey(teamKey, combo);
      bases.set(at, [...(bases.get(at) ?? []), run]);
    } else run.base = undefined;
  }
  run.state = null;
  trialCache.set(trialKey(teamKey, combo), run);
  const out = new Map<number, TeamRun[]>();
  for (const i of who) {
    const scores: TeamRun[] = [];
    scores[picks[i]!.mainstat] = run;
    // a variant the engine can't vouch for costs a real run, so those wait until pruning has had its say
    const unsafe = new Set<number>();
    const at = carried[i] === variants[i] ? null : new Map(carried[i]!.map((c, n) => [c.key, n]));
    alts[i]!.forEach((k, v) => {
      const alt = variants[i]![v]!;
      const variant = run.variantRuns[i]![at ? at.get(alt.key)! : v]!;
      if (variant.unsafe) {
        unsafe.add(k);
        return;
      }
      const c = combo.map((x, j) => (j === i ? alt : x));
      // the breakdown read through, so only a row that ships builds it
      const scored: TeamRun = {
        state: run.state, teamKey, members, combo: c, rotationLines: null, variantRuns: [],
        total: variant.total, seconds: variant.seconds, sectionSeconds: run.sectionSeconds,
        get bySlot() { return variant.bySlot; },
        get sectionTotals() { return variant.sectionTotals; },
        get sectionBySlot() { return variant.sectionBySlot; },
        get fightTotal() { return variant.fightTotal; },
        get fightBySlot() { return variant.fightBySlot; },
      };
      trialCache.set(trialKey(teamKey, c), scored);
      scores[k] = scored;
    });
    const total = (k: number): number => {
      if (!scores[k]) scores[k] = trialRun(teamKey, members, picks.map((p, j) => (j === i ? { ...p, mainstat: k } : p)));
      return scores[k]!.total;
    };
    const skip = prune ? pruneMainstats(members[i]!.loadout, scores, total) : new Set<number>();
    for (const k of unsafe) if (!skip.has(k)) total(k);
    out.set(i, scores);
  }
  return out;
}

/**
 * The 43311 builds a cheaper one proves can't win (`CritLine`): once CR and CD are ranked on one
 * 3-cost pair, the loser's other builds; and per element, atk/atk once atk/ele loses to ele/ele (or
 * ele/ele once atk/ele loses to atk/atk). `scores` holds what is already known; `total` scores a
 * build, running it if it has to. A build already scored is never skipped, and a tie skips nothing.
 */
function pruneMainstats(l: Loadout, scores: TeamRun[], total: (k: number) => number): Set<number> {
  const skip = new Set<number>();
  const lines = l.mainstats.map((piece, k) => ({ k, line: critLineOf(piece) })).filter((x) => x.line);
  const at = (four: Mainstat, atk: number, element: Mainstat | null, ones: string): number | undefined =>
    lines.find(({ line }) => line!.four === four && line!.atk === atk && line!.element === element && line!.ones === ones)?.k;
  // CR against CD, on the pair that costs the fewest real runs to compare
  const pairs = lines.filter(({ line }) => line!.four === Mainstat.CR4)
    .map(({ k, line }) => [k, at(Mainstat.CD4, line!.atk, line!.element, line!.ones)] as const)
    .filter((pair): pair is readonly [number, number] => pair[1] !== undefined)
    .sort((a, b) => Number(!scores[a[0]]) + Number(!scores[a[1]]) - Number(!scores[b[0]]) - Number(!scores[b[1]]));
  let four: Mainstat | null = null;
  if (pairs.length) {
    const [cr, cd] = pairs[0]!;
    const tcr = total(cr), tcd = total(cd);
    if (tcr !== tcd) {
      four = tcr > tcd ? Mainstat.CR4 : Mainstat.CD4;
      for (const { k, line } of lines) if (line!.four !== four && !scores[k]) skip.add(k);
    }
  }
  // the ATK/element trade along each element, for whichever 4-costs are still in the running
  for (const { line } of lines) {
    if (line!.atk !== 1 || (four !== null && line!.four !== four)) continue;
    const { four: f, element, ones } = line!;
    const ae = at(f, 1, element, ones)!, ee = at(f, 0, element, ones), aa = at(f, 2, null, ones);
    if (ee === undefined || aa === undefined) continue;
    const tae = total(ae);
    if (!scores[ee] && scores[aa] && tae < total(aa)) {
      skip.add(ee);
      continue;
    }
    if (tae < total(ee) && !scores[aa]) skip.add(aa);
  }
  return skip;
}

/** Member `i`'s main stats ranked by what the *team* scores wearing each, best first.
 *
 *  The team total, not the wearer's own out of `bySlot`: the stat only feeds its wearer, but what it
 *  buys them need not stay with them — an ER roll that lands a support's Liberation is paid to
 *  whoever their Outro hands off to, and ranking on their own damage is what used to pass it over. */
function rankedMainstats(scores: TeamRun[]): { mainstat: number; total: number }[] {
  const ranked: { mainstat: number; total: number }[] = [];
  scores.forEach((run, k) => ranked.push({ mainstat: k, total: run.total }));
  return ranked.sort((a, b) => b.total - a.total);
}

/** Whether member `i` wearing `mainstat` can carry the ER their Liberation wants. */
const mainstatFills = (teamKey: string, members: Member[], picks: Pick[], i: number) => (mainstat: number): boolean => {
  const combo = picks.map((p, j) => comboOf(members[j]!.loadout, j === i ? { ...p, mainstat } : p));
  return shortOf(teamKey, members, combo)[i] === null;
};

/** Each of `who`'s best main stat under `picks`, everyone else's as given — one run for the set.
 *  The best whose Energy bar the spread can fill: nothing in the fight stops a Liberation firing on
 *  an empty bar, so an over-budget build otherwise scores highest and would always win; where a main
 *  stat carrying ER is what makes the sonata reachable, this is what reaches for it. Only when
 *  nothing fits does the plain damage order stand. */
function bestMainstats(teamKey: string, members: Member[], picks: Pick[], who: number[]): Pick[] {
  const scores = scoreMainstats(teamKey, members, picks, who);
  return picks.map((p, i) => {
    if (!who.includes(i)) return p;
    const ranked = rankedMainstats(scores.get(i)!), fills = mainstatFills(teamKey, members, picks, i);
    const index = (ranked.find((r) => fills(r.mainstat)) ?? ranked[0])?.mainstat ?? p.mainstat;
    return index === p.mainstat ? p : { ...p, mainstat: index };
  });
}

/**
 * The team's best build: every weapon and echo set the cost allows on every member — and, where the
 * cost's grant goes to one main DPS, every choice of who holds it (or nobody) — each with every
 * member's best main stat, which one run scores for the whole team (`bestMainstats`: a main stat only
 * feeds its wearer, so each member's best stands whatever the others wear). The highest total whose
 * every bar fills wins; a climb from one build to the next can stall on a build the team cannot fund,
 * and a repair after it fixes one member at a time, so the whole space is walked instead.
 */
export function optimizeTeam(teamKey: string, members: Member[], filters: Filters): Pick[] {
  const one = grantToOne(filters.cost);
  /** Whether every member can fill their Energy bar on `trial` — one member's set can be what funds
   *  another's Liberation, so a build is judged whole. */
  const fillsAll = (trial: Pick[]): boolean =>
    shortOf(teamKey, members, trial.map((p, j) => comboOf(members[j]!.loadout, p))).every((s) => s === null);
  // who the one grant goes to: nobody, or a main DPS — never a support, whatever it would buy
  const holders: (number | null)[] = [null];
  if (one) {
    for (let i = 0; i < members.length; i++) if (members[i]!.mainDps) holders.push(i);
  }
  const everyone = members.map((_, k) => k);
  let best: { picks: Pick[]; total: number; fills: boolean } | null = null;
  for (const holder of holders) {
    // each member's weapon x echo set, at the level and rank the cost gives them under this holder
    const options = members.map((m, i) => {
      const holds = !one || holder === i;
      const base = sequenceLevels(m, filters, !one)[0]!;
      const level = one && holds ? costLevel(m, filters.cost, true) : null;
      const sequence = level === null ? base : Math.max(level, base);
      const list: Pick[] = [];
      for (const weapon of weaponOptions(m, filters, sigAllowed(i, holder, filters.cost))) {
        for (const echo of echoPicks(m, members)) {
          list.push({ weapon, echo, mainstat: 0, sequence, refine: costRefine(m, weapon, filters.cost, holds), matrix: matrixOn(m, filters), highSubs: false });
        }
      }
      return list;
    });
    for (const trial of cartesian(options)) {
      // re-rolled until it stands: whether a main stat fills, and which unsafe ones are worth a real
      // run, are judged against the teammates' main stats of the moment
      let picks = bestMainstats(teamKey, members, trial, everyone);
      for (let round = 0; round < 3; round++) {
        const next = bestMainstats(teamKey, members, picks, everyone);
        if (next.every((p, i) => p.mainstat === picks[i]!.mainstat)) break;
        picks = next;
      }
      const total = trialRun(teamKey, members, picks).total;
      const fills = fillsAll(picks);
      if (!best || (fills && !best.fills) || (fills === best.fills && total > best.total)) best = { picks, total, fills };
    }
  }
  const picks = best!.picks;
  const canFill = (i: number): boolean => shortOf(teamKey, members, picks.map((p, j) => comboOf(members[j]!.loadout, p)))[i] === null;
  // Nothing this member owns fills their bar: three ER rolls is as far as a spread goes, so the
  // Energy has to come off an ER 3-cost main stat — and this kit has none to wear. The team is not
  // runnable as listed, and saying so beats reporting damage from a Liberation that never fires.
  for (let i = 0; i < members.length; i++) {
    if (canFill(i)) continue;
    const l = members[i]!.loadout;
    const combo = picks.map((p, j) => comboOf(members[j]!.loadout, p));
    const rolls = erRollsFor(teamKey, members, combo)[i]!;
    // the build each member settled on, since the requirement is a property of the whole team's
    // rotations and levels rather than of the one who came up short
    const built = members.map((m, j) => `${m.name} s${picks[j]!.sequence}r${picks[j]!.refine + 1} ${m.loadout.refinements[picks[j]!.weapon]![picks[j]!.refine]!.name.replace(/ R\d$/, "")}`).join(", ");
    if (shortOf(teamKey, members, combo)[i] === "cr") {
      throw new Error(`${members[i]!.name} on ${teamKey} (${built}) cannot reach their ${l.minCritRate}% Crit Rate: `
        + `no weapon, echo and main stat on their list shows that much on the character screen`);
    }
    const asked = l.minEr ? ` (their kit asks for ${l.minEr}% at least)` : "";
    throw new Error(`${members[i]!.name} on ${teamKey} (${built}) cannot fill their Energy bar${asked}: ${rolls} ER rolls wanted, `
      + `${l.substat.tiers[l.substat.tiers.length - 1]!.rolls} is all a spread carries, and no ER 3-cost main stat is on their list`);
  }
  return picks;
}

/* ------------------------------------------------------------------------- the row set */

export const teamFromKey = (key: string): Member[] => {
  const team = teamAt(key);
  if (!team) throw new Error(`no team is named ${key}`);
  return team.loadouts.map((l, i) => member(l, team.mdps[i]!));
};

function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((picked) => list.map((item) => [...picked, item])), [[]]);
}

/** One member's weapon/sequence/refine/echo/substat picks to cross into the team-wide product:
 *  every option on an open axis, the home pick on a closed one. Main stats are picked per build. */
function buildsOf(m: Member, members: Member[], home: Pick, f: Filters, sig: boolean): Pick[] {
  const l = m.loadout;
  const weapons = axisOpen(m, f, "weapons") ? weaponOptions(m, f, sig) : [home.weapon];
  const subs = axisOpen(m, f, "substats") ? [false, true] : [home.highSubs];
  // a shut box runs the level the build settled on — a `mdps` cost lifted one member and the search
  // is where that answer lives, so it is read back off the picks rather than derived again
  const sequences = axisOpen(m, f, "sequences") ? sequenceLevels(m, f) : [home.sequence];
  const picks: Pick[] = [];
  // the rank rides with the weapon: a pinned one-rank entry has no index for a higher rank
  for (const weapon of weapons) for (const sequence of sequences) {
    const at = { ...home, weapon, sequence, refine: Math.min(home.refine, l.refinements[weapon]!.length - 1) };
    const echoes = compares(m, f, "echoes", gateOf(l, at)) ? echoPicks(m, members) : [home.echo];
    for (const refine of refineLevels(m, f, at)) for (const echo of echoes) for (const highSubs of subs) {
      picks.push({ ...at, refine, echo, highSubs });
    }
  }
  // a pick whose gear cannot fill this member's Energy bar is no build at all — drop it and let the
  // sonatas and mainslots that carry ER stand. Everything dropped means the kit itself is short, so
  // the home pick stays and the row reads on whatever it can reach (teamrun.ts's `shortOf`)
  return picks;
}

/**
 * Every row the table shows for this team: the cross of each member's candidates, then per build
 * a closed echo box re-searched (`pinEchoes`) and closed main stats settled — a worse weapon judged
 * in the winner's rolls reads worse than it is. Open main stats get a row per roll, best first.
 * `hidden`: the sonata re-search's losing candidates, kept so a gear compare has its baseline.
 */
function rowPicks(
  teamKey: string, members: Member[], best: Pick[], filters: Filters, onProgress?: (share: number) => void,
): { rows: Pick[][]; hidden: Pick[][] } {
  const hidden: Pick[][] = [];
  const mainstatsOpen = (picks: Pick[]): number[] =>
    members.map((_, i) => i).filter((i) => compares(members[i]!, filters, "mainstats", gateOf(members[i]!.loadout, picks[i]!)));

  // a teammate's roll changes the buffs they hand over, so closed members settle over rounds
  const settle = (picks: Pick[]): Pick[] => {
    const open = mainstatsOpen(picks);
    const closed = members.map((_, i) => i).filter((i) => !open.includes(i));
    if (!closed.length) return picks;
    let out = picks;
    for (let round = 0; round < 3; round++) {
      const next = bestMainstats(teamKey, members, out, closed);
      const changed = next.some((p, i) => p.mainstat !== out[i]!.mainstat);
      out = next;
      if (!changed) break;
    }
    return out;
  };

  const compared = members.some((m) => AXES.some((a) => axisUsed(m, filters, a)));
  const pinEchoes = (picks: Pick[]): Pick[] => {
    let out = picks;
    const closedEchoes = members.map((_, i) => i).filter((i) => !compares(members[i]!, filters, "echoes", gateOf(members[i]!.loadout, picks[i]!)));
    // every closed member is re-rolled per trial: the hidden rows are compare baselines
    const reroll = (trial: Pick[], i: number): { picks: Pick[]; total: number } => {
      const rolled = bestMainstats(teamKey, members, trial, members.map((_, k) => k).filter((k) => !mainstatsOpen(trial).includes(k)));
      return { picks: rolled, total: trialRun(teamKey, members, rolled).total };
    };
    for (const i of closedEchoes) {
      const echoes = echoPicks(members[i]!, members);
      if (echoes.length < 2) continue;
      const home = out[i]!;
      const incumbent = reroll(out, i);
      let winner = home;
      let bestTotal = incumbent.total;
      for (const echo of echoes) {
        if (echo === home.echo) continue;
        const trial = reroll(out.map((p, j) => (j === i ? { ...home, echo } : p)), i);
        hidden.push(trial.picks);
        if (trial.total > bestTotal) {
          bestTotal = trial.total;
          winner = trial.picks[i]!;
        }
      }
      hidden.push(incumbent.picks);
      out = out.map((p, j) => (j === i ? winner : p));
    }
    return out;
  };

  const holder = sigHolder(members, best);
  const builds = cartesian(members.map((m, i) => buildsOf(m, members, best[i]!, filters, sigAllowed(i, holder, filters.cost))));
  const seen = new Map<string, Pick[]>();
  for (const picks of builds) {
    const key = picks.map((p) => `${p.weapon}.${p.echo}.s${p.sequence}.r${p.refine}${p.highSubs ? ".h" : ""}`).join("-");
    if (!seen.has(key)) seen.set(key, picks);
  }

  // with nothing compared the hidden rows are never read, and the one build is the search's own
  // converged answer: re-searching its sonatas would only repeat the sweep that just settled it
  const rows: Pick[][] = [];
  const baselines = new Set<string>();
  let built = 0;
  for (const build of seen.values()) {
    onProgress?.(built++ / seen.size);
    const settled = settle(compared ? pinEchoes(build) : build);
    // a compared row measures against its axis's baseline in *its own* settled sets — the
    // re-search settles each build apart, so that twin is not otherwise guaranteed to be run:
    // the baseline level at R1 for a level or rank row, every non-limited weapon (at the rank
    // the row runs) for a signature row, the default subs for a high-subs row
    const twinOf = (i: number, change: Partial<Pick>): void => {
      const twin = settled.map((q, j) => (j === i ? { ...q, ...change } : q));
      const key = twin.map((q) => `${q.weapon}.${q.echo}.s${q.sequence}.r${q.refine}${q.highSubs ? ".h" : ""}`).join("-");
      if (baselines.has(key)) return;
      baselines.add(key);
      hidden.push(settle(twin));
    };
    // one twin per axis, everything else the row's own: a level twin keeps the row's rank (a rank
    // column open holds it in the twin key), a rank twin keeps the row's level
    members.forEach((m, i) => {
      const p = settled[i]!;
      const ranked = axisUsed(m, filters, "refines");
      if (axisOpen(m, filters, "sequences") && p.sequence !== sequenceLevels(m, filters)[0]!) twinOf(i, { sequence: sequenceLevels(m, filters)[0]! });
      if (ranked && p.refine !== 0) twinOf(i, { refine: 0 });
      if (axisOpen(m, filters, "weapons") && m.loadout.weapons[p.weapon]!.tier === Tier.Limited) {
        for (const w of eligibleWeapons(m, filters)) {
          if (m.loadout.weapons[w]!.tier === Tier.Limited) continue;
          twinOf(i, { weapon: w, refine: ranked ? 0 : Math.min(p.refine, m.loadout.refinements[w]!.length - 1) });
        }
      }
      if (axisOpen(m, filters, "substats") && p.highSubs) twinOf(i, { highSubs: false });
    });
    const open = mainstatsOpen(settled);
    if (!open.length) { rows.push(settled); continue; }
    const scores = scoreMainstats(teamKey, members, settled, open, false);
    const top = new Map<number, number[]>();
    for (const i of open) {
      // the comparison rows list every main stat on its own merits, over-budget ones included —
      // it is the *picked* build that has to fill the bar, not the alternatives shown beside it
      top.set(i, rankedMainstats(scores.get(i)!).map((r) => r.mainstat));
    }
    for (const mainstats of cartesian(members.map((_, i) => top.get(i) ?? [settled[i]!.mainstat]))) {
      rows.push(settled.map((p, i) => ({ ...p, mainstat: mainstats[i]! })));
    }
  }
  return { rows, hidden };
}

/** Point the run caches at `teamKey`, dropping the last team's. */
function useTeam(teamKey: string): void {
  if (teamKey === cachedTeam) return;
  trialCache = new Map();
  scoreCache = new Map();
  bases = new Map();
  cachedTeam = teamKey;
}

/** Member `i`'s main stats ranked the way an open box ranks them on `picks` (`rowPicks()`), best
 *  first, the order its rows come in. */
export function mainstatRanking(teamKey: string, members: Member[], picks: Pick[], i: number): { mainstat: number; run: TeamRun }[] {
  useTeam(teamKey);
  const scores = scoreMainstats(teamKey, members, picks, [i], false).get(i)!;
  return rankedMainstats(scores).map((r) => ({ mainstat: r.mainstat, run: scores[r.mainstat]! }));
}

/** One team's whole solve — the unit of parallel work. `known`: the best build when the caller
 *  already has it (most box flips change rows, not the build). `onProgress` reports how far in it
 *  is, 0 to 1: a team with every axis compared is thousands of rows of work in one unit, and the
 *  bar has nothing else to move on until the whole thing lands. The two passes take half apiece —
 *  expanding the builds, then scoring the rows they opened. */
export function solveTeam(
  teamKey: string, members: Member[], filters: Filters, known: Pick[] | null = null,
  onProgress?: (share: number) => void,
): Solved {
  useTeam(teamKey);
  const picks = known ?? optimizeTeam(teamKey, members, filters);
  const { rows, hidden } = rowPicks(teamKey, members, picks, filters, (s) => onProgress?.(s / 2));
  const score = (row: Pick[]): RowScore => {
    const combo = members.map((m, i) => comboOf(m.loadout, row[i]!));
    return scoreOf(trialCache.get(trialKey(teamKey, combo)) ?? runTeam(teamKey, members, combo));
  };
  const scores = rows.map((row, i) => {
    onProgress?.(0.5 + i / 2 / rows.length);
    return score(row);
  });
  const hiddenScores = hidden.map(score);
  return { picks, rows, scores, hidden, hiddenScores };
}

/* ------------------------------------------------------------------ worker protocol */

export interface SolveRequest { id: number; teamKey: string; filters: Filters; picks: Pick[] | null }

/** `hidden`/`hiddenScores` are absent on a solve saved before they existed. */
export interface Solved { picks: Pick[]; rows: Pick[][]; scores: RowScore[]; hidden?: Pick[][]; hiddenScores?: RowScore[] }

export interface SolveResponse extends Solved { id: number }
/** A half-finished solve saying how far in it is — `share` is 0 to 1 of that one team's work. */
export interface SolveProgress { id: number; share: number }
export const isProgress = (m: SolveResponse | SolveProgress): m is SolveProgress => "share" in m;

/** A roster's solves at rest (localStorage, dist/solves/*.json). A `stamp` that doesn't match the running build means nothing in it is used. */
export interface SolveSave { stamp: string; solves: [string, Solved][]; picks: [string, Pick[]][] }

// Worker entry: `document` is what a worker scope lacks; `self` keeps node (precompute) out.
if (typeof document === "undefined" && typeof self !== "undefined") {
  const ctx = self as unknown as {
    onmessage: ((e: MessageEvent<SolveRequest>) => void) | null;
    postMessage: (message: SolveResponse | SolveProgress) => void;
  };
  ctx.onmessage = ({ data }) => {
    // a message a percent, not one a row: the bar can't show finer than that and the port is the
    // one thing both threads share
    let sent = 0;
    const solved = solveTeam(data.teamKey, teamFromKey(data.teamKey), data.filters, data.picks, (share) => {
      if (share - sent < 0.01) return;
      sent = share;
      ctx.postMessage({ id: data.id, share });
    });
    ctx.postMessage({ id: data.id, ...solved });
  };
}
