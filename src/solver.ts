/**
 * The build search: the filter/pick vocabulary the page and precompute share, `optimizeTeam`,
 * the row set a solve opens, and `solveTeam`. DOM-free so a pool of Workers can run it — this file
 * is also the worker's own entry point (see the foot). The engine run it scores with is teamrun.ts.
 */
import { Buff, Loadout, EchoLoadout, Weapon, baseSequence } from "./engine/gear.js";
import { Tier } from "./engine/stats.js";
import type { Matrix } from "./engine/gear.js";
import { runTeam, scoreOf } from "./teamrun.js";
import type { TeamRun, RowScore } from "./teamrun.js";
import { teamAt } from "./teams.js";

export interface Member {
  name: string;
  color: string;
  loadout: Loadout;
  /** This team's main DPS — per team (teams.ts's `TeamEntry.mdps`), never stamped on the shared Loadout. */
  mainDps: boolean;
}

export const member = (loadout: Loadout, mainDps = false): Member =>
  ({ name: loadout.resonator.name, color: loadout.resonator.color, loadout, mainDps });

/** `matrix` is the piece worn: the loadout's Matrix under Matrix Mode, else null. */
export interface Combo { weapon: Weapon; echo: EchoLoadout; mainstat: Buff; sequence: number; matrix: Matrix | null; highSubs: boolean; key: string; }

/** The axes a resonator's rows can be opened up on. */
export type Axis = "weapons" | "echoes" | "mainstats" | "substats" | "sequences" | "refines";
// the order every compare list is written and read in, and the order the table's own menus offer
// them — the substat spread last, being the one axis that is a whole build's investment rather
// than a pick (the columns order it their own way, see table.ts's own `GEAR_AXES`)
export const AXES: Axis[] = ["weapons", "echoes", "mainstats", "sequences", "refines", "substats"];

/** Team Cost: no signatures (`s0r0`), one R1 signature to whoever gains most (`s0r1mdps`), or
 *  every limited resonator on theirs (every other mode). The `sN`/`rN` in the name is the chain
 *  level and weapon rank on top of that — the team's main DPS's alone where the name ends in
 *  `mdps`, everyone's where it doesn't. Rovers and 4* are S6 on standard/4* weapons throughout. */
export type TeamCost = "s0r0" | "s0r1mdps" | "s0r1"
  | "s1r1mdps" | "s2r1mdps" | "s3r1mdps" | "s6r1mdps" | "s6r5mdps" | "s6r5";

export interface Filters {
  matrix: boolean;
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

/** The page's opening state and what precompute.ts solves under — one definition so shipped keys match. */
export const defaultFilters = (): Filters => ({
  matrix: false, cost: "s0r1", weapons: [], echoes: [], mainstats: [], substats: [], sequences: [], refines: [], scoped: [],
});

export const axisOpen = (m: Member, filters: Filters, axis: Axis): boolean =>
  filters[axis].includes(m.loadout.resonator.name);

export const filterSignature = (f: Filters): string =>
  [f.matrix, f.cost, ...AXES.map((a) => [...f[a]].sort().join("+")), f.scoped.map(scopedKey).sort().join("+")].join(",");

/** A solve's cache key: the team under everything that changes its row set — matrix, cost, each
 *  member's six axis bits plus their scoped compares. */
export const bestKey = (teamKey: string, members: Member[], filters: Filters): string => {
  const matrix = filters.matrix && members.some((m) => m.loadout.resonator.matrix);
  const scoped = (m: Member): string => {
    const own = filters.scoped.filter((s) => s.resonator === m.loadout.resonator.name).map((s) => `${s.on}~${s.value}~${s.axis}`).sort();
    return own.length ? `:${own.join(";")}` : "";
  };
  return `${teamKey}|${matrix}|${filters.cost}|${members.map((m) => AXES.map((a) => (axisOpen(m, filters, a) ? "1" : "0")).join("") + scoped(m)).join(",")}`;
};

/** The best build's key: only what the *search* reads (weapons compared, matrix, cost) — every other
 *  axis changes which rows open, never which build wins. */
export const picksKey = (teamKey: string, members: Member[], filters: Filters): string => {
  const matrix = filters.matrix && members.some((m) => m.loadout.resonator.matrix);
  return `${teamKey}|${matrix}|${filters.cost}|${members.map((m) => (axisOpen(m, filters, "weapons") ? "1" : "0")).join("")}`;
};

/** Indices into a loadout's gear lists plus chain level, rank (into `Loadout.refinements[weapon]`),
 *  matrix and substat spread. Only weapon/echo/mainstat are ever searched. */
export interface Pick { weapon: number; echo: number; mainstat: number; sequence: number; refine: number; matrix: boolean; highSubs: boolean; }

export const comboOf = (l: Loadout, p: Pick): Combo => {
  const matrix = p.matrix && l.resonator.matrix ? l.resonator.matrix : null;
  return {
    weapon: l.refinements[p.weapon]![p.refine]!, echo: l.echoLoadouts[p.echo]!, mainstat: l.mainstats[p.mainstat]!,
    sequence: p.sequence, matrix, highSubs: p.highSubs,
    key: `${p.weapon}.${p.echo}.${p.mainstat}.s${p.sequence}.r${p.refine}${matrix ? ".m" : ""}${p.highSubs ? ".h" : ""}`,
  };
};

/** What a cost hands out on top of its signatures, read straight off the mode's name: the chain
 *  level, and the weapon rank as an index into a `Loadout.refinements` list. `holds` is whether
 *  this member is the one getting it — a mode ending in `mdps` lifts exactly one, whichever the
 *  team gains most from (`optimizeTeam` hands it out the way it hands out the one signature). */
const costGrant = (cost: TeamCost, holds: boolean): { sequence: number; refine: number } => {
  const [, sequence, rank, mdps] = /^s(\d)r(\d)(mdps)?$/.exec(cost)!;
  return mdps && !holds ? { sequence: 0, refine: 0 } : { sequence: +sequence!, refine: Math.max(0, +rank! - 1) };
};

/** Whether the grant goes to one member the search picks rather than to the whole team. */
export const grantToOne = (cost: TeamCost): boolean => cost.endsWith("mdps");

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

/** The extra rank an open Sequences box runs its top chain level at — the S6R5 row that stands
 *  beside S6R1 as a level of its own, the S7 the chain hasn't got. Null where there is none: a
 *  weapon listing one rank, a kit with no chain, or a rank column on screen (`axisUsed`), where S6
 *  at R5 is just a cell of the cross and says so on its own. */
export function topRank(m: Member, filters: Filters, weapon: number): number | null {
  if (m.loadout.refinements[weapon]!.length < 2 || !m.loadout.sequences.length) return null;
  if (!axisOpen(m, filters, "sequences") || axisUsed(m, filters, "refines")) return null;
  return m.loadout.refinements[weapon]!.length - 1;
}

/** Ranks a row at `p` runs its weapon at: every listed rank while refines are compared there, else
 *  the build's own — joined, on the top level of an open Sequences box, by `topRank()`. An open box
 *  runs its whole ladder at R1 whatever the cost hands out, so the levels read against each other
 *  and the rank the cost paid for is the max-rank row on top. */
export function refineLevels(m: Member, filters: Filters, p: Pick): number[] {
  const ranks = m.loadout.refinements[p.weapon]!;
  if (compares(m, filters, "refines", gateOf(m.loadout, p))) return ranks.map((_, i) => i);
  const home = axisOpen(m, filters, "sequences") ? 0 : Math.min(p.refine, ranks.length - 1);
  const extra = p.sequence === m.loadout.sequences.length ? topRank(m, filters, p.weapon) : null;
  return extra === null ? [home] : [home, extra];
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

/** Trial runs memoized per team (reset by `solveTeam`): the sweeps re-score the same combos over
 *  and over, and a `TeamRun` holds a whole State, so nothing is kept across teams. */
let trialCache = new Map<string, TeamRun>();
/** `scoreMainstats()` answers, keyed the same plus which members were scored. */
let scoreCache = new Map<string, Map<number, TeamRun[]>>();

const trialKey = (teamKey: string, combo: Combo[]): string => `${teamKey}-${combo.map((c) => c.key).join("-")}`;

function trialRun(teamKey: string, members: Member[], picks: Pick[]): TeamRun {
  const combo = members.map((m, i) => comboOf(m.loadout, picks[i]!));
  const key = trialKey(teamKey, combo);
  let hit = trialCache.get(key);
  if (!hit) trialCache.set(key, hit = runTeam(teamKey, members, combo));
  return hit;
}

/**
 * Every main stat of each member in `who` scored in one run: the build as picked runs for real and
 * the other main stats ride along as engine variants (a main stat only feeds its wearer). A variant
 * the engine can't vouch for (`unsafe`) is scored with a real run instead.
 * @returns per member in `who`, a `TeamRun` per main-stat index
 */
function scoreMainstats(teamKey: string, members: Member[], picks: Pick[], who: number[]): Map<number, TeamRun[]> {
  const combo = members.map((m, i) => comboOf(m.loadout, picks[i]!));
  const key = `${trialKey(teamKey, combo)}|${who.join(",")}`;
  let out = scoreCache.get(key);
  if (!out) scoreCache.set(key, out = scoreMainstatsRun(teamKey, members, picks, who, combo));
  return out;
}

function scoreMainstatsRun(teamKey: string, members: Member[], picks: Pick[], who: number[], combo: Combo[]): Map<number, TeamRun[]> {
  const alts = members.map((m, i) => (who.includes(i)
    ? m.loadout.mainstats.map((_, k) => k).filter((k) => k !== picks[i]!.mainstat) : null));
  const run = runTeam(teamKey, members, combo, false, alts.map((a, i) => a && a.map((k) => members[i]!.loadout.mainstats[k]!)));
  trialCache.set(trialKey(teamKey, combo), run);
  const out = new Map<number, TeamRun[]>();
  for (const i of who) {
    const scores: TeamRun[] = [];
    scores[picks[i]!.mainstat] = run;
    alts[i]!.forEach((k, v) => {
      const trial = picks.map((p, j) => (j === i ? { ...p, mainstat: k } : p));
      const variant = run.variantRuns[i]![v]!;
      if (variant.unsafe) { scores[k] = trialRun(teamKey, members, trial); return; }
      const c = members.map((m, j) => comboOf(m.loadout, trial[j]!));
      const scored: TeamRun = {
        state: run.state, teamKey, members, combo: c, rotationLines: null, variantRuns: [],
        total: variant.total, bySlot: variant.bySlot, sectionTotals: variant.sectionTotals, sectionBySlot: variant.sectionBySlot,
      };
      trialCache.set(trialKey(teamKey, c), scored);
      scores[k] = scored;
    });
    out.set(i, scores);
  }
  return out;
}

/** Member `i`'s main stats ranked by their own damage out of `bySlot`, best first. */
function rankedMainstats(scores: TeamRun[], m: Member): { mainstat: number; damage: number; total: number }[] {
  const ranked: { mainstat: number; damage: number; total: number }[] = [];
  scores.forEach((run, k) => ranked.push({ mainstat: k, damage: run.bySlot.get(m.name) ?? 0, total: run.total }));
  return ranked.sort((a, b) => b.damage - a.damage);
}

/** Each of `who`'s best main stat under `picks`, everyone else's as given — one run for the set. */
function bestMainstats(teamKey: string, members: Member[], picks: Pick[], who: number[]): Pick[] {
  const scores = scoreMainstats(teamKey, members, picks, who);
  return picks.map((p, i) => {
    if (!who.includes(i)) return p;
    const index = rankedMainstats(scores.get(i)!, members[i]!)[0]?.mainstat ?? p.mainstat;
    return index === p.mainstat ? p : { ...p, mainstat: index };
  });
}

/** One member's best main stat under one build, and the team total of that run — nobody else's
 *  damage moves with it, so that run is also the team's best under this build. */
function bestMainstatFor(teamKey: string, members: Member[], picks: Pick[], i: number): { mainstat: number; total: number } {
  const best = rankedMainstats(scoreMainstats(teamKey, members, picks, [i]).get(i)!, members[i]!)[0];
  return best ? { mainstat: best.mainstat, total: best.total } : { mainstat: picks[i]!.mainstat, total: 0 };
}

/**
 * Main stats are searched for every member at once (they only feed their wearer); weapons and
 * echoes cross members (Outro buffs), so they get coordinate descent scored on the team total, with
 * every candidate re-rolled onto its own best main stat before it's judged. A chain level is never
 * searched for its own sake — a node is strictly more kit — but a cost that pays for one member's
 * is, since which member that is decides the team's damage. The sweeps alternate until nothing
 * moves, three rounds at most.
 */
export function optimizeTeam(teamKey: string, members: Member[], filters: Filters): Pick[] {
  // `s0r1mdps` searches on standards and hands the one signature out afterwards; a `mdps` chain or
  // rank grant is handed out the same way, so the search opens with nobody holding it
  const sig = sigForAll(filters.cost);
  const holds = !grantToOne(filters.cost);
  const picks: Pick[] = members.map((m) => {
    const weapon = weaponOptions(m, filters, sig)[0] ?? 0;
    return {
      weapon, echo: 0, mainstat: 0, sequence: sequenceLevels(m, filters, holds)[0]!,
      refine: costRefine(m, weapon, filters.cost, holds), matrix: filters.matrix, highSubs: false,
    };
  });
  const run = (): TeamRun => trialRun(teamKey, members, picks);

  const sweepMainstats = (): boolean => {
    const next = bestMainstats(teamKey, members, picks, members.map((_, i) => i));
    const changed = next.some((p, i) => p.mainstat !== picks[i]!.mainstat);
    next.forEach((p, i) => { picks[i] = p; });
    return changed;
  };

  const sweepAcross = (axis: "weapon" | "echo", options: (m: Member) => number[]): boolean => {
    let changed = false;
    let best = run().total;
    for (let i = 0; i < members.length; i++) {
      const home = picks[i]!;
      let winner = home;
      for (const option of options(members[i]!)) {
        if (option === home[axis]) continue;
        // a weapon carries its own rank list, so the rank this member runs is capped to each one
        const at = axis === "weapon"
          ? { ...home, weapon: option, refine: Math.min(home.refine, members[i]!.loadout.refinements[option]!.length - 1) }
          : { ...home, echo: option };
        const rerolled = bestMainstatFor(teamKey, members, picks.map((p, j) => (j === i ? at : p)), i);
        picks[i] = { ...at, mainstat: rerolled.mainstat };
        if (rerolled.total > best) { best = rerolled.total; winner = picks[i]!; changed = true; }
      }
      picks[i] = winner;
    }
    return changed;
  };

  // until a whole round of cross-member sweeps moves nothing: a member swept early in a round was
  // judged against teammates who then changed, so an unchanged main-stat pass is not convergence
  const converge = (weapons: boolean): void => {
    for (let round = 0; round < 8; round++) {
      const w = weapons && sweepAcross("weapon", (m) => weaponOptions(m, filters, sig));
      const e = sweepAcross("echo", (m) => m.loadout.echoLoadouts.map((_, i) => i));
      if (!w && !e) break;
      sweepMainstats();
    }
  };
  sweepMainstats();
  converge(true);
  if (filters.cost === "s0r1mdps") {
    let best = run().total, winner: Pick[] | null = null;
    members.forEach((m, i) => {
      if (!isSignature(m.loadout, 0)) return;
      const trial = picks.map((p, j) => (j === i ? { ...p, weapon: 0, refine: Math.min(p.refine, m.loadout.refinements[0]!.length - 1) } : p));
      const rerolled = bestMainstatFor(teamKey, members, trial, i);
      if (rerolled.total > best) { best = rerolled.total; winner = trial.map((p, j) => (j === i ? { ...p, mainstat: rerolled.mainstat } : p)); }
    });
    if (winner) {
      (winner as Pick[]).forEach((p, i) => { picks[i] = p; });
      sweepMainstats();
      // the signature changes what the sonatas are worth; weapons stay as handed out
      converge(false);
    }
  }
  // the chain/rank grant goes to one member too: lift each in turn and keep whoever the team gains
  // most from. Their own weapon is re-swept after — a rank the grant paid for can be worth more on
  // a weapon the R1 sweep passed over. `s0r1mdps` lifts nobody, so its loop finds nothing to try.
  if (grantToOne(filters.cost)) {
    let best = run().total, winner: Pick[] | null = null;
    members.forEach((m, i) => {
      const home = picks[i]!;
      const level = costLevel(m, filters.cost, true);
      const lifted = {
        ...home, sequence: level === null ? home.sequence : Math.max(level, home.sequence),
        refine: costRefine(m, home.weapon, filters.cost, true),
      };
      if (lifted.sequence === home.sequence && lifted.refine === home.refine) return;
      const trial = picks.map((p, j) => (j === i ? lifted : p));
      const rerolled = bestMainstatFor(teamKey, members, trial, i);
      if (rerolled.total > best) { best = rerolled.total; winner = trial.map((p, j) => (j === i ? { ...lifted, mainstat: rerolled.mainstat } : p)); }
    });
    if (winner) {
      (winner as Pick[]).forEach((p, i) => { picks[i] = p; });
      sweepMainstats();
      converge(true);
    }
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

/** Main-stat rows an open box shows per build — the best few, not the whole list. */
export const MAINSTAT_ROWS = 9;

/** One member's weapon/sequence/refine/echo/substat picks to cross into the team-wide product:
 *  every option on an open axis, the home pick on a closed one. Main stats are picked per build. */
function buildsOf(m: Member, home: Pick, f: Filters, sig: boolean): Pick[] {
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
    const echoes = compares(m, f, "echoes", gateOf(l, at)) ? l.echoLoadouts.map((_, i) => i) : [home.echo];
    for (const refine of refineLevels(m, f, at)) for (const echo of echoes) for (const highSubs of subs) {
      picks.push({ ...at, refine, echo, highSubs });
    }
  }
  return picks;
}

/**
 * Every row the table shows for this team: the cross of each member's candidates, then per build
 * a closed echo box re-searched (`pinEchoes`) and closed main stats settled — a worse weapon judged
 * in the winner's rolls reads worse than it is. Open main stats get the build's best `MAINSTAT_ROWS`.
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
    // with a compare open somewhere every closed member is re-rolled per trial (hidden rows are
    // then compare baselines); otherwise only the wearer, a third the cost
    const reroll = (trial: Pick[], i: number): { picks: Pick[]; total: number } => {
      if (!compared) {
        const one = bestMainstatFor(teamKey, members, trial, i);
        return { picks: trial.map((p, j) => (j === i ? { ...p, mainstat: one.mainstat } : p)), total: one.total };
      }
      const rolled = bestMainstats(teamKey, members, trial, members.map((_, k) => k).filter((k) => !mainstatsOpen(trial).includes(k)));
      return { picks: rolled, total: trialRun(teamKey, members, rolled).total };
    };
    for (const i of closedEchoes) {
      if (members[i]!.loadout.echoLoadouts.length < 2) continue;
      const home = out[i]!;
      const incumbent = reroll(out, i);
      let winner = home;
      let bestTotal = incumbent.total;
      members[i]!.loadout.echoLoadouts.forEach((_, echo) => {
        if (echo === home.echo) return;
        const trial = reroll(out.map((p, j) => (j === i ? { ...home, echo } : p)), i);
        hidden.push(trial.picks);
        if (trial.total > bestTotal) { bestTotal = trial.total; winner = trial.picks[i]!; }
      });
      hidden.push(incumbent.picks);
      out = out.map((p, j) => (j === i ? winner : p));
    }
    return out;
  };

  const holder = sigHolder(members, best);
  const builds = cartesian(members.map((m, i) => buildsOf(m, best[i]!, filters, sigAllowed(i, holder, filters.cost))));
  const seen = new Map<string, Pick[]>();
  for (const picks of builds) {
    const key = picks.map((p) => `${p.weapon}.${p.echo}.s${p.sequence}.r${p.refine}${p.highSubs ? ".h" : ""}`).join("-");
    if (!seen.has(key)) seen.set(key, picks);
  }

  // with nothing compared the hidden rows are never read, and the one build is the search's own
  // converged answer: re-searching its sonatas would only repeat the sweep that just settled it
  const isBest = (build: Pick[]): boolean => build.every((p, i) => {
    const b = best[i]!;
    return p.weapon === b.weapon && p.echo === b.echo && p.sequence === b.sequence && p.refine === b.refine && p.highSubs === b.highSubs;
  });
  const rows: Pick[][] = [];
  let built = 0;
  for (const build of seen.values()) {
    onProgress?.(built++ / seen.size);
    const settled = settle(!compared && isBest(build) ? build : pinEchoes(build));
    const open = mainstatsOpen(settled);
    if (!open.length) { rows.push(settled); continue; }
    const scores = scoreMainstats(teamKey, members, settled, open);
    const top = new Map<number, number[]>();
    for (const i of open) {
      top.set(i, rankedMainstats(scores.get(i)!, members[i]!).slice(0, MAINSTAT_ROWS).map((r) => r.mainstat));
    }
    for (const mainstats of cartesian(members.map((_, i) => top.get(i) ?? [settled[i]!.mainstat]))) {
      rows.push(settled.map((p, i) => ({ ...p, mainstat: mainstats[i]! })));
    }
  }
  return { rows, hidden };
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
  trialCache = new Map(); scoreCache = new Map();
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
  trialCache = new Map(); scoreCache = new Map();
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

/** A roster's solves at rest (localStorage, tests/solves/*.json). A `stamp` that doesn't match the running build means nothing in it is used. */
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
