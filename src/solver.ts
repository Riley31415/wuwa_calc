/**
 * The build search, and the engine run it scores with — everything needed to decide what a team's
 * best build *is*, with no DOM anywhere in it.
 *
 * Split out of index.ts for one reason: this is the expensive half of a cold load (~97% of it),
 * every team is independent of every other, and a Worker can only import a module that never
 * touches `document`. index.ts keeps the table, the routing and the rendering; a pool of workers
 * runs `solveTeam()` over the roster in parallel (see worker.ts and index.ts's own
 * `ensureBestPicks()`), falling back to calling it directly where Workers aren't available.
 *
 * `filters` is a parameter here rather than the module-level object it read when this lived in
 * index.ts: a worker has its own copy of this module and no way to see the page's state, so the
 * flags travel with the request.
 *
 * Nothing here yields. It used to `await breathe()` between trials so the main thread could
 * repaint the progress bar mid-team; with the work off-thread there is nothing to repaint around,
 * and the fallback path yields between whole teams instead — ~25ms apiece, fine for a bar.
 */
import { State, run, withTeam, equip, setTracing, Buff, Loadout, EchoLoadout, Weapon } from "./kit.js";
import type { Action, ChainGroup, ResolvedSnapshot } from "./kit.js";
import { damage, mvPercent } from "./damage.js";
// imported for its own side effect: tunebreak.ts registers the Tune Break resolver with the
// engine on load, and this is the one file every path that runs a team goes through
import "./tunebreak.js";
import type { Report } from "./display.js";
import { LOADOUTS } from "./loadouts.js";
import type { LoadoutName } from "./loadouts.js";

export interface Member {
  name: string;
  color: string;
  loadout: Loadout;
}

/** name/color both come straight off the loadout's own resonator — nothing here retypes them, and
 *  nothing here needs its own import of the resonator itself, just its loadout. Opener/loop
 *  rotation and weapon/echo choice all live on the loadout itself too (kit.ts's own `Loadout`) —
 *  see `combosFor()`/`runTeam()` below for how a team is actually assembled and run. */
export const member = (loadout: Loadout): Member =>
  ({ name: loadout.resonator.name, color: loadout.resonator.color, loadout });


export interface Combo { weapon: Weapon; echo: EchoLoadout; mainstat: Buff; sequence: number; key: string; }

/** The comparison table's own filter state — every axis a member's build varies on (weapon, echo,
 *  main stats, sequence level), split by role, plus the two R1 allowances. This decides which
 *  rows *exist*, not just which are visible: an axis whose box is off contributes only that
 *  member's own best pick on it (see `optimizeTeam()`), so nothing off-screen is ever built into
 *  a row. Ticking a box opens that axis and the rows it reaches are run then, once, and cached
 *  (see `refresh()`/`expandTeam()`).
 *
 *  Held here rather than read off the DOM because the checkboxes live inside the table's own
 *  markup, which `renderComparison()` rebuilds from scratch — this survives that, the inputs
 *  don't. */
export interface Filters {
  mdpsSequences: boolean; supportSequences: boolean;
  mdpsWeapons: boolean; supportWeapons: boolean;
  mdpsEchoes: boolean; supportEchoes: boolean;
  mdpsMainstats: boolean; supportMainstats: boolean;
  allowR1Mdps: boolean; allowR1Supports: boolean;
}

/** One member's own pick: indices into their loadout's three gear lists, plus how many resonance
 *  chain nodes are held. What `optimizeTeam()` searches over and `comboOf()` turns into real gear
 *  — except `sequence`, which is never searched (see `sequenceLevels()`). */
export interface Pick { weapon: number; echo: number; mainstat: number; sequence: number; }

export const comboOf = (l: Loadout, p: Pick): Combo => ({
  weapon: l.weapons[p.weapon]!, echo: l.echoLoadouts[p.echo]!, mainstat: l.mainstats[p.mainstat]!,
  sequence: p.sequence, key: `${p.weapon}.${p.echo}.${p.mainstat}.s${p.sequence}`,
});

/** Which sequence levels a member's own rows cover. Nothing here is optimized — a chain node is
 *  never a trade-off, it's strictly more kit — so for a limited resonator with that role's
 *  Sequences box open, every level the loadout can reach gets a row of its own, S0 through S6,
 *  purely so the gain from each is readable; with the box closed, S0 alone. A `standardCharacter`
 *  is the exception at both ends: their chain comes with the character, so they're only ever run
 *  (and only ever costed) at full. A loadout that declares no nodes has only S0 regardless. */
export function sequenceLevels(l: Loadout, filters: Filters): number[] {
  const max = l.sequences().length;
  if (!max) return [0];
  // a standard character's chain comes with the character rather than being pulled for, so there's
  // no partial level worth comparing — they only ever run at full, box or no box
  if (l.resonator.standardCharacter) return [max];
  return (l.mainDps ? filters.mdpsSequences : filters.supportSequences)
    ? Array.from({ length: max + 1 }, (_, i) => i)
    : [0];
}

/** Which of a loadout's own weapons this role may actually run right now — everything when its R1
 *  allowance is on, standard weapons only when it isn't (weapons/standard.ts, every generation —
 *  see kit.ts's own `Weapon.standard`). A signature is only ever owned at R1, so a role that
 *  hasn't been given that allowance never even simulates one. Empty means the whole team drops
 *  out of the table, same as it always has. */
export function eligibleWeapons(l: Loadout, filters: Filters): number[] {
  const allowR1 = l.mainDps ? filters.allowR1Mdps : filters.allowR1Supports;
  return l.weapons.map((_, i) => i).filter((i) => allowR1 || l.weapons[i]!.standard);
}

/**
 * Every team's own best build per member, found once and cached — this is what an axis whose
 * "Show ... Options" box is *closed* collapses to, so a closed axis shows the best pick rather
 * than whatever happened to be listed first.
 *
 * Weapons, echoes and main stats are all searched in full for every member, whatever the boxes
 * say — weapons only among the picks that role may actually hold, so a signature stays out of the
 * search entirely until its R1 allowance is given. Sequences are not searched: a chain node is
 * never a trade-off against anything, so every level simply gets a row of its own (see
 * `sequenceLevels()`), and the search runs at whichever level a closed box would show.
 *
 * The two axes are searched differently, because they behave differently:
 *
 * - **Main stats only ever feed their own wearer.** No kit buffs a teammate off a main stat (a
 *   team buff that keys off the granter's own stats is modelled at its cap — see CLAUDE.md), so
 *   one member's roll can't move another member's damage, and the best roll for each member is
 *   the same whoever else is wearing what. That makes the whole team searchable *at once*: every
 *   member cycles through their own list in the same runs, and each is scored on their own damage
 *   out of `bySlot` rather than the team total. A team costs `max` of its members' own option
 *   counts — 51 runs for a Jingran team, where one-at-a-time would be 69 and the full cross
 *   product 4,131.
 * - **Weapons and echoes do cross members** — half the sonatas, and a good few weapons, hand the
 *   next resonator a buff on Outro — so they get coordinate descent instead: one member's list at
 *   a time, the rest of the team held still, scored on the team total.
 *
 * All three interact (an ER weapon, an ER sonata and an ER main stat all trade off), so every
 * weapon and echo candidate is re-rolled onto its own best main stat before it's scored, and the
 * two sweeps alternate until neither moves, three rounds at most. That re-roll is what the whole
 * search hangs on: judged in the incumbent's rolls, a weapon that wants a different build reads as
 * worse than it is and never gets picked. Cached per team under the two R1 allowances, since those decide
 * which weapon the rest of the build is measured against.
 */
/**
 * One team's own trial runs, memoized for the length of that team's optimization pass.
 *
 * A trial is a pure function of the picks it runs — same loadouts, same rotations, same numbers
 * (see `detailFor()`) — and this pass asks for the same combos over and over: every `sweepAcross`
 * opens by scoring whatever the previous sweep settled on, every option it rejects puts the
 * incumbent back before the next is tried, and each of `fillVariations()`'s own per-variation
 * main-stat sweeps passes back through the build the variation was measured against. Keyed by the
 * same combo string a row is named after, so a repeat costs a Map lookup instead of a rotation:
 * about one run in eight with every options box closed, one in six with the echo boxes open.
 *
 * Reset per team by `ensureBestPicks()` rather than kept for the whole table — a `TeamRun` holds a
 * whole `State`, and there is nothing to gain across teams anyway (a run is only ever comparable
 * within the team it was run for).
 */
let trialCache = new Map<string, TeamRun>();

function trialRun(teamKey: string, members: Member[], picks: Pick[]): TeamRun {
  const combo = members.map((m, i) => comboOf(m.loadout, picks[i]!));
  // team-scoped as well as combo-scoped: the reset below is per team, but the same combo string
  // means different loadouts under a different team, so keying on it alone would be a footgun for
  // any future caller that forgets to clear
  const key = `${teamKey}-${combo.map((c) => c.key).join("-")}`;
  let hit = trialCache.get(key);
  if (!hit) trialCache.set(key, hit = runTeam(teamKey, members, combo));
  return hit;
}

/**
 * The best main stat for one member under one specific build of theirs — the rest of `picks` is
 * left exactly as given, and the score is that member's own damage out of `bySlot` rather than the
 * team total, which is what makes this answer independent of everyone else (see `optimizeTeam()`).
 *
 * Hands back the team total of the winning run too. Nobody else's damage moves with this member's
 * main stat, so the run that maximises their own damage is the same run that maximises the team's
 * — which lets a caller comparing whole builds score one without running it a second time.
 */
function bestMainstatFor(
  teamKey: string, members: Member[], picks: Pick[], i: number,
): { mainstat: number; total: number } {
  const l = members[i]!.loadout;
  let winner = picks[i]!.mainstat;
  let best = -Infinity;
  let total = 0;
  for (let m = 0; m < l.mainstats.length; m++) {
    const trial = picks.map((p, j) => (j === i ? { ...p, mainstat: m } : p));
    const run = trialRun(teamKey, members, trial);
    const damage = run.bySlot.get(members[i]!.name) ?? 0;
    if (damage > best) { best = damage; winner = m; total = run.total; }
  }
  return { mainstat: winner, total };
}

export function optimizeTeam(teamKey: string, members: Member[], filters: Filters): Pick[] {
  const picks: Pick[] = members.map((m) => ({
    weapon: eligibleWeapons(m.loadout, filters)[0] ?? 0, echo: 0, mainstat: 0,
    // the level a closed box would show — the search never varies it, the row set does
    sequence: sequenceLevels(m.loadout, filters)[0]!,
  }));
  const run = (): TeamRun => trialRun(teamKey, members, picks);

  /** Every member's own main stats at once — see this function's own header on why that's sound. */
  const sweepMainstats = (): boolean => {
    const best = members.map((m, i) => ({ index: picks[i]!.mainstat, damage: -Infinity, count: m.loadout.mainstats.length }));
    const rounds = Math.max(...best.map((b) => b.count));
    for (let r = 0; r < rounds; r++) {
      // a member whose list is shorter than the longest just re-runs its own last entry
      members.forEach((m, i) => { picks[i] = { ...picks[i]!, mainstat: Math.min(r, best[i]!.count - 1) }; });
      const { bySlot } = run();
      members.forEach((m, i) => {
        const damage = bySlot.get(m.name) ?? 0;
        if (damage > best[i]!.damage) { best[i]!.damage = damage; best[i]!.index = picks[i]!.mainstat; }
      });
    }
    let changed = false;
    members.forEach((m, i) => {
      if (picks[i]!.mainstat !== best[i]!.index) changed = true;
      picks[i] = { ...picks[i]!, mainstat: best[i]!.index };
    });
    return changed;
  };

  /** One member's own list at a time on a cross-member axis, the rest of the team held still,
   *  scored on the team total — `options` is that member's own candidates, `axis` which field of
   *  their `Pick` each one sets. */
  const sweepAcross = (axis: "weapon" | "echo", options: (l: Loadout) => number[]): boolean => {
    let changed = false;
    let best = run().total;
    for (let i = 0; i < members.length; i++) {
      const home = picks[i]!;
      let winner = home;
      for (const option of options(members[i]!.loadout)) {
        if (option === home[axis]) continue; // already scored, it's the incumbent
        // An option is only worth what it's worth *at its own best main stat* — an ER weapon and
        // an ER roll trade off, an HP sonata moves what an HP scaler wants — so each candidate is
        // re-rolled before it's judged. Scoring them all in the incumbent's rolls measures every
        // alternative in gear picked for something else, and picks the wrong one.
        const rerolled = bestMainstatFor(teamKey, members, picks.map((p, j) => (j === i ? { ...home, [axis]: option } : p)), i);
        picks[i] = { ...home, [axis]: option, mainstat: rerolled.mainstat };
        if (rerolled.total > best) { best = rerolled.total; winner = picks[i]!; changed = true; }
      }
      picks[i] = winner;
    }
    return changed;
  };

  // One cheap simultaneous main-stat pass to start every member off somewhere sane, then the two
  // cross-member axes — which re-roll as they go, so there's no trailing main-stat pass to run:
  // whatever weapon and echo a member ends on, they're already wearing that build's own best.
  sweepMainstats();
  for (let round = 0; round < 3; round++) {
    const weapons = sweepAcross("weapon", (l) => eligibleWeapons(l, filters));
    const echoes = sweepAcross("echo", (l) => l.echoLoadouts.map((_, i) => i));
    if (!weapons && !echoes) break;
  }
  return picks;
}

/** One alternative a member could be shown on: which of them, on which axis. `mainstat` and
 *  `sequence` rows carry no re-optimization of their own, so only the two gear axes are listed. */
export interface Variation { member: number; axis: "weapon" | "echo"; option: number }

/**
 * Every weapon/echo alternative the current filters will put on a row of its own. A member's own
 * best main stat is not the same under every weapon — an ER weapon and an ER roll trade off, an HP
 * weapon shifts what an HP scaler wants — so each of these gets its main stat re-optimized rather
 * than inheriting the one that won for the *best* weapon, which would show every alternative
 * wearing gear chosen for something else and read as worse than it is.
 */
export function variationsOf(members: Member[], best: Pick[], filters: Filters): Variation[] {
  const out: Variation[] = [];
  members.forEach((m, i) => {
    const l = m.loadout;
    const mdps = l.mainDps;
    if (mdps ? filters.mdpsWeapons : filters.supportWeapons) {
      for (const option of eligibleWeapons(l, filters)) if (option !== best[i]!.weapon) out.push({ member: i, axis: "weapon", option });
    }
    if (mdps ? filters.mdpsEchoes : filters.supportEchoes) {
      l.echoLoadouts.forEach((_, option) => { if (option !== best[i]!.echo) out.push({ member: i, axis: "echo", option }); });
    }
  });
  return out;
}


export interface TeamRun {
  state: State;
  /** Which team composition (`TEAMS` key) this combo belongs to — several `TeamRun`s share one
   *  `teamKey`, one per combo the current filters open for that team's own members. */
  teamKey: string;
  members: Member[];
  /** Which weapon/echo/main-stat combo each member above actually ran under — same order as
   *  `members`. */
  combo: Combo[];
  /** The 4 sections' own raw lines, in order [opener, loop 1, loop 2, loop 3] — everything the
   *  detail page is built from (`detailFor()`, the DPR table, the Energy Requirements table).
   *  `null` on a row the comparison table merely listed: nothing on that table reads a line any
   *  more, and retaining ~190 snapshots apiece across every weapon x echo x main-stat combo would
   *  dwarf everything else this page holds. `detailFor()` re-runs the one team that actually gets
   *  opened to fill this in. */
  rotationLines: ChainGroup[][] | null;
  /** The comparison table's own figures: the plain mean across all 4 sections' own grand total /
   *  per-member total, each section weighted equally — see `runTeam()`'s own comment. */
  total: number;
  bySlot: Map<string, number>;
  /** Each of the 4 sections' own raw grand total [opener, loop 1, loop 2, loop 3] — `total` above
   *  is their mean; read by the comparison table's own Team DPR hover breakdown. */
  sectionTotals: number[];
  /** The same four sections split per member — `bySlot` above is their mean, the way
   *  `sectionTotals` is `total`'s. Kept alongside rather than derived on demand because a
   *  comparison-table row drops its own `rotationLines` (see above), so there is nothing left to
   *  re-sum by the time a member's own Avg DPR cell is hovered. */
  sectionBySlot: Map<string, number>[];
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
    // `.slot`, not `.member`: they're the same for every ordinary action, but a tune break is
    // relabeled to its own bucket (kit.ts's own `TUNE_BREAK_SLOT`) so the team's shared bar going
    // off doesn't land on whichever resonator happened to be on field. display.ts's own
    // `totalsBySlot()` groups the detail page the same way.
    const slot = (line.snap as ResolvedSnapshot).slot;
    bySlot.set(slot, (bySlot.get(slot) ?? 0) + line.avg);
    total += line.avg;
  }
  return { total, bySlot };
}

/** @param trace  capture the report's own per-entry trace and keep the resolved lines — off for
 *  the comparison table's own bulk pass (see kit.ts's own `setTracing`), on for the single team
 *  whose detail page is being rendered. */
export function runTeam(teamKey: string, members: Member[], combo: Combo[], trace = false): TeamRun {
  setTracing(trace);
  try {
    return runTeamInner(teamKey, members, combo, trace);
  } finally {
    setTracing(false);
  }
}

function runTeamInner(teamKey: string, members: Member[], combo: Combo[], trace: boolean): TeamRun {
  const state = new State(members.map((m) => m.name));
  members.forEach((m, i) => {
    state.active = i;
    withTeam(state, () => { for (const g of m.loadout.pieces(combo[i]!.weapon, combo[i]!.echo, combo[i]!.mainstat, combo[i]!.sequence)) equip(g, 1); });
  });
  state.active = 0;

  // Every member's opener runs first, in team order, then every member's loop, three times over
  // — matching how a real run actually goes: the whole team gets set up before anyone starts
  // repeating, and a loop-only buff/gauge that hasn't settled by the first pass (still ramping
  // up, or handed off from the opener) gets the two more passes it needs to reach steady state.
  // Only the team's own leader (position 0) gets their loadout's own `opener` for that first
  // pass — everyone else's own `loop` already opens on their own Intro, same as before this was
  // auto-selected by position instead of hand-picked per team.
  const runPart = (rotation: Action[]): ChainGroup[] =>
    rotation.length ? run(state, rotation).map(toLine) : [];
  const rotationLines = [
    members.flatMap((m, i) => runPart(i === 0 ? m.loadout.opener : m.loadout.loop)),
    members.flatMap((m) => runPart(m.loadout.loop)),
    members.flatMap((m) => runPart(m.loadout.loop)),
    members.flatMap((m) => runPart(m.loadout.loop)),
  ];

  // The comparison table (not the detail page's own action table) only ever needs a grand total
  // and a per-member sum — the plain mean across these four sections rather than any one of them
  // alone, the opener counting exactly as much as a single loop pass. Read straight off the
  // resolved lines rather than through buildReport(), which also builds every row's own hover-
  // trace panel data purely for the detail page — the bulk of a team run's own cost, for data
  // this table never reads. See `detailFor()` below for where that actually gets built.
  let total = 0;
  const bySlot = new Map<string, number>();
  const sectionTotals: number[] = [];
  const sectionBySlot: Map<string, number>[] = [];
  for (const lines of rotationLines) {
    const section = sumSection(lines);
    sectionTotals.push(section.total);
    sectionBySlot.push(section.bySlot);
    total += section.total / rotationLines.length;
    for (const [slot, v] of section.bySlot) bySlot.set(slot, (bySlot.get(slot) ?? 0) + v / rotationLines.length);
  }

  return { state, teamKey, members, combo, rotationLines: trace ? rotationLines : null, total, bySlot, sectionTotals, sectionBySlot };
}


/** Resolve a team from the loadout names a worker was handed (see loadouts.ts) — a `Loadout` is
 *  closures all the way down, so it can't cross a postMessage; its name can. */
export const teamFromNames = (names: LoadoutName[]): Member[] =>
  names.map((n) => member(LOADOUTS[n]));

/** One variation's re-optimized main stat, carried back with the variation it belongs to so the
 *  main thread can key it into its own `variantMainstats` cache. */
export interface SolvedVariation { member: number; axis: "weapon" | "echo"; option: number; mainstat: number }

/** One team's whole optimization pass — the unit of parallel work, and both halves of what
 *  `ensureBestPicks()` used to do inline: the best build per member, and the re-optimized main
 *  stat for every alternative the open filter boxes will put on a row of its own. */
export function solveTeam(teamKey: string, members: Member[], filters: Filters): { picks: Pick[]; variants: SolvedVariation[] } {
  trialCache = new Map();
  const picks = optimizeTeam(teamKey, members, filters);
  const variants = variationsOf(members, picks, filters).map((v) => ({
    ...v,
    mainstat: bestMainstatFor(
      teamKey, members, picks.map((p, j) => (j === v.member ? { ...p, [v.axis]: v.option } : p)), v.member,
    ).mainstat,
  }));
  trialCache = new Map();   // a TeamRun holds a whole State; don't keep 80 of them alive
  return { picks, variants };
}

/* ------------------------------------------------------------------ worker protocol */

/** One team handed to a worker. Members travel as loadout *names* (see `teamFromNames()`), and the
 *  filter flags travel with them since a worker can't see the page's own state. */
export interface SolveRequest { id: number; teamKey: string; loadouts: LoadoutName[]; filters: Filters }

/** What comes back — small, plain data: gear *indices* and main-stat indices, nothing engine-shaped.
 *  The main thread turns these back into real gear with `comboOf()` and runs the handful of rows the
 *  table actually shows itself. */
export interface SolveResponse { id: number; picks: Pick[]; variants: SolvedVariation[] }
