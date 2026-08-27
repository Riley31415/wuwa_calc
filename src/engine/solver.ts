/**
 * The build search, and the engine run it scores with — everything needed to decide what a team's
 * best build *is*, with no DOM anywhere in it.
 *
 * Split out of index.ts for one reason: this is the expensive half of a cold load (~97% of it),
 * every team is independent of every other, and a Worker can only import a module that never
 * touches `document`. index.ts keeps the table, the routing and the rendering; a pool of workers
 * runs `solveTeam()` over the roster in parallel (see index.ts's own `ensureBestPicks()`),
 * falling back to calling it directly where Workers aren't available. This file is the worker's
 * own entry point as well as the module the main thread imports — see its foot.
 *
 * `filters` is a parameter here rather than the module-level object it read when this lived in
 * index.ts: a worker has its own copy of this module and no way to see the page's state, so the
 * flags travel with the request.
 *
 * Nothing here yields. It used to `await breathe()` between trials so the main thread could
 * repaint the progress bar mid-team; with the work off-thread there is nothing to repaint around,
 * and the fallback path yields between whole teams instead — ~25ms apiece, fine for a bar.
 */
import { State, withTeam, equip, setTracing, Buff, Loadout, EchoLoadout, Weapon } from "./kit.js";
import type { ChainGroup, ResolvedSnapshot } from "./kit.js";
import { runRotations } from "./rotation.js";
import { damage, mvPercent } from "./damage.js";
import { armTuneBreak } from "../shared/tunebreak.js";
import type { Report } from "./display.js";
import { LOADOUTS } from "./teams.js";
import type { LoadoutName } from "./teams.js";

export interface Member {
  name: string;
  color: string;
  loadout: Loadout;
  /** Whether this member is *this team's* main damage dealer — the "Show MDPS Weapons/Echoes" vs
   *  "Show Support Weapons/Echoes" checkboxes key off this to decide which member's own combos
   *  get expanded by default (index.ts's own comparisonTable()). Set per team from teams.ts's own
   *  `TeamEntry.dpsIndex`, not stamped onto the shared `Loadout` — the same loadout can be a fixed
   *  support in one team and someone's main DPS in another. */
  mainDps: boolean;
}

/** name/color both come straight off the loadout's own resonator — nothing here retypes them, and
 *  nothing here needs its own import of the resonator itself, just its loadout. Opener/loop
 *  rotation and weapon/echo choice all live on the loadout itself too (kit.ts's own `Loadout`) —
 *  see `combosFor()`/`runTeam()` below for how a team is actually assembled and run. */
export const member = (loadout: Loadout, mainDps = false): Member =>
  ({ name: loadout.resonator.name, color: loadout.resonator.color, loadout, mainDps });


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
export function sequenceLevels(m: Member, filters: Filters): number[] {
  const l = m.loadout;
  const max = l.sequences.length;
  if (!max) return [0];
  // a standard character's chain comes with the character rather than being pulled for, so there's
  // no partial level worth comparing — they only ever run at full, box or no box
  if (l.resonator.standardCharacter) return [max];
  return (m.mainDps ? filters.mdpsSequences : filters.supportSequences)
    ? Array.from({ length: max + 1 }, (_, i) => i)
    : [0];
}

/** Which of a loadout's own weapons this role may actually run right now — everything when its R1
 *  allowance is on, standard weapons only when it isn't (weapons/standard.ts, every generation —
 *  see kit.ts's own `Weapon.standard`). A signature is only ever owned at R1, so a role that
 *  hasn't been given that allowance never even simulates one. Empty means the whole team drops
 *  out of the table, same as it always has.
 *
 *  With that role's weapons box closed, just the first of those: a loadout lists its best
 *  signature first and its best standard weapon right after (see CLAUDE.md), and a closed box
 *  takes that on trust rather than searching — the search only runs for a box that will show
 *  its alternatives. */
export function eligibleWeapons(m: Member, filters: Filters): number[] {
  const l = m.loadout;
  const allowR1 = m.mainDps ? filters.allowR1Mdps : filters.allowR1Supports;
  const eligible = l.weapons.map((_, i) => i).filter((i) => allowR1 || l.weapons[i]!.standard);
  return (m.mainDps ? filters.mdpsWeapons : filters.supportWeapons) ? eligible : eligible.slice(0, 1);
}

/**
 * Every team's own best build per member, found once and cached — this is what an axis whose
 * "Show ... Options" box is *closed* collapses to, so a closed axis shows the best pick rather
 * than whatever happened to be listed first.
 *
 * Echoes and main stats are searched in full for every member, whatever the boxes say. Weapons
 * are searched only for a role whose weapons box is open, and only among the picks that role may
 * actually hold (see `eligibleWeapons()`) — a closed box runs the loadout's own presumed best. A
 * signature stays out of the search entirely until its R1 allowance is given. Sequences are not
 * searched: a chain node is
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

// team-scoped as well as combo-scoped: the reset is per team, but the same combo string means
// different loadouts under a different team, so keying on it alone would be a footgun for any
// future caller that forgets to clear
const trialKey = (teamKey: string, combo: Combo[]): string => `${teamKey}-${combo.map((c) => c.key).join("-")}`;

function trialRun(teamKey: string, members: Member[], picks: Pick[]): TeamRun {
  const combo = members.map((m, i) => comboOf(m.loadout, picks[i]!));
  const key = trialKey(teamKey, combo);
  let hit = trialCache.get(key);
  if (!hit) trialCache.set(key, hit = runTeam(teamKey, members, combo));
  return hit;
}

/**
 * Every main stat of each member in `who`, scored under `picks`, in one run: the build as picked
 * is run for real, and every other main stat of those members rides along as a variant the engine
 * re-scores on that member's own actions alone (kit.ts's own `TeamMember.variants`) — a main stat
 * only ever feeds its wearer, so nothing else in the fight is different. A whole list costs a
 * fraction of a run rather than a run apiece, which was 91% of every run this search made.
 *
 * Anything the engine can't vouch for (a variant whose hooks would have changed the fight — see
 * `variantUnsafe`) is scored with a real run instead, so the answer is the one the runs would have
 * given. Every score is filed into `trialCache` under the build it describes, so the winner is
 * already scored when the caller moves on to it.
 *
 * @returns per member in `who`, a `TeamRun` per main-stat index of theirs
 */
function scoreMainstats(teamKey: string, members: Member[], picks: Pick[], who: number[]): Map<number, TeamRun[]> {
  const alts = members.map((m, i) => (who.includes(i)
    ? m.loadout.mainstats.map((_, k) => k).filter((k) => k !== picks[i]!.mainstat) : null));
  const combo = members.map((m, i) => comboOf(m.loadout, picks[i]!));
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

/**
 * Each of `who`'s own best main stat under `picks`, everyone else's left exactly as given — one
 * run for the whole set (see `scoreMainstats()`), each member scored on their own damage out of
 * `bySlot` rather than the team total, which is what makes one member's answer independent of the
 * rest (see `optimizeTeam()`).
 */
function bestMainstats(teamKey: string, members: Member[], picks: Pick[], who: number[]): Pick[] {
  const scores = scoreMainstats(teamKey, members, picks, who);
  return picks.map((p, i) => {
    if (!who.includes(i)) return p;
    let index = p.mainstat, best = -Infinity;
    scores.get(i)!.forEach((run, k) => {
      const damage = run.bySlot.get(members[i]!.name) ?? 0;
      if (damage > best) { best = damage; index = k; }
    });
    return index === p.mainstat ? p : { ...p, mainstat: index };
  });
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
  const scores = scoreMainstats(teamKey, members, picks, [i]).get(i)!;
  let winner = picks[i]!.mainstat;
  let best = -Infinity;
  let total = 0;
  scores.forEach((run, m) => {
    const damage = run.bySlot.get(members[i]!.name) ?? 0;
    if (damage > best) { best = damage; winner = m; total = run.total; }
  });
  return { mainstat: winner, total };
}

export function optimizeTeam(teamKey: string, members: Member[], filters: Filters): Pick[] {
  const picks: Pick[] = members.map((m) => ({
    weapon: eligibleWeapons(m, filters)[0] ?? 0, echo: 0, mainstat: 0,
    // the level a closed box would show — the search never varies it, the row set does
    sequence: sequenceLevels(m, filters)[0]!,
  }));
  const run = (): TeamRun => trialRun(teamKey, members, picks);

  /** Every member's own main stats at once, in one run — see this function's own header on why
   *  that's sound, and `scoreMainstats()` for how. */
  const sweepMainstats = (): boolean => {
    const next = bestMainstats(teamKey, members, picks, members.map((_, i) => i));
    const changed = next.some((p, i) => p.mainstat !== picks[i]!.mainstat);
    next.forEach((p, i) => { picks[i] = p; });
    return changed;
  };

  /** One member's own list at a time on a cross-member axis, the rest of the team held still,
   *  scored on the team total — `options` is that member's own candidates, `axis` which field of
   *  their `Pick` each one sets. */
  const sweepAcross = (axis: "weapon" | "echo", options: (m: Member) => number[]): boolean => {
    let changed = false;
    let best = run().total;
    for (let i = 0; i < members.length; i++) {
      const home = picks[i]!;
      let winner = home;
      for (const option of options(members[i]!)) {
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

  // One simultaneous main-stat pass to start every member off somewhere sane, then the two
  // cross-member axes, which re-roll the member they're sweeping as they go.
  //
  // The closing pass is for everyone *else*: a main stat only ever feeds its wearer, but what a
  // teammate wears still moves which roll is best for them (an ATK% sonata handed over on Outro
  // shifts a member off ATK and onto their element), and the sweeps above only re-roll whoever's
  // own axis is being swept. It costs about one run — every member's whole list rides along in it
  // (see `scoreMainstats()`) — so it runs until nothing moves rather than being skipped.
  sweepMainstats();
  for (let round = 0; round < 3; round++) {
    const weapons = sweepAcross("weapon", (m) => eligibleWeapons(m, filters));
    const echoes = sweepAcross("echo", (m) => m.loadout.echoLoadouts.map((_, i) => i));
    if (!weapons && !echoes) break;
    if (!sweepMainstats()) break;
  }
  return picks;
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
  /** Per member, per main-stat variant they were run with (see `runTeam()`'s `variants`): the same
   *  figures as above for the build wearing that main stat instead. Empty for a member run
   *  without any. */
  variantRuns: VariantRun[][];
  /** The detail page's own rich report — every row's hover-trace panel data (`buildReport()`, see
   *  display.ts's own rowValues()/tracing()) — built once, the first time this team is actually
   *  opened, and cached here so revisiting it costs nothing. See `detailFor()`. */
  detail?: { report: Report };
}

/** One main-stat alternative's own figures out of a run that scored it as a variant — what a
 *  comparison-table row reads off a `TeamRun`, plus whether the engine could vouch for it (see
 *  kit.ts's own `TeamMember.variantUnsafe`). */
export interface VariantRun {
  total: number;
  bySlot: Map<string, number>;
  sectionTotals: number[];
  sectionBySlot: Map<string, number>[];
  unsafe: boolean;
}

const toLine = (snap: ResolvedSnapshot): ChainGroup =>
  ({ id: snap.action.name, isChain: false, parts: [], snap, mv: mvPercent(snap), avg: damage(snap).avg });

/**
 * One section's snapshots as the lines the report draws: an ordinary cast is its own line, and an
 * ActionGroup's members fold into one (kit.ts's own `ActionGroup`).
 *
 * A group line reports the members' summed motion value and summed damage, but carries the *last*
 * member's snapshot: every stat column and every stat hover on it is that final cast's, which is
 * the one honest answer — a stat line is a moment, and summing or averaging three of them would
 * describe no moment the fight ever had. The columns that genuinely do accumulate (mv, the three
 * resources, the forte gauges) are recombined across every member instead, in display.ts.
 *
 * `parts` is the whole span in the order it actually resolved, members and the follow-ups queued
 * between them alike — that is what the opened group shows. Those follow-ups are *also* emitted as
 * lines of their own, flagged `spill`: they are separate damage and every total has to count them,
 * so they stay lines rather than being folded in, and the report merely tucks them under the group
 * while it is collapsed.
 */
function toLines(snaps: ResolvedSnapshot[]): ChainGroup[] {
  const lines: ChainGroup[] = [];
  for (let i = 0; i < snaps.length;) {
    const head = snaps[i]!;
    if (!head.group) { lines.push(toLine(head)); i++; continue; }
    const parts: ChainGroup["parts"] = [];
    const members: ResolvedSnapshot[] = [], extras: ResolvedSnapshot[] = [];
    let mv = 0, avg = 0, j = i;
    for (; j < snaps.length; j++) {
      const snap = snaps[j]!;
      const dmg = damage(snap);
      parts.push({ snap, dmg });
      // `groupEnd`, not "the group changed": a rotation may press the same group twice in a row,
      // and the flag is what tells the second press from more of the first
      if (snap.group === head.group) {
        members.push(snap);
        mv += mvPercent(snap);
        avg += dmg.avg;
        if (snap.groupEnd) { j++; break; }
      } else extras.push(snap);
    }
    lines.push({
      id: head.group.name, isChain: true, parts, members,
      snap: members[members.length - 1]!, mv, avg,
    });
    for (const snap of extras) lines.push({ ...toLine(snap), spill: true });
    i = j;
  }
  return collapseRepeats(lines);
}

/**
 * Fold a run of the same triggered hit into one row: ten Glacio Chafe rungs off a single cast read
 * as `Glacio Chafe - 13 Stacks x10` rather than ten rows that say the same thing.
 *
 * Only ever *triggered* rows, and only ones that are genuinely the same cast on the same slot,
 * back to back — a rotation beat is never folded away, and two different rungs of a ramping status
 * stay apart because they really are different multipliers. The folded row is triggered itself, so
 * it keeps the dimmed, thin treatment its members had.
 *
 * Everything else works exactly as an ActionGroup's row does: summed motion value and damage, the
 * last member's stat line, every member's resource rows laid end to end, and the individual hits
 * still there under the caret. A line already folded (an ActionGroup) is left alone.
 */
function collapseRepeats(lines: ChainGroup[]): ChainGroup[] {
  const out: ChainGroup[] = [];
  for (let i = 0; i < lines.length;) {
    const head = lines[i]!;
    const snap = head.snap;
    let j = i + 1;
    if (!head.isChain && snap.triggered) {
      while (j < lines.length) {
        const next = lines[j]!;
        if (next.isChain || !next.snap.triggered || !!next.spill !== !!head.spill) break;
        if (next.snap.action !== snap.action || next.snap.slot !== snap.slot) break;
        j++;
      }
    }
    if (j - i < 2) { out.push(head); i++; continue; }
    const run = lines.slice(i, j);
    out.push({
      id: `${snap.action.name} x${run.length}`,
      isChain: true,
      parts: run.map((l) => ({ snap: l.snap, dmg: { avg: l.avg } })),
      members: run.map((l) => l.snap),
      snap: run[run.length - 1]!.snap,
      mv: run.reduce((n, l) => n + l.mv, 0),
      avg: run.reduce((n, l) => n + l.avg, 0),
      spill: head.spill,
    });
    i = j;
  }
  return out;
}

/** One section's own grand total and per-member sum, read straight off its resolved lines — the
 *  same "no motion value means no damage" rule `display.ts`'s own rowValues() applies (`line.mv`
 *  is already `mvPercent(snap)`, from `toLine()` above), just without building a whole report to
 *  get there. `avgOf` is which damage a line counts for — its own, or one variant's. */
function sumSection(lines: ChainGroup[], avgOf: (line: ChainGroup) => number): { total: number; bySlot: Map<string, number> } {
  const bySlot = new Map<string, number>();
  let total = 0;
  for (const line of lines) {
    if (line.mv === 0) continue;
    // `.slot`, not `.member`: they're the same for every ordinary action, but a tune break carries
    // its own bucket (tunebreak.ts's own `TUNE_BREAK_SLOT`, declared on the action itself) so the
    // team's shared bar going off doesn't land on whichever resonator happened to be on field.
    // display.ts's own `totalsBySlot()` groups the detail page the same way.
    const slot = (line.snap as ResolvedSnapshot).slot;
    const avg = avgOf(line);
    bySlot.set(slot, (bySlot.get(slot) ?? 0) + avg);
    total += avg;
  }
  return { total, bySlot };
}

/** The comparison table's own figures over all four sections: the plain mean of each section's
 *  grand total / per-member total, the opener counting exactly as much as a single loop pass. */
function sumRun(rotationLines: ChainGroup[][], avgOf: (line: ChainGroup) => number) {
  let total = 0;
  const bySlot = new Map<string, number>();
  const sectionTotals: number[] = [];
  const sectionBySlot: Map<string, number>[] = [];
  for (const lines of rotationLines) {
    const section = sumSection(lines, avgOf);
    sectionTotals.push(section.total);
    sectionBySlot.push(section.bySlot);
    total += section.total / rotationLines.length;
    for (const [slot, v] of section.bySlot) bySlot.set(slot, (bySlot.get(slot) ?? 0) + v / rotationLines.length);
  }
  return { total, bySlot, sectionTotals, sectionBySlot };
}

/** @param trace  capture the report's own per-entry trace and keep the resolved lines — off for
 *  the comparison table's own bulk pass (see kit.ts's own `setTracing`), on for the single team
 *  whose detail page is being rendered.
 *  @param variants  per member, the main-stat Buffs to score as variants of the build in `combo`
 *  (kit.ts's own `TeamMember.variants`) — see `scoreMainstats()`. Not with `trace`. */
export function runTeam(teamKey: string, members: Member[], combo: Combo[], trace = false, variants: (Buff[] | null)[] | null = null): TeamRun {
  setTracing(trace);
  try {
    return runTeamInner(teamKey, members, combo, trace, variants);
  } finally {
    setTracing(false);
  }
}

function runTeamInner(teamKey: string, members: Member[], combo: Combo[], trace: boolean, variants: (Buff[] | null)[] | null): TeamRun {
  const state = new State(members.map((m) => m.name));
  members.forEach((m, i) => {
    state.active = i;
    withTeam(state, () => { for (const g of m.loadout.pieces(combo[i]!.weapon, combo[i]!.echo, combo[i]!.mainstat, combo[i]!.sequence)) equip(g, 1); });
    const alts = variants?.[i];
    if (alts?.length) {
      const slot = state.slots[i]!;
      slot.variantOf = combo[i]!.mainstat;
      slot.variants = alts;
      slot.variantBase = alts.map(() => new Map());
      slot.variantUnsafe = alts.map(() => false);
    }
  });
  state.active = 0;
  // the shared off-tune bar's own watcher, put on the target the same way everyone's gear was just
  // put on them — it fires the Tune Break itself from there, and is the only thing that knows how
  // (see tunebreak.ts). This is the one file every path that runs a team goes through.
  withTeam(state, armTuneBreak);

  // Four sections: the opener and three loops, exactly what the report's own columns show. The
  // scheduler runs one continuous fight rather than four separate passes (rotation.ts) and cuts a
  // section every time the last slot outros — one full trip round the team — so a loop-only
  // buff/gauge that hasn't settled by the first trip still gets three more to reach steady state.
  const rotationLines = runRotations(state, members.map((m) => m.loadout.rotation), 4).map(toLines);

  // The comparison table (not the detail page's own action table) only ever needs a grand total
  // and a per-member sum. Read straight off the resolved lines rather than through buildReport(),
  // which also builds every row's own hover-trace panel data purely for the detail page — the
  // bulk of a team run's own cost, for data this table never reads. See `detailFor()` below for
  // where that actually gets built.
  const { total, bySlot, sectionTotals, sectionBySlot } = sumRun(rotationLines, (line) => line.avg);
  // ...and the same again per variant, counting a varied member's own actions at that variant's
  // damage and everyone else's as they were
  const variantRuns = members.map((m, i) => (variants?.[i] ?? []).map((_, v) => ({
    ...sumRun(rotationLines, (line) => {
      const snap = line.snap as ResolvedSnapshot;
      return snap.member === m.name && snap.variantAvg !== null ? snap.variantAvg[v]! : line.avg;
    }),
    unsafe: state.slots[i]!.variantUnsafe[v]!,
  })));

  return { state, teamKey, members, combo, rotationLines: trace ? rotationLines : null, total, bySlot, sectionTotals, sectionBySlot, variantRuns };
}


/** Resolve a team from the loadout names a worker was handed (see teams.ts) — a `Loadout` is
 *  closures all the way down, so it can't cross a postMessage; its name can. `dpsIndex` travels
 *  alongside since which member is the main DPS is a per-team fact (teams.ts's own
 *  `TeamEntry.dpsIndex`), not something the resolved `Loadout` itself carries. */
export const teamFromNames = (names: LoadoutName[], dpsIndex: number): Member[] =>
  names.map((n, i) => member(LOADOUTS[n], i === dpsIndex));

/** Every whole-team combo of `lists`' own picks — `lists[0]`'s every entry against `lists[1]`'s
 *  every entry against ..., the plain N-way cartesian product, with no pruning of its own: the
 *  page's own row cap is what keeps this from running away (index.ts's own `ROW_CAP`). */
function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((picked) => list.map((item) => [...picked, item])), [[]]);
}

/** How many main-stat rows an open box actually opens per build: the best few for that build, not
 *  the whole list. A loadout carries every roll worth simulating, but the tail of that list is
 *  rolls the build plainly doesn't want — rows nobody reads, crossed against every other member's
 *  own tail. The cut is per build, not per team, so a weapon that wants a different roll still
 *  shows it (see `rowPicks()`). */
export const MAINSTAT_ROWS = 9;

/** One member's own weapon/echo pick indices to cross into the team-wide product below — every
 *  option on an axis whose box is open for this member's own role, just their best pick's own
 *  index on one that's closed. Neither main stat nor sequence is here: main stats are picked per
 *  build once the cross is known, and sequence stays a separate, un-crossed variation (both in
 *  `rowPicks()`), same as neither getting crossed into the table's own columns. */
function buildsOf(m: Member, home: Pick, f: Filters): Pick[] {
  const l = m.loadout;
  const mdps = m.mainDps;
  const weapons = (mdps ? f.mdpsWeapons : f.supportWeapons) ? eligibleWeapons(m, f) : [home.weapon];
  const echoes = (mdps ? f.mdpsEchoes : f.supportEchoes) ? l.echoLoadouts.map((_, i) => i) : [home.echo];
  const picks: Pick[] = [];
  for (const weapon of weapons) for (const echo of echoes) picks.push({ ...home, weapon, echo });
  return picks;
}

/**
 * Every row the comparison table will show for this team — the whole-team cross of each member's
 * own weapon/echo candidates, plus one row per sequence level, un-crossed (a chain node is never a
 * trade-off against anything, so it varies on its own while every other axis sits at its best
 * pick) — and then, for each of those builds, the echo and main stats to show it wearing.
 *
 * A closed echo box is re-searched per build (`pinEchoes` below) for the same reason a closed
 * main-stat box is: its pick came out of the team's own best build, and the sonata that build
 * wanted need not be what a different weapon wants.
 *
 * Main stats are answered per build rather than crossed in blind, because they are the one axis
 * whose whole list can be scored in a single run (see `scoreMainstats()`):
 *
 * - **Box closed** — the build shows one roll, and the only honest one is the one it actually
 *   wants. Judging a worse weapon in the *winner's* rolls measures it wearing gear picked for
 *   something else and reports it as worse than it is, the same reason `sweepAcross()` re-rolls
 *   every candidate before scoring it.
 * - **Box open** — the build's own best `MAINSTAT_ROWS` get a row each, crossed against whoever
 *   else has their box open. The rest of the list is rolls that build doesn't want, and dropping
 *   them is what keeps a couple of open boxes from multiplying a whole list into every other
 *   member's whole list.
 */
function rowPicks(teamKey: string, members: Member[], best: Pick[], filters: Filters): Pick[][] {
  const boxOpen = (i: number): boolean =>
    (members[i]!.mainDps ? filters.mdpsMainstats : filters.supportMainstats);
  const open = members.map((_, i) => i).filter(boxOpen);
  const closed = members.map((_, i) => i).filter((i) => !boxOpen(i));

  // A closed box settles rather than sweeping once: nobody's main stat moves anyone else's damage,
  // but what a *teammate* rolls changes the buffs they hand over, so one member landing somewhere
  // new can move the next. Three rounds at most, the same ceiling the search itself uses.
  const settle = (picks: Pick[]): Pick[] => {
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

  // A closed echo box has the same problem a closed main-stat box does, one axis up: its pick is
  // whatever the team's own best build settled on, and the best sonata for *that* weapon need not
  // be the best one for this build's. So each build re-searches it — every echo of every member
  // whose box is closed, one member at a time with the rest held still, each candidate re-rolled
  // onto its own best main stat and scored on the team total: `sweepAcross()`'s own pass, run
  // again inside a build the search itself never visited.
  const closedEchoes = members
    .map((m, i) => ((m.mainDps ? filters.mdpsEchoes : filters.supportEchoes) ? -1 : i))
    .filter((i) => i >= 0);
  const pinEchoes = (picks: Pick[]): Pick[] => {
    let out = picks;
    for (const i of closedEchoes) {
      const home = out[i]!;
      let winner = home;
      let best = bestMainstatFor(teamKey, members, out, i).total;
      members[i]!.loadout.echoLoadouts.forEach((_, echo) => {
        if (echo === home.echo) return;
        const trial = out.map((p, j) => (j === i ? { ...home, echo } : p));
        const rerolled = bestMainstatFor(teamKey, members, trial, i);
        if (rerolled.total > best) { best = rerolled.total; winner = { ...home, echo, mainstat: rerolled.mainstat }; }
      });
      out = out.map((p, j) => (j === i ? winner : p));
    }
    return out;
  };

  const builds = cartesian(members.map((m, i) => buildsOf(m, best[i]!, filters)));
  members.forEach((m, i) => {
    for (const sequence of sequenceLevels(m, filters)) {
      builds.push(best.map((p, j) => (j === i ? { ...p, sequence } : p)));
    }
  });
  // deduped before anything is run: a sequence variation at the level a closed box already shows
  // is the cross's own build again, and every build below costs at least one run
  const seen = new Map<string, Pick[]>();
  for (const picks of builds) {
    const key = picks.map((p) => `${p.weapon}.${p.echo}.s${p.sequence}`).join("-");
    if (!seen.has(key)) seen.set(key, picks);
  }

  const rows: Pick[][] = [];
  for (const build of seen.values()) {
    const settled = settle(pinEchoes(build));
    if (!open.length) { rows.push(settled); continue; }
    // one run scores every open member's whole list at once, so the cut costs no more than
    // knowing the single best would have
    const scores = scoreMainstats(teamKey, members, settled, open);
    const top = new Map<number, number[]>();
    for (const i of open) {
      const ranked: { mainstat: number; damage: number }[] = [];
      scores.get(i)!.forEach((run, k) => ranked.push({ mainstat: k, damage: run.bySlot.get(members[i]!.name) ?? 0 }));
      ranked.sort((a, b) => b.damage - a.damage);
      top.set(i, ranked.slice(0, MAINSTAT_ROWS).map((r) => r.mainstat));
    }
    for (const mainstats of cartesian(members.map((_, i) => top.get(i) ?? [settled[i]!.mainstat]))) {
      rows.push(settled.map((p, i) => ({ ...p, mainstat: mainstats[i]! })));
    }
  }
  return rows;
}

/** One team's whole optimization pass — the unit of parallel work: the best build per member
 *  (what a closed axis shows), and every row the table will open for it, each already re-rolled
 *  onto the main stats that build wants (see `rowPicks()`). */
export function solveTeam(teamKey: string, members: Member[], filters: Filters): Solved {
  trialCache = new Map();
  const picks = optimizeTeam(teamKey, members, filters);
  const rows = rowPicks(teamKey, members, picks, filters);
  trialCache = new Map();   // a TeamRun holds a whole State; don't keep 80 of them alive
  return { picks, rows };
}

/* ------------------------------------------------------------------ worker protocol */

/** One team handed to a worker. Members travel as loadout *names* (see `teamFromNames()`), and the
 *  filter flags travel with them since a worker can't see the page's own state. `dpsIndex` is that
 *  team's own main-DPS position (teams.ts's own `TeamEntry.dpsIndex`). */
export interface SolveRequest { id: number; teamKey: string; loadouts: LoadoutName[]; dpsIndex: number; filters: Filters }

/** One team's solved answer: its best build per member, and the picks for every row the table will
 *  show it as (see `rowPicks()`). */
export interface Solved { picks: Pick[]; rows: Pick[][] }

/** What comes back — small, plain data: gear *indices*, nothing engine-shaped. The main thread
 *  turns these back into real gear with `comboOf()` and runs the handful of rows the table
 *  actually shows itself. */
export interface SolveResponse extends Solved { id: number }

/**
 * This module is also the worker entry point itself — index.ts's own `workerPool()` spawns
 * `src/solver.js`, and on the main thread it imports the very same file. Deliberately thin: all
 * the actual work is `solveTeam()` above, which the fallback path calls directly here on the main
 * thread, so there is only one implementation of the search to keep correct.
 *
 * `document` is the test rather than anything worker-shaped, because that's the one thing a worker
 * scope definitively lacks: on the main thread `self` is the window and the handler is simply
 * never installed, so importing this module can't hand the page a `postMessage` listener it never
 * asked for.
 */
if (typeof document === "undefined") {
  // `self` is typed as a Window by the DOM lib this project compiles against; inside a worker it
  // is a DedicatedWorkerGlobalScope, and the two disagree on `postMessage`'s signature. Narrowed
  // to the two members actually used rather than pulling the WebWorker lib in for the whole project.
  const ctx = self as unknown as {
    onmessage: ((e: MessageEvent<SolveRequest>) => void) | null;
    postMessage: (message: SolveResponse) => void;
  };
  ctx.onmessage = ({ data }) => {
    const solved = solveTeam(data.teamKey, teamFromNames(data.loadouts, data.dpsIndex), data.filters);
    ctx.postMessage({ id: data.id, ...solved });
  };
}
